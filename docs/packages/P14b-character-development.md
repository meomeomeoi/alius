# P14b — Character Development: Drift, Appraisal, Development Facts

**Status: spec.** The last package of release 0.1.0 (after P14). **Depends on:** P1 (profile import, re-sync, edit lock), P3/P3b (intents, facts, memory budget, remembered events), P7 (tastes), P8 (values and disposition), P9d (bond profile, content gate), P14 (generation envelope), P7a. **Read:** overview; this file; the **Implemented as** of P3b, P8, P9d and P14.

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
