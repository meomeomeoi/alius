import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/life';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { alarmAnswer, deadlineAlarms } from '../../../src/engine/practice/alarm';
import { recordOf } from '../../../src/engine/discipline/record';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { heldGuard, heldNow, holderQuarters } from '../../../src/engine/practice/held';
import { extendHold, startHold } from '../../../src/engine/practice/hold';
import { applyPracticeIntent, practiceIntentInput } from '../../../src/engine/practice/intents';
import { blankPractices, practiceRoll } from '../../../src/engine/practice/state';
import { TUNING } from '../../../src/engine/tuning';
import type { EventIntent } from '../../../src/engine/relations/intents';
import type { CampaignState } from '../../../src/engine/state/types';
import { issuedDirective } from '../../../src/practice/directives';
import { hasCommanderPronoun } from '../../../src/engine/dynamic/pronoun';
import { depart, payload, withMission } from '../../helpers/expedition';
import { ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, BEA, CAT, unitOf, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

type Style = 'affectionate' | 'possessive' | 'cruel' | 'drill' | 'cold';
interface Fixture { style: Style; mercy: number; corporate?: number; frame?: 'play' | 'role' | 'rule'; day?: number; slot?: 'morning' | 'afternoon' | 'evening'; span?: 1 | 2 | 'day'; noHold?: true }

/** Ann holds at `frame`; a mission is on the board; she keeps the commander for `span` from `slot`. The first alarm of this state is `pa0`. */
function fixture(o: Fixture): { s: CampaignState; missionId: string } {
  const base = world(reg, o.frame ?? 'role');
  base.slot = o.slot ?? 'morning';
  base.day = o.day ?? 20;
  dynamicOf(base, ANN)!.hold = 70;
  const u = unitOf(base, ANN);
  u.bond!.practice!.style = { primary: o.style };
  u.values = { ...u.values, mercy: o.mercy, corporate: o.corporate ?? 0 };
  const { state, mission } = withMission(reg, base);
  state.day = base.day;
  if (o.noHold !== true) startHold(state, ctxOf(state, reg), ANN, o.span ?? 2);
  return { s: state, missionId: mission.id };
}
const launch = (s: CampaignState, missionId: string, ids: string[] = [BEA, CAT]) => payload(s, missionId, { unitIds: ids });
const raise = (s: CampaignState, kind: string, pl: unknown) => run(s, reg, { type: 'practice/raise_alarm', payload: { kind, payload: pl } });
const answer = (s: CampaignState, a: string, alarmId = 'pa0') => run(s, reg, { type: 'practice/answer_alarm', payload: { alarmId, answer: a } });
const facts = (s: CampaignState) => s.memory.facts.filter((f) => f.tags.includes('held_alarm'));
/** A day on which her roll for alarm pa0 is below / at or above one half. */
function dayWhere(f: Fixture, low: boolean): number {
  for (let d = 1; d < 400; d++) {
    const { s } = fixture({ ...f, day: d });
    if ((practiceRoll(s, ANN, 'alarm:pa0') < 0.5) === low) return d;
  }
  throw new Error('no such day');
}

describe('her answer reads her values and style', () => {
  it('mercy 3, affectionate, play: release; mercy 2, possessive, role: release when her roll is half or more, else release_late; mercy 0, possessive, role: keep; cruel at rule: keep', () => {
    const answerOf = (f: Fixture, ids: string[] = [BEA]) => { const { s, missionId } = fixture(f); return alarmAnswer(s, reg, ANN, 'launch', 'pa0', launch(s, missionId, ids)); };
    expect(answerOf({ style: 'affectionate', mercy: 3, frame: 'play' })).toBe('release'); // 3 + 1 + roll - 0.5 is at least 3.5
    const bandFor = (day: number) => { const { s } = fixture({ style: 'possessive', mercy: 2, frame: 'role', day }); return practiceRoll(s, ANN, 'alarm:pa0'); };
    const lowDay = dayWhere({ style: 'possessive', mercy: 2, frame: 'role' }, true);
    const highDay = dayWhere({ style: 'possessive', mercy: 2, frame: 'role' }, false);
    expect(bandFor(lowDay)).toBeLessThan(0.5);
    expect(answerOf({ style: 'possessive', mercy: 2, frame: 'role', day: lowDay })).toBe('release_late'); // 2 - 1 - 0.5 + roll - 0.5 is under 0.5 and at least 0
    expect(answerOf({ style: 'possessive', mercy: 2, frame: 'role', day: highDay })).toBe('release');
    expect(answerOf({ style: 'possessive', mercy: 0, frame: 'role' })).toBe('keep'); // -1.5 + roll - 0.5 is under -1
    expect(answerOf({ style: 'cruel', mercy: 0, frame: 'rule' })).toBe('keep');
    expect(answerOf({ style: 'cruel', mercy: 0, corporate: 2, frame: 'rule' })).toBe('keep'); // 0 + 1 - 1.5 - 1 + roll - 0.5: still under -1
  });

  it('a holder in the party of the launch always answers release', () => {
    const { s, missionId } = fixture({ style: 'cruel', mercy: 0, frame: 'rule' });
    expect(alarmAnswer(s, reg, ANN, 'launch', 'pa0', launch(s, missionId, [ANN, BEA]))).toBe('release');
    expect(alarmAnswer(s, reg, ANN, 'launch', 'pa0', launch(s, missionId, [BEA]))).toBe('keep');
    expect(alarmAnswer(s, reg, ANN, 'deadline', 'pa0', { missionId })).toBe('keep'); // only a launch has a party
  });
});

describe('release', () => {
  it('the hold ends, hold falls by 2, nobody is told and nothing is left open; the launch is then free', () => {
    const { s, missionId } = fixture({ style: 'affectionate', mercy: 3, frame: 'play' });
    const before = dynamicOf(s, ANN)!.hold;
    const go = launch(s, missionId);
    const r = raise(s, 'launch', go);
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'hold_alarm')).toMatchObject([{ holderId: ANN, kind: 'launch', answer: 'release' }]);
    expect(ofType(r.events, 'hold_released')).toMatchObject([{ reason: 'alarm' }]);
    expect(dynamicOf(r.state, ANN)!.hold).toBe(before - TUNING.practice.alarm.releaseHold);
    expect(r.state.practices!.held).toBeUndefined();
    expect(r.state.practices!.alarm).toBeUndefined();
    expect(facts(r.state)).toEqual([]);
    expect(JSON.stringify(r.state.rng)).toBe(JSON.stringify(s.rng));
    expect(errors(run(r.state, reg, { type: 'expedition/start', payload: go }).events)).toEqual([]); // the guard lifted: the original action goes through
  });

  it('a launch with no hold is no alarm: it throws', () => {
    const { s, missionId } = fixture({ style: 'affectionate', mercy: 3, frame: 'play', noHold: true });
    expect(errors(raise(s, 'launch', launch(s, missionId)).events)).toHaveLength(1);
  });
});

