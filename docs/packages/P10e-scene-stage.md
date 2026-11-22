# P10e — The scene stage: full frame, prose subtitles, the history curtain, the posture dial

**Status: spec** (design session 2026-11-22). **Depends on:** P10 (shell, `motionReduced` / `visualFlags`, `unitAccent`), P10b, P10c (full-bleed backdrop, light, knee-length sprites), P14 (generation chips), P15a (blocking, moments, physics), P15, P16. **Prepares:** the mini-games design session (next), P16b, P17, P17c (camera, POV views, pose shots, frames).

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
- Two or three: left / centre / right as today, scaled down so they do not overlap more than a shoulder; the speaker is brought forward (brightness, a slight scale), the others dimmed.
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

- Every card the scene draws (moment card P15a, milestone, claim and return cards P15, task, punishment and demonstration cards P16, the posture call P16, the held strip and the alarm card P16, the wake card P15a, a blocking proposal) is placed in **one dock at the left side of the frame**, vertically centred, about 420 px wide, never over her face.
- One card is open at a time; the others are collapsed to their title line above it (newest on top). A card can be set aside to a small counter in the dock's corner ("2 waiting") and brought back.
- Cards keep their content, voices and `data-analyze`; only where they are drawn changes. Their look moves to the scene's language (glass, the speaker's accent, no `[ BRACKETS ]`), voices stay readable (P10 voices).
- **While the curtain is open** the dock moves to the right of the curtain.
- **Full-screen moments** (the slap, a wake card after a blackout, her hand-raise cut-in) stay full-screen overlays for their short time; they are the only UI allowed to cover her.

## 7. The posture dial

- **Bottom-right**, about 200 px, a dark glass circle with a thin ticked ring. It shows **posture only**: no air, no strength, no other tracker (each mini-game brings its own instrument when it starts and takes it away when it ends; the dial may dim while one runs).
- **The figure** is a small **3D mannequin drawn as line art at a three-quarter view**, built from the posture's point states (P15a `blockingPostures`: torso, hips, knees, arms, head, gaze, feet; `docs/content/blocking.md` §7). It is not 48 drawn pictures: each point state maps to joint angles, the mannequin is posed in 3D and projected, and drawn as a few gradient strokes with ring joints. The three-quarter view is needed because a side view cannot show knees apart, arms out sideways or elbows out behind the head.
  - The **gaze** is a faint dashed ray from the head (down, at her, straight, closed = none).
  - **Drift** (P16b's posture endurance): the target posture is drawn as a dashed ghost, the actual body as the solid figure; a drifting joint glows amber. Clicking a joint (or keys 1–7 when the input is not focused) corrects it, as P16b specifies.
  - Anchors and held items are hinted with one line (a wall behind, the floor line, a tray held level), not drawn as objects.
- **Label** under the dial: the posture's name, or her name for it (P16 named postures); a second dim line when relevant (EYES DOWN).
- **Choosing a posture:** a click on the dial's centre opens a fan of the postures the blocking offers now (`entryAllowed`), each as a small mannequin thumbnail with its name; anchors, contacts and items follow as lists in the same fan. This replaces the BLOCKING strip in the scene; the strip's rules (what is offered, her answers, the content gate) do not change.
- **The spike (2026-11-22, approved in look by the author)** settled the drawing: an artist's wooden mannequin, not a stick figure. Each segment is a capsule (a light outline stroke under a dark fill stroke; thickness per segment: torso, pelvis, thigh, shin, upper arm, forearm, neck, foot), segments are drawn far to near by projected depth, the far side is a darker outline, the floor is a faint parallelogram, the scale is fitted per posture to the dial (lying postures are not tiny), joint rings appear only on a drifting joint. A three-quarter view: yaw about 38°, elevation about 14°, orthographic. The head pivots at the top of the neck (the neck rises along the spine, then the head tilts; a tilt back lifts the chin and must never put the skull behind the shoulders) and carries a small jaw toward the face so a tilt reads; a small dot marks where the face looks. Lessons for the build: limb lengths need a two-bone solver (the spike let arms stretch to reach the floor); the three curled bases look alike and lean on the anchor hint; `hogtied` and `bent_over` need their item or anchor line to read; the gaze ray of a drifting gaze should be brighter than a held one.
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
