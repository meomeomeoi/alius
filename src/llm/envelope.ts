import type { Registries } from '../content/types';
import type { Action, EngineEvent } from '../engine/dispatch';
import { openRecords, recordFor } from '../engine/generations';
import type { CampaignState, GenerationRecord } from '../engine/state/types';
import type { AliusSettings } from '../settings';
import type { StAdapter } from '../st/adapter';
import { describeFailure } from './describe';
import { callLlm, compileRefusals, type FailReason, type RefusalPattern } from './orchestrator';
import { generationSite, type SiteDecl } from './sites';

// P14: the one place that asks the model. Every generation of Alius runs through `generate`: it builds the input, calls the model,
// classifies a failure, applies a success through the site's own handlers and keeps a small record (no prompt, no model text) so the
// player can see what failed and run it again. It is the only module that imports `callLlm` (an architecture test enforces it).

/** What the envelope needs from the app: it never imports `src/app.ts`. */
export interface EnvelopeHost {
  st: StAdapter;
  settings(): AliusSettings;
  registries(): Registries;
  /** The open campaign (null when none). */
  state(): CampaignState | null;
  /** The id of the open chat; an answer that arrives in another chat is dropped. */
  chatId(): string | undefined;
  dispatch(action: Action, opts?: { expectChatId?: string }): EngineEvent[];
  /** Puts `snap` back as the campaign, but only while the current state is still `expected`. */
  restoreSnapshot(snap: CampaignState, expected: CampaignState): boolean;
  contentLine(): string;
  toast(kind: 'info' | 'warn' | 'error', text: string): void;
}

/** What the owning controller binds for a site; the declaration (`SiteDecl`) says what the site is, this says how it runs. */
export interface SiteHandlers<I, V> {
  /** Rebuilds the input from the state and the chat. `{ expired }` says the moment has passed (the scene closed, the decision was made). */
  build(key: string): I | { expired: string } | Promise<I | { expired: string }>;
  /** The model's answer to the value `apply` takes; null means it does not fit (an `invalid_output`). Default: the answer as it is. */
  parse?(raw: unknown, input: I): V | null;
  /** What the caller did with a success. `rejected` counts as an invalid attempt (the engine said no); `stale` drops the answer silently. */
  apply(key: string, value: V, input: I): 'ok' | { rejected: string } | { stale: true };
  /** The site's fail-soft result (a template text, the authored block); true when it ran. */
  fallback?(key: string, input: I | null): boolean;
  /** `before_commit` and `free`: why the result can no longer be replaced, or null. */
  committed?(key: string): string | null;
  /** `revert` with a snapshot of its own: why the last application cannot be undone now, or null. The envelope never undoes without it. */
  canUndo?(key: string): string | null;
  /** `revert` with a snapshot of its own: undoes the last application; why not, or null when undone. */
  undo?(key: string): string | null;
}

export type GenerationOutcome<V> =
  | { kind: 'applied'; value: V }
  | { kind: 'failed'; reason: FailReason; detail: string; recordId?: string; fallbackApplied: boolean }
  | { kind: 'expired'; why: string }
  | { kind: 'stale' }
  | { kind: 'unbound' };

export interface GenerateOpts {
  budgetMult?: number;
  profile?: 'main' | 'mechanic';
  /** The failure is reported in the outcome only (the setup wizard shows its own reason: there is no campaign yet). */
  noRecord?: boolean;
}

export interface Envelope {
  bind<I, V>(siteId: string, handlers: SiteHandlers<I, V>): void;
  generate<V>(siteId: string, key: string, opts?: GenerateOpts): Promise<GenerationOutcome<V>>;
  /** Runs a failed record again (the same site and key; the input is rebuilt). */
  retry(recordId: string, opts?: { budgetMult?: number; profile?: 'main' | 'mechanic' }): Promise<GenerationOutcome<unknown>>;
  /** Replaces a result the player did not like, where the site's mode allows it. */
  reroll(siteId: string, key: string): Promise<GenerationOutcome<unknown>>;
  rerollState(siteId: string, key: string): { enabled: boolean; reason?: string };
  /** The player gives the record up. */
  drop(recordId: string): void;
  /** Runs the site's own fallback for the record (the held director plan) and closes it as `kept_fallback`. */
  useFallback(recordId: string): Promise<void>;
  /** Remembers the state before and after a `revert` site applied its result (the last application only, one per site). */
  takeSnapshot(siteId: string, key: string, before: CampaignState, after: CampaignState): void;
  clearSnapshots(): void;
}

export const MOVED_REASON = 'Something happened since: this can no longer be rerolled.';
const NONE_REASON = 'This cannot be rerolled.';
const BUDGET_GROWTH = 1.5;

interface Snapshot { chatId: string | undefined; key: string; before: CampaignState; after: CampaignState }

