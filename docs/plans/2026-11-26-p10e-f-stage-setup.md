# P10e Chunk (f): The Stage Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a SYS › STAGE screen where the author sets up each woman for the scene stage and the instruments:
- her sprites checked;
- how she stands, her face point, her hand and her accent;
- every art slot loaded, fitted with its prototype's controls, zoned with the prototypes' marker and tried in its mini-game.

Everything is saved as files in her own expressions folder.

**Architecture:**
- **Storage.** Her art lives in `characters/<her folder>/alius/`, read and written through new `StAdapter` methods over SillyTavern's sprite endpoints.
- **Reading.** A loader turns the folder into the resolver chunk (e) already uses (`ArtSlots`, `src/ui/scene/art.ts`), with the old `content/local/art/art.json` as a second source. Her look (`stage.json`) feeds the sprite placement, `unitAccent` and her hand through one leaf module.
- **UI.** The screen is a SYS section and a full-screen sheet in `src/ui/stage/`. The fit controls and the zone marker are ports of the prototypes' panel code.
- **Preview.** It runs the real scene screen on a throwaway demo state.

**Tech Stack:** TypeScript 5 (strict), esbuild, vitest (+ jsdom), zod, Canvas 2D for the marker, Playwright from the environment for `npm run test:layout`. No new dependencies.

**Spec:** `docs/packages/P10e-scene-stage.md` §16 (this chunk), §15 (the instruments and their slots), **Implemented as: chunk (e)**. The prototypes stay normative for every control they define: `docs/prototypes/*.html` and `docs/prototypes/README.md`. Read before Task 1:
- `CLAUDE.md` (P10, P10e, P10e chunk (e) rules);
- `docs/00-overview.md` §5.4;
- `docs/content/lore.md` §0;
- `src/ui/scene/art.ts`, `src/st/real.ts` (`getSpriteUrl`), `src/st/sprites.ts`, `src/st/fake.ts`;
- `tests/layout/entry.ts` and `tests/layout/mkstate.ts`.

## Global Constraints

- **Rendering and setup only.** No engine state field, event, action, registry entry, rng draw or memory fact. **Memory check:** nothing is remembered: setup data about a card, outside any campaign; no journal, chronicle or prompt line.
- **No art = today's game, byte for byte.** With no `alius/` folder and no `art.json`, every screen, layout fixture and seeded test is unchanged. A seeded test that moves stops and reports.
- **The ST APIs are exactly these** (checked against SillyTavern `release`, `src/endpoints/sprites.js` and `src/users.js`):
  - `GET /api/sprites/get?name=<folder>/alius` lists images (`[{ label, path }]`, `path` = `/characters/<folder>/alius/<file>?t=<mtime>`).
  - `GET /characters/<folder>/alius/<file>` serves any file; a 404 is "none".
  - `POST /api/sprites/upload` is multipart: the file in field **`avatar`**, plus `name` = `<folder>/alius`, `label` and `spriteName` = the file's name without extension. It creates the folder, and **deletes every file in it whose name without extension equals `spriteName`** before writing.
  - `POST /api/sprites/delete` takes JSON `{ name, label, spriteName }` and deletes those files.
  - Every request carries `getRequestHeaders()`. Only `src/st/` touches them (CLAUDE.md, overview §11).
- **File names:**
  - a picture is `<slotKey>.<ext>`, with any image type ST's list returns: png, webp, jpg, gif, avif;
  - a slot's sidecar is **`<slotKey>.fit.json`** (`spriteName` `<slotKey>.fit`);
  - her look is **`stage.json`** (`spriteName` `stage`).

  `slotKey` is an `ART_SLOT_IDS` entry, or `legs_astride.left` / `legs_astride.right`. No other name is ever written.
- **The folder** is the **first segment** of `spriteFolder(avatar, name, expressionOverrides)` + `/alius`, so an Expressions override that names a subfolder still maps to the character's folder. ST accepts one level of subfolder only.
- **Precedence of her look** (author): the campaign's own `unit.hand`, then `stage.json`'s `hand`, then the hash (`handOf`). Her accent: `stage.json`'s `accent`, then `unitAccent`'s hash. **A slot in her folder wins over `art.json`.** Her `stage.json` `face` wins over `art.json`'s `sprite.face`.
- **Uploads:** only `image/*` files up to **20 MB**. A larger or other file is refused with a toast, and nothing is sent.
- **P10e rules hold:**
  - every new control carries `data-analyze` and resolves (glossary ids listed per task, into `content/core/glossary.json` and `CORE_GLOSSARY_IDS`);
  - ask `motionReduced` / `visualFlags`, never `matchMedia`;
  - every z-index stays below the analysis panel's 10;
  - nothing loads from outside the ST server (`tests/assets.test.ts`);
  - no text gives the commander a pronoun.
