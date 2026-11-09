import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { skillById } from '../../src/engine/combat/targeting';
import { unitStats } from '../../src/engine/combat/stats';
import type { CombatState } from '../../src/engine/combat/types';
import {
  applyLevelUps, checkUnlock, combatXp, levelCap, loadoutSize, nodeState, respecCost, skillWithUpgrades, xpToNext,
} from '../../src/engine/progression';
import type { CampaignState } from '../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../helpers/world';
import { fixtureCombat } from '../helpers/combat';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});
const fresh = () => structuredClone(base);
const ann = (s: CampaignState) => s.squad[0];
const act = (s: CampaignState, type: string, payload: unknown) => run(s, reg, { type, payload });

describe('levels', () => {
  it('xp thresholds 60/80/100…', () => {
    expect([1, 2, 3, 9].map(xpToNext)).toEqual([60, 80, 100, 220]);
  });

  it('one level per threshold, a skill point each, HP rises by the growth gained', () => {
    const s = fresh();
    ann(s).xp = 60 + 80 + 10;
    const hp = ann(s).currentHp;
    const events = applyLevelUps(s, reg, ann(s));
    expect(ofType(events, 'level_up').map((e) => e.level)).toEqual([2, 3]);
    expect([ann(s).level, ann(s).xp, ann(s).skillPoints]).toEqual([3, 10, 2]);
    expect(ann(s).currentHp).toBe(hp + 12); // assault growth 6 hp per level
    expect(unitStats(s, reg, ann(s)).hp).toBe(122);
  });

  it('level stops at the cap and keeps the xp; raising clearanceTier releases the stored levels', () => {
    const s = fresh();
    expect(levelCap(s)).toBe(10);
    ann(s).level = 10;
    ann(s).xp = 5000;
    expect(applyLevelUps(s, reg, ann(s))).toEqual([]);
    expect(ann(s)).toMatchObject({ level: 10, xp: 5000 });
    s.world.clearanceTier = 1;
    expect(levelCap(s)).toBe(20);
    const events = applyLevelUps(s, reg, ann(s));
    expect(events.length).toBeGreaterThan(3);
    expect(ann(s).level).toBeGreaterThan(10);
    s.world.clearanceTier = 9;
    expect(levelCap(s)).toBe(40);
  });

  it('train activity xp levels the unit through the hook', () => {
    const s = fresh();
    ann(s).xp = 50;
    const r = act(s, 'activity/do', { activityId: 'train', focus: 'units', unitIds: ['unit_ann'] });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.squad[0].level).toBe(2);
    expect(r.state.squad[0].xp).toBe(5);
    expect(ofType(r.events, 'level_up')).toHaveLength(1);
  });
});

