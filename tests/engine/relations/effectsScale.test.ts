import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { applyEventToUnit } from '../../../src/engine/relations/effects';
import type { EventIntent } from '../../../src/engine/relations/intents';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, loadCore, setRelation, withDefect } from '../../helpers/loyalty';

let reg: Registries;
let base: CampaignState;
let id: string;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 2);
  id = base.squad[0].id;
  setRelation(base, id, { trust: 50, affinity: 20, stateId: 'comrade' });
  withDefect(base, id, 'echo_bleed');
  base.squad[0].stress = 40;
});

const coerced = (): EventIntent => ({
  type: 'coerced', actor: 'commander', targets: [id], severity: 'moderate', evidence: 'x', confidence: 1,
});
const apply = (opts?: { scale?: number }) => {
  const d = structuredClone(base);
  applyEventToUnit(d, reg, id, coerced(), opts);
  return { trust: d.relations[id].trust - 50, affinity: d.relations[id].affinity - 20, stress: d.squad[0].stress - 40 };
};

describe('applyEventToUnit scale', () => {
  it('no opts is unchanged', () => {
    expect(apply()).toEqual({ trust: -4, affinity: -5, stress: 6 });
    expect(apply({})).toEqual({ trust: -4, affinity: -5, stress: 6 });
  });

  it('scale 2 doubles the axes and the stress', () => {
    expect(apply({ scale: 2 })).toEqual({ trust: -8, affinity: -10, stress: 12 });
  });

  it('scale −0.5 flips the axes and drops the stress', () => {
    expect(apply({ scale: -0.5 })).toEqual({ trust: 2, affinity: 3, stress: 0 });
  });
});
