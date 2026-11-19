# P17c — Immersion: Input, Device, Scene Staging and Art

**Status: spec.** Release 0.2 (post-release), after P17b. **Depends on:** P15a (blocking, moments, contact physics), P17b, P17, P16, P15, P10 (shell, device, portraits, `visualFlags`, sound), P10b (handwriting, device marks), P9c (intercepts, device access), P5 (world map, runs), P14, P7a. **Read:** overview; P15–P17b; this file; the **Implemented as** of P10 and P9c.

**Analysis tool (P7a)** rules apply.

## Goal

Blur the line between the player and the commander **inside the fiction**: the interface is the commander's device and body, so her power changes how the player writes, sees and moves. Author ruling: the player becomes the commander; nothing here reaches into the player's real life (no real-world clock, no absence tracking).

## 1. Input

- **Gag:** under a gag rule or in `pet_play` the player's text is **garbled before sending** (muffled sounds, broken words); how much passes depends on her rule. The model receives the garbled text and a directive.
- **Gestures:** registry `gestures` (nod, shake head, kneel, point, wait, signal, …) and a gesture menu. Under a no-speech rule "Send" becomes "Gesture": text goes as action only; direct speech in quotes is a slip. The same menu serves quiet communication in runs (§5).
- **Dictation:** her dictated sentence appears as a template; the player types it; the engine compares (tolerant to case and punctuation) and reports errors as slips (P17b §10, §12).
- **Real stillness** (setting `immersiveStillness`, default off): in stagings with `stillness` or silence, a countdown runs in which typing raises Strain and sending is a slip.

## 2. The device

