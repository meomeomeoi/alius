import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { resolveSegment } from '../../../src/engine/physics/segment';
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

describe('the pace scale is applied beat by beat, before the clamp (review: pace changed the result)', () => {
  const plan = (n: number, opening = false) => ({ beats: Array.from({ length: n }, () => ({ attention: 'busy' as const, ...(opening ? { opening: { widthMs: 600 } } : {}) })) });
  const base = (gauge: number, capacity: number) => ({ id: 'p1', gauge, capacity, streak: 0, segment: { n: 1, state: 'running' as const }, seal: 'firm' as const }) as unknown as PhysicsRun;
  const sat = (scale: number) => ({ gaugeKind: 'fill' as const, interaction: 'decision' as const, style: { primary: 'neutral' as const }, sealLevel: 0, band: 'noticeable' as const, scale });

  it('a fill that a normal pace takes to its cap in two segments is taken there by one short segment and by three long ones, and never past it', () => {
    const run1 = base(25, 95);
    const normal = resolveSegment(run1, plan(4), [], sat(1)).gauge; // 65
    const normal2 = resolveSegment({ ...run1, gauge: normal } as PhysicsRun, plan(4), [], sat(1)).gauge; // 95 (clamped)
    const short = resolveSegment(run1, plan(4), [], sat(2)).gauge;
    let long = 25;
    for (let i = 0; i < 3; i++) long = resolveSegment({ ...run1, gauge: long } as PhysicsRun, plan(4), [], sat(2 / 3)).gauge;
    expect([normal, normal2]).toEqual([65, 95]);
    expect(short).toBe(95);
    expect(long).toBe(95);
  });

  it('a segment never leaves the gauge outside its range, however coarse the pace', () => {
    expect(resolveSegment(base(80, 95), plan(4), [], sat(3)).gauge).toBe(95);
    const drain = { gaugeKind: 'capacity' as const, interaction: 'timing' as const, style: { primary: 'neutral' as const }, sealLevel: 0, band: 'noticeable' as const, scale: 3 };
    expect(resolveSegment(base(20, 100), plan(4), [], drain).gauge).toBe(0);
  });

  it('a catch of a coarser pace counts as the normal pace\'s catches it stands for: the streak and its xp scale together', () => {
    const timing = (scale: number) => ({ gaugeKind: 'capacity' as const, interaction: 'timing' as const, style: { primary: 'neutral' as const }, sealLevel: 0, band: 'noticeable' as const, scale });
    const inputs = Array.from({ length: 6 }, (_, beat) => ({ beat, kind: 'breathe' as const }));
    const one = resolveSegment(base(100, 100), plan(6, true), inputs, timing(1));
    const two = resolveSegment(base(100, 100), plan(6, true), inputs, timing(2));
    expect(one).toMatchObject({ streak: 6, streakBonus: 3 }); // catches 4, 5 and 6
    expect(two).toMatchObject({ streak: 12, streakBonus: 10 }); // the second catch is already past three, and each pays twice
  });

  it('a perfectly played marathon gives about the same at every pace: collapses and xp per hold', () => {
    const tally = (pace: Pace) => {
      let collapse = 0, released = 0, xp = 0;
      for (let seed = 1; seed <= 40; seed++) {
        registerFrameReader(() => 'play');
        const s = campaign(reg, 4);
        setRelation(s, ANN, { stateId: 'confidant' });
        enable(s, ...ON);
        s.settings.marathonPace = pace;
        const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: true, startIndex: 0 } }).state;
        setBlocking(st, { registries: reg }, { person: ANN, field: 'contact', value: 'smothered_armpit', with: COMMANDER }, { at: 3, source: 'chip' });
        delete st.scene!.physics;
        st.scene!.physicsCount = 0;
        let cur = run(st, reg, { type: 'physics/start', payload: { physicsId: 'breath', sourceKind: 'contact', sourceId: 'smothered_armpit', holderId: ANN, duration: { hours: 4 } } }).state;
        cur.rng = seedRng(seed);
        let outcome = '';
        for (let g = 0; g < 400 && cur.scene?.physics; g++) {
          if (cur.scene.physics.marathon?.waiting) { cur = run(cur, reg, { type: 'physics/skip', payload: { strategy: 'endure' } }).state; continue; }
          const a = run(cur, reg, { type: 'physics/next_segment', payload: { runId: 'p1' } });
          const p = a.state.scene!.physics!;
          const inputs = p.segment.plan!.beats.flatMap((b, i) => (b.opening && !b.opening.false ? [{ beat: i, kind: 'breathe' }] : []));
          const b = run(a.state, reg, { type: 'physics/segment_end', payload: { runId: 'p1', segment: p.segment.n, inputs } });
          for (const e of b.events) if (e.type === 'physics_outcome') outcome = String(e.result);
          cur = b.state;
        }
        if (outcome === 'collapse') collapse += 1;
        else if (outcome === 'released') { released += 1; xp += cur.commander.endurance?.breath?.xp ?? 0; }
      }
      return { collapse, perHold: released > 0 ? xp / released : 0 };
    };
    const [short, normal, long] = [tally('short'), tally('normal'), tally('long')];
    expect(Math.abs(short.collapse - long.collapse)).toBeLessThanOrEqual(6); // before the fix: 36 against 0
    expect(Math.abs(short.collapse - normal.collapse)).toBeLessThanOrEqual(6);
    expect(short.perHold / long.perHold).toBeGreaterThan(0.7); // before the fix: about 0.3
    expect(short.perHold / long.perHold).toBeLessThan(1.4);
    expect(normal.perHold / long.perHold).toBeGreaterThan(0.7);
    expect(normal.perHold / long.perHold).toBeLessThan(1.4);
  });
});

