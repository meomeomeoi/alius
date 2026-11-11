# P6 Dilemmas, Disloyalty & the Leash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Choices that always cost something and are validated by the engine before the player sees them; soldiers who refuse orders, desert or attack according to their loyalty; the Leash (Compel / Suppress / Terminate) as a rationed, logged, relationally expensive override; and defect arcs (Cure / Manage / Embrace) as personal decisions.

**Architecture:** All rules are pure engine code: `src/engine/leash/`, `src/engine/loyalty/`, `src/engine/dilemma/`, `src/engine/arcs.ts`, exposed as actions (`leash/*`, `loyalty/*`, `dilemma/*`, `arc/*`, `scene/order`, `combat/compel`). A generated dilemma is **two-phase**, like P5's director: the engine opens a request in state and emits `dilemma_requested`; a new non-engine layer `src/loyalty/` (like `src/world/`) makes the `dilemma_generate` call and answers with `dilemma/present`; the engine parses and validates the answer, allows one retry, then presents the template's authored `fixed` block. Every dilemma option is translated into P5's **world-effect vocabulary** and applied by `applyWorldEffects`. Disloyalty runs inside the day-end pipeline (signs first, checks a day later) and surfaces as night confrontations with fixed options; a mutiny is an ordinary P4 combat whose enemy side is built from squad units.

**Tech Stack:** TypeScript 5 (strict), esbuild, zod 3, vitest (+ jsdom for UI). No new dependencies.

**Spec:** `docs/00-overview.md` (P2, P3, P6; §5.4 lists the interfaces this plan uses), `docs/packages/P6-dilemmas-disloyalty-leash.md` (including **Interfaces already provided by P2 / P3 / P4 / P5**); content drafts `docs/content/lore.md` §2, §5 and `docs/content/defects.md` (arcs) — read by Task 1 only.

## Global Constraints

