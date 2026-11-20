# P17b — Hard Practices: New Categories, Service and Humiliation in Depth

**Status: spec.** Release 0.2 (post-release), after P17a. **Depends on:** P15a (blocking, moments, contact physics), P15, P16, P17, P17a, P4 (combat orders), P7 (commander body stats, crime, quiet night), P9b (rations, hierarchy), P3b (memory), P3 (chat history), P14, P7a. **Read:** overview; P15; P16; P17; P17a; this file; `docs/content/lore.md`.

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

**Why she does it, by style:** `cold` (indifference), `clinical` (an endurance test, noted in her journal), `cruel` (mockery before others), `ritual` (a formal place for the object), `affectionate` (a strange intimacy: "you are my thing, and that is tender"), `obsessive` (her thing that nobody else may touch), `drill` (a drill of stillness, timed), `regal` (the furniture of her court, before visitors), `vindictive` (part of the sentence).

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

## Depth revision (design session 2026-11-19)

Added after the 0.2 depth review; built on P15a (blocking, moments, contact physics). Where it conflicts with the sections above, this section wins.

- **Object time (§2) and speech rules (§3)** run on P15a blocking (`activity: ignoring`, contacts `footrest`, `human_chair`, `under_her_seat`; input effects) instead of their own flags.
- **Holds in sparring.** With a partner whose profile fits (not by default; an ordinary character will not), losing a P9c sparring bout can end in a hold: a headlock into her armpit (`smothered_armpit`, worship) or her foot on the commander's head on the mat (`foot_on_head`), with the squad watching when present.
- **`bodily_fluids`** (P15a §1):
  - sweat: the sweat layer of her scent (P17d) after a run or training, the cleanliness gauge of `tongue_work`;
  - spit: her act in a moment (accept / turn away / thank); its meaning follows her worship meaning (`humiliation` = contempt, `play`, a "gift" for a hungry position); under a ring gag "accept" is the only option;
  - feeding (§5, `hand_feeding` from her mouth);
  - demonstrations with `public_humiliation`;
  - tasks and mid-ladder punishments.
- **`watersports`** (requires `bodily_fluids`):
  - **territory marking** by a `possessive` holder: the strongest scent mark, lasts longest, overrides other women's scent on the commander, noticed by the squad almost surely (there is no general "scent war" mechanic; this mark is the one case);
  - the "function" step of the objectification ladder (§2);
  - drink only from her (§5, the bowl of `pet_play` as the hardest step);
  - severity 5 of her discipline ladder;
  - `cold_contempt` and `revenge` aftermaths;
  - the `gulp` physics (P15a §9.1) with the chain "spilled → `tongue_work` on the floor and her check".
- **Order is never fixed.** Summons, rituals and their sequence are per pair (profile, style, appetite); "boots → sweat → mark after every run" is an example of what *may* grow into a habit (P17e), never a scripted sequence.
- **Memory check:** these events are strong compromat (P15 §11, high `importance`); rumours outside the squad only with `public_humiliation`; `memoryRules` entries for marking seen by others (audience: witnesses) and for a blackout (P15a §13).

## Revision of 2026-11-20 (design session)

Added after the 2026-11-20 design session. Where it conflicts with the sections above, this section wins. Each entry is gated by its categories and offered by holders whose profile fits; none is a default.

- **Her socks in the commander's boots.** A day task: the commander wears her worn items under the uniform all day (her socks inside the boots, her training shirt under the jacket; `worship`, `bodily_fluids` for sweat). Every briefing and every meal is a P17d noticing roll ("you smell of her"); the stimulus layer (P15a §16.8) runs all day at low intensity. A risk the commander carries, not her.
- **Air for answers** (interrogation under smothering; `worship` + `restraint`, deeper with `breath_play`). She questions the commander under her armpit or thighs; air only for an answer. A minimal lie check without a separate interrogation engine (the general mechanic stays on the roadmap, overview §10): `intent_extract` marks an answer `evasive` or `contradicts { factId }` against facts **she** knows (P3b `Knowledge` for her); an evasion or a contradiction costs air (the next window shut) and goes on her list. Air becomes the currency of truth.
- **The squad's boots.** A rare outcome of serving the squad (§8): after a run the commander cleans every woman's boots; each has her own scent and her own dirt (stimulus kinds per woman, P15a §16.8), so the stimulus stages are tested on each; the Regard of the whole squad moves at once (P15 §16.3).
- **Rare turns of a deep dynamic** (by the story, her style and how far the dynamic has gone; never scheduled):
  - **Field gear stays on.** After a run she stays in her field clothes for days on purpose (the "did not wash on purpose" term of P17d, extended to days); the daily service is boots, socks, feet and armpits without her shower; scent bands climb day by day to `overwhelming`.
  - **The pillow.** For a week the commander sleeps face in her boots or her worn socks. Afterwards the conditioned reaction (P17d, revision of 2026-11-20) is literal: without her scent sleep does not come (a sleepless status, P7; commander stress, P12).
