# P17c — Immersion: Input, Device, Scene Staging and Art

**Status: spec.** Release 0.2 (post-release), after P17b. **Depends on:** P17b, P17, P16, P15, P10 (shell, device, portraits, `visualFlags`, sound), P10b (handwriting, device marks), P9c (intercepts, device access), P5 (world map, runs), P14, P7a. **Read:** overview; P15–P17b; this file; the **Implemented as** of P10 and P9c.

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

- **Backdrops** (registry `backdrops`: `{ id, file, use: situation[], fallback: filter }`): `pov_under_desk`, `pov_floor`, `pov_cage`, `pov_corner`, `pov_dark`, `medbay_exam`, `comms_console`; **surfaces** for composing pose shots: `floor_top` (the floor seen from above, one for all rooms) and `ceiling_<room>` (a room's ceiling and upper walls seen from below; fallback: the room background scaled up, shifted to its top and heavily blurred); later (0.3) `field_camp`, `settlement`, `ruins_interior`.
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

## Acceptance criteria

1. Gag garbling, the gesture menu, dictation and (when enabled) real stillness work and feed slips and Strain.
2. Passcodes, incoming reads and deletions, dossier notes, her voice for system texts, permission requests and session rituals work.
3. Status effects on the interface follow statuses and respect reduced motion.
4. Light, door-side entries, situational expressions, the CSS camera and panning work with knee-length sprites.
5. Every art slot is optional with a working fallback; props compose a room by data; pose shots place by anchor and mode.
6. Map marks and quiet mode work.
7. No network loads; every element carries `data-analyze`.
