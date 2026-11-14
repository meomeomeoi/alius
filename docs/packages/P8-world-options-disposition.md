# P8 — World Options & Unit Disposition

**Status: implemented** (see **Implemented as** at the end; where it differs from the draft, the code wins). **Depends on:** P0–P7. **Read:** overview; this file; P3 (delta pipeline), P6 (disloyalty) as implemented.

## Goal

The player tunes the world before a campaign starts: prejudices, how society treats off-spec units, how harsh the corporate oversight is, tone, and — most importantly — the **disposition** of defective soldiers, from "kind girls with quirks" to "hazardous assets". Disposition is a set of **engine parameters**, not a lore line: this is the main structural weapon against the main model's positive bias.

## Principles

- **Options are declared by the author** in data; the model never invents world rules.
- **Most options lock at campaign start.** Changing them mid-campaign would contradict memory and facts. Only presentation-level options may change live (marked `live: true`).
- **The model describes, the engine judges.** Disposition never enters the `intent_extract` prompt. Extraction stays neutral; disposition is applied by the engine to already extracted intents.

## 1. Registry `worldOptions`

```
{ id, label, group, live: boolean, default: choiceId,
  choices: [{ id, label, description,
              lore: string,            // short text for the "World settings" lorebook/context block
              effects: Effect[] }] }   // engine parameter overrides, event-family toggles
```

Campaign state: `world.options: { [optionId]: choiceId }`. The chosen choices' `lore` lines form one constant context block "WORLD SETTINGS" (≤120 tokens total).

## 2. v1 options

| id | Choices | Effects |
|---|---|---|
| `gender_norms` | `indifferent` / `corporate_machismo` / `inverted` | NPC/oversight/enemy-soldier directives react to commander expression (P7) in machismo/inverted worlds; small starting oversight-standing modifier by distance from the norm. Squad members are affected **only through their own per-unit stance** (§3.1), never globally. |
| `offspec_stigma` | `tolerated` / `scorned` / `hunted` | NPC directives; mission rewards modifier (scorned −10%); `hunted` enables the "purge sweep" event family (director) and +stress when units hear about it. |
| `oversight` | `lenient` / `standard` / `brutal` | Leash authorizations base (3/2/1 per week), failed-command-mission penalties, approval roll for Terminate, tone of corporate messages. |
| `bloom_horror` (live) | `restrained` / `graphic` | Directive on how explicitly mutants and wounds are described. |
| `tone` | `grim_hope` / `grim` / `bleak` | Director prompt hint: frequency of small wins, rescues and good news vs losses. |
| `disposition` | 5 levels (§3) | Engine parameters (§3). |

Presets in the setup screen: **Gentle** (indifferent, tolerated, lenient, restrained, grim_hope, kind), **Standard** (defaults), **Brutal** (machismo, hunted, brutal, graphic, bleak, hazardous). The player can then adjust each option.

## 3. Disposition

Registry `dispositionLevels` (5 entries). Draft parameters — tune in tests:

| Param | kind | guarded | prickly | volatile | hazardous |
|---|---|---|---|---|---|
| Starting Trust / Affinity offset | +10/+10 | 0/0 | −10/−5 | −20/−10 | −30/−20 |
| Loss multiplier / gain multiplier | 0.7 / 1.2 | 1 / 1 | 1.3 / 0.9 | 1.6 / 0.8 | 2.0 / 0.7 |
| Min confidence for gains / losses | 0.5 / 0.6 | 0.5 / 0.5 | 0.6 / 0.5 | 0.7 / 0.45 | 0.75 / 0.4 |
| Loyalty band thresholds shift | −5 (wider) | 0 | +3 | +6 | +10 |
| Band exit (hysteresis) extra | 0 | 0 | +2 | +5 | +8 |
| Min days between relationship stages × | 0.8 | 1 | 1.2 | 1.5 | 2.0 |
| Refusal / desertion probability × | 0.5 | 1 | 1.3 | 1.7 | 2.0 |
| Mutiny eligibility | off | `despises` | `despises` | + `resentful` | + `resentful`, shorter warning (min 1 day) |
| Breakdown targeting | self | default | allies | allies + commander | everyone |
| Big-gesture bonus (protected, granted costly demand, shielded from oversight) | ×1 | ×1 | ×1.2 | ×1.5 | ×2 |

