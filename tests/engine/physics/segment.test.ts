import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking, type BlockingChange } from '../../../src/engine/blocking';
import { liveSources } from '../../../src/engine/moments/live';
import { Rng, seedRng } from '../../../src/engine/rng';
import { planSegment, rhythmOffset, resolveSegment, type ResolveEnv } from '../../../src/engine/physics/segment';
import { registerHoldsUntil, registerPhysicsStyle, resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { PhysicsRun, SegmentInput, SegmentPlan } from '../../../src/engine/physics/state';
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
  vi.restoreAllMocks();
});

const ANN = 'unit_ann';
const ON = ['worship', 'restraint', 'explicit_scenes', 'service', 'objectification', 'humiliation', 'watersports', 'bodily_fluids'];

const mk = (physicsId: string, over: Partial<PhysicsRun> = {}): PhysicsRun => {
  const kind = (reg.contactPhysics.get(physicsId)!.gauge as { kind: string; start: number });
  return {
    id: 'p1', physicsId, sourceKind: 'contact', sourceId: 'x', holderId: ANN, gauge: kind.kind === 'capacity' ? 100 : kind.start, capacity: 100,
    segment: { n: 1, state: 'running' }, startedExchange: 0, taps: 0, streak: 0, extend: 0, ...over,
  };
};
const beats = (...b: Array<Partial<SegmentPlan['beats'][number]>>): SegmentPlan => ({ beats: b.map((x) => ({ attention: 'glancing' as const, ...x })) });
const four = (over: Partial<SegmentPlan['beats'][number]> = {}) => beats(over, over, over, over);
const env = (over: Partial<ResolveEnv> = {}): ResolveEnv => ({ gaugeKind: 'capacity', interaction: 'timing', style: { primary: 'neutral' }, sealLevel: 0, band: 'noticeable', ...over });
const input = (beat: number, kind: SegmentInput['kind'], extra: Partial<SegmentInput> = {}): SegmentInput => ({ beat, kind, ...extra });

