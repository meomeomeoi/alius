# P17f — Special Traits of Holders: Hide and Seek, Pygmalion, the Canvas

**Status: spec.** Release 0.2 (post-release), after P17e. **Depends on:** P15 (the dynamic, §16: Regard, motives, styles), P15a (blocking, physics, §16), P16 (practices, §R), P16b (service craft: postures, the commander's schematic), P17 (stagings), P17a (contracts, inspections), P17b (feminization, R.4), P17d (scent), P17e (habits), P14c (temperament, opinions, the news queue), P10d (the base plan: door graph, plan marks), P12 (the special-trait pattern), P14, P7a. **Read:** overview; P12's **Implemented as**; P15 §16; this file.

**Analysis tool (P7a)** and **P14** rules apply; hidden values (her knowledge of the commander's routes, the plan's private items) are sentinels in `tests/fixtures/analyze/hidden.ts`. **Lore §0:** no pronoun for the commander.

Origin: the 2026-11-20 design session. P12 gave the commander special traits that are whole subsystems; this package gives the same to holders.

## 0. The frame

- A holder has **at most one** special trait; traits are **rare**. `profile_import` proposes one only when the card fits it (site `profile.holder_trait`, part of the import); the player can switch it on or off, or pick one, in the wizard and the dossier (edit lock applies). A trait needs an eligible holder (P15 §3) and its own gates.
- **A special trait brings new things to do**, never multipliers: new verbs, screens and loops for the player.
- **It lives for months:** phases that change the play, a rhythm of every few days (never a daily chore), state that accumulates, branches and endings; it reads other systems so each episode stands on a new situation.
- Registry `holderTraits`: `{ id, gates (categories, frame, style hints), phases, description }`; code reads a trait by its effect types, never by id (P12 rule).
- **No rng draw without the trait** (P12 rule): a campaign without a holder trait stays byte-identical.

## 1. Hide and seek on the base

She watches where the commander goes and finds the commander anywhere; over months she learns the commander's routes and closes the base in.

- **Play.** On days she declares (a game, a hunt, a test; by style), the commander moves through the base plan (P10d) along the **door graph**; she appears in rooms as plan marks; the player routes to avoid her or to reach a goal room (a meeting, a hiding place) in time.
- **How she finds:** by scent (P17d: what the commander carries, where the commander has been), by habit (the commander's routines become her knowledge: a per-room count of the commander's visits), by noise (P15a §16.5), and later by **accomplices** (other women she recruits to report: P17a attitudes).
- **Escalation over months:** she learns routes (her knowledge grows per room), sets **zones** ("the roof is mine after dark") and **time limits**, recruits accomplices, and finally takes territory (rooms where the commander may not be without her leave). The commander gains **secret paths** (rarely used doors, the vents of `cramped` places when they exist, timing with the slot light) and **covers** (washing off her scent, another woman's company, a duty that cannot be interrupted).
- **Outcomes:** found → her reaction by style (a playful forfeit, a claim of the night, her discipline); not found → her irritation or a keener hunt; reaching the goal → a privilege or her respect (Regard for skill, P15 §16.3).
- **Phases:** play (rare, light) → the hunt (regular, with stakes) → the closed base (zones, accomplices, territory) → an end: she owns the base for the commander; the commander wins a free route she accepts; or the game turns into a ritual of the pair (P17e).
- **Rhythm:** a hunt every 4–7 days at most; between, her knowledge shows in small lines ("you went the long way again").

## 2. Pygmalion

She has an image of who the commander **should** become and shapes the commander toward it.

- **The plan.** Generated once (site `holder_trait.plan`, budget 400) from her card, style and what she knows of the commander, validated against closed vocabularies: **items** of manners (protocol, P16), speech (rules, P17b §3; address, P17e §5), appearance (clothing and `worn` items; with `feminization` enabled, the feminization of P17b R.4 as one item), skills (P16b disciplines and her hobby, P14c), and **opinions** (topics of P14c §4 she wants the commander to hold, with the positions she wants). The plan is shown in her hand in the dossier; she adds and removes items as she goes.
- **Reviews** every 7–14 days: she checks each item against state (skills, `expression`, the commander's declared opinions, kept rules) and the record of deeds; her verdict per item; adjustments; a stricter plan for slips.
- **The commander's choices:** yield item by item, resist some, or **fake** (comply in front of her, not in fact: a P15a-style cheat she may find out; Regard by style).
- **Opinions.** She argues the commander toward her positions in scenes (the reverse of P14c §4.4: the commander's declared position is a fact; she counts the commander's agreements); the commander may hold out.
- **Endings:** she finishes, and either loses interest (cold, playful) or reveres what she made (affectionate, regal); the commander breaks off (an exit with its aftermath, P15 §9); she realises she loved the one before the change (a rare turn by appraisal, P14b).
- **Rhythm:** a review every 1–2 weeks, plan items worked on through ordinary practices.

## 3. The canvas

She writes and draws on the commander's skin, and over months the canvas becomes hers.

- **Play.** Marks (`her_marks`, `docs/content/blocking.md` §2) on the commander's body schematic (P16b §7): words, her signature, symbols, drawings; each with a place, a durability and a visibility by clothing.
- **Hiding:** the commander chooses clothing to cover or show (the visibility rules of P15 §15.13: a mark seen by others is a sign of the dynamic); washing is forbidden until she allows (a rule; a slip if broken).
- **Her vocabulary grows:** her words for the commander, symbols that mean things between them (a mark for a kept task, a mark for a slip), and her style decides the tone (tender notes, insults, a tally of offences).
- **Durability grows:** early marks last a slot; later ones days; late ones are **near-permanent** (with `body_modification` when it exists: overview §10); a near-permanent mark is a `severe` rung of the consent ladder.
- **Links:** marks are read by the squad (suspicion, Regard, the nickname), by medbay checks and showers, by inspections (P17a), by her other practices (a word she wrote is the protocol of the day).
- **Phases:** play → a language between them → a record of the dynamic on the body → an end: the marks fade if the dynamic ends (aftermaths read them), or a near-permanent sign stays.
- **Rhythm:** a mark when something happens worth marking (a kept or broken task, a milestone), not daily.

## 4. Deferred

- **Her circle:** she slowly stirs other women toward owning the commander together. Needs a deeper group ownership first (overview §10).

## 5. UI

- Dossier › DYNAMIC: the trait's section (her plan in her hand; the canvas on the commander's schematic; the hunt's record and her zones on the plan).
- Hub › plan: her marks during a hunt, her zones, the commander's secret paths once found.
- Every element `data-analyze`; hidden values through `Knowledge` only.

## 6. Directives, events, actions

- Directives (`htrait:`-prefixed, derived, triggered per P14c §0): the hunt, her plan's item of the day, a mark and its meaning.
- Events: `hunt_declared`, `hunt_found`, `hunt_escaped`, `zone_claimed`, `accomplice_recruited`, `route_learned`, `plan_made`, `plan_reviewed`, `plan_item_kept`, `plan_item_faked`, `plan_ended`, `mark_made`, `mark_seen`, `mark_faded`.
- Actions: `hunt/move { roomId }`, `hunt/hide { roomId }`, `plan/answer { itemId, answer }`, `canvas/cover { markId, item }`.

## 7. Memory check

- `hunt_found` with a forfeit → a `memoryRules` entry (audience: the pair); `zone_claimed` → a fact (audience: the pair and her accomplices); `accomplice_recruited` → a fact (audience: her and the accomplice, hidden from the commander).
- `plan_reviewed` → bookkeeping; `plan_item_faked` found out → a `memoryRules` entry (audience: the pair; importance mid); `plan_ended` → a `memoryRules` entry (importance high).
- `mark_seen` → the P15 §15.13 suspicion site and a `memoryRules` entry (audience: those who saw it); a near-permanent mark → a `memoryRules` entry (importance high).

## TUNING draft

| what | value |
|---|---|
| hunt | at most every 4 days; her room knowledge +1 per commander visit, decays 1 a week; found chance per room = her knowledge × scent band × noise; accomplices from phase 3 |
| plan | 5–9 items; review every 7–14 days by style; fake found chance 0.15 per review × her `reading` |
| canvas | durability: phase 1 one slot, phase 2 two days, phase 3 a week, phase 4 near-permanent (with `body_modification`) |

## Acceptance criteria

1. Without a holder trait nothing runs and seeded tests stay byte-identical.
2. A trait is proposed only when the card fits, can be toggled, and needs an eligible holder.
3. Hide and seek runs on the door graph with her knowledge, scent and noise, escalates through its phases, and ends in one of its endings.
4. Pygmalion makes a validated plan, reviews it against state, handles yield / resist / fake, argues opinions, and ends.
5. The canvas places marks on the schematic with durability and visibility, grows her vocabulary and durability, and is read by the squad, the medbay and inspections.
6. Every element carries `data-analyze`; every generation goes through P14; hidden values are sentinels; the memory verdicts of §7 are implemented.

## Open decisions (author)

- Descriptions; the plan's item vocabulary; her mark vocabulary; the hunt's forfeits.

## Interfaces already provided by P14c (implemented — use, do not rebuild)

- **Hide and seek:** `whereaboutAt(state, reg, unitId, day, slot)` (derived, stateless, no rng; `routineWeight` adds a hobby room for a soldier who has hobbies) and `takesPart(state, unitId)` (named, living, at the base). Read rooms by `sceneLocationId`, never by id.
- **The canvas and Pygmalion:** her hobbies leave traces (`hobbies[].milestones[].trace`: `note` is a note in her quarters in her hand, `prop` a line in the dossier until P17c's layers draw it, `opinion` opens a topic); her opinions are `Unit.opinions` (read through `Knowledge.life` for what was told; a moved opinion keeps `history`). `temperamentOf` is her temperament.
- **Facts about her days:** `writeLifeFact` / `revealFact` (hidden, tag `untold`), and the `life:` directive prefix is reserved.
- Keep new directive ids away from `life:`; no rng draw (`lifeChance` / `lifeHash` hash a key with the salt); read life content by field, never by id. Details: P14c **Implemented as**.

## Interfaces already provided by P15 (implemented — use, do not rebuild)

P15 is implemented (see its **Implemented as**: rulings R1–R25). What follows is what exists for this package and what is reserved for it. Every P15 reader answers null, zero or an empty list while the dynamic is off (`dynamicOn`, `herPracticeLive`), and nothing it adds draws from the rng unless someone is eligible: a hook you register must keep a campaign with no dynamic byte-identical (`tests/dynamic/unaffected.test.ts`). Keep new directive ids away from `dynamic:`; read domains by capability, styles, milestones and aftermaths by field, never by id; no text gives the commander a pronoun or a feeling.

- **An eligible holder:** `canHold(state, reg, unitId)` and `holderCap`; `profile_import` is one call with sections, so a trait proposal is another section of the same call (site `setup.profile_import`, P14).
- **Hiding marks and the squad:** `her_marks` and `territory_marking` are reserved `dynamicSigns` rows with no producer (`addSign` after `contentAllowed`; `territory_marking` is tagged `bodily_fluids`); a `mark_seen` memory rule is yours.
- **Endings:** `exitDynamic(draft, ctx, unitId, route)` with its cost and an aftermath (`pickAftermath`, one draw); `formerHolder` and `rekindle` for a return; a realisation turn is P14b's appraisal.
- **Whereabouts and the base:** `second_place` puts the commander in a holder's cabin on a booked evening (`roomOfPerson`); the commander marker is drawn by `planView`.
- **Pattern for a trait with its own subsystem:** the `special/` modules read a trait by effect type; keep directive ids `special:`-prefixed and away from `dynamic:`.