- **Passcode:** she locks parts of the PDA (DM, OPS, BASE) with a code she **says in a scene**; the player must read and enter it; as a punishment she changes it without telling.
- **Incoming through her:** messages from others arrive already read by her ("read: Rhea"); some show "deleted by her" (extends P9c from outgoing to incoming).
- **Her notes in the dossier:** her handwritten margin notes on the CMDR file (P10b handwriting); her assessment gradually replaces the corporate one.
- **The game's voice becomes hers:** at a high hold, toasts, notices and the **objective list** speak in her voice (`VOICE_OF`): "Today: my boots. Report at 21:00."
- **Permissions in the interface:** at a high hold, chosen actions (start an expedition, open another woman's DM, spend credits) show her permission request; she answers by style, at once or later.
- **Session rituals** (setting, default on with the dynamic): when the game opens, the interface waits for a greeting in her form (at `role`+); leaving can be asked for; leaving silently is remembered at the next session (a fact, no real-time tracking).

## 3. The body in the interface

Visible results of **statuses** set by the engine (not an inner meter; P15 ruling): sleeplessness darkens and blurs the screen edges slightly; hunger makes input stutter now and then; the shock collar flashes a glitch and a sound. All respect `motionReduced` / `visualFlags`.

## 4. Scene staging with the existing art

- **Light and state:** CSS filters over the room background: night (warm, dark), alarm (red), sensory control (near black, silhouettes; P17 obscured layer), hold (edges dim).
- **Entries from the door side:** each room declares its door side; a visitor slides in from it, partly off-frame, and leaves the same way; the holder stands centre, an audience at the sides, dimmed.
- **Expression by situation:** her expression is chosen by the situation (bored or neutral in object time, pleased after good service, by style when begged) through `emotion_pick` or a direct pick.
- **CSS camera** (sprites are knee-length): *from below* (her sprite larger and higher, face near the top edge), *close* (face and shoulders), *ignored* (smaller, off-centre, out of focus), *normal*. Chosen by the engine from the situation.
- **Panning:** wide backgrounds (≈ 21:9) pan slightly with the pointer and turn toward the door when a visitor enters; off under reduced motion.

## 5. Art slots (all optional; a missing file falls back to §4)

- **Backdrops and frames** (registry `backdrops`: `{ id, kind: 'room' | 'frame' | 'surface' | 'derived', file?, use: situation[], fallback }`). Room-bound views are built on **the current room**, never baked into a picture, so one asset serves every room:
  - **frames** — a cut-out picture laid over the current room background, which is lowered, blurred as depth of field and darkened at the top: `frame_under_desk` (the underside and side panels of a desk; the author has one), `frame_cage_bars` (cage bars). Fallback: a drawn SVG frame (only if no file). **Placing a frame:** scale it uniformly (never stretch one axis), wider than the frame so its outer edges leave it, with the top lip just above the top edge and the legs running past the bottom edge, so it never stands on the room's floor in mid-air.
  - **derived** — no picture at all: `pov_floor` (the room background lowered, heavily blurred, a floor gradient at the bottom), `pov_corner` (one generic wall with a baseboard, tinted to the room's wall colour), `pov_dark` (CSS).
  - **surfaces** — `floor_<type>` and `ceiling_<type>`, where `<type>` is a **kind of room finish**, not a room (draft from the author's art: floors `wood`, `linoleum`, `concrete`, `tatami`; ceilings `dark`, `technical`, `office`, `room_1`, `room_2`, `rich`, `japanese`), matched to rooms by data (a room declares its floor and ceiling type). **Both are angled, as seen from the knees** (author ruling 2026-11-19: the image models generate floors in perspective, and that is what a kneeling commander with lowered eyes sees). No top-down floor is needed: for `bowing` / `lying_front` (the floor inches from the face) the same angled floor is heavily blurred and darkened. `feet_floor` pose shots are generated at the same angle (from above, high angle) and placed in the **lower third** of the floor, where the perspective is nearest; the far part may be darkened; a small mismatch is corrected with a CSS `perspective` + `rotateX` of a few degrees, never more. Ceilings serve looking up from the knees and lying on the back (`from_below`, `boot_on_chest`); for straight overhead use the ceiling's upper part (no separate `_straight` file needed). Fallback: the top of the room background, scaled and blurred.
  - **Aesthetics of the base** (author ruling): the base has been lived in for a long time and the apocalypse is biological, not ruin; rooms are about **80 % lived-in and personal, 20 % near-future military** (`technical` for the garage, workshop and corridors; `office` for briefing, medbay, comms; `room_*` for quarters; `rich` and `japanese` for corporate places or a woman's personal taste). Creative freedom in finishes is allowed.
  - **places** — pictures of their own: `medbay_exam`, `medbay_exam_lying`, `comms_console`; later (0.3) `field_camp`, `settlement`, `ruins_interior`.
  - **Rooms** carry data for this: floor type, ceiling type, door side (`left` / `right` / `center` / `offscreen_left` / `offscreen_right`), wall tint.
  - **Visitors in low views:** sprites are knee-length, so in views from below (under the desk, the floor, the cage) a visitor is **off-frame** (voice and narration only) or a **blurred general silhouette**, never a full sprite.
- **Her room from layers:** one base background + **props** with transparency (cage, mat by the bed, the commander's boots, a second mug, a collar on a hook) placed by data (`{ prop, x, y, scale, layer }`) per room variant chosen by the P15 frame; an optional per-unit room override.
- **Pose shots per unit** (registry `poseShots`, optional): `{ kind, file, variant?: 'barefoot' | 'legwear', expression?, anchor, underlay }`. Kinds and what they are:
  - `from_below` — she stands over the viewer and looks down (kneeling, protocol, begging); underlay: the ceiling surface.
  - `face_close` — her face close, leaning in (orders up close, dictation); underlay: the blurred room.
  - `hand_down` — her hand reaching down to the viewer (chin, collar, "get up"); underlay: the ceiling surface.
  - `legs_standing` — her legs and boots close, standing (kneeling before her, boot care); underlay: the blurred room, lowered.
  - `legs_seated` — her legs close, seated (under the desk, footrest); underlay: the blurred room, lowered.
  - `back` / `over_shoulder` — from behind (indifference, leaving; a staging with a visitor at the door); placed like a sprite.
  - `feet_floor` — the viewer looks down at the floor: her bare (or stockinged) feet and shins right in front (kneeling, eyes down, object time, foot care); underlay: `floor_top`.
  - `feet_overhead` — the viewer looks up: her raised foot hangs over the viewer, sole to the camera, with or without her face (the hardest moments, punishment, object time, `pet_play`); underlay: the ceiling surface.
  - `feet_dangling` — the viewer at the height of her knees: she sits with crossed legs and the upper foot dangles in front (under the desk, service, waiting at her feet); underlay: the blurred room, lowered.
  
  **Composition rule:** every pose shot is generated on a plain background and cut out; the game always composes it as a layer over an underlay of **the current room** (a surface backdrop or the room background, blurred as depth of field and tinted by the scene light), never with a background baked into the image, so the room always matches. Chosen by situation; absent → the CSS camera.
- Assets load only from local paths (`AppDeps.assetUrl`); nothing from the network (`tests/assets.test.ts`). A documented generation guide (resolution, tags, ControlNet tips, background removal) goes into `docs/content/`.

## 6. Map and runs

- **Her marks on the world map** (P5) with the `command` domain: her colour and hand mark allowed regions and missions she approved; missions she cancelled are struck through.
- **Quiet mode in runs:** gestures only, a darkened backdrop and no UI sounds at ambush and infiltration nodes (P20 when it exists; P5 elite/unknown nodes until then); breaking silence raises the alarm.

## Depth revision (design session 2026-11-19)

Added after the 0.2 depth review; built on P15a (blocking, moments, contact physics). Where it conflicts with the sections above, this section wins.

- **Reading over the shoulder.** At high hold with speech rules: forbidden words are **struck through in the input while the player types** (a local check against the rules, no model); above the field a short reaction of hers to the draft sometimes appears ("she smirks", "she waits"), from simple features (length, address, forbidden words). The commander has not sent anything and she already sees it.
- **Her toy in public.** With `remote_toy` worn (P15a §4), she drives it from **her** PDA, also when she is not in the scene: at each pulse the player's **input is jolted** (letters doubled or shifted at the pulse moment; the typos go into the message unless corrected). The model receives the text as it is; others present notice oddities (P17 suspicion). Pulses follow her rhythm (P15a §9) and style.
- **The gaze rule.** "Not above the knees", "eyes on the floor", "only at me": her portrait is **cropped** to what the commander may look at. The crop is found without models: the opaque bounding box from the PNG alpha, standard proportions inside it for knee-length sprites (eyes ≈ 8 %, chest ≈ 25 %, waist ≈ 45 %, thighs ≈ 60–100 %), and a per-sprite manual override (four draggable lines in the dossier, stored on the unit). Knee-length sprites have no feet: "feet only" needs the `feet_floor` pose shot; without it the view is thighs and knees over a floor gradient. Raising the gaze is a moment option and a slip.
- **§1 gag, gestures** and **§4 camera, light, pose shots** become P15a effects (`input`, `gestures`, `camera`, `filter`, `pose_shot`, `backdrop`) read from the blocking.
- The sprite and pose-shot list for the contacts is to be decided after the docs (P15a open decisions).
- **Memory check:** typed slips under jolts feed P17 suspicion and her discipline at their own sites; nothing new is remembered.

## Acceptance criteria

1. Gag garbling, the gesture menu, dictation and (when enabled) real stillness work and feed slips and Strain.
2. Passcodes, incoming reads and deletions, dossier notes, her voice for system texts, permission requests and session rituals work.
3. Status effects on the interface follow statuses and respect reduced motion.
4. Light, door-side entries, situational expressions, the CSS camera and panning work with knee-length sprites.
5. Every art slot is optional with a working fallback; props compose a room by data; pose shots place by anchor and mode.
6. Map marks and quiet mode work.
7. No network loads; every element carries `data-analyze`.

## Interfaces already provided by P10b (implemented — use, do not rebuild)

- **Handwriting:** `handOf(state, reg, unitId)` (the stored `unit.hand`, else the hash of her id over the `handFonts` registry order), `handFamily`, action `squad/set_hand`. A UI element wears a hand by setting `--alius-font-hand: "<family>", var(--alius-font-type)`; `.alius-note .alius-note-body` reads it first and readable mode swaps it for the type font. `renderNote({ text, unitName, hand, read?, onRead?, analyze })` and `renderRuleNote` are the note cards (paper voice, text only).
- **Notes are data:** `CampaignState.notes { seq, list }`, registry `handNotes` (`where` quarters / gear / door, `when` minAccess / tiers / wantBands / states / trigger), `notesFor`, `unreadNotes`, `writeDoorNote`, `notesDayStep` (hash gate `fnv1a(day|unitId|noteId)`, no RNG), action `notes/read`. A passcode, a dictation result or a session ritual that wants her note adds an entry or a trigger there; it does not draw from `ctx.rng`.
- **The device layers:** the casing is dressed once; `ShellDeps.marks(layer)` draws a layer inside the device (under the screen, `aria-hidden`, `pointer-events: none`) on every refresh: put gesture marks, a gag mark or a map mark there, never a control. `deviceSkins[].stickerSpots` says where stickers sit (percent of the device); `renderMarks`, `stickerFor`. Every PEEL goes through `app.confirmPeel` (a `shell.modal`, then `device/remove_decor`).
- **HOME:** `TabId 'home'` is the first tab and the default, never locked (`KEY_TABS` keeps `1`–`8`, `0` opens it); `renderHomeTab` shows the wallpaper, access lines and every note, and its badge is `unreadNotes`.
- **The night door:** `renderDoor(host, DoorCtx)` for every night entry outside `CONFRONTATION_KINDS`; one exchange through it (`night/door_say`, `night/door_reply`, `Comms.throughDoor`), `NightEntry.door`, setting `doorTimer`, `SoundId 'knock'`, `NIGHT_GAIN`, `Sound.setNight`, root `data-night` (kept in readable mode, which drops the dimming).
- **Living DMs and VITALS:** `dmBehaviours` (kinds `hesitate / deleted / burst / late / voice / curt`) are stamped once at `dm/receive` (`DmMessage.behaviours`); a new behaviour is a registry entry (and a UI branch by `kind`), never a state read at draw time. `vitalsOf` gives a pattern and two bands from state; her voice or a gag changing her telemetry goes through its causes.
- **Rules of the package:** no new RNG draw (hash of a stable key), read by field never by id, every new stat / chip / option carries `data-analyze`, and every animation asks `motionReduced` / `visualFlags`.
