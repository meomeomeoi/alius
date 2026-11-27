/**
 * P15b Task 6: her manner bends the contact physics (spec §3 and planning ruling 1). The physics layer imports nothing of the dynamic: the
 * numbers read `physicsMannerOf`. Pinned here: at 0, with no reader, or with a reader that answers null, a seeded plan is the same plan and
 * the rng ends in the same place (no draw added, none moved); at ±2 each number moves by the TUNING factor, in the direction convention of
 * chunk m2 (`tempo` + = quicker = shorter, `order` + = steadier, `intensity` + = harder, `warmth` + = softer, `voice` + = more lines).
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { MannerAxis } from '../../src/engine/dynamic/types';
import { Rng, seedRng } from '../../src/engine/rng';
import { decideBoundary } from '../../src/engine/physics/boundary';
import { planSegment, segmentSecondsOf } from '../../src/engine/physics/segment';
import type { PhysicsRun, PhysicsStyle } from '../../src/engine/physics/state';
import { effectiveHoldsUntil, registerHoldsUntil, registerPhysicsManner, registerPhysicsStyle, resetPhysicsHooks } from '../../src/engine/physics/style';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../src/engine/blocking';
import type { CampaignState } from '../../src/engine/state/types';
import { TUNING } from '../../src/engine/tuning';
import { enable } from '../helpers/bonds';
import { campaign, loadCore, run, setRelation } from '../helpers/loyalty';
import '../../src/engine/actions/blocking';
import '../../src/engine/actions/physics';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { resetPhysicsHooks(); resetBlockingHooks(); });

const ANN = 'unit_ann';
const ZERO: Record<MannerAxis, number> = { intensity: 0, warmth: 0, order: 0, voice: 0, tempo: 0, curiosity: 0 };
const manner = (axes: Partial<Record<MannerAxis, number>>) => registerPhysicsManner(() => ({ ...ZERO, ...axes }));
const style = (s: PhysicsStyle) => registerPhysicsStyle(() => s);
const M = TUNING.manner;

const mk = (physicsId: string, over: Partial<PhysicsRun> = {}): PhysicsRun => ({
  id: 'p1', physicsId, sourceKind: 'contact', sourceId: 'x', holderId: ANN, gauge: 100, capacity: 100,
  segment: { n: 1, state: 'running' }, startedExchange: 0, taps: 0, streak: 0, extend: 0, ...over,
});
const base = (): CampaignState => {
  const s = campaign(reg, 4);
  s.life = { salt: 12345, nextId: 0, units: {}, queue: [], delivered: [] } as never;
  s.settings.physicsRealtime = true;
  return s;
};
const plan = (physicsId: string, s: CampaignState, seed = 1, over: Partial<PhysicsRun> = {}) => {
  const rng = new Rng(seedRng(seed));
  const p = planSegment(s, reg, mk(physicsId, over), rng);
  return { plan: p, next: rng.float() };
};
const cues = (p: ReturnType<typeof plan>) => p.plan.beats.flatMap((b) => (b.cue !== undefined ? [b.cue] : []));

describe('at 0, nothing moves', () => {
  const cases: Array<[string, string, PhysicsStyle]> = [
    ['breath', 'neutral', { primary: 'neutral' }], ['breath', 'playful', { primary: 'playful' }], ['breath', 'ritual', { primary: 'ritual' }],
    ['breath', 'vindictive (sparse)', { primary: 'vindictive' }], ['breath', 'cruel', { primary: 'cruel' }], ['weight', 'clinical', { primary: 'clinical' }],
    ['gulp', 'playful', { primary: 'playful' }], ['jaw', 'cruel', { primary: 'cruel' }], ['tongue_work', 'neutral', { primary: 'neutral' }],
  ];
  for (const [physics, label, st] of cases) {
    it(`${physics} / ${label}: a seeded plan and the rng after it are the same with no reader, a null reader and zeros`, () => {
      const over: Partial<PhysicsRun> = physics === 'jaw' ? { sourceKind: 'item', sourceId: 'ring_gag' } : {};
      for (const seed of [1, 5, 9]) {
        resetPhysicsHooks(); style(st);
        const none = plan(physics, base(), seed, over);
        resetPhysicsHooks(); style(st); registerPhysicsManner(() => null);
        expect(plan(physics, base(), seed, over)).toEqual(none);
        resetPhysicsHooks(); style(st); manner({});
        expect(plan(physics, base(), seed, over)).toEqual(none);
        resetPhysicsHooks(); style(st); manner({ curiosity: 2 }); // an axis the physics does not read
        expect(plan(physics, base(), seed, over)).toEqual(none);
      }
    });
  }
  it('the segment length is the content\'s seconds', () => {
    const s = base();
    const secs = Number(reg.contactPhysics.get('breath')!.segmentSeconds);
    expect(segmentSecondsOf(s, reg, mk('breath'))).toBe(secs);
    manner({});
    expect(segmentSecondsOf(s, reg, mk('breath'))).toBe(secs);
  });
});

describe('tempo: windows and segment length (+ = quicker = shorter)', () => {
  const width = (tempo: number, st: PhysicsStyle = { primary: 'neutral' }) => {
    resetPhysicsHooks(); style(st); manner({ tempo });
    return plan('breath', base(), 9).plan.beats.find((b) => b.opening)!.opening!.widthMs;
  };
  it('the opening is scaled by the TUNING step: +2 narrower, -2 wider, and the pair is blended before it', () => {
    expect(width(0)).toBe(600);
    expect(width(2)).toBeCloseTo(600 * (1 - 2 * M.scale), 5);
    expect(width(-2)).toBeCloseTo(600 * (1 + 2 * M.scale), 5);
    expect(width(1, { primary: 'cruel', secondary: 'affectionate' })).toBeCloseTo((250 * 0.65 + 700 * 0.35) * (1 - M.scale), 5);
  });
  it('a measuring clinical holder halves the bent width', () => {
    expect(width(-2, { primary: 'clinical' })).toBeLessThanOrEqual(500 * (1 + 2 * M.scale));
  });
  it('the segment has fewer beats at +2 and more at -2, whole beats, at least 2; turn-based it stays 4', () => {
    const n = (tempo: number, realtime = true) => { resetPhysicsHooks(); manner({ tempo }); const s = base(); s.settings.physicsRealtime = realtime; return plan('breath', s, 3).plan.beats.length; };
    const full = n(0);
    expect(full).toBe(Math.ceil((Number(reg.contactPhysics.get('breath')!.segmentSeconds) * 1000) / TUNING.physics.beatMs));
    expect(n(2)).toBe(Math.round(full * (1 - 2 * M.scale)));
    expect(n(-2)).toBe(Math.round(full * (1 + 2 * M.scale)));
    expect(n(2, false)).toBe(TUNING.physics.turnBeats);
    expect(n(-2, false)).toBe(TUNING.physics.turnBeats);
  });
  it('segmentSecondsOf is the planned beats on the beat grid, so the instrument and the controller end the segment where the plan does', () => {
    resetPhysicsHooks(); manner({ tempo: 2 });
    const s = base();
    const beats = plan('breath', s, 3).plan.beats.length;
    expect(segmentSecondsOf(s, reg, mk('breath'))).toBeCloseTo((beats * TUNING.physics.beatMs) / 1000, 5);
    resetPhysicsHooks(); manner({ tempo: 2 });
    expect(segmentSecondsOf(s, reg, mk('breath'), 3)).toBeGreaterThanOrEqual((2 * TUNING.physics.beatMs) / 1000);
  });
});

describe('order and voice: the cues', () => {
  const counts = (p: ReturnType<typeof plan>) => cues(p).filter((c) => c === 'count').length;
  it('order +2 gives a honest holder counted cues; order -2 thins a counting holder\'s; ±0 is as before', () => {
    resetPhysicsHooks(); style({ primary: 'neutral' });
    expect(counts(plan('breath', base(), 4))).toBe(0);
    resetPhysicsHooks(); style({ primary: 'neutral' }); manner({ order: 2 });
    const more = counts(plan('breath', base(), 4));
    expect(more).toBeGreaterThan(0);
    resetPhysicsHooks(); style({ primary: 'neutral' }); manner({ order: 1 });
    expect(counts(plan('breath', base(), 4))).toBeLessThanOrEqual(more);
    resetPhysicsHooks(); style({ primary: 'ritual' });
    const all = counts(plan('breath', base(), 4));
    resetPhysicsHooks(); style({ primary: 'ritual' }); manner({ order: -2 });
    const fewer = counts(plan('breath', base(), 4));
    expect(fewer).toBeLessThan(all);
    expect(fewer).toBeGreaterThan(0);
  });
  it('the counted share is a hash of the run, not a draw: the same plan twice, the rng ends where it did', () => {
    resetPhysicsHooks(); style({ primary: 'neutral' });
    const off = plan('breath', base(), 4).next;
    resetPhysicsHooks(); style({ primary: 'neutral' }); manner({ order: 2 });
    const a = plan('breath', base(), 4);
    expect(a.next).toBe(off);
    expect(plan('breath', base(), 4).plan).toEqual(a.plan);
  });
  it('a silent holder\'s openings stay silent in real time whatever her order', () => {
    resetPhysicsHooks(); style({ primary: 'cruel' }); manner({ order: 2, voice: 2 });
    for (const b of plan('breath', base(), 6).plan.beats) if (b.opening) expect(b.cue).toBeUndefined();
  });
  it('voice -2 gives fewer cue beats than voice 0, and voice +2 more; never two cues within her gap', () => {
    const n = (voice: number, st: PhysicsStyle = { primary: 'neutral' }) => { resetPhysicsHooks(); style(st); manner({ voice }); let t = 0; for (let seed = 1; seed <= 12; seed++) t += cues(plan('breath', base(), seed)).length; return t; };
    expect(n(-2)).toBeLessThan(n(0));
    expect(n(-1)).toBeLessThanOrEqual(n(0));
    expect(n(-1)).toBeGreaterThanOrEqual(n(-2));
    expect(n(2)).toBeGreaterThan(n(0));
    expect(n(1)).toBeLessThanOrEqual(n(2));
    expect(n(-2, { primary: 'ritual' })).toBeLessThan(n(0, { primary: 'ritual' }));
  });
  it('a line added by voice never comes within the gap of another cue, and the openings\' own cues are kept at -2', () => {
    const gap = Math.ceil(M.lineGapMs / TUNING.physics.beatMs);
    resetPhysicsHooks(); style({ primary: 'neutral' });
    const plain = plan('breath', base(), 8).plan.beats;
    resetPhysicsHooks(); style({ primary: 'neutral' }); manner({ voice: 2 });
    const talk = plan('breath', base(), 8).plan.beats;
    const added = talk.flatMap((b, i) => (b.cue !== undefined && plain[i]!.cue === undefined ? [i] : []));
    for (const i of added) for (let k = 1; k <= gap; k++) expect(talk[i - k]?.cue).toBeUndefined();
    resetPhysicsHooks(); style({ primary: 'neutral' }); manner({ voice: -2 });
    const quiet = plan('breath', base(), 8).plan.beats;
    quiet.forEach((b, i) => { if (plain[i]!.opening) expect(b.cue).toBe(plain[i]!.cue); });
  });
  it('a sparse holder at voice -2 keeps the cues the player needs as she had them at 0 (only her chatter is thinned)', () => {
    for (const seed of [1, 2, 3, 5, 8]) {
      resetPhysicsHooks(); style({ primary: 'vindictive' });
      const zero = plan('breath', base(), seed).plan.beats;
      resetPhysicsHooks(); style({ primary: 'vindictive' }); manner({ voice: -2 });
      const quiet = plan('breath', base(), seed).plan.beats;
      quiet.forEach((b, i) => { if (zero[i]!.cue === 'window_open' || zero[i]!.cue === 'window_false' || zero[i]!.cue === 'shift') expect(b.cue).toBe(zero[i]!.cue); });
    }
    resetPhysicsHooks(); style({ primary: 'vindictive' }); manner({ voice: -2 });
    let openings = 0;
    for (let seed = 1; seed <= 12; seed++) openings += cues(plan('breath', base(), seed)).filter((c) => c === 'window_open').length;
    expect(openings).toBeGreaterThan(0); // never all of them dropped
  });
  it('sparse stays a draw: the same draws at every voice, only the threshold moves', () => {
    resetPhysicsHooks(); style({ primary: 'vindictive' });
    const off = plan('breath', base(), 5);
    for (const voice of [-2, -1, 1, 2]) {
      resetPhysicsHooks(); style({ primary: 'vindictive' }); manner({ voice });
      const p = plan('breath', base(), 5);
      expect(p.next).toBe(off.next);
      if (voice === -2) expect(cues(p).filter((c) => ['count', 'watch', 'look_away'].includes(c))).toHaveLength(0); // her chatter goes; what the player needs does not
    }
    resetPhysicsHooks(); style({ primary: 'vindictive' }); manner({ voice: 2 });
    expect(cues(plan('breath', base(), 5)).length).toBeGreaterThanOrEqual(cues(off).length);
  });
});

describe('warmth: what she holds the commander until, one step', () => {
  const state = (breathPlay: boolean): CampaignState => {
    const s = campaign(reg, 4);
    setRelation(s, ANN, { stateId: 'confidant' });
    enable(s, 'worship', 'restraint', 'service', 'objectification', 'humiliation', ...(breathPlay ? ['breath_play'] : []));
    return s;
  };
  const holds = (base: 'signal' | 'limit' | 'blackout', warmth: number | null, breathPlay = false) => {
    resetPhysicsHooks(); registerHoldsUntil(() => base);
    if (warmth !== null) manner({ warmth });
    return effectiveHoldsUntil(state(breathPlay), reg, ANN);
  };
  it('without a manner or at 0 or ±1 it is the style\'s', () => {
    for (const w of [null, 0, 1, -1]) { expect(holds('limit', w)).toBe('limit'); expect(holds('signal', w)).toBe('signal'); expect(holds('blackout', w)).toBe('limit'); expect(holds('blackout', w, true)).toBe('blackout'); }
  });
  it('+2 is one step toward signal', () => {
    expect(holds('limit', 2)).toBe('signal');
    expect(holds('signal', 2)).toBe('signal');
    expect(holds('blackout', 2)).toBe('signal'); // blackout acts as limit without breath_play, and +2 softens that one step
    expect(holds('blackout', 2, true)).toBe('limit');
  });
  it('-2 is one step toward limit, and never to blackout without breath_play', () => {
    expect(holds('signal', -2)).toBe('limit');
    expect(holds('limit', -2)).toBe('limit');
    expect(holds('blackout', -2)).toBe('limit');
    expect(holds('limit', -2, true)).toBe('blackout');
    expect(holds('signal', -2, true)).toBe('limit');
  });
});

describe('intensity: the seal and the pressure', () => {
  const start = (axes: Partial<Record<MannerAxis, number>> | null, st: PhysicsStyle) => {
    registerFrameReader(() => 'play');
    resetPhysicsHooks(); style(st);
    if (axes !== null) manner(axes);
    const s0 = campaign(reg, 4);
    setRelation(s0, ANN, { stateId: 'confidant' });
    enable(s0, 'worship', 'restraint', 'explicit_scenes', 'service', 'objectification', 'humiliation');
    const s = run(s0, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
    setBlocking(s, { registries: reg }, { person: ANN, field: 'contact', value: 'smothered_armpit', with: COMMANDER }, { at: 3, source: 'chip' });
    return s.scene!.physics!;
  };
  it('at 0 the seal is the style\'s pick from the contact\'s range (leaky or firm)', () => {
    expect(start(null, { primary: 'affectionate' }).seal).toBe('leaky');
    expect(start({}, { primary: 'affectionate' }).seal).toBe('leaky');
    expect(start({ intensity: 1 }, { primary: 'affectionate' }).seal).toBe('leaky');
    expect(start(null, { primary: 'possessive' }).seal).toBe('firm');
  });
  it('+2 is one step tighter and -2 one step looser, inside the range', () => {
    expect(start({ intensity: 2 }, { primary: 'affectionate' }).seal).toBe('firm');
    expect(start({ intensity: -2 }, { primary: 'affectionate' }).seal).toBe('leaky');
    expect(start({ intensity: -2 }, { primary: 'possessive' }).seal).toBe('leaky');
    expect(start({ intensity: 2 }, { primary: 'possessive' }).seal).toBe('firm');
  });
  const press = (axes: Partial<Record<MannerAxis, number>> | null, st: string, left = 1) => {
    const p = start(axes, { primary: st as never });
    const s = campaign(reg, 4);
    const d = { ...s, scene: { physics: p } } as unknown as CampaignState;
    p.gauge = p.capacity * left;
    p.pressure = undefined;
    const result = { checked: false, complete: false, missed: 0, slips: 0, streak: 0, beatsRun: 4 } as never;
    const ctx = { registries: reg, rng: new Rng(seedRng(1)) };
    const out = decideBoundary(d, ctx as never, p, result);
    return { pressure: p.pressure, move: out.move };
  };
  it('a pressing holder\'s step is 0.25, bent by intensity, capped at 1.5; an affectionate one\'s lift is 0.25 bent, floored at 0.5', () => {
    expect(press(null, 'cruel')).toMatchObject({ pressure: 1.25, move: 'press' });
    expect(press({}, 'cruel')).toMatchObject({ pressure: 1.25, move: 'press' });
    expect(press({ intensity: 2 }, 'cruel').pressure).toBeCloseTo(1 + 0.25 * (1 + 2 * M.scale), 5);
    expect(press({ intensity: -2 }, 'cruel').pressure).toBeCloseTo(1 + 0.25 * (1 - 2 * M.scale), 5);
    expect(press(null, 'affectionate', 0.4)).toMatchObject({ pressure: 0.75, move: 'lift' });
    expect(press({ intensity: 2 }, 'affectionate', 0.4).pressure).toBeCloseTo(1 - 0.25 * (1 + 2 * M.scale), 5);
  });
});

describe('tempo and voice: the jaw\'s orders', () => {
  const jaw = (axes: Partial<Record<MannerAxis, number>>, seed = 2) => {
    resetPhysicsHooks(); style({ primary: 'neutral' }); manner(axes);
    return plan('jaw', base(), seed, { sourceKind: 'item', sourceId: 'ring_gag', id: `p${seed}` }).plan.beats;
  };
  it('tempo +2 gives a denser run of orders per beat than -2 (her spacing is shorter), and 0 is as before', () => {
    const rate = (t: number) => { let orders = 0, beats = 0; for (let seed = 1; seed <= 24; seed++) { const b = jaw({ tempo: t }, seed); orders += b.filter((x) => x.ask === true || x.order !== undefined).length; beats += b.length; } return orders / beats; };
    expect(rate(2)).toBeGreaterThan(rate(0));
    expect(rate(0)).toBeGreaterThan(rate(-2));
  });
  it('voice moves the share of her moves that are questions', () => {
    const asks = (v: number) => { let n = 0; for (let seed = 1; seed <= 12; seed++) { resetPhysicsHooks(); style({ primary: 'neutral' }); manner({ voice: v }); n += plan('jaw', base(), seed, { sourceKind: 'item', sourceId: 'ring_gag', id: `p${seed}` }).plan.beats.filter((b) => b.ask === true).length; } return n; };
    expect(asks(2)).toBeGreaterThan(asks(0));
    expect(asks(-2)).toBeLessThan(asks(0));
  });
});

describe('gulp\'s flow is laid from the bent row (Task 7: the engine\'s copy of the instrument\'s row)', () => {
  const flows = (axes: Partial<Record<MannerAxis, number>> | null) => {
    resetPhysicsHooks(); style({ primary: 'neutral' });
    if (axes !== null) manner(axes);
    const s = base();
    return planSegment(s, reg, mk('gulp', { sourceId: 'x_watersports', gauge: 0, segment: { n: 0, state: 'running' } }), new Rng(seedRng(3))).beats.map((b) => b.flow);
  };
  it('at 0 the same flow; intensity +2 raises her level by the TUNING step, and a warmer holder pauses more', () => {
    const off = flows(null);
    expect(flows({})).toEqual(off);
    const hard = flows({ intensity: 2 });
    let checked = 0;
    off.forEach((f, i) => { if (f !== undefined && !f.pause && !f.surge) { checked++; expect(hard[i]!.level).toBeCloseTo(f.level * (1 + 2 * M.scale), 3); } });
    expect(checked).toBeGreaterThan(5);
    const pauses = (a: ReturnType<typeof flows>) => a.filter((f) => f?.pause).length;
    expect(pauses(flows({ warmth: 2 }))).toBeGreaterThanOrEqual(pauses(off));
  });
});
