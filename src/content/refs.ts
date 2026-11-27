import { CONTENT_GATED_REGISTRIES } from '../engine/bonds/content';
import { RESOLVER_SHAPES } from '../engine/memory/resolvers';
import { DILEMMA_CONTEXTS } from '../engine/dilemma/types';
import { dynamicAxis, dynamicAxisEntryId } from '../engine/development/axes';
import { ALL_EVENT_TYPES, INTERNAL_HISTORY_TYPES } from '../engine/relations/vocab';
import { TUNING } from '../engine/tuning';
import { VALUE_AXES } from '../engine/state/types';
import { COMMAND_STANCE_IDS, DESCRIBED_REGISTRIES, HUB_HOSTS, PLAN_OPEN_KINDS, type Conditions } from './schemas';
import { linkTargets } from './links';
import { REGISTRY_NAMES, type Entry, type RegistryName } from './types';

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
  if (typeof entry.requiresTrait === 'string') out.push({ registry: 'commanderTraits', id: entry.requiresTrait, path: 'requiresTrait' });
  if (typeof entry.stepDown === 'string') out.push({ registry: 'relationshipStates', id: entry.stepDown, path: 'stepDown' }); // P15
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
    if (fx.type === 'faction' && typeof fx.factionId === 'string' && fx.factionId !== 'own') out.push({ registry: 'corporations', id: fx.factionId, path: `${at}.factionId` });
    if (fx.type === 'clock' && typeof fx.clockId === 'string') out.push({ registry: 'clocks', id: fx.clockId, path: `${at}.clockId` });
    if (fx.type === 'flag' && typeof fx.flagId === 'string') {
      const flagId = fx.flagId;
      out.push({
        registry: 'flags', id: flagId, path: `${at}.flagId`,
        check: (t) => (t.scope === 'world' || t.scope === 'commander' ? null : `flag "${flagId}" has scope "${String(t.scope)}"; a world effect needs scope world or commander`),
      });
    }
    if (fx.type === 'loot' && typeof fx.tableId === 'string') out.push({ registry: 'lootTables', id: fx.tableId, path: `${at}.tableId` });
    if (fx.type === 'squad_secret' && typeof fx.kindId === 'string') out.push({ registry: 'secretKinds', id: fx.kindId, path: `${at}.kindId` });
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
  // P9e: a her-call's trigger stances and its outcomes' effects
  const her = entry.herCall as { trigger?: { stances?: unknown[] }; outcomes?: Array<{ effects?: unknown }> } | undefined;
  her?.trigger?.stances?.forEach((id, i) => out.push({ registry: 'commandStances', id: String(id), path: `herCall.trigger.stances[${i}]` }));
  her?.outcomes?.forEach((o, i) => worldEffectRefs(o.effects, `herCall.outcomes[${i}].effects`, out));
  // P7: check routes name roles and items
  (entry.fixed as { options?: Array<{ routeCheck?: { routes?: Array<Record<string, any>> } }> } | undefined)?.options?.forEach((o, i) => {
    o.routeCheck?.routes?.forEach((r, j) => {
      const at = `fixed.options[${i}].routeCheck.routes[${j}]`;
      if (r.kind === 'delegate') {
        (r.unitFilter?.roles as unknown[] | undefined)?.forEach((id, k) => out.push({ registry: 'roles', id: String(id), path: `${at}.unitFilter.roles[${k}]` }));
      } else if (r.kind === 'item' && typeof r.itemId === 'string') {
        out.push({ registry: 'items', id: r.itemId, path: `${at}.itemId` });
      }
    });
  });
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

// P7: image consistency names event types
registerRefs('imageConsistency', (entry) => {
  const out: Ref[] = [];
  for (const field of ['inImage', 'offImage'] as const) {
    (entry[field] as unknown[] | undefined)?.forEach((id, i) => out.push({ registry: 'eventDeltas', id: String(id), path: `${field}[${i}]` }));
  }
  return out;
});

