# P4 — Combat, Progression & Items

**Depends on:** P0, P1 (P2 for workshop/medbay hooks, P3 for synergies — use stubs if not present). **Read:** overview; `content/roles.md` (all); `content/defects.md` (effects); `content/lore.md` §7.

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
