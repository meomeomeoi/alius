# P7 — Commander Profile & Traits

> **Historical spec.** This package is implemented; where this text and the code differ, the code is the source of truth (see **Implemented as**).

**Status:** implemented (plan: `plans/2026-11-13-p7-commander-profile-traits.md`). Automated tests pass; the in-SillyTavern checklist `MANUAL_TEST_P7.md` still has to be run by hand.

**Depends on:** P0–P6 (as implemented — read the code, not only older specs). **Read:** overview; this file; `content/lore.md` §5 (crimes).

## Goal

The commander stops being a name with a crime. He gets a body (three physical stats), an expression, visible experience and traits. These shape first impressions, which checks are "native" to him, which content he sees and how the squad reads his actions — **without** making a weak or feminine commander a punished build.

## Principles (add to overview §3)

- **Weakness is a playstyle, not a penalty.** A weaker commander is really weaker. The game never compensates it secretly and never dead-ends it. Every physical task has a non-physical route (see §4).
- **Expression has no mechanical value.** Femininity/masculinity never gives buffs or debuffs. It only matters through individual characters' tastes, world options (P8) and narration.
- **Looks fade, deeds stay.** Presence matters most on first meeting and decays with days known.

## 1. Data (campaign state)

```
commander {
  …existing fields
  body { strength: 1..5, endurance: 1..5, reflexes: 1..5 }
  bodyXp { strength, endurance, reflexes }          // training progress
  expression: 1..5          // 1 very feminine … 3 androgynous … 5 very masculine
  seasoning: 1..5           // 1 green … 5 veteran (age/visible experience) — AUTHOR TO CONFIRM (see Open decisions)
  traits: { regular: string[] /*≤2*/, special?: string /*≤1*/ }
  archetype: 'frail'|'slight'|'average'|'fit'|'hardened'   // derived, cached
}
Relation { …existing, metDay: number }   // first day the unit knew the commander (default: unit's join day)
```

Migration: existing campaigns get `body 3/3/2`, `expression 3`, `seasoning 3`, no traits, and a one-time modal on load: "Commander file incomplete — review" (prefilled; skippable).

## 2. Stats and descriptors

Every value is shown as a **descriptor**, never a number (raw values only with "show raw values").

| Stat | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Strength | Feeble | Slight | Average | Strong | Powerful |
| Endurance | Fragile | Delicate | Average | Hardy | Iron |
| Reflexes | Sluggish | Slow | Average | Quick | Lightning |
| Expression | Very feminine | Feminine | Androgynous | Masculine | Very masculine |
| Seasoning | Green | Young | Experienced | Seasoned | Veteran |

Creation: each body stat starts at 1, **pool of 7 points**, no stat above 4 at creation. **Unspent points are allowed and are not converted into anything.** Expression and seasoning are free choices (no pool).

Growth: activity `train` gets a "body" option (pick a stat): XP thresholds 3 / 6 / 10 / 15 sessions per step; the player never has to train. Commander Crisis injuries (P4) can lower `endurance` or `reflexes` by 1 (rare, flagged event) and raise `seasoning` by 1 (scars).

Archetype = sum of body stats: ≤4 frail, 5–6 slight, 7–9 average, 10–12 fit, ≥13 hardened (13+ only reachable through growth).

## 3. Where body stats act

Keep the touchpoints few; weakness must close some doors and open others.

- **Commander Crisis (P4):** commander HP = 20 + 10 × endurance; dodge chance = 6% × reflexes.
- **Presence-only combat action** (one per combat, by archetype): frail/slight → *Unnoticed* (enemies target him 50% less in Crisis); average → *Steady Voice* (one order −1 CP); fit/hardened → *Rally* (−10 stress to all allies).
- **Physical checks** in events, dilemmas and expedition nodes (§4).
- **Long expeditions** (3 slots): endurance ≤2 → "exhausted": next morning slot is lost unless a unit at `friend` or closer covers for him (scene hook).
- **Intimidation route** in P6 talk-down / P9 discipline: strength and seasoning add to the Authority route.

## 4. No dead ends: check routes

Any check in content that requires a body stat **must** declare at least one alternative route. Schema:

