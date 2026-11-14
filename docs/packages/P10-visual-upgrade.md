# P10 — Visual Upgrade: Hub, Device Skins, Voices

**Status: implemented** (plan: `docs/plans/2026-11-14-p10-visual-upgrade.md`; see **Implemented as** at the end; where it differs from the draft, the code wins). **Depends on:** P0–P6 (UI shell as implemented). Independent of P7–P9 except the CMDR card styling. **Read:** overview; this file. **Visual reference:** canvas "Alius — main screen directions" (claude.ai artifact): direction **C** (hub + PDA pulled up) is chosen; the Kestrel-Ward and Vesper device skins are the reference for skins.

## Goal

Replace "ASCII everywhere" with layered visual languages that carry meaning, while keeping the terminal vibe: a **hub** as the home screen, the **PDA as a physical device** pulled over it, **faction skins** for the device, distinct **voices** for different sources, terminal-styled portraits, semantic colour, motion and sound.

## 1. Hub (new home screen)

- Base cross-section: author art `content/core/art/hub/base.png` (with time-of-day variants optional). Fallback: the blueprint-style CSS cross-section from direction A.
- Room hotspots from registry `hubRooms` `{ id, facilityId?, rect (relative %), label, sceneLocationId }`. Click → room panel: who is there, available activities, start scene.
- Unit markers in rooms (where they are this slot: from P2 schedules/activities). Marker ring colour = semantic state (§5).
- Right column: **current objective** (P11 provides the data; until then a stub from director missions), "Tonight" list (unit requests, DMs, warnings), `OPEN PDA [TAB]`, `END {SLOT}`.
- Top bar: day/slot, resources, Leash authorizations.

## 2. PDA as a device

- Opening the PDA slides the device up over the hub (direction C). Escape/Tab closes. All existing tabs live inside its screen.
- Registry `deviceSkins`: `{ id, name, kind: 'css'|'image', cssPreset?, frameImage?, screenRect {x, y, w, h} (px in frame image space), ledColor, accent, bindTo: { corporationId? | traitId? | unlockFlag? } }`.
- v1 CSS presets (port from the canvas): `ccp_standard` (worn olive-grey, rubber bumpers, screws, stickers), `kestrel` (steel, hazard stripe, hex bolts, grime), `vesper` (white ceramic, teal light ring, no screws). Skin is chosen by the campaign's corporation; SYS lets the player override.
- `image` skins: author renders a front view with a transparent screen cut-out; the screen is positioned with `screenRect` and scaled with the frame. Optional texture overlay: a CC0 colour map blended (`overlay`/`multiply`) over CSS presets.
- Grain/noise via inline SVG filters is allowed; no external image requests at runtime other than extension files.

## 3. Voices

Every notification, message and document carries `voice`:

| voice | Used for | Look |
|---|---|---|
| `terminal` | CCP tools: squad, ops, map, base, inventory | phosphor monospace, box-drawing, scanlines |
| `corporate` | oversight messages, Leash approvals, corporate mail | light glossy card, clean sans (Inter), corporation logo text, cold |
| `paper` | dossiers, personnel files, sentence, LOG chronicle, intake forms (P11) | aged paper, typewriter font (Special Elite), stamps, handwritten notes, redaction bars |
| `personal` | DMs, unit notes | warm messenger, rounded bubbles, per-unit accent |

A `VoiceCard` component renders any of them; sources declare their voice in data.

## 4. Portraits

Terminal-styled portraits inside the PDA: ordered dithering (Bayer 4×4) of the unit's neutral expression sprite into the current phosphor palette, rendered on a canvas, cached per unit and palette. Toggle "dithered portraits" in SYS. Scenes keep full-colour art.

## 5. Semantic colour

CSS variables on top of the palette: `--alius-danger`, `--alius-trust`, `--alius-affinity`, `--alius-bond`, `--alius-warn`. They must differ in **lightness**, not hue alone (colour-blind safe). Used for unit marker rings, small pips and bars — never as the only carrier of meaning (add a glyph or label).

## 6. Motion & sound

- Motion: PDA boot sequence on open (≤ 600 ms, skippable by keypress), glitch transition between tabs, typing effect (existing). All motion honours `prefers-reduced-motion` and a SYS toggle.
- Sound: small UI set (open, close, tab, notify, alert, stamp, typing tick) + optional ambient hum; master volume and mute in SYS; default volume low. Files are author-supplied or CC0, shipped in `content/core/audio/`.
- Fonts: bundle the OFL fonts (IBM Plex Mono, Saira Stencil One, Inter, Special Elite) as woff2 in the extension; no runtime Google Fonts requests.

## 7. Readability mode

One SYS switch "Readable mode": disables scanlines, flicker, dithering and glitch; raises font size one step. Text contrast ≥ 4.5:1 in every voice.

## Acceptance criteria

1. The hub is the home screen; rooms, markers, objective/tonight panels and resources render; works with and without hub art.
2. The PDA slides over the hub and contains all existing tabs unchanged in behaviour.
3. Three CSS skins render; skin follows the corporation; an `image` skin with `screenRect` positions the screen correctly at two window sizes.
4. Each of the four voices renders through `VoiceCard`; oversight messages use `corporate`, DMs `personal`, dossiers/LOG `paper`.
5. Dithered portraits render and are cached; toggle works.
6. Reduced motion and readable mode disable the specified effects.
7. No network requests besides extension files (fonts bundled).

