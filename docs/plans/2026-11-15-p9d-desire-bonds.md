# P9d Desire & Bonds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Romance, desire and intimacy become mechanics the player fully controls. An opt-in list of **content categories** decides what may appear. A per-unit **bond profile** from the card limits these mechanics to characters they fit. Romantic scenes get a **lead**. **Want** builds as a pressure. Leading partners propose **relationship rules**. Two new Desire/Bond defects are added. Relationships become **secret / known / public**.

**Architecture:**
- **Engine.** A new pure folder `src/engine/bonds/` owns every rule:
  - `profile.ts`: the bond profile and its ranks.
  - `content.ts`: categories and the content gate.
  - `scene.ts`: scene tone and the lead.
  - `want.ts`.
  - `rules.ts`: relationship rules.
  - `publicity.ts`.
  - `dayStep.ts`.
- **State.** New fields are `Unit.bond?`, `Relation.want?`, `Relation.publicity?`, `SceneRecord.tone?`/`lead?`/`violations?`, and one optional object `CampaignState.bonds?`. Campaign content choices go in `CampaignState.content?`.
- **Registries.** Numbers and texts live in content. There are two new registries, `contentCategories` and `relationshipRuleTemplates`, plus optional fields on existing ones (`contentTags`, `bondTier`, the defect fields `requiresBond` / `eventStress` / `wantBreakdown`).
- **Non-engine layer.** `src/bonds/` turns engine state into directives, prompt lines and chips, like `src/discipline/`.
- **Chunks.** They follow `docs/ROADMAP-next.md`.
  - **Chunk (a), Tasks 1–6:** bond profile, content categories, the character's own limits.
  - **Chunk (b), Tasks 7–12:** lead and chips, Want, relationship rules.
  - **Chunk (c), Tasks 13–17:** the two defects and the balance harness, publicity, docs.

**Tech Stack:** TypeScript 5 (strict), esbuild, zod 3, vitest (+ jsdom for UI). No new dependencies.

**Spec:** Read these before Task 1:
- `docs/00-overview.md`
- `docs/packages/P9d-desire-bonds.md`
- As implemented: `P3-scenes-relationships-memory.md`, `P8-world-options-disposition.md`, and the P9 plan's section "Where the plan rules on the spec" in `docs/plans/2026-11-14-p9-impunity-discipline.md`. That plan is the source for demands, Impunity terms and directive ids.
- `docs/content/defects.md`, Desire/Bond category.
- `docs/content/lore.md` §0, the pronoun rule.

## Global Constraints

- **English and safe text.** Everything is in English (overview P8). UI text goes through `textContent` / `h()`, never `innerHTML`.
- **Engine purity.**
  - `src/engine/**` stays pure; `tests/architecture.test.ts` enforces it.
  - `src/engine/bonds/**` imports only `src/content` types and other `src/engine` modules.
  - `src/bonds/**` follows the `src/discipline/` rule: SillyTavern only through `StAdapter` types, and no `src/ui`.
- **The model describes, the engine judges** (P1/P2).
  - The model reports tones, rule events, compromises and content violations as enums and ids. Every number comes from `TUNING.bonds` or the registries.
  - Lead, Want and publicity never enter the `intent_extract` input. The byte-identical prompt test across dispositions and stances in `tests/scene/sceneController.test.ts` stays green.
- **Data, not ids** (P4).
  - Code reads relationship states by `bondTier` and defects by `requiresBond` / `eventStress` / `wantBreakdown`.
  - Rule templates are read by `check` and content by `contentTags`.
  - No registry id is tested in engine code. The one exception is the category id `explicit_scenes` in the carry-over (Task 6).
- **Spec numbers, verbatim:**
  - Want ∈ [0, 100]. Daily rise is medium **+4**, high **+7**, × intense **1.4**, × avoidant **0.6**.
  - The Attraction path needs **≥ 60** and `attachment ≠ avoidant`.
  - Want bands are **40 / 70 / 90**. Want only runs with `desire ≥ medium`.
  - Rules need `leadStyle ≥ assertive`.
  - The two new defects are named in the spec: `dominance_drive`, `caretaker_overdrive`.
- **Draft numbers** go in `TUNING.bonds` or JSON and are marked *draft* in the spec's **Implemented as**. They are the author's to change.
- **Named units only.** Grunts have no bond, no Want, no rules and no publicity. `bondOf` returns `null` for them.
- **Romance off** (`intimacyOf(state).romance === false`):
  - No Want rises.
  - No rule is proposed.
  - No lead is decided and no lead chips appear.
  - No publicity reaction happens.
  - Existing rules and publicity stay stored and shown.
- **No pronoun for the commander** in any text a player or the main model reads. Soldiers are "she". `tests/content/pronouns.test.ts` covers the two new registries and `src/bonds/directives.ts`.
- **State version.** Campaign state stays `version: 1` and every new field is optional. A save without `bond`, `content`, `bonds`, `want`, `publicity` or the scene fields loads and plays: modest profile, no categories enabled except the carry-over, nothing pending.
- **Determinism.** Every new roll uses `ctx.rng`.
  - New draws: the rule-proposal roll in the bonds day step (only while some unit is eligible), and the publicity discovery roll (only while a `secret` relation exists).
  - Lead, Want and the content gate draw nothing.
  - Seeded tests that move are updated knowingly and named in the commit message.
- **Analysis tool (overview P12).**
  - Every new chip, stat, menu button and choice carries `data-analyze`.
  - Both new registries get `description`s and join `DESCRIBED_REGISTRIES`.
  - New concepts get glossary entries; new settings get a `setting_…` entry.
  - Live values (Want, lead, publicity) get providers that read through `Knowledge`. Want shows as a band word unless raw values are on.
  - `tests/ui/analyzeCoverage.test.ts` and `tests/analysis/hidden.test.ts` stay green.
- **Directive ids added here:** `content`, `limits:<unitId>`, `lead`, `want:<unitId>`, `rule:<unitId>`, `publicity:<unitId>`, `bond_break:<unitId>`.
  - None starts with a prefix the P9d spec reserves.
  - The P3 id `explicit` is retired (Task 4).
- **Build and commit.** `dist/index.js` and `style.css` are committed; `npm test` rebuilds them. Check its exit code before committing. Commit messages end with the executing agent's `Co-Authored-By:` / `Claude-Session:` trailers.

## Where the plan rules on the spec (read before Task 1)

Rulings marked **(user)** were answered by the user on 2026-11-15. Task 17 copies all of them into the spec's **Implemented as**.

- **Bond profile.**
  ```ts
  Unit.bond?: {
    leadStyle: 'dominant' | 'assertive' | 'balanced' | 'yielding';
    attachment: 'slow' | 'steady' | 'intense' | 'avoidant';
    desire: 'low' | 'medium' | 'high';
    caretaker: boolean;
    ownLimits: { categories: string[]; note?: string };   // contentCategories ids; note ≤ 160
    publicity: 'secret' | 'known' | 'public';             // (user) HER preference, from the card
  }
  ```
  - `LEAD_STYLES = ['yielding','balanced','assertive','dominant']` and `leadRank(style)` (0–3) make "≥ assertive" a rank test. `DESIRE_LEVELS = ['low','medium','high']` works the same way.
  - `bondOf(unit)` returns `unit.bond ?? MODEST_BOND` for named units and `null` for grunts. `MODEST_BOND` is balanced / steady / low / false / no limits / `known`. A modest profile never qualifies for Want or rules. P9b and P9c read only `bondOf`.
- **"close" states.** No `close` state exists. `relationshipStates` gains an optional `bondTier: 'romantic' | 'close'`:
  - `romantic`: `flirting`, `fwb`, `lover`, `devoted`, `secret_affair`.
  - `close`: `confidant`, `kindred`, `sworn`, `dependent`, `obsessed`.
  - The spec's "romantic/`fwb`" means tier `romantic`; "romantic/`fwb`/`close`" means either tier. Code reads `bondTierOf(state, reg, unitId)`.
