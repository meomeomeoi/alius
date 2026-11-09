import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { Rng, seedRng } from '../../src/engine/rng';
import { unitStats } from '../../src/engine/combat/stats';
import { bankLoot, canEquip, equippedBy, itemStats, newItem, rarityIndex, rollLoot } from '../../src/engine/items';
import type { CampaignState, ItemInstance } from '../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../helpers/world';

let reg: Registries;
let state: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
});
const fresh = () => {
  state = campaign(reg, 4);
  return state;
};
const rng = (seed = 7) => new Rng(seedRng(seed));
const inst = (uid: string, itemId: string, over: Partial<ItemInstance> = {}): ItemInstance => ({ uid, itemId, rarity: 'standard', upgrade: 0, affixes: [], ...over });

describe('newItem', () => {
  it('is deterministic per rng state and increments uids', () => {
    const a = fresh();
    const x = newItem(a, reg, rng(3), 'item_blade', 'prototype');
    const y = newItem(a, reg, rng(3), 'item_blade', 'prototype');
    expect(x.uid).toBe('it_1');
    expect(y.uid).toBe('it_2');
    expect({ ...x, uid: '' }).toEqual({ ...y, uid: '' });
    expect(a.itemSeq).toBe(2);
  });

  it('standard has no affix, refined one, prototype two, corporate three; anomalous three plus one drawback', () => {
    const s = fresh();
    const r = rng();
    const n = (id: string, rarity: ItemInstance['rarity']) => newItem(s, reg, r, id, rarity).affixes;
    expect(n('item_blade', 'standard')).toHaveLength(0);
    expect(n('item_blade', 'refined')).toHaveLength(1);
    expect(n('item_blade', 'prototype')).toHaveLength(2);
    expect(n('item_blade', 'corporate')).toHaveLength(3);
    const an = n('bloom_fang', 'anomalous');
    expect(an).toHaveLength(4);
    expect(an.filter((id) => reg.affixes.get(id)!.drawback === true)).toHaveLength(1);
  });

  it('affixes respect slots and never repeat', () => {
    const s = fresh();
    const r = rng(9);
    for (let i = 0; i < 100; i++) {
      for (const [id, slot] of [['upper_heavy', 'upper'], ['item_rifle', 'weapon'], ['lower_light', 'lower']] as const) {
        const affixes = newItem(s, reg, r, id, 'corporate').affixes;
        expect(new Set(affixes).size).toBe(affixes.length);
        for (const a of affixes) {
          const slots = reg.affixes.get(a)!.slots as string[] | undefined;
          expect(!slots || slots.includes(slot), `${a} on ${slot}`).toBe(true);
          expect(reg.affixes.get(a)!.drawback).not.toBe(true);
        }
      }
    }
  });

  it('a rarity below the template minimum throws, an unknown template throws', () => {
    const s = fresh();
    expect(() => newItem(s, reg, rng(), 'bloom_fang', 'standard')).toThrow(/minimum rarity/);
    expect(() => newItem(s, reg, rng(), 'nope', 'standard')).toThrow(/Unknown item/);
  });
});

describe('item stats', () => {
  it('scale with rarity and upgrade', () => {
    expect(rarityIndex('standard')).toBe(1);
    expect(rarityIndex('anomalous')).toBe(5);
    expect(itemStats(reg, inst('a', 'item_blade'))!.stats).toEqual({ atk: 8, crit: 4 });
    expect(itemStats(reg, inst('a', 'item_blade', { rarity: 'refined' }))!.stats).toEqual({ atk: 9, crit: 5 });
    expect(itemStats(reg, inst('a', 'item_blade', { upgrade: 5 }))!.stats.atk).toBe(11);
    expect(itemStats(reg, inst('a', 'item_blade', { rarity: 'refined', upgrade: 2 }))!.stats.atk).toBe(Math.round(8 * 1.15 * 1.16));
    expect(itemStats(reg, inst('a', 'nope'))).toBeNull();
  });

  it('effects are the template effects plus the affix effects; percentages stay separate', () => {
    const it = itemStats(reg, inst('a', 'bloom_fang', { rarity: 'anomalous', affixes: ['honed', 'bloom_leak'] }))!;
    expect(it.effects.map((e) => e.type)).toEqual(['status', 'stress']);
    expect(it.statPct).toEqual({ atk: 8 });
  });
});

