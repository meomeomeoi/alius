import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { applyRelationDelta, resetRelationGainHandler } from '../../../src/engine/relationGain';
import {
  installRelationAccounting, intimacyOf, p3GainHandler, relationK, roundAway,
} from '../../../src/engine/relations/gain';
import { createCampaign } from '../../../src/engine/state/create';
import type { CampaignState, Relation } from '../../../src/engine/state/types';
import { campaign, loadCore, run } from '../../helpers/world';

afterEach(() => resetRelationGainHandler());

const rel = (over: Partial<Relation> = {}): Relation => ({
  trust: 20, affinity: 0, attraction: 0, stateId: 'stranger', stateSince: 1, history: [], flags: [],
  dailyGain: { trust: 0, affinity: 0, attraction: 0 }, loyaltyBand: 'wavering', marks: [], ...over,
});
const withUnit = (r: Relation = rel()): CampaignState => {
  const s = createCampaign({ seed: 1, commanderName: 'Vale' });
  s.relations.u1 = r;
  return s;
};
const apply = (s: CampaignState, axis: 'trust' | 'affinity' | 'attraction', amount: number): number => {
  installRelationAccounting();
  return applyRelationDelta(s, 'u1', axis, amount, 'test');
};

describe('P3 gain handler', () => {
  it('first gain is full value', () => {
    const s = withUnit();
    expect(apply(s, 'affinity', 5)).toBe(5);
    expect(s.relations.u1.affinity).toBe(5);
  });
  it('a gain after 6 points that day is halved', () => {
    const s = withUnit(rel({ dailyGain: { trust: 0, affinity: 6, attraction: 0 } }));
    expect(apply(s, 'affinity', 4)).toBe(2);
  });
  it('gains after 12 points count a third', () => {
    const s = withUnit(rel({ dailyGain: { trust: 0, affinity: 12, attraction: 0 } }));
    expect(apply(s, 'affinity', 6)).toBe(2);
  });
  it('losses are never diminished', () => {
    const s = withUnit(rel({ affinity: 10, dailyGain: { trust: 0, affinity: 30, attraction: 0 } }));
    expect(apply(s, 'affinity', -7)).toBe(-7);
    expect(s.relations.u1.affinity).toBe(3);
  });
  it('rounding is half away from zero', () => {
    expect(roundAway(2.5)).toBe(3);
    expect(roundAway(-2.5)).toBe(-3);
    expect(roundAway(2.4)).toBe(2);
    expect(roundAway(-2.4)).toBe(-2);
  });
  it('clamps at axis bounds and reports the real change', () => {
    const s = withUnit(rel({ trust: 98, affinity: -95, attraction: 2 }));
    expect(apply(s, 'trust', 5)).toBe(2);
    expect(apply(s, 'affinity', -10)).toBe(-5);
    expect(apply(s, 'attraction', -9)).toBe(-2);
    expect(s.relations.u1).toMatchObject({ trust: 100, affinity: -100, attraction: 0 });
  });
  it('campaign relationK overrides the default', () => {
    const s = withUnit(rel({ dailyGain: { trust: 0, affinity: 6, attraction: 0 } }));
    s.settings.relationK = 3;
    expect(relationK(s)).toBe(3);
    expect(apply(s, 'affinity', 6)).toBe(2); // 6 / (1 + 6/3)
    expect(relationK(createCampaign({ seed: 1, commanderName: 'V' }))).toBe(6);
  });
  it('dailyGain grows only by applied gains', () => {
    const s = withUnit(rel({ affinity: 98 }));
    apply(s, 'affinity', 5); // only 2 fit
    expect(s.relations.u1.dailyGain.affinity).toBe(2);
    apply(s, 'affinity', -4);
    expect(s.relations.u1.dailyGain.affinity).toBe(2);
  });
  it('a tiny gain that rounds to zero changes nothing', () => {
    const s = withUnit(rel({ dailyGain: { trust: 0, affinity: 60, attraction: 0 } }));
    expect(apply(s, 'affinity', 1)).toBe(0);
    expect(s.relations.u1.dailyGain.affinity).toBe(60);
  });
  it('intimacyOf defaults to romance on, medium initiative', () => {
    const s = createCampaign({ seed: 1, commanderName: 'V' });
    expect(intimacyOf(s)).toEqual({ romance: true, initiative: 'med' });
    s.settings.intimacy = { romance: false, initiative: 'low' };
    expect(intimacyOf(s)).toEqual({ romance: false, initiative: 'low' });
  });
  it('p3GainHandler is exported as a RelationGainHandler', () => {
    const s = withUnit();
    expect(p3GainHandler({ state: s, unitId: 'u1', relation: s.relations.u1 }, 'trust', 3, 't')).toBe(3);
  });
});

describe('P2 activities use the installed handler', () => {
  let reg: Registries;
  beforeAll(async () => { reg = await loadCore(); });
  it('rest with a companion follows the P3 formula', () => {
    installRelationAccounting();
    const s = campaign(reg, 4);
    s.resources.supplies = 100;
    s.relations.unit_ann.dailyGain.affinity = 6; // P2 default would give 2 -> 1 (soft cap 4), P3: 2 / 2 = 1
    s.relations.unit_bea.dailyGain.affinity = 20; // P2 default: nothing past the hard cap; P3: 2 / (1 + 20/6) = 0.46 -> 0
    const a = run(s, reg, { type: 'activity/do', payload: { activityId: 'rest', companionId: 'unit_ann' } });
    expect(a.state.relations.unit_ann.affinity - s.relations.unit_ann.affinity).toBe(1);
    const fresh = campaign(reg, 4);
    fresh.resources.supplies = 100;
    const b = run(fresh, reg, { type: 'activity/do', payload: { activityId: 'rest', companionId: 'unit_ann' } });
    expect(b.state.relations.unit_ann.affinity - fresh.relations.unit_ann.affinity).toBe(2);
  });
});
