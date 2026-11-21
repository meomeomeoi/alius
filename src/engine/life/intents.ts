import type { Registries } from '../../content/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import type { EventIntent } from '../relations/intents';
import type { CampaignState, SceneRecord } from '../state/types';
import { TUNING } from '../tuning';
import { bumpInterest, pushHobby } from './hobbies';
import { closeNews, pendingNews } from './news';
import { returnJoke, jokeCandidates } from './jokes';
import { keepFirst, missingFirsts } from './meetings';
import { plainText } from './facts';
import { agreeOpinion, challengeOpinion, voiceOpinion } from './opinions';
import { unitOf } from './places';
import { applyRelationDelta } from '../relationGain';
import { lifeMode, temperamentOf } from './state';
import type { HobbyEntry, LifeOffer, OpinionTopicEntry } from './types';

export type { LifeOffer } from './types';

/**
 * The seven things the intent model may report about her life (P14c): her news told, a hobby praised, an opinion voiced, argued or agreed
 * with, a first moment and a joke come back. This module builds what is offered (from the state, every time) and routes what was reported
 * (after `validateIntents` kept only what was offered). It draws no rng and reads the registries by field, never by id.
 */

/** The model reports these types; only the engine decides what they do. */
export const LIFE_INTENT_TYPES = ['news_told', 'hobby_praised', 'opinion_voiced', 'opinion_challenged', 'opinion_agreed', 'first_moment', 'joke_returned'] as const;

/**
 * The lists the model may name, for the women in `participants` (named, living). Absent (`{}`) while life is off or when every list is empty.
 * In a DM only her news and her hobbies are offered; in a scene her voiced opinions (and the one picked for the scene), the jokes and, in a
 * private scene, the firsts too.
 */
export function lifeIntentInput(
  state: CampaignState, reg: Registries, participants: readonly string[], scene: SceneRecord | null, channel: 'scene' | 'dm',
): { life?: LifeOffer } {
  if (lifeMode(state) === 'off' || !state.life) return {};
  const offer: LifeOffer = { news: [], hobbies: [], topics: [], jokes: [], firsts: false, firstKinds: [] };
  const present = participants.map((id) => unitOf(state, id)).filter((u): u is NonNullable<typeof u> => u !== undefined && u.kind === 'named' && isLiving(u));
  for (const unit of present) {
    const first = pendingNews(state, unit.id)[0];
    if (first) offer.news.push({ id: first.itemId, unitId: unit.id, text: first.text });
    for (const h of unit.hobbies ?? []) {
      if (h.state !== 'active') continue;
      const entry = reg.hobbies.get(h.id) as unknown as HobbyEntry | undefined;
      if (entry) offer.hobbies.push({ id: h.id, unitId: unit.id, label: entry.label });
    }
    if (channel !== 'scene' || scene === null) continue;
    const sc = state.life.units[unit.id]?.scene;
    const picked = sc?.sceneId === scene.id ? sc.topic : undefined;
    const triggered = sc?.sceneId === scene.id ? sc.topics : [];
    // what may be argued or agreed with: the topics triggered in this scene that she has voiced, and her five most recently voiced ones
    const voiced = Object.entries(unit.opinions ?? {}).filter(([, o]) => o.voicedDay !== undefined);
    const recent = [...voiced].sort((a, b) => b[1].voicedDay! - a[1].voicedDay! || a[0].localeCompare(b[0])).slice(0, TUNING.life.opinion.offerVoiced).map(([id]) => id);
    const listed = new Set([...voiced.map(([id]) => id).filter((id) => triggered.includes(id)), ...recent]);
    for (const [topicId, o] of Object.entries(unit.opinions ?? {})) {
      const isPick = picked === topicId;
      const isVoiced = o.voicedDay !== undefined && listed.has(topicId);
      if (!isPick && !isVoiced) continue;
      const topic = reg.opinionTopics.get(topicId) as unknown as OpinionTopicEntry | undefined;
      if (!topic) continue;
      const view = isVoiced ? topic.positions.find((p) => p.id === o.position)?.description : undefined; // known to the commander: she has told it
      offer.topics.push({
        id: topicId, unitId: unit.id, label: topic.label, positions: topic.positions.map((p) => p.id),
        ...(isPick ? { pick: true as const } : {}), ...(isVoiced ? { voiced: true as const } : {}),
        ...(view !== undefined ? { view: plainText(view) } : {}),
      });
    }
  }
  if (channel === 'scene' && scene !== null && scene.mode === 'private' && present.length === 1) {
    offer.firstKinds = missingFirsts(state, present[0].id); // only what the pair has not had yet
    offer.firsts = offer.firstKinds.length > 0;
    offer.jokes.push(...jokeCandidates(state, present[0].id, state.day).map((j) => ({ ...j, unitId: present[0].id })));
  }
  const empty = offer.news.length + offer.hobbies.length + offer.topics.length + offer.jokes.length === 0 && !offer.firsts;
  return empty ? {} : { life: offer };
}

