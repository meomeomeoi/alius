/**
 * The `drill` holder's programme (P16b, plan Task 19; spec section 11): norms and exams. A holder whose style (primary or secondary) is `drill`, while her craft runs, sets a norm in seconds of
 * fiction for each key she cares for (`TUNING.craft.drill.keys`) from the commander's records times `fromRecord` (or the `start` seconds), tells so (`norm_set`), and weekly books the exam on the next free
 * slot (`drill_exam`, never over a booking). The exam is a scene at the training yard where she runs one hold per norm (`craft/drill_start`); its sum is judged against `pass` of the sum of the
 * norms (a number nobody sees): a pass raises every norm by `step` (`exam_passed`), a failure books `failBookings` extra drills (`exam_failed`, `drill_session`). Her verdict is a service rating, so
 * a slip she punishes is a lesson (Task 4). Nothing is written for a holder who is not a live `drill` holder, and nothing here draws.
 */
import type { Registries } from '../../../content/types';
import type { EngineCtx, EngineEvent } from '../../dispatch';
import { regardRise } from '../../dynamic/regard';
import { rateService } from '../../practice/service';
import type { CampaignState } from '../../state/types';
import { TUNING } from '../../tuning';
import { drillContacts } from '../drillScene';
import { payDrill } from '../drills';
import { craftHolders, craftLive } from '../gate';
import { craftLevel } from '../book';
import { fictionSeconds, segmentBeats } from '../records';
import { enduranceOf, spanText } from '../state';
import { bookProgramme, hasStyle } from './slots';

const D = TUNING.craft.drill;
export const DRILL_STYLE = 'drill';

type Drill = NonNullable<NonNullable<CampaignState['relations'][string]['craft']>['drill']>;

/** Is she a live holder of the drill programme: craft-live and her style (primary or secondary) is `drill`? */
export const isDrillHolder = (state: CampaignState, reg: Registries, unitId: string): boolean => craftLive(state, reg, unitId) && hasStyle(state, unitId, DRILL_STYLE);

/** Her programme, or `undefined` while none is written. */
export const drillOf = (state: Pick<CampaignState, 'relations'>, unitId: string): Drill | undefined => state.relations[unitId]?.craft?.drill;

/** Can a drill of this key be run with her now: a contact of the physics can be staged for her (endurance), or she has a posture she named (`posture`)? */
function runnable(state: CampaignState, reg: Registries, unitId: string, key: string): boolean {
  const physics = enduranceOf(key);
  if (physics !== null) return drillContacts(state, reg, unitId, physics).length > 0;
  return key === 'posture' && (state.practices?.postures[unitId] ?? []).length > 0;
}

/** The norm a key starts at: the commander's longest hold of it with her times `fromRecord`, else the `start` seconds. Whole seconds. */
function startNorm(state: CampaignState, unitId: string, key: string): number {
  const records = state.relations[unitId]?.craft?.records ?? {};
  const physics = enduranceOf(key);
  const longest = physics !== null ? records[physics]?.longest ?? 0 : Math.max(0, ...Object.entries(records).filter(([k]) => k.startsWith('posture:')).map(([, r]) => r.longest));
  return Math.round(longest > 0 ? longest * D.fromRecord : D.start[key] ?? 60);
}

/** The keys of her norms she can be drilled on now, in `TUNING.craft.drill.keys` order. */
export const normKeys = (state: CampaignState, reg: Registries, unitId: string): string[] =>
  D.keys.filter((k) => drillOf(state, unitId)?.norms[k] !== undefined && runnable(state, reg, unitId, k));

/** The norms of a programme in words, what she asks for each key in fiction time ("weight 4 minutes, posture 10 minutes"), or `null` with none. Pure; never the pass mark. */
export function normText(reg: Registries, norms: Record<string, number>): string | null {
  const parts = D.keys.filter((k) => norms[k] !== undefined).map((k) => {
    const physics = enduranceOf(k);
    const what = String(physics !== null ? reg.contactPhysics.get(physics)?.label ?? physics : k).toLowerCase();
    return `${what} ${spanText(norms[k]!)}`;
  });
  return parts.length === 0 ? null : parts.join(', ');
}

/** Her norms in words, for her note on HOME: only for a live `drill` holder. Derived; never a stored note, never the pass mark. */
export function normLine(state: CampaignState, reg: Registries, unitId: string): string | null {
  const d = drillOf(state, unitId);
  return d === undefined || !isDrillHolder(state, reg, unitId) ? null : normText(reg, d.norms);
}

/** What her norms are for, as words with no time (the weight, the breath, the posture), for the directive. Empty without a norm. */
export function normWords(state: CampaignState, reg: Registries, unitId: string): string[] {
  const d = drillOf(state, unitId);
  if (d === undefined || !isDrillHolder(state, reg, unitId)) return [];
  return D.keys.filter((k) => d.norms[k] !== undefined).map((k) => {
    const physics = enduranceOf(k);
    return String(physics !== null ? reg.contactPhysics.get(physics)?.label ?? physics : k).toLowerCase();
  });
}

