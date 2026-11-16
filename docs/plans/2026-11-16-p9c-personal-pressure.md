# P9c Personal Pressure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Individual soldiers press on the commander in everyday life and inside the commander's own PDA:
- with enough closeness or impunity they get **device access** (decor, pinned notes, booking the commander's time, editing outgoing DMs and cancelling requests);
- they **book** the commander's slots;
- assertive ones **court** the commander and **claim** the commander in public;
- they give **tokens** the commander may wear;
- they **bet** with the commander for power (five games, stakes filtered by content categories, a day of obedience);
- the squad keeps **secrets** from the commander, which the commander can discover and confront, ignore or use.

**Architecture:**
- **Engine.** One new folder, `src/engine/personal/`, owns the rules. One file per mechanic: `state.ts` (a leaf), `gates.ts`, `access.ts`, `decor.ts`, `intercept.ts`, `bookings.ts`, `courtship.ts`, `tokens.ts`, `wagers.ts`, `obedience.ts`, `secrets.ts`, `dayStep.ts`, `index.ts`. Sparring lives in `src/engine/combat/sparring.ts` (it builds a scratch `CombatState`). Actions in `src/engine/actions/personal.ts`.
- **Hook points in existing code** (each is named in its task): `dispatch.ts` (booking-due guard), `dms.ts` and `night.ts` (courtship ×2), `relations/proposals.ts` + `actions/scene.ts` (two new answers, discovery at scene end), `actions/comms.ts` (`dm/send` with an intercept, `night/open`), `discipline/demands.ts` (the refuse path factored out), `discipline/impunity.ts` (a new term `held`), `bonds/smother.ts` (the hold books a slot), `bonds/rules.ts` (check `token_wear`), `hub.ts` (a booked slot places her), `world/expedition.ts` (run tally, bets, hidden injuries), `power/standing.ts` (successor secret), `power/votes.ts` and `dilemma/flow.ts` (overriding her under obedience), `loyalty/refusal.ts` (her obedience).
- **Data.** Six new registries: `deviceAccessRules`, `bookingKinds`, `tokenKinds`, `wagerGames`, `wagerStakes`, `secretKinds`. One optional state block `CampaignState.personal`. `TUNING.personal`. New `eventDeltas` rows for the engine event types.
- **Non-engine layer.** `src/personal/{controller,directives,deps}.ts` (`createPersonal` / `app.personal`), `src/ui/personal/` (chips, cards, the DEVICE block, the SCHEDULE block, the wager form), `src/analysis/providers/personal.ts`, `css/76-personal.css`, a `flavor` kind `dm_edit`.
- **Chunks.** They follow `docs/ROADMAP-next.md`.
  - **Chunk (a), Tasks 1–7:** device access (incl. level-4 edits), bookings, inverted courtship and `claimed`.
  - **Chunk (b), Tasks 8–12:** tokens, wagers, sparring, a day of obedience.
  - **Chunk (c), Tasks 13–16:** squad secrets, docs and hand-offs.

**Tech Stack:** TypeScript 5 (strict), esbuild, zod 3, vitest (+ jsdom for UI). No new dependencies.

**Spec:** Read these before Task 1:
- `docs/00-overview.md` (§5.4).
- `docs/packages/P9c-personal-pressure.md`.
- The **Implemented as** of P9d (bond profile, tiers, content gate, Want, rules, publicity, smother), P9b (assertiveness, voting, leader), P9e (directive rules), P9 (demands, refuse path, Impunity, record), P10 (device, voices, whereabouts, Tonight list), P7 (body stats, routes) and P7a (analysis).
- `docs/content/lore.md` §0. The spec's own text calls the commander "he/his"; **no text this package writes may do that** (Global Constraints).

## Global Constraints

- **English and safe text.** UI text goes through `h()` / `textContent`, never `innerHTML`. No pronoun for the commander in any text a player or the main model reads (lore §0); `tests/content/pronouns.test.ts` must pass. Soldiers are "she / her". Reason ids follow the same rule: the spec's `protect_him` becomes **`protect_commander`**.
- **Engine purity.** `src/engine/**` stays pure (`tests/architecture.test.ts`). `personal/state.ts` imports nothing but types, so `loyalty/refusal`, `discipline/impunity`, `dms`, `night` and `hub` can read it without a cycle.
- **The engine decides** (P1–P3). Who books, gives, challenges, claims, edits, keeps a secret or lets it slip, and every game's result, are engine computations from the campaign rng. P9c adds **no new intent** and does not change the `intent_extract` input. The model only words things (`flavor` kind `dm_edit`) and plays directives.
- **Bond gate (acceptance 7).** Every per-unit initiative of this package (decor, notes, bookings, edits, courtship, `claimed`, token offers, her wager challenges, the commander's challenges) needs **an imported bond profile** (`unit.bond !== undefined`) plus the mechanic's own test (Task 1). A unit with no imported profile, a grunt, and a modest card that fails the test never take part. Squad secrets are collective and are the one exception (Task 13).
- **Read by field, never by id.** Tiers by `bondTier`, lead by `leadRank`, stances and states only as data lists in registries, defects by field (`pressureMult`), world options by effect type (`squad_power`), stakes and games by `effect` / `kind`, secret kinds by `source`. The only ids code names are the `WANT_VISIT_KIND`-style constants this package defines (`SECRET_NIGHT_KIND`).
- **Content categories (user).** Level-4 intercepts and the rule `no_other_tokens` need `jealousy_games`; REFUSE PUBLICLY on a `claimed` needs `public_humiliation`; `wagerStakes` join `CONTENT_GATED_REGISTRIES` and carry tags per entry (core: `her_mark` → `body_modification`; the rest untagged). Bookings, decor, notes, tokens and secrets stay ungated. Every gate goes through `contentAllowed(state, reg, entry, unitId)`, so her own limits hold too.
- **Rng discipline.** No new draw unless someone is eligible: with no imported bond profile in the squad and no secret stored, every existing seeded test stays byte-identical. Sources of secrets are deterministic (no draw). A task whose change moves an existing seeded test **stops and reports** (CLAUDE.md), unless the test sets up an eligible unit on purpose; then update the expectation and say so in the commit body.
- **Assertiveness.** Every frequency here (booking, token offer, her challenge, claim, intercept) is multiplied by `assertiveness(state, reg).demandMult` (P9b) and by her `pressureMult` (Task 1).
- **Old saves.** Every new field is optional; the version stays 1. Absent `personal` = nothing booked, given, wagered or kept. `Relation`, `Fact` and P3 semantics are unchanged (a squad secret is not a `Fact` until the commander learns it, Task 13).
- **Ids.**
  - Directive ids start with `personal:` and never with a prefix P9, P9d, P9b or P11 reserve (`tests/power/herCallDirectives.test.ts` holds the list; Task 6 extends it).
  - Engine event types (never offered to the model, added to `ENGINE_EVENT_TYPES`, each with an `eventDeltas` row): `overrode_her`, `decor_removed`, `rival_favoured`, `bond_shown`, `token_removed`, `secret_confronted`.
  - Reserved (emitted) event types: listed per task; each joins `RESERVED_EVENT_TYPES`.
  - Glossary ids: `device_access`, `booking`, `courtship`, `claimed`, `token`, `wager`, `obedience`, `squad_secret`, `setting_dm_edit_wording`.
- **Analysis (overview P12).** Every new stat, chip, option and card carries `data-analyze`; the six registries join `DESCRIBED_REGISTRIES`; live values get a provider in `src/analysis/providers/personal.ts` that reads through `Knowledge`. A kept secret's text is a hidden sentinel (`tests/fixtures/analyze/hidden.ts`).
- **Drafts.** Every number below is a draft in `TUNING.personal`; every authored text is marked `AUTHOR TO WRITE`.
- **Build output.** `npm test` rebuilds `dist/index.js` and `style.css`; commit both with every task. Baseline before Task 1: 307 files, 5277 tests, all passing.

## Where the plan rules on the spec (read before Task 1)

Rulings marked **(user)** were answered by the user on 2026-11-16. Task 16 copies all of them into the spec's **Implemented as**.

### Gates and frequencies
- **Who may take part** (`pressureGate(state, reg, unitId, mechanic)` → `string | null`, the reason). Always: named, living, `unit.bond` present. Then per mechanic (`TUNING.personal.gates`, draft):
  - `device`: `leadRank ≥ 1` (balanced); the level itself comes from `deviceAccessRules`.
  - `booking`: device access ≥ 3.
  - `intercept`: device access 4 and `jealousy_games` allowed for her.
  - `courtship`: `leadRank ≥ 2`, romance on (`intimacyOf`), and her tier is `romantic` or a romantic proposal kind is open to her (`stateForProposal` succeeds for one of `ROMANTIC_PROPOSALS`).
  - `claim`: `courtship` + tier `romantic` + no `affair` on her relation.
  - `token`: tier `close` or `romantic`, `attachment ≠ 'avoidant'`, Affinity ≥ 50.
  - `wager` (her challenge, or the commander's challenge of her): `leadRank ≥ 1`, and Affinity ≥ 20 or Impunity ≥ 50.
- **Amplifier.** New optional defect field `pressureMult` (number 1…2). `pressureMultOf(state, reg, unitId)` is the product over her defects (draft: `possessive_protocol` 1.5, `dominance_drive` 1.5). It multiplies her booking, token, claim and challenge chances and the deltas of `rival_favoured`, `token_removed` and `overrode_her` toward her (`applyEventToUnit(…, { scale })`).

### Device access (§1)
- **Derived, never stored:** `deviceAccess(state, reg, unitId): 0|1|2|3|4` is the highest `deviceAccessRules` level whose `anyOf` has a branch that holds, or 0 when the `device` gate fails. Capabilities are **cumulative** (a level-4 unit may also decorate); a level never grants a higher level's capability (acceptance 1).
- **Branch fields** (all optional, all must hold): `tiers` (`romantic`/`close`), `states` (relationship state ids, data only), `minLeadRank`, `minImpunity`, `minAffinity`. Draft table (registry, author-owned):
  - L1 Decor: `{ tiers: [close, romantic], minLeadRank: 1 }` or `{ states: [friend], minLeadRank: 1 }`.
  - L2 Notes: `{ tiers: [close, romantic], minLeadRank: 1 }`.
  - L3 Calendar: `{ tiers: [romantic], minLeadRank: 2 }` or `{ minImpunity: 60, minLeadRank: 1 }`.
  - L4 Messages: `{ tiers: [romantic], minLeadRank: 3 }` or `{ minImpunity: 75, minLeadRank: 3 }`.
- **Decor (L1)** is stored per unit: `personal.decor[unitId] = { since, parts: ('sticker'|'wallpaper'|'contact')[], contactName, fadedUntil? }`. The day step places it the first day she has L1 (no draw: all three parts; `contactName` from the L1 entry's `contactNames` by `fnv1a(unitId)`). The wallpaper belongs to one unit at a time: the decorated unit with the highest Affinity; the others keep sticker and contact.
- **Peeling** (`device/remove_decor { unitId, part }`) removes the part, applies `decor_removed` (minor) to her, stores `removedDay` (derived directive `personal:decor:<unitId>` in her scenes for that day and the next). She does not put a peeled part back for 7 days (`TUNING.personal.decor.regrowDays`).
- **Break-up:** when her access falls to 0, the decor gets `fadedUntil = day + 7` (`TUNING.personal.decor.fadeDays`), stays visible as faded and is deleted after it. Access coming back clears `fadedUntil`.
- **Notes (L2)** are derived: `pinnedNotes(state, reg)` → per unit with access ≥ 2: her active rules (`rulesOf`, P9d) and one line of the L2 entry's `notes` picked by `fnv1a(day|unitId)`. Nothing stored. P10b draws decor and notes; this package draws only a plain list in the dossier.

### Level-4 intercepts (§1) (user: LLM rewrite, DMs to others)
- **What she touches.** A DM the commander sends to **another** soldier; a Leash request (`app.fileLeash`); a grunt recruit order (`base/recruit_grunt`).
- **Roll.** `device/intercept { channel: 'dm'|'leash'|'recruit', toUnitId? }` picks the editor: among units passing the `intercept` gate, not edited today (`personal.intercepts.log`, ≤ 1 a day per unit) and, for a DM, not the recipient, the one with the highest Impunity (ties: squad order). No editor → no draw, `{ type: 'device_intercept', hit: false }`. Else one draw: `chance = min(cap, TUNING.personal.intercept.chance /*0.3*/ × demandMult × pressureMult)`. A hit stores `personal.intercepts.open = { id, unitId, channel, toUnitId?, day }` and logs the day.
- **Text.** The app words the DM with `flavor` kind `dm_edit` (setting `dmEditWording`, default on); the fallback is the L4 entry's `editLines` (`{text}` = the original, `{name}` = her name). The engine never stores the edited text until it is sent.
- **KEEP / REVERT.** `device/resolve_intercept { id, keep }`:
  - KEEP: the intercept closes; for a DM the app then sends the edited text with `dm/send { …, interceptId }`, which stores `DmMessage.editedBy = unitId`; for a request, nothing is filed.
  - REVERT: `overrode_her` (moderate) on her + `addRecord(+TUNING.personal.overrideRecord /*3*/, 'override')`; the app sends the original / files the request.
  - A pending intercept is dropped at day end with no effect (the app was closed).

### Bookings (§2)
- **Kinds.** Registry `bookingKinds` (`slot`: morning/afternoon/evening, `locationId`, `tier?`, `text` with `{name}`, `wantRelief`, `weight`). Draft: `evening_with_me` (evening, her quarters, 15), `train_together` (afternoon, training yard, 5), `roof_walk` (evening, roof, romantic, 15).
- **Roll.** Day step: each unit passing the `booking` gate, not restricted (`restrictionReason(state, id, 'scene') === null`), under the weekly cap (`perWeek` 2) and with no open booking, draws once: `chance = base /*0.08*/ × (1 + Affinity/100) × (1 + wantOf/100) × (Impunity/50) × demandMult × pressureMult`, capped at 0.5. A hit draws once more to pick the kind by weight among those her tier allows and books **tomorrow** (`draft.day + 1`, the day step runs before the rollover) at the kind's slot. She DMs it (`pushMessage`, the kind's `text`). Event `booking_made`.
- **Double booking.** A second booking of the same day and slot marks both `conflict: true` (event `booking_conflict`). `booking/resolve { bookingId }` keeps that one; the other is cancelled with `rejected_advance` (moderate) on her. `booking/resolve { day, slot, settle: true }` lets them settle it: the winner has the higher `attachmentRank + leadRank` (intense 3, steady 2, slow 1, avoidant 0), then the higher Impunity, then squad order (no draw); the loser gets stress +10 (`TUNING.personal.booking.settleStress`). An unresolved conflict settles itself when its slot comes.
- **The slot belongs to her.** While a booking of the current day and slot is `booked` and playable (`bookingPlayable`), `dispatch` refuses `activity/`, `expedition/start`, `calendar/consume_slot` and a `scene/start` without her, with `{ code: 'booking_due', message: '{Name} has booked this slot: go to her or cancel it.' }`. `endSlotBlock` says the same.
- **At slot time** the controller (at `slot_advanced`, and on load) dispatches `booking/play { bookingId }`, which marks it `played`, relieves Want by the kind's `wantRelief` and returns the scene payload (her location, origin `event`, participants [her]); the controller starts the scene. A booking that cannot be played (she is restricted, injured or away, or the slot passed during a run) lapses at day end with no deltas.
- **Cancel** (`booking/cancel { bookingId }`, any time before it is played) is the P9 refuse path: `refuseLikeDemand(draft, ctx, unitId, evidence)` factored out of `answerDemand` (`refused_demand` moderate, ×1.5 at Impunity ≥ 50 with a held moderate defiance, deed `demands_refused`). A wagered booking (`source: 'wager'`) also costs `broke_promise` (moderate).
- **Smother.** `startSmother` also books her the next slot (`source: 'smother'`, kind = the first `evening` kind, or the next slot's kind). The bonds controller's own `onSlotAdvanced` opening is removed: the booking opens the scene. The hangar lock (`smotherRefusal`) stays as is.
- **Whereabouts.** In her booked slot `whereabouts` places her in the room whose `sceneLocationId` is the booking's location, reason `routine` (no new reason, no draw).
- **No vote.** Bookings, wagers and tokens are personal: no vote gate.

### Inverted courtship and `claimed` (§3)
- **×2.** For a unit passing the `courtship` gate, `initiativeChance` (DMs) and her night-spec chances in `rollNight` are multiplied by `TUNING.personal.courtship.initiativeMult` (2), and her scenes get the derived directive `personal:court:<unitId>`: `{Name} takes the initiative with the commander; she may propose the next step herself.`
- **Her proposals get three chips** while she passes the gate: `[ACCEPT] [DEFLECT] [SET A CONDITION]` (others keep P3's chips).
  - `deflect` = `not_now` (no deltas; the proposal closes).
  - `accept_condition` + `condition` (1–160 chars, cleaned): records **her** promise (`recordPromise`, `by: unitId`, `to: 'commander'`, the condition, `knownBy` [her]), then accepts as `accept`. Event `proposal_conditioned`.
- **`claimed`.** Day step: each unit passing the `claim` gate, not claimed in the last 14 days, draws once: `0.04 × demandMult × pressureMult`. A hit:
  1. `setPublicity(draft, reg, unitId, 'public', { cause: 'claimed' })`;
  2. stores `personal.claims.push({ unitId, day })` and emits `claimed`;
  3. reactions of every other named living unit with an imported bond: in a `romantic` tier → `rival_favoured` (major); otherwise with `ingroup ≥ 1` or tier `close` → `bond_shown` (minor); others nothing. Each ×her own `pressureMult` where it applies.
- **The commander's answer** (card): `[LET IT STAND]` always; `[REFUSE PUBLICLY]` only while `public_humiliation` is allowed for her: `courtship/refuse_claim { unitId }` → `rejected_advance` (major) on her, stress +8; publicity stays public.
- Directive `personal:claimed:<unitId>` (derived: a claim today or yesterday, she is present with someone else): `{Name} has made it plain to everyone that the commander is hers.`

### Tokens (§4)
- **Registry** `tokenKinds` (`label` with `{name}`, `description`, `minTier?`, `weight`). Draft six: dog tag, patch, ribbon, plyx ring, cartridge pendant, knotted cord.
- **Offer.** Day step: a unit passing the `token` gate who has never given a token (one per unit, ever) draws `0.03 × demandMult × pressureMult`; a hit draws the kind by weight and opens `personal.tokens.offer` (one open offer in the squad) delivered as her DM. `token/answer { offerId, accept }`: accept puts it in `personal.tokens.owned` (not worn); decline = `rejected_advance` (minor). An offer expires after 3 days as declined.
- **Wearing.** `token/wear { tokenId }` (≤ 2 worn, `TUNING.personal.token.maxWorn`), `token/remove { tokenId }`.
  - Wearing: reactions as for `claimed` (rival `rival_favoured` moderate, others `bond_shown` minor), and the rule check `token_wear` (below).
  - While worn: the giver's Affinity +1 a day (day step, `applyRelationDelta`, source `token`).
  - Removing a worn token: `token_removed` (moderate, ×her `pressureMult`) on the giver and the derived directive `personal:token_removed:<giverId>` for that day and the next. A token whose giver is gone stays and does nothing.
- **Rules.** New `relationshipRuleTemplates.check` value `token_wear`. While her rule is active, wearing a token from anyone else is `rule_broken_by_check` (P9d path). `no_other_tokens` switches from `intent` to `token_wear` and gets `contentTags: ['jealousy_games']` (user).
- **Visibility.** CMDR dossier TOKENS block; derived directive `personal:tokens` in every scene: `The commander wears {label}[ and {label}].`; the providers.

### Wagers (§6)
- **Registries.** `wagerGames` (`kind`: `coin`|`rps`|`high_card`|`sparring`|`expedition_bet`; sparring carries `handicaps[]`; `spendsSlot`). `wagerStakes` (`effect`: `obedience`|`slot`|`privilege`|`drop_demand`|`token`|`question`|`mark`, `contentTags?`, `text`, `description`). `wagerStakes` joins `CONTENT_GATED_REGISTRIES` with a `GATE_PROBES` probe.
- **Who.** Her challenge: day step, a unit passing the `wager` gate with no open wager draws `0.03 × demandMult × pressureMult`; a hit draws a game and a stake from those `stakeOffered` allows; delivered as her DM with `[ACCEPT] [DECLINE]`. The commander's challenge: `wager/challenge { unitId, gameId, stakeId }` from the dossier; she accepts when Affinity ≥ 0 or Impunity ≥ 40, else refuses (event `wager_refused`, nothing else). Declining her challenge = `dismissed` (minor).
- **Stakes offered** (`stakeOffered(state, reg, unitId, stake)`): `contentAllowed` holds for her, and the effect is possible (`drop_demand` needs an open demand of hers that `grantProblem` lets through; `token` needs a token she could give or has given; `slot` needs her booking gate).
- **Games** (`wager/play { wagerId, pick? }`): `coin` (one draw, 0.5); `rps` (the commander picks; her hand one draw; a tie draws once more, a second tie voids); `high_card` (two draws 1–13; a tie voids); `sparring` (Task 10); `expedition_bet` (Task 10). No social stat tilts a game.
- **Stakes** (`applyStake(draft, ctx, wager, winner)`), both sides:
  - `obedience`: the loser follows the winner for the rest of that day (`personal.obedience = { unitId, day, who }`, Task 11).
  - `slot`: she wins → a booking of hers for tomorrow (`source: 'wager'`); the commander wins → she cannot book the commander for 7 days.
  - `privilege`: she wins → `addRecord(+6)`; the commander wins → `addRecord(−6)`.
  - `drop_demand`: she wins → her open demand is granted (its costs paid; refused if unpayable, so the stake is only offered when payable); the commander wins → it closes with no refusal deltas.
  - `token`: she wins → her token (given now if she never gave one) is worn and locked for 7 days (`lockedUntil`; early removal adds `broke_promise`); the commander wins → she gives a token now (no offer step).
  - `question`: the winner asks one question, answered truthfully. She wins → the app asks the commander for an answer (`wager/answer_question { wagerId, text }`, 1–200 chars) → a fact `about [her]`, known by her. The commander wins → the commander types the question; the derived directive `personal:truth:<unitId>` tells her to answer it truthfully in her next scene or DM reply; her reply is stored as a fact by `wager/record_answer` (the controller, first reply only).
  - `mark` (`her_mark`, tags `body_modification`): she wins → the commander bears her mark for 3 days (`personal.mark = { unitId, untilDay }`; dossier line, derived directive `personal:mark`); the commander wins → nothing beyond her stress +3.

### Sparring and expedition bets (§6)
- **Sparring runs on the P4 engine** (`sparringBout(state, reg, rng, unitId, handicapId)`): a scratch `CombatState` with the commander as one squad-side combatant (`commanderSparrer`: `hp = commanderMaxHp`, `atk 6 + 3·strength`, `def 4 + 2·endurance`, `spd 6 + 2·reflexes`, `crit 5`, skill `TUNING.personal.sparring.commanderSkill`) and her through `spawnMutineer`, her base stats multiplied by the handicap. AUTO, `runUntilInput` until an outcome or 20 rounds (a draw goes to her). Nothing of the scratch combat is stored; only the rng advances. It spends one slot and gives the commander strength XP (`addBodyXp`, 0.5 of a session).
- **Handicaps** are data on the sparring game: `{ id, label, herAtk, herHp, herSpd, minAffinity }`; the commander picks one her Affinity allows. Draft: `none` (1/1/1, −100), `one_arm` (0.5/1/1, −100), `first_blood` (1/0.25/1, 20), `blindfold` (0.7/1/0.5, 40). Target after the balance step: no handicap ≤ 5 % for an `average` body against a level-1 soldier; the best handicap 25–40 %.
- **Expedition bet.** `pick`: `kills` (she lands ≥ 3 killing blows), `no_damage` (she takes no damage), `objective` (the run's objective is done). She bets it happens. It waits as `pending_run` and resolves at the next `endExpedition` with her in the party; void after 7 days or if she is gone. `ExpeditionState.tally?: Record<unitId, { kills: number; hits: number }>` is accumulated in `resolveCombat` from the combat log (as `recordMerit` reads it).

### A day of obedience (§6) (user: her own business only)
- `personal.obedience = { unitId, day, who: 'commander'|'unit' }`, valid while `day === state.day`.
- **The commander obeys her.** Her pick is pre-selected for: her open demand (GRANT), her bookings (keep), her proposals (ACCEPT), the open dilemma (`herPick`: the enabled option whose `unit_event` effects on her sum the highest Trust + Affinity through `computeDeltas`; none touching her → no pick), a squad vote (her ballot: `against` pre-selects DROP). Choosing otherwise applies `overrode_her` (moderate) + record +3, in the engine (`refuseLikeDemand`, `booking/cancel`, `proposal/answer`, `dilemma/choose`, `carryVote`). Activities, base and expeditions are untouched.
- **She obeys the commander.** That day: `refusalChance` is 0 for her, `openDemand` returns null for her, she does not book, claim, offer, challenge or countermand, and the derived directive `personal:obedience:<unitId>` says `{Name} follows the commander's non-combat orders today.`

### Squad secrets (§5) (user: Impunity down + directive)
- **Not a `Fact` while kept.** `personal.secrets[]`: `{ id, kindId, text, subjectId?, knownBy: unitId[], reason: 'protect_commander'|'self_interest'|'leader_order', day, status: 'kept'|'found'|'confronted'|'pretend'|'used', foundRoute?, foundDay?, usedUntil? }`. P3's "the commander always knows a fact" stays true; on discovery a fact is written.
- **Sources (v1, deterministic, no draw):**
  - `hidden_injury`: at `endExpedition`, a party unit at ≤ 25 % HP whose command stance has `hidesInjury: true` (data on `commandStances`, draft `defiant_loyal`, `fearful`) → `knownBy` the other named party members, reason `protect_commander`.
  - world effect `squad_secret { kindId, knownBy: 'party'|'squad' }` for authored events (one new authored expedition event uses it: a trader deal, reason `self_interest`).
  - `successor`: the power day step, the first day a leader has held 7 days → "the squad has settled on {leader} to take over if the commander falls", known by every named living unit, reason `leader_order`.
  - P12 (Debts) and leader orders beyond the successor are open items; `addSecret(draft, reg, p)` is exported for them.
- **Directive** `personal:secret:<secretId>` while a knower is present and the status is `kept` or `pretend`: `{names} know that {text} They do NOT reveal it to the commander, whatever is asked.`; for `used`: `The commander knows that {text} and can hold it over {names}.`
- **Discovery routes** (`discoverSecret(draft, ctx, secretId, route)`; each draws only when a kept secret's knower qualifies):
  - `insight`: at `scene/end`, per kept secret with a present knower whose Trust < 40: one draw, `0.08 × socialRank('insight')` (cap 0.4).
  - `slip`: at `scene/end`, a present knower whose command stance or relationship state has `secretSlip: true` (data: `open_defiance`; `resentful`): one draw, 0.25.
  - `night`: day step, a knower with Affinity ≥ 60 and Trust ≥ 50: one draw, 0.1 → a night entry `SECRET_NIGHT_KIND`; `night/open` on it discovers the secret.
  - `frequency` (P12): exported, not wired.
- **The answer** (`secret/respond { secretId, choice }`):
  - `confront`: `addRecord(−5)` for every knower; `secret_confronted` (minor) on every named living unit; a public fact.
  - `pretend`: a fact known by nobody but the commander (`knownBy: []`, tag `secret`); the directive stays as for `kept`.
  - `use`: `usedUntil = day + 14`; a fact known by the knowers; her Impunity gets the new term **`held` = −8 per used secret she knows, at least −16** while it lasts (`ImpunityTerms.held`, the P9 provider shows it).
- **Hidden.** A kept secret's text never reaches a reading, a toast or a log line; the provider of `glossary:squad_secret` lists only found ones.

## File Structure

```
content/core/{deviceAccessRules,bookingKinds,tokenKinds,wagerGames,wagerStakes,secretKinds}.json   new registries (+ manifest)
content/core/{eventDeltas,glossary,defects,commandStances,relationshipStates,relationshipRuleTemplates,dilemmaTemplates}.json   rows, fields, one authored event
src/content/{types,schemas,refs}.ts       registry names, schemas, refs, RESERVED_EVENT_TYPES, DESCRIBED_REGISTRIES, world effect squad_secret, check token_wear
src/engine/state/types.ts                 PersonalState and its records, DmMessage.editedBy, CampaignState.personal
src/engine/world/types.ts                 ExpeditionState.tally
src/engine/tuning.ts                      TUNING.personal
src/engine/relations/vocab.ts             ENGINE_EVENT_TYPES (+6)
src/engine/personal/*.ts                  the rules (state, gates, access, decor, intercept, bookings, courtship, tokens, wagers, obedience, secrets, dayStep, index)
src/engine/combat/sparring.ts             commanderSparrer, sparringBout
src/engine/actions/personal.ts            every new action; the day step on dm_rumors
src/engine/{dispatch,dms,night,hub}.ts    booking-due guard; courtship ×2; whereabouts
src/engine/relations/proposals.ts, actions/scene.ts, actions/comms.ts   deflect / accept_condition; discovery at scene end; dm/send interceptId; night/open
src/engine/discipline/{demands,impunity}.ts, loyalty/refusal.ts, bonds/{smother,rules}.ts, power/{standing,votes}.ts, dilemma/flow.ts, world/expedition.ts   hooks
src/personal/{controller,directives,deps}.ts   createPersonal / app.personal, personalDirectives
src/llm/calls/flavor.ts                   kind dm_edit
src/ui/personal/{deviceBlock,schedule,chips,claimCard,tokens,wagerForm,wagerCard,secretCard}.ts
src/ui/{comms/commsTab,squad/squadTab,commander/cmdrCard,ops/opsTab,hub/model,proposalChips}.ts, src/ui/voice/sources.ts, src/app.ts, src/settings.ts
src/analysis/providers/personal.ts        providers; tests/fixtures/analyze/hidden.ts sentinel
css/76-personal.css
docs/MANUAL_TEST_P9c.md, docs/{00-overview,CONTENT,ROADMAP-next}.md, docs/packages/{P9c,P9d,P9b,P10,P10b,P12,P13}-*.md, CLAUDE.md
tests/engine/personal/*.test.ts, tests/engine/combat/sparring.test.ts, tests/content/p9c*.test.ts, tests/personal/*.test.ts, tests/ui/personal*.test.ts, tests/analysis/personalProviders.test.ts
```

## Review Focus

1. **A booking's slot arrives while the scene cannot open** (she was confined after booking, is injured, or the commander is on a run that spans the slot). The guard must not lock time: `booking_due` applies only while she can be met (`bookingPlayable`), and a booking that cannot be played lapses with no deltas. Test in Task 4 (`a booking she cannot keep never blocks the slot and lapses free`).
2. **The chat is switched or reloaded between an intercept and KEEP/REVERT, or between `booking/play` and the scene start.** An intercept is stored; after a reload the chip comes back from `personal.intercepts.open` with a freshly worded text (or the fallback line); a played booking with no scene is not replayed. Tests in Task 3 (`an open intercept survives a reload and closes once`) and Task 6 (`the controller never opens a booking scene twice`).
3. **A unit leaves (dies, deserts, is terminated) while she holds a booking, a decor, an offer, an open wager, an obedience day or a secret.** Her booking and offer vanish with no deltas, her decor fades, her wager is void, her obedience ends; a secret she alone knew is dropped; her worn token stays but does nothing. `removeFromService` calls `forgetPersonal`. Test in Task 1 (`forgetPersonal clears everything she held`) and Task 13.
4. **A category is switched off while something under it is open** (an intercept, an `her_mark` stake offered or won, a `no_other_tokens` rule). It is withdrawn quietly like P9d's (no deltas); a running mark ends. Test in Task 9 (`switching body_modification off withdraws the mark stake and ends a mark`) and Task 3.
5. **A pre-P9c save, or a squad with no imported bond profiles.** It loads and plays exactly as before: no draw, no booking guard, no new directive, P3's proposal chips. Test in Task 1 (`a squad without imported bonds draws nothing and changes nothing over 10 days`).

---

## Chunk (a) — Device access, bookings, courtship

### Task 1: Personal state, gates, tuning and engine event types

**Files:**
- Create: `src/engine/personal/{state,gates,index}.ts`, `tests/engine/personal/gates.test.ts`
- Modify: `src/engine/state/types.ts` (`PersonalState` and records, `DmMessage.editedBy?`, `CampaignState.personal?`), `src/engine/tuning.ts` (`TUNING.personal`), `src/engine/relations/vocab.ts` (`ENGINE_EVENT_TYPES` + the six), `content/core/eventDeltas.json` (six rows), `content/core/defects.json` (`pressureMult` on the two P9d defects), `src/content/schemas.ts` (defect field `pressureMult: number 1..2 optional`), `src/engine/leash/use.ts` (`removeFromService` calls `forgetPersonal`), `src/engine/personal/dayStep.ts` (new; `personalDayStep`, which for now only calls `forgetPersonal` for a dead unit that still holds something; every reader also ignores a unit who is not living), `src/engine/actions/personal.ts` (new; registers `personalDayStep` on `dm_rumors`, imported after `./bonds`), `src/app.ts` (imports it)

**Interfaces:**
- Produces:
  - Types `PersonalState { seq; decor?; intercepts?: { open?: Intercept; log: Array<{ unitId; day }> }; bookings?: Booking[]; noBookUntil?: Record<string, number>; claims?: Array<{ unitId; day; refused?: true }>; tokens?: { owned: Token[]; offer?: TokenOffer; given: string[] }; wagers?: { open: Wager[]; log: WagerLogEntry[] }; obedience?: { unitId; day; who: 'commander'|'unit' }; truth?: { unitId; wagerId; question: string }; mark?: { unitId; untilDay }; secrets?: SquadSecret[] }` with the record shapes of the rulings.
  - `personalOf(draft): PersonalState` (creates on first write), `forgetPersonal(draft, unitId): void` (in `state.ts`, no engine imports).
  - `personalDayStep(draft, ctx): EngineEvent[]` on `dm_rumors`, after bonds; later tasks add their parts in this order: decor → intercept cleanup → booking lapse, roll → claim roll → token offer, expiry, giver Affinity → her challenge, expiry → secret night roll → obedience expiry.
  - `pressureGate(state, reg, unitId, mechanic: 'device'|'booking'|'intercept'|'courtship'|'claim'|'token'|'wager'): string | null`; `pressureMultOf(state, reg, unitId): number`. The `booking`/`intercept` branches call `deviceAccess` (Task 2); until then they return `'no device access'`.
  - `TUNING.personal` with every draft number of the rulings (`gates`, `decor`, `intercept`, `booking`, `courtship`, `claim`, `token`, `wager`, `sparring`, `bet`, `obedience`, `secret`, `overrideRecord`), frozen like the other blocks.
  - `eventDeltas` rows (draft; checked against neighbours in Task 7): `overrode_her` (minor −1/−2/2 · moderate −2/−3/4 · major −3/−5/6 · extreme −5/−8/8, trust/affinity/stress), `decor_removed` (affinity −3, stress 2 at minor), `rival_favoured` (minor −1 aff/2 str · moderate −2/4 · major −4/6), `bond_shown` (minor affinity +1), `token_removed` (moderate affinity −4, stress 3), `secret_confronted` (minor trust −1, affinity −2).

- [ ] **Step 1: Write the failing tests** in `gates.test.ts` (helpers `campaign`, `setRelation`, `withBond`, `withStance`):
  - `a unit without an imported bond passes no gate` (MODEST card in a `lover` state, Affinity 90: every mechanic returns a reason)
  - `a grunt passes no gate`
  - `courtship needs leadRank 2 and romance on`; `claim also needs the romantic tier and no affair`
  - `token needs a close or romantic tier, no avoidant attachment and Affinity 50`
  - `wager needs leadRank 1 and Affinity 20 or Impunity 50`
  - `pressureMult multiplies over defects that carry it and is 1 otherwise`
  - `forgetPersonal clears everything she held` (Review Focus 3: booking, offer, open wager, obedience, decor gets `fadedUntil`, a secret she alone knew goes, a secret others know drops her from `knownBy`)
  - `a squad without imported bonds draws nothing and changes nothing over 10 days` (Review Focus 5): end ten days with `endDay` on a fixed seed; `personal` stays absent and the final `rng` equals a literal captured by running the same script on the baseline commit (`fca1105`) before any change
  - `the six new engine event types are not offered to the model and each has an eventDeltas row`
- [ ] **Step 2: Run** `npx vitest run tests/engine/personal/gates.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement** the types, `state.ts`, `gates.ts`, the tuning block, the vocabulary, the rows and the defect field.
- [ ] **Step 4: Run** the tests, then `npm test`. Expect PASS.
- [ ] **Step 5: Tick and commit:** `feat(personal): state, bond gates, tuning and engine event types`.

### Task 2: Device access levels, decor and notes

**Files:**
- Create: `src/engine/personal/{access,decor}.ts`, `content/core/deviceAccessRules.json`, `tests/engine/personal/access.test.ts`, `tests/content/p9cSchemas.test.ts`
- Modify: `src/content/types.ts` (`deviceAccessRules` in `REGISTRY_NAMES`), `src/content/schemas.ts` (`DeviceAccessRuleSchema`, `DESCRIBED_REGISTRIES`), `src/content/refs.ts` (`states[]` → `relationshipStates`), `content/core/manifest.json`, `src/engine/actions/personal.ts` (`device/remove_decor`), `src/engine/personal/dayStep.ts` (decor placement and fading)

**Interfaces:**
- Consumes: Task 1; `bondTierOf`, `leadRank`, `impunityOf`, `fnv1a`, `rulesOf`.
- Produces:
  - Schema `DeviceAccessRule { id; level: 1..4; name; description; anyOf: Array<{ tiers?; states?; minLeadRank?; minImpunity?; minAffinity? }> /* ≥1 */; contactNames?: string[] /* L1 */; notes?: string[] /* L2 */; editLines?: string[] /* L4, must contain {text} */ }`; exactly one entry per level 1–4.
  - `deviceAccess(state, reg, unitId): 0|1|2|3|4`; `accessCan(state, reg, unitId, capability: 'decor'|'notes'|'calendar'|'messages'): boolean`.
  - `decorOf(state, unitId): Decor | null` (null after `fadedUntil`), `wallpaperUnit(state): string | null`, `pinnedNotes(state, reg): Array<{ unitId; lines: string[] }>`.
  - `removeDecor(draft, ctx, unitId, part): EngineEvent[]`; action `device/remove_decor { unitId, part }`; events `decor_placed`, `decor_faded`, `decor_removed_by_commander` (reserved).
  - `personalDayStep` gains its decor part (placement, wallpaper owner, fading).

- [ ] **Step 1: Write the failing tests.**
  - `access derives from the table: a balanced friend is 1, a balanced confidant 2, an assertive lover 3, a dominant lover 4` (acceptance 1)
  - `Impunity 60 gives a balanced unit level 3; 75 needs a dominant one for level 4`
  - `a level never grants a higher level's capability` (`accessCan` matrix over levels 0–4)
  - `the day step places decor once with all three parts and one wallpaper owner` (the highest Affinity)
  - `peeling a sticker applies decor_removed and it does not regrow for 7 days`
  - `access falling to 0 fades decor for 7 days, then it is gone; access coming back clears the fade`
  - `notes list her active rules and one authored line, the same all day`
  - Schema tests in `p9cSchemas.test.ts`: `one rule per level`, `editLines need {text}`, `states must name relationshipStates`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/personal/access.test.ts tests/content/p9cSchemas.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement.** Draft content: the four entries of the rulings, three `contactNames` (`★ {name}'s`, `{name} ♥`, `MINE — {name}`), three `notes`, three `editLines` (`{text} — {name} added this.` style), all `AUTHOR TO WRITE`.
- [ ] **Step 4: Run** the tests, then `npm test`. Expect PASS.
- [ ] **Step 5: Tick and commit:** `feat(personal): device access levels, decor and pinned notes`.

### Task 3: Level-4 intercepts (engine)

**Files:**
- Create: `src/engine/personal/intercept.ts`, `tests/engine/personal/intercept.test.ts`
- Modify: `src/engine/actions/personal.ts` (`device/intercept`, `device/resolve_intercept`), `src/engine/actions/comms.ts` (`dm/send` takes `interceptId?` and stores `editedBy`), `src/engine/bonds/content.ts` (`withdrawTagged` drops an open intercept when `jealousy_games` goes off), `src/engine/personal/dayStep.ts` (drops a stale intercept, trims the log)

**Interfaces:**
- Consumes: Tasks 1–2; `contentAllowed`, `addRecord`, `applyEventToUnit`, `assertiveness`.
- Produces:
  - `interceptEditor(state, reg, channel, toUnitId?): string | null` (pure)
  - `rollIntercept(draft, ctx, p: { channel; toUnitId? }): EngineEvent[]` → `device_intercept { hit, interceptId?, unitId? }`
  - `resolveIntercept(draft, ctx, id, keep): EngineEvent[]` → `intercept_resolved { id, unitId, channel, keep }`
  - `dm/send { unitId, text, interceptId? }`: with an id it must be a kept intercept of today for that recipient (stored as `kept` until used once), else it throws `That edit is not waiting to be sent.`
  - Reserved: `device_intercept`, `intercept_resolved`.

- [ ] **Step 1: Write the failing tests.**
  - `no editor: no draw` (rng state unchanged)
  - `a dominant lover with jealousy_games on intercepts a DM to another soldier, never one to herself`
  - `with jealousy_games off, or as her own limit, she never intercepts`
  - `at most one intercept a day per unit`
  - `KEEP closes it and dm/send stores editedBy once; a second send with the same id throws`
  - `REVERT applies overrode_her moderate and record +3` (acceptance 1)
  - `a Leash or recruit intercept KEEP files nothing; REVERT lets it through`
  - `an open intercept survives a reload and closes once` (Review Focus 2: `JSON` round-trip, resolve twice → second throws)
  - `switching jealousy_games off drops an open intercept with no deltas`
- [ ] **Step 2: Run** `npx vitest run tests/engine/personal/intercept.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests, then `npm test`. Expect PASS.
- [ ] **Step 5: Tick and commit:** `feat(personal): level-4 intercepts of DMs and requests`.

### Task 4: Bookings (engine)

**Files:**
- Create: `src/engine/personal/bookings.ts`, `content/core/bookingKinds.json`, `tests/engine/personal/bookings.test.ts`
- Modify: registry plumbing as in Task 2 (`bookingKinds`; refs `locationId` → `locations`), `src/engine/discipline/demands.ts` (export `refuseLikeDemand(draft, ctx, unitId, opts: { templateId?; evidence })`, used by `answerDemand`'s refuse branch with no behaviour change), `src/engine/dispatch.ts` (the `booking_due` guard), `src/ui/hub/model.ts` (`endSlotBlock`), `src/engine/hub.ts` (booked placement), `src/engine/bonds/smother.ts` (`startSmother` books), `src/engine/actions/personal.ts` (`booking/cancel`, `booking/resolve`, `booking/play`), `src/engine/personal/dayStep.ts` (roll, conflicts, lapse)

**Interfaces:**
- Consumes: Tasks 1–2; `restrictionReason`, `wantOf`, `relieveWant`, `impunityOf`, `pushMessage`, `whereabouts`.
- Produces:
  - `Booking { id; unitId; kindId; day; slot: Slot; status: 'booked'|'played'|'cancelled'|'lapsed'; source: 'roll'|'wager'|'smother'; conflict?: true }`
  - `bookingChance(state, reg, unitId): number`; `rollBookings(draft, ctx): EngineEvent[]`; `book(draft, ctx, p: { unitId; kindId; day; slot; source }): EngineEvent[]`
  - `dueBooking(state): Booking | null` (today, this slot, `booked`) and `bookingPlayable(state, booking): boolean` (she is named, living, not restricted for scenes, not injured, not on a run)
  - `cancelBooking`, `resolveConflict(draft, ctx, p: { bookingId } | { day; slot; settle: true })`, `playBooking(draft, ctx, id): { events; scene: { locationId; participants; origin: 'event' } }`
  - `lapseBookings(draft): EngineEvent[]` (day step; and when a slot passes with no play)
  - Reserved: `booking_made`, `booking_conflict`, `booking_resolved`, `booking_cancelled`, `booking_played`, `booking_lapsed`.

- [ ] **Step 1: Write the failing tests.**
  - `a dominant lover with high Affinity and Want books tomorrow evening and DMs it` (acceptance 2; scan seeds for a hit)
  - `chance scales with Affinity, Want, Impunity, demandMult and pressureMult; capped at 0.5`
  - `the weekly cap holds at 2; a restricted unit never books`
  - `a unit at access 2 never books` (acceptance 7)
  - `the due slot refuses activities, expeditions, END SLOT and a scene without her, with booking_due`
  - `a booking she cannot keep never blocks the slot and lapses free` (Review Focus 1)
  - `play marks it played, relieves Want by the kind and returns her location`
  - `cancel is the demand refuse path: ×1.5 and a held defiance at Impunity ≥ 50` (acceptance 2)
  - `a wagered booking cancelled also breaks a promise`
  - `two bookings of one slot conflict; choosing one gives the other rejected_advance; settling picks by attachment and lead, the loser +10 stress` (acceptance 2, both ways)
  - `an unresolved conflict settles itself when its slot comes`
  - `whereabouts place her in the booked room with reason routine`
  - `a smother books her the next slot and still locks the hangar`
  - `answerDemand refuse behaviour is unchanged` (the existing demand tests stay green)
- [ ] **Step 2: Run** `npx vitest run tests/engine/personal/bookings.test.ts tests/engine/discipline`. Expect FAIL on the new tests only.
- [ ] **Step 3: Implement.** The guard in `dispatch` sits after the dilemma guard; it reads `dueBooking` and `bookingPlayable` only (pure, no draw); a `scene/start` whose participants include her passes.
- [ ] **Step 4: Run** the tests, then `npm test`. Expect PASS. The P9d smother tests change where they asserted the bonds controller opened the scene: move those assertions to Task 6 and say so in the commit body.
- [ ] **Step 5: Tick and commit:** `feat(personal): bookings take the commander's slots`.

### Task 5: Inverted courtship and `claimed` (engine)

**Files:**
- Create: `src/engine/personal/courtship.ts`, `tests/engine/personal/courtship.test.ts`
- Modify: `src/engine/dms.ts` (`initiativeChance` × `courtshipMult`), `src/engine/night.ts` (`rollNight` × `courtshipMult` per unit), `src/engine/relations/proposals.ts` (`ProposalAnswer` + `deflect`, `accept_condition`; `answerProposal(…, { condition? })`), `src/engine/actions/scene.ts` (`proposal/answer` passes `condition`), `src/engine/actions/personal.ts` (`courtship/refuse_claim`), `src/engine/personal/dayStep.ts` (claim roll)

**Interfaces:**
- Consumes: Task 1; `setPublicity`, `recordPromise`, `stateForProposal`, `ROMANTIC_PROPOSALS`.
- Produces:
  - `courtshipMult(state, reg, unitId): number` (2 or 1)
  - `courtshipChips(state, reg, proposal): boolean` (true → the three chips)
  - `answerProposal` accepts `'deflect' | 'accept_condition'` only for a unit-made proposal of a courting unit; `accept_condition` needs `condition` (1–160 chars after cleaning) and emits `proposal_conditioned { unitId, promiseId }`
  - `rollClaims(draft, ctx): EngineEvent[]`; `claim(draft, ctx, unitId): EngineEvent[]` → `claimed { unitId, reactions: Array<{ unitId; kind: 'rival'|'respect' }> }`; `refuseClaim(draft, ctx, unitId)` → `claim_refused`
  - Reserved: `proposal_conditioned`, `claimed`, `claim_refused`.

- [ ] **Step 1: Write the failing tests.**
  - `a courting unit's DM initiative and night chances double; a balanced one's do not` (acceptance 3)
  - `deflect and accept_condition are refused for a non-courting unit's proposal`
  - `a condition becomes her open promise and the proposal is accepted` (acceptance 3)
  - `an empty or too long condition throws, changing nothing`
  - `claimed turns the relationship public with cause claimed and records the claim` (acceptance 3)
  - `rivals in a romantic tier get rival_favoured major; close or ingroup units bond_shown; others nothing` (acceptance 3)
  - `no claim within 14 days of the last, none for a unit in a concealed affair, none with romance off`
  - `refusing publicly needs public_humiliation; it applies rejected_advance major and stress 8`
- [ ] **Step 2: Run** `npx vitest run tests/engine/personal/courtship.test.ts tests/scene tests/engine/relations`. Expect FAIL on the new tests only.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests, then `npm test`. Expect PASS.
- [ ] **Step 5: Tick and commit:** `feat(personal): inverted courtship and claimed`.

### Task 6: Controller, directives and the `dm_edit` wording

**Files:**
- Create: `src/personal/{controller,directives,deps}.ts`, `tests/personal/{controller,directives}.test.ts`
- Modify: `src/llm/calls/flavor.ts` (kind `dm_edit`, `sanitizeDmEdit`, ≤ 300 chars), `src/settings.ts` (`dmEditWording`, default true), `src/scene/comms.ts` (`send` asks the controller first), `src/app.ts` (`app.personal`; `fileLeash` and the recruit handler ask first; the bonds controller's smother opening is removed), `src/bonds/controller.ts`, `tests/power/herCallDirectives.test.ts` (the reserved list gains `personal:`)

**Interfaces:**
- Consumes: Tasks 2–5; `createBonds` pattern; `generateFlavor`; `ContextBuilder`.
- Produces:
  - `createPersonal(deps): PersonalController` with `beforeSend(unitId, text): Promise<{ text: string; intercept?: { id; editorId } }>`, `beforeRequest(kind: 'leash'|'recruit'): Promise<{ cancelled: boolean; intercept?: … }>`, `resolveIntercept(id, keep): boolean`, `onSlotAdvanced(): Promise<boolean>` (plays a due booking; a guard flag so it never opens twice), `onLoaded()`, `cancelBooking(id)`, `resolveConflict(…)`, `answerClaim(unitId, refuse)`, `onEvents(events)`.
  - `personalDirectives(state, reg, present): Directive[]` (all derived; this task: `personal:court:`, `personal:claimed:`, `personal:decor:`, `personal:booking:`), `refreshPersonalDirectives(builder, state, reg)`, `DERIVED` list.
  - `VOICE_OF.booking = 'personal'`, `VOICE_OF.device_edit = 'personal'`.

- [ ] **Step 1: Write the failing tests.**
  - `beforeSend returns the original when nobody intercepts and calls no model`
  - `an intercept words the text with dm_edit; a failed call uses an editLines fallback with {text} filled`
  - `with dmEditWording off no model is called`
  - `KEEP sends the edited text with interceptId; REVERT sends the original after the defiance`
  - `beforeRequest cancels a Leash request on KEEP and files it on REVERT`
  - `the controller never opens a booking scene twice` (Review Focus 2: `onSlotAdvanced` twice, and once more after `onLoaded`)
  - `the smother hold's scene is opened by its booking, not by the bonds controller`
  - `directives are derived from state, follow a reload and are cleared on chat switch`
  - `no directive id starts with a reserved prefix; all start with personal:`
  - `no commander pronoun in any directive or flavor prompt` (the P9b regex)
- [ ] **Step 2: Run** `npx vitest run tests/personal tests/power/herCallDirectives.test.ts tests/bonds`. Expect FAIL on the new tests.
- [ ] **Step 3: Implement.** `dm_edit` prompt: her name, the relationship's prompt hint, the recipient's name, `<dm>` with the original as data; she rewrites it "to make plain the commander belongs to her", addressed as the commander would send it; no new facts, no numbers.
- [ ] **Step 4: Run** the tests, then `npm test`. Expect PASS.
- [ ] **Step 5: Tick and commit:** `feat(personal): controller, directives and DM edit wording`.

### Task 7: Chunk (a) UI, providers, glossary, balance check

**Files:**
- Create: `src/ui/personal/{deviceBlock,schedule,chips,claimCard}.ts`, `css/76-personal.css`, `src/analysis/providers/personal.ts`, `tests/ui/personalA.test.ts`, `tests/analysis/personalProviders.test.ts`
- Modify: `src/ui/comms/commsTab.ts` (`EDITED BY {NAME}` chip with `[KEEP] [REVERT]`; the input shows the edited text), `src/ui/proposalChips.ts` (three chips for a courting unit; SET A CONDITION opens a one-line input), `src/ui/squad/squadTab.ts` (DEVICE block: `ACCESS L{n} {NAME}` chip, decor parts with `[PEEL]`, notes, her bookings with `[CANCEL]`), `src/ui/ops/opsTab.ts` (SCHEDULE: the next 3 days' bookings, conflicts with `[KEEP HERS] … [LET THEM SETTLE IT]`), `src/ui/hub/model.ts` (`tonightItems` kind `booking` at the end of the order, `glossary:booking`), the hub/scene host for the claim card, `content/core/glossary.json`, `src/analysis/describe.ts` providers registration

**Interfaces:**
- Consumes: Tasks 2–6.
- Produces: `renderDeviceBlock(state, reg, unitId, handlers)`, `renderSchedule(state, reg, handlers)`, `editChip(intercept, name, onKeep, onRevert)`, `renderClaimCard(state, reg, claim, handlers)`; providers `glossary:device_access` (her level, which branch holds, what it allows), `glossary:booking` (who, when, what cancelling costs at her Impunity), `glossary:courtship`, `glossary:claimed`, `deviceAccessRules`, `bookingKinds`.

- [ ] **Step 1: Write the failing tests (jsdom).**
  - `the DM input shows the edited text with EDITED BY and both buttons call the controller` (acceptance 1)
  - `a courting unit's proposal shows ACCEPT / DEFLECT / SET A CONDITION; another's shows P3's chips` (acceptance 3)
  - `the schedule lists bookings with her name and accent; CANCEL dispatches booking/cancel` (acceptance 2)
  - `the claim card offers REFUSE PUBLICLY only with public_humiliation on`
  - `PEEL dispatches device/remove_decor`
  - `the Tonight list ends with the booking line and never shows more than six`
  - `every new chip, stat and option carries data-analyze` (the coverage test also passes)
  - Providers: `device_access explains the holding branch without raw numbers; with raw values on it shows Impunity`; `booking cost line scales at Impunity ≥ 50`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/personalA.test.ts tests/analysis/personalProviders.test.ts tests/ui/analyzeCoverage.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement.** Glossary entries `device_access`, `booking`, `courtship`, `claimed`, `setting_dm_edit_wording` (`AUTHOR TO WRITE` long texts).
- [ ] **Step 4: Balance check (arithmetic, no code kept).** With draft numbers, compute for a dominant lover (Affinity 80, Want 50, Impunity 55, normal assertiveness): bookings a week (target 1–2, the cap is 2) and intercepts a week at five DMs to others (target ≤ 2). Adjust only `TUNING.personal` drafts; write the figures into the commit body.
- [ ] **Step 5: Run** `npm test`. Expect PASS.
- [ ] **Step 6: Tick and commit:** `feat(ui): device block, schedule, edit chip, courtship chips and claim card`.

---

## Chunk (b) — Tokens, wagers, obedience

### Task 8: Tokens (engine)

**Files:**
- Create: `src/engine/personal/tokens.ts`, `content/core/tokenKinds.json`, `tests/engine/personal/tokens.test.ts`
- Modify: registry plumbing (`tokenKinds`), `src/content/schemas.ts` (rule `check` + `token_wear`), `content/core/relationshipRuleTemplates.json` (`no_other_tokens`: `check: token_wear`, `contentTags: ['jealousy_games']`), `src/engine/bonds/rules.ts` (`checkTokenWear(draft, ctx, giverId)`), `src/engine/actions/personal.ts` (`token/answer`, `token/wear`, `token/remove`), `src/engine/personal/dayStep.ts` (offer roll, expiry, giver Affinity)

**Interfaces:**
- Consumes: Task 1; `applyRelationDelta`, `applyRuleEvent` path of `checkRunRoster`.
- Produces:
  - `Token { id; giverId; kindId; label; day; worn: boolean; lockedUntil?: number }`, `TokenOffer { id; giverId; kindId; label; day; dmId? }`
  - `rollTokenOffer(draft, ctx)`, `giveToken(draft, ctx, giverId, kindId?)` (the wager path), `answerOffer`, `wearToken`, `removeToken`, `wornTokens(state): Token[]`, `tokenLine(state): string | null`
  - Reserved: `token_offered`, `token_accepted`, `token_declined`, `token_worn`, `token_taken_off`.

- [ ] **Step 1: Write the failing tests.**
  - `an eligible unit offers once, ever; a second offer never comes` (scan seeds)
  - `accept stores it unworn; decline applies rejected_advance minor; an offer expires after 3 days as declined`
  - `at most two worn; a third wear throws` (acceptance 4)
  - `wearing makes rivals rival_favoured and others bond_shown` (acceptance 4)
  - `while worn the giver gains Affinity 1 a day through the gain handler`
  - `removing a worn token applies token_removed to the giver, ×1.5 for a pressureMult defect` (acceptance 4)
  - `a locked token removed early also breaks a promise`
  - `with a no_other_tokens rule active, wearing another's token breaks it by check; with jealousy_games off the rule is never proposed`
  - `a unit without the token gate never offers` (acceptance 7)
- [ ] **Step 2: Run** `npx vitest run tests/engine/personal/tokens.test.ts tests/bonds`. Expect FAIL on the new tests.
- [ ] **Step 3: Implement.** Six draft kinds (`AUTHOR TO WRITE`).
- [ ] **Step 4: Run** the tests, then `npm test`. Expect PASS. The P9d rule tests that read `no_other_tokens.check === 'intent'` change knowingly; say so in the commit body.
- [ ] **Step 5: Tick and commit:** `feat(personal): tokens the commander may wear`.

### Task 9: Wagers: challenges, three games, stakes

**Files:**
- Create: `src/engine/personal/wagers.ts`, `content/core/{wagerGames,wagerStakes}.json`, `tests/engine/personal/wagers.test.ts`
- Modify: registry plumbing (`wagerGames`, `wagerStakes`), `src/engine/bonds/content.ts` (`CONTENT_GATED_REGISTRIES` + `wagerStakes`; withdrawing drops an offered stake's wager and ends a running mark), `tests/helpers/bonds.ts` (`GATE_PROBES.wagerStakes`, `GATE_FIXTURE`), `src/engine/actions/personal.ts` (`wager/challenge`, `wager/answer`, `wager/play`, `wager/answer_question`, `wager/record_answer`), `src/engine/personal/dayStep.ts` (her challenge roll, expiry)

**Interfaces:**
- Consumes: Tasks 1, 4, 8; `contentAllowed`, `grantProblem`, `answerDemand`, `addFact`, `addRecord`.
- Produces:
  - `Wager { id; unitId; by: 'unit'|'commander'; gameId; stakeId; day; status: 'offered'|'accepted'|'pending_run'; pick?: string; dmId? }`, `WagerLogEntry { id; unitId; gameId; stakeId; winner: 'commander'|'unit'|'void'; day }`
  - `stakeOffered(state, reg, unitId, stake): boolean`, `offeredStakes(state, reg, unitId): Entry[]`
  - `rollChallenges(draft, ctx)`, `challenge(draft, ctx, p)`, `answerChallenge(draft, ctx, wagerId, accept)`, `playWager(draft, ctx, wagerId, pick?)` (coin/rps/high_card here; Task 10 adds the other two), `applyStake(draft, ctx, wager, winner)`
  - Reserved: `wager_offered`, `wager_refused`, `wager_accepted`, `wager_declined`, `wager_resolved`, `mark_set`, `mark_ended`.

- [ ] **Step 1: Write the failing tests.**
  - `her challenge comes only through the wager gate and picks only offered stakes` (acceptance 6, 7)
  - `stakes never include a disabled category: her_mark appears only with body_modification on and not among her limits` (acceptance 6; over 50 seeds)
  - `switching body_modification off withdraws the mark stake and ends a mark` (Review Focus 4)
  - `the commander's challenge is refused below Affinity 0 and Impunity 40`
  - `declining her challenge applies dismissed minor`
  - `coin draws once; rps draws her hand once and once more on a tie; a second tie voids; high_card voids on a tie` (acceptance 6)
  - one test per stake and winner (`obedience` sets the day and who; `slot` books or blocks 7 days; `privilege` ±6 record; `drop_demand` grants or closes with no refusal deltas; `token` worn and locked, or given; `question` → fact known by her / truth directive state; `mark` 3 days)
  - `drop_demand is not offered when the grant cannot be paid`
- [ ] **Step 2: Run** `npx vitest run tests/engine/personal/wagers.test.ts tests/bonds/gate*.test.ts`. Expect FAIL on the new tests.
- [ ] **Step 3: Implement.** Content: five games, seven stakes (`AUTHOR TO WRITE` texts).
- [ ] **Step 4: Run** the tests, then `npm test`. Expect PASS.
- [ ] **Step 5: Tick and commit:** `feat(personal): wagers, three games and their stakes`.

### Task 10: Sparring on the P4 engine and expedition bets

**Files:**
- Create: `src/engine/combat/sparring.ts`, `tests/engine/combat/sparring.test.ts`, `tests/engine/personal/expeditionBet.test.ts`
- Modify: `src/engine/personal/wagers.ts` (`sparring`, `expedition_bet`), `src/engine/world/types.ts` (`ExpeditionState.tally?`), `src/engine/world/expedition.ts` (`resolveCombat` tallies kills and hits per unit; `endExpedition` resolves bets of party members, after the report is built and before `consumeSlots`)

**Interfaces:**
- Consumes: `spawnMutineer` (`combat/spawn.ts`), `buildCombat`'s shape, `makeCtx`, `fireTrigger`, `startRound`, `runUntilInput`), `commanderMaxHp`, `commanderProfile`, `addBodyXp`, `consumeSlots`.
- Produces:
  - `commanderSparrer(state, reg): Combatant`
  - `sparringBout(state, reg, rng, unitId, handicapId): { winner: 'commander'|'unit'; rounds: number }`; never touches `state.combat` or `lastCombat`
  - `resolveBets(draft, ctx, outcome): EngineEvent[]`

- [ ] **Step 1: Write the failing tests.**
  - `sparring uses the P4 engine: same seed same result, and only the rng advances` (acceptance 6; deep-equal of the state minus `rng`, `commander.bodyXp`, `slot`)
  - `with no handicap an average commander almost never wins; the best handicap wins sometimes` (200 seeds: ≤ 5 % and ≥ 15 %)
  - `a handicap her Affinity does not allow is refused`
  - `a sparring wager spends one slot and gives strength XP; it is refused in the Night slot`
  - `a 20-round draw goes to her`
  - `an expedition bet waits for a run with her and resolves by kills, no damage or objective` (acceptance 6)
  - `a bet is void after 7 days or when she leaves`
  - `tally counts killing blows and hits per unit from the combat log`
- [ ] **Step 2: Run** `npx vitest run tests/engine/combat/sparring.test.ts tests/engine/personal/expeditionBet.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement.** The commander's skill: the draft `TUNING.personal.sparring.commanderSkill` must be a single-target basic attack that `usableSkills` accepts for a combatant with no role; pick it from `skills.json` and pin it in a test.
- [ ] **Step 4: Balance step (throwaway script, not kept).** 500 bouts per archetype (`frail` … `hardened`) × handicap against a level-1 and a level-5 soldier of each role. Tune only the sparrer formula and handicap drafts until: no handicap ≤ 5 % for `average`; best handicap 25–40 % for `average` at level 1. Write the table into the commit body.
- [ ] **Step 5: Run** the tests, then `npm test`. Expect PASS. Existing expedition tests stay green: the tally only adds a field and bets resolve nothing when none is open.
- [ ] **Step 6: Tick and commit:** `feat(personal): sparring on the combat engine and expedition bets`.

### Task 11: A day of obedience

**Files:**
- Create: `src/engine/personal/obedience.ts`, `tests/engine/personal/obedience.test.ts`
- Modify: `src/engine/discipline/demands.ts` (`refuseLikeDemand` and `openDemand`), `src/engine/personal/bookings.ts` (`cancelBooking`), `src/engine/relations/proposals.ts` (`answerProposal`), `src/engine/dilemma/flow.ts` (`chooseDilemma`), `src/engine/power/votes.ts` (`carryVote`), `src/engine/power/leader.ts` (`countermandChance` 0 while the leader obeys the commander), `src/engine/loyalty/refusal.ts` (`refusalChance` 0), `src/engine/personal/dayStep.ts` (expiry; her rolls skip her that day)

**Interfaces:**
- Consumes: Task 9; `computeDeltas`, `ballotFor`.
- Produces:
  - `obedienceOf(state): { unitId; who } | null`; `commanderObeys(state, unitId): boolean`; `unitObeys(state, unitId): boolean`
  - `herPick(state, reg, unitId): number | null` (dilemma option index), `herVote(state, reg, vote): 'for'|'against'|null`
  - `overrideHer(draft, ctx, unitId, evidence): EngineEvent[]` (`overrode_her` moderate × pressureMult + record +3)

- [ ] **Step 1: Write the failing tests.**
  - `while the commander obeys her: refusing her demand, cancelling her booking, declining her proposal, choosing another dilemma option or carrying a vote she voted against each apply overrode_her once` (acceptance 6)
  - `following her pick applies nothing extra`
  - `herPick is the option that pleases her most and null when no option touches her`
  - `while she obeys: refusal chance 0, no demand, booking, claim, offer, challenge or countermand for her that day`
  - `obedience ends at day end`
  - `activities, upgrades and expeditions are never affected`
- [ ] **Step 2: Run** `npx vitest run tests/engine/personal/obedience.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests, then `npm test`. Expect PASS.
- [ ] **Step 5: Tick and commit:** `feat(personal): a day of obedience`.

### Task 12: Chunk (b) UI, directives, providers

**Files:**
- Create: `src/ui/personal/{tokens,wagerForm,wagerCard}.ts`, `tests/ui/personalB.test.ts`
- Modify: `src/ui/commander/cmdrCard.ts` (TOKENS block: worn and kept tokens, `[WEAR]` / `[TAKE OFF]`, the mark line), `src/ui/comms/commsTab.ts` (token offer and challenge chips), `src/ui/squad/squadTab.ts` (`[CHALLENGE]` → the wager form), the demand, booking, proposal, dilemma and vote renderers (pre-selection + `DEFIES {NAME}` hint while the commander obeys), `src/personal/{controller,directives}.ts` (`personal:tokens`, `personal:token_removed:`, `personal:obedience:`, `personal:truth:`, `personal:mark`; `wager/record_answer` on her first reply), `src/analysis/providers/personal.ts`, `content/core/glossary.json` (`token`, `wager`, `obedience`), `css/76-personal.css`

**Interfaces:**
- Consumes: Tasks 8–11.
- Produces: `renderTokens(state, reg, handlers)`, `renderWagerForm(state, reg, unitId, onSubmit)` (games and only `offeredStakes`; sparring lists allowed handicaps; RPS asks for a hand), `renderWagerCard(result)`; providers `glossary:token`, `glossary:wager` (with `k.raw`: the game's odds; sparring: the measured band of the handicap), `glossary:obedience`, `tokenKinds`, `wagerGames`, `wagerStakes`.

- [ ] **Step 1: Write the failing tests (jsdom).**
  - `the dossier shows worn tokens and refuses a third wear with the engine's message` (acceptance 4)
  - `the scene context names worn tokens` (fixture on `ContextBuilder`, acceptance 4)
  - `the wager form never lists a stake whose category is off` (acceptance 6)
  - `under obedience her pick is pre-selected in the demand, proposal, dilemma and vote views` (acceptance 6)
  - `the truth directive lasts until her first reply and that reply becomes a fact`
  - `every new chip, card and option carries data-analyze`
- [ ] **Step 2: Run** `npx vitest run tests/ui/personalB.test.ts tests/personal tests/ui/analyzeCoverage.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expect PASS.
- [ ] **Step 5: Tick and commit:** `feat(ui): tokens, wagers and obedience`.

---

## Chunk (c) — Squad secrets

### Task 13: Secrets: store, sources, the answer, the `held` term

**Files:**
- Create: `src/engine/personal/secrets.ts`, `content/core/secretKinds.json`, `tests/engine/personal/secrets.test.ts`
- Modify: registry plumbing (`secretKinds`: `source: 'hidden_injury'|'event'|'successor'`, `reason`, `text` with `{name}`/`{leader}`, `importance`), `src/content/schemas.ts` (world effect `squad_secret`; `commandStances[].hidesInjury`, `.secretSlip`; `relationshipStates[].secretSlip`), `src/engine/world/effects.ts` (apply `squad_secret`), `src/analysis/effects.ts` (`summarizeWorldEffect` line: `The squad keeps something from the commander.`), `content/core/{commandStances,relationshipStates}.json` (the fields), `src/engine/world/expedition.ts` (`endExpedition`: hidden injuries), `src/engine/power/standing.ts` or `dayStep.ts` (successor), `src/engine/discipline/impunity.ts` (`ImpunityTerms.held`), `src/analysis/providers/discipline.ts` (the `held` line), `src/engine/actions/personal.ts` (`secret/respond`)

**Interfaces:**
- Consumes: Task 1; `addFact`, `addRecord`, `applyEventToUnit`, `leaderOf`, `commandStance`.
- Produces:
  - `SquadSecret` (rulings), `addSecret(draft, reg, p: { kindId; knownBy; subjectId?; vars }): EngineEvent[]` (exported for P12), `secretsKnownBy(state, unitId)`, `heldTerm(state, unitId): number`
  - `respondSecret(draft, ctx, secretId, choice: 'confront'|'pretend'|'use')`
  - Reserved: `secret_kept`, `secret_found`, `secret_answered`.

- [ ] **Step 1: Write the failing tests.**
  - `a defiant_loyal unit ending a run at 20 % HP makes a hidden-injury secret known by the party; at 30 % or as disciplined, none; no draw either way`
  - `the squad_secret world effect stores one known by the party or squad`
  - `a leader holding 7 days makes the successor secret once`
  - `a kept secret is no fact and no reading shows it` (hidden sentinel)
  - `confront: record −5 for knowers, secret_confronted on the squad, a public fact` (acceptance 5)
  - `pretend: a fact only the commander knows; it never reaches retrieveFacts for a scene` (acceptance 5)
  - `use: held −8 per secret, at least −16, for 14 days; the P9 provider shows the term` (acceptance 5)
  - `a secret she alone knew is dropped when she leaves; others' lose her from knownBy` (Review Focus 3)
- [ ] **Step 2: Run** `npx vitest run tests/engine/personal/secrets.test.ts tests/engine/discipline`. Expect FAIL on the new tests.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests, then `npm test`. Expect PASS.
- [ ] **Step 5: Tick and commit:** `feat(personal): squad secrets and what the commander does with them`.

### Task 14: Discovery routes

**Files:**
- Create: `tests/engine/personal/discovery.test.ts`
- Modify: `src/engine/personal/secrets.ts` (`discoverSecret`, `rollSceneDiscovery`, `rollSecretNight`), `src/engine/actions/scene.ts` (`scene/end` calls `rollSceneDiscovery` after the summary), `src/engine/actions/comms.ts` (`night/open` on `SECRET_NIGHT_KIND`), `src/engine/personal/dayStep.ts` (night roll)

**Interfaces:**
- Produces: `discoverSecret(draft, ctx, secretId, route: 'insight'|'slip'|'night'|'frequency'): EngineEvent[]`, `SECRET_NIGHT_KIND`, `rollSceneDiscovery(draft, ctx, presentIds)`, `rollSecretNight(draft, ctx)`.

- [ ] **Step 1: Write the failing tests.**
  - `insight: a low-Trust knower at scene end gives a 0.08 × Insight chance; a high-Trust one draws nothing` (acceptance 5)
  - `slip: an open_defiance or resentful knower lets it slip at 0.25` (acceptance 5)
  - `night: a fond knower queues a confession; opening the door finds the secret` (acceptance 5)
  - `a scene with no knower draws nothing` (rng unchanged)
  - `a found secret is not found twice; frequency is exported and works when called`
- [ ] **Step 2: Run** `npx vitest run tests/engine/personal/discovery.test.ts tests/scene`. Expect FAIL on the new tests.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests, then `npm test`. Expect PASS.
- [ ] **Step 5: Tick and commit:** `feat(personal): how a squad secret comes out`.

### Task 15: Secrets: directive, discovery card, providers, an authored event

**Files:**
- Create: `src/ui/personal/secretCard.ts`, `tests/ui/secretCard.test.ts`, `tests/personal/secretDirectives.test.ts`
- Modify: `src/personal/{directives,controller}.ts` (`personal:secret:<id>`; the card on `secret_found`), `src/ui/voice/sources.ts` (`squad_secret: 'paper'`), `src/analysis/providers/personal.ts` (`glossary:squad_secret`, `secretKinds`), `tests/fixtures/analyze/hidden.ts` (sentinel), `content/core/glossary.json` (`squad_secret`), `content/core/dilemmaTemplates.json` (one minor expedition event, a trader deal, whose cost option carries `squad_secret`), `css/76-personal.css`

**Interfaces:**
- Produces: `renderSecretCard(state, reg, secret, onChoose)` (a `paper` card; the text with `redact` ranges over the knowers' names until answered; `[CONFRONT EVERYONE] [PRETEND NOT TO KNOW] [USE IT]`, each `data-analyze`).

- [ ] **Step 1: Write the failing tests.**
  - `a scene with a knower gets the do-not-reveal directive; the context fixture never shows the text outside it` (acceptance 5: build the context with a knower present and absent)
  - `pretend keeps the directive; use switches it; confront drops it`
  - `the card offers the three answers and dispatches secret/respond` (acceptance 5)
  - `no provider shows a kept secret's text` (`tests/analysis/hidden.test.ts` with the sentinel)
  - `the trader-deal event's option stores a secret`
- [ ] **Step 2: Run** `npx vitest run tests/ui/secretCard.test.ts tests/personal tests/analysis`. Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expect PASS.
- [ ] **Step 5: Tick and commit:** `feat(personal): secret directives, discovery card and providers`.

### Task 16: Docs, manual checklist, hand-offs

**Files:**
- Create: `docs/MANUAL_TEST_P9c.md`
- Modify:
  - `docs/packages/P9c-personal-pressure.md`: status line, **Implemented as** with every ruling above (the user rulings marked), draft numbers and the balance figures of Tasks 7 and 10, non-obvious things, open items.
  - `docs/00-overview.md`: §5.4 rows (`personalOf`, `pressureGate`, `deviceAccess`, `pinnedNotes`, `decorOf`, intercepts, bookings and the `booking_due` guard, `refuseLikeDemand`, courtship answers, `claim`, tokens, wagers, `sparringBout`, obedience, secrets, `ImpunityTerms.held`, the actions, `app.personal`, `personalDirectives`); §9 status `implemented`.
  - `docs/ROADMAP-next.md`: P9c done.
  - `docs/CONTENT.md`: the six registries, `pressureMult`, `hidesInjury` / `secretSlip`, the world effect `squad_secret`, `token_wear`.
  - `docs/packages/P9d-desire-bonds.md` (open items: smother is now a booking; `no_other_tokens` is checked), `P9b-power-structure.md` (bookings read `demandMult`), `P10-visual-upgrade.md` (whereabouts read bookings).
  - **Interfaces already provided by P9c** notes in `P10b` (decor, notes, contact name, wallpaper owner, `device/remove_decor`, bookings for the door), `P12` (`addSecret`, `discoverSecret(…, 'frequency')`, `held`), `P13` (obedience, wagers).
  - `CLAUDE.md`: a P9c line like the P9b one.
- [ ] **Step 1: Write** the manual checklist, one item per acceptance criterion and per user ruling (DM edit wording and fallback, obedience scope, `use` Impunity, the content gates), plus: an old save plays as before; no commander pronoun anywhere.
- [ ] **Step 2: Update** the docs. Open items at least: P12 sources and the `frequency` route; leader orders beyond the successor; night bookings; P10b's visuals; every number and text is a draft.
- [ ] **Step 3: Run** `npm test` (pronoun and docs-link tests included). Expect PASS.
- [ ] **Step 4: Tick and commit:** `docs: P9c implemented-as, overview, content guide and manual checklist`.
