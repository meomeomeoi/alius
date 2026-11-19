# P17d — Senses and Voice: the Sensory Layer, Her Scent, Whispers, Interruptions

**Status: spec.** Release 0.2 (post-release), after P17c. **Depends on:** P15a (blocking, moments, contact physics), P17c (scene staging, room data, door sides, obscured layer), P17 (stagings, Strain, visitors), P15–P17b, P9d (publicity, discovery), P3 (scene screen, typing speed), P10 (motion, `visualFlags`, UI sounds), P14, P7a. **Read:** overview; P17–P17c; this file.

**Analysis tool (P7a)** and **P14** rules apply. Nothing here reaches into the player's real life (author ruling: the player becomes the commander).

## Goal

Make scenes felt as well as read: short sensory lines drift over the scene, every woman has a scent that arrives before her and stays after her, a holder can whisper to the player alone, interrupt, and speak at her own pace and distance.

## 1. The sensory layer

Short lines that surface and fade at the edges of the scene screen, tagged `sound` / `scent` / `touch` / `temp`, with a side (left / right / centre / door side) and an intensity.

**Sources:**
- **Room** — an ambient pool per room in data (garage: oil and rubber; medbay: antiseptic; mess: coffee; the roof at night: wind).
- **Engine events** — footsteps in the corridor, a door, an alarm, rain on the roof; placed on the room's **door side** (P17c room data).
- **Scene generation** — one cheap call per scene (`sensory_scene`, budget 250): room, slot, who is present, recent events → 6–10 lines.
- **From her reply (mid-scene)** — after each main-model reply a light extraction (folded into `intent_extract` as `sensory: [{ kind, text ≤ 40, side? }]`, ≤ 2) turns what happened into felt lines: she leans in — mint gum; an embrace — a faint smell of sweat; her heel on the floor.

Lines are text only (ST generates no audio); an existing P10 UI sound may accompany one quietly. In readable mode / reduced motion they do not move: they stand in a corner list.

## 2. Her scent

- Each named woman has a **scent** (from the card or generated at import: perfume, soap, gunpowder, antiseptic, mint), editable in the dossier.
- **It arrives before her:** in a staging (P17) the visitor's scent line surfaces an exchange before she enters; the player learns to recognise it.
- **It stays on the commander:** after a close scene, her scent clings for N slots (by closeness of the scene). Other women who meet the commander may **notice** ("you smell of her"): a discovery roll for a secret relation or dynamic (P9d publicity, P17 complicity), weighted by their closeness and perceptiveness. A **wash** (a short free action at base) removes it; a holder may **forbid** washing (a rule; breaking it is a slip).

## 3. Whispers

A holder on a line (a comms earpiece; P17 `remote`) or simply close while the commander talks to someone else **whispers instructions only the player sees**: small lines at the chat window's edge ("smile at her", "don't look at me", "tell her you're busy"). They are her directives' private side; keeping them is judged by `intent_extract` (`task_kept` / `task_broken`, P16). Built for `exposure_risk` and stagings.

## 4. Interruptions

At a high hold, with `cold` / `cruel` (or by the situation), she may **cut the commander off**: the player's sent message is visibly **erased from the cut point** on screen (the rest struck and fading, an em dash), and her reply follows. The model receives the truncated text and a directive. **Only the display is cut**: the stored message is intact, editing and swiping work as usual.

## 5. Rhythm and distance

