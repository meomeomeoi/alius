# P9e — "Her call": decisions a soldier takes on her own

**Status: implemented** (plan: `docs/plans/2026-11-15-p9e-her-call.md`; see **Implemented as** at the end; where it differs from the draft, the code wins). **Depends on:** P9b (scapegoat case, `Mission.decidedBy`, `markDecidedBy`, standing and merit), P9 (Impunity, stances), P9d (`bondOf(unit).leadStyle`), P5 (expedition event nodes, missions, oversight standing), P6 (dilemmas, `unit_event` effects). **Read:** overview; this file; P9b **Implemented as** (the scapegoat section, the rulings, the open items); P5 §events; P9.

**Analysis tool (P7a):** every new player-facing stat, chip, option and card in this package carries `data-analyze`, has a glossary entry or registry `description`, and live values get a provider reading through `Knowledge`. No pronoun for the commander in any text (lore §0).

## Why this package exists

P9b §5 says the commander may be made to answer for a failure that oversight punishes when the decision was made by a unit: *"a 'her call' dilemma, a vote result, a leader's countermand"*. Only the vote result is built. A leader's countermand never leads to an oversight failure (the order is simply not done), and no "her call" exists: no moment in the game where a soldier decides something that matters without the commander and the squad voting on it. Without it a scapegoat case is rare (votes are off by default) and the squad has no initiative of its own: it only obeys, refuses or votes.

## Goal

A soldier with a will of her own, and the means, sometimes **acts on her own** during a run. The engine decides who acts and how it turns out; the commander watches the result. A bad turn can cost the mission and, through P9b's existing path, open a scapegoat case on her (or on the commander, who answers for her).

## Principles

- **The engine decides** (overview P1–P3). Who acts, whether it happens and which way it goes are engine computations from her card (values, `leadStyle`) and her Impunity; the player does not roll or pick. The model never decides it and never writes numbers.
- **From the card, not from the world.** Only a named unit whose bond profile says she pushes for power (`leadRank ≥ 2`) or whose command stance is `open_defiance` / `defiant_loyal` (Impunity band) can act on her own. A world option may scale frequency (`squad_assertiveness`), never make a yielding soldier bold.
- **No new hard authority, no new intent.** This is pressure and consequence. The commander cannot forbid it in advance in v1; the price of her acting is what it costs afterwards.
- **Data, not code** (overview P4): the events, their outcomes and their lean are JSON; code reads closed vocabularies.
- **Everything costs** (P6): a good outcome is a gain for her (merit, Impunity record), a bad one a loss for the run and a case for oversight; neither is free for the commander.
- **Reuse before inventing.** The scapegoat case, `decidedBy`, witnesses, the vote gate and the failed-run penalty already exist in P9b; this package only adds a second way to set `decidedBy`.

## 1. The her-call event family

A new field on expedition event templates (`dilemmaTemplates`, context `expedition_event`): `herCall`:

```
herCall: {
  trigger: { minLeadRank?: 2, stances?: [...], minImpunity?: 50 },       // who may act (read by field, never by id)
  outcomes: [ { id: 'good' | 'bad', lean: { <valueAxis>: -2…2 }, text, effects: WorldEffect[] } ]   // exactly one good and one bad
}
```

- A her-call template has **no options for the commander to pick**: the node resolves itself and shows a one-line notice card ("{Name} took the decision herself: …") with `[ACKNOWLEDGE]`.
- Content: 4–6 authored events (a route she changes, a prisoner she lets go, a cache she opens, a retreat she calls, an order she gives to the others). Texts are `AUTHOR TO WRITE`. A pack extends by JSON only.

## 2. Who acts and how it turns out (engine, `src/engine/power/herCall.ts`)

