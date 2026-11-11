import { INTERNAL_HISTORY_TYPES } from '../engine/relations/vocab';
import type { Conditions } from './schemas';
import type { Entry, RegistryName } from './types';

export interface Ref {
  registry: RegistryName;
  id: string;
  /** Path of the referencing field inside the entry, e.g. `mutuallyExclusiveWith[0]`. */
  path: string;
  /** Extra check on the referenced entry; a non-null message is reported at `path`. */
  check?: (target: Entry) => string | null;
}

export type RefExtractor = (entry: Entry) => Ref[];

const extractors = new Map<RegistryName, RefExtractor[]>();

export function registerRefs(registry: RegistryName, extract: RefExtractor): void {
  const list = extractors.get(registry) ?? [];
  list.push(extract);
  extractors.set(registry, list);
}

export function getRefExtractors(): ReadonlyMap<RegistryName, RefExtractor[]> {
  return extractors;
}

registerRefs('flags', (entry) => {
  const list = entry.mutuallyExclusiveWith;
  if (!Array.isArray(list)) return [];
  return list.map((id, i) => ({ registry: 'flags' as const, id: String(id), path: `mutuallyExclusiveWith[${i}]` }));
});

registerRefs('starts', (entry) => {
  if (typeof entry.corporationId !== 'string') return [];
  const corpId = entry.corporationId;
  return [{
    registry: 'corporations' as const,
    id: corpId,
    path: 'corporationId',
    check: (target) =>
      target.playable === true ? null : `start "${entry.id}" uses non-playable corporation "${corpId}"`,
  }];
});

interface FacilityLevels { levels?: Array<{ effects?: Record<string, number> }>; maxLevel?: number }

registerRefs('activities', (entry) => {
  const refs: Ref[] = [];
  const req = entry.facilityReq as { id?: unknown; level?: unknown } | undefined;
  if (req && typeof req.id === 'string') {
    const level = req.level;
    refs.push({
      registry: 'facilities',
      id: req.id,
      path: 'facilityReq.id',
      check: (t) =>
        typeof level === 'number' && level > ((t as FacilityLevels).maxLevel ?? 0)
          ? `facility "${req.id}" has no level ${level}`
          : null,
    });
  }
  for (const list of ['effects', 'companionEffects'] as const) {
    const fxs = entry[list];
    if (!Array.isArray(fxs)) continue;
    fxs.forEach((fx, i) => {
      const scale = (fx as { scale?: { facility?: unknown; key?: unknown } }).scale;
      if (!scale || typeof scale.facility !== 'string') return;
      const key = String(scale.key);
      refs.push({
        registry: 'facilities',
        id: scale.facility,
        path: `${list}[${i}].scale.facility`,
        check: (t) => ((t as FacilityLevels).levels?.[0]?.effects && key in (t as FacilityLevels).levels![0].effects!
          ? null : `facility "${scale.facility}" has no effect "${key}"`),
      });
    });
  }
  return refs;
});

// ---------------------------------------------------------------------------------------------
// P3: relationship states, defect social data

const HISTORY_TYPES: readonly string[] = INTERNAL_HISTORY_TYPES;

/** References inside a conditions tree (recursing through `anyOf`). */
function conditionRefs(c: Conditions | undefined, path: string, out: Ref[]): void {
  if (!c) return;
  c.inStates?.forEach((id, i) => out.push({ registry: 'relationshipStates', id, path: `${path}.inStates[${i}]` }));
  c.flagsAll?.forEach((id, i) => out.push({ registry: 'flags', id, path: `${path}.flagsAll[${i}]` }));
  c.flagsNone?.forEach((id, i) => out.push({ registry: 'flags', id, path: `${path}.flagsNone[${i}]` }));
  c.defectsAny?.forEach((id, i) => out.push({ registry: 'defects', id, path: `${path}.defectsAny[${i}]` }));
  if (c.eventCount && !HISTORY_TYPES.includes(c.eventCount.type)) {
    out.push({ registry: 'eventDeltas', id: c.eventCount.type, path: `${path}.eventCount.type` });
  }
  c.anyOf?.forEach((sub, i) => conditionRefs(sub, `${path}.anyOf[${i}]`, out));
}

