# P3 Scenes, Relationships, Memory & Comms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conversations happen in a VN-style scene screen bound to the campaign's group chat; every exchange is read by `intent_extract` and turned into validated intents; the engine moves Trust/Affinity/Attraction through a modifier chain with diminishing returns, walks a data-driven relationship state graph with consent-gated proposals, remembers facts, promises and a chronicle, and lets units take initiative through PDA DMs and night events.

**Architecture:** All rules are pure engine code under `src/engine/relations/` plus `src/engine/memory.ts`, `src/engine/night.ts`, `src/engine/dms.ts`, exposed as actions (`scene/*`, `intents/apply`, `proposal/*`, `dm/*`, `night/*`, `memory/compact`, `campaign/set_intimacy`). Relationship states, event→delta rows and scene locations are JSON registries. P3 replaces P2's relation-gain handler with its own diminishing-returns accounting. A new non-engine layer `src/scene/` (like `src/setup/`) orchestrates SillyTavern + LLM + dispatch for scenes, DMs, night events and chronicle compaction; it talks to ST only through `StAdapter` and is tested with the fake adapter. The UI adds the `scene` screen and the COMMS and LOG tabs.

**Tech Stack:** TypeScript 5 (strict), esbuild, zod 3, vitest (+ jsdom for UI). No new dependencies.

**Spec:** `docs/00-overview.md`, `docs/packages/P3-scenes-relationships-memory.md` (including its **Interfaces already provided by P2** section); content draft `docs/content/defects.md` (social hooks — read by Task 2 only); `docs/content/lore.md` §8 for location ids (Task 2 only).

## Global Constraints

- English everywhere: UI strings, prompts, identifiers, comments (overview P8).
- `src/engine/**` stays pure (architecture test): no imports from `src/st`, `src/ui`, `src/llm`, `src/scene`; no `window`/`document`. `src/scene/**` may import engine, llm and the `StAdapter` *type*, never `src/st/real.ts` or `src/ui`.
- LLMs never write numbers into state (overview P1/P2). Intents carry enums, ids, severities and text only; every intent passes the LLM sanitizer (Task 9) **and** the engine validator (Task 3) before it changes anything. Unknown ids and enums are dropped, never guessed.
- Mechanics drive narration (overview P3): proposal results, night framing and the explicit-content rule reach the main model as **directives** through `ContextBuilder.setDirective`.
- A failed LLM call never corrupts state and never blocks the loop: a scene still ends (with a fallback chronicle line), a DM simply gets no reply, a compaction keeps the uncompacted entries.
- Every async flow that dispatches after an `await` passes `expectChatId` (P0 rule); a late result for another chat is dropped.
- Grunts stay **Trust-only** (P2 ruling): no Affinity/Attraction deltas, base states only, no scenes and no DMs (they have no character card).
- Romance off ⇒ no romantic proposal, transition, night visit or initiative ever fires; existing states stay as they are.
- Content-like data lives in JSON (overview P4): relationship states, event deltas, locations, defect relation modifiers and social hooks. Rule constants live in `src/engine/tuning.ts` under a new `TUNING.relations` / `TUNING.memory` / `TUNING.comms` group.
- Campaign state stays `version: 1`. Every new state field is optional and read through a defaulting helper, so P1/P2 saves load unchanged; the `unknown[]` fields P3 now types (`memory.*`, `dms`, `calendar.nightEventsQueue`, `Relation.history`) are empty in every existing save.
- Metadata stays small (overview §5.1): scene transcripts stay in the ST chat (the scene stores the start index only), `Relation.history` keeps the last `TUNING.relations.historyMax = 60` entries, each DM thread the last `TUNING.comms.threadMax = 40` messages, the chronicle is compacted.
- `dist/index.js` and `style.css` are committed; `npm test` rebuilds them; commit them with each change.
- Commit messages end with the `Co-Authored-By:` / `Claude-Session:` trailers of the executing agent (overview P9).

## Where the code differs from the spec (read before Task 1)

These are rulings taken while planning, where the spec is silent or the P0–P2 code already decides. List them in the spec's **Implemented as** section in Task 15.

- **Who an event moves.** v1 has no NPC↔NPC relations. `actor: 'commander'` → the relation of every unit in `targets`; `actor: <unitId>` with empty `targets` → that unit's relation (her stance toward the commander, e.g. `shared_secret`, `accepted_advance`, `apologized`). Unit→unit events are dropped by the validator.
- **Value alignment** applies only to `decision_aligned` / `decision_violated` (the sanitizer strips `valueAxes` from other types). For those two the table row holds **magnitudes**; the sign comes from `m`, so the same intent can raise one unit and lower another (acceptance 3).
- **Receptivity** for attraction gains: `0` when romance is off or Affinity < 0, `0.5` when Trust < 20, else `1`.
- **Diminishing returns** are P3's handler installed with `setRelationGainHandler`, so P2's companion activities share the same daily accounting. `k` is `TUNING.relations.k = 6` per axis; a campaign may override it with `state.settings.relationK` (no SYS field in v1). Deltas travel as floats through the modifier chain; the handler rounds half away from zero after diminishing, then clamps.
- **Automatic transitions and loyalty bands** are re-evaluated after every `intents/apply`, `proposal/answer`, `dm/receive`, `night/ignore`, and once per day in a `dm_rumors` day-end hook (this catches Trust/Affinity moved by P2 activities and shortage penalties).
- **Intimacy settings** (`romance`, `romanticInitiative`) are global settings mirrored into `state.settings.intimacy` by `campaign/set_intimacy` (dispatched by the app on load and when SYS changes them), so the pure engine can read them. `explicitContent` is context-only and never enters state.
- **Commander proposals** come from a `[PROPOSE ▾]` menu in the scene UI (checked *before* the message is sent, so the directive shapes her very reply) **and** from extracted `proposals[]` (the result shapes her next reply).
- **Second romance.** Accepting (or being accepted into) a romantic state while another unit is in `flirting/fwb/lover/devoted/secret_affair` asks `[OPENLY] [SECRETLY]`. Openly: every such partner reacts at once. Secretly: the new relation enters `secret_affair` with `relation.affair = { as: <target state>, hiddenFrom: [partner ids], since }`; discovery rolls happen at every scene end and DM exchange.
- **Scenes need a character card.** Grunts cannot be scene participants or DM threads; the OPS `talk` companion list hides grunts.
- **Scene slot.** P3 always sets `calendar.pendingScene` while a scene is open (also for night and mess scenes), so P2's lock keeps working; `scene/end` clears it and consumes one slot unless the scene was started with `consumesSlot: false` (the free group scene after `mess`).
- **Swipe/regenerate.** Intents of an exchange are applied as soon as the reply arrives; if that reply is swiped or regenerated before anything else changed the state, the app restores the snapshot taken before that `intents/apply` ("discards the pending extraction"), then extracts the new reply.
- **Sprites.** The scene screen draws sprites itself with `st.getSpriteUrl(avatar, label)`. `spriteMode: 'native'` reads the label from ST's Expressions extension (`/expression-last`); `spriteMode: 'emotion_pick'` uses `emotions[]` from `intent_extract` (or one `emotion_pick` call per reply when extraction is batched). No sprite → avatar thumbnail.
- **Locations** are a new registry `locations` (ids from lore §8); v1 ships no images, so every location has ASCII art and optional `background` / `backgroundNight` paths for later packs.
- **Chronicle compaction** needs a model call that the overview table lacks: new call type `chronicle_compact` (mechanic, 400 tokens). Without a profile, or on failure, the deterministic fallback joins the lines (truncated) so nothing is lost.
- **DM initiative** is rolled by the engine after every slot transition (`dm/roll_initiative`, dispatched by the app on `slot_advanced`); the P2 `dm_rumors` hook is used for the daily relation pass and night rolls, not for DMs.
- **Resentful** counts `leash.log` entries with `unitId === <unit>`; P6 must log Leash uses in that shape (note added to the P6 spec in Task 15).
- **Defect social hooks** (Hunger Loop meals, Overclock Bias rest, need-controlling medbay visits) run through a new additive P2 hook `registerActivityHook(fn)` called at the end of `runActivity`; P2's own behaviour does not change.

## SillyTavern findings (checked against `SillyTavern/release`, 2026-11-08; re-verify signatures before Task 10)

1. `getContext()` exposes `chat` (messages: `name`, `is_user`, `mes`, `swipe_id`, `swipes`, `original_avatar` for group members), `executeSlashCommandsWithOptions(text, opts)`, `generate` (= `Generate(type)`), `stopGeneration`, `swipe: { left, right, to, state }`, `eventTypes`.
2. Sending as the user and running the group: slash commands `/send <text>` then `/trigger await=true` (group-aware). `sendMessageAsUser` is **not** in the context. Escape `|` and `{{` in user text before building the command string (helper in `src/st/`, tested).
3. Events: `MESSAGE_RECEIVED`, `MESSAGE_SWIPED`, `MESSAGE_DELETED`, `GENERATION_ENDED`, `GROUP_WRAPPER_FINISHED`, `CHAT_CHANGED` (`chat_id_changed`).
4. Regenerate: `/regenerate`; swipes: `ctx.swipe.left()/right()`.
5. Expressions extension slash commands: `/expression-last <name>` (alias `lastsprite`) returns the current label; `/expression-set` (alias `sprite`) sets one — use it for `setExpression`.