- **Content categories.**
  - **Registry.** `contentCategories` entries are `{ id, label, description, order }`. The nine core ids are those of the spec: `humiliation`, `public_humiliation`, `degrading_language`, `pain_rough`, `restraint`, `physical_discipline_shown`, `jealousy_games`, `body_modification`, `explicit_scenes`. Descriptions are `AUTHOR TO WRITE` drafts.
  - **State.** `CampaignState.content?: { enabled: string[] }`. Absent means nothing enabled. Read it with `enabledCategories(state)`.
  - **Changing it.** Action `content/set_categories { enabled }` works at any time. It drops unknown ids and emits `content_changed { added, removed }`.
  - **Tagging.** Any entry of a gated registry may carry `contentTags: string[]`. `CONTENT_GATED_REGISTRIES = ['relationshipRuleTemplates','demandTemplates','punishments','dilemmaTemplates','missionTemplates','clocks']`, plus `nightEvents[]` entries inside `defects` and `relationshipStates.unlocks`. The loader rejects `contentTags` on any other registry and rejects unknown category ids.
  - **The gate.**
    ```ts
    contentAllowed(state, reg, entry, unitId?): boolean
    ```
    It is false when a tag is not enabled. With `unitId`, it is also false when a tag is in her `ownLimits.categories`.
    - `familyEnabled` calls it, so dilemmas, missions and clocks are gated at every existing pick site with no new call sites.
    - Explicit calls are added in `eligibleTemplates` (demands), the punishments menu list, the dialogue `measure` normalization (a gated measure reads `verbal`), `rollNight` / `nightSpecs`, and the rule roll.
    - P9c wager stakes and bookings call it later.
  - **Disabling mid-campaign** withdraws open items tagged with a removed category, quietly and with no deltas: proposals of rules, open demands, and night entries. Active accepted rules tagged with it are suspended: hidden, not tracked, and back when the category is re-enabled.
- **Carry-over of the old switch (user).** The global setting `explicitContent` stays in `settings.ts` but leaves SYS.
  - The wizard's CONTENT section starts with `explicit_scenes` on when `explicitContent` is true.
  - On load, an old save without `content` gets `content/set_categories` once, with `['explicit_scenes']` when the global switch is on, else `[]`.
  - After that the switch is never read again. The `content` key now exists, so turning the category off is not undone by a reload.
- **Exclusion directive.** `content` is a `manual` directive that `applyContext()` refreshes, so every main chat generation gets it. Its text is `Content excluded from this story — never depict, imply or describe: {labels}.`; with nothing disabled the directive is cleared.
  - `explicit_scenes` disabled adds `Fade out intimate moments.`
  - `explicit_scenes` enabled adds `Explicit intimate scenes are allowed when the story leads there.`
  - This replaces P3's `explicit` scene directive.
- **Quiet main-model calls.** `CallTypeDef` gains `prose?: true`, set on `dm_reply`, `activity_vignette`, `expedition_recap`, `flavor` and `dilemma_generate`. `LlmDeps` gains `contentLine?: () => string`. For a prose call, `callLlm` appends that line to the system prompt. The app passes the same text as the directive.
- **Own limits.** For each present unit with limits, `limits:<unitId>` (`scene`) reads `{Name} will not take part in: {labels of her limits}. {note}` and holds whether or not the category is enabled.
  - `intent_extract` gets the limit labels per participant as `limits: Record<unitId, string[]>`. Its guidance line says: "If the commander pushes a unit past her limits, report `rejected_advance` (advances) or `decision_violated` (orders)."
  - The usual P3 consequences follow; no new numbers.
- **Violations.**
  - **Detection.** `intent_extract` gets the disabled category ids and labels and returns `contentViolations?: [{ category, evidence ≤ 120 }]`. The sanitizer keeps only disabled ids, at most 3.
  - **Storage.** `intents/apply` stores them as `scene.violations[] { index, categories }`, where `index` is the reply's chat index. A swipe rollback therefore removes them.
  - **DMs.** For a DM exchange they go to the DM message (`DmMessage.violation?: string[]`).
  - **UI.** The reply gets a `⚠ CONTENT` chip with the category labels and `[REGENERATE]`; it uses the existing regenerate path.
  - **Scope.** `scene_summary` also returns `contentViolations`. It only logs them (debug) and drops facts whose text came from a flagged reply; it never marks the UI.
- **Scene tone.**
  - **Field.** `SceneRecord.tone?: 'romantic' | 'intimate'`.
  - **Set at `scene/start`.** It is `romantic` for a private scene with a unit in a tier-`romantic` state, and for a night entry of kind `want_visit`.
  - **Raised by `intent_extract`.** It returns `sceneTone?: 'romantic' | 'intimate' | null`. A reported tone raises the scene's tone (never lowers it; `intimate` > `romantic`). It is ignored with romance off and in group scenes with more than one named unit.
  - **Rollback.** The tone is stored by `intents/apply`, so a rollback restores it.
- **Who leads.**
  - **When.** Decided whenever the tone is first set or raised, for the scene's one named partner. It is stored in `scene.lead: { by: 'unit' | 'commander' | 'shared', unitId, score }`.
  - **Score** (draft weights in `TUNING.bonds.lead`), clamped 0…100:
    ```
    score = styleBase[leadStyle] (yielding 15, balanced 40, assertive 60, dominant 75)
          + 0.2 × (Impunity − 50)
          + 15 if she has dominance_drive (arc ≠ cure) — read via `defect.leadBonus`
          + 10 per commander_yielded / followed_lead on her in the last 3 days (history), cap 20
          − 10 per commander_enforced on her in the last 3 days, cap 20
          + 10 if her state is `devoted` or `lover` and leadStyle ≥ assertive (state field `leadBonus`)
    ```
  - **Result.** `≥ 60` → `unit`; `≤ 35` → `commander`; otherwise `shared`. No rng.
  - **Directive** `lead` (`scene`): `{Name} leads this scene.` / `The commander leads this scene; {Name} follows.` / `{Name} and the commander share the lead.`
- **Lead chips.** They show while `scene.lead` exists: `[FOLLOW] [ASK] [SET A LIMIT]`.
  - **FOLLOW** dispatches `bonds/follow`, the engine event `followed_lead` (draft row: Affinity +2 minor). It counts as a yield for Dominance Drive (`eventStress`). It does not touch Impunity: it is not `commander_yielded`. It works once per scene.
  - **ASK** sets a `next_reply` directive: `The commander asks {Name} what she wants; she answers plainly, in character.`
  - **SET A LIMIT** opens a text field (≤ 160). `bonds/limit { text }` writes a fact tagged `limit` (about her and the commander, known by both, importance 3). It adds the `scene` directive `In this scene, a boundary the commander set: {text}`. It is not the category system.
- **Want.**
  - **Storage.** `Relation.want?: number`.
  - **Eligible:** a named living unit with `desire ≥ medium`, romance on, and either a tier-`romantic` state or (Attraction ≥ 60 and `attachment ≠ avoidant`).
  - **Daily rise** in the bonds day step: `base[desire] × factor[attachment]`, rounded half up. The base is medium 4 / high 7. The factors are intense 1.4, avoidant 0.6, slow 1, steady 1 (the spec names only two factors, so the others are 1).
  - **An ineligible unit's Want** decays 5/day (draft) toward 0.
  - **Reductions** (draft, `TUNING.bonds.want.relief`):
    - An `intimate` scene with her ends: −60.
    - A `romantic` scene with her ends: −25.
    - She was a companion of any activity: −5.
    - `train` with her as a companion: −15.
    - Each day of an expedition she is in, with danger ≥ 3: −10.
    - She takes a `want_visit` night entry: −30 when opened.
  - **Bands:**
    - **≥ 40:** her DM initiative chance ×1.5, and her night specs gain `want_visit` (chance 0.25/day, priority 55, ignore = `dismissed` moderate).
    - **≥ 70:** +2 stress per day and the directive `want:<unitId>` (`manual`, only while she is present): `{Name} is restless and irritable with unmet want; it colours how she speaks to the commander.`
    - **≥ 90:** each of her Desire/Bond defects with `wantBreakdown` starts its off-combat breakdown (see below), once per crossing (`Relation.wantBreakDay`).
- **Want demand (user).** A Want ≥ 40 opens a P9 demand through `openDemand` with a template of the new demand `kind: 'desire'`, at most once every 3 days (`TUNING.bonds.want.demandEveryDays`).
  - `rollDemands` never picks `desire` templates.
  - Chips are relabelled by kind: `[SATISFY] [POSTPONE] [TALK]`.
  - **SATISFY** is grant. Its new cost `night_visit {}` enqueues a `want_visit` night entry for tonight (priority 90).
  - **POSTPONE** is refuse: the template's `refuseDeltas` (draft: Affinity −2, stress +2). It adds the `want:<unitId>` directive with the patience text `{Name} was asked to wait; she is trying to be patient.` for the next reply.
  - Redirecting needs no chip; the reductions above do it.
  - Two core templates: `want_tonight` and `want_attention`, with `AUTHOR TO WRITE` text.
