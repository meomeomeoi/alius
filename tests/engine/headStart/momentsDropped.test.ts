import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { applyMoment } from '../../../src/engine/headStart/moments';
import { campaign, loadCore } from '../../helpers/world';

// A moment runs at confidence 1, which every floor lets through, so the "dropped" result of the delta pipeline is only reachable by
// stubbing it: the point is what `applyMoment` does with it.
vi.mock('../../../src/engine/relations/deltas', async (original) => ({
  ...(await original<typeof import('../../../src/engine/relations/deltas')>()),
  computeDeltas: () => ({ trust: 5, affinity: 5, attraction: 5, stress: 0, severity: 'minor', dropped: true }),
}));

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

describe('applyMoment with a dropped result', () => {
  it('writes no axis change and no history line', () => {
    const s = campaign(reg, 2);
    const before = structuredClone(s.relations.unit_ann);
    applyMoment(s, reg, 'unit_ann', reg.headStartMoments.get('shared_meal')!);
    expect(s.relations.unit_ann).toEqual(before);
  });
});
