# P9b Squad Power Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The squad gets a power structure of its own:
- the squad can **vote** on some of the commander's decisions;
- one unit can become the de facto **leader**;
- **outsiders** notice who really runs the unit;
- after a failure the squad chose, the commander **takes the blame or shifts it** (scapegoat).

**Architecture:**
- **Engine.** A new pure folder `src/engine/power/` owns every rule:
  - `options.ts`: assertiveness and voting readers.
  - `ballot.ts`: ballots and the tally (pure, no rng).
  - `votes.ts`: the vote flow, overruling and the dispatch gate.
  - `rations.ts`: the ration mode.
  - `standing.ts`: merit, respect, standing and the leader.
  - `leader.ts`: privileges, countermand, endorse and challenge.
  - `outside.ts`: outside perception and feats.
  - `scapegoat.ts`.
  - `dayStep.ts`, `index.ts`.
- **State.** One optional object `CampaignState.power?` (votes, hierarchy, merit, countermand, scapegoat queue). Smaller optional fields go on `base`, `Mission`, `ExpeditionState`, `DilemmaState` and the Leash log entry.
- **Registries.**
  - Two new registries: `voteKinds` and `outsideFeats`.
  - New optional fields on existing ones: `commandStances[].voteBias`, `missionTemplates[].voteLean`, `facilities[].voteLean`, `activities[].countermandable`.
  - Two new world options, `squad_assertiveness` and `voting`, with two new effect types, plus one new preset.
- **Non-engine layer.** `src/power/` (controller, directives, deps) works like `src/discipline/` and `src/bonds/`. The UI lives in `src/ui/power/`.
- **Chunks.** They follow `docs/ROADMAP-next.md`.
  - **Chunk (a), Tasks 1–6:** `squad_assertiveness`, the voting toggle, ballots, the VOTE panel, overruling, rations.
  - **Chunk (b), Tasks 7–11:** standing, the leader, privileges, endorse and challenge, outside perception.
  - **Chunk (c), Tasks 12–14:** scapegoat, docs.

**Tech Stack:** TypeScript 5 (strict), esbuild, zod 3, vitest (+ jsdom for UI). No new dependencies.

**Spec:** Read these before Task 1:
- `docs/00-overview.md`, especially §5.4.
- `docs/packages/P9b-power-structure.md`.
- **Implemented as** of P8, P9 and P9d: `docs/packages/P8-world-options-disposition.md`, `P9-impunity-discipline.md`, `P9d-desire-bonds.md`.
- The P6 **Implemented as**, before touching `src/engine/dilemma/` or `src/engine/leash/`.
- `docs/content/lore.md` §0, the pronoun rule.

## Global Constraints

- **English and safe text.** Everything is in English (overview P8). UI text goes through `textContent` / `h()`, never `innerHTML`.
- **Engine purity.**
  - `src/engine/**` stays pure; `tests/architecture.test.ts` enforces it.
  - `src/engine/power/**` imports only `src/content` types and other `src/engine` modules.
  - `src/power/**` follows the `src/discipline/` rule: SillyTavern only through `StAdapter` types, and no `src/ui`.
- **The engine decides** (P1–P3).
  - Ballots, standing, the leader, countermands, challenge results and scapegoat consequences are engine computations.
  - The model only words ballot reasons (`flavor`), and only when the wording setting is on. P9b adds no new intent and does not change the `intent_extract` input. The byte-identical prompt test in `tests/scene/sceneController.test.ts` stays green.
- **From the card, not from the world.** Only `bondOf(unit).leadStyle` decides who can lead: `leadRank ≥ 2` (assertive or dominant). A world option only scales numbers. No registry id is tested in engine code; code reads world options by effect type and kinds by fields.
- **Spec numbers, verbatim:**
  - **Commander vote weight:** `1 + 0.5 × (Authority rank − 1)`; `high` assertiveness × **0.75**. Grunts weigh **0.5**. The leader's vote counts **×1.5**.
  - **Overrule costs:** `decision_violated` **moderate** on each unit that voted against; Impunity record **+5** on each of them.
  - **Standing:** `0.4 × merit (14 days) + 0.3 × respect + 0.3 × (Impunity/100)`, × leadStyle factor: dominant **1.3**, assertive **1.15**, balanced **1**, yielding **0.7**.
  - **Leader:** her standing beats the next by **≥ 10** and `leadStyle ≥ assertive`. Recomputed **weekly**.
  - **Contagion:** the leader's record counts with weight **2**.
  - **Endorsement:** privileges **×1.5**.
  - **Challenge:** a win removes her leadership for **14** days; a loss gives the commander Impunity **+10** with everyone.
  - **Feats:** a feat suppresses outside perception for **14** days.
  - **Take the blame:** Leash authorizations **−1**.
  - **Shift the blame:** the responsible unit gets `sided_against` **extreme**.
- **Draft numbers** go in `TUNING.power` or JSON and are marked *draft* in the spec's **Implemented as**. They are the author's to change.
- **Named units only.** Grunts have no standing, no ballot of their own and are never leader, scapegoat or countermand target. They vote only by following a leader (0.5). With no leader, grunts abstain.
- **No pronoun for the commander** in any text a player or the main model reads. Soldiers are "she". `tests/content/pronouns.test.ts` covers `voteKinds`, `outsideFeats`, the new world option texts and `src/power/directives.ts`.
- **State version.** Campaign state stays `version: 1` and every new field is optional. A save without `power`, `base.rations` or the new world options loads and plays with: `normal` assertiveness, voting off, no leader, `equal` rations.
- **Acceptance 6: unchanged when off.** With `voting` off and no leader:
  - no new rng draw happens;
  - no action is gated;
  - the only new writes are `power.hierarchy.standings` / `computedDay` and `power.merit`.
  - Countermand and challenge rolls draw only while a leader exists or a challenge is made.
  - Seeded tests that move are updated knowingly and named in the commit message.
- **Analysis tool (overview P12).**
  - Every new chip, stat, ballot, button and panel option carries `data-analyze`.
  - Both new registries get `description`s and join `DESCRIBED_REGISTRIES`.
  - New concepts get glossary entries; new settings get a `setting_…` entry.
  - Live values (standing, leader, the vote tally, suppression days) get providers that read through `Knowledge`. Standing shows as a band word unless raw values are on.
  - `tests/ui/analyzeCoverage.test.ts` and `tests/analysis/hidden.test.ts` stay green.
- **Directive ids added here all start with `power:`:** `power:vote:<unitId>`, `power:leader`, `power:outside`, `power:challenge`, `power:countermand`. They are away from every prefix P9/P9d/P11 reserve: `loyalty:`, `refusal:`, `threat:`, `discipline:`, `demand:`, `reputation:`, `nickname`, `world:`, `stance:`, `friction:`, `content`, `limits:`, `lead`, `boundary:`, `want:`, `rule:`, `publicity:`, `co_command:`, `ask:`, `prologue:`.
- **Build and commit.** `dist/index.js` and `style.css` are committed; `npm test` rebuilds them. Check its exit code before committing. Commit messages end with the executing agent's `Co-Authored-By:` / `Claude-Session:` trailers.

## Where the plan rules on the spec (read before Task 1)

Rulings marked **(user)** were answered by the user on 2026-11-15. Task 14 copies all of them into the spec's **Implemented as**.

