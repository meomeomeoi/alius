# P19 — Arc Missions: Verbs, Modifiers, Storyboards, Clues

**Status: spec.** Release 0.3 (post-release). **Depends on:** P18 (arcs, cast), P5 (missions, node map, expeditions, director), P6 (dilemmas), P14. **Read:** overview; P18; this file; the **Implemented as** of P5 and P6.

**Analysis tool (P7a)** and **P14** rules as in P18.

## Goal

Missions today are template runs: a node map of 3–5 layers, an objective node with a condition (`win` a fight, resolve an event). An "investigation" is fights plus a couple of fixed-option cards. This package lets an arc **compose** missions from a vocabulary of verbs and modifiers and give each one a **storyboard**: the story nodes it must pass through, in order, with clues and local flags that tie nodes, missions and arcs together. Templates stay for the command and side missions of the board.

## 1. Mission verbs

Registry `missionVerbs` (each: `id`, `description`, `objective` (how the run is won, in node-engine terms), `storyShare: 'low' | 'mid' | 'high'`, default node kinds for its storyboard, `resolution: 'mechanical' | 'textual'`):

`eliminate`, `hunt`, `rescue`, `extract` (a person), `retrieve` (an object), `escort`, `hold`, `sabotage`, `investigate`, `scout`, `deliver`, `intercept`, `negotiate`, `infiltrate`, `survive`, `purge` (a Bloom nest), `evacuate`, `capture_alive`, `recover_dead`, `sweep`.

**Story share by verb (author ruling):** `investigate`, `negotiate`, `infiltrate`, `extract` are mostly story nodes; `sweep`, `eliminate`, `purge` are mostly fights; the rest sit between.

**Textual for now (author ruling):** `escort`, `hold`, `survive`, `capture_alive` have no combat mechanics in 0.3 (no protected NPC, no waves, no round goal, no non-lethal takedown): their objectives resolve through story nodes and the narration of ordinary fights (`resolution: 'textual'`). Their mechanics are on the roadmap (overview §10).

## 2. Modifiers with conditions

Registry `missionModifiers`: `{ id, description, requires: WorldPredicate[] (P18 vocabulary + mission-local: region traits, supplies band, clock band, a unit present), effects: RunEffect[] (validated: deadline, supplies, enemy table tilt, party rule, node tilt), tags }`.

Draft list: `deadline`, `no_casualties`, `no_leash`, `oversight_observer`, `rival_squad`, `civilians_present`, `darkness`, `bloom_surge`, `short_supplies`, `commander_on_site` (P4 crisis), `she_must_come` (a named unit required), `secret_from_squad` (P9c squad-secret machinery inverted).

**A modifier applies only when its `requires` hold** (author ruling): `short_supplies` only when supplies really are low, `oversight_observer` only with the oversight clock high, `civilians_present` only in regions with settlements. The model may propose any modifier; the engine drops those whose conditions fail and records why (debug log, and the arc preview shows it).

**Mid-run turns** (registry `missionTurns`: ambush, objective moved, the client sold them out, a cast member appears) are storyboard nodes like any other, drawn by verb and tags.

## 3. Mission sketch and the storyboard

An arc beat carries a `MissionSketch` (P18 output), expanded at offer time by **`mission_compose`** (mechanic call, budget 900, P14 site `mission.compose`, reroll `before_commit` until launched):

```
MissionSketch { verb, regionId, poiId?, modifiers[], danger, castIds[], intent (≤ 160 chars) }
→ Storyboard { nodes: [{ kindId (P20), purpose (≤ 120), castId?, reveals?: clueId[], needs?: clueId[] | flag[], optional?: boolean }],
               objective: { nodeIndex, condition }, clues: [{ id, label, summary }] }
```

- **Length by verb:** high-story verbs: 3–6 story nodes out of 5–8; low-story verbs: 0–2 story nodes, the rest random; mid: 2–3.
- **Placement:** story nodes are pinned on the node map in order (one per layer, the objective on the last); the other slots are filled by the existing map generator (combat, cache, rest, unknown…). Branching remains: the player picks the path between pinned nodes; an optional story node may be off the main path.
- **Validation:** node kinds exist and allow the verb and the region; cast ids exist; clue references are consistent (a `needs` refers to an earlier `reveals`); counts within limits. A broken storyboard is cut back to its valid prefix plus the objective; with nothing valid, the verb's default storyboard is used.

## 4. Clues and local flags

- **Clues** are run-local facts revealed by nodes (`reveals`) and read by later nodes (`needs`): a choice option, a check bonus, a conversation topic, or a whole optional node appears only with the clue.
- **Local flags** (`run:<slug>`) are set by node outcomes (who was spared, what was taken, what was promised).
- On return, clues and flags are **promoted**: the mission's outcome summary, P3b remembered events, and the arc's beat result (`next.onSuccess` / `onFailure` and outcome selection in P18) read them. A clue can carry over to the next mission of the arc.

## 5. Board integration

Arc missions appear on the board with an arc chip and their storyboard hidden (only the brief and modifiers). Command and side missions keep using templates; the director may also compose a side mission from verbs (`mission_compose` with no arc) when the board needs variety.

## 6. Events, actions

Events: `mission_composed`, `modifier_dropped`, `clue_found`, `run_flag_set`, `storyboard_cut`. No new player actions beyond P20's node actions and P5's expedition actions.

## Acceptance criteria

1. Every verb has a default storyboard; story share follows the verb.
2. Modifiers whose conditions fail are never applied; the drop is visible in the preview and the debug log.
3. `mission_compose` output is fully validated; broken storyboards are cut as specified.
4. Story nodes are pinned in order with free paths between them; optional nodes can be missed.
5. Clues gate later options and nodes; clues and flags reach the arc and memory on return.
6. Textual verbs resolve without new combat mechanics.

## Open decisions (author)

- Verb and modifier texts; default storyboards per verb; mid-run turn list; every `TUNING.missions` number.
