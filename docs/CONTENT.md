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
  "lorebook": "lorebook.json",
  "files": { "flags": "flags.json", "roles": "roles.json" }
}
```

- `id`, `name`, `version`: non-empty strings.
- `priority`: number. Packs load in ascending priority; **a later (higher) pack overrides earlier ones by entry id**.
- `lorebook` (optional): path of a compact lorebook file, see [Lorebook](#lorebook). Only the highest-priority pack that declares one is used.
- `files`: maps a registry name to a file path **relative to the pack folder**. Only the registry names below are accepted; a typo is reported as an error. Registries you do not list stay empty.

### Registry names

`roles, skills, signatures, statuses, defects, items, affixes, enemies, enemyCategories, regions, nodeTypes, activities, facilities, crimes, corporations, starts, relationshipStates, eventDeltas, dilemmaTemplates, settingsPresets, flags, marks`

`marks` stays empty in v1 (overview §10). `flags` and the P1 setup registries (`corporations, starts, crimes, roles, signatures, defects, statuses`) have strict schemas, described below; the other registries accept any entry that has the base fields until a later package replaces their schema and documents it here.

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

## Value axes

Units, corporations and crime reactions use the same six axes, each an integer **-3…+3**: `pragmatism`, `autonomy`, `ingroup`, `mercy`, `corporate`, `sacrifice`. A `values` object has all six keys.

## Effects

Perks, flaws and starting bonuses hold a list of **effect objects**: `{ "type": "<id>", ...params }`. P1 applies exactly three types when a campaign is created and validates their parameters; any other `type` is stored unchanged for a later package to interpret (for example `cp_start`, `mission_credits_pct`, `leash_weekly`).

| `type` | Params | Applied at start |
|---|---|---|
| `social_rank` | `stat`: `authority`\|`insight`\|`empathy`\|`cunning`; `rank`: int 1…5 | Raises the commander's stat to at least `rank`. |
| `resource` | `resource`: `credits`\|`supplies`\|`plyx`; `amount`: int | Adds `amount` to the resource. |
| `starting_trust` | `amount`: int -40…40; optional `ifValue`: `{ axis, sign: "+"\|"-" }` | Adds `amount` to every unit's starting Trust; with `ifValue`, only to units whose value on `axis` is positive (`+`) or negative (`-`). |

## `corporations`

| Field | Type | |
|---|---|---|
| `name`, `summary`, `oversightStyle` | string | |
| `values` | value axes | The corporation's outlook. |
| `playable` | boolean | A start may only use a playable corporation. |
| `startingBonus` | `{ text, effects[] }` | |
| `startingRegionId` | string, optional | Not checked until P5 adds `regions`. |

```json
{ "id": "vesper", "name": "Vesper Somatics", "summary": "Biotech.", "values": { "pragmatism": 2, "autonomy": -1, "ingroup": 0, "mercy": -1, "corporate": 2, "sacrifice": 0 },
  "oversightStyle": "Approves Leash requests readily.", "playable": true,
  "startingBonus": { "text": "+10 supplies.", "effects": [{ "type": "resource", "resource": "supplies", "amount": 10 }] } }
```

## `starts`

| Field | Type | |
|---|---|---|
| `name`, `summary`, `situation` | string | |
| `corporationId` | string | Must be a **playable** corporation. |
| `spine` | `{ id, title, goal }[]`, 5 to 8 | Milestone beats, not scripts. |
| `crimeKnownByDefault` | boolean, optional | If true, every unit starts with the `knows_crime` flag. |

```json
{ "id": "start_vesper", "name": "Seed Stock", "corporationId": "vesper", "summary": "Secure Bloom samples.", "situation": "...",
  "spine": [{ "id": "beat_1", "title": "First sample", "goal": "Recover the first Bloom sample." }] }
