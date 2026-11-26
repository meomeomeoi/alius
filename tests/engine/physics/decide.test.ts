/**
 * P10e-e Task 24b: a decision of her hour's script (a visitor's business on the throne) is applied only through P15's command capabilities
 * (`countermand`, read by capability): `physics/decide { runId, kind, ref }` emits `physics_decided`; without the command domain it is refused;
 * with it a roster decision changes the commander's roster.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { blankDynamic, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { CampaignState } from '../../../src/engine/state/types';
import { enable } from '../../helpers/bonds';
import { campaign, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/physics';
import '../../../src/engine/actions/dynamic';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  resetBlockingHooks();
  resetPhysicsHooks();
});

const ANN = 'unit_ann';
/** Ann holding an audience (her throne's activity), the commander placed by her; with or without the command domain of P15. */
function throne(command: boolean): CampaignState {
  registerFrameReader(() => 'play');
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, 'worship', 'service', 'objectification');
  const domain = [...reg.dynamicDomains.values()].find((d) => ((d as { grants?: string[] }).grants ?? []).includes('countermand'))!;
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  const unit = s.squad.find((u) => u.id === ANN)!;
  unit.bond = { leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: { categories: { objectification: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'regal' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate' } } as never;
  s.relations[ANN]!.dynamic = { ...blankDynamic(1), frame: 'role', hold: 70, domains: command ? [{ id: String(domain.id), since: 1 }] : [] };
  const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  setBlocking(st, { registries: reg }, { person: ANN, field: 'activity', value: 'holding_audience' }, { at: 1, source: 'chip' });
  setBlocking(st, { registries: reg }, { person: COMMANDER, field: 'anchor', value: 'beside_her', relTo: ANN }, { at: 2, source: 'chip' });
  expect(st.scene!.physics?.sourceKind).toBe('activity');
  return st;
}

describe('physics/decide (24b)', () => {
  it('holding_audience is a framed activity (the throne), read by field', () => {
    expect((reg.blockingActivities.get('holding_audience') as { frame?: { audience?: true } }).frame?.audience).toBe(true);
  });

  it('without the command domain her decision is refused (her business stays talk)', () => {
    const s = throne(false);
    const other = s.squad.find((u) => u.id !== ANN && s.roster.activeIds.includes(u.id))!.id;
    const r = run(s, reg, { type: 'physics/decide', payload: { runId: s.scene!.physics!.id, kind: 'roster', ref: other } });
    expect(errors(r.events).length).toBeGreaterThan(0);
    expect(r.state.roster.activeIds).toEqual(s.roster.activeIds);
  });

  it('with it a roster decision changes the commander\'s roster through the capability, and physics_decided says so', () => {
    const s = throne(true);
    const other = s.squad.find((u) => u.id !== ANN && s.roster.activeIds.includes(u.id))!.id;
    const r = run(s, reg, { type: 'physics/decide', payload: { runId: s.scene!.physics!.id, kind: 'roster', ref: other } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'physics_decided')).toEqual([{ type: 'physics_decided', runId: s.scene!.physics!.id, holderId: ANN, kind: 'roster', ref: other }]);
    expect(r.state.roster.activeIds).not.toContain(other);
    expect(ofType(r.events, 'roster_changed')).toHaveLength(1);
    expect(r.state.rng).toEqual(s.rng);
  });

  it('refuses a stale run, an unknown kind and a roster ref that is no unit', () => {
    const s = throne(true);
    expect(errors(run(s, reg, { type: 'physics/decide', payload: { runId: 'p9', kind: 'roster', ref: 'x' } }).events).length).toBeGreaterThan(0);
    expect(errors(run(s, reg, { type: 'physics/decide', payload: { runId: s.scene!.physics!.id, kind: 'promotion' } }).events).length).toBeGreaterThan(0);
    expect(errors(run(s, reg, { type: 'physics/decide', payload: { runId: s.scene!.physics!.id, kind: 'roster', ref: 'nobody' } }).events).length).toBeGreaterThan(0);
  });
});
