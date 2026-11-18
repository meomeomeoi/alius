# P12 — Special Traits: Secret Frequency, Bloom-induced Paranoia, Web of Debts

**Status: implemented** (plan: `docs/plans/2026-11-18-p12-special-traits.md`; see **Implemented as** at the end; where it differs from the draft, the code wins). **Depends on:** P7 (trait framework), P9 (Impunity, leverage, punishments), P5 (director threads, night events), P6 (dilemmas). **Read:** overview; this file; P7 §8; P9.

## Goal

Special traits are campaign premises, not modifiers: each one changes how the whole run is played. At most **one special trait per campaign**. This package implements three of them on the P7 framework. LEASHSWAP is a separate game mode (P13).

Naming: the P7 trait kind formerly called `rule` is `special` in data and UI.

## 1. Secret Frequency (`secret_frequency`)

*An experimental frequency analyzer in the commander's head picks up fragments of the squad's thoughts. If they find out, it ends badly.*

**Intercepts.** In each scene (and DM thread, at half rate) with a named unit present, roll `pCatch` = 25% base, +10% in private scenes, −10% if her stress ≥ 80. On success the engine picks one **candidate truth** about her hidden state:
current stance (P9), Impunity band, a pending demand, a pending desertion/mutiny warning, a fact about her not `knownBy` the commander, Attraction band, a planned refusal.
With probability `pDistort` = 25% (+15% if her stress ≥ 50) the truth is replaced by a plausible false candidate. Text: template or `flavor` call (≤ 40 tokens) in fragment style ("…can't keep doing this…"). Fragments can be partial (only the subject, not the conclusion).

UI: `FREQ ▸ "…" (unverified)` chip in the scene, plus an INTERCEPTS log in the CMDR dossier. The log never shows which fragments were true.

**Leaks.** New intent `knowledge_leak`: the commander uses information he could not know. `intent_extract` receives the list of intercepted-but-not-public items for present units (compact) to detect it. Each leak raises that unit's `frequencySuspicion` (0–100) by 15/25/35 by severity; decay −2/day. Units with `echo_bleed` or `sensor_ghosting`: gain ×1.5, and above 50 they get a directive "she senses static around him".

**Discovery** at 100: the unit learns the truth (`knows_frequency` flag). Squad-wide event: everyone who learns gets an `extreme` violation event (Trust and Affinity crash, stress +), the discoverer may spread it (fact with `knownBy`). The secret is also leverage in P9 (`S` term).

**Burn the implant** (medbay activity, one-way): intercepts stop forever. If discovery happens later, reactions are softened (`decision_aligned` with honesty-valued units).

## 2. Bloom-induced Paranoia (`bloom_paranoia`)

*High Bloom exposure in his past work. Something is off in his head.* Mutually exclusive with `insomniac`. Sets flag `commander_bloom_exposed` (hook for the future Bloom update).

**Early warnings.** Loyalty signals (P6 warning signs, P9 stance shifts toward `open_defiance`, mutiny preconditions) reach the commander 1–2 days earlier as `PREMONITION` notices.

**False alarms.** Each day, per unit, roll `pFalse` (base 8%, −2% per Insight rank above 1, +5% after a nightmare night). A false alarm produces a notice indistinguishable from a real one. Acting on a warning — new intent `accused`, a punishment, the Leash, removing her from a mission — is scored by truth: on a real threat it preempts (talk-down bonus, mutiny averted chance); on a false one it is an `extreme` insult/coercion with full consequences.

**Nightmares.** Night-event family `bloom_nightmare` (Bloom imagery): commander stress +, the next day's first slot may be lost; sometimes a unit hears him and comes (scene hook).

**Unique order `contingency`** (CP 2): designate a cover unit for this combat. If any unit turns on the commander (mutiny, breakdown targeting him), the cover unit intercepts the first hit.

## 3. Web of Debts (`web_of_debts`)

*Old mistakes and shady ties: he must feed information to a rival corporation.*

