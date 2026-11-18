# P10b Intimate Immersion UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make relationships felt through the interface instead of numbers:
- **VITALS:** squad biotelemetry on the PDA and the hub;
- **living DMs:** messenger behaviour that follows her state;
- **the night:** a night theme, and a door for night visits;
- **handwriting:** each soldier writes notes in her own hand;
- **device marks:** the visual side of P9c access (stickers, wallpaper, pinned notes, renamed contact) on a new PDA **HOME** view.

**Architecture:**
- **Engine (pure, no new RNG draw).** Everything is derived from state with `fnv1a` hashes where a "chance" is needed:
  - `src/engine/vitals.ts` (telemetry from stress, ledger, scene, Want, defects);
  - `src/engine/dmBehaviours.ts` (behaviours stamped on a received DM, receipts, the reply mode);
  - `src/engine/hand.ts` (her hand font);
  - `src/engine/notes/` (stored hand notes, their day step, the note under the door);
  - additions to `actions/comms.ts` (`night/door_say`, `night/door_reply`).
- **Data.** New registries:
  - `dmBehaviours`
  - `handFonts`
  - `handNotes`
  - `stickerArt`

  New optional fields:
  - `DmMessage.behaviours`
  - `NightEntry.door`
  - `Unit.hand`
  - `CampaignState.notes`
  - `defects[].vitals`
  - `deviceSkins[].stickerSpots`

  Also `TUNING.vitals`, `TUNING.notes`, one new `SoundId` (`knock`) and one setting (`doorTimer`).
- **UI.** New files:
  - `src/ui/vitals/` (trace, block, hub strip)
  - `src/ui/comms/living.ts`
  - `src/ui/night/door.ts` (replaces `knock.ts` for knocks)
  - `src/ui/notes/` (note card, rule note)
  - `src/ui/home/homeTab.ts` (the HOME view)
  - `src/ui/device/marks.ts` (stickers layer)
  - `src/analysis/providers/immersion.ts`
  - `css/79-immersion.css`

  Fonts go in `fonts/hand-*.woff2`.
- **Chunks** (`docs/ROADMAP-next.md`):
  - **Chunk (a), Tasks 1–5:** VITALS and living DMs.
  - **Chunk (b), Tasks 6–14:** night theme and door, handwriting and notes, HOME and device marks, docs.

**Tech Stack:** TypeScript 5 (strict), esbuild, zod 3, vitest (+ jsdom). Fonts from `@fontsource/*` packages (OFL-1.1), copied once into `fonts/` (no runtime dependency).

**Spec:** Read these before Task 1:
- `docs/00-overview.md` (§5.4, §8).
- `docs/packages/P10b-intimate-immersion-ui.md`.
- The **Implemented as** sections of:
  - P10 (shell, device layer, chrome, voices, motion, sound, fonts, "the view must never scroll");
  - P9c (`deviceAccess`, `decorOf`, `wallpaperUnit`, `pinnedNotes`, `device/remove_decor`, secrets, no night bookings);
  - P9d (Want, rules, `drawRuleChips`, `WANT_VISIT_KIND`);
  - P3b (memory is data; `Knowledge`);
  - P7a (analysis).
- `docs/content/lore.md` §0.

The spec text calls the commander "he/his" (§4); **nothing this package writes may** (Global Constraints).

## Global Constraints

- **Text.** English. UI text goes through `h()` / `textContent`, never `innerHTML` (an SVG path is set with `setAttribute`). No pronoun for the commander in any text a player or the main model reads (lore §0); `tests/content/pronouns.test.ts` must cover the four new registries, every new glossary entry and the `dm_reply` `door` / `curt` mode texts. Soldiers are "she / her".
- **Engine purity.** `src/engine/**` stays pure (`tests/architecture.test.ts`). `vitals.ts`, `dmBehaviours.ts` and `hand.ts` import no UI.
- **No new RNG draw, anywhere.** Every "chance" in this package is `fnv1a(<stable key>) % 1000 < chance × 1000`. The keys:
  - message id + behaviour id (a DM behaviour);
  - day + unit (an authored note line);
  - unit id (a sticker or a hand).

  Every existing seeded test stays byte-identical. A test that deep-equals state after `dm/receive`, `night/ignore` or the day end and now sees a new optional field **stops and reports** (CLAUDE.md) unless the test set up the triggering condition on purpose.
- **Read by field, never by id.** Code reads:
  - behaviours by `kind`;
  - notes by `where`;
  - stickers by `likeTags`;
  - hands by registry order;
  - defects by `vitals`;
  - skins by `stickerSpots`;
  - secret kinds by `source` (`hidden_injury`);
  - rule state by `status` / `lastBrokenDay`;
  - rooms by `commanderCell`;
  - knocks by "not in `CONFRONTATION_KINDS`".

  The only ids code may name are the new `SoundId` `knock`, the tab id `home`, P9d's `WANT_VISIT_KIND` and P9c's `SECRET_NIGHT_KIND` (already exported).
- **Knowledge (overview P12, acceptance 1).** VITALS show **bands and patterns, never a number derived from hidden state**. An illustrative heart rate is a fixed text per band (`HR 60–70`), never a function of stress, Want or a ledger amount. Ledger deltas are only used as triggers. A unit hiding an injury (a kept P9c secret of source `hidden_injury` about her) shows no injury in VITALS.
- **Analysis.** Every new stat, chip, option and card carries `data-analyze`. The four registries join `DESCRIBED_REGISTRIES`. Live values get a provider in `src/analysis/providers/immersion.ts` that reads through `Knowledge`; `tests/analysis/hidden.test.ts` must pass with it registered.
- **Motion and readability (acceptance 6).** Every animation asks `motionReduced(settings)` / `visualFlags(settings)`, never `matchMedia`. This covers:
  - the trace sweep;
  - the typing dots;
  - the knock shake;
  - the door frost;
  - the timer bar;
  - the note tear;
  - the slow night transitions.

  Under reduced motion each one is a static state. Readable mode also drops the night dimming, the door blur and the wallpaper image. The `prefers-reduced-motion` system preference already folds into `motionReduced`.
- **Sound.** Only the nine `SoundId`s (the eight of P10 + `knock`). Night halves the effective gain (UI constant `NIGHT_GAIN = 0.5`). Nothing loads from the network (`tests/assets.test.ts`); fonts are extension files referenced from `style.css` as relative `url("fonts/…")`.
- **Shell rules (P10 Implemented as).**
  - A hub renderer never moves the device.
  - Every new `focus()` uses `{ preventScroll: true }`.
  - The chrome stays `aria-hidden` and ignores the pointer, so stickers are never clickable. PEEL lives in the dossier and on HOME, always behind a confirm.
