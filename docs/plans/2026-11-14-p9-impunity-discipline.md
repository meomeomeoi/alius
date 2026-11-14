# P9 Impunity, Discipline, Demands & Reputation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate "do I trust your command?" (Trust) from "what happens to me if I defy you?" (**Impunity**, computed per named unit, one stored term). Four new intents feed it; a threat that is not carried out becomes a yield. Trust × Impunity gives each unit one of four **stances** that shape her directive, the form of her refusals, mutiny and desertion. The commander gets a ladder of **punishments** below the Leash, from a menu or from dialogue, always with a visible chip and an exact UNDO. Units make **demands**; the squad gives the commander **nicknames** from counted deeds.

**Architecture:** A new pure engine folder `src/engine/discipline/` owns every rule: `impunity.ts` (the formula and its terms), `record.ts` (the stored term, pending defiance, pending threats), `stance.ts`, `restrictions.ts`, `punish.ts` (applications with an inverse for UNDO), `sabotage.ts`, `demands.ts`, `deeds.ts` + `reputation.ts`. State lives in one optional object `CampaignState.discipline`, plus `Relation.impunityRecord?`, `Commander.deeds?` and `Commander.reputation?`. Existing modules call the readers at a few hook points (`applyIntents`, `computeDeltas`, `orderInScene`, the mutiny day step, the Leash, `scene/end`, the delegate route, availability checks). Numbers and texts are content: four new registries (`commandStances`, `punishments`, `demandTemplates`, `reputations`). The non-engine layer `src/discipline/` turns engine events into directives, wording calls and deliveries, like `src/loyalty/`. Chunk (a) = Tasks 1–7 (Impunity, intents, threats, stances, sabotage). Chunk (b) = Tasks 8–12 (punishments, menu and dialogue paths, chips with UNDO). Chunk (c) = Tasks 13–18 (demands, reputation, docs).

**Tech Stack:** TypeScript 5 (strict), esbuild, zod 3, vitest (+ jsdom for UI). No new dependencies.

**Spec:** `docs/00-overview.md` (§3 P1–P6/P12, §5.3, §5.4, §6), `docs/packages/P9-impunity-discipline.md`. Read as implemented (**Implemented as** and **Non-obvious things**): `P3-scenes-relationships-memory.md`, `P6-dilemmas-disloyalty-leash.md`, `P7-commander-profile-traits.md`, `P7a-analysis-tool.md`, `P8-world-options-disposition.md`. `docs/ROADMAP-next.md` gives the three chunks. Read `docs/content/lore.md` every session (§0: the pronoun rule; the P9 draft itself says "him" in places — never copy that into text).

## Global Constraints