describe('resolveSegment: timing (breath)', () => {
  const plan = beats({}, { opening: { widthMs: 600 } }, {}, {});
  it('drains 14 a beat; a caught opening returns 30', () => {
    const r = resolveSegment(mk('breath', { seal: 'tight', gauge: 80 }), plan, [input(1, 'breathe')], env());
    expect(r.gauge).toBe(80 - 14 * 4 + 30);
    expect(r).toMatchObject({ caught: 1, missed: 0, streak: 1 });
  });
  it('a missed opening still gives 8, 4 when a cruel holder leads', () => {
    expect(resolveSegment(mk('breath', { seal: 'tight', gauge: 80 }), plan, [], env())).toMatchObject({ gauge: 80 - 56 + 8, missed: 1, caught: 0, streak: 0 });
    expect(resolveSegment(mk('breath', { seal: 'tight', gauge: 80 }), plan, [], env({ style: { primary: 'cruel' } })).gauge).toBe(80 - 56 + 4);
  });
  it('a breath in a false opening counts as a miss and gives no air', () => {
    const falsePlan = beats({}, { opening: { widthMs: 450, false: true } }, {}, {});
    const r = resolveSegment(mk('breath', { seal: 'tight', streak: 2, gauge: 80 }), falsePlan, [input(1, 'breathe')], env());
    expect(r).toMatchObject({ gauge: 80 - 56, falseTaken: 1, caught: 0, streak: 0 });
  });
  it('a breath outside any opening does nothing', () => {
    expect(resolveSegment(mk('breath', { seal: 'tight', gauge: 80 }), plan, [input(0, 'breathe')], env()).gauge).toBe(80 - 56 + 8);
  });
  it('the seal lets air through each beat: leaky +4, firm +1, tight 0', () => {
    const quiet = four();
    expect(resolveSegment(mk('breath', { seal: 'leaky' }), quiet, [], env()).gauge).toBe(100 - 10 * 4);
    expect(resolveSegment(mk('breath', { seal: 'firm' }), quiet, [], env()).gauge).toBe(100 - 13 * 4);
    expect(resolveSegment(mk('breath', { seal: 'tight' }), quiet, [], env()).gauge).toBe(100 - 14 * 4);
  });
  it('her seal skill tightens one step per 2 levels (leaky → firm at 2, → tight at 4)', () => {
    const quiet = four();
    expect(resolveSegment(mk('breath', { seal: 'leaky' }), quiet, [], env({ sealLevel: 1 })).gauge).toBe(100 - 10 * 4);
    expect(resolveSegment(mk('breath', { seal: 'leaky' }), quiet, [], env({ sealLevel: 2 })).gauge).toBe(100 - 13 * 4);
    expect(resolveSegment(mk('breath', { seal: 'leaky' }), quiet, [], env({ sealLevel: 4 })).gauge).toBe(100 - 14 * 4);
  });
  it('breathing through a gap is a relief input: +5 air a beat, leaky only, and it is recorded', () => {
    const r = resolveSegment(mk('breath', { seal: 'leaky' }), four(), [input(0, 'gap_breath'), input(1, 'gap_breath')], env());
    expect(r.gauge).toBe(100 - 40 + 10);
    expect(r.reliefs).toBe(2);
    expect(r.reliefInputs.map((x) => x.beat)).toEqual([0, 1]);
    expect(resolveSegment(mk('breath', { seal: 'firm' }), four(), [input(0, 'gap_breath')], env()).reliefs).toBe(0);
  });
  it('capacity is the ceiling, the floor is 0, and the streak runs across segments', () => {
    const full = resolveSegment(mk('breath', { seal: 'tight', gauge: 100 }), beats({ opening: { widthMs: 600 } }), [input(0, 'breathe')], env());
    expect(full.gauge).toBe(100); // 100 − 14 + 30 is more than the lungs hold
    expect(resolveSegment(mk('breath', { seal: 'tight', gauge: 5 }), four(), [], env()).gauge).toBe(0);
    const streak = resolveSegment(mk('breath', { seal: 'tight', streak: 3, gauge: 80 }), plan, [input(1, 'breathe')], env());
    expect(streak).toMatchObject({ streak: 4, streakBonus: 1 }); // a caught opening after three in a row
    expect(resolveSegment(mk('breath', { seal: 'tight', streak: 1 }), plan, [input(1, 'breathe')], env()).streakBonus).toBe(0);
  });
  it('the warning is crossed when the gauge falls under 30 in this segment', () => {
    expect(resolveSegment(mk('breath', { seal: 'tight', gauge: 50 }), four(), [], env()).warning).toBe(true);
    expect(resolveSegment(mk('breath', { seal: 'tight', gauge: 100 }), four(), [], env()).warning).toBe(false);
    expect(resolveSegment(mk('breath', { seal: 'tight', gauge: 20 }), four(), [], env()).warning).toBe(false); // it was crossed already
  });
});

describe('resolveSegment: hold (weight)', () => {
  const holds = [0, 1, 2, 3].map((b) => input(b, 'hold'));
  it('drains 8 a beat, and a beat without hold is a slip that drains again', () => {
    expect(resolveSegment(mk('weight'), four(), holds, env({ interaction: 'hold' })).gauge).toBe(100 - 32);
    const r = resolveSegment(mk('weight'), four(), holds.filter((i) => i.beat !== 2), env({ interaction: 'hold' }));
    expect(r).toMatchObject({ slips: 1, gauge: 100 - 32 - 8 });
  });
  it('a shift costs when the hold was uneven in the last two beats, and nothing when it was steady', () => {
    const plan = beats({}, {}, {}, { shift: 20 });
    expect(resolveSegment(mk('weight'), plan, holds, env({ interaction: 'hold' })).gauge).toBe(100 - 32);
    const uneven = resolveSegment(mk('weight'), plan, holds.filter((i) => i.beat !== 2), env({ interaction: 'hold' }));
    expect(uneven.gauge).toBe(100 - 32 - 8 - 20);
    const old = resolveSegment(mk('weight'), plan, holds.filter((i) => i.beat !== 0), env({ interaction: 'hold' }));
    expect(old.gauge).toBe(100 - 32 - 8); // beat 0 is more than two beats before the shift
  });
  it('shifting her weight back is a relief input: +15 strength', () => {
    const r = resolveSegment(mk('weight', { gauge: 60 }), four(), [...holds, input(1, 'shift_weight')], env({ interaction: 'hold' }));
    expect(r.gauge).toBe(60 - 32 + 15);
    expect(r.reliefs).toBe(1);
  });
  it('a contact with a lighter pressure drains less', () => {
    expect(resolveSegment(mk('weight', { pressure: 0.5 }), four(), holds, env({ interaction: 'hold' })).gauge).toBe(100 - 16);
  });
});