interface NightLike { ignore?: { event?: unknown } }
function nightRefs(list: unknown, path: string, out: Ref[]): void {
  if (!Array.isArray(list)) return;
  list.forEach((n: NightLike, i) => {
    if (typeof n?.ignore?.event === 'string') out.push({ registry: 'eventDeltas', id: n.ignore.event, path: `${path}[${i}].ignore.event` });
  });
}

registerRefs('relationshipStates', (entry) => {
  const out: Ref[] = [];
  const e = entry.entry as { fromStates?: string[]; events?: string[]; when?: Conditions } | undefined;
  e?.fromStates?.forEach((id, i) => out.push({ registry: 'relationshipStates', id, path: `entry.fromStates[${i}]` }));
  // `entry.events` are EventType enums, validated by the schema; their delta rows are checked by the core test.
  conditionRefs(e?.when, 'entry.when', out);
  (entry.exit as Array<{ when: Conditions; to: string }> | undefined)?.forEach((x, i) => {
    out.push({ registry: 'relationshipStates', id: x.to, path: `exit[${i}].to` });
    conditionRefs(x.when, `exit[${i}].when`, out);
  });
  nightRefs((entry.unlocks as { nightEvents?: unknown } | undefined)?.nightEvents, 'unlocks.nightEvents', out);
  return out;
});

registerRefs('defects', (entry) => {
  const out: Ref[] = [];
  const mods = entry.relationModifiers as { events?: Record<string, number> } | undefined;
  for (const type of Object.keys(mods?.events ?? {})) {
    out.push({ registry: 'eventDeltas', id: type, path: `relationModifiers.events.${type}` });
  }
  (entry.socialHooks as Array<{ activity: string; setFlag?: string }> | undefined)?.forEach((h, i) => {
    out.push({ registry: 'activities', id: h.activity, path: `socialHooks[${i}].activity` });
    if (h.setFlag) out.push({ registry: 'flags', id: h.setFlag, path: `socialHooks[${i}].setFlag` });
  });
  nightRefs(entry.nightEvents, 'nightEvents', out);
  return out;
});

// ---------------------------------------------------------------------------------------------
// P4: combat content references

/** Status, enemy and skill ids inside a list of combat effects. */
function effectRefs(list: unknown, path: string, out: Ref[]): void {
  if (!Array.isArray(list)) return;
  list.forEach((fx: { type?: string; statusId?: unknown; enemyId?: unknown; addEffects?: unknown }, i) => {
    if (!fx || typeof fx !== 'object') return;
    if ((fx.type === 'status' || fx.type === 'immune') && typeof fx.statusId === 'string') {
      out.push({ registry: 'statuses', id: fx.statusId, path: `${path}[${i}].statusId` });
    }
    if (fx.type === 'summon' && typeof fx.enemyId === 'string') {
      out.push({ registry: 'enemies', id: fx.enemyId, path: `${path}[${i}].enemyId` });
    }
  });
}

registerRefs('skills', (entry) => {
  const out: Ref[] = [];
  effectRefs(entry.effects, 'effects', out);
  return out;
});

for (const reg of ['orders', 'synergies', 'affixes', 'items'] as const) {
  registerRefs(reg, (entry) => {
    const out: Ref[] = [];
    effectRefs(entry.effects, 'effects', out);
    return out;
  });
}

registerRefs('statuses', (entry) => {
  const out: Ref[] = [];
  effectRefs(entry.tick, 'tick', out);
  return out;
});

registerRefs('defects', (entry) => {
  const out: Ref[] = [];
  const combat = entry.combat as { upside?: unknown; downside?: unknown; breakdown?: { onEnter?: unknown; actionEffects?: unknown } } | undefined;
  if (!combat) return out;
  effectRefs(combat.upside, 'combat.upside', out);
  effectRefs(combat.downside, 'combat.downside', out);
  effectRefs(combat.breakdown?.onEnter, 'combat.breakdown.onEnter', out);
  effectRefs(combat.breakdown?.actionEffects, 'combat.breakdown.actionEffects', out);
  return out;
});

