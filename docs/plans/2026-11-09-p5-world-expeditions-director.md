# P5 World Map, Expeditions, Missions & Director Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A world that moves: regions on a MAP tab, a mission board and a RUMOR MILL on OPS, expeditions as fogged node-map runs (combat, event, cache, rest, objective, retreat, after-action report), and a director that turns a compact world digest into validated mission offers, rumors, thread updates, clock advances and spine beats — with a pure fallback so the world keeps moving without any LLM.

**Architecture:** All rules are pure engine code under `src/engine/world/` (one file per concern), exposed as actions (`world/*`, `mission/*`, `rumor/*`, `expedition/*`, `director/*`, `squad/add_named|decline_incoming`). Every consequence outside combat (mission rewards and failures, clock fills, event options, beat completions) is one **data-driven world-effect vocabulary** (Task 1) run by one interpreter (Task 4). The director is two-phase because the day-end pipeline is synchronous and pure: the engine opens a *director request* in state and emits `director_requested`; a new non-engine layer `src/world/` (like `src/scene/`) makes the `director_tick` call and answers with `director/apply`, or with `director/fallback` when the call fails; the engine validates either answer with the same validator. An open expedition confines the campaign: only `expedition/*`, `combat/*`, `director/*` and `debug/*` actions run until it ends; its slots are spent once, on return.

**Tech Stack:** TypeScript 5 (strict), esbuild, zod 3, vitest (+ jsdom for UI). No new dependencies.

**Spec:** `docs/00-overview.md` (§5.4 lists the interfaces this plan uses), `docs/packages/P5-world-expeditions-director.md` (including **Interfaces already provided by P2 / P3 / P4**); content draft `docs/content/lore.md` §3, §4, §6, §7 — read by Task 2 only.

## Global Constraints