- **Old saves.** Every new field is optional and the version stays 1. Absent `notes` = no notes; absent `Unit.hand` = the hashed default; absent `DmMessage.behaviours` = a plain message.
- **Ids.**
  - Directive ids: none new (P10b adds no directive).
  - Reserved (emitted) event types, each joining `RESERVED_EVENT_TYPES`: `door_said`, `door_replied`, `hand_set`, `note_left`, `note_read`, `notes_expired`.
  - Glossary ids:
    - `vitals`, `vitals_flat`, `vitals_flicker`;
    - `dm_behaviour`, `read_receipt`, `voice_message`;
    - `night_theme`, `night_door`;
    - `handwriting`, `hand_note`, `rule_note`;
    - `pda_home`, `device_marks`;
    - `setting_door_timer`.
- **Drafts.** Every number below is a draft in `TUNING.vitals` / `TUNING.notes` or the registries. Every authored text is marked `AUTHOR TO WRITE`.
- **Build output.** `npm test` rebuilds `dist/index.js` and `style.css`; commit both with every task. Baseline before Task 1: 348 files, 5868 tests, all passing.

## Where the plan rules on the spec (read before Task 1)

Rulings marked **(user)** were answered by the user on 2026-11-18. Task 14 copies all of them into the spec's **Implemented as**.

### Telemetry (§1)
- **Derived, nothing stored.** `vitalsOf(state, reg, unitId): Vitals | null` (null for a grunt, a dead or absent unit).

  The pattern is picked by the first rule that holds:
  1. `erratic`: she is in a breakdown (`unit.breakdown`) or her stress band is `breaking`.
  2. `flat`: one of her defects has `vitals: "flat"` (core: `affect_dampener`).
  3. `spiking`: at least one spike cause holds.
  4. `elevated`: stress band `strained` or worse.
  5. `steady`: otherwise.

  A `flat` unit carries spike causes but keeps the flat line. Only a **flicker** breaks it.
- **Spike causes** (`SpikeCause`), each read without a number reaching the UI:
  - `combat`: a `stress:<id>` ledger entry today whose `action` starts with `combat/` or `expedition/`.
  - `conflict`: an `axis:<id>:trust` or `axis:<id>:affinity` ledger entry in the current day and slot with `delta ≤ −TUNING.vitals.conflictDelta` (3).
  - `commander_near`: `state.scene` is open and she is a participant.
  - `want`: `wantBandOf` is `aching` or `desperate`. This is empty with romance off, as P9d already rules.
- **Flicker (the "logged moment").** For a `flat` unit, a flicker is an `axis:<id>:affinity` or `axis:<id>:attraction` ledger entry with `delta ≥ TUNING.vitals.flickerDelta` (3). `flickersOf(state, unitId): Array<{ day, slot }>` lists them from the 7-day ledger, newest first (at most 5). This list is the log; nothing new is stored. `vitals.flicker` is true when one is in the current or the previous slot.
- **Bands.**
  - `heart`: `low | resting | raised | racing`. Steady = resting, elevated = raised, spiking or erratic = racing, flat = low.
  - `temp`: `cool | normal | warm | fever`. Fever while injured (unless hidden), warm while spiking with `want` or `commander_near`, cool when flat, normal otherwise.
  - Illustrative text per band (UI constant):
    - heart: `HR 48–56` / `HR 60–70` / `HR 85–100` / `HR 120+`;
    - temp: `35.9°` / `36.6°` / `37.2°` / `38.4°`.
- **Hidden injury.** If a kept P9c secret (`status: 'kept'`) whose kind has `source: 'hidden_injury'` names her (`subjectId === unitId`; if the secret store keys it differently, follow `hideInjuries`), injury never sets `fever` or `erratic`. The roster's HP line is out of scope (P9c open item stays open).
- **Where.** In the SQUAD dossier, a VITALS block per named unit: the trace, the pattern chip, HR / TEMP chips and the flicker log for flat units. On the hub, a mini strip in the side column (one small trace + name per named living unit, under TONIGHT).

### Living DMs (§2)
- **Registry `dmBehaviours`.** Each entry has:
  - `id`, `name`, `description`;
  - `kind`: one of `hesitate | deleted | burst | late | voice | curt`;
  - `chance`: 0–1;
  - `when`: all optional, all must hold:
    - `minWant`;
    - `wantBands`;
    - `attachment` (list);
    - `stateGroups` (relationship-state `group` values);
    - `states` (data list);
    - `afterConflictSlots` (a conflict ledger entry within N slots);
    - `affinityDrop` (sum of negative `axis:<id>:affinity` deltas today ≥ n);
    - `slots`;
    - `initiated` (bool).
- **Stamped once, at `dm/receive`.** `stampBehaviours(state, reg, unitId, msg): string[]` returns the entry ids whose `when` holds and whose hash passes (`fnv1a(msg.id + '|' + entry.id)`), at most one per kind. They are stored on the message as `DmMessage.behaviours`, absent when empty. A later state change never rewrites an old bubble.
- **Per kind:**
  - `deleted`: a "message deleted" placeholder just before her bubble. It is not a stored message and is not counted as unread or in `history`.
  - `burst`: her text is split at sentence ends into 2–3 bubbles, the double or triple text. No extra model call (overview P7).
  - `late`: a `LATE` stamp, only for an initiated message in `evening` or `night`. Core condition: `minWant: 40`.
  - `voice`: a waveform bubble with `[PLAY]`. A click reveals the text for this render host (UI-local; it stays revealed until the tab is rebuilt).
  - `curt`: decided **before** the model call. `replyModeFor(state, reg, unitId, base)` returns `curt` when a `curt` entry's `when` and hash (keyed by the next message id, `m<memory.nextId>`) hold and `base` is `reply`. `dm_reply` gets mode `curt` ("one or two words, cold"), and the received message is stamped `curt`.
  - `hesitate`: not stamped. It is a live indicator shown only while the open thread ends in a commander message left without an answer. `hesitates(state, reg, unitId): boolean` checks the `hesitate` entries against the last commander message id. The UI shows `typing…` for 2.5 s and then `stopped typing`; under reduced motion it shows the static line `She started typing and stopped.`
- **Read receipts (derived).** `receiptOf(state, unitId, msg)` → `'delivered' | 'read' | 'left_on_read'`, with `slotsAgo` for the last two:
  - read: a later message of hers exists;
  - left on read: no later message and `slotIndex(now) − slotIndex(msg) ≥ 1`;
  - delivered: otherwise.

  The UI writes `READ`, `READ · 2 SLOTS AGO` or `SEEN · NO REPLY` (slots, not hours: the game has no clock).
- **Renamed contact.** The COMMS contact row shows `decorOf(…).contactName` while her decor has the `contact` part, dimmed while faded. The thread header keeps her real name in brackets.