- **World options.** Both are entries of `content/core/worldOptions.json`, `live: false`, so they are locked after start.
  - **`squad_assertiveness`** (group `Soldiers`, default `normal`). Each choice carries one new effect:
    ```
    { type: 'squad_power', privilegeMult, demandMult, commanderVoteMult }
    ```
    | Choice | privilegeMult | demandMult | commanderVoteMult | Numbers |
    |---|---|---|---|---|
    | `low` | 0.5 | 0.75 | 1 | draft |
    | `normal` | 1 | 1 | 1 | — |
    | `high` | 1.5 | 1.25 | **0.75** | 0.75 is the spec's; the rest are draft |
  - **Lore lines.** Only `low` and `high` carry one, each ≤ 70 characters, so the 120-token WORLD SETTINGS block still fits (test in Task 1).
  - **`voting`** (group `Soldiers`, default `off`). Choice `on` carries the effect `{ type: 'voting' }` and a lore line. Choice `off` carries nothing.
  - **Readers.**
    - `assertiveness(state, reg)` multiplies the `squad_power` effects (no effect = all 1).
    - `votingOn(state, reg)` = some `voting` effect is present.
    - Neither is ever read by id.
  - **`summarizeWorldOptionEffect`** gains one line per new type.
  - **Who reads `demandMult`.** P9 `demandChance` multiplies by it now. P9c bookings will read it later.
  - **Presets.** The three existing presets name `squad_assertiveness: normal` and `voting: off`. The new preset `assertive_squad` ("Assertive squad") is the `standard` preset with `high` and `on`.
- **Vote shape (user): yes/no on the commander's pick.** The commander picks first. The squad votes FOR or AGAINST that pick. The commander always votes FOR. It passes when `forWeight ≥ againstWeight`, so a tie goes to the commander (tie-break).
- **Gated decisions.** `voteKinds` has five entries. For each one, a gate maps the action to `{ kind, subject }`:

  | Kind | Action | Subject | Gated when |
  |---|---|---|---|
  | `mission` | `expedition/start` with a `missionId` | mission id | the mission is on the board (not a `poi` run, not a tutorial run) |
  | `upgrade` | `base/upgrade` | facility id | always |
  | `punish` | `discipline/punish` | the target unit | the measure's `severity` is ≤ that of the punishment with the `bench` side effect, read by field, never by id |
  | `rations` | `rations/set` | the mode | a shortage is on or coming (rations ruling below) |
  | `scapegoat` | `dilemma/choose` on an open dilemma of context `scapegoat` | the option id `take_blame` / `shift_blame` | always |

  - **Registering a gate.** `registerVoteGate(actionType, (state, payload, reg) => { kind, subject } | null)` is a new hook in `dispatch.ts`, consulted before the handler.
  - **When a vote is needed.** If voting is on, a gate matches, and the payload's `voteId` does not name a vote that is `passed` or `overruled` with the same kind and subject today, the action returns `{ type: 'error', code: 'vote_needed', kind, subject }` and nothing changes.
  - **Spending the vote.** When the action then succeeds with a valid `voteId`, the vote becomes `carried` (it is spent once).
  - Gates never fire with voting off.
- **Vote flow.**
  - **`vote/open { kind, subject }`** computes every ballot and the tally and stores `power.votes.open`. It replaces an older open vote. It draws no rng.
  - **The VOTE panel** shows the ballots and the result. The app then either:
    - re-dispatches the original action with `voteId` (passed, or after an overrule), or
    - dispatches `vote/drop { voteId }`, which costs nothing (a failed vote that the commander accepts).
  - **`vote/overrule { voteId, means: 'order' | 'punish' | 'leash', punish?: { unitId, measure } }`** is allowed only on a failed vote. It always pays the spec's costs:
    - `decision_violated` moderate (engine-applied, confidence 1, scaled by witnesses as usual) on every unit that voted against;
    - `addRecord(+5, 'vote_overruled')` on each of them;
    - a **grudge** on each of them until the next day end: `power.grudges[unitId] = day`. While a grudge holds, her `refusalChance` is × `TUNING.power.vote.grudgeRefusalMult` (draft 1.5), and the scene directive `power:vote:<unitId>` says `{Name} voted against the commander's decision and was overruled; she may push back openly.` This is "defied-eligibility for the next day".
    - On top of those costs, the means adds its own usual cost:
      - `punish` also applies `applyPunishment` to one unit that voted against, with a measure the menu allows;
      - `leash` also spends one authorization through the existing Leash log (kind `compel`, target the loudest dissenter, which is the highest `|score| × weight` against);
      - `order` adds nothing more.
  - **End of an open vote.** An open vote that nobody carried, dropped or overruled is dropped at day end.
  - **The log.** `power.votes.log` keeps the last 30 resolved votes `{ id, day, kind, subject, result: 'carried' | 'dropped' | 'overruled', forWeight, againstWeight }`.
- **Ballots** (`ballotFor`, pure, draft weights in `TUNING.power.ballot`). For each named living active-roster unit, injured units included:
  ```
  score = Σ_axis effectiveValues(unit)[axis] × lean[axis]           // values −3…3; lean −2…2 per axis
        + clamp((trust − 50) / 25, −2, 2)                           // how she sees the commander
        + stance.voteBias                                            // commandStances field, draft: disciplined +1, fearful +1,
                                                                     //   indifferent 0, defiant_loyal −0.5, open_defiance −2
        − 1 if she has an open demand
        − 4 if she is the subject (punish target, scapegoat subject of `shift_blame`)
        − 2 × compatibility(unit, subject) for kind `punish` when she is not the subject
  vote = score ≥ 0 ? 'for' : 'against'
  ```
  - **`lean`** is the sum of three parts:
    - the kind's base `lean`;
    - the subject's lean:
      - `mission`: `missionTemplates[].voteLean` + `features.danger × (danger − 3)/2` + `features.command × (source === 'command' ? 1 : 0)`;
      - `upgrade`: `facilities[].voteLean`;
      - `rations` and `scapegoat`: `voteKinds[].subjects[subjectId]`.
  - **`compatibility(a, b)`** = `1 − Σ|a.values − b.values| / (6 × 6)`, ∈ [0, 1].
  - **Weights:** a named unit 1; the leader `1 × 1.5 × privilegeMult × (endorsed ? 1.5 : 1)` (chunk b); a grunt 0.5 following the leader's vote, or abstaining (weight 0) when there is no leader. The commander's weight is the spec formula × `commanderVoteMult`.
  - **Reason line.** It comes from the term with the largest absolute contribution (`values`, `trust`, `stance`, `demand`, `affected`): `voteKinds[].reasons[term][for|against]`, a template with `{name}` and `{axis}`. With setting `ballotWording` (default off), the app asks `flavor` kind `ballot` for all lines in one call; the template line is the fallback.
- **Rations (user): a small new choice.**
  - **State.** `base.rations?: 'equal' | 'fighters_first' | 'commander_short'` (absent = `equal`), set by `rations/set { mode }` from the BASE tab.
  - **The vote.** It is votable while `calendar.shortageStreak > 0` or `supplies < upkeepNeeded(...).needed`. Otherwise it is set freely.
  - **`runUpkeep` with a shortage:**
    - `equal` is today's code, unchanged.
    - `fighters_first`: reserve units take every share first, and active-roster units only take what is left over. With no reserve units it behaves like `equal`.
    - `commander_short`: `missing` is reduced by up to `TUNING.upkeep.commander`. On such a day the commander loses the next morning (`calendar.loseMorning = true`, the P7 mechanic), with the event `commander_went_hungry`.
- **Merit.** `finalizeCombat` appends one `power.merit` entry `{ day, unitId, points }` per surviving or downed squad unit. Points come from the combat log, draft:
  - damage dealt (`hit`/`crit` amounts as actor) / 10;
  - +5 per enemy `downed` where she was the last actor to hit it;
  - heals / 10.

  The log keeps 14 days. `meritOf(state, unitId)` = her sum ÷ the highest sum in the squad (0 when none).
