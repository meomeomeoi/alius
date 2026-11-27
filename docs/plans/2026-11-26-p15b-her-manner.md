# P15b: Her Manner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** two holders of one style play differently. Six manner axes over the style word, what draws her, the mood of the day, her quirks, two faces (everyday / in the dynamic) and slow drift with a rare turn of the style, plus the `regal` way into probing (§12).

**Architecture:**
- **One reader, one helper.** `mannerOf` gives her axes, `drawnBy` and the mood of the day. `bend` gives a style number moved by an axis. At 0 every helper returns its base, so every existing table stays the base.
- **Engine readers** (practices, physics, the slap) call `bend` where they read their style row.
- **Ported instruments** bend their own style row once, through `bendRow`, which is declared in their `fidelity.json`.
- **The holder directive** takes its manner from `faceNow`.
- **Drift** is a P14b axis kind `manner`. P15b feeds its accumulators itself, the engine proposes the steps and the review words them.
- **Everything new is gated on `bond.practice.manner` being present.**

**Tech Stack:** TypeScript 5 (strict), vitest (+ jsdom), zod for registries. No new dependencies.

**Spec:** `docs/packages/P15b-her-manner.md`. Read all of it, especially:
- §3, the readers table;
- **Rulings of the planning session (2026-11-26)**, which win over the sections above them;
- TUNING;
- §12.

Before Task 1, also read:
- `CLAUDE.md`, the P15, P16, P15a, P14b, P14c, P10e and P10e chunk (e) lines and the rule **"How often to run the tests"**;
- the **Implemented as** of P15, P16, P15a, P14b, P14c and P10e chunk (e);
- `docs/prototypes/README.md`, for the instruments' style rows;
- `docs/content/lore.md` §0.

## Global Constraints

- **Gate:** every new effect needs `bond.practice.manner` present. A holder without it, and every old save, keeps every number, line and draw it has today. The face rule of the holder directive (§6) is the one exception, because it is the fix. A seeded test that moves stops and reports: `tests/dynamic/unaffected.test.ts`, `tests/practice/unaffected.test.ts`, `tests/blocking/unaffected.test.ts`, `tests/sim/practiceLongRun.test.ts`.
- **At 0 nothing moves.** With every axis at 0, no `drawnBy`, a steady temperament and no quirks, the numbers are P16's, P15a's and the approved prototypes' exactly. Each bending task pins this with a test.
- **No rng draw.** Chances are `dynamicHash` / `dynamicRoll` / `practiceRoll` of a stable key. Where an existing draw's threshold is bent, the number of draws stays the same.
- **Axes:**
  - integers −2…+2;
  - the mood adds per day;
  - every sum is clamped to ±2;
  - `practiceStyles[].manner` places are −3…+3.
- **Hidden** (sentinels in `tests/fixtures/analyze/hidden.ts`): the manner accumulators, the mood as a number, the distance to a turn and turn eligibility, which quirks are offered or voiced, the styles' places on the axes. Shown: her axes, `drawnBy`, the two faces, the quirks, the contrast word.
- **Memory check:** spec §10 and §12.4.
  - A step and a turn are P14b development moments, with no rule.
  - Face, mood and quirks are bookkeeping.
  - The contrast scales P15's gossip, with no new spread.
  - `hypothetical_answered` gets a `memoryRules` entry and a resolver: audience her, no spread, importance 1.
  - No journal, chronicle or `group: 'memory'` provider.
- **Lore §0:** no pronoun and no feeling of the commander in any text. A quirk or `everyday` text that gives one is dropped whole at import and at edit.
- **P7a:** every new field, chip and line carries `data-analyze`. Glossary entries go in `content/core/glossary.json` and `CORE_GLOSSARY_IDS`. Live values are read through `Knowledge.dynamic`.
- **Directives** stay `dynamic:`-prefixed: the holder line, `dynamic:quirk:<unitId>`, the manner moment's one-time line.
- **Read by field and type, never by id.** Styles go through `styleOf` / `practiceOf`. Life events are read by `mood`, axes by kind.
- **Fidelity:** a ported instrument changes only at its one `bendRow` wiring point, which is declared in its `fidelity.json` with its reason. Any other change to a ported function fails the gate.
- **Test runs (CLAUDE.md):**
  - inside a task, run the task's own test files;
  - run `npm run build` before each commit, and commit `dist/index.js` and `style.css`;
  - at the end of each chunk, once: the full `npm test`, `npm run typecheck`, and `npm run test:layout` where CSS changed.
- **Execution (author):**
  - one implementer per chunk (Opus, effort medium);
  - after the last chunk, one reviewer of the whole package (Opus, effort high), then its fix wave.

  Stop at each chunk's boundary.

