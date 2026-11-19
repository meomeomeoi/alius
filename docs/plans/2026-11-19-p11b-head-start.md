# P11b Head Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A campaign can begin as if the commander had already been at the base for 7, 14 or 30 days. Each soldier who is not a new arrival has known the commander that long: her first impression has developed, she may know the crime, and she remembers one or two moments from those days. The squad gets a short chronicle paragraph. World time does not move: day 1 is still day 1.

**Architecture:**
- **Engine** (`src/engine/headStart/`): pure and deterministic, with no rng draw. Chances and picks hash `fnv1a(<seed>|<unitId>|head_start|<key>)`, where `<seed>` is `buildCampaign`'s `opts.seed`.
- **Build:** `buildCampaign` calls `applyHeadStart` once, after the unit loop (after `applyDispositionStart` and `applyFirstImpression` for every unit). It does three things:
  - moves the axes, the crime knowledge, the moments' deltas and at most one graph transition;
  - stores `CampaignState.headStart`;
  - lets `enterStep` skip the prologue's campaign steps.
- **Recap text** (chunk b): one mechanic call `head_start_recap` through the P14 envelope (site `setup.head_start_recap`), asked by a small controller (`src/headStart/`) when the campaign is first loaded. The answer, or the template fallback, is dispatched as `head_start/recap`. That action:
  - emits `head_start_applied`, plus one `head_start_moment` per moment (the `memoryRules` entries turn these into facts);
  - writes one chronicle entry with an audience.
- **UI** (chunk b):
  - a HEAD START section in WORLD PARAMETERS and NEW ARRIVAL toggles in UNIT ASSIGNMENT;
  - a THE FIRST WEEKS card on the hub until the first scene starts;
  - a DAY 1 OF OPERATIONS chip in the status header on day 1;
  - an opening directive for the first scene.

**Tech Stack:** TypeScript 5 (strict), esbuild, zod 3, vitest (+ jsdom for UI). No new dependencies.

**Spec:** `docs/packages/P11b-head-start.md`. Read before Task 1:
- `docs/00-overview.md` (§5.2, §5.4, §11);
- the **Implemented as** of P3b, P7, P8, P11 and P14;
- `docs/content/lore.md` §0;
- `docs/packages/P15-dynamic-core.md` §15.14 (only for what this package must leave room for).

## Global Constraints

- **Byte-identical at N = 0** (acceptance 1).
  - `SetupResult.headStart` absent, or `{ days: 0, … }`, builds exactly the state a build without the field builds.
  - Every seeded test stays byte-identical: `tests/warden/unaffected.test.ts`, `tests/special/unaffected.test.ts`, every user of `tests/helpers/unaffectedWeek.ts`, and `tests/engine/setup.test.ts`.
  - A seeded test that moves **stops and reports**. It does not get a new golden.
- **No new rng draw at any N.** `state.rng` after a head-start build equals `state.rng` after the same build without one (Task 5 pins it). The recap action draws nothing.
- **Old saves.** `CampaignState.headStart` is optional; absent means 0. The version stays as it is. No migration.
- **World time does not move** (§2).
  - `state.day` stays 1, and so do every clock, deadline, the director's schedule, the economy and the quiet-night logic.
  - Only `Relation.metDay`, `Relation.stateSince`, the relation axes and flags, the relation `history`, the onboarding state, `headStart`, and (from the recap) facts and one chronicle entry change.
- **No pronoun for the commander** in any text a player or the main model reads: glossary, registry `description` / `fallback`, labels, directives, the call's system prompt, the chronicle fallback (lore §0; `tests/content/pronouns.test.ts`). The soldiers are "she".
- **Read by field, never by id:**
  - relationship states by `bondTier`;
  - prologue steps by `kind`;
  - moments by `sign`, `requires` and `tags`;
  - crime reactions by `valueReactions`.
- **Ids.**
  - Engine events `head_start_applied` and `head_start_moment` join `RESERVED_EVENT_TYPES`.
  - The action is `head_start/recap`.
  - The directive id is `head_start:known`. Keep directive ids `head_start:`-prefixed and away from `prologue:`.
  - The site is `setup.head_start_recap`; the call type is `head_start_recap`.
  - Glossary ids: `head_start`, `new_arrival`, `head_start_recap`.
- **Analysis (overview P12).** Every new option, toggle, chip and card line carries `data-analyze`. `aria-disabled` keeps a disabled control analyzable. The coverage test must pass.
- **Memory check** (CLAUDE.md, overview §11):
  - **`head_start_moment`:** five `memoryRules` entries, `head_start_moment_1` … `_5`, one per importance (`when: { importance: "<n>" }`). Each has `about: unit`, `audience: unit`, `spread: none` and `tags: ["head_start"]`. The resolver is registered in `src/engine/memory/resolvers.ts`. Facts take `fr` ids; `memory.nextId` does not move for them.
  - **`head_start_applied`:** bookkeeping with no rule. The chronicle entry the same action writes is its memory.
  - **The chronicle paragraph:** one `kind: 'day'` entry with `audience` = the ids in `headStart.units` (never absent, which would make it LOG-only).
  - **The moments' relation history:** lines with `kind: 'event'` and the moment's event type. `journalLines` reads them with the existing `eventDeltas[].journal` phrase, so nothing new is needed.
  - **Crime knowledge:** written through `revealCrime` (user ruling below), which sets the flag and the reaction. It writes no fact, as today. The `learned_the_crime` moment is the remembered form.
- **Engine purity.** `src/engine/headStart/**` imports nothing from `src/llm`, `src/ui` or `src/st` (`tests/architecture.test.ts`).
- **Build output.** `npm test` rebuilds `dist/index.js` and `style.css`; commit both with every task. Baseline before Task 1: **441 files, 7015 tests, all passing** (2026-11-19).

## Where the plan rules on the spec (read before Task 1)

The user answered the rulings marked **(user)** on 2026-11-19. Task 11 copies every ruling into the spec's **Implemented as**.

### The option and the setup result (§1, §5)

- **Where the option sits.** The spec allows WORLD PARAMETERS or the dossier.
  - The plan places it in the **WORLD PARAMETERS** step (`WizardStep 'world'`), as a HEAD START section after P13's MODE section.
  - `world` is in both wizard modes (`STEPS_BY_MODE`), so the option is found by step kind, not by mode (P11 rule). P13 set the precedent.
  - The per-unit **NEW ARRIVAL** toggles sit in the UNIT ASSIGNMENT step (`units`, both modes), under the character tiles, where P13's WARDEN select sits.
- **`SetupResult.headStart?: { days: 0 | 7 | 14 | 30; newArrivals: string[]; dynamicUnderway?: boolean | string[] }`.**
  - `newArrivals` are **`cardRef`s**, not unit ids: unit ids are made by `makeNamedUnit` during the build.
  - `dynamicUnderway` is P15's. P11b only type-checks it (a boolean or a list of `cardRef`s of chosen units) and does nothing with it.
  - The wizard writes `headStart` only when `days > 0`.
- **Validation** (`validateSetup`). Each failure is one readable line:
  - `days` must be one of 0, 7, 14, 30;
  - `newArrivals` must be distinct `cardRef`s of chosen units;
  - with `days > 0`, at least one chosen unit must not be a new arrival ("A head start needs at least one soldier who already knows the commander"). Zero units is covered by this rule too;
  - with `days === 0`, `newArrivals` must be empty.
