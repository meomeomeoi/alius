# P4 Combat, Progression & Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Short, tactical turn-based combat with zero LLM calls (rows, initiative, CP orders, statuses, cooldowns, stress bands and breakdowns, relationship synergies, Commander Crisis, easy retry, deterministic auto-resolve), plus levels and skill trees, equipment with rarities and affixes, loot, workshop crafting, a combat screen, the INV tab and a headless balance harness.

**Architecture:** All rules are pure engine code under `src/engine/combat/` (one file per concern) plus `src/engine/progression.ts` and `src/engine/items.ts`, exposed as actions (`combat/*`, `squad/unlock_node|respec|set_loadout|release_breakdowns`, `item/*`, `campaign/set_difficulty`). Every combat behaviour of skills, signatures, defects, statuses, synergies, CP orders, enemy affixes and items is one **data-driven effect vocabulary** (Task 1) interpreted by one effect runner (Task 7); no defect, skill or item gets bespoke code. During a combat only `state.combat` and `state.rng` change; everything that touches the campaign (HP, stress, XP, injuries, deaths, loot) is written once when the combat is finalized, which makes easy retry an exact restore. A new pure layer `src/sim/` (engine + content only) is the balance harness behind `npm run sim`. The UI adds the `combat` screen, the INV tab and the SQUAD skill-tree/loadout/equipment views.

**Tech Stack:** TypeScript 5 (strict), esbuild, zod 3, vitest (+ jsdom for UI). No new dependencies (`npm run sim` bundles with the existing esbuild).

**Spec:** `docs/00-overview.md` (§5.4 lists the interfaces this plan uses), `docs/packages/P4-combat-progression-items.md` (including **Interfaces already provided by P2/P3**); content drafts `docs/content/roles.md` (all), `docs/content/defects.md` (combat effects), `docs/content/lore.md` §7 — read by Tasks 2–3 only.

## Global Constraints

- English everywhere: UI strings, identifiers, comments (overview P8).
- `src/engine/**` stays pure (architecture test): no imports from `src/st`, `src/ui`, `src/llm`, `src/scene`, `src/sim`; no `window`/`document`. `src/sim/**` may import only `src/engine` and `src/content` (new architecture test in Task 16).
- **Zero LLM calls in combat** (spec Goal, overview P7). The only P4 call is the optional, cached `flavor` kind `enemy` for affixed enemy names (off by default), which never blocks or changes combat.
- Content-like data lives in JSON (overview P4): skills and skill trees, signature mechanics, status mechanics, defect combat data, CP orders, synergies, enemies, enemy categories, affixes, items, recipes, loot tables. Rule constants live in `src/engine/tuning.ts` under new `TUNING.combat`, `TUNING.progression`, `TUNING.items`. If no effect type can express a behaviour, add a **generic** effect type to the vocabulary, never a one-off (overview §6.2).
- Formulas are fixed by roles.md §1: `dmg = round(ATK × mult × 100/(100+DEF) × (crit ? 1.5 : 1) × rand(0.9, 1.1))`, minimum 1; initiative `SPD + rand(0..3)`, ties → squad first, then higher base SPD, then lower combatant index; CP start 1 (+ `cp_start` crime perk), +1 at the start of every round after the first, max 5; rows max 3 per side.
- Stress bands (spec §2): ≥ 50 *strained* (every effect marked `downside: true` ×1.5), ≥ 80 *breaking* (25 % per turn to act by the breakdown policy), 100 → **breakdown** until the end of the expedition, stress locked at 100 until released.
- Named units **never die** in v1; grunts at 0 HP die in a lost combat and with `TUNING.combat.gruntDeathOnWin = 0.1` in a won one (`status: 'dead'`, they stay in `squad`, P2 rule).
- Relationship axes are never written by P4: post-combat feedback leaves as `relationHints` for P5 to pass to `intents/apply` (P3 rule). Injuries use P2's interface (`status: 'injured'`, `injuryDays`); Commander Crisis uses `commander/injure`'s logic.
- Campaign state stays `version: 1`. Every new field is optional and read through a defaulting helper, so P1–P3 saves load unchanged; `inventory: unknown[]` becomes `ItemInstance[]` (empty in every existing save).
- Metadata stays small (overview §5.1): `combat.log` and `lastCombat.log` keep the last `TUNING.combat.logMax = 300` entries; `enemyNames` keeps at most 100 names.
- `dist/index.js` and `style.css` are committed; `npm test` rebuilds them; commit them with each change.
- Commit messages end with the `Co-Authored-By:` / `Claude-Session:` trailers of the executing agent (overview P9).

## Where the code differs from the spec (read before Task 1)

Rulings taken while planning, where the spec is silent or the P0–P3 code already decides. List them in the spec's **Implemented as** section in Task 21.

