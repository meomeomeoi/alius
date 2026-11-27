# P16b: Service as a Craft — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** service becomes a craft the commander learns: disciplines with xp, lessons and decay, records in fiction time, drills at the base, postures from points that drift (47 presets), her feet and her foot language, unasked care, the sparring hold, and the programmes of the `drill`, `regal` and `vindictive` holders. Two new mini-games: the game of postures and stillness under provocation.

**Architecture:**
- **Two books.**
  - The commander's own book: `Commander.endurance` stays as P15a built it; the other disciplines go into a new `Commander.craft`.
  - The pair's book: a new `Relation.craft` (postures known, her rhythm, her signals, records, norms, the praise log, the sentence, the cares).
  - Both are absent until something is written.
- **One gate.**
  - `craftLive(state, reg, holderId)` is P16's `practiceLive`; `craftOn` is "some holder is craft-live".
  - Unasked care has its own gate, `careOpen` (ruling 7).
  - Without either, nothing is written, nothing is drawn, and no directive or offer appears.
- **The engine owns every number.**
  - The instruments play in real time on engine numbers and report inputs.
  - Fiction time is counted from beats.
- **Lower layers take hooks** and import nothing of the craft: `physics/segment.ts` (`stillnessOf`), `physics/skill.ts`, the activities, `combat/build.ts` (`registerCombatPassive`), the wagers.
- **New code lives in:**
  - `src/engine/craft/` (pure)
  - `src/engine/actions/craft.ts` (imported after `actions/practice` in `src/app.ts`)
  - `src/craft/` (controller, directives)
  - `src/ui/craft/`, plus the ports in `src/ui/scene/instruments/`
  - `src/analysis/providers/craft.ts`

**Tech Stack:** TypeScript 5 (strict), vitest (+ jsdom), zod for registries. No new dependencies.

**Spec:** `docs/packages/P16b-service-craft.md`. Read all of it, especially:
- the **Rulings of the planning session (2026-11-27)**, which win over the sections above them;
- the TUNING table;
- the memory check (§14).

Before Task 1, also read:
- `CLAUDE.md`: the P15a, P15, P16, P10e, P10e chunk (e), P10e chunk (f) and P15b lines, and the rule **"How often to run the tests"**;
- the **Implemented as** of P15a, P15, P16, P15b, P14c, P14b, P7 and P9c, and of P10e chunk (e) and chunk (f);
- `docs/prototypes/README.md`;
- `docs/content/blocking.md` §7;
- `docs/content/lore.md` §0.

**Code map.** Made on 2026-11-27 against `75e02d4`; the baseline is 765 files and 11730 tests, all green. The task text names the places. If the code disagrees, stop and report.

## Global Constraints

- **Off is byte-identical.** Without a craft-live holder (and, for care, without `careOpen`):
  - no `craft` key is written on `Commander` or a `Relation`;
  - no event is emitted, no directive is set, no offer is made, no draw happens.

  Without a practice profile (`herPracticeLive`) a woman gets nothing. Without a `manner` block, "she names the service" never fires.
  The goldens must not move: `tests/{dynamic,practice,blocking,warden}/unaffected.test.ts` against `tests/fixtures/unaffected-week.json`, and `tests/sim/practiceLongRun.test.ts`. Never regenerate a golden; a seeded test that moves stops and reports.
  The new `tests/craft/unaffected.test.ts` (Task 1) pins the same week, plus a week with a holder at `equal`.
- **No rng draw.**
  - Every chance is `craftRoll(state, unitId, key)`, a `practiceRoll` with a `craft:` key.
  - Every pick is an index into a registry-ordered list.
  - Every plan of a posture hold is a hash.

  The draw spy of `practiceLongRun` is extended to `src/engine/craft/` (Task 1). The sparring wager keeps its own draw, unchanged.
- **Read by field and type, never by id.**
  - styles through `styleOf` / `practiceOf`; her axes through `mannerOf`; her expectations through `expectationsOf`;
  - presets by `base` / `points` / `meaning` / `humiliation` / `tags` / `signal` / `noise` / `default`;
  - care rows by `care`; physics by `interaction` / `skill`; crimes by their echo row's `crime` field.
- **Hidden** (each a sentinel in `tests/fixtures/analyze/hidden.ts`): xp numbers (descriptors only; raw values only with "show raw values"), drift rates, a hold's temptation plan, her noticing chance and whether a care was noticed before she shows it, the settling-in count, the exam's pass mark as a number, her unnamed signals, the lesson word before she says it.
  Shown: levels as words, records in fiction time, the norm in her hand, the sentence's term, known signals and postures.
  Live values are read through `Knowledge.craft`.
- **Memory check** (spec §14; CLAUDE.md rule). One `memoryRules` entry plus a resolver each, all `about` her, spread `none`:
  - `record_set`: audience the pair (`her`), importance 1;
  - `exam_passed`: importance 1;
  - `exam_failed`: importance 2;
  - `care_noticed`: audience her, importance 2, with an `eventDeltas[].journal` phrase (it is a relation event);
  - `sentence_set` and `sentence_extended`: importance 2;
  - `sentence_served`: importance 2.

  Bookkeeping (no rule): `craft_xp`, `craft_level`, `lesson`, `posture_taken`, `posture_slip`, `posture_corrected`, `drill_done`, `care_unasked` unnoticed, `foot_signal_given` / `foot_signal_missed`, `praise_given`, `headlock_offered`, the norms.
  No rule for:
  - `praise_missed`: it is an offence, and her discipline writes its own facts;
  - the sparring hold: `wager_resolved` already writes its fact;
  - "she names the service": a line, not an event.

  The journal gets `care_noticed` only. The chronicle gets nothing. Prompts get only `craft:` directives, triggered, never a `group: 'memory'` provider.
- **Directives** are `craft:`-prefixed, derived from the state, triggered, worded "if it fits, … once" and gone once voiced or once their scene ends (P14c §0). Ids are kept away from `dynamic:`, `practice:`, `life:`, `physics:`, `blocking:` and `moment:`.
- **Lore §0:** no pronoun and no feeling of the commander in any text a player or the model reads; the soldiers are "she".
  `tests/content/pronouns.test.ts` lists every file of `src/engine/craft/`, `src/craft/` and `src/ui/craft/`.
- **P7a:** every new stat, chip, option and card carries `data-analyze`. Glossary entries go in `content/core/glossary.json` and `CORE_GLOSSARY_IDS`, with a `setting_<key>` entry for each new setting. Registries carry a `description`.
- **Ruling 2 (scene surfaces):** no new scene surface is drawn before its prototype round is approved (gates G1–G3). PDA surfaces follow the PDA's existing look.
- **Fidelity:** a ported function changes only by a hunk declared in its `fidelity.json`, with its reason.
- **Test runs (CLAUDE.md):**
  - inside a task, run the task's own test files;
  - run `npm run build` before each commit, and commit `dist/index.js` and `style.css`;
  - at the end of each chunk, once: the full `npm test`, `npm run typecheck`, and `npm run test:layout` where CSS changed.