- **`CampaignState.headStart?`** is written only when `days > 0`:

  ```ts
  {
    days: 7 | 14 | 30;
    /** Every soldier who knew the commander before day 1, in squad order (new arrivals are not listed). */
    units: Array<{ unitId: string; impression: 'positive' | 'negative' | 'neutral'; moments: string[] /* headStartMoments ids, in order */ }>;
    /** Set by the first `head_start/recap`. */
    recap?: { source: 'model' | 'fallback'; chronicleId: string };
  }
  ```

  The spec names only `{ days }`. The plan adds `units`, because the recap call and the recap action rebuild their input from the state (P14: `build` reads the state, never a cache). It adds `recap` because a reroll replaces texts in place.

### What the build does (§2, §3)

Every non-new unit gets `initialRelation({ …, since: 1 − N })`, so `metDay = stateSince = 1 − N`. New arrivals keep `since` absent (day 1).

`applyHeadStart(draft, reg, { seed, days, impressions })` then runs per non-new unit, in squad order, in this order:

1. **Development.**
   - `impressions` is the change `applyFirstImpression` made, per axis: after − before, captured in the unit loop of `buildCampaign`.
   - For each axis with a non-zero change: `axis += round(Δ × k(N)) + spread`.
     - `k(7) = 0.5`, `k(14) = 0.8`, `k(30) = 1.2`;
     - `spread = (h(spread:<axis>) mod 7) − 3`, an integer in −3…3.
   - The axes are written directly (as `applyFirstImpression` does: no gain handler, no daily accounting), then clamped to their ranges.
   - `impression` is the sign of `Δtrust + Δaffinity`: > 0 is `positive`, < 0 is `negative`, 0 is `neutral`.
2. **Crime knowledge.**
   - Skipped when the unit already knows (`knows_crime`, i.e. `crimeKnownByDefault`).
   - `chance = base(N) × (reacts ? 1.5 : 1)`, capped at 0.9. `base`: 0.25 / 0.40 / 0.60 for N = 7 / 14 / 30.
   - `reacts`: some `crimes[].valueReactions` row matches her values. Same test as `revealCrime`: sign `+` needs value > 0, sign `−` needs value < 0.
   - A hit is `h(crime) < chance`.
   - **(user)** The ×1.3 for a "curious unit" is **dropped**: no field marks curiosity. It comes back when one does (open item).
   - **(user)** A hit runs **`revealCrime(draft, reg, [unitId])`**: the flag, `crime_reaction_done` and her value reaction, as if she had found out during those days. The spec's "as the existing join site does" would set only the flag, and she would then never take the reaction.
3. **Moments** (§4, `pickMoments`, then `applyMoment` for each).
   - **Count:** 1 for N = 7; `1 + (h(count) mod 2)` for N = 14; 2 for N = 30; never more than the eligible entries.
   - **Eligible entries:**
     - not tagged `probe` (acceptance 6; P15 §15.14 lifts this, P11b never does);
     - `requires.minDays ≤ N`;
     - `requires.knowsCrime` equals whether she knows now (after step 2);
     - every `requires.values` pair holds for her values (`+` needs > 0, `−` needs < 0);
     - `sign` is `any` or equals her `impression`. A `neutral` impression accepts every sign.
   - **Pick:** sort the eligible entries by `h(moment:<entryId>)` ascending, ties by id, and take the first `count`.
   - **`applyMoment`** builds an `EventIntent` from the entry's `eventDelta`: `{ type, severity, actor: actor === 'commander' ? 'commander' : unitId, targets: actor === 'commander' ? [unitId] : [], evidence: 'head start', confidence: 1 }`.
     - It runs `computeDeltas` (the full modifier chain: likes, state, defects, image, receptivity; deterministic).
     - It writes `roundAway` of the three axis deltas directly, clamped.
     - It pushes a history line `{ day: draft.day, kind: 'event', type, severity: d.severity }`.
     - It does **not** apply stress, count deeds or call `evaluateEvent`. The head start allows at most one transition (step 5), and stress is not acquaintance.
     - A `dropped` result (below her confidence floors) writes nothing, but the moment stays picked: the text still happens, the numbers do not.
4. **Trust cap.** `trust = min(trust, max(55, trustBefore))`, where `trustBefore` is her Trust right after `applyFirstImpression`. The head start never pushes Trust above 55, and never lowers a Trust that started above it.
5. **One transition.**
   - Set `loyaltyBand = initialLoyaltyBand(trust, bandShift(disposition))`.
   - Then call `evaluateAutomatic(draft, reg, unitId, { allow: (st) => st.bondTier !== 'romantic' })`. The new option filters exit-rule targets and automatic candidates. Absent `allow` = today's behaviour.
   - `evaluateAutomatic` takes at most one transition and recomputes the band. Proposal-only states (friend, confidant, every romantic state) are never entered: romance and proposals stay the player's.
   - The new state's `stateSince` is `draft.day` (1), as `enterState` writes it: the stage was reached as the skipped weeks ended.

After every unit:
- `dailyGain` is reset to `{ 0, 0, 0 }` for every relation (`revealCrime` went through the gain handler; day 1 starts with fresh gains);
- `draft.headStart` is stored.

`h(key)` is `fnv1a(\`${seed}|${unitId}|head_start|${key}\`) / 2**32`, a number in [0, 1); `mod` uses the raw `fnv1a` value.

### The prologue (§3)

- `enterStep` skips a step by rule when `draft.headStart !== undefined` and `step.kind` is `scene`, `expedition` or `guided_slot`. The step is listed in `skipped` with an `onboarding_step_skipped` event, like the existing "nobody to meet" rule. It then reaches `free`, which completes the prologue: `done: true`, so `lockedTabs` is empty.
- No step entry effect runs, so there is no tutorial mission and no guide.
- Wizard steps follow the chosen wizard mode as today.
- **(user)** The prologue intake keeps its arrival fiction in prologue mode. The clash is an open item for the author's texts.

### The first scene and the director (§3, §5)

- **The opening directive.** While `headStart` is set, `state.day === 1`, a scene is open and no scene has ended yet (`(state.memory.scenes ?? []).length === 0`), the controller sets this directive (`expiresAfter: 'scene'`):

  ```
  { id: 'head_start:known', text: headStartOpening(state) }
  ```

  The text, with the wording `AUTHOR TO WRITE`, no pronoun for the commander, and the second sentence only when there are new arrivals:

  > `The squad has known the commander for N days: no introductions, no first meeting. <Names> arrived today and meet the commander for the first time.`

  `SceneController.opening` (the group speaks first) is P11's prologue behaviour and is not turned on for this scene. The directive is the "opening line" of §3.
- **The director digest** gains `knownDays?: number` (present only with a head start). The prompt already stringifies the digest, so no prompt change is needed.

### The recap (§4)

- **Site.** `declare('setup.head_start_recap', 'head_start_recap', 'world', 'before_commit', 'full', 'Recap of the first weeks')`.
  - Surface `world`, because the hub draws the `world` chips and the wizard is gone by then.
  - The call type is mechanic, budget 900, non-prose (it is JSON).
