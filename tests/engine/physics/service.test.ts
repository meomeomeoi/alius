/**
 * P10e-e Task 25: foot service's engine (her_activity.html, the game inside `service`). Her foot signals are hers: the prototype's five pairs
 * (the three foot acts and two of closer / still / enough) over `TUNING.physics.footSignals`, shuffled by `fnv1a` of the holder, the same
 * every time; her verdict is the crafts' quality by the prototype's threshold (`q ≥ 0.6` her good line); `physics/service { runId, verdict }`
 * lands it through P16's `rateService(…, 'engine', sceneId)`, once a scene; nothing here draws.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { installDynamicHooks } from '../../../src/engine/dynamic/hooks';
import { blankDynamic, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import { servicePaceOf, shuffleBy, signalsOf, verdictOf } from '../../../src/engine/physics/service';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { enable } from '../../helpers/bonds';
import { campaign, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/physics';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/practice';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  resetBlockingHooks();
  resetPhysicsHooks();
});

const ANN = 'unit_ann';
type Style = 'cold' | 'cruel' | 'affectionate' | 'playful' | 'neutral';
/** Ann holding at `play` (she practises service and worship), reading reports; the commander under her desk: her frame runs. */
function underDesk(style: Style = 'cold'): CampaignState {
  registerFrameReader(() => 'play');
  installDynamicHooks();
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, 'worship', 'service', 'objectification');
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  const unit = s.squad.find((u) => u.id === ANN)!;
  unit.bond = { leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: { categories: { service: { as: 'enjoys', witness: 'indifferent' }, worship: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: style }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate' } } as never;
  s.relations[ANN]!.dynamic = { ...blankDynamic(1), frame: 'play', hold: 40 };
  const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  setBlocking(st, { registries: reg }, { person: ANN, field: 'activity', value: 'reading_reports' }, { at: 1, source: 'chip' });
  setBlocking(st, { registries: reg }, { person: COMMANDER, field: 'anchor', value: 'under_desk' }, { at: 2, source: 'reading' });
  expect(st.scene!.physics?.sourceKind).toBe('activity');
  return st;
}

describe('her foot signals (P16b §8, her_activity.html herSignals)', () => {
  it('her signals are hers and stable: the same holder, the same pairs; 4–6 pairs (the prototype\'s five), the three foot acts always among them', () => {
    const s = underDesk();
    const a = signalsOf(s, ANN);
    expect(signalsOf(s, ANN)).toEqual(a);
    expect(signalsOf(structuredClone(s), ANN)).toEqual(a);
    expect(a.length).toBeGreaterThanOrEqual(4);
    expect(a.length).toBeLessThanOrEqual(6);
    expect(a).toHaveLength(5);
    const F = TUNING.physics.footSignals;
    expect(a.slice(0, 3).map((p) => p.meaning)).toEqual([...F.foot]);
    for (const p of a.slice(3)) expect(F.desk).toContain(p.meaning);
    expect(new Set(a.map((p) => p.motion)).size).toBe(5); // a motion means one thing
    for (const p of a) expect(F.motions).toContain(p.motion);
    // another holder has her own (over many ids, not all the same)
    const others = new Set(['unit_bea', 'unit_cat', 'unit_dee', 'x1', 'x2', 'x3'].map((id) => JSON.stringify(signalsOf(s, id))));
    expect(others.size).toBeGreaterThan(1);
  });

  it('shuffleBy is the prototype\'s deterministic shuffle (an LCG on the hash, never a draw)', () => {
    expect(shuffleBy(['a', 'b', 'c', 'd'], 12345)).toEqual(shuffleBy(['a', 'b', 'c', 'd'], 12345));
    expect([...shuffleBy(['a', 'b', 'c', 'd'], 7)].sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('her verdict (the prototype\'s thresholds)', () => {
  it('q ≥ 0.6 pleases her (svEndBout\'s good line); below the half-done stroke (0.3) displeases her; adequate between', () => {
    expect(verdictOf(1)).toBe('pleased');
    expect(verdictOf(0.6)).toBe('pleased');
    expect(verdictOf(0.59)).toBe('adequate');
    expect(verdictOf(0.3)).toBe('adequate');
    expect(verdictOf(0.29)).toBe('displeased');
    expect(verdictOf(0)).toBe('displeased');
    expect(verdictOf(Number.NaN)).toBe('displeased');
  });

  it('her patience is 3–5 s, cruel shorter; her kiss length and tempo by her style (SVC_STYLE), her grain and order hers', () => {
    const at = (style: Style) => servicePaceOf(underDesk(style), reg, ANN);
    for (const st of ['cold', 'affectionate', 'playful', 'neutral'] as const) {
      const p = at(st);
      expect(p.patience).toBeGreaterThanOrEqual(3);
      expect(p.patience).toBeLessThanOrEqual(5);
    }
    expect(at('cruel').patience).toBeLessThan(3);
    expect(at('playful').kiss).toEqual([0.4, 1.1]);
    expect(at('cruel').tempo).toBe(1.4);
    const p = at('cold');
    expect([1, -1]).toContain(p.grain);
    expect([...p.order.clean].sort()).toEqual(['arch', 'ball', 'edge', 'heel', 'toes']);
    expect(servicePaceOf(underDesk('cold'), reg, ANN)).toEqual(p); // hers, stable
  });

  it('her own words of how she likes her feet tilt it (P15 `how`): slowly is longer kisses and a slower tempo, the zones she names come first', () => {
    const s = underDesk('neutral');
    const base = servicePaceOf(s, reg, ANN);
    s.squad.find((u) => u.id === ANN)!.expectations = { worship: { feet: { attitude: 'craves', how: 'slowly, heel to toes' } } };
    const p = servicePaceOf(s, reg, ANN);
    expect(p.kiss[0]).toBeGreaterThan(base.kiss[0]);
    expect(p.tempo).toBeLessThan(base.tempo);
    expect(p.grain).toBe(-1); // heel to toes
    expect(p.order.clean.slice(0, 2)).toEqual(['heel', 'toes']);
  });
});

describe('physics/service', () => {
  it('physics/service rates once a scene (a second call is ignored, as rateService does); no rng', () => {
    const s = underDesk();
    const runId = s.scene!.physics!.id;
    const r = run(s, reg, { type: 'physics/service', payload: { runId, verdict: 'pleased' } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'service_rated')).toEqual([expect.objectContaining({ holderId: ANN, kind: 'pleased', via: 'engine' })]);
    expect(r.state.rng).toEqual(s.rng);
    const again = run(r.state, reg, { type: 'physics/service', payload: { runId, verdict: 'displeased' } });
    expect(errors(again.events)).toEqual([]);
    expect(ofType(again.events, 'service_rated')).toEqual([]);
    expect(again.state.rng).toEqual(s.rng);
  });

  it('lands at the session\'s end too: the run just ended (its id, the frame done) is still hers', () => {
    const s = underDesk();
    const runId = s.scene!.physics!.id;
    const ended = run(s, reg, { type: 'physics/stop_word', payload: {} }).state;
    expect(ended.scene!.physics).toBeUndefined();
    const r = run(ended, reg, { type: 'physics/service', payload: { runId, verdict: 'adequate' } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'service_rated')).toEqual([expect.objectContaining({ holderId: ANN, kind: 'adequate' })]);
  });

  it('refuses a stale run, an unknown verdict, and a run that is not her frame', () => {
    const s = underDesk();
    const runId = s.scene!.physics!.id;
    expect(errors(run(s, reg, { type: 'physics/service', payload: { runId: 'p9', verdict: 'pleased' } }).events).length).toBeGreaterThan(0);
    expect(errors(run(s, reg, { type: 'physics/service', payload: { runId, verdict: 'thrilled' } }).events).length).toBeGreaterThan(0);
    expect(errors(run(s, reg, { type: 'physics/service', payload: {} }).events).length).toBeGreaterThan(0);
  });
});
