import type { Entry, RegistryName } from './types';

export interface Ref {
  registry: RegistryName;
  id: string;
  /** Path of the referencing field inside the entry, e.g. `mutuallyExclusiveWith[0]`. */
  path: string;
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