## Author assets (can arrive later; fallbacks ship)

Hub cross-section art (+ optional time-of-day variants), device renders per skin with transparent screen, CC0 textures (optional), UI sounds.

## Interfaces already provided by P7a (implemented — use, do not rebuild)

- **The analysis panel** lives in `src/ui/analyze/` and `css/95-analyze.css`, a child of `#alius-shell`; it uses only palette variables (`--alius-fg/-dim/-bg/-accent`), so device skins that keep those variables recolour it, and its `z-index` (10) must stay above the modal layer. Restyle it with voices there; `renderPanel` builds text nodes only.
- **Marker classes** `alius-stat`, `alius-chip`, `alius-option` are reserved for analyzable elements; the hub, rooms and device chrome must mark their stats and options too (`analyzeAttrs` / `analyzeNative`).
- **Motion:** `analyzeAnimation: 'off'` and `prefers-reduced-motion` already show the panel text at once; the P10 reduced-motion setting should feed the same rule (`animationMs`). `[data-analyze]` elements show a help cursor and disable the touch callout.

## Implemented as

**Engine** (pure, no RNG, no state): `src/engine/hub.ts` — `fnv1a`, `whereabouts(state, reg)`. Campaign state is unchanged (`version: 1`, no new field, no migration).

**Content:** registries `hubRooms` (8 rooms), `deviceSkins` (3 css skins) and `uiSounds` (8 synthesized sounds; **not** player-visible: no description, not in `DESCRIBED_REGISTRIES`); glossary entries `hub`, `whereabouts`, `marker_tone`, `objective`, `tonight`, `end_slot`, `pda_device`, `away`, `semantic_colours` and `setting_<key>` for the seven new settings. `fonts/*.woff2` + `fonts/LICENSES/`.

**UI:** `src/ui/hub/{hubScreen,roomPanel,marker,model,art}.ts`; `src/ui/shell/{shell,router,keys}.ts` (the `hub` screen and the device layer); `src/ui/device/{skins,chrome,boot}.ts`; `src/ui/voice/{voiceCard,sources}.ts`; `src/ui/portrait/{dither,portrait}.ts`; `src/ui/sound/sound.ts`; `src/ui/motion.ts`; `src/ui/fx.ts` (inline-SVG noise). CSS: `css/01-fonts.css`, `12-motion.css`, `15-hub.css`, `16-device.css`, `17-skins.css`, `18-voices.css`, `00-vars.css` (font and semantic-colour variables). App: `app.talkAt(unitId, locationId)`, `app.endSlot()`.

**Settings** (global, SYS): `ditheredPortraits` true, `readableMode` false, `reducedMotion` false, `soundVolume` 20 (int 0–100), `soundMuted` false, `ambientHum` false, `deviceSkin` `''` (follow the campaign).