- **Key.** `recap`. One recap per campaign.
- **When it is asked.**
  - In the controller's `onLoaded()` when `headStart` is set and `recap` is absent, once per chat. A reload before an answer asks again.
  - With no mechanic profile the envelope runs the fallback at once, and no record is written (P14).
- **Input** (`HeadStartRecapInput`): `{ days, premise, crime, commander, units: [{ unitId, name, card, impression, knowsCrime, moments: [{ kind, description }] }] }`.
  - `premise`: the start's `summary`.
  - `crime`: the crime's `name: summary`.
  - `commander`: `commanderLine(state)`.
  - `card`: description and personality, cut to 600 characters, as the warden agenda does.
- **Output** (zod):

  ```
  { units: [{ unitId, moments: [{ kind, text }] }], chronicle }
  ```

  `sanitizeRecap(raw, input)` makes the answer plain text (markdown and labels removed), cuts each moment `text` to 240 characters and `chronicle` to 600, and drops unknown units and kinds.
  - It returns `null` (an `invalid_output`, which the envelope retries) unless **every** stored `(unitId, kind)` pair has a non-empty text and `chronicle` is non-empty.
  - The engine never reads the texts for numbers.
- **Fallback** (`fallbackRecap(input, reg)`):
  - each moment's registry `fallback` with `{name}` filled;
  - the chronicle: `AUTHOR TO WRITE: The squad had {days} days with the commander before operations began.` A constant in the call module, like P13's epilogue heading.
- **Replacing** (`before_commit`). A reroll, or a retry after the fallback applied, replaces the texts in place:
  - the chronicle entry by `recap.chronicleId`;
  - each unit's facts tagged `head_start` and about her, in creation order, matched to her moments in order. A fact the player edited (`edited`) keeps its text.
  - It is allowed while `recapCommitted(state)` is `null`: no scene is open, none has ended, and `day === 1`. Otherwise the reason is `"The first scene has started."`
  - The **first** application is always allowed, even after the first scene: the facts must exist.
- **(user) Where the player reads it.** A **THE FIRST WEEKS** card on the hub's side column, above the objective, until the first scene starts (`recapCommitted(state) !== null` hides it). It shows:
  - the chronicle paragraph;
  - each soldier's moment texts under her name;
  - the generation chip (`drawGenerationChips(…, 'world', (r) => r.siteId === 'setup.head_start_recap')`);
  - REROLL (`drawSiteReroll`).

  Afterwards the texts live in LOG (the chronicle) and in each soldier's MEMORY view (facts), as every other memory does.
- **"Day 1 of operations"** (§2). A status-header chip `DAY 1 OF OPERATIONS` (constant `OPERATIONS_LABEL`, `AUTHOR TO WRITE`) on day 1 of a head-start campaign, `glossary:head_start`.

---

## Review Focus

1. **Seeded and golden runs at N = 0, and the rng at N > 0.**
   - A build with `headStart` absent and one with `{ days: 0, newArrivals: [] }` must deep-equal.
   - A build with N = 30 must leave `state.rng` equal to the same build without a head start.
   - Run every unaffected test after Tasks 2, 5 and 6; a moved golden stops and reports.
   - Tests in Task 2 (`days 0 builds the same state as no head start`) and Task 5 (`a head start draws nothing`).
2. **A squad that mixes known soldiers and a new arrival.** The new arrival keeps `metDay 1`, takes no development, no crime roll and no moments, and is outside `headStart.units` and the chronicle audience. The opening directive names her. An all-new or empty squad is refused by validation.
   - Tests in Task 2 (`every unit new is refused`), Task 5 (`a new arrival is untouched`) and Task 8 (`the opening names the new arrivals`).
3. **A model answer that does not fit.** Unknown unit ids, unknown or missing kinds, texts over 240, a missing chronicle, extra keys. The answer is retried, then the fallback applies. A retry or reroll after a first application replaces texts and never adds a second set of facts or a second chronicle entry.
   - Tests in Task 6 (`a second recap replaces, never adds`) and Task 7 (`a missing pair is invalid`, `texts are cut and cleaned`).
4. **Chat switch, reload and the end of the reroll window.**
   - An answer that arrives after a chat switch is dropped (`expectChatId`).
   - A reload with no recap asks once.
   - After the first scene opens, REROLL is disabled with its reason and the card is gone.
   - Tests in Task 8 (`an answer for another chat is dropped`, `reload asks once`, `reroll is refused after the first scene`).
5. **The edges of development.**
   - A baseline Trust above 55 is never lowered by the cap.
   - Positive moments never lift Trust past 55.
   - A strongly negative first impression can reach `estranged` or `despises` on day 1, and the mutiny rule's `minDaysInState` then counts from day 1, not from 1 − N.
   - With romance off, or the commander's `no_romance`, nothing changes; no automatic state is romantic anyway, and the `allow` filter guards a pack that adds one.
   - Tests in Task 4 (`trust cap never lowers`, `a negative impression may estrange, stateSince is day 1`, `a romantic automatic target is refused`).

---

## Chunk (a): the engine

### Task 1: The moments registry, the glossary and the remembered moment

**Files:**
- Create: `content/core/headStartMoments.json`
- Modify:
  - `src/content/types.ts`: `'headStartMoments'` in `REGISTRY_NAMES`, under a `// P11b` comment;
  - `src/content/schemas.ts`: `HeadStartMomentSchema`; `DESCRIBED_REGISTRIES` gains `'headStartMoments'` (`// P11b`); `RESERVED_EVENT_TYPES` gains `'head_start_applied', 'head_start_moment'` (`// P11b`);
  - `src/content/refs.ts`: `eventDelta.type` must be an `eventDeltas` id; `requires.values` keys must be `VALUE_AXES`;
  - `content/core/manifest.json`: `"headStartMoments": "headStartMoments.json"`;
  - `content/core/glossary.json`: `head_start`, `new_arrival`, `head_start_recap`;
  - `content/core/memoryRules.json`: `head_start_moment_1` … `_5`;
  - `src/engine/memory/resolvers.ts`: the `head_start_moment` resolver.
- Test: `tests/content/headStartSchemas.test.ts`, `tests/content/memoryRules.test.ts` (extend)

**Interfaces:**
- Produces:
  - Registry entry: `{ id, sign: 'positive' | 'negative' | 'any', requires?: { values?: Partial<Record<ValueAxis, '+' | '-'>>; knowsCrime?: boolean; minDays?: 7 | 14 | 30 }, eventDelta: { type: string; severity: Severity; actor: 'commander' | 'unit' }, importance: 1..5, tags?: string[], fallback: string /* ≤ 240, may hold {name} */, description: string }`.
  - Resolver `head_start_moment`: ids `{ unit: [unitId] }`; vars `{ text, kind, importance: String(n) }`; shape `{ ids: ['unit'], vars: ['text', 'kind', 'importance'] }`. It returns null when the unit is unknown or the text is empty.
  - Event shape (written in Task 6): `{ type: 'head_start_moment', unitId, kind, text, importance }`.