## Review Focus

1. **An old save or a holder without `manner`** gets byte-identical numbers in every reader, including the instruments. Pinned per bending task (Tasks 4, 6, 7, 8).
2. **Zero-based tables and sums past ±2:**
   - a scale bend of `drill`'s `noDurationShare` 0 stays 0, and a low `order` raises it only by shift (Task 4);
   - manner +2 plus mood +1 is clamped to +2 (Task 10).
3. **Mixed company** (one who knows, one who does not), an empty participant list, and a DM (no face) give the right face (Task 8).
4. **A turn while a practice or a physics is open** changes nothing in that run: the style moves at the review's day step and is read fresh by the next run (Task 13).
5. **Locked fields** never re-import or drift. A failed review still drifts through `fallbackReview`. No axis moves twice within 28 days (Tasks 2, 11).

---

## Chunk m1: the profile, import and the dossier

### Task 1: The new profile fields, the reader and the helper

**Files:**
- Create: `src/engine/dynamic/manner.ts`.
- Modify:
  - `src/engine/dynamic/types.ts`: `Practice` gains `manner?`, `drawnBy?`, `everyday?`, `contrast?`, `quirks?`; `PracticePatch`; `PRACTICE_LOCK_FIELDS` gains `manner`, `drawnBy`, `everyday`, `quirks`; `PracticeStyleEntry.manner`.
  - `src/engine/dynamic/profile.ts`: `validatePractice`, `mergePractice`, `keepLockedPractice`.
  - `src/content/schemas.ts`: `PracticeStyleSchema.manner`, six integers −3…+3.
  - `content/core/practiceStyles.json`: the eleven places of spec §7.
  - `src/engine/tuning.ts`: `TUNING.manner`, from the spec's TUNING table.
- Test: `tests/dynamic/manner.test.ts`, `tests/dynamic/profile.test.ts`.

**Interfaces:**
- Produces:
  - `MANNER_AXES = ['intensity','warmth','order','voice','tempo','curiosity'] as const`, `MannerAxis`, `DRAWN_BY = ['pain','power','reaction','discipline','discovery'] as const`, `QUIRK_WHEN = ['switch','during','after','address'] as const`, `CONTRASTS = ['low','mid','high'] as const`.
  - `Practice.manner?: Record<MannerAxis, number>` (−2…2); `drawnBy?: DrawnBy[]` (1–2); `everyday?: string` (≤160); `contrast?: Contrast`; `quirks?: Array<{ when: QuirkWhen; text: string }>` (2–3).
  - `mannerOf(state, reg, unitId): { axes: Record<MannerAxis, number>; drawnBy: DrawnBy[]; mood: Partial<Record<MannerAxis, number>> } | null`. `null` when `manner` is absent. The axes are the stored ones plus the development overlay (Task 11) plus the mood (Task 10; `{}` until then), clamped to ±2.
  - `bend(base: number, step: number, kind: { scale: number; cap?: number } | { shift: number } | { gate: number }): number`. A scale multiplies by `1 + step × k`, capped at `cap`. A shift adds `step × k`. A gate returns `step >= gate ? 1 : 0`. **`step === 0` returns `base` (or 0 for a gate) exactly.**
  - `bendBy(state, reg, unitId, axis, base, kind): number`: `bend` with `mannerOf`'s axis, or `base` when `mannerOf` is null.

- [x] **Step 1: Write the failing tests:**
  - `bend(450, 0, …)` is `450` for every kind; `bend(1000, 2, { scale: 0.15 })` is `1300`; `bend(4, -1, { shift: 0.5 })` is `3.5`; a cap holds.
  - `validatePractice`:
    - keeps a valid block;
    - drops an axis out of range (that axis alone), a `drawnBy` outside the five or a duplicate, an `everyday` over 160 characters;
    - drops a quirk or `everyday` whose text gives the commander a pronoun (use the existing pronoun check of the expectation texts), **whole**.
  - Locks: a locked `manner` is kept by `keepLockedPractice`.
  - `mannerOf` is `null` without `manner`; it clamps; it reads the overlay `development.practice.manner` (an empty overlay is ignored).
  - `practiceStyles` loads with the eleven `manner` places, and the schema rejects a value outside ±3.
- [x] **Step 2: Run** `npx vitest run tests/dynamic/manner.test.ts tests/dynamic/profile.test.ts` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** the task's tests and `tests/content` → PASS. Then `npm run build`.
- [x] **Step 5: Commit** `feat(P15b): her manner in the practice profile`

### Task 2: `profile_import` and its budget