- **Off-combat breakdown.** `DefectSchema.wantBreakdown?: { kind: 'withdrawal' | 'binge' | 'smother' | 'seize', days: 1..3 }` sets `unit.breakdown = { defectId, day, until: day + days }` (`until` is new and optional). The existing guards then keep her off expeditions. The bonds day step releases it when `day > until`, with the event `breakdown_released`.
  - `withdrawal`: also enqueues her defect night event at certainty.
  - `binge`: also costs 10 credits (floor 0).
  - `smother`: see the defects below.
  - `seize`: also refuses every `scene/order` on her.
  - Core: `imprint_hunger` gets withdrawal/1, `reward_loop` binge/1, `caretaker_overdrive` smother/1, `dominance_drive` seize/1.
- **Relationship rules.**
  - **Registry.** `relationshipRuleTemplates`: `{ id, text, description, contentTags, check, keepDeltas{trust,affinity}, breakDeltas{trust,affinity,stress}, conditions{ minLead?: 'assertive'|'dominant', tiers?: ('romantic'|'close')[] }, weight }`.
  - **`check`** is a closed vocabulary:
    - `daily_contact`: broken at day end when the commander neither shared a scene with her nor sent her a DM that day.
    - `run_without_asking`: broken at `expedition/start` when a tier-`romantic` unit of someone else is in the party and she is not.
    - `intent`: only through extracted `rule_kept` / `rule_broken`.
  - **Core templates** (wording drafts): `report_evening` (daily_contact), `hands_off_gear` (intent), `ask_before_runs` (run_without_asking), `no_other_tokens` (intent; tokens arrive with P9c), `name_me_first` (intent).
  - **State.** `CampaignState.bonds?.rules: Rule[]`, where `Rule` is `{ id, unitId, templateId, text, status: 'proposed'|'negotiating'|'active'|'suspended', day, brokenCount, lastBrokenDay? }`. At most 3 active per unit and one `proposed`/`negotiating` per unit.
  - **Proposal roll** in the day step. For each eligible unit (leadStyle ≥ assertive, tier `romantic` or `close`, romance on), the chance is `0.12 × (dominant 1.5 | assertive 1)` (draft). The template is a seeded weighted pick among the gated, eligible templates she has no rule for. It is delivered like a demand: in the open scene, or as a DM from her.
  - **Answers:**
    - `[ACCEPT]` → `active`, engine event `rule_accepted` (draft Affinity +3 minor).
    - `[REFUSE]` → removed, engine event `rule_refused` (draft Trust −1, Affinity −3, stress +3).
    - `[NEGOTIATE]` → `negotiating`, which opens a scene with her (origin `event`, her quarters) with the directive `rule:<unitId>`.
  - **Negotiation.** An extracted `compromise_reached { ruleId, text ≤ 160 }` makes the rule `active` with that text. A negotiation still open at the end of the scene becomes `proposed` again.
  - **Keeping and breaking.**
    - `rule_kept` applies `keepDeltas`.
    - `rule_broken` (and engine checks) applies `breakDeltas` and increments `brokenCount`.
    - When another unit is present (or for the `run_without_asking` check, the whole party), a public fact is written: `{Name}'s rule was broken: {text}.` It is known by those present.
    - Nothing is extracted below the P8 floors. Engine checks use confidence 1.
  - The `flavor` call gets the kind `rule` (personal wording, setting `ruleWording`, default on). The template `text` is the fallback.
- **New event types.**
  - `EVENT_TYPES` grows from 30 to **33**: `rule_kept`, `rule_broken`, `compromise_reached`. `EventIntent` gains `ruleId?` and `text?`.
  - `ENGINE_EVENT_TYPES` grows to **5**: + `followed_lead`, `rule_accepted`, `rule_refused`.
  - `eventDeltas` has 38 rows. The `compromise_reached` row is draft Trust +2 / Affinity +2 minor.
  - An unknown or missing `ruleId` drops the event.
- **Defect fields.**
  - `requiresBond?: { caretaker?: true }` filters import candidates, the manual list and `validateUnitProfile`.
  - `eventStress?: Record<eventType, number>` adds stress when that event lands on her. A negative value relieves stress.
  - `leadBonus?: number`.
  - `wantBreakdown?` (above).
- **New combat conditions.** `orderedThisRound` (the inverse of `notOrderedThisRound`). `commanderBuildIn: string[]`, which reads a new `CombatState.commander.build?`. `buildCombat` copies it from `commanderProfile(state).archetype`. Both are pure additions in `checkCondition`.
- **Dominance Drive** (`dominance_drive`, desire_bond; JSON numbers are draft):
  - **Combat upside:** `outgoing +15%` and `stat spd +10%` while `notOrderedThisRound`.
  - **Combat downside:** `stress 2 onTurnStart` while `orderedThisRound`.
  - **Breakdown *Seize Command*:** policy `normal`, `ignoresOrders: true`, `onEnter` = `order_refusal` on `allies_other`, chance 0.5.
  - **Out of combat:** `eventStress` `commander_enforced +4`, `threatened +3`, `commander_yielded −3`, `followed_lead −3`, `rule_accepted −3`; `leadBonus 15`; `wantBreakdown seize/1`.
  - **Arc (user: stand-ins).** The Embrace "formal co-command" stand-in is the new defect field `embraceFlag: "co_command"`: deciding Embrace writes the relation flag `co_command` and halves her `eventStress` positives (read where `eventStress` is applied, while the flag is set). Its directive is `co_command:<unitId>` (`manual`, when present): `{Name} shares command with the commander by open agreement.` P9b replaces it with the hierarchy.
- **Caretaker Overdrive** (`caretaker_overdrive`, desire_bond, `requiresBond.caretaker`):
  - **Combat upside:** `heal` and `outgoing` on heals +25%, scaled by `allies_hp_missing_pct` (per 0.5). Plus `stat def +10%` while `commanderBuildIn ['frail','slight']`.
  - **Combat downside:** `stress 2 onRoundStart` while `commanderExposed`.
  - **Breakdown *Smother*:** policy `await_order`, `ignoresOrders: false`.
  - **Out of combat:** `eventStress` `endangered +4`; `wantBreakdown smother/1`.
  - **Smother stand-in (user).** It is triggered by `wantBreakdown`, or when the combat breakdown is released after a run. It sets `bonds.smother = { unitId, untilDay: day + 1 }`. While it holds:
    - `expedition/start` is refused with `{Name} has locked the hangar: the commander stays at base today.`
    - Her next free commander slot is taken by a scene with her, via `calendar.pendingScene` at the next `slot_advanced`, origin `event`.
    - A Leash Suppress or the end of that scene clears it.
    - P9c replaces this with bookings.
- **Publicity.**
  - **State.** `Relation.publicity?: { level: 'secret'|'known'|'public'; commanderPref?: 'secret'|'known'|'public'; since: number }`. Her preference is `bond.publicity` (user). The commander's is set by the player in her dossier (user).
  - **Start.** Set when a relation enters a tier-`romantic` state. `secret_affair` → `secret`. Otherwise it takes the more private of her preference and `commanderPref ?? 'known'`.
  - **Leaving.** Cleared when the relation leaves the tier.
  - **Changing.** `bonds/set_publicity { unitId, level }` sets the level and `commanderPref`. Moving to a level she did not prefer applies `dismissed` minor. Moving toward her preference applies `listened` minor.
  - **Mismatch** (`level ≠ bond.publicity`). The demand condition `publicityMismatch: true` (new in `DemandTemplateSchema.conditions`) enables the core template `publicity_talk` (kind `interpersonal`). The directive `publicity:<unitId>` (`scene`, when she is present) reads `{Name} wants the relationship {her preference}; it is {level}.`
  - **Discovery.** A `secret` relation (not `secret_affair`, which keeps the P3 machinery) rolls at scene end and DM exchange with others present. It uses the P3 numbers `TUNING.relations.affair`, without `partnerPresent`. On success it becomes `known` and emits `bond_revealed`.
  - **Becoming `public` while she leads** means her last decided `scene.lead.by` was `unit`, or `leadStyle ≥ assertive` with no lead yet. Each other named living unit then reacts once by her values (`TUNING.bonds.publicReactions`, draft):
    - `corporate ≥ 1` or `ingroup ≤ −1`: her impunity record `+4`, since she loses respect.
    - `autonomy ≥ 1` or `mercy ≥ 1`: Trust `+2`, since she respects the honesty.
    - Otherwise nothing.
    - "Her friends close ranks" has no unit↔unit axes in v1. It becomes a public fact (`The squad knows: {Name} and the commander.`) and nothing more. This is an open item.
  - **For P9c.** `setPublicity(draft, reg, unitId, 'public', { cause: 'claimed' })` is exported; P9c's `claimed` calls it.
