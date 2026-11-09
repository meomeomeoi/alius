import { registerAction } from '../dispatch';
import { isLiving } from '../economy';
import { canEquip, equippedBy } from '../items';

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
