# Mini-game prototypes (P10e chunk (e))

Each file here is a **reference prototype** of one mini-game instrument, built and tuned with the author in the design session (P10e spec §15) and approved by playing it. **A prototype is normative: chunk (e) ports it into the extension exactly.** Port the drawing code, shapes, numbers, easings, timings, colours, sound synthesis and her lines' behaviour as they are, adapting only the wiring (state, engine, settings, the scene's layers). Do not redraw a shape "in the same spirit": the author rejected several drafts of these silhouettes, and the approved geometry is the code here. Where the extension cannot do something the same way, stop and report.

Run one:

```bash
npm run proto -- breath
```

It writes `.superpowers/prototypes/breath.html` (ignored by git): one self-contained page with the fonts, backdrops and a placeholder sprite (`tests/fixtures/layout/sprite.svg`). `--sprite <file>` uses any local sprite; **never commit the author's art**. Open the page in Chromium. `H` hides the panel; `window.__S` (settings), `window.__G()` (state) and `window.__forceO` (force the opening, 0–1, `null` to release) exist for screenshots and tests.

## `weight.html` — weight (P15a `weight`, hold): DRAFT

In review with the author; not normative until this line says so.

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
