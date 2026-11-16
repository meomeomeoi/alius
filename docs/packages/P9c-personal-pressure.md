# P9c — Personal Pressure: Device Access, Bookings, Courtship, Tokens, Secrets, Wagers

**Status: implemented** (plan: `docs/plans/2026-11-16-p9c-personal-pressure.md`; see **Implemented as** at the end; where it differs from the draft, the code wins). **Depends on:** P9b, P9 (demands, Impunity), P3 (relationship graph, facts), P4 (combat engine for sparring), P10 (voices, PDA device). **Read:** overview; this file; P9d §1 (bond profile).

**Analysis tool (P7a):** every new player-facing stat, chip, option and choice card in this package carries `data-analyze`, has a glossary entry or registry `description`, and live values get an analyze provider reading through `Knowledge`.

## Goal

Pressure on the commander from individual units, in everyday life and in his own device: they take over his time, court him, mark him as theirs, keep secrets from him, bet with him for power — and, with enough closeness or impunity, get inside his PDA.

All mechanics here apply only to units whose bond profile allows them (P9d §1); frequencies scale with `squad_assertiveness` (P9b).

## 1. Device access levels (unified)

Per named unit, `deviceAccess ∈ {0,1,2,3,4}`, derived (not stored) from relationship state, Affinity, Impunity and leadStyle (table in registry `deviceAccessRules`):

| Level | Name | What she can do | Typically from |
|---|---|---|---|
| 1 | **Decor** | stickers on the device frame, her photo as wallpaper, renamed contact in COMMS ("★ yours") | `friend`+ / `flirting`+ with leadStyle ≥ balanced |
| 2 | **Notes** | pinned notes on the PDA home (incl. relationship rules from P9d) | `close`/romantic states |
| 3 | **Calendar** | books his slots (§2) | romantic + leadStyle ≥ assertive, or Impunity ≥ 60 |
| 4 | **Messages** | edits his outgoing DMs and cancels his requests before they go out | leadStyle dominant + (romantic or Impunity ≥ 75) |

Level-4 edits: the player's text in the DM input visibly changes before sending; chip `EDITED BY {NAME}` with `[KEEP] [REVERT]`. Revert = defiance toward her (Trust −, Impunity +). Rate-limited (default ≤ 1 per day per unit). Cancelling a request (e.g. a Leash request, a recruit order) uses the same chip.

Removing decor (the player can peel a sticker / change wallpaper) is visible to her: Affinity −, and a scene hook. On a break-up, decor stays as a faded mark for 7 days.

Visuals for levels 1–2 are rendered by P10b; this package provides the data and rules.

## 2. Calendar bookings

Units at access ≥ 3 can book a future slot of the commander ("evening — you're with me"). Bookings appear in the calendar marked with her name and colour. At slot time the booked scene starts unless the player cancels: cancelling = refused demand (P9 refuse deltas, scaled by her Impunity). Two bookings for the same slot → conflict event: choose one (the other gets `rejected_advance`-like deltas) or let them settle it (`attachment`/leadStyle decide; the loser gets stress).

Frequency: ∝ Affinity, Want (P9d) and Impunity; cap per unit per week (default 2).

## 3. Inverted courtship

For units with leadStyle ≥ assertive in romantic-eligible states: character-initiated proposals (P3 §5) get ×2 frequency, and the commander's response options in chips become **accept / deflect / set a condition** (condition = a short free text that becomes a promise in P3). New event `claimed` (she publicly signals he is hers): requires P9d §5 publicity `public` or turns it public; other units react by values and states (jealousy, respect, amusement).

## 4. Tokens

Units can give the commander personal tokens (registry `tokenKinds`: dog tag, patch, ribbon, workshop-made plyx ring, etc., flavoured per unit). Tokens are items with a `worn` flag; up to 2 worn. Worn tokens: visible on the CMDR dossier, in the scene context ("wears Rhea's patch"), and to other units. Effects: giver Affinity + while worn; others' jealousy/respect by state; removing a worn token = event for the giver. Possessive Protocol and Dominance Drive (P9d) amplify all of it.

