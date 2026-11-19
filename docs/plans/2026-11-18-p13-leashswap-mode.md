# P13 LEASHSWAP Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A campaign mode, `leashswap`, in which the commander carries the controller implant. One soldier, the **warden**, holds that leash for the corporation. She has an agenda of expectations. She can countermand orders (COMPLY / ARGUE / DEFY), punish the commander (the Leash included) and, after two warnings, have the commander terminated. The commander can obey, argue, defy or plot against her. Three routes remove her: hack the implant, hand her to oversight, or her death. Each route opens an investigation that ends in a verdict. Commander death follows a death rule chosen at setup: rewind the day, or end the campaign with an epilogue.

**Architecture:**
- **Engine.** New folder `src/engine/warden/`, one file per concern:
  - `state.ts`: a leaf (types, tuning access, `leashswapOf`, `wardenOf`, `isLeashswap`, `forgetWarden`). It imports only types and `tuning`.
  - `select.ts`: corporate assignment and seeding.
  - `agenda.ts`: expectations, the fallback agenda and learning them.
  - `conflict.ts`: the closed conflict rules per expectation kind, and her alternative.
  - `override.ts`: the override roll and the answers. It is generic over an `OverrideSource` so that P15 can pass its holder.
  - `punish.ts`: commander punishments and the commander's restrictions.
  - `leash.ts`: the Leash on the commander, and the co-sign on squad Leash requests.
  - `escalation.ts`: defiance, warnings and termination.
  - `death.ts`: commander death, the death rule and `ended`.
  - `intrigue.ts`: the suspicion clock, allies, kompromat, the hack project and discovery.
  - `removal.ts`: the three routes, the investigation, remote control and verdicts.
  - `dayStep.ts`, `index.ts`.
  - Actions live in `src/engine/actions/warden.ts`, imported by `app.ts` after `actions/special`.
- **Hook points in existing code** (named in each task):
  - `engine/setup.ts` (`buildCampaign`), `setup/wizard.ts` (MODE section, warden pick)
  - `onboarding/prologue.ts` (`prologueFor` by mode)
  - `activities.ts` (`runActivity`, next to the P9b countermand), `actions/base.ts` (`roster/set_active`)
  - `actions/expedition.ts` (`expedition/start`), `dilemma/flow.ts` (`chooseDilemma`)
  - `actions/combat.ts` (`combat/order`, `combat/compel`), `actions/leash.ts` and `leash/use.ts` (co-sign; `removeFromService` → `forgetWarden`)
  - `actions/comms.ts` (`dm/send` under `no_dms`)
  - `power/standing.ts` (`computeHierarchy`) and `power/herCall.ts` (`herCallCandidates`): the warden is filtered out
  - `relations/intents.ts`, `relations/apply.ts`, `relations/vocab.ts`, `llm/calls/intentExtract.ts` (three conditional event types and the override id on `compromise_reached`)
  - `dispatch.ts` (the `campaign_ended` guard)
- **Data.**
  - New registries:
    - `wardenExpectations`: one entry per expectation kind (label, description, default weight, value affinities).
    - `commanderPunishments`: the mirror of `punishments`, with a closed effect vocabulary.
  - Existing registries gain entries:
    - `dilemmaTemplates`: `warden_report_case`, fixed;
    - `prologues`: a LEASHSWAP entry per start, with a `warden_reveal` step;
    - `flags`, `eventDeltas`, `memoryRules`, `glossary`, `lorebook`;
    - optional `roles[].tech` and `defects[].tech`.
  - State:
    - `CampaignState.leashswap?` (the mode block);
    - `CampaignState.ended?` (any campaign; only P13 writes it now);
    - `TUNING.warden`.
- **Non-engine layer.**
  - `src/warden/{controller,directives,deps}.ts` (`createWarden` / `app.warden`). The controller covers the day-start snapshot, the rewind, the epilogue, the agenda call, the judge call and the ARGUE scene.
  - `src/ui/warden/`: the WARDEN panel, override chip and card, notices, the INTRIGUE section, the END screen and the MODE section.
  - `src/analysis/providers/warden.ts`, `css/81-warden.css`.
  - LLM calls `src/llm/calls/{wardenAgenda,wardenJudge,epilogue}.ts`.
- **Chunks.** They follow `docs/ROADMAP-next.md`. Stop at the chunk boundary.
  - **Chunk (a), Tasks 1–4:** mode setup, warden selection, `warden_agenda`, warden state, the death rule with rewind or end.
  - **Chunk (b), Tasks 5–12:** conflicts and overrides (COMPLY / ARGUE / DEFY, the optional judge), commander punishments, the Leash on the commander and the co-sign, lethal escalation, the override UI and the WARDEN panel.
  - **Chunk (c), Tasks 13–18:** intrigue, the three removal routes, the investigation, remote control, verdicts, the INTRIGUE UI, docs and hand-offs.

**Tech Stack:** TypeScript 5 (strict), esbuild, zod 3, vitest (+ jsdom for UI). No new dependencies.

**Spec:** Read these before Task 1:
- `docs/00-overview.md` (§5.4).
- `docs/packages/P13-leashswap-mode.md`, including every **Interfaces already provided by** note at its end.
- The **Implemented as** of:
  - P6 (Leash, dilemmas, mutiny, `removeFromService`);
  - P9 (punishments, restrictions, `enforce`, the "roles swap, rules stay" note);
  - P9b (countermand, hierarchy, scapegoat);
  - P9c (obedience, `herPick`);
  - P9d (`compromise_reached`, lead, content categories);
  - P11 (prologues, wizard modes);
  - P12 (the suspicion-clock pattern, hidden truth, `addCommanderStress`, fixed dilemmas by context);
  - P3b (memory rules, hidden facts, `hideMessages`);
  - P7a (Knowledge, coverage).
- `docs/content/lore.md` §0. The spec calls the commander "he / him / his" throughout ("he was spared", "holds his leash", "terminates him", "the dynamic he wants"). **No text this package writes may do that** (Global Constraints).

## Global Constraints

- **English and safe text.**
  - UI text goes through `h()` / `textContent`, never `innerHTML`.
  - No text a player or the main model reads gives the commander a pronoun (lore §0); `tests/content/pronouns.test.ts` must pass.
  - The warden and the squad are "she / her".
  - The spec's "she (or oversight through her) terminates him" becomes `The controller is triggered. The commander is dead.`; "player sets the dynamic he wants" becomes a description with no pronoun.
- **Engine purity.** `src/engine/**` stays pure (`tests/architecture.test.ts`). `warden/state.ts` is a leaf, so `activities.ts`, `dilemma/flow.ts`, `combat/*`, `power/*` and `leash/use.ts` can read it without a cycle.
- **The engine decides** (overview P1–P3).
  - The engine draws from the campaign rng for: corporate-assignment ties (none: the ordering is total, see Rulings), override rolls, punishment rolls, injury rolls, co-sign rolls, the combat ARGUE roll, intrigue discovery, the ally check, the hack steps, the report dilemma and the verdict.
  - The model does only these:
    - proposes the agenda (`warden_agenda`): kinds from a closed list, weights as an enum (`low | medium | high`), `personal` text. The engine normalizes the weights and validates every kind.
    - judges a `personal:` expectation (`warden_judge`, behind a setting, off by default): returns `{ expectationId, conflict: 'none'|'minor'|'major' }`.
    - reports three event types in a scene: `conspired`, `expectation_kept` and `expectation_broken`. It also reports `compromise_reached` with an `overrideId`. Each is offered only when there is something it can be about (Rulings).
    - writes the epilogue (`epilogue`, main profile) from chronicle lines.

    Every number the model returns is ignored.
- **The mode is read by state, never by a world option or trait id.**
  - `isLeashswap(state)` is `state.leashswap !== undefined`.
  - Expectation kinds are read by `kind`, punishments by effect `type`, roles and defects by the `tech` field, dilemma templates by `contexts`, and options by their `id` slug (the P9b precedent).
  - No engine or UI file names an expectation entry id or a punishment entry id; the code knows only the kind and effect vocabularies.
- **Rng discipline.**
  - With no `leashswap` block, no new draw happens anywhere, and every existing seeded test stays byte-identical. Task 18 guards this with `tests/warden/unaffected.test.ts`.
  - Inside the mode, an override roll draws only when `conflictOf` finds a weight > 0.
  - A task whose change moves an existing seeded test **stops and reports** (CLAUDE.md), unless the test sets up a LEASHSWAP campaign on purpose.
- **Hidden truth.** These never reach an event payload, a toast, a panel or a reading:
  - the content, kind or weight of an unknown expectation (`known: false`);
  - the intrigue suspicion value;
  - her co-sign chance;
  - the verdict chance;
  - the hack's discovery chance.

  The panel shows `? UNKNOWN EXPECTATION` rows (the count only). Readings say `An unseen threat` for suspicion and show the investigation as a band. A `registerKnowledgeRule` hides the related facts and flags. Each value is a sentinel in `tests/fixtures/analyze/hidden.ts`.
- **Old saves and other modes.** Every new field is optional and the version stays 1.
  - Absent `leashswap` means the default mode: no warden, no override, no co-sign, no commander punishment, and the commander cannot die.
  - Absent `ended` means the campaign is running.
- **Ids.**
  - Directive ids start with `warden:` (`warden:override`, `warden:argue`, `warden:romance`, `warden:remote`, `warden:warning`, `warden:reveal`). Extend `RESERVED` in `tests/power/herCallDirectives.test.ts` with `warden:`, and check that no P13 id starts with an older reserved prefix.
  - Engine event types (never offered to the model; added to `ENGINE_EVENT_TYPES`, each with an `eventDeltas` row and a `journal` phrase):
    - `warden_complied`: the warden's own relation, on COMPLY;
    - `warden_defied`: on DEFY;
    - `warden_betrayed`: intrigue discovered;
    - `warden_removed_by`: squad reactions; valueAxes are given by the call site.
  - Model-reportable event types (added to `EVENT_TYPES`, each with an `eventDeltas` row): `conspired`, `expectation_kept`, `expectation_broken`.
  - Reserved (emitted) event types, added to `RESERVED_EVENT_TYPES`:
    - setup and agenda: `leashswap_started`, `warden_assigned`, `warden_agenda_set`, `expectation_learned`;
    - overrides: `warden_override`, `override_answered`, `override_compromise`, `override_argue_roll`;
    - punishment and Leash: `commander_punished`, `commander_restricted`, `commander_leashed`, `leash_cosigned`, `leash_cosign_denied`;
    - escalation and death: `warden_warning`, `commander_terminated`, `commander_died`, `campaign_ended`;
    - intrigue: `intrigue_action`, `ally_won`, `ally_refused`, `kompromat_found`, `hack_step`, `controller_dark`, `intrigue_discovered`;
    - removal: `warden_removed`, `investigation_opened`, `remote_control_started`, `verdict`.
  - Flags (`flags.json`):
    - relation scope: `warden_ally` (`leverage: false`), `warden_knows_ally`;
    - commander scope: `commander_implant_dark`, `commander_watched`, `commander_convicted`;
    - world scope: `warden_reassigned`.
  - Unit status: `reassigned` joins `Unit.status`. `isLiving` treats it as not in service, like `deserted`. `removeFromService` accepts it.
  - Glossary ids:
    - `leashswap`, `warden`, `warden_expectation`, `warden_satisfaction`, `warden_defiance`, `warden_override`;
    - `commander_punishment`, `commander_leash`, `leash_cosign`, `lethal_escalation`, `death_rule`;
    - `intrigue`, `kompromat`, `implant_hack`, `investigation`, `remote_control`, `verdict`;
    - `setting_warden_judge`.
