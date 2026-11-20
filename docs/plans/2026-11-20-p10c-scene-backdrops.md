# P10c "Scene Backdrops" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The author's backdrop art (50 files, 21:9, upscaled to 3072×1280) goes into the game:
- every scene location gets its background, per time of day where the art has variants;
- each soldier's quarters get one of 14 room styles (a stable default from her id, changeable in her dossier), and the model is told what her room looks like;
- the scene screen shows the background full-bleed (full height, a slight pointer-driven pan over the extra width), with the text in a translucent panel over it;
- the 0.2 art (floors, ceilings, skies, frames, corridors) ships as data with no reader yet, for P17c.

**Architecture:**
- **Assets.** A Python + Pillow script, `scripts/art/backdrops.py`, turns `content/core/art/incoming/*.png` into `content/core/art/backdrops/*.webp` (renames, normalizes size, crops, encodes) and removes the incoming files. It is a dev tool, run once per art drop; the game never runs it.
- **Engine.** A new pure module, `src/engine/backdrops.ts`:
  - `quartersOf(state, reg, unitId)`, the room style of a soldier (stored choice, else the hashed default);
  - `sceneBackdrop(state, reg, locationId, ownerId)`, the ordered candidate files of a scene and whether each is slot-specific.
  - One new action, `squad/set_quarters`.
- **Data.** Two new registries, `quartersStyles` and `backdrops`; `locations` gain `backgroundEvening`, `floor`, `ceiling`; `Unit.quarters?`.
- **UI.** `src/ui/scene/sceneScreen.ts` and `css/60-scene-comms.css` (full-bleed, pan, light, fallback chain); the QUARTERS select in the dossier (`src/ui/squad/squadTab.ts`); a glossary entry; the scene header line in `src/scene/context.ts`.

**Tech Stack:** TypeScript 5 (strict), esbuild, zod 3, vitest (+ jsdom for UI). Dev only: Python 3 + Pillow (WebP) for the asset script. No new npm dependency.

**Spec:** there is no package spec; this plan is the spec. Read before Task 1:
- `docs/00-overview.md` (§5.4).
- `docs/packages/P10-visual-upgrade.md` (**Implemented as**: rooms by data, `motionReduced` / `visualFlags`, `tests/assets.test.ts`).
- `docs/packages/P10b-intimate-immersion-ui.md` (**Implemented as**: `handOf` and `squad/set_hand`, the pattern `quartersOf` copies).
- `docs/packages/P17c-immersion-and-staging.md` §4, §5 and the depth revision ("art never gates anything", the fallback chains, surfaces, frames, the aesthetics of the base).
- `docs/content/lore.md` §0 and §8.

## Global Constraints

- **English and safe text.** Everything is in English. UI text goes through `h()` / `textContent`, never `innerHTML`.
- **Engine purity.** `src/engine/backdrops.ts` is pure and draws no rng (the default style is `fnv1a(unitId) % n` in registry order, like `handOf`). No seeded test may move.
- **Read by field, never by id.** Code reads locations by `perUnit` and the `background*` fields, styles by registry order, backdrops by `kind` / `surface` / `finish`. No code names a location, style or backdrop id.
- **Art never gates anything** (P17c ruling). A missing file or one that fails to load is never an error, never a toast and never withholds a scene: the scene screen tries the candidates in order and ends at the ASCII stage that exists today.
- **Assets are local.** Paths are extension-relative and go through `assetUrl`; nothing loads from the network; `style.css` gets no `url(`.
- **Motion.** The pan asks `motionReduced(settings)`; reduced motion shows the centre, no listener.
- **P7a.** The QUARTERS select carries `data-analyze` (`glossary:quarters`) and the glossary gets the entry.
- **Memory check (CLAUDE.md).** Nothing is remembered: choosing a room style is a cosmetic setting of the player, not an event the squad could witness. No `memoryRules` entry, no journal or chronicle line. The only text that reaches a prompt is the style's `summary` in the existing `scene_header` provider (a place description, not a memory).
- **Pronouns.** The commander gets no pronoun in any new text (lore §0).