## 5. Collective secrets

Engine-created facts known to all (or a subset of) the squad and **not** the commander, flagged `squadSecret` with a reason (`protect_him`, `self_interest`, `leader_order`). Sources: events (a unit hid an injury, a deal with traders, who the squad picked as the commander's successor), leader decisions, P12 Debts discovery by a unit that chose to protect him. Directive to present units: "do not reveal X to the commander".

Discovery routes: Insight checks in scenes with low-Trust units, Secret Frequency intercepts (P12), a unit in `open_defiance` or `resentful` letting it slip, night talks at high Affinity. On discovery the commander chooses: confront everyone (squad punishment: Impunity −, Affinity − across the squad), pretend not to know (fact gains `commanderKnowsSecretly`), or use it (leverage in later scenes).

## 6. Wagers

A unit challenges the commander (DM or scene chip), or the commander challenges her. Games (registry `wagerGames`): `coin`, `rps` (rock-paper-scissors), `high_card`, `sparring` (1v1 quick simulation on the P4 engine: commander body stats vs her stats with a handicap table — the commander can win only through the handicap or luck, by design), `expedition_bet` (kills / no-damage / first to the objective, resolved at expedition end).

Stakes (registry `wagerStakes`): a day of obedience (the loser follows the winner's non-combat orders for a day), a slot, a privilege, dropping a pending demand, a token, an answer to one question (truthful; becomes a fact). Stakes respect the content categories of P9d §2 — a stake that touches a disabled category is never offered.

Outcomes apply as engine effects; "a day of obedience" for the commander = his non-combat choices for that day are hers (UI shows her choice pre-selected; overriding = defiance toward her).

## Acceptance criteria

1. Access levels derive from the table; each level unlocks exactly its capabilities; level-4 edits show the chip and respect the rate limit; KEEP/REVERT apply consequences.
2. Bookings appear, start their scenes, can be cancelled with demand-refuse consequences; double booking resolves both ways.
3. Inverted courtship applies only to eligible units; condition becomes a promise; `claimed` makes the relationship public and triggers reactions.
4. Tokens: worn limit, visibility in dossier and context, removal events.
5. Squad secrets: directive keeps them out of replies (fixture test on context), discovery routes fire, all three responses work.
6. Wagers: all five games resolve; sparring uses the P4 engine; stakes never include disabled content categories; a day of obedience pre-selects her choices.
7. Units without a suitable bond profile never use these mechanics (test).

## Interfaces already provided by P9 (implemented — use, do not rebuild)

- **Demands:** `openDemand(draft, ctx, unitId, { owed? })` (a weighted seeded pick among the eligible templates; null when none, one is open or the weekly cap is reached), `answerDemand`, registry `demandTemplates` (cost vocabulary is closed; a new cost type is a code change in `DemandCostSchema` and `grantProblem`/`answerDemand`). A booking that is refused goes through the refuse path (`refused_demand`, a held `defied` at `I ≥ 50`); the chips `[GRANT] [REFUSE] [TALK]` (`drawDemandChips`) and the DM delivery already exist.
- **Restrictions:** `restrictionReason(state, unitId, use, activityId?)` is the one reader of confinement, bench, no-leave and duty; call it before booking a unit.
- **Impunity:** `impunityOf` and `commandStance` for who may blackmail or pressure whom; leverage secrets are flags with `leverage: true` (`S` of Impunity), so a squad secret that a unit holds over the commander raises her Impunity with no code.
- **Hidden state:** the stored R, the deed counters and who sabotaged are never in a reading; add sentinels to `tests/fixtures/analyze/hidden.ts` for new hidden values.

## Interfaces already provided by P10 (implemented — use, do not rebuild)

- **The device:** the PDA is a layer over the hub (`ShellApi.setDevice/isDeviceUp`, `ShellDeps.onDevice`); `.alius-device[data-skin][data-kind][data-preset][data-up]` › `.alius-device-chrome` (decor, `aria-hidden`, ignores the pointer) + `.alius-device-screen`. Skins are the `deviceSkins` registry (`bindTo: { corporationId | traitId | unlockFlag }`, at most one key) chosen by `pickSkin`; **access levels are not in P10**: P9c adds its own data and reads the skin through `pickSkin` only.
- **Voices:** `renderVoiceCard`, `renderBubble`, `unitAccent` (6 fixed accents by `fnv1a` of the unit id; P10b may make them data). A squad secret shown as a document is a `paper` card with `redact` ranges.
- **Whereabouts:** `whereabouts(state, reg)` is derived and stateless; bookings that decide where a unit is would replace step 5 (the routine pick) with a stored schedule — keep the signature and the reasons (`injured`, `confined`, `duty`, `night`, `routine`, `expedition`, `nowhere`).
- **Hub model:** `tonightItems` lists at most 6 lines in a fixed order and must never reveal a value the PDA does not show; add new kinds at the end of its order with an `analyze` address.

## Interfaces already provided by P9d (implemented — use, do not rebuild)

- **Content categories:** `contentAllowed(state, reg, entry, unitId?)` over `contentTags` (wager stakes join `CONTENT_GATED_REGISTRIES` and need a `GATE_PROBES` probe); characters' own limits (`bond.ownLimits`) hold even with a category on.
- **Smother stand-in:** `bonds.smother = { unitId, untilDay }` (`smotherActive`, `startSmother`, `clearSmother`, `smotherRefusal`); `expedition/start` is refused while it holds and the UI controller opens her scene at the next `slot_advanced`. Bookings replace this: keep `releaseBreakdowns(draft, ids, reg)` starting the hold, or move that call.
- **Publicity:** `setPublicity(draft, reg, unitId, 'public', { cause: 'claimed' })` is what a `claimed` booking calls (no preference event); `publicityMismatch` and the demand `publicity_talk` already exist.
- **Want and rules:** `wantOf` / `wantBand`, `relieveWant(draft, unitId, amount, cause)` (a booking or a token may relieve Want), the demand kind `desire` with cost `night_visit`, `rulesOf` / `activeRules` and the check `intent` (a token rule such as `no_other_tokens` is intent-only until tokens exist: add a check vocabulary entry and its engine hook).
- **Notes:** a pinned rule note reads `rulesOf(state)` (`status`, `text`, `brokenCount`).

## Interfaces already provided by P9b (implemented — use, do not rebuild)

- **Assertiveness:** `assertiveness(state, reg).demandMult` already scales P9's `demandChance`; bookings read it the same way (a world option read by effect type `squad_power`, never by choice id).
- **Voting:** `registerVoteGate(actionType, gate)` makes a decision wait for a squad vote while the world's `voting` is on; a booking decision that should be votable registers a gate and a `voteKinds` entry (lean, reasons).
- **Hierarchy:** `leaderOf(state)`, `standingOf(state, reg, unitId)`, `privilegeScale`, `outsideActive` and `noteFeat`; the co-command stand-in (`co_command`) is now the hierarchy's endorsement (`endorse`).

## Implemented as

Engine: `src/engine/personal/{state,gates,access,decor,intercept,bookings,courtship,reactions,tokens,wagers,words,tally,obedience,events,secrets,dayStep,index}.ts` (one file per mechanic; `state.ts` is a leaf and holds `personalOf`, `forgetPersonal`, `heldTerm`, `obedienceOf`), `src/engine/combat/sparring.ts`, `src/engine/actions/personal.ts` (registers `personalDayStep` on `dm_rumors` after the bonds step). Non-engine layer: `src/personal/{controller,directives,deps}.ts` (`createPersonal` / `app.personal`), `src/ui/personal/{deviceBlock,schedule,chips,claimCard,tokens,wagerForm,wagerCard,obey,secretCard}.ts`, `src/analysis/providers/personal.ts`, `css/76-personal.css`, `flavor` kind `dm_edit` (setting `dmEditWording`, default on). Content: registries `deviceAccessRules` (4), `bookingKinds` (3), `tokenKinds` (6), `wagerGames` (5), `wagerStakes` (7), `secretKinds` (3), the defect field `pressureMult`, the stance fields `hidesInjury` / `secretSlip` and the state field `secretSlip`, the world effect `squad_secret`, the rule check `token_wear`, one authored event (`evt_trader_deal`), 9 glossary entries. Numbers: `TUNING.personal`.

### State
- `CampaignState.personal?: PersonalState` (absent = nothing booked, given, wagered or kept): `decor`, `intercepts { open?, log }`, `bookings`, `noBookUntil`, `claims`, `tokens { owned, offer?, given }`, `wagers { open, log }`, `obedience`, `pendingQuestion`, `truth`, `mark`, `secrets`, `leaderSince`. `DmMessage.editedBy?`, `ExpeditionState.tally?`, `ImpunityTerms.held`. Every field is optional; the version stays 1.
- Events added: the six engine types `overrode_her`, `decor_removed`, `rival_favoured`, `bond_shown`, `token_removed`, `secret_confronted` (`ENGINE_EVENT_TYPES`, each with an `eventDeltas` row, never offered to the model) and the reserved `decor_*`, `device_intercept`, `intercept_resolved`, `booking_*`, `proposal_conditioned`, `claimed`, `claim_refused`, `token_*`, `wager_*`, `mark_*`, `truth_told`, `demand_dropped`, `secret_kept`, `secret_found`, `secret_answered`.
- Actions: `device/remove_decor`, `device/intercept`, `device/resolve_intercept`, `booking/cancel`, `booking/resolve`, `booking/play`, `courtship/refuse_claim`, `token/answer`, `token/wear`, `token/remove`, `wager/challenge`, `wager/answer`, `wager/play`, `wager/answer_question`, `wager/record_answer`, `secret/respond`; `dm/send` takes `interceptId`, `proposal/answer` takes `condition` and the answers `deflect` / `accept_condition`. No new intent: `intent_extract` is unchanged.

### What changed against the draft (rulings; the plan's ruling section holds the full text)
User rulings (answered 2026-11-16) are marked **(user)**.
- **Bond gate.** Every per-unit initiative needs an imported bond profile (`unit.bond !== undefined`) plus the mechanic's own test (`pressureGate`, `TUNING.personal.gates`): device `leadRank ≥ 1`; booking device access ≥ 3; intercept access 4 and `jealousy_games` for her; courtship `leadRank ≥ 2`, romance on and the romantic tier or an open romantic proposal; claim courtship + romantic tier + no affair; token tier close or romantic, attachment not avoidant, Affinity ≥ 50; wager `leadRank ≥ 1` and Affinity ≥ 20 or Impunity ≥ 50. Squad secrets are collective and the one exception. A squad with no imported bond profile draws nothing and changes nothing (a test runs ten days).
- **Amplifier.** The defect field `pressureMult` (1…2; `possessive_protocol` and `dominance_drive` 1.5) and `assertiveness().demandMult` multiply every frequency (booking, token offer, her challenge, claim, intercept) and the deltas of `rival_favoured`, `token_removed` and `overrode_her` toward her.
- **Device access is derived, never stored** (`deviceAccess`: the highest `deviceAccessRules` level with a branch that holds, 0 when the device gate fails). Capabilities are cumulative; a level never grants a higher one. Decor is stored per unit, placed once with all three parts, one wallpaper owner (the highest Affinity); peeling does not regrow for 7 days; a break-up fades it for 7 days. Notes are derived (`pinnedNotes`).
- **Level-4 intercepts (user: the app rewrites the DM with the LLM; DMs to others).** She edits a DM to another soldier, a Leash request or a recruit order: one draw at 0.3 × `demandMult` × `pressureMult` (cap 0.6), at most once a day per unit, none when there is no editor. The app words a DM edit with `flavor` kind `dm_edit` (setting `dmEditWording`; fallback the L4 `editLines` with `{text}`); the engine stores what the commander wrote (`Intercept.original`, so a reload can word it again) and never the edited text. KEEP sends the edit (`editedBy`), REVERT applies `overrode_her` (moderate) and record +3. A pending edit is dropped at day end with no effect; switching `jealousy_games` off drops it with no deltas.
- **Bookings.** Registry `bookingKinds`; the day step rolls once per eligible unit under the weekly cap (`0.08 × (1 + Affinity/100) × (1 + Want/100) × (Impunity/50) × demandMult × pressureMult`, cap 0.5) and books tomorrow. The `booking_due` guard in `dispatch` and `endSlotBlock` reads `dueBooking` and `bookingPlayable` only (pure): a booking she cannot keep never blocks and lapses free. `refuseLikeDemand` is the P9 refuse path factored out of `answerDemand` (cancelling a booking, and a wagered one also breaks a promise); `refused_demand` rows were filled so a template-less refusal costs something. A scene with her counts as playing a due booking (`scene/start`). Conflicts resolve by choosing (the other gets `rejected_advance`) or settling (`attachmentRank + leadRank`, then Impunity, then squad order; the loser +10 stress). `startSmother` books her the next slot when it is given the registries; the bonds controller's own opening is gone, the booking opens the scene once.
- **Inverted courtship and `claimed`.** `courtshipMult` ×2 on DM initiative and night knocks; three chips on her own proposals (`deflect` = `not_now`, `accept_condition` records her promise, 1–160 chars). `claimed` is a day-step roll (0.04, 14-day gap): the relationship turns public (`cause: 'claimed'`), romantic-tier rivals take `rival_favoured` (major), close or in-group units `bond_shown` (minor); REFUSE PUBLICLY needs `public_humiliation` (`rejected_advance` major, stress +8).
- **Tokens.** One offer per unit, ever; one open offer in the squad; expires after 3 days as declined. At most two worn; wearing reacts like a claim (moderate / minor); the giver gains Affinity 1 a day while worn; taking one off is `token_removed` (moderate × `pressureMult`) and a directive for a day; a locked token (a won wager) removed early also breaks a promise. The rule `no_other_tokens` is checked by `token_wear` and needs `jealousy_games` (**user**).
- **Wagers.** Five games, seven stakes (`obedience`, `slot`, `privilege`, `drop_demand`, `token`, `question`, `her_mark`); `wagerStakes` joins `CONTENT_GATED_REGISTRIES` (`her_mark` is tagged `body_modification`), `stakeOffered` filters by category, her own limits and feasibility; a category switched off withdraws the stake's wager and ends a mark quietly. `coin` one draw; `rps` a tie draws once more, a second tie voids; `high_card` a tie voids. No social stat tilts a game.
- **Sparring runs on the P4 engine** (`sparringBout`: a scratch `CombatState`, AUTO, 20 rounds, a draw goes to her; only the rng advances). It spends a slot (not at night, not while a scene, decision, knock or due booking holds it) and gives half a session of strength XP. Handicap drafts after the balance step: `one_arm` atk 0.35, `first_blood` hp 0.33, `blindfold` atk 0.4 / spd 0.4 / hp 0.9. Expedition bets (`kills ≥ 3`, `no_damage`, `objective`) wait as `pending_run` and settle in `endExpedition` from `ExpeditionState.tally`, after the report and before the slots are spent; void after 7 days or when she leaves.
- **A day of obedience (user: her own business only).** While the commander obeys her, her pick is pre-selected for her demand, her bookings, her proposals, the open dilemma (`herPick`) and a squad vote (`herVote`); choosing otherwise applies `overrode_her` once and record +3, in the engine. Activities, the base and expeditions are untouched. While she obeys: `refusalChance` 0, no demand, no booking, claim, offer, challenge or countermand from her. It ends at day end.
- **Squad secrets (user: Impunity down + a directive).** A kept secret is **not a `Fact`**; `personal.secrets[]` holds it and its text never reaches an event, a log line, a toast or a reading. Sources are deterministic and draw no rng: a run ending with a unit at ≤ 25 % HP whose stance has `hidesInjury` (not one carried back or dead), the world effect `squad_secret`, and the successor secret the day a leader has held the squad for 7 days. Discovery: `insight` (one draw at `0.08 × Insight`, cap 0.4, per kept secret with a knower of Trust < 40 present), `slip` (one draw at 0.25 when a present knower's stance or state has `secretSlip`), `night` (a knower with Affinity ≥ 60 and Trust ≥ 50 queues a confession, one draw at 0.1; `night/open` on it finds the oldest secret she keeps), `frequency` (exported for P12, not wired). The answer: confront (record −5 for each knower, `secret_confronted` on every named living unit, a public fact), pretend (a fact only the commander has, `knownBy: []`, and the directive stays), use (the knowers share the fact; `ImpunityTerms.held` = −8 per used secret she knows, at least −16, for 14 days; the P9 provider shows it).
- **Where the implementation differs from the plan text.** `heldTerm` lives in `personal/state.ts` (a leaf), not `secrets.ts`: `impunity.ts` must not import `secrets.ts`. A hidden-injury secret is known by the injured unit herself and the other named living party members (at least one other). The leader's tenure is stored as `personal.leaderSince` (the hierarchy has no "since"). The `personal:secret:` directive names only the knowers present, with singular and plural wording. `glossary:squad_secret` lists secrets that came out and never counts the kept ones. The trader-deal event's cost option is `Forbid the trade` (stress and the squad deals behind the commander's back). The night confession has `nightPriority` 50 and `nightExpiresDays` 2 (drafts).
- **Retiring and cards (review).** A kept or pretended secret that is no longer true is retired by the day step with no deltas and no draw: a hidden injury once her HP is above the threshold again, a successor secret once its subject no longer leads (found and answered ones are never touched); a queued confession of a unit who is no longer living is dropped, and the draft marker `AUTHOR TO WRITE:` is stripped from a secret's stored text. A found or answered secret stays when its last knower leaves (a kept one goes). The night confession announces itself with `night_queued` and is not queued while one of hers is queued or at the door; the card hides a name only as a whole word. One secret card opens per dispatch; `answerSecret` then shows the next found one. While a secret waits, `glossary:squad_secret` masks the knowers' names like the card does.
- **Text.** The spec above calls the commander "he/his"; nothing this package writes may (lore §0, `tests/content/pronouns.test.ts` covers every new registry, directive and glossary entry). The spec's `protect_him` is `protect_commander`.

### Balance pass (preliminary, all draft; the author owns them)
- **Bookings and intercepts (arithmetic).** A dominant lover at Affinity 80, Want 50, Impunity 55 and normal assertiveness books with chance 0.08 × 1.8 × 1.5 × 1.1 = 0.238 a day, about 1.3 bookings a week (target 1–2; the cap is 2). Intercepts at 0.3 per DM to another soldier, at most one a day per unit: 1.5 a week for five DMs on five days, 1.17 on two days (target ≤ 2).
- **Sparring (500 bouts per cell over the six roles; commander win rate).** Level-1 soldier: `average` none 0 %, `one_arm` 18 %, `first_blood` 31 %, `blindfold` 20 %; `fit` 77 / 66 / 74 %; `hardened` ≥ 96 %; `frail` and `slight` never win. Level-5 soldier: `average` ≤ 1 %, `fit` 14–31 %, `hardened` 46–70 %. Target met: no handicap wins for an average commander without one; the best handicap 31 % against a level-1 soldier. The provider reads the measured band (`sparringOdds`).
- **Secrets (arithmetic).** Insight at rank 2 is 0.16 and at rank 5 the 0.4 cap, once per kept secret per scene with a low-Trust knower; a slip 0.25 per scene with an openly defiant or resentful knower; the night confession 0.1 a day with a fond knower. `held` −8 per secret caps at −16 (two secrets), for 14 days.
- **Kept as drafted:** token offer 0.03, claim 0.04, her challenge 0.03 (each × `demandMult` × `pressureMult`); a token gives the giver +1 Affinity a day; `rival_favoured`, `bond_shown`, `decor_removed`, `token_removed`, `overrode_her` and `secret_confronted` rows sit within their neighbours.

### Non-obvious things to know before touching P9c code
- **Read by field or type, never by id:** tiers by `bondTier`, lead by `leadRank`, stances and states as data lists (`hidesInjury`, `secretSlip`), defects by `pressureMult`, world options by effect type, games and stakes by `kind` / `effect`, secret kinds by `source`, rule checks by `token_wear`. The ids code names are `SECRET_NIGHT_KIND`, the P9d `WANT_VISIT_KIND` and `GATE_PROBES` entries.
- **`personal/state.ts` imports only types and tuning** so `loyalty/refusal`, `discipline/impunity`, `dms`, `night` and `hub` can read it without a cycle; keep it that way.
- **No new draw unless someone is eligible.** With no imported bond profile and no secret stored every existing seeded test stays byte-identical; the sources of secrets draw nothing. A change that moves a seeded test stops and reports.
- **Day-step order** (`personalDayStep`): drop what a dead unit held → decor → intercept cleanup → booking lapse → booking roll → claim roll → token offer, expiry, giver Affinity → her challenge, expiry → successor tracking → secret night roll. It runs on `dm_rumors`, before the day rolls over, so "tomorrow" is `day + 1`.
- **`removeFromService` calls `forgetPersonal`:** her booking and offer vanish with no deltas, her wager is void, obedience, truth and mark end, decor fades, a secret she alone knew goes and she leaves the others' `knownBy`; a worn token stays and does nothing.
- **A decision the squad votes on is not a P9c decision:** bookings, wagers and tokens are personal and have no vote gate.
- **Directive ids** are `personal:`-prefixed (`court:`, `claimed:`, `decor:`, `booking:`, `tokens`, `token_removed:`, `obedience:`, `truth:`, `mark`, `secret:`) and all derived from state every refresh; keep new ones away from the prefixes P9, P9d, P9b, P9e and P11 reserve (`tests/power/herCallDirectives.test.ts` holds the list).
- **A secret is answered once.** `secret/respond` needs the status `found`; a found, unanswered secret asks again after a reload (`app.personal.reopenSecrets`). A secret that came out by a route never writes a fact until the answer.
- **Hidden state:** a kept secret's text is a hidden sentinel (`tests/fixtures/analyze/hidden.ts`); a new reading must never show it, nor how many are kept.

### Open items
- **P12:** the sources "Debts" and "Secret Frequency" are not wired. `addSecret(draft, reg, p)` and `discoverSecret(…, 'frequency')` are exported for them.
- **Leader orders** beyond the successor secret are not built.
- **Night bookings:** a booking has the three day slots only.
- **P10b's visuals:** decor, pinned notes, the contact name and the wallpaper owner are data (`decorOf`, `pinnedNotes`, `wallpaperUnit`); this package draws only a plain list in the dossier.
- A secret that was found and never answered gives no scene-context hint; its card comes back after a reload or after the previous card is answered, but a dismissed card has no persistent entry point (a hub or SYS chip would add one).
- A hidden injury hides a low-HP state the roster may show as HP anyway; whether to blur it there is a P10b / design question.
- **Every number above and every text marked `AUTHOR TO WRITE` (kinds, stakes, games, handicap labels, contact names, notes, edit lines, token texts, secret texts, the trader event, glossary long texts) is a draft.** The real `dm_edit` wording and the main model's obedience to `personal:secret:` are checked only by hand (`docs/MANUAL_TEST_P9c.md`).
