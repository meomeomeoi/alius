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
  "art": { "hub": ["art/hub/base.png", "art/hub/base_night.png"] },
  "files": { "flags": "flags.json", "roles": "roles.json" }
}
```

- `id`, `name`, `version`: non-empty strings.
- `priority`: number. Packs load in ascending priority; **a later (higher) pack overrides earlier ones by entry id**.
- `lorebook` (optional): path of a compact lorebook file, see [Lorebook](#lorebook). Only the highest-priority pack that declares one is used.
- `art` (optional, P10): art the pack ships, so the UI never probes for a file that is not there (a missing file would only log a 404). `hub`: the hub cross-section images as paths under the pack folder (`base.png`, `base_<slot>.png`; at most 8; only `.png`, no URL, no `..`). A later pack's file of the same name replaces an earlier one. A pack without `art` shows the CSS blueprint and requests nothing.
- `files`: maps a registry name to a file path **relative to the pack folder**. Only the registry names below are accepted; a typo is reported as an error. Registries you do not list stay empty.

### Registry names

`roles, skills, signatures, statuses, defects, items, affixes, enemies, enemyCategories, regions, nodeTypes, activities, facilities, crimes, corporations, starts, relationshipStates, eventDeltas, dilemmaTemplates, settingsPresets, flags, marks, locations, orders, synergies, recipes, lootTables, missionTemplates, clocks, rewardTiers, loyaltySigns, glossary`

`marks` stays empty in v1 (overview §10). P3 added the `locations` registry name and strict schemas for `relationshipStates`, `eventDeltas` and `locations`; P4 added `orders`, `synergies`, `recipes`, `lootTables` and strict schemas for `skills`, `enemyCategories`, `enemies`, `affixes` and `items` (all below). `flags` and the P1 setup registries (`corporations, starts, crimes, roles, signatures, defects, statuses`) have strict schemas, described below; the other registries accept any entry that has the base fields until a later package replaces their schema and documents it here.

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
| `startingRegionId` | string, optional | A `regions` id (checked by the loader since P5). |
| `leash` | `{ weekly: 0–5, approval: 0–1 }`, **required (P6)** | Oversight numbers: Leash authorizations per week and the base chance that a Terminate request is approved. |

```json
{ "id": "vesper", "name": "Vesper Somatics", "summary": "Biotech.", "values": { "pragmatism": 2, "autonomy": -1, "ingroup": 0, "mercy": -1, "corporate": 2, "sacrifice": 0 },
  "oversightStyle": "Approves Leash requests readily.", "playable": true,
  "startingBonus": { "text": "+10 supplies.", "effects": [{ "type": "resource", "resource": "supplies", "amount": 10 }] },
  "leash": { "weekly": 3, "approval": 0.7 } }
```

## `starts`

| Field | Type | |
|---|---|---|
| `name`, `summary`, `situation` | string | |
| `corporationId` | string | Must be a **playable** corporation. |
| `spine` | `{ id, title, goal, conditions?, completion?, onComplete? }[]`, 5 to 8 | Milestone beats, not scripts. P5 fields: see **Spine beats (P5)**. |
| `crimeKnownByDefault` | boolean, optional | If true, every unit starts with the `knows_crime` flag. |
| `startingResources` | `{ credits?, supplies?, plyx? }`, optional | Base amounts the campaign begins with. The corporation bonus and crime effects are added on top. |

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
| `branches` | `{ name, summary }[]` | Skill tree branches (their names head the three columns of the SQUAD tree). |
| `growth` | `{ hp, atk, def, spd, crit }` (numbers ≥ 0) | P4: stats gained per level; the engine adds `floor(growth × (level − 1))` to `baseStats`. |
| `aiProfile` | `aggressive`\|`predator`\|`protector`\|`disruptor` | P4: how the role plays on AUTO. |
| `starterSkills` | string[2] | P4: `skills` ids every unit of the role owns without spending points; the first is the basic attack (cooldown 0). |
| `tree` | `TreeNode[16]` | P4: 3 branches × 5 tiers plus one ultimate node. |

A **tree node** is `{ id, branch: 0|1|2|null, tier: 1..5|null, cost, requires: string[], grants }`. `grants` is `{ "skill": "<skills id>" }` or `{ "upgrade": { "skillId", "cooldownDelta?", "multPct?", "addEffects?" } }` (an upgrade changes a skill the unit already owns: cooldown, a percentage on the damage multiplier and heal, extra effects). Exactly one node has `branch: null` (the ultimate, cost 6, unlocked after two tier-3 nodes); `requires` may only name nodes of the same role. Core trees follow the pattern *active, passive, upgrade of the tier-1 active, active, passive* per branch with costs 2/3/4/5/6 (66 points in all).

```json
{ "id": "assault", "name": "Assault", "row": "front", "baseStats": { "hp": 110, "atk": 24, "def": 12, "spd": 14, "crit": 10 },
  "weaponClasses": ["Blade", "SMG"], "armorWeights": ["light", "medium"], "identity": "Burst damage, executes.",
  "summary": "Front-line burst damage.", "branches": [{ "name": "Breach", "summary": "Armor shred." }],
  "growth": { "hp": 6, "atk": 1.4, "def": 0.6, "spd": 0.2, "crit": 0.2 }, "aiProfile": "aggressive",
  "starterSkills": ["as_strike", "as_burst"],
  "tree": [{ "id": "as_b1_t1", "branch": 0, "tier": 1, "cost": 2, "requires": [], "grants": { "skill": "as_breach_charge" } },
           { "id": "as_b1_t3", "branch": 0, "tier": 3, "cost": 4, "requires": ["as_b1_t2"], "grants": { "upgrade": { "skillId": "as_breach_charge", "cooldownDelta": -1, "multPct": 20 } } }] }
```

## `signatures`

Signature skill **templates**. The id must start with `sig_`. At import the model picks templates by `fits` and writes the unit's own name and description; the numbers stay in the template.

| Field | Type | |
|---|---|---|
| `name` | string | Short label of the template. |
| `mechanic` | string | What it does. |
| `fits` | string | The kind of character it suits. |
| `skill` | string | P4: the `skills` entry that implements it (by convention the same id, e.g. `sig_last_stand`). An active signature becomes a button next to the four loadout skills; a `passive` one is always on. Grunts ignore it. |

```json
{ "id": "sig_last_stand", "name": "Last Stand", "mechanic": "Below 30% HP: next attack x2, can't be stunned.", "fits": "stubborn, proud", "skill": "sig_last_stand" }
```

## `defects`

| Field | Type | |
|---|---|---|
| `name`, `lore`, `upside`, `downside`, `social` | string | |
| `category` | `neural`\|`somatic`\|`cybernetic`\|`desire_bond` | `desire_bond` is gated by the *Desire/Bond defects* setting. |
| `breakdown` | `{ name, text }` | What happens at Stress 100. |
| `arc` | `{ cure, manage, embrace }` | Strings; `"Not yet written."` is a valid placeholder. |
| `leash` | `{ costMult: 0–4, failChance?: 0–1 }`, optional (P6) | Changes what a Compel on this unit costs (Trust and Affinity × `costMult`) and how often it fails. |
| `desertionMod` | number −0.3…0.3, optional (P6) | Added to her daily desertion chance. |
| `arcFlag` | flag id, optional (P6) | A flag (on her relation, the world or the commander) that must be set before the defect's arc is offered. |

```json
{ "id": "rage_governor", "name": "Rage Governor Failure", "category": "neural", "lore": "Aggression limiter burned out.",
  "upside": "+ATK scaling with stress.", "downside": "Insults and refusals raise stress sharply.",
  "breakdown": { "name": "Red Out", "text": "Attacks the strongest visible target." }, "social": "Fights with squadmates.",
  "arc": { "cure": "Not yet written.", "manage": "A sparring outlet.", "embrace": "Controlled fury." } }
