import type { Registries } from '../../content/types';
import type { CampaignState, Fact, HobbyState, LifeMode, Temperament } from '../state/types';
import { TUNING } from '../tuning';
import { UNTOLD_TAG, lifeMode, temperamentOf } from './state';
import { plainText } from './facts';
import { commanderHobbyWord } from './meetings';
import { heardOpinions } from './opinions';
import type { HobbyEntry, LifeEventEntry, OpinionTopicEntry } from './types';

/**
 * What the player may read of her life (P14c): only what was told or voiced. This is the engine side of `Knowledge.life` (the analysis tool and
 * every view read through that); it builds descriptors from state and never returns a number, an untold event, an opinion she has not voiced, the
 * queue or a counter. Pure; nothing is drawn from the rng.
 */

/** A fact about her whose tags name all of these. */
const factOf = (state: Pick<CampaignState, 'memory'>, unitId: string, tags: readonly string[]): Fact | undefined =>
  state.memory.facts.find((f) => f.about.includes(unitId) && tags.every((t) => f.tags.includes(t)));

/** Whether a fact is still untold (the commander has not been told) or hidden from the commander. */
const untold = (f: Fact): boolean => f.tags.includes(UNTOLD_TAG) || f.hiddenFromCommander === true;

/**
 * The milestones of a hobby the commander knows she has reached, as ids in the order reached. A milestone is untold while its fact is untold or
 * an item of the queue still carries it; one with no fact (a starting skill, silently granted at the import) is known from her card.
 */
export function toldMilestones(state: Pick<CampaignState, 'memory' | 'life' | 'squad'>, unitId: string, hobby: Pick<HobbyState, 'id' | 'milestones'>): string[] {
  return hobby.milestones.filter((id) => {
    const fact = factOf(state, unitId, ['hobby', hobby.id, id]);
    if (fact !== undefined && untold(fact)) return false;
    return !(state.life?.queue ?? []).some((q) => q.unitId === unitId && q.kind === 'hobby' && q.ref === hobby.id && q.milestoneId === id);
  });
}

/** Whether she has taken the hobby up and the commander has not heard of it yet (a hobby she started off-screen is untold until its news is). */
export function hobbyUntold(state: Pick<CampaignState, 'memory' | 'life'>, unitId: string, hobbyId: string): boolean {
  const fact = factOf(state, unitId, ['hobby', hobbyId, 'started']);
  if (fact !== undefined && untold(fact)) return true;
  return (state.life?.queue ?? []).some((q) => q.unitId === unitId && q.kind === 'hobby' && q.ref === hobbyId && q.what === 'started');
}

/** How keen she is, as a word: `keen` from the interest at which a hobby is, `steady` below that, `cooling` and `put away` for the cycle's other two states. */
export function hobbyWord(h: Pick<HobbyState, 'state' | 'interest'>): 'keen' | 'steady' | 'cooling' | 'put away' {
  if (h.state === 'dropped') return 'put away';
  if (h.state === 'cooling') return 'cooling';
  return h.interest >= TUNING.life.keenAt ? 'keen' : 'steady';
}

export interface LifeView {
  /** The opinions she has voiced: her words (or the position's), and what she used to think (the older positions, oldest first). */
  opinions: Array<{ topicId: string; label: string; text: string; history: string[] }>;
  /** Her hobbies the commander knows of: the told milestones (the lines), a word for how keen she is, and the traces told milestones left. */
  hobbies: Array<{ id: string; label: string; milestones: string[]; word: string; traces: string[] }>;
  /** What she has told the commander of her days, newest first (her hobby news is under her hobbies). */
  told: string[];
  /** How well the commander has learned each hobby from her, as a word. */
  commanderSkills: Array<{ id: string; label: string; word: string }>;
  /** The line under her name on the hub, from the newest event of the last days (nothing for what she keeps to herself). */
  hub: { eventId: string; text: string } | null;
  /** Her three temperament words (through `temperamentOf`) and the campaign's frequency (off for an old save). */
  temperWords: Temperament;
  mode: LifeMode;
}

/** The hub line of her newest event, within `hubDays`, with the event's own id and its text. Null while life is off or when none stands. */
export function hubLine(state: Pick<CampaignState, 'life' | 'settings' | 'day'>, reg: Pick<Registries, 'lifeEvents'>, unitId: string): { eventId: string; text: string } | null {
  if (lifeMode(state) === 'off') return null;
  const hub = state.life?.units[unitId]?.hub;
  if (!hub || state.day - hub.day > TUNING.life.hubDays || state.day < hub.day) return null;
  const entry = reg.lifeEvents.get(hub.eventId) as unknown as LifeEventEntry | undefined;
  const text = entry === undefined ? '' : plainText(String(entry.hub));
  return text === '' ? null : { eventId: hub.eventId, text };
}

/** The view of her life as it stands, for a campaign whose life is on or has been (an old save with no trace of it reads empty). */
export function lifeView(state: CampaignState, reg: Registries, unitId: string, visible: (f: Fact) => boolean = () => true): LifeView {
  const unit = state.squad.find((u) => u.id === unitId);
  const empty: LifeView = { opinions: [], hobbies: [], told: [], commanderSkills: [], hub: null, temperWords: temperamentOf(state, unitId), mode: lifeMode(state) };
  if (!unit || unit.kind !== 'named') return empty;
  const opinions: LifeView['opinions'] = [];
  for (const o of heardOpinions(state, unitId)) {
    const topic = reg.opinionTopics.get(o.topicId) as unknown as OpinionTopicEntry | undefined;
    if (!topic) continue;
    const words = (id: string): string => plainText(String(topic.positions.find((p) => p.id === id)?.description ?? ''));
    const history = (unit.opinions?.[o.topicId]?.history ?? []).map((row) => words(row.from)).filter((t) => t !== '');
    opinions.push({ topicId: o.topicId, label: String(topic.label), text: o.text !== undefined && o.text !== '' ? o.text : words(o.position), history });
  }
  const hobbies: LifeView['hobbies'] = [];
  for (const h of unit.hobbies ?? []) {
    const entry = reg.hobbies.get(h.id) as unknown as HobbyEntry | undefined;
    if (!entry || hobbyUntold(state, unitId, h.id)) continue;
    const told = toldMilestones(state, unitId, h);
    const lines = entry.milestones.filter((m) => told.includes(m.id));
    hobbies.push({
      id: h.id, label: String(entry.label), word: hobbyWord(h), milestones: lines.map((m) => plainText(String(m.line))),
      traces: lines.some((m) => m.trace === 'prop') && entry.traceText !== undefined ? [`in her quarters: ${plainText(String(entry.traceText))}`] : [],
    });
  }
  const told = state.memory.facts
    .filter((f) => f.about.includes(unitId) && f.tags.includes('life') && !f.tags.includes('hobby') && !untold(f) && visible(f))
    .reverse().slice(0, TUNING.life.toldShown).map((f) => f.text);
  const commanderSkills = Object.entries(state.commander.hobbySkill ?? {}).flatMap(([id, skill]) => {
    const entry = reg.hobbies.get(id) as unknown as HobbyEntry | undefined;
    return entry ? [{ id, label: String(entry.label), word: commanderHobbyWord(skill) }] : [];
  });
  return { opinions, hobbies, told, commanderSkills, hub: hubLine(state, reg, unitId), temperWords: temperamentOf(state, unitId), mode: lifeMode(state) };
}