describe('release late', () => {
  const late: Fixture = { style: 'possessive', mercy: 2, frame: 'role', slot: 'afternoon', span: 'day' };

  it('one slot is spent first, each named unit\'s record rises by 3, the party hears of it and the hold is over; a launch that is then too late fails its own departure check', () => {
    const f = { ...late, day: dayWhere(late, true) };
    const { s, missionId } = fixture(f);
    const go = launch(s, missionId, [BEA]);
    const recs = [BEA, CAT].map((id) => recordOf(s, id));
    const r = raise(s, 'launch', go);
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'hold_alarm')).toMatchObject([{ answer: 'release_late' }]);
    expect(ofType(r.events, 'slot_advanced')).toHaveLength(1);
    expect(r.state.slot).toBe('evening');
    expect(ofType(r.events, 'hold_released')).toMatchObject([{ reason: 'alarm' }]);
    expect([BEA, CAT].map((id) => recordOf(r.state, id))).toEqual(recs.map((n) => n + TUNING.practice.alarm.lateRecord));
    expect(recordOf(r.state, ANN)).toBe(recordOf(s, ANN));
    const fact = facts(r.state);
    expect(fact).toHaveLength(1);
    expect(fact[0].about).toEqual([ANN]);
    expect(fact[0].knownBy).toEqual(expect.arrayContaining([ANN, BEA])); // the party
    expect(fact[0].knownBy).not.toContain(CAT);
    const retry = run(r.state, reg, { type: 'expedition/start', payload: go });
    expect(errors(retry.events)).toMatchObject([{ code: 'handler_failed', message: expect.stringContaining('takes 2 slots') }]);
  });

  it('a deadline or a knock that was waited for spends no slot: the hold ends now and the whole squad is the audience', () => {
    const f = { ...late, day: dayWhere(late, true) };
    const { s, missionId } = fixture(f);
    const r = raise(s, 'deadline', { missionId });
    expect(ofType(r.events, 'hold_alarm')).toMatchObject([{ kind: 'deadline', answer: 'release_late' }]);
    expect(ofType(r.events, 'slot_advanced')).toEqual([]);
    expect(r.state.slot).toBe('afternoon');
    expect(r.state.practices!.held).toBeUndefined();
    expect(facts(r.state)[0].knownBy).toEqual(expect.arrayContaining([ANN, BEA, CAT]));
  });
});