```

## `activities`

A slot action. Alone it runs `effects`; with a companion it runs `companionEffects` **instead**.

| Field | Type | |
|---|---|---|
| `name`, `summary` | string | |
| `slotRules` | `morning`\|`afternoon`\|`evening`\|`night`[], at least 1 | Slots where it may be started. |
| `facilityReq` | `{ id, level }`, optional | A facility (must exist, level within its `maxLevel`). An absent facility counts as level 1. |
| `cost` | `{ credits?, supplies?, plyx? }` | Paid before the effects. |
| `companion` | `none`\|`optional`\|`required` | `none` forbids `companionEffects`, `required` needs them. |
| `focus` | `{ id, label, units?: { min, max } }[]`, optional | Choices of the alone variant; `units` is how many squad units the player picks for it. The first focus is the default. |
| `effects`, `companionEffects` | effect[] | See below. |
| `flavor` | `none`\|`short` | `short`: after a companion run the extension may show a 2-line generated vignette (no numbers come from it). |
| `startsScene` | boolean, optional | Emits `scene_requested`; the slot is consumed when the scene ends, not by the activity. |
| `blockedWhenCommanderInjured` | boolean, optional | Not available while the commander is injured. |

Effect types (a typo or a missing field is a load error): `resource {resource, amount, perStat?: {stat, per}}`, `commander_stat {stat, amount}` (social points), `unit_xp {target, amount}`, `unit_stress {target, amount}` (negative = relief), `injury_days {target, amount}` (negative = recovery), `commander_injury_days {amount}`, `defect_upkeep {target}`, `relation {axis, amount}` (companion only), `emit_event {event}`. `target` is `selected` (alone only), `companion` (companionEffects only) or, for stress, `roster`. `emit_event` may not use an event name the engine itself emits (`error`, `autosave`, `activity_done`, `resource_changed`, …; the load error lists the rule). A `startsScene` activity may only emit events, because its slot is not consumed by the activity. `focus` ids must be unique and `units.min` must not exceed `units.max`. Every effect may carry `when: { focus?, companionLikes? }` (`focus` only in `effects`, `companionLikes` only in `companionEffects`) and `scale: { facility, key }`, which multiplies `amount` by `1 + (facility effect at its current level) / 100`.

```json
{ "id": "rest", "name": "Rest", "summary": "Stand the squad down.", "slotRules": ["morning", "evening"], "cost": {},
  "companion": "optional", "flavor": "short",
  "effects": [{ "type": "unit_stress", "target": "roster", "amount": -3, "scale": { "facility": "barracks", "key": "restPct" } }],
  "companionEffects": [{ "type": "unit_stress", "target": "companion", "amount": -8 }, { "type": "relation", "axis": "affinity", "amount": 2 }] }
```

## `facilities`

| Field | Type | |
|---|---|---|
| `name`, `summary` | string | |
| `maxLevel` | 1 to 5 | `levels` must have exactly this many entries. |
| `levels` | `{ effects, upgrade? }[]` | `levels[0]` is level 1 (the starting level, no `upgrade`). Every later level has `upgrade: { credits, plyx, days }`, the cost and build time to reach it. All levels list the same keys in `effects` (numbers). |

Other packages read effect values by key (`rosterCapacity`, `restPct`, `stressReliefPct`, `injurySpeed`, `upkeepReduction`, `mealPct`, `rumorsPerDay`, `missionBoardSize`, `dmFeatures`, `rarityCap`, `upgradeDiscountPct`, `arcStageCap`).

```json
{ "id": "mess_hall", "name": "Mess hall", "summary": "Cuts daily supply use.", "maxLevel": 2,
  "levels": [{ "effects": { "upkeepReduction": 0 } }, { "effects": { "upkeepReduction": 1 }, "upgrade": { "credits": 80, "plyx": 5, "days": 2 } }] }
```

## `statuses`

| Field | Type | |
|---|---|---|
| `name`, `description` | string | |
| `kind` | `buff`\|`debuff` | |

```json
{ "id": "bleed", "name": "Bleed", "kind": "debuff", "description": "Loses HP at the start of each turn." }
```

## `relationshipStates` (P3)

One entry per node of the relationship graph. The engine never hard-codes a state id except `stranger` (the start state) and `secret_affair` (the hidden form of a romance).

| Field | Type | |
|---|---|---|
| `name`, `promptHint` | string | `promptHint` tells the main model how to play her in this state. |
| `group` | `base`\|`platonic`\|`romantic`\|`complex`\|`negative` | |
| `romance` | boolean | `true` states are hidden (never entered, no initiative) when the Romance setting is off. |
| `glyph` | 1–2 characters | Shown in the scene HUD. |
| `priority` | int | Among automatic entries that hold, the highest wins. |
| `grunts` | boolean | Optional. Grunts only ever sit in `grunts: true` states. |
| `entry.via` | `automatic`\|`event`\|`proposal` (≥1) | `event` needs `entry.events` (event types), `proposal` needs `entry.proposals` (proposal kinds). |
| `entry.fromStates` | state ids | Optional; empty = from any state. Limits every path in. |
| `entry.when` | Conditions | Must hold for every path in. |
| `exit` | `[{ when: Conditions, to: stateId }]` | Checked first, in order; the first that holds moves the unit. |
| `modifiers` | `{ gain?, loss? }` per axis | Multipliers on deltas while in this state. |
| `unlocks` | `{ synergies, activities, nightEvents, defectArcStages }` | `nightEvents` are *night specs* (below). |
| `dmChance` | 0–1 | Chance per slot transition that she starts a DM (scaled by the initiative setting). |

A state with `when: { "anyOf": [] }` is never entered (an empty `anyOf` never holds); `stranger` uses it.

**Conditions** (all present keys must hold; every key optional; unknown keys are rejected):

| Key | Meaning |
|---|---|
| `axes` | `{ trust?, affinity?, attraction? }`, each `[min, max]` inclusive. |
| `stressMin` | The unit's stress is at least this. |
| `flagsAll`, `flagsNone` | Relation flags that must / must not be set (declared in `flags`). |
| `defectsAny` | The unit has at least one of these defects. |
| `inStates` | Current state is one of these. |
| `minDaysInState` | At least this many days since `stateSince`. |
| `eventCount` | `{ type, min, withinDays? }`: history entries of that type (an event type, or the engine's `stress_high`). The history keeps only the last 60 entries per relation and evicts the types in `TUNING.relations.historyKeep` (`src/engine/tuning.ts`: `stress_high`, `sided_against`) last: **a type you count here must be added to that list**, or a chatty scene can push its entries out (a core test enforces this for the shipped content). |
| `leashUsesMin` | The Leash log has at least this many entries for this unit. |
| `anyOf` | List of Conditions; at least one holds. |

**Night spec**: `{ id, kind, chance (0–1), priority, trigger: "daily"|"commander_injured", framing, ignore: { event, severity } }`. `framing` is the knock text (`{name}` becomes the unit's name); `ignore` is the intent event applied when the commander ignores the knock.

## `eventDeltas` (P3)

One entry per event type (`id` is the type; there must be one for each of the 26 types). `rows` has all four severities, each `{ trust?, affinity?, attraction?, stress? }`. `valueAligned: true` (decision events): the row holds magnitudes and the sign comes from the unit's values. `attractionUsesReceptivity: true`: attraction gains are scaled by the unit's receptivity.

```json
{ "id": "insulted", "rows": { "minor": { "affinity": -3, "stress": 2 }, "moderate": { "trust": -2, "affinity": -6, "stress": 4 },
  "major": { "trust": -4, "affinity": -10, "stress": 8 }, "extreme": { "trust": -8, "affinity": -18, "stress": 14 } } }
```

## `locations` (P3)

| Field | Type | |
|---|---|---|
| `name`, `summary` | string | |
| `ascii` | 1–12 lines | Fallback art when there is no image. |
| `background`, `backgroundNight` | string | Optional asset paths (v1 ships none). |
| `perUnit` | boolean | `quarters_unit`: one per unit. |
| `slots` | slots | Optional; absent = every slot. |

## `defects`: P3 fields

Optional, added to the `defects` schema: `relationModifiers` (`{ gain?, loss?, events? }`: per-axis multipliers and per-event-type multipliers), `socialHooks` (`[{ activity, who: "companion"|"roster", axis?, amount?, setFlag? }]`: effects of doing an activity), `dmChanceBonus` (0–1, added to her DM chance), `nightEvents` (night specs).

## `defects`: P4 combat data

Required `combat` object on every defect: `{ upside: Effect[], downside: Effect[], breakdown }`. Every `downside` effect must carry `"downside": true`: the engine multiplies those by 1.5 while the unit is **strained** (stress ≥ 50). `breakdown` is `{ policy, target?, ignoresOrders, once?, onEnter: Effect[], actionEffects: Effect[] }`:

| `policy` | The unit, from stress 100 until the expedition ends |
|---|---|
| `skip` | passes every turn |
| `repeat_last` | repeats her last skill on her last target (nearest legal target when it is gone) |
| `random_skill` | a random usable skill on a random legal target |
| `attack` | her basic damaging skill on `target`: `nearest_enemy`, `strongest_enemy`, `nearest_any` or `nearest_ally` (allies may be hit) |
| `await_order` | passes until a CP order targets her that round |
| `twice_then_shutdown` | acts twice (aggressively), then is stunned for the rest of the combat |
| `normal` | plays normally (the `onEnter` effects are the whole breakdown) |

`once` ends the policy after one action; `ignoresOrders` makes her untargetable by CP orders; `onEnter` runs once when she breaks down; `actionEffects` after each of her breakdown actions. From stress 80 (*breaking*) each turn has a 25 % chance to follow the policy once instead of the chosen action.

```json
{ "id": "rage_governor", "combat": {
    "upside": [{ "type": "stat", "stat": "atk", "pct": 0, "scale": { "by": "stress_above", "per": 1, "base": 30 } }],
    "downside": [{ "type": "stress", "amount": 3, "trigger": "onDamaged", "target": "self", "downside": true },
                 { "type": "order_refusal", "chance": 0.25, "orders": ["hold_the_line"], "downside": true }],
    "breakdown": { "policy": "attack", "target": "strongest_enemy", "ignoresOrders": true, "onEnter": [], "actionEffects": [] } } }
