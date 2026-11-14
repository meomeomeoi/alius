# P9b — Squad Power Structure

**Depends on:** P9 (Impunity, demands, punishments), P8 (world options), P7 (commander profile), P6 (dilemmas, Leash), P5 (oversight, missions). **Read:** overview; this file; P9; P9d §1 (bond profile, shared with this package).

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
