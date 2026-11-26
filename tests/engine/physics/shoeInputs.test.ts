/**
 * P10e-e Task 27 (R29, R31): shoe service's engine for the instrument. A `wipe` input carries the zone it wiped (`part`) and the share of the
 * whole footwear's dirt mask it took off (`amount`): a segment that holds any wipe follows the mask (−100 × amount, the gauge being 100 × the
 * dirt left) instead of the right / wrong part; the check at ≤ 10 ends the run as today. A `spit` is a relief: her `cheatRoll` decides at the
 * segment's end whether she saw it, and a seen one is `physics_caught` (remembered as today). Old inputs (no wipe, no spit) resolve as before.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { OWNS } from '../../../src/engine/physics/combined';
import { physicsInput, resolveSegment, shoeSpit, validInput, type ResolveEnv } from '../../../src/engine/physics/segment';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import { INPUT_KINDS, type PhysicsRun, type SegmentInput, type SegmentPlan } from '../../../src/engine/physics/state';
import type { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { enable } from '../../helpers/bonds';
import { campaign, loadCore, run, setRelation } from '../../helpers/loyalty';
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
const T = TUNING.physics.tongue;
const mk = (over: Partial<PhysicsRun> = {}): PhysicsRun => ({
  id: 'p1', physicsId: 'tongue_work', sourceKind: 'contact', sourceId: 'boot_worship', holderId: ANN, gauge: 100, capacity: 100,
  segment: { n: 1, state: 'running' }, startedExchange: 0, taps: 0, streak: 0, extend: 0, ...over,
});
const plan = (n = 4, part = 'toes'): SegmentPlan => ({ beats: Array.from({ length: n }, () => ({ attention: 'watching' as const, part })) });
const env = (over: Partial<ResolveEnv> = {}): ResolveEnv => ({ gaugeKind: 'dirt', interaction: 'order', style: { primary: 'neutral' }, sealLevel: 0, band: 'noticeable', ...over });
const input = (beat: number, kind: SegmentInput['kind'], extra: Partial<SegmentInput> = {}): SegmentInput => ({ beat, kind, ...extra });

describe('the zones are the parts; the gauge follows the mask (R29)', () => {
  it('wipe moves the gauge to the mask: a wipe of .2 at 100 → 80', () => {
    expect(INPUT_KINDS).toContain('wipe');
    expect(validInput(input(0, 'wipe', { part: 'toe', amount: 0.2 }))).toBe(true);
    expect(OWNS.order).toContain('wipe');
    const r = resolveSegment(mk(), plan(4), [input(0, 'wipe', { part: 'toe', amount: 0.2 })], env());
    expect(r.gauge).toBeCloseTo(80, 10);
    expect(r.checked).toBe(false);
  });

  it('a segment with wipes ignores the right / wrong part; each beat counts its one wipe; the gauge never goes below 0', () => {
    const r = resolveSegment(mk(), plan(4), [input(0, 'wipe', { part: 'vamp', amount: 0.1 }), input(1, 'part', { part: 'toes' }), input(2, 'wipe', { part: 'toe', amount: 0.05 }), input(2, 'wipe', { part: 'toe', amount: 0.5 })], env());
    expect(r.gauge).toBeCloseTo(85, 10);
    expect(resolveSegment(mk({ gauge: 20 }), plan(2), [input(0, 'wipe', { amount: 0.5 })], env()).gauge).toBe(0);
  });

  it('old inputs mean what they meant: no wipe, the part decides (right 15, wrong 8)', () => {
    const r = resolveSegment(mk(), plan(4), [input(0, 'part', { part: 'toes' }), input(1, 'part', { part: 'heel' })], env());
    expect(r.gauge).toBe(100 - T.right - T.wrong);
    expect(resolveSegment(mk(), plan(4), [], env()).gauge).toBe(100);
  });

  it('the check at ≤ 10 ends the run as today', () => {
    expect(resolveSegment(mk({ gauge: 30 }), plan(4), [input(1, 'wipe', { part: 'toe', amount: 0.2 })], env()).checked).toBe(true);
    expect(resolveSegment(mk({ gauge: 30 }), plan(4), [input(1, 'wipe', { part: 'toe', amount: 0.19 })], env()).checked).toBe(false);
    const s = booted();
    const r = s.scene!.physics!;
    r.gauge = 25;
    const events = physicsInput(s, { registries: reg, rng: fakeRng(false) }, r.id, r.segment.n, [input(0, 'wipe', { part: 'toe', amount: 0.15 }), input(1, 'wipe', { part: 'vamp', amount: 0.01 })]);
    expect(events.find((e) => e.type === 'physics_outcome')).toMatchObject({ result: 'checked' });
    expect(s.scene!.physics).toBeUndefined();
  });
});

/** An rng that answers every chance as given and counts its draws. */
function fakeRng(yes: boolean): Rng & { draws: number } {
  const r = { draws: 0, chance: () => { r.draws += 1; return yes; }, float: () => { r.draws += 1; return 0.5; }, int: (a: number) => { r.draws += 1; return a; }, pick: <T>(a: readonly T[]) => { r.draws += 1; return a[0]!; } };
  return r as unknown as Rng & { draws: number };
}