- [x] **Step 1: Write the failing tests**
  - `the core pack loads headStartMoments`: 10 entries, no load errors.
  - `the draft kinds are the spec's`:
    - ids `shared_meal`, `first_argument`, `sparring_bout`, `night_talk`, `commander_mistake`, `covered_for_her`, `cold_shoulder`, `learned_the_crime`, `small_favour`, `rule_reminder`;
    - `night_talk` has `requires.minDays 7`, `covered_for_her` has `minDays 14`, `learned_the_crime` has `requires.knowsCrime true`;
    - no entry is tagged `probe`.
  - `an unknown eventDelta type is a content error` (a fixture pack with `"type": "hugged"`).
  - `an unknown value axis in requires is a content error`.
  - `fallback over 240 characters is rejected`.
  - `head_start_moment writes a fact with the rule of its importance`:
    - run `rememberEvents` on `{ type: 'head_start_moment', unitId: ANN, kind: 'shared_meal', text: 'Soup at 0200.', importance: 3 }`;
    - expect one fact with `about [ANN]`, `knownBy [ANN]`, `importance 3`, `tags ['head_start']`, no `spread`, no `hiddenFromCommander`, an id starting `fr`;
    - `memory.nextId` is unchanged.
  - `head_start_applied has no rule`: `rememberEvents` writes nothing.
  - The pronoun test (`tests/content/pronouns.test.ts`) covers the new file through the content glob. Confirm it reads `headStartMoments.json`; if it lists files, add it.
- [x] **Step 2: Run** `npx vitest run tests/content/headStartSchemas.test.ts tests/content/memoryRules.test.ts` → FAIL.
- [x] **Step 3: Implement.**
  - `headStartMoments.json`: texts are drafts, every `description` and `fallback` starts `AUTHOR TO WRITE:`, and none gives the commander a pronoun. Each `eventDelta` is `severity: "minor"`; the type and actor are:

    | id | sign | type | actor |
    |---|---|---|---|
    | `shared_meal` | positive | `listened` | commander |
    | `first_argument` | negative | `insulted` | commander |
    | `sparring_bout` | any | `praised` | commander |
    | `night_talk` | positive | `shared_secret` | unit |
    | `commander_mistake` | negative | `endangered` | commander |
    | `covered_for_her` | positive | `protected` | commander |
    | `cold_shoulder` | negative | `dismissed` | commander |
    | `learned_the_crime` | any | `crime_revealed` | commander |
    | `small_favour` | positive | `gift` | commander |
    | `rule_reminder` | any | `kept_promise` | commander |

    Importance is 2, except `night_talk`, `covered_for_her` and `learned_the_crime`, which are 3.
  - The rules' `text` is `"{text}"`, with `about: "unit"`, `audience: "unit"`, `spread: "none"`, `when: { "importance": "<n>" }` and `importance: <n>`.
  - Glossary entries:
    - `head_start`: "The campaign begins as if the commander had already been at the base for a while: acquaintance only, no missions or time skipped."
    - `new_arrival`: "This soldier arrives on day 1 and meets the commander for the first time, even in a head start."
    - `head_start_recap`: "The remembered moments of the first weeks and the squad's paragraph; written by the mechanic model, or from templates."
- [x] **Step 4: Run** the files, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P11b): head start moments registry, glossary and the remembered moment`

---

### Task 2: The setup option, its validation and the shifted acquaintance

**Files:**
- Modify:
  - `src/engine/setup.ts`: `SetupResult.headStart`, `validateSetup`, `since: 1 − N` for non-new units, `headStartDays(r)`;
  - `src/engine/state/types.ts`: `HeadStartState`, `CampaignState.headStart?`;
  - `src/engine/tuning.ts`: `TUNING.headStart`.
- Test: `tests/engine/headStart/setup.test.ts`

**Interfaces:**
- Produces:
  - `type HeadStartDays = 0 | 7 | 14 | 30`;
  - `SetupResult.headStart?: { days: HeadStartDays; newArrivals: string[]; dynamicUnderway?: boolean | string[] }`;
  - `interface HeadStartState { days: 7 | 14 | 30; units: Array<{ unitId: string; impression: 'positive' | 'negative' | 'neutral'; moments: string[] }>; recap?: { source: 'model' | 'fallback'; chronicleId: string } }`;
  - `CampaignState.headStart?: HeadStartState`;
  - `headStartDays(r: SetupResult): HeadStartDays` (0 when absent);
  - `isNewArrival(r: SetupResult, cardRef: string): boolean`;
  - `TUNING.headStart`:

    ```ts
    {
      days: [0, 7, 14, 30],
      k: { 7: 0.5, 14: 0.8, 30: 1.2 },
      spread: 3,
      trustCap: 55,
      crime: { 7: 0.25, 14: 0.4, 30: 0.6 },
      crimeReactMult: 1.5,
      crimeCap: 0.9,
      moments: { 7: [1, 1], 14: [1, 2], 30: [2, 2] },
      textMax: 240,
      chronicleMax: 600,
    }
    ```

- [x] **Step 1: Write the failing tests** (reuse the `unit()` / `result()` helpers of `tests/engine/setup.test.ts`; copy them, do not import a test file)
  - Validation:
    - `days must be 0, 7, 14 or 30` (`days: 10` → one line);
    - `a new arrival must be a chosen card`;
    - `a new arrival is listed once`;
    - `every unit new is refused` (two units, both new → "A head start needs at least one soldier who already knows the commander");
    - `no units with a head start is refused`;
    - `days 0 with new arrivals is refused`;
    - `dynamicUnderway must be a boolean or chosen cards`.
  - Build:
    - `days 0 builds the same state as no head start`: `toEqual` on the whole state, seed 7, three units, crime `liquidation`;
    - `a known unit has met the commander N days ago`: N = 14 → `metDay === -13`, `stateSince === -13`, `daysKnown(state, id) === 14` on day 1;
    - `a new arrival has met the commander today`: `metDay === 1`, `daysKnown === 0`;
    - `firstImpressionWeight falls with the days known`: N = 30 < N = 0 for the same unit.
  - Readers of `metDay` / `stateSince` that assumed ≥ 1, each checked with a relation at `stateSince −29`:
    - `minDaysInState counts the skipped days` (`meets` with `minDaysInState: 3`, day 1, `stateSince −2` → true);
    - `commander/seed leaves a set metDay alone` (`metDay −29` survives `commander/seed`).
  - Leave the `discipline` undo test alone: it restores `sinceFrom` as stored.
- [x] **Step 2: Run** `npx vitest run tests/engine/headStart/setup.test.ts` → FAIL.
- [x] **Step 3: Implement.**
  - In the unit loop: `initialRelation({ …, ...(days > 0 && !isNewArrival(r, u.cardRef) ? { since: 1 - days } : {}) })`. With days 0 nothing changes, so the state stays byte-identical.
  - `headStart` is not stored yet (Task 5 stores it).
- [x] **Step 4: Run** the file, then `npm test` → PASS (every seeded and setup test unchanged).
- [x] **Step 5: Commit** `feat(P11b): head start option, validation and shifted acquaintance`

---

### Task 3: Development and crime knowledge

**Files:**
- Create:
  - `src/engine/headStart/hash.ts`;
  - `src/engine/headStart/develop.ts`;
  - `src/engine/headStart/index.ts` (re-exports).
- Test: `tests/engine/headStart/develop.test.ts`

**Interfaces:**
- Consumes: `fnv1a` (`src/engine/hub.ts`), `revealCrime` (`src/engine/memory/crime.ts`), `TUNING.headStart` (Task 2).
- Produces:
  - `headStartHash(seed: number, unitId: string, key: string): number` (in [0, 1));
  - `headStartRaw(seed: number, unitId: string, key: string): number` (the uint32);
  - `type AxisDelta = { trust: number; affinity: number; attraction: number }`;
  - `impressionOf(d: AxisDelta): 'positive' | 'negative' | 'neutral'`;
  - `developRelation(rel: Relation, d: AxisDelta, days: 7 | 14 | 30, seed: number, unitId: string): void`;
  - `crimeChance(state: CampaignState, reg: Registries, unit: Unit, days: 7 | 14 | 30): number`;
  - `rollCrime(draft: CampaignState, reg: Registries, unit: Unit, days: 7 | 14 | 30, seed: number): boolean`. It returns whether she learned it now, and calls `revealCrime` on a hit.

- [x] **Step 1: Write the failing tests**
  - `the hash is stable`: `headStartHash(7, 'unit_ann', 'crime')` gives the same value twice and a different one for `'unit_bea'`.
  - `development follows the impression`:
    - `d = { trust: 6, affinity: 4, attraction: 0 }`, N = 14 → trust grows by `round(6 × 0.8) + spread` with spread in −3…3;
    - attraction is untouched (its Δ is 0);
    - affinity by `round(3.2) + spread`.
  - `a negative impression develops downwards`: `d.trust = −8` → trust falls by about 9.6 ± 3.
  - `axes stay in range`: trust 2 with Δ −8 at N = 30 → 0.
  - `impressionOf`: `{ 3, −3, 9 }` → neutral (trust + affinity only); `{ 1, 0, 0 }` → positive.
  - `crime chance by days`: a unit with no reacting value → 0.25 / 0.4 / 0.6.
  - `a reacting value multiplies by 1.5`: crime `liquidation` (`sacrifice +` reacts), her `sacrifice 2` → 0.375 at N = 7; at N = 30 → 0.9 (capped).
  - `no curious multiplier`: a unit with likes `['secrets']` has the same chance as one without (user ruling).
  - `a hit reveals the crime with her reaction`:
    - pick a seed where `h(crime) < chance` (search seeds 1…200 in the test, the first hit);
    - expect `knows_crime` and `crime_reaction_done`, and Trust lowered by the reaction (as `revealCrime` does).
  - `a unit who already knows is not rolled`: `knows_crime` set → `rollCrime` returns false and nothing changes.
- [x] **Step 2: Run** `npx vitest run tests/engine/headStart/develop.test.ts` → FAIL.
- [x] **Step 3: Implement** per "What the build does" steps 1–2. `reacts` reads `crime.valueReactions` with the same sign test as `revealCrime`. Factor it as `reactsToCrime(unit, crime): boolean` in `src/engine/memory/crime.ts` and use it in both places.
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P11b): development of the first impression and crime knowledge`

