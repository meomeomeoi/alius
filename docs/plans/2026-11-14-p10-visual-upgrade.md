# P10 Visual Upgrade (Hub, Device Skins, Voices) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "ASCII everywhere" with layered visual languages that carry meaning, without losing the terminal feel: a **hub** (cross-section of the outpost) becomes the home screen, the **PDA is a physical device** that slides up over it, the device wears a **faction skin**, text comes in four **voices** (terminal, corporate, paper, personal), PDA portraits are **dithered** into the phosphor palette, and the shell gets semantic colours, motion, sound, bundled fonts and a readable mode.

**Architecture:** No engine rule changes. One pure reader goes into the engine (`src/engine/hub.ts`: where each unit is this slot, derived and stateless). Two registries are added (`hubRooms`, `deviceSkins`) plus a small non-player-visible one (`uiSounds`). The shell gains a `hub` screen; the PDA tab bar, status and panel move into a device layer rendered by the hub screen (`showScreen('pda')` keeps meaning "PDA up", so every tab behaves as before). New UI folders: `src/ui/hub/` (screen, room panel, pure view models), `src/ui/device/` (skin pick, chrome, boot), `src/ui/voice/` (`VoiceCard`), `src/ui/portrait/` (Bayer dither + cache), `src/ui/sound/` (WebAudio player with synth fallback), `src/ui/motion.ts` (one reader of motion/readability settings). Fonts are bundled as woff2 under `fonts/` and referenced from `css/01-fonts.css`. Chunk (a) = Tasks 1–4 (hub). Chunk (b) = Tasks 5–6 (device and skins). Chunk (c) = Tasks 7–12 (fonts, colour, motion, voices, portraits, sound, docs).

**Tech Stack:** TypeScript 5 (strict), esbuild, zod 3, vitest (+ jsdom for UI). No new runtime dependencies. Font files come from the `@fontsource/*` npm packages (OFL), copied in once; they are not dependencies.