```

## Combat effects (P4)

One vocabulary drives everything that happens in a fight: skills, signatures, statuses, defects, synergies, CP orders, items and enemy affixes are lists of effect objects. Adding a behaviour is adding JSON; only when no effect type can express it is a new *generic* type added to `src/engine/combat/types.ts` and `schemas.ts`.

Common fields: `type`; `trigger` (absent = *on use* for a skill, *always on* for a passive); `scope` (`self` default; `ally` = fires for an ally's hit/crit/kill, only with `onHit`/`onCrit`/`onKill`); `threshold` (50, 80 or 100; only with `onStressThreshold`); `target` (default `target` for skills, `self` otherwise); `when` (conditions); `chance` (0–1); `downside` (amplified while strained); `limit` (`round` or `combat`: fires at most once per round / combat).

**Triggers:** `onCombatStart`, `onRoundStart`, `onTurnStart`, `onAction`, `onHit`, `onCrit`, `onDamaged`, `onAllyDowned` (fires for the downed unit's allies *and* for the downed unit itself, so an enemy can explode on its own downing; the killer is the target), `onKill`, `onStressThreshold`, `onCombatEnd`.

**Targets:** `self`, `target`, `source` (who hit her), `allies`, `allies_other`, `allies_front`, `enemies`, `own_row` (her row mates), `target_row` (the row of the target — the killer for `onAllyDowned`), `random_enemy`, `lowest_hp_ally`, `commander`.

**Conditions** (`when`; every present key must hold; about the owner unless noted): `hpBelowPct`, `hpAbovePct`, `stressMin`, `stressMax`, `roundMin`, `targetHasStatus` (the target), `selfHasStatus`, `aloneInRow`, `sameRowAndSkill`, `rowChanged`, `commanderExposed`, `notOrderedThisRound`, `upkeepWithinDays` (needs a defect that was maintained), `upkeepOlderThanDays` (also true for a defect that never was).

| `type` | Params | Effect |
|---|---|---|
| `damage` | `mult` *or* `pctMaxHp`; `hits?`, `ignoreRows?`, `critBonus?`, `scale?` | ATK-based hit (`round(ATK × mult × 100/(100+DEF) × crit × rand(0.9,1.1))`), or true damage as a share of max HP (bleed, burn) |
| `heal`, `revive` | `pctMaxHp` | heals; brings a downed ally back |
| `status` | `statusId`, `turns?`, `stacks?` | applies a status (blocked by `immune`) |
| `cleanse` | `kind: buff\|debuff`, `count` | removes the newest statuses of that kind |
| `stat` | `stat` (`hp atk def spd crit all`), `pct`, `turns?`, `scale?` | percentage change (CRIT: points); without a trigger it is always on |
| `outgoing`, `incoming` | `pct` (`outgoing`: `vs?: marked\|locked`, `scale?`) | damage dealt / taken, always on |
| `stress`, `stress_taken` | `amount` / `pct`, `direction: gain\|relief` | changes stress / scales stress gains or relief |
| `cp` | `amount` | command points |
| `move` | `to: front\|back\|swap` | changes row (a rooted unit stays; a full row swaps places) |
| `extra_action` | | she acts again right now (once per turn) |
| `redirect` | `pct`, `turns`, `from: ally\|commander` | she takes part of the damage meant for the target |
| `intercept_lethal` | `protect: commander\|ally` | takes a lethal hit instead (use `limit: combat`) |
| `summon` | `enemyId`, `max` | adds an enemy (never beyond three per row) |
| `follow_up` | `mult` | an extra hit on the target (no chains) |
| `misfire`, `order_refusal` | `chance` (and `orders?`) | wasted action / the unit refuses CP orders |
| `override_action` | `policy: aggressive`, `chance` | acts aggressively instead |
| `lock_target` | `turns` | locked onto the target |
| `loot_roll` | `extra` | extra loot roll after the combat |
| `repeat_order`, `hp_set`, `immune`, `order_cost`, `loadout_slots`, `injury_days` | see schema | repeat the last CP order, set HP, block a status, change order cost (never below 1), extra loadout slot, longer injuries |

`scale` = `{ by: "stress_above" \| "own_hp_missing_pct" \| "allies_hp_missing_pct", per, base? }`: the value (a percentage; for `stress_above` the stress beyond `base`) × `per` is added to the effect's `pct` (or `mult` for damage).

## `skills` (P4)

`{ id, name, kind: "active"\|"passive"\|"ultimate"\|"enemy"\|"signature", description, cooldown, cp?, stressCost?, usableFrom: ("front"\|"back")[], targets: { side: "enemy"\|"ally"\|"self", rows, count: "one"\|"row"\|"all", melee? }, effects, tags }`. Passives omit `cooldown`/`usableFrom`/`targets` and may only hold always-on effect types or effects with a trigger. `melee` skills hit the enemy front row while it stands; any `damage` with `ignoreRows` reaches everyone; an enemy with `taunt` must be chosen; `untargetable` units cannot be. A cooldown of N blocks the skill for N of her own turns. An `ultimate` costs its `cp` unless the unit was authorized.

```json
{ "id": "as_breach_charge", "name": "Breach Charge", "kind": "active", "description": "Rams the target and eats into its armor.",
  "cooldown": 2, "usableFrom": ["front"], "targets": { "side": "enemy", "rows": ["front", "back"], "count": "one", "melee": true },
  "effects": [{ "type": "damage", "mult": 1.2 }, { "type": "status", "statusId": "corrode", "turns": 2 }], "tags": ["melee", "debuff"] }
```

## `statuses`: P4 mechanics

Required: `turns` (default duration), `maxStacks`, `stackMode` (`add` stacks up to `maxStacks`, `refresh` only renews). Optional: `tick` (effects run at the owner's turn start, once per stack), `mods` (`{ stat: pct per stack }`), `incomingPct` (damage taken, per stack), `flags` (`skipTurn`, `taunt`, `untargetable`, `absorb` = a shield worth 15 % of the applier's max HP per stack, `rooted` = cannot be moved). A status expires at the **end of its owner's turn**: one a unit puts on herself during her own turn needs `turns: 2` to cover her next turn.

```json
{ "id": "bleed", "name": "Bleed", "kind": "debuff", "description": "...", "turns": 3, "maxStacks": 3, "stackMode": "add",
  "tick": [{ "type": "damage", "pctMaxHp": 4, "target": "self" }] }
```

## `orders` (P4)

CP orders the commander gives between unit turns: `{ id, name, summary, cost: 1..5, target: "none"\|"ally"\|"enemy", effects }`. The ordered unit (or the first standing squad unit for target-less orders) owns the effects. Core ids: `focus_fire`, `hold_the_line`, `fall_back`, `steady`, `authorize_ultimate`.

## `synergies` (P4)

What a relationship state's `unlocks.synergies` ids do in combat: `{ id, name, summary, effects }`. The unit in that state gets the effects as passives. Core: `trusted_cover`, `friend_assist`, `confidant_sync`, `kindred_sync`, `spark`, `lover_link`, `devoted_sacrifice`, `rival_edge` and the refusal chances `order_friction_minor` / `order_friction` / `order_friction_major` (15 / 25 / 35 %, on `resentful` / `estranged` / `despises`).

## `enemyCategories`, `enemies`, `affixes` (P4)

`enemyCategories`: `{ id, name, frequency: "common"\|"rare"\|"very_rare", summary }` (the generator weighs rare × 0.3, very rare × 0.08). `enemies`: `{ id, categoryId, name, stats: { base, growth }, skills (≥ 1, kind enemy), eliteSkill?, aiProfile: "aggressive"\|"predator"\|"protector"\|"disruptor"\|"stressor"\|"erratic", rowPreference, power, portrait: { ascii: string[1..8], image? }, tags }`; `power` weighs the enemy in an encounter's budget (stat power × `power`). Stats at a level: `(base + growth × (level − 1)) × difficulty × (1 + Σ affix %)`; difficulty (story 0.8, hard 1.2) scales HP, ATK and DEF. `affixes`: `{ id, name, appliesTo: "enemy"\|"item", adjective?, slots?, drawback?, statPct?, effects, extraSkill? }`; enemy affixes (`armored`, `regenerating`, `reinforcing`, `volatile`, `bloom_touched`, `swift`, `elite`) put their `adjective` in the default name ("Armored Husk"); `extraSkill` gives the enemy its `eliteSkill`.

```json
{ "id": "husk", "categoryId": "mutant_human", "name": "Husk",
  "stats": { "base": { "hp": 55, "atk": 11, "def": 4, "spd": 8, "crit": 0 }, "growth": { "hp": 4, "atk": 0.7, "def": 0.2, "spd": 0.05, "crit": 0 } },
  "skills": ["en_claw", "en_infectious_bite"], "eliteSkill": "en_elite_strike", "aiProfile": "aggressive", "rowPreference": "front",
  "power": 1, "portrait": { "ascii": ["  .-.  ", " (o.o) "] }, "tags": ["swarm"] }
