import type { Registries } from '../../content/types';
import { checkActivity } from '../activities';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { countMeeting } from '../development/habits';
import { restrictionReason } from '../discipline/restrictions';
import { isLiving } from '../economy';
import type { EventIntent } from '../relations/intents';
import { FIRST_KINDS } from '../relations/vocab';
import { applyEventToUnit } from '../relations/effects';
import type { CampaignState, SceneRecord, Slot, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { practise } from './hobbies';
import { commanderHobbyWord, hobbyUntold } from './known';
import { requiresHold } from './events';
import { takesPart, unitOf } from './places';
import { lifeMode, temperamentOf } from './state';
import { pastimeActivity, type HobbyEntry, type PastimeEntry } from './types';

/**
 * Quiet meetings (P14c §5): an hour with her at something with no stakes (a pastime), the commander's slot for her. Which pastimes are open
 * to her, where they are held, and what the meeting does when its scene ends (Affinity and stress by the `time_together` row; her hobby
 * practised and pushed and the commander taught, for the pastime that is her hobby). Nothing here draws from the rng, and pastimes are read
 * by field (`locations`, `slots`, `requires`, `hobby`, `talk`), never by id.
 */

const pastimesOf = (reg: Pick<Registries, 'pastimes'>): PastimeEntry[] => [...reg.pastimes.values()] as unknown as PastimeEntry[];
const hobbyEntry = (reg: Pick<Registries, 'hobbies'>, id: string): HobbyEntry | undefined => reg.hobbies.get(id) as unknown as HobbyEntry | undefined;

export { commanderHobbyWord };

/**
 * Her keenest active hobby **that the commander knows she has**: the highest interest, a tie going to the one that comes first in the registry.
 * A hobby she took up off-screen and has not told is never the one she shows (it would leak through the pastime's place and directive).
 * Undefined with none.
 */
export function keenestHobby(state: Pick<CampaignState, 'memory' | 'life'>, reg: Pick<Registries, 'hobbies'>, unit: Pick<Unit, 'id' | 'hobbies'>): NonNullable<Unit['hobbies']>[number] | undefined {
  const order = [...reg.hobbies.keys()];
  const rank = (id: string): number => { const i = order.indexOf(id); return i < 0 ? order.length : i; };
  return (unit.hobbies ?? []).filter((h) => h.state === 'active' && !hobbyUntold(state, unit.id, h.id)).sort((a, b) => b.interest - a.interest || rank(a.id) - rank(b.id))[0];
}

/** Whether a scene location is open in a slot (a location with no `slots` is always open). */
function openAt(reg: Pick<Registries, 'locations'>, locationId: string, slot: Slot): boolean {
  const loc = reg.locations.get(locationId);
  if (!loc) return false;
  const slots = loc.slots as string[] | undefined;
  return !slots || slots.includes(slot);
}

/** The scene locations a pastime may be held at: its own, or, for the pastime that is her hobby, those of her keenest active hobby. */
function candidateLocations(state: CampaignState, reg: Registries, pastime: PastimeEntry, unit: Unit | undefined): string[] {
  if (pastime.hobby !== true) return pastime.locations;
  const h = unit ? keenestHobby(state, reg, unit) : undefined;
  return h ? hobbyEntry(reg, h.id)?.locations ?? [] : [];
}

/** The scene location of a pastime today: the first of its locations that is open in the current slot, or null. `unitId` is needed for her hobby. */
export function pastimeLocation(state: CampaignState, reg: Registries, pastime: PastimeEntry, unitId?: string): string | null {
  const unit = unitId !== undefined ? unitOf(state, unitId) : undefined;
  return candidateLocations(state, reg, pastime, unit).find((id) => openAt(reg, id, state.slot)) ?? null;
}

/** Whether an open desertion is about her (she is about to walk out). */
const deserting = (state: CampaignState, unitId: string): boolean => state.disloyalty?.open?.kind === 'desertion' && state.disloyalty.open.unitId === unitId;

/**
 * Why she cannot have this quiet meeting now, or null: life off, not a named soldier at the base, hostile (Affinity at or under the floor),
 * deserting, confined or otherwise unavailable, already had one today, the slot or the place does not fit, or a requirement does not hold
 * (a run just back, her hobby, the first slot of the day). With `at` (a scene that is already open) the slot and the place are the scene's
 * and no slot is asked for; without it the pastime must be held at an open location in the current slot, and the activity itself must be doable.
 */
export function pastimeProblem(
  state: CampaignState, reg: Registries, unitId: string, pastimeId: string, at?: { locationId: string; slot: Slot },
): string | null {
  if (lifeMode(state) === 'off' || !state.life) return 'Her life is switched off.';
  const pastime = reg.pastimes.get(pastimeId) as unknown as PastimeEntry | undefined;
  if (!pastime) return `Unknown pastime "${pastimeId}".`;
  const unit = unitOf(state, unitId);
  if (!unit || unit.kind !== 'named') return 'Only a named soldier has quiet meetings.';
  const name = unit.displayName;
  if (unit.status === 'deserted' || deserting(state, unitId)) return `${name} is deserting.`;
  if (!takesPart(state, unitId)) return `${name} is not at the base.`;
  if ((state.relations[unitId]?.affinity ?? 0) <= TUNING.life.meeting.affinityMin) return `${name} wants nothing to do with the commander right now.`;
  if (state.life.units[unitId]?.meetingDay === state.day) return `${name} has had a quiet hour with the commander today.`;
  const slot = at?.slot ?? state.slot;
  if (!pastime.slots.includes(slot)) return `${pastime.label} is not for the ${slot}.`;
  if (at !== undefined) {
    if (!candidateLocations(state, reg, pastime, unit).includes(at.locationId)) return `${pastime.label} is not held here.`;
  } else {
    if (pastimeLocation(state, reg, pastime, unitId) === null) return `Nowhere is open for ${pastime.label} now.`;
    const activity = pastimeActivity(reg);
    if (!activity) return 'This pack has no time together.';
    const held = restrictionReason(state, reg, unitId, 'companion', String(activity.id));
    if (held) return held;
    const blocked = checkActivity(state, reg, { activityId: String(activity.id), companionId: unitId });
    if (blocked) return blocked;
  }
  const req = pastime.requires;
  if (req?.afterRun === true && !requiresHold(state, reg, unitId, { afterRun: {} }, state.day)) return `${pastime.label} is for after a run.`;
  if (req?.firstSlot === true && slot !== 'morning') return `${pastime.label} is for the first slot of the day.`;
  // a hobby she took up off-screen and has not told is not one the commander can ask about (the pastime would name it)
  const shown = (unit.hobbies ?? []).some((h) => h.state === 'active' && (req?.hobby === 'any' || h.id === req?.hobby) && !hobbyUntold(state, unitId, h.id));
  if (req?.hobby !== undefined && !shown) return `${pastime.label} needs a hobby ${name} does not have.`;
  if (pastime.hobby === true && keenestHobby(state, reg, unit) === undefined) return `${name} has no hobby to show.`;
  return null;
}

/**
 * The pastimes she can have now (`pastimeProblem` null), in registry order; a silent woman is offered the quiet ones before those that need
 * talk. With `at` (a scene already open) the pastimes that fit that place and slot.
 */
export function availablePastimes(state: CampaignState, reg: Registries, unitId: string, at?: { locationId: string; slot: Slot }): PastimeEntry[] {
  const open = pastimesOf(reg).filter((p) => pastimeProblem(state, reg, unitId, String(p.id), at) === null);
  if (temperamentOf(state, unitId).talkativeness !== 'silent') return open;
  return [...open.filter((p) => p.talk === 'quiet'), ...open.filter((p) => p.talk !== 'quiet')];
}

/** The commander learns something from her hobby: +2 for the meeting, +4 when it is teachable and she is past her second milestone. Returns the amount added. */
function teachCommander(draft: CampaignState, hobby: NonNullable<Unit['hobbies']>[number], entry: HobbyEntry): number {
  const t = TUNING.life.commanderSkill;
  const gain = entry.teachable && hobby.milestones.length >= 2 ? t.taught : t.meeting;
  const skill = (draft.commander.hobbySkill ??= {});
  skill[hobby.id] = Math.min(100, (skill[hobby.id] ?? 0) + gain);
  return gain;
}

/** The event the meeting applies: the `time_together` row, the commander's own (nothing reads a model report here). */
const meetingEvent = (unitId: string): EventIntent => ({ type: 'time_together', actor: 'commander', targets: [unitId], severity: 'minor', evidence: 'a quiet meeting', confidence: 1 });

/**
 * The scene of a quiet meeting ends (`scene/end` only; an aborted scene applies nothing): the `time_together` row (Affinity +2 diminishing
 * through the gain handler, stress -5), today is her meeting day, and for the pastime that is her hobby her keenest active hobby is practised
 * with a push (a plateau breaks, told at once because the commander was there) and the commander learns a little. The first time the commander
 * is taught a hobby by her writes `hobby_taught` (the memory rule `taught_commander`).
 */
export function finishMeeting(draft: CampaignState, ctx: EngineCtx, scene: Pick<SceneRecord, 'pastime'>): EngineEvent[] {
  const meeting = scene.pastime;
  const unit = meeting ? unitOf(draft, meeting.unitId) : undefined;
  const reg = ctx.registries;
  if (!meeting || !unit || unit.kind !== 'named' || !draft.life) return [];
  const pastime = reg.pastimes.get(meeting.id) as unknown as PastimeEntry | undefined;
  const events = applyEventToUnit(draft, reg, unit.id, meetingEvent(unit.id));
  events.push(...countMeeting(draft, reg, unit.id)); // P15: the habit `asks_advice` counts the meetings she finished
  const mine = (draft.life.units[unit.id] ??= { last: {} });
  mine.meetingDay = draft.day;
  if (pastime?.hobby !== true) return events;
  const keen = keenestHobby(draft, reg, unit);
  const entry = keen ? hobbyEntry(reg, keen.id) : undefined;
  if (!keen || !entry) return events;
  events.push(...practise(draft, reg, unit.id, keen.id, draft.day, draft.slot, { push: true, caused: true }));
  const gain = teachCommander(draft, keen, entry);
  const taught = (mine.taught ??= []);
  if (gain === TUNING.life.commanderSkill.taught && !taught.includes(keen.id)) { // she teaches (not just shows), for the first time
    taught.push(keen.id);
    events.push({ type: 'hobby_taught', unitId: unit.id, hobbyId: keen.id });
  }
  if (taught.length === 0) delete mine.taught;
  return events;
}

/** The first moments (kinds of `FIRST_KINDS`) she and the commander have not had yet, in the order of the vocabulary. */
export function missingFirsts(state: Pick<CampaignState, 'life'>, unitId: string): string[] {
  const had = state.life?.units[unitId]?.firsts ?? [];
  return FIRST_KINDS.filter((k) => !had.includes(k));
}

/**
 * A first between her and the commander is kept, once per kind: it is recorded in her `firsts`, its row (`first_moment`: Affinity +2,
 * diminishing through the gain handler, with its journal phrase) is applied and `first_moment_kept` is emitted, which the six `first_<kind>`
 * memory rules turn into a fact. A kind outside the vocabulary, a kind the pair already had and a woman who is not named and living
 * change nothing. `ev` is the reported event (its severity and confidence are kept).
 */
export function keepFirst(draft: CampaignState, ctx: EngineCtx, unitId: string, kind: string, ev?: EventIntent): EngineEvent[] {
  const unit = unitOf(draft, unitId);
  if (!unit || unit.kind !== 'named' || !isLiving(unit) || !draft.life || !(FIRST_KINDS as readonly string[]).includes(kind)) return [];
  const mine = (draft.life.units[unitId] ??= { last: {} });
  if ((mine.firsts ?? []).includes(kind)) return [];
  (mine.firsts ??= []).push(kind);
  const event: EventIntent = ev ?? { type: 'first_moment', actor: unitId, targets: [], severity: 'minor', evidence: 'a first', confidence: 1, kind };
  return [...applyEventToUnit(draft, ctx.registries, unitId, event), { type: 'first_moment_kept', unitId, kind }];
}