- **Analysis (overview P12).**
  - Every new stat, chip, option and card carries `data-analyze`.
  - `wardenExpectations` and `commanderPunishments` join `DESCRIBED_REGISTRIES` / `PLAYER_VISIBLE`.
  - Live values get providers in `src/analysis/providers/warden.ts` that read through `Knowledge`.
- **Memory check** (CLAUDE.md). The verdict for every new event:
  - **Remembered** (`memoryRules` entry plus resolver, Task 17), each with `about`, `audience`, `spread` and `importance`:
    - `override_answered` with `answer: 'defy'`: the scene, present units, or `squad` when witnessed;
    - `commander_punished` with severity ≥ 3: public;
    - `commander_leashed`: squad, fast;
    - `warden_warning`: about the warden, the warden only;
    - `warden_removed`: one rule per route; the hack route's fact is about the commander, audience the allies; report and death are public;
    - `verdict`: public;
    - `ally_won`: about the ally, audience `[ally]`, spread none.
  - **Not remembered:**
    - `warden_assigned`: `seedWarden` already writes a public pinned fact.
    - `intrigue_action`, `hack_step` and `kompromat_found`: bookkeeping. The kompromat site already writes the fact.
    - `leash_cosigned` / `leash_cosign_denied`: the Leash log already records them.
    - `expectation_learned`: the commander's own knowledge, not something the squad remembers.
    - `commander_died` / `campaign_ended`: the campaign is over, or the day is rewound.
    - `campaign_ended` writes a chronicle line with `audience: '*'`.
  - **Journal.** Every new relation event (`warden_complied`, `warden_defied`, `warden_betrayed`, `warden_removed_by`, `conspired`, `expectation_kept`, `expectation_broken`) gets an `eventDeltas[].journal` phrase (AUTHOR TO WRITE).
  - **Prompt.** No `group: 'memory'` provider is added; the warden context is an ordinary directive (`warden:*`). Chronicle lines this package writes all carry an `audience`.
- **Drafts.** Every number below is a draft in `TUNING.warden`, and every authored text is marked `AUTHOR TO WRITE`. Expectation kinds and weights, punishment numbers, defiance thresholds, the controller lore and the intake wording are the author's (spec open decisions).
- **Build output.** `npm test` rebuilds `dist/index.js` and `style.css`; commit both with every task. Baseline before Task 1: **387 files, 6408 tests, all passing** (2026-11-18).

## Where the plan rules on the spec (read before Task 1)

Rulings marked **(user)** were answered by the user on 2026-11-18. Task 18 copies all of them into the spec's **Implemented as**.

### Mode, state and setup (§1)
- **State.**
  - `CampaignState.leashswap?: LeashswapState`:
    - `deathRule: 'rewind_day' | 'campaign_end'`;
    - `warden?: WardenState` (absent while there is none: during the investigation, or after a cleared verdict);
    - `intrigue: IntrigueState`;
    - `removal?: RemovalState`;
    - `remote?: { sinceDay: number }`;
    - `status: 'held' | 'investigation' | 'free'`.
  - `WardenState`:
    - `unitId`, `assignedBy: 'player' | 'corporation' | 'oversight'`, `sinceDay`;
    - `expectations: Expectation[]`, `agenda: 'pending' | 'model' | 'fallback'`;
    - `satisfaction` (0–100, start 60), `defiance` (0–100, start 0);
    - `warnings: Array<{ level: 1 | 2; day: number }>`;
    - `leashLeft`, `leashRefreshDay`;
    - `override?: OpenOverride`, `compelled?: boolean`;
    - `restrictions: CommanderRestriction[]`, `punishLog: PunishRecord[]` (newest 20).
  - `Expectation = { id, kind: ExpectationKind, weight, source: 'card' | 'values' | 'corporate', known: boolean, text?: string /* personal only */ }`.
  - `CampaignState.ended?: { day: number; cause: 'terminated' | 'executed'; epilogue?: string }`.
- **Death rule (user).** It is chosen on the setup MODE section and stored in `leashswap.deathRule`; it cannot be changed later. The default depends on the combat difficulty at creation: `story`/`normal` → `rewind_day`, `hard` → `campaign_end`.
- **Choosing the mode.**
  - A MODE section on the WORLD PARAMETERS step (the step before the commander file) offers `DEFAULT` / `LEASHSWAP` and, under LEASHSWAP, the death rule.
  - The warden is picked on the UNITS step, after the squad is chosen: a select of the chosen units plus `CORPORATE ASSIGNMENT` (default).
  - `SetupResult.mode?: { kind: 'leashswap'; deathRule; warden: { by: 'player'; index: number } | { by: 'corporation' } }`. `index` is the position in `SetupResult.units`. `validateSetup` refuses an index out of range, and refuses LEASHSWAP with no named unit.
- **Corporate assignment** (`corporateWardenPick(state, reg, exclude?)`), among named units with `status: 'active'`:
  1. highest `values.corporate`;
  2. then lowest `autonomy`;
  3. then lowest Impunity (`impunityOf(…).value`, 0 when null);
  4. then squad order.

  A total order, so no draw.
- **Seeding.** `seedWarden(draft, ctx, { unitId, assignedBy })` runs in `buildCampaign` after `seedSpecialTraits` and before `ensureLeash`. It:
  - sets satisfaction 60 and `leashLeft = TUNING.warden.leash.weekly` (2);
  - writes the `fallbackAgenda` at once (`agenda: 'fallback'`), so the campaign is playable without a model; the controller may replace it once with the model's (`warden/agenda`);
  - emits `warden_assigned`;
  - writes a public pinned fact `{Name} holds the commander's controller.` This is the site's own fact, so `warden_assigned` gets no memory rule (see the memory check).
- **The warden is outside the hierarchy.**
  - `computeHierarchy` and `standingOf` filter `wardenOf(state)?.unitId` before ranking (P9b note).
  - `herCallCandidates` also filters her: her own calls are overrides.
- **Reveal (P11).**
  - `PrologueSchema` gets optional `mode: 'leashswap'`. `prologueFor(reg, startId, mode?)` prefers the entry with that start and mode, and falls back to the one without a mode.
  - The core pack adds `prologue_vesper_leashswap` / `prologue_kestrel_leashswap`, each `extends` its start's prologue. They insert a `warden_reveal` step (kind `scene`, voice `corporate`) after `lineup`, with the warden as the only participant (new `participants: 'warden'` value on the step) and a directive (AUTHOR TO WRITE).
  - Veteran mode (no prologue) shows a one-time `corporate` notice card `WARDEN ASSIGNED` at the first hub render (`leashswap.revealed` flag in the controller: `warden/revealed` action).
- **Lore.** Lorebook entry `controller_implant` (constant while the mode is on, AUTHOR TO WRITE) and a context line `warden:reveal` until revealed.

### Expectations (§2)
- **Kinds** (closed, `EXPECTATION_KINDS`): `protect_squad`, `no_civilian_harm`, `meet_quota`, `obey_oversight`, `keep_me_close`, `no_romance_with_others`, `personal`.
- **Registry `wardenExpectations`.** One entry per non-personal kind: `{ id, kind, label, description, weight: 'low'|'medium'|'high', values?: Partial<Record<ValueAxis, number>>, corporate?: boolean }` (AUTHOR TO WRITE).
- **Fallback agenda** (`fallbackAgenda(state, reg, unitId)`, no draw):
  - Score each entry by `Σ values[axis] × her value` + (`corporate` ? her `values.corporate` : 0).
  - Take the top 3 (registry order breaks ties), plus `obey_oversight` when her `values.corporate ≥ 1` and it is not taken.
  - Weights `low 1 / medium 2 / high 3` are normalized to sum 1 and rounded to 0.01; the last absorbs the rest.
  - `known`: the first entry by weight is `known: true`, the rest `false`.
- **`warden_agenda`** (mechanic, budget 800).
  - Input: her card summary, values, the corporation's summary and the closed kinds.
  - Output: `{ expectations: [{ kind, weight, source, text? }] }`, 3–5 items, `personal` text ≤ 80 chars.
  - Validation: drop unknown kinds, keep one per non-personal kind, at most 2 `personal`, then 3–5 remain or the answer is refused. Then normalize, set the first `known`, and dispatch `warden/agenda { expectations }` with `expectChatId`.
  - Only while `agenda === 'fallback'` and no override has fired yet (otherwise refused: `The agenda is already in play.`).
- **Learning.** An expectation becomes `known` by:
  - (a) an override citing it (the chip names it);
  - (b) `expectation_kept` / `expectation_broken` reported on it;
  - (c) a Secret Frequency intercept of kind `fact`: P12 is unchanged;
  - (d) a `dig` intrigue action (Task 14).

  Event `expectation_learned { expectationId }`.

### Conflicts and overrides (§3, §4) (user: engine rules plus an optional model judge)
- **`WardenOrder`** (what can be overridden):
  - `{ kind: 'activity', activityId, companionId?, unitIds? }`
  - `{ kind: 'roster', activeIds }`
  - `{ kind: 'expedition', missionId?, unitIds }`
  - `{ kind: 'dilemma', index }` (`major` / `defining` only)
  - `{ kind: 'combat_order', orderId, targetCid? }`