- **Trigger.** When the squad enters an event node of a her-call template, the engine rolls once (seeded, `TUNING.herCall.chance`, draft 0.35, × `squad_assertiveness` privilege multiplier) whether she acts. With no eligible unit nothing is drawn and the node falls back to the template's ordinary fixed block, if it has one, else is skipped like any event with nothing to decide.
- **Actor.** Among the party's eligible named units, weighted by `leadRank` and Impunity band (draft table in `TUNING.herCall`); the squad leader, if in the party, counts double.
- **Outcome.** The chosen unit's values against the template's two `lean` maps decide `good` / `bad` (a score like a P9b ballot term, plus a seeded margin so it is never certain; draft). A defect that fits the template may tilt it (read by field).
- **Draws.** Exactly two rng draws when she acts (who, outcome), none otherwise; with voting off and no eligible unit the run is byte-identical to P9b (acceptance 6 of P9b must stay true).

## 3. Consequences

- **Good:** the outcome's effects (gains), a `power.merit` entry for her (`TUNING.herCall.meritGood`), Impunity record + (draft 4), a fact. The commander is *not* blamed.
- **Bad:** the outcome's effects (losses), her Impunity record + (she acted and it went wrong: she is bolder, not humbler), and the run is **marked**: `Mission.decidedBy = { source: 'her_call', unitId, witnessIds }` on a `command` mission (`source` is new; a vote sets `'vote'`). A vote-decided mission keeps its vote mark (the squad's decision outranks hers); if none is set, hers is.
- When that run later ends `failed`, or the mission's deadline expires, **P9b's scapegoat opens unchanged** (TAKE THE BLAME / SHIFT IT; with voting on, the answer goes to a vote). `witnessIds` for a her-call are the other named party members who did not object (draft: all of them).
- A retreat does not open it (same as P9b). A `side` mission or a poi run cannot be marked.

## 4. UI

- A **notice card** for the resolved node in the expedition screen in the unit's own personal voice (declared in `VOICE_OF`), naming her, what she did and, for `bad`, a line that oversight will want a name if the run fails.
- The mission card in the OPS board and the expedition screen show a chip `ON HER CALL: {Name}` while a her-call mark stands (analysis address `glossary:her_call`).
- The dossier of an actor shows nothing new in v1 (the standing and merit blocks already move).
- Directive `power:herCall:<unitId>` for the scene after the run: "{Name} took the decision herself in the field; it went {well|badly}." (prefix `power:`; never starts with a prefix P9/P9d/P11 reserve.)

## 5. Data

- `Mission.decidedBy.source?: 'vote' | 'her_call'` (absent = `'vote'`; old saves read as before); `ExpeditionState.herCalls?: Array<{ nodeId, unitId, outcome }>` (the run's log for the report and the debrief).
- Registry change: `dilemmaTemplates[].herCall` (zod, loader checks one good and one bad outcome, `lean` within −2…2, the effects subset allowed in a run). `TUNING.herCall` (all draft).
- No new world option in v1 (`squad_assertiveness` scales the chance).

## Acceptance criteria

1. A her-call event node never asks the commander to pick; it resolves from the actor's card and shows a notice.
2. Only eligible units act (`leadRank ≥ 2` or an open-defiance / defiant-loyal stance with the Impunity floor); a squad of yielding units never triggers one and draws no rng.
3. A bad outcome on a command mission marks it `source: 'her_call'`; a later failed run or expired deadline opens the P9b scapegoat case (both answers apply their P9b consequences); a vote mark is never overwritten.
4. A good outcome gives her merit and Impunity record and blames nobody; the squad leader is twice as likely to be the actor.
5. With voting off and no eligible unit gameplay is unchanged from P9b (the rng state after a run equals the run without this package).
6. Old saves load; the notice, the chip and the directive carry `data-analyze` / have glossary entries; no commander pronoun anywhere.

## Open questions for the author (answered: see **Implemented as**)

- Frequency: should the commander be able to **pre-empt** it (a standing order that makes her ask first, at the price of Trust), or is the price purely afterwards?
- Should a her-call also be possible **at the base** (a decision about the base while the commander is out), or only in the field?
- Is a good outcome ever *credited to the commander* in oversight's eyes (a feat for P9b's `outsideFeats`), or always to her?
- How hard should the bad outcomes bite on the run itself (a lost cache, a wound) versus only through the failure case?

## Implementation chunks (for the plan)

