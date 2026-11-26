/**
 * P10e-e Task 29 (R32): gulp's engine for the instrument. Her flow is planned per beat by hash (R3: no rng draw) from gulp.html's `STYLES`
 * (`TUNING.physics.gulpFlow`): her level in mouths a second with its slow wander, her pauses, her surges with the warning before them (ritual
 * announces it in words, the `surge` cue; cruel has no warning; playful feints 40 %: a warning with no surge after it). A `swallow` input
 * carries the mouth taken, a `spill` the mouthfuls spilled: a segment that holds any follows the mouth (the plan's flow in, the swallows and
 * spills out) instead of the windows. A spill is a slip; at her flow's end (her volume) the chain to the cleaning starts at `100 × spilled`
 * (clamped) when she makes the commander clean it, else the hold is released. Old inputs (no swallow, no spill) resolve exactly as before.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { CUE_KINDS } from '../../../src/engine/blocking/types';
import { OWNS } from '../../../src/engine/physics/combined';
import { flowOf, floorStart, gulpRowOf } from '../../../src/engine/physics/gulp';
import { physicsInput, planSegment, resolveSegment, validInput, type ResolveEnv } from '../../../src/engine/physics/segment';
import { registerPhysicsStyle, resetPhysicsHooks } from '../../../src/engine/physics/style';
import { INPUT_KINDS, type PhysicsRun, type SegmentInput, type SegmentPlan } from '../../../src/engine/physics/state';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { GULP_STYLES, TUNING } from '../../../src/engine/tuning';
import { physicsLines, tallySentence } from '../../../src/blocking/physicsDirectives';
import { physicsLive } from '../../../src/engine/moments/live';
import { campaign, loadCore, run as dispatch } from '../../helpers/loyalty';
import '../../../src/engine/actions/physics';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => resetPhysicsHooks());

const ANN = 'unit_ann';
const P = TUNING.physics;
const B = P.beatMs;
const mk = (over: Partial<PhysicsRun> = {}): PhysicsRun => ({
  id: 'p1', physicsId: 'gulp', sourceKind: 'contact', sourceId: 'x_watersports', holderId: ANN, gauge: 0, capacity: 100,
  segment: { n: 0, state: 'held' }, startedExchange: 0, taps: 0, streak: 0, extend: 0, ...over,
});
const env = (over: Partial<ResolveEnv> = {}): ResolveEnv => ({ gaugeKind: 'fill', interaction: 'timing', style: { primary: 'neutral' }, sealLevel: 0, band: 'noticeable', ...over });
const input = (beat: number, kind: SegmentInput['kind'], extra: Partial<SegmentInput> = {}): SegmentInput => ({ beat, kind, ...extra });
const base = (realtime = true): CampaignState => {
  const s = campaign(reg, 4);
  s.life = { salt: 4242, nextId: 0, units: {}, queue: [], delivered: [], busy: [] } as never;
  s.settings.physicsRealtime = realtime;
  return s;
};
/** The same registries with gulp's gauge read as a capacity: no longer a gulp by field (no flow), the same draws otherwise. */
function withoutGulp(): Registries {
  const contactPhysics = new Map(reg.contactPhysics);
  contactPhysics.set('gulp', { ...reg.contactPhysics.get('gulp')!, gauge: { kind: 'capacity', start: 100 } });
  return { ...reg, contactPhysics };
}

describe('gulp.html\'s styles are the engine\'s (R32)', () => {
  it('the table: neutral 0.2 / 1.6 / 700 … cold 0.21 / 1.4 / 400; a style it has no row of reads neutral\'s', () => {
    expect(P.gulpFlow.styles).toBe(GULP_STYLES);
    expect([GULP_STYLES.neutral!.base, GULP_STYLES.neutral!.surge, GULP_STYLES.neutral!.warn]).toEqual([0.2, 1.6, 700]);
    expect([GULP_STYLES.cold!.base, GULP_STYLES.cold!.surge, GULP_STYLES.cold!.warn]).toEqual([0.21, 1.4, 400]);
    expect(GULP_STYLES.cruel!.warn).toBe(0);
    expect(gulpRowOf('regal')).toBe(GULP_STYLES.neutral);
    expect(gulpRowOf('affectionate')).toBe(GULP_STYLES.affectionate);
    expect(CUE_KINDS).toContain('surge');
    expect([...reg.physicsCues.values()].filter((c) => c.kind === 'surge').map((c) => c.lines)).toEqual([['now.']]);
  });

  it('swallow and spill are timing inputs', () => {
    expect(INPUT_KINDS).toContain('swallow');
    expect(INPUT_KINDS).toContain('spill');
    expect(OWNS.timing).toEqual(expect.arrayContaining(['swallow', 'spill']));
    expect(validInput(input(0, 'swallow', { amount: 0.4 }))).toBe(true);
    expect(validInput(input(0, 'spill', { amount: -1 }))).toBe(false);
  });
});

