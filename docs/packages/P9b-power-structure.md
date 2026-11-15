# P9b — Squad Power Structure

**Status: implemented** (plan: `docs/plans/2026-11-15-p9b-power-structure.md`; see **Implemented as** at the end; where it differs from the draft, the code wins). **Depends on:** P9 (Impunity, demands, punishments), P8 (world options), P7 (commander profile), P6 (dilemmas, Leash), P5 (oversight, missions). **Read:** overview; this file; P9; P9d §1 (bond profile, shared with this package).

**Analysis tool (P7a):** every new player-facing stat, chip, option and choice card in this package carries `data-analyze`, has a glossary entry or registry `description`, and live values get an analyze provider reading through `Knowledge`.

## Goal

The squad is not a set of individuals who obey or don't — it has an internal power structure of its own. Some decisions go to a vote, one unit can become the de facto leader, the outside world notices who really runs the unit, and the commander can take the blame for the squad's decisions or shift it onto them.

## Principles

- **From the card, not from the world.** Only units whose bond profile (P9d §1) says so push for power. A world option shifts frequencies; it never makes a yielding character dominant.
- **No new hard authority.** Everything here is pressure and consequence; the commander can always act against the squad — at a price.

## 1. World option `squad_assertiveness` (P8 registry)

`low` / `normal` / `high`. Scales leader privileges (§3), demand and booking frequencies (P9, P9c) and the vote's weight against the commander (§2). Preset "Assertive squad" in the P8 setup screen sets `high` and turns voting on.

## 2. Voting

Toggle `voting` in WORLD PARAMETERS (default **off**; the "Assertive squad" preset turns it on). Locked after start.

Votable decisions (registry `voteKinds`): mission choice from the board, base upgrade queue, ration distribution on shortage days, whether to punish a squad member (P9 ladder, severity ≤ `bench`), and scapegoat cases (§5).

Flow: the decision opens a **VOTE** panel. Each named unit's ballot is computed from her values, relationship to the commander and to affected units, stance (P9) and current demands; grunts vote with weight 0.5 following the leader if there is one. The commander has one vote + tie-break; his vote weight = 1 + 0.5 × (Authority rank − 1), reduced by `squad_assertiveness` (`high`: × 0.75). Ballots are shown with one-line reasons (template, or `flavor` call when enabled).

Overruling the result: allowed — by a direct order, a punishment, or the Leash. Overruling costs more than an ordinary order: every unit that voted against gets `decision_violated` (moderate) and `defied`-eligibility for the next day; Impunity of the majority +5.

## 3. Internal hierarchy

Engine-computed **standing** per named unit: `0.4 × combat merit (last 14 days) + 0.3 × squad respect (mean Trust/Affinity other units would have toward her — approximated by values compatibility until NPC↔NPC relations exist) + 0.3 × (Impunity/100)`, × leadStyle factor (dominant 1.3, assertive 1.15, balanced 1, yielding 0.7).

The **leader** = highest standing if it exceeds the next by ≥ 10 and her leadStyle ≥ assertive; otherwise there is no leader. Recomputed weekly; changes are events with a scene hook.

Leader privileges (scaled by `squad_assertiveness`): her vote counts ×1.5; she can countermand minor non-combat orders to other units (activity assignment, rest) — shown as a chip with `[ACCEPT] [OVERRULE]` (overrule = defiance of her: her Trust −, her Impunity +); she shapes the squad's stance toward the commander (contagion term `C` in Impunity uses her record with weight 2).

Commander's moves: **endorse** her (formal second-in-command: her Trust/Affinity +, privileges ×1.5, his Impunity with others +) or **challenge** her (a `defining`-scale scene + check: Authority / body routes per P7, or social; win → she loses leadership for 14 days, loss → her standing +, his Impunity with everyone +10).

LEASHSWAP (P13): the warden sits above the hierarchy; the leader is computed among the others. If warden ≠ leader, that is a standing tension the director may use.

## 4. The world sees who leads

If a leader exists, outside actors address her: oversight copies her on messages, traders negotiate with her, enemy commanders in parley scenes look to her. Implemented as directives + `corporate`-voice copies. The commander restores outside authority by a visible feat (registry `outsideFeats`: Crisis survival with cover, a mission won through his order, a successful negotiation) which suppresses the effect for 14 days, or by endorsing her (then it becomes the official arrangement and oversight treats her as second-in-command).

## 5. Scapegoat