- **Rhythm:** her typing speed (P3's fixed 60 chars/s) varies with emotion and style: `cold` even, with a pause before the key word; `playful` quick; `obsessive` in bursts; an ellipsis lingers when she is testing.
- **Distance:** close and quiet lines (beside a `face_close` shot) render small and italic; orders larger; a visitor behind the door or in a low view (P17c) faint and partly blurred through the obscured layer.

## 6. "She thinks"

While the model generates, a line in her manner replaces the spinner ("she takes her time", "she studies you", "silence"); per style, from data.

## Depth revision (design session 2026-11-19)

Added after the 0.2 depth review; built on P15a (blocking, moments, contact physics). Where it conflicts with the sections above, this section wins.

- **The engine decides what is noticed** (a general rule): the model only receives what the engine already decided. Whether a visitor notices a scent, a mark or a sound is a seeded roll (closeness, her perceptiveness, strength, time since); **noticed** → her directive says she notices it (and whose it is, or that she does not know); **not noticed** → it is not mentioned in her block at all, not even in the room description. Frequencies are `TUNING` numbers, never left to the model.
- **Learned scent.** At first the sensory lines describe a scent vaguely ("something sharp, with metal"); once learned (a close scene, she said it, repetition), they **name** it ("Rhea's scent"). Under a blindfold the commander can guess who entered: with a known scent the `sensory` moment offers "name her"; otherwise only "wait".
- **Nameless messages under a blindfold.** With `blindfold` or `hood` her lines arrive without name or portrait; the player identifies the speaker by the model's manner of writing, by scent (if learned) and by her rhythm; naming the wrong one is a moment.
- **Scent strength per body part** (derived): base (her profile, per part) × hygiene (a trait) × situation (where she came from: a run, training, the shower; time since she last washed, derived from her `showering` activity) × intention (she did not wash on purpose, for the commander or to spite the commander, with its own term). Bands `faint / noticeable / strong / overwhelming`, read by the sensory layer, P15a `saturation` physics and the noticing roll.
- **Her body follows the game state** (derived, nothing stored): after a run (stronger scent, dirty boots, sore feet), after training, after the shower (her soap), wounded (worship turns into care).
- **Her absence smells of her**: after `warming_her_bed` or a night with her, her scent stays in the commander's quarters; visitors may notice (the rule above).
- **Memory check:** a noticed scent that reveals a secret relation or dynamic is the existing discovery path (P9d publicity, P17 complicity) and writes its fact there; learning a scent is a `Knowledge` fact for the commander (`scent_known:<unitId>`), not a squad memory.

## Acceptance criteria

1. Sensory lines come from the room, engine events (on the door side), the scene call and her replies; they respect reduced motion and readable mode.
2. Scents arrive before visitors, cling for N slots, can be noticed with a discovery roll, can be washed off, and washing can be forbidden.
3. Whispers are visible only to the player and are judged as tasks.
4. Interruptions cut the display only; edit and swipe keep the original.
5. Rhythm and distance follow emotion, style and staging; "she thinks" replaces the spinner.
6. Every element carries `data-analyze`; every generation goes through P14.

## Interfaces already provided by P14 (implemented — use, do not rebuild)

- **Every model call goes through the envelope** (`app.generations`, `src/llm/envelope.ts`): `generate(siteId, key, opts?)`, `retry`, `reroll`, `rerollState`, `drop`, `useFallback`. `callLlm` is imported by that module alone (`tests/architecture.test.ts`).
- **A package that adds a call type or a flavor kind registers its site in the same change:** a `SiteDecl` in `src/llm/sites.ts` (`id` like `<area>.<what>`, `callType`, `surface`, `reroll` mode, `record` mode, generic `label`, glossary id) and the handlers bound by the owning controller (`envelope.bind`: `build` rebuilds the input from the state, `apply` runs the same engine action as before, `fallback`, `committed` / `undo` for the reroll mode). `tests/llm/siteRegistry.test.ts` fails for a call type or flavor kind without a site; the architecture test refuses a direct `callLlm`.
- **A failure** is `refused`, `truncated`, `timeout`, `network`, `invalid_output`, `empty` or `no_profile`; the envelope writes a record (`CampaignState.generations`, at most 20, no prompt, no model text, `detail` never the model's words) unless the site's record mode is `none` or the reason is `no_profile`. Add the chip with `drawGenerationChips(host, ctx.generation, state, surface, filter)` and REROLL with `drawSiteReroll`; a screen draws neither without `generation` in its context. Labels are generic: never put a hidden value in one.
- **The engine decides:** a retried or rerolled value goes through the same sanitizer and the same action as the first one; none of the new actions draws from the rng, so a new site must not either (a seeded test that moves stops and reports).
