import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { checkWorkshop, upgradeCost } from '../../src/engine/items';
import { seedRng } from '../../src/engine/rng';
import type { CampaignState, ItemInstance } from '../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../helpers/world';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});

const inst = (uid: string, itemId: string, over: Partial<ItemInstance> = {}): ItemInstance => ({ uid, itemId, rarity: 'standard', upgrade: 0, affixes: [], ...over });
/** A world with an open workshop session and plenty of money. */
const shop = (over: (s: CampaignState) => void = () => {}) => {
  const s = structuredClone(base);
  s.workshopSession = { day: s.day, opsLeft: 3 };
  s.resources.credits = 5000;
  s.resources.plyx = 5000;
  over(s);
  return s;
};
const act = (s: CampaignState, type: string, payload?: unknown) => run(s, reg, { type, payload });
const rejected = (s: CampaignState, type: string, payload?: unknown) => {
  const r = act(s, type, payload);
  expect(errors(r.events), `${type} ${JSON.stringify(payload)}`).toHaveLength(1);
  expect(r.state).toBe(s);
  return errors(r.events)[0].message as string;
};

describe('sessions', () => {
  it('the workshop activity opens a session with 3 ops', () => {
    const r = act(structuredClone(base), 'activity/do', { activityId: 'workshop' });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.workshopSession).toEqual({ day: 1, opsLeft: 3 });
    expect(ofType(r.events, 'workshop_opened')).toEqual([{ type: 'workshop_opened', day: 1, opsLeft: 3 }]);
    expect(checkWorkshop(r.state)).toBeNull();
  });

  it('ops run out and a session from yesterday is closed', () => {
    let s = shop();
    for (let i = 0; i < 3; i++) s = act(s, 'item/craft', { recipeId: 'recipe_item_blade_standard' }).state;
    expect(s.workshopSession!.opsLeft).toBe(0);
    expect(rejected(s, 'item/craft', { recipeId: 'recipe_item_blade_standard' })).toBe('NO WORKSHOP SESSION');
    const old = shop((x) => { x.day += 1; });
    expect(checkWorkshop(old)).toBe('NO WORKSHOP SESSION');
    expect(rejected(old, 'item/craft', { recipeId: 'recipe_item_blade_standard' })).toBe('NO WORKSHOP SESSION');
    expect(checkWorkshop(structuredClone(base))).toBe('NO WORKSHOP SESSION');
  });
});

describe('craft', () => {
  it('pays and adds an item', () => {
    const s = shop();
    const r = act(s, 'item/craft', { recipeId: 'recipe_item_blade_standard' });
    const recipe = reg.recipes.get('recipe_item_blade_standard')!.cost as { credits: number; plyx: number };
    expect(r.state.resources.credits).toBe(5000 - recipe.credits);
    expect(r.state.resources.plyx).toBe(5000 - recipe.plyx);
    expect(r.state.inventory).toEqual([{ uid: 'it_1', itemId: 'item_blade', rarity: 'standard', upgrade: 0, affixes: [] }]);
    expect(r.state.workshopSession!.opsLeft).toBe(2);
    expect(ofType(r.events, 'item_crafted')).toEqual([{ type: 'item_crafted', uid: 'it_1', itemId: 'item_blade', rarity: 'standard' }]);
  });

  it('respects the rarity cap (prototype needs workshop 3)', () => {
    const s = shop();
    expect(rejected(s, 'item/craft', { recipeId: 'recipe_item_blade_refined' })).toBe('WORKSHOP LEVEL TOO LOW');
    const two = shop((x) => { x.base.facilities.workshop = 2; });
    const refined = act(two, 'item/craft', { recipeId: 'recipe_item_blade_refined' });
    expect(refined.state.inventory[0]).toMatchObject({ rarity: 'refined' });
    expect(refined.state.inventory[0].affixes).toHaveLength(1);
    expect(rejected(two, 'item/craft', { recipeId: 'recipe_item_blade_prototype' })).toBe('WORKSHOP LEVEL TOO LOW');
    const three = shop((x) => { x.base.facilities.workshop = 3; });
    expect(act(three, 'item/craft', { recipeId: 'recipe_item_blade_prototype' }).state.inventory[0].affixes).toHaveLength(2);
  });

  it('rejections change nothing: unknown recipe, no money', () => {
    const s = shop();
    rejected(s, 'item/craft', { recipeId: 'nope' });
    rejected(s, 'item/craft', {});
    const poor = shop((x) => { x.resources.credits = 1; });
    expect(rejected(poor, 'item/craft', { recipeId: 'recipe_item_blade_standard' })).toMatch(/Not enough resources/);
  });
});

