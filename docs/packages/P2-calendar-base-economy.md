# P2 — Calendar, Activities, Base & Economy

**Depends on:** P0, P1. **Read:** overview; `content/lore.md` §8; `content/roles.md` §7 (grunts).

**Status:** implemented (plan: `plans/2026-11-08-p2-calendar-base-economy.md`). Automated tests pass; the in-SillyTavern checklist `MANUAL_TEST_P2.md` still has to be run by hand. Where an earlier draft of this spec said something else, the code won; the differences are listed under **Implemented as** at the end.

## Goal

The day loop works: the player spends slots on activities (alone or with a companion), resources flow, the base can be upgraded, grunts can be recruited, and the day ends with upkeep. Conversations are stubbed as an activity that P3 implements.

## Scope

### 1. Calendar
- Slots: `morning`, `afternoon`, `evening`, `night`. Night is **conditional**: entered only if `nightEventsQueue` is non-empty at end of Evening (P3/P6 enqueue). Otherwise Evening → next Morning.
- Actions consume slots: activity = 1 slot; scene = 1 slot (consumed on scene end); expedition = 2 or 3 slots (P5).
- Day-end pipeline (ordered, each step an engine action with events): supplies upkeep → injury/stress ticks → facility timers → mission deadlines tick (P5) → director tick (P5) → DM/rumor generation hooks (P3/P5) → night event check → autosave.
- PDA header always shows `DAY 012 // EVENING` style clock, resources, and Leash authorizations (P6 fills).

### 2. Activities (registry `activities`)
Fields: `id, name, slotRules (allowed slots), facilityReq {id, level}, cost {credits, supplies, plyx}, companion: 'none'|'optional'|'required', effects (engine effect list), companionEffects, flavor: 'none'|'short'`.

v1 set:
| id | Effect (alone) | With companion |
|---|---|---|
| `train` | XP to chosen unit(s) / commander social stat (Authority) | + companion XP, small Affinity |
| `workshop` | Craft/upgrade item (P4 recipes) | companion's weapon gets +quality chance, Affinity if she likes tech |
| `medbay` | Stress −, injury recovery, defect upkeep (Manage arcs) | stress relief stronger for companion, Trust+ if commander treats her |
| `work` | Credits (scales with Cunning) | — |
| `scout_net` | New rumors / side missions (P5), Insight + | — |
| `rest` | Commander stress (if used) / squad stress −small | companion stress −, Affinity + (diminishing) |
| `mess` | Group meal: squad stress −, supplies cost | group scene option (P3) |
| `study` | Commander Insight/Empathy | — |
| `talk` | Starts a scene (P3) | required |

`flavor: 'short'` → when done with a companion, a ≤2-line generated vignette (main model, budget ~150) shown in a toast-panel; can be disabled in settings to save tokens. **This is not a scene** — no free text, no intent extraction; deltas come from the activity table.

Companion bonuses use P3's diminishing-returns accounting once P3 exists (P2 writes through an interface).

### 3. Commander social stats
`authority, insight, empathy, cunning`, each ranks 1–5 with point thresholds (e.g. 0/10/25/45/70). Gained from activities, events and dilemmas. Exposed to P3/P6 as checks (`requires: {empathy: 3}`) and to UI as unlockable dialogue/choice options.

Commander injury (from Commander Crisis, P4): blocks `train` and `work` for N days; medbay shortens it; units in `lover/devoted/dependent` states react (P3 hook).

### 4. Resources
- `credits` — missions, `work`, selling items.
- `supplies` — daily upkeep: 1 per active-roster unit (Hunger Loop ×2), +1 commander. Shortage: each missing point → stress + Affinity penalty spread across units; 3 consecutive shortage days → Trust penalty event.
- `plyx` — crafting/upgrades, from expeditions and salvage.
Starting amounts per start/crime.

### 5. Base & facilities (registry `facilities`)
| id | Levels | Unlocks / caps |
|---|---|---|
| `barracks` | 1–5 | roster capacity 6→10 (+1 per level from 2), rest efficiency |
| `workshop` | 1–5 | craftable rarity cap, upgrade costs |
| `medbay` | 1–5 | stress relief, injury speed, defect arc stages |
| `mess_hall` | 1–3 | supply efficiency, group-meal bonus |
| `comms` | 1–3 | rumors per day, mission board size, DM features |
Upgrades cost credits + plyx and take N days (timer). BASE tab: ASCII schematic of the outpost with facility blocks and levels.

