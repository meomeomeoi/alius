# P8 — World Options & Unit Disposition

**Depends on:** P0–P7. **Read:** overview; this file; P3 (delta pipeline), P6 (disloyalty) as implemented.

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