- **Not in the spec, added:**
  - Settings `ruleWording` (default on; SYS › Relationships).
  - Glossary entries `bond_profile`, `content_categories`, `want`, `lead`, `relationship_rules`, `publicity`, `setting_rule_wording`.
  - `removeFromService` forgets her rules, smother and Want.
  - Ledger key `want:<unitId>`.

## File Structure

```
content/core/{contentCategories,relationshipRuleTemplates}.json   new registries (+ manifest)
content/core/{relationshipStates,defects,demandTemplates,eventDeltas,glossary}.json   bondTier, 2 defects + fields, desire templates, 8 rows, entries
src/content/{types,schemas,refs}.ts                registries, contentTags, defect fields, demand kind/cost/condition, checks
src/engine/state/types.ts                          Unit.bond, Relation.want/publicity/wantBreakDay, SceneRecord.tone/lead/violations, Unit.breakdown.until, CampaignState.content/bonds
src/engine/tuning.ts                               TUNING.bonds
src/engine/bonds/profile.ts                        LEAD_STYLES, leadRank, bondOf, MODEST_BOND, bondTierOf
src/engine/bonds/content.ts                        enabledCategories, contentAllowed, setCategories, withdrawTagged
src/engine/bonds/scene.ts                          raiseTone, decideLead, follow, setLimit
src/engine/bonds/want.ts                           wantEligible, wantStep, relieveWant, wantBand
src/engine/bonds/rules.ts                          rollRules, answerRule, applyRuleEvent, checkDailyContact, checkRunRoster
src/engine/bonds/publicity.ts                      syncPublicity, setPublicity, rollReveal, publicReactions
src/engine/bonds/breakdown.ts                      startWantBreakdown, releaseWantBreakdowns, smother
src/engine/bonds/dayStep.ts, index.ts              bonds day step (on 'dm_rumors', after the relationship pass); exports
src/engine/actions/bonds.ts                        content/set_categories, bonds/follow, bonds/limit, bonds/answer_rule, bonds/set_publicity, bonds/deliver_rule
src/engine/{setup,night,arcs}.ts, relations/{vocab,intents,apply,effects,deltas}.ts, discipline/{demands}.ts,
src/engine/worldOptions/options.ts, actions/{scene,squad,activities}.ts, world/expedition.ts, combat/{types,effects,build}.ts, leash/use.ts    hook points
src/llm/{callTypes,orchestrator}.ts, llm/calls/{profileImport,intentExtract,sceneSummary,flavor}.ts
src/setup/{profile,wizard}.ts
src/bonds/{directives,controller,deps}.ts          directives, content line, rule wording/delivery
src/scene/{context,sceneController,comms}.ts, src/app.ts, src/settings.ts
src/analysis/providers/bonds.ts, analysis/{effects,describe}.ts
src/ui/bonds/{chips,content}.ts, ui/setup/{calibration,worldParams}.ts, ui/squad/squadTab.ts, ui/scene/sceneScreen.ts, ui/comms/commsTab.ts, ui/discipline/chips.ts, ui/shell/sysTab.ts
css/72-bonds.css
src/sim/harness.ts (no change expected), tests/sim/harness.test.ts (18 → 20)
docs/MANUAL_TEST_P9d.md, docs/CONTENT.md, docs/00-overview.md, docs/content/defects.md, docs/packages/P9d-desire-bonds.md, docs/ROADMAP-next.md
tests/**                                           mirrors src; tests/helpers/bonds.ts
```

## Review Focus

1. **An old save, or one started before P9d.** It has no `content`, no `bond`, no `want`. It loads, plays and runs the day step with no throw. It gets `explicit_scenes` once if the old switch was on. Turning it off survives a reload. Tests in Task 1 (`an old save runs the bonds day step`) and Task 6 (`carry-over happens once`).
2. **A hostile or garbled `bond` section.** Unknown enums, limit ids that are not categories, a 2 000-char note, `caretaker: "yes"`. The result is modest defaults per field, unknown ids dropped, the note cut to 160, no throw, and `missing` lists the section. Test in Task 3.
3. **A category is disabled while a rule proposal, a desire demand or a `want_visit` night entry tagged with it is open.** They are withdrawn with no deltas. The directive changes from the next generation. Re-enabling brings suspended rules back. Tests in Tasks 1 and 11.
4. **A reply flagged as a violation is swiped, regenerated or edited.** The mark goes with the rollback, and the new reply is read fresh. A flag on a non-disabled id is dropped. Tests in Task 5.
5. **A unit with Want, an active rule, a smother or a publicity level dies, deserts or is terminated.** `removeFromService` forgets her. Chips disappear and the day step skips her. Tests in Tasks 9 and 11.
6. **Romance is switched off mid-campaign.** Want stops rising and does not trigger bands. No rule proposals, no lead, no chips. Stored rules stay visible. Test in Task 9.

---

## Chunk (a) — Bond profile, content categories, own limits

### Task 1: Content categories, the gate and the state foundations

**Files:**
- Create: `content/core/contentCategories.json`, `src/engine/bonds/{content,profile,index}.ts`, `src/engine/actions/bonds.ts`, `tests/engine/bonds/content.test.ts`, `tests/content/p9dSchemas.test.ts`, `tests/helpers/bonds.ts`
- Modify: `src/content/{types,schemas,refs}.ts`, `content/core/{manifest,relationshipStates}.json`, `src/engine/state/types.ts`, `src/engine/tuning.ts`, `src/engine/worldOptions/options.ts` (`familyEnabled`), `src/engine/discipline/demands.ts` (`eligibleTemplates`), `src/engine/night.ts`, `tests/content/core.test.ts`

**Interfaces:**
- Produces:
  - `enabledCategories(state): string[]`
  - `contentAllowed(state, reg, entry: object, unitId?: string): boolean`
  - `setCategories(draft, reg, enabled: string[]): EngineEvent[]`, which emits `content_changed` and withdraws or suspends tagged items
  - `CONTENT_GATED_REGISTRIES`
  - `bondTierOf(state, reg, unitId): 'romantic'|'close'|null`
  - `bondOf(unit): Bond | null`, `MODEST_BOND`, `LEAD_STYLES`, `leadRank`, `DESIRE_LEVELS`
  - the state types of the rulings: `Bond`, `CampaignState.content`, `CampaignState.bonds { rules: Rule[]; smother?: {unitId, untilDay} }`, `Relation.want`/`publicity`/`wantBreakDay`, `SceneRecord.tone`/`lead`/`violations`, `Unit.breakdown.until?`
  - `TUNING.bonds` with every draft number of the rulings
  - action `content/set_categories`
- Consumes: `familyEnabled` (P8), `eligibleTemplates` (P9), `nightSpecs` in `night.ts`.

- [x] **Step 1: Write the failing tests.**
  - `p9dSchemas`:
    - `contentCategories loads nine core categories with descriptions`
    - `contentTags with an unknown category is a load error`
    - `contentTags on a non-gated registry is a load error`
    - `bondTier accepts only romantic|close`
  - `content.test`:
    - `all categories start disabled`
    - `contentAllowed is false for a tagged entry until its category is enabled`
    - `contentAllowed with a unit honours her ownLimits even when enabled`
    - `a tagged dilemma template is never drawn while disabled (familyEnabled)`
    - `a tagged demand template is not eligible while disabled`
    - `a tagged defect night spec is never queued while disabled`
    - `disabling withdraws an open tagged demand and night entry with no deltas`
    - `an old save runs the bonds day step` (state without any P9d field).
  - The **all-registries test**: `every registry in CONTENT_GATED_REGISTRIES has a probe and no probe returns a tagged entry while disabled`. It uses a fixture pack in `tests/fixtures/packs/p9d_gate/` that adds one tagged entry per gated registry. `GATE_PROBES` in `tests/helpers/bonds.ts` maps each registry to the engine function that picks from it, run over 50 seeded picks.
  - `core.test`: `relationshipStates: the five romantic and five close tiers`.
