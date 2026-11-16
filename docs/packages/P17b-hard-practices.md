# P17b — Hard Practices: New Categories, Service and Humiliation in Depth

**Status: spec.** Release 0.2 (post-release), after P17a. **Depends on:** P15, P16, P17, P17a, P4 (combat orders), P7 (commander body stats, crime, quiet night), P9b (rations, hierarchy), P3b (memory), P3 (chat history), P14, P7a. **Read:** overview; P15; P16; P17; P17a; this file; `docs/content/lore.md`.

**Analysis tool (P7a)** and **P14** rules as in P15. **Address:** she always speaks to the commander as "you" (author ruling: no third person, also inside objectification); no pronoun for the commander anywhere. Scene text, including bodily detail, is written by the main model; the engine sets the frame and owns the consequences.

## Goal

The harder end of the dynamic, for players who enable it: four new content categories, speech control, a shock collar, the cage, gratitude and begging, and service and humiliation built from the real state and history of the campaign.

## 1. New content categories

`contentCategories` gains (off by default, descriptions `AUTHOR TO WRITE`; profile entries per P15 §2):
- `deprivation` — she controls food and sleep;
- `pet_play` — collar, leash, a place at her feet, commands, speech reduced to sounds;
- `objectification` — the commander used and treated as a thing;
- `coercion` — a dynamic entered through blackmail rather than desire.

## 2. Objectification

**Ladder** (track `objectification`, levels unlock steps; P15 §6):
1. **Spoken to as a thing** — always "you", never by name; orders as to an object ("stay", "hold it", "be still").
2. **Static pose** — footrest, armrest, standing by the wall while she works (P17 condition `stillness`/`posture`).
3. **Function** — holding her things, serving as a table, lighting her work.
4. **Not acknowledged** — hours in which she does not treat the commander as a person: no looks, no answers, only use. Heaviest for `cold` and `clinical`.
5. **Before others** — the same with witnesses, who play along or not by their profile (P17a attitudes); they address her, not the commander.
6. **Handed over** — left with an allied holder for an evening as a thing (P17a §1).

**Object time:** a state with a timer (part of a scene to several slots): the player's free text is limited to **actions without speech** (the rule shows above the input; P17c gestures), each exchange moves Strain (pose, stillness, silence), a slip goes to her discipline, the POV directive limits narration to what the commander perceives, and everyone present gets "treat the commander as an object".

**Why she does it, by style:** `cold` (indifference), `clinical` (an endurance test, noted in her journal), `cruel` (mockery before others), `ritual` (a formal place for the object), `affectionate` (a strange intimacy: "you are my thing, and that is tender"), `obsessive` (her thing that nobody else may touch).

**Return to a person:** a ritual in which she acknowledges the commander again: stress relief, favour, sometimes a privilege. Object time without a return accumulates stress and wears Trust: the practice has an arc, not only a cost.

## 3. Speech control

Rules of the commander's speech (rule templates tagged `degrading_language` / `service`): forbidden words, "yes, ma'am" only, silence without permission. The **input shows the rule**; violations are `protocol_slip` → her discipline. (Self-reference in the third person is not offered: author ruling.)

## 4. The shock collar

A discipline module built in the workshop (`pain_rough` or `restraint`): she triggers it on protocol slips or at whim (by style). Effects: commander stress, a short status, P17c's screen glitch. In LEASHSWAP (P13) it merges with the warden's pain bursts.

## 5. Deprivation

She controls the commander's rations (P9b ration modes extended to the commander) and sleep ("eat from my hand", a sleepless night). Effects through the commander's body statuses (P7) and the quiet night; P17c shows them on the interface. Restoring food or sleep is a privilege (P17a).

## 6. Pet play and the cage

- Collar and leash (the word play with the Leash is the author's), a place at her feet, commands; speech reduced to sounds (P17c gag) where she wills it.
- **The cage** (`restraint`, optionally `pet_play`): a place to sleep in her quarters, offered only by holders whose profile fits (style and appetite; author ruling: character-dependent). Nights there are quiet (P7) but cost stress; sleeping outside is a privilege.

## 7. Coercion

A dynamic may **start** from blackmail: a holder-capable unit who learns the truth of the commander's crime (P7 crime details as facts; compromat, P15 §11) offers silence for submission. The P15 dynamic starts at a forced milestone; exit routes (P15 §9) carry the exposure as their cost. Only with `coercion` enabled.

## 8. Serving the squad (a rare outcome)

Public service to the whole squad (mess duty for everyone, gear of each woman), `service` + `public_humiliation`: **never routine** (author ruling) — only as a punishment of the highest severity, an aftermath, or a contract penalty, with a cooldown of weeks.

## 9. Orders through her

With the P15 `command` domain, the commander's combat orders (P4 CP orders) pass **through her**: she approves, changes, or "forgets" to relay them (a roll by style, hold and her stress); the commander's CP are effectively hers. Uses the P13 override chips in combat.

## 10. Gratitude and begging

- **Gratitude:** a protocol: after her discipline, thanks in her form. Wrong form or refusal doubles the punishment.
- **Begging:** under `denial`, permission is won by begging, and her demands grow each time (form, length, witnesses).
- Both are **typed by the player** (P17c dictation), never pressed as a chip.

## 11. Service in depth

- **Kinds** (seeds): care of her (hair, dressing, boots, massage after a run, feet, the bath); **wound care** after combat (from her real P4 injuries); household (her quarters, laundry, dinner from the mess, tasting her food first); presence (standing by, holding, doors); ceremonial (greeting forms, kneeling when she enters); **bodily and intimate** service only with `explicit_scenes`, her profile and limits (the engine frames "service as she wishes, she leads"; the model writes it).
- **From real state:** her requests follow her injuries, stress, Want and the last run.
- **Her preferences, learned by the player:** each holder has hidden preferences (from her card plus generated: how she takes her coffee, how her hair must be touched, the order of service, what she hates). They are revealed by her corrections, praise and remarks (each becomes a fact). The service verdict (P16) checks the player's text against the known and unknown preferences through `intent_extract`: a player who **remembers** serves better.
- **Corrections in the moment:** she stops and redoes; errors accumulate into her discipline or into patient teaching (by style).

## 12. Humiliation in depth

- **Real history:** her humiliations draw on this campaign's memory (P3b): soldiers lost in combat, a failed mission, the commander's crime (P7), past slips, compromat. The directive hands her concrete events.
- **Your own words:** she quotes the player's earlier messages verbatim from the chat history (promises, boasts, begging).
- **Dictation:** she dictates a sentence (a confession, thanks, a plea) and the player must type it (P17c); mistakes or wilful changes are slips; refusal is possible with consequences.
- **Edits:** when speech rules are broken, her correction shows as strike-through in the commander's own message (P9c intercept rendering, extended to scenes).
- **Her verdict on the board** (`public_humiliation` only): her assessment or the commander's offence posted as a squad notice on the PDA.

## Acceptance criteria

1. The four categories gate everything they tag; disabled categories never reach a prompt.
2. Objectification: ladder steps by track level, object time with input limits, Strain, POV, the return ritual and its absence cost.
3. Speech rules, the collar, deprivation, pet play, the cage (profile-gated) and coercion work as specified.
4. Serving the squad never occurs as a routine practice; orders through her work in combat.
5. Gratitude and begging are typed and judged; begging escalates.
6. Service draws on real state; preferences are hidden until revealed and affect the verdict.
7. Humiliation uses real memory and verbatim quotes; dictation, edits and the board work.
8. Every element carries `data-analyze`; every generation goes through P14.
