# P14b Character Development Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Soldiers change slowly from what they live through. Each event she takes part in or watches is appraised from her point of view (and sometimes misread). Data rules turn appraisals into small accumulators. A weekly model review, bounded by her card's anchors, turns accumulated support into nudges and steps of her values, tastes, likes and dislikes and bond fields, and into development facts. Discrete changes are quiet **development moments**: behaviour first, dossier after. Repetition forms habits. A short "since joining" block tells the main model who she is now.

**Architecture:**
- **Engine** (`src/engine/development/`): pure and deterministic, with **no rng draw** (chances hash `fnv1a`). It holds:
  - `Unit.development` (absent = nothing has happened yet) and the readers `valuesOf`, `likesOf`, `dislikesOf`, `tastesOf`, folded into `bondOf` and `effectiveValues`. Every engine reader of a profile field goes through them, and a guard test refuses direct reads;
  - appraisal recording inside `applyEventToUnit` (subject or actor) and `applyIntents` (witnesses), the rules table, the misreading and the day-end revision;
  - the review validator and the `development/review` action, the moments (stamped at `scene/start`, shown at `scene/end`), and the counters and habits.
- **Model side** (chunk b): one mechanic call `development_review` through the P14 envelope (site `development.review`, record `quiet`, reroll `before_commit`), asked by `src/development/controller.ts` after a dispatch settles. Without an answer the engine's own fallback review applies (nudges only, no facts). The same controller sets the one-time moment directives.
- **Prompt and UI** (chunk c): a `since_joining` provider in the P3b memory group; a DEVELOPMENT view in each unit's block on SQUAD (shown items only, HOLD and fact editing with the edit lock off); a SYS setting; analyze providers that read through `Knowledge`.

**Tech Stack:** TypeScript 5 (strict), esbuild, zod 3, vitest (+ jsdom for UI). No new dependencies.

**Spec:** `docs/packages/P14b-character-development.md`. Read before Task 1:
- `docs/00-overview.md` (§5.2, §5.3, §5.4, §11);
- the **Implemented as** of P1 (re-sync), P3b, P7 (Non-obvious things), P8, P9 (`Inverse`), P9d and P14;
- `docs/content/lore.md` §0.

## Global Constraints

- **Off is byte-identical.** `characterDevelopment` is read from `state.settings.characterDevelopment`; absent means **off**.
  - With it off, nothing is recorded, counted or reviewed, and no event is emitted.
  - `tests/warden/unaffected.test.ts` (the golden week), `tests/special/unaffected.test.ts`, every user of `tests/helpers/unaffectedWeek.ts` and `tests/engine/setup.test.ts` stay unchanged. Their campaigns are built without the field, so they are off.
  - A seeded test that moves **stops and reports**. It does not get a new golden.
- **No rng draw, ever.** A misread chance is `fnv1a(\`${unitId}|appraisal|${appraisalId}\`) / 2**32`. With development `normal`, a seeded week ends with the same `state.rng` as with it off (Task 6 pins this).
- **Old saves.** `Unit.development`, `Unit.insight` and `settings.characterDevelopment` are optional. Old saves stay off until the player turns development on in SYS. No migration, and the version is unchanged.
- **New campaigns.** `SetupResult.characterDevelopment?: 'off' | 'slow' | 'normal'`. The wizard sends `'normal'` (spec §8 default). `buildCampaign` writes it into `settings` only when present.
- **Never drift:**
  - `bond.ownLimits` and `bond.publicity`;
  - anything a disabled content category gates (rules, habits and axes with `tags`, through `contentAllowed`). The review input never names a disabled category;
  - an axis in `development.held` (user ruling, below);
  - bond fields of a unit without an **imported** bond (`unit.bond === undefined`);
  - anything of a grunt except counters and habits (spec §8).
- **Raw vs effective.** Engine and model-input code reads profile fields only through `valuesOf` / `effectiveValues`, `likesOf`, `dislikesOf`, `tastesOf` and `bondOf`.
  - The raw imported fields stay as imported. Only setup, re-sync and import code reads them, each such line marked `// P14b: raw profile`.
  - `tests/development/readers.test.ts` enforces this.
  - The gates that ask "is there an imported bond" (`unit.bond === undefined`: P9c `pressureGate`, `personal/access.ts`, `notes/dayStep.ts`) stay raw and are marked.
- **Quiet** (author ruling). No toast, no cut-in, no `VOICE_OF` entry and no `full` generation record for anything this package does. The site records `quiet`.
- **Hidden values.** These never reach a panel, toast, event text or reading:
  - accumulators, pending and misread appraisals, `insight`;
  - an unshown moment or fact;
  - whether an appraisal was misread.

  Each gets a sentinel in `tests/fixtures/analyze/hidden.ts`.
- **No pronoun for the commander** in any text the player or the main model reads: glossary, registry `description` / `up` / `down` / `fallback`, the review prompt, directives and the since-joining block (lore §0; `tests/content/pronouns.test.ts`). The soldiers are "she".
- **Read by field or type, never by id:**
  - rules by `match` / `by`;
  - axes by `kind`;
  - habits by `counter.kind`;
  - states by `bondTier`;
  - world options by effect type.
- **Ids.**
  - Engine events `appraisal_recorded`, `appraisal_revised`, `development_review`, `development_shift`, `development_moment`, `development_fact` and `habit_formed` join `RESERVED_EVENT_TYPES` (`// P14b`).
  - Actions: `development/set_mode`, `development/review`, `development/hold`, `development/edit_fact`, `development/remove_fact`.
  - Directive ids `development:<unitId>`.
  - Call type `development_review`; site `development.review`; flavor kind `habit` with site `flavor.habit`.
  - Registries `developmentAxes`, `developmentRules`, `habits`.
- **Memory check** (CLAUDE.md, overview §11):
  - `appraisal_recorded` and `appraisal_revised` are bookkeeping, with no rule.
  - `development_review` and `development_shift` are bookkeeping, with no rule.
  - `development_moment`, `development_fact` and `habit_formed` get **no `memoryRules` entry**. Development is her inner change, and it is quiet. The canonical store is `Unit.development.facts`, capped. It reaches the prompt only through the new `since_joining` provider (`group: 'memory'`, inside the P3b budget) and the player only through the DEVELOPMENT view. A habit others would notice is an open item for the author.
  - No new relation event type, so nothing new goes to the journal. No chronicle line.
- **Engine purity.** `src/engine/development/**` imports nothing from `src/llm`, `src/ui` or `src/st` (`tests/architecture.test.ts`).
- **Build output.** `npm test` rebuilds `dist/index.js` and `style.css`; commit both with every task. Baseline before Task 1: **458 files, 7178 tests, all passing** (2026-11-19).

## Where the plan rules on the spec (read before Task 1)

The user answered the rulings marked **(user)** on 2026-11-19. Task 17 copies every ruling into the spec's **Implemented as**. The spec's "open decisions (author)" (axes, rules table, anchors wording, caps, thresholds, cadence) get draft values here, marked `AUTHOR TO TUNE` in `TUNING.development` and `AUTHOR TO WRITE` in content.

### Axes (spec §2)

**(user)** P14b ships four axis kinds. P15 adds practice attitudes and styles later by adding axis kinds and registry rows.

An axis key is a string:

| kind | key | values | rule |
|---|---|---|---|
| `value` | `value:<axis>` (6) | drift −2…2 (fractional) | effective = `clamp(base + trunc(drift), −3, 3)` |
| `bond` | `bond:attachment`, `bond:desire`, `bond:caretaker`, `bond:leadStyle` | one ordered scale each | step only |
| `taste` | `taste:<tastes id>` | gained / lost | step only; at most 3 tastes |
| `like` / `dislike` | `like:<tag>`, `dislike:<tag>` | gained / lost | step only; tags normalized like import (`normalizeTag`), caps `SETUP_LIMITS.likes` / `.dislikes` |

- **(user) Values move in whole steps.**
  - Drift accumulates as a fraction. The value a reader sees moves one whole step only once `|drift| ≥ 1`.
  - Caps: `|drift| ≤ 2`, or `≤ 1` on an anchored axis.
  - A change of `trunc(drift)` is a development moment.
- **Bond scales** (`TUNING.development.scales`), low to high:
  - `desire`: `low, medium, high`;
  - `attachment`: `avoidant, slow, steady, intense`;
  - `leadStyle`: `yielding, balanced, assertive, dominant`;
  - `caretaker`: `false, true`.

  A step moves one place. Caps: two places from the imported value, or one place on an anchored axis.