- **Synergies are unit↔commander.** v1 has no NPC↔NPC relations, so a "friend pair" means a unit whose relation *with the commander* unlocks the synergy (`getSynergies` already works that way). `friend_assist` = Follow-Up after any ally's crit; `rival_edge` = flat +10 % damage. A new `synergies` registry defines what each id does; `resentful`/`estranged`/`despises` gain the new ids `order_friction_minor`/`order_friction`/`order_friction_major` (refusal chance 0.15/0.25/0.35 on CP orders targeting her; P6 adds `wavering`).
- **Stats.** `unit.baseStats` stays the role base (P1/P2 write it, `squad/resync` resets it). Effective stats are always computed: `base + floor(growth × (level − 1))`, then equipment, then injuries (−10 % per injury, at most 3), each stat floored at 1 (CRIT at 0). Armor weight costs SPD for the **heaviest** armor piece only (light 0, medium −1, heavy −3).
- **Level caps.** `levelCap(state) = TUNING.progression.levelCaps[world.clearanceTier ?? 0]` with caps `[10, 20, 30, 40]`; P5 writes `world.clearanceTier`. XP above the cap is kept and spent when the cap rises. P2 activities only add XP; P4 levels units after every activity (through `registerActivityHook`) and after every combat.
- **Skill trees** live on the role entry (`roles[].tree`): 3 branches × 5 tiers (cost 2/3/4/5/6) + one ultimate node (cost 6, needs any two tier-3 nodes) = 66 points. Tier pattern per branch: 1 active, 2 passive, 3 upgrade of the tier-1 active, 4 active, 5 passive. Every role also has 2 starter actives (no points). Loadout = up to 4 actives (+1 per `loadout_slots` effect) + signature (named units only) + ultimate (if unlocked).
- **Ultimates** cost their `cp` unless the unit is under `Authorize Ultimate` this turn.
- **Signature mechanics** live in the `skills` registry under the template's own id (`sig_last_stand` …); `signatures[].skill` points to it. Grunts ignore their signature (P2 note).
- **Items.** A template's `rarity` is its *minimum* rarity; an instance has its own rarity (`standard → anomalous` = index 1–5, stat multiplier `1 + 0.15 × (index − 1)`), upgrade level 0–5 (`× (1 + 0.08 × upgrade)`), and affixes (slots per rarity `[0, 1, 2, 3, 3]`; anomalous adds one drawback affix). An item is equipped by at most one unit; `Unit.equipment[slot]` holds the instance `uid` and is the only record of who wears it. Units with an empty slot fight with "standard issue" (no bonus); the SQUAD text `STANDARD ISSUE — PENDING` becomes `STANDARD ISSUE`.
- **Workshop.** The P2 `workshop` activity spends the slot; a P4 activity hook opens `state.workshopSession = { day, opsLeft: 3, companionId? }`. Craft, upgrade, reroll and dismantle need an open session of the current day and spend one op each. With a companion who likes `tech`, the session starts with a 25 % chance of a free +1 upgrade on her equipped weapon ("+quality chance"). Respec is not a workshop op (credits + plyx only).
- **Combat only writes `state.combat`.** Squad HP, stress, statuses and cooldowns live on combatants; `finalizeCombat` writes HP, stress, XP, levels, injuries, deaths, breakdowns and loot back. Hence `combat/retry` = restore `state.rng` to `combat.start.rng`, delete `combat`, rebuild from the stored start payload: deep-equal to the state right after the original `combat/start`. Retries are never logged; P4 writes no chronicle entries at all (P5's recap reads `lastCombat`).
- **Loot banking.** `combat/start { bankLoot }`: `true` adds loot to `inventory`/`resources` at finalize; `false` (P5 expeditions, the debug drill) only records it in `lastCombat.loot`. P5 banks it on return.
- **Breakdown persistence.** `Unit.breakdown = { defectId, day }` survives between combats; `squad/release_breakdowns` (P5 calls it on return; standalone combats with `expedition: false` release at finalize) clears it and emits `breakdown_released { unitId }` (P5 queues the debrief/night hook).
- **Easy retry** is the global setting `easyRetry` (default **off**), passed by the app as `combat/start { allowRetry }`. **Difficulty** is per campaign: `campaign/set_difficulty { difficulty }` (SYS); enemy stats × `TUNING.combat.difficultyMult = { story: 0.8, normal: 1, hard: 1.2 }`.
- **Auto-resolve** = `combat/auto { on: true }`: squad turns are chosen by the role AI profile (`roles[].aiProfile`) inside the same dispatch until the combat ends or AUTO is turned off at a later input. The pre-combat `[AUTO]` button is `combat/start` + `combat/auto`, offered only when `canAutoResolve` (encounter power ≤ 60 % of squad power).
- **Stalemate guard.** A combat still running after `TUNING.combat.maxRounds = 30` rounds ends as `retreated`.
- **Commander Crisis.** `encounter.exposesCommander` puts a commander combatant (HP `TUNING.combat.commanderHp = 60`, DEF 10, no turn) in the squad back row; `combat/start` requires `coverId` (a fielded unit). Hits on the commander go to the cover unit while she stands; if the commander drops, the combat is lost and the commander is injured for `TUNING.combat.commanderInjuryDays = 3` through the extracted `injureCommander(draft, days)` (the app's existing `commander_injured` follow-up queues P3's reactions).
- **Relation hints** (for P5's debrief): cover unit took ≥ 1 hit → `{ type: 'protected', actor: unitId, targets: [] }`; Steady/Hold the Line/Fall Back on a unit below 30 % HP → `{ type: 'protected', actor: 'commander', targets: [unitId] }`; unit downed → `{ type: 'endangered', actor: 'commander', targets: [unitId] }`. Severity by amount (`minor` < 15 % max HP, `moderate` < 40 %, else `major`), one hint per (type, actor, target), highest severity kept.
- **Neutrality check** puts the defect on all four harness units (with) versus no defect (without), paired by seed. The report is generated and committed; the ±5 pp rule is reported, not enforced by `npm test` (spec acceptance 7: "tuning may continue").
- **Entry point without P5.** `app.startCombat(opts)` (for P5) and a SYS debug tool **Combat drill** (active roster, generated encounter at danger 1, `expedition: false`, `bankLoot: false`).

## File Structure

```
content/core/skills.json, orders.json, synergies.json, enemies.json, enemyCategories.json,
             affixes.json, items.json, recipes.json, lootTables.json            new registries (+ manifest)
content/core/roles.json, signatures.json, statuses.json, defects.json,
             relationshipStates.json                                            + combat fields / ids
src/content/types.ts                                                            REGISTRY_NAMES + orders, synergies, recipes, lootTables
src/content/schemas.ts, refs.ts                                                 effect vocabulary + new/extended schemas and refs
src/engine/state/types.ts                                                       Unit.loadout/breakdown, ItemInstance, CombatState, CombatResult, …
src/engine/tuning.ts                                                            TUNING.combat / progression / items
src/engine/combat/types.ts        Combatant, StatusInstance, Mod, LogEntry, Encounter, EffectSpec
src/engine/combat/stats.ts        unitStats, unitPower, squadPower, encounterPower, defaultFormation
src/engine/combat/formulas.ts     damage, crit, initiative order
src/engine/combat/targeting.ts    legalTargets, nearest/strongest selectors
src/engine/combat/effects.ts      effect runner, conditions, triggers, statuses
src/engine/combat/stress.ts       bands, addStress, breakdown entry and policies
src/engine/combat/build.ts        buildCombat (combatants, passives, synergies, commander)
src/engine/combat/turn.ts         rounds, turns, act, runUntilInput, end detection
src/engine/combat/ai.ts           chooseAction per aiProfile
src/engine/combat/orders.ts       CP orders, refusals, Commander Crisis redirect
src/engine/combat/encounter.ts    generateEncounter
src/engine/combat/outcome.ts      finalizeCombat, relation hints
src/engine/combat/index.ts        exports for P5/P6
src/engine/progression.ts         xp, levels, caps, tree unlocks, respec, loadout
src/engine/items.ts               instances, item stats, equip rules, loot, workshop ops
src/engine/calendar.ts            + injureCommander (extracted)
src/engine/actions/combat.ts, progression.ts, items.ts                          new actions
src/sim/harness.ts, src/sim/cli.ts, scripts/sim.mjs                             balance harness
src/llm/calls/flavor.ts                                                         + kind 'enemy'
src/settings.ts, src/ui/shell/sysTab.ts                                         easyRetry, enemyFlavor, difficulty
src/ui/combat/combatScreen.ts, bars.ts, keys.ts                                 combat screen
src/ui/inv/invTab.ts, src/ui/squad/skillTree.ts, squadTab.ts                    INV tab, SQUAD tree/loadout/equipment
src/ui/scene/cutIn.ts                                                           + optional image (additive)
src/app.ts                                                                      wiring
css/70-combat-inv.css
docs/** (Task 21), tests/** mirror src
```

## Review Focus

1. **A combat that cannot end** (two healers, every enemy untargetable or stunned, every squad unit in a `skip` breakdown or awaiting an order with 0 CP) → turns keep passing, a unit with no legal action passes automatically, and round 31 ends the combat as `retreated`; one dispatch never loops forever. Tests in Task 9 (`stalemate ends as retreated at the round cap`, `a unit without a legal action passes`).
2. **Reload or chat switch mid-combat** → `state.combat` round-trips through JSON and continues identically; reopening the campaign shows the combat screen at the same turn; a late dispatch for another chat is dropped (`expectChatId`). Tests in Task 9 (`combat continues identically after a JSON round trip`) and Task 20 (`reload with an open combat shows the combat screen`).
3. **Content or profile changed under a save** (a skill removed from the pack, an item template removed, `squad/resync` changed the role so an equipped weapon class is illegal, a unit injured/dead/reserve between formation and start) → `combat/start` rejects unavailable units with a reason; unknown skills drop out of the loadout; unknown or illegal items are ignored by `unitStats` and shown as `UNKNOWN`/`NOT CERTIFIED` in SQUAD. Tests in Tasks 4, 5 and 9.
4. **Easy retry abuse and repeats** (retry twice, accept after a retry, retry after the app saved mid-combat, a retry when `allowRetry` was false, a win cannot be retried) → each retry is an exact restore of the post-start state, XP/loot are granted once, the chronicle never changes. Tests in Task 14.
5. **CP spam and free orders** (Compliance Craving + `confidant_sync` stacking cost reductions, `sig_command_echo` repeating an ultimate authorization, orders while no squad unit is awaiting input) → order cost floors at 1, echo cannot repeat itself, orders are accepted only in `awaiting` phase. Tests in Task 11.

---

### Task 1: Effect vocabulary and combat content schemas

**Files:**
- Modify: `src/content/types.ts` (REGISTRY_NAMES + `orders`, `synergies`, `recipes`, `lootTables`), `src/content/schemas.ts`, `src/content/refs.ts`, `src/engine/combat/types.ts` (create; effect types only)
- Test: `tests/content/schemas.test.ts` (extend), `tests/content/combatSchemas.test.ts`

**Interfaces:**
- Produces in `combat/types.ts` (pure types + const arrays, imported by schemas): `TRIGGERS = ['onCombatStart','onRoundStart','onTurnStart','onAction','onHit','onCrit','onDamaged','onAllyDowned','onKill','onStressThreshold','onCombatEnd']`; `EFFECT_TYPES = ['damage','heal','revive','status','cleanse','stat','outgoing','incoming','stress','stress_taken','cp','move','extra_action','redirect','intercept_lethal','summon','follow_up','misfire','override_action','lock_target','loot_roll','repeat_order','hp_set','immune','order_cost','order_refusal','loadout_slots','injury_days']`; `EFFECT_TARGETS = ['self','target','source','allies','allies_other','enemies','own_row','target_row','random_enemy','lowest_hp_ally','commander']`; `STATS = ['hp','atk','def','spd','crit']`; `type EffectSpec` (below).
- `EffectSpec` common fields: `type`, `trigger?` (absent = on use for skills, always-on for passives), `scope?: 'self'|'ally'` (whose hit/crit/kill fires it; default `self`), `threshold?: 50|80|100` (only with `onStressThreshold`), `target?` (default `target` for skills, `self` otherwise), `when?: Condition`, `chance?: 0..1`, `downside?: boolean`, `limit?: 'round'|'combat'`. Per type: `damage { mult, hits?=1, ignoreRows?, critBonus?, scale? }`, `heal { pctMaxHp }`, `revive { pctMaxHp }`, `status { statusId, turns?, stacks?=1 }`, `cleanse { kind: 'buff'|'debuff', count }`, `stat { stat, pct, turns?, scale? }`, `outgoing { pct, vs?: 'any'|'marked'|'locked' }`, `incoming { pct }`, `stress { amount }`, `stress_taken { pct, direction: 'gain'|'relief' }`, `cp { amount }`, `move { to: 'front'|'back'|'swap' }`, `extra_action {}`, `redirect { pct, turns, from: 'ally'|'commander' }`, `intercept_lethal { protect: 'commander'|'ally' }`, `summon { enemyId, max }`, `follow_up { mult }`, `misfire { chance }`, `override_action { policy: 'aggressive' }`, `lock_target { turns }`, `loot_roll { extra }`, `repeat_order {}`, `hp_set { value }`, `immune { statusId }`, `order_cost { delta, orders?: string[] }`, `order_refusal { orders?: string[] }` (chance in `chance`), `loadout_slots { amount }`, `injury_days { pct }`. `scale = { by: 'stress_above'|'own_hp_missing_pct'|'allies_hp_missing_pct', per: number, base?: number }`.
- `Condition` (all keys optional, all present must hold): `hpBelowPct`, `hpAbovePct`, `stressMin`, `stressMax`, `roundMin`, `targetHasStatus`, `selfHasStatus`, `aloneInRow`, `sameRowAndSkill`, `rowChanged`, `commanderExposed`, `notOrderedThisRound`, `upkeepWithinDays`, `upkeepOlderThanDays`.
- Produces in `schemas.ts`: `CombatEffectSchema` (discriminated on `type`, strict per type; `threshold` only with `onStressThreshold`; `scope: 'ally'` only with `onHit|onCrit|onKill`), `SkillSchema` (`id, name, kind: 'active'|'passive'|'ultimate'|'enemy'|'signature', description, cooldown ≥0, cp?, stressCost?, usableFrom: ('front'|'back')[] ≥1, targets: { side: 'enemy'|'ally'|'self', rows: ('front'|'back')[], count: 'one'|'row'|'all', melee?: boolean }, effects ≥1, tags[]`; passives need every effect to have a trigger or be always-on), `RoleSchema` + `growth {hp,atk,def,spd,crit}`, `aiProfile`, `starterSkills [2]`, `tree: TreeNode[]` (`{ id, branch: 0|1|2|null, tier: 1..5|null, cost, requires: string[], grants: { skill } | { upgrade: { skillId, cooldownDelta?, multPct?, addEffects? } } }`, exactly 16 nodes, one with `branch: null`), `SignatureSchema` + `skill`, `StatusSchema` + `turns, maxStacks, stackMode: 'add'|'refresh', tick?: EffectSpec[], mods?: Partial<Record<stat, pct>>, incomingPct?, flags?: ('skipTurn'|'taunt'|'untargetable'|'absorb')[]`, `DefectSchema` + `combat?: { upside: EffectSpec[], downside: EffectSpec[] (each must carry downside: true), breakdown: { policy: 'skip'|'repeat_last'|'random_skill'|'attack'|'await_order'|'twice_then_shutdown'|'normal', target?: 'nearest_enemy'|'strongest_enemy'|'nearest_any'|'nearest_ally', ignoresOrders: boolean, once?: boolean, onEnter: EffectSpec[], actionEffects: EffectSpec[] } }`, `OrderSchema` (`name, summary, cost 1..5, target: 'none'|'ally'|'enemy', effects`), `SynergySchema` (`name, summary, effects`), `EnemyCategorySchema` (`name, frequency: 'common'|'rare'|'very_rare', summary`), `EnemySchema` (`categoryId, name, stats { base, growth }, skills ≥1, eliteSkill?, aiProfile: 'aggressive'|'predator'|'protector'|'disruptor'|'stressor'|'erratic', rowPreference: 'front'|'back', power, portrait: { ascii: string[1..8], image? }, tags`), `AffixSchema` (`name, appliesTo: 'enemy'|'item', adjective?, slots?, drawback?, statPct?, effects, extraSkill?: boolean`), `ItemSchema` (`slot, class, rarity, baseStats (partial stats), affixSlots?, effects, value`), `RecipeSchema` (`itemId, rarity, cost { credits, plyx }`), `LootTableSchema` (`rolls, entries: [{ weight, kind: 'item'|'credits'|'plyx'|'supplies', itemId?, rarityWeights?, amount?: [min,max] }]`). Export `type Skill = z.infer<typeof SkillSchema>`. Add the P4 engine event names (`combat_started`, `combat_log`, `combat_awaiting`, `combat_ended`, `combat_cutin`, `order_refused`, `level_up`, `node_unlocked`, `loot_banked`, `item_crafted`, `item_upgraded`, `item_equipped`, `breakdown`, `breakdown_released`, `workshop_opened`) to `RESERVED_EVENT_TYPES`.
- Refs: skill effect `status.statusId`/`immune.statusId` → statuses; `summon.enemyId` → enemies; roles `starterSkills`, `tree[].grants.skill|upgrade.skillId` → skills, `tree[].requires` → same role's nodes (check); signatures `skill` → skills; enemies `categoryId`, `skills`, `eliteSkill`; items `class` checked against the union of role `weaponClasses`/`armorWeights`; recipes `itemId` (rarity ≥ template rarity); lootTables `itemId`; relationshipStates `unlocks.synergies` → synergies; defect `combat` effects' status ids; order effects' status ids.

- [x] **Step 1: Write the failing tests** — `every effect type parses its minimal example and rejects an unknown field`; `threshold without onStressThreshold is rejected`; `scope ally on onTurnStart is rejected`; `a downside effect without downside: true is rejected`; `role tree needs 16 nodes and exactly one ultimate node`; `skill with an empty usableFrom is rejected`; `enemy with no skills is rejected`; `loot entry kind item needs itemId`; `refs: unknown status, enemy, skill, category, item and synergy ids are reported with their path`; `tree requires pointing to another role's node is reported`; `REGISTRY_NAMES contains orders, synergies, recipes, lootTables`; `emit_event cannot impersonate combat_ended`.
- [x] **Step 2: Run** `npx vitest run tests/content` → FAIL.
- [x] **Step 3: Implement** schemas, refs and the type module. Until Task 2 fills them, the new fields on `roles`, `signatures`, `statuses`, `defects` are optional so the core pack still loads; Task 2 makes them required.
- [x] **Step 4: Run** `npx vitest run` → whole suite green; `npm run typecheck` clean.
- [x] **Step 5: Commit** `feat(content): combat effect vocabulary and P4 registry schemas`.

---

### Task 2: Core content — role skills, signatures, statuses, orders, synergies, defect combat data

**Files:**
- Create: `content/core/skills.json`, `orders.json`, `synergies.json`
- Modify: `content/core/manifest.json`, `roles.json`, `signatures.json`, `statuses.json`, `defects.json`, `relationshipStates.json`, `src/content/schemas.ts` (P4 fields required), `tests/content/core.test.ts`

**Interfaces:**
- Consumes: Task 1 schemas. Numbers are draft balance (author tunes); ids below are fixed because tests and later tasks use them.
- Roles (roles.md §1–2): add `growth` (draft: hp 5–8, atk 0.8–1.4, def 0.4–1.0, spd 0.1–0.2, crit 0.1–0.3 per level), `aiProfile` (`assault` aggressive, `defender` protector, `sniper` predator, `support` protector, `medic` protector, `specialist` disruptor), 2 starters, 16-node tree named after the roles.md branches. Every medic tree contains a `revive` (limit combat); every support tree a `cp` effect; defender trees a `status taunt` and a `status guard`.
- Statuses (keep the 10 ids, add mechanics) + new ids `hold_line` (def +30 %, immune to `move`), `authorized` (ultimate free this turn), `untargetable` (flag), `focus` (marked target bonus, 1 round). Draft: `bleed` tick 4 % max HP/stack, `burn` tick 6 %, `stun` skipTurn, `mark` incomingPct +15, `guard` incomingPct −30, `taunt` flag, `corrode` def −15 %/stack (max 3), `infect` tick stress +3/stack, `overheat` atk/spd −10 %/stack, `shield` absorb.
- Orders (roles.md §5, ids fixed): `focus_fire` (2, enemy: status `mark` + `focus` 1 round), `hold_the_line` (2, none: front row `hold_line` 1 round), `fall_back` (1, ally: `move swap` without spending her turn), `steady` (1, ally: `stress −10`), `authorize_ultimate` (3, ally: status `authorized`).
- Synergies: `trusted_cover` (incoming −20 when `commanderExposed`), `friend_assist` (onCrit scope ally → `follow_up 0.5`, limit round), `confidant_sync` (`order_cost −1` for orders targeting her), `kindred_sync` (onRoundStart stress −2 self, −1 allies_other), `spark` (stat crit +10), `lover_link` (outgoing +15 when `commanderExposed`), `devoted_sacrifice` (`intercept_lethal commander`, limit combat), `rival_edge` (outgoing +10), `order_friction_minor|order_friction|order_friction_major` (`order_refusal` chance 0.15/0.25/0.35). Add the three friction ids to `resentful`, `estranged`, `despises` unlocks.
- Signature skills (12, ids = template ids): last_stand (passive: when hpBelowPct 30 → outgoing +100 next attack, immune stun), shared_pain (active ally: redirect 50 % 2 turns), cold_read (active enemy: status mark + team crit +15 vs target), lullaby (active: stress −15 allies, +5 self), frenzy (active: damage 0.6 × 3 hits random_enemy, stress +5 self), mock (active: taunt self, enemies atk −10 %), vanish (active: status untargetable 1, next attack critBonus 100), command_echo (active: repeat_order), scavenge (passive onKill: loot_roll 1), overclock_burst (active: extra_action, then stun self 1), spite (active: damage scale allies_hp_missing_pct), anchor_words (active ally: stress set below 80 / ends her breaking — `stress −25` + cleanse 1 debuff).
- Defect combat data — all 18 (upside / downside(`downside: true`) / breakdown policy, target, onEnter, actionEffects):

| defect | upside | downside | breakdown |
|---|---|---|---|
| echo_bleed | onCombatStart status mark random_enemy | onRoundStart stress +2 when aloneInRow | random_skill, ignoresOrders |
| imprint_fracture | stress_taken gain −50 % (from enemies) | order_refusal 0.1 | attack nearest_enemy, ignoresOrders |
| threat_saturation | onCombatStart damage 0.5 random_enemy | onRoundStart stress +2 | attack nearest_any, once |
| compulsive_protocol | outgoing +15, crit +15 when sameRowAndSkill | onTurnStart stress +5, spd −10 % 2 turns when rowChanged | repeat_last |
| affect_dampener | stress_taken gain −50 % | stress_taken relief −50 % | skip |
| rage_governor | stat atk scale stress_above 30 per 1 | onDamaged stress +3; order_refusal 0.25 orders [hold_the_line] | attack strongest_enemy, ignoresOrders |
| latent_strain | when stressMin 50: atk +20 %, onTurnStart heal 3 % | onRoundStart stress +1 | attack nearest_enemy; onEnter damage 1.5 own_row (allies too) |
| hunger_loop | onTurnStart heal 5 % | — (supplies, P2) | attack nearest_enemy, ignoresOrders, actionEffects heal 5 % |
| pain_inversion | outgoing scale own_hp_missing_pct 0.5; immune stun | onCombatEnd injury_days +50 % | attack nearest_enemy; onEnter move front + immune move |
| graft_rejection | stat all +20 % when upkeepWithinDays 3 | stat hp −10 % when upkeepOlderThanDays 3 | normal; onEnter hp_set 1 + status stun 2 |
| overclock_bias | stat spd +15 %, atk +10 % | when roundMin 4: onRoundStart status overheat | twice_then_shutdown |
| sensor_ghosting | incoming −15 | misfire 0.1 | skip; actionEffects stress +5 own_row |
| firmware_rollback | loadout_slots 1 | onCombatStart status stun 1 chance 0.1 | attack nearest_any, ignoresOrders |
| target_lock | outgoing +40 vs locked | onAction lock_target 3 | attack nearest_ally, once |
| imprint_hunger | stat all +10 % | onRoundStart stress +1 | skip, ignoresOrders |
| possessive_protocol | intercept_lethal commander, limit combat | order_refusal 0.1 | attack nearest_any, once |
| reward_loop | stress_taken relief +100 % | override_action aggressive chance 0.15 | skip, ignoresOrders |
| compliance_craving | order_cost −1 for orders targeting her | onTurnStart stress +3 when notOrderedThisRound | await_order |

- [x] **Step 1: Write the failing tests** (`tests/content/core.test.ts`) — `core pack loads with zero errors` (existing); `every role has growth, aiProfile, 2 starters and a 66-point tree`; `every tree branch follows active/passive/upgrade/active/passive`; `every signature template has a signature skill`; `14 statuses with mechanics`; `5 orders with the roles.md costs`; `every synergy id unlocked by a relationship state exists`; `all 18 defects have combat data and every downside effect is marked`; `at least 6 defects use distinct breakdown policies`; `medic trees revive, support trees generate CP`; update the status count (14).
- [x] **Step 2: Run** `npx vitest run tests/content` → FAIL.
- [x] **Step 3: Write the JSON** and make the P4 fields required in their schemas. Text (names, descriptions) is data; never inline it in code.
- [x] **Step 4: Run** `npx vitest run` → green.
- [x] **Step 5: Commit** `feat(content): role skill trees, signature mechanics, statuses, orders, synergies and defect combat data`.

---

### Task 3: Core content — enemies, categories, affixes, items, recipes, loot tables

**Files:**
- Create: `content/core/enemyCategories.json`, `enemies.json`, `affixes.json`, `items.json`, `recipes.json`, `lootTables.json`, enemy skills appended to `skills.json` (`kind: 'enemy'`)
- Modify: `content/core/manifest.json`, `content/core/lorebook.json` only if it lacks the per-category entries (lore §9), `tests/content/core.test.ts`

**Interfaces:**
- Categories (lore §7, ids fixed): `mutant_human`, `mutant_beast`, `marauder` (common), `enemy_soldier`, `offspec_hostile` (rare), `anomaly` (very_rare).
- Enemies (18, 3 per category, every aiProfile used at least once, ASCII portraits ≤ 8 lines): `husk`, `swarmer`, `bloater` · `stalker`, `hound`, `brute` · `raider`, `scav_marksman`, `warlord` · `trooper`, `shield_trooper`, `field_officer` · `rogue_assault`, `rogue_medic`, `rogue_specialist` · `whisper`, `fracture`, `echo`. Mutants inflict `infect` or `bleed`; anomalies deal `stress` and use `ignoreRows`; `erratic` only on `fracture`.
- Enemy affixes (spec §6): `armored` (def +40 %), `regenerating` (onTurnStart heal 5 %), `reinforcing` (onRoundStart summon same category `husk`/`raider`/`trooper` style, max 1, chance 0.5), `volatile` (onAllyDowned scope self — fires on its own downing: damage 0.8 target_row), `bloom_touched` (onHit status infect), `swift` (spd +30 %), `elite` (all stats +40 %, `extraSkill: true`). Each has an `adjective` for the default name ("Armored Husk").
- Item affixes (≥ 8 positive, 3 drawbacks): e.g. `honed` (atk +8 %), `keen` (crit +5), `reinforced` (def +10 %), `padded` (hp +8 %), `light_frame` (spd +1 flat via stat pct on spd), `serrated` (onHit status bleed chance 0.2), `calming` (onRoundStart stress −1), `capacitor` (onCombatStart cp +1, limit combat); drawbacks `bloom_leak` (onRoundStart stress +2), `unstable_core` (onDamaged chance 0.1 status burn self), `parasitic` (stat hp −8 %).
- Items (18 templates): one `standard` weapon per class (`Blade, Pistol, SMG, Rifle, Shotgun, Precision Rifle, Heavy, Tech, Bio`), upper and lower in `light/medium/heavy`, and three `anomalous`-only (`bloom_fang` Blade, `whisper_coil` Tech, `grafted_plate` upper heavy). Recipes: every non-anomalous template at `standard`, weapons also at `refined` and `prototype` (≥ 24 recipes). Loot tables: `loot_standard` (credits, plyx, 25 % item mostly standard/refined), `loot_elite` (2 rolls, higher rarities), `loot_cache` (P5 cache nodes, supplies + items).

- [x] **Step 1: Write the failing tests** — `6 categories with the lore frequencies`; `18 enemies, 3 per category, every aiProfile used`; `7 enemy affixes and ≥ 8 item affixes with 3 drawbacks`; `every weapon class and armor weight of every role is craftable at standard`; `anomalous templates exist only above the workshop cap 4`; `loot tables reference known items and have positive weights`; `every enemy skill is kind enemy`.
- [x] **Step 2: Run** `npx vitest run tests/content` → FAIL.
- [x] **Step 3: Write the JSON.**
- [x] **Step 4: Run** `npx vitest run` → green.
- [x] **Step 5: Commit** `feat(content): enemies, affixes, items, recipes and loot tables`.

---

### Task 4: State types, tuning, effective stats and power

**Files:**
- Modify: `src/engine/state/types.ts`, `src/engine/tuning.ts`, `src/engine/combat/types.ts`
- Create: `src/engine/combat/stats.ts`
- Test: `tests/engine/combat/stats.test.ts`, `tests/engine/state.test.ts` (extend)

**Interfaces:**
- Produces in `types.ts`: `Rarity = 'standard'|'refined'|'prototype'|'corporate'|'anomalous'`, `RARITIES`, `ItemInstance = { uid: string; itemId: string; rarity: Rarity; upgrade: number; affixes: string[] }`, `inventory: ItemInstance[]`, `itemSeq?: number`, `Unit.loadout?: string[]`, `Unit.breakdown?: { defectId: string; day: number }`, `world.clearanceTier?: number`, `combat?: CombatState`, `lastCombat?: CombatResult`, `workshopSession?: { day: number; opsLeft: number; companionId?: string }`, `enemyNames?: Record<string, string>`. `CombatState`/`CombatResult`/`Combatant` are defined in `combat/types.ts` (Tasks 7–14 fill them; declare their final shape here: `Combatant { cid; side: 'squad'|'enemy'; unitId?; enemyId?; nameKey; level; row: 'front'|'back'; index; hp; maxHp; base: Stats; stress; statuses: StatusInstance[]; mods: Mod[]; cooldowns: Record<string, number>; skills: string[]; passives: Array<EffectSpec & { source: string }>; downed: boolean; aiProfile; breakdown?: { defectId; policy; target?; ignoresOrders; once?; used?: boolean; actionEffects }; lastSkillId?; lastRow?; lockedTargetId?; lockTurns?; usedLimits: string[]; aiAffixSkills?: string[] }`, `StatusInstance { id; turns; stacks; value?; sourceCid }`, `Mod { stat; pct; turnsLeft?; source }`, `LogEntry { round; kind: 'skill'|'hit'|'crit'|'miss'|'heal'|'status'|'downed'|'revived'|'order'|'order_refused'|'cover'|'intercept'|'breakdown'|'stress'|'summon'|'pass'; actor?; target?; amount?; skillId?; orderId?; statusId? }`, `PlannedAction { kind: 'skill'|'guard'|'swap'|'pass'; skillId?; targetCid? }`, `CombatState { id; round; phase: 'awaiting'|'lost_pending'; cp; timeline: string[]; turn: number; combatants: Combatant[]; commander?: { hp; maxHp; def; coverId; downed: boolean }; encounter: Encounter; formation; log: LogEntry[]; auto: boolean; allowRetry: boolean; expedition: boolean; bankLoot: boolean; start: { rng: RngState; payload: StartPayload }; ordersThisRound: Array<{ orderId; targetCid? }>; lastOrder?: { orderId; targetCid? }; extraAction?: string; pendingLootRolls: number; hints: RelationHint[] }`, `RelationHint { type: 'protected'|'endangered'; actor: 'commander'|string; targets: string[]; severity: Severity }`).
- `TUNING.combat = { maxRounds: 30, logMax: 300, cpStart: 1, cpMax: 5, maxPerRow: 3, critMult: 1.5, variance: [0.9, 1.1], initiativeRand: 3, strainedMult: 1.5, breakingChance: 0.25, commanderHp: 60, commanderDef: 10, commanderInjuryDays: 3, gruntDeathOnWin: 0.1, autoResolveRatio: 0.6, difficultyMult: { story: 0.8, normal: 1, hard: 1.2 }, injuryDays: 2, injuryStatPct: -10, injuryMaxStacks: 3, armorSpd: { light: 0, medium: -1, heavy: -3 }, stress: { critTaken: 6, allyDowned: 8, commanderHit: 5, refusedOrder: 6, kill: -2, loss: 10 } }`; `TUNING.progression = { levelCaps: [10, 20, 30, 40], xpToNext: { base: 40, perLevel: 20 }, combatXp: { base: 20, perEnemyLevel: 3, lowLevelBonus: 1.5, lowLevelGap: 2, gruntMult: 0.5 }, respec: { creditsPerLevel: 10, plyxPerLevel: 5 }, loadoutSize: 4 }`; `TUNING.items = { rarityStatStep: 0.15, upgradeStep: 0.08, maxUpgrade: 5, affixSlots: [0, 1, 2, 3, 3], upgradeCost: { credits: 20, plyx: 10 }, rerollPlyxPerRarity: 15, dismantlePct: 50, opsPerSession: 3, companionQualityChance: 0.25 }`.
- Produces in `stats.ts`: `type Stats = { hp; atk; def; spd; crit }`; `unitStats(state, reg, unit): Stats` (rules in "Where the code differs": growth, then equipment via `itemStats` from Task 5 — until Task 5, equipment contributes nothing — then armor SPD, injuries, floors); `statPower(s: Stats): number = s.hp × 0.2 + s.atk × 2 + s.def + s.spd × 1.5, × (1 + s.crit / 200)`; `squadPower(state, reg, unitIds)`; `encounterPower(reg, encounter, difficulty)`; `defaultFormation(state, reg, unitIds): { front: string[]; back: string[] }` (role `row`; `either` fills the smaller row; never more than 3 per row).

- [x] **Step 1: Write the failing tests** — `level 1 stats equal the role base`; `level 5 adds four levels of growth, floored`; `two injuries cost 20 %, a fifth injury counts as three`; `stats never drop below 1 (crit below 0)`; `a heavy and a light piece cost the heavy SPD only`; `unknown role gives a clear error, unknown item is ignored`; `power grows with level`; `defaultFormation puts defenders front, snipers back and never four in a row`; state: `a P3 save without P4 fields loads and reads empty inventory and no combat`.
- [x] **Step 2: Run** `npx vitest run tests/engine/combat/stats.test.ts tests/engine/state.test.ts` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** → PASS; `npm run typecheck` clean.
- [x] **Step 5: Commit** `feat(engine): P4 state types, combat tuning and effective unit stats`.

---

### Task 5: Items — instances, equip rules and loot rolls

**Files:**
- Create: `src/engine/items.ts`, `src/engine/actions/items.ts` (`item/equip`, `item/unequip` in this task)
- Modify: `src/engine/combat/stats.ts` (equipment through `itemStats`)
- Test: `tests/engine/items.test.ts`

**Interfaces:**
- Consumes: Task 4 types/tuning, Task 3 content.
- Produces in `items.ts`: `rarityIndex(r): 1..5`; `newItem(draft, reg, rng, itemId, rarity): ItemInstance` (uid `it_<itemSeq>`, increments `itemSeq`; rolls `affixSlots[rarity]` distinct non-drawback item affixes allowed for the slot, plus one drawback if anomalous; rarity below the template's rarity throws); `itemStats(reg, inst): Partial<Stats> & { effects: EffectSpec[] }` (template stats × rarity × upgrade, rounded; affix `statPct` applied to the template stats; effects = template + affix effects); `canEquip(state, reg, unit, inst): string | null` (`NOT CERTIFIED: <class>` when the class is not in the role's `weaponClasses`/`armorWeights`; unknown template → `UNKNOWN ITEM`); `equippedBy(state, uid): Unit | undefined`; `rollLoot(draft, reg, rng, tableId, opts?: { extraRolls?: number }): LootDrop[]` with `LootDrop = { kind: 'item'; item: ItemInstance } | { kind: 'credits'|'plyx'|'supplies'; amount: number }` (does not bank); `bankLoot(draft, drops): EngineEvent[]` (items into `inventory`, resources added, `loot_banked`).
- Actions: `item/equip { unitId, uid }` (living unit; `canEquip` null; unequips the item from its previous wearer and the unit's previous item in that slot; `item_equipped`); `item/unequip { unitId, slot }`.

- [x] **Step 1: Write the failing tests** — `newItem is deterministic per rng state and increments uids`; `refined has one affix, anomalous three plus one drawback`; `affixes respect slots and never repeat`; `item stats scale with rarity and upgrade`; `sniper cannot equip a Shotgun (NOT CERTIFIED)`; `equip moves an item from one unit to another`; `equip replaces the previous item of the slot`; `unitStats includes equipment and ignores an item made illegal by a role resync`; `rollLoot respects weights over 2000 rolls (±3 %)` ; `rollLoot never banks; bankLoot adds items and resources once`; `equip of a dead unit or unknown uid is rejected and changes nothing`.
- [x] **Step 2: Run** `npx vitest run tests/engine/items.test.ts` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** → PASS; whole suite green.
- [x] **Step 5: Commit** `feat(engine): item instances, equipment rules and loot rolls`.

---

### Task 6: Formulas and targeting

**Files:**
- Create: `src/engine/combat/formulas.ts`, `src/engine/combat/targeting.ts`
- Test: `tests/engine/combat/formulas.test.ts`, `tests/engine/combat/targeting.test.ts`

**Interfaces:**
- Produces in `formulas.ts`: `rollDamage(rng, { atk, mult, def, crit: boolean }): number` (roles.md §1, min 1); `rollCrit(rng, critPct): boolean`; `initiativeOrder(cs: CombatState, rng): string[]` (living, non-downed combatants; key `effective SPD + rng.int(0, 3)`; ties squad first, then higher base SPD, then lower `index`).
- Produces in `targeting.ts`: `legalTargets(cs, actorCid, skill): string[]` — `usableFrom` checked against the actor's row (illegal row → `[]`); side `self` → actor; `ally` → living allies (downed allies only for `revive`); `enemy` → living enemies in `targets.rows`; `melee` → enemy front only unless it is empty; `ignoreRows` (on any effect) → every living enemy; `taunt` on an eligible enemy restricts to taunters; `untargetable` excluded; a `lockedTargetId` restricts to it while alive. `nearest(cs, cid, side)`, `strongest(cs, side)` (highest current ATK, then HP), `lowestHpPct(cs, side)`.

- [x] **Step 1: Write the failing tests** — `damage matches the formula at fixed rng` (ATK 24, mult 1, DEF 12: 21–24 range, exact value for a seeded rng); `crit multiplies by 1.5`; `damage is at least 1`; `crit chance 0 never crits, 100 always`; `initiative orders by SPD plus 0–3`; `ties: squad first, then base SPD, then index`; `downed units have no initiative`; `melee hits only the front while it stands, then the back`; `ranged with rows [back] cannot hit the front`; `ignoreRows hits anyone`; `taunt forces the target`; `untargetable is skipped`; `a back-row unit cannot use a front-only skill`; `lock restricts to the locked target until it dies`; `revive targets only downed allies`.
- [x] **Step 2: Run** `npx vitest run tests/engine/combat` → FAIL.
- [x] **Step 3: Implement.** Use a small hand-built `CombatState` fixture helper in `tests/helpers/combat.ts` (`fixtureCombat({ squad: [...], enemies: [...] })`), reused by later tasks.
- [x] **Step 4: Run** → PASS.
- [x] **Step 5: Commit** `feat(engine): damage, crit, initiative and targeting rules`.

---

### Task 7: Effect runner, conditions, triggers and statuses

**Files:**
- Create: `src/engine/combat/effects.ts`
- Test: `tests/engine/combat/effects.test.ts`

**Interfaces:**
- Consumes: Task 6.
- Produces: `type EffectCtx = { cs: CombatState; state: CampaignState; reg: Registries; rng: Rng; log: (e: LogEntry) => void }`; `applyEffects(ctx, ownerCid, effects: EffectSpec[], ev: { targetCid?: string; sourceCid?: string; skillId?: string }): void`; `fireTrigger(ctx, trigger, ev: { actorCid: string; targetCid?: string; threshold?: 50|80|100 }): void` (collects `passives` of the actor for `scope: 'self'` and of the actor's living allies for `scope: 'ally'`; `onAllyDowned` fires on the downed unit's allies; `limit` is recorded in `usedLimits` as `<source>:<index>:<round|combat>`; round limits clear at round end); `checkCondition(ctx, cid, when, targetCid?): boolean`; `effectiveStat(cs, cid, stat): number` (base + `mods` + status mods + always-on `stat` passives incl. `scale`); `outgoingPct(ctx, cid, targetCid)`, `incomingPct(ctx, cid)`; `amplify(effect, factor)` (multiplies `mult`, `pct`, `amount`, `pctMaxHp`, `chance` (cap 1)); `applyStatus(ctx, cid, statusId, turns?, stacks?)` (`immune` blocks; `stackMode`; `maxStacks`; `shield` value = 15 % of the applier's max HP per stack); `tickStatuses(ctx, cid)` (turn start: tick effects × stacks) and `expireStatuses(ctx, cid)` (turn end: `turns − 1`, remove at 0); `dealDamage(ctx, attackerCid, targetCid, mult, opts)` (crit roll, `outgoing`/`incoming`, `guard`, `shield` absorb, `redirect`, `intercept_lethal`, downing, fires `onHit`, `onCrit`, `onDamaged`, `onKill`, `onAllyDowned`, stress for crit taken (`stress.critTaken`), ally downed (`stress.allyDowned` to the downed unit's allies) and kills (`stress.kill` to the killer) via Task 8's `addStress` — stub it with a direct add until Task 8).
- Strained rule: when the owner is a squad unit with stress ≥ 50, effects with `downside: true` run through `amplify(e, TUNING.combat.strainedMult)` before applying.

- [x] **Step 1: Write the failing tests** — one per trigger: `onCombatStart`, `onRoundStart`, `onTurnStart`, `onAction`, `onHit`, `onCrit`, `onDamaged`, `onAllyDowned`, `onKill`, `onStressThreshold 50/80/100 fire once when crossing upward`, `onCombatEnd`; scope: `scope ally onCrit fires for a friend's crit, not her own`; limits: `limit round fires once per round`, `limit combat once per combat`; conditions: one test per condition key; effects: `heal caps at max HP`, `revive only downed, once`, `status stacks add vs refresh and respect maxStacks`, `immune blocks a status`, `bleed ticks per stack at turn start`, `statuses expire at turn end`, `shield absorbs before HP`, `guard cuts damage 30 %`, `redirect sends half the damage to the protector`, `intercept_lethal saves the commander once`, `mark adds 15 % incoming`, `stat scale by stress above 30`, `downside effects are 1.5× when strained, upside not`, `misfire wastes the action`, `cleanse removes the newest debuffs first`, `summon adds an enemy up to max and never beyond 3 per row`.
- [x] **Step 2: Run** `npx vitest run tests/engine/combat/effects.test.ts` → FAIL.
- [x] **Step 3: Implement.** Effects of types that only other modules read (`order_cost`, `order_refusal`, `loadout_slots`, `injury_days`, `override_action`, `repeat_order`, `extra_action`, `loot_roll`, `lock_target`, `cp`, `move`, `follow_up`) are applied by setting a flag/counter on the combat (e.g. `cs.extraAction = cid`, `cs.pendingLootRolls += n`) that Tasks 9–14 read; document each in a comment next to its case.
- [x] **Step 4: Run** → PASS.
- [x] **Step 5: Commit** `feat(engine): data-driven combat effects, triggers and statuses`.

---

### Task 8: Stress bands and breakdowns

**Files:**
- Create: `src/engine/combat/stress.ts`
- Modify: `src/engine/combat/effects.ts` (use `addStress`)
- Test: `tests/engine/combat/stress.test.ts`

**Interfaces:**
- Produces: `stressBand(stress): 'calm'|'strained'|'breaking'|'breakdown'` (<50, ≥50, ≥80, 100); `addStress(ctx, cid, amount, source: 'enemy'|'self'|'ally'|'order'|'system'): number` (squad only; `stress_taken` passives scale gains/relief; clamp 0–100; locked at 100 while `breakdown`; fires `onStressThreshold` on upward crossings; reaching 100 calls `enterBreakdown`); `enterBreakdown(ctx, cid)` (chooses the unit's first defect with `combat.breakdown`; sets `combatant.breakdown`, runs `onEnter`, logs `breakdown`, emits a `combat_cutin { kind: 'breakdown', unitId, text: <defect breakdown name> }`); `breakdownAction(ctx, cid): PlannedAction | null` — the policy's action: `skip` → pass; `repeat_last` → last skill on its last target if legal, else nearest legal; `random_skill` → random skill in loadout, random legal target; `attack` → basic damaging skill (first damaging skill in loadout) at the policy target (allies allowed for `nearest_any`/`nearest_ally`); `await_order` → pass until an order targeted her this round; `twice_then_shutdown` → act (aggressive) with an extra action, then `stun` for the rest of combat; `normal` → null. `once` clears the policy after one action (stress stays locked). `rollBreaking(ctx, cid): boolean` (stress ≥ 80 and not broken down → `rng.chance(0.25)`; true means this turn follows `breakdownAction`).
- `PlannedAction` is declared in `combat/types.ts` (Task 4) and also used by Tasks 9–10.

- [x] **Step 1: Write the failing tests** — `bands at 49/50/79/80/100`; `affect_dampener halves stress gains`; `stress is locked at 100 during breakdown`; `crossing 50 and 80 fires thresholds once`; breakdowns of at least six defects with the core content: `rage_governor attacks the strongest enemy and ignores orders`, `affect_dampener skips turns`, `compulsive_protocol repeats the last action`, `threat_saturation hits the nearest unit, ally included, once`, `latent_strain damages its own row on entry`, `graft_rejection drops to 1 HP and is stunned 2 turns`, `overclock_bias acts twice then shuts down`, `compliance_craving waits for an order`; `breaking band follows the breakdown policy 25 % of turns (seeded, 400 turns within 20–30 %)`; `breakdown emits a cut-in event`.
- [x] **Step 2: Run** `npx vitest run tests/engine/combat/stress.test.ts` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** → PASS; whole suite green.
- [x] **Step 5: Commit** `feat(engine): combat stress bands and data-driven breakdowns`.

---

### Task 9: Combat build, turn loop and the core actions

**Files:**
- Create: `src/engine/combat/build.ts`, `src/engine/combat/turn.ts`, `src/engine/actions/combat.ts` (`combat/start`, `combat/act` in this task)
- Test: `tests/engine/combat/turn.test.ts`, `tests/engine/combat/actions.test.ts`

**Interfaces:**
- Consumes: Tasks 4–8, `getSynergies` (P3), `facilityLevel` not needed.
- `Encounter = { enemies: Array<{ enemyId: string; level: number; affixes: string[]; row?: 'front'|'back' }>; exposesCommander?: boolean; lootTableId?: string; danger: number }` (declare it and `StartPayload` in `combat/types.ts` together with `CombatState` in Task 4).
- `StartPayload = { encounter: Encounter; formation: { front: string[]; back: string[] }; coverId?: string; allowRetry?: boolean; expedition?: boolean; bankLoot?: boolean }`.
- Produces in `build.ts`: `checkStart(state, reg, p: StartPayload): string | null` (no open combat; 1–4 units, unique, each living, status `active`, in `roster.activeIds`; rows ≤ 3; 1–6 enemies of known ids and affixes; `coverId` required iff `exposesCommander` and must be fielded); `buildCombat(state, reg, rng, p): CombatState` (squad combatants from `unitStats`, loadout = `unit.loadout` filtered to known skills else starters, + signature skill (named only) + ultimate if unlocked; passives = role tree passives + defect upside/downside (with `source`) + signature passive + equipment effects + synergy effects from `getSynergies`; enemies from `stats.base + growth × (level − 1)` × difficulty × affix `statPct`, skills + `eliteSkill` if `elite`; enemy rows by `rowPreference`, overflow to the other row; carried stress from units, breakdown restored from `Unit.breakdown`; commander combatant when exposed; `cp = cpStart + Σ cp_start crime perks`; `start = { rng: <rng state before build>, payload }`).
- Produces in `turn.ts`: `startRound(ctx)` (round +1; CP +1 after round 1, max 5; clear round limits and order marks; `onRoundStart`; new `timeline = initiativeOrder`); `runUntilInput(ctx): void` (loops turns: turn start → cooldowns −1, `tickStatuses`, `onTurnStart`; stunned → pass; squad unit not on AUTO, not in breakdown/breaking roll → phase `awaiting` and return; otherwise the AI/breakdown action; then `expireStatuses`; end checks after every action; stops at win/loss or round > maxRounds → `retreated`); `performAction(ctx, cid, action: PlannedAction): void` (validates legality; skill → cooldown, `stressCost`, ultimate CP unless `authorized`, `onAction`, effects per target, `misfire`/`override_action`, `extra_action`; `guard` → status guard 1; `swap` → move to the other row if it has room; `pass`); `checkEnd(ctx): 'won'|'lost'|null` (no standing enemy → won; no standing squad unit or commander down → lost).
- Actions: `combat/start` (rejects per `checkStart`; builds, `onCombatStart`, `startRound`, `runUntilInput`; events `combat_started`, `combat_log { entries }`, `combat_awaiting { cid }` or `combat_ended`); `combat/act { action: PlannedAction }` (only in phase `awaiting` for `timeline[turn]`; illegal skill/target rejected and nothing changes; a unit whose legal action list is empty passes automatically). Until Task 14 adds `finalizeCombat`, an ended combat keeps `state.combat` with the outcome in `combat_ended`; tests in this task assert the event only.

- [x] **Step 1: Write the failing tests** — build: `squad combatants carry effective stats, carried stress and loadout`; `defect, signature, equipment and synergy passives are attached with their source`; `friend state adds friend_assist (stub getSynergies with a fixture state)`; `enemy level, difficulty and armored/elite affixes scale stats`; `elite adds its eliteSkill`; `CP starts at 1, 2 with liquidation`; start rejections (each leaves state unchanged): `five units`, `four in one row`, `injured unit`, `reserve unit`, `unknown enemy`, `crisis without cover`, `combat already open`. Turn: `round 2 adds CP up to 5`; `stunned unit loses its turn`; `cooldown blocks a skill for N own turns`; `ultimate needs CP or authorization`; `illegal target rejected without change`; `enemy turns run until a squad unit must act`; `win when all enemies are down`, `loss when all squad units are down`; `stalemate ends as retreated at the round cap`; `a unit without a legal action passes`; `combat continues identically after a JSON round trip` (dispatch the same acts on a cloned-through-JSON state: deep-equal results); `only state.combat and state.rng change during a combat`.
- [x] **Step 2: Run** `npx vitest run tests/engine/combat/turn.test.ts tests/engine/combat/actions.test.ts` → FAIL.
- [x] **Step 3: Implement.** Import `engine/actions/combat` in `tests/helpers/world.ts`.
- [x] **Step 4: Run** → PASS; whole suite green.
- [x] **Step 5: Commit** `feat(engine): combat build, rounds, turns and core combat actions`.

---

### Task 10: AI profiles, AUTO and auto-resolve

**Files:**
- Create: `src/engine/combat/ai.ts`
- Modify: `src/engine/combat/turn.ts`, `src/engine/actions/combat.ts` (`combat/auto`)
- Test: `tests/engine/combat/ai.test.ts`

**Interfaces:**
- Produces: `chooseAction(ctx, cid): PlannedAction` by the combatant's `aiProfile` — among usable skills (off cooldown, legal row, affordable, at least one legal target): `aggressive` → highest expected damage (`mult × hits × atk × 100/(100+def)`); `predator` → damaging skill on the lowest HP % target; `protector` → heal/shield/guard/taunt if an ally is < 50 % HP or the commander is exposed and hit, else aggressive; `disruptor` → status skill on a target without that status, else aggressive; `stressor` → skill with a `stress` effect on the squad unit with the highest stress < 100, else aggressive; `erratic` → random usable skill and random legal target (`ignoreRows` allowed). Ties broken by skill order then target `index` (deterministic). No usable skill → `guard` if the unit can, else `pass`.
- `canAutoResolve(state, reg, p: StartPayload): boolean` (`encounterPower ≤ autoResolveRatio × squadPower` of the formation).
- `combat/auto { on: boolean }`: sets `cs.auto`; when on, `runUntilInput` uses `chooseAction` for squad units (orders are not issued by AUTO) and runs to the end in the same dispatch.

- [x] **Step 1: Write the failing tests** — one per profile with a crafted fixture (`aggressive picks the heaviest hit`, `predator finishes the weakest`, `protector heals an ally under half HP`, `disruptor applies a missing status`, `stressor targets the most stressed squad unit`, `erratic stays legal over 200 seeded picks`); `no usable skill → guard`; `auto-resolve is deterministic for a seed` (two dispatches of start+auto from the same state are deep-equal, acceptance 5); `auto can be turned off at the next input`; `canAutoResolve at 60 % and not at 61 %`.
- [x] **Step 2: Run** `npx vitest run tests/engine/combat/ai.test.ts` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** → PASS.
- [x] **Step 5: Commit** `feat(engine): enemy and squad AI profiles with deterministic auto-resolve`.

---

### Task 11: CP orders, refusals, Commander Crisis and synergies

**Files:**
- Create: `src/engine/combat/orders.ts`
- Modify: `src/engine/actions/combat.ts` (`combat/order`), `src/engine/calendar.ts` + `src/engine/actions/calendar.ts` (extract `injureCommander(draft, days): EngineEvent[]`; `commander/injure` calls it, behaviour unchanged)
- Test: `tests/engine/combat/orders.test.ts`, `tests/engine/calendar.test.ts` (existing tests stay green)

**Interfaces:**
- Produces: `orderCost(ctx, orderId, targetCid?): number` (registry cost + `order_cost` passives of the target that match the order, floor 1); `checkOrder(ctx, orderId, targetCid?): string | null` (phase `awaiting`; target side matches `order.target`; CP ≥ cost; a unit in a breakdown with `ignoresOrders` cannot be targeted); `issueOrder(ctx, orderId, targetCid?): void` (pays CP; refusal roll = max `order_refusal` chance of the target's passives that match the order → on refusal: CP stays spent, `stress +refusedOrder` to her, log `order_refused`; else applies the order effects with the order as source, records `cs.ordersThisRound` and `cs.lastOrder`; `await_order` breakdown ends its wait; Steady/Hold the Line/Fall Back on a unit < 30 % HP records a `protected` hint candidate); `repeat_order` effect re-issues `cs.lastOrder` for free, never itself; `fall_back` does not spend the target's turn.
- Commander Crisis in `effects.ts` `dealDamage`: target `commander` → redirected to `coverId` while she stands (log `cover`); without a standing cover the commander takes it (`stress +commanderHit` to every squad unit); `intercept_lethal` (`devoted_sacrifice`, `possessive_protocol`) takes a lethal commander hit instead, once per combat. Commander at 0 → `checkEnd` returns lost with `commanderDown: true`.
- Action: `combat/order { orderId, targetCid? }` → events `combat_log`, `order_refused` when refused.

- [x] **Step 1: Write the failing tests** — `each of the five orders does what roles.md says`; `orders cost CP and are rejected without enough CP`; `orders only in the awaiting phase`; `fall back does not use her turn`; `compliance_craving and confidant_sync never push a cost below 1`; `despises refuses about 35 % of orders (seeded, 400 orders within 30–40 %)`; `estranged/resentful use 25 %/15 %`; `a refused order spends CP and adds stress`; `command echo repeats the last order for free and cannot repeat itself`; `hits on the commander go to the cover unit`; `without cover the commander is hit and the squad gains stress`; `devoted_sacrifice intercepts a lethal hit once`; `commander down loses the combat`; `friend_assist follows up after an ally crit, once per round`; `injureCommander keeps the commander/injure behaviour`.
- [x] **Step 2: Run** `npx vitest run tests/engine/combat/orders.test.ts tests/engine/calendar.test.ts` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** → PASS; whole suite green.
- [x] **Step 5: Commit** `feat(engine): CP orders, refusals, Commander Crisis and relationship synergies`.

---

### Task 12: Encounter generator

**Files:**
- Create: `src/engine/combat/encounter.ts`
- Test: `tests/engine/combat/encounter.test.ts`

**Interfaces:**
- Produces: `type EnemyTable = { categories: Record<string, number>; archetypes?: string[] }` (same shape P5 regions use); `generateEncounter(state, reg, rng, input: { table: EnemyTable; danger: 1|2|3|4|5; squadPower: number; exposesCommander?: boolean; lootTableId?: string }): Encounter` — budget = `squadPower × [0.5, 0.7, 0.9, 1.1, 1.3][danger − 1]`; category weight × frequency factor `{ common: 1, rare: 0.3, very_rare: 0.08 }`; archetype uniform within the category (restricted to `archetypes` when given); level = `max(1, round(average fielded level) + danger − 2)`; affix chance `0.1 × danger` per enemy, at most `min(2, danger − 1)` affixes, `elite` only from danger 3; keep adding while the next enemy fits the budget, at most 6, always at least 1; `defaultEnemyName(reg, enemyId, affixes)` ("Armored Husk"; elite as "Elite").

- [x] **Step 1: Write the failing tests** — `same rng state, same encounter`; `encounter power stays within budget except the guaranteed first enemy`; `never more than 6 enemies`; `category frequencies follow lore over 3000 encounters (rare ≈ 0.3 × common, ±20 %)`; `archetype list restricts picks`; `no elite below danger 3`; `default name joins affix adjectives and archetype name`; `unknown category in the table is ignored, an all-unknown table throws`.
- [x] **Step 2: Run** `npx vitest run tests/engine/combat/encounter.test.ts` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** → PASS.
- [x] **Step 5: Commit** `feat(engine): budgeted encounter generator with affixes`.

---

### Task 13: Progression — XP, levels, skill trees, respec and loadout

**Files:**
- Create: `src/engine/progression.ts`, `src/engine/actions/progression.ts`
- Modify: `src/engine/actions/calendar.ts` (register the level-up activity hook) or import the hook registration from `actions/progression.ts` in `app.ts`/test helpers
- Test: `tests/engine/progression.test.ts`

**Interfaces:**
- Produces: `xpToNext(level) = base + perLevel × level`; `levelCap(state)`; `applyLevelUps(draft, unit): EngineEvent[]` (while `xp ≥ xpToNext(level)` and `level < cap`: spend, level +1, `skillPoints +1`, HP rises by the growth gained; emits `level_up { unitId, level }`); `nodeState(state, reg, unit, nodeId): 'owned'|'available'|'locked'` and `checkUnlock(state, reg, unitId, nodeId): string | null` (points, `requires` owned, ultimate needs two owned tier-3 nodes); `unlockNode(draft, reg, unitId, nodeId)`; `respecCost(unit) = { credits: 10 × level, plyx: 5 × level }`; `respec(draft, reg, unitId)` (refunds every owned node's cost, clears `unlockedNodes`, loadout back to starters); `knownSkills(reg, unit): string[]` (starters + skills granted by owned nodes, ultimate excluded); `loadoutSize(reg, unit)` (`loadoutSize` + `loadout_slots` effects of her defects); `setLoadout(draft, reg, unitId, skillIds)` (unique, known, actives only, ≤ size); `skillWithUpgrades(reg, unit, skillId): Skill` (applies owned upgrade nodes: `cooldownDelta` (floor 0), `multPct` on damage/heal effects, `addEffects`) — Task 9's build uses it; `releaseBreakdowns(draft, unitIds?): EngineEvent[]` (clears `Unit.breakdown` of the given or all units, `breakdown_released { unitId }` each); `combatXp(state, reg, cs: CombatState): Record<unitId, number>` (spec §7: base + perEnemyLevel × Σ enemy levels, × lowLevelBonus if level < fielded average − lowLevelGap, × gruntMult for grunts, rounded; won only).
- Actions: `squad/unlock_node { unitId, nodeId }`, `squad/respec { unitId }` (pays), `squad/set_loadout { unitId, skillIds }`, `squad/release_breakdowns { unitIds? }` (calls `releaseBreakdowns`). Activity hook: after every activity, `applyLevelUps` for every living unit (P2 `train` XP now levels units).

- [x] **Step 1: Write the failing tests** — `xp thresholds 60/80/100…`; `one level per threshold, skill point each`; `level stops at the cap and keeps the xp`; `raising clearanceTier releases the stored levels`; `unlock needs points and prerequisites`; `ultimate needs two tier-3 nodes`; `respec refunds exactly and costs credits and plyx`; `respec without funds changes nothing`; `loadout rejects unknown, duplicate, passive and too many skills`; `firmware_rollback allows a fifth slot`; `upgrade node lowers cooldown and raises the multiplier`; `combat xp gives the low-level bonus and halves grunts`; `train activity xp levels the unit through the hook`; `release_breakdowns clears and emits`.
- [x] **Step 2: Run** `npx vitest run tests/engine/progression.test.ts` → FAIL.
- [x] **Step 3: Implement**; switch Task 9's build to `skillWithUpgrades` and `knownSkills`.
- [x] **Step 4: Run** → PASS; whole suite green.
- [x] **Step 5: Commit** `feat(engine): levels, skill trees, respec and loadouts`.

---

### Task 14: Outcomes, easy retry, accept and retreat

**Files:**
- Create: `src/engine/combat/outcome.ts`, `src/engine/combat/index.ts`
- Modify: `src/engine/actions/combat.ts` (`combat/retry`, `combat/accept`, `combat/retreat` (any `awaiting` turn → finalize as `retreated`))
- Test: `tests/engine/combat/outcome.test.ts`

**Interfaces:**
- Produces: `finalizeCombat(draft, reg, rng, outcome: 'won'|'lost'|'retreated'): EngineEvent[]` — `onCombatEnd`; write back each squad unit's HP (downed named units → 1 HP), stress, `breakdown` (`{ defectId, day }`); downed → injury (`injuries.push('wounded')`, `injuryDays = max(current, round(injuryDays × (1 + Σ injury_days pct/100)))`, `status: 'injured'`); grunts downed: die on loss/retreat, on win with `gruntDeathOnWin`; loss/retreat: `stress +loss` to every fielded unit; win: `combatXp` + `applyLevelUps`, `rollLoot(encounter.lootTableId ?? 'loot_standard')` + `pendingLootRolls`; bank if `bankLoot`; commander down → `injureCommander`; `expedition: false` → release breakdowns; build `relationHints`; store `lastCombat: CombatResult` (`{ id, day, outcome, rounds, formation, participants, enemies (with default names), log, xp, levelUps, loot, banked, injuries, deaths, breakdowns, stressDelta, relationHints, commanderInjured }`); delete `combat`; emit `combat_ended { outcome }`, `level_up`s, `loot_banked`, `commander_injured`.
- Loss path: `checkEnd` → `lost` with `allowRetry` → phase `lost_pending` (nothing written); otherwise finalize immediately. `combat/retry` (only `lost_pending`): `state.rng = combat.start.rng`, rebuild via `combat/start` logic from `combat.start.payload`. `combat/accept` (only `lost_pending`): finalize as `lost`. A won combat cannot be retried.
- `index.ts` exports for P5/P6: `checkStart`, `canAutoResolve`, `generateEncounter`, `defaultFormation`, `squadPower`, `encounterPower`, `defaultEnemyName`, `releaseBreakdowns`, types `Encounter`, `EnemyTable`, `StartPayload`, `CombatResult`, `RelationHint`.

- [x] **Step 1: Write the failing tests** — `win grants xp, levels and loot once`; `bankLoot false only records loot`; `downed named unit is injured, never dead`; `grunt dies on loss, seeded 10 % on wins`; `pain_inversion injuries last 50 % longer`; `loss adds stress to every fielded unit`; `stress and breakdown persist into the campaign`; `standalone combat releases breakdowns`; `commander down injures the commander and emits commander_injured`; `relation hints: cover protected, steady on a wounded unit, downed endangered, one per pair at the highest severity`; easy retry (acceptance 4): `retry restores the state right after combat/start exactly`, `retry twice is still exact`, `accept after retry finalizes the second attempt only`, `retry is rejected without allowRetry and after a win`, `the chronicle and memory never change through combat and retries`; `lastCombat.log is capped at 300`; `retreat finalizes as retreated`.
- [x] **Step 2: Run** `npx vitest run tests/engine/combat/outcome.test.ts` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** → PASS; whole suite green.
- [x] **Step 5: Commit** `feat(engine): combat outcomes, easy retry and relation hints`.

---

### Task 15: Workshop — sessions, crafting, upgrades, rerolls and dismantling

**Files:**
- Modify: `src/engine/items.ts`, `src/engine/actions/items.ts` (`item/craft`, `item/upgrade`, `item/reroll`, `item/dismantle`; the workshop activity hook)
- Test: `tests/engine/workshop.test.ts`

**Interfaces:**
- Consumes: P2 `facilityEffect(state, reg, 'workshop', 'rarityCap' | 'upgradeDiscountPct')`, `registerActivityHook`.
- Activity hook: `activityId === 'workshop'` → `workshopSession = { day, opsLeft: opsPerSession, companionId? }`, emits `workshop_opened`; with a companion who `likes` `tech` and an equipped weapon below +5: `companionQualityChance` → free +1 (`item_upgraded { free: true }`).
- `checkWorkshop(state): string | null` (`NO WORKSHOP SESSION` unless a session of today with ops left). `item/craft { recipeId }`: rarity index ≤ `rarityCap`; pays recipe cost; `newItem`; op −1; `item_crafted`. `item/upgrade { uid }`: < +5; cost `(upgrade + 1) × upgradeCost`, × (1 − discount %), rounded up; op −1. `item/reroll { uid, affixIndex }`: non-drawback affix replaced by another allowed one not already present; `rerollPlyxPerRarity × rarityIndex` plyx; op −1. `item/dismantle { uid }`: not equipped; plyx `round(value × rarity mult × dismantlePct / 100)`; removes it; op −1.

- [x] **Step 1: Write the failing tests** — `workshop activity opens a session with 3 ops`; `ops run out`; `a session from yesterday is closed`; `craft respects the rarity cap (prototype needs workshop 3)`; `craft pays and adds an item`; `upgrade cost scales and the discount applies at workshop 3`; `upgrade stops at +5`; `reroll never picks a duplicate or touches a drawback`; `dismantle refuses an equipped item and pays plyx`; `tech-loving companion can give a free weapon upgrade (seeded)`; every rejection leaves the state unchanged.
- [x] **Step 2: Run** `npx vitest run tests/engine/workshop.test.ts` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** → PASS.
- [x] **Step 5: Commit** `feat(engine): workshop sessions, crafting, upgrades, rerolls and dismantling`.

---

### Task 16: Balance harness and `npm run sim`

**Files:**
- Create: `src/sim/harness.ts`, `src/sim/cli.ts`, `scripts/sim.mjs`
- Modify: `package.json` (`"sim": "node scripts/sim.mjs"`), `tests/architecture.test.ts`
- Test: `tests/sim/harness.test.ts`

**Interfaces:**
- Produces in `harness.ts` (pure; engine + content only, no dispatch): `fixtureSquad(reg, opts: { level: number; defectId?: string | null }): CampaignState` (a `buildCampaign` campaign with assault + defender front, sniper + medic back, all at `level`, every unit carrying `defectId` or no defect, standard-issue weapons); `simulate(reg, opts: { seed: number; state: CampaignState; danger: number; difficulty?: Difficulty }): { won: boolean; rounds: number; endStress: number }` (generates an encounter from an all-categories table with the seeded rng, builds, sets AUTO, runs to the end); `runBatch(reg, opts: { runs, seed, level, danger, defectId? }): { winRate; avgRounds; avgEndStress }` (run `i` uses seed `seed + i`); `neutralityReport(reg, opts: { runs, seed, level, danger }): { control; rows: Array<{ defectId; winRate; diffPp; pass: boolean }>; avgRoundsOk: boolean }` (`pass` = |diff| ≤ 5; `avgRoundsOk` = control avgRounds ≤ 5); `formatReport(report): string` (markdown table).
- `cli.ts`: parses `--runs` (default 2000), `--seed` (1), `--level` (5), `--danger` (2), `--neutrality`, `--out <path>`; loads `content/core` from disk; prints the table; writes `--out` if given.
- `scripts/sim.mjs`: esbuild-bundles `src/sim/cli.ts` (`platform: 'node'`, `format: 'esm'`) to `node_modules/.cache/alius/sim.mjs`, then imports it with the CLI arguments.

- [x] **Step 1: Write the failing tests** — `runBatch is deterministic for a seed`; `simulate never exceeds the round cap`; `neutrality report lists all 18 defects with win rates and pp differences` (runs 20); `formatReport has one row per defect and marks PASS/FAIL`; architecture: `the sim layer imports only engine and content`.
- [x] **Step 2: Run** `npx vitest run tests/sim tests/architecture.test.ts` → FAIL.
- [x] **Step 3: Implement**; then run `npm run sim -- --runs 200 --neutrality` once by hand and check it completes.
- [x] **Step 4: Run** `npx vitest run` → green.
- [x] **Step 5: Commit** `feat(sim): headless balance harness and defect neutrality report`.

---

### Task 17: Enemy flavor, settings and difficulty

**Files:**
- Modify: `src/llm/calls/flavor.ts` (kind `enemy`), `src/settings.ts`, `src/ui/shell/sysTab.ts`, `src/engine/actions/combat.ts` (`combat/set_enemy_name`, `campaign/set_difficulty`)
- Test: `tests/llm/flavor.test.ts`, `tests/settings.test.ts`, `tests/ui/shell.test.ts` (SYS fields), `tests/engine/combat/actions.test.ts` (extend)

**Interfaces:**
- Flavor kind `enemy`: input `{ kind: 'enemy', archetypeName, categoryName, affixNames: string[] }` → `{ name }` (1–3 words, letters, spaces and hyphens, ≤ 32 chars; anything else fails soft). `enemyNameKey(enemyId, affixes) = enemyId + '|' + sorted affixes`.
- `combat/set_enemy_name { key, name }`: validates the name pattern, stores in `enemyNames`, keeps the 100 most recent.
- `campaign/set_difficulty { difficulty: 'story'|'normal'|'hard' }`: refused while a combat is open.
- Settings: `easyRetry: boolean` (default `false`), `enemyFlavor: boolean` (default `false`). SYS: two toggles and a per-campaign difficulty select (dispatches `campaign/set_difficulty`).

- [x] **Step 1: Write the failing tests** — `enemy flavor accepts a valid name and fails soft on prose, numbers and long names`; `set_enemy_name caps the cache at 100`; `set_difficulty rejects an open combat`; `settings defaults and round-trip for easyRetry and enemyFlavor`; `SYS shows the difficulty of the campaign and changes it`.
- [x] **Step 2: Run** `npx vitest run tests/llm/flavor.test.ts tests/settings.test.ts tests/ui/shell.test.ts tests/engine/combat/actions.test.ts` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** → PASS.
- [x] **Step 5: Commit** `feat: enemy name flavor, easy retry and difficulty settings`.

---

### Task 18: Combat screen

**Files:**
- Create: `src/ui/combat/combatScreen.ts`, `src/ui/combat/bars.ts`, `src/ui/combat/keys.ts`, `css/70-combat-inv.css`
- Modify: `src/ui/scene/cutIn.ts` (optional fourth parameter `imageUrl?: string`, additive)
- Test: `tests/ui/combat.test.ts`

**Interfaces:**
- `bar(value, max, width = 10): string` (`█` × round(width × value/max) + `░` rest; 0 ≤ value ≤ max).
- `renderCombatScreen(host, ctx: { getState; registries; st; settings; onAct(action: PlannedAction); onOrder(orderId, targetCid?); onAuto(on); onRetry(); onAccept(); onRetreat(); onClose() }): { refresh(): void; dispose(): void }` — enemy rows on top (front row nearest the middle), squad rows below, the commander card in the squad back row when exposed; each card: head crop (named: `st.getSpriteUrl(card, 'neutral')`, else avatar; grunts/enemies: ASCII), name (`enemyNames[key] ?? defaultEnemyName`), `HP ████░░` and (squad) `ST ███░░`, status glyphs, breakdown/strained markers, synergy tags (from `getSynergies`, spec §3); round timeline strip with the current actor highlighted; skill buttons (4 actives, signature, ultimate) with cooldowns and disabled reasons; `[GUARD] [SWAP] [PASS] [AUTO] [RETREAT]`; CP orders panel with costs; compact log (last 8 entries, text only); `lost_pending` → `[RETRY] [ACCEPT DEFEAT]`; after `lastCombat` → result panel (outcome, XP, level ups, loot, injuries, deaths) with `[CONTINUE]`.
- Keyboard (`keys.ts`, ignored inside inputs): `1`–`6` skills, `←`/`→` cycle legal targets, `Enter` confirm, `G` guard, `S` swap, `P` pass, `Q W E R T` orders in registry order, `A` AUTO, `Esc` cancel selection.
- `combat_cutin` events → `cutIn(host, kind, text, spriteUrl)` (ultimates and breakdowns only).

- [ ] **Step 1: Write the failing tests** — `bar widths at 0, half and full`; `renders enemy and squad rows with bars and statuses`; `only legal targets are selectable`; `skill on cooldown is disabled with the turns left`; `keyboard 1 + Enter acts on the first legal target`; `Q issues the first order and is disabled without CP`; `lost_pending shows RETRY and ACCEPT DEFEAT`; `result panel lists xp, loot and injuries`; `log text is not HTML`; `cut-in fires on a breakdown event`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/combat.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(ui): terminal combat screen with keyboard control`.

---

### Task 19: INV tab and SQUAD progression views

**Files:**
- Create: `src/ui/inv/invTab.ts`, `src/ui/squad/skillTree.ts`
- Modify: `src/ui/squad/squadTab.ts`, `css/70-combat-inv.css`
- Test: `tests/ui/inv.test.ts`, `tests/ui/squad.test.ts` (extend)

**Interfaces:**
- `renderInvTab(host, ctx: { getState; registries; onEquip(unitId, uid); onCraft(recipeId); onUpgrade(uid); onReroll(uid, i); onDismantle(uid) })` — retro list (slot filter, rarity tag, `+N`, affix names, wearer), compare panel (selected item vs the item the chosen unit wears in that slot: stat deltas), workshop panel only while `checkWorkshop` is null (ops left, recipes with costs, greyed with the engine's reason), resources line.
- `renderSkillTree(host, ctx: { unit; registries; state; onUnlock(nodeId) })` — ASCII node graph: three branch columns, tiers top to bottom, `[■]` owned, `[□]` available, `[·]` locked, ultimate below; the reason from `checkUnlock` on hover/title.
- SQUAD unit view: level, `XP n/next`, skill points; equipment slots (`WEAPON/UPPER/LOWER`, `STANDARD ISSUE` when empty, `UNKNOWN`/`NOT CERTIFIED` flags) with an equip picker; loadout editor (checkboxes up to `loadoutSize`); `[RESPEC — n CR / m PLYX]`; skill tree; breakdown marker.

- [ ] **Step 1: Write the failing tests** — inv: `lists items with rarity and wearer`, `compare shows stat deltas`, `workshop panel only during a session, buttons greyed with the engine reason`, `dismantle disabled for equipped items`; squad: `shows level, xp and points`, `STANDARD ISSUE replaces PENDING`, `tree marks owned/available/locked`, `unlock click calls onUnlock`, `loadout limit enforced in the editor`, `illegal item is flagged NOT CERTIFIED`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/inv.test.ts tests/ui/squad.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(ui): INV tab with workshop and SQUAD skill tree, loadout and equipment`.

---

### Task 20: App wiring

**Files:**
- Modify: `src/app.ts`, `tests/helpers/world.ts` (import the P4 action modules)
- Test: `tests/app-combat.test.ts`

**Interfaces:**
- `app.ts` imports `engine/actions/combat`, `engine/actions/progression`, `engine/actions/items`; registers the `combat` screen and the `inv` tab; new `AliusApp.startCombat(opts: StartPayload): boolean` (fills `allowRetry` from `easyRetry`, dispatches with `expectChatId`, shows the combat screen; P5 uses it); SQUAD/INV callbacks dispatch the P4 actions; `workshop_session`/`workshop_opened` → INV tab in workshop mode; `combat_cutin` → cut-in; debug tool **Combat drill** (debug mode: active roster, `defaultFormation`, `generateEncounter` at danger 1 over every category, `expedition: false`, `bankLoot: false`; refuses with a toast when the roster is empty or a combat is open); with `enemyFlavor` on, after `combat_started` request names for affixed enemies whose key is not cached (fail soft, `combat/set_enemy_name`); on load/chat change with `state.combat` open → combat screen; `[CONTINUE]` after a result → back to the PDA.

- [ ] **Step 1: Write the failing tests** — `combat drill opens the combat screen`; `acting through the screen dispatches combat/act`; `easy retry setting reaches combat/start`; `reload with an open combat shows the combat screen`; `a late combat dispatch for another chat is dropped`; `workshop activity opens INV in workshop mode`; `enemy flavor names are requested once per key and failures change nothing`; `commander down in a drill queues the P3 commander_injured follow-up`.
- [ ] **Step 2: Run** `npx vitest run tests/app-combat.test.ts tests/app.test.ts tests/app-day.test.ts tests/app-scene.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; whole suite green; `npm run typecheck` clean.
- [ ] **Step 5: Commit** `feat: wire combat, inventory, workshop and combat drill into the app`.

---

### Task 21: Build, docs, balance report, acceptance

**Files:**
- Modify: `dist/index.js`, `style.css` (via `npm run build`), `docs/packages/P4-combat-progression-items.md` (status line + **Implemented as** with every ruling above), `docs/00-overview.md` (§5.4 P4 interfaces: `combat/*` actions, `app.startCombat`, `engine/combat/index.ts` exports, `squad/release_breakdowns`, `rollLoot`/`bankLoot`, `levelCap`/`world.clearanceTier`, `lastCombat.relationHints`; §6 data model fields; §8 `easyRetry`, `enemyFlavor`, difficulty; §9 status → implemented), `docs/CONTENT.md` (effect vocabulary, triggers, conditions and every new registry with an example), `docs/packages/P5-*.md` and `P6-*.md` (**Interfaces already provided by P4**: P5 — `startCombat`, `generateEncounter(table = region.enemyTable)`, `defaultFormation`, `bankLoot`/`lastCombat.loot`, `releaseBreakdowns` + `breakdown_released`, `lastCombat.relationHints` → `intents/apply` in the debrief, `world.clearanceTier`, `loot_cache`; P6 — `order_refusal` passives and `order_refused`, the friction synergy ids, `combat.ordersThisRound`, Compel cancelling a refusal hooks into `issueOrder`), `docs/README.md` (plan list, P4 status)
- Create: `docs/MANUAL_TEST_P4.md`, `docs/BALANCE_REPORT.md` (from `npm run sim -- --neutrality --out docs/BALANCE_REPORT.md`)
- Test: `tests/build.test.ts` (existing)

- [ ] **Step 1:** `npm run build` → `dist/index.js` and `style.css` change and stay tracked.
- [ ] **Step 2:** `npm run sim -- --neutrality --out docs/BALANCE_REPORT.md` (2000 runs); note failing defects and the average rounds in the spec's **Implemented as** (tuning may continue).
- [ ] **Step 3:** Walk the eight acceptance criteria against test names and record them in `docs/MANUAL_TEST_P4.md` next to the in-SillyTavern steps that cannot be automated (mouse and keyboard play of a full drill, sprite head crops, cut-ins, INV compare and workshop, SQUAD tree, easy retry toggle, difficulty select).
- [ ] **Step 4:** `npx vitest run` and `npm run typecheck` → all green; put the counts in the final report.
- [ ] **Step 5: Commit** `chore: rebuild dist and style, P4 docs, balance report and manual checklist`.