```

## `items`, `recipes`, `lootTables` (P4)

`items`: `{ id, name, slot: "weapon"\|"upper"\|"lower", class, rarity, baseStats, affixSlots?, effects, value }`. `class` is a weapon class or an armor weight and must appear in some role's `weaponClasses` / `armorWeights`; a role may only wear its own classes. `rarity` is the template's *minimum*; an instance has its own (`standard`, `refined`, `prototype`, `corporate`, `anomalous`), an upgrade level 0–5 and affixes (`[0, 1, 2, 3, 3]` positive slots by rarity, plus one drawback when anomalous). Stats = `baseStats × (1 + 0.15 × (rarity − 1)) × (1 + 0.08 × upgrade)`; an affix's `statPct` is a share of the *wearer's* total stat. `recipes`: `{ id, itemId, rarity, cost: { credits, plyx } }` (the workshop's `rarityCap` limits what can be crafted; anomalous items have no recipe). `lootTables`: `{ id, rolls, entries: [{ weight, kind: "item"\|"credits"\|"plyx"\|"supplies", itemId?, rarityWeights?, amount?: [min, max] }] }`; an item entry rolls its rarity from `rarityWeights` (never below the template's).

## World effects (P5)

Every consequence outside combat is a list of **world effects**: `{ "type": "<id>", ...params }`, strictly validated (an unknown field is an error). They appear in `clocks[].onFill`, `missionTemplates[].failureEffects` / `onSuccess`, `dilemmaTemplates[].fixed.options[].effects` and `starts[].spine[].onComplete`.

| `type` | Params | Does |
|---|---|---|
| `resource` | `resource`: `credits`\|`supplies`\|`plyx`, `amount`: int | Changes the stores (never below 0). |
| `carried_supplies` | `amount`: int | Changes the supplies an open expedition carries (0…12); ignored without one. |
| `faction` | `factionId` (a `corporations` id), `amount`: int −30…30 | Standing −100…100. |
| `clock` | `clockId`, `by`: int −2…2 except 0 | Advances a clock; a full clock runs its `onFill` once. |
| `flag` | `flagId` (a declared flag of scope `world` or `commander`) | Sets it, first removing the flags it is `mutuallyExclusiveWith`. |
| `clearance` | `tier`: 1…3 | Raises `world.clearanceTier` (never lowers); raises P4's level cap. |
| `party_stress`, `party_hp` | `amount`: int / `pct`: int −90…100 | The expedition party (or the active roster); HP never below 1 or above max. |
| `loot` | `tableId`, `rolls?`: 1…3 | Rolls a loot table into the run (banked on return) or straight into the stores. |
| `leash` | `amount`: −1\|1 | Changes the Leash authorizations left (never below 0). |
| `thread` | `threadId`, `status` | Sets the status of an existing thread. |
| `unit_event` | `event` (a P3 event type), `severity`, `targets`: `party`\|`named`, `valueAxes?` | Queues a relation event for the party's units; applied on return. `valueAxes` only work on `decision_aligned` / `decision_violated`. |
| `incoming_unit` | — | A new named unit waits for intake (OPS). |
| `fact` | `text` ≤ 200, `tags[]`, `importance` 1…5 | A public fact. |
| `offer_mission` | `templateId`, `regionId?`, `source` | Puts a mission on the board. |
| `squad_secret` | `kindId` (a `secretKinds` id), `knownBy`: `party`\|`squad` | P9c: the squad keeps something from the commander (known by the expedition party or the active roster, or every named unit). Not a cost effect: an option that carries it still needs its own cost. |

An effect whose target no longer exists is skipped. Effects of a clock that fills another clock nest at most 3 deep. A **cost effect** (a negative resource/faction/HP/Leash amount, positive stress or clock, or a `unit_event` of `sided_against`, `decision_violated`, `endangered`, `coerced`, `dismissed`) is what every non-flavor event option must contain.

## `regions` (P5)

| Field | Type | |
|---|---|---|
| `name`, `summary`, `environmentPrompt` | string | |
| `danger` | int 1…5 | |
| `travelSlots` | 2 \| 3 | Slots an expedition takes (spent on return). |
| `enemyTable` | `{ categories: { <enemyCategory id>: weight }, archetypes?: enemy id[] }` | Feeds P4's encounter generator. |
| `modifiers` | string[] | Reserved. |
| `mapHotspot` | `[x, y][]`, ≥ 3 points, each 0…100 | Polygon over the optional world image (`content/core/map/world.png`, author-supplied). |
| `mapCell` | `{ x: 0…2, y: 0…2 }` | Cell of the ASCII fallback grid (distinct per region). |
| `layers` | `[min, max]`, inside 3…5 | Node-map depth. |
| `nodeWeights` | `{ <nodeType id>: weight > 0 }` | Which node types the map draws. |
| `pointsOfInterest` | `{ id, name, summary, templateId }[]` | Standing runs; `templateId` is a mission template with source `side`. |
| `rumors` | string[] (≤ 40 words each) | Authored fallback rumor lines. |
| `knownFromStart`, `unlockedBy` | boolean / `{ flag?, clearanceMin? }` | A region is on the map when known from the start, unlocked, or recorded as known in state. |

## `nodeTypes` (P5)

`{ name, glyph (one character), kind: combat|event|cache|rest|objective|unknown, combat?, rest?, resolvesTo?, firstLayer?, maxPerMap?, minDanger? }`. `combat` is required for kind `combat` (`{ dangerDelta: −1…2, lootTableId, exposesCommander? }`), `rest` for kind `rest` (`{ suppliesPerUnit, hpPct, stress }`), `resolvesTo` (`{ <nodeType id>: weight }`, never `unknown` or `objective`) for kind `unknown`. `firstLayer: false` keeps the type off the first layer. Core ships `combat ⚔`, `elite ☠`, `event !`, `cache ≡`, `rest +`, `unknown ?`, `objective ◎`, `crisis ▲` (Commander Crisis, at most one per map, danger ≥ 3).

## `clocks` (P5)

`{ label, segments: 4…12, startFilled, regionId?, visibleToPlayer, onFill: WorldEffect[], repeat? }`. Hidden clocks are shown to the director but never to the player. `repeat: true` resets to 0 after filling.

```json
{ "id": "oversight", "label": "Oversight suspicion", "segments": 6, "startFilled": 0, "visibleToPlayer": true, "repeat": true,
  "onFill": [{ "type": "leash", "amount": -1 }, { "type": "fact", "text": "Oversight opened a file on the unit.", "tags": ["oversight"], "importance": 4 }] }
```

## `rewardTiers` and `missionTemplates` (P5)

`rewardTiers`: `{ rank 1…5, credits: [min, max], plyx: [min, max], lootTableId?, lootRolls?, faction?: 0…15 }` — the **only** source of mission amounts (the director picks a tier id, never numbers).

`missionTemplates`: `{ name, sources: command|story|rumor|side[], regions?, objectives: [{ node, condition: win|reach }], dangerRange: [min, max], tiers[], factionId?, clearance?: 1…3, objectiveEventId?, failureEffects[], onSuccess?[], titles[] (≤ 60 chars), briefs[] (≤ 300) }`. An objective node is of kind `combat`, `event` or `cache`; `win` needs a won fight, `reach` a resolved node. `objectiveEventId` pins the event that plays at the objective.

```json
{ "id": "tpl_hunt", "name": "Hunt", "sources": ["side", "rumor"], "objectives": [{ "node": "elite", "condition": "win" }],
  "dangerRange": [2, 4], "tiers": ["tier_2", "tier_3", "tier_4"], "failureEffects": [],
  "titles": ["Hunt the strongpoint"], "briefs": ["Something dangerous has dug in. Kill it before it spreads."] }
```

## `dilemmaTemplates` (P5: minor expedition events)

`{ scale: minor|major|defining, contexts[], regions?, flavor?, fixed?: { title, setup ≤ 600, options: [{ label ≤ 80, requires?: { stat, rank }, effects: WorldEffect[] }] } }`; unknown fields pass through (P6). A `minor` entry with context `expedition_event` needs `fixed`. A non-flavor event has 2–4 options and **every option carries at least one cost effect**; a `flavor: true` event has exactly one option (`CONTINUE`) without effects. Templates referenced by a mission template's `objectiveEventId` are never drawn at random.

```json
{ "id": "evt_wounded_scavenger", "scale": "minor", "contexts": ["expedition_event"],
  "fixed": { "title": "Wounded scavenger", "setup": "A scavenger lies against the wall.", "options": [
    { "label": "Share your rations", "effects": [{ "type": "carried_supplies", "amount": -2 }, { "type": "unit_event", "event": "decision_aligned", "severity": "minor", "targets": "party", "valueAxes": [{ "axis": "mercy", "direction": 1 }] }] },
    { "label": "Treat the wound properly", "requires": { "stat": "empathy", "rank": 3 }, "effects": [{ "type": "carried_supplies", "amount": -1 }] } ] } }
