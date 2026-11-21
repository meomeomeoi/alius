import type { Registries } from '../content/types';
import { valuesOf } from '../engine/development/profile';
import { isLiving } from '../engine/economy';
import { defaultPosition, lifeHash, lifeMode, plainText, temperamentOf, topicsInText, unformedTopics } from '../engine/life';
import type { HobbyEntry, LifeEventEntry, OpinionTopicEntry } from '../engine/life/types';
import type { CampaignState, NewsItem, Unit } from '../engine/state/types';
import { sanitizeLifeShare, sanitizeLifeTrace, type LifeShareFlavorInput, type LifeTraceFlavorInput } from '../llm/calls/flavor';
import { CARD_MAX, sanitizeOpinion, type OpinionFormInput } from '../llm/calls/opinionForm';
import type { LifeDeps } from './deps';
import { clearLifeDirectives, refreshLifeDirectives } from './directives';

export type { LifeDeps } from './deps';

const SHARE_SITE = 'flavor.life_share';
const TRACE_SITE = 'flavor.life_trace';
const SITE_OF = { dm: SHARE_SITE, note: TRACE_SITE } as const;
const FORM_SITE = 'opinion.form';

export interface LifeController {
  /** After a settled dispatch: words one waiting DM or note (one call per run; the next waits for the next run). */
  run(): Promise<void>;
  /** The events of a settled dispatch: news that was delivered, gone stale or told, or a topic picked, changes the directives. */
  onEvents(events: Array<{ type: string; [k: string]: unknown }>): void;
  /** A scene opened: her news directive is set for each present woman who has something to tell. */
  onSceneOpened(): void;
  onSceneClosed(): void;
  /** The commander's line in a scene: a keyword brings a topic up for everyone present (`life/topics_triggered`), and a topic she has no view on yet is asked for. */
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
 *
 * The same loop forms her opinions lazily: after a topic is triggered in the open scene (the scene's place, the commander's words, an event
 * of her week) or opened for her (a trace), it asks for ONE unformed topic per run through site `opinion.form` (key `<unitId>:<topicId>`,
 * quiet) and dispatches `life/opinion_formed` with the validated answer, or with the position the values axis suggests and one of its lines
 * (held loosely) when the call fails or no profile is set. The engine validates the topic and the position again.
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
    if (err.code === 'chat_changed' || err.message === 'Already told.' || /already has a view/.test(String(err.message))) return { stale: true as const };
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

  const splitKey = (key: string): [string, string] => {
    const at = key.indexOf(':');
    return [key.slice(0, at), key.slice(at + 1)];
  };
  const topicOf = (id: string): OpinionTopicEntry | undefined => deps.registries().opinionTopics.get(id) as unknown as OpinionTopicEntry | undefined;

  /** The soldier and the topic of a form key while she still has no view on it, or why the moment has passed. */
  function formable(s: CampaignState | null, key: string): { unit: Unit; topic: OpinionTopicEntry } | { expired: string } {
    const [unitId, topicId] = splitKey(key);
    const unit = s?.squad.find((u) => u.id === unitId);
    const topic = topicOf(topicId);
    if (!s || !unit || unit.kind !== 'named' || !isLiving(unit)) return { expired: 'She is no longer here.' };
    if (!topic) return { expired: 'That topic is gone.' };
    if (unit.opinions?.[topicId] !== undefined) return { expired: 'She has a view already.' };
    return { unit, topic };
  }

