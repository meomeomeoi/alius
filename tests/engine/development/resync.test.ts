import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/development';
import { RESYNC_SECTIONS } from '../../../src/engine/actions/squad';
import { ensureDevelopment } from '../../../src/engine/development/state';
import { campaign, errors, loadCore, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ANN = 'unit_ann';
const developed = () => {
  const s = campaign(reg, 2);
  const dev = ensureDevelopment(s.squad[0]);
  dev.drift.mercy = 1.5;
  dev.acc['value:mercy'] = 2;
  dev.anchors = ['value:ingroup'];
  dev.facts.push({ id: 'df0', text: 'She kept the dog tags.', kind: 'memory', day: 2, source: 'review' });
  return s;
};

describe('squad/resync keeps development (P14b)', () => {
  it('the development section is re-syncable', () => {
    expect(RESYNC_SECTIONS).toContain('development');
  });

  it('a re-sync of values keeps drift, accumulators and facts while the values change', () => {
    const s = developed();
    const before = structuredClone(s.squad[0].development);
    const values = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: -1, corporate: 0, sacrifice: 0 };
    const r = run(s, reg, { type: 'squad/resync', payload: { unitId: ANN, patch: { values } } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.squad[0].values).toEqual(values);
    expect(r.state.squad[0].development).toEqual(before);
  });

  it('a re-sync of development replaces anchors and insight, never drift', () => {
    const s = developed();
    const r = run(s, reg, { type: 'squad/resync', payload: { unitId: ANN, patch: { anchors: ['value:mercy', 'like:tea'], insight: 'high' } } });
    expect(errors(r.events)).toEqual([]);
    expect(r.events).toContainEqual({ type: 'unit_resynced', unitId: ANN, sections: ['development'] });
    expect(r.state.squad[0].development).toMatchObject({ anchors: ['value:mercy', 'like:tea'], drift: { mercy: 1.5 }, acc: { 'value:mercy': 2 } });
    expect(r.state.squad[0].development!.facts).toHaveLength(1);
    expect(r.state.squad[0].insight).toBe('high');
    // a mid insight is no field, and no anchors write no block on a unit that had none
    const plain = run(campaign(reg, 2), reg, { type: 'squad/resync', payload: { unitId: ANN, patch: { anchors: [], insight: 'mid' } } });
    expect(plain.state.squad[0].development).toBeUndefined();
    expect('insight' in plain.state.squad[0]).toBe(false);
  });

  it('a bad anchor is refused and changes nothing', () => {
    const s = developed();
    const r = run(s, reg, { type: 'squad/resync', payload: { unitId: ANN, patch: { anchors: ['value:greed'] } } });
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state).toEqual(s);
  });

  it('reset development deletes it', () => {
    const s = developed();
    const r = run(s, reg, { type: 'squad/resync', payload: { unitId: ANN, patch: { values: s.squad[0].values }, resetDevelopment: true } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.squad[0].development).toBeUndefined();
    // a reset with new anchors starts over from them
    const again = run(s, reg, { type: 'squad/resync', payload: { unitId: ANN, patch: { anchors: ['value:mercy'] }, resetDevelopment: true } });
    expect(again.state.squad[0].development).toMatchObject({ anchors: ['value:mercy'], drift: {}, facts: [] });
  });

  it('a patch with nothing to re-sync is still refused', () => {
    const r = run(developed(), reg, { type: 'squad/resync', payload: { unitId: ANN, patch: {}, resetDevelopment: true } });
    expect(errors(r.events)).toHaveLength(1);
  });
});
