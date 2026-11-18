# P13 — LEASHSWAP Mode (Inverted Command)

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