describe('resolveSegment: decision, order, passive, gesture, gulp', () => {
  it('saturation rises 10 × the scent band a beat; the mouth lowers it by 20 (a relief)', () => {
    const e = (band: ResolveEnv['band']) => env({ gaugeKind: 'fill', interaction: 'decision', band });
    expect(resolveSegment(mk('saturation'), four(), [], e('faint')).gauge).toBe(20);
    expect(resolveSegment(mk('saturation'), four(), [], e('noticeable')).gauge).toBe(40);
    expect(resolveSegment(mk('saturation'), four(), [], e('strong')).gauge).toBe(60);
    expect(resolveSegment(mk('saturation'), four(), [], e('overwhelming')).gauge).toBe(80);
    const mouth = resolveSegment(mk('saturation', { gauge: 50 }), four(), [input(2, 'mouth_breath')], e('noticeable'));
    expect(mouth).toMatchObject({ gauge: 50 + 40 - 20, reliefs: 1 });
    expect(resolveSegment(mk('saturation'), four(), [], e('overwhelming')).gauge).toBeLessThanOrEqual(100);
  });
  it('tongue work: a part in her order −15 dirt, out of order −8; at dirt ≤ 10 she checks', () => {
    const plan = beats({ part: 'toes' }, { part: 'heel' }, { part: 'sole' }, { part: 'arch' });
    const e = env({ gaugeKind: 'dirt', interaction: 'order' });
    expect(resolveSegment(mk('tongue_work'), plan, [input(0, 'part', { part: 'toes' })], e).gauge).toBe(85);
    expect(resolveSegment(mk('tongue_work'), plan, [input(0, 'part', { part: 'heel' })], e).gauge).toBe(92);
    const low = resolveSegment(mk('tongue_work', { gauge: 20 }), plan, [input(0, 'part', { part: 'toes' })], e);
    expect(low).toMatchObject({ gauge: 5, checked: true });
    expect(resolveSegment(mk('tongue_work', { gauge: 12 }), plan, [input(0, 'part', { part: 'heel' })], e).checked).toBe(true); // 4
    expect(resolveSegment(mk('tongue_work'), plan, [], e)).toMatchObject({ gauge: 100, checked: false });
  });
  it('her activity: progress +5 a beat with no input, complete at 100', () => {
    const e = env({ gaugeKind: 'progress', interaction: 'passive' });
    expect(resolveSegment(mk('her_activity'), four(), [], e)).toMatchObject({ gauge: 20, complete: false });
    expect(resolveSegment(mk('her_activity', { gauge: 90 }), four(), [], e)).toMatchObject({ gauge: 100, complete: true });
  });
  it('jaw: +8 a beat; from 70 the input degrades; asking for a rest is granted by a neutral holder', () => {
    const e = env({ gaugeKind: 'fill', interaction: 'gesture' });
    expect(resolveSegment(mk('jaw'), four(), [], e)).toMatchObject({ gauge: 32, degraded: false, askedRest: false });
    expect(resolveSegment(mk('jaw', { gauge: 60 }), four(), [], e)).toMatchObject({ gauge: 92, degraded: true });
    const rest = resolveSegment(mk('jaw', { gauge: 40 }), four(), [input(1, 'ask_rest')], e);
    expect(rest).toMatchObject({ askedRest: true, restGranted: true });
    expect(rest.gauge).toBe(40 + 8 * 2 - 30); // the segment ends at the ask: two beats ran
  });
  it('gulp: a caught swallow eases the fill, a missed one spills (a slip)', () => {
    const e = env({ gaugeKind: 'fill', interaction: 'timing' });
    const plan = beats({ opening: { widthMs: 450 } }, {}, { opening: { widthMs: 450 } }, {});
    const r = resolveSegment(mk('gulp', { gauge: 10 }), plan, [input(0, 'breathe')], e);
    expect(r).toMatchObject({ caught: 1, missed: 1, slips: 1 });
    expect(r.gauge).toBe(10 - 5 + 20);
  });
  it('resolveSegment draws nothing and is deterministic', () => {
    const rnd = vi.spyOn(Math, 'random');
    const a = resolveSegment(mk('breath', { seal: 'leaky' }), four({ opening: { widthMs: 500 } }), [input(1, 'breathe')], env());
    const b = resolveSegment(mk('breath', { seal: 'leaky' }), four({ opening: { widthMs: 500 } }), [input(1, 'breathe')], env());
    expect(a).toEqual(b);
    expect(rnd).not.toHaveBeenCalled();
  });
});