- [x] **Step 2: Run** `npx vitest run tests/engine/bonds tests/content` and confirm FAIL (missing modules).
- [x] **Step 3: Implement.**
  - Schemas: `ContentCategorySchema { label ≤ 40, description ≤ 200, order }`, and `contentTags: z.array(str).optional()` on the gated schemas.
  - A `registerChecks` for every registry rejects stray or unknown tags.
  - `bondTier` on the 10 states of the ruling.
  - `familyEnabled` becomes `family check && contentAllowed(state, reg, entry)`; its `WorldHolder` parameter widens to accept `content?`.
- [x] **Step 4: Run** `npm test` and confirm PASS.
- [x] **Step 5: Commit** `feat(content): content categories, the content gate and P9d state`.

### Task 2: Bond profile on units, setup and re-sync

**Files:**
- Modify: `src/engine/setup.ts` (`UnitSetup.bond?`, `makeNamedUnit`, `validateUnitProfile`, defect `requiresBond`), `src/content/schemas.ts` (`DefectSchema.requiresBond`), `src/engine/actions/squad.ts` (`RESYNC_SECTIONS` + `bond`), `src/engine/leash/use.ts` (`removeFromService`)
- Test: `tests/engine/bonds/profile.test.ts`, `tests/engine/setup.test.ts`, `tests/engine/squadResync.test.ts` (or the existing resync test file)

**Interfaces:**
- Consumes: the Task 1 types.
- Produces:
  - `validateBond(raw: unknown, reg): { bond: Bond; issues: string[] }`, which clamps to legal values, drops unknown limit ids and cuts the note.
  - `defectAllowedFor(reg, defectId, bond: Bond | null): boolean`.
  - The `squad/resync` patch key `bond`.

- [x] **Step 1: Write the failing tests.**
  - `bondOf returns MODEST_BOND for a named unit without bond and null for a grunt`
  - `leadRank orders yielding < balanced < assertive < dominant`
  - `validateBond drops unknown limit ids and cuts the note at 160`
  - `a unit without caretaker cannot take caretaker_overdrive (validateUnitProfile)`
  - `squad/resync with bond replaces the profile and keeps want and publicity`
  - `removeFromService forgets rules, smother and want`
- [x] **Step 2: Run** `npx vitest run tests/engine/bonds/profile.test.ts tests/engine/setup.test.ts` and confirm FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** `npm test` and confirm PASS.
- [x] **Step 5: Commit** `feat(engine): bond profile on units, validation and re-sync`.

### Task 3: `profile_import` bond section, wizard and calibration UI

**Files:**
- Modify: `src/llm/calls/profileImport.ts` (`ImportSection` + `'bond'`, `SCHEMA_PART.bond`, guidance paragraph), `src/setup/profile.ts` (`sanitizeProfile` `want('bond')` block; candidates with `requiresBond` filtered by the imported bond), `src/setup/wizard.ts` (`applySection`, `preselect`, `build`), `src/ui/setup/calibration.ts` (section `BOND PROFILE`), `src/app.ts` (`RESYNC_LABELS.bond`, patch)
- Create: `tests/fixtures/profile_import/{bond_valid,bond_hostile}.txt`
- Test: `tests/setup/profile.test.ts`, `tests/setup/wizard.test.ts`, `tests/ui/setup/calibration.test.ts`, `tests/app-resync.test.ts`

**Interfaces:**
- Consumes: `validateBond` and `defectAllowedFor` (Task 2); the `contentCategories` ids and labels go into `ProfileImportInput.categories` (only when `bond` is asked for).
- Produces: `ImportedProfile.bond?: Bond`.

- [x] **Step 1: Write the failing tests.**
  - `bond section parses leadStyle, attachment, desire, caretaker, ownLimits and publicity`
  - `hostile bond output becomes modest defaults per field and lists bond in missing`
  - `bond is never critical: a failed bond still finishes the import`
  - `caretaker_overdrive is offered only when the imported bond says caretaker`
  - `wizard build copies bond into UnitSetup`
  - `calibration shows the bond section with data-analyze on every chip and edits it`
  - `re-sync with the bond section patches only bond`
- [x] **Step 2: Run** the four test files and confirm FAIL.
- [x] **Step 3: Implement.**
  - The JSON shape line is: `"bond": { "leadStyle": "dominant|assertive|balanced|yielding", "attachment": "slow|steady|intense|avoidant", "desire": "low|medium|high", "caretaker": bool, "ownLimits": { "categories": [ids], "note": "≤160" }, "publicity": "secret|known|public", "reason": "≤160" }`.
  - The guidance says:
    - Read the card, never invent.
    - `ownLimits` lists only what the card says she would not do.
    - An unspecified card is balanced / steady / low.
  - Calibration rows are four chip groups plus a caretaker toggle, a limits checklist (labels from the registry) and a note field. They follow the P8 disposition block pattern.
- [x] **Step 4: Run** `npm test` and confirm PASS.
- [x] **Step 5: Commit** `feat(setup): bond profile import, calibration and re-sync`.

### Task 4: Exclusion and limits directives; prose calls

**Files:**
- Create: `src/bonds/directives.ts`, `tests/bonds/directives.test.ts`
- Modify: `src/app.ts` (`applyContext()` calls `bondsDirectives`), `src/scene/context.ts` (remove `explicit`), `src/llm/{callTypes,orchestrator}.ts` (`prose`, `contentLine`), the five prose call defs, `tests/llm/orchestrator.test.ts`, `tests/content/pronouns.test.ts`

**Interfaces:**
- Consumes: `enabledCategories`, `bondOf`, `scene.participants`.
- Produces:
  - `contentLine(state, reg): string`, which is empty when nothing is excluded and `explicit_scenes` is not enabled
  - `bondsDirectives(builder, state, reg): void`, which sets or clears `content`, `limits:*`, `lead`, `want:*`, `rule:*`, `publicity:*`, `co_command:*` (later tasks fill the last five) and clears its own prefixes when there is no state
  - `LlmDeps.contentLine?: () => string`

- [x] **Step 1: Write the failing tests.**
  - `the content directive lists every disabled category label`
  - `enabling a category removes it from the directive on the next applyContext`
  - `explicit_scenes enabled says explicit scenes are allowed`
  - `limits directive for a present unit holds even when the category is enabled`
  - `no explicit directive id is set any more`
  - `a prose call appends the content line to its system prompt; intent_extract does not`
  - `directive texts have no commander pronoun`
- [x] **Step 2: Run** `npx vitest run tests/bonds tests/llm/orchestrator.test.ts` and confirm FAIL.
- [x] **Step 3: Implement** with the texts of the rulings.
- [x] **Step 4: Run** `npm test` and confirm PASS. The P3 scene-context tests that asserted `explicit` are updated in this commit and named in the message.
- [x] **Step 5: Commit** `feat(bonds): content exclusion and own-limits directives on every generation`.

### Task 5: Violations and limits in extraction

**Files:**
- Modify: `src/llm/calls/intentExtract.ts` (input `limits`, `excluded: {id,label}[]`; output `contentViolations`, `sceneTone`), `src/llm/calls/sceneSummary.ts`, `src/engine/actions/scene.ts` (`intents/apply` stores `violations` and `tone`), `src/engine/actions/comms.ts` (DM violation), `src/scene/{sceneController,comms}.ts` (pass the input; UI event `violation`), `src/ui/scene/sceneScreen.ts`, `src/ui/comms/commsTab.ts`
- Create: `tests/fixtures/intent_extract/{violation,violation_hostile}.txt`, `src/ui/bonds/chips.ts` (`drawViolation`)
- Test: `tests/llm/intentExtract.test.ts`, `tests/llm/sceneSummary.test.ts`, `tests/scene/sceneController.test.ts`, `tests/ui/scene/sceneScreen.test.ts`

**Interfaces:**
- Consumes: Task 4's `enabledCategories`, the labels and `bondOf`.
- Produces:
  - `IntentOutput.contentViolations?: {category, evidence}[]` and `IntentOutput.sceneTone?`
  - the payload of `intents/apply` gains `violations?: {index, categories}` and `tone?`
  - `drawViolation(host, labels, onRegenerate)`