- English everywhere: UI strings, prompts, identifiers, comments (overview P8).
- `src/engine/**` stays pure (architecture test): no imports from `src/st`, `src/ui`, `src/llm`, `src/scene`, `src/sim`, and from Task 14 on `src/world`; no `window`/`document`. `src/world/**` talks to ST only through the `StAdapter` type and never imports `src/ui` (same rule as `src/scene`, new architecture test in Task 14).
- **The model never sets amounts** (spec §5, overview P1/P2): the director returns ids, enums and short texts; credits, plyx, loot, faction and clock numbers come from `rewardTiers`, templates, `clocks` and `TUNING`. Model text is stored and rendered as plain text (`textContent`), never as markup.
- A failed, late or duplicate LLM answer never mutates state (overview §11): `director/apply` needs the id of the open request; `expedition/set_recap` needs the id of the last report.
- Content-like data lives in JSON (overview P4): regions, node types, clocks, mission templates, reward tiers, minor events, spine beat conditions, fallback rumor lines. Rule constants live in `src/engine/tuning.ts` under new `TUNING.world`, `TUNING.expedition`, `TUNING.director`. If no world-effect type can express a consequence, add a **generic** type, never a one-off (overview §6.2).
- Flags are declared (overview §6.1): authored content references `flags` registry ids; the director may only add `thread:<threadId>:<slug>` flags, each stored with a one-line description.
- Spec numbers: mission offers ≤ 2 and rumors ≤ 3 per tick; rumor text ≤ 40 words; beat framing ≤ 60 words; clock advance `1|2`; deadlines ≥ 5 days; node map 3–5 layers of 2–3 nodes; party ≤ 4; expedition 2 or 3 slots; faction standing −100…100; clearance tier 0–3 (level caps 10/20/30/40 — P4's `levelCap`).
- Expedition slots go through P2's rule: `consumeSlots` (the function behind `calendar/consume_slot`) with 2 or 3 slots, only while that many are left today and no talk is open.
- Relationship axes are written only through P3's `applyIntents`; combat only through P4's `combat/*`; loot only through `rollLoot`/`bankLoot`.
- Campaign state stays `version: 1`. Every new field is optional and read through a defaulting helper, so P1–P4 saves load unchanged; the `unknown` world/mission/rumor/expedition fields get real types (empty in every existing save).
- Metadata stays small (overview §5.1): `missions.completed` keeps 30, `rumors` 20, expedition log 60 lines, `lastExpedition.recap` ≤ 1200 chars, open threads ≤ 6 with ≤ 12 dynamic flags each.
- `dist/index.js` and `style.css` are committed; `npm test` rebuilds them; commit them with each change.
- Commit messages end with the `Co-Authored-By:` / `Claude-Session:` trailers of the executing agent (overview P9).

## Where the code differs from the spec (read before Task 1)

Rulings taken while planning, where the spec is silent or the P0–P4 code already decides. List them in the spec's **Implemented as** section in Task 21.

- **Director is two-phase.** `registerDayEndStep('director_tick', …)` cannot await a model. The step (and `expedition` return) opens `world.director.pending = { id, reason, day }` and emits `director_requested`. `director/apply { requestId, output, beatCooldownDays? }` and `director/fallback { requestId }` both close it; a wrong id is rejected. A request still open at the next day end is answered by the engine's own fallback first, so the world never stalls. `rumors_requested` (P2's `scout_net`) opens a request with reason `scout`, of which only the rumors are applied.
- **Fallback director** (`fallbackOutput`, pure, seeded): a command mission every `TUNING.world.commandEveryDays = 3` days while none is offered, one side mission when the board has room, one authored rumor line of a known region, +1 on one region clock every second day, and the current spine beat as soon as its conditions hold. It is also what "director off" (`directorEnabled: false`) uses.
- **`clocks[].onFill` holds inline world effects**, not effect ids. Clock definitions live in a new `clocks` registry; state keeps `{ id, label, segments, filled, regionId?, visibleToPlayer, filledDay? }`.
- **New registries**: `missionTemplates`, `clocks`, `rewardTiers` (added to `REGISTRY_NAMES`, as P3 and P4 did); `regions`, `nodeTypes`, `dilemmaTemplates` get real schemas. Factions are the `corporations` registry (all four ids), standing starts at 0, own corporation +10.
- **Spine.** `world.spineProgress` stays a number = count of completed beats; `world.spine = { proposed?: beatId, proposedDay?, lastProposalDay? }`. `starts[].spine[]` gains optional `conditions { minDay?, flagsAll?, flagsNone?, clearanceMin?, threads?[{ id, status }] }`, `completion` (`{ kind: 'auto' }` default | `{ kind: 'mission', templateId, regionId }` | `{ kind: 'flag', anyOf: flagId[] }`) and `onComplete: WorldEffect[]`. Proposing the current beat stores the framing as a world fact, opens thread `spine:<beatId>` and, for `mission` completion, offers the story mission; the beat is **done** when that mission succeeds, one of the flags is set, or at once (`auto`). `spineProgress === spine.length` is the open-ended phase.
- **The "choice" beats need P6's dilemmas.** Until P6, beat 4 of both starts completes through a story mission whose objective node is a pinned fixed-option event that sets one of three declared flags. P6 may replace the event with a defining dilemma.
- **Minor events** are `dilemmaTemplates` entries with `scale: 'minor'`, `contexts: ['expedition_event']` and an authored `fixed { title, setup, options[] }` block (or `flavor: true` with a single `[CONTINUE]`). The schema passes unknown fields through so P6 can add generation fields. Every non-flavor option must contain at least one cost effect.
- **Objective.** `mission.objective = { node, condition: 'win' | 'reach' }`: the objective is one extra node after the last layer that plays as node type `node`; `win` needs a won combat, `reach` a resolved node.
- **Duration** is the region's `travelSlots` (2 or 3). Slots are spent on **return**, not on departure; `expedition/start` only checks that enough are left, and the dispatch guard keeps everything else out meanwhile.
- **Missions.** `offered` is the board; an expedition makes its mission `active`; success moves it to `completed`. A retreat or a lost combat puts the mission back on the board (it can be retried until its deadline); `failureEffects` apply only when the deadline passes. Story missions have no deadline. Board size (`missionBoardSize`) limits `side` and `rumor` missions; `command` and `story` offers always fit and push out the oldest `side`/`rumor` offer.
- **Points of interest** are standing scavenging runs: `expedition/start { poi: { regionId, poiId } }` creates a `side` mission from the POI's template directly as `active` (never on the board, no deadline), with a per-POI cooldown of `TUNING.world.poiCooldownDays = 2`. They are the supply source P2's notes ask for; `base/requisition` stays unchanged.
- **No consumable items exist** (P4 ships weapon/upper/lower only). "Use consumables" between nodes is `expedition/treat { unitId, kind: 'patch' | 'calm' }`: 1 carried supply → +20 % max HP or −10 stress.
- **Fog.** The map's shape is always visible; a node's type is shown for visited nodes and for nodes within `reveal` steps of the current position (`1` + `1` if a party unit's defect has `expedition.reveal` — `echo_bleed` — + `1` for a mission that came from a rumor). `unknown` nodes resolve on entry.
- **Expedition intents are applied by the engine on return**, not inside the debrief scene: `intents/apply { channel: 'scene' }` needs an open scene with ≤ 3 named participants, which would lose the intents of a skipped debrief. `endExpedition` calls `applyIntents(draft, ctx, { channel: 'scene', participants: party, intents })` (it re-validates everything) with `lastCombat.relationHints` of every fight and the `unit_event` effects of chosen event options, deduplicated per (type, actor, target) with the highest severity, in batches of `TUNING.relations.maxEventsPerExchange`. The debrief (`origin: 'debrief'`, `consumesSlot: false`, location `garage`) stays an optional conversation.
- **After-action report** always exists as deterministic lines built from the structured log (`reportLines`); the `expedition_recap` narrative is added on top when the setting `expeditionRecap` (default on) and the main model allow it.
- **Incoming named units**: world effect `incoming_unit` raises `world.incomingUnits`; `squad/add_named { unit: UnitSetup }` (one-unit `Wizard`, as `resyncUnit` already does) or `squad/decline_incoming` (a `generateGrunt` joins) lowers it. Both need a free bed (`roster.capacity`); without one the offer waits.
- **World map image** is author-supplied and not in the repo: MAP renders the ASCII region grid unless `AppDeps.assetUrl('content/core/map/world.png')` loads, then the image with SVG hotspots.
- **Clearance**: world effect `clearance { tier }` sets `world.clearanceTier = max(current, tier)`, capped at 3.

## File Structure

```
content/core/regions.json, nodeTypes.json, clocks.json, missionTemplates.json,
             rewardTiers.json, dilemmaTemplates.json                         new registries (+ manifest)
content/core/starts.json, flags.json, defects.json                           + beat conditions, world flags, echo_bleed reveal
src/content/types.ts                 REGISTRY_NAMES + missionTemplates, clocks, rewardTiers
src/content/schemas.ts, refs.ts      world-effect vocabulary + new/extended schemas and refs
src/engine/state/types.ts            world, missions, rumors, expedition, lastExpedition typed
src/engine/tuning.ts                 TUNING.world / expedition / director
src/engine/dispatch.ts               expedition guard
src/engine/world/types.ts            Clock, Thread, Mission, Rumor, NodeMap, ExpeditionState, ExpeditionReport, WorldEffect, DirectorOutput
src/engine/world/state.ts            defaulting readers, seedWorld
src/engine/world/effects.ts          applyWorldEffects
src/engine/world/clocks.ts           advanceClock
src/engine/world/missions.ts         offerMission, rollRewards, completeMission, runDeadlines, rumors
src/engine/world/spine.ts            currentBeat, beatReady, proposeBeat, completeBeat
src/engine/world/nodeMap.ts          generateNodeMap, nextNodes, visibleTypes, mapRows
src/engine/world/expedition.ts       checkExpedition, startExpedition, moveTo, chooseOption, resolveCombat, treat, endExpedition, reportLines
src/engine/world/director.ts         buildDigest, validateDirectorOutput, applyDirectorOutput, fallbackOutput, openRequest
src/engine/world/index.ts            exports for P6
src/engine/actions/world.ts, expedition.ts                                   new actions and day-end steps
src/engine/setup.ts                  + makeNamedUnit (extracted), seedWorld in buildCampaign
src/llm/calls/directorTick.ts, expeditionRecap.ts                            two call types
src/world/directorController.ts      director request → LLM → apply / fallback
src/world/expeditionController.ts    planner state, run flow, combat hand-off, recap, debrief
src/world/context.ts                 `world` context provider
src/settings.ts, src/ui/shell/sysTab.ts                                      directorEnabled, beatCooldownDays, expeditionRecap
src/ui/map/mapTab.ts, src/ui/ops/missionBoard.ts, src/ui/ops/opsTab.ts       MAP tab, board and RUMOR MILL
src/ui/expedition/expeditionScreen.ts, planner.ts, nodeMapView.ts, report.ts expedition screen
src/app.ts, src/index.ts             wiring, assetUrl
css/80-world.css
docs/** (Task 21), tests/** mirror src
```

## Review Focus

1. **Reload or chat switch in the middle of a run** (between `expedition/move` and the fight, between `combat_ended` and the node's resolution, on the AAR screen) → the expedition resumes at the same node; one combat result is counted exactly once (`pending.prevCombatId`); a late dispatch for another chat is dropped. Tests in Task 10 (`a combat result is consumed once`, `expedition round-trips through JSON mid-node`) and Task 20 (`reload with a finished fight resolves the node`).
2. **The party cannot go on** (every unit injured or dead after a won fight, the last grunt dies, a unit was removed from the squad by a state edit) → the run ends as a retreat in the same dispatch; it is never left with no legal action. Tests in Task 10 (`a win with nobody standing forces a retreat`) and Task 11.
3. **Director answer that is late, repeated or missing** (two answers for one request, an answer after the next day's request, the chat switched during the call, no mechanic profile, truncated JSON) → applied at most once per request; otherwise the fallback answers; a request left open is closed by the next day end. Tests in Task 12 (`apply needs the open request id`, `an unanswered request is answered by the fallback at the next day end`) and Task 14.
4. **Content changed under a save** (a region, mission template, node type, event or clock removed while a mission is offered or an expedition is open) → the mission is dropped from the board with `mission_expired`; a node that can no longer be played resolves as `Nothing here.` and the run continues; the day-end steps never throw for it. Tests in Tasks 5 and 9.
5. **Slots and supplies at the edges** (start in the Evening or Night, a 3-slot region in the Afternoon, a talk holding the slot, an open scene, returning through the Evening so the day ends inside the return, carrying more supplies than owned, a rest node with too few supplies) → refused with the reason before anything changes; the day-end pipeline runs once and does not fail the mission that was just completed; a rest without supplies gives nothing and says so. Tests in Tasks 9 and 11.

---

### Task 1: World-effect vocabulary and world content schemas

**Files:**
- Modify: `src/content/types.ts` (REGISTRY_NAMES + `missionTemplates`, `clocks`, `rewardTiers`), `src/content/schemas.ts`, `src/content/refs.ts`
- Create: `src/engine/world/types.ts` (effect types and const arrays only in this task)
- Test: `tests/content/worldSchemas.test.ts`, `tests/content/schemas.test.ts` (extend)

**Interfaces:**
- Produces in `engine/world/types.ts`: `WORLD_EFFECT_TYPES = ['resource','carried_supplies','faction','clock','flag','clearance','party_stress','party_hp','loot','leash','thread','unit_event','incoming_unit','fact','offer_mission']`; `NODE_KINDS = ['combat','event','cache','rest','objective','unknown']`; `MISSION_SOURCES = ['command','story','rumor','side']`; `THREAD_STATUSES = ['open','resolved','failed','dormant']`; `type WorldEffect` (discriminated on `type`): `resource { resource: 'credits'|'supplies'|'plyx', amount: int }`, `carried_supplies { amount: int }`, `faction { factionId, amount: int −30…30 }`, `clock { clockId, by: −2…2 except 0 }`, `flag { flagId }`, `clearance { tier: 1|2|3 }`, `party_stress { amount: int }`, `party_hp { pct: int −90…100 }`, `loot { tableId, rolls?: 1…3 }`, `leash { amount: −1|1 }`, `thread { threadId, status }`, `unit_event { event: EventType, severity, targets: 'party'|'named', valueAxes?: [{ axis, direction: −1|1 }] }`, `incoming_unit {}`, `fact { text ≤ 200, tags: string[], importance: 1…5 }`, `offer_mission { templateId, regionId?, source }`.
- `isCostEffect(e: WorldEffect): boolean` in `schemas.ts`: `resource`/`carried_supplies`/`faction`/`party_hp`/`leash` with a negative number, `party_stress` or `clock` with a positive one, `unit_event` whose `event` is one of `sided_against, decision_violated, endangered, coerced, dismissed`.
- Schemas (strict unless noted): `WorldEffectSchema`; `RegionSchema` (`name, summary, environmentPrompt, danger 1…5, travelSlots: 2|3, enemyTable { categories: Record<string, number>, archetypes?: string[] }, modifiers: string[], mapHotspot: [x, y][] ≥ 3 points each 0…100, mapCell { x: 0…2, y: 0…2 }, layers: [min, max] inside 3…5, nodeWeights: Record<nodeTypeId, number > 0>, pointsOfInterest: [{ id, name, summary, templateId }], rumors: string[] (each ≤ 40 words), knownFromStart?: boolean, unlockedBy?: { flag?, clearanceMin? }`); `NodeTypeSchema` (`name, glyph: one character, kind, combat?: { dangerDelta: −1…2, lootTableId, exposesCommander?: boolean }` required iff `kind: 'combat'`, `rest?: { suppliesPerUnit: int ≥ 0, hpPct, stress }` iff `rest`, `resolvesTo?: Record<nodeTypeId, number>` iff `unknown`, `firstLayer?: boolean` (default true), `maxPerMap?: int`, `minDanger?: 1…5`); `ClockSchema` (`label, segments 4…12, startFilled ≥ 0 and < segments, regionId?, visibleToPlayer, onFill: WorldEffect[], repeat?: boolean`); `RewardTierSchema` (`rank 1…5, credits [min, max], plyx [min, max], lootTableId?, lootRolls?: 1…3, faction?: int 0…15`); `MissionTemplateSchema` (`name, sources ≥ 1, regions?: string[], objectives: [{ node, condition: 'win'|'reach' }] ≥ 1, dangerRange [min, max] in 1…5, tiers: string[] ≥ 1, factionId?, clearance?: 1|2|3, objectiveEventId?, failureEffects: WorldEffect[], onSuccess?: WorldEffect[], titles: string[] ≥ 1 (≤ 60 chars), briefs: string[] ≥ 1 (≤ 300 chars)`); `DilemmaTemplateSchema` (passthrough: `scale: 'minor'|'major'|'defining', contexts: string[] ≥ 1, regions?: string[], flavor?: boolean, fixed?: { title, setup ≤ 600, options: [{ label ≤ 80, requires?: { stat, rank 1…5 }, effects: WorldEffect[] }] }`; a `minor` entry with context `expedition_event` needs `fixed`; `flavor: true` → exactly 1 option with no effects, else 2–4 options each with ≥ 1 `isCostEffect`); `StartSchema.spine[]` + optional `conditions`, `completion`, `onComplete` (shapes in **Where the code differs**); `DefectSchema` + optional `expedition?: { reveal: 1 }`. Register all in `registrySchemas`.
- Add to `RESERVED_EVENT_TYPES`: `world_seeded, clock_advanced, clock_filled, faction_changed, flag_set, clearance_raised, thread_changed, mission_offered, mission_completed, mission_failed, mission_expired, rumor_posted, rumor_followed, beat_proposed, beat_completed, incoming_unit_offered, unit_joined, director_requested, director_applied, director_rejected, expedition_started, expedition_moved, expedition_node, expedition_combat, expedition_event, expedition_choice, expedition_treated, expedition_ended, expedition_recap_set`.
- Refs: every `WorldEffect` wherever it appears (`faction.factionId` → corporations; `clock.clockId` → clocks; `flag.flagId` → flags with scope `world` or `commander` (check); `loot.tableId` → lootTables; `offer_mission.templateId` → missionTemplates, `.regionId` → regions); regions `enemyTable.categories` keys → enemyCategories, `archetypes` → enemies, `nodeWeights` keys → nodeTypes, `pointsOfInterest[].templateId` → missionTemplates (check: `sources` includes `side`), `unlockedBy.flag` → flags; nodeTypes `combat.lootTableId` → lootTables, `resolvesTo` keys → nodeTypes (check: kind is not `unknown`/`objective`); clocks `regionId` → regions; missionTemplates `regions` → regions, `objectives[].node` → nodeTypes (check: kind `combat`, `event` or `cache`), `tiers` → rewardTiers, `factionId` → corporations, `objectiveEventId` → dilemmaTemplates; dilemmaTemplates `regions` → regions; starts `spine[].conditions.flagsAll|flagsNone` and `completion.anyOf` → flags, `completion.templateId` → missionTemplates (check: `sources` includes `story`), `completion.regionId` → regions; corporations `startingRegionId` → regions (replace the "no reference check" comment).

- [x] **Step 1: Write the failing tests** — `every world effect type parses its minimal example and rejects an unknown field`; `clock effect by 0 is rejected`; `region needs 3 hotspot points and layers inside 3..5`; `combat node type needs a combat block, rest a rest block, unknown resolvesTo`; `mission template without objectives or tiers is rejected`; `minor expedition event needs a fixed block`; `a non-flavor option without a cost effect is rejected`; `a flavor event with effects is rejected`; `spine beat accepts conditions, completion and onComplete and still parses without them`; `refs: unknown clock, faction, flag, loot table, region, node type, template and tier ids are reported with their path`; `a relation-scoped flag in a world effect is reported`; `REGISTRY_NAMES contains missionTemplates, clocks, rewardTiers`; `emit_event cannot impersonate expedition_ended`.
- [x] **Step 2: Run** `npx vitest run tests/content` → FAIL.
- [x] **Step 3: Implement** the type module, schemas and refs.
- [x] **Step 4: Run** `npx vitest run` → whole suite green (the core pack still loads: `startingRegionId` refs fail until Task 2 — implement Tasks 1 and 2 back to back and run the whole suite after Task 2; here `tests/content/core.test.ts` may fail only on `startingRegionId`); `npm run typecheck` clean.
- [x] **Step 5: Commit** `feat(content): world-effect vocabulary and P5 registry schemas`.

---

### Task 2: Core content — regions, node types, clocks, missions, events, spine

**Files:**
- Create: `content/core/regions.json`, `nodeTypes.json`, `clocks.json`, `missionTemplates.json`, `rewardTiers.json`, `dilemmaTemplates.json`
- Modify: `content/core/manifest.json`, `starts.json`, `flags.json`, `defects.json` (`echo_bleed.expedition = { "reveal": 1 }`), `tests/content/core.test.ts`

**Interfaces:**
- Consumes: Task 1 schemas; lore.md §3, §4, §6, §7. Numbers and texts are draft (author rewrites); the ids below are fixed because tests and later tasks use them.
- Regions (lore §6): `quarantine_d7` (danger 1, travelSlots 2, mutant_human 3 / mutant_beast 2, `knownFromStart`), `kestrel_corridor` (danger 1, 2 slots, mutant_human 3 / enemy_soldier 1, `knownFromStart`), `ashway` (danger 2, 2 slots, marauder 3 / mutant_beast 2, `knownFromStart`), `drowned_market` (danger 3, 3 slots, marauder 2 / mutant_human 2 / anomaly 1, `unlockedBy { clearanceMin: 1 }`), `the_garden` (danger 5, 3 slots, anomaly 3 / offspec_hostile 2, `unlockedBy { clearanceMin: 2 }`). Each: one POI `scavenge` (`templateId: tpl_scavenge`), ≥ 3 fallback rumor lines, distinct `mapCell`, `nodeWeights` over `combat, elite, event, cache, rest, unknown, crisis`.
- Node types (8, spec §4): `combat` (⚔, combat, dangerDelta 0, `loot_standard`), `elite` (☠, combat, +1, `loot_elite`, `firstLayer: false`), `event` (!, event), `cache` (≡, cache), `rest` (+, rest: 1 supply per unit, hp +25 %, stress −15, `firstLayer: false`), `unknown` (?, unknown → combat 4 / event 3 / cache 3), `objective` (◎, objective), `crisis` (▲, combat, +1, `loot_elite`, `exposesCommander: true`, `firstLayer: false`, `maxPerMap: 1`, `minDanger: 3`).
- Clocks: `bloom_d7` (8 segments, region quarantine_d7, visible, onFill: `offer_mission tpl_outbreak` in quarantine_d7 with source `command`), `corridor_quota` (6, kestrel_corridor, visible, onFill: `clock oversight +1`), `oversight` (6, no region, visible, `repeat: true`, onFill: `leash −1` + `fact` "Oversight opened a file on the unit." — no faction effect, because an effect cannot name "the commander's own corporation"), `sable_operation` (6, ashway, hidden, onFill: `faction sable −10`), `garden_wake` (10, the_garden, hidden, onFill: one `fact`).
- Reward tiers: `tier_1` (rank 1, credits 20–40, plyx 2–6), `tier_2` (40–70, 5–10, `loot_standard` ×1), `tier_3` (70–120, 8–16, `loot_elite` ×1, faction 5), `tier_4` (120–200, 15–30, `loot_elite` ×2, faction 10).
- Mission templates: `tpl_sweep` (command, side; objective combat/win; tiers 1–2; failure: `clock oversight +1`), `tpl_recover` (command, rumor, side; cache/reach; tiers 1–3), `tpl_escort_data` (command; event/reach; tiers 2–3; failure: `clock oversight +1`, `leash −1`), `tpl_hunt` (side, rumor; elite/win; tiers 2–4), `tpl_scavenge` (side; cache/reach; tier 1; no failure effects), `tpl_outbreak` (command; elite/win; tier 3; failure `clock bloom_d7 +2`), and per start four `story` templates named `tpl_<start>_beat_<n>` for beats 1–4 (beat 4: event/reach with `objectiveEventId`). Command templates carry the own corporation as `factionId` where authored per start (`tpl_sweep` has none).
- Events (`dilemmaTemplates`, all `minor` + `expedition_event`): ≥ 6 generic fixed-option events (2–3 options, each a real trade: supplies vs stress, loot vs clock, a `requires { empathy: 3 }` third way, `unit_event sided_with`/`decision_violated` with value axes on at least three of them), ≥ 2 flavor events, and the two pinned choices `evt_vesper_choice` (options set `evidence_delivered_vesper` / `evidence_sold_aurum` / `evidence_buried`) and `evt_kestrel_choice` (`quota_met_k12` / `spared_survivors_k12` / `sable_offer_taken`).
- Flags (scope `world`, `setBy: ["event"]`, the three of each choice `mutuallyExclusiveWith` each other): the six above.
- Spine: both starts keep their six beat ids. `beat_1`: no conditions, completion mission in the start region, onComplete `clearance 1`. `beat_2`: `minDay 4`, mission. `beat_3`: `minDay 8`, mission, onComplete `incoming_unit`. `beat_4`: `minDay 12`, `clearanceMin 1`, mission with the pinned event, onComplete `clearance 2`. `beat_5`: `minDay 16`, completion `{ kind: 'flag', anyOf: [the start's three choice flags] }` (one is already set by beat 4, so the beat is done when it is proposed), onComplete `clearance 3` (per-flag consequences are P6's). `beat_6`: completion `auto`.

- [x] **Step 1: Write the failing tests** (extend `tests/content/core.test.ts`) — `core pack loads with zero errors`; `five regions, eight node types, both start regions exist and are known from the start`; `every region has a scavenge POI and three rumor lines of at most 40 words`; `every mission template source is covered: command, story, rumor, side`; `every spine beat of both starts has a reachable completion (mission template with source story in an existing region, declared flags, or auto)`; `the pinned choice events set mutually exclusive declared flags`; `at least six non-flavor minor events, each option with a cost`; `clearance 1, 2 and 3 are each granted by some beat`; `echo_bleed reveals one more step`.
- [x] **Step 2: Run** `npx vitest run tests/content` → FAIL.
- [x] **Step 3: Write the content.**
- [x] **Step 4: Run** `npx vitest run` → whole suite green.
- [x] **Step 5: Commit** `feat(content): regions, node types, clocks, missions, minor events and spine conditions`.

---

### Task 3: State types, tuning, world seeding and the expedition guard

**Files:**
- Modify: `src/engine/state/types.ts`, `src/engine/tuning.ts`, `src/engine/dispatch.ts`, `src/engine/setup.ts` (`buildCampaign` calls `seedWorld`), `src/engine/world/types.ts`, `tests/helpers/world.ts` (import the new action modules as they appear)
- Create: `src/engine/world/state.ts`, `src/engine/actions/world.ts`
- Test: `tests/engine/world/state.test.ts`, `tests/engine/dispatch.test.ts` (extend), `tests/engine/state.test.ts` (extend)

**Interfaces:**
- Types in `engine/world/types.ts`:
  - `Clock { id; label; segments; filled; regionId?; visibleToPlayer; filledDay? }`
  - `Thread { id; title; status: ThreadStatus; flags: Array<{ id: string; description: string }>; relatedUnits: string[]; relatedRegions: string[]; createdDay }`
  - `RegionState { known: boolean; lastVisitedDay?: number; poi?: Record<string, number> }`
  - `Mission { id; source: MissionSource; templateId; title; brief; regionId; danger: 1|2|3|4|5; objective: { node: string; condition: 'win'|'reach' }; offeredDay; deadlineDay?; rewardsTier: string; failureEffects: WorldEffect[]; threadId?; spineBeat?; poiId?; scouted?: boolean; status: 'offered'|'active'|'completed'|'failed'; outcomeDay?; rewards?: MissionRewards }`
  - `MissionRewards { credits; plyx; items: string[] /* item names */; clearance?: number; faction?: { id: string; amount: number } }`
  - `Rumor { id; day; text; tags: string[]; leadsTo: 'mission'|'fact'|'none'; lead?: { templateId: string; regionId: string }; status: 'new'|'followed' }`
  - `MapNode { id; layer: number; type: string; resolvedType?: string; edges: string[]; visited: boolean }`, `NodeMap { layers: string[][]; objectiveId: string; nodes: Record<string, MapNode> }`
  - `ExpeditionLogEntry { n: number; nodeId?: string; kind: 'start'|'move'|'combat'|'event'|'cache'|'rest'|'treat'|'objective'|'retreat'|'return'; text: string; data?: Record<string, unknown> }`
  - `PendingNode = { kind: 'combat'; nodeId; encounter: Encounter; prevCombatId?: string } | { kind: 'event'; nodeId; templateId: string }`
  - `ExpeditionState { id; missionId; regionId; day; slots: 2|3; party: string[]; formation: { front: string[]; back: string[] }; supplies: number; map: NodeMap; at: string | null; path: string[]; phase: 'travel'|'combat'|'event'; pending?: PendingNode; loot: LootDrop[]; log: ExpeditionLogEntry[]; hints: QueuedIntent[]; objectiveDone: boolean; reveal: number }`
  - `QueuedIntent { type: EventType; actor: 'commander' | string; targets: string[]; severity: Severity; evidence: string; valueAxes?: Array<{ axis: ValueAxis; direction: -1 | 1 }> }`
  - `ExpeditionReport { id; missionId; missionTitle; regionId; day; outcome: 'success'|'retreated'|'failed'; party: string[]; nodes: string[] /* node type ids in path order */; log: ExpeditionLogEntry[]; loot: LootDrop[]; rewards?: MissionRewards; injuries: string[]; deaths: string[]; breakdowns: string[]; recap?: string; acknowledged: boolean; debriefed: boolean }`
  - `DirectorRequest { id: string; reason: 'day_end'|'expedition'|'scout'; day: number }`
- `CampaignState` changes: `world.regions: Record<string, RegionState>`, `world.clocks: Clock[]`, `world.threads: Thread[]`, `world.seeded?: boolean`, `world.spine?: { proposed?: string; proposedDay?: number; lastProposalDay?: number }`, `world.director?: { pending?: DirectorRequest; lastTickDay?: number; seq?: number }`, `world.incomingUnits?: number`, `world.lastExpeditionRegionId?: string`, `missions: { offered: Mission[]; active: Mission[]; completed: Mission[] }`, `rumors: Rumor[]`, `expedition?: ExpeditionState`, `lastExpedition?: ExpeditionReport`.
- `TUNING.world = { completedMax: 30, rumorsMax: 20, threadsOpenMax: 6, threadFlagsMax: 12, deadlineMinDays: 5, deadlineMaxDays: 14, commandEveryDays: 3, poiCooldownDays: 2, insightRumorRank: 3, ownFactionStart: 10 }`; `TUNING.expedition = { partyMax: 4, suppliesMax: 12, treat: { hpPct: 20, stress: 10 }, logMax: 60, recapMax: 1200, breakdownNight: { priority: 60, expiresInDays: 2 } }`; `TUNING.director = { maxOffers: 2, maxRumors: 3, maxClockPerClock: 2, maxClockTotal: 3, beatCooldownDays: 3, titleMax: 60, briefMax: 300, rumorWords: 40, framingWords: 60, reasonMax: 120, digestFlags: 8 }`.
- `state.ts`: `factionStanding(state, id): number` (0 default), `clockById(state, id)`, `regionState(state, id): RegionState` (default `{ known: false }`), `knownRegions(state, reg): Entry[]` (known in state, or `knownFromStart`, or `unlockedBy` satisfied), `seedWorld(draft, reg): EngineEvent[]` — idempotent (`world.seeded`): one `Clock` per `clocks` entry at `startFilled`; `factions[id] = 0` for every corporation and `TUNING.world.ownFactionStart` for the commander's; `regions[id].known` for `knownFromStart` regions and the start region; emits `world_seeded`. It never offers missions (the first director tick does).
- Action `world/seed {}` → `seedWorld` (a second call is a no-op with no events).
- `dispatch.ts`: after the combat guard — while `state.expedition` is open only action types starting with `expedition/`, `combat/`, `director/` or `debug/` run; anything else returns the original state and `{ type: 'error', code: 'expedition_open', message: 'An expedition is under way: finish or abandon it first.' }`.

- [x] **Step 1: Write the failing tests** — `seedWorld creates every clock at its start value, factions at 0 with the own corporation at 10, and knows the start region`; `seedWorld twice changes nothing`; `buildCampaign returns a seeded world`; `a P4-era save (world.clocks = [], no seeded flag) loads through migrate and seeds with world/seed`; `knownRegions adds a region when its clearance requirement is met`; `an activity is refused while an expedition is open and the state is unchanged`; `combat and debug actions still run while an expedition is open`.
- [x] **Step 2: Run** `npx vitest run tests/engine/world tests/engine/dispatch.test.ts tests/engine/state.test.ts` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** `npx vitest run` → whole suite green; `npm run typecheck` clean (fix every former `unknown` read).
- [x] **Step 5: Commit** `feat(engine): P5 state types, world seeding and the expedition guard`.

---

### Task 4: World-effect interpreter and clocks

**Files:**
- Create: `src/engine/world/effects.ts`, `src/engine/world/clocks.ts`
- Test: `tests/engine/world/effects.test.ts`, `tests/engine/world/clocks.test.ts`

**Interfaces:**
- Consumes: Task 3 types; `addFact` (`engine/memory`), `rollLoot`/`bankLoot` (`engine/items`), `isLiving`, `activeRosterUnits` (`engine/economy`), `unitStats` (`engine/combat/stats`).
- `applyWorldEffects(draft: CampaignState, ctx: EngineCtx, effects: WorldEffect[], src: { kind: 'mission'|'clock'|'event'|'beat'|'director'; id: string; depth?: number }): EngineEvent[]` — per type: `resource` clamps at 0 (`resource_changed`); `carried_supplies` only with an open expedition (clamped 0…`suppliesMax`), otherwise ignored; `faction` clamps −100…100 (`faction_changed`); `clock` → `advanceClock`; `flag` adds to `world.flags` or `commander.flags` by the flag's scope, first removing its `mutuallyExclusiveWith` (`flag_set`); `clearance` → max, cap 3 (`clearance_raised`, only when it rises); `party_stress`/`party_hp` on the expedition party, or the active roster without one (stress 0…100; HP never below 1, never above max); `loot` appends to `expedition.loot` on an expedition, else banks; `leash` clamps `authorizationsLeft` at 0; `thread` sets the status of an existing thread (`thread_changed`); `unit_event` pushes a `QueuedIntent` (actor `commander`, targets = party, or named party units for `named`, evidence = the source's label) onto `expedition.hints`, ignored without an expedition; `incoming_unit` increments `world.incomingUnits` (`incoming_unit_offered`); `fact` → `addFact({ about: [], knownBy: ['*'], day })`; `offer_mission` → `offerMission` (Task 5; until then a stub that throws `not implemented` and is replaced in Task 5). Effects whose target id no longer exists are skipped with no event. Nested effects (a clock's `onFill`) run with `depth + 1`; depth > 3 stops (`clock A fills B fills A` cannot loop).
- `advanceClock(draft, ctx, clockId, by, reason: string): EngineEvent[]` — clamps to `0…segments`; emits `clock_advanced { clockId, filled, by, reason }`; on reaching `segments`: sets `filledDay`, emits `clock_filled`, runs the registry entry's `onFill` through `applyWorldEffects`, and with `repeat: true` resets `filled` to 0. A full non-repeating clock ignores further advances.

- [ ] **Step 1: Write the failing tests** — one per effect type (`resource never goes below zero`, `faction clamps at ±100`, `a flag removes the flags it excludes`, `clearance never drops and stops at 3`, `party_hp never kills and never exceeds max`, `loot waits in the expedition and is banked without one`, `unit_event queues an intent for named party units only`, `incoming_unit raises the counter`, `fact is public`); `an effect on a removed clock or faction is skipped`; `clock fills, runs onFill once and stays full`; `repeat clock resets`; `two clocks filling each other stop at depth 3`; `negative advance cannot go below 0`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/world/effects.test.ts tests/engine/world/clocks.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): world-effect interpreter and clocks`.

---

### Task 5: Missions — offers, board, rewards, deadlines

**Files:**
- Create: `src/engine/world/missions.ts`
- Modify: `src/engine/actions/world.ts`, `src/engine/world/effects.ts` (real `offer_mission`)
- Test: `tests/engine/world/missions.test.ts`

**Interfaces:**
- Consumes: `facilityEffect(state, reg, 'comms', 'missionBoardSize')`, `nextId(draft, 'm')` (`engine/memory`), `rollLoot`, `bankLoot`, Task 4.
- `interface MissionOffer { templateId; regionId; source: MissionSource; danger?: number; title?: string; brief?: string; objectiveNode?: string; deadlineDays?: number; rewardsTier?: string; threadId?: string; spineBeat?: string; scouted?: boolean }`
- `checkOffer(state, reg, o: MissionOffer): string | null` — template and region exist; region known; `source` in `template.sources`; region allowed by `template.regions`; `objectiveNode` (if given) is one of the template's objectives; `rewardsTier` (if given) in `template.tiers`; `threadId` (if given) is an open thread; a `story` offer needs `spineBeat`; no offered or active mission with the same `templateId` + `regionId`.
- `offerMission(draft, ctx, o: MissionOffer): { mission: Mission | null; events: EngineEvent[] }` — fills defaults with `ctx.rng` (danger = `clamp(o.danger ?? region.danger, dangerRange)`; title/brief from the template lists when absent, cut to `titleMax`/`briefMax`; first objective; lowest tier; `deadlineDay = day + clamp(deadlineDays ?? 7, 5, 14)`, none for `story`); board rule from **Where the code differs** (a full board refuses `side`/`rumor`, `command`/`story` push out the oldest `side`/`rumor` with `mission_expired`); emits `mission_offered`.
- `boardRoom(state, reg): number`; `missionById(state, id): Mission | undefined` (offered or active).
- `rollRewards(draft, ctx, m: Mission): { rewards: MissionRewards; drops: LootDrop[] }` — credits and plyx `rng.int` in the tier's ranges, drops from the tier's loot table, faction from `template.factionId` + tier `faction`, clearance from `template.clearance`.
- `completeMission(draft, ctx, missionId): EngineEvent[]` — active → `completed` (`status`, `outcomeDay`, `rewards`), banks credits/plyx/drops, applies faction and clearance, runs `template.onSuccess`, calls `onMissionCompleted` of Task 7 (a no-op hook until then), trims `completed` to `completedMax`, emits `mission_completed`.
- `releaseMission(draft, missionId)`: active → back to `offered` (retreat); a POI mission is dropped instead.
- `runDeadlines(draft, ctx): EngineEvent[]` — for offered missions with `deadlineDay <= draft.day`: `status: 'failed'`, apply `failureEffects` (`src.kind: 'mission'`), move to `completed`, `mission_failed`; missions whose template or region no longer exists are removed with `mission_expired` and no effects. Registered as `registerDayEndStep('mission_deadlines', runDeadlines)` in `actions/world.ts`.
- Action `mission/dismiss { missionId }` — removes an offered `side`/`rumor` mission (no effects); refuses `command`/`story`.

- [ ] **Step 1: Write the failing tests** — `offer fills title, brief, danger, tier and a deadline of at least 5 days`; `a story offer has no deadline and needs a spine beat`; `an unknown template, unknown region, unknown tier or wrong source is refused with a reason`; `a duplicate template+region offer is refused`; `a full board refuses a side offer and lets a command offer push out the oldest side one`; `board size follows the comms level`; `rewards stay inside the tier ranges for 200 seeds`; `completion banks credits, plyx and loot once and applies faction and clearance`; `deadline day passing fails the mission and applies its failure effects once`; `a mission completed today is not failed by tonight's deadline step`; `a mission whose template was removed expires without effects and the step does not throw`; `dismiss refuses a command mission`; `completed keeps the newest 30`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/world/missions.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): missions, board limit, tiered rewards and deadlines`.

---

### Task 6: Rumors

**Files:**
- Modify: `src/engine/world/missions.ts`, `src/engine/actions/world.ts`
- Test: `tests/engine/world/rumors.test.ts`

**Interfaces:**
- `rumorCap(state, reg): number` = `min(TUNING.director.maxRumors, facilityEffect(comms, 'rumorsPerDay') + (socialRank(state, 'insight') >= TUNING.world.insightRumorRank ? 1 : 0))`.
- `postRumor(draft, ctx, r: { text: string; tags: string[]; leadsTo: 'mission'|'fact'|'none'; lead?: { templateId: string; regionId: string } }): Rumor | null` — plain text cut to 40 words; at most `rumorCap` rumors with `day === draft.day`; a `mission` lead must pass `checkOffer` with source `rumor` now, otherwise it is stored as `leadsTo: 'none'`; keeps the newest `rumorsMax`; emits `rumor_posted`.
- Action `rumor/follow { rumorId }` — status `new` only: `mission` → `offerMission({ ...lead, source: 'rumor', scouted: true })` (a refusal by the board keeps the rumor `new` and throws the reason); `fact` → `addFact({ about: [], text, tags, importance: 2, knownBy: ['*'] })`; `none` → refused. Emits `rumor_followed`.

- [ ] **Step 1: Write the failing tests** — `cap follows comms level and insight rank and never exceeds 3`; `a rumor over the daily cap is not stored`; `a 60-word text is cut to 40 words`; `following a mission rumor offers a scouted rumor-source mission`; `following with a full board keeps the rumor and reports why`; `following a fact rumor adds one public fact`; `a rumor cannot be followed twice`; `rumors keep the newest 20`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/world/rumors.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): rumor mill with mission and fact leads`.

---

### Task 7: Spine beats and clearance

**Files:**
- Create: `src/engine/world/spine.ts`
- Modify: `src/engine/world/missions.ts` (`onMissionCompleted` hook), `src/engine/world/effects.ts` (`flag` → `checkBeatFlags`)
- Test: `tests/engine/world/spine.test.ts`, `tests/engine/progression.test.ts` (extend: level cap)

**Interfaces:**
- `spineOf(state, reg): Beat[]` (the start's `spine`, `[]` without a start); `currentBeat(state, reg): Beat | null` (null in the open-ended phase); `beatReady(state, reg, beat): boolean` (all `conditions` hold: `minDay`, `flagsAll`, `flagsNone` against world + commander flags, `clearanceMin`, `threads`); `isOpenEnded(state, reg): boolean`.
- `checkProposal(state, reg, beatId: string, cooldownDays: number): string | null` — the id is the current beat's; not already proposed; `beatReady`; `day − (spine.lastProposalDay ?? −∞) >= cooldownDays`.
- `proposeBeat(draft, ctx, beatId, framing: string): EngineEvent[]` — framing cut to 60 words (empty → the beat's `goal`); sets `world.spine.proposed/proposedDay/lastProposalDay`; opens thread `spine:<beatId>` (title = beat title; exempt from `threadsOpenMax`); adds a world fact (importance 4, tags `['spine']`, public) and a chronicle line with the framing; for `mission` completion offers the story mission (`spineBeat: beatId`, `threadId`) unless one is already offered or active; emits `beat_proposed`; then `flag` and `auto` completions are checked at once.
- `completeBeat(draft, ctx, beatId): EngineEvent[]` — only for the proposed current beat: runs `onComplete` (`src.kind: 'beat'`), resolves the thread, `world.spineProgress += 1`, clears `spine.proposed`, emits `beat_completed`.
- Hooks: `onMissionCompleted(draft, ctx, mission)` completes the beat named by `mission.spineBeat`; `checkBeatFlags(draft, ctx)` completes a proposed `flag`-kind beat once one of `anyOf` is set.

- [ ] **Step 1: Write the failing tests** — `a beat is not ready before its minDay, flags and clearance`; `proposing a beat that is not the current one, or not ready, is refused`; `a second proposal within 3 days is refused and allowed on day 4`; `proposing opens the spine thread, stores the framing as a fact and offers the story mission`; `completing the story mission completes the beat, runs onComplete and advances spineProgress`; `a flag-kind beat completes when the flag is set by an event option`; `an auto beat completes on proposal`; `after the last beat currentBeat is null and isOpenEnded is true`; `beats cannot be skipped: completing beat_3 while beat_2 is current throws`; `clearance 1 from beat_1 raises levelCap from 10 to 20 and stored XP levels the unit at the next applyLevelUps`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/world/spine.test.ts tests/engine/progression.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): spine beats with conditions, completions and clearance`.

---

### Task 8: Node map generation and fog

**Files:**
- Create: `src/engine/world/nodeMap.ts`
- Test: `tests/engine/world/nodeMap.test.ts`

**Interfaces:**
- `generateNodeMap(reg: Registries, rng: Rng, input: { regionId: string; danger: number }): NodeMap` — layers = `rng.int(region.layers[0], region.layers[1])`; each layer 2 or 3 nodes with ids `n<layer>_<i>`; types drawn by `region.nodeWeights` among node types allowed there (`firstLayer`, `maxPerMap`, `minDanger`; kinds `objective` never drawn); every layer holds at least one node of kind `combat` (re-draw the first node if not); edges: each node links to 1–2 nodes of the next layer chosen by index proximity (`i` and `i ± 1`), then every next-layer node without an incoming edge gets one from its nearest neighbour; every last-layer node links to the single objective node `obj` (type `objective`, `layer = layers.length`). Throws `No playable node type for region "<id>"` when the weights leave nothing.
- `nextNodes(map: NodeMap, at: string | null): string[]` (the first layer when `at` is null; else `nodes[at].edges`).
- `visibleTypes(map: NodeMap, at: string | null, reveal: number): Set<string>` — visited nodes plus every node within `reveal` edges ahead of `at` (from the entrance: the first `reveal` layers).
- `mapRows(map: NodeMap, opts: { at: string | null; visible: Set<string>; reg: Registries }): Array<Array<{ nodeId: string; text: string; state: 'visited'|'current'|'option'|'ahead'; }>>` — one row per layer, `text` = `[<glyph>]` for a visible type and `[ ]` otherwise (pure model; the DOM view is Task 19).
- `nodePlayType(map, nodeId, mission: Mission): string` — the mission's `objective.node` for `obj`, `resolvedType ?? type` otherwise.

- [ ] **Step 1: Write the failing tests** — `same seed and input give the same map`; over 300 seeds per core region: `3 to 5 layers of 2 to 3 nodes`, `every node of a layer has 1 or 2 edges into the next layer and every node has an incoming edge`, `every path from the entrance reaches the objective`, `no elite, rest or crisis in the first layer`, `at most one crisis and none below danger 3`, `every layer has a combat-kind node`; `nextNodes from the entrance is the first layer`; `with reveal 1 only the options show their type, with reveal 2 one layer more`; `visited nodes stay visible`; `mapRows marks current, options and hidden nodes`; `a region whose weights name only removed node types throws a readable error`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/world/nodeMap.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): seeded node maps with fog`.

---

### Task 9: Expedition start, movement, cache, rest and field actions

**Files:**
- Create: `src/engine/world/expedition.ts`, `src/engine/actions/expedition.ts`
- Test: `tests/engine/world/expedition.test.ts`

**Interfaces:**
- Consumes: Tasks 3–8; `slotsLeftToday` (`engine/calendar`), `isLiving`, `unitStats`, `rollLoot`.
- `interface StartExpedition { missionId?: string; poi?: { regionId: string; poiId: string }; unitIds: string[]; formation: { front: string[]; back: string[] }; supplies: number }`
- `checkExpedition(state, reg, p: StartExpedition): string | null` — in this order: an expedition, combat or scene is open, or a talk holds the slot; exactly one of `missionId` (offered) / `poi` (known region, existing POI, cooldown over, template still valid); region and template still exist; `slot === 'night'` or `slotsLeftToday(slot) < region.travelSlots` (`"<Region> takes 3 slots: leave in the Morning."`); 1–4 unique units, each living, `status: 'active'`, not broken down; formation = the same ids, ≤ `TUNING.combat.maxPerRow` per row, front not empty; `supplies` an integer 0…`min(resources.supplies, suppliesMax)`.
- `startExpedition(draft, ctx, p): EngineEvent[]` — creates the POI mission if needed (source `side`, `poiId`, tier and danger from the template, stamps `world.regions[r].poi[poiId] = day`); moves the mission to `active`; takes `supplies` out of `resources`; `generateNodeMap`; `reveal = 1 + (party defect with expedition.reveal ? 1 : 0) + (mission.scouted ? 1 : 0)`; log line `start`; emits `expedition_started`.
- `ableParty(state): string[]` — party units still living, `status: 'active'`.
- `moveTo(draft, ctx, nodeId): EngineEvent[]` — phase `travel`, `nodeId` in `nextNodes`; marks visited, resolves `unknown` by `resolvesTo` weights, logs `move`; then by `kind` of `nodePlayType`: `cache` → `rollLoot('loot_cache')` into `expedition.loot`; `rest` → needs `suppliesPerUnit × ableParty` carried supplies: enough → spend them, heal `hpPct` of max HP and relieve `stress` for the able party; too few → nothing happens and the log says `No supplies to rest.`; `combat` and `event` → Task 10 (until then they throw `not implemented`); the objective node with a `reach` condition sets `objectiveDone` after its node resolves. A node whose type no longer exists is logged as `Nothing here.` and treated as resolved. Emits `expedition_moved` and `expedition_node { nodeId, type, kind }`.
- `setFormation(draft, formation)` — the same validation as at start, over `ableParty`; phase `travel` or a pending combat not yet started.
- `treat(draft, ctx, unitId, kind: 'patch'|'calm')` — phase `travel`, unit in `ableParty`, 1 carried supply; `patch` +20 % max HP (cap max), `calm` −10 stress (floor 0; refused for a unit in breakdown); emits `expedition_treated`.
- Actions: `expedition/start` (payload `StartExpedition`), `expedition/move { nodeId }`, `expedition/set_formation { formation }`, `expedition/treat { unitId, kind }`.

- [ ] **Step 1: Write the failing tests** — `start moves the mission to active, takes the supplies and builds a map`; `start is refused in the Evening for a 2-slot region and in the Afternoon for a 3-slot region, with the region named`; `start is refused at night, with an open scene, an open talk, an open combat or a second expedition`; `start is refused for an injured, dead, reserve, duplicate or fifth unit`; `more supplies than owned or than 12 are refused`; `a refused start leaves the state deep-equal`; `a POI start creates a side mission that never appears on the board and stamps the cooldown`; `a POI on cooldown is refused until day + 2`; `echo_bleed and a scouted mission each add 1 to reveal`; `move only accepts a connected node`; `cache adds loot to the expedition, not to the inventory`; `rest spends 1 supply per able unit and heals`; `rest without supplies changes nothing and logs it`; `unknown resolves to a real type with the seed`; `a node type removed from the pack resolves as nothing and the run continues`; `treat spends one supply and never exceeds max HP`; `reaching a reach-objective sets objectiveDone`; `activities are refused during the run` (guard, via `activity/do`).
- [ ] **Step 2: Run** `npx vitest run tests/engine/world/expedition.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): expedition start, node movement, caches, rest and field treatment`.

---

### Task 10: Expedition combat and event nodes

**Files:**
- Modify: `src/engine/world/expedition.ts`, `src/engine/actions/expedition.ts`
- Test: `tests/engine/world/expeditionNodes.test.ts`

**Interfaces:**
- Consumes: `generateEncounter`, `squadPower`, `defaultFormation`, `checkStart` (`engine/combat`), `meetsSocialRequirements` (`engine/social`), `applyWorldEffects`.
- Combat node (`moveTo`): `encounter = generateEncounter(draft, reg, rng, { table: region.enemyTable, danger: clamp(mission.danger + combat.dangerDelta, 1, 5), squadPower: squadPower(draft, reg, ableParty), exposesCommander: combat.exposesCommander, lootTableId: combat.lootTableId })`; `pending = { kind: 'combat', nodeId, encounter, prevCombatId: draft.lastCombat?.id }`; phase `combat`; emits `expedition_combat { nodeId, encounter }`. The fight itself is started by the app with P4's `combat/start { encounter: pending.encounter, formation, coverId?, expedition: true, bankLoot: false }`.
- `resolveCombat(draft, ctx): EngineEvent[]` (action `expedition/resolve_combat`) — needs phase `combat`, no open `state.combat`, and `lastCombat.id !== pending.prevCombatId` (otherwise throws `The fight has not been fought yet.`); appends `lastCombat.relationHints` as `QueuedIntent`s (evidence from the node, e.g. `Took the hits meant for the commander at node 3.`), logs `combat` with `{ outcome, rounds, enemies: names, injuries, deaths, breakdowns }`; **won** → `lastCombat.loot` joins `expedition.loot`, the formation drops units no longer able, an objective node with `win` sets `objectiveDone`, phase `travel`; if `ableParty` is empty → `endExpedition(…, 'retreated')` (Task 11; until then a stub that throws); **lost** or **retreated** → `endExpedition(…, 'failed')` for lost, `'retreated'` for retreated.
- Event node (`moveTo`): template = `mission template.objectiveEventId` on the objective node, else `rng.pick` among `dilemmaTemplates` with `scale: 'minor'`, context `expedition_event`, and `regions` absent or containing the region (none → the node resolves as `Nothing here.`); `pending = { kind: 'event', nodeId, templateId }`; phase `event`; emits `expedition_event { nodeId, templateId }`.
- `eventOptions(state, reg): Array<{ index: number; label: string; disabled: string | null }>` — `requires` unmet → `"Needs Empathy 3"`; a `carried_supplies`/`resource` cost the party cannot pay → `"Not enough supplies"` / `"Not enough credits"`.
- `chooseOption(draft, ctx, index): EngineEvent[]` (action `expedition/choose { option }`) — phase `event`, option enabled; applies its effects (`src.kind: 'event'`), logs `event` with `{ templateId, option: label }`, phase `travel`, a `reach` objective is done; emits `expedition_choice`.

- [ ] **Step 1: Write the failing tests** — `a combat node stores the encounter and waits`; `elite raises the danger by one, capped at 5`; `a crisis encounter exposes the commander`; `resolve before the fight is refused`; `a won fight moves its loot into the expedition and its hints into the queue`; `a combat result is consumed once: a second resolve is refused`; `expedition round-trips through JSON mid-node and resolves identically`; `a lost fight ends the run as failed and a retreated fight as retreated` (with the Task 11 stub replaced by a spy until Task 11); `a win with nobody standing forces a retreat`; `an injured unit leaves the formation`; `an event node offers the template's options and disables one that needs Empathy 3`; `choosing applies the effects, queues unit_event intents and returns to travel`; `an option the party cannot pay for is refused and nothing changes`; `the pinned objective event of beat 4 sets exactly one of its three flags`; `a region with no matching event resolves the node as nothing`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/world/expeditionNodes.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): expedition combat hand-off and fixed-option events`.