describe('skill tree', () => {
  const unlock = (s: CampaignState, nodeId: string) => act(s, 'squad/unlock_node', { unitId: 'unit_ann', nodeId });

  it('unlock needs points and prerequisites', () => {
    const s = fresh();
    expect(checkUnlock(s, reg, 'unit_ann', 'as_b1_t1')).toMatch(/NEEDS 2 SKILL POINTS/);
    expect(errors(unlock(s, 'as_b1_t1').events)).toHaveLength(1);
    ann(s).skillPoints = 5;
    expect(checkUnlock(s, reg, 'unit_ann', 'as_b1_t2')).toMatch(/previous node/);
    const r = unlock(s, 'as_b1_t1');
    expect(ofType(r.events, 'node_unlocked')).toHaveLength(1);
    expect(r.state.squad[0]).toMatchObject({ skillPoints: 3, unlockedNodes: ['as_b1_t1'] });
    expect(checkUnlock(r.state, reg, 'unit_ann', 'as_b1_t1')).toBe('Already unlocked.');
    expect(checkUnlock(r.state, reg, 'unit_ann', 'nope')).toMatch(/Unknown node/);
    expect(checkUnlock(r.state, reg, 'ghost', 'as_b1_t1')).toMatch(/Unknown or unavailable/);
    expect(nodeState(r.state, reg, r.state.squad[0], 'as_b1_t1')).toBe('owned');
    expect(nodeState(r.state, reg, r.state.squad[0], 'as_b1_t2')).toBe('available');
    expect(nodeState(r.state, reg, r.state.squad[0], 'as_b1_t3')).toBe('locked');
  });

  it('the ultimate needs two tier-3 nodes', () => {
    const s = fresh();
    ann(s).skillPoints = 100;
    ann(s).unlockedNodes = ['as_b1_t1', 'as_b1_t2', 'as_b1_t3'];
    expect(checkUnlock(s, reg, 'unit_ann', 'as_ult')).toMatch(/two tier-3/);
    expect(nodeState(s, reg, ann(s), 'as_ult')).toBe('locked');
    ann(s).unlockedNodes.push('as_b2_t1', 'as_b2_t2', 'as_b2_t3');
    expect(checkUnlock(s, reg, 'unit_ann', 'as_ult')).toBeNull();
    expect(nodeState(s, reg, ann(s), 'as_ult')).toBe('available');
  });

  it('a whole tree costs 66 points', () => {
    const s = fresh();
    ann(s).skillPoints = 66;
    for (const n of (reg.roles.get('assault')!.tree as Array<{ id: string }>)) {
      const r = unlock(s, n.id);
      if (!errors(r.events).length) Object.assign(s, r.state);
    }
    expect(ann(s).unlockedNodes).toHaveLength(16);
    expect(ann(s).skillPoints).toBe(0);
  });

  it('respec refunds exactly and costs credits and plyx', () => {
    const s = fresh();
    ann(s).level = 4;
    ann(s).skillPoints = 0;
    ann(s).unlockedNodes = ['as_b1_t1', 'as_b1_t2'];
    ann(s).loadout = ['as_burst'];
    s.resources.credits = 100;
    s.resources.plyx = 50;
    expect(respecCost(ann(s))).toEqual({ credits: 40, plyx: 20 });
    const r = act(s, 'squad/respec', { unitId: 'unit_ann' });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.squad[0]).toMatchObject({ skillPoints: 5, unlockedNodes: [] });
    expect(r.state.squad[0].loadout).toBeUndefined();
    expect(r.state.resources).toMatchObject({ credits: 60, plyx: 30 });
  });

  it('respec without funds or without nodes changes nothing', () => {
    const s = fresh();
    ann(s).unlockedNodes = ['as_b1_t1'];
    s.resources.credits = 5;
    s.resources.plyx = 0;
    const poor = act(s, 'squad/respec', { unitId: 'unit_ann' });
    expect(errors(poor.events)).toHaveLength(1);
    expect(poor.state).toBe(s);
    const empty = act(fresh(), 'squad/respec', { unitId: 'unit_bea' });
    expect(errors(empty.events)).toHaveLength(1);
  });

  it('upgrade node lowers cooldown and raises the multiplier', () => {
    const s = fresh();
    ann(s).unlockedNodes = ['as_b1_t1', 'as_b1_t2', 'as_b1_t3'];
    const base1 = skillById(reg, 'as_breach_charge')!;
    const up = skillWithUpgrades(reg, ann(s), 'as_breach_charge');
    expect(up.cooldown).toBe((base1.cooldown ?? 0) - 1);
    const mult = (sk: typeof up) => (sk.effects.find((e) => e.type === 'damage') as { mult: number }).mult;
    expect(mult(up)).toBeCloseTo(mult(base1) * 1.2);
    expect(skillWithUpgrades(reg, base.squad[1], 'as_breach_charge')).toEqual(base1);
    expect(() => skillWithUpgrades(reg, ann(s), 'nope')).toThrow(/Unknown skill/);
    // the registry skill itself is untouched
    expect(skillById(reg, 'as_breach_charge')!.cooldown).toBe(base1.cooldown);
  });
});

