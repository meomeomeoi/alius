import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { ANN, BEA, harness, intentJson, reply, type Harness } from '../helpers/sceneHarness';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const withRules = (s: import('../../src/engine/state/types').CampaignState) => {
  s.bonds = { rules: [
    { id: 'r1', unitId: ANN, templateId: 'hands_off_gear', text: 'Nobody touches your gear but me.', status: 'active', day: 1, brokenCount: 0 },
    { id: 'r2', unitId: BEA, templateId: 'name_me_first', text: 'Name me first.', status: 'active', day: 1, brokenCount: 0 },
    { id: 'r3', unitId: ANN, templateId: 'report_evening', text: 'Report to me.', status: 'suspended', day: 1, brokenCount: 0 },
  ] };
};
const calls = (h: Harness) => h.st.calls.filter((c) => (c.system ?? '').includes('rules referee'));
const brokenEvent = { type: 'rule_broken', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'let Bea fix it', confidence: 0.9, ruleId: 'r1' };

describe('rules in the scene reading', () => {
  it('lists the active rules of the units present, never a suspended one or another unit\'s', async () => {
    const h = harness(reg, { tweak: withRules });
    await h.controller.start({ locationId: 'mess_hall', participants: [ANN], origin: 'event' });
    h.st.groupReplies = [[reply('Ann', 'Hm.')]];
    h.st.mainReplies = [intentJson()];
    await h.controller.send('Hello');
    const text = calls(h)[0].system! + calls(h)[0].prompt;
    expect(text).toContain('r1 (active) — unit_ann: Nobody touches your gear but me.');
    expect(text).not.toContain('r2');
    expect(text).not.toContain('r3');
  });

  it('a rule_broken in the reading counts against the rule', async () => {
    const h = harness(reg, { tweak: withRules });
    await h.controller.start({ locationId: 'mess_hall', participants: [ANN], origin: 'event' });
    h.st.groupReplies = [[reply('Ann', 'You let her touch it?')]];
    h.st.mainReplies = [intentJson([brokenEvent])];
    const trust = h.state().relations[ANN].trust;
    await h.controller.send('Bea fixed my rifle.');
    expect(h.state().bonds!.rules[0].brokenCount).toBe(1);
    expect(h.state().relations[ANN].trust).toBeLessThan(trust);
  });

  it('a rule event for a rule that is not listed does nothing', async () => {
    const h = harness(reg);
    await h.controller.start({ locationId: 'mess_hall', participants: [ANN], origin: 'event' });
    h.st.groupReplies = [[reply('Ann', 'Hm.')]];
    h.st.mainReplies = [intentJson([brokenEvent])];
    const trust = h.state().relations[ANN].trust;
    await h.controller.send('Hello');
    expect(h.state().relations[ANN].trust).toBe(trust);
    expect((calls(h)[0].system! + calls(h)[0].prompt)).not.toContain('rule_broken');
  });

  it('a DM reading lists her rules too', async () => {
    const h = harness(reg, { tweak: withRules });
    h.st.mainReplies = ['Where were you?', intentJson()];
    await h.comms.send(ANN, 'Busy day.');
    const text = calls(h)[0].system! + calls(h)[0].prompt;
    expect(text).toContain('r1 (active) — unit_ann');
    expect(text).not.toContain('r2');
  });
});
