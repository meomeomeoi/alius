import { describe, it, expect, afterEach } from 'vitest';
import {
  applyRelationDelta, resetRelationGainHandler, setRelationGainHandler,
} from '../../src/engine/relationGain';
import { createCampaign } from '../../src/engine/state/create';
import type { CampaignState, Relation } from '../../src/engine/state/types';
import { TUNING } from '../../src/engine/tuning';

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

describe('relation gain', () => {
  it('first points are full value', () => {
    const s = withUnit();
    expect(applyRelationDelta(s, 'u1', 'affinity', 2, 'test')).toBe(2);
    expect(s.relations.u1.affinity).toBe(2);
  });

  it('points past the soft cap count half', () => {
    const s = withUnit(rel({ dailyGain: { trust: 0, affinity: TUNING.gain.soft, attraction: 0 } }));
    expect(applyRelationDelta(s, 'u1', 'affinity', 4, 'test')).toBe(2);
  });

  it('nothing past the hard cap', () => {
    const s = withUnit(rel({ dailyGain: { trust: 0, affinity: TUNING.gain.hard, attraction: 0 } }));
    expect(applyRelationDelta(s, 'u1', 'affinity', 5, 'test')).toBe(0);
    expect(s.relations.u1.affinity).toBe(0);
  });

  it('losses are applied in full and clamp at the floor', () => {
    const s = withUnit(rel({ trust: 3 }));
    expect(applyRelationDelta(s, 'u1', 'trust', -10, 'test')).toBe(-3);
    expect(s.relations.u1.trust).toBe(0);
    expect(s.relations.u1.dailyGain.trust).toBe(0);
  });

  it('affinity may go negative, trust may not', () => {
    const s = withUnit();
    applyRelationDelta(s, 'u1', 'affinity', -5, 'test');
    expect(s.relations.u1.affinity).toBe(-5);
  });

  it('dailyGain tracks applied gains', () => {
    const s = withUnit();
    applyRelationDelta(s, 'u1', 'trust', 3, 'test');
    expect(s.relations.u1.dailyGain.trust).toBe(3);
  });

  it('a replaced handler is used and reset restores the default', () => {
    const s = withUnit();
    setRelationGainHandler(({ relation: r }, axis, amount) => {
      r[axis] += amount * 10;
      return amount * 10;
    });
    expect(applyRelationDelta(s, 'u1', 'affinity', 1, 'p3')).toBe(10);
    resetRelationGainHandler();
    expect(applyRelationDelta(s, 'u1', 'affinity', 1, 'p3')).toBe(1);
  });

  it('the handler gets the state, the unit id and the relation', () => {
    const s = withUnit();
    s.day = 9;
    let seen: unknown;
    setRelationGainHandler((ctx, axis, amount, source) => {
      seen = { day: ctx.state.day, unitId: ctx.unitId, same: ctx.relation === ctx.state.relations.u1, axis, amount, source };
      return 0;
    });
    applyRelationDelta(s, 'u1', 'trust', 2, 'p3');
    expect(seen).toEqual({ day: 9, unitId: 'u1', same: true, axis: 'trust', amount: 2, source: 'p3' });
  });

  it('unknown unit is a no-op returning 0', () => {
    const s = withUnit();
    expect(applyRelationDelta(s, 'ghost', 'trust', 5, 'test')).toBe(0);
  });
});
