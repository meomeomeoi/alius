/**
 * P10e-e Task 19 (R21, R22, R23): the jaw's engine for the instrument. A `bite` input carries the beat's mean cost factor of the opening (⅓
 * resting on her toes or the ring, more higher, most wide open: jaw.html's `G.cost`); a segment that holds any (non-teeth) `bite` costs
 * `per × amount` a beat instead of the flat `per`. A `bite` with `part: 'teeth'` is a touch of the teeth: a slip (bookkeeping), never a cost.
 * Her orders (`deeper`, `suck`, `wider`, `pull_back`) and her questions are planned per beat by hash in real time (R3: no rng draw), spaced as
 * the prototype's `STYLES[].every`. Old inputs (no `bite`) resolve exactly as before.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { CUE_KINDS } from '../../../src/engine/blocking/types';
import { OWNS } from '../../../src/engine/physics/combined';
import { Rng, seedRng } from '../../../src/engine/rng';
import { jawRowOf, jawSourceOf, planSegment, resolveSegment, validInput, type ResolveEnv } from '../../../src/engine/physics/segment';
import { registerPhysicsStyle, resetPhysicsHooks } from '../../../src/engine/physics/style';
import { INPUT_KINDS, JAW_ORDERS, type PhysicsRun, type SegmentInput, type SegmentPlan } from '../../../src/engine/physics/state';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { tallySentence } from '../../../src/blocking/physicsDirectives';
import { campaign, loadCore } from '../../helpers/loyalty';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => resetPhysicsHooks());

const ANN = 'unit_ann';
const PER = TUNING.physics.jaw.per;
const mk = (over: Partial<PhysicsRun> = {}): PhysicsRun => ({
  id: 'p1', physicsId: 'jaw', sourceKind: 'contact', sourceId: 'sole_to_mouth', holderId: ANN, gauge: 0, capacity: 100,
  segment: { n: 1, state: 'running' }, startedExchange: 0, taps: 0, streak: 0, extend: 0, ...over,
});
const quiet = (n = 4): SegmentPlan => ({ beats: Array.from({ length: n }, () => ({ attention: 'busy' as const })) });
const env = (over: Partial<ResolveEnv> = {}): ResolveEnv => ({ gaugeKind: 'fill', interaction: 'gesture', style: { primary: 'neutral' }, sealLevel: 0, band: 'noticeable', ...over });
const input = (beat: number, kind: SegmentInput['kind'], extra: Partial<SegmentInput> = {}): SegmentInput => ({ beat, kind, ...extra });

describe('the cost of the opening (R21)', () => {
  it('bite replaces the flat cost: amounts .33 and 1 over two beats cost 8 × 1.33', () => {
    expect(INPUT_KINDS).toContain('bite');
    const r = resolveSegment(mk(), quiet(2), [input(0, 'bite', { amount: 0.33 }), input(1, 'bite', { amount: 1 })], env());
    expect(r.gauge).toBeCloseTo(PER * 1.33, 10);
    expect(r.slips).toBe(0);
  });

  it('a segment the instrument reported costs what it reported; a beat it did not report (a hidden tab) costs the flat rate; one bite a beat counts', () => {
    expect(resolveSegment(mk(), quiet(4), [input(0, 'bite', { amount: 0.5 })], env()).gauge).toBeCloseTo(PER * 0.5 + PER * 3, 10);
    expect(resolveSegment(mk(), quiet(2), [input(0, 'bite', { amount: 0.5 }), input(1, 'bite', { amount: 0 })], env()).gauge).toBeCloseTo(PER * 0.5, 10); // a rest's beat: 0
    expect(resolveSegment(mk(), quiet(2), [input(0, 'bite', { amount: 2 }), input(0, 'bite', { amount: 2 })], env()).gauge).toBeCloseTo(PER * 2 + PER, 10);
    // the wide-open cost may pass 1 (WIDE_COST grows past the costly zone); the gauge is clamped to the capacity
    expect(resolveSegment(mk({ gauge: 95 }), quiet(2), [input(0, 'bite', { amount: 3 })], env()).gauge).toBe(100);
    // from 70 the input degrades, as before
    expect(resolveSegment(mk({ gauge: 66 }), quiet(2), [input(0, 'bite', { amount: 1 })], env()).degraded).toBe(true);
  });

  it('a teeth bite is a slip, and costs nothing', () => {
    const r = resolveSegment(mk(), quiet(2), [input(0, 'bite', { amount: 0.4 }), input(0, 'bite', { part: 'teeth' }), input(1, 'bite', { amount: 0.4 })], env());
    expect(r.slips).toBe(1);
    expect(r.gauge).toBeCloseTo(PER * 0.8, 10);
    // a segment with only a teeth touch is not the instrument's cost: the flat cost stands, and the touch is a slip
    const only = resolveSegment(mk(), quiet(2), [input(1, 'bite', { part: 'teeth' })], env());
    expect(only).toMatchObject({ slips: 1, gauge: PER * 2 });
    // one touch a beat
    expect(resolveSegment(mk(), quiet(2), [input(1, 'bite', { part: 'teeth' }), input(1, 'bite', { part: 'teeth' })], env()).slips).toBe(1);
  });

  it('no bite: +8 a beat as today; turn-based a rest still cuts the segment and takes 30 off (neutral), and cuts it with nothing off (cruel)', () => {
    expect(resolveSegment(mk(), quiet(4), [], env()).gauge).toBe(PER * 4);
    const rest = resolveSegment(mk({ gauge: 40 }), quiet(4), [input(1, 'ask_rest')], env());
    expect(rest).toMatchObject({ askedRest: true, restGranted: true, beatsRun: 2, gauge: 40 + PER * 2 - TUNING.physics.jawRest });
    const cruel = resolveSegment(mk({ gauge: 40 }), quiet(4), [input(1, 'ask_rest')], env({ style: { primary: 'cruel' } }));
    expect(cruel).toMatchObject({ askedRest: true, restGranted: false, beatsRun: 2, gauge: 40 + PER * 2 });
  });

  it('Ruling V: in an instrument segment a granted rest takes the prototype\'s rest off (jawRest as a share of the gauge) and cuts nothing', () => {
    const bites = (amounts: number[]) => amounts.map((a, b) => input(b, 'bite', { amount: a }));
    const r = resolveSegment(mk({ gauge: 40, capacity: 120 }), quiet(4), [...bites([1, 0, 0, 1]), input(1, 'ask_rest')], env());
    expect(r).toMatchObject({ askedRest: true, restGranted: true, beatsRun: 4 });
    expect(r.gauge).toBeCloseTo(40 + PER * 2 - (TUNING.physics.jawRest * 120) / 100, 10);
  });

  it('Ruling V: a refused rest (cruel) changes nothing: every beat is charged as reported', () => {
    const bites = [1, 1, 1, 1].map((a, b) => input(b, 'bite', { amount: a }));
    const r = resolveSegment(mk({ gauge: 40 }), quiet(4), [...bites, input(1, 'ask_rest')], env({ style: { primary: 'cruel' } }));
    expect(r).toMatchObject({ askedRest: true, restGranted: false, beatsRun: 4, gauge: 40 + PER * 4 });
    expect(resolveSegment(mk({ gauge: 40 }), quiet(4), bites, env({ style: { primary: 'cruel' } })).gauge).toBe(r.gauge);
  });

  it('Ruling V: a second rest in the same segment is not read (one a segment); the first counts once', () => {
    const bites = [1, 0, 0, 0].map((a, b) => input(b, 'bite', { amount: a }));
    const one = resolveSegment(mk({ gauge: 60 }), quiet(4), [...bites, input(1, 'ask_rest')], env());
    const two = resolveSegment(mk({ gauge: 60 }), quiet(4), [...bites, input(1, 'ask_rest'), input(3, 'ask_rest')], env());
    expect(two.gauge).toBe(one.gauge);
    expect(two.gauge).toBeCloseTo(60 + PER - TUNING.physics.jawRest, 10);
  });

  it('it is the gesture\'s: the wire takes it, the gesture owns it, and a hold ignores it', () => {
    expect(validInput({ beat: 0, kind: 'bite', amount: 0.35 })).toBe(true);
    expect(validInput({ beat: 0, kind: 'bite', part: 'teeth' })).toBe(true);
    expect(validInput({ beat: 0, kind: 'bite', amount: -1 })).toBe(false);
    expect(OWNS.gesture).toContain('bite');
    const weight = resolveSegment(mk({ physicsId: 'weight', gauge: 100 }), quiet(2), [input(0, 'hold'), input(1, 'hold'), input(0, 'bite', { part: 'teeth' })], env({ gaugeKind: 'capacity', interaction: 'hold' }));
    expect(weight).toMatchObject({ slips: 0, gauge: 100 - TUNING.physics.weight.drain * 2 });
  });

  it('the tally says the teeth in the gesture\'s words', () => {
    expect(tallySentence({ slips: 2 }, reg.contactPhysics.get('jaw'))).toBe('Over the whole hold: the teeth touched her twice.');
  });

  it('jawRestMs is the prototype\'s REST_MS', () => {
    expect(TUNING.physics.jawRestMs).toBe(4200);
  });
});

describe('her orders, planned by hash (R22, R3)', () => {
  const base = (realtime = true): CampaignState => {
    const s = campaign(reg, 4);
    s.life = { salt: 12345, nextId: 0, units: {}, queue: [], delivered: [] } as never;
    s.settings.physicsRealtime = realtime;
    return s;
  };

  it('the order kinds are cue kinds', () => {
    expect(JAW_ORDERS).toEqual(['deeper', 'suck', 'wider', 'pull_back']);
    for (const k of JAW_ORDERS) expect(CUE_KINDS).toContain(k);
    for (const k of JAW_ORDERS) expect([...reg.physicsCues.values()].some((c) => c.kind === k), k).toBe(true);
  });

  it('orders are planned by hash: the same run and segment give the same orders; the rng is unchanged by them', () => {
    registerPhysicsStyle(() => ({ primary: 'clinical' })); // a clinical holder's attention draws nothing: planning a jaw segment draws nothing at all
    const s = base();
    const rng = new Rng(seedRng(7));
    const before = [...rng.state];
    const a = planSegment(s, reg, mk(), rng);
    expect(rng.state).toEqual(before);
    const b = planSegment(s, reg, mk(), new Rng(seedRng(99)));
    expect(b.beats.map((x) => [x.order, x.orderMs, x.ask])).toEqual(a.beats.map((x) => [x.order, x.orderMs, x.ask]));
    expect(a.beats.some((x) => x.order !== undefined)).toBe(true);
    // another segment, another run: another plan
    const c = planSegment(s, reg, mk({ segment: { n: 2, state: 'running' } }), new Rng(seedRng(7)));
    const d = planSegment(s, reg, mk({ id: 'p9' }), new Rng(seedRng(7)));
    const sig = (p: SegmentPlan): string => JSON.stringify(p.beats.map((x) => [x.order, x.orderMs, x.ask]));
    expect(sig(c) === sig(a) && sig(d) === sig(a)).toBe(false);
  });

  it('a neutral holder\'s jaw segment draws exactly what it drew before the orders (her attention, one a beat)', () => {
    const s = base();
    const rng = new Rng(seedRng(3));
    const plan = planSegment(s, reg, mk(), rng);
    const ref = new Rng(seedRng(3));
    for (let i = 0; i < plan.beats.length; i++) ref.float();
    expect(rng.state).toEqual(ref.state);
  });

  it('her toes give deeper, pull_back, suck and wider, each its own cue; the ring gives wider or her question; spacing follows her style', () => {
    const s = base();
    const kinds = new Set<string>();
    let asks = 0;
    for (let n = 1; n <= 40; n++) {
      const p = planSegment(s, reg, mk({ segment: { n, state: 'running' } }), new Rng(seedRng(n)));
      let last = -99;
      p.beats.forEach((b, i) => {
        if (b.order === undefined) return;
        kinds.add(b.order);
        expect(b.cue).toBe(b.order);
        if (b.order === 'suck') expect(b.orderMs!).toBeGreaterThanOrEqual(4000), expect(b.orderMs!).toBeLessThanOrEqual(7000);
        if (b.order === 'wider') expect(b.orderMs!).toBeGreaterThanOrEqual(3000), expect(b.orderMs!).toBeLessThanOrEqual(5000);
        if (b.order === 'deeper' || b.order === 'pull_back') expect(b.orderMs).toBeUndefined();
        // neutral's moves come every 5–9 s (plus the order's own length)
        expect((i - last) * TUNING.physics.beatMs).toBeGreaterThanOrEqual(5000 - TUNING.physics.beatMs);
        last = i;
      });
      const ring = planSegment(s, reg, mk({ sourceKind: 'item', sourceId: 'ring_gag', segment: { n, state: 'running' } }), new Rng(seedRng(n)));
      for (const b of ring.beats) {
        if (b.ask) { asks++; expect(b.order).toBeUndefined(); expect(b.cue === undefined || !(JAW_ORDERS as readonly string[]).includes(b.cue)).toBe(true); }
        if (b.order !== undefined) expect(b.order).toBe('wider');
      }
    }
    expect([...kinds].sort()).toEqual(['deeper', 'pull_back', 'suck', 'wider']);
    expect(asks).toBeGreaterThan(0);
    // the first move comes 3 s in (the prototype's first `nextMove`)
    const first = planSegment(s, reg, mk(), new Rng(seedRng(1))).beats.findIndex((b) => b.order !== undefined || b.ask);
    expect(first).toBe(Math.floor(3000 / TUNING.physics.beatMs));
  });

  it('M3: a jaw held open by anything but her toes or the ring (oral_service) gets no moves of hers; the rows by cues agree with the instrument (Ruling R)', () => {
    const s = base();
    expect(jawSourceOf({ sourceKind: 'contact', sourceId: 'oral_service' }, reg)).toBeNull();
    expect(jawSourceOf({ sourceKind: 'contact', sourceId: 'sole_to_mouth' }, reg)).toBe('sole_to_mouth');
    expect(jawSourceOf({ sourceKind: 'item', sourceId: 'ring_gag' }, reg)).toBe('ring_gag');
    for (let n = 1; n <= 10; n++) {
      const p = planSegment(s, reg, mk({ sourceId: 'oral_service', segment: { n, state: 'running' } }), new Rng(seedRng(n)));
      expect(p.beats.every((b) => b.order === undefined && !b.ask)).toBe(true);
    }
    expect(jawRowOf({ key: 'cruel', cues: 'none' })).toBe('cruel');
    expect(jawRowOf({ key: 'drill', cues: 'count' })).toBe('ritual');
    expect(jawRowOf({ key: 'cold', cues: 'honest' })).toBe('neutral');
    expect(jawRowOf({ key: 'someone', cues: 'none' })).toBe('neutral'); // only cruel and vindictive themselves refuse a rest
  });

  it('turn-based, or for another interaction, nothing of hers is planned', () => {
    const s = base(false);
    expect(planSegment(s, reg, mk(), new Rng(seedRng(1))).beats.every((b) => b.order === undefined && !b.ask)).toBe(true);
    const rt = base();
    expect(planSegment(rt, reg, mk({ physicsId: 'weight' }), new Rng(seedRng(1))).beats.every((b) => b.order === undefined && !b.ask)).toBe(true);
  });
});