```

(The example shows one beat; a real start needs 5 to 8.)

## `crimes`

| Field | Type | |
|---|---|---|
| `name`, `summary` | string | |
| `perk`, `flaw` | `{ text, effects[] }` | |
| `valueReactions` | `{ axis, sign: "+"\|"-", weight: int -3…3 }[]` | Units whose value on `axis` has that sign react with `weight` (negative = badly). |
| `knownByDefault` | boolean | If true, every unit starts with the `knows_crime` flag. |

```json
{ "id": "mutiny", "name": "Mutiny", "summary": "Led a revolt against a superior.",
  "perk": { "text": "Authority starts at rank 2.", "effects": [{ "type": "social_rank", "stat": "authority", "rank": 2 }] },
  "flaw": { "text": "Leash requests cost more Trust.", "effects": [{ "type": "leash_trust_cost" }] },
  "valueReactions": [{ "axis": "autonomy", "sign": "+", "weight": 1 }], "knownByDefault": false }
```

## `roles`

| Field | Type | |
|---|---|---|
| `name` | string | |
| `row` | `front`\|`back`\|`either` | |
| `baseStats` | `{ hp, atk, def, spd: int >= 1, crit: int 0…100 }` | Level-1 stats. |
| `weaponClasses` | string[], at least 1 | |
| `armorWeights` | (`light`\|`medium`\|`heavy`)[], at least 1 | |
| `identity` | string | |
| `summary` | string | One line, used in prompts. |
| `branches` | `{ name, summary }[]` | Skill tree branches. |

```json
{ "id": "assault", "name": "Assault", "row": "front", "baseStats": { "hp": 110, "atk": 24, "def": 12, "spd": 14, "crit": 10 },
  "weaponClasses": ["Blade", "SMG"], "armorWeights": ["light", "medium"], "identity": "Burst damage, executes.",
  "summary": "Front-line burst damage.", "branches": [{ "name": "Breach", "summary": "Armor shred." }] }
```

## `signatures`

Signature skill **templates**. The id must start with `sig_`. At import the model picks templates by `fits` and writes the unit's own name and description; the numbers stay in the template.

| Field | Type | |
|---|---|---|
| `name` | string | Short label of the template. |
| `mechanic` | string | What it does. |
| `fits` | string | The kind of character it suits. |

```json
{ "id": "sig_last_stand", "name": "Last Stand", "mechanic": "Below 30% HP: next attack x2, can't be stunned.", "fits": "stubborn, proud" }
```

## `defects`

| Field | Type | |
|---|---|---|
| `name`, `lore`, `upside`, `downside`, `social` | string | |
| `category` | `neural`\|`somatic`\|`cybernetic`\|`desire_bond` | `desire_bond` is gated by the *Desire/Bond defects* setting. |
| `breakdown` | `{ name, text }` | What happens at Stress 100. |
| `arc` | `{ cure, manage, embrace }` | Strings; `"Not yet written."` is a valid placeholder. |

```json
{ "id": "rage_governor", "name": "Rage Governor Failure", "category": "neural", "lore": "Aggression limiter burned out.",
  "upside": "+ATK scaling with stress.", "downside": "Insults and refusals raise stress sharply.",
  "breakdown": { "name": "Red Out", "text": "Attacks the strongest visible target." }, "social": "Fights with squadmates.",
  "arc": { "cure": "Not yet written.", "manage": "A sparring outlet.", "embrace": "Controlled fury." } }
```

## `statuses`

| Field | Type | |
|---|---|---|
| `name`, `description` | string | |
| `kind` | `buff`\|`debuff` | |

```json
{ "id": "bleed", "name": "Bleed", "kind": "debuff", "description": "Loses HP at the start of each turn." }
```

## Lorebook

A pack may ship one compact lorebook, named in the manifest's `lorebook` field. The extension installs it into SillyTavern when a campaign is created, unless a lorebook with that name already exists (a lorebook the player edited is never overwritten).

```json
{ "name": "Alius Core Lore",
  "entries": [
    { "key": [], "comment": "world_premise", "content": "Decades ago the Bloom...", "constant": true },
    { "key": ["Vesper Somatics", "vesper"], "comment": "corporation_vesper", "content": "Vesper Somatics is...", "constant": false, "order": 100 }
  ] }
```

- `name`: non-empty. `entries[].content`: non-empty. `comment` is the entry id.
- `constant: true` entries are always injected; others trigger on their `key` words.
- `order` is optional (default 100).