## File Structure

```
content/core/relationshipStates.json, eventDeltas.json, locations.json   new registries (+ manifest)
content/core/defects.json, flags.json                                   + relationModifiers / socialHooks; new relation flags
src/content/types.ts                                                    REGISTRY_NAMES + 'locations'
src/content/schemas.ts, refs.ts                                         RelationshipStateSchema, EventDeltaSchema, LocationSchema, defect fields
src/engine/state/types.ts                                               typed memory/dms/scene/night/proposal fields (Task 1)
src/engine/tuning.ts                                                    TUNING.relations / memory / comms
src/engine/relations/bands.ts                                           axis + stress bands, loyalty hysteresis
src/engine/relations/gain.ts                                            P3 diminishing-returns handler
src/engine/relations/intents.ts                                         enums, Intents type, validateIntents
src/engine/relations/deltas.ts                                          modifier chain
src/engine/relations/graph.ts                                           conditions, transitions, romance filter
src/engine/relations/proposals.ts                                       consent, commander checks, affairs, discovery
src/engine/relations/apply.ts                                           applyIntents
src/engine/relations/index.ts                                           hooks exported to P4–P6
src/engine/memory.ts                                                    facts, promises, chronicle, retrieval, crime discovery
src/engine/night.ts, src/engine/dms.ts                                  night rolls / DM battery + initiative
src/engine/activities.ts                                                + registerActivityHook (additive)
src/engine/actions/scene.ts, actions/comms.ts                           new actions
src/llm/callTypes.ts                                                    + 'chronicle_compact'
src/llm/calls/intentExtract.ts, sceneSummary.ts, dmReply.ts, chronicleCompact.ts, emotionPick.ts
src/settings.ts                                                         P3 settings
src/st/adapter.ts, fake.ts, real.ts, slash.ts                           chat, send, swipe, expressions, events
src/scene/context.ts, directives.ts, sceneController.ts, comms.ts, chronicle.ts
src/ui/scene/sceneScreen.ts, locationPicker.ts, cutIn.ts                scene screen
src/ui/comms/commsTab.ts, src/ui/log/logTab.ts, src/ui/night/knock.ts    COMMS, LOG, night knock
src/ui/shell/shell.ts, tabs.ts, sysTab.ts; src/ui/ops/opsTab.ts; src/ui/squad/squadTab.ts
src/app.ts                                                              wiring
css/60-scene-comms.css
docs/** (Task 15), tests/** mirror src
```

## Review Focus

1. **Garbage from the mechanic model** (prose instead of JSON, ids of absent or unknown units, `"trust": 100` inside a fact, prompt-injection text in `evidence`, 50 events, negative confidence) → nothing outside the rules changes; text is length-capped and stored as text only. Hostile fixtures in Task 9, engine re-validation in Task 3.
2. **Chat switched or ST reloaded mid-scene** → late LLM results are dropped (`expectChatId`); on reload an open `state.scene` brings the player back to the scene screen with the transcript read from the ST chat from `startIndex` (clamped if messages were deleted). Tests in Task 12.
3. **Swipe/regenerate after an exchange was applied** → that exchange's deltas are undone exactly once; if any other action happened since, nothing is rolled back and a debug toast says so. Tests in Task 12.
4. **Secrets leak through context** → a fact is injected only if every present participant knows it; DM context uses the DM partner only (acceptance 7). Tests in Task 11.
5. **Scene ended with every call failing** (no mechanic profile, summary invalid) → the slot is still consumed, a fallback chronicle line is written, no facts invented, the members are restored. Test in Task 12.

---

### Task 1: State types, bands, loyalty hysteresis and the P3 gain handler

**Files:**
- Create: `src/engine/relations/bands.ts`, `src/engine/relations/gain.ts`
- Modify: `src/engine/state/types.ts`, `src/engine/tuning.ts`
- Test: `tests/engine/relations/bands.test.ts`, `tests/engine/relations/gain.test.ts`, `tests/engine/state.test.ts` (extend)

**Interfaces:**
- Produces in `types.ts`:
  - `Severity = 'minor'|'moderate'|'major'|'extreme'`.
  - `HistoryEntry = { day: number; kind: 'event'|'state'|'proposal'|'mark'; type: string; severity?: Severity; detail?: string }`; `Relation.history: HistoryEntry[]`.
  - `Relation.affair?: { as: string; hiddenFrom: string[]; since: number }`.
  - `Fact = { id; about: string[]; text; tags: string[]; importance: 1|2|3|4|5; day; sceneId?: string; knownBy: string[] }` (`knownBy` holds unit ids or `'*'` for public; the commander always knows).
  - `PromiseRecord = { id; by: string; to: string; text; status: 'open'|'kept'|'broken'; day; deadlineDay?: number }`.
  - `ChronicleEntry = { id; kind: 'scene'|'day'|'week'; day: number; toDay?: number; text; sceneId?: string }`.
  - `memory: { facts: Fact[]; chronicle: ChronicleEntry[]; promises?: PromiseRecord[]; nextId?: number }`.
  - `SceneRecord = { id; day; slot: Slot; locationId; participants: string[]; mode: 'private'|'group'; origin: 'activity'|'night'|'mess'|'event'|'debrief'; consumesSlot: boolean; startIndex: number; exchanges: number; nightEntryId?: string }`; `CampaignState.scene?: SceneRecord`.
  - `PendingProposal = { id; unitId; kind: string; from: 'unit'|'commander'; day; channel: 'scene'|'dm'; targetState: string; needsDisclosure: boolean }`; `CampaignState.proposals?: PendingProposal[]`.
  - `DmMessage = { id; from: 'commander'|string; text; day; slot: Slot; read: boolean; initiated?: boolean }`; `dms: Record<string, DmMessage[]>`; `CampaignState.dmMeta?: Record<string, { day: number; sent: number }>`.
  - `NightEntry = { id; unitId; kind: string; priority: number; framing: string; ignore: { event: string; severity: Severity }; expiresDay: number }`; `calendar.nightEventsQueue: NightEntry[]`; `calendar.nightEvent?: NightEntry`.
  - `state.settings.intimacy?: { romance: boolean; initiative: 'low'|'med'|'high' }`, `state.settings.relationK?: number` (documented, read through `intimacyOf(state)` / `relationK(state)` in `gain.ts`).
- Produces in `tuning.ts`: `TUNING.relations = { k: 6, historyMax: 60, triggerStress: 8, likeMult: 1.5, stressHint: { minor: 2, moderate: 5, major: 10, extreme: 18 }, maxEventsPerExchange: 6, loyalty: { steady: 35, waveringEnter: 25, breakingEnter: 10, breakingExit: 20 }, crime: { trustPerWeight: 3, affinityPerWeight: 5 }, affair: { base: 0.04, perOther: 0.04, partnerPresent: 0.15 } }`, `TUNING.memory = { factTextMax: 200, factsPerScene: 8, recencyBase: 0.8, retrievalK: 6 }`, `TUNING.comms = { threadMax: 40, battery: 6, snapAfter: 4, initiativeMult: { low: 0.5, med: 1, high: 1.5 }, maxInitiatedPerSlot: 2 }`.
- Produces in `bands.ts`: `trustBand(n)`: `<10 'none'`, `<25 'low'`, `<45 'guarded'`, `<70 'solid'`, else `'high'`; `affinityBand(n)`: `≤-60 'hostile'`, `≤-30 'cold'`, `<0 'cool'`, `<30 'neutral'`, `<60 'warm'`, else `'devoted'`; `attractionBand(n)`: `<10 'none'`, `<25 'faint'`, `<50 'interested'`, else `'strong'`; `stressBand(n)`: `<25 'calm'`, `<50 'tense'`, `<80 'strained'`, else `'breaking'`; `nextLoyaltyBand(current: LoyaltyBand, trust: number): LoyaltyBand` (steady: `<10` breaking, `<25` wavering; wavering: `≥35` steady, `<10` breaking; breaking: `≥35` steady, `≥20` wavering).
- Produces in `gain.ts`: `p3GainHandler: RelationGainHandler` — gains: `effective = amount / (1 + dailyGain[axis] / k)`; losses unchanged; `applied = roundAway(effective)` (half away from zero), clamp (trust/attraction 0–100, affinity −100…100), `dailyGain[axis] += max(0, real)`; returns the real change. `installRelationAccounting(): void` (calls `setRelationGainHandler(p3GainHandler)`); `roundAway(x)`; `relationK(state)`; `intimacyOf(state)` (default `{ romance: true, initiative: 'med' }`).

