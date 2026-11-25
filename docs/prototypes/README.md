# Mini-game prototypes (P10e chunk (e))

Each file here is a **reference prototype** of one mini-game instrument, built and tuned with the author in the design session (P10e spec §15) and approved by playing it. **A prototype is normative: chunk (e) ports it into the extension exactly** (author, again on 2026-11-24: the executor ports the code, not a re-creation, wiring it to the extension; every approved game took many rounds, and a port that drifts from the prototype means doing them again. Where the extension cannot do something the same way, stop and report; the review compares the port with the prototype side by side at the same settings). Port the drawing code, shapes, numbers, easings, timings, colours, sound synthesis and her lines' behaviour as they are, adapting only the wiring (state, engine, settings, the scene's layers). Do not redraw a shape "in the same spirit": the author rejected several drafts of these silhouettes, and the approved geometry is the code here. Where the extension cannot do something the same way, stop and report.

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

```bash
npm run proto -- slap
```

```bash
npm run proto -- jaw
```

```bash
npm run proto -- shoe
```

```bash
npm run proto -- gulp
```

Each writes `.superpowers/prototypes/<name>.html` (ignored by git): one self-contained page with the fonts, backdrops and a placeholder sprite (`tests/fixtures/layout/sprite.svg`). `--sprite <file>` uses any local sprite; **never commit the author's art**. Open the page in Chromium. `H` hides the panel; `window.__S` (settings), `window.__G()` (state) and `window.__forceO` (force the opening, 0–1, `null` to release) exist for screenshots and tests.

## `gulp.html` — gulp (P15a `gulp`, timing; content `watersports`, which requires `bodily_fluids`)

Approved by the author on 2026-11-25 after four rounds (the defaults of the file are the approved state). Run it with `npm run proto -- gulp`; it needs `assets/gulp/` (the chosen sounds only), `ha/cloth1–3` and `breath-in-out.mp3` (`assets/LICENSES.md`). Scheme C (author): swallowing and breathing as two resources, a signal to her, and what is spilled carried into cleaning.

### Normative (port exactly)