- **Breath by her rhythm** (`breath_play`). For a whole session there are no taps (`holdsUntil` ≥ `limit`): the commander breathes only when she lifts or breathes out onto the face; her `seal` skill is high (P15a §16.10); blackout is a real risk (P15a §9.5). The stop word always ends it (P15a §9.4).
- **Memory check:** the socks day noticed by someone → P17d's existing discovery site; an `evasive` / `contradicts` answer → her fact (`hiddenFromCommander: true`); the squad's boots → a `memoryRules` entry (audience: the squad present; importance mid); the rare turns → a `memoryRules` entry each (audience: the pair; importance high); breath by her rhythm → P15a §13 (blackout).

## Acceptance criteria

1. The four categories gate everything they tag; disabled categories never reach a prompt.
2. Objectification: ladder steps by track level, object time with input limits, Strain, POV, the return ritual and its absence cost.
3. Speech rules, the collar, deprivation, pet play, the cage (profile-gated) and coercion work as specified.
4. Serving the squad never occurs as a routine practice; orders through her work in combat.
5. Gratitude and begging are typed and judged; begging escalates.
6. Service draws on real state; preferences are hidden until revealed and affect the verdict.
7. Humiliation uses real memory and verbatim quotes; dictation, edits and the board work.
8. Every element carries `data-analyze`; every generation goes through P14.

## Interfaces already provided by P13 (implemented — use, do not rebuild)

- **The pain burst** is the commander punishment with an `injury` effect in the registry `commanderPunishments` (read by effect, never by id): `commander_stress` 15 through `addCommanderStress(draft, amount, 'warden_punishment')` plus an injury chance falling with Endurance. `applyCommanderPunishment` needs a warden; `applyRemotePunishment` (no warden: stress, injury, slots, the squad's record) is the form for a holder that is not P13's. A discipline module of this package that hurts the commander adds an entry (and, if it needs a new effect, a case in `runEffect` in `src/engine/warden/punish.ts`) instead of a new mechanism.
- **Commander stress** (P12): `addCommanderStress` / `commanderStress` / `commanderStressBand`; nothing here draws.

## Interfaces already provided by P14 (implemented — use, do not rebuild)

- **Every model call goes through the envelope** (`app.generations`, `src/llm/envelope.ts`): `generate(siteId, key, opts?)`, `retry`, `reroll`, `rerollState`, `drop`, `useFallback`. `callLlm` is imported by that module alone (`tests/architecture.test.ts`).
- **A package that adds a call type or a flavor kind registers its site in the same change:** a `SiteDecl` in `src/llm/sites.ts` (`id` like `<area>.<what>`, `callType`, `surface`, `reroll` mode, `record` mode, generic `label`, glossary id) and the handlers bound by the owning controller (`envelope.bind`: `build` rebuilds the input from the state, `apply` runs the same engine action as before, `fallback`, `committed` / `undo` for the reroll mode). `tests/llm/siteRegistry.test.ts` fails for a call type or flavor kind without a site; the architecture test refuses a direct `callLlm`.
- **A failure** is `refused`, `truncated`, `timeout`, `network`, `invalid_output`, `empty` or `no_profile`; the envelope writes a record (`CampaignState.generations`, at most 20, no prompt, no model text, `detail` never the model's words) unless the site's record mode is `none` or the reason is `no_profile`. Add the chip with `drawGenerationChips(host, ctx.generation, state, surface, filter)` and REROLL with `drawSiteReroll`; a screen draws neither without `generation` in its context. Labels are generic: never put a hidden value in one.
- **The engine decides:** a retried or rerolled value goes through the same sanitizer and the same action as the first one; none of the new actions draws from the rng, so a new site must not either (a seeded test that moves stops and reports).
