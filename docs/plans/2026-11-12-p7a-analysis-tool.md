# P7a Analysis Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hover, focus + `?` or long-press any stat, option, chip or setting in the Alius shell → a terminal panel plays a short *analyzing* animation and explains the thing from content data (glossary, registry descriptions, a generated effects summary) plus, for live values, a "Current reading" that shows only what the player may know. No LLM calls.

**Architecture:** A new pure layer `src/analysis/` (like `src/world/`, `src/loyalty/`) turns an address (`data-analyze="<source>:<id>"` + `data-analyze-ctx`) into a `PanelModel`: static text and effects lines from the registries, a reading from registered providers filtered through a `Knowledge` object. It imports only `src/content`, `src/engine` and the settings *type*. A new UI module `src/ui/analyze/` renders the panel and owns all interaction through delegated listeners on the shell root; the shell attaches it on open and removes it on close. Two engine additions feed the readings: a bounded change **ledger** recorded by `dispatch` (for trends, sources and last changes) and `unitStatSteps` (how a stat is built). Chunk (a) = Tasks 1–7 (static tool, no readings); chunk (b) = Tasks 8–16 (readings, knowledge filter, content, back-fill, coverage).

**Tech Stack:** TypeScript 5 (strict), esbuild, zod 3, vitest (+ jsdom for UI). No new dependencies.

**Spec:** `docs/00-overview.md` (§3 P1/P4/P7, §5.4, §8), `docs/packages/P7a-analysis-tool.md`. Task 12 also reads `docs/content/roles.md` and `docs/content/defects.md` (descriptions come from the drafts, spec §6). `docs/ROADMAP-next.md` gives the two chunks.

## Global Constraints

- English everywhere (overview P8). Every text from content or a reading is set with `textContent` / text nodes, never `innerHTML`; links are built as DOM nodes.
- **Zero network and LLM calls** (spec acceptance 7): `src/analysis/**` and `src/ui/analyze/**` never import `src/llm`, `src/st` (except `import type`), `src/scene`, `src/world`, `src/loyalty`. Enforced in Task 7.
- `src/engine/**` stays pure (architecture test) and never imports `src/analysis`.
- Spec numbers, verbatim: hover delay **250 ms** (setting); animation `ANALYZING ▒▒▒░░` **600 ms** the first time a subject is analyzed in a session, **150 ms** afterwards; long-press **400 ms**; drill-down depth **max 3**; glossary `short` **≤ 160** chars, `long` **≤ 600** chars; ≈ **30** starter glossary concepts.
- Addressing, verbatim: `data-analyze="<source>:<id>"`, optional `data-analyze-ctx="<json>"`. Sources: `glossary`, any registry name, and `setting` (Task 11).
- Settings (SYS): enabled on/off, animation `full | short | off`, hover delay.
- With "show raw values" off, readings show **bands only** for axes and stress (spec acceptance 4); readings never reveal hidden clocks, disloyalty internals, open-dilemma effects or anything a knowledge rule hides.
- Dilemma options explain only their tags (requires/check/scale), never what they would change (spec open decision, default **no**).
- Campaign state stays `version: 1`; the one new field (`ledger`) is optional, so P0–P6 saves load unchanged.
- `dist/index.js` and `style.css` are committed; `npm test` rebuilds them; commit them with each change.
- Commit messages end with the `Co-Authored-By:` / `Claude-Session:` trailers of the executing agent (overview P9).

## Where the code differs from the spec (read before Task 1)

Rulings taken while planning; Task 16 lists them in the spec's **Implemented as**.