```

## Her-call events (P9e)

An expedition event can be taken out of the commander's hands: a soldier with a will of her own acts, and the node resolves itself to one of two outcomes. It is an ordinary minor `dilemmaTemplates` entry with one more field, `herCall`; `fixed` stays the commander's version, played when she does not act:

```json
{ "id": "evt_hc_route", "scale": "minor", "contexts": ["expedition_event"],
  "fixed": { "title": "Two ways round the collapse", "setup": "…", "options": [ { "label": "…", "effects": [{ "type": "party_stress", "amount": 5 }] }, { "label": "…", "effects": [{ "type": "carried_supplies", "amount": -1 }] } ] },
  "herCall": {
    "trigger": { "minLeadRank": 2 },
    "outcomes": [
      { "id": "good", "lean": { "pragmatism": 1, "autonomy": 1 }, "text": "she led the squad over a route of her own; …", "effects": [{ "type": "party_stress", "amount": -5 }] },
      { "id": "bad", "lean": { "autonomy": 2 }, "text": "takes the squad down a route of her own; …", "effects": [{ "type": "carried_supplies", "amount": -2 }, { "type": "party_stress", "amount": 10 }] } ],
    "defectTilt": [{ "category": "neural", "shift": -0.1 }] } }
```

- **Only minor `expedition_event` templates** (contexts exactly `["expedition_event"]`, no `generate`, no `flavor`), with a `fixed` block of 2 options that each carry a cost effect, as for any event.
- **`trigger` says who may act, from the card, never by id:** `minLeadRank` (0 yielding … 3 dominant) and/or `stances` (ids of `commandStances`, checked at load) with `minImpunity` (0–100). A soldier qualifies by either branch. A trigger needs `minLeadRank` or `stances`. `squad_assertiveness` only scales how often.
- **Exactly one `good` and one `bad` outcome.** `lean` is a value-axis map (−2…2, as for a ballot): her values against each lean decide how likely the outcome is good (`base 0.5 + 0.05 × (score(good) − score(bad))`, clamped to 0.15…0.85). `text` is at most 160 characters. Write it as a **past-tense clause starting with "she"** ("she let the scavenger go; …"): it is shown after `{Name} took the decision herself:` (log, card) and after `…, and it went well:` (the fact the model reads). No pronoun for the commander.
- **The bad outcome must cost** (at least one cost effect: supplies, stress, HP …) and **the good one must not**. About as hard as the worst option of an ordinary minor event: supplies 2–3, stress +10, HP −10 %. `subject` / `witnesses` targets and `oversight_punish` are not allowed (they belong to the scapegoat); `carried_supplies`, `party_hp`, `loot` are.
- **`defectTilt`** shifts the odds of a good outcome (−0.2…0.2) for a soldier with a defect of that `category` (`neural`, `somatic`, `cybernetic`, `desire_bond`); one shift per entry.
- A template is offered only to a party in which somebody could act on it, and never on a tutorial run (pinned or not); pinning it (a fixed map's `eventId`, a mission's `objectiveEventId`) with nobody eligible plays the `fixed` block.
- A scapegoat template's `fixed.because: { vote?, her_call? }` fills its `{because}` placeholder by where the decision came from (≤ 200 characters each; only on a `scapegoat` template).
- Glossary entries `her_call` and `ask_first` explain the system in the analysis panel.

## Personal pressure (P9c)

Six registries make up the content of P9c. Every one is `description`-bearing and joins `DESCRIBED_REGISTRIES`; every number is in `TUNING.personal` (drafts) and every text in core is marked `AUTHOR TO WRITE`. Code reads each entry by field, never by id. Nothing here may give the commander a pronoun (lore §0; `tests/content/pronouns.test.ts` covers all of it).

- **`deviceAccessRules`** — exactly one entry per `level` 1–4: `{ id, level, name, description, anyOf: [{ tiers?, states?, minLeadRank?, minImpunity?, minAffinity? }] (≥ 1 branch; all fields of a branch must hold), contactNames? (L1, `{name}`), notes? (L2, `{name}`), editLines? (L4, each must contain `{text}`) }`. `tiers` are `romantic` / `close`; `states` must name `relationshipStates`. A unit's level is the highest whose `anyOf` has a branch that holds (and the `device` gate passes).
- **`bookingKinds`** — `{ id, label, description, slot: morning|afternoon|evening, locationId (a `locations` id), tier?: 'romantic', text (contains `{name}`), wantRelief 0–100, weight 1–100 }`.
- **`tokenKinds`** — `{ id, label (contains `{name}`), description, minTier?: 'romantic', text (contains `{label}`), weight }`.
- **`wagerGames`** — `{ id, label, description, kind: coin|rps|high_card|sparring|expedition_bet, spendsSlot?, handicaps?: [{ id, label, herAtk, herHp, herSpd (0.1–2), minAffinity }] }`; `handicaps` belong to sparring only and are measured, not guessed (`sparringOdds`).
- **`wagerStakes`** — `{ id, label, description, effect: obedience|slot|privilege|drop_demand|token|question|mark, text, contentTags? }`. The registry is content-gated: a stake whose category is off (or one of her own limits) is never offered; core tags `her_mark` with `body_modification`. A new gated registry needs a `GATE_PROBES` entry (`tests/helpers/bonds.ts`).
- **`secretKinds`** — `{ id, description, source: hidden_injury|event|successor, reason: protect_commander|self_interest|leader_order, text (≤ 200; `{name}` for `hidden_injury`, `{leader}` for `successor`), importance 1–5 }`. Write `text` as a full sentence: it reaches the main model inside a "do not reveal" directive and becomes a fact when the commander answers. An authored `event` secret is stored by the world effect `squad_secret` (core: `evt_trader_deal`, whose `Forbid the trade` option carries it next to a stress cost).
- **Defects:** the optional `pressureMult` (1–2) multiplies how hard a soldier presses (bookings, tokens, claims, challenges, the deltas she takes); core: `possessive_protocol` and `dominance_drive` 1.5.
- **Relationship states:** the optional `secretSlip: true` (core: `resentful`), like the stance flag above.

## Spine beats (P5)

`starts[].spine[]` gains optional fields: `conditions { minDay?, flagsAll?[], flagsNone?[], clearanceMin?, threads?[{ id, status }] }` (when the director may propose the beat), `completion` (`{ "kind": "auto" }` default \| `{ "kind": "mission", "templateId", "regionId" }` — a template with source `story` \| `{ "kind": "flag", "anyOf": [flag ids] }`) and `onComplete: WorldEffect[]`. Beats are reached in order, never skipped; after the last one the director runs open-ended.

## `defects[].expedition` (P5)

`{ "reveal": 1 }` — the node map shows one more step ahead while a party member has the defect (`echo_bleed`).

## `glossary`, `description` and links (P7a)

The analysis panel (hover, `?` or long-press on anything in the shell) explains things from content.

**`glossary`** — one entry per concept: `{ id, term, short, long?, see?: string[] }`. `short` is at most **160** and `long` at most **600** displayed characters (link markup does not count). `see` lists link targets for the "see also" row. Ids that explain a setting are `setting_<key in snake_case>` (`showRawValues` → `setting_show_raw_values`); the code addresses them as `setting:showRawValues`.

**`description`** — an optional string (≤ 600 displayed characters) on `roles, skills, signatures, statuses, defects, items, affixes, enemies, enemyCategories, regions, nodeTypes, activities, facilities, crimes, corporations, starts, relationshipStates, locations, orders, synergies` (P7 adds `commanderTraits`, `tastes`, where it is required). The panel shows `description`, else `summary`, else a fallback (defects: upside and downside; signatures: `mechanic`). The panel also adds a generated **effects** summary from the entry's structured effects, so never repeat numbers in the text. An entry with nothing to show is listed in SYS › Debug › Content warnings.

**`cause`** on `eventDeltas` — a one-line reason shown in a relationship's history (≤ 80 chars): `"cause": "You took her side"`.

**Links** — write `[[target]]` or `[[target|label]]` in `short`, `long`, `description` or `see`. `target` is a glossary id (`trust`) or an address `<registry>:<id>` (`items:item_blade`); `setting:<key>` is allowed and not checked by the loader. The loader reports unknown targets and unknown sources like any broken reference.

```json
{ "id": "trust", "term": "Trust", "short": "How far a soldier believes in you. It decides whether she obeys.",
  "long": "It rises when you keep promises. When it drops, her [[loyalty_band|loyalty]] wavers.", "see": ["loyalty_band", "leash_compel"] }
{ "id": "bloom_fang", "name": "Bloom Fang", "description": "A blade grown from Bloom tissue; its victims keep [[statuses:bleed|bleeding]].", … }
```

## Commander content (P7)

**`commanderTraits`** — `{ id, name, kind: 'regular'|'special', description, upside, downside, effects[], hooks?[], exclusiveWith?[], requiresSettings?: { desireBondDefects: true } }`. A campaign picks up to 2 regular and 0–1 special traits. `effects` use a closed vocabulary (one line each in the panel, so never repeat numbers in the text): `social_rank { stat, rank }`, `seasoning_start { amount }`, `faction_start { amount }` (start), `starting_trust { amount, ifValue? }`, `taste_attraction { amount }` (join, only with a matched taste whose `offsets.attraction` is above 0), `social_growth { stat, mult }`, `body_growth { mult }`, `activity_cost { activityId, resource, amount }`, `activity_relation { activityId, axis, amount }` (with a companion), `early_trust_gain { pct }` (Trust gains, first 14 days known), `relation_event_mult { event, mult, ifTrigger? }`, `crisis_hp { amount }`, `leash_weekly { amount }`, `terminate_approval { amount }`, `requisition_price { pct }`, `night_slot {}` + `sleepless_rank { stat, amount }` (quiet nights), `no_romance {}`, `platonic_threshold { states[], pct }`, `unlock_state { stateId }`. `exclusiveWith` must be symmetric. Cross-references (activities, event types, states, other traits) are checked by the loader.

**`tastes`** — how a unit reads the commander: `{ id, name, description, match?: { archetypes?[], expression?: [lo, hi], seasoning?: [lo, hi] }, offsets?: { trust?, affinity?, attraction? } (±20), presenceMult? (0–2), imageMult? (0–2) }`. No `match` = always matches. A unit holds at most 3 (`commanderTastes`). Attraction offsets come only from tastes; expression has no other mechanical effect.

**`presence`** — rows `{ id, factor: 'archetype'|'seasoning'|'authority', key, presence (−15…15) }`; the sum (clamped to ±15) is the commander's presence. Every archetype and every rank/seasoning value 1–5 should have a row (a missing one counts 0).

**`imageConsistency`** — groups `{ id, archetypes[], inImage[], offImage[] }` of event types. An archetype is in exactly one group (the loader checks it). An `offImage` event of the commander multiplies his trust/affinity/attraction deltas by `1 + (1.3·t − 1)·w(d)`; `inImage` is data for the panel text.

**`routeCheck`** on an authored event option (`dilemmaTemplates[].fixed.options[]`): `{ id, routes: [ … ] }`, 1–5 routes of `{ kind: 'body', stat, min }`, `{ kind: 'delegate', unitFilter?: { roles[] }, cost: { trustCheck?, affinityCost?, stress? } }`, `{ kind: 'social', stat, min }`, `{ kind: 'item', itemId }`, `{ kind: 'bypass', cost: { resource, amount } }`. **At least one route must not be `body`** (the schema rejects a body-only check). The option still needs a cost effect.

**`relationshipStates[].requiresTrait`** — the state is reachable only by a commander with that trait (`sworn` needs `vow_of_distance`).

**`activities`**: the effect `{ type: 'commander_body_xp', stat }` (with a focus `when`) trains a body stat; the amount is `TUNING.commander.bodyXpPerSession`, not authored.

## Discipline content (P9)

Five registries and a few fields; the engine reads each by **type or field, never by id**, so everything below is JSON. Texts marked `AUTHOR TO WRITE` in core are drafts. A commander has no pronoun in any text (overview §3; `tests/content/pronouns.test.ts` checks every field below).

**`commandStances`** — exactly the five ids `disciplined`, `defiant_loyal`, `fearful`, `open_defiance`, `indifferent` (the quadrants of Trust ≥ 45 × Impunity ≥ 50, plus the `indifferent` zone: Trust 30–44, Impunity 35–59; the numbers are `TUNING.impunity.stance`). Fields: `{ id, name, description ≤ 600, directive ≤ 300, refusal ≤ 300, covert?, demandWeight 0…3 }`. `directive` is the stance text the main model reads (`{name}`); `refusal` is the text of a refused order (`{name}`, `{reason}`); `covert: true` makes the refusal hidden and gives the unit random sabotage. P9c adds two optional data flags: `hidesInjury: true` (a unit in this stance hides a bad injury after a run: a squad secret) and `secretSlip: true` (she lets a squad secret slip at a scene end). Code reads the flags, never the stance ids; core: `hidesInjury` on `defiant_loyal` and `fearful`, `secretSlip` on `open_defiance`.

**`punishments`** — the ladder under the Leash: `{ id, label, description, severity 1…4, impunityDelta −40…0, deltas { trust, affinity, stress }, sideEffects[], perception[], dispositionScaling: 'loss' | 'none' }`. The row is the unit's reaction before multipliers: image consistency, her state and defects and the disposition `lossMult` apply on top (`'none'` skips only the disposition). `perception: [{ tag, multiplier 0.5…3 }]` multiplies the deltas **and** `impunityDelta` when the tag is among her likes, dislikes or triggers (the highest match wins). Side-effect vocabulary (closed; at most one of the first four per punishment): `confine { minDays, maxDays }` (1…7), `no_leave { days }`, `bench {}`, `duty {}`, `resource { resource: credits|supplies|plyx, amount }`. To add a punishment: one entry; the menu, the extraction list (`measureList`), the chips and the reading pick it up.

**`demandTemplates`** — `{ id, kind: resource|privilege|exclusion|item|information|interpersonal, text ≤ 240 (her words, `{name}`), description, grantCost[], grantDeltas { trust, affinity }, refuseDeltas { trust, affinity, stress }, costly?, conditions { stances?, impunity?: [lo, hi], dispositionRanks?: [lo, hi], tagsAny?, statesAny?, flagsNone? }, weight 0.1…20 }`. Cost vocabulary (closed): `resource { resource, amount }`, `squad_stress { amount }` (every other living unit), `relation_flag { flagId }`, `bench_self {}`, `equip_item { slot, minRarity }`, `reveal_crime {}`, `other_unit_event { event, severity }` (one other named unit, lowest Affinity). A template is eligible only when its conditions hold **and** its cost can exist (an unworn item, another unit, a crime not yet known). `costly: true` makes a grant a big gesture (the disposition `bigGestureMult`).

**`reputations`** — nicknames: `{ id, name, group, description, pattern { sum: DeedCounter[], min, against?: DeedCounter[], minShare? }, effects { impunityBase?, directive?, valueReactions?: [{ axis, sign '+'|'-', weight −3…3 }] } }`. One nickname per `group` is active, at most two overall. `DeedCounter` is one of `leash_compel`, `leash_suppress`, `leash_terminate`, `grunts_lost`, `protected`, `defiance_tolerated`, `punish_1…4`, `promises_kept`, `promises_broken`, `demands_granted`, `demands_refused`, `threats_kept`, `threats_empty` (a new counter is a code change: `DEED_COUNTERS` and a `countDeed` call at the place it happens). `effects.directive` is told to the main model in every scene while the nickname is active; `valueReactions` move each named unit's Trust (2 × weight) and Affinity (3 × weight) once when it is introduced, for units whose value on that axis has the sign.

**Leverage (secrets).** A relation flag in `flags.json` with `"leverage": true` is something a unit holds over the commander: +5 to her Impunity each (cap 15). Core marks `knows_crime`; a crime with `"damaging": false` gives none. P12's secrets add their flags this way, with no code.

**Other fields.** `dispositionLevels[].impunityBase` (0…100; default 35 when a pack omits it), `relationshipStates[].dependency` (0…40; core: `dependent` 15), `eventDeltas` rows for `defied`, `commander_enforced` (the fallback row for a measure the registry no longer has), `commander_yielded`, `threatened`, `granted_demand`, `refused_demand`, the world option `acquaintance` (effect `acquaintance_grace { days }`; no `lore` line, `WorldChoice.lore` is optional). A new player-facing entry gets a `description` and the four registries above are in `DESCRIBED_REGISTRIES`.

## Desire and bond content (P9d)

Two registries and a few fields; the engine reads each by **type or field, never by id**. Texts marked `AUTHOR TO WRITE` in core are drafts; a commander has no pronoun in any of them.

**`contentCategories`** — `{ id, label, description, order }`: what the player can switch on (all off by default; turning one on is full consent for it to appear). `explicit_scenes` is the old single switch. Any entry of a gated registry (`relationshipRuleTemplates`, `demandTemplates`, `punishments`, `dilemmaTemplates`, `missionTemplates`, `clocks`) may carry `contentTags: [category ids]`; with a category off the engine never hands it out. A pack that adds a gated registry lists it in `CONTENT_GATED_REGISTRIES` and adds a probe to `GATE_PROBES`.

**`relationshipRuleTemplates`** — `{ id, text ≤ 240, description, contentTags?, check: 'daily_contact'|'run_without_asking'|'intent'|'token_wear' (P9c: wearing a token from anyone else breaks it; `no_other_tokens` uses it and carries `jealousy_games`), keepDeltas { trust, affinity }, breakDeltas { trust, affinity, stress }, conditions { minLead?: 'assertive'|'dominant', tiers?: ('romantic'|'close')[] }, weight }`. `text` is the fallback wording; the app words a proposal in her voice when the setting `ruleWording` is on.

**`relationshipStates[]`** — `bondTier: 'romantic'|'close'` (the tier that carries Want, publicity and a scene lead, or lets her propose rules) and `leadBonus` (added to the lead score while her style is at least assertive). A new state sets them in JSON.

**`defects[]` fields** — `requiresBond { caretaker }` (import candidates, the manual list and validation), `leadBonus`, `eventStress { <event type>: −10…10 }` (stress added when that event lands on her; negative relieves), `embraceFlag` (a relation flag written when she is on the Embrace path; halves her positive `eventStress` while set), `wantBreakdown { kind: withdrawal|binge|smother|seize, days 1…3 }`.

**`demandTemplates`** — kind `desire` (never rolled by the weekly demand roll; opened by Want's own cadence), cost `{ type: 'night_visit' }`, field `wantRelief` (what granting lowers Want by), condition `publicityMismatch: true`. **`activities[].wantRelief`** — what a companion lowers Want by (core: `train` 15; other activities use `TUNING.bonds.want.relief.companion`). **`eventDeltas`** — rows for `followed_lead`, `rule_accepted`, `rule_refused`, `compromise_reached`; `rule_kept` / `rule_broken` carry empty rows (the template's deltas apply). **Combat** — conditions `orderedThisRound`, `commanderBuildIn: [archetypes]`; effect `outgoing` with `vs: 'heal'` scales the owner's heals; an `order_refusal` in a breakdown's `onEnter` makes the others refuse her allies' orders by chance.

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

## `loyaltySigns` (P6)

The warnings before a refusal, a desertion or a mutiny. `{ id, about: doubt|desertion|mutiny, kind: dm|fact|talk, level?: 1|2, text ≤ 200 }`; a `mutiny` sign needs a `level`. `dm` is a message from her (named units only), `fact` a public fact, `talk` a "we need to talk" night knock; a grunt always gets a `fact`. `{name}` in `text` is replaced by the unit's name. The engine needs at least one `doubt` of each kind, a `desertion` `dm` and `fact`, and mutiny signs of level 1 and 2.

```json
{ "id": "sign_desertion_fact_1", "about": "desertion", "kind": "fact", "text": "{name} was seen packing her field kit twice this week and unpacking it once." }
```

## `dilemmaTemplates` (P6: generated dilemmas)

A template with a `generate` block is written by the mechanic model; its authored `fixed` block (not `flavor`, ≥ 2 options) is the fallback shown with no mechanic profile, a failed call, the setting off, or after two rejected answers.

| Field | Type | |
|---|---|---|
| `generate` | `{ brief ≤ 300 }` | What the model is asked to write about. |
| `optionCount` | int 2–4, default 3 | Exactly this many options. |
| `contexts` | `expedition_event`\|`base`\|`mission_outcome`\|`defect_arc`\|`director` | Where it may appear. A template without `expedition_event` may not use `carried_supplies`, `party_hp` or `loot` in `fixed`. |
| `requiredRefs` | `{ units?: 1–4, factions?[], regions?[], clocks?[] }` | Needed to be drawn (checked against the registries). |
| `allowedFlags` | flag ids | The declared flags the model may set. |
| `constraints` | `{ flagPerOption?: boolean }` | Every option sets exactly one allowed flag, no two the same (needs `allowedFlags.length ≥ optionCount`). |

```json
{ "id": "dil_rations", "scale": "minor", "contexts": ["base"], "optionCount": 2,
  "generate": { "brief": "The mess hall is short on rations. Someone has to go without, or the commander finds food off the books." },
  "fixed": { "title": "Short rations", "setup": "The mess hall count is wrong again.", "options": [
    { "label": "Cut everyone's portions", "effects": [{ "type": "resource", "resource": "supplies", "amount": 3 }, { "type": "party_stress", "amount": 5 },
      { "type": "unit_event", "event": "decision_aligned", "severity": "minor", "targets": "named", "valueAxes": [{ "axis": "pragmatism", "direction": 1 }, { "axis": "mercy", "direction": -1 }] }] },
    { "label": "Buy rations on the black market", "effects": [{ "type": "resource", "resource": "supplies", "amount": 3 }, { "type": "resource", "resource": "credits", "amount": -15 },
      { "type": "faction", "factionId": "sable", "amount": 5 }] } ] } }