- **Standing** (`standingOf`, integer):
  ```
  round(100 × (0.4 × meritOf + 0.3 × respect + 0.3 × impunity/100) × factor[leadStyle]) + standingBonus
  ```
  - `respect` = the mean `compatibility` with the other named living units (0.5 if she is alone).
  - `standingBonus` = +10 while a lost challenge's bonus holds.
  - **Recompute.** `power.hierarchy = { standings, leaderId?, endorsed, challengeCooldownUntil?, computedDay, deposed?, standingBonus?, outsideSuppressedUntil? }`. The power day step (registered on `director_tick`) recomputes it when `day − computedDay ≥ 7` or `computedDay` is absent.
  - **Leader rule.** The top unit is leader if:
    - her standing ≥ the second's + 10 (a lone unit has no second: a lone named unit is never leader);
    - `leadRank ≥ 2`;
    - she is not `deposed`.
  - **A change** emits `leader_changed { from?, to? }`, writes a public fact (`{Name} has become the one the squad looks to.` / `The squad no longer looks to {Name}.`), clears `endorsed`, and sets the one-scene directive `power:leader` for the new leader's next scene. That is the "scene hook".
  - **`removeFromService`** clears her as leader, her standing, her grudge and her merit.
- **Leader privileges** (all × `privilegeMult`, and × 1.5 while endorsed):
  - **Vote weight** (above).
  - **Contagion.** `contagionTerm` in `impunity.ts` weights the leader's record by `1 + privilegeMult × (endorsed ? 1.5 : 1)`, which is 2 at `normal`, and every other unit's by 1.
  - **Countermand.** `activities[].countermandable: true` (core: `train`, `rest`, `work`, `study`). On `activity/do` of such an activity with a companion or `unitIds` naming a named unit other than the leader, the engine rolls `TUNING.power.countermand.chance` (draft 0.2) × the multipliers, capped at 0.6, drawn only while a leader exists.
    - **On a hit,** nothing of the activity happens and no slot is spent. `power.countermand = { leaderId, unitId, payload, day, slot }` and the event `countermanded`.
    - **Chips** `[ACCEPT] [OVERRULE]` answer it with `power/countermand { answer }`:
      - ACCEPT drops it (the leader's call stands; event `countermand_accepted`).
      - OVERRULE re-runs the activity with `countermandChecked: true` and applies the engine event `leader_overruled` on the leader (draft row: Trust −3, moderate) plus `addRecord(leader, +3)`.
    - It is dropped at the next slot.
- **Endorse.** `power/endorse` works only for the current leader, and not when already endorsed. It:
  - sets `endorsed: true`;
  - applies the engine event `leader_endorsed` on her (draft: Trust +4, Affinity +3, major);
  - adds `+3` to the record of every other named living unit (spec: "his Impunity with others +");
  - writes the relation flag `co_command`, which is P9d's stand-in. Leaving leadership removes it unless her Dominance Drive Embrace set it. Deciding Embrace on the current leader endorses her.
  - **Directive ids.** P9d's `co_command:<unitId>` directive stays as is. The `power:leader` directive text adds `The commander has formally made {Name} second-in-command.`
- **Challenge (user): weighted dice.** `power/challenge { stat }`, where `stat` is `authority` / `empathy` (social rank) or `strength` / `endurance` / `reflexes` (body).
  - **When.** Allowed with a leader, no cooldown and no open scene.
  - **Her rank** = `clamp(round(standing / 26), 1, 5)`.
  - **Chance** = `clamp(0.5 + 0.12 × (commanderRank − herRank), 0.15, 0.85)` (draft), one seeded roll.
  - **Cooldown.** The cooldown is 14 days either way (`challengeCooldownUntil`).
  - **Win:**
    - `deposed = { unitId, untilDay: day + 14 }`;
    - the leader is cleared at once (`leader_changed`);
    - engine event `challenge_won` on her (draft: Affinity −3, stress +5, moderate);
    - `addRecord(her, −5)`.
  - **Loss:**
    - `standingBonus = { unitId, amount: 10, untilDay: day + 14 }`;
    - `addRecord(+10)` for every named living unit;
    - engine event `challenge_lost` on her (draft: Trust −2, minor).
  - **The scene.** The app then opens a scene with her (origin `event`, her quarters) with the directive `power:challenge`, which tells the outcome the engine already decided. The scene is not a dilemma and ignores the defining-dilemma limits.
- **Outside perception.**
  - **Active** while a leader exists and `day ≥ outsideSuppressedUntil`.
  - **The directive** `power:outside` (manual, refreshed by `applyContext`) reads:
    - normally: `Outsiders (oversight officers, traders, enemy commanders) address {Name} as the one who really runs the unit.`
    - endorsed: `Oversight treats {Name} as the commander's second-in-command; outsiders address both.`
  - **Oversight cc.** Leash log entries written while it is active get `cc: unitId`; the corporate voice card shows `CC: {Name}`.
  - **Feats** (`outsideFeats` registry `{ id, label, description, trigger }`). `trigger` is a closed vocabulary:
    - `crisis_cover`: a combat won with `encounter.exposesCommander`, the commander not downed and a cover chosen. `finalizeCombat` emits `commander_held`.
    - `ordered_mission`: an expedition `success` on a `command` mission during which the commander gave ≥ 1 combat order. This needs a new counter `ExpeditionState.orders?`, incremented by `combat/order` in a run.
    - `negotiation`: a `dilemma_resolved` with `routePassed` on a `social` route, or `checkPassed`. The event gains `routeKind`.
    - **A feat** sets `outsideSuppressedUntil = day + 14` and emits `outside_feat { featId }`. It is noted even with no leader, so a later leader starts suppressed.
  - **Endorsing** makes it the official arrangement (the endorsed text) and is never suppressed.
  - **Not built:** traders and parleys have no system, so the directive is their whole effect (open item).
- **Scapegoat.**
  - **Responsibility.** `Mission.decidedBy?: { voteId, unitId }` is set when `expedition/start` carries a vote that **passed** (not overruled). The unit is the FOR voter with the largest `weight × score`.
  - **"A failure oversight punishes" (user): deadline + beaten-back runs**, on missions with `source: 'command'` and `decidedBy`:
    - (a) `runDeadlines` fails it;
    - (b) `endExpedition` ends with `failed`. For (b) the engine adds the new oversight penalty: faction `own` −`TUNING.power.scapegoat.failedRunStanding` (draft 4) × `command_failure_mult`.
  - **Opening it.** `openScapegoat(draft, ctx, { missionId, unitId })` opens a **presented** dilemma directly. There is no model call, and the template is authored with `fixed` and no `generate`:
    - context `scapegoat` (new in `DILEMMA_CONTEXTS`);
    - `DilemmaState.subjectId` and `witnessIds` (the other FOR voters still living);
    - template `scapegoat_mission`.
    - If a dilemma is already open, it waits in `power.scapegoatQueue` and opens at the next day end.
    - Pacing never draws `scapegoat` templates.
  - **Effects.** `unit_event.targets` gains `subject` / `witnesses`. The loader allows them only on templates with context `scapegoat`, and `applyWorldEffects` reads them from `EffectSource.subjectId/witnessIds`.
  - **The new event `shielded`.** It is added to `EVENT_TYPES`, `eventDeltas` (draft: Trust +6, Affinity +3 at major), `TUNING.disposition.bigGesture.events` and the `intent_extract` vocabulary. This is P9's "shielded from oversight" with no producer.
  - **The new world effect `oversight_punish { days 1..3, stress 0..20 }`** confines the subject. It is a restriction `confined` with source `oversight`: no Impunity record, no `commander_enforced`. It also adds stress.
  - **Core options (draft numbers):**
    - **TAKE THE BLAME** (`take_blame`): faction `own` −5; `leash −1`; `unit_event shielded major → subject`; `unit_event shielded moderate → witnesses`.
    - **SHIFT IT** (`shift_blame`): `oversight_punish { days 2, stress 10 }`; `unit_event sided_against extreme → subject`; `unit_event sided_against moderate → witnesses`.
  - **P13 later** adds commander injury and confinement to TAKE THE BLAME.
  - **No "her call" dilemma** exists in the content yet. A leader's countermand never leads to an oversight failure. So votes are the only source in P9b (open item).
- **LEASHSWAP** (P13) is not implemented; nothing here (open item for P13).
- **Not in the spec, added:**
  - settings `ballotWording` (default off);
  - glossary entries `squad_power`, `voting`, `vote`, `standing`, `squad_leader`, `countermand`, `endorse`, `challenge`, `outside_perception`, `scapegoat`, `rations`, `setting_ballot_wording`;
  - ledger key `standing:<unitId>`.

## File Structure

```
content/core/{voteKinds,outsideFeats}.json                     new registries (+ manifest)
content/core/{worldOptions,worldPresets,commandStances,missionTemplates,facilities,activities,
              dilemmaTemplates,eventDeltas,glossary}.json      options, preset, voteBias, voteLean, countermandable, scapegoat template, rows, entries
src/content/{types,schemas,refs}.ts                             registries, effect types, fields, targets, context checks
src/engine/state/types.ts                                       CampaignState.power, base.rations, Mission.decidedBy, LeashLogEntry.cc
src/engine/world/types.ts, dilemma/types.ts                     ExpeditionState.orders, DilemmaState.subjectId/witnessIds, 'scapegoat' context
src/engine/tuning.ts                                            TUNING.power
src/engine/dispatch.ts                                          registerVoteGate + the gate check
src/engine/power/{options,ballot,votes,rations,standing,leader,outside,scapegoat,dayStep,index}.ts
src/engine/actions/power.ts                                     vote/*, rations/set, power/* actions, gates, day step
src/engine/{economy,activities}.ts, discipline/{demands,impunity}.ts, loyalty/refusal.ts, combat/outcome.ts,
src/engine/world/{missions,expedition,effects}.ts, dilemma/flow.ts, leash/use.ts, relations/vocab.ts, arcs.ts    hook points
src/power/{controller,directives,deps}.ts                       VOTE flow, ballot wording, directives, scene openings
src/app.ts, src/settings.ts, src/llm/calls/flavor.ts (kind 'ballot')
src/analysis/providers/power.ts, analysis/{effects,describe}.ts
src/ui/power/{votePanel,hierarchy,chips}.ts, ui/base/baseTab.ts, ui/ops/missionBoard.ts, ui/discipline/menu.ts,
src/ui/dilemma/dilemmaPanel.ts, ui/squad/squadTab.ts, ui/voice/voiceCard.ts, ui/shell/sysTab.ts
css/74-power.css
docs/MANUAL_TEST_P9b.md, docs/CONTENT.md, docs/00-overview.md, docs/packages/{P9b,P9c,P13}-*.md, docs/ROADMAP-next.md
tests/**                                                        mirrors src; tests/helpers/power.ts
```

## Review Focus

1. **The same gated action is clicked twice, or a stale `voteId` is reused** (another day, another subject, already `carried`, or `dropped`). The action returns `vote_needed` again; it never runs twice on one vote, and never runs on a vote for another subject. Test in Task 3 (`a carried vote cannot be reused`, `a vote for another subject does not unlock this one`).
2. **The leader or a voter dies, deserts or is terminated with a vote, a countermand, a grudge or a scapegoat open on her.** `removeFromService` clears her. An open vote is re-tallied when the panel next reads it (ballots of units no longer living drop). A queued scapegoat whose subject is gone is dropped with no effects. Tests in Tasks 3, 8 and 12.
3. **A pre-P9b save, or a squad of modest bond profiles.** It loads, no gate fires, no leader ever appears (modest = balanced), the day step runs, and the rng state after 7 day ends equals a run with the power day step unregistered. Test in Task 7 (`acceptance 6: nothing changes with voting off and no leader`).
4. **Voting is on, but the decision is outside the votable set** (a `poi` run, the tutorial run, a punishment above `bench`, `rations/set` with no shortage). It is not gated and runs as before. Test in Task 3 (`not gated: poi, tutorial, brig, rations without shortage`).
5. **A tie, and a squad that is all grunts or all injured.** The tie goes to the commander. Grunts with no leader abstain. A vote with no ballots passes, with only the commander's weight. Test in Task 2.

---

## Chunk (a) — Assertiveness, voting, rations

### Task 1: World options, power state and the readers

**Files:**
- Create: `src/engine/power/{options,index}.ts`, `src/engine/actions/power.ts`, `tests/engine/power/options.test.ts`, `tests/content/p9bSchemas.test.ts`, `tests/helpers/power.ts`
- Modify: `content/core/{worldOptions,worldPresets,glossary}.json`, `src/content/schemas.ts` (`WorldOptionEffectSchema`), `src/analysis/effects.ts` (`summarizeWorldOptionEffect`), `src/engine/state/types.ts`, `src/engine/tuning.ts`, `src/engine/discipline/demands.ts` (`demandChance`), `src/app.ts` (import `./engine/actions/power` next to `actions/bonds`)

**Interfaces:**
- Produces:
  - `assertiveness(state: WorldHolder, reg): { privilegeMult: number; demandMult: number; commanderVoteMult: number }`
  - `votingOn(state: WorldHolder, reg): boolean`
  - `powerOf(draft): PowerState`, which creates the object on first write
  - types `PowerState { votes: { open?: Vote; log: VoteLogEntry[]; seq: number }; grudges?: Record<string, number>; hierarchy?: Hierarchy; merit?: MeritEntry[]; countermand?: Countermand; scapegoatQueue?: Array<{ missionId: string; unitId: string; witnessIds: string[] }> }`
  - `Vote { id, kind, subject, day, ballots: Ballot[], commanderWeight, forWeight, againstWeight, passed: boolean, status: 'open'|'passed'|'failed'|'overruled'|'carried'|'dropped' }`
  - `Ballot { unitId, vote: 'for'|'against'|'abstain', weight, score, term: BallotTerm }`
  - `Hierarchy` with the fields of the rulings, `BaseState.rations?`, `Mission.decidedBy?`
  - `TUNING.power` with every draft number of the rulings
  - `tests/helpers/power.ts`: `withOptions(state, { squad_assertiveness?, voting? })`, `withLeader(state, unitId, opts?)`
- Consumes: `worldEffects` (P8), `demandChance` (P9).

- [x] **Step 1: Write the failing tests.**
  - `p9bSchemas`:
    - `squad_assertiveness has low/normal/high with one squad_power effect each`
    - `voting defaults to off and its on choice carries a voting effect`
    - `every preset names both new options; assertive_squad sets high and on`
    - `the WORLD SETTINGS block of every preset fits 120 tokens`: run `worldSettingsLine` over each preset with the new lore lines.
  - `options.test`:
    - `no option stored reads normal and voting off`
    - `high reads commanderVoteMult 0.75`
    - `demandChance scales by demandMult` (same state, `high` vs `normal`, ratio 1.25)
    - `an old save without power runs a day end`
- [x] **Step 2: Run** `npx vitest run tests/engine/power tests/content/p9bSchemas.test.ts` and confirm FAIL (missing modules / entries).
- [x] **Step 3: Implement.** Schema entries:
  - `{ type: 'squad_power', privilegeMult: 0.25..3, demandMult: 0.25..3, commanderVoteMult: 0.25..2 }`
  - `{ type: 'voting' }`

  Add the JSON entries and the lore lines of the rulings, plus `summarizeWorldOptionEffect` lines: `Leader privileges ×{p}; demands ×{d}; the commander's vote ×{c}.` / `Some decisions go to a squad vote.` Glossary: `squad_power`, `voting`.
- [x] **Step 4: Run** the same tests, then `npm test`. Expect PASS.
- [x] **Step 5: Tick the boxes and commit:** `feat(power): squad assertiveness and voting world options`.

### Task 2: voteKinds, ballots and the tally

**Files:**
- Create: `content/core/voteKinds.json`, `src/engine/power/ballot.ts`, `tests/engine/power/ballot.test.ts`
- Modify: `src/content/{types,schemas,refs}.ts`, `content/core/{manifest,commandStances,missionTemplates,facilities}.json` (`voteBias`, `voteLean` drafts), `src/analysis/describe.ts` (`DESCRIBED_REGISTRIES`)

**Interfaces:**
- Produces:
  - `VOTE_KINDS = ['mission','upgrade','punish','rations','scapegoat'] as const`, `type VoteKind`
  - `compatibility(a: Pick<Unit,'values'>, b: Pick<Unit,'values'>): number`
  - `leanFor(state, reg, kind: VoteKind, subject: string): Partial<Record<ValueAxis, number>>`
  - `ballotFor(state, reg, unit: Unit, kind, subject): Ballot`
  - `commanderVoteWeight(state, reg): number`
  - `tallyVote(state, reg, kind, subject): Pick<Vote, 'ballots'|'commanderWeight'|'forWeight'|'againstWeight'|'passed'>`
  - `subjectOf(kind, subject)`: the unit id a `punish`/`scapegoat` vote is about, or null
- Consumes: `effectiveValues` (P8), `commandStance` / `stanceEntry` (P9), `socialRank`, `bondOf`.

- [x] **Step 1: Write the failing tests** (table tests, acceptance 1):
  - `a corporate unit votes for a command mission, an autonomous one against` (values `corporate 3` vs `autonomy 3`, trust 50, stance indifferent)
  - `trust 100 adds +2, trust 0 adds −2`
  - `open_defiance tips a neutral unit against; fearful tips her for`
  - `an open demand subtracts 1`
  - `the punish target votes against herself; a like-minded unit leans against; an opposite one does not`
  - `commander weight: Authority 1 → 1, 3 → 2, 5 → 3; high assertiveness × 0.75`
  - `a tie passes`
  - `grunts abstain without a leader`
  - `a squad of only grunts or only injured: the vote passes on the commander's weight alone`
  - `the reason term is the largest absolute contribution`
  - `voteKinds loads five kinds with descriptions; a reason template without {name} is a load error`
- [x] **Step 2: Run** `npx vitest run tests/engine/power/ballot.test.ts tests/content/p9bSchemas.test.ts` and confirm FAIL.
- [x] **Step 3: Implement.**
  - `VoteKindSchema { label ≤ 40, description, lean, features?: { danger?, command? } (each a lean), subjects?: Record<id, lean>, reasons: Record<BallotTerm, { for: str ≤ 120, against: str ≤ 120 }> }`. A lean is `Partial<Record<ValueAxis, -2..2>>`.
  - `voteBias: −3..3` on `CommandStanceSchema`, and `voteLean` on missions and facilities.
  - The ballot formula is exactly the rulings'. Leader weights come in Task 8: `tallyVote` reads `power.hierarchy?.leaderId` already, but no leader exists yet.
  - JSON drafts:
    - `mission` lean `{}`, features `danger: { sacrifice: 1, pragmatism: -1 }`, `command: { corporate: 1, autonomy: -1 }`.
    - `upgrade` lean `{ pragmatism: 1 }`.
    - `punish` lean `{ corporate: 1, mercy: -1 }`.
    - `rations` subjects:
      - `equal`: `{ ingroup: 1 }`
      - `fighters_first`: `{ pragmatism: 1, ingroup: -1 }`
      - `commander_short`: `{ sacrifice: 1, mercy: 1 }`
    - `scapegoat` subjects:
      - `take_blame`: `{ mercy: 1, ingroup: 1 }`
      - `shift_blame`: `{ corporate: 1, ingroup: -1 }`
    - Reason texts are `AUTHOR TO WRITE` drafts.
- [x] **Step 4: Run** the tests. Expect PASS. Then `npm test`.
- [x] **Step 5: Tick and commit:** `feat(power): vote kinds, ballots and the tally`.

### Task 3: The vote flow, the gate and overruling

**Files:**
- Create: `src/engine/power/votes.ts`, `tests/engine/power/votes.test.ts`
- Modify: `src/engine/dispatch.ts`, `src/engine/actions/power.ts`, `src/engine/loyalty/refusal.ts` (grudge multiplier), `src/engine/leash/use.ts` (`removeFromService` forgets power state; the `leash` means)

**Interfaces:**
- Produces:
  - `registerVoteGate(actionType: string, gate: (state, payload: unknown, reg) => { kind: VoteKind; subject: string } | null): void` (in `dispatch.ts`)
  - `openVote(draft, ctx, kind, subject): EngineEvent[]` → `vote_opened`
  - `dropVote(draft, voteId)` → `vote_dropped`
  - `overruleVote(draft, ctx, voteId, means, punish?)` → `vote_overruled` + the costs' events
  - `voteFor(state, kind, subject, voteId): Vote | null` (a usable `passed`/`overruled` vote)
  - `carryVote(draft, voteId)` → `vote_carried`
  - `grudgeHolds(state, unitId): boolean`
  - `forgetPower(draft, unitId)`
  - actions `vote/open { kind, subject }`, `vote/drop { voteId }`, `vote/overrule { voteId, means, punish? }`
  - gates for `expedition/start`, `base/upgrade`, `discipline/punish`
  - the error event `{ type: 'error', code: 'vote_needed', kind, subject }`
- Consumes: `tallyVote` (Task 2), `applyEventToUnit`, `addRecord`, `applyPunishment`, the Leash log writer in `leash/use.ts`.

- [x] **Step 1: Write the failing tests.**
  - `voting off: expedition/start runs without a vote`
  - `voting on: expedition/start from the board returns vote_needed and changes nothing`
  - `with a passed vote it runs and the vote is carried`
  - `a carried vote cannot be reused`
  - `a vote for another subject does not unlock this one`
  - `a vote from yesterday does not unlock today`
  - `not gated: poi, tutorial, brig, rations without shortage`
  - `drop of a failed vote costs nothing`
  - `overrule applies decision_violated moderate and +5 record to each against voter, and the action then runs` (acceptance 2)
  - `overrule by leash spends one authorization; with none left it is refused and changes nothing`
  - `overrule by punish applies the measure to the named dissenter`
  - `a grudge multiplies refusal chance by 1.5 until the next day end`
  - `an open vote is dropped at day end`
  - `removeFromService clears her grudge and ballot`
  - `vote/overrule on a passed vote is refused`
- [x] **Step 2: Run** `npx vitest run tests/engine/power/votes.test.ts` and confirm FAIL.
- [x] **Step 3: Implement.**
  - The gate check sits in `dispatch` after the existing guards. Gates run only while `votingOn`.
  - On success of a gated action whose payload carries `voteId`, dispatch calls `carryVote` on the draft before returning, so the vote is spent in the same state.
  - Overrule costs use `applyEventToUnit` with event `decision_violated`, severity `moderate`, confidence 1 and `scale` as for a witnessed event. The record uses `addRecord(draft, id, TUNING.power.vote.overruleRecord /*5*/, 'vote_overruled')`.
  - Vote ids are `v<seq>`.
- [x] **Step 4: Run** the tests. Expect PASS. Run `npm test`; seeded tests must not move (no rng is drawn).
- [x] **Step 5: Tick and commit:** `feat(power): vote flow, gate and overruling`.

### Task 4: Rations

**Files:**
- Create: `src/engine/power/rations.ts`, `tests/engine/power/rations.test.ts`
- Modify: `src/engine/economy.ts` (`runUpkeep`), `src/engine/actions/power.ts` (action + gate), `src/engine/actions/base.ts` if `base/*` guards live there

**Interfaces:**
- Produces:
  - `RATION_MODES = ['equal','fighters_first','commander_short'] as const`
  - `rationsOf(state): RationMode`
  - `rationsVotable(state, reg): boolean`
  - action `rations/set { mode }` → `rations_set { mode }`
  - event `commander_went_hungry`
- Consumes: `upkeepNeeded`, `spread`, `calendar.loseMorning` (P7).

- [x] **Step 1: Write the failing tests.**
  - `equal is byte-identical to the old upkeep` (same state and events with `base.rations` absent and `equal`)
  - `fighters_first puts the shortage on reserve units first`
  - `fighters_first without reserve units equals equal`
  - `commander_short covers up to the commander's share and loses the next morning`
  - `rations/set is gated only while a shortage is on or coming`
  - `an unknown mode is refused`
- [x] **Step 2: Run** `npx vitest run tests/engine/power/rations.test.ts` and confirm FAIL.
- [x] **Step 3: Implement** the three modes in `runUpkeep`, behind `rationsOf`. No rng.
- [x] **Step 4: Run** the tests, then `npm test`. Expect PASS.
- [x] **Step 5: Tick and commit:** `feat(power): ration modes and their vote`.

### Task 5: The non-engine layer: VOTE controller, ballot wording, grudge directives

**Files:**
- Create: `src/power/{controller,directives,deps}.ts`, `tests/power/{controller,directives}.test.ts`
- Modify: `src/app.ts` (create `app.power`; route `vote_needed`), `src/settings.ts` (`ballotWording`), `src/llm/calls/flavor.ts` (register kind `ballot`), `tests/content/pronouns.test.ts`

**Interfaces:**
- Produces:
  - `createPower(deps): PowerController` with:
    - `onEvents(events)`;
    - `requestVote(action: Action): Promise<'ran' | 'dropped' | 'cancelled'>`, which dispatches the action, opens the vote on `vote_needed`, shows the panel through `deps.showVote`, and re-dispatches with `voteId` on carry or after an overrule;
    - `overrule(voteId, means, punish?)`, `drop(voteId)`;
    - `ballotLines(vote): Promise<Record<unitId, string>>` (template lines, or the `flavor` call when `ballotWording`).
  - `powerDirectives(state, reg, present: string[]): Directive[]` (`power:vote:<unitId>`)
  - `clearPowerDirectives(ctx)`
- Consumes: `vote/*` actions, `generateFlavor`, `ContextBuilder`.

- [ ] **Step 1: Write the failing tests.**
  - `requestVote runs an ungated action directly`
  - `on vote_needed it opens the vote, shows the panel and, on carry, re-dispatches with the voteId`
  - `cancel drops the vote`
  - `ballot lines fall back to templates when flavor fails or the setting is off`
  - `a grudge directive appears for a present overruled voter and is gone after the day end`
  - `no directive text gives the commander a pronoun` (pronouns test covers `voteKinds` and `src/power/directives.ts`)
- [ ] **Step 2: Run** `npx vitest run tests/power` and confirm FAIL.
- [ ] **Step 3: Implement** like `createDiscipline`. `applyContext` refreshes the power directives. The `flavor` kind `ballot` takes `{ kind, subjectLabel, ballots: [{ name, vote, term }] }` and returns one line per name (≤ 120 chars each), with the template as fallback.
- [ ] **Step 4: Run** the tests. Expect PASS. Then `npm test`.
- [ ] **Step 5: Tick and commit:** `feat(power): vote controller, ballot wording and grudge directives`.

### Task 6: VOTE panel, rations control, providers

**Files:**
- Create: `src/ui/power/votePanel.ts`, `src/analysis/providers/power.ts`, `css/74-power.css`, `tests/ui/votePanel.test.ts`
- Modify: `src/ui/ops/missionBoard.ts`, `src/ui/expedition/planner.ts` (launch goes through `app.power.requestVote`), `src/ui/base/baseTab.ts` (upgrade through `requestVote`; a RATIONS row with three options), `src/ui/discipline/menu.ts` (punish through `requestVote`), `content/core/glossary.json`, `src/ui/shell/sysTab.ts` (`ballotWording`)

**Interfaces:**
- Produces:
  - `renderVotePanel(host, vote: Vote, lines, { onCarry, onDrop, onOverrule }): void`. It shows:
    - one ballot row per voter: name, FOR/AGAINST/ABSTAIN, weight, reason line;
    - the commander's row;
    - the tally and the result;
    - buttons `[CARRY OUT]` (passed), `[ACCEPT]` (failed: drop), and `[OVERRULE: ORDER] [OVERRULE: PUNISH…] [OVERRULE: LEASH]` (failed).
  - `registerPowerProviders()` with providers:
    - `vote` (tally and weights);
    - `ballot:<unitId>` (score terms as words unless raw values are on);
    - `rations`.
- Consumes: `app.power`, the `Knowledge` filter.

- [ ] **Step 1: Write the failing tests.**
  - `a passed vote shows CARRY OUT and no overrule`
  - `a failed vote shows ACCEPT and three overrule buttons; LEASH is aria-disabled with no authorization left`
  - `every ballot row, button and the tally carry data-analyze that resolves`, reusing `analyzeCoverage` helpers
  - `the rations row shows the three modes and the current one`
  - `the analyze reading of a ballot hides raw scores unless raw values are on`
  - Extend `tests/ui/analyzeCoverage.test.ts` with the panel and the rations row.
- [ ] **Step 2: Run** `npx vitest run tests/ui/votePanel.test.ts tests/ui/analyzeCoverage.test.ts tests/analysis` and confirm FAIL.
- [ ] **Step 3: Implement** with `h()` and the `corporate` voice for the panel frame. The punish overrule picks a dissenter and a measure from the existing menu list.
- [ ] **Step 4: Run** the tests. Expect PASS. Then `npm test`.
- [ ] **Step 5: Tick and commit:** `feat(ui): VOTE panel, rations control and vote readings`.

**Chunk (a) ends here.**

---

## Chunk (b) — Standing, leader, privileges, endorse/challenge, outside perception

### Task 7: Merit, standing and the leader

**Files:**
- Create: `src/engine/power/{standing,dayStep}.ts`, `tests/engine/power/standing.test.ts`
- Modify: `src/engine/combat/outcome.ts` (`finalizeCombat` writes merit), `src/engine/actions/power.ts` (register `powerDayStep` on `director_tick`), `src/engine/leash/use.ts` (`forgetPower` in `removeFromService`), `src/engine/ledger.ts` (`standing:<unitId>`)

**Interfaces:**
- Produces:
  - `recordMerit(draft, result: CombatResult): void`
  - `meritOf(state, unitId): number`
  - `respectOf(state, unitId): number`
  - `standingOf(state, reg, unitId): number | null`
  - `computeHierarchy(draft, reg): EngineEvent[]` → `leader_changed`, plus the fact
  - `leaderOf(state): Unit | null`
  - `powerDayStep(draft, ctx): EngineEvent[]` (recompute when due; drop the open vote; end grudges; open a queued scapegoat in Task 12)
- Consumes: `impunityOf`, `bondOf`, `leadRank`, `compatibility` (Task 2), `addFact`.

- [ ] **Step 1: Write the failing tests.**
  - `merit counts damage, finishing blows and heals; older than 14 days drops out`
  - `standing matches the formula` (a table of three units with fixed merit/values/Impunity)
  - `a dominant unit 10 ahead becomes leader; 9 ahead does not`
  - `a balanced or modest unit never becomes leader, however far ahead`
  - `recomputed only weekly`
  - `a lone named unit is never leader`
  - `leader_changed writes the public fact and clears endorsed`
  - `removeFromService of the leader clears her at once`
  - `acceptance 6: nothing changes with voting off and no leader` (modest squad, 7 day ends; the rng state equals the run with `powerDayStep` unregistered via `resetDayEndSteps` + re-registration of the others)
- [ ] **Step 2: Run** `npx vitest run tests/engine/power/standing.test.ts` and confirm FAIL.
- [ ] **Step 3: Implement** with the rulings' formulas; draft merit weights go in `TUNING.power.merit`.
- [ ] **Step 4: Run** the tests, then `npm test`. Seeded combat tests may gain `power.merit`; update snapshots knowingly.
- [ ] **Step 5: Tick and commit:** `feat(power): merit, standing and the squad leader`.

### Task 8: Leader privileges: vote weight, grunts, contagion, countermand

**Files:**
- Create: `src/engine/power/leader.ts`, `tests/engine/power/leader.test.ts`
- Modify: `src/engine/power/ballot.ts` (leader weight, grunts follow), `src/engine/discipline/impunity.ts` (`contagionTerm`), `src/engine/activities.ts` (countermand roll in `runActivity`), `content/core/{activities,eventDeltas}.json` (`countermandable`, row `leader_overruled`), `src/engine/relations/vocab.ts` (`ENGINE_EVENT_TYPES` + `leader_overruled`, `leader_endorsed`, `challenge_won`, `challenge_lost`), `src/engine/actions/power.ts`

**Interfaces:**
- Produces:
  - `privilegeScale(state, reg): number` (= `privilegeMult × (endorsed ? 1.5 : 1)`)
  - `leaderVoteWeight(state, reg): number`
  - `rollCountermand(draft, ctx, req: ActivityRequest): EngineEvent[] | null` (null = no countermand)
  - action `power/countermand { answer: 'accept' | 'overrule' }`
  - events `countermanded`, `countermand_accepted`, `countermand_overruled`
- Consumes: `leaderOf` (Task 7), `applyEventToUnit`, `addRecord`.

- [ ] **Step 1: Write the failing tests.**
  - `the leader's vote weighs 1.5 at normal, 2.25 at high, 0.75 at low`
  - `grunts follow the leader's vote at 0.5`
  - `contagion counts the leader's record twice at normal`
  - `a countermandable activity with another unit can be countermanded: no slot spent, nothing applied`
  - `no roll without a leader (rng untouched)`
  - `a non-countermandable activity or one with only the leader is never countermanded`
  - `ACCEPT drops it; OVERRULE runs the activity once and applies leader_overruled and +3 record`
  - `a countermand left open is dropped at the next slot`
  - `privileges scale with the option` (acceptance 3: chance at low / normal / high)
- [ ] **Step 2: Run** `npx vitest run tests/engine/power/leader.test.ts tests/engine/discipline` and confirm FAIL.
- [ ] **Step 3: Implement.** `runActivity` calls `rollCountermand` first, unless the payload has `countermandChecked: true`. The `eventDeltas` rows are drafts.
- [ ] **Step 4: Run** the tests, then `npm test`. P9 Impunity tests must stay green (no leader means no change).
- [ ] **Step 5: Tick and commit:** `feat(power): leader privileges and countermand`.

### Task 9: Endorse and challenge

**Files:**
- Modify: `src/engine/power/leader.ts`, `src/engine/actions/power.ts`, `src/engine/arcs.ts` (Embrace on the leader endorses), `content/core/eventDeltas.json` (rows `leader_endorsed`, `challenge_won`, `challenge_lost`)
- Test: `tests/engine/power/challenge.test.ts`

**Interfaces:**
- Produces:
  - `endorse(draft, ctx): EngineEvent[]` → `leader_endorsed`
  - `challengeChance(state, reg, stat: ChallengeStat): number`
  - `challenge(draft, ctx, stat): EngineEvent[]` → `challenge_resolved { unitId, stat, chance, won }`
  - `ChallengeStat = 'authority'|'empathy'|'strength'|'endurance'|'reflexes'`
  - actions `power/endorse`, `power/challenge { stat }`
- Consumes: `socialRank`, `commanderProfile(state).body`, `standingOf`, `addRecord`.

- [ ] **Step 1: Write the failing tests.**
  - `endorse: Trust/Affinity up for her, +3 record for every other named unit, co_command flag set`
  - `endorse twice or without a leader is refused`
  - `privileges ×1.5 while endorsed`
  - `challenge chance: equal ranks 0.5, +2 ranks 0.74, clamped at 0.15/0.85`
  - `a win deposes her for 14 days and she cannot be leader again before then`
  - `a loss: +10 standing for 14 days and +10 record for everyone`
  - `a second challenge inside the cooldown is refused`
  - `a challenge draws exactly one rng value`
  - `Embrace of Dominance Drive on the leader endorses her`
  - `leaving leadership removes co_command unless Embrace set it`
- [ ] **Step 2: Run** `npx vitest run tests/engine/power/challenge.test.ts` and confirm FAIL.
- [ ] **Step 3: Implement** per the rulings.
- [ ] **Step 4: Run** the tests, then `npm test`. Expect PASS.
- [ ] **Step 5: Tick and commit:** `feat(power): endorse and challenge the leader`.

### Task 10: Outside perception and feats

**Files:**
- Create: `content/core/outsideFeats.json`, `src/engine/power/outside.ts`, `tests/engine/power/outside.test.ts`
- Modify: `src/content/{types,schemas}.ts`, `content/core/manifest.json`, `src/engine/combat/outcome.ts` (`commander_held`), `src/engine/world/{types,expedition}.ts` (`ExpeditionState.orders`, check at `success`), `src/engine/actions/combat.ts` (count orders in a run), `src/engine/dilemma/flow.ts` (`routeKind` on `dilemma_resolved`), `src/engine/leash/use.ts` + `state/types.ts` (`LeashLogEntry.cc?`)

**Interfaces:**
- Produces:
  - `OUTSIDE_TRIGGERS = ['crisis_cover','ordered_mission','negotiation'] as const`
  - `noteFeat(draft, reg, trigger): EngineEvent[]` → `outside_feat { featId }`, for the first registry entry with that trigger
  - `outsideActive(state): boolean`
  - `outsideSuppressedFor(state): number` (days left)
- Consumes: `leaderOf`, the three engine sites above.

- [ ] **Step 1: Write the failing tests.**
  - `outside perception is active with a leader and no feat`
  - `each trigger suppresses it for 14 days`
  - `a feat noted with no leader still suppresses a leader appointed later`
  - `endorsed: active and never suppressed`
  - `a Leash log entry written while active carries cc`
  - `negotiation needs a passed social route or a passed check; a passed body route is not a negotiation`
  - `ordered_mission needs a command mission and at least one order`
  - `outsideFeats loads three feats with descriptions; an unknown trigger is a load error`
- [ ] **Step 2: Run** `npx vitest run tests/engine/power/outside.test.ts` and confirm FAIL.
- [ ] **Step 3: Implement.** `noteFeat` is called at the three sites; it draws no rng.
- [ ] **Step 4: Run** the tests, then `npm test`. Expect PASS.
- [ ] **Step 5: Tick and commit:** `feat(power): outside perception and feats`.

### Task 11: Hierarchy UI, directives and providers

**Files:**
- Create: `src/ui/power/{hierarchy,chips}.ts`, `tests/ui/hierarchy.test.ts`
- Modify: `src/power/{directives,controller}.ts`, `src/ui/squad/squadTab.ts` (STANDING stat and LEADER badge in the dossier; ENDORSE / CHALLENGE buttons with a stat picker that shows each stat's chance), `src/ui/scene/sceneScreen.ts` / `src/ui/hub/hubScreen.ts` (countermand chips where activity results show), `src/ui/voice/voiceCard.ts` (`CC: {Name}`), `src/analysis/providers/power.ts`, `content/core/glossary.json`, `tests/power/directives.test.ts`

**Interfaces:**
- Produces:
  - directives `power:leader` (one scene, her next scene; endorsed text), `power:outside` (manual), `power:challenge` (scene: the decided outcome), `power:countermand` (next reply, when the commander overrules her in her presence)
  - `drawCountermandChips(host, state, onAnswer)`
  - `renderHierarchyBlock(host, state, reg, unitId, { onEndorse, onChallenge })`
  - providers `standing:<unitId>` (terms as words; band `low` < 40 ≤ `notable` < 70 ≤ `dominant`, draft), `leader`, `outside`
  - `app.power.challenge(stat)`, which dispatches and then opens the scene with her (origin `event`, her quarters)
- Consumes: Tasks 7–10, `beginScene`.

- [ ] **Step 1: Write the failing tests.**
  - `the dossier shows STANDING as a band and the LEADER badge on the leader only`
  - `ENDORSE and CHALLENGE show only on the leader; CHALLENGE is aria-disabled in cooldown with the days left`
  - `countermand chips call power/countermand`
  - `power:outside is set while active and cleared on a feat`
  - `power:challenge carries the decided outcome into the scene`
  - `the voice card shows CC: {Name}`
  - `no new text gives the commander a pronoun`
  - Coverage: extend `analyzeCoverage` with the dossier block and the chips.
- [ ] **Step 2: Run** `npx vitest run tests/ui/hierarchy.test.ts tests/power tests/ui/analyzeCoverage.test.ts tests/analysis` and confirm FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests, then `npm test`. Expect PASS.
- [ ] **Step 5: Tick and commit:** `feat(ui): hierarchy in the dossier, countermand chips and leader directives`.

**Chunk (b) ends here.**

---

## Chunk (c) — Scapegoat, docs

### Task 12: Scapegoat engine

**Files:**
- Create: `src/engine/power/scapegoat.ts`, `tests/engine/power/scapegoat.test.ts`
- Modify:
  - `src/engine/dilemma/{types,flow}.ts`: context `scapegoat`, `subjectId` / `witnessIds`, pacing skips it.
  - `src/content/schemas.ts`: `unit_event.targets` + `subject` / `witnesses` only on `scapegoat` templates; world effect `oversight_punish`; `isCostEffect` counts it.
  - `src/engine/world/{effects,missions,expedition}.ts`: targets, `decidedBy`, the two triggers, the failed-run penalty.
  - `src/engine/relations/vocab.ts`, `content/core/eventDeltas.json`: `shielded`.
  - `src/engine/tuning.ts`: `bigGesture.events` + `shielded`.
  - `src/llm/calls/intentExtract.ts`: the vocabulary line.
  - `content/core/dilemmaTemplates.json`: `scapegoat_mission`.
  - `src/engine/actions/power.ts`: gate for `dilemma/choose` on a scapegoat.
  - `src/analysis/effects.ts`: summary lines for the new effect and targets.

**Interfaces:**
- Produces:
  - `responsibleFor(vote: Vote): string | null`
  - `openScapegoat(draft, ctx, { missionId, unitId, witnessIds }): EngineEvent[]` → `dilemma_presented` with `context: 'scapegoat'`, or queued
  - `scapegoatOptionId(option)`: `take_blame` / `shift_blame`, read from the authored option's new `id` field
  - world effect `oversight_punish`
  - event type `shielded`
- Consumes: `addRestriction` (source `oversight`), `applyWorldEffects`, `failureEffectsOf`, `carryVote` (Task 3 sets `decidedBy`).

- [ ] **Step 1: Write the failing tests.**
  - `a passed mission vote marks decidedBy with the strongest FOR voter; an overruled one does not`
  - `a decided command mission that expires opens the scapegoat`
  - `a decided command run that ends failed costs the new standing penalty × command_failure_mult and opens the scapegoat`
  - `a retreat does not open it; a non-command mission does not`
  - `TAKE THE BLAME: own standing −5, Leash −1, shielded major on her and moderate on witnesses` (acceptance 5)
  - `SHIFT IT: she is confined 2 days with no Impunity record change, stress +10, sided_against extreme on her and moderate on witnesses` (acceptance 5)
  - `with voting on, choosing an option needs a scapegoat vote`
  - `with a dilemma open it is queued and opens at the next day end`
  - `a queued scapegoat whose subject is gone is dropped with no effects`
  - `subject/witnesses targets on a non-scapegoat template are a load error`
  - `shielded is a big gesture`
  - `pacing never draws a scapegoat template`
- [ ] **Step 2: Run** `npx vitest run tests/engine/power/scapegoat.test.ts tests/engine/dilemma tests/content` and confirm FAIL.
- [ ] **Step 3: Implement.** `EventOptionSchema` gains an optional `id` (slug), used by `scapegoat_mission`. Option texts are `AUTHOR TO WRITE` drafts; the numbers are the rulings' drafts.
- [ ] **Step 4: Run** the tests, then `npm test`. Expect PASS. `EVENT_TYPES` grows by one; update the counts in the vocab tests knowingly.
- [ ] **Step 5: Tick and commit:** `feat(power): scapegoat after a failure the squad chose`.

### Task 13: Scapegoat in the dilemma panel

**Files:**
- Modify: `src/ui/dilemma/dilemmaPanel.ts` (subject name, witnesses, both options with their effect lines; choose through `app.power.requestVote`), `src/loyalty/dilemmaController.ts` (no model request for `scapegoat`), `content/core/glossary.json` (`scapegoat`), `src/analysis/providers/power.ts`
- Test: `tests/ui/scapegoatPanel.test.ts`

**Interfaces:**
- Consumes: Task 12, `app.power.requestVote`.

- [ ] **Step 1: Write the failing tests.**
  - `the panel names the responsible unit and the witnesses`
  - `each option lists its effects through summarizeWorldEffect, with data-analyze`
  - `with voting on, choosing opens the VOTE panel first`
  - `no model call is made for a scapegoat`
- [ ] **Step 2: Run** `npx vitest run tests/ui/scapegoatPanel.test.ts` and confirm FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests, then `npm test`. Expect PASS.
- [ ] **Step 5: Tick and commit:** `feat(ui): scapegoat choice in the dilemma panel`.

### Task 14: Docs, manual checklist, hand-offs

**Files:**
- Create: `docs/MANUAL_TEST_P9b.md`
- Modify:
  - `docs/packages/P9b-power-structure.md`: status line, and an **Implemented as** section with every ruling of this plan, the draft numbers and the open items.
  - `docs/00-overview.md`: §5.4 rows for the P9b interfaces, §6 (`power`, `base.rations`, the two options), §9 status.
  - `docs/ROADMAP-next.md`: P9b done.
  - `docs/CONTENT.md`: how to add a vote kind, a feat, a lean, a countermandable activity.
  - `docs/packages/P9c-personal-pressure.md` and `docs/packages/P13-leashswap-mode.md`: an **Interfaces already provided by P9b** note (`assertiveness().demandMult` for bookings; `leaderOf`, `standingOf` and `computeHierarchy` for the warden; `openScapegoat` / `take_blame` for commander confinement).
  - `CLAUDE.md`: a P9b line like the P9 one.

- [ ] **Step 1: Write** the manual checklist, one item per acceptance criterion:
  - preset turns voting on;
  - each kind opens the panel;
  - overrule costs;
  - a leader appears with a dominant card;
  - countermand chips;
  - endorse and challenge;
  - CC on oversight and a feat suppresses it;
  - both scapegoat branches;
  - an old save with voting off plays as before.
- [ ] **Step 2: Update** the docs listed above. Open items:
  - no "her call" dilemma;
  - no traders or parleys;
  - LEASHSWAP warden;
  - commander confinement on TAKE THE BLAME (P13);
  - unit↔unit respect is approximated by values.
- [ ] **Step 3: Run** `npm test` (the pronoun and docs-link tests included). Expect PASS.
- [ ] **Step 4: Tick and commit:** `docs: P9b implemented-as, overview, content guide and manual checklist`.
