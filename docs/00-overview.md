# Alius — Design Overview

> Working title: **Alius** (Latin: *other, different*). A SillyTavern extension that turns a group chat into a squad-command RPG: relationships first, turn-based combat second, base management as background.
>
> This file is the **always-read** document for any agent working on the project. Package specs (`packages/P0…P6`) describe what to build; this file describes what the thing *is* and the rules no package may break. Content drafts (`content/`) are owned by the author and will be rewritten — never hard-code their text.

---

## 1. Vision

The player is a **convicted commander** put in charge of a penal unit of **defective bio-cybernetic soldiers**. He is far weaker than any of them. He does not fight; he gives orders, makes decisions, and lives with the consequences. His authority is real but not absolute: soldiers obey because of trust, or because of the **Leash** — a corporate override he can request at a steep relational cost.

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
- `src/ui/` — the Alius shell and screens (`shell/` incl. the status header, `setup/` wizard, `squad/`, `ops/` and `base/` tabs). UI renderers are plain functions `(host, ctx)`; they ask the engine (`checkActivity`, `checkUpgrade`, `checkRecruit`) why a button is disabled instead of re-implementing rules.
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
| `intent_extract` | mechanic | Exchange/scene → list of intents | 600 |
| `scene_summary` | mechanic | Scene → facts + chronicle entry | 800 |
| `dilemma_generate` | mechanic | Context + template → dilemma structure | 1000 |
| `director_tick` | mechanic | World digest → mission offers, rumors, thread updates, clock advances, story-beat proposal (P5; the engine validates every id and never reads amounts) | 1200 |
| `flavor` | mechanic | Names/descriptions for generated things (grunts, affixed enemies, items); one `kind` per use | 400 |
| `dm_reply` | main | Short PDA message | 300 |
| `expedition_recap` | main | After-action report lines → narrative recap (P5; optional, setting `expeditionRecap`) | 700 |
| `emotion_pick` | mechanic | Optional sprite emotion classification (when not using native Expressions) | 50 |
| `chronicle_compact` | mechanic | Day/week chronicle lines → one compact entry (P3; without a profile the lines are joined) | 400 |
| `activity_vignette` | main | ≤2-line vignette after a companion activity (P2; can be turned off) | 150 |
| *(scene dialogue)* | main | Normal ST generation with injected context | — (ST settings) |

Every budget is a user setting. Every mechanic call: request JSON → validate → on truncation/invalid JSON, one repair attempt (lenient parser) → one retry with budget ×1.5 → fail soft (no state change, toast in debug mode). Where the provider allows it, reasoning/thinking is disabled or capped for mechanic calls.

### 5.3 Context injection (main model)

Before each main-model generation the adapter injects one compact block:

- Scene header: location, slot, day, participants, mode.
- For each present named unit: relationship state, axis **bands** (not raw numbers), stress band, active defect summary, current directives.
- Commander summary: crime (as known to this unit), corporation, notable social stat ranks.
- Retrieved facts: top-k by relevance (participants, tags, recency, importance).
- World line: 1–3 sentences from active threads/clocks relevant to the scene.
- Directives block, phrased as hard constraints: e.g. `Rhea REFUSES the current order this scene. Reason: you left Unit K-117 behind. She will not comply under persuasion; only the Leash can force her.`

Character card text itself remains SillyTavern's job.

### 5.4 Implemented engine interfaces (P0–P5)

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
| `director/apply { requestId, output, beatCooldownDays? }`, `director/fallback { requestId }`, `director/request { reason: 'scout' }` | P5 | The director's second phase: the engine opens `world.director.pending` (`director_requested`), the app answers it. Validated by `validateDirectorOutput`; an unanswered request is answered by `fallbackOutput` at the next day end. |
| `engine/world` exports (`index.ts`): `applyWorldEffects(draft, ctx, effects, src)`, `advanceClock`, `factionStanding`, `offerMission`, `missionById`, `currentBeat`, `isOpenEnded`, `buildDigest`, `ableParty`, the state types | P5 | What P6 uses: the world-effect vocabulary (`WORLD_EFFECT_TYPES`), clocks, factions, missions, the spine, the digest. |
| `app.expedition` (`plan`, `launch`, `move`, `choose`, `treat`, `fight`, `afterCombat`, `retreat`, `return`, `requestRecap`, `debrief`), `app.director` (`onRequested`), `app.intakeUnit()`, `AppDeps.assetUrl` | P5 | The controllers behind the expedition screen and the director; `intakeUnit` runs the one-unit calibration for a card. |

Events emitted by the day-end pipeline: `director_requested` (P5), `mission_failed` / `mission_expired` / `clock_filled` (P5), `day_end_step`, `upkeep`, `supply_shortage`, `trust_penalty_event`, `unit_recovered`, `facility_upgraded`, `slot_advanced`, `night_started`, `day_started`, `autosave` (the app flushes the saver on it).

