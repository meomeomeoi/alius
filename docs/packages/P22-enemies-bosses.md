# P22 — Enemies, Bosses and Nemeses

**Status: spec.** Release 0.4 (post-release). **Depends on:** P21 (pillars), P18–P20 (arcs, climaxes, cast), P5 (director, clocks, missions, regions), P4, P14. **Read:** overview; P21; P18; this file; the **Implemented as** of P4 and P5.

**Analysis tool (P7a)** and **P14** rules apply.

## Goal

Enough enemies to make the pillars matter, bosses where the story wants a climax, and a personal enemy who remembers the squad. A boss is never mandatory: most arcs end in a scene, a dilemma, a wave or the antagonist (P18).

## 1. Enemies

- From 18 (3 per category) to ~40 (6–7 per category), each with an armour type, poise where large, at least one telegraph for elites, and skills in the P21 vocabulary.
- Affixes for the pillars: `thermal_shielded`, `synthetic_hull`, `spore_coat`, `heat_sink`, `breaker` (high poise damage), `mimic` (copies a damage type it took), plus the existing seven.

## 2. Bosses

Registry `bosses`: `{ id, name, categoryId, regionIds, tier, armour, poise, phases: [{ hpBelow, skills, telegraphs, adds?, arenaRule? }], loot, description }`. Phases change telegraphs and rules (adds, a row becomes hazardous, a pillar is suppressed). Names and descriptions can be personalised by `flavor` (kind `boss`).

**Sources** (author ruling):
1. **Arc climaxes** — some P18 arcs choose `boss` as (part of) the climax; the engine picks from the pool by region and tier.
2. **Hunts** — the `tpl_hunt` template and `hunt` verb (P19) may target a boss when rumors, a clock or region danger justify it.
3. **Clock threats** — a filled clock can spawn a boss mission with a deadline; missing it applies the clock's consequences.
4. **Nemeses** — §3.
5. **Depth runs** — bosses on milestone depths (P26).

## 3. Nemeses

- A named elite (or boss) that **survives**: the squad retreated, lost, or it fled at low HP (a new `flee` behaviour for named elites). It becomes a nemesis record: `{ id, archetypeId, name, level, adaptations[], encounters, lastSeenDay, regionId, grudge }`.
- **Adaptation:** on return it gains one adaptation from what hurt it most (resistance to that damage type, poise up, a counter to the most used pillar, an add that targets the unit who wounded it).
- **Story:** rumors about it, a director thread, arcs may use it as antagonist (P18 antagonist with `nemesisId`); the squad's memory (P3b) keeps the encounters.
- **Limit:** at most 1–2 alive at a time; a defeated nemesis is dead for good (a chronicle entry, a feat for P9b).

## 4. Events, actions

Events: `boss_spawned`, `boss_phase`, `boss_defeated`, `nemesis_born`, `nemesis_adapted`, `nemesis_returned`, `nemesis_slain`. No new player actions.

## Acceptance criteria

1. ~40 enemies and the new affixes exist and validate; every elite has a telegraph.
2. Bosses run their phases; all five sources can produce one; none is mandatory.
3. Nemeses are born only from survival, adapt from the fight log, return in rumors and arcs, and respect the limit.
4. The harness covers boss fights (win rate and rounds per tier).

## Open decisions (author)

- Enemy and boss rosters, names, adaptation list, every number.