interface TreeNodeLike { grants?: { skill?: unknown; upgrade?: { skillId?: unknown; addEffects?: unknown } } }
registerRefs('roles', (entry) => {
  const out: Ref[] = [];
  (entry.starterSkills as unknown[] | undefined)?.forEach((id, i) => {
    out.push({ registry: 'skills', id: String(id), path: `starterSkills[${i}]` });
  });
  (entry.tree as TreeNodeLike[] | undefined)?.forEach((n, i) => {
    if (typeof n.grants?.skill === 'string') out.push({ registry: 'skills', id: n.grants.skill, path: `tree[${i}].grants.skill` });
    const up = n.grants?.upgrade;
    if (up && typeof up.skillId === 'string') out.push({ registry: 'skills', id: up.skillId, path: `tree[${i}].grants.upgrade.skillId` });
    effectRefs(up?.addEffects, `tree[${i}].grants.upgrade.addEffects`, out);
  });
  return out;
});

registerRefs('signatures', (entry) =>
  typeof entry.skill === 'string' ? [{ registry: 'skills' as const, id: entry.skill, path: 'skill' }] : []);

registerRefs('enemies', (entry) => {
  const out: Ref[] = [];
  if (typeof entry.categoryId === 'string') out.push({ registry: 'enemyCategories', id: entry.categoryId, path: 'categoryId' });
  (entry.skills as unknown[] | undefined)?.forEach((id, i) => out.push({ registry: 'skills', id: String(id), path: `skills[${i}]` }));
  if (typeof entry.eliteSkill === 'string') out.push({ registry: 'skills', id: entry.eliteSkill, path: 'eliteSkill' });
  return out;
});

const RARITY_ORDER = ['standard', 'refined', 'prototype', 'corporate', 'anomalous'];
registerRefs('recipes', (entry) => {
  if (typeof entry.itemId !== 'string') return [];
  const rarity = String(entry.rarity);
  return [{
    registry: 'items' as const,
    id: entry.itemId,
    path: 'itemId',
    check: (t) => (RARITY_ORDER.indexOf(rarity) >= RARITY_ORDER.indexOf(String(t.rarity))
      ? null : `recipe rarity "${rarity}" is below the template's minimum rarity "${String(t.rarity)}"`),
  }];
});

registerRefs('lootTables', (entry) => {
  const out: Ref[] = [];
  (entry.entries as Array<{ itemId?: unknown }> | undefined)?.forEach((e, i) => {
    if (typeof e.itemId === 'string') out.push({ registry: 'items', id: e.itemId, path: `entries[${i}].itemId` });
  });
  return out;
});

registerRefs('relationshipStates', (entry) => {
  const list = (entry.unlocks as { synergies?: unknown[] } | undefined)?.synergies;
  return (list ?? []).map((id, i) => ({ registry: 'synergies' as const, id: String(id), path: `unlocks.synergies[${i}]` }));
});

// ---------------------------------------------------------------------------------------------
// P5: world content references

/** Ids inside a list of world effects (faction, clock, flag, loot table, mission template, region). */
function worldEffectRefs(list: unknown, path: string, out: Ref[]): void {
  if (!Array.isArray(list)) return;
  list.forEach((fx: Record<string, unknown>, i) => {
    if (!fx || typeof fx !== 'object') return;
    const at = `${path}[${i}]`;
    if (fx.type === 'faction' && typeof fx.factionId === 'string') out.push({ registry: 'corporations', id: fx.factionId, path: `${at}.factionId` });
    if (fx.type === 'clock' && typeof fx.clockId === 'string') out.push({ registry: 'clocks', id: fx.clockId, path: `${at}.clockId` });
    if (fx.type === 'flag' && typeof fx.flagId === 'string') {
      const flagId = fx.flagId;
      out.push({
        registry: 'flags', id: flagId, path: `${at}.flagId`,
        check: (t) => (t.scope === 'world' || t.scope === 'commander' ? null : `flag "${flagId}" has scope "${String(t.scope)}"; a world effect needs scope world or commander`),
      });
    }
    if (fx.type === 'loot' && typeof fx.tableId === 'string') out.push({ registry: 'lootTables', id: fx.tableId, path: `${at}.tableId` });
    if (fx.type === 'offer_mission') {
      if (typeof fx.templateId === 'string') out.push({ registry: 'missionTemplates', id: fx.templateId, path: `${at}.templateId` });
      if (typeof fx.regionId === 'string') out.push({ registry: 'regions', id: fx.regionId, path: `${at}.regionId` });
    }
  });
}

