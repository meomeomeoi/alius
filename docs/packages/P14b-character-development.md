# P14b — Character Development: Drift, Appraisal, Development Facts

**Status: implemented** (plan: `docs/plans/2026-11-19-p14-character-development.md`; automated tests pass, the in-SillyTavern checklist `MANUAL_TEST_P14b.md` still has to be run by hand). Where this draft and the code differ, the code wins: see **Implemented as** at the end. The last package of release 0.1.0 (after P14). **Depends on:** P1 (profile import, re-sync, edit lock), P3/P3b (intents, facts, memory budget, remembered events), P7 (tastes), P8 (values and disposition), P9d (bond profile, content gate), P14 (generation envelope), P7a. **Read:** overview; this file; the **Implemented as** of P3b, P8, P9d and P14.

**Analysis tool (P7a):** development is visible only through analyze readings and the dossier, filtered by `Knowledge`. **P14:** every generation registers a site.

## Goal

Women change from what they live through. Months of kindness make someone a little kinder, if her character has room for it; a woman indifferent to unequal relationships may grow curious, or come to despise them, after seeing what is done around her; a woman who cooks with a friend every week learns to cook. Today the profile is fixed at import. This package adds a slow, nuanced, bounded **development layer** on top of the card and the profile, and **development facts** for what numbers cannot hold.

Author rulings: development is **quiet** (no notification; it shows in behaviour and appears in the dossier afterwards); it must be **nuanced**: the same event moves different women differently, and **context** (was it wanted, who started it, how it ended) matters more than the event's type.

## 1. Three layers

1. **The card** (SillyTavern) — the original personality; never changed by the game.
2. **The profile** (engine) — values (P8), tastes (P7), bond and practice profile (P9d, P15), style.
3. **Development** (new) — `Unit.development { drift: { [axis]: number }, facts: DevFact[], habits: Habit[], anchors: string[], lastReview, pending[] }`. Drift shifts profile fields within bounds; facts carry the rest in words.

The profile a system reads is **profile + development** (`effectiveProfile(unit)`); raw profile fields stay as imported.

## 2. Axes

Drift applies to fields read by type: values (P8 value ids), tastes (gain or lose a taste), bond fields that may move one step (`attachment`, `desire`, `caretaker` on/off, `leadStyle` only through a development moment), practice attitudes per enabled category (`as`, `witness`; P15), style tendencies (P15; the secondary style may change, the primary only through a moment).

