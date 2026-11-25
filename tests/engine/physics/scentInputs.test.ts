/**
 * P10e-e Task 17 (R18, R19): scent's engine for the instrument. An `inhale` input carries the words a breath left in the head; one word is the
 * gauge's capacity over the head's (`headCapacity(tolerance)`), and a segment that holds any `inhale` fills by them alone (its per-beat passive
 * fill is replaced). A `mouth_breath` with `amount` blows that many words out. The band a run fills by is hers (`scentBand` of the part she
 * presses), no longer the hard-coded `noticeable`. Old inputs (no `inhale`, no `amount`) resolve exactly as before.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { resolveEnvOf, resolveSegment, validInput, type ResolveEnv } from '../../../src/engine/physics/segment';
import { scentBand } from '../../../src/engine/physics/scent';
import { headCapacity } from '../../../src/engine/physics/stimuli';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { PhysicsRun, SegmentInput, SegmentPlan } from '../../../src/engine/physics/state';
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
const SAT = TUNING.physics.saturation;
const mk = (over: Partial<PhysicsRun> = {}): PhysicsRun => ({
  id: 'p1', physicsId: 'saturation', sourceKind: 'contact', sourceId: 'feet_on_face', holderId: ANN, gauge: 0, capacity: 100,
  segment: { n: 1, state: 'running' }, startedExchange: 0, taps: 0, streak: 0, extend: 0, ...over,
});
const quiet = (n = 4): SegmentPlan => ({ beats: Array.from({ length: n }, () => ({ attention: 'busy' as const })) });
const env = (over: Partial<ResolveEnv> = {}): ResolveEnv => ({ gaugeKind: 'fill', interaction: 'decision', style: { primary: 'neutral' }, sealLevel: 0, band: 'noticeable', head: 10, ...over });
const input = (beat: number, kind: SegmentInput['kind'], extra: Partial<SegmentInput> = {}): SegmentInput => ({ beat, kind, ...extra });

describe('the head is the gauge (R18)', () => {
  it('headCapacity is 6 + tolerance/12 words (rounded, as the prototype counts the head)', () => {
    expect(headCapacity(0)).toBe(6);
    expect(headCapacity(48)).toBe(10);
    expect(headCapacity(20)).toBe(8);
    expect(headCapacity(100)).toBe(14);
  });

  it('inhale replaces the passive fill: 3 and 2 words at capacity 10 fill 50; a segment with none fills as today', () => {
    const r = resolveSegment(mk(), quiet(), [input(0, 'inhale', { amount: 3 }), input(2, 'inhale', { amount: 2 })], env());
    expect(r.gauge).toBe(50);
    expect(resolveSegment(mk(), quiet(), [], env()).gauge).toBe(4 * SAT.per);
    expect(resolveSegment(mk(), quiet(), [], env({ head: undefined })).gauge).toBe(4 * SAT.per);
    // an inhale of 0 words still marks the segment as the instrument's: nothing fills by itself
    expect(resolveSegment(mk(), quiet(), [input(1, 'inhale', { amount: 0 })], env()).gauge).toBe(0);
  });

  it('one inhale a beat counts (as every input kind), and the gauge is clamped to the capacity', () => {
    expect(resolveSegment(mk(), quiet(), [input(0, 'inhale', { amount: 3 }), input(0, 'inhale', { amount: 3 })], env()).gauge).toBe(30);
    expect(resolveSegment(mk({ gauge: 90 }), quiet(), [input(0, 'inhale', { amount: 3 })], env()).gauge).toBe(100);
  });

  it('a mouth breath with amount blows words out (−amount × 100 / capacity), and without it costs as today', () => {
    const withAmount = resolveSegment(mk({ gauge: 60 }), quiet(), [input(0, 'inhale', { amount: 1 }), input(1, 'mouth_breath', { amount: 3 })], env());
    expect(withAmount.gauge).toBe(60 + 10 - 30);
    expect(withAmount.reliefs).toBe(1); // still a relief she may catch
    expect(resolveSegment(mk({ gauge: 60 }), quiet(), [input(1, 'mouth_breath')], env()).gauge).toBe(60 + 4 * SAT.per - SAT.mouth);
    expect(resolveSegment(mk({ gauge: 60 }), quiet(), [input(1, 'mouth_breath', { amount: 2 })], env({ head: 8 })).gauge).toBe(60 + 4 * SAT.per - 25);
  });

  it('the wire format takes the inhale kind', () => {
    expect(validInput({ beat: 0, kind: 'inhale', amount: 2 })).toBe(true);
    expect(validInput({ beat: 0, kind: 'inhale', amount: -1 })).toBe(false);
  });
});

function underFeet(): CampaignState {
  registerFrameReader(() => 'play');
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, 'worship', 'restraint', 'explicit_scenes', 'service', 'objectification', 'humiliation');
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  setBlocking(r.state, { registries: reg }, { person: ANN, field: 'contact', value: 'feet_on_face', with: COMMANDER }, { at: 3, source: 'chip' });
  return r.state;
}

describe('the band is hers (R19)', () => {
  it('a holder at band strong fills × 1.5 by the passive rule', () => {
    const s = underFeet();
    const p = s.scene!.physics;
    expect(p?.physicsId).toBe('saturation');
    expect(scentBand(s, reg, ANN, 'soles')).toBe('strong');
    const e = resolveEnvOf(s, reg, p!);
    expect(e.band).toBe('strong');
    expect(resolveSegment({ ...p!, gauge: 0, capacity: 100 }, quiet(), [], e).gauge).toBe(4 * SAT.per * 1.5);
  });

  it('the head follows the commander\'s tolerance for her scent', () => {
    const s = underFeet();
    expect(resolveEnvOf(s, reg, s.scene!.physics!).head).toBe(headCapacity(TUNING.stimuli.startTolerance));
  });
});