describe('her flow, planned by hash (R32, R3)', () => {
  it('her flow is planned by hash: the same run gives the same flow; state.rng is unchanged by it', () => {
    const s = base();
    const a = planSegment(s, reg, mk(), new Rng(seedRng(7)));
    const b = planSegment(s, reg, mk(), new Rng(seedRng(99)));
    expect(a.beats.map((x) => x.flow)).toEqual(b.beats.map((x) => x.flow));
    expect(a.beats.every((x) => x.flow !== undefined && x.flow.level >= 0)).toBe(true);
    expect(planSegment(s, reg, mk({ id: 'p9' }), new Rng(seedRng(7))).beats.map((x) => x.flow)).not.toEqual(a.beats.map((x) => x.flow));
    // the draws are those of the same plan without a flow: the rng ends where it would have
    const r1 = new Rng(seedRng(3));
    const r2 = new Rng(seedRng(3));
    const withFlow = planSegment(s, reg, mk(), r1);
    const without = planSegment(s, withoutGulp(), mk(), r2);
    expect(r1.state).toEqual(r2.state);
    expect(withFlow.beats.map((x) => [x.opening, x.attention])).toEqual(without.beats.map((x) => [x.opening, x.attention]));
    expect(without.beats.every((x) => x.flow === undefined)).toBe(true);
  });

  it('turn-based: no flow (the card is unchanged)', () => {
    expect(planSegment(base(false), reg, mk(), new Rng(seedRng(1))).beats.every((x) => x.flow === undefined)).toBe(true);
  });

  it('her level is her base with its slow wander (mouths a second, at the beat\'s middle); a pause is 0', () => {
    const flow = flowOf(4242, 'p1', GULP_STYLES.ritual!, 24);
    flow.forEach((f, g) => {
      const t = g * B + B / 2;
      const want = GULP_STYLES.ritual!.base * (1 + GULP_STYLES.ritual!.vary * Math.sin(t / 1300) * Math.sin(t / 3700 + 1));
      if (f.pause) expect(f.level).toBe(0);
      else expect(f.level).toBeCloseTo(f.surge ? want * GULP_STYLES.ritual!.surge : want, 3);
    });
  });

  it('her volume ends the flow: the segments cover `volumeMs` (35 s) and the last one is cut short', () => {
    const s = base();
    const full = Math.ceil(20000 / B);
    const total = Math.ceil(P.gulpFlow.volumeMs / B);
    const played = { gulp: { spilled: 0 } };
    expect(planSegment(s, reg, mk(played), new Rng(seedRng(1))).beats).toHaveLength(full);
    expect(planSegment(s, reg, mk({ ...played, segment: { n: 1, state: 'held' } }), new Rng(seedRng(1))).beats).toHaveLength(total - full);
  });

  it('review M1: the card\'s gulp (the instrument never reported: no `gulp`) keeps its beats and its cues as before', () => {
    registerPhysicsStyle(() => ({ primary: 'ritual' }));
    const s = base();
    for (const n of [0, 1, 2]) {
      const a = planSegment(s, reg, mk({ segment: { n, state: 'held' } }), new Rng(seedRng(n + 3)));
      const b = planSegment(s, withoutGulp(), mk({ segment: { n, state: 'held' } }), new Rng(seedRng(n + 3)));
      expect(a.beats.map((x) => [x.opening, x.cue, x.attention])).toEqual(b.beats.map((x) => [x.opening, x.cue, x.attention]));
    }
    expect(planSegment(s, reg, mk({ segment: { n: 1, state: 'held' } }), new Rng(seedRng(1))).beats.some((x) => x.cue === 'surge')).toBe(false);
  });

  it('ritual warns in words, cruel never, playful feints 40 % (over 200 hashed warnings, within ±8 %)', () => {
    const warnings = (style: string): Array<{ cue: boolean; feint: boolean }> => {
      const out: Array<{ cue: boolean; feint: boolean }> = [];
      for (let i = 0; out.length < 200 && i < 2000; i++) {
        registerPhysicsStyle(() => ({ primary: style as never }));
        const s = base();
        const beats = [0, 1].flatMap((n) => planSegment(s, reg, mk({ id: `p${i}`, gulp: { spilled: 0 }, segment: { n, state: 'held' } }), new Rng(seedRng(i))).beats);
        beats.forEach((b, g) => {
          if (!b.flow?.warn || g + 1 >= beats.length || beats[g + 1]!.flow?.pause) return;
          out.push({ cue: b.cue === 'surge', feint: beats[g + 1]!.flow?.surge !== true });
        });
        resetPhysicsHooks();
      }
      return out;
    };
    const ritual = warnings('ritual');
    expect(ritual.length).toBe(200);
    expect(ritual.every((w) => w.cue && !w.feint)).toBe(true);
    const playful = warnings('playful');
    expect(playful.length).toBe(200);
    expect(playful.some((w) => w.cue)).toBe(false);
    const share = playful.filter((w) => w.feint).length / playful.length;
    expect(share).toBeGreaterThan(0.32);
    expect(share).toBeLessThan(0.48);
    expect(warnings('neutral').every((w) => !w.cue && !w.feint)).toBe(true);
    // cruel: surges without a warning
    let surges = 0;
    for (let i = 0; i < 50; i++) {
      const f = flowOf(i, `p${i}`, GULP_STYLES.cruel!, 24);
      expect(f.some((x) => x.warn)).toBe(false);
      surges += f.filter((x) => x.surge).length;
    }
    expect(surges).toBeGreaterThan(50);
  });
});