- **(user) Likes and dislikes** are axes even though the spec names only tastes. Gaining a like removes the same tag from dislikes, and the reverse.
- **`developmentAxes` registry** (data, `content/core/developmentAxes.json`):

  ```
  { id: 'value:mercy' | 'bond:desire' | 'taste:*' | 'like:*' | 'dislike:*' | …,
    kind: 'value' | 'bond' | 'taste' | 'like' | 'dislike',
    up: string, down: string,
    description: string, tags?: string[] }
  ```

  - `up` and `down` are words for the since-joining block and the DEVELOPMENT view: "more merciful than her file says" / "harder than her file says"; for wildcards, "has come to like {tag}" / "no longer likes {tag}".
  - The 6 values, the 4 bond fields and 3 wildcards make 13 entries.
  - Code finds an axis's entry by exact id, then by `<kind>:*`.

### Development state

```ts
interface Development {
  /** value axes only; fractional, inside the caps */
  drift: Partial<Record<ValueAxis, number>>;
  /** axis key → support, clamped to ±TUNING.development.accCap */
  acc: Record<string, number>;
  /** discrete changes, applied on top of the import */
  bond?: Partial<Pick<Bond, 'attachment' | 'desire' | 'caretaker' | 'leadStyle'>>;
  gained?: { likes?: string[]; dislikes?: string[]; tastes?: string[] };
  lost?: { likes?: string[]; dislikes?: string[]; tastes?: string[] };
  /** axis keys from the import (≤ 4) */
  anchors: string[];
  /** (user) axis keys the player froze; edit lock off only */
  held?: string[];
  /** `activity:<id>` | `companion:<unitId>` | `region:<id>` → count */
  counters: Record<string, number>;
  /** since the last review, oldest dropped past 24 */
  pending: Appraisal[];
  /** kept for revision, ≤ 8, dropped after 30 days */
  misread?: Appraisal[];
  facts: DevFact[];
  moments: DevMoment[];
  habits: string[];
  /** day; absent = 0 */
  lastReview?: number;
  /** the last applied review, for REROLL */
  lastApplied?: ReviewInverse;
  /** per-unit id counter for `ap<n>`, `df<n>`, `dm<n>` */
  nextId: number;
}

interface DevFact {
  id: string;
  text: string;          // ≤ 140
  kind: 'attitude' | 'value' | 'habit' | 'skill' | 'memory';
  day: number;
  source: 'review' | 'habit';
  sceneId?: string;
  shownDay?: number;
  edited?: true;
}

interface DevMoment {
  id: string;
  axis: string;
  from: string;
  to: string;
  reason: string;        // ≤ 120
  day: number;
  sceneId?: string;
  shownDay?: number;
}
```

- `developmentOf(unit): Development` returns the empty default without writing.
- `ensureDevelopment(unit)` writes it on first use.
- `Unit.insight?: 'low' | 'mid' | 'high'` (absent = `mid`) is a profile field from the import (below).

### Appraisal (spec §3) — (user) the model reads, the engine views

- **The model's reading.** `intent_extract` gains one optional field per event:

  ```
  reading: { wanted, initiator, harm, outcome }
  ```

  with the spec's values. `validateIntents` keeps it only when all four are valid words. It is offered only while `characterDevelopment` is not off (`IntentExtractInput.reading?: true`), so a campaign that is off sends the same prompt as before. `scene_summary` is unchanged (open item).
- **Engine-made events** take `eventDeltas[].appraisal?` (same four fields), a new optional registry field. With neither, nothing is recorded. Draft rows in Task 2 for: `commander_enforced`, `threatened`, `coerced`, `protected`, `endangered`, `praised`, `insulted`, `comforted`, `physical_affection`, `accepted_advance`, `rejected_advance`, `granted_demand`, `refused_demand`, `shielded`, `overrode_her`.
- **The viewer's appraisal** (`appraise(state, reg, viewerId, event, reading, role)`):

  ```
  Appraisal { id, day, kind: event.type, target, role, wanted, initiator, harm, outcome,
              severity, sceneId?, subject: 'commander' | unitId,
              misread?: true, pushes: Array<{ axis, amount }>, summary (≤ 160) }
  ```

  - **subject or actor:** `applyEventToUnit` records for the unit it applies to, inside the function, so every caller is covered (punishments, demands, power moves, leash, her-call). `role` is `actor` when `event.actor === unitId`, otherwise `subject`. `target` is `commander` for `actor` and `her` for `subject`. `subject` is the commander for `actor`, otherwise the unit.
  - **witness:** in `applyIntents`, scene channel only. Each named participant who is neither the actor nor among the event's believed units gets `role: 'witness'`. `target` is `unit:<id>` when the actor is the commander (the first believed unit); otherwise `commander`. `subject` is that unit or the commander.
  - **Activities:** `activity_done` with a companion records `kind: 'activity:<id>'`, `role: 'subject'`, `target: 'her'`, with the reading `{ wanted: 'yes', initiator: 'actor', harm: 'none', outcome: 'good' }` from `activities[].appraisal?`. It is recorded only when the entry has that field. Drafts: `train`, `rest`, `talk`, `medbay`.
  - **Dilemmas:** `dilemma_resolved` with `units` records `kind: 'dilemma:<context>'` from `dilemmaTemplates[].appraisal?`. It is optional and absent in the drafts (open item), so nothing happens until the author adds one.
  - `summary` is engine-composed: `"<role> · <kind> · <subject name> · wanted <w>, harm <h>, outcome <o>"`, plus `: "<evidence>"` cut to 60 when the event has evidence.
- **(user) Misreading** (witnesses only, only when `wanted` is `yes` or `no`):
  - `chance = TUNING.development.misread[insight]` (low 0.35, mid 0.15, high 0.05);
  - ×`secretMult` 1.5 when the subject unit's `relations[subject].publicity?.level === 'secret'`;
  - capped at 0.6.
  - A hit flips `wanted` (yes ↔ no) and `initiator` (target ↔ actor), and sets `misread: true`.
- **(user) Revision.** At the day end (`dm_rumors` hook, `developmentDayStep`, registered after `spreadRumors`), a misread appraisal is revised when she now knows (`knownBy` holds her or `*`, or `heard[her]` is set) a fact whose `about` holds the subject (`'commander'` or the unit id) and whose `day > appraisal.day`.
  - Revision: `acc -= revertShare(0.5) × misread pushes`, then `acc += revertShare × pushes of the true reading`.
  - It emits `appraisal_revised { unitId, appraisalId }` and removes the appraisal from `misread`.
  - Misread appraisals older than 30 days are dropped unrevised.
- **UNDO (P9).** `Inverse.appraisals?: Array<{ unitId, id }>`. `captureInverse` collects the appraisals the application recorded, and `undoApplication` removes them from `pending` / `misread` and subtracts their `pushes` from `acc`.

### Accumulators (spec §4)

`developmentRules` entries:

```
{ id, match: { kind?: string[], role?: Role[], target?: ('her'|'commander'|'unit'|'squad')[],
               wanted?, initiator?, harm?, outcome? (arrays of words) },
  by?: { values?: Partial<Record<ValueAxis, '+' | '-'>>, caretaker?: boolean, leadStyle?: LeadStyle[],
         attachment?: Attachment[], insight?: Insight[] },
  push: Array<{ axis: string, amount: number }>, tags?: string[], description }
```

- `kind` matches exactly, or as a prefix when it ends with `:*` (`activity:*`). The `unit` target matches any `unit:<id>`.
- `by` reads her **effective** profile (`valuesOf`, `bondOf`). Value `+` needs > 0 and `−` needs < 0.
- `push.axis` may be `like:{tag}`, which takes each of the event's `tags` (an event without tags skips that push).
- Every matching rule adds `amount × severityMult[severity] × modeMult[mode]`, with:
  - `severityMult`: minor 0.5, moderate 1, major 1.5, extreme 2;
  - `modeMult`: slow 0.5, normal 1.

  The sum is clamped to ±`accCap` (6) per axis.
