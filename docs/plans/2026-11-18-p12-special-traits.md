# P12 Special Traits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three special commander traits, each a campaign premise:
- **Secret Frequency** (`secret_frequency`): the commander overhears fragments of the squad's hidden state, some true and some distorted. Using them gives the commander away, and discovery ends badly.
- **Bloom-induced Paranoia** (`bloom_paranoia`): real loyalty warnings arrive early as PREMONITIONs, and so do false ones that look exactly the same. Acting on a warning is scored by its truth. Adds Bloom nightmares, commander stress and the `contingency` order.
- **Web of Debts** (`web_of_debts`): a rival corporation's handler visits at night and buys intel. Truthful intel comes back as ambushes, sabotage and standing changes. Discovery comes from two clocks, oversight and the squad.

**Architecture:**
- **Engine.**
  - New folder `src/engine/special/`, with one file per concern:
    - `state.ts`: a leaf (types and tuning only).
    - `traits.ts`: plumbing and seeding.
    - `commanderStress.ts`
    - Frequency: `frequency/{candidates,intercepts,leaks,discovery}.ts`
    - Paranoia: `paranoia/{premonitions,accusations,nightmares}.ts`
    - Debts: `debts/{handler,intel,consequences,discovery}.ts`
    - `dayStep.ts`, `index.ts`
  - Actions live in `src/engine/actions/special.ts` (imported by `app.ts` and by the tests that use them).
  - The `contingency` cover lives in `src/engine/combat/contingency.ts`.
  - The hook points in existing code are named in each task:
    - `actions/scene.ts` (`scene/start`) and `actions/comms.ts` (`dm/receive`, the own-panel night kinds)
    - `relations/apply.ts` (two new event types) and `relations/vocab.ts`
    - `llm/calls/intentExtract.ts` (two conditional inputs)
    - `social.ts` (stress Empathy)
    - `activities.ts` (focus gate, two activity effects)
    - `combat/effects.ts` (`hitCommander`) and `combat/orders.ts` (unlocked orders)
    - `world/expedition.ts` (ambush danger)
    - `loyalty/desertion.ts` and `loyalty/mutiny.ts` (preempt bonuses)
    - `actions/discipline.ts`, `actions/leash.ts` and `actions/base.ts` (acting on a warning)
    - `commander/profile.ts` (validation)
    - `leash/use.ts` (`removeFromService` forgets her P12 records)
- **Data.**
  - New registries:
    - `frequencyFragments`: fallback wording per candidate kind.
    - `premonitionLines`: notice wording per `about`.
    - `debtHandlers`: the handler NPC. AUTHOR TO WRITE.
  - Existing registries gain entries:
    - three traits in `commanderTraits`, the order `contingency` in `orders`, a medbay focus, two dilemma templates, flags, `eventDeltas` rows, glossary entries;
    - a `secretKinds` source `debts`, world-option effect `oversight_scrutiny`, defect fields `frequencySense` and `nightAware`.
  - State:
    - one optional block `CampaignState.special`;
    - the optional field `Commander.stress`;
    - `TUNING.special`.
- **Non-engine layer.**
  - `src/special/{controller,directives,deps}.ts` (`createSpecial` / `app.special`)
  - `src/ui/special/` (FREQ chip, INTERCEPTS log, PREMONITION notice and log, HANDLER panel, DEBTS block, WHAT THIS CHANGES card)
  - `src/analysis/providers/special.ts`
  - `css/80-special.css`
  - a `flavor` kind `frequency_fragment` (setting `fragmentWording`)
- **Chunks.** They follow `docs/ROADMAP-next.md`. Stop at the chunk boundary.
  - **Chunk (a), Tasks 1–6:** special-trait plumbing and Secret Frequency.
  - **Chunk (b), Tasks 7–12:** commander stress and Bloom-induced Paranoia.
  - **Chunk (c), Tasks 13–18:** Web of Debts, then docs and hand-offs.

**Tech Stack:** TypeScript 5 (strict), esbuild, zod 3, vitest (+ jsdom for UI). No new dependencies.

**Spec:** Read these before Task 1:
- `docs/00-overview.md` (§5.4).
- `docs/packages/P12-special-traits.md`.
- The **Implemented as** of:
  - P7 (trait framework, quiet night, modal order, `aria-disabled`, seeded shifts);
  - P9 (leverage, punishments, stance, demands);
  - P9c (squad secrets, `discoverSecret`);
  - P3b (hidden facts, rumors);
  - P6 (signs, desertion, mutiny, confrontation nights);
  - P5 (world effects, expeditions);
  - P10b (night door, own-panel nights);
  - P7a (Knowledge).
- `docs/content/lore.md` §0. The spec calls the commander "he/him/his" ("she senses static around him", "breakdown targeting him", "the commander's crime"). **No text this package writes may do that** (Global Constraints).

## Global Constraints

- **English and safe text.**
  - UI text goes through `h()` / `textContent`, never `innerHTML`.
  - No text a player or the main model reads gives the commander a pronoun (lore §0); `tests/content/pronouns.test.ts` must pass.
  - The soldiers are "she / her".
  - The spec's directive "she senses static around him" becomes `{Name} senses static around the commander.`
  - The dilemma option `protect him` becomes the id **`protect_commander`**.
- **Engine purity.**
  - `src/engine/**` stays pure (`tests/architecture.test.ts`: no host name, no browser globals, comments included).
  - `special/state.ts` imports only types and `tuning`, so `social.ts`, `calendar.ts`, `combat/effects.ts` and `loyalty/*` can read it without a cycle.
- **The engine decides** (overview P1–P3).
  - The engine draws from the campaign rng for: intercepts, distortion, premonitions, false alarms, nightmares, visits, intel effects and discovery rolls.
  - The model only does two things:
    - words a fragment (`flavor` kind `frequency_fragment`);
    - reports two new event types, `knowledge_leak` and `accused`. Each is offered only when the input lists something it can be about (see Rulings).
  - Every number the model returns is ignored.
- **A special trait is read by effect type, never by id** (P7 rule).
  - Five new effect types: `frequency`, `paranoia`, `debts`, `commander_flag`, `unlock_order`.
  - Code asks `hasTraitEffect(state, reg, 'frequency')` and so on.
  - No engine or UI file names `secret_frequency`, `bloom_paranoia` or `web_of_debts`; content files are the only place those ids appear.
  - Defects are read by field (`frequencySense`, `nightAware`), world options by effect type (`oversight_scrutiny`), secret kinds by `source`, dilemma templates by `contexts`, and options by their `id` slug (the P9b `take_blame` precedent).
- **Rng discipline.**
  - With no special trait in the campaign, no new draw happens anywhere and every existing seeded test stays byte-identical.
  - Every P12 roll is behind `hasTraitEffect`. A task whose change moves an existing seeded test **stops and reports** (CLAUDE.md), unless the test enables a special trait on purpose.
  - Exception, by design (Task 7): commander stress exists in every campaign, but it never draws. Its only effects are deterministic.
- **Hidden truth.** The player never reads these off a panel, a toast, an event payload or a reading:
  - whether an intercept was true;
  - suspicion values;
  - whether a premonition was real;
  - the handler's suspicion and pressure;
  - oversight suspicion;
  - who knows about the frequency or the debts before they act on it.

  Events carry ids and kinds, never `true` / `real` / numbers. A `registerKnowledgeRule` hides the related flags and facts. Every one of them is a sentinel in `tests/fixtures/analyze/hidden.ts`. Readings say `An unseen threat` where a clock would be.
- **Old saves.** Every new field is optional and the version stays 1.
  - Absent `special` means nothing intercepted, suspected, foreseen, owed or scheduled.
  - Absent `Commander.stress` = 0.
  - A campaign without a special trait is unaffected (acceptance 5). Task 18 runs a full-suite check of that.
- **Ids.**
  - Directive ids start with `special:` (`special:static:<unitId>`, `special:nightmare`, `special:handler`). Extend `RESERVED` in `tests/power/herCallDirectives.test.ts` with `special:` and check that no P12 id starts with an older reserved prefix.
  - Engine event types (never offered to the model, added to `ENGINE_EVENT_TYPES`, each with an `eventDeltas` row):
    - `frequency_exposed` (the discovery hit);
    - `false_accusation` (acting on a false alarm);
    - `debts_exposed` (a unit finds out).
  - Model-reportable event types (added to `EVENT_TYPES`, each with an `eventDeltas` row): `knowledge_leak`, `accused`.
  - Reserved (emitted) event types, added to `RESERVED_EVENT_TYPES`:
    - Frequency: `frequency_intercept`, `frequency_static`, `frequency_discovered`, `implant_burned`.
    - Paranoia: `premonition`, `premonition_acted`, `bloom_nightmare`, `contingency_set`, `contingency_cover`.
    - Debts: `handler_visit`, `intel_answered`, `handler_threat`, `handler_leak`, `debts_consequence`, `debts_discovered`, `defector_arc`.
    - Commander stress: `commander_stress_changed`.
  - Flags (`flags.json`):
    - commander scope: `commander_bloom_exposed`;
    - relation scope: `knows_frequency` (`leverage: true`), `knows_debts` (`leverage: true`);
    - world scope: `defector_arc`, `defector_double_agent`, `defector_confessed`, `defector_fled`.
  - Glossary ids:
    - `special_trait`, `frequency_intercept`, `frequency_suspicion`, `knowledge_leak`, `burn_implant`;
    - `premonition`, `false_alarm`, `bloom_nightmare`, `commander_stress`, `contingency`;
    - `handler`, `intel_exchange`, `handler_pressure`, `oversight_suspicion`, `defector_arc`;
    - `setting_fragment_wording`.
