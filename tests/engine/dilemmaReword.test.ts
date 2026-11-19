import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/dilemma';
import type { CampaignState } from '../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../helpers/loyalty';

let reg: Registries;
let shown: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  const asked = run(campaign(reg, 4), reg, { type: 'dilemma/request', payload: { templateId: 'dil_rations', context: 'base' } });
  shown = run(asked.state, reg, { type: 'dilemma/fallback', payload: { requestId: 'dl1' } }).state; // the authored block is on the card
});
const eff = (kind: string, target: string, direction: 1 | -1, magnitude = 'small') => ({ kind, target, direction, magnitude });
const good = {
  title: 'Short rations', setup: 'The mess hall is short again.',
  options: [
    { label: 'Cut portions', effects: [eff('resource', 'supplies', 1), eff('stress', 'squad', 1)] },
    { label: 'Buy on the black market', effects: [eff('resource', 'supplies', 1), eff('resource', 'credits', -1), eff('faction', 'sable', 1)] },
  ],
};
const bad = { title: 'T', setup: 'S', options: [{ label: 'a', effects: [eff('resource', 'gold', 1)] }, { label: 'b', effects: [eff('resource', 'credits', 1)] }] };

describe('dilemma/reword', () => {
  it('replaces the wording of a dilemma on the card and marks it as the model', () => {
    expect(shown.dilemmas!.open!.source).toBe('fallback');
    const r = run(shown, reg, { type: 'dilemma/reword', payload: { id: 'dl1', output: good } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.dilemmas!.open).toMatchObject({ status: 'presented', source: 'model', title: 'Short rations', setup: 'The mess hall is short again.' });
    expect(r.state.dilemmas!.open!.options).toHaveLength(2);
    expect(ofType(r.events, 'dilemma_reworded')).toHaveLength(1);
    expect(r.state.dilemmas!.open!.attempts).toBe(shown.dilemmas!.open!.attempts); // not a new attempt
  });

  it('a rejection changes nothing and says so without a retry', () => {
    const r = run(shown, reg, { type: 'dilemma/reword', payload: { id: 'dl1', output: bad } });
    expect(r.state).toEqual(shown);
    expect(ofType(r.events, 'dilemma_rejected')).toMatchObject([{ retry: false }]);
  });

  it('needs the dilemma on the card: a stale id or a request still waiting is refused', () => {
    expect(errors(run(shown, reg, { type: 'dilemma/reword', payload: { id: 'dl9', output: good } }).events)).toHaveLength(1);
    const asked = run(campaign(reg, 4), reg, { type: 'dilemma/request', payload: { templateId: 'dil_rations', context: 'base' } }).state;
    expect(errors(run(asked, reg, { type: 'dilemma/reword', payload: { id: 'dl1', output: good } }).events)).toHaveLength(1);
  });

  it('draws nothing from the rng', () => {
    expect(run(shown, reg, { type: 'dilemma/reword', payload: { id: 'dl1', output: good } }).state.rng).toEqual(shown.rng);
  });
});
