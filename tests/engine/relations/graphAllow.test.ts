import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { evaluateAutomatic } from '../../../src/engine/relations/graph';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const ANN = 'unit_ann';

/** A registry where `trusted` is a romantic-tier state; Ann is a comrade who meets it. */
function setup() {
  const s = campaign(reg, 2);
  s.day = 30;
  Object.assign(s.relations[ANN], { trust: 50, affinity: 0, stateId: 'comrade', stateSince: 10 });
  const romantic = { ...reg, relationshipStates: new Map(reg.relationshipStates) };
  romantic.relationshipStates.set('trusted', { ...reg.relationshipStates.get('trusted')!, bondTier: 'romantic' });
  return { s, romantic };
}

describe('evaluateAutomatic: the allow option', () => {
  it('without allow it behaves as before', () => {
    const { s, romantic } = setup();
    evaluateAutomatic(s, romantic, ANN);
    expect(s.relations[ANN].stateId).toBe('trusted');
  });

  it('allow filters the automatic candidates', () => {
    const { s, romantic } = setup();
    evaluateAutomatic(s, romantic, ANN, { allow: (st) => st.bondTier !== 'romantic' });
    expect(s.relations[ANN].stateId).toBe('comrade');
  });

  it('allow filters the exit-rule targets too', () => {
    const s = campaign(reg, 2);
    s.day = 30;
    Object.assign(s.relations[ANN], { trust: 22, stateId: 'stranger', stateSince: 1 });
    evaluateAutomatic(s, reg, ANN, { allow: (st) => st.id !== 'comrade' });
    expect(s.relations[ANN].stateId).toBe('stranger');
    evaluateAutomatic(s, reg, ANN);
    expect(s.relations[ANN].stateId).toBe('comrade');
  });
});