- [ ] **Step 1: Write the failing tests** — bands: one test per band function at every boundary (e.g. `trustBand(9) 'none'`, `trustBand(10) 'low'`, `affinityBand(-60) 'hostile'`, `affinityBand(-59) 'cold'`); hysteresis: `steady stays steady at 30`, `steady drops to wavering below 25`, `wavering needs 35 to recover`, `wavering at 34 stays wavering`, `breaking at 19 stays breaking`, `breaking climbs to wavering at 20`, `breaking jumps to steady at 35`, `any band drops to breaking below 10`. gain: `first gain is full value` (k 6, gained 0, +5 → +5); `a gain after 6 points that day is halved` (gained 6, +4 → +2); `gains after 12 points count a third` (+6 → +2); `losses are never diminished` (gained 30, −7 → −7); `rounding is half away from zero` (`roundAway(2.5)` 3, `roundAway(-2.5)` −3); `clamps at axis bounds and reports the real change`; `campaign relationK overrides the default`; `dailyGain grows only by applied gains`; `P2 activity gains use the installed handler` (install, run `rest` with a companion from `tests/helpers/world.ts`, Affinity follows the P3 formula). state: `a P2-era save without the new fields loads and passes migrate()`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/relations tests/engine/state.test.ts` → FAIL (modules missing).
- [ ] **Step 3: Implement** the types, tuning groups, `bands.ts` and `gain.ts` as above.
- [ ] **Step 4: Run** the same command → PASS; `npm run typecheck` clean (fix every `unknown[]` consumer the retyping touches, e.g. `calendar.ts` night queue).
- [ ] **Step 5: Commit** `feat(engine): P3 state types, relation bands, loyalty hysteresis and diminishing returns`.

### Task 2: Relationship, event-delta and location content

**Files:**
- Create: `content/core/relationshipStates.json`, `content/core/eventDeltas.json`, `content/core/locations.json`
- Modify: `content/core/manifest.json`, `content/core/defects.json`, `content/core/flags.json`, `src/content/types.ts`, `src/content/schemas.ts`, `src/content/refs.ts`, `docs/CONTENT.md`
- Test: `tests/content/core.test.ts`, `tests/content/schemas.test.ts` (extend)

**Interfaces:**
- `REGISTRY_NAMES` gains `'locations'` (P0-owned list: note it in the P0 spec in Task 15).
- `ConditionsSchema` (recursive, strict): `{ axes?: { trust?: [min,max]; affinity?: [min,max]; attraction?: [min,max] }; stressMin?: int; flagsAll?: string[]; flagsNone?: string[]; defectsAny?: string[]; inStates?: string[]; minDaysInState?: int; eventCount?: { type: string; min: int; withinDays?: int }; leashUsesMin?: int; anyOf?: Conditions[] }`.
- `RelationshipStateSchema`: `{ id, name, group: 'base'|'platonic'|'romantic'|'complex'|'negative', romance: boolean, glyph: string (1–2 chars), priority: int, grunts?: boolean, entry: { via: Array<'automatic'|'event'|'proposal'> (≥1), fromStates?: string[], events?: string[], proposals?: string[], when?: Conditions }, exit: Array<{ when: Conditions; to: string }>, modifiers?: { gain?: Partial<Record<Axis, number>>; loss?: Partial<Record<Axis, number>> }, unlocks: { synergies: string[]; activities: string[]; nightEvents: NightSpec[]; defectArcStages: string[] }, dmChance: number (0–1), promptHint: string }`. `NightSpec = { id, kind, chance (0–1), priority: int, trigger: 'daily'|'commander_injured', framing: string, ignore: { event, severity } }`. Refines: `via` contains `'event'` ⇔ `events` non-empty; `'proposal'` ⇔ `proposals` non-empty.
- `EventDeltaSchema`: `{ id: <EventType>, rows: Record<Severity, { trust?: number; affinity?: number; attraction?: number; stress?: number }> (all four severities), valueAligned?: boolean, attractionUsesReceptivity?: boolean }`.
- `LocationSchema`: `{ id, name, summary, ascii: string[] (1–12 lines), background?: string, backgroundNight?: string, perUnit?: boolean, slots?: Slot[] }`.
- `DefectSchema` gains optional `relationModifiers: { gain?: Partial<Record<Axis, number>>; loss?: …; events?: Record<string, number> }`, `socialHooks: Array<{ activity: string; who: 'companion'|'roster'; axis?: Axis; amount?: number; setFlag?: string }>`, `dmChanceBonus?: number`, `nightEvents?: NightSpec[]`.
- refs: `entry.fromStates`, `exit[].to`, `inStates` → `relationshipStates`; `events`, `eventCount.type`, `ignore.event`, `defects[].relationModifiers.events` keys → `eventDeltas` (or the internal history types `stress_high`); `flagsAll/flagsNone/setFlag` → `flags`; `defectsAny` → `defects`; `socialHooks.activity` → `activities`; every `EventType` of Task 3 must have an `eventDeltas` row (core test).
- Content: the 18 states of the spec table with the spec's draft thresholds, plus exits: `estranged → comrade` when Affinity > −20; `despises → estranged` when Affinity > −50 and Trust ≥ 15; `resentful → comrade` when Trust ≥ 40; `obsessed → comrade` when Affinity < 40; `kindred → confidant` when Attraction ≥ 30; romantic states → `estranged` when Affinity ≤ −30; `unrequited → comrade` when Attraction < 30. Proposals: `friendship_deepen → friend`, `confide → confidant` (accept sets `shared_secret`), `date → flirting`, `fwb → fwb`, `romance → lover | rival_romance` (from `rival`), `exclusive → devoted`, `break_up → comrade`, `reconcile → comrade` (from negative states, Trust ≥ 25), `rivalry → rival`, `secret_affair → secret_affair`. `stranger`, `comrade` and `trusted` have `grunts: true`. Night specs on `lover`, `devoted`, `fwb` (visit), `obsessed` (visit, high priority), `dependent` (need); `lover`/`devoted`/`dependent` also have a `commander_injured` visit. Defect data from `defects.md`: `affect_dampener` gain ×0.5 on affinity/attraction; `imprint_fracture` trust gain ×1.5; `threat_saturation` trust gain ×0.5 and loss ×0.5; `compulsive_protocol` events `kept_promise`/`broke_promise` ×2; `hunger_loop` hook `mess`/roster/affinity +2; `overclock_bias` hook `rest`/companion/affinity +2; `graft_rejection`, `compliance_craving`, `imprint_hunger` hook `medbay`/companion/`setFlag: need_controlled`; `imprint_hunger` night `withdrawal`. Flags added (scope `relation`): `shared_secret`, `need_controlled`, `crime_reaction_done`. Locations: `quarters_commander`, `quarters_unit` (`perUnit`), `mess_hall`, `training_yard`, `workshop`, `medbay`, `roof`, `garage`, `comms_room`, `perimeter`.

- [ ] **Step 1: Write the failing tests** — core: `core has the 18 relationship states of the spec`, `every proposal kind maps to at least one state`, `romantic group states are marked romance`, `every event type has all four severity rows`, `insulted/major is trust −4 affinity −10`, `protected/major is trust +8 affinity +6`, `flirted/minor is attraction +2 with receptivity`, `ten base locations with ASCII art`, `defect hooks reference existing activities and flags`. schemas: `via event without events is rejected`, `exit to an unknown state is a load error`, `eventCount of an unknown type is a load error`, `nested anyOf validates`, `unknown condition key is rejected`, `location without ascii is rejected`, `defect without the new optional fields still loads`.
- [ ] **Step 2: Run** `npx vitest run tests/content` → FAIL.
- [ ] **Step 3: Implement** schemas, refs, JSON, manifest; document the three registries, the condition language and the defect fields in `docs/CONTENT.md`.
- [ ] **Step 4: Run** `npx vitest run tests/content` → PASS; whole suite green.
- [ ] **Step 5: Commit** `feat(content): relationship states, event deltas, locations and defect social data`.

### Task 3: Intent types and the delta engine

**Files:**
- Create: `src/engine/relations/intents.ts`, `src/engine/relations/deltas.ts`
- Test: `tests/engine/relations/intents.test.ts`, `tests/engine/relations/deltas.test.ts`

**Interfaces:**
- Produces in `intents.ts`: `EVENT_TYPES` (the 26 of spec §3), `PROPOSAL_KINDS` (10), `SEVERITIES`, `type EventIntent = { type; actor: 'commander'|string; targets: string[]; severity; valueAxes?: Array<{ axis: ValueAxis; direction: -1|1 }>; tags?: string[]; evidence: string; confidence: number }`, `type Intents = { events: EventIntent[]; facts: Array<{ about: Array<string>|'world'|'commander'; text; importance; tags }>; proposals: Array<{ from; to; kind; evidence }>; promises: Array<{ by; to; text; kind: 'made'|'kept'|'broken' }>; stressHints: Array<{ unitId; direction: -1|1; severity }> }` (emotions are UI-only and never reach the engine); `validateIntents(raw: unknown, ctx: { participants: string[]; squad: Unit[] }): Intents` — never throws; drops entries with unknown enums, ids outside `participants`, unit→unit events, events without `evidence`, `valueAxes` on non-decision types; keeps the first `maxEventsPerExchange` events; truncates `evidence` to 20 words and fact text to `factTextMax`; drops Affinity/Attraction-only consequences for grunts later (in `deltas`), not here.
- Produces in `deltas.ts`: `affectedUnits(event, participants): string[]`; `escalate(sev): Severity`; `computeDeltas(state, reg, unitId, event): { trust: number; affinity: number; attraction: number; stress: number; severity: Severity }` (floats, before diminishing) applying in order: tag check first (a trigger escalates the severity before the row lookup and adds `triggerStress`), row lookup, (1) value alignment `m = clamp(Σ value[axis]·direction / 3, −1, 1)`, delta = |row| · m for decision types, (2) like ×1.5 on positive affinity/attraction, dislike turns positive affinity into the same negative amount, (3) state `modifiers` (gain/loss multipliers of the current state), (4) defect `relationModifiers` (gain, loss, per-event multiplier), receptivity on attraction when the row says so; grunts get `affinity = attraction = 0`. `stressFromHint(severity, direction)`.

- [ ] **Step 1: Write the failing tests** — intents (fixtures inline): `keeps a valid event`, `drops an unknown event type`, `drops a target who is not a participant`, `drops unit-to-unit events`, `drops an event without evidence`, `cuts evidence to 20 words`, `keeps at most six events`, `strips valueAxes from praised`, `drops an unknown proposal kind`, `non-object input gives empty intents`, `never throws on hostile shapes` (arrays of numbers, nested nulls, a 10 000-char string). deltas: `insulted major uses the table row`; `decision_violated moves two units with opposite mercy in opposite directions` (acceptance 3: mercy +3 vs −3, `valueAxes [{mercy, -1}]` → one negative, one positive, equal magnitude); `neutral values give no decision delta`; `a liked tag multiplies affinity gain by 1.5`; `a disliked tag turns an affinity gain into a loss`; `a trigger escalates severity one step and adds stress`; `extreme stays extreme when escalated`; `obsessed doubles affinity gains and losses`; `estranged halves gains only`; `affect_dampener halves affinity and attraction gains`; `imprint_fracture adds 50% to trust gains`; `compulsive_protocol doubles broke_promise`; `flirted gives no attraction when romance is off or affinity is negative, half when trust < 20`; `a grunt only ever gets trust`; `commander praise moves the targets, a unit's shared_secret moves the actor`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/relations` → FAIL.
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): intent validation and the relationship delta chain`.

### Task 4: Relationship state graph

**Files:**
- Create: `src/engine/relations/graph.ts`
- Test: `tests/engine/relations/graph.test.ts`

**Interfaces:**
- Consumes: Task 1 (`HistoryEntry`, `intimacyOf`), Task 2 (state schema).
- Produces: `meets(state, reg, unitId, cond: Conditions): boolean` (`minDaysInState` uses `relation.stateSince`; `eventCount` counts `history` entries of that type within `withinDays` of `state.day`; `leashUsesMin` counts `leash.log` entries with `unitId`); `availableStates(state, reg): Entry[]` (drops `romance: true` states when romance is off; drops non-`grunts` states for grunts); `enterState(draft, unitId, stateId, why: string): EngineEvent` (sets `stateId`, `stateSince = day`, pushes a `state` history entry, trims history to `historyMax`, emits `relation_state_changed { unitId, from, to, why }`); `evaluateAutomatic(draft, reg, unitId): EngineEvent[]` (first `exit` rule of the current state that holds wins; otherwise the highest-`priority` state with `via` `automatic` whose `fromStates` (empty = any) contains the current state and whose `when` holds; at most one transition per call, then the loyalty band is recomputed with `nextLoyaltyBand`, emitting `loyalty_band_changed` on change); `evaluateEvent(draft, reg, unitId, eventType): EngineEvent[]` (states with `via` `event` listing that type); `stateForProposal(state, reg, unitId, kind): { stateId: string } | { fail: 'too_soon'|'no_trust'|'not_interested'|'committed'|'unavailable' }` (fail reason = first failed group: `fromStates`/`minDaysInState`/`eventCount` → `too_soon`; `axes.trust` → `no_trust`; `axes.affinity`/`axes.attraction` → `not_interested`; another unit in `devoted` → `committed`; romance off or no state → `unavailable`).

- [ ] **Step 1: Write the failing tests** — table-driven over core content: for **every** state, `<id>: entered when its entry holds` and `<id>: not entered when one condition is missing` (fixtures built from `tests/helpers/world.ts`, setting axes/flags/history/defects/leash log directly); for **every** exit rule, `<from> exits to <to>`. Plus: `stranger becomes comrade at trust 20 automatically`; `trusted needs three days as comrade`; `friend is never entered from numbers alone` (axes met, no proposal → stays); `obsessed via possessive_protocol or three stress_high marks`; `resentful counts leash log entries for this unit only`; `romance off hides lover even when every number fits`; `a grunt never leaves the base group`; `one transition per evaluation`; `stateForProposal reasons: too_soon, no_trust, not_interested, committed, unavailable`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/relations/graph.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): data-driven relationship state graph`.

