# P11 — Prologue & Onboarding

**Status: implemented** (plan: `docs/plans/2026-11-14-p11-prologue-onboarding.md`; see **Implemented as** at the end; where it differs from the draft, the code wins). **Depends on:** P7 (commander profile), P8 (world options), P10 (voices, hub). **Read:** overview; this file; `content/lore.md`.

## Goal

The first 5–15 minutes put the player on rails: character creation happens **inside the world** (intake, medical exam, dossier), the squad is met in person, a short scripted expedition teaches combat and choices, and the PDA unlocks gradually. Afterwards an objective tracker keeps a soft direction.

## 1. Flow

1. **Meta setup (outside fiction):** start/corporation, world options (P8 screen), unit card selection and profile calibration (P1 wizard). Rationale: these are player-level choices; turning them into fiction gains nothing.
2. **Cold open** (`paper` + scene): transport, restraints, the sentence read aloud. Authored text.
3. **Intake interview** (`paper` form + clerk lines): "Article?" → crime; "Name for the record?" → commander name; corporate owner is confirmed (from step 1). Choices fill the same fields as the old wizard.
4. **Medical examination** (`paper` form): the medic dictates descriptors — body stats (pool), expression, seasoning — with live lines like "Build: slight. Write it down." Traits appear as "notes in the file" (choose up to 2 + optional rule trait).
5. **Personnel dossier review** (`paper`): the full commander file with stamps; editable before signing (`[SIGN]`).
6. **Arrival & line-up** (group scene, all imported units): first impressions (P7 presence, tastes). Scene goal directive; capped at ~6 exchanges, then the guide offers to move on.
7. **First words** (one short private exchange per unit, cap 2–3 exchanges each, skippable per unit).
8. **Tutorial expedition**: authored fixed node map (3–4 nodes): one combat with tooltips (rows, CP orders, stress), one event with a mini-dilemma (P6 validator applies), objective node. Text for events is generated from authored directives.
9. **Debrief & first evening**: after-action report, one guided free slot ("someone wants to talk"), first DM from a unit, optional night knock.
10. **Free play** with progressive unlocks.

Every step has `[SKIP]` for repeat players: "Veteran intake" collapses 2–5 into the classic wizard (same fields), and the tutorial expedition can be skipped (the line-up scene stays).

## 2. Data

Registry `prologues` (one per start; shared skeleton allowed via `extends`):

```
{ id, startId, steps: [{
    id, kind: 'paper_form'|'scene'|'expedition'|'dossier'|'guided_slot'|'free',
    voice, authoredText?: string[], directive?: string,
    fields?: ('crime'|'name'|'body'|'expression'|'seasoning'|'traits')[],
    expeditionId?, exchangeCap?, completion: Condition, skippable: boolean }] }
```

Campaign state: `onboarding { prologueId, stepId, completed: string[], skipped: string[], done: boolean }`. Migration: existing campaigns get `done: true`.

## 3. Progressive unlocks

Registry `uiUnlocks`: `{ tab | hubRoom | feature, condition, notice }`. Default: day 1 → SQUAD, COMMS; after tutorial → OPS, MAP; day 2 → BASE, INV; LOG always. Unlocks show a diegetic notice ("MODULE ONLINE: BASE") in the `terminal` voice.

## 4. Objective tracker

Campaign `objectives: [{ id, text, source: 'prologue'|'spine'|'director'|'unit', dueDay?, done }]`, top 1 shown on the hub (P10), the rest in OPS. Prologue steps set objectives; afterwards the director (extend P5 output with `objectiveHint`, ≤ 1 per tick) and spine beats feed it; unit requests (P9 demands, "wants to talk") appear as secondary entries.

## 5. Author content

`content/prologue/<startId>.md` → JSON: cold-open text, clerk and medic lines, dossier template, line-up scene goal, tutorial event directives. Two starts in v1; shared skeleton, different details.

## Acceptance criteria

1. A new campaign runs meta setup → cold open → intake → exam → dossier → line-up → first words → tutorial → debrief → free play; every field matches what the old wizard produced.
2. "Veteran intake" and tutorial skip work; resulting state is equivalent.
3. Exchange caps and scene-goal directives apply in line-up and first-words scenes.
4. Tabs unlock on their conditions with notices; existing campaigns are unaffected.
5. Objective tracker shows prologue objectives, then director/spine hints after the prologue.
6. Both starts have their own prologue built from a shared skeleton.