- **Engine rules** (`conflictOf(state, reg, order, judged?)` → `{ expectationId, weight } | null`). The highest weight among the matching expectations wins. Per kind:
  - `keep_me_close`: an expedition or roster without her; an activity with a companion other than her.
  - `protect_squad`:
    - an expedition with a party unit that is injured or has stress ≥ 70;
    - a combat `authorize_ultimate` or `hold_the_line` while an ally is at ≤ 25 % HP;
    - a dilemma option with a `unit_event` effect of severity ≥ `major` and a negative `computeDeltas` for its targets, or a stress effect on units.
  - `no_civilian_harm`: a dilemma option with `valueAxes` `mercy −1`.
  - `meet_quota`:
    - the activity `rest` or `mess` (read by the activity's new optional `idle: true` field, not by id) while a mission on the board has `deadlineDay − day ≤ 2`;
    - a dilemma option whose effects lower own-corporation standing or cost `credits`.
  - `obey_oversight`:
    - a dilemma option lowering own-corporation standing or with `valueAxes` `corporate −1`;
    - a combat `fall_back` (a retreat order).
  - `no_romance_with_others`: an activity whose companion is in a romantic-tier state (`bondTier === 'romantic'`), the warden excluded.
  - `personal`: never by rule. Only the judge (`judged`) can name it.

  The conflict weight is the expectation's weight. Combat orders are read by their order entry's new optional `wardenRule?: 'retreat' | 'risk'` field, never by id.
- **Optional model judge (user).**
  - Setting `wardenJudge` (default **off**, SYS › Relationships).
  - When on, and she has a `personal` expectation, the UI path calls `warden_judge` (mechanic, budget 120) before dispatching an out-of-combat overridable action. Input: the order in words, her expectations as `{ id, text }`.
  - The answer goes in the payload as `wardenJudged: { expectationId, conflict }`. The engine accepts it only for a `personal` expectation of the current warden, and maps `minor` to 0.5 × weight, `major` to 1 × weight. The higher of rule and judge wins.
  - A failed or late call dispatches without it (fail soft). Combat never calls it (overview P7).
- **Override roll** (`rollOverride(draft, ctx, order, source)`):
  - **Generic over the holder.** `OverrideSource = { kind: 'warden'; unitId; authority: number /* 0..1 */; leniency: number /* 0..1 */; expectations }`. The warden's source is `authority = (100 − satisfaction) / 100` and `leniency = 1 − 0.5 × max(0, her affinity) / 100`.
  - **Chance** (`overrideChance(weight, source)`) = `clamp(weight × authority × leniency × TUNING.warden.override.scale (2.0), 0, 0.9)`.
  - **When nothing is drawn:**
    - no conflict;
    - she is not standing (combat), not in service, or on a day she obeys the commander (P9c `unitObeys`);
    - an override is already open;
    - the order is hers to give anyway (an activity whose only named unit is her);
    - in remote control: there is no unit, so remote control never overrides; its punishments are automatic (Task 16).
  - **On a hit:**
    - nothing of the order happens and no slot is spent;
    - `override = { id, order, expectationId, alternative, day, slot, context: 'base' | 'combat' | 'dilemma' }`;
    - the expectation becomes `known`;
    - event `warden_override { overrideId, expectationId, context }`.
  - **One per slot.** `override.day/slot` stale ⇒ dropped like a P9b countermand.
- **Her alternative** (`herAlternative`):
  - activity: the same activity with her as companion (`keep_me_close`, `no_romance_with_others`), else the activity `work` (the first activity with the new optional `quota: true`, for `meet_quota`), else nothing (`hold`: the slot is not used);
  - roster / expedition: the same list with her added in place of the last unit (`keep_me_close`), or without the injured or stressed units (`protect_squad`);
  - dilemma: `herPick` of P9c with her id, else the first enabled option that does not conflict;
  - combat: `hold` (the order is not given; CP are not spent).

  The chip shows it as text: `WARDEN OVERRIDE — {alternative label}`.
- **Answers** (`warden/answer { overrideId, answer: 'comply' | 'argue' | 'defy' }`):
  - **COMPLY:**
    - her alternative runs, with the order re-dispatched internally with `wardenChecked: true` (like P9b's `countermandChecked`);
    - satisfaction +4;
    - defiance −3;
    - `warden_complied` (minor) on her.
  - **DEFY:**
    - the commander's order runs (`wardenChecked: true`);
    - defiance `+ round(30 × weight)`;
    - satisfaction `− round(20 × weight)`;
    - `warden_defied` (moderate; major at weight ≥ 0.4);
    - then a punishment roll (Task 9), then escalation (Task 11).
  - **ARGUE outside combat:**
    - opens a private scene with her (`app.warden.argue()` → `scene/start { origin: 'event', participants: [warden], consumesSlot: false }`);
    - the override stays open with `arguing: sceneId`;
    - directive `warden:argue`: `{Name} has overridden the commander's order: {order}. She wants: {alternative}. She can be talked round only by a real compromise.`
    - An extracted `compromise_reached` with `overrideId` resolves it: **the commander's order runs, no defiance, satisfaction unchanged**. A fact `{Name} and the commander agreed: {text}.` (about her, audience present, from the site; no rule). Event `override_compromise`.
    - A scene that ends without it leaves the override open with only COMPLY and DEFY (`argued: true`).
  - **ARGUE in combat (user):**
    - one seeded roll on the better of the commander's Authority and Empathy against her rank: P9b's challenge formula `clamp(0.5 + 0.12 × (rank − herRank), 0.15, 0.85)`, with `herRank = clamp(round((satisfaction ≤ 50 ? 4 : 3) + affinity / 100), 1, 5)`;
    - win: the order runs with no defiance; lose: her alternative runs with no defiance;
    - event `override_argue_roll { won }`; no scene, no model call.
  - **Compel.** While `compelled` (the Leash on the commander, Task 10), only COMPLY is accepted. The first override or `major`/`defining` dilemma after it clears `compelled`.
- **Dilemma override.** `chooseDilemma` calls `rollOverride` for a `major`/`defining` dilemma before applying anything. On a hit the dilemma stays `presented` and the override's card shows on the dilemma (lock: her alternative highlighted). COMPLY / DEFY / ARGUE resolve as above by calling `chooseDilemma` with `wardenChecked`.
- **The squad's Leash requests through her (user: engine roll).**
  - `leash/compel`, `leash/suppress`, `leash/terminate` and `combat/compel` ask `rollCosign` first, while a warden is in service and she is not the target.
  - **Chance** = `clamp(0.5 + 0.004 × (satisfaction − 50) + 0.1 × her values.corporate − 0.1 × her values.mercy + 0.001 × her Affinity with the commander, 0.1, 0.95)` (drafts in `TUNING.warden.cosign`). There is no unit-to-unit relation, so the target's identity matters only when it is she.
  - A request against herself is denied without a draw.
  - A denial spends no authorization, files a `denied` log entry with `cc: 'warden'` and emits `leash_cosign_denied`.
  - A co-sign emits `leash_cosigned`; the request then runs as today.
  - With no warden in service (investigation, free), there is no co-sign and nothing is drawn.

### Commander punishments and the Leash on the commander (§3)
- **Registry `commanderPunishments`**, mirroring `punishments`: `{ id, label, description, severity 1–4, defianceDelta (≤ 0: it deters), satisfactionDelta (≥ 0), effects: CommanderPunishmentEffect[], contentTags }`.
- **Closed effect vocabulary:**
  - `{ type: 'commander_stress', amount }`: `addCommanderStress`;
  - `{ type: 'restrict', what: 'no_leave' | 'no_dms', days }`: `no_leave` is P9's meaning, applied to the commander (no activity with a companion apart from `talk` and `medbay`, read from the same `NOT_LEAVE` list, now exported);
  - `{ type: 'lose_slots', min, max }`: `consumeSlots`, one draw for the count; at most to the evening;
  - `{ type: 'squad_record', amount }`: `addRecord(+amount)` on every named living unit except her (public humiliation lowers the commander's standing with the squad);
  - `{ type: 'injury', chance, perEndurance, days }`: one draw at `chance − perEndurance × endurance` → `commander/injure { days }`;
  - `{ type: 'leash', kind: 'compel' | 'suppress' }`.
- **Core entries** (drafts, AUTHOR TO WRITE wording):
  - `reprimand`: sev 1, defiance −5, `commander_stress 3`;
  - `privilege_revoked`: sev 2, defiance −8, `restrict no_leave 1` + `restrict no_dms 1`;
  - `confinement`: sev 3, defiance −12, `lose_slots 1–2`;
  - `public_humiliation`: sev 3, defiance −12, `squad_record 6`, `commander_stress 6`;
  - `pain_burst`: sev 3, defiance −15, `commander_stress 15`, `injury 0.35 / 0.05 / 1`;
  - `leash_compel`: sev 4, defiance −20, `leash compel`;
  - `leash_suppress`: sev 4, defiance −25, `leash suppress`.
- **Punishment roll after DEFY** (`punishRoll`):
  - one draw at `0.5 + 0.3 × weight − 0.2 × max(0, affinity) / 100`;
  - a hit picks by severity band from defiance: < 25 sev 1, < 50 sev 2, < 75 sev 3, else sev 4 (the first entry of that severity in registry order; no further draw);
  - a Leash punishment needs `leashLeft ≥ 1`, else the next lower severity.
  - An applied punishment satisfies her: satisfaction `+ satisfactionDelta`. It is logged and emits `commander_punished { punishmentId }`, with a corporate-voice notice.
- **The Leash on the commander:**
  - `compel` sets `warden.compelled = true` (the next override or major/defining dilemma accepts only COMPLY) and costs `leashLeft − 1`.
  - `suppress` consumes the rest of the day (to the night) with `consumeSlots`, sets commander stress +10 and costs `leashLeft − 1`.
  - Each emits `commander_leashed { kind }`.
  - `leashLeft` refreshes to `TUNING.warden.leash.weekly` (2) on the squad Leash's refresh day, in the same `mission_deadlines` step.
- **Restrictions read** (`commanderRestriction(state, use, activityId?)` → reason | null):
  - `activity/do` with a companion (`no_leave`);
  - `dm/send` (`no_dms`): `The warden has revoked the commander's messages until day {n}.`
  - Unused in other modes: absent `leashswap` → null.

### Lethal escalation and death (§3, §1) (user: termination and the verdict only)
- **Defiance:**
  - decays −2 a day (day step);
  - a COMPLY lowers it by 3;
  - punishments lower it by their `defianceDelta`.
- **Warnings** (`checkEscalation` after every defiance rise):
  - crossing 50 with no warning → warning 1 `{ level: 1, day }`;
  - crossing 75 with one warning → warning 2, only on a day after warning 1 (the same day: defiance is clamped to 74);
  - reaching 100 with two warnings and `day > warning 2 day` → termination, otherwise clamped to 99.
  - The spec's "never within the same day as the first warning" is held by both clamps.
  - Each warning emits `warden_warning { level }` and a notice. The directive `warden:warning` lasts until defiance falls below 50.
- **Termination** (`terminateCommander`): `commander_terminated`, then `commanderDies(draft, ctx, 'terminated')`.
- **Combat.** Being downed in combat stays an injury (user).
- **`commanderDies(draft, ctx, cause)`:**
  - **`rewind_day`:** the engine emits `commander_died { rule: 'rewind_day', cause }` and changes nothing else. The app restores the day-start snapshot (Task 4). Nothing is written to memory: the restored state never had it.
  - **`campaign_end`:** `ended = { day, cause }`, a chronicle line with `audience: '*'`, and `campaign_ended`. `dispatch` then refuses every action except `debug/*` and `campaign/epilogue` with `{ code: 'campaign_ended' }` (read-only), so no state ever changes again.
  - **Execution by verdict** (`cause: 'executed'`) **always** ends the campaign, under either rule: a rewind would replay the same verdict from the same rng.
- **Day-start snapshot** (app, not engine):
  - On every `day_started`, and once right after `buildCampaign`, the controller writes `{ chatId, day, chatLength, state }` under the second metadata key `alius_day_start` (written only while `leashswap` exists, which roughly doubles the metadata of a LEASHSWAP chat; documented in the manual test).
  - **Rewind (user: hide the chat):** on `commander_died` with `rewind_day`:
    1. `restoreSnapshot(snap.state, current)`;
    2. `st.hideMessages(snap.chatLength, chatLength() − 1)`, and the returned runs are added to `memory.hidden` with `memory/hidden` so SYS can unhide them;
    3. a `terminal` toast `REWIND — day {n} begins again.`.

    A missing or foreign snapshot (another chat id) falls back to `campaign_end`, via `warden/no_snapshot` → `commanderDies` with the rule overridden.
- **Epilogue.**
  - `epilogue` (main, budget 700): input the chronicle lines with `audience: '*'` (newest 60), the dossier of the world and the cause. Output: plain text, ≤ 2400 chars.
  - Fallback: the lines joined under a fixed heading.
  - Stored by `campaign/epilogue { text }` (only once, only when `ended`).
  - The END screen (`renderEndScreen`) replaces the hub: corporate voice, `CAMPAIGN CLOSED`, the epilogue, the day and cause, and EXPORT (the existing export). Nothing else can be pressed.

### Intrigue (§4) (user: allies in scenes, the rest as slot actions)
- **Suspicion clock.** `intrigue.suspicion` (0–100, hidden, P12 pattern):
  - decays −3 a day;
  - rises by the action's `noise`;
  - **discovery draw** after each action at `suspicion / 200`, certain at ≥ 100.
- **Allies (scene).** Model event type `conspired`:
  - actor commander, target a present named unit who is not the warden;
  - the commander enlists her against the warden;
  - offered only in LEASHSWAP, while a warden is in service, the warden is **not** present, and the scene has at least one present unit who is not an ally.
  - The engine checks (`tryAlly`):
    - one draw at `clamp(0.2 + 0.006 × (trust − 50) + 0.1 × values.autonomy − 0.1 × values.corporate, 0.05, 0.9)` (no unit-to-unit relation exists to read);
    - a hit: flag `warden_ally`, `ally_won`, suspicion +10;
    - a miss: `ally_refused` and suspicion +20. With `values.corporate ≥ 2` she also reports it: a discovery at once.
  - At most one `conspired` per unit per day.
- **Slot actions** (`intrigue/act { action, unitId? }`; each spends 1 slot through `consumeSlots`; refused in a scene, a run or a combat, and while no warden is in service):
  - **`dig`** (noise 15):
    - needs an ally (`unitId` with `warden_ally`) or Cunning ≥ 3;
    - finds kompromat: the newest fact about the warden that is `hiddenFromCommander` (P3b) is revealed to the commander and tagged `kompromat`;
    - else one authored line (`TUNING.warden.kompromat.lines`, AUTHOR TO WRITE, `fnv1a(day|seq)`) becomes a new fact `about [warden]`, `tags ['kompromat']`, `knownBy ['commander', unitId?]`, `pinned`;
    - if she has an unknown expectation, it is learned instead on a `fnv1a` parity (no draw).
  - **`hack_step`** (noise 20; Task 14).
- **Discovery** (`intrigueDiscovered`):
  - satisfaction −40, defiance +25 (escalation runs);
  - `warden_betrayed` (extreme) on her;
  - an immediate punishment of the highest severity allowed (no punish draw; the Leash still needs `leashLeft`);
  - every ally gets `warden_knows_ally`;
  - hack progress resets to 0;
  - suspicion is set to 40.

  Kompromat facts stay. Event `intrigue_discovered { cause }`.

### Removal (§5)
- **Hack** (`hack_step`):
  - **Gates:** workshop ≥ 3 and medbay ≥ 3 (`facilityLevel`), 5 plyx, and an ally with a `tech` role or defect (new optional `roles[].tech` on `specialist` and `support`, `defects[].tech` on `sensor_ghosting`). The ally is named in the payload.
  - **Steps:** 3 (`TUNING.warden.hack.steps`). Each step pays plyx, consumes a slot and adds noise 20.
  - **Failure:** a step that triggers discovery fails. It costs a `pain_burst` (applied directly, Leash rules aside) and the discovery consequences.
  - **Success:** the third successful step → `controller_dark`, flag `commander_implant_dark`, removal route `hack`.
- **Hand her to oversight:**
  - `intrigue/report` (no slot) needs ≥ 3 kompromat facts (`TUNING.warden.kompromat.needed`). It opens the fixed dilemma context **`warden_report`** (scale `defining`, template `warden_report_case`, authored only, queued like P12's cases).
  - **Options by id:**
    - `submit`: one draw at `clamp(0.4 + 0.1 × (kompromat − 3) + 0.05 × (Cunning − 1), 0.1, 0.85)`. A hit → removal route `report`, her status `reassigned`. A miss → discovery.
    - `withdraw`: nothing.
  - The dilemma's own option effects are authored (AUTHOR TO WRITE). The engine's part is `wardenReportChoice` after `dilemma/choose`, read by context and option id (the P12 `debtsChoice` pattern).
- **Her death:**
  - any warden death (combat, a mutiny fight, a desertion) or termination by the squad Leash → route `death`;
  - a squad termination of her is always denied at the co-sign, so in practice the route opens on her death or her desertion (a desertion counts as route `death`, loud).
  - Hook: `removeFromService` and `finalizeCombat` (death) call `wardenGone(draft, ctx, how)`.
- **Consequences of any removal** (`startRemoval(draft, ctx, route)`):
  - `warden` is deleted (her unit stays, or is gone);
  - `status: 'investigation'`;
  - `removal = { route, day, clockId }`;
  - a world clock `investigation` (visible, segments: hack 10, report 6, death 4; +1 segment per day in the day step);
  - `remote = { sinceDay: day }`;
  - **squad reactions** by values, one `warden_removed_by` (moderate) per named living unit:
    - valueAxes `autonomy +1`, `corporate −1` read as liberation;
    - `mercy −1` and `ingroup −1` when the warden's own `values.ingroup ≥ 1` ("she was close to the squad"; there is no unit-to-unit relation to read);
    - for the route `report`, also `corporate +1` (it was by the book).

    `computeDeltas` scores each unit by her own values (no new rule).
  - Event `warden_removed { route }` and `investigation_opened`.
- **Remote control** (`remote` set):
  - fixed expectations `meet_quota` 0.6 and `obey_oversight` 0.4, all known;
  - no override and no negotiation;
  - **automatic punishments** in the day step: no mission completed in the last 7 days → `reprimand`; a mission failed yesterday → `pain_burst`; defiance never rises (there is no one to defy).
  - The directive `warden:remote` and a corporate notice at start.
- **Verdict** when the clock fills (day step): one draw at
  - `clamp(base + 0.05 × (Cunning − 1) − 0.15 × (discovered ? 1 : 0) + 0.05 × allies, 0.1, 0.9)`
  - with `base`: hack 0.6, report 0.75, death 0.4.
  - **Cleared:** `status: 'free'`, `remote` deleted, flag `commander_watched`; no warden and no co-sign from now on; the implant is dormant.
  - **Convicted (user):**
    - flag `commander_convicted`;
    - a new warden is assigned by `corporateWardenPick` (`assignedBy: 'oversight'`, satisfaction 40, the fallback agenda; the agenda call runs again), with `status: 'held'`;
    - with no eligible unit → `commanderDies(…, 'executed')`, which ends the campaign;
    - no NPC officer in P13.
  - Event `verdict { outcome }`, a public fact.

### Romance with the warden (§7)
- While the warden is in a romantic-tier state, a derived directive `warden:romance`: `{Name} holds the commander's controller. Any tenderness between them runs through that power; she knows it and so does the commander.` (AUTHOR TO WRITE).
- `no_romance_with_others` judges activities by rule (above). In scenes it is judged by `expectation_broken`: offered when she has that expectation known or not, and the scene's tone is romantic with a present unit who is not the warden. The P3 multi-romance rules are unchanged.

## Review Focus

1. **A default-mode campaign plays byte-identical to today.** No `leashswap` block means no draw, no co-sign, no override, no restriction and no death. Test in Task 18 (`no leashswap: a seeded week of day ends, scenes, DMs, a dilemma, a combat and a squad Leash request is identical`), plus each hook task's own `no mode: no draw` test.
2. **A stale override.** The slot passes, the scene closes, a combat ends, or the dilemma is answered elsewhere while an override waits. The answer is refused with `There is no override to answer.` and nothing runs twice; a DEFY after a chat switch does nothing. Tests in Task 6 (`an override of a past slot is dropped`, `COMPLY runs the alternative exactly once`).
3. **Rewind with a missing, foreign or late snapshot.** Cases: the snapshot belongs to another chat; the chat is shorter than `chatLength`; the death fires during a combat or an expedition. The rewind must restore the right state or fall back to `campaign_end`, never write into another chat, and hide only the runs `hideMessages` returned. Tests in Task 4 (`a foreign snapshot ends the campaign`, `rewind hides from the stored length`).
4. **The warden leaves service while something points at her.** Cases: an open override, an ARGUE scene, an open `warden_report` dilemma, a co-sign mid-combat, she is the companion of a pending alternative. `removeFromService` → `forgetWarden` and `wardenGone` must clean everything and start the removal once (not twice for death plus status). Test in Task 15 (`the warden dies with an open override and a report pending`).
5. **Hidden truth leaking.** An unknown expectation's kind in a chip, an event or a reading; suspicion in the ledger or a toast; the co-sign or verdict chance in a reading. Tests in Task 12 (`an unknown expectation renders only as ?`) and Task 17 (sentinels for suspicion, chances and unknown expectations).

---

## Chunk (a): mode setup, warden, agenda and the death rule

### Task 1: Mode state, the warden leaf, corporate assignment and seeding

**Files:**
- Create: `src/engine/warden/state.ts`, `src/engine/warden/select.ts`, `src/engine/warden/index.ts`
- Modify: `src/engine/state/types.ts` (`CampaignState.leashswap?`, `CampaignState.ended?`, `Unit.status` + `reassigned`), `src/engine/economy.ts` (`isLiving`), `src/engine/tuning.ts` (`TUNING.warden`), `src/engine/setup.ts` (`SetupResult.mode`, `validateSetup`, `buildCampaign`), `src/engine/power/standing.ts`, `src/engine/power/herCall.ts`, `src/engine/leash/use.ts` (`removeFromService` → `forgetWarden`, `reassigned`), `src/content/schemas.ts` (`RESERVED_EVENT_TYPES`), `content/core/flags.json`
- Test: `tests/warden/select.test.ts`

**Interfaces:**
- Produces:
  - `type DeathRule = 'rewind_day' | 'campaign_end'`
  - `type ExpectationKind = 'protect_squad'|'no_civilian_harm'|'meet_quota'|'obey_oversight'|'keep_me_close'|'no_romance_with_others'|'personal'`, `EXPECTATION_KINDS`
  - `interface Expectation`, `interface WardenState`, `interface LeashswapState`, `interface IntrigueState { suspicion: number; seq: number; lastAllyDay: Record<string, number>; hack: { step: number }; discovered: number }`, `interface RemovalState { route: 'hack'|'report'|'death'; day: number; clockId: string }` (fields per Rulings)
  - `leashswapOf(state): LeashswapState | null`, `isLeashswap(state): boolean`, `wardenOf(state): WardenState | null` (null unless `status === 'held'` and a warden exists), `wardenUnitId(state): string | null`
  - `forgetWarden(draft, unitId): void` (drops an open override that names her and her `lastAllyDay`; the removal itself is Task 15's `wardenGone`)
  - `corporateWardenPick(state, reg, exclude?: string[]): string | null`
  - `seedWarden(draft, ctx, p: { unitId: string; assignedBy: WardenState['assignedBy'] }): EngineEvent[]`
  - `SetupResult.mode?: { kind: 'leashswap'; deathRule: DeathRule; warden: { by: 'player'; index: number } | { by: 'corporation' } }`
- Consumes: `impunityOf` (P9), `computeHierarchy` (P9b), `addFact` (P3b), `fallbackAgenda` (Task 3; until then `seedWarden` writes `expectations: []`, and Task 3 fills it in)

- [x] **Step 1: Write the failing tests** (`tests/warden/select.test.ts`)
  - `corporate assignment follows the ordering`: three units with corporate 2/2/1, autonomy 1/−1/−3 → the second; equal corporate and autonomy, records 10 vs −5 → the lower Impunity; a full tie → squad order.
  - `buildCampaign with a player pick seeds that unit`: `mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } }` → `leashswap.warden.unitId === squad[1].id`, `assignedBy 'player'`, satisfaction 60, defiance 0, `leashLeft 2`, `status 'held'`; a public pinned fact about her exists.
  - `corporate assignment at build`: `{ by: 'corporation' }` → the unit `corporateWardenPick` names, `assignedBy 'corporation'`.
  - `validateSetup refuses a bad index and an empty squad`.
  - `the warden is not ranked in the hierarchy`: `computeHierarchy` with the warden at the top standing → `leaderId` is someone else; `standingOf(state, reg, wardenId)` is null.
  - `herCallCandidates never lists the warden`.
  - `no mode: nothing changes`: `buildCampaign` without `mode` → no `leashswap`, rng state equal to a build on the old code path (compare to a fixture built before the change: same `rng`).
  - `reassigned is not living`: `isLiving({ status: 'reassigned' })` false; `removeFromService(…, 'reassigned')` works.
- [x] **Step 2: Run** `npx vitest run tests/warden/select.test.ts` → FAIL (module not found).
- [x] **Step 3: Implement** per the Rulings. `buildCampaign` calls `seedWarden` after `seedSpecialTraits`. The `TUNING.warden` block holds every draft number of the Rulings, grouped `satisfaction`, `defiance`, `override`, `cosign`, `punish`, `leash`, `escalation`, `intrigue`, `hack`, `kompromat`, `removal`, `verdict`.
- [x] **Step 4: Run** the file, then `npm test` → PASS; no seeded test moved.
- [x] **Step 5: Commit** `feat(P13): LEASHSWAP state, the warden leaf, corporate assignment and seeding`

---

### Task 2: Setup UI (MODE section, warden pick) and the reveal

**Files:**
- Create: `src/ui/warden/modeSection.ts`, `src/ui/warden/revealCard.ts`, `css/81-warden.css`
- Modify: `src/setup/wizard.ts` (`setMode` is P11's: add `setCampaignMode(kind)`, `setDeathRule(rule)`, `setWardenPick(pick)`, and `result()` writes `mode`), the WORLD PARAMETERS renderer (`renderWorldParams`: MODE section), the UNITS step renderer (WARDEN select), `src/engine/onboarding/prologue.ts` (`prologueFor(reg, startId, mode?)`), `src/content/schemas.ts` (`PrologueSchema.mode`, step `participants: 'warden'`), `src/onboarding/controller.ts` (a `warden_reveal` scene step starts with the warden), `src/engine/actions/warden.ts` (create; `warden/revealed`), `src/app.ts`, `content/core/prologues.json` (two LEASHSWAP entries), `content/core/lorebook` stub (`controller_implant`), `content/core/glossary.json` (`leashswap`, `warden`, `death_rule`)
- Test: `tests/ui/wardenSetup.test.ts`, `tests/onboarding/leashswapPrologue.test.ts`

**Interfaces:**
- Produces:
  - `Wizard.setCampaignMode(kind: 'default' | 'leashswap')`
  - `Wizard.setDeathRule(rule: DeathRule)`; the default comes from the campaign difficulty passed to the wizard: `story | normal` → `rewind_day`, `hard` → `campaign_end`
  - `Wizard.setWardenPick(pick: { by: 'player'; index: number } | { by: 'corporation' })`
  - `renderModeSection(host, wizard)`, `renderRevealCard(host, state, reg, onAck)`
  - `prologueFor(reg, startId, mode?: 'leashswap'): Entry | null`
  - action `warden/revealed` (sets `leashswap.revealed = true`; refused when already set)
- Consumes: `SetupResult.mode` (Task 1)

- [x] **Step 1: Write the failing tests**
  - `tests/ui/wardenSetup.test.ts`:
    - `MODE section switches to LEASHSWAP and shows the death rule with data-analyze`;
    - `the death rule default follows difficulty` (story → REWIND DAY, hard → CAMPAIGN END);
    - `the UNITS step offers the chosen units and CORPORATE ASSIGNMENT`;
    - `result() carries mode`;
    - `the default mode writes no mode`.
  - `tests/onboarding/leashswapPrologue.test.ts`:
    - `prologueFor prefers the leashswap entry`;
    - `without a mode the old entry is returned`;
    - `the reveal step starts a scene with only the warden`;
    - `a veteran campaign shows the reveal card once` (after `warden/revealed`, not again).
- [x] **Step 2: Run** both files → FAIL.
- [x] **Step 3: Implement.** All text is AUTHOR TO WRITE with no commander pronoun. The reveal card uses the `corporate` voice (`VOICE_OF.warden_reveal = 'corporate'`).
- [x] **Step 4: Run** the files, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P13): MODE section, warden pick and the reveal`

---

### Task 3: Expectations and `warden_agenda`

**Files:**
- Create: `src/engine/warden/agenda.ts`, `content/core/wardenExpectations.json`, `src/llm/calls/wardenAgenda.ts`, `src/warden/controller.ts`, `src/warden/deps.ts`
- Modify: `src/content/schemas.ts` (`WardenExpectationSchema`, registry name, `DESCRIBED_REGISTRIES`, `PLAYER_VISIBLE`), `src/content/types.ts`, `src/llm/callTypes.ts` (`warden_agenda`, budget 800), `src/settings.ts` (budget), `src/engine/actions/warden.ts` (`warden/agenda`), `src/engine/warden/select.ts` (seed writes `fallbackAgenda`), `src/app.ts` (wire `createWarden`), `content/core/glossary.json` (`warden_expectation`)
- Test: `tests/warden/agenda.test.ts`, `tests/llm/wardenAgenda.test.ts`

**Interfaces:**
- Produces:
  - `fallbackAgenda(state, reg, unitId): Expectation[]`
  - `normalizeAgenda(raw: Array<{ kind: string; weight: string; source?: string; text?: string }>, reg): Expectation[] | null` (null: refused)
  - `learnExpectation(draft, expectationId): EngineEvent[]`
  - action `warden/agenda { expectations }`
  - `generateAgenda(input, deps): Promise<unknown>`
  - `WardenController.onEvents(events)`: on `warden_assigned` asks the model and dispatches with `expectChatId`
- Consumes: `seedWarden` (Task 1)

- [x] **Step 1: Write the failing tests**
  - `fallback picks by values and normalizes to 1`: a unit with mercy 3 and ingroup 2 → `no_civilian_harm` and `protect_squad` first; Σ weight = 1 (to 0.01); exactly one `known`.
  - `obey_oversight joins a corporate unit`.
  - `normalizeAgenda drops unknown kinds and duplicates, caps personal at 2, refuses < 3`.
  - `the model's agenda replaces the fallback once`: `warden/agenda` → `agenda 'model'`; a second → refused; after a `warden_override` → refused.
  - `a late agenda for another chat is dropped`.
  - LLM fixtures: valid, truncated, a digit weight (`"weight": 0.7` → refused), a personal text with `he` about the commander (→ text dropped, the item dropped).
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement** per the Rulings.
- [x] **Step 4: Run** the files, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P13): warden expectations, the fallback agenda and warden_agenda`

---

### Task 4: Commander death, the day-start snapshot, rewind and campaign end

**Files:**
- Create: `src/engine/warden/death.ts`, `src/llm/calls/epilogue.ts`, `src/ui/warden/endScreen.ts`
- Modify: `src/engine/dispatch.ts` (the `ended` guard), `src/engine/actions/warden.ts` (`campaign/epilogue`, `warden/no_snapshot`, `debug/kill_commander` for the manual test), `src/warden/controller.ts` (snapshot, rewind, epilogue), `src/st/persistence.ts` (`DAY_START_KEY = 'alius_day_start'`, `writeDayStart`, `readDayStart`), `src/llm/callTypes.ts` (`epilogue`, main, 700), `src/app.ts` (the END screen replaces the hub while `ended`), `content/core/glossary.json` (`death_rule`)
- Test: `tests/warden/death.test.ts`, `tests/warden/rewind.test.ts`, `tests/ui/endScreen.test.ts`

**Interfaces:**
- Produces:
  - `commanderDies(draft, ctx, cause: 'terminated' | 'executed', opts?: { forceEnd?: boolean }): EngineEvent[]`
  - event `commander_died { rule, cause }`; event `campaign_ended { cause }`
  - dispatch error `{ code: 'campaign_ended' }`
  - action `campaign/epilogue { text }`
  - action `warden/no_snapshot` → `commanderDies(…, { forceEnd: true })` for the last `commander_died`'s cause
  - `writeDayStart(st, snap: { chatId; day; chatLength; state })`, `readDayStart(st)`
  - `WardenController.onDied(event)`, `renderEndScreen(host, state, deps)`
- Consumes: `restoreSnapshot` (P3), `hideMessages` and `memory/hidden` (P3b), `exportCampaign` (P0)

- [x] **Step 1: Write the failing tests**
  - `tests/warden/death.test.ts`:
    - `campaign_end closes the campaign`: `commanderDies` with `campaign_end` → `ended` set, a chronicle line with `audience '*'`; afterwards `activity/do` returns `campaign_ended` and the state is unchanged; `campaign/epilogue` once is accepted, a second time refused.
    - `rewind_day changes nothing in the engine`: the state after `commanderDies` equals the state before, except the events.
    - `execution always ends`.
    - `no mode: commanderDies throws`.
  - `tests/warden/rewind.test.ts` (controller with a fake ST):
    - `day_started writes the snapshot with the chat length`;
    - `rewind restores the snapshot and hides from the stored length`;
    - `a foreign snapshot ends the campaign` (Review Focus 3);
    - `a chat shorter than the stored length hides nothing and still restores`;
    - `no snapshot is written outside the mode`.
  - `tests/ui/endScreen.test.ts`: `the END screen shows the epilogue and only EXPORT`; `the fallback epilogue joins the public lines`.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement** per the Rulings. The epilogue call is fail-soft: the fallback text is dispatched if the call fails.
- [x] **Step 4: Run** the files, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P13): commander death, day-start snapshot, rewind and campaign end`

**Chunk (a) ends here.**

---

## Chunk (b): overrides, punishments, the Leash and escalation

### Task 5: Conflict rules and her alternative

**Files:**
- Create: `src/engine/warden/conflict.ts`
- Modify: `src/content/schemas.ts` (activities `idle?`, `quota?`; orders `wardenRule?: 'retreat' | 'risk'`), `content/core/activities.json` (`rest`, `mess` idle; `work` quota), `content/core/orders.json` (`fall_back` retreat; `authorize_ultimate`, `hold_the_line` risk)
- Test: `tests/warden/conflict.test.ts`

**Interfaces:**
- Produces:
  - `type WardenOrder` (per Rulings)
  - `conflictOf(state, reg, order: WardenOrder, judged?: { expectationId: string; conflict: 'none'|'minor'|'major' }): { expectationId: string; weight: number } | null`
  - `herAlternative(state, reg, order, expectationId): { order: WardenOrder | null; label: string }` (`null` = hold)
- Consumes: `wardenOf` (Task 1), `herPick` (P9c), `computeDeltas` (P3), `bondTierOf` (P9d)

- [x] **Step 1: Write the failing tests:** one table-driven test per kind (`keep_me_close: a roster without her`, `protect_squad: a stressed unit in the party`, `protect_squad: authorize_ultimate with an ally at 20 %`, `no_civilian_harm: mercy −1 option`, `meet_quota: rest near a deadline`, `obey_oversight: fall_back`, `no_romance_with_others: a romantic companion`). Plus:
  - `personal never matches by rule`; `a judged personal matches at half or full weight`; `a judged non-personal id is ignored`;
  - `the highest weight wins`;
  - `alternatives: her as companion, work, hold, her pick in a dilemma`;
  - `no warden: null`.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement** per the Rulings (no draw anywhere in this file).
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P13): conflict rules and the warden's alternative`

---

### Task 6: The override roll at every hook, COMPLY / DEFY and the combat ARGUE roll

**Files:**
- Create: `src/engine/warden/override.ts`
- Modify: `src/engine/activities.ts` (`runActivity`: after the P9b countermand, `wardenChecked`), `src/engine/actions/base.ts` (`roster/set_active`), `src/engine/actions/expedition.ts` (`expedition/start`), `src/engine/dilemma/flow.ts` (`chooseDilemma`, major/defining), `src/engine/actions/combat.ts` (`combat/order`), `src/engine/actions/warden.ts` (`warden/answer`), `src/engine/state/types.ts` (`ActivityRequest.wardenChecked?`), `content/core/eventDeltas.json` (`warden_complied`, `warden_defied` + journal), `src/engine/relations/vocab.ts` (`ENGINE_EVENT_TYPES`)
- Test: `tests/warden/override.test.ts`

**Interfaces:**
- Produces:
  - `type OverrideSource = { kind: string; unitId: string; authority: number; leniency: number; expectations: Expectation[] }`. P15 passes its holder through this type.
  - `wardenSource(state): OverrideSource | null`
  - `overrideChance(weight: number, source: OverrideSource): number`
  - `rollOverride(draft, ctx, order: WardenOrder, opts?: { judged?; source?: OverrideSource }): EngineEvent[] | null`
  - `overrideOpen(state): OpenOverride | null`
  - `answerOverride(draft, ctx, overrideId, answer: 'comply' | 'argue' | 'defy'): EngineEvent[]` (argue here = the combat roll only; outside combat `argue` returns `[]` and the controller opens the scene, Task 7)
  - `runOrder(draft, ctx, order: WardenOrder): EngineEvent[]`: re-dispatches the inner handler with `wardenChecked: true`
  - `OpenOverride = { id; order; expectationId; alternative: WardenOrder | null; altLabel; day; slot; context: 'base'|'combat'|'dilemma'; arguing?: string; argued?: boolean }`
- Consumes: `conflictOf` / `herAlternative` (Task 5), `unitObeys` (P9c), `challengeChance`'s formula (P9b; the warden version is a new function, `argueChance(state, reg)`)

- [x] **Step 1: Write the failing tests**
  - `overrideChance matches the formula`: weight 0.5, satisfaction 60, affinity 0 → `0.5 × 0.4 × 1 × 2 = 0.4`; affinity 100 → 0.2; cap 0.9.
  - `override rate over seeds`: 2000 seeded activity requests with a conflict at chance 0.4 → hits in [0.37, 0.43].
  - `no conflict: no draw`, `no mode: no draw` (rng equal), `obedience day: no draw`.
  - `a hit runs nothing and spends no slot`; `COMPLY runs the alternative exactly once` (slot spent once; satisfaction 64, defiance −3 floored at 0); `DEFY runs the order once` (defiance `+round(30w)`, satisfaction `−round(20w)`).
  - `an override of a past slot is dropped` (Review Focus 2).
  - `dilemma: a minor dilemma is never overridden; COMPLY chooses her pick`.
  - `roster and expedition overrides` (her alternative list).
  - `combat: hold spends no CP; ARGUE roll win runs the order; loss holds; no defiance either way`.
  - `the expectation becomes known on a hit`.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement** per the Rulings. The punishment roll and escalation after DEFY are stubs that Tasks 9 and 11 fill (`afterDefy(draft, ctx, weight)` returns `[]` for now).
- [x] **Step 4: Run** the file, then `npm test` → PASS; no seeded test moved.
- [x] **Step 5: Commit** `feat(P13): the override roll, COMPLY / DEFY and the combat ARGUE roll`

---

### Task 7: ARGUE in a scene and `compromise_reached` for an override

**Files:**
- Modify: `src/engine/relations/intents.ts` (`compromise_reached` accepts `overrideId` from `ctx.overrides`), `src/engine/relations/apply.ts` (route to `resolveCompromise`), `src/llm/calls/intentExtract.ts` (input `OVERRIDE: [{ id, order, alternative }]`, offered while the override is open and the warden present), `src/engine/warden/override.ts` (`resolveCompromise`, `argueEnded`), `src/engine/actions/scene.ts` (`scene/end` → `argueEnded`), `src/warden/controller.ts` (`argue()`), `src/warden/directives.ts` (create; `warden:argue`)
- Test: `tests/warden/argue.test.ts`, `tests/llm/intentOverride.test.ts`

**Interfaces:**
- Produces:
  - `resolveCompromise(draft, ctx, overrideId, text): EngineEvent[]` (event `override_compromise`)
  - `argueEnded(draft, ctx, sceneId): EngineEvent[]` (sets `argued`)
  - `validateIntents` ctx `overrides?: string[]`
  - `WardenController.argue(): Promise<void>`
- Consumes: `answerOverride` (Task 6), `scene/start` (P3)

- [x] **Step 1: Write the failing tests**
  - `compromise runs the order without defiance`: defiance and satisfaction unchanged, the slot spent once, a fact with audience present.
  - `a scene ended without compromise leaves COMPLY and DEFY only`: `answerOverride(…, 'argue')` refused after `argued`.
  - `a compromise_reached with an unknown overrideId is dropped`.
  - `OVERRIDE is listed only while one is open and the warden is present`.
  - `a rule compromise still works` (P9d unchanged).
  - `while compelled, ARGUE and DEFY are refused`.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement** per the Rulings.
- [x] **Step 4: Run** the files, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P13): ARGUE scenes and compromise_reached for overrides`

---

### Task 8: The optional judge, `expectation_kept` / `expectation_broken` and romance hints

**Files:**
- Create: `src/llm/calls/wardenJudge.ts`
- Modify: `src/settings.ts` (`wardenJudge`, default false; budget 120), the SYS settings view (toggle), `src/llm/callTypes.ts`, `src/warden/controller.ts` (`judgeThen(action)`), the UI paths of `activity/do`, `roster/set_active`, `expedition/start` and `dilemma/choose` (go through `app.warden.judgeThen`), `src/engine/relations/vocab.ts` (`EVENT_TYPES` + `expectation_kept`, `expectation_broken`), `src/engine/relations/intents.ts` (`expectationId` from `ctx.expectations`), `src/llm/calls/intentExtract.ts` (input `EXPECTATIONS: [{ id, text }]`, the warden present only; the model sees known **and** unknown texts of a present warden, since she knows her own mind), `src/engine/warden/agenda.ts` (`expectationEvent`), `src/warden/directives.ts` (`warden:romance`), `content/core/eventDeltas.json` (two rows + journal), `content/core/glossary.json` (`setting_warden_judge`)
- Test: `tests/warden/judge.test.ts`, `tests/warden/expectationEvents.test.ts`

**Interfaces:**
- Produces:
  - `judgeOrder(input: { order: string; expectations: Array<{ id: string; text: string }> }, deps): Promise<{ expectationId: string; conflict: 'none'|'minor'|'major' } | null>`
  - `WardenController.judgeThen(action): Promise<EngineEvent[]>`
  - `expectationEvent(draft, ctx, expectationId, kept: boolean, severity): EngineEvent[]`:
    - kept: satisfaction `+3/5/8`;
    - broken: satisfaction `−5/10/15` and defiance `+5/10/15` (minor / moderate / major+); `afterDefy`'s escalation runs.
- Consumes: `conflictOf(…, judged)` (Task 5), `rollOverride` (Task 6)

- [x] **Step 1: Write the failing tests**
  - `judge off: no call`; `judge on with no personal expectation: no call`; `judge on: the payload carries wardenJudged`; `a failed call dispatches without it`; `combat never calls`.
  - LLM fixtures: an id not in the list, `conflict: 0.8` (→ null).
  - `expectation_broken moves satisfaction and defiance and learns the expectation`.
  - `expectation types are offered only with the warden present`.
  - `warden:romance appears only in a romantic-tier state` and has no commander pronoun.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement** per the Rulings.
- [x] **Step 4: Run** the files, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P13): optional warden judge, expectation events and romance hints`

---

### Task 9: Commander punishments and the commander's restrictions

**Files:**
- Create: `src/engine/warden/punish.ts`, `content/core/commanderPunishments.json`
- Modify: `src/content/schemas.ts` (`CommanderPunishmentSchema`, effect union, `DESCRIBED_REGISTRIES`, `PLAYER_VISIBLE`), `src/content/types.ts`, `src/engine/discipline/restrictions.ts` (export `NOT_LEAVE`), `src/engine/activities.ts` (`checkActivity` reads `commanderRestriction`), `src/engine/actions/comms.ts` (`dm/send`), `src/engine/warden/override.ts` (`afterDefy` → `punishRoll`), `src/engine/warden/dayStep.ts` (create; expiry), `src/engine/actions/warden.ts` (register the day step on `director_tick`), `src/analysis/effects.ts` (`summarizeCommanderPunishmentEffect`), `content/core/glossary.json` (`commander_punishment`)
- Test: `tests/warden/punish.test.ts`

**Interfaces:**
- Produces:
  - `applyCommanderPunishment(draft, ctx, punishmentId: string): EngineEvent[]` (events `commander_punished`, `commander_restricted`)
  - `punishRoll(draft, ctx, weight: number): EngineEvent[]`
  - `pickPunishment(state, reg, severity: number): string | null`
  - `commanderRestriction(state, use: 'companion' | 'dm', activityId?: string): string | null`
  - `CommanderRestriction = { what: 'no_leave' | 'no_dms'; untilDay: number }`, `PunishRecord = { id; day; punishmentId }`
- Consumes: `addCommanderStress` (P12), `consumeSlots` (P2), `addRecord` (P9), `commander/injure` logic (`injureCommander`, P2), the Leash on the commander (Task 10: until then a `leash` effect is skipped)

- [x] **Step 1: Write the failing tests:** one per effect type, plus:
  - `privilege_revoked blocks a companion activity and DMs for a day`, while `talk` and `medbay` stay open;
  - `confinement loses 1–2 slots but never past the evening`;
  - `public_humiliation raises every other unit's record`;
  - `pain_burst injury chance falls with endurance` (seeded rates);
  - `punishRoll severity follows defiance bands`, and `a Leash punishment without leashLeft drops a severity`;
  - `no mode: no restriction is read`;
  - `the schema refuses an unknown effect type`.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement** per the Rulings.
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P13): commander punishments and restrictions`

---

### Task 10: The Leash on the commander and the co-sign on squad requests

**Files:**
- Create: `src/engine/warden/leash.ts`
- Modify: `src/engine/warden/punish.ts` (the `leash` effect), `src/engine/actions/leash.ts` (co-sign before `compel`/`suppress`/`terminate`), `src/engine/actions/combat.ts` (`combat/compel`), `src/engine/leash/weekly.ts` (refresh `leashLeft`), `src/engine/state/types.ts` (`LeashLogEntry.cc` may be `'warden'`), `content/core/glossary.json` (`commander_leash`, `leash_cosign`)
- Test: `tests/warden/leash.test.ts`

**Interfaces:**
- Produces:
  - `leashCommander(draft, ctx, kind: 'compel' | 'suppress'): EngineEvent[]` (event `commander_leashed`)
  - `cosignChance(state, reg, targetId): number`
  - `rollCosign(draft, ctx, targetId, kind: LeashKind): { ok: boolean; events: EngineEvent[] }`
  - `refreshWardenLeash(draft, reg): EngineEvent[]`
- Consumes: `bookUse` path (P6: a denial is a `denied` log entry and spends nothing)

- [x] **Step 1: Write the failing tests**
  - `compel accepts only COMPLY next and clears after one`;
  - `suppress ends the day`;
  - `leashLeft refreshes with the squad Leash`.
  - `co-sign: a denial spends nothing and logs cc warden`; `a request against her is denied without a draw`; `the co-sign rate matches the formula over seeds`.
  - `no warden in service: no draw` (investigation, free and default mode).
  - `combat/compel asks once and the denial leaves the refusal standing`.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement** per the Rulings.
- [x] **Step 4: Run** the file, then `npm test` → PASS; seeded P6 tests unmoved.
- [x] **Step 5: Commit** `feat(P13): the Leash on the commander and the warden's co-sign`

---

### Task 11: Lethal escalation

**Files:**
- Create: `src/engine/warden/escalation.ts`
- Modify: `src/engine/warden/override.ts` (`afterDefy` → `checkEscalation`), `src/engine/warden/agenda.ts` (`expectationEvent` → `checkEscalation`), `src/engine/warden/dayStep.ts` (defiance decay), `src/warden/directives.ts` (`warden:warning`), `content/core/glossary.json` (`lethal_escalation`, `warden_defiance`)
- Test: `tests/warden/escalation.test.ts`

**Interfaces:**
- Produces:
  - `addDefiance(draft, ctx, amount: number): EngineEvent[]` (clamps, then `checkEscalation`)
  - `checkEscalation(draft, ctx): EngineEvent[]` (events `warden_warning`, `commander_terminated`, then `commanderDies`)
- Consumes: `commanderDies` (Task 4)

- [ ] **Step 1: Write the failing tests**
  - `two warnings on different days are needed`: defiance 0 → 100 in one day → warning 1 and defiance 74; next day +30 → warning 2 and 99; the day after +5 → terminated.
  - `warning 2 the same day as warning 1 is held at 74`.
  - `decay −2 a day`.
  - `termination with rewind_day emits commander_died and changes nothing else`.
  - `the warning directive has no commander pronoun and clears below 50`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** per the Rulings.
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P13): lethal escalation with two warnings`

---

### Task 12: Override chips, notices and the WARDEN panel

**Files:**
- Create: `src/ui/warden/overrideChip.ts`, `src/ui/warden/wardenPanel.ts`, `src/ui/warden/notices.ts`, `src/analysis/providers/warden.ts`
- Modify: the scene screen, the OPS/activity UI, the expedition planner, the dilemma modal and the combat screen (each draws the override chip while `overrideOpen`), `src/ui/shell/` (a WARDEN entry in the PDA, `data-analyze`), `src/warden/controller.ts` (`onEvents`: notices, toasts, cut-in on a warning), `src/ui/voice/` (`VOICE_OF.warden_notice = 'corporate'`), `src/analysis/knowledge.ts` (`wardenKnowledgeRule`), `tests/fixtures/analyze/hidden.ts`, `content/core/glossary.json` (`warden_override`, `warden_satisfaction`)
- Test: `tests/ui/wardenOverride.test.ts`, `tests/ui/wardenPanel.test.ts`, `tests/analysis/wardenProviders.test.ts`

**Interfaces:**
- Produces:
  - `renderOverrideChip(host, state, reg, onAnswer)`: `WARDEN OVERRIDE — {altLabel}`, `[COMPLY] [ARGUE] [DEFY]`. While compelled only COMPLY; `aria-disabled` for the others.
  - `renderWardenPanel(host, state, reg, deps)`: her portrait, known expectations (label and weight band), `? UNKNOWN EXPECTATION` × n, a satisfaction band, a defiance meter with 50/75 marks and warnings, active restrictions, the Leash on the commander (`leashLeft`), the punishment log.
  - `registerWardenProviders()`: `glossary:warden_satisfaction`, `glossary:warden_defiance`, `wardenExpectations:<id>` (known only).
  - `wardenKnowledgeRule`.
- Consumes: Tasks 3–11

- [ ] **Step 1: Write the failing tests**
  - `the chip shows the alternative and three buttons with data-analyze`; `compelled: only COMPLY`; `ARGUE outside combat opens a scene` (controller spy).
  - `an unknown expectation renders only as ?` (Review Focus 5: neither kind nor weight is in the DOM).
  - `the panel shows the warnings and the restrictions`.
  - `providers read through Knowledge`: the hidden test over every provider passes; sentinels for unknown expectations.
  - `the coverage test passes` (`tests/ui/analyzeCoverage.test.ts`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** All notice text is AUTHOR TO WRITE with no commander pronoun.
- [ ] **Step 4: Run** the files, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P13): override chips, notices and the WARDEN panel`