```

The model only chooses `kind`, `target`, `direction` and a `magnitude` word; the numbers come from the engine's tables, and the validator rejects a dilemma unless every option has a gain and a loss on different things, a `major`/`defining` one hurts someone by what she values, no option beats another everywhere, magnitudes fit the scale, and every flag is declared and allowed. `scale: defining` templates (the two beat-4 choices) are never drawn by pacing: one per spine beat, at least 7 days apart. **Fixed blocks of generating templates are checked by the same rules in the tests**, so write them as fair choices.

## `thread_flag` (P6 world effect)

`{ "type": "thread_flag", "threadId": "<thread>", "flagId": "thread:<threadId>:<slug>", "description": "<≤ 120>" }` stores a dynamic flag in the thread (≤ 12 per thread, a repeat is ignored). Not a cost effect. Authored content may not depend on it; only later dilemmas and director ticks of the same thread read it.

## Leash numbers in other registries (P6)

`crimes[].flaw|perk.effects`: `{ "type": "leash_weekly", "amount": −1 }` changes the weekly authorizations; `{ "type": "leash_trust_cost", "amount": 5 }` adds Trust to every Leash use. `synergies`: `loyalty_wavering` and `loyalty_breaking` carry the refusal chance of the loyalty bands (15 % / 35 %). `flags`: `leashed` and `arc_raised` are relation flags set by the engine.

## `hubRooms` (P10)

The outpost cross-section on the hub. Code reads rooms by `hosts`, `activityIds`, `sceneLocationId`, `facilityId` and `weights`, never by id, so a pack can add or replace rooms by data.

| Field | Type | |
|---|---|---|
| `label`, `description` | string | Shown on the room and in its panel and analysis reading (`description` ≤ 600; no pronoun for the commander). |
| `rect` | `{ x, y, w, h }`, numbers 0–100 | Position in percent of the cross-section; `x + w` and `y + h` must be ≤ 100. Rects should not overlap. |
| `sceneLocationId` | `locations` id | Where a scene starts when the player presses TALK in this room. The room is also closed in a slot its location is closed in. |
| `facilityId?` | `facilities` id | The routine pick skips the room while this facility is below level 1 (absent facility = always built). |
| `activityIds?` | `activities` ids | Their cards appear in the room panel, as in the OPS tab. |
| `weights` | `{ morning?, afternoon?, evening?, night? }`, ints 0–5 | Routine weight per slot (0 or absent = nobody picks the room then). |
| `likeTags?` | strings | A soldier with one of these among her `likes` weighs the room +2. Tags are free-form lowercase words from the card import. |
| `hosts?` | `injured`, `confined`, `duty`, `night` | The room that holds a soldier in that condition. Each of the four must be hosted by exactly one room of the pack. |
| `commanderCell?` | boolean | Marks the commander's own quarters (display only). |

```json
{ "id": "medbay", "label": "MEDBAY", "description": "Where the injured lie up and defects are worked on.",
  "rect": { "x": 34, "y": 46, "w": 32, "h": 32 }, "sceneLocationId": "medbay", "facilityId": "medbay",
  "activityIds": ["medbay"], "weights": { "morning": 1, "afternoon": 1, "evening": 0, "night": 0 },
  "likeTags": ["medicine"], "hosts": ["injured"] }
