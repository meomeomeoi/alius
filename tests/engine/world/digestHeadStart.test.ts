import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { buildDigest } from '../../../src/engine/world/director';
import { buildCampaign } from '../../../src/engine/setup';
import { loadCore, unitSetup } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const build = (days: number) => {
  const out = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'liquidation', units: ['Ann', 'Bea'].map((n) => unitSetup(n)),
    ...(days > 0 ? { headStart: { days: days as 30, newArrivals: [] } } : {}),
  }, reg, { desireBondDefects: false, seed: 7 });
  if (!out.ok) throw new Error(out.errors.join('; '));
  return out.state;
};

describe('the director digest and the head start', () => {
  it('says how long the squad has known the commander', () => {
    expect(buildDigest(build(30), reg).knownDays).toBe(30);
  });

  it('has no key without a head start', () => {
    expect('knownDays' in buildDigest(build(0), reg)).toBe(false);
  });
});
