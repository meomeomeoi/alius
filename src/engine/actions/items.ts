import { registerActivityHook } from '../activities';
import { registerAction, type EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import {
  canEquip, checkWorkshop, dismantleValue, equippedBy, newItem, openWorkshop, rarityIndex, rerollCost, upgradeCost,
  workshopRarityCap,
} from '../items';
import type { CampaignState, Rarity } from '../state/types';
import { TUNING } from '../tuning';

// Importing this module registers the item actions.

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

registerAction('item/equip', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.unitId !== 'string' || typeof payload.uid !== 'string') {
    throw new Error('item/equip needs { unitId, uid }');
  }
  const unit = draft.squad.find((u) => u.id === payload.unitId);
  if (!unit || !isLiving(unit)) throw new Error(`item/equip: unit "${payload.unitId}" cannot equip anything`);
  const inst = draft.inventory.find((i) => i.uid === payload.uid);
  if (!inst) throw new Error(`item/equip: unknown item "${payload.uid}"`);
  const reason = canEquip(ctx.registries, unit, inst);
  if (reason) throw new Error(`item/equip: ${reason}`);
  const slot = ctx.registries.items.get(inst.itemId)!.slot as 'weapon' | 'upper' | 'lower';

  const previous = equippedBy(draft, inst.uid);
  if (previous) for (const s of ['weapon', 'upper', 'lower'] as const) if (previous.equipment[s] === inst.uid) delete previous.equipment[s];
  unit.equipment[slot] = inst.uid;
  return [{ type: 'item_equipped', unitId: unit.id, slot, uid: inst.uid, from: previous?.id ?? null }];
});

registerAction('item/unequip', (draft, payload) => {
  if (!isObj(payload) || typeof payload.unitId !== 'string' || !['weapon', 'upper', 'lower'].includes(String(payload.slot))) {
    throw new Error('item/unequip needs { unitId, slot }');
  }
  const unit = draft.squad.find((u) => u.id === payload.unitId);
  if (!unit) throw new Error(`item/unequip: unknown unit "${payload.unitId}"`);
  const slot = payload.slot as 'weapon' | 'upper' | 'lower';
  if (!unit.equipment[slot]) throw new Error(`item/unequip: nothing equipped in ${slot}`);
  delete unit.equipment[slot];
  return [{ type: 'item_equipped', unitId: unit.id, slot, uid: null, from: null }];
});

// ------------------------------------------------------------------------------------------------ workshop

const spend = (draft: CampaignState, credits: number, plyx: number): EngineEvent[] => {
  if (draft.resources.credits < credits || draft.resources.plyx < plyx) throw new Error(`Not enough resources: needs ${credits} credits and ${plyx} plyx.`);
  draft.resources.credits -= credits;
  draft.resources.plyx -= plyx;
  const out: EngineEvent[] = [];
  if (credits) out.push({ type: 'resource_changed', resource: 'credits', amount: -credits });
  if (plyx) out.push({ type: 'resource_changed', resource: 'plyx', amount: -plyx });
  return out;
};

const session = (draft: CampaignState): void => {
  const reason = checkWorkshop(draft);
  if (reason) throw new Error(reason);
};

const ownedItem = (draft: CampaignState, uid: unknown) => {
  const inst = draft.inventory.find((i) => i.uid === uid);
  if (!inst) throw new Error(`Unknown item "${String(uid)}".`);
  return inst;
};

registerAction('item/craft', (draft, payload, ctx) => {
  session(draft);
  const id = isObj(payload) ? payload.recipeId : undefined;
  const recipe = typeof id === 'string' ? ctx.registries.recipes.get(id) : undefined;
  if (!recipe) throw new Error(`Unknown recipe "${String(id)}".`);
  const rarity = recipe.rarity as Rarity;
  if (rarityIndex(rarity) > workshopRarityCap(draft, ctx.registries)) throw new Error('WORKSHOP LEVEL TOO LOW');
  const cost = recipe.cost as { credits: number; plyx: number };
  const events = spend(draft, cost.credits, cost.plyx);
  const item = newItem(draft, ctx.registries, ctx.rng, recipe.itemId as string, rarity);
  draft.inventory.push(item);
  draft.workshopSession!.opsLeft -= 1;
  return [...events, { type: 'item_crafted', uid: item.uid, itemId: item.itemId, rarity }];
});

registerAction('item/upgrade', (draft, payload, ctx) => {
  session(draft);
  const inst = ownedItem(draft, isObj(payload) ? payload.uid : undefined);
  if (inst.upgrade >= TUNING.items.maxUpgrade) throw new Error('MAX UPGRADE');
  const cost = upgradeCost(draft, ctx.registries, inst);
  const events = spend(draft, cost.credits, cost.plyx);
  inst.upgrade += 1;
  draft.workshopSession!.opsLeft -= 1;
  return [...events, { type: 'item_upgraded', uid: inst.uid, upgrade: inst.upgrade }];
});

registerAction('item/reroll', (draft, payload, ctx) => {
  session(draft);
  const p = isObj(payload) ? payload : {};
  const inst = ownedItem(draft, p.uid);
  const i = p.affixIndex;
  if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= inst.affixes.length) throw new Error('Pick one of the item\'s affixes.');
  if (ctx.registries.affixes.get(inst.affixes[i])?.drawback === true) throw new Error('A drawback cannot be rerolled.');
  const slot = ctx.registries.items.get(inst.itemId)?.slot as 'weapon' | 'upper' | 'lower';
  const pool = [...ctx.registries.affixes.values()].filter((a) =>
    a.appliesTo === 'item' && a.drawback !== true && !inst.affixes.includes(a.id)
    && (!(a.slots as string[] | undefined) || (a.slots as string[]).includes(slot))).map((a) => a.id);
  if (pool.length === 0) throw new Error('No other affix can roll on this item.');
  const events = spend(draft, 0, rerollCost(inst));
  const before = inst.affixes[i];
  inst.affixes[i] = ctx.rng.pick(pool);
  draft.workshopSession!.opsLeft -= 1;
  return [...events, { type: 'item_rerolled', uid: inst.uid, from: before, to: inst.affixes[i] }];
});

registerAction('item/dismantle', (draft, payload, ctx) => {
  session(draft);
  const inst = ownedItem(draft, isObj(payload) ? payload.uid : undefined);
  if (equippedBy(draft, inst.uid)) throw new Error('Unequip the item first.');
  const plyx = dismantleValue(ctx.registries, inst);
  draft.inventory = draft.inventory.filter((i) => i.uid !== inst.uid);
  draft.resources.plyx += plyx;
  draft.workshopSession!.opsLeft -= 1;
  return [{ type: 'resource_changed', resource: 'plyx', amount: plyx }, { type: 'item_dismantled', uid: inst.uid, plyx }];
});

/** The workshop activity spends the slot; this opens the session (P2 only emits `workshop_session`). */
registerActivityHook((draft, ctx, done) =>
  done.activityId === 'workshop' ? openWorkshop(draft, ctx.registries, ctx.rng, done.companionId) : []);