describe('keep', () => {
  const keep: Fixture = { style: 'possessive', mercy: 0, frame: 'role' };

  it('a launch: the alarm stays open as keep, the squad\'s record rises by 5, only a launch without the commander gets past the guard; nothing is remembered before the run leaves', () => {
    const { s, missionId } = fixture(keep);
    const go = launch(s, missionId);
    const recs = [BEA, CAT].map((id) => recordOf(s, id));
    const r = raise(s, 'launch', go);
    expect(ofType(r.events, 'hold_alarm')).toMatchObject([{ answer: 'keep', kind: 'launch' }]);
    expect(r.state.practices!.alarm).toMatchObject({ id: 'pa0', holderId: ANN, kind: 'launch', answer: 'keep', day: 20, slot: 'morning' });
    expect(r.state.practices!.held!.alarm).toBe('pa0');
    expect(heldNow(r.state)).not.toBeNull();
    expect([BEA, CAT].map((id) => recordOf(r.state, id))).toEqual(recs.map((n) => n + TUNING.practice.alarm.keepRecord));
    expect(facts(r.state)).toEqual([]);
    expect(heldGuard(r.state, reg, { type: 'expedition/start', payload: { ...go, withoutCommand: true } })).toBeNull();
    expect(errors(run(r.state, reg, { type: 'expedition/start', payload: go }).events)).toMatchObject([{ code: 'held_alarm' }]);
    expect(errors(raise(r.state, 'launch', go).events)).toHaveLength(1); // one alarm at a time
  });

  it('a deadline today raises the alarm once at hold start, and again for nothing: keep leaves the mission to fail at the day end', () => {
    const { s, missionId } = fixture({ ...keep, noHold: true });
    s.missions.offered.find((m) => m.id === missionId)!.deadlineDay = s.day;
    s.practices = { ...blankPractices(), seq: 5, punishments: [{ id: 'pp1', holderId: ANN, entryId: 'kept_in_quarters', severity: 3, offence: { kind: 'task_broken', ref: 'pt1', stakes: 'major', day: 20 }, text: 't', summary: 's', status: 'offered', day: 20 }] };
    dynamicOf(s, ANN)!.hold = 40;
    const r = run(s, reg, { type: 'practice/answer_punishment', payload: { punishmentId: 'pp1', answer: 'accept' } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'hold_alarm')).toMatchObject([{ kind: 'deadline', answer: 'keep' }]);
    expect(r.state.practices!.alarm).toMatchObject({ kind: 'deadline', answer: 'keep', payload: { missionId } });
    const next = run(r.state, reg, { type: 'calendar/consume_slot' });
    expect(ofType(next.events, 'hold_alarm')).toEqual([]); // once per mission
    expect(deadlineAlarms(next.state, ctxOf(next.state, reg))).toEqual([]);
    const end = run(next.state, reg, { type: 'calendar/consume_slot' });
    expect(ofType(end.events, 'hold_released')).toHaveLength(1);
    const day = run(end.state, reg, { type: 'calendar/consume_slot' });
    expect(ofType(day.events, 'mission_failed')).toHaveLength(1); // nobody was sent: it fails as it always does
  });

  it('a knock while held into the night: keep ignores the entry with its ignore cost and spends the one slot, never two', () => {
    const { s } = fixture({ ...keep, slot: 'evening', span: 1 });
    expect(ofType(extendHold(s, ctxOf(s, reg), 'forgot'), 'hold_extended')).toHaveLength(1); // she kept the commander into the night
    s.slot = 'night';
    s.calendar.nightEvent = { id: 'n1', unitId: BEA, kind: 'visit', priority: 30, framing: 'A knock.', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 99 };
    expect(errors(run(s, reg, { type: 'night/open' }).events)).toMatchObject([{ code: 'held_alarm' }]);
    const r = raise(s, 'night', { entryId: 'n1' });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'hold_alarm')).toMatchObject([{ kind: 'night', answer: 'keep' }]);
    const a = answer(r.state, 'accept');
    expect(errors(a.events)).toEqual([]);
    expect(ofType(a.events, 'night_ignored')).toMatchObject([{ unitId: BEA, entryId: 'n1' }]);
    expect(ofType(a.events, 'slot_advanced')).toHaveLength(1);
    expect(a.state.calendar.nightEvent).toBeUndefined();
    expect(a.state.practices!.alarm).toBeUndefined();
    expect(a.state.day).toBe(21);
  });
});