**Never drift:** her own limits (`bond.ownLimits`; the card's hard limits are hers), disabled categories, anything the edit lock pins.

**Anchors and inertia:** `profile_import` marks **anchors** — traits the card states strongly ("fiercely loyal", "despises weakness"). Drift on an anchored axis is slower and capped closer to the base; the rest moves more freely within `TUNING.development.cap`.

## 3. Appraisal: the event as she reads it

Experiences and witnessed events (P3 intents, P9 enforcements, P15–P17 practices and stagings, P5/P9e run events, activities) get an **appraisal from her point of view**, produced by `intent_extract` / `scene_summary` alongside the intents they already emit:

```
Appraisal { target: 'her' | 'commander' | 'unit:<id>' | 'squad', wanted: 'yes' | 'no' | 'unclear',
            initiator: 'target' | 'actor' | 'mutual', harm: 'none' | 'minor' | 'serious',
            outcome: 'good' | 'mixed' | 'bad', her_role: 'subject' | 'actor' | 'witness' }
```

- **Misreading:** a witness's appraisal passes through her knowledge (P7a `Knowledge`, P3b facts she holds) and her perceptiveness: with little insight or missing facts she may read consent as coercion or the reverse. When she later learns the truth (a fact reaches her), the appraisal is **revised** and its drift partly reversed.
- Example: a `caretaker` witnessing the commander dominated reads `wanted: no, harm: minor` → protective, toward `dislikes`; the same scene read `wanted: yes, initiator: target, outcome: good` → acceptance, possibly curiosity; a dominant with high autonomy reading the same → interest; a cold woman with low empathy → contempt.

## 4. Two mechanisms

**Engine accumulators (fast, cheap, deterministic).** Registry `developmentRules`: `{ match: { kind, appraisal fields }, by: trait predicates (values, bond, style, practice attitudes), push: { axis, amount } }`. Each appraised event adds small amounts; inertia and caps apply. Accumulators alone never flip a discrete field; they make it **eligible**.

**Development review (nuance).** Mechanic call `development_review` (budget 700, P14 site `development.review`, reroll before applied): per unit, weekly or when accumulators cross a threshold, with enough material.
- **Input:** a card digest, the effective profile, anchors, accumulator values, the appraised experiences since the last review (summaries), existing development facts, enabled categories (disabled never named).
- **Output:** `{ shifts: [{ axis, direction, size: 'nudge' | 'step', reason (≤ 120 chars) }], facts: [{ text (≤ 140, her voice or narrator), kind: 'attitude' | 'value' | 'habit' | 'skill' | 'memory' }] }` (≤ 3 shifts, ≤ 3 facts).
- **The engine validates:** a `step` needs accumulator support above a threshold and respects anchors and caps; a shift against the accumulators is dropped; forbidden axes are ignored; facts are stored as development facts (P3b remembered events of kind `development`).

## 5. Development moments (quiet)

When a discrete field changes a step (e.g. `witness: indifferent → drawn`, `secondary style → affectionate`, a taste gained), it is a **development moment**: the change and its fact apply; the next scene she is in carries a one-time directive so the change **shows in behaviour**; the dossier gains the line **after** that scene (author ruling: quiet). No toast, no cut-in.

## 6. Habits and skills

Repeated activities and companions are counted (`activity × companion`, a practice, a ritual, a region). Past thresholds a **habit or skill fact** is written by the review or by `flavor` ("she learned to cook from Vera", "she hums when she cleans her rifle"). Data may attach a small mechanical hook to a habit (registry `habitEffects`, e.g. a cooking habit: +1 mess quality on her shifts). Most habits are narration only.

P17e's emergent rituals use the same counters.

## 7. In the prompt

A short **"since joining"** block per present unit (top development facts and current shifted traits in words) inside the P3b memory budget, so the main model plays **who she is now**, not only the card.

## 8. Control

- Setting `characterDevelopment`: off / slow / normal (default normal; off = nothing accumulates).
- Re-sync from the card (P1) keeps development (an option resets it for that unit).
- The dossier shows development lines through analyze; editing them follows the edit lock.
- Grunts: no development beyond habits.

## 9. Events

`appraisal_recorded`, `appraisal_revised`, `development_review`, `development_shift`, `development_moment`, `development_fact`, `habit_formed`. No player actions (author ruling: it happens to them).

## Acceptance criteria

1. Effective profile = profile + development everywhere a profile field is read (by type); limits, disabled categories and pinned fields never drift.
2. Appraisals are recorded with her viewpoint, misread under low insight or missing facts, and revised when the truth reaches her.
3. The same event moves women with different traits in different directions (fixture tests on the rules table).
4. Reviews are validated: steps need accumulator support, anchors slow and cap, invalid shifts dropped.
5. Development moments are quiet: behaviour first, dossier after; no notifications.
6. Habits form from repetition; habit effects apply from data.
7. The "since joining" block stays inside the memory budget.
8. Every generation goes through P14; every reading filters through `Knowledge`.

## Open decisions (author)

- The axes list per profile field, the rules table, anchor wording at import, caps and thresholds, review cadence.

## Interfaces already provided by P14 (implemented — use, do not rebuild)

- **Every model call goes through the envelope** (`app.generations`, `src/llm/envelope.ts`): `generate(siteId, key, opts?)`, `retry`, `reroll`, `rerollState`, `drop`, `useFallback`. `callLlm` is imported by that module alone (`tests/architecture.test.ts`).
- **A package that adds a call type or a flavor kind registers its site in the same change:** a `SiteDecl` in `src/llm/sites.ts` (`id` like `<area>.<what>`, `callType`, `surface`, `reroll` mode, `record` mode, generic `label`, glossary id) and the handlers bound by the owning controller (`envelope.bind`: `build` rebuilds the input from the state, `apply` runs the same engine action as before, `fallback`, `committed` / `undo` for the reroll mode). `tests/llm/siteRegistry.test.ts` fails for a call type or flavor kind without a site; the architecture test refuses a direct `callLlm`.
- **A failure** is `refused`, `truncated`, `timeout`, `network`, `invalid_output`, `empty` or `no_profile`; the envelope writes a record (`CampaignState.generations`, at most 20, no prompt, no model text, `detail` never the model's words) unless the site's record mode is `none` or the reason is `no_profile`. Add the chip with `drawGenerationChips(host, ctx.generation, state, surface, filter)` and REROLL with `drawSiteReroll`; a screen draws neither without `generation` in its context. Labels are generic: never put a hidden value in one.
- **The engine decides:** a retried or rerolled value goes through the same sanitizer and the same action as the first one; none of the new actions draws from the rng, so a new site must not either (a seeded test that moves stops and reports).

## Implemented as

Chunks (a) the engine, (b) the review and the moments, (c) habits, the prompt and the player's view. Automated tests at the end: **479 files, 7389 tests, all passing** (the baseline before P14b was 458 files and 7178 tests). The plan's rulings (`docs/plans/2026-11-19-p14-character-development.md`, "Where the plan rules on the spec") are binding where this section does not say otherwise; the user's answers of 2026-11-19 are marked **(user)** there. The draft values (`TUNING.development`, the 16 rules, the 5 habits, every `up` / `down` / `description` / `fallback`) are `AUTHOR TO TUNE` / `AUTHOR TO WRITE`.

### The rulings (copied from the plan)

- **Setting.** `state.settings.characterDevelopment` `off | slow | normal`; absent or invalid = **off** and byte-identical (an old save, every test campaign built without it). `SetupResult.characterDevelopment?` is written into `settings` only when present; the wizard sends the player's choice (default `normal`); SYS › *Character development (this campaign)* dispatches `development/set_mode`. Turning it off keeps what she became and stops recording, counting and reviewing.
- **No rng draw, ever.** A misread chance is `fnv1a(<unitId>|appraisal|<appraisalId>) / 2**32`; a seeded week with `normal` ends with the same `state.rng` as with it off (`tests/development/unaffected.test.ts`).
- **Axes (user):** four kinds, `value` (6; drift −2…2, effective = `clamp(base + trunc(drift), −3, 3)`), `bond` (attachment, desire, caretaker, leadStyle; one place per step, two from the import, one when anchored), `taste` (at most 3) and `like` / `dislike` (tags normalized like import). Values move in whole steps (user); gaining a like removes the same tag from dislikes and the reverse (user). `bond.ownLimits` and `bond.publicity` never drift, nor does anything of a grunt but counters and habits, nor a held axis, nor the bond of a unit without an imported bond.
- **Appraisal (user):** the model reads (`intent_extract` `reading { wanted, initiator, harm, outcome }`, offered only while the setting is not off), the engine views (`recordAppraisal` for the subject or actor inside `applyEventToUnit`, `recordWitnesses` in `applyIntents`, scene channel only; `activity:<id>` for a companion from `activities[].appraisal`). Engine-made events take `eventDeltas[].appraisal` (15 draft rows). **Misreading (user):** witnesses only, only for a clear yes or no; low 0.35 / mid 0.15 / high 0.05, ×1.5 when the subject's relation is `secret`, capped 0.6; a hit flips `wanted` and `initiator`. **Revision (user):** at the day end (after `spreadRumors`) once she knows a newer fact about the subject; half of the misread pushes taken back, half of the true ones added; dropped unrevised after 30 days.
- **Accumulators:** `developmentRules` (data: `match` by event kind / role / target / reading words, `by` her effective values, caretaker, lead style, attachment, insight; `push: [{ axis, amount }]`), each push × severity (0.5 / 1 / 1.5 / 2) × mode (slow 0.5), clamped to ±6 per axis. They never change a profile field; they make an axis eligible.
- **Review:** `development_review` (mechanic, budget 700, site `development.review`, surface `world`, reroll `before_commit`, record `quiet`), due after 3 experiences and 7 days (14 slow) or an accumulator at 4.5; the model proposes at most 3 shifts and 3 facts; `validateReview` drops everything without support, against the accumulator, on an anchored axis below 1.5× the step threshold, at a cap, forbidden or held. Without an answer (a failure, no profile) `fallbackReview` applies nudges only. A nudge moves drift ±0.34 (×0.5 anchored); a step moves one whole number or one scale place and consumes 3.
- **Moments (quiet):** stamped at `scene/start` for the participants, shown at `scene/end` (`shownDay`), unstamped at `scene/abort`; the scene carries a one-time directive `development:<unitId>`; the view and the readings list only shown items; the since-joining block uses all of them (behaviour first). No toast, no cut-in, no `VOICE_OF` entry, no `full` record.
- **Habits:** counters `activity:<id>`, `companion:<otherId>`, `region:<id>` (named units and grunts); a `habits` entry forms at its threshold (a `DevFact` with `source: 'habit'`, `habit_formed`); `effect` (`unit_xp` / `unit_stress`) applies to her as the companion of its activity; flavor kind `habit` (site `flavor.habit`, reroll `free`, record `none`) rewords the line when `habitWording` is on.
- **Control:** HOLD per axis (`development/hold`), EDIT / REMOVE per fact (`development/edit_fact`, `development/remove_fact`); drawn always, `aria-disabled` with the edit lock on. Re-sync keeps development (a **Reset development** checkbox deletes it).
- **Memory check:** `appraisal_recorded`, `appraisal_revised`, `development_review` and `development_shift` are bookkeeping; `development_moment`, `development_fact` and `habit_formed` get no `memoryRules` entry (her inner change, quiet; `Unit.development.facts` is the canonical store and reaches the prompt only through `since_joining`). No relation event, no journal line, no chronicle line.

### Rulings made while building

- **Registry ids are snake case.** `ID_PATTERN` is lowercase, so the bond axis of `leadStyle` is `bond:lead_style` (`bondField(key)` maps it back) and the kind wildcards are `taste:.any`, `like:.any`, `dislike:.any` (a dot cannot be part of a normalized tag). `anchorKey` also reads the camelCase `bond:leadStyle`.
- **The plan's `tags` is `contentTags`.** Rules and habits carry `contentTags` (read by `contentAllowed`; both join `CONTENT_GATED_REGISTRIES` with probes `allowedRules` / `allowedHabits` and fixture entries in the `p9d_gate` pack, and her own limits count like a category that is off). Axes carry none; a `like:` / `dislike:` tag equal to a category id or label is forbidden while that category is off or limited (`axisForbidden`).
- **Readers.** `src/llm/calls/` is exempt from the readers guard (it reads the input structs the controllers build from the effective profile; `tests/engine/development/readers.test.ts` pins the scene controller's). Re-sync builders in `app.ts` and `headStart/moments.ts` carry `// P14b: raw profile`.
- **Appraisals.** A punishment read from dialogue runs through `applyPunishment`, which takes the model's reading (`PunishParams.reading`); a menu punishment records the subject only. UNDO removes the punished unit's appraisals and takes their pushes back (the stored `pushes` are the applied amounts after the clamp); the witnesses' appraisals of the same line stay. Activity appraisals have severity `minor`.
- **Revision is narrower than "any newer fact":** a fact revises a misreading only when it is about the subject and about at most `TUNING.development.reviseAboutMax` (2) people. A squad-wide fact written at the day end would otherwise revise every misreading the next day.
- **Review inverse.** `ReviewInverse.acc` is what the review took (signed), so a REROLL adds it back and pushes recorded since survive; `pending` is restored in front of what came after; `nextId` is restored; a `lastApplied` from before is not. A redo (retry after the fallback, REROLL) is a unit that is **not** due but has `lastApplied`; a unit that is due starts a new review. The redo reads the batch the last review took (`undoReview` on a clone).
- **Controller.** Wired in `app.ts` (`createDevelopment`: `run()` after each settled dispatch, `onEvents` for habit wording, `onSceneOpened` / `onSceneClosed` beside head start's); the site is declared and bound in one commit because the site-registry tests need both.
- **Changed axes are derived** (`changedAxes` in `engine/development/words.ts`: a value that moved a whole step, a bond field away from the import, a like, dislike or taste gained or lost); the since-joining block, the view and the readings agree. The momentDirective strips the `AUTHOR TO WRITE:` marker from the words.
- **Knowledge.** `Knowledge.development(unitId, reg)` (shown axes with the reason, shown facts, habits whose line is shown); `DevFact.habitId` links a habit to its line. The axis address is `developmentAxes:<registry id>` with ctx `{ unitId, axis }` (the panel model resolves registry, glossary and setting sources only).
- **Wizard / SYS.** `Wizard.setDevelopment(mode)`; the select sits in the WORLD PARAMETERS step; `habitWording` (default off) has its glossary entry `setting_habit_wording` and a SYS checkbox.

### Non-obvious things to know

- Every read of a profile field goes through `valuesOf` / `effectiveValues` / `likesOf` / `dislikesOf` / `tastesOf` / `bondOf` (`tests/development/readers.test.ts` fails on a raw `unit.values`, `.likes`, `.dislikes`, `.commanderTastes` or `.bond.<field>` outside the allowed places). `bondOf` takes development only over an imported bond.
- Recording happens inside `applyEventToUnit`, so every caller (punishments, demands, power moves, the leash, a her-call) is covered; a new relation join site needs no extra call. `actions/development.ts` imports `./memory` first so its day step runs after the rumors spread.
- Hidden values (accumulators, pending and misread appraisals, `insight`, an unshown moment or fact) never reach a panel, toast, event text or reading: sentinels are in `tests/fixtures/analyze/hidden.ts`. `insight` itself is a plain word and has no detectable sentinel; its carriers (the misread summaries) do.
- The model's text is stored as text and cut; the engine decides every shift. A review is validated twice (the sanitizer, then `validateReview` inside `applyReview`).
- `since_joining` is a `memory`-group provider (priority 68) and obeys the P3b budget; it names no number.

### Open items

- Texts and numbers: every axis `up` / `down` / `description`, the 16 rules, the 5 habits and their thresholds, the glossary, the directive wording and `TUNING.development` are drafts.
- `scene_summary` appraisals (only `intent_extract` reads now); dilemma appraisal rows (`dilemmaTemplates[].appraisal` exists, no draft sets one); taste rules (no rule pushes a `taste:` axis, so tastes stay put until the author ties them to presence events).
- A habit others would notice as a remembered event (none is written today).
- P15 axes (practice attitudes, styles) are added as axis kinds plus registry rows; P17e's rituals can use the same counters.
- UNDO does not remove the witnesses' appraisals of a punished line.
- The re-sync **Reset development** checkbox lives in the modal in `app.ts` and has no automated test.
