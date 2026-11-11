# P6 — Dilemmas, Disloyalty & the Leash

**Depends on:** P0–P5.

**Status:** implemented (plan: `plans/2026-11-11-p6-dilemmas-disloyalty-leash.md`). Automated tests pass; the in-SillyTavern checklist `MANUAL_TEST_P6.md` still has to be run by hand. Where an earlier draft of this spec said something else, the code won; the differences are listed under **Implemented as** at the end.

**Read:** overview (principles P2, P3, P6); `content/lore.md` §2, §5; `content/defects.md` (arcs).

## Goal

Choices that cost something, enforced by the engine; soldiers who can refuse, desert or attack; and the Leash as the central coercion-versus-trust mechanic. Also: defect arcs as personal dilemmas.

## 1. Dilemmas

### Templates (registry `dilemmaTemplates`)
`{ id, scale: 'minor'|'major'|'defining', contexts (expedition_event|base|mission_outcome|defect_arc|director), requiredRefs (units/factions/regions), optionCount 2–4, constraints }`.

### Generation (`dilemma_generate`, mechanic)
Input: template, context digest, present units with values/triggers, relevant flags. Output:
```
{
  title, setup (≤120 words),
  options: [{
    label (≤12 words),
    effects: [{ kind: 'resource'|'unit_event'|'faction'|'clock'|'flag'|'stress'|'social_check',
                target, direction: -1|1, magnitude: 'small'|'medium'|'large', note }],
    requires?: { socialStat, rank }      // e.g. Empathy 3 unlocks a third way
  }]
}
```
Magnitudes map to numbers via engine tables. `unit_event` effects become P3 intents (`decision_aligned/violated` with value axes), so the same option moves different units differently.

### Validator (engine) — a dilemma is rejected and regenerated (max 1 retry, then a safe authored fallback) unless:
1. Every option has ≥1 positive and ≥1 negative effect, on **different** targets or axes.
2. At least one option negatively affects a squad member (via values) — for `major`/`defining`.
3. No option dominates another (option A is not ≥ B on every effect dimension after scoring with a simple utility over resources/factions/unit sums).
4. Magnitudes match scale (`minor` ≤ medium; `defining` must contain ≥1 large).
5. `defining` dilemmas: cooldown (default ≥ 7 days) and max 1 per spine beat.
6. Every `flag` effect references a declared flag from the `flags` registry, or a dynamic flag in the namespace of the thread this dilemma belongs to (overview §6.1). Templates list which declared flags they may set (`allowedFlags`); the model picks among them.

Presentation: modal or in-scene chips; free text is not accepted for dilemma resolution (engine must validate). After choosing, the main model narrates the immediate aftermath with the chosen option as a directive; a scene with affected units is suggested.

### Defect arcs as dilemmas
When a unit's arc unlocks (state + medbay level + story flag), she raises it in a scene; the decision (Cure / Manage / Embrace) is a `defect_arc` dilemma. Her values decide which path she *wants* (`m` from P3 alignment); forcing another path is `decision_violated` (and may need the Leash). Arc steps then become small missions/activities.

## 2. Disloyalty (uses P3 loyalty bands)

| Band | Effects |
|---|---|
| `steady` | Normal. |
| `wavering` | Scene directive: open doubt; CP orders targeting her: 15% refusal; out-of-combat orders may be refused via directive (engine roll per "order" intent). Warning signs: DMs, facts, a "we need to talk" scene request. |
| `breaking` | Refusal 35%; desertion check each day end. |

**Desertion:** day-end check in `breaking` (probability from Trust, Affinity, stress, defects). Fires as a **night event** or mission-start event: `[TALK HER DOWN]` (social check Authority or Empathy vs difficulty; success → Trust +, band re-evaluated), `[LET HER GO]` (unit leaves: status `deserted`, may reappear via director as hostile or ally later), `[SUPPRESS]` (Leash). Always telegraphed ≥ 1 day before by at least one sign.