---

### Task 11: Return, retreat, banking, report and expedition intents

**Files:**
- Modify: `src/engine/world/expedition.ts`, `src/engine/actions/expedition.ts`
- Test: `tests/engine/world/expeditionEnd.test.ts`

**Interfaces:**
- Consumes: `bankLoot`, `releaseBreakdowns` (`engine/progression`), `applyIntents` (`engine/relations`), `enqueueNight`, `addChronicle`, `nextId`, `consumeSlots` (`engine/calendar`), `completeMission`/`releaseMission` (Task 5), `openRequest` (Task 12; a no-op hook until then).
- `endExpedition(draft, ctx, outcome: 'success'|'retreated'|'failed'): EngineEvent[]`, in this order:
  1. carried supplies go back to `resources.supplies`;
  2. `success` → `bankLoot(draft, exp.loot)` and `completeMission`; otherwise the loot is dropped and `releaseMission`;
  3. `releaseBreakdowns(draft, party)`; for every released **named** unit `enqueueNight({ kind: 'after_breakdown', priority: 60, framing: '<Name> is at your door. She has not slept since the breakdown.', ignore: { event: 'dismissed', severity: 'moderate' }, expiresDay: day + 2 })`;
  4. intents: dedupe `exp.hints` per (type, actor, sorted targets) keeping the highest severity, then `applyIntents(draft, ctx, { channel: 'scene', participants: exp.party, intents: { events: batch } })` for each batch of `TUNING.relations.maxEventsPerExchange`, each event with `confidence: 1`;
  5. `lastExpedition = ExpeditionReport` (`acknowledged: false`, `debriefed: false`; injuries/deaths/breakdowns collected from the log), one chronicle line (`kind: 'scene'`, e.g. `Expedition to District 7 Quarantine: objective secured. Bea was carried back.`), `world.regions[r].lastVisitedDay`, `world.lastExpeditionRegionId`;
  6. `delete draft.expedition`, then `consumeSlots(draft, exp.slots, ctx)` (the day may end here);
  7. `openRequest(draft, 'expedition')` if none is open; emits `expedition_ended { outcome, reportId }`.