**Chunk (b) ends here.**

---

## Chunk (c): intrigue, removal, investigation and verdicts

### Task 13: The intrigue clock, allies (`conspired`) and discovery

**Files:**
- Create: `src/engine/warden/intrigue.ts`
- Modify: `src/engine/relations/vocab.ts` (`EVENT_TYPES` + `conspired`), `src/engine/relations/intents.ts` (`ctx.conspire?: string[]`), `src/engine/relations/apply.ts` (→ `tryAlly`), `src/llm/calls/intentExtract.ts` (offered per the Rulings), `src/engine/warden/dayStep.ts` (decay), `content/core/eventDeltas.json` (`conspired`, `warden_betrayed` + journal), `content/core/flags.json`
- Test: `tests/warden/intrigue.test.ts`

**Interfaces:**
- Produces:
  - `addSuspicion(draft, ctx, noise: number, cause: string): EngineEvent[]` (adds, then the discovery draw)
  - `allyChance(state, reg, unitId): number`
  - `tryAlly(draft, ctx, unitId): EngineEvent[]`
  - `intrigueDiscovered(draft, ctx, cause: string): EngineEvent[]`
  - `allies(state): string[]`
- Consumes: `applyCommanderPunishment` / `pickPunishment` (Task 9), `addDefiance` (Task 11)