- **The prototypes' controls are ports, not redraws.** The fit controls of each slot and the zone marker are copied from their prototype's panel code (JS to TS: types only) and declared in a new `src/ui/stage/fidelity.json`, read by `tests/ui/instruments/fidelity.test.ts`'s helpers (`tests/helpers/protoFidelity.ts`). Where the file and this plan differ, **the file wins**; say so in the commit message.
- **`over_explicit`** is listed and editable only while the setting `showExplicitSlots` is on (default `false`). In play its gate is unchanged (`explicitArtAllowed`).
- **Chat switch:** an open STAGE sheet or preview closes, and its draft is dropped. Her look for the new campaign is reloaded.
- `npm test` rebuilds `dist/index.js` and `style.css`; commit them with each task. Run `npm run test:layout` after any CSS change.
- **Execution** (author, 2026-11-26): one implementer per chunk (Opus, effort medium); after the last chunk one reviewer of the whole of (f) (Opus, effort high), then its fix wave. **Stop at each chunk's boundary**; each chunk leaves the game runnable.

## Review Focus

1. **A card whose Expressions override names a subfolder** (`Vex/casual`): the art must go to `Vex/alius`, never `Vex/casual/alius`, which ST would turn into `Vex/casual`. Pinned in Task 1.
2. **Replacing a picture with another type** (`over.png` → `over.webp`) replaces it and leaves `over.fit.json` alone. Writing a sidecar never deletes its picture. Pinned in Tasks 1 and 6.
3. **A woman with no sprite folder at all:** the list says so and the page still opens. The first upload creates the folder. Pinned in Tasks 2 and 5.
4. **A hand-edited, broken `stage.json` or sidecar** is skipped with one warning; the game and the other slots are unaffected. Pinned in Task 2.
5. **A chat switch with the sheet or the preview open** closes them, dispatches nothing to the new campaign and saves nothing half-done. Pinned in Tasks 4 and 8.

---

## Chunk f1: her folder

### Task 1: The ST adapter reads and writes her folder

**Files:**
- Modify: `src/st/adapter.ts` (the interface), `src/st/real.ts`, `src/st/fake.ts`, `src/st/sprites.ts`
- Test: `tests/st/stageFolder.test.ts`

**Interfaces:**
- Produces:
  - `stageFolder(avatar: string, name: string, overrides: unknown): string` in `src/st/sprites.ts`: the first segment of `spriteFolder(...)` + `'/alius'`.
  - On `StAdapter`:
    - `listStageFiles(avatar: string): Promise<Array<{ file: string; url: string }>>`: images of her `alius/` folder, `file` being the name with extension; `[]` for no folder, an unknown avatar or a failed request.
    - `fetchStageJson(avatar: string, file: string): Promise<unknown | null>`: `null` on 404 or a parse error.
    - `uploadStageFile(avatar: string, baseName: string, data: Blob, ext: string): Promise<boolean>`.
    - `deleteStageFile(avatar: string, baseName: string): Promise<boolean>`.
    - `listSprites(avatar: string): Promise<string[]>`: her root folder's labels, for the sprite check.
  - `FakeStAdapter` keeps an in-memory folder per avatar with ST's replace rule (same name without extension), so tests can upload and read back.

- [x] **Step 1: Write the failing tests:**
  - `stageFolder('Vex.png', 'Vex', [])` → `'Vex/alius'`;
  - with an override `{ name: 'Vex', path: 'Vex/casual' }` → `'Vex/alius'`;
  - with an override `{ name: 'Vex', path: 'Other' }` → `'Other/alius'`.
  - `RealStAdapter.uploadStageFile` (with a stubbed `fetch` and context) posts to `/api/sprites/upload` a `FormData` with `avatar` (a `File` named `<baseName>.<ext>`), `name` `'Vex/alius'`, `label` = `baseName`, `spriteName` = `baseName`, and the request headers without `Content-Type`.
  - `deleteStageFile` posts JSON `{ name, label, spriteName }` to `/api/sprites/delete`.
  - `listStageFiles` maps `/api/sprites/get?name=Vex%2Falius` to `{ file, url }` keeping the `?t=`.
  - Fake round trip:
    - `over.png` then `over.webp` leaves only `over.webp`;
    - `over.fit` (json) beside `over.webp` survives an upload of `over`;
    - an unknown avatar lists `[]`.