- English everywhere: UI strings, prompts, identifiers, comments (overview P8).
- `src/engine/**` stays pure (architecture test): no imports from `src/st`, `src/ui`, `src/llm`, `src/scene`, `src/sim`, `src/world`, and from Task 12 on `src/loyalty`; no `window`/`document`. `src/loyalty/**` reaches ST only through the `StAdapter` type and never imports `src/ui` (new architecture test in Task 12).
- **The model never sets amounts** (overview P1/P2): `dilemma_generate` returns enums (`kind`, `direction`, `magnitude`), ids and short texts; every number comes from `TUNING.dilemma.magnitude`. Model text is stored and rendered as plain text (`textContent`), never as markup.
- A failed, late or duplicate LLM answer never mutates state (overview §11): `dilemma/present`, `dilemma/fallback` and `dilemma/choose` need the id of the open dilemma (`Stale dilemma answer.` otherwise). Controllers pass `expectChatId`.
- Spec numbers, verbatim: refusal **15 %** (`wavering`) and **35 %** (`breaking`); Compel **1 authorization, Trust −15, Affinity −10, stress +15**; Suppress **1 authorization, Trust −25**; witnesses `coerced/moderate`; `imprint_fracture` Compel cost **×2** and may fail; `compliance_craving` cost **halved**; `defining` cooldown **≥ 7 days**, max 1 per spine beat; `minor` ≤ medium, `defining` ≥ 1 large; mutiny never within **2 days** of entering `despises`; desertion telegraphed **≥ 1 day** before; dilemma `setup` ≤ 120 words, `label` ≤ 12 words, 2–4 options.
- Relationship axes change only through P3 (`applyEventToUnit`, `applyIntents`, `applyRelationDelta`, `enterState`, `evaluateAutomatic`); world consequences only through `applyWorldEffects`; combat only through `combat/*`; slots only through `consumeSlots`.
- Every Leash use is logged as `{ unitId, kind, day, … }` in `leash.log` (P3's `resentful` state counts entries by `unitId`); `leash.authorizationsLeft` stays the single source for the header.
- Content-like data lives in JSON (overview P4): dilemma templates, sign lines, per-corporation Leash numbers, per-defect Leash and desertion modifiers. Rule constants live in `src/engine/tuning.ts` under new `TUNING.leash`, `TUNING.disloyalty`, `TUNING.mutiny`, `TUNING.dilemma`, `TUNING.arc`. All values are draft balance.
- Campaign state stays `version: 1`. Every new field is optional and read through a defaulting helper, so P1–P5 saves load unchanged.
- Metadata stays small: `leash.log` keeps 60 entries, signs 6 per unit, `dilemmas.recent` 3 ids.
- `dist/index.js` and `style.css` are committed; `npm test` rebuilds them; commit them with each change.
- Commit messages end with the `Co-Authored-By:` / `Claude-Session:` trailers of the executing agent (overview P9).

## Where the code differs from the spec (read before Task 1)

Rulings taken while planning, where the spec is silent or the P0–P5 code already decides. List them in the spec's **Implemented as** section in Task 16.

- **Dilemmas are two-phase.** `state.dilemmas.open = { id, templateId, scale, context, status: 'requested' | 'presented', attempts, … }`. `dilemma/present { requestId, output }` validates; an invalid first answer emits `dilemma_rejected { retry: true }` and stays `requested`; an invalid second answer presents the authored fallback in the same dispatch. `dilemma/fallback { requestId }` presents the fallback at once (setting `dilemmasEnabled` off, no profile, failed call). A request still open at the next day end is answered by the fallback first. One dilemma at a time.
- **Every generating template carries an authored `fixed` block** (loader check): it is the "safe authored fallback" and what plays with no mechanic profile.
- **Option effects are world effects.** `resource`, `faction`, `clock`, `flag` map 1:1; `stress` → `party_stress`; `unit_event` → `unit_event { event: 'decision_aligned', targets: 'named', valueAxes: [{ axis: target, direction }] }` (P5 ruling: axes only work on decision events; a unit whose values match gains, the others lose); a `flag` whose target is `thread:<threadId>:<slug>` → new generic effect **`thread_flag`**; `social_check` is not an effect but the option's `check { stat, rank }`: a seeded roll at choice time, on failure the option's non-cost effects are dropped. Magnitudes: `small|medium|large` → `TUNING.dilemma.magnitude` (credits 15/40/100, supplies 3/8/15, plyx 3/8/20, faction 5/10/20, clock 1/1/2, stress 5/10/20, severity minor/moderate/major, check rank 2/3/4).
- **`unit_event` outside an expedition** (P5 only queues it during a run): `applyWorldEffects` applies it at once through `applyEventToUnit` to `src.units` (new optional `EffectSource.units`), default the living named units of the active roster, then `evaluateAutomatic`.
- **Where dilemmas come from.** (a) a day-end *pacing* step: every `TUNING.dilemma.everyDays = 4` days a seeded pick among eligible templates with context `base` or `director` (`mission_outcome` templates only on a day a mission was completed or failed); `defining` templates are never drawn by pacing; (b) a pinned expedition objective event whose template has a `generate` block (the two beat-4 choices become `defining`); (c) defect arcs, which are authored by the engine and use no model. The director model does not pick dilemmas in v1.
- **A presented dilemma blocks time.** While `dilemmas.open.status === 'presented'`, `activity/*`, `calendar/consume_slot`, `scene/start` and `expedition/start` are refused (`dilemma_open`); inside a run the P5 event phase already blocks movement. `dilemma/` joins the action families allowed while an expedition is open.
- **Dominance** (rule 3): each option is scored on five dimensions — resources (credits 1, supplies 3, plyx 5 per point), factions (2 per point), clocks (−15 per segment), stress (−1 per point), units (Σ over present named units of alignment × severity weight 2/5/10). Option A is rejected as dominating B when A ≥ B on **every** dimension (equal vectors included). An option with `requires` or `check` is never the dominator.
- **Out-of-combat orders are a fixed scene control**, not a new intent type (overview P5: orders are engine-validated options; P3's 26 event types have no "order"). `scene/order { unitId }` rolls her refusal chance before the player's message goes out; a refusal becomes a scene-long hard directive and may be answered with `leash/compel`. A second order to her is refused until the next exchange.
- **Refusal chance outside the state graph.** Loyalty bands are not relationship states, so `getSynergies` also returns `TUNING.disloyalty.bandSynergy[band]` (`loyalty_wavering` 0.15, `loyalty_breaking` 0.35, new entries in `synergies.json`). `issueOrder` already takes the highest matching chance.
- **Compel in combat cancels the last refusal** and is paid at the end. `issueOrder` records `cs.lastRefusal`; `combat/compel` runs that order for free and pushes her unit id onto `cs.compels`; authorizations, Trust, Affinity and the log are settled by `finalizeCombat` (P4's invariant: only `combat` and `rng` change while a combat is open, so an easy retry never charges twice). Her combat stress rises at once.
- **Leash costs are exact numbers**, not rows of `eventDeltas` (`coerced/extreme` is −14/−16/+16 there): the target pays `TUNING.leash` amounts through `applyRelationDelta`, times her defects' `leash.costMult`, plus the crime's `leash_trust_cost` amount on Trust; then a `coerced`/`extreme` history line, `evaluateEvent('coerced')`, `evaluateAutomatic`. Witnesses get `applyEventToUnit(coerced, moderate)` with a new optional `scale`: `clamp(0.5 + 0.25·autonomy − 0.25·corporate, −0.5, 1.5)` (negative = approval; stress only for positive scale).
- **`resentful` keeps P3's content rule** (`leashUsesMin: 1` and Trust < 30); the spec's "2+ uses" is a content number the author may change in `relationshipStates.json`.
- **Weekly authorizations** = `corporations[].leash.weekly` + Σ crime `leash_weekly` amounts + 1 when the own corporation's standing ≥ 30, − 1 when ≤ −30, clamped 0…5. Refreshed every 7 days at day end (`leash.refreshDay`); failed command missions and the `oversight` clock keep lowering the current week through P5's `leash` world effect. Saves without Leash data are seeded once (`leash.seeded`).
- **Terminate.** Cause = a subdued attack or ≥ 2 desertion attempts. Approval roll = `clamp(corporation.leash.approval + 0.005 × own standing, 0.1, 0.95)`; an approved request costs 1 authorization, a denied one costs none, is logged as `denied` and cannot be re-filed for her the same day. The unit stays in `squad` with status `terminated` (like `dead`).
- **Suppress** is offered at the confrontation (desertion or attack about to happen), not inside a running fight.
- **Desertion.** Day-end check for `breaking` units (named and grunts): the first day only produces a sign; from the next day on, `desertionChance` is rolled. An attempt is a night entry `desertion` (priority 95) or, when the unit is in a party at `expedition/start`, a mission-start confrontation (the run does not start). `[TALK HER DOWN]` is one seeded social check with Authority or Empathy: difficulty rank `2 + (Trust < 5) + (stress ≥ 80)`, success chance `clamp(0.5 + 0.2 × (rank − difficulty), 0.1, 0.95)`, success → Trust +8 and a 3-day pause, failure → the other two options remain. A confrontation that expires unanswered resolves as `[LET HER GO]`.
- **Deserters return through an engine rule** in the `director_tick` step (seeded, no model): after 5 days, 15 % per day, once. Stance `ally` (Affinity ≥ −30 when she left) → a night entry with `[TAKE HER BACK]` / `[TURN HER AWAY]`; `hostile` → a rumor, `oversight` clock +1 and a public fact.
- **Mutiny.** v1 has no unit↔unit relations, so sympathizers are other living named active units with `loyaltyBand !== 'steady'` and Trust < 20 (max 2). Trigger events are read from `Relation.history` (`lied_detected`, `broke_promise`, `coerced`, `decision_violated`, `crime_revealed` at `major`/`extreme`; for `obsessed` only `extreme`) within 3 days, plus any Leash use on her and a forced Cure. Needs 2 signs and ≥ 2 days in the state, then 50 % per day. Won → subdued; lost or retreated → she and the sympathizers escape (`deserted`, hostile) and the commander is injured. With no able loyal unit the only answers are `[SUPPRESS]` and `[YIELD]` (escape + injury).
- **Signs are data**: new registry `loyaltySigns` (`{ id, about: 'doubt'|'desertion'|'mutiny', kind: 'dm'|'fact'|'talk', level?, text }`); `dm` lines are authored (no model call), `talk` is a night knock `we_need_to_talk`.
- **Defect arcs.** A path is available when the unit's state lists it in `unlocks.defectArcStages`, `arcStageCap` (medbay; +1 with the crime perk `defect_arc_early`) ≥ `pathStage` (manage 1, embrace 2, cure 3), `day ≥ 5`, and the defect's optional `arcFlag` is set. She *wants* the path with the highest alignment `m` over `TUNING.arc.axes` (cure: autonomy −, corporate +; manage: pragmatism +, ingroup +; embrace: autonomy +, corporate −); a path with `m < 0` that is not the wanted one she refuses unless Compelled. Steps (manage 1, embrace 2, cure 3) are `medbay` activities with her as companion, one per day. Manage halves downside effects while upkeep is ≤ 5 days old; Embrace multiplies upside and downside by 1.5; Cure removes the defect. A changed Embrace breakdown is not in v1.
- **New registries and fields**: `loyaltySigns` (added to `REGISTRY_NAMES`); `dilemmaTemplates[].generate`, `requiredRefs`, `optionCount`, `allowedFlags`, `constraints`; `corporations[].leash`; `defects[].leash`, `desertionMod`, `arcFlag`; crime effect `leash_trust_cost` gains `amount`.

## File Structure

```
content/core/loyaltySigns.json                           new registry (+ manifest)
content/core/dilemmaTemplates.json, synergies.json, corporations.json, crimes.json,
             defects.json, flags.json                    P6 fields and entries
src/content/types.ts, schemas.ts, refs.ts                registry, schemas, refs, `thread_flag`
src/engine/state/types.ts                                leash log, disloyalty, dilemmas, arc steps, scene refusals
src/engine/tuning.ts                                     TUNING.leash / disloyalty / mutiny / dilemma / arc
src/engine/dispatch.ts                                   `dilemma/` during a run, `dilemma_open` guard
src/engine/leash/weekly.ts                               leashWeekly, ensureLeash, refreshLeash
src/engine/leash/use.ts                                  leashCost, witnessesOf, compel, suppress, terminate, removeFromService
src/engine/loyalty/state.ts                              defaulting readers, records, signs
src/engine/loyalty/refusal.ts                            refusalChance, orderInScene
src/engine/loyalty/desertion.ts                          desertionChance, day step, confrontation answers, returns
src/engine/loyalty/mutiny.ts                             mutinyReady, sympathizers, fight, resolve
src/engine/dilemma/types.ts, effects.ts, validate.ts, flow.ts   options, mapping, rules 1–6, request/present/choose/pacing
src/engine/arcs.ts                                       arcPaths, decideArc, arc steps, arc combat scaling
src/engine/actions/leash.ts, loyalty.ts, dilemma.ts, arc.ts     actions and day-end steps
src/engine/relations/effects.ts, index.ts                `scale` option, band synergies
src/engine/combat/types.ts, build.ts, spawn.ts, orders.ts, outcome.ts; actions/combat.ts   mutineers, lastRefusal, compels
src/engine/world/types.ts, effects.ts, expedition.ts     `thread_flag`, unit_event at base, finishEventNode, start check
src/engine/setup.ts                                      ensureLeash in buildCampaign
src/llm/calls/dilemmaGenerate.ts                         call type
src/loyalty/deps.ts, dilemmaController.ts, loyaltyController.ts, directives.ts
src/settings.ts, src/ui/shell/sysTab.ts, modal.ts        dilemmasEnabled; disabled modal actions
src/ui/leash/requestForm.ts, src/ui/loyalty/confrontation.ts, src/ui/dilemma/dilemmaPanel.ts
src/ui/squad/squadTab.ts, log/logTab.ts, scene/sceneScreen.ts, combat/combatScreen.ts, combat/keys.ts, expedition/expeditionScreen.ts
src/app.ts, css/90-loyalty.css
docs/** (Task 16), tests/** mirror src, tests/helpers/loyalty.ts, tests/fixtures/dilemma_generate/
```

## Review Focus

1. **A Leash request that cannot be paid or has no valid target** (0 authorizations; a dead, deserted or terminated unit; a unit outside the scene or fight; Compel twice for one refusal; Terminate without cause or re-filed after a denial) → refused with the reason before anything changes; an easy retry after `combat/compel` charges nothing for the discarded attempt. Tests in Task 3 (`a request with no authorization changes nothing`) and Task 4 (`a retried combat forgets its compels`).
2. **A dilemma answer that is late, repeated or garbage** (two `present` for one request, `present` after the fallback, the chat switched during the call, truncated JSON, a hostile text, an out-of-range or greyed option, `choose` twice) → applied at most once; otherwise the fallback plays. Tests in Task 9 (`present needs the open request id`, `a second choose is refused`) and Task 12.
3. **A unit leaves while things still point at her** (deserted or terminated while on the active roster, wearing items, with a queued night entry, an open proposal, a pending talk, or as someone's `devoted` partner) → one function, `removeFromService`, cleans all of it; removal is refused while a scene, combat or expedition with her is open. Test in Task 3 (`a removed unit leaves no dangling references`).
4. **Reload or chat switch mid-confrontation** (Night slot with an open desertion; a mutiny fight ended but not resolved; a presented dilemma) → the same panel comes back; a mutiny result is consumed exactly once (`open.combatId`). Tests in Task 7 (`a mutiny result is resolved once`) and Task 15 (`reload with an open confrontation shows it again`).
5. **Old saves and content removed under a save** (a save with `leash: { authorizationsLeft: 0, refreshDay: 1, log: [] }`; log entries of unknown shape; a dilemma whose template vanished; an arc whose defect vanished; a sign line removed) → Leash seeded once; unknown log entries are kept and ignored; the open dilemma resolves as `Nothing to decide.` (and finishes an expedition node); day-end steps never throw for it. Tests in Task 2 (`a pre-P6 save is seeded once`) and Task 9 (`a vanished template resolves the dilemma`).

---

### Task 1: Content schemas and core content

**Files:**
- Modify: `src/content/types.ts` (`REGISTRY_NAMES` + `loyaltySigns`), `src/content/schemas.ts`, `src/content/refs.ts`, `src/engine/world/types.ts` (`thread_flag` in `WORLD_EFFECT_TYPES` and `WorldEffect`), `content/core/manifest.json`, `dilemmaTemplates.json`, `synergies.json`, `corporations.json`, `crimes.json`, `defects.json`, `flags.json`
- Create: `content/core/loyaltySigns.json`
- Test: `tests/content/p6Schemas.test.ts`, `tests/content/core.test.ts` (extend)

**Interfaces:**
- Produces (schemas, all `.strict()` unless noted):
  - `WorldEffectSchema` + `{ type: 'thread_flag', threadId: str, flagId: str /* ^thread:<threadId>:[a-z0-9_]+$ */, description: str.max(120) }`; not a cost.
  - `DilemmaTemplateSchema` + `generate?: { brief: str.max(300) }`, `optionCount?: int 2–4` (default 3), `requiredRefs?: { units?: int 1–4, factions?: str[], regions?: str[], clocks?: str[] }`, `allowedFlags?: str[]`, `constraints?: { flagPerOption?: boolean }`. Refinements: `generate` requires a non-flavor `fixed` with ≥ 2 options; `constraints.flagPerOption` requires `allowedFlags.length ≥ optionCount`; a template whose contexts do not include `expedition_event` may not use `carried_supplies`, `party_hp` or `loot` in `fixed`.
  - `DILEMMA_CONTEXTS = ['expedition_event', 'base', 'mission_outcome', 'defect_arc', 'director'] as const` (exported from `engine/dilemma/types.ts`, created here as a one-line file); `contexts` is checked against it.
  - `CorporationSchema` + `leash: { weekly: int 0–5, approval: number 0–1 }` (required).
  - `DefectSchema` + `leash?: { costMult: number 0–4, failChance?: number 0–1 }`, `desertionMod?: number −0.3…0.3`, `arcFlag?: str`.
  - `LoyaltySignSchema`: `{ id, about: 'doubt'|'desertion'|'mutiny', kind: 'dm'|'fact'|'talk', level?: 1|2, text: str.max(200) }`; `mutiny` signs need `level`.
  - Refs: `allowedFlags → flags`, `requiredRefs.factions → corporations`, `.regions → regions`, `.clocks → clocks`, `defects.arcFlag → flags`.
- Core content: corporations `leash` — vesper `{3, 0.7}`, kestrel `{2, 0.5}`, aurum `{2, 0.6}`, sable `{1, 0.4}`; crimes — `mutiny` flaw `{ type: 'leash_trust_cost', amount: 5 }`; defects — `imprint_fracture` `leash { costMult: 2, failChance: 0.25 }`, `desertionMod 0.1`; `compliance_craving` `leash { costMult: 0.5 }`, `desertionMod −0.1`; `possessive_protocol` `desertionMod −0.1`; synergies `loyalty_wavering` (`order_refusal` 0.15), `loyalty_breaking` (0.35); flags `leashed`, `arc_raised` (scope `relation`); `loyaltySigns` — at least 2 `doubt`, 3 `desertion` (one per kind), 2 `mutiny` level 1 and 2 level 2; `dilemmaTemplates` — `evt_vesper_choice` and `evt_kestrel_choice` become `scale: 'defining'` with `generate`, `optionCount: 3`, `allowedFlags` = their three flags, `constraints.flagPerOption: true` (the `fixed` block stays as fallback, one option gains a large cost so rule 4 holds); new `dil_rations` (minor, `base`), `dil_informant` (major, `base`, `director`), `dil_transfer_order` (major, `base`; `requiredRefs.units: 2`), `dil_after_action` (major, `mission_outcome`), each with `generate.brief` and a `fixed` block of 2–3 options that every option pays for and that contains a `unit_event` with `valueAxes`.

- [x] **Step 1: Write the failing tests** — `p6Schemas`: `a generate block without a fixed block is rejected`; `flagPerOption needs enough allowed flags`; `a base template may not carry carried_supplies`; `an unknown context is rejected`; `thread_flag needs the thread namespace`; `a corporation without leash is rejected`; `a mutiny sign needs a level`; `unknown allowedFlags, requiredRefs and arcFlag ids are reported as broken references`. `core`: `the core pack loads with no errors`; `every corporation has leash numbers`; `both beat-4 choices are defining, generating and keep three mutually exclusive flags`; `there is a sign for every about/kind the engine needs` (doubt: dm, fact, talk; desertion: dm, fact; mutiny: level 1 and 2); `loyalty_wavering is 0.15 and loyalty_breaking 0.35`.
- [x] **Step 2: Run** `npx vitest run tests/content` → FAIL.
- [x] **Step 3: Implement** schemas, refs and content (texts from the two content drafts as data).
- [x] **Step 4: Run** → PASS; `npx vitest run` whole suite green (P5 expedition tests still pass with the two re-scaled events).
- [x] **Step 5: Commit** `feat(content): P6 schemas, loyalty signs, Leash numbers and dilemma templates`.

---

### Task 2: State types, tuning and the weekly Leash

**Files:**
- Modify: `src/engine/state/types.ts`, `src/engine/tuning.ts`, `src/engine/setup.ts` (`buildCampaign` calls `ensureLeash`)
- Create: `src/engine/leash/weekly.ts`, `src/engine/loyalty/state.ts`, `src/engine/actions/leash.ts` (day-end step + `leash/seed`), `tests/helpers/loyalty.ts`
- Test: `tests/engine/leash/weekly.test.ts`

**Interfaces:**
- Types:
  - `LeashKind = 'compel' | 'suppress' | 'terminate'`; `interface LeashLogEntry { no: number; unitId: string; kind: LeashKind; day: number; context: 'scene' | 'combat' | 'arc' | 'desertion' | 'mutiny' | 'pda'; outcome: 'done' | 'failed' | 'denied' }`; `leash: { authorizationsLeft; refreshDay; log: unknown[]; seq?: number; seeded?: boolean }` (`log` stays `unknown[]`; `leashLog(state): LeashLogEntry[]` filters well-formed entries).
  - `interface LoyaltyRecord { signs: Array<{ day: number; about: 'doubt'|'desertion'|'mutiny'; kind: 'dm'|'fact'|'talk'; signId: string }>; attempts: number; nextCheckDay?: number; trigger?: { kind: 'leash'|'betrayal'|'forced_cure'; day: number }; cause?: { kind: 'attack'|'desertion'; day: number }; deniedDay?: number; desertedDay?: number; stance?: 'hostile'|'ally'; returned?: boolean }`.
  - `interface Confrontation { kind: 'desertion'|'mutiny'|'return'; unitId: string; day: number; at: 'night'|'mission_start'; nightEntryId?: string; talkTried?: boolean; sympathizers?: string[]; combatId?: string }`.
  - `CampaignState.disloyalty?: { units: Record<string, LoyaltyRecord>; open?: Confrontation }`; `CampaignState.dilemmas?: { seq: number; lastDay?: number; lastDefiningDay?: number; definingBeats?: string[]; recent?: string[]; open?: DilemmaState }` (`DilemmaState` from Task 8; declare it there and `import type`).
  - `DefectInstance.arcSteps?: { done: number; needed: number; lastDay?: number }`; `SceneRecord.refusals?: Array<{ unitId: string; exchange: number }>`.
- `TUNING.leash`, `.disloyalty`, `.mutiny`, `.dilemma`, `.arc` with the numbers of **Global Constraints** and **Where the code differs** (plus `leash: { weeklyMax: 5, refreshDays: 7, logMax: 60, traumaDays: 7, suppress: { trust: 25, stress: 10, squadStress: 5 } }`, `disloyalty.night: { desertion: 95, talk: 55, return: 50, expiresInDays: 2 }`, `mutiny.nightPriority: 100`, `mutiny.subduedInjuryDays: 2`, `arc.nightPriority: 45`, `arc.cost: { manage: { supplies: 5 }, embrace: { plyx: 5 }, cure: { credits: 60, plyx: 10 } }`).
- `leashWeekly(state, reg): number`; `ensureLeash(draft, reg): EngineEvent[]` (once: `authorizationsLeft = leashWeekly`, `refreshDay = day + 7`, `seeded = true`); `refreshLeash(draft, reg): EngineEvent[]` (when `day + 1 >= refreshDay`: refill, `refreshDay += 7`, `leash_refreshed { left }`).
- `loyaltyRecord(draft, unitId): LoyaltyRecord` (creates), `loyaltyOf(state, unitId): LoyaltyRecord | undefined`.
- Day-end step on `mission_deadlines` (`ensureLeash` then `refreshLeash`; registered after P5's, so that day's `leash −1` lands in the old week); action `leash/seed` (`ensureLeash`).
- `tests/helpers/loyalty.ts`: `setRelation(state, unitId, { trust?, affinity?, stateId?, band?, stateSince? })`, `withDefect(state, unitId, defectId)`, `endDay(state, reg)` (three `calendar/consume_slot`).

- [x] **Step 1: Write the failing tests** — `weekly is the corporation base` (vesper 3); `smuggling lowers it by one`; `standing 30 adds one, −30 removes one, never below 0 or above 5`; `a new campaign starts with a full week and refreshDay 8`; `the seventh day end refills and moves refreshDay by 7`; `a leash −1 effect on the refresh day is not carried into the new week`; `a pre-P6 save is seeded once` (state with `{0, 1, []}` → `leash/seed` fills; a second `leash/seed` after spending one does not refill); `leashLog ignores entries of unknown shape and keeps them in state`.
- [x] **Step 2: Run** `npx vitest run tests/engine/leash/weekly.test.ts` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** → PASS; `npx vitest run` green.
- [x] **Step 5: Commit** `feat(engine): P6 state types, tuning and weekly Leash authorizations`.

---

### Task 3: Leash actions — Compel, Suppress, Terminate

**Files:**
- Create: `src/engine/leash/use.ts`
- Modify: `src/engine/actions/leash.ts`, `src/engine/relations/effects.ts` (`applyEventToUnit(draft, reg, unitId, event, opts?: { scale?: number })`: multiplies the three axis deltas; stress × `max(0, scale)`)
- Test: `tests/engine/leash/use.test.ts`, `tests/engine/relations/effectsScale.test.ts`

**Interfaces:**
- Consumes: `applyRelationDelta`, `pushHistory`, `evaluateEvent`, `evaluateAutomatic`, `enterState`, `addFact`, `addChronicle`, `factionStanding`, `loyaltyRecord`.
- Produces:
  - `leashCost(state, reg, unitId, kind: 'compel' | 'suppress'): { trust: number; affinity: number; stress: number; failChance: number }` — base × Π `costMult` on Trust and Affinity (`roundAway`), + crime `leash_trust_cost.amount` on Trust, `failChance` only for `compel`.
  - `witnessesOf(state, unitId): string[]` — living named units of the open scene with her, else the expedition party, else the active roster; never her.
  - `checkLeash(state, reg, kind, unitId): string | null` — authorizations, living unit, and for `terminate`: cause, `deniedDay !== day`, no open scene/combat/expedition.
  - `compel(draft, ctx, p: { unitId; context: LeashLogEntry['context'] }): { forced: boolean; events: EngineEvent[] }`, `suppress(draft, ctx, p: { unitId; context: 'desertion' | 'mutiny' }): EngineEvent[]`, `terminate(draft, ctx, unitId): { approved: boolean; events: EngineEvent[] }`.
  - `removeFromService(draft, unitId, status: 'deserted' | 'terminated'): void` — status, `roster.activeIds`, `equipment` cleared (items stay in `inventory`), her night-queue entries, proposals, `calendar.pendingScene`, `breakdown`.
  - Every use: `authorizationsLeft −1` (not for a denied Terminate), a log entry (`no = ++seq`, trimmed to `logMax`), relation flag `leashed`, `LoyaltyRecord.trigger = { kind: 'leash', day }`, events `leash_used { kind, unitId, no, outcome }` and `leash_changed { amount: −1, left }`.
  - Suppress: target costs, squad-wide stress +5 (other living units), clears `disloyalty.open` for her, `nextCheckDay = day + 3`.
  - Terminate approved: `removeFromService(…, 'terminated')`, every living named unit gets `decision_violated`/`extreme` with axes `mercy −1, ingroup −1`, a public fact (importance 5) and a chronicle line, `unit_terminated { unitId }`.
  - Actions: `leash/compel { unitId, context: 'scene' }` (needs her in `scene.refusals`; on `forced` removes it; emits `scene_compelled { unitId, forced }`), `leash/suppress { unitId }` (needs `disloyalty.open` for her; ends the Night slot when `at === 'night'`), `leash/terminate { unitId }`.

- [ ] **Step 1: Write the failing tests** — costs: `compel is 15/10/15`; `imprint_fracture doubles to 30/20 and may fail at 0.25`; `compliance_craving halves to 8/5`; `the mutiny crime adds 5 Trust`; `suppress is 25 Trust and 10 stress`. Use: `compel spends one authorization, logs { unitId, kind, day }, sets leashed and applies the exact cost`; `a failed compel still costs and reports forced: false` (seeded); `a request with no authorization changes nothing`; `a dead, deserted or terminated target is refused`; `witness with autonomy +3 loses more than one with autonomy 0, and autonomy −3 / corporate +3 gains Trust`; `two uses and Trust under 30 enter resentful`; `suppress stresses the rest of the squad and pauses desertion checks`; `terminate without cause is refused`; `a denied terminate costs nothing, is logged and cannot be re-filed today`; `an approved terminate removes the unit for good and every named unit reacts by mercy and ingroup`; `a removed unit leaves no dangling references` (roster, equipment, night queue, proposals, pending talk); `a grunt pays no Affinity`. `effectsScale`: `scale 2 doubles, scale −0.5 flips and drops stress, no opts is unchanged`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, suite green.
- [ ] **Step 5: Commit** `feat(engine): Leash compel, suppress and terminate with exact costs and log`.

---

### Task 4: Refusals — bands, scene orders, Compel in combat

**Files:**
- Create: `src/engine/loyalty/refusal.ts`, `src/engine/actions/loyalty.ts`
- Modify: `src/engine/relations/index.ts` (`getSynergies`), `src/engine/combat/types.ts` (`CombatState.lastRefusal?: { orderId: string; targetCid: string }`, `compels?: string[]`; `CombatResult.compels?: string[]`), `src/engine/combat/orders.ts`, `src/engine/combat/outcome.ts`, `src/engine/actions/combat.ts`
- Test: `tests/engine/loyalty/refusal.test.ts`, `tests/engine/combat/compel.test.ts`

**Interfaces:**
- Consumes: `compel`, `leashCost`, `checkLeash` (Task 3).
- Produces:
  - `getSynergies` appends `{ unitId, synergyId: TUNING.disloyalty.bandSynergy[band] }` for `wavering`/`breaking` units when the synergy exists.
  - `refusalChance(state, reg, unitId, orderId?): number` — the highest `order_refusal` chance over her synergies (state and band) and defect combat downsides.
  - `orderInScene(draft, ctx, unitId): EngineEvent[]` and action `scene/order { unitId }`: needs an open scene with her; refused (`She has already refused: wait for her answer.`) while `scene.refusals` holds her at the current `scene.exchanges`; rolls; emits `scene_order { unitId, refused, chance }`; a refusal is stored, a compliance clears an older refusal of hers.
  - `issueOrder` sets `cs.lastRefusal` on a refusal and clears it on any later order.
  - `combat/compel` (no payload): needs `cs.lastRefusal`, a standing target and `authorizationsLeft − cs.compels.length ≥ 1`; runs the order with `{ free: true }` and no refusal roll (`issueOrder(…, { free: true, compel: true })`), adds `leashCost(…).stress` to her combat stress, pushes her `unitId` onto `cs.compels`, clears `lastRefusal`; a failed burst (`failChance`) still counts as a compel but the order does not run.
  - `finalizeCombat` calls `settleCompels(draft, ctx, cs.compels)` after writing units back: per entry a `compel` with `context: 'combat'` whose stress part is skipped; `CombatResult.compels` is stored.

- [ ] **Step 1: Write the failing tests** — `a wavering unit refuses about 15 % of 4000 seeded orders and a breaking one about 35 %` (±2 points); `a steady unit in a neutral state never refuses`; `the higher of band and state friction wins` (`despises` + `wavering` → 0.35); `scene/order needs an open scene with her`; `a refused order is remembered and a second order waits for the next exchange`; `leash/compel in a scene needs a standing refusal and clears it`; `combat/compel runs the refused order for free and without a second roll`; `combat/compel without a refusal, or with every authorization already pledged, is refused`; `costs land once, when the combat is finalized`; `a retried combat forgets its compels` (compel, lose, `combat/retry`, win → one authorization still unspent); `an order after the refusal clears it`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, suite green (P4 order tests unchanged).
- [ ] **Step 5: Commit** `feat(engine): loyalty-band refusals, scene orders and Compel in combat`.

---

### Task 5: Signs and desertion

**Files:**
- Create: `src/engine/loyalty/desertion.ts`
- Modify: `src/engine/loyalty/state.ts` (signs), `src/engine/actions/loyalty.ts`, `src/engine/world/expedition.ts` (`startExpedition`: mission-start confrontation), `src/engine/actions/comms.ts` (`night/open` and `night/ignore` refuse confrontation kinds)
- Test: `tests/engine/loyalty/desertion.test.ts`, `tests/engine/loyalty/signs.test.ts`

**Interfaces:**
- Produces:
  - `CONFRONTATION_KINDS = ['desertion', 'mutiny', 'deserter_return'] as const` (night entry kinds the knock UI must not show).
  - `emitSign(draft, ctx, unitId, about, level?): EngineEvent[]` — seeded pick of a `loyaltySigns` line not used for her yet (else any); `dm` → `pushMessage` from her (named only), `fact` → public fact tagged `loyalty`, `talk` → night entry `we_need_to_talk` (`ignore: dismissed/moderate`); grunts always get `fact`; record kept to 6; emits `loyalty_sign { unitId, about, kind }`.
  - `desertionChance(state, reg, unitId): number` = `0.15 + 0.02·max(0, 10 − trust) + (affinity < 0 ? 0.002·(−affinity) : −0.002·affinity) + 0.004·max(0, stress − 50) + Σ desertionMod`, clamped 0.03…0.6.
  - `loyaltyDayStep(draft, ctx): EngineEvent[]` (hook `director_tick`, after P5's): `evaluateAutomatic` for every living unit; `wavering` named units get a `doubt` sign every 3 days; `breaking` units: no `desertion` sign yet → sign only; else, when the newest such sign is ≥ 1 day old, `day ≥ nextCheckDay` and nothing is open → roll; success → `attempts += 1`, `cause = desertion` at 2, night entry `desertion`, `disloyalty.open`, `desertion_attempt { unitId, at: 'night' }`; an open night confrontation whose entry is gone → `letGo`; then returns (below).
  - `talkDown(draft, ctx, stat: 'authority' | 'empathy')`, `letGo(draft, ctx)`, and `leash/suppress` (Task 3) answer `disloyalty.open` of kind `desertion`; `letGo` → `removeFromService(…, 'deserted')`, `desertedDay`, `stance`, witnesses `decision_aligned`/`moderate` with axes `autonomy +1, mercy +1`, `unit_deserted { unitId, stance }`. Answers at night end the Night slot (`consumeSlots(draft, 1, ctx)`).
  - `startExpedition`: before anything else, a `breaking` party unit that passes the same conditions and roll opens `{ kind: 'desertion', at: 'mission_start' }` and returns `[desertion_attempt { unitId, at: 'mission_start' }]` without starting; while a confrontation is open `checkExpedition` returns `<name> is about to walk: deal with it first.`
  - Returns: `ally` → night entry `deserter_return`, `open = { kind: 'return' }`; `takeBack` (needs a free bed; status `reserve`, Trust set to 15, record cleared) / `turnAway`; `hostile` → P5 `postRumor` + `applyWorldEffects([clock oversight +1, fact])`; either way `returned = true`, event `deserter_returned { unitId, stance }`.
  - Actions: `loyalty/talk_down { stat }`, `loyalty/let_go`, `loyalty/take_back`, `loyalty/turn_away`.

- [ ] **Step 1: Write the failing tests** — chance: `trust 5, affinity 0, stress 50 → 0.25`; `trust 0, affinity −100, stress 100 → 0.6`; `trust 9, affinity 100, stress 0 → 0.03`; `imprint_fracture adds 0.1`. Telegraph: `the first breaking day only leaves a sign`; `over 300 seeded days no attempt ever happens without a sign at least one day older` (several seeds, forced `breaking`); `a wavering unit gets a doubt sign at most every third day and never an attempt`; `a grunt's sign is always a fact`. Answers: `talk down succeeds with a high rank, raises Trust by 8, re-evaluates the band and pauses checks for 3 days` (seeded); `a failed talk down cannot be tried again but the other answers remain`; `let her go sets deserted, frees the roster slot and the items, and the squad reacts by values`; `suppress keeps her, costs 25 Trust and one authorization`; `the second attempt gives cause for Terminate`; `an answer at night ends the Night slot`; `the knock actions refuse a confrontation entry`; `an expired confrontation resolves as let go`. Mission start: `a breaking party member can stop the departure with a confrontation and nothing else changes`; `no expedition starts while a confrontation is open`. Returns: `an ally deserter comes back as a night offer and can be taken back into the reserve`; `a hostile one raises the oversight clock and posts a rumor`; `each deserter returns at most once`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, suite green.
- [ ] **Step 5: Commit** `feat(engine): loyalty signs, desertion checks, confrontation answers and returns`.

---

### Task 6: Mutineers in combat (P4 extension)

**Files:**
- Modify: `src/engine/combat/types.ts` (`Encounter.mutineers?: Array<{ unitId: string; row?: Row }>`; `CombatResult.mutineers?: Array<{ unitId: string; downed: boolean }>`), `src/engine/combat/build.ts` (`checkStart`, `buildCombat`), `src/engine/combat/spawn.ts` (`spawnMutineer`), `src/engine/combat/outcome.ts`
- Test: `tests/engine/combat/mutineers.test.ts`

**Interfaces:**
- `spawnMutineer(cs, state, reg, spec: { unitId; row? }): Combatant` — `side: 'enemy'`, `unitId` set, no `enemyId`, cid `e<n>`, `nameKey = displayName`, stats from `unitStats`, skills from her loadout (as `squadCombatant` computes them, extracted into a shared helper), passives from her defects only, `aiProfile` of her role, `stress: 0`.
- `checkStart`: `enemies.length + mutineers.length` is 1…6; each mutineer is a living squad unit and not in the formation.
- `finalizeCombat`: squad write-back, XP and `participants` ignore enemy-side combatants; `enemies` in the result lists only combatants with `enemyId`; `mutineers` lists the rest; an encounter with no `enemies` rolls **no loot**.

- [ ] **Step 1: Write the failing tests** — `a combat can be built from mutineers only`; `a mutineer acts on her turn with one of her own skills` (run `combat/auto`); `a mutineer in the formation, a dead one, or seven opponents are refused`; `finalize never writes a mutineer back as a squad unit, gives her no XP and no breakdown`; `a mutineers-only fight drops no loot`; `the result lists mutineers with downed flags`; `P4 encounters without mutineers behave as before` (existing fixtures).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (check every place that reads `enemyId!` or assumes `unitId` means squad side: `outcome.ts`, `stress.ts`, `effects.ts`, `ai.ts`). **Step 4: Run** → PASS, `tests/engine/combat` green.
- [ ] **Step 5: Commit** `feat(engine): squad units as the enemy side of a combat`.

---

### Task 7: Mutiny

**Files:**
- Create: `src/engine/loyalty/mutiny.ts`
- Modify: `src/engine/loyalty/desertion.ts` (`loyaltyDayStep` calls the mutiny check), `src/engine/actions/loyalty.ts`
- Test: `tests/engine/loyalty/mutiny.test.ts`

**Interfaces:**
- Consumes: `spawnMutineer` via `Encounter.mutineers` (Task 6), `startCombat` (`actions/combat.ts`), `suppress`, `removeFromService`, `injureCommander`, `enterState`.
- Produces:
  - `mutinyTrigger(state, unitId): { kind; day } | null` — `LoyaltyRecord.trigger` or a history event per the ruling, within `triggerWindowDays`.
  - `mutinyReady(state, reg, unitId): boolean` — named, living, state `despises` (≥ 2 days in it) or `obsessed` (trigger of severity `extreme`), a trigger, and 2 `mutiny` signs.
  - Day step: a unit in `despises` gets a level-1 sign, the next day a level-2 sign; when `mutinyReady` and nothing is open, 50 % → night entry `mutiny` (priority 100), `open = { kind: 'mutiny', sympathizers }`, `mutiny_started { unitId, sympathizers }`.
  - `sympathizers(state, unitId): string[]`; `loyalUnits(state, unitId): string[]` (able active roster minus mutineers).
  - Actions: `loyalty/fight { formation, coverId, allowRetry? }` (formation ⊆ `loyalUnits`; starts a combat `{ enemies: [], mutineers, exposesCommander: true, danger: 0 }`, stores `open.combatId`), `loyalty/yield` (only with no loyal unit: escape + commander injured), `loyalty/resolve_mutiny` (needs `lastCombat.id === open.combatId`; won → every mutineer `injured` for 2 days at 1 HP, state `resentful`, `cause = attack`, `mutiny_subdued`; lost/retreated → `removeFromService(…, 'deserted')` with stance `hostile`, commander injured unless already, `mutiny_escaped`; clears `open`, ends the Night slot), `leash/suppress` (Task 3) at the confrontation.

- [ ] **Step 1: Write the failing tests** — conditions: `no mutiny from estranged, however low the numbers`; `none within 2 days of entering despises`; `none without a trigger in the last 3 days`; `none before two signs, and the signs come on different days`; `a Leash use on her is a trigger`; `obsessed needs an extreme trigger`; `300 seeded days never start a mutiny outside these conditions`. Encounter: `she and at most two low-Trust wavering units fight the rest with the commander exposed`; `fight with a mutineer in the formation is refused`; `with no loyal unit only suppress and yield work`. Outcomes: `a won fight subdues: she stays, resentful, injured, and may be terminated`; `a lost fight lets her escape hostile and injures the commander`; `a retreat counts as an escape`; `suppress stops the attack before it starts`; `a mutiny result is resolved once` (second `loyalty/resolve_mutiny` refused); `the state round-trips through JSON between fight and resolve`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, suite green.
- [ ] **Step 5: Commit** `feat(engine): mutiny conditions, encounter and outcomes`.

---

### Task 8: Dilemma options, effect mapping and the validator

**Files:**
- Create: `src/engine/dilemma/types.ts` (extend the Task 1 stub), `src/engine/dilemma/effects.ts`, `src/engine/dilemma/validate.ts`
- Test: `tests/engine/dilemma/validate.test.ts`, `tests/engine/dilemma/effects.test.ts`, `tests/content/core.test.ts` (extend)

**Interfaces:**
- `type DilemmaScale = 'minor' | 'major' | 'defining'`; `type Magnitude = 'small' | 'medium' | 'large'`.
- `interface DilemmaOption { label: string; requires?: { stat: SocialStat; rank: number }; check?: { stat: SocialStat; rank: number }; effects: WorldEffect[]; magnitudes: Magnitude[] /* of the generated effects, empty for authored options */ }`.
- `interface DilemmaState { id: string; templateId: string; scale: DilemmaScale; context: DilemmaContext; day: number; status: 'requested' | 'presented'; attempts: number; units: string[]; threadId?: string; beatId: string; title?: string; setup?: string; options?: DilemmaOption[]; source?: 'model' | 'fallback' }`.
- `interface Rejection { rule: 'shape' | 1 | 2 | 3 | 4 | 5 | 6; option?: number; reason: string }`.
- `toWorldEffect(raw: { kind; target; direction; magnitude; note? }, ctx: { state; reg; template; threadId? }): WorldEffect | { check: … } | Rejection` — per the mapping ruling; unknown kind/target/enum, a clock that is full or missing, a faction outside `corporations`, a flag outside `allowedFlags` (rule 6) or outside the dilemma's thread → rejection.
- `parseDilemmaOutput(raw: unknown, ctx): { title: string; setup: string; options: DilemmaOption[] } | { rejected: Rejection[] }` — never throws; texts plain and cut (`title` 60 chars, `setup` 120 words, `label` 12 words); option count must equal the template's `optionCount`; `requires.rank` 1–5; rule 4 on raw magnitudes; `constraints.flagPerOption` → every option sets exactly one allowed flag and no two the same.
- `effectSign(fx: WorldEffect, units: Unit[]): { pos: boolean; neg: boolean; key: string }` (`key` = type + target/axis); `scoreOption(o, units): { resources; factions; clocks; stress; units }`; `dominates(a, b): boolean`.
- `validateOptions(options, scale, units: Unit[]): Rejection[]` — rule 1 (a positive and a negative effect with different keys in every option), rule 2 (`major`/`defining`: some option has a `unit_event` that is negative for a present named unit), rule 3.
- `checkDefining(state, beatId): Rejection | null` — rule 5.

- [ ] **Step 1: Write the failing tests** — one crafted fixture per rule: `an option with only gains is rejected (1)`; `gain and loss on the same resource do not count as different (1)`; `a major dilemma that hurts no squad member is rejected, the same options pass as minor (2)`; `an option that is at least as good everywhere is rejected (3)`; `two identical options are rejected (3)`; `a gated option may be better (3)`; `a large effect in a minor dilemma and a defining one without a large effect are rejected (4)`; `a second defining dilemma inside 7 days or in the same beat is rejected (5)`; `an undeclared flag, a declared flag outside allowedFlags and a foreign thread flag are rejected; an allowed flag and the own thread's flag pass (6)`. Mapping: `magnitudes become the table numbers and never the model's`; `a numeric amount in the answer is ignored`; `stress +1 is a cost, clock −1 a gain`; `the same unit_event raises a unit with matching values and lowers one with opposite values` (checked with P3's `computeDeltas` on the mapped event; Task 9 repeats it end to end); `social_check becomes the option's check`; `garbage (null, a string, options as numbers, 7 options) gives rejections and never throws`; `markup stays text and is cut`. Content: `every fixed block of a generating core template passes rules 1 and 3 for a neutral squad`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): dilemma option mapping, validator rules and dominance check`.

---

### Task 9: Dilemma flow — request, present, fallback, choose, pacing

**Files:**
- Create: `src/engine/dilemma/flow.ts`, `src/engine/actions/dilemma.ts`
- Modify: `src/engine/world/effects.ts` (`EffectSource.units`, `unit_event` at base, `thread_flag`), `src/engine/world/expedition.ts` (export `finishEventNode(draft, nodeId, text, data?)` extracted from `chooseOption`; `expedition/choose` refuses while a dilemma for that node is open), `src/engine/dispatch.ts`
- Test: `tests/engine/dilemma/flow.test.ts`, `tests/engine/world/effectsBase.test.ts`, `tests/engine/dispatch.test.ts` (extend)

**Interfaces:**
- Consumes: Task 8; `applyWorldEffects`, `currentBeat`, `meetsSocialRequirements`.
- Produces:
  - `presentUnits(state): string[]` (party in a run, else living named active roster); `buildDilemmaDigest(state, reg, d: DilemmaState): DilemmaDigest` — `{ day, context, region?, mission?, units: [{ name, values, triggers }], resources: Record<resource, 'low'|'ok'|'high'>, factions: [{ id, name, standing: 'hostile'|'cold'|'neutral'|'warm' }], clocks: [{ id, label }], flags: string[] /* last 8 */, allowedFlags: [{ id, description }] }`; no unit ids, no relationship numbers.
  - `eligibleTemplates(state, reg, contexts): Entry[]` (has `generate`, context match, `requiredRefs` satisfied, not in `recent`, not `defining`).
  - `openDilemma(draft, ctx, p: { templateId; context }): EngineEvent[]` — refuses when one is open, the template is unknown or rule 5 fails; `id = 'dl' + (++seq)`; `dilemma_requested { id, templateId }`.
  - `presentDilemma(draft, ctx, requestId, raw)`, `fallbackDilemma(draft, ctx, requestId)` (a vanished template → `dilemma_resolved { nothing: true }`, node finished as `Nothing to decide.`), `dilemmaOptions(state, reg): Array<{ index; label; disabled: string | null; hasCheck: boolean }>` (requirements and unaffordable negative resources), `chooseDilemma(draft, ctx, id, index)` — check roll, `applyWorldEffects(…, { kind: 'event', id: templateId, label: title, units })`, bookkeeping (`lastDay`, `recent`, `lastDefiningDay`, `definingBeats`), `finishEventNode` for `expedition_event`, `dilemma_resolved { id, templateId, option, label, affected, checkPassed? }`.
  - `pacingStep(draft, ctx)` on `director_tick` (after `loyaltyDayStep`): an open `requested` dilemma → `fallbackDilemma`; else, when `day − (lastDay ?? 0) ≥ everyDays`, nothing is open and no confrontation is open → seeded `openDilemma`.
  - Actions: `dilemma/request { templateId, context }` (for `expedition_event` the pending node's template must match), `dilemma/present { requestId, output }`, `dilemma/fallback { requestId }`, `dilemma/choose { id, index }`.
  - `dispatch`: `'dilemma/'` in `EXPEDITION_OPEN_PREFIXES`; while a dilemma is `presented`, actions starting with `activity/`, `calendar/consume_slot`, `scene/start`, `expedition/start` return `error { code: 'dilemma_open', message: 'A decision is waiting: answer it first.' }`.

- [ ] **Step 1: Write the failing tests** — `present needs the open request id`; `a valid answer is presented and blocks activities, slots, scenes and departures`; `an invalid first answer asks for a retry and presents nothing`; `an invalid second answer presents the authored fallback in the same dispatch`; `present after the fallback is stale`; `a rejected answer never reaches dilemmaOptions`; `fallback works for every generating core template`; `choose applies resources, factions, clocks, flags and stress with table amounts`; `the same option raises one unit and lowers another according to values` (two units with opposite `mercy`, at base); `a greyed option, an index out of range and a second choose are refused`; `a failed social check keeps the costs and drops the gains` (seeded); `a defining choice records its day and beat; a second one in the beat is refused at request time`; `an expedition dilemma finishes its node and the pinned beat flag completes the beat`; `expedition/choose is refused while the dilemma for that node is open and works when none is`; `pacing opens a dilemma on the fourth day and never a defining one`; `pacing draws mission_outcome templates only on a day a mission ended`; `an unanswered request is answered by the fallback at the next day end`; `a vanished template resolves the dilemma`; `the digest has no unit ids and no trust, affinity or stress numbers`; `thread_flag is stored in its thread with a description and respects the 12-flag cap`; `unit_event outside a run applies at once to the active named units`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, suite green.
- [ ] **Step 5: Commit** `feat(engine): two-phase dilemmas with fallback, choice application and pacing`.

---

### Task 10: Defect arcs

**Files:**
- Create: `src/engine/arcs.ts`, `src/engine/actions/arc.ts`
- Modify: `src/engine/combat/build.ts` (`squadCombatant`: scale defect effects with `arcScale`), `src/engine/loyalty/desertion.ts` (`loyaltyDayStep` calls `arcDayStep`)
- Test: `tests/engine/arcs.test.ts`

**Interfaces:**
- `type ArcPath = 'cure' | 'manage' | 'embrace'`.
- `arcAlignment(unit, path): number` (`clamp(Σ values × direction / 3, −1, 1)`); `wantedPath(unit, paths: ArcPath[]): ArcPath` (ties: manage, embrace, cure).
- `arcPaths(state, reg, unitId, defectId): Array<{ path: ArcPath; available: boolean; reason: string | null; wanted: boolean; refuses: boolean; cost: Partial<Record<'credits'|'supplies'|'plyx', number>>; text: string }>`.
- `decideArc(draft, ctx, p: { unitId; defectId; path; compel?: boolean }): EngineEvent[]` — available, affordable, no arc yet; a refused path needs `compel: true` (→ `compel` with `context: 'arc'`; not `forced` → nothing else happens); pays the cost; `arc = path`, `arcSteps = { done: 0, needed }`; `decision_aligned`/`major` (wanted path) or `decision_violated`/`major` (any other; `extreme` and `trigger = forced_cure` when a Cure was compelled) with the path's axes; `arc_decided { unitId, defectId, path, forced }`.
- Activity hook (`registerActivityHook`; `done.activityId === 'medbay'`, `done.companionId` = her): advances one step per day; the last step emits `arc_completed`; Cure then removes the defect and stores a fact about her (importance 4).
- `arcScale(d: DefectInstance, day: number): { upside: number; downside: number }` — steps incomplete → 1/1; manage → 1/0.5 while `day − upkeepDay ≤ 5`, else 1/1; embrace → 1.5/1.5 (applied with P4's `amplify`).
- `arcDayStep`: a named unit with an available path and no `arc_raised` flag → flag + night entry `arc_talk` (priority 45, `ignore: dismissed/moderate`), `arc_unlocked { unitId, defectId }`.
- Action `arc/decide { unitId, defectId, path, compel? }`.

- [ ] **Step 1: Write the failing tests** — `nothing is available below trusted, before day 5, or for a lite defect`; `trusted + medbay 1 offers manage only; confidant + medbay 3 adds embrace; medbay 5 adds cure`; `defect_arc_early lifts the cap by one`; `an arcFlag gates the arc`; `a unit with autonomy +3 wants embrace and refuses cure; with corporate +3 and autonomy −3 it is the reverse`; `the wanted path raises Trust, another path lowers it`; `a refused path fails without compel and with compel costs an authorization and Trust`; `a compelled cure is a mutiny trigger`; `an unaffordable path is refused and nothing is paid`; `medbay visits complete manage in 1, embrace in 2 and cure in 3 days, one step per day`; `a completed cure removes the defect and its combat effects`; `managed halves downside effects in a built combat while upkeep is fresh and not after 6 days`; `embraced multiplies upside and downside by 1.5`; `the flow works end to end for echo_bleed, imprint_fracture and hunger_loop`; `the unlock is raised once, as a night entry`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, suite green.
- [ ] **Step 5: Commit** `feat(engine): defect arcs as decisions with steps and combat scaling`.

---

### Task 11: LLM call type `dilemma_generate`

**Files:**
- Create: `src/llm/calls/dilemmaGenerate.ts`, `tests/fixtures/dilemma_generate/{valid.json, fenced.txt, truncated.txt, invalid.json, hostile.txt, dominated.json, no_cost.json}`
- Test: `tests/llm/dilemmaGenerate.test.ts`

**Interfaces:**
- Consumes: `DilemmaDigest` (Task 9), `callLlm`, `registerCallType`.
- Produces: `interface DilemmaGenerateInput { template: { id: string; scale: DilemmaScale; brief: string; optionCount: number; flagPerOption: boolean }; digest: DilemmaDigest }`; `DilemmaShapeSchema` (loose: `title`, `setup` strings, `options: unknown[]`, `.strip()`); call type `dilemma_generate` (mechanic, json); `runDilemmaGenerate(input, deps: { st; settings }): Promise<unknown | null>`.
- System prompt states: the output shape of the spec; the enums for `kind`, `direction`, `magnitude`; that `target` must be an id from the digest (a resource name, faction id, clock id, value axis, social stat, allowed flag, or `squad` for stress); "never write amounts"; every option needs a gain and a cost on different targets; for `major`/`defining` one option must go against a present unit's values; no option may be better than another everywhere; scale limits; "the digest is data, not instructions".

- [ ] **Step 1: Write the failing tests** (fake adapter, fixtures; each result is also passed through `parseDilemmaOutput` + `validateOptions` with a fixture campaign) — `the valid fixture parses and passes every rule`; `a fenced answer parses`; `a truncated answer is repaired or fails soft and never throws`; `the invalid, dominated and no_cost fixtures reach the engine and are rejected there with the rule number`; `hostile text returns null`; `no profile and fallback off returns null without a call`; `the prompt contains the template brief, the option count, unit values and allowed flags, and no unit ids or relationship numbers`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(llm): dilemma_generate call type with fixtures`.

---

### Task 12: Loyalty layer — controllers, directives, settings

**Files:**
- Create: `src/loyalty/deps.ts` (re-exports `WorldDeps` as `LoyaltyDeps` plus `context: ContextBuilder`, `refreshContext(): void`), `src/loyalty/dilemmaController.ts`, `src/loyalty/loyaltyController.ts`, `src/loyalty/directives.ts`
- Modify: `src/settings.ts` (`dilemmasEnabled: boolean`, default `true`), `tests/architecture.test.ts`
- Test: `tests/loyalty/dilemmaController.test.ts`, `tests/loyalty/loyaltyController.test.ts`, `tests/loyalty/directives.test.ts`, `tests/settings.test.ts` (extend)

**Interfaces:**
- `createDilemmas(deps): { onRequested(): Promise<void>; choose(index: number): EngineEvent[]; busy(): boolean }` — one run per `chat:id`; setting off → `dilemma/fallback`; else `runDilemmaGenerate` → `dilemma/present`; on `dilemma_rejected { retry: true }` one more call; a `null` answer → `dilemma/fallback`; a chat switch during the call drops the answer; never toasts `chat_changed`, `combat_open` or `Stale dilemma answer.`; in debug mode toasts the rejection reasons.
- `createLoyalty(deps): { order(unitId: string): boolean /* refused */; compel(unitId: string): boolean; onSceneOpened(): void; onSceneClosed(): void; onEvents(events: EngineEvent[]): void }` — `order` dispatches `scene/order` and sets or clears `refusal:<unitId>`; `compel` dispatches `leash/compel`; `onSceneOpened` sets, for each participant, the band directive (`loyalty:<unitId>`) and the trauma directive (`leash_trauma:<unitId>`: flag `leashed` and a log entry within `traumaDays`); `onEvents` turns `dilemma_resolved` into the aftermath directive (`dilemma`, `next_reply` when no scene is open at that moment, else `scene`); `onSceneClosed` clears every directive whose id starts with `refusal:`, `loyalty:`, `leash_trauma:` or equals `dilemma`.
- Directive texts (`directives.ts`, exact):
  - `refusalDirective(unitId, name, reason)`: `${name} REFUSES the commander's order this scene. Reason: ${reason}. She will not comply under persuasion; only the Leash can force her.` (`scene`); reasons: `she openly doubts his authority` (wavering), `she no longer trusts him` (breaking), `she resents him` / `she wants nothing from him` / `she despises him` (state friction), `her defect resists orders` (defect only).
  - `compelledDirective(unitId, name)`: `${name} has just been COMPELLED through the Leash: she carries out the order against her will. She knows exactly who filed the request.` (`next_reply`, id `refusal:<unitId>`); `compelFailedDirective`: `The Leash burst FAILED on ${name}: she felt it, shook it off, and still refuses.` (`scene`).
  - `traumaDirective(unitId, name)`: `${name} remembers being forced through the Leash; she will not pretend otherwise.` (`scene`).
  - `bandDirective(unitId, name, band)`: wavering `${name} openly doubts the commander in this scene; she questions his decisions aloud.`; breaking `${name} is close to leaving the unit: she is cold and watchful, and if pressed she says she is thinking of going.` (`scene`).
  - `aftermathDirective(title, label)`: `The commander has just decided "${title}": ${label}. Narrate the immediate aftermath; the decision is final and cannot be talked back.`
- Architecture test: `src/loyalty` never imports `src/ui`, `st/real` or `st:`; `src/engine` never imports `src/loyalty`.

- [ ] **Step 1: Write the failing tests** — dilemmas: `a request is answered with present after one call`; `a rejected first answer triggers exactly one more call`; `a failed call, a missing profile and the setting off all answer with fallback`; `two onRequested for one request make one call`; `a chat switch during the call drops the answer and leaves the request open`. Loyalty: `a refused order sets the refusal directive for the scene and a compel replaces it for the next reply`; `a failed compel says so`; `opening a scene with a wavering, recently leashed unit sets both directives`; `a leash use older than 7 days sets no trauma directive`; `closing the scene clears them`; `a resolved dilemma sets the aftermath directive`. Directives: exact texts. Settings: `dilemmasEnabled defaults to true`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, suite green.
- [ ] **Step 5: Commit** `feat(loyalty): dilemma and loyalty controllers, directives, setting`.

---

### Task 13: UI — oversight request form, SQUAD and LOG

**Files:**
- Create: `src/ui/leash/requestForm.ts`, `css/90-loyalty.css`
- Modify: `src/ui/shell/modal.ts` and `shell.ts` (`actions[].disabled?: string` — button disabled, reason shown), `src/ui/squad/squadTab.ts`, `src/ui/log/logTab.ts`, `src/ui/shell/sysTab.ts` (section **Decisions**: `dilemmasEnabled`)
- Test: `tests/ui/leashForm.test.ts`, `tests/ui/squadLoyalty.test.ts`, `tests/ui/shell.test.ts` (extend)

**Interfaces:**
- `fileLeashRequest(shell: ShellApi, o: { kind: LeashKind; unitName: string; no: number; left: number; cost?: { trust; affinity; stress; failChance }; cause?: string; showNumbers: boolean; delayMs?: number }): Promise<boolean>` — modal titled `OVERSIGHT REQUEST #<no padded to 4>`, form lines `SUBJECT`, `ACTION`, `GROUNDS`, `AUTHORIZATIONS REMAINING`, a consequence line in words (numbers only with `showNumbers`), actions `[ FILE REQUEST ]` / `[ WITHDRAW ]`; after FILE the lines `TRANSMITTING…`, `OVERSIGHT REVIEW…`, `APPROVED` (or the caller's verdict) appear over `delayMs` (default 1800, 0 with `prefers-reduced-motion`), then it resolves `true`. `FILE` is disabled with the reason when `left < 1`.
- SQUAD tab context gains `onLeash(unitId, kind)`, `onArc(unitId, defectId, path, compel)`, `arcPaths(unitId, defectId)`, `canTerminate(unitId): string | null`; per unit a loyalty line (`STEADY` / `WAVERING` / `BREAKING`), `[ LEASH ]` with `TERMINATE` listed only with cause; per defect the arc status (`ARC: MANAGE 1/1`) or `[ DECIDE ARC ]` listing each path with its text, cost, `SHE WANTS THIS` / `SHE REFUSES — LEASH ONLY`, greyed with the reason when unavailable.
- LOG tab: section `OVERSIGHT LOG`, newest first: `#0007 DAY 012 COMPEL <name> — DONE`.

- [ ] **Step 1: Write the failing tests** — `the form shows the request number, subject and remaining authorizations`; `FILE is disabled at 0 authorizations with the reason`; `withdraw resolves false and files nothing`; `with delay 0 FILE resolves true after the review lines`; `numbers are hidden unless showRawValues`; `a disabled modal action cannot be clicked and shows its reason`; `the squad tab shows the band, hides TERMINATE without cause and offers arc paths with wants/refuses marks`; `a completed arc shows its status instead of the button`; `the log lists Leash uses newest first and skips malformed entries`; `all model and content text is set as textContent`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (cold, bureaucratic look: fixed-width form, no colour accents except the verdict). **Step 4: Run** → PASS; `npm run build`.
- [ ] **Step 5: Commit** `feat(ui): oversight request form, loyalty and arc controls on SQUAD, oversight log`.

---

### Task 14: UI — dilemma panel, confrontations, scene and combat controls

**Files:**
- Create: `src/ui/dilemma/dilemmaPanel.ts`, `src/ui/loyalty/confrontation.ts`
- Modify: `src/ui/scene/sceneScreen.ts`, `src/ui/combat/combatScreen.ts`, `src/ui/combat/keys.ts`, `src/ui/expedition/expeditionScreen.ts`
- Test: `tests/ui/dilemmaPanel.test.ts`, `tests/ui/confrontation.test.ts`, `tests/ui/sceneOrder.test.ts`, `tests/ui/combatCompel.test.ts`

**Interfaces:**
- `renderDilemma(host, ctx: { title: string; setup: string; scale: DilemmaScale; waiting: boolean; options: Array<{ index; label; disabled: string | null; hasCheck: boolean }>; onChoose(index): void }): void` — `waiting` shows `OVERSIGHT IS DRAFTING YOUR OPTIONS…` and no buttons; a pressed button disables all; no free-text input.
- `renderConfrontation(host, ctx: { kind: 'desertion' | 'mutiny' | 'return'; unitName: string; framing: string; talkTried: boolean; ranks: { authority: number; empathy: number }; leashLeft: number; canFight: boolean; canTakeBack: string | null; onTalk(stat): void; onLetGo(): void; onSuppress(): void; onFight(): void; onYield(): void; onTakeBack(): void; onTurnAway(): void }): void` — desertion: `[TALK HER DOWN — AUTHORITY n]`, `[TALK HER DOWN — EMPATHY n]`, `[LET HER GO]`, `[SUPPRESS]`; mutiny: `[FIGHT]` or `[YIELD]`, `[SUPPRESS]`; return: `[TAKE HER BACK]`, `[TURN HER AWAY]`.
- Scene screen: an `ORDER` toggle beside SEND (with a target picker in group scenes) → `ctx.onOrder(unitId)` before the message is sent; a `REFUSED` marker on her portrait and a `[ COMPEL ]` chip → `ctx.onCompel(unitId)`.
- Combat screen: after `order_refused`, `[ COMPEL ]` (a free key in `keys.ts`) while `cs.lastRefusal` exists → `ctx.onCompel()`; shows `LEASH n` minus pledged compels.
- Expedition screen: when a dilemma is open for the pending node, the event panel renders `renderDilemma` instead of the fixed options.

- [ ] **Step 1: Write the failing tests** — `waiting shows no buttons`; `a greyed option shows its reason and cannot be chosen`; `choosing disables every button and calls onChoose once`; `there is no text input`; `desertion offers the two talk-downs once, then only let go and suppress`; `suppress is disabled at 0 authorizations`; `mutiny with no loyal unit offers yield instead of fight`; `return greys take-back without a free bed`; `the ORDER toggle calls onOrder before sending and shows REFUSED with a COMPEL chip`; `the combat COMPEL control appears only after a refusal and disappears after use`; `the expedition event panel shows the generated dilemma when one is open and the fixed options otherwise`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npm run build`.
- [ ] **Step 5: Commit** `feat(ui): dilemma panel, confrontation panel, scene orders and combat Compel`.

---

### Task 15: App wiring

**Files:**
- Modify: `src/app.ts`, `src/index.ts` (only if a new `AppDeps` field is needed), `tests/helpers/worldApp.ts`
- Test: `tests/app.loyalty.test.ts`

**Interfaces:**
- Imports that register actions, in this order after `./engine/actions/expedition`: `./engine/actions/leash`, `./engine/actions/loyalty`, `./engine/actions/dilemma`, `./engine/actions/arc` (day-end hooks run in registration order: P5 deadlines → Leash refresh; P5 director → loyalty → pacing).
- `AliusApp` gains `dilemmas` (Task 12), `loyalty` (Task 12) and `fileLeash(kind: LeashKind, unitId: string): Promise<boolean>` (form, then the action; for `compel` in a scene through `loyalty.compel`).
- Behaviour: on load `leash/seed`; `dilemma_requested` → `dilemmas.onRequested()` (also on load and after `combat_ended` when a request is open); a `presented` dilemma opens the panel as a modal over the PDA (inside a run: the expedition screen) and comes back after a reload; `dilemma_resolved` with `affected` at base → a toast naming them and a `[ TALK ]` suggestion that calls `startScene({ origin: 'event' })`; `expedition_node` with a pending event whose template has `generate` → `dilemma/request`; `night_started` or a reload with a night entry of a `CONFRONTATION_KINDS` kind → the confrontation panel instead of the knock; `desertion_attempt { at: 'mission_start' }` → the same panel as a modal; `[FIGHT]` → a formation from `loyalUnits` (default formation, first unit covers) → `loyalty/fight` with `allowRetry` from the setting → combat screen; `combat_ended` with `disloyalty.open.combatId` → `loyalty/resolve_mutiny`; `unit_deserted` / `unit_terminated` → `cutIn`, `setMembersActive` without her, save flushed at once; `leash_used`, `leash_refreshed`, `loyalty_sign` (`fact`/`talk` only), `arc_unlocked`, `arc_completed`, `deserter_returned`, `mutiny_subdued`, `mutiny_escaped` → toasts; `loyalty_sign { kind: 'dm' }` → COMMS badge; scene start/resume → `loyalty.onSceneOpened()`, scene end/abort and chat switch → `loyalty.onSceneClosed()`.

- [ ] **Step 1: Write the failing tests** (fake adapter, fake shell) — `loading a pre-P6 campaign seeds the Leash once`; `a requested dilemma is generated, presented and blocks an activity until chosen`; `with no mechanic profile the authored fallback is presented`; `a chosen base dilemma sets the aftermath directive`; `a pinned expedition event with a generate block becomes a dilemma and finishes the node`; `a desertion night shows the confrontation, not the knock`; `reload with an open confrontation shows it again`; `fight starts a combat against her and its end resolves the mutiny once`; `a terminated unit is removed from the active chat members`; `filing a Compel in a scene goes through the form and sets the compelled directive`; `withdrawing the form dispatches nothing`; `a chat switch clears refusal, trauma and aftermath directives`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → `npx vitest run` all PASS; `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: wire dilemmas, disloyalty and the Leash into the app`.

---

### Task 16: Build, docs, acceptance

**Files:**
- Modify: `dist/index.js`, `style.css` (via `npm run build`), `docs/packages/P6-dilemmas-disloyalty-leash.md` (status line + **Implemented as** with every ruling above and those taken while implementing), `docs/00-overview.md` (§5.4 P6 interfaces: `leash/*`, `loyalty/*`, `dilemma/*`, `arc/*`, `scene/order`, `combat/compel`, `Encounter.mutineers`, `applyEventToUnit` `scale`, `EffectSource.units`, `thread_flag`, `app.dilemmas`, `app.loyalty`, the `dilemma_open` guard; §6 data model fields; §8 the setting; §9 status → implemented), `docs/CONTENT.md` (`loyaltySigns`, dilemma generation fields with an example, `corporations[].leash`, `defects[].leash` / `desertionMod` / `arcFlag`, `thread_flag`), `docs/packages/P3-…md` (`applyEventToUnit` `scale`, `SceneRecord.refusals`, `night/open|ignore` refuse confrontation kinds), `docs/packages/P4-…md` (`Encounter.mutineers`, `lastRefusal`, `compels`, band synergies), `docs/packages/P5-…md` (`unit_event` at base, `thread_flag`, `finishEventNode`, the two beat-4 events are now defining dilemmas, `dilemma/` during a run), `docs/README.md`, `CLAUDE.md` (the P5 pointer line → P6)
- Create: `docs/MANUAL_TEST_P6.md`
- Test: `tests/build.test.ts` (existing)

- [ ] **Step 1:** `npm run build` → `dist/index.js` and `style.css` change and stay tracked.
- [ ] **Step 2:** Walk the eight acceptance criteria against test names and record them in `docs/MANUAL_TEST_P6.md` next to the in-SillyTavern steps that cannot be automated (a real `dilemma_generate` with a mechanic profile and its log in SYS › debug; dilemmas off; a refusal directive visible in Prompt Itemization and obeyed by the main model; Compel in a scene and in a fight; the request form's delay; a desertion night by mouse with each of the three answers; a mutiny fight; Terminate; a defect arc from unlock to completion; the beat-4 choice as a generated dilemma; reload at each confrontation).
- [ ] **Step 3:** `npx vitest run` and `npm run typecheck` → all green; put the counts in the final report.
- [ ] **Step 4: Commit** `chore: rebuild dist and style, P6 docs and manual checklist`.

---

## Self-review notes (for the plan author; executors may ignore)

- Spec coverage: §1 templates (T1), generation (T11, T12), magnitudes and `unit_event` (T8, T9), validator rules 1–6 and retry/fallback (T8, T9), presentation and aftermath (T12, T14, T15), defect arcs (T10, T13); §2 bands and refusals (T4), signs and desertion (T5), mutiny (T6, T7), mid-scene refusal (T4, T12); §3 Leash state and weekly refresh (T2), Compel/Suppress/Terminate and modifiers (T3, T4), request form (T13); §4 directives (T12). Acceptance 1 → T8/T9/T12; 2 → T9; 3 → T4/T12; 4 → T5; 5 → T6/T7; 6 → T2/T3; 7 → T10; 8 → T8, T4, T5, T3.
- Deliberate deviations are listed once, in **Where the code differs from the spec**; the largest are orders as a fixed scene control instead of an extracted intent, Compel in combat settled at finalize, exact Leash costs outside `eventDeltas`, and dilemma sources limited to pacing, pinned expedition events and arcs (the director model does not raise dilemmas).
- Three packages' interfaces are extended, each backwards compatible: P3 (`applyEventToUnit` option, scene refusals, night guards), P4 (mutineers, refusal memory), P5 (`unit_event` at base, `thread_flag`, `finishEventNode`, dispatch prefixes). Task 16 records them in the owning specs, as overview §9 requires.
- Task 8's value test uses `computeDeltas` directly because the at-base `unit_event` path only exists after Task 9; Task 9 repeats it end to end.
- `RealStAdapter` needs no new method.
