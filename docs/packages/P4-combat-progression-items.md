# P4 — Combat, Progression & Items

**Depends on:** P0, P1 (P2 for workshop/medbay hooks, P3 for synergies — use stubs if not present). **Read:** overview; `content/roles.md` (all); `content/defects.md` (effects); `content/lore.md` §7.

**Status:** implemented (plan: `plans/2026-11-09-p4-combat-progression-items.md`). Automated tests pass; the in-SillyTavern checklist `MANUAL_TEST_P4.md` still has to be run by hand. Where an earlier draft of this spec said something else, the code won; the differences are listed under **Implemented as** at the end.

## Goal

Short, tactical, self-sufficiently interesting turn-based combat with zero LLM calls, tied to relationships through synergies and to defects through stress; levels, skill trees, equipment, crafting and loot.

## 1. Combat model (pure engine)

- Sides: squad (≤4 units, optionally a covered commander) vs enemies (1–6).
- **Rows:** each side has `front` and `back`; max 3 per row; formation chosen pre-expedition (P5) and adjustable between nodes.
- **Turn order:** each round, initiative = `SPD + rand(0..3)`; ties → squad first, then higher base SPD. Timeline of the round shown in UI.
- **Targeting:** skills declare `usableFrom` and `targets.rows`. Melee-class skills can hit only the enemy front unless it is empty. Ranged can hit any row. Some skills/anomalies ignore rows.
- **Actions:** each unit per turn uses 1 skill (or Swap/Guard/Pass). Cooldowns in turns.
- **Command Points:** commander has no turn. CP start 1 (+perks), +1 per round, max 5. Orders (roles.md §5) usable at any time between unit turns; ultimates require `Authorize Ultimate` or CP cost.
- **Damage/crit/status:** formulas from roles.md §1; statuses from registry with `duration, stacks, tick effects`.
- **Effect system:** data-driven effects with triggers: `onCombatStart, onRoundStart, onTurnStart, onAction, onHit, onCrit, onDamaged, onAllyDowned, onKill, onStressThreshold(50|80|100), onCombatEnd`. Defects, items, signatures, synergies and enemy affixes are all expressed as effects. No defect gets bespoke code unless an effect type is genuinely missing (then add a generic effect type).

## 2. Stress in combat

- Sources: taking crits, ally downed, anomalies, `infect`, defect downsides, commander in danger, refused orders.
- Relief: Medic/Support skills, `Steady` order, synergies, kills (small), certain signatures.
- Bands: ≥50 *strained* (defect downside ×1.5), ≥80 *breaking* (each turn 25% chance to act per breakdown behavior instead of chosen action), 100 → **Breakdown**: defect's breakdown behavior until end of expedition; stress locked at 100 until return; after return → P3 enqueues a debrief/night event hook.
- Stress persists between combats within an expedition and carries back to base.

## 3. Synergies (from P3)

`getSynergies(unitIds)` returns effects activated by relationship states among present units and with the commander: e.g. `friend` pair → *Follow-Up*; `lover/devoted` with commander → *Shield Body* in Commander Crisis; `rival` pair → +damage when both alive; `estranged/despises` → refusal chance on CP orders targeting her (P6 extends). Shown on the formation screen.

## 4. Commander Crisis

A node or enemy behavior flag `exposesCommander`: commander appears as a back-row target with fixed HP; one unit must be assigned *Cover* (takes redirected hits). If commander drops → combat lost + commander injury (P2 injury effects on commander activities). Not in regular fights.

## 5. Outcomes

- Win: XP, loot rolls, stress kept, injuries for units downed (temporary stat debuffs, days to heal; medbay speeds).
- Loss: retreat, expedition loot lost (P5), injuries for all downed, stress +; grunts at 0 HP die (also configurable small chance on wins); named units **never die in v1**.
- **Easy retry** (setting): snapshot before combat; on loss offer `[RETRY] [ACCEPT DEFEAT]`; retries are not logged to memory/chronicle.
- **Auto-resolve:** when encounter power ≤ 60% of squad power, offer `[AUTO]`: instant simulation using the AI policy for both sides; result applied normally. Also an `AUTO` toggle mid-combat.
- Combat log events (structured) are stored for P5's `expedition_recap` and P3 intents (`protected`, `endangered`, who was sent where).

## 6. Enemies

