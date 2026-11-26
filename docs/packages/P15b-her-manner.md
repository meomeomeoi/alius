# P15b — Her Manner: the Axes over the Style, Her Quirks, the Two Faces, Slow Drift

**Status: spec.** Release 0.2 (post-release), after P10e **including the port of chunk (e)** (the mini-game instruments), before P16b. **Depends on:** P15 (the dynamic: the practice profile, the style pair, frames, the squad's knowledge, the holder directive), P16 (practices, punishments, the slap, holds), P15a (physics, cues, the moment frames), P14b (development axes, accumulators, the weekly review, development moments), P14c (temperament, her days, `life_event`), P9d (bond, publicity), P10e (the mini-game instruments of chunk (e), which read her style), P14 (generation sites), P7a (analysis), P3b (memory). **Read:** overview; P15 (**Implemented as**, R6, R10, R18); P16 (**Implemented as**); P14b (**Implemented as**); P14c (**Implemented as**); `docs/prototypes/README.md`; this file; `docs/content/lore.md` (§0).

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

## Open decisions (author)

- ~~The words of the axes' ends and of `drawnBy`~~ (decided, §1, §2); the `up` / `down` words of the six development rows (`AUTHOR TO WRITE`).
- ~~Each style's place on the axes~~ (decided, §7).
- ~~The TUNING table~~ (approved, 2026-11-24).
- ~~The `mood` of each `lifeEvents` row~~ (decided, §4).

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