- English everywhere (overview P8). All UI text goes through `textContent` / `h()`, never `innerHTML`.
- `src/engine/**` stays pure (architecture test; do not write the host app's name in engine comments). `src/engine/discipline/**` imports only `src/content` types and other `src/engine` modules. `src/discipline/**` follows the `src/loyalty/` rule: ST only through `StAdapter` types, no `src/ui`.
- **The model describes, the engine judges** (overview P1/P2). The model reports the four new event types and a `measure` id; every number comes from `TUNING.impunity`, `TUNING.demands`, `TUNING.reputation` or the registries. Impunity, stance, belief and disposition never reach the `intent_extract` input: its prompts stay byte-identical across disposition levels and stances (existing test in `tests/scene/sceneController.test.ts` stays green; Task 3 adds the stance case).
- **Data, not ids** (overview P4): code reads punishments by `sideEffects` type, demand templates by `grantCost` type, reputations by `pattern`, dependency by the state's `dependency` field, leverage by the flag's `leverage` field. No registry id is tested in engine code, except the measure words `leash` and `unspecified`, which are not registry ids.
- Spec numbers, verbatim: Impunity `I = clamp(base + R + L − P·w(d) − D + C + S, 0, 100)`; base **25 / 35 / 45 / 55 / 65** by disposition rank 1–5; `impunityRecord ∈ [−40, 40]`, decay **1/day** toward 0; `L`: **+10** with 0 authorizations left, **+8** if the Leash was never used, **−10** for **7** days after a use; `D`: dependent state **15**, defect upkeep **10**; `C` = **0.3** × mean record of the others; `S`: **+5** per secret, cap **15**; `defied` **+3 / +5 / +8 / +12**; `commander_yielded` **+6 / +10**; enforced **−8** (verbal) … **−20** (brig, Leash); threat deadline = **end of the next day**; stance thresholds Trust **≥ 45**, Impunity **≥ 50**; a threat is believed at Impunity **< 50**; dialogue discipline needs confidence **≥ 0.6**; mutiny needs `I ≥ 60`; a mutiny-ready unit that is `breaking` with `I < 30` deserts instead; demands capped at **2 per unit per week**; a granted impunity-driven demand gives `R` **+4**; at most **2** active nicknames.
- **Named units only.** Grunts have no Impunity, no stance, no punishments, no demands (`impunityOf` and `commandStance` return `null` for them).
- **No pronoun for the commander** in any text a player or the main model reads (directives, registry texts, glossary, chips, flavor prompts). Soldiers are "she". `tests/content/pronouns.test.ts` must cover the four new registries and `src/discipline/directives.ts`.
- Campaign state stays `version: 1`; every new field is optional. A save without `discipline`, `impunityRecord`, `deeds` or `reputation` loads and plays (record 0, nothing pending).
- Determinism: every new roll uses `ctx.rng`. `discipline/punish` and `discipline/undo` draw nothing. New draws: the sabotage roll in the day step (only while some unit is `fearful`), the gear-fault roll at `expedition/start` (only while one is pending), `demand/roll` (its own action) and the template pick of an owed demand. Seeded tests that move are updated knowingly and named in the commit message.
- Overview P12: every new chip, stat, menu button and choice carries `data-analyze`; the four registries get `description`s and join `DESCRIBED_REGISTRIES`; new concepts get glossary entries; new settings get a `setting_…` entry. `tests/ui/analyzeCoverage.test.ts` and `tests/analysis/hidden.test.ts` stay green.
- Directive ids added here: `loyalty:<unitId>` (the stance, replacing the band text), `refusal:<unitId>` (existing id, new texts), `discipline:<unitId>`, `threat:<unitId>`, `demand:<unitId>`, `nickname`. None starts with `world:`, `stance:` or `friction:`.
- `dist/index.js` and `style.css` are committed; `npm test` rebuilds them. Check its exit code before committing. Commit messages end with the executing agent's `Co-Authored-By:` / `Claude-Session:` trailers.

## Where the plan rules on the spec (read before Task 1)

Rulings taken while planning; those marked **user** were answered by the user on 2026-11-14. Task 18 copies them into the spec's **Implemented as**.

- **Names.** P8 already exports `stanceOf` (world stances). The P9 stance is the **command stance**: `commandStance(state, reg, unitId)`, registry `commandStances`, UI label `STANCE`.
- **State.**
  ```ts
  Relation.impunityRecord?: number                       // R, −40…40, absent = 0
  Commander.deeds?: Partial<Record<DeedCounter, number>> // §6 counters
  Commander.reputation?: { active: Array<{ id: string; name: string; sinceDay: number; by?: string }>; pending?: { id: string; queuedDay: number; replaces?: string } }
  CampaignState.discipline?: {
    defiance: PendingDefiance[];      // { unitId, severity, day, source: 'intent'|'order'|'demand', sceneId? }
    threats: PendingThreat[];         // { id, unitId, measure, day, deadlineDay, believed, channel, sceneId?, messageRef?, inverse }
    applications: Application[];      // newest 20: { id, unitId, measure, source: 'menu'|'dialogue', channel: 'scene'|'dm'|'pda', day, sceneId?, messageRef?, inverse }
    restrictions: Restriction[];      // { unitId, kind: 'confined'|'no_leave'|'benched'|'duty', untilDay?, day?, slot?, applicationId?, demandId? }
    sabotage?: { queued: Array<{ unitId: string; day: number }>; gear?: { unitId: string; day: number } };
    demands: Demand[];                // { id, unitId, templateId, text, day, expiresDay, status: 'undelivered'|'open', owed?, impunityDriven, dmId? }
    demandLog: Array<{ unitId: string; day: number }>;   // openings of the last 7 days
  }
  ```
  `disciplineOf(draft)` creates the object on first write; readers use `state.discipline?.…`.
- **Terms of Impunity.** `base` = `dispositionFor(…).impunityBase` (schema range widened to 0…100; default 35 when a pack omits it) + the `impunityBase` of every active nickname. `L` terms add up (Leash used and now empty = +10 − 10). "Never used" = `leashLog(state)` empty and `(leash.seq ?? 0) === 0`. "Witnessed or heard of" = **any** log entry with outcome `done` in the last 7 days counts for every unit (the lore: units know exactly who filed). `P·w(d)` = `presenceOf × firstImpressionWeight`. `D` = the relationship state's new optional `dependency` field (core: `dependent: 15`) + 10 when her relation has the flag `need_controlled` or one of her defects has `arc === 'manage'`. `C` = `round(0.3 × mean R)` over the other living named units (0 with none). `S` = 5 per **leverage secret**, cap 15: a relation flag whose `flags` entry has `leverage: true` (core: `knows_crime`, counted only while the crime entry is not `damaging: false`); and one for a concealed affair she is part of or knows of (a fact tagged `affair` with her in `knownBy`) while a hidden partner still does not know. P12 adds its flags with `leverage: true`; no code.
- **New event types.** `EVENT_TYPES` (what the model may report) grows from 26 to **30**: `defied`, `commander_enforced`, `commander_yielded`, `threatened`. A second list `ENGINE_EVENT_TYPES = ['granted_demand', 'refused_demand']` is never offered to the model and is rejected by `validateIntents`. `ALL_EVENT_TYPES` is both; `eventDeltas` needs a row set for each of the 32. `EventIntent` gains `measure?: string` and `templateId?: string`.
- **Who acts.** `defied`: a unit is the actor, no targets. The other three: the commander is the actor, the unit is the target. `measure` is one of the `punishments` ids, `leash`, or `unspecified`; the list is passed to `validateIntents` and to the prompt by the caller. An unknown measure reads `verbal` on `commander_enforced` and `unspecified` on `threatened`. `commander_enforced` with `leash` or `unspecified` reads `verbal` (the Leash is only ever filed through its form).
- **Confidence.** `commander_enforced` and `threatened` below `TUNING.impunity.minConfidence` (0.6) are dropped for every unit before the event cap, on top of the P8 floors. Engine-made events use confidence 1.
- **Pending defiance.** A `defied` that lands applies its `eventDeltas` row at once and is **held**: `R` moves only when it settles. It settles when the scene it happened in ends or is aborted (scene channel) or at the next day end (DM and engine sources). Settled without enforcement: `R += defied[severity]`, deed `defiance_tolerated`. An enforcement on her before that (a punishment, a Leash use) removes it with no `R` gain. One held defiance per unit; a second keeps the higher severity.
- **Refused order = defied (user).** A refused `scene/order` holds a `defied / moderate` (source `order`). Combat refusals are out (only `combat` and `rng` change during a fight): open item.
- **Leash = enforcement (user).** Every Leash use with outcome `done` (Compel in a scene, Compels settled after a fight, Suppress, a forced arc decision) gives the target `R −20`, removes her held defiance and keeps a pending threat on her whatever its measure. Terminate removes her, so nothing.
- **Pending threats.** One per unit. `deadlineDay = day + 1`; the day-end step of a day `≥ deadlineDay` lapses it: an engine-made `commander_yielded` (severity `major` when the measure was `leash` or a punishment of severity ≥ 3, else `moderate`), deed `threats_empty`. A new threat on a unit that has one replaces the measure and keeps the older deadline. A threat is **kept** by an enforcement on her whose measure is the same, or of equal or higher severity, or any measure when the threat was `unspecified`, or a Leash use: deed `threats_kept`. An extracted `commander_yielded` on her lapses it at once. `believed` is fixed when the threat is registered (`I < 50`). Belief changes no number: it sets the chip text and a one-reply directive.
- **Yield amounts.** `+6 / +10` are read as `minor, moderate → 6` and `major, extreme → 10`.
- **Stance effects.** (1) The stance directive uses the id `loyalty:<unitId>`, so it replaces the wavering text; the P6 `breaking` sentence is appended to it. (2) Refusal form: the refusal directive text comes from the stance's `refusal` template. (3) **Fearful refusals are hidden (user):** when a `fearful` unit rolls a refusal of a scene order, nothing is stored in `scene.refusals`, the event says `refused: false, covert: true`, the UI shows an accepted order, the main model gets the fearful `refusal` text, and one covert sabotage is queued for the next day end. No defiance is held. (4) Mutiny: a unit must also have `I ≥ 60`. A unit that is `mutinyReady` by the P6/P8 rules but has `I < 30` and is `breaking` rolls the same daily chance for a **desertion attempt** instead (`mayDesert` permitting). Between 30 and 59 nothing fires and her signs stay. (5) Demand frequency: the stance's `demandWeight`.
- **Fifth stance, `indifferent` (user, 2026-11-14, after chunk (a)).** Trust 30–44 **and** Impunity 35–59 give `indifferent` ("she does not much care who commands her"): a mild directive, an open refusal in its own form, `demandWeight` 1, no sabotage (not `covert`) and no mutiny (Impunity < 60). It wins over the four quadrants inside that zone only; `TUNING.impunity.stance.indifferent` holds the three numbers. `COMMAND_STANCE_IDS` and the loader check list all five ids. Later tasks that read stances by id (demand `conditions.stances`, Task 13) read the registry and may name `indifferent`.
- **Import (user, same date).** Baseline Trust at import is 0…60 (was 0…40), so a card that accepts the commander can start `disciplined`; the import prompt names the anchors (0–10 hostile, 15–30 wary, 30–40 neutral, 45–60 accepting) and says the disposition offset is also how bold she is. A harder offset also lowers her start Trust through P8 (volatile −20). The wizard shows the stance she would start in (`Wizard.previewStart`): a `STARTING STANCE` line in calibration and a `STANCE` line in the review. On day 1 the guarded world gives fearful, indifferent, disciplined and (offset +2) open defiance; `defiant_loyal` is earned in play.
- **Leash "never used" (user, same date).** The +8 applies from day 8 (`TUNING.impunity.leash.neverUsedFromDay`): a Leash nobody has used for a week reads as a bluff. Every Impunity on day 1 is 8 lower than the spec table; on day 8 it rises by 8 at once.
- **Sabotage chance (user, same date).** A covert unit's daily roll is `chancePerDay × (50 − Impunity) / 50` (12 % at Impunity 0, 0 at 50), at most one random sabotage in `cooldownDays` (3) days for the whole squad (`sabotage.lastDay`); a queued sabotage from a hidden refusal is not held back by the cooldown and starts one.
- **Acquaintance period (user, same date).** World option `acquaintance` (group Soldiers, locked at start, slider from 0 to 14 days, default 7, presets gentle 10 / standard 7 / brutal 3; effect `acquaintance_grace { days }`, no `lore` line: `WorldChoice.lore` is optional). While `daysKnown < days` a unit rolls no random sabotage and a hidden refusal of hers queues none (`acquaintanceDays`, `inAcquaintance` in `engine/discipline/acquaintance.ts`). Chunk (c) applies the same reader to the demand roll.
- **Covert sabotage.** Day step: every queued sabotage fires; besides, each `fearful` named unit rolls `chancePerDay` (0.12). One sabotage per day at most. Kind by `rng.pick`: `supplies −2`, `credits −10` (never below 0), or `gear` (stored; only one may wait). Each writes one **anonymous** public fact (no name) and the event `covert_sabotage { kind }`. A waiting gear fault fires at the next `expedition/start` with chance 0.5: the run starts with 2 carried supplies fewer (floor 0) and a log line; either way it is cleared. Who did it is never shown by any provider. A status-based gear fault in combat is an open item.
- **Punishments** (`punishments` registry): `{ id, label, description, severity: 1..4, impunityDelta, deltas { trust, affinity, stress }, sideEffects[], perception[], dispositionScaling: 'loss' | 'none' }`. Side-effect vocabulary (closed): `confine { minDays, maxDays }`, `no_leave { days }`, `bench {}`, `duty {}`, `resource { resource, amount }`. Draft ladder (author's to change, all in JSON):

  | id | label | sev | impunityDelta | trust / affinity / stress | side effects | perception |
  |---|---|---|---|---|---|---|
  | `verbal` | Reprimand | 1 | −8 | 0 / −2 / 3 | — | — |
  | `revoke_rations` | Rations revoked | 2 | −10 | −2 / −4 / 6 | `resource supplies +1` | `food_love` ×1.5 |
  | `revoke_leave` | Leave revoked | 2 | −12 | −2 / −5 / 5 | `no_leave 2` | — |
  | `extra_duty` | Extra duty | 2 | −12 | −1 / −3 / 8 | `duty`, `resource credits +5` | — |
  | `bench` | Benched | 3 | −15 | −4 / −5 / 6 | `bench` | `lives_for_combat` ×2 |
  | `brig` | Brig | 4 | −20 | −6 / −8 / 12 | `confine 1–3` | — |

- **Punishment deltas go through the P3/P8 chain.** A punishment is the engine-made (or extracted) event `commander_enforced` with its `measure`; `computeDeltas` takes the row from the punishment instead of `eventDeltas` and uses severity `SEVERITIES[severity − 1]`. So image consistency (`commander_enforced` joins `slight_build.offImage`), state and defect modifiers and the disposition `lossMult` all apply (`dispositionScaling: 'none'` skips only the disposition multipliers). A perception entry whose `tag` is among her likes, dislikes or triggers multiplies the three deltas **and** `impunityDelta` (highest match wins): what hurts her more also deters her more. The `eventDeltas` row of `commander_enforced` is the fallback for a measure the registry no longer has.
- **Restrictions.** `confined`: no scene, no companion, no expedition while `day ≤ untilDay` (`untilDay = day + days`; menu picks 1–3, dialogue uses `minDays`). `no_leave`: not a companion of any activity except `talk` and `medbay` while `day ≤ untilDay`. `benched`: not in an expedition party; removed when the next expedition starts. `duty`: no scene, companion or expedition during one slot: the current one, or the next one (`morning` of the next day after `evening`/`night`) when a scene or pending talk holds the current slot. The same measure may be imposed on a unit once per day.
- **Application records and UNDO.** Every application stores an **inverse**: the applied axis deltas (after clamps), stress delta, `R` delta, `dailyGain` change, the state and loyalty-band change it caused, the history entry, the restrictions and resource changes, the deeds it counted, the fact it wrote, and copies of the held defiance and pending threat it removed. `discipline/undo { id }` applies the inverse and deletes the record; it reverts only its own deltas (later changes stay) and is accepted only for a `dialogue` application or a threat, on its own day, and (scene channel) while its scene is open. The public fact (`The commander put {name} …`) is written for menu applications at once and for dialogue applications never (the transcript and the scene summary carry it), so an UNDO leaves no memory entry. The **ledger** keeps both lines (it is a change log); the exact-state test ignores `ledger`, `memory.nextId` and nothing else.
- **UNDO on threats (user).** `THREAT REGISTERED` chips also carry `[UNDO — not what I meant]`: the threat is removed and the `threatened` event's deltas are reverted.
- **Discipline in DMs (user).** `commander_enforced` and `threatened` read from a DM exchange apply the same way; their chips show in the COMMS thread.
- **Demands** (`demandTemplates` registry): `{ id, kind, text, description, grantCost[], grantDeltas { trust, affinity }, refuseDeltas { trust, affinity, stress }, costly?, conditions { stances?, impunity?: [lo, hi], dispositionRanks?: [lo, hi], tagsAny?, statesAny?, flagsNone? }, weight }`. `grantCost` vocabulary (closed): `resource { resource, amount }`, `squad_stress { amount }` (every other living unit), `relation_flag { flagId }`, `bench_self {}`, `equip_item { slot, minRarity }`, `reveal_crime {}`, `other_unit_event { event, severity }` (one other named living unit, lowest Affinity first). Six draft templates: `double_ration` (resource), `own_room` (privilege, costly), `skip_next_run` (exclusion), `claim_weapon` (item), `back_off` (interpersonal), `tell_crime` (information, costly). Texts are placeholders marked `AUTHOR TO WRITE`.
- **Demand flow.** `demand/roll` is its own action, dispatched by the app after `slot_advanced` when no expedition is open. Per named living unit without an open demand and under the weekly cap: chance `clamp(base 0.04 × I/50 × level.refusalMult × stance.demandWeight, 0, 0.5)`; at most one new demand per roll and two open at a time. The template is a weighted seeded pick among the eligible ones, not her last one. Two phases like the director: the demand opens `undelivered` (`demand_opened`); the app words it (`flavor` kind `demand`, setting `demandWording`, fallback = the template `text`) and dispatches `demand/deliver { demandId, text? }`, which makes it `open` and, when she is not in the open scene, pushes a DM from her. An undelivered demand is delivered with its template text by the next day step. A demand expires 2 days after it opened and resolves as a refusal. **Grant:** pays the cost (refused when it cannot be paid), applies the engine event `granted_demand` (row = `grantDeltas`; severity `major` when `costly`, else `minor`), `R +4` when `impunityDriven` (her stance at opening was `open_defiance` or `defiant_loyal`), deed `demands_granted`. **Refuse:** `refused_demand` (row = `refuseDeltas`, × 1.5 when `I ≥ 50`), deed `demands_refused`, and at `I ≥ 50` a held `defied / moderate` (source `demand`). **TALK** opens a scene with her (origin `event`, her quarters) with the demand directive; the chips stay.
- **Big gestures.** `TUNING.disposition.bigGesture.events` becomes `['protected', 'granted_demand']`. "Shielded from oversight" has no producer in P9 and is left to P9b.
- **Delegate (user): does it, bills later.** A delegate one Trust band short now **complies** (same costs as a compliance) and an **owed** demand opens for her (`owed: true`, seeded template pick). Refusing an owed demand adds `broke_promise / moderate`. When no template is eligible or she already has an open demand, she refuses as before (`delegate_refused`).
- **Deeds.** `DEED_COUNTERS = ['leash_compel', 'leash_suppress', 'leash_terminate', 'grunts_lost', 'protected', 'defiance_tolerated', 'punish_1', 'punish_2', 'punish_3', 'punish_4', 'promises_kept', 'promises_broken', 'demands_granted', 'demands_refused', 'threats_kept', 'threats_empty']`. `protected` counts a commander `protected` event of severity ≥ `major` per unit it lands on ("units protected in Crisis"); promises are counted where `kept_promise` / `broke_promise` of the commander are applied.
- **Reputations** (`reputations` registry): `{ id, name, group, description, pattern { sum: DeedCounter[], min, against?: DeedCounter[], minShare? }, effects { impunityBase?, directive?, valueReactions?: [{ axis, sign, weight }] } }`. A pattern holds when `Σ sum ≥ min` and, with `against`, `Σ sum / (Σ sum + Σ against) ≥ minShare`. Its score is `Σ sum / min`. Drafts (names are placeholders): `leash_holder` "the Leash-Hand" (force; the three Leash counters ≥ 4; base −5), `iron_rule` "Iron Rule" (force; `punish_2..4` ≥ 6; −8), `soft_touch` "Soft Touch" (authority; `defiance_tolerated + threats_empty` ≥ 5; +8), `merchant` "the Merchant" (authority; `demands_granted` ≥ 4, share ≥ 0.75 against `demands_refused`; +5), `meatgrinder` "Meatgrinder" (losses; `grunts_lost` ≥ 3), `shield` "the Shield" (losses; `protected` ≥ 3), `liar` "Liar" (word; `promises_broken + threats_empty` ≥ 4, share ≥ 0.5 against `promises_kept + threats_kept`; +3).
- **Nickname flow.** The day step looks for the best-scoring pattern that holds, group by group. It queues a **pending** nickname when (a) its group has no active nickname and fewer than 2 are active, or (b) the group's active nickname no longer holds or scores lower (`replaces`), or (c) 2 are active, the group has none, and some active nickname no longer holds (`replaces` it). One pending at a time. The **nickname moment** is the next **private** scene: when it opens, the app dispatches `reputation/introduce { unitId }`; the nickname becomes active (its `name` is copied into the state, because `commanderLine` has no registry), each named unit reacts once by her values (`valueReactions`, Trust `2 · weight`, Affinity `3 · weight`), a public fact is written and the directive `{Unit} calls the commander "{name}" for the first time.` is set for the next reply.
- **Not in the spec, added:** setting `demandWording` (default on; SYS › Relationships); `ledger` key `record:<unitId>`; `removeFromService` forgets her held defiance, threats, restrictions and demands.

## File Structure

```
content/core/{commandStances,punishments,demandTemplates,reputations}.json     new registries (+ manifest)
content/core/{eventDeltas,dispositionLevels,relationshipStates,flags,imageConsistency,glossary}.json
src/content/{types,schemas,refs}.ts                registries, vocabularies, loader checks
src/engine/relations/{vocab,intents,deltas,apply,effects}.ts                    new types, measure, row override, routing, deeds
src/engine/tuning.ts                               TUNING.impunity, .demands, .reputation; bigGesture
src/engine/state/types.ts                          the state above
src/engine/discipline/impunity.ts                  impunityOf, leverageOf, impunityBand
src/engine/discipline/record.ts                    disciplineOf, addRecord, defiance, threats, enforcement
src/engine/discipline/stance.ts                    commandStance, stanceEntry
src/engine/discipline/sabotage.ts                  queue, day roll, gear fault
src/engine/discipline/restrictions.ts              restrictionReason, add / expire
src/engine/discipline/punish.ts                    applyPunishment, undo, inverse
src/engine/discipline/demands.ts                   roll, deliver, grant, refuse, expire, owed
src/engine/discipline/{deeds,reputation}.ts        counters, patterns, pending, introduce
src/engine/discipline/dayStep.ts, index.ts         the day-end step; exports
src/engine/actions/discipline.ts                   discipline/*, demand/*, reputation/introduce, the day step
src/engine/{ledger,calendar}.ts, loyalty/{refusal,mutiny,desertion}.ts, leash/use.ts, commander/{checks,profile}.ts,
src/engine/actions/scene.ts, activities.ts, world/expedition.ts, combat/outcome.ts     hook points
src/llm/calls/{intentExtract,flavor}.ts            measure, the `demand` flavor kind
src/discipline/{directives,context,controller,deps}.ts                          directives and the controller
src/scene/{sceneController,comms}.ts, src/loyalty/loyaltyController.ts, src/app.ts, src/settings.ts
src/analysis/{effects,describe}.ts, providers/discipline.ts
src/ui/discipline/{chips,menu}.ts, ui/squad/squadTab.ts, ui/scene/sceneScreen.ts, ui/comms/commsTab.ts, ui/commander/cmdrCard.ts, ui/shell/sysTab.ts
css/70-discipline.css
docs/MANUAL_TEST_P9.md, docs/CONTENT.md, docs/00-overview.md, docs/packages/*.md, CLAUDE.md
tests/**                                           mirrors src; tests/helpers/discipline.ts
```

## Review Focus

1. **The reply whose reading logged a punishment or threat is swiped, regenerated or edited** → the P3 rollback removes the application, the threat and their chips with the rest of that reading; an UNDO followed by a swipe says "Not rolled back" and nothing is reverted twice. Test in Task 11 (`swipe after a logged punishment removes the application`, `undo then swipe reverts once`).
2. **UNDO after something else moved her** (a later exchange raised Trust, her state changed again) → only the application's own deltas are reverted, clamped; a state it caused is put back only if she is still in it. Test in Task 10 (`undo after a later gain keeps the later gain`).
3. **A unit under a restriction, with a pending threat or an open demand, dies, deserts or is terminated; or the save has no `discipline`** → no reader throws, `removeFromService` forgets her, chips disappear, the day step skips her. Tests in Task 4 (`an old save runs the day step`) and Task 8 (`removeFromService forgets her`).
4. **A hostile or garbled `measure`** (an unknown id, a sentence, `leash` on an enforcement, a missing key) or a confidence of 0.59 → never a punishment the registry does not have; below 0.6 nothing is logged and no chip appears. Tests in Tasks 3 and 10.
5. **Reload or chat switch with a pending threat, an undelivered demand or a pending nickname** → chips are drawn from the state again, the demand is delivered with its template text at the next day end, directives of one chat never reach another. Tests in Tasks 12 and 15.
6. **A demand whose cost cannot be paid** (no supplies, no matching item, crime already known) → `[GRANT]` is soft-disabled (`aria-disabled`) with the reason; the engine refuses and changes nothing. Test in Task 13.

---

## Chunk (a) — Impunity, intents, threats, stances, sabotage

### Task 1: Content and state foundations

**Files:**
- Modify: `src/engine/relations/vocab.ts`, `src/content/types.ts`, `src/content/schemas.ts`, `src/content/refs.ts`, `src/engine/tuning.ts`, `src/engine/state/types.ts`, `content/core/{manifest,eventDeltas,dispositionLevels,relationshipStates,flags,crimes,imageConsistency}.json`
- Create: `content/core/commandStances.json`
- Test: `tests/content/p9Schemas.test.ts`; update `tests/content/core.test.ts`, `tests/engine/relations/intents.test.ts`, `tests/content/pronouns.test.ts`

**Interfaces:**
- Produces: `EVENT_TYPES` (30), `ENGINE_EVENT_TYPES`, `ALL_EVENT_TYPES`, `type EventType = (typeof ALL_EVENT_TYPES)[number]`; `REGISTRY_NAMES` + `'commandStances', 'punishments', 'demandTemplates', 'reputations'` (the last three get their schema and file in Tasks 8, 13 and 16; until then they are empty registries); `CommandStanceSchema` = `{ id: 'disciplined'|'defiant_loyal'|'fearful'|'open_defiance', name, description, directive (≤300, `{name}`), refusal (≤300, `{name}`, `{reason}`), covert?: boolean, demandWeight: 0…3 }`; `RelationshipStateSchema.dependency?: int 0…40`; `FlagSchema.leverage?: boolean`; `CrimeSchema.damaging?: boolean`; `DispositionLevelSchema.impunityBase` range 0…100; the state types of the rulings section (`PendingDefiance`, `PendingThreat`, `Application`, `Restriction`, `Demand`, `Inverse`, `DeedCounter`); `TUNING.impunity`:
  ```ts
  { recordMin: -40, recordMax: 40, decayPerDay: 1, defaultBase: 35,
    defied: { minor: 3, moderate: 5, major: 8, extreme: 12 }, yielded: { minor: 6, moderate: 6, major: 10, extreme: 10 },
    enforcedFallback: -8, leashEnforced: -20,
    leash: { noneLeft: 10, neverUsed: 8, recentUse: -10, recentDays: 7 },
    defectUpkeep: 10, contagion: 0.3, secret: 5, secretCap: 15,
    stance: { trustHigh: 45, impunityHigh: 50 }, believeBelow: 50, minConfidence: 0.6,
    mutinyMin: 60, desertInsteadBelow: 30,
    bands: { low: 30, high: 50, brazen: 60 },
    sabotage: { chancePerDay: 0.12, supplies: 2, credits: 10, gearChance: 0.5, gearSupplies: 2 },
    applicationsMax: 20 }
  ```
- New `RESERVED_EVENT_TYPES`: `impunity_changed`, `defiance_noted`, `defiance_settled`, `threat_registered`, `threat_kept`, `threat_lapsed`, `discipline_applied`, `discipline_undone`, `restriction_started`, `restriction_ended`, `covert_sabotage`, `demand_opened`, `demand_delivered`, `demand_resolved`, `nickname_pending`, `nickname_given`, `nickname_dropped`.

- [x] **Step 1: Write the failing tests**

`p9Schemas.test.ts`: `a command stance needs all four texts and a known id` (unknown id `rebel` → error); `impunityBase 65 parses, 101 does not`; `dependency and leverage are optional`. `core.test.ts`: `eventDeltas.size` equals `ALL_EVENT_TYPES.length` (32); the five disposition rows carry `impunityBase` `[25, 35, 45, 55, 65]` by rank; `commandStances` has exactly the four ids; `relationshipStates.dependent.dependency === 15`; `flags.knows_crime.leverage === true`; `imageConsistency.slight_build.offImage` contains `commander_enforced`. `intents.test.ts`: `has 30 event types`. `pronouns.test.ts`: `commandStances` fields `name, description, directive, refusal` have no commander pronoun.

- [x] **Step 2: Run** `npx vitest run tests/content tests/engine/relations/intents.test.ts` → FAIL.

- [x] **Step 3: Implement.** `eventDeltas` draft rows (minor / moderate / major / extreme), each with a `cause`:

  | id | trust | affinity | stress |
  |---|---|---|---|
  | `defied` | 0 | 0 | 0 / 0 / 2 / 4 |
  | `commander_enforced` (fallback) | 0 / −2 / −4 / −6 | −2 / −4 / −5 / −8 | 3 / 6 / 8 / 12 |
  | `commander_yielded` | −1 / −2 / −4 / −6 | 1 / 1 / 2 / 2 | 0 |
  | `threatened` | −1 / −2 / −3 / −5 | −1 / −2 / −4 / −6 | 2 / 4 / 6 / 8 |
  | `granted_demand`, `refused_demand` | all 0 (the row comes from the template, Task 13) | | |

  `commandStances.json`: the four entries; `demandWeight` 0.5 / 1.5 / 0.5 / 2 (disciplined, defiant_loyal, fearful, open_defiance); `fearful.covert: true`. Directive drafts: disciplined `{name} obeys the commander's orders and objects by the book: formally, once, on the record.` · defiant_loyal `{name} argues with the commander, does things her own way and teases the commander openly; she will not abandon the commander.` · fearful `{name} complies in silence and keeps her eyes down; she hides what she thinks and would run rather than fight.` · open_defiance `{name} mocks the commander, makes demands and ignores orders she dislikes; she does not expect to pay for it.` Refusal drafts: disciplined `{name} REFUSES the commander's order this scene, formally and on the record. Reason: {reason}. She will not comply under persuasion; only the Leash can force her.` · defiant_loyal `{name} does NOT carry out the order as given this scene: she does it her own way and says so. Reason: {reason}. Persuasion will not change it; only the Leash can force her.` · open_defiance `{name} REFUSES the commander's order this scene, openly and with contempt. Reason: {reason}. She will not comply under persuasion; only the Leash can force her.` · fearful `{name} says she will carry out the order and does not mean it: she stalls and does it badly on purpose, and never admits it aloud.` Loader check in `refs.ts`: all four stance ids exist when the registry is non-empty.

- [x] **Step 4: Run** `npm test` → PASS (existing suites unchanged in number of failures: none).

- [x] **Step 5: Commit** `feat(content): P9 event types, command stances, impunity base and state types`

---

### Task 2: Impunity

**Files:**
- Create: `src/engine/discipline/impunity.ts`, `src/engine/discipline/record.ts`, `src/engine/discipline/index.ts`, `tests/helpers/discipline.ts`
- Modify: `src/engine/ledger.ts`
- Test: `tests/engine/discipline/impunity.test.ts`; extend `tests/engine/ledger.test.ts`

**Interfaces:**
- Consumes: `dispositionFor`, `presenceOf`, `firstImpressionWeight`, `leashLog`, `isLiving`.
- Produces:
  - `interface ImpunityTerms { base: number; record: number; leash: number; presence: number; dependency: number; contagion: number; leverage: number }` (`presence` and `dependency` are stored as the signed contribution, i.e. already negated).
  - `impunityOf(state: CampaignState, reg: Registries, unitId: string): { value: number; terms: ImpunityTerms } | null` (`null` for a grunt, a unit that is not living, or an unknown id; `value` is rounded and clamped 0…100).
  - `leverageOf(state, reg, unitId): string[]` (ids of what she holds: flag ids, `affair`).
  - `impunityBand(value: number): 'cowed' | 'low' | 'high' | 'brazen'` (< 30, < 50, < 60, else).
  - `recordOf(state, unitId): number`; `addRecord(draft, unitId, amount, reason: string): EngineEvent[]` (clamps to ±40, emits `impunity_changed { unitId, delta, reason }` when the applied delta ≠ 0); `decayRecords(draft): void` (each record 1 toward 0); `disciplineOf(draft): NonNullable<CampaignState['discipline']>`.
  - `tests/helpers/discipline.ts`: `setRecord(state, unitId, n)`, `withStance(state, reg, unitId, stance)` (sets Trust 60 / 20 and the record so the value lands at 70 / 20), re-exports of `tests/helpers/loyalty`.

- [x] **Step 1: Write the failing tests** (campaign `campaign(reg, 4)` with `{ ...reg, presence: new Map() }` so `P = 0`, guarded world, Leash never used, so a fresh unit reads `35 + 0 + 8 = 43`)

```ts
expect(impunityOf(s, reg, a)!.value).toBe(43);
expect(impunityOf(s, reg, a)!.terms).toEqual({ base: 35, record: 0, leash: 8, presence: 0, dependency: 0, contagion: 0, leverage: 0 });
// base follows her effective disposition: offset +2 on a guarded world is volatile
unit.dispositionOffset = 2; expect(impunityOf(s, reg, a)!.terms.base).toBe(55);
// leash: 0 left and never used = +18; a `done` entry 3 days ago and 0 left = 0; 8 days ago and 2 left = 0
// presence: P = 10, met today → −10; met 7 days ago (τ 7) → round(−10·e⁻¹) = −4
// dependency: state `dependent` → −15; flag need_controlled → −10; both → −25
// contagion: others' records 20, 10, 0 → round(0.3 × 10) = 3; the unit's own record is not in the mean
// leverage: knows_crime while another named unit does not → 5; when every living named unit knows → 0; never above 15
expect(impunityOf(s, reg, grunt.id)).toBeNull();
// clamp
setRecord(s, a, 40); /* + every positive term */ expect(impunityOf(s, reg, a)!.value).toBeLessThanOrEqual(100);
```
`addRecord clamps at ±40 and reports the applied delta`; `decayRecords moves 3 → 2, −1 → 0, 0 stays`; `a save without impunityRecord reads 0`. Ledger: a dispatch that changes `impunityRecord` by −8 writes `{ key: 'record:<unitId>', delta: -8 }`.

- [x] **Step 2: Run** `npx vitest run tests/engine/discipline/impunity.test.ts` → FAIL (module not found).

- [x] **Step 3: Implement.** `ledger.ts`: a fourth kind `record` beside `res` / `stress` / `axis`, same eviction rule.

- [x] **Step 4: Run** → PASS. **Step 5: Commit** `feat(engine): impunity as a computed value with one stored term`

---

### Task 3: The four intents and held defiance

**Files:**
- Modify: `src/engine/relations/intents.ts`, `src/engine/relations/apply.ts`, `src/engine/discipline/record.ts`, `src/engine/actions/scene.ts`, `src/llm/calls/intentExtract.ts`, `src/scene/sceneController.ts`, `src/scene/comms.ts`
- Test: `tests/engine/discipline/intents.test.ts`; extend `tests/engine/relations/intents.test.ts`, `tests/llm/intentExtract.test.ts`, `tests/scene/sceneController.test.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `validateIntents(raw, ctx)` with `ctx.measures?: string[]`; `EventIntent.measure?`.
  - `IntentExtractInput.measures: string[]`; `measureList(reg: Registries): string[]` in `src/engine/discipline/index.ts` (`[...reg.punishments.keys(), 'leash', 'unspecified']`; before Task 8 the registry is empty).
  - `holdDefiance(draft, unitId, severity, source, sceneId?): EngineEvent[]` (`defiance_noted`); `settleDefiance(draft, ctx, filter: { sceneId?: string; all?: boolean }): EngineEvent[]` (`defiance_settled { unitId, tolerated: true }` + `addRecord`); `dropDefiance(draft, unitId): PendingDefiance | undefined`.
  - `applyDisciplineEvent(draft, ctx, unitId, event, src: { channel: 'scene' | 'dm'; sceneId?: string; messageRef?: string }): EngineEvent[]` in `record.ts`: the single entry `applyIntents` calls for the four types instead of `applyEventToUnit`. This task: `defied` → row + hold; `commander_yielded` → row + `addRecord(yielded[severity])` + settle her held defiance as tolerated; `commander_enforced` → row + `addRecord(enforcedFallback)` + `dropDefiance`; `threatened` → row only (Task 4 registers the threat).
  - `intents/apply` payload gains `messageRef?: string` (scene: `chat:<lastReplyIndex>`, DM: `dm:<her message id>`), passed on by the two controllers.

- [x] **Step 1: Write the failing tests**

validator: `defied needs a unit actor and no targets` (commander actor → dropped); `commander_enforced, commander_yielded and threatened need the commander and a target`; `an unknown measure reads verbal on an enforcement and unspecified on a threat` (`measures: ['verbal', 'brig', 'leash', 'unspecified']`; inputs `'guillotine'`, `42`, missing); `leash on an enforcement reads verbal`; `granted_demand from the model is dropped`.
engine (`intents/apply` in an open scene):
`a defied changes no record until the scene ends` (record 0 after apply; after `scene/end` record 5 for `moderate`, deed `defiance_tolerated` — deed assertion moves to Task 16);
`an enforcement in the same scene cancels the held defiance` (after `scene/end` record −8, not −3);
`two defied keep the higher severity` (minor then major → +8);
`scene/abort settles too`; `a DM defied waits for the day end` (Task 4 adds the step; here assert it is still held after `intents/apply`);
`commander_yielded major gives +10 at once`;
`confidence 0.59 drops an enforcement and a threat, 0.6 keeps them` (the dropped one is absent from `intents_applied.landed` and takes no event slot);
`a grunt target is ignored`.
prompt: the system text lists the four types and a `MEASURE:` line with the given measures; `prompts are identical for a fearful and an openly defiant unit` (same input, records −40 and +40).

- [x] **Step 2: Run** → FAIL.

- [x] **Step 3: Implement.** Prompt additions (exact):
  - shape line: `"measure": MEASURE,   // only for commander_enforced / threatened`
  - `MEASURE: ${input.measures.join(', ')}`
  - rules: `"defied": a unit refuses, mocks or ignores an order or the commander's authority; the unit is the actor, no targets.` · `"commander_enforced": the commander actually imposes a consequence on a unit now (not a warning); set "measure".` · `"threatened": the commander warns of a consequence without imposing it; set "measure" ("unspecified" when none is named).` · `"commander_yielded": the commander backs down after defiance or after a threat.`

  In `applyIntents` the confidence gate sits in the `judged` filter (before the cut to six).

- [x] **Step 4: Run** `npm test` → PASS. **Step 5: Commit** `feat(engine): defied, enforced, yielded and threatened intents with held defiance`

---

### Task 4: Pending threats, the day step, the Leash as enforcement

**Files:**
- Create: `src/engine/discipline/dayStep.ts`, `src/engine/actions/discipline.ts`
- Modify: `src/engine/discipline/record.ts`, `src/engine/leash/use.ts`, `src/app.ts` (the import line only), `tests/helpers/loyalty.ts` (import the new actions)
- Test: `tests/engine/discipline/threats.test.ts`, `tests/engine/discipline/dayStep.test.ts`; extend `tests/engine/leash/*.test.ts`

**Interfaces:**
- Produces:
  - `registerThreat(draft, ctx, unitId, event, src): EngineEvent[]` (applies the row, stores the threat with `believed = impunityOf(…).value < 50` and an `inverse` of the row's deltas; `threat_registered { threatId, unitId, measure, believed }`).
  - `enforce(draft, ctx, unitId, e: { measure: string; severity: 1 | 2 | 3 | 4; recordDelta: number }): { events: EngineEvent[]; removed: { defiance?: PendingDefiance; threat?: PendingThreat } }`: the one place an enforcement touches `R`, held defiance and a pending threat (`threat_kept`). Used by the fallback path of Task 3, by the Leash here and by punishments in Task 9.
  - `lapseThreat(draft, ctx, threat): EngineEvent[]` (`threat_lapsed`, the engine-made `commander_yielded`).
  - `disciplineDayStep(draft, ctx): EngineEvent[]`, registered with `registerDayEndStep('director_tick', …)` after the loyalty step (import order in `app.ts`: after `./engine/actions/loyalty`). Order inside: settle non-scene defiance → lapse threats with `deadlineDay ≤ day` → `decayRecords`. Later tasks append sabotage, restrictions, demands and reputation.
  - `forgetUnit(draft, unitId): void` (her defiance, threats, later restrictions and demands), called by `removeFromService`.

- [x] **Step 1: Write the failing tests**

`a threat lapses into commander_yielded at the end of the next day` (threat on day 3; `endDay` → day 4, still pending; `endDay` → day 5: no threat, record +6 for an `unspecified` threat, history has `commander_yielded`, event `threat_lapsed`) — **acceptance 2**;
`a brig or leash threat lapses as major` (+10);
`an enforcement before the deadline keeps the threat` (no yield, event `threat_kept`);
`a second threat keeps the first deadline`;
`an extracted yield lapses the threat at once and does not yield twice`;
`belief is fixed at registration` (record 40 → `believed: false`; record −40 → `true`);
`decay: record 5 is 4 after one day end, −3 is −2` — **acceptance 1**;
`an old save runs the day step` (delete `discipline`, `impunityRecord`; `endDay` gives no `day_end_step_failed`);
Leash: `a done compel gives the target −20, cancels her held defiance and keeps a leash threat`; `a failed burst and a denied terminate change no record`; `combat compels are counted when the fight is settled` (`settleCompels`).

- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` → PASS.

- [x] **Step 5: Commit** `feat(engine): pending threats, discipline day step and the Leash as enforcement`

---

### Task 5: Command stances, refusal form, mutiny gate, covert sabotage

**Files:**
- Create: `src/engine/discipline/stance.ts`, `src/engine/discipline/sabotage.ts`
- Modify: `src/engine/loyalty/refusal.ts`, `src/engine/loyalty/mutiny.ts`, `src/engine/discipline/dayStep.ts`, `src/engine/world/expedition.ts`
- Test: `tests/engine/discipline/stance.test.ts`, `tests/engine/discipline/sabotage.test.ts`; update `tests/engine/loyalty/{refusal,mutiny,disposition}.test.ts`, `tests/app.loyalty.test.ts`

**Interfaces:**
- Produces:
  - `type CommandStance = 'disciplined' | 'defiant_loyal' | 'fearful' | 'open_defiance'`; `commandStance(state, reg, unitId): CommandStance | null`; `stanceEntry(reg, stance): Entry | undefined`.
  - `orderInScene` result event: `scene_order { unitId, refused, chance, covert? }`.
  - `queueSabotage(draft, unitId)`, `sabotageDayStep(draft, ctx): EngineEvent[]`, `gearFault(draft, ctx): EngineEvent[]` (called inside `expedition/start` after the party is accepted).
  - `mutinyReady` unchanged; new `mutinyAllowed(state, reg, unitId): 'mutiny' | 'desert' | 'none'` used by `mutinyDayStep`.

- [x] **Step 1: Write the failing tests**

stance quadrants — **acceptance 3** (Trust, Impunity → stance): `(60, 20) disciplined`, `(60, 70) defiant_loyal`, `(20, 20) fearful`, `(20, 70) open_defiance`, edges `(45, 50) defiant_loyal`, `(44, 49) fearful`; grunt → `null`.
refusal: `a refused order holds a moderate defiance` (non-fearful; `scene.refusals` has her; after `scene/end` record +5); `a compel after the refusal cancels it` (record −20 after the scene); `a fearful refusal is hidden` (seed searched so the roll refuses: event `refused: false, covert: true`, `scene.refusals` empty, no held defiance, `discipline.sabotage.queued` has her); `a fearful compliance queues nothing`.
mutiny: `a ready unit with impunity 59 does not mutiny` (20 seeded day ends, no `mutiny_started`); `with 60 she can`; `breaking with impunity 29 attempts desertion instead` (`desertion_attempt`, never `mutiny_started`); `between 30 and 59 nothing fires and her signs stay`.
sabotage: `a queued sabotage fires at the next day end` (one of: supplies −2, credits −10, a waiting gear fault), `writes an anonymous fact` (the fact text contains no squad member's `displayName`, `knownBy: ['*']`), `never takes a resource below 0`, `at most one a day` (three fearful units, queued twice → one event); `no fearful unit, nothing queued → no rng draw` (rng state equal to a run without the step's roll); `a gear fault costs 2 carried supplies at the next expedition start half the time and is cleared either way` (two searched seeds).

- [x] **Step 2: Run** → FAIL.

- [x] **Step 3: Implement.** Existing mutiny tests expect a mutiny from fixtures whose Impunity is below 60: give those units `impunityRecord: 40` through `setRecord` in the fixtures (not in the rule), and say so in the commit message. Fact texts (drafts): `The supply count came up short. Nobody saw anything.` · `Credits are missing from the outpost account. The log shows nothing.` · `Someone has been at the gear lockers.` Expedition log line: `Gear fault: a sealed pack turned out to be empty.`

- [x] **Step 4: Run** `npm test` → PASS; `npm run sim` still prints its report.

- [x] **Step 5: Commit** `feat(engine): command stances, hidden fearful refusals, mutiny gate and covert sabotage`

---

### Task 6: Stance directives and wiring of chunk (a)

**Files:**
- Create: `src/discipline/directives.ts`, `src/discipline/context.ts`, `src/discipline/deps.ts`, `src/discipline/controller.ts`
- Modify: `src/loyalty/loyaltyController.ts`, `src/loyalty/directives.ts`, `src/app.ts`, `tests/architecture.test.ts`
- Test: `tests/discipline/directives.test.ts`, `tests/discipline/controller.test.ts`; extend `tests/loyalty/loyaltyController.test.ts`, `tests/app.loyalty.test.ts`

**Interfaces:**
- Consumes: `commandStance`, `stanceEntry`, `ContextBuilder`, `LoyaltyDeps`.
- Produces:
  - `stanceDirective(unitId, name, entry: Entry, band: LoyaltyBand): Directive` (id `loyalty:<unitId>`, `scene`; `breaking` appends the P6 sentence `She is close to leaving the unit: if pressed she says she is thinking of going.`).
  - `stanceRefusalDirective(unitId, name, entry, reason): Directive` (id `refusal:<unitId>`, `scene`).
  - `threatDirective(unitId, name, label, believed): Directive` (id `threat:<unitId>`, `next_reply`): `{name} believes the commander's threat ({label}) will be carried out.` / `{name} does not believe the commander's threat ({label}) will be carried out, and it shows.`
  - `disciplineDirectives(builder, state, reg): void` and `clearDisciplineDirectives(builder)`: sets `loyalty:<id>` for every named participant of the open scene, drops the ones of units that left. Called from `applyContext()` next to `worldDirectives`.
  - `measureLabel(reg, measure): string` (registry `label`; `leash` → `The Leash`; `unspecified` → `Consequences`).
  - `interface DisciplineController { onEvents(events: EngineEvent[]): void; onSceneOpened(): void; onSceneClosed(): void }`, `createDiscipline(deps: DisciplineDeps): DisciplineController`; `AliusApp.discipline`. This task: `onEvents` sets the threat directive from `threat_registered` and, in debug mode, toasts `covert_sabotage`; otherwise the app toasts `A threat lapsed: {name} saw the commander back down.` on `threat_lapsed`.
  - `LoyaltyController.order`: on `refused` uses `stanceRefusalDirective`; on `covert` sets the fearful `refusal` text under the same id and returns `false`.

- [x] **Step 1: Write the failing tests**

`the directive of a participant matches her quadrant` (four fixtures, the exact registry text with her name) — **acceptance 3**; `a stance change during a scene replaces the text on the next render`; `a wavering unit shows the stance text, not the P6 wavering text`; `a breaking unit gets the stance text plus the leaving sentence`; `a covert refusal sets the fearful refusal text and reports no refusal`; `a believed and an unbelieved threat give the two texts`; `directives are cleared when the scene closes and when another chat loads`; architecture: `src/discipline` imports no `/ui/`, no `st/real`, no `st:`.

- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` → PASS.

- [x] **Step 5: Commit** `feat(discipline): stance and threat directives, refusal form, app wiring`

---

### Task 7: Impunity and stance in SQUAD and in the analysis panel

**Files:**
- Create: `src/analysis/providers/discipline.ts`, `css/70-discipline.css`
- Modify: `src/analysis/providers/core.ts`, `src/analysis/describe.ts` (via `DESCRIBED_REGISTRIES`), `src/content/schemas.ts`, `src/ui/squad/squadTab.ts`, `content/core/glossary.json`, `tests/fixtures/analyze/hidden.ts`
- Test: `tests/analysis/impunityReading.test.ts`; extend `tests/ui/squad.test.ts`, `tests/analysis/hidden.test.ts`, `tests/content/glossaryCore.test.ts`

**Interfaces:**
- Produces: `registerDisciplineProviders()` (called by `registerCoreProviders`); providers `glossary:impunity` and `commandStances` (both read `subject.data.unitId`); `commandStances` joins `DESCRIBED_REGISTRIES`; glossary entries `impunity`, `command_stance`, `impunity_record`, `leverage`, `threat`, `covert_sabotage`; SQUAD chips for a named living unit: `STANCE: <NAME>` (`data-stance`, `commandStances:<id>`, ctx `{ unitId }`) and `IMPUNITY: <BAND>` (`data-impunity`, `glossary:impunity`, ctx `{ unitId }`).

- [x] **Step 1: Write the failing tests**

reading without raw values: lines `Stance: Defiant-loyal`, `Impunity: high`, then one line per non-zero term in words only — `Disposition: raises it` / `lowers it` (base against 35), `Record: she has been getting away with things` / `she has been brought to heel`, `The Leash: looks like an empty threat` / `was used recently`, `Presence: the commander's presence holds her back` / `invites it`, `Dependency: she needs the commander`, `Squad mood: the others are getting bolder` / `the others are careful`, `Leverage: she holds something over the commander`; no digit anywhere in the lines. With raw values: `Impunity: 62` and each term with its number through `k.raw`. `a grunt has no reading`. Hidden fixture: add `impunityRecord: 31`, `discipline.sabotage.queued: [{ unitId, day: 8 }]`, `commander.deeds.threats_empty: 53`; sentinels gain `31` and `53`; the hidden-state test stays green over every provider. UI: the two chips exist with resolving addresses; a grunt card has neither.

- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` → PASS (coverage and hidden tests included).

- [x] **Step 5: Commit** `feat(analysis): impunity and command stance readings, SQUAD chips` — **end of chunk (a)**

---

## Chunk (b) — Punishments, menu and dialogue, chips with UNDO

### Task 8: `punishments` registry and restrictions

**Files:**
- Create: `content/core/punishments.json`, `src/engine/discipline/restrictions.ts`
- Modify: `src/content/{types,schemas,refs}.ts`, `content/core/manifest.json`, `src/engine/actions/scene.ts`, `src/engine/activities.ts`, `src/engine/world/expedition.ts`, `src/engine/discipline/{record,dayStep}.ts`
- Test: `tests/content/p9Schemas.test.ts`, `tests/engine/discipline/restrictions.test.ts`; extend `tests/content/{core,pronouns}.test.ts`

**Interfaces:**
- Produces: `PunishmentSchema` and `PunishmentEffectSchema` (the vocabulary and table of the rulings section; `confine.minDays ≤ maxDays`, 1…7; `perception[].multiplier` 0.5…3; at most one of `confine` / `bench` / `duty` / `no_leave` per entry); `punishments` joins `REGISTRY_NAMES` and `DESCRIBED_REGISTRIES`; `restrictionReason(state, unitId, use: 'scene' | 'companion' | 'expedition', activityId?: string): string | null`; `addRestriction(draft, r): EngineEvent[]`; `removeRestrictions(draft, pick): Restriction[]`; `expireRestrictions(draft): EngineEvent[]` (day step, `restriction_ended`); `dutySlot(state): { day: number; slot: Slot }`.
- Hook points: `scene/start` (participant), `checkActivity` (companion; `talk` and `medbay` pass `no_leave`), `expedition/start` check (party) and, on a successful start, removal of every `benched` restriction of units not in the party.

- [ ] **Step 1: Write the failing tests**

schema: the six core entries parse; `two exclusive side effects are rejected`; `an unknown side effect type is rejected`. Reasons (exact): confined `{Name} is in the brig until day {n}.` · duty `{Name} is on extra duty this slot.` · no_leave `{Name} has no leave until day {n}.` · benched `{Name} is benched for the next expedition.`
`a confined unit cannot join a scene, be a companion or leave on a run until the day after untilDay`; `no_leave blocks rest and mess with her and allows talk and medbay`; `benched ends when a run starts without her and stays when the start is refused`; `duty covers the current slot, or the next one while a scene holds the slot` (applied in the evening with a scene open → next day's morning); `expired restrictions are dropped by the day step`; `removeFromService forgets her` (restriction, threat, held defiance gone) — Review Focus 3.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` → PASS.

- [ ] **Step 5: Commit** `feat(content): punishments registry and unit restrictions`

---

### Task 9: Applying a punishment (menu path)

**Files:**
- Create: `src/engine/discipline/punish.ts`
- Modify: `src/engine/relations/deltas.ts`, `src/engine/actions/discipline.ts`, `src/engine/discipline/record.ts`
- Test: `tests/engine/discipline/punish.test.ts`; extend `tests/engine/relations/deltas.test.ts`, `tests/engine/commander/image.test.ts`

**Interfaces:**
- Consumes: `enforce` (Task 4), restrictions (Task 8), `applyEventToUnit`.
- Produces:
  - `rowFor(state, reg, unitId, event, severity): Row | undefined` in `deltas.ts` (the punishment's `deltas × perception` for `commander_enforced` with a known measure; `eventDeltas` otherwise) and the `dispositionScaling: 'none'` skip.
  - `perceptionOf(reg, unit, punishment): number` (highest multiplier among matching tags, 1 with none).
  - `checkPunish(state, reg, unitId, measure, days?): string | null` (named, living, not `deserted`; known measure; not the same measure today; `days` within the entry's range; not already under that restriction kind).
  - `applyPunishment(draft, ctx, p: { unitId: string; measure: string; days?: number; source: 'menu' | 'dialogue'; channel: 'scene' | 'dm' | 'pda'; sceneId?: string; messageRef?: string }): EngineEvents` → `discipline_applied { applicationId, unitId, measure, source }` + the relation, stress, restriction, resource and record events; stores the `Application` with its `inverse` (newest 20).
  - Action `discipline/punish { unitId, measure, days? }` (source `menu`; channel `scene` when she is in the open scene, else `pda`). A menu application writes the public fact `The commander imposed {label} on {name}.`

- [ ] **Step 1: Write the failing tests**

`a menu punishment applies the registry deltas` — **acceptance 4** (guarded unit, no tags, empty presence, `average` build, Trust 50, Affinity 10, stress 20; `brig`, 2 days → Trust 44, Affinity 2, stress 32, record −20, restriction `confined` until `day + 2`, event `discipline_applied`);
`disposition scales the cost` — **acceptance 8** (hazardous unit, `brig` → Trust −12, Affinity −16; an entry with `dispositionScaling: 'none'` → −6 / −8);
`perception multiplies deltas and deterrence` (`lives_for_combat` in her likes, `bench` → Trust −8, Affinity −10, stress 12, record −30);
`a slight commander's punishment is off-image` (day 0, `slight` build → the axis deltas × 1.3);
`revoke_rations returns one supply, extra_duty five credits`;
`the same measure twice a day is refused and changes nothing`; `an unknown measure, a grunt, a deserter are refused`; `brig days outside 1–3 are refused`;
`a punishment cancels held defiance and keeps a matching threat` (threat `revoke_leave`, punishment `brig` → kept; threat `brig`, punishment `verbal` → still pending);
`no rng draw` (rng state unchanged by `discipline/punish`).

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` → PASS.

- [ ] **Step 5: Commit** `feat(engine): punishments applied through the delta chain`

---

### Task 10: Dialogue path and UNDO

**Files:**
- Modify: `src/engine/discipline/{punish,record}.ts`, `src/engine/actions/discipline.ts`
- Test: `tests/engine/discipline/undo.test.ts`, `tests/engine/discipline/dialogue.test.ts`

**Interfaces:**
- Produces: `applyDisciplineEvent` now routes `commander_enforced` to `applyPunishment` (source `dialogue`, `days` = the entry's `minDays`, a refused `checkPunish` → the event is skipped) and `threatened` to `registerThreat`; `undoApplication(draft, ctx, id): EngineEvent[]`, `undoThreat(draft, ctx, id): EngineEvent[]`; action `discipline/undo { id }` (an application id `ap_…` or a threat id `th_…`) → `discipline_undone { id, unitId }`; `canUndo(state, id): string | null`.

- [ ] **Step 1: Write the failing tests**

`a dialogue punishment logs an application with the message ref` (`intents/apply` with `commander_enforced`, measure `revoke_rations`, confidence 0.8, `messageRef: 'chat:7'` → application `{ source: 'dialogue', channel: 'scene', messageRef: 'chat:7' }`, no fact written);
`undo restores the exact previous state` — **acceptance 4**:
```ts
const strip = (s: CampaignState) => { const c = structuredClone(s); delete c.ledger; delete c.memory.nextId; return c; };
expect(strip(undone)).toEqual(strip(before));   // before = state right before intents/apply; covers axes, stress, record, state, band, history, restrictions, resources, deeds, defiance, threats
```
run for `revoke_rations`, `brig` (which also moves her loyalty band in the fixture) and a punishment that had cancelled a held defiance and kept a threat (both come back);
`undo leaves no memory entry` (facts and chronicle length equal, her history has no `commander_enforced`);
`undo after a later gain keeps the later gain` (apply −6 Trust, then +3 from another event, undo → Trust = start + 3) — Review Focus 2;
`a menu punishment cannot be undone` (`Only a punishment read from dialogue can be undone.`); `not after its scene ended`; `not on a later day`; `an id twice is refused`;
`undoing a threat removes it and reverts its deltas`; `a lapsed or kept threat cannot be undone`;
`a garbled measure never applies an unknown punishment` (measure `"brig; drop table"` → `verbal`), `0.59 logs nothing` — Review Focus 4.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` → PASS.

- [ ] **Step 5: Commit** `feat(engine): dialogue punishments, application records and exact undo`

---

### Task 11: Discipline controller: reply directive, DMs, rollback

**Files:**
- Modify: `src/discipline/{controller,directives}.ts`, `src/scene/sceneController.ts`, `src/scene/comms.ts`, `src/app.ts`
- Test: extend `tests/discipline/controller.test.ts`, `tests/scene/sceneController.test.ts`, `tests/scene/comms.test.ts`

**Interfaces:**
- Produces: `DisciplineController.punish(unitId, measure, days?): boolean`, `.undo(id): boolean`; `punishDirective(unitId, name, label, stanceName): Directive` (id `discipline:<unitId>`, `next_reply`; text `The commander has imposed {label} on {name}. React in character; stance: {stance}.`); `SceneUiEvent` gains `{ type: 'discipline' }` (redraw the chips); `comms.readExchange` passes `messageRef` and `measures` and no longer filters these events out.

- [ ] **Step 1: Write the failing tests**

`a menu punishment in a scene sets the reply directive for her next reply`; `outside a scene it sets none and toasts`; `a dialogue punishment sets no directive (her reply already reacted) and raises a discipline UI event`; `undo clears the directive of that application`;
`swipe after a logged punishment removes the application` (the P3 rollback restores the state before the reading; `discipline.applications` is empty; the re-read reply logs it again once) and `undo then swipe reverts once` (toast `DEBUG_NOT_ROLLED_BACK` in debug mode, record back at its start value, not below) — Review Focus 1;
`a threat written in a DM is registered with channel dm` and `a punishment written in a DM applies` (fake mechanic reply with the event; `messageRef` starts with `dm:`).

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` → PASS.

- [ ] **Step 5: Commit** `feat(discipline): reply directive, DM channel and rollback of logged discipline`

---

### Task 12: DISCIPLINE menu and chips

**Files:**
- Create: `src/ui/discipline/menu.ts`, `src/ui/discipline/chips.ts`
- Modify: `src/ui/squad/squadTab.ts`, `src/ui/scene/sceneScreen.ts`, `src/ui/comms/commsTab.ts`, `src/app.ts`, `src/analysis/providers/discipline.ts`, `src/analysis/effects.ts`, `content/core/glossary.json`, `css/70-discipline.css`
- Test: `tests/ui/disciplineMenu.test.ts`, `tests/ui/disciplineChips.test.ts`; extend `tests/ui/{squad,scene,comms}.test.ts`, `tests/analysis/impunityReading.test.ts`

**Interfaces:**
- Produces:
  - `renderDisciplineMenu(ctx: { state; registries; unitId; onPunish(measure: string, days?: number): void }): HTMLElement` — a `<details class="alius-discipline">` with summary `[ DISCIPLINE ]`, one button per punishment in severity order (`alius-btn alius-option`, `data-punish="<id>"`, `analyzeNative('punishments:<id>', { unitId })`), a 1–3 day `<select data-brig-days>` for a `confine` entry, a button the engine would refuse soft-disabled (`aria-disabled="true"`, `title` = `checkPunish`'s reason).
  - `drawDisciplineChips(host, state, registries, pick: (c: { channel: string; unitId: string; sceneId?: string }) => boolean, onUndo: (id: string) => void): void`. Texts (exact): `DISCIPLINE LOGGED — {label} ({Name})` + `[UNDO — not what I meant]`; `THREAT REGISTERED — {label} ({Name}) · She believes it` / `· She doesn't buy it` + the same UNDO. The label span is `alius-chip` with `analyzeAttrs('glossary:discipline_logged' | 'glossary:threat', { unitId })`; the buttons are `alius-btn alius-tagchip` with `data-undo="<id>"`. UNDO is drawn only while `canUndo` is `null`.
  - `SquadTabCtx.onPunish?`, `SceneScreenCtx.onPunish?` / `onUndoDiscipline?`, `CommsTabCtx.onUndoDiscipline?`; SQUAD restriction chips (`IN THE BRIG`, `NO LEAVE`, `BENCHED`, `EXTRA DUTY`; `glossary:restriction`).
  - `summarizePunishment(entry): string[]` (words only) and a `punishments` provider: with a `unitId` it adds `She takes this harder than most.` when `perceptionOf > 1`, and the numbers only through `Knowledge`. Glossary: `discipline`, `discipline_logged`, `restriction`.

- [ ] **Step 1: Write the failing tests**

menu: six buttons in ladder order with resolving addresses; clicking `brig` with the select at 2 calls `onPunish('brig', 2)`; a measure already imposed today is `aria-disabled` and its click does nothing; a grunt card has no menu.
chips — **acceptance 4 and 5**: `a dialogue punishment draws DISCIPLINE LOGGED — Rations revoked (Ann) with UNDO`; `a believed threat reads She believes it, an unbelieved one She doesn't buy it`; `chips are drawn with show raw values off`; `clicking UNDO calls onUndo with the id and the chip is gone after the refresh`; `a menu punishment draws no chip`; `after a reload the chips are drawn from the state again` — Review Focus 5; the scene draws only chips of its participants, a COMMS thread only its unit's `dm` chips.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` → PASS (coverage test included).

- [ ] **Step 5: Commit** `feat(ui): DISCIPLINE menu, logged and threat chips with UNDO` — **end of chunk (b)**

---

## Chunk (c) — Demands, reputation, docs

### Task 13: Demands in the engine

**Files:**
- Create: `content/core/demandTemplates.json`, `src/engine/discipline/demands.ts`
- Modify: `src/content/{types,schemas,refs}.ts`, `content/core/{manifest,flags}.json`, `src/engine/tuning.ts`, `src/engine/relations/deltas.ts`, `src/engine/actions/discipline.ts`, `src/engine/discipline/{dayStep,record}.ts`
- Test: `tests/engine/discipline/demands.test.ts`; extend `tests/content/{p9Schemas,core,pronouns}.test.ts`

**Interfaces:**
- Produces: `DemandTemplateSchema` + `DemandCostSchema` (rulings section; `kind` is the spec's six; `text` ≤ 240 with `{name}` optional); `demandTemplates` joins `REGISTRY_NAMES` and `DESCRIBED_REGISTRIES`; flag `own_room` (relation) declared; `TUNING.demands = { baseChance: 0.04, maxChance: 0.5, perWeek: 2, weekDays: 7, maxOpen: 2, expiresInDays: 2, grantRecord: 4, refuseHighMult: 1.5, textMax: 240 }`; `TUNING.disposition.bigGesture.events = ['protected', 'granted_demand']`;
  - `eligibleTemplates(state, reg, unitId): Entry[]`, `demandChance(state, reg, unitId): number`, `openDemand(draft, ctx, unitId, opts?: { owed?: boolean }): { demand: Demand; events: EngineEvent[] } | null`, `grantProblem(state, reg, demandId): string | null`;
  - actions `demand/roll {}`, `demand/deliver { demandId, text? }` (`demand_delivered { demandId, unitId, viaDm }`), `demand/answer { demandId, answer: 'grant' | 'refuse' }` (`demand_resolved { demandId, unitId, answer, expired? }`);
  - `rowFor` reads `grantDeltas` / `refuseDeltas` for the two engine event types through `event.templateId`;
  - the day step delivers undelivered demands with their template text and expires old ones.

- [ ] **Step 1: Write the failing tests** — **acceptance 6**

`chance grows with impunity and disposition` (I 50, guarded, weight 1 → 0.04; I 100, hazardous, `open_defiance` weight 2 → 0.32; never above 0.5; a grunt → 0);
`conditions filter templates` (a `stances: ['open_defiance']` template is not eligible for a `disciplined` unit; `flagsNone: ['knows_crime']` hides `tell_crime` once she knows; `claim_weapon` needs an unequipped weapon of rarity ≥ `refined`);
`at most two demands per unit in seven days` (a unit at Impunity 100 on a hazardous world; 200 `demand/roll`s over 7 days, each open demand refused at once: never a third opening; from day 8 a new one can open);
`one new demand per roll, two open at most, none for a unit that has one`;
`deliver pushes a DM from her when she is not in the scene` (`initiated: true`, the given text cut at 240, plain text) and `no DM when she is in the open scene`; `a text with control characters is cleaned`;
`an undelivered demand is delivered with the template text at day end` — Review Focus 5;
`grant pays the cost and applies grantDeltas`, per cost type: supplies −2; credits −20 + other units' stress +2 + flag `own_room`; a `benched` restriction on her; the weapon equipped on her (her old one back in the inventory); `knows_crime` set through `revealCrime`; `dismissed / moderate` on the other unit with the lowest Affinity;
`an impunity-driven grant adds 4 to the record` (opened in `open_defiance`), `a disciplined unit's grant adds none`;
`a costly grant is a big gesture` (volatile unit: positive axes × 1.5);
`refuse applies refuseDeltas, × 1.5 at impunity 50 or more, and holds a moderate defiance there`;
`an owed demand refused also breaks a promise` (`broke_promise` in her history);
`a cost that cannot be paid refuses the grant and changes nothing` (`Not enough supplies (needs 2).`) — Review Focus 6;
`an open demand expires after two days as a refusal` (`expired: true`).

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (draft template numbers: `grantDeltas` trust 2 / affinity 3, costly ones 4 / 6; `refuseDeltas` −2 / −3 / stress 4; weights 3, 1, 2, 1, 2, 1 in the order of the rulings section). **Step 4: Run** `npm test` → PASS.

- [ ] **Step 5: Commit** `feat(engine): unit demands with caps, costs, grant and refuse`

---

### Task 14: The delegate bills later

**Files:**
- Modify: `src/engine/commander/checks.ts`, `src/app.ts` (the toast)
- Test: update `tests/engine/commander/checks.test.ts`, `tests/engine/dilemma/*route*.test.ts` / `tests/engine/world` route tests that assert `delegate_demand`

**Interfaces:**
- Consumes: `openDemand(draft, ctx, unitId, { owed: true })`.
- Produces: `resolveRoute` — one band short: `openDemand` succeeds → `passed: true`, the compliance costs, events `delegate_demand { unitId, demandId }` + `demand_opened`; it returns `null` → `passed: false`, `delegate_refused`. Toast: `{Name} does it, and will want something for it.`

- [ ] **Step 1: Write the failing tests**

`one band short: she complies and an owed demand opens` (`route_taken.passed === true`, `discipline.demands[0].owed === true`, the affinity cost was paid); `with an open demand already, she refuses` (`delegate_refused`, nothing paid); `no eligible template → she refuses`; `two bands short and breaking loyalty refuse as before`; `at or above the band no demand opens`.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (the template pick is a new `ctx.rng` draw on this branch only; update seeded expectations that hit it and name them in the commit). **Step 4: Run** `npm test` → PASS.

- [ ] **Step 5: Commit** `feat(engine): a delegate one band short complies and opens an owed demand`

---

### Task 15: Demand wording, delivery and chips

**Files:**
- Modify: `src/llm/calls/flavor.ts`, `src/settings.ts`, `src/ui/shell/sysTab.ts`, `src/discipline/{controller,directives}.ts`, `src/ui/discipline/chips.ts`, `src/ui/scene/sceneScreen.ts`, `src/ui/comms/commsTab.ts`, `src/app.ts`, `content/core/glossary.json`
- Test: `tests/llm/flavor.test.ts`, `tests/discipline/demandController.test.ts`, `tests/ui/demandChips.test.ts`, `tests/settings.test.ts`

**Interfaces:**
- Produces:
  - flavor kind `demand`: `interface DemandFlavorInput { kind: 'demand'; unitName: string; stateHint: string; stanceName: string; demand: string }`; `sanitizeDemandFlavor(raw): { text: string } | null` (plain text, ≤ 240, empty → `null`); `generateDemandFlavor(input, deps): Promise<string | null>`. The system text says: one or two sentences in her voice, addressed to the commander as "you", no new facts, nothing but what the demand asks; the template text is data inside `<demand>`.
  - setting `demandWording: boolean` (default `true`; SYS › Relationships; glossary `setting_demand_wording`).
  - `DisciplineController.onSlotAdvanced(): Promise<void>` (skips while an expedition, combat or presented dilemma is open; dispatches `demand/roll`; for each `demand_opened` words it when the setting is on and a mechanic profile answers, then `demand/deliver`, all with `expectChatId`); `.answerDemand(id, 'grant' | 'refuse'): boolean`; `.talkDemand(id): Promise<boolean>` (`app.startScene({ locationId: 'quarters_unit', participants: [unitId], origin: 'event' })`); `demandDirective(unitId, name, text): Directive` (id `demand:<unitId>`, `scene`): `{name} demands something of the commander and presses it this scene: "{text}"`. Also handles `demand_opened` events that come from a route (`delegate_demand`).
  - `drawDemandChips(host, state, registries, pick, on: { grant(id); refuse(id); talk(id) })`: label `{NAME} DEMANDS: {text}` (`alius-chip`, `demandTemplates:<id>`, ctx `{ unitId }`), `OWED` mark for an owed one, buttons `[GRANT] [REFUSE] [TALK]` (`data-demand-answer`); `[GRANT]` is `aria-disabled` with `grantProblem`'s reason; `[TALK]` is absent inside a scene. Glossary: `demand`, `owed_demand`.
  - COMMS tab badge counts open demands delivered by DM as unread until answered.

- [ ] **Step 1: Write the failing tests**

flavor: `a valid answer gives the text`, `markup and a 400-character answer are cut to plain 240`, `the prompt wraps the template text in <demand> and names no pronoun for the commander`;
controller: `a slot change rolls, words and delivers` (fake mechanic reply `{"text":"I want double rations. Starting tonight."}` → the DM carries that text); `wording off or a failed call delivers the template text with no second call`; `nothing is rolled during an expedition`; `a chat switch between roll and delivery drops the delivery` (the engine delivers it at day end); `grant and refuse dispatch demand/answer and clear the directive`; `TALK opens a private scene with the demand directive and keeps the demand open`; `a demand of a unit in the open scene sets the directive at once`;
chips: the three buttons, the `OWED` mark, `GRANT` soft-disabled with the reason and inert, addresses resolve; drawn in the scene for participants and in the unit's COMMS thread.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` → PASS.

- [ ] **Step 5: Commit** `feat(discipline): demand wording, delivery, TALK and chips`

---

### Task 16: Deeds and reputation patterns

**Files:**
- Create: `content/core/reputations.json`, `src/engine/discipline/deeds.ts`, `src/engine/discipline/reputation.ts`
- Modify: `src/content/{types,schemas,refs}.ts`, `content/core/manifest.json`, `src/engine/tuning.ts`, `src/engine/relations/effects.ts`, `src/engine/leash/use.ts`, `src/engine/combat/outcome.ts`, `src/engine/discipline/{record,punish,demands,dayStep,impunity}.ts`, `src/engine/actions/discipline.ts`
- Test: `tests/engine/discipline/deeds.test.ts`, `tests/engine/discipline/reputation.test.ts`; extend `tests/content/{p9Schemas,core,pronouns}.test.ts`, the Task 3–13 tests marked "deed assertion"

**Interfaces:**
- Produces: `DEED_COUNTERS`, `countDeed(draft, counter, n = 1): void`, `deedsOf(state): Record<DeedCounter, number>`; `ReputationSchema` (rulings section; `pattern.sum` and `against` are checked against `DEED_COUNTERS`; `min ≥ 1`; `minShare` needs `against`); `reputations` joins `REGISTRY_NAMES` and `DESCRIBED_REGISTRIES`; `TUNING.reputation = { maxActive: 2, trustPerWeight: 2, affinityPerWeight: 3 }`; `patternHolds(state, entry): boolean`, `patternScore(state, entry): number`; `reputationDayStep(draft, ctx): EngineEvent[]` (`nickname_pending { id, replaces? }`, `nickname_dropped { id }` for an active one that no longer holds and has no successor after 7 days — it then simply leaves); `introduceNickname(draft, ctx, unitId): EngineEvent[]`; action `reputation/introduce { unitId }` (needs a pending nickname and `unitId` as the only participant of the open scene) → `nickname_given { id, name, unitId, replaced? }`; `impunityOf` adds the active nicknames' `impunityBase` to `terms.base`.

- [ ] **Step 1: Write the failing tests** — **acceptance 7 (engine half)**

deeds, one per site: `a done compel, suppress and approved terminate count`, `a failed burst does not`; `a grunt killed in combat counts grunts_lost, a named unit does not`; `a commander protected/major counts once per unit it lands on, a moderate one does not`; `kept_promise and broke_promise of the commander count`; `a settled defiance counts defiance_tolerated, a cancelled one does not`; `a brig counts punish_4 and its undo takes it back`; `grant, refuse, a kept and a lapsed threat count`.
patterns: `leash_holder holds at four Leash uses` (3 → no); `merchant needs the share` (4 granted, 2 refused → 0.67 → no; 4 and 1 → yes); `a met pattern queues one pending nickname at day end` and `never a second while one is pending`; `no pending while its group has an active nickname that scores at least as high`; `a third group waits while two are active and both still hold`; `it replaces an active nickname that no longer holds`;
introduce: `the pending nickname becomes active with its name copied` (`commander.reputation.active[0]` = `{ id, name, sinceDay, by }`), `a public fact names it`, `each named unit reacts once by her values` (draft row of `leash_holder`: `{ axis: 'autonomy', sign: '+', weight: -2 }`; a unit with autonomy +2 loses 4 Trust and 6 Affinity through `applyRelationDelta`, a unit with autonomy 0 or below is untouched; a second introduce of the same id never reacts again), `refused in a group scene, with no scene, or with nothing pending`; `an active nickname moves every unit's impunity base` (`leash_holder` → 30 on a guarded world).

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` → PASS.

- [ ] **Step 5: Commit** `feat(engine): commander deeds, reputation patterns and the nickname moment`

---

### Task 17: Nicknames in scenes, the context line and the CMDR card

**Files:**
- Modify: `src/engine/commander/profile.ts`, `src/discipline/{controller,directives}.ts`, `src/ui/commander/cmdrCard.ts`, `src/analysis/providers/discipline.ts`, `src/analysis/effects.ts`, `src/app.ts`, `content/core/glossary.json`
- Test: extend `tests/engine/commander/profile.test.ts`, `tests/scene/context.test.ts`, `tests/discipline/controller.test.ts`, `tests/ui/cmdrCard.test.ts`, `tests/analysis/commanderReading.test.ts`, `tests/content/pronouns.test.ts`

**Interfaces:**
- Produces: `commanderLine(state)` appends ` Known in the squad as "{name}".` (two: `"{a}" and "{b}"`); `nicknameDirective(unitName, nickname): Directive` (id `nickname`, `next_reply`): `{Unit} calls the commander "{name}" for the first time.`; `DisciplineController.onSceneOpened()` dispatches `reputation/introduce` when a nickname is pending and the scene is private, then sets the directive; the entry's own `effects.directive` (when present) is set as `reputation:<id>` for scenes while the nickname is active; CMDR card line `REPUTATION — ` + one `alius-chip` per active nickname (`reputations:<id>`) or `NONE ON FILE`; `summarizeReputation(entry): string[]` (words only: `Units expect to get away with more` / `less`, `Units who value {axis} think better / worse of the commander`); a `reputations` provider: `Held since day {n}` and, with raw values, the counters of its pattern through `k.raw`; glossary `reputation`, `nickname`.

- [ ] **Step 1: Write the failing tests** — **acceptance 7**

`the next private scene introduces the pending nickname through a directive` (exact text with her name and the nickname; gone after her reply); `a group scene introduces nothing and the nickname stays pending`; `the commander line carries the active nickname and still has no digit and no pronoun`; `the context block of a scene shows it`; `the CMDR card shows the chip with a resolving address, and NONE ON FILE without one`; `the reading shows no counter without raw values` (hidden test stays green with `threats_empty: 53`).

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` → PASS.

- [ ] **Step 5: Commit** `feat(discipline): nickname moment, context line and CMDR reputation`

---

### Task 18: Documentation, manual checklist, final check

**Files:**
- Create: `docs/MANUAL_TEST_P9.md`
- Modify: `docs/packages/P9-impunity-discipline.md`, `docs/00-overview.md`, `docs/CONTENT.md`, `docs/packages/{P9b-power-structure,P9c-personal-pressure,P9d-desire-bonds,P12-special-traits,P13-leashswap-mode}.md`, `CLAUDE.md`, `docs/BALANCE_REPORT.md` (only if `npm run sim` numbers moved)

- [ ] **Step 1: Spec.** Status line `implemented` + the plan path; **Implemented as** (the rulings section of this plan as built, every deviation found while implementing, a **Non-obvious things to know** list: `stanceOf` is P8's and `commandStance` is P9's; punishments are `commander_enforced` events whose row comes from the registry; a held defiance moves `R` only when it settles; a fearful refusal leaves no trace in `scene.refusals`; UNDO reverts deltas and never restores a snapshot; mutiny fixtures need `impunityRecord`; `demand/roll` is its own action; `commanderLine` reads the nickname name mirrored in the state) and **Open items** (combat refusals are not `defied`; gear fault is a supply loss, not a combat status; "shielded from oversight" has no producer; every number, nickname and demand text is a draft marked `AUTHOR TO WRITE`; grunts are outside discipline).
- [ ] **Step 2: Overview.** §9 status table (P9 implemented); §5.4 a P9 block (`impunityOf`, `leverageOf`, `commandStance`, `enforce`, `holdDefiance`, `restrictionReason`, `applyPunishment`, `discipline/punish`, `discipline/undo`, `demand/roll|deliver|answer`, `reputation/introduce`, `countDeed`, `measureList`, `app.discipline`, the new events); §5.2 note that `intent_extract` reports four more types and `flavor` has the kind `demand`; §6 the state fields; §8 `demandWording`.
- [ ] **Step 3: `CONTENT.md`.** How to add a punishment, a demand template, a reputation and how to mark a flag as leverage; the three effect vocabularies.
- [ ] **Step 4: Dependents.** Add **Interfaces already provided by P9** to P9b, P9c, P9d, P12 and P13 (what each can call: Impunity and its bands, stance, the `leverage` flag field for P12's `S`, `enforce` / `applyPunishment` for votes and the warden, `openDemand` and the refuse path for bookings, `countDeed` for new counters, `restrictionReason` for confinement). Add the P9 reading line to `CLAUDE.md` in the style of the P8 line.
- [ ] **Step 5: `MANUAL_TEST_P9.md`.** One line per acceptance criterion 1–8 with the exact clicks in SillyTavern and the expected observation (e.g. criterion 5: "In a scene write a clear threat of the brig; the chip `THREAT REGISTERED — Brig (…) · …` appears; do nothing for two day ends; a toast says the threat lapsed and SQUAD shows her Impunity band unchanged or higher"), plus: UNDO then check LOG and the unit card, a DM threat, a fearful order followed by the anonymous fact, a demand by DM with `[TALK]`, the first nickname in a private scene, an old P8 save.
- [ ] **Step 6: Final run.** `npm test` (exit code 0), `npm run typecheck`, `npm run build`, `npm run sim` (compare with `BALANCE_REPORT.md`; P9 touches no combat number, so the report must not move).
- [ ] **Step 7: Run the manual checklist in a real SillyTavern**, tick every line, note the ST version.
- [ ] **Step 8: Commit** `docs: P9 implemented-as, overview, content guide and manual checklist` (with the rebuilt `dist/` and `style.css`) — **end of chunk (c)**

---

## Self-review notes (for the plan author; executors may ignore)

- Spec coverage: §1 Impunity (T1–T2, nickname base in T16), §2 intents and `R` deltas (T3), pending threats (T4), §3 stances, refusal form, mutiny and desertion, sabotage (T5–T6), §4 registry (T8), menu (T9, T12), dialogue, chips, UNDO (T10–T12), §5 demands (T13–T15), delegate stub (T14), §6 counters, registry, nickname moment, dossier, context line (T16–T17). Acceptance 1 → T2/T4, 2 → T4, 3 → T5/T6, 4 → T9/T10/T12, 5 → T4/T12, 6 → T13, 7 → T16/T17, 8 → T2/T9. P7a notes: provider and hidden sentinels (T7), `description`s and `data-analyze` (T7, T12, T15, T17). P7 notes: `offImage` (T1), reputation slot (T17), delegate (T14); `intimidationBonus` is not reused (nothing in P9 rolls against Authority). P8 notes: `impunityBase` (T1–T2), punishment scaling through `lossMult` (T9), big gesture (T13), engine events at confidence 1, directive prefixes.
- Deliberate departures from the draft: punishments run through `computeDeltas` instead of applying raw registry numbers (image consistency and disposition would otherwise need a second copy of the chain); held defiance instead of an immediate `R` gain; `refuseDeltas × 1.5` as the reading of "bigger at high Impunity"; a deterministic `defied` after a refused demand at high Impunity instead of "may"; nickname moments only in private scenes; the four user rulings.
- Not unit-tested by design: `RealStAdapter`, layout of `css/70-discipline.css`, real `intent_extract` recall for the four types and real `flavor` wording (all in `MANUAL_TEST_P9.md`).
- Draft numbers the author owns: the `eventDeltas` rows of T1, the ladder, the stance `demandWeight`s, sabotage chance and losses, demand chance and template numbers, reputation thresholds and effects.