describe('loadout', () => {
  const set = (s: CampaignState, skillIds: unknown) => act(s, 'squad/set_loadout', { unitId: 'unit_ann', skillIds });

  it('accepts known active skills and an empty list restores the starters', () => {
    const s = fresh();
    ann(s).unlockedNodes = ['as_b1_t1', 'as_b1_t2'];
    const r = set(s, ['as_breach_charge', 'as_strike']);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.squad[0].loadout).toEqual(['as_breach_charge', 'as_strike']);
    expect(set(r.state, []).state.squad[0].loadout).toBeUndefined();
  });

  it('rejects unknown, duplicate, passive, locked and too many skills', () => {
    const s = fresh();
    ann(s).unlockedNodes = ['as_b1_t1', 'as_b1_t2', 'as_b2_t1', 'as_b3_t1'];
    for (const ids of [['ghost'], ['as_strike', 'as_strike'], ['as_armor_piercer'], ['as_rampage'], ['as_strike', 'as_burst', 'as_breach_charge', 'as_finisher', 'as_blood_rush']]) {
      const r = set(s, ids);
      expect(errors(r.events), ids.join()).toHaveLength(1);
      expect(r.state).toBe(s);
    }
    expect(errors(set(s, 'nope').events)).toHaveLength(1);
    expect(errors(set(s, ['as_strike', 'as_burst', 'as_breach_charge', 'as_finisher']).events)).toEqual([]);
  });

  it('firmware_rollback allows a fifth slot', () => {
    const s = fresh();
    ann(s).unlockedNodes = ['as_b1_t1', 'as_b2_t1', 'as_b3_t1'];
    ann(s).defects = [{ id: 'firmware_rollback', origin: '' }];
    expect(loadoutSize(reg, ann(s))).toBe(5);
    expect(errors(set(s, ['as_strike', 'as_burst', 'as_breach_charge', 'as_finisher', 'as_blood_rush']).events)).toEqual([]);
    expect(loadoutSize(reg, base.squad[1])).toBe(4);
  });
});

describe('combat xp and breakdown release', () => {
  const won = (levels: number[], enemyLevels: number[], kinds: Array<'named' | 'grunt'> = []) => {
    const s = fresh();
    s.squad.forEach((u, i) => { u.level = levels[i] ?? 1; if (kinds[i]) u.kind = kinds[i]; });
    const cs: CombatState = fixtureCombat({ squad: levels.map((l, i) => ({ level: l, unitId: s.squad[i].id })), enemies: [] });
    cs.encounter.enemies = enemyLevels.map((level) => ({ enemyId: 'husk', level, affixes: [] }));
    return combatXp(s, reg, cs);
  };

  it('gives base plus 3 per enemy level', () => {
    expect(won([3, 3], [2, 4])).toEqual({ unit_ann: 38, unit_bea: 38 });
  });

  it('gives the low-level bonus and halves grunts', () => {
    const xp = won([8, 8, 4], [2]);
    expect(xp.unit_ann).toBe(26);
    expect(xp.unit_cat).toBe(39); // 4 < 6.67 − 2: ×1.5
    expect(won([5], [2], ['grunt']).unit_ann).toBe(13);
  });

  it('release_breakdowns clears and emits', () => {
    const s = fresh();
    s.squad[0].breakdown = { defectId: 'rage_governor', day: 1 };
    s.squad[1].breakdown = { defectId: 'affect_dampener', day: 1 };
    const one = act(s, 'squad/release_breakdowns', { unitIds: ['unit_ann'] });
    expect(ofType(one.events, 'breakdown_released')).toEqual([{ type: 'breakdown_released', unitId: 'unit_ann' }]);
    expect(one.state.squad[0].breakdown).toBeUndefined();
    expect(one.state.squad[1].breakdown).toBeDefined();
    const all = act(s, 'squad/release_breakdowns', {});
    expect(ofType(all.events, 'breakdown_released')).toHaveLength(2);
    expect(errors(act(s, 'squad/release_breakdowns', { unitIds: 'x' }).events)).toHaveLength(1);
  });
});
