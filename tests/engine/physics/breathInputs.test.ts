/**
 * P10e-e Task 13 (R4, R14, R15, R28): breath's engine for the instrument. A `breathe` input may carry the share of the opening held
 * (`amount`), a `strain` input is holding on past an opening (it drains the beat twice; noticed, it resets the streak and moves her next
 * openings later by her style's `overDelay`), a cruel holder gives no cue on her openings in real time (with no new draw), and the run keeps
 * a tally of what resolved for the end's directive. Old inputs (no `amount`, no `strain`) resolve exactly as before.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { occlusionOf, OCCLUSION_KINDS } from '../../../src/engine/physics/occlusion';
import { Rng, seedRng } from '../../../src/engine/rng';
import { effectiveOpenings, planSegment, resolveSegment, type ResolveEnv } from '../../../src/engine/physics/segment';
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
});

const ANN = 'unit_ann';
const mk = (over: Partial<PhysicsRun> = {}): PhysicsRun => ({
  id: 'p1', physicsId: 'breath', sourceKind: 'contact', sourceId: 'x', holderId: ANN, gauge: 80, capacity: 100, seal: 'tight',
  segment: { n: 1, state: 'running' }, startedExchange: 0, taps: 0, streak: 0, extend: 0, ...over,
});
const beats = (...b: Array<Partial<SegmentPlan['beats'][number]>>): SegmentPlan => ({ beats: b.map((x) => ({ attention: 'glancing' as const, ...x })) });
const env = (over: Partial<ResolveEnv> = {}): ResolveEnv => ({ gaugeKind: 'capacity', interaction: 'timing', style: { primary: 'neutral' }, sealLevel: 0, band: 'noticeable', ...over });
const input = (beat: number, kind: SegmentInput['kind'], extra: Partial<SegmentInput> = {}): SegmentInput => ({ beat, kind, ...extra });
const DRAIN = TUNING.physics.breath.drain;
const CAUGHT = TUNING.physics.breath.caught;
const MISSED = TUNING.physics.breath.missed;

describe('the held credit (R14)', () => {
  const plan = beats({}, { opening: { widthMs: 600 } }, {}, {});
  it('a breathe without amount counts as today', () => {
    const r = resolveSegment(mk(), plan, [input(1, 'breathe')], env());
    expect(r).toMatchObject({ gauge: 80 - DRAIN * 4 + CAUGHT, caught: 1, missed: 0, streak: 1 });
  });
  it('amount .5 credits half: caught 30 × .5 = +15, capped at 30 a window', () => {
    expect(resolveSegment(mk(), plan, [input(1, 'breathe', { amount: 0.5 })], env())).toMatchObject({ gauge: 80 - DRAIN * 4 + CAUGHT * 0.5, caught: 1 });
    expect(resolveSegment(mk(), plan, [input(1, 'breathe', { amount: 3 })], env()).gauge).toBe(80 - DRAIN * 4 + CAUGHT);
    expect(resolveSegment(mk(), plan, [input(1, 'breathe', { amount: 1 })], env()).gauge).toBe(80 - DRAIN * 4 + CAUGHT);
  });
  it('the wire format takes an amount (a number ≥ 0) and the strain kind', async () => {
    const { validInput } = await import('../../../src/engine/physics/segment');
    expect(validInput({ beat: 1, kind: 'breathe', amount: 0.4 })).toBe(true);
    expect(validInput({ beat: 1, kind: 'strain', amount: 1 })).toBe(true);
    expect(validInput({ beat: 1, kind: 'breathe', amount: -1 })).toBe(false);
    expect(validInput({ beat: 1, kind: 'breathe', amount: 'all' })).toBe(false);
    expect(validInput({ beat: 1, kind: 'breathe', amount: Number.NaN })).toBe(false);
  });
});

describe('over-holding (R15)', () => {
  it('a strain drains the beat twice', () => {
    const quiet = beats({}, {}, {}, {});
    expect(resolveSegment(mk({ gauge: 100 }), quiet, [input(0, 'strain', { amount: 0.5 })], env()).gauge).toBe(100 - DRAIN * 5);
    expect(resolveSegment(mk({ gauge: 100, seal: 'firm' }), quiet, [input(2, 'strain', { amount: 1 })], env()).gauge).toBe(100 - (DRAIN - 1) * 5);
    // one strain a beat, however many were reported
    expect(resolveSegment(mk({ gauge: 100 }), quiet, [input(0, 'strain', { amount: 0.5 }), input(0, 'strain', { amount: 1 })], env()).gauge).toBe(100 - DRAIN * 5);
  });

  it('a noticed strain resets the streak and delays the next opening: 1 beat for neutral, 2 for cruel, 0 for affectionate', () => {
    const plan = beats({}, { opening: { widthMs: 600 } }, {}, {}, {});
    const noticed = input(0, 'strain', { amount: 1 });
    expect(effectiveOpenings(plan, [noticed], 'neutral')).toEqual([{ beat: 2, widthMs: 600 }]);
    expect(effectiveOpenings(plan, [noticed], 'cruel')).toEqual([{ beat: 3, widthMs: 600 }]);
    expect(effectiveOpenings(plan, [noticed], 'affectionate')).toEqual([{ beat: 1, widthMs: 600 }]);
    expect(effectiveOpenings(plan, [input(0, 'strain', { amount: 0.5 })], 'neutral')).toEqual([{ beat: 1, widthMs: 600 }]); // not noticed: nothing moves
    expect(effectiveOpenings(plan, [], 'neutral')).toEqual([{ beat: 1, widthMs: 600 }]);
    // a breathe on the old beat then misses; on the new beat it is caught
    const old = resolveSegment(mk({ streak: 2 }), plan, [noticed, input(1, 'breathe')], env());
    expect(old).toMatchObject({ caught: 0, missed: 1, streak: 0 });
    const moved = resolveSegment(mk({ streak: 2 }), plan, [noticed, input(2, 'breathe')], env());
    expect(moved).toMatchObject({ caught: 1, missed: 0, streak: 1 });
    expect(moved.gauge).toBe(80 - DRAIN * 6 + CAUGHT);
    expect(resolveSegment(mk(), plan, [noticed, input(3, 'breathe')], env({ style: { primary: 'cruel' } }))).toMatchObject({ caught: 1 });
    expect(resolveSegment(mk(), plan, [noticed, input(1, 'breathe')], env({ style: { primary: 'affectionate' } }))).toMatchObject({ caught: 1 });
  });

  it('every later opening moves with her rhythm, a false one stays false, and one moved past the segment is gone', () => {
    const plan = beats({}, { opening: { widthMs: 600 } }, {}, { opening: { widthMs: 450, false: true } }, {});
    expect(effectiveOpenings(plan, [input(0, 'strain', { amount: 1 })], 'neutral')).toEqual([{ beat: 2, widthMs: 600 }, { beat: 4, widthMs: 450, false: true }]);
    expect(effectiveOpenings(plan, [input(2, 'strain', { amount: 1 })], 'cruel')).toEqual([{ beat: 1, widthMs: 600 }]);
  });

  it('a strain is breath\'s: it goes to the timing physics of a pair', async () => {
    const { OWNS } = await import('../../../src/engine/physics/combined');
    expect(OWNS.timing).toContain('strain');
    expect(OWNS.hold).not.toContain('strain');
  });
});

describe('her silence in real time (R4)', () => {
  const base = (): CampaignState => {
    const s = campaign(reg, 4);
    s.life = { salt: 12345, nextId: 0, units: {}, queue: [], delivered: [] } as never;
    s.settings.physicsRealtime = true;
    return s;
  };
  /** The rng after planning one real-time segment for a cruel holder, recorded before this change (Task 13): it must not move. */
  const BEFORE: Record<number, number[]> = {
    1: [2233826474, 2922430478, 3495088728, 3011703646],
    5: [1258228449, 45428598, 2403032684, 2964277121],
    42: [3842047967, 842482726, 1055510308, 3034809407],
  };

  it('a cruel holder is silent in real time: the plan\'s openings carry no cue, and state.rng advances exactly as before', () => {
    registerPhysicsStyle(() => ({ primary: 'cruel' }));
    const s = base();
    for (const seed of [1, 5, 42]) {
      const rng = new Rng(seedRng(seed));
      const plan = planSegment(s, reg, mk(), rng);
      const openings = plan.beats.filter((b) => b.opening);
      expect(openings.length, `seed ${seed}`).toBeGreaterThan(0);
      for (const b of openings) expect(b.cue, `seed ${seed}`).toBeUndefined();
      expect(rng.state, `seed ${seed}`).toEqual(BEFORE[seed]);
    }
  });

  it('turn-based she still gives a cue to some openings (noCueShare), and an honest holder in real time to all', () => {
    registerPhysicsStyle(() => ({ primary: 'cruel' }));
    const s = base();
    s.settings.physicsRealtime = false;
    let cued = 0;
    for (let seed = 1; seed <= 30; seed++) for (const b of planSegment(s, reg, mk(), new Rng(seedRng(seed))).beats) if (b.opening && b.cue !== undefined) cued++;
    expect(cued).toBeGreaterThan(0);
    resetPhysicsHooks();
    const honest = base();
    for (const b of planSegment(honest, reg, mk(), new Rng(seedRng(3))).beats) if (b.opening) expect(b.cue).toBe('window_open');
  });
});