- **Execution (author):**
  - one implementer per chunk: Sonnet, effort high, a background agent of the controller's session; its brief carries the code map's places and the real signatures from the previous chunk's report;
  - prototype gates G1–G3 are run by the controller with the author;
  - after the last chunk, one reviewer of the whole package (Opus, effort high), then its fix wave;
  - if an implementer did not run the full suite after its last change, the controller runs it.

  Stop at each chunk's boundary.

## Review Focus

1. **Off and old saves:**
   - `Commander.endurance` keeps its shape;
   - `stillnessOf` and the rhythm read 0 without craft;
   - re-keyed named postures read an old base name (Tasks 1, 4, 10);
   - no write while nobody is live (all tasks).
2. **Fiction time is the same at every `marathonPace`** and from turn-based play (Task 3).
3. **Decay never drops below level 1** and never touches a key used within 21 days; per-pair knowledge has a horizon of 42 days (Task 2).
4. **A partner drill changes nothing for the companion's old effects** when the focus is not a drill (Task 7).
5. **Unasked care toward a woman at `equal`:**
   - gives only noticing;
   - "she names the service" needs a `manner`;
   - counts only noticed cares in 7 days (Tasks 14, 15).
6. **The programmes book only free slots**, never past a held booking; the sentence ends; a removed holder leaves nothing (`forgetCraft`) (Tasks 19–22).

---

## Chunk c1: the craft book

### Task 1: The state, the gate, the book and the unaffected week

**Files:**
- Create:
  - `src/engine/craft/state.ts` (a leaf: types, closed lists, tuning reads only)
  - `src/engine/craft/gate.ts`
  - `src/engine/craft/book.ts`
  - `src/engine/actions/craft.ts`
  - `tests/craft/unaffected.test.ts`
  - `tests/engine/craft/book.test.ts`
- Modify:
  - `src/engine/state/types.ts`: `Commander.craft?`, `Relation.craft?`
  - `src/engine/tuning.ts`: `TUNING.craft`, drafted from the spec's TUNING table, every number `AUTHOR TO TUNE`
  - `src/engine/physics/skill.ts`: a reader `enduranceLevelOf(state)` (the highest level) for `practice/punish.ts`'s `trainedLevel`
  - the four raw reads of `Commander.endurance` (`activities.ts:142`, `physics/segment.ts:759`, `practice/punish.ts:85`, `src/ui/scene/instruments/jaw/jaw.ts:843`): move them onto `commanderSkill` / `trainedToday` / `enduranceLevelOf` with the same numbers. The jaw port gets a declared hunk.
  - `src/app.ts`: import `actions/craft` after `actions/practice`
  - `tests/sim/practiceLongRun.test.ts`: the draw spy also fails on a stack through `src/engine/craft/`
  - `src/content/schemas.ts`: `RESERVED_EVENT_TYPES` gains `CRAFT_EVENT_TYPES`

**Interfaces:**
- Produces:
  - `DISCIPLINES = ['stillness','posture','rhythm','memory','composure','speech','pain','depth'] as const`, `Discipline`.
  - `type CraftKey = Discipline | \`endurance:${string}\``.
  - `CraftEntry = { xp: number; level: number; lastDay: number }`; for `endurance:*` only `lastDay` is kept here (the xp stays in `Commander.endurance`).
  - `CRAFT_WORDS = ['untrained','raw','practised','steady','seasoned','masterful']`.
  - `CRAFT_EVENT_TYPES`: `craft_xp`, `craft_level`, `lesson`, `record_set`, `posture_taken`, `posture_slip_noted`, `posture_corrected`, `drill_done`, `exam_passed`, `exam_failed`, `care_unasked`, `foot_signal_given`, `foot_signal_missed`, `praise_missed`, `sentence_set`, `sentence_extended`, `sentence_served`, `headlock_offered`, `norm_set`.
    `posture_slip` stays P16's event; the craft's note of it is `posture_slip_noted`.
  - `RelationCraft`: every field optional:
    - `postures: Record<presetId, { xp; day }>`
    - `rhythm: { xp; day }`
    - `signals: Record<motion, { named: boolean; answered: number; day }>`
    - `routine: { xp; day }`
    - `records: Record<key, { longest; clean; noTap; day }>` (seconds of fiction time)
    - `streak: Record<kind, number>`
    - `drill`, `praise`, `sentence`, `cares` (shapes in their tasks)
  - `craftOn(state, reg)`, `craftLive(state, reg, holderId)` (= `practiceLive`), `careOpen(state, reg, unitId)` (the dynamic on, `herPracticeLive`, `relations[unitId].dynamic` present), `craftRoll(state, unitId, key)`.
  - `craftLevel(state, key): number`: for `endurance:<id>` it reads `commanderSkill`.
  - `addCraftXp(draft, reg, key, xp, cause): EngineEvent[]`:
    - for `endurance:<id>` it calls `addEnduranceXp` and stamps `lastDay`; otherwise it writes `Commander.craft`;
    - `craft_level` fires on a level up;
    - the thresholds are `TUNING.physics.endurance.thresholds`;
    - it is a no-op returning `[]` unless `craftOn`.
  - `craftWord(level)`.
  - `craftCapacity(state, key)`: the level, plus the P7 body route for `posture` (`endurance` stat) and `pain` (`endurance` stat), ruling 9.
- [x] **Step 1: Write the failing tests:**
  - `tests/craft/unaffected.test.ts`:
    - the seeded week of `tests/helpers/unaffectedWeek.ts` against the committed golden: same log, same `state.rng`, no `craft` key anywhere;
    - a second week with every category on and a holder at `equal`: same rng, no craft event.
  - `book.test.ts`:
    - xp adds and levels (30/80/150/250/400);
    - `endurance:breath` goes through `Commander.endurance` with the same xp;
    - nothing is written while `craftOn` is false;
    - the words;
    - the body route adds to `posture` and `pain` only.
  - The four moved readers return the old numbers (the existing tests of `activities`, `segment`, `punish` and jaw pass unchanged).
- [x] **Step 2: Run** `npx vitest run tests/craft tests/engine/craft` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** the task's tests, `tests/engine/physics`, `tests/engine/practice/punish*`, `tests/ui/instruments/fidelity.test.ts` → PASS. Then `npm run build`.
- [x] **Step 5: Commit** `feat(P16b): the craft book, its gate and the unaffected week`

### Task 2: Decay and her settling-in

**Files:**
- Create: `src/engine/craft/decay.ts`, `src/engine/craft/streak.ts`
- Modify: `src/engine/actions/craft.ts` (`registerDayEndStep('director_tick', decayCraft)`)
- Test: `tests/engine/craft/decay.test.ts`, `tests/engine/craft/streak.test.ts`

**Interfaces:**
- Produces:
  - `decayCraft(draft, reg)`:
    - a key unused for `TUNING.craft.decay.days` (21) loses one level step: its xp falls to the threshold of `level − 1`, and never below level 1 (for `endurance:*`, through a new `setEnduranceXp` in `skill.ts`);
    - per-pair knowledge (`postures`, `rhythm`, `signals`, `routine`) after 42 days, the same way;
    - nothing runs when nothing is written.
  - `noteClean(draft, holderId, kind, clean: boolean)`: keeps her `streak`.
  - `settlingDue(state, reg, holderId, kind): boolean`: true after 3 clean holds of a kind in a row.
  - `settlingModifier(state, reg, holderId)` picks the modifier her style likes, by hash over a registry-ordered list in `TUNING.craft.settling.byStyle`: `count` / `no_duration` / `speech_rule` / `combined` / `new_posture`.
  - The readers that use it come in Tasks 11 and 19.