The last row keeps the hardest level winnable: where trust is rare, it is worth more.

**Per-unit offset.** Each named unit has `dispositionOffset ∈ [−2, +2]`; effective level = clamp(world + offset, 1, 5). `profile_import` proposes the offset with a one-line reason from the card; the player can change it in the wizard. Grunts use the world level.

### 3.1 Per-unit world stances

A world norm reaches the squad only through each unit's own stance toward it, set at import and editable by the player. This keeps the card authoritative: a unit shares the world's prejudice only if her profile says so.

```
Unit.worldStances: { [worldOptionId]: { stance: 'shares'|'indifferent'|'opposes', strength: 1|2, reason: string } }
```

- Applies to options marked `squadStance: true` in `worldOptions` (v1: `gender_norms`, `offspec_stigma`). Not shown when the world choice is neutral (`indifferent`, `tolerated`).
- `profile_import` proposes each stance from **both** the world choice and the card (a card that says nothing defaults toward `indifferent`, not toward the world norm) with a one-line reason. The wizard shows them next to disposition offset and tastes; the player can change any of them. "Re-sync from card" can fill them for already imported units.
- Effects (registry `stanceEffects`, per option × stance × strength):
  - `gender_norms` · `shares`: starting Trust/Affinity offset and an early-days directive when the commander's expression (P7) departs from the norm, scaled by distance and by the first-impression weight `w(d)` — the prejudice fades as she gets to know him; image-consistency (P7) can make norm-breaking acts land harder for her. `opposes`: small Affinity bonus for a norm-breaking commander and friction with units who `share`. `indifferent`: nothing.
  - `offspec_stigma` · `shares`: internalized stigma — extra stress from contempt events and the purge family, self-deprecating directive; `opposes`: defiance toward oversight, Trust bonus when the commander shields the squad from it.
- Grunts: stance rolled from the world choice (weighted), no reason text.

**Where parameters plug in** (implementation note): P3 delta pipeline (multipliers, confidence thresholds, stage timing), P3 loyalty bands, P6 refusal/desertion/mutiny, P4 breakdown target override (effect system), P9 Impunity base (P9 reads `dispositionLevels[].impunityBase`).

## 4. Setup UI

New screen **WORLD PARAMETERS** right after the start/corporation choice. It is a meta screen (outside the fiction even after P11): option groups with choice cards, preset buttons, lock icons on options that freeze at start. A summary "What this changes" is generated from the `description` fields, never from numbers. In-campaign: SYS tab shows the options read-only, except `live` ones.

## Acceptance criteria

1. Options are stored, locked after start (except `live`), and their lore lines appear in the context block within the token cap.
2. `intent_extract` prompts are byte-identical across disposition levels (test).
3. The same intent sequence produces the documented differences between `kind` and `hazardous`: multipliers, confidence filtering, band thresholds, stage timing (table-driven tests).
4. Per-unit offset changes only that unit's effective level.
5. Mutiny is impossible at `kind`, possible from `resentful` at `volatile`+ (P6 tests extended).
6. `gender_norms` changes a squad member's deltas only through her `worldStances` entry: an `indifferent` unit is unaffected (test), a `shares` unit's effect decays with days known (tests at d = 0, 7, 21); the player can edit stances in the wizard and they persist.
7. `oversight` changes Leash authorizations; `bloom_horror` can be switched mid-campaign.
8. Presets set every option; manual changes after a preset persist.

## Open decisions (author)

- Lore text of every choice (stubs ship with placeholders).
- Whether `gender_norms` should also have a mild effect on enemy targeting (default: no).
- Stance effect numbers (`stanceEffects`).

