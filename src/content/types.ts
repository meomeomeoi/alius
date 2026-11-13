import { z } from 'zod';

/** Registry names reserved by P0 (`marks` stays empty in v1; see overview §10). `locations` was added by P3, `orders`, `synergies`, `recipes` and `lootTables` by P4, `glossary` by P7a, `commanderTraits`, `tastes`, `presence` and `imageConsistency` by P7. */
export const REGISTRY_NAMES = [
  'roles', 'skills', 'signatures', 'statuses', 'defects', 'items', 'affixes', 'enemies',
  'enemyCategories', 'regions', 'nodeTypes', 'activities', 'facilities', 'crimes',
  'corporations', 'starts', 'relationshipStates', 'eventDeltas', 'dilemmaTemplates',
  'settingsPresets', 'flags', 'marks', 'locations',
  // P4
  'orders', 'synergies', 'recipes', 'lootTables',
  // P5
  'missionTemplates', 'clocks', 'rewardTiers',
  // P6
  'loyaltySigns',
  // P7a
  'glossary',
  // P7
  'commanderTraits', 'tastes', 'presence', 'imageConsistency',
] as const;

export type RegistryName = (typeof REGISTRY_NAMES)[number];

export const PackManifestSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    version: z.string().min(1),
    priority: z.number(),
    /** Compact lorebook file (see LorebookSchema); the highest-priority pack that declares one wins. */
    lorebook: z.string().min(1).optional(),
    files: z.object(
      Object.fromEntries(REGISTRY_NAMES.map((n) => [n, z.string().min(1).optional()])) as Record<
        RegistryName,
        z.ZodOptional<z.ZodString>
      >,
    ).strict(),
  })
  .strict();

export type PackManifest = z.infer<typeof PackManifestSchema>;

/** A content entry: at least an id, optionally `extends`, plus registry-specific fields. */
export type Entry = { id: string; extends?: string; [k: string]: unknown };

export type Registries = Record<RegistryName, Map<string, Entry>>;

export function emptyRegistries(): Registries {
  return Object.fromEntries(REGISTRY_NAMES.map((n) => [n, new Map<string, Entry>()])) as Registries;
}

export interface ContentError {
  pack: string;
  file: string;
  /** Location inside the file, e.g. `[2].scope`. Empty for file-level problems. */
  path: string;
  message: string;
}