```
check { id, routes: [
  { kind: 'body', stat: 'strength'|'endurance'|'reflexes', min: 1..5 },
  { kind: 'delegate', unitFilter?, cost: { trustCheck?: band, affinityCost?, stress? } },   // ask a unit
  { kind: 'social', stat: 'authority'|'insight'|'empathy'|'cunning', min: 1..5 },
  { kind: 'item', itemTag }, { kind: 'bypass', costResource } ] }
```

The content validator (P0 cross-ref pass) **rejects** a check with only `body` routes. `delegate` is the main alternative: the request goes through the unit's Trust (and Impunity from P9): she may comply, comply with a remark (scene hook), demand something (P9 demands), or refuse. Physical weakness thus becomes social gameplay.

## 5. First impression and image

- **Presence** `P ∈ [−15, +15]` = f(archetype, seasoning, authority rank); table in registry `presence`.
- **Decay weight** `w(d) = exp(−d / τ)`, `d` = days since `metDay`, `τ` = 7 (setting).
- **Starting axes** for a unit = existing baselines + presence offsets × unit taste (§6). Applied once at join.
- **Image consistency.** Registry `imageConsistency`: for each archetype group, which event types are *in-image* and *off-image*. Off-image events get a multiplier `m` on their deltas (default 1.3, gains and losses), scaled as `1 + (m − 1) · w(d)`. Examples: a frail/slight commander doing `coerced`, a harsh `commander_enforced` (P9) or a cold sacrifice → off-image (bigger shock); a fit/hardened commander doing `comforted`, `physical_affection`, `apologized` → off-image (bigger warmth). The engine assigns the tag, not the model.

## 6. Unit tastes (import extension)

Extend `profile_import` output with `commanderTastes: TasteTag[]` (≤3) chosen from registry `tastes`:
`respects_strength, wary_of_brutes, protective_of_frail, drawn_to_feminine, drawn_to_masculine, drawn_to_androgynous, drawn_to_older, drawn_to_younger, indifferent_to_looks`.
Each tag: starting offsets (trust/affinity/attraction) and image-consistency tweaks when matched against the commander. Editable in the import wizard; "Re-sync from card" can add them to already imported units. **Attraction offsets only come from tastes, never from body or expression directly.**

## 7. Context line

The P3 context block gets a commander line generated from descriptors (no numbers): `Commander {name}: {seasoning}, {archetype} build, {expression} presentation. {pronouns from persona}.` plus active reputation (P9) when present. Presence-driven directive for early days (w(d) > 0.5): "Units still size him up by appearance."

## 8. Traits

Registry `commanderTraits`: `{ id, name, kind: 'regular'|'special', description, upside, downside, effects[], hooks[], exclusiveWith[], requiresSettings? }`. Pick **up to 2 regular** and **0–1 special** trait. Regular traits follow the defect rule: change the approach, not the power.

v1 regular traits (draft — author tunes):

| id | Upside | Downside |
|---|---|---|
| `insomniac` | Night slot always available (not only on events) | Commander stress accumulates; −1 effective Empathy rank on high-stress days |
| `old_wound` | Seasoning +1 at start; Trust gains +15% for the first 14 days ("he's seen worse") | Crisis HP −10 |
| `silver_tongue` | Cunning grows 50% faster | Units with trigger `lies` detect manipulation more often |
| `pretty_face` | Matching tastes: starting Attraction +10 | Trust gains −10% for the first 14 days ("corporate doll") |
| `bookish` | Insight grows 50% faster | Body training XP −30% |
| `field_medic` | Medbay actions with a unit give +Affinity; Empathy starts at rank 2 | Medbay supplies cost +1 |
| `corporate_polish` | +1 Leash authorization/week; oversight standing + | Units with `corporate −` values: starting Trust −10 |
| `street_raised` | Cunning starts at rank 2; black-market prices −15% | Corporate standing −; Leash approved less often |

Special traits are a **framework in P7**, with **one** implemented to prove the hooks:
- `vow_of_distance` — romantic states filtered out of the relationship graph for this campaign (same filter as the romance setting); platonic `confidant`/`kindred` thresholds −15%; a unique platonic state `sworn` (author describes).