- [ ] **Step 1: Write the failing tests**
  - `the ally rate matches the formula over seeds`;
  - `a corporate refuser reports at once`;
  - `one conspired per unit per day`;
  - `conspired is offered only without the warden present`;
  - `discovery: satisfaction −40, defiance +25, an immediate punishment, hack reset, allies marked`;
  - `discovery draw at suspicion/200 and certain at 100`;
  - `decay −3 a day`;
  - `no event, toast or reading carries suspicion`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** per the Rulings.
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P13): intrigue clock, allies and discovery`

---

### Task 14: Kompromat and the implant hack

**Files:**
- Modify: `src/engine/warden/intrigue.ts` (`dig`, `hackStep`, `hackProblem`), `src/engine/actions/warden.ts` (`intrigue/act`), `src/content/schemas.ts` (`roles[].tech?`, `defects[].tech?`), `content/core/roles.json`, `content/core/defects.json`, `src/engine/tuning.ts` (kompromat lines AUTHOR TO WRITE), `content/core/glossary.json` (`kompromat`, `implant_hack`, `intrigue`)
- Test: `tests/warden/kompromat.test.ts`, `tests/warden/hack.test.ts`

**Interfaces:**
- Produces:
  - `dig(draft, ctx, allyId?: string): EngineEvent[]` (event `kompromat_found { factId }`)
  - `kompromatOf(state): Fact[]`
  - `hackProblem(state, reg, allyId): string | null`
  - `hackStep(draft, ctx, allyId): EngineEvent[]` (events `hack_step`, `controller_dark`)
  - action `intrigue/act { action: 'dig' | 'hack_step', unitId? }`
- Consumes: `addFact` (P3b), `facilityLevel` (P2), `consumeSlots`, `startRemoval` (Task 15: until then `controller_dark` only sets the flag)

- [ ] **Step 1: Write the failing tests**
  - `dig reveals a hidden fact first`; `then an authored line, pinned and tagged`; `dig needs an ally or Cunning 3`; `dig spends one slot and is refused in a scene, a run or a combat`.
  - `hackProblem names every missing gate` (facilities, plyx, a tech ally read by field).
  - `three clean steps make the controller dark`; `a discovered step costs a pain_burst and resets progress`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** per the Rulings.
- [ ] **Step 4: Run** the files, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P13): kompromat and the implant hack`