function holding(): CampaignState {
  registerFrameReader(() => 'play');
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, 'worship', 'restraint', 'explicit_scenes', 'service', 'objectification', 'humiliation');
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  setBlocking(r.state, { registries: reg }, { person: ANN, field: 'contact', value: 'smothered_breasts', with: COMMANDER }, { at: 3, source: 'chip' });
  return r.state;
}
const next = (s: CampaignState) => run(s, reg, { type: 'physics/next_segment', payload: { runId: s.scene!.physics!.id } });
const end = (s: CampaignState, inputs: SegmentInput[]) =>
  run(s, reg, { type: 'physics/segment_end', payload: { runId: s.scene!.physics!.id, segment: s.scene!.physics!.segment.n, inputs } });

describe('the tally (R28)', () => {
  it('counts what resolved, segment after segment, and the end carries it', () => {
    registerHoldsUntil(() => 'signal');
    let s = next(holding()).state;
    const plan = s.scene!.physics!.segment.plan!;
    const opens = plan.beats.flatMap((b, i) => (b.opening && !b.opening.false ? [i] : []));
    const quiet = plan.beats.findIndex((b) => !b.opening);
    expect(opens.length).toBeGreaterThan(0);
    expect(quiet).toBeGreaterThanOrEqual(0);
    let r = end(s, [...opens.map((b) => input(b, 'breathe', { amount: 0.8 })), input(quiet, 'strain', { amount: 0.5 })]);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.scene!.physics!.tally).toEqual({ caught: opens.length, strains: 1 });
    s = r.state;
    s.scene!.physics!.gauge = 100; // the second segment must not end the hold
    s = next(s).state;
    const plan2 = s.scene!.physics!.segment.plan!;
    const quiet2 = plan2.beats.findIndex((b) => !b.opening);
    const opens2 = plan2.beats.filter((b) => b.opening && !b.opening.false).length;
    r = end(s, [input(quiet2, 'strain', { amount: 1 })]);
    expect(errors(r.events)).toEqual([]);
    const t = r.state.scene!.physics!.tally!;
    expect(t.strains).toBe(2);
    expect(t.noticed).toBe(1);
    expect(t.caught).toBe(opens.length);
    expect(t.missed ?? 0).toBe(effectiveOpenings(plan2, [input(quiet2, 'strain', { amount: 1 })], 'neutral').filter((o) => !o.false).length);
    expect(opens2).toBeGreaterThanOrEqual(0);
    // the stop word ends it: the outcome carries the tally as it stands
    const stop = run(r.state, reg, { type: 'physics/stop_word', payload: {} });
    expect(ofType(stop.events, 'physics_outcome')[0]).toMatchObject({ result: 'stopped', tally: t });
  });

  it('no tally before anything resolved (an old run reads as before)', () => {
    const s = next(holding()).state;
    expect(s.scene!.physics!.tally).toBeUndefined();
    const stop = run(s, reg, { type: 'physics/stop_word', payload: {} });
    expect(ofType(stop.events, 'physics_outcome')[0]).not.toHaveProperty('tally');
  });
});