- (a) engine: `herCall` field, trigger/actor/outcome rolls, `decidedBy.source`, `markHerCall` hook in `enterEvent`, consequences, tests (including the acceptance-6 rng check).
- (b) content (4–6 events), notice card, `ON HER CALL` chip, directive, providers, glossary, `docs/MANUAL_TEST_P9e.md`, docs and hand-off notes.

## Interfaces already provided by P9b (implemented — use, do not rebuild)

- **The case:** `openScapegoat(draft, ctx, { missionId, unitId, witnessIds })`, `takeScapegoatCase(mission)`, `scapegoatAfterFailure`, `failedRunPenalty`, `markDecidedBy(draft, missionId, voteId)` (a vote's mark; the her-call mark is written the same way), `scapegoatOptionId`; the template `scapegoat_mission` is found by its `scapegoat` context.
- **Standing and merit:** `recordMerit`-style entries (`power.merit`: `{ day, unitId, points }`), `standingOf`, `leaderOf`, `leadRank` via `bondOf`.
- **Vote gate:** `registerVoteGate`; a her-call needs none (the commander does not decide it), the scapegoat answer is gated as before.
- **Directives and voices:** prefix `power:`; sources declare their voice in `VOICE_OF`.

## Implemented as

Engine: `src/engine/power/herCall.ts` (`herCallSpecOf`, `askFirstHolds`, `herCallCandidates`, `actorWeight`, `herCallChance`, `herCallOdds`, `rollHerCall`, `markHerCall`, `applyHerCall`, `setAskFirst`); hooks in `src/engine/world/expedition.ts` (`eventPool`, `enterEvent`, `closeEventNode`, `acknowledgeHerCall`, the `chooseOption` guard, the report copy), `src/engine/dilemma/flow.ts` (the request guard), `src/engine/power/scapegoat.ts` (the source of a mark), `src/engine/power/{votes,state}.ts` (`againstHerValues` exported, `forgetPower`); actions `expedition/ack_her_call` and `power/ask_first`. Non-engine: `src/power/{controller,directives}.ts`, UI `src/ui/expedition/herCallCard.ts`, the run view, `src/ui/ops/missionBoard.ts`, `src/ui/power/{chips,hierarchy}.ts`, `VOICE_OF.her_call`, `css/74-power.css`; analysis `src/analysis/providers/power.ts`. Content: five templates in `content/core/dilemmaTemplates.json`, glossary `her_call` and `ask_first`, `scapegoat_mission.fixed.because`. Numbers: `TUNING.herCall`. Every number and text is a **draft**; the authored texts are marked `AUTHOR TO WRITE`.

### State
Every field is optional and the version stays 1: `ExpeditionState.herCalls` and `ExpeditionReport.herCalls` (`{ nodeId, unitId, outcome, templateId, odds, marked? }`; `odds` is stored so the reading explains the roll as it was, `marked` says whether that call put her mark on the run, so the reading stays true after the mark is spent or when a vote's mark was kept), `PendingNode.herCall` (`{ unitId, outcome }`), `Mission.decidedBy` (a union: a vote's mark has no `source`, a her-call's is `{ source: 'her_call', unitId, nodeId, witnessIds }`; **absent reads as `'vote'`**), `PowerState.askFirst` (unit → the day it was ordered), `PowerState.scapegoatQueue[].source` (written only for `her_call`), `DilemmaState.scapegoatSource` (`'her_call'` only), `dilemmaTemplates[].herCall` and `fixed.because`.

### Rulings (the plan's ruling section holds the full text; **(user)** = answered by the user on 2026-11-15)
- **Standing order "ask me first" (user: in v1).** `power/ask_first { unitId, on }`, base only (the expedition guard refuses it during a run). Giving it stores the day and costs Trust once, as a `decision_violated` of `TUNING.herCall.askFirst.severity` (draft `minor`) against her own values, then `evaluateAutomatic`; lifting it is free; setting it twice or lifting a missing one throws and changes nothing. While it holds she is never a candidate, draws nothing and is not in the weights. A run that started before the order read it live at each node entry. `forgetPower` drops it.
- **Field only (user).** A her-call happens only at expedition event nodes. Her-calls at the base are an open item.
- **A good outcome is always hers (user).** No `outsideFeats` entry and no `noteFeat`: it is never credited to the commander.
- **How hard a bad outcome bites (user).** About as much as the worst option of an ordinary minor event: lost carried supplies 2–3, party stress +10, party HP −10 %; the scapegoat case comes on top. The schema requires a cost effect in the bad outcome and none in the good one.
- **Who may act: from the card.** `leadRank(bondOf(u).leadStyle) ≥ trigger.minLeadRank`, or her command stance is one of `trigger.stances` **and** Impunity ≥ `trigger.minImpunity` (either branch). Named, living, `status === 'active'` (the able party), not under ask-first. Stance ids appear only as data in `trigger.stances` (checked against `commandStances` at load); defects are read by `category`. `squad_assertiveness` scales only the chance.
- **Which templates the pool offers.** `eventPool` keeps a her-call template only with a run open, its mission's template not `tutorial`, and a non-empty `herCallCandidates` over `ableParty`. A party with nobody eligible sees exactly P9b's pool and `rng.pick` draws identically: the run is byte-identical to the same run without the her-call templates (acceptance 5).
- **Draws.** No eligible unit: 0. An eligible unit at a her-call node: 1 (does she act). She acts: 3, in the order chance, actor, outcome. The pool pick precedes them.
- **Actor weight** `(1 + leadBonus[leadStyle]) × band[Impunity band] × (leader ? leaderMult : 1)`; the pick is `rng.float() × total` over the candidates in party order. **Odds** `clamp(base + perPoint × (s(good) − s(bad)) + Σ tilt, min, max)` with `s(o) = Σ effectiveValues[axis] × o.lean[axis]`; one tilt per `defectTilt` entry whose category she has. **Chance** `min(chanceCap, chance × privilegeMult)`.
- **When effects apply.** On node entry, the moment she acts (`applyWorldEffects` with source `{ kind: 'event', id: templateId }`, the consequences, the log line `{Name} took the decision herself: {text}`, the `herCalls` entry); the node then waits as `pending.herCall` with phase `event`. `expedition/ack_her_call` only closes it (an objective node then counts as done). `expedition/choose` throws `She has already decided: acknowledge it.` A retreat at the notice is allowed and keeps the effects and the mark.
- **A her-call node where she does not act** (the chance roll fails, or the template was pinned and nobody is eligible) plays the template's `fixed` block as an ordinary minor event.
- **Consequences.** Good: merit (`meritGood`, draft 6), Impunity record `recordGood` (4), a fact (`{Name} took a decision in the field herself, and it went well: …`, known by the party, importance 2, tag `her_call`); never a mark. Bad: record `recordBad` (4), and the mark.
- **The mark.** Only on a `command` mission whose template is not `tutorial`; **the first mark wins** (a vote's, or an earlier her-call's, is never overwritten; the event then says `marked: false`); witnesses are the other named living party members. Both sources open the case (`takeScapegoatCase`, `scapegoatAfterFailure`) and both get the failed-run penalty. A retreat opens nothing and leaves the mark on the board mission, as P9b's vote mark does.
- **Wording.** `scapegoat_mission.setup` has a `{because}` placeholder filled from `fixed.because[source]` (`vote` / `her_call`; an absent line fills nothing). `fixed.because` is allowed only on `scapegoat` templates.
- **Events.** `her_call { nodeId, templateId, unitId, outcome, missionId, marked }` replaces `expedition_event` for that node, so the app never asks the model for a generated dilemma. `her_call`, `her_call_acknowledged` and `ask_first_set` are reserved event types.
- **Directives.** Both are **derived from state** in `powerDirectives` (never set by the controller, so they follow a reload and a chat switch and cannot leak): `power:herCall:<unitId>` while she is in the scene, is a living unit and `lastExpedition.herCalls` holds a call of hers (her last wins) from a report dated today or yesterday (`HER_CALL_DAYS`, draft); `power:ask_first:<unitId>` while she is in the scene and the order holds. The controller only refreshes the context on `expedition_ended`. Glossary ids `her_call`, `ask_first`.

### Rulings made while implementing (the plan was silent or collided with the code)
- `herCall` requires `contexts` to be exactly `['expedition_event']` (not merely to include it).
- The her-call log line is written by `enterEvent`, not `applyHerCall`: `herCall.ts` must not import `world/expedition.ts`, where `addLog` lives.
- `openDilemma` refuses a her-call template first with "has nothing to generate" (the schema forbids `generate` on one), so the plan's "That event is not waiting on the map." is reachable only for a hand-built template; the guard is kept and tested that way.
- A tutorial run never meets a her-call: `eventPool` keeps the templates out of its draws and `enterEvent` does not roll on a pinned one either (it plays the `fixed` block, no draw). (First built as "she may act but is never marked"; the Opus review caught that a tutorial node could resolve itself.)
- The authored `AUTHOR TO WRITE` marker is on each her-call `fixed.setup` (and the glossary `long`), not on the outcome texts: those are shown in the run log. An outcome `text` is a past-tense clause starting with "she" ("she led the squad over a route of her own; …"): it follows "{Name} took the decision herself: " in the log and card and "…, and it went well: " in the fact.
- The controller method is `ackHerCall()`: `acknowledge()` already closes the after-action report (`expedition/ack_report`).
- The dossier toggle is drawn only when a handler is passed and is `aria-disabled` during a run.

### Draft numbers (`TUNING.herCall`)
`chance` 0.35 and `chanceCap` 0.8; `leadBonus` yielding 0 / balanced 0 / assertive 1 / dominant 2; `band` cowed 0.5 / low 0.75 / high 1 / brazen 1.5; `leaderMult` 2; `odds` base 0.5, 0.05 a point, 0.15…0.85; `meritGood` 6, `recordGood` 4, `recordBad` 4, `factImportance` 2; `askFirst.severity` `minor`. The five events' leans, effects and `defectTilt`s (`neural −0.1` on the route, `cybernetic +0.1` on the cache) are drafts too. Not measured: no balance pass was run on how often a her-call happens over a campaign.

### Non-obvious things to know before touching P9e code
- **`eventPool` is the only gate** that keeps acceptance 5 true: it must stay deterministic and draw nothing. A pinned her-call template with nobody eligible plays its fixed block and draws nothing at all.
- **The effects apply at entry, not at ACKNOWLEDGE.** A reload or a retreat at the notice never applies them twice; the card is built from `pending.herCall` alone.
- **Code reads by field:** triggers by lead rank and stance list, tilts by defect category, mark and case by `decidedBy.source` (absent = vote), never by a template, stance or defect id.
- **The vote's mark and the her-call's share one field:** `markDecidedBy` (a vote) deletes any mark at `expedition/start`; `markHerCall` never overwrites one.
- **A directive that names a past event must be derived from state** (as `power:herCall:` is): `ContextBuilder` never expires a `scene` directive by itself, so one set from an event leaks into later scenes and other chats.
- **Directive ids** start with `power:` and stay away from the prefixes P9/P9d/P11 reserve (`tests/power/herCallDirectives.test.ts` holds the list).
- Tests that need a particular roll scan seeds for one whose draws give it (the pool pick comes first when the template is not pinned); a test that changes the draw order must say so.

### Open items
- No her-call at the base (only in the field).
- A defiant soldier does not ignore ASK ME FIRST: in v1 it always holds.
- A leader's countermand still never leads to an oversight failure.
- Nothing announces a her-call outside the run screen (no toast, no cut-in): the card and the log are its whole notice.
- Every number and text is a draft; no balance pass on frequency, and the manual check in SillyTavern (`docs/MANUAL_TEST_P9e.md`) is not done.

## Interfaces already provided by P9e (implemented — use, do not rebuild)

- `Mission.decidedBy.source` (`'vote'` or `'her_call'`, absent = vote), `takeScapegoatCase(m)` and `openScapegoat(…, { source? })`, `DilemmaState.scapegoatSource`: a second way to answer for a run. `markHerCall(draft, mission, { unitId, nodeId, witnessIds })` never overwrites a mark.
- `askFirstHolds(state, unitId)` and `power/ask_first`: a standing order a later package may read.
- `ExpeditionReport.herCalls`: the run's her-calls for a debrief or a recap.