// P7: traits name other traits, activities, event types and relationship states
registerRefs('commanderTraits', (entry) => {
  const out: Ref[] = [];
  (entry.exclusiveWith as unknown[] | undefined)?.forEach((id, i) => out.push({ registry: 'commanderTraits', id: String(id), path: `exclusiveWith[${i}]` }));
  (entry.effects as Array<Record<string, unknown>> | undefined)?.forEach((fx, i) => {
    const at = `effects[${i}]`;
    if ((fx.type === 'activity_cost' || fx.type === 'activity_relation') && typeof fx.activityId === 'string') {
      out.push({ registry: 'activities', id: fx.activityId, path: `${at}.activityId` });
    } else if (fx.type === 'relation_event_mult' && typeof fx.event === 'string') {
      out.push({ registry: 'eventDeltas', id: fx.event, path: `${at}.event` });
    } else if (fx.type === 'unlock_state' && typeof fx.stateId === 'string') {
      out.push({ registry: 'relationshipStates', id: fx.stateId, path: `${at}.stateId` });
    } else if (fx.type === 'unlock_order' && typeof fx.orderId === 'string') {
      out.push({ registry: 'orders', id: fx.orderId, path: `${at}.orderId` });
    } else if (fx.type === 'platonic_threshold' && Array.isArray(fx.states)) {
      fx.states.forEach((id, j) => out.push({ registry: 'relationshipStates', id: String(id), path: `${at}.states[${j}]` }));
    }
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

// P3b: a memory rule may only name what the resolver of its event returns (`engine/memory/resolvers.ts`). `{names}` is always
// available: the names of the rule's `about` group, unless the resolver sets its own.
const AUDIENCE_WORDS = ['present', 'squad', 'public'];
registerChecks('memoryRules', (entry) => {
  const out: RegistryCheck[] = [];
  const event = String(entry.event);
  const shape = RESOLVER_SHAPES[event];
  if (!shape) return [{ path: 'event', message: `memory rule "${entry.id}": no resolver for event "${event}"` }];
  const vars = [...shape.vars, 'names'];
  for (const m of String(entry.text).matchAll(/\{([A-Za-z0-9_]+)\}/g)) {
    if (!vars.includes(m[1])) out.push({ path: 'text', message: `memory rule "${entry.id}": text uses {${m[1]}}, which "${event}" does not provide (${vars.join(', ')})` });
  }
  for (const key of Object.keys((entry.when as Record<string, unknown> | undefined) ?? {})) {
    if (!shape.vars.includes(key) && !shape.ids.includes(key)) out.push({ path: `when.${key}`, message: `memory rule "${entry.id}": when key "${key}" is not a var or id group of "${event}"` });
  }
  if (entry.about !== 'world' && !shape.ids.includes(String(entry.about))) {
    out.push({ path: 'about', message: `memory rule "${entry.id}": about "${String(entry.about)}" is not "world" or an id group of "${event}" (${shape.ids.join(', ')})` });
  }
  const parts = Array.isArray(entry.audience) ? (entry.audience as unknown[]).map(String) : [String(entry.audience)];
  for (const part of parts) {
    if (!AUDIENCE_WORDS.includes(part) && !shape.ids.includes(part)) {
      out.push({ path: 'audience', message: `memory rule "${entry.id}": audience "${part}" is not present, squad, public or an id group of "${event}" (${shape.ids.join(', ')})` });
    }
  }
  return out;
});

const ALL_ARCHETYPES = ['frail', 'slight', 'average', 'fit', 'hardened'];
// P7: an archetype belongs to exactly one image group; the first group reports the ones that belong to none
registerChecks('imageConsistency', (entry, regs) => {
  const out: RegistryCheck[] = [];
  const groups = [...regs.imageConsistency.values()];
  (entry.archetypes as string[]).forEach((a, i) => {
    const owners = groups.filter((g) => (g.archetypes as string[]).includes(a));
    if (owners.length > 1) out.push({ path: `archetypes[${i}]`, message: `archetype "${a}" is in more than one group (${owners.map((g) => g.id).join(', ')})` });
  });
  if (groups[0]?.id === entry.id) {
    for (const a of ALL_ARCHETYPES) if (!groups.some((g) => (g.archetypes as string[]).includes(a))) out.push({ path: 'archetypes', message: `archetype "${a}" is in no group` });
  }
  return out;
});

registerChecks('items', (entry, regs) => {
  const cls = String(entry.class);
  for (const role of regs.roles.values()) {
    const weapons = (role.weaponClasses as string[] | undefined) ?? [];
    const armor = (role.armorWeights as string[] | undefined) ?? [];
    if (weapons.includes(cls) || armor.includes(cls)) return [];
  }
  return [{ path: 'class', message: `class "${cls}" is not a weapon class or armor weight of any role` }];
});

// ---------------------------------------------------------------------------------------------
// P8: world options, disposition levels, stance effects and presets

interface RawChoice { id: string; lore?: string; effects?: Array<Record<string, unknown>> }
const choicesOf = (entry: Entry): RawChoice[] => (Array.isArray(entry.choices) ? (entry.choices as RawChoice[]) : []);

registerRefs('worldOptions', (entry) => {
  const out: Ref[] = [];
  choicesOf(entry).forEach((c, i) => c.effects?.forEach((fx, j) => {
    if (fx.type === 'disposition' && typeof fx.levelId === 'string') {
      out.push({ registry: 'dispositionLevels', id: fx.levelId, path: `choices[${i}].effects[${j}].levelId` });
    }
  }));
  return out;
});

registerRefs('dispositionLevels', (entry) => {
  const states = (entry.mutiny as { states?: unknown[] } | undefined)?.states;
  return (states ?? []).map((id, i) => ({ registry: 'relationshipStates' as const, id: String(id), path: `mutiny.states[${i}]` }));
});

registerRefs('stanceEffects', (entry) => {
  const out: Ref[] = [];
  if (typeof entry.option === 'string') {
    out.push({
      registry: 'worldOptions', id: entry.option, path: 'option',
      check: (t) => (t.squadStance === true ? null : `option "${t.id}" does not set a squad stance (squadStance is not true)`),
    });
  }
  (entry.effects as Array<Record<string, unknown>> | undefined)?.forEach((fx, i) => {
    if (fx.type === 'event_stress' && Array.isArray(fx.events)) {
      fx.events.forEach((id, j) => out.push({ registry: 'eventDeltas', id: String(id), path: `effects[${i}].events[${j}]` }));
    }
  });
  return out;
});

const worldOptionIds = (regs: Record<RegistryName, Map<string, Entry>>) => [...regs.worldOptions.keys()];
const enabledFamilies = (regs: Record<RegistryName, Map<string, Entry>>): Set<string> => {
  const out = new Set<string>();
  for (const o of regs.worldOptions.values()) {
    for (const c of choicesOf(o)) for (const fx of c.effects ?? []) if (fx.type === 'enable_family' && typeof fx.family === 'string') out.add(fx.family);
  }
  return out;
};

registerChecks('worldOptions', (entry, regs) => {
  const out: RegistryCheck[] = [];
  const choices = choicesOf(entry);
  if (!choices.some((c) => c.id === entry.default)) {
    out.push({ path: 'default', message: `default "${String(entry.default)}" is not one of the choices of "${entry.id}"` });
  }
  const ids = choices.map((c) => c.id);
  ids.forEach((id, i) => {
    if (ids.indexOf(id) !== i) out.push({ path: `choices[${i}].id`, message: `duplicate choice id "${id}"` });
  });
  // exactly one option carries the disposition choices
  const carriers = [...regs.worldOptions.values()].filter((o) => choicesOf(o).some((c) => c.effects?.some((fx) => fx.type === 'disposition')));
  const first = [...regs.worldOptions.values()][0];
  if (carriers.length === 0 && first?.id === entry.id) {
    out.push({ path: 'choices', message: 'disposition effects must appear on exactly one option, none carries them' });
  }
  if (carriers.length > 1 && carriers.some((o) => o.id === entry.id) && carriers[0].id !== entry.id) {
    out.push({ path: 'choices', message: `disposition effects must appear on exactly one option ("${carriers[0].id}" already carries them)` });
  }
  // the WORLD SETTINGS block holds the longest lore line of each option
  if (first?.id === entry.id) {
    const chars = [...regs.worldOptions.values()].reduce((sum, o) => sum + Math.max(0, ...choicesOf(o).map((c) => (c.lore ?? '').length)), 0);
    const tokens = Math.ceil(chars / 4);
    if (tokens > TUNING.disposition.worldBlockTokens) {
      out.push({ path: 'choices', message: `the longest lore lines add up to about ${tokens} tokens, over the ${TUNING.disposition.worldBlockTokens} tokens of the WORLD SETTINGS block` });
    }
  }
  return out;
});

registerChecks('dispositionLevels', (entry, regs) => {
  const out: RegistryCheck[] = [];
  const levels = [...regs.dispositionLevels.values()];
  const sameRank = levels.filter((l) => l.rank === entry.rank);
  if (sameRank.length > 1 && sameRank[0].id !== entry.id) {
    out.push({ path: 'rank', message: `rank ${String(entry.rank)} is already used by level "${sameRank[0].id}"` });
  }
  if (levels[0]?.id === entry.id) {
    for (let r = 1; r <= 5; r++) if (!levels.some((l) => l.rank === r)) out.push({ path: 'rank', message: `no level has rank ${r} (ranks 1 to 5 are needed)` });
  }
  return out;
});

registerChecks('demandTemplates', (entry, regs) => {
  const out: RegistryCheck[] = [];
  const cond = (entry.conditions ?? {}) as { statesAny?: string[]; flagsNone?: string[] };
  for (const id of cond.statesAny ?? []) if (!regs.relationshipStates.has(id)) out.push({ path: 'conditions.statesAny', message: `unknown relationship state "${id}"` });
  for (const id of cond.flagsNone ?? []) if (!regs.flags.has(id)) out.push({ path: 'conditions.flagsNone', message: `unknown flag "${id}"` });
  ((entry.grantCost ?? []) as Array<{ type: string; flagId?: string }>).forEach((c, i) => {
    if (c.type === 'relation_flag' && c.flagId !== undefined && !regs.flags.has(c.flagId)) out.push({ path: `grantCost[${i}].flagId`, message: `unknown flag "${c.flagId}"` });
  });
  return out;
});

registerChecks('commandStances', (entry, regs) => {
  const first = [...regs.commandStances.values()][0];
  if (first?.id !== entry.id) return [];
  return COMMAND_STANCE_IDS.filter((id) => !regs.commandStances.has(id)).map((id) => ({ path: 'id', message: `no command stance "${id}" (all of them are needed: ${COMMAND_STANCE_IDS.join(', ')})` }));
});

registerChecks('worldPresets', (entry, regs) => {
  const out: RegistryCheck[] = [];
  const chosen = (entry.choices ?? {}) as Record<string, string>;
  for (const optionId of worldOptionIds(regs)) {
    if (!(optionId in chosen)) out.push({ path: 'choices', message: `preset "${entry.id}" does not name option "${optionId}"` });
  }
  for (const [optionId, choiceId] of Object.entries(chosen)) {
    const option = regs.worldOptions.get(optionId);
    if (!option) out.push({ path: `choices.${optionId}`, message: `preset names unknown option "${optionId}"` });
    else if (!choicesOf(option).some((c) => c.id === choiceId)) {
      out.push({ path: `choices.${optionId}`, message: `"${choiceId}" is not a choice of option "${optionId}"` });
    }
  }
  return out;
});

// an entry with a `family` exists only while some world choice enables it, so an unreachable family is a content error
for (const registry of ['clocks', 'missionTemplates', 'dilemmaTemplates'] as const) {
  registerChecks(registry, (entry, regs) =>
    typeof entry.family === 'string' && !enabledFamilies(regs).has(entry.family)
      ? [{ path: 'family', message: `family "${entry.family}" is not enabled by any world option choice (enable_family)` }]
      : []);
}

// ---------------------------------------------------------------------------------------------
// P10: hub rooms name a location, a facility, activities; the four hosts each sit in one room

registerRefs('hubRooms', (entry) => {
  const out: Ref[] = [];
  if (typeof entry.sceneLocationId === 'string') out.push({ registry: 'locations', id: entry.sceneLocationId, path: 'sceneLocationId' });
  if (typeof entry.facilityId === 'string') out.push({ registry: 'facilities', id: entry.facilityId, path: 'facilityId' });
  (entry.activityIds as unknown[] | undefined)?.forEach((id, i) => out.push({ registry: 'activities', id: String(id), path: `activityIds[${i}]` }));
  return out;
});

registerChecks('hubRooms', (entry, regs) => {
  const out: RegistryCheck[] = [];
  const rooms = [...regs.hubRooms.values()];
  const hostsOf = (e: Entry) => ((e.hosts ?? []) as string[]);
  ((entry.hosts ?? []) as string[]).forEach((host, i) => {
    const others = rooms.filter((r) => r.id !== entry.id && hostsOf(r).includes(host));
    if (others.length > 0) out.push({ path: `hosts[${i}]`, message: `"${host}" is hosted by more than one room (also ${others.map((r) => `"${r.id}"`).join(', ')})` });
  });
  // the registry-wide rule is reported once, on the first room
  if (rooms[0]?.id === entry.id) {
    for (const host of HUB_HOSTS) {
      if (!rooms.some((r) => hostsOf(r).includes(host))) out.push({ path: 'hosts', message: `no room hosts "${host}" (all of ${HUB_HOSTS.join(', ')} are needed)` });
    }
  }
  return out;
});

// P10d: plan rooms point at hub rooms and locations; every hub room is on the plan; closed rooms do not overlap;
// a commander cell has a commander cabin
registerRefs('planRooms', (entry) => {
  const out: Ref[] = [];
  if (typeof entry.hubRoomId === 'string') out.push({ registry: 'hubRooms', id: entry.hubRoomId, path: 'hubRoomId' });
  if (typeof entry.sceneLocationId === 'string') out.push({ registry: 'locations', id: entry.sceneLocationId, path: 'sceneLocationId' });
  return out;
});

registerChecks('planRooms', (entry, regs) => {
  const out: RegistryCheck[] = [];
  const all = [...regs.planRooms.values()];
  type R = { x: number; y: number; w: number; h: number };
  const free = (e: Entry): boolean => (PLAN_OPEN_KINDS as readonly string[]).includes(String(e.kind)) || e.kind === 'stair';
  const r = entry.rect as R;
  for (const other of all) {
    if (other.id === entry.id || other.floor !== entry.floor || free(entry) || free(other)) continue;
    const o = other.rect as R;
    if (r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h) {
      out.push({ path: 'rect', message: `overlaps "${String(other.id)}" on the ${String(entry.floor)} floor (only corridors, lobbies and stairs may overlap)` });
    }
  }
  if (all[0]?.id === entry.id) {
    for (const hub of regs.hubRooms.values()) {
      if (!all.some((p) => p.hubRoomId === hub.id)) out.push({ path: 'hubRoomId', message: `hub room "${String(hub.id)}" has no plan room (it would never be drawn)` });
    }
    const cell = [...regs.hubRooms.values()].find((h) => h.commanderCell === true);
    const cmdr = all.filter((p) => p.cabin === 'commander');
    if (cell && cmdr.length === 0) {
      out.push({ path: 'cabin', message: 'a hub room is the commander cell but no plan room is the commander cabin (cabin: "commander")' });
    }
    for (const c of cmdr) {
      if (cell && c.hubRoomId !== cell.id) out.push({ path: 'hubRoomId', message: `the commander cabin "${String(c.id)}" must belong to the commander cell "${String(cell.id)}" (its notes are reached there)` });
    }
    // every soldier the barracks can hold has a cabin of her own (read by the effect, not by facility id)
    const capacity = Math.max(0, ...[...regs.facilities.values()].flatMap((f) => ((f.levels ?? []) as Array<{ effects?: { rosterCapacity?: number } }>)
      .map((l) => l.effects?.rosterCapacity ?? 0)));
    const cabins = all.filter((p) => p.cabin === 'unit').length;
    if (cabins > 0 && cabins < capacity) {
      out.push({ path: 'cabin', message: `${cabins} unit cabins for a roster of up to ${capacity}: soldiers would share (add cabins or lower the capacity)` });
    }
  }
  return out;
});

// P10: device skins bind to a corporation, a trait or a flag; the fallback skin must exist
registerRefs('deviceSkins', (entry) => {
  const out: Ref[] = [];
  const bind = (entry.bindTo ?? {}) as { corporationId?: string; traitId?: string; unlockFlag?: string };
  if (typeof bind.corporationId === 'string') out.push({ registry: 'corporations', id: bind.corporationId, path: 'bindTo.corporationId' });
  if (typeof bind.traitId === 'string') out.push({ registry: 'commanderTraits', id: bind.traitId, path: 'bindTo.traitId' });
  if (typeof bind.unlockFlag === 'string') out.push({ registry: 'flags', id: bind.unlockFlag, path: 'bindTo.unlockFlag' });
  return out;
});

registerChecks('deviceSkins', (entry, regs) => {
  const first = [...regs.deviceSkins.values()][0];
  return first?.id === entry.id && !regs.deviceSkins.has('ccp_standard')
    ? [{ path: 'id', message: 'no skin "ccp_standard" (the fallback skin is needed whenever a pack ships skins)' }]
    : [];
});

// ---------------------------------------------------------------------------------------------
// P11: prologues name a start, templates, a region, locations, glossary entries and night events; unlock rows name steps

interface StepRefs {
  expeditionId?: unknown; regionId?: unknown; locationId?: unknown;
  hints?: Array<{ glossaryId?: unknown }>; nightKnock?: { ignore?: { event?: unknown } };
}

registerRefs('prologues', (entry) => {
  const out: Ref[] = [];
  if (typeof entry.startId === 'string') out.push({ registry: 'starts', id: entry.startId, path: 'startId' });
  for (const [stepId, step] of Object.entries((entry.steps ?? {}) as Record<string, StepRefs>)) {
    const at = `steps.${stepId}`;
    if (typeof step.expeditionId === 'string') out.push({ registry: 'missionTemplates', id: step.expeditionId, path: `${at}.expeditionId` });
    if (typeof step.regionId === 'string') out.push({ registry: 'regions', id: step.regionId, path: `${at}.regionId` });
    if (typeof step.locationId === 'string') out.push({ registry: 'locations', id: step.locationId, path: `${at}.locationId` });
    step.hints?.forEach((h, i) => {
      if (typeof h.glossaryId === 'string') out.push({ registry: 'glossary', id: h.glossaryId, path: `${at}.hints[${i}].glossaryId` });
    });
    if (typeof step.nightKnock?.ignore?.event === 'string') out.push({ registry: 'eventDeltas', id: step.nightKnock.ignore.event, path: `${at}.nightKnock.ignore.event` });
  }
  return out;
});

// an `afterStep` must be a step of every prologue, or a unit could never open the tab for some start
registerChecks('uiUnlocks', (entry, regs) => {
  const step = (entry.condition as { afterStep?: unknown } | undefined)?.afterStep;
  if (typeof step !== 'string') return [];
  return [...regs.prologues.values()]
    .filter((p) => !(step in ((p.steps ?? {}) as Record<string, unknown>)))
    .map((p) => ({ path: 'condition.afterStep', message: `afterStep "${step}" is not a step of prologue "${p.id}"` }));
});

// a fixed map names node types (never the objective, which the map adds itself) and event templates that fit an expedition
registerRefs('missionTemplates', (entry) => {
  const out: Ref[] = [];
  const layers = (entry.fixedMap as { layers?: Array<Array<{ type?: unknown; eventId?: unknown }>> } | undefined)?.layers;
  layers?.forEach((layer, l) => layer.forEach((node, n) => {
    const at = `fixedMap.layers[${l}][${n}]`;
    if (typeof node.type === 'string') {
      const type = node.type;
      out.push({
        registry: 'nodeTypes', id: type, path: `${at}.type`,
        check: (t) => (t.kind === 'objective' ? `node type "${type}" has kind "objective"; the map adds the objective node itself` : null),
      });
    }
    if (typeof node.eventId === 'string') {
      const eventId = node.eventId;
      out.push({
        registry: 'dilemmaTemplates', id: eventId, path: `${at}.eventId`,
        check: (t) => ((t.contexts as string[]).includes('expedition_event') ? null : `dilemma template "${eventId}" is not an expedition_event`),
      });
    }
  }));
  return out;
});

// ---------------------------------------------------------------------------------------------
// P7a: glossary entries and `[[links]]` in descriptions

/** What a link target points at: a registry entry, nothing to check (`setting:`), or an unknown source. */
type LinkResolution = { registry: RegistryName; id: string } | { registry: null; unchecked: true } | { registry: null; unknown: string };

export function resolveLink(target: string): LinkResolution {
  const i = target.indexOf(':');
  if (i < 0) return { registry: 'glossary', id: target };
  const source = target.slice(0, i);
  const id = target.slice(i + 1);
  if (source === 'setting') return { registry: null, unchecked: true };
  if ((REGISTRY_NAMES as readonly string[]).includes(source)) return { registry: source as RegistryName, id };
  return { registry: null, unknown: source };
}

/** Every link target in the text fields of an entry, with the path of the field. */
function textLinks(registry: RegistryName, entry: Entry): Array<{ path: string; target: string }> {
  const out: Array<{ path: string; target: string }> = [];
  const scan = (field: string) => {
    const v = entry[field];
    if (typeof v === 'string') for (const target of linkTargets(v)) out.push({ path: field, target });
  };
  scan('description');
  if (registry === 'glossary') {
    scan('short');
    scan('long');
    if (Array.isArray(entry.see)) {
      entry.see.forEach((id, i) => out.push({ path: `see[${i}]`, target: String(id) }));
    }
  }
  return out;
}

for (const registry of ['glossary', ...DESCRIBED_REGISTRIES] as RegistryName[]) {
  registerRefs(registry, (entry) =>
    textLinks(registry, entry).flatMap(({ path, target }) => {
      const r = resolveLink(target);
      return r.registry === null ? [] : [{ registry: r.registry, id: r.id, path }];
    }));
  registerChecks(registry, (entry) =>
    textLinks(registry, entry).flatMap(({ path, target }) => {
      const r = resolveLink(target);
      return 'unknown' in r ? [{ path, message: `unknown source "${r.unknown}" in link "${target}"` }] : [];
    }));
}

// ---------------------------------------------------------------------------------------------
// P9d: `contentTags` belong to the gated registries (and to the night specs of defects and relationship states) and name
// registered content categories

registerChecks('defects', (entry, regs) => nightTagChecks('nightEvents', entry.nightEvents, regs));
registerChecks('relationshipStates', (entry, regs) => nightTagChecks('unlocks.nightEvents', (entry.unlocks as { nightEvents?: unknown } | undefined)?.nightEvents, regs));
// P15 (R17): a step down stays in romance and never names the state itself
registerChecks('relationshipStates', (entry, regs) => {
  if (typeof entry.stepDown !== 'string') return [];
  const target = regs.relationshipStates.get(entry.stepDown);
  if (target === undefined) return []; // the ref check says so
  if (entry.stepDown === entry.id) return [{ path: 'stepDown', message: 'a step down cannot name its own state' }];
  return target.romance === true && entry.romance === true ? [] : [{ path: 'stepDown', message: 'a step down must stay in romance' }];
});

function nightTagChecks(path: string, specs: unknown, regs: Record<RegistryName, Map<string, Entry>>): RegistryCheck[] {
  if (!Array.isArray(specs)) return [];
  return specs.flatMap((spec, i) => tagChecks(`${path}[${i}].contentTags`, (spec as { contentTags?: unknown })?.contentTags, regs));
}

function tagChecks(path: string, tags: unknown, regs: Record<RegistryName, Map<string, Entry>>): RegistryCheck[] {
  if (!Array.isArray(tags)) return [];
  return tags.filter((t) => !regs.contentCategories.has(String(t))).map((t) => ({ path, message: `unknown content category "${String(t)}"` }));
}

// P15a: a content category's `requires` names known categories and never loops back to itself
registerChecks('contentCategories', (entry, regs) => {
  const requires = entry.requires;
  if (!Array.isArray(requires)) return [];
  const out: RegistryCheck[] = requires.filter((r) => !regs.contentCategories.has(String(r))).map((r) => ({ path: 'requires', message: `requires: unknown content category "${String(r)}"` }));
  const seen = new Set<string>();
  const stack = requires.map(String);
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === String(entry.id)) {
      out.push({ path: 'requires', message: `requires: cycle through "${id}"` });
      break;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    const next = regs.contentCategories.get(id)?.requires;
    if (Array.isArray(next)) stack.push(...next.map(String));
  }
  return out;
});

for (const registry of REGISTRY_NAMES) {
  registerChecks(registry, (entry, regs) => {
    if (entry.contentTags === undefined) return [];
    // P15: a sign of the dynamic names the category it comes from (territory marking); the producer is the gate, so the registry is not gated
    if (!(CONTENT_GATED_REGISTRIES as readonly string[]).includes(registry) && registry !== 'dynamicSigns') {
      return [{ path: 'contentTags', message: `contentTags is not allowed on ${registry} (only on ${CONTENT_GATED_REGISTRIES.join(', ')})` }];
    }
    return tagChecks('contentTags', entry.contentTags, regs);
  });
}

// P9c: a device-access rule's `states` name relationship states, and there is exactly one rule per level 1 to 4.
registerRefs('deviceAccessRules', (entry) => {
  const out: Ref[] = [];
  const anyOf = entry.anyOf as Array<{ states?: string[] }> | undefined;
  anyOf?.forEach((b, i) => b.states?.forEach((id, j) => out.push({ registry: 'relationshipStates', id, path: `anyOf[${i}].states[${j}]` })));
  return out;
});

registerChecks('deviceAccessRules', (entry, regs) => {
  const twin = [...regs.deviceAccessRules.values()].find((o) => o.level === entry.level && String(o.id) < String(entry.id));
  return twin ? [{ path: 'level', message: `level ${String(entry.level)} already has the rule "${String(twin.id)}"` }] : [];
});

// P10b: a DM behaviour's `states` are relationship states.
registerRefs('dmBehaviours', (entry) =>
  ((entry.when as { states?: string[] } | undefined)?.states ?? []).map((id, i) => ({ registry: 'relationshipStates' as const, id, path: `when.states[${i}]` })));

// P10b: a hand note's `states` are relationship states.
registerRefs('handNotes', (entry) =>
  ((entry.when as { states?: string[] } | undefined)?.states ?? []).map((id, i) => ({ registry: 'relationshipStates' as const, id, path: `when.states[${i}]` })));

// P10e-e: a card voice row's `style` is a practice style.
registerRefs('cardVoice', (entry) =>
  typeof entry.style === 'string' ? [{ registry: 'practiceStyles' as const, id: entry.style, path: 'style' }] : []);

// P9c: a booking kind names the location of its scene.
registerRefs('bookingKinds', (entry) =>
  typeof entry.locationId === 'string' ? [{ registry: 'locations' as const, id: entry.locationId, path: 'locationId' }] : []);

// ---------------------------------------------------------------------------------------------
// P11b: a head start moment's event row is an `eventDeltas` entry; its value requirements name value axes

registerRefs('headStartMoments', (entry) => {
  const delta = entry.eventDelta as { type?: unknown } | undefined;
  return [
    ...(typeof delta?.type === 'string' ? [{ registry: 'eventDeltas' as const, id: delta.type, path: 'eventDelta.type' }] : []),
    ...(typeof entry.axis === 'string' ? [{ registry: 'probeAxes' as const, id: entry.axis, path: 'axis' }] : []), // P15: a probe moment shows one of the probe axes
  ];
});

registerChecks('headStartMoments', (entry) => {
  const values = ((entry.requires as { values?: Record<string, unknown> } | undefined)?.values ?? {});
  return Object.keys(values)
    .filter((axis) => !(VALUE_AXES as readonly string[]).includes(axis))
    .map((axis) => ({ path: `requires.values.${axis}`, message: `head start moment "${entry.id}": "${axis}" is not a value axis (${VALUE_AXES.join(', ')})` }));
});

// ---------------------------------------------------------------------------------------------
// P14b: character development. A rule's push names an axis the `developmentAxes` registry words (exact, or the kind's wildcard `<kind>:.any`;
// `like:{tag}` takes the event's tags); `match.kind` names event types, activities or dilemma contexts; a habit's counter and
// effect name activities and regions.

const axisKeyKinds = ['value', 'bond', 'taste', 'like', 'dislike', 'practice', 'expect', 'manner'];
function axisKeyProblem(key: string, regs: Record<RegistryName, Map<string, Entry>>, allowTag: boolean): string | null {
  if (allowTag && (key === 'like:{tag}' || key === 'dislike:{tag}')) return regs.developmentAxes.has(`${key.split(':')[0]}:.any`) ? null : `no axis entry words "${key}"`;
  const i = key.indexOf(':');
  const kind = i > 0 ? key.slice(0, i) : '';
  if (!axisKeyKinds.includes(kind)) return `"${key}" is not an axis key (value:…, bond:…, taste:…, like:…, dislike:…)`;
  if (kind === 'taste' && !regs.tastes.has(key.slice(i + 1))) return `"${key}" names no taste`;
  if (kind === 'practice' || kind === 'expect') {
    // P15: a practice or expectation axis names a content category or a worship target that exists, and an entry words it
    const d = dynamicAxis(key);
    if (d === null || d.field === 'fixed') return `"${key}" is not a practice or expectation axis (practice:<category>.as, practice:<category>.witness, practice:style.secondary, expect:holds_until, expect:worship.<target>)`;
    if ((d.field === 'as' || d.field === 'witness') && !regs.contentCategories.has(d.category)) return `"${key}" names no content category`;
    if (d.field === 'worship' && !regs.worshipTargets.has(d.target)) return `"${key}" names no worship target`;
    return regs.developmentAxes.has(dynamicAxisEntryId(d)!) ? null : `no axis entry words "${key}"`;
  }
  if (!regs.developmentAxes.has(key) && !regs.developmentAxes.has(`${kind}:.any`)) return `no axis entry words "${key}"`;
  return null;
}

registerChecks('developmentRules', (entry, regs) => {
  const out: RegistryCheck[] = [];
  const push = (entry.push as Array<{ axis?: unknown }> | undefined) ?? [];
  push.forEach((p, i) => {
    const problem = typeof p.axis === 'string' ? axisKeyProblem(p.axis, regs, true) : 'the axis must be a string';
    if (problem) out.push({ path: `push[${i}].axis`, message: problem });
  });
  const kinds = (entry.match as { kind?: string[] } | undefined)?.kind ?? [];
  kinds.forEach((k, i) => {
    let ok: boolean;
    if (k.startsWith('activity:')) ok = k === 'activity:*' || regs.activities.has(k.slice('activity:'.length));
    else if (k.startsWith('dilemma:')) ok = (DILEMMA_CONTEXTS as readonly string[]).includes(k.slice('dilemma:'.length));
    else ok = (ALL_EVENT_TYPES as readonly string[]).includes(k);
    if (!ok) out.push({ path: `match.kind[${i}]`, message: `"${k}" is neither an event type, an activity (activity:<id> or activity:*) nor a dilemma context (dilemma:<context>)` });
  });
  return out;
});

registerChecks('habits', (entry, regs) => {
  const out: RegistryCheck[] = [];
  const counter = entry.counter as { kind?: string; id?: string } | undefined;
  if (counter?.id !== undefined) {
    if (counter.kind === 'activity' && !regs.activities.has(counter.id)) out.push({ path: 'counter.id', message: `unknown activity "${counter.id}"` });
    else if (counter.kind === 'region' && !regs.regions.has(counter.id)) out.push({ path: 'counter.id', message: `unknown region "${counter.id}"` });
    else if (counter.kind === 'companion') out.push({ path: 'counter.id', message: 'a companion habit counts every companion; it names none' });
    else if (counter.kind === 'meeting' || counter.kind === 'run') out.push({ path: 'counter.id', message: `a ${counter.kind} habit counts every ${counter.kind === 'meeting' ? 'quiet meeting with the commander' : 'run in the party'}; it names none` });
  }
  const fx = entry.effect as { activityId?: string } | undefined;
  if (fx && !regs.activities.has(String(fx.activityId))) out.push({ path: 'effect.activityId', message: `unknown activity "${String(fx.activityId)}"` });
  return out;
});

// ---------------------------------------------------------------------------------------------
// P14c: her life. A life event's conditions and `becomes` name hobbies, topics, locations, activities, defect categories and other life
// events; a hobby has four milestones, places she can practise (one hosted by a hub room) and the traces it leaves; a topic's triggers name
// locations, activities and life events; a pastime names locations and a hobby; the habit counter `joke` counts jokes, not an id.

interface LifeRegs { regs: Record<RegistryName, Map<string, Entry>> }
const lifeCheck = (path: string, registry: RegistryName, id: unknown, { regs }: LifeRegs, label: string): RegistryCheck[] =>
  typeof id === 'string' && !regs[registry].has(id) ? [{ path, message: `unknown ${label} "${id}"` }] : [];

registerChecks('lifeEvents', (entry, regs) => {
  const out: RegistryCheck[] = [];
  const r = (entry.requires ?? {}) as { hobby?: string; location?: string[]; activity?: string[]; defectCategory?: string; afterEvent?: string; otherHadThisWeek?: string };
  const b = (entry.becomes ?? {}) as { hobby?: string; opinionTopic?: string };
  const ctx = { regs };
  if (r.hobby !== undefined && r.hobby !== 'any') out.push(...lifeCheck('requires.hobby', 'hobbies', r.hobby, ctx, 'hobby'));
  (r.location ?? []).forEach((id, i) => out.push(...lifeCheck(`requires.location[${i}]`, 'locations', id, ctx, 'location')));
  (r.activity ?? []).forEach((id, i) => out.push(...lifeCheck(`requires.activity[${i}]`, 'activities', id, ctx, 'activity')));
  if (r.defectCategory !== undefined && ![...regs.defects.values()].some((d) => d.category === r.defectCategory)) out.push({ path: 'requires.defectCategory', message: `no defect has the category "${r.defectCategory}"` });
  out.push(...lifeCheck('requires.afterEvent', 'lifeEvents', r.afterEvent, ctx, 'life event'));
  out.push(...lifeCheck('requires.otherHadThisWeek', 'lifeEvents', r.otherHadThisWeek, ctx, 'life event'));
  out.push(...lifeCheck('becomes.hobby', 'hobbies', b.hobby, ctx, 'hobby'));
  out.push(...lifeCheck('becomes.opinionTopic', 'opinionTopics', b.opinionTopic, ctx, 'opinion topic'));
  return out;
});

registerChecks('hobbies', (entry, regs) => {
  const out: RegistryCheck[] = [];
  const ctx = { regs };
  const locations = (entry.locations as string[] | undefined) ?? [];
  locations.forEach((id, i) => out.push(...lifeCheck(`locations[${i}]`, 'locations', id, ctx, 'location')));
  const hosted = new Set([...regs.hubRooms.values()].map((room) => room.sceneLocationId));
  if (locations.length > 0 && !locations.some((id) => hosted.has(id))) out.push({ path: 'locations', message: `hobby "${entry.id}" needs at least one location hosted by a hub room (she practises where she spends her slots)` });
  const milestones = (entry.milestones as Array<{ id: string; trace?: string }> | undefined) ?? [];
  if (milestones.length !== 4) out.push({ path: 'milestones', message: `hobby "${entry.id}" needs exactly 4 milestones (has ${milestones.length})` });
  const ids = new Set<string>();
  milestones.forEach((m, i) => {
    if (ids.has(m.id)) out.push({ path: `milestones[${i}].id`, message: `milestone id "${m.id}" is used twice` });
    ids.add(m.id);
    if (m.trace === 'opinion' && entry.opinionTopic === undefined) out.push({ path: `milestones[${i}].trace`, message: 'an opinion trace needs the hobby\'s opinionTopic' });
    if ((m.trace === 'note' || m.trace === 'prop') && entry.traceText === undefined) out.push({ path: `milestones[${i}].trace`, message: `a ${m.trace} trace needs the hobby's traceText` });
  });
  out.push(...lifeCheck('opinionTopic', 'opinionTopics', entry.opinionTopic, ctx, 'opinion topic'));
  return out;
});

registerChecks('opinionTopics', (entry, regs) => {
  const out: RegistryCheck[] = [];
  const ctx = { regs };
  const t = (entry.triggers ?? {}) as { locations?: string[]; activities?: string[]; lifeEvents?: string[] };
  (t.locations ?? []).forEach((id, i) => out.push(...lifeCheck(`triggers.locations[${i}]`, 'locations', id, ctx, 'location')));
  (t.activities ?? []).forEach((id, i) => out.push(...lifeCheck(`triggers.activities[${i}]`, 'activities', id, ctx, 'activity')));
  (t.lifeEvents ?? []).forEach((id, i) => out.push(...lifeCheck(`triggers.lifeEvents[${i}]`, 'lifeEvents', id, ctx, 'life event')));
  const n = ((entry.positions as unknown[] | undefined) ?? []).length;
  if (entry.axis !== undefined && n < 3) out.push({ path: 'positions', message: `topic "${entry.id}" has an axis and needs at least 3 positions (has ${n})` });
  return out;
});

registerChecks('pastimes', (entry, regs) => {
  const out: RegistryCheck[] = [];
  const ctx = { regs };
  ((entry.locations as string[] | undefined) ?? []).forEach((id, i) => out.push(...lifeCheck(`locations[${i}]`, 'locations', id, ctx, 'location')));
  out.push(...lifeCheck('requires.hobby', 'hobbies', (entry.requires as { hobby?: string } | undefined)?.hobby, ctx, 'hobby'));
  return out;
});

// the running joke habit counts jokes (`joke:<fact id>`), which no id names
registerChecks('habits', (entry) => {
  const counter = entry.counter as { kind?: string; id?: string } | undefined;
  return counter?.kind === 'joke' && counter.id !== undefined ? [{ path: 'counter.id', message: 'a joke habit counts every running joke; it names none' }] : [];
});

// ---------------------------------------------------------------------------------------------
// P15a: the scene blocking, moment and physics registries point at each other by id (never by position). Every name must exist, a furniture
// anchor needs an affordance some plan room has, and the P14c hand-offs hold (below).

type Regs = Record<RegistryName, Map<string, Entry>>;
const known = (regs: Regs, registry: RegistryName, id: unknown, path: string, label: string): RegistryCheck[] =>
  typeof id === 'string' && !regs[registry].has(id) ? [{ path, message: `unknown ${label} "${id}"` }] : [];
const knownEach = (regs: Regs, registry: RegistryName, ids: unknown, path: string, label: string): RegistryCheck[] =>
  Array.isArray(ids) ? ids.flatMap((id, i) => known(regs, registry, id, `${path}[${i}]`, label)) : [];
const planAffordances = (regs: Regs): Set<string> => new Set([...regs.planRooms.values()].flatMap((r) => (Array.isArray(r.affordances) ? r.affordances.map(String) : [])));
const affordanceChecks = (regs: Regs, list: unknown, path: string): RegistryCheck[] => {
  const have = planAffordances(regs);
  return Array.isArray(list) ? list.filter((a) => !have.has(String(a))).map((a, i) => ({ path: `${path}[${i}]`, message: `no plan room offers the affordance "${String(a)}"` })) : [];
};

/** The names an entry's effects point at. */
function effectChecks(entry: Entry, regs: Regs): RegistryCheck[] {
  const effects = Array.isArray(entry.effects) ? (entry.effects as Array<Record<string, unknown>>) : [];
  return effects.flatMap((fx, i) => {
    const at = `effects[${i}]`;
    switch (fx.type) {
      case 'physics': return known(regs, 'contactPhysics', fx.id, `${at}.id`, 'contact physics');
      case 'sound': return known(regs, 'uiSounds', fx.id, `${at}.id`, 'UI sound');
      case 'status_after': return known(regs, 'commanderConditions', fx.id, `${at}.id`, 'commander condition');
      case 'escalation': return known(regs, 'escalationVerbs', fx.verb, `${at}.verb`, 'escalation verb');
      case 'visibility': return knownEach(regs, 'blockingPostures', fx.unlessPosture, `${at}.unlessPosture`, 'posture');
      case 'rule': return known(regs, 'relationshipRuleTemplates', fx.template, `${at}.template`, 'rule template'); // P16: the rule a worn item brings (the chastity device's permission rule)
      default: return [];
    }
  });
}

const physicsLinkChecks = (entry: Entry, regs: Regs): RegistryCheck[] =>
  Array.isArray(entry.physics) ? (entry.physics as Array<{ id?: unknown }>).flatMap((p, i) => known(regs, 'contactPhysics', p.id, `physics[${i}].id`, 'contact physics')) : [];
const sourceChecks = (entry: Entry, regs: Regs): RegistryCheck[] =>
  entry.sources !== null && typeof entry.sources === 'object' ? Object.keys(entry.sources).flatMap((id) => known(regs, 'momentSources', id, `sources.${id}`, 'moment source')) : [];

registerChecks('worshipTargets', (entry, regs) => knownEach(regs, 'stimulusKinds', entry.stimuli, 'stimuli', 'stimulus kind'));
registerChecks('blockingPostures', effectChecks);
registerChecks('blockingAnchors', (entry, regs) => [...affordanceChecks(regs, (entry.requires as { affordances?: unknown } | undefined)?.affordances, 'requires.affordances'), ...effectChecks(entry, regs)]);
registerChecks('blockingContacts', (entry, regs) => {
  const implies = (entry.implies ?? {}) as { actor?: { posture?: string; anchor?: string }; receiver?: { posture?: string; anchor?: string } };
  const out: RegistryCheck[] = [];
  for (const who of ['actor', 'receiver'] as const) {
    out.push(...known(regs, 'blockingPostures', implies[who]?.posture, `implies.${who}.posture`, 'posture'));
    out.push(...known(regs, 'blockingAnchors', implies[who]?.anchor, `implies.${who}.anchor`, 'anchor'));
  }
  out.push(...knownEach(regs, 'worshipTargets', entry.target, 'target', 'worship target'));
  out.push(...knownEach(regs, 'stimulusKinds', entry.stimuli, 'stimuli', 'stimulus kind'));
  out.push(...affordanceChecks(regs, (entry.requires as { affordances?: unknown } | undefined)?.affordances, 'requires.affordances'));
  return [...out, ...physicsLinkChecks(entry, regs), ...sourceChecks(entry, regs), ...effectChecks(entry, regs)];
});
registerChecks('blockingItems', (entry, regs) => [...knownEach(regs, 'stimulusKinds', entry.stimuli, 'stimuli', 'stimulus kind'), ...physicsLinkChecks(entry, regs), ...sourceChecks(entry, regs), ...effectChecks(entry, regs)]);
registerChecks('blockingActivities', (entry, regs) => [
  ...known(regs, 'blockingPostures', entry.impliedPosture, 'impliedPosture', 'posture'),
  ...knownEach(regs, 'activities', entry.fromActivities, 'fromActivities', 'activity'),
  ...sourceChecks(entry, regs), ...effectChecks(entry, regs),
]);
registerChecks('contactPhysics', (entry, regs) =>
  Array.isArray(entry.chains) ? (entry.chains as Array<{ to?: unknown }>).flatMap((c, i) => known(regs, 'contactPhysics', c.to, `chains[${i}].to`, 'contact physics')) : []);
registerChecks('physicsCues', (entry, regs) => knownEach(regs, 'contactPhysics', entry.physics, 'physics', 'contact physics'));

// P14c hand-offs: a hobby's `activityIds` are activities SHE does, a pastime's `momentSources` are sources open to everyone (scope `any`).
registerChecks('hobbies', (entry, regs) => {
  if (!Array.isArray(entry.activityIds)) return [];
  return (entry.activityIds as unknown[]).flatMap((id, i) => {
    const a = regs.blockingActivities.get(String(id));
    if (a === undefined) return [{ path: `activityIds[${i}]`, message: `unknown blocking activity "${String(id)}"` }];
    return a.actor === 'her' ? [] : [{ path: `activityIds[${i}]`, message: `"${String(id)}" is an activity of the commander; a hobby is something she does` }];
  });
});
registerChecks('pastimes', (entry, regs) =>
  Array.isArray(entry.momentSources)
    ? (entry.momentSources as unknown[]).flatMap((id, i) => {
      const s = regs.momentSources.get(String(id));
      if (s === undefined) return [{ path: `momentSources[${i}]`, message: `unknown moment source "${String(id)}"` }];
      return s.scope === 'any' ? [] : [{ path: `momentSources[${i}]`, message: `"${String(id)}" needs a dynamic frame; a quiet meeting only offers sources open to everyone` }];
    })
    : []);

// ---------------------------------------------------------------------------------------------
// P15: the dynamic registries. Bands tile 0-100 without a gap or an overlap; a region rank and a capability each belong to one row; a milestone, a domain and a track name what exists.

const bandChecks = (entry: Entry, regs: Regs, registry: 'holdBands' | 'regardBands'): RegistryCheck[] => {
  const min = Number(entry.min);
  const max = Number(entry.max);
  const others = [...regs[registry].values()].filter((o) => o.id !== entry.id);
  const out: RegistryCheck[] = [];
  if (min > 0 && !others.some((o) => Number(o.max) === min - 1)) out.push({ path: 'min', message: `gap below ${min}: no band ends at ${min - 1}` });
  if (max < 100 && !others.some((o) => Number(o.min) === max + 1)) out.push({ path: 'max', message: `gap above ${max}: no band starts at ${max + 1}` });
  const earlier = [...regs[registry].keys()].slice(0, [...regs[registry].keys()].indexOf(String(entry.id)));
  if (earlier.some((id) => { const o = regs[registry].get(id)!; return Number(o.min) <= max && Number(o.max) >= min; })) out.push({ path: 'min', message: 'overlaps a band above it' });
  return out;
};
registerChecks('holdBands', (entry, regs) => bandChecks(entry, regs, 'holdBands'));
registerChecks('regardBands', (entry, regs) => bandChecks(entry, regs, 'regardBands'));

/** Is there another row of `registry`, before this one in registry order, whose `field` is the same? (reported once, on the later row) */
const duplicateOf = (regs: Regs, registry: RegistryName, entry: Entry, field: string): boolean => {
  const ids = [...regs[registry].keys()];
  return ids.slice(0, ids.indexOf(String(entry.id))).some((id) => regs[registry].get(id)![field] === entry[field]);
};
registerChecks('positionRegions', (entry, regs) => duplicateOf(regs, 'positionRegions', entry, 'rank') ? [{ path: 'rank', message: `a second region has the rank "${String(entry.rank)}"` }] : []);

registerChecks('aftermaths', (entry, regs) => Object.keys((entry.weights as { regard?: Record<string, unknown> } | undefined)?.regard ?? {}).flatMap((id) => known(regs, 'regardBands', id, `weights.regard.${id}`, 'regard band')));

registerChecks('dynamicDomains', (entry, regs) => {
  const out = known(regs, 'holdBands', (entry.requires as { holdBand?: unknown } | undefined)?.holdBand, 'requires.holdBand', 'hold band');
  const ids = [...regs.dynamicDomains.keys()];
  const earlier = ids.slice(0, ids.indexOf(String(entry.id))).flatMap((id) => (regs.dynamicDomains.get(id)!.grants as string[]) ?? []);
  (entry.grants as string[] | undefined)?.forEach((cap, i) => { if (earlier.includes(cap)) out.push({ path: `grants[${i}]`, message: `the capability "${cap}" is already granted by another domain` }); });
  return out;
});

registerChecks('dynamicMilestones', (entry, regs) => {
  const req = (entry.requires ?? {}) as { holdBand?: unknown; tracks?: Record<string, unknown>; categories?: unknown };
  return [
    ...known(regs, 'holdBands', req.holdBand, 'requires.holdBand', 'hold band'),
    ...Object.keys(req.tracks ?? {}).flatMap((id) => known(regs, 'dynamicTracks', id, `requires.tracks.${id}`, 'practice track')),
    ...knownEach(regs, 'contentCategories', req.categories, 'requires.categories', 'content category'),
  ];
});

registerChecks('dynamicTracks', (entry, regs) => known(regs, 'contentCategories', entry.category, 'category', 'content category'));

// P15b (spec §12.1): a probe row's `likes` names a content category, or `worship.<targetId>` for one of the worship targets
registerChecks('probeAxes', (entry, regs) =>
  ((entry.needs as Array<{ likes?: Record<string, unknown> }> | undefined) ?? []).flatMap((n, i) =>
    Object.keys(n.likes ?? {}).flatMap((what) => what.startsWith('worship.')
      ? known(regs, 'worshipTargets', what.slice('worship.'.length), `needs[${i}].likes.${what}`, 'worship target')
      : known(regs, 'contentCategories', what, `needs[${i}].likes.${what}`, 'content category'))));

// ---------------------------------------------------------------------------------------------
// P16: a seed names an open practice track (its `check`, `proof`, `audience` and `needs` are closed enums, checked by the schema); a ceremony step's posture is a blocking posture.

// a revoked room (`privilege_revoked { what: 'room', arg }`) names a location of the pack.
registerRefs('holderPunishments', (entry) =>
  ((entry.effects as Array<{ type?: string; arg?: unknown }> | undefined) ?? []).flatMap((fx, i) =>
    (fx.type === 'privilege_revoked' && typeof fx.arg === 'string' ? [{ registry: 'locations' as const, id: fx.arg, path: `effects[${i}].arg` }] : [])));

registerChecks('practiceSeeds', (entry, regs) => known(regs, 'dynamicTracks', entry.track, 'track', 'practice track'));
registerChecks('ceremonySteps', (entry, regs) => known(regs, 'blockingPostures', entry.posture, 'posture', 'posture'));

// P16b: a posture preset stands on a base, carries content categories, may name places, items and a track, and supports contacts or physics; one preset of each base is its default.
registerChecks('servicePostures', (entry, regs) => {
  const req = (entry.requires ?? {}) as { track?: unknown; affordances?: unknown; anchor?: unknown; items?: unknown };
  const out: RegistryCheck[] = [
    ...known(regs, 'blockingPostures', entry.base, 'base', 'posture'),
    ...knownEach(regs, 'contentCategories', entry.tags, 'tags', 'content category'),
    ...known(regs, 'dynamicTracks', req.track, 'requires.track', 'practice track'),
    ...knownEach(regs, 'blockingAnchors', req.anchor, 'requires.anchor', 'anchor'),
    ...knownEach(regs, 'blockingItems', req.items, 'requires.items', 'item'),
    ...affordanceChecks(regs, req.affordances, 'requires.affordances'),
  ];
  if (Array.isArray(entry.supports)) {
    for (const [i, id] of (entry.supports as unknown[]).entries()) if (!regs.blockingContacts.has(String(id)) && !regs.contactPhysics.has(String(id))) out.push({ path: `supports[${i}]`, message: `unknown contact or physics "${String(id)}"` });
  }
  if (entry.default === true) {
    const first = [...regs.servicePostures.values()].find((p) => p.base === entry.base && p.default === true);
    if (first !== undefined && first.id !== entry.id) out.push({ path: 'default', message: `"${String(entry.base)}" already has a default preset ("${first.id}"): exactly one preset of a base is its default` });
  }
  return out;
});