/** Ann's boots: the commander at her feet, the cleaning running (one segment, her attention watching). */
function booted(): CampaignState {
  registerFrameReader(() => 'play'); // a dynamic-scope contact
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, 'worship', 'humiliation');
  const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  setBlocking(st, { registries: reg }, { person: ANN, field: 'contact', value: 'boot_worship', with: COMMANDER }, { at: 1, source: 'engine' });
  const r = st.scene!.physics!;
  expect(r.physicsId).toBe('tongue_work');
  r.segment = { n: 1, state: 'running', plan: plan(4) };
  return st;
}

/** An rng that records the chance it was asked and answers as given. */
function chanceRng(yes: boolean): Rng & { asked: number[] } {
  const r = { asked: [] as number[], chance: (p: number) => { r.asked.push(p); return yes; }, float: () => { throw new Error('no float'); }, int: () => { throw new Error('no int'); }, pick: () => { throw new Error('no pick'); } };
  return r as unknown as Rng & { asked: number[] };
}

describe('spitting (R31, Ruling AC): decided when it is made', () => {
  it('a spit is no segment relief any more: the segment resolves it as nothing, and draws nothing for it', () => {
    const r = resolveSegment(mk(), plan(4), [input(2, 'spit')], env());
    expect(r).toMatchObject({ reliefs: 0, reliefInputs: [], gauge: 100 });
    const s = booted();
    const quiet = fakeRng(true);
    physicsInput(s, { registries: reg, rng: quiet }, 'p1', 1, [input(0, 'wipe', { part: 'toe', amount: 0.1 }), input(1, 'spit')]);
    expect(quiet.draws).toBe(0);
  });

  it('physics/spit: one draw with the prototype\'s chance by her planned attention on the beat (0.75 / 0.3 / 0.06); seen, physics_caught and the tally', () => {
    for (const [attention, p] of [['watching', 0.75], ['glancing', 0.3], ['busy', 0.06]] as const) {
      const s = booted();
      s.scene!.physics!.segment.plan = { beats: Array.from({ length: 4 }, () => ({ attention, part: 'toes' })) };
      const rng = chanceRng(true);
      const ev = shoeSpit(s, { registries: reg, rng }, { runId: 'p1', beat: 2, attention: 'busy' });
      expect(rng.asked).toEqual([p]);
      expect(ev.map((e) => e.type)).toEqual(['physics_cheat', 'physics_caught']);
      expect(ev[1]).toMatchObject({ kind: 'spit', beat: 2, holderId: ANN });
      expect(s.scene!.physics!.tally).toMatchObject({ cheatsCaught: 1 });
    }
    const unseen = booted();
    const no = chanceRng(false);
    const ev = shoeSpit(unseen, { registries: reg, rng: no }, { runId: 'p1', beat: 0, attention: 'busy' });
    expect(no.asked).toEqual([0.75]);
    expect(ev.map((e) => e.type)).toEqual(['physics_cheat']);
    expect(unseen.scene!.physics!.tally?.cheatsCaught).toBeUndefined();
  });

  it('Ruling AD: a spit while the run is held is decided too, by the attention shown; a stale run or another physics is refused', () => {
    const s = booted();
    s.scene!.physics!.segment = { n: 1, state: 'held' };
    const rng = chanceRng(true);
    expect(shoeSpit(s, { registries: reg, rng }, { runId: 'p1', beat: 0, attention: 'glancing' }).map((e) => e.type)).toEqual(['physics_cheat', 'physics_caught']);
    expect(rng.asked).toEqual([0.3]);
    expect(() => shoeSpit(s, { registries: reg, rng }, { runId: 'p9', beat: 0, attention: 'busy' })).toThrow(/Stale/);
    const r = run(s, reg, { type: 'physics/spit', payload: { runId: 'p1', beat: 0, attention: 'busy' } });
    expect(r.events.some((e) => e.type === 'physics_cheat')).toBe(true);
    s.scene!.physics!.physicsId = 'jaw';
    expect(() => shoeSpit(s, { registries: reg, rng }, { runId: 'p1', beat: 0, attention: 'busy' })).toThrow(/shoe/);
  });
});