describe('the occlusion of a contact (the shape of the dark)', () => {
  const TABLE: Record<string, { kind: string; view?: string }> = {
    feet_on_face: { kind: 'gap' }, sole_to_mouth: { kind: 'lift' }, hand_over_mouth: { kind: 'lift', view: 'her_face' },
    smothered_breasts: { kind: 'slide', view: 'room' }, face_in_her_neck: { kind: 'slide', view: 'room' },
    under_her_seat: { kind: 'seat' }, face_to_bottom: { kind: 'seat' }, between_thighs: { kind: 'squeeze' }, smothered_armpit: { kind: 'wedge' },
  };
  it('validates on every contact of the table (spec §15) and is read by occlusionOf', () => {
    for (const [id, want] of Object.entries(TABLE)) {
      const c = reg.blockingContacts.get(id);
      expect(c, id).toBeDefined();
      expect((c!.occlusion as { kind: string }).kind, id).toBe(want.kind);
      expect(occlusionOf(c), id).toMatchObject({ kind: want.kind, view: want.view ?? 'ceiling' });
    }
    expect([...OCCLUSION_KINDS]).toEqual(['slit', 'gap', 'lift', 'slide', 'seat', 'squeeze', 'wedge']);
  });
  it('a contact without it is the slit and the ceiling', () => {
    expect(occlusionOf(undefined)).toEqual({ kind: 'slit', view: 'ceiling' });
    expect(occlusionOf(reg.blockingContacts.get('footrest'))).toEqual({ kind: 'slit', view: 'ceiling' });
  });
  it('the schema refuses a shape it does not know', async () => {
    const { ContactSchema } = await import('../../../src/content/schemas');
    const c = { ...reg.blockingContacts.get('feet_on_face')! };
    expect(ContactSchema.safeParse(c).success).toBe(true);
    expect(ContactSchema.safeParse({ ...c, occlusion: { kind: 'blob' } }).success).toBe(false);
    expect(ContactSchema.safeParse({ ...c, occlusion: { kind: 'gap', view: 'sky' } }).success).toBe(false);
    expect(ContactSchema.safeParse({ ...c, occlusion: { kind: 'gap', angle: -14, side: 'left', view: 'room' } }).success).toBe(true);
  });
});