const hasSource = (source: string) => (t: Entry): string | null =>
  Array.isArray(t.sources) && t.sources.includes(source) ? null : `mission template "${t.id}" does not allow source "${source}"`;

registerRefs('clocks', (entry) => {
  const out: Ref[] = [];
  if (typeof entry.regionId === 'string') out.push({ registry: 'regions', id: entry.regionId, path: 'regionId' });
  worldEffectRefs(entry.onFill, 'onFill', out);
  return out;
});

registerRefs('regions', (entry) => {
  const out: Ref[] = [];
  const table = entry.enemyTable as { categories?: Record<string, unknown>; archetypes?: unknown[] } | undefined;
  for (const id of Object.keys(table?.categories ?? {})) out.push({ registry: 'enemyCategories', id, path: `enemyTable.categories.${id}` });
  table?.archetypes?.forEach((id, i) => out.push({ registry: 'enemies', id: String(id), path: `enemyTable.archetypes[${i}]` }));
  for (const id of Object.keys((entry.nodeWeights as Record<string, unknown> | undefined) ?? {})) {
    out.push({ registry: 'nodeTypes', id, path: `nodeWeights.${id}` });
  }
  (entry.pointsOfInterest as Array<{ templateId?: unknown }> | undefined)?.forEach((p, i) => {
    if (typeof p.templateId === 'string') out.push({ registry: 'missionTemplates', id: p.templateId, path: `pointsOfInterest[${i}].templateId`, check: hasSource('side') });
  });
  const flag = (entry.unlockedBy as { flag?: unknown } | undefined)?.flag;
  if (typeof flag === 'string') out.push({ registry: 'flags', id: flag, path: 'unlockedBy.flag' });
  return out;
});

registerRefs('nodeTypes', (entry) => {
  const out: Ref[] = [];
  const lootTableId = (entry.combat as { lootTableId?: unknown } | undefined)?.lootTableId;
  if (typeof lootTableId === 'string') out.push({ registry: 'lootTables', id: lootTableId, path: 'combat.lootTableId' });
  for (const id of Object.keys((entry.resolvesTo as Record<string, unknown> | undefined) ?? {})) {
    out.push({
      registry: 'nodeTypes', id, path: `resolvesTo.${id}`,
      check: (t) => (t.kind === 'unknown' || t.kind === 'objective' ? `node type "${id}" has kind "${String(t.kind)}" and cannot be a resolvesTo target` : null),
    });
  }
  return out;
});

const OBJECTIVE_KINDS = ['combat', 'event', 'cache'];
registerRefs('missionTemplates', (entry) => {
  const out: Ref[] = [];
  (entry.regions as unknown[] | undefined)?.forEach((id, i) => out.push({ registry: 'regions', id: String(id), path: `regions[${i}]` }));
  (entry.objectives as Array<{ node?: unknown }> | undefined)?.forEach((o, i) => {
    if (typeof o.node !== 'string') return;
    const node = o.node;
    out.push({
      registry: 'nodeTypes', id: node, path: `objectives[${i}].node`,
      check: (t) => (OBJECTIVE_KINDS.includes(String(t.kind)) ? null : `node type "${node}" has kind "${String(t.kind)}"; an objective node is combat, event or cache`),
    });
    // a fight can only be won at a combat node: any other kind would make the mission impossible to complete
    if ((entry.objectives as Array<{ condition?: unknown }>)[i].condition === 'win') {
      out.push({
        registry: 'nodeTypes', id: node, path: `objectives[${i}].condition`,
        check: (t) => (t.kind === 'combat' ? null : `a "win" objective needs a combat node, but "${node}" has kind "${String(t.kind)}"`),
      });
    }
  });
  (entry.tiers as unknown[] | undefined)?.forEach((id, i) => out.push({ registry: 'rewardTiers', id: String(id), path: `tiers[${i}]` }));
  if (typeof entry.factionId === 'string') out.push({ registry: 'corporations', id: entry.factionId, path: 'factionId' });
  if (typeof entry.objectiveEventId === 'string') out.push({ registry: 'dilemmaTemplates', id: entry.objectiveEventId, path: 'objectiveEventId' });
  worldEffectRefs(entry.failureEffects, 'failureEffects', out);
  worldEffectRefs(entry.onSuccess, 'onSuccess', out);
  return out;
});

