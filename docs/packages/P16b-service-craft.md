# P16b — Service as a Craft: the Commander's Disciplines, Postures, Mini-games, Training

**Status: spec.** Release 0.2 (post-release), after P16. **Depends on:** P15a (blocking, moments, physics and its 2026-11-20 revision §16), P15 (the dynamic, §16: Regard, motives, styles), P16 (practices and its revision §R), P14c (temperament), P14b (counters, habits), P7 (body stats, statuses, non-body routes), P2 (activities, the training slot), P9c (sparring), P10 (hub, whereabouts), P10b (handwriting, notes), P14, P7a. **Read:** overview; P15a; P15; P16; this file; `docs/content/blocking.md` §7 (postures); `docs/content/lore.md` (§0).

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

## Open decisions (author)

- Descriptor words for the levels; the drill list; the foot-signal meanings; praise rules; the crime echoes of `vindictive` for `purge`, `mutiny`, `strain_trade`.
- Every number above.

## Interfaces to be provided by P15a, P15 and P16

- P15a: interaction types, segments and the cue pool, the marathon, noise, her gaze, the stimulus layer, her skills (`herSkill`), `contactPhysics`, `blockingPostures` with the point model.
- P15: Regard (`regard`), the motive weights, `practiceStyles` rows, `bond.practice.fairness` / `hintStyle`, `Relation.mastery`.
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
