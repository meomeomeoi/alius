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
  - `interface SampleSound`:
    - `play(file, opts?: { gain?: number; pan?: number; rate?: number; at?: number; offset?: number; duration?: number; bus?: 'world' | 'body' }): void`
    - `loop(file, opts?): { setGain(g, ms?): void; setRate(r, ms?): void; stop(ms?): void }`
    - `ctx(): AudioContext | null`
    - `bus(name: 'world' | 'body'): AudioNode | null`
    - `setWorldDull(f: number): void` (0 clear … 1 the prototypes' fully dull world: lowpass `16000·(380/16000)^f`)
    - `dispose(): void`
  - `createSamples(deps: { settings: () => AliusSettings; assetUrl: (p: string) => string; audio?: () => AudioContextLike }): SampleSound`
  - Files are named from the repo root: `'assets/sounds/ha/soft1.ogg'`.

- [ ] **Step 1: Write the failing tests:**
  - `a sample plays through assetUrl with the master gain`: a fake context, `soundVolume` 50, `play('assets/sounds/ha/soft1.ogg', { gain: .3 })`. Expect one fetch of `assetUrl('assets/sounds/ha/soft1.ogg')` and a gain node at `.3 × .5`.
  - `muted plays nothing`: with `soundMuted` on, no source is started.
  - `a buffer is decoded once`: two plays of the same file make one fetch.
  - `a failed fetch is silent`: a rejected fetch gives no throw and no retry within 30 s.
  - `night and muffle apply`: the night and muffle gains of `createSound` multiply in (same constants).
  - `dispose stops loops and closes nothing it did not open`.
  - `tests/assets.test.ts`: every file under `assets/sounds/` is named in `assets/sounds/LICENSES.md`; no file is over 400 KB; no `http` url in `src/ui/sound/`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/sound/samples.test.ts tests/assets.test.ts` → FAIL.
- [ ] **Step 3: Implement** `createSamples` with the context created on the first user gesture, as `createSound` does. Use the two buses of the prototypes: the world bus through the `setWorldDull` lowpass, the body bus never dull. Copy only the files some prototype's normative section names.
- [ ] **Step 4: Run** the tests, `npx tsc --noEmit`, `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P10e-e): the sample sound layer and the instruments' recorded sounds`

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

- [ ] **Step 1: Write the failing tests:**
  - `tests/assets.test.ts`:
    - `HANDS` is read from `content/core/handFonts.json` (48), not a literal;
    - each licence contains `SIL Open Font License` or `Apache License`;
    - each woff2 is under 120 KB (all are);
    - the face count is ≥ 13 + 42.
  - `handScale`: Caveat is 1; every entry's scale is in [0.6, 1.7]; Amatic SC's scale is > 1 (narrow); Rock Salt's is < 1 (wide).
  - `handOf` still prefers `unit.hand`; with none it is `fnv1a(unitId) % 48` in registry order.
- [ ] **Step 2: Run** them → FAIL.
- [ ] **Step 3: Measure and move:**
  - `scripts/measure-hands.mjs` loads each face in Chromium and computes `measureHands` of `cards.html` (the geometric mean of Caveat's x-height of `xvzow` over the hand's and Caveat's width of `Bring me the patrol roster before evening mess.` over the hand's, clamped to 0.7–1.6, rounded to 0.01). It writes `scale` into the registry.
  - Descriptions are one line each, written plainly (e.g. Klee One: `a neat, upright pen, every letter separate.`), never "AUTHOR TO WRITE".
- [ ] **Step 4: Run** the tests, `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P10e-e): 48 hands with a measured size`

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

