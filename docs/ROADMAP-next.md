# Alius — Next Packages (P7a–P13) and Session Plan

P0–P6 are done. These packages bring the base to a proper starting level before content expansion.

## Order and why

| # | Package | Why here |
|---|---|---|
| 0 | **P7a** Analysis tool | UI infrastructure: every screen built from P7 on gets explanations from day one instead of being back-filled. |
| 1 | **P7** Commander profile & traits | Everything below reads the commander's body, expression, presence and traits. |
| 2 | **P8** World options & disposition | Disposition is the base for Impunity (P9) and changes the P3/P6 parameters P9 builds on. |
| 3 | **P9** Impunity, discipline, demands, reputation | Needs P7 presence and P8 disposition. |
| 4 | **P10** Visual upgrade | Independent of P7–P9 logic, but P11 is built from its voices (paper forms, dossier) and its hub. |
| 5 | **P11** Prologue & onboarding | Assembles P7 (creation fields), P8 (world screen) and P10 (paper voice, hub, objective panel). |
| 6 | **P12** Special traits: Secret Frequency, Bloom-induced Paranoia, Web of Debts | Stand on P7's trait framework, P9's leverage/punishments and P5's night events and threads. |
| 7 | **P13** LEASHSWAP mode | Mirrors P9's punishments onto the commander, reuses P12's suspicion clocks; needs P11's intake to reveal the warden. |

The prologue was item 4 in the original list and the visuals item 5. They swap because a diegetic intake made of paper forms and a dossier needs the `paper` voice to exist first; otherwise the prologue gets built twice.

## Sessions

Each package: **one planning session** (agent writes `docs/plans/<date>-pN-….md` against the current code, no implementation) → **execution sessions** in chunks → manual check in SillyTavern. A rough split, which the plan can refine:

| Package | Execution chunks |
|---|---|
| P7a | (a) panel component, interaction (hover/focus/long-press, pin, drill-down), `glossary` registry, `data-analyze` addressing, effects summary, settings; (b) dynamic providers (axes, stats, stress, resources), knowledge filter, back-fill of existing screens, coverage test, starter glossary |
| P7 | (a) engine: stats, archetype, pool/growth, check routes + validator rule, presence/decay, image consistency, tastes, migration; (b) traits registry + 8 regular traits + `vow_of_distance`, `commander_import`, COMMANDER FILE wizard step, CMDR card, context line |
| P8 | (a) `worldOptions` + `dispositionLevels` registries, state, locking, lore block, parameter plumbing into P3/P4/P6 with table-driven tests; (b) WORLD PARAMETERS screen, presets, per-unit offset in import |
| P9 | (a) Impunity terms, new intents, pending threats, stances + directives, sabotage; (b) punishments registry, menu + dialogue paths, chips with UNDO; (c) demands + reputation/nicknames |
| P10 | (a) hub screen + rooms + markers + panels; (b) device frame + `deviceSkins` (3 CSS presets, image skin support), slide-over PDA; (c) voices + `VoiceCard`, dithered portraits, semantic colours, motion/sound, readable mode, bundled fonts |
| P11 | (a) onboarding state, `prologues` registry, paper forms for intake/exam/dossier, veteran skip; (b) line-up and first-words scenes with caps, tutorial expedition, debrief, `uiUnlocks`, objective tracker + director `objectiveHint` |
| P12 | (a) special-trait plumbing + Secret Frequency (intercepts, distortion, `knowledge_leak`, suspicion, discovery, burn); (b) Bloom-induced Paranoia (premonitions, false alarms, `accused`, nightmares, `contingency`); (c) Web of Debts (handler visits, intel exchange, consequences, two discovery paths, `defector_arc` stubs) |
| P13 | (a) mode setup, warden selection, `warden_agenda`, warden state, permadeath rules with rewind/end; (b) overrides (COMPLY/ARGUE/DEFY), commander punishments + Leash on commander, lethal escalation; (c) intrigue, three removal routes, investigation, remote control, verdicts, WARDEN panel |

Rule of thumb from P0–P6: one chunk per session, start each session with the plan file and ticked boxes, stop at the chunk boundary.

## Overview changes (apply in the P7 planning session)

1. §3 Principles: add **P10 — Weakness is a playstyle** (weaker commander is really weaker, never secretly compensated, never dead-ended; every body check has a non-body route) and **P11 — Expression has no mechanical value** (only tastes, world options and narration).
2. §6 Data model: commander `body`, `expression`, `seasoning`, `traits`, `archetype`; relation `metDay`, `impunityRecord`, `dispositionOffset` (on unit); campaign `world.options`, `onboarding`, `objectives`.
3. §5.2 Call types: `commander_import` (mechanic, 600).
4. §8 Settings: first-impression τ, dithered portraits, readable mode, reduced motion, sound volume/mute, device skin override.
5. §9 Packages table: add P7a–P13 with the dependencies above.
8. §3 Principles or §11 rules: every player-facing stat/option/chip carries `data-analyze` (P7a coverage rule); new values add an analyze provider in the same package.
6. §10 Roadmap: special traits beyond P12 (`former_off_spec`, `bound_elsewhere`, `voice_synth`); P13 LEASHSWAP mode replaces the `collared` idea; **Bloom update** (mutation slot on units — type, stage 1–4, visibility, self-attitude; progression clocks; treatment; infection incl. the commander; mark Shared Strain; Latent Strain moves onto these rails; art cost: visible stages need new sprite packs — limit visible stages or keep changes off-sprite).
7. Mark older package specs as "historical; code is the source of truth where they differ".

## Author to-do (can run in parallel)

- Glossary wording (P7a).
- Decide P7 open questions (seasoning slider vs persona age; pool size; trait list).
- Lore lines for every world option choice (P8).
- Punishment and nickname lists (P9).
- Art: hub cross-section; device renders with transparent screen per skin (optional); CC0 textures/sounds (optional).
- Prologue texts for both starts (P11).
- Handler character and `defector_arc` beats (P12); warden expectations, controller-implant lore (P13).
