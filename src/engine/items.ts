import type { Registries } from '../content/types';
import type { EngineEvent } from './dispatch';
import { facilityEffect } from './economy';
import type { EffectSpec, Stats } from './combat/types';
import type { Rng } from './rng';
import { RARITIES, type CampaignState, type ItemInstance, type LootDrop, type Rarity, type Unit } from './state/types';
import { TUNING } from './tuning';

export const rarityIndex = (r: Rarity): 1 | 2 | 3 | 4 | 5 => (RARITIES.indexOf(r) + 1) as 1 | 2 | 3 | 4 | 5;

type Slot = 'weapon' | 'upper' | 'lower';

/** Affix ids allowed on a slot, split into positive affixes and drawbacks (registry order). */
function affixPools(reg: Registries, slot: Slot): { good: string[]; drawbacks: string[] } {
  const good: string[] = [];
  const drawbacks: string[] = [];
  for (const a of reg.affixes.values()) {
    if (a.appliesTo !== 'item') continue;
    const slots = a.slots as Slot[] | undefined;
    if (slots && !slots.includes(slot)) continue;
    (a.drawback === true ? drawbacks : good).push(a.id);
  }
  return { good, drawbacks };
}

function pickDistinct(rng: Rng, pool: string[], n: number): string[] {
  const left = [...pool];
  const out: string[] = [];
  while (out.length < n && left.length > 0) out.push(left.splice(rng.int(0, left.length - 1), 1)[0]);
  return out;
}

/**
 * Creates an item instance (not yet in the inventory). Rolls `affixSlots[rarity]` distinct positive affixes allowed
 * for the slot, plus one drawback when anomalous. A rarity below the template's minimum throws.
 */
export function newItem(draft: CampaignState, reg: Registries, rng: Rng, itemId: string, rarity: Rarity): ItemInstance {
  const tpl = reg.items.get(itemId);
  if (!tpl) throw new Error(`Unknown item "${itemId}"`);
  if (rarityIndex(rarity) < rarityIndex(tpl.rarity as Rarity)) {
    throw new Error(`Item "${itemId}" cannot be ${rarity}: its minimum rarity is ${String(tpl.rarity)}`);
  }
  const pools = affixPools(reg, tpl.slot as Slot);
  const slots = (tpl.affixSlots as number | undefined) ?? TUNING.items.affixSlots[rarityIndex(rarity) - 1];
  const affixes = pickDistinct(rng, pools.good, slots);
  if (rarity === 'anomalous') affixes.push(...pickDistinct(rng, pools.drawbacks, 1));
  const seq = (draft.itemSeq ?? 0) + 1;
  draft.itemSeq = seq;
  return { uid: `it_${seq}`, itemId, rarity, upgrade: 0, affixes };
}

export interface ItemStats {
  /** Flat stats (template × rarity × upgrade, rounded). */
  stats: Partial<Stats>;
  /** Affix percentages: a share of the wearer's total stat (applied by `unitStats`). */
  statPct: Partial<Stats>;
  /** Template and affix effects, run by the combat effect runner. */
  effects: EffectSpec[];
}

/** Stats and effects of an instance; an unknown template gives `null`. */
export function itemStats(reg: Registries, inst: ItemInstance): ItemStats | null {
  const tpl = reg.items.get(inst.itemId);
  if (!tpl) return null;
  const mult = (1 + TUNING.items.rarityStatStep * (rarityIndex(inst.rarity) - 1)) * (1 + TUNING.items.upgradeStep * inst.upgrade);
  const stats: Partial<Stats> = {};
  for (const [k, v] of Object.entries(tpl.baseStats as Partial<Stats>)) stats[k as keyof Stats] = Math.round((v as number) * mult);
  const statPct: Partial<Stats> = {};
  const effects: EffectSpec[] = [...((tpl.effects as EffectSpec[] | undefined) ?? [])];
  for (const id of inst.affixes) {
    const a = reg.affixes.get(id);
    if (!a) continue;
    for (const [k, v] of Object.entries((a.statPct as Partial<Stats> | undefined) ?? {})) {
      statPct[k as keyof Stats] = (statPct[k as keyof Stats] ?? 0) + (v as number);
    }
    effects.push(...((a.effects as EffectSpec[] | undefined) ?? []));
  }
  return { stats, statPct, effects };
}

/** `null` when the unit's role may wear the item; otherwise the reason shown in SQUAD. */
export function canEquip(reg: Registries, unit: Unit, inst: ItemInstance): string | null {
  const tpl = reg.items.get(inst.itemId);
  if (!tpl) return 'UNKNOWN ITEM';
  const role = reg.roles.get(unit.roleId);
  if (!role) return 'UNKNOWN ROLE';
  const allowed = (tpl.slot === 'weapon' ? role.weaponClasses : role.armorWeights) as string[];
  return allowed.includes(tpl.class as string) ? null : `NOT CERTIFIED: ${String(tpl.class)}`;
}

export const equippedBy = (state: CampaignState, uid: string): Unit | undefined =>
  state.squad.find((u) => u.equipment.weapon === uid || u.equipment.upper === uid || u.equipment.lower === uid);

/** The unit's legally worn items (unknown uids, unknown templates and illegal items are ignored). */
export function wornItems(state: CampaignState, reg: Registries, unit: Unit): Array<{ inst: ItemInstance; slot: Slot }> {
  const out: Array<{ inst: ItemInstance; slot: Slot }> = [];
  for (const slot of ['weapon', 'upper', 'lower'] as const) {
    const uid = unit.equipment[slot];
    const inst = uid ? state.inventory.find((i) => i.uid === uid) : undefined;
    if (inst && reg.items.get(inst.itemId)?.slot === slot && canEquip(reg, unit, inst) === null) out.push({ inst, slot });
  }
  return out;
}