- **Ignored:** forbidden axes (see Global Constraints), a held axis, and a rule `contentAllowed` refuses (`CONTENT_GATED_REGISTRIES` gains `developmentRules` and `habits`).
- The pushes are stored on the appraisal (for revision and UNDO).
- **Accumulators never change a profile field** (spec §4). They only make an axis eligible.
- **Draft rules** (Task 2): 16 rows. Acceptance 3 is pinned by fixture tests on these rows:
  - **caretaker witness:** `commander_enforced` or `coerced` on a unit, `wanted: no` → `value:mercy +1`, `value:autonomy +0.5`;
  - **same event read `wanted: yes, initiator: target, outcome: good`:** caretaker → `value:autonomy −0.5`; `leadStyle dominant` with `autonomy +` → `bond:leadStyle +1`;
  - **cold reader** (`mercy −`) witnessing a coerced unit → `value:mercy −0.5`;
  - **kindness received** (`comforted`, `praised`, `protected`; subject; outcome good) → `value:mercy +0.5`, `value:ingroup +0.5`;
  - **harm received** (`endangered`, `insulted`; subject; harm minor or serious) → `value:ingroup −0.5`, `bond:attachment −0.5`;
  - **activity done with the commander** (`activity:*`, outcome good) → `like:{tag}`-style pushes from the activity's `appraisalTags` (Task 2 adds `appraisalTags` to `train` → `training` and `talk` → `talk`).

### Review (spec §4) and validation

- **Due** (`reviewDue(state, reg)`, the first match in squad order): mode on; a named living unit; `pending.length ≥ minMaterial` (3); and either `day − (lastReview ?? 0) ≥ cadence[mode]` (normal 7, slow 14) or some `|acc| ≥ dueAcc` (4.5).
- **Input** (`DevelopmentReviewInput`), rebuilt from the state by `build`:
  - `name`;
  - `card`: description and personality cut to 600, as the warden agenda and the head start do;
  - `profile`: her effective values, likes, dislikes, tastes (names), and bond fields when imported;
  - `anchors`;
  - `axes`: each eligible axis with direction and support band (`weak` ≥ 1, `strong` ≥ `stepThreshold`), never the number;
  - `experiences`: the `summary` of each pending appraisal, newest last;
  - `facts`: her development facts (text);
  - `categories`: the enabled ones only.
- **Output** (zod):

  ```
  { shifts: [{ axis, direction: 'up' | 'down', size: 'nudge' | 'step', reason }],
    facts: [{ text, kind }] }
  ```

  At most 3 of each; `reason` ≤ 120, `text` ≤ 140. `sanitizeReview(raw, input)` strips markdown, drops unknown axes and kinds, and cuts. It returns `null` (an `invalid_output`) only when the JSON has neither array. An empty review is valid.
- **The engine validates** (`validateReview(state, reg, unitId, review) → { shifts, facts, dropped }`). A shift is dropped when any of these holds:
  - the axis is not eligible: it is forbidden, held, unknown, or a grunt's;
  - the direction is against `sign(acc)`;
  - `|acc| < nudgeMin` (1);
  - for `step`: `|acc| < stepThreshold` (3), or ×`anchorMult` (1.5) when anchored;
  - the axis is at its cap;
  - for `nudge` on a non-value axis: discrete axes only step.
- **Apply** (`development/review { unitId, review, source: 'model' | 'fallback' }`):
  - **value `nudge`:** `drift ± nudge` (0.34; ×0.5 when anchored), then consume `nudgeCost` (1) from `acc`;
  - **value `step`:** drift to the next whole number in that direction, consume `stepThreshold`;
  - **discrete `step`:** set the next scale place, or gain/lose the tag or taste, then consume `stepThreshold`;
  - **a change of the effective value of any axis** → a `DevMoment` + `development_moment`;
  - **every shift** → `development_shift { unitId, axis, size }`;
  - **facts** → `DevFact` (`source: 'review'`) + `development_fact`. The list keeps at most `factsMax` (12) by dropping the oldest unedited fact;
  - then `pending = []`, `lastReview = day`, `lastApplied` = the inverse, and `development_review { unitId, source, shifts: n, facts: n }`.
- **Fallback review** (`fallbackReview(state, reg, unitId)`): a `nudge` for each eligible value axis with `|acc| ≥ nudgeMin`, at most 3, strongest first; no facts and no discrete steps. No profile, a failure or development `slow` without a profile all use it.
- **REROLL** (`before_commit`):
  - `committed`: refused once a scene has started since the review (`moments` or `facts` from it have a `sceneId`), or another review ran. The reason is `"She has already shown it."`
  - `undo`: replays `lastApplied` (drift, discrete changes, acc consumed, facts and moments removed, `lastReview` and `pending` restored).
  - A reroll draws nothing.

### Moments (spec §5)

- `scene/start` stamps `sceneId` on each participant's moments and facts that have neither `sceneId` nor `shownDay`.
- `scene/end` sets `shownDay = day` on the ones stamped with that scene.
- `scene/abort` clears those stamps.
- The controller sets a directive `development:<unitId>` (`expiresAfter: 'scene'`) for each participant with stamped moments when the scene opens:

  ```
  {Name} has changed lately: {words}. Let it show in how she acts this scene; never announce it.
  ```

  `{words}` joins the `up`/`down` words of her stamped moments (`AUTHOR TO WRITE` wording; no pronoun for the commander).
- The DEVELOPMENT view and its readings list only items with `shownDay`. The since-joining block uses all facts: behaviour first.

### Habits (spec §6)

- **Counters** (mode on, named units and grunts):
  - `activity:<id>` +1 for the companion of a companion activity (activity hook);
  - `companion:<otherId>` +1 for each pair of named participants of a scene at `scene/end`, and for each pair in the party of an ended expedition;
  - `region:<regionId>` +1 for each party member at `endExpedition`.
- **`habits` registry:**

  ```
  { id, counter: { kind: 'activity' | 'companion' | 'region', id?: string }, threshold, fallback, description,
    effect?: { type: 'unit_stress' | 'unit_xp', amount, activityId }, tags? }
  ```

  - `kind: 'companion'` matches any `companion:*` key, and the fallback may use `{other}`.
  - When a counter reaches `threshold` and the habit is not held, the engine adds the habit id, writes a `DevFact` (`kind: habit`, `source: 'habit'`) with the registry `fallback`, and emits `habit_formed { unitId, habitId, factId }`.
- **Wording.** Flavor kind `habit` (site `flavor.habit`, surface `day`, reroll `free`, record `none`) may replace the text afterwards through `development/edit_fact` with `{ byModel: true }`. That replacement never marks the fact `edited`. It runs only while the setting `habitWording` is on (default off, like `fragmentWording`).
- **Effect.** When she is the companion of `effect.activityId`, the hook applies `unit_stress` or `unit_xp` to her (same sign rules as the activity effects).
- **Draft habits:**
  - `drills_daily` (activity `train` ≥ 8; `unit_xp +5` on train);
  - `medbay_regular` (activity `medbay` ≥ 6; narration);
  - `rests_easy` (activity `rest` ≥ 8; `unit_stress −3` on rest);
  - `close_with` (companion ≥ 10; narration: "{name} picked up a habit from {other}");
  - `knows_region` (region ≥ 4; narration).

### Import: anchors and insight

- `profile_import` gains a section `development`, in `ALL_SECTIONS` and re-syncable as `RESYNC_SECTIONS` `'development'`. It returns:
  - `anchors`: ≤ 4 axis keys of traits the card states strongly ("fiercely loyal" → `value:ingroup`), validated against the axis kinds;
  - `insight`: `low` / `mid` / `high`.
- The wizard's calibration shows both read-only.
- **Re-sync keeps development** (spec §8). The re-sync dialog gains a checkbox **Reset development** (`resetDevelopment: true` in the `squad/resync` payload). It deletes `unit.development` and is unchecked by default.

### Control (spec §8)

- **SYS setting:** **Character development** `off / slow / normal`, dispatched as `development/set_mode { mode }`. Turning it off keeps what she already became and stops new recording.
- **(user) HOLD.** With the edit lock off, the DEVELOPMENT view has a HOLD toggle per axis line (`development/hold { unitId, axis, on }`) and EDIT / REMOVE per fact (`development/edit_fact`, `development/remove_fact`). A held axis keeps its drift and change and takes no pushes and no shifts.

---

## Review Focus

