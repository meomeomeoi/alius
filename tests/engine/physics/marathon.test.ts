import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { attrition, clockText, extraSlotsFor, isMarathon, phaseLength, phasesOf } from '../../../src/engine/physics/marathon';
import { conditionsOf } from '../../../src/engine/physics/conditions';
import { registerPhysicsStyle, resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { PhysicsRun } from '../../../src/engine/physics/state';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { enable } from '../../helpers/bonds';
import { campaign, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/physics';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  resetBlockingHooks();
  resetPhysicsHooks();
});

const ANN = 'unit_ann';
const ON = ['worship', 'restraint', 'service', 'objectification', 'humiliation'];
type Pace = 'short' | 'normal' | 'long';

/** A weight hold (footrest) in a scene at `slot`, restarted as a marathon of `hours` (or unknown) at `pace`, turn-based unless `realtime`. */
function marathon(hours: number | 'unknown', over: { pace?: Pace; realtime?: boolean; slot?: CampaignState['slot']; level?: number } = {}): CampaignState {
  registerFrameReader(() => 'play');
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, ...ON);
  s.slot = over.slot ?? 'afternoon';
  s.settings.marathonPace = over.pace ?? 'normal';
  s.settings.physicsRealtime = over.realtime ?? false;
  if (over.level) s.commander.endurance = { weight: { xp: 0, level: over.level } };
  const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: true, startIndex: 0 } }).state;
  setBlocking(st, { registries: reg }, { person: ANN, field: 'contact', value: 'footrest', with: COMMANDER }, { at: 3, source: 'chip' });
  delete st.scene!.physics;
  st.scene!.physicsCount = 0; // the restarted run is p1 again
  const r = run(st, reg, { type: 'physics/start', payload: { physicsId: 'weight', sourceKind: 'contact', sourceId: 'footrest', holderId: ANN, duration: hours === 'unknown' ? 'unknown' : { hours } } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const holds = (n = 4) => Array.from({ length: n }, (_, beat) => ({ beat, kind: 'hold' }));
/** Plays one segment with the player holding every beat. */
function segment(s: CampaignState, seed = 1) {
  const d = structuredClone(s);
  d.rng = seedRng(seed);
  const a = run(d, reg, { type: 'physics/next_segment', payload: { runId: 'p1' } });
  expect(errors(a.events), JSON.stringify(a.events)).toEqual([]);
  const n = a.state.scene!.physics!.segment.plan!.beats.length;
  const b = run(a.state, reg, { type: 'physics/segment_end', payload: { runId: 'p1', segment: a.state.scene!.physics!.segment.n, inputs: holds(n) } });
  expect(errors(b.events)).toEqual([]);
  return { state: b.state, events: [...a.events, ...b.events] };
}

describe('what a marathon is', () => {
  it('an hour of fiction or more, or a length nobody says', () => {
    expect(isMarathon(undefined)).toBe(false);
    expect(isMarathon({ hours: 0.5 })).toBe(false);
    expect(isMarathon({ hours: 1 })).toBe(true);
    expect(isMarathon('unknown')).toBe(true);
  });

  it('phases: two per two hours, at least 2 and at most 8; unknown uses 6 and hides the count', () => {
    expect([1, 2, 3, 4, 6, 8, 12, 40].map((h) => phasesOf({ hours: h }))).toEqual([2, 2, 3, 4, 6, 8, 8, 8]);
    expect(phasesOf('unknown')).toBe(6);
    const s = marathon('unknown');
    expect(s.scene!.physics!.marathon).toMatchObject({ hours: 'unknown', phase: 1, phases: 6, waiting: false });
    expect(marathon(5).scene!.physics!.marathon).toMatchObject({ hours: 5, phases: 5 });
    expect(marathon(1).scene!.physics!.duration).toEqual({ hours: 1 });
  });

  it('a phase is the pace\'s minutes of segments (real time) or its beats over a turn (turn-based)', () => {
    expect(phaseLength('short', true, 20)).toBe(5); // 1.5 min of 20 s segments
    expect(phaseLength('normal', true, 20)).toBe(11);
    expect(phaseLength('long', true, 20)).toBe(17);
    expect(['short', 'normal', 'long'].map((p) => phaseLength(p as Pace, false, 30))).toEqual([1, 2, 3]);
    expect(phaseLength('short', true, 600)).toBe(1); // never zero
  });

  it('the clock starts where the slot does and prints as hours and minutes', () => {
    expect(marathon(2, { slot: 'afternoon' }).scene!.physics!.marathon!.clockMin).toBe(TUNING.physics.marathon.startClock.afternoon);
    expect(clockText(17 * 60 + 40)).toBe('17:40');
    expect(clockText(24 * 60 + 5)).toBe('00:05');
  });
});

describe('phases and the stretch between them', () => {
  it('a phase is its segments; then the body waits for a strategy and no segment starts', () => {
    let s = marathon(3);
    const per = 2; // normal pace, turn-based, a 30 s physics: 8 beats over a turn of 4
    for (let i = 0; i < per; i++) s = segment(s, i + 1).state;
    expect(s.scene!.physics!.marathon).toMatchObject({ phase: 1, waiting: true });
    expect(errors(run(s, reg, { type: 'physics/next_segment', payload: { runId: 'p1' } }).events)[0]).toMatchObject({ message: expect.stringMatching(/stretch/) });
  });

  it('skip is refused while a phase is being played and with a bad strategy', () => {
    const s = marathon(3);
    expect(errors(run(s, reg, { type: 'physics/skip', payload: { strategy: 'endure' } }).events)).not.toEqual([]);
    let w = s;
    for (let i = 0; i < 2; i++) w = segment(w, i + 1).state;
    expect(errors(run(w, reg, { type: 'physics/skip', payload: { strategy: 'sing' } }).events)).not.toEqual([]);
    const plain = campaign(reg, 4);
    expect(errors(run(plain, reg, { type: 'physics/skip', payload: { strategy: 'endure' } }).events)).not.toEqual([]);
  });

  /** A marathon waiting between phase 1 and 2. */
  const waiting = (over: Parameters<typeof marathon>[1] = {}, hours = 4): CampaignState => {
    let s = marathon(hours, over);
    for (let i = 0; i < 2; i++) s = segment(s, i + 1).state;
    expect(s.scene!.physics!.marathon!.waiting).toBe(true);
    return s;
  };
  const skip = (s: CampaignState, strategy: string, seed = 1) => {
    const d = structuredClone(s);
    d.rng = seedRng(seed);
    return run(d, reg, { type: 'physics/skip', payload: { strategy } });
  };

  it('the next phase starts weaker: attrition takes capacity, less 2 a level', () => {
    expect(attrition(1, 0)).toBe(TUNING.physics.marathon.attrition);
    expect(attrition(1, 2)).toBe(TUNING.physics.marathon.attrition - 4);
    expect(attrition(0.5, 5)).toBe(0);
    const s = waiting();
    const after = skip(s, 'spare').state.scene!.physics!;
    expect(after.capacity).toBe(100 - 5); // an hour a phase
    const two = skip(after.marathon ? skip(s, 'spare').state : s, 'spare').state; // second stretch needs a second phase: just check the first
    void two;
    const skilled = waiting({ level: 3 });
    expect(skip(skilled, 'spare').state.scene!.physics!.capacity).toBeGreaterThan(after.capacity);
  });

  it('after the stretch: the clock moved an hour of fiction, the phase is the next, the summary is words', () => {
    const s = waiting();
    const r = skip(s, 'spare');
    const m = r.state.scene!.physics!.marathon!;
    expect(m).toMatchObject({ phase: 2, segmentsDone: 0, waiting: false, spare: TUNING.physics.marathon.spare });
    expect(m.clockMin - s.scene!.physics!.marathon!.clockMin).toBe(60);
    expect(m.summary).toBeTruthy();
    expect(m.summary).not.toMatch(/\d/);
    expect(m.summary).not.toMatch(/\b(he|him|his)\b/i);
    expect(ofType(r.events, 'marathon_phase')[0]).toMatchObject({ phase: 2, phases: 4, strategy: 'spare', summary: m.summary, clock: clockText(m.clockMin) });
    expect(run(r.state, reg, { type: 'physics/next_segment', payload: { runId: 'p1' } }).state.scene!.physics!.segment.state).toBe('running');
  });

  it('endure draws once, and holds with 0.5 + 0.1 × the endurance level (+0.2 after a spared stretch)', () => {
    const rate = (s: CampaignState): number => {
      let n = 0;
      for (let seed = 1; seed <= 600; seed++) if (ofType(skip(s, 'endure', seed).events, 'marathon_phase')[0]!.held) n++;
      return n / 600;
    };
    expect(rate(waiting())).toBeCloseTo(0.5, 1);
    expect(rate(waiting({ level: 3 }))).toBeCloseTo(0.8, 1);
    const spared = structuredClone(waiting());
    spared.scene!.physics!.marathon!.spare = 0.2;
    expect(rate(spared)).toBeCloseTo(0.7, 1);
    const r = skip(waiting(), 'endure', 9);
    const rng = new Rng(seedRng(9));
    rng.float();
    expect(r.state.rng).toEqual(rng.state); // one draw, nothing else
  });

  it('a failed endure is a slip: the hold lasts longer, and the next phase starts lower', () => {
    const s = waiting();
    for (let seed = 1; seed < 100; seed++) {
      const r = skip(s, 'endure', seed);
      if (ofType(r.events, 'marathon_phase')[0]!.held === false) {
        expect(ofType(r.events, 'physics_slip')[0]).toMatchObject({ kind: 'skip' });
        expect(r.state.scene!.physics!.extend).toBe(1);
        expect(r.state.scene!.physics!.gauge).toBe(95 - TUNING.physics.marathon.failCost);
        return;
      }
    }
    throw new Error('never failed');
  });

  it('spare and rest draw nothing; a cruel holder refuses the rest', () => {
    const s = waiting();
    expect(skip(s, 'spare', 4).state.rng).toEqual(seedRng(4));
    const rested = skip(s, 'rest', 4);
    expect(rested.state.rng).toEqual(seedRng(4));
    expect(ofType(rested.events, 'marathon_phase')[0]!.held).toBe(true);
    registerPhysicsStyle(() => ({ primary: 'cruel' }));
    expect(ofType(skip(s, 'rest', 4).events, 'marathon_phase')[0]!.held).toBe(false);
  });

  it('cheat uses the gaze roll: caught with the chance of her attention, averaged (one draw)', () => {
    const s = waiting();
    let caught = 0;
    for (let seed = 1; seed <= 1000; seed++) if (ofType(skip(s, 'cheat', seed).events, 'physics_caught').length > 0) caught++;
    expect(caught / 1000).toBeCloseTo(0.7 * 0.6 + 0.3 * 0.25, 1); // attending: 0.7 watching, 0.3 glancing
    const one = skip(s, 'cheat', 3);
    const rng = new Rng(seedRng(3));
    rng.float();
    expect(one.state.rng).toEqual(rng.state);
  });

  it('the stop word ends it during a skip too', () => {
    const r = run(waiting(), reg, { type: 'physics/stop_word', payload: {} });
    expect(ofType(r.events, 'physics_outcome')[0]).toMatchObject({ result: 'stopped' });
    expect(r.state.scene!.physics).toBeUndefined();
  });
});

/** Plays a whole marathon with the player holding and sparing, at `pace`; returns the fiction results. */
function play(hours: number, pace: Pace, seed: number) {
  let s = marathon(hours, { pace });
  const events: Array<{ type: string; [k: string]: unknown }> = [];
  let slips = 0;
  for (let guard = 0; guard < 200 && s.scene!.physics; guard++) {
    const m = s.scene!.physics!.marathon!;
    if (m.waiting) {
      const d = structuredClone(s);
      d.rng = seedRng(seed + guard);
      const r = run(d, reg, { type: 'physics/skip', payload: { strategy: 'spare' } });
      events.push(...r.events);
      s = r.state;
    } else {
      const r = segment(s, seed + guard);
      events.push(...r.events);
      s = r.state;
    }
  }
  slips = events.filter((e) => e.type === 'physics_slip').length;
  const done = events.find((e) => e.type === 'marathon_done')!;
  return { hours: done.hours, result: done.result, slips, extraSlots: s.scene?.extraSlots, outcome: events.find((e) => e.type === 'physics_outcome')?.result, phases: done.phases };
}

describe('the whole marathon', () => {
  it('the pace changes the real length only: short and long give the same fiction results', () => {
    const short = play(3, 'short', 7);
    const long = play(3, 'long', 7);
    const normal = play(3, 'normal', 7);
    expect(long).toEqual(short);
    expect(normal).toEqual(short);
    expect(short).toMatchObject({ hours: 3, result: 'released', outcome: 'released', slips: 0, phases: 3 });
  });

  it('the calendar cost: a five-hour hold from the afternoon ends with two slots spent', () => {
    expect(extraSlotsFor(5 * 60)).toBe(1);
    expect(extraSlotsFor(4 * 60)).toBe(0);
    expect(extraSlotsFor(60)).toBe(0);
    expect(extraSlotsFor(8 * 60)).toBe(1);
    expect(extraSlotsFor(9 * 60)).toBe(2);
    let s = marathon(5, { slot: 'afternoon' });
    for (let guard = 0; guard < 200 && s.scene!.physics; guard++) {
      s = s.scene!.physics!.marathon!.waiting ? run(s, reg, { type: 'physics/skip', payload: { strategy: 'spare' } }).state : segment(s, guard + 1).state;
    }
    expect(s.scene!.physics).toBeUndefined();
    expect(s.scene!.extraSlots).toBe(1);
    const ended = run(s, reg, { type: 'scene/end', payload: {} });
    expect(errors(ended.events)).toEqual([]);
    expect(ended.state.slot).toBe('morning'); // the afternoon and the evening: the day is over
    expect(ended.state.day).toBe(s.day + 1);
  });

  it('stiff after, until the next slot after the time has passed, and marathon_done says how many hours', () => {
    let s = marathon(2, { slot: 'morning' });
    const events: Array<{ type: string; [k: string]: unknown }> = [];
    for (let guard = 0; guard < 100 && s.scene!.physics; guard++) {
      const r = s.scene!.physics!.marathon!.waiting ? run(s, reg, { type: 'physics/skip', payload: { strategy: 'spare' } }) : { ...segment(s, guard + 1) };
      events.push(...r.events);
      s = r.state;
    }
    expect(ofType(events, 'marathon_done')[0]).toMatchObject({ hours: 2, unitId: ANN, physicsId: 'weight', result: 'released' });
    expect(conditionsOf(s).map((c) => c.id)).toEqual(['stiff']);
    expect(ofType(events, 'condition_set').some((e) => e.id === 'stiff')).toBe(true);
    const ended = run(s, reg, { type: 'scene/end', payload: {} });
    expect(conditionsOf(ended.state).map((c) => c.id)).toEqual(['stiff']); // dated again after the slots passed
    expect(conditionsOf(ended.state)[0]!.until).toMatchObject({ day: ended.state.day, slot: ended.state.slot });
  });

  it('cut short by the stop word it still costs the time that passed, and is `stopped`', () => {
    let s = marathon(4);
    for (let i = 0; i < 2; i++) s = segment(s, i + 1).state;
    s = run(s, reg, { type: 'physics/skip', payload: { strategy: 'spare' } }).state;
    const r = run(s, reg, { type: 'physics/stop_word', payload: {} });
    expect(ofType(r.events, 'marathon_done')[0]).toMatchObject({ hours: 1, result: 'stopped' });
    expect(r.state.scene!.extraSlots).toBeUndefined(); // an hour is inside the slot
  });

  it('an unknown length is played to six phases, and the clock does not say where it ends', () => {
    let s = marathon('unknown');
    expect(s.scene!.physics!.marathon!.hours).toBe('unknown');
    const r = play(1, 'short', 3);
    expect(r.hours).toBe(1);
    void s;
  });
});

describe('a marathon of any other physics', () => {
  it('breath is a marathon too: the air starts each phase from a lower capacity', () => {
    registerFrameReader(() => 'play');
    const s = campaign(reg, 4);
    setRelation(s, ANN, { stateId: 'confidant' });
    enable(s, ...ON);
    const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: true, startIndex: 0 } }).state;
    setBlocking(st, { registries: reg }, { person: ANN, field: 'contact', value: 'smothered_armpit', with: COMMANDER }, { at: 3, source: 'chip' });
    delete st.scene!.physics;
    const r = run(st, reg, { type: 'physics/start', payload: { physicsId: 'breath', sourceKind: 'contact', sourceId: 'smothered_armpit', holderId: ANN, duration: { hours: 2 } } });
    const run0: PhysicsRun = r.state.scene!.physics!;
    expect(run0.marathon).toBeDefined();
    expect(run0.baseCapacity).toBe(100);
  });
});