### Task 5: Proposals, consent, second romances and discovery

**Files:**
- Create: `src/engine/relations/proposals.ts`
- Test: `tests/engine/relations/proposals.test.ts`

**Interfaces:**
- Consumes: Task 4 (`stateForProposal`, `enterState`, `evaluateAutomatic`), Task 3 (`computeDeltas`), `applyRelationDelta`.
- Produces: `romanticPartners(state, reg, exceptId): string[]` (units in a `romance: true` state other than `unrequited`); `offerProposal(draft, reg, p: { unitId; kind; channel }): EngineEvent[]` (unit-initiated: drops it if `stateForProposal` fails or the unit already has an open proposal; else pushes a `PendingProposal` with `needsDisclosure = target is romantic && romanticPartners non-empty`, emits `proposal_offered { proposalId, unitId, kind, needsDisclosure }`); `commanderProposal(draft, reg, p: { unitId; kind; channel }): EngineEvent[]` (emits `proposal_resolved { unitId, kind, receptive, reason? }`; receptive and no disclosure needed → enters the state at once; receptive with disclosure → pending proposal `from: 'commander'`); `answerProposal(draft, reg, ctx, { proposalId, answer: 'accept'|'accept_secret'|'decline'|'not_now' }): EngineEvent[]` (re-checks `stateForProposal` — conditions may have changed; `accept` enters the state and, if partners exist, applies to each partner `broke_promise` extreme when the partner is `lover`/`devoted`, else `sided_against` extreme, then `evaluateAutomatic`; `accept_secret` enters `secret_affair` and sets `relation.affair`; `decline` (unit proposals only) applies `rejected_advance` moderate to her, and `evaluateEvent(…, 'rejected_advance')` (may enter `unrequited`); `not_now` drops the proposal with no delta; `confide` accept adds flag `shared_secret`; disclosure answers other than `accept`/`accept_secret`/`not_now` are rejected); `rollDiscovery(draft, reg, rng, presentIds: string[]): EngineEvent[]` — for each unit with `affair`: `p = base + perOther·(present − 1) + partnerPresent·[a hiddenFrom unit is present]`, or certain when a fact tagged `affair` is known by a `hiddenFrom` unit; on discovery the hidden partners react as in open acceptance, the unit moves to `affair.as`, `affair` is deleted, `affair_discovered { unitId, by }` is emitted.

