import { z } from 'zod';

/** Registry names reserved by P0 (`marks` stays empty in v1; see overview §10). `locations` was added by P3, `orders`, `synergies`, `recipes` and `lootTables` by P4, `glossary` by P7a, `commanderTraits`, `tastes`, `presence` and `imageConsistency` by P7, `worldOptions`, `dispositionLevels`, `stanceEffects` and `worldPresets` by P8, `commandStances`, `punishments`, `demandTemplates` and `reputations` by P9, `hubRooms`, `deviceSkins` and `uiSounds` by P10, `prologues` and `uiUnlocks` by P11, `contentCategories` by P9d, `voteKinds` and `outsideFeats` by P9b, `deviceAccessRules`, `bookingKinds`, `tokenKinds`, `wagerGames`, `wagerStakes` and `secretKinds` by P9c, `memoryRules` by P3b. */
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
  // P8
  'worldOptions', 'dispositionLevels', 'stanceEffects', 'worldPresets',
  // P9 (`demandTemplates` and `reputations` get their schemas and files in chunk (c))
  'commandStances', 'punishments', 'demandTemplates', 'reputations',
  // P10
  'hubRooms', 'deviceSkins', 'uiSounds',
  // P11
  'prologues', 'uiUnlocks',
  // P9d
  'contentCategories', 'relationshipRuleTemplates',
  // P9b
  'voteKinds', 'outsideFeats',
  // P9c
  'deviceAccessRules', 'bookingKinds', 'tokenKinds', 'wagerGames', 'wagerStakes', 'secretKinds',
  // P3b
  'memoryRules',
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
    /**
     * Art the pack ships, so the UI never has to probe for it (a missing file would only log a 404): `hub` lists the
     * hub cross-section images (`base.png`, `base_<slot>.png`) as paths under the pack folder. Only `.png` files, no
     * remote URL, no parent path.
     */
    art: z.object({
      hub: z.array(z.string().regex(/^[A-Za-z0-9_][A-Za-z0-9_./-]*\.png$/, 'a .png path under the pack folder').refine((p) => !p.includes('..') && !p.includes('//'), 'no parent path'))
        .max(8).optional(),
    }).strict().optional(),
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