Other special traits: `secret_frequency`, `bloom_paranoia`, `web_of_debts` — P12; the LEASHSWAP mode (supersedes the earlier `collared` idea) — P13; later: `former_off_spec`, `bound_elsewhere`, `voice_synth` (overview §10).

## 9. Setup UI (temporary — P11 makes it diegetic)

New wizard step **COMMANDER FILE** after crime: body pool with descriptors and remaining points, expression, seasoning, traits (cards with upside/downside), live archetype label, buttons **Prefill from persona** (new mechanic call `commander_import`, budget 600: persona text → descriptors, expression, seasoning, 0–2 traits with reasons) and **Random commander**. SQUAD tab gets a **CMDR** card (dossier: descriptors, traits, archetype, reputation slot).

## Out of scope

Special traits other than `vow_of_distance`; reputation/nicknames (P9); diegetic intake (P11).

## Acceptance criteria

1. New campaign: body/expression/seasoning/traits saved; unspent points allowed; archetype correct at every threshold.
2. The validator rejects a body-only check; a check with a `delegate` route resolves through Trust (demand hook stubbed until P9).
3. A frail commander's `coerced` and a hardened commander's `comforted` get the off-image multiplier, decaying with days known (tests at d = 0, 7, 21).
4. Taste tags change starting axes only for matching commanders; body/expression never touch Attraction directly (test).
5. The context line appears and contains no numbers.
6. `vow_of_distance` removes every romantic state from reachable transitions; platonic thresholds are lowered.
7. Old campaigns migrate and show the review modal once.
8. `commander_import` returns valid descriptors from a persona; manual mode works without a mechanic profile.

## Open decisions (author)

- Keep `seasoning` as a slider, or derive it from persona age at import only?
- Pool size (7) and the "no 5 at creation" rule.
- Trait list and numbers.

## Interfaces already provided by P7a (implemented — use, do not rebuild)

- **Explain every new value.** Commander body stats, expression, seasoning, archetype and traits each need a glossary entry (or, for the `traits` registry, a `description`; add the registry to `DESCRIBED_REGISTRIES` / `PLAYER_VISIBLE`) and `data-analyze` on every chip and stat of the COMMANDER FILE step and the CMDR card (`analyzeAttrs` for spans, `analyzeNative` for buttons and labels). The coverage test fails otherwise (overview P12).
- **Readings:** `registerAnalyzeProvider('glossary:<id>', (subject, env, knowledge) => ({ lines }))`. The spec's "where it is used" lines come from `unitStatSteps`-style builders; numbers go through `knowledge.raw()` where they are not already shown on the sheet. Trait effects get their lines from `entryEffects` (extend `effects.ts` for new effect types).
- **Trends and sources** read `state.ledger` (`ledgerFor`, `ledgerLabel`); body stats that change through a dispatch need no extra code.

## Implemented as

Engine: `src/engine/commander/{profile,presence,checks,traits}.ts`, `src/engine/combat/crisis.ts`, `src/engine/actions/commander.ts`. Content: `commanderTraits`, `tastes`, `presence`, `imageConsistency` (new registries), `routeCheck` on authored event options, `requiresTrait` on relationship states, the `commander_body_xp` activity effect, glossary entries. State stays `version: 1`.

