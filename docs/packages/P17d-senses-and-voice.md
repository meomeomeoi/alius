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

- **Rhythm:** her typing speed (P3's fixed 60 chars/s) varies with emotion and style: `cold` even, with a pause before the key word; `playful` quick; `obsessive` in bursts; `drill` clipped; `regal` slow and deliberate; `vindictive` even and cold with the weight on one word; an ellipsis lingers when she is testing. Her `volatility` (P14c) makes the rhythm swing.
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

## Revision of 2026-11-20 (design session)

Added after the 2026-11-20 design session. Where it conflicts with the sections above, this section wins. The commander's bodily responses to sweat and scent (tolerance, reflex, the ways of inhaling, the trajectory, the language of perception) are P15a §16.8.

- **Sweat as the diary of her body.** Sweat has a kind: `exertion` (training, a run, sparring), `heat` (the garage, the boiler, a hot bunk at night), `fear` (before a mission, after a nightmare), `night`, `stale` (days without a shower). Each smells and reads differently; the commander learns to read her day from it. **Fear sweat is a tell** (P15 §15.8) of her anxiety and makes the `her_weakness` source live. Her hygiene trait and her intention not to wash (the 2026-11-19 depth revision above) still apply.
- **Her worn things carry her.** Socks, gloves, insoles, the training shirt, wraps: each item has its own scent state that fades over days. Her laundry (`doing_her_laundry`, P15a) becomes a practice; a worn item may be a gift, a reward or a task ("keep it on you", "sleep with it"; P17b rev. 2026-11-20 for the harder forms). The squad may notice it on the commander (the noticing roll).
- **"Do not wash my sweat off your face"** — a rule (P16 rule templates) until a time she sets; breaking it is a slip; a visitor's noticing roll applies.
- **Armpit hints** (`hintStyle`, P15 §16.7). Each holder draws a few hints from a pool by style and mood: stretching with her arms up, wiping sweat in front of the commander, "I'm soaked", taking off her jacket in the heat, raising an arm near the commander's face, sending the commander for a towel, a teasing headlock. `offers` says it outright; `hints` hints; `expects` waits to be understood: a missed hint is a quiet disappointment, a caught one a mood-reading bonus. Small details: "I stopped using deodorant for you" as an intention term and a visible item in her quarters; armpit saturation is its own stimulus kind (P15a §16.8); after her training a scent line appears on the hub as she passes.
- **The blind chronicle.** Scenes under a blindfold, a hood or in the dark are written into the journal and the chronicle as **what was perceived**, not the omniscient truth: sounds, scents, touch, her words; `scene_summary` receives a perception-only directive for them.
- **Conditioned reactions.** A cue (a registry `cues` entry: her scent, her bell, a word she uses, the collar's click) that has been paired with practices often enough (`TUNING.senses.conditionAt` pairings within 30 days) becomes conditioned for the commander: when it fires outside a scene, the interface reacts (P17c rev. 2026-11-20) and the P15a `own_slip` source may become live. Without pairings it fades. Stored as `Commander.conditioned[cueId] { pairings, since }`; a deed record, not a feeling (ruling E as revised, P15 §16.1).
- **Memory check:** a conditioned cue formed → a `memoryRules` entry (audience: the holder who formed it; importance low); fear sweat read correctly → bookkeeping; worn items given → a `memoryRules` entry (audience: the pair); a missed hint at `expects` → bookkeeping (her disappointment is a Regard and favour move).
- **TUNING draft:** `conditionAt` 12 pairings within 30 days; a conditioned cue fades after 21 days without a pairing; worn item scent: one band down per 2 days.

## Acceptance criteria

1. Sensory lines come from the room, engine events (on the door side), the scene call and her replies; they respect reduced motion and readable mode.
2. Scents arrive before visitors, cling for N slots, can be noticed with a discovery roll, can be washed off, and washing can be forbidden.
3. Whispers are visible only to the player and are judged as tasks.
4. Interruptions cut the display only; edit and swipe keep the original.
5. Rhythm and distance follow emotion, style and staging; "she thinks" replaces the spinner.
6. Every element carries `data-analyze`; every generation goes through P14.

## Interfaces already provided by P14c (implemented — use, do not rebuild)

- **Temperament:** `temperamentOf(state, unitId).volatility` is the input of her rhythm (steady / moody); `talkativeness` and `humor` set how much and in what tone she speaks. Never read `Unit.temperament` directly.
- **The room's sensory pool:** `pastimes[].sensoryTag` (one word per pastime) and the pastime's `locations` are stored for you; today the directive `life:pastime:<unitId>` carries only the opening and both activities. Read the tag by field, never by pastime id.
- **Where she is:** `whereaboutAt(state, reg, unitId, day, slot)` is the hub's own derived placement for any day and slot (no stored room, no rng).
- Keep new directive ids away from `life:`; no rng draw (`lifeChance` / `lifeHash` hash a key with the salt); read life content by field, never by id. Details: P14c **Implemented as**.

## Interfaces already provided by P10d (implemented — use, do not rebuild)

- **The plan** (`planRooms`, `src/engine/basePlan.ts`): every place on two floors and the roof, with doors. **Affordances live on plan rooms** (`affordances`: `desk`, `bunk`, `lock`, `line`, `curtain`, `cupboard`, `crowd`, `exposed`, `window`, `water`, `mirror` in the core data); read them there, not on `hubRooms` / `locations`. A new place (shower block, briefing room, corridor) already exists as a closed plan room: give it a hub room and it opens.
- **Space:** `neighbours(reg, id, 'door')` (one step through a door, an opening or a staircase; `outside` for a door to nowhere), `neighbours(reg, id, 'wall')` (what the next room hears), `route(reg, from, to)` (rooms, length, floors) for visitors, summons and footsteps. The outside is per floor: an upper floor's exterior door (the fire stair, the kitchen roof) is a dead end, never a way down.
- **Persons:** `roomOfPerson(state, reg, here, 'commander')` is where the commander is drawn (the commander's cabin today): a hold, a claimed night or the cage add a derived reason there. **P15 added the commander marker** (`renderCommanderMarker`, drawn by `planView.ts` only while the commander is out of her own cabin, glossary `commander_marker`): a new reason to move her is only a derived reason inside `roomOfPerson` (P15's is `second_place`: a holder's booked evening puts her in the holder's cabin); the marker needs no change.
- **Marks:** `registerPlanMarks(provider)` draws a tint, a chip or a prop on a plan room (her territory, a forbidden room, a locked door, the place of a staging); kinds are free strings read by CSS (`data-marks`).

## Interfaces already provided by P14 (implemented — use, do not rebuild)

- **Every model call goes through the envelope** (`app.generations`, `src/llm/envelope.ts`): `generate(siteId, key, opts?)`, `retry`, `reroll`, `rerollState`, `drop`, `useFallback`. `callLlm` is imported by that module alone (`tests/architecture.test.ts`).
- **A package that adds a call type or a flavor kind registers its site in the same change:** a `SiteDecl` in `src/llm/sites.ts` (`id` like `<area>.<what>`, `callType`, `surface`, `reroll` mode, `record` mode, generic `label`, glossary id) and the handlers bound by the owning controller (`envelope.bind`: `build` rebuilds the input from the state, `apply` runs the same engine action as before, `fallback`, `committed` / `undo` for the reroll mode). `tests/llm/siteRegistry.test.ts` fails for a call type or flavor kind without a site; the architecture test refuses a direct `callLlm`.
- **A failure** is `refused`, `truncated`, `timeout`, `network`, `invalid_output`, `empty` or `no_profile`; the envelope writes a record (`CampaignState.generations`, at most 20, no prompt, no model text, `detail` never the model's words) unless the site's record mode is `none` or the reason is `no_profile`. Add the chip with `drawGenerationChips(host, ctx.generation, state, surface, filter)` and REROLL with `drawSiteReroll`; a screen draws neither without `generation` in its context. Labels are generic: never put a hidden value in one.
- **The engine decides:** a retried or rerolled value goes through the same sanitizer and the same action as the first one; none of the new actions draws from the rng, so a new site must not either (a seeded test that moves stops and reports).

## Interfaces already provided by P15 (implemented — use, do not rebuild)

P15 is implemented (see its **Implemented as**: rulings R1–R25). What follows is what exists for this package and what is reserved for it. Every P15 reader answers null, zero or an empty list while the dynamic is off (`dynamicOn`, `herPracticeLive`), and nothing it adds draws from the rng unless someone is eligible: a hook you register must keep a campaign with no dynamic byte-identical (`tests/dynamic/unaffected.test.ts`). Keep new directive ids away from `dynamic:`; read domains by capability, styles, milestones and aftermaths by field, never by id; no text gives the commander a pronoun or a feeling.

- **Hints by style:** `practiceOf(state, reg, unitId).hintStyle` (`offers`, `hints`, `expects`) is imported, validated, editable and lockable (P15 §16.7) with no reader beyond the profile: the armpit-hint pool is yours; mood comes from `satisfactionOf`, her volatility from `temperamentOf` (P14c).
- **Scent:** P15a's `scentBand` and the profile's `expectations.scent` (`base` per target, `hygiene`); the body map already draws the scent hatching as dashed rings and the offer layer reads the target's meaning (`worship[target].meaning`, `how`); the insult when the commander avoids her scent while her meaning is `intimacy` is a hook in P15a's `applyWay` (yours).
- **Mood and tells:** `moodSigns` (her tells only once shown, a mood word after a shared scene today, DM reply length) and `revealedExpectations`; reveal a field through a fact tagged `expect_<field>` / `expect_worship_<id>` (`zoneTag`, `expectTag`), never by writing the profile.
- **Whereabouts and rooms:** `roomOfPerson(…, 'commander')` already carries the `second_place` reason.
- **Conditioned cues:** nothing in P15; counters and axes for a cue are P14b's.

## Interfaces already provided by P15a (implemented — use, do not rebuild)

P15a is implemented (see its **Implemented as**: rulings R1–R16). It built the parts below as hooks or data only; this package completes them.

- **The sensory channel:** `sensory` is data in P15a, with no sensory-line reader.
- **The scent model:** P15a's `scentBand(state, reg, unitId, part)` reads only base × hygiene (`normal`) × situation (after a run, after training). Washing, intention, clinging, noticing, rooms, nameless lines under a blindfold, the sweat layer that `tongue_work` lowers and the conditioned reactions from a stimulus stage of `craving` are yours.
- **Two TUNING blocks to extend:** `TUNING.scent` and `TUNING.stimuli`.
- **What exists:** `scentBand`, `scentLevel`, `exposedKinds`, `perceptionWord` and `updateTrajectory` (`src/engine/physics/stimuli.ts`, `scent.ts`), the directive `physics:perception`, the stage words of `stimulusKinds[].perception`. Tolerance starts at 20 (AUTHOR TO TUNE); `sweat_stale` and washing are not built.

## Revision of 2026-11-25: the scents and their shame (approved by the author)

Where it conflicts with the sections above, this section wins. It extends P15a's `stimulusKinds` (the four sweats, feet, armpits, body, worn things; `scent_intimate` / `taste_intimate` specified in P15a §16.15) and §2's signature scent with **what a scent means when someone else notices it on the commander**.

**Each scent has:**
- `shame` 0–4: 0 means nothing, 1 "you were close", 2 intimacy, 3 humiliating, 4 explicit;
- a content gate;
- how long it **clings**: short 1 slot, medium 3, long 6;
- what **removes** it: a quick wash (§2's wash) or only a shower (a slot's activity).

| Scent (id) | What | Shame | Gate | Clings | Removed by |
|---|---|---|---|---|---|
| `sig_perfume`, `sig_soap`, `sig_mint`, `sig_gun_oil`, `sig_antiseptic`, `sig_engine_oil`, `sig_smoke`, `sig_coffee`, `sig_leather`, `sig_vat` (the vat's sterile sweetness of constructs) | her signature (§2; one each) | 1 | — | medium (clothes longer) | wash |
| `scent_body`, `scent_hair` | her skin, her hair | 2 | — | medium | wash |
| `breath` | her breath (a kiss) | 2 | — | short | wash |
| `saliva` | her saliva on the commander's face | 3 | `bodily_fluids` | short | wash |
| `sweat_exertion`, `sweat_heat` | her sweat | 2 | `bodily_fluids` | medium | wash |
| `sweat_fear` | her fear (the shame is rather hers: it tells of her anxiety) | 2 | `bodily_fluids` | medium | wash |
| `sweat_night`, `sweat_stale` | night sweat, stale sweat | 3 | `bodily_fluids` | long | shower |
| `scent_feet`, `scent_armpit` | her feet, her armpits | 3 | `worship` | long (on the face) | shower |
| `scent_worn`, `scent_boots` | her worn things, the inside of her boots | 3 | `worship` | long | shower |
| `polish`, `dirt_of_day` | boot polish, the dirt of her day on the lips | 3 | `worship` | until washed | wash |
| `scent_underwear` | her worn underwear | 4 | `worship` + `explicit_scenes` | long | shower |
| `scent_intimate` | her musk, her arousal (her anatomy by her card) | 4 | `explicit_scenes` | long | shower |
| `semen` | her semen (anatomy `penis` or `both`) | 4 | `explicit_scenes` + `her_anatomy` | long | shower |
| `after_sex` | the mixed scent of a night, the sheets | 4 | `explicit_scenes` | long | shower |
| `urine` | urine | 4 | `watersports` | long | shower |
| `latex_lube` | latex, lubricant (`strap` and items) | 3 | `explicit_scenes` | medium | wash |
| `blood` | blood after physical discipline (alarming more than shameful) | 2 | `pain_rough` | until washed | wash |
| `alcohol` | drinking together | 1 | — | short | wash |
| `ash`, `oil`, `spores`, `mud`, `dust`, `rain` | where she came from (the dirt of her day) | 0 | — | until washed | wash |

**Modifiers** (the result is clamped to 0–4):
- where it is on the commander: clothes −1, hands 0, neck or hair 0, face or mouth +1;
- who notices: someone who already knows of the dynamic (P15 levels) −1, since it is not news.

**On whom the shame lands:**
- the commander: P15's `regardFall` with the noticer as a witness, at the scent's shame as the humiliation, and P9's nickname deeds;
- her: when their relation is secret, a noticed scent is P9d's publicity path and writes its discovery fact there.

The noticing roll stays the depth revision's (closeness, her perceptiveness, strength, time since). **Memory check:** nothing new; noticing writes its facts at the existing discovery site.

## Worship customs (P17g, 2026-11-25)

**P17g** (`docs/packages/P17g-worship-customs.md`) builds customs that extend this package (relics: footwear and underwear among the worn things, consecration, worship of a relic alone, her check; traces). This package builds nothing of them; keep its mechanics readable by P17g (read by field and effect type, hooks where P17g needs them) and do not build the same thing here.