## Interfaces already provided by P7a (implemented — use, do not rebuild)

- Paper forms, the dossier and the objective tracker are built from marked elements (`analyzeAttrs`); `uiUnlocks` must not hide the analysis tool, which is the player's manual. Prologue concepts (intake, exam, objectives) get glossary entries. The tutorial can point at `?` ("focus anything and press ?"; the footer hint already says `? analyze`).

## Interfaces already provided by P7 (implemented — use, do not rebuild)

- **Creation fields exist:** `CommanderSetup` (body, expression, seasoning, traits), `validateCommanderSetup`, `buildCampaign` (optional `commander`), `commander_import` and `importCommander`, `renderCommanderFile` (temporary wizard step `commander`, a plain function). A diegetic intake should drive the same `Wizard` methods (`setBody`, `setExpression`, `setSeasoning`, `toggleTrait`, `prefillFromPersona`, `randomCommander`).
- **Old campaigns** have `commander.fileReviewed` (false until the review modal is answered); new ones start `true`. `onboarding` should migrate to `done: true` the same way.

## Interfaces already provided by P8 (implemented — use, do not rebuild)

- **The world screen exists:** `renderWorldParams(host, { wizard, registries })` (a plain function over the `Wizard`; the step is `world`, between the dossier and the commander file). A diegetic intake should drive the same `Wizard` methods: `applyPreset(id)`, `setWorldOption(optionId, choiceId)`, `worldSummary()`. The screen is a meta screen (plain labels, no fiction voice) and must stay outside the fiction (see §1).
- **Reads of the world:** `worldChoice(state, reg, optionId)`, `worldEffects`, `familyEnabled`; `dispositionFor` for a unit's level. `world.options` is written by `buildCampaign` from `SetupResult.world`; an old campaign reads every default.
- **Calibration** now carries the offset and stance rows (`renderCalibration` with `world`); a world change after calibration marks units `worldStale` and `Wizard.refreshWorldSections(i)` re-imports them. The importer receives the wizard's world: `importer(avatar, sections, world)`.
- **Dispositions in the opening scenes:** the lore line of each choice is in the context from the first reply (provider `world_settings`); a stance `directive` with `whileEarly` shows while the unit is still sizing the commander up, so a first-words scene needs no extra text.

## Interfaces already provided by P10 (implemented — use, do not rebuild)

- **The hub objective:** `currentObjective(state, reg)` in `src/ui/hub/model.ts` returns `{ text, dueDays, missionId } | null` and is a stub (active story mission, else the nearest deadline, else an offered story mission). Replace its body with the objective list and keep the signature; the hub card, its `glossary:objective` analysis and the `NO STANDING ORDERS` empty state already read it.
- **Voices:** `renderVoiceCard({ voice, title?, meta?, from?, body, accent?, stamp?, redact?, level? })`; `VOICE_OF.intake_form` is `'paper'` and already declared. Use `stamp` for `APPROVED`/`FILED` and `redact` ranges for redaction bars (the text behind a bar is not in the DOM). `corporate_mail` is `'corporate'` (title `{CORPORATION} · OVERSIGHT` style).
- **The hub and the device:** the shell opens on the hub (device down); `showScreen('hub')` returns home after a full-window screen, `showScreen('pda')`/`showTab(id)` raise the device. A prologue that needs the whole window registers a screen with `registerScreen` as the wizard does. `app.talkAt` and `app.endSlot` exist for the hub; the room panel reads rooms from the `hubRooms` registry.
- **Reduced motion and readable mode:** ask `motionReduced(settings)` / `visualFlags(settings)` (`src/ui/motion.ts`), never `matchMedia` directly. Typing and boot-like effects must be instant under reduced motion.
- **Sound:** `createSound` is created once by the app; call `play('stamp')` (or another `SoundId`) through it. New sounds are `uiSounds` entries for the eight ids only; a new id needs `SOUND_IDS`.

## Implemented as