registerRefs('rewardTiers', (entry) =>
  typeof entry.lootTableId === 'string' ? [{ registry: 'lootTables' as const, id: entry.lootTableId, path: 'lootTableId' }] : []);

registerRefs('dilemmaTemplates', (entry) => {
  const out: Ref[] = [];
  (entry.regions as unknown[] | undefined)?.forEach((id, i) => out.push({ registry: 'regions', id: String(id), path: `regions[${i}]` }));
  const options = (entry.fixed as { options?: Array<{ effects?: unknown }> } | undefined)?.options;
  options?.forEach((o, i) => worldEffectRefs(o.effects, `fixed.options[${i}].effects`, out));
  // P6
  (entry.allowedFlags as unknown[] | undefined)?.forEach((id, i) => out.push({ registry: 'flags', id: String(id), path: `allowedFlags[${i}]` }));
  const refs = entry.requiredRefs as { factions?: unknown[]; regions?: unknown[]; clocks?: unknown[] } | undefined;
  refs?.factions?.forEach((id, i) => out.push({ registry: 'corporations', id: String(id), path: `requiredRefs.factions[${i}]` }));
  refs?.regions?.forEach((id, i) => out.push({ registry: 'regions', id: String(id), path: `requiredRefs.regions[${i}]` }));
  refs?.clocks?.forEach((id, i) => out.push({ registry: 'clocks', id: String(id), path: `requiredRefs.clocks[${i}]` }));
  return out;
});

registerRefs('defects', (entry) =>
  typeof entry.arcFlag === 'string' ? [{ registry: 'flags' as const, id: entry.arcFlag, path: 'arcFlag' }] : []);

registerRefs('corporations', (entry) =>
  typeof entry.startingRegionId === 'string' ? [{ registry: 'regions' as const, id: entry.startingRegionId, path: 'startingRegionId' }] : []);

registerRefs('starts', (entry) => {
  const out: Ref[] = [];
  (entry.spine as Array<Record<string, any>> | undefined)?.forEach((beat, i) => {
    const at = `spine[${i}]`;
    (beat.conditions?.flagsAll as unknown[] | undefined)?.forEach((id, j) => out.push({ registry: 'flags', id: String(id), path: `${at}.conditions.flagsAll[${j}]` }));
    (beat.conditions?.flagsNone as unknown[] | undefined)?.forEach((id, j) => out.push({ registry: 'flags', id: String(id), path: `${at}.conditions.flagsNone[${j}]` }));
    const completion = beat.completion as { kind?: string; anyOf?: unknown[]; templateId?: unknown; regionId?: unknown } | undefined;
    completion?.anyOf?.forEach((id, j) => out.push({ registry: 'flags', id: String(id), path: `${at}.completion.anyOf[${j}]` }));
    if (typeof completion?.templateId === 'string') {
      out.push({ registry: 'missionTemplates', id: completion.templateId, path: `${at}.completion.templateId`, check: hasSource('story') });
    }
    if (typeof completion?.regionId === 'string') out.push({ registry: 'regions', id: completion.regionId, path: `${at}.completion.regionId` });
    worldEffectRefs(beat.onComplete, `${at}.onComplete`, out);
  });
  return out;
});

/** Checks that need the whole registry set (reported at `path` of the entry). */
export interface RegistryCheck { path: string; message: string }
export type CheckExtractor = (entry: Entry, registries: Record<RegistryName, Map<string, Entry>>) => RegistryCheck[];
const checkExtractors = new Map<RegistryName, CheckExtractor[]>();

export function registerChecks(registry: RegistryName, check: CheckExtractor): void {
  const list = checkExtractors.get(registry) ?? [];
  list.push(check);
  checkExtractors.set(registry, list);
}

export function getCheckExtractors(): ReadonlyMap<RegistryName, CheckExtractor[]> {
  return checkExtractors;
}

registerChecks('items', (entry, regs) => {
  const cls = String(entry.class);
  for (const role of regs.roles.values()) {
    const weapons = (role.weaponClasses as string[] | undefined) ?? [];
    const armor = (role.armorWeights as string[] | undefined) ?? [];
    if (weapons.includes(cls) || armor.includes(cls)) return [];
  }
  return [{ path: 'class', message: `class "${cls}" is not a weapon class or armor weight of any role` }];
});