describe('the commander\'s answer to keep', () => {
  const keep: Fixture = { style: 'possessive', mercy: 0, frame: 'role' };
  const kept = () => { const { s, missionId } = fixture(keep); return { r: raise(s, 'launch', launch(s, missionId)), missionId, s }; };
  const intent = (over: Partial<EventIntent>): EventIntent => ({ type: 'compromise_reached', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'agreed', confidence: 1, ...over }) as EventIntent;

  it('ACCEPT closes the card and leaves the alarm (the launch without the commander is still possible)', () => {
    const { r } = kept();
    const a = answer(r.state, 'accept');
    expect(errors(a.events)).toEqual([]);
    expect(a.state.practices!.alarm).toMatchObject({ answer: 'keep', accepted: true });
    expect(a.state.practices!.held).toBeDefined();
  });

  it('ARGUE opens a one-exchange scene once; a second ARGUE throws; a compromise reached turns keep into release late', () => {
    const { r } = kept();
    expect(practiceIntentInput(r.state, reg, [ANN], 'scene').practice?.alarms ?? []).toEqual([]); // nothing to settle before the argument
    const a = answer(r.state, 'argue');
    expect(errors(a.events)).toEqual([]);
    expect(ofType(a.events, 'hold_alarm')).toMatchObject([{ alarmId: 'pa0', phase: 'argue', scene: { origin: 'event', consumesSlot: false, participants: [ANN], locationId: 'quarters_unit' } }]);
    expect(a.state.practices!.alarm!.argued).toBe(true);
    expect(errors(answer(a.state, 'argue').events)).toHaveLength(1);
    expect(practiceIntentInput(a.state, reg, [ANN], 'scene').practice?.alarms).toMatchObject([{ id: 'pa0', unitId: ANN }]);
    const d = structuredClone(a.state);
    const events = applyPracticeIntent(d, ctxOf(d, reg), ANN, intent({ alarmId: 'pa0' }));
    expect(ofType(events, 'hold_alarm')).toMatchObject([{ alarmId: 'pa0', answer: 'release_late' }]);
    expect(d.practices!.held).toBeUndefined();
    expect(d.practices!.alarm).toBeUndefined();
    const before = structuredClone(r.state);
    expect(applyPracticeIntent(before, ctxOf(before, reg), ANN, intent({ alarmId: 'pa0' }))).toEqual([]); // no argument was had
    expect(before.practices!.alarm!.answer).toBe('keep');
  });

  it('DEFY ends the hold, costs what a defiance costs and is an offence of hers (hold_defied, major); the action may then go on; no rng is drawn', () => {
    const { r, missionId } = kept();
    const holdBefore = dynamicOf(r.state, ANN)!;
    const d = answer(r.state, 'defy');
    expect(errors(d.events)).toEqual([]);
    expect(ofType(d.events, 'hold_released')).toMatchObject([{ reason: 'defied' }]);
    expect(d.state.practices!.held).toBeUndefined();
    expect(d.state.practices!.alarm).toBeUndefined();
    expect(ofType(d.events, 'refusal_noted')).toHaveLength(holdBefore.frame === 'play' ? 0 : 1);
    expect(d.state.practices!.offences[ANN]).toEqual([20]);
    expect(d.state.practices!.requests.map((q) => q.offence?.kind)).toContain('hold_defied');
    expect(d.state.practices!.requests.find((q) => q.offence?.kind === 'hold_defied')!.offence!.stakes).toBe('major');
    expect(JSON.stringify(d.state.rng)).toBe(JSON.stringify(r.state.rng));
    expect(errors(run(d.state, reg, { type: 'expedition/start', payload: launch(d.state, missionId) }).events)).toEqual([]);
  });

  it('only a keep that nobody answered can be answered, and by an alarm that exists', () => {
    const { s } = fixture(keep);
    expect(errors(answer(s, 'accept').events)).toHaveLength(1); // none open
    const { r } = kept();
    expect(errors(answer(r.state, 'nope').events)).toHaveLength(1);
    expect(errors(answer(r.state, 'accept', 'pa9').events)).toHaveLength(1);
  });
});

