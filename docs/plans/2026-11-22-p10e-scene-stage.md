# P10e Scene Stage (Full Frame, Prose Subtitles, History Curtain, Posture Dial) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the scene screen becomes the commander's eyes. The backdrop and her knee-length sprite fill the 1920×1080 frame (the sprite shows at least 540 px). The last reply lies at the bottom as prose subtitles; the whole history comes down as a curtain. A posture dial in the corner shows the commander's body as a three-quarter mannequin. Cards gather in a dock at the left, chips in one row above the input, and Tab raises the PDA over the scene. No engine rule changes.

**Architecture:**
- **One new folder, `src/ui/scene/stage/`**, for the pieces of the new screen:
  - `prose.ts`: the reply text as runs;
  - `layers.ts`: the frame and its layers;
  - `look.ts`: looking around with the right mouse button;
  - `reply.ts`: the subtitle block;
  - `curtain.ts`: the history;
  - `topLine.ts`;
  - `chipRow.ts`;
  - `dock.ts`: her hand of cards;
  - `flash.ts`: a short line over the frame.
- **One new folder, `src/ui/scene/dial/`**, for the posture dial:
  - `points.ts`: point states, base defaults and the preset fixture types;
  - `mannequin.ts`: the 3D pose, two-bone limbs, the projection;
  - `draw.ts`: the SVG of a mannequin;
  - `dial.ts`: the dial and its fan.
- **`sceneScreen.ts` keeps its controller wiring** (every `ctx` handler, `drawX` function and the typing reveal). It loses its column: `build()` assembles the stage from the new modules, and each `drawX` writes into its new host. The draw functions of other packages (`drawTaskCards`, `renderMomentCard`, …) are not changed; they are given new hosts.
- **The shell** gains a device that can be raised over the scene (a second host for the existing device builder), hides its ASCII frame on the scene screen, and binds Tab there.
- **CSS:** a new `css/62-stage.css` holds the stage. `css/60-scene-comms.css` loses the rules for the column it no longer has; COMMS keeps its own rules. `css/61-blocking.css` keeps the strip (still used outside the scene by its tests) and gains the fan.
- **A browser layout test**, `npm run test:layout`: esbuild bundles a test entry that renders the scene screen with a fixture state; Playwright measures it at three sizes. It is not part of `npm test`.

**Tech Stack:** TypeScript 5 (strict), esbuild, vitest (+ jsdom for UI), Playwright (already installed in the environment; `require('playwright')`, no `playwright install`). No new dependencies in `package.json`.

**Spec:** `docs/packages/P10e-scene-stage.md` (§1–§14 and §12a; where §12a or the spike notes in §7 differ from an earlier section, they win). Read before Task 1:
- `docs/00-overview.md` §5.4;
- `docs/content/lore.md` §0;
- `docs/content/blocking.md` §7 (postures, points, presets);
- the **Implemented as** of P10, P10b, P10c (the plan `docs/plans/2026-11-20-p10c-scene-backdrops.md`), P15a, P15 and P16.

The approved mockups and the mannequin spike live outside the repo (the author has them). The spike's drawing rules are in spec §7.

## Global Constraints