- [x] **Step 1: Write the failing tests.**
  - `a violation on a disabled category is kept; one on an enabled or unknown id is dropped; at most 3`
  - `the reply is marked and REGENERATE calls the regenerate path`
  - `swipe after a flagged reply removes the mark` (Review Focus 4)
  - `an edited flagged reply is re-read and loses the mark when clean`
  - `limits of each participant reach the prompt; the prompt is byte-identical across dispositions and stances with the same categories`
  - `scene_summary drops facts from a flagged reply and never marks the UI`
  - `a DM violation marks the DM`
- [x] **Step 2: Run** the test files and confirm FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** `npm test` and confirm PASS.
- [x] **Step 5: Commit** `feat(scene): flag content violations and pass own limits to extraction`.

### Task 6: CONTENT at setup, in SYS, the carry-over, analysis

**Files:**
- Create: `src/ui/bonds/content.ts` (`renderContentSection(host, { enabled, registries, onChange })`, shared by setup and SYS), `src/analysis/providers/bonds.ts`, `css/72-bonds.css`
- Modify: `src/setup/wizard.ts` (`WizardState.content { enabled }`, initial from `explicitContent`; `setContent`), `src/engine/setup.ts` (`SetupResult.content?`; `buildCampaign` writes `content`), `src/ui/setup/worldParams.ts` (CONTENT section after the world groups), `src/ui/shell/sysTab.ts` (section `Content`; remove the `Explicit scenes allowed` row), `src/app.ts` (carry-over on load), `src/settings.ts` (`explicitContent` comment: read only for the carry-over), `content/core/glossary.json`, `src/content/schemas.ts` (`DESCRIBED_REGISTRIES` + `contentCategories`)
- Test: `tests/ui/setup/worldParams.test.ts`, `tests/ui/shell/sysTab.test.ts`, `tests/app-content.test.ts`, `tests/ui/analyzeCoverage.test.ts`

**Interfaces:**
- Consumes: `content/set_categories` (Task 1) and `contentLine` (Task 4).
- Produces:
  - `registerBondsProviders()`, called from `registerCoreProviders`, with keys `contentCategories`, `glossary:content_categories`, `glossary:bond_profile`
  - `Wizard.setContent(enabled: string[])`

- [x] **Step 1: Write the failing tests.**
  - `CONTENT lists all nine categories, each off, with its description`
  - `explicit_scenes starts on in the wizard when the old switch is on`
  - `carry-over happens once: an old save gets explicit_scenes, turning it off survives a reload` (Review Focus 1)
  - `SYS content toggles dispatch content/set_categories and the next applyContext changes the directive`
  - `SYS no longer shows Explicit scenes allowed`
  - `every category row carries data-analyze and resolves`
- [x] **Step 2: Run** the test files and confirm FAIL.
- [x] **Step 3: Implement.** The section heading copy is `CONTENT — nothing here appears unless you turn it on. Turning it on is your consent for the story to go there.`
- [x] **Step 4: Run** `npm test` and confirm PASS.
- [x] **Step 5: Commit** `feat(ui): CONTENT section at setup and in SYS, explicit-scenes carry-over`.

---

## Chunk (b) — Lead, Want, relationship rules

### Task 7: Scene tone and the lead decision

**Files:**
- Create: `src/engine/bonds/scene.ts`, `tests/engine/bonds/lead.test.ts`
- Modify: `src/engine/actions/scene.ts` (`scene/start` tone; `intents/apply` raises the tone and decides the lead), `src/engine/relations/vocab.ts` (engine `followed_lead`), `content/core/eventDeltas.json`, `content/core/relationshipStates.json` (`leadBonus` on `lover`, `devoted`), `src/content/schemas.ts` (`RelationshipStateSchema.leadBonus?`, `DefectSchema.leadBonus?`)

**Interfaces:**
- Consumes: `impunityOf` (P9), `bondOf`, `bondTierOf`, `Relation.history`.
- Produces:
  - `raiseTone(draft, reg, tone): EngineEvent[]`
  - `decideLead(state, reg, unitId): { by: 'unit'|'commander'|'shared'; score: number }`
  - `leadScoreParts(state, reg, unitId)`, used by the analysis provider
  - the event `lead_decided { unitId, by }`

- [x] **Step 1: Write the failing tests.**
  - `a private scene with a lover starts romantic and decides a lead`
  - `a dominant unit at Impunity 50 leads; a yielding one follows the commander`
  - `a balanced unit shares`
  - `two recent commander_enforced lower the score by 20`
  - `extracted sceneTone intimate raises a romantic scene; romantic never lowers intimate`
  - `romance off: no tone, no lead`
  - `a group scene with two named units gets no lead`
  - `rollback of the reading restores tone and lead`
- [x] **Step 2: Run** `npx vitest run tests/engine/bonds/lead.test.ts` and confirm FAIL.
- [x] **Step 3: Implement** the score of the rulings.
- [x] **Step 4: Run** `npm test` and confirm PASS.
- [x] **Step 5: Commit** `feat(engine): scene tone and who leads`.

### Task 8: Lead directive and the FOLLOW / ASK / SET A LIMIT chips

**Files:**
- Modify: `src/engine/actions/bonds.ts` (`bonds/follow`, `bonds/limit`), `src/bonds/directives.ts` (`lead`, ASK one-reply text, limit text), `src/scene/sceneController.ts` (`follow()`, `ask()`, `limit(text)`), `src/ui/bonds/chips.ts` (`drawLeadChips`), `src/ui/scene/sceneScreen.ts`, `src/analysis/providers/bonds.ts` (`lead`), `content/core/glossary.json` (`lead`)
- Test: `tests/engine/bonds/lead.test.ts`, `tests/scene/sceneController.test.ts`, `tests/ui/scene/sceneScreen.test.ts`

**Interfaces:**
- Consumes: `decideLead` (Task 7).
- Produces:
  - `followLead(draft, ctx): EngineEvent[]`, once per scene
  - `setSceneLimit(draft, text): EngineEvent[]`, which writes the `limit` fact
  - `drawLeadChips(host, scene, handlers)`

- [x] **Step 1: Write the failing tests.**
  - `the lead directive names who leads`
  - `FOLLOW applies followed_lead once per scene`
  - `ASK sets a one-reply directive`
  - `SET A LIMIT writes a limit fact known by both and a scene directive`
  - `chips show only while a lead exists and carry data-analyze`
- [x] **Step 2: Run** and confirm FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** `npm test` and confirm PASS.
- [x] **Step 5: Commit** `feat(scene): lead directive and lead chips`.

### Task 9: Want: rise, relief, bands, off-combat breakdown

**Files:**
- Create: `src/engine/bonds/{want,breakdown,dayStep}.ts`, `tests/engine/bonds/want.test.ts`
- Modify: `src/engine/bonds/index.ts` (registers `bondsDayStep` on `dm_rumors`, imported in `app.ts` after `comms`), `src/engine/actions/{scene,activities}.ts` (relief at `scene/end` and after companion activities, via `registerActivityHook`), `src/engine/world/expedition.ts` (relief per expedition day), `src/engine/night.ts` (`want_visit` spec ≥ 40; open relief), `src/engine/dms.ts` (`initiativeChance` × 1.5 at ≥ 40), `src/engine/actions/scene.ts` (`scene/order` refused while `seize`), `src/content/schemas.ts` (`DefectSchema.wantBreakdown`), `content/core/defects.json` (`imprint_hunger`, `reward_loop`), `src/bonds/directives.ts` (`want:*`), `src/engine/ledger.ts` (`want:<id>`)

**Interfaces:**
- Consumes: `bondOf`, `bondTierOf`, `intimacyOf`, `enqueueNight`, `contentAllowed` (the `want_visit` spec carries `contentTags: []`).
- Produces:
  - `wantEligible(state, reg, unitId): boolean`
  - `wantOf(state, unitId): number`
  - `wantBand(n): 'calm'|'restless'|'aching'|'desperate'` (< 40, < 70, < 90, ≥ 90)
  - `relieveWant(draft, unitId, amount, cause)`
  - `startWantBreakdown(draft, ctx, unitId, defectId)`
  - `releaseWantBreakdowns(draft)`
  - `bondsDayStep(draft, ctx): EngineEvent[]`, in the order: release breakdowns → Want → rules (Task 11) → smother expiry (Task 14)