```

Where a unit is each slot is **derived**, not stored: away on an expedition → injured → confined → on extra duty in its slot → night → a weighted pick (the weight, +2 per liked tag) over rooms that are open and built, chosen by a hash of day, slot and unit id. The loader checks every id and the four hosts.

## `deviceSkins` (P10)

The casing of the PDA. The skin is chosen by: the SYS override → a skin bound to one of the commander's traits → to an unlock flag (world or commander) → to the commander's corporation → `ccp_standard` (which every pack that ships skins must contain). Ties go to registry order.

| Field | Type | |
|---|---|---|
| `name`, `description` | string | Shown in SYS and the analysis panel. |
| `kind` | `css` \| `image` | |
| `cssPreset` | `ccp_standard` \| `kestrel` \| `vesper` | Required for `css`: which decor `css/17-skins.css` draws. A new preset needs CSS and a decor builder in `src/ui/device/chrome.ts`. |
| `frameImage`, `frameSize { w, h }`, `screenRect { x, y, w, h }` | | Required for `image`: a front view with a transparent screen cut-out. `screenRect` is in **pixels of the frame image** and must stay inside `frameSize`; the screen keeps its place at any window size (percentages). |
| `overlay?` | `{ image, blend: overlay\|multiply, opacity 0–1 }` | An optional texture over the casing. |
| `ledColor`, `accent` | `#rrggbb` | The light and the casing accent (`--device-led`, `--device-accent`). |
| `label?` | string | The engraved model name and the first boot line. |
| `bindTo?` | `{ corporationId \| traitId \| unlockFlag }` | At most one key; the loader checks it against the registry. |

