import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { unitStats, unitStatSteps } from '../../../src/engine/combat/stats';
import { STATS } from '../../../src/engine/combat/types';
import type { CampaignState, Unit } from '../../../src/engine/state/types';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

/** Ann (assault): level 4, a refined upgraded blade with two affixes, medium armor on top, light below, two injuries. */
function geared(): { state: CampaignState; unit: Unit } {
  const state = campaign(reg, 4);
  const unit = state.squad[0];
  unit.level = 4;
  unit.injuries = ['wound_a', 'wound_b'];
  state.inventory.push(
    { uid: 'it_1', itemId: 'item_blade', rarity: 'refined', upgrade: 1, affixes: ['honed', 'light_frame'] },
    { uid: 'it_2', itemId: 'upper_medium', rarity: 'standard', upgrade: 0, affixes: [] },
    { uid: 'it_3', itemId: 'lower_light', rarity: 'standard', upgrade: 0, affixes: ['reinforced'] },
  );
  Object.assign(unit.equipment, { weapon: 'it_1', upper: 'it_2', lower: 'it_3' });
  return { state, unit };
}

describe('unitStatSteps', () => {
  it('the last step equals unitStats for every stat of a geared, injured, levelled unit', () => {
    const { state, unit } = geared();
    const stats = unitStats(state, reg, unit);
    for (const k of STATS) {
      const steps = unitStatSteps(state, reg, unit, k);
      expect(steps.length, k).toBeGreaterThan(0);
      expect(steps[steps.length - 1].total, k).toBe(stats[k]);
    }
  });

  it('every unit of the squad agrees too, plain or geared', () => {
    const { state } = geared();
    for (const u of state.squad) {
      const stats = unitStats(state, reg, u);
      for (const k of STATS) expect(unitStatSteps(state, reg, u, k).at(-1)!.total, `${u.id} ${k}`).toBe(stats[k]);
    }
  });

  it('names the sources in the order of unitStats', () => {
    const { state, unit } = geared();
    const atk = unitStatSteps(state, reg, unit, 'atk');
    expect(atk.map((s) => s.source)).toEqual(['role', 'level', 'gear', 'gear', 'injury']);
    expect(atk[0]).toEqual({ source: 'role', label: 'Role base', total: 24 });
    expect(atk[1]).toMatchObject({ source: 'level', label: 'Level 4', total: 28 });
    expect(atk[2].label).toBe('[[items:item_blade]]');
    expect(atk[3].label).toBe('Gear bonuses');
    expect(atk[4].label).toBe('Injuries ×2');
    const spd = unitStatSteps(state, reg, unit, 'spd');
    expect(spd.map((s) => s.source)).toContain('armor');
  });

  it('steps that change nothing are left out', () => {
    const state = campaign(reg, 4);
    const unit = state.squad[0];
    expect(unit.level).toBe(1);
    expect(unitStatSteps(state, reg, unit, 'atk')).toEqual([{ source: 'role', label: 'Role base', total: 24 }]);
    // hp gets no gear from a blade; crit does
    const { state: g, unit: gu } = geared();
    const totals = unitStatSteps(g, reg, gu, 'atk').map((s) => s.total);
    expect(new Set(totals).size).toBe(totals.length);
    expect(unitStatSteps(g, reg, gu, 'crit').some((s) => s.source === 'armor')).toBe(false);
  });

  it('a stat pushed under its floor ends on the floor', () => {
    const { state, unit } = geared();
    unit.baseStats.spd = 1;
    unit.injuries = [];
    state.inventory.push({ uid: 'it_9', itemId: 'upper_medium', rarity: 'standard', upgrade: 0, affixes: [] });
    Object.assign(unit.equipment, { upper: 'it_9' });
    const steps = unitStatSteps(state, reg, unit, 'spd');
    expect(steps.at(-1)!.total).toBe(unitStats(state, reg, unit).spd);
  });
});