### What changed against the draft (rulings; the plan's "Where the plan rules on the spec" holds the full text)
- **Whereabouts are derived, not stored** (the engine has no schedules and activities name no room). Order: away on an expedition → injured → confined → duty in its slot → night → a weighted pick over open, built rooms (weight + 2 per liked tag) by FNV-1a of `day|slot|unitId`. No RNG is drawn; the same state gives the same answer on every redraw. Stored schedules are open item P10b.
- **Rooms by data, not id:** code reads `hosts`, `activityIds`, `sceneLocationId`, `facilityId`, `weights`, `likeTags`. The talk activity is found by what it does (`startsScene` + companion required), not by the id `talk`.
- **The PDA is a layer of the hub.** `ScreenId 'hub'`; `showScreen('pda')` = the hub with the device up, `showScreen('hub')` = device down. Both slide in place (nothing is rebuilt). `setDevice`, `isDeviceUp`, `registerHub`, `ShellDeps.{skin, sound, onDevice}`. Device width `clamp(720px, 55vw, 980px)`, full width at ≤ 1200 px.
- **Keys:** `Tab` toggles the device only from the shell root, the hub background or the page body: not from a control, not from inside the device (screen, panel, tab bar: the panel is focusable, so toggling there would make a tab's contents unreachable by keyboard) and not from a dialog such as the analysis panel (see `src/ui/shell/keys.ts`). A refresh keeps the focus on the same control (`renderKeepingFocus`) so the next `Tab` moves on instead of toggling; `Escape` closes modal → analysis panel → room panel → device; `1`–`8` on the hub open the device at that tab. Nothing fires while typing or with Ctrl/Meta/Alt; `Shift+Tab` never toggles.
- **Marker tone** `danger` > `bond` > `trust` > `warn` > `affinity` > `neutral`, always with a glyph (`! ♥ + ~ *` and `·`). The `affinity` tone uses the engine's `affinityBand === 'devoted'` (the plan named `valueBand`, which is for the −3…+3 value axes).
- **Tonight:** at most 6 items in the ruled order. The knock item reads night entries of kind `we_need_to_talk` (the plan said `talk`; that is the loyalty-sign kind that queues `we_need_to_talk`, and what the existing toast announces). Hidden kinds (desertion, mutiny, visit, need, withdrawal) show nothing.
- **Skins:** `pickSkin` precedence override → trait → flag (world or commander) → corporation → `ccp_standard`; `image` skins carry `frameSize` and position the screen by percent (`screenBox`); an image that fails falls back to the built-in `ccp_standard`. CSS presets key on `data-preset` (the skin's `cssPreset`), `data-skin` is the id.
- **Voices:** `VOICE_OF` is the one table of who speaks how; `renderVoiceCard`, `renderBubble`, `unitAccent` (6 fixed accents by FNV-1a of the unit id, each ≥ 4.5:1 on the bubble). Applied to COMMS (personal bubbles), LOG (paper posts, corporate oversight log), the oversight form (paper form, corporate verdict card headed `{CORPORATION} · OVERSIGHT`), the SQUAD unit header, CMDR card and COMMANDER FILE header (paper), the hub's oversight card and the Leash toasts (corporate). The analysis panel stays terminal.
- **Portraits:** Bayer 4×4 into three levels (`--alius-bg`, `--alius-dim`, `--alius-fg`), cached per `cardRef|palette|size`; a tainted or missing canvas keeps the plain image and is not retried for 30 s. Off in readable mode.
- **Sound:** synthesized with WebAudio from `uiSounds` (an entry's `file` is played instead when present and it loads); the `AudioContext` is made on the first play; effective gain = volume/100 × entry gain; typing ticks ≤ 1 per 60 ms; the hum is synthesized only and follows volume and mute.
- **Motion and readability:** `motionReduced(settings)` (setting OR `prefers-reduced-motion`) and `visualFlags(settings)` are the only readers; the boot is ≤ 600 ms and skippable; the tab glitch is 120 ms and off in readable mode and under reduced motion.
- **Semantic colours:** the five tones are the same in all three palettes (`danger #fc2200`, `trust #3b97ff`, `warn #ec9616`, `bond #fda4c9`, `affinity #fed300`): ≥ 4.5:1 on every background and adjacent lightness steps ≥ 1.25:1 (the plan's draft values did not meet the lightness rule).
- **Fonts:** IBM Plex Mono, Saira Stencil One, Inter (SIL OFL) and Special Elite (**Apache-2.0**, not OFL as the draft says; its licence text is shipped as is). No network request other than extension files; `tests/assets.test.ts` guards it.

### Non-obvious things to know before touching P10 code
- The shell **places** the device (after the hub host) and never rebuilds it on `refresh()`; a hub renderer fills its own host and must not move the device (a move would drop the focus inside it, e.g. in the DM box). `refresh()` redraws the hub host and the status; the selected **tab is drawn only while the device is up** (a tab renderer may mark messages read or clear a badge, which must not happen unseen) and again when it is raised. The casing's panel has 56 px of bottom padding because the device bleeds 40 px off the bottom edge.
- `showTab(id)` before `open()` sets the route to `'pda'`, so `open()` lands on that tab with the device up.
- The boot overlay (`.alius-boot`) exists for 600 ms after the first device-up of each `open()` (not under reduced motion). Tests that raise the device and use fake timers should expect it.
- `VoiceCard`s are `article`s: select `article.alius-unit`, not bare `article`. Older per-screen colour rules with the same specificity but a later position in `style.css` beat the voice colours (this happened twice); voice rules use two-class selectors.
- Descendants of the light voices (corporate, paper) are recoloured to the voice colours in `css/18-voices.css` (amber on paper is ~1.5:1); a new element class that carries a phosphor colour needs the same treatment there. `style.css` must not contain `url(` with a scheme or `//` (the paper fibre is an inline SVG layer, not a data URL).
- `HubCtx.settings` is passed but not read yet; `peekHubArt` lets a redraw show known art at once.
- The device is `inert` and `aria-hidden` while down; the hub's `[data-open-pda]` button gets the focus back.
- Whereabouts must stay derived and stateless: do not store a room on a unit; P10b may replace step 5 with a schedule.

### Open items
- **Stored schedules** for whereabouts (P10b); **hand fonts** for paper notes (P10b); the personal accent as data (P10b).
- **Author art** (fallbacks ship): hub base `content/core/art/hub/base.png` and slot variants `base_<slot>.png`, `image` skin frames and the optional CC0 overlay, audio files under `content/core/audio/`. None is in the repository.
- **Objective** is a stub (`currentObjective`): P11 replaces the body and keeps the signature.
- **DM-arrival toast:** the app has none (a DM only raises the COMMS badge), so the personal voice is applied to the COMMS thread but there is no toast to re-voice.
- The `leash_refreshed` toast is voiced corporate in code but not covered by an app test (the day-end hook does not run in the scripted app).
- `likeTags` on rooms are free-form lowercase tags matched against `unit.likes`; no vocabulary exists, so authors should align them with the tags the import produces.
- The hum ignores an entry's `file`. Not yet run by hand in SillyTavern: see `docs/MANUAL_TEST_P10.md`.

