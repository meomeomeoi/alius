# P20 — Story Nodes: Resolution Engines and Node Kinds

**Status: spec.** Release 0.3 (post-release). **Depends on:** P19 (storyboards, clues), P18 (cast), P5 (node map, expedition run, the expedition guard in `dispatch`), P3 (scenes), P4 (combat), P6 (dilemmas), P7 (social stats, non-body routes), P14. **Read:** overview; P18; P19; this file; the **Implemented as** of P3, P5 and P6.

**Analysis tool (P7a)** and **P14** rules as in P18.

## Goal

Make a run more than a chain of fights: arrivals, searches, talks, infiltrations, a night at a field camp, a settlement of survivors, a captive to question. Many **node kinds**, cheap to add, resolved by a few **engines**.

## 1. Resolution engines

A node kind declares one engine (or a sequence of two). Engines are code; kinds are data.

| Engine | What happens | LLM |
|---|---|---|
| `narrate` | 2–4 lines of narration; no input; may reveal a clue or set a flag | `flavor` kind `node_narration` (cheap), or a template line |
| `choose` | 2–4 options, each with a cost/check and an outcome; generated in context, validated like P6 minor dilemmas | `node_choice` (budget 500) |
| `checks` | a short series of checks against a track (alarm, danger, progress); each step a choice of approach; the track ends the node | options from data; framing line by `flavor` |
| `talk` | a real scene inside the run: party members speak with their cards, cast members are voiced by the narrator under their own names; limited exchanges | the main model (scene) + `intent_extract` |
| `fight` | a P4 combat, possibly with a setup from the previous engine (advantage, ambushed, alarm) | none |
| `mixed` | two engines in order, e.g. `checks → fight` (the check result sets the fight's setup) | as above |

**Checks** use social stats (P7) and party properties (roles, defects, track levels, items), never a body stat alone (P10). Each option states what it uses; analyze explains the odds through `Knowledge`.

## 2. Node kinds

Registry `nodeKinds`: `{ id, name, engine | engines[], frame (prompt frame), requires (verbs, regions, modifiers, party), outcomes vocabulary, reveals?, weight, description }`. Draft set (author ruling: the full list below goes in):

| Kind | Engine | Purpose |
|---|---|---|
| `interlude` | narrate | arrival, sight, transition |
| `crossroads` | choose | a decision on the way |
| `conversation` | talk | cast or party; **0–2 per mission** |
| `search` | checks | rooms, ruins: clues |
| `infiltration` | checks → fight | alarm track; at its top a fight with a penalty |
| `settlement` | choose + talk | a safe node: trade, rumors, rest, requests, cast |
| `traders` | choose | supplies, credits, items |
| `ambush` | mixed | spotted by a check → fight with advantage, else ambushed |
| `hazard` | checks | collapse, spore fog, flood; cost HP, stress, supplies; role and defect solutions |
| `lock` | checks | terminal, door: hack, bypass, or force with a cost |
| `interrogation` | choose + talk | threat, empathy, cunning; truths become clues |
| `discovery` | narrate | logs, bodies, recordings: arc backstory, written to memory |
| `wounded` | choose | help (supplies, time) or pass; values react |
| `split` | checks | the party splits in two; separate results |
| `field_camp` | talk | a night in the field: a short scene of the commander with one soldier (a relationship moment inside the mission) |
| `pursuit` | checks | the target escapes or not; the arc goes on either way |
| `uplink` | choose | HQ or oversight on the line: orders change; report the truth or lie (oversight clock) |
| `demolition` | checks | charges and timing |
| `witness` | narrate + reactions | something terrible; stress and value reactions |
| `mirror` | choose → fight | hostile off-spec units: talk or fight |
| `aftermath` | narrate / choose | after a fight: a surviving enemy, what the bodies carried |

New kinds are JSON entries; an engine is code only when a kind needs a resolution none of the six covers.

## 3. Conversations inside a run

- **Scenes during an expedition:** today the expedition guard in `dispatch` lets only `expedition/`, `combat/`, `director/` and `debug/` actions run. P20 extends it: `scene/*` with origin `expedition` is allowed, never takes a slot (the run spends its slots on return), and must end before the node closes. This changes P5's guard and P3's origins: both specs are updated with the change.
- **Participants:** party members (their cards, up to `TUNING.scene.maxParticipants`), plus cast members voiced by the narrator.
- **Cast in the chat:** a cast line is posted as a message under the cast member's **own name**, without a sprite or card (verify the ST API for sending a message as an arbitrary name, e.g. the `/sendas`-style path; isolate it in `src/st/`). Directives tell the main model who the cast member is and what they know.
- **Limits:** 0–2 conversations per mission (storyboard validation), `TUNING.nodes.talkExchanges` exchanges each, with a soft wrap directive (P11's soft cap pattern).
- **Results:** `intent_extract` reads the conversation as usual (relationship intents) and a node outcome intent `node_outcome { outcomeId }` chosen from the kind's vocabulary; clues revealed in talk are declared by the node and confirmed by the outcome.

## 4. The field camp

`field_camp` is the relationship node of a mission: the commander picks one party member; a short night scene (origin `expedition`); Want relief, P9d lead and P15 practices apply as in any private scene (gated as usual). It is offered at most once per run, only on runs of 2+ slots.

## 5. UI

Node cards per engine (narration card, choice card, check track with approach buttons, talk opens the scene screen in run mode with a "return to the map" bar). Clues found are listed in a run sidebar. Every element `data-analyze`.

## 6. Events, actions

Events: `node_entered`, `node_narrated`, `node_choice_made`, `check_step`, `check_track_ended`, `node_talk_started`, `node_talk_ended`, `node_outcome`, `field_camp`. Actions: `node/choose`, `node/check_step`, `node/start_talk`, `node/end_talk`, `node/pick_camp`.

## Acceptance criteria

1. All six engines work; every draft kind resolves through them; a new kind needs only data.
2. Checks always offer a non-body route; analyze explains the odds without hidden values.
3. Conversations run inside expeditions, take no slot, respect the 0–2 limit and the exchange cap, and show cast members under their own names without sprites.
4. The expedition guard admits run scenes and nothing else new; P3 and P5 specs record the change.
5. Clues and outcomes from every engine reach P19's promotion on return.
6. The field camp works as a private scene with the usual gates.

## Open decisions (author)

- Kind texts and frames; check tracks per kind; every `TUNING.nodes` number.

## Interfaces already provided by P14 (implemented — use, do not rebuild)

- **Every model call goes through the envelope** (`app.generations`, `src/llm/envelope.ts`): `generate(siteId, key, opts?)`, `retry`, `reroll`, `rerollState`, `drop`, `useFallback`. `callLlm` is imported by that module alone (`tests/architecture.test.ts`).
- **A package that adds a call type or a flavor kind registers its site in the same change:** a `SiteDecl` in `src/llm/sites.ts` (`id` like `<area>.<what>`, `callType`, `surface`, `reroll` mode, `record` mode, generic `label`, glossary id) and the handlers bound by the owning controller (`envelope.bind`: `build` rebuilds the input from the state, `apply` runs the same engine action as before, `fallback`, `committed` / `undo` for the reroll mode). `tests/llm/siteRegistry.test.ts` fails for a call type or flavor kind without a site; the architecture test refuses a direct `callLlm`.
- **A failure** is `refused`, `truncated`, `timeout`, `network`, `invalid_output`, `empty` or `no_profile`; the envelope writes a record (`CampaignState.generations`, at most 20, no prompt, no model text, `detail` never the model's words) unless the site's record mode is `none` or the reason is `no_profile`. Add the chip with `drawGenerationChips(host, ctx.generation, state, surface, filter)` and REROLL with `drawSiteReroll`; a screen draws neither without `generation` in its context. Labels are generic: never put a hidden value in one.
- **The engine decides:** a retried or rerolled value goes through the same sanitizer and the same action as the first one; none of the new actions draws from the rng, so a new site must not either (a seeded test that moves stops and reports).