**Files:**
- Modify: `src/llm/calls/profileImport.ts` (`SCHEMA_PART.practice`, the instructions), `src/setup/profile.ts` (the extras read from settings), `src/settings.ts` (`budgets.profile_import_practice` 600, `budgets.profile_import_expectations` 400, as call-type-like budget keys or a small `importExtras` record; follow how `budgets` merges), `src/ui/shell/sysTab.ts` (two inputs in "Output budgets"), the glossary (`setting:budget:profile_import_practice`, `…_expectations`, in the existing setting-glossary convention).
- Test: `tests/llm/profileImport.test.ts`, `tests/setup/profile.test.ts`, `tests/settings.test.ts`.

**Interfaces:**
- Produces: the practice section asks for `manner`, `drawnBy`, `everyday`, `contrast` and `quirks` (spec §8). The budget extra is `settings.budgets.profile_import_practice` / `…_expectations` instead of the inline 300 / 400.

- [x] **Step 1: Write the failing tests:**
  - the practice section's JSON shape lists the five fields;
  - a recorded answer fills them through `validatePractice`;
  - a locked field is not re-imported;
  - the budget multiplier uses 600 for practice, and changing the setting changes it;
  - SYS shows both inputs, and a value below 1 snaps back.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** → PASS; `npm run build`.
- [x] **Step 5: Commit** `feat(P15b): the import asks for her manner; its budget in SYS`

### Task 3: The dossier's PRACTICE block

**Files:**
- Modify: `src/ui/dynamic/profileBlocks.ts` (`renderPracticeBlock`: the six axes as five-step controls with their end words, `drawnBy` as chips (one or two), `everyday` and the quirks as editable text, the contrast as a word; each with `[ LOCK ]` as the existing rows), `src/ui/squad/squadTab.ts` / `src/ui/setup/calibration.ts` (pass-through only), `content/core/glossary.json` + `CORE_GLOSSARY_IDS` (`manner_intensity` … `manner_curiosity`, `drawn_by`, `face_everyday`, `face_dynamic`, `quirks`, `contrast`, `style_turn`), the registry reading of `practiceStyles:<id>` (`src/analysis/`) naming the style's place in words only (the numbers stay hidden).
- Test: `tests/ui/dynamic/profileBlocks.test.ts`, the analyze coverage test.

The end words of §1 go into a data table: `TUNING.manner.words` or a small registry. The directive (Task 8) reads the same table.