- **Her picture** (`render`): looking up at her over the ceiling art (blurred 3 px, dimmed to 0.55), by the chain **`over_explicit`** (explicit content on: the picture shows what watersports needs, her anatomy by her card; not nudity as such) → **`over`** (weight's slot: its height, x and sink as weight's, anchored to the bottom with room for her lean) → her ordinary sprite from below (height 1.55 H, bottom at 1.42 H, `rotateX` 10°); a slow sway, a quicker one in a surge. Nothing of a body is drawn; the stream is heard.
- **The mouth is a warm tide** (`render`, `tideH`): up to 36 % of the screen's height at a full mouth; a gradient from `rgba(255,226,140,.46)` at the surface to `rgba(190,140,60,.55)` at the bottom, a sheen line on the surface, two travelling waves, ripples where the stream lands (a burst at the centre), a dip in the middle on each swallow; over 0.85 the edges brim; an overflow throws drops that fall and fade.
- **Swallowing** (`startGulp`): Space, `GULP_MS` 700 ms taking `GULP_TAKES` 0.4 of a full mouth over its time and `AIR_GULP` 0.11 of the air; held, gulp follows gulp; from the fourth in a row without a breath the reflex builds (+0.12 each more); a swallow shakes the frame a little and the recorded swallow plays (`swallow1–5`, louder with a fuller mouth).
- **Breathing** (`startBreath`): Shift, `BREATH_MS` 520 ms giving `BREATH_GIVES` 0.42; with the mouth over `COUGH_FROM` 0.55 it becomes a cough with a chance rising to 0.7 at full (plus 0.3 × the reflex). **Air** drains `AIR_DRAIN` 0.045 a second while the mouth holds anything; at none the body breathes by itself (a cough when the mouth is over 0.3). Air is shown as the frame's edges closing and darkening (the vignette from 80 × 76 % to 52 × 48 %) and the heart (70 → 150 bpm); the reflex warms the edges red.
- **A cough** (`cough`): spills `0.25 + 0.2 × fill` (at most the mouth), shakes the frame, drops the reflex by 0.6, gives 0.2 air. **The reflex** builds from a flow over `REFLEX_SURGE` 0.55 a second and from gulping without a breath, cools by 1/9 a second, and at 1 is a cough.
- **Her flow** (`planFlow`, `STYLES`): her base (mouths a second) with a slow wander (`vary`), pauses (`pause`, 0.7–1.8 s), surges every `surgeEvery` seconds × `surge` for 1.2–2.2 s after a warning of `warn` ms in which the stream's sound rises (ritual announces it in words, cruel has none, playful feints: the sound rises and no surge comes, 40 %). The table: neutral 0.2 / surge 1.6 / warn 700; affectionate 0.15 / 1.3 / 1100, pausing most; ritual 0.19 / 1.5 / 900, even, every 8 s; playful 0.19 / 1.8 / 500, the most uneven; cruel 0.26 / 2.1 / none, every 4–7 s; possessive 0.22 / 1.7 / 600; cold 0.21 / 1.4 / 400, steady.
- **The tap** (`tap`): the right button or T, at most every 2.5 s, a ring and two knocks; her answer by style after 0.4 s: `pause` 2.5 s (affectionate), `slower` (a 0.6 s pause, then 0.8 of the flow from then on), `hold` 1.5 s (ritual), `faster` (playful: a surge after 0.3 s), `surge` (cruel: at once), nothing (cold); her line.
- **Overflow** (the update): above a full mouth the excess (+0.04) is spilled, one overflow an event (it re-arms under 0.9); a recorded splash.
- **The cleaning** (`startClean`, `wipePuddle`): when more than 0.15 of a mouth was spilled, by style she makes the commander clean it (affectionate wipes it up herself): the floor art (dimmed 0.6), the puddle a glossy mask from blobs by the amount spilled, wiped by tongue strokes (radius 0.06 of the mask, 0.3 a pass), **every bit licked fills the mouth again** (`× 0.0016`), so swallowing and breathing go on; done at 10 % left or after 40 s; her check is a band of light over the floor (1.7 s) and her verdict ("missed" over 15 % left).
- **Her lines** (`LINES`, as kinds): entry, surge (ritual), tapped, spill, cough, done, clean, cleaned, missed; a taste line now and then while the mouth holds over 0.3 (every 9–15 s; stand-ins for P15a's stimulus layer).
- **The sound**: the stream is **the author's find, "Pouring water in mug in sink" (public domain)**, cut into `mug_soft` and `mug_strong` seamless loops, played together and mixed by her flow (`smooth(0.25, 0.9, flow/0.8)` toward the strong one), kept near its own pitch (rate 0.96 + 0.08 × flow, +0.06 while a surge rises), through a lowpass opening with the flow (1.6 → 4.2 kHz, +1.2 rising) with a faint band of noise under it; the swallows `swallow1–5` (recorded); the splashes `splash1–3`; the cough, the tap and the heart synthesised; the commander's breath the recording of saturation.
- **The digest** (`finish`): swallows, breaths, coughs, taps, spilled (in mouthfuls), the floor left and the swallows while cleaning, how it ended.

### Prototype only (do not port as is)

- The panel (style, the over loaders and the explicit switch, the fit, her volume, the flow factor, the room and floor pickers, the stream and swallow pickers with their synth fallbacks), the start overlay, the summary, the debug readout, the `__` hooks.
- **Her schedule** (`planFlow`'s random pauses and surges, `her volume`): the engine's segment plan gives her flow, surges and their warnings; the instrument plays them.
- `LINES` and `TASTE` (placeholders for the cue pool and the stimulus layer).

### Open engine questions (decide in the plan of chunk (e))

- The engine's `gulp` is breath's windows (a swallow inside an opening −5, a missed one +20 and a slip). Here the mouth fills continuously by her flow and a swallow is the commander's own act: either the engine gets a flow plan (base, pauses, surges with warnings) and the mouth as its gauge, or the instrument maps its swallows onto the engine's windows. A spill is the engine's slip; the chain to `tongue_work` at dirt 60 becomes the floor cleaning here, its dirt the spilled amount.
- Air, the reflex and the cough are new (P15a's reflex of the stimulus layer is the model); a cough is noise (P15a §16.5).
- The tap is P15a's tap (her answer by `holdsUntil` and style); "slower" and "faster" as her answers are new.
- The art slots `over` / `over_explicit` per unit with weight's sidecar; `over_explicit` is used only with explicit content on.
- **Memory check:** what P17b already decides for `watersports` (strong compromat; a mark seen by others); the spill and the cleaning are bookkeeping, unless her discipline remembers the slip.

## `shoe.html` — shoe service (P15a `tongue_work` on `boot_worship`)

Approved by the author on 2026-11-24 after four rounds (the defaults of the file are the approved state; the author's test pictures were heels only). Run it with `npm run proto -- shoe`; it uses `assets/ha/` (cloth, wood, soft, key; `assets/LICENSES.md`). The author: all together (the dirt of her day, the shine, her inspection, her foot in use); footwear in general, combat boots and high heels first, worn anywhere by her taste (no realism asked), always dirty; for now the author's holder wears heels only, the boots stay in the design.

### Normative (port exactly)

- **Foot service's craft, carried over** (`zoneRadii`, `inEllipse`, the gesture classifier in `down` / `move` / `up`, the kiss as a press held ≥ 0.3 s under 12 px, the lick sound `lickTick`, the zone marker): as in `her_activity.html`'s `service`, with these changes.
- **The pictures and the camera** (`shoeRect`, `toPic`, `twoFeet`, `mirrored`, `zonesNow`): per kind two art slots, `shoe_close` (her feet from above: the kneeling commander's own view, the angle the author's generator reached) and `shoe_sole` (the sole presented). **Each picture is one foot or two** (author, round 4): two (`feet: 'two'`, `xr` / `xl` the feet's centres in the picture, her right foot on the viewer's left): the camera frames one shoe and pans to the other (`camU` eased by 0.08 a frame), and both shoes are marked (`zones: { right, left }`); one (`feet: 'one'`, `shown`: which of her feet): one set of zones, the other foot is the picture mirrored. Each picture's fit is `{ height, y, x, fade }` (`fade`: the top of the picture, where her legs are cut off, dissolves into the room through a mask: transparent, 0.35 at 45 % of the fade, opaque at the fade); all of it is the picture's sidecar ("copy the fit"), so a scene is preset by data. The world behind: the room's backdrop blurred 16 px, dimmed to 0.45, a dark vignette.
- **Zones** (`KINDS`, `FRONT`, `SOLE_TWO`; marked per picture, the defaults are only a start): heels on top `toe`, `vamp`, `side` (with two feet; `back`, `heel` for a one-foot three-quarter picture), boots on top `toe`, `vamp`, `laces`, `shaft`, `welt` (two feet; `side`, `heel` for one foot); the sole `toe_tread`, `mid`, `heel_tread`. Leather zones take a shine (`leather`, filtered to the zones the picture has); laces and the sole do not.
- **A foot has two surfaces** (the top, the sole); the order is the right top, the right sole, the left top, the left sole (`G.order`); a surface ends when its dirt is at or under the engine's 10 % and its leather shines over 0.6 on average, or when her time for it runs out (`STYLES[].surface`, seconds); then the inspection.
- **The dirt of her day** (`DIRTS`, `makeSurface`): ash, mud, oil, spores, parade dust, rain, each with its colour, `grit`, `dry`, `resist` and its lie (`blobs`: count, size, stretch; oil streaks, rain spots) and its taste line. The mask lies inside the zones (fading from 0.9 to 1.5 of the nearest zone's size) over the picture's alpha; it is **drawn over the picture in its own colour with a fixed grain** (alpha `v·0.88·(0.75 + 0.25·grain)`), not multiplied, so light dust shows on black leather.
- **The tongue** (`lickStroke`): wipes along her grain (along the zone's long axis, toward the toe or the heel by her style, `STYLES[].grain`; across half as well), worse with a dry mouth (×(1 − 0.85·dry)) and with grit (×(1 − 0.4·grit)), divided by the dirt's resistance; the wiped dirt fills the mouth with grit (`removed × 0.00035 × grit`) and each stroke dries it (`length × 0.0011 × the dirt's dry`, 0.6 on clean leather).
- **Shine** (`lickStroke`, the gloss canvas): on clean leather a slow stroke (under 650 px/s) adds `(1 − gloss)·0.06` along it, a fast one takes 0.01 off; drawn as a screen-blended sheen from the upper left (a soft diagonal band), brighter on patent heels (`gloss` 1.0) than on boots (0.7) and on a boot's toe cap (×1.4); a squeak now and then while polishing.
- **The mouth** (`swallow`, `spit`): Space swallows (grit −0.6, dryness −0.35, a gulp; the first time with grit, the dirt's taste in a sensory line); X or the right button spits the grit aside, seen by her with 0.75 watching, 0.3 glancing, 0.06 busy: caught, her line, she presses the shoe to the face, and a cruel holder dirties it again. Grit and dryness are never a bar: grit is the crackle in the lick, dryness its colour, each told once by a sensory line.
- **Her attention** (`updateAttention`): busy on her device (her taps are heard, 140–420 ms apart; they stop when she looks), glancing, watching, re-chosen every 2.5–6 s by her style's `busy` share.
- **Her foot** (`herMove`, `update`'s `anim`): every 7–13 s by style: a stamp when the last surface was poor (a shake, a thud), pressing it to the face (+16 %, the vignette deepens), asking for a kiss; a turn when the surface changes; a change of feet (a sideways swing, or the camera's pan with two feet).
- **Her want** (`nextWant`): the dirtiest zone over 0.12, else the dullest leather zone under 0.6 (her first "polish" line).
- **The inspection** (`inspect`, `verdict`, the light canvas): a band of light sweeps across the shoe in 1.7 s; dirt stays dark, dull leather matte, polished leather flares; her verdict names the dirtiest zone over 0.2 ("%z. you missed it.") or the dullest leather zone under 0.35 ("%z is dull."), else her good or poor line; the next surface after 3 s.
- **The digest** (`finish`): the kind and the dirt, strokes and those with her grain, polish strokes, kisses, swallowed, spat and caught, stamps, each surface's dirt and shine with its worst zone.

### Prototype only (do not port as is)

- The panel (kinds, dirt, style, her attention, the four picture loaders, the view and foot pickers, the fit sliders, the centre line while setting up, the marker's buttons), the start overlay and its "set up first", the summary card, the debug readout, the `__` hooks.
- The texts (`LINES`, the dirt's taste lines) and the drafts of her ways (`STYLES`: surface time, busy share, move shares, grain): her profile and the engine's plan give them.
- The test pictures (never committed).

### Open engine questions (decide in the plan of chunk (e))

- `tongue_work`'s parts become the footwear's zones (as foot service's zones replaced the foot's parts); the engine's dirt gauge is the mask's share; shine is a new gauge on the leather zones; the inspection is the engine's check at ≤ 10 plus the shine.
- **Her footwear** is a new field (her taste: boots, heels; what she wore that day), and **the dirt of her day** comes from her day (the run's region: ash on the Ashway, oil in K-12, spores in District 7, mud on a wet run; the training yard's dust; rain): a reader over her whereabouts and the last run.
- Grit, swallowing and a caught spit are new inputs (a caught spit is a slip for her discipline, and for the memory check: remembered only as her discipline remembers a slip); her attention's busy share is her activity's attention (P15a).
- The art slots `shoe_close` / `shoe_sole` per kind with their sidecars `{ feet, shown?, fit: { height, y, x, fade, xr?, xl? }, zones }`; without art the scene falls back to the blocking strip's text (no stand-in sprite).

## `jaw.html` — the jaw (P15a `jaw`, gesture)

Approved by the author on 2026-11-24 after three rounds (the defaults of the file are the approved state). Run it with `npm run proto -- jaw`; it uses `assets/breath-in-out.mp3` and `assets/ha/cloth1–4` (`assets/LICENSES.md`). The body and the speech on one axis (author: "all together"). `oral_service` is not here: its depth and rhythm are P17b's.

### Normative (port exactly)

- **The jaw** (`update`): the mouse's height is the target opening (`G.target = (y − 0.2 H) / 0.48 H`, clamped 0–1.6: from 20 % of the height shut to 68 % wide open, and below that it pulls harder, so a tired jaw can still follow her); the jaw is a spring toward `target − pull` (stiffness 70, damping 12), clamped to 0–1 (its speed stops at 1), with the ring as its floor; `pull = 0.04 + 0.18·f^1.6` (f = fatigue / 100); closing twitches from fatigue 25: an impulse of −(0.35…0.8)·(0.3 + f), at a rate of `0.08 + 0.35·f²` a second (±40 %), each a dull knock and a jolt of the frame; a tremor of ±(0.0015 + 0.012·f²) a frame.
- **Fatigue** (`update`): the engine's +8 a beat (1500 ms) times the **cost of the opening** divided by the endurance skill (`1 + 0.1·level`, P15a §9.3, levels 0–5): resting within `RELAX_ZONE` 0.06 above her toes (`0.42 + push`) or the ring costs `RELAXED` 0.35; from there the cost rises to 1 over 0.25 more, and beyond grows by `WIDE_COST` 1.4 per 0.4 (author: holding must be a craft, not only a drain; a bot that hugs the floor lasts about 54 s at level 0). A granted rest: the jaw closes to 0.06 (the ring still holds it) for `REST_MS` 4200 ms and fatigue falls by the engine's 30 over it. At 100 she releases at her limit (after 600 ms; cruel and vindictive after 6 s). From 70 (`DEGRADE_AT`) the letters smear and double.
- **The mouth is the input field** (`render`): its height is `lerp(30, 170, jaw)` px around a fixed centre (96 px from the bottom), trembling sideways with fatigue; **her band** is two dashed ghost frames on it (the floor at 0.9 opacity, turning hot red while the jaw is below it; the ceiling at 0.45), hidden during a rest; **the hinges** (both ends of the field) burn red by the cost of the moment and the fatigue (`burn`), quiet while resting; the typed letters smear (a doubled shadow, a blur) from fatigue 50; **drool** swells on the lower edge (more with the opening and the fatigue), falls and drips (a glossy drop, a tick); the frame darkens at the edges and warms at the jaw's corners (`#vig`, `#ache`), loses colour, jolts on a twitch; a low strain hum rises from fatigue 35.
- **Her toes** (`sole_to_mouth`; `bandNow`, `herMove`): no speech (a key comes out as "m" or "h"); her band's floor is her toes (`0.42 + push`), its width 0.2 ("suck.": her `suck` width, 0.06–0.1; "wider.": +0.14 and 0.16 wide, capped at `WIDE_MAX` 0.9); her moves every `every` seconds by style: deeper (32 %: push +`deep`, at most 0.28, telegraphed by a rustle and her picture coming closer), back a little (18 %), "suck." for 4–7 s (25 %), "wider." for 3–5 s (25 %). **Teeth** (`TEETH_GAP` 0.015 below her floor): one touch a dip (the jaw must come back into her band), at most every `TEETH_CD` 2.5 s, her word at most every `TEETH_SAY` 7 s (between, only her foot jerks and the frame flashes); cruel and vindictive push in 0.05 for the teeth, up to 0.2.
- **The ring gag** (`ring_gag`): the ring (0.55) is the jaw's floor; her moves: a question (`0.4 + ask/2` of her moves) or "wide." (her band 0.76–0.9 for 3–5 s), and with "wide." she often (45 %) asks 1.6 s later: answer clearly (and break the order) or keep it wide (and be lost). A question waits 12 s.
- **Speech through the opening** (`speak`, `onType`, `sendLine`): each letter is spoken through the opening at the moment it is typed (the jaw, at least the ring): lips fail above 0.3 (`b p m f v w` → "h"), the tongue's tip above 0.5 (`t d s z c j x` → "h", `l r` → "a", `n` → "ng"), the back of the tongue above 0.86 (`k g q` → "gh"), `e i` flatten to "a" above 0.75; from fatigue 70 a letter may double. The line shows what comes out; a letter that came out worse than the ring allows is marked. **She listens fairly:** a letter is clear when it came out as well as the ring allows; she understands at 60 % clear, and a word she asked for when it came through as the ring allows it.
- **The rest** (`askRest`): Shift or the right button held `REST_HOLD` 550 ms (a ring fills at the mouth's end), a tap of the hand on her leg; granted unless cruel or vindictive (the engine's rule), her answer in her hand.
- **Her hand** (`say`): Caveat in her accent, stacked below the lines still showing; the entry line by contact; the lines' kinds (`entry`, `teeth`, `deeper`, `out`, `suck`, `wide`, `correct`, `restOk`, `restNo`, `ask`, `heard`, `lost`, `end`, `slack`) are the cue kinds the pool needs. An order not kept for `ORDER_GRACE` 1.5 s is corrected.
- **The view:** her sprite from below (the commander kneels): with her toes 1.5 H tall, its bottom at 1.28 H (closer as she pushes), `rotateX` 12°, dimmed, blurred under the foot art; with the ring 1.3 H, 1.16 H, 8°; a slow breathing scale. The foot art (her foot toward the mouth, toes at its top edge) comes up from below, larger as she pushes, wiggling on "suck."; its height is the picture's fit (1.05 H).
- **The sound:** the commander's breath through the nose (the recording, every 3.4 → 1.7 s as the jaw tires, faster and louder), the twitch knock, the teeth tick and her foot's rustle, the drip, the strain hum, her clothes on her moves; the room tone.
- **The digest** (`finish`): held time, fatigue, teeth, corrections, rests asked and granted, said / understood / lost, twitches, how it ended.

### Prototype only (do not port as is)

- The panel (contact, style, skill, the fatigue and ring sliders, the session length, the foot art loader and its height), the start overlay, the summary card, the debug readout and the `__` hooks; `meant:` under the heard line (the commander knows what was meant; whether the scene shows it is the port's call).
- **Her schedule** (`herMove`'s shares, `STYLES[].every`, `deep`, `suck`, `ask`) and the session length: the engine's segment plan gives her moves; the instrument plays them.
- `LINES`' texts (placeholders for the cue pool).

### Open engine questions (decide in the plan of chunk (e))

- **The cost of the opening:** the engine fills fatigue flat (+8 a beat); here the cost depends on how far above her toes or the ring the jaw is held. The engine gets the cost (an input: the mean cost of the beat) or the instrument keeps it.
- **Her band, her toes' depth and her orders** ("deeper", "suck", "wider") are new: segment plan events, like weight's shifts; the teeth are a new slip kind (and a memory check: worth remembering only as her discipline remembers a slip).
- **Speech through the opening** is UI only, but what she heard (the distorted line) must reach the scene: the line sent is the heard one, and her understanding (the share of clear letters, the word she asked for) is a new input; her questions and the asked word come from the cue pool.
- **The rest** is the engine's gesture as it is; `REST_MS` (how long a rest lasts in real time) is new.
- `ring_gag` is an item (`worn.mouth`), not a contact: the physics must start from the item being worn in a scene with her.

## `slap.html` — the slap (P16 §R.3, `practices.slap`)

Approved by the author on 2026-11-24 after the first round ("all good"; the sound: thwack bright at half the level). The defaults of the file are the approved state. Run it with `npm run proto -- slap`; it needs `assets/slap/` and the files it shares (`assets/LICENSES.md`). It replaces P16's slap overlay (the voice card with `[ BRACE ]`, the phase words and the `HER HAND` cut-in).

**What it is (author):** a mini-game that is really mini. It cuts into a text scene for a second or two, unannounced (an answer to a wrong word, a punishment); it is not a waiting game. Most slaps are simply taken (`none` is the normal outcome, never a failure); bracing is rare and hard; flinching is **not an accident but a deliberate act of defiance** (turning the face away).

### Normative (port exactly)

- **The timeline** (`startSlap`, `frame`): the camera snaps to her face in `SNAP` 170 ms; her hand is up for the engine's `leadMs` (900) from the slap's start; each feint lasts `feintMs` (450); then the **swing** lasts her style's `windowMs` (read here as the swing's length: affectionate 700 … cruel 300, obsessive 300–700 hashed) and lands. **Unannounced** (after a slip): no raised hand, the swing starts right after the snap. Cruel's second slap after a turned face (`again`): her hand up for 420 ms. After the impact her line (cold: at once, others after 380 ms), the camera holds (1500 ms, cold 900, 700 before cruel's second) and goes back to the scene in `RETURN` 650 ms (ease in-out); the input gets its focus back if it had it.
- **The commander's controls** (`press`, `tensionAt`, `onMove`, `land`):
  - **Space or the left button tenses the body:** the tension rises in 100 ms (ease out), holds 80 ms and falls in 220 ms whether the key is held or not; **one try a slap** (a second press does nothing). At the impact a tension ≥ 0.8 is `braced` (a press 42–224 ms before the impact); anything else is `none`. A press on a feint or in the pause burns the try. A sharp intake of the commander's breath on the press.
  - **A sharp flick of the mouse sideways turns the face away:** at least `flick` 2400 px/s over the last 70 ms and 6 % of the screen's width, from the slap's start to the impact. The result is `flinched` (defiance), whatever the tension. Ordinary mouse moves do nothing.
  - The input field loses its focus when the slap starts (Space must not type, nor click a focused button); a press before the slap is not counted.
- **Her signal** (all from the camera, light and sound; nothing drawn): her hand side is screen left (`dir` +1, her right hand) or right (−1), hashed per slap. While her hand is up the frame rises on that side and leans in (`lean` −0.4: rotation `−dir·lean·3.4°`, shift `−dir·lean·0.022 W`, scale +3.5 % over 500 ms, a slight unrest), the light dims on her hand's side (`#side`, a gradient from that edge, up to 0.85), her clothes are heard on that side (`ha/cloth*`, pan ±0.7); a feint twitches the frame toward the strike and back (rise 30 %, fall 45 % of the feint) with a quicker rustle; the swing turns the frame through (`lean` to 1, ease in); in the last `SWEEP` 140 ms a dark blur comes in from that edge (`#sweep`, blur 38 px); the swish is timed to end on the impact. A heartbeat thump when her hand comes up.
- **The impact** (`land`, `flash`, `scatter`, `SFX.slap`, `SFX.ring`): felt at `k` 1 (`none`), 0.65 (`braced`), 0.45 (`flinched`, glancing): the frame whips toward her hand's side (7.5 % of the width and 5.5°, in 45 ms, then a damped swing back: τ 210 ms, period 520 ms) with a horizontal motion blur (16 px, 220 ms); a flash (white at the centre to red, 0.75·k, fading in 260 ms); the ringing (4180 and 4207 Hz beating, 8400 faint, 3 s, braced ×0.55, glancing ×0.4) while the world's sound dulls (lowpass to 650 Hz at full strength) and comes back; the letters of the line being typed fly apart and settle; the slap on the body bus panned to the cheek (a glancing one lowpassed at 2200 Hz and at half the level) with a low thump under it; after a braced one the commander's exhale.
- **The cheek** (`#cheek`): a red glow on the side the hand came from (`0.8·k`, stacking), throbbing slowly, fading with τ 24 s; it stays across the scene.
- **The turned face** (`turnX`): the view swings 11 % of the width the way of the flick in 160 ms, a little closer, and stays turned until the camera goes back.
- **The tension seen:** the frame tightens (+2 %), a dark vignette closes in (0.5), the world's sound ducks (−55 %); as it falls the frame trembles.
- **Her hand** (`say`): Caveat in her accent, written in steps (speed by style), beside her face on the side away from her hand, stacked below the lines still showing, gone after 2.2 s. `before` lines for ritual ("still.") and drill ("chin up."); playful's line when the commander tensed on a feint.
- **Her answer by style** (`LINES` as behaviour, `again`): cold is silent; cruel slaps again after a turned face; the others answer by the result.
- **The camera** (`frame`): from the scene's knee-length sprite (its height 1.04 H, its bottom at 1.02 H) to her face at (0.5 W, 0.42 H) and `zoom` 2.6 (geometric), the backdrop blurring to 14 px and dimming to 0.55, the scene's reply and input stepping back. The art slot `face_close` (her face close, filling the frame) crossfades in when it exists; without it the sprite's face is zoomed. The face point `{ x, y }` is the picture's sidecar (0.47 / 0.17 for the test sprite).
- **Her face changes** (author, 2026-11-24: a sudden change of face is needed, from the context; `EXPR`, `beforeLabel`, `showFace`, `preload`): no model call (the slap cannot wait for one). The `before` label is shown `EXPR_SWITCH` 60 ms into the snap, so the change hides inside the camera's jerk; the snap waits at most `EXPR_WAIT` 120 ms for that picture to load. Her face now (the label her last line was read as: the native classifier, `emotion_pick` or the extraction's emotion) is **kept when it is in her style's `keep` set** (it already fits); otherwise the table's `before` by style, and after a slip (unannounced) the calm styles (ritual, clinical, regal) look annoyed. The `after` label by style and result is shown with her line after the impact and stays until her next reply is read. A label with no sprite changes nothing (never an error). The table (`EXPR`, SillyTavern's 28 labels) is data the author edits:

  | style | before | keep | after: none | braced | flinched |
  |---|---|---|---|---|---|
  | cold | disapproval | disapproval, neutral, annoyance, anger, disgust | neutral | neutral | disapproval |
  | cruel | amusement | amusement, anger, annoyance, desire, pride | amusement | annoyance | anger |
  | vindictive | anger | anger, disapproval, annoyance, disgust | disapproval | disapproval | anger |
  | affectionate | disappointment | disappointment, sadness, annoyance, disapproval | caring | pride | sadness |
  | playful | amusement | amusement, joy, excitement, desire | amusement | surprise | amusement |
  | clinical | neutral | neutral, curiosity, disapproval | curiosity | curiosity | curiosity |
  | ritual | neutral | neutral, disapproval, pride | neutral | approval | disapproval |
  | drill | annoyance | annoyance, anger, disapproval | disapproval | approval | anger |
  | regal | pride | pride, disapproval, annoyance, anger | pride | approval | anger |
  | possessive | anger | anger, annoyance, desire, disapproval | desire | pride | anger |
  | obsessive | desire | desire, love, anger, excitement | love | love | anger |
- **The sound** (`SAMPLE_URLS`, `SFX`): the slap is `assets/slap/slap.ogg` at `0.95 × 0.5` (author: thwack bright at half the level); the swish `swish1` at rate 0.72; her clothes `ha/cloth1–4`; the commander's breath `breath-in-out.mp3` (the intake: 0.14 s on, 0.42 s at rate 1.6; the exhale from 2.17 s); the ringing, the thump and the heartbeat synthesised; the room tone as in breath.
- **Reduced motion or the timing interaction off:** it lands at once (`none`): the flash, the ringing and the cheek only.

### Prototype only (do not port as is)

- The panel (with its expressions loader and the "her face now" picker), the start overlay, the tally, the debug timeline and the `__` hooks; the stand-in scene (`HER_REPLIES`, the half-the-time slap on a sent line, the random slap, `NARR`).
- `LINES`' texts (placeholders for the cue pool) and `FEINT_SHARE` (a stand-in for her `swing`: the engine's `slap.feints`).
- The swish candidates `swish2`, `swish3` and the synthesised one (not chosen); the panel's tension and flick sliders (tuning tools; the defaults are the design).

### Open engine questions (decide in the plan of chunk (e))

- **The results change meaning.** Today `answerSlap` gets `flinched` for an early press, a press on a feint or a second press. Here a press can only brace or burn its try (`none`); `flinched` comes only from turning the face away. The engine's style answers to `flinched` (cruel's second slap, vindictive's +1, affectionate's softer favour) now answer defiance; whether a turned face is also her offence (`noteOffence`, a defiance) is to decide.
- **`windowMs` becomes the swing's length;** the brace band is the commander's body (42–224 ms before the impact), the same for every style. The overlay's `leadMs` and `feintMs` are kept.
- **Unannounced** has no raised hand (today the overlay runs `leadMs` for it too); cruel's `again` raises the hand for 420 ms.
- **Her hand's side** is new: a hash of the slap's id (`fnv1a`), no rng; it may go into the result for the digest (which cheek).
- **The digest:** the result, glancing or not and the cheek reach the next reply through the existing `practice:slap:` directive; nothing new is remembered (`slap_public` already covers a slap before others; a turned face, if it becomes an offence, is remembered through her discipline).
- **The cheek** lives in the UI across the scene (keyed by scene id, reset on a chat switch).
- **Lines:** the cue pool needs `before`, `feint` and `again` kinds for the slap.
- **Her face:** the table becomes data (a registry or a `TUNING` table read by style and result); the scene's sprite is set through the scene screen's `setSprite(unit, label)` (`getSpriteUrl`), which today follows only her replies (the native classifier or `emotion_pick` via the `sprite` UI event): the slap overlay needs to set it itself, preload both pictures before the snap and leave the label it set for the next reply to replace. With native expressions ST may also set the face from her next line; the slap's label holds until then. The art slot `face_close` would need a picture per label to follow the face (until then it is one picture, or the zoomed sprite).

## `her_activity.html` — her activity, the frame of her time, with stillness inside (P10e §15 "Her activity")

Approved by the author on 2026-11-23, after the rounds of that day (the defaults of the file are the approved state: the stillness inside, legs `planted`, restlessness from 350 / 450 px/s, detection ×1.35). Run it with `npm run proto -- her_activity`; it needs the CC0 sounds in `assets/ha/` (`assets/LICENSES.md`). Two kinds of normative content: the **frame** (everything below but the game inside), which every long hold and every game inside it uses, and the **stillness** game.

### Normative (port exactly)

- **The four views** (`VIEWS`): `her` (the room, her sprite lit by her lamp or screen; she leans a little toward the commander when she looks), `legs` (under her desk: `frame_under_desk` over the room, her shins in weight's material; variants `planted`, the default, and `crossed`; the panel's **legs art** and **raised foot art** load the two states of the art slot `legs_seated` (`rest`; `foot_raised`, her bare foot raised toward the commander, shown on her signs, her wordless corrections, a question she waits on and during a call, crossfaded in 280 ms), a picture with a transparent background placed between the room and the desk, which replaces the silhouettes and is never committed; each picture's fit, `{ width, bottom }` per state and `floorShade` (the desk's shadow on the floor hides where her feet meet a floor the picture drew), is set once per picture with the panel's sliders and travels with the picture as a sidecar, "copy the fit" gives the JSON), `floor` (eyes down by her bunk; the panel's **feet art** loads the art slot `feet_floor`: she sits on the edge of her bunk, her bare feet on the floor in front of the commander, its top faded out, a contact shadow under the toes and a few degrees of `rotateX` to meet the floor's perspective; fit `{ width, bottom, tilt }`), `wall` (`pov_corner`); a blindfold makes any view hearing-only. Each view says where her sounds and the door are (screen position and stereo pan).
- **Her activities** (`ACTS`, twelve): each with its attention word, how it moves her presence per phase (`absorb`), how well she hears, its light (lamp, screen, dark), its clock unit, its marks (a `seen` and a `heard` wording, a sound, a progress step), her self-talk and her end. Nothing is drawn: the marks are sounds and sensory lines on the side of the source.
- **Her presence** (`baseScore`, `stepOf`): four steps (`with`, `glancing`, `own`, `use`) from her activity's attention, talkativeness, style, Regard, hold band, mood and a hash of the session; it drifts between phases (`absorb`). It sets her attention (`ATT_BY_STEP` mixed with the engine's `gaze.attention`), how many lines reach the commander and how she answers a fault (`react`: a word, a look, her body, or nothing unless gross).
- **Stillness: the commander's attention** (`moveAttention`, `updateUrges`): a point with a halo that follows the mouse with a lag and that an urge above 0.3 pulls toward itself (harder as the ease goes); an itch grows while the attention rests on it (the halo turns warm, a prickle is heard) and fades once the attention has rested half a second on her (her legs, her sprite or her feet, her sensory and written lines) or on the door (the halo brightens, her sounds get clearer); patience is holding the attention away against the pull; the urge to swallow only grows, a warm swell rising from the bottom edge (swallow under her voice); numbness creeps up from the bottom with the fiction hours (click the bottom band: shift the knees); a cramp is breathed through (hold Space 2.6 s) or stretched out (click it), else the leg jerks. Every relief is a sound with a loudness; she notices by hearing (`herEars` × loudness × (1 − cover)) or by sight (`CAUGHT` by her attention).
- **Restlessness** (`moveAttention`): the mouse's smoothed speed is the eyes and head moving: above 350 px/s rings ripple from the attention and the frame follows the head a little; kept above 450 px/s the body fidgets (the meter fills at (speed − 450) / 1000 a second, at most 1.6, at least 1.5 s between fidgets; author: only a slow, steady move is safe) — a rustle, loudness 0.28, visible, she may notice it like any relief.
- **The tell that she heard** (`bodyNoise`): at every presence, her sounds stop and her legs go still for 2.2–3.8 s, then go on (the first time a line says she is listening); her answer by presence follows.
- **Lines on the frame** (`say`, `placeFree`): a long line in her hand is cut at the words into lines of about 40 characters (30 when big), each written in turn; every line (hers, the other's, a sensory one) stays inside the screen and moves past the lines already showing so none overlap (fixed 2026-11-24).
- **Cover** (`coverNow`): her spoken lines (0.75), a visitor's voice (0.5), the mess and the rain. On a call the line hears what the room hears while she listens (`callHeard`); an unaware visitor too (`visitorHeard`).
- **The script** (`planScript`, `exchangeScript`, `runScript`): the normative SHAPE of what the pregenerating call returns (`{ at, who, to, text, covers, ask?, mention? }`); the content is placeholder. Lines to the commander carry her name for the commander and, under the desk, a press of her foot; a question opens a window to answer by typing (Enter); answering her self-talk is a breach. A mention of the commander to someone else goes through `mentionText` (plain if the listener knows or the relation is public enough, plain anyway with a reckless tactic, veiled or unsaid otherwise).
- **Peaks** (`planPeaks`): steps that stop at the door and pass (`falseAlarm`), an incoming call (`incomingCall`: her foot comes to rest on the commander's shoulder), a visitor (`visitorPeak`), and in `use` she leaves the room and comes back unannounced (`leaveRoom`).
- **The base by the hour** (`BASE_EVENTS`): the mess bell and the squad at supper through the walls, dusk (she turns on her lamp), the patrols, lights out (a far horn, the generator drops), rain.
- **The timers of the body and of her bouts wait outside the played phase** (the entry, the hours between phases, the end) and while the close-up of the service is on: they do not pile up for the moment play resumes (fixed 2026-11-24: a cramp, an itch and a swallow all fired right after every skip). A gesture between phases resolves once.
- **Between phases** (`startSkip`, `resolveSkip`): the dark, the clock running over the skipped part of the hour, her marks compressed into seconds and the base events of those hours as one line; four gestures in the cool accent (keep still / ease off slowly / move while she reads / ask), resolved with the engine's `resolveSkip` numbers.
- **The end** (`finish`): by presence: her end line (`with`, `glancing`), two taps of her foot (`own`), or the forgotten end (`use`: the lamp off, her steps, the door; GET UP or wait until someone finds the commander). The stop word always ends it.
- **The digest** (`showDigest`): what the scene that follows is told (only what she perceived) and what only the commander knows.

- **The sounds** (`SAMPLE_URLS`, `GROUPS`, `SYN`, `babble`, `MUSIC`, `LOOPS`, `sleepBreath`): each activity's palette as listed in `ACTS` (the recorded CC0 files in `assets/ha/` and the synthesised ones: tapping, thread, snip, scratch, gulp, joint, the headphones' leak, voices without a voice for her murmur, the earpiece and a visitor, the far horn), the base (room tone, the generator, bell, crowd, rain, steps, doors), the commander's body; the world bus dulled (lowpass 5.2 kHz) while the commander does not listen and open while listening; levels and pans as in the file.
- **The game inside** (panel: stillness / weight): **weight** runs the approved `weight.html` (contact `footrest`) inside the frame, its code ported as it is (`wPlanShift`, `wLandShift`, `wSlip`, `wRelief`, the level, the cracks, the strain rumble, the floor with her screen's light); only the wiring changes: her attention per moment is the frame's (her presence and activity), her lines go through her presence (only `with` and `glancing` speak), the commander's own shift is caught by weight's own rule (her attention of the moment: 0.6 / 0.25 / 0.08) and, caught, gets the frame's tell and her answer by presence, every slip is felt through her feet whatever her presence (`herFeels`: the tell and her answer, not more than every 4 s; three slips in 6 s are gross and she presses heavier), at her limit she lets the commander rest a moment by presence only if the commander was bearing her (no slip in the last 3 beats) and not more than her style allows in a phase (affectionate 2, cruel 0, others 1; in `use` never), and three buckles end the session (`finish('failed')`: she takes her feet off, her verdict by style), the strategies between phases act on the strength, and the digest counts her shifts, slips, buckles and rests. Port weight from `weight.html` itself; this file shows only how the frame wires it.

### Prototype only (do not port as is)

- The panel, the start overlay, the summary card's layout, the debug readout and the `__` hooks.
- **The content of the scripts** (`TO_YOU`, `CALL`, `VISIT`, `CARDS`, `ACTS[].self`): placeholders; the game takes the script from the pregenerating call at each phase boundary (its shape above is normative). `planScript`'s counts per presence and talkativeness are a stand-in for that call's brief.
- **The schedules** (`planPeaks`, the marks' intervals `per`, the urges' spawn times, `attentionDraw`): in the game the engine plans the phase (P15a `planSegment`, `attentionPlan`, the marathon's phase events); the instrument plays the plan.
- **The numbers duplicated from the engine** (`CAUGHT`, `MAR`, `GAZE_ATT`) and the presence's weights in `baseScore` (a draft for the engine's reader, see the open questions); `OTHERS`, `BASE_EVENTS`' times and texts (placeholders for the base's real schedule).
- The silhouettes of her legs under the desk (`shinFront`, variants `planted` / `crossed`) are the fallback when no `legs_seated` art exists; `crossed` reads poorly and is not ported.
- In the frame the input's trembling letters (weight) are not wired.

### Open engine questions (decide in the plan of chunk (e))

- **The frame moves from a contact to the scene**: today `her_activity` is a contact physics (`passive`, progress +5 a beat) on two contacts; the frame is live from the blocking (her activity's attention and the commander placed by her), with or without a contact, and it starts the marathon (today nothing in play does).
- **Her presence** needs a reader: talkativeness, style, Regard (P15 confines Regard to tone and aftermaths: a new use, decide), hold band, mood and `dynamicHash`; no new rng draw. Its steps and drift are engine state or derived per phase.
- **The script** is a new call type (one per phase, at its boundary, through `app.generations`, a site of its own), its input built through `Knowledge` (what she knows: the real reports), its output validated (the shape above); a mention of the commander is checked against the listener's knowledge (P15 levels) and the relation's publicity (P9d) by the engine, not the model.
- **New inputs**: the urges, the attention resting on her (listening), restlessness and fidgets, the answer to her question, a breach; and the noise model (loudness × her ears × (1 − cover)) beside P15a's `noiseOf`.
- **Weight in a marathon**: with the engine's numbers a commander who only holds lasts about 50 s before the first buckle; the commander's own shifts make it sustainable. Whether the marathon's attrition and her rests are tuned on top is a tuning question.
- **The digest after every mini-game** (author's rule): a structured result per run (her side: only what she perceived; the commander's side kept apart) delivered to the scene that follows as a directive; the memory check decides what is remembered (a caught cheat, a buckle, the forgotten end, being found by someone).

### The game inside `service`: foot service under the desk (approved and normative, 2026-11-24)

Approved by the author on 2026-11-24 after the rounds of 2026-11-23/24 (the defaults of the file are the approved state). **Port it exactly** like the other prototypes: the code of `svSignal`, `svAnswer`, `svDown` / `svMove` / `svUp` (the gesture classifier and its thresholds), `soleRect`, `zoneRadii` / `inEllipse` / `zoneAt`, `makeDirt` / `wipe` / `dirtIn`, `svLean`, `svRender`, the zone marker and the sounds, adapting only the wiring (the engine's plan of bouts, her profile, the art slots and their sidecars). Built on 2026-11-23 from P10e §15 "Foot service under the desk". Panel: the game inside → `service` (the view is `legs`); load `legs art`, `raised foot art` and `sole art` (`sole_close`; until it exists the close-up uses the raised foot art or her sprite); "mark zones" clicks toes, ball, arch, heel, edge on the sole and gives its sidecar `{ slot: 'sole_close', fit: { height, y }, zones }`; debug shows her signals, her grain, her kiss length, her tempo and the zone she wants; "bouts" makes every bout one act and the act buttons start a bout of it at once (prototype tools).
- **A bout** (`svSignal`, `svAnswer`, `svEndBout`): between bouts the frame's stillness; her signal (`MOTIONS`: a motion of the art under the desk and its sound, `foot_raised` for the raised ones) chosen from her five pairs (`herSignals`: the three foot acts and two of closer / still / enough, hashed per session and style; which pair a bout uses is hashed with a salt per run in the prototype, the day and the scene in the engine); the first time she names it aloud ("two taps — kiss."); the answer within her patience (`SVC_STYLE[].patience`).
- **Gestures** (`svDown`, `svMove`, `svUp`): a press held on one spot (≥ 0.3 s, under 12 px) is a kiss; cleaning is scrubbing back and forth (a reversal of direction past ~125°, after 50 px) or a straight drag (more than 120 px, turning less than 0.8 rad); a rub is a drag turning steadily one way (more than 1.2π, no reversal); the direction is read over pieces of at least 6 px so a trembling hand does not turn (fixed 2026-11-24: scrubbing up and down was read as a rub); unsure until 300 px, then by curvature. Under the desk: a press held 0.6 s on her legs is closer, the attention held 0.8 s past the edge of her foot is enough, nothing at all (no click, the mouse slower than 90 px/s) is still. A wrong gesture is a misread (her correction by presence); no answer in time is missed.
- **The close-up** (`soleRect`, `svRender`): her foot at `closeH` of the frame's height over the dark shade under the desk, the world behind blurred; the camera eases in (260 ms); her motions go on as transforms (toward the face, pulling away, a tap); `glancing` shifts the picture to bring the zone she wants to the centre.
- **The crafts**: kiss (her length by style `SVC_STYLE[].kiss`, the zone she wants; a warm mark fades where the lips were); clean (`makeDirt`: a mask over the picture's own alpha, heavier at the heel, the ball and the toes, drawn multiplied, `wipe` along strokes, half as well against her grain `herGrain`, worse with a dry mouth; the mouth dries with every stroke and a swallow wets it; the lick's sound follows wetness and speed; her check at ≤ 10 % names a spot left); rub (circles a second against her tempo; her foot relaxes or pulls away). Sounds of the service only matter to a third party (`thirdPartyNoise`: the call, an unaware visitor).
- **Zones** (`zoneRadii`, `zoneAt`): each zone's size is set while marking: an ellipse (press on the centre, drag toward a corner: the horizontal gives its width, the vertical its height; the mouse wheel turns it while dragging, or the last one placed until the next is started, 5° a notch, 1° with Shift; `[x, y, rx, ry, deg]` in the sidecar, radii as fractions of the picture's height) or, with Shift, a circle (`[x, y, r]`); author, 2026-11-24: the right size depends on the picture); a zone marked with a plain click gets half the distance to its nearest neighbour (4–12 % of the height); zones are never shown in play (only while marking and in debug); outside every zone a kiss or a stroke counts as nowhere (author, 2026-11-24: the zones were too large).
- **Serving absorbs the commander** (author, 2026-11-24): during the close-up an itch neither grows nor pulls the attention; it fades (−0.08 a second). The swallow goes on (the cleaning needs it).
- **Her foot answers where it is touched** (`svLean`): a kiss or a stroke where she wants it and her foot presses toward the lips (the picture briefly +5 %), elsewhere it shifts away (−3.5 %); the first time of each a line names it; so her order can be read and learnt without words.
- **The dirt is on the sole only**: inside the marked zones (each widened, fading out from 0.9 to 1.4 of its size), never on the shin or the ankle of the picture.
- **Which zone** (`svNextWant`, `herOrder`): `with` names it, `glancing` brings it closer, `own` and `use` nothing (her order is fixed per her, to be learnt).
- **The digest**: her signals read right, wrong and unanswered, the kisses, the strokes where she wanted, her check, the rubs; the signals learnt on the commander's side.

**Service, prototype only:** the panel's test tools (`bouts`, the act buttons), the salt of the bout order (the engine hashes the day and the scene), the placeholder lines (`SVC_LINES`, `ZONE_WORDS`) and the drafts of her profile in `SVC_STYLE` (patience, kiss length, tempo, how often) and `herGrain` / `herOrder` (the engine reads her expectation profile, P15 `how`), the stand-ins for `sole_close` when it is missing.

**Service, open engine questions (decide in the plan of chunk (e)):**
- The zones (`toes`, `ball`, `arch`, `heel`, `edge`, author's set) replace `tongue_work`'s parts (`toes`, `arch`, `heel`, `sole`): the engine's part per beat becomes a zone, `sole` goes.
- The gestures (a held press, scrubbing, a steady circle, nothing, away, a press on her legs) are new inputs; the classifier stays in the UI, the engine receives the act and its quality.
- Her signals (`footSignals`, P16b §8: motions and meanings per holder by `fnv1a`), the first naming, a misread and an unanswered signal are engine events; the signals learnt are the pair's mastery.
- Her profile gives the kiss length, the tempo of a rub, her grain, her order of zones and her patience; P15's expectation profile has no such fields yet.
- The art slots `legs_seated` (`rest`, `foot_raised`) and `sole_close` with their sidecars (`fit`, `zones` as `[x, y, rx, ry, deg]`): where the sidecar lives (beside the picture, read by the asset loader) and what happens without it (the automatic zones).
- The memory check: a misread or a failed check her disappointment may remember; the rest is bookkeeping.

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
  - **face up** (`straddled`, `standing_on`, `boot_on_chest`): the ceiling art behind (`#ceiling`, blurred, dimmed), her from below (`placeSprite`). The art slot `over` (a sprite drawn from below) when it exists: height 1.04 vh by default, **anchored to the bottom** with room for her lean (its bottom edge below the frame by half its drawn width × sin 6°, at least 2 %; was a fixed 1.02 until 2026-11-23), its fit `{ height, x, sink }` set once per picture in the panel and carried as a sidecar ("copy the fit"). Without it the ordinary knee-length sprite rises from the bottom edge: height 1.55 vh, bottom at 1.42 vh, `rotateX(10deg)` in a 1100 px perspective. She leans with her shifts (`rot = lean·3.2 + cop·2.2` degrees) and comes closer as the strength goes (`press`). A cool screen glow on her while she reads (`#screenGlow`).
  - **face down** (`human_chair`, `footrest`): the floor art (`#floor`; it is already drawn in perspective, so no extra rotation), closer and softer as the strength goes (`near`, the floor's blur and brightness).
- **Her legs in `human_chair`** (`drawFloor`, `legsHang`, `legPoints`, `LEG_FEET.relaxed`): her calves hang at the edges of the view, the outer side off the frame. Geometry: the `relaxed` outline, its y scaled by 0.86, mirrored for the right leg, smoothed by `chaikin` three times. Motion: before a shift the leg on her side presses in (`press`) and the other lifts and swings out (`lift`); while she reads her feet bounce, the right one more (`Math.sin(t·3.1)`, amplitude 1 and 0.35), otherwise a slow sway; a jolt on impact. Drawing: four quarter-resolution canvases: the legs (`legC`), their complement (`compC`), the complement blurred by 0.022 H and tinted flesh red `rgb(226,78,52)` (`rimC`), the legs blurred by 0.012 H and filled `rgb(34,22,22)` with the rim `source-atop` at 0.55 (`outC`).
- **`footrest`**: she is not in view. The tell is heard: the rustle and the chair's creak panned to the side she is about to lean (`StereoPannerNode`, `pan` ±0.85).
- **Her screen's light on the floor** (both face-down contacts): a cool pool `rgba(120,170,255, 0.34·attention·flicker)`, blurred 0.07 H, sliding with her lean (`0.16 W`) and weight (`0.1 W`). Attention: busy 1, glancing `0.45 + 0.25·sin`, watching 0.05.
- **The level** (`#vial`): the whole SVG (brass caps with screws, the amber liquid and its gradient, the engraved scale, the sheen, the elastic bubble, the tolerance marks that light when level, the warm glow under it), scaled 1.3, 186 px above the bottom, tilting with the frame at 0.35 of its angle. The bubble is a spring on the error (stiffness 260, damping 16) and stretches with its speed. Both springs (the balance and the bubble) are stepped in pieces of at most 8 ms (fixed 2026-11-23: one Euler step of a long frame diverged, the balance ran off to millions and drained the strength; at 60 fps nothing changes).
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