## 6. Data model (high level)

```
Campaign {
  version, seed/rngState, day, slot, difficulty, settings snapshot
  commander { name, corporationId, crimeId, socialStats{authority,insight,empathy,cunning} /* ranks 1–5 */, socialPoints?{…} /* P2: points behind the ranks */, injuredUntilDay?, flags[] }
  squad: Unit[]            // named + grunts, active and reserve
  roster: { activeIds[≤4], capacity }   // activeIds = expedition roster; capacity = beds, 6 → 10 via barracks; dead units may linger in activeIds until the next recruit/roster change, use activeRosterUnits()
  relations: { [unitId]: Relation }
  resources { credits, supplies, plyx }
  base { facilities: { [id]: level } /* absent = level 1 */, upgrades?: { facilityId, toLevel, daysLeft }[] }
  inventory: ItemInstance[]   // P4: { uid, itemId, rarity, upgrade, affixes[] }; itemSeq? counts uids
  world { regions{ [id]: { known, lastVisitedDay?, poi? } }, clocks[] /* { id, label, segments, filled, regionId?, visibleToPlayer, filledDay? } */, threads[] /* { id, title, status, flags[{id,description}], relatedUnits, relatedRegions, createdDay } */, factions{standing −100…100}, flags[], spineProgress /* beats completed */, spine?{ proposed?, proposedDay?, lastProposalDay? }, director?{ pending?, lastTickDay?, seq? }, incomingUnits?, lastExpeditionRegionId?, seeded?, startId?, clearanceTier? /* P4 reads, P5 writes: level cap tier 0–3 */ }
  missions { offered[] /* the board */, active[], completed[] /* newest 30 */ }   // Mission: { id, source, templateId, title, brief, regionId, danger, objective, deadlineDay?, rewardsTier, failureEffects, threadId?, spineBeat?, poiId?, scouted?, status, rewards? }
  rumors[] /* newest 20 */, dms: { [unitId]: DmMessage[] }, dmMeta?: { [unitId]: { day, sent } }   // P3: the unit's daily "social battery"
  memory { facts[], chronicle[], promises?[], nextId? }   // P3
  scene?: SceneRecord, proposals?: PendingProposal[]       // P3: the open scene (transcript stays in the ST chat) and open proposals
  calendar { scheduled[], nightEventsQueue[], nightEvent? /* head entry while the Night slot runs */, pendingScene? /* open talk holding its slot */, shortageStreak? }
  leash { authorizationsLeft, refreshDay, log[] }
  expedition?: ExpeditionState   // P5: open run (map, party, formation, carried supplies, pending node, unbanked loot, log, queued relation hints)
  lastExpedition?: ExpeditionReport   // P5: the after-action report (outcome, log, loot, rewards, injuries, deaths, recap?)
  combat?: CombatState        // P4: only combat and rng change while it runs
  lastCombat?: CombatResult   // P4: for P5's recap and debrief
  workshopSession?: { day, opsLeft, companionId? }, enemyNames?: { [enemyId|affixes]: name }   // P4
}

Unit {
  id, kind: 'named'|'grunt', cardRef?, displayName, asciiPortrait?, designation?, bio?   // grunts: `K-117`-style designation, optional generated name/bio
  roleId, level, xp, skillPoints, unlockedNodes[], loadout?: skillId[], breakdown?: { defectId, day }   // P4
  signatureSkill { templateId, name, description }   // template id from the registry; name/description are the unit's own words, numbers stay in the template
  baseStats {hp, atk, def, spd, crit}, currentHp, stress
  defects: DefectInstance[]   // { id, origin?, arc?, lite?, upkeepDay? }; named: 1–2, grunt: 1 (lite: no arc)
  values { pragmatism, autonomy, ingroup, mercy, corporate, sacrifice }  // each −3…+3
  likes[], dislikes[], triggers[]   // tags
  equipment { weapon?, upper?, lower? }
  injuries[], injuryDays?, status: 'active'|'reserve'|'injured'|'deserted'|'dead'|'terminated'
}

Relation {
  trust, affinity, attraction
  stateId, stateSince, history[]   // a new campaign starts every named unit in state `stranger`, stateSince day 1; a grunt starts in `stranger` on its recruit day
  flags[]                // e.g. knows_crime, accepted_defect, promise_open
  dailyGain { trust, affinity, attraction }   // for diminishing returns; zeroed at every day rollover
  loyaltyBand: 'steady'|'wavering'|'breaking'  // with hysteresis; initial value from Trust: <10 breaking, <25 wavering, else steady
  affair?: { as, hiddenFrom[], since }   // P3: a concealed romance until discovered
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

Connection profiles (main, mechanic) · per-call token budgets · intent extraction mode (per exchange / every N / scene end) · sprite mode (native Expressions / mechanic `emotion_pick`) · difficulty (combat difficulty; **easy retry**: rewind lost combat, rewinds not recorded in memory) · show raw values (off: bands only) · mechanics edit lock (on by default: view-only, unlock to edit numbers in UI) · intimacy: romance on/off, explicit scenes allowed on/off (directive to main model; actual content depends on user's model/preset), Desire/Bond defect category on/off, romantic initiative intensity (low/med/high) · UI: phosphor palette (amber/green/white), scanlines, typing animation speed · companion vignettes on/off, generated grunt names on/off · debug mode (show intents, deltas, prompts).

P4: **easy retry** (default off) and generated enemy names (default off) are global settings; combat difficulty (story / normal / hard) is per campaign (`campaign/set_difficulty`, SYS).

P5: **story director** on/off (`directorEnabled`, default on; off = the engine's fallback plans the world), **story beat cooldown** (`beatCooldownDays`, 1–14, default 3) and **expedition recap** (`expeditionRecap`, default on) — SYS › World.

Defaults in code: Desire/Bond defects **off**, show raw values **off**, sprite mode **native**, edit lock **on**; P3: intent extraction **per exchange** (min confidence 0.5), scene pacing 30 exchanges, typing 60 chars/s, romance **on**, explicit scenes **off**, romantic initiative **medium**, unit DMs **on**, chronicle compaction **on**. The campaign stores a snapshot of the Desire/Bond setting it was started with (`settings.desireBondDefects`); the engine uses that snapshot, not the global value, when it validates later changes. The edit lock does **not** apply inside the new-campaign wizard (setup is always editable); it does apply to "Re-sync from card" on a running campaign.

## 9. Packages

| Pkg | Name | Depends on | Status |
|---|---|---|---|
| P0 | Foundation: toolchain, ST adapter, state & saves, content registries, LLM orchestration, Alius shell | — | implemented |
| P1 | Campaign setup & character import | P0 | implemented |
| P2 | Calendar, activities, base & economy | P0, P1 | implemented |
| P3 | Scenes, relationships, memory, PDA comms | P0–P2 | implemented |
| P4 | Combat, progression, items | P0, P1 (P2 for workshop) | implemented |
| P5 | World map, expeditions, missions, director | P0–P4 | implemented |
| P6 | Dilemmas, disloyalty & the Leash | P0–P5 | not started |

"Implemented" = automated tests pass; the in-SillyTavern checklists `MANUAL_TEST_P*.md` are run by the project owner. An implemented package's spec ends with an **Implemented as** section (or a status line) listing where the code differs from the original draft: the code wins. Work not yet started has plans only in `docs/plans/` when someone wrote one; if none exists, write it first (see `CLAUDE.md`).

Each package must leave the extension in a runnable state and ship with tests for its engine parts. A package may add content to `content/core` but must not change another package's public engine interfaces without updating that package's spec.

## 10. Roadmap beyond v1

**Marks (special statuses)** — a relationship layer that lives *in parallel* with relationship states and arises only from extreme, usually irreversible choices or events. A unit can be `lover` and `limiter_torn` at the same time. Each mark: `{ id, origin (dilemma/defect arc/event ids), prerequisites, effects (combat, relationship modifiers, Leash rules, directives), reversible: bool, visibleToSquad: bool }`. Ideas to develop: **Neural Sync** (commander's and her neurons linked: shared stress, she acts on his intent without CP, his injuries hurt her); **Limiter Torn** (commander ripped out her limiter: huge power, the Leash no longer works on her, loyalty is now purely personal); **Blood Debt** (she owes him her life, or he owes her); **Shared Strain** (infected each other with the Bloom; mutation clocks linked); **Ghost Copy** (an echo of the commander lives in her implant); **Branded** (corporation marked her as defective-beyond-use: hunted). The `Relation.marks[]` field is reserved in v1 so this lands without a save migration.

Action/real-time combat (shelved) · permadeath mode · module system for third-party content packs (declarative first; third-party JS only with an explicit trust model) · heavy wounds / limb loss module · NPC↔NPC relationships inside the squad · bosses & special enemies · more starting points (other corporations, non-corporate starts) · auto-generated backgrounds · outfit variants for sprites · deeper multi-romance support.

## 11. Agent working rules

- Read this file, the target package spec, and only the content files that package lists.
- Verify every SillyTavern API you use against the current ST source; isolate it in `src/st/`.
- Engine code is pure and covered by vitest; LLM code is tested with recorded fixtures (valid, truncated, invalid, hostile outputs).
- Never let a failed LLM call corrupt state. Never apply an unvalidated intent.
- Content text from `content/*.md` drafts goes into JSON as data; do not inline it in code.
- License: MIT for code; content drafts (lore, art) are the author's and may be released under CC BY 4.0.