**Handler.** An NPC of a rival corporation chosen at start (any corporation that is not the player's). Lorebook entry; no card needed. Visits at night about once a week (day roll, never two nights in a row).

**Intel exchange.** The engine assembles available intel from recent state: completed missions, base upgrades, spine discoveries, squad details, planned expeditions. For each item the player picks **truth / partial / false / withhold**. Payment: supplies, credits, plyx, sometimes a side mission or rumor. The handler tracks `handlerSuspicion` (false intel found out) and `handlerPressure` (withholding): rising pressure → threats, cut payments, finally the handler leaks the commander's crime to the squad.

**Consequences come back.** Each truthful item schedules a world effect: ambush on a reported expedition route, sabotage of a reported facility, rival standing +, own-corporation standing −. Partial items have weaker effects; false items none (but handler suspicion).

**Discovery.** Two clocks:
- `oversightSuspicion` fed by consequences traced back to leaks (Cunning slows it, `oversight: brutal` speeds it).
- Squad discovery rolls on visit nights: units awake at night, `threat_saturation`, high Insight-like profiles.

Discovered by **oversight** → `defining` dilemma (become a double agent / confess / flee) and a spine branch `defector_arc` (author-written beats; v1 ships three placeholder outcomes). Discovered by a **unit** → she gains leverage (P9 `S` +15) and a personal dilemma: report him, protect him, or demand something for silence.

## 4. Shared rules

- Registry entries in `commanderTraits` with `kind: 'special'`, `exclusiveWith`, `requires` (e.g. `web_of_debts` requires ≥ 1 non-player corporation in data).
- Each trait shows a full "What this changes" card in the commander setup (P7 wizard / P11 dossier).
- All three can combine with LEASHSWAP (P13): it is a mode, not a trait. Combinations get no special handling beyond the systems themselves.

## Acceptance criteria

1. Only one special trait per campaign; `bloom_paranoia` and `insomniac` cannot be taken together.
2. Frequency: intercept and distortion rates match the formulas (seeded tests); the log never reveals truth; `knowledge_leak` raises suspicion; discovery at 100 triggers the squad event; burning the implant stops intercepts.
3. Paranoia: real warnings arrive earlier; false alarms are indistinguishable in UI; acting on a false alarm applies the extreme event; nightmares fire; `contingency` intercepts the first hit from a turning unit.
4. Debts: weekly visits; four choices per intel item; truthful items schedule world effects; pressure escalates to a crime leak; both discovery paths produce their dilemmas; the oversight path sets `defector_arc`.
5. Existing campaigns without special traits are unaffected.

## Open decisions (author)

- Probabilities and clock speeds above.
- Handler character and the `defector_arc` beats.
- Intercept fragment style (templates vs `flavor` generation).

## Interfaces already provided by P7a (implemented — use, do not rebuild)

- **Never spoil a secret in a panel:** register `registerKnowledgeRule({ fact: (f, state) => …, flag: (id, state) => … })` so readings, "facts" and flags the commander does not know stay hidden (intercept truth flags, suspicion, who knows what); suspicion clocks are hidden by `visibleToPlayer: false` and read as `An unseen threat` in effects summaries. Add sentinels to `tests/fixtures/analyze/hidden.ts`; the hidden-state test (`no provider shows a sentinel text`) then covers the new providers.
- Trait descriptions are registry `description`s; their effects lines are generated by `entryEffects`.

## Interfaces already provided by P7 (implemented — use, do not rebuild)

- **The trait framework is built:** `commanderTraits` with `kind: 'special'`, `TraitEffectSchema`, `traitEffects`, `validateCommanderSetup` (kind, exclusion, `requiresSettings`), `traitBlockReason`, the review/wizard UI, `vow_of_distance` as the proof (`no_romance` → `settings.noRomance` → `intimacyOf`, `requiresTrait` on states, `platonic_threshold`). New special traits add effect types in code only when no existing one fits.
- Special traits are never proposed by `commander_import`.

## Interfaces already provided by P9 (implemented — use, do not rebuild)

- **Leverage:** a secret a unit holds over the commander is a relation flag with `"leverage": true` in `flags.json`; every such flag adds 5 to her Impunity (cap 15) through `leverageOf`. P12's Secret Frequency and Web of Debts add their flags this way and need no code for `S`.
- **Impunity, stance and deeds:** `impunityOf`, `commandStance`, `countDeed` (a new counter is `DEED_COUNTERS` plus the call site) and the `reputations` registry (a trait-driven nickname is JSON). `impunityBase` of an active nickname feeds the base.
- **Demands:** `openDemand` and `demandTemplates` (conditions can name flags with `flagsNone`); a debt can be a demand.
- **Hidden state:** `registerKnowledgeRule` and the hidden-state fixture; the stored R and the counters are never shown.

## Interfaces already provided by P9c (implemented — use, do not rebuild)

- **Squad secrets:** `addSecret(draft, reg, { kindId, knownBy, subjectId?, vars? })` stores a secret the squad keeps from the commander (a `secretKinds` entry; a Debts source adds its own kind with `source: 'event'` or a new source value in the schema). `discoverSecret(draft, ctx, secretId, 'frequency')` is the Secret Frequency route: it is exported and works, but nothing calls it. A found secret waits for `secret/respond` (confront / pretend / use); the commander's answer writes the fact.
- **`held`:** using a secret lowers the Impunity of the soldiers who knew it (`ImpunityTerms.held`, −8 each, at least −16, 14 days).
- **Intercepts:** level-4 edits already exist for a DM to another soldier, a Leash request and a recruit order (`interceptEditor`, `rollIntercept`); Secret Frequency's own interception is a separate mechanic that should not reuse the `Intercept` record.

## Interfaces already provided by P3b (implemented — use, do not rebuild)
- **Hidden facts:** `addFact(draft, { …, hiddenFromCommander: true, knownBy: [ids], about: [ids] })` (optionally `spread: 'slow' | 'fast'`, `pinned: true`). The Knowledge rule (`registerMemoryProviders`) hides such a fact from every reading, the MEMORY view and the LOG; a prompt shows it only when every present unit knows it, worded `{names} know (the commander does not): …; they do not tell the commander` (`factLine`). It is never folded into a dossier (it waits for the trait to decide) and never pruned before the ceiling.
- **Rumors:** a fact with `spread` and a `knownBy` that does not hold every squad member reaches the rest on the days `hashDay(factId, unitId, span)` says (`spreadRumors`, the `dm_rumors` day-end hook), with no RNG; a hidden fact spreads the same way. In `model` rumor mode the mechanic retells it once (`rumor.text`).
- **Remembered events** are `memoryRules` + resolvers (`registerMemoryResolver`; a rule may carry `hiddenFromCommander: true`). The v1 core rules use none. Facts a rule writes take `fr<n>` ids from `memory.nextRememberId`, so `memory.nextId` never shifts.
- **Squad secrets stay P9c's:** a kept secret is not a `Fact`, and nothing in memory reads `personal.secrets[].text`.

## Implemented as

Engine: `src/engine/special/{state,traits,commanderStress,dayStep,index}.ts` (`state.ts` is a leaf: types, tuning, `forgetSpecial`, `holdsSpecial`, `preemptBonus`, `OWN_PANEL_KINDS`), `frequency/{candidates,intercepts,fragments,leaks,discovery}.ts`, `paranoia/{premonitions,accusations,nightmares}.ts`, `debts/{handler,intel,consequences,discovery}.ts`, `src/engine/combat/contingency.ts`, `src/engine/actions/special.ts` (registers `frequency/word`, `debts/answer_visit` and the two day-end steps; import it after `actions/loyalty`, `actions/personal` and `actions/memory`). Non-engine: `src/special/{controller,directives,deps}.ts` (`createSpecial` / `app.special`), `src/ui/special/{freqChip,interceptLog,premonitions,handlerPanel,debtsBlock}.ts`, `src/analysis/providers/special.ts`, `css/80-special.css`. Registries `frequencyFragments` and `premonitionLines` (hidden wording) and `debtHandlers` (player-visible, in `DESCRIBED_REGISTRIES`).

### State
- `CampaignState.special?: { frequency?, paranoia?, debts? }` (created by `seedSpecialTraits`; absent without a special trait) and `Commander.stress?` (absent = 0; every campaign has the stat). Every field is optional and `version` stays 1. `FrequencyState { intercepts (newest 40), seq, suspicion, dmDay, burnedDay?, factId?, discovered?, staticFired? }`, `ParanoiaState { premonitions, seq, preempt?, lastNightmareDay? }`, `DebtsState { corporationId, handlerId, lastVisitDay?, visitSeq, visit?, answered, handlerSuspicion, handlerPressure, oversightSuspicion, scheduled, exposures, ended?, discoveredBy?, caseQueue? }`. `ExpeditionState.ambushed?`, `CombatState.contingency?`.
- Actions: `frequency/word { id, text }`, `debts/answer_visit { visitId, answers }`. Engine events (never offered to the model, each with an `eventDeltas` row): `frequency_exposed`, `false_accusation`, `debts_exposed`. Model-reportable: `knowledge_leak`, `accused` (each offered only while the input lists something it can be about). Reserved emitted events: `frequency_intercept`, `frequency_worded`, `frequency_static`, `frequency_discovered`, `implant_burned`, `commander_stress_changed`, `premonition`, `premonition_acted`, `bloom_nightmare`, `handler_visit`, `intel_answered`, `handler_threat`, `handler_leak`, `debts_consequence`, `debts_discovered`, `defector_arc`; combat `contingency_set` / `contingency_cover`.
- Content: three traits in `commanderTraits` (each with `changes[]` for the WHAT THIS CHANGES card; `web_of_debts.requires.otherCorporation`; `insomniac` / `bloom_paranoia` exclude each other), trait effect types `frequency`, `paranoia`, `debts`, `commander_flag`, `unlock_order`; the order `contingency` (`requiresUnlock`) with combat effect `contingency`; medbay foci `burn_implant` (`requires.traitEffect`, `confirm`) and the activity effects `commander_stress`, `burn_frequency_implant`; defect fields `frequencySense` (`echo_bleed`, `sensor_ghosting` 1.5) and `nightAware` (`threat_saturation`); world-option effect `oversight_scrutiny` (`lenient` 0.75, `brutal` 1.5); dilemma contexts `debts_oversight` and `debts_unit` with the fixed templates `debts_oversight_case` and `debts_unit_case`; secret-kind source `debts`; flags `commander_bloom_exposed`, `knows_frequency`, `knows_debts` (both leverage), `defector_arc`, `defector_double_agent`, `defector_confessed`, `defector_fled`; flavor kind `frequency_fragment` behind the setting `fragmentWording` (default on); lorebook entry `debts_handler`; glossary entries for every new concept.

### Rulings (the plan's ruling section holds the full text; user rulings answered 2026-11-18 are marked **(user)**)
- **Commander stress (user: add it).** 0–100, no draw. Sources: nightmares +15, a false alarm acted on +5, the commander downed +10. Relief: −5 a day (every campaign), −15 for a quiet-night sleep (the day end already ran at dusk, so the sleep itself takes only its own 15), −20 for the medbay `commander` focus. From 70 Empathy is one rank lower (stacks with the sleepless penalty). P13's `pain_burst` reuses `addCommanderStress`.
- **Premonitions are real precursors (user).** The paranoia step runs on `director_tick` after P6's loyalty step and writes a real premonition 1–2 days before a doubt sign, a desertion (wavering, Trust within 5 of the breaking line and falling), a mutiny (`mayMutiny` and one sign short or a trigger) or open defiance (+10 Impunity would do it and her record is rising); false alarms (8 % less 2 % per Insight rank above 1, +5 % the day after a nightmare) are stored `real: false` and look the same everywhere. Acting on one scores by truth: real → preempted (talk-down +0.15 for 5 days, her next check waits 3, a mutiny averted on a draw at 0.5, defiance record −6); false → `false_accusation` / `coerced` at extreme and commander stress +5.
- **P9c (user).** An undistorted `secret` intercept calls `discoverSecret(…, 'frequency')` — the one place an intercept's truth is confirmed. A debts case may also leave a squad secret (`protect_commander`, source `debts`).
- **Wording (user).** `flavor` kind `frequency_fragment` behind `fragmentWording`; fallback lines from `frequencyFragments`; an answer with a digit, a pronoun for the commander or more than 160 characters falls back.
- **Frequency.** Rolls at `scene/start` (once per present unit) and at `dm/receive` (once a unit a day, half rate); `pCatch` 0.25 (+0.10 private, −0.10 at her stress ≥ 80), distortion 0.25 (+0.15 at her stress ≥ 50), partial 0.3. A leak raises her suspicion by 15 / 25 / 35 (halved for a false item, × her `frequencySense`); discovery at 100 gives her `knows_frequency` (P9 leverage), an extreme hit and a hidden, fast-spreading, pinned fact whose knowers the day step syncs after P3b's rumor spread. Burning the implant is one-way (confirm) and softens a later discovery to major.
- **Debts.** A visit about weekly (never before day 5) is a night entry of its own panel (`HANDLER_VISIT_KIND`, no unit, priority 6). Intel: at most one item per kind, five in all. Answers: truth / partial / false / withhold; payment 20 CR + 3 supplies per truth, half per partial, full per false, a plyx per three truths, halved at pressure or suspicion 60; withhold +10 pressure, truth −5; a threat from 40, a leak from 85. Truth comes back 2–5 days later as an ambush exposure (10 days, danger +1 on the first two combats), sabotage (+2 days on an upgrade, else −10 supplies) or a faction shift (rival +10, own −5), each adding `10 × strength × (1 − 0.1 × (Cunning − 1)) × Π oversight_scrutiny` to oversight's suspicion; a lie is found out on a draw at 0.5 (+15 handler suspicion). Oversight at 100 opens the defining dilemma; a watcher (night-aware defect or stress 60) on a visit night may find out (0.15 × 1.5 with the defect) and opens a major dilemma about her.
- **Where the code differs from the plan text.** Demand candidates are demands she has *not delivered* (`undelivered`), not `open`; discovery happens at the day step, not the moment suspicion reaches 100; a lapsed visit spends no slot; an exposure is not consumed by a run; "own faction hostile" is own standing at most −50; "leash_weekly −1 for 14 days" is the world `leash` effect −1 (there is no timed Leash effect); `double_agent` carries a −5 own-standing cost because the loader needs a cost on every option; the `defector_arc` thread is opened by the engine (a world `thread` effect cannot create one); the order key `y` is the sixth order key and an order that needs an unlock is absent from the combat screen without it. Every other numbered ruling is in the plan's ledger rulings and in the code comments of the file that owns it.
- **Text.** The spec calls the commander "he/him/his"; nothing this package writes may (lore §0; `tests/content/pronouns.test.ts` covers the registries, directives and glossary). The spec's directive "she senses static around him" is `{Name} senses static around the commander.`; `protect him` is `protect_commander`. All authored text (trait cards, fragments, premonition lines, nightmare lines, handlers, dilemmas, `defector_arc` beats) is marked `AUTHOR TO WRITE`.
- **Memory check.** No `memoryRules` entry. The discovery of the frequency and the handler's leak already write a fact at the site (a hidden spreading fact, a public one); the debts soldier's secret is P9c's squad secret; premonitions, nightmares, intel answers and consequences are the commander's own or hidden state the squad cannot remember; the relation events (`knowledge_leak`, `accused`, `false_accusation`, `frequency_exposed`, `debts_exposed`) carry `eventDeltas[].journal` phrases.

### Non-obvious things to know before touching P12 code
- **Read by effect type, field or context, never by id:** traits by `hasTraitEffect(state, reg, 'frequency' | 'paranoia' | 'debts')`, defects by `frequencySense` / `nightAware`, world options by `oversight_scrutiny`, secret kinds by `source`, dilemmas by `contexts`, options by their `id` slug, measures by a `bench` side effect, orders by `requiresUnlock` + `unlock_order`. No engine or UI file names a trait id.
- **The hidden truth never leaves the engine:** whether an intercept was true (`Intercepted.true`, read in exactly one place: the leak's suspicion), whether a premonition was real, suspicion values, the handler's suspicion and pressure (shown only as a band), oversight's suspicion. Events carry ids and kinds, never `true` / `real` / numbers. Every one is a sentinel in `tests/fixtures/analyze/hidden.ts`, and the identical-DOM tests (`tests/ui/freqChip.test.ts`, `tests/ui/premonitions.test.ts`) fail if a true/false flag shows.
- **No draw without the trait.** Every roll sits behind `hasTraitEffect`; commander stress exists in every campaign but never draws; `tests/special/unaffected.test.ts` runs a seeded week with and without an empty `special` block. A change that moves a seeded test stops and reports. Rolls only happen when someone qualifies (a visit with nothing to sell, a nightmare with nobody fond, a watcher with no qualifying defect or stress draw nothing).
- **Order of the day end:** `director_tick`: `specialDayStep` (dead units' records, discovery at 100, decay, lapse of an unanswered visit, due consequences, oversight check, queued cases, then the paranoia step) must run after P6's loyalty step — `actions/special` is imported after `actions/loyalty` (a test pins it in `app.ts`). `dm_rumors`: `specialRumorStep` (knower sync after P3b's spread, the handler's visit, the nightmare) before `night_check`.
- **`special/state.ts` is a leaf** (types, tuning, `forgetSpecial`, `holdsSpecial`, `preemptBonus`, `OWN_PANEL_KINDS`): `social.ts`, `loyalty/desertion.ts` and the comms actions read it without a cycle. `OWN_PANEL_KINDS` repeats the loyalty confrontation kinds as a literal; a test pins that they are all in it.
- **`removeFromService` calls `forgetSpecial`** (and the day step drops what a dead unit held): her intercepts, suspicion, premonitions, preempt windows, scheduled consequences, a `discoveredBy` and a queued `debts_unit` case go with her.
- **A model-reportable event is offered only with something to report:** `knowledge_leak` needs intercepted items (`leakInput`), `accused` a warned unit (`warnedInput`); an empty list reads byte-for-byte like none, and `validateIntents` drops an id not in the list.
- **A dilemma answer of a debts context** is completed by `debtsChoice` after `chooseDilemma`; the authored effects (flags, standing, Leash) are in the templates, the rest is code.
- **Directive ids** are `special:`-prefixed (`static:<unitId>`, `nightmare`, `handler`), derived from state on every refresh; keep new ones away from the prefixes P9, P9d, P9b, P9e, P9c and P11 reserve (`tests/power/herCallDirectives.test.ts`).
- **A one-way choice asks first:** `focus[].confirm` is the question; `performActivity` asks it and spends nothing on a no. An own-panel night (`isOwnPanelNight`) is refused by `night/open`, the door and `night/ignore`.

### Open items
- **The wiring of the handler night in `app.ts`** (`confrontationNight` → the HANDLER panel → `special.answerVisit`) has no app-level test; the manual test covers it.
- **A punishment read from dialogue** (a `commander_enforced` intent) is not scored as acting on a warning; only the menu punish, the Leash `compel` (forced) and `suppress`, and `roster/set_active` are. The `leash/compel` hook has no test of its own.
- **The author's:** every probability and clock speed (`TUNING.special`), the handler characters, the `defector_arc` beats, the fragment, premonition and nightmare wording, the trait cards.
- **Same-day reaction to a discovery:** a frequency discovery and a unit finding out about the debts are confronted at the day end or the visit's close, not the instant suspicion reaches its limit.
- **Not built (the spec's own open decisions):** the handler as a full character with a card, and a timed Leash effect for `confess`.

Final counts at the end of the package: 387 test files, 6408 tests, all passing (baseline before P12: 363 files, 6174 tests); `tsc` clean.

