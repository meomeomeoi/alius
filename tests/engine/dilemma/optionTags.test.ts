import { describe, expect, it } from 'vitest';
import { emptyRegistries } from '../../../src/content/types';
import { dilemmaOptions } from '../../../src/engine/dilemma/flow';
import { createCampaign } from '../../../src/engine/state/create';
import type { CampaignState } from '../../../src/engine/state/types';

const stateWith = (options: unknown[]): CampaignState => {
  const s = createCampaign({ seed: 1, commanderName: 'Vale' });
  s.dilemmas = {
    seq: 1,
    open: { id: 'd1', templateId: 't', scale: 'minor', context: 'base', day: 1, status: 'presented', attempts: 0, units: [], beatId: 'b', title: 'T', setup: 'S', options },
  } as CampaignState['dilemmas'];
  return s;
};

describe('dilemmaOptions tags', () => {
  it('dilemmaOptions returns check and requires', () => {
    const s = stateWith([
      { label: 'Push', check: { stat: 'authority', rank: 3 }, effects: [{ type: 'party_stress', amount: 4 }], magnitudes: [] },
      { label: 'Talk', requires: { stat: 'empathy', rank: 5 }, effects: [{ type: 'party_stress', amount: 1 }], magnitudes: [] },
      { label: 'Wait', effects: [{ type: 'party_stress', amount: 2 }], magnitudes: [] },
    ]);
    const opts = dilemmaOptions(s, emptyRegistries());
    expect(opts[0]).toMatchObject({ index: 0, label: 'Push', hasCheck: true, check: { stat: 'authority', rank: 3 } });
    expect(opts[0].requires).toBeUndefined();
    expect(opts[1]).toMatchObject({ label: 'Talk', hasCheck: false, requires: { stat: 'empathy', rank: 5 } });
    expect(opts[1].disabled).not.toBeNull();
    expect(opts[2].check).toBeUndefined();
    expect(opts[2].requires).toBeUndefined();
    // the tags never carry effects
    expect(JSON.stringify(opts)).not.toContain('party_stress');
  });
});