**Spec:** `docs/00-overview.md` (§3 P8/P12, §5, §5.4, §8), `docs/packages/P10-visual-upgrade.md`. Read as implemented: `P7a-analysis-tool.md` (**Implemented as**: marker classes, `animationMs`, the panel's `z-index`), `P2-calendar-base-economy.md`, `P3-scenes-relationships-memory.md`, `P6-dilemmas-disloyalty-leash.md` (the oversight form), `P9-impunity-discipline.md` (restrictions). Read `docs/content/lore.md` every session (§0 pronoun rule). Visual reference: the canvas "Alius — main screen directions" (claude.ai artifact `4aac45ad-b807-4e40-9559-0d52d977c9d0`): `Main.dc.html` (direction A: blueprint cross-section, right column), `Hybrid.dc.html` (direction C: hub + PDA pulled up, `ccp_standard` device), `SkinKestrel.dc.html`, `SkinVesper.dc.html`. The CSS values to port are quoted in Tasks 4 and 6, so executors do not need the canvas.

**Baseline (2026-11-14, `a68ce80`):** `npm test` → 224 files, 3838 tests, all green.

## Global Constraints

- English everywhere (overview P8). All UI text goes through `textContent` / `h()`, never `innerHTML`; SVG decor is built with `document.createElementNS`, never from strings.
- `src/engine/**` stays pure (architecture test). `src/engine/hub.ts` imports only `src/content` types and `src/engine` modules and draws **no** RNG.
- **No network requests other than extension files** (acceptance 7): no Google Fonts, no CDN, no remote images or audio. `style.css` contains no `url(` with a scheme or `//`, and no `@import`. All art, frames, audio and fonts are resolved through `AppDeps.assetUrl` (JS) or relative `url()` (CSS).
- **Colour never carries meaning alone** (spec §5): every semantic colour is paired with a glyph or a label.
- **Contrast:** text ≥ **4.5:1** against its background in every palette and every voice (spec §7). The existing palettes are ≥ 7:1 and stay so.
- **Motion:** everything that animates honours `prefers-reduced-motion` **and** the new `reducedMotion` setting through `motionReduced()` (Task 8). The boot sequence is **≤ 600 ms** and skippable by any key or click.
- **Data, not ids** (overview P4): code reads rooms by `hosts` / `activityIds` / `sceneLocationId`, skins by `bindTo` / `kind`, sounds by their `SoundId`; it never tests a room, skin, location or facility id. The only fixed ids are the fallback skin `ccp_standard` and the `SoundId` names.
- Overview P12: every new stat, chip, option and choice on the hub, the room panel, the device chrome and SYS carries `data-analyze`; `hubRooms` and `deviceSkins` get `description` and join `DESCRIBED_REGISTRIES`; new concepts and every new setting get glossary entries (`setting_<snake_case>`). `tests/ui/analyzeCoverage.test.ts` and `tests/analysis/hidden.test.ts` stay green. The analysis panel stays above the device and the modal layer (`z-index` order in Task 3).
- **No pronoun for the commander** in any new text (glossary, room and skin descriptions, hub lines, Tonight items). Soldiers are "she". `tests/content/pronouns.test.ts` covers `hubRooms`, `deviceSkins` and `src/ui/hub/model.ts`.
- Campaign state stays `version: 1` and gains **no field**. P10 changes no save.
- New settings (global, `src/settings.ts`, validated by `fieldSchemas`), defaults verbatim: `ditheredPortraits: true`, `readableMode: false`, `reducedMotion: false`, `soundVolume: 20` (int 0–100), `soundMuted: false`, `ambientHum: false`, `deviceSkin: ''` (empty = follow the campaign; otherwise a `deviceSkins` id).
- `dist/index.js` and `style.css` are committed; `npm test` rebuilds them. Check its exit code before committing. Commit messages end with the executing agent's `Co-Authored-By:` / `Claude-Session:` trailers.

## Where the plan rules on the spec (read before Task 1)

Rulings taken while planning; those marked **user** were answered by the user on 2026-11-14. Task 12 copies them into the spec's **Implemented as**.

- **Whereabouts are derived, not stored (user).** The engine has no schedules (`calendar.scheduled` is unused and activities name no room). `whereabouts(state, reg)` computes each unit's room every time from what the engine knows, then from a stable hash, with no state and no RNG draw:
  1. `dead`, `deserted`, `terminated` → not on the hub. In the open expedition's party → `away: 'expedition'` (listed in an AWAY strip, not in a room).
  2. Injured (`status === 'injured'` or `injuryDays > 0`) → the room whose `hosts` has `injured`.
  3. A P9 restriction: `confined` → the room hosting `confined`; `duty` in its `dutySlot` → the room hosting `duty`.
  4. Night slot → the room hosting `night`.
  5. Otherwise a weighted pick over rooms with `weights[slot] > 0` whose `sceneLocationId` is open in this slot (`locations.slots`) and whose `facilityId`, if any, has level ≥ 1 (absent = 1). Weight = `weights[slot]` + **2** if one of the room's `likeTags` is in `unit.likes`. The pick uses FNV-1a 32-bit of `` `${day}|${slot}|${unitId}` `` modulo the total weight. Same state → same answer on every redraw.
  Grunts are placed like named units (marker without a state glyph). P10b may later replace step 5 with a stored schedule.
- **Room panel actions.** `[TALK]` next to a present named unit starts the `talk` activity with her as companion and opens the scene **at the room's `sceneLocationId`** without the location picker (`app.talkAt(unitId, locationId)`). It is disabled with the reason from `restrictionReason(state, id, 'scene')`, an open scene/talk, an open expedition, a presented dilemma, a closed location this slot, or no slot left. The room's `activityIds` render as the same cards the OPS tab shows (`activityCard` is exported from `opsTab.ts`, same `OpsTabCtx`).
- **`END {SLOT}`** dispatches `calendar/consume_slot { slots: 1, reason: 'pass' }` after a confirm modal (`End the {slot} without doing anything?` · `[ END {SLOT} ]` / `Cancel`); in a quiet night it dispatches `calendar/sleep` instead. Disabled with a reason by `endSlotBlock(state)` (Task 2). No engine change: `consume_slot` already accepts any reason when no talk is open.
- **Objective (stub until P11).** `currentObjective(state, reg)`: the active mission with a `spineBeat`, else the active mission with the nearest `deadlineDay`, else an offered mission with a `spineBeat`, else `null` (`NO STANDING ORDERS`). P11 replaces the body and keeps the signature.
- **Tonight.** At most **6** items, in this order: a night entry of kind `talk` queued for tonight (`{name} will knock tonight.` — the same fact the existing toast already tells); unread DMs per unit (`{name}: {n} unread message(s).`); an open delivered demand (`{name} is waiting for an answer.`); an incoming unit (`A new unit is waiting for intake.`); a mission with `deadlineDay − day ≤ 1` (`{title}: due {today|tomorrow}.`); warnings (`SHORTAGE {n}d`, `INJURED {n}d`). Nothing here may reveal a value the PDA does not already show (no hidden night kinds, no stance, no Impunity).
- **Marker tone** (`markerTone(state, reg, unit)`): `danger` if stress ≥ 80, injured, or the loyalty band is `breaking`; else `bond` if her relationship state has `romance: true`; else `trust` for group `platonic`; else `warn` for group `negative` or stress ≥ 50; else `affinity` when Affinity's band is `HIGH` (`valueBand`); else `neutral`. The ring colour comes from `--alius-<tone>`; the marker also shows the state's `glyph` (named) and a tone glyph (`!` danger, `♥` bond, `+` trust, `*` affinity, `~` warn) so colour is never the only carrier.
- **Shell layout.** The router gains `ScreenId 'hub'` and starts on it: `shell.open()` shows the hub with the device down. `showScreen('pda')` renders the hub **with the device up** (tab bar, status and panel unchanged in behaviour — acceptance 2); `showScreen('hub')` renders it with the device down. `scene`, `combat`, `expedition`, `setup` stay full-window screens as today. App calls that return home after a scene, combat, expedition, confrontation or setup go to `'hub'`; calls followed by `showTab(…)` stay on `'pda'`.
- **Device size (user).** Wider than 1200 px: the device takes the right ~55% of the window (`width: clamp(720px, 55vw, 980px)`, `right: 48px`, top below the hub's top bar, bottom bleeding off-screen by 40 px as in the canvas), so the hub's left column stays visible. At ≤ 1200 px it takes the full width (`left/right: 8px`).
- **Keys (user).** `Tab` toggles the device **only when focus is not on a control** (the shell root, the hub background, the device screen, the panel container, `document.body`); on a button, link, input, select, textarea, summary or contenteditable it moves focus as usual. `Escape` closes, in this order: the open modal → the analysis panel (the analyzer already handles it) → the device. `1`–`8` on the hub open the device at that tab; inside the device they keep selecting tabs. None of these fire while typing (`isEditable`) or with Ctrl/Meta/Alt.
- **Stacking.** Inside `#alius-shell`: hub 0 → device 1 → toasts 2 → modal layer 3 → analysis panel 10 (unchanged). While down the device is `inert` and `aria-hidden="true"`.
- **Skins.** `pickSkin(state, reg, override)` precedence: a valid `override` (the `deviceSkin` setting) → a skin whose `bindTo.traitId` is in `traitIds(state)` → whose `bindTo.unlockFlag` is in `world.flags` or `commander.flags` → whose `bindTo.corporationId` equals `commander.corporationId` → `ccp_standard`. Ties: registry order. With no campaign: override or `ccp_standard`. The spec's `screenRect` needs the frame's own size to scale, so `image` skins add `frameSize { w, h }` (px); `screenBox(skin)` turns `screenRect` into percentages and the device keeps `aspect-ratio: w / h`, so the screen stays on the cut-out at any window size.
- **Voices.** `type Voice = 'terminal' | 'corporate' | 'paper' | 'personal'`. "Sources declare their voice in data": one table `VOICE_OF` in `src/ui/voice/sources.ts` (`toast → terminal`, `dm → personal`, `unit_note → personal`, `chronicle → paper`, `dossier → paper`, `commander_file → paper`, `oversight → corporate`, `leash_verdict → corporate`, `corporate_mail → corporate`, `intake_form → paper` for P11) plus an optional `voice` on `ShellApi.toast(kind, text, opts?)`. Toasts for `leash_refreshed`, `leash_changed` and every Leash outcome use `corporate`; DM-arrival toasts use `personal`; everything else stays `terminal`. Applied in this package: COMMS threads (personal), LOG chronicle posts (paper), LOG oversight log (corporate), the oversight form's verdict (corporate card, a `stamp` sound) with the form itself on paper, the SQUAD unit header (paper dossier), the CMDR card and COMMANDER FILE header (paper — the spec's "CMDR card styling"), and a newest-oversight card on the hub (a `leash.log` entry from today or yesterday). The analysis panel is not re-voiced (it stays terminal).
- **Personal accent.** Per unit, from a fixed list of 6 accents by FNV-1a of the unit id (P10b may make it data); each accent passes 4.5:1 for bubble text.
- **Portraits.** Named units' neutral sprite (else avatar) → canvas → luminance → ordered dithering with the 4×4 Bayer matrix into **three** levels (`--alius-bg`, `--alius-dim`, `--alius-fg` of the current palette) → data URL, cached per `cardRef|palette|size`. Grunts keep their ASCII portrait. A tainted canvas or a load error falls back to the plain image and is cached as a failure for 30 s (same as the existing sprite retry). Used in SQUAD (list and file) and COMMS contacts; scenes keep full-colour sprites. Off when `ditheredPortraits` is false or readable mode is on.
- **Sound.** `uiSounds` entries: `{ id: SoundId, file?: string, synth: { wave: 'sine'|'square'|'triangle'|'sawtooth', freq: number, endFreq?: number, ms: number, gain: number } }`. v1 ships **no audio files**: every sound is synthesized with WebAudio (`file` is played instead when present and loads). The `AudioContext` is created on the first play (always inside a user gesture). Effective gain = `soundVolume / 100 × entry.gain`, 0 when muted. The ambient hum (`hum`) loops only while the shell is open and `ambientHum` is on. Typing ticks are rate-limited to one per 60 ms.
- **Readable mode** adds `alius-readable` on the shell root: no scanlines, no flicker, no glitch, no dithering, font size 15 → **17 px**. It does not turn off the slide or the boot (those follow `reducedMotion`).
- **Hub art.** `content/core/art/hub/base_<slot>.png` → `base.png` → the CSS blueprint (direction A). Probed once per session with an `Image` load (only extension URLs); rooms are positioned by `rect` percentages over whichever background shows.

## File Structure

| Path | Responsibility |
|---|---|
| `src/content/schemas.ts`, `src/content/types.ts`, `src/content/refs.ts` | `HubRoomSchema`, `DeviceSkinSchema`, `UiSoundSchema`; registry names; reference checks |
| `content/core/hubRooms.json`, `deviceSkins.json`, `uiSounds.json`, `manifest.json`, `glossary.json` | Core data |
| `src/engine/hub.ts` | `whereabouts`, `hashPick` (pure, stateless) |
| `src/ui/hub/model.ts` | `markerTone`, `currentObjective`, `tonightItems`, `endSlotBlock`, `latestOversight` (pure view models) |
| `src/ui/hub/hubScreen.ts`, `src/ui/hub/roomPanel.ts`, `src/ui/hub/art.ts` | Hub DOM, room panel, hub art probe |
| `src/ui/shell/shell.ts`, `router.ts`, `keys.ts` (new) | `hub` screen, device layer, key handling |
| `src/ui/device/skins.ts`, `src/ui/device/chrome.ts`, `src/ui/device/boot.ts` | `pickSkin`, `screenBox`; chrome per preset; boot sequence |
| `src/ui/voice/voiceCard.ts`, `src/ui/voice/sources.ts` | `renderVoiceCard`, `VOICE_OF`, `unitAccent` |
| `src/ui/portrait/dither.ts`, `src/ui/portrait/portrait.ts` | Bayer dither (pure), cached canvas portraits |
| `src/ui/sound/sound.ts` | `createSound` |
| `src/ui/motion.ts` | `motionReduced`, `visualFlags` |
| `src/settings.ts`, `src/ui/shell/sysTab.ts` | Seven settings, SYS › Display and SYS › Sound |
| `fonts/*.woff2`, `fonts/LICENSES/*` | Bundled OFL fonts |
| `css/01-fonts.css`, `css/00-vars.css`, `css/12-motion.css`, `css/15-hub.css`, `css/16-device.css`, `css/17-skins.css`, `css/18-voices.css` | Styles (build concatenates `css/*.css` sorted) |
| `tests/helpers/css.ts` | `cssVars(file, selector)`, `contrastRatio(a, b)` |

## Review Focus

1. **Narrow window and touch** (≤ 1200 px, phone-sized ST): the device goes full width, rooms keep a readable label at 360 px wide, the room panel is reachable, and a long-press on a marker opens the analysis panel instead of the room. — test in Task 4 (`rooms stay labelled at 360 px`, `long-press on a marker analyzes, a tap opens the room`) and Task 3 (`the device is full width at 1000 px`).
2. **Empty and odd states**: no campaign, a read-only campaign, no named units, the whole squad away on an expedition, a scene open while the player is on the hub. The hub renders empty states, END is disabled with a reason, nothing throws. — Task 4 (`renders without a campaign`, `read-only shows the banner and no actions`, `everyone away shows the AWAY strip and empty rooms`) and Task 2 (`endSlotBlock` cases).
3. **Bad or missing content and assets**: a pack room pointing at an unknown location or facility, an `image` skin with a `screenRect` outside `frameSize`, a missing hub image or frame image. Loader errors, not runtime crashes; missing images fall back silently. — Task 1 and Task 5 loader tests; Task 4 (`missing hub art falls back to the blueprint`); Task 6 (`a frame image that fails shows the ccp_standard chrome`).
4. **Portrait failures**: no sprite, a cross-origin avatar that taints the canvas, a canvas-less environment. Falls back to the plain image, no repeated retries within 30 s, no console errors. — Task 10 (`a tainted canvas falls back and is not retried for 30 s`).
5. **Keys while typing**: `Tab`, `1`–`8` and `Escape` inside the DM box, the SYS inputs, the state editor or the scene input never toggle the device or switch tabs; Escape with a modal open closes only the modal. — Task 3 (`keys while typing`, `escape order`).

---

## Chunk (a) — Hub

### Task 1: `hubRooms` registry and core rooms

**Files:**
- Modify: `src/content/schemas.ts`, `src/content/types.ts`, `src/content/refs.ts`, `content/core/manifest.json`, `content/core/glossary.json`, `src/analysis/describe.ts` (via `DESCRIBED_REGISTRIES`)
- Create: `content/core/hubRooms.json`
- Test: `tests/content/hubSchemas.test.ts`; extend `tests/content/core.test.ts`, `tests/content/pronouns.test.ts`

**Interfaces:**
- Produces: `REGISTRY_NAMES` + `'hubRooms'` (P10 comment); `HubRoomSchema` = `{ id, label: str, description: str, rect: { x, y, w, h } (numbers 0–100, x + w ≤ 100, y + h ≤ 100), sceneLocationId: str, facilityId?: str, activityIds?: str[], weights: Partial<Record<Slot, int 0–5>>, likeTags?: str[], hosts?: Array<'injured'|'confined'|'duty'|'night'>, commanderCell?: boolean }`; `hubRooms` in `DESCRIBED_REGISTRIES`. Loader checks: `sceneLocationId` ∈ `locations`, `facilityId` ∈ `facilities`, each `activityIds` ∈ `activities`, each `hosts` value on at most one room (when the registry is non-empty, each of the four is on exactly one).

- [x] **Step 1: Write the failing tests**

`hubSchemas.test.ts`: `a rect past the right edge is rejected` (`x: 80, w: 30`); `weights above 5 are rejected`; `an unknown host is rejected`; loader (fixture pack): `an unknown sceneLocationId is an error naming the room`; `two rooms hosting injured is an error`; `an unknown activity id is an error`. `core.test.ts`: `hubRooms has 8 rooms`; every host appears exactly once; `quarters.commanderCell === true`; the core room rects do not overlap (pairwise). `pronouns.test.ts`: `hubRooms` fields `label, description` have no commander pronoun.

- [x] **Step 2: Run** `npx vitest run tests/content` → FAIL.

- [x] **Step 3: Implement.** `hubRooms.json` (rects in % of the cross-section, from direction A):

  | id | label | sceneLocationId | facilityId | rect x,y,w,h | activityIds | weights m/a/e/n | likeTags | hosts |
  |---|---|---|---|---|---|---|---|---|
  | `roof` | ROOF | `roof` | — | 0,0,100,12 | — | 0/1/2/0 | `quiet`, `smoking`, `sky` | — |
  | `quarters` | QUARTERS | `quarters_unit` | `barracks` | 0,14,74,30 | `rest`, `study` | 2/1/2/1 | `sleep`, `books` | `confined`, `night` |
  | `comms` | COMMS | `comms_room` | `comms` | 76,14,24,30 | `scout_net` | 1/1/0/0 | `tech`, `music` | — |
  | `mess` | MESS HALL | `mess_hall` | `mess_hall` | 0,46,32,32 | `mess` | 3/1/3/0 | `food`, `company` | — |
  | `medbay` | MEDBAY | `medbay` | `medbay` | 34,46,32,32 | `medbay` | 1/1/0/0 | `medicine` | `injured` |
  | `workshop` | WORKSHOP | `workshop` | `workshop` | 68,46,32,32 | `workshop` | 2/2/1/0 | `tech`, `machines` | `duty` |
  | `garage` | GARAGE | `garage` | — | 0,80,66,20 | `work` | 1/1/0/0 | `machines`, `vehicles` | — |
  | `training` | TRAINING YARD | `training_yard` | — | 68,80,32,20 | `train` | 3/2/0/0 | `fitness`, `weapons` | — |

  `quarters.commanderCell: true`. Descriptions are one sentence each, in the setting's voice, no commander pronoun (e.g. medbay: `Where the injured lie up and defects are worked on. A soldier on the cot is not going anywhere.`). Before writing `likeTags`, list the tags `unit.likes` actually uses (`grep -h likes content/core src/setup`) and keep only tags that occur; an unused tag is harmless but useless. Glossary entries (`short` + `long`): `hub` (the outpost cross-section, the home screen), `whereabouts` (where a soldier is this slot and why it can change), `marker_tone` (the ring and glyph legend), `objective`, `tonight`, `end_slot` (passing a slot costs it and gives nothing), `pda_device`, `away` (out on an expedition).

- [x] **Step 4: Run** `npm test` → PASS. **Step 5: Commit** `feat(content): hubRooms registry and the eight core rooms`

---

### Task 2: Whereabouts and the hub view models

**Files:**
- Create: `src/engine/hub.ts`, `src/ui/hub/model.ts`
- Test: `tests/engine/hub.test.ts`, `tests/ui/hubModel.test.ts`; extend `tests/content/pronouns.test.ts` (the literal lines in `model.ts`)

**Interfaces:**
- Consumes: `livingUnits`, `restrictionReason`, `activeRestrictions`, `dutySlot`, `facilityLevel`, `stressBand`, `valueBand` (`src/ui/squad/bands.ts`), `isQuietNight`, `slotsLeftToday`.
- Produces:
  - `src/engine/hub.ts`: `fnv1a(s: string): number`; `type Whereabout = { unitId: string; roomId: string | null; reason: 'injured' | 'confined' | 'duty' | 'night' | 'routine' | 'expedition' | 'nowhere' }`; `whereabouts(state: CampaignState, reg: Registries): Whereabout[]` (living units in squad order; `roomId: null` with `expedition`, or `nowhere` when no room qualifies).
  - `src/ui/hub/model.ts`: `type MarkerTone = 'danger' | 'bond' | 'trust' | 'affinity' | 'warn' | 'neutral'`; `markerTone(state, reg, unit: Unit): MarkerTone`; `TONE_GLYPH: Record<MarkerTone, string>` (`! ♥ + * ~` and `·`); `currentObjective(state, reg): { text: string; dueDays: number | null; missionId: string } | null`; `type TonightItem = { kind: 'knock' | 'dm' | 'demand' | 'intake' | 'deadline' | 'warning'; text: string; unitId?: string; tone: MarkerTone; analyze: string }`; `tonightItems(state, reg): TonightItem[]` (≤ 6); `endSlotBlock(state): string | null`; `latestOversight(state): LeashLogEntry | null` (newest entry with `day ≥ state.day − 1`).

- [x] **Step 1: Write the failing tests**

`hub.test.ts` (core content, `campaign(reg, 4)`):
```ts
// determinism and statelessness
const a = whereabouts(s, reg); const b = whereabouts(structuredClone(s), reg);
expect(a).toEqual(b); expect(s.rngState).toEqual(before.rngState);
// every routine room is open this slot and has weight > 0
for (const w of a.filter((x) => x.reason === 'routine')) expect(roomWeight(reg, w.roomId!, s.slot)).toBeGreaterThan(0);
```
`an injured unit is in the room hosting injured` (`medbay`, reason `injured`); `injuryDays > 0 counts as injured`; `a confined unit is in quarters`; `duty in its duty slot is in the workshop, outside it routine`; `at night everyone is in quarters` (reason `night`); `an expedition party member has roomId null, reason expedition`; `dead, deserted and terminated are absent`; `likes move the odds`: over the 4 slots × 30 days, a unit with `likes: ['food']` lands in `mess` more often than the same unit without (count comparison, fixed data, no RNG); `a room whose facility level is 0 is skipped` (set `base.facilities.medbay = 0` in a fixture and the routine pick never returns `medbay`); `a pack with no hubRooms gives reason nowhere for everyone`; `changing the day can change the room, changing nothing does not`.

`hubModel.test.ts`: tone table — stress 85 → `danger`; `lover` → `bond`; `friend` → `trust`; `comrade` with Affinity 70 → `affinity`; `resentful` → `warn`; stress 55 `comrade` → `warn`; fresh `stranger` → `neutral`; injured `lover` → `danger` (danger wins). `currentObjective`: spine-beat mission wins over a nearer deadline; no missions → `null`; `dueDays` = `deadlineDay − day`. `tonightItems`: a queued `talk` night entry gives `Rhea will knock tonight.`; a queued `desertion` entry gives **nothing** (hidden kind); two unread DMs give `Rhea: 2 unread messages.`; more than 6 sources → 6 items in the order of the ruling; the item texts pass the commander-pronoun guard of `tests/content/pronouns.test.ts`. `endSlotBlock`: open scene → `A conversation is open.`; `pendingScene` → `A talk is waiting for its scene.`; expedition → `The squad is out.`; presented dilemma → `A decision is waiting.`; `calendar.nightEvent` set → `Someone is at the door.`; read-only is handled by the caller; otherwise `null`. `latestOversight`: an entry from 2 days ago → `null`.

- [x] **Step 2: Run** `npx vitest run tests/engine/hub.test.ts tests/ui/hubModel.test.ts` → FAIL.

- [x] **Step 3: Implement** as in the rulings. `whereabouts` sorts candidate rooms in registry order before the weighted pick so the result does not depend on `Map` insertion quirks across packs.

- [x] **Step 4: Run** `npm test` → PASS. **Step 5: Commit** `feat(hub): derived whereabouts, marker tones, objective and tonight models`

---

### Task 3: Shell — hub screen, device layer, keys

**Files:**
- Create: `src/ui/shell/keys.ts`
- Modify: `src/ui/shell/shell.ts`, `src/ui/shell/router.ts`, `css/10-shell.css`, `css/20-pda.css`, create `css/16-device.css` (layout only; skins come in Task 6)
- Test: `tests/ui/shellDevice.test.ts`; update `tests/ui/shell.test.ts` and any test that reads the tab bar right after `open()`

**Interfaces:**
- Produces:
  - `ScreenId` + `'hub'`; the router starts on `'hub'`.
  - `ShellApi` additions: `registerHub(render: (host: HTMLElement, device: HTMLElement) => void): void` (the hub renderer gets its own host and the device element to place); `isDeviceUp(): boolean`; `setDevice(up: boolean): void`; `toast(kind, text, opts?: { voice?: Voice; title?: string })` (the `voice` is stored as `data-voice` now and styled in Task 9; `Voice` type lives in `src/ui/voice/sources.ts`, created here with only the type and `VOICE_OF`).
  - Device DOM (stable class names later tasks rely on): `.alius-device[data-skin][data-up]` › `.alius-device-chrome` (aria-hidden, empty until Task 6) + `.alius-device-screen` › `.alius-status`, `.alius-tabbar`, `#alius-panel`. While down: `inert` and `aria-hidden="true"`.
  - `ShellDeps.onDevice?(up: boolean): void` (sound and boot hook for Tasks 8 and 11).
  - `keys.ts`: `isControl(el: EventTarget | null): boolean`; `isEditable` moves here from `shell.ts`.

- [x] **Step 1: Write the failing tests** (`shellDevice.test.ts`, jsdom, `FakeStAdapter`)

`open shows the hub with the device down` (`.alius-hub` present, `.alius-device[data-up="false"]` has `inert`); `showScreen('pda') raises the device with the selected tab` — **acceptance 2**; `showTab('comms') from the hub raises the device on COMMS`; `setDevice(false) lowers it and focus returns to the OPEN PDA button`; `Tab on the hub background raises the device, Tab on a button moves focus` (dispatch `keydown` with `target` = shell root vs. a button; assert `isDeviceUp()` and that `preventDefault` was / was not called); `Tab on the device screen lowers it`; `keys while typing`: `Tab`, `3`, `Escape` with target = DM input, SYS number input, a textarea → no device or tab change; `escape order`: modal open → Escape closes the modal only; then Escape lowers the device; `1–8 on the hub open the device at that tab`; `registerTab still re-renders the current tab while up`; `refresh() keeps the device state`; `scene screen hides the hub; showScreen('hub') comes back with the device down`; `the device is full width at 1000 px` (set `window.innerWidth` and assert the `alius-device-narrow` class the shell toggles on `resize`; CSS does the rest); stacking: computed classes only — assert DOM order hub → device → toasts → modal layer (the analysis panel appends last as today).

Update existing shell/app tests that click tabs right after `open()` to call `shell.showScreen('pda')` (or `showTab`) first. Do not change their assertions. Name the touched files in the commit message.

- [x] **Step 2: Run** `npx vitest run tests/ui/shellDevice.test.ts` → FAIL.

- [x] **Step 3: Implement.** The `pda` and `hub` routes both call the registered hub renderer (until Task 4 registers one, a minimal default hub: an `OPEN PDA [TAB]` button and the device) and then set the device state. The tab bar/status/panel are built once per hub render inside `.alius-device-screen` (same code as today's `pda` route). The title bar reads `╔═[ ALIUS // OUTPOST ]` on the hub and `╔═[ ALIUS // PDA ]` while the device is up; the footer reads `╚═ TAB pda · 1-8 tabs · ←/→ move · ? analyze · Esc back · Alt+Shift+A toggle `. Slide: `transform: translateY(calc(100% + 40px))` → `translateY(0)`, `transition: transform 260ms ease-out` (disabled under reduced motion in Task 8). Layout per the device-size ruling.

- [x] **Step 4: Run** `npm test` → PASS. **Step 5: Commit** `feat(shell): hub home screen with the PDA as a device layer`

---

### Task 4: Hub screen, room panel and app wiring

**Files:**
- Create: `src/ui/hub/hubScreen.ts`, `src/ui/hub/roomPanel.ts`, `src/ui/hub/art.ts`, `css/15-hub.css`
- Modify: `src/ui/ops/opsTab.ts` (export `activityCard`), `src/app.ts`, `src/analysis/providers/core.ts` (only if a new live address is needed — see Step 3)
- Test: `tests/ui/hub.test.ts`, `tests/app-hub.test.ts`; extend `tests/ui/analyzeCoverage.test.ts`

**Interfaces:**
- Consumes: Task 2 models, `renderStatusHeader`, `activityCard`, `OpsTabCtx`, `clockText`.
- Produces:
  - `interface HubCtx { getState; getLoad; registries; settings: () => AliusSettings; assetUrl?: (p: string) => string; ops: OpsTabCtx; onTalk(unitId: string, locationId: string): void; onEndSlot(): void; onOpenPda(tab?: TabId): void; avatar(unit: Unit): HTMLElement | null }`.
  - `renderHub(host: HTMLElement, device: HTMLElement, ctx: HubCtx): void`.
  - `probeHubArt(assetUrl, slot): Promise<string | null>` (cached per URL for the session).
  - `AliusApp.talkAt(unitId: string, locationId: string): Promise<boolean>`; `AliusApp.endSlot(): Promise<void>`.

- [x] **Step 1: Write the failing tests**

`hub.test.ts`: `renders top bar, cross-section, rooms and the right column` — **acceptance 1** (8 `.alius-room[data-room]`, `.alius-objective`, `.alius-tonight`, `[data-open-pda]`, `[data-end-slot]` labelled `END MORNING ▸` on a morning); `markers sit in the room whereabouts says` (`.alius-room[data-room="medbay"] .alius-marker[data-unit=<injured id>]`); `a marker shows the state glyph and the tone glyph and carries data-tone` (no marker whose only content is colour: every marker has non-empty text); `away units are in the AWAY strip`; `missing hub art falls back to the blueprint` (probe resolves `null` → `.alius-hub-blueprint`; resolves a URL → `background-image` on `.alius-hub-art` and no blueprint grid); `clicking a room opens its panel with who is there, TALK and its activity cards`; `TALK is aria-disabled with the restriction reason for a confined unit`; `TALK is disabled with Closed this night. when the location is closed`; `END is aria-disabled with the endSlotBlock reason`; `renders without a campaign` (`NO ACTIVE CAMPAIGN IN THIS CHAT`, no END/TALK); `read-only shows the banner and no actions`; `everyone away shows the AWAY strip and empty rooms`; `rooms stay labelled at 360 px` (host width 360: every room has a visible `.alius-room-label`; CSS sets `min-height` and `font-size` via container query — assert the class names only); `long-press on a marker analyzes, a tap opens the room` (with `attachAnalyzer`: a 600 ms pointerdown on a marker opens `.alius-analyze` and not `.alius-room-panel`; a click opens the panel); `the newest oversight card shows only today or yesterday`.

`app-hub.test.ts`: `talkAt starts the talk activity and opens the scene at the room location without the picker` (no modal shown; `state.scene.locationId === 'mess_hall'`); `talkAt on a confined unit toasts the reason and spends nothing`; `endSlot confirms, then spends one slot` (`slot_advanced`); `endSlot in a quiet night sleeps` (`calendar/sleep`); `cancel spends nothing`; `ending a scene returns to the hub with the device down`; `opening the shell after a reload shows the hub`.

`analyzeCoverage.test.ts`: render the hub (with an open room panel) into the coverage sweep: every `.alius-stat/.alius-chip/.alius-option` resolves.

- [x] **Step 2: Run** → FAIL.

- [x] **Step 3: Implement.** Analyze addresses: rooms `hubRooms:<id>` (`alius-chip`); markers `relationshipStates:<stateId>` with `data-analyze-ctx {"unitId": …}` for named units, `glossary:whereabouts` for grunts (`alius-chip`); tone legend chips `glossary:marker_tone`; objective `glossary:objective` (`alius-stat`); each Tonight item its `analyze` address; END `glossary:end_slot` and OPEN PDA `glossary:pda_device` (`alius-option`, `analyzeNative`); AWAY strip `glossary:away`. No new provider: the existing state and stress providers read through `Knowledge`.

  Top bar: `ALIUS` (stencil font var, Task 7), `CCP OUTPOST // {corporation name}`, then `renderStatusHeader` output (reused, so the clock/resources/Leash/warnings and their analyze marks stay single-sourced). Blueprint fallback, from direction A: background `repeating-linear-gradient(0deg, rgba(255,176,0,.05) 0 1px, transparent 1px 32px), repeating-linear-gradient(90deg, …same…), var(--alius-bg)`, rooms `1px solid` in `--alius-dim`, room labels uppercase with `letter-spacing: 3px`, a corner caption `SECTION A-A · NOT TO SCALE`; colours from palette variables, never the canvas hexes. Right column (380 px; stacks under the cross-section at ≤ 1200 px): objective card, Tonight list, oversight card (plain until Task 9 voices it), legend, `OPEN PDA  [TAB]` (primary), `END {SLOT} ▸`. Marker: 32 px circle, 2 px ring `var(--alius-<tone>)`, two-letter initials or `GR`, glyphs after the name. Room panel: an in-hub panel (not a modal) anchored to the room, closed by Escape (before the device rule), a `[X]`, or clicking outside.

  App: register the hub with `shell.registerHub`; `talkAt` sets a one-shot `presetLocation` consumed by `offerScene` (skips `pickLocation`); change the "return home" `showScreen('pda')` calls to `'hub'` per the ruling.

- [x] **Step 4: Run** `npm test` → PASS. **Step 5: Commit** `feat(hub): outpost hub with rooms, markers, room panel, objective and tonight`

---

## Chunk (b) — Device and skins

### Task 5: `deviceSkins` registry, skin choice and the screen box

**Files:**
- Create: `content/core/deviceSkins.json`, `src/ui/device/skins.ts`
- Modify: `src/content/schemas.ts`, `src/content/types.ts`, `src/content/refs.ts`, `content/core/manifest.json`, `content/core/glossary.json`, `src/settings.ts`, `src/ui/shell/sysTab.ts`, `src/analysis/providers/core.ts` (setting label)
- Test: `tests/content/deviceSkinSchemas.test.ts`, `tests/ui/deviceSkins.test.ts`; extend `tests/settings.test.ts`, `tests/content/core.test.ts`, `tests/content/pronouns.test.ts`

**Interfaces:**
- Produces:
  - `DeviceSkinSchema` = `{ id, name, description, kind: 'css' | 'image', cssPreset?: 'ccp_standard' | 'kestrel' | 'vesper', frameImage?: str, frameSize?: { w: int > 0, h: int > 0 }, screenRect?: { x, y, w, h } (int ≥ 0), overlay?: { image: str, blend: 'overlay' | 'multiply', opacity: 0–1 }, ledColor: hex, accent: hex, label?: str (the engraved model name), bindTo?: { corporationId?: str, traitId?: str, unlockFlag?: str } (at most one key) }`. Refinements: `css` needs `cssPreset`; `image` needs `frameImage`, `frameSize`, `screenRect` with `x + w ≤ frameSize.w` and `y + h ≤ frameSize.h`. Loader refs: `corporationId` ∈ `corporations`, `traitId` ∈ `commanderTraits`, `unlockFlag` ∈ `flags`; `ccp_standard` must exist when the registry is non-empty. `deviceSkins` joins `DESCRIBED_REGISTRIES`.
  - `pickSkin(state: CampaignState | null, reg: Registries, override: string): Entry` (precedence in the rulings); `screenBox(skin: Entry): { left: string; top: string; width: string; height: string } | null` (percent strings with up to 3 decimals; `null` for `css`).
  - Setting `deviceSkin` (default `''`, schema `z.string()`; an id not in the registry reads as `''` at use, not at load, so a removed pack does not lose the choice).
  - SYS › Display: `Device skin` select: `Follow the campaign ({resolved name})` + every skin by name; `field(…, 'deviceSkin')`; each option carries nothing extra (the field is the analyzable unit).

- [x] **Step 1: Write the failing tests**

schemas: `a css skin without cssPreset is rejected`; `an image skin whose screenRect leaves the frame is rejected` (`frameSize 1000×1600`, `x 900, w 200`); `bindTo with two keys is rejected`; loader: `an unknown corporationId in bindTo is an error`; `a pack without ccp_standard is an error`. core: `deviceSkins` has `ccp_standard` (no `bindTo`), `kestrel` (`bindTo.corporationId: 'kestrel'`), `vesper` (`bindTo.corporationId: 'vesper'`), all `kind: 'css'`. `deviceSkins.test.ts`: `a Kestrel campaign gets kestrel, a Vesper campaign vesper` — **acceptance 3**; `an Aurum or null corporation gets ccp_standard`; `the override wins`; `an override that is not a skin is ignored`; `a trait binding beats the corporation` and `a flag binding beats the corporation` (fixture skins); `no campaign → override or ccp_standard`; `screenBox` of `{ frameSize: 1000×1600, screenRect: { x: 100, y: 240, w: 800, h: 1200 } }` is `{ left: '10%', top: '15%', width: '80%', height: '75%' }`. settings: `deviceSkin defaults to empty and keeps any string`.

- [x] **Step 2: Run** → FAIL.

- [x] **Step 3: Implement.** Core entries: `ccp_standard` — name `CCP standard issue`, label `CCP-PDA MK.III`, LED `#ffb000`, accent `#d8cb98`, description `Corporate-surplus handheld: olive-grey shell, rubber bumpers, screws someone has already tried to open.`; `kestrel` — name `Kestrel-Ward KW-7`, label `KESTREL-WARD · KW-7`, LED `#ff3b1f`, accent `#e8ad0c`, description `Steel casing, hazard stripe, hex bolts and the grime of a quota floor.`; `vesper` — name `Vesper Somatics`, label `VESPER`, LED `#3fd6c4`, accent `#8fb9b2`, description `White ceramic and a teal light ring. No screws: it is not meant to be opened.` Glossary: `setting_device_skin`.

- [x] **Step 4: Run** `npm test` → PASS. **Step 5: Commit** `feat(device): deviceSkins registry, skin choice and the screen box`

---

### Task 6: Device chrome and the three CSS presets

**Files:**
- Create: `src/ui/device/chrome.ts`, `css/17-skins.css`
- Modify: `src/ui/shell/shell.ts` (apply the skin on render and on `refresh()`), `css/16-device.css`, `src/app.ts` (pass `assetUrl` and registries to the shell for skins)
- Test: `tests/ui/deviceChrome.test.ts`

**Interfaces:**
- Consumes: `pickSkin`, `screenBox`.
- Produces: `renderChrome(chrome: HTMLElement, screen: HTMLElement, device: HTMLElement, skin: Entry, assetUrl?: (p: string) => string): void` — sets `device.dataset.skin = skin.id`, `data-kind`, CSS vars `--device-led`, `--device-accent`; for `css` fills the chrome with the preset's decor; for `image` sets the frame `<img>` (decorative, `alt=""`), `aspect-ratio`, and positions `.alius-device-screen` with `screenBox`. `ShellDeps.skin?: () => { skin: Entry; assetUrl?: (p: string) => string }`.

- [ ] **Step 1: Write the failing tests**

`each css preset renders its decor` (`ccp_standard`: 2 slotted screws, 2 rubber bumpers, the `VOID IF OPENED` sticker and a barcode; `kestrel`: hazard stripe, 6 hex bolts; `vesper`: the light ring and no `.alius-screw`); `the engraved label is the skin label and is aria-hidden`; `the LED uses ledColor`; `an image skin positions the screen at 10/15/80/75 %` and `keeps the same percentages at a 1440 px and a 900 px wide host` — **acceptance 3** (assert inline styles at both widths; percentages make it size-independent); `a frame image that fails shows the ccp_standard chrome` (fire `error` on the frame `img`); `the skin follows SYS without reopening` (change the setting, `shell.refresh()`, `data-skin` changes); `the tabs inside the device still work under every skin` (click SQUAD/COMMS/SYS under each preset); `grain and grime filters are inline SVG with ids unique per render` (two shells → no duplicate `filter` ids in the document).

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.** Port from the canvas (values verbatim, inside `.alius-device[data-skin="…"]`):
  - `ccp_standard` (from `Hybrid.dc.html`): `border-radius: 38px 38px 0 0; padding: 30px 34px 0; background: radial-gradient(120% 60% at 20% 0%, rgba(255,255,255,.07), transparent 60%), linear-gradient(165deg, #3b3a36 0%, #2c2b28 38%, #22211f 70%, #1b1a18 100%); box-shadow: inset 0 2px 0 rgba(255,255,255,.14), inset 2px 0 0 rgba(255,255,255,.05), inset -2px 0 0 rgba(0,0,0,.5), inset 0 0 0 6px rgba(0,0,0,.18), 0 0 0 1px #0a0a09, 0 -24px 70px rgba(0,0,0,.75)`; corner bumpers 86 px (`border-radius: 38px 0 28px 0` / mirrored, `linear-gradient(145deg, #1d1c1a, #121211)`); side grips 14 × 340 px `repeating-linear-gradient(0deg, #141413 0 3px, #2f2e2b 3px 5px, #1c1b19 5px 7px)`; slotted screws 14 px `radial-gradient(circle at 35% 30%, #9a978e, #4a4842 55%, #1a1917)` with a 10×2 px slot at 35° / −60°; scratches (1 px lines, white 6–10 %); speaker grille `radial-gradient(circle, #0c0c0b 1.4px, transparent 1.6px) 0 0 / 6px 6px`; LED 8 px with `box-shadow: 0 0 8px 2px` of the LED colour at 55 %; sticker `VOID IF OPENED` (`#d8cb98` on `#3a3320`, rotate −4°, the polygon clip); barcode sticker; grain `feTurbulence fractalNoise 0.85 / 3 octaves`, `mix-blend-mode: overlay`, opacity .22; mottle `0.012 / 2 octaves`, opacity .35. Bezel: `#070706`, radius `16px 16px 0 0`, padding `10px 10px 0`, `box-shadow: inset 0 4px 10px rgba(0,0,0,.95), inset 0 0 0 1px rgba(0,0,0,.8), 0 1px 0 rgba(255,255,255,.10)`; glass sheen `linear-gradient(118deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.02) 28%, transparent 34%)`.
  - `kestrel` (from `SkinKestrel.dc.html`): radius `22px 22px 0 0`, padding `44px 40px 0`, `background: radial-gradient(90% 50% at 30% 0%, rgba(255,255,255,.10), transparent 60%), linear-gradient(170deg, #6a6d6f 0%, #4b4e50 30%, #36383a 65%, #262829 100%)`; hazard stripe 20 px `repeating-linear-gradient(-45deg, #e8ad0c 0 16px, #151515 16px 32px)` with a chipping filter; amber corner triangles 70 px; six hex bolts 20 px (`clip-path: polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0 50%)`, `radial-gradient(circle at 40% 35%, #b9bcbd, #5c5f61 60%, #2b2c2d)`); brushed-metal filter `baseFrequency="0.9 0.04"`; grime filter `0.018 / 3 / seed 7`, opacity .5; two grime smudges; vent slots `repeating-linear-gradient(90deg, #1b1c1d 0 4px, transparent 4px 8px)`; bezel `#0a0a0a`, radius `6px 6px 0 0`, padding `12px 12px 0`, ring `0 0 0 3px #1a1b1c, 0 0 0 4px rgba(255,255,255,.12)`.
  - `vesper` (from `SkinVesper.dc.html`): radius `64px 64px 0 0`, padding `40px 38px 0`, `background: radial-gradient(70% 40% at 35% 0%, rgba(255,255,255,.9), transparent 70%), radial-gradient(60% 50% at 100% 30%, rgba(170,230,222,.18), transparent 70%), linear-gradient(175deg, #f3f4f1 0%, #e2e5e1 40%, #c9cdc9 85%, #b5bab6 100%)`; ceramic filter `1.1 / 2`, multiply, opacity .12; a centred 54 px home button with a 20 px teal ring `#8fb9b2`; label in Inter 300, `letter-spacing: 12px`, `#6d7572`; bezel `#0b0c0c`, radius `34px 34px 0 0`, padding `14px 14px 0`, light ring `0 0 0 2px #a9b0ac, 0 0 0 4px rgba(255,255,255,.7), 0 0 18px 3px rgba(63,214,196,.35)`; no screws.
  The screen inside every preset stays the phosphor terminal (palette variables, scanlines per setting). Filter ids get a per-shell suffix.

- [ ] **Step 4: Run** `npm test` → PASS. **Step 5: Commit** `feat(device): device chrome with the CCP, Kestrel-Ward and Vesper presets and image skins`

---

## Chunk (c) — Fonts, colour, motion, voices, portraits, sound

### Task 7: Bundled fonts and the no-network guard

**Files:**
- Create: `fonts/` (woff2 + `fonts/LICENSES/`), `css/01-fonts.css`, `tests/assets.test.ts`
- Modify: `css/00-vars.css` (font variables)

**Interfaces:**
- Produces: CSS variables on `#alius-shell`: `--alius-font` (IBM Plex Mono first, unchanged fallbacks), `--alius-font-stencil: "Saira Stencil One", var(--alius-font)`, `--alius-font-sans: "Inter", system-ui, sans-serif`, `--alius-font-type: "Special Elite", "Courier New", monospace`.

- [ ] **Step 1: Write the failing test** (`assets.test.ts`, node)

`every font url in style.css exists on disk` (parse `url("fonts/…")`, resolve from the repo root); `style.css has no remote url and no @import` (`/url\(\s*['"]?(https?:)?\/\//` and `/@import/` do not match); `the bundle names no font CDN` (`dist/index.js` contains neither `fonts.googleapis` nor `fonts.gstatic`); `each bundled font has its OFL licence` (`fonts/LICENSES/<family>.txt` exists for the four families); `woff2 files are under 120 KB each`.

- [ ] **Step 2: Run** `npx vitest run tests/assets.test.ts` → FAIL.

- [ ] **Step 3: Implement.** In the scratchpad: `npm pack @fontsource/ibm-plex-mono @fontsource/saira-stencil-one @fontsource/inter @fontsource/special-elite`, extract, copy **latin** subsets only: IBM Plex Mono 400 and 600, Saira Stencil One 400, Inter 300, 400 and 600, Special Elite 400 → `fonts/<family>-<weight>.woff2`; copy each package's `LICENSE` to `fonts/LICENSES/<family>.txt`. `@font-face` with `font-display: swap` and `url("fonts/…")` (relative to `style.css`, which SillyTavern loads from the extension folder). Do not add the packages to `package.json`.

- [ ] **Step 4: Run** `npm test` → PASS. **Step 5: Commit** `feat(ui): bundle the OFL fonts and guard against remote assets`

---

### Task 8: Semantic colours, readable mode, reduced motion, boot and glitch

**Files:**
- Create: `src/ui/motion.ts`, `src/ui/device/boot.ts`, `css/12-motion.css`, `tests/helpers/css.ts`
- Modify: `css/00-vars.css`, `src/settings.ts`, `src/ui/shell/shell.ts`, `src/ui/shell/sysTab.ts`, `src/ui/analyze/analyzer.ts` (deps), `src/ui/leash/requestForm.ts`, `src/ui/scene/sceneScreen.ts` (typing), `src/ui/hub/hubScreen.ts` (ring vars), `content/core/glossary.json`, `src/analysis/providers/core.ts` (setting labels)
- Test: `tests/ui/motion.test.ts`, `tests/ui/palette.test.ts`; extend `tests/settings.test.ts`, `tests/ui/shellDevice.test.ts`, `tests/ui/scene.test.ts`, `tests/ui/leashForm.test.ts`

**Interfaces:**
- Produces:
  - Settings `readableMode`, `reducedMotion` (Global Constraints defaults).
  - `motionReduced(s: AliusSettings, media?: () => boolean): boolean` (setting OR `prefers-reduced-motion`); `visualFlags(s): { scanlines: boolean; flicker: boolean; glitch: boolean; dither: boolean; motion: boolean }` (readable mode forces the first four false; `dither` also needs `ditheredPortraits`, Task 10).
  - Root classes: `alius-readable`, `alius-reduced-motion` (set in `applySettings`).
  - `playBoot(screen: HTMLElement, opts: { reduced: boolean; skinLabel: string }): Promise<void>` — three lines `{skinLabel} // BOOT`, `LINK ........ OK`, `CCP OVERSIGHT HANDSHAKE ........ OK`, 150 ms apart, then 150 ms fade = **600 ms**; resolves at once when reduced; any `keydown`/`pointerdown` ends it. Runs on the first device-up after `shell.open()` only.
  - Tab glitch: class `alius-glitch` on `#alius-panel` for **120 ms** on a tab change, never when `visualFlags(...).glitch` is false.
  - The analyzer's `reducedMotion` dep, the oversight form's delay, and the scene typing speed (instant) all read `motionReduced`.
  - CSS vars per palette: `--alius-danger`, `--alius-warn`, `--alius-trust`, `--alius-affinity`, `--alius-bond`.
  - `tests/helpers/css.ts`: `cssVars(file: string, selector: string): Record<string, string>`; `luminance(hex)`, `contrastRatio(a, b)`.

- [ ] **Step 1: Write the failing tests**

`palette.test.ts`: for each palette (`amber`, `green`, `white`): each semantic var vs `--alius-bg` ≥ **4.5:1**; the five semantic colours differ **in lightness**: sorted relative luminances, each adjacent pair has a contrast ratio ≥ **1.25** (colour-blind safe); `--alius-fg`, `--alius-dim`, `--alius-accent` vs bg stay ≥ 7:1. `motion.test.ts`: `motionReduced` true by setting, true by media, false otherwise; `visualFlags` with readable mode → scanlines/flicker/glitch/dither false and `motion` unchanged; shell: `readable mode sets alius-readable and drops scanlines and flicker` — **acceptance 6**; `reduced motion sets alius-reduced-motion`; `boot shows on the first device-up only, ends on a key, and lasts ≤ 600 ms` (fake timers: all three lines by 450 ms, gone by 600 ms); `no boot under reduced motion`; `a tab change adds alius-glitch for 120 ms, never in readable mode`. scene: `typing is instant under reduced motion`. leash form: `the review delay is 0 under the reducedMotion setting` (media query false). analyzer: `animationMs is 0 under the setting` (through the dep). settings: the two defaults.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.** Draft amber values (tune until the test passes; keep hue families): danger `#ff6a4a`, warn `#e0a030`, trust `#7fb8ff`, affinity `#ffd27a`, bond `#ff9ac0`; derive green/white sets the same way. `12-motion.css`: `.alius-reduced-motion *, .alius-reduced-motion *::before, .alius-reduced-motion *::after { animation: none !important; transition: none !important; }` and the same under `@media (prefers-reduced-motion: reduce)`; `.alius-readable { font-size: 17px; }`, `.alius-readable::after { display: none; }` (scanlines), no flicker animation. Glitch keyframes: 120 ms, two `clip-path` slices + 2 px `translateX`. SYS › Display: `Readable mode (no scanlines, flicker, dithering or glitch; larger text)`, `Reduce motion (also follows the system setting)`. Glossary: `setting_readable_mode`, `setting_reduced_motion`, `semantic_colours` (what each tone means; the glyphs).

- [ ] **Step 4: Run** `npm test` → PASS. **Step 5: Commit** `feat(ui): semantic colours, readable mode, reduced motion, boot and tab glitch`

---

### Task 9: Voices and `VoiceCard`

**Files:**
- Create: `src/ui/voice/voiceCard.ts`, `css/18-voices.css`
- Modify: `src/ui/voice/sources.ts`, `src/ui/shell/toast.ts`, `src/ui/comms/commsTab.ts`, `src/ui/log/logTab.ts`, `src/ui/leash/requestForm.ts`, `src/ui/squad/squadTab.ts` (unit header), `src/ui/commander/cmdrCard.ts`, `src/ui/commander/commanderFile.ts` (header), `src/ui/hub/hubScreen.ts` (oversight card), `src/app.ts` (toast voices, corporation name to the form), `css/60-scene-comms.css`
- Test: `tests/ui/voiceCard.test.ts`, `tests/ui/voices.test.ts`; extend `tests/ui/comms.test.ts`, `tests/ui/log.test.ts`, `tests/ui/leashForm.test.ts`, `tests/ui/squad.test.ts`, `tests/ui/cmdrCard.test.ts`

**Interfaces:**
- Produces:
  - `interface VoiceCardOpts { voice: Voice; title?: string; meta?: string; from?: string; body: Node | string; accent?: string; stamp?: string; redact?: Array<[number, number]> }`; `renderVoiceCard(o: VoiceCardOpts): HTMLElement` (`article.alius-voice.alius-voice-<voice>`, `data-voice`; `stamp` renders a rotated `.alius-stamp` box; `redact` wraps character ranges of a string body in `.alius-redact` spans with `aria-label="redacted"`).
  - `renderBubble(text: string, mine: boolean, accent: string): HTMLElement` (personal voice, used by COMMS).
  - `unitAccent(unitId: string): string` (one of 6 fixed accents by `fnv1a`).
  - `VOICE_OF` (the ruling's table); `LeashFormOpts.corporation?: string` (verdict card header `{CORPORATION} · OVERSIGHT`).

- [ ] **Step 1: Write the failing tests**

`voiceCard.test.ts`: `each voice renders with its class and data-voice` — **acceptance 4**; `text is set as text` (a body `<b>x</b>` string appears literally); `a stamp renders`; `redact covers the given range and keeps the text out of textContent`; contrast (CSS helper): for each voice `--voice-fg` and `--voice-dim` vs `--voice-bg` ≥ 4.5 in every palette that the voice inherits (terminal reads the palette; corporate, paper and personal define their own); each of the 6 accents vs its bubble background ≥ 4.5. `voices.test.ts` / extended screens: `COMMS threads are personal bubbles with the unit's accent` (`.alius-thread .alius-voice-personal`, her bubbles left, the commander's right); `LOG chronicle posts are paper and the oversight log is corporate`; `the oversight form is paper and its verdict a corporate card with the corporation name`; `the SQUAD unit header is a paper dossier`; `the CMDR card is paper`; `a corporate toast carries data-voice="corporate"`; `the app toasts Leash outcomes and leash_refreshed in the corporate voice and DM arrivals in the personal voice`; `the hub shows today's oversight entry as a corporate card`; every existing analyze mark inside re-voiced blocks is kept (coverage test stays green).

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.** Looks (from the spec table and the canvas):
  - `terminal`: palette variables, `--alius-font`, box-drawing borders, scanlines as configured.
  - `corporate`: `--voice-bg: #f4f5f7`, `--voice-fg: #1b1d22`, `--voice-dim: #3f4550`, header `#3c4a5c`, radius 14 px, padding `16px 18px`, `--alius-font-sans`, header `font-weight: 600; letter-spacing: 2px` uppercase `{CORPORATION} · OVERSIGHT`.
  - `paper`: `--voice-bg: #efe6cf` with a subtle inline-SVG fibre filter, `--voice-fg: #2b241a`, `--voice-dim: #5a4e3a`, `--alius-font-type`, a 1 px rule under the title, stamps in `#8b1e1e` at −6°, redaction bars `#1a1a1a`, handwritten notes use the same type font in italic until P10b brings hand fonts.
  - `personal`: thread background `#241c2b`, her bubble `#3a2c44` / `#f5e6f0`, radius `16px 16px 16px 4px`; the commander's bubble uses the palette `--alius-fg` on `--alius-bg` text, radius `16px 16px 4px 16px`; `--alius-font-sans`; the unit's accent on the contact row's left border and the unread dot.
  Readable mode drops the paper fibre and stamps' rotation, keeps the colours.

- [ ] **Step 4: Run** `npm test` → PASS. **Step 5: Commit** `feat(ui): four voices through VoiceCard for comms, log, oversight, dossiers and toasts`

---

### Task 10: Dithered portraits

**Files:**
- Create: `src/ui/portrait/dither.ts`, `src/ui/portrait/portrait.ts`
- Modify: `src/settings.ts`, `src/ui/shell/sysTab.ts`, `src/ui/squad/squadTab.ts` (replace the local `portrait()` with the shared one), `src/ui/comms/commsTab.ts` (contact avatars), `src/ui/hub/hubScreen.ts` (room panel avatars via `HubCtx.avatar`), `content/core/glossary.json`, `src/analysis/providers/core.ts`
- Test: `tests/ui/dither.test.ts`, `tests/ui/portrait.test.ts`; extend `tests/ui/squad.test.ts`, `tests/settings.test.ts`

**Interfaces:**
- Produces:
  - `BAYER4: readonly number[]` = `[0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]`.
  - `ditherBayer4(src: Uint8ClampedArray, w: number, h: number, levels: [Rgb, Rgb, Rgb]): Uint8ClampedArray` (pure; luminance `0.2126 R + 0.7152 G + 0.0722 B` over 255, scaled to 2 intervals; at pixel (x, y) the threshold is `(BAYER4[(y % 4) * 4 + x % 4] + 0.5) / 16`; alpha < 128 → transparent).
  - `PALETTE_RGB: Record<'amber'|'green'|'white', [Rgb, Rgb, Rgb]>` (bg, dim, fg, equal to `00-vars.css`).
  - `unitPortrait(st: StAdapter, unit: Unit, o: { palette; dither: boolean; size?: number }): HTMLElement | null` (grunt → ASCII as today; named → `img`; when `dither`, the image is replaced by the cached dithered data URL once ready); `clearPortraitCache(): void` (tests).
  - Setting `ditheredPortraits` (default `true`); SYS › Display `Dithered portraits (PDA)`; glossary `setting_dithered_portraits`.

- [ ] **Step 1: Write the failing tests**

`dither.test.ts`: a flat 50 % grey 4×4 image gives exactly the half of the pixels at `fg`-side levels predicted by the matrix (assert the exact output array for one 4×4 block); pure black → all bg, pure white → all fg; transparent pixels stay transparent; `PALETTE_RGB` equals the hex values parsed from `css/00-vars.css` (CSS helper). `portrait.test.ts` (stub `HTMLCanvasElement.prototype.getContext` with a fake 2D context): `the dithered portrait is cached per unit, palette and size` (second call does not draw); `a palette change makes a new one`; `a tainted canvas falls back and is not retried for 30 s` (`getImageData` throws `SecurityError`; the plain `img` stays; a second call within 30 s does not touch the canvas; after 30 s it tries again); `no canvas → plain image, no throw`; `dither off or readable mode → plain image` — **acceptance 5**; `grunts keep the ASCII portrait`. squad: the unit file shows the dithered image when the setting is on.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.** Draw the sprite into a `size × size` canvas (`object-fit: cover` crop from the top centre, default size 96), `getImageData` → `ditherBayer4` → `putImageData` → `toDataURL('image/png')`. Display with `image-rendering: pixelated`.

- [ ] **Step 4: Run** `npm test` → PASS. **Step 5: Commit** `feat(ui): ordered-dither portraits in the phosphor palette`

---

### Task 11: Sound

**Files:**
- Create: `src/ui/sound/sound.ts`, `content/core/uiSounds.json`
- Modify: `src/content/schemas.ts`, `src/content/types.ts`, `content/core/manifest.json`, `src/settings.ts`, `src/ui/shell/sysTab.ts`, `src/ui/shell/shell.ts` (`onDevice`, tab, toast hooks), `src/ui/scene/sceneScreen.ts` (typing ticks), `src/ui/leash/requestForm.ts` (stamp), `src/app.ts`, `content/core/glossary.json`, `src/analysis/providers/core.ts`
- Test: `tests/ui/sound.test.ts`; extend `tests/settings.test.ts`, `tests/content/core.test.ts`

**Interfaces:**
- Produces:
  - `type SoundId = 'open' | 'close' | 'tab' | 'notify' | 'alert' | 'stamp' | 'typing' | 'hum'`; `UiSoundSchema` (ruling; `id` must be a `SoundId`); `uiSounds` is **not** player-visible (not in `DESCRIBED_REGISTRIES`).
  - `createSound(deps: { settings: () => AliusSettings; registries: () => Registries; assetUrl?: (p: string) => string; audio?: () => AudioContextLike }): { play(id: SoundId): void; startHum(): void; stopHum(): void; dispose(): void }`.
  - Settings `soundVolume` (int 0–100, default **20**), `soundMuted` (false), `ambientHum` (false); SYS › Sound: volume (number 0–100, step 5), mute, ambient hum; glossary `setting_sound_volume`, `setting_sound_muted`, `setting_ambient_hum`.
  - `ShellDeps.sound?: { play(id: SoundId): void; startHum(): void; stopHum(): void }`: device up → `open`, down → `close`, tab change → `tab`, toast `info`/`story` → `notify`, `warn`/`error` → `alert`; `open()` starts the hum when enabled, `close()` stops it.

- [ ] **Step 1: Write the failing tests** (fake `AudioContextLike` that records oscillators, gains and buffer sources)

`no AudioContext is created before the first play`; `gain = volume/100 × entry.gain` (volume 20, entry .5 → .1); `muted or volume 0 plays nothing`; `a file entry plays the file; a file that fails to load falls back to the synth` (fake `fetch`/`decodeAudioData` rejection); `typing ticks are at most one per 60 ms` (fake timers: 10 calls in 50 ms → 1); `the hum loops while the shell is open and stops on close`; `the hum never starts with ambientHum off`; shell wiring: device up/down, tab change, a warn toast each play their id once; core: `uiSounds` has the 8 ids, none with a `file`; settings defaults.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.** Synth drafts (`wave, freq → endFreq, ms, gain`): open `triangle 420→880, 90, .5`; close `triangle 880→420, 90, .5`; tab `square 1200, 25, .25`; notify `sine 660→990, 120, .4`; alert `square 220, 180, .45`; stamp `sawtooth 90→60, 70, .6`; typing `square 2000, 8, .15`; hum `sine 50, loop, .08`. Envelope: 5 ms attack, exponential release to the end.

- [ ] **Step 4: Run** `npm test` → PASS. **Step 5: Commit** `feat(ui): UI sounds with a WebAudio fallback, volume, mute and ambient hum`

---

### Task 12: Documentation, manual checklist, final check

**Files:**
- Modify: `docs/packages/P10-visual-upgrade.md` (status line + **Implemented as**), `docs/00-overview.md` (§5 source layout: `src/ui/hub`, `device`, `voice`, `portrait`, `sound`; §5.4 a P10 block; §8 the seven settings move from "Planned" to implemented with defaults; §9 status `implemented`), `docs/packages/P11-prologue-onboarding.md`, `P9c-personal-pressure.md`, `P10b-intimate-immersion-ui.md` (**Interfaces already provided by P10**), `CLAUDE.md` (a P10 reading note like P9's), `docs/CONTENT.md` (how to add a room, a skin, a sound; art paths)
- Create: `docs/MANUAL_TEST_P10.md`

- [ ] **Step 1: Write the docs.** **Implemented as** lists every ruling above with its outcome and the open items: stored schedules (P10b), hand fonts (P10b), author art (hub base and slot variants, image skins, CC0 overlay texture, audio files), the objective stub (P11). §5.4 rows: `whereabouts`, `hubRooms` (`hosts`, `weights`, `likeTags`), `ScreenId 'hub'` / `registerHub` / `setDevice` / `isDeviceUp` / `toast(…, { voice })`, `deviceSkins` + `pickSkin` + `screenBox`, `renderVoiceCard` / `VOICE_OF` / `unitAccent`, `unitPortrait` / `ditherBayer4`, `createSound` / `SoundId`, `motionReduced` / `visualFlags`, `currentObjective` (P11 replaces the body), `tonightItems`, `app.talkAt`, `app.endSlot`. `MANUAL_TEST_P10.md`: one checklist row per acceptance criterion 1–7 plus the five Review Focus items, in SillyTavern (desktop width and a narrow window), including "DevTools › Network shows only extension files after a full reload with the cache disabled" (acceptance 7).

- [ ] **Step 2: Run** `npm test` → PASS (exit code 0), `npm run typecheck` → no errors, `npm run sim` → prints its report unchanged.

- [ ] **Step 3: Commit** `docs: P10 implemented-as, overview, dependent specs and manual checklist`

---

## Self-review notes (for the plan author; executors may ignore)

- Spec coverage: §1 hub → Tasks 1–4 (rooms, markers, room panel, objective stub, Tonight, OPEN PDA, END, top bar, art + fallback); §2 device → Tasks 3, 5, 6 (slide, Escape/Tab, all tabs inside, registry, 3 presets, image skins with `screenRect`, overlay texture field, inline SVG grain, SYS override); §3 voices → Task 9; §4 portraits → Task 10; §5 semantic colour → Tasks 4 and 8 (glyph always paired); §6 motion & sound & fonts → Tasks 7, 8, 11; §7 readable mode → Task 8; acceptance 1–7 → named tests in Tasks 4, 3, 6, 9, 10, 8, 7. P7a interfaces (marker classes, `animationMs`, `z-index`) → Tasks 3, 4, 8.
- Spec deviations, all ruled: derived whereabouts (no P2 schedule exists); `frameSize` added to image skins; `uiSounds` registry with synth fallback (no files shipped); Tab only outside controls; voice declared by a source table plus a toast option.
- Types used across tasks: `Voice` (Task 3 type, Task 9 styling), `MarkerTone` (Task 2 → 4, 8), `Whereabout` (2 → 4), `pickSkin`/`screenBox` (5 → 6), `motionReduced` (8 → 9, 10, 11), `SoundId` (11 only), `HubCtx.avatar` (4, filled in 10).