**State** (`version` stays 1; both fields optional, **absent `onboarding` = done**, so an older save needs no migration and nothing in it is locked): `CampaignState.onboarding? { prologueId, stepId, stepDay, completed[], skipped[], done, spoken?[], hintsSeen?[], guideUnitId?, tutorialMissionId? }` and `objectives? [{ id, text, source: 'director', dueDay?, done }]` (only the director's hints are stored; the other sources are read from where they live).

**Engine** (pure, `src/engine/onboarding/`): `prologue.ts` (`prologueFor`, `stepsOf`, `isWizardStep`), `state.ts` (`onboardingDone`, `currentStep`, `completionReason`, `initialOnboarding`, `enterStep`, `registerStepEntry`, `livingNamed`), `tutorial.ts` (`isTutorialRun`, `coachHints`, `withdrawTutorial`; the `expedition` entry effect), `evening.ts` (`guideUnit`; the `guided_slot` entry effect), `unlocks.ts` (`lockedTabs`, `unlockedBetween`), `objectives.ts` (`objectiveList`; `waitingDemands` lives in `engine/hub.ts`). Actions `onboarding/{complete_step,skip_step,mark_spoken,hint_seen}` (`src/engine/actions/onboarding.ts`); events `onboarding_step_{started,completed,skipped}`, `onboarding_done`, `onboarding_spoken`, `objective_set`, `expedition_debriefed`. World: `buildFixedMap`, `MapNode.eventId`, `fixedMapEvents`; `DirectorOutput.objectiveHint`. `SetupResult.onboarding? { prologueId, veteran }`; `TUNING.scene.maxParticipants = 4`; `SceneOrigin 'prologue'`.

**Content:** registries `prologues` (`prologue_skeleton`, `prologue_vesper`, `prologue_kestrel` by `extends`; a prologue is `{ order[], steps{} }` so the loader's object merge works) and `uiUnlocks` (six rows); template `tutorial_patrol` (`tutorial: true`, `fixedMap`), dilemma `evt_tutorial_choice`; glossary `prologue`, `intake_interview`, `medical_exam`, `personnel_dossier`, `veteran_intake`, `lineup`, `first_words`, `tutorial_expedition`, `module_offline`, `coach_hint`, `rows` and a rewritten `objective`. Every string is a placeholder in `docs/content/prologue.md`.

**UI / app:** `src/setup/wizard.ts` (mode, `stepsFor`, `prologueStep`, `jumpTo`), `src/ui/setup/{prologueSteps,shared}.ts` and `setupScreen.ts`, `src/onboarding/{controller,deps}.ts` (`app.onboarding`), `src/ui/onboarding/{card,coach}.ts`, locked tabs in `src/ui/shell/{tabs,shell}.ts`, `Comms.initiate`, `css/19-onboarding.css`. Setting: none.

### What changed against the draft (rulings)
- **The intake happens before deployment.** Name, crime and the commander profile are inputs of `buildCampaign` (first impressions, `knows_crime`, the disposition start read them at build), so cold open, intake, exam and dossier are *wizard* steps (in memory); `[SIGN]` is the old Confirm deployment. Prologue wizard order: `dossier` (start + the Veteran toggle) → `world` → `units` → `calibration` → `cold_open` → `intake` → `exam` → `file`. Veteran mode is today's order. A start with no prologue forces veteran. Calibration in prologue mode has no crime, so `previewStart` is `null` there (no stance line).
- **Wizard vs campaign steps by kind:** `paper_form` and `dossier` are wizard steps, `scene`, `expedition`, `guided_slot` and `free` live in the campaign; `buildCampaign` writes every wizard step as `completed` (prologue) or `skipped` (veteran). The wizard finds the screen's step by `kind`/`fields`, never by id.
- **Line-up size (user):** the scene limit is 4 everywhere (`TUNING.scene.maxParticipants`: `scene/start`, the mess linger, the decision talk, the debrief picker). A `prologue`-origin scene never consumes a slot.
- **Soft exchange caps (user):** at `exchangeCap` the controller sets directive `prologue:wrap` and asks `Move on?` once (`MOVE ON` / `Keep talking`); the goal is directive `prologue:goal` (both `expiresAfter: 'scene'`). The cap never ends a scene by itself.
- **Tutorial is safe (user):** every combat of a tutorial run is retryable (`allowRetry` = easy-retry setting OR `isTutorialRun`); stress and injuries still count. The patrol has no deadline and bypasses the board size; a lost or abandoned run still completes the step.
- **Tutorial content stays out of ordinary play:** `checkOffer` refuses `tutorial` templates, the director digest omits them and `eventPool`/`eligibleTemplates` skip the events named by a `fixedMap`. (The plan put this in Task 7; it moved to Task 1 because adding the content without it leaked the patrol into old campaigns.)
- **Completion conditions** are a closed enum checked by the engine (`manual`, `no_open_scene`, `all_spoken`, `tutorial_returned`, `debriefed`, `next_day`); `complete_step` throws the reason when not met and refuses a stale step id (`Stale onboarding step.`). Entering a `scene` or `expedition` step with no living named unit skips it; skipping the expedition also skips the `debriefed` step.
- **Guided evening:** entering a `guided_slot` step that completes on `next_day` picks the guide (highest Affinity, ties Trust, then squad order) and, with a `nightKnock`, queues her visit (`visit`, priority 5, expires tomorrow). The controller has her send one initiated DM (`Comms.initiate`, no roll; after an open scene closes).
- **Unlocks:** INV opens with OPS and MAP (after the tutorial), BASE on day 2 — the workshop (an OPS activity) opens an INV session that lasts one day, so a locked INV would swallow the slot. A tab with no `uiUnlocks` row (LOG, SYS) is always open; a tab is locked while the prologue is not done and some row for it fails (`minDay`, `afterStep` = step in `completed` or `skipped`). Locked tabs read `OFFLINE`, are `aria-disabled` and refuse click, `showTab`, the digit keys and the arrow keys; the room panel drops its activity cards while OPS is locked; an unlock shows a terminal toast. Only `tab` targets ship.
- **Objectives:** `objectiveList` merges the prologue step, the proposed beat's goal, the open director lead and unit entries (the guide, open demands); `currentObjective` returns its first or the old mission pick (`source: 'mission'`).
- **`objectiveHint`:** plain text, at most 100 characters and 16 words (rejected, not cut), `dueDays` a whole number 1–14, rejected during the prologue and in scout answers; one lead open at a time, the newest ten finished ones kept.
- **Coach hints** come from the tutorial step's `hints`; `onboarding/hint_seen` is the only onboarding action `dispatch()` lets through while a combat or an expedition is open.
- **Plan defect fixed:** `tutorial_patrol` objectives are `{ node: 'cache', condition: 'reach' }`; `obj` is a map id, not a node type.
- **`currentObjective`** puts the mission fallback before unit entries (a waiting soldier never replaces a mission on the hub).
- **Added beyond the plan:** `Wizard.jumpTo`, `expedition_debriefed` (so the debrief step completes however the debrief was held), `Comms.initiate`, `OnboardingController.{onSceneOpened, resumeScene, launchTutorial, debriefTutorial, talkGuide}`, `ShellApi.setTabLocked`.

### Non-obvious things to know before touching P11 code
- **Data, not ids:** nothing tests a prologue, step, start, region, location or template id; steps are read by `kind`, `completion`, `fields`, `perUnit`, unlocks by `target.tab`, the tutorial by `missionTemplates[].tutorial`. Only the six `fields` names, the tab ids and the `SoundId`s are fixed.
- **One mover:** `enterStep(draft, ctx, index, afterSkippedExpedition)` is the only code that changes the current step (complete, skip and `buildCampaign` all call it). New step kinds hook in with `registerStepEntry(kind, fn)`.
- The controller completes a step only from an event of its own kind (`expedition_ended` only on an expedition step, `day_started` only on a `next_day` step, `scene_ended` only for the scene it was tracking), otherwise an ordinary scene or run during the prologue would complete the wrong step. `onSceneClosed` is the chat-switch clear (`adoptScene`); a normal close goes through `onEvents`.
- A prologue scene's directives (`prologue:goal`, `prologue:wrap`) are `scene`-scoped; keep other directive ids away from `prologue:`.
- Wizard tests that walk the classic order call `setMode('veteran')`; the default is the prologue.
- `style.css` and `dist/index.js` are rebuilt by `npm test`; commit them.

### Open items
- **Author prose** for both starts (every string is a placeholder), and the shared skeleton's neutral text.
- **`hubRoom` / `feature` unlock targets** (no consumer yet; only `tab`).
- A **"replay prologue"** option for a finished campaign.
- Typing sound for the cold open (`typing` is a `SoundId` but is not played there).
- Not yet run by hand in SillyTavern: see `docs/MANUAL_TEST_P11.md`.

