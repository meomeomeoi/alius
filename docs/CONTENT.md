# Adding content to Alius

Content is data, not code (overview P4). Every enemy, skill, item, flag, etc. is a JSON entry in a **content pack**. Packs are validated when the extension loads; errors are collected and shown together instead of stopping at the first one.

## Pack layout

```
content/core/
  manifest.json
  flags.json
  roles.json        (any registry file the manifest lists)
```

### `manifest.json`

```json
{
  "id": "core",
  "name": "Alius Core",
  "version": "0.0.1",
  "priority": 0,
  "files": { "flags": "flags.json", "roles": "roles.json" }
}
```

- `id`, `name`, `version`: non-empty strings.
- `priority`: number. Packs load in ascending priority; **a later (higher) pack overrides earlier ones by entry id**.
- `files`: maps a registry name to a file path **relative to the pack folder**. Only the registry names below are accepted; a typo is reported as an error. Registries you do not list stay empty.

### Registry names

`roles, skills, signatures, statuses, defects, items, affixes, enemies, enemyCategories, regions, nodeTypes, activities, facilities, crimes, corporations, starts, relationshipStates, eventDeltas, dilemmaTemplates, settingsPresets, flags, marks`

`marks` stays empty in v1 (overview §10). In P0 only `flags` has a strict schema; the other registries accept any entry that has the base fields. Later packages replace those schemas and add their own examples to this file.

## Entries

Each registry file is a JSON **array** of entries. Every entry has:

| Field | Type | Meaning |
|---|---|---|
| `id` | string, `^[a-z0-9_:.-]+$` | Unique within the registry. Two entries with the same id in one file are an error. |
| `extends` | string, optional | Id of an entry to build on (see below). |

Other fields depend on the registry.

### Overriding and `extends`

- **Override by id:** a higher-priority pack that defines an entry with an existing id replaces it completely.
- **`extends: "<id>"`:** the entry is deep-merged onto the entry with that id — objects are merged key by key, **arrays and primitives are replaced**. The `extends` field is removed from the result. Use a new `id` to create a variant, or `"extends"` your own `id` to patch a lower-priority entry (partial override):

```json
[
  { "id": "medic_plus", "extends": "medic", "name": "Medic+", "stats": { "atk": 5 } },
  { "id": "tank", "extends": "tank", "name": "Tank Mk2" }
]
```

`extends` is resolved after all packs are loaded. An unknown id, or a cycle, is an error.

## `flags`

Flags are **declared, not invented** (overview §6.1). Content may only reference declared flag ids.

| Field | Type | |
|---|---|---|
| `id` | string | |
| `scope` | `"world"` \| `"commander"` \| `"relation"` | |
| `description` | string, non-empty | |
| `mutuallyExclusiveWith` | string[], optional | Other flag ids; must exist. |
| `setBy` | string[], optional | Hint, e.g. `["start", "dilemma", "mission", "event"]`. |

```json
[
  { "id": "knows_crime", "scope": "relation", "description": "The unit has learned why the commander was convicted." },
  { "id": "accepted_defect", "scope": "relation", "description": "The unit has accepted her defect.", "mutuallyExclusiveWith": ["rejected_defect"], "setBy": ["event"] },
  { "id": "rejected_defect", "scope": "relation", "description": "The unit rejects her defect.", "mutuallyExclusiveWith": ["accepted_defect"] }
]
```

## Cross-reference validation

After all packs are merged, every id one entry references in another registry must exist (in P0: `flags.mutuallyExclusiveWith → flags`). Packages register further references with `registerRefs(registry, extractor)`. All problems are reported together.

## What errors look like

Each error has the pack id, the file, a path inside the file and a message:

```
broken  flags.json  [1].scope                          Invalid enum value. Expected 'world' | 'commander' | 'relation', received 'galaxy'
broken  flags.json  [2].id                             duplicate id "ok_one" in this file
broken  flags.json  [3].mutuallyExclusiveWith[0]       references unknown flags id "ghost"
core    roles.json  (no path)                          404 content/core/roles.json
```

`[1]` is the zero-based position of the entry in the file. An entry with a schema error is skipped; valid entries and other files still load, and the shell still opens. In the extension the errors are shown as one toast and logged in `SYS › debug`.