describe('planSegment', () => {
  const planOf = (physicsId: string, state: CampaignState, seed = 1, holder = ANN) => planSegment(state, reg, mk(physicsId, { holderId: holder }), new Rng(seedRng(seed)));
  const base = (): CampaignState => {
    const s = campaign(reg, 4);
    s.life = { salt: 12345, nextId: 0, units: {}, queue: [], delivered: [] } as never;
    return s;
  };

  it('is a turn of four beats, or the entry\'s seconds in real time', () => {
    const s = base();
    expect(planOf('breath', s).beats).toHaveLength(TUNING.physics.turnBeats);
    s.settings.physicsRealtime = true;
    expect(planOf('breath', s).beats).toHaveLength(Math.ceil((Number(reg.contactPhysics.get('breath')!.segmentSeconds) * 1000) / TUNING.physics.beatMs));
  });

  it('breath openings: the first inside two to four beats, widths from the style, every beat has her attention', () => {
    const s = base();
    s.settings.physicsRealtime = true;
    const p = planOf('breath', s, 4);
    const at = p.beats.flatMap((b, i) => (b.opening ? [i] : []));
    expect(at.length).toBeGreaterThan(1);
    for (let i = 1; i < at.length; i++) expect(at[i]! - at[i - 1]!).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < at.length; i++) expect(at[i]! - at[i - 1]!).toBeLessThanOrEqual(4);
    expect(p.beats.every((b) => ['watching', 'glancing', 'busy'].includes(b.attention))).toBe(true);
    expect(p.beats.filter((b) => b.opening).every((b) => b.opening!.widthMs === TUNING.physics.style.neutral!.windowMs)).toBe(true);
    expect(p.beats.filter((b) => b.opening).every((b) => b.cue === 'window_open')).toBe(true); // neutral is honest
  });

  it('a style changes the widths; the pair blends 0.65 / 0.35 and the phase lead reverses it', () => {
    const s = base();
    s.settings.physicsRealtime = true;
    const width = (style: Parameters<typeof registerPhysicsStyle>[0]) => {
      resetPhysicsHooks();
      registerPhysicsStyle(style);
      return planOf('breath', s, 9).beats.find((b) => b.opening)!.opening!.widthMs;
    };
    expect(width(() => ({ primary: 'cruel' }))).toBe(250);
    expect(width(() => ({ primary: 'affectionate' }))).toBe(700);
    expect(width(() => ({ primary: 'cruel', secondary: 'affectionate' }))).toBeCloseTo(250 * 0.65 + 700 * 0.35, 5);
    expect(width(() => ({ primary: 'cruel', secondary: 'affectionate', phaseLead: 'secondary' }))).toBeCloseTo(700 * 0.65 + 250 * 0.35, 5);
  });

  it('a playful holder sends false openings (about 35 %) and a cruel one gives some openings no cue', () => {
    const s = base();
    s.settings.physicsRealtime = true;
    registerPhysicsStyle(() => ({ primary: 'playful' }));
    let open = 0, bad = 0;
    for (let seed = 1; seed <= 60; seed++) for (const b of planOf('breath', s, seed).beats) if (b.opening) { open++; if (b.opening.false) { bad++; expect(b.cue).toBe('window_false'); } }
    expect(bad / open).toBeGreaterThan(0.25);
    expect(bad / open).toBeLessThan(0.45);
    resetPhysicsHooks();
    registerPhysicsStyle(() => ({ primary: 'cruel' }));
    s.settings.physicsRealtime = false; // turn-based: a cruel holder gives no cue to 40 % of her openings
    let silent = 0, total = 0;
    for (let seed = 1; seed <= 60; seed++) for (const b of planOf('breath', s, seed).beats) if (b.opening) { total++; if (b.cue !== 'window_open' && b.cue !== 'window_false') silent++; }
    expect(silent / total).toBeGreaterThan(0.3);
    expect(silent / total).toBeLessThan(0.5);
  });

  it('weight plans shifts every three to five beats; tongue work plans the part she wants next', () => {
    const s = base();
    s.settings.physicsRealtime = true;
    const w = planOf('weight', s, 3);
    const shifts = w.beats.flatMap((b, i) => (b.shift !== undefined ? [i] : []));
    expect(shifts.length).toBeGreaterThan(1);
    for (const b of w.beats) if (b.shift !== undefined) { expect(b.shift).toBeGreaterThanOrEqual(15); expect(b.shift).toBeLessThanOrEqual(25); expect(b.cue).toBe('shift'); }
    expect(planOf('tongue_work', s, 3).beats.every((b) => typeof b.part === 'string')).toBe(true);
    expect(planOf('her_activity', s, 3).beats.every((b) => b.opening === undefined && b.shift === undefined)).toBe(true);
  });

  it('capacity grows with the commander\'s endurance, and the openings do not', () => {
    const s = base();
    s.settings.physicsRealtime = true;
    const a = planOf('breath', s, 11);
    s.commander.endurance = { breath: { xp: 150, level: 3 } };
    expect(planOf('breath', s, 11)).toEqual(a);
  });

  it('the personal rhythm differs between units, is stable for one, and moves where the openings fall', () => {
    const s = base();
    s.settings.physicsRealtime = true;
    const offsets = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'].map((u) => rhythmOffset(s, u));
    expect(new Set(offsets).size).toBeGreaterThan(1);
    expect(rhythmOffset(s, ANN)).toBe(rhythmOffset(s, ANN));
    const other = ['unit_bea', 'unit_cat', 'unit_dee'].find((u) => rhythmOffset(s, u) !== rhythmOffset(s, ANN))!;
    const first = (u: string) => planOf('breath', s, 21, u).beats.findIndex((b) => b.opening);
    expect(first(other)).not.toBe(first(ANN));
    s.life = { ...s.life!, salt: 999 } as never;
    expect([rhythmOffset(s, ANN), rhythmOffset(s, 'unit_bea'), rhythmOffset(s, 'unit_cat')]).not.toEqual(offsets.slice(0, 3)); // it follows the seed
  });

  it('planning is deterministic from the seed', () => {
    const s = base();
    s.settings.physicsRealtime = true;
    expect(planOf('breath', s, 77)).toEqual(planOf('breath', s, 77));
    expect(planOf('breath', s, 77)).not.toEqual(planOf('breath', s, 78));
  });
});