**Attack (mutiny):** only from `despises` (or `obsessed` + extreme trigger) and a trigger event (e.g. a Leash use, a betrayal discovered, a forced defect cure). Plays as a **Mutiny encounter**: combat where she (and sympathizers with low Trust/high Affinity to her) fight the remaining squad with the commander exposed. Outcomes: subdued (stays, `resentful`, can be Terminated), escapes (deserted, hostile), or commander injured. Telegraphed by escalating signs; never fires within 2 days of entering `despises`.

**Refusal mid-scene** is a hard directive (overview P3): the model must narrate refusal; free text persuasion can change intents but the engine re-checks only at the next exchange.

## 3. The Leash

State: `leash.authorizationsLeft` per week (base by corporation/start; crime modifiers; oversight standing; failed command missions −1), `log[]`.

| Action | Use | Cost |
|---|---|---|
| **Compel** | Force one order (in scene: next reply complies; in combat: cancels a refusal; arc decision: forces path) | 1 auth; target `coerced/extreme`: Trust −15, Affinity −10, stress +15; witnesses `coerced/moderate` scaled by their values (autonomy+ hate it, obedience-leaning may approve); sets `leashed` flag; 2+ uses → `resentful` check |
| **Suppress** | Stop a desertion or attack in progress | 1 auth; target Trust −25, `resentful` likely; squad-wide stress + |
| **Terminate** | Permanent deactivation (unit removed, status `terminated`) | Requires cause (attack, repeated desertion) and oversight approval roll; squad-wide `decision_violated` with `mercy/ingroup` axes; massive event; chronicle entry |

Modifiers: `imprint_fracture` (Compel costs ×2 and may fail), `compliance_craving` (Compel costs halved — the trap is intentional), `mutiny` crime (+Trust cost). UI: Leash requests are filed through the PDA as a bureaucratic form (`OVERSIGHT REQUEST #…`) with a short delay animation — the act should feel cold.

## 4. Context contribution

Directives for refusals, desertion intent, post-Leash trauma ("she remembers being forced; she will not pretend otherwise").

## Acceptance criteria
1. Generated dilemmas violating any validator rule never reach the player; fallback works with no mechanic profile.
2. The same dilemma option raises one unit and lowers another according to values.
3. Refusals happen at specified rates in combat (seeded test) and as directives in scenes.
4. Desertion is always telegraphed; all three responses work; deserted units can return via director.
5. Mutiny encounter triggers only under the specified conditions and resolves to each outcome.
6. Leash actions apply exact costs, consume authorizations, refresh weekly, and are logged; Terminate removes the unit permanently.
7. Defect arc decision flows end-to-end for at least 3 defects.
8. Tests: validator (each rule with crafted fixtures), dominance check, loyalty band effects, desertion probability, Leash cost modifiers.

## Interfaces already provided by P2 (implemented — use, do not rebuild)

