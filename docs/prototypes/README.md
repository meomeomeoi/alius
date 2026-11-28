# Mini-game prototypes (P10e chunk (e))

Each file here is a **reference prototype** of one mini-game instrument, built and tuned with the author in the design session (P10e spec §15) and approved by playing it. **A prototype is normative: chunk (e) ports it into the extension exactly** (author, again on 2026-11-24: the executor ports the code, not a re-creation, wiring it to the extension; every approved game took many rounds, and a port that drifts from the prototype means doing them again. Where the extension cannot do something the same way, stop and report; the review compares the port with the prototype side by side at the same settings). Port the drawing code, shapes, numbers, easings, timings, colours, sound synthesis and her lines' behaviour as they are, adapting only the wiring (state, engine, settings, the scene's layers). Do not redraw a shape "in the same spirit": the author rejected several drafts of these silhouettes, and the approved geometry is the code here. Where the extension cannot do something the same way, stop and report.

**Copy, do not retell (author, 2026-11-27).** The executor copies the prototype's code into the extension almost word for word (copy and paste the functions, then change only the wiring) and never re-types it from a plan, a brief or the prose of this file: a retelling breeds mistakes and liberties. A plan or a brief names the prototype file, the functions and tables to copy and the lines whose wiring changes; it never restates a function's body in its own words.

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

```bash
npm run proto -- cards
```

```bash
npm run proto -- throne
```

```bash
npm run proto -- posture
```

```bash
npm run proto -- foot_care
```

```bash
npm run proto -- sparring
```

```bash
npm run proto -- headlock
```

```bash
npm run proto -- strokes
```

Each writes `.superpowers/prototypes/<name>.html` (ignored by git): one self-contained page with the fonts, backdrops and a placeholder sprite (`tests/fixtures/layout/sprite.svg`). `--sprite <file>` uses any local sprite; **never commit the author's art**. Open the page in Chromium. `H` hides the panel; `window.__S` (settings), `window.__G()` (state) and `window.__forceO` (force the opening, 0–1, `null` to release) exist for screenshots and tests.

## `strokes.html` — the interactive strokes: her physical discipline as a game (P16 §R.2; P16c ruling 16)

*To be ported in P16c with its stage setup (P16c ruling 1): an instrument of its own for a `holderPunishments` row whose effect is `physical` (today narrated), and for the ceremony's execution step; checked by its `fidelity.json`. The `pain` discipline of P16b gets its reader here.*

Approved by the author on 2026-11-28 after rounds 1–2 ("I've felt the gameplay, it's fine"; round 2 moved pulling away onto a key). The defaults of the file are the approved state. Run it with `npm run proto -- strokes`; it needs `slap/slap.ogg`, `slap/swish1–3`, `ha/cloth1–4`, `ha/creak1–3`, `ha/soft1–2`, `ha/wood1`, `ha/belt`, `ha/step_w0–2` and `breath-in-out.mp3` (`assets/LICENSES.md`), and bundles the dial's drawing code (`%%DIALKIT%%`) as `posture.html` does.

**Copy it, do not rebuild it (author, again on 2026-11-28).** The port copies `strokes.html` word for word: the functions and tables named below are pasted into the instrument and only their wiring changes (her plan, the engine's numbers, the scene's layers, the settings). Nothing is re-typed from this section, the spec or a plan; nothing is "tidied", merged with `slap.html` / `posture.html` code already in the extension, or redrawn. The review compares the port with the prototype side by side at the same settings; a difference is a defect of the port, not a design question. Where the extension cannot do a thing the same way, stop and report.

**Scheme B (author):** each stroke is heard, braced, damped and named, in that order.

### Normative (port exactly)

