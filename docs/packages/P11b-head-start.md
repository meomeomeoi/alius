# P11b — Head Start: the squad already knows the commander

**Status: spec.** Release 0.1.0 (after P14). **Depends on:** P1 (setup, import), P3 (relations, the relationship graph), P3b (memory rules, facts, chronicle), P7 (first impression, `metDay`, `daysKnown`), P8 (disposition start), P11 (prologue, onboarding, wizard modes, unlocks), P14 (generation envelope: the recap is a generation). **Read:** overview; this file; the **Implemented as** of P3b, P7, P8 and P11; `docs/content/lore.md` (§0).

**Analysis tool (P7a):** the wizard option and the per-unit toggle carry `data-analyze` with glossary entries (`head_start`, `new_arrival`). **P14:** the recap registers a site. **Lore §0:** no pronoun for the commander in any text.

Origin: author request, design session 2026-11-19.

## Goal

Today every campaign starts on the commander's first day: arrival, line-up, first words. A **head start** lets the player begin as if the commander had already been at the base for a while: everyone has met the commander, first impressions have developed, some know the crime, and each woman remembers a moment or two from those days. It is about **acquaintance only**: no missions, XP, levels, spending or world time are skipped.

## 1. The option

WORLD PARAMETERS (or the wizard's first step, next to the Veteran toggle; the plan places it by `kind`/`fields`, P11 rule): **Head start: arrival / one week / two weeks / one month** = `N ∈ {0, 7, 14, 30}`. `0` = today's behaviour, byte-identical.

Per unit in the units step: **New arrival** toggle (default off when `N > 0`): she arrives today as now (`metDay = 1`, no development, she takes part in no recap). This mixes a known squad with a newcomer.

## 2. World time does not move

The campaign still starts on **day 1** (deadlines, world clocks, the director, the economy, objectives, quiet nights all as today). Only acquaintance moves: each non-new unit gets `metDay = 1 − N` and `stateSince = 1 − N` (`daysKnown` = N). Nothing is simulated for the skipped days. The UI reads day 1 as the first day of operations (`AUTHOR TO WRITE` label line).

`metDay` and `stateSince` may be ≤ 0; every reader that assumed `≥ 1` is checked by the plan (P7 `daysKnown` already clamps at 0).

## 3. What changes at the start

All of it happens in `buildCampaign` after `applyDispositionStart` and `applyFirstImpression` (P8/P7 order), deterministic: chances use `fnv1a(<campaign seed>|<unitId>|head_start|<key>)` like P10b; **no new RNG draw** (a seeded test that moves stops and reports).

- **Relations develop in the direction of the first impression:** for each axis the first impression changed, add `firstImpressionDelta × k(N)` with `k(7) = 0.5`, `k(14) = 0.8`, `k(30) = 1.2`, plus a hashed spread of ±3; trust is capped at 55 by the head start (it never makes a woman deeply bonded). Then the relationship graph may take **one** transition from the entry state if its own conditions hold after the deltas and the target's `bondTier` is not `romantic` (read by field, never by state id). Romance stays the player's.
- **Who knows the crime:** chance 0.25 / 0.40 / 0.60 for N = 7 / 14 / 30; ×1.5 when her values react to the crime (`crimes[].valueReactions`), ×1.3 for a curious unit (an `Insight`-like trait when present); cap 0.9. A hit sets `knows_crime` as the existing join site does.
- **Prologue:** campaign steps (`scene`, `expedition`, `guided_slot`) are written as `skipped` through `enterStep` (the one mover); wizard steps follow the chosen wizard mode as today. Onboarding is `done`; every tab is unlocked. The first scene of day 1 gets an opening directive line: the squad has known the commander for N days (`SceneController.opening`; no pronoun for the commander).
- **The dynamic (0.2)** is untouched by default: see P15 §15.14.

## 4. The recap of the first weeks

So the start is not empty, each non-new unit gets **1–2 remembered moments** from those days, and the squad gets a short chronicle paragraph.

**Moments are chosen by the engine** from registry `headStartMoments`: `{ id, sign: 'positive' | 'negative' | 'any', requires?: { values?, knowsCrime?, minDays? }, eventDelta: <eventDeltas row>, importance, tags?, description }`. Count per unit: N = 7 → 1, N = 14 → 1–2, N = 30 → 2 (hashed). The pick follows the sign of her first impression and her values. Draft kinds (texts `AUTHOR TO WRITE`): `shared_meal` (+), `first_argument` (−), `sparring_bout` (any), `night_talk` (+, minDays 7), `commander_mistake` (−), `covered_for_her` (+, minDays 14), `cold_shoulder` (−), `learned_the_crime` (requires `knowsCrime`), `small_favour` (+), `rule_reminder` (any). The engine applies each moment's `eventDelta` (inside the trust cap of §3).

**No moment resembles a probe** of the 0.2 dynamic (registry entries carry no probe axis; P15 §15.14 adds probe-like moments only when the player asks for a dynamic already underway).

**The text is written by the model** in one call `head_start_recap` (mechanic, budget 900; P14 site `setup.head_start_recap`):
- input: N, per unit her card digest, first-impression band, whether she knows the crime, the chosen moment kinds with their descriptions; the commander's profile digest; the start's premise;
- output (schema): `{ units: [{ unitId, moments: [{ kind, text ≤ 240 }] }], chronicle: string ≤ 600 }`;
- the engine validates ids and kinds, never reads the texts for numbers, and stores them; an invalid or failed generation falls back to template lines per kind (`AUTHOR TO WRITE` in `docs/content/prologue.md`). RETRY / REROLL as P14 provides, before the first scene starts.

**Memory (P3b):**
- each moment → a `memoryRules` entry (`head_start_moment`): a fact with `audience` = that unit (and the commander), `spread` none, `importance` from the registry; `hiddenFromCommander` false;
- the chronicle paragraph → one chronicle entry with `audience` = all non-new named units (a chronicle entry without audience would be LOG-only);
- `knows_crime` from §3 writes its fact at the existing site (no rule);
- the new relation events from `eventDelta` rows carry their `eventDeltas[].journal` lines.

## 5. Settings and state

- `SetupResult.headStart? { days: 0 | 7 | 14 | 30, newArrivals: string[], dynamicUnderway?: boolean | string[] }` (the last field is P15's, §15.14).
- `CampaignState.headStart? { days }` for analyze and the director digest ("the squad has known the commander for N days"). Absent = 0; old saves untouched.
- Events: `head_start_applied`, `head_start_moment`. Glossary: `head_start`, `new_arrival`, `head_start_recap`.

## Acceptance criteria

1. N = 0 is byte-identical to today; no new RNG draw at any N.
2. N > 0: day 1 as today, `metDay = 1 − N` for non-new units, development in the first impression's direction with the trust cap, at most one non-romantic graph transition, crime knowledge by the stated chances.
3. New arrivals behave exactly as units of an N = 0 campaign.
4. Campaign prologue steps are skipped through `enterStep`; onboarding done; tabs unlocked; the first scene's opening states the N days.
5. The recap picks moments by sign and values, applies their deltas, gets its text from one P14-wrapped call with a template fallback, and writes facts and a chronicle entry with audiences.
6. No recap moment resembles a probe unless P15 §15.14's option is on.
7. Every new option carries `data-analyze`.

## Open decisions (author)

- Moment texts and fallback lines; the label for "day 1 of operations"; whether `k(N)` and the trust cap need tuning after play.

## Interfaces already provided (use, do not rebuild)

- P7 `applyFirstImpression`, `daysKnown`; P8 `applyDispositionStart`; P11 `enterStep`, `registerStepEntry`, wizard modes, `uiUnlocks`; P3b `registerMemoryResolver`, chronicle audiences; P14 `generate` sites; `initialRelation({ since })` in `src/engine/setup.ts` already takes the start day.
