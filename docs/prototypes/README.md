# Mini-game prototypes (P10e chunk (e))

Each file here is a **reference prototype** of one mini-game instrument, built and tuned with the author in the design session (P10e spec §15) and approved by playing it. **A prototype is normative: chunk (e) ports it into the extension exactly.** Port the drawing code, shapes, numbers, easings, timings, colours, sound synthesis and her lines' behaviour as they are, adapting only the wiring (state, engine, settings, the scene's layers). Do not redraw a shape "in the same spirit": the author rejected several drafts of these silhouettes, and the approved geometry is the code here. Where the extension cannot do something the same way, stop and report.

Run one:

```bash
npm run proto -- breath
```

```bash
npm run proto -- weight
```

```bash
npm run proto -- saturation
```

Each writes `.superpowers/prototypes/<name>.html` (ignored by git): one self-contained page with the fonts, backdrops and a placeholder sprite (`tests/fixtures/layout/sprite.svg`). `--sprite <file>` uses any local sprite; **never commit the author's art**. Open the page in Chromium. `H` hides the panel; `window.__S` (settings), `window.__G()` (state) and `window.__forceO` (force the opening, 0–1, `null` to release) exist for screenshots and tests.

## `saturation.html` — scent (P15a `saturation` with the stimulus body layer): DRAFT

In review with the author; not normative until this line says so. The current design: the saturation is the words in the commander's head (each breath leaves words: the place, her scent, the honest stage, the band; the band fills the head by itself); the head's capacity is the tolerance; an overflow is being lost in her (the face goes to her strongest place and breathes deep); the mouth is air without her scent and breathes words out (short is quiet, long is heard); her rare question asks to name what is in the head, and her style decides what she wants to hear. The breath is a recorded CC0 inhale and exhale (`assets/breath-in-out.mp3`, see `assets/LICENSES.md`) stretched by granular playback of the inhale's middle (0.50–0.92 s, past its peak: grains of 200 ms, four overlapping under **sine** windows (equal power: triangular windows dip at every crossing, heard as sniffing), read by a pointer crawling at a quarter speed, each evened against the recording's level; a 4.2 kHz lowpass takes off the crispness) (`SAMPLE`, `piece`, `recInhale`, `recTail`, `recExhale`, `recMouthTick`); the synthesised breath stays as the fallback.

## `breath.html` — breathing (P15a `breath`, timing)

### Normative (port exactly)

- **The dark** (`render`, "the dark" section): three canvases at a quarter of the screen's resolution (`DS = 4`), upscaled by the browser (the softness of every edge comes from this):
  - the air canvas: the shape paints the opening in white;
  - the glow canvas: the air blurred and tinted (`flesh` red `rgb(226,78,52)`, `rim` orange `rgb(255,168,104)`, a false window pink `rgb(255,110,170)`; blur radii by `o`);
  - the dark canvas: `rgb(6,4,8)` at `darkA`, the glow `source-atop` twice (sharp and blurred), the air cut out `destination-out` with a 1 px blur. A press shakes it.