---

### Task 4: Moments, the trust cap and the one transition

**Files:**
- Create: `src/engine/headStart/moments.ts`
- Modify: `src/engine/relations/graph.ts` (`evaluateAutomatic` option `allow`)
- Test: `tests/engine/headStart/moments.test.ts`, `tests/engine/relations/graphAllow.test.ts`

**Interfaces:**
- Consumes: Task 3 (`headStartHash`, `headStartRaw`); `computeDeltas` (`relations/deltas.ts`), `roundAway` (`relations/gain.ts`), `pushHistory`, `evaluateAutomatic`.
- Produces:
  - `pickMoments(state: CampaignState, reg: Registries, unit: Unit, ctx: { days: 7 | 14 | 30; seed: number; impression: 'positive' | 'negative' | 'neutral'; knowsCrime: boolean }): Entry[]`;
  - `applyMoment(draft: CampaignState, reg: Registries, unitId: string, moment: Entry): void`;
  - `capTrust(rel: Relation, trustBefore: number): void`;
  - `headStartTransition(draft: CampaignState, reg: Registries, unitId: string): EngineEvent[]`;
  - `evaluateAutomatic(draft, reg, unitId, opts?: { allow?: (state: Entry) => boolean }): EngineEvent[]`.

- [x] **Step 1: Write the failing tests**
  - Picking:
    - `N 7 picks one, N 30 picks two, N 14 picks one or two by hash`;
    - `a positive impression never picks a negative moment` (every seed 1…50);
    - `a neutral impression may pick any sign`;
    - `night_talk needs at least 7 days, covered_for_her 14`;
    - `learned_the_crime only when she knows`;
    - `values requirements hold` (a fixture entry with `requires.values { mercy: '+' }` and her mercy 0 → never picked);
    - `probe-tagged entries are never picked` (a fixture entry tagged `probe`, the only eligible one → zero picks);
    - `no repeats`;
    - `fewer eligible than the count gives what there is`.
  - Applying:
    - `a moment moves the axes by its row through the modifier chain`: `shared_meal` (`listened minor`: trust 1, affinity 1) with no modifiers → +1 / +1, and the history ends with `{ kind: 'event', type: 'listened', severity: 'minor', day: 1 }`;
    - `a moment adds no stress and enters no state by event`;
    - `journalLines shows the moment's journal phrase` ("the commander listened to her").
  - Cap:
    - `trust cap never lifts past 55`: trustBefore 40, trust 61 → 55;
    - `trust cap never lowers`: trustBefore 58, trust 60 → 58.
  - Transition:
    - `stranger with trust 20 or more becomes comrade`;
    - `a negative impression may estrange, stateSince is day 1`: affinity −35 → `estranged`, `stateSince === 1`;
    - `at most one transition` (a unit meeting `comrade` and then `trusted` stays `comrade`);
    - `a romantic automatic target is refused`: a registry copy where `trusted` gets `bondTier: 'romantic'`, a unit in `comrade` meeting it → no change;
    - `without allow, evaluateAutomatic behaves as before` (graphAllow test: the same romantic copy → entered).
- [x] **Step 2: Run** `npx vitest run tests/engine/headStart/moments.test.ts tests/engine/relations/graphAllow.test.ts` → FAIL.
- [x] **Step 3: Implement** per "What the build does" steps 3–5.
  - In `evaluateAutomatic`, `allow` filters the `ok` set of exit targets and the `candidates` list. Its default keeps the current code path unchanged, so no seeded test moves.
  - `headStartTransition` sets the initial band (step 5), then calls `evaluateAutomatic` with `allow: (st) => st.bondTier !== 'romantic'`.
- [x] **Step 4: Run** the files, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P11b): remembered moments, the trust cap and one non-romantic transition`

---

### Task 5: The build applies the head start; the prologue steps are skipped

**Files:**
- Create: `src/engine/headStart/apply.ts`
- Modify:
  - `src/engine/setup.ts`: capture the first-impression deltas in the unit loop; call `applyHeadStart` after the loop;
  - `src/engine/onboarding/state.ts`: the head-start skip rule in `enterStep`.
- Test: `tests/engine/headStart/build.test.ts`, `tests/engine/onboarding/headStartSkip.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  - `applyHeadStart(draft: CampaignState, reg: Registries, o: { seed: number; days: 7 | 14 | 30; impressions: Map<string, { delta: AxisDelta; trustBefore: number }> }): void`;
  - `HEAD_START_SKIPPED_KINDS = ['scene', 'expedition', 'guided_slot'] as const`.

