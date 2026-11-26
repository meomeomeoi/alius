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
import { physicsInput, resolveSegment, validInput, type ResolveEnv } from '../../../src/engine/physics/segment';
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

describe('spitting is a relief (R31)', () => {
  it('a spit is a relief: cheatRoll decides (one draw a spit, none without one)', () => {
    expect(INPUT_KINDS).toContain('spit');
    expect(OWNS.order).toContain('spit');
    const r = resolveSegment(mk(), plan(4), [input(2, 'spit')], env());
    expect(r.reliefs).toBe(1);
    expect(r.reliefInputs).toEqual([{ beat: 2, kind: 'spit' }]);
    expect(r.gauge).toBe(100); // a spit cleans nothing
    const s = booted();
    const quiet = fakeRng(true);
    physicsInput(s, { registries: reg, rng: quiet }, 'p1', 1, [input(0, 'wipe', { part: 'toe', amount: 0.1 })]);
    expect(quiet.draws).toBe(0);
  });

  it('seen: physics_caught (a double slip); unseen: a cheat she did not catch, nothing counted', () => {
    const seen = booted();
    const yes = fakeRng(true);
    const ev = physicsInput(seen, { registries: reg, rng: yes }, 'p1', 1, [input(1, 'spit')]);
    expect(yes.draws).toBeGreaterThanOrEqual(1); // the catch, then the boundary's own draws for a slip (as for any caught relief)
    expect(ev.filter((e) => e.type === 'physics_cheat')).toEqual([expect.objectContaining({ kind: 'spit', beat: 1 })]);
    expect(ev.find((e) => e.type === 'physics_caught')).toMatchObject({ kind: 'spit', beat: 1, holderId: ANN });
    expect(seen.scene!.physics!.tally).toMatchObject({ cheatsCaught: 1, slips: 2 });
    const unseen = booted();
    const no = fakeRng(false);
    const ev2 = physicsInput(unseen, { registries: reg, rng: no }, 'p1', 1, [input(1, 'spit')]);
    expect(no.draws).toBe(1); // the catch only
    expect(ev2.some((e) => e.type === 'physics_caught')).toBe(false);
    expect(unseen.scene!.physics!.tally?.cheatsCaught).toBeUndefined();
  });
});