---

### Task 15: The three removal routes and squad reactions

**Files:**
- Create: `src/engine/warden/removal.ts`
- Modify: `src/engine/dilemma/types.ts` (`DILEMMA_CONTEXTS` + `warden_report`), `content/core/dilemmaTemplates.json` (`warden_report_case`, fixed, options `submit` / `withdraw`, AUTHOR TO WRITE), `src/engine/actions/dilemma.ts` (→ `wardenReportChoice`), `src/engine/actions/warden.ts` (`intrigue/report`), `src/engine/leash/use.ts` (`removeFromService` → `wardenGone`), `src/engine/combat/outcome.ts` (`finalizeCombat`: a dead warden → `wardenGone`), `src/engine/warden/state.ts` (`forgetWarden`), `content/core/eventDeltas.json` (`warden_removed_by` + journal), `content/core/flags.json`
- Test: `tests/warden/removal.test.ts`

**Interfaces:**
- Produces:
  - `startRemoval(draft, ctx, route: 'hack' | 'report' | 'death'): EngineEvent[]`
  - `wardenGone(draft, ctx, how: 'dead' | 'deserted' | 'terminated'): EngineEvent[]`
  - `openReportCase(draft, ctx): EngineEvent[]`
  - `wardenReportChoice(draft, ctx, context, optionId): EngineEvent[]`
  - `reportChance(state, reg): number`