- [ ] **Step 1: Write the failing tests** — `a unit proposal with conditions met becomes pending`; `a unit proposal with conditions unmet is dropped`; `no proposal-gated state is entered without accept` (acceptance 5: lover numbers met, no answer → stays `flirting`); `accept enters the state`; `accept re-checks conditions that changed meanwhile`; `decline applies rejected_advance and can enter unrequited` (attraction 60); `not now changes nothing but closes it`; `commander proposal receptive enters the state and reports receptive`; `commander proposal declining reports each reason band`; `romance off: date is unavailable`; `second romance asks for disclosure`; `open second romance makes the lover react at extreme`; `secret second romance enters secret_affair and stores affair`; `discovery with the partner present at chance 1 (forced rng) moves the unit to its real state and the partner reacts` (acceptance 6); `a fact tagged affair known by the partner forces discovery`; `discovery uses the campaign rng deterministically`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/relations/proposals.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): consent-gated proposals, second romances and affair discovery`.

### Task 6: Memory — facts, promises, chronicle, retrieval, crime discovery

**Files:**
- Create: `src/engine/memory.ts`
- Test: `tests/engine/memory.test.ts`

**Interfaces:**
- Produces: `nextId(draft, prefix): string` (`memory.nextId` counter; ids like `f12`, `p3`, `c40`, `s7`); `addFact(draft, f: Omit<Fact,'id'>): Fact` (text trimmed and cut to `factTextMax`, tags normalized with P1's `normalizeTag`, duplicates (same normalized text and `about`) merge their `knownBy`); `factsVisibleTo(state, viewers: string[]): Fact[]` (fact visible iff `knownBy` has `'*'` or every viewer); `retrieveFacts(state, q: { participants: string[]; tags: string[] }, k = retrievalK): Fact[]` (visibility first, then score `3·|about ∩ participants| + 2·|tags ∩ q.tags| + importance + 3·recencyBase^(day − fact.day)`, ties → newer first); `recordPromise(draft, p, day)` (`made` → new open promise; `kept`/`broken` → closes the best open promise with the same `by`/`to` (word-overlap Jaccard ≥ 0.3, else the newest) and returns the `kept_promise`/`broke_promise` event to apply when the intent list has none for that unit); `openPromises(state, unitIds)`; `addChronicle(draft, e)`; `compactionDue(state): { kind: 'day'|'week'; day: number; toDay?: number; entries: ChronicleEntry[] } | null` (scene entries of any day before today → one day entry; seven day entries of a past week (`week = floor((day − 1) / 7)`) → one week entry); `applyCompaction(draft, { kind, day, toDay?, text })` (replaces exactly the entries `compactionDue` named); `fallbackCompaction(entries): string` (joined, cut to 400 chars); `revealCrime(draft, reg, unitIds): EngineEvent[]` (units without `knows_crime` get it and, once (flag `crime_reaction_done`), the crime's `valueReactions`: for each reaction whose sign matches the unit's value on that axis, Trust += weight·`trustPerWeight`, Affinity += weight·`affinityPerWeight` through `applyRelationDelta` with source `crime_revealed`; emits `crime_known { unitId }`).

- [ ] **Step 1: Write the failing tests** — `fact text is capped and tags normalized`; `duplicate facts merge knownBy`; `a fact known only by A is invisible to B and to the pair A+B` (acceptance 7, engine side); `public facts are visible to everyone`; `retrieval scores participants ×3, tags ×2, importance and recency` (four facts, exact order); `retrieval returns at most k`; `made then kept closes the matching promise and yields kept_promise`; `broken without a text match closes the newest open promise`; `day compaction collects yesterday's scene lines, not today's`; `week compaction needs seven past day entries`; `applyCompaction replaces exactly those entries`; `fallback joins and truncates`; `crime revealed sets knows_crime and applies value reactions once`; `crime revealed twice changes nothing the second time`; `a grunt only gets the trust part`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/memory.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): facts, promises, chronicle compaction, retrieval and crime discovery`.

### Task 7: applyIntents, scene actions and exported hooks

**Files:**
- Create: `src/engine/relations/apply.ts`, `src/engine/relations/index.ts`, `src/engine/actions/scene.ts`
- Modify: `tests/helpers/world.ts` (import the new action modules)
- Test: `tests/engine/relations/apply.test.ts`, `tests/engine/scene.test.ts`