- [x] **Step 1: Write the failing tests.**
  - `medium desire in a romantic state rises +4 a day; high intense rises round(7×1.4)=10`
  - `the attraction path needs attraction ≥ 60 and not avoidant`
  - `low desire and the modest profile never get Want` (acceptance 1)
  - `an intimate scene ending lowers Want by 60; training together by 15`
  - `≥ 40 adds a want_visit night spec and raises DM initiative`
  - `≥ 70 adds 2 stress a day and the want directive while she is present`
  - `crossing 90 starts imprint_hunger withdrawal once; it is released after its days`
  - `romance off: Want does not rise and no band acts` (Review Focus 6)
  - `a dead unit's Want is skipped and forgotten` (Review Focus 5)
- [x] **Step 2: Run** `npx vitest run tests/engine/bonds/want.test.ts` and confirm FAIL.
- [x] **Step 3: Implement** the numbers of the rulings from `TUNING.bonds.want`.
- [x] **Step 4: Run** `npm test` and confirm PASS. Name any moved seeded tests (night queue, DM rolls) in the commit.
- [x] **Step 5: Commit** `feat(engine): Want, its bands and the off-combat breakdown`.

### Task 10: The Want demand (SATISFY / POSTPONE / TALK)

**Files:**
- Modify: `src/content/schemas.ts` (`DemandTemplateSchema.kind` + `'desire'`, `conditions.publicityMismatch?`, `DemandCostSchema` + `night_visit`), `src/engine/discipline/demands.ts` (`rollDemands` skips `desire`; `night_visit` cost; `grantProblem` refuses when tonight already has her `want_visit`), `src/engine/bonds/want.ts` (opens the desire demand from the day step), `content/core/demandTemplates.json` (`want_tonight`, `want_attention`, `publicity_talk`), `src/ui/discipline/chips.ts` (labels by kind), `src/bonds/directives.ts` (patience text on postpone)
- Test: `tests/engine/discipline/demands.test.ts`, `tests/engine/bonds/want.test.ts`, `tests/ui/discipline/chips.test.ts`

**Interfaces:**
- Consumes: `openDemand`, `answerDemand` (P9).
- Produces: the chip labels `[SATISFY] [POSTPONE] [TALK]` for `kind: 'desire'`.

- [x] **Step 1: Write the failing tests.**
  - `Want ≥ 40 opens a desire demand at most every 3 days`
  - `rollDemands never opens a desire template`
  - `SATISFY queues a want_visit for tonight at priority 90`
  - `POSTPONE applies refuseDeltas and the patience directive`
  - `a desire template tagged with a disabled category is never opened`
  - `desire chips read SATISFY / POSTPONE / TALK with data-analyze`
- [x] **Step 2: Run** and confirm FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** `npm test` and confirm PASS.
- [x] **Step 5: Commit** `feat(engine): Want arrives as a demand from her`.

### Task 11: Relationship rules in the engine

**Files:**
- Create: `content/core/relationshipRuleTemplates.json`, `src/engine/bonds/rules.ts`, `tests/engine/bonds/rules.test.ts`
- Modify: `src/content/{types,schemas,refs}.ts` (registry, `check` enum, described), `src/engine/relations/{vocab,intents,apply}.ts` (`rule_kept`, `rule_broken`, `compromise_reached` with `ruleId`/`text`; engine `rule_accepted`, `rule_refused`), `content/core/eventDeltas.json`, `src/llm/calls/intentExtract.ts` (input `rules: {id, unitId, text}[]` of active and negotiating rules; guidance), `src/engine/actions/bonds.ts` (`bonds/answer_rule`, `bonds/deliver_rule`), `src/engine/world/expedition.ts` (`run_without_asking` check), `src/engine/bonds/dayStep.ts` (roll + `daily_contact`)

**Interfaces:**
- Consumes: `bondOf`, `leadRank`, `bondTierOf`, `contentAllowed(…, unitId)`, `addFact`, `applyEventToUnit`.
- Produces:
  - `rollRules(draft, ctx): EngineEvent[]` (`rule_proposed`)
  - `deliverRule(draft, ruleId, text?)`
  - `answerRule(draft, ctx, ruleId, 'accept'|'negotiate'|'refuse'): EngineEvent[]`
  - `applyRuleEvent(draft, ctx, ev)`
  - `activeRules(state, unitId): Rule[]`

- [x] **Step 1: Write the failing tests.**
  - `only assertive or dominant units in romantic or close states propose rules` (acceptance 1)
  - `at most one open proposal and three active rules per unit`
  - `accept activates; refuse applies rule_refused; negotiate opens a scene and compromise_reached sets the agreed text`
  - `an open negotiation returns to proposed at scene end`
  - `daily_contact breaks at day end without a scene or DM with her`
  - `run_without_asking breaks when a rival romantic partner goes on a run without her`
  - `a witnessed break writes a public fact known by those present`
  - `rule_broken with an unknown ruleId is dropped`
  - `a rule tagged with a disabled category is never proposed; an active one is suspended and returns on re-enable` (Review Focus 3)
  - `removeFromService drops her rules`
- [x] **Step 2: Run** `npx vitest run tests/engine/bonds/rules.test.ts` and confirm FAIL.
- [x] **Step 3: Implement.** Template texts are `AUTHOR TO WRITE` drafts of the spec's four examples plus `name_me_first`.
- [x] **Step 4: Run** `npm test` and confirm PASS. Update the "has 30 event types" test to 33 knowingly.
- [x] **Step 5: Commit** `feat(engine): relationship rules, negotiation and compliance`.

### Task 12: Rules in scenes, DMs and the dossier

**Files:**
- Create: `src/bonds/{controller,deps}.ts` (rule wording through `flavor` kind `rule`, delivery as DM or scene directive), `tests/bonds/controller.test.ts`
- Modify: `src/llm/calls/flavor.ts` (kind `rule`), `src/settings.ts` (`ruleWording`), `src/ui/bonds/chips.ts` (`drawRuleChips`), `src/ui/scene/sceneScreen.ts`, `src/ui/comms/commsTab.ts`, `src/ui/squad/squadTab.ts` (`bondBlock`: lead style / attachment / desire chips, the Want band chip, RULES list with status and broken count), `src/ui/shell/sysTab.ts` (`ruleWording` row), `src/analysis/providers/bonds.ts` (`want`, `relationshipRuleTemplates`, `rule`), `content/core/glossary.json`, `src/app.ts` (wire the controller after `slot_advanced`/day events)

**Interfaces:**
- Consumes: `rollRules`, `deliverRule`, `answerRule`, `wantBand`.
- Produces: `bondsController(deps)` with `onEvents(events)`.

- [ ] **Step 1: Write the failing tests.**
  - `a proposed rule is worded once and delivered as a DM when she is not in the scene`
  - `the template text is used when wording fails or is off`
  - `ACCEPT / NEGOTIATE / REFUSE chips in a scene and in COMMS carry data-analyze`
  - `the dossier shows the bond chips, the Want band (number only with raw values) and active rules`
  - `the Want provider shows a band, never a number, unless raw values are on` (`hidden.test`)
- [ ] **Step 2: Run** and confirm FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and confirm PASS.
- [ ] **Step 5: Commit** `feat(ui): relationship rule chips, wording and the dossier bond block`.

---

## Chunk (c) — New defects, publicity, docs

### Task 13: Combat and defect vocabulary

**Files:**
- Modify: `src/engine/combat/{types,effects,build}.ts` (`orderedThisRound`, `commanderBuildIn`, `CombatState.commander.build`), `src/content/schemas.ts` (Condition zod, `DefectSchema.eventStress`), `src/engine/relations/effects.ts` (`eventStress` applied with the event, halved positives under `co_command`)
- Test: `tests/engine/combat/conditions.test.ts`, `tests/engine/relations/effects.test.ts`

**Interfaces:**
- Produces: the two conditions and `defectEventStress(reg, unit, rel, eventType): number`.

- [ ] **Step 1: Write the failing tests.**
  - `orderedThisRound is true only for a unit given a CP order this round`
  - `commanderBuildIn reads the archetype copied at combat build`
  - `eventStress adds stress when the event lands and relieves on negative values`
  - `co_command halves positive eventStress`
- [ ] **Step 2: Run** and confirm FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and confirm PASS.
- [ ] **Step 5: Commit** `feat(combat): orderedThisRound, commanderBuildIn and defect eventStress`.

### Task 14: Dominance Drive and Caretaker Overdrive