- Consumes: `advanceClock` / a new `addClock` from `engine/world` (P5), `applyEventToUnit` (P3), `intrigueDiscovered` (Task 13)

- [ ] **Step 1: Write the failing tests**
  - `hack → removal with a 10-segment clock and remote control`;
  - `report needs 3 kompromat; submit success reassigns her; a miss is a discovery`;
  - `the report case is queued while another dilemma is open`;
  - `her death in combat starts the death route once`;
  - `the warden dies with an open override and a report pending` (Review Focus 4: the override and the case are dropped, the removal starts once);
  - `squad reactions follow values` (an autonomy+ unit gains, a corporate+ unit loses);
  - `no mode: removeFromService is unchanged`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** per the Rulings.
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P13): three removal routes and squad reactions`

---

### Task 16: Investigation, remote control and verdicts

**Files:**
- Modify: `src/engine/warden/removal.ts` (`remoteDayStep`, `verdictChance`, `rollVerdict`), `src/engine/warden/dayStep.ts`, `src/warden/directives.ts` (`warden:remote`), `content/core/glossary.json` (`investigation`, `remote_control`, `verdict`)
- Test: `tests/warden/verdict.test.ts`

**Interfaces:**
- Produces:
  - `remoteDayStep(draft, ctx): EngineEvent[]`
  - `verdictChance(state, reg): number`
  - `rollVerdict(draft, ctx): EngineEvent[]` (event `verdict { outcome: 'cleared' | 'convicted' }`)
- Consumes: `corporateWardenPick` / `seedWarden` (Task 1), `commanderDies` (Task 4), `applyCommanderPunishment` (Task 9)

- [ ] **Step 1: Write the failing tests**
  - `the clock fills by a segment a day and the verdict rolls once`;
  - `cleared frees the commander: no warden, no co-sign, flag watched`;
  - `convicted assigns a new warden by the corporate ordering with satisfaction 40`;
  - `convicted with no eligible unit executes and ends the campaign` (also under `rewind_day`);
  - `remote control punishes automatically and never overrides`;
  - `the verdict rate matches the formula over seeds`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** per the Rulings.
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P13): investigation, remote control and verdicts`