- Actions: `expedition/return {}` — phase `travel` and `objectiveDone` → `success`; `expedition/retreat {}` — phase `travel` or `event`, or phase `combat` with no open `state.combat` → `retreated`; `expedition/ack_report {}` → `lastExpedition.acknowledged = true`; `expedition/set_recap { reportId, text }` — id must equal `lastExpedition.id`; text stripped to plain text, cut to `recapMax`; empty → refused; `expedition/mark_debriefed {}`.
- `reportLines(report: ExpeditionReport, state: CampaignState, reg: Registries): string[]` — deterministic AFTER-ACTION REPORT: header (mission, region, outcome), one line per log entry, loot and rewards, injuries/deaths/breakdowns by name.

- [ ] **Step 1: Write the failing tests** — `success banks cache and combat loot, returns unused supplies and pays the mission rewards once`; `retreat drops the unbanked loot, keeps XP and injuries, and puts the mission back on the board`; `a retreated POI run leaves no mission behind`; `return before the objective is refused`; `return spends the region's 2 slots, or 3`; `returning through the Evening runs the day end exactly once and the completed mission is not failed by the deadline step`; `breakdowns are released and a named unit gets a night entry`; `protected and endangered hints change trust through applyIntents and are deduplicated by highest severity`; `fourteen hints are applied in three batches`; `event unit_event intents with value axes move units with opposite values in opposite directions`; `the report lists the path, fights, loot, injuries and deaths` (`reportLines`); `set_recap with a stale report id is refused`; `set_recap strips markup and cuts at 1200 characters`; `a forced retreat with an empty party runs the same ending`; `after the end other actions run again` (guard lifted).
- [ ] **Step 2: Run** `npx vitest run tests/engine/world` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npx vitest run` whole suite green.
- [ ] **Step 5: Commit** `feat(engine): expedition return, retreat, after-action report and relationship intents`.

---

### Task 12: Director engine — digest, validation, application, fallback

**Files:**
- Create: `src/engine/world/director.ts`, `src/engine/world/index.ts`
- Modify: `src/engine/actions/world.ts`, `src/engine/world/expedition.ts` (real `openRequest`)
- Test: `tests/engine/world/director.test.ts`, `tests/engine/world/digest.test.ts`

**Interfaces:**
- `interface Digest { day: number; phase: 'spine'|'open'; beat?: { id: string; title: string; goal: string; ready: boolean; proposed: boolean }; threads: Array<{ id; title; status; flags: string[] }>; clocks: Array<{ id; label; filled; segments; regionId? }>; factions: Record<string, number>; flags: string[] /* last 8 world flags */; squad: Array<{ name: string; state: string }> /* living named units, relationship state names only */; board: Array<{ id; source; title; regionId; danger; daysLeft? }>; boardRoom: number; rumorRoom: number; regions: Array<{ id; name; danger }> /* known */; templates: Array<{ id; sources; regions?; objectives: string[]; tiers: string[] }>; lastExpedition?: { regionId; outcome; missionTitle } }`
- `buildDigest(state, reg): Digest` — no relationship or stat numbers, no unit ids; open and dormant threads only; all clocks (the director sees hidden ones).
- `interface DirectorOutput { missionOffers: Array<{ templateId; regionId; danger; title; brief; objectiveNode; deadlineDays; rewardsTier; threadId?; spineBeat? }>; rumors: Array<{ text; leadsTo?: 'mission'|'fact'|'none'; tags: string[]; lead?: { templateId; regionId } }>; threadUpdates: Array<{ threadId: string /* or 'new' */; title?; status?; addFlags?: Array<string | { slug: string; description: string }> }>; clockAdvances: Array<{ clockId; by: 1|2; reason }>; storyBeatProposal?: { beatId; framing } }`
- `validateDirectorOutput(state, reg, raw: unknown, opts: { cooldownDays: number; only?: 'rumors' }): { output: DirectorOutput; rejected: Array<{ part: string; reason: string }> }` — never throws; non-object → empty output. Rules: `missionOffers` first 2, each through `checkOffer` (source = `story` when `spineBeat` is set, else the first of `command, side` the template allows), `danger` an integer 1…5, `deadlineDays` clamped 5…14, `spineBeat` only if it is the proposed current beat, texts plain and cut; `rumors` first 3 and at most `rumorRoom`, ≤ 40 words, tags through `normalizeTag`, a `mission` lead needs a valid `lead`; `threadUpdates`: an existing id, or `'new'` with a title (≤ 60 chars) while fewer than `threadsOpenMax` threads are open, at most one new thread per tick, `status` in `THREAD_STATUSES`, `spine:*` threads cannot be changed, `addFlags` slugified to `thread:<id>:<slug>` (first 3 per update, up to `threadFlagsMax` per thread); `clockAdvances`: clock exists and is not full, `by` exactly 1 or 2, ≤ `maxClockPerClock` per clock and ≤ `maxClockTotal` in all (later ones rejected), `reason` cut to 120 chars; `storyBeatProposal` through `checkProposal`. Any numeric field that is not listed here (credits, plyx, amounts) is ignored.
- `applyDirectorOutput(draft, ctx, out: DirectorOutput): EngineEvent[]` — thread updates (new ids `t<n>` from `nextId`), beat proposal, mission offers (`offerMission`; a beat proposed in the same tick makes its `spineBeat` offer legal), rumors (`postRumor`), clock advances (`advanceClock`); emits `director_applied { offers, rumors, threads, clocks, beat }`.
- `fallbackOutput(state, reg, rng): DirectorOutput` — per **Where the code differs**; built only from registry ids and authored texts.
- `openRequest(draft, reason): EngineEvent[]` — no-op while one is open; else `pending = { id: 'd' + (++seq), reason, day }` and `director_requested { id, reason }`.
- Day-end step `director_tick`: if a request is still open → answer it with `fallbackOutput` (validated, applied, `director_applied { fallback: true }`); then `openRequest(draft, 'day_end')`.
- Actions: `director/apply { requestId, output, beatCooldownDays? }` — `requestId` must equal `pending.id` (else throws `Stale director answer.`); validates (`only: 'rumors'` for reason `scout`; cooldown = payload clamped 1…14, default `TUNING.director.beatCooldownDays`), applies, clears `pending`, sets `lastTickDay`; emits `director_rejected { rejected }` when anything was dropped. `director/fallback { requestId }` — the same with `fallbackOutput`. `director/request { reason: 'scout' }` — `openRequest`.
- `engine/world/index.ts` exports for P6: `applyWorldEffects`, `advanceClock`, `factionStanding`, `offerMission`, `missionById`, `currentBeat`, `isOpenEnded`, `buildDigest`, `ableParty`, the Task 3 types.

- [ ] **Step 1: Write the failing tests** — digest: `lists day, current beat with readiness, open threads, clocks, factions, last 8 flags, state names and the board`; `contains no trust, affinity, attraction or stress numbers and no unit ids`; `stays under 4000 characters for a campaign with a full board, 6 threads and 5 clocks`; `open-ended phase has no beat`. Validation: `a third mission offer and a fourth rumor are dropped`; `unknown template, region, tier, thread and clock ids are rejected with a reason and nothing else is lost`; `credits or reward amounts in an offer are ignored and the tier decides`; `by: 5 and by: 0 are rejected`; `three advances of 2 keep the total at 3`; `a beat that is not current, not ready or inside the cooldown is rejected`; `a story offer for a beat that was not proposed is rejected`; `a 'new' thread needs a title and respects the limit of 6`; `dynamic flags are namespaced and capped`; `a spine thread cannot be closed by the director`; `markup in titles is kept as text and cut to 60 characters`; `garbage input (null, a string, arrays of numbers) gives an empty output`. Application: `apply needs the open request id`; `a second apply for the same request is refused and changes nothing`; `a rejected-everything answer still closes the request`; `scout requests apply only rumors`; `invalid output never mutates state` (deep-equal apart from the closed request). Fallback: `offers a command mission every third day and never a duplicate`; `proposes the current beat once its conditions hold`; `keeps offering missions and advancing clocks after the last beat`; `an unanswered request is answered by the fallback at the next day end`; `thirty days of fallback-only play reach the open-ended phase when every story mission is completed on offer` (loop: `consume_slot`, complete story missions through `completeMission`).
- [ ] **Step 2: Run** `npx vitest run tests/engine/world/director.test.ts tests/engine/world/digest.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npx vitest run` whole suite green (P2 day tests now see `director_requested`).
- [ ] **Step 5: Commit** `feat(engine): director digest, validation, application and seeded fallback`.

---

### Task 13: LLM call types — `director_tick` and `expedition_recap`

**Files:**
- Create: `src/llm/calls/directorTick.ts`, `src/llm/calls/expeditionRecap.ts`, `tests/fixtures/director_tick/{valid,truncated,invalid,hostile_ids,hostile_amounts,hostile_flood,prose_wrapped}.txt`
- Test: `tests/llm/directorTick.test.ts`, `tests/llm/expeditionRecap.test.ts`

**Interfaces:**
- `directorTick.ts`: registers call type `director_tick` (mechanic, JSON). `system`: role (story director of a squad-command RPG), the hard rules (ids only from the digest, never amounts, never skip or invent beats, propose the beat only when `ready`, ≤ 2 offers, ≤ 3 rumors of ≤ 40 words, framing ≤ 60 words, English) and the output shape of spec §5. `prompt`: `JSON.stringify(digest)` plus `reason`. Schema `DirectorShapeSchema`: an object whose five keys are optional and typed loosely (`z.array(z.unknown())` / `z.unknown()`) so one bad entry never fails the whole answer — the engine validates the entries. `runDirectorTick(input: { digest: Digest; reason: DirectorRequest['reason'] }, deps: { st; settings }): Promise<unknown | null>` (null on any failure).
- `expeditionRecap.ts`: registers `expedition_recap` (main, text). `interface RecapInput { commanderName: string; missionTitle: string; regionName: string; environment: string; outcome: string; lines: string[] /* reportLines */; units: Array<{ name: string; role: string }> }`. `system`: an after-action report in 2–4 short paragraphs, past tense, grounded only in the listed lines, no new casualties, loot or outcomes, no numbers about relationships, no markdown. `generateRecap(input, deps): Promise<string | null>` — plain text (markdown and speaker labels stripped), cut to `TUNING.expedition.recapMax`; empty → null.

- [ ] **Step 1: Write the failing tests** (fake adapter, recorded fixtures) — `valid fixture returns the five parts`; `prose-wrapped JSON is recovered`; `truncated fixture keeps the complete parts or retries once with a 1.5× budget, then returns null`; `invalid fixture returns null and the log has two attempts`; `hostile_ids, hostile_amounts and hostile_flood pass the shape and are cut down by validateDirectorOutput to nothing illegal` (feed the result into the engine validator with a core campaign: no unknown id survives, no amount is read, counts are capped); `no mechanic profile and no fallback-to-main returns null without a call`; `the prompt contains the digest and never a unit id`; recap: `returns cleaned text`, `strips markdown and a leading speaker label`, `cuts at 1200 characters`, `an empty answer is null`, `the prompt lists every report line`.
- [ ] **Step 2: Run** `npx vitest run tests/llm/directorTick.test.ts tests/llm/expeditionRecap.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(llm): director_tick and expedition_recap call types`.

---

### Task 14: World controllers and settings

**Files:**
- Create: `src/world/directorController.ts`, `src/world/expeditionController.ts`
- Modify: `src/settings.ts`, `src/ui/shell/sysTab.ts`, `tests/architecture.test.ts`
- Test: `tests/world/directorController.test.ts`, `tests/world/expeditionController.test.ts`, `tests/settings.test.ts`, `tests/ui/shell.test.ts` (SYS fields)

**Interfaces:**
- Settings: `directorEnabled: boolean` (default `true`), `beatCooldownDays: number` (int 1…14, default 3), `expeditionRecap: boolean` (default `true`). SYS: two toggles and one number field.
- `WorldDeps { st: StAdapter; app: { dispatch(a: Action, o?: { expectChatId?: string }): EngineEvent[]; current(): { state: CampaignState | null } }; registries: () => Registries; settings: () => AliusSettings; toast(kind, text): void }`.
- `createDirector(deps: WorldDeps): { onRequested(): Promise<void>; busy(): boolean }` — reads `world.director.pending`; one run at a time per request id; `directorEnabled` off → `director/fallback`; else `runDirectorTick({ digest: buildDigest(…), reason })` → `director/apply { requestId, output, beatCooldownDays }` or, on null, `director/fallback { requestId }`; every dispatch carries `expectChatId` of the chat the run started in; in debug mode a toast lists `director_rejected` reasons.
- `createExpedition(deps: WorldDeps & { startCombat(p: StartPayload): boolean; startScene(o: StartOptions): Promise<boolean> }): ExpeditionController` with `plan(target: { missionId: string } | { poi: { regionId: string; poiId: string } }): void`, `planning(): typeof target | null`, `cancelPlan(): void`, `launch(p: { unitIds; formation; supplies }): boolean`, `move(nodeId)`, `choose(index)`, `treat(unitId, kind)`, `setFormation(f)`, `fight(opts: { coverId?: string; auto?: boolean }): boolean` (P4 `startCombat` with the pending encounter, `expedition: true`, `bankLoot: false`; `auto` adds `combat/auto { on: true }` only when `canAutoResolve`), `afterCombat(): void` (dispatches `expedition/resolve_combat` when phase `combat`, no open combat and a new `lastCombat`), `retreat()`, `return()`, `requestRecap(): Promise<void>` (setting on, report without recap → `generateRecap` → `expedition/set_recap` with `expectChatId`), `acknowledge(): void`, `debrief(unitIds: string[]): Promise<boolean>` (`startScene({ locationId: 'garage', participants, origin: 'debrief', consumesSlot: false })` then `expedition/mark_debriefed`; refused at night or with an open scene).
- Architecture test: the engine has its own `src/engine/world/`, so the existing path regex cannot simply gain `world` — resolve every relative import of an engine file and assert none lands in `src/world/`; `src/world/**` imports nothing from `src/ui/` and uses `src/st/` only through `import type`.

- [ ] **Step 1: Write the failing tests** — director: `a request leads to one LLM call and one director/apply`; `a failed call falls back`; `directorEnabled off never calls the model`; `two onRequested calls for one request make one call`; `a chat switch during the call drops the answer and the request stays open for the next load`; `the beat cooldown setting reaches the action`. Expedition: `launch dispatches expedition/start and reports a refusal as a toast`; `fight starts the pending encounter with expedition true and bankLoot false`; `afterCombat resolves the node exactly once`; `auto is only passed when the fight can be auto-resolved`; `requestRecap stores the text and does nothing when the setting is off, the call fails or the chat changed`; `debrief opens a free debrief scene in the garage and marks the report`. Settings: `defaults and round-trip for the three settings`; `SYS shows them`. Architecture: the two new rules.
- [ ] **Step 2: Run** `npx vitest run tests/world tests/settings.test.ts tests/ui/shell.test.ts tests/architecture.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(world): director and expedition controllers, P5 settings`.

---

### Task 15: Incoming named units

**Files:**
- Modify: `src/engine/setup.ts` (extract `makeNamedUnit(u: UnitSetup, reg: Registries, usedIds: Set<string>): Unit` from `buildCampaign`; no behaviour change), `src/engine/actions/squad.ts`
- Test: `tests/engine/squad.test.ts` (extend), `tests/engine/setup.test.ts` (unchanged results)

**Interfaces:**
- Consumes: `validateUnitProfile`, `initialRelation`, `startingTrustAdjust`, `crimeEffectsOf`, `crimeKnownByDefault` (`engine/setup`), `generateGrunt`, `gruntRelation`, `livingUnits`.
- `checkIncoming(state): string | null` — `(world.incomingUnits ?? 0) < 1` → `No unit is waiting for intake.`; `livingUnits(state).length >= roster.capacity` → `No free bed: upgrade the barracks or let someone go.`
- `squad/add_named { unit: UnitSetup }` — `checkIncoming`; `validateUnitProfile` plus the baseline ranges of `validateSetup` (errors joined into the thrown message); `cardRef` not already in the squad; unit id by the `unit_<slug>` rule against existing ids; `status: 'active'`, joins `roster.activeIds` when fewer than `TUNING.rosterActiveMax` are active, else `'reserve'`; relation = `initialRelation` with the crime trust adjustment and `since: day`; `world.incomingUnits -= 1`; emits `unit_joined { unitId, kind: 'named' }`.
- `squad/decline_incoming {}` — `checkIncoming`; a `generateGrunt` joins with `gruntRelation`; counter −1; emits `unit_joined { unitId, kind: 'grunt' }`.

- [ ] **Step 1: Write the failing tests** — `buildCampaign output is unchanged by the extraction` (existing setup tests stay green); `add_named needs a pending intake and a free bed`; `an invalid profile is refused with every problem listed`; `a card already in the squad is refused`; `the new unit starts as stranger with the crime adjustment and since = today`; `she goes to reserve when four are active`; `decline adds a grunt and lowers the counter`; `two offers allow two intakes`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/squad.test.ts tests/engine/setup.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): intake of incoming named units and grunt replacements`.

---

### Task 16: World context provider

**Files:**
- Create: `src/world/context.ts`
- Test: `tests/world/context.test.ts`

**Interfaces:**
- `registerWorldContext(builder: ContextBuilder, deps: { registries: () => Registries }): void` — provider `{ id: 'world', priority: 50 }` (below P3's `promises` 60, so it is trimmed first). Renders nothing without an open scene. Otherwise at most three sentences, in this order, each only when it applies: the region of the last expedition if within 3 days (`World: the unit came back from <Region> <n> day(s) ago (<outcome>).`); one open thread whose `relatedUnits` includes a present unit, else the proposed spine beat's thread (`Ongoing: <title>.`); visible clocks filled above 50 %, at most two (`Pressure: <label> is at 5/8.`). Hidden clocks and dynamic flags never appear.

- [ ] **Step 1: Write the failing tests** — `renders nothing outside a scene`; `mentions the last expedition for three days and then drops it`; `prefers a thread that involves a present unit`; `lists at most two visible clocks above half and never a hidden one`; `never more than three sentences`; `is trimmed before the promises provider under a tight cap`.
- [ ] **Step 2: Run** `npx vitest run tests/world/context.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(world): world line in the scene context`.

---

### Task 17: MAP tab

**Files:**
- Create: `src/ui/map/mapTab.ts`, `css/80-world.css`
- Test: `tests/ui/map.test.ts` (`// @vitest-environment jsdom`)

**Interfaces:**
- `renderMapTab(host, ctx: { getState; getLoad; registries; mapImageUrl: string | null; onPlan(target: { missionId: string } | { poi: { regionId: string; poiId: string } }): void })`.
- Map: with `mapImageUrl` an `<img>` plus an SVG overlay (`viewBox 0 0 100 100`, one `<polygon>` per region from `mapHotspot`, focusable, `aria-label` = region name); on the image's `error` event, or without a URL, the ASCII grid: a 3×3 box-drawing grid with each region's name at its `mapCell` as a button. Regions not in `knownRegions` render as `[ NO SIGNAL ]` and cannot be selected.
- Region panel (selected region; default = the start region): name, summary, `ENVIRONMENT` (`environmentPrompt`), `DANGER ▮▮▯▯▯`, `TRAVEL 2 SLOTS`, `KNOWN HOSTILES` (category names of `enemyTable`), `CLOCKS` (visible clocks of the region plus region-less visible clocks, each `label ████░░░░ 4/8` using P4's `bar`), `MISSIONS` (offered missions of the region: source tag, title, danger, `D-3` days left; a button → `onPlan({ missionId })`), `POINTS OF INTEREST` (name, summary, button → `onPlan({ poi })`, disabled with the reason from `checkExpedition`'s POI rule while on cooldown).

- [ ] **Step 1: Write the failing tests** — `without an image the ASCII grid shows every known region as a button`; `an unknown region shows NO SIGNAL and is not selectable`; `with an image URL polygons are rendered and an image error falls back to ASCII`; `selecting a region shows environment, danger, hostiles, clocks and missions`; `hidden clocks are not shown`; `a mission button calls onPlan with its id`; `a POI on cooldown is disabled with the reason`; `region names and briefs are rendered as text, not HTML`; `no campaign shows the offline stub text`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/map.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(ui): MAP tab with regions, clocks and mission entry points`.

---

### Task 18: OPS mission board and RUMOR MILL

**Files:**
- Create: `src/ui/ops/missionBoard.ts`
- Modify: `src/ui/ops/opsTab.ts` (render the board above the activities; new optional ctx callbacks), `css/80-world.css`
- Test: `tests/ui/ops.test.ts` (extend)

**Interfaces:**
- `OpsTabCtx` + `onPlan?(missionId: string): void`, `onDismiss?(missionId: string): void`, `onFollowRumor?(rumorId: string): void`, `onIntake?(): void`.
- `renderMissionBoard(host, ctx)` — `MISSION BOARD n/size`: one card per offered mission (`[COMMAND]`/`[STORY]`/`[RUMOR]`/`[SIDE]`, title, region, `DANGER n`, objective (`node type name`), `D-n` or `NO DEADLINE`, brief, reward tier as `REWARD: TIER n`), `[ PLAN ]` (disabled with `checkExpedition`'s slot reason when it cannot start now), `[ DISMISS ]` only for side/rumor; `RUMOR MILL`: BBS-style posts newest first (`> anon_<3 digits from the rumor id> // DAY 004`, the text, tags), `[ FOLLOW ]` for `new` rumors with a lead (`mission` or `fact`), `FOLLOWED` otherwise; an `INTAKE PENDING` banner with `[ REVIEW ]` when `world.incomingUnits > 0`.

- [ ] **Step 1: Write the failing tests** — `board lists offered missions with source tag, deadline and tier`; `board header shows used and total size`; `PLAN is disabled in the Evening with the engine's reason`; `DISMISS is absent for command and story missions`; `rumors render newest first with a FOLLOW button only when they lead somewhere`; `FOLLOW calls onFollowRumor`; `the intake banner appears while a unit is waiting`; `rumor text is not HTML`; `existing activity cards still render` (the P2 tests stay green).
- [ ] **Step 2: Run** `npx vitest run tests/ui/ops.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(ui): OPS mission board and rumor mill`.

---

### Task 19: Expedition screen — planner, node map, events, after-action report

**Files:**
- Create: `src/ui/expedition/expeditionScreen.ts`, `planner.ts`, `nodeMapView.ts`, `report.ts`
- Modify: `css/80-world.css`
- Test: `tests/ui/expedition.test.ts` (`// @vitest-environment jsdom`)

**Interfaces:**
- `renderExpeditionScreen(host, ctx: { getState; registries; settings; controller: ExpeditionController; onClose(): void }): { refresh(): void; dispose(): void }` — picks the view: open expedition → run view; else unacknowledged `lastExpedition` → report; else `controller.planning()` → planner; else `NO EXPEDITION` + `[ BACK ]`.
- Planner (`planner.ts`): mission header (title, region, danger, objective, `DURATION 2 SLOTS (returns in the Evening)`), unit checkboxes (living units; injured/reserve/broken-down disabled with the reason), row toggle per picked unit (`FRONT`/`BACK`, default from `defaultFormation`), loadout check (per unit: equipped skills count and `STANDARD ISSUE` slots), supplies stepper 0…`min(owned, 12)` with `REST NEEDS n PER STOP`, `[ DEPART ]` disabled with `checkExpedition`'s reason, `[ CANCEL ]`.
- Node map (`nodeMapView.ts`): `renderNodeMap(host, { rows: ReturnType<typeof mapRows>, edges, onMove(nodeId) })` — layers left to right joined by `──`, e.g. `[⚔]──[?]──[≡]`; visited path highlighted (`.alius-path`), options are buttons, hidden types `[ ]`; `aria-label` per node (`Combat, reachable`).
- Run view: map, party strip (name, `HP ████░░`, `ST ███░░`, row, breakdown marker; per unit `[PATCH] [CALM]` with the supply cost; row swap buttons), `SUPPLIES n`, unbanked loot count, log (last 8 lines), `[ RETREAT ]` (confirm modal: `Unbanked loot will be lost.`) and, once `objectiveDone`, `[ RETURN TO BASE ]`. Pending combat: enemy list (`defaultEnemyName`), cover picker when the encounter exposes the commander, `[ FIGHT ]`, `[ AUTO ]` only when `canAutoResolve`, `[ RETREAT ]`. Pending event: title, setup, option buttons from `eventOptions` (disabled with the reason).
- Report (`report.ts`): `AFTER-ACTION REPORT` header, the recap paragraph when present (or `COMPILING…` while requested), `reportLines`, `[ DEBRIEF ]` (pick up to 3 named living party units; hidden at night or when already debriefed), `[ CLOSE ]` → `controller.acknowledge()` + `onClose`.

- [ ] **Step 1: Write the failing tests** — planner: `lists the mission and the duration`, `an injured unit is disabled with the reason`, `DEPART is disabled with the engine reason and enabled for a valid plan`, `the fifth checkbox cannot be ticked`, `supplies cannot exceed what is owned`; run: `renders layers joined by ── with glyphs only for visible nodes`, `only connected nodes are buttons and clicking one calls move`, `the visited path is highlighted`, `PATCH is disabled without supplies`, `RETURN appears only after the objective`, `RETREAT asks for confirmation`; combat panel: `shows the enemies, a cover picker for a crisis and AUTO only when allowed`; event panel: `shows options and disables the one that needs Empathy 3`, `event text is not HTML`; report: `shows the deterministic lines without a recap and the recap when present`, `DEBRIEF is hidden at night`, `CLOSE acknowledges`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/expedition.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(ui): expedition planner, node map, event panel and after-action report`.

---

### Task 20: App wiring

**Files:**
- Modify: `src/app.ts`, `src/index.ts` (`assetUrl: (p) => new URL('../' + p, import.meta.url).href`), `tests/helpers/world.ts` (import `engine/actions/world` and `engine/actions/expedition`)
- Test: `tests/app-world.test.ts`

**Interfaces:**
- `AppDeps` + `assetUrl?: (path: string) => string`. `AliusApp` + `expedition: ExpeditionController`, `director: ReturnType<typeof createDirector>`, `intakeUnit(): Promise<void>`.
- `app.ts`: imports `engine/actions/world`, `engine/actions/expedition`, `llm/calls/directorTick`, `llm/calls/expeditionRecap`; `registerWorldContext`; registers the `map` tab (`mapImageUrl = deps.assetUrl?.('content/core/map/world.png') ?? null`), the OPS callbacks and the `expedition` screen.
- After load (`afterLoad`): `world.seeded !== true` → dispatch `world/seed`; an open director request → `director.onRequested()`; an open expedition → show the expedition screen (an open combat still wins: combat screen first), and `expedition.afterCombat()`; an unacknowledged report → the report is offered by an OPS banner (not forced).
- `followUps`: `director_requested` → `director.onRequested()`; `rumors_requested` → dispatch `director/request { reason: 'scout' }`; `expedition_ended` → show the report, `expedition.requestRecap()`; `combat_ended` while an expedition is open → the combat screen's `[CONTINUE]` (`leaveCombat`) goes to the expedition screen and calls `expedition.afterCombat()`; `incoming_unit_offered` → toast `A new unit is waiting for intake (OPS).`; `mission_failed`, `mission_offered` (command/story), `clock_filled` (visible), `beat_completed`, `clearance_raised` → toasts via `reportEvents`.
- `intakeUnit()`: modal with the character list (`st.listCharacters()` minus cards already in the squad) and `[ DECLINE — TAKE A GRUNT ]`; a pick runs a one-unit `Wizard` + `renderCalibration` exactly as `resyncUnit` does, then `squad/add_named { unit }` and `st.addGroupMembers([avatar])`; decline → `squad/decline_incoming`.
- OPS badge: `shell.setTabBadge('ops', new story/command offers since the tab was last shown)`.

- [ ] **Step 1: Write the failing tests** (fake adapter, real shell in jsdom) — `a P4-era campaign is seeded on load`; `ending the day requests the director and applies the model's offers to the board`; `without a mechanic profile the fallback fills the board`; `scout_net posts rumors through a scout request`; `planning from MAP and departing shows the expedition screen`; `a combat node opens the combat screen and CONTINUE returns to the expedition with the node resolved`; `reload with a finished fight resolves the node`; `reload mid-expedition shows the expedition screen`; `a full run to RETURN shows the after-action report and requests a recap once`; `a late recap for another chat is dropped`; `retreat returns to the PDA with the mission back on the board`; `intake adds the picked card to the squad and the group, decline adds a grunt`; `the MAP tab is no longer a stub`; `a late director answer for another chat is dropped`.
- [ ] **Step 2: Run** `npx vitest run tests/app-world.test.ts tests/app.test.ts tests/app-day.test.ts tests/app-combat.test.ts tests/app-scene.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; whole suite green; `npm run typecheck` clean.
- [ ] **Step 5: Commit** `feat: wire world map, missions, expeditions and the director into the app`.

---

### Task 21: Build, docs, acceptance

**Files:**
- Modify: `dist/index.js`, `style.css` (via `npm run build`), `docs/packages/P5-world-expeditions-director.md` (status line + **Implemented as** with every ruling above), `docs/00-overview.md` (§5.4 P5 interfaces: `world/*`, `mission/*`, `rumor/*`, `expedition/*`, `director/*`, `squad/add_named|decline_incoming`, `engine/world/index.ts` exports, `applyWorldEffects`, `app.expedition`, `app.director`, the expedition dispatch guard; §5.2 no new call types but both now registered; §6 data model fields; §8 the three settings; §9 status → implemented), `docs/CONTENT.md` (world-effect vocabulary and every new registry with an example; `starts[].spine[]` fields; `defects[].expedition`), `docs/packages/P6-dilemmas-disloyalty-leash.md` (**Interfaces already provided by P5**: `applyWorldEffects` and the effect types P6's dilemma effects map onto, `dilemmaTemplates` schema and the `fixed` block, the pinned choice events P6 may replace, `advanceClock`, `factionStanding`, mission `failureEffects` with `leash −1`, `ableParty`, `buildDigest`, dynamic thread flags, `enqueueNight` use for breakdowns, the dispatch guard), `docs/packages/P2-calendar-base-economy.md` (note: requisition kept, POIs are the supply source), `docs/README.md` (plan list, P5 status, `MANUAL_TEST_P5.md`)
- Create: `docs/MANUAL_TEST_P5.md`
- Test: `tests/build.test.ts` (existing)

- [ ] **Step 1:** `npm run build` → `dist/index.js` and `style.css` change and stay tracked.
- [ ] **Step 2:** Walk the seven acceptance criteria against test names and record them in `docs/MANUAL_TEST_P5.md` next to the in-SillyTavern steps that cannot be automated (a real `director_tick` with a mechanic profile and its log in SYS › debug; director off; a full expedition by mouse; a crisis node with a cover unit; easy retry inside an expedition; the recap text; a debrief scene; intake of a real card; the map image fallback; reload mid-run).
- [ ] **Step 3:** `npx vitest run` and `npm run typecheck` → all green; put the counts in the final report.
- [ ] **Step 4: Commit** `chore: rebuild dist and style, P5 docs and manual checklist`.

---

## Self-review notes (for the plan author; executors may ignore)

- Spec coverage: §1 world state (T3 types/seed, T4 clocks/factions/flags, T7 spine/clearance); §2 MAP (T17, T20 image URL); §3 missions, deadlines, rumors, board size (T5, T6, T18); §4 planner, node map, fog, ASCII, events, between-node actions, retreat, return, recap, intents, debrief (T8–T11, T13, T14, T19); §5 director digest, schema, validation, spine, incoming units (T7, T12–T15); §6 context (T16). Acceptance 1 → T17/T20; 2 → T5/T6/T12; 3 → T9–T11/T20; 4 → T11/T13/T14; 5 → T12/T13/T7; 6 → T7; 7 → T8, T12, T4, T5.
- Deliberate deviations are listed once, in **Where the code differs from the spec**; the largest are the two-phase director, intents applied on return instead of inside the debrief scene, and slots spent on return.
- Task 1 leaves `tests/content/core.test.ts` red on `startingRegionId` until Task 2 adds `regions.json`; the two are meant to be executed back to back.
- `RealStAdapter` needs no new method: P5 uses only `addGroupMembers`, `listCharacters` and the existing generation calls.
