/**
 * Duty against the hold (P16, plan R12): when something that cannot wait comes while the commander is held (an expedition launch, a mission whose deadline is today, a knock at the door
 * in the Night), the holder answers it herself, by her values, her style and her frame: she lets the commander go (`release`), lets go late, the squad having waited (`release_late`),
 * or keeps the commander (`keep`). Keeping a launch lets the squad leave without the commander (Task 28); keeping a knock ignores it with its own cost. The commander answers a keep
 * with ACCEPT, ARGUE (one exchange; a compromise reached turns it into a late release) or DEFY (the hold ends, an offence of hers). One alarm is open at a time. Nothing here draws: her
 * answer is the formula and the hashed roll `practiceRoll(holderId, 'alarm:' + id)`.
 */
import type { Registries } from '../../content/types';
import { addRecord } from '../discipline/record';
import { consumeSlots } from '../calendar';
import { runHandler, type EngineCtx, type EngineEvent } from '../dispatch';
import { valuesOf } from '../development/profile';
import { addHold } from '../dynamic/hold';
import { refusalCost } from '../dynamic/milestones';
import { dynamicOf } from '../dynamic/state';
import { practiceOf } from '../dynamic/profile';
import type { EventIntent } from '../relations/intents';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { endHold, extendHold } from './hold';
import { heldLocation, heldNow, posOf } from './held';
import { ensurePractices, nextPracticeId } from './gate';
import { atBase, noteOffence } from './offences';
import { ALARM_KINDS, practiceRoll, type AlarmAnswer, type AlarmKind, type HeldState, type OpenAlarm } from './state';

const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The units a launch names, from its payload (the party that waits when she lets the commander go late). */
const partyOf = (payload: unknown): string[] => (isObj(payload) ? strs(payload.unitIds) : []);

/**
 * What she decides about a duty (R12), deterministic: the score is `values.mercy x 1 + values.corporate x 0.5`, plus her style (`possessive` -1, `cruel` -1.5, `affectionate` +1, `drill` +0.5),
 * plus her frame (`play` 0, `role` -0.5, `rule` -1), plus her roll for this alarm minus one half. At `TUNING.practice.alarm.release` (0.5) or more she releases, at `late` (-0.5) or more she
 * releases late, else she keeps. A holder who is in the party of the launch always releases. Reads only.
 */
export function alarmAnswer(state: CampaignState, reg: Registries, holderId: string, kind: AlarmKind, alarmId: string, payload?: unknown): AlarmAnswer {
  const T = TUNING.practice.alarm;
  if (kind === 'launch' && partyOf(payload).includes(holderId)) return 'release';
  const unit = state.squad.find((u) => u.id === holderId);
  const values = unit === undefined ? undefined : valuesOf(unit);
  const style = practiceOf(state, reg, holderId)?.style.primary;
  const frame = dynamicOf(state, holderId)?.frame;
  const score = (values?.mercy ?? 0) * T.mercy + (values?.corporate ?? 0) * T.corporate + (style === undefined ? 0 : T.style[style] ?? 0)
    + (frame === 'play' || frame === 'role' || frame === 'rule' ? T.frame[frame] : 0) + practiceRoll(state, holderId, `alarm:${alarmId}`) - 0.5;
  return score >= T.release ? 'release' : score >= T.late ? 'release_late' : 'keep';
}

/** The event an alarm's answer makes: the model-facing and memory-facing one. `party` is who waited (a launch's units). */
const alarmEvent = (alarm: OpenAlarm, answer: AlarmAnswer, extra: Record<string, unknown> = {}): EngineEvent => ({
  type: 'hold_alarm', alarmId: alarm.id, kind: alarm.kind, holderId: alarm.holderId, unitId: alarm.holderId, answer, ...(alarm.kind === 'launch' ? { party: partyOf(alarm.payload) } : {}), ...extra,
});

