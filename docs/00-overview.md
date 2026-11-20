# Alius — Design Overview

> Working title: **Alius** (Latin: *other, different*). A SillyTavern extension that turns a group chat into a squad-command RPG: relationships first, turn-based combat second, base management as background.
>
> This file is the **always-read** document for any agent working on the project. Package specs (`packages/P0…P6`) describe what to build; this file describes what the thing *is* and the rules no package may break. Content drafts (`content/`) are owned by the author and will be rewritten — never hard-code their text.

---

## 1. Vision

The player is a **convicted commander** put in charge of a penal unit of **defective bio-cybernetic soldiers** (all women; the player may be of any gender, see `content/lore.md` §0). The commander is far weaker than any of them. The commander does not fight, but gives orders, makes decisions and lives with the consequences. That authority is real but not absolute: soldiers obey because of trust, or because of the **Leash** — a corporate override that can be requested at a steep relational cost.

The core of the experience is **one-on-one conversation** with characters the player brings in as SillyTavern character cards. Mechanics exist to give those conversations stakes, memory, and consequences; they never replace the player's free-text input.

Inspirations and what is taken from each:

| Source | Taken |
|---|---|
| Goddess of Victory: Nikke | Atmosphere, squad of distinct women under a commander, progression, outpost-style base |
| Persona 5 | Calendar with time slots, relationship development, hangout activities, social stats, turn-based combat with weakness/follow-ups |
| Darkest Dungeon | Mandatory quirks (defects), stress, expedition node maps, two-row positioning |
| Frostpunk / Tyranny / Disco Elysium / Sir Brante | Choices where every option costs something |
| Mundi / Mundi-Expanded | Card-based profile import via a mechanic model, memory and relationship facts, dynamic world, configurable mechanics, immersive device UI |

## 2. Pillars (priority order)

1. **Conversations and relationships** (~70% of play time). Private 1-on-1 scenes dominate (target ratio 70/30 private vs group).
2. **Combat and progression** — self-sufficiently interesting, short, never a chore; strongly linked to relationships in both directions.
3. **Base and economy** — background layer: slowly lifting caps on comforts and capabilities.

Explicitly **not** in v1: real-time/action combat, permadeath mode, third-party modules, inter-squad (NPC↔NPC) relationships, bosses, auto-generated backgrounds.

## 3. Non-negotiable principles

**P1 — The engine owns the truth.** All numbers (stats, axes, resources, flags, clocks) live in a deterministic game-state engine. LLMs never write numbers into state.

**P2 — LLM proposes, engine disposes.** The mechanic model returns *structured intents* (enums, severities, ids) validated against a schema. The engine translates them into deltas using rule tables from the content registry, clamps them, applies diminishing returns, and only then mutates state.

**P3 — Mechanics drive narration, not the reverse.** When the engine decides something (a refusal, a breakdown, a desertion attempt), it is injected into the main model's context as a **hard scene directive**, not as a suggestion. This counteracts positive bias / sycophancy.

**P4 — Data, not code.** Everything content-like (roles, skills, defects, items, enemies, affixes, regions, node types, activities, facilities, crimes, corporations, relationship states, event→delta tables, dilemma templates) lives in registries loaded from JSON content packs. v1 ships one pack (`core`), but the loader supports many from day one.

**P5 — Interactive mechanics punctuate conversation, they don't replace it.** Free text is always available in conversation. Fixed options appear only where the engine must validate the choice (dilemmas, orders, key decisions).

**P6 — Everything costs.** Defects change *how* a character is played, not *how strong* she is. Dilemma options always carry a cost. Romance with more than one character is possible but expensive.

**P7 — Respect the player's time and wallet.** Every LLM call type has a configurable token budget; combat uses zero LLM calls except one optional recap; batching is preferred to per-action calls.

**P8 — English everywhere** in UI, prompts and data.

**P9 — AI co-authorship is visible.** Commits keep `Co-Authored-By` / `Claude-Session` trailers.

**P10 — Weakness is a playstyle** (P7). A weaker commander is really weaker: the game never compensates it secretly and never dead-ends it. Every check that needs a body stat declares at least one non-body route (the validator rejects body-only checks).

**P11 — Expression has no mechanical value** (P7). Femininity/masculinity never gives buffs or debuffs; it matters only through individual characters' tastes, world options (P8) and narration.

**P12 — Everything the player sees can be analyzed** (P7a). Every player-facing stat, option, chip and choice card carries `data-analyze`; a package that adds a new value also adds its glossary entry or registry description and, for live values, an analyze provider that respects the knowledge filter. The coverage test enforces it.

## 4. Glossary

| Term | Meaning |
|---|---|
| **Campaign** | One playthrough. 1 campaign = 1 SillyTavern group chat. State lives in that chat's metadata. |
| **Commander** | The player character (user persona). Has a Crime, a Corporation, Social Stats. |
| **Unit / Soldier** | A squad member. **Named** = from an ST character card (has sprites, full relationship graph). **Grunt** = generated, ASCII portrait, Trust only, can die permanently. |
| **Profile** | The game-side data derived from a card at import: role, stats, values, defects, signature skill. |
| **Trust** | Axis 0–100. Confidence in the commander *as commander*. Governs obedience, refusals, desertion. |
| **Affinity** | Axis −100…100. Personal warmth/attachment. |
| **Attraction** | Axis 0–100. Romantic/physical interest. |
| **Stress** | 0–100 per unit. Not a relationship axis; a modifier that amplifies defect drawbacks and enables breakdowns. |
| **Relationship State** | A node in the relationship graph (e.g. `friend`, `fwb`, `obsessed`). Entered via event + conditions, not by numbers alone. |
| **Defect** | Mandatory malfunction with upside, downside, stress breakdown and an arc (Cure / Manage / Embrace). |
| **Leash** | Corporate override the commander can request: Compel / Suppress / Terminate. |
| **Slot** | Time unit: Morning, Afternoon, Evening, (conditional) Night. |
| **Scene** | A conversation with a location, slot, participants, mode (private/group). Ending a scene consumes its slot. |
| **Activity** | A slot action (train, workshop, medbay, work, scout, rest, talk). Optionally with a companion. |
| **Expedition** | A mission run on a node map: 3–5 layers of nodes (combat, event, cache, rest, objective…). |
| **Director** | Mechanic-model-driven planner that proposes missions, rumors and story beats from world state. |
| **Spine** | Authored list of milestone beats for a starting point; the director decides how and when to reach them. |
| **Thread** | A tracked story line with status and flags. |
| **Clock** | A progress counter for a world threat or faction plan (e.g. `bloom_sector7: 4/8`). |
| **Intent** | Structured output of the mechanic model describing what happened (e.g. `sided_against`, severity `major`). |
| **Directive** | Engine-generated hard constraint injected into the main model prompt. |
| **CP** | Command Points, the commander's combat resource. |
| **Plyx** | Placeholder name for the setting's programmable polymer — the crafting/upgrade material. |

## 5. Architecture

```
┌────────────────────────── SillyTavern ──────────────────────────┐
│  group chat (campaign)   character cards   connection profiles   │
└───────────▲───────────────────────▲──────────────────▲──────────┘
            │                       │                  │
      ┌─────┴─────┐          ┌──────┴──────┐    ┌──────┴──────┐
      │ st/adapter │◄────────│ llm/orchestr │───►│ llm/schemas │
      └─────┬─────┘          └──────┬──────┘    └─────────────┘
            │ state load/save       │ intents (validated)
      ┌─────▼──────────────────────▼──────┐     ┌──────────────┐
      │        engine (pure, seeded)       │◄────│ content/     │
      │ squad · relations · calendar ·    │     │ registries   │
      │ combat · economy · director rules │     │ (JSON packs) │
      └─────┬─────────────────────────────┘     └──────────────┘
            │ view models + engine events
      ┌─────▼─────────────────────────────┐
      │ ui: Alius shell (PDA, scenes,      │
      │ combat, maps)                      │
      └────────────────────────────────────┘
```

Source layout (TypeScript, same toolchain style as Mundi-Expanded):

- `src/engine/` — **pure** functions: `(state, action, rng) → { state, events }`. No DOM, no ST, no network. Fully unit-tested (an architecture test enforces the imports). Actions are registered with `registerAction` by importing their module from `src/engine/actions/` (`app.ts` imports them all; tests import what they use). A rejected action throws inside its handler, so `dispatch` returns the original state plus an `error` event: **a rejected action never changes anything**. Rule constants live in `src/engine/tuning.ts`.
- `src/content/` — pack loader, registries, schema validation of content, override rules.
- `src/llm/` — call types, prompt builders, budgets, JSON repair/retry, intent schemas (zod). Call types live in `src/llm/calls/`.
- `src/setup/` — campaign setup logic that is neither engine nor UI: the card → profile importer and sanitizer, and the pure wizard state model (no DOM; it talks to ST only through the `StAdapter` interface).
- `src/st/` — the **only** module that touches SillyTavern APIs (context, metadata, events, prompt injection, group members, connection profiles, expressions). Everything else depends on its interface, so ST API changes are fixed in one place.
- `src/analysis/` — the analysis tool's pure layer (P7a): addresses, panel model, effects text, knowledge filter, readings. Imports only `content`, `engine` and the settings type (an architecture test enforces it).
- `src/ui/` — the Alius shell and screens (`shell/` incl. the status header, `setup/` wizard, `squad/`, `ops/` and `base/` tabs, `analyze/` the analysis panel and its interaction); P10: `hub/` the home screen and room panel, `device/` skins, chrome and boot, `voice/` `VoiceCard`, `portrait/` dithered portraits, `sound/` UI sounds, `motion.ts` the one reader of reduced motion and readable mode). `src/engine/hub.ts` holds the derived whereabouts. Bundled fonts live in `fonts/`. UI renderers are plain functions `(host, ctx)`; they ask the engine (`checkActivity`, `checkUpgrade`, `checkRecruit`) why a button is disabled instead of re-implementing rules.
- `content/core/` — the core JSON pack + lorebook stub.

### 5.1 State and saves

- Campaign state is one versioned object stored under the extension key in the campaign chat's metadata. Schema version + migration functions from day one.
- RNG is a seedable PRNG whose state is part of campaign state → reproducible combat, rewindable easy mode, testable engine.
- Multiple campaigns = multiple chats. Export/import of campaign state as JSON for backup.
- Metadata must stay small: chronicle is compacted (see P3), assets are referenced by path, never embedded.
- Snapshots: the engine can snapshot state before combat (easy-mode retry) and before a scene (ST branch compatibility).

### 5.2 LLM call types

