# P7a — Analysis Tool (contextual explanations)

**Depends on:** P0–P6 (UI shell as implemented). **Runs before P7**, so every new screen from P7 on is built with it. **Read:** overview; this file.

> **Historical spec.** This package is implemented; where this text and the code differ, the code is the source of truth (see **Implemented as**).

**Status:** implemented (plan: `plans/2026-11-12-p7a-analysis-tool.md`). Automated tests pass; the in-SillyTavern checklist `MANUAL_TEST_P7a.md` still has to be run by hand.

## Goal

Hover (or focus, or long-press) any stat, option, trait, defect, status, resource or setting → a small terminal panel appears under the cursor, plays a short *analyzing* animation, then shows a concise explanation of what the thing does, and — for live values — why it is what it is right now. It is the game's built-in manual, diegetically framed as the PDA's analysis function.

## Principles

- **Data, not generation.** Explanations come from registries and a glossary. No LLM calls: zero cost, instant, never hallucinates rules.
- **Never spoils hidden state.** Dynamic readings show only what the player is allowed to know (bands unless "show raw values"; no unknown warden expectations, no truth flags of Frequency intercepts, no facts the commander doesn't know).
- **Fast after the first time.** The animation is flavour; it must not tax repeated use.

## 1. Interaction

- **Mouse:** hover 250 ms → panel opens near the cursor (flips to stay on screen). Animation `ANALYZING ▒▒▒░░` — 600 ms the first time a subject is analyzed in a session, 150 ms afterwards. Moving away closes it.
- **Pin:** click the panel's pin or hold `Shift` to keep it open and move the cursor into it.
- **Drill-down:** terms inside an explanation are links to their own entries (e.g. Impunity → Leash credibility). Breadcrumbs, max depth 3, `Backspace` goes back.
- **Keyboard:** focused element + `?` (or `F1`) opens the panel; `Esc` closes.
- **Touch:** long-press 400 ms.
- Settings (SYS): enabled on/off, animation `full | short | off`, hover delay.

## 2. Addressing subjects

Any element gets `data-analyze="<source>:<id>"` and optionally `data-analyze-ctx="<json>"` (unit id, etc.).

Sources:
- `glossary:<id>` — registry `glossary`: `{ id, term, short (≤ 160 chars), long? (≤ 600 chars), see?: string[] }` for core concepts: Trust, Affinity, Attraction, Stress, Impunity, CP, slots, clearance, loyalty bands, stances, archetype, presence, disposition, etc.
- `<registry>:<id>` — any registry entry with `name`/`description` (roles, skills, signatures, statuses, defects, items, affixes, traits, crimes, corporations, world options/choices, punishments, activities, facilities, relationship states, node types, enemies). The panel shows the entry's description plus a generated **effects summary** from its structured effects (e.g. "+20% ATK at Stress ≥ 50").

Registries without a `description` field get one (schema change, optional field, validator warning if missing on player-visible entries).

## 3. Dynamic readings

Providers by subject kind add a **"Current reading"** block under the static text:

| Subject | Reading |
|---|---|
| Relationship axis of a unit | band, trend (▲▼ over the last 3 days), the last 3 contributing events from `relation.history` with one-line causes |
| Unit stat / commander body stat | value or descriptor, where it is used (from the effect/check index), modifiers currently applied (gear, defect, injury) |
| Stress | band, sources in the last expedition/day, what happens at the next threshold |
| Impunity (once P9 exists) | stance and the main contributing terms as bands; providers are added by the package that adds the value |
| Resource | current amount, daily upkeep, last changes |
| Setting / world option | what it changes, whether it is locked |

Provider API: `registerAnalyzeProvider(kind, (subject, ctx, knowledge) => Reading)`. `knowledge` is the player-visible filter; providers must use it (tested).

## 4. Coverage rule

From this package on, every player-facing stat, option, chip and choice card carries `data-analyze`. A test renders the main screens in jsdom and fails on elements marked with the shared classes for stats/options/chips that lack it. This package back-fills existing screens: SQUAD, unit profile, combat (skills, statuses, CP orders), BASE, INV, expedition nodes, dilemma options, setup wizard, SYS.

## 5. Look

Terminal voice: monospace, box-drawing frame, phosphor palette, scan-line wipe for the analyzing animation; respects reduced motion (animation `off`). P10 later restyles it with voices.

## 6. Content

A starter `glossary` (≈ 30 entries) drafted by the agent from the specs; the author edits the wording. Descriptions for registry entries come from `content/*.md` drafts.

## Acceptance criteria

1. Hover, focus + `?`, and long-press open the panel; first-time vs repeat animation durations match settings; `off` shows text immediately.
2. Pin and drill-down work, with breadcrumbs and back navigation; depth capped at 3.
3. `glossary:` and `<registry>:` subjects render static text and an effects summary generated from structured effects.
4. Dynamic readings for axes, stats, stress and resources show the specified data; with "show raw values" off only bands appear.
5. Hidden-state test: readings never include unknown facts, unknown expectations or intercept truth flags (fixture-based).
6. Coverage test passes on all existing main screens.
7. No network/LLM calls are made by the tool.

## Open decisions (author)

- Glossary wording.
- Whether the panel may show "what an option would change" previews on dilemma choices (default: no — choices stay uncertain; only the option's tags are explained).

## Interfaces already provided by P7a (use, do not rebuild)

Every package from P7 on: give each new player-facing stat, chip, option and choice card `data-analyze` (overview P12), a glossary entry or registry `description`, and — for a live value — an analyze provider that reads through `Knowledge`. The coverage test fails on a marked element without an address; the hidden-state test runs over every registered provider.

## Implemented as

### Architecture
- **Pure layer `src/analysis/`** (imports only `src/content`, `src/engine` and the settings *type*; an architecture test also forbids `llm`, `scene`, `world`, `loyalty`, `ui`, `fetch` and ST): `subject.ts` (`parseSubject`, `resolveTarget`), `describe.ts` (`PLAYER_VISIBLE`, `entryTitle`, `entryText`, `missingDescriptions`, `settingGlossaryId`), `effects.ts` (the generated effects lines), `model.ts` (`buildPanelModel`, `AnalyzeEnv`, `PanelModel`), `knowledge.ts`, `providers.ts`, `ledger.ts`, `providers/core.ts` (`registerCoreProviders`, called by `createApp`; `CORE_GLOSSARY_IDS`).
- **UI `src/ui/analyze/`**: `mark.ts` (`ANALYZE_MARKERS`, `analyzeAttrs`, `analyzeNative`), `place.ts`, `panel.ts` (`renderPanel`, text only), `analyzer.ts` (`attachAnalyzer`, `animationMs`). `createShell` attaches the analyzer on `open()` when `ShellDeps.analyze` is given (`app.ts` passes `{ registries }`), destroys it on `close()` and calls `analyzer.refresh()` in `refresh()`. The panel is a child of `#alius-shell`, so palette variables apply and it stacks above the modal layer.
- **Engine additions:** the bounded change **ledger** (`engine/ledger.ts`: `recordLedger` is called by `dispatch` after every handler that did not throw; `CampaignState.ledger?` — 7 days, 150 entries, `TUNING.ledger`; keys `res:<r>`, `stress:<unitId>`, `axis:<unitId>:<axis>`; a save without it loads unchanged) and `unitStatSteps` (how a stat is built; its last `total` always equals `unitStats`). `dilemmaOptions` also returns the option's `check` / `requires` tags (never its effects).
- **Content:** `glossary` registry (`term`, `short` ≤ 160, `long?` ≤ 600, `see?`; `content/core/glossary.json` has 93 entries: 57 concepts and 36 `setting_…` entries, one per settings key plus `difficulty`), optional `description` (≤ 600) on 20 player-visible registries, optional `cause` (≤ 80) on `eventDeltas`, and the `[[target]]` / `[[target|label]]` link syntax (`content/links.ts`; the loader reports broken link targets and unknown sources).

### Rulings and deviations from the plan
- **Registries that do not exist yet** (traits, world options, punishments, Impunity, stances, archetype, presence, disposition) are not built: P7–P9 add them with their descriptions, glossary entries and providers. Commander body stats come with P7.
- **`description`** is added by wrapping the registry schemas (`DESCRIBED_REGISTRIES`; skills and statuses already require one). The panel text is `description ?? summary ?? fallback` (defects: upside / downside; signatures: `mechanic`; clocks: `label`). `missingDescriptions(reg)` — entries with nothing to show — feeds SYS › Debug › **Content warnings** and a test asserts it is empty for the core pack. The loader has no warning channel, so this is not a loader warning.
- **Readings are keyed by address** (`glossary:trust`) or bare source (`setting`); `registerAnalyzeProvider` returns an unregister function (tests). Exact keys run first. No campaign → no reading.
- **Setting texts** are glossary entries with **lower-case snake_case ids** (`showRawValues` → `setting_show_raw_values`, `settingGlossaryId(key)`), because the content id rule (`^[a-z0-9_:.-]+$`) rejects camelCase. Addresses keep the real key: `setting:showRawValues`. SYS `field(label, control, setting)` marks every row.
- **Marker classes.** `alius-stat`, `alius-chip`, `alius-option` are the analysis markers. The two legacy uses of `alius-chip` (proposal buttons, calibration tag chips) were renamed `alius-tagchip` and the expedition node state class `alius-option` was renamed `alius-reachable` (CSS included), so nothing else carries a marker class.
- **Keyboard.** `?` and `F1` analyze the focused element's closest `[data-analyze]`; `?` and `Backspace` are ignored while typing in an input, textarea, select or contenteditable, `F1` is not. Spans, chips and stats get `tabindex="0"` (`analyzeAttrs`); buttons and labels around a control use `analyzeNative` (no extra tab stop). A panel opened from the keyboard opens **pinned** (nothing to hover away from).
- **Escape** is handled on `window` in the capture phase: with a panel open it closes it and stops propagation, so neither the shell's modal handler nor the combat `cancel` key sees it.
- **Touch:** a 400 ms long-press opens the panel pinned and swallows the click that follows (once, with a 1 s safety timer); moving more than 10 px cancels; touch never hovers.
- **Animation:** `full` 600 ms the first time an address is opened by this analyzer and 150 ms afterwards (with a clip-path wipe), `short` 150 ms, `off` or `prefers-reduced-motion` 0.
- **Refresh:** `shell.refresh()` closes a transient panel and rebuilds a pinned one from the current state.
- **Knowledge.** `buildKnowledge(state, settings)`: `raw(n)` is `null` unless "show raw values"; a clock is visible only if `visibleToPlayer`; facts and flags are visible unless a registered rule (`registerKnowledgeRule`, P12 uses it) hides them; a throwing rule hides nothing. Axes, trends, stress and its sources show bands and arrows only without raw values. **Unit stat values, resource amounts and requires/check ranks are shown as numbers** (the sheet and the header already show them). Decision options explain only their tags and `What it changes stays uncertain until you choose.`
- **Stress** uses the combat bands of `engine/combat/stress.ts` (calm / strained / breaking / breakdown) and, during a fight, the fighter's live stress; the next-threshold text is the glossary entry `stress_<band>`. SQUAD gained a `STRESS <BAND>` chip.
- **Stat steps:** `StatStep.source` has a sixth value `floor` (the minimum of 1, crit 0), so the last step always equals `unitStats`. The "In combat" lines list effects of worn items, their affixes and her defects that touch the stat (`stat` of that stat or `all`, `outgoing` for ATK, `incoming` for DEF).
- **Effects text:** `summarizeWorldEffect` returns `null` for flags, threads and facts (no line). Links in generated lines are `[[statuses:id]]`-style without labels.
- **Architecture guard:** import paths are compared after resolving them (`engine/world` is not `src/world`); `src/settings` may be imported as a type only.
- **UI details:** the header resources are three `alius-stat` spans inside the unchanged `CR n · SUP n · PLYX n` text; compare deltas in INV carry no unit ctx; a disabled button may not raise pointer events in every browser (check by hand); a pinned panel closes on any outside `pointerdown`.

### Open items
- **Screens not marked:** OPS (activity cards, requisition, mission board), MAP, the expedition planner and party strip, the Leash request form and the confrontation panel carry no `data-analyze` (they are outside the screens this spec names for back-fill). The daily activity choices are the most obvious gap: mark them with `activities:<id>` (`summarizeActivityEffect` is ready) and extend the coverage test.
- Review leftovers (minor): `?`/`Backspace` are ignored on checkboxes and selects; disabled buttons carry markers but may not raise pointer events; axis readings list recent events regardless of axis; ledger labels for `squad/`, `proposal/`, `mission/`, `roster/`, `world/`, `commander/` read "other"; the 150-entry ledger cap is shared by all keys; stress bands differ between the combat vocabulary (used here) and `relations/bands` (scene context); the panel has no `max-height`; keyboard drill-down does not move focus into the panel; no `user-select` guard for Android long-press; `recordLedger` runs inside the handler's `try`.
- Glossary wording is a draft for the author (spec open decision); previews of what an option would change stay off.
- Providers for Impunity, stances, world options and traits belong to P7–P9; commander body stats to P7.
