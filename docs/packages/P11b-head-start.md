# P11b — Head Start: the squad already knows the commander

**Status: implemented** (plan: `docs/plans/2026-11-19-p11b-head-start.md`; automated tests pass, the in-SillyTavern checklist `MANUAL_TEST_P11b.md` still has to be run by hand). Where this draft and the code differ, the code wins: see **Implemented as** at the end. Release 0.1.0 (after P14). **Depends on:** P1 (setup, import), P3 (relations, the relationship graph), P3b (memory rules, facts, chronicle), P7 (first impression, `metDay`, `daysKnown`), P8 (disposition start), P11 (prologue, onboarding, wizard modes, unlocks), P14 (generation envelope: the recap is a generation). **Read:** overview; this file; the **Implemented as** of P3b, P7, P8 and P11; `docs/content/lore.md` (§0).

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

## Interfaces already provided by P14 (implemented — use, do not rebuild)

- **Every model call goes through the envelope** (`app.generations`, `src/llm/envelope.ts`): `generate(siteId, key, opts?)`, `retry`, `reroll`, `rerollState`, `drop`, `useFallback`. `callLlm` is imported by that module alone (`tests/architecture.test.ts`).
- **A package that adds a call type or a flavor kind registers its site in the same change:** a `SiteDecl` in `src/llm/sites.ts` (`id` like `<area>.<what>`, `callType`, `surface`, `reroll` mode, `record` mode, generic `label`, glossary id) and the handlers bound by the owning controller (`envelope.bind`: `build` rebuilds the input from the state, `apply` runs the same engine action as before, `fallback`, `committed` / `undo` for the reroll mode). `tests/llm/siteRegistry.test.ts` fails for a call type or flavor kind without a site; the architecture test refuses a direct `callLlm`.
- **A failure** is `refused`, `truncated`, `timeout`, `network`, `invalid_output`, `empty` or `no_profile`; the envelope writes a record (`CampaignState.generations`, at most 20, no prompt, no model text, `detail` never the model's words) unless the site's record mode is `none` or the reason is `no_profile`. Add the chip with `drawGenerationChips(host, ctx.generation, state, surface, filter)` and REROLL with `drawSiteReroll`; a screen draws neither without `generation` in its context. Labels are generic: never put a hidden value in one.
- **The engine decides:** a retried or rerolled value goes through the same sanitizer and the same action as the first one; none of the new actions draws from the rng, so a new site must not either (a seeded test that moves stops and reports).

## Interfaces already provided by P11b (implemented — use, do not rebuild)

See **Implemented as** below; the table of engine interfaces is in `docs/00-overview.md` §5.4.

## Implemented as

Chunks (a) the engine, (b) the recap call, the wizard and the screens. Automated tests at the end: **458 files, 7173 tests, all passing** (the baseline before P11b was 441 files and 7015 tests). The plan's rulings are binding where this section does not say otherwise.

### The rulings (copied from the plan)

- **Option and setup result.** HEAD START sits in the **WORLD PARAMETERS** step (`world`, in both wizard modes, found by step kind), after the MODE section; the per-unit **NEW ARRIVAL** toggles sit in UNIT ASSIGNMENT under the tiles. `SetupResult.headStart?: { days: 0 | 7 | 14 | 30; newArrivals: string[] /* cardRefs */; dynamicUnderway?: boolean | string[] }` (the last field is P15's: typed and validated, otherwise unused); the wizard writes it only when `days > 0`. `validateSetup`: days in 0/7/14/30; new arrivals distinct chosen cards; with `days > 0` at least one soldier who is not new ("A head start needs at least one soldier who already knows the commander"); with `days === 0` no new arrivals.
- **`CampaignState.headStart?`** `{ days: 7 | 14 | 30; units: Array<{ unitId; impression; moments: string[] }>; recap?: { source: 'model' | 'fallback'; chronicleId } }`, written only when `days > 0`. `units` lists every soldier who knew the commander (new arrivals are not listed); `recap` is set by the first `head_start/recap`. Absent = 0; the save `version` stays; no migration.
- **The build** (`applyHeadStart`, after the unit loop, after `applyDispositionStart` and `applyFirstImpression` for every unit): known units get `since: 1 − N` (`metDay = stateSince = 1 − N`), then per unit in squad order: **development** (`axis += round(Δ × k(N)) + spread`, `k` 0.5 / 0.8 / 1.2, `spread` −3…3 from the hash, only for axes the first impression changed, written directly and clamped), **crime** (`base(N) × 1.5 if a value reacts`, cap 0.9; a hit runs **`revealCrime`**, so she takes her value reaction), **moments** (`pickMoments`, `applyMoment`), the **trust cap** (`min(trust, max(55, trustBefore))`) and **one transition** (`headStartTransition`: band re-based, `evaluateAutomatic` with `allow: bondTier !== 'romantic'`). Then every `dailyGain` is reset. No rng draw at any N: chances and picks hash `fnv1a(<seed>|<unitId>|head_start|<key>)`.
- **The prologue:** the cold open shows `headStartText` instead of `authoredText` while a head start is set (added after the first release of the package, with the intake and exam alternatives). `enterStep` skips a step of kind `scene`, `expedition` or `guided_slot` while `headStart` is set (listed in `skipped`, `onboarding_step_skipped`), reaches `free`, and the prologue is `done` with every tab open. **(user)** The prologue intake keeps its arrival fiction in prologue mode (open item).
- **User rulings (2026-11-19):** the ×1.3 for a "curious unit" is dropped (no field marks curiosity); a crime hit runs `revealCrime` (flag, `crime_reaction_done` and the reaction); the recap is read on a hub card (THE FIRST WEEKS), not only in the log.
- **The recap:** one mechanic call `head_start_recap` (budget 900, JSON) at site `setup.head_start_recap` (surface `world`, reroll `before_commit`, record `full`), asked by `createHeadStart` in `onLoaded()` once per chat while `recap` is absent. The answer (or the template fallback) is dispatched as `head_start/recap`: the first application writes one chronicle entry (`kind: 'day'`, `audience` = the known units) and emits `head_start_applied` plus one `head_start_moment` per moment (five `memoryRules`, one per importance, turn them into facts with `fr` ids); later applications replace texts in place while `recapCommitted(state)` is null (no scene open, none ended, day 1), and an edited fact keeps its text.
- **Memory check:** `head_start_moment` is remembered (rules `head_start_moment_1…5`: `about: unit`, `audience: unit`, `spread: none`, tag `head_start`; resolver in `engine/memory/resolvers.ts`); `head_start_applied` is bookkeeping; the chronicle paragraph has an audience; the moments' relation history lines carry the `eventDeltas[].journal` phrase; crime knowledge writes no fact (the `learned_the_crime` moment is its remembered form).

### Rulings made while building

- **Fact length is a campaign memory setting** (user request, 2026-11-19). `MemoryConfig.factTextMax` (100–400, default 200) is the player's own choice like `hideScenesAfter`: kept across presets, accepted with any preset in `memory/configure`, never locked, SYS › MEMORY has the input (glossary `fact_length`). `addFact`, `memory/edit`, `memory/rumor_text`, the intent validator (`validateIntents` option `factTextMax`) and the scene-summary and reading inputs (`SceneSummaryInput.factTextMax`, `IntentExtractInput.factTextMax`) read it; `memoryConfig(state).factTextMax` / `factTextMax(state)`. The recap asks the model for `min(240, factTextMax)` characters per moment (`HeadStartRecapInput.textMax`), so nothing is cut silently. `rumor_retell` still asks for 200 (its call has no state). The engine's own moment cap stays 240.
- **`HEAD_START_SKIPPED_KINDS`** lives in `headStart/skip.ts` (a leaf) and is re-exported from `apply.ts`: `onboarding/state.ts` importing `apply.ts` closed an import cycle.
- **`head_start_recap` replaces facts by position:** her facts tagged `head_start` in creation order match her moments in order; a fact pruned or merged by `addFact`'s duplicate check is skipped.
- **The recap's chronicle entry takes a `c` id from `memory.nextId`**; the facts take `fr` ids and leave it alone.

### Non-obvious things to know

- `applyHeadStart` writes the axes directly (as `applyFirstImpression` does: no gain handler, no daily accounting) and resets `dailyGain` at the end; the crime reaction is the only part that goes through the gain handler.
- A moment pushes a history line (`kind: 'event'`) but applies no stress, counts no deed and calls no `evaluateEvent`; only `headStartTransition` can move her state, and its `stateSince` is day 1.
- `newArrivals` are **card refs** (unit ids do not exist before the build); `headStart.units` holds unit ids.
- The **first** recap is always allowed, even after the first scene (the facts must exist); a **replacement** only before it.
- `Digest.knownDays` is present only with a head start.
- The opening directive `head_start:known` is set only in the first scene of day 1 (`memory.scenes` empty), `expiresAfter: 'scene'`; `SceneController.opening` is not turned on.
- The card reads the moment texts from the **facts** through `Knowledge`, never from a cache.

### Open items

- Texts: the ten moments' descriptions and fallbacks, the chronicle fallback, the opening line, the `DAY 1 OF OPERATIONS` label, the glossary and the wizard hint are drafts (`AUTHOR TO WRITE`).
- The ×1.3 curious multiplier returns when a field marks curiosity.
- `k(N)`, the trust cap 55 and the moment → event mapping need tuning after play.
- The prologue's cold open has its own head start text (`headStartTitle` / `headStartText` on the step: a RECOLLECTION instead of the transport, chosen by `Wizard.state.headStart.days > 0`); the intake and exam forms take `headStartTitle` and `headStartLines` (the keys they name replace the step's `lines`; `traits_note` and the dossier's `sign_prompt` stay).
- `Wizard.previewStart` shows Trust without the head start.
- `rumor_retell` ignores `factTextMax`.