function setUp(level = 0, on: string[] = ON): CampaignState {
  registerFrameReader(() => 'play');
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, ...on);
  if (level > 0) s.commander.endurance = { breath: { xp: 150, level }, weight: { xp: 0, level: 0 } };
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const withContact = (s: CampaignState, change: Partial<BlockingChange> = {}): CampaignState => {
  const d = structuredClone(s);
  setBlocking(d, { registries: reg }, { person: ANN, field: 'contact', value: 'smothered_armpit', with: COMMANDER, ...change }, { at: 3, source: 'chip' });
  return d;
};
const next = (s: CampaignState) => run(s, reg, { type: 'physics/next_segment', payload: { runId: s.scene!.physics!.id } });
const end = (s: CampaignState, inputs: SegmentInput[], over: Record<string, unknown> = {}) =>
  run(s, reg, { type: 'physics/segment_end', payload: { runId: s.scene!.physics!.id, segment: s.scene!.physics!.segment.n, inputs, ...over } });

describe('the segment actions', () => {
  it('capacity: level 3 gives 130 and the same plan', () => {
    const lvl = withContact(setUp(3));
    expect(lvl.scene!.physics).toMatchObject({ capacity: 130, gauge: 130 });
    expect(withContact(setUp(0)).scene!.physics).toMatchObject({ capacity: 100, gauge: 100 });
  });

  it('next_segment plans the segment (one rng draw sequence), starts it running and says so', () => {
    const s = withContact(setUp());
    const r = next(s);
    expect(errors(r.events)).toEqual([]);
    const p = r.state.scene!.physics!;
    expect(p.segment).toMatchObject({ n: 1, state: 'running' });
    expect(p.segment.plan!.beats).toHaveLength(4);
    expect(r.state.rng).not.toEqual(s.rng);
    expect(ofType(r.events, 'physics_segment')[0]).toMatchObject({ runId: p.id, n: 1, phase: 'start' });
    expect(errors(next(r.state).events)).not.toEqual([]); // a segment is already running
  });

  it('segment_end resolves the inputs, writes the summary and holds the body', () => {
    const s = next(withContact(setUp(), { value: 'footrest' })).state;
    const plan = s.scene!.physics!.segment.plan!;
    expect(plan.beats).toHaveLength(4);
    const before = s.scene!.physics!.gauge;
    const r = end(s, [0, 1, 2, 3].map((b) => input(b, 'hold')));
    expect(errors(r.events)).toEqual([]);
    const p = r.state.scene!.physics!;
    expect(p.segment.state).toBe('held');
    expect(p.gauge).toBeLessThan(before);
    expect(p.last).toBeDefined();
    expect(r.state.rng).toEqual(s.rng); // no draw here: no relief input (no gaze roll), nothing live (no moment)
    expect(ofType(r.events, 'physics_segment')[0]).toMatchObject({ runId: p.id, n: 1, phase: 'end' });
  });

  it('a stale or misplaced segment_end is refused', () => {
    const s = next(withContact(setUp())).state;
    for (const bad of [{ runId: 'p9' }, { segment: 7 }]) expect(errors(end(s, [], bad).events), JSON.stringify(bad)).not.toEqual([]);
    const held = withContact(setUp());
    expect(errors(end(held, []).events)).not.toEqual([]); // nothing is running
    expect(errors(run(s, reg, { type: 'physics/segment_end', payload: { runId: 'p1', segment: 1, inputs: [{ beat: 0, kind: 'sing' }] } }).events)).not.toEqual([]);
  });

  it('a spent gauge ends the run by what she holds the commander until', () => {
    registerHoldsUntil(() => 'signal');
    let s = next(withContact(setUp())).state;
    s.scene!.physics!.gauge = 70; // a quiet segment costs 56: 14 % is left, and she lets go at 15 %
    s.scene!.physics!.seal = 'tight';
    s.scene!.physics!.segment.plan = beats({}, {}, {}, {});
    const r = end(s, []);
    expect(ofType(r.events, 'physics_outcome')[0]).toMatchObject({ result: 'released' });
    expect(r.state.scene!.physics).toBeUndefined();
    s = next(withContact(setUp())).state;
    s.scene!.physics!.gauge = 2;
    s.scene!.physics!.segment.plan = beats({}, {}, {}, {});
    resetPhysicsHooks();
    expect(ofType(end(s, []).events, 'physics_outcome')[0]).toMatchObject({ result: 'collapse' });
  });

  it('typed consumes beats: the inputs on those beats lapse (turn-based, one beat per 40 characters)', () => {
    const s = next(withContact(setUp())).state;
    const typed = run(s, reg, { type: 'physics/typed', payload: { chars: 81, beat: 1 } });
    expect(errors(typed.events)).toEqual([]);
    expect(typed.state.scene!.physics!.segment).toMatchObject({ lapsed: [1, 2, 3] });
    const lapsedRun = end(typed.state, [input(1, 'breathe'), input(2, 'breathe')]);
    expect(ofType(lapsedRun.events, 'physics_segment')[0]).toMatchObject({ lapsed: 3 });
    expect(errors(run(withContact(setUp()), reg, { type: 'physics/typed', payload: { chars: 10 } }).events)).toEqual([]); // held: nothing to lapse, no error
  });

  it('a chain: a gulp that spills opens tongue_work at dirt 60', () => {
    const s = withContact(setUp(0, ON), { value: 'smothered_armpit' });
    const g = structuredClone(s);
    g.scene!.physics = { ...mk('gulp', { sourceId: 'smothered_armpit' }), segment: { n: 1, state: 'running', plan: beats({ opening: { widthMs: 450 } }, {}, {}, {}) } };
    const r = end(g, []);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.scene!.physics).toMatchObject({ physicsId: 'tongue_work', gauge: 60 });
    expect(ofType(r.events, 'physics_started')[0]).toMatchObject({ physicsId: 'tongue_work', chained: true, from: 'gulp' });
  });

  it('a weight slip makes the hold last longer', () => {
    const s = withContact(setUp(), { value: 'footrest' });
    const w = next(s).state;
    const r = end(w, []); // no hold at all: slips
    expect(r.state.scene!.physics!.extend).toBe(TUNING.physics.slipExtend);
  });
});