**Files:**
- Modify: `content/core/defects.json` (two entries with the numbers of the rulings), `docs/content/defects.md` (both entries under DESIRE / BOND), `src/engine/bonds/breakdown.ts` (`smother`, `seize`), `src/engine/world/expedition.ts` (refuse start under smother), `src/engine/progression.ts` (`releaseBreakdowns` starts smother for a released unit whose breakdown defect has `wantBreakdown.kind === 'smother'`), `src/engine/arcs.ts` + `DefectSchema.embraceFlag?` (an embrace decision sets that relation flag; `dominance_drive` has `embraceFlag: "co_command"`), `src/engine/leash/use.ts` (Suppress clears smother), `src/bonds/directives.ts` (`co_command:*`), `tests/sim/harness.test.ts` (18 → 20, the PASS line), `docs/BALANCE_REPORT.md` (regenerated by `npm run sim -- --neutrality`)
- Test: `tests/engine/bonds/defects.test.ts`, `tests/sim/harness.test.ts`, `tests/setup/profile.test.ts`

**Interfaces:**
- Consumes: Task 13 vocabulary, `wantBreakdown` (Task 9), `calendar.pendingScene`.
- Produces: `smotherActive(state): {unitId, untilDay} | null`.

- [ ] **Step 1: Write the failing tests.**
  - `dominance_drive deals more damage on her own call and stresses when ordered`
  - `Seize Command makes allies refuse orders by chance (seeded)`
  - `commander_enforced stresses a dominance_drive unit; followed_lead relieves her`
  - `caretaker_overdrive heals more when allies are hurt and gains def with a frail commander`
  - `smother refuses expedition/start until the next day and takes the next free slot`
  - `a Leash Suppress clears smother`
  - `embracing dominance_drive sets co_command and its directive`
  - `both pass the neutrality check (|Δ| ≤ 5 pp)` (acceptance 7)
  - `20 defects listed`
  - `both are dropped from import when Desire/Bond defects are off`
- [ ] **Step 2: Run** and confirm FAIL.
- [ ] **Step 3: Implement.** Run `npm run sim -- --neutrality`. If either is outside ±5 pp, tune only its JSON numbers and record the final values in the commit message.
- [ ] **Step 4: Run** `npm test` and confirm PASS.
- [ ] **Step 5: Commit** `feat(content): Dominance Drive and Caretaker Overdrive with stand-ins for Smother and co-command`.

### Task 15: Publicity in the engine

**Files:**
- Create: `src/engine/bonds/publicity.ts`, `tests/engine/bonds/publicity.test.ts`
- Modify: `src/engine/relations/{graph,proposals}.ts` and `src/engine/discipline/undo.ts` (call `syncPublicity(draft, reg, unitId)` after every `enterState(` call and after an UNDO restores a state; it inits on entering the romantic tier and clears on leaving), `src/engine/actions/bonds.ts` (`bonds/set_publicity`), `src/engine/actions/{scene,comms}.ts` (`rollReveal` beside `rollDiscovery`), `src/engine/discipline/demands.ts` (`publicityMismatch` condition), `src/engine/discipline/record.ts` (record `+4` via the existing `addRecord`), `src/bonds/directives.ts` (`publicity:*`)

**Interfaces:**
- Consumes: `bondOf`, `bondTierOf`, `decideLead` result in `scene.lead`, `addRecord` (P9), `rollDiscovery` numbers.
- Produces:
  - `syncPublicity(draft, reg, unitId)`
  - `setPublicity(draft, reg, unitId, level, opts: { cause: 'commander'|'claimed'|'revealed' }): EngineEvent[]`
  - `rollReveal(draft, reg, rng, presentIds)`
  - `publicityMismatch(state, unitId): boolean`

- [ ] **Step 1: Write the failing tests.**
  - `entering lover takes the more private of her and the commander preference`
  - `secret_affair starts secret and is left to the P3 discovery`
  - `set_publicity against her preference applies dismissed; toward it applies listened`
  - `a mismatch enables publicity_talk and sets the directive while she is present`
  - `a secret relation is revealed by the seeded roll with others present and becomes known`
  - `going public while she leads moves the record of corporate units and the trust of autonomy units, once`
  - `setPublicity with cause claimed forces public` (acceptance 8)
  - `leaving the romantic tier clears publicity`
- [ ] **Step 2: Run** and confirm FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and confirm PASS. Name the seeded discovery tests that moved.
- [ ] **Step 5: Commit** `feat(engine): publicity of relationships, preferences and reactions`.

### Task 16: Publicity in the dossier and the analysis panel

**Files:**
- Modify: `src/ui/squad/squadTab.ts` (`bondBlock`: `PUBLICITY: <level>` chip, her preference line, a `[SECRET] [KNOWN] [PUBLIC]` chip group for the commander's choice, shown only for tier-`romantic` relations), `src/analysis/providers/bonds.ts` (`publicity`), `content/core/glossary.json` (`publicity`), `css/72-bonds.css`
- Test: `tests/ui/squad/squadTab.test.ts`, `tests/ui/analyzeCoverage.test.ts`

- [ ] **Step 1: Write the failing tests.**
  - `publicity chips show only for romantic relations and dispatch bonds/set_publicity`
  - `her preference is shown from the card`
  - `every new chip resolves in the analysis panel`
- [ ] **Step 2: Run** and confirm FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and confirm PASS.
- [ ] **Step 5: Commit** `feat(ui): publicity in the dossier`.

### Task 17: Documentation, manual checklist, final check

**Files:**
- Create: `docs/MANUAL_TEST_P9d.md`
- Modify: `docs/packages/P9d-desire-bonds.md` (status line, **Implemented as**, **Non-obvious things**, open items), `docs/00-overview.md` (§6 `Unit.bond`, `Relation.want`/`publicity`, `CampaignState.content`/`bonds`, `SceneRecord.tone`/`lead`; §8 the content-category sentence; §9 status), `docs/CONTENT.md` (two registries, `contentTags`, `bondTier`, the defect fields, demand kind `desire`, cost `night_visit`), `docs/ROADMAP-next.md` (P9d done), `CLAUDE.md` only if a new rule is needed

- [ ] **Step 1: Write `MANUAL_TEST_P9d.md`.**
  - Import a card with an assertive, high-desire profile and one with a modest profile, then re-sync.
  - CONTENT at setup with all categories off; enable one mid-campaign and see the directive in the prompt inspector.
  - Provoke a violation and use REGENERATE.
  - A romantic scene shows the lead and the three chips.
  - Raise Want with debug commands through 40/70/90.
  - Get a rule proposal; accept, negotiate and refuse it; break it.
  - Check both defects in a fight.
  - Smother blocks a run.
  - Change publicity, then go public while she leads.
- [ ] **Step 2: Write the docs.** Copy every ruling of this plan into **Implemented as**, with draft numbers marked. Open items:
  - The friends-close-ranks reaction.
  - Tokens for `no_other_tokens`.
  - Smother and co-command as stand-ins until P9c/P9b.
  - Real recall of `sceneTone` / `contentViolations` / rule events is checked only by hand.
- [ ] **Step 3: Run** `npm test && npm run typecheck`. Both must exit 0.
- [ ] **Step 4: Commit** `docs: P9d implemented-as, overview, content guide and manual checklist`.

## Self-review notes (for the plan author; executors may ignore)

- **Spec coverage:**
  - §1 → Tasks 2, 3. §2 → Tasks 1, 4, 5, 6. §3 → Tasks 7, 8. §4 → Tasks 9, 10. §5 → Tasks 11, 12. §6 → Tasks 13, 14. §7 → Tasks 15, 16.
  - Acceptance 1 → Tasks 2, 9, 11. Acceptance 2 → Tasks 1, 4, 5, 6. Acceptance 3 → Tasks 1, 4, 5. Acceptance 4 → Tasks 7, 8. Acceptance 5 → Task 9. Acceptance 6 → Tasks 11, 12. Acceptance 7 → Task 14. Acceptance 8 → Tasks 15, 16.
- **Deliberate departures from the spec:**
  - The tier field instead of a `close` state.
  - Want as a demand (user).
  - Off-combat breakdowns through `unit.breakdown.until`.
  - Smother and co-command stand-ins (user).
  - `claimed` is only the exported `setPublicity` (P9c owns the event).
  - `scene_summary` violations are logged, not shown.
- **Not unit-tested by design:** real model recall for the new output fields, real `flavor` wording, and the layout of `css/72-bonds.css` (all in `MANUAL_TEST_P9d.md`).
- **Draft numbers the author owns:** the lead weights, Want relief and band effects, rule chances and deltas, the new `eventDeltas` rows, both defects' combat numbers, publicity reactions, and every `AUTHOR TO WRITE` text (categories, rule templates, desire demand templates).