/** Her norm as the note of the day says it (her words around the norm in fiction time), or `null`. Derived: nothing is stored, and the pass mark is never in it. */
export function normNote(state: CampaignState, reg: Registries, unitId: string): string | null {
  const line = normLine(state, reg, unitId);
  return line === null ? null : D.note.replace('{norm}', line);
}

const examBooked = (state: CampaignState, reg: Registries, unitId: string): boolean =>
  (state.personal?.bookings ?? []).some((b) => b.unitId === unitId && b.status === 'booked' && reg.bookingKinds.get(b.kindId)?.programme === 'exam');

/**
 * The day step of the programme (at the end of `draft.day`): a live `drill` holder sets the norms she has none for yet (`norm_set`, the first sets the weekly clock), and books the exam on the next free
 * slot once `examEvery` days have passed since the last one and none is booked. A woman who is not a live `drill` holder keeps nothing (her programme stays as it was: it is frozen, not dropped).
 */
export function drillDayStep(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>): EngineEvent[] {
  const reg = ctx.registries;
  const events: EngineEvent[] = [];
  for (const unitId of craftHolders(draft, reg)) {
    if (!hasStyle(draft, unitId, DRILL_STYLE)) continue;
    const rel = draft.relations[unitId]!;
    for (const key of D.keys) {
      if (rel.craft?.drill?.norms[key] !== undefined || !runnable(draft, reg, unitId, key)) continue;
      const d = ((rel.craft ??= {}).drill ??= { norms: {}, examDay: draft.day, passes: 0 });
      d.norms[key] = startNorm(draft, unitId, key);
      events.push({ type: 'norm_set', unitId, holderId: unitId, key, seconds: d.norms[key] });
    }
    const d = rel.craft?.drill;
    if (d === undefined || Object.keys(d.norms).length === 0 || draft.day - d.examDay < D.examEvery || examBooked(draft, reg, unitId)) continue;
    events.push(...bookProgramme(draft, ctx, unitId, 'exam', draft.day + 1).events);
  }
  return events;
}

// ---------------------------------------------------------------------------------------------
// The scene

/** The weakest of her norms by what the commander holds against it (the lowest share of the record over the norm), in key order. `undefined` with no norm. */
function weakestKey(state: CampaignState, reg: Registries, unitId: string): string | undefined {
  const d = drillOf(state, unitId);
  const keys = normKeys(state, reg, unitId);
  if (d === undefined || keys.length === 0) return undefined;
  const share = (k: string): number => {
    const records = state.relations[unitId]?.craft?.records ?? {};
    const physics = enduranceOf(k);
    const best = physics !== null ? records[physics]?.longest ?? 0 : Math.max(0, ...Object.entries(records).filter(([r]) => r.startsWith('posture:')).map(([, x]) => x.longest));
    return best / (d.norms[k] || 1);
  };
  return keys.reduce((a, b) => (share(b) < share(a) ? b : a));
}

/**
 * A booking of hers was played (the after-action reads `booking_played`): the exam opens (her keys in order, the first drill waiting for `craft/drill_start`), a session waits with a drill of her weakest norm
 * at the holder's multiplier (a posture one is paid at once: there is no instrument for it yet beyond the exam's hold). Nothing for another kind of booking or a holder who is not live.
 */
export function noteProgrammeBooking(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, events: readonly EngineEvent[]): EngineEvent[] {
  const reg = ctx.registries;
  const out: EngineEvent[] = [];
  for (const e of events) {
    if (e.type !== 'booking_played' || typeof e.bookingId !== 'string' || typeof e.unitId !== 'string') continue;
    const booking = draft.personal?.bookings?.find((b) => b.id === e.bookingId);
    const programme = booking === undefined ? undefined : reg.bookingKinds.get(booking.kindId)?.programme;
    if (programme === undefined || !isDrillHolder(draft, reg, e.unitId)) continue;
    const rel = draft.relations[e.unitId]!;
    const d = rel.craft?.drill;
    if (d === undefined) continue;
    if (programme === 'exam') {
      const keys = normKeys(draft, reg, e.unitId);
      if (keys.length === 0) continue;
      d.exam = { day: draft.day, keys, results: {} };
      rel.craft!.drillPending = { key: keys[0]!, mult: 1, day: draft.day, exam: true };
    } else {
      const key = weakestKey(draft, reg, e.unitId);
      if (key === undefined) continue;
      if (enduranceOf(key) === null) out.push(...payDrill(draft, reg, key, { companionId: e.unitId, mult: D.holder }));
      else rel.craft!.drillPending = { key, mult: D.holder, day: draft.day };
    }
  }
  return out;
}