describe('the mouth: swallows and spills (R32)', () => {
  const flowPlan = (levels: number[]): SegmentPlan => ({ beats: levels.map((level) => ({ attention: 'busy' as const, flow: { level } })) });

  it('a segment that holds a swallow follows the mouth: the plan\'s flow in, the mouth taken out (the gauge is the mouth × its capacity)', () => {
    const r = resolveSegment(mk({ segment: { n: 1, state: 'running' } }), flowPlan([0.2, 0.2, 0.2]), [input(0, 'swallow', { amount: 0.1 }), input(2, 'swallow', { amount: 0.4 })], env());
    expect(r.gauge).toBeCloseTo(3 * 0.2 * (B / 1000) * 100 - 50, 6);
    expect(r.caught).toBe(0);
    expect(r.missed).toBe(0);
    expect(r.slips).toBe(0);
    // never below 0, never above the capacity
    expect(resolveSegment(mk(), flowPlan([0]), [input(0, 'swallow', { amount: 0.4 })], env()).gauge).toBe(0);
    expect(resolveSegment(mk({ gauge: 95 }), flowPlan([0.5]), [input(0, 'swallow', { amount: 0 })], env()).gauge).toBe(100);
  });

  it('a spill is a slip and takes its mouthfuls out', () => {
    const r = resolveSegment(mk({ gauge: 80 }), flowPlan([0, 0]), [input(0, 'spill', { amount: 0.3 }), input(1, 'swallow', { amount: 0.1 })], env());
    expect(r.slips).toBe(1);
    expect(r.spilled).toBeCloseTo(0.3, 10);
    expect(r.gauge).toBeCloseTo(40, 6);
  });

  it('review M2: spills are counted as gulp.html counts them: an overflow or a cough begins one, an overflow running on is its amount only', () => {
    const r = resolveSegment(mk({ gauge: 100 }), flowPlan([0, 0, 0, 0]), [
      input(0, 'spill', { part: 'overflow', amount: 0.05 }), input(1, 'spill', { part: 'more', amount: 0.06 }), input(2, 'spill', { part: 'more', amount: 0.04 }),
      input(3, 'spill', { part: 'more', amount: 0.02 }), input(3, 'spill', { part: 'cough', amount: 0.3 }),
    ], env());
    expect([r.spills, r.slips]).toEqual([2, 2]);
    expect(r.spilled).toBeCloseTo(0.47, 10);
  });

  it('review I1: the engine\'s mouth sets no warning in a segment the instrument reported (no "close to the limit", no physics_warning moment)', () => {
    // the mouth crosses 70 % full on the plan's flow alone: no warning
    const r = resolveSegment(mk({ gauge: 60 }), flowPlan([0.4, 0.4]), [input(0, 'swallow', { amount: 0 })], env());
    expect(r.gauge).toBeGreaterThan(100 - P.warning);
    expect(r.warning).toBe(false);
    // the windows (no swallow) warn as before
    const plan: SegmentPlan = { beats: [{ attention: 'busy', opening: { widthMs: 600 } }] };
    expect(resolveSegment(mk({ gauge: 60 }), plan, [], env()).warning).toBe(true);
  });

  it('no swallow input: the windows as today (a caught swallow −5, a missed one +20 and a slip)', () => {
    const plan: SegmentPlan = { beats: [{ attention: 'busy', opening: { widthMs: 600 }, flow: { level: 0.3 } }, { attention: 'busy', flow: { level: 0.3 } }, { attention: 'busy', opening: { widthMs: 600 }, flow: { level: 0.3 } }] };
    const r = resolveSegment(mk({ gauge: 50 }), plan, [input(0, 'breathe')], env());
    expect(r.gauge).toBe(50 - P.gulpFill.caught + P.gulpFill.spill);
    expect([r.caught, r.missed, r.slips]).toEqual([1, 1, 1]);
    expect(r.spilled).toBeUndefined();
  });
});