- **Registries that do not exist yet.** The spec's lists name traits, world options, punishments, Impunity, stances, archetype, presence, disposition (P7–P9). They are not built here: those packages add their registries with `description`, their glossary entries and their providers. Commander body stats come with P7.
- **"Registries without a `description` field get one".** An optional `description: str.max(600)` is added to every player-visible registry schema (`PLAYER_VISIBLE` in Task 3). The panel text is `description ?? summary ?? fallback` (defects: upside / downside; signatures: `mechanic`; clocks: `label`; flags: `description`). The loader has no warning channel, so "validator warning if missing" is `missingDescriptions(reg)`: listed in SYS › Debug › Content warnings and asserted empty for the core pack by a test (Task 12).
- **Links inside text.** Drill-down links are written in content as `[[target]]` or `[[target|label]]`; `target` is an address or a bare glossary id. The 160/600 limits count the displayed text (markup stripped). Unknown targets are reported by the loader as broken references; `setting:` targets are not checked by the loader (Task 14's coverage test catches them).
- **Readings are keyed by address.** `registerAnalyzeProvider(key, fn)` — `key` is an exact address (`glossary:trust`) or a bare source (`setting`); exact keys are tried first. The spec's `(subject, ctx, knowledge)` maps to `(subject: Subject, ctx: AnalyzeEnv, knowledge: Knowledge)`; the element's `data-analyze-ctx` is `subject.data`.
- **Settings get glossary text.** Static text for `setting:<key>` is the glossary entry `setting_<key>` (content, author-editable).
- **History has no amounts, so a ledger records them.** `dispatch` compares the state before and after every successful action and appends `{ day, slot, action, key, delta }` for each changed resource (`res:<r>`), unit stress (`stress:<unitId>`) and relation axis (`axis:<unitId>:<axis>`), keeping 7 days and at most 150 entries (`TUNING.ledger`). Trends, stress sources and "last changes" read it. A combat changes no unit or resource until it is finalized (P4 invariant), so a retried attempt leaves no entries. Old saves simply have no entries ("No recent changes").
- **Stress thresholds.** The reading uses the combat bands of `engine/combat/stress.ts` (`calm < 50 ≤ strained < 80 ≤ breaking < 100 = breakdown`), because those carry mechanics; the next-threshold text is the glossary entry `stress_<band>`.
- **Stress becomes visible on SQUAD.** The unit block shows no stress today; the back-fill adds a `STRESS <BAND>` chip so the stress reading has a home outside combat.
- **Where a stat is used.** The spec's "effect/check index" is: the glossary `long` text for `stat_<k>` (formula use) + the effects on her own gear and defects that touch the stat, summarized (Task 11). No global index is built.
- **Keyboard.** `?` and `F1` analyze `document.activeElement.closest('[data-analyze]')`. `analyzeAttrs` gives non-focusable marked elements `tabindex="0"` so chips are reachable; an element that sets its own `tabindex` after the spread keeps it. `?` and `Backspace` are ignored while typing in an input, textarea, select or contenteditable; `F1` is not.
- **Escape order.** The analyzer listens on `window` in the capture phase: when a panel is open, `Esc` closes it and stops propagation, so neither the shell's modal handler nor the combat `cancel` key sees it.
- **Long-press pins.** Touch cannot hover, so a long-press opens the panel pinned and swallows the click that follows; a short tap clicks normally; moving > 10 px cancels.
- **Animation modes.** `full`: 600 ms first time per address in this analyzer's life, 150 ms afterwards, with the scan-line wipe; `short`: 150 ms every time, no wipe; `off`: text at once. `prefers-reduced-motion: reduce` counts as `off`.
- **Refresh.** `shell.refresh()` closes a transient panel and rebuilds a pinned one from the current state (its target may be gone).
- **Coverage markers.** There are no shared stat/option/chip classes today. This package introduces `alius-stat`, `alius-chip`, `alius-option`; the coverage test checks `ANALYZE_MARKERS = '.alius-stat, .alius-chip, .alius-option'`. Text that is neither (headings, names, free input) is not marked.
- **Event causes.** History lines need one-line causes: `eventDeltas[]` gets optional `cause: str.max(80)` (content); missing → the humanized event id.
- **Overview edits.** The eight overview changes `docs/ROADMAP-next.md` assigns to this planning session were applied together with this plan (principles P10–P12, planned data-model fields, `commander_import`, planned settings, P7a–P13 in §9, the §10 roadmap items, historical notes on P0–P6). P12 in §3 is the coverage rule; Task 16 only turns P7a's §9 row to implemented and fills §5.4/§6/§8 with what was built.

## File Structure

```
content/core/glossary.json                       new registry (+ manifest), starter entries (Task 12)
content/core/{items,affixes,enemies,nodeTypes,relationshipStates,eventDeltas}.json   descriptions / causes (Task 12)
src/content/types.ts, schemas.ts, refs.ts, links.ts      glossary, description, cause, link syntax
src/settings.ts                                    analyzeEnabled, analyzeAnimation, analyzeHoverDelay
src/engine/state/types.ts, tuning.ts, ledger.ts, dispatch.ts   change ledger
src/engine/combat/stats.ts                         unitStatSteps
src/engine/dilemma/flow.ts                         dilemmaOptions also returns check / requires
src/analysis/subject.ts, describe.ts, effects.ts, model.ts     addresses, static text, effects summary, panel model
src/analysis/knowledge.ts, providers.ts, ledger.ts             knowledge filter, provider registry, ledger reads
src/analysis/providers/core.ts                     axis, stress, stat, resource, setting, decision providers
src/ui/analyze/mark.ts, place.ts, panel.ts, analyzer.ts        markers, placement, panel DOM, interaction
src/ui/shell/shell.ts, sysTab.ts, status.ts        attach analyzer, Analysis settings, content warnings, header chips
src/ui/squad/squadTab.ts, skillTree.ts, base/baseTab.ts, inv/invTab.ts            back-fill (Task 13)
src/ui/combat/combatScreen.ts, expedition/nodeMapView.ts, expeditionScreen.ts,
  dilemma/dilemmaPanel.ts, setup/setupScreen.ts, setup/calibration.ts             back-fill (Task 14)
src/app.ts, css/95-analyze.css
docs/** (Task 16), tests/** mirror src, tests/fixtures/analyze/, tests/helpers/analyze.ts
```

## Review Focus

1. **Bad or stale addresses** (`data-analyze="items:"`, no colon, invalid JSON in `data-analyze-ctx`, an id removed from content, a `unitId` that is dead or unknown, no campaign loaded) → the panel shows `NO DATA // <address>` or the static text without a reading; nothing throws, a throwing provider is skipped. Tests in Task 3 (`a malformed address is null`, `an unknown id builds a missing model`) and Task 9 (`a throwing provider is skipped`).
2. **The panel outlives what it points at** (`shell.refresh()` replaces the target, tab switch, shell closed with a timer pending, chat switch to no campaign) → a transient panel closes, a pinned one rebuilds or reads `NO CAMPAIGN`, no timer fires after `destroy()`. Tests in Task 6 (`destroy cancels pending timers`) and Task 7 (`refresh closes a transient panel and keeps a pinned one`).
3. **Keys that belong to someone else** (`?` typed in the scene box or a SYS number field, `Backspace` in a text field, `Esc` in combat or with a modal open) → typing is never hijacked; `Esc` closes only the panel. Tests in Task 6 (`? in an input types`, `Esc closes the panel and stops propagation`).
4. **Numbers leaking with raw values off** through trends, stress sources, ledger lines or history → bands and arrows only. Test in Task 9's harness (`no provider shows a sentinel number with raw values off`) run over every registered provider.
5. **Touch** (a long-press on a button, a short tap, a scroll gesture) → the long-press opens a pinned panel and does not click; a tap clicks and opens nothing; moving > 10 px cancels. Test in Task 6 (`a long-press does not click`).

---

## Chunk (a) — static analysis tool

### Task 1: Glossary registry, descriptions and the link syntax

**Files:**
- Create: `src/content/links.ts`, `content/core/glossary.json` (3 placeholder entries: `trust`, `stress`, `cp`; Task 12 fills it)
- Modify: `src/content/types.ts` (`'glossary'` appended to `REGISTRY_NAMES` under a `// P7a` comment), `src/content/schemas.ts`, `src/content/refs.ts`, `content/core/manifest.json`
- Test: `tests/content/links.test.ts`, `tests/content/glossarySchemas.test.ts`, `tests/content/core.test.ts` (extend)

**Interfaces:**
- Produces:
  - `parseLinks(text: string): Array<string | { target: string; label?: string }>` — `[[target]]` / `[[target|label]]`; an unclosed `[[` stays text; `stripLinks(text): string` (link → label, else the target's id part); `linkTargets(text): string[]`.
  - `GlossarySchema = BaseEntrySchema.extend({ term: str, short: str, long: str.optional(), see: z.array(str).optional() })` with refinements `stripLinks(short).length ≤ 160`, `stripLinks(long).length ≤ 600`.
  - `description: str.optional()` (refined `stripLinks ≤ 600`) on: roles, skills, signatures, statuses, defects, items, affixes, enemies, enemyCategories, regions, nodeTypes, activities, facilities, crimes, corporations, starts, relationshipStates, locations, orders, synergies (skills/statuses already have a required `description`: unchanged).
  - `EventDeltaSchema` + `cause: str.max(80).optional()`.
  - Refs: a target `glossary:<id>` or bare `<id>` → `glossary`; `<registry>:<id>` with a known registry name → that registry; `setting:*` → none; any other source → a broken-reference error `unknown source "<src>"`. Applied to `glossary.see`, links in `glossary.short/long`, and links in every `description`.

- [x] **Step 1: Write the failing tests** — `links`: `parses a bare and a labelled link`; `an unclosed bracket stays text`; `strip keeps labels and the id part`. `glossarySchemas`: `short over 160 displayed chars is rejected, markup does not count`; `long over 600 is rejected`; `a see entry pointing at a missing glossary id is a broken reference`; `a link to items:nope in a description is a broken reference`; `a setting: link is not checked`; `an unknown source is reported`; `description is optional on items and roles`; `eventDeltas accept a cause up to 80 chars`. `core`: `the core pack loads with no errors` (still), `glossary is a registry of the core pack`.
- [x] **Step 2: Run** `npx vitest run tests/content` → FAIL.
- [x] **Step 3: Implement** links, schemas, refs, manifest entry, placeholder file.
- [x] **Step 4: Run** `npx vitest run` → whole suite green.
- [x] **Step 5: Commit** `feat(content): glossary registry, descriptions and drill-down link syntax`.

---

### Task 2: Analysis settings and the SYS section

**Files:**
- Modify: `src/settings.ts`, `src/ui/shell/sysTab.ts`
- Test: `tests/settings.test.ts` (extend), `tests/ui/shell.test.ts` (extend)

**Interfaces:**
- Produces: `AliusSettings.analyzeEnabled: boolean` (default `true`), `analyzeAnimation: 'full' | 'short' | 'off'` (default `'full'`), `analyzeHoverDelay: number` (int 100–1500, default `250`); SYS section `h3 'Analysis'` after **Decisions** with `field('Analysis tool (hover, ? or long-press)', checkbox('analyzeEnabled'))`, `field('Analysis animation', select('analyzeAnimation', [['full','full'],['short','short'],['off','off']]))`, `field('Hover delay (ms, 100–1500)', numberInput(...))`.

- [x] **Step 1: Write the failing tests** — `defaults are enabled, full and 250`; `a hover delay of 50 or 2000 falls back to the stored value`; SYS: `the Analysis section changes the three settings`.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, suite green.
- [x] **Step 5: Commit** `feat(settings): analysis tool settings`.

---

### Task 3: Subjects, static text and the panel model

**Files:**
- Create: `src/analysis/subject.ts`, `src/analysis/describe.ts`, `src/analysis/model.ts`
- Modify: `src/ui/shell/sysTab.ts` (Debug › **Content warnings**: `missingDescriptions` list under Content errors; `SysCtx.getRegistries?: () => Registries`)
- Test: `tests/analysis/subject.test.ts`, `tests/analysis/model.test.ts`

**Interfaces:**
- Produces:
  - `interface Subject { address: string; source: string; id: string; data: Record<string, unknown> }`; `parseSubject(address: string, ctxJson?: string | null): Subject | null` — split at the first `:`; empty source or id → `null`; invalid or non-object JSON → `data = {}`. `resolveTarget(target: string): string` — bare id → `glossary:<id>`.
  - `PLAYER_VISIBLE: readonly RegistryName[]` (the 20 registries of Task 1 + `glossary`); `entryTitle(registry, entry): string` (`term ?? name ?? label ?? id`); `entryText(registry, entry): string | null` (the fallback chain of **Where the code differs**); `missingDescriptions(reg): Array<{ registry: RegistryName; id: string }>`.
  - `interface AnalyzeEnv { registries: Registries; state: CampaignState | null; settings: AliusSettings }`.
  - `interface PanelModel { address: string; source: string; title: string; text: string | null; long: string | null; effects: string[]; see: string[]; reading: { lines: string[] } | null; missing: boolean }` — `text`, `long`, `effects`, `reading.lines` are strings that may carry link markup.
  - `buildPanelModel(subject: Subject, env: AnalyzeEnv): PanelModel` — `glossary` → the entry; `setting` → glossary `setting_<id>`, `source` stays `setting`; a registry name → `entryTitle`/`entryText`, `effects = entryEffects(...)` (Task 4; `[]` until then); unknown source or id → `{ missing: true, title: 'NO DATA', text: address }`. `reading` is `null` in this chunk.

- [x] **Step 1: Write the failing tests** — `subject`: `parses source, id and ctx`; `a malformed address is null` (`'items:'`, `'trust'`, `':x'`); `bad ctx JSON gives empty data`; `a bare target resolves to glossary`. `model`: `a glossary subject shows term, short and long`; `an item without description falls back to null text and is listed by missingDescriptions`; `a defect falls back to upside / downside`; `a setting reads its setting_ glossary entry`; `an unknown id builds a missing model`; `an unknown source builds a missing model`. SYS: `content warnings list missing descriptions` (fixture registries).
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, suite green.
- [x] **Step 5: Commit** `feat(analysis): subjects, static text and panel model`.

---

### Task 4: Effects summary

**Files:**
- Create: `src/analysis/effects.ts`
- Modify: `src/analysis/model.ts` (fills `effects`)
- Test: `tests/analysis/effects.test.ts`

**Interfaces:**
- Produces: `summarizeCombatEffect(e: CombatEffect, reg: Registries): string`, `summarizeWorldEffect(e: WorldEffect, reg: Registries): string`, `summarizeActivityEffect(e: ActivityEffect, reg: Registries): string | null` (`emit_event` → `null`), `entryEffects(registry: RegistryName, entry: Entry, reg: Registries): string[]`. Lines may contain links (statuses, enemies, factions, facilities, synergies). An unknown effect type → its humanized type; nothing throws on any entry.
- Line rules (combat). Base phrase by type: `damage` `Damage ×{mult}` / `Damage {pctMaxHp}% max HP` (+ ` ×{hits} hits`, ` ignores rows`, ` +{critBonus}% crit`); `heal` `Heal {pct}% max HP`; `revive` `Revive at {pct}% HP`; `status` `Apply [[statuses:{id}]]` (+ ` ({turns} turns)`, ` ×{stacks}`); `cleanse` `Remove {count} {kind}(s)`; `stat` `{±pct}% {STAT}` (`all` → `all stats`); `outgoing` `{±pct}% damage dealt` (+ ` vs marked/locked`); `incoming` `{±pct}% damage taken`; `stress` `{±amount} Stress`; `stress_taken` `{±pct}% stress {gained|relief}`; `cp` `{±amount} CP`; `move` `Move to front/back` / `Swap rows`; `extra_action` `Extra action`; `redirect` `Takes {pct}% of hits aimed at {an ally|the commander} ({turns} turns)`; `intercept_lethal` `Takes a lethal hit for {an ally|the commander}`; `summon` `Summons [[enemies:{id}]] (max {max})`; `follow_up` `Follow-up ×{mult}`; `misfire` `May misfire`; `override_action` `Attacks on her own`; `lock_target` `Locks on ({turns} turns)`; `loot_roll` `+{extra} loot roll(s)`; `repeat_order` `Repeats the last order`; `hp_set` `HP set to {value}`; `immune` `Immune to [[statuses:{id}]]`; `order_cost` `Orders {±delta} CP` (+ order names); `order_refusal` `May refuse orders`; `loadout_slots` `+{amount} loadout slot(s)`; `injury_days` `{±pct}% injury time`. Then, in order: target suffix when `target ∉ {undefined, self, target}` (` — {humanized target}`); trigger suffix (`onStressThreshold` → ` at Stress ≥ {threshold}`, `onHit` ` on hit`, `onCrit` ` on crit`, `onKill` ` on kill`, `onDamaged` ` when hit`, `onAllyDowned` ` when an ally falls`, `onTurnStart` ` each turn`, `onRoundStart` ` each round`, `onCombatStart` ` at combat start`, `onCombatEnd` ` after combat`, `onAction` ` on action`); `when` suffix per key (`stressMin` ` at Stress ≥ n` unless the trigger already said it, `hpBelowPct` ` below n% HP`, others humanized); ` ({chance×100}% chance)`; ` (once per round|combat)`; prefix `Downside: ` when `downside`.
- Line rules (world): `resource` `{±amount} {Credits|Supplies|Plyx}`; `faction` `{±amount} standing with [[corporations:{id}]]`; `clock` `{label} {±by}` if the clock is `visibleToPlayer`, else `An unseen threat {advances|recedes}`; `party_stress` `{±} Stress to the party`; `party_hp` `{±pct}% HP to the party`; `leash` `{±1} Leash authorization`; others humanized (`flag`, `thread_flag`, `thread`, `fact` → no line).
- Line rules (activity): `resource` `{±amount} {Res}` (+ ` +{per} per {Stat} rank`); `commander_stat` `+{amount} {Stat}`; `unit_xp` / `unit_stress` / `injury_days` `{Chosen units|Companion|Roster} {±amount} {XP|Stress|injury days}`; `commander_injury_days`; `defect_upkeep` `{Who}: defect upkeep`; `relation` `Companion {±amount} {Axis}`; suffixes ` (more with [[facilities:{id}]])`, ` (focus: {label})`, ` (if she likes {tag})`.
- Per registry (`entryEffects`): skills — `Cooldown {n} · {cp} CP · {stress} Stress` (parts present) + effects; statuses — `{±pct}% {STAT} per stack` from `mods`, `{±incomingPct}% damage taken`, `Each turn: …` from `tick`, flags humanized, `Lasts {turns} turns, up to {maxStacks} stacks`; items — `+{n} {STAT}` per base stat, then effects; affixes — `{±n}% {STAT}` from `statPct`, effects, `Drawback` if set; orders — `Costs {cost} CP` + effects; synergies — effects; defects — `combat.upside`, `combat.downside`, `Breakdown: {breakdown.name}`; activities — cost line, `effects`, `With a companion: …` per `companionEffects`; facilities — one line per level `Level {n}: {label} {value}, …` with `FACILITY_KEY_LABELS` (`rosterCapacity` beds, `restPct` rest %, `rarityCap` rarity cap, `upgradeDiscountPct` upgrade discount %, `stressReliefPct` stress relief %, `injurySpeed` recovery speed, `arcStageCap` defect arc stage, `upkeepReduction` upkeep −, `mealPct` meal effect %, `rumorsPerDay` rumors/day, `missionBoardSize` board size, `dmFeatures` DM features); crimes — `Perk: {perk.text}`, `Flaw: {flaw.text}`; corporations — `Starting bonus: {startingBonus.text}`, `Oversight: {leash.weekly} authorizations a week`; nodeTypes — rest `Costs {suppliesPerUnit} supplies per unit · {hpPct}% HP · {stress} Stress`, combat `Danger {±dangerDelta}`; enemies — `Skills: [[skills:a]], …`; signatures — `[[skills:{skill}]]`; relationshipStates — `Unlocks: [[synergies:…]]` and `{Axis} gains ×{n}` / `losses ×{n}` from `modifiers`; others — `[]`.

- [x] **Step 1: Write the failing tests** — `+20% ATK at Stress ≥ 50` for `{ type: 'stat', stat: 'atk', pct: 20, trigger: 'onStressThreshold', threshold: 50 }` and for the same with `when: { stressMin: 50 }` and no trigger; `status links its id`: `Apply [[statuses:bleed]] (2 turns)`; `downside and chance`: `Downside: May refuse orders (15% chance)`; `−15 Credits` for a world resource; `a hidden clock reads as an unseen threat`; `Companion −10 Stress`; `every effect in the core pack summarizes to a non-empty line without "undefined" or "[object"` (iterate all registries through `entryEffects`); `an unknown type is humanized`; `facility lines list every level`.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, suite green.
- [x] **Step 5: Commit** `feat(analysis): effects summary from structured effects`.

---

### Task 5: Panel component and placement

**Files:**
- Create: `src/ui/analyze/place.ts`, `src/ui/analyze/panel.ts`, `src/ui/analyze/mark.ts`, `css/95-analyze.css`
- Test: `tests/ui/analyzePanel.test.ts`

**Interfaces:**
- Consumes: `PanelModel` (Task 3), `parseLinks`, `resolveTarget`.
- Produces:
  - `placePanel(anchor: { x: number; y: number }, size: { w: number; h: number }, viewport: { w: number; h: number }, gap = 12): { left: number; top: number }` — right/below the anchor by `gap`; flips left/up when it would overflow; clamped to ≥ 4 px from every edge.
  - `ANALYZE_MARKERS = '.alius-stat, .alius-chip, .alius-option'`; `analyzeAttrs(address: string, ctx?: Record<string, unknown>): Record<string, string>` → `data-analyze`, `data-analyze-ctx` (only with `ctx`), `tabindex: '0'`.
  - `interface PanelView { model: PanelModel; crumbs: string[]; canDrill: boolean; pinned: boolean; analyzingMs: number; wipe: boolean }`; `renderPanel(host: HTMLElement, view: PanelView, on: { link(address: string): void; crumb(index: number): void; back(): void; pin(): void }): void` — frame `┌─[ ANALYSIS ]` … `└─`; while `analyzingMs > 0` the body is the line `ANALYZING ▒▒▒░░` (class `alius-analyze-wipe` when `wipe`) and the caller re-renders with `analyzingMs: 0`; then title, breadcrumbs (`A › B › C`, each but the last a button), `[<]` back button when `crumbs.length > 1`, `[PIN]`/`[PINNED]` toggle, `text`, `long`, an **EFFECTS** block, a **CURRENT READING** block when `reading`, a **SEE ALSO** row from `see`. Links are `button.alius-analyze-link[data-target]`; when `canDrill` is false they render as plain text. Root: `div.alius-analyze[role=dialog][aria-label="Analysis: <title>"]`.
  - CSS: fixed position, z-index above `.alius-modal-layer`, monospace, palette vars of `00-vars.css`, max-width 42ch, wipe keyframes; `@media (prefers-reduced-motion: reduce)` disables the wipe.

- [x] **Step 1: Write the failing tests** — `placePanel`: `sits below-right of the cursor`, `flips left at the right edge`, `flips up at the bottom`, `never leaves the viewport on a tiny screen`. `renderPanel`: `analyzing shows the scan line and no text`; `text renders links as buttons with their target`; `content text is never parsed as HTML` (`<img onerror>` in `text` stays text); `no drill-down links at max depth`; `breadcrumbs call crumb with their index`; `pin toggles the label`. `analyzeAttrs`: `adds ctx only when given`.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, `npm run build` includes `.alius-analyze` in `style.css`.
- [x] **Step 5: Commit** `feat(ui): analysis panel, placement and markers`.

---

### Task 6: Interaction controller

**Files:**
- Create: `src/ui/analyze/analyzer.ts`
- Test: `tests/ui/analyzer.test.ts` (jsdom, `vi.useFakeTimers()`; pointer events are `Object.assign(new Event('pointerover', { bubbles: true }), { pointerType, clientX, clientY })`)

**Interfaces:**
- Consumes: `parseSubject`, `buildPanelModel`, `renderPanel`, `placePanel`, settings of Task 2.
- Produces:
  - `animationMs(mode: AliusSettings['analyzeAnimation'], seenBefore: boolean, reducedMotion: boolean): number` — `full` 600/150, `short` 150, `off` or reduced motion 0.
  - `interface AnalyzerDeps { getEnv: () => AnalyzeEnv; reducedMotion?: () => boolean }`; `attachAnalyzer(root: HTMLElement, deps: AnalyzerDeps): Analyzer`; `interface Analyzer { openFor(target: HTMLElement, at?: { x: number; y: number }, opts?: { pinned?: boolean }): void; close(): void; isOpen(): boolean; isPinned(): boolean; refresh(): void; destroy(): void }`.
  - Behaviour: every listener checks `settings.analyzeEnabled`. **Mouse** — `pointerover` on a `[data-analyze]` (pointerType ≠ `touch`) starts a `analyzeHoverDelay` timer, then opens at the cursor; `pointerout` to anything outside the target and the panel closes a transient panel after 100 ms; Shift held at that moment pins instead. **Pin** — `[PIN]` toggles; a pinned panel closes on `Esc`, `[PINNED]` or a `pointerdown` outside it. **Drill-down** — a link pushes its address (auto-pins); `crumbs.length` ≤ 3 (`canDrill = crumbs.length < 3`); crumb click truncates; `[<]` and `Backspace` (panel open, not typing) pop; popping the root closes. **Keyboard** (window, capture) — `?` or `F1` with a focused `[data-analyze]` opens anchored at its rect's bottom-left; `Esc` with a panel open closes it, `preventDefault()` + `stopImmediatePropagation()`. **Touch** — `pointerdown` touch starts 400 ms; `pointermove` > 10 px, `pointerup`, `pointercancel` cancel; on fire opens pinned and swallows the next `click` (capture, once). **Animation** — `animationMs` with `seenBefore` = address already opened by this analyzer; a drill or back re-renders after the same rule. `refresh()` — transient: close; pinned: rebuild every crumb's model from `getEnv()`. `destroy()` — removes listeners, panel and every timer.

- [x] **Step 1: Write the failing tests** — `hover waits the hover delay, then opens near the cursor`; `moving away closes it, Shift keeps it pinned`; `first analysis shows ANALYZING for 600 ms, the second for 150`; `short is 150 both times, off and reduced motion show text at once`; `disabled ignores hover, keys and long-press`; `? on a focused chip opens it, F1 too`; `? in an input types`; `Backspace in a text field does nothing to the panel`; `Esc closes the panel and stops propagation` (a document keydown spy and the combat `attachCombatKeys` cancel handler are not called); `a link drills down, auto-pins and adds a crumb`; `the fourth level is not offered`; `Backspace and [<] go back, past the root closes`; `a long-press opens pinned and does not click` (button `onclick` spy); `a tap clicks and opens nothing`; `moving 11 px cancels the long-press`; `a click outside a pinned panel closes it`; `destroy cancels pending timers` (hover started, destroy, advance 1 s → no panel, no error).
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, suite green.
- [x] **Step 5: Commit** `feat(ui): analyzer interaction — hover, keys, long-press, pin and drill-down`.

---

### Task 7: Shell and app wiring, architecture guard

**Files:**
- Modify: `src/ui/shell/shell.ts` (`ShellDeps.analyze?: { registries: () => Registries }`; `attachAnalyzer(root, …)` in `open()` with `getEnv: () => ({ registries: deps.analyze.registries(), state: deps.getState(), settings: getSettings(st) })`; `destroy` in `close()`; `analyzer.refresh()` in `refresh()`; footer hint `? analyze`; `getRegistries` passed to SYS), `src/app.ts` (passes `analyze: { registries: () => registries }`), `tests/architecture.test.ts`
- Test: `tests/ui/shell.test.ts` (extend), `tests/architecture.test.ts` (extend)

**Interfaces:**
- Produces: the analyzer runs whenever the shell is open; `ShellApi` unchanged.

- [x] **Step 1: Write the failing tests** — shell: `hovering a marked element inside the open shell shows the panel`; `closing the shell removes the panel and its listeners`; `refresh closes a transient panel and keeps a pinned one`; `without analyze deps the shell works as before`. Architecture: `the analysis layer and the analyze UI never reach the LLM or SillyTavern` — every file under `src/analysis` and `src/ui/analyze`: no import path matching `/\/(llm|scene|world|loyalty)\//` or `st:`, `/st/` only as `import type`, no `fetch(` and no `SillyTavern`; `src/analysis` also imports nothing from `/ui/`.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npx vitest run` → PASS; `npm run typecheck`.
- [x] **Step 5: Commit** `feat: wire the analysis tool into the shell`.

**Chunk (a) ends here.** Stop and report.

---

## Chunk (b) — readings, knowledge, content and coverage

### Task 8: Change ledger (engine)

**Files:**
- Create: `src/engine/ledger.ts`
- Modify: `src/engine/state/types.ts` (`LedgerEntry`, `CampaignState.ledger?: LedgerEntry[]`), `src/engine/tuning.ts` (`TUNING.ledger = { days: 7, max: 150 }`), `src/engine/dispatch.ts`
- Test: `tests/engine/ledger.test.ts`

**Interfaces:**
- Produces: `interface LedgerEntry { day: number; slot: Slot; action: string; key: string; delta: number }`; `recordLedger(before: CampaignState, after: CampaignState, action: string): void` — appends to `after.ledger` one entry per changed `resources.<r>` (`res:<r>`), unit `stress` (`stress:<unitId>`, units present in both) and relation axis (`axis:<unitId>:<trust|affinity|attraction>`), stamped with `before.day` / `before.slot`; then drops entries with `day < after.day − (days − 1)` and keeps the newest `max`. `dispatch` calls it after a handler returns without throwing.

- [x] **Step 1: Write the failing tests** — `an activity that pays credits records res:credits with action activity/do`; `a scene intent that moves Trust records axis:<id>:trust`; `day-end upkeep records res:supplies on the day it was eaten`; `a rejected action records nothing` (same state object returned); `combat/act inside an open combat records nothing`; `entries older than 7 days are dropped and at most 150 kept`; `a save without ledger dispatches normally`.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npx vitest run` → green. If an existing test compares whole states after a successful action, compare it without `ledger`; do not change the ledger to dodge it.
- [x] **Step 5: Commit** `feat(engine): bounded change ledger for resources, stress and axes`.

---

### Task 9: Knowledge filter, provider registry and readings in the panel

**Files:**
- Create: `src/analysis/knowledge.ts`, `src/analysis/providers.ts`, `tests/fixtures/analyze/hidden.ts`, `tests/helpers/analyze.ts`
- Modify: `src/analysis/model.ts` (`buildPanelModel` fills `reading`)
- Test: `tests/analysis/knowledge.test.ts`, `tests/analysis/hidden.test.ts`

**Interfaces:**
- Produces:
  - `interface Knowledge { showRaw: boolean; raw(n: number): string | null; clockVisible(id: string): boolean; factVisible(f: Fact): boolean; flagVisible(id: string): boolean; facts(): Fact[] }`; `interface KnowledgeRule { fact?(f: Fact, state: CampaignState): boolean; flag?(id: string, state: CampaignState): boolean }` (false hides); `registerKnowledgeRule(rule): void`; `resetKnowledgeRules(): void` (tests); `buildKnowledge(state: CampaignState, settings: AliusSettings): Knowledge` — `raw` returns `String(n)` only with `showRawValues`; clocks visible by `visibleToPlayer`; facts and flags visible unless a rule hides them (the commander knows every fact today; P12 adds rules).
  - `interface Reading { lines: string[] }`; `type AnalyzeProvider = (subject: Subject, ctx: AnalyzeEnv, knowledge: Knowledge) => Reading | null`; `registerAnalyzeProvider(key: string, fn: AnalyzeProvider): void`; `analyzeProviders(): ReadonlyMap<string, AnalyzeProvider[]>`; `readingFor(subject, env): Reading | null` — no state → `null`; exact-address providers then source providers; lines concatenated; a provider that throws is skipped (`console.warn`).
  - `tests/fixtures/analyze/hidden.ts`: `hiddenFixture(reg): { state; sentinels: { numbers: number[]; texts: string[] } }` — a campaign with one unit at Trust 37, Affinity −41, Attraction 23, stress 63 (and ledger entries with deltas 17 and −29), a clock with `visibleToPlayer: false` labelled `SENTINEL_CLOCK`, a fact with tag `sentinel` and text `SENTINEL_FACT` hidden by a registered rule, a disloyalty record with `attempts: 3`, `nextCheckDay: 97`, and an open presented dilemma whose option effects carry `faction` amount 77 and label `SENTINEL_OPTION_EFFECT`.
  - `tests/helpers/analyze.ts`: `SAMPLE_ADDRESS: Record<string, string>` for bare-source keys (`setting` → `setting:showRawValues`); `allReadings(env): string` — every registered key run with `data: { unitId }` of the fixture unit, joined text.

- [x] **Step 1: Write the failing tests** — `knowledge`: `raw is null with raw values off`; `a hidden clock is not visible`; `a rule hides a fact from facts()`; `reset removes rules`. `hidden` (runs over **every** registered provider, so later packages are checked too): `no provider shows a sentinel number with raw values off`; `no provider shows a sentinel text`; `every bare-source provider has a sample address`; `a throwing provider is skipped`; `no state gives no reading`.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS (the hidden test passes vacuously until Task 10 registers providers; Task 10 re-runs it).
- [x] **Step 5: Commit** `feat(analysis): knowledge filter, provider registry and readings`.

---

### Task 10: Readings — relationship axes and stress

**Files:**
- Create: `src/analysis/ledger.ts`, `src/analysis/providers/core.ts` (axes and stress here; Task 11 adds the rest)
- Modify: `src/app.ts` (`registerCoreProviders()` in `createApp`)
- Test: `tests/analysis/axisReading.test.ts`, `tests/analysis/stressReading.test.ts`

**Interfaces:**
- Consumes: `trustBand`, `affinityBand`, `attractionBand` (`engine/relations/bands`), `stressBand` (`engine/combat/stress`), `intimacyOf`, `Relation.history`, ledger.
- Produces:
  - `ledgerLabel(action: string): string` — prefix table: `activity/` activity, `calendar/` day end, `scene/` and `intents/` conversation, `dm/` DMs, `night/` night, `combat/` combat, `expedition/` expedition, `item/` workshop, `base/` base, `leash/` the Leash, `loyalty/` loyalty, `dilemma/` decision, `arc/` defect arc, `director/` world, else `other`; `ledgerFor(state, key, sinceDay): LedgerEntry[]` newest first.
  - `registerCoreProviders(): void` (idempotent).
  - `glossary:trust|affinity|attraction` with `data.unitId`: line 1 `{Name}: {BAND}` + ` ({raw})`; line 2 trend over `day ≥ state.day − 2` from the ledger: `Trend ▲` / `▼` / `▬` + ` (+7)` only with raw; then the last 3 `history` entries of kind `event`, newest first: `{cause} — {severity}, day {d}` (`cause` = `eventDeltas[type].cause` or the humanized type); then `State: [[relationshipStates:{stateId}]]`. A grunt on Affinity/Attraction: `Grunts track Trust only.`; Attraction with romance off: `Romance is off.`; unknown unit → `null`.
  - `glossary:stress` with `data.unitId`: `{Name}: {BAND}` (+ raw); sources from the ledger since `state.day − 1`, grouped by label: with raw `+12 combat`, without `rose — combat` / `fell — rest`; `Next: {stress_<nextBand>.short}` for the next of 50/80/100 above her stress (none at 100).

- [x] **Step 1: Write the failing tests** — axes: `bands only with raw values off` (fixture Trust 37: text has `GUARDED`, not `37`); `raw adds the number and the signed trend`; `trend arrows follow the ledger of the last 3 days`; `the last three history events with causes, newest first`; `a grunt has no Affinity reading`; `romance off hides Attraction`. Stress: `band and next threshold`; `sources group by label and hide amounts without raw`; `a save without ledger says No recent changes`. Re-run `tests/analysis/hidden.test.ts` → PASS with providers registered.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, suite green.
- [x] **Step 5: Commit** `feat(analysis): readings for relationship axes and stress`.

---

### Task 11: Readings — unit stats, resources, settings, decision options

**Files:**
- Modify: `src/engine/combat/stats.ts` (`unitStatSteps`), `src/analysis/providers/core.ts`, `src/engine/dilemma/flow.ts` (`dilemmaOptions` adds `check?: { stat; rank }`, `requires?: { stat; rank }` — backwards compatible)
- Test: `tests/engine/combat/statSteps.test.ts`, `tests/analysis/statReading.test.ts`, `tests/analysis/resourceReading.test.ts`, `tests/analysis/settingReading.test.ts`, `tests/analysis/decisionReading.test.ts`

**Interfaces:**
- Produces:
  - `interface StatStep { source: 'role' | 'level' | 'gear' | 'armor' | 'injury'; label: string; total: number }`; `unitStatSteps(state, reg, unit, stat: StatName): StatStep[]` — the same order as `unitStats` (role base, level growth, each worn item's flat stat, the affix percentages, armor SPD, injuries, floor); the last `total` equals `unitStats(...)[stat]`; steps that change nothing are omitted.
  - `glossary:stat_<hp|atk|def|spd|crit>` with `data.unitId`: `{Name}: {STAT} {value}`; one line per step (`Role base 12`, `Level 4 → 15`, `[[items:x]] → 18`, `Injuries ×1 → 16`); `In combat:` lines — every effect of her worn items, their affixes and her defects' `combat.upside/downside` whose type is `stat` (same stat or `all`), `outgoing` (ATK) or `incoming` (DEF), summarized with Task 4 and followed by the source link.
  - `glossary:credits|supplies|plyx`: `Now {amount}`; supplies `Daily upkeep {needed} ({units} units and you)` from `upkeepNeeded`, others `No daily upkeep`; up to 5 ledger lines `{±delta} — {label}, day {d}`; none → `No recent changes`.
  - `setting` (bare source): `Now: {value}` (booleans on/off, selects their label, `budgets` → `per call type`, `difficulty` → the campaign's); lock line from `SETTING_LOCKS` — `desireBondDefects`: `This campaign keeps its own value: {on|off}` when `state.settings.desireBondDefects` differs; `difficulty`: `Locked while a combat is open` when `state.combat`; `analyze*`: none; others `Takes effect at once.`
  - `glossary:decision_option` with `data: { requires?, check?, scale }`: `Requires [[{stat}]] rank {rank} (yours: {n})`; `Check: [[{stat}]] rank {rank} — rolled when you choose; if it fails, only the costs remain.`; `[[decision_{scale}]]`; always `What it changes stays uncertain until you choose.` Never reads `dilemmas.open.options[].effects`.

- [x] **Step 1: Write the failing tests** — steps: `the last step equals unitStats for every stat of a geared, injured, levelled unit`; `steps that change nothing are left out`. Stat: `lists base, level, gear and injury`; `a defect's +20% ATK at Stress ≥ 50 is listed under In combat with its link`. Resource: `supplies show the daily upkeep`; `credits list the last ledger changes with labels`. Setting: `shows the current value`; `a campaign started with Desire/Bond off says it keeps its value`; `difficulty is locked in combat`. Decision: `explains requires and check, never effects` (fixture option label and amount absent). `dilemmaOptions returns check and requires`. Re-run `hidden.test.ts` → PASS.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, suite green.
- [x] **Step 5: Commit** `feat(analysis): readings for stats, resources, settings and decision options`.

---

### Task 12: Starter glossary and registry descriptions (content)

Reads `docs/content/roles.md` and `docs/content/defects.md`; texts go into JSON as data.

**Files:**
- Modify: `content/core/glossary.json`, `items.json`, `affixes.json`, `enemies.json`, `nodeTypes.json`, `relationshipStates.json`, `eventDeltas.json`, `src/analysis/providers/core.ts` (exports `CORE_GLOSSARY_IDS`: the concept ids below)
- Test: `tests/content/glossaryCore.test.ts`

**Interfaces:**
- Glossary ids (every address Tasks 10, 11, 13, 14 use must exist): concepts `trust`, `affinity`, `attraction`, `stress`, `stress_strained`, `stress_breaking`, `stress_breakdown`, `downed`, `loyalty_band`, `relationship_state`, `values`, `value_pragmatism`, `value_autonomy`, `value_ingroup`, `value_mercy`, `value_corporate`, `value_sacrifice`, `social_stats`, `authority`, `insight`, `empathy`, `cunning`, `credits`, `supplies`, `plyx`, `upkeep`, `slots`, `commander_injury`, `cp`, `leash`, `leash_compel`, `leash_suppress`, `leash_terminate`, `defect`, `defect_arc`, `arc_cure`, `arc_manage`, `arc_embrace`, `breakdown`, `stat_hp`, `stat_atk`, `stat_def`, `stat_spd`, `stat_crit`, `level_xp`, `skill_points`, `loadout`, `rarity`, `workshop`, `roster`, `grunt`, `clearance`, `unknown_node`, `decision_option`, `decision_minor`, `decision_major`, `decision_defining`; one `setting_<key>` per key of `DEFAULT_SETTINGS` (all of them are SYS fields; `budgets` included) plus `setting_difficulty`. Each has `term` and `short`; concepts also `long` where the spec's tables need "where used" (stats, stress, axes) and `see` links (e.g. `trust` → `loyalty_band`, `leash_compel`).
- Descriptions: every entry of items, affixes, enemies, nodeTypes, relationshipStates gets `description` (one or two sentences, links where useful); every `eventDeltas` entry gets `cause`.

- [x] **Step 1: Write the failing tests** — `missingDescriptions is empty for the core pack`; `every glossary id the code addresses exists` (`CORE_GLOSSARY_IDS`, `setting_<key>` for every key of `DEFAULT_SETTINGS`, `setting_difficulty`); `there are at least 30 concept entries`; `every eventDelta has a cause`; `no glossary text contains raw HTML`.
- [x] **Step 2: Run** → FAIL. **Step 3: Write the content** (wording is a draft; the author edits it, spec open decision). **Step 4: Run** → PASS, suite green.
- [x] **Step 5: Commit** `feat(content): starter glossary, registry descriptions and event causes`.

---

### Task 13: Back-fill — header, SQUAD, BASE, INV — and the coverage test

**Files:**
- Create: `tests/ui/analyzeCoverage.test.ts`
- Modify: `src/ui/shell/status.ts`, `src/ui/squad/squadTab.ts`, `src/ui/squad/skillTree.ts`, `src/ui/base/baseTab.ts`, `src/ui/inv/invTab.ts`, `css/40-squad.css` (chip spacing)
- Test: `tests/ui/analyzeCoverage.test.ts`, existing `status`, `squad`, `base`, `inv` UI tests (text content stays the same except the new stress chip)

**Interfaces:**
- Consumes: `analyzeAttrs`, `ANALYZE_MARKERS`.
- Markup (class + address):
  - Header: `CR n` / `SUP n` / `PLYX n` as three `span.alius-stat` (`glossary:credits|supplies|plyx`, separators as text so the text is unchanged); `LEASH n` `glossary:leash`; clock `glossary:slots`; `INJURED` `glossary:commander_injury`; `SHORTAGE` `glossary:upkeep`.
  - SQUAD unit block: relation line as chips — state `relationshipStates:<stateId>`, `TRUST`/`AFFINITY`/`ATTRACTION` `glossary:<axis>` `{ unitId }`; loyalty `glossary:loyalty_band`; new `STRESS <BAND>` chip `glossary:stress` `{ unitId }` (band of `engine/combat/stress`, raw number with raw values on); role `roles:<roleId>`; XP `glossary:level_xp`; skill points `glossary:skill_points`; HP/ATK/DEF/SPD/CRIT as five `alius-stat` `glossary:stat_<k>` `{ unitId }`; equipment item names `items:<itemId>` (chip); defect names `defects:<id>` (chip); each value axis `glossary:value_<axis>` (stat); signature `signatures:<templateId>`; loadout labels `skills:<id>` (option); skill-tree nodes `skills:<skill>` (option; upgrade nodes use `upgrade.skillId`); arc path rows `glossary:arc_<path>` (option); Leash buttons `glossary:leash_<kind>` (option).
  - BASE: facility card upgrade button `facilities:<id>` (option) and level text `facilities:<id>` (stat); roster toggles `glossary:roster` (option); recruit `glossary:grunt` (option).
  - INV: resource line as three stats; item buttons `items:<itemId>` (option); rarity `glossary:rarity` (chip); affix names `affixes:<id>` (chip); compare deltas `glossary:stat_<k>` (stat); recipes `items:<itemId>` (option); upgrade/dismantle/reroll `glossary:workshop` (option).
- `analyzeCoverage` harness: `markedWithout(host): string[]` — outerHTML snippets of `ANALYZE_MARKERS` elements lacking `data-analyze`; `unresolved(host, env): string[]` — addresses whose `buildPanelModel` is `missing`.

- [x] **Step 1: Write the failing tests** — for the header, SQUAD (named unit + grunt, raw on and off), BASE and INV rendered from `tests/helpers/world.ts` `campaign(reg, 4)` with an item equipped: `every marker has data-analyze`; `every address resolves in the core pack`; `the screen has at least N markers` (header 5, SQUAD 25, BASE 6, INV 6 — non-vacuous); `the SQUAD stress chip shows a band and no number with raw values off`; plus `hovering a SQUAD trust chip in a real shell shows a reading with the band` (end-to-end through `createShell` + `registerCoreProviders`).
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; existing UI tests green (update only assertions that read the new stress chip).
- [x] **Step 5: Commit** `feat(ui): analysis markers on the header, SQUAD, BASE and INV`.

---

### Task 14: Back-fill — combat, expedition nodes, dilemma options, setup wizard, SYS

**Files:**
- Modify: `src/ui/combat/combatScreen.ts` (`card()` takes synergy ids and looks up names), `src/ui/expedition/nodeMapView.ts` (`NodeMapView.types?: Record<string, string>` node id → node type id), `src/ui/expedition/expeditionScreen.ts` (passes `types` for known nodes), `src/ui/dilemma/dilemmaPanel.ts` (`options[].check?`, `requires?`), `src/app.ts` (passes them from `dilemmaOptions`), `src/ui/setup/setupScreen.ts`, `src/ui/setup/calibration.ts`, `src/ui/shell/sysTab.ts` (`field(label, control, address?)`)
- Test: `tests/ui/analyzeCoverage.test.ts` (extend), existing combat, expedition, dilemmaPanel, setup, shell tests

**Interfaces:**
- Markup:
  - Combat: status tags as chips `statuses:<id>`; `STRAINED`/`BREAKING`/`BREAKDOWN` `glossary:stress_<band>`; `DOWN` `glossary:downed`; synergies `synergies:<id>` (chip); HP line `glossary:stat_hp` and squad ST line `glossary:stress` `{ unitId }` (stat); skill buttons `skills:<id>` (option); order buttons `orders:<id>` (option); CP `glossary:cp` (stat); LEASH `glossary:leash` (stat). The tags line keeps its `[TAG]` text.
  - Expedition node map: a known node `nodeTypes:<typeId>`, an unknown one `glossary:unknown_node` (option for buttons, chip for spans).
  - Dilemma options: `glossary:decision_option` with `{ scale, check?, requires? }` (option).
  - Setup: start cards `starts:<id>`, crime cards `crimes:<id>`; calibration role cards `roles:<id>`, signature cards `signatures:<id>`, defect cards `defects:<id>` (all `alius-option` added next to `alius-card`); value sliders `glossary:value_<axis>`; baseline sliders `glossary:<axis>` (option).
  - SYS: every `field()` gets `alius-option` and `setting:<key>` (budgets → `setting:budgets`, difficulty → `setting:difficulty`).

- [x] **Step 1: Write the failing tests** — coverage for combat (build as `tests/ui/combat.test.ts` does, with a bleeding, strained unit and a synergy), the node map of a started expedition, the dilemma panel (an option with `check`), the setup wizard (start, crime, calibration steps), SYS: `every marker has data-analyze`, `every address resolves`, minimum counts (combat 10, node map 3, dilemma 2, setup 6, SYS 30); `no network or LLM call happens while every marked element on every screen is analyzed` (`globalThis.fetch` spy and the `FakeStAdapter` request log stay empty; all markers opened through `Analyzer.openFor`).
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npx vitest run` → PASS; `npm run typecheck`.
- [x] **Step 5: Commit** `feat(ui): analysis markers on combat, expedition nodes, dilemmas, setup and SYS`.

---

### Task 15: Panel polish in context

**Files:**
- Modify: `css/95-analyze.css`, `src/ui/analyze/analyzer.ts` (only if a test below fails)
- Test: `tests/ui/analyzer.test.ts` (extend)

- [x] **Step 1: Write the failing tests** — `a panel opened inside a modal (Leash request form) sits above it and Esc closes the panel, not the modal`; `the combat screen keeps keyboard control after Esc closed a panel` (next `g` still guards); `a pinned panel survives a combat re-render and rebuilds its reading`; `palette changes recolour the panel` (`data-palette` on the shell root applies).
- [x] **Step 2: Run** → FAIL or PASS; fix only what fails. **Step 3: Run** `npx vitest run` → green.
- [x] **Step 4: Commit** `fix(ui): analysis panel inside modals and combat`.

---

### Task 16: Build, docs, acceptance

**Files:**
- Modify: `dist/index.js`, `style.css` (via `npm run build`), `docs/packages/P7a-analysis-tool.md` (status line + **Implemented as** with every ruling above and those taken while implementing), `docs/00-overview.md` (§5.4: `glossary` registry, `description`, link syntax, `registerAnalyzeProvider`, `registerKnowledgeRule`, `buildKnowledge`, `analyzeAttrs` / `ANALYZE_MARKERS`, `ledger`, `unitStatSteps`, `ShellDeps.analyze`; §6 `ledger?`; §8 the three settings; §9 P7a row → implemented), `docs/CONTENT.md` (`glossary`, `description`, `cause`, link syntax with an example), `docs/packages/P7-…md` … `P13-…md` (**Interfaces already provided by P7a**: markers, providers, knowledge rules, glossary), `docs/README.md`, `CLAUDE.md` (pointer to the P7a **Implemented as**)
- Create: `docs/MANUAL_TEST_P7a.md`
- Test: `tests/build.test.ts` (existing)

- [ ] **Step 1:** `npm run build` → `dist/index.js` and `style.css` change and stay tracked.
- [ ] **Step 2:** Walk the seven acceptance criteria against test names and record them in `docs/MANUAL_TEST_P7a.md` next to the in-SillyTavern steps that cannot be automated (real mouse hover and flip at screen edges; long-press on a phone or touch emulation; `?`/`F1` with the browser's own F1; reduced-motion OS setting; drill-down three levels from Trust; readings before and after a scene that moved Trust; raw values on/off; every back-filled screen).
- [ ] **Step 3:** `npx vitest run` and `npm run typecheck` → all green; put the counts in the final report.
- [ ] **Step 4: Commit** `chore: rebuild dist and style, P7a docs and manual checklist`.

---

## Self-review notes (for the plan author; executors may ignore)

- Spec coverage: §1 interaction — hover/delay/flip (T5, T6), animation durations (T6), pin and Shift (T6), drill-down with breadcrumbs, depth 3, Backspace (T5, T6), keyboard `?`/`F1`/`Esc` (T6), long-press (T6), settings (T2); §2 addressing (T3, T5), glossary registry (T1, T12), registry subjects and effects summary (T3, T4), `description` field and warning (T1, T3, T12); §3 readings — axes (T10), stats (T11; commander body stats → P7), stress (T10), Impunity (P9), resources (T11), settings (T11; world options → P8), provider API and knowledge (T9); §4 coverage rule and back-fill of SQUAD, unit profile, combat, BASE, INV, expedition nodes, dilemma options, setup wizard, SYS (T13, T14); §5 look (T5, T15); §6 content (T12). Acceptance 1 → T6; 2 → T5/T6; 3 → T3/T4; 4 → T10/T11; 5 → T9 harness; 6 → T13/T14; 7 → T7 architecture + T14 runtime check.
- The largest deviations: the ledger in `dispatch` (history has no amounts); readings keyed by address; settings explained through `setting_<key>` glossary entries; later-package registries and readings left to their packages.
- One engine interface is extended backwards-compatibly (`dilemmaOptions` adds `check`/`requires`); `unitStatSteps` and `recordLedger` are new. Task 16 records them in §5.4.
- `RealStAdapter` needs no new method.