### Night theme and the door (§3)
- **Theme.** The shell root gets `data-night="true"` while `state.slot === 'night'`. The CSS variant is warmer and dimmer; transitions use `--alius-motion-scale: 1.6` and sound runs at `NIGHT_GAIN`. Readable mode keeps `data-night` (the label and the sound) but drops the dimming: every colour pair stays ≥ 4.5:1 (`tests/ui/palette.test.ts` extended).
- **Which knocks.** Every night entry that is not a confrontation (`CONFRONTATION_KINDS` keep their panel) renders as the door. This includes `want_visit` and the P9c secret confession. P9c bookings have day slots only, so a booking never reaches the door.
- **Timer (user: real time, a setting, default 15).**
  - Setting `doorTimer` (int 0–60 s, default **15**; 0 = no timer).
  - The countdown pauses while:
    - the through-the-door input has the focus or holds text;
    - a door reply is being generated;
    - the analysis panel is pinned or a modal is open;
    - `document.hidden`.
  - The deadline is kept per entry id in a module `Map`, so a redraw does not reset it; a reload starts it again.
  - Reaching 0 calls the same path as STAY SILENT (`comms.ignoreNight()`): the knock's `ignore` consequence, then the slot rolls.
  - The bar animation obeys motion; the remaining seconds are announced through `aria-live` at 10 / 5 / 0.
- **Options:** `[OPEN]` (unchanged: `comms.openNight`), `[SAY SOMETHING THROUGH THE DOOR]`, `[STAY SILENT]`. All three are `.alius-option` with `data-analyze="glossary:night_door"`.
- **Through the door (user: one model reply).**
  - One exchange per knock. The commander types a line (1–300 chars) and the app dispatches `night/door_say { text }` (rejected when one was said already, or when no knock is open). This stores `nightEvent.door = { said }`.
  - Then `generateDm` runs with the new mode `door` ("she answers through the closed door, one or two sentences; she is still deciding whether to stay"). The app dispatches `night/door_reply { text }` (stores `door.reply`) and reads the exchange for intents on channel `dm` with her `unitId`, exactly like a DM (`readExchange`).
  - Nothing is pushed to the DM thread.
  - A failed generation leaves `door.said` set with no reply, and the door shows `No answer through the door.`
  - After the reply the door shows both lines and only OPEN / STAY SILENT, and the timer restarts at full length.
