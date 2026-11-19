import type { CampaignState, GenerationRecord } from '../../engine/state/types';
import type { AliusSettings } from '../../settings';
import type { Envelope } from '../../llm/envelope';
import { describeFailure } from '../../llm/describe';
import { generationSite, type GenerationSurface } from '../../llm/sites';
import type { ShellApi } from '../shell/shell';
import { chipsFor, drawGenerationChip, drawReroll } from './chip';
import { openRetryMenu } from './retryMenu';

// P14: what every surface needs to draw its failure chips and REROLL buttons. A screen takes one optional `GenerationUi` in its context
// (absent = the screen draws none); the app builds it once. Nothing here decides anything: the buttons call the envelope.

export interface GenerationUi {
  generations: Pick<Envelope, 'retry' | 'reroll' | 'rerollState' | 'drop' | 'useFallback'>;
  modal: ShellApi['modal'];
  /** The retry menu offers the profile choice only while a mechanic profile is selected; the timeout and budgets word the chip. */
  settings(): AliusSettings;
  toast(kind: 'info' | 'warn' | 'error', text: string): void;
  /** Draws the surface again (a pending button changes, a record closed). */
  redraw(): void;
}

/** Buttons that wait for a call, by retry record id or `reroll:<siteId>:<key>`; module state because a redraw makes new buttons. */
const pending = new Set<string>();
export const isPending = (id: string): boolean => pending.has(id);

/** Runs `fn` with `id` pending, redrawing before and after. */
export function runPending(ui: GenerationUi, id: string, fn: () => Promise<unknown>): void {
  if (pending.has(id)) return;
  pending.add(id);
  ui.redraw();
  void fn().catch((e) => console.warn('[Alius] generation failed', e)).finally(() => {
    pending.delete(id);
    ui.redraw();
  });
}

const rerollId = (siteId: string, key: string): string => `reroll:${siteId}:${key}`;

/** The chip of one record, with its handlers bound to the envelope. Appends to `host`. */
export function drawRecordChip(host: HTMLElement, ui: GenerationUi, state: CampaignState, rec: GenerationRecord, opts: { showDrop?: boolean } = {}): HTMLElement {
  const site = generationSite(rec.siteId);
  const label = site ? site.label(state, rec.key) : rec.siteId;
  const set = ui.settings();
  // the record keeps the multiplier of its last attempt, not the tokens: the budget is the call type's times it (the floor of a mechanic call aside)
  const base = site ? Math.ceil((set.budgets[site.callType] ?? 0) * rec.budgetMult) : 0;
  const text = describeFailure({ label, reason: rec.reason, budget: base > 0 ? base : undefined, timeoutMs: set.llmTimeoutMs, expiredWhy: rec.expiredWhy });
  const held = site?.held === true;
  const retry = (opts?: { budgetMult?: number; profile?: 'main' | 'mechanic' }) => runPending(ui, rec.id, async () => { await ui.generations.retry(rec.id, opts); });
  return drawGenerationChip(host, rec, {
    label, text, pending: isPending(rec.id), showDrop: opts.showDrop,
    onRetry: () => retry(),
    onMenu: () => void retryMenuFor(ui, held).then((choice) => {
      if (choice === null) return;
      if (choice === 'drop') ui.generations.drop(rec.id);
      else if (choice === 'fallback') runPending(ui, rec.id, () => ui.generations.useFallback(rec.id));
      else retry(choice);
    }),
    ...(held && rec.status === 'open' ? { onUseFallback: () => runPending(ui, rec.id, () => ui.generations.useFallback(rec.id)) } : {}),
    onDrop: () => ui.generations.drop(rec.id),
  });
}

/** Draws the chips of every record `chipsFor` gives for `surface`. Returns how many were drawn. */
export function drawGenerationChips(host: HTMLElement, ui: GenerationUi | undefined, state: CampaignState, surface: GenerationSurface, filter?: (r: GenerationRecord) => boolean): number {
  if (!ui) return 0;
  const list = chipsFor(state, surface, filter);
  for (const rec of list) drawRecordChip(host, ui, state, rec);
  return list.length;
}

/** `[REROLL]` of a site and key: enabled as the envelope says, locked while its call runs. Nothing is drawn without a `ui`. */
export function drawSiteReroll(
  host: HTMLElement, ui: GenerationUi | undefined, siteId: string, key: string,
  /** What a click does; default: `generations.reroll(siteId, key)`. A controller that must read the new result afterwards passes its own. */
  run?: () => Promise<unknown>,
  /** The state the controller reports (a scene's own); default: the envelope's. */
  stateOf?: { enabled: boolean; reason?: string },
): HTMLElement | null {
  if (!ui) return null;
  const id = rerollId(siteId, key);
  const state = stateOf ?? ui.generations.rerollState(siteId, key);
  return drawReroll(host, state, () => runPending(ui, id, async () => {
    const out = await (run ? run() : ui.generations.reroll(siteId, key));
    if (out && typeof out === 'object' && (out as { kind?: string }).kind === 'expired') ui.toast('warn', String((out as { why?: string }).why ?? 'This can no longer be rerolled.'));
  }), isPending(id));
}

/** The retry menu for a record (the surface helper above wires it; kept here so every surface shares one). */
export function retryMenuFor(ui: GenerationUi, held: boolean) {
  return openRetryMenu((o) => ui.modal(o), { hasMechanic: ui.settings().mechanicProfileId !== '', hasFallback: held });
}