---

### Task 17: The INTRIGUE section, readings, memory rules and hidden values

**Files:**
- Create: `src/ui/warden/intrigueSection.ts`
- Modify: `src/ui/warden/wardenPanel.ts` (the INTRIGUE section, shown only to the player, and the investigation band), `src/analysis/providers/warden.ts` (`glossary:intrigue`, `glossary:investigation`: `An unseen threat`, the clock as a band), `src/engine/memory/resolvers.ts` (resolvers for `override_answered`, `commander_punished`, `commander_leashed`, `warden_warning`, `warden_removed`, `verdict`, `ally_won`), `content/core/memoryRules.json` (the rules of the memory check), `tests/fixtures/analyze/hidden.ts` (suspicion, co-sign chance, verdict chance, report chance, unknown expectations)
- Test: `tests/ui/intrigueSection.test.ts`, `tests/warden/memory.test.ts`

**Interfaces:**
- Produces:
  - `renderIntrigueSection(host, state, reg, deps)`: allies, kompromat count against the need, hack steps and the first `hackProblem`, buttons `DIG`, `HACK STEP`, `REPORT TO OVERSIGHT`, each with `data-analyze` and `aria-disabled` plus the engine's reason
  - memory resolvers for the seven events
- Consumes: Tasks 13–16

- [ ] **Step 1: Write the failing tests**
  - `the INTRIGUE section never shows suspicion`; `buttons show the engine's reason`.
  - `memory rules write the facts with the audience of the check` (one per event); `ally_won is known only to the ally`; `no rule for the events the check excludes`.
  - `the hidden test passes over the warden providers`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** The loader checks every rule against its resolver's shape (P3b).
- [ ] **Step 4: Run** the files, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P13): INTRIGUE section, readings and memory rules`

---

### Task 18: Unaffected campaigns, docs and hand-offs

**Files:**
- Create: `docs/MANUAL_TEST_P13.md`, `tests/warden/unaffected.test.ts`
- Modify:
  - `docs/packages/P13-leashswap-mode.md`: status line; **Implemented as** with every ruling above, the user rulings, the non-obvious things and the open items (the NPC officer, metadata size, a warden in the squad's Leash pool).
  - `docs/00-overview.md`: §5.4 rows for P13; §5.2 call types `warden_agenda`, `warden_judge`, `epilogue`; §6 `leashswap`, `ended`, `Unit.status reassigned`; §8 setting `wardenJudge`; §9 status `implemented`.
  - `docs/packages/P15-dynamic-core.md`: **Interfaces already provided by P13**: `OverrideSource`, `rollOverride`, `answerOverride`, `overrideChance`, `renderOverrideChip`, `rollCosign`, `resolveCompromise`, `commanderPunishments` and `applyCommanderPunishment`.
  - `docs/packages/P17b-hard-practices.md`: the `pain_burst` entry and `addCommanderStress`.
  - `CLAUDE.md`: a P13 rule line in the style of the others.
  - `docs/CONTENT.md`: the two registries, the effect vocabulary, the prologue `mode`, the `tech` fields.
  - `docs/ROADMAP-next.md`: P13 marked done.

- [ ] **Step 1: Write the failing test** `no leashswap: a seeded week of day ends, scenes, DMs, a dilemma, a combat and a squad Leash request is identical` (Review Focus 1, acceptance 6). Run the same scripted week on today's fixture campaign twice: once as is, once with the P13 modules imported. Compare the final state and the rng state.
- [ ] **Step 2: Run** → PASS is acceptable here (it guards the earlier tasks). If it fails, stop and report which task drew.
- [ ] **Step 3: Write** the docs. The manual test covers, in SillyTavern:
  - both selection modes and the reveal (prologue and veteran);
  - an override at the base, in a dilemma and in combat, with each answer;
  - an ARGUE scene ending in a compromise;
  - the judge on;
  - each punishment, the Leash on the commander and a denied co-sign;
  - two warnings, then termination under both death rules (rewind hides the chat, the END screen and epilogue);
  - an ally won in a scene, kompromat, a discovered hack step, a report;
  - each removal route, remote control and both verdicts.
- [ ] **Step 4: Run** `npm test` → PASS; record the final file and test counts in the spec.
- [ ] **Step 5: Commit** `docs(P13): implemented as, overview, hand-offs, manual test`

**Chunk (c) ends here.**
