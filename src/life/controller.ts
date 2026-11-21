import type { Registries } from '../content/types';
import { isLiving } from '../engine/economy';
import { lifeHash, lifeMode, plainText, temperamentOf } from '../engine/life';
import type { HobbyEntry, LifeEventEntry } from '../engine/life/types';
import type { CampaignState, NewsItem, Unit } from '../engine/state/types';
import { sanitizeLifeShare, sanitizeLifeTrace, type LifeShareFlavorInput, type LifeTraceFlavorInput } from '../llm/calls/flavor';
import type { LifeDeps } from './deps';
import { clearLifeDirectives, refreshLifeDirectives } from './directives';

export type { LifeDeps } from './deps';

const SHARE_SITE = 'flavor.life_share';
const TRACE_SITE = 'flavor.life_trace';
const SITE_OF = { dm: SHARE_SITE, note: TRACE_SITE } as const;

export interface LifeController {
  /** After a settled dispatch: words one waiting DM or note (one call per run; the next waits for the next run). */
  run(): Promise<void>;
  /** The events of a settled dispatch: news that was delivered, gone stale or told, or a topic picked, changes the directives. */
  onEvents(events: Array<{ type: string; [k: string]: unknown }>): void;
  /** A scene opened: her news directive is set for each present woman who has something to tell. */
  onSceneOpened(): void;
  onSceneClosed(): void;
  /** The commander's line in a scene (the opinions and jokes read it: later). */
  onCommanderLine(text: string): void;
  /** Waits for the call in flight (tests). */
  idle(): Promise<void>;
}

/**
 * What she says (and what the model is told it is) when nothing is generated for a hobby item the registry has no line for: a hobby she took up or
 * put away. AUTHOR TO WRITE: placeholders in her own first-person voice, two each, picked by a hash of the item.
 */
const HOBBY_LINES: Record<'started' | 'dropped', (label: string) => [string, string]> = {
  started: (label) => [`I started ${label}.`, `Trying ${label}. Don't ask how it's going.`],
  dropped: (label) => [`I put ${label} away for now.`, `${label}? I gave it up. For now.`],
};

/** What happened and the two lines she would say it in, from the registry (or from the hobby item's own lines). */
function wording(reg: Registries, item: NewsItem, unit: Unit, fact: string): { what: string; lines: [string, string] } {
  const fill = (t: string): string => plainText(t).replaceAll('{name}', unit.displayName);
  if (item.kind === 'event') {
    const e = reg.lifeEvents.get(item.ref) as unknown as LifeEventEntry | undefined;
    if (e) return { what: fill(String(e.description)), lines: [fill(e.lines[0]), fill(e.lines[1])] };
    return { what: fact, lines: [fact, fact] };
  }
  const h = reg.hobbies.get(item.ref) as unknown as HobbyEntry | undefined;
  if (!h) return { what: fact, lines: [fact, fact] };
  if (item.what === 'started' || item.what === 'dropped') {
    const lines = HOBBY_LINES[item.what](h.label);
    return { what: item.what === 'started' ? `${unit.displayName} took up ${h.label}.` : `${unit.displayName} put ${h.label} away.`, lines };
  }
  const m = h.milestones.find((x) => x.id === item.milestoneId);
  const line = m ? fill(m.line) : fact;
  return { what: `${h.label}: ${line}`, lines: [line, line] };
}

/**
 * The model-facing half of her life (P14c): after a dispatch settles it asks for the words of one waiting item of the outbox through the
 * envelope (site `flavor.life_share` for a DM, `flavor.life_trace` for a note; key = the item id; quiet) and dispatches `life/share_done` or
 * `life/trace_note` with the answer, or the registry's own line (a line of the event picked by hash, the milestone's line, the hobby's trace
 * text) when the call fails or no profile is set. The state is the truth: the input is rebuilt from it every time, an answer for another chat
 * is dropped and an item that left the outbox meanwhile says nothing. Her news directives are derived from the state like P9c's.
 */
