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

Visible results of **statuses** set by the engine (not a meter of feelings; ruling E as revised in P15 §16.1): sleeplessness darkens and blurs the screen edges slightly; hunger makes input stutter now and then; the shock collar flashes a glitch and a sound. All respect `motionReduced` / `visualFlags`.

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
- **Art never gates anything (author ruling 2026-11-19).** Every pose shot, backdrop, frame, surface, prop and even the character's ordinary sprite is optional. Fallback chains, each step tried when the previous file is absent **or fails to load** (`img` error → next step):
  - pose shot → the CSS camera on her ordinary sprite (crop by the gaze rule) → her ordinary ST expression sprite → **no sprite** (the scene runs as text with her name plate);
  - frame / backdrop → its `derived` view (`pov_floor`, `pov_corner`, `pov_dark`) → the room background → a plain CSS gradient;
  - floor / ceiling surface → the top or bottom of the room background, scaled and blurred → a CSS gradient;
  - a prop → skipped;
  - another unit's sprite (a visitor) → voice and name only.
  A missing file is **never an error**: no toast, no blocked action, at most one line in the SYS debug panel. A staging, contact, moment, practice or physics is **never withheld** because its art is missing. A test runs the P15a–P17d flows with an empty asset set and expects every scene to start and finish.

- **Memory check:** typed slips under jolts feed P17 suspicion and her discipline at their own sites; nothing new is remembered.

## Revision of 2026-11-20 (design session)

Added after the 2026-11-20 design session. Where it conflicts with the sections above, this section wins.