describe('upgrade', () => {
  it('cost scales and the discount applies at workshop 3', () => {
    const s = shop((x) => { x.inventory.push(inst('it_1', 'item_blade')); });
    const r1 = act(s, 'item/upgrade', { uid: 'it_1' });
    expect([5000 - r1.state.resources.credits, 5000 - r1.state.resources.plyx]).toEqual([20, 10]);
    expect(r1.state.inventory[0].upgrade).toBe(1);
    const r2 = act(r1.state, 'item/upgrade', { uid: 'it_1' });
    expect([r1.state.resources.credits - r2.state.resources.credits, r1.state.resources.plyx - r2.state.resources.plyx]).toEqual([40, 20]);
    const three = shop((x) => { x.base.facilities.workshop = 3; x.inventory.push(inst('it_1', 'item_blade', { upgrade: 1 })); });
    expect(upgradeCost(three, reg, three.inventory[0])).toEqual({ credits: 36, plyx: 18 }); // 10 % off 40 / 20
    const r3 = act(three, 'item/upgrade', { uid: 'it_1' });
    expect(5000 - r3.state.resources.credits).toBe(36);
  });

  it('stops at +5 and rejects unknown items', () => {
    const s = shop((x) => { x.inventory.push(inst('it_1', 'item_blade', { upgrade: 5 })); });
    expect(rejected(s, 'item/upgrade', { uid: 'it_1' })).toBe('MAX UPGRADE');
    rejected(s, 'item/upgrade', { uid: 'ghost' });
  });
});

describe('reroll', () => {
  it('never picks a duplicate or touches a drawback, and costs plyx by rarity', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s = shop((x) => {
        x.rng = seedRng(seed);
        x.inventory.push(inst('it_1', 'bloom_fang', { rarity: 'anomalous', affixes: ['honed', 'keen', 'serrated', 'bloom_leak'] }));
      });
      const r = act(s, 'item/reroll', { uid: 'it_1', affixIndex: 1 });
      expect(errors(r.events)).toEqual([]);
      const a = r.state.inventory[0].affixes;
      expect(new Set(a).size).toBe(4);
      expect(a[3]).toBe('bloom_leak');
      expect(a[1]).not.toBe('keen');
      expect(reg.affixes.get(a[1])!.drawback).not.toBe(true);
      expect(5000 - r.state.resources.plyx).toBe(75); // 15 × rarity 5
      expect(r.state.resources.credits).toBe(5000);
    }
  });

  it('refuses a drawback, a bad index and an item with nothing left to roll', () => {
    const s = shop((x) => { x.inventory.push(inst('it_1', 'bloom_fang', { rarity: 'anomalous', affixes: ['honed', 'bloom_leak'] })); });
    expect(rejected(s, 'item/reroll', { uid: 'it_1', affixIndex: 1 })).toMatch(/drawback/);
    rejected(s, 'item/reroll', { uid: 'it_1', affixIndex: 5 });
    rejected(s, 'item/reroll', { uid: 'it_1' });
    const full = shop((x) => {
      x.inventory.push(inst('it_1', 'item_blade', { rarity: 'corporate', affixes: ['honed', 'keen', 'serrated'] }));
    });
    const r = act(full, 'item/reroll', { uid: 'it_1', affixIndex: 0 });
    expect(errors(r.events)).toEqual([]); // calming and capacitor are still available
  });
});

describe('dismantle', () => {
  it('refuses an equipped item and pays plyx by value and rarity', () => {
    const s = shop((x) => {
      x.inventory.push(inst('it_1', 'item_blade'), inst('it_2', 'item_blade', { rarity: 'prototype' }));
      x.squad[0].equipment = { weapon: 'it_1' };
    });
    expect(rejected(s, 'item/dismantle', { uid: 'it_1' })).toMatch(/Unequip/);
    const r = act(s, 'item/dismantle', { uid: 'it_2' });
    expect(r.state.inventory.map((i) => i.uid)).toEqual(['it_1']);
    expect(r.state.resources.plyx).toBe(5000 + Math.round((30 * 1.3 * 50) / 100));
    expect(r.state.workshopSession!.opsLeft).toBe(2);
    expect(ofType(r.events, 'item_dismantled')).toHaveLength(1);
    rejected(s, 'item/dismantle', { uid: 'ghost' });
  });
});

describe('companion quality chance', () => {
  const withCompanion = (likes: string[], upgrade = 0) => {
    const s = structuredClone(base);
    s.inventory.push(inst('it_1', 'item_blade', { upgrade }));
    s.squad[0].equipment = { weapon: 'it_1' };
    s.squad[0].likes = likes;
    return s;
  };

  it('a tech-loving companion can give a free weapon upgrade (seeded, about 25 %)', () => {
    let upgraded = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const s = withCompanion(['tech']);
      s.rng = seedRng(seed);
      const r = act(s, 'activity/do', { activityId: 'workshop', companionId: 'unit_ann' });
      expect(errors(r.events)).toEqual([]);
      expect(r.state.workshopSession).toEqual({ day: 1, opsLeft: 3, companionId: 'unit_ann' });
      if (r.state.inventory[0].upgrade === 1) {
        upgraded += 1;
        expect(ofType(r.events, 'item_upgraded')).toEqual([{ type: 'item_upgraded', uid: 'it_1', upgrade: 1, free: true, unitId: 'unit_ann' }]);
      }
    }
    expect(upgraded / 400).toBeGreaterThan(0.18);
    expect(upgraded / 400).toBeLessThan(0.32);
  });

  it('not without the tech like, not past +5, not without a weapon', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const s of [withCompanion([]), withCompanion(['tech'], 5), (() => { const x = withCompanion(['tech']); x.squad[0].equipment = {}; return x; })()]) {
        s.rng = seedRng(seed);
        const r = act(s, 'activity/do', { activityId: 'workshop', companionId: 'unit_ann' });
        expect(ofType(r.events, 'item_upgraded')).toEqual([]);
      }
    }
  });
});