/**
 * Rolls a loot table without banking anything. Item rarity comes from the entry's `rarityWeights` (only rarities at
 * or above the template minimum) or is the template's own minimum.
 */
export function rollLoot(
  draft: CampaignState, reg: Registries, rng: Rng, tableId: string, opts: { extraRolls?: number } = {},
): LootDrop[] {
  const table = reg.lootTables.get(tableId);
  if (!table) throw new Error(`Unknown loot table "${tableId}"`);
  const entries = table.entries as Array<{
    weight: number; kind: 'item' | 'credits' | 'plyx' | 'supplies'; itemId?: string;
    rarityWeights?: Partial<Record<Rarity, number>>; amount?: [number, number];
  }>;
  const total = entries.reduce((s, e) => s + e.weight, 0);
  const drops: LootDrop[] = [];
  const rolls = (table.rolls as number) + (opts.extraRolls ?? 0);
  for (let i = 0; i < rolls; i++) {
    let r = rng.float() * total;
    const entry = entries.find((e) => (r -= e.weight) < 0) ?? entries[entries.length - 1];
    if (entry.kind === 'item') {
      const tplRarity = reg.items.get(entry.itemId!)?.rarity as Rarity | undefined;
      if (!tplRarity) continue;
      let rarity: Rarity = tplRarity;
      if (entry.rarityWeights) {
        const options = RARITIES.filter((x) => (entry.rarityWeights![x] ?? 0) > 0 && rarityIndex(x) >= rarityIndex(tplRarity));
        if (options.length > 0) {
          const sum = options.reduce((s, x) => s + entry.rarityWeights![x]!, 0);
          let q = rng.float() * sum;
          rarity = options.find((x) => (q -= entry.rarityWeights![x]!) < 0) ?? options[options.length - 1];
        }
      }
      drops.push({ kind: 'item', item: newItem(draft, reg, rng, entry.itemId!, rarity) });
    } else {
      const [lo, hi] = entry.amount!;
      drops.push({ kind: entry.kind, amount: rng.int(lo, hi) });
    }
  }
  return drops;
}

/** Puts drops into the inventory and resources. Emits one `loot_banked`. */
export function bankLoot(draft: CampaignState, drops: LootDrop[]): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const d of drops) {
    if (d.kind === 'item') draft.inventory.push(structuredClone(d.item));
    else draft.resources[d.kind] += d.amount;
  }
  if (drops.length > 0) events.push({ type: 'loot_banked', drops: structuredClone(drops) });
  return events;
}

// ------------------------------------------------------------------------------------------------ workshop

/** `null` while a workshop session of today with operations left is open. */
export function checkWorkshop(state: CampaignState): string | null {
  const s = state.workshopSession;
  return s && s.day === state.day && s.opsLeft > 0 ? null : 'NO WORKSHOP SESSION';
}

/** The highest rarity index (1–5) the workshop can craft at its current level. */
export const workshopRarityCap = (state: CampaignState, reg: Registries): number => facilityEffect(state, reg, 'workshop', 'rarityCap');

/** Upgrade cost: `(upgrade + 1) × base`, reduced by the workshop's discount, rounded up. */
export function upgradeCost(state: CampaignState, reg: Registries, inst: ItemInstance): { credits: number; plyx: number } {
  const factor = (1 - facilityEffect(state, reg, 'workshop', 'upgradeDiscountPct') / 100) * (inst.upgrade + 1);
  return {
    credits: Math.ceil(TUNING.items.upgradeCost.credits * factor),
    plyx: Math.ceil(TUNING.items.upgradeCost.plyx * factor),
  };
}

export const rerollCost = (inst: ItemInstance): number => TUNING.items.rerollPlyxPerRarity * rarityIndex(inst.rarity);

/** Plyx for scrapping an item: `value × (1 + 0.15 × (rarity − 1)) × 50 %`. */
export function dismantleValue(reg: Registries, inst: ItemInstance): number {
  const value = (reg.items.get(inst.itemId)?.value as number | undefined) ?? 0;
  return Math.round((value * (1 + TUNING.items.rarityStatStep * (rarityIndex(inst.rarity) - 1)) * TUNING.items.dismantlePct) / 100);
}

/** Opens (or renews) today's session after a workshop activity; a tech-loving companion may improve her weapon for free. */
export function openWorkshop(draft: CampaignState, reg: Registries, rng: Rng, companionId?: string): EngineEvent[] {
  draft.workshopSession = { day: draft.day, opsLeft: TUNING.items.opsPerSession, ...(companionId ? { companionId } : {}) };
  const events: EngineEvent[] = [{ type: 'workshop_opened', day: draft.day, opsLeft: TUNING.items.opsPerSession, ...(companionId ? { companionId } : {}) }];
  const companion = companionId ? draft.squad.find((u) => u.id === companionId) : undefined;
  const weapon = companion?.equipment.weapon ? draft.inventory.find((i) => i.uid === companion.equipment.weapon) : undefined;
  if (companion && weapon && companion.likes.includes('tech') && weapon.upgrade < TUNING.items.maxUpgrade
    && rng.chance(TUNING.items.companionQualityChance)) {
    weapon.upgrade += 1;
    events.push({ type: 'item_upgraded', uid: weapon.uid, upgrade: weapon.upgrade, free: true, unitId: companion.id });
  }
  void reg;
  return events;
}