describe('equipment rules', () => {
  it('a sniper cannot equip a Shotgun (NOT CERTIFIED)', () => {
    const s = fresh();
    s.squad[0].roleId = 'sniper';
    expect(canEquip(reg, s.squad[0], inst('a', 'item_shotgun'))).toBe('NOT CERTIFIED: Shotgun');
    expect(canEquip(reg, s.squad[0], inst('a', 'item_precision_rifle'))).toBeNull();
    expect(canEquip(reg, s.squad[0], inst('a', 'upper_heavy'))).toBe('NOT CERTIFIED: heavy');
    expect(canEquip(reg, s.squad[0], inst('a', 'ghost'))).toBe('UNKNOWN ITEM');
  });

  it('equip moves an item from one unit to another', () => {
    const s = fresh();
    s.inventory.push(inst('it_1', 'item_blade'));
    const a = run(s, reg, { type: 'item/equip', payload: { unitId: 'unit_ann', uid: 'it_1' } });
    expect(ofType(a.events, 'item_equipped')).toHaveLength(1);
    expect(equippedBy(a.state, 'it_1')!.id).toBe('unit_ann');
    const b = run(a.state, reg, { type: 'item/equip', payload: { unitId: 'unit_bea', uid: 'it_1' } });
    expect(b.state.squad.find((u) => u.id === 'unit_ann')!.equipment.weapon).toBeUndefined();
    expect(b.state.squad.find((u) => u.id === 'unit_bea')!.equipment.weapon).toBe('it_1');
  });

  it('equip replaces the previous item of the slot', () => {
    const s = fresh();
    s.inventory.push(inst('it_1', 'item_blade'), inst('it_2', 'item_smg'));
    const a = run(s, reg, { type: 'item/equip', payload: { unitId: 'unit_ann', uid: 'it_1' } });
    const b = run(a.state, reg, { type: 'item/equip', payload: { unitId: 'unit_ann', uid: 'it_2' } });
    expect(b.state.squad[0].equipment).toEqual({ weapon: 'it_2' });
    expect(b.state.inventory).toHaveLength(2);
    const c = run(b.state, reg, { type: 'item/unequip', payload: { unitId: 'unit_ann', slot: 'weapon' } });
    expect(c.state.squad[0].equipment).toEqual({});
  });

  it('unitStats includes equipment and ignores an item made illegal by a role resync', () => {
    const s = fresh();
    s.inventory.push(inst('it_1', 'item_blade'), inst('it_2', 'item_blade', { affixes: ['honed'] }));
    const u = s.squad[0];
    u.equipment = { weapon: 'it_1' };
    expect(unitStats(s, reg, u)).toMatchObject({ atk: 32, crit: 14 });
    u.equipment = { weapon: 'it_2' };
    expect(unitStats(s, reg, u).atk).toBe(Math.round(32 * 1.08));
    u.roleId = 'sniper';
    u.baseStats = { hp: 85, atk: 30, def: 8, spd: 12, crit: 20 };
    expect(unitStats(s, reg, u)).toEqual({ hp: 85, atk: 30, def: 8, spd: 12, crit: 20 });
  });

  it('equip of a dead unit, a bad class or an unknown uid is rejected and changes nothing', () => {
    const s = fresh();
    s.inventory.push(inst('it_1', 'item_blade'), inst('it_2', 'item_precision_rifle'));
    s.squad[1].status = 'dead';
    for (const payload of [
      { unitId: 'unit_bea', uid: 'it_1' }, { unitId: 'unit_ann', uid: 'nope' }, { unitId: 'ghost', uid: 'it_1' },
      { unitId: 'unit_ann', uid: 'it_2' },
    ]) {
      const r = run(s, reg, { type: 'item/equip', payload });
      expect(errors(r.events), JSON.stringify(payload)).toHaveLength(1);
      expect(r.state).toBe(s);
    }
    expect(errors(run(s, reg, { type: 'item/unequip', payload: { unitId: 'unit_ann', slot: 'weapon' } }).events)).toHaveLength(1);
  });
});

describe('loot', () => {
  it('rollLoot respects weights over 2000 rolls (±3 %)', () => {
    const s = fresh();
    const r = rng(21);
    const counts: Record<string, number> = { credits: 0, plyx: 0, item: 0 };
    let total = 0;
    for (let i = 0; i < 1000; i++) {
      for (const d of rollLoot(s, reg, r, 'loot_standard')) {
        counts[d.kind] += 1;
        total += 1;
      }
    }
    expect(total).toBe(2000);
    expect(Math.abs(counts.credits / total - 0.4)).toBeLessThan(0.03);
    expect(Math.abs(counts.plyx / total - 0.35)).toBeLessThan(0.03);
    expect(Math.abs(counts.item / total - 0.25)).toBeLessThan(0.03);
  });

  it('items drop at a rarity from the entry weights, never below the template; extra rolls add drops', () => {
    const s = fresh();
    const r = rng(5);
    const rarities = new Set<string>();
    for (let i = 0; i < 400; i++) {
      for (const d of rollLoot(s, reg, r, 'loot_elite')) if (d.kind === 'item') rarities.add(d.item.rarity);
    }
    expect([...rarities].sort()).toEqual(['anomalous', 'corporate', 'prototype', 'refined']);
    expect(rollLoot(s, reg, rng(1), 'loot_standard', { extraRolls: 3 })).toHaveLength(5);
    expect(() => rollLoot(s, reg, rng(), 'nope')).toThrow(/Unknown loot table/);
  });

  it('rollLoot never banks; bankLoot adds items and resources once', () => {
    const s = fresh();
    const before = JSON.stringify({ inv: s.inventory, res: s.resources });
    const creditsBefore = s.resources.credits;
    const drops = rollLoot(s, reg, rng(2), 'loot_cache', { extraRolls: 6 });
    expect(JSON.stringify({ inv: s.inventory, res: s.resources })).toBe(before);
    const events = bankLoot(s, drops);
    expect(ofType(events, 'loot_banked')).toHaveLength(1);
    const credits = drops.filter((d) => d.kind === 'credits').reduce((n, d) => n + (d as { amount: number }).amount, 0);
    expect(s.resources.credits).toBe(creditsBefore + credits);
    expect(s.inventory).toHaveLength(drops.filter((d) => d.kind === 'item').length);
    expect(bankLoot(s, [])).toEqual([]);
  });
});
