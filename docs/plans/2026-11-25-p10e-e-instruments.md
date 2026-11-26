# P10e Chunk (e): Mini-Game Instruments, Her Cards and the Posture Call — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Every mini-game of P15a and P16 gets the instrument the author approved in a live prototype, **ported exactly**: breathing, weight, scent, her activity with stillness and foot service, the jaw, shoe service, gulp, the slap and the posture call.
- The dock's cards speak in her hand and her voice, and a collapsed card shows her name, its kind and its gist.
- The game gets 48 hands.
- The physics card stays only as the fallback.

**Architecture:**
- **One new folder, `src/ui/scene/instruments/`.** It holds:
  - the host (`host.ts`: which instrument a run gets, mount, update, unmount, the fallback to the card);
  - the shared kit (`kit/`: her hand on the frame, springs, `chaikin`, quarter-resolution canvases, the heart, the dark shapes of breath that scent reuses, the digest);
  - one sub-folder per instrument (`breath/`, `weight/`, `scent/`, `activity/` with `stillness.ts` and `service.ts`, `jaw/`, `shoe/`, `gulp/`, `slap/`, `call/`).
  An instrument is a port of its prototype's functions, keeping their names (`render`, `SHAPES`, `openWindow`, …) so the review can read them side by side. It plays the engine's segment plan in real time and reports inputs through the staging controller.
- **The engine stays the authority.** State, events, directives and memory stay in the engine. Each game adds the inputs it needs as optional, additive fields and kinds of `SegmentInput`, resolved purely in `resolveSegment` (no rng). What the prototype does only for feel stays in the UI.
- **Her cards:**
  - a scene look built by `src/ui/scene/cards/sceneCard.ts`;
  - her voice read from a new registry, `cardVoice` (the approved `docs/content/card-voice.md` as data);
  - the dock draws the collapsed edges.
  The draw functions of P15/P16/P15a gain a `look: 'scene'` option; the PDA's thread and the DYNAMIC section keep their look.
- **Sound:** a sample layer (`src/ui/sound/samples.ts`) plays the recorded files the prototypes use, through the extension's `assetUrl`, beside the existing synthesiser.
- **Art:** an art-slot resolver (`src/ui/scene/art.ts`) gives an instrument a unit's picture for a slot and its sidecar, or `null` (then the instrument falls back to her sprite and the automatic zones, as the prototypes do). Chunk (f) builds the setup screen on it.

**Tech Stack:** TypeScript 5 (strict), esbuild, vitest (+ jsdom), Canvas 2D and WebAudio (no library), Playwright from the environment for the layout test and the side-by-side screenshots. No new dependencies in `package.json`.

