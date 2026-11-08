import { z } from 'zod';

/** Registry names reserved by P0 (`marks` stays empty in v1; see overview §10). */
export const REGISTRY_NAMES = [
  'roles', 'skills', 'signatures', 'statuses', 'defects', 'items', 'affixes', 'enemies',
  'enemyCategories', 'regions', 'nodeTypes', 'activities', 'facilities', 'crimes',
  'corporations', 'starts', 'relationshipStates', 'eventDeltas', 'dilemmaTemplates',
  'settingsPresets', 'flags', 'marks',
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