export function createEnvelope(host: EnvelopeHost): Envelope {
  const handlers = new Map<string, SiteHandlers<any, any>>();
  const snapshots = new Map<string, Snapshot>();
  const inflight = new Set<string>();
  let compiled: { reg: Registries; patterns: RefusalPattern[] } | null = null;

  const refusals = (): RefusalPattern[] => {
    const reg = host.registries();
    if (compiled?.reg !== reg) compiled = { reg, patterns: compileRefusals(reg) };
    return compiled.patterns;
  };

  const record = (siteId: string, key: string): GenerationRecord | undefined => {
    const s = host.state();
    return s ? recordFor(s, siteId, key) : undefined;
  };

  /** Expires the open record of a key (when there is one): the moment it was about to retry has passed. */
  const expire = (siteId: string, key: string, why: string, chatId: string | undefined): void => {
    const rec = record(siteId, key);
    if (rec && rec.status === 'open') host.dispatch({ type: 'generation/expire', payload: { id: rec.id, why } }, { expectChatId: chatId });
  };

  const closeKey = (siteId: string, key: string, outcome: 'applied' | 'dropped' | 'kept_fallback', chatId: string | undefined): void => {
    const s = host.state();
    if (s && openRecords(s, { siteId }).some((r) => r.key === key)) {
      host.dispatch({ type: 'generation/close', payload: { siteId, key, outcome } }, { expectChatId: chatId });
    }
  };

  const unitLabel = (site: SiteDecl, key: string): string => site.label(host.state(), key);

  async function run<V>(
    siteId: string, key: string, opts: GenerateOpts & { skipFallback?: boolean },
  ): Promise<GenerationOutcome<V>> {
    const site = generationSite(siteId);
    const h = handlers.get(siteId);
    if (!site || !h) return { kind: 'unbound' };
    const flight = `${siteId}:${key}`;
    if (inflight.has(flight)) return { kind: 'stale' };
    inflight.add(flight);
    try {
      const chatId = host.chatId();
      const settings = host.settings();
      const first = await h.build(key);
      if (isExpired(first)) {
        expire(siteId, key, first.expired, chatId);
        return { kind: 'expired', why: first.expired };
      }
      let input = first;
      const mult = opts.budgetMult ?? 1;
      const budgetLimit = 1 + settings.autoRetry;
      let attempts = 0;
      let factor = mult;
      let last: { reason: FailReason; detail: string; at: number; budget: number } | null = null;
      let value: unknown;
      let applied = false;

      // a rejected apply is one more attempt inside the automatic retries
      while (attempts < budgetLimit) {
        const left = budgetLimit - attempts;
        const r = await callLlm(site.callType, input, { st: host.st, settings: { ...settings, autoRetry: (left - 1) as AliusSettings['autoRetry'] }, contentLine: host.contentLine, refusals: refusals() }, { budgetMult: factor, profile: opts.profile });
        attempts += r.attempts;
        if (host.chatId() !== chatId) return { kind: 'stale' }; // the chat changed while the model was writing
        if (!r.ok) {
          last = { reason: r.reason, detail: r.detail, at: r.at, budget: r.budget };
          break;
        }
        const parsed = h.parse ? h.parse(r.value, input) : r.value;
        if (parsed === null) {
          last = { reason: 'invalid_output', detail: 'the answer did not fit the form', at: r.at, budget: 0 };
          break;
        }
        // the moment may have passed while the model was writing
        const again = await h.build(key);
        if (host.chatId() !== chatId) return { kind: 'stale' };
        if (isExpired(again)) {
          expire(siteId, key, again.expired, chatId);
          return { kind: 'expired', why: again.expired };
        }
        input = again;
        const done = h.apply(key, parsed, input);
        if (done === 'ok') {
          value = parsed;
          applied = true;
          break;
        }
        if ('stale' in done) return { kind: 'stale' };
        last = { reason: 'invalid_output', detail: done.rejected, at: r.at, budget: 0 };
        factor *= BUDGET_GROWTH;
        // loop: another attempt while the automatic retries last
      }

      if (applied) {
        closeKey(siteId, key, 'applied', chatId);
        return { kind: 'applied', value: value as V };
      }
      return fail<V>(site, h, key, input, last!, attempts, mult, chatId, opts);
    } finally {
      inflight.delete(flight);
    }
  }

  function fail<V>(
    site: SiteDecl, h: SiteHandlers<any, any>, key: string, input: unknown, last: { reason: FailReason; detail: string; at: number; budget: number },
    attempts: number, mult: number, chatId: string | undefined, opts: GenerateOpts & { skipFallback?: boolean },
  ): GenerationOutcome<V> {
    const existing = record(site.id, key);
    const open = existing?.status === 'open' ? existing : undefined;
    // one toast while a chip of the site is already up: a failing model does not shout at every exchange
    const siteHadOpen = host.state() !== null && openRecords(host.state()!, { siteId: site.id }).length > 0;
    let fallbackApplied = open?.fallbackApplied === true;
    if (!fallbackApplied && !opts.skipFallback && h.fallback) fallbackApplied = h.fallback(key, input) === true;
    const writes = !opts.noRecord && last.reason !== 'no_profile' && site.record !== 'none' && !(fallbackApplied && site.reroll === 'none');
    let recordId: string | undefined;
    if (writes) {
      host.dispatch({
        type: 'generation/failed',
        payload: {
          siteId: site.id, key, reason: last.reason, detail: last.detail, attempts: Math.max(1, attempts), at: last.at, budgetMult: mult,
          ...(fallbackApplied ? { fallbackApplied: true } : {}), ...(site.record === 'quiet' ? { quiet: true } : {}),
        },
      }, { expectChatId: chatId });
      recordId = record(site.id, key)?.id;
      if (site.record === 'full' && !siteHadOpen) {
        host.toast('warn', describeFailure({ label: unitLabel(site, key), reason: last.reason, budget: last.budget, timeoutMs: host.settings().llmTimeoutMs }));
      }
    }
    return { kind: 'failed', reason: last.reason, detail: last.detail, ...(recordId !== undefined ? { recordId } : {}), fallbackApplied };
  }

  /** Puts the state back from the envelope's own snapshot; why not, or null when done. */
  function undoSnapshot(siteId: string, key: string): string | null {
    const snap = snapshots.get(siteId);
    if (!snap || snap.key !== key || snap.chatId !== host.chatId()) return 'There is nothing to restore.';
    if (!host.restoreSnapshot(snap.before, snap.after)) return MOVED_REASON;
    snapshots.delete(siteId);
    return null;
  }

  const isExpired = (v: unknown): v is { expired: string } =>
    typeof v === 'object' && v !== null && typeof (v as { expired?: unknown }).expired === 'string';

  function rerollState(siteId: string, key: string): { enabled: boolean; reason?: string } {
    const site = generationSite(siteId);
    const h = handlers.get(siteId);
    if (!site || !h || site.reroll === 'none') return { enabled: false, reason: NONE_REASON };
    if (site.reroll === 'revert') {
      if (h.canUndo) {
        const why = h.canUndo(key);
        return why === null ? { enabled: true } : { enabled: false, reason: why };
      }
      const snap = snapshots.get(siteId);
      if (!snap || snap.key !== key || snap.chatId !== host.chatId()) return { enabled: false, reason: 'There is nothing to restore.' };
      return host.state() === snap.after ? { enabled: true } : { enabled: false, reason: MOVED_REASON };
    }
    const why = h.committed?.(key) ?? null;
    return why === null ? { enabled: true } : { enabled: false, reason: why };
  }

  return {
    bind(siteId, h) {
      handlers.set(siteId, h as SiteHandlers<any, any>);
    },

    generate: (siteId, key, opts = {}) => run(siteId, key, opts),

    async retry(recordId, opts = {}) {
      const rec = host.state()?.generations?.records.find((r) => r.id === recordId);
      if (!rec) return { kind: 'stale' };
      if (rec.status === 'expired') return { kind: 'expired', why: rec.expiredWhy ?? 'It can no longer be retried.' };
      if (!generationSite(rec.siteId) || !handlers.has(rec.siteId)) return { kind: 'unbound' };
      return run(rec.siteId, rec.key, { budgetMult: opts.budgetMult ?? rec.budgetMult, profile: opts.profile });
    },

    async reroll(siteId, key) {
      const state = rerollState(siteId, key);
      if (!state.enabled) return { kind: 'expired', why: state.reason ?? NONE_REASON };
      const site = generationSite(siteId)!;
      const h = handlers.get(siteId)!;
      if (site.reroll === 'revert') {
        const why = h.undo ? h.undo(key) : undoSnapshot(siteId, key);
        if (why !== null) return { kind: 'expired', why };
      }
      // a reroll never runs the fallback: a good result was there before, and a failed reroll must not replace it with a template
      return run(siteId, key, { skipFallback: true });
    },

    rerollState,

    drop(recordId) {
      host.dispatch({ type: 'generation/close', payload: { id: recordId, outcome: 'dropped' } }, { expectChatId: host.chatId() });
    },

    async useFallback(recordId) {
      const rec = host.state()?.generations?.records.find((r) => r.id === recordId);
      const h = rec ? handlers.get(rec.siteId) : undefined;
      if (!rec || !h?.fallback) return;
      const chatId = host.chatId();
      const input = await h.build(rec.key);
      if (host.chatId() !== chatId) return;
      h.fallback(rec.key, isExpired(input) ? null : input);
      host.dispatch({ type: 'generation/close', payload: { id: recordId, outcome: 'kept_fallback' } }, { expectChatId: chatId });
    },

    takeSnapshot(siteId, key, before, after) {
      snapshots.set(siteId, { chatId: host.chatId(), key, before, after });
    },

    clearSnapshots() {
      snapshots.clear();
    },
  };
}