- **Rendering only.** No engine file changes. No new action, event, directive, rng draw, state field or registry. The one engine-adjacent change is `ChatMessage.swipeCount?` in the ST adapter (Task 8).
- **Memory check (CLAUDE.md):** nothing is remembered. The package adds no event, decision or state the squad could remember. No `memoryRules` entry, no journal, chronicle or prompt text.
- **Everything still works:** every `SceneScreenCtx` handler keeps its behaviour. Every element the scene draws today is reachable in its new place (§12a.5's table is the test's list, Task 13).
- **P7a:** every chip, option, card, the dial and its fan carry `data-analyze` and resolve (`tests/ui/analyzeCoverage.test.ts`). New glossary ids: `posture_dial`, `scene_history`, `look_around`; each goes into `content/core/glossary.json` and `CORE_GLOSSARY_IDS`.
- **P10:** ask `motionReduced(settings)` / `visualFlags(settings)`, never `matchMedia`. `style.css` has no `url(` with a scheme and nothing loads from the network (`tests/assets.test.ts`). Fonts are the bundled Inter and IBM Plex Mono.
- **P10c:** art never gates anything. A missing sprite or backdrop falls back as today (the name plate; the ASCII stage), with no toast. The backdrop candidates and `slotLight` are read as today.
- **P15a:** the blocking dial is drawn only while `blockingLive(state, reg)`. Every option in the fan passes the same filter the strip used (`checkChange`, the vocabulary), and a refused one is `aria-disabled` with its reason. The stop word is always reachable while a physics runs.
- **P16:** the posture call's timer and the slap overlay keep their behaviour. `cancelPostureCalls` and `clearSlapOverlay` are still called on dispose.
- **No pronoun for the commander** in any new text. "YOU" labels the commander's messages.
- **Scene-keyed caches** (the look position, the dock's set-aside cards, the curtain's open flag) are reset on a new scene id **and** on chat switch. Scene ids repeat across campaigns (P11): `resetSceneStage()` is called from the app's chat-switch hook beside `practice.onChatChanged()`.
- **Keys:** Tab raises the device in the scene only from a place that is not a control and not while typing (the shell's existing rule). ↑ in an empty input and the wheel open the curtain. Keys 1–7 for joints are left to P16b (no handler here). Esc closes the curtain, then lowers the device.
- **Every animation** has a reduced-motion form with no easing and no highlight animation. Readable mode turns off blur and raises contrast (`#alius-shell.alius-readable`).
- `npm test` rebuilds `dist/index.js` and `style.css`; commit them with each task.

## Where the plan rules on the spec (read before Task 1)

- **R1. The held strip, the alarm card and the wake card stay where they are.** Spec §6 lists them in the dock, but the code has them elsewhere:
  - the held strip is a shell element (`deps.held`, `heldHost`) shown over every screen;
  - the alarm card and the wake card are modals (`shell.modal`).
  They keep working over the full frame unchanged. In the scene the held host gets the stage's glass look (Task 12) and sits over the top line's right half.
- **R2. The shell's ASCII frame is hidden on the scene screen** (titlebar, footer, the 12 px padding), so the frame is the whole viewport. Its two functions move to the top line: the close button (a small `×` calling `ShellApi.close()`) and the key hints (they hide after the first use, §5).
- **R3. Swipes show "n / m".** `ChatMessage` gains `swipeCount?: number`:
  - the real adapter reads `chat[i].swipes?.length`;
  - the fake keeps a count;
  - without a count the curtain shows only ‹ ›.
- **R4. The dial draws the 13 base postures from data.** A preset fixture of the spec's 47 presets lives in `tests/fixtures/dial/presets.ts` for the contact sheet; the registry gains nothing. The commander's posture comes from `blockingOf(scene, COMMANDER).posture`, a base id. The dial's point states are the base's defaults (`BASE_POINTS`) until P16b adds presets. The drift ghost is a drawing API (`target`, `actual`, `hot`) that nothing drives yet.
- **R5. The fan reuses the strip's model.** `blockingStrip.ts` is split into a pure `blockingChoices(state, reg): BlockingChoices` (rows, moves, the add-menu options with `why`) and the two renderers that read it: the strip, kept for its tests and any non-scene use, and the dial's fan.
- **R6. The physics panel goes into the dock as a card** until the mini-games session. Its stop word is also drawn in the chip row (`data-stop-word`) while a run is shown, so it is never collapsed away.
- **R7. Looking around replaces P10c's pointer pan:**
  - the right mouse button held on the frame and dragged sets `--alius-pan` (0…1); a double right-click recentres;
  - the context menu is suppressed only on the frame layer;
  - the value survives `refresh()` and resets on a new scene and on chat switch;
  - under reduced motion it still works, with no transition.

## Review Focus

- **A reply with marks the model left unbalanced** (`*She leans in. "Close`), or with nested and curly quotes: every character shows, nothing is eaten, nothing becomes markup. Task 1's tests pin it.
- **A very long reply while a physics runs:** the reply block caps at 8 lines and the stop word stays reachable in the chip row. Task 7 and Task 10 pin it.
- **A group scene with three women:** every reply since the commander's last message shows under its speaker's name, and no head sits under the dock. Task 7 and Task 13 pin it.
- **Tab while typing in the input, or with focus on a dock button:** Tab moves focus as usual and the device does not rise. With busy hands (`deviceLocked`) the device never rises and the flash shows instead. Task 11 pins it.
- **A chat switch with the curtain open and the frame panned:** the new chat's scene opens with the curtain closed, the view centred and no set-aside cards from the old one. Task 6 and Task 9 pin it.

---

## Chunk (a): the pure pieces

### Task 1: Prose runs (the reply as written)

**Files:**
- Create: `src/ui/scene/stage/prose.ts`
- Modify: `src/ui/scene/sceneScreen.ts` (replace `segments` / `fillText` / `visibleLength` with the new module's functions; the transcript keeps working as today until Task 7)
- Test: `tests/ui/stage/prose.test.ts`

**Interfaces:**
- Produces: `type ProseKind = 'prose' | 'speech' | 'em'`; `interface ProseRun { kind: ProseKind; text: string }`; `proseRuns(text: string): ProseRun[]`; `proseLength(text: string): number` (visible characters); `fillProse(el: HTMLElement, text: string, visible: number, opts?: { speechClass?: string; newestFrom?: number }): void`. Runs with `newestFrom ≤ index` get the class `alius-prose-new`.

- [x] **Step 1: Write the failing tests.**
  - `speech in straight and curly quotes`: `proseRuns('She nods. "Close it." Then: “Now.”')` → `[prose 'She nods. ', speech '"Close it."', prose ' Then: ', speech '“Now.”']`. The quote marks stay in the speech text.
  - `asterisks become em and lose the marks`: `proseRuns('*She stretches.* "Sit."')` → `[em 'She stretches.', prose ' ', speech '"Sit."']`.
  - `speech inside an em stays em`: `*she says "no"*` → one em run with the text `she says "no"`.
  - `unbalanced marks are text from the mark on`: `'She leans in. "Close'` → `[prose 'She leans in. ', prose '"Close']` (the joined text equals the input); `'*half'` → one prose run `'*half'`.
  - `literary prose`: `'She stretches. "Close the door," she says.'` → prose, speech `'"Close the door,"'`, prose `' she says.'`.
  - `proseLength` counts what shows (asterisks of a balanced pair excluded): `proseLength('*ab* "c"') === 6`.
  - `fillProse` with `visible` 3 shows the first 3 visible characters across runs. Speech gets `speechClass`, em is `<em>`. No `innerHTML` (a `<b>` in the text stays text).
- [x] **Step 2: Run** `npx vitest run tests/ui/stage/prose.test.ts` → FAIL (module missing).
- [x] **Step 3: Implement** `proseRuns` as one left-to-right scan:
  - a balanced `*…*` pair on one line is em;
  - a balanced quote pair (`"…"`, `“…”`) outside em is speech;
  - anything unmatched is prose.

  Then swap `sceneScreen.ts` to `fillProse` / `proseLength`. Today's `.alius-glitch` em class stays on em.
- [x] **Step 4: Run** the test, `npx vitest run tests/ui/scene.test.ts`, `npx tsc --noEmit`, `npm run build` → PASS.
- [x] **Step 5: Commit** `feat(P10e): prose runs for the reply`

### Task 2: The mannequin (point states, 3D pose, projection)

**Files:**
- Create: `src/ui/scene/dial/points.ts`, `src/ui/scene/dial/mannequin.ts`
- Create: `tests/fixtures/dial/presets.ts` (the 47 presets of `docs/content/blocking.md` §7.3 as `{ id, base, points }`, with the spike's mapping of each row's words to point states; a preset whose words name an item adds `item: 'tray' | 'lamp'`, one that names an anchor adds `hint: 'wall' | 'desk' | 'feet'`)
- Test: `tests/ui/dial/mannequin.test.ts`

**Interfaces:**
- Produces (`points.ts`):
  - `type Torso = 'upright' | 'forward' | 'arched' | 'level' | 'bent'`
  - `type Hips = 'raised' | 'on_heels' | 'to_floor'`
  - `type Knees = 'together' | 'apart'`
  - `type Arms = 'at_sides' | 'behind_back' | 'behind_head' | 'on_thighs_down' | 'on_thighs_up' | 'forward_palms_up' | 'out_sideways' | 'raised' | 'holding' | 'on_floor' | 'on_ankles' | 'under_knees' | 'bound' | 'crossed' | 'clasped_front' | 'paws' | 'tucked' | 'lamp' | 'desk_flat'`
  - `type Head = 'up' | 'bowed' | 'back' | 'to_floor'`
  - `type Gaze = 'down' | 'at_her' | 'straight' | 'closed'`
  - `type Feet = 'flat' | 'on_toes'`
  - `interface PointStates { torso?; hips?; knees?; arms?; head?; gaze?; feet? }`
  - `interface DialPose { base: string; points: PointStates; item?: 'tray' | 'lamp'; hint?: 'wall' | 'desk' | 'feet'; hogtie?: true }`
  - `BASE_POINTS: Record<string, PointStates>` (the 13 bases of `content/core/blockingPostures.json`, values as the spike's base row)
  - `poseOf(baseId: string): DialPose | null` (null for an unknown base)
- Produces (`mannequin.ts`):
  - `type Vec3 = [number, number, number]`
  - `interface Skeleton { pelvis, chest, neck, neckTop, head: Vec3; headDir, faceDir: Vec3; shoulder, elbow, hand, hip, knee, ankle, toe: { L: Vec3; R: Vec3 }; gazeDir: Vec3 | null }`
  - `pose(p: DialPose): Skeleton`
  - `project(v: Vec3): [x: number, y: number, depth: number]` (yaw 38°, elevation 14°, orthographic)
  - `LIMB: { upperArm: 0.3; forearm: 0.28; thigh: 0.45; shin: 0.44 }` (body units, the spike's proportions)

- [x] **Step 1: Write the failing tests.**
  - `every base and every fixture preset poses`: for the 13 bases and the 47 presets, every coordinate of `pose()` is finite.
  - `limbs keep their length`: for every pose, |shoulder→elbow| = `LIMB.upperArm` ± 2 %, elbow→hand = `forearm`, hip→knee = `thigh`, knee→ankle = `shin`. This is the two-bone solver; the spike let arms stretch.
  - `the head pivots at the top of the neck`:
    - for `head: 'back'`, the head centre is within 0.12 of `neckTop`;
    - its projected x is never behind the shoulders' projected midpoint by more than the head radius;
    - `faceDir` points up (y > 0.3).
  - `kneeling bases`:
    - `kneeling_upright` has the pelvis at y ≥ 0.45;
    - `kneeling_sitting` has it at y ≤ 0.3;
    - knees `apart` widens the knee x distance by ≥ 0.2.
  - `gaze`: `closed` → `gazeDir === null`; `down` points below `faceDir`.
  - `poseOf('nope') === null`; `poseOf('standing')` equals `{ base: 'standing', points: BASE_POINTS.standing }`.
- [x] **Step 2: Run** `npx vitest run tests/ui/dial/mannequin.test.ts` → FAIL.
- [x] **Step 3: Implement.**
  - Bases place the pelvis, the spine direction, the facing and the legs' end points, as the spike does.
  - Point states rotate the upper body (torso), move the pelvis (hips), spread the knees, raise the heels (feet), pitch the head about the neck top and set each arm's hand target.
  - A two-bone solver (law of cosines, bend direction outward and back for arms, forward for legs) places every elbow and knee from the fixed root, the target and `LIMB`. A target out of reach is clamped to full extension along the same direction.
- [x] **Step 4: Run** the test, `npx tsc --noEmit` → PASS.
- [x] **Step 5: Commit** `feat(P10e): the posture mannequin`

### Task 3: Drawing the mannequin and the contact sheet

**Files:**
- Create: `src/ui/scene/dial/draw.ts`, `scripts/dial-sheet.mjs`
- Modify: `package.json` (script `"dial:sheet": "node scripts/dial-sheet.mjs"`)
- Test: `tests/ui/dial/draw.test.ts`

**Interfaces:**
- Consumes: `pose`, `project`, `DialPose`.
- Produces:
  - `interface DialFigureOpts { target?: DialPose; hot?: Array<'shoulders' | 'elbows' | 'hips' | 'knees' | 'head' | 'gaze'>; size?: number }`
  - `mannequinSvg(p: DialPose, opts?: DialFigureOpts): SVGSVGElement` (viewBox `0 0 200 200`, built with `document.createElementNS`, no `innerHTML`)
  - CSS classes `alius-mq-out`, `alius-mq-fill`, `alius-mq-far`, `alius-mq-ghost`, `alius-mq-hot`, `alius-mq-gaze`, `alius-mq-floor`, `alius-mq-item`, `alius-mq-hint`

- [x] **Step 1: Write the failing tests** (jsdom).
  - `draws far to near`: the stroke `d` order sorts segments by projected depth. The near arm's outline comes after the far arm's.
  - `the head is drawn after its neck` and is an ellipse whose long axis follows `headDir`.
  - `the far side is marked`: the segments of the side with the smaller shoulder depth carry `alius-mq-far`.
  - `a ghost`: with `target`, a group `alius-mq-ghost` holds dashed strokes only (no fill strokes).
  - `hot joints`: `hot: ['knees']` draws exactly two `circle.alius-mq-hot`; no other joint circle exists.
  - `fits the dial`: the bounding box of the projected points, after the per-pose scale, lies inside a circle of radius 84 around (100, 102) for every base and fixture preset.
  - `items and hints`: `item: 'tray'` adds one `alius-mq-item` line between the hands; `hint: 'wall'` adds one `alius-mq-hint` line.
  - No `<text>` in the SVG.
- [x] **Step 2: Run** `npx vitest run tests/ui/dial/draw.test.ts` → FAIL.
- [x] **Step 3: Implement** the spike's drawing rules (spec §7):
  - segments as capsules: a light outline stroke under a dark fill stroke, with thicknesses torso 0.25, pelvis 0.22, neck 0.07, upper arm 0.085, forearm 0.07, thigh 0.125, shin 0.095, foot 0.07 (× scale);
  - depth sort far to near;
  - an egg head over its neck, with a face dot;
  - the floor parallelogram;
  - scale `min(96, 158 / max(w, h), 182 / hypot(w, h))`.

  `scripts/dial-sheet.mjs` bundles `draw.ts` and the fixture with esbuild into the scratch dir `.superpowers/dial-sheet/` (git-ignored), then writes `sheet.html`: 13 bases, 47 presets and five drift states, the spike's five: hips sink, arms drop, gaze rises, knees slide apart, torso slumps. If `require('playwright')` works it also writes `sheet.png` at deviceScaleFactor 2, and it prints the path.
- [x] **Step 4: Run** the test, then `npm run dial:sheet` → a sheet is written; open it and check every figure reads as its posture name.
- [x] **Step 5: Commit** `feat(P10e): the mannequin drawing and its contact sheet` (the sheet itself is not committed).

> **Review gate (author):** after Task 3 the controller sends the author the sheet (`sheet.png`) and waits for "looks right" before Chunk (c). Chunk (b) does not depend on it and may proceed.

---

## Chunk (b): the frame, the reply, the curtain

### Task 4: The frame and its layers; the shell frame hidden in the scene

**Files:**
- Create: `src/ui/scene/stage/layers.ts`, `css/62-stage.css`
- Modify: `src/ui/scene/sceneScreen.ts` (`build()` assembles the stage; `placeSprites` is removed; sprite sizing moves to CSS), `src/ui/shell/shell.ts` (`root.dataset.screen = router.current()` on every `renderView`), `css/10-shell.css` (`#alius-shell[data-screen="scene"]`: no padding, titlebar and footer hidden), `css/60-scene-comms.css` (remove the scene column rules this task replaces: `.alius-stage`, `.alius-scene` flex column, the P10c sprite tuck rules), `scripts/build.mjs` if the CSS list is explicit
- Test: `tests/ui/stage/layers.test.ts`, `tests/ui/sceneBackdrop.test.ts` (selectors updated, assertions unchanged)

**Interfaces:**
- Produces:
  - `interface StageLayers { root: HTMLElement; backdrop: HTMLElement; ascii: HTMLElement; frame: HTMLElement; pose: HTMLElement; sprites: HTMLElement; effects: HTMLElement; ui: HTMLElement; moment: HTMLElement; curtain: HTMLElement }`
  - `buildLayers(root: HTMLElement): StageLayers` (children of `root` in exactly that order, classes `alius-layer-<name>`)
  - `ui` holds the UI hosts: `topLine`, `status`, `reply`, `chipRow`, `input`, `dock`, `dial`
  - the root carries `data-stage="frame"`

- [x] **Step 1: Write the failing tests.**
  - `the layer order`: `buildLayers` yields the ten layers in order.
  - `the scene builds on layers`: `renderSceneScreen` with a scene gives the root `data-stage="frame"`, the sprites in `.alius-layer-sprites` and the backdrop in `.alius-layer-backdrop`. `.alius-stage` and `.alius-cmd` no longer exist. The P10c `data-backdrop` / `data-light` attributes are as before (the existing backdrop tests pass with updated selectors).
  - `one, two, three women`: the sprites carry `pos-center`; `pos-left pos-right`; `pos-left pos-center pos-right` (as today) and `is-speaking` on the last speaker.
  - `the shell marks the screen`: after `showScreen('scene')`, `#alius-shell` has `data-screen="scene"`.
- [x] **Step 2: Run** `npx vitest run tests/ui/stage/layers.test.ts tests/ui/sceneBackdrop.test.ts` → FAIL.
- [x] **Step 3: Implement.** CSS in `62-stage.css`:
  - every layer `position:absolute; inset:0`;
  - the backdrop `cover` with `background-position-x: calc(var(--alius-pan) * 100%)`;
  - one sprite `height: 110vh; top: 3vh`, centred; two or three at 92 vh, spaced so they overlap by at most a shoulder;
  - the speaker brightened, the others dimmed;
  - the light tint by `data-light` (day none, evening warm, night dark-blue `filter`);
  - the bottom gradient on `effects::after`.

  The `ui` layer has `pointer-events:none` and each host inside it `pointer-events:auto`, so the frame below gets the right mouse button.
- [x] **Step 4: Run** the tests, `npx vitest run tests/ui/scene.test.ts tests/ui/sceneOrder.test.ts`, `npx tsc --noEmit`, `npm run build` → PASS (update selectors only).
- [x] **Step 5: Commit** `feat(P10e): the scene as one full frame`

### Task 5: The top line and the input

**Files:**
- Create: `src/ui/scene/stage/topLine.ts`
- Modify: `src/ui/scene/sceneScreen.ts` (the header, the HUD and the CMD line move into the top line and the input host), `css/62-stage.css`, `content/core/glossary.json`, `src/analysis/providers/core.ts` (`CORE_GLOSSARY_IDS` + `look_around`, `scene_history`)
- Test: `tests/ui/stage/topLine.test.ts`

**Interfaces:**
- Consumes: `StageLayers.ui`.
- Produces:
  - `interface TopLineCtx { place: string; when: string; mode: 'PRIVATE' | 'GROUP'; units: HTMLElement[]; tools: HTMLElement[]; onHistory(): void; onEnd(): void; onClose(): void }`
  - `renderTopLine(host: HTMLElement, ctx: TopLineCtx): void`
  - the history button carries `data-action="history"` and `data-analyze="glossary:scene_history"`
  - the close button carries `data-action="close"`
  - the hints line `.alius-stage-hints` with two spans `data-hint="look"` / `data-hint="history"`; `markHintUsed(kind: 'look' | 'history'): void` hides one, kept in a module set reset by `resetSceneStage()`
- Produces: `resetSceneStage(): void` in `src/ui/scene/stage/index.ts`, which later tasks extend. The app calls it beside `practice.onChatChanged()` in `src/app.ts`.
- Produces (the gauge surface of spec §5, no reader yet): `interface InputGauge { narrow(f: number): void; tremble(level: 0 | 1 | 2 | 3): void; pulse(at: number | null): void; window(from: number, to: number): void; clear(): void }`; `inputGauge(host: HTMLElement): InputGauge` on the input host (CSS variables `--alius-gauge-narrow` 0…1, `--alius-gauge-pulse` 0…1, `--alius-gauge-from` / `--alius-gauge-to`, attribute `data-tremble`); `SceneScreen.gauge(): InputGauge | null`.

- [x] **Step 1: Write the failing tests.**
  - `the top line`:
    - the place, `DAY 020 · EVENING`, `PRIVATE`;
    - each unit's HUD tag (glyph, name, pulses, the REFUSED mark and COMPEL as today; `data-unit` kept);
    - ‹ ↻ › with their `data-action`s (`swipe-left`, `regenerate`, `swipe-right`), the P14 reroll tools, history, end, close.
  - `END ends`: `[data-action="end"]` calls `controller.end()`, then `onEnded`, as today.
  - `the input`:
    - one `input[name="cmd"]` in `.alius-stage-input`;
    - ORDER and PROPOSE inside it with the same behaviour (`tests/ui/sceneOrder.test.ts` passes unchanged except selectors);
    - Enter sends as today, and the busy lock (`lock(true)`) disables the same controls.
  - `hints`: both show at first; `markHintUsed('look')` hides only `look`; `resetSceneStage()` shows both again.
  - Coverage: the history button resolves `glossary:scene_history`; the hints resolve `glossary:look_around`.
  - `the gauge surface`: `narrow(0.4)` sets `--alius-gauge-narrow: 0.4` on the input host; `tremble(2)` sets `data-tremble="2"`; `pulse(0.3)` / `pulse(null)` set and remove `--alius-gauge-pulse`; `window(0.5, 0.6)` sets both bounds; `clear()` removes all of them; values are clamped to 0…1; under reduced motion the CSS draws no animation for `data-tremble` (a still offset).
- [x] **Step 2: Run** `npx vitest run tests/ui/stage/topLine.test.ts tests/ui/sceneOrder.test.ts` → FAIL.
- [x] **Step 3: Implement.** `onClose` is `ShellApi.close` passed by the app through a new optional `SceneScreenCtx.onClose`. Without it there is no × button.
- [x] **Step 4: Run** the tests, `npx vitest run tests/ui/scene.test.ts tests/ui/analyzeCoverage.test.ts tests/content/glossaryCore.test.ts`, tsc, build → PASS.
- [x] **Step 5: Commit** `feat(P10e): the top line and the input`

### Task 6: Looking around

**Files:**
- Create: `src/ui/scene/stage/look.ts`
- Modify: `src/ui/scene/sceneScreen.ts` (remove `attachPan`), `src/ui/scene/stage/index.ts` (`resetSceneStage` clears the look memory)
- Test: `tests/ui/stage/look.test.ts`

**Interfaces:**
- Produces: `attachLook(frame: HTMLElement, root: HTMLElement, opts: { sceneId: () => string; reduced: () => boolean; onUse?: () => void }): () => void` (detach). Module memory `Map<sceneId, number>`.

- [ ] **Step 1: Write the failing tests** (jsdom, pointer events dispatched by hand).
  - `the right button drags`: pointerdown with `button 2` at x 1000 (frame width 1920), move to x 808, then up → `--alius-pan` = 0.5 + 192/1920 = **0.6**. A left button changes nothing.
  - `the context menu is suppressed on the frame only`: `contextmenu` on the frame is `defaultPrevented`; on a dock button it is not.
  - `a double right-click recentres`: two right-button `pointerdown` within 300 ms → 0.5.
  - `clamped`: the pan stays within 0…1.
  - `remembered per scene`: a new `attachLook` for the same scene id starts at the stored value. A different id, or `resetSceneStage()`, starts at 0.5.
  - `reduced motion`: dragging still works, and the root has the class `alius-look-still` (no transition).
  - The pointer moving with no button changes nothing (the P10c follow is gone).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** the test and `tests/ui/sceneBackdrop.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(P10e): look around with the right mouse button`

### Task 7: The reply block

**Files:**
- Create: `src/ui/scene/stage/reply.ts`
- Modify: `src/ui/scene/sceneScreen.ts` (`drawLog` splits: the reply block shows the last replies, the curtain (Task 8) the whole transcript; the typing reveal now drives the reply block; `setBusy` and `drawBanner` write into the status line), `css/62-stage.css`
- Test: `tests/ui/stage/reply.test.ts`

**Interfaces:**
- Consumes: `fillProse`, `proseLength`.
- Produces:
  - `interface ReplyView { echo: string | null; replies: Array<{ index: number; name: string; avatar?: string; text: string }> }`
  - `replyView(messages: ChatMessage[]): ReplyView`: the replies since the last user message (at least the last reply), and the user's last message as the echo.
  - `renderReply(host: HTMLElement, view: ReplyView, opts: { maxLines: number; visibleOf(index: number): number; newestFrom(index: number): number | undefined; accentOf(reply: { name: string; avatar?: string }): string | null; flag?(line: HTMLElement, index: number): void; onMore(): void }): void`
  - `REPLY_MAX_LINES = 8`

- [ ] **Step 1: Write the failing tests.**
  - `the replies since the commander's last message`:
    - transcript `[u0, Ann1, Bea2]` → the replies Ann1 then Bea2, each under its name, with echo u0's text;
    - `[Ann0]` → Ann0, no echo;
    - `[]` → the empty-scene hint as today.
  - `the echo is one dim line`: `.alius-reply-echo` with the user's text. CSS clamps it to one line; the test checks the class.
  - `prose`: speech runs carry `alius-speech` and the speaker's accent as `--alius-accent` from `unitAccent`.
  - `the typing reveal`: with `typingSpeed > 0` the newest reply is revealed over time (fake timers). The revealed tail carries `alius-prose-new`, and the class is gone when the reveal ends. With `typingSpeed: 0` or reduced motion, everything shows at once and nothing carries the class.
  - `too long`: when the block's `scrollHeight` exceeds `maxLines × line-height`, the block gets `data-overflow="true"` and a `[data-more]` mark that calls `onMore` (stub the measurement in jsdom).
  - `the violation marker` (P9d) is drawn on a flagged reply as today.
  - `status line`: "AWAITING REPLY… Ns" with STOP while busy, and "TIME IS PASSING" while pacing, both in `.alius-stage-status`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/stage/reply.test.ts` → FAIL.
- [ ] **Step 3: Implement.** The accent comes from `unitAccent(unit)` (P10) on the unit whose `cardRef` matches the message's `avatar`, falling back to the name.
- [ ] **Step 4: Run** the test, `tests/ui/scene.test.ts`, `tests/ui/generationSurfaces.test.ts` (selectors only), tsc, build → PASS.
- [ ] **Step 5: Commit** `feat(P10e): the reply as prose subtitles`

### Task 8: The curtain

**Files:**
- Create: `src/ui/scene/stage/curtain.ts`
- Modify: `src/st/adapter.ts` (`ChatMessage.swipeCount?: number`), `src/st/real.ts` (fill it from `chat[i].swipes?.length`), `src/st/fake.ts` (keep and fill a count), `src/ui/scene/sceneScreen.ts` (the transcript, its edit form and the violation markers move into the curtain; the input moves into the curtain while it is open), `src/settings.ts` (`curtainWords: number`, default `0` = off; zod `z.number().int().min(0)`), `src/ui/shell/sysTab.ts` (SYS › Scene: "Open the history for replies longer than N words", 0 = never), `src/ui/scene/stage/index.ts` (`resetSceneStage` closes the curtain)
- Test: `tests/ui/stage/curtain.test.ts`, `tests/st/fake.test.ts` (swipe count)

**Interfaces:**
- Produces: `interface Curtain { open(): void; close(): void; isOpen(): boolean; draw(messages: ChatMessage[], ctx: CurtainDrawCtx): void; element: HTMLElement }`; `createCurtain(host: HTMLElement, opts: { onOpen(): void; onClose(): void }): Curtain`; `CurtainDrawCtx` holds `commanderName`, `pending`, `editing`, `onEdit(index)`, `onSave`, `onCancel`, `onSwipe(dir)`, `onRegenerate()`, `flagged(index)` and `accentOf(name)`.

- [ ] **Step 1: Write the failing tests.**
  - `opens and closes`:
    - `wheel` with `deltaY < 0` over the frame or the reply opens it;
    - ↑ (`ArrowUp`) in an **empty** input opens it, but not with text in the input;
    - the history button opens it;
    - Esc, the button, or a wheel down at the end of the scroll closes it.
  - `the whole transcript`:
    - every message, in order, under `ANN` or `YOU`;
    - prose rendering;
    - P3b hidden messages are absent (the transcript the controller gives already omits them; the test asserts the count equals `controller.transcript().length`).
  - `tools`:
    - ✎ on every message (`data-edit=index`);
    - on the last model reply only: ‹ `n / m` › (from `swipeId + 1` and `swipeCount`) and ↻ (`data-action` `swipe-left` / `swipe-right` / `regenerate`, calling `st.swipeLast` / `st.regenerateLast`);
    - without `swipeCount`, no `n / m` text;
    - all disabled while `pending`.
  - `editing works in place`: ✎ opens the textarea; Ctrl+Enter saves through `controller.edit`; Esc cancels (today's tests move here).
  - `the input moves with it`: while the curtain is open the same `input[name="cmd"]` element is inside `.alius-curtain`, and on close it is back in the input host. Focus is kept.
  - `curtainWords`: with 120, a reply of 121 words opens the curtain when it arrives (a `transcript` event); with 0 it never does.
  - `resetSceneStage()` closes it.
- [ ] **Step 2: Run** `npx vitest run tests/ui/stage/curtain.test.ts tests/st/fake.test.ts` → FAIL.
- [ ] **Step 3: Implement.** The curtain is a child of `StageLayers.curtain`. Opening sets `root.dataset.curtain = 'open'`; CSS slides the sprites right by 18 vw and moves the dock right of the curtain. Reduced motion gives no slide transition.
- [ ] **Step 4: Run** the tests, `tests/ui/scene.test.ts` (edit tests moved), `tests/settings.test.ts`, tsc, build → PASS.
- [ ] **Step 5: Commit** `feat(P10e): the history curtain`

---

## Chunk (c): chips, dock, dial, device

### Task 9: The chip row and the flash

**Files:**
- Create: `src/ui/scene/stage/chipRow.ts`, `src/ui/scene/stage/flash.ts`
- Modify: `src/ui/scene/sceneScreen.ts`:
  - every chip host moves into the row: generation chips, proposal chips, lead and frame chips, the offer surface (offer and initiative), rule, demand and discipline chips, frequency chips, the pastime menu;
  - the per-unit discipline menus become one chip per unit that opens its menu;
  - `drawDevice` becomes a flash shown on Tab.
- Modify: `css/62-stage.css`
- Test: `tests/ui/stage/chipRow.test.ts`

**Interfaces:**
- Produces:
  - `interface ChipRow { element: HTMLElement; slot(name: string): HTMLElement; layout(): void }`
  - `createChipRow(host: HTMLElement, names: readonly string[]): ChipRow` (one child per slot, in the given order; `layout()` sets `data-overflow` and a `[data-more-chips]` "+N" button that toggles `data-expanded`)
  - `flashLine(layer: HTMLElement, text: string, analyze: string, ms?: number): void` (default 2400 ms; reduced motion: no fade)

- [ ] **Step 1: Write the failing tests.**
  - `every chip host has a slot`: the row has slots in this order: `generation, proposals, lead, offer, rules, demands, discipline, discipline-menus, freq, lets, stop`. Each existing draw function writes into its slot. `tests/ui/demandChips.test.ts`, `tests/ui/dynamic/offerComposer.test.ts` and `tests/ui/life/lifeViews.test.ts` pass with selectors updated.
  - `discipline menus as chips`: one `[data-discipline-chip=unitId]` per named woman. A click opens that unit's `renderDisciplineMenu`, and an open one stays open across `refresh()` (as today).
  - `overflow`: with a row narrower than its chips (stubbed widths), `+N` shows the hidden count, and clicking it sets `data-expanded="true"`.
  - `device out of reach`: no standing line. `flashLine` adds one `[data-flash]` with `data-analyze="glossary:device_out_of_reach"` and removes it after 2400 ms (fake timers).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** the test and the three suites above, plus `tests/ui/blockingDevice.test.ts` (its line assertion becomes the flash), tsc, build → PASS.
- [ ] **Step 5: Commit** `feat(P10e): one chip row above the input`

### Task 10: The dock (her hand)

**Files:**
- Create: `src/ui/scene/stage/dock.ts`
- Modify:
  - `src/ui/scene/sceneScreen.ts`: the dock hosts the moment card, the milestone, claim and return cards, the task, punishment and demonstration cards, the posture call and the physics panel; the physics stop word is mirrored into the chip row's `stop` slot;
  - `src/ui/scene/stage/index.ts`: `resetSceneStage` forgets set-aside cards;
  - `css/62-stage.css`.
- Test: `tests/ui/stage/dock.test.ts`

**Interfaces:**
- Produces:
  - `interface Dock { element: HTMLElement; slot(name: string): HTMLElement; layout(sceneId: string): void }`
  - `createDock(host: HTMLElement, names: readonly string[]): Dock`
  - after every redraw `layout()` finds the non-empty slots:
    - the newest open (`data-open="true"`), the others collapsed to their first heading line (`data-collapsed`);
    - a set-aside card (`[data-set-aside]` button on each) is hidden, and counted in `.alius-dock-waiting` ("2 waiting"; a click brings them back);
    - set-aside keys are `sceneId|slot|first data-* id of the card`, kept in module memory.
- Slot order: `moment, posture-call, physics, punishment, task, demonstration, milestone, claim, return`.

- [ ] **Step 1: Write the failing tests.**
  - `one open`: a task card and a punishment card drawn → the punishment (higher in the order) is open and the task collapsed. A click on the collapsed heading opens it and collapses the other.
  - `set aside and back`: set aside the open card → it is hidden and "1 waiting" shows; a click shows it again. Set-aside survives `refresh()`, and is forgotten on a new scene id and on `resetSceneStage()`.
  - `the posture call keeps its timer`: `tests/ui/practice/postureCall.test.ts` "the scene screen" cases pass with the call inside `.alius-dock`.
  - `the physics panel is a card and its stop word is mirrored`: with a run, the panel is in the dock and a `[data-stop-word]` button is in the chip row's `stop` slot. The mirrored button calls the same handler as the panel's stop word, and remains when the panel card is collapsed or set aside.
  - `nothing over her face`: the dock sits in the left 26 vw (a CSS assertion on the class rule via `tests/helpers/css.ts`).
  - Every existing card test (`tests/ui/dynamic/*Card.test.ts`, `tests/ui/practice/demonstrationCard.test.ts`, `tests/ui/practice/slapOverlay.test.ts`) passes with selectors updated. The slap overlay stays in its full-screen host, the `moment` layer.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** the test and the card suites, tsc, build → PASS.
- [ ] **Step 5: Commit** `feat(P10e): the dock for her cards`

### Task 11: The device over the scene

**Files:**
- Modify:
  - `src/ui/shell/shell.ts`:
    - split `buildLayer` into `buildDevice(up: boolean): HTMLElement`, which builds the tab bar, panel, status, chrome and marks, sets `device`, `tabBar`, `panel` and `statusHost`, applies the skin and marks, and returns the element;
    - `buildLayer` calls it for the hub;
    - a new scene-device host (`.alius-scene-device`) over the view while `router.current() === 'scene'`;
    - `isDeviceUp()` is true when the scene device is up;
    - `setDevice(up)` on the scene raises or lowers it without re-rendering the view;
    - Tab and Esc in `onKeyDown` handle `where === 'scene'`.
  - `src/ui/shell/shell.ts` `ShellDeps`: `deviceLocked?: () => boolean`; the app passes `() => state ? deviceLocked(state, registries) : false` and `onDeviceRefused?: () => void`, which flashes the line through the scene screen (`SceneScreen.flashDeviceOut()`).
  - `src/ui/scene/sceneScreen.ts`: `flashDeviceOut()`.
  - `src/app.ts`: the deps.
- Test: `tests/ui/shell/sceneDevice.test.ts`

**Interfaces:**
- Produces: `SceneScreen.flashDeviceOut(): void`; `ShellDeps.deviceLocked?: () => boolean`; `ShellDeps.onDeviceRefused?: () => void`.

- [ ] **Step 1: Write the failing tests.**
  - `Tab raises the device over the scene`: on the scene screen, Tab from the body raises it:
    - `.alius-scene-device .alius-device[data-up="true"]` exists;
    - the scene screen is **not** re-rendered (the `renderSceneView` spy is called once);
    - the selected tab renders.
  - `Tab or Esc lowers it`: Tab again or Esc lowers it and the scene keeps its DOM (the same `input[name="cmd"]` node). With the curtain open, Esc closes the curtain first.
  - `not while typing, not from a control`: Tab with focus in `input[name="cmd"]` or on a dock button does nothing to the device.
  - `busy hands`: with `deviceLocked() === true`, Tab does not raise it and `onDeviceRefused` is called once.
  - `the hub is unchanged`: the existing shell tests pass (`tests/ui/shell*.test.ts`).
  - `a reply arriving while it is up` redraws the scene underneath (a `transcript` event refreshes the scene screen while the device is up).
- [ ] **Step 2: Run** `npx vitest run tests/ui/shell/sceneDevice.test.ts` → FAIL.
- [ ] **Step 3: Implement.** **Step 4: Run** the test, every `tests/ui/shell*` test, `tests/ui/blockingDevice.test.ts`, tsc, build → PASS.
- [ ] **Step 5: Commit** `feat(P10e): Tab raises the device over the scene`

### Task 12: The posture dial and its fan

**Files:**
- Create: `src/ui/scene/dial/dial.ts`
- Modify:
  - `src/ui/scene/blockingStrip.ts`: extract `blockingChoices(state, reg): BlockingChoices | null` (null when not live; `{ rows, moves: Array<{ move, posture, why: string | null }>, add: Array<{ registry, id, label, why: string | null }> }`), and render the strip from it;
  - `src/ui/scene/sceneScreen.ts`: the dial replaces `drawBlocking` in the scene;
  - `content/core/glossary.json`, `CORE_GLOSSARY_IDS` (`posture_dial`);
  - `src/analysis/providers/core.ts` if a provider is needed for the label;
  - `css/62-stage.css`, `css/61-blocking.css` (the fan).
- Test: `tests/ui/dial/dial.test.ts`, `tests/ui/blockingStrip.test.ts` (unchanged assertions)

**Interfaces:**
- Consumes: `blockingChoices`, `poseOf`, `mannequinSvg`, `blockingOf(scene, COMMANDER)`, `state.practices?.postures` (her names, read through `Knowledge.practice` if it exposes them, else the state field P16 already shows in her dossier).
- Produces: `renderPostureDial(host: HTMLElement, ctx: { state: CampaignState | null; registries: Registries; onStage(action: Action): void; reduced: boolean }): void`. The fan is `details.alius-dial-fan` inside the host; its posture options carry `data-move` and `data-analyze="blockingPostures:<id>"`, as the strip's do.

- [ ] **Step 1: Write the failing tests.**
  - `drawn only while live`: no blocking → the host is empty; live → one `svg` and the label.
  - `the commander's posture`:
    - `blocking/set` posture `kneeling_upright` → the label `KNEELING UPRIGHT` (the registry label, upper case);
    - if a present holder named that posture (`practices.postures[holder]` has `{ postureId: 'kneeling_upright', name: 'Down' }`), the label is `DOWN`.
  - `the fan`:
    - a click on the dial's centre (`[data-dial-open]`) opens it;
    - it holds one option per `moves` entry, each with a small mannequin `svg` and its name, then the `add` options as lists by registry;
    - a refused option is `aria-disabled` with `title` = its `why`;
    - choosing one calls `onStage` with exactly the action the strip's chip sends (`blocking/set { posture }` etc.).
  - `the strip is the same model`: `tests/ui/blockingStrip.test.ts` passes unchanged.
  - Coverage: the dial resolves `glossary:posture_dial`; every fan option resolves its registry reading (`analyzeCoverage` "the scene (P15a)" block, with selectors updated).
  - `no text in the figure`: the dial's `svg` has no `<text>`; the label is HTML.
- [ ] **Step 2: Run** `npx vitest run tests/ui/dial/dial.test.ts tests/ui/blockingStrip.test.ts` → FAIL.
- [ ] **Step 3: Implement.** The dial host is in the `ui` layer at the bottom right: about 200 px at 1080 high, `min(18.5vh, 200px)`.
- [ ] **Step 4: Run** the tests, `tests/ui/analyzeCoverage.test.ts`, `tests/ui/blockingDevice.test.ts`, tsc, build → PASS.
- [ ] **Step 5: Commit** `feat(P10e): the posture dial`

---

## Chunk (d): look, layout test, docs

### Task 13: The visual language, the screen sizes and the layout test

**Files:**
- Create: `scripts/layout-test.mjs`, `tests/layout/entry.ts` (renders the scene screen for a named fixture into `document.body`: `one`, `three`, `curtain`, `long`, `physics`), `tests/fixtures/layout/sprite.svg` (a knee-length placeholder silhouette, viewBox 847×1238, never the author's art), `tests/ui/stage/hosts.test.ts`
- Modify:
  - `package.json`: `"test:layout": "node scripts/layout-test.mjs"`;
  - `css/62-stage.css`: the §9 language (Inter light for prose, Plex Mono small caps for system lines, glass surfaces `backdrop-filter: blur(12px)` off in readable mode, rounded pills, no `[ ]` brackets in the stage's own labels, the held host styled in the scene) and the §10 sizes (1280×800: curtain 55 %, dock 30 vw; < 1100 px: dial 140 px);
  - the bracketed labels the stage draws itself (`[ SAVE ]` → `Save` in the curtain, `[ STOP ]` → `Stop`). Cards drawn by other packages keep their text.

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the tests.**
  - `tests/ui/stage/hosts.test.ts` (jsdom, the spec §12a.5 table as data): for a state where every host has content, each of today's hosts is found in its new place. The test renders a fixture with a proposal, a demand, a rule, a milestone, a task, a punishment, a posture call, a moment, a physics run, a frequency fragment and a pastime menu. The places are the top line, the status line, the reply, the curtain, the chip-row slot or the dock slot; the table names each.
  - `scripts/layout-test.mjs`:
    - esbuild bundles `tests/layout/entry.ts` (browser platform) into `.superpowers/layout/` (git-ignored);
    - serves the repo root over a local `node:http` server on `127.0.0.1` with an ephemeral port (file URLs cannot `fetch`);
    - the entry loads the content with `loadPacks(['content/core'], (p) => fetch('/' + p).then((r) => r.json()))`, builds the fixture states with the helpers the jsdom tests use if they bundle for the browser (else the script writes the fixture states as JSON from Node first), and uses `FakeStAdapter` with `getSpriteUrl` answering `/tests/fixtures/layout/sprite.svg` and `assetUrl: (p) => '/' + p`;
    - the page links `/style.css`;
    - in Chromium at **1920×1080**, **1280×800** and **2560×1440**, for each fixture, asserts:
      - the backdrop layer's box equals the viewport;
      - (`one`) the sprite image's visible height above the reply block's top is ≥ 540 px at 1920×1080;
      - no element of `.alius-layer-ui` overlaps the sprite's head box (its top 22 %);
      - the reply, the input and the dial lie inside the viewport;
      - (`three`) no head box intersects the dock;
      - (`curtain`) the curtain's width is 45 % (55 % at 1280×800) and the sprite's head is not under it;
      - (`long`) the reply block has `data-overflow="true"` and its height ≤ 30 % of the viewport;
      - (`physics`) the stop word is visible;
    - exits non-zero with a list of failures.
- [ ] **Step 2: Run** `npx vitest run tests/ui/stage/hosts.test.ts` and `npm run test:layout` → FAIL until the CSS is done.
- [ ] **Step 3: Implement** the CSS until both pass.
- [ ] **Step 4: Run** `npm run test:layout` → PASS at all three sizes. Then run `npm test` (full) and `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(P10e): the stage's look, the sizes and the layout test`

### Task 14: Docs, manual test and hand-off

**Files:**
- Create: `docs/MANUAL_TEST_P10e.md` (12 steps in the style of `MANUAL_TEST_P15.md`):
  1. a scene at 1920×1080: the sprite fills the height;
  2. a reply with `*actions*` and quotes;
  3. a long reply → "more", the wheel opens the curtain;
  4. edit, swipe n / m, regenerate in the curtain;
  5. ↑ in an empty input;
  6. look around with the right button, then recentre;
  7. Tab raises the PDA, a reply arrives under it, Esc lowers it;
  8. busy hands → the flash;
  9. two cards in the dock, set one aside;
  10. the dial: kneel from the fan, the label shows her name for it;
  11. a physics run: the stop word in the chip row;
  12. a chat switch resets the look and the curtain.
- Modify:
  - `docs/packages/P10e-scene-stage.md`: status `implemented`, and an **Implemented as** with the rulings R1–R7 as built, what moved where (the table), non-obvious things, open items. Open items include: the presets come with P16b; the mini-game instruments come with the mini-games session; the device in her presence as an act is a later package; P17c's camera fills the frame, surface and pose-shot layers.
  - `docs/00-overview.md`: §9 a row for P10e (implemented); §5.4 rows for `buildLayers`, `resetSceneStage`, `proseRuns` / `fillProse`, `renderPostureDial` / `mannequinSvg` / `pose` / `poseOf`, `blockingChoices`, `inputGauge` / `SceneScreen.gauge`, `ShellDeps.deviceLocked`, `ChatMessage.swipeCount`.
  - `docs/packages/{P16b-service-craft,P17-staged-scenes,P17c-immersion-and-staging}.md`: an **Interfaces already provided by P10e** note each (the layers for P17c's camera, the dock and the chip row for new cards and chips, the dial's `target` / `hot` for P16b's drift, the input as the gauge surface).
  - `CLAUDE.md`: a P10e rule line in the style of the others: what to read before touching `src/ui/scene/{stage,dial}/`, `sceneScreen.ts`, `css/62-stage.css` or the shell's scene device; new hosts go into the chip row or the dock, never a new column; `resetSceneStage` on chat switch; the dial draws from point states, never from pictures; `npm run test:layout` after any stage CSS change.
- [ ] **Step 1: Write them.** **Step 2: Run** `npm test` → PASS. **Step 3: Commit** `docs(P10e): implemented as, overview, hand-off notes`
