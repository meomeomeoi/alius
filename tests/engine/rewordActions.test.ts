import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/bonds';
import '../../src/engine/actions/discipline';
import { Rng, seedRng } from '../../src/engine/rng';
import { rollRules } from '../../src/engine/bonds';
import type { CampaignState } from '../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run, setRelation } from '../helpers/loyalty';
import { withBond } from '../helpers/bonds';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const ANN = 'unit_ann';

function withDemand(status: 'undelivered' | 'open'): CampaignState {
  const s = campaign(reg, 4);
  const tpl = [...reg.demandTemplates.keys()][0];
  s.discipline = { demands: [{ id: 'dm1', unitId: ANN, templateId: tpl, text: 'Template text.', status, expiresDay: s.day + 3 } as never], records: {} } as never;
  return s;
}
function withRule(delivered: boolean): CampaignState {
  const s = campaign(reg, 4);
  s.day = 10;
  for (const u of s.squad) u.defects = [];
  setRelation(s, ANN, { stateId: 'lover' });
  withBond(s, ANN, { leadStyle: 'dominant' });
  for (let seed = 1; seed < 400; seed++) {
    const d = structuredClone(s);
    rollRules(d, { registries: reg, rng: new Rng(seedRng(seed)) });
    if ((d.bonds?.rules ?? []).length > 0) {
      if (delivered) d.bonds!.rules[0].delivered = true;
      return d;
    }
  }
  throw new Error('no rule');
}

describe('demand/reword', () => {
  it('rewords a demand that waits for an answer, cleaned like the first wording', () => {
    const s = withDemand('open');
    const r = run(s, reg, { type: 'demand/reword', payload: { demandId: 'dm1', text: '  Double   rations.\u0007 ' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.discipline!.demands[0].text).toBe('Double rations.');
    expect(ofType(r.events, 'demand_reworded')).toHaveLength(1);
    expect(r.state.rng).toEqual(s.rng);
  });

  it('refuses an undelivered or unknown demand and an empty text', () => {
    expect(errors(run(withDemand('undelivered'), reg, { type: 'demand/reword', payload: { demandId: 'dm1', text: 'x' } }).events)).toHaveLength(1);
    expect(errors(run(withDemand('open'), reg, { type: 'demand/reword', payload: { demandId: 'nope', text: 'x' } }).events)).toHaveLength(1);
    expect(errors(run(withDemand('open'), reg, { type: 'demand/reword', payload: { demandId: 'dm1', text: '   ' } }).events)).toHaveLength(1);
  });
});

describe('bonds/reword_rule', () => {
  it('rewords a delivered proposal and the message that carried it', () => {
    const s = withRule(true);
    const id = s.bonds!.rules[0].id;
    const r = run(s, reg, { type: 'bonds/reword_rule', payload: { ruleId: id, text: ' Tell me   first. ' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.bonds!.rules[0].text).toBe('Tell me first.');
    expect(ofType(r.events, 'rule_reworded')).toHaveLength(1);
    expect(r.state.rng).toEqual(s.rng);
  });

  it('refuses a proposal that is not delivered or an empty text', () => {
    const s = withRule(false);
    const id = s.bonds!.rules[0].id;
    expect(errors(run(s, reg, { type: 'bonds/reword_rule', payload: { ruleId: id, text: 'x' } }).events)).toHaveLength(1);
    const d = withRule(true);
    expect(errors(run(d, reg, { type: 'bonds/reword_rule', payload: { ruleId: d.bonds!.rules[0].id, text: ' ' } }).events)).toHaveLength(1);
  });
});