/** The exam she is running now, or `undefined`. */
export const examOf = (state: CampaignState, unitId: string): NonNullable<Drill['exam']> | undefined => {
  const e = drillOf(state, unitId)?.exam;
  return e !== undefined && e.day === state.day ? e : undefined;
};

/** The seconds of fiction a finished endurance run stands for (the same count a record is made of). */
export function runSeconds(state: CampaignState, reg: Registries, physicsId: string, segments: number): number {
  return fictionSeconds(physicsId, segments * segmentBeats(reg, physicsId), craftLevel(state, `endurance:${physicsId}`));
}

/**
 * The exam is over: the sum of what the commander held against the sum of the norms. `pass` of it passes (the number is never said): every norm rises by `step`, the clock restarts, `exam_passed`,
 * her verdict is pleased and Regard rises by `regard`. A failure is `exam_failed`, her verdict is displeased and `failBookings` sessions are booked on the next free slots. The exam is dropped.
 */
function resolveExam(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, unitId: string): EngineEvent[] {
  const reg = ctx.registries;
  const rel = draft.relations[unitId]!;
  const d = rel.craft!.drill!;
  const exam = d.exam!;
  const sum = (m: Record<string, number>): number => exam.keys.reduce((n, k) => n + (m[k] ?? 0), 0);
  const passed = sum(exam.results) >= D.pass * sum(d.norms);
  delete d.exam;
  delete rel.craft!.drillPending;
  d.examDay = draft.day;
  const sceneId = draft.scene?.id;
  const events: EngineEvent[] = [];
  if (passed) {
    d.passes += 1;
    for (const k of exam.keys) d.norms[k] = Math.round(d.norms[k]! * D.step);
    events.push({ type: 'exam_passed', unitId, holderId: unitId, passes: d.passes });
    if (sceneId !== undefined) events.push(...rateService(draft, ctx, unitId, 'pleased', 'engine', sceneId));
    events.push(...regardRise(draft, reg, unitId, 'value', D.regard));
  } else {
    events.push({ type: 'exam_failed', unitId, holderId: unitId });
    if (sceneId !== undefined) events.push(...rateService(draft, ctx, unitId, 'displeased', 'engine', sceneId));
    let from = draft.day + 1;
    for (let i = 0; i < D.failBookings; i++) {
      const booked = bookProgramme(draft, ctx, unitId, 'session', from);
      events.push(...booked.events);
      if (booked.day === null) break;
      from = booked.day; // the next session on a slot after this one (the same day's later slot, or after)
    }
  }
  return events;
}

/**
 * One of the exam's holds is over (the after-action reads `physics_outcome` and `posture_ended`): the stop word ends the exam without a verdict (it is out of the fiction); any other end counts what the
 * commander held, and the next drill waits (or the exam is judged when none is left).
 */
export function noteExamOutcome(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, events: readonly EngineEvent[]): EngineEvent[] {
  const reg = ctx.registries;
  const out: EngineEvent[] = [];
  for (const e of events) {
    const isRun = e.type === 'physics_outcome';
    if ((!isRun && e.type !== 'posture_ended') || typeof e.holderId !== 'string' || typeof e.runId !== 'string') continue;
    const unitId = e.holderId;
    const rel = draft.relations[unitId];
    const pending = rel?.craft?.drillPending;
    const exam = examOf(draft, unitId);
    if (rel === undefined || pending?.exam !== true || pending.runId !== e.runId || exam === undefined) continue;
    delete rel.craft!.drillPending;
    if (e.result === 'stopped' || e.reason === 'stopped' || e.reason === 'gone') { // out of the fiction: no verdict, the week's clock starts over
      delete rel.craft!.drill!.exam;
      rel.craft!.drill!.examDay = draft.day;
      continue;
    }
    exam.results[pending.key] = isRun ? runSeconds(draft, reg, String(e.physicsId), Number(e.segments) || 0) : Number(e.seconds) || 0;
    const next = exam.keys.find((k) => exam.results[k] === undefined);
    if (next === undefined) out.push(...resolveExam(draft, ctx, unitId));
    else rel.craft!.drillPending = { key: next, mult: 1, day: draft.day, exam: true };
  }
  return out;
}

/** A scene that ended, was aborted or cancelled takes an exam that was not finished (no verdict: the clock starts over). */
export function dropExams(draft: CampaignState, events: readonly EngineEvent[]): void {
  if (!events.some((e) => e.type === 'scene_ended' || e.type === 'scene_aborted' || e.type === 'scene_cancelled')) return;
  for (const rel of Object.values(draft.relations)) {
    const d = rel.craft?.drill;
    if (d?.exam === undefined) continue;
    delete d.exam;
    d.examDay = draft.day;
  }
}
