# P11 Prologue & Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new campaign starts on rails: meta setup (start, world, squad, calibration) → an in-world intake (cold open, intake interview, medical exam, personnel dossier signed to deploy) → a capped line-up scene and short "first words" with each soldier → a fixed three-node tutorial expedition → debrief and a guided first evening → free play, with PDA tabs unlocking progressively and an objective tracker giving direction afterwards. Repeat players can take the "Veteran intake" (the classic wizard) and skip the tutorial.

**Architecture:** The four fiction steps before deployment are **wizard steps** (in memory, like today's form): they drive the same `Wizard` methods, and `[SIGN]` is the old "Confirm deployment". Everything after deployment lives in campaign state (`onboarding`) and is moved forward by engine actions (`onboarding/*`) whose completion conditions the engine checks itself; a non-engine controller (`src/onboarding/`) starts the scenes, the tutorial run, the coach hints and the first DM, the same way P9's `src/discipline/` does. Content is data: registries `prologues` (a shared skeleton + one entry per start via `extends`) and `uiUnlocks`; the tutorial is a `missionTemplates` entry with a `fixedMap`. Objectives: only director hints are stored; prologue, spine and unit objectives are read from where they already live. Chunk (a) = Tasks 1–4. Chunk (b) = Tasks 5–10.

**Tech Stack:** TypeScript 5 (strict), esbuild, zod 3, vitest (+ jsdom for UI). No new dependencies.

**Spec:** `docs/00-overview.md` (§3 P10–P12, §5.4, §6, §9), `docs/packages/P11-prologue-onboarding.md`. Read as implemented (**Implemented as**): `P5-world-expeditions-director.md`, `P6-dilemmas-disloyalty-leash.md`, `P7-commander-profile-traits.md` (incl. **Non-obvious things to know**), `P8-world-options-disposition.md`, `P9-impunity-discipline.md`, `P10-visual-upgrade.md`. Read `docs/content/lore.md` every session (§0 pronoun rule).

**Baseline (2026-11-14, `df0b540`):** `npm test` → 243 files, 4212 tests, all green.

## Global Constraints

- English everywhere (overview P8). UI text through `h()` / `textContent`, never `innerHTML`.
- `src/engine/**` stays pure (architecture test). New engine code lives in `src/engine/onboarding/` and `src/engine/actions/onboarding.ts`; `app.ts` imports the actions module like the others.
- **Data, not ids** (overview P4): code reads steps by `kind` / `completion` / `fields`, unlocks by `target.tab`, the tutorial by `missionTemplates[].tutorial`. No code tests a prologue, step, start, region, location or template id. Exception: the six `fields` names (`crime`, `name`, `body`, `expression`, `seasoning`, `traits`) are a closed enum.
- **No pronoun for the commander** in any new text (prologues, unlock notices, glossary, directives, objectives, coach hints). Soldiers are "she". `tests/content/pronouns.test.ts` covers `prologues` and `uiUnlocks`.
- Overview P12: every new option, chip, stat and choice (intake crime cards, exam controls, dossier lines, onboarding card buttons, objective list rows, locked tab buttons) carries `data-analyze`; every new concept has a glossary entry. `tests/ui/analyzeCoverage.test.ts` and `tests/analysis/hidden.test.ts` stay green.
- Voices: forms and the dossier are `paper` (`VOICE_OF.intake_form`), unlock notices and coach hints `terminal`. Stamps play `sound.play('stamp')`. Typing/reveal effects are instant under `motionReduced(settings)`.
- Campaign state stays `version: 1`. New optional fields only: `onboarding?`, `objectives?`. **Absent `onboarding` = done** (old campaigns are unaffected: nothing locked, no prologue card).
- Placeholder prose (cold open, clerk/medic lines, scene goals, event briefs, coach hints, unlock notices) is written by the executor in Task 1, every string marked as a draft in `docs/content/prologue.md`; code never depends on the wording.
- `dist/index.js` and `style.css` are committed; `npm test` rebuilds them — check its exit code before committing. Commit messages end with the executing agent's `Co-Authored-By:` / `Claude-Session:` trailers.

## Where the plan rules on the spec (read before Task 1)

Rulings marked **user** were answered by the user on 2026-11-14. Task 10 copies them into the spec's **Implemented as**.

- **The intake happens before deployment.** Name, crime and the commander profile are inputs of `buildCampaign` (first impressions, `knows_crime`, disposition start all read them at build), so cold open, intake, exam and dossier are wizard steps; `[SIGN]` on the dossier deploys. Prologue mode wizard order: `dossier` (start only + the Veteran toggle) → `world` → `units` → `calibration` → `cold_open` → `intake` → `exam` → `file` (sign). Veteran mode is today's order unchanged (`dossier` with name/start/crime → `world` → `commander` → `units` → `calibration` → `review`). A start with no prologue forces veteran. During calibration in prologue mode the crime is not chosen yet, so `previewStart` returns `null` (no stance line) — accepted.
- **Pre- vs in-campaign steps by kind:** `paper_form` and `dossier` are wizard steps; `scene`, `expedition`, `guided_slot`, `free` are campaign steps. A valid prologue lists all wizard steps first, exactly one `dossier` as the last wizard step, and `free` last. `buildCampaign` writes `onboarding` with every wizard step in `completed` (prologue mode) or `skipped` (veteran), `stepId` = the first campaign step.
- **Skeleton by `extends`:** the loader's `deepMerge` replaces arrays and merges objects, so a prologue is `{ order: string[], steps: { [stepId]: Step } }` (not a step array). `prologue_skeleton` has no `startId` (never chosen); `prologue_vesper` / `prologue_kestrel` extend it and override per-step text and the tutorial region.
- **Line-up size (user):** the scene participant limit rises from 3 to **4 everywhere** (`TUNING.scene.maxParticipants = 4`). Call sites that slice participants to 3 (mess linger, debrief) use the constant.
- **New scene origin `prologue`** (`SceneOrigin`), always `consumesSlot: false`. Line-up = every living named unit; first words = one private scene per unit.
- **Exchange caps are soft (user):** at `exchangeCap` exchanges of a prologue scene the controller sets directive `prologue:wrap` (`expiresAfter: 'scene'`, text: `Bring this scene to a natural close within the next reply or two; do not open new topics.`) and shows once the modal `Move on?` · `[MOVE ON]` (ends the scene) / `Keep talking`. The step goal is directive `prologue:goal` (`expiresAfter: 'scene'`, text = the step's `directive`).
- **Tutorial expedition (user: safe):** template `tutorial_patrol` with `tutorial: true`, `dangerRange [1,1]`, a `fixedMap` of combat → event → objective, no deadline. Every combat of a run whose mission template is `tutorial` gets `allowRetry: true` regardless of `easyRetry`; stress and injuries still count. The region comes from the step (`regionId`: `quarantine_d7` for Vesper, `kestrel_corridor` for Kestrel). Tutorial templates are never offered by the director, the fallback or rumors (`checkOffer` refuses them). The event node's template has a `generate.brief` (the "authored directive"), so P6's generated dilemma and validator apply; `fixed` is the fallback.
- **Completion conditions** (closed enum, checked by the engine; `onboarding/complete_step` throws the reason when not met): `manual` (always holds), `no_open_scene` (`!state.scene`), `all_spoken` (every living named unit is in `onboarding.spoken`), `tutorial_returned` (no open expedition and `lastExpedition.missionId === onboarding.tutorialMissionId`), `debriefed` (that report is `debriefed`), `next_day` (`state.day > onboarding.stepDay`).
- **Auto-skips:** entering a `scene` or `expedition` step with no living named unit skips it; skipping the `expedition` step also skips a following step whose completion is `debriefed`. Skipped steps are listed in `skipped`. Entering `free` marks it completed and sets `done: true` (event `onboarding_done`).
- **Guided first evening:** entering the step after the debrief picks the **guide**: the living named unit with the highest Affinity (ties: higher Trust, then squad order), stored as `onboarding.guideUnitId`. The controller sends one initiated DM from her (`comms.initiate(unitId)`, the existing initiate path without the roll), the objective reads `{name} wants to talk.`, and if the step has `nightKnock` the engine enqueues a `NightEntry` for her (kind `visit`, priority 5, the step's framing and ignore event, `expiresDay` = day + 1). The step completes on `next_day`.
- **Unlocks:** registry `uiUnlocks` `{ id, target: { tab: TabId }, condition: { minDay?, afterStep? }, notice }`. A tab with **no** entry is always open (LOG, SYS). A tab is locked while `onboarding` exists, `!done`, and some entry for it fails (`minDay`: `state.day ≥ minDay`; `afterStep`: the step id is in `completed` or `skipped`). `done` unlocks everything. Locked tabs show `OFFLINE`, are `aria-disabled`, refuse `showTab` and the `1`–`8` keys; the room panel hides activity cards while `ops` is locked. On a dispatch that unlocks a tab the app shows a `terminal` toast with the entry's `notice`. Only `tab` targets ship; `hubRoom` / `feature` targets are an open item (no consumer). The analysis tool is never locked.
- **Objectives:** only director hints are stored (`objectives: [{ id, text, source: 'director', dueDay?, done }]`, open ≤ 1, done kept ≤ 10). `objectiveList(state, reg)` merges in order: the current prologue step's `objective` (source `prologue`), the proposed spine beat's `goal` (`spine`), the open director hint (`director`), then unit entries (`unit`: the guide's `{name} wants to talk.` during the guided step; each demand the hub's Tonight list shows as waiting for an answer). `currentObjective` returns the first, else the old mission pick (kept as fallback so old saves look the same); its signature stays, `Objective` gains `source` and `missionId` becomes optional.
- **`objectiveHint`** on the director answer: `{ text, dueDays? }`, text plain ≤ 100 chars and ≤ 16 words, `dueDays` int 1–14; rejected while the prologue is not done; applied as the single open director objective (the previous one is marked done).
- **Coach hints:** the tutorial step lists `hints: [{ id, screen: 'combat' | 'expedition', glossaryId, text }]`; while the tutorial run is open, unseen hints for the current screen are drawn as a dismissible `terminal` strip at the top of that screen (`[GOT IT]` → `onboarding/hint_seen`), each with `data-analyze="glossary:<glossaryId>"` and the line `Focus anything and press ? for more.`

## File Structure

| Path | Responsibility |
|---|---|
| `content/core/prologues.json`, `uiUnlocks.json` (+ manifest) | Skeleton + two starts; default unlock rows |
| `content/core/missionTemplates.json`, `dilemmaTemplates.json`, `glossary.json` | `tutorial_patrol`, `evt_tutorial_choice`, new glossary entries |
| `docs/content/prologue.md` | Author drafts of every prologue string (marked DRAFT) |
| `src/content/schemas.ts`, `types.ts`, `refs.ts` | `PrologueSchema`, `UiUnlockSchema`, `MissionTemplateSchema.{tutorial,fixedMap}`, cross refs |
| `src/engine/onboarding/{prologue,state,objectives}.ts`, `index.ts` | Pure readers: steps, completion, guide, unlocks, objective list |
| `src/engine/actions/onboarding.ts` | `onboarding/*` actions |
| `src/engine/state/types.ts`, `setup.ts`, `tuning.ts`, `actions/scene.ts`, `world/{nodeMap,expedition,missions,director}.ts` | State fields, build, participant cap, fixed map, tutorial guard, `objectiveHint` |
| `src/setup/wizard.ts` | Prologue mode, new steps, `SetupResult.onboarding` |
| `src/ui/setup/prologueSteps.ts`, `setupScreen.ts` | Cold open, intake, exam, file/sign |
| `src/onboarding/controller.ts` | Line-up, first words, caps, tutorial launch, coach, guide DM, unlock notices |
| `src/ui/onboarding/{card,coach}.ts`, `src/ui/hub/{hubScreen,model}.ts`, `src/ui/shell/{tabs,shell,keys}.ts`, `src/ui/ops/opsTab.ts` | Hub prologue card, coach strip, locked tabs, objective list |
| `src/llm/calls/directorTick.ts` | Prompt + shape for `objectiveHint` |
| `css/19-onboarding.css` | Paper forms, stamps, coach strip, locked tabs |

## Review Focus

1. **Reload or chat switch mid-prologue** (line-up scene open, tutorial run open, guided evening) → the hub card shows the current step's actions again, the scene resumes through the existing resume path, and a `complete_step` for a step that is no longer current is refused (`Stale onboarding step.`) without changing state. Tests: Task 2 (`stale step id is refused`), Task 6 (`card after reload shows resume for an open prologue scene`).
2. **The player wanders off the rails** (ends slots, sleeps to day 3 before the line-up or the tutorial) → nothing dead-ends: scene steps use their location if it is open this slot, else the first location open now (registry order); the tutorial mission has no deadline and stays launchable or skippable from the card; BASE/INV unlock on day 2 by date alone. Tests: Task 6 (`line-up at night falls back to an open location`), Task 7 (`tutorial still offered on day 3`).
3. **A soldier dies, deserts or is confined during the prologue** → `all_spoken` and the guide pick count only living named units; a confined unit's first-words button shows the restriction reason and SKIP still works; a squad of zero named units skips every scene/expedition step. Tests: Task 2 (`all_spoken ignores dead units`, `empty squad skips scene and tutorial steps`), Task 6 (`confined unit offers only skip`).
4. **Content without a prologue for the chosen start, or an invalid `prologues` file** → the wizard forces veteran, the campaign has no `onboarding`, nothing is locked, the objective falls back to missions. Tests: Task 3 (`start without prologue forces veteran`), Task 8 (`no onboarding locks nothing`).
5. **Old campaigns** (no `onboarding`, no `objectives`) → load unchanged, all tabs open, no prologue card, `currentObjective` returns exactly what P10 returned (plus `source: 'mission'`), a director `objectiveHint` applies. Tests: Task 8 (`old save locks nothing`), Task 9 (`old save objective unchanged`).

---

## Chunk (a): content, state, intake

### Task 1: Prologue and unlock content

**Files:**
- Modify: `src/content/types.ts` (add `'prologues', 'uiUnlocks'` under `// P11`), `src/content/schemas.ts`, `src/content/refs.ts`, `content/core/manifest.json`, `content/core/missionTemplates.json`, `content/core/dilemmaTemplates.json`, `content/core/glossary.json`, `tests/content/pronouns.test.ts`
- Create: `content/core/prologues.json`, `content/core/uiUnlocks.json`, `docs/content/prologue.md`
- Test: `tests/content/prologueSchemas.test.ts`, `tests/content/core.test.ts` (extend)

**Interfaces:**
- Produces: `PROLOGUE_FIELDS = ['crime','name','body','expression','seasoning','traits'] as const`; `STEP_KINDS = ['paper_form','scene','expedition','dossier','guided_slot','free'] as const`; `COMPLETIONS = ['manual','no_open_scene','all_spoken','tutorial_returned','debriefed','next_day'] as const`; `WIZARD_KINDS = ['paper_form','dossier']`; `PrologueStepSchema`, `PrologueSchema`, `UiUnlockSchema`; types `PrologueStep`, `Prologue` (`z.infer`). Step fields: `kind, voice ('terminal'|'corporate'|'paper'|'personal'), title?: str≤60, authoredText?: str≤400[] ≤8, lines?: Record<str, str≤200>, directive?: str≤400, fields?: PrologueField[], expeditionId?, regionId?, locationId?, exchangeCap?: int 1–12, perUnit?: boolean, objective?: str≤100, hints?: {id, screen: 'combat'|'expedition', glossaryId, text: str≤200}[] ≤4, nightKnock?: { framing: str≤200, ignore: { event, severity } }, completion, skippable: boolean`. Prologue: `{ id, startId?, order: str[] (≥2), steps: Record<str, Step> }`. `MissionTemplateSchema` gains `tutorial?: true`, `fixedMap?: { layers: Array<Array<{ type: str; eventId?: str }>> }` (1–4 layers, 1–3 nodes each).

- [x] **Step 1: Write the failing tests**

`prologueSchemas.test.ts` (build a minimal valid prologue in the test and mutate it):
- `valid skeleton parses`;
- `order id missing from steps is rejected` (message contains `order`);
- `wizard step after a campaign step is rejected`; `two dossiers rejected`; `free not last rejected`;
- `a field listed twice is rejected` and, for an entry with `startId`, `every field once` (missing `traits` → issue on `steps`);
- `scene step needs locationId and exchangeCap`; `expedition step needs expeditionId and regionId`; `paper_form completion must be manual`; `perUnit scene completion must be all_spoken`;
- `fixedMap rejects a layer of 4 nodes` and `tutorial template needs fixedMap`;
- `uiUnlock needs minDay or afterStep` and `target.tab must be a TabId`.
`core.test.ts`: `core prologues: both starts have one, built from prologue_skeleton` (each `starts` id appears as exactly one `startId`; both raw entries have `extends: 'prologue_skeleton'`); `core uiUnlocks: squad,comms day 1; ops,map after tutorial; base,inv day 2; no entry for log or sys`; refs: `unknown expeditionId / locationId / regionId / glossaryId / startId / afterStep reported` (loader errors name the path).
`pronouns.test.ts`: add `prologues` (every string under `steps`) and `uiUnlocks.notice` to the scanned fields.

- [x] **Step 2: Run** `npx vitest run tests/content` → FAIL (schemas and files missing).

- [x] **Step 3: Implement schemas, refs and content**

Schemas per Interfaces, with the `superRefine` rules the tests name (`afterStep` is checked by refs against the step ids of every prologue). Refs: `startId → starts`, `expeditionId → missionTemplates`, `regionId → regions`, `locationId → locations`, `hints[].glossaryId → glossary`, `nightKnock.ignore.event → eventDeltas` types (same check the night specs use), `fixedMap` node `type → nodeTypes` (kind not `objective`), `eventId → dilemmaTemplates` with context `expedition_event`.
`prologues.json`: `prologue_skeleton` with `order` `cold_open, intake, exam, dossier, lineup, first_words, tutorial, debrief, first_evening, free`; kinds/completions: `cold_open` paper_form/manual (no fields), `intake` paper_form/manual fields `[crime,name]`, `exam` paper_form/manual fields `[body,expression,seasoning,traits]`, `dossier` dossier/manual, `lineup` scene/no_open_scene `locationId: garage`, `exchangeCap: 6`, skippable, `first_words` scene `perUnit`/all_spoken `locationId: quarters_unit`, `exchangeCap: 3`, skippable, `tutorial` expedition/tutorial_returned `expeditionId: tutorial_patrol`, 3 hints (rows → glossary for rows, CP orders, stress; use existing glossary ids, add missing ones), skippable, `debrief` guided_slot/debriefed, skippable, `first_evening` guided_slot/next_day with `nightKnock`, skippable, `free` free/manual. Wizard steps are not skippable (veteran mode replaces them). `lines` keys used by Task 4: intake `ask_crime`, `ask_name`, `confirm_owner` (`{CORPORATION}` placeholder); exam `intro`, `dictate` (`{FIELD}: {VALUE}. Write it down.` style, placeholders `{FIELD}` `{VALUE}`), `traits_note`; dossier `sign_prompt`. `prologue_vesper` / `prologue_kestrel`: `extends` the skeleton, own `startId`, `steps.tutorial.regionId` (`quarantine_d7` / `kestrel_corridor`), and their own `cold_open.authoredText`, `intake.lines`, `lineup.directive` (the scene goal), `objective` texts.
`missionTemplates.json`: `tutorial_patrol` (`tutorial: true`, `sources: ['command']`, `regions` both tutorial regions, `dangerRange [1,1]`, `tiers ['tier_1']`, `objectives [{ node: 'obj', condition: 'reach' }]`, `failureEffects []`, `fixedMap { layers: [[{type:'combat'}],[{type:'event', eventId:'evt_tutorial_choice'}]] }`, one title, one brief). `dilemmaTemplates.json`: `evt_tutorial_choice` (minor, `expedition_event`, `generate.brief`, `fixed` with 2 costed options, one with a `routeCheck` that has a non-body route).
`uiUnlocks.json`: `squad`/`comms` `minDay: 1`; `ops`/`map` `afterStep: 'tutorial'`; `base`/`inv` `minDay: 2`; notices `MODULE ONLINE: {TAB}` style per row.
Glossary: `prologue`, `intake_interview`, `medical_exam`, `personnel_dossier`, `veteran_intake`, `lineup`, `first_words`, `tutorial_expedition`, `module_offline`, `coach_hint`, plus any missing combat ids the hints name; update `objective` to describe the sources.
`docs/content/prologue.md`: every string above, per start, headed `DRAFT — author will rewrite`; JSON mirrors it.

- [x] **Step 4: Run** `npx vitest run tests/content` → PASS; `npm test` → green.

- [x] **Step 5: Commit** `feat(content): prologues, uiUnlocks and the tutorial patrol`

---

### Task 2: Onboarding state and actions

**Files:**
- Create: `src/engine/onboarding/prologue.ts`, `src/engine/onboarding/state.ts`, `src/engine/onboarding/index.ts`, `src/engine/actions/onboarding.ts`
- Modify: `src/engine/state/types.ts` (`OnboardingState`, `CampaignState.onboarding?`), `src/engine/setup.ts` (`SetupResult.onboarding?`, `buildCampaign`, `validateSetup`), `src/app.ts` (import the actions module), `tests/helpers/world.ts` (optional `onboarding` in `campaign()` opts)
- Test: `tests/engine/onboarding/state.test.ts`, `tests/engine/onboarding/actions.test.ts`

**Interfaces:**
- Consumes: Task 1 types; `nextId`, `isLiving`, `enqueueNight` (later tasks), `registerAction`.
- Produces:
  - `interface OnboardingState { prologueId: string; stepId: string; stepDay: number; completed: string[]; skipped: string[]; done: boolean; spoken?: string[]; hintsSeen?: string[]; guideUnitId?: string; tutorialMissionId?: string }`
  - `SetupResult.onboarding?: { prologueId: string; veteran: boolean }`
  - `prologueFor(reg, startId): Entry | null` (the entry whose `startId` matches); `stepsOf(entry): Array<PrologueStep & { id: string }>` (in `order`); `isWizardStep(step): boolean`
  - `onboardingDone(state): boolean` (absent → true); `currentStep(state, reg): (PrologueStep & { id }) | null`; `completionReason(state, reg, step): string | null`; `initialOnboarding(reg, prologueId, opts: { veteran: boolean; day: number }): OnboardingState`
  - `advance(draft, ctx): EngineEvent[]` (internal: moves to the next step, applies auto-skips, entry effects; Tasks 7 and 8 add entry effects through `registerStepEntry(kind, fn)`)
  - actions `onboarding/complete_step { stepId }`, `onboarding/skip_step { stepId }`, `onboarding/mark_spoken { unitId }`, `onboarding/hint_seen { hintId }`; events `onboarding_step_completed { stepId }`, `onboarding_step_skipped { stepId }`, `onboarding_step_started { stepId }`, `onboarding_done`, `onboarding_spoken { unitId }`.

- [x] **Step 1: Write the failing tests**

`state.test.ts` (core content via `loadCore`):
- `buildCampaign without onboarding writes none and onboardingDone is true` (old saves and every existing test);
- `prologue mode: wizard steps completed, stepId lineup, stepDay 1`; `veteran mode: wizard steps skipped`;
- `validateSetup rejects an unknown prologueId and one whose startId differs`;
- `completionReason`: `no_open_scene` with a scene open → `'A scene is still open.'`; `all_spoken ignores dead units` (two units, one `dead`, the other spoken → `null`); `tutorial_returned` false while `expedition` is open; `next_day` false on `stepDay`, true the day after.
`actions.test.ts` (`run`, `errors` helpers):
- `complete_step advances to the next step and emits started`;
- `stale step id is refused` (`/Stale onboarding step/`, state unchanged);
- `complete_step refuses an unmet condition with its reason`;
- `skip_step refuses a non-skippable step`; `skipping the expedition step also skips the debriefed step`;
- `empty squad skips scene and tutorial steps` (campaign with 0 units: after build `stepId` is `first_evening` and `lineup`, `first_words`, `tutorial`, `debrief` are in `skipped`);
- `entering free sets done and emits onboarding_done`;
- `mark_spoken rejects a grunt, a dead unit and a repeat`; `hint_seen is idempotent`;
- `every onboarding action is refused once done` (`/prologue is over/`).

- [x] **Step 2: Run** `npx vitest run tests/engine/onboarding` → FAIL.

- [x] **Step 3: Implement** the readers and actions per Interfaces and the rulings ("Completion conditions", "Auto-skips"). `buildCampaign` writes `onboarding` only when `r.onboarding` is given. `advance` skips forward in a loop (auto-skip rules), sets `stepDay = draft.day`, and on `free` pushes it to `completed` and sets `done`.

- [x] **Step 4: Run** `npx vitest run tests/engine` → PASS; `npm test` → green.

- [x] **Step 5: Commit** `feat(engine): onboarding state, steps and actions`

---

### Task 3: Wizard prologue mode

**Files:**
- Modify: `src/setup/wizard.ts`
- Test: `tests/setup/wizard.test.ts` (extend), `tests/setup/wizardPrologue.test.ts`

**Interfaces:**
- Consumes: `prologueFor`, `stepsOf`, `isWizardStep` (Task 2).
- Produces: `WizardStep` adds `'cold_open' | 'intake' | 'exam' | 'file'`; `WizardState.mode: 'prologue' | 'veteran'`; `Wizard.setMode(mode)` (prologue refused when `prologueFor(reg, startId)` is null); `Wizard.stepsFor(): WizardStep[]`; `Wizard.prologueStep(): (PrologueStep & { id }) | null` (the prologue step behind the current fiction step); `result()` includes `onboarding: { prologueId, veteran }` whenever the start has a prologue.

- [x] **Step 1: Write the failing tests**

`wizardPrologue.test.ts`:
- `default mode is prologue when the start has one` and `start without prologue forces veteran` (registries copy with `prologues` emptied; `setMode('prologue')` changes nothing);
- `prologue order`: `stepsFor()` equals `['dossier','world','units','calibration','cold_open','intake','exam','file']`; veteran equals today's six;
- `dossier in prologue mode needs only the start` (`canAdvance().ok` with no name and no crime);
- `intake needs name and crime` (reasons `Enter the commander's name.` / `Choose the commander's crime.` as today);
- `exam uses validateCommanderSetup` (an over-spent pool cannot be set; `canAdvance` follows the validator);
- `file canAdvance equals the old review` and `result().onboarding` is `{ prologueId: 'prologue_vesper', veteran: false }`;
- `veteran result: onboarding.veteran true`;
- `back from cold_open returns to calibration (or units when there are none)`;
- `switching mode on the dossier keeps every entered field`.
Existing `wizard.test.ts` tests run in veteran mode: set `setMode('veteran')` where they assume the old order.

- [x] **Step 2: Run** `npx vitest run tests/setup` → FAIL.

- [x] **Step 3: Implement.** `next()`/`back()` walk `stepsFor()`; the import kick-off that today happens on leaving `units` stays there; the commander-prefill token bump that happens on leaving `commander` also happens on leaving `exam`. `canAdvance` for `intake` checks name + crime, for `exam` the commander validator, for `cold_open` always ok, for `file` the old `review` rule.

- [x] **Step 4: Run** `npx vitest run tests/setup` → PASS; `npm test` → green.

- [x] **Step 5: Commit** `feat(setup): prologue mode in the wizard`

---

### Task 4: Paper forms: cold open, intake, exam, dossier

**Files:**
- Create: `src/ui/setup/prologueSteps.ts`, `css/19-onboarding.css`
- Modify: `src/ui/setup/setupScreen.ts` (step bodies, step list from `wizard.stepsFor()`, Veteran toggle on the dossier, `[SIGN]` on `file`), `src/app.ts` (pass `sound` and `settings` into `SetupScreenCtx`)
- Test: `tests/ui/setupPrologue.test.ts`, `tests/ui/analyzeCoverage.test.ts` (add the four screens)

**Interfaces:**
- Consumes: `renderVoiceCard`, `renderCommanderFile`, `descriptor`, `analyzeNative`, `motionReduced`, `Sound.play('stamp')`, Wizard (Task 3).
- Produces: `renderColdOpen(host, ctx)`, `renderIntake(host, ctx)`, `renderExam(host, ctx)`, `renderFile(host, ctx)` with `ctx: { wizard: Wizard; registries: Registries; settings: AliusSettings; sound?: Sound }`; `fillLine(template: string, vars: Record<string, string>): string` (replaces `{KEY}`; unknown keys stay); `SetupScreenCtx` gains `settings: () => AliusSettings` and `sound?: Sound`.

- [x] **Step 1: Write the failing tests** (jsdom, core content, a Wizard in prologue mode)
- `cold open shows every authoredText line in a paper card` (`article.alius-voice-paper`, lines in order) and `lines appear at once under reduced motion`;
- `intake: crime cards drive setCrime` (click → `wizard.state.crimeId`), `name input drives setCommanderName`, `the owner line names the start's corporation` (`fillLine` of `confirm_owner`);
- `exam: a body change shows the dictate line with the descriptor` (e.g. strength 1 → text contains `descriptor('strength', 1)`), `trait toggles go through toggleTrait`, `persona prefill button calls prefillFromPersona`;
- `file: shows the review lines and a SIGN button disabled until canAdvance`; `SIGN calls onConfirm once, plays stamp and shows the FILED stamp`; `edit links jump back to intake and exam`;
- `dossier step: the Veteran toggle switches mode and the step list`;
- coverage: every `.alius-option` / `.alius-chip` / `.alius-stat` in the four screens resolves (`markedWithout`, `unresolved` helpers).

- [x] **Step 2: Run** `npx vitest run tests/ui/setupPrologue.test.ts` → FAIL.

- [x] **Step 3: Implement.** Each screen is a `paper` `VoiceCard` (title from `step.title`, clerk/medic lines as dim lines above the fields); intake reuses the dossier's crime cards (same `card()` helper, move it to a shared export) and name input; exam = medic `intro`, one dictate line per body stat/expression/seasoning (live from the wizard state), then `renderCommanderFile` wired exactly as `commanderStep()` with `traits_note` above it; file = `review()`'s lines (extract `reviewLines(wizard, reg): string[]` from `setupScreen.ts`), the `sign_prompt`, target radios, `[SIGN]` (→ the existing confirm path, stamp `FILED`, `play('stamp')`). Typing reveal of the cold open at 60 chars/s unless `motionReduced`.

- [x] **Step 4: Run** `npx vitest run tests/ui` → PASS; `npm test` → green.

- [x] **Step 5: Commit** `feat(ui): in-world intake forms and the signed dossier`

**Chunk (a) ends here.**

---

## Chunk (b): scenes, tutorial, evening, unlocks, objectives

### Task 5: Four-participant scenes and the prologue origin

**Files:**
- Modify: `src/engine/tuning.ts` (`scene.maxParticipants: 4`), `src/engine/actions/scene.ts`, `src/engine/state/types.ts` (`SceneOrigin` adds `'prologue'`), `src/app.ts` (mess linger slice), `src/world/expeditionController.ts` (debrief slice, if any), `tests/engine/scene.test.ts`
- Test: `tests/engine/scene.test.ts`

**Interfaces:**
- Produces: `scene/start` accepts 1–`TUNING.scene.maxParticipants` participants and origin `prologue` (error text `A scene has 1 to 4 participants.`); a `prologue` scene never consumes a slot (`consumesSlot` forced false).

- [x] **Step 1: Write the failing tests:** `four participants are accepted`; `five are refused /1 to 4/` (replaces the old `/1 to 3/` case); `prologue origin starts with consumesSlot false even if asked true`; `ending a prologue scene keeps the slot`.
- [x] **Step 2: Run** `npx vitest run tests/engine/scene.test.ts` → FAIL.
- [x] **Step 3: Implement**; grep `slice(0, 3)` at participant call sites and use the constant.
- [x] **Step 4: Run** `npm test` → green.
- [x] **Step 5: Commit** `feat(scene): four participants and the prologue origin`

---

### Task 6: Line-up, first words and the hub prologue card

**Files:**
- Create: `src/onboarding/controller.ts`, `src/onboarding/deps.ts`, `src/ui/onboarding/card.ts`
- Modify: `src/app.ts` (create `app.onboarding`, call `onEvents` in `followUps`, `onSceneClosed` with the others), `src/ui/hub/hubScreen.ts` (`HubCtx.onboardingCard?: (host: HTMLElement) => void`, drawn above the objective)
- Test: `tests/onboarding/controller.test.ts`, `tests/ui/onboardingCard.test.ts`

**Interfaces:**
- Consumes: `currentStep`, `completionReason`, actions (Task 2); `startScene`, `context.setDirective/clearDirective`, `shell.modal`, `restrictionReason`.
- Produces: `createOnboarding(deps): OnboardingController` with `startLineup(): Promise<boolean>`, `talkFirstWords(unitId): Promise<boolean>`, `skipFirstWords(unitId): void`, `skipStep(): Promise<void>` (confirm modal), `onEvents(events): void`, `onSceneClosed(): void`; `sceneLocation(state, reg, step): string` (the step's location if open this slot, else the first location open now); `renderOnboardingCard(host, ctx: { state, registries, controller, readOnly })`; directive ids `prologue:goal`, `prologue:wrap`.

- [x] **Step 1: Write the failing tests**

Controller (worldHarness-style app with the fake adapter):
- `startLineup starts a prologue scene with every living named unit at the step location and sets prologue:goal`;
- `line-up at night falls back to an open location`;
- `at exchangeCap the wrap directive is set and Move on? is asked once`; `MOVE ON ends the scene`; `Keep talking leaves it open and does not ask again`;
- `closing the line-up scene completes the step` (stepId becomes `first_words`, `prologue:*` directives cleared);
- `first words: scene with one unit; on close mark_spoken; after the last unit the step completes`;
- `confined unit offers only skip` (button disabled with the restriction reason);
- `skipStep asks, then dispatches skip_step`.
Card:
- shows the step `title` and `objective`; line-up → `[BEGIN LINE-UP]` + `[SKIP]`; first words → one row per unit `[TALK]`/`[SKIP]`, spoken ones ticked;
- `card after reload shows resume for an open prologue scene` (`[RESUME SCENE]` → `app.scene.resume()` + scene screen);
- nothing is drawn when `onboardingDone`; buttons carry `data-analyze` (`glossary:lineup`, `glossary:first_words`).

- [x] **Step 2: Run** `npx vitest run tests/onboarding tests/ui/onboardingCard.test.ts` → FAIL.
- [x] **Step 3: Implement.** Cap check in `onEvents` on `scene_exchange` when `state.scene.origin === 'prologue'` and `exchanges >= step.exchangeCap`; the controller remembers per scene id that it asked. Completion dispatches go through `app.dispatch` with `expectChatId`.
- [x] **Step 4: Run** `npm test` → green.
- [x] **Step 5: Commit** `feat(onboarding): line-up and first words with soft caps`

---

### Task 7: Tutorial expedition

**Files:**
- Modify: `src/engine/world/types.ts` (`MapNode.eventId?`), `src/engine/world/nodeMap.ts` (`buildFixedMap`), `src/engine/world/expedition.ts` (fixed map at start, pinned event in `enterEvent`), `src/engine/world/missions.ts` (`checkOffer` refuses tutorial templates), `src/engine/onboarding/state.ts` (entry effect of `expedition` steps), `src/app.ts` (`startCombat` retry rule; coach on combat/expedition screens), `src/onboarding/controller.ts`, `src/ui/onboarding/card.ts`
- Create: `src/ui/onboarding/coach.ts`
- Test: `tests/engine/world/fixedMap.test.ts`, `tests/engine/onboarding/tutorial.test.ts`, `tests/ui/coach.test.ts`, `tests/onboarding/tutorial.test.ts`

**Interfaces:**
- Produces: `buildFixedMap(layers: Array<Array<{ type: string; eventId?: string }>>): NodeMap` (ids `n{l}_{i}`, every node links to every node of the next layer, last layer → `obj`, objective node as `generateNodeMap` makes it); `isTutorialRun(state, reg): boolean`; entering an `expedition` step offers the mission with `buildMission(…, { templateId: step.expeditionId, regionId: step.regionId, source: 'command' })`, deletes its `deadlineDay`, pushes it to `missions.offered` without the board check, stores `onboarding.tutorialMissionId`; skipping the step removes that mission from `offered` (if not started); `coachHints(state, reg, screen: 'combat' | 'expedition'): Hint[]`; `renderCoach(host, hints, onSeen(hintId))`; controller `launchTutorial()` (→ `app.expedition.plan({ missionId })`).

- [x] **Step 1: Write the failing tests**
- fixedMap: `buildFixedMap gives combat → event → obj with eventId on the event node`; `a run of tutorial_patrol uses the fixed map (no rng draw for the map)`; `the event node opens evt_tutorial_choice`;
- tutorial: `entering the tutorial step offers tutorial_patrol in the step region with no deadline`; `checkOffer refuses a tutorial template` (director output with `tutorial_patrol` → rejected, nothing offered); `skip_step removes the offered tutorial mission`; `tutorial still offered on day 3`; `returning completes nothing until complete_step; then tutorial_returned holds`;
- app/controller: `combats of a tutorial run allow retry with easyRetry off`; `a non-tutorial combat still follows the setting`; `card shows [LAUNCH TUTORIAL] and [SKIP]`; `the expedition return completes the step`;
- coach: `unseen hints of the screen render with data-analyze glossary ids`; `GOT IT dispatches hint_seen and the hint disappears`; `no coach outside the tutorial run`.
- [x] **Step 2: Run** the four files → FAIL.
- [x] **Step 3: Implement.** The controller completes the step on `expedition_ended` (any outcome: success, retreat or failure — a lost or abandoned tutorial never blocks the prologue) once `completionReason` is null.
- [x] **Step 4: Run** `npm test` → green.
- [x] **Step 5: Commit** `feat(onboarding): fixed tutorial expedition with coach hints`

---

### Task 8: Debrief, first evening and progressive unlocks

**Files:**
- Modify: `src/engine/onboarding/state.ts` (`guideUnit`, entry effects of guided steps, `lockedTabs`), `src/scene/comms.ts` (`initiate(unitId)`), `src/onboarding/controller.ts`, `src/ui/onboarding/card.ts`, `src/ui/shell/tabs.ts` (`setLocked`), `src/ui/shell/shell.ts` (`ShellApi.setTabLocked(id, locked)`, `showTab` refuses locked), `src/ui/shell/keys.ts` (digits skip locked tabs), `src/ui/hub/roomPanel.ts` (no activity cards while `ops` is locked), `src/app.ts` (apply locks on every refresh, unlock notices)
- Test: `tests/engine/onboarding/evening.test.ts`, `tests/engine/onboarding/unlocks.test.ts`, `tests/ui/shellLocks.test.ts`, `tests/onboarding/evening.test.ts`

**Interfaces:**
- Produces: `guideUnit(state): string | null`; `lockedTabs(state, reg): Set<TabId>` (engine-side it takes `string` tab ids: the engine must not import `TabId`; the UI narrows); `unlockedBetween(before, after, reg): Entry[]` (the `uiUnlocks` entries whose tab went from locked to open); `Comms.initiate(unitId): Promise<void>`; `ShellApi.setTabLocked(id: TabId, locked: boolean): void`.

- [x] **Step 1: Write the failing tests**
- evening: `debrief step completes only after the tutorial report is debriefed`; `entering first_evening picks the guide by Affinity, then Trust, then squad order`; `with nightKnock the guide's visit is queued with the authored framing`; `next_day completes first_evening and free sets done`;
- unlocks: `prologue day 1: squad, comms open; ops, map, base, inv locked`; `skipping or finishing the tutorial opens ops and map`; `day 2 opens base and inv`; `done opens all`; `old save locks nothing`; `no onboarding locks nothing`; `unlockedBetween lists ops and map after the tutorial`;
- UI: `a locked tab reads OFFLINE, is aria-disabled and showTab does nothing`; `digit key on a locked tab does nothing`; `room panel hides activities while ops is locked`; `an unlock shows a terminal toast with the notice`;
- controller: `entering first_evening sends one initiated DM from the guide` (fake DM generator called once with `'initiate'`); `the card shows {name} wants to talk with [TALK] → app.talkAt`.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement.** `comms.initiate` is the body of the existing initiative loop for one unit, without the roll (no-op when `unitDms` is off). The debrief card button calls `app.expedition.debrief(party)`; the controller completes `debrief` on `expedition/mark_debriefed` success and `first_evening` on `day_started`.
- [x] **Step 4: Run** `npm test` → green.
- [x] **Step 5: Commit** `feat(onboarding): guided first evening and progressive unlocks`

---

### Task 9: Objective tracker and the director's hint

**Files:**
- Create: `src/engine/onboarding/objectives.ts`
- Modify: `src/engine/state/types.ts` (`StoredObjective`, `CampaignState.objectives?`), `src/engine/world/director.ts` (`DirectorOutput.objectiveHint?`, validate, apply), `src/llm/calls/directorTick.ts` (shape + prompt line), `src/ui/hub/model.ts` (`currentObjective` body, `Objective` type), `src/ui/ops/opsTab.ts` (OBJECTIVES list), `tests/ui/hubModel.test.ts` (add `source: 'mission'` to the four expectations)
- Test: `tests/engine/onboarding/objectives.test.ts`, `tests/engine/world/directorHint.test.ts`, `tests/ui/hubModel.test.ts`, `tests/ui/ops.test.ts`, `tests/llm/directorTick.test.ts`

**Interfaces:**
- Produces: `type ObjectiveSource = 'prologue' | 'spine' | 'director' | 'unit'`; `interface StoredObjective { id: string; text: string; source: 'director'; dueDay?: number; done: boolean }`; `interface ObjectiveView { id: string; text: string; source: ObjectiveSource; dueDays: number | null }`; `objectiveList(state, reg): ObjectiveView[]`; `Objective = { text: string; dueDays: number | null; source: ObjectiveSource | 'mission'; missionId?: string }`; `DirectorOutput.objectiveHint?: { text: string; dueDays?: number }`.

- [x] **Step 1: Write the failing tests**
- list: `prologue step objective first`; `then the proposed spine beat goal`; `then the open director hint with dueDays`; `then the guide wants to talk and waiting demands`; `old save objective unchanged` (no onboarding/objectives → `currentObjective` = P10's result + `source: 'mission'`);
- director: `a valid hint becomes the open director objective and the previous one is done`; `text over 16 words, empty text or dueDays 0 are rejected (listed in rejected)`; `a hint during the prologue is rejected`; `done objectives are kept at most 10`; `fallbackOutput has no hint`;
- llm: `directorTick shape keeps objectiveHint` and `the prompt mentions objectiveHint once`;
- OPS: `OBJECTIVES lists every entry with a source label and data-analyze glossary:objective`; hub card unchanged for a mission fallback.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement.** Extract the hub's "waiting for an answer" demand predicate from `tonightItems` into a shared function and use it in both places. Prompt line: `objectiveHint (optional): { "text": the single most useful next thing for the commander, imperative, at most 12 words, no numbers; "dueDays"?: 1-14 }.`
- [x] **Step 4: Run** `npm test` → green.
- [x] **Step 5: Commit** `feat(objectives): objective tracker and the director's hint`

---

### Task 10: Docs and manual checklist

**Files:**
- Modify: `docs/packages/P11-prologue-onboarding.md` (status line + **Implemented as**: the rulings above, open items, non-obvious things), `docs/00-overview.md` (§5.4 rows for P11 interfaces, §6 `onboarding`/`objectives` no longer "planned", §9 status `implemented`), `docs/ROADMAP-next.md` (P11 done), `docs/CONTENT.md` (how to write a prologue and unlock rows), `docs/packages/P13-leashswap-mode.md` (**Interfaces already provided by P11**), this plan (ticks)
- Create: `docs/MANUAL_TEST_P11.md`

- [ ] **Step 1:** Write `MANUAL_TEST_P11.md`: new campaign in prologue mode for each start end to end (acceptance 1, 6); veteran + tutorial skip compared field by field with a prologue run (acceptance 2); caps and directives visible in the prompt inspector (acceptance 3); tab unlock notices day 1/after tutorial/day 2 and an old campaign untouched (acceptance 4); objectives during and after the prologue incl. a director hint (acceptance 5); reload mid line-up and mid tutorial.
- [ ] **Step 2:** Update the docs listed above. Open items: `hubRoom`/`feature` unlock targets; author prose for both starts; a "replay prologue" option.
- [ ] **Step 3: Run** `npm test` → green (pronoun and coverage tests included).
- [ ] **Step 4: Commit** `docs: P11 implemented-as, overview, content guide and manual checklist`
