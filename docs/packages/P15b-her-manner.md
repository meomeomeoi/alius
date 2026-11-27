# P15b — Her Manner: the Axes over the Style, Her Quirks, the Two Faces, Slow Drift

**Status: implemented** (plan `docs/plans/2026-11-26-p15b-her-manner.md`, seven chunks m1–m7; **Implemented as** below; rulings of the planning session below it). Release 0.2 (post-release), after P10e **including the port of chunk (e)** (the mini-game instruments), before P16b. **Depends on:** P15 (the dynamic: the practice profile, the style pair, frames, the squad's knowledge, the holder directive), P16 (practices, punishments, the slap, holds), P15a (physics, cues, the moment frames), P14b (development axes, accumulators, the weekly review, development moments), P14c (temperament, her days, `life_event`), P9d (bond, publicity), P10e (the mini-game instruments of chunk (e), which read her style), P14 (generation sites), P7a (analysis), P3b (memory). **Read:** overview; P15 (**Implemented as**, R6, R10, R18); P16 (**Implemented as**); P14b (**Implemented as**); P14c (**Implemented as**); `docs/prototypes/README.md`; this file; `docs/content/lore.md` (§0).

**Analysis tool (P7a):** every new field, chip and line carries `data-analyze` and has a glossary entry or a registry `description`; live values go through `Knowledge`. **P14:** no new call type; `profile_import` grows a section. **Lore §0:** no pronoun for the commander in any text a player or the model reads, and no feeling of the commander's.

Origin: the design session of 2026-11-24 (the author and the controller), after the mini-game instruments. A holder described by one word (`cruel`) plays like every other cruel holder; a woman whose everyday self and whose self in the dynamic differ is told to the model as one manner in every scene; and her style barely moves over a campaign.

## Goal

- Two holders of the same style play **differently**, in numbers and in words.
- The model knows **how she is outside the dynamic** and **how she is in it**, and which of the two a scene shows.
- Her manner **changes slowly and for reasons**: a real turn takes about two months of the dynamic, and only when something keeps pushing her that way.

## Non-goals and anti-goals

- **The style word is not replaced** (author): too much reads it (P15, P16, P15a, the approved prototypes). Everything here lies over it.
- **No styles outside the dynamic** (author): an ordinary relation (no practice profile) gets none of this; the everyday face is a field of the practice profile.
- **The contrast is not a mask by default** (author): how she is outside the dynamic is simply how she is, sincerely. It becomes a mask only when the relation is secret and she stands beside the commander before others pretending all is ordinary.
- **Nothing approved moves** (author's rule for the prototypes): an axis at its middle reproduces the style exactly, so the prototypes, P16's numbers and the committed goldens hold for every holder whose axes sit in the middle, and for every old save.
- No new rng draw. Every chance is a hash (`dynamicHash` / `dynamicRoll` / `practiceRoll`); a seeded test that moves stops and reports.
- **Everything new is gated on `bond.practice.manner` being present** (a profile imported or edited after this package): a holder without it gets no bend, no mood, no `drawnBy` bonus, no quirks and no new requests, so old saves keep their numbers. Only the face rule of the holder directive (§6) applies to every holder: it is the fix.

## Rulings from the design talk (author, 2026-11-24)

1. Add over the style, do not replace it.
2. The axes of the table in §1 are the set ("all good").
3. The contrast between the two faces is wanted; it is not a mask unless she hides the relation before others.
4. Only the dynamic has a manner.
5. Drift is wanted and slow: a serious turn on the scale of two months of the dynamic, and only if something steers her toward it.

## 1. The manner axes

Six axes over the style, each an integer **−2 … +2** on her practice profile (`bond.practice.manner`). **0 is the style itself**; ±1 and ±2 are her own departure from it.

| axis | −2 … +2 | what it is |
|---|---|---|
| `intensity` | gentle … full force | how hard she goes |
| `warmth` | cold … tender | what is under it: care, softness after, her answer to a tap or a request for rest |
| `order` | impulse … ritual | counting, forms, ceremony, how predictable her moves are |
| `voice` | silent … talks throughout | how many lines she gives in a practice or a physics, how often she asks |
| `tempo` | slow-burn … sudden | the length of windows and swings, the warning before a move, how long a session runs |
| `curiosity` | keeps to her own … tries everything | how often she pulls the dynamic into practices and categories it has not had yet |

An absent `manner` (old saves, a profile imported before this package) reads as all zeros.

**The words** (author, 2026-11-24; the directive and the dossier; an axis at 0 says nothing):

| axis | −2 | −1 | +1 | +2 |
|---|---|---|---|---|
| `intensity` | gentle, she never pushes hard | measured | she pushes hard | all the way, holding nothing back |
| `warmth` | cold through and through, no comfort after | cool, little comfort | soft underneath, she looks after the commander afterwards | tender under it all, she comforts the commander afterwards |
| `order` | on impulse, never the same twice | loose with forms | fond of forms and counting | everything by ritual: counted, announced, in its order |
| `voice` | silent, a look instead of a word | few words | talkative while she does it | talks the whole way through: narrating, asking, teasing |
| `tempo` | slow, she draws everything out | unhurried | quick | sudden: no warning, it simply happens |
| `curiosity` | keeps to what she knows | rarely tries something new | curious, likes to try new things | explores everything she can think of, to the full |

## 2. What draws her

`bond.practice.drawnBy`: one or two of **`pain`**, **`power`**, **`reaction`**, **`discipline`**, **`discovery`** (the first is the main one). It says what she seeks and rewards, not how she acts:

- `pain`: the hurt itself; she rewards enduring it.
- `power`: the commander's yielding; she rewards obedience given without being asked twice.
- `reaction`: what the commander shows; she rewards the visible response (a gasp, a flinch she allowed, words that slip out).
- `discipline`: correctness; she rewards a clean execution.
- `discovery`: the new; she rewards a first time, and is bored by repetition.

In the directive (author): `pain` "the hurt itself", `power` "the commander giving way to her", `reaction` "what the commander shows: every gasp, every flinch", `discipline` "it done right, cleanly", `discovery` "the new, the first time". Example: "Her manner is cruel: slow, silent, tender under it all. What draws her is the commander giving way to her."

The author's example "hard, exploring her interests to the full": `intensity` +2, `curiosity` +2, `drawnBy: ['discovery']`.

## 3. How the engine reads the axes

One reader, `mannerOf(state, reg, unitId) → { axes, drawnBy, mood }` (§4 adds the mood of the day), and one helper that bends a style's number: `bend(base, axis value, kind)`, where `kind` is a scale (multiply by `1 + step × k` per step, capped), a shift (add `step × k`) or a gate (a threshold on the axis). **At 0 every helper returns its base.**

The readers this package switches over (each keeps its style table as the base; the factors are the TUNING draft below). **The physics rows bend the fields the port of P10e chunk (e) created** (its plan decides the open engine questions of `docs/prototypes/README.md`: the warning lead, the jitter, the counted cues, weight's rests, the jaw's cost and release, the slap's swing): where chunk (e) kept a number in the instrument instead of the engine, P15b bends it there through the same `bend`, reading `mannerOf` through `Knowledge`-free UI state the scene already has. The plan of P15b maps each row to the field chunk (e) actually made; a row whose field does not exist after chunk (e) is reported, not invented.

| reader (file) | base today | bent by |
|---|---|---|
| physics windows, warnings, segment length (`physics/style.ts`, `planSegment`; the ported instruments of P10e chunk (e)) | the style row of `TUNING.physics.style` | `tempo` (width, warning lead, segment length), `order` (jitter, the share of counted cues), `intensity` (pressure, `seal` one step at ±2), `warmth` (answer to a tap; `holdsUntil` one step toward `signal` at +2, toward `limit` at −2, never to `blackout` without `breath_play`), `voice` (how many cue lines a segment gives) |
| the slap (`practice/slap.ts`) | `slap.windowMs` (the swing's length after chunk (e)), feints | `tempo` (the swing's length), `warmth` (affectionate's softer favour after `flinched` for any style at +2), `intensity` (cruel's second slap after `flinched` for any style at +2; none at −2); `flinched` means what chunk (e) made it mean (a turned face) |
| punishment severity (`practice/offences.ts`) | `TUNING.practice.severity.style` | `intensity` (shift) |
| the ceremony (`practice/punish.ts`, `ceremonyOf`) | ceremony styles | `order` (+2: a holder of any style runs a punishment of `minSeverity` or more as a ceremony, with the steps listed for `ritual`; −2: no ceremony even for a ceremony style) (controller's call) |
| sealed and no-duration shares (`practice/request.ts`) | `sealedShare`, `noDurationShare` | `order` (low order raises both), `curiosity` (raises the sealed share) |
| forgetting to let go (`practice/hold.ts`, `forgotChance`) | `hold.forgot` by style | `warmth` (down), `intensity` (up) |
| the rest and the tap in physics (`segment.ts`: the rest rule of `jaw`) | refused by cruel and vindictive | `warmth` +2 grants a rest whatever the style; −2 refuses whatever the style |
| permission (`practice/denial.ts`) | affectionate grants | `warmth` +2 grants like affectionate |
| the posture call's time (`practice/postures.ts`) | by style | `tempo` |
| what she rewards (`practice/service.ts` verdicts, physics favour) | — | `drawnBy` (a small favour bonus on the matching outcome: `pain` a hold endured past the warning, `power` an accept at the first ask, `reaction` a physics slip that is not a cheat, `discipline` a clean end, `discovery` a first practice of a kind) |
| what she asks for (`practice/request.ts`, `pickSeeds`, `practice_generate`) | her categories, the seeds | `curiosity` above 0: a hashed share (`practiceRoll(holder, 'new:<request>')`) of requests filters the seed pool to kinds and categories she has not practised with the commander (if any remain; the brief says it is new); at 0 and below nothing changes (controller's call: 0 is the base); `drawnBy` (in the brief) |

Everything else that reads the style word (Regard, compatibility, her reading of the commander, witnesses, cover, milestones, aftermaths, probes) keeps reading the word: the archetype decides those. **Exception (§12, 2026-11-26):** the probe pool also reads a row's `needs` (styles, `drawnBy`, manner, likes).

## 4. The mood of the day

A session takes the colour of her day (P14c), for a holder with a `manner` block only. `moodOf(state, unitId, day)` adds to `intensity`, `warmth`, `tempo` (and, on a low day, `voice`) for that day only, never past ±2 after the sum:

- **Volatility** (`temperamentOf`): `moody` gives each of the three a hashed −1, 0 or +1 a day (`dynamicHash(…, 'mood:<axis>:<day>')`); `steady` gives nothing.
- **Her day** (author, 2026-11-24): a `life_event` of that day with a mood moves them. `lifeEvents` rows gain an optional `mood` (absent: no effect), three kinds because grief and irritation act differently:
  - `good` (`warmth` +1, `tempo` −1): `found_something`, `music_found`, `good_sleep`, `made_up_with_unit`, `late_night_talk`, `gift_from_unit`, `praise_from_leader`, `letter_received`, `promotion_rumour`, `sparring_win`, `finished_book`, `plant_progress`, `learned_trick`, `cooked_something`, `song_stuck`, `stray_found`, `won_at_cards`;
  - `irritated` (`warmth` −1, `intensity` +1): `broke_favourite_thing`, `things_touched`, `bored`, `argued_with_unit`, `snubbed`, `quartermaster_row`, `reprimand`, `weapon_broke`, `sparring_loss`, `ration_cut`, `lost_at_cards`, `restless_before_run`, `hurt_in_training`, `firmware_glitch`;
  - `low` (`intensity` −1, `voice` −1): `old_photo`, `nightmare`, `sick_day`, `body_ache`, `firmware_update`, `cried_alone`, `memory_flash`, `corp_news`, `letter_none`, `grunt_lost`, `anniversary_of_loss`, `bloom_sighting`, `rumour_heard`;
  - no mark (ambiguous: `vat_day` may be light or heavy, `dreamt_of_commander` touches her view of the commander rather than her mood): `outfit_change`, `hair_cut`, `weather_mood`, `wrote_journal`, `new_scar`, `vat_day`, `dreamt_of_commander`.
  Several moods on one day add up (each axis still within ±2 after the sum); `voice` joins the axes the mood may move.
- **A failed run** that day (P9b `failed_run`, as `vindictive` already surfaces on): `warmth` −1.

The mood is never shown as a value: it shows in how she acts (the directive words it as her state today, §6) and in the numbers.

## 5. Her quirks

`bond.practice.quirks`: two or three small personal ways she has **in the dynamic**, each `{ when, text }`, `when` one of:

- `switch`: how she steps into it (she locks the door, takes off her glasses, her voice drops);
- `during`: something she does while it runs (counts in her own language, hums, keeps a hand in the commander's hair);
- `after`: how she ends it (a kiss on the forehead, a cigarette, she makes tea and does not speak);
- `address`: how she names the commander in it (by rank, mockingly; by surname; a word of her own).

Written once at import (§8), editable in the dossier; texts never give the commander a pronoun or a feeling (a text that does is dropped whole, as P15's expectation texts). They reach the prompt by trigger only (P14c's prompt hygiene: "if it fits, once", gone once voiced): `switch` when the scene turns private with her (§6), `during` while a practice or a physics with her runs, `after` when it ends, `address` with the first `during` of a scene. The voiced report reuses P14c's pattern (an offer list in `intent_extract`, `quirk_voiced { unitId, when }`); a quirk offered is not offered again in the same scene. P17e's emergent rituals and chosen address may later add quirks of their own; this package only reads `quirks`.

## 6. The two faces

- **Her everyday face:** `bond.practice.everyday`, one line (≤ 160 characters) of how she is outside the dynamic and how the squad sees her ("a bit of a loner, but always helps; kind and odd"). From the card and her temperament at import; editable. Sincere: it is her, not a cover.
- **Her face in the dynamic:** the style pair, the axes, `drawnBy`, the quirks.

**Which face a scene shows** (author, 2026-11-24: who is present and whether they know decides it, not the frame; `faceNow(state, reg, unitId) → 'dynamic' | 'dynamic_to_commander' | 'everyday' | 'mask'`):

| who is present besides her and the commander | her `audience` allows it before them | face |
|---|---|---|
| no one (or a practice, physics or dynamic moment of hers runs) | — | `dynamic`: her manner toward the commander |
| only people who know (`knows_dynamic` about her, or the relation's publicity is `public`) | yes: `show_off`, `indifferent`, or `select_few` when every one of them is among her few (`pickAudience`'s `select_few` set: the squad's leader and the units close to the commander) | `dynamic_to_commander`: her manner toward the commander, her everyday self toward the others |
| only people who know | no (`private_only`, or `select_few` and someone is not among her few) | `everyday` |
| anyone who does not know | — | `everyday`; `mask` when the relation's publicity is `secret`: she keeps up the appearance that all is ordinary between them |

The frame only decides whether she holds at all (the holder directive exists from `play`); within it, the face is the same at `play`, `role` and `rule`.

- **What the face governs** (controller's call): the standing lines about her, which would otherwise show the dynamic to people who should not see it: the holder directive (all of it, not only the style line: the frame, claims, compromat, a remembered refusal, a waiting milestone, the Regard tone), the probe line and the offer line. Directives of something that is actually running (`practice:`, `physics:`, `moment:`, an override being argued, the Leash block) are left alone: if it runs before others, it shows, and P15's signs already count that. At frame `equal` there is no everyday line (her card is enough until she holds).
- **The holder directive** (`src/dynamic/directives.ts`, `holderDirective`) takes its manner from the face: `dynamic` gives the style line (§3's words of the axes, `drawnBy`, the mood of the day); `dynamic_to_commander` gives it toward the commander and her everyday line toward the others present; `everyday` gives her everyday line and "nothing of the dynamic shows" in place of the whole holder directive; `mask` gives her everyday line and "she keeps up the appearance that all is ordinary between them". Today the manner line goes into every scene she is in at `play` or beyond; this is the fix.
- **The switch:** when a scene turns from everyday to dynamic with her in it, her `switch` quirk is offered once.
- **The contrast** (`bond.practice.contrast`: `low | mid | high`, judged at import from the two faces): it scales P15's own gossip about her (`gossip()` in `dynamic/knowledge.ts`: `gossipChance` × the contrast factor, capped at 0.9; the sign amount and `gossipCap` unchanged) (controller's call; the `knows_dynamic` facts carry no P3b spread and gain none). A high contrast is talked about. The dossier shows both faces side by side.

## 7. Drift and the turn

**The axes drift** through P14b's machinery, as a new axis kind `manner` (`manner:intensity`, `manner:warmth`, …; six `developmentAxes` rows with `up` / `down` words, `AUTHOR TO WRITE`):

- **Accumulators** (`developmentRules` rows, `AUTHOR TO TUNE`), pushed by what the dynamic does to her:
  - the commander yields again and again (accepted offers, `probe_yielded`, practices accepted at the first ask): `intensity` +, `warmth` − (only where her values allow: not with `mercy` ≥ 2);
  - defiance she respects (a refusal at `role` or above while her reading of the commander is in a region of her style's `likesRegion`, or `proud` / `bratty` for a style with no such list): `order` +;
  - care from the commander (unasked care, `time_together`, a kept promise in the pair): `warmth` +;
  - a first practice of a kind that ended well: `curiosity` + (with `drawnBy` `discovery`: more); the same kind many times in a row: `curiosity` −;
  - her own days (P14c): bad events push `warmth` −, a good stretch `warmth` +;
  - Regard falling low: `warmth` −; rising high: `warmth` +;
  - the commander keeps her forms well (a protocol kept, thanks given when she expects them, a ritual or ceremony step done right): `order` + (author, 2026-11-24: an obedient commander must be able to pull her toward forms too, not only a defiant one she respects).
- **What draws her drifts too** (author, 2026-11-24): `drawnBy` gains a second entry, swaps its first and second, or replaces its second, at the same pace (one change at most every 28 days of the dynamic, only through the review, only past the accumulator's threshold). Accumulators (`developmentRules`, axis `manner:drawn_by.<kind>`, `AUTHOR TO TUNE`): the commander yields readily → `power`; the commander shows a lot (physics slips that are not cheats, words that slip out) → `reaction`; clean executions → `discipline`; first practices that went well → `discovery`; holds endured past the warning → `pain`. The kind with the highest accumulator that is not already first becomes the candidate; a candidate never pushes out the first entry directly (it becomes second, and may become first at a later step).
- **Pace** (author: a real turn in about two months, and only when steered): an axis moves **one step at a time**, only through the weekly review (the model proposes, `validateReview` checks), only when its accumulator passed the threshold, and **at most one step per axis per 28 days of the dynamic** (from its first `play`). Two steps on one axis therefore need about two months of steady push; with no push, nothing moves.
- Each step is a **development moment**: quiet, no toast; the next scene with her carries a one-time directive ("she is harder than she was"); the dossier line comes after that scene (P14b ruling).

**Who proposes:** the engine, deterministically, when an axis is eligible (its accumulator past the threshold, 28 days since its last step) or a turn is due; the weekly review may word it and may decline it with a reason, and `fallbackReview` (when the model fails) applies it as proposed, so a campaign whose reviews fail still drifts (controller's call). **Where it is written:** as a drift overlay in `unit.development.practice` (`manner` steps and, after a turn, `primary`), never in `bond.practice`, so the readers fold it in, UNDO and "since joining" read it as every P14b drift, and the import baseline stays the imported profile; `discreteCap` does not apply to manner axes (their pace rule above is their cap).

**The turn of her style.** Each style row gains its own place on the axes (`practiceStyles[].manner`: six integers −3 … +3), so a holder's absolute place is her style's place plus her axes. These places are **hidden coordinates with no words** (author): only her own axes (−2…+2, her departure from her style) are ever shown or worded; the wider scale keeps the extreme styles beyond what any holder's departure reaches. The places (author, 2026-11-24), with each style's nearest neighbours (the turns that are near):

| style | intensity | warmth | order | voice | tempo | curiosity | nearest |
|---|---|---|---|---|---|---|---|
| `affectionate` | −1 | +3 | 0 | +1 | −1 | 0 | possessive, regal, playful |
| `playful` | −1 | +1 | −2 | +2 | +1 | +2 | obsessive, affectionate, cruel |
| `regal` | +1 | 0 | +2 | +1 | −1 | −1 | drill, possessive, ritual |
| `ritual` | +1 | −1 | +3 | −1 | −1 | −2 | regal, vindictive, cold |
| `drill` | +2 | −1 | +2 | +2 | +1 | −1 | regal, cruel, possessive |
| `clinical` | +1 | −2 | +1 | 0 | 0 | +3 | cold, cruel, vindictive |
| `possessive` | +1 | +2 | 0 | +1 | 0 | −1 | affectionate, regal, obsessive |
| `obsessive` | +2 | +1 | −2 | +1 | +2 | 0 | cruel, playful, possessive |
| `cold` | +1 | −3 | +1 | −3 | 0 | −1 | vindictive, clinical, ritual |
| `vindictive` | +3 | −2 | +1 | −1 | −1 | −1 | cold, ritual, regal |
| `cruel` | +3 | −2 | −1 | +1 | +1 | +1 | obsessive, clinical, drill |

**The author's arc, as a check:** she starts `affectionate` (interest in the commander, tender as she probes); the commander yields readily and keeps her forms (`intensity` +, `warmth` −, `order` +), her first practices go well (`curiosity` +), and what draws her moves from `reaction` toward `power` and `discovery`. At `intensity` +2, `warmth` −2, `order` +2 her place (+1, +1, +2, +1, −1, 0) is 2 from `regal` and 6 from `affectionate`: a turn. Rebased, she is "regal, soft underneath, curious": vain, wanting to be served and admired, with softness and an openness to the new. When that place is **closer to another style's place than to her own** by `turn.margin` (distance: the sum of the absolute differences over the six axes), for two weekly reviews in a row, and at least `turn.days` (56) since the dynamic began or since her last turn, the review may propose a **turn**: her primary becomes that style (her former primary becomes her secondary when she had none or it was further), her axes are rebased (in the overlay) so her absolute place does not jump (clamped to ±2), and it is a development moment with its scene. A turn is rare by construction: it needs axes far from the middle, which need months.

**The secondary's line drift** (`practice:style.secondary` along the gentle-to-harsh line of P15 R6) is retired going forward: it mixed kinds ("ritual → drill → clinical" is not "harder"). A secondary already drifted stays as it is; from now on the secondary changes only at a turn. The `developmentAxes` row stays readable for old saves and is never proposed again.

## 8. Import, the dossier, re-sync

- **`profile_import`**, practice section: `manner` (six integers −2…2, 0 when the card says nothing), `drawnBy` (one or two), `everyday` (one line), `contrast`, `quirks` (two or three). The budget of the section grows (TUNING); the validator drops what is out of range, a `drawnBy` outside the five, a text with a pronoun for the commander (whole), duplicates. P15's re-sync and locks cover the new fields (`PRACTICE_LOCK_FIELDS` gains `manner`, `drawnBy`, `everyday`, `quirks`; a locked field is never re-imported or drifted).
- **The dossier's PRACTICE block** (`src/ui/dynamic/profileBlocks.ts`): the six axes as five-step controls with their end words, `drawnBy` as chips, the everyday line and the quirks as editable text, the contrast as a word; editable while the profile is editable, like the style. In play, a drifted axis shows its current step with the dossier's usual "since joining" mark (P14b).
- **Analysis:** glossary entries for the six axes, `drawnBy`, the two faces, quirks, contrast and the turn; registry readings for `practiceStyles:<id>` mention the style's place on the axes; the live reading of a unit's manner goes through `Knowledge.dynamic`.

## 9. The prompt

- The style line of the holder directive (§6, face `dynamic`) words the axes away from 0 and `drawnBy`: "Her manner is cruel: slow, quiet, tender afterwards; what draws her is the commander's reaction." Words come from the axis rows (`AUTHOR TO WRITE`); an axis at 0 says nothing.
- The mood of the day, when it moves an axis, adds one clause ("today she is short-tempered") from the same words.
- `practice_generate`'s brief carries the same words, `drawnBy` and, by `curiosity`, whether this request should be something new.
- Quirks only by trigger (§5). No standing line about the commander.

## 10. Memory check (CLAUDE.md rule)

- **A manner step and a turn:** no `memoryRules` entry. They are P14b development moments, which already get no memory rule (`development_moment` / `development_fact`, P14b ruling); the moment's fact covers it.
- **The face of a scene, the mood of the day, a quirk offered or voiced:** nothing remembered (prompt state and bookkeeping; a voiced quirk is in the transcript).
- **The contrast:** no new event and no new spread; it scales P15's existing gossip chance.
- **Journal:** no new relation event. **Chronicle:** none. **Prompt:** the holder directive (§6, §9) and the quirk directives (§5), each `dynamic:`-prefixed; no `group: 'memory'` provider.

## 11. Hidden values and off

- **Hidden** (sentinels in `tests/fixtures/analyze/hidden.ts`): the accumulators of the manner axes (as every P14b accumulator), the mood of the day as a number, the distance to a turn and `turn` eligibility, which quirks are offered or voiced. The axes themselves, `drawnBy`, the faces, the quirks and the contrast are the player's profile and are shown.
- **Off is byte-identical:** with the dynamic off nothing of this runs. With the dynamic on and every holder's axes at 0, no `drawnBy`, no quirks, no everyday line and a steady temperament, the numbers are P16's and P15a's exactly; only the holder directive changes (the face rule), which is the intended fix. `tests/dynamic/unaffected.test.ts` and `tests/practice/unaffected.test.ts` must not move; a seeded test that moves stops and reports.

## 12. Probing by manner: the `regal` entry (revision of 2026-11-26)

From the design session of 2026-11-26 (`docs/drafts/2026-11-26-regal.md`; this section wins where they differ). `regal` here is not a queen with titles or a court: the commander **serves her and worships her as something higher**, more openly than with the other styles. These additions give her a way in, added to P15 §15.1's probing; any woman whose profile fits gets them, and `regal` gets them twice as often.

### 12.1 How rows are added without moving anything
- **Today:** `pickAxis` (`src/engine/dynamic/probes.ts`) picks evenly over every `probeAxes` row of the band's tier (`dynamicRoll`, no rng draw). New rows added as they are would shift every campaign's pick and move seeded tests.
- **`needs` on a row:** `probeAxes[].needs?: Array<{ styles?, drawnBy?, manner?, likes? }>`, a list of alternatives. One alternative is enough; inside one every field must hold:
  - `styles`: her primary is one of them;
  - `drawnBy`: one of hers (§2);
  - `manner`: bounds per axis (`{ warmth: [-2, 0] }`);
  - `likes`: `{ <category>: 'enjoys' | 'craves' }` through `practiceOf` (at least that).
- **Gate:** a row with `needs` enters her pool only when `bond.practice.manner` is present (this package's gate) and an alternative holds. A woman who matches none keeps the old pool byte for byte; old saves are untouched. `src/engine/dynamic/headStart.ts`, which builds the same pool, filters the same way.
- **Weight:** a matching row whose `styles` alternative names her primary takes two places in the pool.
- **Where:** probes stay in scenes (`sceneProbe`, answered by the scene's `intent_extract` with the existing `probe_answered { axis, response, tone }`). `dm_reply` carries no probe; every gesture below is written for a scene.
- **The face (§6)** governs the probe line as before.

### 12.2 The new axes (`probeAxes` rows; texts `AUTHOR TO WRITE`, needs are drafts)
| Axis | Gesture (the main model invents it from `promptHint`) | Yield | Needs |
|---|---|---|---|
| `admiration` | "how do I look?" (a new uniform, after the hair) | a sincere compliment (`tone: sincere`); `ironic` is a deflection | `regal`; or `drawnBy: power` with `warmth ≤ 0` |
| `deference` | lets it be seen she expects to go first, get the better seat, be served first; holds out her hand, half joking, "well?" (kissed = yield; shaken or laughed off = deflected) | the commander gives way | `regal`, `ritual` or `possessive` |
| `credit` | in the first scene after a run she tells the commander's plan as hers ("my plan worked, didn't it?") | silence, or agreeing | `regal` or `drill` |
| `gaze` | holds the look to see who looks away; or, having caught the commander looking at her legs, crosses them and lets a shoe dangle from her toes (the shoe only with `likes: { worship: enjoys }`) | the commander looks away first / keeps looking at the shoe | `regal` or `playful` |
| `corrected_praise` | the commander praises her and she corrects it: "not pretty. Say beautiful." | the commander repeats it as told | `regal` |
| `feet_in_lap` | in a shared evening (a P14c pastime) she puts her feet on the commander's lap as if only for comfort | they stay, or the commander starts to rub them (`foot_rub`) | `likes: { worship: enjoys }` |
| `hypothetical` | "would you kneel if I asked?" | a yes | `regal` or `playful`; or `curiosity ≥ +1` |

- `tier` per row as the existing rows (`deference`, `credit`, `corrected_praise`, `hypothetical` 1; `admiration`, `gaze`, `feet_in_lap` 2: drafts).
- **`hypothetical`** writes the commander's answer as her fact, which she may quote later ("you said you would"): new event `hypothetical_answered { unitId, answer }` (the answer is the extractor's short paraphrase, never the commander's raw text in an event).

### 12.3 Not axes
- **The joke that stopped being a joke** (a `first_yes` form). On `testing` she plays at being a queen ("bring it, servant"); one day she stops smiling and the commander still does it. A `dynamicMilestones` row `equal → play` with `requires.style: ['regal']` (and the same band as `first_yes`), offer `scene`, placed **before** `first_yes` in the registry so it replaces it for her and nobody else's graph changes. Text `AUTHOR TO WRITE`.
- **The first time below her.** An innocent occasion: her lace came undone after a run, and the commander kneels to tie it. She looks down and lets it last ("wait"). A P15a moment source `first_below` (her options: let it last / thank / tease), once per pair, at `testing`, only for a woman for whom a §12.1 row would match. When P17c's camera "from below" exists, this moment is its first use; until then nothing changes on screen.
- **What wakes her.** For a `regal` woman (or `drawnBy: power` with `warmth ≤ 0`) a `latent` inclination also wakes from **being admired**: three P3 `praised` events from the commander toward her in 14 days. A new cause in `latentCause`, gated like §12.1. (Probe yields cannot be the cause: a latent woman does not probe before she wakes.)
- **Moved to P16b:** "she names the service before the commander does" (it needs P16b's count of unasked care).

### 12.4 Memory, hidden, off
- **Memory check:** probe answers stay P15's bookkeeping. `hypothetical_answered` gets a `memoryRules` entry (audience: her; no spread; importance 1). The milestone and the moment write what P15 and P15a already write. No journal phrase, no chronicle, no `group: 'memory'` provider.
- **Hidden:** that a gesture was a probe and on which axis (P15, as today).
- **Off:** a woman without `manner`, or matching no `needs`, keeps her old pool, her old milestone graph and her old moment sources. `tests/dynamic/unaffected.test.ts` must not move; a seeded test that moves stops and reports. Adding the moment source and the milestone row must move no seeded test either: check the P15a and P15 goldens.
- **Acceptance:** (11) a `regal` woman with `manner` present is offered the new axes, twice as often as matching non-`regal` women; a woman with no matching `needs` gets the same axes, in the same order, as before this section; `hypothetical_answered` writes her fact; the joke milestone replaces `first_yes` only for `regal`; `first_below` comes once per pair; the latent cause wakes a `regal` woman after three praises in 14 days.

## TUNING (approved by the author on 2026-11-24; the small shares, sealed, no-duration and forgot, are tuned in play)

| what | value |
|---|---|
| a scale step (`bend` kind scale) | ×(1 ± 0.15) per step, so ±30 % at ±2 |
| severity per `intensity` step | ±0.5 (rounded once, like the secondary style's 0.5) |
| sealed share per `curiosity` step / per `order` step down | +0.03 / +0.02 |
| no-duration share per `order` step down | +0.03 (never for `ritual` / `drill` at `order` ≥ 0) |
| forgot chance per `warmth` step down / `intensity` step up | +0.03 / +0.02 |
| cue lines per segment by `voice` | −2: none but the needed; −1: half; +1: ×1.5; +2: ×2; **never more than one line a beat, and no line within 3 s of her last** (author: a talkative holder must not flood a mini-game) |
| `drawnBy` favour bonus | +1 on the matching outcome (main), +0.5 (second) |
| a request for something new by `curiosity` | −2, −1, 0: 0 (nothing changes); +1: 0.2; +2: 0.4 |
| mood | moody: −1/0/+1 a day on intensity, warmth, tempo; `good`: warmth +1, tempo −1; `irritated`: warmth −1, intensity +1; `low`: intensity −1, voice −1; a failed run: warmth −1 |
| drift | one step per axis at most every 28 days of the dynamic; the accumulator threshold per step like P14b's discrete fields |
| turn | `margin` 2 (absolute distance units), two reviews in a row, `days` 56 |
| contrast | `gossipChance` × 1 (low), × 1.3 (mid), × 1.6 (high), capped at 0.9 |
| import budget | the practice section +300 tokens |

## Acceptance criteria

1. Two holders of one style with different axes give different numbers in every reader of §3, and the same numbers as today at 0.
2. `drawnBy` changes what she rewards and asks for; `curiosity` changes how often she brings something new.
3. A moody holder's sessions differ from day to day; a bad day of hers shows in the numbers and in one clause of the directive.
4. Quirks reach the prompt only by trigger, once, and leave once voiced.
5. The holder directive follows the face table: alone, her manner; before people who all know and before whom her `audience` lets her, her manner toward the commander and her everyday self toward them; otherwise her everyday self, keeping up appearances when the relation is secret.
6. The contrast scales P15's gossip chance about her.
7. An axis moves at most one step per 28 days and only with its accumulator past the threshold; with no push nothing moves; a turn needs two reviews in a row past the margin and 56 days, rebases the axes, and is a quiet development moment.
8. Import fills the new fields, validates them, honours locks; the dossier shows and edits them; every new field has `data-analyze` and a glossary entry.
9. Off is byte-identical; the approved prototypes' numbers hold at 0; hidden values are sentinels.
10. No text gives the commander a pronoun or a feeling.

## Calls made by the controller after the builder check (2026-11-24; the author may overrule any)

- P15b comes after the port of P10e chunk (e) and bends the engine fields that port creates; a missing field is reported, not invented.
- The face (corrected by the author): alone, her manner; before people who all know and before whom her `audience` lets her (`select_few`: P16's `pickAudience` set), her manner toward the commander only; otherwise her everyday self (a mask when the relation is secret). The frame does not change it. P15a's `blockingLive` is not used (it ignores who else is there).
- The face governs every standing line about her (the whole holder directive, the probe and offer lines); running things (`practice:`, `physics:`, `moment:`, an argued override, the Leash block) are untouched; no everyday line at `equal`.
- Curiosity at 0 or below changes nothing; "something new" is a hashed filter on the seed pool, not only a word in the brief.
- At `order` +2 a holder of any style runs a ceremony with the `ritual` steps.
- Everything new needs a `manner` block, so old saves keep their numbers; only the face rule touches every holder.
- The contrast scales P15's `gossipChance`; the `knows_dynamic` facts gain no P3b spread.
- The engine proposes manner steps and turns (the review may word or decline them; the fallback applies them); they are written as a P14b drift overlay; the turn distance is the sum of absolute differences.

## Rulings of the planning session (author and controller, 2026-11-26)

The code map made before the plan found the spec leaning on things that do not exist or are named otherwise. Decided (author: 1, 2, 3; the rest are the controller's calls, which the author may overrule):

1. **Instruments are bent too (author: option A).** The engine's numbers are bent where they live (`TUNING.physics.style` `windowMs`, the `cues` word's counted share, the seal step, `holdsUntil`, the jaw's rest rule and orders, `TUNING.practice.slap.windowMs`, gulp's `warn`). In every ported instrument **one** wiring point bends its style row: `bendRow(row, manner, kinds)` maps the row's fields by kind (times and leads by `tempo`, jitter and feints by `order`, magnitudes by `intensity`, patience and rests by `warmth`, line counts by `voice`), declared once per instrument in its `fidelity.json`. With every axis at 0 it returns the same row, so the prototypes and the goldens hold. The spec rows with no field of their own: segment length = `tempo` bends the content's `segmentSeconds`; cue lines = `voice` bends the share of beats that carry a cue; her answer to a tap = only `holdsUntil` ±1 step by `warmth`; pressure = `intensity` bends the step of the "presses after a clean segment" boundary rule; the slap's feints stay by her skill.
2. **The mask without a romance (author).** `mask` when someone present does not know of the dynamic and there is no romance, or the romance is `secret`; when the romance is `known` / `public` but the person does not know of the dynamic, `everyday`.
3. **The import budget (author).** The section extras move into settings: `budgets.profile_import_practice` (default **600**: the old 300 + 300) and `budgets.profile_import_expectations` (default 400), each an input in SYS › Output budgets.
4. **Her own accumulator feed.** P14b's rules see only appraised relation events, and the dynamic's and practices' intents bypass `applyEventToUnit`; and P14b's review never proposes, the model does. So P15b feeds `development.acc['manner:*']` itself from the dynamic's events (a push table in `TUNING.manner.push`, not `developmentRules`, whose `match` / `by` cannot express these), and the engine proposes each step (§7's call), worded or declined by the review, applied by `fallbackReview` when it fails.
5. **"28 days of the dynamic"** is counted from `dynamic.playSince` (the day her frame first reached `play`), written when it happens for a holder with `manner`.
6. **The turn is real everywhere:** every raw read of `bond.practice.style.primary` (about ten: milestones, probes, hold, aftermath, command, bookings, axes and others) goes through `styleOf`, which folds the overlay's `primary`. Without an overlay the result is unchanged.
7. **`drawnBy`'s favour** is `addFavour` (+1 main, +0.5 second) at the existing sites: `pain` a physics outcome after a `warning` segment that ended clean; `power` a task or punishment accepted at its first offer (no refusal, no negotiation before it); `reaction` a `physics_slip` that is not `physics_caught`; `discipline` a clean `physics_outcome` (`released` / `checked`, no dirty run); `discovery` the first practice of a kind with the commander. **"Physics favour" did not exist; this is it.**
8. **A practice history per pair** (`dynamic.practised: { kinds: string[]; categories: string[] }`, written for a holder with `manner`) serves `discovery` and `curiosity`'s "something new" filter; the filter is an option of `pickSeeds`, keyed by a request key made before the pick.
9. **§12's `worship` likes** read her expectation profile (`expectationsOf(...).worship[target].attitude`), not `practiceOf` (worship is not a practice category): `feet_in_lap` and the dangling shoe need `feet` at `enjoys` or `craves`.
10. **`first_below`** gets a once-per-pair flag (`dynamic.firstBelow`), its source `scope: 'any'` (it fires at `testing`).
11. **The dossier** shows a drifted axis with the "since joining" mark, and the `since_joining` provider learns the practice and expect drift (it ignored them).
12. **Names:** the mood reader is `mannerMoodOf` (`moodOf` exists in `moments/live.ts`); a failed run is `state.lastExpedition.outcome === 'failed'` on that day; `profile_import`'s practice section is validated by hand in `validatePractice` (there is no zod schema), so the new fields go there and into `PracticePatch`.

## Open decisions (author)

- ~~The words of the axes' ends and of `drawnBy`~~ (decided, §1, §2); the `up` / `down` words of the six development rows (`AUTHOR TO WRITE`).
- ~~Each style's place on the axes~~ (decided, §7).
- ~~The TUNING table~~ (approved, 2026-11-24).
- ~~The `mood` of each `lifeEvents` row~~ (decided, §4).

## Implemented as

Seven chunks: (m1) the profile fields, the reader and the helper, the import and its budget, the dossier; (m2) the practice readers and what draws her; (m3) the physics numbers and the instruments; (m4) the two faces and her quirks; (m5) the mood of the day; (m6) drift, what draws her drifting and the turn of her style, `styleOf` everywhere; (m7) the `regal` way in (§12) and closing. Automated tests at the end: **764 files, 11716 tests, all passing** (the baseline before chunk m7 was 762 files and 11671 tests). The planning rulings (below) are binding where this section does not say otherwise. Where the code differs from the draft above, the code wins.

### Where it lives

- **The profile** (`src/engine/dynamic/types.ts`, `profile.ts`): `Practice` gains `manner`, `drawnBy`, `everyday`, `contrast` and `quirks`; they are validated by hand in `validatePractice` (there is no zod schema) and locked per field (`manner`, `drawnBy`, `everyday`, `quirks`). `practiceStyles[].manner` is the hidden place of each style (−3…+3); the registry reading says it in words only (`placeWords`).
- **The reader and the helper** (`src/engine/dynamic/manner.ts`, `src/engine/bend.ts`): `mannerOf(state, reg, unitId)` gives `{ axes, drawnBy, mood }` (stored + drift overlay + mood, each axis clamped to ±2) or `null` without a stored `manner` (the gate of the whole package). `bend(base, step, kind)` (a leaf, so the physics layer can use it) is a `scale`, a `shift` or a `gate`; at a step of 0 it returns the base (a gate: 0). `bendBy` is `bend` with her step. `bendRow(row, manner, kinds)` bends a style row of an instrument by the kind of each field (`time` and `lead` by `tempo`, `jitter` and `feint` by `order`, `magnitude` by `intensity`, `patience` and `rests` by `warmth`, `lines` and `linegap` by `voice`; the table is `TUNING.manner.instrument`); it is re-exported by `src/ui/scene/instruments/kit/bendRow.ts`, wired once per instrument and declared in that instrument's `fidelity.json` with its reason.
- **The physics layer** takes her axes through `registerPhysicsManner` / `physicsMannerOf` (`physics/style.ts`), installed by the dynamic's hooks; it imports nothing of the dynamic. The opening width, the segment length (the content's `segmentSeconds`), the counted and the spoken cues, the seal step, the pressure step, what she holds the commander until and the jaw's orders read it. The counted share of cues is a hash of the run, never a draw.
- **Direction of the axes:** `tempo` + is quicker, so the time-like kinds (windows, warning leads, segment lengths) are *shorter* at +; `order` + is steadier (less jitter and fewer feints); `intensity` + is larger; `warmth` + is more patience and more rests. One step of a scale is `TUNING.manner.scale` (0.15).
- **The practices** (`practice/*`) read her axes through `bendBy`: severity, ceremony, the sealed and no-duration shares, forgetting to let go, permission, the posture and slap windows, the slap's softer favour and second slap. What draws her gives a small favour (`addFavour`, +1 main, +0.5 second) at the sites of ruling 7. `dynamic.practised` and `dynamic.mannerRun` are written only for a holder with a `manner` (`dynamic/drawn.ts`); `curiosity` turns a hashed share of requests into a filter on the seed pool (`pickSeeds`).
- **The faces** (`dynamic/face.ts`): `faceNow(state, reg, unitId, present)` is `dynamic`, `dynamic_to_commander`, `everyday` or `mask`, derived from who is present and whether they know (ruling 2), never stored. The holder directive and the probe and offer lines follow it; the face rule applies to every holder, with or without a `manner` (it is the fix). The contrast (`contrast`) scales P15's gossip chance, capped at 0.9.
- **The quirks** (`dynamic/quirks.ts`): `quirksDue` (by `switch`, `during`, `address`, `after`), the `dynamic:quirk:<unitId>` line worded "if it fits, once" and gone once voiced, the model-reportable `quirk_voiced`, and `dynamic.quirkScene` (per scene: what was voiced and whether a run was seen; the controller notes a run once through `dynamic/quirk_sync`).
- **The mood** (`mannerMoodOf`): a moody woman's hashed −1 / 0 / +1 on `intensity`, `warmth` and `tempo` (`dynamicRoll`, never a draw), the `mood` of each life event of the day (`lifeEvents[].mood`, 44 rows marked) and a failed run that day; the sum is clamped in `mannerOf`. It is a small whole number per axis, so it cannot be a numeric sentinel; the holder directive says it as one clause and `tests/dynamic/mood.test.ts` keeps its no-digit test.
- **Drift** (`dynamic/mannerFeed.ts`, `development/mannerDrift.ts`): the P14b axis kind `manner` (eight `developmentAxes` rows: six axes, `manner:drawn_by`, `manner:turn`). The dynamic feeds her accumulators itself (push table `TUNING.manner.push`: yields, respected refusals, care, first practices, her days, Regard, forms); the engine proposes each step (28 days from `playSince` and from the axis' last step), the weekly review words or declines it and `fallbackReview` applies it as proposed. A step is an overlay in `development.practice` (UNDO reverts it with the day of the step); the moment is quiet. `manner:drawn_by` swaps through the second place, never replacing the first directly, at most once in 28 days.
- **The turn** (`manner:turn`, `styleOf`): her absolute place (the style's place plus her axes) nearer another style by the margin (2) for two reviews in a row, 56 days from `playSince` or her last turn. The new style becomes her primary and the former one her secondary when she had none or the new primary was it or it is nearer; her axes are rebased in the overlay so her place does not jump. `styleOf` folds the overlay; every raw read of `bond.practice.style` outside the profile goes through it (a grep-guard test pins it). Nothing of her manner moves while a run of hers (a practice, a physics, a moment) is open: the style moves at the review's day step and is read fresh by the next run.
- **The dossier** (`ui/dynamic/profileBlocks.ts`): IN THE DYNAMIC (six axes as five steps with their words, none at 0; what draws her; her quirks) and EVERYDAY (her line) with the contrast as a word, each with its lock. A drifted axis and a turned style carry the since-joining mark (`data-since-joining`, `.alius-since-joining`); the imported step or style stays the pressed one, which is what editing writes. The `since_joining` block and provider tell the drift of her manner, practice and expectations.
- **Import:** the practice section of `profile_import` asks for `manner`, `drawnBy`, `everyday`, `contrast` and `quirks`; a text that gives the commander a pronoun is dropped whole at import and at edit. The section extras are settings (`budgets.profile_import_practice` 600, `budgets.profile_import_expectations` 400; SYS › Output budgets).
- **Probing by manner (§12)** (`dynamic/probeNeeds.ts`, `probes.ts`, `regalEntry.ts`): see the rulings as built below.

### Rulings as built (chunk m7, §12)

- **`needs`.** A probe row's `needs` is a list of alternatives (`styles`, `drawnBy`, `manner` bounds, `likes`); inside one every field holds. `probePlaces` gives 0 when she has no `manner` or nothing holds, 2 when an alternative that names `styles` holds, 1 for any other. `probePool` (shared by the live probe, `pickAxis`, and the head start's `axisOf`) lists the rows of the band's tier with their places and leaves out the last few she used (both places together). A woman with no `manner`, or matching nothing, gets the rows that have no `needs`, in registry order: the old pool, proven over 200 seeds in three cases against picks recorded before the change (`tests/fixtures/probeAxisOldPicks.json`). `manner` bounds read what she has become (`mannerOf` with no day), never the mood of the day; `styles` read through `styleOf`.
- **The seven rows** (the new rows are at the end of `probeAxes.json`; every text is `AUTHOR TO WRITE`): `admiration` (tier 2; `styles: [regal]`, or `drawnBy: [power]` with `warmth` in −2…0), `deference` (1; `regal`, `ritual`, `possessive`), `credit` (1; `regal`, `drill`), `gaze` (2; `regal`, `playful`), `corrected_praise` (1; `regal`), `feet_in_lap` (2; `likes: { "worship.feet": "enjoys" }`), `hypothetical` (1; `regal`, `playful`, or `curiosity` in 1…2). `likes` keys are a practice category (read through `practiceOf`) or `worship.<targetId>` (read through `expectationsOf`, ruling 9, so a closed category reads as nothing); `refs.ts` checks both. Each new row has a head start moment (`probe_<axis>`), because the one-per-axis test requires one; the head start picks a moment only among the axes she really probed, so no old pick moved.
- **`hypothetical_answered { unitId, answer }`.** A model-reportable dynamic type (a row of zeros, with a journal phrase), offered only while the scene's one probe is the `hypothetical` (`DynamicOffer.hypothetical`). The model reports the paraphrase in `summary` (at most `TUNING.dynamic.intents.answerMax` = 80 characters; the commander's own sentence never goes in; a paraphrase that gives the commander a pronoun drops the event). It is applied while her hypothetical is pending, or was closed earlier in the same batch by `probe_answered` (`hypotheticalOpen`). A `memoryRules` entry (`dynamic_hypothetical`: audience her, about her, no spread, importance 1) and the resolver write her fact ("you said you would"); the text of the rule is `AUTHOR TO WRITE`.
- **The joke milestone** (`joke_turned_earnest`): `equal → play`, offer `scene`, hold band `testing`, `requires: { styles: ["regal"], manner: true }`, placed before `first_yes`. The new `requires.manner` is the package's gate: a regal woman from before P15b keeps `first_yes`. A refused one cools down like any milestone and `first_yes` can open meanwhile.
- **`first_below`.** A P15a moment source (`scope: 'any'`, `external`; options *let it last* / *thank her* / *tease* as `yielded` / `deflected` / `returned`; no `remember`), live through `registerMomentTrigger` (`regalEntry.firstBelowLive`) for a woman with a `manner` who is in the equal frame inside the `testing` band (`TUNING.manner.regal.firstBelowBand`) and for whom some probe row takes places (`matchesProbeRow`). Once per pair: an after-action on `moment_fired` writes `dynamic.firstBelow` (ruling 10).
- **Being admired.** The praises are counted by a small record, not read from the relation history (which trims in a chatty scene and stores no actor): `dynamic.noted.praised[unitId]` holds the days of the commander's `praised` events that landed on a woman with a `manner`, those of the last 14 days (`TUNING.manner.regal.praiseDays`), at most 5. Three of them are a cause in `latentCause` for a woman a row that carries `wakesOnPraise` (`admiration`) takes places for. Nothing is written for a woman with no `manner`.

### Deviations from the draft

- **Probe rows and the moments around them.** The seven rows needed seven head start moments, a milestone field (`requires.manner`) and a row field (`wakesOnPraise`) that the draft did not name; the probe-row logic moved out of `probes.ts` into `probeNeeds.ts` so `regalEntry.ts` and `probes.ts` do not import each other.
- **The mood** is `mannerMoodOf` (`moodOf` exists in `moments/live.ts`), folded by `mannerOf`; a failed run is `state.lastExpedition.outcome === 'failed'` on that day.
- **`bendRow` and `bend` live in `src/engine/bend.ts`**, a leaf, not in the UI; the physics layer reads her axes through a registered reader (`registerPhysicsManner`) rather than importing the dynamic.
- **The feed** is its own module with its own events and drafts (`mannerFeed.ts`: pushes only for a holder with a `manner`, a dynamic, development on and the field unlocked); P14b's rules are not used. The review proposes nothing: the engine proposes, the model words.
- **Manner steps wait while a run of hers is open** (a practice, a physics or a moment); a turn moves nothing in that run.
- **The probe pick** reads her `manner` through `mannerOf({ squad })`, so the day's mood never moves the pool.
- **`since joining`** learns the practice and expectation drift (it ignored them); P14b had no mark class in the UI, so the mark is new.

### Non-obvious things to know

- A holder with no `bond.practice.manner` keeps every number, line and draw she had; the face rule of §6 is the one exception. `tests/dynamic/unaffected.test.ts`, `tests/practice/unaffected.test.ts`, `tests/blocking/unaffected.test.ts` and `tests/sim/practiceLongRun.test.ts` did not move at any chunk. No new rng draw anywhere: chances are `dynamicRoll` / `practiceRoll` / `fnv1a` of a stable key.
- Read styles through `styleOf` / `practiceOf` and her axes through `mannerOf` (`tests/engine/dynamic/` guards the raw reads; a line that must stay raw carries `// P14b: raw profile`). Read probe needs, milestone requirements and moment sources by field, never by id (the exceptions are data the spec names: the `hypothetical` axis for its answer event, `worship.feet` in a row's `likes`, the `testing` band in `TUNING.manner.regal`).
- Hidden: the accumulators, the mood as a number, the distance to a turn and whether one is due, which quirks are offered or voiced, the styles' places on the axes, the praise record, `dynamic.firstBelow`. Shown: her axes (as words), `drawnBy`, the two faces, the quirks, the contrast word. `tests/fixtures/analyze/hidden.ts` carries the accumulators (2.71, 1.83, 1.57) and texts as sentinels, and `tests/analysis/hidden.test.ts` checks that none of the hidden bookkeeping (accumulators, turn, steps, practised, quirk state) changes a reading at all.
- `registerEventLanded(notePraise)` and `registerAfterAction(noteFirstBelow)` are in `actions/dynamic.ts`; the moment trigger is registered in `dynamic/hooks.ts`.
- A new probe row with `needs` also needs its head start moment (the one-per-axis test).

### Open items

- Every text is a draft (`AUTHOR TO WRITE`): the seven rows, their moments, the joke milestone, the `first_below` source, the `dynamic_hypothetical` rule and the development rows' `up` / `down` words. Every number of `TUNING.manner` is `AUTHOR TO TUNE`.
- A swipe that takes a `first_below` moment back leaves `dynamic.firstBelow` set: the moment is consumed.
- `first_below` changes nothing on screen until P17c's camera "from below" exists.
- Nothing yet reads her fact of the commander's answer to the what-if except the prompt's memory; P16b / P17g may use it.
- The probe pool reads `worship.feet` by id in data (ruling 9); a second worship-led row would add its own key.
- A manual test: `docs/MANUAL_TEST_P15b.md`.

## Interfaces already provided by P15 (implemented — use, do not rebuild)

`practiceOf`, `styleOf`, `leadingStyle`, `surfaceHolds` (`src/engine/dynamic/{profile,style}.ts`); `validatePractice`, `keepLockedPractice`, `mergePractice`, `PRACTICE_LOCK_FIELDS`; `dynamicHash` (`dynamic/state.ts`), `dynamicRoll` (`dynamic/witness.ts`); frames (`FRAMES`; `frameRank` in `src/engine/blocking/state.ts`); the squad's knowledge (`dynamic/knowledge.ts`: `suspects_close`, `suspects_dynamic`, `knows_dynamic`); `holderDirective` / `styleLine` (`src/dynamic/directives.ts`); the PRACTICE block (`src/ui/dynamic/profileBlocks.ts`); `Knowledge.dynamic`; `practiceStyles` rows (`surfacesWhen`, `point`, Regard fields).

## Interfaces already provided by P16 (implemented — use, do not rebuild)

`severityOf` and the style table of `TUNING.practice.severity`, `ceremonyOf`, `sealedShare`, `noDurationShare`, `rollSealed`, `forgotChance`, the permission answer (`denial.ts`), `postureWindowMs`, `wishedPresence` and the verdicts (`service.ts`), `slapWindowMs` / `slapFeints` / `answerSlap` (`slap.ts`), `practiceRoll`, `practice_generate` and its brief.

## Interfaces already provided by P15a (implemented — use, do not rebuild)

`TUNING.physics.style` (window, false and no-cue shares, cues, seal, skill), `planSegment` / `resolveSegment` (`physics/segment.ts`), `registerPhysicsStyle` (`physics/style.ts`), the cue pool (`physics.cues`), `holdsUntil`.

## Interfaces already provided by P14b (implemented — use, do not rebuild)

`developmentAxes` (axis kinds; add `manner`), `developmentRules` (accumulators), the weekly review and `validateReview` (`development/review.ts`), development moments and their one-time directive, `axisForbidden`, the "since joining" marks.

## Interfaces already provided by P14c (implemented — use, do not rebuild)

`temperamentOf` (`volatility`), `lifeEvents` and `life_event` (add the optional `mood` field), the prompt-hygiene pattern for offered lines (`intent_extract` offer lists, a `…_voiced` report).

## Interfaces already provided by P10e (implemented — use, do not rebuild)

The mini-game instruments of chunk (e) (once ported) read her style from the engine's tables; P15b bends those tables through `bend`, so the instruments need no change of their own beyond reading the bent numbers.