  function formInput(s: CampaignState, key: string): OpinionFormInput | { expired: string } {
    const f = formable(s, key);
    if ('expired' in f) return f;
    const card = f.unit.cardRef === undefined ? null : deps.st.getCharacterCard(f.unit.cardRef);
    const strong = Object.entries(f.unit.opinions ?? {}).filter(([, o]) => o.strength === 'strong').flatMap(([id, o]) => {
      const t = topicOf(id);
      return t ? [{ topic: t.label, position: o.position, text: o.text ?? '' }] : [];
    });
    return {
      unitId: f.unit.id, name: f.unit.displayName,
      card: [card?.description, card?.personality].filter((x): x is string => typeof x === 'string' && x.trim() !== '').join(' ').slice(0, CARD_MAX),
      temperament: temperamentOf(s, f.unit.id), values: { ...valuesOf(f.unit) }, strong,
      topic: { id: f.topic.id, label: f.topic.label, description: plainText(f.topic.description), positions: f.topic.positions.map((p) => ({ id: p.id, description: plainText(p.description) })) },
    };
  }

  deps.generations.bind<OpinionFormInput, { position: string; text: string }>(FORM_SITE, {
    build: (key) => formInput(state()!, key),
    parse: (raw, input) => sanitizeOpinion(raw, input),
    apply(key, value) {
      const [unitId, topicId] = splitKey(key);
      return settle(deps.app.dispatch({ type: 'life/opinion_formed', payload: { unitId, topicId, position: value.position, text: value.text, strength: 'held', source: 'model' } }, { expectChatId: chatId() }), 'Her opinion');
    },
    fallback(key) {
      const s = state();
      const f = s ? formable(s, key) : null;
      if (!s?.life || !f || 'expired' in f) return false;
      const position = defaultPosition(s, deps.registries(), f.unit.id, f.topic.id);
      const lines = f.topic.positions.find((p) => p.id === position)!.lines;
      const text = plainText(lines[lifeHash(s.life, `${f.unit.id}|${f.topic.id}`) % 2]);
      return !deps.app.dispatch({ type: 'life/opinion_formed', payload: { unitId: f.unit.id, topicId: f.topic.id, position, text, strength: 'loose', source: 'fallback' } }, { expectChatId: chatId() }).some((e) => e.type === 'error');
    },
  });

  /** The next unformed topic of a woman in the open scene that was not asked for yet: `<unitId>:<topicId>`. */
  function nextForm(s: CampaignState): string | undefined {
    for (const id of s.scene?.participants ?? []) {
      const topic = unformedTopics(s, id).find((t) => !tried.has(`${id}:${t}`));
      if (topic !== undefined) return `${id}:${topic}`;
    }
    return undefined;
  }

  async function run(): Promise<void> {
    const s = state();
    if (!s || busy || lifeMode(s) === 'off' || s.combat || s.expedition || s.ended) return; // the engine refuses these while they are open
    const next = (s.life?.outbox ?? []).find((o) => !tried.has(o.itemId));
    const form = next === undefined ? nextForm(s) : undefined;
    if (!next && form === undefined) return;
    if (next?.channel === 'dm' && s.settings.unitDms !== true) {
      // her DMs are off: the engine turns the item into news for her next scene; no words are asked for
      tried.add(next.itemId);
      deps.app.dispatch({ type: 'life/share_done', payload: { itemId: next.itemId, text: '' } }, { expectChatId: chatId() });
      return run(); // the next waiting item
    }
    busy = true;
    const call = next ? (tried.add(next.itemId), deps.generations.generate(SITE_OF[next.channel], next.itemId)) : (tried.add(form!), deps.generations.generate(FORM_SITE, form!));
    flight = call.then(() => undefined).finally(() => { flight = null; busy = false; });
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
      void run().catch(() => {}); // what the place and her week brought up may need a view of hers
    },
    onSceneClosed() {
      clearLifeDirectives(deps.context);
      tried.clear();
      deps.refreshContext();
    },
    onCommanderLine(text) {
      const s = state();
      if (!s?.scene || lifeMode(s) === 'off') return;
      const topicIds = topicsInText(deps.registries(), text);
      if (topicIds.length === 0) return;
      deps.app.dispatch({ type: 'life/topics_triggered', payload: { topicIds } }, { expectChatId: chatId() });
      void run().catch(() => {}); // the dispatch has no event of its own that would ask
    },
    async idle() { while (flight) await flight.catch(() => {}); },
  };
}