- **The tables** (copy them as they are): `IMPL` (each implement's `force` and `mark` are `content/core/implements.json`'s; `swing`, `imp`, `tap`, `delay`, `sting` are the instrument's), `POSTURES` (the dial's pose, the targets each posture offers, its `view`), `TARGET_WORD`, `POINTS`, `KEY_OF`, `FLINCH_TO` (where each point jerks when a stroke lands), `HIT` (which points a target throws, and how much each takes), the constants `FLINCH_PER_FORCE` 10, `PAIN_OFF` 2, `BRACED_K` 0.55, `PULLED_K` 0.45, `HEAT_GAIN` 0.6, `SLIP_AT` 100, `SEEN_AT` 55, `CORRECT_STEP` 38, `LOUD_EXP` 1.4, `FEINT` 450, `TAP_MS` 700, `TENSION` (slap.html's body: rise 100, peak 80, fall 220, braced at ≥ 0.8), `STYLES` (the shape of each style's punishment: `gap`, `lead`, `feint`, `tap`, `count`, `waits`, `miscount`, `add`, `fault`, `number`, `talk`, and `force`, `after`, `ask`, `thanks`, `fix`, `swap`, `warmup`, `oneMore`), `COUNT_MS` / `COUNT_DEFAULT`, `EXPR` (her faces; never `desire`, P16c ruling 4), `NUM_WORDS`, `FEEL`, `SWISH`, `VIEWS`.
- **Her manner** (`gapOf`, `leadOf`, `talkOf`, `countMsOf`, `land`'s force): `tempo` −12 % a step on her gaps and her raise, −8 % a step on the count's time; `intensity` +10 % force a step; `voice` +25 % a step on her lines; `order` narrows the spread of her gaps (×(1 − 0.25 × step)); `warmth` ≥ 1 makes any style hold the commander after (`end`).
- **A stroke** (`startStroke`): she lines it up first by her style's `tap` share (×1.4 for an implement that needs aim, ×0.6 for one that does not; ritual always with an aimed implement): two light taps 260 ms apart (`SFX.tap`) and a cool touch at the bottom of the view (`#touch`); then the implement goes up (`SFX.raise`: her clothes on her side; the belt drawn back on the first stroke and its leather creaking; the cane cuts the air once before the first stroke, `SFX.practice`); then her feints (`feint` share, a second one 25 % of the time; `FEINT` each, her clothes twitching); then the swing (`IMPL[].swing`) and the impact. The swish (`SFX.swish`, `SWISH`) is timed to end on the impact; the cane and the crop add a narrow rising whistle. She stands on one side for the whole punishment (`dir`, a hash of its id).
- **Brace** (`press`, `tensionAt`): Space or the left button, one try a stroke, slap.html's tension and intake; braced at the impact = the stroke throws `BRACED_K` of itself; a press on a feint burns the try (playful says so).
- **Pull away** (`pullAway`): the key **X** (round 2: a mouse flick was caught by the move to the dial), from the raise to the impact, once a stroke, not while she lines it up. Defiance (as the slap's turned face): the stroke glances (`PULLED_K`), the body pulls away (the hands drop when kneeling, else sideways away from her), her `pulled` line and face.
- **The impact** (`land`, `SFX.hit`, `flash`, `scatter`): the sound by implement (`SFX.hit`'s seven recipes over the slap's recording, a crack for the leather, the crop and the cane, a thump under), the world's sound dulled for 0.9 s; the flash at `0.75 × k × (0.55 + 0.09 × force)`; an implement with `delay` > 150 ms (the cane, 320) stings a moment after: a second flash and a heartbeat; a shaky exhale after an unbraced stroke, a steady one after a braced one. **The heat** of the target: +0.07 × force × k a stroke (cap 1.6), fading with τ 40 s; drawn at the bottom of the view (`#heat`) in the shape of the implement's mark (`redness` wide, `welt` a band, `line` thin), throbbing faster as it grows; the heart quickens with it (70 → 130 bpm); past 0.8 the view trembles. The body speaks once each (`FEEL`: the heat, the sting after, the burn).
- **The flinch** (`land`, `step`, `activePoints`, `blendedBody`): every point the target throws in this posture gets an impulse of `max(0, force × FLINCH_PER_FORCE − pain × PAIN_OFF) × k × (1 + HEAT_GAIN × heat) × HIT[target][point]` (P16 R.12), delivered over `(imp + delay)` ms after the `delay`; the gaze is a point only under "eyes on her". The body on the dial is the target's skeleton blended toward `FLINCH_TO` (posture.html's `blendedBody`, its `walk` guarded for a state with no gaze ray: closed eyes). Playful's first three strokes are light (×0.5), affectionate's all (×0.8).
- **Damp** (`correct`, `slip`, the dial): posture.html's correction (keys 1–7 or a click on the joint or its bead, `CORRECT_STEP`, its loudness and sound, the jolt); past `SLIP_AT` the posture breaks (a creak, a jolt, her `moved` line, the point back at 35). With her rule **do not flinch**, a peak past `SEEN_AT` during the stroke is a flinch she sees. **Drill** puts the posture right between strokes: the worst point over 30 must come under 15 within 2.5 s (her `fix` line by the point), else it counts as moved.
- **Name** (`afterStroke`, `openInput`, `parseCount`, `sendLine`, `settle`): once the flinch has passed, the count by mode: `aloud` the input opens (her accent ring, five dots of her time: `COUNT_MS` by style, else `COUNT_DEFAULT`) and takes the number in digits or words, with "thank" in the same line under her thanks rule (regal always); `hers` she writes the number large in her hand (`sayNum`); `none` (cold) nothing. **What a miss does** (`settle`, by her `STYLES` row): `restart` (ritual, drill) the count from one; `add` (playful +1, cruel +1, vindictive +2) more strokes; `repeat` the stroke does not count. **What a fault does** (a broken posture, a pulled stroke): `repeat` it does not count; `reset` (cruel) the count from one; `add` (vindictive) one more; `none`. The next stroke: after the count for a holder who `waits` (gap × 0.7), else in her own rhythm from the impact.
- **Her ways** (`STYLES`, `begin`, `end`): ritual names the number, always lines up an aimed implement, even gaps, the count restarts at a miss, thanks at the end; drill even and quick, restarts, corrects the posture; regal has the commander ask for it first (`please` / `may I` / `beg`, 9 s, asked again until it comes) and thanks after each and at the end; cold fast, silent, no count, the number hidden; clinical changes the implement half way (one within 2 of its force) and notes reactions; playful warms up, feints, a miss adds one and she may add one at the end (`oneMore` 0.5); vindictive names it a sentence and adds; cruel hides the number, feints, does not wait for the count and starts it again at a fault; affectionate slow and soft, and holds the commander after.
- **What the commander sees** (`VIEWS`, `frame`): kneeling with palms up, her sprite from below (`her`: height 1.3 H, bottom 1.16 H, `rotateX` 8°, her two face layers crossfading, foot_care.html's `setFace` / `showFace`); bent over the desk, chest down, over her knee: she is out of sight, the room close, low and blurred (`desk` 12 px at 0.36 ×1.9; `floor` 18 px at 0.24 ×2.4; `lap` 13 px at 0.3 ×2.0, turned −6°), and she is her shadow falling across the view from her side as the implement goes up (`#shadow`), the sweep in the last 140 ms (slap.html's), her sound and her hand. Over her knee her other hand settles on the back before a stroke (`#press`). **The impact knocks the body**: kneeling the view drops (5 % of the height) and turns; else it is pushed into the surface (+5 % scale) and shoved away from her (2 % of the width), a damped swing back (slap.html's whip) with a motion blur. The tension tightens the frame and ducks the world (slap.html's).
- **Her hand** (`say`): slap.html's writing on, beside her face when she is in view (away from her hand), else up on her side of the room; the count's number larger (`.num`, 64 px × factor). Her lines (`LINES`) as kinds: `start` / `startHidden`, `ask`, `asked`, `taken`, `braced`, `moved`, `flinch`, `pulled`, `feint`, `miscount`, `late`, `nothanks`, `restart`, `added`, `tease`, `fix` (drill, by point), `swap`, `end`, `thanked`, `after`; a style without a kind reads neutral's; cold says nothing.
- **The stop word** (S, the pill): ends it at once.
- **Reduced motion**: no camera moves, no lining-up taps, no write-on; the brace, the flinch and the count stay.

### Prototype only (do not port as is)

- The panel (posture, target, implement, the number of strokes, the number and count modes, her rules, style, manner, the commander's pain and endurance sliders, the interaction switches, the look loaders, view), the start overlay, the summary card and its draft words, the stats, the log, the `__` hooks; `introWords` and the opening line (the scene's narration).
- `LINES`' texts (the cue pool) and `STYLE_NOTE`; the number of strokes (the engine's count); her rules of conduct as checkboxes (her profile); `G.id` from the clock (the punishment's id); the three-times cap on a count that keeps starting again (`settle`: a stand-in for her plan's end); the slot estimate of the mark in the summary (the engine's `her_marks`). The endurance slider does nothing: the engine's `craftCapacity('pain')` already adds the P7 body route, and the prototype's `pain` stands for that one number.
- `Math.random()` only varies sounds and where her lines sit (port as is); every pick of the game is a hash (`hash01`, `hpick`, `hrand`), the engine's `practiceRoll` / `fnv1a`.

### Open engine questions (decide in the plan)

- **Where it starts:** a `holderPunishments` effect `physical` (`runPunishmentEffect` in `practice/punish.ts`) and the ceremony's execution step, in a scene with her; with no scene, or the interaction off, it stays narrated as today. The number is the punishment's (`ceremonyCount`, `lowNumber`, doubled by cruel and vindictive; hidden by `countHidden`).
- **The implement, the target and the posture are her choice** (by style, her limits, the content gate: `physical_discipline_shown`; `pain_rough` for implements at severity ≥ 4; the targets as data gated by tags, P16 §R.2); `bent_over` needs a desk or a bunk anchor; `over_her_knee` is the contact (staging it sets both postures).
- **Her rules of conduct** (do not flinch, thank after each, eyes on her) need a field: her protocol (P16) or her expectations (P15).
- **What the engine receives:** per stroke `taken` / `braced` / `pulled`, broken and seen flinches, the count's misses, restarts and strokes added; xp to `pain` through `addCraftXp`; a pulled stroke is defiance (`noteOffence`, as the slap's turned face: decide); Regard by style for a braced, still punishment.
- **`her_marks`** (new): the mark's kind and its slots by implement and strokes, seen by the squad (P15 §15.13: +30 to `knows`); the `injury_chance` of the row as today.
- **The digest** (P16c ruling 5): her expectations (faults against a norm per minute), her aim by style, notable things by weight (a pulled stroke, restarts, every stroke braced), the body afterwards (breath, the burn), no number and no pronoun.
- **Interactions** in SYS › Scene: timing (the brace), the posture (the flinch), the count (off: she counts).
- **Memory check:** the punishment's facts exist (`punishment_given`, `punishment_public`); strokes before subordinates as `slap_public` (a rule if it is a new event); marks seen are the `knows_dynamic` / suspicion sites; a pulled stroke is remembered only through her discipline; the rest is bookkeeping.

## `headlock.html` — the hold and the escape from it (the sparring hold: `smothered_armpit`, breath and saturation together; also `face_to_bottom`)

*To be ported in P16c with the sparring game and its finishers (P16c rulings 9–11, 14–15): the instrument of the pair breath + saturation (today such a pair has no instrument and falls back to the physics card), checked by its `fidelity.json`.*

Approved by the author on 2026-11-28 after rounds 1–2 ("everything is in order"; the lines approved in general). The defaults of the file are the approved state. Run it with `npm run proto -- headlock`. **It is `saturation.html` as approved, copied whole, plus the hold layer:** search the file for `THE HOLD` and the hooks marked `HOLD:`. Where the scent, the dark shapes, the head, her orders and her questions are concerned, port `saturation.html`; this section covers what the hold adds.

### Normative (port exactly)