```json
{ "id": "vesper", "name": "Vesper Somatics", "description": "White ceramic and a teal light ring.", "kind": "css",
  "cssPreset": "vesper", "ledColor": "#3fd6c4", "accent": "#8fb9b2", "label": "VESPER", "bindTo": { "corporationId": "vesper" } }
```

An `image` skin whose frame fails to load falls back to the built-in `ccp_standard` chrome.

## `prologues` and `uiUnlocks` (P11)

A prologue is one entry per start, built from a shared skeleton: `prologue_skeleton` has every step; `prologue_<start>` has `extends: "prologue_skeleton"`, its own `startId` and only the steps (and fields of steps) it changes. The loader merges objects and **replaces arrays**, so write `order` and `authoredText` whole.

```jsonc
{ "id": "prologue_vesper", "extends": "prologue_skeleton", "startId": "start_vesper",
  "steps": { "tutorial": { "regionId": "quarantine_d7", "objective": "Walk the quarantine edge and bring the patrol back." } } }
```

| Field | Type | |
|---|---|---|
| `id`, `extends?` | | An entry with a `startId` is the prologue that start uses (exactly one per start); the skeleton has none. |
| `startId?` | a `starts` id | |
| `order` | step ids, ≥ 2 | Wizard steps first (`paper_form` and `dossier` kinds, **exactly one dossier, the last of them**), then campaign steps, `free` **last**. |
| `steps` | `{ [stepId]: step }` | Every id in `order` has a step and the other way round. |

A **step**: `kind` (`paper_form`, `scene`, `expedition`, `dossier`, `guided_slot`, `free`), `voice` (`terminal`, `corporate`, `paper`, `personal`), `completion` (`manual`, `no_open_scene`, `all_spoken`, `tutorial_returned`, `debriefed`, `next_day`; a `paper_form` is `manual`, a `perUnit` scene `all_spoken`), `skippable`, and as needed `title` (≤ 60), `authoredText` (≤ 8 lines of ≤ 400), `lines` (`{ key: text ≤ 200 }`; code looks up `ask_crime`, `ask_name`, `confirm_owner` with `{CORPORATION}`, `intro`, `dictate` with `{FIELD}` / `{VALUE}`, `traits_note`, `sign_prompt`), `directive` (the scene goal, ≤ 400, the main model reads it as a hard constraint), `fields` (`crime`, `name`, `body`, `expression`, `seasoning`, `traits`: each at most once in a prologue, **all six once** in an entry with a `startId`), `locationId` + `exchangeCap` (1–12; required for a `scene`), `perUnit`, `expeditionId` + `regionId` (required for an `expedition`; the template needs `tutorial: true`), `objective` (≤ 100; what the hub shows during the step), `hints` (≤ 4 of `{ id, screen: combat|expedition, glossaryId, text }`), `nightKnock` (`{ framing with {name}, ignore: { event, severity } }`).

**No pronoun for the commander** in any of it (soldiers are "she"); `tests/content/pronouns.test.ts` scans `steps` and every `notice`. Every id is checked against its registry on load.

**Tutorial run:** a `missionTemplates` entry with `"tutorial": true` and a `fixedMap` `{ layers: [[{ type, eventId? }, …], …] }` (1–4 layers of 1–3 nodes; `type` a node type that is not `objective`, `eventId` a `dilemmaTemplates` entry with context `expedition_event`; every node links to every node of the next layer, the objective node follows and plays as the template's `objectives[0].node`). It is never offered by the board, the director, the fallback or a rumor; the events a fixed map names are never drawn at random. Give its event `generate.brief` and a `fixed` block (the usual dilemma rules apply).

**`uiUnlocks`** `{ id, target: { tab }, condition: { minDay?, afterStep? }, notice ≤ 160 }`: `tab` is one of `squad ops map comms base inv log sys`; `afterStep` names a step of **every** prologue (done or skipped). A tab with several rows needs all of them to hold; a tab with no row (LOG, SYS) is always open. The notice is shown in the terminal voice when the tab comes online. Locked tabs exist only while a prologue is under way.

## `uiSounds` (P10)

Eight fixed ids (`open`, `close`, `tab`, `notify`, `alert`, `stamp`, `typing`, `hum`); this registry is not player-visible (no `description`).

| Field | Type | |
|---|---|---|
| `id` | one of the eight | |
| `synth` | `{ wave: sine\|square\|triangle\|sawtooth, freq, endFreq?, ms, gain 0–1 }` | The WebAudio fallback: a wave, a frequency sweep, a length and the peak gain (before the volume setting). |
| `file?` | path | Played instead of the synth when present and it loads (a failed load falls back to the synth). The hum is always synthesized. |

Effective peak gain = `soundVolume / 100 × synth.gain`; muted or volume 0 plays nothing.

## Art, audio and fonts (P10)

All paths are relative to the extension folder and are requested only from there.

| What | Path | If missing |
|---|---|---|
| Hub cross-section | `content/core/art/hub/base_<slot>.png` (`morning`, `afternoon`, `evening`, `night`), else `content/core/art/hub/base.png` — **and listed in the manifest's `art.hub`** (an unlisted file is never requested) | The CSS blueprint (rooms stay where `rect` puts them). |
| Device frame / overlay | the skin's `frameImage` and `overlay.image` | `ccp_standard` chrome / no overlay. |
| UI sound files | an entry's `file` (suggested `content/core/audio/<id>.ogg`) | The synth. |
| Fonts | `fonts/*.woff2`, licences in `fonts/LICENSES/` | The fallbacks in `--alius-font*`. |

Fonts are latin woff2 subsets from the `@fontsource` packages: IBM Plex Mono (400, 600), Saira Stencil One (400), Inter (300, 400, 600) — SIL OFL — and Special Elite (400) — Apache-2.0. Declare new ones in `css/01-fonts.css` with a relative `url("fonts/…")` and `font-display: swap`; `tests/assets.test.ts` fails on a missing file, a remote url, an `@import`, a font over 120 KB or a missing licence file.

## Squad power (P9b)

All of it is data: a vote kind, a feat, a lean and a countermandable activity are JSON entries. Every text below is a draft (`AUTHOR TO WRITE`).

### `voteKinds`
One entry per votable decision; the id must be one of `mission`, `upgrade`, `punish`, `rations`, `scapegoat` (the engine gates exactly these five). `lean` is the kind's base lean: how the decision pushes each value axis, `−2…2` (absent axis = 0). A ballot adds `Σ value × lean`. `features.danger` (× `(danger − 3) / 2`) and `features.command` (× 1 for a command mission) add to a mission's lean; `subjects[<id>]` adds the lean of a ration mode or a scapegoat answer. `reasons` is one line per ballot term (`values`, `trust`, `stance`, `demand`, `affected`) and side (`for`, `against`), at most 120 characters, each naming the voter with `{name}`; the values line may name the axis with `{axis}`. The loader rejects a reason without `{name}`. No pronoun for the commander (write "the commander").

### Leans on other entries
`missionTemplates[].voteLean` and `facilities[].voteLean` are the same `−2…2` map: how a squad leans on a run of that template or on upgrading that facility. `commandStances[].voteBias` (`−3…3`) is added to a ballot by the stance she is in.

### `outsideFeats`
`{ id, label (≤ 40), description, trigger }`. `trigger` is a closed vocabulary the engine reads: `crisis_cover` (a won fight that exposed the commander, covered, commander standing), `ordered_mission` (a command mission secured after at least one combat order in the run), `negotiation` (a passed social route or social check). The first entry with a trigger is the one noted; a feat holds outside perception back for 14 days. A new trigger needs a generic hook in code, never a one-off.

### `activities[].countermandable`
`true` lets the squad leader countermand that activity when it names another unit (a companion or a picked unit). Core: `train`, `rest`, `work`, `study`. Keep it to minor, non-combat orders.

### The scapegoat template
`dilemmaTemplates` entry with `contexts: ["scapegoat"]` and an authored `fixed` block (no `generate`: pacing never draws it, no model is asked). Options carry an `id` slug (`take_blame`, `shift_blame`) the engine tells apart. `setup` and labels may use `{name}` (the unit who answers for it) and `{mission}`. Effects may use `unit_event` with `targets: "subject"` or `"witnesses"` and the effect `oversight_punish { days 1–3, stress 0–20 }`; both load only on a template with the `scapegoat` context.

### World options
`squad_assertiveness` choices carry `{ type: 'squad_power', privilegeMult, demandMult, commanderVoteMult, soldierVoteMult? }` (the last is each named soldier's own vote weight, default 1); `voting`'s `on` choice carries `{ type: 'voting' }`. Both are `live: false`. The lore lines are short (the WORLD SETTINGS block holds about 120 tokens for every option together).
