/**
 * Demonstrations (P16, plan R9, spec §5): she shows her hold over the commander before others. The engine decides whether she may (the gate in `audience.ts`) and who watches
 * (`pickAudience`); the model words the form. The card is `[ GO ] [ REFUSE ]`: GO opens a group scene at the stage (her and the units on the card; the others are narrated), and
 * when that scene ends the outcomes land once (`demonstrationEnded`): each of the audience knows (P15 `knowInstantly`, or reacts again if she already knew), her hold, track xp, Want relief,
 * what she keeps of the commander, a deed and the memory event. Serving one holder before another is a demonstration of one (`serviceSeen`), and an `indifferent` holder's kept task may be seen
 * by chance (`seenByChance`). Nothing here draws: every chance is `practiceRoll`.
 */
import type { Registries } from '../../content/types';
import { relieveWant } from '../bonds/want';
import { countDeed } from '../discipline/deeds';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { addCompromat } from '../dynamic/compromat';
import { notePractised } from '../dynamic/drawn';
import { addHold } from '../dynamic/hold';
import { addSign, knowInstantly, levelOf } from '../dynamic/knowledge';
import { practiceOf } from '../dynamic/profile';
import { reactToDynamic } from '../dynamic/reactions';
import { addTrackXp } from '../dynamic/tracks';
import { isLiving } from '../economy';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { demonstrationGate, HUMBLING_TAG, isHumbling, pickAudience, stageOf } from './audience';
import { ensurePractices, nextPracticeId, practiceLive } from './gate';
import { atBase } from './offences';
import type { OpenDemonstration, PracticeRequest, Task, ValidOutput } from './state';
import { practiceRoll } from './state';
import { refusePractice, type Writer } from './tasks';

export { demonstrationGate, isHumbling, pickAudience, stageOf };

/** The kinds of answer to a demonstration card. */
export type DemonstrationAnswer = 'go' | 'refuse';

