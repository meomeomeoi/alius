# P8 World Options & Unit Disposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before a campaign starts, the player sets the world: gender norms, off-spec stigma, oversight, Bloom horror, tone and, above all, the **disposition** of defective soldiers (kind … hazardous). Disposition is a set of engine parameters (delta multipliers, confidence floors, loyalty bands, stage timing, refusal, desertion, mutiny, breakdown targets, big gestures). It is applied by the engine to intents that have already been extracted, never through the extraction prompt. Each named unit has a disposition offset and per-option world stances, both proposed at import and editable.

**Architecture:** New content registries (`worldOptions`, `dispositionLevels`, `stanceEffects`, `worldPresets`) hold every number and text. A new pure engine folder `src/engine/worldOptions/` owns the readers: `options.ts` (stored choice or default, choice effects by type, families), `disposition.ts` (a unit's effective level and its parameters, join-time offsets, band shift) and `stances.ts` (stance effects). Existing modules call these at a few hook points: join sites, `computeDeltas`, `meets`, the loyalty bands, refusal, desertion, mutiny, combat breakdowns, Leash, missions, the world seed, the director digest and the dilemma and event pools. `world.options` is optional: an old save reads the defaults, which are neutral, so it plays exactly as before. Chunk (a) = Tasks 1–10 (registries, state, locking, the lore block, engine plumbing, the purge family). Chunk (b) = Tasks 11–16 (import, wizard, WORLD PARAMETERS screen, SYS, analysis, docs).

**Tech Stack:** TypeScript 5 (strict), esbuild, zod 3, vitest (+ jsdom for UI). No new dependencies.

**Spec:** `docs/00-overview.md` (§3 P1–P4/P11/P12, §5.3, §5.4, §6, §8), `docs/packages/P8-world-options-disposition.md`. Read these as implemented: `docs/packages/P3-scenes-relationships-memory.md`, `P6-dilemmas-disloyalty-leash.md`, `P7-commander-profile-traits.md` (**Implemented as** and **Non-obvious things to know**) and `P7a-analysis-tool.md` (**Implemented as**). `docs/ROADMAP-next.md` gives the two chunks. Read `docs/content/lore.md` every session: §0 sets the pronoun rule, and §1/§2 set the tone of the placeholder lore lines.

## Global Constraints

- English everywhere (overview P8). All UI text goes through `textContent`/`h()`, never `innerHTML`.
- `src/engine/**` stays pure (architecture test; do not write the host app's name in engine comments). `src/engine/worldOptions/**` imports only `src/content` types and other `src/engine` modules.
- **The model describes, the engine judges.** No world option, disposition level, offset or stance ever reaches the `intent_extract` input. Its prompts are byte-identical across disposition levels (test in Task 5).
- **Options are declared in data.** Code reads choice effects **by type**, never by option or choice id (the P7 rule, overview P4). The two exceptions are the option ids the spec names as fixed slots: the disposition option is found as the option whose choices carry `disposition` effects, and stance options carry `squadStance: true`.
- **Locking:** every option except those marked `live: true` is fixed when `buildCampaign` writes it. `world/set_option` accepts only live options (v1: `bloom_horror`).
- Spec numbers, verbatim (`dispositionLevels`, ranks 1–5):

  | Param | kind | guarded | prickly | volatile | hazardous |
  |---|---|---|---|---|---|
  | start Trust / Affinity | +10/+10 | 0/0 | −10/−5 | −20/−10 | −30/−20 |
  | loss × / gain × | 0.7 / 1.2 | 1 / 1 | 1.3 / 0.9 | 1.6 / 0.8 | 2.0 / 0.7 |
  | min confidence gain / loss | 0.5 / 0.6 | 0.5 / 0.5 | 0.6 / 0.5 | 0.7 / 0.45 | 0.75 / 0.4 |
  | band shift | −5 | 0 | +3 | +6 | +10 |
  | band exit extra | 0 | 0 | +2 | +5 | +8 |
  | stage days × | 0.8 | 1 | 1.2 | 1.5 | 2.0 |
  | refusal / desertion × | 0.5 | 1 | 1.3 | 1.7 | 2.0 |
  | mutiny | off | despises | despises | despises, resentful | despises, resentful, warning 1 day |
  | breakdown target | self | default | allies | allies_commander | everyone |
  | big gesture × | 1 | 1 | 1.2 | 1.5 | 2 |

- Per-unit `dispositionOffset ∈ [−2, +2]`; effective rank = clamp(world rank + offset, 1, 5); grunts use the world rank. Stances are `'shares' | 'indifferent' | 'opposes'` with strength `1 | 2` and a reason. WORLD SETTINGS block **≤ 120 tokens**. Oversight Leash base **3 / 2 / 1** per week (lenient / standard / brutal). `scorned` mission rewards **−10%**.
- Presets, verbatim: **Gentle** = indifferent, tolerated, lenient, restrained, grim_hope, kind. **Standard** = the defaults. **Brutal** = corporate_machismo, hunted, brutal, graphic, bleak, hazardous.
- **Defaults are neutral** (user ruling): `gender_norms: indifferent`, `offspec_stigma: tolerated`, `oversight: standard`, `bloom_horror: restrained`, `tone: grim`, `disposition: guarded`. With all defaults, every hook is the identity and makes no new rng draw. Old saves and every existing test therefore keep their numbers.
- **No pronoun for the commander** in any text a player or the main model reads (lore line, directive, description, glossary, stance reason prompt). Soldiers are "she". `tests/content/pronouns.test.ts` must cover the new registries.
- Campaign state stays `version: 1`; every new field is optional.
- Determinism: every new roll uses `ctx.rng`. The new draws (grunt stance roll, `allies_commander` / `everyone` breakdown target) only happen under non-default choices. If a seeded test moves anyway, update it deliberately and give the reason in the commit message.
- Overview P12: every new option card, choice card, chip and stat carries `data-analyze`. `worldOptions` and `dispositionLevels` join `DESCRIBED_REGISTRIES` / `PLAYER_VISIBLE`, and the new concepts get glossary entries. The coverage test stays green.
- `dist/index.js` and `style.css` are committed; `npm test` rebuilds them. Check its exit code before committing.
- Commit messages end with the executing agent's `Co-Authored-By:` / `Claude-Session:` trailers (overview P9).

## Where the code differs from the spec (read before Task 1)

These rulings were taken while planning, some by the user; Task 16 copies them into the spec's **Implemented as**.

- **State.** `World.options?: Record<optionId, choiceId>`. Readers use `worldChoice(state, reg, optionId)`, which returns the stored choice or the option's `default`; an unknown stored choice falls back to the default. `buildCampaign` writes every option (`SetupResult.world?.options`, missing keys → default). There is no seed action: old saves read neutral defaults, and SYS shows them as locked.
- **Unit fields.** `Unit.dispositionOffset?: number`, `Unit.dispositionReason?: string`, `Unit.worldStances?: Record<optionId, { stance, strength, reason }>`. Absent = offset 0 / `indifferent`.
- **Choice effects** form a closed vocabulary (`WorldOptionEffectSchema`):
  - `disposition { levelId }`
  - `leash_weekly { amount }`
  - `terminate_approval { amount }`
  - `command_failure_mult { mult }`
  - `mission_reward_pct { pct }`
  - `expression_norm { norm: 1..5, standingPerStep }`
  - `enable_family { family }`
  - `director_hint { text }`
  - `scene_directive { text }`
  - `grunt_stances { shares, indifferent, opposes }` (weights)

  "Tone of corporate messages" and the NPC / oversight / enemy reactions are lore lines and scene directives, never code.
- **Oversight Leash base 3/2/1** is `leash_weekly` **+1 / 0 / −1** on top of the corporation's base. Corporations already differ (Vesper 3, Kestrel 2, …), and replacing their base would erase that. With a base-2 corporation this gives exactly 3/2/1. The Terminate approval roll is `terminate_approval` **+0.1 / 0 / −0.15**. Failed **command** missions multiply the negative `faction` amounts of their `failureEffects` by `command_failure_mult` **0.5 / 1 / 1.5** (rounded away from zero).
- **Gender norms.** `corporate_machismo` sets `expression_norm { norm: 5 }` and `inverted` sets `{ norm: 1 }`. The distance is `|commander expression − norm|` (0–4). Its only direct effect is the own corporation's starting standing, `standingPerStep: −2` per step, applied with `faction_start` after the world seed. Everything else reaches the squad only through stances (overview P11 lists world options as a legitimate reader of expression).
- **Confidence (user ruling: the setting shifts the table).** The sanitizer in `intent_extract` drops only events below `confidenceFloor(reg, setting)` = lowest level floor + (setting − 0.5), clamped 0–1. The engine then judges each axis delta in `computeDeltas`. A gain needs `confidence ≥ minGain + shift` and a loss needs `≥ minLoss + shift`, where `shift = settings.intentMinConfidence − 0.5`. The setting is mirrored into the campaign by `campaign/set_min_confidence`, like τ. Below **both** floors the event is dropped for that unit entirely (no stress, no history, no state entry). This keeps `guarded` identical to today's behaviour. Engine-made events have confidence 1.
- **Multipliers** apply in `computeDeltas` after the P7 trait multipliers and before receptivity: per axis, `gainMult` on positive and `lossMult` on negative. **Big gesture:** a commander event whose type is in `TUNING.disposition.bigGesture.events` (v1 `['protected']`) at severity ≥ `major` multiplies the positive axes by `bigGestureMult`. "Granted costly demand" and "shielded from oversight" do not exist yet; P9 adds them to that list.
- **Loyalty bands.** `nextLoyaltyBand(current, trust, shift?)` and `initialLoyaltyBand(trust, shift?)` take `{ enter, exit }`. Enter thresholds (`waveringEnter`, `breakingEnter`) move by `bandShift`. Exit thresholds (`steady`, `breakingExit`) move by `bandShift + bandExitExtra`. Hazardous gives wavering < 35, breaking < 20, back to steady ≥ 53, out of breaking ≥ 38.
- **Stage timing.** `meets()` uses `round(minDaysInState × stageDaysMult)` for the unit. Mutiny's own `minDaysInState` is the level's `mutiny` field, not this multiplier.
- **Mutiny.** `dispositionLevels[].mutiny = { enabled, states, minDaysInState, minSigns }`. kind: `enabled: false` (the `obsessed` path is off too). guarded/prickly: `['despises']`, 2 days, 2 signs. volatile: `['despises','resentful']`, 2, 2. hazardous: the same two states, `minDaysInState: 1`, `minSigns: 1` (the "shorter warning, min 1 day": one sign at least a day old). A unit in a listed state needs a trigger, like `despises` today.
- **Refusal / desertion:** `refusalChance × refusalMult` is capped at 0.95; `desertionChance` becomes `clamp(p × desertionMult, min, max)`.
- **Breakdown targeting (user ruling: override the attack target).** The effective level's `breakdownTarget` only replaces the target of breakdowns that attack (`attack`, `twice_then_shutdown`, and the `repeat_last` fallback). `default` keeps the defect's own target. `allies` = `nearest_ally`. `self`: she hurts herself for `TUNING.disposition.selfHarmPct` = 10% of her max HP (min 1, never below 1 HP), a new planned action `{ kind: 'self_harm' }` with log kind `self_harm`. `allies_commander`: `rng.pick` between the nearest ally and `'commander'` while the commander is exposed and not downed (otherwise the nearest ally). `everyone`: `rng.pick` over every standing combatant except herself, plus `'commander'` when exposed. The override is written into `Combatant.breakdown.target` when the breakdown starts (`enterBreakdown` and `makeBreakdown` via `buildCombatant`).
- **Join sites** call `applyDispositionStart(state, reg, unit, rel)` right **before** `applyFirstImpression`. It adds the level's start offsets plus the stance start offsets, clamped. `applyFirstImpression` then re-bases the band with the unit's band shift. Sites: `buildCampaign`, `squad/add_named`, `gruntRelation`. `gruntRelation(state, reg, grunt)` now takes the grunt, which also gets its rolled stances first.
- **Stance effects** (`stanceEffects`: `{ id, option, stance, strength, effects[] }`, closed vocabulary `StanceEffectSchema`):
  - `start_offset { trust?, affinity?, perNormStep? }`: with `perNormStep`, multiplied by the norm distance.
  - `gain_damp { pctPerStep }`: Trust and Affinity gains of commander events × `1 − min(0.8, pct/100 · distance) · w(d)`, where `w(d)` is P7's `firstImpressionWeight`, so it fades with days known.
  - `distance_bonus { minSteps, affinity }`: a start offset for a norm-breaking commander.
  - `value_shift { axis, amount }`: her effective value on `valueAligned` events, clamped −3…3.
  - `event_stress { events, amount }`: contempt events, applied in `computeDeltas` stress.
  - `news_stress_mult { mult }`
  - `directive { text, whileEarly? }`: `{name}` placeholder; `whileEarly` means only while `w(d) > 0.5`.
  - `friction_directive { text }`: shown when a `shares` and an `opposes` unit are both present. v1 has no unit↔unit axes (overview §2), so friction is narration only.

  Stance effects apply only while the world choice of their option is non-neutral (`squadStance` options whose current choice has no `expression_norm` / `enable_family` / `mission_reward_pct` effect count as neutral: `indifferent`, `tolerated`).
- **Grunts** roll a stance per `squadStance` option from the choice's `grunt_stances` weights, at strength 1 with no reason, once, in `generateGrunt`. A neutral choice makes no draw.
- **Event families (user ruling: the full family).** `clocks`, `missionTemplates` and `dilemmaTemplates` entries may carry `family`. Such an entry exists only while some current choice has `enable_family` for it (`familyEnabled(state, reg, entry)`). Filters: `seedWorld` (clocks), `buildDigest` templates and the fallback planner (`director.ts`), `eligibleTemplates` (`dilemma/flow.ts`), `eventPool` (`expedition.ts`). A new world effect `stigma_news { amount }` gives every living, in-service unit `amount` stress × her `news_stress_mult`. The core family `purge_sweep` contains the clock `purge_sweep`, the dilemma templates `dil_purge_census` and `dil_purge_shelter`, the expedition event `evt_purge_checkpoint`, and the mission template `tpl_purge_extraction`. All its text is placeholder for the author. Rumors stay the director's: the digest gains `world: { hints: string[]; families: string[] }` and the director prompt one line about it.
- **Live options and the context.** The WORLD SETTINGS block is a context provider `world_settings` (priority 85). It renders whenever a campaign exists, scene or not: `World settings: ` + the current choices' `lore`, in option order, cut at 120 tokens. `scene_directive` effects become scene directives `world:<optionId>`, refreshed when a live option changes.
- **Presets** are a registry (`worldPresets`), not code. A loader check makes every preset name every option with a known choice.
- **Re-sync and intake.** `squad/resync` gains sections `disposition` (`dispositionOffset`, `dispositionReason`) and `stances` (`worldStances`). Axes are never re-based (the P7 tastes rule). The P5 intake (`app.intakeUnit`) and the wizard pass the world choices to `profile_import`.

## File Structure

```
content/core/{worldOptions,dispositionLevels,stanceEffects,worldPresets}.json   new registries (+ manifest)
content/core/{clocks,missionTemplates,dilemmaTemplates,glossary}.json            purge family, glossary
src/content/types.ts, schemas.ts, refs.ts         registries, effect vocabularies, `family`, loader checks
src/engine/tuning.ts                               TUNING.disposition
src/engine/state/types.ts                          World.options, Unit disposition/stance fields
src/engine/worldOptions/{options,disposition,stances,index}.ts   readers and rules
src/engine/actions/world.ts                        world/set_option, campaign/set_min_confidence
src/engine/{setup,grunts}.ts, actions/{squad,base}.ts            join sites, grunt stances, resync sections
src/engine/relations/{bands,deltas,graph}.ts, commander/presence.ts             bands, deltas, stage timing
src/engine/loyalty/{refusal,desertion,mutiny}.ts                                P6 parameters
src/engine/combat/{stress,turn,types,build}.ts                                  breakdown target, self_harm
src/engine/leash/{weekly,use}.ts, world/{missions,state,director,effects,expedition}.ts, dilemma/flow.ts
src/llm/calls/{intentExtract,profileImport,directorTick}.ts                      floor, import sections, hint line
src/setup/{profile,wizard}.ts                      import sanitizer, `world` step model
src/world/optionsContext.ts                        WORLD SETTINGS block, option and stance directives
src/scene/{sceneController,comms}.ts, app.ts       floor, mirror, intake, live option refresh
src/analysis/{effects,describe}.ts, providers/world.ts                          readings and effect lines
src/ui/setup/{worldParams,setupScreen,calibration}.ts, shell/sysTab.ts, squad/squadTab.ts, css/65-world.css
docs/** (Task 16), tests/** mirror src
```

## Review Focus

1. **An old save or a pack missing an option** (no `world.options`, a stored choice the pack no longer has, a unit without `dispositionOffset` / `worldStances`). Every reader should use the defaults and the game should play as before. Tests in Task 2 (`an unknown stored choice reads the default`) and Task 4 (`a P7 save reads guarded with offset 0`).
2. **Offsets at the edges** (world `kind` + offset −2, `hazardous` + offset +2, a grunt with an offset in its data). The rank should clamp to 1…5 and grunts should ignore the offset. Test in Task 4 (`offset clamps at both ends and grunts ignore it`).
3. **A live switch mid-scene** (`bloom_horror` changed while a scene is open). The directive and the lore line should change on the next generation, and non-live options should stay locked. Tests in Task 2 (`set_option refuses a locked option and changes nothing`) and Task 10 (`switching bloom_horror replaces its directive`).
4. **The confidence setting at its extremes** (0 and 1) combined with kind/hazardous. The sanitizer floor should never drop an event the engine would accept, and at 1 nothing below 1 moves an axis. Test in Task 5 (`floor never exceeds any per-axis floor`).
5. **A disabled family left in a save** (a `purge_sweep` clock, open dilemma or offered mission from content whose family is now off, e.g. after a pack override). Nothing should crash: an existing clock or mission keeps running, and no new family entry is drawn. Test in Task 9 (`a family clock in a save survives with the family off`).

---

## Chunk (a) — registries, state, plumbing, lore block

### Task 1: World option registries and core content

**Files:**
- Create: `content/core/worldOptions.json`, `dispositionLevels.json`, `stanceEffects.json`, `worldPresets.json`
- Modify: `content/core/manifest.json`, `src/content/types.ts`, `src/content/schemas.ts`, `src/content/refs.ts`, `src/analysis/describe.ts` (via `DESCRIBED_REGISTRIES`)
- Test: `tests/content/worldOptionSchemas.test.ts`, `tests/content/core.test.ts` (extend), `tests/content/pronouns.test.ts` (extend)

**Interfaces:**
- Produces:
  - `REGISTRY_NAMES` + `'worldOptions', 'dispositionLevels', 'stanceEffects', 'worldPresets'`.
  - `WorldOptionEffectSchema` (the vocabulary in the rulings), `WorldOptionSchema = { id, label, group, live: boolean, squadStance?: boolean, default, description, choices: [{ id, label, description, lore (≤ TUNING.disposition.loreMaxChars = 100), effects }] }`.
  - `DispositionLevelSchema = { id, name, description, rank 1..5, start: { trust, affinity }, gainMult, lossMult, minConfidence: { gain, loss }, bandShift, bandExitExtra, stageDaysMult, refusalMult, desertionMult, mutiny: { enabled, states: string[], minDaysInState, minSigns }, breakdownTarget: 'self'|'default'|'allies'|'allies_commander'|'everyone', bigGestureMult, impunityBase?: number }`.
  - `StanceEffectSchema` (vocabulary in the rulings), `StanceEntrySchema = { id, option, stance, strength: 1|2, effects }`. `WorldPresetSchema = { id, name, description, choices: Record<optionId, choiceId> }`.
  - `DESCRIBED_REGISTRIES` + `'worldOptions', 'dispositionLevels', 'worldPresets'`.
- Content: the six options with the choices in the spec table, `default` as in Global Constraints; `squadStance: true` on `gender_norms`, `offspec_stigma`; `live: true` only on `bloom_horror`. Five levels with the table numbers verbatim. Stance drafts (author tunes):
  - `gender_norms`: `shares` s1/s2 have `start_offset { trust: −2·s, affinity: −1·s, perNormStep }`, `gain_damp { pctPerStep: 8·s }` and `directive { whileEarly }`. `opposes` s1/s2 have `distance_bonus { minSteps: 2, affinity: 2·s }` and `friction_directive`.
  - `offspec_stigma`: `shares` has `event_stress { events: ['mocked_defect','insulted'], amount: 3·s }`, `news_stress_mult { 1 + 0.5·s }` and a self-deprecating `directive`. `opposes` has `value_shift { axis: 'corporate', amount: −s }` and a defiance `directive`.
  - `grunt_stances`: machismo/inverted 4/4/2; scorned 3/4/3; hunted 2/3/5.
  - The three presets as in Global Constraints.
- Loader checks (`refs.ts`): `default` and every preset choice exist; `disposition` effects name existing levels and appear on exactly one option; level ranks are 1…5 and unique; `stanceEffects.option` is a `squadStance` option; every `family` used by clocks/templates is enabled by some `enable_family`; the sum of the longest lore line per option ≤ 120 estimated tokens (chars / 4).

- [x] **Step 1: Write the failing tests:**
  - `core loads the four registries without errors`
  - `levels carry the spec table` (table-driven over the 5 rows above)
  - `a preset missing an option is a content error`
  - `a lore line over 100 characters is rejected`
  - `two options with disposition effects are a content error`
  - `an unknown family on a clock is a content error`
  - pronouns: the new registries' text has no he/him/his for the commander
- [x] **Step 2: Run** `npx vitest run tests/content` and expect FAIL.
- [x] **Step 3: Implement** the schemas, checks, JSON and manifest entries. Lore lines are short, plausible placeholder sentences (see lore §1); list them in Task 16 as author-to-rewrite.
- [x] **Step 4: Run** `npx vitest run` and expect the whole suite green (the coverage test may need the two registries in `PLAYER_VISIBLE`, which `DESCRIBED_REGISTRIES` gives).
- [x] **Step 5: Commit** `feat(content): world options, disposition levels, stance effects and presets`.

### Task 2: World options in state, setup and the live switch

**Files:**
- Create: `src/engine/worldOptions/options.ts`, `src/engine/worldOptions/index.ts`
- Modify: `src/engine/state/types.ts`, `src/engine/tuning.ts`, `src/engine/setup.ts`, `src/engine/actions/world.ts`
- Test: `tests/engine/worldOptions/options.test.ts`, `tests/engine/setup.test.ts` (extend)

**Interfaces:**
- Produces:
  - `World.options?: Record<string, string>`.
  - `TUNING.disposition = { loreMaxChars: 100, worldBlockTokens: 120, confidenceRef: 0.5, bigGesture: { events: ['protected'], minSeverity: 'major' }, selfHarmPct: 10, gainDampMax: 0.8 }`.
  - `worldChoice(state, reg, optionId): { option: Entry; choice: ChoiceEntry } | null`
  - `worldChoices(state, reg): Array<{ option; choice }>` (option order)
  - `worldEffects<T extends WorldOptionEffect['type']>(state, reg, type): Extract<WorldOptionEffect, { type: T }>[]`
  - `isNeutralChoice(choice): boolean`
  - `validateWorldOptions(options, reg): string[]`
  - `defaultWorldOptions(reg): Record<string, string>`
  - `SetupResult.world?: { options: Record<string, string> }`: `validateSetup` adds its errors, and `buildCampaign` writes `world.options` (defaults filled in) **before** `seedWorld`.
  - Action `world/set_option { optionId, choiceId }` (live only; event `world_option_changed { optionId, from, to }`). Errors: `World option "<id>" is locked after the campaign start.` / unknown ids.

- [x] **Step 1: Write the failing tests:**
  - `an old save without options reads every default`
  - `an unknown stored choice reads the default`
  - `buildCampaign stores every option, missing keys as defaults`
  - `an unknown choice in setup is a validation error`
  - `set_option switches bloom_horror and emits world_option_changed`
  - `set_option refuses a locked option and changes nothing`
  - `worldEffects sums by type across options`
- [x] **Step 2: Run** `npx vitest run tests/engine/worldOptions tests/engine/setup.test.ts` and expect FAIL.
- [x] **Step 3: Implement** the types, readers, setup changes and action.
- [x] **Step 4: Run** `npx vitest run` and expect green.
- [x] **Step 5: Commit** `feat(engine): world options state, setup and live switch`.

### Task 3: Oversight, stigma and norm hooks

**Files:**
- Modify: `src/engine/leash/weekly.ts`, `src/engine/leash/use.ts`, `src/engine/world/missions.ts`, `src/engine/commander/traits.ts` (or `setup.ts` next to `applyFactionTraitEffects`)
- Test: `tests/engine/worldOptions/hooks.test.ts`

**Interfaces:**
- Consumes: `worldEffects` (Task 2).
- Produces:
  - `leashWeekly` adds `leash_weekly` effects (before the 0…5 clamp).
  - `terminateChance` adds `terminate_approval`.
  - `rollRewards` multiplies credits and plyx by `1 + Σpct/100` (`Math.round`, ≥ 0) after the rolls, so the rng is unchanged.
  - Failing a mission with `source === 'command'` scales the negative `faction` amounts of its `failureEffects` by the product of `command_failure_mult` (`roundAway`).
  - `normDistance(state, reg): number | null` (null without an `expression_norm`) and `applyWorldStartEffects(state, reg)`: own corporation standing += `standingPerStep × distance`, called after `seedWorld`.

- [x] **Step 1: Write the failing tests:**
  - `oversight gives 3/2/1 authorizations with a base-2 corporation`
  - `brutal lowers the Terminate approval`
  - `scorned pays 10% less on the same seed`
  - `brutal deepens a failed command mission's faction loss, a side mission is unchanged`
  - `machismo with a very feminine commander starts own standing 8 lower; indifferent changes nothing`
  - `defaults change none of these numbers`
- [x] **Step 2: Run** `npx vitest run tests/engine/worldOptions` and expect FAIL.
- [x] **Step 3: Implement** the hook points.
- [x] **Step 4: Run** `npx vitest run` and expect green.
- [x] **Step 5: Commit** `feat(engine): oversight, stigma and norm effects of world options`.

### Task 4: Disposition model, join offsets and loyalty bands

**Files:**
- Create: `src/engine/worldOptions/disposition.ts`
- Modify: `src/engine/state/types.ts`, `src/engine/relations/bands.ts`, `src/engine/relations/graph.ts`, `src/engine/commander/presence.ts`, `src/engine/setup.ts`, `src/engine/actions/squad.ts`, `src/engine/grunts.ts`, `src/engine/actions/base.ts`
- Test: `tests/engine/worldOptions/disposition.test.ts`, `tests/engine/relations/bands.test.ts` (extend)

**Interfaces:**
- Produces:
  - `Unit.dispositionOffset?`, `Unit.dispositionReason?`, `Unit.worldStances?: Record<string, WorldStance>`, `type WorldStance = { stance: 'shares'|'indifferent'|'opposes'; strength: 1|2; reason: string }`. `UnitSetup` gains the same three optional fields (validated: offset an integer −2…2, stance keys are `squadStance` options, reason ≤ 160 chars). `makeNamedUnit` copies them.
  - `worldDispositionLevel(state, reg): Entry`
  - `dispositionFor(state, reg, unit: Pick<Unit, 'kind' | 'dispositionOffset'>): Entry` (rank clamp; grunts use the world level)
  - `dispositionById(state, reg, unitId): Entry`
  - `bandShift(level): { enter: number; exit: number }`
  - `nextLoyaltyBand(current, trust, shift = { enter: 0, exit: 0 })`, `initialLoyaltyBand(trust, shift = { enter: 0, exit: 0 })`
  - `applyDispositionStart(state, reg, unit, rel): void` (level `start`; stance offsets come in Task 8)
  - `gruntRelation(state, reg, grunt: Unit)`
  - `applyFirstImpression` re-bases with the unit's shift. `evaluateAutomatic` passes the shift.

- [x] **Step 1: Write the failing tests:**
  - `kind starts +10/+10 and hazardous −30/−20 on the same baseline`, at all three join sites
  - `offset clamps at both ends and grunts ignore it`
  - `per-unit offset changes only that unit's effective level`
  - `a P7 save reads guarded with offset 0`
  - bands, table-driven, kind vs guarded vs hazardous at Trust 19/21/34/36/52/54: enter/exit thresholds as in the rulings
- [x] **Step 2: Run** `npx vitest run tests/engine/worldOptions tests/engine/relations` and expect FAIL.
- [x] **Step 3: Implement.** Order at a join site: initial relation → `applyDispositionStart` → `applyFirstImpression`.
- [x] **Step 4: Run** `npx vitest run` and expect green.
- [x] **Step 5: Commit** `feat(engine): unit disposition, join offsets and shifted loyalty bands`.

### Task 5: Disposition in the delta pipeline and confidence

**Files:**
- Modify: `src/engine/relations/deltas.ts`, `src/engine/relations/effects.ts`, `src/engine/relations/graph.ts` (`meets`), `src/engine/actions/world.ts`, `src/llm/calls/intentExtract.ts`, `src/scene/sceneController.ts`, `src/scene/comms.ts`, `src/app.ts`
- Test: `tests/engine/relations/disposition.test.ts`, `tests/llm/intentExtract.test.ts` (extend), `tests/scene/sceneController.test.ts` (extend)

**Interfaces:**
- Consumes: `dispositionById` (Task 4).
- Produces:
  - `Deltas.dropped?: true`. When the event's confidence is below both floors, `computeDeltas` returns all zeros with `dropped`, and `applyEventToUnit` returns `[]` without history or state entry.
  - `confidenceShift(state): number`, from `state.settings.intentMinConfidence`, default 0.5.
  - `confidenceFloor(reg, setting): number`
  - Action `campaign/set_min_confidence { value }` (0–1), mirrored by the app on load and on change (like `firstImpressionTau`).
  - `meets()` scales `minDaysInState` by the unit's `stageDaysMult`.

- [x] **Step 1: Write the failing tests** (table-driven, same intent sequence on a kind and a hazardous unit):
  - `losses ×0.7 vs ×2.0, gains ×1.2 vs ×0.7`
  - `a 0.55 gain lands at kind and is cut at hazardous; a 0.45 loss is dropped at kind and lands at hazardous`
  - `an event below both floors leaves no history`
  - `a major protected is ×2 for gains at hazardous, ×1 at guarded; a minor one is not a big gesture`
  - `minDaysInState 10 needs 8 days at kind and 20 at hazardous`
  - `setting 0.6 raises every floor by 0.1`
  - `floor never exceeds any per-axis floor` (settings 0, 0.5, 1)
  - `engine-made events (confidence 1) always pass`
  - scene: `intent_extract prompts are byte-identical across disposition levels`. Use the scene harness: two campaigns differing only in `world.options.disposition` and one unit's offset/stances; one exchange each; compare the recorded system and prompt strings.
- [x] **Step 2: Run** `npx vitest run tests/engine/relations tests/llm/intentExtract.test.ts tests/scene` and expect FAIL.
- [x] **Step 3: Implement.** `sceneController` and `comms` pass `opts.minConfidence = confidenceFloor(reg, settings.intentMinConfidence)`. Nothing else about the input changes.
- [x] **Step 4: Run** `npx vitest run` and expect green.
- [x] **Step 5: Commit** `feat(engine): disposition multipliers, confidence floors and stage timing`.

### Task 6: Disposition in refusal, desertion and mutiny

**Files:**
- Modify: `src/engine/loyalty/refusal.ts`, `src/engine/loyalty/desertion.ts`, `src/engine/loyalty/mutiny.ts`
- Test: `tests/engine/loyalty/disposition.test.ts`, `tests/engine/loyalty/mutiny.test.ts` (extend)

**Interfaces:**
- Consumes: `dispositionById`.
- Produces: `refusalChance` × `refusalMult` (≤ 0.95); `desertionChance` = `clamp(p × desertionMult, min, max)`; `mutinyRules(state, reg, unitId): { enabled; states; minDaysInState; minSigns }`, read by `mayMutiny`, `mutinyReady` and `mutinyDayStep` (candidate test, sign clearing). The `obsessed` path stays only where `enabled`.

- [x] **Step 1: Write the failing tests:**
  - `refusal and desertion scale ×0.5 at kind and ×2 at hazardous, within their clamps`
  - `mutiny is impossible at kind even when despises with a trigger and signs`
  - `resentful cannot mutiny at prickly and can at volatile`
  - `hazardous mutinies after one sign a day old and one day in state`
  - `guarded keeps the P6 numbers` (existing mutiny tests unchanged)
- [x] **Step 2: Run** `npx vitest run tests/engine/loyalty` and expect FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** `npx vitest run` and expect green.
- [x] **Step 5: Commit** `feat(engine): disposition in refusals, desertion and mutiny`.

### Task 7: Breakdown targeting by disposition

**Files:**
- Modify: `src/engine/combat/stress.ts`, `src/engine/combat/turn.ts`, `src/engine/combat/types.ts`
- Test: `tests/engine/combat/breakdownDisposition.test.ts`

**Interfaces:**
- Consumes: `dispositionFor`.
- Produces: the `Combatant.breakdown.target` union + `'self' | 'allies_commander' | 'everyone'` (schema of defects unchanged: these are never authored); `PlannedAction` + `{ kind: 'self_harm' }`; log kind `self_harm`; `breakdownTargetFor(ctx, c): target` applied in `enterBreakdown` / `makeBreakdown` for attack-type policies.

- [x] **Step 1: Write the failing tests:**
  - `kind: an attacking breakdown hurts herself for 10% and never below 1 HP`
  - `guarded keeps the defect's own target`
  - `prickly hits the nearest ally`
  - `volatile may pick the exposed commander and never a downed one` (pin seeds by searching, P7 rule)
  - `hazardous picks among everyone standing`
  - `a skip-policy breakdown is unchanged at every level`
- [x] **Step 2: Run** `npx vitest run tests/engine/combat` and expect FAIL.
- [x] **Step 3: Implement.** `self_harm` resolves in `turn.ts` like a pass plus the HP change and log.
- [x] **Step 4: Run** `npx vitest run` and expect green.
- [x] **Step 5: Commit** `feat(combat): breakdown targets follow disposition`.

### Task 8: Per-unit world stances

**Files:**
- Create: `src/engine/worldOptions/stances.ts`
- Modify: `src/engine/worldOptions/disposition.ts` (`applyDispositionStart`), `src/engine/relations/deltas.ts`, `src/engine/grunts.ts`
- Test: `tests/engine/worldOptions/stances.test.ts`

**Interfaces:**
- Consumes: `normDistance` (Task 3), `firstImpressionWeight` (P7).
- Produces:
  - `stanceOf(state, reg, unit, optionId): WorldStance | null` (null under a neutral choice)
  - `stanceEffects<T>(state, reg, unit, type)`
  - `effectiveValues(state, reg, unit): Unit['values']` (with `value_shift`)
  - `rollGruntStances(state, reg, rng): Unit['worldStances'] | undefined`
  - In `computeDeltas`: `gain_damp` on commander-event Trust and Affinity gains, `event_stress` on stress, `effectiveValues` for value alignment.
  - Start offsets (`start_offset`, `distance_bonus`) inside `applyDispositionStart`.

- [x] **Step 1: Write the failing tests:**
  - `an indifferent unit's deltas are unchanged under machismo`
  - `a shares unit's Trust gain is damped by 1 − 0.08·d_norm·w(d) at d = 0, 7, 21` (three exact values)
  - `shares starts lower by distance; opposes gets the affinity bonus only at ≥ 2 steps`
  - `stances do nothing under indifferent / tolerated`
  - `offspec shares: mocked_defect adds 3 stress per strength`
  - `offspec opposes: a decision against corporate lands as if corporate were one lower`
  - `grunts roll a stance under hunted and make no draw under tolerated`
- [x] **Step 2: Run** `npx vitest run tests/engine/worldOptions` and expect FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** `npx vitest run` and expect green.
- [x] **Step 5: Commit** `feat(engine): per-unit world stances`.

### Task 9: Event families and the purge sweep

**Files:**
- Modify: `src/content/schemas.ts` (`family` on clocks / missionTemplates / dilemmaTemplates, world effect `stigma_news`), `src/engine/worldOptions/options.ts`, `src/engine/world/{state,director,effects,expedition}.ts`, `src/engine/dilemma/flow.ts`, `src/llm/calls/directorTick.ts`, `content/core/{clocks,missionTemplates,dilemmaTemplates}.json`
- Test: `tests/engine/worldOptions/families.test.ts`, `tests/engine/world/digest.test.ts` (extend), `tests/llm/directorTick.test.ts` (extend)

**Interfaces:**
- Produces:
  - `familyEnabled(state, reg, entry): boolean` (no `family` → true)
  - `activeFamilies(state, reg): string[]`
  - `Digest.world: { hints: string[]; families: string[] }`
  - world effect `stigma_news { amount: 1..30 }`
  - the core family content (ids in the rulings), copying the shapes of `dil_informant` (generated base dilemma), `evt_checkpoint` (expedition event) and `tpl_recover` (mission). `purge_sweep` clock: visible, 6 segments, `onFill` = `stigma_news 10` + own-faction −5.
  - Director system prompt line: `Follow the world hints in the digest; entries of families listed there are part of this world.`

- [x] **Step 1: Write the failing tests:**
  - `the purge clock is seeded only under hunted`
  - `family templates are not drawn by the director, pacing or the event pool under tolerated`
  - `stigma_news stresses a shares unit more than an indifferent one`
  - `a family clock in a save survives with the family off`
  - digest: `world hints carry the tone choice's director_hint`
  - director: `the system prompt mentions world hints`
- [x] **Step 2: Run** `npx vitest run tests/engine tests/llm/directorTick.test.ts` and expect FAIL.
- [x] **Step 3: Implement** the filters at the five sites and the content (placeholder text, pronoun rule).
- [x] **Step 4: Run** `npx vitest run` and expect green.
- [x] **Step 5: Commit** `feat(world): event families and the purge sweep`.

### Task 10: WORLD SETTINGS block and world directives

**Files:**
- Create: `src/world/optionsContext.ts`
- Modify: `src/app.ts` (register; refresh directives on `world_option_changed` and scene open/close)
- Test: `tests/world/optionsContext.test.ts`

**Interfaces:**
- Consumes: `worldChoices`, `stanceOf`, `firstImpressionWeight`.
- Produces:
  - `registerWorldOptionsContext(builder, { registries })`: provider `world_settings`, priority 85, renders without a scene, ≤ `TUNING.disposition.worldBlockTokens`.
  - `worldDirectives(builder, state, reg)`: sets `world:<optionId>` (`scene_directive`), `stance:<unitId>:<optionId>` (present units, `whileEarly` honoured) and `friction:<optionId>`; clears its own ids first.
  - `clearWorldDirectives(builder)`.

- [x] **Step 1: Write the failing tests:**
  - `the block lists the current lore lines in option order and fits 120 tokens`
  - `it renders outside a scene`
  - `switching bloom_horror replaces its directive`
  - `a shares unit's early directive disappears after w(d) ≤ 0.5`
  - `friction appears only with a shares and an opposes unit present`
  - `no directive text contains he/him/his`
- [x] **Step 2: Run** `npx vitest run tests/world` and expect FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** `npx vitest run` and expect green.
- [x] **Step 5: Commit** `feat(context): world settings block and world directives`. **End of chunk (a).**

---

## Chunk (b) — import, setup screen, SYS, analysis, docs

### Task 11: Import: disposition offset and stances

**Files:**
- Modify: `src/llm/calls/profileImport.ts`, `src/setup/profile.ts`, `src/engine/actions/squad.ts` (`RESYNC_SECTIONS`), `src/app.ts` (intake and re-sync patch)
- Test: `tests/setup/profile.test.ts` (extend), `tests/fixtures/profile_import/world.txt`, `tests/engine/squad.test.ts` (extend)

**Interfaces:**
- Produces:
  - `ImportSection` + `'disposition' | 'stances'`.
  - `ProfileImportInput.world?: { disposition: { name; description }; options: Array<{ id; label; choice; description }> }`. Only `squadStance` options with a non-neutral choice are included; `stances` is requested only when there is one.
  - Output `dispositionOffset: { offset, reason }` and `worldStances: { [optionId]: { stance, strength, reason } }`. The sanitizer clamps the offset to −2…2, drops unknown options/stances, caps reasons at 160 chars, and fills a missing stance as `indifferent` (strength 1, empty reason). The prompt says: *a card that says nothing means indifferent, not the world's norm*.
  - `ImportedProfile.dispositionOffset?`, `.worldStances?`
  - Re-sync patch fields `dispositionOffset`, `dispositionReason`, `worldStances`. Axes are never re-based.

- [x] **Step 1: Write the failing tests:**
  - `world fixture yields offset −1 and a shares stance with reasons`
  - `an offset of 5 clamps to 2; an unknown option is dropped`
  - `stances are not requested in a neutral world`
  - `re-sync writes offset and stances without moving axes`
- [x] **Step 2: Run** `npx vitest run tests/setup tests/engine/squad.test.ts` and expect FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** `npx vitest run` and expect green.
- [x] **Step 5: Commit** `feat(setup): disposition offset and world stances in profile import`.

### Task 12: Wizard `world` step model and presets

**Files:**
- Modify: `src/setup/wizard.ts`
- Test: `tests/setup/wizard.test.ts` (extend)

**Interfaces:**
- Produces:
  - `WizardStep` order `dossier → world → commander → units → calibration → review`
  - `WizardState.world: { options: Record<string, string>; preset: string | null }` (start: Standard)
  - `applyPreset(id)`, `setWorldOption(optionId, choiceId)` (sets `preset: null` unless it still equals a preset)
  - `worldSummary(): string[]` (the chosen choices' `description`, never numbers)
  - `UnitDraft.choice` + `dispositionOffset`, `dispositionReason`, `worldStances`
  - the importer gets the world (`WizardDeps.importer(avatar, sections, world)`)
  - `build()` sends `SetupResult.world` and the unit fields

- [x] **Step 1: Write the failing tests:**
  - `presets set every option`
  - `manual changes after a preset persist across back/next`
  - `the summary has one description per non-default choice and no digits`
  - `changing the world after calibration marks stances stale (re-import offered)`
  - `build carries offsets and stances`
- [x] **Step 2: Run** `npx vitest run tests/setup/wizard.test.ts` and expect FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** `npx vitest run` and expect green.
- [x] **Step 5: Commit** `feat(setup): world step and presets in the wizard`.

### Task 13: WORLD PARAMETERS screen and calibration controls

**Files:**
- Create: `src/ui/setup/worldParams.ts`, `css/65-world.css`
- Modify: `src/ui/setup/setupScreen.ts`, `src/ui/setup/calibration.ts`, `src/ui/squad/squadTab.ts`
- Test: `tests/ui/worldParams.test.ts`, `tests/ui/setup.test.ts` (extend), `tests/ui/squad.test.ts` (extend)

**Interfaces:**
- Produces:
  - `renderWorldParams(host, { wizard, registries })`: groups by `option.group`, choice cards (`aria-pressed`) with `data-analyze="worldOptions:<id>"` and `data-analyze-ctx={ choice }`, preset buttons (`worldPresets:<id>`), a lock icon on non-live options, and a "What this changes" list from `worldSummary()`. It is a meta screen: plain labels, no fiction voice.
  - Calibration: a disposition offset row (−2…+2 chips showing the effective level **name**, `dispositionLevels:<id>`, with the reason), and a stance row per non-neutral `squadStance` option (three chips × strength, reason text, `glossary:world_stance`).
  - SQUAD unit card: a disposition chip (`glossary:disposition` with `{ unitId }`).

- [ ] **Step 1: Write the failing tests:**
  - `world step renders every option and marks the chosen card`
  - `a preset click selects its choices`
  - `locked options show the lock`
  - `calibration edits offset and stances and they persist into build`
  - `the squad card shows the level name`
  - coverage: `tests/ui/analyzeCoverage.test.ts` passes with the new screens
- [ ] **Step 2: Run** `npx vitest run tests/ui` and expect FAIL.
- [ ] **Step 3: Implement.** Use `aria-disabled` for greyed chips (P7 rule).
- [ ] **Step 4: Run** `npx vitest run` and expect green.
- [ ] **Step 5: Commit** `feat(ui): WORLD PARAMETERS screen and disposition controls`.

### Task 14: SYS world options, analysis readings and glossary

**Files:**
- Create: `src/analysis/providers/world.ts`
- Modify: `src/ui/shell/sysTab.ts`, `src/analysis/effects.ts`, `src/analysis/providers/core.ts` (`registerCoreProviders`), `content/core/glossary.json`
- Test: `tests/analysis/worldReading.test.ts`, `tests/ui/shell.test.ts` (extend), `tests/analysis/hidden.test.ts` (runs over the new providers)

**Interfaces:**
- Produces:
  - SYS › World options: every option read-only (`worldOptions:<id>`) with its current choice label; a `select` for live options that dispatches `world/set_option`.
  - `summarizeWorldOptionEffect(fx, reg): string` and `summarizeDispositionLevel(entry): string[]` (words, no digits unless `knowledge.raw()`).
  - Providers: `worldOptions` (description, current choice, `Locked at campaign start.` / `Can change during the campaign.`, effect lines); `glossary:disposition` with `{ unitId }` (world level, offset reason, effective level name; numbers only through `knowledge.raw()`).
  - Glossary ids `disposition`, `disposition_offset`, `world_stance`, `world_settings`, `setting_intent_min_confidence` (if missing).

- [ ] **Step 1: Write the failing tests:**
  - `SYS lists options read-only and switches bloom_horror`
  - `locked option reading says locked`
  - `disposition reading shows names, not numbers, without raw values`
  - `hidden test passes for the new providers`
- [ ] **Step 2: Run** `npx vitest run tests/analysis tests/ui/shell.test.ts` and expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run` and expect green.
- [ ] **Step 5: Commit** `feat(analysis): world option and disposition readings, SYS world options`.

### Task 15: App wiring and manual checklist

**Files:**
- Modify: `src/app.ts`, `src/sim/harness.ts` (accept `world` in setup), `docs/MANUAL_TEST_P8.md` (create)
- Test: `tests/app-world.test.ts` (extend), `tests/sim/harness.test.ts` (extend)

**Interfaces:**
- Produces: on load and on setting change, the app dispatches `campaign/set_min_confidence`; the wizard's importer and `intakeUnit` pass the campaign's world to `profile_import`; `world_option_changed` refreshes directives and the context; the sim harness can run `--world brutal` (preset id).

- [ ] **Step 1: Write the failing tests:**
  - `a new campaign from the wizard stores the chosen world`
  - `intake asks for stances under hunted`
  - `changing the confidence setting mirrors into the campaign`
  - `harness runs with the brutal preset`
- [ ] **Step 2: Run** `npx vitest run tests/app-world.test.ts tests/sim` and expect FAIL.
- [ ] **Step 3: Implement**, and write `MANUAL_TEST_P8.md` (wizard world step, presets, calibration offset/stances, a scene showing the WORLD SETTINGS block, a live `bloom_horror` switch, SYS locks, a hazardous run).
- [ ] **Step 4: Run** `npm test` and expect green, with `dist/` and `style.css` rebuilt.
- [ ] **Step 5: Commit** `feat(app): wire world options, intake stances and confidence mirror`.

### Task 16: Docs

**Files:**
- Modify: `docs/packages/P8-world-options-disposition.md` (status, **Implemented as** with the rulings above, open items: lore lines, stance numbers, purge text, big-gesture events waiting for P9), `docs/00-overview.md` (§5.4 rows, §6 `world.options` and unit fields no longer "planned", §8 confidence semantics, §9 status), `docs/packages/P9-impunity-discipline.md`, `P9b-power-structure.md`, `P11-prologue-onboarding.md` (**Interfaces already provided by P8**: `dispositionFor`, `impunityBase`, `bigGesture.events`, `renderWorldParams`, `worldChoice`, `familyEnabled`), `docs/BALANCE_REPORT.md` (a short note on disposition at defaults = unchanged).

- [ ] **Step 1:** Write the docs.
- [ ] **Step 2: Run** `npm test` and expect green.
- [ ] **Step 3: Commit** `docs: P8 implemented-as, overview and dependent specs`.