/**
 * Routes one reported event of her life to its effect, after `applyEventToUnit` has applied the row of its type. `unitId` is the woman it is
 * about. The seven types return their own events; a type with nothing to do (or an id that is gone by now) returns none.
 */
export function applyLifeIntent(draft: CampaignState, ctx: EngineCtx, unitId: string, ev: EventIntent): EngineEvent[] {
  const reg = ctx.registries;
  switch (ev.type) {
    case 'news_told': {
      if (ev.newsId === undefined) return [];
      const item = draft.life?.queue.find((q) => q.id === ev.newsId && q.unitId === unitId);
      const closed = closeNews(draft, ev.newsId);
      // telling a hobby item is company for the hobby (sharing: interest +5)
      if (item?.kind === 'hobby' && closed.length > 0) closed.push(...bumpInterest(draft, unitId, item.ref, TUNING.life.interest.share, draft.day));
      return closed;
    }
    case 'hobby_praised':
      // the commander is there: a plateau she was on breaks and the step is told in the scene (not queued)
      return ev.hobbyId === undefined ? [] : pushHobby(draft, reg, unitId, ev.hobbyId, draft.day, { caused: true });
    case 'opinion_voiced':
      // only the topic picked for this scene (the offer was rebuilt from it); a topic nothing triggered is never voiced
      return ev.topicId === undefined ? [] : voiceOpinion(draft, reg, unitId, ev.topicId);
    case 'opinion_challenged': {
      if (ev.topicId === undefined) return [];
      // a minor or moderate challenge counts 1, a major or extreme one 2; a moody woman takes a major one to heart (-1 Affinity)
      const heavy = ev.severity === 'major' || ev.severity === 'extreme';
      const events = challengeOpinion(draft, reg, unitId, ev.topicId, heavy ? 2 : 1, ev.positionId);
      if (heavy && temperamentOf(draft, unitId).volatility === 'moody') {
        const applied = applyRelationDelta(draft, unitId, 'affinity', TUNING.life.opinion.moodyHit, 'intent:opinion_challenged');
        if (applied !== 0) events.push({ type: 'relation_changed', unitId, axis: 'affinity', delta: applied, applied });
      }
      return events;
    }
    case 'opinion_agreed':
      return ev.topicId === undefined ? [] : agreeOpinion(draft, ctx, unitId, ev.topicId, ev);
    case 'first_moment':
      return ev.kind === undefined ? [] : keepFirst(draft, ctx, unitId, ev.kind, ev);
    case 'joke_returned':
      return ev.factId === undefined ? [] : returnJoke(draft, reg, unitId, ev.factId, draft.day);
    default:
      return [];
  }
}

/** The events whose own row `applyIntents` leaves to `applyLifeIntent` (an agreement is worth something only on a strong opinion; a first only the first time). */
export const ROW_IS_CONDITIONAL: readonly string[] = ['opinion_agreed', 'first_moment'];