describe('the directive', () => {
  it('practice:alarm:<holder> tells the model her answer for the next reply, in the scene with her, with no number and no pronoun; the argument and the quiet release carry none', () => {
    const { s, missionId } = fixture({ style: 'possessive', mercy: 0, frame: 'role' });
    const r = raise(s, 'launch', launch(s, missionId));
    const scened = structuredClone(r.state);
    scened.scene = { id: 's1', day: 20, slot: 'morning', locationId: 'quarters_unit', participants: [ANN], mode: 'private', origin: 'event', consumesSlot: false, startIndex: 0, readIndex: 0, exchanges: 0 } as never;
    const line = issuedDirective(ofType(r.events, 'hold_alarm')[0], scened, reg);
    expect(line).toMatchObject({ id: `practice:alarm:${ANN}`, expiresAfter: 'next_reply' });
    expect(line!.text).not.toMatch(/\d/);
    expect(hasCommanderPronoun(line!.text)).toBe(false);
    expect(issuedDirective(ofType(r.events, 'hold_alarm')[0], r.state, reg)).toBeNull(); // not in a scene with her
    expect(issuedDirective({ type: 'hold_alarm', holderId: ANN, answer: 'keep', phase: 'argue' }, scened, reg)).toBeNull();
    expect(issuedDirective({ type: 'hold_alarm', holderId: ANN, answer: 'keep', run: true }, scened, reg)).toBeNull();
  });
});

describe('her quarters are read by field, never by id (review M15)', () => {
  it('the held kind\'s place, else the location every soldier has; the argument opens the scene there', () => {
    expect(holderQuarters(reg)).toBe('quarters_unit');
    const moved = { ...reg, bookingKinds: new Map(reg.bookingKinds), locations: new Map(reg.locations) } as Registries;
    const kind = [...reg.bookingKinds.values()].find((k) => k.held === true)!;
    moved.bookingKinds.set(String(kind.id), { ...kind, locationId: 'mess_hall' });
    expect(holderQuarters(moved)).toBe('mess_hall');
    const bare = { ...reg, bookingKinds: new Map([...reg.bookingKinds].filter(([, k]) => k.held !== true)) } as Registries;
    expect(holderQuarters(bare)).toBe('quarters_unit'); // the one location every soldier has
    const none = { ...bare, locations: new Map([...reg.locations].filter(([, l]) => l.perUnit !== true)) } as Registries;
    expect(holderQuarters(none)).toBeNull();
  });
});