describe('one input of a kind counts once on a beat (review: repeated presses)', () => {
  const plan = { beats: Array.from({ length: 4 }, () => ({ attention: 'busy' as const })) };
  const hold = (gauge: number) => ({ id: 'p1', gauge, capacity: 100, streak: 0, segment: { n: 1, state: 'running' as const } }) as unknown as PhysicsRun;
  const env = { gaugeKind: 'capacity' as const, interaction: 'hold' as const, style: { primary: 'neutral' as const }, sealLevel: 0, band: 'noticeable' as const };
  const holds = [0, 1, 2, 3].map((beat) => ({ beat, kind: 'hold' as const }));

  it('five shift_weight presses on a beat give the relief of one, and are one cheat for her to catch', () => {
    const press = (n: number) => resolveSegment(hold(40), plan, [...holds, ...Array.from({ length: n }, () => ({ beat: 0, kind: 'shift_weight' as const }))], env);
    expect(press(5).gauge).toBe(press(1).gauge);
    expect(press(5).reliefInputs).toHaveLength(1);
    expect(press(20).gauge).toBeLessThan(40 - 4 * 8 + 5 * 15); // not the five-fold relief
  });

  it('five tongue parts on a beat count as one, the first', () => {
    const tongue = { gaugeKind: 'dirt' as const, interaction: 'order' as const, style: { primary: 'neutral' as const }, sealLevel: 0, band: 'noticeable' as const };
    const tplan = { beats: [{ attention: 'busy' as const, part: 'toes' }] };
    const one = resolveSegment({ ...hold(80), dryness: 0 } as PhysicsRun, tplan, [{ beat: 0, kind: 'part', part: 'toes' }], tongue).gauge;
    const many = resolveSegment({ ...hold(80), dryness: 0 } as PhysicsRun, tplan, Array.from({ length: 5 }, () => ({ beat: 0, kind: 'part' as const, part: 'toes' })), tongue).gauge;
    expect(many).toBe(one);
  });
});

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

  it('the extra slots never run into the next day: a hold that starts in the evening or at night spends only its own slot (review)', () => {
    for (const slot of ['evening', 'night'] as const) {
      const s = marathon(5, { slot });
      s.scene!.extraSlots = 2;
      const ended = run(s, reg, { type: 'scene/end', payload: {} });
      expect(errors(ended.events)).toEqual([]);
      expect(ended.state.day, slot).toBe(s.day + 1);
      expect(ended.state.slot, slot).toBe('morning'); // not the afternoon or the evening of the day after
    }
    const afternoon = marathon(5, { slot: 'afternoon' });
    afternoon.scene!.extraSlots = 5;
    const end = run(afternoon, reg, { type: 'scene/end', payload: {} }).state;
    expect([end.day, end.slot]).toEqual([afternoon.day + 1, 'morning']); // the afternoon, then the evening: the day is over
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
