import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import { bondsDayStep } from '../../../src/engine/bonds';
import { Rng } from '../../../src/engine/rng';
import { FEED_CAUSE, holdFeed } from '../../../src/engine/dynamic/feed';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import { TUNING } from '../../../src/engine/tuning';
import { applyEventToUnit, registerEventLanded, resetEventLanded } from '../../../src/engine/relations/effects';
import type { EventIntent } from '../../../src/engine/relations/intents';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;

/** Ann holds (play frame, hold 50, so a gain or loss is plain); Bea has no dynamic. */
function world(): CampaignState {
  const s = campaign(reg, 3);
  unitOf(s, ANN).bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: { categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'cold' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate' },
  };
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 1, pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame: 'play', hold: 50, lastPracticeDay: -9 };
  return s;
}
const event = (type: string, over: Partial<EventIntent> = {}): EventIntent =>
  ({ type, actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'x', confidence: 1, ...over } as EventIntent);
const holdOf = (s: CampaignState): number => dynamicOf(s, ANN)!.hold;

describe('the hold feed', () => {
  it('followed_lead lands +1 on a holder, and counts as practice', () => {
    const s = world();
    applyEventToUnit(s, reg, ANN, event('followed_lead'));
    expect(holdOf(s)).toBe(51);
    expect(dynamicOf(s, ANN)!.lastPracticeDay).toBe(s.day);
  });

  it('rule_accepted +2, rule_broken -5, commander_enforced on her -10, refused_demand -4, overrode_her -6', () => {
    for (const [type, delta] of [['rule_accepted', 2], ['rule_broken', -5], ['commander_enforced', -10], ['refused_demand', -4], ['overrode_her', -6]] as const) {
      const s = world();
      applyEventToUnit(s, reg, ANN, event(type));
      expect(holdOf(s), type).toBe(50 + delta);
    }
  });

  it('a granted demand counts only for a desire template (an item template gives 0)', () => {
    const desire = world();
    applyEventToUnit(desire, reg, ANN, event('granted_demand', { templateId: 'want_tonight' }));
    expect(holdOf(desire)).toBe(50 + TUNING.dynamic.gains.desire_granted);
    const item = world();
    applyEventToUnit(item, reg, ANN, event('granted_demand', { templateId: 'claim_weapon' }));
    expect(holdOf(item)).toBe(50);
    const bare = world();
    applyEventToUnit(bare, reg, ANN, event('granted_demand'));
    expect(holdOf(bare)).toBe(50);
  });

  it("P16's task_kept, if it ever lands, gives +3 (the rows are ready)", () => {
    for (const [type, delta] of [['task_kept', 3], ['punishment_accepted', 4], ['staging_held', 5], ['task_broken', -5]] as const) {
      const s = world();
      applyEventToUnit(s, reg, ANN, event(type));
      expect(holdOf(s), type).toBe(50 + delta);
    }
    const pleased = world();
    applyEventToUnit(pleased, reg, ANN, event('service_rated', { kind: 'pleased' }));
    expect(holdOf(pleased)).toBe(52);
    const flat = world();
    applyEventToUnit(flat, reg, ANN, event('service_rated', { kind: 'adequate' }));
    expect(holdOf(flat)).toBe(50);
    expect(Object.keys(FEED_CAUSE)).toEqual(expect.arrayContaining(['followed_lead', 'task_kept', 'punishment_accepted', 'service_rated', 'staging_held', 'task_broken']));
  });

  it('an event on a unit without a dynamic, or with the dynamic off, changes nothing and returns []', () => {
    const s = world();
    expect(holdFeed(s, reg, BEA, event('followed_lead', { targets: [BEA] }), 'minor')).toEqual([]);
    expect(dynamicOf(s, BEA)).toBeUndefined();
    const off = world();
    off.content = { enabled: [] };
    const before = structuredClone(off.relations[ANN].dynamic);
    expect(holdFeed(off, reg, ANN, event('followed_lead'), 'minor')).toEqual([]);
    expect(off.relations[ANN].dynamic).toEqual(before);
    const none = world();
    delete none.dynamic;
    expect(holdFeed(none, reg, ANN, event('rule_broken'), 'minor')).toEqual([]);
    expect(holdOf(none)).toBe(50);
  });

  it('only the commander\'s own events count, and a bystander\'s appraisal never does', () => {
    const own = world();
    applyEventToUnit(own, reg, ANN, event('followed_lead', { actor: ANN }));
    expect(holdOf(own)).toBe(50);
    const witness = world();
    applyEventToUnit(witness, reg, ANN, event('commander_enforced', { targets: [BEA] }), { witnessOf: BEA, scale: 0.5 });
    expect(holdOf(witness)).toBe(50);
  });

  it('the feed returns the hold events, which applyEventToUnit passes on', () => {
    const s = world();
    const events = applyEventToUnit(s, reg, ANN, event('followed_lead'));
    expect(events.filter((e) => e.type === 'hold_changed')).toEqual([{ type: 'hold_changed', unitId: ANN, from: 50, to: 51, cause: 'followed_lead' }]);
  });

  it('applyEventToUnit draws nothing new: the rng is untouched and everything outside the dynamic is as without the hook', () => {
    const withHook = world();
    const rngBefore = structuredClone(withHook.rng);
    const a = applyEventToUnit(withHook, reg, ANN, event('rule_broken'));
    expect(withHook.rng).toEqual(rngBefore);
    const bare = world();
    resetEventLanded();
    const b = applyEventToUnit(bare, reg, ANN, event('rule_broken'));
    registerEventLanded(holdFeed);
    expect(a.filter((e) => e.type !== 'hold_changed')).toEqual(b);
    delete withHook.relations[ANN].dynamic;
    delete bare.relations[ANN].dynamic;
    expect(withHook).toEqual(bare);
  });
});