/** Closes the alarm record and its mark on the hold. */
function closeAlarm(draft: CampaignState, alarm: OpenAlarm): void {
  const p = draft.practices;
  if (p?.alarm?.id === alarm.id) delete p.alarm;
  if (p?.held?.alarm === alarm.id) delete p.held.alarm;
}

/** Each named unit at base takes in what it cost them to wait (late) or to be left (kept). */
function recordAll(draft: CampaignState, holderId: string, amount: number, reason: string): EngineEvent[] {
  return atBase(draft, holderId).flatMap((id) => addRecord(draft, id, amount, reason));
}

/** Release: the hold ends at once, hold falls a little (the squad never knew). */
function release(draft: CampaignState, ctx: EngineCtx, alarm: OpenAlarm): EngineEvent[] {
  closeAlarm(draft, alarm);
  return [...endHold(draft, ctx, 'alarm'), ...addHold(draft, ctx, alarm.holderId, -TUNING.practice.alarm.releaseHold, 'alarm_release')];
}

/**
 * Release late: the squad waited. A launch spends one slot first (while one is left in the day; a launch that is then too late fails its own departure check), each named unit at base
 * records +3, and the hold ends. A deadline or a knock spends none: the hold ends now. `spend` is false when the commander argued for it (the argument was the wait).
 */
function releaseLate(draft: CampaignState, ctx: EngineCtx, alarm: OpenAlarm, spend: boolean): EngineEvent[] {
  const events: EngineEvent[] = [];
  if (spend && alarm.kind === 'launch' && (draft.slot === 'morning' || draft.slot === 'afternoon')) events.push(...consumeSlots(draft, 1, ctx));
  events.push(...recordAll(draft, alarm.holderId, TUNING.practice.alarm.lateRecord, 'waited'));
  closeAlarm(draft, alarm);
  events.push(...endHold(draft, ctx, 'alarm'));
  return events;
}

/** Keep: the squad is left; the alarm stays open (a launch without the commander can be made while it does). */
const keep = (draft: CampaignState, alarm: OpenAlarm): EngineEvent[] => recordAll(draft, alarm.holderId, TUNING.practice.alarm.keepRecord, 'left_behind');

/** Opens an alarm for the hold and applies her answer. The caller has checked that the commander is held and that no alarm is open. */
function openAlarm(draft: CampaignState, ctx: EngineCtx, held: HeldState, kind: AlarmKind, payload: unknown): EngineEvent[] {
  const p = ensurePractices(draft);
  const id = nextPracticeId(draft, 'pa');
  const answer = alarmAnswer(draft, ctx.registries, held.by, kind, id, payload);
  const alarm: OpenAlarm = { id, holderId: held.by, kind, day: draft.day, slot: draft.slot, ...(payload !== undefined ? { payload } : {}) };
  if (answer === 'release') {
    const events: EngineEvent[] = [alarmEvent(alarm, answer)];
    p.alarm = { ...alarm, answer };
    return [...events, ...release(draft, ctx, p.alarm)];
  }
  alarm.answer = answer;
  p.alarm = alarm;
  held.alarm = id;
  const events: EngineEvent[] = [alarmEvent(alarm, answer)];
  return [...events, ...(answer === 'release_late' ? releaseLate(draft, ctx, alarm, true) : keep(draft, alarm))];
}

/** What the payload of each kind must name; the reason it does not, or `null`. */
function payloadProblem(draft: CampaignState, kind: AlarmKind, payload: unknown): string | null {
  if (kind === 'launch') return isObj(payload) ? null : 'A launch alarm needs the launch.';
  if (kind === 'deadline') return isObj(payload) && typeof payload.missionId === 'string' && draft.missions.offered.some((m) => m.id === payload.missionId) ? null : 'A deadline alarm needs a mission that is on the board.';
  return draft.slot === 'night' && draft.calendar.nightEvent !== undefined ? null : 'There is no knock to weigh.';
}