- [ ] **Step 1: Write the failing tests:**
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
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the schema, the JSON (§1–§5 of card-voice.md; §3's static words as `static.*`; §5 as `call.*`) and the two readers.
- [ ] **Step 4: Run**, `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P10e-e): her voice on the cards as data`

### Task 4: Art slots and sidecars

**Files:**
- Create: `src/ui/scene/art.ts`
- Modify: `src/app.ts` (load `content/local/art/art.json` if it exists, as the other local files; absent = none), `.gitignore` already ignores `content/local/`
- Test: `tests/ui/scene/art.test.ts`

**Interfaces:**
- Produces:
  - `type ArtSlotId = 'over' | 'over_explicit' | 'face_close' | 'legs_seated.rest' | 'legs_seated.foot_raised' | 'sole_close' | 'feet_floor' | 'shoe_close.boots' | 'shoe_close.heels' | 'shoe_sole.boots' | 'shoe_sole.heels'`
  - `interface ArtSidecar { fit?: Record<string, number>; zones?: Record<string, number[]> | { right: Record<string, number[]>; left: Record<string, number[]> }; feet?: 'one' | 'two'; shown?: 'left' | 'right'; face?: { x: number; y: number } }`
  - `interface ArtSlots { get(unitId: string, slot: ArtSlotId): { url: string; sidecar: ArtSidecar } | null }`
  - `createArtSlots(manifest: unknown, assetUrl: (p: string) => string, unitKey: (unitId: string) => string | null): ArtSlots`
  - The manifest: `{ [unitKey]: { [slot]: { file: string; sidecar?: ArtSidecar } } }`, where `unitKey` is the unit's card avatar file name (stable across campaigns).
  - `over_explicit` is returned only when `explicit_scenes` is on; the caller passes the gate.

- [ ] **Step 1: Write the failing tests:** `an absent manifest gives null for every slot`; `a slot resolves to assetUrl('content/local/art/<file>') with its sidecar`; `a malformed entry is skipped, not thrown` (zod, logged once); `over_explicit needs the explicit gate`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run**, `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P10e-e): art slots with sidecars (empty until chunk f)`

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

- [ ] **Step 1: Write the failing tests:**
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
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement:**
  - `InstrumentEnv` is built once in `build()`. `her()` reads `handOf` / `handScale` / `unitAccent` / `physicsStyleOf(...).primary`.
  - A definition is registered by importing `src/ui/scene/instruments/index.ts`, which imports each instrument module. Chunks e3–e11 add one line each.
  - `glossary:instrument` ("A mini-game of the body: it plays her rhythm; the stop word always ends it.") marks the instrument's root.
- [ ] **Step 4: Run** the tests, `npm test`, `npm run test:layout` → PASS.
- [ ] **Step 5: Commit** `feat(P10e-e): the instrument host, its kit, the staging clock, the dial dims`

### Task 6: The dial's circle stays put; the side-by-side shots

**Files:**
- Modify: `src/ui/scene/dial/dial.ts`, `css/62-stage.css` (`.alius-dial-label` absolute under the face, 240 px, wraps; her name over the base name as in `cards.html`'s `drawDial`, the EYES line under them when relevant), `scripts/layout-test.mjs` (a fixture with a wide label)
- Create: `scripts/instrument-shots.mjs`; `package.json` gains `"shots": "node scripts/instrument-shots.mjs"` (not part of `npm test`)
- Test: `tests/ui/dial/dial.test.ts`

**Interfaces:**
- Produces: `npm run shots -- <name> [--state <fixture>]`. It builds the prototype (`npm run proto`) and the layout page with the same fixture, drives both to the named moments listed in the instrument task, and writes `.superpowers/shots/<name>/{proto,port}-<moment>.png` side by side.

- [ ] **Step 1: Write the failing tests:**
  - `the label shows her name over the base name`: `.alius-dial-name` text `LOW`, `.alius-dial-sub` text `BOWING`; with no name of hers, the base alone.
  - Layout test: the face's x is the same (±1 px) for `standing` and for a posture whose label is 30 characters.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** the tests, `npm run test:layout` → PASS.
- [ ] **Step 5: Commit** `fix(P10e-e): the dial's circle no longer moves with its label; side-by-side shots`

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

- [ ] **Step 1: Write the failing tests** (jsdom, `look: 'scene'`):
  - `a task speaks in her voice`: the card has her name in `.alius-scard-who`, her words, and condition lines in the order `when → cost → lapse`. Each value is a `span.alius-scard-v` with the engine's word (`this evening`, `one slot`, `training together`).
  - `no brackets anywhere`: `/\[\s*[A-Z]/` matches nothing in the dock's text.
  - `a cruel holder still names the cost`: a `button_cost` task of a cruel holder has a cost line.
  - `the sealed envelope keeps its secret`: no summary or text of a sealed task in `outerHTML`; a `.alius-scard-seal`; the weight line absent for cruel and vindictive.
  - `readable mode shows the dry lines`: `.alius-scard-dry` with `Due: this evening.`
  - `the moment is not hers`: `data-scard-kind="moment"`, no `.alius-scard-who`, the prose from `voiceLine(… 'moment' …)`.
  - `the answers are the same actions`: clicking `accept` / `refuse` / `talk it over` / `negotiate` / `go` / `yield` / `do it` / `take it instead` calls the same handlers with the same ids as today. `sign` needs a 1.2 s hold (fake timers).
  - `the PDA thread is unchanged`: `drawTaskCards` without `look` gives today's `article.alius-voice` DOM (a snapshot of one card).
  - `analyze coverage`: `markedWithout`, `unresolved` and `unreachable` are empty for a dock with one card of each kind (the helpers of `tests/helpers/analyzeCoverage.ts`); the hidden sentinels are absent (`tests/fixtures/analyze/hidden.ts`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement:**
  - Port `cards.html`'s CSS for `.card`, `.head`, `.body`, `.words`, `.cond`, `.v`, `.rule`, `.pill`, `.seal`, `.steps` and `.dry` into `css/64-cards.css`, renamed to `alius-scard-*`, sizes × `--alius-hand-scale`.
  - The key of `voiceLine` is the card's id (`task.id`, `p.id`, `d.id`, `milestone.id`, …).
- [ ] **Step 4: Run** the tests, `npm test`, `npm run test:layout` → PASS.
- [ ] **Step 5: Commit** `feat(P10e-e): her cards in the scene's language and her voice`

### Task 8: Collapsed cards are the edges of her hand

**Files:**
- Modify: `src/ui/scene/stage/dock.ts` (the collapsed strip's gist; newest on top above the open card; overlap; a card with a clock never collapses), `css/64-cards.css`
- Test: `tests/ui/stage/dock.test.ts`

**Interfaces:**
- Produces:
  - Each card built with `look: 'scene'` carries `data-gist` (the engine's short name and its most urgent condition as text, built by the draw function: `gistOf` of `cards.html`; a sealed task `✉`).
  - The dock draws a collapsed card as its head line and `span.alius-scard-gist` (from `data-gist`).
  - `running(card)` is `data-run` **or** `data-clock`.

- [ ] **Step 1: Write the failing tests:**
  - `a collapsed card shows her name, its kind and its gist`, never only the name: a task's strip reads `Ann`, `task`, `bring the roster · this evening`.
  - `a sealed strip shows ✉ and nothing else of it`.
  - `newest on top, the open one below them`: three cards → DOM order `[c3, c2]` strips, then `c1` open (the open one is the newest unless the commander chose another).
  - `a click opens a strip, the open one becomes a strip`.
  - `a running hold is never collapsed` (as today) and `the set-aside counter still works`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run**, `npm run test:layout` → PASS.
- [ ] **Step 5: Commit** `feat(P10e-e): collapsed cards show her name, the kind and the gist`

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

- [ ] **Step 1: Write the failing tests:**
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
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the port with `cards.html`'s numbers:
  - dim .28; the dial ring in her accent;
  - her word at 74 vw / 13 vh, 92 px × hand scale, write-on `steps(14)` over 520 ms;
  - the dots;
  - the fan anchored 110 px from the right and `min(18.5vh, 200px) + 72px` from the bottom;
  - the right card's flight to the dial;
  - the timings 1300 / 2600 / 3300 ms.
- [ ] **Step 4: Run** the tests, `npm test`, `npm run test:layout` (her word and the fan stay inside the viewport and off her head box at all three sizes) → PASS.
- [ ] **Step 5: Shots:** `npm run shots -- cards` (moments: the stack, a task open, the call mid-window, right, slow). Compare with the prototype, fix any drift.
- [ ] **Step 6: Commit** `feat(P10e-e): the posture call as a full-frame moment`

### Task 10: Arrival, sounds and the review of e2

**Files:**
- Modify: `src/ui/scene/stage/dock.ts` (a new card slides in: 46 px, −2°, 0.5 s, `card_slide` at .25 pan −0.6; opening a strip `card_slide` at .18; `card_place` at .25 on an answer), `css/64-cards.css`
- Test: `tests/ui/stage/dock.test.ts`

- [ ] **Step 1: Write the failing tests:**
  - `a new card arrives once`: `.is-arriving` on its first draw only, never on a redraw; none under reduced motion.
  - `the sounds play through the sample layer`, at the gains above; none when muted.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run**, `npm test`, `npm run test:layout` → PASS.
- [ ] **Step 5: Review of e2:** `npm run shots -- cards` at 1920×1080 and 1280×800. Record the side-by-side in the task's commit message (what was compared, what differed and was fixed).
- [ ] **Step 6: Commit** `feat(P10e-e): cards arrive and sound; e2 reviewed against cards.html`

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

- [ ] **Step 1: Write the failing tests:**
  - `a turned face is her offence`: `answerSlap(…, 'flinched')` emits `slap_dealt` and her offence `slap_defied` (minor). `none` and `braced` note none.
  - `cruel still slaps again after a turned face` (as today), and `vindictive still adds to the count`.
  - `the side is the hash of the id`: two calls give the same side; over 20 ids both sides appear.
  - `faces holds every style`: 11 rows, each `after` with the three results, every label one of the 28 SillyTavern expressions.
  - `the directive names the cheek`.
  - `no rng`: `state.rng` is equal before and after a slap is dealt (a deep compare).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** the tests, the seeded `unaffected` tests, `npm test` → PASS (a moved golden stops and reports).
- [ ] **Step 5: Commit** `feat(P10e-e): the slap's meanings, her side, her face and her lines`

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

- [ ] **Step 1: Write the failing tests:**
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
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the port with the README's numbers:
  - the camera: zoom 2.6 to (0.5 W, 0.42 H), the backdrop blur 14 px and dim .55;
  - the lean −0.4 and the side light;
  - the impact's whip (7.5 % / 5.5°, τ 210 ms, period 520 ms), the flash, the ringing and the cheek (τ 24 s);
  - the turn of 11 % in 160 ms;
  - `face_close` from the art slots when present.
- [ ] **Step 4: Run** the tests, `npm test`, `npm run test:layout` → PASS.
- [ ] **Step 5: Shots:** `npm run shots -- slap` (moments: hand raised, a feint, the impact `none`, `braced`, the turned face, the cheek after). Fix any drift.
- [ ] **Step 6: Commit** `feat(P10e-e): the slap instrument replaces the overlay`

---

## The shape of an instrument task (e4 – e11)

Every instrument task below follows these steps. Its own section lists its files, interfaces and specific tests.

- [ ] **Step 1: Write the failing tests:**
  - the pure helpers it names (exact values from the README);
  - **keys:** Space or Shift typed into the input never act, and only the mouse acts while the field has focus;
  - **fallback:** no art slot → her sprite, or the automatic zones, as the README says;
  - **reduced motion and readable mode:** the still form;
  - **unmount:** `stop()` (the stop word, a new run, `resetSceneStage`, dispose) leaves no timer, `requestAnimationFrame`, audio node or document listener, restores the frame and the input, and dispatches nothing afterwards (fake clock);
  - **inputs:** the inputs it reports for a scripted beat sequence (fake clock and fake staging).
- [ ] **Step 2: Run** them → FAIL.
- [ ] **Step 3: Port** the prototype's functions named in the task into its folder, keeping their names. Read the engine's plan and style instead of the "prototype only" schedulers. Read her lines from the cue pool (`env.staging.cue(kind, beat)`), never from the prototype's `LINES`. Put the CSS in the task's stylesheet.
- [ ] **Step 4: Run** the tests, `npm test`, `npm run test:layout` → PASS.
- [ ] **Step 5: Shots:** `npm run shots -- <name>` at the moments the task names; compare with the prototype and fix any drift. A drift the extension cannot avoid stops and reports.
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

- [ ] **Step 1: Write the failing tests:**
  - `a breathe without amount counts as today` (the existing segment tests unchanged).
  - `amount .5 credits half`: `caught` 30 × .5 = +15, capped at 30 a window.
  - `a strain drains the beat twice`.
  - `a noticed strain resets the streak and delays the next opening`: by 1 beat for neutral, 2 for cruel, 0 for affectionate. A breathe on the old beat then misses; on the new beat it is caught.
  - `a cruel holder is silent in real time`: the plan's openings carry no cue, and `state.rng` advances exactly as it did before this change for the same seed.
  - `the tally counts what resolved`, and `the directive has one sentence of it after physics_outcome`, with no caught cheat named when it was not caught.
  - `occlusion` validates on every contact of the table; a contact without it is `slit` / `ceiling` (read by a reader `occlusionOf(contact)`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** the tests, every seeded `unaffected` and `tests/engine/physics/*` → PASS (a moved golden stops and reports).
- [ ] **Step 5: Commit** `feat(P10e-e): breath's held credit, over-holding and her silence; the tally`

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

---

## Chunk e5: weight (`weight.html`)

**Memory check (e5):** nothing new. A slip, a caught shift and a buckle are P15a's events (`physics_slip`, `physics_caught`), already decided.

### Task 15: Weight's engine: uneven holding and the view of the contact

**Files:**
- Modify: `src/engine/physics/state.ts` (`uneven`), `src/engine/physics/segment.ts` (R16), `content/core/blockingContacts.json` and its schema (`face: 'up' | 'down'` on the weight contacts: up for `straddled`, `standing_on`, `boot_on_chest`; down for `human_chair`, `footrest`, `knee_on_back`, `on_hands`)
- Test: `tests/engine/physics/weightInputs.test.ts`

- [ ] **Step 1:** Tests:
  - `an uneven input drains drain × amount`;
  - `no uneven input: today's numbers` (the existing tests);
  - `a shift landing on a beat with no hold costs as today`;
  - `face reads by field`.
- [ ] **Steps 2–5** as Task 13 (`feat(P10e-e): uneven holding costs strength`).

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

- [ ] **Step 1:** Tests:
  - `inhale replaces the passive fill`: two `inhale` inputs of 3 and 2 words at capacity 10 fill 50; a segment with none fills as today.
  - `a mouth breath with amount blows words out` (−amount × 100 / capacity).
  - `the band is hers`, not `'noticeable'`: a holder at band `strong` fills × 1.5 by the passive rule. **This changes resolution for real holders.** If a seeded physics test moves, stop and report.
  - `a caught lie is remembered once`, with audience her; a lie not caught writes nothing.
- [ ] **Steps 2–5** as Task 13 (`feat(P10e-e): scent's head, her band, her question`).

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

- [ ] **Step 1:** Tests:
  - `bite replaces the flat cost`: amounts .33 and 1 over two beats cost `8 × 1.33`;
  - `a teeth bite is a slip`;
  - `orders are planned by hash`: the same run and segment give the same orders; `state.rng` is unchanged by planning a jaw segment (compare before/after);
  - `no bite: +8 a beat as today`.
- [ ] **Steps 2–5** as Task 13 (`feat(P10e-e): the jaw's cost and her orders`).

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

- [ ] **Step 1:** Tests:
  - `her frame starts from the blocking`: she `reading_book`, the commander kneeling by her (a posture she set) → `physics_started { physicsId: 'her_activity', sourceKind: 'activity' }` and a marathon with `hours` (or `'unknown'`). An activity without `frame` starts nothing. A scene without the blocking live starts nothing.
  - `a contact that names her_activity starts as today` (the existing tests).
  - `presence` is deterministic for the same run and phase; a `cruel` holder at `none` Regard in `possessing` reads `use`; an `affectionate` talkative one reads `with`.
  - `presence` never appears in an event, a directive or a reading: the sentinel test of `tests/fixtures/analyze/hidden.ts` gains `presence` words as sentinels for the analyze panels.
  - `a loud relief is noise; one covered by her speech is not`.
  - `no rng without eligibility`: a scene with no framed activity draws exactly as before (the `unaffected` goldens).
- [ ] **Steps 2–5** as Task 13 (`feat(P10e-e): her frame starts from the blocking; her presence`).

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
- [ ] **Step 1:** Tests:
  - the sanitizer drops a line with a pronoun for the commander;
  - `at` is clamped to the phase;
  - a mention to a listener who knows is plain, to one who does not is veiled, unsaid without a veiled form;
  - the call is made through `app.generations` only (the architecture test);
  - a failed call leaves the cue pool's placeholder lines.
- [ ] **Steps 2–5** as Task 13 (`feat(P10e-e): her hour's script`).

### Task 23: The forgotten end, being found, the digest

**Files:**
- Modify:
  - `src/engine/physics/run.ts` (in `use`, the last phase ends `forgotten`: `forgotten_end { runId, holderId }`, the commander stays posed; a new action `physics/get_up { runId }` ends it, a disobedience when she said stay: her offence `hold_defied`, existing)
  - `src/engine/actions/physics.ts` (`physics/found { runId, finderId }`, dispatched when a visitor of the frame enters, emits `found_posed`)
  - `src/engine/memory/resolvers.ts`, `content/core/memoryRules.json` (`forgotten_end`, `found_posed`, R28)
  - `src/blocking/physicsDirectives.ts` (the frame's tally sentence)
- Test: `tests/engine/physics/forgotten.test.ts`, `tests/engine/memory/framed.test.ts`

- [ ] **Step 1:** Tests:
  - `in use the end is forgotten and the commander stays posed`;
  - `get_up after "stay" is her offence hold_defied`;
  - `found_posed is remembered by the finder and spreads as a squad rumor`;
  - `forgotten_end is a fact of hers only`;
  - `the digest sentence carries no uncaught relief`.
- [ ] **Steps 2–5** as Task 13 (`feat(P10e-e): the forgotten end, being found, her hour's digest`).

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

---

## Chunk e9: foot service under the desk (`her_activity.html`, the game inside `service`)

**Memory check (e9):** her verdict is P16's `service_rated` through `rateService` (R27), already decided. Signals read right or wrong, kisses and strokes are bookkeeping.

### Task 25: Foot service's engine: her signals and her verdict

**Files:**
- Modify:
  - `src/engine/tuning.ts` (`physics.footSignals`: the motions and meanings of P16b §8, pairs per holder by `fnv1a`, 4–6)
  - create `src/engine/physics/service.ts` (`signalsOf(state, holderId)`, `verdictOf(quality: number): Verdict` by the prototype's thresholds)
  - `src/engine/actions/physics.ts` (`physics/service { runId, verdict }` → `rateService(…, 'engine', sceneId)`)
- Test: `tests/engine/physics/service.test.ts`

- [ ] **Step 1:** Tests:
  - `her signals are hers and stable` (the same holder, the same pairs; 4–6 pairs);
  - `physics/service rates once a scene` (a second call is ignored, as `rateService` does);
  - `no rng`.
- [ ] **Steps 2–5** as Task 13 (`feat(P10e-e): her foot signals and her verdict`).

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
