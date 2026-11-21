import type { Registries } from '../../content/types';
import { valuesOf } from '../development/profile';
import type { EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { addFact } from '../memory';
import type { CampaignState, Opinion, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { plainText } from './facts';
import { unitOf } from './places';
import { ensureLife, lifeHash, lifeMode } from './state';
import type { OpinionTopicEntry } from './types';

/**
 * Her opinions (P14c): what she thinks about the topics of the library, formed lazily (the first time something brings a topic up near her),
 * voiced once when it fits, and (Task 14) moved a step by persuasion. Everything is a hash of the life salt (never the rng), read by field
 * (`axis`, `positions`, `triggers`), never by topic id. A model never writes a position into the state except through `formOpinion`, which
 * validates the topic and the position.
 */

const topicOf = (reg: Pick<Registries, 'opinionTopics'>, id: string): OpinionTopicEntry | undefined => reg.opinionTopics.get(id) as unknown as OpinionTopicEntry | undefined;

/**
 * The position she would hold on a topic without a model: with an `axis`, her value on it (times the sign) above zero is the first position,
 * below zero the last, zero the middle; with no axis, the middle (`floor(n / 2)`). Reads her drifted values (`valuesOf`).
 */
export function defaultPosition(state: Pick<CampaignState, 'squad'>, reg: Pick<Registries, 'opinionTopics'>, unitId: string, topicId: string): string {
  const topic = topicOf(reg, topicId);
  if (!topic || topic.positions.length === 0) throw new Error(`Unknown opinion topic "${topicId}".`);
  const n = topic.positions.length;
  const unit = unitOf(state, unitId);
  if (topic.axis && unit) {
    const v = topic.axis.sign * valuesOf(unit)[topic.axis.id];
    if (v > 0) return topic.positions[0].id;
    if (v < 0) return topic.positions[n - 1].id;
  }
  return topic.positions[Math.floor(n / 2)].id;
}

/** The topics a place or an activity brings up (`triggers.locations`, `triggers.activities`), in registry order. */
export function topicsAt(reg: Pick<Registries, 'opinionTopics'>, at: { locationId: string; activityId?: string }): string[] {
  const out: string[] = [];
  for (const [id, entry] of reg.opinionTopics) {
    const t = (entry as unknown as OpinionTopicEntry).triggers;
    if (t.locations?.includes(at.locationId) === true || (at.activityId !== undefined && t.activities?.includes(at.activityId) === true)) out.push(id);
  }
  return out;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The compiled keyword matchers of a registry (whole words, any case), built once per registry. */
const matchers = new WeakMap<object, Array<{ id: string; re: RegExp }>>();

/** The topics whose keywords appear in a text: whole words only, case-insensitive (`coffee` is in "Coffee?" and not in "coffeemaker"), in registry order. */
export function topicsInText(reg: Pick<Registries, 'opinionTopics'>, text: string): string[] {
  let list = matchers.get(reg.opinionTopics);
  if (!list) {
    list = [];
    for (const [id, entry] of reg.opinionTopics) {
      const words = (entry as unknown as OpinionTopicEntry).triggers.keywords ?? [];
      if (words.length > 0) list.push({ id, re: new RegExp(`(?<![\\p{L}\\p{N}_])(?:${words.map(escapeRe).join('|')})(?![\\p{L}\\p{N}_])`, 'iu') });
    }
    matchers.set(reg.opinionTopics, list);
  }
  return list.filter((m) => m.re.test(text)).map((m) => m.id);
}

/** The topics of the life events she had in the last seven days (`triggers.lifeEvents`), in registry order. */
export function recentEventTopics(state: Pick<CampaignState, 'life'>, reg: Pick<Registries, 'opinionTopics'>, unitId: string, day: number): string[] {
  const last = state.life?.units[unitId]?.last;
  if (!last) return [];
  const out: string[] = [];
  for (const [id, entry] of reg.opinionTopics) {
    const events = (entry as unknown as OpinionTopicEntry).triggers.lifeEvents ?? [];
    if (events.some((e) => last[e] !== undefined && day - last[e] < TUNING.life.opinion.recentDays)) out.push(id);
  }
  return out;
}

/** Her topics that something triggered (in this scene) or an event or a trace opened, and she has no opinion on yet: what `opinion.form` is asked for. */
export function unformedTopics(state: Pick<CampaignState, 'life' | 'squad' | 'scene'>, unitId: string): string[] {
  const mine = state.life?.units[unitId];
  const unit = unitOf(state, unitId);
  if (!mine || !unit) return [];
  const inScene = mine.scene !== undefined && mine.scene.sceneId === state.scene?.id ? mine.scene.topics : [];
  return [...new Set([...inScene, ...(mine.pendingTopics ?? [])])].filter((t) => unit.opinions?.[t] === undefined);
}

/** She may speak of the topic: she has a view, and has not voiced it in the last `cooldownDays` days. */
const ready = (unit: Unit, topicId: string, day: number): boolean => {
  const o = unit.opinions?.[topicId];
  return o !== undefined && (o.voicedDay === undefined || day - o.voicedDay >= TUNING.life.opinion.cooldownDays);
};

/**
 * The topic she may bring up in this scene: the first time one of the topics triggered in it has a view of hers that is off cooldown, one is
 * picked by a hash of the scene and her (`scene.topic`), and no second one is picked for the scene (`picked`), voiced or not.
 */
function pickTopic(draft: CampaignState, unitId: string, sceneId: string): EngineEvent[] {
  const life = draft.life;
  const unit = unitOf(draft, unitId);
  const sc = life?.units[unitId]?.scene;
  if (!life || !unit || !sc || sc.sceneId !== sceneId || sc.picked === true) return [];
  const eligible = sc.topics.filter((t) => ready(unit, t, draft.day));
  if (eligible.length === 0) return [];
  sc.topic = eligible[lifeHash(life, `${sceneId}|${unitId}`) % eligible.length];
  sc.picked = true;
  return [{ type: 'topic_picked', unitId }]; // which topic is not said: only that her directive changed
}

/**
 * Topics came up in the open scene (`sceneId`) for these women: they are stored on each woman's `scene.topics` (kept once each, only topics
 * of the registry), and the one topic she may voice is picked if none was yet (`topic_picked`, with no topic in it: nothing here is shown).
 */
export function triggerTopics(draft: CampaignState, reg: Registries, unitIds: readonly string[], topicIds: readonly string[], sceneId: string): EngineEvent[] {
  const life = draft.life;
  if (!life || lifeMode(draft) === 'off') return [];
  const topics = topicIds.filter((t) => reg.opinionTopics.has(t));
  const events: EngineEvent[] = [];
  for (const id of unitIds) {
    const unit = unitOf(draft, id);
    if (!unit || unit.kind !== 'named' || !isLiving(unit)) continue;
    const mine = (life.units[id] ??= { last: {} });
    if (mine.scene?.sceneId !== sceneId) mine.scene = { sceneId, topics: [] };
    for (const t of topics) if (!mine.scene.topics.includes(t)) mine.scene.topics.push(t);
    events.push(...pickTopic(draft, id, sceneId));
  }
  return events;
}

/**
 * A scene opens: each named woman in it starts with a clean slate (`scene` reset), the topics of the place, of the activity that brought the
 * scene about and of her life events of the week are triggered, and a topic may be picked. A no-op while life is off.
 */
export function startSceneLife(
  draft: CampaignState, reg: Registries, scene: { id: string; locationId: string; participants: readonly string[] }, activityOf: (unitId: string) => string | undefined,
): EngineEvent[] {
  if (lifeMode(draft) === 'off') return [];
  const life = ensureLife(draft);
  const events: EngineEvent[] = [];
  for (const id of scene.participants) {
    const unit = unitOf(draft, id);
    if (!unit || unit.kind !== 'named') continue;
    (life.units[id] ??= { last: {} }).scene = { sceneId: scene.id, topics: [] };
    const act = activityOf(id);
    const topics = [...topicsAt(reg, { locationId: scene.locationId, ...(act !== undefined ? { activityId: act } : {}) }), ...recentEventTopics(draft, reg, id, draft.day)];
    events.push(...triggerTopics(draft, reg, [id], [...new Set(topics)], scene.id));
  }
  return events;
}

/** A scene with these women is over: what it triggered and picked is gone (the opinion directive with it). */
export function endSceneLife(draft: Pick<CampaignState, 'life'>, unitIds: readonly string[]): void {
  const life = draft.life;
  if (!life) return;
  for (const id of unitIds) if (life.units[id]?.scene !== undefined) delete life.units[id].scene;
}

/**
 * Her view on a topic is formed: the position (one of the topic's), her words (cut to 200 characters; none is allowed) and how firmly she
 * holds it (`held` from the model, `loose` from the fallback; `strong` only comes from the import or an edit). Refused for an unknown topic or
 * position and when she already has a view (an opinion is formed once). The event carries neither the position nor the words: the opinion is
 * hers until she voices it. If it was triggered in the open scene, the topic may be picked for her now.
 */
export function formOpinion(
  draft: CampaignState, reg: Registries, unitId: string, topicId: string, position: string, text: string,
  strength: 'held' | 'loose', source: 'model' | 'fallback',
): EngineEvent[] {
  const unit = unitOf(draft, unitId);
  if (!unit || unit.kind !== 'named' || !isLiving(unit)) throw new Error('An opinion is formed for a named soldier who is still with the squad.');
  const topic = topicOf(reg, topicId);
  if (!topic) throw new Error(`Unknown opinion topic "${topicId}".`);
  if (!topic.positions.some((p) => p.id === position)) throw new Error(`Topic "${topicId}" has no position "${position}".`);
  if (unit.opinions?.[topicId] !== undefined) throw new Error(`${unit.displayName} already has a view on this.`);
  const words = text.trim().slice(0, TUNING.life.opinion.textMax).trim();
  const opinion: Opinion = { position, strength, formedDay: draft.day, ...(words !== '' ? { text: words } : {}) };
  (unit.opinions ??= {})[topicId] = opinion;
  const mine = draft.life?.units[unitId];
  if (mine?.pendingTopics) mine.pendingTopics = mine.pendingTopics.filter((t) => t !== topicId);
  const picked = draft.scene?.participants.includes(unitId) ? pickTopic(draft, unitId, draft.scene.id) : [];
  return [{ type: 'opinion_formed', unitId, topicId, source }, ...picked];
}

/**
 * She said what she thinks about the picked topic of this scene: `voicedDay` is today, the pick is cleared (the directive goes with it), and
 * the commander learns it: a fact "{Name}'s view on {topic}: {her words, else the position's description}" that the commander may know.
 * Nothing for a topic that was not picked (an opinion no trigger brought up is never voiced).
 */
export function voiceOpinion(draft: CampaignState, reg: Registries, unitId: string, topicId: string): EngineEvent[] {
  const unit = unitOf(draft, unitId);
  const opinion = unit?.opinions?.[topicId];
  const topic = topicOf(reg, topicId);
  const sc = draft.life?.units[unitId]?.scene;
  if (!unit || !opinion || !topic || !sc || sc.sceneId !== draft.scene?.id || sc.topic !== topicId) return [];
  opinion.voicedDay = draft.day;
  delete sc.topic;
  const position = topic.positions.find((p) => p.id === opinion.position);
  const said = opinion.text !== undefined && opinion.text !== '' ? opinion.text : plainText(position?.description ?? '');
  addFact(draft, {
    about: [unitId], text: `${unit.displayName}'s view on ${topic.label}: ${said}`, tags: ['opinion', topicId], importance: opinion.strength === 'strong' ? 2 : 1,
    day: draft.day, knownBy: [unitId],
  });
  return [{ type: 'life_noted', unitId, topicId }];
}

/** What the commander has heard her say (THOUGHTS): the opinions she has voiced, oldest first. An opinion she has not voiced is never listed. */
export function heardOpinions(state: Pick<CampaignState, 'squad'>, unitId: string): Array<{ topicId: string; position: string; text?: string; voicedDay: number }> {
  const unit = unitOf(state, unitId);
  const out: Array<{ topicId: string; position: string; text?: string; voicedDay: number }> = [];
  for (const [topicId, o] of Object.entries(unit?.opinions ?? {})) {
    if (o.voicedDay !== undefined) out.push({ topicId, position: o.position, ...(o.text !== undefined ? { text: o.text } : {}), voicedDay: o.voicedDay });
  }
  return out.sort((a, b) => a.voicedDay - b.voicedDay || a.topicId.localeCompare(b.topicId));
}