**Spec:** `docs/packages/P10e-scene-stage.md` §15 (final, 2026-11-25) and §6. **The prototypes are normative:** `docs/prototypes/*.html` and `docs/prototypes/README.md` (each game's "Normative (port exactly)", "Prototype only" and "Open engine questions", which this plan decides below). The texts: `docs/content/card-voice.md` (approved). Read before Task 1:
- `docs/00-overview.md` §5.4;
- `docs/content/lore.md` §0;
- the **Implemented as** of P15a, P15, P16, P10b, P10c and P10e;
- `docs/packages/P3b-memory.md` (**Implemented as**) for the memory checks.

## Global Constraints

- **The prototype file is the source, not this plan (author, 2026-11-25).**
  - The implementer of an instrument task opens `docs/prototypes/<name>.html` and its README section first, and keeps both open for the whole task.
  - The code is **copied** from the file (JS to TS: add types, change nothing else) and then wired. It is never rewritten from the descriptions here.
  - Every number, curve, shape, colour, timing, SVG path and text quoted in this plan is a summary for orientation. **Where the plan and the file differ, the file wins**; report the difference in the commit message.
  - The fidelity tests of Task 6 enforce it: the listed functions must match the prototype token for token after types are stripped, and the listed tables and lines must be equal.
  - A difference the wiring forces (the engine's plan instead of the prototype's scheduler, the cue pool instead of `LINES`) is declared in the task's `fidelity.json` with its reason. An undeclared difference fails the test.
- **Port, don't redraw (author, 2026-11-24):** shapes, silhouettes, numbers, easings, timings, colours, sounds and her lines' behaviour come from the prototype's code. Adapt only the wiring. Where the extension cannot do a thing the same way, **stop and report**. Every instrument task ends with a side-by-side review: `scripts/instrument-shots.mjs` (Task 6) shoots the prototype and the port at the same settings.
- **No rng draw** in any new code. A chance is `fnv1a` of a stable key, or `practiceRoll` / `dynamicRoll` where the package already uses them. The one existing draw path a new input may reach is P15a's `cheatRoll` for a relief input (as today: only when the commander takes a relief). **A seeded test that moves stops and reports**: `tests/blocking/unaffected.test.ts`, `tests/dynamic/unaffected.test.ts`, `tests/practice/unaffected.test.ts`, `tests/warden/unaffected.test.ts`, `tests/life/unaffected.test.ts`, `tests/special/unaffected.test.ts`, `tests/engine/physics/*`. Never regenerate a golden.
- **Old inputs mean what they meant.** A `SegmentInput` without the new fields resolves exactly as today. The turn-based card and its tests do not change.
- **Instruments run in real time.**
  - An instrument is drawn only while `settings.physicsRealtime` is on and the physics' interaction toggle is on. Otherwise the physics card is drawn as today.
  - `DEFAULT_SETTINGS.physicsRealtime` becomes `true` (the SYS switch reads "Real-time contact" as today).
  - The engine's `DEFAULT_SCENE_SETTINGS.physicsRealtime` stays `false`, so a campaign that never mirrored it keeps resolving as before.
- **P15a / P16 / P15 rules hold:** the stop word always works (the pill, R6 of P10e); `blockingLive` gates the blocking; `herPracticeLive` / `practiceLive` gate her practices; read contacts, items, styles and entries by field and effect type, never by id; hidden values never reach a panel, a label, a line, a toast or a reading (`tests/fixtures/analyze/hidden.ts`); keep directive ids `physics:` / `practice:`-prefixed.
- **No pronoun for the commander** and no feeling of the commander in any text a player or the model reads. Her lines come from the cue pool (`physics.cues`, fallback `physicsCues`) or the `cardVoice` registry, never inline in code.
- **P7a:** every new chip, option, card, fan card, pill and instrument control carries `data-analyze` and resolves. New glossary ids are listed per task and go into `content/core/glossary.json` and `CORE_GLOSSARY_IDS`.
- **P10:**
  - Ask `motionReduced(settings)` / `visualFlags(settings)`, never `matchMedia`; every instrument has its reduced-motion form from its README section.
  - Readable mode (`#alius-shell.alius-readable`) turns off blur.
  - Nothing loads from the network (`tests/assets.test.ts`); every sound and font is a local file under the extension.
  - Every z-index stays below the analysis panel's 10.
- **Scene-keyed memory** (an instrument's running state, the slap's cheek, what the dock set aside) resets on a new scene id and on chat switch (`onStageReset`). Scene ids repeat across campaigns.
- **Memory check (CLAUDE.md):** each chunk states its verdict (below and in its tasks). Nothing remembered is added without a `memoryRules` entry and a resolver; a site that already writes a fact gets no rule.
- `npm test` rebuilds `dist/index.js` and `style.css`; commit them with each task. Run `npm run test:layout` after any change to the stage's CSS.
- **Stop at each chunk's boundary** (e1 … e12). Each chunk leaves the game runnable.

## Where the plan rules on the open engine questions (read before Task 1)

The README of each prototype ends with "Open engine questions (decide in the plan of chunk (e))". These are the decisions. **A1–A4 are tuning calls the author may overturn**; the plan proceeds with them.

**Common**
- **R1. One new input field.** `SegmentInput.amount?: number` (≥ 0; its meaning per kind is below). Absent = today's meaning.
- **R2. New input kinds** join `INPUT_KINDS` in the chunk that needs them: `strain` (e4), `uneven` (e5), `inhale` (e6), `bite` (e7), `wipe`, `spit` (e10), `swallow`, `spill` (e11), `relieve`, `fidget` (e8). Each is resolved purely and never draws.
- **R3. The plan grows by hash, not rng.** Any new per-beat plan field (her orders in the jaw, her flow in gulp) is planned by `fnv1a(<salt>|<runId>|<segment>|<beat>|<key>)`. The existing draws of `planSegment` keep their order and count.
- **R4. Her real-time silence.** In real time a style whose `cues` is `none` gets no cue on its openings (deterministic, no draw). Today `noCueShare` is applied only turn-based.
- **R5. The staging clock.** `PhysicsPanelStaging` gains `clock(): { startedAt: number | null; beatMs: number; now: number }`, so an instrument places the plan's beats in wall time.
- **R6. The dial dims while an instrument runs** (`.alius-stage-dial[data-instrument]`, opacity .35). The P10e "Implemented as" claimed this was ready; it was not.

**Cards and the call (e2)**
- **R7. Her voice is content.** `content/core/cardVoice.json` holds the approved tables as entries `{ id, kind, style?, lines: string[] }`, read by `kind` and `style`. The author edits the file; `docs/content/card-voice.md` remains the readable copy.
- **R8. The card's deadline words** are a new `cardWhen(deadline, today): string | null` in `src/ui/scene/cards/when.ts` (the WHENS of `cards.html`). `dueWords` stays for the PDA.
- **R9. The posture call's third outcome** (`posture_called` with `void`: right, but it cannot be taken now) writes her `right` line and leaves the dial as it is.

**Hands (e1)**
- **R10. All 48 hands go in.**
  - Each file is `fonts/hand-<kebab>-400.woff2`, with its licence in `fonts/LICENSES/hand-<kebab>.txt` (OFL, or Apache for six).
  - The registry entry is `{ id, name, family, scale, description }`. `scale` is measured once by `scripts/measure-hands.mjs`, with the rule of `cards.html`'s `measureHands`.
  - `handOf` keeps its rule (`unit.hand`, else `fnv1a(unitId) % n` in registry order) over the longer list: a unit with no chosen hand may get a new one once on an old save; a hand chosen in the dossier stays.

**The slap (e3)**
- **R11. The results change meaning:**
  - a press braces (on the impact) or burns its try (`none`);
  - only a turned face is `flinched`;
  - a turned face is also her offence `slap_defied` (stakes `minor`, through `noteOffence`, so her discipline remembers it as any offence).
- **R12. The swing:**
  - `windowMs` is the swing's length;
  - the brace band is 42–224 ms before the impact for every style;
  - `leadMs` and `feintMs` stay;
  - unannounced has no raised hand, and cruel's `again` raises it for 420 ms;
  - her hand's side is `fnv1a(slapId) % 2`, carried in `slap_dealt.side`.
- **R13. Her face** is the table of the README as `TUNING.practice.slap.faces[style] = { before, keep, after: { none, braced, flinched } }`; the instrument sets the sprite through the scene's `setSprite`. Her slap lines (`before`, `feint`, `again`, `after`) are `cardVoice` entries of kind `slap.*`, with the prototype's texts.

**Breath (e4)**
- **R14. The held credit.** A `breathe` input carries `amount` = the share of the opening held (0–1): credit `caught × amount`; a window caps at `caught`.
- **R15. Over-holding.** A `strain` input on beat b means held past 150 ms or pressed before the opening. That beat drains twice. With `amount ≥ 1` (450 ms, she noticed), the streak resets and her next opening after b moves later by `overDelay` beats: cruel 2, affectionate 0, others 1. Resolved in `resolveSegment`, pure.
- **A1.** With the engine's numbers even perfect play loses air (her release at the limit after about ten windows): kept as rising tension by design.

**Weight (e5)**
- **R16. Uneven holding.** An `uneven` input per beat with `amount` = the mean extra drain factor of the beat (`1.2·max(0, |err| − tol/2)`), resolved as `−drain × amount`.
- **R17. The level** stays a UI judgement: `hold` is sent only on a beat held and level. The telegraph's lead per style is the instrument's table (`STYLES[].tele`); the engine plans the shift beat only.
- **A2.** About 20 s of strength without the commander's own shifts is kept by design: resting under her attention is the game.

**Scent (e6)**
- **R18. The head is the gauge.** An `inhale` input with `amount` = the words left in the head. One word is `100 / capacity`, with capacity `6 + tolerance/12`, as the prototype computes it. A `mouth_breath` with `amount` = the words blown out. When a segment holds any `inhale`, its per-beat passive fill is replaced by them.
- **R19. The band.** `resolveEnvOf` reads her real band (`scentBand`) instead of the hard-coded `'noticeable'`.
- **R20. Her question.** A new action `physics/answer { runId, right: boolean, lie: boolean, caught: boolean }` emits `scent_answer`. **Memory:** a lie she caught is remembered (`memoryRules` `scent_lie_caught`: audience her, importance 2, no spread). The rest is bookkeeping.

**The jaw (e7)**
- **R21. The cost of the opening.** A `bite` input with `amount` = the beat's mean cost factor (⅓ resting on her toes or the ring, more higher, most wide open). When present, the flat `jaw.per` per beat is replaced by `per × amount`.
- **R22. Her orders.** Her orders `deeper`, `suck` and `wider` and her pulling back are new cue kinds, planned per beat by hash (R3) for the gesture interaction. The teeth are a `bite` with `part: 'teeth'`: a slip. No memory: a slip is bookkeeping.
- **R23. Speech through the opening is UI.** The line sent is the heard one; the share of clear letters goes into the digest only. `TUNING.physics.jawRestMs` = the prototype's `REST_MS`.

**Her activity, stillness and foot service (e8, e9)**
- **R24. The frame starts from the blocking.** `her_activity` starts when two things hold:
  - her blocking activity has a `frame` (the twelve of the prototype's `ACTS`, ported as data onto `blockingActivities`: `reading_book`, `reading_reports`, `writing_report`, `on_comms`, `chatting_on_pda`, `playing_cards`, `sleeping`, `music`, `cleaning_weapon`, `mending_clothes`, `drinking`, `sketching`). Read by field. This covers the spec's `elsewhere` / `none` and the prototype's `divided` ones;
  - the commander is placed by her (an anchor or contact of hers, or a posture set by her).
  It starts with or without a contact, with `sourceKind: 'activity'` and a marathon duration from her activity's hours, `'unknown'` without them. Nothing else starts a marathon.
- **R25. Her presence** is a derived reader, `presenceOf(state, reg, run): 'with' | 'glancing' | 'own' | 'use'`. Its terms are the README's: attention, talkativeness, style, hold band, mood and `dynamicHash`. It reads Regard as a tone term (P15 confines Regard to tone and aftermaths; presence is tone). It is never stored, never shown as a word or a number, and never read by a prompt.
- **R26. The script** is a new call type, `activity_script`, at site `physics.script` (one call per phase boundary, through `app.generations`; record `quiet`).
  - Its input is built through `Knowledge`.
  - Its output is validated to the README's shape (`{ at, who, to, text, covers, ask?, mention? }`).
  - A mention of the commander is checked by the engine against the listener's knowledge and the relation's publicity.
  - Without the call (failure, no profile) her placeholder lines from the cue pool play.
- **R27. The body game inside** is the run's `second` physics (weight) or stillness (no second physics: the frame's own inputs `relieve`, `fidget` with `amount` = loudness).
  - The noise is `loudness × her ears × (1 − cover)`, beside P15a's `noiseOf`.
  - Foot service and shoe service end with her verdict through P16's `rateService(draft, ctx, holderId, verdict, 'engine', sceneId)` (one a scene, as today), from a new action `physics/service { runId, verdict: 'pleased' | 'adequate' | 'displeased' }`. The verdict comes from the crafts' quality, by the prototype's rule. **Memory:** none new; `service_rated` already lands as P16 decided.
  - Her foot signals are picked per holder by `fnv1a` from `TUNING.physics.footSignals` (4–6 pairs); their mastery is P16b's.
- **R28. The digest (author's rule for every instrument).**
  - The engine keeps `run.tally: Record<string, number>`, counted in `physicsInput` from what each segment resolved: caught, missed, strains, slips, spills, bites, wipes, reliefs, fidgets, caught cheats.
  - On `physics_outcome` the existing `physics:end` directive gains one sentence built from the tally. The templates are directive text per physics in `src/blocking/physicsDirectives.ts`, model-facing, with no pronoun for the commander.
  - It carries only what she perceived: an uncaught cheat is never in it.
  - The instrument's own summary is UI only.
  - **Memory:** a caught cheat is already `physics_caught`; a buckle is `physics_slip`, bookkeeping.
  - Her activity adds two events. `forgotten_end` (she left the commander posed and forgot) is a fact for her, importance 2. `found_posed` (someone came in and found the commander posed) has audience the finder, spread `squad_rumor`, importance 3, `hiddenFromCommander: false`. Each gets a `memoryRules` entry and a resolver (Task 23).

**Shoe service (e10)**
- **R29. The zones are the parts.** A `wipe` input carries `part` (a zone) and `amount` (the share of the dirt mask wiped). When present, the gauge follows the mask (`100 × left`) instead of right/wrong. Shine is UI and goes into the digest. The inspection is the engine's check at ≤ 10.
- **R30. Her footwear and the dirt of her day are derived readers.**
  - `footwearOf(state, reg, unitId)` is `boots` unless her tastes name heels.
  - `dirtOfDay(state, reg, unitId)` follows her last run's region today (`regions[].dirt`: ash, oil, spores, mud), else the training yard (dust), else rain on a wet day, else dust.
- **R31. Spitting.** A `spit` input is a relief (P15a's `cheatRoll` decides if she saw it). If she saw it, it is `physics_caught` (remembered as today).

**Gulp (e11)**
- **R32. Her flow is planned.** `PlannedBeat.flow?: { level: number; surge?: true; warn?: true; pause?: true }` is planned by hash (R3) from the README's style table. The instrument plays it.
  - A `swallow` input carries `amount` = the mouth taken.
  - A `spill` input carries `amount` = mouthfuls spilled. A spill is a slip, and the chain to `tongue_work` starts at `dirt = clamp(100 × spilled)` (the chain's `start` becomes a function of the slip).
- **A3.** No contact starts `gulp` (P17b's watersports contacts). The instrument ships and is reached through `physics/start` and the chain as today.
- **A4.** The air, the reflex and the cough of gulp are UI. A cough is reported as `spill`.

## Review Focus

- **The stop word during any instrument:** the pill stays reachable and ends the run at once (`physics/stop_word`), with the frame restored (dim, blur, tilt, tunnel, the input's width and letters). Task 5 pins it for the host; each instrument task's unmount test repeats it.
- **A chat switch or a scene end in the middle of an instrument, a call or a slap:** nothing keeps running (timers, `requestAnimationFrame`, audio nodes, document listeners); no late input or late slip is dispatched into the new chat. Task 5 (host), Task 9 (call) and Task 12 (slap) pin it.
- **Typing while an instrument runs:** Space and Shift typed into the input never breathe, swallow or bear her. Only the mouse acts while the field has focus (breath's rule), and the line keeps its spaces. Each instrument task's key test pins it.
- **A sprite or art slot that is missing or fails to load:** the instrument falls back as its README says (her sprite, the automatic zones, the ceiling or floor art, the ASCII stage), never an error or a blank frame. Task 4 and each instrument task's fallback test pin it.
- **Reduced motion and readable mode:** every instrument has its still form (no shake, no blur, no write-on), and the call and the slap still resolve (the slap lands at once as `none`, R12). Each instrument task pins it.

---

## Chunk e1: foundations

**Memory check (e1):** nothing remembered. Fonts, sounds, art lookup, the host and a CSS fix add no event, decision or state the squad could remember.

### Task 1: The sample sound layer and the sound files

**Files:**
- Create: `src/ui/sound/samples.ts`, `assets/sounds/` (copied from `docs/prototypes/assets/`: `breath-in-out.mp3`, `ha/*.ogg` the instruments use, `slap/slap.ogg`, `slap/swish1.ogg`, `gulp/*.ogg`), `assets/sounds/LICENSES.md` (the rows of `docs/prototypes/assets/LICENSES.md` for the files copied)
- Modify: `src/app.ts` (create one `SampleSound` beside `createSound`, hand it to the scene screen), `src/ui/scene/sceneScreen.ts` (`SceneScreenCtx.samples?`), `tests/assets.test.ts`
- Test: `tests/ui/sound/samples.test.ts`

**Interfaces:**
- Produces:
  - `interface SampleSound` (as built; `src/ui/sound/samples.ts`):
    - `play(file, opts?: { gain?: number (default 0.5); pan?: number; rate?: number; at?: number; offset?: number; duration?: number; bus?: 'world' | 'body' (default world) }): void`: the slap's `play` (a `duration` fades over its last 30 ms). Muted, before a gesture or when the file failed: nothing.
    - `loop(file, opts?): { setGain(g, ms?): void; setRate(r, ms?): void; stop(ms?): void }`: muted, it still runs silent through the master (unmuting makes it heard); before the first gesture or when the file failed the handle is inert.
    - `preload(files: string[]): Promise<void>`: the prototypes' `loadSamples` (each file fetched and decoded once; never throws).
    - `buffer(file): AudioBuffer | null`: the prototypes' `A.buf[key]` (null before the decode or after a failure).
    - `ctx(): AudioContext | null`, `bus(name: 'world' | 'body'): AudioNode | null` (made on demand after the first user gesture; null after dispose).
    - `setWorldDull(f: number): void` (0 clear … 1 the prototypes' fully dull world: lowpass `16000·(380/16000)^f`, smoothed `setTargetAtTime(…, now, 0.15)` as breath.html).
    - `setNight(on)`, `setMuffle(on)`, `setSensory(on)`: the gains of `createSound` (`NIGHT_GAIN`, `MUFFLE_GAIN`, `TUNING.practice.hold.sensoryVolume`); the app forwards the shell's night and sensory switches and `syncSound`'s muffle.
    - `dispose(): void` (stops loops, closes only a context it made).
  - The graph: master gain (the player's level: volume, mute, night, muffle, sensory) → destination; world bus = lowpass (Q 0.4) → master; body bus = gain → master, never dull. The level is on the master, so a sound an instrument synthesises into a bus follows it.
  - **Ruling (review of Task 1):** each instrument ports its own `play` / `chain` from its prototype onto `ctx()` + `bus()` + `buffer()` (after `preload` of its palette); the layer's own `play` is the slap's.
  - `createSamples(deps: { settings: () => AliusSettings; assetUrl: (p: string) => string; audio?: () => SampleContextLike }): SampleSound` (`SampleContextLike` = `AudioContextLike` with `createBiquadFilter`, `createStereoPanner` and a buffer source with `playbackRate` / `loop` / `stop` / `start(when, offset, duration)`). Failed files are not asked for again for `FAILED_RETRY_MS` (30 s).
  - Files are named from the repo root: `'assets/sounds/ha/soft1.ogg'`.

- [x] **Step 1: Write the failing tests:**
  - `a sample plays through assetUrl with the master gain`: a fake context, `soundVolume` 50, `play('assets/sounds/ha/soft1.ogg', { gain: .3 })`. Expect one fetch of `assetUrl('assets/sounds/ha/soft1.ogg')` and a gain node at `.3 × .5`.
  - `muted plays nothing`: with `soundMuted` on, no source is started.
  - `a buffer is decoded once`: two plays of the same file make one fetch.
  - `a failed fetch is silent`: a rejected fetch gives no throw and no retry within 30 s.
  - `night and muffle apply`: the night and muffle gains of `createSound` multiply in (same constants).
  - `dispose stops loops and closes nothing it did not open`.
  - `tests/assets.test.ts`: every file under `assets/sounds/` is named in `assets/sounds/LICENSES.md`; no file is over 400 KB; no `http` url in `src/ui/sound/`.
- [x] **Step 2: Run** `npx vitest run tests/ui/sound/samples.test.ts tests/assets.test.ts` → FAIL.
- [x] **Step 3: Implement** `createSamples` with the context created on the first user gesture, as `createSound` does. Use the two buses of the prototypes: the world bus through the `setWorldDull` lowpass, the body bus never dull. Copy only the files some prototype's normative section names.
- [x] **Step 4: Run** the tests, `npx tsc --noEmit`, `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P10e-e): the sample sound layer and the instruments' recorded sounds`

### Task 2: The 48 hands

**Files:**
- Create: `fonts/hand-<kebab>-400.woff2` and `fonts/LICENSES/hand-<kebab>.txt` for the 42 new hands (from `docs/prototypes/assets/hands/`), `scripts/measure-hands.mjs`
- Modify: `content/core/handFonts.json` (42 entries, each `{ id, name, family, scale, description }`; the six old ones gain `scale`), `src/content/schemas.ts` (`HandFontSchema.scale: z.number().min(0.6).max(1.7)`, required), `css/01-fonts.css` (42 `@font-face` in the existing pattern), `src/engine/hand.ts` (`handScale(hand): number`), `src/ui/notes/note.ts` (`setHand` also sets `--alius-hand-scale`), `tests/assets.test.ts`
- Delete: `docs/prototypes/assets/hands/` after the move. `cards.html`'s `@font-face` urls then point at `fonts/hand-*.woff2`; check that `npm run proto -- cards` still builds.
- Test: `tests/engine/hand.test.ts`, `tests/assets.test.ts`

**Interfaces:**
- Produces:
  - `handScale(hand: Entry | null): number` (1 for null)
  - `--alius-hand-scale` on any element `setHand` styles
  - the registry order: the six old hands first in their old order, then the six strict print hands, then the rest alphabetically. **Ruling R10:** a unit with no chosen hand may get a new one once.

- [x] **Step 1: Write the failing tests:**
  - `tests/assets.test.ts`:
    - `HANDS` is read from `content/core/handFonts.json` (48), not a literal;
    - each licence contains `SIL Open Font License` or `Apache License`;
    - each woff2 is under 120 KB (all are);
    - the face count is ≥ 13 + 42.
  - `handScale`: Caveat is 1; every entry's scale is in [0.6, 1.7]; Just Another Hand's scale is > 1 (narrow); Rock Salt's is < 1 (wide); Amatic SC's is 0.83 (amended in Task 2: the prototype's `measureHands` gives Amatic SC 0.83, its small capitals are tall; the file wins).
  - `handOf` still prefers `unit.hand`; with none it is `fnv1a(unitId) % 48` in registry order.
- [x] **Step 2: Run** them → FAIL.
- [x] **Step 3: Measure and move:**
  - `scripts/measure-hands.mjs` loads each face in Chromium and computes `measureHands` of `cards.html` (the geometric mean of Caveat's x-height of `xvzow` over the hand's and Caveat's width of `Bring me the patrol roster before evening mess.` over the hand's, clamped to 0.7–1.6, rounded to 0.01). It writes `scale` into the registry.
  - Descriptions are one line each, written plainly (e.g. Klee One: `a neat, upright pen, every letter separate.`), never "AUTHOR TO WRITE".
- [x] **Step 4: Run** the tests, `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P10e-e): 48 hands with a measured size`

### Task 3: Her voice as data (`cardVoice`) and the card's deadline words

**Files:**
- Create: `content/core/cardVoice.json`, `src/ui/scene/cards/voice.ts`, `src/ui/scene/cards/when.ts`
- Modify: `src/content/schemas.ts` (`CardVoiceSchema`, registry `cardVoice`), `src/content/types.ts` (reserved names)
- Test: `tests/ui/cards/voice.test.ts`, `tests/content/cardVoice.test.ts`

**Interfaces:**
- Produces:
  - `type VoiceKind` = the kinds of card-voice.md §1, §2, §5:
    - `'when' | 'cost' | 'costHold' | 'lapse' | 'lapseHidden' | 'free' | 'who' | 'onlyMe'`
    - `'proof.in_person' | 'proof.witness' | 'proof.report'`
    - `'weight' | 'noLength' | 'sayIt' | 'closes' | 'hands' | 'talked' | 'sealed' | 'sealedTrack'`
    - `'demoWho' | 'demoWhoMore' | 'demoNone' | 'demoWhere' | 'demoAgain' | 'order'`
    - `'cerTitle' | 'cerWords' | 'cerPosture' | 'cerNumber' | 'moment' | 'exposing'`
    - `'call.right' | 'call.wrong' | 'call.slow'`
    - `'static.milestone.<id>' | 'static.claim.<domainId>' | 'static.claim.submit' | 'static.return.<terms>' | 'grants'`
    - `'slap.before' | 'slap.feint' | 'slap.again' | 'slap.after.none' | 'slap.after.braced' | 'slap.after.flinched'` (Task 11 fills these)
  - `interface VoiceRun { text: string; value?: true }`
  - `voiceLine(reg: Registries, kind: VoiceKind, style: string | undefined, key: string, vals: Record<string, string>): VoiceRun[]` — her style's lines when the registry has `{kind, style}`, else `{kind}` with no style; the line is `fnv1a(\`${key}|${style ?? 'neutral'}|${kind}\`) % n`. `{x}` is the value as it is and `{X}` capitalised; each value is a run with `value: true`.
  - `cardWhen(deadline: { day: number; slot?: Slot } | undefined, today: number): string | null` — the WHENS of `cards.html`.

- [x] **Step 1: Write the failing tests:**
  - `cardVoice holds every line of card-voice.md`: a parser over `docs/content/card-voice.md` (backticked lines under each heading) equals the registry's lines, kind by kind and style by style.
  - `her style first, neutral otherwise`: `voiceLine(reg, 'when', 'cold', 'c1', { when: 'this evening' })` is one of cold's three; `voiceLine(reg, 'sayIt', 'cold', …)` is a neutral line.
  - `the same key gives the same line`, and `two keys spread`: over 30 keys every line of a three-line kind appears.
  - `capitalised at a sentence's start`: `{When}. Not later.` with `this evening` → runs `[{text:'This evening', value:true}, {text:'. Not later.'}]`.
  - `no frame breaks with a value`: every `when` line × every WHEN word has no `by in` / `until in`; every `cost` line with `one slot` has no ` them`.
  - `cardWhen`:
    - (day 20, today 20, `evening`) → `this evening`;
    - (21, 20, `night`) → `tomorrow night`;
    - (22, 20, `morning`) → `in two days, in the morning`;
    - (30, 20) → `in a few days`;
    - past → `today`.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement** the schema, the JSON (§1–§5 of card-voice.md; §3's static words as `static.*`; §5 as `call.*`) and the two readers.
- [x] **Step 4: Run**, `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P10e-e): her voice on the cards as data`

### Task 4: Art slots and sidecars

**Files:**
- Create: `src/ui/scene/art.ts`
- Modify: `src/app.ts` (load `content/local/art/art.json` if it exists, as the other local files; absent = none), `.gitignore` already ignores `content/local/`
- Test: `tests/ui/scene/art.test.ts`

**Interfaces:**
- Produces:
  - `type ArtSlotId = 'over' | 'over_explicit' | 'face_close' | 'legs_seated.rest' | 'legs_seated.foot_raised' | 'legs_astride' | 'sole_close' | 'feet_floor' | 'shoe_close.boots' | 'shoe_close.heels' | 'shoe_sole.boots' | 'shoe_sole.heels'`
  - `interface ArtSidecar { fit?: Record<string, number>; zones?: Record<string, number[]> | { right: Record<string, number[]>; left: Record<string, number[]> }; feet?: 'one' | 'pair' | 'two'; shown?: 'left' | 'right'; face?: { x: number; y: number } }` (`legs_astride` with `feet: 'pair'` has two files: `legs_astride.left` and `legs_astride.right`)
  - `interface ArtSlots { get(unitId: string, slot: ArtSlotId): { url: string; sidecar: ArtSidecar } | null }`
  - `createArtSlots(manifest: unknown, assetUrl: (p: string) => string, unitKey: (unitId: string) => string | null): ArtSlots`
  - The manifest: `{ [unitKey]: { [slot]: { file: string; sidecar?: ArtSidecar } } }`, where `unitKey` is the unit's card avatar file name (stable across campaigns).
  - `over_explicit` is returned only when `explicit_scenes` is on; the caller passes the gate.
  - *As built:* the caller passes the gate as `get(unitId, slot, { explicit })` (absent = off), computed by `explicitArtAllowed(state, reg, unitId)` (`explicit_scenes` on and not among her own limits). `ART_SLOT_IDS` lists the slots. The manifest may also hold `legs_astride.left` / `legs_astride.right`; with both (and `legs_astride` absent or `feet: 'pair'`) `get(…, 'legs_astride')` answers `{ url: <left>, sidecar: { …, feet: 'pair' }, pair: { left, right } }`. Consumers branch on `pair`, not on `feet`. Her scene sprite's face point (slap README; weight's `S.face`) sits in a sidecar-only per-unit key `sprite: { sidecar: { face: { x, y } } }` (no file), read by `ArtSlots.face(unitId)` (null = the prototype's default). A file must be a relative path under `content/local/art/` (no scheme, root, `..` or `%`). Loaded through `AppDeps.loadArt` (`src/index.ts` fetches `content/local/art/art.json` through `loadArtManifest`: missing = none, silently; broken = none, with one warning); the app holds `art` for the instrument host (Task 5). The prototypes' extra keys (`slot`, `kind`, `states`, `floorShade`) are dropped: chunk (f) writes `floorShade` into the `fit` of `legs_seated.rest`, and `legs_seated`'s `states` become the two slots.

- [x] **Step 1: Write the failing tests:** `an absent manifest gives null for every slot`; `a slot resolves to assetUrl('content/local/art/<file>') with its sidecar`; `a malformed entry is skipped, not thrown` (zod, logged once); `over_explicit needs the explicit gate`.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run**, `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P10e-e): art slots with sidecars (empty until chunk f)`

### Task 5: The instrument host and the shared kit

**Files:**
- Create:
  - `src/ui/scene/instruments/types.ts`, `host.ts`
  - `kit/hand.ts` (`say`, `placeFree`: her lines on the frame from `her_activity.html`)
  - `kit/spring.ts` (`stepSpring` in pieces of at most 8 ms, from `weight.html`)
  - `kit/chaikin.ts`, `kit/lowres.ts` (canvases at `1/DS`, `DS = 4`)
  - `kit/heart.ts` (`heartTick`, the lub-dub on the body bus)
  - `kit/dark.ts` (`SHAPES`, `SEAT_BODY`, `squashOf`, `blob` from `breath.html`; the `seat_x_*` variants are not ported)
  - `kit/digest.ts`
  - `css/63-instruments.css`
- Modify:
  - `src/ui/scene/sceneScreen.ts` (`drawPhysics`: an instrument for the run, else the card; mount in the `pose`, `effects` and `moment` layers; the stop pill unchanged)
  - `src/blocking/controller.ts` (`clock()`, R5)
  - `src/ui/scene/physicsPanel.ts` (`PhysicsPanelStaging.clock`)
  - `src/settings.ts` (`physicsRealtime` default `true`)
  - `css/62-stage.css` (R6: `.alius-stage-dial[data-instrument]`)
  - `src/ui/scene/stage/index.ts` (`onStageReset` → `unmountInstruments()`)
  - `content/core/glossary.json` (`instrument`)
- Test: `tests/ui/instruments/host.test.ts`, `tests/ui/instruments/kit.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  - `interface HerLook { unitId: string; name: string; accent: string; hand: string; handScale: number; style: string }`
  - `interface InstrumentEnv`:
    - `root: HTMLElement`
    - `layers: { pose: HTMLElement; effects: HTMLElement; moment: HTMLElement; frame: HTMLElement; backdrop: HTMLElement; sprites: HTMLElement }`
    - `input: HTMLElement`, `reply: HTMLElement`, `gauge: InputGauge` (P10e's input-frame surface, `stage/gauge.ts`: `narrow`, `tremble`, `pulse`, `window`, `clear`)
    - `spriteOf(unitId: string): HTMLImageElement | null`
    - `setSprite(unitId: string, label: string): void`
    - `state(): CampaignState`, `registries: Registries`, `settings(): AliusSettings`
    - `staging: PhysicsPanelStaging`
    - `samples: SampleSound | null`
    - `art: ArtSlots`
    - `her(unitId: string): HerLook`
    - `now(): number`, `raf(fn: FrameRequestCallback): number`, `cancelRaf(id: number): void`
    - `reduced: boolean`, `readable: boolean`
  - `interface InstrumentRun { update(run: PhysicsRun): void; stop(): void }`
  - `interface InstrumentDef { id: string; matches(run: PhysicsRun, state: CampaignState, reg: Registries): boolean; start(env: InstrumentEnv, run: PhysicsRun): InstrumentRun }`
- Produces (`host.ts`):
  - `registerInstrument(def: InstrumentDef): void` (the first match wins; order of registration)
  - `instrumentFor(run, state, reg, settings): InstrumentDef | null` (null unless `physicsRealtime` and the interaction toggle are on)
  - `syncInstruments(env: InstrumentEnv, run: PhysicsRun | undefined): boolean` (true when an instrument is drawing: no card)
  - `unmountInstruments(): void`
- Produces (`kit/`):
  - `say(host: HTMLElement, text: string, opts: { her: HerLook; at?: [number, number]; size?: number; tilt?: boolean; ms?: number; side?: 'left' | 'right' }): HTMLElement` — the stepped write-on of the prototypes, at the size × `handScale`
  - `stepSpring(s: { x: number; v: number }, target: number, k: number, d: number, dtMs: number): void`
  - `chaikin(points: Array<[number, number]>, times: number): Array<[number, number]>`
  - `lowres(host: HTMLElement, ds?: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; resize(): void }`
  - `heartTick(samples: SampleSound, bpm: number): void`
  - `SHAPES` (with the type `Shape`), `SEAT_BODY`, `squashOf`
  - `interface Digest { physicsId: string; hers: string[]; mine: string[]; ended: string }`
  - *As built:* `chaikin(pts)` is the prototype's one pass (its signature kept, as the fidelity rule asks); three passes are `chaikin(chaikin(chaikin(pts)))` as the prototypes call it. `say(host, text, opts)` returns the group of its lines (`.alius-her-lines`), `unsay(host)` clears every line and timer it left; `placeFree(host, el, x, y)` takes the host first (the frame is the host's box, not the window). `heartTick(samples, bpm, air = 100)` takes the air for the loudness (the prototype reads `G.air`); `heartLastBeat(samples)` and `heartStop(samples)` beside it. `kit/dark.ts` exports the prototype's `S` (`angle`, `side`) that the shapes read; `kit/math.ts` holds `clamp`, `lerp`, `smooth`. The kit's `fidelity.json` adds a per-entry `prototype` (weight, her_activity) to the format of Task 6, and declares `stepSpring` (inline in weight.html's frame loop, no function of its own) as a difference. The host gives each mount its own `raf` (cancelled at the stop) and `staging` (dead after the stop, the stop word included); the mark `.alius-instrument[data-analyze="glossary:instrument"]` is in the moment layer while one runs. `SceneScreenCtx` gains `art?` (the app passes a read-through of its `art`) and `frames?` (a fake frame clock for tests). R6 dims `.alius-dial-host` inside `.alius-stage-dial[data-instrument]`, so the stop word's pill keeps its full strength. `tests/ui/physicsPanel.test.ts` pins `physicsRealtime: false` in its settings fixture (ruling A). *e1 chunk fixes:* a one-time settings migration (`physicsRealtimeDefaultMigrated`, a flag of the stored settings, not a setting) turns a stored `physicsRealtime: false` (the old default, written back by the default-merge) to true once; a later choice of false stays. `instrumentFor` needs the global setting and the campaign's mirror. A run that ends plays its end through `InstrumentRun.finish?(end): number` (the outcome from the staging controller's `outcome(runId)`, asked a microtask after the redraw; staging dead meanwhile); a run stopped by the stop word, a new run, a scene end, a chat switch, a reset and dispose unmount at once. Each mount's env view records `samples` (loops, sources made on `ctx()`, the world's dullness), `timeout` and `listen`, and the host puts back the `style` and `data-*` of the root and the layers as they were at the mount (the scene's own keys excepted: `--alius-pan`, `stage`, `backdrop`, `light`, `curtain`, the backdrop's image, the sprites' `count` / `crowd`); it clears only the hosts its `env.say` wrote to (an instrument writes her lines through `env.say`, never the kit's `say` directly) and stops only its own heart; a source that ended is forgotten at once; the input field's own `style` and `data-*` are put back too. Her lines in readable mode are in the type font with no write-on. The mark is a plain `data-instrument` flag (no `data-analyze`); `glossary:instrument` is reached through `stop_word`, `posture_dial` and `contact_physics`. Instruments re-query `spriteOf` every frame and move `layers.sprites`, never the `<img>`.

- [x] **Step 1: Write the failing tests:**
  - `no instrument, the card as today`: with no definition registered, `drawPhysics` draws `.alius-physics` (today's DOM, unchanged).
  - `turn-based draws the card`: with a test definition that matches, and `physicsRealtime` false or the run's interaction toggled off, the card is drawn and `start` is never called.
  - `real time mounts once per run`: `start` is called once for `run.id`; a redraw calls `update`; a new run id stops the old one; no run → `stop`.
  - `the stop pill stays`: `.alius-stop-pill[data-stop-word]` exists while the instrument runs, and its click dispatches `physics/stop_word`.
  - `stage reset and dispose stop it`: `resetSceneStage()` and `screen.dispose()` call `stop`. After them, no `raf` callback runs and no `staging.input` is called (fake clock).
  - `the dial dims`: `.alius-stage-dial` has `data-instrument` while one runs, and loses it after.
  - `clock()`: it returns `startedAt`, `beatMs` 1500 and `now` from the controller's clock.
  - Kit:
    - `stepSpring` with a 100 ms step stays bounded (k 260, d 16; the weight fix of 2026-11-23);
    - `chaikin` ×1 of a square has 8 points;
    - `say` writes in `--hand` × `handScale`, never uses `innerHTML` for the text, and is gone after its life.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement:**
  - `InstrumentEnv` is built once in `build()`. `her()` reads `handOf` / `handScale` / `unitAccent` / `physicsStyleOf(...).primary`.
  - The kit is copied, not rewritten: `src/ui/scene/instruments/kit/fidelity.json` lists `SHAPES`, `SEAT_BODY`, `squashOf`, `blob` (breath.html), `chaikin`, the spring step (weight.html), `say` and `placeFree` (her_activity.html), `heartTick` (breath.html). Task 6's fidelity test checks them once it exists; until then the reviewer diffs them by hand.
  - A definition is registered by importing `src/ui/scene/instruments/index.ts`, which imports each instrument module. Chunks e3–e11 add one line each.
  - `glossary:instrument` ("A mini-game of the body: it plays her rhythm; the stop word always ends it.") marks the instrument's root.
- [x] **Step 4: Run** the tests, `npm test`, `npm run test:layout` → PASS.
- [x] **Step 5: Commit** `feat(P10e-e): the instrument host, its kit, the staging clock, the dial dims`

### Task 6: The dial's circle stays put; the side-by-side shots

**Files:**
- Modify: `src/ui/scene/dial/dial.ts`, `css/62-stage.css` (`.alius-dial-label` absolute under the face, 240 px, wraps; her name over the base name as in `cards.html`'s `drawDial`, the EYES line under them when relevant), `scripts/layout-test.mjs` (a fixture with a wide label)
- Create: `tests/helpers/protoFidelity.ts`, `tests/ui/instruments/fidelity.test.ts`, `scripts/instrument-shots.mjs`; `package.json` gains `"shots": "node scripts/instrument-shots.mjs"` (not part of `npm test`)
- Test: `tests/ui/dial/dial.test.ts`

**Interfaces:**
- Produces:
  - **The fidelity helpers** (`tests/helpers/protoFidelity.ts`):
    - `protoSource(name: string): string` — the `<script>` of `docs/prototypes/<name>.html`
    - `protoFunction(name: string, fn: string): string` — the source of one top-level function or `const fn = (…) =>` of the prototype, found by a small parser over the script (balanced braces, strings, template literals and comments skipped)
    - `portFunction(modulePath: string, fn: string): string` — the same function of the port, its types stripped by esbuild's `transform` (`loader: 'ts'`)
    - `normalize(src: string): string` — whitespace, semicolons, trailing commas and `const` / `let` / `var` unified, comments dropped; **identifiers are not renamed**
    - `protoValue(name: string, ident: string): unknown` — a top-level `const` table of the prototype, evaluated in a sandbox (`new Function` over the declaration alone: `STYLES`, `SHAPES` data, `SEAT_BODY`, `ACTS`, `EXPR`, `LINES`, `COLORS`, `SCENT`, …)
  - **The fidelity test** (`tests/ui/instruments/fidelity.test.ts`) reads `src/ui/scene/instruments/<name>/fidelity.json`: `{ prototype: string; functions: Array<{ fn: string; module: string; as?: string }>; tables: Array<{ ident: string; module: string; export: string }>; lines?: Array<{ ident: string; cueKinds: Record<string, string> }>; differences: Array<{ fn: string; reason: string; diff: string }> }`.
    - For every function, `normalize(protoFunction)` equals `normalize(portFunction)`, except the hunks listed in `differences` (each a unified diff of the normalized sources, with its reason).
    - For every table, `protoValue` deep-equals the port's export.
    - For every `lines` entry, the prototype's `LINES[kind]` equal the `physicsCues` (or `cardVoice`) rows the port reads.
  - **The shots:** `npm run shots -- <name> [--state <fixture>]`. It builds the prototype (`npm run proto`) and the layout page with the same fixture, drives both to the named moments listed in the instrument task, and writes `.superpowers/shots/<name>/{proto,port}-<moment>.png` side by side.
  - *As built:*
    - **The format of `fidelity.json`** (`FidelitySpec` in `tests/helpers/protoFidelity.ts`): `{ prototype; note?; functions: Array<{ fn; module; as?; prototype?; fragment?: { from; to } }>; tables: Array<{ ident; module; export; prototype?; deps?: string[] }>; lines?: Array<{ ident; prototype?; registry?: 'physicsCues' | 'cardVoice'; physics?; cueKinds: Record<path, target> }>; differences: Array<{ fn; reason; diff }> }`.
      - An entry's own `prototype` reads that file instead of the spec's (the kit spans breath, weight and her_activity).
      - A `const` whose value is an object of methods (`SHAPES`) is a **function** entry: the whole declaration is compared, one statement a line, so each method's lines show in the diff (a dropped method is a `-` hunk).
      - A `fragment` compares the prototype's inline code (from the line holding `from` through the line holding `to`, then on until the braces it opened close) with the port's function `fn` (`stepSpring`: weight.html's frame loop).
      - `as` names the port's function when it differs; only its declared name is read as `fn` (a recursive call still shows).
      - `tables[].deps` are declarations the table needs to evaluate (`HANDS` needs `GAME_HANDS`, `STRICT`, `CANDIDATES`); `protoValue(name, ident, deps?)`. A table is compared by value, numbers exactly (NaN and ±Infinity included); a table that holds a function, on either side, fails with a message to list it under `functions` (JSON would drop the function: an empty `SFX` would pass).
      - `lines`: each dotted `path` into the prototype's table `ident` equals the lines of one registry row: `physicsCues` (default; the row of kind `target`, and of `physics` when given; exactly one) or `cardVoice` (`target` = `kind` or `kind@style`; exactly one row too). Lines and tables have no declared differences: they are equal or the test fails.
      - `differences`: hunks of a unified diff (one line of context, `@@ -a,b +c,d @@` headers) of the normalized prototype (`-`) against the normalized port (`+`). Several entries may share an `fn` (one reason each); every hunk of the actual diff must be declared, every declared hunk must still exist, and a difference naming no listed function fails. A failure prints the undeclared hunks and the whole diff as the JSON to paste once a reason is written.
    - **`normalize`** is a small tokenizer, not esbuild: comments dropped; whitespace only where two words meet; numbers by value (`0.008` = `8e-3`); strings in double quotes by value; trailing commas dropped; `let` / `var` → `const` (keywords only, never inside a string: the old `const(--alius-font-type)` artefact is gone); `(x) =>` = `x =>`; one statement a line (a `;`, or a newline where the statement cannot go on, ends it; `{` and `}` break lines). Identifiers are never renamed; a string's, a template's or a regex's text is never touched (a template's `${…}` is normalized on one line). A `/` opens a regex by one rule for the masker and the tokenizer (after nothing, a punctuator that cannot end an expression, `}`, or a keyword such as `return`).
    - **`portFunction`** strips types with TypeScript's `transpileModule`, not esbuild: esbuild's printer renames a local that shadows another name (`innerWidth` → `innerWidth2` in `placeFree`, `yy` → `yy2`), which would hide or invent differences. `findDeclaration(src, fn)` (exported) is the parser both sides use: a top-level `function` / `async function` / `class` / one declarator of a `const|let|var` list, `export` dropped.
    - The kit's `fidelity.json` was regenerated with the real `normalize`; `stepSpring` is now a `fragment` entry (checked, no longer hand-diffed).
    - **The shots:** `npm run shots -- <name> [--state <fixture>] [--moment <id>] [--sprite <file>]` writes `.superpowers/shots/<name>/{proto,port,pair}-<moment>.png` (`pair` = the two side by side, labelled) at deviceScaleFactor 1. The moments live in `scripts/instrument-moments.mjs` (`MOMENTS[name] = { state, size?, clip?, hide?, settle?, moments: [{ id, state?, query?, clip?, proto(page, ctx), port(page, ctx) }] }`; a negative clip `x` / `y` counts from the right / bottom edge; `hide` hides the prototype's panel and log). `proto` drives the built prototype through its hooks (`window.__S`, `window.__G()`, `window.__forceO`, …), its top-level bindings (reachable from `page.evaluate`) or its panel; `port` drives the layout page (`/page.html?fixture=<state><query>`). Each instrument task adds its entry. `cards` has three: `dial-base` (standing), `dial-named` (LOW over BOWING) and `dial-wide` (a 30-character name for bowing), cropped to the dial's corner.
    - The layout page and its server moved to `scripts/layout-page.mjs` (`buildLayoutPage`, `serveRoot`, `openLayout`, `chromium`), shared by `test:layout` and `shots`. New layout fixtures `dialname` and `dialwide`; the layout test checks that the circle stays within 1 px (x and y) of `standing`'s, that the wide label wraps, and that `.alius-dial-label` stays inside the viewport and off her head.
    - **The dial:** `.alius-dial-name` (her name, else the base name), `.alius-dial-sub` (the base name, only under a name of hers), `.alius-dial-eyes` (the EYES line; it was `.alius-dial-sub` before). The label is out of the flow in a fixed room under the circle (`--alius-dial-label-room: 44px`: it holds the tallest label, her name on two lines (`line-clamp: 2`) over the base name and the EYES line, so the circle's bottom is 68 px from the edge, the prototype's 58 px having room for less); its width is 240 px but stays 6 px inside the corner's 24 px margin (`max-width: calc(100% + 36px)`: 184 px at 1280×800), a necessary change from the prototype's corner (right 36 px). The `dialwide` fixture is that tallest label (a 30-character name for bowing); the layout test keeps it 2 px off the viewport's edges.
    - Carry-over of Task 5's review: `resetInstruments()` (host) stops the instrument and forgets the failed mount (keyed by scene and run ids, which repeat across campaigns); `resetSceneStage` calls it. A throwing `matches` is warned once and skipped (the next definition is asked, else the card draws).

- [x] **Step 1: Write the failing tests:**
  - `the label shows her name over the base name`: `.alius-dial-name` text `LOW`, `.alius-dial-sub` text `BOWING`; with no name of hers, the base alone.
  - Layout test: the face's x is the same (±1 px) for `standing` and for a posture whose label is 30 characters.
  - `protoFunction('breath', 'windowOpenness')` returns the function's whole source; `normalize` makes two formattings of the same code equal and keeps a renamed identifier different; `protoValue('weight', 'STYLES')` returns the table; a fixture `fidelity.json` with an undeclared difference fails with the diff in the message.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** the tests, `npm run test:layout` → PASS.
- [x] **Step 5: Commit** `fix(P10e-e): the dial's circle no longer moves with its label; side-by-side shots`

**Chunk e1 closed (2026-11-25).** Tasks 1–6 reviewed one by one, then the chunk as a whole. The chunk review's fixes (75c1780, 968238b) settled the host's contract:
- the real-time default migrates once for existing installs;
- `InstrumentRun.finish?(end)` lets a run's end play (the stop word, a scene end, a chat switch and a new run still unmount at once);
- the host undoes what a mount leaves: scoped samples, `env.timeout` / `env.listen`, the style and `data-*` of the root, the layers and the input;
- her lines go through `env.say`;
- the host's mark has no `data-analyze` (`instrument` is reachable through the `see` lists of `stop_word`, `posture_dial` and `contact_physics`);
- both real-time gates are required (the global setting and the campaign's mirror).

Open for e4: a blackout's end is cut short by the scene end; P15a's typing lapse against breath's mouse rule.

---

## Chunk e2: her cards and the posture call (`cards.html`)

**Memory check (e2):** nothing new. It is a restyle. The call's outcomes are P16's `posture_called` (`taken` / `void`) and `posture_slip`, already decided there. No new event, directive or state.

### Task 7: The scene card and her voice on every card

**Files:**
- Create: `src/ui/scene/cards/sceneCard.ts`, `css/64-cards.css`
- Modify (each draw function gains `opts?: { look?: 'scene' }`; with it, the card is built by `sceneCard` and her lines by `voiceLine`; without it, today's DOM is unchanged):
  - `src/ui/scene/momentCard.ts`
  - `src/ui/practice/taskCard.ts`
  - `src/ui/practice/punishmentCard.ts` (punishment, take-instead, ceremony, the undo chip)
  - `src/ui/practice/demonstrationCard.ts`
  - `src/ui/dynamic/cards.ts` (milestone, claim, return)
  - `src/ui/practice/signature.ts` (the held pill)
  - `src/ui/scene/physicsPanel.ts` (the fallback card's look in the scene)
  - `src/ui/scene/sceneScreen.ts` (pass `look: 'scene'`)
- Test: `tests/ui/cards/sceneCard.test.ts`; existing scene tests may change selectors and button text, not their behaviour.

**Interfaces:**
- Consumes: `voiceLine`, `cardWhen` (Task 3); `handOf`, `handScale` (Task 2).
- Produces:
  - `sceneCard(o)` with `o`:
    - `her?: HerLook` (absent = neutral)
    - `kind: string` (the small-caps word)
    - `words?: VoiceRun[] | string`
    - `conditions: Array<{ runs: VoiceRun[]; dry: string; analyze: string }>`
    - `prose?: string`
    - `answers: HTMLElement[]`
    - `seal?: true`
    - `extra?: Node[]`
  - It returns an `HTMLElement` (`article.alius-scard[data-scard-kind]`) with the stripe, the head (her name in her hand, the kind) and the body of `cards.html`'s `bodyOf`.
  - `scenePill(text: string, onclick, attrs): HTMLButtonElement` (`button.alius-pill`).
  - Every existing `data-*` hook and `data-analyze` stays on its element. Answers keep their `data-*-answer` attributes. The text of a pill is the lower-case word of card-voice §4.

- [x] **Step 1: Write the failing tests** (jsdom, `look: 'scene'`):
  - `a task speaks in her voice`: the card has her name in `.alius-scard-who`, her words, and condition lines in the order `when → cost → lapse`. Each value is a `span.alius-scard-v` with the engine's word (`this evening`, `one slot`, `training together`).
  - `no brackets anywhere`: `/\[\s*[A-Z]/` matches nothing in the dock's text.
  - `a cruel holder still names the cost`: a `button_cost` task of a cruel holder has a cost line.
  - `the sealed envelope keeps its secret`: no summary or text of a sealed task in `outerHTML`; a `.alius-scard-seal`; the weight line absent for cruel and vindictive.
  - `readable mode shows the dry lines`: `.alius-scard-dry` with `Due: this evening.`
  - `the moment is not hers`: `data-scard-kind="moment"`, no `.alius-scard-who`, the prose from `voiceLine(… 'moment' …)`.
  - `the answers are the same actions`: clicking `accept` / `refuse` / `talk it over` / `negotiate` / `go` / `yield` / `do it` / `take it instead` calls the same handlers with the same ids as today. `sign` needs a 1.2 s hold (fake timers).
  - `the PDA thread is unchanged`: `drawTaskCards` without `look` gives today's `article.alius-voice` DOM (a snapshot of one card).
  - `analyze coverage`: `markedWithout`, `unresolved` and `unreachable` are empty for a dock with one card of each kind (the helpers of `tests/helpers/analyzeCoverage.ts`); the hidden sentinels are absent (`tests/fixtures/analyze/hidden.ts`).
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement** (open `docs/prototypes/cards.html` first; its `fidelity.json` lists `gistOf`, `fill`, `linesOf`/`pick` (as `voiceLine`, declared), `bodyOf`'s order, and the tables `NEUTRAL` / `STYLE` against `cardVoice`):
  - Port `cards.html`'s CSS for `.card`, `.head`, `.body`, `.words`, `.cond`, `.v`, `.rule`, `.pill`, `.seal`, `.steps` and `.dry` into `css/64-cards.css`, renamed to `alius-scard-*`, sizes × `--alius-hand-scale`.
  - The key of `voiceLine` is the card's id (`task.id`, `p.id`, `d.id`, `milestone.id`, …).
- [x] **Step 4: Run** the tests, `npm test`, `npm run test:layout` → PASS.
- [x] **Step 5: Commit** `feat(P10e-e): her cards in the scene's language and her voice`
  - *As built:* each draw function takes a last `opts: CardLook = {}` (`{ look?: 'scene' }`, exported from `src/ui/practice/taskCard.ts`); `renderPhysicsPanel` takes `look` in its ctx. `sceneCard` also takes `kindId` (`data-scard-kind` when it is not the word: `moment` for `a moment`, `physics` for `a hold`, `ways` for `what reaches the body`, `return` for `begin again`) and `gist` (written as `data-gist`); `conditionEls`, `herLook`, `runsOf`, `pillWord` are exported beside it. A condition is `{ runs, dry, analyze, ctx?, attrs? }`: the line carries `data-analyze` (focusable) and the draw function's old `data-*` hook (`data-demonstration-audience`, `data-for-unit`, `data-grants`). Ruling E: the punishment's `{Label}.` is the new kind `punishLabel` (card-voice.md §1 weight, "a punishment's name stands above it"); the sealed card's weight reads `weight` as the prototype's `pick(id, 'weight')` does (her style first), so no second kind. `gistOf` is `src/ui/scene/cards/gist.ts` (its `<b>` marks are drawn as elements by the dock, never parsed). The sign pill is `renderSignature({ …, look: 'scene' })`: `button.alius-pill.alius-sign` with a fill that a CSS transition grows over `--alius-sign-ms` (the prototype's rAF fill; the timer is P16's, unchanged). The answered punishment is a scene card with its chip and `undo, not what I meant`; the moment's exposing line is §3 `exposing`; a task shows `when` whatever its form whenever the engine has a deadline (the prototype's words task had none). Not ported: the ceremony's `say it` pill (no handler today: a restyle adds no mechanic). P14's `[ REROLL ]` and the failure chips keep their own look inside the dock. `css/64-cards.css`; `src/ui/scene/instruments/cards/fidelity.json` (gistOf, fill, linesOf, pick as voiceLine, NEUTRAL and STYLE against `cardVoice`).

### Task 8: Collapsed cards are the edges of her hand

**Files:**
- Modify: `src/ui/scene/stage/dock.ts` (the collapsed strip's gist; newest on top above the open card; overlap; a card with a clock never collapses), `css/64-cards.css`
- Test: `tests/ui/stage/dock.test.ts`

**Interfaces:**
- Produces:
  - Each card built with `look: 'scene'` carries `data-gist` (the engine's short name and its most urgent condition as text, built by the draw function: `gistOf` of `cards.html`; a sealed task `✉`).
  - The dock draws a collapsed card as its head line and `span.alius-scard-gist` (from `data-gist`).
  - `running(card)` is `data-run` **or** `data-clock`.

- [x] **Step 1: Write the failing tests:**
  - `a collapsed card shows her name, its kind and its gist`, never only the name: a task's strip reads `Ann`, `task`, `bring the roster · this evening`.
  - `a sealed strip shows ✉ and nothing else of it`.
  - `newest on top, the open one below them`: three cards → DOM order `[c3, c2]` strips, then `c1` open (the open one is the newest unless the commander chose another).
  - `a click opens a strip, the open one becomes a strip`.
  - `a running hold is never collapsed` (as today) and `the set-aside counter still works`.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run**, `npm run test:layout` → PASS.
- [x] **Step 5: Commit** `feat(P10e-e): collapsed cards show her name, the kind and the gist`
  - *As built:* the dock remembers when each card first came (module memory by its key, `resetDock` forgets it): newer = later; drawn at once, the first in the slots' order counts as the newest, so the old rule (a punishment opens before a task) holds for a batch. A new card (not one with a clock) clears the commander's choice, so it opens (cards.html `addCard`). The slots are `display: contents` and each card gets its CSS `order` (strips newest on top, the open card, the cards with a clock): the DOM order of the slots is not touched (the draw functions keep their hosts), so the tests read the order from `style.order`. A card with a clock gets no × (cards.html draws none for `run`). The gist span is drawn into `.alius-scard-head` from `data-gist` on every layout (`gistRuns`: `<b>` as an element, the rest text).

### Task 9: The posture call as a full-frame moment

**Files:**
- Create: `src/ui/scene/instruments/call/call.ts` (the port of `cards.html`'s `startCall`, `scheduleTaps`, `tap`, `choose`, `end`), `css/65-call.css`
- Modify: `src/ui/practice/postureCall.ts` (`drawPostureCall` keeps its name, signature, timer rule and expiry; with `look: 'scene'` it draws the moment into `layers.moment` instead of a dock card), `src/ui/scene/sceneScreen.ts` (the `posture-call` dock slot goes; the call's host is the moment layer), `src/ui/scene/stage/dock.ts` (`DOCK_SLOTS` loses `posture-call`), `tests/ui/stage/hosts.test.ts` (the call's new place)
- Test: `tests/ui/instruments/call.test.ts`

**Interfaces:**
- Consumes: `mannequinSvg`, `poseOf` (the dial); `voiceLine(... 'call.<outcome>' ...)`; `SampleSound` (`ha/soft1–2`, `card_fan`, `card_place1`).
- Produces:
  - `tapTimes(windowMs: number): number[]` — the first tap at 380, each next `700 − 480·k²` later (`k` = the time gone / `windowMs`), the last exactly at `windowMs`
  - `fanPlace(i: number, n: number): { x: number; rot: number; lift: number }` — `x = (i − (n−1)) × 140`, `rot = (i − (n−1)/2) × 5`, `lift = |i − (n−1)/2| × 9`
  - The moment's DOM: `div.alius-call[data-call][data-clock]` with `.alius-call-word` (her word), `.alius-call-dots`, `.alius-call-line` and `.alius-call-fan` holding `button.alius-call-card[data-posture-choice][data-call]` (`glossary:posture_call`), each with its mannequin, her name and the base label.

- [x] **Step 1: Write the failing tests:**
  - `tapTimes(5000)` starts at 380, ends at 5000, and every gap is shorter than the one before; `tapTimes(3000)` ends at 3000.
  - `fanPlace(3, 4)` → `{ x: 0, rot: 7.5, lift: 13.5 }`; `fanPlace(0, 4)` → `{ x: -420, rot: -7.5, lift: 13.5 }`.
  - `the call draws her word, a card per named posture and no timer bar` (`look: 'scene'`, fake timers):
    - the cards are her set that passes `entryAllowed`, in the order of `practices.postures`;
    - each card is one button with `data-analyze`.
  - `a click on the right card takes it in time`: `take(callId, postureId, false)` once; her `call.right` line is shown; the expiry is cancelled.
  - `a wrong card`: `take(callId, otherId, false)`; the right card gets `.is-right`; her `call.wrong` line contains her word for the right posture.
  - `the last tap is too late`: at `windowMs` → `take(callId, undefined, true)` once, whatever the redraws; her `call.slow` line.
  - `without the order interaction` there are no dots and no expiry; only right or wrong.
  - `reduced motion`: no `.is-writing` class and no rising transition; the dots and the expiry stay.
  - `a void answer` (`posture_called` with `void`): her `call.right` line; the dial is unchanged (R9).
  - `dispose and a chat switch cancel the expiry` (`cancelPostureCalls`), and no `take` is called afterwards.
  - `tests/ui/analyzeCoverage.test.ts` "her call of a named posture" passes with the new DOM (`.alius-call`, two `[data-posture-choice]`, `glossary:posture_call`).
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement** by copying `cards.html`'s `startCall`, `scheduleTaps`, `tap`, `choose`, `end` and the `#call` / `.pc` CSS (its `fidelity.json`; the call's wiring to `take` is the declared difference). The numbers, for orientation:
  - dim .28; the dial ring in her accent;
  - her word at 74 vw / 13 vh, 92 px × hand scale, write-on `steps(14)` over 520 ms;
  - the dots;
  - the fan anchored 110 px from the right and `min(18.5vh, 200px) + 72px` from the bottom;
  - the right card's flight to the dial;
  - the timings 1300 / 2600 / 3300 ms.
- [x] **Step 4: Run** the tests, `npm test`, `npm run test:layout` (her word and the fan stay inside the viewport and off her head box at all three sizes) → PASS.
- [x] **Step 5: Shots:** `npm run shots -- cards` (moments: the stack, a task open, the call mid-window, right, slow). Compare with the prototype, fix any drift.
- [x] **Step 6: Commit** `feat(P10e-e): the posture call as a full-frame moment`
  - *As built:* `drawPostureCall(host, state, reg, pick, handlers, opts)` with `opts.look === 'scene'` starts the moment once per call (`startCall` of `src/ui/scene/instruments/call/call.ts`, module memory: a redraw never restarts it) and returns; the handlers gain `dim` (the effects layer: the .28 dim sits under the scene's UI, as the prototype's `#dimmer` under its reply and dock), `dial` (the dial's corner: `data-called` and `--alius-her` ring the face) and `samples`. The answer goes to the engine at once from `end` (`take(callId, base | undefined, late)`); the scene redraws 380 ms later (at once with reduced motion) so the dial, drawn from the state, takes the posture as the card lands (a void answer leaves it, R9). An answered call plays its end (1.3 / 2.6 / 3.3 s) though the state no longer holds it; an unanswered call gone from the state, a new call, `cancelPostureCalls` (dispose) and `resetSceneStage` (chat switch, through `onStageReset`) end it at once (`cancelCall`: timers, elements, the dim and the ring). Her choices are her whole named set that passes `entryAllowed`, in her order (the prototype's `NAMED.slice(0, 4)` is prototype data). A tap's sound and rate are `fnv1a` of the call and the tap (no rng). The cards carry `data-analyze="glossary:posture_call"` and nothing marked is above them. The layout fixture `call` (Ann, ritual, four names, Low called) and its check: her word and the fan inside the viewport and off her face (the middle third of the head box: the prototype's own placement at 74 vw reaches into the sprite's box at 1280×800, never onto the face). `npm run shots -- cards` has the moments `stack`, `task`, `call-mid`, `call-right`, `call-slow`, each at 1920×1080 and 1280×800 (a moment may set its own `size`).

### Task 10: Arrival, sounds and the review of e2

**Files:**
- Modify: `src/ui/scene/stage/dock.ts` (a new card slides in: 46 px, −2°, 0.5 s, `card_slide` at .25 pan −0.6; opening a strip `card_slide` at .18; `card_place` at .25 on an answer), `css/64-cards.css`
- Test: `tests/ui/stage/dock.test.ts`

- [x] **Step 1: Write the failing tests:**
  - `a new card arrives once`: `.is-arriving` on its first draw only, never on a redraw; none under reduced motion.
  - `the sounds play through the sample layer`, at the gains above; none when muted.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run**, `npm test`, `npm run test:layout` → PASS.
- [x] **Step 5: Review of e2:** `npm run shots -- cards` at 1920×1080 and 1280×800. Record the side-by-side in the task's commit message (what was compared, what differed and was fixed).
- [x] **Step 6: Commit** `feat(P10e-e): cards arrive and sound; e2 reviewed against cards.html`
  - *As built:* `createDock(host, names, { samples?, reduced? })` (getters; the scene passes `ctx.samples` and `motionReduced`). The cards there when a scene's first layout runs are dealt quietly (module memory of the dealt scenes, reset with the stage), as cards.html deals its first hand with `addCard(t, true)`; a card first seen after that gets `.is-arriving` (not with reduced motion) and plays `card_slide` (`fnv1a(key) % 2`, gain .25, pan −0.6), once for a batch. Opening a strip plays `card_slide` at .18; `card_place` at .25 plays once an answer pill's card is gone (as cards.html; negotiate, the fallback hold's controls and ceremony steps play nothing; fix 1f8898e). The sounds go through `SampleSound.play` (muted: nothing; the palette is preloaded at `createDock`). e2 review (shots at 1920×1080 and 1280×800): the cards, the strips, the call mid-window, right and slow match the prototype; what differs is the unit's hand and accent (`handOf` / `unitAccent`), the dock's left edge and width (P10e's: 18 px, `min(420px, 26vw)`, 360 px under 1400 px wide), the dial's circle 10 px higher (Task 6). Fixed during the review: the `three` fixture's task got a deadline and a slot so its conditions show; the call's moments are shot full-frame and timed so both sides are at the same point.


**Chunk e2 closed (2026-11-25).** Tasks 7–10 by one implementer, one review of the chunk (two Important, eight minor), one fix round (cc02d24, 1f8898e, 1443cb2), re-review clean:
- while her call is drawn the stop pill is lifted above it and answered cards take no pointer (P15a: the stop word always ends a hold; declared in `call/fidelity.json`; layout fixture `callhold`);
- `card_place` only when an answered card is gone;
- declared: the ceremony's `say it` pill is not ported (nothing handles it), P14's `[ REROLL ]` keeps its brackets, readable mode keeps her hand on cards, the dock keeps P10e's edge and width.

Open for e12 (P10e open items): cards are placed with CSS `order`, so screen readers and Tab follow slot order; the lifted pill's place is measured once per call (a resize mid-call leaves it slightly off the corner, still clickable).

---

## Chunk e3: the slap (`slap.html`)

**Memory check (e3):**
- A turned face becomes her offence `slap_defied` (R11). It is remembered as every offence of hers is, through her discipline's existing path. No new `memoryRules` entry: `noteOffence` already writes what her discipline keeps.
- `slap_dealt` gains `side`, read by the directive only.
- The cheek is UI (scene-keyed).

### Task 11: The slap's engine: meanings, the swing, her side, her face and her lines

**Files:**
- Modify:
  - `src/engine/practice/state.ts` (`OFFENCE_KINDS` + `'slap_defied'`)
  - `src/engine/practice/slap.ts` (`deal`: on `flinched`, after today's style answers, `noteOffence(kind 'slap_defied', stakes 'minor', ref slapId)`; `slap_dealt.side`)
  - `src/engine/tuning.ts` (`practice.slap.braceBand: [42, 224]`, `againLeadMs: 420`, `faces`: the README's table)
  - `src/practice/directives.ts` (`slapDirective` names the cheek: `… on the left cheek.` / `… on the right cheek.`)
  - `content/core/cardVoice.json` (kinds `slap.before`, `slap.feint`, `slap.again`, `slap.after.none|braced|flinched` by style, with `slap.html`'s `LINES` texts; cold has none)
- Test: `tests/engine/practice/slap.test.ts`, `tests/practice/directives.test.ts`

**Interfaces:**
- Produces:
  - `slapSide(slapId: string): 1 | -1` — `fnv1a(slapId) % 2 === 0 ? 1 : -1`; 1 is her right hand, screen left
  - `slap_dealt { …; side: 1 | -1 }`
  - `TUNING.practice.slap.faces: Record<ProfileStyle, { before: string; keep: string[]; after: Record<SlapResult, string> }>`

- [x] **Step 1: Write the failing tests:**
  - `a turned face is her offence`: `answerSlap(…, 'flinched')` emits `slap_dealt` and her offence `slap_defied` (minor). `none` and `braced` note none.
  - `cruel still slaps again after a turned face` (as today), and `vindictive still adds to the count`.
  - `the side is the hash of the id`: two calls give the same side; over 20 ids both sides appear.
  - `faces holds every style`: 11 rows, each `after` with the three results, every label one of the 28 SillyTavern expressions.
  - `the directive names the cheek`.
  - `no rng`: `state.rng` is equal before and after a slap is dealt (a deep compare).
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** the tests, the seeded `unaffected` tests, `npm test` → PASS (a moved golden stops and reports).
- [x] **Step 5: Commit** `feat(P10e-e): the slap's meanings, her side, her face and her lines`
  - *As built:* `slap_defied` joins `OFFENCE_KINDS` and `OFFENCE_WORDS` ("the commander turned the face away from her slap"). `deal` notes it after the style answers (cruel's second slap, vindictive's +1, affectionate's softer favour), ref the slap's id. `slapSide` lives in `src/engine/practice/slap.ts`. `TUNING.practice.slap.faces` is typed `Record<ProfileStyle, SlapFace>` (`SlapFace` exported from `tuning.ts`, a type-only import of `ProfileStyle`). `words.flinched` now says the face was turned away and the blow only grazed. The directive puts the cheek before the closing sentence (`…, on the left cheek. Show it in how she acts…`), because every practice directive ends with that sentence; an event with no `side` names no cheek. The slap lines are 34 `cardVoice` rows `slap.<kind>.<style>` (style rows only, so cold, with none, stays silent: no neutral fallback). `docs/content/card-voice.md` gains §6, the readable copy, and `tests/content/cardVoice.test.ts` reads §6 too.

### Task 12: The slap instrument

**Files:**
- Create: `src/ui/scene/instruments/slap/slap.ts` (the port of `slap.html`'s `startSlap`, `frame`, `press`, `tensionAt`, `onMove`, `land`, `flash`, `scatter`, `SFX`, `say`, `showFace`, `preload`, the cheek and the turned face), `css/66-slap.css`
- Modify:
  - `src/ui/practice/slapOverlay.ts` (keeps `renderSlapOverlay(host, ctx)` and `clearSlapOverlay(host)` as the entry; draws the instrument into the moment layer; the voice card, `[ BRACE ]`, the bar and the `HER HAND` cut-in go)
  - `src/ui/scene/sceneScreen.ts` (`SlapOverlayCtx` gains `env: InstrumentEnv`)
  - `css/84-practice.css` (the old overlay's rules go)
  - `src/ui/scene/stage/index.ts` (the cheek's memory registers `onStageReset`)
- Test: `tests/ui/practice/slapOverlay.test.ts` (rewritten for the new behaviour), `tests/ui/practice/hidden.test.ts` (unchanged assertions)

**Interfaces:**
- Consumes: `slapSide`, `TUNING.practice.slap.{leadMs, feintMs, windowMs, braceBand, againLeadMs, faces}`, `voiceLine(… 'slap.*' …)`, `env.setSprite`, `env.samples` (`slap/slap.ogg` at `0.95 × 0.5`, `slap/swish1.ogg` at rate .72, `ha/cloth1–4`, `breath-in-out.mp3`).
- Produces:
  - `slapTimeline(slap: { windowMs: number; feints: number; unannounced?: true; again?: true }): { snap: 170; impactAt: number; feintsAt: number[] }`
  - `resultOf(pressAt: number | null, impactAt: number, flicked: boolean): SlapResult` — flicked → `flinched`; a press 42–224 ms before the impact → `braced`; else `none`
  - `isFlick(samples: Array<{ t: number; x: number }>, width: number): boolean` — ≥ 2400 px/s over the last 70 ms and ≥ 6 % of the width

- [x] **Step 1: Write the failing tests:**
  - `slapTimeline`:
    - `{ windowMs: 500, feints: 1 }` → `impactAt = 900 + 450 + 500`;
    - unannounced → `impactAt = 500`, no raised hand;
    - `again` → `impactAt = 420 + windowMs`.
  - `resultOf`:
    - a press 100 ms before → `braced`; 300 ms before → `none`; 20 ms before → `none`; after the impact → `none`;
    - flicked with any press → `flinched`.
  - `isFlick`: 3000 px/s over 70 ms and 10 % of the width → true; 3000 px/s over 3 % → false; 1500 px/s → false.
  - `one try`: a second press does nothing; a press on a feint burns the try (the impact gives `none`).
  - `the answer is sent once` through `onResult`, at the impact (fake clock).
  - `the input loses focus when it starts`; Space typed into a field before the slap is not counted.
  - `her face`: `env.setSprite(holderId, faces[style].before)` inside the snap, unless her face now is in `keep`; after the result, `faces[style].after[result]`.
  - `reduced motion or the timing toggle off`: `onResult('none')` at once; only the flash, the ringing and the cheek.
  - `the cheek stays for the scene and is gone on a new scene or a chat switch`.
  - `hidden.test.ts` still passes: no `733`, no `windowMs` or `feints` in the HTML.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement** by copying `slap.html`'s functions and tables (`fidelity.json`: the functions above, `EXPR`, the timings; the engine's slap instead of the prototype's scheduler is the declared difference). For orientation:
  - the camera: zoom 2.6 to (0.5 W, 0.42 H), the backdrop blur 14 px and dim .55;
  - the lean −0.4 and the side light;
  - the impact's whip (7.5 % / 5.5°, τ 210 ms, period 520 ms), the flash, the ringing and the cheek (τ 24 s);
  - the turn of 11 % in 160 ms;
  - `face_close` from the art slots when present.
- [x] **Step 4: Run** the tests, `npm test`, `npm run test:layout` → PASS.
- [x] **Step 5: Shots:** `npm run shots -- slap` (moments: hand raised, a feint, the impact `none`, `braced`, the turned face, the cheek after). Fix any drift.
- [x] **Step 6: Commit** `feat(P10e-e): the slap instrument replaces the overlay`
  - *As built:* `src/ui/scene/instruments/slap/slap.ts` is the port (its `fidelity.json` lists the functions, the tables against TUNING and `LINES` against the `cardVoice` rows, with ten declared differences). The slap draws in its own layer inside the **effects** layer, under the scene's UI, so the stop word's pill and every control stay on top (`npm run test:layout` fixture `slaphold` checks the pill and the input mid-slap, and that the layers are put back after); the `.alius-slap-host` stays in the moment layer as a marker (`data-slap`). The prototype's `#world` is the scene's backdrop and sprites layers, moved by `cam` (the world's transform about the prototype's origin; the backdrop grows to the 128 % box with the zoom; her sprite's layer zooms from her face point measured on the drawn sprite; every style it writes is put back the moment it is home); the impact's motion blur is the world's on screen (each scaled layer takes `hb` divided by its scale, review I2). `SlapOverlayCtx` is `{ state, reg, slap?, settings, env, onResult }`; `InstrumentEnv` gains `faceOf(unitId)` and `spriteUrl(unitId, label)`, and `setSprite(unitId, label, url?)` (the scene caches resolved sprite pictures, so a known face is shown with no avatar in between). The scene builds the env with or without the staging controller (a dead staging; no physics instrument mounts on it). The answer goes at the impact; a slap gone from the state before it landed stops and sends nothing; one that landed plays its end; cruel's second waits in `G.next` for the first one's hold (+120 ms, as the prototype). The cheek is module memory keyed by scene id: a redraw or a new screen of the same scene draws it on, a new scene and `resetSceneStage` forget it. `slapTimeline` follows the prototype for unannounced (`170 + windowMs`, not the plan's `500`). No `Math.random`: `pick` / `rand` hash the slap's id and a count. Shots: `npm run shots -- slap` (the entry's `rasterSprite` draws the fixture's SVG as a PNG at run time for the prototype, which sizes its `<img>` by layout). *Fix round 1:* her face now is read per slap (I1); the lookups of her style's faces start when the slap binds, `env.spriteUrl` is the lookup only and the prototype's `preload` decodes, and a late answer shows the face then (I3); the scaled layers take the motion blur divided by their scale, the backdrop's blur too (I2, M1); no press or flick under the open curtain (M3); a withdrawn slap stops its sounds and timers (M7); the camera's styles, the host's mount snapshot and the dial's flag are claims of `src/ui/scene/instruments/styleClaims.ts`, a stack (M4); `resultOf` reads `tensionAt` (M5).


**Chunk e3 closed (2026-11-25).** Tasks 11–12 by one implementer, one review of the chunk, three fix rounds, re-review clean. What later instruments rely on:
- `src/ui/scene/instruments/styleClaims.ts`: a stack of claims over the layers' styles (the slap's camera, the host's mount, the dial's flag). A claim names only the properties it writes, records each write as it is made (`writeClaimed`), and on release puts back its saved value where the element still shows its own last write; the contract is the comment at the top of the file. Every instrument that writes a layer's style goes through it.
- `InstrumentEnv` gains `faceOf`, `spriteUrl` and `setSprite(…, url?)`; the env exists without a staging controller (a dead staging; no physics instrument mounts on it).
- Her face is read for each slap; a cold sprite cache only delays her `before` face; no press or flick is read while the history curtain is open; a withdrawn slap stops its sounds and timers.
- `npm run shots -- slap` rasterizes the fixture sprite at run time (no art committed).
- Declared in `slap/fidelity.json`: the scene's own 110 vh sprite; no camera return under reduced motion. Where the prototype beat the plan: an unannounced slap lands at `170 + windowMs`.

---

## The shape of an instrument task (e4 – e11)

Every instrument task below follows these steps. Its own section lists its files, interfaces and specific tests.

- [ ] **Step 0: Open the prototype.** Read `docs/prototypes/<name>.html` whole and its README section. Build it (`npm run proto -- <name>`) and play it in Chromium for a minute. Write the task's `fidelity.json`: every function and table its README section calls normative, plus the `LINES` kinds the port takes from the cue pool. This list is the task's definition of done.
- [ ] **Step 1: Write the failing tests:**
  - **fidelity:** the task's `fidelity.json` passes `tests/ui/instruments/fidelity.test.ts` (it fails until the port exists);
  - the pure helpers it names (exact values from the README);
  - **keys:** Space or Shift typed into the input never act, and only the mouse acts while the field has focus;
  - **fallback:** no art slot → her sprite, or the automatic zones, as the README says;
  - **reduced motion and readable mode:** the still form;
  - **unmount:** `stop()` (the stop word, a new run, `resetSceneStage`, dispose) leaves no timer, `requestAnimationFrame`, audio node or document listener, restores the frame and the input, and dispatches nothing afterwards (fake clock);
  - **inputs:** the inputs it reports for a scripted beat sequence (fake clock and fake staging).
- [ ] **Step 2: Run** them → FAIL.
- [ ] **Step 3: Port** by copying: paste each function and table of `fidelity.json` from the prototype into its module, add types, keep names, bodies, numbers and texts as they are; then wire it. Read the engine's plan and style instead of the "prototype only" schedulers. Read her lines from the cue pool (`env.staging.cue(kind, beat)`), never from the prototype's `LINES`. Put the CSS in the task's stylesheet.
- [ ] **Step 4: Run** the tests, `npm test`, `npm run test:layout` → PASS.
- [ ] **Step 5: Shots:** `npm run shots -- <name>` at the moments the task names; compare with the prototype and fix any drift. A drift the extension cannot avoid stops and reports. **The reviewer** of the task gets the prototype file, its README section, `fidelity.json` and the shots, not this plan's summary, and checks the port against the file.
- [ ] **Step 6: Commit** `feat(P10e-e): the <name> instrument`

New cue kinds join `CUE_KINDS` with rows in `content/core/physicsCues.json`. Each row takes the prototype's `LINES` for that kind as its texts (the author heard them in play). The `physics_cues` call asks for them as for the others.

---

## Chunk e4: breathing (`breath.html`)

**Memory check (e4):** nothing new. Over-holding is bookkeeping in the segment; her `greedy` line is a cue. The release, the blackout and the wake are P15a's, already remembered.

### Task 13: Breath's engine: the held credit, over-holding, her silence, the tally

**Files:**
- Modify:
  - `src/engine/physics/state.ts` (`SegmentInput.amount?`, `INPUT_KINDS` + `strain`, `PhysicsRun.tally?`)
  - `src/engine/physics/segment.ts` (R14, R15, R4; `effectiveOpenings` exported; the tally in `physicsInput`)
  - `src/engine/tuning.ts` (`physics.breath.overDelay: { cruel: 2, affectionate: 0, other: 1 }`, `physics.breath.wmul: 2`)
  - `src/engine/blocking/types.ts` (`CUE_KINDS` + `greedy`), `content/core/physicsCues.json`
  - `src/blocking/physicsDirectives.ts` (R28: the tally sentence for every physics)
  - `content/core/blockingContacts.json` and its schema (`occlusion: { kind: 'slit' | 'gap' | 'lift' | 'slide' | 'seat' | 'squeeze' | 'wedge'; side?: 'left' | 'right'; angle?: number; view?: 'ceiling' | 'room' | 'her_face' }` on the contacts of spec §15's table)
- Test: `tests/engine/physics/breathInputs.test.ts`, `tests/blocking/physicsDirectives.test.ts`

**Interfaces:**
- Produces:
  - `effectiveOpenings(plan: SegmentPlan, inputs: SegmentInput[], style: string): Array<{ beat: number; widthMs: number; false?: true }>` — the plan's openings with the delays of noticed strains applied; the engine and the instrument both read it
  - `occlusionOf(contact: Entry | undefined): { kind: OcclusionKind; side?: 'left' | 'right'; angle?: number; view: 'ceiling' | 'room' | 'her_face' }` (default `slit` / `ceiling`)
  - `run.tally`

- [x] **Step 1: Write the failing tests:**
  - `a breathe without amount counts as today` (the existing segment tests unchanged).
  - `amount .5 credits half`: `caught` 30 × .5 = +15, capped at 30 a window.
  - `a strain drains the beat twice`.
  - `a noticed strain resets the streak and delays the next opening`: by 1 beat for neutral, 2 for cruel, 0 for affectionate. A breathe on the old beat then misses; on the new beat it is caught.
  - `a cruel holder is silent in real time`: the plan's openings carry no cue, and `state.rng` advances exactly as it did before this change for the same seed.
  - `the tally counts what resolved`, and `the directive has one sentence of it after physics_outcome`, with no caught cheat named when it was not caught.
  - `occlusion` validates on every contact of the table; a contact without it is `slit` / `ceiling` (read by a reader `occlusionOf(contact)`).
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** the tests, every seeded `unaffected` and `tests/engine/physics/*` → PASS (a moved golden stops and reports).
- [x] **Step 5: Commit** `feat(P10e-e): breath's held credit, over-holding and her silence; the tally`
  - *As built:* `effectiveOpenings` moves **every** opening after a noticed strain (not only the next one), as the prototype's queue of windows moves (`G.queue.forEach(… e.at += delay)`: the windows after it are scheduled from the moved one); one moved past the segment's last beat is gone. `overDelayOf(style)` reads `TUNING.physics.breath.overDelay` (`other` for any style not named). A strain resolves only for a `capacity` gauge (breath); it drains its beat once more (`drain − seal`), one a beat. A `breathe` with `amount` 0 is no breath. R4: a real-time `cues: 'none'` holder's openings carry no cue, and no attention sign is put on them either (no draw either way: the `noCueShare` draw stays turn-based only; the test pins the rng after a real-time cruel plan to values recorded before the change). The tally's keys are `caught`, `missed`, `falseTaken`, `strains`, `noticed`, `slips`, `gasps`, `cheatsCaught` (a key appears once above 0; a relief she did not catch is not counted, so the R28 list's `reliefs` is `cheatsCaught`); `physics_outcome` carries `tally` when the run has one, and `physics:end` adds one sentence ("Over the whole hold: …") worded by the physics' interaction (`tallySentence`, `src/blocking/physicsDirectives.ts`); the stop word keeps `blocking:stop` alone. `occlusionOf` is `src/engine/physics/occlusion.ts` (a leaf; `OCCLUSION_KINDS`, `OCCLUSION_VIEWS`); the table's contacts carry it (`feet_on_face` with the prototype's angle −14, `smothered_armpit` side right, `hand_over_mouth` view `her_face`; a `slide` without a view sees the room by `VIEW_OF`). `greedy` joins `CUE_KINDS` with one `physicsCues` row for breath (3 lines: the content test wants 3–5 a row, so the row holds the neutral, affectionate and ritual lines of the prototype; the other styles' come from the model). The physics_cues prompt names the kind.

### Task 14: The breath instrument

**Files:** create `src/ui/scene/instruments/breath/breath.ts`, `css/67-breath.css`; register in `instruments/index.ts` (matches `run.physicsId`'s entry with `interaction: 'timing'` and `gauge.kind: 'capacity'`, read by field).

**Interfaces:**
- Consumes:
  - `effectiveOpenings` (the windows it plays: rise 260 ms, open `widthMs × wmul`, fall 320 ms; a false window snaps in 90 ms);
  - `occlusionOf`, `kit/dark` (`SHAPES`, `SEAT_BODY`, `squashOf`), `kit/lowres`, `kit/heart`, `kit/hand`;
  - the ceiling art (P10c `surface: 'ceiling'`), `env.samples`.
- Reports:
  - per opening, `{ beat, kind: 'breathe', amount: held share }`;
  - per over-hold, `{ beat, kind: 'strain', amount: 0.5 | 1 }` (150 ms → .5, 450 ms → 1);
  - `gap_breath` as today for a leaky seal.
- Ports: `render` (the dark, its three canvases), `SHAPES`, `VIEW_OF`, the camera, the tunnel, `letters`, `say`, `scheduleWindow`'s cue behaviour by style (from the plan), `openWindow`, `windowOpenness`, `updateLoop`, `heartTick`, `audioInit` / `noise` / `thump` / `SFX` / `inhaleStart`, the entry, exit, blackout and wake phases, the TAP ring.
- Tests (beyond the shape):
  - `windowOpenness(t)` at 0, 260, 260 + widthMs × 2 and + 320 ms → 0, 1, 1, 0;
  - `the held share of a window held from its rise to its fall is 1`;
  - `letters fade at the prototype's rate` (`0.42·((60 − air)/60)^1.4` a second) and a line sent with lost letters sends dots.
- Shots: the entry, a count (ritual), "now." (neutral), a false window (playful), low air (tunnel), the exit, a blackout (`breath_play`).
- *As built (Task 14):* `src/ui/scene/instruments/breath/breath.ts` (registered by `instruments/index.ts`), `css/67-breath.css`, `breath/fidelity.json` (every listed function token for token; 13 declared differences, each with its reason). `breathMatches` reads the physics by field (timing + capacity) and takes a run with a second physics only when that one takes no input of the commander's (`passive`): a weight's `hold` and a saturation's `mouth_breath` (neither in breath.html) leave the pair to the card (review I2). The instrument draws in the effects layer (opaque, under the scene's UI) with its own copy of her sprite placed at k = 0 exactly over the scene's (`R.spriteBox`) and of the scene's backdrop. Openings are the plan's (`effectiveOpenings`, scheduled per running segment on the loop's clock; the loop pauses while the run is held; the air is reset from the engine's gauge each segment; the engine ends the hold, the instrument's air stops at 0). Reports: a `breathe` per opening as it closes (or 300 ms before the segment's end) with `amount` = credit / caught, a false window reached for as a `breathe`, a `strain` 0.5 when a press held past 150 ms ends, a `strain` 1 at once at 450 ms, a `gap_breath` from a dashed ring under TAP for a leaky seal (glossary `gap_breath`). Ruling O: `PhysicsPanelStaging.input(i, { pointer })`; the controller's lapse never drops an input marked `pointer` (the mouse's), Space's go without it. `InstrumentEnv` gains `tap?()` (scoped by the host: dead after the run) and `assetUrl?()`. `ceilingOf` (`src/engine/backdrops.ts`) gives the ceiling by the owner's room style or the location's `ceiling` finish and the slot; no ceiling or a failed load falls back to the room. Her lines: `staging.cue` (now → window_open, fake/early → window_false, greedy, low → warning, released → lift); the prototype's other line kinds have no cue kind and say nothing. Ruling P: `finish` plays the exit (2.6 s) or the blackout and the wake (6.4 s); a blackout ends the scene, which still unmounts at once. Layout fixture `breathhold` (the pill on top and clickable mid-breath, the stop word ends the hold, the line and the reply put back); shots `npm run shots -- breath` (the clock is installed and the page reloaded so every frame is the fake clock's). The narrowed input line keeps a `min-width` of 420 px (the scene's line carries its prompt and tools). *Fix round 1:* her lines are `cardVoice` `breath.*` by style (ruling Q, card-voice.md §7; cold silent; a model-worded cue of that moment may take a line's place, the cue pool's narration never); an opening inside the entry plays as the loop begins on its own beat; the tally says only the over-holds she noticed; her delay is the engine's `overDelayOf`. Known: a breath segment plans `ceil(20000/1500) = 14` beats (21 s) while the staging ends it at 20 s (P15a, before this chunk), so an opening on beat 13 is cut short (flushed at 19.7 s); the instrument's air drains double for a whole over-hold where the engine charges one beat (it is reset from the engine's gauge each segment).


**Chunk e4 closed (2026-11-25).** Tasks 13–14 by one implementer, one review of the chunk, two fix rounds, re-review clean. Rulings:
- the P15a typing lapse never drops the instrument's mouse acts (the keyboard path is unchanged);
- a scene end, a chat switch or the stop word unmounts at once; on a physics outcome the blackout and the wake play through `finish()`, then P15a's wake card;
- her lines follow the slap: `cardVoice` kinds `breath.<kind>` by style hold `breath.html`'s lines verbatim; a model-written cue may take the place of `now` / `fake` / `greedy` / `low` (the cue prompt asks for spoken words); the pool's fallback narration is never written in her hand; her tap line follows the engine's answer; playful's "again." plays as a count before a planned opening when the gap allows (no window, nothing reported).

Also settled: the tally sentence names only the over-holds she noticed; an opening inside the 1.8 s entry plays as the loop begins on its planned beat; breath refuses a pair whose second physics needs inputs (`smothered_armpit`, `face_to_bottom`, `between_thighs` draw the card). A noticed over-hold moves every later opening (the prototype's queue).

For the author (e12): breath.html has no cold style, so a cold holder is silent in breath unless the model writes the line; clinical, obsessive, drill, regal and vindictive take neutral's lines. Deferred minors: the TAP and gap rings are not reachable by assistive tech (the effects layer); the tap check reads the instrument's copy of the run (two quick taps can lag).

---

## Chunk e5: weight (`weight.html`)

**Memory check (e5):** nothing new. A slip, a caught shift and a buckle are P15a's events (`physics_slip`, `physics_caught`), already decided.

### Task 15: Weight's engine: uneven holding and the view of the contact

**Files:**
- Modify: `src/engine/physics/state.ts` (`uneven`), `src/engine/physics/segment.ts` (R16), `content/core/blockingContacts.json` and its schema (`face: 'up' | 'down'` on the weight contacts: up for `straddled`, `standing_on`, `boot_on_chest`; down for `human_chair`, `footrest`, `knee_on_back`, `on_hands`)
- Test: `tests/engine/physics/weightInputs.test.ts`

- [x] **Step 1:** Tests:
  - `an uneven input drains drain × amount`;
  - `no uneven input: today's numbers` (the existing tests);
  - `a shift landing on a beat with no hold costs as today`;
  - `face reads by field`.
- [x] **Steps 2–5** as Task 13 (`feat(P10e-e): uneven holding costs strength`).
  - *As built:* `uneven` joins `INPUT_KINDS`; on a `hold` beat the first `uneven` input costs `drain × amount` (the beat's drain: her pressure and a pair's steady breath included; absent or 0 amount costs nothing, it is never a hold, so the beat still slips without one). The shift's rule is unchanged (`evenBefore`: a hold on the beat and the one before). The readers are in `src/engine/physics/occlusion.ts` (the leaf of a contact's view): `contactFaceOf(contact)` (`face`, absent = `down`) and, added for Task 16, `herLegsOf(contact)` (`legs: 'hang'`, absent = out of view): weight.html draws her legs for `human_chair` and only hears her for `footrest`, and the port must read that by field, so `human_chair` carries `legs: "hang"` (the other face-down contacts, `knee_on_back` and `on_hands`, have no legs drawn: footrest's form). `standing_on` is face up as the plan and the prototype say, although its `implies` lays the receiver `lying_front` (the prototype's note: "on the back, she stands on you"). Nothing is remembered (memory check e5).

### Task 16: The weight instrument

**Files:** create `src/ui/scene/instruments/weight/weight.ts`, `weight/vial.ts` (the level's SVG), `css/68-weight.css`; register (matches `interaction: 'hold'`).

**Interfaces:**
- Consumes: the plan's `shift` beats and `attention`, `run.pressure`, the contact's `face`, the art slot `over` (fit `{ height, x, sink }`), the floor and ceiling art, `kit/spring` (stiffness 90 / damping 14 for the balance, 260 / 16 for the bubble, steps ≤ 8 ms), `kit/chaikin`, `kit/lowres`.
- Reports:
  - `{ beat, kind: 'hold' }` only on a beat held and level (`|err| ≤ 0.18`);
  - `{ beat, kind: 'uneven', amount }` each beat;
  - `{ beat, kind: 'shift_weight' }` for the commander's own shift (Shift or the right button; 2.6 s cooldown).
- Ports:
  - `placeSprite`, the face-up lean and press, `#screenGlow`, `drawFloor`, `legsHang`, `legPoints`, `LEG_FEET.relaxed`;
  - the screen's light on the floor, `#vial` (scaled 1.3, 186 px above the bottom, tilting at .35 of the frame), the frame's tilt, sag and tremble;
  - `crack` / `healCracks`, `letters`, `SFX`;
  - the telegraph table `STYLES[].tele`;
  - her tapping while busy.
  - The rejected legs `x_side`, `x_forward`, the feet `first` and `pointed` and the shade `black` are not ported.
- Tests:
  - `the bubble never diverges on a 200 ms frame`;
  - `the telegraph leads the shift by the style's time` (neutral 650–850, cruel none);
  - `a level, held beat reports hold; a tilted one does not`.
- Shots: face up (sprite, then with `over`), face down (`human_chair` with her legs, `footrest`), a telegraph, a crack, low strength.
- *As built (Task 16):* `src/ui/scene/instruments/weight/weight.ts` (registered by `instruments/index.ts`), `weight/vial.ts` (the level's markup, ids prefixed `alius-weight-`), `css/68-weight.css`, `weight/fidelity.json` (every listed function token for token; 18 declared differences, each with its reason; `STYLES` by value; `LINES` against the `cardVoice` rows). `weightMatches` reads the physics by field (hold + capacity) and takes a second physics only when it is `passive` (breath's `between_thighs` pair stays the card's). The room view is the scene itself (the box is clear until her view fades in); face down draws P10c's floor (`floorOf`, new in `src/engine/backdrops.ts`) with her legs only where the contact carries `legs: 'hang'`, face up the ceiling and the scene's sprite from below (or the art slot `over` with its fit; a failing picture falls back to the sprite); no floor or ceiling art, or none loads: the scene's backdrop. Her shifts are the plan's (`shift` beats), each landing at its beat + 30 ms with the plan's cost and telegraphed `STYLES[].tele` before (cruel none); playful's feints (35 %) are told between two planned shifts, never instead of one; her attention is the plan's per beat; her heavier lean is `run.pressure` (her `heavy` line, or a model-worded `press` cue, when it rises). Reports: per beat as it ends (or 300 ms before the segment's end) a `hold` when held and level (`|err| ≤ 0.18`) and an `uneven` with the beat's mean `1.2·max(0, |err| − tol/2)`; the commander's own shift (`shift_weight`) at once (Shift, or the right button; while typing only the right button; 2.6 s cooldown). Whether she felt it is the engine's (`cheatRoll` at the segment's end), so her `caught` line, press and heavier lean follow `run.tally.cheatsCaught`. Her `longer` line is said on the first slip of a segment (the engine extends once per segment with a slip). Her lines (ruling Q): `cardVoice` `weight.*` by style, her first words `weight.entry.<contact>` (a new static pattern, card-voice.md §8); ritual's side words are her `announce` row's second and third lines. T is P15a's tap (weight.html has none; the card's TAP stays reachable). Ruling B: `startWeight(env, run, { host, core: true })` draws only the level, her lines, the cracks and the strain into the host given (no views), and `weightFrame()` gives the outer frame the tilt, tremble and sag. The end is the engine's: `finish` plays the exit (2.6 s): her fall line on a collapse or a broken limit, `released` at the commander's limit, else her verdict. Layout fixture `weighthold` (the pill and the input on top mid-weight, her lines and the level in the frame, the stop word ends the hold and puts the input and the reply back); shots `npm run shots -- weight` (fixtures `weight`, `weightfoot`, `weightup`; the `over` moment uses the run-time raster of the fixture's sprite). *Fix round 1:* **Ruling S** (the prototype overrules R17's "level"): every held beat reports `hold`; a tilt reaches the engine only as drain, through `uneven` with its amount, and a held beat that ended off level carries `part: 'tilted'` on that `uneven`, which the engine's shift rule (`evenBefore`) reads as uneven; a tilt is never a slip, and the instrument's slips are the engine's. A planned shift lands as its beat's end is judged (`(b+1)·BEAT + 30`; the last beat's at the flush) and is judged by the engine's rule (held and level on its beat and the one before), so a clean landing on screen is never charged and a hard one always is (review I2); a telegraph that comes due late is shortened so its shift still lands on time. The prototype's grace is ported (review I3): a beat that ends before the loop's first beat is over (the entry's) is reported held and level. **Ruling R:** cold is silent on every `weight.*` kind and her first words (empty `cold` rows; `weight.entry.<contact>` is read by her style too); other styles with no rows take neutral's. Her end line follows the engine (review I5, ruling Q): `released` when she answered a tap (`physicsSignal`'s rule) or the engine's strength at the end (its own `resolveSegment` of the inputs sent, or its last gauge) is at or below her `holdsUntil`'s `releaseAt`, else her verdict with the engine's tally of slips (`PhysicsEnd.tally`, carried by the staging's outcome). Ruling B for Tasks 24/24b: `startWeight(env, coreRun(run, 'second'), { host, core: true })` (the weight's own view, also to every `update`) returns a `WeightCoreRun`; in the core its own keys and room tone are off by default (`keys`, `roomTone`), and the outer instrument forwards the commander's acts (`hold`, `shift`, `balance`) and reads `weightFrame()`. *Fix round 2:* `OWNS.hold` gains `uneven` (a pair routes it to its weight: R16 and Ruling S hold in pairs and in the core); a hold broken in a beat's last frame is that beat's slip; no slip is shown after the flush; an answered tap that did not end the run is no release later; with no tally her verdict counts no slips; the core's end reads the pair's steady beats (`WeightOpts.steady`, from the outer instrument).


**Chunk e5 closed (2026-11-25).** Tasks 15–16 by one implementer, one review of the chunk, two fix rounds, re-review clean. Rulings:
- **S:** the instrument reports `hold` on every held beat; a tilt reaches the engine only through `uneven` (`part: 'tilted'` for the shift rule), so a tilted beat is drain, never a slip (the prototype overrules R17's "level" condition);
- **R** (every instrument): a style the prototype has no lines for takes neutral's lines; cold is silent, her first words included.

Also settled: a shift that lands clean on screen is not charged (the report follows the engine's judging); the entry's grace reaches the engine; her end line follows the engine's release (`PhysicsEnd.tally`); a pair routes `uneven` to its weight (`OWNS.hold`).

For Tasks 24 / 24b (Ruling B): mount the core with `startWeight(env, coreRun(run, 'second'), { host, core: true, steady })`; in the core its own keys and room tone are off, and the outer instrument forwards the commander's acts through `hold`, `shift` and `balance`. Take the segment length from the main run, not the weight's 30 s.

For the author (e12): her caught line comes up to 30 s late (the engine decides a catch at the segment's end); a catch at the final segment is never voiced; `standing_on` faces up although its `implies` puts the receiver `lying_front`; her first words are keyed `weight.entry.<contact>`. Deferred minors: T has no feedback of its own and sets the tap flag even when refused; the two clocks.

---

## Chunk e6: scent (`saturation.html`)

**Memory check (e6):** a lie she caught is remembered (R20: `memoryRules` `scent_lie_caught`, a resolver, audience her, importance 2, no spread, `hiddenFromCommander: false`). Her question, a right answer and her orders are bookkeeping. The stimulus stages are P15a's (`stimulus_stage_changed`, already remembered).

### Task 17: Scent's engine: the head as the gauge, her band, her question

**Files:**
- Modify:
  - `src/engine/physics/state.ts` (`inhale`)
  - `src/engine/physics/segment.ts` (R18; `resolveEnvOf` reads `scentBand(state, reg, holderId, part)`, R19)
  - `src/engine/actions/physics.ts` (`physics/answer`)
  - `src/engine/memory/resolvers.ts`, `content/core/memoryRules.json` (`scent_lie_caught`)
  - `src/engine/physics/stimuli.ts` (`headCapacity(tolerance) = 6 + tolerance / 12`, exported)
- Test: `tests/engine/physics/scentInputs.test.ts`, `tests/engine/memory/scentLie.test.ts`

**Interfaces:**
- Produces:
  - `headCapacity(tolerance: number): number`
  - the action `physics/answer { runId: string; right: boolean; lie: boolean; caught: boolean }`, which emits `scent_answer { runId, holderId, right, lie, caught }` and, when `lie && caught`, `scent_lie_caught { holderId }`

- [x] **Step 1:** Tests:
  - `inhale replaces the passive fill`: two `inhale` inputs of 3 and 2 words at capacity 10 fill 50; a segment with none fills as today.
  - `a mouth breath with amount blows words out` (−amount × 100 / capacity).
  - `the band is hers`, not `'noticeable'`: a holder at band `strong` fills × 1.5 by the passive rule. **This changes resolution for real holders.** If a seeded physics test moves, stop and report.
  - `a caught lie is remembered once`, with audience her; a lie not caught writes nothing.
- [x] **Steps 2–5** as Task 13 (`feat(P10e-e): scent's head, her band, her question`).

*As built:* `headCapacity` is the prototype's `6 + Math.round(tolerance / 12)` (saturation.html `capacity`: a whole number of words; the plan's `tolerance / 12` unrounded, the prototype wins). One word is `run.capacity / head` of the gauge (100 / head at endurance 0: a full head is a full gauge at any endurance). `ResolveEnv.head` is `headCapacity(scentToleranceOf(...))`, the commander's tolerance for the first breathed (non-taste) kind of hers exposed, else the starting one. The band is `scentBand` of the contact's target (`contactTargetOf`, else `run.targetId`; an item has none: her rest). `inhale` joins `INPUT_KINDS` and the decision interaction's `OWNS`. `physics/answer` refuses a stale run, a caught truth and a run with no decision physics; `scent_answer` / `scent_lie_caught` join the memory event list. No seeded test, golden or `tests/sim/*` moved (full suite 718 files green). Memory verdict (review M6): `scent_lie_caught` writes one fact of hers (audience her, importance 2, no spread, not hidden); it reaches her prompts as any fact of hers through the memory provider (`group: 'memory'`); it is not a relation event, so no journal line, and no chronicle line. `scent_answer` is bookkeeping. *Fix round 1 (Ruling U):* a new input `scatter` (amount = words that left the head without the mouth: a cough, the overflow's recovery, an answer) lowers the fill by `amount × capacity / head`, no relief, owned by the decision interaction; a run the instrument reported (`run.headed`, set by a decision segment with an `inhale`) is never ended by its fill (*fix round 2*, Ruling U upheld: `releaseOf` answers `continue` before any gauge check, so neither a full head nor her 15 % / 5 % thresholds end it; the hold ends by the tap, the stop word, the contact or item taken away, or her activity's duration, and the instrument's end line follows that outcome); the second physics' view drops `headed` (`withoutLeak`). No seeded test moved.

### Task 18: The scent instrument

**Files:** create `src/ui/scene/instruments/scent/scent.ts`, `scent/words.ts` (the vocabulary: `SCENT`, `STAGE_W`, `BAND_W`, `PLACE_W`, `HER_PLACE`, all of it as the prototype has it), `scent/question.ts`, `css/69-scent.css`; register (matches `interaction: 'decision'` with `gauge.kind: 'fill'`).

**Interfaces:**
- Consumes:
  - `occlusionOf` (`feet_on_face` → `gap`, `face_to_bottom` → `seat`, `smothered_armpit` → `wedge`), `kit/dark`;
  - her scent and band (`scentBand`, her profile's scent words through `Knowledge`), the stage and tolerance (`stimuli.ts`), `headCapacity`;
  - her style's orders and her rule (`STYLES` of the prototype as the instrument's table);
  - `breath-in-out.mp3` (the `natural` mode, paulstretch for longer breaths).
- Reports:
  - per beat `{ beat, kind: 'inhale', amount: words left this beat }`;
  - `{ beat, kind: 'mouth_breath', amount: words blown }`;
  - `physics/answer` after her question;
  - P15a's `physics/stimulus` for the deep inhale, as the card does today.
- Ports: `zonesOf`, `intensityAt`, `BASE_I`, `STAGE_PULL`, the face and its smoothing, the breath in and the reflex, `#arc`, `addWord` / `breathWords` / `tickWords`, `AMBIENT_MS`, the mouth, the need to breathe (7 s), her orders, `askWords` / `buildPills` / `sayables` / `judge` / `answerWords`, `spawnMotes` / `drawStreams`, `COLORS`, saturation as the picture, `tint`, `recInhale` / `recExhale` / `recMouthTick` / `paul`.
- Tests:
  - `intensityAt` at her strongest place and far from it (the prototype's Gaussian of 0.13 H plus `BASE_I`);
  - `the head holds 6 + tolerance/12 words` and overflows into "lost in her";
  - `a breath of depth .3 leaves 1 word, a deep one near her strongest place 3`;
  - `judge` per rule (`any`, `warm`, `admit`, `bad_and_want`, `place_and_band`, `band_and_honest`) on a fixed head;
  - `the mouth word interval is 420 ms`.
- Shots: entry, motes and threads on a breath, a full head (saturated picture), her named place, her question with pills, lost in her.

*As built:* `scent.ts` (the instrument, `_scent` the tests' and the shots' hook), `question.ts` (`askWords`, `sayables`, `buildPills`, `isCat`, `judge`, `answerWords`), `words.ts` (every table, equal to the prototype's), `css/69-scent.css`; `fidelity.json` lists what is ported and declares each difference. Matches a decision physics with a fill gauge under a shape the prototype draws (`occlusionOf` kind `gap`, `seat` or `wedge`), alone or with a passive second: `feet_on_face` (with her activity). **Pairs refused:** `smothered_armpit` and `face_to_bottom` run breath as the main physics and saturation as the second; saturation.html has no openings of her rhythm (the breath gauge would only drain), so the card draws them, as breath refuses them. `scent_gag` (an item, no shape of hers) is the card's too. Her lines are `cardVoice` `scent.*` (card-voice.md §9: by style for the mouth, her verdict and her ask; `scent.entry.<contact>`, `scent.here.<contact>` and `scent.miss.*` for what `judge` finds missing; cold silent), held in the prototype's `LINES` shape so the functions stay as written. Reports: each beat of a running segment, `inhale` with the words the head gained over what the engine holds, `mouth_breath` with the words blown out; her `mouth` line follows the engine's catch (`tally.cheatsCaught`); `physics/answer` through a new optional `staging.answer` (at once, or for a lie once the body coughed it out or kept it two breaths); P15a's `physics/stimulus` for a breath deeper than 0.7 and for a cough, its depth placed in `inhaleZone` as the body answered. Her scent's colour and words are the stand-in `sweat` (her profile has no scent words yet: P17d). Her orders and her question keep the prototype's own timing on the xorshift (the engine plans none for a decision physics). Glossary `scent_answer` (the pills). Layout fixtures `scent` / `scenthold`; `npm run shots -- saturation`. *Fix round 1:* each beat also reports `scatter` (the head is the gauge both ways, capped at the capacity); the body's own breaths (the need to breathe, the overflow) and a cough on one send no `physics/stimulus` (not the commander's seeking; *fix round 2:* the cough clears the body's flag, so the commander's next deep breath is reported); the stand-in `sweat` shows only while a sweat kind of hers passes the content gate, else `DRY_SCENT` (leather for her feet, soap for the rest: an open item for the author with P17d); a second lie answered while one is open sends the first as kept.


**Chunk e6 closed (2026-11-26).** Tasks 17–18 by one implementer, one review of the chunk, two fix rounds (a container restart in round 1 lost no work), re-review clean. Her band is hers: no seeded test moved (`feet_on_face` fills as `strong`, `face_to_bottom` and `scent_gag` as `faint`, `smothered_armpit` stays `noticeable`). Rulings:
- **U:** the engine's gauge follows the head: `scatter` lowers the fill by the words lost without the mouth (a cough, the overflow's recovery, an answer); a headed run never ends on its fill (no full-head end, no 15 % / 5 % thresholds), only by the tap, the stop word, the contact taken away or her activity's duration;
- **T:** her taunts "you like that, don't you." and "and you want it. say it." ship verbatim as her claim in her own voice (P15 §16.1 bans the engine telling what the commander feels, not her saying it).

Also settled: the body's own breaths (the need to breathe, the overflow) send no `physics/stimulus`; the stand-in `sweat` shows only while a sweat kind of hers passes the content gate, else the prototype's `leather` (feet) or `soap`; pairs with breath as the main physics still draw the card.

For the author (e12): Ruling T; the fallback scents; her profile has no scent words (the prototype's stand-in is used); with no activity second a scent hold lasts until the stop word, the tap or a blocking change (a blackout holder under `breath_play` ignores taps), so a stand-in for the prototype's fixed length would need a ruling; a lie still open at the run's end is never recorded.

---

## Chunk e7: the jaw (`jaw.html`)

**Memory check (e7):** nothing new. The teeth are a slip (bookkeeping, R22). A rest refused is P15a's gesture.

### Task 19: The jaw's engine: the cost of the opening and her orders

**Files:**
- Modify:
  - `src/engine/physics/state.ts` (`bite`; `PlannedBeat.order?: 'deeper' | 'suck' | 'wider' | 'pull_back'`)
  - `src/engine/physics/segment.ts` (R21; the gesture plan by hash, R3; a `bite` with `part: 'teeth'` is a slip)
  - `src/engine/blocking/types.ts` (`CUE_KINDS` + `deeper`, `suck`, `wider`, `pull_back`), `content/core/physicsCues.json`
  - `src/engine/tuning.ts` (`physics.jawRestMs` = `jaw.html`'s `REST_MS`; `physics.jawOrders`: the share of beats with an order, by style, from the prototype)
- Test: `tests/engine/physics/jawInputs.test.ts`

- [x] **Step 1:** Tests:
  - `bite replaces the flat cost`: amounts .33 and 1 over two beats cost `8 × 1.33`;
  - `a teeth bite is a slip`;
  - `orders are planned by hash`: the same run and segment give the same orders; `state.rng` is unchanged by planning a jaw segment (compare before/after);
  - `no bite: +8 a beat as today`.
- [x] **Steps 2–5** as Task 13 (`feat(P10e-e): the jaw's cost and her orders`).
  - *As built:* `bite` joins `INPUT_KINDS` and the gesture's `OWNS`. A gesture segment that holds any `bite` but the teeth costs `jaw.per × amount` on each beat (a beat with none costs nothing: the instrument reports one a beat; absent amount: 1); a `bite` with `part: 'teeth'` is a slip and no cost (deduplicated apart from the beat's cost: two inputs on one beat). The tally names gesture slips as `the teeth touched her N times`. Her moves are planned in real time only (the turn-based card is unchanged) by `fnv1a(<salt>|<runId>|<segment>|<beat>|jaw|<key>)`, after every draw of `planSegment` (no draw added or moved; a clinical holder's jaw segment draws nothing at all). **The prototype wins over "the share of beats":** `TUNING.physics.jawOrders` holds the prototype's schedule (`firstMs` 3000, `STYLES[].every` and `.ask` by style, `other` = neutral's, the toes' 32 / 18 / 25 / 25 %, `suck` 4–7 s, `wider` 3–5 s): a move, then the next after her `every` seconds plus the order's length, as `herMove`'s `nextMove`. `PlannedBeat` carries `order` (cue of the same kind), `orderMs` (the length of a `suck` / `wider`) and `ask` (her question through the ring: no cue; ring = an item source, read by `sourceKind`). New cue kinds `deeper`, `suck`, `wider`, `pull_back` with `physicsCues` rows limited to the jaw (the prototype's lines that fit any holder), and the cue call words them as spoken orders. `jawRestMs` 4200. No seeded test or golden moved. Memory: nothing (a teeth slip is `physics_slip`, bookkeeping).

### Task 20: The jaw instrument

**Files:** create `src/ui/scene/instruments/jaw/jaw.ts`, `jaw/speech.ts` (the opening's distortion of letters), `css/70-jaw.css`; register (matches `interaction: 'gesture'`).

**Interfaces:**
- Consumes: the plan's `order`s, the source (`sole_to_mouth`: her toes; `worn.mouth` `ring_gag`: the ring, read by field), the commander's endurance skill (capacity), `jawRestMs`.
- Reports:
  - per beat `{ beat, kind: 'bite', amount: mean cost factor }`;
  - a touch of the teeth as `{ beat, kind: 'bite', part: 'teeth' }` (at most one word of hers every 7 s);
  - `ask_rest` for a rest (Shift or the right button).
  - The line sent is the heard line (`speech.ts`); the clear share goes into the instrument's summary only.
- Ports: the input field as the mouth (its frame opening with the jaw, her band as a ghost frame, the hinges burning, the drool, the letters smearing from fatigue 70), the mouse's height as the jaw with the fatigue spring, the tremor and the closing twitches, her toes (dips, pushes, pulls back, "suck.", "wider." never past 0.9), the ring's per-letter articulation (lips fail first, then the tongue's tip, then its back), her asking while she wants it wide, the rest.
- Tests:
  - `cost` of the prototype at rest on her toes = ⅓, wide open = the maximum;
  - `speech` of `"please"` at an opening of .9 with the ring gives the prototype's distorted form (a table of three cases copied from running the prototype's function);
  - `wider. never asks past 0.9`.
- Shots: her toes (resting, a dip, "suck."), the ring gag (wide, a distorted line), fatigue 70, a rest.
- *As built (Task 20):* `src/ui/scene/instruments/jaw/jaw.ts` (registered by `instruments/index.ts`), `jaw/speech.ts` (`speak` and its tables, the shared xorshift), `css/70-jaw.css`, `jaw/fidelity.json` (every listed function token for token; 10 declared differences, each with its reason; `STYLES`, `CONTACTS` and the numbers by value; `LINES` against the `cardVoice` rows). `jawMatches` reads a gesture physics held open by field (`jawContactOf`: an item worn in the mouth is the ring, a contact on her toes is her toes; `oral_service` stays the card's) and takes a second only when it is `passive`. The mouth is the scene's input line: its height, transform, border and `--ache` through a claim, its centre kept by its margins and lifted only so far as stands it 96 px above the frame's bottom (the prototype's), the hinges, the letters and the rest ring on it, her band's ghost frames beside it. **The prototype wins over the plan:** resting costs `RELAXED` 0.35 (not ⅓). Reports: per beat the mean cost over its frames (`bite`, pointer), a touch of the teeth at once (`bite`, `part: 'teeth'`), a rest as `ask_rest` (one a segment reaches the engine; another waits for the next segment, so her answer is always the engine's). Her moves are the plan's (`order` / `orderMs` / `ask`), played through `herMove` with its draw set to the planned move. The line sent is the heard line: on Enter the field takes what came out before the scene's own Enter sends it (the unmounted path sends the line as typed; a swipe or a regenerate never distorts it again); the clear share stays in `digest()`. Her lines are `cardVoice` `jaw.*` (card-voice.md §10; `jaw.ask` is `question|word`; `jaw.stop` is finish's stop line); cold is silent. Shift typed into the field never asks (only the right button while it has the focus); paste and drop into the field are refused. The fatigue is the engine's gauge at each segment's start; the engine ends the hold. The foot art has no art slot yet: her sprite from below stands in. Layout fixtures `jaw`, `jawring`, `jawhold`; shots `npm run shots -- jaw` (9 moments).

*Fix round 1 (review of e7):* **Ruling V:** in an instrument segment (one that reported a `bite`) `ask_rest` no longer cuts the segment short. A granted rest takes `jawRest` off as a share of the gauge where it was asked (never below 0 there, as on the screen); a refused one changes nothing; the engine reads one rest a segment, and the instrument drops another at once with a visible cue (the rest ring flashes), never asking it later. The instrument's fatigue after a rest agrees with the engine's gauge. Turn-based play keeps R23 as it was. A beat the instrument did not report (a hidden tab) costs the flat rate, as breath's missed opening and weight's missing hold cost. Her moves are planned only for her toes and the ring (`jawSourceOf`, shared with the instrument; `oral_service` gets none). A style the prototype lacks takes its row by cues, or neutral's (`jawRowOf`, shared), so only cruel and vindictive refuse a rest. The reply block is lifted clear of the mouth's widest reach by a claim (layout-tested resting and wide open). Text already in the field at the mount, or written by an input method, comes out of the mouth too. With a ring in a real-time jaw the scene directive says what comes out clearly is understood. No seeded test or golden moved.

**For the author (e12, chunk e7):** the jaw's foot art has no art slot (`sole_close` is a candidate; her sprite from below stands in); the ring's size is the prototype's 0.55 (no item field); Ruling V (the rest in real time) replaces R23's truncation for instrument segments; cold's silent question still counts as asked (UI only); her spacing restarts at each segment (the first move 3 s in); the digest (`digest()`) is shown nowhere yet.


**Chunk e7 closed (2026-11-26).** Tasks 19–20 by one implementer, one review of the chunk, two fix rounds, re-review clean. Rulings:
- **V:** in an instrument segment (one that reported a `bite`) `ask_rest` does not cut the segment short: a granted rest takes the prototype's 30 off at its beat, a refused one changes nothing, a second rest in the segment or one asked in its last 800 ms is dropped with a visible cue and never asked later; turn-based play and the real-time card keep R23.

Also settled: the reply block is lifted clear of the open mouth through a claim (layout-checked at rest and wide open); text already in the field, IME text and text at Enter go through the mouth; her moves are planned only for her toes and the ring (`jawSourceOf`); the ring's directive says clear speech is understood only while the jaw is drawn, and "cannot be understood" on every card path; where the prototype beat the plan: `jawOrders` is `jaw.html`'s own schedule, `RELAXED` is 0.35.

---

## Chunk e8: her activity, the frame of her time, with stillness (`her_activity.html`)

**Memory check (e8):**
- `forgotten_end` and `found_posed` are new and remembered (R28; Task 23).
- A caught relief or fidget is `physics_caught` (already remembered); a buckle in the weight inside is `physics_slip` (bookkeeping).
- Her presence is never stored.
- The script's lines are not facts. A mention of the commander to someone else is a fact only through P15's existing knowledge path (`witness` / suspicion), which the engine applies when it checks the mention (R26). No new rule.

### Task 21: The frame's engine: start from the blocking, the marathon, her presence, the body's inputs

**Files:**
- Modify:
  - `content/core/blockingActivities.json` and its schema (`frame?: { absorb, hear, light: 'lamp' | 'screen' | 'dark', unit, total, per: [number, number], legs, hours?: number, call?: true, visitor?: true, sleep?: true, music?: true, drink?: true }`, the twelve rows from `ACTS`; the marks, sounds and self-talk stay the instrument's data)
  - `src/engine/physics/state.ts` (`sourceKind` + `'activity'`; `INPUT_KINDS` + `relieve`, `fidget`)
  - `src/engine/physics/run.ts` (the after-change hook starts `her_activity` by R24; a contact that names `her_activity` keeps working as today)
  - `src/engine/physics/segment.ts` (`relieve` / `fidget`: `amount` is the loudness; the noise `loudness × hear × (1 − cover)` added to `segmentNoise`; a relief is P15a's relief, so `cheatRoll` decides if she noticed)
  - create `src/engine/physics/presence.ts`
- Test: `tests/engine/physics/frame.test.ts`, `tests/engine/physics/presence.test.ts`

**Interfaces:**
- Produces:
  - `presenceOf(state: CampaignState, reg: Registries, run: PhysicsRun, phase: number): 'with' | 'glancing' | 'own' | 'use'` — the prototype's `baseScore` / `stepOf` with `absorb` per phase, `dynamicHash(state, holderId, 'presence:' + runId)` for the session's hash, Regard as a tone term (R25)
  - `frameOf(entry): ActivityFrame | null`

- [x] **Step 1:** Tests:
  - `her frame starts from the blocking`: she `reading_book`, the commander kneeling by her (a posture she set) → `physics_started { physicsId: 'her_activity', sourceKind: 'activity' }` and a marathon with `hours` (or `'unknown'`). An activity without `frame` starts nothing. A scene without the blocking live starts nothing.
  - `a contact that names her_activity starts as today` (the existing tests).
  - `presence` is deterministic for the same run and phase; a `cruel` holder at `none` Regard in `possessing` reads `use`; an `affectionate` talkative one reads `with`.
  - `presence` never appears in an event, a directive or a reading: the sentinel test of `tests/fixtures/analyze/hidden.ts` gains `presence` words as sentinels for the analyze panels.
  - `a loud relief is noise; one covered by her speech is not`.
  - `no rng without eligibility`: a scene with no framed activity draws exactly as before (the `unaffected` goldens).
- [x] **Steps 2–5** as Task 13 (`feat(P10e-e): her frame starts from the blocking; her presence`).
  - *As built:* the twelve `ACTS` rows are `frame` on their `blockingActivities` (schema `ActivityFrame`; `on_comms` has `hours: 1`, the rest none: `'unknown'`). `run.ts`: the after-change hook starts the frame on a change of `activity`, `anchor`, `posture` or `contact` when a present soldier's activity has a frame and the commander is placed by her (`placedBy`: an anchor relative to her, a contact between them, or the commander's posture last set by a reading or the engine, never the player's chip), the physics read by field (`framePhysicsOf`: the passive physics with a progress gauge); `sourceKind: 'activity'`, `sourceId` her activity; a commander's contact with her whose physics is a hold runs as the frame's `second` (the weight inside, R27), any other contact physics runs as its own contact run as before (the frame does not take it); the frame ends when her activity changes (her activity is never taken away when the frame ends) and drops its second when the contact goes. `presence.ts`: `presenceOf` / `presenceScore` / `stepOf` / `frameOf`, the prototype's weights; Regard (by band rank), the hold (by band index) and `dynamicHash` come through `registerPresenceTerms` (the dynamic registers it in `installDynamicHooks`: the lower layer imports nothing of the dynamic; without it a neutral Regard, `keeping` and the salt-0 hash); mood from her stress band (strained or breaking: `irritated`); the drift is `absorb` plus a hashed ±0.15 per phase. Her attention in a frame run mixes her activity's word and her presence 0.4 / 0.6 with her style's watch bias (`attentionPlan`'s new `weights`; one draw a beat as before). `relieve` / `fidget` (passive): P15a reliefs (`cheatRoll`), and a noise of `amount × hear × (1 − cover)`; `SegmentInput.cover` is new (the instrument's `coverNow`, 0–1; absent 0); a sound under `TUNING.physics.frameQuiet` (0.2) is no noise. No seeded test or golden moved.

### Task 22: The script: one call per phase

**Files:**
- Create: `src/llm/calls/activityScript.ts`
- Modify:
  - `src/llm/sites.ts` (`declare('physics.script', 'activity_script', 'scene', 'none', 'quiet', 'Her hour')`)
  - `src/blocking/controller.ts` (ask at each phase boundary; keep the script in memory keyed `sceneId|runId|phase`; dropped on chat switch)
  - `src/engine/physics/mention.ts` (create: the engine's check of a mention)
- Test: `tests/llm/activityScript.test.ts`, `tests/engine/physics/mention.test.ts`

**Interfaces:**
- Produces:
  - the call's input `{ unitId, name, card ≤ 600 chars, activity, phase, hours, presence: never sent, style, known: string[] (through Knowledge: the real reports, the last run, a unit's wound, the commander's decision), listeners: Array<{ id, name, knows: 'none' | 'suspects' | 'knows' }> }`;
  - the validated output `Array<{ at: number; who: 'her' | 'other'; to: 'self' | 'other' | 'commander'; text: string ≤ 160; covers: boolean; ask?: true; mention?: { to: string; plain: string; veiled: string } }>`;
  - `mentionText(state, reg, holderId, listenerId, mention, tactic?: 'reckless'): string | null` (plain if the listener knows or the relation is public enough, P9d; plain anyway with `reckless`; veiled or `null` otherwise).
- [x] **Step 1:** Tests:
  - the sanitizer drops a line with a pronoun for the commander;
  - `at` is clamped to the phase;
  - a mention to a listener who knows is plain, to one who does not is veiled, unsaid without a veiled form;
  - the call is made through `app.generations` only (the architecture test);
  - a failed call leaves the cue pool's placeholder lines.
- [x] **Steps 2–5** as Task 13 (`feat(P10e-e): her hour's script`).
  - *As built:* `activity_script` (mechanic, JSON, budget 900) at the quiet scene site `physics.script` ("Her hour", not rerollable). The staging controller binds it and asks once per phase of a frame run: on its `physics_started` (phase 1) and on each `marathon_phase` that starts a phase; the validated script is kept by `sceneId|runId|phase` and read through `staging.script(phase?)`; a failed call stores nothing (her placeholder lines play), and `reset` (chat switch) drops every script. The input is built through `Knowledge` (the facts the commander may know that are about her or known by her, the six newest, and who is injured), her presence is never in it; listeners: `oversight` on a call, the first active named unit outside the scene for a visitor (what each knows by `listenerKnows`). `sanitizeScript`: the shape `{ at, who, to, text, covers, ask?, mention? }` (and 24b's fields, validated here already), `at` clamped to the phase, text cleaned and cut at 160, a line that says "he" of anyone or an `about` line with any third-person pronoun dropped (her words about other women keep theirs), a mention only to a listener of the phase, at most 24 lines, sorted. `src/engine/physics/mention.ts`: `listenerKnows` (P15's `state.dynamic.knowledge` levels, read from the state) and `mentionText` (plain when the listener knows or her relation is `public`, plain anyway with `reckless`, the veiled form, else `null`).

### Task 23: The forgotten end, being found, the digest

**Files:**
- Modify:
  - `src/engine/physics/run.ts` (in `use`, the last phase ends `forgotten`: `forgotten_end { runId, holderId }`, the commander stays posed; a new action `physics/get_up { runId }` ends it, a disobedience when she said stay: her offence `hold_defied`, existing)
  - `src/engine/actions/physics.ts` (`physics/found { runId, finderId }`, dispatched when a visitor of the frame enters, emits `found_posed`)
  - `src/engine/memory/resolvers.ts`, `content/core/memoryRules.json` (`forgotten_end`, `found_posed`, R28)
  - `src/blocking/physicsDirectives.ts` (the frame's tally sentence)
- Test: `tests/engine/physics/forgotten.test.ts`, `tests/engine/memory/framed.test.ts`

- [x] **Step 1:** Tests:
  - `in use the end is forgotten and the commander stays posed`;
  - `get_up after "stay" is her offence hold_defied`;
  - `found_posed is remembered by the finder and spreads as a squad rumor`;
  - `forgotten_end is a fact of hers only`;
  - `the digest sentence carries no uncaught relief`.
- [x] **Steps 2–5** as Task 13 (`feat(P10e-e): the forgotten end, being found, her hour's digest`).
  - *As built:* at the last phase boundary of a frame run whose presence there is `use`, the run is marked `forgotten` (held, nothing planned: `nextSegment` refuses and the staging controller waits) and `forgotten_end { runId, holderId }` is emitted instead of the release; the commander's blocking is untouched. `physics/get_up { runId }` (only after a forgotten end) emits `physics_got_up { stayed: true }` and ends the frame (released); her practices read it as `hold_defied` (major, through `offencesFromEvents`: this layer imports nothing of them). `physics/found { runId, finderId }` (another named soldier) emits `found_posed` and ends the frame. The stop word ends it at once. Staging: `getUp()`, `found(finderId)`. **Memory:** `memoryRules` `forgotten_end` (about and audience her, importance 2, no spread) and `found_posed` (about her, audience the finder, importance 3, spread `slow`: a squad rumor, not hidden from the commander), each with its resolver; their texts reach prompts as remembered facts (the `memory` group) and nothing else (no journal delta, no chronicle line). The directive: the passive tally says only `cheatsCaught` (`she noticed the commander move N times`), her frame's end reads "She is done with her own time…", and the live `physics:` directive of a frame never says "a relief taken" (only a caught one, through the tally).

### Task 24: The frame instrument with stillness inside

**Files:** create `src/ui/scene/instruments/activity/frame.ts` (the frame), `activity/stillness.ts`, `activity/acts.ts` (the marks, sounds and self-talk of `ACTS`), `activity/views.ts`, `css/71-activity.css`; register (matches `physicsId`'s entry with `interaction: 'passive'` and `gauge.kind: 'progress'`, read by field).

**Interfaces:**
- Consumes:
  - `presenceOf`, the script (from the controller), `mentionText`;
  - the art slots `legs_seated.rest` / `.foot_raised` and `feet_floor`, `frame_under_desk` and `pov_corner` (P10c backdrops);
  - `run.second` (weight inside: Task 16's instrument runs within the frame, with an end of three buckles; rests only for a commander who was bearing her).
- Reports:
  - `relieve` (a click on an urge: amount its loudness), `fidget` (amount .28);
  - `physics/skip { strategy }` between phases;
  - the answer to her question as a typed line;
  - `physics/get_up`, `physics/found`.
- Ports:
  - `VIEWS` (`her`, `legs` with `planted` / `crossed`, `floor`, `wall`);
  - her presence's effects, `moveAttention` / `updateUrges`, restlessness (ripples from 350 px/s, fidgets above 450 px/s), `bodyNoise`;
  - `say` / `placeFree` (lines cut at about 40 characters, never overlapping), `coverNow`, `callHeard` / `visitorHeard`;
  - `runScript`, `planPeaks` (`falseAlarm`, `incomingCall`, `visitorPeak`, `leaveRoom`), `BASE_EVENTS`;
  - `startSkip` / `resolveSkip` (the engine's numbers), `finish`, the sounds of every activity.
  - The body's timers wait outside the played phase (the fix of 2026-11-24).
- Tests:
  - `the attention follows the mouse with the prototype's lag and an urge above .3 pulls it`;
  - `an itch fades after .5 s of attention on her`;
  - `a fast move ripples, a sustained fast move fidgets` (350 / 450 px/s, 1.5 s apart);
  - `answering her self-talk is a breach; silence to a line to the commander is a slip`;
  - `the body's timers do not fire after a skip`;
  - `the lines never overlap and stay inside the frame` (`placeFree` on 6 lines).
- Shots: the four views, under the desk with `legs_seated` and with the silhouettes, a call (her foot on the shoulder), a skip between phases, the forgotten end.
- [x] *As built (Task 24):* `src/ui/scene/instruments/activity/frame.ts` (registered after the jaw), `activity/acts.ts` (the marks, sounds and ends of `ACTS`, `VIEWS`, `BASE_EVENTS`, the sound files and groups), `css/71-activity.css`, `activity/fidelity.json` (65 functions of her_activity.html, 29 with declared differences, each with its reason; `VIEWS`, `BASE_EVENTS`, `GROUPS` by value; `STYLES` against `cardVoice` `activity.*`). Matches a passive physics with a progress gauge from a framed activity (read by field), with a weight second only (Ruling B: the weight core mounts in the footrest view and the frame tilts by `weightFrame()`). The view is read from the blocking by field (a `frame` backdrop of the commander's anchor: under the desk; a `pose_shot` `feet_floor`: the floor; a `place` backdrop of the commander's activity: the wall, so `facing_wall` gained the `pov_corner` backdrop effect; else her; an item on the eyes: blind). Her presence is the engine's per phase, her attention the plan's; the body's reliefs and fidgets are reported (`relieve` / `fidget`, loudness and `cover`, pointer: ruling O) and her tell and answer follow the engine's catch (`tally.cheatsCaught`); third parties hear by the prototype's thresholds. Her lines are `cardVoice` `activity.*` by style (card-voice.md §11; her name for the commander `activity.name`); her script is the model's (`staging.script`), without it she says nothing of her own (the placeholders are not shipped); mentions go through `mentionText`. Phases follow the engine's marathon (`waiting` → the hours between phases; `physics/skip` and its summary), the end the engine's outcome or `forgotten` (GET UP → `physics/get_up`; the finder after 25–40 s → `physics/found` with a real unit outside the scene). Peaks, urges and marks keep the prototype's timing on a xorshift seeded by the scene and the run (no rng). The controls between phases and GET UP are in the moment layer (`data-analyze` glossary `activity_endure|spare|cheat|rest|get_up`); GET UP sits above the scene's reply (34 % from the bottom: the prototype's 112 px is under its one-line reply). Layout fixtures `activity` / `activityhold` (the pill on top and ending the hold, in play and at the forgotten end); shots `npm run shots -- her_activity` (8 moments). Not ported: the legs variant `crossed`, the panel and the summary card (the digest is the engine's directive), the service (e9).


### Task 24b: The throne (`throne.html`)

The throne is the weight inside her activity's frame, at any of her activities, with the throne layer. Its README section is the spec. Port the block `THE THRONE` of `docs/prototypes/throne.html` and its marked edits; the frame and the weight come from Task 24 and Task 16 (their own prototypes).

**Files:**
- Create: `src/ui/scene/instruments/activity/throne.ts`, `css/71-activity.css` (the throne's rules)
- Modify:
  - `src/engine/moments/settings.ts`, `src/settings.ts`, `src/ui/shell/sysTab.ts` (`longHoldStrain: 'light' | 'normal' | 'heavy' | 'raw'`, a scene setting mirrored as `marathonPace`; SYS › Scenes "Long holds")
  - `src/engine/physics/segment.ts` (the weight's drain × `LONG_HOLD[longHoldStrain]` only for a run inside a frame: `run.sourceKind === 'activity'` or a `second` of one)
  - `content/core/blockingActivities.json` (`holding_audience` with its `frame`)
  - `src/llm/calls/activityScript.ts` (the lines gain `body?: 'lean' | 'press' | 'laugh' | 'cross' | 'settle' | 'rise'`, `about?: true`, `feet?: true`, `decision?: { kind: 'roster' | 'requisition' | 'punishment'; ref?: string }`; validated; R26)
  - `src/engine/actions/physics.ts` (`physics/decide { runId, kind, ref }`: a decision of the script applied through P15's command capabilities; refused without the `command` domain)
  - `content/core/cardVoice.json` (kinds `throne.spill`, `throne.skid`, `throne.thank`, `throne.thanked`, `throne.noThanks` by style, from `T_LINES`)
  - the `regal` rows of the frame's and the weight's tables (Tasks 16, 24)
- Test: `tests/ui/instruments/throne.test.ts`, `tests/engine/physics/longHold.test.ts`, `tests/engine/physics/decide.test.ts`

**Interfaces:**
- Consumes: Task 24's frame (`presenceOf`, the script, the visitor peaks), Task 16's weight instrument (its state and springs), `ArtSlots.get(unitId, 'legs_astride')`.
- Produces:
  - `LONG_HOLD: Record<LongHoldStrain, number>` = `{ light: 0.25, normal: 0.35, heavy: 0.6, raw: 1 }`
  - the action `physics/decide`, which emits `physics_decided { runId, holderId, kind, ref }`
  - `throne.ts` exports the ported functions with their prototype names (`throneBody`, `wCueShift`, `throneRise`, `throneFlinch`, `throneCup`, `throneCupEnd`, `throneSign`, `throneUpdate`, `throneVisitor`, `throneThank`, `throneArt`, `throneLegs`, `tLegsHang`, `tLegPoints`) and the tables `T_TELE`, `THRONE_VISITS` (as the shape), `T_LINES` (as `cardVoice` rows)

Follow the shape of an instrument task. Its `fidelity.json` lists those functions and tables against `throne.html`, plus the marked edits inside `wPlanShift` (careful), `wUpdate` (the drain), `wLimit` and `finish` (the seat's wording).

- **Tests:**
  - `longHoldStrain` normal scales a framed weight run's drain to 0.35, raw to 1, and a run outside a frame is unchanged (the seeded physics tests and every `unaffected` golden stay put);
  - with her mug the tolerance is 0.12 and her shifts are 0.35 of their size; 0.5 s out of level spills (fake clock);
  - a flinch steadied within 0.8 s is held, otherwise a `jerk` noise;
  - a skid needs 160 ms above 140 px/s;
  - a landing out of level costs 18 × weight;
  - `throneArt` places a picture of her left leg at `x` from the left edge of the screen and its mirror at `x` from the right (the world's inset compensated; the fix of 2026-11-25), and `pair` uses two files without a mirror;
  - `physics/decide` without the `command` domain is refused, and with it changes the commander's roster through P15's capability;
  - the script's `body` / `about` / `feet` / `decision` are validated (an unknown cue is dropped).
- **Shots:** `human_chair` with the silhouettes and with `legs_astride`, a visitor with business (her decision's line), her mug, her signing, her rising, the thanks.
- **Memory check:** as P17g §2.12. `physics_decided` is remembered where its command action writes (no new rule); a spill and a skid are bookkeeping.

---
- [x] *As built (Task 24b):* `longHoldStrain` (`light` .25, `normal` .35, `heavy` .6, `raw` 1: `LONG_HOLD`) is a scene setting mirrored like `marathonPace` (SYS › Scene "Long holds", `data-analyze` `setting:longHoldStrain`, glossary `setting_long_hold_strain`; an old mirror or payload without it reads `normal`); `resolveSegment` scales only the flowing drain of a weight beat (and its uneven share) by `env.longHold`, set by `resolveEnvOf` for a run whose `sourceKind` is `activity` (its second's view carries it too); a slip costs as before (the prototype's `wSlip` is not scaled); the weight core's `S.drain` follows the same factor in a frame. `holding_audience` joins `blockingActivities` (scope dynamic, `frame.audience`; blocking.md §4). `physics/decide { runId, kind, ref? }` (`src/engine/dynamic/decide.ts`, registered by `actions/dynamic`): only in her frame, refused without the `countermand` capability (read by capability), a `roster` decision takes another living soldier off the active roster or puts one back (`roster_changed`), a `requisition` or `punishment` is recorded only; it emits `physics_decided`; no rng; memory: none new. The script's `body` / `about` / `feet` / `decision` were validated in Task 22 (a decision's `ref` is an id, kept as it is). `src/ui/scene/instruments/activity/throne.ts`: the block `THE THRONE` ported (`throneBody`, `wCueShift`, `throneRise`, `throneFlinch`, `throneCup`, `throneCupEnd`, `throneSign`, `throneUpdate`, `throneVisitor`, `throneThank`, `throneArt`, `throneLegs`, `tLegsHang`, `tLegPoints`, `T_TELE`, `T_LEG_FEET`; `T_LINES` as `cardVoice` `throne.*`, §12) on the weight core's state (`weightCore`), the frame's helpers given at its mount (`attachThrone`); the marked edits: `wPlanShift` is the core's `planShift` reading `THRONE.careful` (0.35, 1.5× slower telegraph with her mug), `wUpdate`'s drain the long hold's, `finish`'s seat wording and thanks, `runScript`'s body cues / flinch / boots / decisions, `planPeaks`' visitors and props (the prototype's times on the xorshift: the engine plans none). `wLimit`'s seat wording is not ported (the core has no rest of the frame's). The `regal` rows: the frame's `activity.*.regal` and weight's `weight.slip|heavy|fall` regal (`cardVoice`); weight's `STYLES` table has no `regal` row (its fidelity compares the table to weight.html: a regal holder reads her row by cues, as before). "honour" is written "honor" (US spelling test): `thank.ritual` / `thank.regal` are left out of the lines check. Layout fixtures `throne` / `thronehold`; shots `npm run shots -- throne` (7 moments).


- [x] *Fix round 1 (chunk e8 review; Rulings W, X, Y, Z):*
  - I1: a frame that ended (the stop word, GET UP, being found, her release) is remembered on the scene (`frameDone`: her, her activity, the commander's placement) and does not start again until her activity or the commander's placement changes.
  - Rulings X and Y: a relief or fidget in her frame is `physics/relief` (amount = loud × (1 − cover), part = its visibility or her absence), decided when it is reported by one draw with `p = 1 − (1 − p_seen)(1 − p_heard)` (frame runs only; no draw when nothing could notice it); her tell and answer play at once. The body giving way (the slump, the jerk, the gulp, the itch that wins, the throne's flinch and spill) is `involuntary`: `physics_noticed`, never a caught cheat. `SegmentInput.cover` and `TUNING.physics.frameQuiet` are gone.
  - Ruling W: the weight inside her frame takes the frame's wiring: her weight lines only at `with` / `glancing`, every slip felt (at most every 4 s; three in 6 s gross, heavier), `wLimit` rests by presence and style with the seat wording (`activity.rest`), `wBuckle` (back to 35; three end the session with `activity.fall`), her rise as `W.resting`. Engine side, frame runs only: `ask_rest` with `part: 'up'` (no drain, no slip), `'rest'` (gives back its amount), `'charge'` (a hard landing's 18 × weight); at 0 strength a buckle back to 35 and the third ends the frame (`physics_buckle`, collapse); the weight's release no longer ends the frame.
  - I5: weight `STYLES.regal` (throne.html), declared as an `additions` entry (the fidelity gate learnt `additions` for tables and declared line rows).
  - I6: `physics/decide` applies only `roster`: the soldier is the engine's (a stable hash among the others on the roster), through `roster/set_active`'s own body (`setActiveRoster`, P12's `actOnWarning` included); requisition and punishment are refused, and the dim line shows only for an applied change.
  - I7: with nobody to find the commander GET UP stays; her waking (the third stir) ends the session (`physics/woke`).
  - Ruling Z: her placeholder lines are `cardVoice` rows (`activity.self.<activity>`, `activity.toYou|ask.<activity|any>`, `activity.exchange.call|visit|cards|heard_call|heard_visit`, verbatim; "authorised" → "authorized" for the spelling test); they play until the model's script arrives, which replaces the lines it has.
  - Minors: location-neutral memory texts; the vacuous presence sentinels dropped; "honor" declared in fidelity.json; `pov_corner` on `facing_wall` documented in blocking.md; the shot drift (the room under the desk darkened to the prototype's, her first gesture as a sensory line, the scene's room dimmed in her view and at lights out, the fixtures in the evening).
  - **For the author (deferred):** whether "stay" should come from the fiction (every GET UP is a major `hold_defied`, M3); a real requisition and punishment decision on the throne, and a fact for a decision over the commander's head (P17g, M4); TDD order in this chunk (M7); a blackout or other outcome without its own branch plays the frame's normal end (M8); "placed by her" reads the staging log's source, so a posture the model narrates on the commander's own initiative counts (M10); the script sanitizer's pronoun check is a heuristic (a `self` line that says "she" of the commander passes unless marked `about`, M11); the weight's vial overlaps the scene's reply block on the throne.

- [x] *Fix round 2 (re-review; Ruling AA):* a frame run is never ended by its progress gauge (`decideBoundary` releases on `complete` only outside a frame) and she does not doze off inside it (her activity is the frame); it ends by the marathon's pacing (her end at the last phase, or the forgotten end), the stop word, GET UP, being found, her waking, three buckles or a blocking change. `mergeInputs(…, framed)` routes `ask_rest` with `part` `up` / `rest` / `charge` to the hold side in a frame (any other pair as before), so her rise, her rest, a hard landing and the buckles reach the weight's gauge; the UI reads the buckle count from the run. The fidelity gate formats tables of objects as registry rows (`lines[].format`), checks the Ruling Z placeholders against `ACTS[].self`, `TO_YOU`, `CALL`, `VISIT`, `CARDS` (the one declared row: "authorized"), and fails an `addition` the prototype's table also has. A sensory line waits for the scene's size. **For the author:** `activity.toYou.chatting_on_pda` says "Vex says hi" (the prototype's `OTHERS.friend`, a placeholder name).

**Chunk e8 closed (2026-11-26).** Tasks 21–24b by one implementer, one review of the chunk, two fix rounds, re-review clean. Rulings:
- **W:** a weight run inside a frame (`sourceKind: 'activity'`) takes the frame's wiring from `throne.html` (her weight lines only at `with` / `glancing`, `herFeels` on a slip, rests by presence and style with the seat wording, three buckles end the session with her verdict, her rise takes her weight off, the landing / spill / jerk are engine charges on `ask_rest` `part` `up` / `rest` / `charge`); the weight's release no longer ends the frame.
- **X:** her noticing in a frame is the prototype's, one draw with p = 1−(1−p_seen)(1−p_heard) (visibility and her absence on `part`, loudness × (1−cover) on `amount`); `SegmentInput.cover` and `frameQuiet` were removed (R1); the body giving way is only noticed (`physics_noticed`), never a caught cheat.
- **Y:** a frame relief's catch is decided when it is reported (`physics/relief`), so her tell and answer come at once, as in the prototype.
- **Z:** R26's placeholder lines ship as `cardVoice` rows verbatim from the prototype (her own lines, so Ruling Q holds), under the fidelity gate (`lines[].format`); the model's script replaces the lines it has.
- **AA:** a frame run is never ended by its progress gauge; it ends by her activity's pacing, the stop word, GET UP, being found, her waking, three buckles or a blocking change (the shape of Ruling U).

Also settled: an ended frame does not restart until her activity or the commander's placement changes (`scene.frameDone`); `physics/decide` applies roster decisions only (the engine picks the soldier by hash, through `setActiveRoster`), requisition and punishment are refused; GET UP stays with no finder; her waking ends the session; one buckle count (the engine's); the fidelity gate accepts declared table additions and line rows and fails an addition the prototype also has. For the author (e12): the `stay` default of GET UP, a decision over the commander's head writes no fact, the outcome branches without their own end, `placedBy` read from the staging log, the sanitizer heuristic, the vial over the reply block, "Vex says hi", the two heard-exchanges outside the gate, "honor" / "authorized" spellings, the real requisition and punishment (P17g), `sense` re-scheduling with no bound while the scene has no size.

## Chunk e9: foot service under the desk (`her_activity.html`, the game inside `service`)

**Memory check (e9):** her verdict is P16's `service_rated` through `rateService` (R27), already decided. Signals read right or wrong, kisses and strokes are bookkeeping.

### Task 25: Foot service's engine: her signals and her verdict

**Files:**
- Modify:
  - `src/engine/tuning.ts` (`physics.footSignals`: the motions and meanings of P16b §8, pairs per holder by `fnv1a`, 4–6)
  - create `src/engine/physics/service.ts` (`signalsOf(state, holderId)`, `verdictOf(quality: number): Verdict` by the prototype's thresholds)
  - `src/engine/actions/physics.ts` (`physics/service { runId, verdict }` → `rateService(…, 'engine', sceneId)`)
- Test: `tests/engine/physics/service.test.ts`

- [x] **Step 1:** Tests:
  - `her signals are hers and stable` (the same holder, the same pairs; 4–6 pairs);
  - `physics/service rates once a scene` (a second call is ignored, as `rateService` does);
  - `no rng`.
- [x] **Steps 2–5** as Task 13 (`feat(P10e-e): her foot signals and her verdict`).
- [x] *As built (Task 25):* `TUNING.physics.footSignals` (the motions `tap2` `sole` `push` `hook` `point` `stamp` `nudge`, the foot acts `kiss` `clean` `rub`, the desk meanings `closer` `still` `enough`, `deskCount` 2) and `TUNING.physics.footService` (`patience` [3, 5], `verdict` { pleased .6, adequate .3 }, `footZoneY` 90, `slow` / `quick` tilts). `src/engine/physics/service.ts`: `shuffleBy` (the prototype's, an LCG on a hash), `signalsOf(state, holderId)` = the prototype's `herSignals` hashed by `fnv1a(<holder>|foot_signals)` instead of the session and the style (her signals are hers, so they can be learnt): **five pairs** (the prototype's three foot acts and two of the desk meanings; P16b's 4–6 and its pool of `kneel` / `go` / `look at me` are not used: the instrument has no gesture for them); `servicePaceOf(state, reg, holderId)` (her patience, kiss length, tempo, how often, grain and order of zones: `SVC_STYLE` of her lead style, the prototype's table, her patience bounded to 3–5 s except cruel's 2.5, her grain and order hashed per her as the prototype's `herGrain` / `herOrder`; her own words of how she likes her feet, P15 `how` of the worship targets at her feet read by the body map's zone, tilt it: `slow` longer kisses and a slower rub, `quick` / `fast` / `brisk` the other way, the zones she names first, heel before toe is heel to toes); `verdictOf(quality)`: the prototype's `q ≥ 0.6` (her good line) is `pleased`, below 0.3 (the prototype's half-done stroke) `displeased`, `adequate` between (the prototype has only good / poor: the second threshold is this plan's, for the author). `physics/service { runId, verdict }` (`actions/physics.ts`) lands through `rateService(…, 'engine', sceneId)` (once a scene, as P16), for her frame that is open or the one that just ended (its id is `p<physicsCount>` and `frameDone` is hers: the instrument says it at the session's end, after the engine closed the run). Draws no rng (`tests/engine/physics/service.test.ts`). Memory: none new, `service_rated` lands as P16 decided; signals, kisses and strokes are bookkeeping.

### Task 26: The foot service instrument

**Files:** create `src/ui/scene/instruments/activity/service.ts`, `css/72-service.css`; it runs inside the frame (Task 24) when the commander is under her desk with her foot within reach (read by the blocking's anchor and her activity's `frame.legs`).

**Interfaces:**
- Consumes: `signalsOf`, the art slots `legs_seated.*` and `sole_close` (its sidecar zones; until it exists, the raised foot art zoomed, then her sprite), her expectation profile (`expectationsOf`, P15 `how`).
- Reports: her verdict through `physics/service` at the session's end; `relieve` for the sounds the craft makes while she is not covering them.
- Ports: `svSignal`, `svAnswer`, `svDown` / `svMove` / `svUp` (the gesture classifier and its thresholds), `soleRect`, `zoneRadii` / `inEllipse` / `zoneAt`, `makeDirt` / `wipe` / `dirtIn`, `svLean`, `svRender`, the bouts (most of the hour her foot rests), the two camera steps, the crafts (kiss, clean with the dry mouth and the swallow, rub), the call's covering, the lick sound `lickTick`. The zone marker goes to chunk (f).
- Tests:
  - `the classifier reads a press held ≥ .3 s under 12 px as a kiss, a back-and-forth as cleaning, a steady turn one way as a rub`;
  - `a stroke outside every zone counts as nowhere`;
  - `scrubbing against her grain wipes less`;
  - `her patience is 3–5 s, cruel shorter`.
- Shots: her signal, the close-up, a kiss, cleaning with the dirt layer, a rub, her verdict.
- [x] *As built (Task 26):* `src/ui/scene/instruments/activity/service.ts` (the block `FOOT SERVICE` of `her_activity.html` ported: `svSignal`, `svAnswer`, `svDeskDone`, `svNextWant`, `svEndBout`, `svUpdate`, `svCheck`, `svLean`, `svDown` / `svMove` / `svUp`, `soleRect`, `zones`, `zoneRadii` / `inEllipse` / `zoneAt` / `onSole`, `makeDirt` / `dirtLeft` / `dirtIn` / `wipe`, `svRender`, `SV_SFX`, `thump`, `lickTick` / `lickStop`, `thirdPartyNoise`, `svFresh`, `svSay`; the tables `MOTIONS`, `MEANINGS`, `DEFAULT_ZONES` here and `ZONES_OF`, `SVC_STYLE`, `shuffleBy` in the engine's `physics/service.ts`), `css/72-service.css`, the frame's `fidelity.json` (the 35 functions and 5 tables beside the frame's; `SVC_LINES` and `ZONE_WORDS` as `cardVoice` rows `service.good|poor|wrong` by style and `service.zone.<zone>`, verbatim, the gate learnt `lines[].format: 'line'`; 15 declared differences, each with its reason). The frame mounts it (`attachService`, the prototype's globals given as with the throne) when `serviceMatches`: the view is `legs` (a frame backdrop of the commander's anchor), her activity's `frame.legs` is not `asleep`, no weight inside, her practices live (P16: her verdict lands only then) and worship open for her; `S.inner` is then `service` and the frame's own hooks into it are the prototype's (`svUpdate` in `updateLoop`, `SV.next` waiting outside the phase, `svRender` each frame, the world dimmed and blurred by `closeK`, the mouse's `svDown` / `svMove` / `svUp`, the itch absorbed during the close-up). Her signals are the engine's (`signalsOf`), her pace too (`servicePaceOf`: patience, kiss, tempo, how often, grain, order); the bout's salt is the day and the scene. The close-up's picture: `sole_close` (its sidecar's `fit { height, y }` and `zones`), else `legs_seated.foot_raised`, else her sprite (resolved through `spriteUrl`); without a sidecar `DEFAULT_ZONES`. Reports: her verdict at the session's end, `physics/service { runId, verdict: verdictOf(mean of the bouts) }`, through a staging method that stays alive until the unmount (the run is already gone then; never after the stop word, once); the sounds of the craft while a third party could hear them (the call while she listens, an unaware visitor) and she does not cover them, as `physics/relief` `{ relieve, amount: loud × (1 − cover), part: unseen, involuntary }` at most once a second (never a caught cheat; the third party's own hearing is the prototype's chance on the frame's xorshift). Still form: the camera steps at once, her foot's motions and the picture's sway are still; readable mode drops the world's and the dirt's blur. Not ported: the zone marker (chunk f), the panel's tools (`bouts`, the act buttons), the debug readout's panel. Tests `tests/ui/instruments/service.test.ts` (11); layout fixtures `service` / `servicehold` (the close-up under the UI, the pill and the input on top, the stop word ends it); shots `npm run shots -- service` (the entry's `prototype: 'her_activity'`; 7 moments: signal, close-up, kiss, clean, rub, verdict, close-up at 1280×800). Memory (chunk e9): none new; her verdict is P16's `service_rated` through `rateService`; signals read right or wrong, kisses and strokes are bookkeeping; no new text reaches the journal, the chronicle or a prompt. **For the author:** the second threshold of her verdict (`adequate` from 0.3); a misread or unanswered signal is not an engine event (P16b's `foot_signal_missed` / mastery of the pair are left to P16b); the reading of her P15 `how` by words (`slow`, `quick`, zone names, heel before toe); her signal's naming line is composed from `MOTIONS` / `MEANINGS` in code (the prototype's tables) rather than `cardVoice`.

---

## Chunk e10: shoe service (`shoe.html`)

**Memory check (e10):** a spit she saw is `physics_caught` (R31, already remembered). Her verdict is P16's `rateService`. Grit, shine and the inspection are bookkeeping.

### Task 27: Shoe service's engine: zones as parts, the mask, her footwear and the dirt of her day

**Files:**
- Modify:
  - `src/engine/physics/state.ts` (`wipe`, `spit`)
  - `src/engine/physics/segment.ts` (R29)
  - create `src/engine/physics/footwear.ts` (R30)
  - `content/core/regions.json` and its schema (`dirt?: 'ash' | 'oil' | 'spores' | 'mud'`: ashway ash, kestrel_corridor oil, quarantine_d7 spores, drowned_market mud)
- Test: `tests/engine/physics/shoeInputs.test.ts`, `tests/engine/physics/footwear.test.ts`

- [ ] **Step 1:** Tests:
  - `wipe moves the gauge to the mask` (a wipe of .2 at 100 → 80);
  - `the check at ≤ 10 ends the run as today`;
  - `a spit is a relief: cheatRoll decides`, and caught → `physics_caught`;
  - `footwearOf` is `boots` without heels in her tastes, `heels` with;
  - `dirtOfDay` follows her run's region today, else the training yard (dust), else rain, else dust.
- [ ] **Steps 2–5** as Task 13 (`feat(P10e-e): shoe service's mask, her footwear, the dirt of her day`).

### Task 28: The shoe instrument

**Files:** create `src/ui/scene/instruments/shoe/shoe.ts`, `css/73-shoe.css`; register (matches `interaction: 'order'` with `gauge.kind: 'dirt'` and a source whose blocking `footwear` applies, read by field).

**Interfaces:**
- Consumes: `footwearOf`, `dirtOfDay`, the art slots `shoe_close.<kind>` / `shoe_sole.<kind>` (sidecar `{ feet, shown?, fit: { height, y, x, fade, xr?, xl? }, zones }`); without art, the physics card (README: no stand-in sprite).
- Reports: `wipe { part, amount }` per beat, `spit`, her verdict through `physics/service`.
- Ports: foot service's craft carried over with the README's changes; `shoeRect`, `toPic`, `twoFeet`, `mirrored`, `zonesNow`; the dirt in its own colour per kind; grit (swallow it, or spit it while she is busy, her taps heard); shine (slow strokes on clean leather); the inspection's band of light naming the worst zone.
- Tests:
  - `two feet pan the camera` (`camU` eased by .08 a frame);
  - `a zone the picture lacks is never judged` (the fix of round 4);
  - `shine rises only on clean leather with slow strokes`;
  - `no art: the card`.
- Shots: boots from above, heels presented, grit, a spit while she taps, shine, the inspection.

---

## Chunk e11: gulp (`gulp.html`)

**Memory check (e11):** nothing new in this chunk. What `watersports` remembers is P17b's (strong compromat; a mark seen by others). Spills and the cleaning are bookkeeping; a slip of her discipline is remembered as her discipline does.

### Task 29: Gulp's engine: her flow, swallows and spills, the cleaning's start

**Files:**
- Modify:
  - `src/engine/physics/state.ts` (`PlannedBeat.flow?`, `swallow`, `spill`)
  - `src/engine/physics/segment.ts` (R32: the flow by hash from `TUNING.physics.gulpFlow`, the README's table: neutral 0.2 / 1.6 / 700, … cold 0.21 / 1.4 / 400)
  - `src/engine/physics/run.ts` (`chainRun`'s `start` from the spilled amount)
  - `src/engine/blocking/types.ts` (`CUE_KINDS` + `surge`), `content/core/physicsCues.json`
- Test: `tests/engine/physics/gulpInputs.test.ts`

- [ ] **Step 1:** Tests:
  - `her flow is planned by hash` (same run, same flow; `state.rng` unchanged);
  - `ritual warns in words, cruel never, playful feints 40 %` (over 200 hashed beats, within ±8 %);
  - `a spill is a slip and starts the cleaning at 100 × spilled` (clamped);
  - `no swallow input: the windows as today`.
- [ ] **Steps 2–5** as Task 13 (`feat(P10e-e): her flow, swallows and spills`).

### Task 30: The gulp instrument

**Files:** create `src/ui/scene/instruments/gulp/gulp.ts`, `css/74-gulp.css`; register (matches the entry tagged `watersports` with `interaction: 'timing'` and `gauge.kind: 'fill'`, read by field). The cleaning that follows is `tongue_work` on the floor (this instrument draws it: `startClean`, `wipePuddle`).

**Interfaces:**
- Consumes:
  - the plan's `flow`;
  - the art chain `over_explicit` (explicit content on) → `over` → her sprite from below;
  - the ceiling and floor art;
  - `gulp/mug_soft.ogg`, `gulp/mug_strong.ogg`, `swallow1–5`, `splash_06/09/10`, the commander's breath.
- Reports:
  - `swallow { amount }`, `spill { amount }` (a cough spills);
  - the tap (`physics/signal`, her answer by style; "slower" and "faster" are her answers in the instrument, R32);
  - during the cleaning, `wipe` as Task 28.
- Ports: `render`, `tideH`, `startGulp` (`GULP_MS` 700, `GULP_TAKES` .4, `AIR_GULP` .11), `startBreath` (`BREATH_MS` 520, `BREATH_GIVES` .42, `COUGH_FROM` .55), `cough`, the reflex (`REFLEX_SURGE` .55, cooling 1/9 a second), air as the frame's edges and the heart, overflow, `startClean`, `wipePuddle`, the taste lines from the cue pool, the stream's mix (`smooth(.25, .9, flow/.8)`, rate .96 + .08 × flow, lowpass 1.6 → 4.2 kHz).
- Tests:
  - `a swallow takes .4 of a full mouth over 700 ms and .11 of the air`;
  - `a breath with the mouth over .55 may be a cough, never under`;
  - `from the fourth swallow without a breath the reflex builds`;
  - `every bit licked fills the mouth again (× .0016)`;
  - `the cleaning ends at 10 % left or after 40 s`.
- Shots: the tide low and high, a surge with its warning, a cough, overflow, the cleaning, her check.

---

## Chunk e12: closing

### Task 31: The layout test, the docs, the manual test

**Files:**
- Modify:
  - `scripts/layout-test.mjs` and `tests/layout/*` (fixtures `call`, `slap`, `breath`, `weight`: every instrument's UI stays inside the viewport at the three sizes, no UI box over a head box except the full-screen moments, the dial's circle fixed)
  - `docs/packages/P10e-scene-stage.md` (**Implemented as** for chunk (e): the rulings R1–R32 and A1–A4 as built, where the code differs from this plan, the open items)
  - `docs/00-overview.md` (§5.4: `registerInstrument`, `SampleSound`, `ArtSlots`, `voiceLine`, `cardWhen`, `presenceOf`, `mentionText`, `footwearOf`, `dirtOfDay`, `effectiveOpenings`; §9's P10e row names chunk (e))
  - `docs/prototypes/README.md` (each section notes "ported in chunk (e), Task N")
  - create `docs/MANUAL_TEST_P10e-e.md` (one walk per instrument at 1920×1080 with the author's art)
  - the specs of P16b, P17b and P17c gain **Interfaces already provided by P10e chunk (e)**
- [ ] **Step 1:** Run `npm test`, `npm run typecheck`, `npm run test:layout` → PASS.
- [ ] **Step 2:** `npm run shots` for every instrument; the reviewer compares each pair with its prototype.
- [ ] **Step 3: Commit** `docs(P10e-e): chunk (e) implemented`