- `enemies` registry: archetype `{ id, categoryId, name, stats per level, skills[], aiProfile, rowPreference, portrait (image path | ascii) , tags }`.
- `aiProfile`: `aggressive` (highest damage), `predator` (lowest HP%), `protector` (guards allies), `disruptor` (statuses), `stressor` (stress damage), `erratic` (anomaly: random + rule-breaking).
- `affixes`: `armored, regenerating, reinforcing, volatile (explodes), bloom_touched (infect), swift, elite (stat ×1.4, extra skill)`. Affixed names via `flavor` call optional (cached), otherwise "Armored Husk".
- Encounter generator: input region enemy table + danger level + squad power → budgeted selection (categories by frequency: common/rare/very rare as in lore §7) + affixes.
- v1 ships ≥ 3 archetypes per category (≥ 18 total), placeholder ASCII portraits; image paths optional for the author's art.

## 7. Progression

- XP to participants (bonus for low-level, small for grunts). Level cap from clearance tier (P5 beats/facilities) — values in roles.md §1.
- 1 skill point per level; trees per role (3 branches); respec via Workshop/Medbay cost.
- Equipped actives: 4 + signature + ultimate. SQUAD tab: skill tree view in ASCII node graph.

## 8. Items, loot, crafting

- `items` registry: `{ id, slot: weapon|upper|lower, class (weapon class | armor weight), rarity, baseStats, affixSlots, effects, value }`. Role restrictions enforced by `class`.
- Rarity ladder: standard, refined, prototype, corporate, anomalous (anomalous carries a drawback affix).
- Loot tables per region/node type; credits and plyx drops.
- Workshop (P2 activity): craft from recipes (plyx + credits), upgrade +1…+5 (scaling cost), reroll an affix, dismantle → plyx. Facility level caps rarity.
- INV tab: retro list view with compare panel; equip from SQUAD.

## 9. Combat UI (screen `combat`)

