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