describe('the spill chains to the cleaning at her flow\'s end (R32)', () => {
  /** A gulp run in a live scene, its `n`-th segment running on a plan of `beats` beats (the second is her flow's last). */
  function open(n: number, style = 'neutral'): CampaignState {
    resetPhysicsHooks(); // a reader registered before would answer first
    registerPhysicsStyle(() => ({ primary: style as never }));
    const s = base();
    const r = dispatch(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
    const d = r.state;
    const beats = n === 1 ? Math.ceil(20000 / B) : Math.ceil(P.gulpFlow.volumeMs / B) - Math.ceil(20000 / B);
    d.scene!.physics = mk({ segment: { n, state: 'running', plan: { beats: Array.from({ length: beats }, () => ({ attention: 'busy' as const, flow: { level: 0.1 } })) } } });
    return d;
  }
  const ctx = () => ({ registries: reg, rng: new Rng(seedRng(5)) });

  it('a spill is a slip and starts the cleaning at 100 × spilled (clamped)', () => {
    // the first segment: the slip is counted, nothing chains yet (her flow goes on); the run carries what was spilled
    const s = open(1);
    const ev = physicsInput(s, ctx(), 'p1', 1, [input(2, 'spill', { amount: 0.25 }), input(3, 'swallow', { amount: 0.2 })]);
    expect(ev.find((e) => e.type === 'physics_slip')).toMatchObject({ count: 1 });
    expect(ev.some((e) => e.type === 'physics_started')).toBe(false);
    expect(s.scene!.physics).toMatchObject({ physicsId: 'gulp', gulp: { spilled: 0.25 } });
    expect(s.scene!.physics!.last).toMatchObject({ slips: 0, spills: 1 });
    expect(physicsLines(s, reg)!.text).toContain('spilled once');
    expect(physicsLive(s, 'physics_slip')).toBe(true); // a spill is a slip for the moment layer
    expect(s.scene!.physics!.tally).toMatchObject({ spills: 1 });
    expect(s.scene!.physics!.tally?.slips).toBeUndefined();
    // her flow's last segment: the cleaning starts at 100 × all that was spilled
    s.scene!.physics!.segment = { n: 2, state: 'running', plan: { beats: Array.from({ length: 10 }, () => ({ attention: 'busy' as const, flow: { level: 0.1 } })) } };
    const end = physicsInput(s, ctx(), 'p1', 2, [input(0, 'spill', { amount: 0.15 })]);
    expect(end.find((e) => e.type === 'physics_started')).toMatchObject({ chained: true, from: 'gulp', physicsId: 'tongue_work' });
    expect(s.scene!.physics).toMatchObject({ physicsId: 'tongue_work', segment: { state: 'held' } });
    expect(s.scene!.physics!.gauge).toBeCloseTo(40, 6);
    // clamped
    expect(floorStart(1.4)).toBe(100);
    expect(floorStart(0)).toBe(0);
    const t = open(2);
    physicsInput(t, ctx(), 'p1', 2, [input(0, 'spill', { amount: 1.2 }), input(1, 'spill', { amount: 0.5 })]);
    expect(t.scene!.physics).toMatchObject({ physicsId: 'tongue_work', gauge: 100 });
  });

  it('a mouthed gulp never ends by its fill; at her flow\'s end she releases when little was spilled or she wipes it herself', () => {
    const full = open(1);
    full.scene!.physics!.gauge = 60;
    physicsInput(full, ctx(), 'p1', 1, [input(0, 'swallow', { amount: 0 })]);
    expect(full.scene!.physics).toMatchObject({ physicsId: 'gulp', gauge: 100 });
    // review I1: the mouth crossed 70 % without anything shown: neither the running directive nor the moment layer hears a warning
    expect(full.scene!.physics!.last?.warning).toBeUndefined();
    expect(physicsLines(full, reg)!.text).not.toContain('close to the limit');
    expect(physicsLive(full, 'physics_warning')).toBe(false);
    const little = open(2);
    const a = physicsInput(little, ctx(), 'p1', 2, [input(0, 'spill', { amount: 0.1 })]);
    expect(a.find((e) => e.type === 'physics_outcome')).toMatchObject({ result: 'released', physicsId: 'gulp' });
    expect(little.scene!.physics).toBeUndefined();
    const hers = open(2, 'affectionate');
    const b = physicsInput(hers, ctx(), 'p1', 2, [input(0, 'spill', { amount: 0.6 })]);
    expect(b.find((e) => e.type === 'physics_outcome')).toMatchObject({ result: 'released' });
    expect(b.some((e) => e.type === 'physics_started')).toBe(false);
  });

  it('the cleaning that follows is checked at its segment\'s end (gulp.html: done at 10 % left or after 40 s, her check)', () => {
    const s = open(2);
    physicsInput(s, ctx(), 'p1', 2, [input(0, 'spill', { amount: 0.5 })]);
    const r = s.scene!.physics!;
    expect(r.physicsId).toBe('tongue_work');
    r.segment = { n: 3, state: 'running', plan: { beats: Array.from({ length: 27 }, () => ({ attention: 'busy' as const, part: 'toes' })) } };
    const ev = physicsInput(s, ctx(), 'p1', 3, [input(0, 'wipe', { amount: 0.2 })]);
    expect(ev.find((e) => e.type === 'physics_outcome')).toMatchObject({ result: 'checked', physicsId: 'tongue_work', tally: { spills: 1 } });
  });

  it('without a swallow the chain is as today (the first slip, at 60)', () => {
    const s = open(1);
    physicsInput(s, ctx(), 'p1', 1, [input(0, 'breathe')]);
    const r = s.scene!.physics;
    // a plan with no opening: no catch, no miss, nothing chains
    expect(r?.physicsId).toBe('gulp');
    expect(r?.gulp).toBeUndefined();
    r!.segment = { n: 2, state: 'running', plan: { beats: [{ attention: 'busy', opening: { widthMs: 600 } }] } };
    const ev = physicsInput(s, ctx(), 'p1', 2, []);
    expect(ev.find((e) => e.type === 'physics_started')).toMatchObject({ chained: true });
    expect(s.scene!.physics).toMatchObject({ physicsId: 'tongue_work', gauge: P.gulp.spillDirt });
  });

  it('the digest names the spills, never as slips of the tongue', () => {
    expect(tallySentence({ spills: 2 }, reg.contactPhysics.get('tongue_work'))).toBe('Over the whole hold: spilled twice.');
    expect(tallySentence({ spills: 2, spilled: 0.47 }, reg.contactPhysics.get('tongue_work'))).toBe('Over the whole hold: spilled twice, 47 % of a mouthful in all.');
    expect(tallySentence({ spills: 1, slips: 1 }, reg.contactPhysics.get('tongue_work'))).toBe('Over the whole hold: 1 slip of the tongue, spilled once.');
  });
});
