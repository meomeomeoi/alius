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

```bash
npm run proto -- her_activity
```

Each writes `.superpowers/prototypes/<name>.html` (ignored by git): one self-contained page with the fonts, backdrops and a placeholder sprite (`tests/fixtures/layout/sprite.svg`). `--sprite <file>` uses any local sprite; **never commit the author's art**. Open the page in Chromium. `H` hides the panel; `window.__S` (settings), `window.__G()` (state) and `window.__forceO` (force the opening, 0–1, `null` to release) exist for screenshots and tests.

## `her_activity.html` — her activity, the frame of her time, with stillness inside (P10e §15 "Her activity")

**In progress: not yet approved.** Built on 2026-11-23 from the design in P10e §15. Nothing here is normative until the author approves it; this section then lists what to port. Run it with `npm run proto -- her_activity`; it needs the CC0 sounds in `assets/ha/` (`assets/LICENSES.md`).

What it shows:
- **The four views** (`VIEWS`): `her` (the room, her sprite lit by her lamp or screen; she leans a little toward the commander when she looks), `legs` (under her desk: `frame_under_desk` over the room, her shins in weight's material; variants `planted`, the default, and `crossed`; the panel's **legs art** loads an art slot `legs_seated`, a picture with a transparent background placed between the room and the desk, which replaces the silhouettes and is never committed), `floor` (eyes down by her bunk), `wall` (`pov_corner`); a blindfold makes any view hearing-only. Each view says where her sounds and the door are (screen position and stereo pan).
- **Her activities** (`ACTS`, twelve): each with its attention word, how it moves her presence per phase (`absorb`), how well she hears, its light (lamp, screen, dark), its clock unit, its marks (a `seen` and a `heard` wording, a sound, a progress step), her self-talk and her end. Nothing is drawn: the marks are sounds and sensory lines on the side of the source.
- **Her presence** (`baseScore`, `stepOf`): four steps (`with`, `glancing`, `own`, `use`) from her activity's attention, talkativeness, style, Regard, hold band, mood and a hash of the session; it drifts between phases (`absorb`). It sets her attention (`ATT_BY_STEP` mixed with the engine's `gaze.attention`), how many lines reach the commander and how she answers a fault (`react`: a word, a look, her body, or nothing unless gross).
- **Stillness: the cursor is the commander's attention** (`updateUrges`): an itch (a hot spot) grows while the cursor rests on it and fades while the cursor rests on her (her legs, her sprite, her sensory lines, her written lines) or on the door; the urge to swallow only grows, a warm swell rising from the bottom edge (swallow under her voice); numbness creeps up from the bottom with the fiction hours (click the bottom band: shift the knees); a cramp is breathed through (hold Space 2.6 s) or stretched out (click it), else the leg jerks. Every relief is a sound with a loudness; she notices by hearing (`herEars` × loudness × (1 − cover)) or by sight (`CAUGHT` by her attention).
- **Cover** (`coverNow`): her spoken lines (0.75), a visitor's voice (0.5), the mess and the rain. On a call the line hears what the room hears while she listens (`callHeard`); an unaware visitor too (`visitorHeard`).
- **The script** (`planScript`, `exchangeScript`, `runScript`): the normative SHAPE of what the pregenerating call returns (`{ at, who, to, text, covers, ask?, mention? }`); the content is placeholder. Lines to the commander carry her name for the commander and, under the desk, a press of her foot; a question opens a window to answer by typing (Enter); answering her self-talk is a breach. A mention of the commander to someone else goes through `mentionText` (plain if the listener knows or the relation is public enough, plain anyway with a reckless tactic, veiled or unsaid otherwise).
- **Peaks** (`planPeaks`): steps that stop at the door and pass (`falseAlarm`), an incoming call (`incomingCall`: her foot comes to rest on the commander's shoulder), a visitor (`visitorPeak`), and in `use` she leaves the room and comes back unannounced (`leaveRoom`).
- **The base by the hour** (`BASE_EVENTS`): the mess bell and the squad at supper through the walls, dusk (she turns on her lamp), the patrols, lights out (a far horn, the generator drops), rain.
- **Between phases** (`startSkip`, `resolveSkip`): the dark, the clock running over the skipped part of the hour, her marks compressed into seconds and the base events of those hours as one line; four gestures in the cool accent (keep still / ease off slowly / move while she reads / ask), resolved with the engine's `resolveSkip` numbers.
- **The end** (`finish`): by presence: her end line (`with`, `glancing`), two taps of her foot (`own`), or the forgotten end (`use`: the lamp off, her steps, the door; GET UP or wait until someone finds the commander). The stop word always ends it.
- **The digest** (`showDigest`): what the scene that follows is told (only what she perceived) and what only the commander knows.

Not yet in it (next round): the approved weight (`footrest`) running inside the frame; foot service under the desk (the next game).

## `saturation.html` — scent (P15a `saturation` with the stimulus body layer)

Approved by the author on 2026-11-23, after ten rounds (the defaults of the file are the approved state: look `motes`, the recorded breath in `natural` mode, the flesh edge light). Run it with `npm run proto -- saturation`; it needs `assets/breath-in-out.mp3` (CC0, `assets/LICENSES.md`).

### Normative (port exactly)

- **The view.** The dark shapes are breath.html's, copied as code (`squashOf`, `SEAT_BODY`, `chaikin`, `SHAPES.gap / seat / wedge`, the same three low-resolution canvases and the flesh edge light `rgb(226,78,52)`): `feet_on_face` → `gap`, `face_to_bottom` → `seat`, `smothered_armpit` → `wedge`, at a rest opening of 0.35 that a press closes (−0.15) and a reward opens (+0.25). Her shape moves a little against the face (parallax 0.06 / 0.05 of the screen). The ceiling behind.
- **Her places** (`zonesOf`): per contact, the named places with weights (feet: toes 1.0 on the gap's axis and 0.9 on each sole, the ball 0.8, the arch 0.55, the heel 0.65; seat: center 1.0 / 0.85, sides 0.45; armpit: the hollow 1.0 / 0.9 inside the dark, the edge 0.5 / 0.45 toward the light). **The strength at the face** (`intensityAt`): a base by contact (`BASE_I`: feet 0.2, seat 0.35, armpit 0.45; the face is already in her scent) plus the nearest place by a Gaussian of 0.13 screen heights.
- **The face** is the mouse, plus the body's pull by stage (`STAGE_PULL`: aversion pushes away only while breathing in, craving and adoring pull always, harder as the head fills), smoothed (slower as the head fills; locked onto her strongest place while lost).
- **The breath in** (Space or the left button): depth grows over 1.5 s to 1 (to 1.25 at most). The reflex when `depth × strength × band/1.5 > 0.3 + tolerance/100 × 0.8`: a cough, two words thrown out, the line typed loses a few letters, her line (or "liar." after a lie, and two presses).
- **The arc at the face** (`#arc`): the track, her band (the bright part), the tolerance as a white tick (it moves lower near her strongest places), the danger beyond it in red, the fill turning red near the threshold, the heart of the arc warming and growing with the strength at the face (`aProx`, `aProxGlow`), the need-to-breathe ring (4.5–7 s). Hidden while she asks.
- **The head** (`addWord`, `breathWords`, `tickWords`): each breath of depth ≥ 0.3 leaves words that fly in from where they were breathed and circle the face: the place (if at one of hers), her scent, the honest stage (depth ≥ 0.65), the band (depth ≥ 0.9); 1 word, 2 for a deep breath, +1 near her strongest place. Her band fills the head by itself (`AMBIENT_MS`: faint never, noticeable 9 s, strong 6 s, overwhelming 3.5 s). The capacity is the tolerance (`6 + tolerance/12`). The fuller the head, the closer and larger the words. **Overflow** (`overflow`): lost in her for 3.2 s, the face goes to her strongest place and breathes deep by itself, then half the words scatter.
- **The mouth** (Shift or the right button): air without her scent (it resets the need to breathe), one word blown out every 420 ms; heard with her attention's chance × 0.25 for a breath shorter than 0.9 s, × 0.6 for a longer one; her answer by style (`STYLES[].mouth`).
- **The need to breathe:** after 7 s without a breath the body breathes deep through the nose by itself.
- **Her orders** by style (`STYLES`: `every`, `orders` weights, ritual's `cycle`, clinical's `tour` of her places, playful's mark that `moves` once you get there): deeper (band 0.7–0.95), gently (0.25–0.45), a place (`nameplace`: her mark, a pulsing ring in her colour, more motes there, her line beside it; the face is there within 0.085), still (60 px). Turning away while she watches costs a press.
- **Her question** (`askWords`, `buildPills`, `sayables`, `judge`, `answerWords`): rare (`askEvery`), about a named place she marks; the pills are the head's words (one per word) tagged where / scent / feel / how strong, plus what she would like to hear (dashed "say it" pills: a lie the body may give away by a cough within two breaths); two picked (pointerdown or keys 1–6), 12 s; her rule by style (`rule`: any, warm, admit, bad_and_want, place_and_band, band_and_honest); right: she lifts and two words leave; wrong: her line says what was missing, a press, and some styles send the face to the place; nothing to say: "then smell it properly". What is said leaves the head.
- **The vocabulary** (`SCENT` by her scent, `STAGE_W` by stage, `BAND_W` by band, `PLACE_W` by place, `HER_PLACE` in her words): the variety is part of the design (the author asked for three or four times the first draft).
- **The look of her scent:** `motes` (`spawnMotes`, `drawStreams`): specks of light rising from her places (×3 from the place she names), drifting and twinkling, drawn into the face along threads on a breath; her scent's colour (`COLORS`; sweat is a warm skin light, never brown).
- **Saturation as the picture:** `saturate(1 + 0.85 f)`, `contrast(1 + 0.1 f)`, a slight blur, the bloom layer (up to 0.45), the warm edge glow (up to 0.32), the frame breathing; the world's sounds dull and a warm drone rises. The input takes her in (`tint`): at a full head a word typed may turn into one from the head or her name, in her colour.
- **The sound:** the recorded breath (`SAMPLE`, `recInhale` in `natural` mode: the whole inhale slowed to the fill time, rate ±3 %; `recExhale` by depth; `recMouthTick`: short inhales and exhales in turn; level 0.21, the mouth 0.25; lowpass 3.2 kHz, the mouth 1.6 kHz). `paul` (paulstretch of the inhale's middle) is the stretch for breaths longer than the recording. The synthesised breath is the fallback. Coughs, page turns (her attention, heard), pen scratches, the chime of a named place.

### Prototype only (do not port as is)

- The panel, the presets, the start overlay, the summary card, the debug readout, the `__` hooks.
- Her order and attention schedule (the game plays the engine's plan), the numbers duplicated from the engine (`BAND`, `NOTICED`, `INHALE_FILL_MS`), `LINES` and the question texts (the cue pool, `physics.cues`), the stand-in of her scent's colour and words (each woman's own scent is P17d).
- **Rejected:** the look `haze` (brown smoke: the wrong associations), the stretch `grains` (sniffing). **Not chosen:** the look `ribbons` (kept as an alternative).

### Open engine questions (decide in the plan of chunk (e))

- The engine's gauge is a fill of +10 × band a beat and −20 a mouth breath; here the saturation is the words in the head, its capacity the tolerance. Decide how the head maps to the gauge (one word = capacity/100 of it) and whether the depth, the place and the words become inputs.
- Her question, her rule by style, a lie and "liar." are new: they need engine events (and the memory check: a lie found out may be worth remembering; the rest is bookkeeping).
- The overflow ("lost in her") and the body's pull are new readings of the stage and tolerance.

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
