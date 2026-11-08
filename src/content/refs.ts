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