- **Analysis (overview P12).**
  - Every new stat, chip, option and card carries `data-analyze`.
  - The three new registries join `DESCRIBED_REGISTRIES` / `PLAYER_VISIBLE` where a player sees them (`debtHandlers` yes; `frequencyFragments` and `premonitionLines` are hidden wording and stay out).
  - Live values get providers in `src/analysis/providers/special.ts` that read through `Knowledge`.
- **Drafts.** Every number below is a draft in `TUNING.special`, and every authored text is marked `AUTHOR TO WRITE`. The handler character and the `defector_arc` beats are the author's (spec open decisions).
- **Build output.** `npm test` rebuilds `dist/index.js` and `style.css`; commit both with every task. Baseline before Task 1: **363 files, 6174 tests, all passing** (2026-11-18).

## Where the plan rules on the spec (read before Task 1)

Rulings marked **(user)** were answered by the user on 2026-11-18. Task 18 copies all of them into the spec's **Implemented as**.

### Shared plumbing (§4)
- **Kind.** The spec's renaming note is already true: the trait kind is `special` in data and UI (P7). Acceptance 1 (only one special trait) is already enforced by `validateCommanderSetup` / `traitBlockReason`; Task 1 adds tests for the three new traits.
- **New trait effect types**, added to `TraitEffectSchema` with lines in `summarizeTraitEffect`:
  - `{ type: 'frequency' }`, `{ type: 'paranoia' }`, `{ type: 'debts' }`: switch the systems on.
  - `{ type: 'commander_flag', flag }`: a commander flag set at seed. `bloom_paranoia` uses it for `commander_bloom_exposed`.
  - `{ type: 'unlock_order', orderId }`: the order is offered in combat.
- **`requires`.** `CommanderTraitSchema.requiresSettings` stays as is. A new optional `requires: { otherCorporation: true }` asks for at least one `corporations` entry other than the commander's own.
  - `validateCommanderSetup` and `traitBlockReason` take `opts.corporationId?: string | null`.
  - Without a corporation chosen yet, the trait is allowed. `commander/set_profile` and the wizard's final validation pass the real one.
  - Block reason: `Needs a rival corporation in the world.`
- **Exclusion.** `bloom_paranoia.exclusiveWith = ['insomniac']`, and `insomniac` gets `exclusiveWith: ['bloom_paranoia']` (both sides, as `corporate_polish` does).
- **"What this changes" card.** New optional `commanderTraits[].changes: string[]` (1–8 lines, ≤ 200 chars each, AUTHOR TO WRITE).
  - `renderCommanderFile` shows a `WHAT THIS CHANGES` list under every special card that has `changes`. It is a `<details>` block, open while the card is pressed.
  - P11's file step reuses `renderCommanderFile`, so it gets the card for free.
  - The list carries `analyzeAttrs('commanderTraits:<id>')`.
- **Seeding.** `seedSpecialTraits(draft, ctx)` is idempotent. It is called from `buildCampaign` after `applyFactionTraitEffects`, and from `commander/set_profile` (an old save may pick one at review). It:
  - sets the `commander_flag` flags;
  - creates `special.frequency` / `special.paranoia` / `special.debts` for the effects present;
  - picks the handler (Task 13).

  It never removes anything: the review modal is the only later place traits change, and it runs once.

### Commander stress (user: add it)
- **Field.** `Commander.stress?: number` (0–100; absent = 0).
  - `addCommanderStress(draft, amount, source)` clamps and emits `commander_stress_changed { delta, source }`.
  - Bands come from the unit `stressBand` (calm < 25, tense < 50, strained < 80, breaking).
- **Sources.** Nightmares (Task 10: +15), a false alarm acted on (+5, Task 9), the commander downed in combat (+10).
- **Relief.**
  - −5 a day at day end;
  - −15 with a quiet-night `calendar/sleep`;
  - `medbay` focus `commander` −20 (new activity effect `commander_stress`).
