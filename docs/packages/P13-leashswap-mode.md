# P13 — LEASHSWAP Mode (Inverted Command)

**Status: implemented** (plan: `docs/plans/2026-11-18-p13-leashswap-mode.md`; see **Implemented as** at the end; where it differs from the draft, the code wins. The spec calls the commander "he / him / his"; nothing the package writes may, lore §0.)

**Depends on:** P7, P9 (punishments, Impunity), P9b (hierarchy: the warden sits above it), P9d (lead, bond profile, content categories), P12 (special-trait plumbing, suspicion clocks), P6 (Leash, dilemmas, mutiny), P5 (oversight, director), P0 (snapshots). **Read:** overview; this file; P6; P9.

## Premise

The commander's crime was too grave. He was spared execution only by agreeing to carry the same control implant as his soldiers. One unit of the squad — the **warden** (`warden`; in-game "inverted commander") — holds his leash. The default chain of authority is:

**corporation (oversight) > warden > commander (player) > squad**

This is how power is *supposed* to flow, not a hard rule. Anyone in the chain can try to defy the one above: the commander defies the warden (§4), the warden can bend or ignore oversight's directives while oversight isn't looking, and the two of them can collude against the corporation. No dedicated mechanics for this: it emerges from what already exists — her values and relationship with the commander shape her directives, collusion is ordinary intrigue with the same discovery rolls, and oversight noticing is the director's and the investigation clock's business. The engine must not *enforce* the chain anywhere beyond the specific rules below (e.g. her co-sign on squad Leash requests is the default; she can choose to rubber-stamp or to look away).

The warden cannot simply release him: the controller belongs to the corporation, so an official release is not in her power. What she does with it — use it, hold back, or cover for him — is.

## 1. Mode setup

Campaign mode `leashswap` (chosen at setup, before the commander file; incompatible with nothing). Warden selection, player's choice:
- **Player picks** a named unit — the player sets the dynamic he wants.
- **Corporate assignment** — oversight picks the unit most loyal to the corporation (highest `values.corporate`, tie → lowest `autonomy`, tie → lowest Impunity). Revealed during intake (P11) or right after setup.

Permadeath of the commander is **on** in this mode. On death, by difficulty: `rewind_day` (restore the start-of-day snapshot; the rewind is not recorded in memory, like easy retry) or `campaign_end` (epilogue from the chronicle, campaign closed read-only).

## 2. Warden data

```
warden {
  unitId, assignedBy: 'player'|'corporation'
  expectations: [{ id, kind, weight, source: 'card'|'values'|'corporate', known: boolean }]
  satisfaction: 0..100        // her verdict on the commander's compliance
  defiance: 0..100            // accumulated open disobedience (decays slowly)
  warnings: number            // issued before lethal escalation
}
```

Expectations are generated at mode start (mechanic call `warden_agenda`, budget 800) from her card, values and corporate directives: e.g. `protect_squad`, `no_civilian_harm`, `meet_quota`, `obey_oversight`, `keep_me_close`, `no_romance_with_others`, `personal:<short text>`. 3–5 items, weights sum to 1. The player sees only `known` ones; others are learned through conversation, Secret Frequency, or her reactions.

Her normal relationship axes (Trust, Affinity, Attraction, states) remain — the inversion sits on top of them. High Affinity makes her lenient; high satisfaction makes her trusting with orders.

## 3. Her powers