## Interfaces already provided by P7a (implemented — use, do not rebuild)

- **WORLD PARAMETERS screen:** give each option and choice card `data-analyze="worldOptions:<id>"` (add `worldOptions` to `DESCRIBED_REGISTRIES` / `PLAYER_VISIBLE` and a `description` per entry; the effects summary is generated). Disposition levels and offsets need glossary entries.
- **Settings and locks:** the bare-source provider `setting` (in `providers/core.ts`) shows the current value and a lock line from `SETTING_LOCKS`; add a lock there when a world option or setting freezes after campaign start. A new setting needs a SYS `field(label, control, key)` and a glossary entry `setting_<snake_case key>` (`settingGlossaryId`).

## Interfaces already provided by P7 (implemented — use, do not rebuild)

- **Where P7 stops:** the trait framework (`commanderTraits`, `traitEffects`), the commander file and `commander/seed`-style optional state (use the same pattern for `world.options`), `Relation.metDay` and `Unit.commanderTastes`, and `firstImpressionTau`. Disposition offsets belong to P8.
- **Join sites** that start a relation call `applyFirstImpression(state, reg, unit, relation)` (buildCampaign, `squad/add_named`, `gruntRelation`); a P8 disposition level should add to the baseline before it.
- **UI:** reuse `renderCommanderFile`-style forms (plain functions, text only) and the glossary/`DESCRIBED_REGISTRIES` rule; the SYS tab has a Relationships section for P7's τ.


## Implemented as

Engine: `src/engine/worldOptions/{options,disposition,stances,norm,index}.ts`, `src/engine/actions/world.ts` (`world/set_option`, `campaign/set_min_confidence`). Content: `worldOptions`, `dispositionLevels`, `stanceEffects`, `worldPresets` (new registries), `family` on `clocks` / `missionTemplates` / `dilemmaTemplates`, the `purge_sweep` family, four glossary entries. Context: `src/world/optionsContext.ts`. UI: `src/ui/setup/worldParams.ts`, the offset and stance controls in `ui/setup/calibration.ts`, SYS › World options, the SQUAD disposition chip, `css/65-world.css`. State stays `version: 1`; every new field is optional.

### State and locking
- `world.options?: { [optionId]: choiceId }`. Readers use `worldChoice(state, reg, optionId)` / `worldChoices` / `worldEffects(state, reg, type)` (all take anything with `{ world: { options? } }`, so the wizard can ask about choices before a campaign exists). A missing key, a missing map (old save) or a stored choice the pack no longer has reads the option's `default`; the defaults are neutral, so an old save plays exactly as before. `buildCampaign` writes every option (`SetupResult.world?.options`, missing keys → default) **before** `seedWorld`. `world/set_option` accepts only `live` options (v1: `bloom_horror`) and emits `world_option_changed { optionId, from, to }`; switching to the current choice emits nothing.
- `Unit.dispositionOffset?` (−2…2, absent = 0), `dispositionReason?`, `worldStances?: { [optionId]: { stance, strength: 1|2, reason } }` (absent = indifferent). `UnitSetup` carries the same three and `validateUnitProfile` checks them.