- [x] **Step 1: Write the failing tests**
  - Build:
    - `a head start draws nothing`: the same `SetupResult` and seed with N = 30 and without a head start → `state.rng` equal;
    - `a head start is deterministic`: two builds with seed 7 → `toEqual`;
    - `headStart lists the known units`: three units, one new → `units` has two entries in squad order, each with `impression` and 1–2 moment ids;
    - `a new arrival is untouched`: her relation `toEqual`s her relation in a build with N = 0 and the same seed (axes, flags, history, state, band);
    - `daily gains start at zero`: every relation's `dailyGain` is `{ 0, 0, 0 }`;
    - `a known crime by default is not rolled` (a start with `crimeKnownByDefault`: no `crime_reaction_done` added);
    - `the order is development, crime, moments, cap, transition`: a fixture where only the `learned_the_crime` moment is eligible, with a seed where the crime hits, gets that moment.
  - Prologue:
    - `the prologue is done on day 1`: `start_vesper` with its prologue (`veteran: false`) and N = 7 → `onboarding.done`, every campaign step in `skipped`, the wizard steps in `completed`;
    - `every tab is unlocked`: `lockedTabs(state, reg).size === 0`;
    - `no tutorial mission is offered` (`missions.offered` has no `tutorial` template);
    - `without a head start the prologue starts as before` (the first campaign step is current, `done` false).
- [x] **Step 2: Run** `npx vitest run tests/engine/headStart/build.test.ts tests/engine/onboarding/headStartSkip.test.ts` → FAIL.
- [x] **Step 3: Implement.**
  - In `buildCampaign`, capture `before` axes just before `applyFirstImpression` and the change just after, keyed by unit id, for non-new units only.
  - After the loop, `if (days > 0) applyHeadStart(state, reg, { seed: opts.seed, days, impressions })`. This comes before `state.roster.activeIds`, `seedWorld`, the LEASHSWAP block (`corporateWardenPick` reads values and Impunity; the head start may change who oversight picks, which is intended) and the onboarding block.
  - `applyHeadStart` writes `draft.headStart = { days, units }`.
  - In `enterStep`, add to the skip condition: `(draft.headStart !== undefined && HEAD_START_SKIPPED_KINDS.includes(step.kind))`.
- [x] **Step 4: Run** the files, then `npm test` → PASS. Run the unaffected tests explicitly; any moved golden stops the task.
- [x] **Step 5: Commit** `feat(P11b): the build applies the head start and skips the prologue's campaign steps`

---

### Task 6: The recap action, the commit window and the director digest

**Files:**
- Create: `src/engine/actions/headStart.ts`, `src/engine/headStart/recap.ts`
- Modify:
  - `src/app.ts`: `import './engine/actions/headStart'; // registers head_start/recap (P11b)` (`tests/helpers/unaffectedWeek.ts` globs the actions, so it needs no change);
  - `src/engine/world/director.ts`: `Digest.knownDays?`.
- Test: `tests/engine/headStart/recap.test.ts`, `tests/engine/world/digestHeadStart.test.ts`

**Interfaces:**
- Consumes: Task 1 (rules and resolver), Task 5 (`state.headStart`), `addChronicle`.
- Produces:
  - action `head_start/recap { units: Array<{ unitId: string; moments: Array<{ kind: string; text: string }> }>; chronicle: string; source: 'model' | 'fallback' }`;
  - events `{ type: 'head_start_applied', days, units: string[] }` and `{ type: 'head_start_moment', unitId, kind, text, importance }` (first application only);
  - `recapCommitted(state: CampaignState): string | null`;
  - `recapPairs(state: CampaignState): Array<{ unitId: string; kind: string }>`;
  - `Digest.knownDays?: number`.

- [x] **Step 1: Write the failing tests**
  - `the first recap writes facts and one chronicle entry`. On a built N = 14 campaign, dispatch the recap with every stored pair and expect:
    - one fact per moment (`fr` ids, `knownBy [unit]`, tag `head_start`, the texts as sent, importance from the registry);
    - one chronicle entry `{ kind: 'day', day: 1, audience: <headStart unit ids>, text }`;
    - `headStart.recap = { source, chronicleId }`;
    - events `head_start_applied`, then one `head_start_moment` per pair.
  - `a recap with a missing or extra pair is rejected` (an error event; the state is unchanged).
  - `a text over 240 or a chronicle over 600 is rejected`.
  - `a second recap replaces, never adds`: the second dispatch gives the same fact count and chronicle count, the new texts, `recap.source` updated and no `head_start_moment` events.
  - `an edited fact keeps its text on replace` (`memory/edit` on one fact first).
  - `replace is refused after the first scene`: start a scene (or set `memory.scenes` to one mark) → error `"The first scene has started."`.
  - `a recap without a head start is rejected`.
  - `recapCommitted is null on day 1 before any scene, a reason otherwise` (an open scene, an ended scene, day 2).
  - `the digest says how long the squad has known the commander`: N = 30 → `buildDigest(state).knownDays === 30`; without a head start the key is absent.
- [x] **Step 2: Run** `npx vitest run tests/engine/headStart/recap.test.ts tests/engine/world/digestHeadStart.test.ts` → FAIL.
- [x] **Step 3: Implement.**
  - The handler validates first and throws on any problem (overview §5: a rejected action changes nothing).
  - First application: `addChronicle`, set `recap`, return the events. `dispatch` then calls `rememberEvents`, which writes the facts.
  - Replace: rewrite the chronicle text by id and the facts per "Replacing".
- [x] **Step 4: Run** the files, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P11b): head_start/recap writes the remembered moments and the squad's paragraph`

**Chunk (a) ends here.**

---

## Chunk (b): the recap call, the wizard and the screens

### Task 7: The `head_start_recap` call type and its site

**Files:**
- Create: `src/llm/calls/headStartRecap.ts`
- Modify:
  - `src/llm/callTypes.ts`: `'head_start_recap'` in `CALL_TYPE_IDS`;
  - `src/llm/calls/all.ts`;
  - `src/settings.ts`: `budgets.head_start_recap: 900`;
  - `src/llm/sites.ts`: the declaration;
  - `tests/settings.test.ts`: the budgets literal.
- Test: `tests/llm/headStartRecap.test.ts`

**Interfaces:**
- Produces:
  - `interface HeadStartRecapInput { days: number; premise: string; crime: string; commander: string; units: Array<{ unitId: string; name: string; card: string; impression: 'positive' | 'negative' | 'neutral'; knowsCrime: boolean; moments: Array<{ kind: string; description: string }> }> }`;
  - `HeadStartRecapSchema` (zod, `.strip()`);
  - `type HeadStartRecapValue = { units: Array<{ unitId: string; moments: Array<{ kind: string; text: string }> }>; chronicle: string }`;
  - `sanitizeRecap(raw: unknown, input: HeadStartRecapInput): HeadStartRecapValue | null`;
  - `fallbackRecap(input: HeadStartRecapInput, reg: Registries): HeadStartRecapValue`;
  - `RECAP_CHRONICLE_FALLBACK` (the `AUTHOR TO WRITE` template with `{days}`).