## Where the plan rules

- **The asset set (author drop of 2026-11-20).** Output names:

  | incoming | output (`content/core/art/backdrops/`) | used by |
  |---|---|---|
  | `room_commander` | `loc_quarters_commander` | `quarters_commander.background` |
  | `cafeteria` | `loc_mess_hall` | `mess_hall.background` |
  | `infirmary` | `loc_medbay` | `medbay.background` |
  | `workshop`, `garage`, `comms_room` | `loc_workshop`, `loc_garage`, `loc_comms_room` | `.background` |
  | `training_ground_day` / `_evening` | `loc_training_yard_day` / `_evening` | `background` / `backgroundEvening` |
  | `perimeter_day` / `_evening` / `_night` | `loc_perimeter_*` | `background` / `backgroundEvening` / `backgroundNight` |
  | `roof_day` / `_evening` / `_night` | `loc_roof_*` | the same |
  | `room_1`…`room_6`, `room_cruel`, `_cute`, `_dark`, `_japanese`, `_messy`, `_rich`, `_science`, `_spiritual` | `quarters_<name>` | `quartersStyles[].background` |
  | `floor_*` | `floor_*` | `backdrops` kind `surface` |
  | `ceiling_*`, `ceiling_additional_1/2` | `ceiling_*`, `ceiling_bright_1/2` | `backdrops` kind `surface` |
  | `ceiling_sky_day_regular` / `_cloudy`, `ceiling_sky_night` | `ceiling_sky_day`, `ceiling_sky_day_cloudy`, `ceiling_sky_night` | `backdrops` kind `surface`, `finish: sky` with `slots` |
  | `pov_under_desk`, `bars_regular`, `bars_modern`, `pov_wall` | `frame_under_desk`, `frame_cage_bars`, `frame_cage_clinical`, `pov_corner` | `backdrops` kind `frame` |
  | `hallway_1` / `_2` | `place_corridor_1` / `_2` | `backdrops` kind `place` (0.2.1) |

