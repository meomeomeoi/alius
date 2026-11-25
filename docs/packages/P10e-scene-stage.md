# P10e — The scene stage: full frame, prose subtitles, the history curtain, the posture dial

**Status: implemented** (2026-11-22; plan `docs/plans/2026-11-22-p10e-scene-stage.md`; manual test `docs/MANUAL_TEST_P10e.md`). **Depends on:** P10 (shell, `motionReduced` / `visualFlags`, `unitAccent`), P10b, P10c (full-bleed backdrop, light, knee-length sprites), P14 (generation chips), P15a (blocking, moments, physics), P15, P16. **Prepares:** the mini-games design session (next), P16b, P17, P17c (camera, POV views, pose shots, frames).

**Analysis tool (P7a)** rules apply: every chip, option, card and the dial carry `data-analyze`.

## Why

The author plays on a 1920×1080 screen. Today the scene screen is one column: header, a stage, the transcript, then about twenty hosts (blocking strip, moment card, physics panel, chips, offer and initiative chips, rule / discipline / demand chips, milestone, claim, return, task, punishment and demonstration cards, the posture call, the slap host, frequency chips, discipline menus, the pastime menu) and the CMD line. At 1920×1080 the stage gets **331 px of 1080** (31 %); in the measured render the knee-length sprite collapsed to 0 px. Every package since P15a added a host to the column, and each one pushes the picture up.

What the author wants:

1. **The backdrop and the character's sprite take half the screen or more** at 1920×1080. Sprites are drawn to about the knees and show the 28 standard SillyTavern expressions (the face changes, the body does not).
2. **Staged scenes, postures and mini-games are not a row of buttons.** Immersion, craft and a possibly unique interface matter more than minimalism. The scene moves away from strict CRT minimalism, as the base plan (P10d) already did.
3. **The difficulty is holding two things in focus** (words and the body), never a bad interface.
4. **Long scenes and long replies are normal** (a narrator, actions, literary prose); reading them must be one gesture away.
5. **Nothing of a reply is dropped:** actions and narration (`*She stretches.*` or plain prose) stay, mixed with speech as the model wrote them.
6. **Full-frame views exist:** P17c's POV views (`pov_floor`, `from_below`, `face_close`, `frame_under_desk`, pose shots such as `feet_floor`) cannot fit a half-screen window.

## Approaches considered

- **A. Two layouts** (a visual-novel layout for talk, a separate POV layout): readable and simple, but a visible seam at every switch.
- **B. "The screen is the eyes"** (chosen): always the full frame, no opaque panels; the reply lies at the bottom as prose subtitles, the history comes down as a curtain on demand, the input is one line, the body is a small instrument in the corner, signals are effects of the whole screen. The author picked it for its philosophy, with two conditions: an easy mode for long text (the curtain, §4) and no loss of actions and narration (§3).
- **C. A "breathing" dock** (one glass panel whose height follows the camera): a safe hybrid, rejected in favour of B.

Within B, **the whole last reply is shown at once** (option "b" of the session), not paged beat by beat: paging takes the hands that a mini-game needs, and auto-paging loses lines while the commander holds a weight.

## 1. The frame

- The P10c backdrop covers the **whole screen** behind everything (it already does: `cover`, a 3072×1280 file is 2592 px wide at 1080 px high, 672 px to look around). The scene root loses its column layout: every element below is positioned over the frame.
- **Looking around:** hold the **right mouse button** on the frame and drag (the context menu is suppressed on the frame only). This replaces P10c's pointer-follow pan, because the mouse is busy with the dial and the mini-games. Release keeps the view; a double right-click recentres. Reduced motion: dragging still works, without easing. Turning toward the door when a visitor enters is P17c's.
- A soft gradient darkens the top (the top line) and the bottom third (reply and input). No borders, no boxes on the frame.
- **Layers, back to front:** backdrop → frame / surface (P17c) → pose shot (P17c) → sprites → screen effects (light filter, vignette, tremor; P15a visuals, P17c) → the UI (top line, reply, chips, input, cards, dial) → full-screen moments (the slap) → the curtain. This package builds the layer stack; P17c fills the frame, surface and pose-shot layers.

## 2. Sprites