- [x] **Step 1: Write the failing tests**
  - `a full answer passes`.
  - `a missing pair is invalid` (null).
  - `an unknown unit or kind is dropped, the rest must still be complete`.
  - `texts are cut and cleaned`: markdown, a `Narrator:` label and quotes are removed; 300 characters → 240; a chronicle of 700 → 600.
  - `an empty chronicle is invalid`.
  - `the fallback fills every pair from the registry`: each `fallback` with `{name}` → her name, and the chronicle from the template with the days.
  - `the system prompt forbids a pronoun for the commander` (the text contains `never use a pronoun for the commander`).
  - `the prompt marks the cards as data` (the `<card>` tags are stripped from the card text).
  - `the site is declared`: `generationSite('setup.head_start_recap')` → `{ callType: 'head_start_recap', surface: 'world', reroll: 'before_commit', record: 'full' }`. `tests/llm/siteRegistry.test.ts` passes unchanged.
- [x] **Step 2: Run** `npx vitest run tests/llm/headStartRecap.test.ts tests/llm/siteRegistry.test.ts tests/settings.test.ts` → FAIL.
- [x] **Step 3: Implement** in the style of `wardenAgenda.ts`: `profile: 'mechanic'`, `json: true`, no `prose`. The system prompt asks for:
  - one or two sentences per moment, past tense, from the squad's side, about the listed kind only;
  - a short paragraph for the squad;
  - no numbers about feelings;
  - the commander only as "the commander";
  - the soldiers as "she";
  - the crime mentioned only in the moments of soldiers marked as knowing it.
- [x] **Step 4: Run** the files, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P11b): head_start_recap call type, sanitizer, fallback and site`

---

### Task 8: The head start controller: the recap request and the opening directive

**Files:**
- Create: `src/headStart/controller.ts`, `src/headStart/deps.ts`
- Modify: `src/app.ts` (create it after the warden controller with `{ ...worldDeps, context, refreshContext: applyContext }`; call `headStart.onLoaded()` next to `warden.onLoaded()`, `onSceneOpened()` / `onSceneClosed()` next to the onboarding calls; expose `rerollRecap` to the hub)
- Test: `tests/headStart/controller.test.ts`

**Interfaces:**
- Consumes: Task 6 (`head_start/recap`, `recapCommitted`, `recapPairs`), Task 7 (call type and site), `Envelope`, `commanderLine`, `ContextBuilder`.
- Produces:
  - `interface HeadStartDeps extends WorldDeps { context: ContextBuilder; refreshContext(): void }`;
  - `createHeadStart(deps: HeadStartDeps): HeadStartController`;
  - `interface HeadStartController { onLoaded(): void; onSceneOpened(): void; onSceneClosed(): void; rerollRecap(): Promise<void>; rerollState(): { enabled: boolean; reason?: string } }`;
  - `headStartOpening(state: CampaignState): string` (exported for the test);
  - `OPENING_DIRECTIVE = 'head_start:known'`.

- [x] **Step 1: Write the failing tests** (fake adapter and the envelope host helper `tests/helpers/envelopeHost.ts`)
  - `onLoaded asks once and applies the answer`: a queued valid answer → facts and a chronicle entry, `recap.source 'model'`.
  - `reload asks once`: `onLoaded` twice in the same chat → one call.
  - `a recap already written is not asked again`.
  - `no profile applies the fallback without a record` (`recap.source 'fallback'`, `generations` absent).
  - `an invalid answer retries, then falls back with a full record`.
  - `an answer for another chat is dropped`: switch the active chat before the fake answers → no recap in either state.
  - `reroll replaces before the first scene and is refused after`: `rerollState()` is enabled before the scene; after it opens it reads `{ enabled: false, reason: 'The first scene has started.' }`.
  - `the opening directive is set in the first scene of day 1 and cleared after`:
    - text `"The squad has known the commander for 14 days: no introductions, no first meeting."`;
    - absent in a second scene;
    - absent without a head start.
  - `the opening names the new arrivals` ("Rhea arrived today and meets the commander for the first time.").
  - `no pronoun for the commander in the opening` (no `\b(he|him|his|she|her)\b` before "commander" in the text; use the pronoun test's helper if it exports one).
- [x] **Step 2: Run** `npx vitest run tests/headStart/controller.test.ts` → FAIL.
- [x] **Step 3: Implement** after `src/warden/controller.ts`.
  - `bind('setup.head_start_recap', { build, parse, apply, fallback, committed })` per "The recap".
  - `apply` and `fallback` dispatch `head_start/recap` with `expectChatId`.
  - The `asked` set is keyed by `<chatId>:recap`.
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P11b): head start controller asks for the recap and opens the first scene`

---

### Task 9: The wizard: HEAD START and NEW ARRIVAL

**Files:**
- Create: `src/ui/setup/headStart.ts`
- Modify:
  - `src/setup/wizard.ts`: `WizardState.headStart`, `setHeadStart`, `toggleNewArrival`, `toggleUnit` keeps it in step, `build()`;
  - `src/ui/setup/worldParams.ts`: after the MODE section;
  - `src/ui/setup/setupScreen.ts`: `units()` under the tiles;
  - `src/ui/setup/shared.ts`: `reviewLines` gains `HEAD START: <label>` and the new arrivals;
  - `css/30-setup.css`: only if the toggles need a class beyond `alius-option`.
- Test: `tests/setup/wizardHeadStart.test.ts`, `tests/ui/setup/headStart.test.ts`

**Interfaces:**
- Consumes: Task 2 (`SetupResult.headStart`, `HeadStartDays`).
- Produces:
  - `WizardState.headStart: { days: HeadStartDays; newArrivals: string[] /* avatars */ }` (default `{ days: 0, newArrivals: [] }`);
  - `Wizard.setHeadStart(days: HeadStartDays): void`;
  - `Wizard.toggleNewArrival(avatar: string): void`;
  - `renderHeadStartSection(host: HTMLElement, wizard: Wizard): void`;
  - `renderNewArrivals(host: HTMLElement, wizard: Wizard): void`;
  - `HEAD_START_LABEL: Record<HeadStartDays, string>` = `ARRIVAL` / `ONE WEEK` / `TWO WEEKS` / `ONE MONTH`.

- [x] **Step 1: Write the failing tests**
  - Wizard:
    - `the default is arrival` and the result has no `headStart`;
    - `two weeks writes the result` (`{ days: 14, newArrivals: [] }`);
    - `a new arrival is written by card`;
    - `setting arrival clears the new arrivals`;
    - `removing a unit removes her from the new arrivals`;
    - `toggleNewArrival does nothing at arrival or for a card not chosen`;
    - `every unit new makes result() null with the validation line`;
    - `invalid days are ignored`.
  - UI (jsdom):
    - `WORLD PARAMETERS shows four HEAD START options`, each `alius-option`, `aria-pressed` on the current one, `data-analyze="glossary:head_start"`;
    - `UNIT ASSIGNMENT shows one NEW ARRIVAL toggle per chosen unit only when days > 0`, each `data-analyze="glossary:new_arrival"`, `aria-pressed`;
    - `the review shows the head start`;
    - `prologue and veteran modes both show the section` (the `world` step in both).
  - Add both renderers to the analyze coverage harness (`tests/helpers/analyzeCoverage.ts`) so `tests/ui/analyzeCoverage.test.ts` checks them.