1. **A campaign that is off is the campaign as it was.** An old save or a test campaign without the setting records nothing, sends the old `intent_extract` prompt, emits no new event and keeps every golden. With `normal`, the rng is untouched and no relation axis moves until a review applies. Tests in Task 1 (`absent setting is off`) and Task 6 (`a seeded week with development on draws the same rng`).
2. **A reader that bypasses the effective profile.** After a value steps up, every system that reads that value must see the new one: ballots, the crime reaction, the warden agenda, the model inputs. A missed `unit.values` read silently plays the old woman. Tests in Task 3 (`readers guard`) and Task 4 (`a stepped value reaches the ballot, the delta chain and the intent input`).
3. **A review answer that overreaches.** It might step an anchored axis without support, step against the accumulators, name a disabled category, touch `ownLimits`, give a grunt a value shift, or send over-long or extra items. The engine drops each one and keeps the rest; the fallback review never steps. Tests in Task 9 (`validation drops …`, one per case) and Task 10 (`sanitize cuts and drops`).
4. **Reroll, chat switch and UNDO.**
   - A REROLL after the moment was shown is refused.
   - A reroll before that restores drift, discrete fields, acc, facts, moments and pending exactly.
   - An answer for another chat is dropped.
   - A punishment UNDO removes its appraisals and their pushes.
   - Tests in Task 9 (`undo restores exactly`), Task 11 (`answer after a chat switch is dropped`, `reroll refused after the scene`) and Task 5 (`undo removes appraisals`).
5. **Misreading and revision edges.** Only a witness misreads; `unclear` is never flipped; a misread is revised once a newer fact about the subject reaches her (heard as a rumor counts), and dropped after 30 days. A `secret` relationship raises the chance. Two runs with the same ids give the same result. Tests in Task 7.

---

## Chunk (a): the engine

### Task 1: State, the setting and tuning

**Files:**
- Create: `src/engine/development/state.ts` (leaf: types, `developmentOf`, `ensureDevelopment`, `developmentMode`, `nextDevId`)
- Modify:
  - `src/engine/state/types.ts`: `Unit.development?: Development`, `Unit.insight?: Insight`, the types above (re-exported from `state.ts`);
  - `src/engine/tuning.ts`: `TUNING.development`;
  - `src/engine/setup.ts`: `SetupResult.characterDevelopment?`, validated, written into `settings` when present;
  - `src/setup/wizard.ts`: the result carries `characterDevelopment: 'normal'`;
  - `src/engine/actions/development.ts` (new): `development/set_mode`;
  - `src/app.ts`: `import './engine/actions/development'` after `./engine/actions/headStart`.
- Test: `tests/engine/development/state.test.ts`

**Interfaces:**
- Produces:
  - `type DevelopmentMode = 'off' | 'slow' | 'normal'`;
  - `type Insight = 'low' | 'mid' | 'high'`;
  - `developmentMode(state: Pick<CampaignState, 'settings'>): DevelopmentMode` (absent or invalid = `'off'`);
  - `developmentOf(unit: Pick<Unit, 'development'>): Readonly<Development>`;
  - `ensureDevelopment(unit: Unit): Development`;
  - `nextDevId(dev: Development, prefix: 'ap' | 'df' | 'dm'): string`;
  - `TUNING.development`:

    ```ts
    {
      accCap: 6, nudgeMin: 1, nudge: 0.34, nudgeCost: 1, stepThreshold: 3, anchorMult: 1.5, anchorInertia: 0.5,
      valueCap: 2, anchoredValueCap: 1, discreteCap: 2, anchoredDiscreteCap: 1,
      severityMult: { minor: 0.5, moderate: 1, major: 1.5, extreme: 2 }, modeMult: { slow: 0.5, normal: 1 },
      cadence: { slow: 14, normal: 7 }, minMaterial: 3, dueAcc: 4.5,
      pendingMax: 24, misreadMax: 8, misreadDays: 30, factsMax: 12, maxShifts: 3, maxFacts: 3,
      reasonMax: 120, factTextMax: 140, summaryMax: 160, cardMax: 600, anchorsMax: 4,
      misread: { low: 0.35, mid: 0.15, high: 0.05 }, secretMult: 1.5, misreadCap: 0.6, revertShare: 0.5,
      scales: { desire: ['low', 'medium', 'high'], attachment: ['avoidant', 'slow', 'steady', 'intense'],
                leadStyle: ['yielding', 'balanced', 'assertive', 'dominant'], caretaker: [false, true] },
    } // AUTHOR TO TUNE
    ```

- [x] **Step 1: Write the failing tests**
  - `absent setting is off`: `developmentMode({ settings: {} })` is `'off'`; `{ characterDevelopment: 'fast' }` is `'off'`; `'slow'` and `'normal'` read back.
  - `developmentOf does not write`: a unit without `development` stays without it; the result has `drift {}`, `acc {}`, `pending []`, `nextId 0`.
  - `nextDevId counts per unit`: `ap0`, `df1`, `dm2`.
  - `setup writes the mode only when present`: `buildCampaign` with `characterDevelopment: 'normal'` stores it; without the field `settings` has no key (deep-equal to a build before this task, so `tests/engine/setup.test.ts` stays green).
  - `invalid mode is a setup error`: `'fast'` → one readable line.
  - `set_mode`: `development/set_mode { mode: 'slow' }` stores it; `'off'` stores `'off'` and keeps every `development` block; an unknown mode throws.
- [x] **Step 2: Run** `npx vitest run tests/engine/development/state.test.ts` → FAIL.
- [x] **Step 3: Implement** as in Interfaces. `state.ts` imports types and `TUNING` only.
- [x] **Step 4: Run** the file, then `npm test` → PASS (the goldens unchanged).
- [x] **Step 5: Commit** `feat(P14b): development state, the setting and tuning`

---

### Task 2: Registries, appraisal fields and the glossary

**Files:**
- Create: `content/core/developmentAxes.json` (13), `content/core/developmentRules.json` (16), `content/core/habits.json` (5)
- Modify:
  - `src/content/types.ts`: the three names in `REGISTRY_NAMES` (`// P14b`);
  - `src/content/schemas.ts`: `DevelopmentAxisSchema`, `DevelopmentRuleSchema`, `HabitSchema`; `ReadingSchema` (four enums) as optional `appraisal` on `eventDeltas`, `activities` and `dilemmaTemplates`; `activities[].appraisalTags?: string[]`; `DESCRIBED_REGISTRIES` gains the three; `RESERVED_EVENT_TYPES` gains the seven events; `CONTENT_GATED_REGISTRIES` gains `developmentRules` and `habits`;
  - `src/content/refs.ts`: a rule's `push.axis` and an anchor must resolve to a `developmentAxes` entry (exact or wildcard); `taste:<id>` must be a `tastes` id; `match.kind` entries must be event types, `activity:<activities id>`, `activity:*` or `dilemma:<context>`; `habits[].counter.id` must be an `activities` / `regions` id for those kinds; `effect.activityId` must be an activity;
  - `content/core/manifest.json`; `content/core/eventDeltas.json` (15 `appraisal` rows, listed in the rulings); `content/core/activities.json` (`appraisal` + `appraisalTags` on `train`, `rest`, `talk`, `medbay`);
  - `content/core/glossary.json`: `character_development`, `development_moment`, `development_fact`, `habit`, `development_hold`, `appraisal`.
- Test: `tests/content/developmentSchemas.test.ts`

**Interfaces:**
- Produces the registry entry shapes from the rulings (`DevelopmentAxisEntry`, `DevelopmentRuleEntry`, `HabitEntry`, `Reading`), exported from `src/engine/development/types.ts` as plain TS types matching the zod schemas.

- [x] **Step 1: Write the failing tests**
  - `the core pack loads the three registries` with 13 / 16 / 5 entries and no load errors.
  - `every value axis and every bond field has an axis entry`; the wildcards `taste:*`, `like:*`, `dislike:*` exist.
  - `an unknown push axis is a content error` (fixture pack: `"axis": "value:greed"`).
  - `a taste axis needs a tastes id` (`taste:nope` → error).
  - `bond:ownLimits is refused` (schema: no axis entry may be `bond:ownLimits` or `bond:publicity`).
  - `the seven event names are reserved` (a `memoryRules` fixture using `development_fact` is refused).
  - `eventDeltas appraisal rows are valid`: `commander_enforced.appraisal` is `{ wanted: 'no', initiator: 'actor', harm: 'minor', outcome: 'bad' }`.
  - `developmentRules is content-gated` (`CONTENT_GATED_REGISTRIES` includes it).
  - The pronoun test covers the new files (it globs `content/core`; if it lists files, add them).
