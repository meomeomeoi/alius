# P9e — "Her call": decisions a soldier takes on her own

**Status: spec (not started).** **Depends on:** P9b (scapegoat case, `Mission.decidedBy`, `markDecidedBy`, standing and merit), P9 (Impunity, stances), P9d (`bondOf(unit).leadStyle`), P5 (expedition event nodes, missions, oversight standing), P6 (dilemmas, `unit_event` effects). **Read:** overview; this file; P9b **Implemented as** (the scapegoat section, the rulings, the open items); P5 §events; P9.

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

## Open questions for the author

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