- **The air** (`holdUpdate`, `AIR_DRAIN`, `SEAL_DRAIN`, `AIR_NOSE`, `AIR_MOUTH`, `openK`): breath.html's gauge (14 a beat), drained by the contact's seal (`firm` 1, `leaky` 0.7) and 1.5× while straining; a breath brings air only as far as her arm lets it in: `openK = smooth(0.18, 0.6, o)` of the dark shape's opening (nose 0.045 a ms, mouth 0.03 a ms at a full opening); every nose breath is her (saturation's head fills as before). The vision of the air (`holdRender`): a tunnel closing on the face from 70 % to 22 %, its rim pulsing red with the heart; the heart (`64 → 150 bpm`) from 70 air down.
- **Her grip sets the opening** (`holdRest`; the one changed line of saturation's `updateLoop`): sealed at 0.2 between her windows (0.12 for 2.5 s after a failed attempt), a window opens it to 0.62 (a false one to 0.45 and snaps shut when breathed for), her slack adds 0.16, straining 0.05 × effort, free 1.4.
- **Her windows** (`HOLD[].win`, `open`, `fake`, `count`): her rhythm by style; ritual and drill say "now.".
- **Her slack** (`HOLD[].slack`, `slackMs`): a laugh to the watchers with her line, her arm resettling (cloth), a word; ×0.8 as often with watchers; for `slackMs` the light leaks past her arm (`#leak`, a warm light at the open side, 160 ms in).
- **Fight** (`strainStart`, `strainEnd`, `breakFree`, `clampDown`): F held strains (effort `easeOut(t / 700)`, the dark shakes, a low strain hum, she feels it outside her slack); released with effort ≥ 0.25 it is an attempt: `effort^1.5 × (slack ? 0.5 : 0.08) × clamp(0.55 + 0.15 × (strength − 3), 0.2, 0.95) / her grip` (about 27 % for an average body in her slack, 43 % for a hardened one, against an average grip), −4 air; failed: she clamps (sealed 2.5 s, −8 air, two presses, her line); broken free: the arm lifts (the ceiling shows), her line, and she may take the commander back once (`HOLD[].regrab`, after 0.9 s).
- **Let it happen**: nothing special; she lets go by her air limit (`HOLD[].letGoAt`) or the bout's time.
- **Submit** (`holdBreathEnd`, `holdSaid`, `yieldAct`, `YIELD_WORDS`): limp after 4 s with no strain and no mouth breath (named once); then a deep breath (≥ 0.9, not the body's forced one) at her hollow (`center` on the seat), or words said into her (`I yield`, `yours`, `you win`, `mercy`, `sorry` …; shown muffled); her answer by style (cruel presses, the others ease off). Fighting after it takes it back.
- **The tap** (`tapOut`, `HOLD[].until`): `signal` lets go at once, `limit` at the second tap, `late` only once the air is under 30.
- **The stance** (`stanceOf`): `fought` (an attempt, a break, two mouth breaths she heard, a submission taken back), `submitted`, `tapped`, else `let_it_happen`; a lost game (blackout, or let go at her limit without a stance) reads "gave in" (P16c ruling 14).
- **The motive** (`MOTIVES`: `put_in_place`, `punishment`, `play`, `grievance`, `freedom`) and what each stance means for her, for an offence and for the watchers: the words of P16c ruling 15; the engine sets the numbers.
- **Her lines** (`HL`, `HL_MORE`, the hold's own `LINES` rows): `entry` by motive and style, `watchers`, `clamp`, `escaped`, `regrab`, `submitted` (apart for a punishment), `tapLetGo`, `tapIgnored`, `end` by stance, `blackout`; the scent game's orders, cough, need and away worded for a won bout. Twelve styles (the six saturation.html had not met are added to its `STYLES`, `LINES.answer` and `HOLD`). Placeholders for the cue pool, approved in general.

### Prototype only (do not port as is)

- The panel's hold section (the motive, the watchers, her grip, the commander's strength, the seal), the start overlay, the summary card with its words, the `__` hooks.
- `HOLD`'s numbers and `GRIP` as drafts for her profile and her combatant; `Math.random()` (the engine hashes: no draw).

### Open engine questions (decide in the plan)

- **The pair's instrument:** today `breathMatches` and `scentMatches` refuse a pair whose second takes the commander's input, so the hold plays as the physics card; this instrument takes the pair (breath main, saturation second) for `smothered_armpit` and `face_to_bottom`.
- **The motive** is a field of the wager (`motive`), set by her challenge (her reading, an open offence, her style) or chosen by the commander in the challenge form (or read from the stake); a punishment bout is a P16 punishment row.
- **The stance** reaches the engine (an input at the hold's end) and decides Regard, the offence and the watchers' regard by motive; the digest says it in words (P16c rulings 5, 14).
- **Memory check:** a punishment fought is an offence (her discipline remembers it); a submission before watchers is P15's witness path; the rest is bookkeeping.

## `sparring.html` — sparring: a timing duel in the yard (P9c's sparring wager as a mini-game; P16c)

*To be ported in P16c with its stage setup (P16c ruling 1): an instrument of its own in place of the AUTO bout of `sparringBout`, checked by its `fidelity.json`; the finishers after her win and the escape from the hold follow (P16c).*

Approved by the author on 2026-11-28 after round 1 and one fix ("it came out really fun, I like it"). The defaults of the file are the approved state. Run it with `npm run proto -- sparring`; it needs `slap/slap.ogg`, `slap/swish1`, `slap/swish3`, `ha/cloth1–4`, `ha/step_c0–3`, `ha/bell`, `ha/crowd` and `breath-in-out.mp3` (`assets/LICENSES.md`).

### Normative (port exactly)

- **The view** (`render`): first person in the training yard (`loc_training_yard_day` / `_evening`, blurred 3 px + 4 px with her lunge, brightness 0.72 − 0.12 × tiredness); her knee-length sprite fills the height (`S.her`: height 1.22 H, top −0.06 H), centred; nothing is drawn over her body. Her two face layers crossfade (`setFace`, `herLayers`: foot_care.html's; `faceFade` 240 ms, a stage setting, P16c ruling 4); an SVG sprite is laid out at its natural size.
- **Her blow** (`planBlow`, the telegraph in `render` and `stepFight`): from the commander's left, right or straight (`L`, `R`, `C`); its progress `p` over the telegraph: she comes closer (`1 + 0.14 × lunge`) and toward its side (`0.05 W`), the frame shifts and tilts against the swing (`0.02 W`, 2.6°) and scales (+5 %), the light dims on its side (`#side`, up to 0.8; a straight blow darkens every edge, a tunnel), a dark blur sweeps in from its edge in the last 140 ms (`#sweep`, the slap's); at its start a step and her clothes on its side, the swish timed to end on the impact (`swish3` for a heavy blow, `swish1` else); ritual and drill call it ("left." "right." "straight."). A heavy blow lunges ×1.25 and takes 150 ms longer. A feint stops at 0.6 of its telegraph and pulls back over 300 ms.
- **Her ways** (`STYLES`: `gap`, `tele`, `feint`, `heavy`, `combo`, `alternate`, `count`): the table is normative as the shape of each style's fight (cruel short telegraphs and combos, ritual even and alternating, playful feints); the manner bends it (`tempo`: telegraph × (1 − 0.12 × step), gap × (1 − 0.1 × step); `intensity`: her blow × (1 + 0.1 × step)). **Her heavy blows come in a rhythm** (one in `round(1 / heavy)` ± 1, ritual every third), never by chance each time (round 1: by chance, a lucky run of openings decided the bout).
- **The commander's defence** (`defend`, the pointer handler): a sharp flick of the mouse away from the blow dodges it (≥ 1300 px/s over 70 ms and 4 % of the width; down, 5 % of the height, for a straight blow); Space blocks; one defence a blow, counted only from her first move; before that a move only tires (−1). **The window** is the last `110 + 35 × reflexes` ms before the impact; earlier and she follows (the blow lands). A dodge slides the view the other way and back (0.07 W, 420 ms; down for a duck); a block tightens the frame.
- **The judgement** (`resolveBlow`, `strike`, `tickBout`: one core for play and for the engine): a blow that lands costs `13 × her power × handicap × (1 + 0.1 × intensity)` (× 1.6 heavy); a block costs 25 % of it (60 % of a heavy one) + 3; a dodge 2; a strike 2; a bitten feint halves the window of her next blow. A dodged heavy blow opens her for `260 + 40 × reflexes` ms, 80 ms after the impact: a click then is a clean hit (`0.6 + 0.2 × strength` of her `18.5 × toughness`); a click at any other time she blocks, and answers at once (a counter: 250 ms, telegraph 320 ms). **Her confidence:** a blow of hers that lands gives her back 0.6, a blocked one 0.2. The commander's strength is `95 + 6 × endurance`, and comes back at 1 a second after 1.2 s without a loss. The bout ends when the commander's strength gives out (she wins), hers does (the commander wins), or at its length (70 s: **a draw**); with "first blood" the first clean hit either way decides.
- **The calibration** (author, 2026-11-28; `BOT`, `botBout`, `calibrate`, the panel's "the author's two cases"): against an average soldier with no handicap, an average commander (3/3/2) never wins and draws from a top 10–15 % performance (55 % at the top 12 %); a hardened one (5/5/4) wins from the top 5 % (65 %; 78 % at the top 1 %) and draws from the top 20–25 % (62 % at the top 25 %). The port keeps a test that runs the bot over the engine's core and holds these bands.
- **Her opening** is shown by her, not marked: her sprite brightens (1.12) and sways, a faint cool light at the centre (`#open`).
- **A blow that lands** (the slap's whip: toward its side, damped, a horizontal blur, a flash at 0.55, heavy 0.8; a straight one pushes the view back); **a clean hit of the commander's** knocks her sprite back (scale −6 %, 4°) over 700 ms and the frame jabs forward (+5 %, 160 ms).
- **No bars:** the commander's strength is the closing, darkening edges (`#tired`), the colour going (saturate 1 − 0.55 × tiredness), the heart from 25 % tired (90 → 168 bpm) and the breath quickening, a tremble past 55 %; hers is her breathing (quicker under half) and her face.
- **Her faces** (`FACE`, `FACE_BY_STYLE`, `react`, `FACE_HOLD`, `baseFace`): SillyTavern labels (never `desire`); a reaction is a moment (dodged `surprise` 0.9 s, landed `amusement` 1.4 s, blocked 0.9 s, bitten feint 1.2 s, hurt `anger` 1.6 s, parried 1.1 s), then back to her fighting face (`neutral`; `annoyance` once her strength is under 40 %); the end's face stays.
- **Her lines** (`LINES` as kinds: `start`, `landed`, `dodged`, `bit`, `hurt`, `parried`, `low`, `win`, `lose`, `draw`), by style, in her hand beside her on the side away from the blow; one in 2.6 s at most, 55 % of the time unless forced.
- **The sound** (`SFX`): the slap's recording low-passed into a body blow (1500 Hz, rate 0.8, a thump under it), a dull smack for a block (900 Hz), a duller thud and her grunt for a clean hit, a light smack for a parried one; her steps (`step_c`) and clothes panned to the blow's side; the swish; the bell at the start and the end; the yard's wind; the squad's voices when they watch (`crowd`, 0.084: the author, 30 % under the first draft); her grunt at 0.049 / 0.021 (likewise); the commander's breath and heart.
- **Reduced motion:** no camera moves, no write-on; the judgement is the same.

### Prototype only (do not port as is)

- The panel (style, manner, her level, the handicap, the body and its presets, the calibration buttons, the sprite and faces loaders, the yard, the bout's length, the flick threshold, sound, debug), the start overlay, the summary card, the `__` hooks.
- `LEVELS` (stand-ins for her combatant's stats: the port reads her power, toughness and quickness from her combatant, `spawnMutineer`, and the handicap rows of `wagerGames`); `LINES`' texts (the cue pool); `Math.random()` in real play (the engine plans her blows with hashes).

### Open engine questions (decide in the plan)

- **The draw.** Today a bout that runs out goes to her (`sparringBout`: "a draw goes to her"); here a draw is its own outcome (the author). What a draw does to the wager's stake (void, or half) is the plan's.
- **Her numbers from her combatant:** power, toughness and quickness from her stats and level so that "average" here is P9c's level-1 soldier; the calibration test runs on that mapping.
- **A fit commander** (4/4/3) cannot win against an average soldier with no handicap (only draw): confirm with the author.
- **After her win:** her finisher (the hold when its conditions meet, P16b; other humiliations, with or without a game) is to be designed with the author; after the commander's win, her reaction by style. The bout and its hold are one slot (P16c ruling 9).
- **The digest** (P16c ruling 5): her expectations (the handicap she allowed, her level), her aim by style, notable things by weight (a feint bitten repeatedly, a clean hit, her confidence back).
- **Memory check:** the wager already writes its fact (`wager_resolved`); the bout's details are bookkeeping; a witnessed loss is P16b's `headlock` path or the finisher's.

## `foot_care.html` — foot care: massage with her tempo, then cream (P16c; P16b §6.2, §8)

*To be ported in P16c with its stage setup (P16c ruling 1): an instrument of its own, its art slots in SYS › STAGE, checked by its `fidelity.json`.*

Approved by the author on 2026-11-27 after rounds 1–2 for **the massage and the cream on her bare feet** ("let's leave foot care at this level for now"); taking off her footwear, drying and the nails are a later round (P16c rulings 2–3). The defaults of the file are the approved state. Run it with `npm run proto -- foot_care`; it needs `ha/cloth1–4`, `ha/soft1–2`, `ha/sheet1–2`, `ha/key1–2` and `breath-in-out.mp3` (`assets/LICENSES.md`). Load the author's foot picture in the panel (never committed).

### Normative (port exactly)

- **The view** (`footRect`, `mirrored`, `toPic`, `render`'s foot and her sprite): the commander holds her foot up, sole to the face. The art slot `held_sole` is one foot (`shown`: which of hers), the other foot is it mirrored; its fit `{ height, x, y, fade, toes }` (the bottom of the picture, her leg, dissolves into the room through a mask: transparent, 0.35 at 45 % of `fade`, opaque at `fade`; `toes` is the toes line, below). Her sprite stands behind the foot to one side (`S.her`: height 1.05 H, centre x 0.62 W, bottom 1.12 H, blur 1.1 px, brightness 0.8 + 0.06 while she looks, 0.62 while she reads her device, a slow breath, a lean back with her relaxation), its bottom dissolving the same way (`S.her.fade`, 0 = none). The room's backdrop blurred 14 px at 0.42, a vignette that opens as she relaxes.
- **Her faces** (`FACE`, `setFace`, `showFace`, `herLayers`): SillyTavern labels by what she feels (`neutral`, `approval`, `relief`, `annoyance`, `disapproval`, `amusement`, `surprise`, `disgust`, `joy`, `disappointment`; never `desire`, P16c ruling 4); a label with several pictures shows one, kept until the label changes; a missing label falls back to `neutral`, then her sprite. The change of face **crossfades** on two layers (the new one loads behind, then fades in over `faceFade` ms, 300 by default; off = a cut); whether it crossfades and how long is a stage setting (P16c ruling 4).
- **The zones** (`DEFAULT_ZONES`, `zoneRadii`, `inEllipse`, `zoneAtPic`, the marker `markStart` … `copyFit`: shoe.html's and foot service's, on `held_sole`): toes, ball, arch, heel, edge; marked per picture as ellipses. **The hands** may touch her whole foot (`onSole`: the picture's alpha within 2.6 of the nearest zone's size, never the shin), and a moment off it (under 0.3 s) changes nothing.
- **The masks** (`makeMask`, `brush`, the four canvases): 120 px wide over the picture's alpha; the blush where the thumbs worked (multiplied, `rgb(255, 186−30v, 176−30v)` at 0.32·v, fading over 40 s), the cream lying on the skin (white `rgb(252,249,243)` at 0.88·c), the cream rubbed in (a satin sheen from the upper left, white at 0.3·d), the light of her inspection; the four are clipped to the picture's own alpha (a CSS mask of the picture).
- **The thumbs** (`readMotion`, `down` / `move` / `up`, `drawThumbs`): the left button puts them on her foot; a circle and a long stroke are told apart over a window of 1.2 s of wall time (`performance.now()`): turning over 1.2 rad steadily one way (over 0.6 of the turning) is a circle (circles a second), anything else that moves 10 px is a glide (foot heights a second, the sole being half the picture), less is a hold. The direction is read over pieces of at least 6 px (foot service's classifier). Drawn: two thumb prints across the stroke's direction, a soft press shadow under them by the pressure, no cursor while playing (a crosshair while setting up and marking).
- **The pressure is a level the commander sets** (round 2): Space or the right button raises it, Shift lowers it, 0.6 a second, from 0.5 at the start; let go and it stays. It is shown as a short bar right of the thumbs (five ticks, the cool accent): the commander knows their own pressure; hers is hidden.
- **Her wants** (`herCps`, `herGlide`, `herPress`, `TOL_T`, `TOL_P`, `knownK`): her circles a second and her glide (`STYLES[].cps`, `.glide`) × (1 + 0.15 × manner `tempo`) × (1 − 0.4 × relaxation) × 0.6 on an unreleased knot; one pressure for her whole sole (`STYLES[].press` + 0.08 × `intensity` + her day + 0.08 × relaxation + 0.15 on a knot, 0.15–0.9). Her band: tempo within 0.55 in log2 of hers (about −32 % … +46 %; round 2), pressure within 0.16, both widened 5 % per level of her rhythm known. Holding still is right on a knot and too slow elsewhere.
- **What she feels** (`massageUpdate`): too hard, too light (a moving light touch on the arch, the edge or the toes tickles when it is lighter than her band by 0.3 × (1 − her `tickle`)), too fast, too slow, or right; a class held 0.5 s is felt. Right raises her relaxation (0.045 a second, ×1.6 on a knot) and lowers her irritation (0.1 a second); a wrong touch raises irritation by **how far past her band** it is (`pastP` / `pastT`, in bands, capped at 2) × her style's `irr` × (1 − 0.15 × `warmth`), never faster than 0.35 a second.
- **Her tells** (`tell`, `TELL_NAMES`, `render`'s toes): the body always (toes curl, spread, flick, wriggle, tap; the foot sinks into the hands, pushes back, pulls back, jerks), her breath (a sigh, a hiss, a giggle; her side of the room, pan 0.35), her face, and her words while her eyes are on the commander (`sayL`: by her style's `talk`, one line every 3.8 s at most). The first time each tell shows, a sensory line names it; a wrong touch that goes on repeats its tell every 2.8 s (right every 4 s). **The toes** are a layer of their own above the toes line (`S.fit.toes`): curled = squashed toward the line (scaleY 1 − 0.16·curl, skewX 3°·curl, darker 12 %), spread = widened 3.5 %, a wriggle ±3°; with the optional picture `held_sole.curled` they crossfade to it instead (0.35–0.75 of the curl).
- **The hints** (`hint`, `HINTS`; the open easing, as the posture call's): a dim word by the thumbs saying what a tell meant ("too hard", "a knot: slower, firmer" …), 1.5 s; at her rhythm known 0–1 always, 2–3 the first time of each, 4–5 never; a switch in SYS › Scene.
- **Her patience** (`pullAway`): at irritation 0.6 her warning (her foot stiffens, a breath out through the nose, its sensory line the first time); at 1 she pulls her foot away, never sooner than 2 s after the warning (1.4 s out of the hands, irritation back to 0.35); three pulls end the massage of that foot.
- **The knot** (her day: a chance by `DAYS[].knot`, `sore` certain; on the ball, the arch or the heel; a hash, no draw): a flinch the first time it is touched; slow, firmer work (or a held press within her band) warms it at 0.16 a second; at 1 it lets go (her deep sigh, the toes spread, relaxation +0.25, irritation −0.3).
- **Her eyes** (`eyesUpdate`): open on the commander; closed once relaxed past 0.65 (open again under 0.5; her words stop, the body speaks); on her device by her style's `busy` share (taps heard).
- **The end of a foot's massage**: her time (`STYLES[].massage` × her day's `len`), relaxed past 0.96 for 3 s (she melts), or three pulls. **Ritual** counts her circles aloud at the start ("one. two. three. four." at her tempo), the one style that tells it.
- **The cream** (`creamUpdate`, `creamStroke`, `COLD_BELOW`): C squeezes it into the palms (0.9 of a palm a second, up to 1.2; a palm covers about half her sole); fresh cream is cold and mixes into what the palms hold (a little more barely cools warm cream); it warms in the palms while it is not on her foot (0.8 a second); on her skin below 0.5 warmth it is cold: a flinch, her line, irritation +0.3, once per cold palmful. A drop by the hand shows the amount, its colour cool to warm, and **a ring that fills as it warms** (cool blue, then warm when ready). A stroke lays cream down from the palm, rubs what lies there in (by the warmth) and picks a little up again.
- **Her inspection** (`inspect`, `verdict`, shoe.html's light): when 92 % of her sole is creamed with little left on it, or her time (`STYLES[].cream`) is up, she turns her foot to the light: a band sweeps across in 1.7 s, creamed skin takes it softly, dry skin stays matte, cream left on flares; her verdict names the driest zone under 0.4 ("%z is dry."), else "greasy" over 8 % left, else her good or poor line. Then the other foot (mirrored), then the end.
- **The sound** (`SFX`, `rubTick`): the rub (a band of noise, its level by the thumbs' speed and pressure, deeper with pressure, wetter with cream), her sigh and hiss (the recorded breath, higher and softer: `breath` from 2.17 s at rate 1.08–1.16, the intake at rate 1.6), a giggle (five short formant bursts), toe taps (`soft`), the sheets and her clothes, the cream squeezed and the palms rubbed, her device's keys; the room tone.

### Prototype only (do not port as is)

- The panel (style, manner, day, her rhythm known, the picture loaders and fit sliders, her sprite's sliders, the debug readout), the start overlay, the summary card, the `__` hooks; the faces loader (in the extension her faces are her expression sprites).
- `STYLES` (her tempo, glide, pressure, ticklishness, times, talk, busy, `irr`), `DAYS` and `LINES`: drafts for her profile, her day (`feetOfDay`) and the cue pool; `Math.random()` in `rand` / `pick` (the engine plans with hashes).

### Open engine questions (decide in the plan)

- **Her tempo and her pressure** need fields: P15's expectation profile has only a free-text `how`; a reader over her style and manner (`bendRow`) gives them until the author writes per-woman values.
- **The knot** comes from `feetOfDay` (`sore` after a run); `knot` per day is the draft above.
- **What the engine receives:** the share of the time right, the pulls, the knot let go, the cream's coverage and verdict; they feed `Relation.craft.footCare` (`careOfFeet`, ±3 % in her next run), xp to the commander's `rhythm` and her rhythm known (`Relation.craft.rhythm`, which widens her band).
- **The digest** follows P16c ruling 5 (her expectations, her aim, notable things by weight: a knot let go, a pull away, the cold cream).
- **The art slots** `held_sole` (`shown`, `fit`, `zones`), `held_sole.curled`, later `held_sole.shod`, with the stage setup (P16c ruling 1); her sprite's `fade` and the face crossfade in her look (`stage.json`).
- **Memory check:** bookkeeping (the care reaches her through `footCare`); a pull away or a cold flinch is not remembered unless her discipline remembers a slip.

## `throne.html` — the throne (the weight inside her activity's frame, with the throne layer)

*Ported in chunk (e), Task 24b (the throne layer on the weight core inside her frame): `src/ui/scene/instruments/activity/throne.ts`, checked by `activity/fidelity.json`.*

Approved by the author on 2026-11-25 after rounds 1–2c (the defaults of the file are the approved state; the long hold's drain 0.35). Run it with `npm run proto -- throne`. **It is `her_activity.html` as approved, with the weight inside it, plus the throne layer**: search the file for `THE THRONE`. Everything outside that block and the few marked edits below is `her_activity.html` and keeps its own normative status. Where the frame and the weight are concerned, port `her_activity.html` and `weight.html`, not this copy; this section covers what the throne adds.

### Normative (port exactly)

- **The throne is the weight inside her activity's frame at any of her activities** (author: not only an audience). `holding_audience` is one more activity row (`ACTS.holding_audience`: visitors one after another, her folder, her signature, her mug). **`human_chair`** (she sits on the commander's back: weight 1.0, shift 1.0, as weight.html's contact) or **`footrest`** (her feet: 0.6, 0.7).
- **The long hold's drain** (`S.frameDrain`): the strength's drain per beat × **0.35** inside the frame (weight.html was tuned for a 45 s session). In the extension it is the difficulty setting `longHoldStrain` (`light` 0.25, `normal` 0.35, `heavy` 0.6, `raw` 1).
- **Her body follows her lines** (`throneBody`, `wCueShift`, `T_TELE`). A line of hers may carry a body cue; the cue's telegraph is her voice (her style's `T_TELE`, ×1.4 while her mug is there):
  - `lean`: a shift to a side by a hash, magnitude 0.45–0.75, ×0.35 with her mug;
  - `press`: pressure 1.5 for 2 beats and a jolt;
  - `laugh`: three jolts 170 ms apart;
  - `cross`: the centre of weight to a side (0.45) and it stays; her line once;
  - `settle`: back to the centre;
  - `rise`: §below.

  Her own lines to herself move her 40 % of the time (a hash: `settle`, `cross` or `lean`). Her own scheduled shifts wait 3 beats after a cue.
- **The flinch** (`throneFlinch`, in `throneUpdate`): when anyone talks about the commander (`about` on her line, `otherAbout` on the other's, 0.7 s after it), the balance gets a kick of ±2.4.
  - Steadied within 0.8 s (error ≤ 1.6 × tolerance and holding): held.
  - Otherwise a `jerk` noise (loudness 0.4, visible); an unaware visitor notices with 0.35.
- **Her mug on the commander's back** (`throneCup`, `throneCupEnd`, in `throneUpdate`):
  - the tolerance narrows to **0.12**, with a 1.5 s settling moment;
  - she moves carefully while it is there: her own shifts at 0.35 of their size and 1.5× slower; no laugh, no rising;
  - **0.5 s** out of level spills it (her reaction by style, a felt fault);
  - she takes it back after 20–35 s.
- **She signs on the commander's back** (`throneSign`): 3.8 s; the mouse must stay still (smoothed speed > 140 px/s for 160 ms: the pen skids); one redo, then she gives up; her shifts wait while she writes.
- **She rises and sits back down** (`throneRise`): her weight is gone for 3–6 s, then she lands all at once. Not holding or not level: −18 × weight, a crack, her felt fault.
- **Visitors of three kinds** (`throneVisitor`, `THRONE_VISITS` as the **shape** of the script; the texts are placeholders):
  - `business`: real decisions about the commander, taken over the commander's head, each with a dim line saying what changed;
  - `aware`: comments; may rest her boots on the commander too (pressure ≥ 1.35 while there);
  - `unaware`: mentions veiled, silence, a risk.
- **The end:** at `with` / `glancing` she may have the commander thank her for the seat (`throneThank`): typed within 9 s, `/thank/i`; her answer by style.
- **Her legs on `human_chair`:**
  - **silhouettes:** weight.html's `legsHang` / `LEG_FEET.relaxed`, as `tLegsHang` / `tLegPoints`; the rim of flesh light; gone while she is up;
  - **or the art slot `legs_astride`** (`throneArt`): her left or her right leg (the other mirrored), two pictures (left and right) or both in one. Its fit `{ height, x, top, tilt }` is placed by the screen, offset into the world (which is larger than the screen for the shake). It is moved by her weight as the silhouettes are: the leg on her side presses in, the other lifts; a foot bounces while she reads; a jolt. Blurred 1.2 px (more as the strength goes) with a flesh drop-shadow.
- **Her lines** (`T_LINES`: `spill`, `skid`, `thank`, `thanked`, `noThanks`), the `regal` rows of the frame (`STYLES.regal`), the weight (`W_STYLES.regal`, `W_LINES.regal`, `W_FALL.regal`) and the throne. With `human_chair` the rest and the end are worded for a seat ("She shifts her weight off your back…", "She gets off your back.").
- **The digest:** her body's cues, landings, spills, skids, visitors (boots, decisions), flinches (the held ones only for the commander), the thanks.

### Prototype only (do not port as is)

- Everything that is `her_activity.html` (port that file); the panel's throne section (the toggles and the "now" buttons, the art loader and its sliders, "copy the fit"); `S.props` (the engine plans her mug, her signing, her rising and visitors as peaks).
- `THRONE_VISITS`' texts and the body cues on `CALL`, `VISIT`, `CARDS`: the shape is normative, the texts come from the script call (`activity_script`), which gains `body`, `about`, `feet` and `decision` on its lines.

### Open engine questions (decide in the plan of chunk (e))

- **Decisions over the commander's head** are P15's command capabilities (countermand, roster, a punishment ordered) applied by the visitor's business: the script proposes, the engine decides which real matter (the commander's roster, a requisition) and applies it through the command domain. Without the domain she decides nothing (the visitor's business stays talk).
- **The script's new fields:** `body` (one of the six cues), `about` (a line about the commander), `feet` (an aware visitor rests her boots), `decision` (a real matter), validated by the engine.
- **`longHoldStrain`:** a scene setting mirrored like `marathonPace`. It applies only to a weight run inside a frame, so old runs stay byte-identical.
- **The art slot `legs_astride`** with `feet: 'one' | 'pair' | 'two'` and `shown: 'left' | 'right'`.
- **Memory check:** as P17g §2.12 (an audience's decision is remembered where its command action writes; a visitor who rests her boots on the commander is P15 §8's witness path, `knows`); a spill and a skid are bookkeeping.

## `posture.html` — the game of postures (P16b §7) and the posture call's schemes B and C

*To be ported in P16b chunk c6 (Tasks 23–24): `src/ui/scene/instruments/posture/`, the call's new functions in `src/ui/scene/instruments/call/`, checked by their `fidelity.json`.*

Approved by the author on 2026-11-27 after rounds 1–1e (the defaults of the file are the approved state, the dial at 300 px). Run it with `npm run proto -- posture`; it needs `ha/cloth1–4`, `ha/creak1–3`, `ha/page1–4`, `ha/soft1–2`, `ha/knock`, `ha/door_open`, `ha/door_close1`, `ha/step_w0–2`, `ha/glass1`, `ha/wood1–2` (`assets/LICENSES.md`) and bundles **the dial's own drawing code** at build time (`%%DIALKIT%%`: `scripts/prototype-dialkit.ts` → `mannequinSvg`, `pose`, `poseOf`, `BASE_POINTS`, the presets); the body between two point states is drawn through `mannequinSvg`'s `body` (a given skeleton). `S` is the page's state for tests.

### Normative (port exactly)

- **The dial is the surface** (`drawDial`, CSS `#dial`, `#dialFace`, `#dialLabel`, `#clock`): while a posture is held (or called) it grows from `min(18.5vh, 200px)` to **300 px** (0.5 s `cubic-bezier(.2,.9,.3,1)`) and stands 92 px from the bottom; the label under it: her name for the posture in her hand (24 px × factor), the preset's words, `EYES DOWN` under her rule, then the fiction clock (`fictionClock`: `N min` / `H h MM min`) and, with a known end, the seconds left. Under her eyes (`watching`) the ring takes her accent (`#dial.watched`).
- **The body drifts** (`blendedBody`, `step`, `rateOf`, `mult`): each point the preset fixes has an offset 0–100 that grows by its rate (per 10 s: `RATE`, arms by state `ARM_RATE`) × `mult()` (fatigue 1 + 0.1 per earlier hold, load ×1.3, hard floor ×1.2, × (1 − 0.08 per posture skill level), × (1 − 0.05 per mastery level)) × the hold's own tiring (+40 % over the first 120 s) × the self-feeding past 50 (1 + (o − 50) / 100); at 100 it is a slip. The drawn body is the target's skeleton plus, per point, `min(1, o/100) × 0.9` of the way to the skeleton of the state it drifts toward (`DRIFT_TO`), the gaze, face and head directions renormalised; the target is the dashed ghost; a point past 22 rings its joint in amber (`JOINT_OF`; the feet have no joint: a ring at the ankles).
- **The beads** (`drawBeads`): seven numbered beads (26 px) on an arc down the left of the rim, 1 TORSO at the top-left to 7 FEET at the bottom-left (angles 122° + 19° per step, the list reversed), each with its name to its left; the amber glow and border grow with the point's drift (`--o`); a point the preset does not fix is faded (.18) and inert; a held 6 is filled; a click on a bead is the same as its key.
- **Corrections** (`press`, `anchors`): a click on the joint (an invisible 15-unit hit circle on the projected joint, read from the drawn segments) or keys 1–7 (only when nothing editable has focus) takes `CORRECT_STEP` (38) off; its loudness is `(o/100)^1.4`: the cloth sound at `0.05 + loud × 0.5` (rate `1.15 − loud × 0.3`), a creak above 0.55, the dial jolts above 0.3 (`jolt`); under her eyes a correction louder than `SEEN` (watching 0.42, glancing 0.72, busy never) is fidgeting she sees (her `fidget` line), and every third seen one is a slip.
- **A slip** (`slip`): her line (`gaze` or `slip` by the point), a creak, a jolt, and the point goes back to 35 (she puts it back). **A fault that is not a point** (`fault`): "look at me" not obeyed: her `notLooking` line, a slip, nothing moves.
- **Her attention** (`setAttention`): busy / glancing / watching, drifting by a hashed timeline (6–15 s a phase); her sprite's brightness .78 / .9 / 1.03; watching darkens the edges (`#vignette` .55) and plays a wood creak; she sometimes says her `watch` line; pages turn while she is busy.
- **Temptations of the gaze** (`event`, the gaze branch of `step`): a visitor (knock, door, steps, a line in the reply, the door closing; impulse 50 over 4.5 s), she undresses (cloth; 30 over 3.5 s), a sound behind (glass; 30 over 3 s); while an impulse lasts the gaze rises by `size / len × 1.6` a second unless **6 is held**; hashed every 22–46 s.
- **"Look at me"** (`event('look')`, `lookUp`): her line; a trap by style (`TRAP`); L within 3.5 s looks up (the gaze at 90), then her `down` line and 6 lowers it; looking at a trap is a gaze slip; not looking when it was an order is the `notLooking` fault. Not asked under a blindfold.
- **The blindfold** (`#blindView`, `#grain`, `feelLines`): her activity's blind view (the dark radial gradient over the whole scene) and grain (opacity .16, redrawn every 80 ms at a third of the resolution); the dial at .07 and blurred, the beads hidden; the gaze is not judged; the body speaks in feel lines at 40 and 72 of a point's drift (`FEEL`, the second one warmer), centred above the reply; the world is worded as heard.
- **The fiction clock**: 30 s of fiction a real second × (1 + 0.25 per posture skill level) (author: ×1.5 over the first draft; the engine's posture beat is 45 s).
- **Her lines** (`LINES`, `pickLine`): by style (neutral, ritual, drill, cold, playful, cruel, regal) and kind (`start`, `watch`, `fidget`, `slip`, `gaze`, `release`, `clean`, `prefix`, `taken`, `wrong`, `late`, `look`, `down`, `notLooking`), written on in her hand at 74 vw / 15 vh (46 px × factor, `steps(16)` over 600 ms, gone at 3.6 s); a style without a line reads neutral's; `cold` may say nothing. The texts go into the card voice (`docs/content/card-voice.md`, `cardVoice`) as the call's lines did.
- **The call, scheme B** (`startCall`, `statesFor`, `callPress`, `pickState`, `drawStates`, `drawCallDial`, `matches`, `checkTaken`, `present`, `endCall`, `scheduleTaps`, `callTick`): her word large in her hand (92 px × factor; under her prefix, 34 px) at 74 vw / 13 vh; five ink dots and wood taps over her window; her window is her style's (ritual 4000, drill 3000, others 5000 ms) **plus 2500 ms for each point that has to move**; the body starts as it is (its base's defaults under its own points); a point's key selects it (its bead ringed in her accent) and shows its states as a column left of the dial (`#states`: the states her named postures use plus the one held), the same key again steps through them, a click sets one; **the posture is taken the moment every point matches** (the gaze not counted); late: her `late` line; wrong: `wrong`. She never calls the posture the body is in.
- **The hints** (`hintLevel`, `ghostShown`, `hintOn`, `pointsShown`): by this posture's mastery on the pair: 0–1 her posture as the ghost, the right state lit in her accent in the column, the points still to move ringed in her accent; 2–3 only the rings; 4–5 nothing. "Always show every hint" is the open easing in SYS › Scene (spec §1.2).
- **The call, scheme C** (`startCall('C', n)`): a series of five calls 2.6–5 s apart; about three in ten have no prefix: a trap, and moving is the fault (holding still is right).
- **Reduced motion**: no write-on, no jolt, the dial does not animate its size; feel lines fade without moving.

### Prototype only (do not port as is)

- The panel (the preset list, her term, her rule, the blindfold, the calls, the temptations, her attention, her style, the commander's sliders, the dial size, the numbers, display switches), the log line, the stats.
- The hold's start and end (space, `end`), her term (the engine's `until` / `hidden`), the hashed attention timeline and the hashed events (the engine's attention plan and `temptations`), the named set `NAMED` (the engine's `practices.postures`), the stand-in scene (backdrop, sprite, reply, input): P10e's.
- The engine judges what the instrument reports (`posture/correct`, `posture/slip`, `posture/end`, P16's `practice/take_posture`): the counts, xp, records, Regard and offences are the engine's (P16b c3).

### Open engine questions (decide in the plan of chunk c6)

- The tables `DRIFT_TO`, `RATE`, `ARM_RATE`, `SEEN`, `TRAP` and the constants are `TUNING.craft.posture` (c3, a G1 draft): the fidelity tables compare them, so the engine's values must equal the prototype's.
- Scheme A (the fan of cards, P10e's port) below posture level 2, B from 2, C from 4 (`TUNING.craft.call`).
- A taught posture's first call (`call.taught`, c5) shows the ghost whatever the mastery and counts no slip.
- **Memory check:** nothing new (the engine's events are c3's and P16's).

## `cards.html` — her hand of cards (the dock's cards of P15a, P15 and P16) and the posture call (P16)

*Ported in chunk (e), Tasks 7–10 (her cards, the collapsed edges, the posture call, arrival and sounds; her voice as data in Task 3, the hands in Task 2, the dial's circle in Task 6): `src/ui/scene/cards/`, `src/ui/scene/instruments/call/call.ts`, checked by `instruments/cards/fidelity.json` and `instruments/call/fidelity.json`.*

Approved by the author on 2026-11-25 after three rounds (the defaults of the file are the approved state). Run it with `npm run proto -- cards`; it needs the hands in `fonts/hand-*.woff2` (moved there from `assets/hands/` by chunk (e)), `ha/soft1–2`, `ha/card_slide1–2`, `ha/card_place1–2`, `ha/card_fan` (`assets/LICENSES.md`) and draws the mannequins with the dial's own `mannequinSvg` at build time (`scripts/prototype-mannequins.ts`). The texts are `docs/content/card-voice.md` (approved): the tables of the file are a copy of it. **A restyle: no card's mechanics change** (the same answers, the same actions, the same `data-analyze`).

### Normative (port exactly)

- **The card** (CSS `.card`, `.head`, `.body`): glass `rgba(14,12,20,.60)` with a 1 px `rgba(255,255,255,.12)` line, radius 16, blur 16, a shadow `0 10px 30px rgba(0,0,0,.35)`; a 3 px stripe of her accent on the left edge (12 px from top and bottom, opacity .85). The head line: **her name in her hand** (26 px × the hand's factor, her accent) and the kind in small caps (11 px Plex, dim, lower case: `task`, `sealed`, `punishment`, `order`, `ceremony`, `demonstration`, `step`, `vow`, `claim`, `begin again`, `a moment`, `a hold`); the set-aside × (24 px round) top right.
- **Her voice** (`bodyOf`): her words (`text`, or the static words of card-voice §3) in her hand, 27 px × factor, line height 1.18, her accent; a thin rule (her accent fading to nothing); then **the conditions, each a line of her own** in her hand, 22 px × factor, her accent mixed 62 % into the ink, **the engine's value in her full accent, underlined** (1.5 px, offset 4 px, her accent at 55 %). The order is fixed (when → what it costs → who will know → the proof → what a signed one hands over → say it → no length; a punishment: her words → `{Label}.` → the weight; an order: `{Soldier}: {label}.`; a demonstration: before whom → where and when; a claim: `You'd give me:` and the grants as `· {grant}`); a condition is never left out (a cruel holder names the cost).
- **The lines** (`linesOf`, `pick`, `fill`): her style's own lines for `when`, `cost`, `who`, `onlyMe`, `weight` and the call (card-voice §2, §5), the neutral lines (§1) for anything else and for a style with none; one line picked by `fnv1a(cardId|style|kind) % n` (no rng; one card always says the same); `{x}` is the engine's value as it is, `{X}` capitalised where it opens a sentence; each value wrapped in the stronger ink.
- **The card's words for a deadline** (`WHENS`): `today`, `this morning` / `this afternoon` / `this evening` / `tonight`, `tomorrow`, `tomorrow morning` … `tomorrow night`, `in two days` … `in seven days` (then `in a few days`), with `, in the morning` … when a slot is named. No frame puts "by" or "until" before it.
- **The moment and the fallback physics** are not her voice: a neutral stripe, the kind only (no name), one line of prose (Inter 300 italic 17 px; the moment's line from card-voice §3), the commander's options as pills, "Or answer in your own words." dim italic.
- **The commander's answers** (`.pill`): rounded pills (radius 18, 7 × 16 px, Inter 400 14 px), the cool accent of the dial (`#3b97ff` at 45 % border, 10 % fill, 24 % / 75 % on hover), no brackets, lower case words (card-voice §4). **Sign** is a pill held 1.2 s, its fill growing left to right and falling back when let go.
- **The sealed envelope**: a wax seal 30 px in her accent (a radial gradient and a dashed inner ring) in the head line, left of the ×; her line from §1 "sealed"; the weight unless she is cruel or vindictive; affectionate names the track.
- **The ceremony**: her title line, the steps as a list in her hand (✓ done, struck through, faded; › next in her accent; · later), the next step's own control.
- **Readable mode**: no blur, opaque glass (`rgba(12,11,16,.95)`), and under each condition its dry line (Plex 11.5 px, dim: `Due: this evening.`, `Weight: heavy.` …).
- **Collapsed cards are the edges of her hand** (`render`, `gistOf`): one card is open (the one the commander opened, else the newest); the others are strips **above it, newest on top**, each overlapping the next by 6 px (`margin-bottom: -6px`); a strip shows her name in her hand (21 px × factor), the kind, and **the gist**: the engine's short name and the most urgent condition (a task's summary · `{when}`; a hold's summary; a sealed task `✉` and nothing else; a punishment's label · weight; an order `{soldier}: {label}`; a ceremony's label · `next: {step}`; a demonstration's place · slot; a claim's domain; a step or a vow its own gist), Inter 300 13.5 px with the value in her accent, ellipsis at the end. Hover lifts a strip 4 px and rings it in her accent; a click opens it (the open one becomes a strip). **A card with a clock never collapses** (a running hold, and the posture call is not a card at all): it is drawn open after the open card. The ×, the `N waiting` counter and its click to bring them back stay as P10e built them.
- **Arrival**: a new card slides in from the left (46 px, −2°, 0.5 s `cubic-bezier(.2,.8,.3,1)`) with `card_slide` (gain .25, pan −0.6); opening a strip plays `card_slide` at .18; an answer plays `card_place` at .25.
- **The dial's circle never moves** (`#dial`, `#dialLabel`): the label hangs under the circle (absolute, centred, 240 px wide, wraps), her name for the posture on top and the base name under it (10 px, .75); the real `.alius-stage-dial` lets a wide label widen the corner and shift the circle.
- **The posture call** (`startCall`, `scheduleTaps`, `tap`, `choose`, `end`): a short full-frame moment.
  - **Entry:** the frame dims to 0.28 (0.45 s); the dial's ring takes her accent; **her word** (her name for the posture) is written on in her hand, 92 px × factor, at 74 vw / 13 vh (beside her, never on her face), `steps(14)` over 520 ms; the fan rises with `card_fan` (gain .3, pan .6).
  - **Her foot keeps the time** (only with the order interaction on): taps from 380 ms, each next one `700 − 480·k²` ms later (`k` = the time gone / her window), the last exactly at the window's end; each tap is `soft1` or `soft2` (gain `(0.22 + 0.4·k)`, ×1.6 for the last; pan .35; rate 0.92–1.02), an ink dot under her word at `(k − 0.5) × 300` px (7 px, her accent and glow; the last 10 px, white: too late) and a small bob of the word (0.16 s). Her window is the engine's (`postureWindowMs`: ritual 4000, drill 3000, others 5000).
  - **The fan** rises from the dial: her named postures in a stable order, each a card 150 × 196 (glass `.74`, radius 14), the dial's mannequin 132 px, her name for it in her hand (30 px × factor), the base name under it (9 px caps, wraps); the cards side by side 140 px apart, the rightmost over the dial (the fan's anchor 110 px from the right edge, `min(18.5vh, 200px) + 72px` from the bottom), each turned `(i − (n−1)/2) × 5°` and lowered `|i − (n−1)/2| × 9` px; they rise from 260 px below at 0.6 scale, 55 ms apart; hover straightens a card, lifts it 18 px and scales it 1.04. **A card is clicked whole.**
  - **Right:** `card_place`, the card flies into the dial (0.45 s, shrinking to .35) and the dial's figure takes the posture at 380 ms; the others fade. **Wrong:** the card shakes (0.35 s) and the right one is ringed in her accent (she shows which); the fan sinks after 0.9 s. **Slow:** the last tap. Then her line (card-voice §5 by style and outcome, `{posture}` her word) is written on in her hand, 40 px × factor, at 13 vh + 140 px (600 ms); the dim lifts at 1.3 s, her line fades at 2.6 s, all is gone at 3.3 s.
  - **Without the order interaction** there is no clock: no taps, no dots, no slow; only right or wrong.
  - **Reduced motion:** no write-on, no bob, no rise (the fan appears placed), the dots and sounds stay.
- **The hands** (`HANDS`, `measureHands`): every hand of the gallery goes into the game (author, 2026-11-25): the six of P10b, the six strict print hands (Klee One, Playpen Sans, Neucha, Gaegu, Pangolin, Edu SA Beginner) and the 36 candidates. **Each hand's size factor is measured**, not set: the geometric mean of Caveat's x-height over hers and Caveat's width of `Bring me the patrol roster before evening mess.` over hers, clamped to 0.7–1.6; every size in her hand is multiplied by it.

### Prototype only (do not port as is)

- The panel (adders, deal, clear, styles, hands, accents, the deadline picker, display switches), the gallery (G), the log line, the `__` hooks.
- The scene around the dock (backdrop, sprite, reply, input, the dial's stand-in): the scene is P10e's.
- The cards' data (`KINDS`: texts, labels, names, the lapse of "training together") and the called posture (random here; the engine's `callPosture` picks by `practiceRoll`), the four choices (the engine's set is her `practices.postures` that pass `entryAllowed`), the ceremony's "(take it on the dial)" pill (the commander's posture does a posture step).

### Open engine questions (decide in the plan of chunk (e))

- Where the voice lives: the tables of card-voice.md as content the author can edit (read by kind and style) or as code.
- The card's deadline words (`this evening`, `tonight`) differ from `dueWords` (`today, evening`), which the PDA's practice block also uses: a second function for the scene's cards, or one for both.
- The hands: 42 new fonts in `fonts/` and the `handFonts` registry with a measured `scale`; `handOf` picks a unit's hand by `fnv1a(unitId) % n` in registry order, so a longer list gives most old units a new hand (keep it, or keep the six for units with no `hand`).
- The recorded sounds (`soft`, `card_*`) are the extension's first sound files: the sound layer synthesises everything today.
- The engine's third outcome: a right answer the commander cannot take now (held in place, no standing room) is `posture_called` with `void`; the prototype has no line for it.
- **Memory check:** nothing new (a restyle; the call's outcomes are P16's `posture_called` (`taken` / `void`) and `posture_slip` (`late`), already decided there).

### P16b additions to `cards.html`: the craft's scene surfaces (gate G3; approved and normative, 2026-11-27)

*To be ported in P16b chunk c7 (Task 26): the card draw functions in `src/ui/craft/`, the dock and the chip row (`src/ui/scene/stage/`), the voice in `content/core/cardVoice.json` from `docs/content/card-voice.md`.*

Approved by the author on 2026-11-27 in round 1. Search the file for `P16b G3` (CSS, the voice, `KINDS`, `gistOf`, `bodyOf`, `drawChips`). Everything else about a card (glass, her accent stripe, her hand, the conditions, the pills, the collapsed edges, arrival and sounds) is the approved cards above.

**Normative (port exactly):**
- **drill** (`KINDS.drill`, `drill_other`): her words (none for a drill with another woman: her voice only); the conditions `drillWhat` (`{Drill}. With me.`; a drill with another woman: `drillOther`, `{Drill}, with {other}. I hear everything.`) and `drillCost` (`It takes {slots}.`); the answers **begin** (dispatches `craft/drill_start`) / **not now**; the gist `weight drill` (`· with Bea`).
- **exam**: her words; `examWhen` (`The exam is {when}.`); `examNorms` (`Show me:`) and the norms as a list in her hand (22 px × factor, the value in her accent, underlined), one line each `{what}: {how much}` in fiction time; `examFail`; answers **begin** / **ask for time** (her words); the gist `N norms · {when}`. The pass mark is never shown.
- **sentence**: her words; the term large in her hand (46 px × factor, `term`: `For {days} days.`); `termWhy`, `termEcho` (the echo's line), `termGrow` (`Every slip adds {add}.`); one answer **understood**; the gist `{days} days left`.
- **her note** (care noticed, for a holder whose way of noticing is a note): a paper card (`.card.paper`: a warm paper gradient `#efe6d6 → #e4d8c2`, dark ink, turned −1.2°, no accent stripe), her words in her hand; the answer **keep it**; the gist the care's object.
- **the lesson**: a card with her one word or line for the point (`lesson`: `{Point}.`), no answers, gone by itself after 7 s (`.card.lesson`, opacity to 0 over the last 20 %).
- **[ANTICIPATE]** (`drawChips`): a chip in the chip row above the input (P10e's row; round, the cool accent, a dashed border, `anticipate her`), shown only while her reading's axes allow it and not yet used in the scene; a click stages the commander's act as a narrated line and her answer follows in her voice by style; then the chip is gone for the scene.
- The voice rows (`NEUTRAL` and the styles' P16b rows: drill, vindictive, regal, playful, cruel, ritual) go into `card-voice.md` and `cardVoice` with their kinds.

**Prototype only:** the data of the cards (texts, norms, the crime), the panel's adders and the `antic` switch, the act the chip stages (the engine picks the service that fits her pair tags: `anticipateRow`).

## `gulp.html` — gulp (P15a `gulp`, timing; content `watersports`, which requires `bodily_fluids`)

*Ported in chunk (e), Task 30 (its engine: Task 29): `src/ui/scene/instruments/gulp/gulp.ts`, checked by `gulp/fidelity.json`.*

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

*Ported in chunk (e), Task 28 (its engine: Task 27): `src/ui/scene/instruments/shoe/shoe.ts`, checked by `shoe/fidelity.json`.*

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

*Ported in chunk (e), Task 20 (its engine: Task 19): `src/ui/scene/instruments/jaw/`, checked by `jaw/fidelity.json`.*

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

*Ported in chunk (e), Task 12 (its engine: Task 11): `src/ui/scene/instruments/slap/slap.ts`, checked by `slap/fidelity.json`.*

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

*Ported in chunk (e), Task 24 (its engine: Tasks 21–23): `src/ui/scene/instruments/activity/frame.ts` and `acts.ts`, checked by `activity/fidelity.json`; the shared kit (`say`, `placeFree`) in Task 5.*

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

### The game inside `provocation`: stillness under provocation (P16b §6.1, gate G2; approved and normative, 2026-11-27)

*To be ported in P16b chunk c7 (Task 25): a new inner game of `src/ui/scene/instruments/activity/frame.ts` (`provocation.ts`), declared in `activity/fidelity.json`.*

Approved by the author on 2026-11-27 after rounds 1–2. Search the file for `THE PROVOCATION`; the hooks it adds to the frame are marked `P16b G2` (the pull in `moveAttention`, no itch of the frame's own while she provokes, no swallow and no cramp while she provokes, Space not a reaction, the fidget as a reaction, the drawing, the panel's `provocation`, `stillness level` and `ticklish`, the summary line).

**Normative (port exactly):**
- **Her stimuli** (`PROV`, `PROV_PLACES`, `provSpawn`): touch, tickle, whisper and the feint (about 18 %), placed on the commander's body as screen points of the view (the default view for this game is `floor`), each announced by a felt line (`sense(…, 'body')`) and a sound (`soft` / `cloth`, panned by place); a whisper writes her line by her ear (`say(…, 'commander', { at })`); a feint is "her hand comes close… and stops" with cloth.
- **Growth** (`provUpdate`): each stimulus grows from 0.08 by `grow[kind]` (touch 0.15, tickle 0.27, whisper 0.1 a second) × (1 + 0.22 per her level above 1) × (1 − 0.1 per stillness level) × the commander's `ticklish` for a tickle (P16c ruling 17: a COMMANDER FILE level, not / a little / very / unbearably = `PROV.ticklish` ×1 / ×1.25 / ×1.45 / ×1.8; the panel's select), + 0.34 while the attention rests on it, − 0.14 while it rests on her or the door, − 0.4 while the breath is held; at 1 the body reacts on its own (involuntary). It pulls the attention like an itch (`pull`: touch 1700, tickle 2900, whisper 1200, × its value). Durations `dur`, gaps 5.5–10.5 s (shorter by 10 % a level).
- **Reactions** (`provInput`, `provReact`): while a stimulus is on, any key but Space and H, a click, a spoken word or a fidget is a reaction; she always feels it (`herFeels('flinch')`), a body line says what happened (a feint: "You flinch from a touch that never comes."), her line by presence follows; the stimulus ends.
- **The breath** (`PROV.breath`): hold Space to breathe through it (the growth −0.4 a second) for at most 4.5 s, shown as a cool arc around the attention closing as it runs out; it refills at 0.8 × real time once let go; run out, it is let out loudly (`bodyNoise('breath', 0.32)`); a hold over 1.5 s let go is a soft exhale (0.1).
- **Her escalation**: two clean stimuli in a row raise her level (at most 4): more tickles, at 3+ sometimes two at once; her `harder` line.
- **The drawing** (`drawProvocation`): a touch is a warm pink glow (alpha 0.3 + 0.6 × value) with the trace of her fingers; a tickle the same, quick, jittering, with sparks; a whisper soft rings of her accent; a feint a faint glow that stops short; all fade over 600 ms.
- **Her lines** (`PROV_LINES`): by style (neutral, affectionate, playful, cruel, ritual, cold) and kind (`whisper`, `clean`, `react`, `harder`); a style without a line reads neutral's; `cold` may say nothing. Texts to `docs/content/card-voice.md` with the port.
- **Ticklish found** (P16c ruling 17, `PROV_TICKLISH`, `provReact`): the first tickle in a run that breaks through on a commander who is very or unbearably ticklish gets her `PROV_TICKLISH` line by style ("found it.") in place of her `react` line; once a run (`P.toldTicklish`).

**Prototype only:** the schedule (`rand`; the engine plans the phase), the place list's coordinates as stand-ins for a view's body map, the panel's sliders. **Open engine questions:** a reaction is a `physics/relief` of kind `fidget` or a new kind `react` (the port decides, P16b Task 25); xp goes to `stillness`; `ticklish` is an optional COMMANDER FILE detail (P16c lists it).

### The game inside `service`: foot service under the desk (approved and normative, 2026-11-24)

*Ported in chunk (e), Task 26 (its engine: Task 25): `src/ui/scene/instruments/activity/service.ts`, checked by `activity/fidelity.json`.*

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

*Ported in chunk (e), Task 18 (its engine: Task 17): `src/ui/scene/instruments/scent/`, checked by `scent/fidelity.json`.*

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

*Ported in chunk (e), Task 14 (its engine: Task 13; the dark shapes and the heart in the kit, Task 5): `src/ui/scene/instruments/breath/breath.ts`, checked by `breath/fidelity.json` and `kit/fidelity.json`.*

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

*Ported in chunk (e), Task 16 (its engine: Task 15; the spring step in the kit, Task 5): `src/ui/scene/instruments/weight/`, checked by `weight/fidelity.json`.*

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