- [x] **Step 2: Run** `npx vitest run tests/st/stageFolder.test.ts` → FAIL.
- [x] **Step 3: Implement** the five methods in `real.ts`. They resolve the folder like `getSpriteUrl`, then call `stageFolder`; on any failure they return `[]`, `null` or `false`, never throw.
- [x] **Step 4: Run** the test and `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P10e-f): her stage folder in the ST adapter`

### Task 2: Loading her folder into the art slots

**Files:**
- Create: `src/ui/stage/load.ts`
- Modify: `src/ui/scene/art.ts` (a second source), `src/app.ts` (load at campaign open and on `refreshStage()`)
- Test: `tests/ui/stage/load.test.ts`, `tests/ui/scene/art.test.ts`

**Interfaces:**
- Consumes: Task 1's adapter methods.
- Produces:
  - `interface StageSetup { stand?: { scale: number; x: number; y: number }; face?: { x: number; y: number }; hand?: string; accent?: string }`. zod: `scale` 0.5–1.6, `x` and `y` −0.5…0.5 (fractions of her sprite's height), `face` 0–1, `accent` `#rrggbb`.
  - `interface StageFolder { slots: Map<string, { url: string; sidecar: ArtSidecar }>; setup: StageSetup | null }`.
  - `loadStageFolders(st: StAdapter, units: Array<{ id: string; cardRef?: string }>): Promise<Map<string, StageFolder>>`, keyed by `cardRef`. It lists the folder, takes only files whose name without extension is a slot key or `stage`, and fetches `<slotKey>.fit.json` for each picture found and `stage.json`.
  - `createArtSlots(manifest, assetUrl, unitKey, folders?: Map<string, StageFolder>)`: a slot in `folders` wins; `face(unitId)` reads `setup.face` first. URLs from the folder are used as given (they are server paths already, not `assetUrl`'d).
  - `app.refreshStage(): Promise<void>` reloads and rebuilds `art`, then redraws the open screen.

- [x] **Step 1: Write the failing tests:**
  - a fake folder with `over.webp`, `over.fit.json` and `legs_astride.left.png` resolves `get(u, 'over')` with the sidecar and the folder URL;
  - with `art.json` also naming `over`, the folder's picture wins, and an `art.json`-only slot still resolves;
  - a `stage.json` with `face` beats `art.json`'s `sprite.face`;
  - a broken sidecar gives the picture with `{}` and **one** `console.warn` for the load; a broken `stage.json` gives `setup: null` and one warning;
  - `wallpaper.png` (not a slot) is ignored;
  - no folder → the map has no entry and `createArtSlots` answers exactly as without `folders`.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement** `load.ts`, the fourth parameter of `createArtSlots` and the app wiring. The load runs after `loadContent` and the art manifest, for the squad's named units with a `cardRef`; a campaign with none loads nothing.
- [x] **Step 4: Run** the tests, `npm test`, `npm run test:layout` → PASS, with no layout change.
- [x] **Step 5: Commit** `feat(P10e-f): her folder feeds the art slots`

### Task 3: Her look on the stage: stand, face, hand, accent

**Files:**
- Create: `src/ui/stage/look.ts` (a leaf: no import from the scene or the engine beyond types)
- Modify: `src/ui/voice/voiceCard.ts` (`unitAccent` reads the override), the ten UI call sites of `handOf` (`sceneCard.ts`, `sceneScreen.ts`, `hub/roomPanel.ts` ×2, `notes/ruleNote.ts`, `inv/invTab.ts`, `home/homeTab.ts` ×2, `practice/postureCall.ts`; `squad/squadTab.ts` keeps `handOf` for the campaign's own picker), `src/ui/scene/sceneScreen.ts` (`drawSprites`), `css/62-stage.css`, `src/app.ts` (sets the looks after Task 2's load; clears them on chat switch)
- Test: `tests/ui/stage/look.test.ts`, `tests/ui/scene/sprites.test.ts`

**Interfaces:**
- Produces:
  - `setStageLooks(map: Map<string, StageSetup>): void` (keyed by unit id) and `stageLookOf(unitId): StageSetup | null`.
  - `herHand(state: CampaignState, reg: Registries, unitId: string): Entry | null` follows the precedence of the Global Constraints. A `stage.json` hand that is not in the registry is skipped.
  - `unitAccent(unitId)` keeps its signature and returns `stageLookOf(id)?.accent` first.
  - CSS variables on `.alius-sprite`: `--alius-sprite-scale` (default 1), `--alius-sprite-dx`, `--alius-sprite-dy` (default 0, in fractions of her height). They multiply and offset whatever the crowd rules set; the bottom anchoring of two or more women is kept.

- [x] **Step 1: Write the failing tests:**
  - `herHand`:
    - with `unit.hand` set → that hand, whatever `stage.json` says;
    - without it and with a `stage.json` hand → the card's;
    - with an unknown `stage.json` hand → `handOf`'s hash;
  - `unitAccent` with an override → the override; without → the hash, as before;
  - `drawSprites` with a stand `{ scale: 1.2, x: 0.05, y: -0.1 }` writes the three variables on her `.alius-sprite`; a woman without a look gets none.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement.** The CSS applies the variables as one transform on the sprite's inner box so the panorama slot and the speaker's scale still compose.
- [x] **Step 4: Run** the tests, `npm test`, `npm run test:layout` → PASS. The layout fixtures carry no look, so nothing moves.
- [x] **Step 5: Commit** `feat(P10e-f): her stand, face, hand and accent from her folder`

## Chunk f2: SYS › STAGE

### Task 4: The section: her list and the list of every slot

**Files:**
- Create: `src/ui/stage/slots.ts`, `src/ui/stage/section.ts`
- Modify: `src/settings.ts` (`showExplicitSlots: boolean`, default `false`, in the schema), `src/ui/shell/sysTab.ts` (the section after `[ SETTINGS ]`), `content/core/glossary.json` and `CORE_GLOSSARY_IDS` (`stage_setup`, `stage_slot_state`, `setting:showExplicitSlots`), a new `css/75-stage-setup.css` (check the number is free; take the next free one if not)
- Test: `tests/ui/stage/section.test.ts`

**Interfaces:**
- Produces:
  - `SLOT_INFO: Record<SlotKey, { label: string; prototype: string; instrument: string; zones: boolean; explicit?: true }>`: one row per slot key. `prototype` is the file whose panel defines its fit; the implementer reads it from `docs/prototypes/README.md` and each prototype's "copy the fit" code: `over`, `over_explicit` → weight.html (and gulp.html's reading); `legs_seated.*`, `sole_close`, `feet_floor` → her_activity.html; `legs_astride.*` → throne.html; `shoe_*` → shoe.html; `face_close` → the file whose code reads it.
  - `slotState(folder: StageFolder | undefined, art: ArtSlots, unitId: string, key: SlotKey): 'none' | 'picture' | 'fitted' | 'zoned'`: `fitted` = the sidecar has `fit` (or `feet` for the slots that need it); `zoned` = it has `zones` and `SLOT_INFO[key].zones`.
  - `renderStageSection(host: HTMLElement, ctx: StageCtx): void`, with `StageCtx = { st; getState; getRegistries; art: () => ArtSlots; folders: () => Map<string, StageFolder>; openSheet(unitId: string): void; settings }`.

- [x] **Step 1: Write the failing tests:**
  - the section lists each living named unit with her sprite found / missing (from `listSprites`) and `n / 12` (11 while `showExplicitSlots` is off);
  - the table has one row per woman and one column per slot key; each cell is the state's word and carries `data-analyze="glossary:stage_slot_state"`;
  - `over_explicit` appears only with the setting on;
  - with no campaign open the section says so and draws no table;
  - a chat switch while the section is drawn redraws it for the new squad.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement.** The words of the states: `—` · `picture` · `fitted` · `zoned`.
- [x] **Step 4: Run** the tests, `npm test`, the analyze coverage test → PASS.
- [x] **Step 5: Commit** `feat(P10e-f): SYS › STAGE, her list and every slot's state`

### Task 5: Her page: sprites, stand, hand, accent

**Files:**
- Create: `src/ui/stage/sheet.ts`, `src/ui/stage/lookEditor.ts`
- Modify: `css/75-stage-setup.css`, the glossary (`stage_sprites`, `stage_stand`, `stage_face`, `stage_hand`, `stage_accent`)
- Test: `tests/ui/stage/sheet.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `openStageSheet(unitId: string, ctx: StageCtx): () => void`: a full-screen sheet over the shell (below z 10); returns its closer.
  - `saveStageSetup(st, avatar, setup: StageSetup): Promise<boolean>`: uploads `stage.json` (`baseName` `stage`, `ext` `json`, a `Blob` of `application/json`), then `app.refreshStage()`.
  - `facesWanted(reg): string[]`: the labels the instruments ask for, read from `TUNING.practice.slap.faces` (every `before` / `keep` / `after` label) and the frame's face table in chunk (e)'s code. The implementer finds the frame's table; it reads by field.

- [x] **Step 1: Write the failing tests:**
  - **sprites:** the labels found, each wanted label marked found or missing; a missing one names its stand-in: the instrument's fallback, from the slap's `keep` set or `neutral`;
  - **stand:**
    - three sliders (scale 0.5–1.6, x and y −0.5…0.5) move a live preview of her sprite drawn with the stage's own classes;
    - a click on the preview sets the face point;
    - SAVE calls `uploadStageFile(avatar, 'stage', …, 'json')` with the edited `StageSetup` and nothing else changed;
  - **hand:** 48 samples in registry order, each in its family at its `handScale`; picking one sets `hand`; "from the hash" clears it;
  - **accent:** `UNIT_ACCENTS` swatches plus a colour input; "from the hash" clears it;
  - closing with unsaved edits asks once; a chat switch closes without asking and saves nothing;
  - a woman with no sprite folder: "no sprites found", and the page still works.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement.** The sheet's slot list is Task 6's; leave its host empty here.
- [x] **Step 4: Run** the tests, `npm test`, `npm run test:layout` → PASS.
- [x] **Step 5: Commit** `feat(P10e-f): her page — sprites, stand, hand, accent`

## Chunk f3: the slots

### Task 6: Load, fit and remove a slot (the prototypes' panels)

**Files:**
- Create: `src/ui/stage/slotEditor.ts`, `src/ui/stage/fit/` (one file per prototype panel: `weight.ts`, `activity.ts`, `throne.ts`, `shoe.ts`, and the `face_close` one), `src/ui/stage/fidelity.json`
- Modify: `src/ui/stage/sheet.ts` (her slots), `tests/ui/instruments/fidelity.test.ts` (reads the new file), the glossary (`stage_load`, `stage_fit`, `stage_remove`)
- Test: `tests/ui/stage/slotEditor.test.ts`

**Interfaces:**
- Produces:
  - `openSlotEditor(host: HTMLElement, unitId: string, key: SlotKey, ctx: StageCtx & { draft: SlotDraft }): void`;
  - `interface SlotDraft { file?: File; url: string | null; sidecar: ArtSidecar }`;
  - `saveSlot(st, avatar, key, draft): Promise<boolean>`: the picture (`baseName` = key, `ext` from the file) only when `file` is set, then the sidecar (`baseName` `<key>.fit`, json), then `refreshStage()`;
  - `removeSlot(st, avatar, key)`: deletes `<key>` and `<key>.fit`.
- **The fit controls** are each prototype's panel controls for that slot (sliders, the feet and shown pickers, `floorShade` on `legs_seated.rest`, the open item of chunk (e)), ported with their ranges, steps and defaults. The sidecar shape is the one the prototype's "copy the fit" writes and `art.ts`'s schema reads. Each ported function is declared in `src/ui/stage/fidelity.json` with its prototype.

- [x] **Step 1: Write the failing tests:**
  - **LOAD:**
    - a 1 MB png is accepted and drawn in the slot's preview frame;
    - a 21 MB file or a non-image is refused with a toast, and no upload is called;
  - **fit:** each slot's controls exist with the prototype's keys, e.g.:
    - `over`: `height`, `x`, `sink`;
    - `legs_astride`: `feet`, `shown`, `height`, `x`, `top`, `tilt`;
    - `shoe_close.boots`: `feet`, `shown`, `height`, `y`, `x`, `fade`, `xr`, `xl`.

    Moving one writes the draft's sidecar.
  - **SAVE:**
    - uploads the picture then `<key>.fit` with the draft's sidecar; a save with only the fit changed uploads only `<key>.fit`;
    - after `over.png` was saved, loading and saving `over.webp` leaves the sidecar (fake folder);
  - **REMOVE** deletes both;
  - the fidelity test passes with the new file and fails if a ported function is edited.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Port** each panel's code from its prototype (open the file, copy, type, wire). Do not redraw.
- [x] **Step 4: Run** the tests, `npm test`, `npm run test:layout` → PASS.
- [x] **Step 5: Commit** `feat(P10e-f): load, fit and remove her slots`

### Task 7: The zone marker

**Files:**
- Create: `src/ui/stage/zones.ts`
- Modify: `src/ui/stage/slotEditor.ts`, `src/ui/stage/fidelity.json`, the glossary (`stage_zones`)
- Test: `tests/ui/stage/zones.test.ts`

**Interfaces:**
- Produces: `markZones(canvas: HTMLCanvasElement, picture: HTMLImageElement, names: string[], sidecar: ArtSidecar, onChange: (zones) => void): () => void`.
- **The marker is her_activity.html's** (README "Zones (`zoneRadii`, `zoneAt`)": a plain click is a point zone with half the distance to the nearest neighbour, 4–12 % of the height; a press and drag toward a corner is an ellipse `[x, y, rx, ry, deg]`, radii as fractions of the picture's height; the wheel turns it while dragging or the last one placed, 5° a notch, 1° with Shift; with Shift a circle `[x, y, r]`). Shoe.html's marker for the shoe slots, where it differs.
- **Zone names per slot** come from the prototypes:
  - `sole_close`: `toes`, `ball`, `arch`, `heel`, `edge`;
  - the shoe slots: shoe.html's surfaces and zones.
- Two feet in one picture (`feet: 'two'`) mark one set per foot (`{ right, left }`).

- [x] **Step 1: Write the failing tests:**
  - a click at (0.4, 0.6) with no neighbour gives `[0.4, 0.6, r]` with r in [0.04, 0.12];
  - a drag gives an ellipse; four wheel notches turn it 20°, with Shift 4°;
  - Shift + click gives a circle;
  - the zones are drawn only while marking;
  - `feet: 'two'` asks for the right foot's set, then the left's;
  - the saved sidecar round-trips through `art.ts`'s schema;
  - the fidelity test covers `zoneRadii` / `zoneAt` and the marker's handlers.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Port** the marker from the prototype files.
- [x] **Step 4: Run** the tests, `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P10e-f): the zone marker`

## Chunk f4: the preview

### Task 8: Check it in the mini-game

**Files:**
- Create: `src/ui/stage/demo.ts` (the demo states, moved from `tests/layout/mkstate.ts`; the test file imports them from here so there is one copy), `src/ui/stage/preview.ts`
- Modify: `tests/layout/mkstate.ts`, `src/ui/stage/slotEditor.ts` (the CHECK button), the glossary (`stage_preview`)
- Test: `tests/ui/stage/preview.test.ts`

**Interfaces:**
- Produces:
  - `demoStateFor(instrument: string, unit: { id; cardRef; displayName }, reg: Registries): CampaignState | null`: the fixture state that starts that instrument with her as the holder; `null` for none;
  - `openPreview(unitId: string, key: SlotKey, draft: SlotDraft, ctx: StageCtx): () => void`.

    It renders `renderSceneScreen` into a sandbox overlay with:
    - a `FakeStAdapter` that answers her real sprite URLs;
    - an `ArtSlots` built from the draft (the unsaved fit and zones);
    - a dispatch that runs the engine on the sandbox's own clone and never calls the app's dispatch, save or model.

- [x] **Step 1: Write the failing tests:**
  - CHECK on `over` opens the weight instrument with the draft's picture;
  - the open campaign's state is deep-equal before and after;
  - `st.saveMetadata`, `generateMain` and `generateWithProfile` are never called;
  - closing removes the overlay;
  - a chat switch closes it at once;
  - every slot key in `SLOT_INFO` has a `demoStateFor` that is not null;
  - the layout test's fixtures still build from `demo.ts` (`npm run test:layout` unchanged).
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement.** **If the scene screen cannot run against a sandbox** (a singleton it reaches, an app hook it needs), **stop and report** with what blocks it; do not fork the scene screen.
- [x] **Step 4: Run** the tests, `npm test`, `npm run test:layout` → PASS.
- [x] **Step 5: Commit** `feat(P10e-f): check a slot in its mini-game`

**As built (f4):**
- `demoStateFor(instrument, unit, reg, key?)`: the optional `key` picks the view inside one instrument (the frame plays her legs seated, her feet on the floor for `feet_floor` with the commander `at_her_feet`, the throne for `legs_astride*`, the service for `sole_close`; the shoe her heels for a `.heels` key; the weight its face-up view, `boot_on_chest`, where `over` is drawn). The holder is the first of a wizard-built squad, so her id follows the wizard's rule; she is found by her card (`unit.id` is not used). The builders are exported (`demoSlap`, `demoBreath`, `demoWeight`, `demoScent`, `demoJaw`, `demoActivity`, `demoThrone`, `demoService`, `demoShoe`, `demoGulp`); `tests/layout/mkstate.ts` builds its instrument fixtures from them (the states are byte-identical to before). While a demo is built, a frame reader registered at the first build answers `play` (the demo has no dynamic of its own); it answers null at any other time.
- `openPreview(unitId, key, draft, ctx)` (and `closePreview()`): the real `renderSceneScreen` in `.alius-stage-preview` (z 3), its own `createStaging` on the sandbox's clone with an envelope that never calls a model (every site runs its fallback) and a 250 ms clock, a `FakeStAdapter` that asks the app's adapter only for her sprite, sprite list and avatar URLs. `StageCtx` / `StageDeps` gained optional `assetUrl` and `samples` (the app passes both).
- A partner file she does not have yet (a shoe's close-up or sole, the other file of `legs_astride` as a pair) is stood in for by the draft, said in the preview's head: otherwise the shoe would play its card and the pair its silhouettes.


## Chunk f5: closing

### Task 9: The layout fixtures, the docs, the manual test

**Files:**
- Modify: `scripts/layout-test.mjs` and `tests/layout/entry.ts` (fixtures `stage` and `stageslot`: the sheet and the slot editor at every size, no control off-screen, nothing over the analysis panel), `docs/packages/P10e-scene-stage.md` (status line; **Implemented as: chunk (f)**, with rulings, non-obvious things and open items), `docs/00-overview.md` (§9 row 3a.f `implemented`; §5.4 the new interfaces), `CLAUDE.md` (the P10e line names `src/ui/stage/` and the folder rule), the specs that depend on art (P17c §5: **Interfaces already provided by P10e (f)**)
- Create: `docs/MANUAL_TEST_P10e-f.md`: in SillyTavern, with a real character:
  - load a picture into each kind of slot;
  - fit it, zone it and check it;
  - replace a png with a webp;
  - hand-drop a file into `alius/`;
  - test an Expressions override with a subfolder;
  - switch the chat with the sheet open.

- [x] **Step 1:** add the two fixtures and run `npm run test:layout` → PASS.
- [x] **Step 2:** `npm test`, `npm run typecheck` → PASS.
- [x] **Step 3:** write the docs and the manual test; tick this plan's boxes.
- [x] **Step 4: Commit** `docs(P10e-f): chunk f closed`

**As built (f5):**
- **8b (before Task 9):** the app's scene `physics` did not forward the staging controller's optional methods (`relief`, `decide`, `service`, `spit`, `restart`, `getUp`, `found`, `woke`, `script`): dead in play since chunk (e). Forwarded in `src/app.ts` and `src/ui/stage/preview.ts`; pinned by `tests/app-physicsForward.test.ts` and a case in `tests/ui/stage/preview.test.ts`. No seeded or golden test moved.
- The fixtures `stage` and `stageslot` have their own page entry, `tests/layout/stage.ts` (the page serves it for a `stage*` fixture; `openLayout` does not wait for a backdrop there), instead of a branch of `tests/layout/entry.ts`. `stageslot` opens every slot's editor in turn. The fixture found the slot editor's side panel widening past the sheet at 1280×800 (a long option of the legs astride's select); fixed in `css/75-stage-setup.css` (`minmax(0, 1fr)` columns).
