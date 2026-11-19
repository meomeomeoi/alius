import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/development';
import '../../../src/engine/actions/scene';
import { matchRules } from '../../../src/engine/development/rules';
import { developmentOf, ensureDevelopment } from '../../../src/engine/development/state';
import { validateReview } from '../../../src/engine/development/review';
import type { Appraisal, CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ANN = 'unit_ann';
const world = (): CampaignState => { const s = campaign(reg, 4); s.settings.characterDevelopment = 'normal'; return s; };
const unit = (s: CampaignState) => s.squad.find((u) => u.id === ANN)!;
const kind: Appraisal = {
  id: 'ap0', day: 1, kind: 'comforted', target: 'her', role: 'subject', wanted: 'yes', initiator: 'actor', harm: 'none', outcome: 'good', severity: 'moderate', subject: ANN, pushes: [], summary: '',
};

describe('development/hold', () => {
  it('holds and releases an axis, with no empty list left behind', () => {
    let s = world();
    s = run(s, reg, { type: 'development/hold', payload: { unitId: ANN, axis: 'value:mercy', on: true } }).state;
    expect(developmentOf(unit(s)).held).toEqual(['value:mercy']);
    s = run(s, reg, { type: 'development/hold', payload: { unitId: ANN, axis: 'value:mercy', on: true } }).state;
    expect(developmentOf(unit(s)).held).toEqual(['value:mercy']);
    s = run(s, reg, { type: 'development/hold', payload: { unitId: ANN, axis: 'value:mercy', on: false } }).state;
    expect(unit(s).development!.held).toBeUndefined();
  });

  it('a held axis then takes no push and no shift, and keeps what it has', () => {
    const s = world();
    ensureDevelopment(unit(s)).drift.mercy = 1;
    ensureDevelopment(unit(s)).acc = { 'value:mercy': 3.5 };
    const open = matchRules(s, reg, unit(s), kind, []).map((p) => p.axis);
    expect(open).toContain('value:mercy');
    const held = run(s, reg, { type: 'development/hold', payload: { unitId: ANN, axis: 'value:mercy', on: true } }).state;
    expect(matchRules(held, reg, unit(held), kind, []).map((p) => p.axis)).not.toContain('value:mercy');
    expect(validateReview(held, reg, ANN, { shifts: [{ axis: 'value:mercy', direction: 'up', size: 'step', reason: 'x' }], facts: [] }).shifts).toEqual([]);
    expect(developmentOf(unit(held)).drift.mercy).toBe(1);
  });

  it('refuses a grunt, an unknown unit, a bad axis and a missing flag', () => {
    const s = world();
    s.squad.push({ ...structuredClone(unit(s)), id: 'grunt_k_117', kind: 'grunt' } as never);
    for (const payload of [{ unitId: 'grunt_k_117', axis: 'value:mercy', on: true }, { unitId: 'nobody', axis: 'value:mercy', on: true }, { unitId: ANN, axis: 'mercy', on: true }, { unitId: ANN, axis: 'value:mercy' }]) {
      const r = run(s, reg, { type: 'development/hold', payload });
      expect(errors(r.events)).toHaveLength(1);
      expect(r.state).toEqual(s);
    }
  });
});

describe('development/remove_fact', () => {
  it('removes one line and refuses an unknown one', () => {
    const s = world();
    ensureDevelopment(unit(s)).facts = [{ id: 'df0', text: 'a', kind: 'memory', day: 1, source: 'review' }, { id: 'df1', text: 'b', kind: 'memory', day: 1, source: 'review' }];
    const r = run(s, reg, { type: 'development/remove_fact', payload: { unitId: ANN, factId: 'df0' } });
    expect(developmentOf(unit(r.state)).facts.map((f) => f.id)).toEqual(['df1']);
    expect(errors(run(s, reg, { type: 'development/remove_fact', payload: { unitId: ANN, factId: 'nope' } }).events)).toHaveLength(1);
  });
});