- [x] **Step 1: Write the failing tests:**
  - day 21 drops nothing and day 22 drops one step;
  - level 1 holds;
  - a use on day 20 resets the count;
  - `endurance:*` decays through `Commander.endurance`;
  - pair knowledge at 42 days;
  - the streak resets on a slip;
  - `settlingDue` at 3;
  - the modifier is stable for one day and draws nothing.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** → PASS; `npm run build`.
- [x] **Step 5: Commit** `feat(P16b): disciplines fade unused; she adds a load when the commander settles in`

### Task 3: Fiction time, records and holds that pay xp

**Files:**
- Create: `src/engine/craft/records.ts`
- Modify:
  - `src/engine/actions/craft.ts`: an after-action that reads `physics_outcome` and `marathon_done`, through `registerAfterAction` with its events
- Test: `tests/engine/craft/records.test.ts`

**Interfaces:**
- Consumes:
  - `physics_outcome { runId, physicsId, holderId, result, segments, … }` (`physics/run.ts:187`);
  - `beatsPerSegment` (`physics/segment.ts:70`);
  - `marathon_done { hours, unitId, physicsId, result, phases }` (`run.ts:205`).
- Produces:
  - `fictionSeconds(physicsId, beats, level): number` = beats × `TUNING.craft.beatSeconds[physicsId]` × (1 + `TUNING.craft.beatSkill` (0.25) × level).
    The turn-based beats (`turnBeats`) and the real-time beats count the same.
  - A marathon's record is `hours × 3600`.
  - `noteRun(draft, ctx, outcome)` updates `Relation.craft.records[physicsId]`:
    - `longest`;
    - `clean` (no slip in the run: the run's slips, which the executor reads from the run before it ends);
    - `noTap` (result ≠ `tapped`).

    A new best emits `record_set { unitId, key, seconds, kind }`, plus its memory rule and resolver.
    The P16b xp of a hold (`TUNING.craft.xp.phase` 3 a clean segment) goes to `endurance:<physicsId>` beside P15a's `creditHold`. `creditHold` stays the only +10.
- [x] **Step 1: Write the failing tests:**
  - the same run gives the same seconds at the three paces (use `tests/engine/physics/marathon.test.ts`'s fixture), and in turn-based and real-time play;
  - a new best emits `record_set`, an equal one does not;
  - `noTap` and `clean`;
  - the memory rule writes an `fr` fact about her (the resolver shape is checked by `refs.ts`);
  - nothing is written for a holder who is not craft-live.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** → PASS, plus `tests/content` and `tests/engine/memory`; `npm run build`.
- [x] **Step 5: Commit** `feat(P16b): records in fiction time`

### Task 4: Stillness, her rhythm and lessons

**Files:**
- Create: `src/engine/craft/lesson.ts`
- Modify:
  - `src/engine/physics/segment.ts`: `stillnessOf` becomes a registered reader, `registerStillness(fn)`, defaulting to 0; called with `(state, holderId)`. The rhythm gets `registerRhythmKnown(fn)`, defaulting to 0; each known rhythm level widens the openings by `TUNING.craft.rhythm.widenPerLevel`.
  - `src/engine/physics/gaze.ts` and `stimuli.ts:211`: pass the stillness to `noiseOf`.
  - `src/engine/craft/hooks.ts` (new): installs both readers from `Commander.craft.stillness` (−10 % noise per level) and `Relation.craft.rhythm`.
  - `content/core/craftLessons.json` (new registry; `src/content/schemas.ts` and `registries.ts`). Rows `{ id, slip: 'posture_slip'|'physics_slip'|…, point, words: string[] (AUTHOR TO WRITE), description }`.
- Test: `tests/engine/craft/lesson.test.ts`, `tests/engine/physics/stillness.test.ts`

**Interfaces:**
- Produces:
  - `lessonDue(state, reg, holderId, slip)`: whether she names the point.
    - `drill` / `ritual` / `clinical`: always.
    - `cold`: `craftRoll` < `TUNING.craft.lesson.cold`.
    - `playful`: as a joke (its own words).
    - `cruel`: never.
    - Others: by hash.
    - Read through `styleOf`.
  - A slip followed in the same scene by her `punishment_issued` or by her named lesson emits `lesson { unitId, key, xp }`, half the clean xp, once per slip.
  - The directive `craft:lesson:<unitId>` (Task 6 wires it): next_reply, the point's words, "if it fits, once".
- [x] **Step 1: Write the failing tests:**
  - stillness and rhythm read 0 without craft (seeded segment tests unchanged);
  - one stillness level lowers the loudness by 10 %;
  - a slip with no punishment and no lesson pays nothing;
  - with either, it pays half;
  - `lessonDue` by style;
  - nothing draws.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** → PASS, plus `tests/engine/physics`; `npm run build`.
- [x] **Step 5: Commit** `feat(P16b): stillness and her rhythm are learnt; slips teach`

### Task 5: `Knowledge.craft` and CMDR › CRAFT

**Files:**
- Create: `src/analysis/providers/craft.ts`, `src/ui/craft/craftBlock.ts`
- Modify:
  - `src/analysis/knowledge.ts`: `craft(reg): CraftView`
  - `src/ui/commander/cmdrCard.ts`: a CRAFT block after HOLDS. HOLDS keeps its three physics; CRAFT lists every discipline.
  - `src/analysis/providers/blocking.ts`: `ENDURANCE_WORDS` becomes `CRAFT_WORDS`, ruling 8; the existing tests that read the old words are updated with this task.
  - `content/core/glossary.json` + `CORE_GLOSSARY_IDS`: `craft`, `craft_<discipline>` ×8, `craft_record`, `craft_lesson`.
  - `tests/fixtures/analyze/hidden.ts`: xp sentinels.
- Test: `tests/ui/craft/craftBlock.test.ts`, `tests/analysis/craft.test.ts`, the coverage tests

**Interfaces:**
- Produces `CraftView`:
  - `{ disciplines: Array<{ key; word }>; pairs: Array<{ unitId; postures: presetId[]; rhythm: word; signals: motion[]; records: Array<{ key; seconds; day }> }> }`;
  - it holds no xp number unless `showRaw`.
- The CRAFT block: the words, then per pair what is known. Her records are written in her hand (`setHand(el, herHand(...))`) as margin lines ("Day 12 — three minutes under my weight."), composed from `content/core/craftLines.json` (`AUTHOR TO WRITE`), with no commander pronoun.
- [x] **Step 1: Write the failing tests:**
  - the block shows `untrained` everywhere with no craft;
  - the words follow the levels;
  - records show in fiction time, in her hand;
  - every chip carries `data-analyze`;
  - the hidden fixture finds no xp number in the block or a reading.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** → PASS; `npm run build`.
- [x] **Step 5: Commit** `feat(P16b): CMDR › CRAFT`

### Task 6: The craft directives and the controller

**Files:**
- Create: `src/craft/directives.ts`, `src/craft/controller.ts`
- Modify:
  - `src/app.ts`: `applyContext` (:375-400) calls `refreshCraftDirectives` / `clearCraftDirectives` beside the practice ones; the controller is created and fed events; `onChatChanged` drops every `craft:` directive and forgets what it offered.
- Test: `tests/craft/directives.test.ts`

**Interfaces:**
- Produces:
  - `craftDirectives(state, reg, present): Directive[]` with the prefix `craft:`. Chunk c1 has `craft:lesson:` and `craft:record:<unitId>` (she brings up a record, or asks the commander to beat it: once a scene, by a hash per day, only with a record younger than 14 days).
  - `refreshCraftDirectives(builder, state, reg)`, `clearCraftDirectives(builder)`.
- [x] **Step 1: Write the failing tests:**
  - no directive without craft;
  - `craft:record:` once a scene, worded "if it fits, once", with no pronoun;
  - the lesson line names the point and lasts for the next reply;
  - a chat switch clears them.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** → PASS; `npm run build`. Chunk end: full `npm test`, `npm run typecheck`, `npm run test:layout` (the CMDR CSS).

---

## Chunk c2: training at the base

### Task 7: Drills for every discipline, and the partner

**Files:**
- Modify:
  - `content/core/activities.json` (`train.focus`: `drill_stillness`, `drill_recitation` (speech), `drill_rhythm`, `drill_posture`; the posture drill takes a preset choice once Task 9 lands, so add it in Task 12):
    - a focus field `drill: { key: CraftKey; partner?: true }`;
    - `partner: true` only for breath and weight (posture in Task 12).
  - `src/content/schemas.ts`: the focus schema `drill?`; the effect `commander_craft_xp { key }`.
  - `src/engine/activities.ts`:
    - `runActivity` keeps the focus when it carries `drill.partner` and a companion is chosen. Today `:194` drops the focus whenever a companion is chosen; the change is additive, and every other focus is unchanged.
    - The effect `commander_craft_xp` goes through a registered effect reader `registerActivityEffect(type, fn)`, which the craft installs. The lower layer imports nothing of the craft.
    - `ActivityDone` gains `focus?`.
  - `src/engine/craft/drills.ts` (new): `drillXp(state, reg, key, companionId?)` = `TUNING.craft.xp.drill` (15) × 1, ×1.5 with a craft-live holder, ×1.2 with another close woman. Full xp once a day per key (`lastDay`). Emits `drill_done`.
  - `src/ui/ops/opsTab.ts`: the focus select stays visible with a companion when the focus is a partner drill; the drills carry `data-analyze` (`glossary:craft_drill`).
- Test: `tests/engine/craft/drills.test.ts`, `tests/engine/activities.test.ts`, `tests/ui/ops/*`

**Interfaces:**
- Produces:
  - `drill_done { key, companionId?, mult, alone }`;
  - alone, the drill is one click and the slot is spent;
  - a companion on a non-drill focus keeps P2's behaviour exactly.
- [x] **Step 1: Write the failing tests:**
  - each drill pays 15 once a day;
  - a second time the same day pays 0, and the slot is still spent;
  - breath with a holder is ×1.5, with a close non-holder ×1.2;
  - a companion with the `units` focus behaves as today (the existing activities tests pass unchanged);
  - no drill xp without `craftOn`, except the three P15a endurance drills, which keep their behaviour.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** → PASS; `npm run build`.
- [x] **Step 5: Commit** `feat(P16b): drills for every discipline; a partner for the body drills`

### Task 8: The drill with her is a scene

**Files:**
- Modify:
  - `src/engine/craft/drills.ts`: a partner drill opens a scene at the training yard (the `startsScene` path of `activities.ts:321`) with the drill pending (`Relation.craft.drillPending { key, mult, day }`).
  - `src/engine/actions/craft.ts`: `craft/drill_start { unitId }` stages the drill's contact, picked by field (the first `blockingContacts` row whose physics is the drill's physics and that passes `entryAllowed` for her now, in registry order), then starts the physics. At its `physics_outcome` it pays the drill's xp × mult and her verdict:
    - a holder: `rateService` with the scene's verdict, and Regard by style;
    - another woman: no verdict; each craft-live holder of the commander gets the sign `seen_together` (`addSign`, its first producer) when the scene had a witness or she later learns it (P15 witness rules).
  - `src/engine/dynamic/exchange.ts`: `jealous()` reads a partner drill with another woman today.
- Test: `tests/engine/craft/drillScene.test.ts`

**Interfaces:**
- Produces:
  - `craft/drill_start`;
  - `Relation.craft.drillPending`.
  - **No scene surface yet**: the card that starts it waits for gate G3 (chunk c7). Until then the action is reached by tests only.
- [ ] **Step 1: Write the failing tests:**
  - the partner drill opens the scene and the slot is the scene's;
  - `craft/drill_start` picks the contact by field and starts the run;
  - the outcome pays ×1.5 once;
  - the other woman's drill raises `seen_together` for a holder and `jealous` reads it;
  - a stop word ends it with the lesson rules of Task 4.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run build`. Chunk end: full suite, typecheck.

---

## Chunk c3: the engine of postures

### Task 9: The presets as a registry

**Files:**
- Create: `content/core/servicePostures.json` (the 47 presets of `docs/content/blocking.md` §7.3 and `tests/fixtures/dial/presets.ts`), `tests/content/servicePostures.test.ts`
- Modify:
  - `src/content/schemas.ts`: `ServicePostureSchema`, the §7.2 fields:
    - `base` (a `blockingPostures` id);
    - `points` in the dial's states (`src/ui/scene/dial/points.ts` `PointStates`, which has more states than the doc: the code wins);
    - `variants?`, `meaning[]`, `humiliation 0–5`, `tags`, `requires?`, `drift: Partial<Record<point, number>>`, `supports?`, `signal`, `noise`, `item?`, `hint?`, `hogtie?`, `default?`, `description`.
    - Exactly one `default: true` per base.
  - `src/content/registries.ts`, `src/content/refs.ts`.
  - `facing_wall` → `face_to_wall` (the activity keeps its id).
  - `tests/fixtures/dial/presets.ts` reads the registry; the contact sheet (`npm run dial:sheet`) does not change.
- Test: the new content test, `tests/ui/dial/*`

**Interfaces:**
- Produces the registry `servicePostures`:
  - the drift rates from the spec TUNING (arms raised 12, behind head 9, out 10, torso 4, hips 5, knees 3, head 4, feet on toes 10);
  - humiliation, meaning and signal from §7.3;
  - every text `AUTHOR TO WRITE`.
- [ ] **Step 1: Write the failing tests:**
  - 47 rows;
  - every base has one default;
  - every point state is a `PointStates` state;
  - tags are content categories;
  - the dial sheet's 47 drawings equal the fixture's (the existing dial tests);
  - no id equals a `blockingActivities` id.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run build`.
- [ ] **Step 5: Commit** `content(P16b): the 47 posture presets`

### Task 10: Her named postures are presets

**Files:**
- Modify:
  - `src/engine/practice/postures.ts`: `notePosture` / `namePosture` / `callPosture` / `takePosture` carry a preset id. `presetOf(reg, id)` reads an old base id as that base's default preset.
  - `src/engine/practice/state.ts`: the comment on `postures` / `call`.
  - the flavor kind `posture_name` (`src/llm/calls/flavor.ts:318`): the preset's label and its base.
  - `src/ui/practice/postureCall.ts`, `src/ui/scene/dial/dial.ts`: the call's fan and the dial read presets (`dialPoseOf` reads the commander's preset, else the base as today).
  - `src/engine/blocking/`: the commander's blocking keeps the base. The preset is a new optional field `blocking.commander.preset`, set by `posture/take` (Task 12) or by her call, and cleared when the base changes.
- Test: `tests/engine/practice/postures.test.ts`, `tests/ui/practice/postureCall.test.ts`, `tests/ui/dial/dial.test.ts`

**Interfaces:**
- Produces:
  - `practices.postures[holder][].postureId` is a preset id;
  - an old save with a base id reads it through `presetOf` (no migration writes);
  - `blocking.commander.preset?`.
- [ ] **Step 1: Write the failing tests:**
  - an old base name reads as the default preset;
  - a call offers presets and `practice/take_posture` accepts a preset;
  - the dial draws the preset's points;
  - P16's seeded posture tests keep their events (the preset of a base is its default, so an old pick is the same pose).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS, plus `tests/practice`; `npm run build`.
- [ ] **Step 5: Commit** `feat(P16b): her named postures are presets`

### Task 11: Drift, temptation and the hold's plan

**Files:**
- Create: `src/engine/craft/posture.ts`
- Test: `tests/engine/craft/posture.test.ts`

**Interfaces:**
- Produces:
  - `driftRates(state, reg, holderId, presetId, mods): Record<point, number>`:
    - the preset's rates;
    - × fatigue (1 + 0.1 per earlier hold the same day);
    - × load 1.3, × hard floor 1.2 (from the anchor's affordances);
    - × her weight (a `supports` physics running);
    - × (1 − 0.08 per `posture` capacity level);
    - × the posture's mastery on the pair (`Relation.craft.postures`, −5 % per level).

    The gaze has no fatigue term.
  - `temptations(state, reg, run)`: impulses of 30 per scene event (a visitor 50), placed by `fnv1a` of the run and the event, never drawn. The events are read by kind from the scene: a participant joins, a blocking change of hers (undressing: a worn item off), a moment source `third_party`.
  - `PostureRun = { id, holderId, presetId, startedAt, beats, slips, corrections, hidden?, until? }` on `practices.postureRun` (one at a time).
  - The threshold and the slip are the instrument's business in real time. The engine judges the reports (Task 12).
- [ ] **Step 1: Write the failing tests:**
  - each factor;
  - skill and mastery slow the drift;
  - the gaze ignores fatigue;
  - the temptations are the same for the same run, hashed, and are placed only on events;
  - nothing is drawn.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run build`.
- [ ] **Step 5: Commit** `feat(P16b): postures drift; her world tempts the gaze`

### Task 12: Taking, holding, correcting, slipping

**Files:**
- Modify:
  - `src/engine/craft/posture.ts`: `startPostureHold(draft, ctx, { holderId, presetId, until?, hidden?, source })`, the run that P17g's `attendance` reuses (ruling 15);
  - `src/engine/actions/craft.ts`: `posture/take { presetId }`, `posture/correct { point, amount }`, `posture/slip { point }`, `posture/end { reason }`;
  - `content/core/activities.json`: the posture drill with a preset choice (Task 7's field);
  - `src/engine/practice/postures.ts`: her call answered with the preset starts a posture hold when she wants it held (`TUNING.craft.posture.holdShare` by style).
- Test: `tests/engine/craft/postureHold.test.ts`

**Interfaces:**
- Produces:
  - `posture_taken { unitId, presetId }`.
  - Corrections make noise (`noiseOf('posture', stillness)`); if she watches (the scene's attention plan), a loud one reads as fidgeting, a P15a `physics_caught`-like slip of the posture.
  - `posture/slip` calls P16's `noteOffence('posture_slip')` once, and the run's streak resets.
  - The end of a clean hold to her release pays `TUNING.craft.xp.posture` (5) to `posture`, plus the preset's mastery and a record (fiction time from beats × `beatSeconds.posture`). The humiliation of the preset plus the situation (blocking.md §7.2: a friend present +1, the mess +2, …) goes to `regardFall` with `witness` when someone non-knowing is present; then `protocol_public` for those who do not know.
  - The settling-in modifier (Task 2) is applied to her next hold of the kind.
  - **Author, G1 round 1:** a posture beat stands for 45 s of fiction, not 30 (`TUNING.craft.beatSeconds.posture` 30 → 45, ×1.5).
- [ ] **Step 1: Write the failing tests:**
  - take, correct, slip and end;
  - one offence per slip;
  - xp and mastery at a clean end;
  - Regard falls with the witness factor;
  - a hold with no duration keeps its end hidden (`heldEndShown`);
  - the stop word ends a posture run;
  - nothing without `craftLive`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run build`.
- [ ] **Step 5: Commit** `feat(P16b): holding a posture`

### Task 13: The posture directive, the gate of `on_hands`, the SYS toggles

**Files:**
- Modify:
  - `src/craft/directives.ts`: `craft:posture:<unitId>` (the posture she expects and its rules, while a posture run is open; the preset's `promptHint`);
  - `content/core/blockingContacts.json` / the blocking gate: `on_hands` is offered while the commander holds `kneel_present` (`registerBlockingGate`; by the preset's `supports`, not by id);
  - `src/engine/moments/settings.ts`: `INTERACTION_TOGGLES` gains `posture` and `provocation`, defaulting to on; `src/ui/shell/sysTab.ts`: their rows; the glossary `setting_*` entries.
- Test: `tests/craft/directives.test.ts`, `tests/engine/blocking/gate*.test.ts`, `tests/ui/shell/sys*.test.ts`

- [ ] **Step 1: Write the failing tests:**
  - the posture directive appears only with a run and has no pronoun;
  - `on_hands` is offered only with a preset that `supports` it;
  - the toggles mirror into `sceneSettings` and are off-able;
  - the SYS coverage test.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run build`. Chunk end: full suite, typecheck, `npm run test:layout`.

---

## Chunk c4: her feet, unasked care, `[ANTICIPATE]`, the sparring hold

### Task 14: The day of her feet, her care and her combat form, her foot language

**Files:**
- Create: `src/engine/craft/feet.ts`
- Modify:
  - `src/engine/craft/hooks.ts`: `registerCombatPassive(careOfFeet)`;
  - `src/ui/scene/instruments/activity/service.ts`: report a given or missed signal through a declared hunk in `activity/fidelity.json` (`staging.service` gains `signal?: { motion, answered }`). No visual change.
  - `src/engine/actions/physics.ts` (`physics/service`): pass the signal to the craft (`registerServiceReport`, a hook).
- Test: `tests/engine/craft/feet.test.ts`, `tests/ui/instruments/fidelity.test.ts`

**Interfaces:**
- Produces:
  - `feetOfDay(state, reg, unitId): { footwear: 'boots'|'heels'; state: 'fresh'|'worn'|'hot'|'sore'|'bare' }`, derived:
    - `sore` the day of a run she was in and the day after (by `lastExpedition`, its `day` being the launch: today or yesterday);
    - `bare` in her quarters in the evening (her whereabouts now);
    - `worn` / `hot` after a training (`life.busy`) or by `fnv1a`;
    - otherwise `fresh`.

    Nothing is stored. The directive reads it in Task 16.
  - `careOfFeet` (a combat passive):
    - +`TUNING.craft.feet.combatPct` (3) outgoing after a foot or shoe service with a `pleased` verdict since her last run;
    - −3 when she is `sore` and nothing was done;
    - only for a craft-live holder; the other entries are unchanged.
  - `foot_signal_given` (her first naming of a motion, `Relation.craft.signals[motion].named`) and `foot_signal_missed { unitId, motion }`, which feeds `memory` xp for an answered one, and a slip for a missed one (no offence: her correction by presence is the instrument's).
- [ ] **Step 1: Write the failing tests:**
  - each feet state from its source;
  - nothing stored;
  - +3 / −3 and 0 without craft;
  - the fidelity gate passes with the declared hunk;
  - signals named once.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run build`.
- [ ] **Step 5: Commit** `feat(P16b): the day of her feet; her care in her form; her foot language remembered`

### Task 15: Unasked care, and she names the service

**Files:**
- Create: `src/engine/craft/care.ts`
- Modify:
  - `content/core/blockingActivities.json`: the commander's dynamic rows that make sense while she is out (`polishing_her_boots`, `tidying_her_quarters`, `doing_her_laundry`, `preparing_her_gear`, `cleaning_her_weapon`, and others the executor finds by field) gain `care: { notice: 'low'|'high' }`; schema `:2719`.
  - `src/engine/actions/craft.ts`: `care/unasked { unitId, careId }` (one slot, `calendar/consume_slot`; refused unless `careOpen`, she is not with the commander in that slot, and no booking is due).
  - Hub: `src/ui/hub/roomPanel.ts` (her quarters) and the DYNAMIC section show `[ CARE ]` (PDA; `data-analyze`).
  - `src/engine/state/types.ts`: `RelationCraft.cares: Array<{ day; careId; noticed: boolean; voiced?: true; named?: true }>` (the last 14 days).
- Test: `tests/engine/craft/care.test.ts`

**Interfaces:**
- Produces:
  - Noticing = `craftRoll(state, unitId, 'care|'+day+'|'+careId)` < `TUNING.craft.care.notice[row.notice]` (low 0.3, high 0.7) × insight (`Unit.insight`: low 0.7, mid 1, high 1.3).
  - Noticed: `care_noticed { unitId, careId }` (a relation event: an `eventDeltas` row with a journal phrase; memory rule).
    - At `play` or more: `addFavour` +1, a `yielded` sample with motive `her` (`practiceSample`), `regardRise(…, 'value', TUNING.regard.value.min)` by style.
    - At `equal`: nothing more.

    Not noticed: `care_unasked { unitId, careId }`, bookkeeping.
  - The directive `craft:care:<unitId>` (her line "I saw what you did while I was out", by style): in her next scene or DM, once, gone once voiced (`care_noticed` reported, or the scene ends).
  - **She names the service:**
    - the fourth noticed care in 7 days (`TUNING.craft.care.nameAt` 4);
    - by a woman whose hold band is `testing` (`holdBandOf`), at frame `equal`;
    - with a `manner` block, and her style `regal` (`styleOf`) or `curiosity ≥ +1` (`mannerOf`).

    Then `craft:named_service:<unitId>` offers her line once (`AUTHOR TO WRITE`, "fourth time this week you've brought me coffee. Did I ask?"); `named` marks the care so it is offered once. No rule.
- [ ] **Step 1: Write the failing tests:**
  - refused without `careOpen`, or when she is with the commander;
  - the slot is spent;
  - noticing is the same for the same day and draws nothing;
  - `equal` gives no favour;
  - `play` gives favour, the sample and Regard;
  - the line comes at the fourth noticed care within 7 days only with a manner and the style or curiosity, once;
  - no pronoun.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run build`.
- [ ] **Step 5: Commit** `feat(P16b): unasked care; she names the service`

### Task 16: The craft intents

**Files:**
- Modify (the recipe of `hypothetical_answered`):
  - `src/engine/relations/vocab.ts`: `CRAFT_INTENT_TYPES = ['praise_given','foot_signal_answered','care_noticed']`, added to `EVENT_TYPES` (61 → 64; `ALL_EVENT_TYPES` 88 → 91);
  - `content/core/eventDeltas.json`: rows of zeros with a `cause`; a `journal` for `care_noticed`;
  - `src/engine/craft/intents.ts` (new): `craftIntentInput(state, reg, participants, channel)` → `{ craft?: CraftOffer }`:
    - `praise_given` while a craft-live `regal` holder with the praise rule is present (Task 20);
    - `foot_signal_answered` while a foot contact is live and she has signals;
    - `care_noticed` while she has a care not yet noticed in 7 days;
  - spread in `src/scene/sceneController.ts:303`, `src/scene/comms.ts:112`, `src/engine/relations/apply.ts:72`;
  - `src/llm/calls/intentExtract.ts`: input, flags, block, filter, shape, rule;
  - `src/engine/relations/intents.ts`: `craftFields`;
  - `applyCraftIntent`;
  - the payload of `intents/apply` gains `said?: string` (≤ 400; the commander's own words of the exchange, used only by `praise_given` and never sent to a model);
  - the directive `craft:feet:<unitId>` (the day of her feet, when a foot contact or a foot service runs).
- Test: `tests/engine/relations/intents.test.ts`, `tests/llm/intentExtractCraft.test.ts`, `tests/engine/craft/intents.test.ts`, `tests/content/core.test.ts`

- [ ] **Step 1: Write the failing tests:**
  - each type is offered only with its subject; the prompt is byte-identical without (the `prompt_without_reading.txt` pins);
  - a type with nothing offered is dropped;
  - `said` reaches only the praise and never a prompt;
  - the counts 64 and 91.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run build`.
- [ ] **Step 5: Commit** `feat(P16b): the craft intents`

### Task 17: `[ANTICIPATE]` (engine)

**Files:**
- Modify:
  - `src/engine/craft/anticipate.ts` (new): `anticipateShown(state, reg, unitId)` by `HerReading.r` / `.p` thresholds (`TUNING.craft.anticipate`; never `region`);
  - `craft/anticipate { unitId }` stages the first commander activity (registry order) that `fits` her pair tags and passes `entryAllowed`, so P16's `anticipate()` (`practice/service.ts:236`) runs;
  - the directive `craft:anticipate:<id>` (next_reply, worded by style);
  - `practiceSample` widened to take `returned` (for P17e).
- Test: `tests/engine/craft/anticipate.test.ts`

- [ ] **Step 1: Write the failing tests:**
  - shown by the axes only;
  - the staged activity is picked by field and order;
  - `practice_anticipated` follows;
  - hidden axes never reach the chip's text.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run build`.
- [ ] **Step 5: Commit** `feat(P16b): anticipating her (engine)`

### Task 18: The sparring hold

**Files:**
- Modify:
  - `src/engine/personal/wagers.ts`: after `wager_resolved` for a `sparring` game, call a registered hook `registerAfterBout(fn)` (a lower layer takes a hook);
  - `src/engine/craft/headlock.ts` (new): when the winner is a craft-live woman at frame ≥ `play` whose `expectationsOf(...).worship.armpits.attitude` is `enjoys` / `craves`, emit `headlock_offered { unitId }` and set `Relation.craft.headlock = { day }`;
  - `src/craft/controller.ts`: opens a scene at the training yard (`scene/start`, origin `event`, the woman alone) and stages `smothered_armpit` through the staging controller; the approved scent instrument plays; the tap ends it; witnesses (whereabouts in the training room) give `regardFall` with `witness` and `protocol_public`.
- Test: `tests/engine/craft/headlock.test.ts`, `tests/craft/controller.test.ts`

- [ ] **Step 1: Write the failing tests:**
  - only after a lost sparring bout to an eligible woman;
  - the wager's own draw and fact are unchanged (`tests/engine/personal/wagers*` pass unchanged);
  - the scene opens with the contact;
  - a holder at `equal` gets nothing.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run build`. Chunk end: full suite, typecheck, `npm run test:layout`.

---

## Chunk c5: the programmes

### Task 19: `drill`: norms and the exam

**Files:**
- Create: `src/engine/craft/programmes/drill.ts`
- Modify:
  - `content/core/bookingKinds.json`: `drill_exam` and `drill_session` (`locationId` the training yard; `contentTags` none);
  - `src/engine/actions/craft.ts`: the day step;
  - HOME (`src/ui/home/homeTab.ts`): her norm of the day in her hand (derived, not a stored note).
- Test: `tests/engine/craft/drill.test.ts`, `tests/ui/home/*`

**Interfaces:**
- Produces:
  - for a craft-live holder whose style (`styleOf`) is `drill` (primary or secondary), `Relation.craft.drill = { norms: Record<CraftKey, seconds>; examDay; passes }`;
  - the norms are set at the first day step from the commander's records × 1.1 (or the `TUNING.craft.drill.start` seconds), for the keys she cares for (`TUNING.craft.drill.keys`: `endurance:weight`, `endurance:breath`, `posture`); `norm_set`;
  - weekly, a booking `drill_exam` on the next free slot (`book(…, source: 'practice')`, never over a held booking);
  - played, it is a scene where she runs one drill per norm (Task 8's `craft/drill_start`);
  - pass at 80 % of the sum (`exam_passed`, norms +10 %);
  - fail: `exam_failed`, plus `TUNING.craft.drill.failBookings` (2) `drill_session` bookings on the next free slots;
  - her verdicts are lessons (Task 4);
  - `TUNING.regard.drill` doubles the `record` rise (it exists);
  - memory rules for both events;
  - the directive `craft:norm:<unitId>`.
- [ ] **Step 1: Write the failing tests:**
  - norms from the records;
  - the exam is booked on a free slot only;
  - pass raises the norms;
  - fail books two sessions;
  - nothing for another style;
  - HOME shows the norm in her hand with `data-analyze`, and the pass mark is not a number on screen.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run build`.
- [ ] **Step 5: Commit** `feat(P16b): the drill holder's norms and exams`

### Task 20: `regal`: the daily praise

**Files:**
- Create: `src/engine/text/similarity.ts` (a leaf: `wordsOf(text)`, `similarity(a, b)`, a Jaccard over word sets; P17g §2.1 extends it), `src/engine/craft/programmes/regal.ts`
- Modify:
  - `content/core/relationshipRuleTemplates.json`: `daily_praise`, with `practice: 'protocol'`, a new `check: 'praise'`, and `styles: ['regal']`, a new optional field read by field;
  - `src/engine/tuning.ts`: `TUNING.regard.regal { mult: 2 }`;
  - the protocol day step: a day without a fresh praise, or a repeat (similarity > 0.7 to any of the last 30), is `praise_missed` → `noteOffence('protocol_slip')`;
  - `src/engine/text/similarity.ts` replaces the private copies in `memory/promises.ts` and `dynamic/compromat.ts` only where the numbers stay the same (otherwise leave them).
- Test: `tests/engine/text/similarity.test.ts`, `tests/engine/craft/regal.test.ts`

**Interfaces:**
- Produces:
  - `Relation.craft.praise: Array<{ day; text (≤ 160); words: string[] }>`, the last 30, never sent to a model;
  - `praise_given` with `said` writes one entry a day;
  - a fresh one raises Regard (`value`, ×2 for `regal`);
  - the rule is set by her at frame `role` (P16 protocol);
  - `regal`'s mess kiss and audiences are P17g's (ruling 5): nothing of them here.
- [ ] **Step 1: Write the failing tests:**
  - similarity of equal, disjoint and near texts;
  - a fresh praise counts once a day;
  - a repeat and a missed day are slips;
  - Regard ×2;
  - only for a `regal` holder with the rule;
  - the text never reaches a prompt or an event.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run build`.
- [ ] **Step 5: Commit** `feat(P16b): the regal holder's daily praise`

### Task 21: `vindictive`: the sentence

**Files:**
- Create: `src/engine/craft/programmes/vindictive.ts`, `content/core/crimeEchoes.json` (one row per crime: `crime`, `effects[]` by type, `description`, `promptHint`, texts `AUTHOR TO WRITE`)
- Modify:
  - `src/engine/practice/offences.ts` (`pickHolderPunishment`): a registered tilt `registerPunishmentTilt(fn)` puts the echo's punishments first while a sentence runs;
  - `content/core/practiceSeeds.json`: seeds tagged `experiment`;
  - `content/core/practiceStyles.json`: `vindictive.manner.intensity` 3 → 2 (ruling 24; no number moves, because `mannerOf` clamped it).
- Test: `tests/engine/craft/vindictive.test.ts`

**Interfaces:**
- Produces:
  - for a craft-live `vindictive` holder who `knows_crime`, `Relation.craft.sentence = { crimeId, start, until, extended }`:
    - set at a day step (`sentence_set`), the term by the crime (`TUNING.craft.sentence.days`, 7–30);
    - +3 a slip (an offence of the commander toward her: `sentence_extended`);
    - served: `sentence_served` and `regardRise(…, 'dignity')` × `TUNING.craft.sentence.closing`.
  - The echoes by effect type:
    - `give_up` (liquidation): `privilege_revoked`, or a booking with another woman cancelled (`cancelBookingsQuietly`);
    - `through_her` (smuggling): the forced editor (`registerForcedEditor`) while it runs;
    - `experiment`: her tasks from the `experiment` seeds;
    - `obey_day` (purge): a P9c day of obedience once per week of the term;
    - `answer_first` (mutiny): a `protocol_public` rule template;
    - `tithe` (strain_trade): Plyx or credits each week.
  - The DYNAMIC section shows the term (PDA).
- [ ] **Step 1: Write the failing tests:**
  - the sentence starts only with `knows_crime`;
  - +3 per slip;
  - it ends and Regard rises;
  - each echo by type;
  - the punishment tilt answers null with no sentence (P16's seeded picks unchanged);
  - memory rules;
  - removal forgets it.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS, plus `tests/practice`; `npm run build`.
- [ ] **Step 5: Commit** `feat(P16b): the vindictive holder's sentence`

### Task 22: Removal and help with her goal

**Files:**
- Create: `src/engine/craft/forget.ts` (a leaf: `forgetCraft(draft, unitId)`, which drops her pair book, her bookings of `source: 'practice'` made by the craft, and a running sentence or posture run)
- Modify:
  - `removeFromService` calls `forgetCraft`;
  - `src/engine/life/hobbies.ts` (`pushHobby` with `caused`): a registered hook gives `regardRise(…, 'value', TUNING.regard.value.goal)` once a week for a craft-live holder (the reserved "help with her goal").
- Test: `tests/engine/craft/forget.test.ts`

- [ ] **Step 1: Write the failing tests:**
  - every trace is gone after removal;
  - the goal rise fires once a week, only when craft-live.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run build`. Chunk end: full suite, typecheck.

---

## Gates G1–G3: prototype rounds with the author (the controller, not an implementer)

Each round is a live prototype in `docs/prototypes/`, built with `npm run proto -- <name>` and revised with the author until approved. The approval is written into `docs/prototypes/README.md`: what is normative, what is prototype-only, the open engine questions, and the defaults of the file as the approved state. The port chunks start only after their gate.

- **G1 `posture.html`: the game of postures.**
  - The dial as the surface: the target as a ghost, drifting joints in amber, a click or keys 1–7.
  - The gaze tempted by events; blind correction by feel lines.
  - The noise of corrections; her watching.
  - The posture call's schemes B (assemble joint by joint against the clock) and C (her conducting).
  - Uses the engine numbers of Tasks 11 and 12 as its tables, and the dial's own `mannequinSvg` at build time (as `cards.html`).
- **G2 a round on `her_activity.html`: stillness under provocation.** A new inner game: her touches, tickles and whispers as stimuli; any input during one is a slip; its sounds and her lines.
- **G3 a round on `cards.html`: the scene surfaces of P16b.** The drill's card (start, her verdict), the exam and the norm, the sentence, care noticed and her named service, the lesson in her voice, `[ANTICIPATE]` in the chip row, and the sparring hold's opening. The texts go to `docs/content/card-voice.md` first.

---

## Chunk c6: the port of the game of postures (after G1)

### Task 23: The posture instrument

**Files:**
- Create: `src/ui/scene/instruments/posture/` (`posture.ts`, `fidelity.json`), registered with `registerInstrument` (it matches an open `practices.postureRun`)
- Modify:
  - `src/ui/scene/dial/dial.ts`: `target` and `hot` from the run;
  - `src/ui/scene/sceneScreen.ts`: the keys 1–7 (only while nothing editable has focus and the device is down, P10e §178), passed to the instrument;
  - the dial hidden under `sensoryNow`.
- Test: `tests/ui/instruments/posture*.test.ts`, the fidelity test, `npm run test:layout`

- [ ] **Step 1: Write the failing tests** from the README's normative list: drift, correction, slip, keys, blind, reduced motion, and the engine reports (`posture/correct`, `posture/slip`, `posture/end`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Port** the prototype exactly (`fidelity.json`).
- [ ] **Step 4: Run** → PASS; `npm run build`.
- [ ] **Step 5: Commit** `feat(P16b): the game of postures`

### Task 24: The posture call, schemes B and C

**Files:**
- Modify:
  - `src/ui/scene/instruments/call/call.ts`: new functions ported from the prototype, plus the declared hunks in `call/fidelity.json`;
  - `src/ui/practice/postureCall.ts`: the scheme by the commander's `posture` level (A below `TUNING.craft.call.b` (2), B from 2, C from `.c` (4)). In B and C her called posture shows as a ghost while its mastery on the pair is below 2 (G1 round 1): only a posture held many times is recalled. Her set stays P16's cap (her service track level + 1). In B the time is her window plus 2.5 s for each point that has to move, and the posture is taken the moment every point matches (no confirm key; G1 round 1b).
- Test: `tests/ui/practice/postureCall.test.ts`, the fidelity test

- [ ] **Step 1–5:** the same scheme as Task 23. Commit `feat(P16b): the posture call grows with the commander`. Chunk end: full suite, typecheck, `npm run test:layout`.

---

## Chunk c7: stillness under provocation and the scene surfaces (after G2, G3)

### Task 25: Stillness under provocation

**Files:**
- Create: `src/ui/scene/instruments/activity/provocation.ts`, the frame's new inner game (a branch at `frame.ts:1213`, declared in `activity/fidelity.json`)
- Modify:
  - the engine: a provocation is a P15a stimulus; a reaction is a `physics/relief` of kind `fidget`, or a new kind `react` if the prototype asks for it;
  - xp goes to `stillness`;
  - the toggle `provocation`.
- Test: `tests/ui/instruments/provocation*.test.ts`, the fidelity test

- [ ] **Steps 1–5** as Task 23. Commit `feat(P16b): stillness under provocation`.

### Task 26: The scene surfaces

**Files:**
- Modify:
  - the dock and chip row (`src/ui/scene/stage/`);
  - the card draw functions in `src/ui/craft/` (the drill card that calls `craft/drill_start`, the exam card, the sentence card, care noticed, the lesson line);
  - `[ANTICIPATE]` in `CHIP_SLOTS`;
  - `content/core/cardVoice.json` from `card-voice.md`;
  - `cards/fidelity.json`.
- Test: `tests/ui/craft/*`, the analyze coverage, the fidelity test, `npm run test:layout`

- [ ] **Steps 1–5** as Task 23 (each surface from G3, `data-analyze` on each). Commit `feat(P16b): the craft in the scene`. Chunk end: full suite, typecheck, `npm run test:layout`.

---

## Chunk c8: closing

### Task 27: Closing

**Files:** `docs/packages/P16b-service-craft.md` (status, **Implemented as**: where it lives, rulings as built, deviations, non-obvious things, open items), `docs/00-overview.md` (§9 status, §5.4 rows), the **Interfaces already provided by P16b** notes in P16c, P17, P17a, P17b, P17c, P17e, P17g, `CLAUDE.md` (a P16b line), `docs/MANUAL_TEST_P16b.md`.

- [ ] **Step 1:** Write the docs.
- [ ] **Step 2:** Run the full `npm test`, `npm run typecheck`, `npm run test:layout` → PASS.
- [ ] **Step 3:** Commit `docs(P16b): implemented as`. Push.
- [ ] **Step 4:** The whole-package review (Opus, effort high), then its fix wave (each fix test first), then the suite again.