- One present woman: centred; her sprite is about **1.1 × the viewport height**, its top about 3 % below the top edge, so the head and shoulders sit high and the knees disappear under the bottom gradient. At 1920×1080 the visible part is **at least 600 px** (the acceptance floor is 540, half the height).
- **Room space (author's note, 2026-11-22):** the sprites stand in the room, not on the glass. The sprite layer moves with the backdrop when the commander looks around (the panorama is the backdrop's drawn width at the viewport's height, about 2.4 × the height). One woman: at the centre of the panorama. Two: both within the central view (at the default view both heads are on screen). Three or four: spread across the whole panorama, so some sit beyond the view's edges and the commander turns to see them. Four are drawn at about 0.85 of the size of two or three, so neighbours do not overlap past a shoulder. With two or more women every sprite is anchored to the bottom, past the frame's edge (`bottom: -5vh`), so the knee cut is never visible and a smaller sprite never hangs in the air; the full squad therefore stands smaller and lower, and the dock then starts lower (44 vh) to stay under their heads (author, 2026-11-23; `npm run test:layout` checks every sprite reaches past the bottom edge). The speaker is brought forward (brightness, a slight scale), the others dimmed.
- **The view turns to the speaker:** when a reply from a woman lands, the view eases to centre her, unless the commander turned it by hand in the last 8 seconds; reduced motion jumps. The scene's memory for looking around keeps the pan as it is after the ease.
- **Scene light:** the sprite is tinted by the scene's light (`data-light`: day, evening, night) so a daylight sprite does not glow in a dark room (P17c §4 adds alarm, sensory and hold tints).
- The expression is the current SillyTavern expression (`getSpriteUrl`), as today. No sprite → her name plate, as P17c's art rule demands; a missing file is never an error.
- **POV views** (P17c's camera): the sprite layer is hidden or replaced by a pose shot; nothing else in this spec changes for them (§8).

## 3. The reply: prose subtitles

- The **last model reply is shown whole**, bottom centre, about 56 % of the width at 1920×1080 (1080 px; a readable 70–90 characters a line), on the bottom gradient, with no frame. In a group scene: every reply since the commander's last message, each under its speaker's name, oldest first.
- **Prose as written.** Nothing is split into "action" and "speech" lines, nothing is removed:
  - text in straight or curly double quotes is **speech**: the speaker's accent colour (`unitAccent`), slightly brighter;
  - `*asterisks*` become **italic inline** (the asterisks are not shown);
  - everything else is **prose**: the normal text colour.
  This covers both `*She stretches on her bed.* "Close the door."` and literary prose (`She stretches. "Close the door," she says.`). Unbalanced quotes or asterisks are shown as plain text from the unmatched mark on (never an error).
- **The commander's last message** is echoed as one dim line above the reply (truncated with an ellipsis), so the reply has its context.
- While the reply streams in, the newest sentence is softly highlighted; the highlight fades when the reply is complete.
- **Long replies:** the block grows upward to at most **8 lines** (or 30 % of the height, whichever is less). A longer reply shows its last 8 lines with a fade at the top and a "more above" mark; the wheel up over it, or a click on the mark, opens the curtain (§4). Optional setting: open the curtain by itself for replies longer than N words (`curtainWords`, default off).
- The swipe arrows, regenerate and edit of the last reply live on the top line (§5); editing opens the curtain at that message.

## 4. The curtain (history)

- Opens with: the **wheel up** over the frame or the reply, **↑ in an empty input** (as a terminal's command history), or the **history** button on the top line. Closes with: the wheel down past the end, **Esc**, or the same button. Tab is the device's key (§5a), not the curtain's (author ruling, 2026-11-22).
- A glass panel from the left edge, **45 % of the width**, full height, a strong blur behind it. The frame dims; the sprite slides right and stays visible; the dial stays.
- Inside: the whole scene transcript (the same messages the transcript shows today), the same prose rendering as §3, the speaker's name over each message ("YOU" over the commander's), scrollable, newest at the bottom. The **input moves into the curtain** (attached at its bottom), so the commander can answer without closing it.
- **Per-message tools** (shown on hover and on keyboard focus): ✎ edit on every message; on the last model reply ‹ n / m › swipes and ↻ regenerate. Editing works in place as today (`controller.edit`).
- Everything the transcript does today keeps working here (P3b hidden messages stay hidden; P14 generation chips on the last reply).

## 5. The top line and the input

- **Top line**, small and low-contrast: left, the place · day · slot (and PRIVATE / GROUP); right, round buttons ‹ ↻ › (swipe and regenerate the last reply), the P14 reroll tools, **history**, **end**. Hints for looking around and the curtain sit at the bottom-left corner, very dim; they hide after the first use of each.
- **The input** is one rounded line under the reply (about the reply's width). Inside it, at the right: ORDER and PROPOSE ▾ (and the unit pickers when more than one woman is present), in small low-contrast type. The P15a input effects (gag, narrowing, smearing) and P17c's later ones act on this element.
- **The input frame is a gauge surface** for mini-games: it can narrow, tremble, carry a pulse that runs along its top edge and a highlighted window. This package provides the surface and its API; what each mini-game shows on it is decided in the mini-games session.
- **Chips** (offer chips, initiative chips, rule / discipline / demand chips, generation chips, frequency chips, the pastime menu) form **one row above the input**, small rounded pills in the speaker's accent; if they do not fit, the row scrolls sideways and ends with "+N". The discipline menus per unit move into a chip that opens them.

## 5a. The device in a scene

Today the PDA cannot be raised during a scene (Tab and OPEN PDA act only on the hub). In P10e:

- **Tab raises the device in the scene as on the hub** (author ruling, 2026-11-22): the PDA slides up over the dimmed scene, which stays rendered underneath and keeps receiving the reply; Tab or Esc lowers it. The shell's Tab rule applies (not from a control, not while typing). The device layer gains a second host: the scene, beside the hub; the scene screen is not rebuilt when the device goes up or down.
- **Hands busy** (`deviceLocked`, P15a §10): Tab does not raise the device; "The device is out of reach." flashes briefly over the frame (`data-analyze="glossary:device_out_of_reach"`) instead of the standing line in today's column.
- Using the device in front of her as an act she may notice (P17c's permissions in the interface) is a later package; in P10e the device is simply available.

## 6. Cards: her hand

- Every card the scene draws (moment card P15a, milestone, claim and return cards P15, task, punishment and demonstration cards P16, the posture call P16, the held strip and the alarm card P16, the wake card P15a, a blocking proposal) is placed in **one dock at the left side of the frame**, from 30 % of the height down (a taller stack scrolls inside it), about 420 px wide, never over her face.
- One card is open at a time; the others are collapsed to their title line above it (newest on top). A card can be set aside to a small counter in the dock's corner ("2 waiting") and brought back.
- Cards keep their content, voices and `data-analyze`; only where they are drawn changes. Their look moves to the scene's language (glass, the speaker's accent, no `[ BRACKETS ]`), voices stay readable (P10 voices).
- **While the curtain is open** the dock moves to the right of the curtain.
- **Full-screen moments** (the slap, a wake card after a blackout, her hand-raise cut-in) stay full-screen overlays for their short time; they are the only UI allowed to cover her.
- **Their look and the posture call (chunk (e), 2026-11-25):** the cards' look, her voice on them and the collapsed edges are §15 "Her cards"; the posture call leaves the dock and becomes a full-frame moment (§15).

## 7. The posture dial

- **Bottom-right**, about 200 px, a dark glass circle with a thin ticked ring. It shows **posture only**: no air, no strength, no other tracker (each mini-game brings its own instrument when it starts and takes it away when it ends; the dial may dim while one runs).
- **The figure** is a small **3D mannequin drawn as line art at a three-quarter view**, built from the posture's point states (P15a `blockingPostures`: torso, hips, knees, arms, head, gaze, feet; `docs/content/blocking.md` §7). It is not 48 drawn pictures: each point state maps to joint angles, the mannequin is posed in 3D and projected, and drawn as a few gradient strokes with ring joints. The three-quarter view is needed because a side view cannot show knees apart, arms out sideways or elbows out behind the head.
  - The **gaze** is a faint dashed ray from the head (down, at her, straight, closed = none).
  - **Drift** (P16b's posture endurance): the target posture is drawn as a dashed ghost, the actual body as the solid figure; a drifting joint glows amber. Clicking a joint (or keys 1–7 when the input is not focused) corrects it, as P16b specifies.
  - Anchors and held items are hinted with one line (a wall behind, the floor line, a tray held level), not drawn as objects.
- **Label** under the dial: the posture's name, or her name for it (P16 named postures); a second dim line when relevant (EYES DOWN).
- **Choosing a posture:** a click on the dial's centre opens a fan of the postures the blocking offers now (`entryAllowed`), each as a small mannequin thumbnail with its name; anchors, contacts and items follow as lists in the same fan. This replaces the BLOCKING strip in the scene; the strip's rules (what is offered, her answers, the content gate) do not change.
- **The spike (2026-11-22, approved in look by the author)** settled the drawing: an artist's wooden mannequin, not a stick figure. Each segment is a capsule (a light outline stroke under a dark fill stroke; thickness per segment: torso, pelvis, thigh, shin, upper arm, forearm, neck, foot), segments are drawn far to near by projected depth, the far side is a darker outline, the floor is a faint parallelogram, the scale is fitted per posture to the dial (lying postures are not tiny), joint rings appear only on a drifting joint. A three-quarter view: yaw about 38°, elevation about 14°, orthographic. The head pivots at the top of the neck (the neck rises along the spine, then the head tilts; a tilt back lifts the chin and must never put the skull behind the shoulders) and is an egg (as on an artist's mannequin) whose long axis runs from the crown to the chin, so a tilt reads without drawing a face; the head is always drawn over its own neck; a small dot marks where the face looks (a separate jaw shape was tried and looked inhuman). Lessons for the build: limb lengths need a two-bone solver (the spike let arms stretch to reach the floor); the three curled bases look alike and lean on the anchor hint; `hogtied` and `bent_over` need their item or anchor line to read; the gaze ray of a drifting gaze should be brighter than a held one.
- **The per-posture review (2026-11-22, approved by the author)** fixed these rules in `src/ui/scene/dial/` (the code is the reference; keep them when touching the mannequin):
  - **Grounded:** a lying body rests on its surface (each joint counts with its half-thickness), the floor plane fits the body's footprint, and contact shadows sit where it touches. `tests/ui/dial/draw.test.ts` pins "no gap, no sinking".
  - **Arms and legs by posture:**
    - on all fours the hands are under the shoulders; in a bow the forearms lie beside the head; otherwise "on the floor" is between the knees;
    - on the side the knees are bent and the top leg is forward, with the bottom arm forward on the floor and the top arm along the body;
    - face down the toes point back; belly up with the knees apart, the knees are drawn up;
    - kneeling knees apart open forward at a natural width (never a split);
    - curled arms go straight back beside the feet; offered hands reach forward and down; paws stay close in front of the chest.
  - **Hidden and clipped:** a hand behind the back is drawn behind the trunk, and the gaze ray stops at the floor.
  - **Planes, not sticks:**
    - a wall behind the back (drawn under the body) or before the face (drawn over it, translucent);
    - a desk top at the hands' height reaching under a bent body;
    - a stool under every sitting body, and her soles on the floor;
    - a tray as a surface, a lamp (stem and shade) held up in both hands;
    - a rope from the wrists to the ankles (hogtie), and a bar in the teeth.
  - **Hint and item values:** `hint: 'wall' | 'wall_front' | 'desk' | 'feet'`, `item: 'tray' | 'lamp' | 'rope' | 'mouth'`.
  - **Still the weakest reads:** `hogtied`, `pet_belly_up`, and the foreshortened forearms of `beg` and `kneel_present`.
- The dial is drawn only while the blocking is live (`blockingLive`); otherwise the corner is empty.
- **Every preset must look right:** a test renders all 48 presets (and each drift state of a few) to a contact sheet the author reviews before the package is done; the mannequin's proportions are tuned by that review.

## 8. POV views and the effects layer

- When P17c's camera chooses a POV view, the backdrop and the pose-shot layers take the frame; the sprite layer is hidden. The reply, the input, the chips, the dock and the dial stay (smaller margins); the top line fades to a minimum.
- Screen effects (P15a visuals: the vignette closing with air, the tremor under weight, the crowding sensory lines; P16 sensory mode) live in the effects layer above the sprites and under the UI. They respect `motionReduced` / `visualFlags`.

## 9. Visual language

- Prose in **Inter** (light for prose, regular for speech), system lines and labels in **IBM Plex Mono** small caps, both already bundled. Inter and Plex carry no Cyrillic; the game is English, so this is fine, and noted for a future translation.
- Glass surfaces (dark, translucent, blurred), rounded pills, the speaker's accent for her speech and her cards, a cool accent for the commander's body (the dial). No `[ BRACKETS ]` and no CRT scanlines inside the scene (the PDA and the hub keep their look).
- Colours are palette mixes in CSS (as P10d). Readable mode raises contrast and turns off blur; reduced motion turns off every easing and highlight animation.
- Nothing loads from the network; fonts and art are local (`tests/assets.test.ts`).

## 10. Screen sizes

The design is tuned for 1920×1080. It must stay usable at 1280×800 (the reply and the dock shrink, the curtain takes 55 %) and at 2560×1440 (sizes scale with the viewport height, the reply's width stays readable). Below 1100 px wide the dock overlaps the frame's left edge and the dial shrinks to 140 px.

## 11. What does not change

- Every engine rule, action, event and directive. This is a rendering package: the scene controller, the blocking, moments, physics, practices and the transcript keep their logic; only where and how they are drawn changes.
- The PDA, the hub, COMMS threads and every other screen.
- **Memory check:** nothing is remembered: the package adds no event, decision or state the squad could remember (a UI rearrangement). New settings (`curtainWords`) are plain settings.

## 12. Acceptance criteria

- At 1920×1080 in Chromium (a Playwright layout test, not jsdom): the backdrop covers the viewport; one present woman's sprite shows **≥ 540 px** of height above the reply block; no element of the UI overlaps the sprite's head box; the reply, the input and the dial are inside the viewport. The same test at 1280×800 and 2560×1440 checks that nothing overflows.
- A reply with `*actions*`, quoted speech and plain prose renders every character of it (minus the asterisks), in order; unbalanced marks render as text.
- A reply longer than 8 lines shows the "more above" mark; the wheel up opens the curtain; Esc closes it; the input works in both.
- In the curtain: edit on every message, swipes and regenerate on the last reply, P3b hidden messages stay hidden.
- Every card that today lands in the column lands in the dock; every chip in the chip row; the BLOCKING strip's choices are reachable from the dial; nothing the scene offers today is lost (a test lists today's hosts and finds each in its new place).
- The dial renders all 48 presets; the contact sheet is reviewed by the author.
- `data-analyze` on every chip, option, card and the dial; `tests/ui/analyzeCoverage.test.ts` passes for the scene.
- Reduced motion and readable mode honoured; no network loads; all existing tests pass (the scene tests may change their selectors, not their assertions about behaviour).

## 12a. Decisions after the builder check (2026-11-22)

A reviewer read this spec as a builder would; these answer its questions. They are the designer's calls, not the author's, unless marked.

1. **The 48 presets are P16b's content.** The registry has 13 base postures today (`content/core/blockingPostures.json`, no `points`). P10e builds the mannequin against the **point-state schema of `docs/content/blocking.md` §7.1** (`torso`, `hips`, `knees`, `arms`, `head`, `gaze`, `feet` and their states), draws the 13 base postures from a mapping base → default point states, and keeps a **test fixture of the 48 presets** transcribed from §7.3 for the contact sheet. The drift ghost and joint correction are built as a drawing API (`target` and `actual` point states, a highlighted joint) with no engine behind them; P16b drives them.
2. **The mannequin is plain math in SVG:** joint angles per point state, a 3D pose, one fixed three-quarter projection, a few strokes. No WebGL, canvas or library. The quality bar is the author's review of the contact sheet (all 13 base postures and the 48 fixture presets, plus a drift state for five of them); a spike of the mannequin comes before the plan so the author can judge it early.
3. **Looking around replaces the pointer pan outright.** Horizontal only (no vertical slack at 1080 px). The position is kept for the open scene in the screen's memory (a module variable keyed by scene id, reset on a new scene and on chat switch) and survives `refresh()`; it is never saved. No keyboard or touch fallback.
4. **The head-overlap rule is checked for one present woman** (the head box is the top 22 % of her sprite's drawn box). In a group scene the dock may cover part of the left sprite's body, never a head; the layout test covers the single-woman case and one three-woman case for "no head under the dock".
5. **Where every host goes** (the test checks this table):

   | Host today | New place |
   |---|---|
   | header (place, day, slot, mode), swipe / regenerate / end, P14 reroll tools | the top line |
   | HUD (per-unit glyph, name, pulses, REFUSED mark) | the top line, after the place, as small name tags |
   | pacing banner ("TIME IS PASSING"), busy indicator ("AWAITING REPLY…") | a dim status line just above the reply |
   | device-out note | a short flash when Tab is refused (§5a); no standing line |
   | transcript | the reply block (last reply) and the curtain (all) |
   | generation chips, chips, lead chips, offer surface (offer + initiative chips), rule / discipline / demand chips, frequency chips, pastime menu (`lets`) | the chip row |
   | discipline menus per unit | a chip per unit that opens its menu |
   | blocking strip | the dial's fan (§7) |
   | moment card, milestone / claim / return cards, task / punishment / demonstration cards, posture call, held strip, alarm card, wake card | the dock (§6) |
   | physics panel (cues, controls, tap, stop word) | the dock as a card **until the mini-games session** redesigns each physics; its stop word is also pinned at the right end of the chip row while a physics runs, so it is never collapsed away |
   | slap host | a full-screen overlay (unchanged) |
   | CMD line (input, ORDER, PROPOSE, unit pickers) | the input (§5) |

6. **Speakers and typing.** Messages carry `name`, `avatar` and `isUser` (`ChatMessage`), so the reply block groups by them. The `typingSpeed` reveal stays: it *is* the streaming highlight (the revealed tail is the highlighted part, and the highlight fades when the reveal ends); `typingSpeed: 0` shows the reply at once with no highlight. The violation marker (`drawViolation`) is kept in the reply block and in the curtain.
7. **Keys** (author ruling on Tab, 2026-11-22). Today the shell binds neither Tab nor the number keys in the scene (they act only on the hub and the PDA). **Tab raises the device in the scene too** (§5a), under the shell's own rule: only from a place that is not a control and not while typing; anywhere else Tab moves focus as usual. The curtain opens with the wheel, ↑ in an empty input or the history button. Keys 1–7 for joints work only while nothing editable has the focus and the device is down.
8. **The layout test** is a Playwright script on a standalone page built from `dist/index.js`, `style.css` and a fixture state, with a fixture sprite (a generated knee-length placeholder PNG in `tests/fixtures/`, never the author's art). It runs as `npm run test:layout`, not inside `npm test` (it needs a browser); the plan's last task runs it.
9. **Touch and mobile are out of scope.** The extension is played on a desktop; the curtain and the history button work by click, so nothing becomes unreachable on touch, only looking around does.

## 13. Left to the builder

- Exact sizes, easings and colours within §9, the mannequin's proportions (tuned by the contact-sheet review), the fan's layout, how the chip row overflows, the dock's collapse animation, the dim echo's truncation length.

## 14. Next: the mini-games session

A separate design session goes through every mini-game (P15a's seven physics, P16's slap and posture call, P16b's eight) in this new space. Its principle, from this session: **the signal comes from the world** (light, sound, her line, the camera), **the control from the body** (the dial, the mouse), **the gauge on the screen or the input frame**; trackers appear only while their mini-game runs. Examples to start from: weight tilts and sags the whole frame and the commander levels it; the gaze rule makes the cursor the commander's gaze, with everything above her line blurred; stillness turns every key or mouse move into a ripple across the frame; balancing a tray is a liquid level at the bottom of the frame.

## 15. Mini-game instruments: design session (done, 2026-11-22/25)

**Status:** designed with the author (2026-11-22 … 2026-11-25); this section is final and is **chunk (e) of P10e** (author's ruling), planned in `docs/plans/2026-11-25-p10e-e-instruments.md`. The instruments are built for the mini-games that exist (P15a's physics, P16's slap and posture call) before P16b, so that P16b and later packages follow this pattern instead of being redesigned. The P10e physics card in the dock stays only as the fallback for a physics with no instrument and for switched-off interactions. **Chunk (f) of P10e, the stage setup** (sprites, placement, hands and accents, art slots, their fits and zones), is designed after (e)'s plan (see "Decided on 2026-11-25" below).

**The author's principles (verbatim intent):**
- Every mini-game is varied and **unique**. It can appear in different places. One mini-game can be **several windows, animations, trackers and buttons** at once. There is no single physics panel.
- **No CRT minimalism.**
- The mini-games are semi-explicit, more provocative than explicit. Craft, immersion and animation are not economised; the current card is dry and does not pull the player in.
- Every window **reads on any background**.

**Decided so far:**
- **Materials (author's ruling, 2026-11-23): nothing is drawn as an object or a body part in SVG.** A test showed an SVG foot looks like clip-art. Each layer has its own material:
  - her body is her **sprite through the camera** (crop, from below, close, a slow "breathing", leaning in, blur, colour) plus the author's **art slots** of P17c (`feet_floor`, `feet_overhead`, `legs_seated` and others), falling back to her sprite;
  - SVG and CSS draw only **instruments, effects, typography and the mannequin**;
  - feeling comes from **screen effects and synthesised sound** (the game has no voice; the author has some barks but they are not coming soon).
- **The posture dial stays posture-only.** No fast mini-game uses the mannequin (too small to click quickly).
- **Anatomy of a mini-game** (the controller's proposal, accepted as a base):
  - **her signal** comes from her (her sprite moving, a glow by her, her line in her hand);
  - **the gauge** lives on the body or the screen (vision, the frame's edges, the input frame);
  - **the control** is where the hands are (Space or the mouse; the input stays usable, because holding two things in focus is the difficulty);
  - **the feedback** is pulses, flashes and her reaction;
  - **three phases:** an entry (the screen dims, her line, the instrument arrives with its own animation), the loop, and an exit (her reaction to how it went).
- **Her lines are typed in her handwriting** (P10b hands; Caveat has no Cyrillic, which is fine because the game is English). The author liked the effects, the text and the hand.

**The prototypes are normative** (author's ruling, 2026-11-23): each approved mini-game has a reference prototype in `docs/prototypes/` (`npm run proto -- <name>`; the README says what is normative and what is prototype-only). Chunk (e) **ports a prototype exactly**: its shapes, silhouettes, effects, numbers, timings and sound are the design, and this section only summarises them. A shape is never redrawn from the prose here.

**Breathing (P15a `breath`, timing): approved, then tested by the author in a live prototype (2026-11-23): `docs/prototypes/breath.html`.** The prototype's numbers are the engine's (`TUNING.physics`: beat 1500 ms, drain 14 less the seal, a caught window +30, a missed one +8 (cruel +4), windows every 2–4 beats, widths by style).
- **Entry:** the screen darkens around a shape of air (below) while the camera closes in; living grain over the dark.
- **Behind the dark is what the commander sees lying there, not her** (author's ruling: her whole sprite behind the opening made two bodies, one of them a flat picture behind a curtain). Data: `occlusion.view` on the contact:
  - `ceiling` (the default): the room's ceiling art (P10c), close, out of focus, drifting in her rhythm, lit as she lifts;
  - `room`: the room beside, out of focus (for `slide`: a face pressed into her chest or neck sees past her);
  - `her_face`: her sprite through the opening, close and from below, only where her face really is there (`hand_over_mouth`); later the P17c art slots fill the opening.
  - Her sprite fades as the camera closes in and **appears at the exit**: the dark leaves, the ceiling gives way to the room, and she stands over the commander.
- **Her cues follow her style** (P15a's cue honesty), not one count for everyone:
  - `count` (ritual, drill): "three… two… one…" in her hand beside the opening, evenly;
  - `honest` (neutral, cold, affectionate, possessive, obsessive): only "now." as it opens, so the commander reacts fast;
  - `false` (playful): false windows with a pinkish light at the lips that snap shut when reached for ("gotcha."); sometimes a teasing count that ends in "again." and no window;
  - `none` (cruel): nothing but the light;
  - regal announces, vindictive is sparse, clinical changes the language (not prototyped).
  - **Engine gap for chunk (e):** in real time the engine gives a cruel holder a cue on every opening (`noCueShare` is applied only turn-based, and `cues: 'none'` is not read by `planSegment`); the instrument needs her real-time silence.
- **The window:** she lifts, the opening widens, light at its lips. Hold Space (or the left mouse button on the frame; while typing only the mouse breathes: the field keeps its spaces and the click does not take its focus): an inhale sound, the heart slows. A missed window gives only a sip.
- **Holding too long costs** (author: the first version forgave too much). Holding the key more than 150 ms after the window closed, or pressing before it, is straining against her: the air drains twice as fast and she presses tighter (the dark shakes, a muffled strain); after 450 ms she notices: her line ("let go.", "so greedy~", cruel "greedy. now wait."), the streak resets and her next window comes a beat later (cruel two beats, affectionate none). In the test a bot that let go a second late was pressed to the limit in two windows; a clean one kept 45 % after four.
- **Air is vision, not a bar:**
  - the view narrows to a tunnel whose rim pulses red with a quickening heart (red at the tunnel's edge, not filling it);
  - colour and focus drain; every sound of the world goes dull (the heart and the breath do not);
  - her "hold it." once the air runs low;
  - the input narrows with the air, and the letters of the line being typed fade and blur; a breath brings them back, and a line sent with lost letters shows them as dots.
- **The edge light is flesh lit from behind** (author's pick): a wide red glow at the lips, not a thin orange rim. A false window keeps its pink.
- **TAP** is a small ring at the lip of the opening (her answer follows her style). The **stop word** stays the pill in the corner.
- **Exit:** the opening widens to the whole screen, the camera pulls back and she appears; her reaction in her hand. With `breath_play` a blackout closes the opening, the screen goes black, the heart slows and stops, and the wake card follows.
- **The shape of the dark depends on what covers the face** (data: a field `occlusion: { kind, side?, angle?, view? }` on the contact; a contact without it gets the horizontal slit and `view: ceiling`). None of these draws a body; each is darkness with soft edges and warm-lit lips:

  | kind | contacts | how air comes |
  |---|---|---|
  | `gap` | `feet_on_face` | a tilted gap between the two soles, wider at the toes; the window is her spreading them |
  | `lift` | `sole_to_mouth`, `hand_over_mouth` | the whole cover rises; light from the edge she lifts |
  | `slide` | `smothered_breasts`, `face_in_her_neck` | the dark slips aside; a crescent of light on one side, a different side each time |
  | `seat` | `under_her_seat`, `face_to_bottom` | **her silhouette from below** (author's ruling after five variants): one smooth outline of back, waist, hips and thighs kneeling astride to the bottom corners, the gap between her thighs narrowing up into a seam. A window is her **rising a little along the line of sight** (she recedes slightly; light comes in at the sides and in the gap), never standing up. Each side on its own spring: she shifts her weight, settles with a lag and a little give, rocks her hips. Natural proportions (waist to hips about 0.7), no separate rounded masses |
  | `squeeze` | `between_thighs` | the dark closes from both sides to a band in the middle; when she squeezes it snaps shut |
  | `wedge` | `smothered_armpit` | dark from above at a slant; a wedge of air below when she lifts her arm |

- **Rules from the seat review:** a shape of the dark may follow the outline of her body when the position cannot be read otherwise, but nothing is ever drawn inside the outline. Rigid masses that slide read as fake: a body rising off the face recedes along the line of sight (it gets a little smaller) and is soft (springs, flattening where it presses).
- **Open for the plan of chunk (e)** (engine questions, not decided):
  - the UI ignores an opening's `widthMs` today (a breath counts on the beat). The prototype shows the window for `widthMs × 2` and fills the air while the key is held (a whole window +30). Either the instrument only draws over the binary beat, or the engine gets a held credit and the over-hold input (a new input kind in `resolveSegment`; a change that moves a seeded test stops and reports);
  - with the engine's numbers even perfect play loses air (−13 a beat against +30 a window every 2–4 beats), so ten windows end in her release at the limit: rising tension by design, or a tuning question for the author.

**Weight (P15a `weight`, hold): approved in a live prototype (2026-11-23): `docs/prototypes/weight.html`** (normative; its README lists what to port and what is prototype-only).
- **Two views by the contact.** Face up (`straddled`, `standing_on`, `boot_on_chest`): the ceiling behind, her from below; an art slot `over` (a sprite drawn from below, the author will add such sprites) when there is one, else the ordinary knee-length sprite rising from the bottom edge (author: "done well, even with the default sprite"). Face down (`human_chair`, `footrest`): the floor art, coming closer as the arms give out.
- **Her body face down** (after two rounds): cast shadows were rejected (unreadable), so were drawn legs in other poses (sticks). In `human_chair` her calves hang at the edges of the view, near and out of focus, dim in shadow with the flesh edge light; the feet relaxed, toes down and in. In `footrest` she is out of view.
- **Her signal:** a shift is telegraphed before it lands, by style (neutral about 0.7 s, affectionate longer, ritual writes "left." / "right.", playful feints, clinical varies the warning, cruel none): her leg presses in and the other lifts (`human_chair`), her sprite leans (face up), or the creak and rustle come from her side in stereo (`footrest`).
- **Control:** Space or the left button bears her (a broken hold is a slip at once: a sag, a crack, the hold lasts longer); the mouse keeps the commander's balance under her moving centre of weight (the frame tilts with the error; level within a tolerance); be level when her weight lands, or it hits hard. Shift or the right button: the commander's own shift for a rest, caught by her attention.
- **Her attention is read from the world:** the cool light of her screen (on the floor, or on her face up): steady = busy, dipping = glancing, gone = watching; and her fingers tapping the screen, which stop when she looks.
- **The gauge:** a spirit level of glass and brass above the input (author: instruments must be stylish, not simple), its bubble a spring. Strength is the body, not a bar: the floor (or she) comes closer, the frame trembles and darkens at the edges, the letters typed tremble, a low strain rumble and breath through the teeth. Slips crack the frame's edges; the cracks heal slowly.
- **End:** she gets off at her `holdsUntil` threshold (15 %, cruel 5 %), or the commander buckles.
- Open engine questions (continuous cost of uneven holding, "level" as an input, the telegraph's lead time, the short strength budget): the prototype's README.

**Complexity grows from here (author, 2026-11-23).** Breathing and weight are the entry level (one key plus one axis). The next mini-games add control complexity and a learning curve: more inputs, divided focus, tracking several things at once. The plan (author): first the whole picture, then the details: every mini-game of P15a and P16 rated by the complexity it can reach, with three control schemes each, from simple to complex (discussed 2026-11-23, the author is reviewing them). **The author's favourites** are breathing, weight and scent (`saturation`, with the deep inhale and the body layer), then `her_activity`; the others matter as well, one step below. Ideas for later, in chosen games only, not now: she learns the commander's patterns, situations that change a game (someone at the door, a blindfold, fatigue), combined physics, consequences outside the game.

**Scent (P15a `saturation` with the stimulus body layer): approved in a live prototype after ten rounds (2026-11-23): `docs/prototypes/saturation.html`** (normative; its README lists what to port, what is prototype-only and the open engine questions).
- **The saturation is the words in the commander's head**, not a bar. Each breath through the nose leaves words that circle the face: the place (if at one of hers), her scent, the honest feeling of the commander's stage, the strength of her band; her band fills the head by itself; the head holds as much as the tolerance; an overflow is being lost in her (the face goes to her strongest place and breathes deep by itself). The fuller the head, the slower the face and the stronger the body's pull.
- **The face is the mouse** under her (her places by contact, a base strength because the face is already in her scent); the body pulls it away (aversion) or toward her (craving, adoring). The breath in is held for depth on an arc at the face: her band, the tolerance tick (lower near her strongest places), the reflex past it.
- **The mouth** is air without her scent and breathes words out of the head; short breaths are quiet, long ones are heard; her answer by style. The body must breathe within 7 s, one way or the other.
- **Her orders and her question by style** (neutral, affectionate, playful, cruel, ritual, clinical): deeper, gently, a named place (her mark), still; a rare question about a named place, answered from the head's words (tagged where / scent / feel / how strong) or with what she would like to hear (a lie the body may give away by a cough, then "liar."); a wrong answer is told what was missing.
- **Her scent is light, not smoke** (author: the brown haze had the wrong associations): motes rising from her places, drawn in along threads on a breath; the picture itself saturates as the head fills.
- **The breath is a recorded CC0 inhale and exhale** (author's find), played whole over the fill time (`natural`); paulstretch for longer breaths; granular stretching was rejected (sniffing). The author fixed its level and muffling.
- **What the scent means:** not a training and not a torture by itself; the state of the contact while she covers the face, its meaning given by her practice and the commander's stage; every session trains the body on top (tolerance, stage).

**The complexity rating (discussed 2026-11-23; the author's notes so far: breathing, weight, scent are favourites, then `her_activity`).** Every P15a and P16 mini-game rated by the control complexity it can reach, each with three control schemes A (simple) to C (complex), alternatives or stages of one game (A first, C as the commander's skill grows):
1. **posture call:** A her own names from a fan of mannequin cards; B assemble the posture joint by joint with keys 1–7 against the clock; C her conducting: postures in her rhythm, gestures from a learnt vocabulary, trap calls without her prefix, while holding against drift.
2. **`tongue_work`:** A she names the part, four keys, dryness; B a grime layer wiped by mouse strokes along the grain (needs a surface art slot); C a route over her zones with a dryness budget, re-dirtying, cutting corners while she does not look, her inspection.
3. **`her_activity`:** A stillness (every input ripples the frame); B anticipate her needs silently from small cues; C her shift: remember what she dictates, decode her silent signs during a call, hold a posture.
4. **`weight`:** A hold and rest; B the prototype (hold, level, her attention, rest); C four supports, each with its fatigue, lifted only when her weight is elsewhere.
5. **`jaw`:** A hold the opening in her band with the mouse; B speech through the opening (letters distorted by rule, words chosen to survive); C three channels: the jaw, a swallow, the breath through the nose.
6. **`saturation`:** now built (above).
7. **`breath`:** A the prototype; B the inhale's depth and a quiet exhale; C trading air for her asks, a tap language, combined with weight.
8. **`gulp`:** A swallow in her rhythm; B two capacities (mouth and air) with two keys; C asking her by signals, spills that carry into tongue work.
9. **the slap:** A brace in time; B read her hand (shoulder feints, which side) while holding her gaze; C a counted series: brace, count and thanks typed in her rhythm, stillness. (Built as one simple, hard game instead, author 2026-11-24: brace or turn the face away; the counted series stays with P16b's strokes and the ceremony.)
Smaller ones: the deep inhale (in scent), `pet` (breath's kin), the long kiss (weight's kin), counted kisses (keep the count while she calls other numbers), the ceremony's count (slap C).

**Her activity: the frame of her time (designed with the author on 2026-11-23; approved in a live prototype the same day: `docs/prototypes/her_activity.html`, normative, its README lists what to port, what is prototype-only and the open engine questions).** With a long hold (an hour of fiction or more: P15a's marathon, phases, strategies between them, attrition) the body games become games of patience and endurance. The author wants it to feel like **a long, aching wait**, broken by sounds and lines, immersive enough that the player lives in it.
- **A frame, not a contact physics.** `her_activity` is live whenever her activity takes her attention (`attention` `elsewhere` or `none`) and the commander is placed by her in the blocking, **with or without a contact**: kneeling by her bunk, standing by, facing the wall, under her desk, as furniture, under her. The frame gives the game inside it her attention moment by moment, the windows of cover, the clock (her task's progress), the peaks of the phases and her lines (a script); it takes from the game its noise and reliefs. Exactly **one body game** runs inside: stillness and posture without a contact; foot service under her desk (her foot language, P16b; the next game, designed with `tongue_work`); weight on furniture; breath or scent with a covered face. Two body games at once stay P15a §16.6's combined physics. The approved prototypes are not redone: the frame feeds their stand-ins (weight's `TASKS`, saturation's page turns). The author's reference case: she reads work reports at her desk, the commander kneels under it serving her feet; she never looks down and speaks only with her foot; oversight calls, her foot goes still on the commander's shoulder and her voice covers the rustle; the call ends, the foot moves again; she closes the folder.
- **Engine (for the plan of chunk (e)):** today `her_activity` is a contact physics (`contactPhysics.her_activity`: passive, progress +5 a beat) on `under_her_seat` and `feet_on_face` only. It moves to the scene (live from the blocking, not from a contact), and the marathon starts from it (today nothing in play starts a marathon).
- **Her presence** (per session, derived, never shown as a number; the player reads it from signs, and the first minutes of a session are that reading). Four steps:
  - `with`: she talks to the commander, asks, praises, corrects;
  - `glancing`: rare lines; she corrects only faults;
  - `own`: not a word to the commander; she talks to herself or to others; she answers a fault with her body (a press of her foot), not a word;
  - `use`: the commander is a thing she uses: no feedback even to faults, and she **forgets** (the air window, shifting her weight off, that the commander is there at all). Gross faults are still noticed (author).
  - From: her activity's `attention`, her `talkativeness` (P14c), her style (possessive, cold and cruel pull down; affectionate and playful up; clinical watches but speaks dryly), her Regard (P15: `low` / `none` → `use`; a new reader, since P15 confines Regard to tone and aftermaths: the plan decides), the hold band and frame (`possessing`, `rule`: the commander is a given), her mood, and a hash per session (no new RNG draw).
  - It drifts: a book absorbs her (down), a call takes her away, boredom brings her back, a fault may bring her back (not in `use`).
- **Forgetting is a mechanic,** an event the inner game reads: no air window comes, the weight is not taken off, the end is not announced. The tap reaches her by her presence (annoyed, or nothing); the stop word always works.
- **What the commander perceives** depends on the blocking. Four views:

  | view | when | the frame | channels |
  |---|---|---|---|
  | `her` | beside her chair, eyes may rise | the room, her sprite lit by her screen | sight, hearing |
  | `legs` | under her desk | `frame_under_desk` over the blurred room, her shins as silhouettes in weight's material (a dark shape, the flesh edge light, nothing drawn inside) | hearing, touch, her legs |
  | `floor` | kneeling by her bunk, eyes down | the floor art | hearing, the edge of sight |
  | `wall` | facing the wall, the corner | `pov_corner` | hearing only |

  A blindfold makes any view hearing-only.
- **No props are drawn** (there is no art for a pile of paper or a mug, and nowhere to put it): her task's clock and her small actions come as **sound and a sensory line** (P17d's lines: small dim italics, not her hand, on the side of the source, fading). Each mark of an activity has a `seen` and a `heard` wording ("She lays another sheet on the pile." / "Paper on paper, above and to the left."), chosen by the view; its sound pans to the source.
- **Her body as her mood, without words:** in `legs` her foot swings (absorbed, relaxed), goes still (thinking, listening) or taps (impatient); in the other views her breathing, the chair, the bunk. Later the author's art slots (`legs_seated`, `feet_dangling`) with a sidecar of points (scent places as in saturation, the knee as the pivot the picture swings around); not now.
- **Stillness: the cursor is the commander's attention.** The body raises urges at places of the frame (an itch: a hot pulsing spot; numbness: pins creeping up from the bottom; a cramp: a sharp line; others in the prototype). Attention on an urge (the cursor over it) feeds it; attention elsewhere (her legs, her sounds, the door) lets it fade. A click relieves it (a scratch, a shift): a sound by its loudness, a risk by her attention and the cover. **Patience is moving the attention away, not holding a key.**
- **Her voice covers.** On a call her lines (her hand) cover the commander's sounds; the other side is small and muffled, in its own colour, and while she listens the silence carries. With someone in the room both sides are heard. The player learns to time reliefs to her sentences.
- **"Is that to me?"** In `own` and `use` she talks aloud to herself; answering a line not addressed to the commander is noise and a breach, staying silent to one that is is a slip. A line to the commander carries a sign (a nudge, her name for the commander).
- **Lines from the world.** The report she reads is a real one (the last run, a unit's wound, the commander's decision), built through `Knowledge` from what she knows, and she comments under her breath; at a higher presence she may ask later what it said.
- **The script** is pregenerated: one call per phase at its boundary (P15a §16.1, the model works at boundaries) returns her lines, each with a time offset, the speaker, the addressee (herself, the other, the commander), whether it covers, and a mention of the commander with what that mention needs. **A mention of the commander to someone else** (a fault told aside: "my footrest wobbles today") is checked against the listener's knowledge of the dynamic (P15 levels) and the relation's publicity (P9d): said plainly if the listener knows, veiled ("the chair creaks today") or left unsaid otherwise; a `reckless` tactic (P17) may say it plainly (a leak, suspicion). The prototype holds placeholder scripts in exactly this shape; the port plays the script and takes it from the new call.
- **Time without a clock.** Under the desk there is no clock to see; time reads from the world: her marks, the light (dusk: she turns on her lamp), the base by the hour (the mess at 19:00, lights out, the night patrol), and false alarms (steps that come to the door and pass).
- **Between phases, in the world:** the screen goes dark, the clock runs, the hours' sounds pass compressed into seconds; the strategy is four gestures of the commander's body in the cool accent: keep still (`endure`), ease off slowly (`spare`), move while she reads (`cheat`), ask (`rest`).
- **The forgotten end.** In `use` she closes the book, turns off the lamp and leaves; the door shuts; the commander stays posed until someone comes or the commander gets up (disobedience if she said stay).
- **A digest after every mini-game** (author; a rule for every instrument, not only this one): at the end a short digest for the scene that follows: endurance in fiction time, behaviour, faults, caught cheats, how it ended. Only what she perceived goes into her side (an uncaught cheat is the commander's knowledge alone, P3b); nothing states the commander's feelings. Today only the per-segment counts (`physics:<id>`), the outcome sentence (`physics:end`) and the marathon's stretch summary exist.
- **Sound for every activity,** not a few: each activity brings its palette (paper, a book, a pen, a keyboard, the PDA, cards, a mug, a bottle and a glass, the metal of a weapon, needle and scissors, the leak of her headphones, her sleeping breath and the sheets, the chair, the bunk), the base by the hour (the mess, a bell, lights out, steps, doors, the generator, rain) and the commander's body (joints, cloth, a swallow, the stomach). Synthesised where synthesis is good; recorded CC0 candidates (OpenGameArt, Wikimedia Commons; freesound refuses the container, the author may add files) chosen by the author by ear.
- **What the rounds of the prototype changed** (author, 2026-11-23): the attention is a point with a halo that follows the mouse with a lag and that an urge pulls toward itself (patience is holding it on her; resting there half a second is listening, which also makes her sounds clearer); fast mouse moves are restlessness (ripples from 350 px/s; kept above 450 px/s the body fidgets, a noise she may notice): only a slow, steady move is safe; at every presence the tell that she heard is her sounds stopping and her legs going still; under the desk her legs come out from under the desk's front edge, and the art slot `legs_seated` has two states (`rest`, `foot_raised` on her signs, wordless corrections, a question she waits on and the call); `feet_floor` stands in the floor view (she sits on her bunk's edge); every art slot carries its fit as a sidecar set once per picture; weight runs inside the frame with an end (three buckles) and rests only for a commander who was bearing her.
- **The first prototype:** the frame with stillness inside (the four views; her activities: a book, reports, a call with her side only, cards with a friend with both sides, sleep, and more for the sound palettes; the four presence steps and her drift; a marathon of a few phases at a compressed pace; the in-world skips; the forgotten end), plus a switch that runs the approved weight (`footrest`) inside the frame. Foot service under the desk is the next game.

**Foot service under the desk (inside the `her_activity` frame; designed with the author on 2026-11-23; approved in a live prototype on 2026-11-24: `docs/prototypes/her_activity.html`, the game inside `service`, normative; its README section lists what to port, what is prototype-only and the open engine questions).** What the rounds changed: scrubbing back and forth is cleaning (a reversal is not turning), a rub is steady turning one way; zones are ellipses marked per picture (size, angle) and never shown in play; her foot answers a touch (toward the lips, away); the dirt is on the sole only; serving makes an itch fade; the timers of the body wait outside the played phase. The author's reference case: she reads at her desk, the commander kneels under it at her feet; she never looks down and speaks with her foot.
- **Two layers** (author's pick): **her signal chooses the act, the act is played as a craft.** The commander answers **with a gesture on her foot** (author's pick over a menu): what the mouse does is the answer, no buttons.
- **Bouts, not a continuous service** (author's pick): most of the hour her foot rests (`legs_seated` `rest`) and the commander waits (the frame's stillness, with its urges); now and then her signal, an act, and she puts the foot down again. The waiting stays the frame's.
- **A bout:**
  1. her signal: a motion of her foot (and its sound: a tap on the shoulder, a rustle); how often by her activity, presence and style (cruel and possessive more often, absorbed in a book less);
  2. the commander answers with a gesture within her patience (3–5 s, cruel shorter): `closer`, `still` and `enough` are played under the desk (bring the attention to her legs; do nothing; take the attention past the edge of her foot and hold it there; to listen is to take it to her sounds and lines instead); `kiss`, `clean`, `rub` and the sole lifted to the face raise her foot and **the camera closes in**;
  3. the craft in the close-up, for as long as she decides (15–45 s);
  4. she puts the foot down, the camera goes back under the desk; her verdict by presence (a press of approval, pulling away, a word).
- **Two camera steps:** under the desk (the signal is read: `rest` / `foot_raised`), and **the close-up** (her foot fills 55–65 % of the frame's height over the blurred shade under the desk; the art slot `sole_close`: the sole to the camera, toes up, heel down; one clean picture, the dirt is an effect layer). Her signals go on in the close-up as motions of the picture: toward the face (larger), pulling away (back and aside), a tap (a short bounce), pushing away (a sharp push and the camera back under the desk).
- **Her signals** (P16b §8 `footSignals`): motions two taps, sole to the face, push away, hooked foot (pulls closer), pointing toe, stamp, nudge; meanings kiss, clean, rub, closer, still, enough; each holder uses 4–6 pairs of her own (`fnv1a`). The first time she names a signal aloud, at any presence (it is teaching); later she only gives it. A misread is a slip and her correction by presence; known signals are the pair's mastery, and the digest notes the new ones.
- **Which part she wants**, by presence: `with` names it ("toes.", "higher."); `glancing` brings that part closer to the face (the picture shifts so the zone is centred and nearer); `own` and `use` nothing: the commander must know her (her expectation profile, P15 `how`, and the pair's mastery).
- **The crafts** (gestures on the zones of the close-up, read from the picture's sidecar of points):
  - **kiss**: press and hold on a zone; her right length by style (ritual even, affectionate longer); a peck and an overlong one are slips of different weight;
  - **clean** (`tongue_work`): strokes over a zone; the dirt layer is wiped where a stroke passes, worse against her grain (toes to heel or back, by her taste); the mouth dries with each stroke, and a swallow (the frame's urge) wets it, best under her voice; a dry mouth cleans badly and, by her style, displeases her; her check at dirt ≤ 10 (the engine's);
  - **rub**: circles on the ball, the arch or the heel at her tempo, felt through her foot (it relaxes and sinks a little); too fast or uneven and she pulls away.
- **With the call:** her foot rests on the commander's shoulder (service paused); a cruel or playful holder may signal `clean` in the middle of the call: every stroke is a sound, covered only while she speaks, not while oversight does.
- **The digest:** bouts, signals read right and wrong, the quality of each craft, her check, the signals learnt; for the engine `service_rated`, mastery and favour (P16).
- **Art:** `legs_seated` (`rest`, `foot_raised`) and `sole_close` (prompts in the session; one clean picture), each with its fit; the zones of `sole_close` (each toe or the toes, the ball, the arch, the heel, the edge) are marked once per picture with the prototype's zone marker and travel with it as a sidecar. Until `sole_close` exists the prototype zooms `foot_raised`.

**The slap (P16 §R.3; designed with the author on 2026-11-24 and approved in a live prototype the same day, first round: `docs/prototypes/slap.html`, normative, its README lists what to port, what is prototype-only and the open engine questions).** It replaces P16's slap overlay (the card with `[ BRACE ]`).
- **Really mini** (author): it cuts into a text scene for a second or two, unexpected (an answer to a wrong word, a punishment), not a waiting game. Mechanically simple, and hard.
- **Most slaps are simply taken** (`none`, the normal outcome); **bracing is rare** (`braced`); **flinching is a deliberate act of defiance**, never an accident (author): it is turning the face away.
- **Controls:** Space or the left button tenses the body: a short peak that fades by itself, one try a slap; the peak on the impact is braced (a press 42–224 ms before it). A sharp flick of the mouse sideways turns the face away (`flinched`). Nothing else.
- **Her signal from the world:** the camera snaps to her face (the art slot `face_close`, else her sprite's face zoomed), the frame rises and leans in on her hand's side, the light dims there and her clothes are heard there, a feint twitches the frame, a dark blur comes in from that edge in the last moment, the swish ends on the impact. Her swing lasts her style's time (the engine's `windowMs`: affectionate 700 ms … cruel 300); unannounced has no raised hand.
- **The impact:** the frame whips toward her hand's side with a motion blur, a red flash, ringing in the ears while the world dulls, the typed letters fly apart, a red glow on that cheek that fades over about a minute; her line in her hand by style (cold silent, cruel slaps again after a turned face); the camera goes back to the scene.
- **Her face changes** (author): no model call; a table by style gives the face before the slap (shown inside the camera's jerk, unless her face now already fits her style) and after it by result; data the author edits (the README has the table).
- **Sound:** recorded CC0 (the author's pick: a bright thwack at half the level, a light swish, her clothes from `her_activity`, the commander's breath from `saturation`); the ringing synthesised.
- **Engine (for the plan of chunk (e)):** the results change meaning (a press braces or burns its try; only a turned face is `flinched`), `windowMs` becomes the swing's length and the brace band is the same for every style, unannounced loses its raised hand, her hand's side is new (hashed); the README lists them.

**The jaw (P15a `jaw`; designed with the author on 2026-11-24 and approved in a live prototype after three rounds the same day: `docs/prototypes/jaw.html`, normative, its README lists what to port, what is prototype-only and the open engine questions).** The body and the speech on one axis (author: all together).
- **The input field is the mouth:** its frame opens with the jaw, her band is a ghost frame on it, its ends (the hinges) burn with what holding costs, drool gathers on its lower edge and drips, the letters smear from fatigue 70.
- **The mouse's height is the jaw** (down opens); fatigue pulls it shut (a spring, a tremor, closing twitches). **Holding is a craft** (author, round 2): resting just above her toes or on the ring costs a third of the engine's rate, higher costs more, wide open most; the endurance skill adds capacity.
- **Her toes** (`sole_to_mouth`): no speech; below her band the teeth touch her (one touch a dip, her word at most every 7 s, round 3); she pushes deeper, pulls back, orders "suck." (a narrow band just above her) or "wider." (never past 0.9, and the mouse reaches past wide open so a tired jaw can follow, round 3).
- **The ring gag** (`ring_gag`): every letter is spoken through the opening it was typed at (lips fail first, then the tongue's tip, then its back); she listens fairly (as clear as the ring allows) and often asks while she wants it wide: answer clearly or keep the order.
- **A rest** is asked by holding Shift or the right button (the engine's rule: cruel and vindictive refuse); a holder who refuses releases at her limit.
- `oral_service` waits for P17b (its depth and rhythm).

**Shoe service (P15a `tongue_work` on `boot_worship`; designed with the author on 2026-11-24 and approved in a live prototype after four rounds the same day: `docs/prototypes/shoe.html`, normative, its README lists what to port, what is prototype-only and the open engine questions).** All together (author): the dirt of her day, the shine, her inspection, her foot in use.
- **Footwear in general**, combat boots and high heels first, worn anywhere by her taste; always dirty from her day (ash, mud, oil, spores, parade dust, rain: colour, grit, dryness, resistance, taste).
- **Foot service's cleaning craft** carried over (strokes along her grain, the dry mouth, the kiss, the zones marked per picture); the dirt is drawn in its own colour, so dust shows on black leather.
- **Grit in the mouth:** swallow it, or spit it aside while she is busy on her device (her taps are heard and stop when she looks); caught, she answers.
- **Shine:** slow strokes on clean leather bring up a sheen (patent heels most); **the inspection:** a band of light sweeps across, her verdict names the worst zone.
- **The art:** two pictures per kind, the top seen from above (the kneeling commander's view) and the sole presented; each picture one foot (mirrored for the other) or two (framed per foot, the camera pans; both marked); a fit with a top fade, all a sidecar, so a scene is preset by data.

**Gulp (P15a `gulp`; content `watersports`; designed with the author on 2026-11-25 and approved in a live prototype after four rounds the same day: `docs/prototypes/gulp.html`, normative, its README lists what to port, what is prototype-only and the open engine questions).** Scheme C (author): swallowing and breathing as two resources, a signal to her, spills carried into cleaning.
- **Looking up at her** over the ceiling: her picture by the chain `over_explicit` (explicit content on: what watersports needs, her anatomy by her card, not nudity) → `over` (weight's slot) → her sprite from below; nothing of a body is drawn, the stream is heard.
- **The mouth is a warm tide** at the bottom of the screen; a swallow (Space) takes a part and no air, a breath (Shift) gives air and with a full mouth may be a cough that spills; air is the frame's edges and the heart; gulping without a breath and a fast flow build the reflex.
- **Her flow** by style: pauses, surges with a warning (ritual in words, cruel none, playful feints); a tap asks for slower and she answers by style.
- **Spills** pool; by style she makes the commander lick the floor clean, and every bit licked fills the mouth again; her check is a band of light.
- **Sound:** the author's recording of a pour into a mug (public domain), a soft and a strong loop mixed by her flow; recorded swallows and splashes.

**Her cards (the dock) in the scene's language (designed with the author on 2026-11-25 and approved in a live prototype after three rounds: `docs/prototypes/cards.html`, normative, its README lists what to port, what is prototype-only and the open engine questions; the texts are `docs/content/card-voice.md`, approved).** A restyle: no card's mechanics, answers, actions or `data-analyze` change, and the PDA's thread keeps its own look (§9).
- **Glass and her accent:** each card is the dock's glass with a stripe of her accent; her name in her hand heads it, the kind in small caps beside it. The moment and the fallback physics are not hers: a neutral stripe and a line of prose.
- **Her voice (variant B3, author):** her words (the model's `text`, or her static words for milestones, claims, returns, the envelope) **and the conditions** are in her hand. A condition is never the model's: it is a line of card-voice.md with the engine's value put in, the value in her stronger ink, underlined. Her style has its own lines (three each) for the frequent conditions (when, what it costs, who will know, the weight) and for the posture call; any other condition is a neutral line. The line is picked by a hash of the card (no rng). The order is fixed, and a condition is never left out (a cruel holder still names the cost, P16 R6). Readable mode adds the dry line under each condition.
- **The commander's answers** are plain pills in the cool accent of the dial, no brackets; sign is a pill held 1.2 s.
- **Collapsed cards are the edges of her hand (variant V, author):** strips above the open card, newest on top, each with her name in her hand, the kind, the engine's short name and the most urgent condition (a sealed task shows nothing of itself). This fixes the collapsed voice cards that showed only her name. A card with a clock never collapses.
- **The posture call is a full-frame moment (variant D, author):** her word large in her hand beside her; her foot taps her window (`postureWindowMs`) as sound and as ink dots that close up, the last one too late; her named postures rise from the dial as a fan of cards with the dial's mannequin, each clicked whole; after it, her line by style and outcome. The game of postures (points, drift, presets) stays P16b's.
- **The dial's circle never moves:** its label hangs under it and wraps (the real corner lets a wide label shift the circle; fixed in (e)).
- **Hands (author):** every hand of the gallery goes into the game: the six of P10b, six strict print hands and 36 candidates of every kind (`docs/prototypes/assets/hands`), each with a measured size factor (x-height and line width against Caveat).

**Next steps of the session (in order):**
1. ~~A **live prototype** of breathing~~ (done 2026-11-23; the results are above).
2. The other mini-games, one by one (breathing, weight, scent, `her_activity`, foot service under the desk, the slap, the jaw, shoe service and gulp done: every mini-game of P15a and P16 has its instrument but the posture call (P16b) and the small kin listed above (`pet`, the long kiss, counted kisses, the ceremony's count), which reuse these instruments. **The posture call waits for P16b** (author, 2026-11-24): its game is P16b's points, drift and presets, so it is designed in P16b's session; chunk (e) only restyles P16's existing call card in step 3 (her word large in her hand, the timer as her foot tapping, the choices as a fan of mannequin cards: a card is clicked whole, so §15's rule against fast clicks on the mannequin holds)), from the controller's idea list of 2026-11-23 (several per game, mixable). The author has not picked these yet:
   - **weight:** a level bubble in a glass vial while the frame tilts; her own PDA screen above the commander (peeking is a slip); cracks at the edges;
   - **saturation:** a coloured haze with her perception words drifting in it; a rising tide;
   - ~~**tongue work:** scratching grime off her boot or foot, which needs the author's art (SVG objects are excluded), plus her magnifier at the end~~ (built: foot service and shoe service, above; the magnifier became her band of light);
   - **her activity:** her report's pages turning; her screen;
   - ~~**jaw:** smeared, doubled letters and a spring of tension around the input~~ (built, above: the input is the mouth);
   - ~~**gulp:** to design~~ (built, above);
   - ~~**slap:** the camera snaps to her face, feints as twitches of her shoulder, a red flash and a fading red vignette~~ (built, above);
   - **posture call:** her word written large across the screen, the timer as her foot tapping, choices as a fan of mannequin cards (only as the restyle of step 3; the game waits for P16b).
3. ~~**Restyle the dock's cards to the scene's language**~~ (done 2026-11-25: "Her cards" above).
3a. **Decided on 2026-11-25 (author):** the dock's cards in her voice (variant B3, texts in `docs/content/card-voice.md`, approved); collapsed cards are the edges of her hand (variant V: her name, the kind, the engine's gist and the most urgent condition); the posture call is a full-frame moment (variant D) in `docs/prototypes/cards.html` (rounds in progress); **every hand of the gallery goes into the game** (the six of P10b, 36 candidates of every kind and six strict print hands; `docs/prototypes/assets/hands`, each with its size factor measured against Caveat); **the stage setup is chunk (f) of P10e**, designed after (e)'s plan: per woman (are her sprites found, how she stands on the stage, her hand and her accent as data), per art slot (load, fit, zones with the prototypes' marker, a preview in its mini-game, the sidecar saved beside the picture) and a list of every slot with its state; chunk (e) ports the games with their fallbacks (her sprite, automatic zones). The real dial's corner shifts its circle with a wide label (`.alius-stage-dial`): fixed in (e) as `cards.html` does.
4. ~~Write the design into this spec~~ (done 2026-11-25), then the **plan of chunk (e)** (`docs/plans/2026-11-25-p10e-e-instruments.md`), then build with the usual scheme: one Sonnet high agent, one Opus review, fast tests, `npm run test:layout`. The plan's tasks port the prototypes in `docs/prototypes/` exactly (code, not prose; author, 2026-11-24: a port that drifts means doing the rounds again), and its review compares the game against them side by side (screenshots at the same settings).

## Implemented as

Built as the plan describes, in `src/ui/scene/stage/` (the frame, the reply, the curtain, the top line, the chip row, the dock, looking around, the gauge, the flash), `src/ui/scene/dial/` (the mannequin and the dial) and `css/62-stage.css` (the mannequin's own classes are in `css/61-blocking.css`). Rendering only: no engine file, action, event, rng draw, state field or registry changed. The one engine-adjacent change is `ChatMessage.swipeCount?`.

**Rulings of the plan as built**
- **R1 (held strip, alarm card, wake card stay where they are).** The held strip is the shell's element and gets a glass pill look under the top line (`[data-screen="scene"]` rules); the alarm and wake cards are modals.
- **R2 (the shell's ASCII frame is hidden on the scene screen).** The shell marks `#alius-shell[data-screen]`; the close button is on the top line (`SceneScreenCtx.onClose`), the key hints are the two hints at the bottom-left.
- **R3 (swipes show n / m).** `ChatMessage.swipeCount` comes from `chat[i].swipes.length` (real) or is kept after the first swipe (fake); without it the curtain shows only ‹ ›.
- **R4 (the dial draws the 13 base postures from data).** The 47 presets of `docs/content/blocking.md` §7.3 are a test fixture (`tests/fixtures/dial/presets.ts`), not registry content. The drift ghost (`target`, `hot`) is a drawing API; nothing drives it yet.
- **R5 (the fan reuses the strip's model).** `blockingChoices(state, reg)` in `blockingStrip.ts` is the one model: rows, the commander's moves and the `[ + ]` entries with the reason a gate refuses each. The strip and the dial's fan both read it.
- **R6 (the physics panel is a dock card; the stop word is a pill, author's note A1).** The card (a heading, its controls as pills and her cue) draws no stop word; a small `STOP WORD` pill in the bottom-right corner over the dial (`.alius-stop-host`, `[data-stop-word]`, `data-analyze="glossary:stop_word"`) calls the same handler whenever the panel would offer the stop word (a run, anything that holds the commander, ways or acts to offer), with or without the dial. `renderPhysicsPanel` returns whether it is offered and takes `stopWord: false` from the scene (standalone it still draws its own). The chip row has no `stop` slot any more.
- **R7 (looking around; the sprites in room space, author's note A2).** `stage/look.ts`; the frame layer is the only layer that takes the pointer. The sprite layer holds a panorama that moves with `--alius-pan` as the backdrop does (`max(100cqw, 240cqh)` wide, `container-type: size` on the layer); a sprite's x is `--alius-sprite-x` in `cqh` from its centre, from `spriteSlots(count)` in `stage/sprites.ts` (one at the centre, two within the central view, three and more across the whole width, four at 0.85 of the size). When a reply from a woman lands the view turns to centre her (`attachLook(...).turnTo`, `panToCentre`), not within `DRAG_HOLD_MS` (8 s) of a drag or a recentre, not for what was there when the scene opened; reduced motion jumps; the memory keeps the pan after the ease.

**Where each host went** is the table of §12a.5; `tests/ui/stage/hosts.test.ts` holds it as data and finds each of today's hosts in its new place.

**After the review (the fix wave)**
- The dial's fan lists what is set on each person (NOW: her posture, place, activity, what is worn, the contact) with the strip's chips and the guarded × (`blockingChipEls`); this is how an item or a contact is taken off in the scene.
- While the device is up over the scene the scene is `inert` and `aria-hidden` (`syncSceneInert` in the shell), so focus, keys and clicks do not reach it; the scene's own `focusInput` does nothing under an inert root and the shell gives the focus back to the line when the device is lowered. A scene always opens with the device down (also when shown again), and `shell.showTab(id)` while a scene is shown raises the device over it on that tab.
- A running hold's card (`[data-run]`) is never collapsed by the dock, whatever card comes first; a button inside a collapsed card's heading does only its own action. The dock stands from 30 vh down (a stack taller than 46 vh scrolls inside it), so it never reaches a head box.
- The chip row measures overflow with `getBoundingClientRect` against the row itself (never `offsetLeft`). The history's wheel-down closes it only on an accumulated 240 at the end, in one direction, within a 500 ms pause. Looking around ends on a cancelled pointer, a lost capture or a move with no button held. `**bold**` reads as emphasis. The reply block is a polite live region. The dock's set-aside cross and counter, the chip row's +N and "more above" carry `data-analyze` (glossary `dock_cards`, `chip_overflow`, `reply_more`).
- `npm run test:layout` now also measures the chip row (`chips`, `chipsmany`), the stop-word pill, a tall dock (real cards) and each woman at the pan that centres her (`two`, `three`, `four`); Playwright is not a declared dependency (it comes from the environment).

**Non-obvious things to know**
- **Layers are explicit.** Nine layers in a fixed z-order (`css/62-stage.css`); every z-index in the stylesheet stays below the analysis panel's 10 (a test pins it). Only the frame layer has `pointer-events: auto`; the UI layer and its children take it back host by host.
- **The scene is not rebuilt for a redraw.** `refresh()` keeps the layers, the reply, the curtain and the dock; a new scene id rebuilds everything. Anything keyed by scene id (the looked-around view, the cards set aside, the open history, the hints) is module memory that `resetSceneStage()` clears (the app calls it beside `practice.onChatChanged()`); a module with such memory registers with `onStageReset`.
- **The reply block is not the transcript.** It shows the replies since the commander's last message (only the echo while the commander waits); the whole transcript, the edit box and the swipe tools are the curtain's, drawn only while it is open. Edit tests open the history first.
- **The curtain moves the input line, not a copy.** The same nodes (text and focus) move between the input host and the curtain.
- **Esc.** The scene's Esc is a document listener (closes the history); the shell's runs first, so it looks for `.alius-scene[data-curtain="open"]` instead of relying on `defaultPrevented`.
- **The dock's slots are the hosts the draw functions write into** (they keep their old classes); a card is a direct child of a slot; its key is `sceneId|slot|first data-* id`. The slot order is the order of precedence: the first non-empty slot's first card is open, a click on a collapsed card's first child opens it. Cards are decorated after every redraw (`dock.layout`).
- **The chip row's slots wrap the old chip hosts.** Overflow scrolls sideways and ends with "+N"; a discipline menu opens upward over the row (the row stops clipping while a menu is open).
- **The device over the scene** is a second host (`.alius-scene-device`) built by the same `buildDevice` as the hub's; raising it never re-renders the scene. `ShellDeps.deviceLocked` / `onDeviceRefused` refuse Tab while the hands are busy.
- **The dial draws the base the blocking holds** (standing while none is set), by `mannequinSvg` as the per-posture review fixed it (see §7). Her name for a posture is read through `Knowledge.practice(...).postures`. Anchors and held items are not hinted on the figure yet (the mannequin supports `hint` / `item`; mapping an anchor or a worn item to one is P16b's).
- **Bracketed labels.** The stage's own `[ SAVE ]`, `[ CANCEL ]` and `[ STOP ]` are `Save`, `Cancel`, `Stop`; `[ ORDER ]`, `[ COMPEL ]` and the cards of other packages keep their text.
- **Tests that changed beyond a selector, by design:** the two P10c tests that pinned `placeSprites` (replaced by a CSS assertion), the pointer-follow pan tests (replaced by the right-button look), the speaker label (`ANN //` is now `ANN`, `YOU` for the commander), and two `shellDevice` tests that used the scene route as "a full-window screen with no device" (they use `combat`; the scene now carries the device, tested in `tests/ui/shell/sceneDevice.test.ts`).
- **`npm run test:layout`** (not in `npm test`; needs Chromium) renders the real scene screen with a generated placeholder sprite at 1920×1080, 1280×800 and 2560×1440 for five fixtures and measures the acceptance criteria of §12. Run it after any change to the stage's CSS. `LAYOUT_SHOTS=<dir>` also writes screenshots. `npm run dial:sheet` renders the contact sheet of the mannequin.

**Open items**
- The 48 presets, drift and named postures come with P16b; the dial then supplies `target` and `hot`.
- Each mini-game's instrument comes with chunk (e) (§15; the input frame's gauge API and the dial's dimming while one runs are ready).
- Using the device in front of her as an act she may notice is a later package.
- P17c's camera fills the frame, surface and pose-shot layers (empty today) and hides the sprites layer for a POV view.
- Collapsed voice cards of the dock show only their first child (the speaker's name): fixed by chunk (e) (§15 "Her cards": the edges of her hand).
- The art in the layout test is a placeholder: legibility of the reply over the author's sprites is judged by eye (the bottom gradient is the lever).
- A card's heading is its first child; a card whose first child is not a heading collapses oddly.
- No touch or keyboard fallback for looking around; the curtain and the history button work by click.
- Inter and Plex carry no Cyrillic (the game is English).