- [x] **Step 2: Run** `npx vitest run tests/setup/wizardHeadStart.test.ts tests/ui/setup/headStart.test.ts tests/ui/analyzeCoverage.test.ts` → FAIL.
- [x] **Step 3: Implement** after `src/ui/warden/modeSection.ts` (section markup, `h()` only). The hint under the options, plain meta text with no pronoun for the commander: `The squad has already met the commander: first impressions have settled, a few remember moments, some may know the crime. No missions, time or progress are skipped.`
- [x] **Step 4: Run** the files, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P11b): HEAD START option and NEW ARRIVAL toggles in the wizard`

---

### Task 10: THE FIRST WEEKS card, the day-1 chip and the analyze reading

**Files:**
- Create:
  - `src/ui/headStart/recapCard.ts`;
  - `src/analysis/providers/headStart.ts`;
  - `css/83-head-start.css`.
- Modify:
  - `src/ui/hub/hubScreen.ts`: `HubCtx.headStartCard?: (host: HTMLElement) => void`, drawn above the prologue host;
  - `src/ui/shell/status.ts`: the chip;
  - `src/app.ts`: pass `headStartCard` with `generation` and `rerollRecap`; register the provider where the other providers are registered;
  - `tests/helpers/analyzeCoverage.ts`.
- Test: `tests/ui/headStart/recapCard.test.ts`, `tests/ui/statusHeadStart.test.ts`, `tests/analysis/headStartProvider.test.ts`

**Interfaces:**
- Consumes: Task 6 (`recapCommitted`), Task 8 (`rerollRecap`, `rerollState`), P14 `drawGenerationChips`, `drawSiteReroll`.
- Produces:
  - `renderRecapCard(host: HTMLElement, ctx: { state: CampaignState; registries: Registries; generation?: GenerationUi; onReroll(): Promise<void> }): void` (draws nothing when `recapCommitted(state) !== null` or `headStart` is absent);
  - `OPERATIONS_LABEL = 'DAY 1 OF OPERATIONS'` (`AUTHOR TO WRITE`);
  - provider `glossary:head_start`: "Known for N days; new arrivals: …", or "No head start".

- [x] **Step 1: Write the failing tests**
  - Card:
    - `the card shows the paragraph and each soldier's moments`: the chronicle text, names as headings, texts from the facts tagged `head_start`;
    - `while the recap is pending the card says so` ("The first weeks are being written." when `recap` is absent);
    - `every line is analyzable`:
      - the title has `glossary:head_start_recap`;
      - each moment line has `headStartMoments:<id>`, matched by order to `headStart.units[i].moments`;
    - `the card is gone once the first scene has started`;
    - `a failed record shows its chip, REROLL is drawn when none is open`.
  - Status header:
    - `day 1 of a head start shows the chip` with `glossary:head_start`;
    - `no chip on day 2 or without a head start`.
  - Provider:
    - `the reading names the days and the new arrivals`;
    - it passes `tests/analysis/hidden.test.ts` (runs over every registered provider).
  - `tests/assets.test.ts` passes (no `url(` with a scheme in the new CSS).
- [x] **Step 2: Run** `npx vitest run tests/ui/headStart tests/ui/statusHeadStart.test.ts tests/analysis/headStartProvider.test.ts tests/ui/analyzeCoverage.test.ts` → FAIL.
- [x] **Step 3: Implement.**
  - The card uses the paper voice (`VOICE_OF`: register `headStart: 'paper'`, as P11's intake forms) and the existing card classes.
  - The moment texts come from the facts, never from a cache: the state is the truth.
- [x] **Step 4: Run** the files, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P11b): THE FIRST WEEKS card, day-1 chip and head start reading`

---

### Task 11: Docs, hand-offs and the manual test

**Files:**
- Create: `docs/MANUAL_TEST_P11b.md`
- Modify:
  - `docs/packages/P11b-head-start.md`: status line and **Implemented as**. It records:
    - every ruling above, including the three user rulings (no curious multiplier; `revealCrime` with the reaction; the hub card) and the kept prologue fiction;
    - the extra `HeadStartState` fields;
    - non-obvious things to know:
      - `applyHeadStart` writes axes directly and resets `dailyGain`;
      - moments push history but apply no stress and enter no state;
      - the transition's `stateSince` is day 1;
      - `newArrivals` are card refs;
      - the first recap is always allowed, a replacement only before the first scene;
    - open items:
      - texts and fallback lines;
      - the ×1.3 curious multiplier;
      - `k(N)` and the trust-cap tuning;
      - the prologue's arrival fiction with a head start;
      - `previewStart` shows Trust without the head start;
      - the moment → event mapping is a draft.
  - `docs/00-overview.md`:
    - §5.2: the `head_start_recap` row (mechanic, 900);
    - §5.4: P11b rows (`SetupResult.headStart`, `CampaignState.headStart`, `applyHeadStart`, `pickMoments`, `headStartHash`, `evaluateAutomatic` `allow`, `head_start/recap`, `recapCommitted`, `createHeadStart`, `renderHeadStartSection`, `renderNewArrivals`, `renderRecapCard`, `Digest.knownDays`, registry `headStartMoments`);
    - §6: `headStart`;
    - §9: status `implemented`.
  - `docs/packages/P15-dynamic-core.md`: an **Interfaces already provided by P11b** note:
    - `SetupResult.headStart.dynamicUnderway` is typed and validated, otherwise unused;
    - `pickMoments` excludes `probe`-tagged entries, and §15.14 lifts that;
    - `headStartHash` is the hash to reuse;
    - `head_start_moment` is the rule to reuse.
  - `CLAUDE.md`: a P11b rule line in the style of the others. It covers:
    - no draw;
    - read moments by `sign`/`requires`/`tags`;
    - the build order: disposition, first impression, then head start;
    - the `head_start:` directive prefix;
    - the recap through `head_start/recap` only.
  - `docs/CONTENT.md`: the `headStartMoments` registry (fields, the `probe` tag reserved for P15).
  - `docs/content/prologue.md`: a "Head start" section with the draft moment texts, fallback lines, the opening line and the day-1 label (`AUTHOR TO WRITE`).
  - `docs/ROADMAP-next.md`: P11b marked done.
- [x] **Step 1: Write** the docs. The manual test covers, in SillyTavern:
  - each of the four options;
  - a new arrival among known soldiers;
  - the THE FIRST WEEKS card with a model answer, a refusal (chip, RETRY) and REROLL;
  - REROLL disabled after the first scene;
  - the opening of the first scene;
  - the MEMORY view and LOG after it;
  - the prologue done with every tab open;
  - LEASHSWAP with a head start.
- [x] **Step 2: Run** `npm test` → PASS; record the final file and test counts in the spec.
- [x] **Step 3: Commit** `docs(P11b): implemented as, overview, hand-offs, manual test`

**Chunk (b) ends here.**