/**
 * `practice/raise_alarm { kind, payload }`: a duty came while the commander is held (the UI dispatches it when the guard refuses a launch or a knock with `held_alarm`). Her answer is
 * decided and applied at once (`hold_alarm`); a `keep` stays open for the commander's answer. Throws while the commander is not held, while an alarm is open or with a payload that does not fit.
 */
export function raiseAlarm(draft: CampaignState, ctx: EngineCtx, kind: unknown, payload: unknown): EngineEvent[] {
  const held = heldNow(draft);
  if (held === null) throw new Error('The commander is not held.');
  if (draft.practices?.alarm !== undefined) throw new Error('An alarm is already open.');
  if (typeof kind !== 'string' || !(ALARM_KINDS as readonly string[]).includes(kind)) throw new Error('Unknown alarm.');
  const problem = payloadProblem(draft, kind as AlarmKind, payload);
  if (problem !== null) throw new Error(problem);
  return openAlarm(draft, ctx, held, kind as AlarmKind, payload);
}

/**
 * The deadlines that came while the commander is held (called after an action that starts a hold or passes a slot): an offered mission whose deadline is today or past raises its alarm once
 * for the hold. Never throws (it runs after every such action); nothing while no hold, an alarm already open or no mission that is due.
 */
export function deadlineAlarms(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const held = heldNow(draft);
  if (held === null || draft.practices?.alarm !== undefined) return [];
  const due = draft.missions.offered.find((m) => m.deadlineDay !== undefined && m.deadlineDay <= draft.day && !(held.alarmed ?? []).includes(m.id));
  if (due === undefined) return [];
  held.alarmed = [...(held.alarmed ?? []), due.id];
  return openAlarm(draft, ctx, held, 'deadline', { missionId: due.id });
}

/** After-action: a hold started or a slot passed. */
export function alarmsFromEvents(draft: CampaignState, ctx: EngineCtx, events: readonly EngineEvent[]): EngineEvent[] {
  return events.some((e) => e.type === 'hold_started' || e.type === 'slot_advanced' || e.type === 'day_started') ? deadlineAlarms(draft, ctx) : [];
}

/** The open alarm the commander may answer: it exists, is this one and is a `keep`. Throws with the reason otherwise. */
function answerable(draft: CampaignState, alarmId: string): OpenAlarm {
  const alarm = draft.practices?.alarm;
  if (alarm === undefined || alarm.id !== alarmId || draft.practices?.held === undefined) throw new Error('That alarm is gone.');
  if (alarm.answer !== 'keep') throw new Error('There is nothing left to answer.');
  return alarm;
}

/**
 * `practice/answer_alarm { alarmId, answer }` on a `keep`. ACCEPT stands with her answer (a knock is then ignored with its cost, once); ARGUE opens a one-exchange scene with her
 * (`scene` on the event: origin `event`, no slot), once; DEFY ends the hold, costs what a defiance costs and is an offence of hers (`hold_defied`, major): the action may then go on.
 * Throws for an alarm that is gone, not a keep, or an argument already had.
 */
export function answerAlarm(draft: CampaignState, ctx: EngineCtx, alarmId: string, answer: unknown): EngineEvent[] {
  const alarm = answerable(draft, alarmId);
  if (answer === 'accept') {
    if (alarm.accepted === true) return [];
    alarm.accepted = true;
    if (alarm.kind !== 'night') return [alarmEvent(alarm, 'keep', { phase: 'accept' })];
    closeAlarm(draft, alarm);
    return [alarmEvent(alarm, 'keep', { phase: 'accept' }), ...runHandler('night/ignore', draft, {}, ctx)]; // the knock goes unanswered, with its own cost; the one slot is spent once
  }
  if (answer === 'argue') {
    if (alarm.argued === true) throw new Error('The commander has argued already.');
    alarm.argued = true;
    const at = heldLocation(draft, ctx.registries) ?? 'quarters_unit';
    return [alarmEvent(alarm, 'keep', { phase: 'argue', scene: { locationId: at, participants: [alarm.holderId], origin: 'event', consumesSlot: false } })];
  }
  if (answer !== 'defy') throw new Error('Unknown answer.');
  const held = draft.practices!.held!;
  held.defied = true;
  closeAlarm(draft, alarm);
  const events: EngineEvent[] = [alarmEvent(alarm, 'keep', { phase: 'defy' }), ...endHold(draft, ctx, 'defied')];
  events.push(...refusalCost(draft, ctx, alarm.holderId, 'defy'));
  events.push(...noteOffence(draft, ctx, alarm.holderId, { kind: 'hold_defied', ref: alarm.id, stakes: 'major', day: draft.day }));
  return events;
}