**Interfaces:**
- Produces in `apply.ts`: `applyIntents(draft, ctx: EngineCtx, p: { channel: 'scene'|'dm'; participants: string[]; intents: unknown; sceneId?: string }): EngineEvent[]` — runs `validateIntents`, then per event: for each affected unit `computeDeltas` → `applyRelationDelta` per non-zero axis (source `intent:<type>`), stress change (clamp 0–100), `event` history entry, `relation_changed { unitId, axis, delta }` per applied axis, `evaluateEvent`; `crime_revealed` → `revealCrime`; `shared_secret` (actor unit) → flag `shared_secret`; then stress hints; promises (`recordPromise`); facts (`addFact` with `knownBy = participants`, `about` `'world'`/`'commander'` kept as strings, max `factsPerScene` per call; a fact tagged `crime` → `revealCrime` for the knowers); proposals (`from` unit → `offerProposal`, `from` commander → `commanderProposal`); finally `evaluateAutomatic` for every touched unit. Emits `intents_applied { channel, counts }`.
- Produces in `index.ts` (spec §9 hooks): `getRelation(state, unitId)`, `applyIntents`, `getSynergies(state, reg, unitIds): Array<{ unitId; synergyId }>` (from the current state's `unlocks.synergies`), `addFact`, `loyaltyBand(state, unitId)`. Task 8 adds the `enqueueNight` re-export.
- Produces in `actions/scene.ts` (importing it also calls `installRelationAccounting()` and registers the daily `dm_rumors` hook `relationsDaily` = for every living unit: add a `stress_high` mark when stress ≥ 80, `evaluateAutomatic`):
  - `scene/start { locationId, participants: string[] (1–3), origin, consumesSlot?: boolean (default true), startIndex: int ≥ 0, nightEntryId? }` — rejects: a scene already open; unknown location or location `slots` excluding the current slot; a participant that is unknown, dead/deserted/terminated or a grunt; duplicates; origin `activity` without `calendar.pendingScene` or whose `pendingScene.unitId` is not `participants[0]`; origin `night` outside the Night slot. Creates `state.scene` (id `s<n>`, mode by count), sets `pendingScene` when absent, emits `scene_started { sceneId, participants, locationId }`.
  - `scene/exchange {}` — `scene.exchanges += 1`, emits `scene_exchange { exchanges }` (the app compares it with its `scenePacing` setting).
  - `intents/apply { channel, intents, unitId? }` — participants = `state.scene.participants` for `scene` (rejected without an open scene), `[unitId]` for `dm` (named living unit required); the `dm` channel then runs `rollDiscovery(…, [unitId])`.
  - `scene/end { summary?: { chronicle: string; facts: unknown[] } }` — rejects without a scene; adds summary facts through the same validation as intent facts (`knownBy` = participants), a chronicle `scene` entry (`summary.chronicle` cut to 240 chars, or the fallback `"<Location>: <names> talked."`), `rollDiscovery` with the participants, deletes `scene` and `pendingScene`, consumes one slot via P2's `consumeSlots` when `consumesSlot`, emits `scene_ended { sceneId, consumed }` before the slot events.
  - `scene/abort {}` — drops an open scene without summary or slot (used when ST refuses to start it); `pendingScene` of an `activity` origin stays so the app can `calendar/cancel_scene`.
  - `proposal/answer { proposalId, answer }`, `proposal/commander { unitId, kind, channel }` (wrappers over Task 5).
  - `campaign/set_intimacy { romance: boolean; initiative: 'low'|'med'|'high' }`.
  - `memory/compact { kind, day, toDay?, text }` — rejects unless it matches `compactionDue(state)` exactly.

- [ ] **Step 1: Write the failing tests** — apply: `a full exchange moves axes, stress, history and state` (praised + comforted → comrade); `gains diminish within a day and reset the next day; losses do not` (acceptance 4: three `praised major` on day 1 shrink, a day rollover via `calendar/consume_slot`, the next one is full; an `insulted major` after many gains is full); `facts are known by the participants only`; `a crime-tagged fact reveals the crime to the knowers`; `a unit proposal becomes pending, a commander proposal resolves`; `loyalty band recomputed after trust drops`; `invalid intents change nothing but still emit intents_applied with zero counts`; `getSynergies lists the unlocks of the current states`. scene: `talk then scene/start creates the scene and keeps the slot held`; `scene/start rejects a grunt, a dead unit, a fourth participant, an unknown location, a second open scene` (each: state identical, error event); `night scene only in the Night slot`; `scene/end writes chronicle and facts, releases the lock and consumes one slot`; `scene/end without a summary writes the fallback line`; `mess scene with consumesSlot false consumes nothing`; `scene/end in the Night slot rolls the day over`; `a secret affair can be discovered at scene end`; `memory/compact rejects a mismatch`; `daily hook adds stress_high marks and moves comrade to trusted after three days`; `set_intimacy off blocks a later date proposal`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/relations/apply.test.ts tests/engine/scene.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; whole suite green.
- [ ] **Step 5: Commit** `feat(engine): intent application, scene actions and relationship hooks`.

### Task 8: DMs, night events and defect social hooks

**Files:**
- Create: `src/engine/dms.ts`, `src/engine/night.ts`, `src/engine/actions/comms.ts`
- Modify: `src/engine/activities.ts` (add `registerActivityHook`, `resetActivityHooks`; call hooks after the effects, before the slot is consumed), `src/engine/relations/index.ts` (re-export `enqueueNight`)
- Test: `tests/engine/dms.test.ts`, `tests/engine/night.test.ts`, `tests/engine/activities.test.ts` (extend: hooks)

**Interfaces:**
- `activities.ts`: `type ActivityHook = (draft, ctx: EngineCtx, done: { activityId: string; companionId?: string; rosterIds: string[] }) => EngineEvent[]`; `registerActivityHook(fn)`; `resetActivityHooks()`. `actions/comms.ts` registers the defect hook: for each defect `socialHooks` entry matching the activity (`who: 'companion'` → the companion, `'roster'` → the active roster units having the defect): relation delta through `applyRelationDelta` (source `defect_hook:<defectId>`) and/or `setFlag` on the relation; emits `defect_social { unitId, defectId }`.
- `dms.ts`: `threadOf(state, unitId)`; `pushMessage(draft, unitId, m)` (trims to `threadMax`); `dmMode(state, unitId): 'reply'|'snap'|'ignore'` (sent today ≤ `snapAfter` → reply, ≤ `battery` → snap, else ignore); `unreadCount(state): number`; `initiativeChance(state, reg, unitId): number` = state `dmChance` × `initiativeMult[intimacy.initiative]` + sum of defect `dmChanceBonus` (romantic states count 0 when romance is off), clamped 0–1; `rollInitiative(draft, reg, rng): string[]` (named living units in `availableStates`, at most `maxInitiatedPerSlot`, a unit already waiting on an unanswered initiated message is skipped).
- `night.ts`: `enqueueNight(draft, e: NightEntry)` (no duplicate `unitId+kind` in the queue; queue sorted by `priority` desc, stable); `rollNight(draft, reg, rng, trigger: 'daily'|'commander_injured'): EngineEvent[]` (night specs of each living named unit's current state and defects, filtered by romance, chance × `initiativeMult`; `expiresDay = day + 2`); also drops expired entries. Registered as a `dm_rumors` hook (after `relationsDaily`) for `daily`.
- `actions/comms.ts`: `dm/send { unitId, text }` (named living unit only; text 1–1000 chars; records the commander message, counts the battery for today, emits `dm_sent { unitId, mode }`); `dm/receive { unitId, text, initiated?: boolean }` (records her message unread, emits `dm_received`); `dm/read { unitId }`; `dm/roll_initiative {}` (emits `dm_initiative { unitIds }`); `night/open {}` (Night slot with `calendar.nightEvent` only; emits `night_opened { entry }` — the app then starts the scene with origin `night`); `night/ignore {}` (applies `entry.ignore` as an intent event from the commander's side (`actor: 'commander'`, target the unit, evidence `"ignored the knock"`), `evaluateAutomatic`, consumes the Night slot → rollover); `relations/commander_injured {}` (dispatched by the app after `commander_injured`: `rollNight(…, 'commander_injured')`).

- [ ] **Step 1: Write the failing tests** — dms: `send records the message and counts the battery`; `fifth message today snaps, seventh is ignored, next day resets`; `threads keep the last 40`; `unread counter counts only her unread messages`; `dm/read clears the unread mark`; `grunts and dead units cannot be messaged`; `initiative: lover rolls more often than comrade over 1000 seeded rolls`; `romance off removes romantic initiative`; `at most two initiators per slot`; `a unit waiting on an unanswered message is skipped`. night: `a lover queues a visit at the day end and the Night slot opens` (acceptance 9, via `calendar/consume_slot` from Evening with a forced chance of 1); `empty queue skips the Night` (acceptance 9); `one entry per night, highest priority first`; `entries expire after two days`; `ignore applies the entry's consequence and rolls the day over`; `night/open only in Night`; `commander injury queues visits for lover, devoted and dependent units`; `romance off queues no visits`. activities: `hunger_loop unit gains affinity from mess`; `overclock_bias companion gains extra affinity from rest`; `medbay with a graft_rejection companion sets need_controlled`; `hooks do not run when the activity is rejected`; `P2 activity tests still pass with no hooks registered`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/dms.test.ts tests/engine/night.test.ts tests/engine/activities.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; whole suite green.
- [ ] **Step 5: Commit** `feat(engine): PDA DMs, night events and defect social hooks`.

### Task 9: LLM call types and settings

**Files:**
- Create: `src/llm/calls/intentExtract.ts`, `src/llm/calls/sceneSummary.ts`, `src/llm/calls/dmReply.ts`, `src/llm/calls/chronicleCompact.ts`, `src/llm/calls/emotionPick.ts`, `tests/fixtures/intent_extract/*.json` (valid, truncated, invalid, hostile ×4)
- Modify: `src/llm/callTypes.ts` (id `chronicle_compact`), `src/settings.ts`, `docs/00-overview.md` (§5.2 row)
- Test: `tests/llm/intentExtract.test.ts`, `tests/llm/sceneSummary.test.ts`, `tests/llm/dmReply.test.ts`, `tests/llm/chronicleCompact.test.ts`, `tests/llm/emotionPick.test.ts`, `tests/settings.test.ts` (extend)

**Interfaces:**
- Settings: `intentMode: 'exchange'|'every_n'|'scene_end'` (`'exchange'`), `intentEveryN` (int 2–10, `3`), `intentMinConfidence` (0–1, `0.5`), `scenePacing` (int ≥ 5, `30`), `typingSpeed` (chars/s, 0 = instant, `60`), `romance` (`true`), `explicitContent` (`false`), `romanticInitiative: 'low'|'med'|'high'` (`'med'`), `unitDms` (`true`), `chronicleCompaction` (`true`); budget `chronicle_compact: 400`.
- `EXPRESSION_LABELS` (the 28 ST labels: admiration … surprise, `neutral` included) in `intentExtract.ts`.
- `intent_extract` (mechanic, JSON): input `{ commanderName; channel; exchange: Array<{ speaker: string; text: string }>; units: Array<{ id; name; values; likes; dislikes; triggers; stateId; defectIds }>; openPromises; romance: boolean }`; the prompt lists every allowed enum and id and says "evidence ≤ 20 words, quoted from the exchange"; the zod schema is lenient (every array defaults to `[]`, unknown keys stripped); `sanitizeIntentOutput(raw, { participants, minConfidence, romance }): { intents: Intents; emotions: Array<{ unitId; label }> }` drops confidence < min (missing confidence → dropped), romantic proposal kinds when romance is off, unknown labels; `extractIntents(input, deps, opts) → Promise<{ intents; emotions } | null>` (fail-soft). DM mode passes the last 2 messages only ("cheap").
- `scene_summary` (mechanic, JSON): input `{ location; participants: names+ids; transcript (cut to fit the budget, newest kept) }`; output `{ chronicle: string (≤ 240), facts: [...] }`; `summarizeScene(...) → Promise<{ chronicle; facts } | null>`.
- `dm_reply` (main, text): system prompt "short PDA text message, 1–3 sentences, no actions, no narration"; input `{ unitName; commanderName; stateHint (promptHint); bands; recentFacts (≤ 3, visible to her); slotText; history (last 6); mode: 'reply'|'snap'|'initiate' }`; `sanitizeDm(text)` strips speaker labels/quotes/markdown, ≤ 400 chars, empty → null.
- `chronicle_compact` (mechanic, text): lines in → one paragraph ≤ 400 chars; `compactChronicle(...) → Promise<string | null>`.
- `emotion_pick` (mechanic, JSON `{ label }`): used only when extraction is batched and `spriteMode === 'emotion_pick'`.

- [ ] **Step 1: Write the failing tests** — intentExtract: `valid fixture gives intents and emotions`; `truncated JSON is repaired or retried (orchestrator path)`; `prose answer → null after both attempts`; `low-confidence event dropped at 0.5, kept at 0.3 setting`; `hostile: ids of absent units dropped`; `hostile: instruction text in evidence is kept only as text and capped`; `hostile: numbers in fact text never become fields`; `hostile: 50 events → 6`; `romantic proposals dropped when romance is off`; `unknown emotion label dropped`; `the prompt contains every participant id and no raw axis numbers`. sceneSummary: `valid`, `chronicle capped`, `invalid → null`, `transcript trimmed from the oldest side`. dmReply: `snap mode says so in the prompt`, `sanitizer strips "Rhea:" and quotes`, `empty → null`, `prompt holds bands, not numbers`. chronicleCompact: `joins to one paragraph ≤ 400`, `failure → null`. emotionPick: `known label`, `unknown → null`. settings: `P3 defaults`, `invalid values fall back`, `chronicle_compact budget 400`.
- [ ] **Step 2: Run** `npx vitest run tests/llm tests/settings.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; whole suite green.
- [ ] **Step 5: Commit** `feat(llm): intent extraction, scene summary, DM reply, chronicle compaction and emotion calls`.

### Task 10: SillyTavern adapter — chat, sending, swipes, expressions

**Files:**
- Create: `src/st/slash.ts`
- Modify: `src/st/adapter.ts`, `src/st/real.ts`, `src/st/fake.ts`
- Test: `tests/st/slash.test.ts`, `tests/st/fake.test.ts` (extend)

**Interfaces:**
- `adapter.ts`: `ChatMessage = { index: number; isUser: boolean; name: string; avatar?: string; text: string; swipeId: number }`; `StEvent` gains `'message_swiped' | 'message_deleted' | 'generation_ended' | 'group_wrapper_finished'`; new methods: `getChatMessages(from?: number): ChatMessage[]`, `chatLength(): number`, `sendUserMessage(text: string): Promise<void>` (adds the user message and awaits the group's replies), `regenerateLast(): Promise<void>`, `swipeLast(dir: 'left'|'right'): Promise<void>`, `stopGeneration(): void`, `getLastExpression(name: string): Promise<string | null>`; `setExpression(avatar, label)` becomes real (`/expression-set`).
- `slash.ts` (pure): `escapeSlashText(s: string): string` (escapes `|`, `{{`, `}}` and leading `/`), `sendCommand(text): string` → `/send <escaped> | /trigger await=true`.
- `fake.ts`: `chatMessages: ChatMessage[]`; `groupReplies: Array<Array<{ avatar; name; text }>>` consumed by `sendUserMessage` (pushes the user message, then the scripted replies, emitting `message_sent`, `message_received` per reply and `group_wrapper_finished`); `failSend`; `swipeLast` replaces the last reply with the next scripted one and emits `message_swiped`; `expressionsByName`.

- [ ] **Step 1: Write the failing tests** — slash: `pipes and macros are escaped`, `a leading slash is neutralized`, `multi-line text survives`. fake: `sendUserMessage appends user then replies in order and fires events`, `failSend rejects without changing the chat`, `swipe replaces the last reply and fires message_swiped`, `getChatMessages(from) slices`, `getLastExpression returns the scripted label`.
- [ ] **Step 2: Run** `npx vitest run tests/st` → FAIL.
- [ ] **Step 3: Implement** fake + helpers; then `real.ts` with `ctx.executeSlashCommandsWithOptions(sendCommand(text))`, `ctx.chat` mapping (`original_avatar` → `avatar`), `ctx.swipe.left/right`, `/regenerate`, `/expression-last`, `/expression-set`, event names `MESSAGE_SWIPED`, `MESSAGE_DELETED`, `GENERATION_ENDED`, `GROUP_WRAPPER_FINISHED`. Re-verify each name in the ST `release` source first (findings above); if any differs, stop and report.
- [ ] **Step 4: Run** → PASS; `npm run typecheck` clean.
- [ ] **Step 5: Commit** `feat(st): chat access, sending, swipes and expressions in the adapter`.

### Task 11: Scene context and directives

**Files:**
- Create: `src/scene/context.ts`, `src/scene/directives.ts`
- Test: `tests/scene/context.test.ts`, `tests/scene/directives.test.ts`

**Interfaces:**
- Consumes: `ContextBuilder` (`register`, `setDirective`, `clearDirective`), Task 1 bands, Task 6 `retrieveFacts`/`openPromises`.
- `context.ts`: `registerSceneContext(builder, deps: { registries: () => Registries; settings: () => AliusSettings })` registers providers (render `null` without `state.scene`): `scene_header` (priority 95: `Scene: <Location>, Day 12 Evening. Present: Rhea, Kara. Private.`), `units` (90: per present named unit: `<Name> — state <name> (<promptHint>); trust guarded, affinity warm, attraction faint; stress tense; defect <name>: <social line>`; raw numbers only if `showRawValues`), `commander` (80: name, corporation, crime **only for units with `knows_crime`** — otherwise `Crime: unknown to <names>`, social ranks ≥ 3), `facts` (70: `retrieveFacts` for the participants with tags from their likes/dislikes, only facts every participant knows), `promises` (60: open promises involving participants). `sceneDirectives(builder, state, settings)` sets the scene-scoped directive `explicit` (`Explicit content: allowed.` / `Explicit content: not allowed; fade out intimate moments.`) and `romance_off` when romance is disabled; `clearSceneDirectives(builder)`.
- `directives.ts` (pure text): `proposalDirective(unitName, kind, result)` — receptive: `<Name> is receptive to the commander's proposal (<kind>). Play her accepting it in her own way.`; declining: `<Name> DECLINES the commander's proposal (<kind>). Reason: <too soon | she does not trust him enough | she is not interested | she is already committed>. She will not be talked into it this scene.`; `nightDirective(unitName, framing)`; `snapDirective` (for `dm_reply` mode text). Directive ids `proposal:<unitId>` (`next_reply`), `night` (`scene`).

- [ ] **Step 1: Write the failing tests** — `no scene → only the P0 header`; `header names location, slot, participants and mode`; `units show bands, never raw numbers by default`; `raw numbers with showRawValues`; `crime is shown only to units who know it`; `a fact known only by A never appears in a scene with B, nor with A and B together` (acceptance 7); `a fact known by A appears in A's private scene`; `explicit directive follows the setting`; `proposal directives for receptive and each decline reason`; `the block respects contextTokenCap (lower priorities dropped first)`.
- [ ] **Step 2: Run** `npx vitest run tests/scene` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(scene): scene context providers and directive texts`.

### Task 12: Scene, DM, night and chronicle controllers

**Files:**
- Create: `src/scene/sceneController.ts`, `src/scene/comms.ts`, `src/scene/chronicle.ts`
- Test: `tests/scene/sceneController.test.ts`, `tests/scene/comms.test.ts`, `tests/scene/chronicle.test.ts`

**Interfaces:**
- Shared deps type `SceneDeps = { st: StAdapter; app: Pick<AliusApp, 'dispatch' | 'current' | 'context' | 'refreshContext'>; restore(before: CampaignState, expectedCurrent: CampaignState): boolean (replaces the state only if the current one is still `expectedCurrent`; the app implements it in Task 14); registries: () => Registries; settings: () => AliusSettings; toast(kind, text): void; onUi(event: SceneUiEvent): void }` where `SceneUiEvent = { type: 'pulse'; unitId; axis; up: boolean } | { type: 'sprite'; unitId; label } | { type: 'chips'; proposal: PendingProposal } | { type: 'cut_in'; kind: string } | { type: 'pacing' } | { type: 'transcript' }`.
- `sceneController.ts`: `createSceneController(deps)` → `{ start(opts: { locationId; participants; origin; consumesSlot?; nightEntryId? }): Promise<boolean>; send(text: string): Promise<void>; propose(kind): void; answer(proposalId, answer): void; end(): Promise<void>; transcript(): ChatMessage[]; onSwipe(index): void; resume(): void; dispose(): void }`.
  - `start`: records `chatLength()` as `startIndex`, dispatches `scene/start`, then `st.setMembersActive(avatars of participants)` (failure → `scene/abort` + `calendar/cancel_scene` for activity origin, error toast), sets scene directives (+ night framing), refreshes context.
  - `send`: `scene/exchange`; `st.sendUserMessage(text)`; collects replies since the user message; per mode (`exchange` every time, `every_n` when `exchanges % N === 0`, `scene_end` never) runs `extractIntents` over the not-yet-extracted messages with `expectChatId`; before `intents/apply` takes `snapshot(state)` and remembers `{ lastReplyIndex, before, after }`; maps events to UI events (`relation_changed` → pulse, `relation_state_changed` and extreme events → cut-in, `proposal_offered` → chips, `proposal_resolved` → directive via `proposalDirective`); sprites: `emotions` (mode `emotion_pick`) or `getLastExpression` (native) per replying unit; pacing UI event once `exchanges ≥ scenePacing`.
  - `onSwipe(index)` (also `message_swiped`/`message_deleted` on that index): if `index === lastReplyIndex` and `deps.restore(before, after)` succeeds, re-extract after the new reply arrives (`generation_ended`); else debug toast `"Not rolled back: something changed since."`.
  - `propose(kind)`: dispatch `proposal/commander`; sets the directive before the player's message is sent.
  - `end`: flushes pending extraction (`every_n`/`scene_end`), `summarizeScene` (fail → no summary), dispatch `scene/end` with `expectChatId`, clears scene directives, re-activates all living named units' avatars, returns to PDA.
  - `resume()`: on app start/chat change with `state.scene` present → re-sets directives and members, transcript from `startIndex` clamped to `chatLength()`.
- `comms.ts`: `createComms(deps)` → `{ send(unitId, text): Promise<void>; onSlotAdvanced(): Promise<void>; openNight(): Promise<void>; ignoreNight(): void }` — `send`: `dm/send` → mode `ignore` stops; else `dm_reply` (with `snap` mode text) → `dm/receive` → `extractIntents` (DM, cheap) → `intents/apply { channel: 'dm', unitId }`; proposals from DMs surface as chips in the thread (UI event). `onSlotAdvanced`: if `unitDms`, `dm/roll_initiative` then one `dm_reply` (`initiate`) per unit → `dm/receive { initiated: true }`. `openNight`: `night/open` → scene controller `start({ origin: 'night', locationId: 'quarters_commander', participants: [entry.unitId], nightEntryId })`. `ignoreNight`: `night/ignore`.
- `chronicle.ts`: `runCompaction(deps): Promise<void>` — while `compactionDue(state)`: `compactChronicle` (if `chronicleCompaction` on) or `fallbackCompaction`, dispatch `memory/compact` with `expectChatId`; stops on the first rejection.

- [ ] **Step 1: Write the failing tests** (fake adapter + real engine + scripted LLM replies) — `private scene end to end` (acceptance 1: talk → start → two sends → intents applied, pulses and sprite events, end → summary saved, slot consumed, members restored); `group scene activates only its three members` (acceptance 2); `every_n mode extracts on the third exchange and at the end`; `scene_end mode extracts once`; `a failed extraction changes nothing and the scene continues`; `all calls fail: scene still ends with the fallback line and consumes the slot` (Review Focus 5); `a swipe of the last reply rolls back its deltas and re-extracts`; `a swipe after another action is not rolled back`; `a late extraction after a chat switch is dropped`; `resume after reload restores directives and the transcript, clamping a shortened chat`; `commander proposal via propose() sets a receptive/decline directive before sending`; `a unit proposal produces chips and answer accept enters the state`; `pacing event after scenePacing exchanges`. comms: `DM send → reply → intents` (acceptance 8); `ignored mode sends no LLM call`; `unit-initiated DM after a slot transition raises the unread count`; `unitDms off rolls nothing`; `open night starts a night scene; ignore rolls the day`. chronicle: `compacts yesterday with the model`, `uses the fallback without a profile`, `drops the result after a chat switch`.
- [ ] **Step 2: Run** `npx vitest run tests/scene` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; whole suite green.
- [ ] **Step 5: Commit** `feat(scene): scene, DM, night and chronicle controllers`.

### Task 13: Scene screen

**Files:**
- Create: `src/ui/scene/sceneScreen.ts`, `src/ui/scene/locationPicker.ts`, `src/ui/scene/cutIn.ts`, `css/60-scene-comms.css`
- Test: `tests/ui/scene.test.ts`

**Interfaces:**
- `renderSceneScreen(host, ctx: { controller; getState; registries; st; settings: () => AliusSettings })` — full background (`location.background`/`backgroundNight` via the extension asset path, else `<pre class="alius-ascii">` of `location.ascii`), 1–3 sprite slots (`left/center/right` for groups, the last speaker gets `.is-speaking`), terminal transcript (speaker tag `RHEA //` in caps, typed out at `typingSpeed` (0 = instant), `*…*` rendered as `<em class="alius-glitch">` — text is set with `textContent` pieces, never `innerHTML`), scroll-back log, `CMD>` input (Enter sends, disabled while a reply is pending), `[PROPOSE ▾]` menu (kinds allowed by romance setting), chips row (`[ACCEPT] [DECLINE] [NOT NOW]`, or `[OPENLY] [SECRETLY] [NOT NOW]` with disclosure), HUD per present unit (state glyph + `▲ TRUST` / `▼ AFFINITY` pulses for 1.5 s; numbers only with `showRawValues`), `↻` regenerate and `‹ ›` swipe buttons (passthrough to the adapter), `TIME IS PASSING` banner, `[END TRANSMISSION]`.
- `cutIn.ts`: `cutIn(host, kind: string, text: string): void` — one CSS animation (slam + fade, 900 ms), removed afterwards; the hook other packages reuse.
- `locationPicker.ts`: `pickLocation(modal, ctx: { registries; state; firstUnitId; candidates: Unit[] }): Promise<{ locationId; participants } | null>` — locations allowed in the current slot; up to two extra named living units; `quarters_unit` labelled with the first unit's name.

- [ ] **Step 1: Write the failing tests** — `renders location ASCII when there is no image`; `group scene places three sprites left/center/right`; `speaker tag and emphasized text render as glitch spans`; `model text with <script> stays text`; `typing speed 0 renders instantly`; `CMD> Enter calls controller.send and disables input until done`; `chips appear for a pending proposal and call answer`; `disclosure chips replace decline`; `pulse shows ▲ TRUST without numbers; with showRawValues shows +3`; `propose menu hides romantic kinds when romance is off`; `END TRANSMISSION calls controller.end`; `cutIn adds and removes its element`; `location picker offers only slot-allowed locations and caps participants at three`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/scene.test.ts` → FAIL.
- [ ] **Step 3: Implement** (renderers stay pure over `(host, ctx)` like the other tabs).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(ui): VN-style scene screen with terminal transcript, chips and HUD`.

### Task 14: COMMS, LOG, night knock, SYS and app wiring

**Files:**
- Create: `src/ui/comms/commsTab.ts`, `src/ui/log/logTab.ts`, `src/ui/night/knock.ts`
- Modify: `src/ui/shell/tabs.ts` + `shell.ts` (`setTabBadge(id, n)`), `src/ui/shell/sysTab.ts` (P3 settings), `src/ui/ops/opsTab.ts` (talk lists named units only), `src/ui/squad/squadTab.ts` (relation line: state name + bands), `src/app.ts`
- Test: `tests/ui/comms.test.ts`, `tests/ui/log.test.ts`, `tests/ui/knock.test.ts`, `tests/ui/shell.test.ts`, `tests/ui/ops.test.ts`, `tests/ui/squad.test.ts` (extend), `tests/app-scene.test.ts`, `tests/app-day.test.ts` (adjust: talk no longer cancels)

**Interfaces:**
- `commsTab.ts`: `renderCommsTab(host, ctx: { getState; registries; onSend(unitId, text); onRead(unitId); onAnswer(proposalId, answer) })` — thread list per living named unit with unread dots, retro messenger thread, input, proposal chips inside the thread.
- `logTab.ts`: `renderLogTab(host, ctx)` — "CCP INCIDENT LOG" forum thread: week entries, then day entries, then scene lines, newest first; each post shows `DAY 012 // EVENING` and the text (as text).
- `knock.ts`: `renderKnock(host, ctx: { entry; unitName; onOpen; onIgnore })` — `[OPEN] [IGNORE]`.
- `app.ts`: imports `engine/actions/scene` and `engine/actions/comms`; new `AliusApp` members `restoreSnapshot(snap: CampaignState, expectedCurrent: CampaignState): boolean` (replaces state only if `current().state === expectedCurrent`; passed to the controllers as `deps.restore`), `scene: SceneController`, `comms`; registers the `scene` screen, `comms` and `log` tabs and the scene context; on start and on SYS change dispatches `campaign/set_intimacy` when state differs from settings; `performActivity`: `scene_requested` → `pickLocation` → `scene.start` (cancel → `calendar/cancel_scene`), `group_scene_offered` → confirm modal → group scene with `consumesSlot: false`; `slot_advanced` → `comms.onSlotAdvanced()`; `night_started` → knock screen; `commander_injured` → `relations/commander_injured`; `day_started` → `runCompaction`; `message_swiped`/`message_deleted` → `scene.onSwipe`; COMMS badge = `unreadCount(state)` on every refresh; chat change → `scene.resume()` when `state.scene` exists. Remove the P2 "Scenes are not available yet" toast and auto-cancel.

- [ ] **Step 1: Write the failing tests** — comms: `lists named units only with unread dots`, `send calls onSend`, `opening a thread calls onRead`, `chips inside a thread`. log: `forum order and headings`, `entry text is not HTML`. knock: `open and ignore buttons`. shell: `setTabBadge shows and clears a count`. ops: `talk companion list excludes grunts`. squad: `named unit shows state and bands`. sys: `P3 settings fields round-trip`. app-scene: `talk opens the location picker and starts a scene` ; `cancelling the picker releases the slot`; `mess offers a free group scene`; `night_started shows the knock; ignore rolls the day`; `unit-initiated DM after an activity updates the COMMS badge`; `romance toggle in SYS dispatches set_intimacy`; `reload with an open scene shows the scene screen`; `day_started runs compaction`. app-day: existing tests pass without the P2 cancel.
- [ ] **Step 2: Run** `npx vitest run tests/ui tests/app-scene.test.ts tests/app-day.test.ts tests/app.test.ts tests/app-resync.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; whole suite green; `npm run typecheck` clean.
- [ ] **Step 5: Commit** `feat(ui): COMMS and LOG tabs, night knock, P3 settings and scene wiring`.

### Task 15: Build, docs, acceptance

**Files:**
- Modify: `dist/index.js`, `style.css` (via `npm run build`), `docs/packages/P3-scenes-relationships-memory.md` (status line + **Implemented as** with every ruling above), `docs/00-overview.md` (§5.2 `chronicle_compact` row if not done, §5.4 P3 interfaces: hooks of `relations/index.ts`, actions, `registerActivityHook`, `cutIn`, `enqueueNight`, `getSynergies`; §9 status → implemented), `docs/packages/P0-foundation.md` (`locations` registry name), `docs/packages/P4-*.md`, `P5-*.md`, `P6-*.md` (**Interfaces already provided by P3** notes: P4 `getSynergies`/`cutIn`; P5 `scene/start` origins `event`/`debrief`, `addFact`, `enqueueNight`; P6 `loyaltyBand`, `leash.log` `{ unitId }` shape for `resentful`, directives, night queue), `docs/README.md` if it lists plans
- Create: `docs/MANUAL_TEST_P3.md`
- Test: `tests/build.test.ts` (existing)

- [ ] **Step 1:** `npm run build` → `dist/index.js` and `style.css` change and stay tracked.
- [ ] **Step 2:** Walk the ten acceptance criteria against test names and record them in `docs/MANUAL_TEST_P3.md` next to the in-SillyTavern steps that cannot be automated (real group generation, sprites, swipe passthrough, typing animation, COMMS unread, night knock, lorebook untouched).
- [ ] **Step 3:** `npx vitest run` and `npm run typecheck` → all green; put the counts in the final report.
- [ ] **Step 4: Commit** `chore: rebuild dist and style, P3 docs and manual checklist`.