When a decision made by a unit (a "her call" dilemma, a vote result, a leader's countermand) leads to a failure that oversight punishes, the commander gets a choice: **take the blame** (oversight punishment hits him: standing −, Leash authorizations −1, a commander injury/confinement in P13; the responsible unit and witnesses: Trust ++, Affinity +) or **shift it** (her punishment by oversight; his standing kept; squad: `sided_against` toward him, the responsible unit `extreme`). New dilemma template family `scapegoat` in P6's registry.

## 6. Data

Campaign: `world.options.squad_assertiveness`, `world.options.voting`; `hierarchy { standings, leaderId?, endorsed: boolean, challengeCooldownUntil? }`; `votes[]` log. New intents: none required (votes and challenges are engine events; scenes use existing intents).

## Acceptance criteria

1. Voting is off by default; the preset turns it on; votable kinds open the panel; ballots follow values (table tests); tie-break and weights match the formula.
2. Overruling a vote applies the extra costs.
3. Leader appears only with the margin and leadStyle condition; privileges scale with the option; countermand chip works; endorse and challenge resolve.
4. Outside actors address the leader; a feat suppresses it for 14 days.
5. Scapegoat choice applies both branches' consequences.
6. With `voting` off and no leader, gameplay is unchanged from P9.

## Interfaces already provided by P8 (implemented — use, do not rebuild)

- **Adding the world option:** `squad_assertiveness` is one more entry of `content/core/worldOptions.json` (`{ id, label, group, live, default, description, choices[{ id, label, description, lore ≤ 100 characters, effects[] }] }`); the six existing options already fill most of the 120-token WORLD SETTINGS block (the loader rejects lore lines that together exceed it), so keep the new lore line short. Choice effects use the closed vocabulary `WorldOptionEffectSchema`; a new effect type needs a schema entry, a reader (`worldEffects(state, reg, type)`, never by choice id) and a line in `summarizeWorldOptionEffect`. A preset names every option (`worldPresets`: the loader checks it), so "Assertive squad" is a new preset entry that sets `high` and the voting choice.
- **The WORLD PARAMETERS screen** (`renderWorldParams`) draws any option by its `group`; a new group appears as a new heading. The option cards carry `data-analyze="worldOptions:<id>"` with the choice in the context.
- **Disposition and stances** are read with `dispositionFor` / `stanceOf`; the ballot rules can use a unit's effective level (`refusalMult`) next to her values.

## Interfaces already provided by P9 (implemented — use, do not rebuild)

- **Impunity and stance:** `impunityOf(state, reg, unitId)` (value and terms), `impunityBand`, `commandStance` (five stances; `indifferent` is the not-caring zone) are the inputs for ballots and for "who dares". Do not store a second Impunity.
- **Punishment and consequences:** `applyPunishment` / `enforce` / `addRecord` apply a measure through the P3 delta chain and move R; a vote that punishes a unit should end in `commander_enforced`-like events through these, not raw deltas. `restrictionReason(state, unitId, use, activityId?)` is how confinement, bench and no-leave are read.
- **Big gestures:** `TUNING.disposition.bigGesture.events` already holds `granted_demand`; "shielded from oversight" has **no producer** — add the event type to `EVENT_TYPES`/`eventDeltas` and to that list.
- **Counters and nicknames:** `countDeed(draft, counter)` (add a counter to `DEED_COUNTERS`), registry `reputations` (a new pattern is JSON) and `Commander.reputation`.
- **Directives:** ids `loyalty:`, `refusal:`, `threat:`, `discipline:`, `demand:`, `reputation:`, `nickname` are P9's; keep new ones away from them and from `world:`, `stance:`, `friction:`.

## Interfaces already provided by P9d (implemented — use, do not rebuild)

- **Bond profile:** `bondOf(unit)` (`leadStyle`, `attachment`, `desire`, `caretaker`, `ownLimits`, `publicity`; `null` for a grunt, a modest profile when the card gave none), `leadRank`, `LEAD_STYLES`: "pushes for power" reads `leadStyle`, never an id. `squad/resync` re-reads the `bond` section.
- **Co-command stand-in:** a defect's `embraceFlag` (Dominance Drive: `co_command`) writes a relation flag and the directive `co_command:<unitId>` when the Embrace path is decided; the hierarchy replaces the flag.
- **Lead and rules:** `scene.lead` (`unit` / `commander` / `shared`) and the proposals of leading partners (`relationshipRuleTemplates`, `rollRules`) are the entry points a hierarchy or a vote can read; `decideLead` is pure.
- **Content gate:** `contentAllowed` over `contentTags`; a new gated registry needs a `GATE_PROBES` probe.
- **Directives:** ids `content`, `limits:`, `lead`, `boundary:`, `want:`, `rule:`, `publicity:`, `co_command:`, `ask:` are P9d's.

## Implemented as

Engine: `src/engine/power/{options,ballot,votes,rations,state,standing,leader,moves,outside,scapegoat,dayStep,index}.ts`, `src/engine/actions/power.ts` (actions `vote/open`, `vote/drop`, `vote/overrule`, `rations/set`, `power/countermand`, `power/endorse`, `power/challenge`; the vote gates; the power day step on `director_tick`). Non-engine layer `src/power/{controller,directives,deps}.ts` (`createPower` / `app.power`). UI `src/ui/power/{votePanel,hierarchy,chips}.ts`, `src/ui/dilemma/scapegoat.ts`, the RATIONS row in `ui/base/baseTab.ts`, the dossier block in `ui/squad/squadTab.ts`, countermand chips in OPS and the hub, `CC:` in the oversight log, `css/74-power.css`. Analysis `src/analysis/providers/power.ts`. Content: registries `voteKinds` (5) and `outsideFeats` (3), world options `squad_assertiveness` and `voting` (+ preset `assertive_squad`), `commandStances[].voteBias`, `missionTemplates[].voteLean`, `facilities[].voteLean`, `activities[].countermandable`, dilemma template `scapegoat_mission`, `eventDeltas` rows for the four leader events and `shielded`. Numbers: `TUNING.power`. Every number, reason line and text is a **draft** the author may change; texts are marked `AUTHOR TO WRITE`.

### State
- `CampaignState.power?: { votes: { open?, log[], seq }, grudges?, hierarchy?, merit?, countermand?, scapegoatQueue? }` (created by `powerOf` on first write), `base.rations?`, `Mission.decidedBy?` (`{ voteId, unitId, witnessIds? }`), `ExpeditionState.orders?`, `LeashLogEntry.cc?`, `Restriction.source?: 'oversight'`, `DilemmaState.subjectId` / `witnessIds`. Version stays 1; every field is optional and a save without them plays as before.
- The vote is stored while it is open (`passed` / `failed` / `overruled`); carrying it spends it into the 30-entry log. A vote is usable only for the action it was held for: same kind and subject, same day, `passed` or `overruled`.

### What changed against the draft (rulings; the plan's ruling section holds the full text)
- **Vote shape (user):** yes/no on the commander's pick. The commander always votes FOR; a tie passes. Weight `(1 + 0.5 × (Authority − 1)) × commanderVoteMult`; the leader `1.5 × privilegeMult (× 1.5 endorsed)`; a grunt 0.5 following the leader, else abstaining.
- **Five gated decisions** (`registerVoteGate` in `dispatch.ts`, consulted before the handler, only while `voting` is on): a board mission (not a `poi` or tutorial run), a base upgrade, a punishment up to the `bench` ladder step (read from the side effect), a ration change while a shortage is on or coming, and the answer of a scapegoat case. The refusal is `{ type: 'error', code: 'vote_needed', kind, subject }`.
- **Overrule** (only on a failed vote) always costs `decision_violated` moderate on every dissenter (the event is value-aligned, so the engine gives it the axes of her own values, pushed the other way), Impunity record +5, and a grudge until the next day end (refusal chance × 1.5, the directive `power:vote:<unitId>`); then by order, a punishment of one dissenter, or one Leash compel on the loudest.
- **Rations (user):** `equal` / `fighters_first` (reserve first, one point a share) / `commander_short` (the commander covers up to the commander's share and loses the next morning).
- **Standing** `0.4 merit + 0.3 respect + 0.3 Impunity` × lead style; merit from the combat log (the open `CombatState`, since the result's log is cut), respect = values compatibility; the leader leads the next by 10 and has `leadRank ≥ 2`; recomputed weekly; a lone named unit never leads.
- **Endorse / challenge (user):** endorse = second-in-command (`co_command` flag, +3 record for the others, privileges ×1.5); challenge = one weighted roll (chance `clamp(0.5 + 0.12 × Δrank, 0.15, 0.85)`), a win deposes her 14 days, a loss gives her +10 standing for 14 days and everyone +10 record; 14-day cooldown either way; a scene with her opens with the decided outcome as `power:challenge`.
- **Outside perception:** derived from state (`outsideActive`); three feats (`crisis_cover`, `ordered_mission`, `negotiation`) suppress it for 14 days, noted even with no leader; endorsing makes it official and never suppressed; oversight copies the leader on Leash requests (`cc`).
- **Scapegoat (user: deadline + beaten-back runs):** a command mission started on a *passed* vote remembers who answers for it (the strongest FOR voter) and the other FOR voters; when its deadline expires or the run ends `failed`, the authored dilemma `scapegoat_mission` opens at once (queued at the next day end if a dilemma is open); no model call. TAKE THE BLAME: own standing −10 (balance pass; drafted −5), Leash −1, `shielded` major on her and moderate on witnesses. SHIFT IT: oversight confines her 2 days (no Impunity record, no `commander_enforced`), stress +10, `sided_against` extreme on her and moderate on witnesses. A failed run also costs own standing −4 × `command_failure_mult`.
- **No new intent.** `shielded` is an engine event type (a big gesture), not something the model reports; `intent_extract` is unchanged (the plan's Task 12 asked for an `EVENT_TYPES` member and a vocabulary line, which contradicts its own constraint and the spec).
- **Combat log:** `heal` entries now carry `actor` (the healer's cid), so healing counts as merit.

### Balance pass (preliminary, all draft; the author owns them)
Measured with throwaway scripts over the real engine (not kept): 500 random four-soldier squads per cell (values: each axis 0 half the time, else ±1…3; Trust 20…80; record −15…15, which puts Impunity at p10/50/90 = 24/37/49), `tallyVote` on a board mission, an upgrade, a punishment and a ration mode; merit from 150–200 auto-resolved fights of the harness squad (assault, defender, sniper, medic) at levels 1–10, danger 1–5. Spec numbers untouched. Changed from the first draft:
- **Punish ballot, `ballot.compatibility`:** −2 → **−1**. Compatibility of two ordinary cards is about 0.7, so the term was a near-constant −1.4 on every bystander: a punishment vote failed 64 % of the time on a mixed squad, 61 % on a disciplined low-Impunity one (Authority 1–2). Now 48 % mixed, 42 % low-Impunity, 84 % brazen: still the most contested vote (other kinds fail 12–20 %), no longer a near-certain veto.
- **Merit, `merit.finishingBlow`:** 5 → **2** points. An average enemy has 71–134 HP (7–13 merit of damage); +5 for the last hit made the sniper's merit 47 % above the assault's at equal damage (148 vs 141 HP a fight), and at level 1 her kill points outweighed her damage. At 2 (about 20 HP of damage) merit follows damage dealt; a dominant card then leads in 39–40 % of squads after 1–6 fights (was 33–38 %), mostly as assault or sniper.
- **Low assertiveness, `privilegeMult`:** 0.5 → **0.75** (option text and glossary follow). At 0.5 a low-assertiveness leader's vote weighed 1.5 × 0.5 = 0.75, less than an ordinary soldier's 1: the "privilege" was a penalty. Now 1.125; contagion weight 1.75; countermand 0.15 a roll (about 0.75 a week at five companion activities).
- **TAKE THE BLAME, own standing:** −5 → **−10** (`dilemmaTemplates` `scapegoat_mission`; `TUNING.power.scapegoat.takeBlameStanding` mirrors it). In P6's own dominance weights (`TUNING.dilemma.weight`: faction 2 a point, a unit event 5 moderate / 10 major or extreme) the relational gap between the answers is 20 + 10 per witness (40 with two) while TAKE cost only 10 in factions plus one Leash authorization: TAKE was the answer for anyone who did not need the Leash that week. At −10 (P6's "medium" magnitude) it is 20 + one authorization against SHIFT's relational and 22-stress, 2-day cost; neither dominates.
- **Kept, after measuring:** mission, upgrade and ration votes fail 12–20 % on a mixed squad at Authority 1–2 (10 % low-Impunity, 45–50 % brazen; 2 % at Authority 3, where only a unanimous squad outvotes the commander), inside the 15–35 % target; ballot terms (the reason line comes from values about half the time, stance 28 %, Trust 21 %), so `voteBias` (+1 / +1 / 0 / −0.5 / −2) sits well against the Trust term's ±1.2 over Trust 20…80; `openDemand` −1, `subject` −4; danger and command features ±1; challenge odds (leaders measure standing p10/50/90 = 47/87/97, rank 2–4, so 0.26–0.38 for a rank 1–2 commander, 0.5–0.74 at rank 3–5) and `standingPerRank` 26; countermand 0.2 a roll (about one a week at four to six companion activities at normal, 1.5 at high, 2.3 high and endorsed; the 0.6 cap is never reached by core values); overrule costs (`decision_violated` moderate = Trust −3 / Affinity −3 at full value weight, record +5 that decays in 5 days, grudge × 1.5 refusal for the day) against `commander_enforced` moderate (−2 / −4 / 6 stress) and an unanswered `defied` (+5); the new `eventDeltas` rows (`leader_overruled` −3, `leader_endorsed` +4 / +3, `challenge_won` −3 / 5 stress, `challenge_lost` −2, `shielded` major +6 / +3 against `protected` major +8 / +6) all sit inside `praised`, `dismissed`, `decision_violated`, `followed_lead`; `failedRunStanding` 4; SHIFT IT 2 days and stress 10.
- **For the author to decide (structural, not a number):**
  - With four voters the weights are discrete: high assertiveness (× 0.75) only changes a vote from Authority 3 on, and low (× 1) never does. A low `commanderVoteMult` of 1.5 would let a meek squad block only unanimously from Authority 2; the option text says "keeps its full weight", so it was left at 1.
  - A dominant card often leads from the first day end, before any fight: with no merit anywhere, the lead-style factor alone gives her a lead of 10 in 37 % of squads (merit 0 for everyone). Computing the first hierarchy after a week, or requiring some merit, would make a leader a thing the squad earns.
  - Merit is role-bound: the defender earns 8.5 points a fight against the sniper's 19.8 and the medic's 10.6, so a dominant defender or medic almost never leads (0–2 % of squads). Damage absorbed or guarding could count.
  - The punish term is still close to a constant (−1 × ~0.7); `−(compatibility − 0.5)` would make it about how alike the bystander is to the target.
  - `fighters_first` moves the same total stress onto the reserve: with a reserve it has no cost except the vote's lean, a near free lunch. `commander_short` saves one point (4 stress, 1 Affinity) for a lost morning (a rest or a meal is worth 12–20 stress): dominated when two or more points are missing, strong when exactly one is (it resets the streak and so the −5 Trust every third day).
  - `TUNING.power.scapegoat.takeBlameStanding`, `shiftDays` and `shiftStress` are read by nothing: the template holds the numbers.

### Non-obvious things to know before touching P9b code
- **No registry id is tested in engine code:** kinds, feats and leans are read by field; world options by effect type (`squad_power`, `voting`); the ladder limit by the `bench` side effect.
- **Leaves:** `power/state.ts` has no engine imports beyond types, so `leash/use`, `loyalty/refusal`, `economy` and `discipline/impunity` can use it without a cycle; `moves.ts` exists apart from `leader.ts` for the same reason.
- **Acceptance 6:** with voting off and no leader no rng is drawn and nothing is gated; the day step's only writes are `power.hierarchy.standings` / `computedDay` and `power.merit`. A countermand or challenge rolls only while a leader exists or a challenge is made.
- **A countermand lives for its slot** (`countermandOpen` compares day and slot) and the day step deletes it.
- **`vote/overrule` is atomic:** a refused part (no Leash left, a measure she cannot be given) throws and changes nothing.
- **Directive ids:** `power:vote:<unitId>`, `power:leader`, `power:outside` (derived on every refresh), `power:challenge`, `power:countermand` (set by the controller). None starts with a prefix P9, P9d or P11 reserved.
- **A scapegoat case blocks time** like any presented dilemma (`BLOCKED_BY_DILEMMA`); the day step opens a queued case only when nothing else waits and drops one whose subject is gone with no effects.

### Open items
- No "her call" dilemma exists, and a leader's countermand never leads to an oversight failure: votes are the only source of a scapegoat case.
- Outside perception has no traders or parleys: the directive and the oversight `cc` are its whole effect.
- LEASHSWAP (P13): the warden above the hierarchy is not built; `leaderOf`, `standingOf` and `computeHierarchy` compute among the others.
- TAKE THE BLAME does not yet injure or confine the commander (P13).
- Respect is approximated by values compatibility until squad relations exist.
- `assertiveness().demandMult` is read by P9's `demandChance`; P9c bookings should read it too.
- Every number (ballot weights, standing thresholds and bands, challenge odds, countermand chance, feat days) and every text (reason lines, option texts, glossary long texts) is a draft. The real `flavor` wording of ballots is checked only by hand (`docs/MANUAL_TEST_P9b.md`).
