# P16b — Service as a Craft: the Commander's Disciplines, Postures, Mini-games, Training

**Status: implemented** (plan `docs/plans/2026-11-27-p16b-service-craft.md`, eight chunks c1–c8 and three prototype gates G1–G3; **Implemented as** below; the **Rulings of the planning session** below the spec are binding where **Implemented as** does not say otherwise; manual test `docs/MANUAL_TEST_P16b.md`). Release 0.2 (post-release), after P16. **Depends on:** P15a (blocking, moments, physics and its 2026-11-20 revision §16), P15 (the dynamic, §16: Regard, motives, styles), P16 (practices and its revision §R), P14c (temperament), P14b (counters, habits), P7 (body stats, statuses, non-body routes), P2 (activities, the training slot), P9c (sparring), P10 (hub, whereabouts), P10b (handwriting, notes), P14, P7a. **Read:** overview; P15a; P15; P16; this file; `docs/content/blocking.md` §7 (postures); `docs/content/lore.md` (§0).

**Analysis tool (P7a):** every new stat, chip, option and card carries `data-analyze`; skills are shown as descriptors, never numbers (raw values only with "show raw values"); live values through `Knowledge`. **P14:** every generation registers a site. **Lore §0:** no pronoun for the commander in any text.

Origin: the 2026-11-20 design session. Service, endurance and ritual become the **third pillar** next to conversation and combat for players who enable the dynamic: it has to be hard, varied and learnable, because the player mostly accepts and the effort must live in the doing.

## Goal

- The player **learns together with the commander**: real difficulty, growth on both sides, failures that teach.
- A set of **disciplines** the commander masters, used by every physics, posture, punishment and stimulus.
- **Postures** from several points that drift, with tags of meaning and humiliation, mastered one by one.
- A wider set of **mini-games** on P15a's interaction types.
- **Training** at the base, **records** in fiction time, the day of her feet, her foot language, the sparring hold, unasked care, and the programmes of the `drill`, `regal` and `vindictive` holders.

## 1. The player learns with the commander

Author rulings:
1. **Two layers of skill.** The commander's skill (a number in the game) widens capacity and time (a gauge lasts longer, a posture drifts slower, windows of tolerance are wider). The player's skill is the execution (catching windows, holding a cursor, typing under load). The game never substitutes one for the other.
2. **No secret easing** (overview P10): the game does not help after failures. Easing exists only openly: switching an interaction type off in SYS › Scene.
3. **A failure is content, not a wall:** a slip brings her reaction, her discipline, a record; the scene goes on.
4. **Difficulty grows with skill**, at a speed set by her style (her skills, P15a §16.10; her modifiers below).
5. **Load is added one layer at a time** by her escalation along the track levels: one hold → a hold and her provocation → a hold, typing and her provocation → a hold, a speech rule, jolts and drift. A **visitor** is not a layer: someone may walk in at any time; it is an extra challenge.
6. **She does not let the commander settle in:** when the player starts coping (three clean holds of a kind in a row), she adds a modifier her style likes: the count (P16 §R.2), no duration (§R.9), a speech rule, a combined physics (P15a §16.6), a new posture. A witness is almost never her own modifier (inviting someone just for that is rare).
7. **She explains, or not:** after a slip her verdict may name what failed ("hands", "three windows", "you looked up"), with a willingness by style: `drill`, `ritual`, `clinical` explain; `cold` sometimes; `playful` as a joke; `cruel` never.
8. **The base is the training ground** (§5): a place to learn without her verdict.

## 2. The commander's disciplines

`Commander.craft: { [discipline]: { xp, level: 0..5, lastDay } }`:

| Discipline | Used by | Notes |
|---|---|---|
| `endurance:<physics>` | each P15a physics (breath, weight, saturation, `tongue_work`, `jaw`, `gulp`) | the P15a §9.3 skill, per physics |
| `stillness` | noise (P15a §16.5), stillness under provocation, real stillness (P17c) | quieter slips |
| `posture` | posture drift (§7) | plus per-posture mastery |
| `rhythm` | timing inputs, counting aloud, tempo | plus her personal rhythm per pair |
| `memory` | order from memory, her routine, her foot language | plus per-pair knowledge |
| `composure` | P17 Strain, the slap QTE's stillness, reading her under load | |
| `speech` | litany, dictation, typing under jolts | |
| `pain` | physical discipline (P16 §R.2) | P7 `endurance` adds |
| `depth` | the `depth` physics (P15a §16.17) | the reflex threshold; trained alone at the base with her `strap` or under her eye; `drill` sets norms in fiction seconds; only with `strap` or `her_anatomy` and `explicit_scenes` |

Plus the **stimulus body layer** (tolerance and reflex per stimulus kind) of P15a §16.8, which grows by exposure rather than xp.

- **Per pair** (`Relation.mastery`, extended from P15 §15.10): per worship target, per posture, her rhythm pattern, her foot language, her routine.
- **Decay:** a discipline unused for 21 days loses one level-step of xp, never below level 1; per-pair knowledge fades slower (42 days).
- **Non-body route** (overview P10): body stats (P7) add to `endurance:*`, `posture` and `pain`; practice is the explicit second route, so a frail commander can become good at this by working, never by a hidden bonus.
- Shown as descriptors in the CMDR file's **CRAFT** section (draft: *untrained, raw, practised, steady, seasoned, masterful*).

## 3. Lesson xp

A slip gives no xp by itself. A slip **followed by her discipline or her explanation** gives half the xp a clean success would (event `lesson`): the commander learned something. Her explanation (§1.7) also names the point, so the player learns too.

## 4. Records in fiction time

- Each physics converts beats into **fiction time** (`TUNING.craft.beatSeconds`: weight 20 s a beat, breath 3 s, posture 30 s, …); skill stretches the fiction time a beat stands for, not the number of windows. An hour as her footrest does not take an hour of play (P15a §16.3).
- Records per pair and per physics or posture: the longest hold, the longest without a slip, the longest without a tap. Stored on the pair; shown in her hand as margin notes in the CMDR file ("Day 12 — three minutes under my weight." … "Day 90 — forty minutes, no taps."). The progression itself tells who the commander became.
- She brings records up, asks to beat them; `drill` sets them as norms (§11).

## 5. Training at the base

The activity `train` gains **service drills** (P2 `activities` focus options; a slot each):

| Drill | Discipline | Place |
|---|---|---|
| breath drill | `endurance:breath` | training yard, quarters |
| weight drill (a loaded pack) | `endurance:weight` | training yard |
| posture drill | `posture` (a chosen preset) | quarters, training yard |
| stillness drill | `stillness` | quarters |
| recitation | `speech` | quarters |
| depth drill | `depth` | quarters (gated as the discipline) |
| rhythm drill | `rhythm` | anywhere |

- The drills play the **same mini-games** as the scenes, without her verdict.
- **Alone:** base xp. **With her:** ×1.5, she judges (a verdict, favour, Regard by style). **With another woman:** ×1.2; a holder who learns of it reacts by her profile (jealousy for `possessive`), and squad suspicion grows (P15 §15.13: being seen together).
- Full xp once a day per discipline; the slot is spent (the honest price in free time).

## 6. Mini-games

All built on P15a's interaction types; each can be switched off (SYS › Scene). Existing: timing (breath), hold (weight), decision (saturation), order (`tongue_work`), passive (her activity), gesture (`jaw`), timing of swallows (`gulp`). P15a §16 adds the deep inhale and tempo of kisses; P16 §R adds strokes and the slap QTE. This package adds:

1. **Stillness under provocation.** She touches, tickles, whispers; any key press during a stimulus is a reaction (a slip). No timing: restraint. How sensitive the commander is to tickling is an optional COMMANDER FILE detail (`ticklish`, P7-like; no mechanical value beyond this game's stimulus strength).
2. **Tempo.** Massage, foot care, licking: keep her tempo; whether it is right shows only in her tells (her expectation profile's "how": pressure, pace).
3. **Balance.** Holding her thing or a tray (the "function" step of objectification, P17b §2), a load on the back or the head: keep a marker centred while she pulls and pushes.
4. **Order from memory.** She lists her morning routine once; later the commander repeats it in order (her expectation profile and her routine on the pair).
5. **The gaze.** The gaze rule (P17c) as an active game: the cursor is the gaze; keep it below her line while she provokes ("look at me" is a trap or not).
6. **Patience.** Nothing happens; the task is not to press "call her" (P15a `time` / `her_absence` sources); the fiction time grows (P16 §R.9).
7. **The edge** (`denial` only). A bar rises with her actions; keep it under a line with breath and focus inputs while she pushes it.
8. **Reading her.** Choose the next act from her tells alone, no hints (P15 §15.8).

## 7. Postures

The vocabulary (points, states, tags, modifiers and the 48 presets) is `docs/content/blocking.md` §7. Mechanics:

- **Points:** torso, hips, knees, arms, head, gaze, and (optional) feet. Each has a few discrete states. A preset fixes target states for the points it uses; the rest are free. **Only presets exist** (no free composition: nothing strange can come out); her named postures (P16 depth revision) are presets with her own name and, within the preset's `variants`, one or two points she may set (palms up or down, gaze down or closed).
- **Drift.** Unless corrected, a point slides away from its target (`drift` rate per point per preset, faster with fatigue of the day, a load, her weight, a hard floor; slower with `posture` skill, per-posture mastery and P7 body stats). Past the threshold it is a slip. **The gaze drifts by temptation, not fatigue:** each event in the scene (a visitor, her undressing, a sound behind) gives a short impulse to look up that has to be held.
- **Input:** a click on the point on the commander's **schematic**, or keys 1–7 per point. The schematic is a neutral body figure on the PDA in the style of P15 §15.9's corporate body map (the commander has no sprite; the commander sees the commander's own body as a medical diagram). Drift shows as the point's offset and colour.
- **Corrections make noise** (P15a §16.5) and may be seen as fidgeting if she watches (P15a §16.4); small early corrections are better than a sharp one at the threshold.
- **Blind:** under a blindfold or a hood the schematic is hidden; the commander feels the points only through touch lines ("the arms are going numb", "the knees slide") and corrects by feel.
- **No long sequences** of postures (author ruling): the craft is holding different postures for long, as the situation and her wish demand. No inspection walk-around (the commander has no sprite).
- **Mastery per posture:** a learned posture is taken faster (her named-posture timer, P16) and drifts slower; unused, it fades (§2 decay).
- **Tags** (meaning, base humiliation, content tags, requires, supports, signal, noise) are read by type: humiliation feeds Regard (P15 §16.3) and suspicion; meanings make postures a language under a gag (P17c gestures: a request, an apology, "ready").

## 8. Her feet

- **The day of her feet** (derived, nothing stored beyond her activities): boots on all day (her duty slots, a run) → tired, hot, damp; barefoot in her quarters; after the shower; after a run → sore, a blister, a callus. Her scent and sweat follow P17d.
- **Care as a craft:** unlacing and taking the boots off (an order step), massage (tempo), cleaning (`tongue_work`), drying, nails, cream; each step judged against her expectation profile. The quality of the care moves her combat form for the next run (P15 §15.5, ±3 %: sore and neglected vs cared for).
- **Her foot language.** Registry `footSignals` (`AUTHOR TO WRITE`): two taps, a push away, a lifted sole, a pointing toe, a stamp, a hooked foot, a nudge. Each holder uses 4–6 with **her own meanings** (`fnv1a` per unit over the registry's meaning pool: "kneel", "go", "kiss", "closer", "still", "look at me", "enough"). She names a signal the first time, later only gives it; misreading it is a slip; knowing it is per-pair `memory` mastery. The P15a `nudge_with_foot` escalation reads it.
- **Her foot on the commander's palms:** the contact `on_hands` (blocking, `docs/content/blocking.md` §3) while the commander holds `kneel_present`: occasional, by style, a member of the family of `foot_on_head`, `standing_on`, `boot_on_chest`.

## 9. Armpits

- **The sparring hold.** Losing a P9c sparring bout to a partner whose profile fits can end in a headlock into her armpit (P17b depth revision). It plays: escape (timing against her grip, the commander's P7 strength and `stillness`; a tap is always available) or tap out; the hold runs P15a `saturation` phases; the squad watches when present. Against her hold the commander's skill grows.
- **Hints** are P17d rev. 2026-11-20 (`hintStyle`).
- **A night under her arm.** A P17a night claim variant: the commander sleeps with the head under her arm; a `saturation` marathon through the night (P15a §16.3), the stimulus stages (P15a §16.8), a wake-up card.

## 10. Unasked care and free slots

- **Practices cost free slots** (author ruling: fair). A hold, a drill, a care session each spend the slot they take; P15 hold, P16 favour and P15 Regard are where the slot is repaid.
- **Unasked care:** a free slot spent on her without her asking (cleaning her boots, tidying her quarters, preparing her gear, mending, learning her body map by asking others): a service activity (P15a §4) with `presence: unnoticed`. Whether she notices is a hashed roll on her perceptiveness and the activity's visibility. **Noticed:** a moment "I saw what you did while I was out" (by style: warmth, amusement, a note in her hand), favour +, motive `her` +, Regard by style. **Unnoticed:** it stays only in the commander's record. Anticipation in her presence is P16 §R.5.
- **She names the service before the commander does** (from the 2026-11-26 session, moved here from P15b §12 because it needs this count): at the fourth noticed unasked care in 7 days by a woman still on `testing` (a `regal` woman, or `curiosity ≥ +1`), a directive offers her line once ("fourth time this week you've brought me coffee. Did I ask?"; `AUTHOR TO WRITE`), triggered and gone once voiced (P14c §0). Nothing new is stored; no memory rule (a line, not an event).

## 11. The programmes of the new styles

- **`drill` — norms and exams.** Daily norms per discipline she cares for (minutes in a posture, as a footrest, on air); a weekly **exam** before her: pass or fail. Failing adds drills on the commander's free slots (she books them, P9c); passing raises the norm. Her verdicts are lessons (§3). A long arc where the mini-games become a curriculum.
- **`regal` — audiences and praise.** She receives soldiers in her quarters sitting in her chair as on a throne; the commander kneels beside it and announces who enters; when she enters the mess, a kiss of her hand or foot (P15 §16.5 publicity applies). **Praise:** each day a line of praise in the commander's own words; she rejects repeats (a local similarity check against earlier praises, no model); a missed or repeated praise is a slip.
- **`vindictive` — the sentence.** She has read the commander's file (`knows_crime`); punishments echo the crime (`liquidation`: give up something of the commander's own to her — a privilege, a bond; `smuggling`: every message passes through her; `experimentation`: she runs experiments on the commander; `purge`, `mutiny`, `strain_trade`: `AUTHOR TO WRITE`). The sentence has a **term** in days, served or extended; Regard rises slowly as it is served with dignity (P15 §16.3).

## 12. UI

- **CMDR › CRAFT:** disciplines as descriptors, per-pair knowledge (her rhythm, her foot language, postures known), records in her hand.
- **The schematic** during holds (hidden under a blindfold); the fiction clock of a marathon.
- **Training** options in the `train` activity; `drill`'s norms and exam on HOME in her hand; `regal`'s praise input; `vindictive`'s term in the DYNAMIC section.
- Every element `data-analyze`.

## 13. Directives, intents, events, actions

- Directives (`craft:`-prefixed, derived): the posture she expects and its rules, the norm of the day (`drill`), the term (`vindictive`), the record she wants beaten. No pronoun for the commander.
- Intents: `praise_given` (the text is compared locally; the extractor only marks that praise was given), `foot_signal_answered`, `care_noticed` (the model may report that she noticed in a scene).
- Events: `craft_xp`, `craft_level`, `lesson`, `record_set`, `posture_taken`, `posture_slip`, `drill_done`, `exam_passed`, `exam_failed`, `care_unasked`, `care_noticed`, `foot_signal_given`, `foot_signal_missed`, `praise_missed`, `sentence_extended`.
- Actions: `craft/train { discipline, partnerId? }`, `posture/correct { point }`, `posture/take { postureId }`, `craft/praise { text }`, `care/unasked { activityId }`.

## 14. Memory check (CLAUDE.md rule)

- `record_set` → a `memoryRules` entry (audience: the pair; importance low; she may bring it up); `exam_failed` / `exam_passed` → one entry each (audience: the pair).
- `care_noticed` → a `memoryRules` entry (audience: her; importance mid); `care_unasked` unnoticed → bookkeeping (the commander's record only).
- `lesson`, xp, levels, slips, drift, foot signals: bookkeeping (slips feed her discipline, which writes its own facts).
- `sentence_extended` → a `memoryRules` entry (audience: the pair).
- Journal: none of these are relation events with deltas except `care_noticed` (`eventDeltas[].journal`). Chronicle: none. Prompt: the `craft:` directives are triggered (P14c §0).

## TUNING draft (2026-11-20)

| what | value |
|---|---|
| discipline levels | xp thresholds 30 / 80 / 150 / 250 / 400 (as P15a endurance) |
| xp | a hold endured +10; a clean phase +3; a posture held to her release +5; a lesson half of the success; a drill +15 (×1.5 with her, ×1.2 with another) |
| decay | 21 days unused: −1 level-step of xp, floor level 1; per-pair knowledge 42 days |
| capacity per level | +10 % gauge capacity; posture drift −8 % per level; noise −10 % per `stillness` level |
| drift (points per 10 s, base) | arms raised 12, arms behind head 9, arms out 10, torso 4, hips 5, knees 3, head 4, feet on toes 10; × fatigue (1 + 0.1 per hold earlier the same day), × load 1.3, × hard floor 1.2 |
| gaze temptation | an impulse of 30 per event; a visitor 50 |
| beat in fiction time | weight 20 s, breath 3 s, saturation 10 s, posture 30 s, `tongue_work` 15 s; × (1 + 0.25 per level) |
| unasked care noticed | perceptiveness × visibility: unnoticed activity 0.3, felt 0.7 |
| her settling-in modifier | after 3 clean holds of a kind in a row |
| `drill` exam | weekly; pass at 80 % of the norm; the norm +10 % per pass |
| `regal` praise | daily; similarity > 0.7 to any earlier praise = a repeat |
| `vindictive` term | 7–30 days by the crime; +3 per slip |

## Acceptance criteria

1. Without an eligible holder at frame ≥ `play`, nothing here runs except the commander's craft view (empty); seeded tests stay byte-identical (no rng draw: chances are `fnv1a`).
2. Disciplines grow by xp, lessons and drills, decay as specified, and are shown as descriptors; body stats add only through the declared routes.
3. Records are kept in fiction time and identical at every `marathonPace`.
4. Training drills play the same mini-games with the three partner options.
5. Each new mini-game runs, can be switched off, and maps to its discipline.
6. Postures: presets only; points drift and are corrected by click or keys; the gaze is tempted by events; corrections make noise; the schematic hides under a blindfold; mastery per posture works; tags are read by type.
7. Her feet: the day of her feet, the care steps and their effect on her combat form, her foot language per holder, `on_hands`.
8. The sparring hold and the night under her arm run on the P15a physics.
9. Unasked care is noticed by a hashed roll and handled by style.
10. The `drill`, `regal` and `vindictive` programmes work as specified.
11. Every element carries `data-analyze`; every generation goes through P14; the memory verdicts of §14 are implemented.

## Rulings of the planning session (author and controller, 2026-11-27)

The code map made before the plan (five surveys; baseline 765 files, 11730 tests) found about thirty places where the spec leans on things that do not exist or are named otherwise. Decided (author: 1–7; the rest are the controller's calls, which the author may overrule). These rulings win over the sections above.

1. **Mini-games in this package (author: A).** P16b builds the **game of postures** (points, drift, presets; the gaze is a point of it, tempted by events, so §6.5 is inside it; blind correction by feel; the posture call's schemes B and C, P10e §15) and **stillness under provocation** (§6.1, a new inner game of her activity's frame). The other six of §6 (tempo, balance, order from memory, patience, the edge, reading her), the escape from the sparring hold and the interactive strokes (P16's `implements`) go to a new package **P16c**, each with its own prototype. Every new game is a live prototype with the author first (`npm run proto`), ported with its `fidelity.json`; the engine chunks go ahead meanwhile and the port chunks wait for the approval.
2. **Every scene surface is designed in the scene's style first (author).** Not only the games: every new card, chip, moment or interactive that appears in a scene (the drill's card, the exam, the norm, the sentence, care noticed, the lesson, `[ANTICIPATE]`) gets a round in a prototype (`cards.html` or the game's own) with the author before its port, in the look of P10e (her cards in her hand and voice, the chip row, the dock, the full frame). PDA surfaces (CMDR › CRAFT, the DYNAMIC section, HOME, the room panel, SYS) follow the PDA's existing look and need no prototype.
3. **Drills (author: A).** Alone: one click, base xp, the slot is spent (today's `train` focuses, extended to every discipline that makes sense without her). **With her** (×1.5): a scene at the training yard where she runs the drill as a real hold (the real instrument, her verdict, Regard by style). **With another close woman** (×1.2): the same scene with her; a holder who learns of it reacts by her profile and the reserved sign `seen_together` gets its first producer. Only drills that have an instrument take a partner (breath, weight, posture); the others are alone only.
4. **The sparring hold (author: A).** Built now on what exists: a sparring wager won by a woman whose expectations put `armpits` at `enjoys` / `craves`, practice-live at frame ≥ `play`, ends in a short scene at the training yard with the contact `smothered_armpit` and the approved scent instrument; the tap is the way out; the squad watches when present. The escape game (timing against her grip) is P16c's.
5. **`regal` and P17g (author: A).** P16b builds the **daily praise** (a P16 protocol rule she sets at frame `role`; a repeat is caught by a local similarity check, a shared exported helper; the praise log is stored so P17g §2.1 adds weight by facts and kept lines on top), the **doubled Regard** for praise and **"she names the service"**. The kiss of her hand or foot when she enters the mess moves to **P17g** as a staged `regal` custom beside `salute` (hand in private → hand before the squad → her foot in the mess, *seen*); the **audiences** move to P17g after P17 (they need live visitors). A missed or repeated praise is a `protocol_slip`.
6. **`vindictive` (author: A, drafts approved).** The sentence has a term (7–30 days by the crime, +3 per slip); while it runs, her punishments are drawn first from the echo of the crime; served with dignity it ends in Regard (`regardDayStep`'s rise and a closing rise). The echoes: `liquidation` give her something of the commander's own (a privilege, or a booking with another woman, P9c); `smuggling` every message passes through her (P16's forced editor); `experimentation` her experiments (P16 tasks from seeds tagged `experiment`: measured holds with records); `purge` ("followed orders too well") a day of obedience to her (P9c); `mutiny` ("led a revolt") before the squad the commander answers to her first (a rule template, `protocol_public`); `strain_trade` ("sold samples") her tithe of Plyx or credits each week of the term.
7. **Unasked care (author: A).** Open toward any woman who has a dynamic block with the commander (probing or holding, `Relation.dynamic`), her profile live (`herPracticeLive`), the dynamic on. At `equal` it brings only her noticing and, with a `manner` block, "she names the service"; from `play` on, favour, the motive `her` and Regard by style. Acceptance criterion 1 is read with this exception.
8. **The endurance book stays where it is.** `endurance:<physics>` is `Commander.endurance` (read only through `commanderSkill`; the four raw reads in `activities.ts`, `physics/segment.ts`, `practice/punish.ts` and the jaw instrument move onto readers); the other disciplines are a new `Commander.craft`. The decay's day is kept in `Commander.craft` for every key, `endurance:*` included, so `Commander.endurance` keeps its shape. The level words are the spec's draft (*untrained, raw, practised, steady, seasoned, masterful*) for every discipline; they replace `ENDURANCE_WORDS`.
9. **The body route lands on `posture` and `pain` only.** Adding P7 `endurance` to the physics' gauge would move every seeded physics test; the endurance disciplines keep P15a's numbers and their practice route.
10. **Per-pair knowledge is `Relation.craft`**, not P15's `mastery` (`addMastery` drops every key that is not a worship target, and it has no day): postures known, her rhythm, her foot signals, her routine, the records, the drill norms, the praise log, the sentence, the cares. Absent until written.
11. **Fiction time is counted from beats** (`TUNING.craft.beatSeconds` × the beats a run used × (1 + 0.25 per level)), never from the wall clock, so a record is the same at every `marathonPace`; records come from `physics_outcome` (its `segments`) and `marathon_done`.
12. **`stillnessOf` and her rhythm are supplied**, and read 0 while nothing of the craft is written (byte-identical).
13. **Presets: 47.** §7.3 says 48; its table and the P10e fixture have 47. They become a new registry `servicePostures` beside the 13 bases (whose strict schema stays); a preset whose id an activity uses is renamed (`facing_wall` → `face_to_wall`). P16's named postures are re-keyed from the base to the preset; an old name on a base reads as that base's default preset (`default: true`).
14. **The schematic is the P10e posture dial** (P10e §7 is later than §7 here): the dial draws `target` and `hot`; it is hidden under `sensoryNow`; keys 1–7 act only when nothing editable has focus and the device is down; the points map onto the dial's joints (torso → shoulders, arms → elbows; feet have no joint: the prototype decides).
15. **A posture hold is a reusable run** (`startPostureHold`), so P17g's `attendance` uses it.
16. **Her foot language keeps the approved prototype's five pairs**; this package adds `foot_signal_given` / `foot_signal_missed` and her signals known per pair; kneel / go / look at me wait for a gesture (P16c).
17. **The day of her feet is derived** (a run today or yesterday, a training, `wetDay`, where she is now, a sore foot after a run by `fnv1a`); nothing is stored. Care quality comes from the verdicts of foot service and shoe service that exist, and gives ±3 % to her combat form through a second `registerCombatPassive` reader; the further care steps (massage, drying, nails, cream) come with P16c's tempo.
18. **Unasked care is an action** (`care/unasked { unitId, careId }`, one slot), not a P2 activity: the care kinds are the commander's dynamic rows of `blockingActivities` that make sense while she is out, with a new field `care: { notice }` (`presence` already means how she wants service felt). There is no perceptiveness stat: her noticing is `craftRoll` over `Unit.insight` × the row's notice. The count of 7 days lives on `Relation.craft`.
19. **Praise is given in words** in a scene or a DM: the extractor reports `praise_given` and the engine takes the commander's own words of that exchange (`said`, at most 400 characters, never sent to a model); there is no separate praise box (§12's "praise input").
20. **`[ANTICIPATE]`** is a chip of the chip row shown by her reading's axes (never `region`): it stages a commander activity that fits her pair tags, so P16's `practice_anticipated` runs, with a narrated line and a `next_reply` directive. `[PROVOKE]` and `[TEST HER]` stay with P17e.
21. **Lessons:** a slip earns half the clean xp when, in the same scene, her punishment follows or her verdict names the point; the point's word (hands, three windows, you looked up) is the engine's, and whether she names it is by style (§1.7).
22. **Intents:** a new list `CRAFT_INTENT_TYPES` (`praise_given`, `foot_signal_answered`, `care_noticed`) with an offer `craft?`, each offered only while its subject exists.
23. **Deferred to their packages, hooks kept:** the night under her arm (P17a: no night claim exists), the `depth` discipline (P17b: no `depth` physics and no `strap` / `her_anatomy` yet), the Strain side of `composure` (P17), the gaze rule as P17c's (its game is the gaze point here), P17d's scent and hygiene.
24. **`vindictive`'s `manner.intensity` is 2** (it was 3, outside ±2; `mannerOf` clamped it, so nothing moves).
25. **Her named postures (author, 2026-11-27, after G1 round 1e).** Who names postures: a holder whose style (primary or secondary, through `styleOf`) is `ritual`, `drill` or `regal`, or who holds `household_protocol` (P16 named only `ritual` and the domain). Which: when her set has room (P16's cap, her service track level + 1), she picks a preset by her taste: a preset whose `meaning` her style likes (`TUNING.craft.posture.likes`, a list of meanings per style; draft: ritual waiting, attention, offering, gratitude, apology, submission; drill attention, endurance_test, waiting; regal display, worship, object, waiting, gratitude; cruel punishment, endurance_test, object; vindictive punishment, apology, submission; playful pet, display, request; possessive rest, waiting, worship; affectionate rest, request, casual; cold object, waiting; clinical endurance_test, display; obsessive worship, rest, offering), within the content gate and her limits, with a humiliation her frame allows (`play` ≤ 2, `role` ≤ 4, `rule` 5), her manner tilting the pick (`order` ≥ +1 toward the stricter meanings of her list, `curiosity` ≥ +1 toward one unlike those she has); the pick is a hash over the registry-ordered candidates. If the commander already holds a preset that fits, she names that one (P16's way, kept). A new posture is introduced by a lesson: her first call of it shows it as a ghost and no slip counts.
26. **HER POSTURES (author).** The DYNAMIC section lists her named postures (PDA): her name in her hand, the dial's mannequin of the preset, its points with their keys and states, the commander's knowledge of it as a word, and `[ PRACTISE ]`, a posture drill alone on that preset (the slot is spent). It shows only postures she has named.

## Open decisions (author)

- Every `AUTHOR TO WRITE` text (the lesson words, her lines on care, the norm and exam lines, the sentence lines, the echoes' texts) and every `AUTHOR TO TUNE` number.
- The looks of every new scene surface (ruling 2) and of the two games (ruling 1), in their prototype rounds.

## Implemented as

Eight chunks and three prototype gates: (c1) the craft book: state, gate, decay, her settling-in count, records in fiction time, stillness and her rhythm as supplied readers, lessons, `Knowledge.craft` and CMDR › CRAFT, the directives and the controller; (c2) drills for every discipline and the partner drill as a scene; (c3) the engine of postures: the 47 presets as a registry, her named postures as presets, drift, temptation, the hold, its directive, the gate of `on_hands`, the two toggles; (c4) the day of her feet, her care in her combat form, her foot language, unasked care and "she names the service", the craft intents, `[ANTICIPATE]` (engine), the sparring hold; (c5) the programmes of `drill`, `regal` and `vindictive`, removal, help with her goal, who names postures and which (ruling 25), HER POSTURES (ruling 26); gates G1 (`posture.html`), G2 (`her_activity.html`, provocation) and G3 (`cards.html`, the craft's surfaces), each approved by the author on 2026-11-27 and written into `docs/prototypes/README.md`; (c6) the port of the game of postures and the posture call's schemes B and C; (c7) the port of stillness under provocation and the scene surfaces; (c8) closing. Automated tests: the baseline was **765 files, 11730 tests**; at the end of chunk c7, **809 files, 12261 tests, all passing**. The planning rulings above are binding where this section does not say otherwise. Where the code differs from the draft, the code wins.

### Where it lives

- **The state** (`src/engine/craft/state.ts`, a leaf: types, closed lists, `craftRoll`, `spanText`): `Commander.craft` (every discipline except the endurance of a physics, plus the decay's day of every key), `Relation.craft` (`RelationCraft`: postures, rhythm, signals, routine, records, streak, slips, lesson, drillPending, drill, praise, sentence, headlock, anticipate, footCare, cares, goalDay, partnerDay) and `practices.postureRun` / `postureDay` (`PostureRun`). All absent until something is written. `CRAFT_EVENT_TYPES` (21) is reserved in `src/content/schemas.ts`.
- **The gate and the book** (`gate.ts`, `book.ts`): `craftLive` (= `practiceLive`), `craftOn`, `craftHolders`, `careOpen`; `craftLevel`, `craftXp`, `craftCapacity`, `addCraftXp` (the one writer of a discipline's xp), `addPairXp`, `touchCraft`. `endurance:<physics>` stays `Commander.endurance` and is read only through `commanderSkill`; `src/engine/physics/skill.ts` gained `enduranceLevelOf`, `trainedToday` and `setEnduranceXp`, and the four raw reads of `Commander.endurance` use them.
- **Time and learning:** `decay.ts` (the day-end step at `director_tick`), `streak.ts` (the settling-in count), `records.ts` (fiction time, `record_set`, the xp of a clean segment; an after-action on `physics_segment`, `physics_outcome`, `marathon_done`), `lesson.ts` (`slipOf`, `lessonDue`, `noteSlips`, the `craftLessons` registry), `provocation.ts` (`provocationOpen`, `noteProvocation`), `hooks.ts` (`installCraftHooks`), `view.ts` (`craftView`, behind `Knowledge.craft`).
- **Drills:** `drills.ts` (`drillMult`, `drillXp`, `payDrill`, the activities' gate and effect) and `drillScene.ts` (the partner drill as a scene: `startDrill`, `noteDrillOutcome`). The activities layer takes them through `registerDrillHooks({ gate, effect, partner })` (`src/engine/activities.ts`); the `train` focuses `drill_stillness`, `drill_recitation`, `drill_rhythm`, `drill_posture` and the `drill` field of the three endurance focuses are data (`content/core/activities.json`).
- **Postures:** the registry `servicePostures` (47 rows), `src/engine/blocking/presets.ts` (`presetOf`, `defaultPresetOf`, `samePreset`, `commanderPresetOf`, `presetAllowed`, `presetProblem`, `presetSupports`, `blocking.commander.preset`), `craft/posture.ts` (`driftRates`, `temptations`, `startPostureHold`, `takePostureHold`, `correctPosture`, `slipPosture`, `endPosture`, `endPostureRun`, `holdOfCall`, `addPostureMastery`), `craft/herSet.ts` (`herCandidates`, `pickHerPosture`), `practice/postures.ts` (presets in her set and call, `registerPostureNamer`, `registerCallAnswered`).
- **Her feet and her care:** `feet.ts` (`feetOfDay`, `careOfFeet`, `noteServiceVerdict`, `noteFootSignal`), `care.ts` (`careKinds`, `noticesCare`, `giveCare`, `landCares`, `namesService`), `intents.ts` (`craftIntentInput`, `applyCraftIntent`, `registerPraiseOpen`, `registerPraiseGiven`), `anticipate.ts` (`anticipateShown`, `stageAnticipation`), `headlock.ts` (`offerHeadlock`, `startHeadlock`, `noteHeadlockOutcome`).
- **The programmes** (`craft/programmes/`): `drill.ts` (norms, the weekly exam, `drillDayStep`, `noteExamOutcome`), `regal.ts` (`givePraise`, `praiseDayStep`), `vindictive.ts` (`vindictiveDayStep`, `sentenceEditor`, the echoes), `slots.ts` (`hasStyle`, `freeSlot`, `bookProgramme`). `src/engine/text/similarity.ts` (a leaf: `wordsOf`, `similarityOfWords`, `similarity`), `forget.ts` (`forgetCraft`, called by `removeFromService`), `goal.ts` (`helpWithGoal`).
- **Actions** (`src/engine/actions/craft.ts`, imported after `actions/practice`): `posture/take`, `posture/correct`, `posture/slip`, `posture/end`, `craft/drill_start`, `craft/anticipate`, `craft/headlock_start`, `care/unasked`, and the day-end steps and after-actions that keep the craft in step. `physics/service` also takes `{ runId, signal: { motion, answered } }`; `intents/apply` takes `said`.
- **Hooks in the lower layers** (each is registered by the craft; a layer imports nothing of it; with none registered the layer is as it was): `registerStillness`, `registerRhythmKnown`, `registerStopHook`, `registerServiceReport` (`physics/style.ts`); `registerDrillHooks` (`activities.ts`); `registerAfterBout` (`personal/wagers.ts`); `registerPunishmentTilt`, `registerOffenceNoted` (`practice/offences.ts`); `registerPostureNamer`, `registerCallAnswered` (`practice/postures.ts`); `registerHobbyHelped` (`life/hobbies.ts`); `registerPraiseOpen`, `registerPraiseGiven` (`craft/intents.ts`, for the extractor); `registerCombatPassive` (P15's, used by `careOfFeet`); `registerForcedEditor` (P16's, used by the sentence); `registerPostureInstrument` (`src/ui/scene/instruments/host.ts`).
- **Content:** registries `servicePostures` (47), `craftLessons` (9), `craftLines` (17), `crimeEchoes` (6); a `drill` field on activity foci, a `care: { notice }` field on commander rows of `blockingActivities`, the fields `supported`, `foot` and `headlock` on `blockingContacts`, a `programme` field on `bookingKinds` (`drill_exam`, `drill_session`), `styles` / `conditions.minFrame` / `echo` on rule templates (`daily_praise`, `answer_to_me_first`), seeds tagged `experiment`, seven `memoryRules`, three `eventDeltas` rows, `cardVoice` rows (card-voice.md sections 16, 17 and 18), glossary entries.
- **The model's side** (`src/craft/`): `directives.ts` (`craft:lesson:`, `craft:record:`, `craft:posture:`, `craft:care:`, `craft:named_service:`, `craft:feet:`, `craft:anticipate:`, `craft:norm:`, `craft:sentence:`) and `controller.ts` (`createCraft`: directives follow the events, the scene and the chat; it opens the sparring hold's scene). `src/llm/calls/intentExtract.ts` carries the three craft types.
- **The UI:** `src/ui/craft/` (`craftBlock.ts`: CMDR › CRAFT; `careMenu.ts`: `[ CARE ]`; `craftCards.ts`: the drill, exam, sentence, note and lesson cards and `[ANTICIPATE]`), `src/ui/practice/herPostures.ts` (HER POSTURES) and `postureCall.ts` (the call's scheme by the commander's posture level), `src/ui/scene/instruments/posture/` (the game of postures, `fidelity.json`, `css/86-posture.css`), `src/ui/scene/instruments/activity/provocation.ts`, `src/ui/scene/instruments/cards/fidelity.json`, the dial's `target` / `hot`, the OPS tab (drills and the partner drill), HOME (her norm in her hand), the room panel and the DYNAMIC section (`[ CARE ]`, SENTENCE, HER POSTURES), SYS › Scene (the toggles and the open easing).
- **Analysis:** `Knowledge.craft(reg)` (`CraftView`), `src/analysis/providers/craft.ts`.

### Rulings as built

1. **Mini-games (ruling 1).** As ruled: the game of postures (the gaze is a point of it) and stillness under provocation are built; the other games, the escape from the hold, the interactive strokes and `ticklish` are P16c's. Each was a live prototype first and is ported with its `fidelity.json`.
2. **Scene surfaces (ruling 2).** The drill, exam, sentence, note, lesson and `[ANTICIPATE]` came through gate G3 and are drawn in the scene's language; the PDA surfaces (CMDR › CRAFT, `[ CARE ]`, SENTENCE, HER POSTURES, HOME's norm, SYS) follow the PDA's look.
3. **Drills (ruling 3).** Alone: one click, `TUNING.craft.xp.drill` once a day per key, the slot spent. With a companion: breath and weight (`drill.partner`) are a scene at the training yard when a contact of the drill can be staged for her (`drillPending`, `craft/drill_start`); the posture drill with a companion pays at once and picks one of her named postures (`drillPreset`), no scene. A holder gives ×1.5 and her verdict, another close woman ×1.2, the sign `seen_together` (its first producer) and her jealousy (`partnerDay`, read by `jealous()` in `dynamic/exchange.ts`); anyone else ×1.
4. **The sparring hold (ruling 4).** As ruled. The contact is the `blockingContacts` row with `headlock: true`; whose attitude decides is that row's `target`; the hold waits in `Relation.craft.headlock` for the day, the controller opens the scene at the yard (`scene/start`, origin `event`, the woman alone) and `craft/headlock_start` stages it; the soldiers who were at the yard lose Regard for the commander through `regardFall` with `witness` and see `protocol_public` unless they know the dynamic.
5. **`regal` (ruling 5).** The daily praise is a rule template (`daily_praise`, `check: 'praise'`, `styles: ['regal']`, `conditions.minFrame: 'role'`); a praise is the commander's own words from the exchange (`said`), compared locally with her last 30 (`similarity` over 0.7 is a repeat); a repeat or a day with no fresh one is `praise_missed` and `noteOffence('protocol_slip')`; a fresh one raises Regard (`value`, doubled for `regal` by `TUNING.regard.regal`). The kiss and the audiences are P17g's.
6. **`vindictive` (ruling 6).** As ruled, with these particulars. The term is the echo row's `days` (liquidation 21, smuggling 14, experimentation 21, purge 14, mutiny 30, strain_trade 14); each week from the day it was set the echo acts once (a week that found nothing is tried again the next day) and then `landed` is set (the model is told what the echo is only after that). By effect type: `give_up` cancels the next booking of another woman each week; `through_her` is the forced editor on DMs to another soldier; `experiment` requests a task from the seeds tagged `experiment`; `obey_day` is a P9c day of obedience; `answer_first` proposes and delivers the rule `answer_to_me_first`; `tithe` takes Plyx, else credits. an echo row's `punish` list (`give_up`: `privilege_revoked`, `obey_day`: `slot_held`, `answer_first`: `protocol_extra`) is what `registerPunishmentTilt` puts first (it answers null with no sentence); `registerOffenceNoted` adds `TUNING.craft.sentence.extend` days (3) per slip toward her. A served sentence is never set again.
7. **Unasked care (ruling 7).** `careOpen`. At `equal` only her noticing (and "she names the service" with a `manner`); from `play` on, favour, a `yielded` sample with the motive `her` and Regard.
8. **The endurance book (ruling 8).** As ruled: `ENDURANCE_WORDS` is gone, `CRAFT_WORDS` is the one scale; the decay's day of an endurance key is in `Commander.craft`.
9. **The body route (ruling 9).** `craftCapacity` adds `bodyPerPoint` (0.5) for each point of the P7 `endurance` stat above `bodyFrom` (3) to `posture` and `pain` only. Only `posture` has a reader (the drift); `pain` waits for P16c's strokes.
10. **`Relation.craft` (ruling 10).** As ruled; P15's `mastery` is not used for the craft.
11. **Fiction time (ruling 11).** `fictionSeconds(physicsId, beats, level)` = beats × `beatSeconds[physicsId]` × (1 + 0.25 × level); the posture beat is 45 s (G1, author). A turn-based segment counts its real-time beats (the physics layer's `turnBeats` is a way of playing); a marathon's record is its hours.
12. **Stillness and her rhythm (ruling 12).** Supplied through `registerStillness` (−10 % noise a level, at most 0.9) and `registerRhythmKnown` (her openings widen 5 % a level of `Relation.craft.rhythm`), both 0 with nothing written.
13. **Presets (ruling 13).** 47, as ruled; `facing_wall` is `face_to_wall`; an old base name reads as the base's default preset (`presetOf`), nothing is migrated.
14. **The schematic is the dial (ruling 14).** The dial grows to 300 px while a posture is held or called (author, G1), draws `target` and `hot`, is hidden under `sensoryNow` (the blindfold's film, feel lines), keys 1–7 act only while nothing editable has focus and the device is down; the feet are a ring at the ankles.
15. **`startPostureHold` (ruling 15).** Reusable (`source`: `take`, `her_call`, `drill`, and P17g's `attendance`).
16. **Her foot language (ruling 16).** The five pairs of the prototype (`signalsOf`); `foot_signal_given` is her first naming of a motion; an answered one trains `memory`, a missed one is `foot_signal_missed` (no offence; a slip of `memory` waits for her discipline); kneel / go / look at me still wait for a gesture (P16c).
17. **The day of her feet (ruling 17).** Derived (`feetOfDay`), nothing stored but what the commander did (`footCare`); ±`TUNING.craft.feet.combatPct` (3 %) through a second `registerCombatPassive`.
18. **Unasked care is an action (ruling 18).** `care/unasked { unitId, careId }`, one slot; noticing is `craftRoll` over `Unit.insight` × the row's `care.notice`; the seven-day count is `Relation.craft.cares`.
19. **Praise in words (ruling 19).** `said` (≤ 400, one line) is read from the exchange by the scene and DM controllers and travels in the `intents/apply` payload; it is never sent to a model.
20. **`[ANTICIPATE]` (ruling 20).** A chip in `CHIP_SLOTS` (`anticipate`) shown by `HerReading.r` / `.p` only; it stages the first commander service (registry order) that fits her pair tags and passes `entryAllowed`, so P16's `practice_anticipated` runs; the answer follows in her voice by style.
21. **Lessons (ruling 21).** A slip pays half the clean xp when her punishment (`punishment_issued`) or her named point follows it in the same scene; the point is the `craftLessons` row read by `slip` / `kind` / `interaction`; whether she names it is `lessonDue` by style (`drill`, `ritual`, `clinical` always, `cold` 0.4, `playful` as a joke, `cruel` never, the rest 0.5 by a hash).
22. **Intents (ruling 22).** `praise_given`, `foot_signal_answered`, `care_noticed` (`CRAFT_INTENT_TYPES`; `EVENT_TYPES` 64, `ALL_EVENT_TYPES` 91), each offered only while its subject exists (`craftIntentInput`).
23. **Deferred (ruling 23).** The night under her arm, `depth`, the Strain side of `composure` and P17d's scent are not built; their disciplines and hooks wait.
24. **`vindictive.manner.intensity` is 2.** Done; nothing moved.
25. **Who names postures and which (ruling 25).** `TUNING.craft.posture.likes` (a draft by the author) is read by `herCandidates` / `pickHerPosture` and tilted by `order` and `curiosity`; `keepsPostures` covers `ritual`, `drill`, `regal` and the household protocol through `styleOf` / `practiceOf`; a preset the commander holds that fits is named first; her first call of a picked posture is a lesson (`practices.call.taught`, a ghost, no slip on a miss).
26. **HER POSTURES (ruling 26).** In the DYNAMIC section (`herPosturesBlock`): her name in her hand, the mannequin of the preset, its points with their keys, the commander's knowledge as a word, `[ PRACTISE ]` (`activity/do`, `train`, focus `drill_posture`, with `presetId` and `holderId`; the slot is spent).

### Memory check as built

| rule | event | audience | spread | importance |
|---|---|---|---|---|
| `craft_record_set` | `record_set` | her | none | 1 |
| `craft_care_noticed` | `care_noticed` | her | none | 2 |
| `craft_exam_passed` | `exam_passed` | her | none | 1 |
| `craft_exam_failed` | `exam_failed` | her | none | 2 |
| `craft_sentence_set` | `sentence_set` | her | none | 2 |
| `craft_sentence_extended` | `sentence_extended` | her | none | 2 |
| `craft_sentence_served` | `sentence_served` | her | none | 2 |

All are about her, none is hidden from the commander, and every text is `AUTHOR TO WRITE`. The resolvers (`src/engine/memory/resolvers.ts`) say only what the engine says: the time in words for a record (a posture's record is keyed `posture:<preset>` and told by the preset's label), the days for a sentence, the care's `promptHint`; never the pass mark, the echo or the crime.

- **Bookkeeping, no rule:** `craft_xp`, `craft_level`, `lesson`, `posture_taken`, `posture_slip_noted`, `posture_corrected`, `posture_ended`, `drill_done`, `care_unasked` (an unnoticed care stays in the commander's record), `foot_signal_given`, `foot_signal_missed`, `praise_given`, `headlock_offered`, `norm_set`. No rule for `praise_missed` (an offence: her discipline writes its own facts), for the sparring hold (`wager_resolved` already writes its fact) or for "she names the service" (a line, not an event).
- **Journal:** `care_noticed` has an `eventDeltas[].journal` phrase and zero deltas; so do the other two relation types of the craft, `praise_given` and `foot_signal_answered` (deviation: the plan gave the journal to `care_noticed` only; the two have no memory rule). **Chronicle:** nothing. **Prompt:** only the triggered `craft:` directives, never a `group: 'memory'` provider.

### Deviations from the draft

- **Hook names.** The plan's `registerActivityEffect` is `registerDrillHooks({ gate, effect, partner })`; the plan's `registerBlockingGate` for `on_hands` is the contact field `supported: true` read by `presetSupports` in the blocking's own gate (`blocking.ts`, `vocabulary.ts`).
- **State the plan did not list.** `CraftEntry.drillDay` (a drill pays once a day per key; the decay's `lastDay` is any use, so it cannot say) and `CraftEntry.decayedDay` (the decay's own clock, so a step down restarts it without touching `lastDay`); `Known.decayedDay`; `Relation.craft.{slips, lesson, anticipate, footCare, praiseSlipDay, goalDay, partnerDay, headlock}`; the engine events `posture_ended` and `praise_given` in `CRAFT_EVENT_TYPES`.
- **Files.** The partner drill's scene is `drillScene.ts`, not in `drills.ts`; the programmes' shared booking code is `programmes/slots.ts`; `herSet.ts`, `provocation.ts`, `goal.ts` and `view.ts` are new.
- **Care noticing is hidden until she shows it.** `care/unasked` always says `care_unasked`; whether she saw it is kept in `Relation.craft.cares` and lands as `care_noticed` (journal, memory rule, favour, Regard) when she next appears in a scene or a DM (`landCares`), or when the model reports it (`care_noticed` intent).
- **`staging.signal`.** The foot service reports a bout of her foot language through a new `PhysicsPanelStaging.signal` (`physics/service { runId, signal }`, then `registerServiceReport`); a declared hunk in `activity/fidelity.json`.
- **Two new reliefs.** `physics/relief` kinds `react` (a reaction to a stimulus: she always feels it, no draw; a caught cheat, or `physics_noticed` when involuntary) and `endure` (a stimulus that went by: `physics_endured`, pays `stillness`); both need the game switched on.
- **The posture instrument is outside the physics host's runs.** `registerPostureInstrument` / `postureInstrumentFor` / `syncInstruments(env, run, postureRun)`: a hold of a posture has no `physics_outcome`, so the host mounts it beside the physics instruments and the instrument knows whether it ended the hold; with real time or the game off nothing is drawn and the hold goes on in the engine.
- **The call series rule.** The engine's one call is the series' last (or only) call; scheme C draws earlier calls by a hashed pick; the answer goes out once, at the series' end, and is the posture only if every call was taken (a held trap counts as taken).
- **`daily_praise` carries `practice: true`**, not `practice: 'protocol'` (the template flag is a boolean); `styles`, `conditions.minFrame` and `echo` are new optional template fields read by field.
- **`programme` booking kinds.** `drill_exam` and `drill_session` carry `programme: 'exam' | 'session'` and are left out of the kinds a roll, milestone or aftermath may book (`allowedKinds`); the programme books them on a free slot only, looking `TUNING.craft.drill.lookahead` (14) days ahead.
- **`crimeEchoes` days.** The sentence's term and the echoes are data in `crimeEchoes` (read by `crime`); the spec's 7–30 days is each row's `days`.
- **The similarity helper is shared by the craft only.** `src/engine/text/similarity.ts` exists, but `memory/promises.ts` and `dynamic/compromat.ts` keep their private copies (their numbers differ, so nothing was swapped).
- **Settling-in is a posture rule in this package.** `settlingDue` / `settlingModifier` are read by `startPostureHold` only (see open items); the count is kept for physics holds too.
- **Her taste.** `keepsPostures` is widened to `drill` and `regal` (and the household protocol) in `TUNING.practice.posture.keepers`; `namePostures` runs as step 7a of the practices' day step.
- **G1 and G3 changes the author made in review** that the spec did not have: the posture beat 45 s, her posture as a ghost until learnt, the call taken the moment it matches, time per point to move, hints that thin out with mastery and "always show every hint" in SYS › Scene (`postureHints`), "look at me" not obeyed as its own fault, the 300 px dial.
- **Commits.** The programmes of tasks 19–22 are one commit (`cb037f9`), not four; the three commits of chunk c5 (`cb037f9`, `b3f958d`, `98af15f`) carry `Co-Authored-By: Claude Sonnet 5.5` in their trailer, the rest of the package carries `Claude Opus 5.5`.

### Non-obvious things to know

- **Gates.** `craftLive(state, reg, holderId)` is `practiceLive`; nothing is written, drawn, offered or told unless some holder passes it (`craftOn`), except unasked care, which has `careOpen` (the dynamic on, her profile live, a `Relation.dynamic` block). The game of postures needs `physicsInteractions.posture`, stillness under provocation `physicsInteractions.provocation` (both default on; they are not physics interactions). Without a `manner` block "she names the service" never fires.
- **Byte-identical off.** `tests/craft/unaffected.test.ts` pins two weeks: the golden `tests/fixtures/unaffected-week.json` (made before P13; never regenerate) and `tests/fixtures/craft-equal-week.json` (every category on, a holder at `equal`, made on the commit before the craft existed). `tests/sim/practiceLongRun.test.ts` fails on any draw whose stack goes through `src/engine/craft/`. A seeded test that moves stops and reports.
- **No rng draw.** Every chance is `craftRoll(state, unitId, key)` (a `practiceRoll` with a `craft:` key), every pick an index over a registry-ordered list, every plan of a hold a hash (`fnv1a`). The sparring wager keeps its own draw.
- **`installCraftHooks()`** (idempotent) registers the physics readers, the stop hook, the service report, the after-bout hook, the combat passive and the hobby hook; a test that calls `resetPhysicsHooks()`, `resetAfterBoutHooks()`, `resetDrillHooks()` or `resetPraiseHooks()` calls the matching `install…Hooks()` again. `actions/craft` must be imported after `actions/practice` (day-end steps run in module order).
- **Read by field and type, never by id.** Styles through `styleOf` / `practiceOf` (a turn counts), her axes through `mannerOf`, expectations through `expectationsOf`, presets by `base` / `points` / `meaning` / `humiliation` / `tags` / `supports` / `default`, care rows by `care`, contacts by `foot` / `headlock` / `supported`, physics by `interaction`, crimes by an echo row's `crime`, echoes by effect type, lessons by `slip` / `kind` / `interaction`, booking kinds by `programme`.
- **Hidden values** (each a sentinel in `tests/fixtures/analyze/hidden.ts`, and a reading must be identical with or without them): xp numbers (words only; raw only with "show raw values"), drift rates, a hold's temptation plan, a hold's planned end when it has none (`postureEndShown`), her noticing chance and whether a care was noticed before she shows it, the settling-in count (the load she added is a clause of the `craft:posture:` directive, never a figure), the exam's pass mark and what an exam in progress has come to, an unnamed foot signal, the lesson word before she says it, a slip waiting for her discipline, the praise log, the sentence's crime and echo before it has acted and what slips added to it. Shown: levels as words, records in fiction time, her norm in her hand, a sentence's days left, signals she has named, postures known.
- **The fidelity gates.** `src/ui/scene/instruments/posture/fidelity.json` (`posture.html`, G1), `activity/fidelity.json` (`her_activity.html`: the provocation game, G2, and the foot service's signal) and `cards/fidelity.json` (`cards.html`: the craft's surfaces, G3) are checked by `tests/ui/instruments/fidelity.test.ts`; the prototypes in `docs/prototypes/` are normative. Run `npm run test:layout` after any change to the stage's CSS (`css/86-posture.css`, the cards).
- **Cards and what they never show.** `craftCards.ts` remembers what the commander settled in a scene (`not now`, `understood`, `keep it`) in module memory that `resetCraftCards()` clears on a chat switch; a card draws from the engine's value in its stronger ink and never shows the pass mark, a care that was not noticed or has not landed, or the echo before it has acted.
- **A directive** is derived from the state, triggered, worded "if it fits, … once" and gone once voiced or when its scene ends; `onChatChanged` drops every `craft:` directive and forgets what was offered.
- **Removal.** `removeFromService` calls `forgetCraft` (her pair book, the programmes' bookings, her posture hold); the commander's own book stays.
- **Pronouns.** `tests/content/pronouns.test.ts` lists every file of `src/engine/craft/` (and `programmes/`), `src/craft/` and `src/ui/craft/`; her lines are in the first person, the commander's words are "the commander".

### Open items

- **A posture hold in turn-based play** (real time off) has no instrument and no end but the stop word or the scene's end; the engine's `until` is not played.
- **The 300 px dial overlaps the reply** by about 43 px at 1280×800 (author's size; the layout test accepts it).
- **Three presets** (`kneel_arched`, `light_bearer`, `hogtied`) have drift rows that follow `docs/content/blocking.md` §7.3, not the prototype's `RATE` table (a test names them).
- **The foot service names her signals again in each session**: the instrument's own `named` set starts empty each session, so she teaches each motion again, while the engine's `named` flag is per pair and `foot_signal_given` fires once.
- **A drill with another woman opens no scene in real play** (the engine path, `seen_together` and the jealousy are tested with a scene opened by hand); with a holder it does.
- **The settling-in count acts on posture holds only**, and of its five modifiers only `no_duration` changes the run (the others are clauses of the `craft:posture:` directive); physics holds keep the count but nothing reads it.
- **Disciplines with no consumer yet:** `speech`, `rhythm` (her rhythm per pair is read), `memory`, `composure`, `pain` and `depth` have xp writers at most (the recitation and rhythm drills, answered foot signals) and no reader beyond CMDR › CRAFT; the strokes, the Strain and `depth` come with P16c, P17 and P17b.
- **`ticklish`** is not built (P16c); the provocation panel's checkbox stays unchecked (multiplier 1).
- **The kneel / go / look-at-me gestures** of her foot language, the further steps of foot care and the escape from the sparring hold are P16c's.
- **Texts and numbers:** every `AUTHOR TO WRITE` text (the 47 preset descriptions, `craftLessons` words, `craftLines`, `crimeEchoes` except smuggling's line, the seven memory-rule texts, the directives' wording, the drill note, the booking texts, `daily_praise` and `answer_to_me_first`) and every `AUTHOR TO TUNE` number (`TUNING.craft`).
- **`docs/content/blocking.md` §7.3** now says the presets live in `servicePostures` and that `facing_wall` is `face_to_wall`; the spec's own §4 ("posture 30 s") and §7 ("48 presets") are the drafts the rulings and G1 changed.
- **Not run in a browser:** the manual test `docs/MANUAL_TEST_P16b.md`.

### Interfaces provided to later packages

State: `Commander.craft`, `Relation.craft`, `practices.postureRun` / `postureDay`, `blocking.commander.preset`. Readers: `craftLive`, `craftOn`, `craftHolders`, `careOpen`, `craftLevel`, `craftCapacity`, `craftRoll`, `craftView` / `Knowledge.craft`, `presetOf` / `commanderPresetOf` / `samePreset`, `feetOfDay`, `anticipateShown`, `fictionSeconds`. Writers and flow: `addCraftXp`, `addPairXp`, `startPostureHold`, `takePostureHold`, `endPosture`, `payDrill`, `noteFootSignal`, `giveCare`, `givePraise`, `forgetCraft`. Hooks: the list under **Where it lives**. Registries `servicePostures`, `craftLessons`, `craftLines`, `crimeEchoes`; fields `blockingActivities[].care`, `blockingContacts[].{supported, foot, headlock}`, `bookingKinds[].programme`, `relationshipRuleTemplates[].{styles, echo}`. Events: the 21 of `CRAFT_EVENT_TYPES`; intents `praise_given`, `foot_signal_answered`, `care_noticed`. Directive ids `craft:`-prefixed. Instruments: the posture instrument and the provocation game.

## Interfaces already provided by P15 (implemented — use, do not rebuild)

P15 is implemented (see its **Implemented as**: rulings R1–R25). What follows is what exists for this package and what is reserved for it. Every P15 reader answers null, zero or an empty list while the dynamic is off (`dynamicOn`, `herPracticeLive`), and nothing it adds draws from the rng unless someone is eligible: a hook you register must keep a campaign with no dynamic byte-identical (`tests/dynamic/unaffected.test.ts`). Keep new directive ids away from `dynamic:`; read domains by capability, styles, milestones and aftermaths by field, never by id; no text gives the commander a pronoun or a feeling.

- **Regard:** `Relation.regard` exists for every named unit while the dynamic is on; `regardFall(draft, reg, unitId, humiliation 0–5, { witness, cause })` (style row: `regardFactor`, `regardSpeed`, `regardFloor`; a witness ×0.7) and `regardRise(draft, reg, unitId, kind, amount?)`. Wired: `cost` (an act while her reading's r ≤ 0), `record` (`marathon_done`), `dignity` (a hold that ended `released` or `checked` with no slip or cheat), `value`. **Reserved for this package:** `pleased_high`, `regal`'s praise doubling (the `TUNING.regard` row exists), help with her goal +4, and `drill` already doubles the `record` and `pleased_high` rises (`TUNING.regard.drill` and `.mastery`, the style read by key). Regard never changes hold or frames and is hidden everywhere (sentinel): the nickname tone and aftermath weights are the only outputs.
- **Mastery:** `Relation.mastery[targetId]` (+5 an act, +3 more when her `how` is set and the act ended clean, levels 20 / 60 / 120 / 200 / 320, `mastery_gained`; level 2 reveals the zone through a `zone_revealed` fact). `addMastery`, `masteryLevel`. Keys are free strings: use your own (`posture:<id>`, `rhythm:<id>`, her foot language, her routine) beside the worship-target ids; the body map reads only `worshipTargets` ids. The `matched` result of a segment does not exist in P15a, so the `how` bonus reads a clean end.
- **Styles and her profile:** `practiceStyles` has 11 rows with `regardForm`, `regardSpeed`, `regardFloor`, `regardFactor`, `surfacesWhen` and a `point` for her reading (`clinical` none); `drill`, `regal` and `vindictive` exist as rows with **no programme**: yours. `bond.practice.fairness`, `hintStyle` and `drive` import, validate, edit, lock and are read through `practiceOf`; `drive` already scales Want growth through `registerWantGrowth` (`wantGrowthMult`); `fairness` and `hintStyle` have no reader beyond the profile (yours).
- **Her reading and satisfaction:** `HerReading` (`r`, `f`, `p`, the five motive weights, `region` incl. `cowed`) per holder, shown only as her region word; `satisfactionOf` gives the combat passive (`combatEffects`: ±5 %) that your care quality (±3 %) may extend through `registerCombatPassive`.
- **Offering and the body map:** the offer composer's vocabularies (`part`, `posture`, `contact`, `service`, `time`, `role`, `endurance`, filtered by `entryAllowed`), `answerOffer`, `src/ui/dynamic/bodyMap.ts` (pure ports of the draft's geometry: `outlinePath`, `armPaths`, `hairPath`, three builds, four hairs): the commander's schematic can reuse them; the body map shows only what a fact revealed.
- **Squad suspicion:** `addSign` rows `seen_together`, `time_alone`, `scent_*` are reserved with no producer.
- **Moods and combat:** `moodSigns(state, reg, unitId)` returns her tells (revealed fields only), her mood word after a shared scene today and the length of her last DM replies; no meter.

## Left to this package by P15 (user ruling, 2026-11-22)

- **The position chips `[PROVOKE]`, `[TEST HER]`, `[ANTICIPATE]`** (P15 §15.2: "chips such as … tied to axis thresholds, never to region names"). P15 built only `[ASK IN RETURN]`, as the offer composer's toggle; the other three were deferred because they need practices to act on. P16b owns `[ANTICIPATE]` (it is unasked care, §10; anticipation in her presence is P16 §R.5); `[PROVOKE]` and `[TEST HER]` go to P17e unless the P16b plan takes them. Whoever builds them: each chip is shown by her reading's axis thresholds (`HerReading.r` / `.f` / `.p`, never `region`), stages the commander's act as a scene note with a `next_reply` directive, feeds `updateReading` as a sample (`returned` for PROVOKE, `resisted` for TEST HER, `yielded` with motive `her` for ANTICIPATE), carries `data-analyze`, and its meaning depends on her style (a game to `playful` / `cruel` with a bratty reading, an offence to `ritual` / `cold`).

## Interfaces to be provided by P15a and P16

- P15a: interaction types, segments and the cue pool, the marathon, noise, her gaze, the stimulus layer, her skills (`herSkill`), `contactPhysics`, `blockingPostures` with the point model.
- P16: her discipline, the consent ladder, physical discipline and the slap, the named postures, `practice_generate`.

## Interfaces already provided by P14c (implemented — use, do not rebuild)

- **Hobbies are a cycle with a commander's skill beside them:** `HobbyState` (skill and interest are hidden numbers; the player sees milestones she has told and a word), `practise(draft, reg, unitId, hobbyId, day, slot, { push, caused })`, `pushHobby`, `grantMilestone`, `Commander.hobbySkill` (0–100, shown only as `commanderHobbyWord`: none / a beginner / getting there / good at it) and `hobbies[].teachable`. A craft lesson that feeds one of her hobbies calls the same functions, so the cap, the plateau and the news queue stay one system.
- **The ordinary meeting:** `pastimes` (the quiet hour, `life/time_together`, `her_hobby` as practice plus a push and the commander's learning); `humor` (via `temperamentOf`) is what P16's mock answers read.
- **`Knowledge.life(unitId, reg)`** is the only way a panel reads her hobbies, opinions and news; extend `LifeView` there rather than reading `unit.hobbies` in a view.
- Keep new directive ids away from `life:`; no rng draw (`lifeChance` / `lifeHash` hash a key with the salt); read life content by field, never by id. Details: P14c **Implemented as**.

## Interfaces already provided by P14b (implemented — use, do not rebuild)

- `Development.counters` and habits read by `counter.kind`; P17e's emergent rituals and this package's records may share key kinds. No rng draw (chances are `fnv1a`).

## Interfaces already provided by P14 (implemented — use, do not rebuild)

- Every model call through `app.generations`; a new site is a `SiteDecl` with handlers bound by the owning controller.

## Interfaces already provided by P16 (implemented — use, do not rebuild)

P16 is implemented (see its **Implemented as**: rulings R1–R24, the memory check and the open items). Everything it adds is off, absent and byte-identical while nobody holds at `play` or beyond (`practiceLive`), and none of it draws from the rng (`practiceRoll`). Keep new directive ids away from `practice:`; read seeds, punishments, ceremony steps, booking kinds and rule templates by field, never by id; no text gives the commander a pronoun or a feeling.

- **Strokes are yours.** The `implements` registry (palm, slipper or boot sole, belt, ruler, riding crop, cane, glove: `force`, `mark { kind, slots }`, `sound`, `contentTags`) is data with no reader; a physical punishment is a `holderPunishments` effect `physical`, **narrated** (shown or only reported by `physical_discipline_shown`; its `injury_chance` and its threat count, `slap_dealt` / `punishment_answered` are threat sources). Build the interactive strokes (implement × target × posture, the flinch impulse on posture points, the count aloud, rules of conduct during strokes, marks by implement, `her_marks`) on top: read an implement by `force` / `mark`, and the narrated effect is where to hook (`runPunishmentEffect` in `punish.ts`, the ceremony's `the_execution` step).
- **Named postures:** `practices.postures[holderId]` keeps her names for P15a's 13 `blockingPostures` (flavor kind `posture_name`, site `flavor.posture_name`), the call (`practices.call`, `practice/take_posture`) and the `posture_slip` offence; points that drift and the 48 presets are yours (`serviceLevel + 1` is the cap of names today).
- **Service:** `practiceView` / `Knowledge.practice` read protocol, routine, verdicts (`practices.verdictScene`, `service_rated`), favour as a word and `practices.service` (what she has seen of the service in the scene: the judged pair and the bonus anticipation gives); the engine verdict is read from the blocking (`scope: dynamic`, `actor: commander` activities and their `pairTags`). Anticipation is built (`practice_anticipated`); `[ANTICIPATE]` as a chip and unasked care are not.
- **The ceremony** (`ceremonySteps`, `ceremonyOf`, `OpenPunishment.ceremony`) and the slap (`practices.slap`, `herSkill.swing` feeds its feints) are the model for a stroke count; a number she finds too low is doubled by cruel and vindictive and stays hidden when the count is hidden by style.
- **Not built, left to you:** the programmes of `drill`, `regal` and `vindictive`, a second physics by track level, `her_marks` with a duration by implement, Regard's help-with-her-goal and `regal`'s doubled praise.

## Interfaces already provided by P15a (implemented — use, do not rebuild)

P15a is implemented (see its **Implemented as**: rulings R1–R16). It built the parts below as hooks or data only; this package completes them.

- **Postures:** P15a ships the 13 base postures only (blocking.md §7). The 48 presets, points, drift and named postures are yours; extractor changes of a point are yours too.
- **Endurance as a discipline:** the commander's endurance per physics is `Commander.endurance` (xp and level 0–5, TRAIN focus `endurance_breath` / `endurance_weight` / `endurance_jaw`). Fold it into `endurance:<physics>`.
- **Stillness and rhythm mastery:** both read 0 in P15a (the noise loudness and her personal rhythm). Supply them.
- **Mini-games and their toggles:** the tempo and pressure mini-game for licking and kisses, and the posture and QTE mini-games, with their SYS toggles (`tempo`, `posture`, `qte`). P15a has `inhale` and the six interaction types.
- **Records in fiction time:** written from P15a's `marathon_done { hours, unitId, physicsId }`.
- **Shape of the endurance book:** `Commander.endurance?: Record<physicsId, { xp, level 0–5, trainedDay? }>`; `commanderSkill(state, physicsId)` is the only reader; the drills are `train` focuses with the effect `commander_endurance_xp`, once a day per physics.
- **Her skills:** `Relation.herSkill { seal, weight, reading, swing, rhythm, practice }`, read by `herSkillOf`; `practise` is the only writer.
- **Hooks you may use:** `stillnessOf` (reads 0) and `rhythmOffset` (her personal rhythm, `fnv1a`) in `src/engine/physics/`.
## Interfaces already provided by P10e (implemented — use, do not rebuild)

P10e (the scene stage) is implemented; see its **Implemented as**. It rebuilt only how the scene is drawn.

- The posture dial (`renderPostureDial`, bottom right of the scene) draws the commander's body with `mannequinSvg(pose, { target, hot })`: pass the target pose and the drifting joints (`shoulders`, `elbows`, `hips`, `knees`, `head`, `gaze`) and it draws the dashed ghost and the amber rings; nothing drives them yet. Point states are `PointStates` (`dial/points.ts`); the 47 presets of blocking.md §7.3 are a test fixture (`tests/fixtures/dial/presets.ts`) for you to turn into registry content, and `npm run dial:sheet` renders them. Keys 1-7 for joints have no handler (the scene leaves them to you). Her name for a posture is read through `Knowledge.practice`. The fan reads `blockingChoices`; new choices there appear in the dial and the strip.

## Interfaces already provided by P10e chunk (e) (implemented — use, do not rebuild)

P10e chunk (e) (the mini-game instruments, her cards and the posture call) is implemented; see the **Implemented as: chunk (e)** section of `docs/packages/P10e-scene-stage.md`, its rulings R1–R32 and A–AD, and its open items for the author. The prototypes in `docs/prototypes/` stay normative: a new mini-game is designed as a prototype first and ported with its `fidelity.json` (the fidelity test checks it), not redrawn from prose.

- **The instrument pattern:** `registerInstrument({ id, matches, start, drawable? })` in `src/ui/scene/instruments/index.ts` (first match wins; read the physics by field); `start(env, run)` returns `{ update, stop, finish? }`. Write a layer's style only through `claimStyles`, her lines only through `env.say`, timers through `env.timeout` / `env.listen` / `env.raf`, sound through `env.samples` (`SampleSound`: `preload`, `buffer`, `ctx()`, `bus('world' | 'body')`); the host undoes the rest at the unmount. Report inputs through `env.staging.input(i, { pointer })` (Ruling O), place beats with `env.staging.clock()`. An instrument draws only in real time (`physicsRealtime`, the campaign's mirror, the interaction on); otherwise the physics card.
- **Her lines are content:** `voiceLine(reg, kind, style, key, vals)` over `cardVoice` (`docs/content/card-voice.md` is the readable copy; a style the prototype lacks reads neutral's, Ruling R); a line that answers an engine decision follows the engine's answer (Ruling Q). New engine inputs are optional and additive (`SegmentInput.amount`, the kinds of R2); new plan fields are hashed (`fnv1a`), never drawn.
- **Art:** `ArtSlots.get(unitId, slot, { explicit })` with its sidecar (`fit`, `zones`, `feet`, `shown`, `face`), `explicitArtAllowed`; a missing picture always falls back (her sprite, the automatic zones, or the card).
- **Foot service under her desk** (`src/ui/scene/instruments/activity/service.ts`, inside her frame): her foot signals are `signalsOf(state, holderId)` (`src/engine/physics/service.ts`, hashed per holder over `TUNING.physics.footSignals`: five pairs, the prototype's, where this spec says 4–6; kneel / go / look at me have no gesture yet), her pace `servicePaceOf` (patience, kiss, tempo, grain and order, tilted by her P15 `how`), her verdict `verdictOf(quality)` through `physics/service { runId, verdict }` → P16's `rateService` once a scene. A misread or unanswered signal writes no event yet: `foot_signal_missed` and the pair's mastery are yours.
- **Shoe service** (`src/ui/scene/instruments/shoe/shoe.ts`): `footwearOf` / `dirtOfDay` (`src/engine/physics/footwear.ts`), the mask as the gauge (`wipe { part, amount }`, R29), the spit decided at once (`physics/spit`, Ruling AC), her verdict as above. It draws only with both pictures of her footwear (`shoe_close.<kind>`, `shoe_sole.<kind>`); otherwise the card.
- **The posture call** (`src/ui/scene/instruments/call/call.ts`, `drawPostureCall(…, { look: 'scene' })`): her word, the taps of her window (`tapTimes`), the fan of her named postures (`fanPlace`); the answer is P16's `take`. The game of postures (points, drift, presets, the dial's `target` / `hot`) is still yours; the dial's circle never moves with its label.
- **Stillness and her rhythm:** her activity's frame (`src/ui/scene/instruments/activity/frame.ts`) reports `relieve` / `fidget` with loudness, decided by one draw when reported (`physics/relief`, Rulings X, Y); `stillnessOf` still reads 0 and `rhythmOffset` is P15a's hash (the frame does not feed them), and her presence (`presenceOf(state, reg, run, phase)`) is derived, never stored.

## Worship customs (P17g, 2026-11-25)

**P17g** (`docs/packages/P17g-worship-customs.md`) builds customs that extend this package (praise with memory for `regal`, accepting worship in her body, her token on a run, the shrine of her defect). This package builds nothing of them; keep its mechanics readable by P17g (read by field and effect type, hooks where P17g needs them) and do not build the same thing here.

## Interfaces already provided by P15b (implemented — use, do not rebuild)

- **Her manner:** `mannerOf(state, reg, unitId)` (`src/engine/dynamic/manner.ts`) gives her six axes (`intensity`, `warmth`, `order`, `voice`, `tempo`, `curiosity`, each −2…+2, her drift and the mood of the day folded in), `drawnBy` and the mood, or `null` without `bond.practice.manner` (the gate: no manner, no effect). `bend(base, step, kind)` / `bendBy` (`src/engine/bend.ts`) move a style's number by a step (at 0 they return the base; `tempo` + is quicker, so times are shorter); an instrument bends its style row once through `bendRow`, declared in its `fidelity.json`; the physics layer gets her axes through `registerPhysicsManner`.
- **Read her style through `styleOf` / `practiceOf`**, never `bond.practice.style` (a turn of her style, `development.practice.primary`, sits on top of the import). `faceNow(state, reg, unitId, present)` (`dynamic/face.ts`) says which face a scene shows (`dynamic`, `dynamic_to_commander`, `everyday`, `mask`); a holder directive follows it.
- **Her small ways and her days:** `quirksDue`, the `dynamic:quirk:<unitId>` line and `quirk_voiced`; `mannerMoodOf`; drift is a P14b axis kind `manner` (`manner:<axis>`, `manner:drawn_by`, `manner:turn`), fed by `dynamic/mannerFeed.ts` (push table `TUNING.manner.push`); `dynamic.practised` (what she has done with the commander) and `drawnBy`'s favour (`addFavour`).
- **Probing by manner (§12):** probe rows take `needs` (`probePlaces`, `probePool`; a new row with `needs` also needs its head start moment), a milestone takes `requires.manner`, a probe row `wakesOnPraise`; `hypothetical_answered`, `first_below` and `dynamic.noted.praised` (`dynamic/regalEntry.ts`).
- Keep new directive ids away from `dynamic:quirk:`; draw nothing (hash a stable key); the hidden values (accumulators, the mood as a number, the distance to a turn, quirk state, the styles' places on the axes) never reach a panel, a toast, an event text or a reading. Details: P15b **Implemented as**.
- For P16b: the `regal` programme and the commander's disciplines read her `regal` style through `styleOf`; the unasked-care count may use `dynamic.noted` beside `praised`.