const nameOf = (state: CampaignState, id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;
const joinNames = (names: string[]): string => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/** The scene a GO opens: where, who comes, and that it costs the commander's slot (the scene is the demonstration). */
export interface DemonstrationScene { locationId: string; participants: string[]; origin: 'event'; consumesSlot: true }

/**
 * Her demonstration, from a card: the engine picks the audience (the model may name who, among the eligible, and in what order; with no valid name the pick stands), the stage and the slot,
 * and the card waits for the commander's answer (`offered`). Nothing is written when she may not stage it now (the gate reads the card). The event is `task_issued` of kind `demonstration`
 * (its `taskId` is the demonstration's id): the controller delivers it like a task.
 */
export const writeDemonstration: Writer = (draft, ctx, request, out, plain) => {
  const reg = ctx.registries;
  if (demonstrationGate(draft, reg, request.holderId, { tags: out.tags, tier: out.tier }) !== null) return [];
  const slot = TUNING.practice.demonstration.slot;
  const pool = pickAudience(draft, reg, request.holderId, slot);
  const all = [...pool.cards, ...pool.narrated];
  if (all.length === 0) return [];
  const asked = (out.audienceIds ?? []).filter((id) => all.includes(id));
  const cards = (asked.length > 0 ? asked : pool.cards).slice(0, TUNING.practice.demonstration.cardsMax);
  const narrated = all.filter((id) => !cards.includes(id));
  const id = nextPracticeId(draft, 'pd');
  const demonstration: OpenDemonstration = {
    id, holderId: request.holderId, tags: [...out.tags], summary: out.summary, text: out.text, ...(plain ? { plain: true as const } : {}), audienceIds: cards,
    ...(narrated.length > 0 ? { narrated } : {}), stage: stageOf(slot), slot, day: draft.day, status: 'offered', stakes: out.stakes, tier: out.tier, track: out.track,
    ...(out.seedId !== undefined ? { seedId: out.seedId } : {}), requestId: request.id,
  };
  ensurePractices(draft).demonstrations.push(demonstration);
  return [{ type: 'task_issued', taskId: id, holderId: request.holderId, unitId: request.holderId, kind: 'demonstration', requestId: request.id, ...(plain ? { plain: true } : {}) }];
};

/** The units of the audience who are still there to watch: living, named, at base. */
const stillThere = (draft: CampaignState, d: OpenDemonstration, ids: readonly string[]): string[] => {
  const here = atBase(draft, d.holderId);
  return ids.filter((id) => here.includes(id));
};

/** A demonstration that waits for the commander (`offered`) or whose GO has not opened its scene yet (`open`, no scene). */
const isWaiting = (d: OpenDemonstration): boolean => d.status === 'offered' || (d.status === 'open' && d.sceneId === undefined);

function demonstrationOf(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, id: string): OpenDemonstration {
  const d = draft.practices?.demonstrations.find((x) => x.id === id);
  if (d === undefined) throw new Error('That demonstration is gone.');
  if (!practiceLive(draft, ctx.registries, d.holderId)) throw new Error('She is not holding now.');
  if (!isWaiting(d)) throw new Error('That demonstration has been answered.');
  return d;
}

/**
 * The commander answers a demonstration card. REFUSE is a refusal of a task at its stakes (`refusePractice`: the P9 path, and an offence at `role` or beyond). GO checks that someone is
 * still there to watch (when nobody is the demonstration is void, no cost), marks it `open` and says the scene to open: the event `task_answered` carries it (`scene`), the controller opens
 * it. A GO that did not get its scene (the scene could not start) may be pressed again. Throws for a demonstration that is gone, answered, hers while she is not holding, or a GO in another slot than the one she named.
 */
export function answerDemonstration(draft: CampaignState, ctx: EngineCtx, id: string, answer: DemonstrationAnswer): { events: EngineEvent[]; scene?: DemonstrationScene } {
  const d = demonstrationOf(draft, ctx, id);
  if (answer === 'refuse') {
    d.status = 'refused';
    d.answeredDay = draft.day;
    delete d.sceneId;
    return { events: [{ type: 'task_answered', taskId: id, holderId: d.holderId, answer: 'refuse', what: 'demonstration' }, ...refusePractice(draft, ctx, d.holderId, { ref: d.id, stakes: d.stakes ?? 'minor', summary: d.summary })] };
  }
  if (answer !== 'go') throw new Error('Unknown answer.');
  if (draft.scene !== undefined) throw new Error('A scene is open: end it first.');
  const slot = d.slot ?? TUNING.practice.demonstration.slot;
  if (draft.slot !== slot) throw new Error(`She wants it in the ${slot}.`); // the stage and the audience were picked for that slot (R9)
  const cards = stillThere(draft, d, d.audienceIds);
  const narrated = stillThere(draft, d, d.narrated ?? []);
  if (cards.length === 0 && narrated.length === 0) {
    d.status = 'void';
    return { events: [{ type: 'task_void', taskId: id, holderId: d.holderId, what: 'demonstration', reason: 'gone' }] };
  }
  const here = [...cards, ...narrated];
  d.audienceIds = here.slice(0, TUNING.practice.demonstration.cardsMax);
  if (here.length > d.audienceIds.length) d.narrated = here.slice(d.audienceIds.length);
  else delete d.narrated;
  d.status = 'open';
  d.answeredDay = draft.day;
  const scene: DemonstrationScene = { locationId: d.stage, participants: [d.holderId, ...d.audienceIds], origin: 'event', consumesSlot: true };
  return { events: [{ type: 'task_answered', taskId: id, holderId: d.holderId, answer: 'go', what: 'demonstration', scene }], scene };
}

/** She knows of it now, or, when she knew already, reacts again (R9). */
function shown(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, observerId: string, holderId: string): EngineEvent[] {
  return levelOf(draft, observerId, holderId) === 'knows_dynamic' ? reactToDynamic(draft, ctx, observerId, holderId) : knowInstantly(draft, ctx, observerId, holderId, 'demonstration');
}

/**
 * The scene of a demonstration ended (R9): each of the audience, on the card or narrated, knows (or reacts again); the holder's hold rises, her track gets xp (`public_humiliation` for a
 * humbling one, else `service`), her Want is relieved by her appetite, she keeps what was seen (compromat, the audience its witnesses), the deed is counted, and `demonstration_staged`
 * then one `demonstration_seen` each are said. A humbling one before others also ends the suppression of the squad leader's outside perception (the commander's feat is no longer the
 * last thing outsiders saw). A holder who stopped being live in the meantime has nothing staged: it is void.
 */
export function demonstrationEnded(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, d: OpenDemonstration): EngineEvent[] {
  const reg = ctx.registries;
  const holderId = d.holderId;
  delete d.sceneId;
  if (!practiceLive(draft, reg, holderId)) {
    d.status = 'void';
    return [{ type: 'task_void', taskId: d.id, holderId, what: 'demonstration', reason: 'gone' }];
  }
  const humbling = isHumbling(d.tags);
  const watchers = [...new Set([...d.audienceIds, ...(d.narrated ?? [])])].filter((id) => id !== holderId && draft.squad.some((u) => u.id === id && u.kind === 'named' && isLiving(u)));
  const events: EngineEvent[] = [];
  for (const id of watchers) events.push(...shown(draft, ctx, id, holderId));
  const T = TUNING.practice.demonstration;
  events.push(...addHold(draft, ctx, holderId, T.hold, 'demonstration'));
  events.push(...addTrackXp(draft, reg, holderId, humbling ? HUMBLING_TAG : 'service', TUNING.practice.xp.demonstration));
  const appetite = practiceOf(draft, reg, holderId)?.categories[humbling ? HUMBLING_TAG : 'service']?.as;
  if (appetite === 'craves' || appetite === 'enjoys' || appetite === 'tolerates') events.push(...relieveWant(draft, holderId, T.wantRelief[appetite], 'demonstration'));
  addCompromat(draft, holderId, T.compromat.replaceAll('{names}', joinNames(watchers.map((id) => nameOf(draft, id)))).replaceAll('{name}', nameOf(draft, holderId)).replaceAll('{what}', d.summary), watchers);
  countDeed(draft, 'demonstrated');
  d.status = 'done';
  notePractised(draft, reg, holderId, d.seedId ?? 'demonstration', d.tags); // P15b
  d.observed = watchers;
  events.push({ type: 'demonstration_staged', demonstrationId: d.id, unitId: holderId, holderId, audienceIds: watchers, humbling, summary: d.summary });
  for (const id of watchers) events.push({ type: 'demonstration_seen', demonstrationId: d.id, holderId, observerId: id, unitId: id });
  // outside (B4): only a humbling one is seen outside, and it ends a suppression that a feat of the commander set
  const hierarchy = draft.power?.hierarchy;
  if (humbling && hierarchy?.outsideSuppressedUntil !== undefined && hierarchy.outsideSuppressedUntil > draft.day) hierarchy.outsideSuppressedUntil = draft.day;
  return events;
}

/** A card nobody answered within `offerDays` is void (no cost, no delta); one whose GO never got its scene counts too. */
export function expireDemonstrations(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const d of draft.practices?.demonstrations ?? []) {
    if (!isWaiting(d) || d.day + TUNING.practice.demonstration.offerDays > draft.day || !practiceLive(draft, ctx.registries, d.holderId)) continue;
    d.status = 'void';
    events.push({ type: 'task_void', taskId: d.id, holderId: d.holderId, what: 'demonstration', reason: 'expired' });
  }
  return events;
}