describe('a rule broken by the engine\'s own check', () => {
  const withRule = (): CampaignState => {
    const s = world();
    s.day = 10;
    s.relations[ANN].dynamic!.lastPracticeDay = -9;
    s.bonds = { rules: [{ id: 'r1', unitId: ANN, templateId: 'report_evening', text: 'AUTHOR TO WRITE', status: 'active', day: 9, brokenCount: 0 }] };
    return s;
  };
  const day = (s: CampaignState) => bondsDayStep(s, { registries: reg, rng: new Rng(s.rng) });

  it('an engine-detected broken rule costs the same hold as a reported one', () => {
    const checked = withRule();
    const events = day(checked); // nothing reached her today: daily_contact is broken by the check
    expect(events.filter((e) => e.type === 'rule_broken_by_check')).toHaveLength(1);
    expect(holdOf(checked)).toBe(50 + TUNING.dynamic.gains.rule_broken);
    expect(events.filter((e) => e.type === 'hold_changed')).toEqual([{ type: 'hold_changed', unitId: ANN, from: 50, to: 45, cause: 'rule_broken' }]);
    const reported = withRule();
    applyEventToUnit(reported, reg, ANN, event('rule_broken', { ruleId: 'r1' }));
    expect(holdOf(reported)).toBe(holdOf(checked));
  });

  it('a break counted once is not counted again when the report of it lands the same day', () => {
    const s = withRule();
    day(s);
    expect(holdOf(s)).toBe(45);
    applyEventToUnit(s, reg, ANN, event('rule_broken', { ruleId: 'r1' }));
    expect(holdOf(s)).toBe(45);
    s.day = 11; // another day, another break
    applyEventToUnit(s, reg, ANN, event('rule_broken', { ruleId: 'r1' }));
    expect(holdOf(s)).toBe(40);
  });

  it('the check feeds nothing while the dynamic is off, and draws nothing', () => {
    const off = withRule();
    off.content = { enabled: [] };
    const rng = structuredClone(off.rng);
    day(off);
    expect(holdOf(off)).toBe(50);
    expect(off.rng).toEqual(rng);
  });
});

afterAll(() => { resetEventLanded(); registerEventLanded(holdFeed); });