### Where the options act (code reads effects by type, never by option or choice id)
- **Choice effects** (`WorldOptionEffectSchema`): `disposition`, `leash_weekly`, `terminate_approval`, `command_failure_mult`, `mission_reward_pct`, `expression_norm`, `enable_family`, `director_hint`, `scene_directive`, `grunt_stances`. Oversight is `leash_weekly` +1 / 0 / −1 on top of the corporation's base (a base-2 corporation gives 3 / 2 / 1) and `terminate_approval` +0.1 / 0 / −0.15; failed **command** missions multiply the negative `faction` amounts of their `failureEffects` (applied when the mission fails, `failureEffectsOf`) by 0.5 / 1 / 1.5. `scorned` reduces credits and plyx by 10% after the rolls (the rng is untouched; `hunted` carries no reward change, see open items).
- **Gender norms.** `expression_norm { norm, standingPerStep }`: `corporate_machismo` is 5, `inverted` is 1; the distance is `|commander expression − norm|` (`normDistance`, 0–4); its only direct effect is the own corporation's starting standing (`standingPerStep −2` per step, `applyWorldStartEffects`, after the seed). Everything else reaches the squad through stances (overview P11 lists world options as a legitimate reader of expression).
- **Disposition** (`dispositionLevels`, ranks 1–5, the table of the draft verbatim): `dispositionFor(state, reg, unit)` = world rank + clamp(offset, ±2), clamped to 1…5; grunts and anything not named use the world level. Parameters are read at: the three join sites (`applyDispositionStart`, called **before** `applyFirstImpression`, which re-bases the loyalty band with the unit's own shift), `computeDeltas` (gain / loss multipliers per axis, after the P7 trait multipliers and before receptivity; the big-gesture multiplier on the positive axes of a commander `protected` at severity ≥ major, `TUNING.disposition.bigGesture`, P9 adds events to that list), `meets()` (`minDaysInState × stageDaysMult`, rounded), `nextLoyaltyBand` / `initialLoyaltyBand` (a `{ enter, exit }` shift: enter thresholds move by `bandShift`, exit thresholds by `bandShift + bandExitExtra`; hazardous gives wavering < 35, breaking < 20, back to steady ≥ 53, out of breaking ≥ 38), refusal and desertion, mutiny, breakdown targets.
- **Confidence (user ruling: the setting shifts the table).** The `intent_extract` sanitizer drops only events below `confidenceFloor(reg, setting)` = lowest level floor + (setting − 0.5), clamped 0…1. The engine then judges each event per unit in `computeDeltas`: a gain needs `confidence ≥ minGain + shift` and a loss `≥ minLoss + shift` (shift = setting − 0.5, **each threshold capped at 1** so an engine-made event with confidence 1 always passes). Below both floors the event is dropped for that unit (`Deltas.dropped`: no stress, no history, no state entry). Between the floors only the side that passes moves; an event dropped for every unit it targets also has none of its side effects (no crime reveal, no `shared_secret` flag, no cut-in; `intents_applied.landed` lists the types that landed). A dropped event still takes one of the six event slots of `validateIntents` and counts in `intents_applied.counts` (the sanitizer cannot know a unit's level); positive stress follows the loss floor, negative stress (calming) the gain floor. The setting is mirrored into the campaign by `campaign/set_min_confidence` (the app does it on load and on every settings change). At setting 1 nothing below 1 moves an axis for kind, guarded and prickly; a volatile loss from 0.95 and a hazardous loss from 0.9 still land.
- **Refusal / desertion.** `refusalChance` (scene orders) **and the combat order roll** (`combat/orders.ts`, the main P6 path) are scaled by `refusalMult` (`scaleRefusal`, cap 0.95 when the multiplier is not 1); `rawRefusalChance` is the unscaled source that `loyalty/directives.ts` uses to explain why. `desertionChance` = `clamp(p × desertionMult, min, max)`.
- **Mutiny.** `mutinyRules(state, reg, unitId)` returns the level's `mutiny` block (`enabled`, `states`, `minDaysInState`, `minSigns`); kind never mutinies (the `obsessed` path is off too), guarded and prickly keep the P6 rule (`despises`, 2 days, 2 signs), volatile adds `resentful`, hazardous needs one sign and one day (the day step then leaves one warning sign only). A unit in a listed state still needs a trigger.
- **Breakdown targets (user ruling: override the attack target).** `breakdownTargetFor` replaces the target of attacking policies (`attack`, `twice_then_shutdown`, and the `repeat_last` fallback; also a *breaking* turn at 80–99 stress): `allies` = nearest ally; `self` = a new planned action `self_harm` (10% of max HP, at least 1, never below 1 HP, log kind `self_harm`); `allies_commander` picks (`rng.pick`) between the nearest ally and `'commander'` while he is exposed and not downed; `everyone` picks among every standing combatant except herself, plus `'commander'` when exposed. The override is written into `Combatant.breakdown.target` when the breakdown starts (`enterBreakdown`, `makeBreakdown` via `buildCombatant`). A trusted action may now target `'commander'`; the cover unit takes the hit as in an enemy attack.
- **Stances** (`stanceEffects`: `{ id, option, stance, strength, effects[] }`, closed vocabulary `StanceEffectSchema`): `start_offset` (× the norm distance with `perNormStep`), `gain_damp` (commander gains of Trust and Affinity × `1 − min(0.8, pct/100 · distance) · w(d)`), `distance_bonus`, `value_shift` (`effectiveValues`), `event_stress`, `news_stress_mult`, `directive` (`{name}`, `whileEarly` only while `w(d) > 0.5`), `friction_directive` (narration only: v1 has no unit↔unit axes). Stances apply only while the world choice is non-neutral (`isNeutralChoice`: no `expression_norm`, `enable_family` or `mission_reward_pct` effect). Grunts roll one stance per non-neutral squad option from the choice's `grunt_stances` weights, once, last in `generateGrunt` (no draw under neutral choices).
- **Event families.** An entry with `family` exists only while some current choice has `enable_family` for it (`familyEnabled`, `activeFamilies`): filtered in `seedWorld`, `checkOffer` (director offers, the fallback planner, `offer_mission`, rumor leads), `buildDigest`, `eligibleTemplates` and `eventPool` (now `eventPool(state, reg, regionId)`). Entries already in a save keep running when the family goes off. World effect `stigma_news { amount }` stresses every living unit by `amount × her news_stress_mult`. A `faction` effect with the reserved id `own` moves the commander's own corporation (the purge clock is shared by every start). Core family `purge_sweep`: clock, `dil_purge_census`, `dil_purge_shelter`, `evt_purge_checkpoint`, `tpl_purge_extraction` (placeholder text).
- **Context.** Provider `world_settings` (priority 85, renders whenever a campaign exists): `World settings: ` + the lore line of each current choice, whole lines only, within `TUNING.disposition.worldBlockTokens` (120; `estTokens`). `scene_directive` effects become directives `world:<optionId>`, a unit's stance `directive` becomes `stance:<unitId>:<optionId>`, `friction:<optionId>` when a `shares` and an `opposes` unit are both present. `worldDirectives` is refreshed inside the app's `applyContext()` (every render), because the stance directives follow the open scene and the days known. A default world therefore always injects the `world:bloom_horror` directive.
- **Import and setup.** `profile_import` has two more sections, `disposition` (`dispositionOffset { offset, reason }`) and `stances` (`worldStances`), asked for only when the caller passes the world (`importProfile(…, { world })`) and, for stances, only while a squad-stance option is non-neutral. The sanitizer clamps the offset to ±2, drops unknown options, reads an unknown or missing stance as `indifferent` (strength 1, empty reason), caps reasons at 160. Both are optional by nature (never `missing`). The wizard order is `dossier → world → commander → units → calibration → review`; `WizardState.world { options, preset }` starts as Standard; `applyPreset`, `setWorldOption` (preset mark follows), `worldSummary()` (descriptions of the non-default choices, no numbers); a world change after calibration marks calibrated units `worldStale` and `refreshWorldSections(i)` re-imports only the two world sections. The importer receives the world (`importer(avatar, sections, world)`); the app passes the campaign's world to re-sync and intake. `squad/resync` gains the sections `disposition` and `stances` (axes are never re-based; `0` / `''` / `{}` clear the fields).
- **UI and analysis.** WORLD PARAMETERS (`renderWorldParams`), calibration offset chips (named after the level each makes her) and stance rows, the SQUAD `Disposition: <level>` chip, SYS › World options (read-only rows with `LOCKED AT START`; `bloom_horror` is a select that dispatches `world/set_option`). Every new card, chip and row carries `data-analyze`. Providers: `worldOptions` (current choice, lock line, the shown choice's effects) and `glossary:disposition` (world level, her level, offset reason); effect lines are words only (`summarizeWorldOptionEffect`, `summarizeDispositionLevel`), numbers only through `Knowledge`. `worldOptions`, `dispositionLevels`, `worldPresets` are described registries (26 player-visible registries now).
- **Balance harness.** `npm run sim -- --world brutal` (`fixtureSquad` / `runBatch` accept a preset id).

### Non-obvious things to know before touching P8 code
- **Read the world through `worldChoice` / `worldEffects`, never by option or choice id.** The two fixed slots are the option whose choices carry `disposition` effects and the options marked `squadStance: true`.
- **Defaults are the identity.** With every option at its default every hook returns what it returned before P8 and makes no new rng draw; the new draws (grunt stances, `allies_commander` / `everyone` breakdown picks) happen only under non-default choices. A seeded test that moves must be updated knowingly.
- **A new relation join site must call `applyDispositionStart` before `applyFirstImpression`.** `gruntRelation(state, reg, grunt)` takes the grunt (it carries its rolled stances).
- **`refusalChance` is the scaled value**; use `rawRefusalChance` when you need the source of a refusal.
- **The mutiny day step has its own state flow:** the relationship graph moves a unit (e.g. `resentful` → `despises`) during the same step, so tests of "cannot mutiny from X" must look at one step or at `mutinyReady`.
- **The disposition never reaches `intent_extract`.** `tests/scene/sceneController.test.ts` compares the prompts byte for byte; keep it that way (overview P2).
- **Stale choices.** `world.options` may hold a choice the pack no longer has; every reader falls back to the default. A family clock in a save outlives its family.
- **Option ids in tests:** `worldOptions` order is `gender_norms, offspec_stigma, oversight, bloom_horror, tone, disposition`; the UI and the lore block follow registry order.
- **Process:** `deployCampaign` seeds the campaign with `Math.random()`, so app tests must switch unit DMs off (`st.settings.unitDms = false`) when they count LLM calls.

### Open items
- **Review follow-ups not fixed (Minor):** the early gender-norm stance directive shows even when the commander's expression matches the norm (distance 0); `summarizeWorldOptionEffect` writes "their own corporation" for the commander and `loyalty/directives.ts` still says "him"; `refreshWorldSections` sets section tokens it never checks; the stale mark skips units whose import is still loading and fires on options that do not affect stances; offset chips at the ends of the scale show the same level name three times; a doc comment in `relations/graph.ts` sits above `stageDays`; `syncMinConfidence` is not re-run after a rollback snapshot is restored.
- **Re-sync can change a unit's offset on a running campaign.** This is the plan's decision (`disposition` is a re-sync section) and it is gated by the SYS mechanics edit lock, like every other re-sync; it is not a bypass of the world lock in normal play.
- Lore text of every choice, the stance numbers and the purge-family text are placeholders for the author (`AUTHOR TO WRITE`).
- `hunted` carries no `mission_reward_pct` (the draft lists only `scorned −10%`), so a hunted world pays more than a scorned one; the author may want it the other way round.
- "Granted costly demand" and "shielded from oversight" do not exist yet: P9 adds them to `TUNING.disposition.bigGesture.events`. `impunityBase` is in the schema but unread until P9.
- `TUNING.mutiny.minDaysInState` / `minSigns` are no longer read by the engine (the level's `mutiny` block, whose guarded row holds 2 / 2, is the source).
- `src/loyalty/directives.ts` (P6) still writes "him/his" for the commander in two refusal-reason texts; `tests/content/pronouns.test.ts` does not cover `src/loyalty`.
- The WORLD PARAMETERS layout and the calibration rows (`css/65-world.css`) are checked by jsdom tests only; they need a look in SillyTavern (`docs/MANUAL_TEST_P8.md`).
- Whether `gender_norms` should also touch enemy targeting stays "no" (author decision).