Scene locations (P3) are base locations, not only the mess hall: quarters, roof, training yard, workshop, medbay, garage, comms room, perimeter.

### 6. Roster & grunt recruitment
- Active expedition roster: 4; total capacity per barracks.
- `recruit_grunt` (BASE action, credits): generates a grunt from seed: role, level ≈ squad avg −1, lite defect, ASCII portrait (procedural from seed: frame + glyph face features), designation `X-###`; optional `flavor` call for a name/one-line bio.
- Named units can also join later via story (P5) — the player imports a card through a shortened P1 wizard.

## Out of scope
Scene content (P3), combat & crafting recipes (P4), missions (P5).

## Acceptance criteria
1. A full week can be simulated by activities alone; resources, stress and stats change per tables; day-end pipeline runs in order.
2. Supply shortage produces the specified penalties.
3. Facility upgrade timers work across days; capacity changes apply.
4. Grunts generate deterministically from seed; portraits render.
5. Social stat checks are queryable by other modules.
6. Unit tests for every activity effect, upkeep math, timers, and seeded grunt generation.

## Implemented as

Decisions taken while implementing, where the spec was silent or the P1 code already had an answer:

- **Social stats.** P1 stores ranks (`socialStats`, 1–5). P2 adds `commander.socialPoints` next to them; a rank without stored points counts as its threshold (0/10/25/45/70), so a start rank is never lost. Queries for other packages: `meetsSocialRequirements(state, { empathy: 3 })`, `socialRank`.
- **Starting resources.** `starts[].startingResources` is the base; corporation bonus and crime effects are added on top.
- **Supplies source.** Nothing in P2 produces supplies, so `base/requisition` (credits → supplies, 8 CR each) exists until P5 expeditions bring supplies. Shortage and its penalties are as specified: each missing point costs 4 stress and 1 Affinity spread over the active roster (a `hunger_loop` unit holds two shares), and every 3rd consecutive shortage day costs 5 Trust.
- **Activities.** Alone → `effects`; with a companion → `companionEffects` **instead**. `talk` emits `scene_requested` and does not consume the slot (P3 calls `calendar/consume_slot` when the scene ends). XP only adds to `unit.xp`; levelling is P4.
- **Night.** At the end of Evening the pipeline runs once; with a non-empty `nightEventsQueue` the head entry moves to `calendar.nightEvent` and the slot becomes Night (P3 reads `nightEvent`). Ending Night rolls over without a second pipeline.
- **Day-end hooks.** P3/P5 plug into `mission_deadlines`, `director_tick` and `dm_rumors` through `registerDayEndStep`.
- **Relationship gains** go through `setRelationGainHandler` (default: full below 4 points a day per axis, half below 8, none after). P3 replaces the handler with its own accounting. `dailyGain` is zeroed at every rollover.
- **Grunts.** Role uniformly random, level = rounded average level of living units − 1 (min 1), stats = role base (growth is P4), one lite defect (`lite: true`, no arc; Desire/Bond only if the campaign setting is on), a signature drawn from the registry (P4 may ignore it for grunts), trust-only relation (base 25, the crime's unconditional `starting_trust` effects, +10 for `grunt_starting_trust`). Generated name and bio use the `flavor` call (`kind: 'grunt'`).
- **Vignette.** New call type `activity_vignette` (main profile, 150 tokens), text only; both vignettes and grunt names have a SYS toggle.
- **Facilities.** All five exist at level 1 from the start. Upgrades cost credits + plyx up front and complete at the day end after their last day. Costs, times and effect values in `facilities.json` are draft balance numbers.
- **Not in P2:** the commander's own stress (the commander has none in the state), the Hunger Loop's extra Affinity from meals (a P3 social hook), base location ids for scenes (P3), workshop recipes and crafting (P4; the `workshop` activity only emits `workshop_session`).
