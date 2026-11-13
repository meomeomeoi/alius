import { beforeAll, describe, expect, it } from 'vitest';
import type { Entry, Registries } from '../../../src/content/types';
import { commanderMaxHp } from '../../../src/engine/combat/crisis';
import { activityCost, checkActivity } from '../../../src/engine/activities';
import { bodyGrowthMult } from '../../../src/engine/commander/profile';
import { socialGrowthMult } from '../../../src/engine/social';
import { leashWeekly } from '../../../src/engine/leash/weekly';
import { terminateChance } from '../../../src/engine/leash/use';
import { requisitionCost } from '../../../src/engine/economy';
import { computeDeltas } from '../../../src/engine/relations/deltas';
import type { EventIntent } from '../../../src/engine/relations/intents';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/loyalty';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const withTraits = (s: CampaignState, ...regular: string[]): CampaignState => {
  s.commander.traits = { regular };
  return s;
};
const fresh = (...traits: string[]): CampaignState => {
  const s = withTraits(campaign(reg, 3), ...traits);
  s.resources.supplies = 20;
  s.resources.credits = 200;
  for (const u of s.squad) u.defects = [];
  return s;
};
const ANN = 'unit_ann';
const ev = (type: string): EventIntent => ({ type, actor: 'commander', targets: [ANN], severity: 'moderate', evidence: 'x', confidence: 1 }) as EventIntent;
const doAct = (s: CampaignState, payload: Record<string, unknown>, r: Registries = reg) => run(s, r, { type: 'activity/do', payload });
const patchActivity = (id: string, patch: Record<string, unknown>): Registries => ({
  ...reg, activities: new Map([...reg.activities, [id, { ...reg.activities.get(id)!, ...patch } as Entry]]),
});

describe('growth', () => {
  it('silver_tongue gains cunning 1.5× (rounded)', () => {
    const cunningStudy = patchActivity('study', {
      effects: [{ type: 'commander_stat', stat: 'cunning', amount: 5, when: { focus: 'insight' } }, { type: 'commander_stat', stat: 'empathy', amount: 5, when: { focus: 'empathy' } }],
    });
    const gain = (s: CampaignState) => ofType(doAct(s, { activityId: 'study', focus: 'insight' }, cunningStudy).events, 'social_gained')[0].gained;
    expect(gain(fresh())).toBe(5);
    expect(gain(fresh('silver_tongue'))).toBe(8); // 7.5 rounds up
    expect(gain(fresh('bookish'))).toBe(5); // another stat's multiplier
  });

  it('socialGrowthMult multiplies the matching traits only', () => {
    expect(socialGrowthMult(fresh('silver_tongue'), reg, 'cunning')).toBe(1.5);
    expect(socialGrowthMult(fresh('silver_tongue'), reg, 'insight')).toBe(1);
    expect(socialGrowthMult(fresh('bookish', 'silver_tongue'), reg, 'insight')).toBe(1.5);
    expect(socialGrowthMult(fresh(), reg, 'authority')).toBe(1);
  });

  it('bookish trains a body stat in ceil(30/7) sessions', () => {
    expect(bodyGrowthMult(fresh('bookish'), reg)).toBe(0.7);
    let s = fresh('bookish');
    s.commander.body = { strength: 1, endurance: 3, reflexes: 2 };
    s.commander.bodyXp = { strength: 0, endurance: 0, reflexes: 0 };
    const sessions: number[] = [];
    for (let i = 1; i <= 6; i++) {
      s.slot = 'morning';
      const r = doAct(s, { activityId: 'train', focus: 'body_strength' });
      s = r.state;
      if (ofType(r.events, 'body_trained')[0].raised) sessions.push(i);
    }
    expect(sessions[0]).toBe(Math.ceil(30 / 7)); // 5
  });
});

describe('activities', () => {
  it('field_medic medbay costs 1 supply more and gives the companion +3 affinity', () => {
    expect(activityCost(fresh(), reg, reg.activities.get('medbay')!)).toEqual({});
    expect(activityCost(fresh('field_medic'), reg, reg.activities.get('medbay')!)).toEqual({ supplies: 1 });
    expect(activityCost(fresh('field_medic'), reg, reg.activities.get('train')!)).toEqual({});
    const base = fresh();
    const med = fresh('field_medic');
    const a = doAct(base, { activityId: 'medbay', companionId: ANN });
    const b = doAct(med, { activityId: 'medbay', companionId: ANN });
    expect(errors(b.events)).toEqual([]);
    expect(b.state.resources.supplies).toBe(base.resources.supplies - 1);
    expect(a.state.resources.supplies).toBe(base.resources.supplies);
    expect(b.state.relations[ANN].affinity - a.state.relations[ANN].affinity).toBe(3);
    expect(b.state.relations[ANN].trust).toBe(a.state.relations[ANN].trust); // the activity's own effect is unchanged
  });

  it('the extra cost is checked: no supplies, no medbay', () => {
    const s = fresh('field_medic');
    s.resources.supplies = 0;
    expect(checkActivity(s, reg, { activityId: 'medbay', companionId: ANN })).toMatch(/supplies/);
    expect(errors(doAct(s, { activityId: 'medbay', companionId: ANN }).events)).toHaveLength(1);
    expect(checkActivity(fresh(), reg, { activityId: 'medbay', companionId: ANN })).toBeNull();
  });

  it('activity_relation only applies to its activity and only with a companion', () => {
    const s = fresh('field_medic');
    const r = doAct(s, { activityId: 'rest', companionId: ANN });
    const plain = doAct(fresh(), { activityId: 'rest', companionId: ANN });
    expect(r.state.relations[ANN].affinity).toBe(plain.state.relations[ANN].affinity);
  });
});

