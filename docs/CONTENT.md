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

`roles, skills, signatures, statuses, defects, items, affixes, enemies, enemyCategories, regions, nodeTypes, activities, facilities, crimes, corporations, starts, relationshipStates, eventDeltas, dilemmaTemplates, settingsPresets, flags, marks, locations, orders, synergies, recipes, lootTables`

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

## Spine beats (P5)

`starts[].spine[]` gains optional fields: `conditions { minDay?, flagsAll?[], flagsNone?[], clearanceMin?, threads?[{ id, status }] }` (when the director may propose the beat), `completion` (`{ "kind": "auto" }` default \| `{ "kind": "mission", "templateId", "regionId" }` — a template with source `story` \| `{ "kind": "flag", "anyOf": [flag ids] }`) and `onComplete: WorldEffect[]`. Beats are reached in order, never skipped; after the last one the director runs open-ended.

## `defects[].expedition` (P5)

`{ "reveal": 1 }` — the node map shows one more step ahead while a party member has the defect (`echo_bleed`).

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