- **Effect** (deterministic, no draw): at ≥ 70, `socialRank(state, 'empathy')` is 1 lower (floor 1).
  - It stacks with P7's sleepless penalty.
  - `socialRank` reads `state.commander.stress` directly, because it has no registry (P7's mirror rule).
- **Visibility.**
  - A band chip `STRESS: <band>` on the CMDR card (`data-analyze="glossary:commander_stress"`), with a provider that shows the band and, with raw values on, the number.
  - The ledger records `res:cmdr_stress`.
  - Every campaign has the stat; with no special trait only combat and sleep move it.
- P13's `pain_burst` reuses `addCommanderStress` (hand-off note in Task 18).

### Secret Frequency (§1)
- **When it rolls.**
  - At `scene/start`, once per present named living unit.
  - At `dm/receive` from her, at most once per unit per day: `special.frequency.dmDay[unitId] = day`, at half rate.
  - Nothing is rolled once the implant is burned (`frequency.burnedDay`) or while the unit already knows (`knows_frequency`).
- **Chance.** `pCatch = clamp(0.25 + (private ? 0.10 : 0) − (stress ≥ 80 ? 0.10 : 0), 0, 1)`, ×0.5 for a DM.
  - A scene is private when it has one participant.
- **Candidates** (`candidateTruths(state, reg, unitId)`). A closed vocabulary of kinds, read from live state, in this order:
  1. `stance`: her `commandStance`.
  2. `impunity`: her `impunityBand`.
  3. `demand`: her open demand (`discipline.demands`, `status: 'open'`).
  4. `loyalty`: a pending desertion or mutiny warning (her `disloyalty` record has signs about `desertion`/`mutiny`).
  5. `fact`: a fact `about` her whose `knownBy` lacks `'*'` and the commander (`hiddenFromCommander`), newest first.
  6. `attraction`: her `attractionBand`.
  7. `refusal`: a planned refusal. Her `rawRefusalChance(state, reg, id) ≥ 0.25`, or a held defiance of hers in `discipline.defiance`.
  8. `secret`: a kept P9c squad secret she is in `knownBy` of.

  One draw picks a kind uniformly among those present, then the item.
- **Distortion.** `pDistort = 0.25 + (stress ≥ 50 ? 0.15 : 0)`; one draw.
  - A distorted intercept replaces the value with a plausible false one: another band or stance from the same closed list (one draw), or for `fact` / `demand` / `secret` / `loyalty` a negation (`none`).
  - A distorted `secret` never discovers anything.
- **Partial.** One more draw at `0.3`: the fragment names only the subject (`partial: true`, the template's `subjectOnly` line).
- **Stored.** `special.frequency.intercepts[]` (newest 40): `{ id, unitId, day, kind, value, true: boolean, partial, sceneId?, text? }`.
  - `true` never leaves the engine (Knowledge rule).
  - `text` is the worded fragment, written later by `frequency/word { id, text }`. Cleaned: ≤ 160 chars, no digit check needed.
- **P9c (user).** An undistorted `secret` intercept calls `discoverSecret(draft, ctx, secretId, 'frequency')`. The P9c card then opens and confirms the fragment. This is the one place truth is confirmed. The INTERCEPTS log still never marks it.
- **Wording (user).** `flavor` kind `frequency_fragment` (≤ 40 tokens, fragment style, may trail off), behind setting `fragmentWording` (default on).
  - Fallback: `frequencyFragments` entries `{ id, kind, lines: string[], subjectOnly: string[] }` with `{name}` and `{value}`, picked by `fnv1a(interceptId)` (no rng).
  - A model answer with a digit, a pronoun for the commander or > 160 chars falls back.
- **UI.**
  - Scene chip `FREQ ▸ "<text>" (unverified)` (`data-analyze="glossary:frequency_intercept"`), newest per present unit.
  - INTERCEPTS log in the CMDR dossier: day, name, text, always suffixed `(unverified)`.
- **Leaks.**
  - `intent_extract` gets `intercepted: [{ id, unitId, gist }]`, only when the frequency effect is on and there is an unburned intercept about a present unit from the last 14 days that is not public.
    - `gist` is the kind and value in words, true or false (the model never learns which).
    - "Public": a `fact` the commander now knows, a `demand` already delivered.
  - New event type `knowledge_leak`: actor `commander`, targets `[the present unit who would notice]`, `itemId` (an id from INTERCEPTED), severity.
    - It is offered only when `intercepted` is non-empty, like the P9d rule types.
    - `validateIntents` drops an `itemId` not in the list.
  - `applyIntents` → `frequencyLeak(draft, ctx, unitId, itemId, severity)`:
    - suspicion += 15 / 25 / 35 for minor / moderate / major (extreme = major);
    - ×0.5 for a false item (her puzzlement still counts, so suspicion does not betray truth);
    - × her defects' `frequencySense` (new optional defect field, a number 1…2; `echo_bleed` and `sensor_ghosting` set 1.5).
  - Stored in `special.frequency.suspicion[unitId]` and capped at 100.
  - Decay: −2 a day.
  - Above 50 with `frequencySense > 1`, a derived directive `special:static:<unitId>`: `{Name} senses static around the commander.` Its event `frequency_static` fires once per crossing.
- **Discovery at 100** (`frequencyDiscovered(draft, ctx, unitId)`):
  - she gets relation flag `knows_frequency`;
  - she gets `frequency_exposed` at `extreme`;
  - one hidden-from-commander fact `{Name} knows the commander hears thoughts.`: `knownBy [her]`, `spread: 'fast'`, `pinned`, tag `frequency`, its id stored as `frequency.factId`;
  - event `frequency_discovered { unitId }`.

  The commander is told: she confronts. Event, toast and a cut-in, wording AUTHOR TO WRITE.
  - **Spread.** The P12 day step, after P3b's rumor spread, syncs: every named living unit now in that fact's `knownBy` without `knows_frequency` gets the flag and `frequency_exposed` (extreme). Deterministic, no draw.
  - The `knows_frequency` flag is P9 leverage (+5 Impunity), with no extra code.
- **Burn the implant.**
  - `medbay` focus `burn_implant` (label `Burn out the frequency implant`). New optional `focus[].requires: { traitEffect: string }`: `checkActivity` refuses without that effect, and refuses with `The implant is already burned.` once burned.
  - Activity effect `burn_frequency_implant` (when focus `burn_implant`) sets `frequency.burnedDay` and emits `implant_burned`. One-way: the UI asks for a confirm.
  - Afterwards there are no intercepts, no leaks are offered, and suspicion still decays.
  - Discovery after burning is softened: `frequency_exposed` at `major` instead of `extreme`, plus `decision_aligned` (minor) for units whose `triggers` include `lies`. That is the honesty tag P7 already uses; there is no honesty value axis.

### Bloom-induced Paranoia (§2)
- **Premonitions are real precursors (user).** The paranoia day step runs on `director_tick` after P6's loyalty step. It writes a real premonition `{ id, unitId, about, day, real: true, expiresDay: day + 3 }` when the engine can already see a warning coming within `leadDays` (1–2, by `fnv1a(unitId|day) % 2 + 1`, no draw):
  - `doubt`: `disloyalty` record `nextDoubtDay − day ∈ [1, leadDays]`.
  - `desertion`: band `wavering`, Trust within 5 of the breaking threshold, and Trust lower than 2 days ago (ledger `axis:<id>:trust`).
  - `mutiny`: `mayMutiny` holds and her mutiny signs are one short of `mutinyRules().minSigns`, or a `mutinyTrigger` exists.
  - `defiance`: her stance is not `open_defiance`, `commandStance` with Impunity + 10 would be, and her Impunity rose over the last 2 days.

  At most one open premonition per unit; a real one replaces a false one. Event `premonition { unitId, about }`.
- **False alarms.** For each named living unit with no open premonition, one draw at `pFalse = max(0, 0.08 − 0.02 × (Insight − 1)) + (nightmare last night ? 0.05 : 0)`. A hit draws `about` uniformly from the four kinds and stores `real: false`. It looks identical in every UI and event.
- **Notice.**
  - The `premonitionLines` registry (`{ id, about, lines }`, `{name}`) is read by `fnv1a(premonitionId)`.
  - Toast voice `terminal`, title `PREMONITION`.
  - A PREMONITIONS list in the CMDR dossier (open ones, newest first, the last 14 days).
- **Acting on a warning** (`actOnWarning(draft, ctx, unitId, act)`, acts `accused | punished | leash | removed`). It acts only on an open premonition about her; otherwise nothing extra happens.
  - `accused`: new model event type `accused` (actor commander, target her), offered only when the paranoia effect is on and a present unit has an open premonition.
  - `punished`: `discipline/punish` on her.
  - `leash`: `leash/compel | suppress` on her (terminate removes her anyway).
  - `removed`: `roster/set_active` that drops her from `activeIds`, or `discipline/punish` with `benched`.

  **Real:** the premonition closes `acted: 'preempted'` and `preempt` is stored `{ unitId, untilDay: day + 5, about }`:
  - `doubt` / `desertion`: `talkDown` gets +0.15 chance and her `nextCheckDay` is pushed to `day + 3`.
  - `mutiny`: one draw at `0.5`; a hit clears her mutiny signs ("averted").
  - `defiance`: `addRecord(−6, 'preempt')`.

  **False:**
  - `accused` → `false_accusation` at `extreme` (an insult);
  - `punished` / `leash` / `removed` → `coerced` at `extreme` on top of the act's own deltas;
  - commander stress +5.

  Either way, event `premonition_acted { unitId, act }` (no `real`). The player learns the truth only from the consequences, as the spec wants.
- **Nightmares.** Paranoia day step: one draw at `0.12` (×1.5 when commander stress ≥ 50).
  - A hit: commander stress +15, `paranoia.lastNightmareDay = day`, event `bloom_nightmare` (toast at the next morning).
  - One draw at `0.5` sets `calendar.loseMorning` (P7's exhaustion path).
  - One draw at `0.35`: the named living unit with the highest Affinity ≥ 30 (ties: squad order) comes to the door. A normal knock `nightmare_heard` (priority 4, framing `{name} heard the commander through the wall.`, ignore `dismissed` minor), queued for tonight; this step runs before `night_check`.
  - The family `bloom_nightmare` is the event type and its text lines (Bloom imagery, `TUNING.special.paranoia.nightmare.lines`, AUTHOR TO WRITE).
- **`contingency`** (`orders` entry: cost 2, target `ally`, new field `requiresUnlock: true`, effect `{ type: 'contingency' }`).
  - `checkOrder` refuses an order with `requiresUnlock` unless a `unlock_order` effect names it. It also refuses a second one in the same combat (`cs.contingency` set).
  - The effect sets `cs.contingency = { cid, used: false }`.
  - In `hitCommander`, before the cover check: if the attacker is a **turning unit** and the contingency is unused and its unit stands, log `contingency_cover`, mark it used and deal the hit to it (no dodge). A turning unit is an enemy-side combatant with a `unitId` (a mutineer), or a squad-side combatant in breakdown.
  - The UI greys `contingency` (`aria-disabled`) when unavailable.

### Web of Debts (§3)
- **Handler.** The `debtHandlers` registry: `{ id, name, description, corporations?: string[] /* empty = any */, lines: { greet, threat, cut, leak } }`.
  - At seed: the first corporation that is not the commander's, in registry order, then a handler that serves it, by `fnv1a(campaign seed)`. Stored in `special.debts = { corporationId, handlerId, ... }`.
  - The lorebook gets `debts_handler` (keyword: handler name placeholder; AUTHOR TO WRITE).
  - A context line `special:handler` appears only in scenes where a unit with `knows_debts` is present.
- **Visits.**
  - Debts day step: if the last visit was ≥ 5 days ago and not yesterday, one draw at `min(1, (daysSince − 4) / 4)`, so about weekly.
  - A hit queues an **own-panel** night entry, kind `HANDLER_VISIT_KIND = 'handler_visit'`, `unitId: HANDLER_UNIT = '@handler'` (matches no unit), priority 6.
  - **Own-panel nights.** New leaf `OWN_PANEL_KINDS = [...CONFRONTATION_KINDS, HANDLER_VISIT_KIND]` and `isOwnPanelNight(entry)` in `special/state.ts`:
    - `night/open`, `night/ignore` and `night/door_*` refuse it, like a confrontation;
    - `tonightItems` labels it `A visitor at the gate.`;
    - `app.ts`'s `confrontationNight` opens the HANDLER panel for it;
    - `leash/use.ts` filters by real unit ids only (no change needed).
  - An unanswered visit at the night's end counts as all `withhold`.
- **Intel** (`intelOf(state, reg)` → up to 5 items, newest first). Kinds:
  - `mission_done`: completed missions of the last 7 days.
  - `base`: a facility upgrade in progress, or the newest level gained.
  - `spine`: a spine beat completed since the last visit.
  - `squad`: a named unit's role and defect.
  - `plan`: an offered or active mission on the board.

  Each item: `{ id, kind, refId, label }`. Item ids are stable (`kind:refId`), and an item answered once is not offered again.
- **Answer** (`debts/answer_visit { visitId, answers: Record<itemId, 'truth'|'partial'|'false'|'withhold'> }`), one dispatch for the whole visit.
  - **Payment:** per `truth` 3 supplies + 20 credits; `partial` half (rounded down); `false` the full price; every 3rd truthful item adds 1 plyx; a visit with ≥ 2 truths posts a rumor.
  - **`false`** raises `handlerSuspicion` by 15, but only when found out: the item's consequence date passes with nothing to show, which is decided by one draw at `0.5` then.
  - **`withhold`** raises `handlerPressure` by 10; each truth lowers it by 5.
  - **Escalation by `handlerPressure` / `handlerSuspicion`** (max of the two):
    - ≥ 40: threat line (event `handler_threat`);
    - ≥ 60: payment halved;
    - ≥ 85: **leak**. `revealCrime` to every named living unit; `knows_debts` for all; a public fact; `oversightSuspicion` +25; `debts.ended = 'leaked'`; no more visits.
- **Consequences** (`debts.scheduled[]`: `{ id, itemId, kind, dueDay, strength: 1 | 0.5, refId }`, due in 2–5 days by one draw). By intel kind:
  - `plan` → an **ambush exposure** on the mission's region for 10 days. A run there gets `ExpeditionState.ambushed = 2` (strength 1) or `1` (0.5): its next combats get danger +1 and the log line `They were waiting for you.`
  - `base` → **sabotage**. An upgrade in progress gets +2 days (+1 at strength 0.5); otherwise −10 supplies.
  - `mission_done` / `spine` / `squad` → world effects: rival `faction` +10×strength, own `faction` −5×strength.
  - `false` items schedule nothing.
  - Each consequence that lands (event `debts_consequence { kind }`) adds to `oversightSuspicion` (0–100): `10 × strength × (1 − 0.1 × (Cunning − 1)) × Π oversight_scrutiny mult`.
  - New world-option effect type `oversight_scrutiny { mult }`: `lenient` 0.75, `brutal` 1.5.
- **Discovery by oversight** at `oversightSuspicion ≥ 100`: the fixed dilemma, context `debts_oversight`, scale `defining`, opened like the scapegoat (queued while another dilemma is open). Options by id:
  - `double_agent`: visits continue, both suspicions reset to 30, flag `defector_double_agent`.
  - `confess`: own standing −20, `leash_weekly` −1 for 14 days (a world `leash` effect), `revealCrime` to all, `debts.ended = 'confessed'`, flag `defector_confessed`.
  - `flee`: own standing −40, own faction hostile, rival +20, `debts.ended = 'fled'`, flag `defector_fled`.

  Every option also sets `defector_arc` and opens thread `defector_arc` (world `thread` effect, AUTHOR TO WRITE placeholder beats). Event `defector_arc { outcome }`.
- **Discovery by a unit.** On a visit night (when the visit is answered or lapses), each eligible watcher draws once at `0.15 × (1 + 0.5 × nightAware)`. Eligible: a named living unit that is not confined elsewhere and has a defect with `nightAware: true` (new defect field; `threat_saturation` sets it) or stress ≥ 60.
  - The first hit gets `knows_debts` (leverage), `debts_exposed` (moderate) and event `debts_discovered { unitId }`.
  - It opens the fixed dilemma, context `debts_unit` (scale `major`, subject = her). Options by id:
    - `report`: `oversightSuspicion` +40.
    - `protect_commander`: `addSecret` of the `secretKinds` entry with `source: 'debts'`, `knownBy [her]` (P9c: now a squad secret kept from oversight; it can still be discovered by the P9c routes).
    - `demand`: `openDemand(draft, ctx, unitId, { owed: true })`, a demand for her silence.
  - At most one unit discovery per visit.

## Review Focus

1. **A campaign with no special trait plays byte-identical to today.** Every roll is behind `hasTraitEffect`, and commander stress never draws. Test in Task 18 (`no special trait: a seeded week of day ends, scenes, DMs and a combat is identical`), plus Task 7 for the one deterministic change.
2. **Truth leaking through a side door:** an event payload, a toast, an analysis reading, the ledger, or a different chip style for a true intercept or a real premonition. Tests in Task 3 (`the FREQ chip and the INTERCEPTS log render the same for a true and a false intercept`) and Task 12 (`a real and a false premonition give identical events, toasts and DOM`), plus hidden sentinels (Tasks 6, 12, 17).
3. **A unit that leaves service** (death, desertion, Terminate) while holding P12 records: an intercept, suspicion, an open premonition, a contingency cid, a scheduled consequence about her, an open `debts_unit` dilemma. `removeFromService` calls `forgetSpecial(draft, unitId)`, and nothing throws or opens later for her. Test in Task 5 (`a terminated unit leaves no frequency, paranoia or debts record`).
4. **Chat switched while a fragment is being worded** (`flavor` in flight): the answer must be dispatched with `expectChatId` and dropped for another chat. Test in Task 3 (`a late fragment for another chat is dropped`).
5. **Handler visit while a confrontation or a scene is open, or during an expedition**:
   - the visit waits in the queue behind a higher-priority confrontation;
   - it is never opened by `night/open`;
   - a night that ends with it unanswered counts as all-withhold, with no crash.

   Test in Task 14 (`an unanswered visit lapses as withhold at the night's end`).

---

## Chunk (a): plumbing and Secret Frequency

### Task 1: Special-trait plumbing, the three trait entries and WHAT THIS CHANGES

**Files:**
- Create: `src/engine/special/state.ts`, `src/engine/special/traits.ts`, `src/engine/special/index.ts`
- Modify: `src/content/schemas.ts` (`TraitEffectSchema` +5 types, `CommanderTraitSchema.requires`, `.changes`), `src/engine/commander/profile.ts` (`validateCommanderSetup`, `traitBlockReason` opts), `src/setup/wizard.ts`, `src/setup/commander.ts`, `src/engine/actions/commander.ts`, `src/engine/setup.ts`, `src/engine/state/types.ts` (`CampaignState.special?`), `src/engine/tuning.ts` (`TUNING.special`), `src/analysis/effects.ts` (`summarizeTraitEffect`), `src/ui/commander/commanderFile.ts`, `content/core/commanderTraits.json` (3 entries; `insomniac.exclusiveWith`), `content/core/flags.json`, `content/core/glossary.json` (`special_trait`)
- Test: `tests/special/traits.test.ts`, `tests/ui/commanderFileSpecial.test.ts`

**Interfaces:**
- Produces:
  - `type SpecialState = { frequency?: FrequencyState; paranoia?: ParanoiaState; debts?: DebtsState }`: types declared in `state.ts`; the fields are filled by later tasks, empty interfaces now.
  - `specialOf(draft): SpecialState`
  - `seedSpecialTraits(draft: CampaignState, ctx: EngineCtx): EngineEvent[]`
  - `validateCommanderSetup(c, reg, opts: { desireBondDefects: boolean; corporationId?: string | null })`
  - `traitBlockReason(reg, traits, id, opts: { desireBondDefects: boolean; corporationId?: string | null })`
  - `TraitEffect` types `'frequency' | 'paranoia' | 'debts' | 'commander_flag' | 'unlock_order'`
- Trait entries (effects):
  - `secret_frequency`: `[{type:'frequency'}]`
  - `bloom_paranoia`: `[{type:'paranoia'},{type:'commander_flag',flag:'commander_bloom_exposed'},{type:'unlock_order',orderId:'contingency'}]`, `exclusiveWith: ['insomniac']`
  - `web_of_debts`: `[{type:'debts'}]`, `requires: { otherCorporation: true }`
  - All three get `description`, `upside`, `downside` and `changes[]` (AUTHOR TO WRITE, no commander pronoun).

- [x] **Step 1: Write the failing tests**

`tests/special/traits.test.ts`:
- `two special traits are rejected`: `validateCommanderSetup` with special `secret_frequency` plus a second special in `regular` → contains `is not a regular trait`.
- `bloom_paranoia and insomniac exclude each other`: both directions via `traitBlockReason` → `Excluded by …`; `validateCommanderSetup` lists `exclude each other`.
- `web_of_debts needs a rival corporation`: a registry with only the commander's corporation and `corporationId` set → reason `Needs a rival corporation in the world.`; with core corporations → null.
- `seed sets the flag and the state blocks`: build a campaign with `bloom_paranoia` → `commander.flags` contains `commander_bloom_exposed`, `special.paranoia` defined, `special.frequency` undefined; a second `seedSpecialTraits` changes nothing (deep-equal).
- `no special trait: no special block`: `createCampaign` → `state.special === undefined`.
- `schema accepts the new effect types and rejects an unknown orderId at load`: `loadPacks` with `unlock_order` naming a missing order → a `ContentError` naming the path.

`tests/ui/commanderFileSpecial.test.ts`: `a special card shows WHAT THIS CHANGES with every line and data-analyze`.

- [x] **Step 2: Run** `npx vitest run tests/special/traits.test.ts tests/ui/commanderFileSpecial.test.ts` → FAIL (module not found).

- [x] **Step 3: Implement**:
  - the schema types, with a `refs.ts` check for `unlock_order.orderId`;
  - the `requires` check (any `corporations` entry whose id ≠ `corporationId`);
  - the opts threaded through the wizard, `setup/commander.ts` and `commander/set_profile` (pass `draft.commander.corporationId`);
  - `seedSpecialTraits` from `buildCampaign` (after `applyFactionTraitEffects`) and `commander/set_profile`;
  - the card UI (`<details class="alius-trait-changes">`);
  - summary lines: `Secret frequency in the commander's head`, `Bloom-induced paranoia`, `Debts to a rival corporation`, `Sets {flag}`, `Unlocks the order {name}`.

- [x] **Step 4: Run** the two files, then `npm test` → PASS, baseline count + new tests, no seeded test moved.

- [x] **Step 5: Commit** `feat(P12): special-trait plumbing, three trait entries, WHAT THIS CHANGES`

---

### Task 2: Frequency intercepts (engine)

**Files:**
- Create: `src/engine/special/frequency/candidates.ts`, `src/engine/special/frequency/intercepts.ts`
- Modify: `src/engine/special/state.ts` (`FrequencyState`), `src/engine/actions/scene.ts` (`scene/start`), `src/engine/actions/comms.ts` (`dm/receive`), `src/engine/tuning.ts`, `src/content/schemas.ts` (`RESERVED_EVENT_TYPES` + `frequency_intercept`)
- Test: `tests/special/frequencyIntercepts.test.ts`

**Interfaces:**
- Produces:
  - `type CandidateKind = 'stance'|'impunity'|'demand'|'loyalty'|'fact'|'attraction'|'refusal'|'secret'`
  - `candidateTruths(state, reg, unitId): Array<{ kind: CandidateKind; value: string; refId?: string }>`
  - `falseValue(kind, value, rng): string`
  - `catchChance(state, unitId, opts: { private: boolean; dm: boolean }): number`
  - `rollIntercepts(draft, ctx, unitIds: string[], opts: { private: boolean; dm: boolean; sceneId?: string }): EngineEvent[]`
  - `FrequencyState = { intercepts: Intercepted[]; suspicion: Record<string, number>; dmDay: Record<string, number>; burnedDay?: number; factId?: string; staticFired?: string[] }`
  - `Intercepted = { id; unitId; day; kind; value; true: boolean; partial: boolean; refId?; sceneId?; text? }`
  - Event `frequency_intercept { unitId, interceptId }`.
- Consumes: `commandStance`, `impunityOf` / `impunityBand`, `attractionBand`, `rawRefusalChance`, `discoverSecret` (P9c).

- [x] **Step 1: Write the failing tests**
- `catchChance matches the formula`: base 0.25; private 0.35; stress 85 private 0.25; DM halves (0.125).
- `distortion rate`: 2000 seeded rolls on a unit with stress 10 → the share with `true === false` is in [0.22, 0.28]; at stress 60, in [0.37, 0.43].
- `intercept rate over seeds`: 2000 seeded `rollIntercepts` on a private scene → the hit share is in [0.32, 0.38].
- `no trait: no draw`: the rng state before and after `scene/start` is equal without the frequency effect.
- `burned or known: no draw`.
- `a DM rolls once a day`: two `dm/receive` on one day → at most one roll (rng advanced once).
- `an undistorted secret intercept discovers it`: force the candidate list to one kept secret with a seed found by search → `secret.status === 'found'`, `foundRoute === 'frequency'`; with a distorting seed, still `kept`.
- `the event carries no truth`: the `frequency_intercept` keys are exactly `type, unitId, interceptId`.
- `the log keeps 40`.

- [x] **Step 2: Run** `npx vitest run tests/special/frequencyIntercepts.test.ts` → FAIL.

- [x] **Step 3: Implement** per the Rulings. Draw order per unit:
  1. catch;
  2. kind (uniform);
  3. item (uniform within the kind);
  4. distortion;
  5. the false value when distorted;
  6. partial.

  Then hook `scene/start` (after the scene record exists; `private = participants.length === 1`) and `dm/receive` (her message only).

- [x] **Step 4: Run** the file, then `npm test` → PASS; seeded tests unmoved.

- [x] **Step 5: Commit** `feat(P12): Secret Frequency intercepts, distortion and the frequency route for squad secrets`

---

### Task 3: Fragment wording, FREQ chip and INTERCEPTS log

**Files:**
- Create: `content/core/frequencyFragments.json`, `src/special/controller.ts`, `src/special/deps.ts`, `src/ui/special/freqChip.ts`, `src/ui/special/interceptLog.ts`, `css/80-special.css`
- Modify: `src/content/schemas.ts` (`FrequencyFragmentSchema`, registry name), `src/content/types.ts`, `src/llm/calls/flavor.ts` (kind `frequency_fragment`), `src/settings.ts` (`fragmentWording`, default true), the SYS settings view (toggle beside `demandWording`), `src/engine/actions/special.ts` (`frequency/word`), `src/app.ts` (wire `createSpecial`), the scene screen and CMDR dossier renderers, `content/core/glossary.json` (`frequency_intercept`, `setting_fragment_wording`)
- Test: `tests/special/fragmentWording.test.ts`, `tests/ui/freqChip.test.ts`, `tests/llm/flavorFragment.test.ts`

**Interfaces:**
- Produces:
  - `fallbackFragment(reg, intercept): string`
  - `generateFragment(input: { name: string; kind: CandidateKind; gist: string; partial: boolean }, deps): Promise<string | null>`
  - `sanitizeFragment(text): string | null` (≤ 160 chars, no digit, no `he/him/his/she… the commander` pronoun pattern from the pronoun test helper, no newline)
  - action `frequency/word { id, text }` (only for an intercept with no `text`)
  - `SpecialController.onEvents(events)`: words new intercepts and dispatches with `expectChatId`
  - `renderFreqChip(host, state, unitId)`, `renderInterceptLog(host, state)`

- [x] **Step 1: Write the failing tests**
- `fallback is stable and fills {name}`: the same id gives the same line; no `{` left.
- `sanitizer refuses digits and long text`.
- `a late fragment for another chat is dropped` (Review Focus 4): the controller with a fake flavor that resolves after a chat switch → no dispatch to the new chat.
- `setting off: no model call, template used`.
- `the FREQ chip and the INTERCEPTS log render the same for a true and a false intercept` (Review Focus 2): two intercepts identical but for `true` → identical `outerHTML` after the text is normalised; every chip carries `data-analyze="glossary:frequency_intercept"` and the word `unverified`.

- [x] **Step 2: Run** the three files → FAIL.

- [x] **Step 3: Implement.** Core registry: one entry per `CandidateKind`, 3 lines and 2 `subjectOnly` lines each, all AUTHOR TO WRITE, fragment style with `…`. The `flavor` prompt asks for one broken inner-voice fragment in her voice, no names of the commander, ≤ 12 words.

- [x] **Step 4: Run** → PASS; `npm test` → PASS (analyze coverage included).

- [x] **Step 5: Commit** `feat(P12): fragment wording, FREQ chip and INTERCEPTS log`

---

### Task 4: `knowledge_leak` and frequency suspicion

**Files:**
- Create: `src/engine/special/frequency/leaks.ts`
- Modify:
  - `src/engine/relations/vocab.ts` (`EVENT_TYPES` + `knowledge_leak`)
  - `src/engine/relations/intents.ts` (`itemId` field; validator option `intercepted?: string[]`)
  - `src/engine/relations/apply.ts` (route to `frequencyLeak`; pass `intercepted` to `validateIntents`)
  - `src/llm/calls/intentExtract.ts` (input `intercepted?`; type offered only when non-empty; the INTERCEPTED block and rule line)
  - `src/scene/sceneController.ts`, `src/scene/comms.ts` (fill `intercepted` via `leakCandidates`)
  - `content/core/eventDeltas.json` (`knowledge_leak`: trust −1 at minor, scaled as the table does)
  - `content/core/defects.json` (`frequencySense: 1.5` on `echo_bleed`, `sensor_ghosting`)
  - `src/content/schemas.ts` (defect field)
  - `src/special/directives.ts` (`special:static:<unitId>`)
  - `tests/power/herCallDirectives.test.ts` (`RESERVED` + `special:`)
- Test: `tests/special/frequencyLeaks.test.ts`, `tests/llm/intentExtractLeak.test.ts`

**Interfaces:**
- Produces:
  - `leakCandidates(state, reg, unitIds): Array<{ id: string; unitId: string; gist: string }>`: unburned, last 14 days, not public, about a present unit.
  - `frequencyLeak(draft, ctx, unitId, itemId, severity): EngineEvent[]`
  - `suspicionOf(state, unitId): number`: engine only, hidden.
  - `frequencySenseOf(state, reg, unitId): number`
  - `decayFrequency(draft): void`
  - `specialDirectives(state, reg, presentIds): Directive[]`: frequency part.
- Consumes: Task 2's `FrequencyState`.

- [x] **Step 1: Write the failing tests**
- `leak raises suspicion by severity`: minor 15, moderate 25, major 35, extreme 35; a false item halves it; `echo_bleed` ×1.5 (moderate true → 38, rounded).
- `decay −2 a day, floor 0`.
- `static directive above 50 only with a sense defect`, worded `senses static around the commander`, and `frequency_static` fires once per crossing.
- `knowledge_leak with an unknown itemId is dropped`.
- `intent_extract offers knowledge_leak only with intercepted items`: the `system()` text lacks `knowledge_leak` when the list is empty and lists the INTERCEPTED block when not; the block never contains `true`/`false`.
- `no frequency effect: input has no intercepted key` (the scene input stays byte-equal to today's).

- [x] **Step 2: Run** → FAIL.

- [x] **Step 3: Implement.** Leak suspicion goes on the event's targets that are present. Decay runs in the special day step (create `src/engine/special/dayStep.ts`, registered on `director_tick` in `actions/special.ts`).

- [x] **Step 4: Run** → PASS; `npm test` → PASS.

- [x] **Step 5: Commit** `feat(P12): knowledge_leak, frequency suspicion and the static directive`

---

### Task 5: Discovery, spread and burning the implant

**Files:**
- Create: `src/engine/special/frequency/discovery.ts`
- Modify:
  - `src/engine/special/dayStep.ts` (discovery check at 100, knower sync)
  - `src/engine/relations/vocab.ts` (`ENGINE_EVENT_TYPES` + `frequency_exposed`)
  - `content/core/eventDeltas.json` (`frequency_exposed`: extreme row, trust −30, affinity −25, stress +20; scaled rows for lower severities as the table requires)
  - `content/core/flags.json` (`knows_frequency`, leverage)
  - `src/content/schemas.ts` (`focus[].requires`; activity effect `burn_frequency_implant`; reserved events)
  - `src/engine/activities.ts` (focus gate, the burn effect)
  - `content/core/activities.json` (medbay focus `burn_implant`, effect)
  - `src/engine/leash/use.ts` (`removeFromService` → `forgetSpecial`)
  - `src/engine/special/state.ts` (`forgetSpecial`)
  - `src/ui/` the medbay focus confirm (one-way)
- Test: `tests/special/frequencyDiscovery.test.ts`

**Interfaces:**
- Produces:
  - `frequencyDiscovered(draft, ctx, unitId): EngineEvent[]`
  - `syncFrequencyKnowers(draft, ctx): EngineEvent[]`
  - `burnImplant(draft): EngineEvent[]`
  - `forgetSpecial(draft, unitId): void`: Tasks 9, 11, 14 and 16 extend it.
  - Events `frequency_discovered { unitId }`, `implant_burned {}`.

- [x] **Step 1: Write the failing tests**
- `suspicion 100 → flag, extreme hit, hidden spreading fact`: the relation has `knows_frequency`; Trust dropped; a fact with `hiddenFromCommander`, `spread: 'fast'`, `knownBy [her]`; `leverageOf` includes `knows_frequency`.
- `knowers sync after a rumor spread`: put a second unit in the fact's `knownBy` → after the day step she has the flag and the hit; a third day step changes nothing.
- `burning stops intercepts and leak offers`: `activity/do medbay burn_implant` → `burnedDay` set; `rollIntercepts` draws nothing; `leakCandidates` is empty.
- `burn focus is refused without the trait and when already burned`.
- `discovery after burning is softened`: `frequency_exposed` at major; a unit with trigger `lies` also gets `decision_aligned`.
- `a terminated unit leaves no frequency, paranoia or debts record` (Review Focus 3, extended in Tasks 9/11/14/16): `removeFromService` → no intercept, suspicion or dmDay entry for her.

- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npm test` → PASS.

- [x] **Step 5: Commit** `feat(P12): frequency discovery, spread among the squad, burning the implant`

---

### Task 6: Frequency analysis, knowledge rule and toasts

**Files:**
- Create: `src/analysis/providers/special.ts`
- Modify:
  - `src/analysis/providers.ts` (`registerSpecialProviders` in `registerCoreProviders`)
  - `content/core/glossary.json` (`frequency_suspicion`, `knowledge_leak`, `burn_implant`)
  - `tests/fixtures/analyze/hidden.ts` (sentinels: an intercept with `true: true` and text `SENTINEL_FREQ_TRUE`, suspicion 71, `factId` fact text `SENTINEL_FREQ_FACT`)
  - `src/special/controller.ts` (toasts for `frequency_discovered`, `implant_burned`; `VOICE_OF.frequency = 'terminal'`)
  - `src/ui/voice/sources.ts`
- Test: `tests/analysis/specialProviders.test.ts`

**Interfaces:**
- Produces:
  - `registerSpecialProviders()`
  - Knowledge rule: hides the `knows_frequency` flag on a unit until `frequency_discovered` has named her (`special.frequency.discovered?: string[]`), and hides the frequency fact.
  - `glossary:frequency_intercept`: a reading of how many fragments today and this week (counts only).

- [x] **Step 1: Write the failing test** `no provider shows a frequency sentinel` (the generic hidden test covers it once the fixture has the sentinels), and `the intercept reading shows counts, never truth or suspicion`.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P12): frequency readings, knowledge rule and toasts`

**Chunk (a) ends here.**

---

## Chunk (b): commander stress and Bloom-induced Paranoia

### Task 7: Commander stress

**Files:**
- Create: `src/engine/special/commanderStress.ts`
- Modify:
  - `src/engine/state/types.ts` (`Commander.stress?`)
  - `src/engine/social.ts` (Empathy −1 at ≥ 70)
  - `src/content/schemas.ts` + `src/engine/activities.ts` (activity effect `commander_stress`)
  - `content/core/activities.json` (medbay `commander` focus: `commander_stress −20`)
  - `src/engine/actions/calendar.ts` (`calendar/sleep` −15)
  - `src/engine/combat/outcome.ts` (commander downed → +10 at finalize, no draw)
  - `src/engine/special/dayStep.ts` (−5 a day, all campaigns)
  - `src/engine/ledger.ts` (key `res:cmdr_stress`)
  - `src/ui/commander/cmdrCard.ts` (band chip)
  - `src/analysis/providers/commander.ts` (`glossary:commander_stress`)
  - `content/core/glossary.json`
- Test: `tests/special/commanderStress.test.ts`

**Interfaces:**
- Produces:
  - `commanderStress(state): number`
  - `addCommanderStress(draft, amount, source: string): EngineEvent[]`, emits `commander_stress_changed { delta, source }`
  - `commanderStressBand(state): StressBand`

The day step's decay runs in every campaign: it is registered unconditionally and changes nothing while stress is 0.

- [x] **Step 1: Write the failing tests**
- `clamps 0..100 and emits the delta`.
- `Empathy is one rank lower at 70, floor 1, stacked with sleepless`.
- `medbay commander focus −20; quiet-night sleep −15; day end −5`.
- `a downed commander gains 10 at finalize`.
- `old save without stress reads 0 and the CMDR card shows calm`.
- `no rng draw`: rng state unchanged across a day end at stress 40.
- `CMDR chip carries data-analyze="glossary:commander_stress"`.

- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npm test` → PASS. A ledger snapshot test that now sees `res:cmdr_stress` after a downed commander is the only expected expectation change. Name it in the commit body.
- [x] **Step 5: Commit** `feat(P12): commander stress (sources, relief, Empathy at strained)`

---

### Task 8: Premonitions (real precursors and false alarms)

**Files:**
- Create: `src/engine/special/paranoia/premonitions.ts`, `content/core/premonitionLines.json`
- Modify: `src/engine/special/state.ts` (`ParanoiaState`), `src/engine/special/dayStep.ts` (registered after `loyaltyDayStep`: the `actions/special.ts` import must come after `actions/loyalty.ts` in `app.ts` and in the test helper; assert the order in a test), `src/content/schemas.ts` (`PremonitionLineSchema`), `src/engine/tuning.ts`
- Test: `tests/special/premonitions.test.ts`

**Interfaces:**
- Produces:
  - `ParanoiaState = { premonitions: Premonition[]; preempt?: Preempt[]; lastNightmareDay?: number }`
  - `Premonition = { id; unitId; about: 'doubt'|'desertion'|'mutiny'|'defiance'; day; expiresDay; real: boolean; acted?: 'preempted'|'false' }`
  - `realPrecursors(state, reg): Array<{ unitId; about }>`
  - `falseAlarmChance(state): number`
  - `paranoiaDayStep(draft, ctx): EngineEvent[]`
  - `openPremonition(state, unitId): Premonition | undefined`
  - Event `premonition { unitId, premonitionId, about }`.
- Consumes: `loyaltyOf`, `mutinyRules`, `mutinyTrigger`, `commandStance`, `impunityOf`, `ledgerFor`.

- [x] **Step 1: Write the failing tests**
- `a doubt sign 2 days out gives a premonition 2 days before the sign` (acceptance 3, "earlier"): wavering unit, `nextDoubtDay = day + 2` → premonition today with `about: 'doubt'`; run two day ends → the real `loyalty_sign` appears on the later day.
- `desertion precursor needs falling Trust near breaking`.
- `mutiny precursor one sign short`.
- `defiance precursor`.
- `false-alarm rate`: Insight 1 → 2000 seeded unit-days with no precursor, hit share in [0.065, 0.095]; Insight 3 → [0.03, 0.05]; after a nightmare +0.05.
- `one open premonition per unit; a real one replaces a false one`.
- `the event is identical in shape for real and false`: same keys, no `real`.
- `no paranoia effect: no draw`.

- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P12): premonitions from real precursors and false alarms`

---

### Task 9: Acting on a warning (`accused`, punishment, Leash, removal)

**Files:**
- Create: `src/engine/special/paranoia/accusations.ts`
- Modify:
  - `src/engine/relations/vocab.ts` (`EVENT_TYPES` + `accused`; `ENGINE_EVENT_TYPES` + `false_accusation`)
  - `src/engine/relations/apply.ts` (route `accused` → `actOnWarning(…, 'accused')`)
  - `src/llm/calls/intentExtract.ts` (input `warned?: string[]` = present unit ids with an open premonition; `accused` offered only when non-empty; rule line `"accused": the commander openly accuses a unit of planning disloyalty, desertion, mutiny or defiance.`)
  - `src/scene/sceneController.ts`, `src/scene/comms.ts`
  - `content/core/eventDeltas.json` (`accused`: minor trust −2, affinity −2; `false_accusation`: extreme as `insulted` extreme)
  - `src/engine/actions/discipline.ts` (after `discipline/punish` on her → `punished`; a `benched` measure → `removed`)
  - `src/engine/actions/leash.ts` (`compel` / `suppress` → `leash`)
  - `src/engine/actions/base.ts` (`roster/set_active` dropping her → `removed`)
  - `src/engine/loyalty/desertion.ts` (`talkDown` +`preemptBonus`)
  - `src/engine/special/state.ts` (`forgetSpecial` paranoia part)
- Test: `tests/special/accusations.test.ts`

**Interfaces:**
- Produces:
  - `actOnWarning(draft, ctx, unitId, act: 'accused'|'punished'|'leash'|'removed'): EngineEvent[]`
  - `preemptBonus(state, unitId): number`: 0 or 0.15, read by `talkDown`; state-only, no registry.
  - Event `premonition_acted { unitId, act }`.

- [x] **Step 1: Write the failing tests**
- `acting on a false alarm applies the extreme event` (acceptance 3): a false open premonition; `accused` → `false_accusation` landed (Trust and Affinity drop as `insulted` extreme), commander stress +5; `punished` → `coerced` extreme on top of the punishment.
- `acting on a real one preempts`:
  - `doubt` → `talkDown` chance +0.15 (compare `loyalty_talk_down.chance`) and `nextCheckDay ≥ day + 3`;
  - `mutiny` with a hit seed → mutiny signs cleared;
  - `defiance` → record −6.
- `no open premonition: no extra effect` (punish without one = today's deltas exactly).
- `accused is offered only with warned units`.
- `premonition_acted carries no truth`.
- `a terminated unit leaves no paranoia record` (extends the Review Focus 3 test).

- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P12): acting on a warning is scored by its truth`

---

### Task 10: Bloom nightmares

**Files:**
- Create: `src/engine/special/paranoia/nightmares.ts`
- Modify: `src/engine/special/dayStep.ts` (the nightmare roll runs on `dm_rumors`, so its knock is queued before `night_check`), `src/engine/tuning.ts` (`nightmare.lines`, AUTHOR TO WRITE, Bloom imagery, no commander pronoun), `src/special/controller.ts` (morning toast, `special:nightmare` directive in scenes of that day: `The commander slept badly: Bloom dreams.`)
- Test: `tests/special/nightmares.test.ts`

**Interfaces:**
- Produces:
  - `NIGHTMARE_KNOCK_KIND = 'nightmare_heard'`
  - `rollNightmare(draft, ctx): EngineEvent[]`
  - Event `bloom_nightmare { day, lostMorning: boolean, visitorId?: string }`.

- [ ] **Step 1: Write the failing tests**
- `nightmares fire` (acceptance 3): rate over 2000 seeded days in [0.10, 0.14] at stress 0, [0.16, 0.20] at stress 60.
- `a nightmare adds 15 stress and sets lastNightmareDay`.
- `lost morning`: with a seed found by search, the next rollover emits `morning_lost`.
- `a fond unit comes to the door the same night`: Affinity 40 → a `nightmare_heard` entry in the queue before `night_check` and `night_started` with it; the framing has no pronoun for the commander.
- `nobody fond: no knock`.
- `no paranoia: no draw`.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P12): Bloom nightmares`

---

### Task 11: The `contingency` order

**Files:**
- Create: `src/engine/combat/contingency.ts`
- Modify: `content/core/orders.json` (`contingency`: cost 2, target `ally`, `requiresUnlock: true`, effects `[{ type: 'contingency' }]`, summary AUTHOR TO WRITE), `src/content/schemas.ts` (order field; combat effect `contingency`), `src/engine/combat/effects.ts` (effect handler; `hitCommander` hook), `src/engine/combat/orders.ts` (`checkOrder` unlock and once-per-combat), `src/engine/combat/types.ts` (`CombatState.contingency?`), the combat UI order list (`aria-disabled` + reason), `content/core/glossary.json` (`contingency`)
- Test: `tests/special/contingency.test.ts`

**Interfaces:**
- Produces:
  - `orderUnlocked(state, reg, orderId): boolean`
  - `isTurningAttacker(cs, attackerCid): boolean`
  - `takeContingency(ctx, attackerCid): string | null`: the cid that takes the hit, marking it used.
  - Events `contingency_set { cid }`, `contingency_cover { cid }`.

- [ ] **Step 1: Write the failing tests**
- `locked without the unlock effect` (`checkOrder` → `Unknown order`-style refusal `Not available to this commander.`), `available with bloom_paranoia`.
- `once per combat`.
- `contingency intercepts the first hit from a turning unit` (acceptance 3): a mutiny encounter with `exposesCommander`, the cover down, contingency on unit B → the first mutineer hit on `commander` lands on B (log `contingency_cover`), the second follows today's rules.
- `a hit from an ordinary enemy does not use it`.
- `a squad unit in breakdown counts as turning`.
- `no contingency: hitCommander is unchanged` (seeded combat byte-equal).

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P12): the contingency order`

---

### Task 12: Paranoia UI, readings and hidden truth

**Files:**
- Create: `src/ui/special/premonitions.ts`
- Modify: `src/special/controller.ts` (PREMONITION toast, `VOICE_OF.premonition = 'terminal'`), the CMDR dossier (PREMONITIONS list), `src/analysis/providers/special.ts` (`glossary:premonition`, `glossary:false_alarm`, `glossary:bloom_nightmare`), `tests/fixtures/analyze/hidden.ts` (a real premonition with id `SENTINEL_PREMONITION_REAL` and a false one; the `real` value must never show), `content/core/glossary.json`
- Test: `tests/ui/premonitions.test.ts`

**Interfaces:**
- Produces: `renderPremonitions(host, state, reg)`. Each row: day, name, line, chip `PREMONITION` with `data-analyze="glossary:premonition"`.

- [ ] **Step 1: Write the failing tests** `a real and a false premonition give identical events, toasts and DOM` (Review Focus 2), `the list hides expired rows` and `no provider shows a premonition sentinel`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P12): premonition notices, the CMDR list and readings`

**Chunk (b) ends here.**

---

## Chunk (c): Web of Debts

### Task 13: The handler and the visit schedule

**Files:**
- Create: `src/engine/special/debts/handler.ts`, `content/core/debtHandlers.json` (2 placeholder handlers, AUTHOR TO WRITE)
- Modify:
  - `src/engine/special/state.ts` (`DebtsState`; `HANDLER_VISIT_KIND`, `HANDLER_UNIT`, `OWN_PANEL_KINDS`, `isOwnPanelNight`)
  - `src/engine/special/traits.ts` (seed picks the handler)
  - `src/engine/special/dayStep.ts` (visit roll on `dm_rumors`)
  - `src/engine/actions/comms.ts` (`isConfrontation` → `isOwnPanelNight` in `night/open`, `door_*`, `ignore`)
  - `src/ui/hub/model.ts` (`tonightItems`, the Night line)
  - `src/app.ts` (`confrontationNight` → own panel)
  - `src/content/schemas.ts` (`DebtHandlerSchema`, `DESCRIBED_REGISTRIES`)
  - `content/core/lorebook.json` (`debts_handler`, AUTHOR TO WRITE)
- Test: `tests/special/handler.test.ts`

**Interfaces:**
- Produces:
  - `DebtsState = { corporationId; handlerId; lastVisitDay?; visitSeq; visit?: { id; day; items: IntelItem[] }; answered: string[]; handlerSuspicion; handlerPressure; oversightSuspicion; scheduled: Scheduled[]; exposures: Exposure[]; ended?: 'leaked'|'confessed'|'fled'; discoveredBy?: string }`
  - `pickHandler(state, reg): { corporationId; handlerId } | null`
  - `rollVisit(draft, ctx): EngineEvent[]`
  - Event `handler_visit { visitId }`.

- [ ] **Step 1: Write the failing tests**
- `the handler serves a corporation that is not the commander's`.
- `weekly visits` (acceptance 4): 120 seeded days → mean interval in [5, 9], never two nights in a row, never before day 5.
- `night/open, door_say and ignore refuse a visit`.
- `tonightItems does not crash and says A visitor at the gate.`
- `a visit waits behind a confrontation of higher priority`.
- `ended: no visits`.
- `no debts effect: no draw`.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P12): the handler and the visit schedule`

---

### Task 14: The intel exchange

**Files:**
- Create: `src/engine/special/debts/intel.ts`
- Modify: `src/engine/actions/special.ts` (`debts/answer_visit`), `src/engine/special/dayStep.ts` (lapse of an unanswered visit), `src/engine/special/state.ts` (`forgetSpecial` debts part)
- Test: `tests/special/intel.test.ts`

**Interfaces:**
- Produces:
  - `IntelItem = { id: string; kind: 'mission_done'|'base'|'spine'|'squad'|'plan'; refId: string; label: string }`
  - `intelOf(state, reg): IntelItem[]` (≤ 5)
  - `answerVisit(draft, ctx, visitId, answers): EngineEvent[]`
  - `lapseVisit(draft, ctx): EngineEvent[]` (all withhold)
  - `paymentFor(answers, pressure): { credits; supplies; plyx }`
  - Events `intel_answered { visitId, counts: { truth, partial, false, withhold } }`, `handler_threat {}`, `handler_leak {}`.

- [ ] **Step 1: Write the failing tests**
- `four choices per item` (acceptance 4): any other value is refused (`Answer each item with truth, partial, false or withhold.`) and nothing changes.
- `payment table` and `halved at pressure 60`.
- `withhold raises pressure, truth lowers it`.
- `pressure escalates to a crime leak` (acceptance 4): pressure 80 + 1 withhold → `handler_leak`, every named living unit `knows_crime` and `knows_debts`, `ended: 'leaked'`, oversight +25.
- `an unanswered visit lapses as withhold at the night's end` (Review Focus 5).
- `stale visit id refused`.
- `an answered item is not offered again`.

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** The rollover already drops `nightEvent`; the special day step calls `lapseVisit` when `debts.visit` is still open on a later day (no calendar change).
- [ ] **Step 4: Run** → PASS; `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P12): the intel exchange, payment and the handler's pressure`

---

### Task 15: Consequences and oversight suspicion

**Files:**
- Create: `src/engine/special/debts/consequences.ts`
- Modify: `src/engine/world/expedition.ts` (`startExpedition` sets `ambushed` from an exposure on the region; `enterCombat` adds danger +1 while `ambushed > 0` and decrements it; log line), `src/engine/world/types.ts` (`ExpeditionState.ambushed?`), `src/content/schemas.ts` (world-option effect `oversight_scrutiny`), `content/core/worldOptions.json` (`lenient` 0.75, `brutal` 1.5), `src/engine/special/dayStep.ts` (due consequences; false items found out)
- Test: `tests/special/consequences.test.ts`

**Interfaces:**
- Produces:
  - `scheduleConsequences(draft, ctx, visit, answers): void`
  - `runConsequences(draft, ctx): EngineEvent[]`
  - `oversightGain(state, reg, strength): number`
  - `ambushFor(state, regionId): 0 | 1 | 2`
  - Event `debts_consequence { kind }`.

- [ ] **Step 1: Write the failing tests**
- `truthful items schedule world effects` (acceptance 4): `plan` truth → an exposure; a run to that region gets danger +1 on its first 2 combats (encounter danger compared) and the log line; partial → 1 combat; false → no exposure.
- `base truth delays an upgrade by 2 days`.
- `mission_done truth moves rival +10, own −5`.
- `oversight gain uses Cunning and the world option`: Cunning 3, brutal → 10 × 0.8 × 1.5 = 12.
- `a false item found out raises handler suspicion`.
- `no exposure: expedition byte-identical`.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P12): intel consequences, ambushes, sabotage and oversight suspicion`

---

### Task 16: The two discovery paths and `defector_arc`

**Files:**
- Create: `src/engine/special/debts/discovery.ts`
- Modify:
  - `src/engine/dilemma/types.ts` (`DILEMMA_CONTEXTS` + `debts_oversight`, `debts_unit`)
  - `content/core/dilemmaTemplates.json` (two fixed templates; option ids `double_agent`/`confess`/`flee` and `report`/`protect_commander`/`demand`; texts AUTHOR TO WRITE, no commander pronoun)
  - `src/engine/actions/dilemma.ts` (after `dilemma/choose`, `debtsChoice(draft, ctx, option)` by option id when the context is a debts one)
  - `content/core/flags.json` (`knows_debts` leverage; world flags)
  - `content/core/secretKinds.json` (+ entry `source: 'debts'`)
  - `src/content/schemas.ts` (secret source enum + `debts`; defect field `nightAware`)
  - `content/core/defects.json` (`threat_saturation.nightAware: true`)
  - `src/engine/relations/vocab.ts` (`debts_exposed`), `content/core/eventDeltas.json`
  - `src/engine/special/state.ts` (`forgetSpecial`: a subject who leaves drops a queued `debts_unit` case)
- Test: `tests/special/debtsDiscovery.test.ts`

**Interfaces:**
- Produces:
  - `rollUnitDiscovery(draft, ctx): EngineEvent[]` (called by `answerVisit` / `lapseVisit`)
  - `openOversightCase(draft, ctx)`, `openUnitCase(draft, ctx, unitId)` (queued in `debts.caseQueue` while a dilemma is open, opened at a later day end, like `scapegoatQueue`)
  - `debtsChoice(draft, ctx, dilemma, optionId): EngineEvent[]`
  - Events `debts_discovered { unitId }`, `defector_arc { outcome }`.

- [ ] **Step 1: Write the failing tests**
- `oversight at 100 opens the defining dilemma and every option sets defector_arc` (acceptance 4): each option → world flag `defector_arc` plus its outcome flag, the thread `defector_arc` open; `flee` sets `ended`, `double_agent` resets suspicions to 30.
- `a watcher discovers on a visit night` (acceptance 4): `threat_saturation` unit, a found seed → `knows_debts`, `debts_exposed`, the `debts_unit` dilemma presented with her as subject.
- `report / protect_commander / demand`: oversight +40 / a kept squad secret of source `debts` known by her / an open owed demand.
- `queued while another dilemma is open`.
- `at most one unit discovery per visit`.
- `a terminated subject's case never opens`.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P12): debts discovery by oversight and by a unit; defector_arc placeholders`

---

### Task 17: Debts UI, readings and hidden clocks

**Files:**
- Create: `src/ui/special/handlerPanel.ts`, `src/ui/special/debtsBlock.ts`
- Modify:
  - `src/special/controller.ts` (open the panel for an own-panel visit night; `answerVisit`; toasts for threats, the leak and consequences: `voice: 'corporate'`; directive `special:handler`)
  - `src/app.ts`
  - the CMDR dossier (DEBTS block: handler name, corporation, last visit, intel given counts, `handler_pressure` chip shown as a band `calm / pressing / threatening` only)
  - `src/analysis/providers/special.ts` (`glossary:handler`, `intel_exchange`, `handler_pressure`, `oversight_suspicion` (reads `An unseen threat`), `defector_arc`)
  - `tests/fixtures/analyze/hidden.ts` (oversight 63, handler suspicion 57, an unanswered `false` item text `SENTINEL_INTEL_FALSE`)
  - `content/core/glossary.json`
  - `css/80-special.css`
- Test: `tests/ui/handlerPanel.test.ts`

**Interfaces:**
- Produces:
  - `renderHandlerPanel(host, ctx: { state; reg; onAnswer(answers): void })`: one row per item with four `alius-option` buttons (`data-analyze="glossary:intel_exchange"`), a SUBMIT that stays `aria-disabled` until every row is set, and the payment preview from `paymentFor`.
  - `renderDebtsBlock(host, state, reg)`

- [ ] **Step 1: Write the failing tests** `four choices per row and SUBMIT waits for all`, `submit dispatches one debts/answer_visit with expectChatId`, `a refused answer unlocks the panel` (P7's microtask rule), `no provider shows a debts sentinel`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npm test` → PASS (coverage test included).
- [ ] **Step 5: Commit** `feat(P12): the HANDLER panel, the DEBTS block and readings`

---

### Task 18: Unaffected campaigns, docs and hand-offs

**Files:**
- Create: `docs/MANUAL_TEST_P12.md`, `tests/special/unaffected.test.ts`
- Modify:
  - `docs/packages/P12-special-traits.md` (status line; **Implemented as**: rulings, non-obvious things, open items; every user ruling above)
  - `docs/00-overview.md` (§5.4 rows for P12; §6 `special`, `Commander.stress`; §8 setting `fragmentWording`; §9 status `implemented`; §5.2 flavor kind `frequency_fragment`)
  - `docs/packages/P13-leashswap-mode.md` (**Interfaces already provided by P12**: `addCommanderStress`, the suspicion-clock pattern (`special/state.ts`), own-panel nights, `forgetSpecial`)
  - `CLAUDE.md` (a P12 rule line in the style of the others)
  - `docs/CONTENT.md` (the three registries, the trait effect types)

- [ ] **Step 1: Write the failing test** `no special trait: a seeded week of day ends, scenes, DMs and a combat is identical` (Review Focus 1, acceptance 5). Run the same scripted week on today's fixture campaign twice: once as is, once with `special: {}` present and the P12 modules imported. Compare the final state minus `ledger` and `commander.stress` (both stay at their old values when no combat downs the commander) and the rng state.
- [ ] **Step 2: Run** → PASS is acceptable here (it guards the earlier tasks). If it fails, stop and report which task drew.
- [ ] **Step 3: Write** the docs. The manual test covers, in SillyTavern:
  - the WHAT THIS CHANGES card;
  - FREQ chips and a fragment that reads as a fragment;
  - a leak noticed by the model;
  - burning the implant;
  - a premonition toast;
  - an accusation;
  - a nightmare knock;
  - `contingency` in a mutiny;
  - a handler night with all four answers;
  - an ambush run;
  - both dilemmas.
- [ ] **Step 4: Run** `npm test` → PASS; record the final file and test counts in the spec.
- [ ] **Step 5: Commit** `docs(P12): implemented as, overview, hand-offs, manual test`

**Chunk (c) ends here.**