- **The shapes** (`SHAPES`): `slit` (default), `gap`, `lift` (with `sideFrame` for its side), `slide`, `seat`, `squeeze`, `wedge`. `o` is the opening (0 shut, 1 a full window, above 1 the exit). Each returns `focus`, `lip` and `text` (where the camera looks, the TAP ring, her hand).
  - **`seat` is the approved silhouette** (author's ruling after five variants): `SEAT_BODY` (the half outline), `chaikin` ×3, the per-side springs `G.sp` (stiffness 58 / 74, damping 7.5, `squashOf`), the recession `1.38 / (1 + 0.28·L)`, the rock and the seam. The `seat_x_*` shapes are **rejected variants**, kept only so the history is visible; do not port them.
  - `blob` is used by the rejected variants only.
- **The view behind the dark** (`VIEW_OF`, `#ceiling`): `ceiling` by default, `room` for `slide`, `her` only where her face is there. The sprite fades as the camera closes in and appears at the exit. The ceiling's drift, blur and light by `o`.
- **The camera** on her sprite (the transform in `render`: the face anchor, close scale `zoom`, `rotateX` 9° from below, her lift by `o`, the breathing scale).
- **Air as vision:** the tunnel (`#tunnel`: black from `r0` to `r1`, the red rim pulsing with the heart at the tunnel's edge), the world's blur, saturation and brightness, the grain's opacity.
- **The input under the air** (`letters`): the narrowing width, the per-letter clarity (decay `0.42·((60 − air)/60)^1.4` per second, a breath restores, lost letters sent as dots), the border pulsing red under 30 %.
- **Her hand** (`say`, `.her-line`): Caveat, the stepped writing reveal (speed by style), her accent colour with a dark halo, the placement at `text` beside the opening, a tilt of −4…3°, the lifetimes; a pen scratch on each line.
- **Her cues by style** (`STYLES[].cue`, `scheduleWindow`): `count` (ritual), `honest` (only "now."), `false` (playful: false windows, a teasing count that may end in "again."), `none` (cruel: nothing). The count's spacing per style (`count`, `jitter`).
- **The window** (`openWindow`, `windowOpenness`): rise 260 ms (snappy 110), open `widthMs × wmul` (`wmul` 2), fall 320 ms (snappy 140); a false window snaps shut in 90 ms when reached for.
- **Breathing and over-holding** (`updateLoop`): credit `30 / W` per ms while held in an open window (a window caps at +30); a missed window a sip (+8, cruel +4); over-holding after 150 ms drains the air at double rate, presses, and at 450 ms she notices (her `greedy` line, streak reset, her windows delayed by `overDelay` beats, a spring impulse).
- **The heart** (`heartTick`): lub-dub on the body bus, 64 → 150 bpm as the air falls (`smooth(85, 5, air)`), the visual pulse on the same beats.
- **The sound** (`audioInit`, `noise`, `thump`, `SFX`, `inhaleStart`): everything synthesised, nothing loaded. Two buses: the world (lowpass `16000·(380/16000)^f` with the air, the room tone muffled by her cover) and the body (heart, breath, never dull).
- **Entry, exit, blackout, wake** (`begin`, the `entry` / `exit` / `blackout` phases in `frame`, `wake`): their durations and curves.
- **TAP** (a ring at the lip, her answer by style) and the **stop word** pill.

### Prototype only (do not port as is)

- The panel, the start overlay, the summary card, the debug readout and the `__` hooks.
- **The rhythm scheduler** (`scheduleWindow`'s random beats): in the game the windows, false windows and cues come from the engine's segment plan (`planSegment`); the instrument plays that plan. The prototype only mirrors it.
- **The numbers duplicated from the engine** (`BEAT`, `DRAIN`, `CAUGHT`, `MISSED`, `SEAL_RELIEF`, `STYLES[].windowMs`, `falseShare`): the game reads `TUNING.physics` and her style.
- **`LINES`**: placeholders for P15a's cue pool (`physics.cues`, fallback `physicsCues`); the game takes her lines from there. `greedy` is a new cue kind the pool needs.
- The tap's answers stand in for `holdsUntil` and P15a's `physics/signal`.

### Open engine questions (P10e §15, decide in the plan of chunk (e))

- The held credit and the over-hold input are not in `resolveSegment` (today a breath counts on the beat and `widthMs` is unused by the UI).
- In real time the engine gives a cruel holder a cue on every opening; the instrument needs her silence.
- With the engine's numbers even perfect play loses air (her release at the limit after about ten windows).

## `weight.html` — weight (P15a `weight`, hold)

Approved by the author on 2026-11-23 (the face-up view as first built; the face-down view after two rounds: her legs `hang`, foot `relaxed`, shade `shadow`).

### Normative (port exactly)

- **Two views by the contact** (`CONTACTS[].face`):
  - **face up** (`straddled`, `standing_on`, `boot_on_chest`): the ceiling art behind (`#ceiling`, blurred, dimmed), her from below (`placeSprite`). The art slot `over` (a sprite drawn from below) when it exists: height 1.04 vh, bottom at 1.02. Without it the ordinary knee-length sprite rises from the bottom edge: height 1.55 vh, bottom at 1.42 vh, `rotateX(10deg)` in a 1100 px perspective. She leans with her shifts (`rot = lean·3.2 + cop·2.2` degrees) and comes closer as the strength goes (`press`). A cool screen glow on her while she reads (`#screenGlow`).
  - **face down** (`human_chair`, `footrest`): the floor art (`#floor`; it is already drawn in perspective, so no extra rotation), closer and softer as the strength goes (`near`, the floor's blur and brightness).
- **Her legs in `human_chair`** (`drawFloor`, `legsHang`, `legPoints`, `LEG_FEET.relaxed`): her calves hang at the edges of the view, the outer side off the frame. Geometry: the `relaxed` outline, its y scaled by 0.86, mirrored for the right leg, smoothed by `chaikin` three times. Motion: before a shift the leg on her side presses in (`press`) and the other lifts and swings out (`lift`); while she reads her feet bounce, the right one more (`Math.sin(t·3.1)`, amplitude 1 and 0.35), otherwise a slow sway; a jolt on impact. Drawing: four quarter-resolution canvases: the legs (`legC`), their complement (`compC`), the complement blurred by 0.022 H and tinted flesh red `rgb(226,78,52)` (`rimC`), the legs blurred by 0.012 H and filled `rgb(34,22,22)` with the rim `source-atop` at 0.55 (`outC`).
- **`footrest`**: she is not in view. The tell is heard: the rustle and the chair's creak panned to the side she is about to lean (`StereoPannerNode`, `pan` ±0.85).
- **Her screen's light on the floor** (both face-down contacts): a cool pool `rgba(120,170,255, 0.34·attention·flicker)`, blurred 0.07 H, sliding with her lean (`0.16 W`) and weight (`0.1 W`). Attention: busy 1, glancing `0.45 + 0.25·sin`, watching 0.05.
- **The level** (`#vial`): the whole SVG (brass caps with screws, the amber liquid and its gradient, the engraved scale, the sheen, the elastic bubble, the tolerance marks that light when level, the warm glow under it), scaled 1.3, 186 px above the bottom, tilting with the frame at 0.35 of its angle. The bubble is a spring on the error (stiffness 260, damping 16) and stretches with its speed.
- **The frame**: it tilts by `err·6°`, sags 26 px on a slip, trembles by `strF²·5 + jolt·7` px; the strain vignette (`#strainV`); saturation falls with the strength.
- **Cracks** (`crack`, `healCracks`): a slip or a hard landing cracks the frame from a random edge: branching polylines in three strokes (dark shadow offset, light line, warm blur), drawn on in 260 ms, healing from 8 s to 22 s.
- **Typing under load** (`letters`): the letters of the line tremble with the strain (`strF²·4`, more on a jolt).
- **The mechanics**:
  - Space or the left button bears her; a hold that breaks is a slip at once (strength −8·weight·pressure, a jolt, a crack, a creak), once a beat, after one beat of grace; a slip extends the hold by 6 s (P15a's chain) and she says so.
  - The mouse is the commander's balance (a spring, stiffness 90, damping 14, `(x·2 − 1)·1.15`); the error is her centre of weight minus the balance; level is `|err| ≤ 0.18`.
  - Her shifts every 3–5 beats (ritual every 4): a telegraph by style (`STYLES[].tele`: neutral 650–850 ms, affectionate 900–1100, ritual 750 and her written "left." / "right.", playful 500–750 with 35 % feints, clinical 150–1100 at random, cruel none), then the landing: if the hold was uneven on this beat or the last one, −(15…25)·weight·pressure, a jolt, a crack.
  - Her own wander (`sin(t·0.9)·0.05 + sin(t·2.3 + 1)·0.025`), so the balance is never still.
  - Uneven holding drains faster: `1 + 1.2·max(0, |err| − tol/2)` (on by default; see the open questions).
  - The commander's own shift (Shift or the right button; while typing only the right button): +15, a 2.6 s cooldown, a creak; caught by her attention (watching 0.6, glancing 0.25, busy 0.08): −10, she leans heavier for 3 beats, her line.
  - She leans in heavier now and then (`pressure` 1.3–1.6 for 2–4 beats, more often for cruel).
  - She gets off at 15 % (cruel at 5 %), `holdsUntil`; with "she holds until you buckle" the end is the fall at 0.
  - While she is busy her fingers tap her screen (a sound): the tapping stops when she looks.
- **The sound** (`SFX`): the creak (stick-slip: a fast train of 12 ms clicks through a 420–780 Hz resonance), her rustle and press, the screen taps, the breath through the teeth (as the strength goes), the grunt on a hard landing, the low strain rumble with its tremble (an LFO 7–13 Hz), the fall.

### Prototype only (do not port as is)

- The panel, the start overlay, the summary card, the debug readout and the `__` hooks.
- **Her shift and attention schedule** (`onBeat`, `planShift`, `attentionDraw`): in the game the engine's segment plan gives the shift beats and her attention per beat (`planSegment`, `attentionPlan` by her activity's attention); the instrument plays the plan and only times the telegraph before each shift.
- **The numbers duplicated from the engine** (`BEAT`, `W_DRAIN`, `RELIEF`, `SHIFT_EVERY`, `SHIFT_COST`, `CAUGHT`, `ATTENTION`) and the contacts' `weight` / `shift` multipliers (the game reads its contact and `run.pressure`).
- **`LINES`**: placeholders for the cue pool (`physics.cues`).
- `TASKS`: a stand-in for her blocking activity's `attention`.
- **Rejected:** the legs `x_side` and `x_forward` and their `lowerLeg`, `legsSide`, `legsForward` (they read as sticks), the feet `first` and `pointed`, the shade `black`. Kept only so the history is visible; do not port them.

### Open engine questions (decide in the plan of chunk (e))

- Uneven holding costs strength continuously here; in the engine it costs only when a shift lands. Either the engine gets the cost, or the instrument drops it.
- The level is a UI judgement: the instrument sends the engine's `hold` input only on a beat that was held and level. Decide whether "level" is reported as its own input.
- The telegraph's lead time per style is new (the engine plans the shift beat, not its warning).
- With the engine's numbers the strength lasts about 20 s without the commander's own shifts: resting under her attention is the game's decision, by design or a tuning question.