/**
 * An `indifferent` holder stages nothing, but a task of hers kept in person in a room with others may be seen by chance (R9): each other unit gets `step_behind` when
 * `practiceRoll(observer, 'seen:' + taskId)` is under `seenByChance`. `peers` are the others who were in the scene (the open scene's, or the ones the task saw come in).
 */
export function seenByChance(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, task: Pick<Task, 'id' | 'holderId' | 'proof'>, peers: readonly string[]): EngineEvent[] {
  const reg: Registries = ctx.registries;
  if (task.proof !== 'in_person' || practiceOf(draft, reg, task.holderId)?.audience !== 'indifferent' || !practiceLive(draft, reg, task.holderId)) return [];
  const events: EngineEvent[] = [];
  for (const id of peers) {
    if (id === task.holderId || !draft.squad.some((u) => u.id === id && u.kind === 'named' && isLiving(u))) continue;
    if (practiceRoll(draft, id, `seen:${task.id}`) < TUNING.practice.demonstration.seenByChance) events.push(...addSign(draft, ctx, id, task.holderId, 'step_behind'));
  }
  return events;
}

/**
 * Serving one holder before another is a demonstration of one (spec §6, R9): when the commander takes a service activity of the dynamic (`scope: dynamic`, `actor: commander`) in a
 * scene where more than one live holder is present, the first of them in the scene is the one served and each other holder present knows of it at once, and reacts by her own witness
 * attitude (a `possessive` or `cruel` rival competes: P15 R14). Once for a pair (`knowInstantly` answers nothing when she knew). Reads the event `blocking_changed`.
 */
export function serviceSeen(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, events: readonly EngineEvent[]): EngineEvent[] {
  const scene = draft.scene;
  if (scene === undefined) return [];
  const reg = ctx.registries;
  const out: EngineEvent[] = [];
  for (const e of events) {
    if (e.type !== 'blocking_changed' || e.person !== 'commander' || e.field !== 'activity' || typeof e.value !== 'string') continue;
    const activity = reg.blockingActivities.get(e.value);
    if (activity === undefined || activity.scope !== 'dynamic' || activity.actor !== 'commander') continue;
    const holders = scene.participants.filter((id) => practiceLive(draft, reg, id));
    if (holders.length < 2) continue;
    for (const other of holders.slice(1)) out.push(...knowInstantly(draft, ctx, other, holders[0], 'demonstration'));
  }
  return out;
}

/**
 * The after-action of the demonstrations (registered by `actions/practice.ts`): a scene opened with her at the stage after GO holds the demonstration; when it ends the outcomes land
 * (`demonstrationEnded`); an aborted one leaves the card to be pressed again; a service activity before another holder is seen (`serviceSeen`). Nothing while none is open.
 */
export function demonstrationsFromEvents(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, events: readonly EngineEvent[]): EngineEvent[] {
  const out: EngineEvent[] = [...serviceSeen(draft, ctx, events)];
  const p = draft.practices;
  if (p === undefined) return out;
  for (const e of events) {
    if (e.type === 'scene_started') {
      const present = Array.isArray(e.participants) ? (e.participants as string[]) : [];
      for (const d of p.demonstrations) {
        if (d.status === 'open' && d.sceneId === undefined && present.includes(d.holderId) && e.locationId === d.stage && d.audienceIds.every((id) => present.includes(id))) d.sceneId = String(e.sceneId);
      }
    } else if (e.type === 'scene_ended') {
      for (const d of p.demonstrations) if (d.status === 'open' && d.sceneId === e.sceneId) out.push(...demonstrationEnded(draft, ctx, d));
    } else if (e.type === 'scene_aborted') {
      for (const d of p.demonstrations) if (d.status === 'open' && d.sceneId === e.sceneId) { delete d.sceneId; d.status = 'offered'; }
    }
  }
  return out;
}