export function createLife(deps: LifeDeps): LifeController {
  const chatId = (): string | undefined => deps.st.getActiveChat()?.chatId;
  const state = (): CampaignState | null => deps.app.current().state;
  let flight: Promise<void> | null = null;
  let busy = false;
  /** Items that were asked for and did not settle (the campaign was closed, say): not asked again until a scene closes or the chat changes. */
  const tried = new Set<string>();

  /** The item, its outbox entry for this channel and her; or why the moment has passed. */
  function waiting(s: CampaignState | null, key: string, channel: 'dm' | 'note'): { item: NewsItem; unit: Unit } | { expired: string } {
    const life = s?.life;
    const entry = life?.outbox.find((o) => o.itemId === key && o.channel === channel);
    const item = life?.queue.find((q) => q.id === key);
    const unit = s?.squad.find((u) => u.id === entry?.unitId);
    if (!s || !entry || !item || !unit || unit.kind !== 'named' || !isLiving(unit)) return { expired: 'Already told.' };
    return { item, unit };
  }

  const factText = (s: CampaignState, item: NewsItem): string => plainText(s.memory.facts.find((f) => f.id === item.factId)?.text ?? '');

  function shareInput(s: CampaignState | null, key: string): LifeShareFlavorInput | { expired: string } {
    const w = waiting(s, key, 'dm');
    if ('expired' in w) return w;
    const t = temperamentOf(s!, w.unit.id);
    const { what, lines } = wording(deps.registries(), w.item, w.unit, factText(s!, w.item));
    return { kind: 'life_share', name: w.unit.displayName, talk: `${t.talkativeness}, ${t.volatility}, ${t.humor}`, what, lines, slot: s!.slot };
  }

  function traceInput(s: CampaignState | null, key: string): LifeTraceFlavorInput | { expired: string } {
    const w = waiting(s, key, 'note');
    if ('expired' in w) return w;
    const h = deps.registries().hobbies.get(w.item.ref) as unknown as HobbyEntry | undefined;
    if (!h) return { expired: 'The hobby is gone.' };
    const m = h.milestones.find((x) => x.id === w.item.milestoneId);
    return {
      kind: 'life_trace', name: w.unit.displayName, hobby: h.label, milestone: plainText(m?.line ?? ''),
      trace: plainText(h.traceText ?? '').replaceAll('{name}', w.unit.displayName),
    };
  }

  /** The result of a dispatch as an envelope answer: the chat or the item moved on (drop it), or the engine said no. */
  function settle(events: Array<{ type: string; [k: string]: unknown }>, what: string) {
    const err = events.find((e) => e.type === 'error');
    if (!err) return 'ok' as const;
    if (err.code === 'chat_changed' || err.message === 'Already told.') return { stale: true as const };
    return { rejected: String(err.message ?? `${what} was refused.`), final: true as const };
  }

  deps.generations.bind<LifeShareFlavorInput, string>(SHARE_SITE, {
    build: (key) => shareInput(state(), key),
    parse: (raw) => sanitizeLifeShare(raw),
    apply: (key, text) => settle(deps.app.dispatch({ type: 'life/share_done', payload: { itemId: key, text } }, { expectChatId: chatId() }), 'The message'),
    fallback(key, input) {
      const s = state();
      if (!s?.life || !input) return false;
      const text = input.lines[lifeHash(s.life, key) % 2];
      return !deps.app.dispatch({ type: 'life/share_done', payload: { itemId: key, text } }, { expectChatId: chatId() }).some((e) => e.type === 'error');
    },
  });

  deps.generations.bind<LifeTraceFlavorInput, string>(TRACE_SITE, {
    build: (key) => traceInput(state(), key),
    parse: (raw) => sanitizeLifeTrace(raw),
    apply: (key, text) => settle(deps.app.dispatch({ type: 'life/trace_note', payload: { itemId: key, text } }, { expectChatId: chatId() }), 'The note'),
    fallback(key, input) {
      if (!input || input.trace === '') return false;
      return !deps.app.dispatch({ type: 'life/trace_note', payload: { itemId: key, text: input.trace } }, { expectChatId: chatId() }).some((e) => e.type === 'error');
    },
  });

  async function run(): Promise<void> {
    const s = state();
    if (!s || busy || lifeMode(s) === 'off' || s.combat || s.expedition || s.ended) return; // the engine refuses these while they are open
    const next = (s.life?.outbox ?? []).find((o) => !tried.has(o.itemId));
    if (!next) return;
    busy = true;
    tried.add(next.itemId);
    flight = deps.generations.generate(SITE_OF[next.channel], next.itemId).then(() => undefined).finally(() => { flight = null; busy = false; });
    await flight;
  }

  return {
    run,
    onEvents(events) {
      if (events.some((e) => e.type === 'news_delivered' || e.type === 'news_stale' || e.type === 'life_noted' || e.type === 'topic_picked')) deps.refreshContext();
    },
    onSceneOpened() {
      const s = state();
      if (s) refreshLifeDirectives(deps.context, s, deps.registries());
      deps.refreshContext();
    },
    onSceneClosed() {
      clearLifeDirectives(deps.context);
      tried.clear();
      deps.refreshContext();
    },
    onCommanderLine() {},
    async idle() { while (flight) await flight.catch(() => {}); },
  };
}
