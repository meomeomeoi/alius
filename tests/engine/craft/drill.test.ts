import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/craft';
import '../../../src/engine/actions/personal';
import { registerFrameReader, resetBlockingHooks } from '../../../src/engine/blocking';
import { drillDayStep, examOf, normLine, normNote } from '../../../src/engine/craft/programmes/drill';
import { book } from '../../../src/engine/personal/bookings';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { ctxOf, errors, loadCore, run } from '../../helpers/world';
import { ANN, BEA, playOut, unitOf, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { resetBlockingHooks(); resetPhysicsHooks(); });

type Ev = { type: string; [k: string]: unknown };

/** Ann holds at `play`, her style is `drill`, and the contents of the weight and breath drills are on. */
function drillWorld(style: string = 'drill'): CampaignState {
  registerFrameReader(() => 'play');
  const s = world(reg, 'play');
  s.relations[ANN].stateId = 'confidant';
  unitOf(s, ANN).bond!.practice!.style = { primary: style as 'drill' };
  s.content = { enabled: [...new Set([...(s.content?.enabled ?? []), 'worship', 'restraint', 'service', 'objectification', 'humiliation'])] };
  s.slot = 'afternoon';
  return s;
}
const step = (s: CampaignState): Ev[] => drillDayStep(s, ctxOf(s, reg)) as Ev[];
const bookings = (s: CampaignState) => s.personal?.bookings ?? [];
const examBookings = (s: CampaignState) => bookings(s).filter((b) => reg.bookingKinds.get(b.kindId)?.programme === 'exam');

describe('the norms', () => {
  it('are set at the first day step from the records times 1.1, or the start seconds', () => {
    const s = drillWorld();
    s.relations[ANN].craft = { records: { weight: { longest: 200, clean: 200, noTap: 200, day: 3 } } };
    const events = step(s);
    expect(s.relations[ANN].craft!.drill).toMatchObject({ norms: { 'endurance:weight': 220, 'endurance:breath': TUNING.craft.drill.start['endurance:breath'] }, examDay: s.day, passes: 0 });
    expect(events.filter((e) => e.type === 'norm_set').map((e) => e.key)).toEqual(['endurance:weight', 'endurance:breath']); // no posture of hers is named yet: no posture norm
    expect(step(s)).toEqual([]); // once
  });

  it('a posture norm follows the first posture she names, from the posture records', () => {
    const s = drillWorld();
    step(s);
    expect(s.relations[ANN].craft!.drill!.norms.posture).toBeUndefined();
    s.practices = { ...(s.practices ?? { seq: 0, requests: [], tasks: [], punishments: [], demonstrations: [], restrictions: [], cold: {}, offences: {}, records: [], handovers: [] }), postures: { [ANN]: [{ postureId: 'kneel_open', name: 'AUTHOR', day: 1 }] } } as never;
    s.relations[ANN].craft!.records = { 'posture:kneel_open': { longest: 600, clean: 600, noTap: 600, day: 5 } };
    expect(step(s).filter((e) => e.type === 'norm_set')).toEqual([{ type: 'norm_set', unitId: ANN, holderId: ANN, key: 'posture', seconds: 660 }]);
  });

  it('nothing for another style, a holder at equal, or a woman with no profile', () => {
    const cold = drillWorld('cold');
    expect(step(cold)).toEqual([]);
    expect(cold.relations[ANN].craft).toBeUndefined();
    const s = drillWorld();
    registerFrameReader(() => 'equal');
    s.relations[ANN].dynamic!.frame = 'equal';
    expect(step(s)).toEqual([]);
    expect(s.relations[BEA].craft).toBeUndefined();
  });

  it('a secondary style counts too', () => {
    const s = drillWorld('cold');
    unitOf(s, ANN).bond!.practice!.style = { primary: 'cold', secondary: 'drill' };
    expect(step(s).some((e) => e.type === 'norm_set')).toBe(true);
  });
});