- **Countermand orders.** Combat CP orders and out-of-combat orders (activity assignment, expedition roster, rows) can be countermanded when they conflict with an expectation: chance ∝ conflict weight × (100 − satisfaction)/100. UI chip: `WARDEN OVERRIDE — {her alternative}` with `[COMPLY] [ARGUE] [DEFY]`.
- **Dilemma override.** Before a `major`/`defining` dilemma resolves, she may lock an option or demand another. Same three choices.
- **Punish the commander.** Registry `commanderPunishments`, mirroring P9: `reprimand`, `privilege_revoked` (no free activities / no DMs for a day), `confinement` (lose 1–2 slots), `public_humiliation` (squad Impunity +), `pain_burst` (commander stress +, injury chance by endurance), and the **Leash on the commander**: `compel` (the commander's next choice is forced), `suppress` (commander loses the rest of the day). The commander's Leash authorizations come from oversight via her.
- **Lethal escalation.** Sustained open defiance: `defiance` crosses 50 → warning, 75 → final warning, 100 → she (or oversight through her) terminates him → permadeath rule. Never without two warnings; never within the same day as the first warning.
- Commander's Leash requests on the squad go **through her**: she can co-sign or deny.

## 4. Commander's options

- **Obey** — satisfaction up, defiance decays.
- **Argue / negotiate** — `[ARGUE]` opens a scene; new intent `compromise_reached` (with the agreed alternative) resolves the override without defiance; failed persuasion falls back to her choice or `DEFY`.
- **Defy** — the commander's choice stands, defiance up by conflict weight, satisfaction down, she reacts (punishment roll).
- **Intrigue** — hidden actions: win allies in the squad, gather kompromat on her (facts tagged `kompromat`), prepare the implant hack. Each intrigue action has a discovery roll (shares the clock machinery from P12); discovery → satisfaction crash, defiance +, immediate punishment.

## 5. Getting rid of her

The corporation owns the controller, so she cannot just let him go. Three routes:

1. **Hack the implant** — multi-step project: Workshop ≥ 3, Medbay ≥ 3, plyx, several slots, a tech-capable ally (Specialist/Support or a defect like `sensor_ghosting`). Each step: discovery roll; failure → `pain_burst` + she learns. Success → controller dark.
2. **Hand her to oversight** — requires ≥ N kompromat facts; a `defining` dilemma with oversight; success → she is reassigned (status `reassigned`, may return hostile via director).
3. **Kill her** — death in combat by negligence or by intent, or a turned mutiny. Counts as removal by death.

### Consequences of any removal

- **Investigation** — oversight opens a clock (length by method: hack longest and quietest, death shortest and loudest).
- **Squad reactions** by values: liberator (autonomy+, anti-corporate) vs murderer/traitor (mercy+, corporate+, ingroup if she was close to them).
- **Remote control** — until the investigation closes, oversight runs the commander's controller in a harsh automated mode: fixed expectations (quota, oversight obedience), automatic punishments on metric failures, no negotiation.
- **Verdict** when the clock fills: *cleared* → commander free; the game returns close to the default mode (implant dormant, oversight watchful); *convicted* → execution (permadeath rule) or a new warden is assigned (another unit or an oversight officer NPC).

## 6. UI

PDA → **WARDEN** panel (corporate voice frame with her portrait): known expectations, satisfaction band, defiance meter with warnings, active punishments on the commander. Override chips in scenes and combat. Commander punishments appear as corporate-voice notices. Intrigue projects in a hidden section only the player sees.

## 7. Content and settings

Intimacy settings apply as usual; romance with the warden is allowed and gets dedicated state hints (inverted power dynamic). `no_romance_with_others` expectation interacts with P3 multi-romance rules.

## Acceptance criteria

1. Both selection modes work; corporate assignment follows the specified ordering.
2. Overrides fire by the formula; COMPLY/ARGUE/DEFY each resolve correctly; `compromise_reached` resolves without defiance.
3. All commander punishments apply; the Leash on the commander forces or suppresses as specified; squad Leash requests need her co-sign.
4. Lethal escalation needs two warnings on different days; death follows the difficulty rule (rewind restores the exact day-start snapshot and leaves no memory; campaign end closes the campaign with an epilogue).
5. All three removal routes work, start the investigation, apply squad reactions and remote control; both verdicts resolve.
6. Without the mode, nothing changes.

## Open decisions (author)

- Expectation kinds and weights; commander punishment numbers; defiance thresholds.
- Lore of the controller implant and how intake presents the warden.

## Interfaces already provided by P7a (implemented — use, do not rebuild)

- The WARDEN panel, override buttons (COMPLY / ARGUE / DEFY) and the commander-side Leash carry `data-analyze` with glossary entries; readings for the warden's agenda and state go through `Knowledge` and knowledge rules so the commander never reads what he does not know. Mirrored punishments reuse P9's providers.

## Interfaces already provided by P7 (implemented — use, do not rebuild)

- **Trait and commander file plumbing:** `commanderTraits` / `traitEffects` / `syncTraitSettings` (campaign-level mirrors of trait effects for code with no registry), the quiet night (`isQuietNight`, `calendar/sleep`) and `calendar.loseMorning` for calendar effects on the commander, `terminateChance`, `leash_weekly` and `activityCost` as examples of trait-aware rules.
- **Combat:** `cs.presence` and the commander's HP (`commanderMaxHp`) in Commander Crisis.

## Interfaces already provided by P9 (implemented — use, do not rebuild)

- **Roles swap, rules stay:** Impunity (`impunityOf`), the command stance (`commandStance`), enforcement (`enforce`, `applyPunishment`, `discipline/punish`, `discipline/undo`), restrictions (`restrictionReason`), demands (`openDemand`, `demand/answer`) and deeds/nicknames (`countDeed`, `reputations`) all act on a **named unit and the commander**. A mode in which the player is the leashed one must reuse these readers with the other direction of authority rather than copy the rules.
- **Directives and chips:** `app.discipline` (directives, toasts, chips, UNDO) is the UI path; the directive ids are P9's.
- **The Leash is an enforcement:** every `done` use gives R −20 and keeps a pending threat (`bookUse` in `engine/leash/use.ts`), and counts `leash_*` deeds.

## Interfaces already provided by P11 (implemented — use, do not rebuild)

- **The intake is data and steps:** registry `prologues` (`order` + `steps`, per start by `extends`), `stepsOf`, `registerStepEntry(kind, fn)` for an entry effect, `onboarding/*` actions and the completion enum. A warden reveal is another `scene` or `guided_slot` step (or an entry effect) in the prologue of the LEASHSWAP start, not a new mechanism; wizard steps are `paper_form` and `dossier` kinds and run before deployment.
- **The in-world forms:** `renderColdOpen / renderIntake / renderExam / renderFile` (`src/ui/setup/prologueSteps.ts`, `paper` voice, lines by key and `{PLACEHOLDER}` via `fillLine`), the Veteran toggle and `Wizard.{setMode, stepsFor, prologueStep, jumpTo}`.
- **Prologue scenes:** `app.onboarding` (`startLineup`, `talkFirstWords`, soft caps with `prologue:goal` / `prologue:wrap`), scene origin `prologue` (never takes a slot), `TUNING.scene.maxParticipants` = 4, `Comms.initiate(unitId)` for one initiated DM without the roll.
- **Unlocks and objectives:** registry `uiUnlocks` (`target.tab`, `minDay`, `afterStep`), `lockedTabs`, `ShellApi.setTabLocked`; `objectiveList` / `currentObjective` (sources `prologue`, `spine`, `director`, `unit`) and the director's `objectiveHint`.

## Interfaces already provided by P9d (implemented — use, do not rebuild)

- **Lead:** `decideLead(state, reg, unitId)` / `scene.lead` decide who leads a romantic scene from lead style, Impunity, defects and recent yields; a mirrored mode flips the inputs, not the function.
- **Bond profile and content categories:** `bondOf`, `contentAllowed`, `contentLine` (what every generation is told is excluded); `enabledCategories(state)` is the player's consent and never widens.
- **Defect vocabulary:** `eventStress`, `embraceFlag`, `wantBreakdown`; conditions `orderedThisRound`, `commanderBuildIn`.

## Interfaces already provided by P9b (implemented — use, do not rebuild)

- **Hierarchy:** `leaderOf(state)`, `standingOf(state, reg, unitId)` and `computeHierarchy(draft, reg)` compute among the named living units; the warden of LEASHSWAP is outside that set and is filtered out before the call (a standing tension when the warden is not the leader). `changeLeader` reports a change (`leader_changed`, public facts, endorsement and `co_command` cleared).
- **Scapegoat:** `openScapegoat(draft, ctx, { missionId, unitId, witnessIds })` and the answers `take_blame` / `shift_blame` (read from the option `id` with `scapegoatOptionId`); P13 adds the commander's injury and confinement to TAKE THE BLAME as more effects of that option, and `shielded` is the engine event for covering her.
- **Oversight copy:** `LeashLogEntry.cc` and `outsideActive(state)` (oversight addresses the leader as second-in-command when endorsed).

## Interfaces already provided by P9e (implemented — use, do not rebuild)

- **A second source of the scapegoat case:** `Mission.decidedBy.source` (`'vote'` or `'her_call'`; absent = vote) and `DilemmaState.scapegoatSource` (`'her_call'` only). `openScapegoat(draft, ctx, { missionId, unitId, witnessIds, source? })` takes the source; the template wording comes from `fixed.because`. TAKE THE BLAME's extra effects (injury, confinement) apply to both sources unchanged. `herCallCandidates` reads the party's named active units: if the warden can ever be one of them, filter her out where P13 needs it.
- **ASK ME FIRST:** `PowerState.askFirst` and `askFirstHolds(state, unitId)`: a standing order a mirrored discipline could reuse. `ExpeditionReport.herCalls` lists the run's her-calls.

## Interfaces already provided by P9c (implemented — use, do not rebuild)

- **Obedience:** `obedienceOf(state)`, `commanderObeys(state, unitId)`, `unitObeys(state, unitId)`, `herPick`, `herVote`, `overrideHer`: a day on which the loser of a wager follows the winner's non-combat orders (`personal.obedience`, valid on its own day). LEASHSWAP can read it to know whose choices are pre-selected.
- **Wagers:** `challenge`, `playWager`, `applyStake` and the registries `wagerGames` / `wagerStakes` (content-gated); stakes are read by `effect`, games by `kind`, so a warden's stake is data plus one effect case in `applyStake`.

## Interfaces already provided by P3b (implemented — use, do not rebuild)
- **Tagged facts:** `addFact(draft, { …, tags: ['kompromat'] }, …)` works as for any fact (tags are retrieval keys, normalized). A fact about the warden's moves that only some know uses `knownBy` and, if the squad should hear of it, `spread`; `pinned: true` keeps it out of folds and pruning.
- **Remembered events:** a new warden event that should leave a fact is a `memoryRules` entry for its event type plus a resolver (`registerMemoryResolver`); the audience words are `present`, `squad`, `public` or an id group the resolver names.
- **Memory in prompts:** the context block already carries the dossier, journal, facts, promises, recent chronicle lines and DM recap inside a guaranteed share (`group: 'memory'` providers); a new provider that is memory declares the group and trims itself to the budget it is given. `director_tick` already receives the public recent lines and the world dossier.

## Interfaces already provided by P12 (implemented — use, do not rebuild)

- **Commander stress:** `addCommanderStress(draft, amount, source)` (`src/engine/special/commanderStress.ts`) moves the commander's own stress 0–100 and emits `commander_stress_changed { delta, source }`; `commanderStress(state)` and `commanderStressBand(state)` read it. `pain_burst` calls it; at 70 or more Empathy is one rank lower (`socialRank` reads `state.commander.stress` directly), and the CMDR card's `STRESS: <band>` chip and the `glossary:commander_stress` reading already exist. Nothing here draws.
- **A suspicion clock** is `Record<unitId, number>` in a state block of `special/state.ts` (a leaf: types, tuning, `forgetSpecial`, `holdsSpecial`), decayed in `specialDayStep` (`director_tick`), hidden from every event, toast and reading (a sentinel in `tests/fixtures/analyze/hidden.ts`) and shown to the player only as a band or as `An unseen threat`. `forgetSpecial(draft, unitId)` is called by `removeFromService`; extend it for any new per-unit record.
- **Own-panel nights:** a night entry whose kind is in `OWN_PANEL_KINDS` (`isOwnPanelNight`) is refused by `night/open`, `night/ignore` and the door and is answered from its own panel; the handler's visit (`HANDLER_VISIT_KIND`, `unitId: HANDLER_UNIT`) belongs to no soldier, so a warden's visit could use the same route. `tonightItems` lists it; `app.ts`'s `confrontationNight` routes it.
- **A one-way choice** is a `focus[].confirm` question that `performActivity` asks before spending anything; a focus open only to some commanders is `focus[].requires.traitEffect`.
- **Hidden-truth wording pattern:** a fragment, a premonition or a toast is picked by `fnv1a(id)` from a registry (`frequencyFragments`, `premonitionLines`), never by a draw, so a true and a false one are identical; a model-reportable event is offered only while the input lists something it can be about (`leakInput`, `warnedInput`).
- **Fixed dilemmas by context:** `debts_oversight` / `debts_unit` templates are authored (`fixed` only), presented by the engine without a model, queued while another dilemma is open (`debts.caseQueue`) and completed by `debtsChoice` after `dilemma/choose`; a warden case can follow the pattern (and P9b's `scapegoat`).

## Implemented as

Engine: `src/engine/warden/` — `state.ts` (a leaf: types, `leashswapOf`, `wardenOf`, `isLeashswap`, `forgetWarden`, `overrideOpen`, `wardenArgueStart`, the `setWardenGoneHook` / `notifyWardenGone` pair), `select.ts` (corporate pick, `seedWarden`), `agenda.ts` (fallback agenda, `setAgenda`, `learnExpectation`, `expectationEvent`), `conflict.ts` (`conflictOf`, `herAlternative`), `override.ts` (`rollOverride`, `answerOverride`, `runOrder`, ARGUE, `resolveCompromise`, `argueEnded`), `punish.ts` (commander punishments, restrictions, `applyRemotePunishment`), `leash.ts` (the Leash on the commander, the co-sign), `escalation.ts`, `death.ts`, `intrigue.ts` (suspicion, allies, discovery, `dig`, `hackStep`), `removal.ts` (the three routes, the report case, remote control, the verdict), `describe.ts`, `reveal.ts`, `dayStep.ts`, `index.ts`. Actions in `src/engine/actions/warden.ts` (imported by `app.ts` after `actions/special`). Non-engine: `src/warden/{controller,directives,deps}.ts` (`createWarden` / `app.warden`), `src/ui/warden/{modeSection,revealCard,wardenPanel,overrideChip,notices,intrigueSection,endScreen}.ts`, `src/analysis/providers/warden.ts`, `css/81-warden.css`, LLM calls `src/llm/calls/{wardenAgenda,wardenJudge,epilogue}.ts`, content `commanderPunishments` and `wardenExpectations` (new registries), `memoryRules` (11 rules), `dilemmaTemplates.warden_report_case`, `prologues` (`mode: 'leashswap'`), glossary (17 entries and `setting_warden_judge`), flags, `eventDeltas` (7 rows). Tests: `tests/warden/` (22 files), `tests/ui/{wardenPanel,wardenOverride,wardenReveal,wardenSetup,intrigueSection}.test.ts`, `tests/analysis/wardenProviders.test.ts`.

### State and actions
- `CampaignState.leashswap?: LeashswapState { deathRule, warden?, intrigue, removal?, remote?, status: 'held'|'investigation'|'free', revealed? }` and `CampaignState.ended?: { day, cause: 'terminated'|'executed', epilogue? }`. Every field is optional and `version` stays 1; **absent `leashswap` is the default mode**. `Unit.status` gains `reassigned` (`isLiving` treats it as out of service; `removeFromService` accepts it). `IntrigueState { suspicion, seq, lastAllyDay, hack: { step }, discovered, reportQueued? }`; `RemovalState { route, day, clockId, unitId? }` (`unitId` is the removed warden, so a conviction picks her successor from the others; a hack-route warden stays `active` in the squad).
- `SetupResult.mode?: { kind: 'leashswap', deathRule, warden: { by: 'player', index } | { by: 'corporation' } }`; `PrologueSchema.mode`; `prologueFor(reg, startId, mode?)`.
- Actions: `warden/revealed`, `warden/agenda`, `warden/answer { overrideId, answer }`, `warden/argue_started { sceneId }`, `warden/no_snapshot { cause }`, `campaign/epilogue { text }`, `intrigue/act { action: 'dig' | 'hack_step', unitId? }` (one slot, refused in a scene, a run or a fight, and while a decision waits), `intrigue/report` (no slot), `debug/kill_commander`. `dispatch` refuses everything but `debug/*` and `campaign/epilogue` once `ended` is set (`campaign_ended`).
- Events (reserved): the list of the plan's Global Constraints, plus `warden_revealed`, `override_argue_started`, `override_compromise_failed`, `report_queued`, `warden_leash_refreshed`, `commander_restriction_ended`, `epilogue_written`. Engine event types with an `eventDeltas` row: `warden_complied`, `warden_defied`, `warden_betrayed`, `warden_removed_by` (`valueAligned`); model-reportable: `expectation_kept`, `expectation_broken`, `conspired`, and `compromise_reached` with an `overrideId`. `DILEMMA_CONTEXTS` gains `warden_report`. Registry fields: activities `idle` / `quota`, orders `wardenRule`, roles and defects `tech`.
- `TUNING.warden` holds every draft number (`satisfaction`, `defiance`, `override`, `cosign`, `punish`, `leash`, `escalation`, `intrigue`, `hack`, `kompromat`, `removal`, `verdict`, `remote`).

### Rulings (the plan's ruling section holds the full text; user rulings answered 2026-11-18 are marked **(user)**)
- **Death rule (user).** Chosen on the setup MODE section, never changed; default `rewind_day` for story / normal and `campaign_end` for hard. `rewind_day` restores the day-start snapshot (`alius_day_start`, written only in the mode) and hides the scenes played since with `hideMessages`; a missing or foreign snapshot falls back to `campaign_end` (`warden/no_snapshot`). An execution by verdict always ends the campaign. Being downed in combat stays an injury (user).
- **Overrides (user: engine rules plus an optional model judge).** `conflictOf` reads the closed rules by expectation kind; a `personal` expectation is judged only by the optional `warden_judge` (setting `wardenJudge`, off by default, never in combat). The roll is `clamp(weight × authority × leniency × 2.0, 0, 0.9)` and draws only when a conflict exists. COMPLY runs her alternative; DEFY runs the order, raises defiance by `round(30 × weight)` and lowers satisfaction by `round(20 × weight)`, then the punishment roll; ARGUE outside combat opens a scene with her alone and only a real `compromise_reached` (with the override's id) resolves it without defiance; ARGUE in combat is one seeded roll on `argueChance` (user).
- **Co-sign (user: engine roll).** `leash/compel`, `leash/suppress`, `leash/terminate` and `combat/compel` ask `rollCosign` while a warden is in service; a request against her is denied without a draw; a denial spends nothing and files a `denied` log entry with `cc: 'warden'`.
- **Lethal escalation (user: termination and the verdict only).** Two warnings on two different days; defiance is held at 74 and 99 until then.
- **Intrigue (user: allies in scenes, the rest as slot actions).** `conspired` is offered only without the warden in the room and names only units not yet allies and not asked today; `dig` and `hack_step` are slot actions; `intrigue/report` opens the fixed `warden_report` dilemma.
- **Convicted (user).** A new warden by the corporate ordering (satisfaction 40, the fallback agenda, `assignedBy: 'oversight'`), without the one removed; nobody eligible means an execution that ends the campaign under either death rule. No NPC officer.
- **Rulings made while implementing chunk (c).**
  - A failed hack step's one punishment is the pain burst (found by its `injury` effect, applied directly), replacing the discovery's highest-severity pick: the plan names both, and two punishments for one event would double the cost.
  - `removeFromService(draft, unitId, status, ctx?)` now returns events; for the warden it needs `ctx` (it throws without) and reaches `wardenGone` through the leaf's hook, so `leash/use.ts` imports no removal code.
  - For the report route the squad reading's `corporate −1` is replaced by `corporate +1` (by the book) rather than listing both entries (they would cancel).
  - The warden never overrides the `warden_report` dilemma (it is the commander's own move against her).
  - Remote control: a mission failed in the day that is ending costs a pain burst; a quota span of 7 days counted from its start with no mission completed costs a reprimand (days 7, 14, …), not a daily check; remote punishments use `applyRemotePunishment` (no warden: restrictions, the Leash and her satisfaction and defiance are skipped).
  - On a verdict the removal, the remote block and the world clock `investigation` are deleted. The `verdict` public fact comes from its memory rule, not from the site.
  - `override_answered` carries `context`, so a defiance in a fight (witnessed: the squad) and a private one (the present units) get different audiences; `wardenKnowledgeRule` also hides a kompromat fact that is still hidden from the commander.
  - Memory-rule texts carry the `AUTHOR TO WRITE:` marker like the other authored text.
- **Fixes after the review of chunk (c)** (an Opus reviewer; every one has a failing-first test in `tests/warden/reviewFixes.test.ts`):
  - A slot action does its work first and spends its slot last (`spendSlot`, and only if a discovery's punishment did not already spend it): an evening hack step lost its progress because the day end rebuilds the state. `dig` and `hackStep` also meet the refusals an activity meets (`slotActionBusy`: not at night, not with an open conversation, not while a decision waits, not on a due booking; `intrigue/act` joined `bookingGuard`). The report stays allowed while a decision waits (it queues).
  - The `warden_report` case names nobody in `units` (only `subjectId`), so the general `dilemma_choice` memory rule cannot tell her about it.
  - The investigation clock carries `engine: true` and `visibleToPlayer: false`: the director's digest and `clockAdvances`, a generated dilemma's clock list and clock effect, the map and the scene context never see it (the plan said visible; its length would give the route away).
  - `seedWarden` clears `warden_knows_ally` for everyone and the new warden's own `warden_ally`; `allies()` leaves out the sitting warden. A conviction's successor is `corporateWardenPick(…, { anyLiving: true })`: an injured or reserve unit counts, so a full medbay never executes the commander. The verdict resets `intrigue.discovered` (it counts against one investigation).
  - Memory check, the events left out on purpose: `intrigue_discovered`, `ally_refused`, `controller_dark`, `investigation_opened`, `remote_control_started`, `report_queued` (the consequence events, the removal's own rules and the journal phrases cover them) and remote-control punishments (`remote: true`).
  - No pronoun for the commander in the `conspired` journal phrase or its extraction instruction; the pronoun tests now also catch `them` after `commander`.
- **Where the code differs from the plan text.** Named units are never downed for good today, so the death route opens on a desertion or a termination (and in `finalizeCombat` only for a unit whose status is `dead`: a defensive hook); the report route's `reassigned` goes through `removeFromService` with `wardenGone` doing nothing for it (the report itself opens the route, once).
- **Content gate (0.1 release audit).** `commanderPunishments` is a P9d gated registry (`CONTENT_GATED_REGISTRIES`, a probe in `tests/helpers/bonds.ts`): `public_humiliation` carries `public_humiliation`, `pain_burst` carries `physical_discipline_shown`. `pickPunishment` skips an entry whose tag is switched off or among the warden's own limits (a severity with nothing left falls to the next lower one), and `painBurstId(state, reg)` is undefined while the burst is gated, so a discovered hack step costs another punishment instead and a failed mission under remote control costs none.
- **Lost slots while busy (0.1 release audit).** Like a suppression, a punishment with `lose_slots` is not picked while a scene, a fight, a run or a talk waiting for its scene (`calendar.pendingScene`) is open, and the effect itself does nothing then: a run spent its slots again on return and brought the squad back a day late.

### Non-obvious things to know before touching P13 code
- **No `leashswap` block, no effect.** Every hook reads `wardenOf` / `leashswapOf` first and draws nothing without them. `tests/warden/unaffected.test.ts` runs a seeded week (day ends, activities, a roster change, scenes with a reading, DMs, a dilemma, a Leash request, a fight) and compares its event log, rng and a hash of the final state with `tests/fixtures/unaffected-week.json`, made on the commit before P13. The order of the day-end steps follows the order the action modules are evaluated, so the test imports `world` first, as the golden did. Regenerate the golden (`UPDATE_GOLDEN=1`) only for a deliberate change of default-mode behaviour. The week's combat orders are refused before the P13 hook (the helper has no unit awaiting input), so the combat hooks are covered by their own tests.
- **A removal starts once.** `startRemoval` does nothing unless the status is `held` and no `removal` exists, so a death plus a status change, or a hack after a report, cannot start two investigations. It clears her open override, an open or queued `warden_report` case and the hack progress. It draws nothing.
- **`removeFromService` needs `ctx` for the warden**, and `warden/state.ts` stays a leaf: `actions/warden.ts` registers `wardenGone` (`setWardenGoneHook`) and `startRemoval` for the hack (`setRemovalStarter`). A test that removes the warden must import `actions/warden`.
- **Hidden truth never leaves the engine:** the suspicion, the co-sign chance, the verdict chance, the report chance, the hack's discovery chance, and the kind, text and weight of an unknown expectation. Events carry ids and kinds; the panel shows `? UNKNOWN EXPECTATION` (the count) and the investigation as a band (`JUST OPENED` / `UNDER WAY` / `NEARLY CLOSED`; the length of the clock would give the route away); readings say `An unseen threat`. Sentinels: `tests/fixtures/analyze/hidden.ts` (suspicion 67, an unfound kompromat fact, an unknown personal expectation) and `tests/analysis/wardenProviders.test.ts`.
- **Suspicion draws after every noisy move.** `addSuspicion` adds the noise and draws at `suspicion / 200` (certain at 100), also after an ally check; a corporate refuser (`values.corporate ≥ 2`) reports at once. It fades by 3 a day, also while nobody holds the leash.
- **Kompromat is a fact tagged `kompromat` about the sitting warden.** A dig reveals the newest hidden one, else (on a parity of `fnv1a(day|seq)`) teaches an unknown expectation, else adds one of the authored lines not used yet; three lines exist (`TUNING.warden.kompromat.lines`), so a report needs the author's own. `kompromatOf` counts only what the commander may know.
- **The investigation clock is a world clock the engine makes up** (`addClock`, no `clocks` entry; `engine: true`, not visible) and moves in the warden day step; an investigation with no clock gets its verdict at once rather than hanging. `warden:remote` and a corporate notice mark remote control.
- **Read by field, effect type or kind, never by id:** expectations by `kind`, punishments by effect `type` (the pain burst by its `injury` effect), roles and defects by `tech`, dilemma templates by `contexts`, options by their `id` slug (`submit`, `withdraw`), activities by `idle` / `quota`, orders by `wardenRule`.
- **Directive ids** are `warden:`-prefixed (`reveal`, `argue`, `romance`, `warning`, `remote`), derived from the state on every refresh, and stay away from every older reserved prefix (`tests/warden/directiveIds.test.ts`, `tests/power/herCallDirectives.test.ts`).
- **P15's hand-off:** `OverrideSource`, `rollOverride`, `answerOverride`, `overrideChance`, `renderOverrideChip`, `rollCosign`, `resolveCompromise`, `commanderPunishments` and `applyCommanderPunishment` are generic over the holder (see P15's **Interfaces already provided by P13**).

### Open items
- **No NPC officer** (the spec's other option for a new warden): a conviction picks a squad unit or ends the campaign.
- **Metadata size.** The day-start snapshot is a second metadata key (`alius_day_start`) and roughly doubles the metadata of a LEASHSWAP chat; the manual test watches for it.
- **A warden in the squad's Leash pool.** A request against her is denied at the co-sign; she is outside the hierarchy (`computeHierarchy`, `standingOf`, `herCallCandidates` filter her) but is otherwise an ordinary unit for the Leash, the roster and expeditions.
- **A reassigned warden may not return** (the spec's "may return hostile via director") — the director does not know the status.
- **The author's:** every number in `TUNING.warden`, the expectation entries and weights, the punishment wording and numbers, the controller lore (`controller_implant` lorebook entry), the intake wording, every `AUTHOR TO WRITE` line (notices, directives, memory rules, the `warden_report_case` text, the kompromat lines beyond three), and the journal phrases.
- **Not covered by an automated test:** the in-SillyTavern behaviour (rewind hiding the chat, the END screen) — `docs/MANUAL_TEST_P13.md`.

Final counts after the review fixes, on the branch with P14b: 482 test files, 7427 tests, all passing (P13 alone ended at 419 files, 6780 tests; baseline before P13: 387 files, 6408 tests); `tsc` clean.