### Rulings and deviations from the draft
- **Optional state, seeded once.** `Commander` gained optional `body`, `bodyXp` (tenths of a session), `expression`, `seasoning`, `traits`, `archetype`, `fileReviewed`, `sleeplessDay`, `sleeplessRank`; `Relation.metDay?`; `Unit.commanderTastes?`; `calendar.loseMorning?`; combat `presence?`. Readers use `commanderProfile(state)` (defaults 3/3/2, 3, 3). `createCampaign` and `buildCampaign` write the file with `fileReviewed: true`; `commander/seed` (dispatched by the app on load when `commander.body` is missing) writes the defaults, `fileReviewed: false` and back-fills `metDay` (earliest of `stateSince` and the history). `commander/set_profile` is accepted only while `fileReviewed === false` (same pool rule as creation), `commander/review_done` closes the file. `SetupResult.commander` is optional (absent = defaults).
- **Body growth** uses tenths: one `train` body session (focuses `body_strength` / `body_endurance` / `body_reflexes`, alone only) gives 10 XP; steps cost 30 / 60 / 100 / 150; XP carries over; at 5 nothing happens. The ledger records `body:<stat>`.
- **Commander Crisis.** HP `20 + 10 × endurance + crisis_hp traits`, at least 10 (`TUNING.combat.commanderHp` is gone; the default commander has 50 HP, see `BALANCE_REPORT.md`). Dodge `6% × reflexes` is rolled only when a hit reaches the commander (cover down), before damage, log kind `dodge`. `combat/presence` (free, once per combat, while a squad unit awaits input): the kind comes from the archetype and is stored in `cs.presence` at **every** combat start (a combat saved before P7 has none: `No commander in this combat.`). Unnoticed rolls one chance per enemy decision and then drops `commander` from the options; Steady Voice takes 1 CP off the next paid order (floor 0, a free order does not use it up); Rally gives −10 stress to every standing unit. A downed commander is scarred with chance 0.15 when the combat is finalized (never on an easy-retry rewind): endurance or reflexes −1 (one above 1) and seasoning +1; `commander_scarred { stat | null }`. The code lives in `combat/crisis.ts`.
- **Check routes** are `routeCheck: { id, routes }` on authored event options (dilemma `fixed` options and expedition events); generated options never carry one. The schema rejects a check whose routes are all `body`. Scope: the party in a run, else the living active roster (`routeScope`). Item routes need an owned instance and consume nothing; a supplies bypass pays from the **carried** supplies in a run. A delegate unit complies at Trust band ≥ `trustCheck` (default guarded; 30% with a remark), one band below is a **demand** (a refusal until P9 gives it a price), lower or breaking loyalty refuses; only a compliance pays `affinityCost` and `stress`. A failed or refused route keeps costs and drops gains (`afterFailedRoute`); a closed or stale pick throws with the route's reason and changes nothing. `dilemma/choose { id, index, route? }` and `expedition/choose { option, route? }` take `route: { route, unitId? }`; `dilemma_resolved` carries `routePassed`. An option with every route closed is disabled. Core: `evt_sealed_crate` option 0 (`pry_crate`: strength 3 / delegate low / bypass 2 supplies).
- **First impression.** Presence `P ∈ [−15, 15]` is the sum of the `presence` rows (archetype, seasoning, Authority rank; a missing row is 0). It moves Trust once, at join, by `round(P × Π matched presenceMult)`, plus the matched tastes' offsets and the traits' `starting_trust` / `taste_attraction` (only with a matched taste that gives Attraction: read from the taste's `offsets`, not its id). Join sites: `buildCampaign`, `squad/add_named`, and `gruntRelation` (grunt recruit and the grunt reward; grunts have no tastes). The default commander (Authority 1) has presence −2.
- **Image consistency.** `imageConsistency` groups: `slight_build` (frail, slight) off-image `coerced`; `average_build` none; `strong_build` (fit, hardened) off-image `comforted`, `physical_affection`, `apologized`. Applied in `computeDeltas` after the defect modifiers: `1 + (1.3 · t − 1) · w(d)` on trust, affinity and attraction for the commander's own events (`t` = matched tastes' `imageMult`). The loader checks that every archetype is in exactly one group. τ is the global setting `firstImpressionTau` (1–30, default 7; SYS › Relationships), mirrored into the campaign by `campaign/set_first_impression_tau`.
- **Traits.** `commanderTraits` (8 regular, 1 special) with a closed effect vocabulary (`TraitEffectSchema`); `traitEffects(state, reg, type)` is the only reader. `corporate_polish` and `street_raised` exclude each other (author choice). Start effects: `social_rank` and `seasoning_start` before any unit joins, `faction_start` after the world seed. `early_trust_gain` applies to Trust **gains** of events while `daysKnown < 14`; `relation_event_mult` to all three axes of one event type. `body_growth`, `social_growth` (rounded), `activity_cost` (checked and charged by `activityCost`), `activity_relation`, `crisis_hp`, `leash_weekly`, `terminate_approval` (`terminateChance`), `requisition_price` (`requisitionCost`, rounded up, ≥ 1 per supply) are read at their hook points.
- **Quiet night.** With `night_slot`, an Evening that ends with an empty night queue enters the Night with no `nightEvent` (`isQuietNight`, event `quiet_night_started`); activities read their slot rules as `evening`; `calendar/sleep` ends it for free; an activity there sets `sleeplessDay = day + 1` and copies the `sleepless_rank` effects into `sleeplessRank`, which `socialRank` applies (floor 1; stored ranks never change). `night/open` and `night/ignore` refuse without a knock.
- **Exhaustion.** For every end of a 3-slot run (success, failure, retreat) a commander with endurance ≤ 2 sets `calendar.loseMorning` (event `commander_exhausted`) unless the first living party unit whose state is in `TUNING.commander.coverStates` covers him (`commander_covered`); the next rollover starts in the Afternoon (`morning_lost`), after any night event.
- **Intimidation.** `loyalty/talk_down` with Authority adds `0.03 × ((strength − 3) + (seasoning − 3))` before the clamp.
- **`vow_of_distance`.** `no_romance` is mirrored as `settings.noRomance`, which `intimacyOf` honours (`intimacySetting` is the stored setting; the app compares against that); relationship states may carry `requiresTrait` (new state `sworn`, author text marked `AUTHOR TO WRITE`); `platonic_threshold` lowers the lower axis bounds of the entry conditions of `confidant` and `kindred` by 15% (`platonicThresholds`, also in nested `anyOf`; exit rules are not scaled).
- **`commander_import`.** Mechanic call, budget 600. Persona text is wrapped in `<persona>` and called data; `sanitizeCommanderImport` maps descriptors (case-insensitive, numbers are not descriptors), caps each body stat at 4 and lowers the highest (ties: reflexes, endurance, strength) until the pool of 7 holds, keeps known, unique, regular, non-exclusive traits (≤ 2). A reply with nothing recognisable, an empty persona or a failed call is `manual`. `StAdapter.getPersonaDescription()` reads `powerUserSettings.persona_description` (checked against SillyTavern's source). Special traits are never proposed.
- **Wizard and UI.** Steps `dossier → commander → units → calibration → review`; `WizardDeps.commanderImporter` / `random` are optional. `renderCommanderFile` (shared by the wizard and the review modal; `traitBlockReason` is the one rule for greyed traits), the CMDR card (first in SQUAD), the presence button, a shared route picker (`ui/dilemma/routePicker.ts`), `NIGHT — QUIET` with `[ SLEEP ]`, and toasts for the new events. A unit's tastes are an import section (`tastes`, ≤ 3, never `missing`) and a re-sync section (`commanderTastes` patch, `[]` clears; axes never change).
- **Context.** `commanderLine(state)` is the commander block's second line (descriptors, no digits, no trait names, no pronouns); `Units still judge the commander by appearance.` (no pronoun on purpose: the persona may be of any gender) is added while any present unit has `w > 0.5`.
- **Analysis.** `commanderTraits` and `tastes` are described registries (23 player-visible registries now); readings for `glossary:body_*`, `archetype` and `presence` (`analysis/providers/commander.ts`, registered by `registerCoreProviders`); `summarizeTraitEffect` for the effect lines.

### Open items
- Demands are stubbed: a delegate that is one band short is a refusal until P9.
- Trait list, numbers, taste values and presence rows are drafts for the author; `vow_of_distance` and `sworn` texts are placeholders.
- The commander has no stress stat: Insomniac's downside is the sleepless Empathy penalty, not stress.
- No pronouns in the context line (SillyTavern has no field); persona text stays the host chat's own prompt.
- The reputation slot of the CMDR card is empty until P9.
- The review modal and the decision / confrontation modals take turns (a new modal cancels the open one): the review is shown first, the others come back when it closes. Greyed trait cards and taste chips are soft-disabled (`aria-disabled`) so the analysis panel can still explain them. A route pick the engine refuses unlocks the panel again.
- Not done (final review, minor): the `body:*` ledger entries written by `commander/seed`; `notes` of `commander_import` are never shown; the import sanitizer ignores `requiresSettings`; two `sleepless_rank` effects on one stat do not sum; the review prefill reads the current persona; some UI/analysis texts still say "him".
- The COMMANDER FILE form and the review modal are checked by tests with jsdom only; the layout (`css/60-commander.css`) needs a look in SillyTavern.
