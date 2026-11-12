# P10 — Visual Upgrade: Hub, Device Skins, Voices

**Depends on:** P0–P6 (UI shell as implemented). Independent of P7–P9 except the CMDR card styling. **Read:** overview; this file. **Visual reference:** canvas "Alius — main screen directions" (claude.ai artifact): direction **C** (hub + PDA pulled up) is chosen; the Kestrel-Ward and Vesper device skins are the reference for skins.

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