describe('Crisis HP', () => {
  it('old_wound has 10 HP less in Crisis', () => {
    expect(commanderMaxHp(fresh(), reg)).toBe(50);
    expect(commanderMaxHp(fresh('old_wound'), reg)).toBe(40);
  });
  it('never below the floor', () => {
    const harsh: Registries = { ...reg, commanderTraits: new Map([...reg.commanderTraits, ['harsh', { id: 'harsh', effects: [{ type: 'crisis_hp', amount: -30 }] } as Entry]]) };
    const s = fresh('harsh');
    s.commander.body = { strength: 3, endurance: 1, reflexes: 2 };
    expect(commanderMaxHp(s, harsh)).toBe(10);
  });
});

describe('relation deltas', () => {
  const trustGain = (s: CampaignState, day: number): number => {
    s.day = day;
    s.squad[0].defects = [];
    return computeDeltas(s, reg, ANN, ev('comforted')).trust;
  };

  it('old_wound raises a trust gain by 15% on day 3 and not on day 20', () => {
    const plain = trustGain(fresh(), 3);
    expect(trustGain(fresh('old_wound'), 3) / plain).toBeCloseTo(1.15, 6);
    expect(trustGain(fresh('old_wound'), 20)).toBeCloseTo(trustGain(fresh(), 20), 6);
  });

  it('the window is the first 14 days known, per unit', () => {
    expect(trustGain(fresh('old_wound'), 14) / trustGain(fresh(), 14)).toBeCloseTo(1.15, 6); // d = 13
    expect(trustGain(fresh('old_wound'), 15)).toBeCloseTo(trustGain(fresh(), 15), 6); // d = 14
  });

  it('pretty_face lowers it by 10%, and the two add', () => {
    const plain = trustGain(fresh(), 3);
    expect(trustGain(fresh('pretty_face'), 3) / plain).toBeCloseTo(0.9, 6);
    expect(trustGain(fresh('old_wound', 'pretty_face'), 3) / plain).toBeCloseTo(1.05, 6);
  });

  it('losses are not touched by early_trust_gain', () => {
    const loss = (s: CampaignState) => computeDeltas(s, reg, ANN, ev('insulted')).trust;
    expect(loss(fresh('old_wound'))).toBe(loss(fresh()));
    expect(loss(fresh())).toBeLessThan(0);
  });

  it('a detected lie costs 1.5× with a lies-triggered unit only', () => {
    const lie = (s: CampaignState, triggers: string[]) => {
      s.squad[0].triggers = triggers;
      return computeDeltas(s, reg, ANN, ev('lied_detected'));
    };
    const plain = lie(fresh(), ['lies']);
    const withTrait = lie(fresh('silver_tongue'), ['lies']);
    expect(withTrait.trust / plain.trust).toBeCloseTo(1.5, 6);
    expect(withTrait.affinity / plain.affinity).toBeCloseTo(1.5, 6);
    const other = lie(fresh('silver_tongue'), ['fire']);
    expect(other.trust).toBeCloseTo(lie(fresh(), ['fire']).trust, 6);
  });
});

describe('Leash, requisition, approval', () => {
  it('corporate_polish gives one more weekly authorization', () => {
    expect(leashWeekly(fresh('corporate_polish'), reg)).toBe(leashWeekly(fresh(), reg) + 1);
  });

  it('street_raised requisition is 15% cheaper, rounded up, at least 1 credit per supply', () => {
    expect(requisitionCost(fresh(), reg, 10)).toBe(30);
    expect(requisitionCost(fresh('street_raised'), reg, 10)).toBe(26); // 25.5 → 26
    expect(requisitionCost(fresh('street_raised'), reg, 1)).toBe(3); // 2.55 → 3
    const cheap: Registries = { ...reg, commanderTraits: new Map([['x', { id: 'x', effects: [{ type: 'requisition_price', pct: -90 }] } as Entry]]) };
    expect(requisitionCost(withTraits(fresh(), 'x'), cheap, 10)).toBe(10); // never below 1 per supply
    const s = fresh('street_raised');
    const r = run(s, reg, { type: 'base/requisition', payload: { supplies: 10 } });
    expect(r.state.resources.credits).toBe(s.resources.credits - 26);
    expect(ofType(r.events, 'requisitioned')).toEqual([{ type: 'requisitioned', supplies: 10, credits: 26 }]);
    expect(errors(run({ ...s, resources: { ...s.resources, credits: 25 } }, reg, { type: 'base/requisition', payload: { supplies: 10 } }).events)).toHaveLength(1);
  });

  it('street_raised termination approval is 0.1 lower', () => {
    expect(terminateChance(fresh(), reg) - terminateChance(fresh('street_raised'), reg)).toBeCloseTo(0.1, 6);
    expect(terminateChance(fresh('street_raised'), reg)).toBeGreaterThanOrEqual(0.1);
  });
});