- **Silhouette.** Her sprite (`st.getSpriteUrl(cardRef, 'neutral')` through the portrait module's cache) is shown blurred behind frosted glass (CSS `filter: blur(14px) brightness(.6)`). There is no blur in readable mode (a solid shape) and no sprite at all for a unit without `cardRef` (the ASCII door from `knock.ts` stays as the fallback art).
- **Knock.** A shake animation (≤ 600 ms, none under reduced motion) and `sound.play('knock')` once per entry per render host. New `SOUND_IDS` entry `knock` (synth: square 140 Hz → 90 Hz, 3 × 60 ms is beyond the synth's one-sweep form, so one 160 ms sweep at gain 0.5; the author may add a `file`).

### Handwriting (§4)
- **Six bundled hands** (SIL OFL 1.1, `@fontsource/*` 5.3.0, latin 400 woff2): Caveat, Indie Flower, Patrick Hand, Shadows Into Light, Kalam, Nanum Pen Script. Licences go in `fonts/LICENSES/`.
- **Registry `handFonts`.** Each entry has `id`, `name`, `family` (CSS family name), `description`. `@font-face` rules go in `css/01-fonts.css`.
- **Assignment.** `handOf(state, reg, unitId): Entry`:
  - `unit.hand` if it names an entry;
  - else the entry at `fnv1a(unitId) % n` in registry order (deterministic "at import", nothing written, old saves included).

  The player changes it with `squad/set_hand { unitId, handId }` (named units only; event `hand_set`) from a `HAND` select in the dossier. Re-sync does not touch it.
- **Use.** Every note of hers (below) sets `--alius-font-hand: "<family>", var(--alius-font-type)` on the note element. The paper voice reads `--alius-font-hand` first for `.alius-note` bodies (`css/18-voices.css`). Readable mode swaps hands for `--alius-font-type` (legibility) but keeps the note.

### Notes (§4, user: pinned + rules + door + registry)
- **Sources.**
  1. **Pinned notes**: P9c `pinnedNotes` (derived, unchanged).
  2. **Rule notes**: every P9d rule of hers that is `proposed` and delivered, `active`, or recently broken. The rule text is in her hand with her name as a signature.
  3. **Stored hand notes** from the new registry `handNotes`.
- **Registry `handNotes`.** Each entry has:
  - `id`, `name`, `description`;
  - `where`: `quarters | gear | door`;
  - `text` (`{name}`);
  - `chance`;
  - `when`, all optional:
    - `minAccess` (device access);
    - `tiers`;
    - `wantBands`;
    - `states`;
    - `trigger`: `daily` | `knock_unanswered`.
  - Core drafts: two `quarters` daily (access ≥ 2), one `gear` daily (tier close/romantic), two `door` with trigger `knock_unanswered`.
- **State.** `CampaignState.notes?: { seq: number; list: HandNote[] }`, where `HandNote = { id, unitId, noteId, where, text, day, read?: true }`. The text is copied at write time with `{name}` filled.
- **Writing.**
  - Daily notes come from `notesDayStep` (registered on `dm_rumors` after the personal step). Per named living unit with an imported bond profile (`unit.bond !== undefined`, P9c's gate), take the first `daily` entry whose `when` holds and whose hash `fnv1a(day|unitId|noteId)` passes. Limits: at most one note per unit per day; none while she has an unread note of the same `where`.
  - Under-the-door notes are written in `night/ignore` (the timer, STAY SILENT and the old IGNORE all land there) from the first `knock_unanswered` entry whose `when` holds. There is no hash gate: it always happens when an entry fits.
  - Notes expire `TUNING.notes.keepDays` (3) days after `day`; the list is capped at `TUNING.notes.max` (12), oldest first out. `notes/read { id }` marks one read (event `note_read`).
  - A unit who leaves service loses her notes (`removeFromService` calls `forgetNotes`).
- **Where they show.**
  - `quarters` notes and pinned notes: in the room panel of the hub room with `commanderCell` ("appear when the commander enters") and on HOME.
  - `gear` notes: at the top of the INV tab.
  - `door` notes: on HOME and as a TONIGHT item next morning (`kind: 'note'`, a new `TonightItem` kind).
  - Unread notes raise a HOME badge.
- **Rule notes.**
  - A delivered proposal shows as her signed note with `[SIGN]` / `[NEGOTIATE]` / `[DON'T SIGN]`, mapping to the existing `accept` / `negotiate` / `refuse` answers through the same handler as `drawRuleChips`. It shows in COMMS under the thread (replacing the plain rule chip there) and on HOME. The P9d chip stays in the scene screen.
  - An `active` rule shows signed by both (the commander's signature is the commander's name in `--alius-font-type`).
  - A rule with `lastBrokenDay ≥ day − 1` shows **torn**. The tear animation plays once per rule and `lastBrokenDay` (UI-local `Set`) and is static under reduced motion.

### PDA HOME and device marks (§5, user: a new HOME view)
- **HOME is a tab.**
  - `TabId` gains `home`. It is **first** in the tab bar and is the device's default tab (`tab` starts as `home`).
  - Number keys: `0` opens HOME, and `1`–`8` keep their old tabs (a new `KEY_TABS` list replaces `TAB_IDS[n-1]` in `shell.ts`).
  - HOME is never locked: `UI_TAB_IDS` (P11) is unchanged and does not include it.
  - Tests that expect the device to open on SQUAD will move. Update them only where they assert the default tab, and say so in the commit body.
- **HOME shows:**
  - the wallpaper (below);
  - day and slot;
  - the notes (pinned, rule, quarters, door), each in her hand;
  - one line per unit with access ≥ 1 (`ACCESS L{n} NAME`, the P9c chip);
  - `[CHANGE WALLPAPER]` when someone else's wallpaper is up.
- **Wallpaper.** The dithered portrait (`unitPortrait`, size 256) of `wallpaperUnit(state)` fills HOME's background at low opacity (`.alius-wallpaper`, `opacity: .35`). It is faded (`opacity: .15` + grayscale) while her decor fades. Readable mode shows no image, only the caption `WALLPAPER: {NAME}`.
- **Stickers.**
  - Registry `stickerArt`: `id`, `name`, `description`, `likeTags` (optional, matched against `unit.likes`), and `svg` (one `path` `d` string, viewBox 0 0 24 24) **or** `glyph` (≤ 2 chars).
  - Her sticker is the first entry whose `likeTags` meet her likes, else `fnv1a(unitId) % n`.
  - Placement: css skins get `stickerSpots: Array<{ x: number; y: number; rot: number }>` (percent of the device, 3 per core skin). Units with a `sticker` part take spots in squad order. Extra stickers and image skins without spots show none.
  - Stickers are drawn in a separate `.alius-device-marks` layer inside the device (`aria-hidden`, `pointer-events: none`), redrawn on every `refresh()`. The chrome is still dressed once (`dressed` cache).
  - A faded sticker uses `data-faded` (opacity .35, desaturated).
- **Peel and change wallpaper (spec: an explicit action with a confirm).**
  - The dossier `[PEEL]` and HOME's `[PEEL STICKER]` / `[CHANGE WALLPAPER]` open `shell.modal` with `PEEL HER {PART}?` / `[PEEL] [KEEP]`. Only PEEL dispatches the existing `device/remove_decor { unitId, part }`, so P9c applies `decor_removed`.
  - "Change wallpaper" peels the current owner's `wallpaper` part. `wallpaperUnit` then picks the next owner, which is P9c's rule and is not changed here.

### Out of scope (stay open)
- Stored whereabouts schedules (P10 open item).
- The accent as data (`unitAccent` stays a fixed list).
- Blurring HP of a hidden injury in the roster.
- Night bookings (P9c).
- A DM-arrival toast.

## File Structure

```
src/engine/vitals.ts              vitalsOf, flickersOf, spikeCauses, VitalsPattern/Band types
src/engine/dmBehaviours.ts        stampBehaviours, replyModeFor, hesitates, receiptOf, slotIndex
src/engine/hand.ts                handOf
src/engine/notes/{state,write,dayStep,index}.ts   HandNote helpers (state.ts is a leaf), notesFor, writeDoorNote, notesDayStep, forgetNotes
src/engine/actions/immersion.ts   squad/set_hand, notes/read, registers notesDayStep
src/engine/actions/comms.ts       + night/door_say, night/door_reply, door note in night/ignore, stamp in dm/receive
src/llm/calls/dmReply.ts          + modes 'curt', 'door'
src/scene/comms.ts                curt mode, throughDoor(text)
src/ui/vitals/{trace,block,strip}.ts
src/ui/comms/living.ts            behaviour bubbles, receipts, typing indicator (used by commsTab)
src/ui/night/door.ts              the door (renderDoor); knock.ts stays for the art fallback
src/ui/notes/{note,ruleNote}.ts   renderNote, renderRuleNote
src/ui/home/homeTab.ts            renderHomeTab
src/ui/device/marks.ts            renderMarks (stickers layer)
src/analysis/providers/immersion.ts
content/core/{dmBehaviours,handFonts,handNotes,stickerArt}.json
css/79-immersion.css, css/01-fonts.css (+hands), css/18-voices.css (note hand)
fonts/hand-*.woff2, fonts/LICENSES/*
docs/MANUAL_TEST_P10b.md
tests/engine/vitals.test.ts, tests/engine/dmBehaviours.test.ts, tests/engine/hand.test.ts, tests/engine/notes.test.ts,
tests/ui/vitals.test.ts, tests/ui/livingDms.test.ts, tests/ui/door.test.ts, tests/ui/notes.test.ts, tests/ui/home.test.ts,
tests/ui/deviceMarks.test.ts, tests/analysis/immersionProviders.test.ts, tests/app-immersion.test.ts
```

## Review Focus

1. **The door timer runs out while the player is typing through the door, or while a door reply is still being generated.** The player expects the countdown to wait, and the knock must not be ignored under them. Test in Task 8 (`timer pauses while the door input has text and while the reply is pending`).
2. **A chat switch or a reload while a door reply is in flight.** The reply must not land in the other chat. A knock that was answered through the door keeps its one exchange after a reload and offers only OPEN / STAY SILENT. Test in Task 8 (`door reply is dropped after a chat change`, `a said door survives a reload`).
3. **VITALS leaking hidden state.** This covers raw stress or Want numbers with raw values off, ledger amounts, and the injury of a unit hiding it. The player must read nothing the dossier would not already show. Tests in Task 1 (`a hidden injury shows no fever`) and Task 2 (the hidden fixture over the new provider).
4. **A DM thread re-rendered after the state changed.** Old bubbles must keep their behaviour (a curt reply stays curt, a voice message stays a voice message). A revealed voice message stays revealed until the tab is rebuilt. Unread counts never include a deleted placeholder. Test in Task 4 (`behaviours are stamped once and survive a state change`) and Task 5 (`placeholder is not unread`).
5. **HOME becoming the default tab.** Number keys, P11 locked tabs, `showTab` before `open()` and the COMMS badge must keep working. Opening the device must still land where the player asked. Test in Task 12 (`0 opens HOME, 1 still opens SQUAD`, `a locked tab stays locked with HOME first`).

---

## Chunk (a): VITALS and living DMs

### Task 1: Vitals engine

**Files:**
- Create: `src/engine/vitals.ts`
- Modify: `src/engine/tuning.ts` (`TUNING.vitals = { conflictDelta: 3, flickerDelta: 3, flickerLog: 5 }`), `src/content/schemas.ts` (defect field `vitals: z.enum(['flat']).optional()`), `content/core/defects.json` (`affect_dampener.vitals = "flat"`)
- Test: `tests/engine/vitals.test.ts`

**Interfaces:**
- Produces:
  - `type VitalsPattern = 'steady' | 'elevated' | 'spiking' | 'flat' | 'erratic'`
  - `type SpikeCause = 'combat' | 'conflict' | 'commander_near' | 'want'`
  - `interface Vitals { unitId: string; pattern: VitalsPattern; heart: 'low' | 'resting' | 'raised' | 'racing'; temp: 'cool' | 'normal' | 'warm' | 'fever'; spikes: SpikeCause[]; flicker: boolean }`
  - `vitalsOf(state, reg, unitId): Vitals | null`
  - `flickersOf(state, unitId): Array<{ day: number; slot: Slot }>`
  - `hidesInjury(state, reg, unitId): boolean`

- [x] **Step 1: Write the failing tests**

All use `campaign(reg, 4)` from `tests/helpers/world`:
- `steady at low stress`;
- `elevated when stress band is strained` (set stress to the band's floor);
- `erratic in a breakdown`;
- `combat spike from a combat/ ledger entry today`;
- `conflict spike from a trust drop of 3 this slot, not of 2`;
- `commander_near while she is in the open scene`;
- `want spike only from aching`;
- `affect dampener is flat with spikes listed`;
- `flicker from an affinity gain of 3 in the previous slot, logged by flickersOf`;
- `a hidden injury shows no fever` (a kept secret of a `hidden_injury` kind about her while `injuryDays > 0`, expect temp `normal`; without the secret, expect `fever`);
- `grunt and dead unit give null`;
- `no rng is drawn`: the state's `rng` is deep-equal before and after.

- [x] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/engine/vitals.test.ts`. Expected: FAIL (module not found).

- [x] **Step 3: Implement `vitals.ts`**

Implement it as ruled in "Telemetry". Read the defect field with `reg.defects.get(d.id)?.vitals === 'flat'`, stress bands with `stressBand`, Want with `wantBandOf`, and secret kinds by `source`.

- [x] **Step 4: Run tests, then `npm test`**

Expected: PASS; full suite green.

- [x] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(P10b): derived vitals (patterns, spikes, flickers, hidden injury)"
```

### Task 2: VITALS block, hub strip and provider

**Files:**
- Create: `src/ui/vitals/trace.ts`, `src/ui/vitals/block.ts`, `src/ui/vitals/strip.ts`, `src/analysis/providers/immersion.ts`, `css/79-immersion.css`
- Modify:
  - `src/ui/squad/squadTab.ts` (VITALS block after the stress line, named and not gone);
  - `src/ui/hub/hubScreen.ts` (strip under TONIGHT);
  - `src/analysis/providers/core.ts` (register `registerImmersionProviders`);
  - `content/core/glossary.json` (`vitals`, `vitals_flat`, `vitals_flicker`);
  - `tests/fixtures/analyze/hidden.ts` (sample address `glossary:vitals` with `{ unitId }`).
- Test: `tests/ui/vitals.test.ts`, `tests/analysis/immersionProviders.test.ts`

**Interfaces:**
- Consumes: `vitalsOf`, `flickersOf` (Task 1)
- Produces:
  - `tracePoints(pattern: VitalsPattern, seed: string, n = 48): number[]` (0–1, deterministic by `fnv1a(seed + i)`; flat = a line at 0.5 with one blip when `flicker`)
  - `renderVitalsBlock(state, reg, unitId, opts: { motion: boolean }): HTMLElement | null`
  - `renderVitalsStrip(state, reg, opts): HTMLElement | null`
  - `HEART_TEXT`, `TEMP_TEXT` (the band texts of the ruling)
  - provider `glossary:vitals`

- [x] **Step 1: Write the failing tests**
  - `block shows pattern chip, HR and TEMP with data-analyze="glossary:vitals"`.
  - `block text contains no digit outside the HR/TEMP band texts`: strip the band texts, then assert there is no `/\d/`.
  - `flat unit lists flickers as DAY ### SLOT`.
  - `trace is an svg polyline with 48 points, same seed same points`.
  - `no sweep class under reduced motion` (`opts.motion: false` → no `.is-sweeping`).
  - `strip lists named living units only`.
  - Provider:
    - `reading words the pattern and its causes in bands`;
    - `hidden fixture leaks nothing` (add `registerImmersionProviders` to the hidden test's registration and assert `leaks(...)` is `[]` for raw on and off).
  - `tests/ui/analyzeCoverage.test.ts` stays green.

- [x] **Step 2: Run to verify they fail**

- [x] **Step 3: Implement**

SVG through `document.createElementNS` + `setAttribute`. The sweep is a CSS animation class only when `opts.motion`. Glossary long texts are `AUTHOR TO WRITE` and say what each pattern *can* mean (no mind-reading).

- [x] **Step 4: Run tests, then `npm test`**

- [x] **Step 5: Commit**

```bash
git commit -am "feat(P10b): VITALS block, hub strip and analysis provider"
```

### Task 3: `dmBehaviours` registry

**Files:**
- Create: `content/core/dmBehaviours.json`
- Modify:
  - `src/content/types.ts` (`REGISTRY_NAMES` + `dmBehaviours`);
  - `src/content/schemas.ts` (schema, `DESCRIBED_REGISTRIES`);
  - `content/core/manifest.json`;
  - `content/core/glossary.json` (`dm_behaviour`, `read_receipt`, `voice_message`);
  - `tests/content/pronouns.test.ts`.
- Test: `tests/content/dmBehaviours.test.ts`

**Interfaces:**
- Produces: registry entries `{ id, name, description, kind, chance, when? }` as ruled. Core drafts:
  - `hesitate_avoidant` (attachment avoidant, 0.5);
  - `hesitate_after_conflict` (afterConflictSlots 2, 0.6);
  - `deleted_after_conflict` (0.3);
  - `burst_wanting` (minWant 40, 0.5);
  - `late_wanting` (minWant 40, initiated, slots evening/night, 1);
  - `voice_close` (stateGroups romantic/platonic, 0.15);
  - `curt_resentful` (states as a data list incl. `resentful`, 1);
  - `curt_affinity_drop` (affinityDrop 5, 0.7).

- [x] **Step 1: Write the failing tests**
  - `core pack loads dmBehaviours with every kind present`;
  - `schema rejects an unknown kind and a chance above 1`;
  - `every state id in when.states exists` (refs check);
  - pronoun test covers the file.

- [x] **Step 2: Run to verify they fail**

- [x] **Step 3: Implement**

Schema, refs (states must exist), JSON, glossary.

- [x] **Step 4: Run, `npm test`**

- [x] **Step 5: Commit**

```bash
git commit -am "feat(P10b): dmBehaviours registry"
```

### Task 4: Behaviour engine, curt and receipts

**Files:**
- Create: `src/engine/dmBehaviours.ts`
- Modify:
  - `src/engine/state/types.ts` (`DmMessage.behaviours?: string[]`);
  - `src/engine/actions/comms.ts` (`dm/receive` stamps; payload `mode?: 'curt'` stamps the `curt` entry that decided it);
  - `src/llm/calls/dmReply.ts` (modes `curt`, `door`; `door` is used in Task 8);
  - `src/scene/comms.ts` (`replyModeFor` before `generateDm`).
- Test: `tests/engine/dmBehaviours.test.ts`, `tests/llm/dmReply.test.ts` (extend), `tests/scene/comms.test.ts` (extend)

**Interfaces:**
- Produces:
  - `whenHolds(state, reg, unitId, when, ctx: { initiated: boolean }): boolean`
  - `stampBehaviours(state, reg, unitId, msg: Pick<DmMessage, 'id' | 'initiated' | 'slot'>): string[]`
  - `replyModeFor(state, reg, unitId, base: 'reply' | 'snap'): 'reply' | 'snap' | 'curt'`
  - `hesitates(state, reg, unitId): boolean`
  - `receiptOf(state, unitId, msg): { status: 'delivered' | 'read' | 'left_on_read'; slotsAgo?: number }`
  - `slotIndex(day, slot): number`
  - `DmReplyInput.mode` adds `'curt' | 'door'`

- [x] **Step 1: Write the failing tests**
  - `stamp is a pure function of message id and state` (same input → same ids; a different id can differ).
  - `at most one entry per kind`.
  - `late needs initiated and evening/night`.
  - `behaviours are stamped once and survive a state change`: receive at Want 50, then set Want 0; the stored `behaviours` are unchanged.
  - `curt only replaces reply, never snap`.
  - `no rng drawn by dm/receive` (rng deep-equal).
  - `receipt read / left_on_read 2 slots ago / delivered`.
  - `hesitates is keyed by the last commander message`.
  - dmReply:
    - `curt mode text asks for one or two words`;
    - `door mode text says through the closed door`;
    - neither text has a commander pronoun.
  - comms: `a resentful unit is asked in curt mode and the reply is stamped curt`.

- [x] **Step 2: Run to verify they fail**

- [x] **Step 3: Implement**

The hash test is `fnv1a(key) % 1000 < Math.round(chance * 1000)`. A seeded test that deep-equals a thread and now gets `behaviours` stops and reports.

- [x] **Step 4: Run, `npm test`**

- [x] **Step 5: Commit**

```bash
git commit -am "feat(P10b): DM behaviours stamped at receipt, curt replies, read receipts"
```

### Task 5: Living COMMS thread

**Files:**
- Create: `src/ui/comms/living.ts`
- Modify:
  - `src/ui/comms/commsTab.ts` (bubbles through `living.ts`, receipts under commander bubbles, typing indicator, contact name; `CommsTabCtx.motion?: () => boolean`);
  - `src/app.ts` (passes `motion`);
  - `css/79-immersion.css`.
- Test: `tests/ui/livingDms.test.ts`

**Interfaces:**
- Consumes: Task 4 readers; `decorOf` (P9c)
- Produces:
  - `renderHerMessage(state, reg, unitId, msg, opts: { revealed: Set<string>; onReveal(id): void; accent: string }): HTMLElement[]`
  - `renderReceipt(state, unitId, msg): HTMLElement | null`
  - `renderTyping(motion: boolean): HTMLElement`
  - `splitBurst(text): string[]` (2–3 parts at `. ! ?` boundaries; one part when there is no boundary)

- [ ] **Step 1: Write the failing tests**
  - `deleted placeholder before her bubble, not counted by unreadOf` (placeholder is not unread).
  - `burst splits into 2–3 bubbles`.
  - `voice shows a waveform and [PLAY]; click reveals the text; a re-render of the same host keeps it revealed`.
  - `late stamp`.
  - `receipt texts READ / READ · 2 SLOTS AGO / SEEN · NO REPLY`.
  - `typing indicator only when hesitates and the thread ends with the commander`.
  - `static typing line under reduced motion`.
  - `contact row shows her contact name; faded decor dims it; header keeps the real name`.
  - Every chip / receipt / voice button carries `data-analyze` (`glossary:dm_behaviour`, `glossary:read_receipt`, `glossary:voice_message`).
  - Coverage test green.

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Implement**

The revealed `Set` is kept in a `WeakMap<HTMLElement, Set<string>>` like `drafts`. The typing indicator's timer is cleared when the host re-renders (store the handle per host).

- [ ] **Step 4: Run, `npm test`**

- [ ] **Step 5: Commit, stop (end of chunk (a))**

```bash
git commit -am "feat(P10b): living DMs in COMMS (placeholders, bursts, voice, receipts, typing, contact name)"
```

---

## Chunk (b): night, door, handwriting, notes, HOME, device marks

### Task 6: Night theme and night sound

**Files:**
- Modify:
  - `src/ui/shell/shell.ts` (`applySettings`/`refresh` set `root.dataset.night`);
  - `src/ui/sound/sound.ts` (`Sound.setNight(on: boolean)`, gain × `NIGHT_GAIN`);
  - `src/app.ts` (calls `sound.setNight(state?.slot === 'night')` on refresh);
  - `css/79-immersion.css` (`[data-night="true"]` variables, `--alius-motion-scale`);
  - `content/core/glossary.json` (`night_theme`).
- Test: `tests/ui/shell.test.ts` (extend), `tests/ui/motion.test.ts`, `tests/ui/palette.test.ts` (extend), `tests/ui/sound.test.ts` (extend)

**Interfaces:**
- Produces: `NIGHT_GAIN = 0.5`, `Sound.setNight(on)`, root attribute `data-night`

- [ ] **Step 1: Write the failing tests**
  - `data-night only in the night slot`, and gone after the slot rolls.
  - `night halves the effective gain`.
  - `readable mode keeps data-night but sets alius-readable` (the CSS drops dimming under `.alius-readable`; palette test parses the night variables and asserts ≥ 4.5:1 for each fg/bg pair in all three palettes).
  - `no motion-scale transition under reduced motion`.

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run, `npm test`**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(P10b): night theme and quieter night sound"
```

### Task 7: Door engine (`night/door_say`, `night/door_reply`)

**Files:**
- Modify:
  - `src/engine/state/types.ts` (`NightEntry.door?: { said: string; reply?: string }`);
  - `src/engine/actions/comms.ts`;
  - `src/content/schemas.ts` (`RESERVED_EVENT_TYPES` + `door_said`, `door_replied`).
- Test: `tests/engine/door.test.ts`

**Interfaces:**
- Produces:
  - action `night/door_say { text }` → `door_said { unitId }`. Errors: no knock, confrontation, already said, text 1–300.
  - action `night/door_reply { text }` → `door_replied { unitId }`. Errors: nothing said, a reply exists, text 1–400.

  Neither spends a slot or changes a relation (intents come separately through `intents/apply`).

- [ ] **Step 1: Write the failing tests**
  - `say once, second say rejected and state unchanged`;
  - `reply needs a said line`;
  - `confrontation entries refuse door_say`;
  - `night/open after a door exchange still opens the scene`;
  - `night/ignore after a door exchange applies the ignore consequence`.

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run, `npm test`**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(P10b): one exchange through the door (engine)"
```

### Task 8: The door UI, timer, knock sound, through-the-door call

**Files:**
- Create: `src/ui/night/door.ts`
- Modify:
  - `src/content/schemas.ts` (`SOUND_IDS` + `knock`);
  - `content/core/uiSounds.json` (`knock` synth);
  - `src/settings.ts` (`doorTimer: 15`, int 0–60);
  - `src/ui/shell/sysTab.ts` (SYS › Display, number field `doorTimer` with `data-analyze="glossary:setting_door_timer"`);
  - `src/scene/comms.ts` (`throughDoor(text): Promise<void>`: dispatch `night/door_say`, `generateDm` mode `door`, `night/door_reply`, `readExchange`, all with `expectChatId`);
  - `src/app.ts` (`renderSceneView` uses `renderDoor` for non-confrontation knocks);
  - `content/core/glossary.json` (`night_door`, `setting_door_timer`);
  - `css/79-immersion.css`.
- Test: `tests/ui/door.test.ts`, `tests/scene/comms.test.ts` (extend), `tests/app-immersion.test.ts`, `tests/settings.test.ts`

**Interfaces:**
- Consumes: Task 7 actions; `generateDm` mode `door` (Task 4)
- Produces:
  - `renderDoor(host, ctx: DoorCtx)`, where `DoorCtx = { entry: NightEntry; unitName: string; silhouette?: () => HTMLElement | null; seconds: number; motion: boolean; readable: boolean; sound?: { play(id: SoundId): void }; onOpen(): void; onSay(text: string): Promise<void>; onSilent(): void }`
  - `Comms.throughDoor(text)`

- [ ] **Step 1: Write the failing tests** (fake timers)
  - `three options with data-analyze`.
  - `timer reaches 0 and calls onSilent once`.
  - `doorTimer 0 shows no timer and never calls onSilent`.
  - `timer pauses while the door input has text and while the reply is pending`.
  - `a redraw keeps the deadline` (same entry id).
  - `after the exchange only OPEN and STAY SILENT remain and the timer restarts`.
  - `a said door survives a reload` (entry with `door.said` and `reply` renders both lines).
  - `knock sound once per entry per host`.
  - `no shake class under reduced motion, no blur in readable mode`.
  - `no silhouette without cardRef: ascii door`.
  - Comms: `door reply is dropped after a chat change`; `a failed generation leaves said without reply and shows No answer through the door.`
  - App: `a want_visit knock renders the door; a mutiny confrontation still renders its panel`.

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Implement**

The countdown uses `setInterval(250)` against a deadline `Map<entryId, { remaining: number }>`, so paused time is not counted. Any input focus uses `preventScroll`. `knock.ts` keeps its ASCII art export for the fallback, and `renderKnock` stays exported (its tests stay).

- [ ] **Step 4: Run, `npm test`**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(P10b): the night door with timer, silhouette, knock and one exchange"
```

### Task 9: Hand fonts

**Files:**
- Create:
  - `fonts/hand-{caveat,indie-flower,patrick-hand,shadows-into-light,kalam,nanum-pen-script}-400.woff2` (from `@fontsource/<name>@5.3.0` `files/<name>-latin-400-normal.woff2`; installed into a scratch folder, not added to `package.json`);
  - `fonts/LICENSES/<name>.txt`;
  - `content/core/handFonts.json`;
  - `src/engine/hand.ts`;
  - `src/engine/actions/immersion.ts`.
- Modify:
  - `css/01-fonts.css`;
  - `css/18-voices.css` (`.alius-note` body font `var(--alius-font-hand, var(--alius-font-type))`; readable mode → `--alius-font-type`);
  - `src/engine/state/types.ts` (`Unit.hand?: string`);
  - registry plumbing (`REGISTRY_NAMES`, schema, `DESCRIBED_REGISTRIES`, manifest);
  - `src/ui/squad/squadTab.ts` (HAND select, named units, `data-analyze="glossary:handwriting"`; `SquadTabCtx.onSetHand?`);
  - `src/app.ts`;
  - `content/core/glossary.json` (`handwriting`);
  - `tests/assets.test.ts` (expected font list).
- Test: `tests/engine/hand.test.ts`, `tests/ui/squad.test.ts` (extend), `tests/assets.test.ts`

**Interfaces:**
- Produces:
  - `handOf(state, reg, unitId): Entry | null` (null for grunts)
  - `handFamily(entry): string`
  - action `squad/set_hand { unitId, handId }` → `hand_set`

- [ ] **Step 1: Write the failing tests**
  - `default hand is stable by unit id and needs no stored field`;
  - `set_hand stores and is read back; unknown id rejected; grunt rejected`;
  - `re-sync keeps the hand`;
  - `every font file is referenced by a relative url and has a licence`;
  - `dossier select changes the hand`.

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run, `npm test`**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(P10b): bundled hand fonts and per-unit handwriting"
```

### Task 10: Hand notes engine

**Files:**
- Create:
  - `src/engine/notes/state.ts` (leaf: `notesOf(draft)`, `forgetNotes`);
  - `src/engine/notes/write.ts`;
  - `src/engine/notes/dayStep.ts`;
  - `src/engine/notes/index.ts`;
  - `content/core/handNotes.json`.
- Modify:
  - `src/engine/state/types.ts` (`HandNote`, `CampaignState.notes?`);
  - `src/engine/tuning.ts` (`TUNING.notes = { keepDays: 3, max: 12 }`);
  - registry plumbing;
  - `src/engine/actions/immersion.ts` (`notes/read`, registers `notesDayStep` on `dm_rumors`);
  - `src/engine/actions/comms.ts` (`night/ignore` calls `writeDoorNote`);
  - `src/engine/leash/use.ts` (`removeFromService` calls `forgetNotes`);
  - `RESERVED_EVENT_TYPES` (`note_left`, `note_read`, `notes_expired`, `hand_set`);
  - `content/core/glossary.json` (`hand_note`).
- Test: `tests/engine/notes.test.ts`

**Interfaces:**
- Produces:
  - `notesFor(state, where?: HandNote['where']): HandNote[]` (unexpired, newest first)
  - `unreadNotes(state): number`
  - `writeDoorNote(draft, reg, unitId): EngineEvent[]`
  - `notesDayStep(draft, ctx): EngineEvent[]`
  - action `notes/read { id }`

- [ ] **Step 1: Write the failing tests**
  - `no note for a squad without an imported bond` (ten day ends, `notes` stays absent, rng deep-equal);
  - `a daily quarters note for access ≥ 2, at most one per unit per day, none while one is unread`;
  - `an unanswered knock leaves a door note; opening it does not`;
  - `notes expire after 3 days and the list caps at 12`;
  - `read marks it`;
  - `removeFromService forgets her notes`;
  - `text has {name} filled`.

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Implement**

The day step goes after the personal day step (import order in `actions/immersion.ts`, imported by `app.ts` after `actions/personal`).

- [ ] **Step 4: Run, `npm test`**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(P10b): hand notes (quarters, gear, under the door)"
```

### Task 11: Note cards, rule notes, notes on the hub and INV

**Files:**
- Create: `src/ui/notes/note.ts`, `src/ui/notes/ruleNote.ts`
- Modify:
  - `src/ui/hub/roomPanel.ts` (room with `commanderCell`: quarters + pinned notes);
  - `src/ui/hub/model.ts` (`TonightItem.kind` + `note`: an unread door note from today or yesterday);
  - `src/ui/inv/invTab.ts` (gear notes on top);
  - `src/ui/comms/commsTab.ts` (rule proposals as rule notes instead of `drawRuleChips`);
  - `src/app.ts`;
  - `content/core/glossary.json` (`rule_note`);
  - `css/79-immersion.css` (tear animation).
- Test: `tests/ui/notes.test.ts`, `tests/ui/hubModel.test.ts` (extend)

**Interfaces:**
- Consumes: `handOf` (Task 9), `notesFor` (Task 10), `pinnedNotes`, `rulesOf`
- Produces:
  - `renderNote(o: { text: string; unitName: string; hand: Entry | null; read?: boolean; onRead?(): void; analyze: string }): HTMLElement` (paper voice, class `alius-note`, sets `--alius-font-hand`)
  - `renderRuleNote(state, reg, rule, on: RuleChipHandlers, opts: { motion: boolean }): HTMLElement`

- [ ] **Step 1: Write the failing tests**
  - `note sets the hand family`;
  - `readable mode note uses the type font` (class check);
  - `quarters panel shows her notes in her hand`;
  - `[SIGN]/[NEGOTIATE]/[DON'T SIGN] call accept/negotiate/refuse`;
  - `active rule note is signed by both, with no pronoun in its text`;
  - `a rule broken yesterday shows torn; the tear animates once and is static under reduced motion`;
  - `tonight lists an unread door note`;
  - `gear notes on INV`;
  - coverage test green.

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run, `npm test`**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(P10b): handwritten notes and signed/torn rule notes"
```

### Task 12: PDA HOME tab and wallpaper

**Files:**
- Create: `src/ui/home/homeTab.ts`
- Modify:
  - `src/ui/shell/tabs.ts` (`TabId` + `home`, first in `TAB_IDS`, label `HOME`);
  - `src/ui/shell/shell.ts` (default tab `home`; `KEY_TABS = ['squad','ops','map','comms','base','inv','log','sys']` for `1`–`8`, `0` → `home`; HOME badge = `unreadNotes`);
  - `src/app.ts` (`registerTab('home', …)`, `setTabBadge('home', …)`);
  - `content/core/glossary.json` (`pda_home`);
  - existing shell tests only where they assert the default tab.
- Test: `tests/ui/home.test.ts`, `tests/ui/shellDevice.test.ts`, `tests/ui/shellLocks.test.ts` (extend)

**Interfaces:**
- Produces: `renderHomeTab(host, ctx: { getState; registries; st; settings; onReadNote(id); onPeel(unitId, part): void /* confirmed by the app */; rule: RuleChipHandlers })`

- [ ] **Step 1: Write the failing tests**
  - `device opens on HOME`;
  - `0 opens HOME, 1 still opens SQUAD`;
  - `a locked tab stays locked with HOME first`;
  - `HOME is never locked`;
  - `wallpaper is the owner's dithered portrait, faded while her decor fades, absent in readable mode with a caption`;
  - `pinned, rule and door notes on HOME`;
  - `access lines with data-analyze`;
  - `HOME badge counts unread notes`.

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run, `npm test`**

Moved default-tab expectations are listed in the commit body.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(P10b): PDA HOME view with wallpaper and notes"
```

### Task 13: Stickers on the device and peel with confirm

**Files:**
- Create: `src/ui/device/marks.ts`, `content/core/stickerArt.json`
- Modify:
  - registry plumbing;
  - `src/content/schemas.ts` (`deviceSkins[].stickerSpots` optional);
  - `content/core/deviceSkins.json` (3 spots each);
  - `src/ui/shell/shell.ts` (a `.alius-device-marks` layer, `ShellDeps.marks?: (layer: HTMLElement) => void` called on every refresh);
  - `src/ui/personal/deviceBlock.ts` (PEEL through `onPeel`, which the app now confirms);
  - `src/app.ts` (`confirmPeel(unitId, part)` → `shell.modal` → `device/remove_decor`);
  - `content/core/glossary.json` (`device_marks`).
- Test: `tests/ui/deviceMarks.test.ts`, `tests/app-immersion.test.ts` (extend)

**Interfaces:**
- Produces:
  - `stickerFor(state, reg, unitId): Entry | null`
  - `renderMarks(layer, state, reg, skin: Entry): void`
  - `ShellDeps.marks`

- [ ] **Step 1: Write the failing tests**
  - `a decorated unit's sticker sits on the first spot, rotated`;
  - `likeTags pick before the hash`;
  - `faded sticker is marked faded`;
  - `an image skin without spots shows none`;
  - `layer is aria-hidden and ignores the pointer`;
  - `a refresh redraws marks without re-dressing the chrome` (the `renderChrome` spy is called once);
  - app: `PEEL asks first; KEEP changes nothing; PEEL dispatches device/remove_decor and the sticker is gone`;
  - `CHANGE WALLPAPER peels the owner's wallpaper part`.

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Implement**

The SVG `path` `d` is set with `setAttribute`; a `glyph` sticker uses `textContent`.

- [ ] **Step 4: Run, `npm test`**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(P10b): stickers on the device frame, peel with confirm"
```

### Task 14: Docs and hand-offs

**Files:**
- Create: `docs/MANUAL_TEST_P10b.md`
- Modify:
  - `docs/packages/P10b-intimate-immersion-ui.md` (status line + **Implemented as**: rulings, open items, non-obvious things);
  - `docs/00-overview.md`:
    - §5.4 rows for P10b;
    - §8 setting `doorTimer`;
    - §9 status `implemented`;
    - §5.4 heading list;
  - `docs/packages/P17c-immersion-and-staging.md` (**Interfaces already provided by P10b**);
  - `docs/packages/P10-visual-upgrade.md` (open items: hand fonts done; schedules and accent still open);
  - `docs/ROADMAP-next.md` (P10b **done**);
  - `CLAUDE.md` (one P10b rule line in the style of the others).

- [ ] **Step 1:** Run `npm test` and `npm run typecheck`. Expected: all green.
- [ ] **Step 2:** Write the docs. The manual test covers acceptance 1–6 in SillyTavern: the real `door` / `curt` wording, fonts rendering, night colours, sticker placement on each skin.
- [ ] **Step 3: Commit**

```bash
git commit -am "docs(P10b): implemented as, overview, hand-offs, manual test"
```
