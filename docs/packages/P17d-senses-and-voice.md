# P17d — Senses and Voice: the Sensory Layer, Her Scent, Whispers, Interruptions

**Status: spec.** Release 0.2 (post-release), after P17c. **Depends on:** P17c (scene staging, room data, door sides, obscured layer), P17 (stagings, Strain, visitors), P15–P17b, P9d (publicity, discovery), P3 (scene screen, typing speed), P10 (motion, `visualFlags`, UI sounds), P14, P7a. **Read:** overview; P17–P17c; this file.

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

## Acceptance criteria

1. Sensory lines come from the room, engine events (on the door side), the scene call and her replies; they respect reduced motion and readable mode.
2. Scents arrive before visitors, cling for N slots, can be noticed with a discovery roll, can be washed off, and washing can be forbidden.
3. Whispers are visible only to the player and are judged as tasks.
4. Interruptions cut the display only; edit and swipe keep the original.
5. Rhythm and distance follow emotion, style and staging; "she thinks" replaces the spinner.
6. Every element carries `data-analyze`; every generation goes through P14.