- **Day-end desertion check:** `registerDayEndStep('director_tick' | 'dm_rumors' | …, fn)`; P6 may add a night event by pushing onto `calendar.nightEventsQueue` (see P3's section). Choose the hook that fits the order you need (upkeep and ticks have already run when hooks run).
- **Header:** the PDA header already renders `LEASH n` from `state.leash.authorizationsLeft`; keep that field the single source.
- **Social checks:** `meetsSocialRequirements(state, { authority: 3 })` for `[TALK HER DOWN]` and similar.
- **Shortage trust penalty:** P2 applies −5 Trust to every living unit on every 3rd consecutive shortage day (event `trust_penalty_event`); it does not recompute `loyaltyBand` — recompute in P6 where the band hysteresis lives.
- **Medbay and defect arcs:** the `medbay` activity stamps `upkeepDay` on a unit's defects whose `arc === 'manage'`; the medbay `arcStageCap` effect (`facilityEffect(state, reg, 'medbay', 'arcStageCap')`) gates arc stages.
- **Leash crime effects** (`leash_weekly`, `leash_trust_cost`, …) are declared in the crimes content but not interpreted by anything yet.

## Interfaces already provided by P3 (implemented — use, do not rebuild)

- **Loyalty:** `loyaltyBand(state, unitId)` (`steady` / `wavering` / `breaking`, hysteresis on Trust, recomputed after every relationship change and once per day) and `getRelation(state, unitId)`.
- **Leash log shape:** the `resentful` state counts `leash.log` entries with **`unitId === <the unit>`** (`leashUsesMin: 1` and Trust < 30). Log every Leash use as `{ unitId, kind: 'compel' | 'suppress' | 'terminate', day, … }`; without `unitId` the state never triggers.
- **Directives:** `app.context.setDirective({ id, text, expiresAfter: 'next_reply' | 'scene' | 'manual' })`; P3 already sets `proposal:<unitId>` (next reply), `night` (scene), `explicit` and `romance_off` (scene). Refusals, desertion intent and post-Leash trauma are yours to set the same way.
- **Events and consequences:** apply them as intents (`coerced`, `sided_against`, `decision_violated`, … through `intents/apply`) or, outside a scene, with `applyEventToUnit` (`engine/relations/effects`); both run the full modifier chain (value alignment, tags, state and defect modifiers, diminishing returns).
- **Night entries:** `enqueueNight` (see the P5 note) for desertion attempts and night confrontations; `night/ignore` applies `entry.ignore` as an event from the commander's side.
- **States P6 reads:** `despises` (attack outcomes), `resentful`, `obsessed`, `dependent`, `unrequited`; their entry/exit conditions are data in `relationshipStates.json`.
- **Defect arcs:** states list `unlocks.defectArcStages` (`manage`, `cure`, `embrace`); the arc itself is yours.
- **Marks:** `Relation.marks[]` is still reserved and empty; P3 does not read it.

## Interfaces already provided by P4 (implemented — use, do not rebuild)

- **Order refusals:** `order_refusal` passives (defects such as `imprint_fracture`, `rage_governor`, `possessive_protocol`; the friction synergies `order_friction_minor` / `order_friction` / `order_friction_major` on `resentful` / `estranged` / `despises`) are rolled in `issueOrder` (`engine/combat/orders`); a refusal keeps the CP spent, adds stress and emits `order_refused { orderId, cid, unitId }`. `wavering` units should get a friction synergy in the same way (a synergy entry in `synergies.json` plus the id in the state's `unlocks.synergies`).
- **Compel** cancelling a refusal belongs in `issueOrder` before the refusal roll; `combat.ordersThisRound` and `combat.lastOrder` record what was ordered this round.
- **Stress and breakdown:** `Unit.stress`, `Unit.breakdown`; the daily relationship pass already marks stress ≥ 80 (`stress_high`).
- **Injury and death:** `lastCombat.injuries` / `deaths`; named units are never killed by combat, only by the Leash (`terminated`).
- **Commander Crisis** hooks: `lastCombat.commanderInjured`, `commander_injured` event (P3 answers it).

## Interfaces already provided by P5 (implemented — use, do not rebuild)

- **Consequences:** `applyWorldEffects(draft, ctx, effects, { kind, id, label? })` (`engine/world`) runs the data-driven vocabulary `resource`, `carried_supplies`, `faction`, `clock`, `flag`, `clearance`, `party_stress`, `party_hp`, `loot`, `leash`, `thread`, `unit_event`, `incoming_unit`, `fact`, `offer_mission`. Map your dilemma-option effects onto these (add a **generic** type when none fits). `isCostEffect(effect)` (`content/schemas`) says what counts as a cost: a negative resource/faction/HP/Leash amount, positive stress or clock, or a hostile `unit_event`.
- **`dilemmaTemplates`:** the schema is passthrough, so P6 adds generation fields freely. Existing fields: `scale` (`minor|major|defining`), `contexts[]` (P5 uses `expedition_event`), `regions?`, `flavor?` and the authored `fixed { title, setup, options[{ label, requires?: { stat, rank }, effects: WorldEffect[] }] }` block; every non-flavor option needs at least one cost effect. `eventOptions(state, reg)` greys options with the reason; `chooseOption` applies one.
- **Pinned story choices:** `evt_vesper_choice` and `evt_kestrel_choice` (the beat-4 events of the two starts, referenced by `missionTemplates[].objectiveEventId`) set exactly one of three mutually exclusive declared flags. P6 may replace them with defining dilemmas; the spine beat 5 (`completion: { kind: 'flag', anyOf }`) reads those flags.
- **Clocks and factions:** `advanceClock(draft, ctx, clockId, by, reason)`, `factionStanding(state, id)`, the `clocks` registry (`onFill` is a list of world effects; `repeat: true` resets after filling). The `oversight` clock fills into `leash −1`.
- **Failed command missions:** `missionTemplates[].failureEffects` already contains `leash −1` (and `clock oversight +1`); they run once when the deadline passes (`mission_failed`). Add refusal or desertion consequences as further effects, not as code.
- **Squad in the field:** `ableParty(state)` (living, `active`, not injured), `state.expedition.party`, `expedition.hints` (queued relation events applied on return through `applyIntents`), `expedition/treat`; breakdowns released on return give the unit an `after_breakdown` night entry (`enqueueNight`).
- **World reading:** `buildDigest(state, reg)` is the compact, number-free picture of the world the director sees; `currentBeat`, `isOpenEnded`, `missionById`, `offerMission`. The director may add **dynamic flags** only as `thread:<threadId>:<slug>` stored in `thread.flags` (with a description); authored content may depend only on declared flags.
- **Dispatch guard:** while `state.expedition` is open, only `expedition/`, `combat/`, `director/` and `debug/` actions run. A P6 action meant to work during a run must use one of those prefixes.
- **Leash events:** a `leash` world effect (also from the `oversight` clock) emits `leash_changed { amount, left }` and the app toasts it; log Leash *uses* yourself (`leash.log`, see the P3 note).
- **Intake:** `squad/add_named` / `squad/decline_incoming` with `world.incomingUnits` (a world effect `incoming_unit`).

## Implemented as

### Architecture
- **Pure rules** in `src/engine/leash/` (`weekly`, `use`), `src/engine/loyalty/` (`state`, `refusal`, `desertion`, `mutiny`), `src/engine/dilemma/` (`types`, `effects`, `validate`, `flow`) and `src/engine/arcs.ts`; actions in `src/engine/actions/{leash,loyalty,dilemma,arc}.ts` plus `scene/order` and `combat/compel`. The non-engine layer is `src/loyalty/` (`dilemmaController`, `loyaltyController`, `directives`, `deps`): it reaches ST only through `StAdapter` types, never imports `src/ui`, and `src/engine` never imports it (architecture test).
- **Dilemmas are two-phase, like P5's director.** `state.dilemmas.open = { id, templateId, scale, context, status: 'requested' | 'presented', attempts, … }`. `dilemma/request` opens it (`dilemma_requested`); the controller makes the `dilemma_generate` call and answers with `dilemma/present`; an invalid first answer emits `dilemma_rejected { retry: true }`, an invalid second presents the template's authored `fixed` block in the same dispatch; `dilemma/fallback` presents it at once. A request still open at the next day end is answered by the fallback. Every generating template carries an authored `fixed` block (loader check). One dilemma at a time; a presented one blocks `activity/`, `calendar/consume_slot`, `scene/start`, `expedition/start` (`dilemma_open`), and `dilemma/` actions run during an expedition.
- **The model never sets amounts.** `dilemma_generate` returns enums (`kind`, `direction`, `magnitude`), ids and short texts; every number comes from `TUNING.dilemma.magnitude` (credits 15/40/100, supplies 3/8/15, plyx 3/8/20, faction 5/10/20, clock 1/1/2, stress 5/10/20, severity minor/moderate/major, check rank 2/3/4). Model text is plain text (markup kept as characters, control/zero-width/bidi characters removed) and is rendered with `textContent`.
- **Option effects are world effects** (`applyWorldEffects`): `resource`, `faction`, `clock`, `flag` map 1:1; `stress` → `party_stress`; `unit_event` → `decision_aligned` with the value axis (the same option raises a unit whose values match and lowers the others); a `flag` in `thread:<threadId>:<slug>` → new generic effect `thread_flag` (stored in the thread, ≤ 12 flags); `social_check` is the option's `check { stat, rank }` (a seeded roll at choice time, `clamp(0.5 + 0.2·(rank − check rank), 0.1, 0.95)`; on failure the gains are dropped, the costs **and the recorded flags** stay). `unit_event` outside an expedition applies at once through `applyEventToUnit` to `EffectSource.units` (default: the active roster).
- **Validator** (`validate.ts`): rule 1 (a gain and a loss on different keys), 2 (`major`/`defining`: some option goes against a present unit's values), 3 (dominance over five dimensions: resources 1/3/5 per credit/supply/plyx, factions 2, clocks −15, stress −1, units Σ alignment × 2/5/10; an option with `requires`/`check` is never the dominator), 4 (magnitudes vs scale), 5 (`defining`: ≥ 7 days and one per spine beat, checked at request time), 6 (flags: declared, in `allowedFlags`, or the own thread's namespace; `flagPerOption`). `parseDilemmaOutput` never throws.
- **Where dilemmas come from:** day-end pacing (every `TUNING.dilemma.everyDays = 4` days, a seeded pick of an eligible `base`/`director` template; `mission_outcome` only on a day a mission ended; `defining` never), a pinned expedition objective event with a `generate` block (the two beat-4 choices are now `defining`; the app requests it from the `expedition_event` event and the expedition screen shows it; with the setting off the fixed options stay), and defect arcs, which use no model. The director model does not raise dilemmas.
- **The Leash.** `leash: { authorizationsLeft, refreshDay, log[], seq?, seeded? }`; weekly = corporation `leash.weekly` + crime `leash_weekly` + 1 at own standing ≥ 30 / −1 at ≤ −30, clamped 0…5, refilled every 7 days at the end of the day in the `mission_deadlines` step after P5's own (so a `leash −1` on the refresh day belongs to the old week); older saves are seeded once (`leash/seed` on load, or the first day end). **Compel** (1 authorization, Trust −15, Affinity −10, stress +15; `imprint_fracture` ×2 on Trust/Affinity and fails 25 %, `compliance_craving` ×0.5, crime `leash_trust_cost.amount` added; witnesses `coerced/moderate` with scale `clamp(0.5 + 0.25·autonomy − 0.25·corporate, −0.5, 1.5)`), **Suppress** (1 authorization, Trust −25, stress +10, squad stress +5, pauses desertion checks 3 days), **Terminate** (cause = a subdued attack or 2 desertion attempts; approval `clamp(approval + 0.005·standing, 0.1, 0.95)`; denied costs nothing, is logged and not re-filed the same day; approved: `terminated`, squad-wide `decision_violated/extreme` on mercy/ingroup, a public fact). Every use is logged `{ no, unitId, kind, day, context, outcome }` (60 entries). `removeFromService` cleans roster, equipment (items stay), night queue, proposals, pending talk, breakdown; it refuses while a scene, fight or expedition with her is open.
- **Refusals.** Loyalty bands add `loyalty_wavering` (15 %) / `loyalty_breaking` (35 %) synergies through `getSynergies`; `issueOrder` already takes the highest `order_refusal`. Out-of-combat orders are a fixed scene control (`scene/order`), not an intent: the refusal is stored in `scene.refusals` and answered with `leash/compel`. In combat `issueOrder` records `cs.lastRefusal`; `combat/compel` runs that order for free (no second roll), adds the stress at once and pledges her in `cs.compels`; **authorizations, Trust, Affinity and the log are settled by `finalizeCombat`**, so an easy retry never charges twice.
- **Desertion.** Day step for `breaking` units: the first breaking day only leaves a sign; from the next day `desertionChance` (`0.15 + 0.02·max(0, 10 − Trust) ± 0.002·|Affinity| + 0.004·max(0, stress − 50) + defect `desertionMod`, clamped 0.03…0.6) is rolled once per day while nothing is open; an attempt is a night entry `desertion` (priority 95) or, in a party at `expedition/start`, a mission-start confrontation (the run does not start). Answers: `[TALK HER DOWN]` (one seeded Authority/Empathy check, difficulty rank `2 + (Trust < 5) + (stress ≥ 80)`, success Trust +8 and a 3-day pause), `[LET HER GO]` (status `deserted`, stance `ally` when Affinity ≥ −30), `[SUPPRESS]`. An unanswered confrontation resolves as `[LET HER GO]`. Deserters return by an engine rule after 5 days (15 % per day, once): an ally asks to be taken back (night entry, needs a free bed, Trust 15, reserve), a hostile one posts a rumor, raises the `oversight` clock and a public fact.
- **Signs are data** (`loyaltySigns`): `dm` (a message from her, named units only), `fact` (public), `talk` (a "we need to talk" knock); grunts always get `fact`. A wavering named unit gets a `doubt` sign every 3 days.
- **Mutiny.** Only from `despises` (≥ 2 days in it) or `obsessed` with an extreme trigger, a trigger in the last 3 days (a Leash use, a forced Cure, or a `lied_detected` / `broke_promise` / `coerced` / `decision_violated` / `crime_revealed` at `major`+), two signs on different days, 50 % per day. Plays as an ordinary P4 combat whose enemy side is built from squad units (`Encounter.mutineers`; she and ≤ 2 low-Trust sympathizers vs the loyal units, commander exposed); `loyalty/fight` stores `open.combatId`, `loyalty/resolve_mutiny` consumes the result exactly once: won → everyone who rose is injured 2 days at 1 HP, she is `resentful` and may be terminated; lost or retreated → she and the sympathizers escape (`deserted`, hostile) and the commander is injured; with no loyal unit only `[SUPPRESS]` and `[YIELD]` exist.
- **Defect arcs** (`arcs.ts`): a path is available when her state lists it (a state that lists `cure`/`embrace` also offers `manage`), the medbay `arcStageCap` (+1 with the crime perk `defect_arc_early`) reaches its stage (manage 1, embrace 2, cure 3), `day ≥ 5`, the defect's optional `arcFlag` is set, and the defect is not lite. She wants the path with the best alignment of her values; a non-wanted path with negative alignment is refused unless Compelled (`arc/decide { compel }`, context `arc`; a forced Cure is `extreme` and a mutiny trigger). Steps are `medbay` activities with her as companion, one per day. Manage halves the downside while the upkeep is ≤ 5 days old, Embrace multiplies upside and downside by 1.5, Cure removes the defect (a public fact). The unlock is raised once per unit as a night entry `arc_talk`.
- **Directives** (`src/loyalty/directives.ts`, exact texts): refusal (scene), compelled (next reply, replaces the refusal), failed burst (scene), post-Leash trauma (a `leashed` flag and a log entry ≤ 7 days old), band (wavering/breaking), decision aftermath (`next_reply`, or `scene` when a scene is open). Closing a scene or switching chats clears them.
- **Setting:** `dilemmasEnabled` (default on; SYS › Decisions). Off: the template's authored block is shown and the model is not asked.
- **UI:** `OVERSIGHT REQUEST #nnnn` form with a short "review" animation (`fileLeashRequest`), SQUAD loyalty line, `[ LEASH ]` menu (TERMINATE only with cause) and arc paths, LOG › OVERSIGHT LOG, a dilemma panel (modal at the base, in the expedition screen during a run; no free text), a confrontation panel (replaces the night knock, or a modal at mission start), the `[ORDER]` toggle with a `REFUSED` marker and `[ COMPEL ]` chip in scenes, `[C] COMPEL` and `LEASH n` in combat. `ShellApi.closeModal()` and `modal.actions[].disabled` are new.
- **Saves:** campaign state stays `version: 1`; every P6 field (`leash.seq/seeded`, `disloyalty`, `dilemmas`, `DefectInstance.arcSteps`, `SceneRecord.refusals`, `LoyaltyRecord.nextDoubtDay`) is optional; an old save is seeded by `leash/seed`.

### Differences from the draft above
- Orders outside combat are a scene control, not an extracted intent; Compel in combat is settled at the end of the fight; Leash costs are exact numbers, not rows of `eventDeltas`; dilemma sources are pacing, pinned expedition events and arcs.
- The draft's `requiredRefs` (units/factions/regions) gained `clocks`; the draft's `constraints` is `{ flagPerOption }`.
- Terminate's approval needs the cause *and* a roll; Suppress is offered at the confrontation, not inside a running fight.

### Decisions taken while implementing (rulings)
- **Wavering starts quietly.** Units created by the wizard start at Trust ~20, which P3 bands as `wavering`: they refuse 15 % of orders from day one (spec-conform) but get their first `doubt` sign only one interval (3 days) after they start wavering (`LoyaltyRecord.nextDoubtDay`); otherwise every unit would knock on day 1.
- **Desertion signs** are dropped when she is no longer `breaking`, so every breaking spell starts with a fresh sign. A mutiny is rolled only when the newest mutiny sign is at least a day old; mutiny signs and the trigger are cleared when she stops being a candidate or the mutiny is resolved.
- **Expiry rules** (the spec is silent): night confrontations expire when their entry is gone from `nightEvent` and the queue, mission-start ones when the day changes; `return` expires as turn-away; an unanswered mutiny is resolved by the engine (a finished fight from `lastCombat`, otherwise the commander yields).
- **Events:** the day step emits `deserter_returned { unitId, stance }` (sets `returned`), answers emit `deserter_answered { unitId, stance, taken }`; `leash_seeded`, `leash_refreshed`, `leash_used`, `scene_order`, `scene_compelled`, `combat_compelled`, `loyalty_sign`, `desertion_attempt`, `loyalty_talk_down`, `unit_deserted`, `unit_terminated`, `mutiny_started|subdued|escaped`, `dilemma_requested|rejected|presented|resolved`, `arc_unlocked|decided|step|completed`, `thread_flag_set` are reserved.
- **`costMult` / `failChance`** of a defect apply to Compel only; a grunt pays no Affinity; the combat Compel stress goes through P4's `addStress` (so `stress_taken` passives reduce it); a failed burst in combat is logged `done` at settlement (it was played out when pledged), a fallen grunt still costs the authorization.
- **A failed social check keeps flags** (`flag`, `thread_flag`): dropping the beat-4 flag would leave spine beat 5 unreachable.
- **Fixed blocks of the two beat-4 events** were reworked so each option has a gain and a loss on different things (rules 1 and 3) and carries a value-axis `unit_event`; "Sell it to Aurum" and "Spare the survivors" cost faction −20 (large).
- **Resentful after a won mutiny** is entered directly; her Trust/Affinity are untouched, so the next automatic evaluation can move her back to `despises` (priority 90 > 80) while `cause = attack` keeps Terminate available.
- **Combat Compel has no oversight form** (speed in a fight); a scene Compel, Suppress, Terminate and a forced arc decision are filed through the form.
- **Dilemma modal:** a blocked action (`dilemma_open`) or a reload brings the waiting decision back; after a decision that moved named units a "Talk it over?" modal offers a free mess-hall scene.
- **Process note:** the Task 9 engine code was written before its tests; the tests were then written and checked by mutation.

### Open items for later sessions
- Balance: 15 % refusals for every low-Trust unit from day one, the pacing interval (4 days) and the magnitude tables are draft numbers.
- Sign, desertion and mutiny framing strings and the form texts are authored in code; move them to JSON when the author rewrites the content.
- `leash/compel` can only be filed in a scene; a PDA-filed Compel (`context: 'pda'`) has no use yet.
- The real `dilemma_generate` quality (rejection rate, retries) can only be judged in SillyTavern: see `MANUAL_TEST_P6.md`.