| Call type | Profile | Purpose | Default budget (output tokens) |
|---|---|---|---|
| `profile_import` | mechanic | Card → role/values/defect candidates/signature skill picks | 1500 |
| `intent_extract` | mechanic | Exchange/scene → list of intents (P9: four more types, `defied`, `commander_enforced`, `commander_yielded`, `threatened`, with a `measure` field; 35 reportable types; P12: `knowledge_leak` and `accused` are offered only while an intercepted item or a warned unit is listed; P13: `expectation_kept` / `expectation_broken` (the warden is present and her expectations are listed), `conspired` (the warden is not present and a unit can be named) and `compromise_reached` with an `overrideId` (her override is open); 38 reportable types) | 600 |
| `scene_summary` | mechanic | Scene → facts + chronicle entry; in `digest` mode (P3b) a long scene so far → a digest of at most 800 characters + facts | 800 |
| `dilemma_generate` | mechanic | Context + template → dilemma structure | 1000 |
| `director_tick` | mechanic | World digest → mission offers, rumors, thread updates, clock advances, story-beat proposal (P5; the engine validates every id and never reads amounts) | 1200 |
| `flavor` | mechanic | Names/descriptions for generated things (grunts, affixed enemies, items, a soldier's demand in her voice: kind `demand`, P9, setting `demandWording`; a Secret Frequency fragment: kind `frequency_fragment`, P12, setting `fragmentWording`); one `kind` per use | 400 |
| `dm_reply` | main | Short PDA message | 300 |
| `expedition_recap` | main | After-action report lines → narrative recap (P5; optional, setting `expeditionRecap`) | 700 |
| `emotion_pick` | mechanic | Optional sprite emotion classification (when not using native Expressions) | 50 |
| `chronicle_compact` | mechanic | Day/week chronicle lines → one compact entry (P3; without a profile the lines are joined) | 400 |
| `activity_vignette` | main | ≤2-line vignette after a companion activity (P2; can be turned off) | 150 |
| `commander_import` | mechanic | Persona text → commander descriptors, expression, seasoning, 0–2 traits with reasons (P7) | 600 |
| `memory_fold` | mechanic | Old facts of one soldier (or the world) → her two dossier paragraphs, `own` ≤ 500 and `shared` ≤ 400 characters (P3b; without a model the texts are joined and cut) | 500 |
| `rumor_retell` | mechanic | A spreading fact → one line in the voice of whoever tells it (P3b, rumor mode `model` only; a digit makes it fall back to the plain text) | 200 |
| `warden_agenda` | mechanic | The warden's card, values and the corporation → 3–5 expectations from the closed kinds, a weight each as `low` / `medium` / `high`, `personal` text ≤ 80 characters (P13; the engine validates every kind, normalizes the weights and decides which is known; only while the agenda is the fallback) | 800 |
| `warden_judge` | mechanic | A `personal` expectation of hers and an order in words → `none` / `minor` / `major` (P13; behind the setting `wardenJudge`, off by default; never in combat; a failed call dispatches without it) | 120 |
| `head_start_recap` | mechanic | The moments of a head start (per soldier: kind and description) and the commander's profile → one or two sentences per moment and a squad paragraph; JSON, validated pair by pair, template fallback (P11b; site `setup.head_start_recap`, REROLL before the first scene) | 900 |
| `development_review` | mechanic | One soldier's effective profile, anchors, the axes that have support (a band, never a number), her pending experiences and her lines → at most 3 shifts and 3 facts (P14b; site `development.review`, reroll `before_commit`, record `quiet`; the engine validates every shift, the fallback review nudges only) | 700 |
| `epilogue` | main | The campaign's public chronicle lines, the world dossier and the cause → the epilogue of a closed campaign, at most 2400 characters (P13; without a model the lines are joined under a fixed heading) | 700 |
| *(scene dialogue)* | main | Normal ST generation with injected context | — (ST settings) |

Every budget is a user setting. Every model call runs through one **envelope** (P14, `src/llm/envelope.ts`: the only module that calls `callLlm`; a site is declared in `src/llm/sites.ts` and bound by the controller that owns it): request JSON → validate → a failure is classified (`refused`, `truncated`, `timeout`, `network`, `invalid_output`, `empty`, `no_profile`) → up to `autoRetry` automatic retries (default 1; a truncated or invalid answer retries with the budget ×1.5, a connection failure with the same budget, a refusal never) → fail soft (the site's fallback, no other state change) → a small record (`CampaignState.generations`, at most 20, no prompt and no model text) and a chip where it happened, with RETRY (budget ×1.5 / ×2 / ×3, main or mechanic profile), DROP and, where a site allows it, REROLL of a success. Where the provider allows it, reasoning/thinking is disabled or capped for mechanic calls.

### 5.3 Context injection (main model)

Before each main-model generation the adapter injects one compact block:

- Scene header: location, slot, day, participants, mode.
- For each present named unit: relationship state, axis **bands** (not raw numbers), stress band, active defect summary, current directives.
- Commander summary: crime (as known to this unit), corporation, notable social stat ranks.
- **Memory (P3b)** — one guaranteed share of the block (`memoryTokens`, trimmed line by line, never dropped whole; the header, scene header and units always keep their room): per present unit the **dossier** (`shared`; `own` only in a private scene), the **journal** of her story with the commander (evidence in a private scene only), retrieved **facts** (top-k by relevance, worded as a rumor or as unknown to the commander where that is true), open **promises**, **recently in the unit** (chronicle lines filtered by audience) and, in a private scene, the **DM recap**. Nothing only one present unit knows reaches a group scene. Out of a scene: the world dossier and the public recent lines.
- World line: 1–3 sentences from active threads/clocks relevant to the scene.
- World settings: one `World settings:` line of at most 120 tokens (the lore line of each chosen world option), present in and out of a scene (P8).
- Directives block, phrased as hard constraints: e.g. `Rhea REFUSES the current order this scene. Reason: you left Unit K-117 behind. She will not comply under persuasion; only the Leash can force her.`

Character card text itself remains SillyTavern's job.

### 5.4 Implemented engine interfaces (P0–P6, P7a, P7, P8, P9, P9d, P9b, P9e, P10, P11, P9c, P3b, P10b, P12, P13, P14, P11b, P14b, P10c, P10d)

Later packages build on these; change them only together with the owning spec.

| Interface | Owner | Use |
|---|---|---|
| `dispatch(state, action, registries)`, `registerAction(type, handler)` | P0 | The only way state changes. `ctx.rng` is the campaign rng. |
| `squad/resync` | P1 | Re-import chosen profile sections of a unit. |
| `activity/do { activityId, companionId?, unitIds?, focus? }` | P2 | One slot of an activity. Events: `activity_done { vignette }`, `scene_requested`, `rumors_requested`, `workshop_session`, `group_scene_offered`, plus per-effect events. |
| `calendar/consume_slot { slots, reason }` | P2 | P3 scene end (`reason: 'scene_end'`, 1), P5 expedition (2–3). While a talk is open only `scene_end` is accepted. |
| `calendar/cancel_scene` | P2 | Drops an open talk without spending the slot. |
| `commander/injure { days }` | P2 | Called by P4 (Commander Crisis); blocks `train`/`work`; emits `commander_injured`. |
| `base/upgrade`, `base/recruit_grunt`, `base/requisition`, `roster/set_active`, `squad/set_flavor` | P2 | Base and roster. |
| `registerDayEndStep('mission_deadlines' \| 'director_tick' \| 'dm_rumors', fn)` | P2 | P3/P5/P6 hooks inside the day-end pipeline. A hook runs on a copy: if it throws, its changes are dropped and a `day_end_step_failed` event is emitted. |
| `setRelationGainHandler(fn)`, `applyRelationDelta(state, unitId, axis, amount, source)` | P2 | The only way P2 touches a relation axis. P3 installs its own accounting (the default is a simple daily soft/hard cap). |
| `meetsSocialRequirements(state, { empathy: 3 })`, `socialRank`, `addSocialPoints` | P2 | Social checks. |
| `facilityLevel`, `facilityEffect(state, reg, id, key)`, `livingUnits`, `activeRosterUnits`, `isLiving` | P2 | Facility values and unit sets. |
| `generateGrunt`, `gruntRelation`, `generatePortrait` | P2 | Seeded grunts (P5 may reuse for rewards). |
| `generateFlavor(input, deps)`, `registerFlavorKind(kind, impl)` | P2 | The `flavor` call type; each package registers its own `kind`. |
| `callLlm(callTypeId, input, deps)` | P0 | Typed, budgeted, fail-soft LLM calls. |
| `engine/relations` hooks: `getRelation`, `applyIntents`, `getSynergies(state, reg, unitIds)`, `addFact`, `loyaltyBand`, `enqueueNight` | P3 | Relationship reads/writes for P4–P6. `applyIntents` re-validates everything; `getSynergies` lists the synergy ids unlocked by the units' relationship states. |
| `scene/start { locationId, participants, origin, consumesSlot?, startIndex, nightEntryId? }`, `scene/exchange`, `scene/end { summary? }`, `scene/abort` | P3 | One scene at a time; origins `activity`, `night`, `mess`, `event`, `debrief` (P5). `scene/end` consumes the slot unless `consumesSlot: false`. |
| `intents/apply { channel: 'scene'\|'dm', intents, unitId? }`, `proposal/commander`, `proposal/answer`, `campaign/set_intimacy`, `memory/compact` | P3 | The only way relationship axes, facts, promises and the chronicle change. |
| `dm/send`, `dm/receive`, `dm/read`, `dm/roll_initiative`, `night/open`, `night/ignore`, `relations/commander_injured` | P3 | PDA comms and night knocks. |
| `StAdapter` chat methods: `getChatMessages`, `chatLength`, `sendUserMessage`, `regenerateLast`, `swipeLast`, `stopGeneration`, `editMessage`, `getLastExpression` (+ events `message_swiped/deleted/edited`, `generation_ended`, `group_wrapper_finished`) | P3 | The only way to read and write the ST chat. |
| `registerActivityHook(fn)` | P3 | Runs after an activity's effects, before its slot is spent (defect social hooks). |
| `app.startScene(opts)`, `app.scene`, `app.comms`, `app.restoreSnapshot(snap, expected)` | P3 | `startScene` opens a scene and its screen; `scene` is the controller (`send`, `propose`, `answer`, `end`, `resume`); `comms` the DM/night controller; `restoreSnapshot` a conditional state restore. |
| `cutIn(host, kind, text)`, `shell.setTabBadge(id, n)`, `shell.registerScreen(id, render, { refresh })` | P3 | UI hooks (a one-animation cut-in for major events, tab badges, in-place screen refresh). |
| `combat/start { encounter, formation, coverId?, allowRetry?, expedition?, bankLoot? }`, `combat/act`, `combat/order`, `combat/auto`, `combat/retreat`, `combat/retry`, `combat/accept`, `combat/set_enemy_name`, `campaign/set_difficulty` | P4 | Combat. A decided combat is finalized at once into `state.lastCombat` (`CombatResult`: outcome, xp, level-ups, loot, injuries, deaths, breakdowns, `relationHints`); a loss with `allowRetry` waits as `phase: 'lost_pending'`. `app.startCombat(opts)` shows the screen (fills `allowRetry` from the setting). |
| `engine/combat` exports: `checkStart`, `canAutoResolve`, `generateEncounter(state, reg, rng, { table, danger, squadPower, exposesCommander?, lootTableId? })`, `defaultFormation`, `squadPower`, `encounterPower`, `defaultEnemyName`, `releaseBreakdowns` | P4 | What P5 uses to build and judge fights. `EnemyTable = { categories, archetypes? }`. |
| `squad/unlock_node`, `squad/respec`, `squad/set_loadout`, `squad/release_breakdowns`, `levelCap(state)` (`world.clearanceTier`), `unitStats(state, reg, unit)` | P4 | Progression. P5 calls `squad/release_breakdowns` on return and writes `world.clearanceTier`. |
| `item/equip`, `item/unequip`, `item/craft`, `item/upgrade`, `item/reroll`, `item/dismantle`, `rollLoot(draft, reg, rng, tableId, { extraRolls? })`, `bankLoot(draft, drops)` | P4 | Items and the workshop (session opened by the `workshop` activity). P5 banks `lastCombat.loot` with `bankLoot` on return; `loot_cache` is the table for cache nodes. |
| `world/seed`, `mission/dismiss { missionId }`, `rumor/follow { rumorId }`, `squad/add_named { unit }`, `squad/decline_incoming` | P5 | World seeding (older saves), board and rumors, intake of incoming named units (`world.incomingUnits`). |
| `expedition/start { missionId \| poi, unitIds, formation, supplies }`, `expedition/move`, `expedition/set_formation`, `expedition/treat`, `expedition/resolve_combat`, `expedition/choose`, `expedition/return`, `expedition/retreat`, `expedition/ack_report`, `expedition/set_recap`, `expedition/mark_debriefed` | P5 | Expeditions. While `state.expedition` is open only `expedition/`, `combat/`, `director/` and `debug/` actions run (guard in `dispatch`); slots are spent once on return; `lastExpedition` is the after-action report. |
| `director/apply { requestId, output, beatCooldownDays? }`, `director/fallback { requestId }`, `director/request { reason: 'scout' }`, `campaign/set_beat_cooldown { days }` | P5 | The director's second phase: the engine opens `world.director.pending` (`director_requested`), the app answers it. Validated by `validateDirectorOutput`; an unanswered request is answered by `fallbackOutput` at the next day end; a full request that arrives while a scout request is open is opened right after it (`world.director.after`). `beatCooldownDays` is mirrored into `settings` of the campaign by the app. |
| `engine/world` exports (`index.ts`): `applyWorldEffects(draft, ctx, effects, src)`, `advanceClock`, `factionStanding`, `offerMission`, `missionById`, `currentBeat`, `isOpenEnded`, `buildDigest`, `ableParty`, the state types | P5 | What P6 uses: the world-effect vocabulary (`WORLD_EFFECT_TYPES`), clocks, factions, missions, the spine, the digest. |
| `app.expedition` (`plan`, `launch`, `move`, `choose`, `treat`, `fight`, `afterCombat`, `retreat`, `return`, `requestRecap`, `debrief`), `app.director` (`onRequested`), `app.intakeUnit()`, `AppDeps.assetUrl` | P5 | The controllers behind the expedition screen and the director; `intakeUnit` runs the one-unit calibration for a card. |
| `leash/seed`, `leash/compel { unitId, context: 'scene' }`, `leash/suppress { unitId }`, `leash/terminate { unitId }`; `leashCost`, `witnessesOf`, `removeFromService(draft, unitId, status)` | P6 | The Leash: weekly authorizations (`leashWeekly`, refreshed at day end), exact costs, `leash.log`. A request that cannot be paid or has no valid target changes nothing. |
| `scene/order { unitId }`, `combat/compel`, `loyalty/talk_down { stat }`, `loyalty/let_go`, `loyalty/take_back`, `loyalty/turn_away`, `loyalty/fight { formation, coverId, allowRetry? }`, `loyalty/yield`, `loyalty/resolve_mutiny` | P6 | Refusals, desertion and mutiny. State: `disloyalty { units, open }`; night entries of kind `desertion` / `mutiny` / `deserter_return` (`CONFRONTATION_KINDS`) are refused by `night/open` and `night/ignore`. |
| `dilemma/request { templateId, context }`, `dilemma/present { requestId, output }`, `dilemma/fallback { requestId }`, `dilemma/choose { id, index }` | P6 | Two-phase generated dilemmas (`state.dilemmas.open`); every answer needs the open id (`Stale dilemma answer.`). While one is `presented`, `activity/`, `calendar/consume_slot`, `scene/start`, `expedition/start` return `dilemma_open`; `dilemma/` is allowed during a run. |
| `arc/decide { unitId, defectId, path, compel? }`, `arcPaths`, `arcScale` | P6 | Defect arcs (Cure / Manage / Embrace); steps through the `medbay` activity. |
| `Encounter.mutineers`, `CombatResult.mutineers`, `CombatState.lastRefusal` / `compels`, `applyEventToUnit(…, { scale })`, `EffectSource.units`, world effect `thread_flag`, `finishEventNode` | P6 | Extensions of P3/P4/P5 interfaces (squad units as the enemy side, the order refusal memory, witness scaling, unit events at the base, dynamic thread flags). |
| `app.dilemmas` (`onRequested`, `choose`), `app.loyalty` (`order`, `compel`, `onSceneOpened`, `onSceneClosed`, `onEvents`), `app.fileLeash(kind, unitId)`, `ShellApi.closeModal()` | P6 | Controllers and the oversight form; `loyaltySigns` is a new registry. |

| `glossary` registry, `description` on 20 registries, `cause` on `eventDeltas`, `[[target\|label]]` links (`parseLinks`, `stripLinks`, `linkTargets`; the loader checks targets), `DESCRIBED_REGISTRIES` | P7a | Explanations are content. A new player-visible registry gets an optional `description` and joins `PLAYER_VISIBLE`; a new concept gets a glossary entry (settings: `setting_<snake_case key>`, `settingGlossaryId`). |
| `data-analyze="<source>:<id>"` + `data-analyze-ctx`, `analyzeAttrs`, `analyzeNative`, `ANALYZE_MARKERS` (`.alius-stat, .alius-chip, .alius-option`) | P7a | Marks anything explainable (overview P12). Every marked element needs an address that resolves; the coverage test (`tests/ui/analyzeCoverage.test.ts`) fails otherwise. `alius-stat/chip/option` are reserved for markers. |
| `registerAnalyzeProvider(key, (subject, env, knowledge) => Reading)`, `readingFor`, `buildKnowledge`, `registerKnowledgeRule({ fact?, flag? })`, `registerCoreProviders` | P7a | Live "Current reading" blocks. A provider must take numbers, clocks, facts and flags through `Knowledge` (`tests/analysis/hidden.test.ts` runs over every registered provider). |
| `buildPanelModel`, `entryEffects`, `summarizeCombatEffect` / `summarizeWorldEffect` / `summarizeActivityEffect` | P7a | Static text and generated effects lines from structured effects. |
| `attachAnalyzer(root, { getEnv })`, `ShellDeps.analyze: { registries }` | P7a | Hover (delay setting), `?` / F1, long-press, pin, drill-down (depth 3). The shell attaches it on open; `shell.refresh()` refreshes it. |
| `CampaignState.ledger?`, `recordLedger(before, after, action)`, `TUNING.ledger`, `unitStatSteps(state, reg, unit, stat)`, `dilemmaOptions` (+ `check` / `requires`) | P7a | `dispatch` records changes of resources, unit stress and relation axes (7 days, 150 entries) for trends and "last changes"; `unitStatSteps` explains how a stat is built. |

| `commander/seed`, `commander/set_profile { commander }`, `commander/review_done`, `campaign/set_first_impression_tau { days }`, `commanderProfile(state)`, `daysKnown`, `addBodyXp`, `commanderLine`, `validateCommanderSetup`, `traitBlockReason` | P7 | The commander file: optional state defaults for old saves, the review modal's actions, the single reader of body, expression, seasoning, traits and archetype. |
| `traitEffects(state, reg, type)`, `hasTraitEffect`, `traitIds`, `applyStartTraitEffects`, `applyFactionTraitEffects`, `syncTraitSettings` | P7 | The only way code reads a commander trait: by effect type, never by trait id (overview P4). Add an effect type to `TraitEffectSchema` and a line in `summarizeTraitEffect`. |
| `routeChoices`, `resolveRoute`, `routeScope`, `afterFailedRoute`, `routeCheck` on authored event options, `dilemma/choose { route }`, `expedition/choose { route }` | P7 | Checks with several routes (body, delegate, social, item, bypass); the validator rejects a body-only check (principle P10). |
| `presenceOf`, `firstImpressionWeight`, `matchedTastes`, `applyFirstImpression`, `imageMultiplier`; registries `presence`, `tastes`, `imageConsistency` | P7 | First impressions at join, and the off-image multiplier in `computeDeltas`. A new join site must call `applyFirstImpression`. |
| `combat/presence`, `cs.presence`, `commanderMaxHp`, `dodgeChance`, `scarCommander` (`engine/combat/crisis.ts`) | P7 | The commander in combat: HP from endurance, dodge, a once-per-fight presence action, scars. |
| `isQuietNight`, `calendar/sleep`, `calendar.loseMorning`, `activityCost`, `requisitionCost`, `terminateChance`, `socialGrowthMult`, `bodyGrowthMult`, `intimacySetting` (vs `intimacyOf`), `platonicThresholds`, `requiresTrait` on relationship states | P7 | Trait hook points: use these instead of the raw tuning or settings. |
| `commander_import` call, `importCommander`, `StAdapter.getPersonaDescription`, `WizardStep 'commander'`, `renderCommanderFile`, `renderCmdrCard`, `renderRoutePicker` | P7 | Setup and UI pieces. |

| `world.options`, `worldChoice(state, reg, optionId)`, `worldChoices`, `worldEffects(state, reg, type)`, `isNeutralChoice`, `defaultWorldOptions`, `validateWorldOptions`, `familyEnabled`, `activeFamilies`, `world/set_option { optionId, choiceId }` (live options only), `campaign/set_min_confidence { value }` | P8 | World options: the stored choice or the option's default, effects read by type. `SetupResult.world` writes them before the world is seeded. |
| `dispositionFor(state, reg, unit)`, `dispositionById`, `worldDispositionLevel`, `bandShift`, `applyDispositionStart`, `scaleRefusal`, `mutinyRules`, `confidenceFloor`, `confidenceShift`, `dispositionThresholds`, `TUNING.disposition` | P8 | A unit's effective level and its parameters (multipliers, confidence floors, loyalty bands, stage timing, refusal, desertion, mutiny, breakdown target, big gesture). A new join site calls `applyDispositionStart` before `applyFirstImpression`. |
| `stanceOf`, `stanceEffects`, `optionStanceEffects`, `effectiveValues`, `rollGruntStances`, `normDistance`, `applyWorldStartEffects` | P8 | Per-unit stances toward the world's norms and the commander's distance from the expected expression. |
| `renderWorldParams`, `worldSettingsLine`, `registerWorldOptionsContext`, `worldDirectives`, `clearWorldDirectives`, `WizardStep 'world'`, `Wizard.applyPreset / setWorldOption / worldSummary / refreshWorldSections`, `importProfile(…, { world })`, sections `disposition` / `stances` | P8 | The WORLD PARAMETERS step, the WORLD SETTINGS block and directives, the world-aware import. |
| `breakdownTargetFor`, `PlannedAction 'self_harm'`, log kind `self_harm`, world effect `stigma_news`, `faction` effect id `own` | P8 | Extensions of P4 and P5 interfaces. |
| `impunityOf(state, reg, unitId)` → `{ value, terms }`, `leverageOf`, `impunityBand`, `commandStance(state, reg, unitId)`, `stanceEntry`, registries `commandStances` (5), `TUNING.impunity` | P9 | Impunity is computed (base + R + L − P·w(d) − D + C + S); only `Relation.impunityRecord` is stored. The command stance (`disciplined`, `defiant_loyal`, `fearful`, `open_defiance`, `indifferent`) is Trust × Impunity and drives the directive, the refusal form, mutiny, desertion, sabotage and demand frequency. `stanceOf` stays P8's. |
| `enforce`, `holdDefiance`, `settleDefiance`, `dropDefiance`, `registerThreat`, `lapseThreat`, `addRecord`, `decayRecords`, `forgetUnit`, `disciplineOf`, `applyDisciplineEvent` | P9 | The one place an enforcement touches R, a held defiance and a pending threat. `ENGINE_EVENT_TYPES` (`granted_demand`, `refused_demand`) are never offered to the model. |
| `applyPunishment`, `checkPunish`, `perceptionOf`, `canUndo`, `undoApplication`, `undoThreat`, `restrictionReason`, `addRestriction`, `activeRestrictions`, `dutySlot`, `measureList`, registry `punishments` (6), actions `discipline/punish { unitId, measure, days? }`, `discipline/undo { id }` | P9 | Punishments run through `computeDeltas` as `commander_enforced`; applications store an `Inverse` for exact UNDO. Restrictions (confined, no_leave, benched, duty) are read by the scene, activity, expedition and companion checks. |
| `queueSabotage`, `sabotageDayStep`, `gearFault`, `isCovert`, `acquaintanceDays`, `inAcquaintance`, `disciplineDayStep` | P9 | Covert sabotage of `fearful` units (anonymous facts), the acquaintance grace and the discipline day step (on `director_tick`). |
| `openDemand`, `rollDemands`, `eligibleTemplates`, `demandChance`, `grantProblem`, `deliverDemand`, `answerDemand`, registry `demandTemplates` (6), actions `demand/roll`, `demand/deliver`, `demand/answer` | P9 | Demands (`resource`, `privilege`, `exclusion`, `item`, `information`, `interpersonal`) and the *owed* demand of a delegate one Trust band short. |
| `countDeed`, `deedsOf`, `DEED_COUNTERS`, `patternHolds`, `patternScore`, `reputationDayStep`, `introduceNickname`, registry `reputations` (7), action `reputation/introduce { unitId }`, `commanderLine` (nickname clause) | P9 | Deeds are counted where they happen; patterns queue one pending nickname; it is introduced in a private scene and enters the commander line and the CMDR card. |
| `createDiscipline` / `app.discipline` (`onEvents`, `onSceneOpened`, `onSceneClosed`, `punish`, `undo`, `onSlotAdvanced`, `answerDemand`, `talkDemand`), `disciplineDirectives`, `reputationDirectives`, `clearDisciplineDirectives`, `renderDisciplineMenu`, `drawDisciplineChips`, `drawDemandChips`, `registerDisciplineProviders` | P9 | The non-engine layer: directives (`loyalty:`, `refusal:`, `threat:`, `discipline:`, `demand:`, `reputation:`, `nickname`), toasts, wording, chips and the DISCIPLINE menu. Events: `defiance_noted`, `defiance_settled`, `threat_registered`, `threat_kept`, `threat_lapsed`, `discipline_applied`, `discipline_undone`, `restriction_started`, `restriction_ended`, `covert_sabotage`, `demand_opened`, `demand_delivered`, `demand_resolved`, `nickname_pending`, `nickname_given`, `nickname_dropped`, `impunity_changed`. |
| `contentAllowed`, `enabledCategories`, `disabledCategories`, `setCategories`, `tagsOf`, `flaggedCategories`, `ownLimitLabels`, `CONTENT_GATED_REGISTRIES`, registry `contentCategories` (9), action `content/set_categories { enabled }`, `Unit.bond`, `bondOf`, `bondTierOf`, `MODEST_BOND`, `validateBond`, `defectAllowedFor`, `relationshipStates[].bondTier` | P9d | One gate for everything a category can switch off (a registry that joins `CONTENT_GATED_REGISTRIES` needs a `GATE_PROBES` entry); the per-unit bond profile and the tier (`romantic`, `close`) that P9b/P9c read. Absent = nothing enabled / a modest profile. |
| `decideLead`, `leadScoreParts`, `raiseTone`, `startTone`, `followLead`, `setSceneLimit`, `SceneRecord.{tone,lead,followed,limits}`, actions `bonds/follow`, `bonds/limit`, `defects[].leadBonus`, `relationshipStates[].leadBonus` | P9d | Who leads a romantic scene (`unit`, `commander`, `shared`), decided by the engine; never lowers. |
| `wantOf`, `wantBand`, `wantBandOf`, `wantEligible`, `effectiveWant`, `relieveWant`, `wantStep`, `startWantBreakdown`, `bondsDayStep`, demand kind `desire`, cost `night_visit`, night kind `want_visit`, `defects[].wantBreakdown`, `activities[].wantRelief` | P9d | Want 0–100 for units with a real desire in a romantic state; bands calm / restless / aching / desperate; reaches the commander as a demand. Off-combat breakdowns through `Unit.breakdown.until`. |
| `rulesOf`, `activeRules`, `rollRules`, `answerRule`, `applyRuleEvent`, `checkDailyContact`, `checkRunRoster`, registry `relationshipRuleTemplates` (5), actions `bonds/deliver_rule`, `bonds/answer_rule`, intent types `rule_kept`, `rule_broken`, `compromise_reached` | P9d | Relationship rules a leading partner proposes; three checks (`daily_contact`, `run_without_asking`, `intent`). |
| `syncPublicity`, `setPublicity(draft, reg, unitId, level, { cause: 'commander'\|'claimed'\|'revealed' })`, `rollReveal`, `publicityMismatch`, action `bonds/set_publicity { unitId, level }` | P9d | How open a romantic relationship is; `claimed` (P9c) calls `setPublicity(…, 'public', { cause: 'claimed' })`. |
| `smotherActive`, `startSmother`, `clearSmother`, `smotherRefusal`, `releaseBreakdowns(draft, ids?, reg?)`, condition `orderedThisRound`, condition `commanderBuildIn`, `outgoing.vs: 'heal'`, `Combatant.refusal`, defect fields `eventStress`, `embraceFlag`, `requiresBond`, `defectEventStress` | P9d | The stand-ins P9c/P9b replace (a smother hold, a co-command flag) and the combat/defect vocabulary of the two new defects. |
| `createBonds` / `app.bonds` (`onEvents`, `answerRule`, `negotiateRule`, `onSlotAdvanced`, `setPublicity`), `bondsDirectives`, `contentLine`, `drawViolation`, `drawLeadChips`, `drawRuleChips`, `renderContentSection`, `registerBondsProviders` | P9d | The non-engine layer: directives (`content`, `limits:`, `lead`, `boundary:`, `want:`, `rule:`, `publicity:`, `co_command:`, `ask:`), the violation and lead chips, the CONTENT section at setup and in SYS. |
| `assertiveness(state, reg)` → `{ privilegeMult, demandMult, commanderVoteMult }`, `votingOn`, `powerOf(draft)`, world effects `squad_power` / `voting`, options `squad_assertiveness` / `voting`, preset `assertive_squad`, `TUNING.power` | P9b | The squad's assertiveness and the voting toggle, read by effect type. `demandChance` already multiplies by `demandMult` (P9c bookings read it too). Absent = normal, voting off. |
| `ballotFor`, `tallyVote`, `leanFor`, `compatibility`, `commanderVoteWeight`, `subjectOf`, `voteSubjectLabel`, registry `voteKinds` (5), `commandStances[].voteBias`, `missionTemplates[].voteLean`, `facilities[].voteLean` | P9b | Pure ballots and the tally (a tie passes); no rng. |
| `openVote`, `dropVote`, `overruleVote`, `carryVote`, `voteFor`, `liveVote`, `grudgeHolds`, `forgetPower`, `registerVoteGate(actionType, gate)` (in `dispatch.ts`), actions `vote/open`, `vote/drop`, `vote/overrule`, error `vote_needed` | P9b | The squad vote flow and the gate that refuses a decision until a usable vote exists (only while `voting` is on). `removeFromService` calls `forgetPower`. |
| `rationsOf`, `rationsVotable`, `RATION_MODES`, `setRations`, `base.rations`, action `rations/set`, event `commander_went_hungry` | P9b | `equal` / `fighters_first` / `commander_short`, applied in `runUpkeep`. |
| `meritOf`, `respectOf`, `standingOf`, `computeHierarchy`, `changeLeader`, `leaderOf`, `recordMerit`, `powerDayStep`, `PowerState.hierarchy`, ledger key `standing:<id>`, event `leader_changed` | P9b | Derived standing and the weekly leader (`leadRank ≥ 2`, margin 10). P13's warden is computed among the others. |
| `privilegeScale`, `leaderVoteWeight`, `countermandChance`, `countermandOpen`, `rollCountermand`, `activities[].countermandable`, `endorse`, `challenge`, `challengeChance`, `dropCoCommand`, actions `power/countermand`, `power/endorse`, `power/challenge` | P9b | The leader's privileges and the commander's moves against her. |
| `noteFeat`, `outsideActive`, `outsideSuppressedFor`, `negotiationHolds`, registry `outsideFeats` (3), `ExpeditionState.orders`, `LeashLogEntry.cc`, `dilemma_resolved.routeKind` | P9b | Outside perception and the three feats. |
| `openScapegoat`, `responsibleFor`, `scapegoatOptionId`, `markDecidedBy`, `Mission.decidedBy`, context `scapegoat`, template `scapegoat_mission`, world effect `oversight_punish`, `unit_event` targets `subject` / `witnesses`, event `shielded` (engine type; a big gesture), `Restriction.source: 'oversight'` | P9b | The scapegoat after a failure the squad chose; `take_blame` / `shift_blame`. P13 adds the commander's injury and confinement to TAKE THE BLAME. |
| `createPower` / `app.power` (`onEvents`, `requestVote`, `overrule`, `drop`, `ballotLines`, `endorse`, `challenge`, `answerCountermand`), `powerDirectives`, `refreshPowerDirectives`, `renderVotePanel`, `renderHierarchyBlock`, `drawCountermandChips`, `scapegoatView`, `registerPowerProviders`, setting `ballotWording`, flavor kind `ballot` | P9b | The non-engine layer: directives (`power:vote:`, `power:leader`, `power:outside`, `power:challenge`, `power:countermand`), the VOTE panel, the dossier block. `requestVote(action)` is how a UI path runs a gated action. |
| `herCallSpecOf`, `askFirstHolds`, `herCallCandidates`, `actorWeight`, `herCallChance`, `herCallOdds`, `rollHerCall`, `applyHerCall`, `markHerCall`, `setAskFirst`, `acknowledgeHerCall`, `closeEventNode`, actions `expedition/ack_her_call` and `power/ask_first { unitId, on }`, `dilemmaTemplates[].herCall` (+ `defectTilt`), `fixed.because`, `Mission.decidedBy.source`, `PendingNode.herCall`, `ExpeditionState.herCalls` / `ExpeditionReport.herCalls`, `PowerState.askFirst`, `DilemmaState.scapegoatSource`, events `her_call` / `her_call_acknowledged` / `ask_first_set`, `TUNING.herCall` | P9e | A soldier acts on her own at an expedition event node: the engine picks who (lead rank or stance + Impunity, weighted; the leader ×2) and how it turns out; a bad call marks a command mission so P9b's scapegoat opens on her; the standing order "ask me first" stops it for one soldier at the price of Trust. `eventPool` offers a her-call template only to a party with an eligible unit, so with none the run is byte-identical to P9b. |
| `renderHerCallCard`, `herCallChip`, `ExpeditionController.ackHerCall`, `app.power.askFirst(unitId, on)`, `VOICE_OF.her_call`, directives `power:herCall:<unitId>` and `power:ask_first:<unitId>`, providers `glossary:her_call` / `glossary:ask_first`, glossary `her_call` / `ask_first` | P9e | The non-engine layer: the notice card (no options, `[ACKNOWLEDGE]`), the `ON HER CALL` chip, the ASK ME FIRST toggle and `ASKS FIRST` chip in the dossier. |
| `whereabouts(state, reg)` → `Whereabout[]` (`{ unitId, roomId \| null, reason }`), `fnv1a`, registry `hubRooms` (`rect`, `sceneLocationId`, `facilityId?`, `activityIds?`, `weights`, `likeTags?`, `hosts?`, `commanderCell?`) | P10 | Where each living unit is this slot, derived and stateless (no RNG): away, injured, confined, duty, night, else a weighted hash pick. Stored schedules stay an open item (P10b did not take them). |
| `ScreenId 'hub'`, `ShellApi.registerHub / isDeviceUp / setDevice`, `toast(kind, text, { voice, title })`, `ShellDeps.{ skin, sound, onDevice }`, `app.talkAt(unitId, locationId)`, `app.endSlot()` | P10 | The hub is the home screen and the PDA a device layer over it: `showScreen('pda')` raises it, `'hub'` lowers it. `talkAt` starts the talk activity and the scene at a room's location without the picker; `endSlot` passes the slot after a confirm (a quiet night is slept through). |
| `currentObjective(state, reg)`, `tonightItems`, `markerTone`, `endSlotBlock`, `latestOversight` (`src/ui/hub/model.ts`) | P10 | Pure view models of the hub. `currentObjective` reads P11's `objectiveList` and falls back to the old mission pick (`source: 'mission'`). |
| registry `deviceSkins`, `pickSkin(state, reg, override)`, `screenBox(skin)`, `renderChrome`, setting `deviceSkin` | P10 | The PDA casing: `css` presets (`ccp_standard`, `kestrel`, `vesper`) or `image` skins with `frameSize` + `screenRect`; chosen by override → trait → flag → corporation → `ccp_standard`. |
| `renderVoiceCard`, `renderBubble`, `unitAccent`, `VOICE_OF`, `Voice` | P10 | The four voices (terminal, corporate, paper, personal); sources declare their voice in `VOICE_OF` (P11 intake forms are `paper`). |
| `unitPortrait`, `portraitOptions`, `ditherBayer4`, `PALETTE_RGB`, setting `ditheredPortraits` | P10 | PDA portraits dithered into the phosphor palette, cached per card, palette and size. |
| `createSound`, `SoundId`, registry `uiSounds` (hidden), settings `soundVolume`, `soundMuted`, `ambientHum` | P10 | UI sounds synthesized with WebAudio; an entry's `file` is played when present. |
| `motionReduced(settings)`, `visualFlags(settings)`, settings `readableMode`, `reducedMotion` | P10 | The one reader of reduced motion (setting OR system) and readable mode; everything that animates asks here. |
| `memoryConfig(state)`, `MEMORY_PRESETS`, `MEMORY_RANGES`, `memory.config`, actions `memory/configure { preset } \| { preset: 'custom', …fields }`, `memory/pin`, `memory/forget`, `memory/edit` | P3b | Per-campaign memory settings (absent = `normal`). `retrieveFacts` reads `retrievalK` and `recencyBase` from it; a pinned fact scores +2 and is never pruned; pruning starts past `factsMax × 1.25`. |
| `addFact(draft, fact, { remembered: true })`, `Fact.{pinned, heard, rumor, hiddenFromCommander, edited, spread, foldedInto}`, `memory.nextRememberId` | P3b | A fact written by a rule takes an `fr<n>` id and leaves `memory.nextId` alone. `hiddenFromCommander` is the interface P12 writes through (`Knowledge` never shows such a fact). |
| `rememberEvents(draft, events, reg)`, `registerMemoryResolver(type, fn, shape)`, `memoryResolverFor`, `RESOLVER_SHAPES`, registry `memoryRules` (28), optional event fields `dilemma_resolved.{context, units, optionId, subjectId}`, `activity_done.slot`, `vote_carried.overruled` | P3b | An engine event becomes a fact with an audience; `dispatch` calls it after a successful handler. A new remembered event needs a resolver (the closed vocabulary) and a rule; the loader checks the rule's `{vars}`, `when`, `about` and `audience` against the resolver's shape. No RNG, no `nextId`. |
| `hashDay`, `spreadRumors` (the `dm_rumors` hook), `visibleToAll`, `factLine`, events `rumor_heard` | P3b | Deterministic rumor spread (fast 2 days, slow 4, halved at importance ≥ 4); the prompt wording of a rumor and of a fact hidden from the commander. |
| `foldDue`, `applyFold`, `fallbackFold`, `memory.dossiers`, actions `memory/fold`, `memory/edit_dossier`, `memory/rumor_text` | P3b | Old facts folded into a per-unit (or world `*`) dossier when memory fills; a stale fold is refused. |
| `ChronicleEntry.audience`, `audienceKey`, `compactionDue` / `applyCompaction` / `memory/compact { audience? }`, `recentLines(state, viewers \| 'public', cfg)`, `recordSceneRange`, `memory.scenes`, `hideCandidates`, `memory.hidden`, action `memory/hidden` | P3b | Chronicle lines know who was there and compact per audience; "recently in the unit"; where each ended scene sits in the ST chat. |
| `journalLines(state, reg, unitId, { n, evidence })`, `eventDeltas[].journal`, `SceneRecord.digest`, action `scene/digest { text, upTo, facts }`, `scene/end { summary?, endIndex? }` | P3b | The relation journal for the prompt and the digest of a long scene. |
| `herDossier`, `herJournal`, `herFacts`, `vignetteMemory`, `publicRecent`, `worldDossier` (`engine/memory/inputs.ts`) | P3b | What the calls outside a scene (DM, vignette, demand wording, director) are told about memory. |
| `ContextProvider.{group: 'memory', core}`, `ContextBuilder.build(state, cap, memoryTokens)`, `lastBuild()`, `registerMemoryContext` (`dossier`, `journal`, `facts`, `promises`, `recent`, `dm_recap`) | P3b | The guaranteed memory share of the context block. With a share of 0 the group is ordinary. |
| `createMemoryController` / `app` wiring (`run`, `digestIfDue`, `idle`), call types `memory_fold` and `rumor_retell`, `scene_summary` `digest` mode, `foldMemory`, `retellRumor`, `digestScene` | P3b | The model-facing side of memory; every answer is dispatched with the chat id it was asked under. |
| `StAdapter.hideMessages(from, to)` / `unhideMessages(ranges)` | P3b | ST's `/hide` and `/unhide`; only runs of non-system messages are hidden and returned. |
| `renderMemorySection`, `renderFill`, `renderMemoryBlock`, `registerMemoryProviders` (the Knowledge rule and 7 readings), glossary `memory`, `memory_preset`, `memory_budget`, `memory_fill`, `dossier`, `squad_rumor`, `pinned_fact`, `hidden_scenes` | P3b | SYS › MEMORY with the fill indicator and the MEMORY view in each unit's block. |

| `onboardingDone`, `currentStep`, `completionReason`, `initialOnboarding`, `enterStep`, `registerStepEntry(kind, fn)`, `prologueFor`, `stepsOf`, `isWizardStep`, actions `onboarding/complete_step { stepId }`, `skip_step { stepId }`, `mark_spoken { unitId }`, `hint_seen { hintId }`, registries `prologues` (`order` + `steps`, per start by `extends`) and `uiUnlocks` | P11 | The prologue: wizard steps (`paper_form`, `dossier`) run before deployment, campaign steps (`scene`, `expedition`, `guided_slot`, `free`) after it. The engine checks each step's completion (closed enum) and `enterStep` is the only mover. **Absent `onboarding` = done.** Events: `onboarding_step_started / _completed / _skipped`, `onboarding_done`, `onboarding_spoken`. |
| `lockedTabs(state, reg)`, `unlockedBetween(before, after, reg)`, `ShellApi.setTabLocked(id, locked)`, `isTutorialRun`, `coachHints(state, reg, screen)`, `guideUnit`, `buildFixedMap`, `missionTemplates[].{tutorial, fixedMap}`, `MapNode.eventId` | P11 | Progressive unlocks by `target.tab` (`minDay`, `afterStep`), the fixed tutorial run and its coach tips, the guide of the first evening, authored node maps. |
| `objectiveList(state, reg)`, `waitingDemands(state)`, `StoredObjective`, `DirectorOutput.objectiveHint { text, dueDays? }`, event `objective_set` | P11 | The objective tracker: prologue step, proposed beat, the director's single open lead, units waiting. Only the lead is stored (`objectives`). |
| `createOnboarding` / `app.onboarding` (`startLineup`, `talkFirstWords`, `skipFirstWords`, `skipStep`, `debriefTutorial`, `talkGuide`, `launchTutorial`, `onEvents`, `onSceneOpened`, `onSceneClosed`, `onLoaded`), `SceneController.opening()` / `StAdapter.triggerReplies()` (the group speaks first, no user message), `Comms.initiate(unitId)`, scene origin `prologue`, `TUNING.scene.maxParticipants` (4) | P11 | The non-engine layer: line-up and first words with soft caps (directives `prologue:goal`, `prologue:wrap`), the tutorial launch, the guide's DM and the step completions that events settle. |
| `Wizard.{ mode, setMode, stepsFor, prologueStep, jumpTo }`, `renderColdOpen / renderIntake / renderExam / renderFile`, `fillLine`, `renderOnboardingCard`, `renderCoach` | P11 | The in-world intake (paper voice) over the same Wizard methods, the hub's prologue card and the coach strip. |
| `personalOf(draft)`, `forgetPersonal`, `holdsPersonal`, `pressureGate(state, reg, unitId, mechanic)`, `pressureMultOf`, `jealousyAllowed`, `JEALOUSY_TAG`, `CampaignState.personal?`, `TUNING.personal`, event types `overrode_her`, `decor_removed`, `rival_favoured`, `bond_shown`, `token_removed`, `secret_confronted`, defect field `pressureMult`, `hitHer`, `favourReactions` | P9c | The personal state (a leaf: types only) and the bond gate every per-unit initiative of P9c passes (an imported bond profile plus the mechanic's own test). `forgetPersonal` is called by `removeFromService`. Absent `personal` = nothing booked, given, wagered or kept; a squad with no imported bond draws nothing. |
| `deviceAccess(state, reg, unitId)` (0–4, derived), `accessCan`, `deviceAccessWhy`, `decorOf`, `wallpaperUnit`, `pinnedNotes`, `removeDecor`, `interceptEditor`, `rollIntercept`, `resolveIntercept`, `takeKeptEdit`, registry `deviceAccessRules` (4), actions `device/remove_decor`, `device/intercept`, `device/resolve_intercept`, `dm/send { interceptId? }`, `DmMessage.editedBy` | P9c | Device access levels (decor, notes, calendar, messages), cumulative and never stored; level-4 edits of a DM to another soldier, a Leash request or a recruit order (`jealousy_games`), KEEP / REVERT. |
| `book`, `bookingChance`, `rollBookings`, `dueBooking`, `bookingPlayable`, `bookingGuard`, `cancelBooking`, `resolveConflict`, `playBooking`, `lapseBookings`, `metAtScene`, `refuseLikeDemand(draft, ctx, unitId, opts)` (`discipline/demands.ts`), registry `bookingKinds` (3), actions `booking/cancel`, `booking/resolve`, `booking/play`, dispatch error `booking_due` | P9c | A unit with access 3 books the commander's slots; the due slot belongs to her while she can be met (`booking_due` guard in `dispatch` and `endSlotBlock`); cancelling is the P9 refuse path. `whereabouts` places her in the booked room; `startSmother` books the next slot. |
| `courtshipMult`, `courtshipChips`, `rollClaims`, `claim`, `refuseClaim`, `cleanCondition`, proposal answers `deflect` / `accept_condition`, action `courtship/refuse_claim` | P9c | Inverted courtship (×2 initiative, three chips, a condition becomes her promise) and `claimed` (`setPublicity(…, 'public', { cause: 'claimed' })`, reactions). |
| `wornTokens`, `tokenLine`, `rollTokenOffer`, `giveToken`, `answerOffer`, `wearToken`, `removeToken`, `wearProblem`, `checkTokenWear` (`bonds/rules.ts`), rule check `token_wear`, registry `tokenKinds` (6), actions `token/answer`, `token/wear`, `token/remove` | P9c | Tokens the commander may wear (two at most): reactions, giver Affinity, the rule `no_other_tokens`. |
| `challenge`, `answerChallenge`, `playWager`, `applyStake`, `stakeOffered`, `offeredStakes`, `gamesOffered`, `resolveBets`, `recordTally`, `answerQuestion`, `recordAnswer`, `sparringBout`, `commanderSparrer`, `sparringOdds`, `ExpeditionState.tally`, registries `wagerGames` (5) and `wagerStakes` (7, content-gated), actions `wager/challenge`, `wager/answer`, `wager/play`, `wager/answer_question`, `wager/record_answer` | P9c | Wagers: coin, rock-paper-scissors, high card, sparring on the P4 engine, expedition bets; stakes filtered by content categories. |
| `obedienceOf`, `commanderObeys`, `unitObeys`, `herPick`, `herVote`, `overrideHer` | P9c | A day of obedience: her pick pre-selected for her own business (demand, booking, proposal, decision, vote), overriding applies `overrode_her`; or she follows the commander's non-combat orders. |
| `addSecret(draft, reg, p)`, `secretsKnownBy`, `heldTerm`, `hideInjuries`, `respondSecret`, `discoverSecret(draft, ctx, id, route)`, `rollSceneDiscovery`, `rollSecretNight`, `confess`, `SECRET_NIGHT_KIND`, `ImpunityTerms.held`, registry `secretKinds` (3), world effect `squad_secret`, action `secret/respond`, stance / state fields `hidesInjury` / `secretSlip` | P9c | Squad secrets: not a `Fact` while kept; sources (hidden injury, an event, the successor) and routes (insight, slip, night, frequency) draw only when someone qualifies; confront / pretend / use (`held` lowers Impunity). `addSecret` and the `frequency` route are for P12. |
| `createPersonal` / `app.personal` (`beforeSend`, `beforeRequest`, `answerEdit`, `onSlotAdvanced`, `onLoaded`, `cancelBooking`, `resolveConflict`, `answerClaim`, `onReply`, token and wager methods, `answerSecret`, `reopenSecrets`, `onEvents`), `personalDirectives`, `refreshPersonalDirectives`, `renderDeviceBlock`, `renderSchedule`, `renderSecretCard`, `renderWagerForm`, `renderWagerCard`, `renderTokens`, `renderClaimCard`, `VOICE_OF.booking / device_edit / squad_secret`, `flavor` kind `dm_edit` | P9c | The non-engine layer: wording of a level-4 edit, the scene a due booking opens, derived `personal:` directives, the cards and blocks. |

| `specialOf(draft)`, `seedSpecialTraits(draft, ctx)`, `forgetSpecial(draft, unitId)`, `holdsSpecial`, `hasTraitEffect(state, reg, 'frequency' \| 'paranoia' \| 'debts')`, effect types `frequency` / `paranoia` / `debts` / `commander_flag` / `unlock_order`, `CampaignState.special?`, `TUNING.special`, `validateCommanderSetup` / `traitBlockReason` option `corporationId`, `commanderTraits[].{requires, changes}` | P12 | The special-trait framework on P7: a trait switches a system on by effect type, the seed creates its state block (idempotent, no draw), `forgetSpecial` is called by `removeFromService`. `special/state.ts` is a leaf. Absent `special` = nothing intercepted, foreseen or owed. |
| `commanderStress(state)`, `addCommanderStress(draft, amount, source)`, `commanderStressBand`, `Commander.stress?`, event `commander_stress_changed`, activity effect `commander_stress`, ledger key `res:cmdr_stress` | P12 | The commander's own stress 0–100 in every campaign (Empathy −1 from 70; sources nightmares, a false alarm acted on, being downed; relief by day, sleep, medbay). No draw. P13's `pain_burst` reuses it. |
| `candidateTruths`, `falseValue`, `catchChance`, `rollIntercepts`, `interceptGist`, `fallbackFragment`, `leakCandidates`, `leakInput`, `frequencyLeak`, `suspicionOf`, `frequencySenseOf`, `decayFrequency`, `frequencyDiscovered`, `syncFrequencyKnowers`, `burnImplant`, registry `frequencyFragments`, action `frequency/word`, intent type `knowledge_leak`, engine event `frequency_exposed`, defect field `frequencySense` | P12 | Secret Frequency: intercepts at `scene/start` and `dm/receive`, distortion, leaks read from the conversation (offered to the model only with items), suspicion clocks (hidden), discovery with a hidden spreading fact, the one-way burn. An undistorted `secret` intercept calls P9c's `discoverSecret(…, 'frequency')`. |
| `realPrecursors`, `paranoiaDayStep`, `openPremonition`, `warnedUnits` / `warnedInput`, `premonitionLine`, `actOnWarning(draft, ctx, unitId, act)`, `preemptBonus`, `rollNightmare`, `NIGHTMARE_KNOCK_KIND`, `stanceAt`, registry `premonitionLines`, intent type `accused`, engine event `false_accusation`, `orderUnlocked`, `isTurningAttacker`, `takeContingency`, order `contingency` (`requiresUnlock`), combat effect `contingency`, `CombatState.contingency?` | P12 | Bloom-induced Paranoia: premonitions are real precursors (1–2 days early) or false alarms that look the same; acting on one (accuse, punish, Leash, bench / roster) is scored by its truth; nightmares; the `contingency` cover against a unit that turns. `stanceAt` is the pure core of `commandStance`. |
| `pickHandler`, `rollVisit`, `intelOf`, `paymentFor`, `answerVisit`, `lapseVisit`, `scheduleConsequences`, `runConsequences`, `ambushFor`, `oversightGain`, `openOversightCase`, `openUnitCase`, `rollUnitDiscovery`, `debtsChoice`, `pressureBand`, `HANDLER_VISIT_KIND`, `OWN_PANEL_KINDS`, `isOwnPanelNight`, registry `debtHandlers`, action `debts/answer_visit`, world-option effect `oversight_scrutiny`, `ExpeditionState.ambushed?`, dilemma contexts `debts_oversight` / `debts_unit`, secret-kind source `debts`, defect field `nightAware`, engine event `debts_exposed` | P12 | Web of Debts: a weekly night visit with its own panel, four answers per intel item, payment and pressure, consequences that come back (ambush, sabotage, standing) feeding oversight's hidden clock, and two fixed dilemmas (oversight → double agent / confess / flee; a soldier → report / protect / demand). |
| `CampaignState.leashswap?`, `CampaignState.ended?`, `leashswapOf`, `wardenOf`, `wardenUnitId`, `isLeashswap`, `forgetWarden`, `overrideOpen`, `Unit.status 'reassigned'`, `SetupResult.mode`, `validateSetup` mode checks, `prologueFor(reg, startId, mode?)`, `corporateWardenPick`, `seedWarden`, `fallbackAgenda`, `setAgenda`, `learnExpectation`, `TUNING.warden`, registry `wardenExpectations`, actions `warden/revealed` / `warden/agenda`, calls `warden_agenda` / `warden_judge` / `epilogue` | P13 | The LEASHSWAP mode: absent `leashswap` is the default mode (no warden, no override, no co-sign, no commander punishment, a commander who cannot die; a seeded week is pinned byte-identical by `tests/warden/unaffected.test.ts`). The warden is picked by the player or by the corporate ordering (a total order, no draw) and starts with a fallback agenda. `warden/state.ts` is a leaf. |
| `conflictOf`, `herAlternative`, `rollOverride`, `answerOverride`, `overrideChance`, `OverrideSource`, `wardenSource`, `runOrder`, `argueChance`, `resolveCompromise`, `argueEnded`, `argueAvailable`, action `warden/answer`, `warden/argue_started`, `ActivityRequest.wardenChecked`, intent types `expectation_kept` / `expectation_broken` / `conspired`, `compromise_reached.overrideId`, `WardenController` (`app.warden`), `renderOverrideChip`, `renderWardenPanel`, `wardenNotice`, `wardenDirectives` | P13 | Overrides at every hook (activity, roster, expedition, major dilemma, combat order), COMPLY / ARGUE / DEFY, generic over the holder so P15 can pass its own. The roll draws only when a conflict exists. |
| `applyCommanderPunishment`, `applyRemotePunishment`, `punishRoll`, `pickPunishment`, `commanderRestriction`, `leashCommander`, `rollCosign`, `cosignChance`, `refreshWardenLeash`, `addDefiance`, `checkEscalation`, `commanderDies`, `forceEnd`, registry `commanderPunishments` (effects `commander_stress`, `restrict`, `lose_slots`, `squad_record`, `injury`, `leash`), `LeashLogEntry.cc 'warden'`, `campaign_ended` guard, action `campaign/epilogue`, `renderEndScreen`, the day-start snapshot (`alius_day_start`) | P13 | Commander punishments (read by effect type), the Leash on the commander, her co-sign on the squad's requests, two warnings on two days before termination, and the death rule (`rewind_day` restores the snapshot and hides the chat, `campaign_end` closes the campaign read-only). |
| `addSuspicion`, `tryAlly`, `allyChance`, `intrigueDiscovered`, `conspireInput`, `allies`, `dig`, `digProblem`, `kompromatOf`, `hackStep`, `hackProblem`, `startRemoval`, `wardenGone`, `removeFromService(draft, unitId, status, ctx?)`, `openReportCase`, `wardenReportChoice`, `reportChance`, `investigationDayStep`, `remoteDayStep`, `remoteExpectations`, `rollVerdict`, `verdictChance`, `addClock`, actions `intrigue/act` / `intrigue/report`, dilemma context `warden_report`, role and defect field `tech`, `renderIntrigueSection`, `memoryRules` for the warden's events | P13 | Intrigue against the warden (allies in scenes, kompromat, the implant hack; a hidden suspicion clock), the three removal routes, the investigation clock, remote control and the verdict. `removeFromService` now returns events and needs `ctx` for the warden. |
| `createSpecial` / `app.special` (`onEvents`, `answerVisit`), `specialDirectives`, `refreshSpecialDirectives`, `renderFreqChip`, `renderInterceptLog`, `renderPremonitions`, `renderHandlerPanel`, `renderDebtsBlock`, `registerSpecialProviders`, `specialKnowledgeRule`, `VOICE_OF.frequency / premonition / handler`, setting `fragmentWording`, flavor kind `frequency_fragment`, `focus[].{requires, confirm}`, `focusConfirm` | P12 | The non-engine layer: wording and toasts (`notice` / `cutIn` deps keep it UI-free), directives `special:static:<id>`, `special:nightmare`, `special:handler`, the FREQ chip, the INTERCEPTS, PREMONITIONS and DEBTS blocks in the CMDR card, the HANDLER panel, the readings and the knowledge rule. |

| `vitalsOf(state, reg, unitId)` → `Vitals \| null`, `flickersOf`, `hidesInjury`, `conflictWithin`, `VitalsPattern` / `SpikeCause`, `defects[].vitals`, `TUNING.vitals`, `renderVitalsBlock`, `renderVitalsStrip`, `tracePoints`, `HEART_TEXT` / `TEMP_TEXT`, glossary `vitals` / `vitals_flat` / `vitals_flicker` | P10b | Squad biotelemetry derived from stress, the ledger, the open scene, Want and defects (bands and patterns, never a hidden number; a kept `hidden_injury` secret hides the fever). The SQUAD dossier block and the hub strip; provider `glossary:vitals`. |
| registry `dmBehaviours` (8), `whenHolds`, `stampBehaviours`, `replyModeFor`, `hesitates`, `receiptOf`, `passes`, `slotIndex` (`engine/calendar.ts`), `DmMessage.behaviours`, `dm/receive { mode: 'curt' }`, `dm_reply` modes `curt` / `door`, `renderHerMessage`, `renderReceipt`, `renderTyping`, `splitBurst` | P10b | Living DMs: kinds `hesitate / deleted / burst / late / voice / curt`, decided at receipt by a hash of the message id (no RNG), never rewritten; read receipts in slots; the typing indicator and contact name in COMMS. |
| `night/door_say { text }`, `night/door_reply { text }`, `NightEntry.door`, `Comms.throughDoor(text)`, `renderDoor`, `DoorCtx`, setting `doorTimer`, `SoundId 'knock'`, `NIGHT_GAIN`, `Sound.setNight`, root `data-night` | P10b | The night door: every night entry outside `CONFRONTATION_KINDS`; one exchange, one model reply, a real-time timer (counts as staying silent), a blurred silhouette; the night theme, quieter sound. |
| registries `handFonts` (6), `handNotes` (5), `stickerArt` (8), `handOf`, `squad/set_hand`, `Unit.hand`, `CampaignState.notes`, `notesFor`, `unreadNotes`, `writeDoorNote`, `notesDayStep`, `forgetNotes`, action `notes/read`, `renderNote`, `renderRuleNote`, `--alius-font-hand` | P10b | Handwriting and notes: a stable default hand per soldier, notes in the quarters / gear / under the door (3 days, at most 12), rule notes signed and torn. |
| `TabId 'home'`, `KEY_TABS`, `renderHomeTab`, `HubCtx.onReadNote`, `ShellDeps.marks`, `renderMarks`, `stickerFor`, `deviceSkins[].stickerSpots`, `app.confirmPeel`, `TonightItem 'note'` | P10b | The PDA HOME view (first tab and default; wallpaper, access lines, notes), stickers on the casing (a layer under the screen, never clickable) and the confirm behind every PEEL. |
| `createEnvelope(host)` / `app.generations: Envelope` (`generate(siteId, key, opts?)`, `retry(recordId, opts?)`, `reroll`, `rerollState`, `drop`, `useFallback`, `bind(siteId, handlers)`, `takeSnapshot`, `clearSnapshots`), `GenerationOutcome`, `SiteHandlers` (`build`, `parse?`, `apply`, `fallback?`, `committed?`, `canUndo?`, `undo?`), `MOVED_REASON` | P14 | The only way a model is called. `callLlm` and `attemptLlm` are imported by `src/llm/envelope.ts` alone (an architecture test); `callLlm` returns `{ ok: false, reason: FailReason, detail, attempts, at, budget }` (`FailReason`: `no_profile`, `network`, `timeout`, `truncated`, `refused`, `invalid_output`, `empty`; `call_failed` is gone). |
| `registerGenerationSite(decl)`, `generationSite`, `generationSites`, `SiteDecl` (`id`, `callType`, `surface`, `reroll`, `record`, `glossary`, `label`, `held?`), `fullOpenRecords(state)` (`src/llm/sites.ts`), `describeFailure(view)` (`src/llm/describe.ts`) | P14 | Sites are declarations (data only); a new call type or flavor kind registers its site in the same change (`tests/llm/siteRegistry.test.ts`). Record mode `full` (chip, SYS, badge, hub line), `quiet` (SYS only), `none`. |
| `GenerationRecord`, `CampaignState.generations?: { seq, records }`, `openRecords`, `recordFor`, `TUNING.generation`, actions `generation/failed`, `generation/close`, `generation/expire`, day-end step `generation_sweep`, events `generation_failed` / `generation_closed` / `generation_expired`, actions `scene/late_summary`, `dilemma/reword`, `demand/reword`, `bonds/reword_rule`, `campaign/epilogue { replace }` | P14 | Pure bookkeeping, no rng; allowed in combat, in a run and on a closed campaign. |
| `drawGenerationChip`, `drawReroll`, `openRetryMenu`, `chipsFor`, `GenerationUi`, `drawGenerationChips`, `drawSiteReroll`, `drawRecordChip`, `runPending` (`src/ui/generation/`), `renderGenerationsSection`, `generationBadge`, `registerGenerationProviders`, `StAdapter.generateMain / generateWithProfile → GenAnswer { text, finishReason? }` with `signal`, `compileRefusals`, registry `llmRefusals`, settings `llmTimeoutMs` / `autoRetry` | P14 | The UI side (one optional `generation` in a screen's context), SYS › GENERATIONS and the adapter's stop reason. |
| `SetupResult.headStart { days, newArrivals, dynamicUnderway? }`, `HeadStartDays`, `headStartDays`, `isNewArrival`, `CampaignState.headStart?: HeadStartState`, `TUNING.headStart`, registry `headStartMoments` (10; `sign`, `requires`, `eventDelta`, `importance`, `tags`, `fallback`; `probe` is reserved for P15) | P11b | The head start: the squad has known the commander for 7 / 14 / 30 days (acquaintance only; world time does not move). Absent or `0` = byte-identical to a build without it. |
| `applyHeadStart`, `developRelation`, `impressionOf`, `crimeChance`, `rollCrime`, `pickMoments`, `applyMoment`, `capTrust`, `headStartTransition`, `headStartHash` / `headStartRaw`, `HEAD_START_SKIPPED_KINDS`, `evaluateAutomatic(…, { allow })`, `reactsToCrime` | P11b | The build step and its pieces (`src/engine/headStart/`): pure, no rng draw (chances hash `<seed>\|<unitId>\|head_start\|<key>`), read moments by `sign` / `requires` / `tags`. `enterStep` skips scene, expedition and guided_slot steps while `headStart` is set. |
| action `head_start/recap { units, chronicle, source }`, `recapCommitted`, `recapPairs`, events `head_start_applied` / `head_start_moment`, rules `head_start_moment_1…5`, `Digest.knownDays` | P11b | The recap of the first weeks: the first application writes facts and one chronicle entry, later ones replace the texts until the first scene starts. |
| `createHeadStart` / `app.headStart`, `HeadStartController` (`onLoaded`, `onSceneOpened`, `onSceneClosed`, `rerollRecap`, `rerollState`), `headStartOpening`, directive `head_start:known`, `head_start_recap` call (`sanitizeRecap`, `fallbackRecap`), site `setup.head_start_recap`, `renderHeadStartSection`, `renderNewArrivals`, `Wizard.setHeadStart` / `toggleNewArrival`, `renderRecapCard`, `OPERATIONS_LABEL`, `HubCtx.headStartCard`, provider `glossary:head_start` | P11b | The model-facing and UI layers. |
| `MemoryResolution.tags` (extra tags a resolver gives its fact), `momentTag`, `MemoryConfig.factTextMax`, `factTextMax(state)`, `OWN_MEMORY_FIELDS`, `validateIntents` option `factTextMax`, glossary `fact_length` | P11b | The longest text a fact keeps (100–400, default 200): the player's own memory setting, kept across presets. |
| `Unit.development`, `Unit.insight`, `Development`, `Appraisal`, `Reading`, `DevFact`, `DevMoment`, `ReviewInverse`, `developmentMode`, `developmentOf`, `ensureDevelopment`, `nextDevId`, `TUNING.development`, setting `characterDevelopment`, `SetupResult.characterDevelopment`, action `development/set_mode` | P14b | Character development state (absent = nothing yet; absent setting = off, byte-identical). |
| `valuesOf`, `likesOf`, `dislikesOf`, `tastesOf`, `effectiveProfile`, `RAW_MARK`, `bondOf` (folds `development.bond` over an imported bond), `effectiveValues` (drift first, stance on top), `tests/development/readers.test.ts` | P14b | The effective profile: every reader of a profile field goes through these. |
| registries `developmentAxes` (13), `developmentRules` (16), `habits` (5), `eventDeltas[].appraisal`, `activities[].appraisal` / `appraisalTags`, `dilemmaTemplates[].appraisal`, `axisEntry`, `axisKind`, `bondField`, `anchorKey`, `axisForbidden`, `isAnchored`, `matchRules`, `accumulate`, `allowedRules`, `allowedHabits` | P14b | Axes, rules and habits as data (`bond:lead_style`, wildcards `<kind>:.any`; rules by `match` / `by`; `contentTags` gate rules and habits). |
| `readingFor`, `recordAppraisal`, `recordWitnesses`, `recordActivity`, `pushAppraisal`, `removeAppraisals`, `EventIntent.reading`, `Inverse.appraisals`, `IntentExtractInput.reading`, `misreadChance`, `misreads`, `flipReading`, `developmentDayStep` | P14b | Appraisals from the viewer's point of view (no rng draw), misreading and revision. |
| `reviewDue`, `unitDue`, `eligibleAxes`, `validateReview`, `fallbackReview`, `applyReview`, `undoReview`, `reviewCommitted`, action `development/review { unitId, review, source, replace? }`, `development_review` call (`sanitizeReview`, `readReview`), site `development.review`, events `development_shift` / `development_review` | P14b | The weekly review, validated by the engine and undoable until she has shown it. |
| `stampMoments`, `showMoments`, `unstampMoments`, `stampedMoments`, `momentDirective`, `axisWords`, `changedAxes`, `createDevelopment` / `app.development` (`run`, `onEvents`, `onSceneOpened`, `onSceneClosed`, `reroll`, `rerollState`, `idle`), directive `development:<unitId>`, events `development_moment` / `development_fact` | P14b | Quiet moments and the controller. |
| `countActivity`, `countCompanions`, `countRun`, `checkHabits`, `habitEffect`, `DevFact.habitId`, events `habit_formed`, flavor kind `habit` (`sanitizeHabitWording`), site `flavor.habit`, setting `habitWording`, actions `development/edit_fact` / `development/hold` / `development/remove_fact` | P14b | Counters, habits and the player's control. |
| `registerDevelopmentContext` (`since_joining`, memory group, priority 68), `Knowledge.development(unitId, reg)`, `renderDevelopmentBlock`, `renderDevelopmentSection`, `Wizard.setDevelopment`, `registerDevelopmentProviders` (`developmentAxes`, `glossary:character_development` / `development_fact` / `habit` / `development_hold`) | P14b | The prompt block, the DEVELOPMENT view and its readings. |
| `quartersOf(state, reg, unitId)`, `sceneBackdrop(state, reg, locationId, ownerId)` → `{ file, slotted }[]`, `slotLight(slot)`, action `squad/set_quarters`, `Unit.quarters?`, registries `quartersStyles` (described) and `backdrops` (hidden: `surface` / `frame` / `place`, `finish`, `slots`), location fields `backgroundEvening`, `floor`, `ceiling` | P10c | Scene backgrounds by slot and her room style (stored choice, else `fnv1a(unitId)` over the registry order); the UI tries the candidates in order and ends at the ASCII stage. Surfaces and frames are data for P17c (no reader yet). |
| registry `planRooms` (`floor`, `rect` in plan units, `kind`, `hubRoomId?`, `sceneLocationId?`, `cabin?`, `stairTo?`, `doors?`, `labelAt?`, `affordances?`), `planRoomsOn`, `isOpenSpace`, `isClosed`, `cabinOf`, `cabinOwner`, `roomOfPerson(state, reg, here, personId \| 'commander')`, `litRooms`, `planGraph`, `neighbours(reg, id, 'door' \| 'wall' \| 'any')`, `route(reg, from, to)`, `registerPlanMarks` / `planMarks` | P10d | The hub is a top-down plan drawn from data. Cabins come from the order of joining (no state); the commander is in the commander's cabin until a package adds a reason; the door graph and the marks are groundwork for P15–P17 (no reader yet). |

Events emitted by the day-end pipeline: `director_requested` (P5), `leash_refreshed`, `loyalty_sign`, `desertion_attempt`, `mutiny_started`, `dilemma_requested`, `arc_unlocked` (P6), `mission_failed` / `mission_expired` / `clock_filled` / `leash_changed` (P5), `day_end_step`, `upkeep`, `quiet_night_started` / `morning_lost` (P7), `supply_shortage`, `trust_penalty_event`, `unit_recovered`, `facility_upgraded`, `slot_advanced`, `night_started`, `day_started`, `autosave` (the app flushes the saver on it).

## 6. Data model (high level)

```
Campaign {
  version, seed/rngState, day, slot, difficulty, settings snapshot
  commander { name, corporationId, crimeId, socialStats{authority,insight,empathy,cunning} /* ranks 1–5 */, socialPoints?{…} /* P2: points behind the ranks */, injuredUntilDay?, flags[],
              /* P7: optional in old saves, filled by commander/seed: */ body{strength,endurance,reflexes 1–5}, bodyXp{…} /* tenths of a session */, expression 1–5, seasoning 1–5, traits{ regular[≤2], special? }, archetype (derived, cached), fileReviewed?, sleeplessDay?, sleeplessRank?,
              /* P9: */ deeds?{ [DeedCounter]: n }, reputation?{ active[{ id, name, sinceDay, by?, lapsedDay? }], pending?{ id, queuedDay, replaces? } } }
  squad: Unit[]            // named + grunts, active and reserve
  roster: { activeIds[≤4], capacity }   // activeIds = expedition roster; capacity = beds, 6 → 10 via barracks; dead units may linger in activeIds until the next recruit/roster change, use activeRosterUnits()
  relations: { [unitId]: Relation }
  resources { credits, supplies, plyx }
  base { facilities: { [id]: level } /* absent = level 1 */, upgrades?: { facilityId, toLevel, daysLeft }[] }
  inventory: ItemInstance[]   // P4: { uid, itemId, rarity, upgrade, affixes[] }; itemSeq? counts uids
  world { regions{ [id]: { known, lastVisitedDay?, poi? } }, clocks[] /* { id, label, segments, filled, regionId?, visibleToPlayer, filledDay? } */, threads[] /* { id, title, status, flags[{id,description}], relatedUnits, relatedRegions, createdDay } */, factions{standing −100…100}, flags[], spineProgress /* beats completed */, spine?{ proposed?, proposedDay?, lastProposalDay? }, director?{ pending?, lastTickDay?, seq? }, incomingUnits?, lastExpeditionRegionId?, seeded?, startId?, clearanceTier? /* P4 reads, P5 writes: level cap tier 0–3 */, options? /* P8: { [optionId]: choiceId }, every option once the campaign is built; absent in old saves (defaults) */ }
  missions { offered[] /* the board */, active[], completed[] /* newest 30 */ }   // Mission: { id, source, templateId, title, brief, regionId, danger, objective, deadlineDay?, rewardsTier, failureEffects, threadId?, spineBeat?, poiId?, scouted?, status, rewards? }
  rumors[] /* newest 20 */, dms: { [unitId]: DmMessage[] /* P10b: DmMessage.behaviours?: string[] stamped at receipt */ }, notes?: { seq, list: HandNote[] } /* P10b: notes soldiers left, 3 days, at most 12 */, dmMeta?: { [unitId]: { day, sent } }   // P3: the unit's daily "social battery"
  memory { facts[], chronicle[], promises?[], nextId? }   // P3
  scene?: SceneRecord, proposals?: PendingProposal[]       // P3: the open scene (transcript stays in the ST chat) and open proposals; P9d adds the scene's tone ('romantic'|'intimate'), lead { by, unitId, score }, followed?, limits?[], violations?[]
  leashswap? { deathRule, warden?, intrigue, removal?, remote?, status: 'held'|'investigation'|'free', revealed? }   // P13: the LEASHSWAP mode; absent = the default mode (no warden, no override, no co-sign, a commander who cannot die)
  ended? { day, cause: 'terminated'|'executed', epilogue? }   // P13: a closed campaign (read-only; only the LEASHSWAP death rule writes it)
  special? { frequency?, paranoia?, debts? }   // P12: the special-trait systems (intercepts and suspicion; premonitions; handler, intel, consequences); absent = no special trait; commander.stress?: number (absent = 0)
  onboarding? { prologueId, stepId, stepDay, completed[], skipped[], done, spoken?[], hintsSeen?[], guideUnitId?, tutorialMissionId? }   // P11; absent = done (older campaigns are unaffected, nothing is locked)
  objectives?: [{ id, text, source: 'director', dueDay?, done }]   // P11: only the director's leads (≤ 1 open, 10 finished kept); prologue, spine and unit objectives are read live by objectiveList
  calendar { scheduled[], nightEventsQueue[], nightEvent? /* head entry while the Night slot runs; absent in a quiet night (P7) */, pendingScene? /* open talk holding its slot */, shortageStreak?, loseMorning? /* P7: the next day starts in the Afternoon */ }
  leash { authorizationsLeft, refreshDay, log[] /* entries { no, unitId, kind, day, context, outcome }, newest 60 */, seq?, seeded? }   // P6
  disloyalty?: { units: { [unitId]: LoyaltyRecord /* signs ≤ 6, attempts, nextCheckDay?, nextDoubtDay?, trigger?, cause?, deniedDay?, desertedDay?, stance?, returned? */ }, open?: Confrontation /* { kind: desertion|mutiny|return, unitId, day, at: night|mission_start, nightEntryId?, talkTried?, sympathizers?, combatId? } */ }   // P6
  dilemmas?: { seq, lastDay?, lastDefiningDay?, definingBeats?[], recent?[] /* 3 */, open?: DilemmaState /* { id, templateId, scale, context, status: requested|presented, attempts, units, threadId?, beatId, title?, setup?, options?, source? } */ }   // P6
  expedition?: ExpeditionState   // P5: open run (map, party, formation, carried supplies, pending node, unbanked loot, log, queued relation hints)
  lastExpedition?: ExpeditionReport   // P5: the after-action report (outcome, log, loot, rewards, injuries, deaths, recap?)
  headStart?: { days: 7|14|30, units: [{ unitId, impression, moments[] }], recap?: { source, chronicleId } }   // P11b: absent = no head start; world time never moves
  generations?: { seq, records: GenerationRecord[] }   // P14: failed model calls that wait for a retry (≤ 20; { id g<n>, siteId, key, reason, detail ≤ 160, attempts, day, slot, at, budgetMult, fallbackApplied?, status, expiredWhy?, quiet? }); no prompt, no model text; absent in old saves = none
  combat?: CombatState        // P4: only combat and rng change while it runs
  lastCombat?: CombatResult   // P4: for P5's recap and debrief
  workshopSession?: { day, opsLeft, companionId? }, enemyNames?: { [enemyId|affixes]: name }   // P4
  ledger?: [{ day, slot, action, key, delta }]   // P7a: changes of resources (res:<r>), unit stress (stress:<id>), relation axes (axis:<id>:<axis>) and, from P9, the stored Impunity term (record:<id>); last 7 days, ≤ 150, written by dispatch
  content?: { enabled[] /* contentCategories ids */ }, bonds?: { rules[], smother? }   // P9d; absent = nothing enabled, no rules
  power?: { votes{ open?, log[], seq }, grudges?, hierarchy?{ standings, leaderId?, endorsed, computedDay, challengeCooldownUntil?, deposed?, standingBonus?, outsideSuppressedUntil? }, merit?[], countermand?, scapegoatQueue?[] /* P9e: + source? */, askFirst?{ [unitId]: day } /* P9e */ }, base.rations?   // P9b; absent = no votes, no leader, equal rations (world options squad_assertiveness, voting live in world.options)
  hierarchy?, votes?[]   // P9b (planned): leader/standing and open votes; world options squad_assertiveness, voting
  discipline?: { defiance[], threats[], applications[] /* newest 20, each with its Inverse */, restrictions[], sabotage?{ queued[], gear?, lastDay? }, demands[], demandLog[] }   // P9; absent in old saves
}

Unit {
  id, kind: 'named'|'grunt', cardRef?, displayName, asciiPortrait?, designation?, bio?   // grunts: `K-117`-style designation, optional generated name/bio
  roleId, level, xp, skillPoints, unlockedNodes[], loadout?: skillId[], breakdown?: { defectId, day }   // P4
  signatureSkill { templateId, name, description }   // template id from the registry; name/description are the unit's own words, numbers stay in the template
  baseStats {hp, atk, def, spd, crit}, currentHp, stress
  defects: DefectInstance[]   // { id, origin?, arc?, lite?, upkeepDay?, arcSteps?: { done, needed, lastDay? } /* P6 */ }; named: 1–2, grunt: 1 (lite: no arc)
  values { pragmatism, autonomy, ingroup, mercy, corporate, sacrifice }  // each −3…+3
  likes[], dislikes[], triggers[]   // tags
  equipment { weapon?, upper?, lower? }
  injuries[], injuryDays?, status: 'active'|'reserve'|'injured'|'deserted'|'dead'|'terminated'|'reassigned'
  dispositionOffset?, dispositionReason?   // P8: −2…+2 on top of the world disposition level (absent = 0), proposed at import with a one-line reason
  worldStances?: { [optionId]: { stance: 'shares'|'indifferent'|'opposes', strength: 1|2, reason } }   // P8: her stance toward each squad-stance world option (absent = indifferent)
  commanderTastes?: string[]   // P7: up to 3 ids of registry `tastes`
  bond?: { leadStyle: 'dominant'|'assertive'|'balanced'|'yielding', attachment: 'slow'|'steady'|'intense'|'avoidant', desire: 'low'|'medium'|'high', caretaker, ownLimits{ categories[], note? }, publicity /* her preference */ }   // P9d: from the card at import; absent = a modest profile
}

Relation {
  trust, affinity, attraction
  stateId, stateSince, history[]   // a new campaign starts every named unit in state `stranger`, stateSince day 1; a grunt starts in `stranger` on its recruit day
  flags[]                // e.g. knows_crime, accepted_defect, promise_open
  dailyGain { trust, affinity, attraction }   // for diminishing returns; zeroed at every day rollover
  loyaltyBand: 'steady'|'wavering'|'breaking'  // with hysteresis; initial value from Trust: <10 breaking, <25 wavering, else steady
  affair?: { as, hiddenFrom[], since }   // P3: a concealed romance until discovered
  metDay?                // P7: first day the unit knew the commander (default: her join day; back-filled for old saves)
  impunityRecord?        // P9: stored term R of Impunity, −40…40, decays toward 0 by 1/day, absent = 0
  want?, wantBreakDay?   // P9d: Want 0–100 (bands 40/70/90; absent = 0) and the day it last crossed the breakdown band
  contactDay?            // P9d: the last day a scene or a DM with her judged a daily_contact rule
  publicity?: { level: 'secret'|'known'|'public', commanderPref?, since }   // P9d: set while she is in a romantic-tier state, cleared when she leaves it
  marks: MarkInstance[]  // RESERVED in v1 (always empty), see §10 "Marks"; present so no migration is needed later
}
```

### 6.1 Story flags

Flags are **declared, not invented**. The `flags` registry lists every flag the content can set: `{ id, scope: 'world'|'commander'|'relation', description, mutuallyExclusiveWith?[], setBy (hint: start/dilemma/mission/event) }`. Starts, missions, spine beats, dilemma templates and events reference flags by id; content validation fails on an unknown id.

The director may create **dynamic flags** only inside a thread namespace (`thread:<threadId>:<slug>`), each with a one-line description stored next to it. Dynamic flags can be read by later director ticks and dilemmas of the same thread, but spine beats and authored content may only depend on declared flags. This keeps "consequences are remembered" true without letting the model invent a parallel world state.

Core declares `knows_crime` (scope `relation`, set by `start` or `event`): a unit starts without it unless the crime or start says its crime is known.

### 6.2 Adding content (modularity in v1)

New enemies, skills, items, affixes, statuses, defects, activities, regions, node types, dilemma templates, relationship states and flags are **JSON entries, not code**:

1. Add the entry to the matching file in `content/core/` (or to a separate pack folder with its own `manifest.json` and higher priority).
2. Behavior is composed from existing **effect types** (P4 §1) and triggers. Only if no effect type can express it, add a *generic* effect type in code (never a one-off for a single item).
3. Restart/reload → the pack loader validates the entry (zod) and reports file + path on errors.
4. The balance harness (P4 §10) can include new enemies/defects/items immediately.

Packs can override by id or `extends` an existing entry. In v1 packs are loaded from the extension folder; an in-game pack manager and third-party packs are roadmap.

## 7. Core loops

**Day loop.** Morning → Afternoon → Evening → (Night only if an event fires). Each slot: choose an activity (alone or with a companion) or start a scene, or go on an expedition (consumes Morning+Afternoon; long ones also Evening). At day end (spending the Evening runs it once): supplies consumed (every living unit, reserve included, plus the commander; a shortage costs stress, Affinity and after 3 days Trust), stress/injury ticks, facility timers, mission deadlines, director tick, DMs/rumors, possible night event (the Night slot, entered only if `nightEventsQueue` is non-empty), save. A talk holds its slot until its scene ends.

**Conversation loop.** Player writes free text → main model replies (with injected context) → `intent_extract` (per exchange by default, or batched every N exchanges, setting) → engine applies deltas → UI shows subtle feedback (no raw numbers by default) → on scene end, `scene_summary` writes facts and chronicle.

**Expedition loop.** Pick mission → pick 4 units + loadout + rows → traverse node map → combats (pure engine), events (dilemma-lite or flavor), caches, rest → return → recap (optional LLM) → post-expedition intents (who protected whom, who was endangered) → scenes about it.

**Relationship loop.** Intents move axes → thresholds + flags + an *event* unlock state transitions → states unlock combat synergies, scenes, night events, defect arc options → state changes feed back into obedience and combat.

## 8. Settings (global, per-campaign overrides where noted)

Connection profiles (main, mechanic) · per-call token budgets · intent extraction mode (per exchange / every N / scene end) · sprite mode (native Expressions / mechanic `emotion_pick`) · difficulty (combat difficulty; **easy retry**: rewind lost combat, rewinds not recorded in memory) · show raw values (off: bands only) · mechanics edit lock (on by default: view-only, unlock to edit numbers in UI) · intimacy: romance on/off, **content categories** (P9d: per campaign, all off by default, set at setup in WORLD PARAMETERS › CONTENT and in SYS; enabling one is the player's full consent for it to appear; disabled ones are excluded from every generation and from every mechanic; a character's own limits from her card still apply; they supersede the old single "explicit scenes allowed" switch, which is read once to carry `explicit_scenes` over), Desire/Bond defect category on/off, romantic initiative intensity (low/med/high) · UI: phosphor palette (amber/green/white), scanlines, typing animation speed · companion vignettes on/off, generated grunt names on/off · debug mode (show intents, deltas, prompts).

P4: **easy retry** (default off) and generated enemy names (default off) are global settings; combat difficulty (story / normal / hard) is per campaign (`campaign/set_difficulty`, SYS).

P6: **generated dilemmas** on/off (`dilemmasEnabled`, default on; off = the template's authored block is shown) — SYS › Decisions.

P7a: **analysis tool** on/off (`analyzeEnabled`, default on), **analysis animation** (`analyzeAnimation`: `full` / `short` / `off`, default `full`: 600 ms the first time, 150 ms after) and **hover delay** (`analyzeHoverDelay`, 100–1500 ms, default 250) — SYS › Analysis.

P7: **first-impression τ** (`firstImpressionTau`, 1–30, default 7 days; the decay of presence and image consistency) — SYS › Relationships.

P12: **fragment wording** (`fragmentWording`, default on; the mechanic model puts a Secret Frequency fragment into a broken thought, off = the template fragment) — SYS › Relationships.

P13: **warden judge** (`wardenJudge`, default off; SYS › Relationships): with it on, and a personal expectation of hers, the mechanic model judges whether an out-of-combat order cuts across it before the override roll; the engine maps `minor` / `major` to half / full weight and ignores the call when it fails. The death rule is chosen at setup, not here.

P9: **demand wording** (`demandWording`, default on; the mechanic model puts a soldier's demand into her own words, off = the template text) — SYS › Relationships. The world option `acquaintance` (0–14 days) is a P8 world option.

P8: **minimum confidence** (`intentMinConfidence`, 0–1, default 0.5) now also moves the disposition table: the extraction sanitizer drops events below the lowest level floor + (setting − 0.5), and the engine judges each event per unit against its own level's gain and loss floors moved by the same amount (mirrored into the campaign by `campaign/set_min_confidence`). The world options are fixed at campaign start except the live `bloom_horror` (SYS › World options).

P10: **dithered portraits** (`ditheredPortraits`, default on; SYS › Display) · **readable mode** (`readableMode`, default off; no scanlines, flicker, dithering or glitch, text 17 px) · **reduced motion** (`reducedMotion`, default off; also follows `prefers-reduced-motion`) · **device skin** (`deviceSkin`, default empty = follow the corporation; SYS › Display) · **sound** (`soundVolume` 0–100, default 20; `soundMuted`, default off; `ambientHum`, default off; SYS › Sound).

P10b: **door timer** (`doorTimer`, 0–60 seconds, default 15; 0 = no timer; SYS › Display): how long a knock at the night door waits before it counts as staying silent; it pauses while the commander types, while she answers, while a dialog or the analysis panel is open and while the page is hidden.

P5: **story director** on/off (`directorEnabled`, default on; off = the engine's fallback plans the world), **story beat cooldown** (`beatCooldownDays`, 1–14, default 3) and **expedition recap** (`expeditionRecap`, default on) — SYS › World.

P3b: **memory** is per campaign (`memory.config`, absent = the `normal` preset): presets `short` / `normal` / `long` or `custom` (numbers editable with the edit lock off), **rumor mode** (`plain` / `model`) and **hide old scenes** (0 = off) — SYS › MEMORY, with the fill indicator; **context cap** (`contextTokenCap`) defaults to 1600 on new installs (a stored value stays); budgets `memory_fold` 500 and `rumor_retell` 200.

P14: **model timeout** (`llmTimeoutMs`, 10–600 s, default 120; SYS › Generation; a call that has not answered by then counts as `timeout`) and **automatic retries** (`autoRetry`, 0–2, default 1 = the old behaviour; a refusal is never retried) — the failed-generation list is SYS › GENERATIONS.

Defaults in code: Desire/Bond defects **off**, show raw values **off**, sprite mode **native**, edit lock **on**; P3: intent extraction **per exchange** (min confidence 0.5), scene pacing 30 exchanges, typing 60 chars/s, romance **on**, explicit scenes **off**, romantic initiative **medium**, unit DMs **on**, chronicle compaction **on**. The campaign stores a snapshot of the Desire/Bond setting it was started with (`settings.desireBondDefects`); the engine uses that snapshot, not the global value, when it validates later changes. The edit lock does **not** apply inside the new-campaign wizard (setup is always editable); it does apply to "Re-sync from card" on a running campaign.

## 9. Packages

| # | Pkg | Name | Depends on | Status |
|---|---|---|---|---|
| 1 | P0 | Foundation: toolchain, ST adapter, state & saves, content registries, LLM orchestration, Alius shell | — | implemented |
| 2 | P1 | Campaign setup & character import | P0 | implemented |
| 3 | P2 | Calendar, activities, base & economy | P0, P1 | implemented |
| 4 | P3 | Scenes, relationships, memory, PDA comms | P0–P2 | implemented |
| 5 | P4 | Combat, progression, items | P0, P1 (P2 for workshop) | implemented |
| 6 | P5 | World map, expeditions, missions, director | P0–P4 | implemented |
| 7 | P6 | Dilemmas, disloyalty & the Leash | P0–P5 | implemented |
| 8 | P7a | Analysis tool (contextual explanations) | P0–P6 | implemented |
| 9 | P7 | Commander profile & traits | P0–P6 | implemented |
| 10 | P8 | World options & disposition | P0–P7 | implemented |
| 11 | P9 | Impunity, discipline, demands, reputation | P0–P8 | implemented |
| 12 | P10 | Visual upgrade (hub, device skins, voices) | P0–P6 | implemented |
| 13 | P11 | Prologue & onboarding | P7, P8, P10 | implemented |
| 14 | P9d | Desire & bonds (bond profile, opt-in content categories, lead, Want, relationship rules) | P3, P9 | implemented |
| 15 | P9b | Squad power structure (voting, hierarchy/leader, outside perception, scapegoat) | P8, P9, P9d | implemented |
| 16 | P9e | "Her call" (a soldier acts on her own in the field; a bad turn marks the run for the P9b scapegoat) | P5, P6, P9, P9b, P9d | implemented |
| 17 | P9c | Personal pressure (device access levels, bookings, tokens, squad secrets, wagers) | P9b, P9d, P10 | implemented |
| 18 | P3b | Memory (remembered events, rumors, dossier folding, journal/chronicle/DM recap in the prompt, memory budget and presets, MEMORY view) | P3, P7a, P4–P9c | implemented |
| 19 | P10b | Intimate immersion UI (telemetry, living DMs, night door, handwriting, device marks) | P10, P9c, P9d | implemented |
| 20 | P12 | Special traits: Secret Frequency, Bloom-induced Paranoia, Web of Debts | P5, P6, P7, P9 | implemented |
| 21 | P13 | LEASHSWAP mode | P0, P5, P6, P7, P9, P9b, P9d, P11, P12 | implemented |
| 22 | P14 | Generation envelope (retry of failed generations, refusal detection, reroll; every call site wrapped) — last package of 0.1.0 | P0, every package with a call site | implemented |
| 23 | P11b | Head start: begin as if the commander had been at the base for a week / two weeks / a month (acquaintance only: `metDay` shifted, first impressions developed, crime knowledge, a model-written recap of the first weeks as facts and a chronicle entry; world time does not move) | P1, P3, P3b, P7, P8, P11, P14 | implemented |
| 24 | P14b | Character development: development layer over card and profile, appraisal of events from her viewpoint (with misreading), rule accumulators + model review bounded by card anchors, quiet development moments, habits and skills, the "since joining" prompt block | P1, P3, P3b, P7, P8, P9d, P14 | implemented |
| 25 | P10c | Scene backdrops: the author's location, quarters, floor, ceiling, sky and frame art; full-bleed scene background with pan and slot light; 14 room styles chosen in the dossier (plan `docs/plans/2026-11-20-p10c-scene-backdrops.md` is its spec) | P10, P10b | implemented |
| 26 | P10d | Base plan: the hub as a top-down plan of the outpost from data (`planRooms`): two floors and the roofs, named cabins, closed rooms for later, HTML labels, clickable stairs, light by slot; groundwork for 0.2 (door graph, affordances, persons, plan marks, cabin style) (plan `docs/plans/2026-11-20-p10d-base-plan.md` is its spec) | P10, P10b, P10c | implemented |

The table is in implementation order: take the first row whose status is not `implemented`. Why this order, and the session chunks for P7a onward: `ROADMAP-next.md`.

"Implemented" = automated tests pass; the in-SillyTavern checklists `MANUAL_TEST_P*.md` are run by the project owner. Specs of implemented packages are **historical**: the code is the source of truth where they differ. An implemented package's spec ends with an **Implemented as** section (or a status line) listing where the code differs from the original draft: the code wins. Work not yet started has plans only in `docs/plans/` when someone wrote one; if none exists, write it first (see `CLAUDE.md`).

Each package must leave the extension in a runnable state and ship with tests for its engine parts. A package may add content to `content/core` but must not change another package's public engine interfaces without updating that package's spec.

### Post-release (0.2)

Packages after release 0.1.0 (the table above). Same rule: take the first row whose status is not `implemented`, and only once the table above is done. Direction in 0.2: a soldier holds authority over the commander; the mirrored direction is a later package. P15a is the foundation (blocking, moments, contact physics) and serves every close relation, not only holders; the 2026-11-19 depth review added a **Depth revision** section to P15–P17e.

| # | Pkg | Name | Depends on | Status |
|---|---|---|---|---|
| 1 | P15a | Scene blocking, moments and contact physics: per-person blocking (posture, anchor, contact, worn, activity), moments with option frames, output channels, contact physics with her rhythm and the commander's endurance, categories `worship`, `breath_play`, `bodily_fluids`, `watersports`, local content packs | P3, P3b, P7, P9c, P9d, P10, P10b, P14 | spec |
| 2 | P15 | The dynamic: practice profile, hold, frames, domains (incl. command), milestones and the vow, holder setup, squad perception, exit and aftermaths, Leash block, compromat | P3, P9, P9b, P9c, P9d, P13, P14 | spec |
| 3 | P16 | Practices: generated tasks, her discipline of the commander, demonstrations, service, denial, holding (restraint incl. sensory), the commander's initiative | P15, P14, P9, P9c, P9d, P10 | spec |
| 4 | P17 | Staged scenes (roles, visibility, condition, Strain, live visitors, her tactics, complicity) and the obscured presence layer | P16, P15, P14, P3, P9c, P10 | spec |
| 5 | P17a | Dynamic foundations: attitudes between the women involved, contracts (hard dominants and the obsessive style), privileges, inspections, nights | P15, P16, P17, P9c | spec |
| 6 | P17b | Hard practices: categories `deprivation`, `pet_play`, `objectification`, `coercion`; speech control, shock collar, cage, gratitude and begging, service and humiliation built from real state and memory | P17a, P15–P17, P3b | spec |
| 7 | P17c | Immersion: gag and gestures, dictation, passcodes, her voice in the UI, permissions, session rituals, status effects, scene staging with the existing art, optional backdrops / props / pose shots, map marks, quiet runs | P17b, P10, P10b, P9c | spec |
| 8 | P17d | Senses and voice: the sensory layer (room, events, scene call, her replies), her scent (arrives before her, clings, can be noticed, washing), whispers only the player sees, interruptions (display only), her rhythm and distance, "she thinks" | P17c, P17, P9d, P3 | spec |
| 9 | P17e | The living dynamic: secret tests, emergent rituals, her weakness, the drawn signature, the chosen address, "what do you feel?" | P14b, P15–P17d | spec |

### Post-release (0.3) — the AI story sandbox

After the authored prologue (spine beats 1–5) the model builds story arcs from seeds and campaign history; the engine validates them and owns every number. Built on a fully implemented 0.1 (P3b memory, P14 envelope) and 0.2.

| # | Pkg | Name | Depends on | Status |
|---|---|---|---|---|
| 1 | P18 | Story arcs: ~50 seeds, twists, tags, sizes, hooks, outcomes and failure, cast, clearance tiers 4–5, stall and fallback nets, arc preview and author's notes | 0.1, P15 | spec |
| 2 | P19 | Arc missions: verbs, modifiers with conditions, storyboards, clues and local flags | P18, P5, P6 | spec |
| 3 | P20 | Story nodes: six resolution engines, ~20 node kinds as data, conversations inside runs (cast under own names), the field camp | P19, P3, P4, P5 | spec |

### Post-release (0.4) — progression and combat

| # | Pkg | Name | Depends on | Status |
|---|---|---|---|---|
| 1 | P21 | Combat vocabulary: damage/armour types, break, telegraphs, positions, tempo, heat, Bloom load, Edge, resonance | P4, 0.1–0.3 | spec |
| 2 | P22 | Enemies (~40), bosses (arc climaxes, hunts, clock threats), nemeses | P21, P18–P20, P5 | spec |
| 3 | P23 | Skill trees with choices, passive web, specialisations with her preference, respec, levels to 60, overdrive levels | P21, P4, P18, P15 | spec |
| 4 | P24 | Skill modifiers, augments (with consent), uniques, sets, weapon mastery | P21, P23, P4 | spec |
| 5 | P25 | Signature growth, cross-training, the holder and builds, the commander's command tree | P23, P24, P21, P15 | spec |
| 6 | P26 | Depth runs: the endless Garden | P22, P23, P24, P20 | spec |

## 10. Roadmap beyond v1

**Marks (special statuses)** — a relationship layer that lives *in parallel* with relationship states and arises only from extreme, usually irreversible choices or events. A unit can be `lover` and `limiter_torn` at the same time. Each mark: `{ id, origin (dilemma/defect arc/event ids), prerequisites, effects (combat, relationship modifiers, Leash rules, directives), reversible: bool, visibleToSquad: bool }`. Ideas to develop: **Neural Sync** (commander's and her neurons linked: shared stress, she acts on his intent without CP, his injuries hurt her); **Limiter Torn** (commander ripped out her limiter: huge power, the Leash no longer works on her, loyalty is now purely personal); **Blood Debt** (she owes him her life, or he owes her); **Shared Strain** (infected each other with the Bloom; mutation clocks linked); **Ghost Copy** (an echo of the commander lives in her implant); **Branded** (corporation marked her as defective-beyond-use: hunted). The `Relation.marks[]` field is reserved in v1 so this lands without a save migration.

**Immersion ideas for later** (from the 0.2 design talk): her photos in DMs (pose shots and backdrops reused as pictures with captions; compromat as a gallery), a squad group chat generated from memory (the holder can mute the commander), a wake-up card after each night (where the commander woke and her first line), a living hub (a line about what happens in a room on hover; light under her door at night).

**Character interaction ideas beyond 0.2** (from the 0.2 design talk; not scheduled): a nickname she gives the commander (renamed in her DMs and on the PDA header), marks that last days and are seen by others (`pain_rough`), provocations (`jealousy_games`: flirting in front of the commander, lending the commander to another), marks of ownership (`body_modification`: a plyx ring, her unit number), categories `voyeurism`, `implant_play` (the Leash or the implant in intimacy), `sharing`, aftercare as a post-scene phase, the obscured presence layer in missions (voices behind a wall), and the mirrored direction of P15–P17 (the commander holds).

**Hub map as SVG (done as P10d, a top-down plan rather than a cross-section):** instead of a generated `hub/base.png`, a styled SVG/CSS cross-section of the outpost drawn from `hubRooms` data (walls, floors, stairs, ground hatching, a sky band by slot, lit windows at night, alarm, occupancy), so a new room draws itself and nothing is regenerated. The room backgrounds are eye-level, not cutaway, so they are not used inside it. A mock-up comes first, then a plan. P10c also ships two corridor pictures (`place_corridor_1/2`) for the corridor place below.

**From the 0.2 depth review (2026-11-19), not scheduled:**
- **Affordances for every room and new places** (0.2.1 or instead of 0.3, together with the backdrop generation work): affordances `thin_walls`, `loud`, `dark`, `water`, `mirror`, `cramped`, `table_under`, `straps`, `window`, `her_things`, `shared`; places shower block, storage, laundry, briefing room, corridor, field tent; their furniture-bound anchors (`under_table`, `in_shower`, `on_windowsill`, `in_vehicle`, …). 0.2 reads only the affordances already in P17 §2.
- **Interrogation** as a general mechanic (a holder questioning the commander, a corporation questioning anyone): typed answers checked for consistency against memory facts; not tied to 0.2.
- **Gifts** as a separate mechanic for every relation (loot offered instead of sold, her taste, a place for them in her quarters).
- **Lore note (author):** biopunk. The soldiers' enhancements are in the head and under the skin; to the eye and to the touch they cannot be told from a human, though an ordinary human loses to them in a fight. Visible metal augmentations are the exception, not the rule.

**Mission mechanics beyond 0.3** (textual in 0.3): `escort` (a protected NPC in combat), `hold` (waves), `survive` (a round goal), `capture_alive` (non-lethal takedowns).

**Special traits beyond P12** — `former_off_spec`, `bound_elsewhere`, `voice_synth` (on P7's trait framework). The **LEASHSWAP mode** (P13) replaces the earlier `collared` idea.

**Bloom update** — a mutation slot on units (type, stage 1–4, visibility, self-attitude); progression clocks; treatment; infection, the commander included; the mark **Shared Strain**; the defect Latent Strain moves onto these rails. Art cost: visible stages need new sprite packs, so limit the visible stages or keep the changes off-sprite.

Action/real-time combat (shelved) · permadeath mode · module system for third-party content packs (declarative first; third-party JS only with an explicit trust model) · heavy wounds / limb loss module · NPC↔NPC relationships inside the squad · bosses & special enemies · more starting points (other corporations, non-corporate starts) · auto-generated backgrounds · outfit variants for sprites · deeper multi-romance support.

## 11. Agent working rules

- Read this file, the target package spec, and only the content files that package lists.
- Verify every SillyTavern API you use against the current ST source; isolate it in `src/st/`.
- Engine code is pure and covered by vitest; LLM code is tested with recorded fixtures (valid, truncated, invalid, hostile outputs).
- Never let a failed LLM call corrupt state. Never apply an unvalidated intent.
- Content text from `content/*.md` drafts goes into JSON as data; do not inline it in code.
- **Memory check.** Every package that adds an engine event, a decision, a consequence or state the squad could remember decides it in its plan: a `memoryRules` entry with a resolver (audience, spread, importance), or one line saying why not (a site that already writes a fact, a squad secret, bookkeeping); a new relation event gets an `eventDeltas[].journal` phrase, a new chronicle line an `audience`. See `packages/P3b-memory.md`.
- **No pronoun for the commander** in any text the player or the main model reads (UI, glossary, descriptions, prompts, lorebook, directives); the soldiers are women ("she"). Rules and reasons: `content/lore.md` §0. `tests/content/pronouns.test.ts` guards the content.
- License: MIT for code; content drafts (lore, art) are the author's and may be released under CC BY 4.0.
