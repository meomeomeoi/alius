import type { Registries } from '../content/types';
import { keenestHobby, lifeMode, pendingNews, plainText, plateauBreaks } from '../engine/life';
import type { HobbyEntry, OpinionTopicEntry, PastimeEntry } from '../engine/life/types';
import type { CampaignState, Unit } from '../engine/state/types';
import type { ContextBuilder, Directive } from '../llm/context';

const clean = (text: string): string => text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * What the main model is told about her life (P14c). Every id starts with `life:`; none starts with a prefix an older package reserves.
 * All of them are derived from the state on every refresh, so they follow a reload and a chat switch needs only `clearLifeDirectives`. They
 * follow the prompt-hygiene rule: set only while a trigger holds, worded "if it fits ... once", and gone after her scene or once the item is
 * told (the engine closes it). The engine decides what is true; this layer only words it. No text gives the commander a pronoun (lore §0).
 */

/** The prefix of every directive of her life (the news, and later the opinions, jokes and pastimes). */
export const LIFE_DERIVED = ['life:'] as const;

export const NEWS_PREFIX = 'life:news:';
export const OPINION_PREFIX = 'life:opinion:';
export const JOKE_PREFIX = 'life:joke:';
export const PASTIME_PREFIX = 'life:pastime:';

/** The directive of the running joke she may bring back in this scene (picked at its start), or null. A fact that is gone leaves no line. */
function jokeDirective(state: CampaignState, unit: Unit): Directive | null {
  const sc = state.life?.units[unit.id]?.scene;
  if (!sc || sc.sceneId !== state.scene?.id || sc.joke === undefined) return null;
  const text = state.memory.facts.find((f) => f.id === sc.joke)?.text;
  if (text === undefined) return null;
  return {
    id: `${JOKE_PREFIX}${unit.id}`, expiresAfter: 'scene',
    text: `If it fits, ${unit.displayName} may bring back a running joke she shares with the commander: ${clean(text)} Lightly, once.`,
  };
}

/** The directive of the topic picked for her in the open scene, or null: her view in the topic's own words (the position's neutral description and her words when she has them). */
function opinionDirective(state: CampaignState, reg: Registries, unit: Unit): Directive | null {
  const sc = state.life?.units[unit.id]?.scene;
  if (!sc || sc.sceneId !== state.scene?.id || sc.topic === undefined) return null;
  const opinion = unit.opinions?.[sc.topic];
  const topic = reg.opinionTopics.get(sc.topic) as unknown as OpinionTopicEntry | undefined;
  const position = topic?.positions.find((p) => p.id === opinion?.position);
  if (!opinion || !topic || !position) return null;
  const hint = clean(plainText(position.description));
  const words = opinion.text !== undefined && opinion.text !== '' ? ` In her words: "${clean(opinion.text)}"` : '';
  return {
    id: `${OPINION_PREFIX}${unit.id}`, expiresAfter: 'scene',
    text: `If it fits, ${unit.displayName} may say what she thinks about ${clean(topic.label)}: ${hint}${words} Lightly, once.`,
  };
}

/**
 * The directive of a quiet meeting: this scene is a pastime with her (set when it started, until it ends). It carries the opening, what the
 * meeting is, and what each of them does; the one that is her hobby names it, and says the step comes when she is on a plateau the push breaks.
 */
function pastimeDirective(state: CampaignState, reg: Registries, unit: Unit): Directive | null {
  const meeting = state.scene?.pastime;
  const pastime = meeting?.unitId === unit.id ? (reg.pastimes.get(meeting.id) as unknown as PastimeEntry | undefined) : undefined;
  if (!pastime) return null;
  const hobby = pastime.hobby === true ? keenestHobby(reg, unit) : undefined;
  const label = hobby ? (reg.hobbies.get(hobby.id) as unknown as HobbyEntry | undefined)?.label : undefined;
  const what = clean(plainText(pastime.description)).replace(/\.$/, '');
  const hers = label !== undefined ? clean(label) : clean(pastime.herActivity);
  const breaks = hobby !== undefined && plateauBreaks(state, unit.id, hobby.id) ? ' She gets it right for the first time today.' : '';
  return {
    id: `${PASTIME_PREFIX}${unit.id}`, expiresAfter: 'scene',
    text: `${clean(plainText(pastime.opening))} A quiet meeting with no stakes: ${what}. ${unit.displayName}: ${hers}; the commander: ${clean(pastime.commanderActivity)}.${breaks}`,
  };
}

/**
 * Derived directives for the women in the scene (`present`):
 *  - `life:news:<unitId>`: the oldest thing she has to tell the commander and has not (an item the queue delivered as a directive). A
 *    stale item reads as a passing mention ("recently").
 *  - `life:opinion:<unitId>`: the one topic picked for her in this scene (a trigger fired, she has a view and it is off cooldown), until she
 *    voices it (`opinion_voiced` clears the pick). Never an opinion nothing triggered.
 *  - `life:joke:<unitId>`: the running joke she may bring back in this private scene (picked at its start), until a `joke_returned` uses it up.
 *  - `life:pastime:<unitId>`: this scene is a quiet meeting with her (a pastime): the opening, what each does; gone when the scene ends.
 * Nothing while life is off.
 */
export function lifeDirectives(state: CampaignState, reg: Registries, present: string[]): Directive[] {
  if (lifeMode(state) === 'off') return [];
  const out: Directive[] = [];
  for (const id of present) {
    const unit = state.squad.find((u) => u.id === id);
    if (!unit || unit.kind !== 'named') continue;
    const name = unit.displayName;
    const first = pendingNews(state, id)[0];
    if (first) {
      const raw = clean(first.text);
      const what = raw.startsWith(`${name}: `) ? raw.slice(name.length + 2) : raw;
      out.push({
        id: `${NEWS_PREFIX}${id}`, expiresAfter: 'scene',
        text: first.passing === true
          ? `If it fits, ${name} may mention in passing something that happened to her recently: ${what} A word or two, once.`
          : `If it fits, ${name} may tell the commander about something that happened to her: ${what} Once, in her own words.`,
      });
    }
    const opinion = opinionDirective(state, reg, unit);
    if (opinion) out.push(opinion);
    const joke = jokeDirective(state, unit);
    if (joke) out.push(joke);
    const pastime = pastimeDirective(state, reg, unit);
    if (pastime) out.push(pastime);
  }
  return out;
}

/** Drops every directive this layer owns (a chat switch, no campaign, a scene that closed). */
export function clearLifeDirectives(builder: ContextBuilder): void {
  builder.clearMatching((d) => LIFE_DERIVED.some((p) => d.id.startsWith(p)));
}

/** Sets the derived directives and drops the ones that no longer hold. Called on every refresh. */
export function refreshLifeDirectives(builder: ContextBuilder, state: CampaignState, reg: Registries): void {
  clearLifeDirectives(builder);
  for (const d of lifeDirectives(state, reg, state.scene?.participants ?? [])) builder.setDirective(d);
}