- [x] **Step 2: Run** `npx vitest run tests/content/developmentSchemas.test.ts` → FAIL.
- [x] **Step 3: Implement.**
  - Every `description`, `up`, `down` and `fallback` starts `AUTHOR TO WRITE:` and never gives the commander a pronoun.
  - The 16 rules cover the six groups in the rulings, plus one row per bond field (`bond:desire` from `physical_affection` / `accepted_advance` received, wanted yes, outcome good; `bond:caretaker` from `protected` with `role: actor`; `bond:attachment` from `comforted` received, outcome good). P14b ships no taste rule (open item: the author ties tastes to presence events); a review can still step a taste only if some rule gave it support, so tastes stay put until then.
  - Glossary texts (draft): `character_development`: "Soldiers change slowly from what they live through. Nothing announces it: it shows in how she acts, and her file records it afterwards."
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P14b): development axes, rules and habits registries, appraisal fields`

---

### Task 3: The effective profile and the readers guard

**Files:**
- Create: `src/engine/development/profile.ts`
- Modify:
  - `src/engine/bonds/profile.ts`: `bondOf` folds `development.bond` in;
  - `src/engine/worldOptions/stances.ts`: `effectiveValues` starts from `valuesOf(unit)`.
- Test: `tests/engine/development/profile.test.ts`, `tests/development/readers.test.ts`

**Interfaces:**
- Produces:
  - `valuesOf(unit: Pick<Unit, 'values' | 'development'>): Unit['values']`: base + `trunc(drift)`, clamped −3…3;
  - `likesOf(unit)`, `dislikesOf(unit)`, `tastesOf(unit)`: `string[]`, the import minus `lost`, plus `gained` (dedup, import order first);
  - `bondOf(unit)`: unchanged signature (`Pick<Unit, 'kind' | 'bond' | 'development'>`); with an imported bond, `{ ...bond, ...development.bond }`; the modest default never takes development;
  - `effectiveProfile(unit) => { values, likes, dislikes, tastes, bond }`;
  - `RAW_MARK = '// P14b: raw profile'`.

- [x] **Step 1: Write the failing tests**
  - `drift moves in whole steps`: base mercy 1, drift 0.9 → 1; drift 1.2 → 2; drift −1.7 → 0; base 3, drift 2 → 3 (clamped).
  - `likes gain and lose`: likes `['tech']`, gained `['cooking']`, lost `['tech']` → `['cooking']`.
  - `bondOf takes development only on an imported bond`: a unit with `bond` and `development.bond.desire 'high'` → `desire 'high'`; a unit without `bond` → `MODEST_BOND` unchanged.
  - `effectiveValues adds the stance on top of drift`.
  - `readers guard` (`tests/development/readers.test.ts`):
    - scan `src/**/*.ts`, except `src/engine/development/**`, `src/engine/setup.ts`, `src/engine/actions/squad.ts`, `src/setup/**`, `src/ui/setup/**`;
    - fail on any line matching `/\b(unit|u|her|other|companion|w|warden|a|b|subject|target)\??\.(values|likes|dislikes|commanderTastes)\b/` or `/\.bond\??\.(leadStyle|attachment|desire|caretaker)\b/`, unless the line carries `RAW_MARK`.
- [x] **Step 2: Run** the two files → FAIL (the guard lists today's ~45 direct reads).
- [x] **Step 3: Implement** `profile.ts`, `bondOf` and `effectiveValues`. In this task only, the guard has an explicit `PENDING` allow-list of today's offending files (copied from the failing output). Task 4 empties it.
- [x] **Step 4: Run** → PASS; `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P14b): effective profile readers and the guard`

---

### Task 4: Every reader reads the effective profile

**Files:**
- Modify (each direct read becomes `valuesOf` / `effectiveValues` / `likesOf` / `dislikesOf` / `tastesOf`, or gets `RAW_MARK`):
  - `src/engine/`: `bonds/publicity.ts`, `commander/presence.ts` (`matchedTastes` takes `Pick<Unit, 'commanderTastes' | 'development'>` and reads `tastesOf`), `leash/use.ts`, `discipline/reputation.ts`, `discipline/perception.ts`, `discipline/demands.ts`, `arcs.ts`, `personal/reactions.ts`, `power/ballot.ts`, `warden/{agenda,removal,select,leash,intrigue}.ts`, `dilemma/{validate,flow}.ts`, `memory/crime.ts`, `relations/deltas.ts`, `items.ts`, `activities.ts`, `hub.ts`;
  - model inputs: `src/scene/sceneController.ts`, `src/scene/comms.ts`, `src/scene/memoryContext.ts`, `src/warden/controller.ts`, `src/app.ts` (vignette input; the re-sync builders at the resync functions keep raw with `RAW_MARK`);
  - UI: `src/ui/device/marks.ts`, `src/ui/squad/squadTab.ts` (the value bands show **effective** values; the raw import is shown only in the re-sync review);
  - `src/engine/headStart/moments.ts` and `src/engine/setup.ts` stay raw (build time, development empty) with `RAW_MARK`;
  - `tests/development/readers.test.ts`: `PENDING` becomes empty and is removed.
- Test: `tests/engine/development/readers.test.ts`

**Interfaces:**
- Consumes: Task 3's readers.
- Produces: no new API; behaviour only.

- [x] **Step 1: Write the failing tests** (`tests/engine/development/readers.test.ts`), each on a campaign where one unit has `development.drift.corporate = 1.5` (base 0, so effective 1) or `gained.likes ['tech']`:
  - `a stepped value reaches the ballot`: `compatibility` (`power/ballot.ts`) of her and a `corporate 1` unit equals that of two `corporate 1` imports;
  - `… the warden pick`: `corporateWardenPick` picks her over an equal-base unit;
  - `… the crime reaction`: `reactsToCrime` (memory/crime) for a crime with `corporate +`;
  - `… the delta chain`: an event tagged `tech` counts as liked in `computeDeltas`;
  - `… the intent input`: the `IntentUnitInput` built by the scene controller carries `corporate 1` and likes with `tech`;
  - `the squad tab shows the effective band` (jsdom).
- [x] **Step 2: Run** → FAIL (the reads are raw).
- [x] **Step 3: Implement** the replacements. A `Pick<Unit, …>` parameter that now needs `development` adds it. Keep every behaviour identical when `development` is absent.
- [x] **Step 4: Run** the file and the guard, then `npm test` → PASS. The goldens must not move (development is absent in them).
- [x] **Step 5: Commit** `refactor(P14b): profile readers go through the effective profile`

---

### Task 5: Recording appraisals

**Files:**
- Create: `src/engine/development/appraisal.ts`
- Modify:
  - `src/engine/relations/intents.ts`: `EventIntent.reading?: Reading`; `validateIntents` keeps a complete, valid `reading` and drops a partial one;
  - `src/llm/calls/intentExtract.ts`: `IntentExtractInput.reading?: true` adds `"reading": { "wanted": …, "initiator": …, "harm": …, "outcome": … }` to the event shape and one rule line (`"reading": how the person it happened to took it, judged from the text`); absent = the prompt is byte-identical to today (pinned);
  - the input builders (`src/scene/sceneController.ts`, `src/scene/comms.ts`) set `reading: true` while `developmentMode` is not off;
  - `src/engine/relations/effects.ts`: `applyEventToUnit` calls `recordAppraisal(draft, reg, unitId, event, role)` after the deltas (role from `event.actor`);
  - `src/engine/relations/apply.ts`: scene channel, after each judged event, `recordWitnesses(draft, reg, event, believed, participants)`;
  - `src/engine/activities.ts` (via `registerActivityHook` in `actions/development.ts`): `activity:<id>` appraisal for the companion;
  - `src/engine/discipline/record.ts`: `captureInverse` collects `Inverse.appraisals`; `undoApplication` reverts them; `src/engine/state/types.ts`: `Inverse.appraisals?`.
- Test: `tests/engine/development/appraisal.test.ts`

**Interfaces:**
- Produces:
  - `readingFor(reg, event: EventIntent): Reading | null` (`event.reading`, else `eventDeltas[type].appraisal`, else null);
  - `recordAppraisal(draft, reg, unitId, event, role: 'subject' | 'actor', opts?: { sceneId?: string }): EngineEvent[]`;
  - `recordWitnesses(draft, reg, event, believed: string[], participants: string[], sceneId?: string): EngineEvent[]`;
  - `recordActivity(draft, reg, unitId, activityId): EngineEvent[]`.

  Each returns `[]` when the mode is off, the unit is a grunt or not living, or no reading exists. Otherwise it pushes the appraisal (accumulation is Task 6; the misread is Task 7), trims `pending` to `pendingMax`, and returns `appraisal_recorded { unitId, appraisalId, role }`.

- [x] **Step 1: Write the failing tests**
  - `off records nothing`: mode absent, an `insulted` intent applied → no `development` on any unit, no `appraisal_recorded`.
  - `subject and actor`: mode normal; `praised` (commander → ANN) gives ANN `role subject, target her`; `shared_secret` with actor BEA gives BEA `role actor, target commander`.
  - `witness`: a scene with ANN, BEA, CAT; `commander_enforced` on ANN → BEA and CAT each get `role witness`, `target unit:ANN`, `subject ANN`; ANN gets `subject`.
  - `dm has no witnesses`.
  - `the model's reading wins over the registry`: an event with `reading.wanted 'yes'` stores `yes` although `commander_enforced.appraisal.wanted` is `no`.
  - `an engine event without a reading row records nothing`.
  - `a partial reading is dropped by validateIntents`.
  - `pending is capped`: 30 events → 24, oldest dropped.
  - `the intent prompt is unchanged without reading` (snapshot of the system text with `reading` absent equals the one before this task: store the string in the test from the pre-change build).
  - `undo removes appraisals`: `discipline/punish` then `discipline/undo` → the appraisal is gone and `acc` is back to its value before (Task 6 adds pushes; here assert `pending` only, and extend in Task 6).
  - `grunts never appraise`.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement** as in Interfaces. The `summary` is composed from the rulings. Ids come from `nextDevId(dev, 'ap')`.
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P14b): appraisals from the viewer's point of view`

---

### Task 6: Rule accumulators

**Files:**
- Create: `src/engine/development/rules.ts`, `src/engine/development/axes.ts`
- Modify: `src/engine/development/appraisal.ts` (accumulate on record); `tests/engine/development/appraisal.test.ts` (UNDO also restores `acc`)
- Test: `tests/engine/development/rules.test.ts`, `tests/development/unaffected.test.ts`

**Interfaces:**
- Produces:
  - `axisEntry(reg, key): DevelopmentAxisEntry | null` (exact, then wildcard);
  - `axisKind(key): 'value' | 'bond' | 'taste' | 'like' | 'dislike' | null`;
  - `axisForbidden(state, reg, unit, key): string | null` (the reason, or null);
  - `isAnchored(unit, key): boolean`;
  - `matchRules(state, reg, unit, a: Appraisal, tags: string[]): Array<{ axis, amount }>` (mode, severity and caps applied; forbidden and held dropped; `like:{tag}` expanded);
  - `accumulate(unit, pushes)` (clamp ±`accCap`).

- [x] **Step 1: Write the failing tests** (fixture units from the draft rules; acceptance 3):
  - `the same event moves different women differently`: one `coerced` on ANN witnessed by:
    - a caretaker reading `wanted no` → `value:mercy +` and `value:autonomy +`;
    - a `mercy −` unit → `value:mercy −`;
    - the caretaker reading `wanted yes, initiator target, outcome good` → `value:autonomy −`;
    - a `dominant` lead with `autonomy +` reading the same → `bond:leadStyle +`.
  - `severity and mode scale`: extreme × normal = 2× moderate; slow halves.
  - `acc is clamped at ±6`.
  - `held axes take nothing`.
  - `bond pushes need an imported bond`; `ownLimits` can never be pushed (no axis entry; a fixture rule naming it fails to load).
  - `a rule tagged with a disabled category is ignored` (`contentAllowed`).
  - `accumulators never change a profile field`: 50 events later `valuesOf` equals the import.
  - `tests/development/unaffected.test.ts`: run `runWeek` twice, once as is and once with `settings.characterDevelopment = 'normal'` set before the first step. Then:
    - `rng` is equal;
    - the event log minus the seven new event types is equal;
    - every relation's axes are equal;
    - some unit has non-empty `pending`.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement.** `recordAppraisal` stores `pushes` on the appraisal and calls `accumulate`.
- [x] **Step 4: Run** the files, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P14b): rule accumulators with inertia, caps and holds`

---

### Task 7: Misreading and revision

**Files:**
- Create: `src/engine/development/misread.ts`
- Modify: `src/engine/development/appraisal.ts` (witness misread on record); `src/engine/actions/development.ts` (`registerDayEndStep('dm_rumors', developmentDayStep)`; this module is imported after `actions/memory`, so it runs after `spreadRumors`)
- Test: `tests/engine/development/misread.test.ts`

**Interfaces:**
- Produces:
  - `misreadChance(state, unit, subject: string): number`;
  - `misreads(state, unit, appraisalId, subject): boolean` (hash < chance);
  - `flipReading(r: Reading): Reading`;
  - `reviseMisreads(draft, reg): EngineEvent[]`;
  - `developmentDayStep(draft, ctx): EngineEvent[]` (revision, then the 30-day drop).

- [x] **Step 1: Write the failing tests**
  - `only witnesses misread`: with `insight 'low'` and a chance forced by choosing an appraisal id whose hash is below 0.35 (find one in the test by scanning ids), the subject keeps the true reading and the witness flips.
  - `unclear never flips`.
  - `insight orders the chance`: low > mid > high; a `secret` subject relation ×1.5, capped 0.6.
  - `deterministic`: the same state and ids give the same result twice; `state.rng` is untouched.
  - `revised when a newer fact reaches her`: a misread about ANN on day 3, then a fact `about [ANN]` on day 5 with `heard[BEA] = 5` → at day end, `appraisal_revised`; `acc` moved by `−0.5 × misread pushes + 0.5 × true pushes`; the appraisal left `misread`.
  - `an older fact does not revise`.
  - `dropped after 30 days unrevised`.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement.** The misread copy goes to both `pending` (the review reads what she believes) and `misread` (≤ 8, oldest out). The true reading is stored on the misread copy as `truth`.
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P14b): misreading by insight, revision when the truth reaches her`

---

### Task 8: Anchors and insight at import, re-sync keeps development

**Files:**
- Modify:
  - `src/llm/calls/profileImport.ts`: section `development` (`ImportSection`, `ALL_SECTIONS`, schema part, prompt lines listing the axis keys from `developmentAxes` without wildcards plus `taste:<id>` for her tastes);
  - `src/setup/profile.ts`: `ImportedProfile.anchors?`, `.insight?`; `sanitizeProfile` validates keys (`axisEntry`), dedups and caps at 4, `insight` default `mid`;
  - `src/engine/setup.ts`: `UnitSetup.anchors?`, `.insight?`; `makeNamedUnit` writes `insight` when not `mid` and `development.anchors` only when non-empty (no empty block);
  - `src/engine/actions/squad.ts`: `RESYNC_SECTIONS` gains `'development'` (anchors and insight; never drift); payload `resetDevelopment?: true` deletes `unit.development`;
  - `src/setup/wizard.ts`, `src/ui/setup/calibration.ts`: anchors and insight shown read-only (`data-analyze="glossary:character_development"`);
  - `src/ui/squad/squadTab.ts` (re-sync dialog): the **Reset development** checkbox, `data-analyze`, unchecked by default.
- Test: `tests/setup/developmentImport.test.ts`, `tests/engine/development/resync.test.ts`

**Interfaces:**
- Produces: `ImportSection 'development'`; `UnitSetup.anchors?: string[]`; `UnitSetup.insight?: Insight`; `ResyncPatch.anchors?`, `.insight?`; `squad/resync` payload `resetDevelopment?: true`.

- [x] **Step 1: Write the failing tests**
  - `anchors are validated`: the raw `["value:ingroup", "value:greed", "bond:ownLimits", "value:ingroup", "like:x", "value:mercy", "value:autonomy"]` gives `['value:ingroup', 'like:x', 'value:mercy', 'value:autonomy']` (≤ 4, known, deduped).
  - `insight defaults to mid`.
  - `a build without anchors writes no development` (setup golden unchanged).
  - `re-sync keeps development`: a unit with drift and facts re-synced on `values` keeps `development` intact while `values` change.
  - `reset development` deletes it.
  - `the prompt names no disabled category` (the section text does not include a disabled category's label).
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** the files, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P14b): anchors and insight at import; re-sync keeps development`

**Chunk (a) ends here.** Stop and report.

---

## Chunk (b): the review and moments

### Task 9: Review validation and the `development/review` action

**Files:**
- Create: `src/engine/development/review.ts`
- Modify: `src/engine/actions/development.ts` (`development/review`)
- Test: `tests/engine/development/review.test.ts`

**Interfaces:**
- Produces:
  - `type ReviewShift = { axis: string; direction: 'up' | 'down'; size: 'nudge' | 'step'; reason: string }`;
  - `type ReviewValue = { shifts: ReviewShift[]; facts: Array<{ text: string; kind: DevFact['kind'] }> }`;
  - `reviewDue(state, reg): string | null` (unit id);
  - `eligibleAxes(state, reg, unit): Array<{ axis, direction: 'up' | 'down', support: 'weak' | 'strong' }>`;
  - `validateReview(state, reg, unitId, v: ReviewValue): { shifts: ReviewShift[]; facts: ReviewValue['facts']; dropped: Array<{ axis, why }> }`;
  - `fallbackReview(state, reg, unitId): ReviewValue`;
  - `applyReview(draft, reg, unitId, v, source): EngineEvent[]` (validates again);
  - `undoReview(draft, unitId): boolean`;
  - `interface ReviewInverse { drift; bond; gained; lost; acc; factIds; momentIds; lastReview?; pending: Appraisal[] }`;
  - Action `development/review { unitId, review, source, replace?: true }`: `replace` runs `undoReview` first and refuses (`"She has already shown it."`) when `reviewCommitted(state, unitId)` is non-null;
  - `reviewCommitted(state, unitId): string | null`.

- [x] **Step 1: Write the failing tests**
  - `due`: 3 pending and day 8 with `lastReview` absent → her id; 2 pending → null; `acc` 5 on day 3 with 3 pending → due; mode off → null; slow cadence 14.
  - Validation drops (Review Focus 3), one test each:
    - a step on an anchored value with acc 3.5 (needs 4.5);
    - a shift against `sign(acc)`;
    - `bond:ownLimits`;
    - a held axis;
    - a grunt;
    - a nudge on `bond:desire`;
    - a value at its cap;
    - a `like:` tag of a disabled category;
    - more than 3 shifts (the first 3 kept).
  - `a nudge moves drift and consumes acc`: acc 1.5, nudge → drift 0.34, acc 0.5; anchored → 0.17.
  - `three nudges make a moment`: drift 0.68 + nudge → `trunc` changes → a `DevMoment` with `from '1'`, `to '2'` and `development_moment`.
  - `a discrete step`: acc `bond:desire` 3 → `development.bond.desire` moves one place up, and a moment is written.
  - `gaining a like removes it from dislikes`.
  - `facts are capped at 12, oldest unedited out`.
  - `fallback nudges only`: acc on two value axes and one bond axis → two nudges, no facts, no step.
  - `undo restores exactly`: deep-equal of the unit before and after apply + `undoReview`.
  - `replace is refused after a scene stamped the moment`.
  - `draws nothing`.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement** per the rulings ("Review" and "Moments").
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P14b): review validation and application, with undo`

---

### Task 10: The `development_review` call type and its site

**Files:**
- Create: `src/llm/calls/developmentReview.ts`
- Modify:
  - `src/llm/callTypes.ts`: `'development_review'` in `CALL_TYPE_IDS`;
  - `src/llm/calls/all.ts`: import it;
  - `src/settings.ts`: budget default 700 (mechanic);
  - `src/llm/sites.ts`: `declare('development.review', 'development_review', 'world', 'before_commit', 'quiet', 'Character development')`;
  - overview §5.2 row (in Task 17).
- Test: `tests/llm/developmentReview.test.ts` (recorded fixtures: valid, truncated, invalid, hostile)

**Interfaces:**
- Produces:
  - `interface DevelopmentReviewInput { unitId; name; card; profile: { values; likes; dislikes; tastes: string[]; bond?: Partial<Bond> }; anchors: string[]; axes: ReturnType<typeof eligibleAxes>; experiences: string[]; facts: string[]; categories: Array<{ id; label }> }`;
  - `sanitizeReview(raw: unknown, input: DevelopmentReviewInput): ReviewValue | null`;
  - `readReview` (the call type's `read`).

- [x] **Step 1: Write the failing tests**
  - `valid fixture parses` to 2 shifts and 1 fact.
  - `sanitize cuts and drops`: a reason of 300 → 120; a text of 400 → 140; an axis not in `input.axes` and a kind `secret` are dropped; markdown and labels stripped; 5 shifts → 3.
  - `neither array → null`; `{ shifts: [] , facts: [] }` → a valid empty review.
  - `hostile text stays text` (an instruction inside `reason` survives as plain text and changes no field).
  - `the system prompt names only enabled categories, has no number for support and no pronoun for the commander`.
  - `site registry`: `tests/llm/siteRegistry.test.ts` passes (the call type has a site).
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement.** The system prompt (`AUTHOR TO WRITE` tone lines) says:
  - change is slow and must fit her card and anchors;
  - an axis may be moved only along the listed direction;
  - `step` only when support is `strong`;
  - facts are one sentence in her voice or a narrator's;
  - reply JSON only.
- [x] **Step 4: Run** the file and `tests/llm/`, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P14b): development_review call type and site`

---

### Task 11: Moments in scenes and the development controller

**Files:**
- Create: `src/engine/development/moments.ts`, `src/development/controller.ts`, `src/development/deps.ts`
- Modify:
  - `src/engine/actions/scene.ts`: `scene/start` → `stampMoments(draft, participants, sceneId)`; `scene/end` → `showMoments(draft, sceneId)`; `scene/abort` → `unstampMoments(draft, sceneId)`;
  - `src/app.ts`: `createDevelopment(deps)` wired like `createHeadStart` (`onSettled` after each dispatch; `onSceneOpened` / `onSceneClosed`); the chat-switch reset;
  - `src/scene/sceneController.ts`: calls `onSceneOpened` / `onSceneClosed` where head start's are called.
- Test: `tests/engine/development/moments.test.ts`, `tests/development/controller.test.ts`

**Interfaces:**
- Produces:
  - `stampMoments`, `showMoments`, `unstampMoments`;
  - `stampedMoments(state, unitId): DevMoment[]`;
  - `momentDirective(state, reg, unitId): Directive | null`;
  - `interface DevelopmentController { run(): Promise<void>; onSceneOpened(): void; onSceneClosed(): void; rerollState(unitId): RerollState; reroll(unitId): Promise<void>; idle(): Promise<void> }`;
  - The controller binds `development.review`. The key is the unit id. The handlers:
    - `build`: the input from the state, or `{ expired }` when not due and not a reroll;
    - `parse`: `sanitizeReview`;
    - `apply`: dispatch `development/review` with `expectChatId`;
    - `fallback`: dispatch `fallbackReview` with `source: 'fallback'`;
    - `committed`: `reviewCommitted`;
    - `undo`: implicit in `replace: true`.

- [x] **Step 1: Write the failing tests**
  - `stamp, show, abort`: a moment stamped at `scene/start` for a participant only; `scene/end` sets `shownDay`; `scene/abort` removes the stamp and leaves `shownDay` absent.
  - `the directive appears while the scene runs and is cleared after`: the text holds the axis `up` words; the pronoun test's checker (`tests/content/pronouns.test.ts` helper) passes on it.
  - `one review per run`: two units due → one `generate` call, the second on the next `run`.
  - `no profile → fallback applies, no record` (P14 `no_profile`).
  - `answer after a chat switch is dropped` (`expectChatId`).
  - `reroll refused after the scene`.
  - `failure records quiet`: a refused answer writes a `quiet` record; no chip is drawn on the hub (the hub draws `full` only).
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement.** The controller follows `src/headStart/controller.ts` (state is the truth, `asked` set per chat) and `memoryController.run` (one call per run, `inflight`, `idle`).
- [x] **Step 4: Run** the files, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P14b): quiet development moments and the review controller`

**Chunk (b) ends here.** Stop and report.

---

## Chunk (c): habits, the prompt and the player's view

### Task 12: Counters, habits and habit effects

**Files:**
- Create: `src/engine/development/habits.ts`
- Modify:
  - `src/engine/actions/development.ts`: the activity hook (counter, appraisal from Task 5, habit effect);
  - `src/engine/actions/scene.ts` (`scene/end`: `countCompanions`);
  - `src/engine/world/expedition.ts` (`endExpedition`: `countRun(party, regionId)`);
  - `src/llm/calls/flavor.ts` + `registerFlavorKind('habit', …)`;
  - `src/llm/sites.ts`: `declare('flavor.habit', 'flavor', 'day', 'free', 'none', 'Habit wording')`;
  - `src/settings.ts`: `habitWording: false`;
  - `src/development/controller.ts`: on `habit_formed`, when `habitWording` is on, one flavor call → `development/edit_fact { byModel: true }`.
- Test: `tests/engine/development/habits.test.ts`

**Interfaces:**
- Produces:
  - `countActivity(draft, reg, unitId, activityId)`;
  - `countCompanions(draft, reg, ids: string[])`;
  - `countRun(draft, reg, ids, regionId)`;
  - `checkHabits(draft, reg, unitId): EngineEvent[]` (forms each habit whose counter reached its threshold);
  - `habitEffect(state, reg, unitId, activityId): Array<{ type: 'unit_stress' | 'unit_xp'; amount: number }>`.

- [x] **Step 1: Write the failing tests**
  - `off counts nothing`.
  - `a habit forms at the threshold`: 8 `train` activities with ANN as companion → `drills_daily` in `habits`, a `DevFact` with the fallback text (`{name}` filled), `habit_formed`.
  - `grunts form habits but never appraise`.
  - `companion pairs`: 10 scenes with ANN and BEA → `close_with` for both, `{other}` filled.
  - `region`: 4 runs → `knows_region`.
  - `the effect applies on her shifts only`: with `drills_daily`, `train` with ANN gives +5 more XP than without; `train` with BEA unchanged.
  - `a habit tagged with a disabled category never forms`.
  - `no rng draw`.
  - `site registry passes` for the flavor kind.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P14b): counters, habits and habit effects`

---

### Task 13: The "since joining" block

**Files:**
- Create: `src/scene/developmentContext.ts`
- Modify: `src/app.ts` (register it beside `registerMemoryContext`)
- Test: `tests/scene/developmentContext.test.ts`

**Interfaces:**
- Produces: `registerDevelopmentContext(builder: ContextBuilder, deps: { registries(): Registries })`, which registers provider `since_joining`, `group: 'memory'`, priority 68 (after dossier, before journal).
  - It renders only in a scene. For each present named unit with development, one item:

    ```
    - {Name}: {up/down words of each shifted axis, ≤ 3} ; {top facts: newest 2, edited first}
    ```

    under the title `Since joining the unit:`. It is trimmed with `fitItems`.
  - A fact or moment that is not shown **is** included (behaviour first). Nothing about another unit's private development reaches a group scene beyond her own line: every line is about the present unit herself.

- [ ] **Step 1: Write the failing tests**
  - `renders shifted axes and facts in words, no numbers` (no digit in the output).
  - `out of a scene renders nothing`.
  - `stays inside the memory budget`: with `memoryTokens` 120 and four developed units, `ContextBuilder.build` keeps the whole block ≤ the share and trims line by line (acceptance 7).
  - `off or no development renders nothing`.
  - `no pronoun for the commander`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P14b): the since-joining block in the memory share`

---

### Task 14: The DEVELOPMENT view, HOLD and fact editing

**Files:**
- Create: `src/ui/development/developmentBlock.ts`, `css/80-development.css`
- Modify:
  - `src/engine/actions/development.ts`: `development/hold { unitId, axis, on }`, `development/edit_fact { unitId, factId, text, byModel? }`, `development/remove_fact { unitId, factId }`;
  - `src/ui/squad/squadTab.ts`: the block under the MEMORY view, for named units;
  - `src/ui/shell/sysTab.ts`: **Character development** select (`data-analyze="glossary:character_development"`) and **Habit wording** checkbox.
- Test: `tests/ui/development/developmentBlock.test.ts`, `tests/engine/development/control.test.ts`

**Interfaces:**
- Produces: `renderDevelopmentBlock(host, ctx: { state; registries; settings; unitId; dispatch; onChanged? })`.
  - Lines: each changed axis with `shownDay` (words, `data-analyze="development:<unitId>:<axis>"`), each shown fact (`data-analyze="glossary:development_fact"`) and each habit.
  - With the edit lock off: HOLD per axis line (`aria-pressed`), EDIT / REMOVE per fact. With it on, the controls are `aria-disabled` and analyzable.
  - Empty: `NOTHING YET.`

- [ ] **Step 1: Write the failing tests**
  - `shows only shown items`: an unshown moment and an unshown fact are absent; after `showMoments` they render.
  - `no number is rendered` with raw values off.
  - `HOLD toggles held` (dispatch payload), and a held axis then takes no push (engine test in `control.test.ts`).
  - `edit marks edited, byModel does not`; `edit_fact` text over 140 is cut; an unknown fact id throws.
  - `edit lock on disables the controls with aria-disabled`.
  - `the SYS select dispatches development/set_mode`.
  - `tests/ui/analyzeCoverage` passes (every new control carries `data-analyze`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** CSS uses the existing variables; no `url(` with a scheme.
- [ ] **Step 4: Run** the files, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P14b): the DEVELOPMENT view, HOLD and fact editing`

---

### Task 15: Analyze providers and hidden sentinels

**Files:**
- Create: `src/analysis/providers/development.ts`
- Modify:
  - `src/analysis/knowledge.ts`: `Knowledge.development(unitId): { axes: Array<{ axis; words }>; facts: DevFact[]; habits: string[] }`, shown items only;
  - `src/analysis/providers.ts` (`registerCoreProviders` calls `registerDevelopmentProviders`);
  - `tests/fixtures/analyze/hidden.ts`: sentinels: `acc` 4.37, an unshown moment reason `"SENTINEL-UNSHOWN-MOMENT"`, a pending appraisal summary `"SENTINEL-PENDING"`, a misread flag, `insight 'low'`.
- Test: `tests/analysis/development.test.ts` (and the existing `tests/analysis/hidden.test.ts` over every provider)

**Interfaces:**
- Produces:
  - providers `development:<unitId>:<axis>` (what changed, in words, and why: the moment's `reason` once shown);
  - `glossary:character_development` (the campaign mode and how many soldiers have changed);
  - `glossary:development_fact`, `glossary:habit`, `glossary:development_hold`.

  All of them go through `Knowledge.development`.

- [ ] **Step 1: Write the failing tests**
  - `the axis reading shows words and the reason once shown, nothing before`.
  - `hidden.test passes`: no sentinel number or text appears in any reading.
  - `the mode reading says "off" for an old save`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the files, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P14b): development readings through Knowledge`

---

### Task 16: Wizard and SYS defaults, old-save path, manual test

**Files:**
- Modify:
  - `src/ui/setup/` (the WORLD PARAMETERS step): a **CHARACTER DEVELOPMENT** select (`off / slow / normal`, default normal, `data-analyze`), feeding `SetupResult.characterDevelopment`;
  - `src/setup/wizard.ts`: `Wizard.setDevelopment(mode)`.
- Create: `docs/MANUAL_TEST_P14b.md` (in-ST checklist: a week with a caretaker witnessing punishments; the moment directive in the next scene; the dossier line after; REROLL refused after; HOLD; re-sync with and without reset; old save stays off until SYS).
- Test: `tests/ui/setup/developmentStep.test.ts`

- [ ] **Step 1: Write the failing tests**: the select defaults to `normal` and writes the field; `off` writes `'off'`; an old save opened in SYS shows `off`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P14b): development mode in the wizard; manual test`

---

### Task 17: Docs

**Files:**
- Modify:
  - `docs/packages/P14b-character-development.md`: status `implemented`, and an **Implemented as** with every ruling above, the open items, and the non-obvious things. The open items are: `scene_summary` appraisals; dilemma appraisal rows; taste rules; habits others notice as remembered events; P15 axes (practice attitudes, styles) added as axis kinds plus rows.
  - `docs/00-overview.md`: §9 row 24 `implemented`; §5.2 row `development_review`; §5.4 rows for every interface in the Interfaces blocks; the §5.4 heading gains P14b.
  - `docs/CONTENT.md`: how to add an axis, a rule and a habit.
  - **Interfaces already provided by P14b** notes in `P15-dynamic-core.md` and `P17e-living-dynamic.md` (the counters and `checkHabits`; axis kinds; `recordAppraisal` for practices).
  - `CLAUDE.md`: one P14b rule line, in the same style as the others. It says:
    - read the **Implemented as** before touching `src/engine/development/`, `src/development/`, `src/ui/development/`, `applyEventToUnit`'s appraisal hook or the profile readers;
    - absent setting = off and byte-identical;
    - no rng draw;
    - read profile fields through the effective readers (guard test);
    - rules by `match`/`by`, axes by `kind`, never by id;
    - quiet: no toast, record `quiet`;
    - keep directive ids `development:`-prefixed.
- [ ] **Step 1: Run** `npm test` → PASS (pronoun and content tests cover the docs-adjacent content).
- [ ] **Step 2: Commit** `docs(P14b): implemented as, overview, hand-offs, manual test`

**Chunk (c) ends here.** Stop and report.
