import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { defaultFormation, encounterPower, enemyStats, squadPower, statPower, unitStats } from '../../../src/engine/combat/stats';
import type { CampaignState, ItemInstance, Unit } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
let state: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
});
const fresh = () => {
  state = campaign(reg, 4);
  return state.squad[0]; // Ann: assault, 110/24/12/14/10
};
const item = (uid: string, itemId: string): ItemInstance => ({ uid, itemId, rarity: 'standard', upgrade: 0, affixes: [] });

describe('unitStats', () => {
  it('level 1 stats equal the role base', () => {
    const u = fresh();
    expect(unitStats(state, reg, u)).toEqual({ hp: 110, atk: 24, def: 12, spd: 14, crit: 10 });
  });

  it('level 5 adds four levels of growth, floored', () => {
    const u = fresh();
    u.level = 5;
    // growth 6 / 1.4 / 0.6 / 0.2 / 0.2 → +24 / +5.6 / +2.4 / +0.8 / +0.8
    expect(unitStats(state, reg, u)).toEqual({ hp: 134, atk: 29, def: 14, spd: 14, crit: 10 });
  });

  it('two injuries cost 20 %, a fifth injury counts as three', () => {
    const u = fresh();
    u.injuries = ['wounded', 'wounded'];
    expect(unitStats(state, reg, u).hp).toBe(88);
    expect(unitStats(state, reg, u).atk).toBe(Math.round(24 * 0.8));
    u.injuries = ['a', 'b', 'c', 'd', 'e'];
    expect(unitStats(state, reg, u).hp).toBe(77);
  });

  it('stats never drop below 1 (crit below 0)', () => {
    const u = fresh();
    u.baseStats = { hp: 1, atk: 1, def: 1, spd: 1, crit: 0 };
    u.injuries = ['a', 'b', 'c'];
    expect(unitStats(state, reg, u)).toEqual({ hp: 1, atk: 1, def: 1, spd: 1, crit: 0 });
  });

  it('a heavy and a light piece cost the heavy SPD only', () => {
    const u = fresh();
    state.inventory.push(item('it_1', 'upper_heavy'), item('it_2', 'lower_light'));
    u.equipment = { upper: 'it_1', lower: 'it_2' };
    expect(unitStats(state, reg, u).spd).toBe(14 + TUNING.combat.armorSpd.heavy);
    u.equipment = { lower: 'it_2' };
    expect(unitStats(state, reg, u).spd).toBe(14);
    state.inventory.push(item('it_3', 'lower_medium'));
    u.equipment = { upper: 'it_2', lower: 'it_3' };
    expect(unitStats(state, reg, u).spd).toBe(13);
  });

  it('unknown role gives a clear error, unknown item is ignored', () => {
    const u = fresh();
    u.equipment = { weapon: 'it_missing' };
    expect(unitStats(state, reg, u).atk).toBe(24);
    u.roleId = 'ghost_role';
    expect(() => unitStats(state, reg, u)).toThrow(/Unknown role "ghost_role".*unit_ann/);
  });
});

describe('power', () => {
  it('statPower weighs HP, ATK, DEF, SPD and crit', () => {
    expect(statPower({ hp: 100, atk: 10, def: 10, spd: 10, crit: 0 })).toBeCloseTo(20 + 20 + 10 + 15);
    expect(statPower({ hp: 100, atk: 10, def: 10, spd: 10, crit: 20 })).toBeCloseTo(65 * 1.1);
  });

  it('power grows with level', () => {
    const u = fresh();
    const p1 = squadPower(state, reg, [u.id]);
    u.level = 6;
    expect(squadPower(state, reg, [u.id])).toBeGreaterThan(p1);
  });

  it('enemy stats follow base + growth × (level − 1), difficulty (hp, atk, def only) and affix percentages', () => {
    expect(enemyStats(reg, 'husk', 1, [], 'normal')).toEqual({ hp: 55, atk: 11, def: 4, spd: 8, crit: 0 });
    const l5 = enemyStats(reg, 'husk', 5, [], 'normal');
    expect(l5).toEqual({ hp: Math.round(55 + 4 * 4), atk: Math.round(11 + 0.7 * 4), def: Math.round(4 + 0.2 * 4), spd: Math.round(8 + 0.05 * 4), crit: 0 });
    expect(enemyStats(reg, 'husk', 1, [], 'hard').hp).toBe(Math.round(55 * 1.2));
    expect(enemyStats(reg, 'husk', 1, [], 'story').spd).toBe(8);
    expect(enemyStats(reg, 'husk', 1, ['armored'], 'normal').def).toBe(Math.round(4 * 1.4));
    const elite = enemyStats(reg, 'husk', 1, ['elite'], 'normal');
    expect(elite.hp).toBe(Math.round(55 * 1.4));
    expect(elite.atk).toBe(Math.round(11 * 1.4));
    expect(() => enemyStats(reg, 'nobody', 1, [], 'normal')).toThrow(/Unknown enemy "nobody"/);
  });

  it('encounterPower sums stat power times the enemy power weight', () => {
    const one = encounterPower(reg, { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1 }, 'normal');
    expect(one).toBeCloseTo(statPower(enemyStats(reg, 'husk', 1, [], 'normal')) * 1);
    const two = encounterPower(reg, { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }, { enemyId: 'brute', level: 1, affixes: [] }], danger: 1 }, 'normal');
    expect(two).toBeCloseTo(one + statPower(enemyStats(reg, 'brute', 1, [], 'normal')) * 1.2);
    expect(encounterPower(reg, { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1 }, 'hard')).toBeGreaterThan(one);
  });
});

describe('defaultFormation', () => {
  const unit = (id: string, roleId: string): Unit => ({ ...(state.squad[0] as Unit), id, roleId });
  const build = (roles: string[]) => {
    state = campaign(reg, 4);
    state.squad = roles.map((r, i) => unit(`u${i}`, r));
    return defaultFormation(state, reg, state.squad.map((u) => u.id));
  };

  it('puts defenders front, snipers back and never four in a row', () => {
    const f = build(['assault', 'defender', 'sniper', 'medic']);
    expect(f.front).toEqual(['u0', 'u1']);
    expect(f.back).toEqual(['u2', 'u3']);
    const crowded = build(['assault', 'assault', 'defender', 'defender']);
    expect(crowded.front).toHaveLength(3);
    expect(crowded.back).toHaveLength(1);
    const backs = build(['sniper', 'sniper', 'medic', 'support']);
    expect(backs.back).toHaveLength(3);
    expect(backs.front).toHaveLength(1);
  });

  it('either-row units fill the smaller row', () => {
    const f = build(['assault', 'defender', 'specialist']);
    expect(f.front).toEqual(['u0', 'u1']);
    expect(f.back).toEqual(['u2']);
    const g = build(['sniper', 'specialist']);
    expect(g.back).toContain('u0');
    expect(g.front).toEqual(['u1']);
  });
});