- **Her protocol with others.** With the `others` domain (P15 §5) and a profile that fits (not every holder does it), her speech rules also hold in scenes with other women: forbidden words are struck through while typing there too, and her whispers (P17d §3) tell the commander what to say to them.
- **Hesitation shows.** When the player deletes and retypes a lot in the scene input before sending, she notices ("you hesitated"): a short line above the input, a reading for her (P15 §16.4) and a small Regard move by style. Local only: the engine counts deletions in the input field of this scene and stores nothing typed; nothing outside the input is observed (author ruling: nothing reaches into the player's real life).
- **Dark nights.** In a `held_night` or the cage (P17a §5, P17b §6) the night theme (P10b) deepens to near black: no portraits, sounds and her lines only, the sensory layer louder; the night ends with a wake-up card (where the commander woke, her first line).
- **Conditioned reactions in the interface.** When a cue the commander has been conditioned to (P17d rev. 2026-11-20) fires anywhere — her scent line on the hub, her bell, her word in a DM — the interface gives a micro-reaction: a vignette pulse, a stutter in the input, a sound. **The player's text is never altered or written for the player**; the reaction is the screen's, the commander's behaviour stays the player's to write.
- **Memory check:** hesitation, dark nights and conditioned reactions are bookkeeping (the reactions' sources write their own facts in P17d).

## Acceptance criteria

1. Gag garbling, the gesture menu, dictation and (when enabled) real stillness work and feed slips and Strain.
2. Passcodes, incoming reads and deletions, dossier notes, her voice for system texts, permission requests and session rituals work.
3. Status effects on the interface follow statuses and respect reduced motion.
4. Light, door-side entries, situational expressions, the CSS camera and panning work with knee-length sprites.
5. Every art slot is optional with a working fallback (the chains of the depth revision); a missing or broken file is never an error and never withholds a mechanic; props compose a room by data; pose shots place by anchor and mode.
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

## Interfaces already provided by P10c (implemented — use, do not rebuild)

- **The art exists** (`content/core/art/backdrops/`, WebP): every scene location (roof and perimeter with evening and night files, the training yard with an evening file), 14 quarters styles, floors `wood` / `linoleum` / `concrete` / `tatami`, ceilings `dark` / `technical` / `office` / `room_1` / `room_2` / `rich` / `japanese` / `bright_1` / `bright_2`, three skies (finish `sky`, two day files and one night file, chosen by `slots`), `frame_under_desk`, `frame_cage_bars` (rusty), `frame_cage_clinical` (white steel with a keypad), `pov_corner` (an opaque wall corner, a `place`), two corridors. Not yet drawn: `medbay_exam`, `medbay_exam_lying`, `comms_console`, `feet_floor`-style pose shots.
- **Registry `backdrops`** `{ id, kind: 'surface' | 'frame' | 'place', file, surface?, finish?, slots? }`: read surfaces by `surface` + `finish` (+ `slots`), never by id. Locations and `quartersStyles` declare `floor` and `ceiling` finishes, so a room's surfaces are `backdrops` with the same finish; outdoor places use the finish `sky`. A test guarantees every declared finish has a surface.
- **The scene's room** is `sceneBackdrop(state, reg, locationId, ownerId)` (her style first in her quarters, then the slot's file, then the day file) and `quartersOf(state, reg, unitId)`; the scene screen already shows it full-bleed (`.alius-scene-backdrop`, `--alius-pan`, `data-light`) and falls back to the ASCII stage when nothing loads. Build pose-shot underlays and blurred room views on these, and add the fallback steps of the depth revision on top of the same loader (`SceneScreenCtx.loadImage`).
- **Frames are cut out and cleaned** (no haze in the gaps); the rusty cage has no bottom crossbar, so it can run past the bottom edge as §5 asks.

## Interfaces already provided by P14 (implemented — use, do not rebuild)

- **Every model call goes through the envelope** (`app.generations`, `src/llm/envelope.ts`): `generate(siteId, key, opts?)`, `retry`, `reroll`, `rerollState`, `drop`, `useFallback`. `callLlm` is imported by that module alone (`tests/architecture.test.ts`).
- **A package that adds a call type or a flavor kind registers its site in the same change:** a `SiteDecl` in `src/llm/sites.ts` (`id` like `<area>.<what>`, `callType`, `surface`, `reroll` mode, `record` mode, generic `label`, glossary id) and the handlers bound by the owning controller (`envelope.bind`: `build` rebuilds the input from the state, `apply` runs the same engine action as before, `fallback`, `committed` / `undo` for the reroll mode). `tests/llm/siteRegistry.test.ts` fails for a call type or flavor kind without a site; the architecture test refuses a direct `callLlm`.
- **A failure** is `refused`, `truncated`, `timeout`, `network`, `invalid_output`, `empty` or `no_profile`; the envelope writes a record (`CampaignState.generations`, at most 20, no prompt, no model text, `detail` never the model's words) unless the site's record mode is `none` or the reason is `no_profile`. Add the chip with `drawGenerationChips(host, ctx.generation, state, surface, filter)` and REROLL with `drawSiteReroll`; a screen draws neither without `generation` in its context. Labels are generic: never put a hidden value in one.
- **The engine decides:** a retried or rerolled value goes through the same sanitizer and the same action as the first one; none of the new actions draws from the rng, so a new site must not either (a seeded test that moves stops and reports).

## Interfaces already provided by P15 (implemented — use, do not rebuild)

P15 is implemented (see its **Implemented as**: rulings R1–R25). What follows is what exists for this package and what is reserved for it. Every P15 reader answers null, zero or an empty list while the dynamic is off (`dynamicOn`, `herPracticeLive`), and nothing it adds draws from the rng unless someone is eligible: a hook you register must keep a campaign with no dynamic byte-identical (`tests/dynamic/unaffected.test.ts`). Keep new directive ids away from `dynamic:`; read domains by capability, styles, milestones and aftermaths by field, never by id; no text gives the commander a pronoun or a feeling.

- **The frame picks props:** `frameOf(state, unitId)` and `dynamicFrames` (`rank`, `outside`, `promptHint`); a room variant by frame is data you add. Ruling E reads as revised in P15 §16.1: no meter of the commander's feelings; the DYNAMIC section, the frame chip and the analysis panels already honour `dynamicHidden` (immersive mode hides the numbers, the section shrinks to one `[ END IT ]` row, the chip goes; cards, notices and events stay).
- **Her protocol with others:** `capabilitiesOf` reads `relation_rules` and `booking_consent` (the `others` domain); `protocol_slip` is an intent (offered while a unit's dynamic is at `role` or beyond, or an aftermath `habits` stage, with another unit present) that already adds a sign and a small Regard fall for the witnesses.
- **Hesitation:** her reading is `updateReading(rel, sample, weight, style)` and Regard is `regardFall` / `regardRise`; both are hidden values (sentinels): show nothing numeric.
- **Directives:** `dynamic:<unitId>`, `:probe:`, `:offer:`, `:aftermath:`, `:leash_block:`, `:command:`, `:witness:`, `:disappointed:`, `:regard:` exist; a P17c layer derived from the state keeps its own prefix.
- **Immersive mode and the cards:** cards in her voice (`VOICE_OF.dynamic = 'personal'`, `unitAccent`), toasts and cut-ins on `frame_changed`, `aftermath_started`, `sworn`; every animation asks `motionReduced` / `visualFlags`.

## Interfaces already provided by P16 (implemented — use, do not rebuild)

P16 is implemented (see its **Implemented as**: rulings R1–R24, the memory check and the open items). Everything it adds is off, absent and byte-identical while nobody holds at `play` or beyond (`practiceLive`), and none of it draws from the rng (`practiceRoll`). Keep new directive ids away from `practice:`; read seeds, punishments, ceremony steps, booking kinds and rule templates by field, never by id; no text gives the commander a pronoun or a feeling.

- **The gestures directive is yours.** "She speaks for the commander" (R.7) is built as one line only: `practice:demonstration:<holderId>` says, when her `talkativeness` is not `silent`, "others address her, and she answers for the commander". The commander's input turning to gestures, and dictation, are yours; a new directive id must not start with `practice:` (or with any prefix `docs/packages/P16-practices.md` lists).
- **Self-punishment** (write it a hundred times, hold it for N minutes) is not in the effect vocabulary (`PUNISHMENT_EFFECT_TYPES`); add an effect type with its `EFFECT_NEEDS` and a case in `runPunishmentEffect`. The ceremony (`ceremonySteps`: chip, words, number, posture; `practices` `ceremony { steps, done, number? }`) is the model for steps done without her.
- **Held strip and sensory mode:** `heldNow` / `sensoryNow` and `drawHeldStrip` (hidden in sensory mode: one plain line) are the surface; `visualFlags(…, { sensory })` and the `alius-sensory` class on the shell root dim the device. A staging that darkens the room should set the same flag through `sensoryNow`, not its own.
- **Cards and notes:** every card draws in the scene and in her thread inside the existing offer surface (no new host); the slap overlay is an absolutely positioned layer inside `.alius-scene`. The note in her hand (R5, ritual or regal holders) is not built; `renderNote` (P10b) is where it would go.

## Interfaces already provided by P15a (implemented — use, do not rebuild)

P15a is implemented (see its **Implemented as**: rulings R1–R16). It built the parts below as hooks or data only; this package completes them.

- **Data with no reader yet:** the `camera`, `backdrop`, `pose_shot`, `filter`, `input` and `gestures` channels are validated data in P15a, readable with `effectsOf(blocking, reg, channel)`. The interface readers are yours, with the gaze rules (blocking.md §11).
- **The PDA lock:** `device lock tabs` already locks the tabs.
- **The remote toy:** its pulses from her PDA (`escalation remote_pulse`) and a slip's screen glitch are yours.
- **Readers:** `effectsOf(blocking, reg, channel)` (`src/engine/blocking`); `deviceTabLocks`, `muffled` and `bellsFor` (`src/blocking/`) are the device and sound readers P15a built.