- [x] **Step 1: Write the failing tests:**
  - five steps per axis, with the step's word at ±1 / ±2 and nothing at 0;
  - setting a step calls `onSet({ manner: … })`;
  - a locked or non-editable block is disabled;
  - a drifted axis (overlay) shows its current step with the "since joining" mark (the existing P14b mark's class);
  - every control resolves `data-analyze`;
  - the reading of `practiceStyles:regal` contains no digit of its place.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** → PASS; `npm run build`. Chunk end: full `npm test`, `npm run typecheck`, `npm run test:layout`.
- [x] **Step 5: Commit** `feat(P15b): her manner in the dossier`

## Chunk m2: the practices

### Task 4: The practice readers bend

**Files:**
- Modify:
  - `src/engine/practice/offences.ts` (`severityOf`: `intensity` shift before the one rounding);
  - `punish.ts` (`ceremonyOf`: `order` −2 → null; +2 → the steps whose `styles` include `ritual`, for any style, at `minSeverity` or more);
  - `request.ts` (`sealedShare`: `order` down and `curiosity` up raise it by shift; `noDurationShare`: `order` down raises it by shift, never for `ritual` / `drill` at `order ≥ 0`);
  - `hold.ts` (`forgotChance`: `warmth` down and `intensity` up, shifts; a style at 0 is lifted only by a positive shift);
  - `denial.ts` (`permissionAnswer`: `warmth` +2 grants like affectionate, after the `rule` / `refusalAt` deny);
  - `postures.ts` (`postureWindowMs`: `tempo` scale);
  - `src/engine/physics/segment.ts` (the jaw's `restGranted`: `warmth` +2 grants, −2 refuses, whatever the style);
  - `src/engine/practice/slap.ts`:
    - `slapWindowMs`: `tempo` scale;
    - after `flinched`: `warmth` +2 gives affectionate's softer favour, and `intensity` +2 cruel's second slap, for any style;
    - `intensity` −2 gives no second slap.

  Numbers: the spec's TUNING table.
- Test: `tests/practice/manner.test.ts`.

- [ ] **Step 1: Write the failing tests.** One block per reader:
  - **(a)** without `manner` the value equals today's (call the reader on a profile with and without the block);
  - **(b)** at all zeros it is the same;
  - **(c)** the spec's direction and size at ±1 / ±2;
  - **(d)** the zero-based rows (spec TUNING: "never for `ritual` / `drill` at `order` ≥ 0"):
    - `ritual` and `drill` at `order` 0 or +2 have `noDurationShare` 0;
    - at `order` −1 / −2 the shift lifts it from 0 (+0.03 per step);
    - a scale would leave it at 0, so the code must use the shift.

  Also `tests/practice/unaffected.test.ts` and `tests/sim/practiceLongRun.test.ts` unchanged.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** through `bendBy` (Task 1).
- [ ] **Step 4: Run** the new test, `tests/practice`, `tests/sim/practiceLongRun.test.ts` → PASS; `npm run build`.
- [ ] **Step 5: Commit** `feat(P15b): her manner bends the practices`

### Task 5: What draws her and what she asks for

**Files:**
- Modify:
  - `src/engine/dynamic/types.ts`: `dynamic.practised?: { kinds: string[]; categories: string[] }`, written only for a holder with `manner`;
  - `src/engine/practice/checks.ts`, `tasks.ts`, `punish.ts`: record a kind and its categories when a practice is kept or done;
  - `src/engine/dynamic/regard.ts` (`regardFromEvents`, the `physics_outcome` and `physics_slip` branches) and `src/engine/practice/tasks.ts` / `punish.ts` (an accept at the first offer): the `drawnBy` favour (planning ruling 7), via `addFavour` (`src/engine/dynamic/hold.ts`), +1 main and +0.5 second;
  - `src/engine/practice/seeds.ts`: `pickSeeds(..., opts?: { minTier?; fresh?: boolean })` filters the pool to kinds and categories not in `practised`, if any remain;
  - `request.ts`: make the request key before the pick; with `curiosity` > 0, `practiceRoll(holder, 'new:<key>') < share` (TUNING: +1 → 0.2, +2 → 0.4) turns `fresh` on; also the replace path;
  - `src/engine/practice/validate.ts` (`buildPracticeInput`) and `src/llm/calls/practiceGenerate.ts`: the brief carries her manner words, `drawnBy` and "this one is something new".
- Test: `tests/practice/drawnBy.test.ts`.

- [ ] **Step 1: Write the failing tests:**
  - each of the five `drawnBy` outcomes gives +1 (main) or +0.5 (second) once, and nothing without `drawnBy`;
  - a task accepted after a refusal or a negotiation is not "at the first offer";
  - `practised` is written only with `manner`;
  - `curiosity` +2 over 200 request keys asks "fresh" about 40 % of the time (±8 %), and 0 or below never;
  - "fresh" with nothing new left falls back to the full pool;
  - the brief's text has the words and, when fresh, the line;
  - the number of `practiceRoll` calls without `manner` is unchanged (the long-run's draw stack).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run build`. Chunk end: full suite, typecheck.
- [ ] **Step 5: Commit** `feat(P15b): what draws her, and something new`

## Chunk m3: physics and the instruments

### Task 6: The engine's physics numbers bend

**Files:**
- Modify:
  - `src/engine/physics/style.ts` / `segment.ts`:
    - `openingWidth`: `tempo` scale of `windowMs`;
    - the counted share: `order` decides how often a free beat carries a counting cue (`count`) or a shift cue, by shift of the threshold, not a new draw;
    - `voice`: the share of cue-bearing beats; `sparse` stays a draw with a bent threshold;
    - `beatsPerSegment`: `tempo` scale of `segmentSeconds`, rounded to whole beats, at least 2;
  - `run.ts` (the seal word one step by `intensity` at ±2);
  - `boundary.ts` (the PRESSES step: `intensity` scale of the +0.25 / −0.25);
  - `src/engine/physics/style.ts` (`effectiveHoldsUntil`: `warmth` +2 one step toward `signal`, −2 toward `limit`, never to `blackout` without `breath_play`);
  - `src/engine/physics/segment.ts` (`planJaw`: `TUNING.physics.jawOrders` `every` by `tempo`, `ask` by `voice`);
  - `src/engine/tuning.ts` (`GULP_STYLES[k].warn` read through a bend at its reader in `physics/gulp.ts`; the gated table itself stays as it is, and the bend is declared in its `fidelity.json`).

  The holder's manner reaches the physics through a reader hook like `registerPhysicsStyle`: `registerPhysicsManner((state, holderId) => axes | null)`. The physics layer imports nothing of the dynamic.
- Test: `tests/blocking/manner.test.ts`.

- [ ] **Step 1: Write the failing tests:**
  - per bent number: without a manner reader, or at zeros, the plan of a seeded segment is identical (deep-equal `planSegment` output and the rng's draw count);
  - with `tempo` +2 the opening is wider by the TUNING factor;
  - `order` +2 gives more counted cues;
  - `voice` −2 fewer cue beats;
  - `warmth` +2 turns `limit` into `signal`, and `warmth` −2 never reaches `blackout` without `breath_play`;
  - `tests/blocking/unaffected.test.ts` is unchanged.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `tests/blocking`, `tests/physics` (wherever they live) → PASS; `npm run build`.
- [ ] **Step 5: Commit** `feat(P15b): her manner bends the contact physics`

### Task 7: `bendRow` in every instrument

**Files:**
- Create: `src/ui/scene/instruments/kit/bendRow.ts`.
- Modify: the style-row reader of each instrument (one wiring point each, where its prototype row is looked up):
  - breath `st()`;
  - weight `STYLES` row lookup;
  - scent `words.ts` row;
  - jaw `jawRowOf` row;
  - the frame / throne `T_TELE`, `W_RESTS`;
  - service `servicePaceOf`;
  - shoe `footwear.ts` row;
  - gulp's `GULP_STYLES` row;
  - the slap's `SWING` alias.

  Also each instrument's `fidelity.json`: one declared difference per instrument, "the style row is bent by her manner (P15b, `bendRow`); at 0 it is the same row".
- Test: `tests/ui/instruments/bendRow.test.ts`, the fidelity test.

**Interfaces:**
- Produces: `bendRow<T extends Record<string, unknown>>(row: T, axes: Record<MannerAxis, number> | null, kinds: Partial<Record<keyof T, FieldKind>>): T`, where `FieldKind = 'time' | 'lead' | 'jitter' | 'feint' | 'magnitude' | 'patience' | 'rests' | 'lines'`.
  - The mapping (planning ruling 1): `time` and `lead` by `tempo`, `jitter` and `feint` by `order` (down = more), `magnitude` by `intensity`, `patience` and `rests` by `warmth`, `lines` by `voice`.
  - The factors are in `TUNING.manner.instrument`.
  - **`axes === null` or all zero returns `row` itself (the same object).**
  - Numbers in `[lo, hi]` pairs bend both ends.
- Each instrument reads `axes` through `env` (the scene's state and `mannerOf` via a UI reader, the same way it reads `physicsStyleOf`).

- [ ] **Step 1: Write the failing tests:**
  - `bendRow(row, null, …) === row`, and with zeros `=== row`;
  - `tempo` +2 scales a `time` field and a `[lo, hi]` pair;
  - per instrument: mounting it for a holder without `manner` reads the identical row (spy on the row reader);
  - the fidelity test passes with the declared differences and fails if a second change is made.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Port nothing new: only wrap the row lookup.
- [ ] **Step 4: Run** `tests/ui/instruments` → PASS; `npm run build`. Chunk end: full suite, typecheck, `npm run test:layout`.
- [ ] **Step 5: Commit** `feat(P15b): the instruments read her manner`

## Chunk m4: the two faces and her quirks

### Task 8: `faceNow` and the holder directive by face

**Files:**
- Create: `src/engine/dynamic/face.ts`.
- Modify:
  - `src/engine/practice/audience.ts`: export `selectFewOf(state, reg, holderId): string[]`, extracted from `pickAudience`;
  - `src/dynamic/directives.ts`:
    - `holderDirective` by face (spec §6);
    - the style line words the axes away from 0 and `drawnBy`, from Task 3's word table;
    - the probe line and the offer line follow the face;
    - running directives are untouched;
  - `src/engine/dynamic/knowledge.ts`, `gossip()`: `gossipChance` × the contrast factor (TUNING `contrast`), capped at 0.9.
- Test: `tests/dynamic/face.test.ts`.

**Interfaces:**
- Produces: `faceNow(state, reg, unitId, present: string[]): 'dynamic' | 'dynamic_to_commander' | 'everyday' | 'mask'`.
  - Present means besides her and the commander.
  - None, or a practice, physics or dynamic moment of hers runs → `dynamic`.
  - All know (`levelOf(...) === 'knows_dynamic'`, or the romance's `publicity.level === 'public'`), and her `audience` allows them (`show_off`, `indifferent`, or `select_few` with all in `selectFewOf`) → `dynamic_to_commander`.
  - All know but not allowed → `everyday`.
  - Anyone who does not know → `mask` if there is no romance or it is `secret` (planning ruling 2), else `everyday`.

- [ ] **Step 1: Write the failing tests:**
  - each row of the face table;
  - mixed company: one knows and one does not → `mask` without a romance, `everyday` with a known romance;
  - an empty `present` → `dynamic`;
  - the directive per face: its text holds the style line / the everyday line / "nothing of the dynamic shows" / "keeps up the appearance";
  - at `equal`, no everyday line;
  - a running `practice:` directive is unchanged in every face;
  - the contrast factor at `high` makes gossip more likely and never above 0.9;
  - no pronoun for the commander in any output.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `tests/dynamic` → PASS; `npm run build`.
- [ ] **Step 5: Commit** `feat(P15b): which face a scene shows`

### Task 9: Her quirks, offered once

**Files:**
- Modify:
  - `src/engine/dynamic/types.ts`: `DynamicOffer.quirks?: Array<{ unitId; when }>`;
  - `src/engine/dynamic/intents.ts`: `dynamicIntentInput`, `applyDynamicIntent` (`quirk_voiced { unitId, when }`);
  - `src/engine/relations/vocab.ts`: `DYNAMIC_INTENT_TYPES`;
  - `src/llm/calls/intentExtract.ts`: the offered list and its type line, as P14c's jokes;
  - `src/dynamic/directives.ts`: `dynamic:quirk:<unitId>`, worded "if it fits, … once";
  - per-scene bookkeeping on the dynamic (`dynamic.quirkScene?: { sceneId; offered: QuirkWhen[] }`), reset with the scene.

  Triggers (spec §5): `switch` when the face turns from everyday to dynamic in a scene with her; `during` while a practice or physics of hers runs; `after` when it ends; `address` with the first `during` of a scene.
- Test: `tests/dynamic/quirks.test.ts`.

- [ ] **Step 1: Write the failing tests:**
  - each trigger offers its quirk once a scene, and never again after `quirk_voiced`;
  - an unknown `when` in a report is dropped;
  - a holder without quirks offers nothing;
  - a chat switch (new scene id) forgets the offered set.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run build`. Chunk end: full suite, typecheck.
- [ ] **Step 5: Commit** `feat(P15b): her quirks`

## Chunk m5: the mood of the day

### Task 10: `mannerMoodOf`

**Files:**
- Modify:
  - `src/engine/dynamic/manner.ts`: `mannerMoodOf(state, reg, unitId, day): Partial<Record<MannerAxis, number>>`, folded into `mannerOf`;
  - `src/content/schemas.ts`: `LifeEventSchema.mood?: 'good' | 'irritated' | 'low'`;
  - `src/engine/life/types.ts`;
  - `content/core/lifeEvents.json`: the 44 marks of spec §4, with the seven unmarked rows left without `mood`;
  - `src/dynamic/directives.ts`: one clause when the mood moves an axis, from the word table.

  The sources:
  - `moody` (`temperamentOf`) gives each of `intensity`, `warmth` and `tempo` a hashed −1 / 0 / +1 (`dynamicHash(…, 'mood:<axis>:<day>')`);
  - a `life_event` of that day, found through `life.units[id].last[eventId] === day`, with its `mood`: `good` = `warmth` +1, `tempo` −1; `irritated` = `warmth` −1, `intensity` +1; `low` = `intensity` −1, `voice` −1; several moods add up;
  - a failed run that day (`state.lastExpedition?.outcome === 'failed' && lastExpedition.day === day`) gives `warmth` −1.
- Test: `tests/dynamic/mood.test.ts`.

- [ ] **Step 1: Write the failing tests:**
  - `steady` with no event → `{}`;
  - `moody` is stable for one day and differs across days for some key;
  - each mood kind moves its axes;
  - two moods add up;
  - manner +2 plus mood +1 reads +2;
  - without `manner`, nothing;
  - the directive clause appears only when an axis moved;
  - the mood is never shown (sentinel).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run build`. Chunk end: full suite, typecheck.
- [ ] **Step 5: Commit** `feat(P15b): the mood of her day`

## Chunk m6: drift and the turn

### Task 11: The `manner` axis kind, her accumulators, the engine's steps

**Files:**
- Modify:
  - `src/engine/development/types.ts`, `axes.ts`, `src/content/schemas.ts` (the axis id regex and kind enum), `src/content/refs.ts`, and P14b's discrete-axis helpers (`scaleOfAxis`, `discreteAxis`, `room`, `writeDiscrete`, `wentUp`, `axisForbidden`): the new kind `manner` (`manner:<axis>`, `manner:drawn_by`). `discreteCap` does not apply to it.
  - `content/core/developmentAxes.json`: seven rows (`up` / `down` `AUTHOR TO WRITE`).
  - `src/engine/state/types.ts`: `Development.practice.manner?: Partial<Record<MannerAxis, number>>`, `drawnBy?`, `primary?`.
  - `src/engine/dynamic/types.ts` and the frame transition in `src/engine/dynamic/`: `dynamic.playSince?: number` and `dynamic.mannerStepped?: Partial<Record<MannerAxis | 'drawn_by', number>>`, the day of each axis' last step.
  - `src/engine/dynamic/mannerFeed.ts` (new): the pushes of spec §7 from the dynamic's own events, through `registerEventLanded` or its event sites. The table goes in `TUNING.manner.push` (planning ruling 4); values `AUTHOR TO TUNE`, drafts that make two steps of one axis need about two months of steady push.
  - `src/engine/development/review.ts`: `eligibleAxes` lists a manner axis that is past the threshold and 28 days after its last step (from `playSince`). The engine's proposal is in the review input, the review may word or decline it with a reason, and `fallbackReview` applies it as proposed.
  - `applyReview` / `writeDiscrete` writes the overlay, and UNDO is `ReviewInverse.practice`.
  - `src/llm/calls/developmentReview.ts`: the proposed steps.
- Test: `tests/development/manner.test.ts`.

- [ ] **Step 1: Write the failing tests:**
  - the pushes accumulate only for a holder with `manner`;
  - `mercy ≥ 2` blocks the `warmth −` push from yielding;
  - no axis is proposed before its threshold or within 28 days of its last step (or of `playSince`);
  - a failed review still applies the step (`fallbackReview`);
  - the step is a development moment (quiet, no toast) with its one-time directive in the next scene with her;
  - a locked `manner` never drifts;
  - UNDO reverts the overlay;
  - `discreteCap` does not stop the second step after 28 more days.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `tests/development`, `tests/dynamic` → PASS; `npm run build`.
- [ ] **Step 5: Commit** `feat(P15b): her manner drifts`

### Task 12: What draws her drifts

**Files:**
- Modify: `src/engine/dynamic/mannerFeed.ts` (the five `manner:drawn_by.<kind>` pushes of spec §7), `review.ts` (one change at most every 28 days: the candidate is the highest accumulator that is not first; it becomes second, or swaps with the second, never replacing the first directly), `manner.ts` (`mannerOf` reads the overlay's `drawnBy`).
- Test: `tests/development/drawnBy.test.ts`.

- [ ] **Step 1: Write the failing tests:**
  - a one-entry `drawnBy` gains a second;
  - a second becomes first only at a later step;
  - the pace rule holds;
  - a locked `drawnBy` never moves.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run build`.
- [ ] **Step 5: Commit** `feat(P15b): what draws her drifts`

### Task 13: The turn of her style, and `styleOf` everywhere

**Files:**
- Modify:
  - `src/engine/dynamic/profile.ts` (`styleOf` folds the overlay's `primary`);
  - every raw read of `bond.practice.style.primary` outside `profile.ts`: find them with `grep -rn "style.primary" src/engine`; the map lists milestones, probes, hold, aftermath, command, bookings and axes. Each becomes `styleOf(unit).primary`, or `practiceOf`;
  - `src/engine/development/review.ts` (the turn):
    - her absolute place = her style's place + her axes;
    - the nearest other style by the sum of absolute differences;
    - eligible when closer by `turn.margin` 2 for two reviews in a row and `turn.days` 56 since `playSince` or her last turn;
    - proposed by the engine, applied by the fallback;
    - the overlay `primary` = the new style; her former primary becomes the secondary when she had none or it was further;
    - her axes rebased in the overlay so her absolute place does not jump (clamped ±2);
    - a development moment with its scene;
  - the retired secondary drift: `practice:style.secondary` is never proposed again; its row stays readable;
  - `src/scene/developmentContext.ts` / `words.ts` (`changedAxes`: the practice and expect drift, planning ruling 11).
- Test: `tests/development/turn.test.ts`.

- [ ] **Step 1: Write the failing tests:**
  - the author's arc of spec §7: `affectionate` at `intensity` +2, `warmth` −2, `order` +2 turns to `regal` after two qualifying reviews and 56 days, and her absolute place is unchanged by the rebase;
  - one qualifying review is not enough;
  - every former raw reader now sees the turned style (one test per reader: e.g. milestones' `requires.styles`, bookings);
  - **a run open at the turn keeps its style**: the run's style is read at its start; the next run reads the new one;
  - without an overlay every reader returns what it did;
  - `since_joining` lists a practice drift;
  - the secondary is never proposed.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `tests/development`, `tests/dynamic`, `tests/practice` → PASS; `npm run build`. Chunk end: full suite, typecheck.
- [ ] **Step 5: Commit** `feat(P15b): the turn of her style`

## Chunk m7: the `regal` way in (§12) and closing

### Task 14: Probe rows with `needs`, the seven axes, `hypothetical_answered`

**Files:**
- Modify:
  - `src/content/schemas.ts` (`ProbeAxisSchema.needs?`, per §12.1);
  - `src/engine/dynamic/types.ts` (`ProbeAxisEntry`);
  - `src/engine/dynamic/probes.ts` (`pickAxis`: a row with `needs` enters only with `manner` present and an alternative holding; a matching `styles` alternative takes two places);
  - `headStart.ts` (`axisOf`: the same filter);
  - `content/core/probeAxes.json` (seven rows of §12.2, texts `AUTHOR TO WRITE`, `tier`s as listed);
  - `likes` per planning ruling 9 (`expectationsOf(...).worship.feet.attitude` for `worship`; other categories through `practiceOf`);
  - `src/engine/dynamic/intents.ts` and `src/llm/calls/intentExtract.ts` (`hypothetical_answered { unitId, answer }`: the extractor's short paraphrase, only while a `hypothetical` probe is pending);
  - `content/core/memoryRules.json` + `registerMemoryResolver` (audience her, no spread, importance 1).
- Test: `tests/dynamic/probeNeeds.test.ts`.

- [ ] **Step 1: Write the failing tests:**
  - a woman with no `manner` or no matching `needs` gets the same axis over 200 seeds as before (record the old picks first; they must be equal);
  - a `regal` woman with `manner` gets the new axes, with each matching row twice as likely as a matching non-`regal` one;
  - `feet_in_lap` needs `feet` at `enjoys` or more;
  - head start's pool matches;
  - `hypothetical_answered` writes her fact through the rule, and is dropped when no `hypothetical` is pending;
  - `tests/dynamic/unaffected.test.ts` is unchanged.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run build`.
- [ ] **Step 5: Commit** `feat(P15b): probing by manner`

### Task 15: The joke milestone, the first time below her, being admired

**Files:**
- Modify:
  - `content/core/dynamicMilestones.json`: a row `equal → play` with `requires.styles: ['regal']`, the band of `first_yes`, offer `scene`, placed **before** `first_yes`;
  - `content/core/momentSources.json`: `first_below`, `scope: 'any'`, `external`, its three options;
  - `src/engine/dynamic/`: its trigger via `registerMomentTrigger`, once per pair through `dynamic.firstBelow`, at `testing`, only for a woman a §12.1 row would match;
  - `probes.ts` (`latentCause`: three P3 `praised` events from the commander toward her in 14 days, for `regal` or `drawnBy: power` with `warmth ≤ 0`, gated as Task 14). Count `praised` from `relations[id].history` (`type: 'praised'`), or a small counter written at `registerEventLanded` when the actor is the commander; record the choice in the commit.
- Test: `tests/dynamic/regalEntry.test.ts`.

- [ ] **Step 1: Write the failing tests:**
  - the joke row is chosen for a `regal` woman at `testing`, and `first_yes` for every other;
  - a refused joke row cools down and then `first_yes` can open;
  - `first_below` fires once per pair and never at another band;
  - three praises in 14 days wake a latent `regal` woman, two do not, and a non-matching woman is never woken this way;
  - the P15 and P15a goldens are unchanged.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run build`.
- [ ] **Step 5: Commit** `feat(P15b): the regal way in`

### Task 16: Closing

**Files:**
- Modify:
  - `tests/fixtures/analyze/hidden.ts` (the sentinels of the Global Constraints, each asserted absent from panels, toasts, labels, prompts and readings);
  - `docs/packages/P15b-her-manner.md` (status line; **Implemented as**: rulings as built, deviations, non-obvious things, open items);
  - `docs/00-overview.md` (§9 row 3b `implemented`; §5.4 new interfaces);
  - `CLAUDE.md` (a P15b line in the existing pattern: the gate on `manner`, `bend` / `bendRow` at 0 return the base, `faceNow`, read styles through `styleOf`, `registerPhysicsManner`, the hidden values);
  - **Interfaces already provided by P15b** notes in P16b, P17, P17a–g;
  - `docs/MANUAL_TEST_P15b.md` (two holders of one style with different axes in a session; a moody holder on two days; the faces in company; a quirk once; the dossier edit and lock; a forced drift via the debug tools if any).
- [ ] **Step 1:** add the sentinels and run the analyze tests → PASS.
- [ ] **Step 2:** full `npm test`, `npm run typecheck`, `npm run test:layout` → PASS.
- [ ] **Step 3:** the docs; tick this plan.
- [ ] **Step 4: Commit** `docs(P15b): package closed`