describe('a segment may bring a moment up', () => {
  it('a warning makes `endurance` live and a slip `own_slip` (both dynamic: frame play); the pass after segment_end draws only then', () => {
    const s = next(withContact(setUp())).state;
    s.scene!.physics!.gauge = 80; // 80 → 24 %: under the warning, above her release
    s.scene!.physics!.seal = 'tight';
    s.scene!.physics!.segment.plan = beats({}, {}, {}, {});
    const r = end(s, []);
    expect(r.state.scene!.physics!.last!.warning).toBe(true);
    expect(liveSources(r.state, reg).map((x) => x.sourceId)).toContain('endurance');
    expect(r.state.rng).not.toEqual(s.rng); // the chance was drawn
    const calm = next(withContact(setUp(), { value: 'footrest' })).state;
    const c = end(calm, [0, 1, 2, 3].map((b) => input(b, 'hold')));
    expect(c.state.scene!.physics!.last!.warning).toBeUndefined();
    expect(c.state.rng).toEqual(calm.rng); // nothing live: nothing drawn
    let opened = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const t = structuredClone(s);
      t.rng = seedRng(seed);
      if (ofType(run(t, reg, { type: 'physics/segment_end', payload: { runId: 'p1', segment: 1, inputs: [] } }).events, 'moment_fired').length > 0) opened++;
    }
    expect(opened).toBeGreaterThan(0);
  });

  it('a weight slip makes `own_slip` live', () => {
    const w = next(withContact(setUp(), { value: 'footrest' })).state;
    const r = end(w, []);
    expect(liveSources(r.state, reg).map((x) => x.sourceId)).toContain('own_slip');
  });
});