describe('the weekly exam is booked on a free slot only', () => {
  it('not before a week, then on the next free slot of the commander (a taken one is skipped)', () => {
    const s = drillWorld();
    step(s);
    expect(examBookings(s)).toEqual([]);
    s.day += 7;
    // tomorrow's afternoon (the kind's slot) is already booked by someone else: the morning is the next free one
    book(s, { registries: reg }, { unitId: BEA, kindId: 'evening_with_me', day: s.day + 1, slot: 'afternoon', source: 'roll' });
    const events = step(s);
    expect(events.some((e) => e.type === 'booking_made')).toBe(true);
    const exam = examBookings(s);
    expect(exam).toHaveLength(1);
    expect(exam[0]).toMatchObject({ unitId: ANN, day: s.day + 1, slot: 'morning', source: 'practice', status: 'booked' }); // afternoon (the kind's slot) is taken: then morning, then evening
    expect(bookings(s).filter((b) => b.day === exam[0]!.day && b.slot === exam[0]!.slot && b.status === 'booked')).toHaveLength(1); // never over another booking, so no conflict
    expect(s.dms[ANN]?.at(-1)?.text).toContain('AUTHOR TO WRITE'); // she tells the commander
    expect(step(s).some((e) => e.type === 'booking_made')).toBe(false); // one at a time
  });

  it('is never rolled, smothered or wagered: the kinds are programme kinds', () => {
    const kinds = [...reg.bookingKinds.values()].filter((k) => k.programme !== undefined);
    expect(kinds.map((k) => k.programme).sort()).toEqual(['exam', 'session']);
    expect(kinds.every((k) => k.weight === 0 && k.locationId === 'training_yard' && !(k.contentTags as string[] | undefined)?.length)).toBe(true);
  });
});

/** A world with the exam booked for this afternoon and norms that make a pass certain (1 second) or a fail certain (a million). */
function examDay(norm: number): CampaignState {
  const s = drillWorld();
  step(s);
  const d = s.relations[ANN].craft!.drill!;
  d.norms['endurance:weight'] = norm;
  d.norms['endurance:breath'] = norm;
  s.day += 7;
  s.relations[ANN].dynamic!.frame = 'play';
  book(s, { registries: reg }, { unitId: ANN, kindId: 'drill_exam', day: s.day, slot: 'afternoon', source: 'practice' });
  return s;
}
const opened = (s: CampaignState) => run(s, reg, { type: 'scene/start', payload: { locationId: 'training_yard', participants: [ANN], origin: 'event', consumesSlot: true, startIndex: 0 } });