ASCII/terminal battlefield: enemy rows top, squad rows bottom, unit cards with head crop of the sprite (named) or ASCII portrait (grunts/enemies), HP and stress as block bars `█████░░░`, status glyphs, round timeline strip, skill buttons with cooldowns, CP orders panel, compact combat log. Keyboard shortcuts for skills/targets. One cut-in hook for ultimates/breakdowns (uses the unit's expression sprite).

## 10. Balance harness

Headless simulator (`npm run sim`) runs N seeded combats for configurable squads/encounters and reports win rate, average rounds, stress at end. Required checks:
- Each defect: squad with vs without the defect, same everything else → win-rate difference within ±5 pp over 2000 runs (defect neutrality rule).
- Average regular combat ≤ 5 rounds at intended difficulty.

## Acceptance criteria
1. A full combat plays with mouse and keyboard; CP orders, ultimates, rows, statuses, cooldowns work.
2. Stress bands and breakdown behave per spec for at least 6 different defects.
3. Synergy effects appear when P3 states exist (stub-tested otherwise).
4. Easy retry restores exact pre-combat state; no chronicle entry for retried attempts.
5. Auto-resolve deterministic for a given seed.
6. Loot/crafting/upgrades/role restrictions work; INV/SQUAD UIs reflect them.
7. Balance harness runs; neutrality report generated (tuning may continue after the package).
8. Tests: damage formula, initiative, targeting legality, every effect trigger, encounter budget, loot tables.

## Interfaces already provided by P2 (implemented — use, do not rebuild)

- **Injuries:** set `unit.status = 'injured'` and `unit.injuryDays = n` (P2's day-end tick recovers units, faster with the medbay `injurySpeed`; the `medbay` activity also shortens it). On recovery P2 sets `active` if the unit is in `roster.activeIds`, else `reserve`.
- **Commander Crisis:** dispatch `commander/injure { days }`; it blocks `train` and `work` and emits `commander_injured` for P3's reactions.
- **Workshop:** the `workshop` activity (alone or with a companion) only emits `workshop_session { unitId? }` and spends the slot; recipes, costs, rarity cap (`facilityEffect(state, reg, 'workshop', 'rarityCap')`) and `upgradeDiscountPct` are yours. A companion with the `tech` like already gets Affinity.
- **XP:** activities only add to `unit.xp`; levelling and the level caps are P4's.
- **Grunts:** `kind: 'grunt'`, level = rounded average of living units − 1, stats = role base (no growth applied yet), a lite defect (`lite: true`, no arc), a signature drawn from the registry only to satisfy the type (ignore it for grunts), `status` `active` or `reserve`. Death: set `status: 'dead'`; dead units stop eating and stay in `squad` (their ids and designations stay taken).
- **Stress:** upkeep shortage and rests change `unit.stress` (0–100, clamped); the passive day-end recovery is 1.
- **Items:** `Unit.equipment` is still empty; the SQUAD tab shows `STANDARD ISSUE — PENDING` until P4 fills it.

## Interfaces already provided by P3 (implemented — use, do not rebuild)

- **Synergies:** `getSynergies(state, reg, unitIds)` (from `engine/relations`) returns `[{ unitId, synergyId }]` for the relationship states the units are in. Core ships the ids `trusted_cover`, `friend_assist`, `confidant_sync`, `kindred_sync`, `spark`, `lover_link`, `devoted_sacrifice`, `rival_edge` in `relationshipStates[].unlocks.synergies`; P4 defines what they do (add the ids it needs to the JSON, never in code).
- **Relationship feedback after combat:** report who protected or endangered whom as intents (`protected`, `endangered`, `sided_with`, …) through `intents/apply` (it needs an open scene or a DM; the P5 debrief scene is the natural place) — never by writing Trust/Affinity directly. Stress changes are yours; the daily relationship pass adds a `stress_high` mark at Stress ≥ 80 (three marks can push a unit into `obsessed`).
- **Cut-ins:** `cutIn(host, kind, text)` (`src/ui/scene/cutIn.ts`) is the one-animation hook for combat flourishes.
- **Commander Crisis:** dispatch `commander/injure { days }`; the app answers `commander_injured` with `relations/commander_injured`, which queues visits from lovers, devoted and dependent units.
- **Defect social data:** `defects[].relationModifiers`, `socialHooks`, `dmChanceBonus` and `nightEvents` already exist in the schema (see `CONTENT.md`); combat effects of defects stay in your own fields.

## Implemented as

### Rules
- **Synergies are unit↔commander** (v1 has no NPC↔NPC relations): `friend_assist` = follow-up after any ally's crit (once per round), `rival_edge` = flat +10 % damage. New `synergies` registry; `resentful`/`estranged`/`despises` unlock `order_friction_minor`/`order_friction`/`order_friction_major` (refusal chance 15/25/35 % on CP orders aimed at her).
- **Stats** are computed, never stored: role base + `floor(growth × (level − 1))`, then equipment (flat stats, then affix percentages of the wearer's total), then armor SPD (heaviest piece only: light 0, medium −1, heavy −3), then −10 % per injury (max 3), each stat floored at 1 (CRIT 0). Enemy stats: `(base + growth × (level − 1)) × difficulty × (1 + Σ affix %)`; difficulty (0.8 / 1 / 1.2) scales HP, ATK and DEF only.
- **Levels:** XP to leave a level = 40 + 20 × level; cap `[10, 20, 30, 40][world.clearanceTier ?? 0]` (P5 writes the tier); XP above the cap is kept. The P4 activity hook levels units after every activity; combats level them at the end.
- **Skill trees** live on the role (`tree`): 3 branches × 5 tiers (costs 2–6, pattern active / passive / upgrade of the tier-1 active / active / passive) + an ultimate (cost 6, needs two tier-3 nodes) = 66 points. Loadout = up to 4 actives (+1 per `loadout_slots`) + an active signature + the ultimate. Ultimates cost their CP unless the unit is `authorized`.
- **Items:** a template's rarity is its minimum; instances carry rarity, upgrade 0–5 and affixes; `Unit.equipment[slot]` holds the instance uid and is the only record of the wearer. Illegal or unknown items are ignored by `unitStats` and flagged `NOT CERTIFIED` / `UNKNOWN` in SQUAD. Dismantle pays `value × (1 + 0.15 × (rarity − 1)) × 50 %` plyx.
- **Workshop:** the `workshop` activity opens `state.workshopSession = { day, opsLeft: 3, companionId? }`; craft, upgrade, reroll and dismantle each need an open session of today and spend one op. A companion who likes `tech` gives a 25 % chance of a free +1 on her equipped weapon.
- **Combat only writes `state.combat` and `state.rng`.** HP, stress, XP, levels, injuries, deaths, breakdowns and loot are written once by `finalizeCombat`, in the same dispatch in which the combat is decided. Hence `combat/retry` (only from `lost_pending`, i.e. a loss with `allowRetry`) restores `rng` to `combat.start.rng` and rebuilds from the stored payload: JSON-equal to the state right after `combat/start`. P4 writes no memory or chronicle entries.
- **Loot banking:** `combat/start { bankLoot }`; `false` (P5 expeditions, the drill) only records loot in `lastCombat.loot`.
- **Breakdown persistence:** `Unit.breakdown = { defectId, day }` survives between combats; `squad/release_breakdowns` (P5 calls it on return) clears it and emits `breakdown_released`; a combat with `expedition: false` releases at finalize. A unit at stress 80–99 follows her breakdown policy 25 % of turns without spending a `once` or shutting down.
- **Easy retry** is the global setting `easyRetry` (default off), applied by `app.startCombat` (it overrides the caller's `allowRetry`). **Difficulty** is per campaign: `campaign/set_difficulty` (refused during a combat).
- **Auto-resolve** = `combat/auto { on: true }`: squad units are chosen by the role's AI profile in the same dispatch until the combat ends. AUTO never issues orders. `canAutoResolve` = encounter power ≤ 60 % of squad power.
- **Round cap:** a combat past round 30 ends as `retreated`. A squad unit with no usable skill passes by itself.
- **Commander Crisis:** `encounter.exposesCommander` + `coverId`. The commander is not a combatant but a pseudo target `commander` (HP 60, DEF 10): enemy skills that reach the back row may pick it (melee only once the squad's front is gone); the cover unit takes the hit while she stands; `intercept_lethal` saves him once per combat; at 0 HP the combat is lost and `injureCommander(draft, 3)` (extracted from `commander/injure`) runs. Area effects never reach the commander.
- **Relation hints** leave in `lastCombat.relationHints` for P5's debrief (`intents/apply`): the cover unit took hits → `{ protected, actor: unitId }`; protective orders on a unit below 30 % HP → `{ protected, actor: 'commander', targets: [unitId] }`; a unit downed → `{ endangered, actor: 'commander', targets: [unitId] }`; one per (type, actor, target), highest severity kept.
- **Time inside a combat:** a status expires at the end of its owner's turn, so a unit's self-applied status needs `turns: 2` to cover her next turn (the Guard action does this). Cooldown N is stored as N + 1 and ticks at each of her turn starts. `onAllyDowned` also fires for the downed unit itself (enemy affix `volatile`).
- **Vocabulary additions** beyond the draft: `damage.pctMaxHp` (true damage for bleed/burn), `outgoing.scale`, `stat: 'all'`, target `allies_front`, status flag `rooted`. `reinforcing` always summons a `husk`.
- **Settings and UI:** `easyRetry`, `enemyFlavor` (the optional cached `flavor` kind `enemy`), SYS difficulty select; the combat screen (keyboard: `1`–`6` skills, `←`/`→` targets, `Enter`, `G S P`, `Q W E R T` orders, `A`, `Esc`), the INV tab (dry-run dispatch gives the greyed-button reasons), SQUAD tree/loadout/equipment/respec. The app flushes the save at once on every `combat_*` event so a reload resumes the same turn.
- **Entry point without P5:** `app.startCombat(opts)` and the SYS debug tool **Combat drill**.

### Balance (see `BALANCE_REPORT.md`)
The harness is `npm run sim`. Regular fights (danger 2) last 4.2 rounds and every defect is within ±5 pp; at danger 4 (win rate 84 %, 9.5 rounds) six defects are above the band — `graft_rejection` (+13.6), `target_lock` (+9.8), `imprint_hunger` (+9.5), `hunger_loop` (+8.0), `compulsive_protocol` (+5.8), `pain_inversion` (+5.7); none below. Out-of-combat costs are not simulated. The rule is reported, not enforced; tuning continues.

### Not in P4
Bosses, permadeath mode, NPC↔NPC synergies, per-expedition rows between nodes (P5), images for enemies, real tuning of the draft numbers.

### P6 additions
- `Encounter.mutineers?: [{ unitId, row? }]` puts squad units on the enemy side (1–6 opponents in all, none of them in the formation); they fight with their own skills and defect passives, are never written back as squad units, get no XP and no breakdown, and an encounter with no `enemies` drops no loot. `CombatResult.mutineers?: [{ unitId, downed }]`; `CombatResult.enemies` lists only combatants with an `enemyId`.
- `issueOrder` records the last refusal in `CombatState.lastRefusal` (cleared by any later order); `combat/compel` runs that order for free and pledges the unit in `CombatState.compels`; `finalizeCombat` settles the pledges (`CombatResult.compels`), so an easy retry never charges twice.
- A defect's combat effects are scaled by `arcScale` when the combatant is built (Manage halves the downside while maintained, Embrace ×1.5); a Cure removes the defect.
- Loyalty bands add refusal synergies (see P3).