/**
 * A talk reached a compromise over the hold (`compromise_reached { alarmId }`, offered only for a keep that was argued): the keep becomes a late release (no slot is spent: the argument
 * was the wait). Nothing for an alarm that is not hers, was not argued or is not a keep. Returns the events.
 */
export function compromiseAlarm(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, holderId: string, ev: Pick<EventIntent, 'alarmId'>): EngineEvent[] {
  const alarm = draft.practices?.alarm;
  if (alarm === undefined || alarm.id !== ev.alarmId || alarm.holderId !== holderId || alarm.answer !== 'keep' || alarm.argued !== true || draft.practices?.held === undefined) return [];
  alarm.answer = 'release_late';
  return [alarmEvent(alarm, 'release_late', { phase: 'compromise' }), ...releaseLate(draft, ctx as EngineCtx, alarm, false)]; // no slot is spent here, so the rng and the clock of the full context are not read
}

// ---------------------------------------------------------------------------------------------
// the run without the commander (Task 28)

/**
 * Why a launch cannot go without the commander, or `null` (R12): a hold is on and its alarm is a `keep` (a launch, or a deadline: for that one only its own mission goes), and the holder is
 * not in the party. Reads only; `expedition/start` asks it for a payload with `withoutCommand: true`.
 */
export function withoutCommandProblem(state: CampaignState, _reg: Registries, payload: unknown): string | null {
  const alarm = state.practices?.alarm;
  if (heldNow(state) === null || alarm === undefined || alarm.answer !== 'keep' || (alarm.kind !== 'launch' && alarm.kind !== 'deadline')) return 'The commander is not held back.';
  if (partyOf(payload).includes(alarm.holderId)) return 'She keeps the commander and cannot go with the squad.';
  if (alarm.kind === 'deadline' && (!isObj(payload) || !isObj(alarm.payload) || payload.missionId !== alarm.payload.missionId)) return 'That is not the mission that is running out of time.';
  return null;
}

/**
 * The squad has left without the commander (`expedition/start` with the flag, the run is open): the hold is extended to cover the run's slots (`hold_extended`, reason `alarm`; it is
 * `run` from now, and ends when the run returns), the alarm is spent and says so (`hold_alarm` with `run: true`: the squad learns why, memory rule `held_alarm_kept`). Draws nothing.
 */
export function leaveWithoutCommand(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const held = draft.practices?.held;
  const alarm = draft.practices?.alarm;
  const exp = draft.expedition;
  if (held === undefined || alarm === undefined || exp === undefined) return [];
  const events: EngineEvent[] = [];
  const need = posOf(draft.day, draft.slot) + exp.slots - 1; // the last slot the run takes
  let extended = false;
  while (posOf(held.until.day, held.until.slot) < need) {
    const more = extendHold(draft, ctx, 'alarm');
    if (more.length === 0) break;
    events.push(...more);
    extended = true;
  }
  held.run = true;
  if (!extended) events.push({ type: 'hold_extended', holderId: held.by, unitId: held.by, reason: 'alarm', run: true });
  events.push(alarmEvent(alarm, 'keep', { run: true, party: exp.party }));
  closeAlarm(draft, alarm);
  return events;
}