describe('the exam is a scene', () => {
  it('meeting her at the yard opens it with her first drill waiting', () => {
    const o = opened(examDay(5));
    expect(errors(o.events)).toEqual([]);
    expect(examOf(o.state, ANN)).toMatchObject({ keys: ['endurance:weight', 'endurance:breath'], results: {} });
    expect(o.state.relations[ANN].craft!.drillPending).toMatchObject({ key: 'endurance:weight', mult: 1, exam: true });
  });

  it('playing the booking opens it too', () => {
    const s = examDay(5);
    const r = run(s, reg, { type: 'booking/play', payload: {} });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.relations[ANN].craft!.drillPending).toMatchObject({ key: 'endurance:weight', exam: true });
  });

  /** Runs every drill of the exam, the commander holding every beat. */
  function sit(s: CampaignState): { state: CampaignState; events: Ev[] } {
    let cur = opened(s).state;
    const all: Ev[] = [];
    for (let i = 0; i < 4 && cur.relations[ANN].craft?.drill?.exam !== undefined; i++) {
      const d = run(cur, reg, { type: 'craft/drill_start', payload: { unitId: ANN } });
      expect(errors(d.events)).toEqual([]);
      all.push(...(d.events as Ev[]));
      const played = playOut(d.state, reg, 3 + i);
      all.push(...played.events);
      cur = played.state;
    }
    return { state: cur, events: all };
  }

  it('a pass raises every norm by a tenth, restarts the clock, and is her pleased verdict', () => {
    const s = examDay(5);
    const day = s.day;
    const r = sit(s);
    expect(r.events.filter((e) => e.type === 'exam_passed')).toEqual([{ type: 'exam_passed', unitId: ANN, holderId: ANN, passes: 1 }]);
    expect(r.events.some((e) => e.type === 'exam_failed')).toBe(false);
    expect(r.events.some((e) => e.type === 'drill_done')).toBe(false); // an exam's hold is not paid as a drill
    expect(r.state.relations[ANN].craft!.drill).toMatchObject({ passes: 1, examDay: day, norms: { 'endurance:weight': 6, 'endurance:breath': 6 } });
    expect(r.state.relations[ANN].craft!.drill!.exam).toBeUndefined();
    expect(r.state.relations[ANN].craft!.drillPending).toBeUndefined();
    expect(r.events.find((e) => e.type === 'service_rated')).toMatchObject({ unitId: ANN, kind: 'pleased' });
    expect(bookings(r.state).filter((b) => reg.bookingKinds.get(b.kindId)?.programme === 'session')).toEqual([]);
    // the pass mark is nowhere in what was said
    expect(JSON.stringify(r.events)).not.toMatch(/passMark|0\.8/);
  });

  it('a failure books two drill sessions on the next free slots, and is her displeased verdict', () => {
    const s = examDay(1_000_000);
    const r = sit(s);
    expect(r.events.filter((e) => e.type === 'exam_failed')).toEqual([{ type: 'exam_failed', unitId: ANN, holderId: ANN }]);
    const sessions = bookings(r.state).filter((b) => reg.bookingKinds.get(b.kindId)?.programme === 'session');
    expect(sessions).toHaveLength(TUNING.craft.drill.failBookings);
    expect(new Set(sessions.map((b) => `${b.day}|${b.slot}`)).size).toBe(2); // two different free slots
    expect(sessions.every((b) => b.day > r.state.day || b.slot !== 'afternoon')).toBe(true);
    expect(r.events.find((e) => e.type === 'service_rated')).toMatchObject({ kind: 'displeased' });
    expect(r.state.relations[ANN].craft!.drill).toMatchObject({ passes: 0, norms: { 'endurance:weight': 1_000_000 } }); // a failure leaves the norms as they were
  });

  it('the stop word ends the exam with no verdict and restarts the week', () => {
    const s = examDay(5);
    const o = opened(s);
    const d = run(o.state, reg, { type: 'craft/drill_start', payload: { unitId: ANN } });
    const r = run(d.state, reg, { type: 'physics/stop_word', payload: {} });
    expect(r.events.some((e) => e.type === 'exam_passed' || e.type === 'exam_failed' || e.type === 'service_rated')).toBe(false);
    expect(r.state.relations[ANN].craft!.drill!.exam).toBeUndefined();
    expect(r.state.relations[ANN].craft!.drill!.examDay).toBe(s.day);
  });

  it('a scene left before the exam is done takes it, with no verdict', () => {
    const o = opened(examDay(5));
    const ended = run(o.state, reg, { type: 'scene/end', payload: {} });
    expect(ended.state.relations[ANN].craft!.drill!.exam).toBeUndefined();
    expect(ended.events.some((e) => e.type === 'exam_failed')).toBe(false);
  });

  it('the exam is a session kind of drill with her at x1.5 when a session is played', () => {
    const s = examDay(5);
    s.personal!.bookings!.length = 0;
    book(s, { registries: reg }, { unitId: ANN, kindId: 'drill_session', day: s.day, slot: 'afternoon', source: 'practice' });
    s.relations[ANN].craft!.records = { weight: { longest: 10, clean: 10, noTap: 10, day: 1 } }; // the weight is her stronger: the breath is the weaker
    const o = opened(s);
    expect(o.state.relations[ANN].craft!.drillPending).toMatchObject({ key: 'endurance:breath', mult: 1.5 });
    expect(o.state.relations[ANN].craft!.drillPending!.exam).toBeUndefined();
  });
});

describe('her norm on HOME is derived', () => {
  it('says what she asks in fiction time and never the pass mark', () => {
    const s = drillWorld();
    s.relations[ANN].craft = { records: { weight: { longest: 200, clean: 200, noTap: 200, day: 3 } } };
    step(s);
    expect(normLine(s, reg, ANN)).toBe('weight 4 minutes, breath 60 seconds');
    expect(normNote(s, reg, ANN)).toContain('weight 4 minutes');
    expect(normNote(s, reg, ANN)).not.toMatch(/80|pass|%/);
    const cold = drillWorld('cold');
    cold.relations[ANN].craft = { drill: { norms: { 'endurance:weight': 100 }, examDay: 1, passes: 0 } };
    expect(normNote(cold, reg, ANN)).toBeNull(); // not a drill holder now
  });
});
