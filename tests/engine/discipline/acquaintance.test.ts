import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { acquaintanceDays, inAcquaintance } from '../../../src/engine/discipline';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const A = 'unit_ann';
const withChoice = (choice: string | undefined): CampaignState => {
  const s = campaign(reg, 4);
  if (choice === undefined) delete s.world.options;
  else s.world.options = { ...(s.world.options ?? {}), acquaintance: choice };
  return s;
};

describe('acquaintanceDays', () => {
  it('reads the world option: 0 to 14, and 7 for a world that never chose', () => {
    expect(acquaintanceDays(withChoice('d0'), reg)).toBe(0);
    expect(acquaintanceDays(withChoice('d3'), reg)).toBe(3);
    expect(acquaintanceDays(withChoice('d14'), reg)).toBe(14);
    expect(acquaintanceDays(withChoice(undefined), reg)).toBe(7); // an older save reads the option's default
    expect(acquaintanceDays(withChoice('d99'), reg)).toBe(7); // a choice the pack no longer has too
  });

  it('a pack without the option has no acquaintance period', () => {
    const none: Registries = { ...reg, worldOptions: new Map([...reg.worldOptions].filter(([id]) => id !== 'acquaintance')) };
    expect(acquaintanceDays(withChoice('d14'), none)).toBe(0);
  });
});

describe('inAcquaintance', () => {
  it('is true for the first N days after she met the commander and false from day N on', () => {
    const s = withChoice('d7');
    s.relations[A].metDay = 10;
    const at = (day: number) => { s.day = day; return inAcquaintance(s, reg, A); };
    expect([10, 11, 16].map(at)).toEqual([true, true, true]); // known for 0, 1, 6 days
    expect([17, 18, 40].map(at)).toEqual([false, false, false]); // known for 7 or more
  });

  it('0 days: never', () => {
    const s = withChoice('d0');
    s.day = 1;
    expect(inAcquaintance(s, reg, A)).toBe(false);
  });

  it('is per unit, and a grunt or an unknown id has none', () => {
    const s = withChoice('d14');
    s.day = 10;
    s.relations.unit_ann.metDay = 9;
    s.relations.unit_bea.metDay = 1;
    expect([inAcquaintance(s, reg, 'unit_ann'), inAcquaintance(s, reg, 'unit_bea')]).toEqual([true, true]);
    s.relations.unit_bea.metDay = -20;
    expect(inAcquaintance(s, reg, 'unit_bea')).toBe(false);
    s.squad.push({ ...structuredClone(s.squad[0]), id: 'grunt_1', kind: 'grunt' });
    s.relations.grunt_1 = { ...structuredClone(s.relations.unit_ann), metDay: 10 };
    expect(inAcquaintance(s, reg, 'grunt_1')).toBe(false);
    expect(inAcquaintance(s, reg, 'nobody')).toBe(false);
  });
});