- **Normalizing.** Opaque images become exactly 3072×1280: the Kontext outputs (3136×1344) are **resized non-uniformly**, not cropped (measured: their details line up with the day image only when stretched back). WebP quality 82 (≈ 200 KB a file). Frames keep their alpha: `bars_regular` loses its bottom crossbar (the rows that are fully opaque at the bottom: P17c's placement rule wants the bars to run past the bottom edge), `pov_under_desk` is trimmed to its alpha bounding box. Frames are not resized.
- **Slot to file.** morning, afternoon → `background`; evening → `backgroundEvening` else `background`; night → `backgroundNight` else `background`. A file chosen for its slot (`backgroundEvening` at evening, `backgroundNight` at night) is **slot-specific**; any other file gets the CSS light of the slot (`evening`: a warm dim, `night`: dark and warm; P17c §4). `quartersStyles` have one background (indoor), so they always take the light.
- **Quarters.** The owner is the first participant (as the scene header already does). Candidates: her style's `background`, then the location's own files, then the ASCII stage. `quarters_unit` keeps no `background` of its own (a scene there always has an owner).
- **Default style.** `fnv1a(unitId) % n` over `quartersStyles` in registry order (the `handOf` rule); `unit.quarters` wins when it names an entry. Named units only (a grunt has no quarters scene). `squad/set_quarters` is allowed during an expedition (it changes nothing but the style), like `squad/set_hand`.
- **Finishes (data only, for P17c).** Locations and styles declare `floor` / `ceiling` finishes (draft below); a `backdrops` surface entry has `surface: 'floor' | 'ceiling'`, `finish` and optional `slots`. The two day skies are two entries of the same finish; which one a scene uses is P17c's call. Nothing in 0.1 reads them; a test checks that every finish a location or style declares has at least one surface.

  | location | floor | ceiling |
  |---|---|---|
  | `quarters_commander` | `wood` | `room_1` |
  | `mess_hall`, `medbay`, `comms_room` | `linoleum` | `office` |
  | `workshop`, `garage` | `concrete` | `technical` |
  | `training_yard`, `perimeter`, `roof` | `concrete` | `sky` |

- **Full-bleed.** Only when an image loaded: the background covers the whole scene screen (`background-size: cover`, so at 1920×1080 a 3072×1280 file is 2592 px wide and 672 px can pan), a gradient of `--alius-bg` darkens the top (header) and the bottom (transcript and input), the stage loses its border and grows, the transcript gets a translucent `--alius-bg` panel. Without an image the screen is exactly today's (ASCII in the bordered stage). The background opacity rule (0.55) goes; legibility comes from the gradient and the panel.
- **Pan.** Pointer x over the scene → `--alius-pan` 0…1 → `background-position-x`; eased by a CSS transition (0.8 s). Start and reduced motion: 0.5. Turning toward the door (P17c) is not in this package.
- **Loading.** The UI preloads candidates with an injectable `loadImage(url): Promise<boolean>` (default: `new Image()`, `onload` → true, `onerror` → false) and shows the first that loads; a redraw whose candidate list did not change keeps the shown image (no flash). A result is cached per URL for the session.

## File Structure

- Create: `scripts/art/backdrops.py`, `src/engine/backdrops.ts`, `content/core/quartersStyles.json`, `content/core/backdrops.json`, `content/core/art/backdrops/*.webp`, `tests/engine/backdrops.test.ts`, `tests/content/backdrops.test.ts`, `tests/ui/sceneBackdrop.test.ts`, `docs/MANUAL_TEST_P10c.md`.
- Modify: `src/content/{types,schemas}.ts`, `content/core/{manifest,locations,glossary}.json`, `src/engine/state/types.ts` (`Unit.quarters`), `src/engine/actions/immersion.ts`, `src/engine/dispatch.ts` (expedition-open prefix), `src/ui/scene/sceneScreen.ts`, `css/60-scene-comms.css`, `src/ui/squad/squadTab.ts`, `src/app.ts` (`onSetQuarters`), `src/scene/context.ts`.
- Remove: `content/core/art/incoming/`.

## Review Focus

- No code reads a location, style or backdrop by id; no rng; no seeded test moved.
- Every file a registry names exists, every file in `art/backdrops/` is named by a registry.
- A broken or missing file falls through to the next candidate and finally to the ASCII stage, with no toast.
- The text stays legible over the brightest backgrounds (`roof_day`, `quarters_rich`) in all three palettes and in readable mode.

## Chunk (a) — the whole package

### Task 1: Schemas, registries, `Unit.quarters`, the resolver and the action

**Files:** `src/content/{types,schemas}.ts`, `src/engine/state/types.ts`, `src/engine/backdrops.ts`, `src/engine/actions/immersion.ts`, `src/engine/dispatch.ts`, `tests/engine/backdrops.test.ts`.

- [x] Write failing tests (`tests/engine/backdrops.test.ts`, registries built in the test):
  - `quartersOf`: the hashed default is stable and in range; a stored valid `unit.quarters` wins; an unknown stored id falls back to the default; a grunt or unknown unit → `null`; an empty registry → `null`.
  - `sceneBackdrop`: slot mapping (morning/afternoon → `background`; evening → `backgroundEvening` slot-specific, else `background` not slot-specific; night likewise); a `perUnit` location with an owner puts her style first and the location's files after; no owner → the location's files; nothing declared → `[]`; duplicates removed.
  - `squad/set_quarters`: sets `unit.quarters`; rejects an unknown style, an unknown unit, a grunt, a bad payload; it is allowed during an expedition.
  - Schemas: a location with `backgroundEvening`, `floor`, `ceiling` parses; a `quartersStyles` and a `backdrops` entry parse; a surface without `surface`/`finish` is rejected.
- [x] Run them, see them fail.
- [x] Implement: `LocationSchema` gains `backgroundEvening`, `floor`, `ceiling` (strings); `QuartersStyleSchema` `{ id, name, summary, background, floor?, ceiling?, description? }`; `BackdropSchema` `{ id, kind: 'surface' | 'frame' | 'place', file, surface?, finish?, slots? }` with a refine (a surface needs `surface` and `finish`); both registries added to the registry list and `registrySchemas`; `Unit.quarters?: string`; `src/engine/backdrops.ts` exports `quartersOf`, `sceneBackdrop` → `Array<{ file: string; slotted: boolean }>`, `slotLight(slot)` → `'day' | 'evening' | 'night'`; `squad/set_quarters { unitId, styleId }` beside `squad/set_hand`, and its prefix in `EXPEDITION_OPEN_PREFIXES`.
- [x] Tests pass, `npm run typecheck` clean. Tick, commit.

### Task 2: The assets and the data

**Files:** `scripts/art/backdrops.py`, `content/core/art/backdrops/*.webp`, `content/core/{quartersStyles,backdrops,locations,manifest}.json`, `tests/content/backdrops.test.ts`.

- [x] Write the failing test (`tests/content/backdrops.test.ts`, core registries): every `background*` of a location, every style `background` and every backdrop `file` exists on disk; every file in `content/core/art/backdrops/` is named by some entry; every opaque backdrop is 3072×1280 (read from the WebP header); every `floor` / `ceiling` finish a location or style declares has a surface entry; `quartersStyles` has 14 entries; `content/core/art/incoming/` does not exist.
- [x] Run, see it fail.
- [x] Write `scripts/art/backdrops.py` (the mapping table above; the normalizing rules; prints a size report; `--dry-run`), run it, check the report and look at a contact sheet of the output.
- [x] Write `quartersStyles.json` (14 styles: name, a one-line `summary` of what the room looks like for the model, background, finishes) and `backdrops.json`; fill `locations.json` and the manifest.
- [x] Remove `content/core/art/incoming/`.
- [x] Tests pass. Tick, commit (the WebP files with it).

### Task 3: The scene screen

**Files:** `src/ui/scene/sceneScreen.ts`, `css/60-scene-comms.css`, `tests/ui/sceneBackdrop.test.ts` (the old background test in `tests/ui/scene.test.ts` is updated to the new loader).

- [x] Write failing tests (jsdom, `loadImage` injected):
  - the first candidate that loads is shown and the scene root gets `data-backdrop="image"`; a failing first candidate falls to the second; all failing → the ASCII stage, `data-backdrop="ascii"`, no toast;
  - a slot-specific file gets no `data-light`; a base file at evening / night gets `data-light="evening"` / `"night"`;
  - her quarters use her style's file; changing the style and redrawing swaps the image; a redraw with the same candidates does not reload;
  - pointer movement sets `--alius-pan`; under reduced motion it stays `0.5` and no listener is attached.
- [x] Run, see them fail.
- [x] Implement: `SceneScreenCtx.loadImage?`; the background element moves to the scene root (behind everything), the stage keeps the sprites and caption; the CSS for `[data-backdrop="image"]` (cover, gradient, translucent transcript, borderless stage, light filters from palette variables, `transition` on the pan only when motion is allowed).
- [x] Look at it: screenshots at 1920×1080 and 2560×1440 of a bright and a dark room, day and night, all three palettes and readable mode; text contrast holds.
- [x] Tests pass. Tick, commit (with `style.css` and `dist/`).

### Task 4: QUARTERS in the dossier, the glossary, the model's view of her room

**Files:** `src/ui/squad/squadTab.ts`, `src/app.ts`, `content/core/glossary.json`, `src/scene/context.ts`, tests beside the existing ones (`tests/ui/squad*.test.ts`, `tests/scene/context*.test.ts`).

- [x] Write failing tests: the dossier of a named soldier shows a QUARTERS select (registry order, current style selected, `data-analyze="glossary:quarters"`), a change calls `onSetQuarters`; none without `onSetQuarters`; the `scene_header` of a quarters scene reads `{name}'s quarters ({summary})`; other locations are unchanged.
- [x] Run, see them fail.
- [x] Implement; glossary entry `quarters` (term, short, long marked `AUTHOR TO WRITE:` as the others); `app.ts` dispatches `squad/set_quarters`.
- [x] The analyze coverage test passes. Tick, commit.

### Task 5: Docs and hand-offs

- [x] `docs/MANUAL_TEST_P10c.md` (in SillyTavern: every location in every slot, three quarters, a broken file renamed away, reduced motion, readable mode, a narrow window).
- [x] An **Implemented as** section at the end of this plan (it is the spec); overview §9 (a row for P10c), §5.4 (`quartersOf`, `sceneBackdrop`, `squad/set_quarters`, registries `quartersStyles` and `backdrops`), §5 file list if needed; a **Interfaces already provided by P10c** note in P17c (the registries, the finishes, the frames, the full-bleed stage).
- [x] `CLAUDE.md`: one rule line for P10c (read by field, art never gates, the asset script).
- [x] `npm test` green; tick, commit, push.

## Implemented as

**Status: implemented** (2026-11-20). There is no separate package spec: this plan is the spec. Where it differs from the draft above, the code wins.

- **Assets.** 50 author PNGs (285 MB) became 50 WebP files (7 MB) in `content/core/art/backdrops/` through `scripts/art/backdrops.py` (Python 3 + Pillow, run with `python3 -I`). The cage frames needed a step the plan did not foresee: the author's colour-to-alpha cut left a haze in the gaps (alpha 18–25 on the clinical cage, 3–9 on the old one, tinted by the magenta key), so `clean_alpha` zeroes alpha below 48 and stretches the rest, and `despill` caps red and blue near green on the soft edges of the clinical cage. `pov_wall` (`pov_corner`) is opaque, so it is a `place`, not a `frame`. The git history still holds the 285 MB of PNGs (commit `e168198`); SillyTavern installs extensions with a shallow clone, so players download only the WebP.
- **Data.** `quartersStyles` (14, described; `summary` for the model, `description` for the player, `floor` / `ceiling` finishes) and `backdrops` (hidden: 13 floor/ceiling surfaces by `finish`, three skies with `slots`, two cage frames and the desk frame, `pov_corner`, two corridors). `locations` gained `backgroundEvening`, `floor`, `ceiling`; `quarters_unit` has no `background` of its own (a scene there always has an owner; without a style it falls to the ASCII stage).
- **Engine.** `src/engine/backdrops.ts`: `quartersOf`, `sceneBackdrop` → `{ file, slotted }[]`, `slotLight`. `squad/set_quarters { unitId, styleId }` (event `quarters_set`, reserved) beside `squad/set_hand`, open during a run.
- **Scene screen.** A root-level `.alius-scene-backdrop` (the image), `data-backdrop="image" | "ascii"` and `data-light="evening" | "night" | "day"` on `.alius-scene`; the ASCII art stays in `.alius-scene-bg` inside the stage. The scene spreads under the view's side padding (`margin: 0 -12px`); the shell's own padding and frame stay around it. `--alius-pan` follows the pointer over the whole scene width (0…1, two decimals); the CSS eases it (0.8 s, none under `alius-reduced-motion`). The loader caches each URL's result for the session; a test passes its own `loadImage`, which is never cached.
- **Knee-length sprites.** Over a picture the sprite layer is not clipped by the stage: `placeSprites` measures the gap from the stage's bottom to the transcript's top (the HUD's height varies) and extends the layer down by it plus `SPRITE_TUCK` (14 px), so the cut sits behind the transcript panel; the sprite image fades out over its last 28 px (`mask-image`) so no hard line shows through the panel's translucency. Re-measured on every refresh and on a resize (`ResizeObserver`). The rows below the stage get `z-index: 1` by class (not by a sibling selector, which would move the absolutely placed cut-in).
- **Prompt.** `scene_header` reads `{name}'s quarters ({summary})`. The pronoun test covers the summaries.
- **Not done here (open items):** turning the pan toward the door when a visitor enters, props, the 0.2 places `medbay_exam` / `medbay_exam_lying` / `comms_console` (no art yet), anything that reads `backdrops` (P17c), a hub map (a separate SVG mini-package, see `docs/00-overview.md` §10).
