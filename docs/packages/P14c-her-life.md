# P14c — Her Life: Days Off-Screen, Hobbies, Opinions, Quiet Meetings

**Status: implemented** (plan: `docs/plans/2026-11-20-p14c-her-life.md`; automated tests pass, the in-SillyTavern checklist `docs/MANUAL_TEST_P14c.md` still has to be run by hand). Where this draft and the code differ, the code wins: see **Implemented as** at the end. Release 0.2 (post-release), **the first package of 0.2** (before P15a): it does not need the dynamic and serves every named woman. **Depends on:** P2 (activities, slots, companions), P3 (scenes, intents, facts, DMs), P3b (memory rules, `Knowledge`, dossiers, the memory share), P8 (values axes), P10 (hub, whereabouts, voices), P10b (living DMs, notes, handwriting), P14 (generation envelope), P14b (counters, appraisal, accumulators, the effective profile), P7a. **Read:** overview; this file; `docs/content/life.md` (the draft content); the **Implemented as** of P3b, P10b and P14b; `docs/content/lore.md` (§0).

**Analysis tool (P7a):** every new stat, chip, option and card carries `data-analyze`, has a glossary entry or registry `description`, and live values get a provider that reads through `Knowledge`. **P14:** every generation registers a site. **Lore §0:** no pronoun for the commander in any registry text, directive or label.

Origin: the 2026-11-20 design session. 0.2 builds a deep, mostly physical dynamic; this package gives the women a life that does not revolve around the commander, so that they are interesting beyond trials and rituals. Author ruling: **quiet meetings are the ordinary meeting**; the dynamic's stagings are the deviation for particular pairs.

## Goal

- **Her own days:** small things happen to her whether the commander is there or not, and she may tell about them.
- **Her hobbies live:** picked up, practised unevenly, cooled, dropped and taken up again, each by her own gift; milestones leave traces (a book finished, a plant in flower, a song learned).
- **News on a schedule:** whatever happens, the squad's news reaches the player spread out, never bunched (§3.6).
- **She has opinions** about the world, the service, everyday life, people and abstract things, voiced when something brings them up, not every line.
- **Time together without stakes:** an activity for spending a slot with her doing something ordinary.
- **Temperament:** three personality fields every package of 0.2 reads.

## 0. Prompt hygiene (a rule for this package and for 0.2)

Whatever the main model reads every turn, it repeats every turn (the author's case: told once that the commander is a detective, the character said "detective" in every reply). Therefore:

1. **Triggered, not standing.** A topic, a piece of news or a fact enters the prompt only when its trigger fires (a place, an event, her activity, a keyword in the conversation), never as a standing line.
2. **Once.** The directive says "if it fits, she may bring this up, once"; `intent_extract` reports that it was voiced and the engine takes it out of the prompt.
3. **Cooldowns per item.** Something voiced does not come back for a long time (`TUNING.life`).

Overview §11 carries the rule for every later package (P15a–P17e directives included).

## 1. Temperament (`Unit.temperament`)

Every named unit gains `temperament { talkativeness, volatility, humor }` (proposed by `profile_import`, budget +40; editable in the wizard and the dossier while the edit lock allows; each field can be **locked** like the P15 expectation profile; none of them drifts in 0.2):

| Field | Values | Read by |
|---|---|---|
| `talkativeness` | `silent` / `terse` / `talkative` | how much she talks in practices (P15a §16.1 silent use, P16b), DM frequency (P10b), how readily she shares news (§2) |
| `volatility` | `steady` / `moody` | how often `her_mood_shift` is live (P15a), her rhythm (P17d), mood swings in her news |
| `humor` | `none` / `dry` / `mocking` / `warm` | the tone of her lines (a directive word), running jokes (§6), the mock answers of P16 |

Grunts have none. A reader `temperamentOf(state, unitId)` with defaults (`terse`, `steady`, `dry`) keeps old saves working. P15 §16.7 adds the holder-only fields `fairness` and `hintStyle`.

## 2. Her days off-screen

Registry `lifeEvents` (draft: 51 events with wording in `docs/content/life.md` §2): `{ id, size: 'small' | 'notable', tags, requires?: { activity?, defectTag?, relation?, world?, slot? }, share: 'close' | 'anyone' | 'keeps', becomes?: { hobbyMilestone? | opinionTopic? }, cooldownDays, description, hub, lines: string[] }`. `description` is the model's hint, `hub` the hover line, `lines` her fallback words when the share text cannot be generated.

- **Day step:** per named unit at base, a hash pick (`fnv1a(<seed>|<unitId>|life|<day>)`, no rng draw) chooses at most one event a day (a weekly cap by the setting `lifeEventFrequency`: rare 0.5, **normal 1 (default)**, often 2 events a week per woman; at most one `notable` a week), from those whose `requires` hold (her activities that day, her defect, a relation event, the world state) and whose cooldown has passed: per woman per kind (`cooldownDays`: small 21, notable 45, `vat_day` once a fiction year) and per kind across the squad (5 days), so that no kind repeats for one woman within a month and the commander does not hear the same news from two women in a row.
- **It becomes a fact** about her (audience = her; `hiddenFromCommander: true` until she shares it; P3b `Knowledge`).
- **Sharing**, by her `talkativeness`, Affinity and the event's `share`, always **through the news queue** (§3.6), which decides the day:
  - a **DM** from her (P10b living DM; the text is a `flavor` line from the event and her card, site `life.share`, budget 120; fallback the event's description line);
  - a **hub line**: hovering her on the hub shows a short line about her day (the "living hub" idea of overview §10);
  - **news** she brings to the next scene with her: a once-directive (`life:news:<unitId>`, "she has news: …; she brings it up only if it fits, once"); `intent_extract` reports `news_told { eventId }` and the directive goes.
- `keeps` events are hers alone; they surface only through a P15a `memory_surfaces` moment or never.
- `becomes` links an event to a hobby (§3: it starts a new one, rekindles a cooling one, or pushes one over its plateau) or opens an opinion topic for her (§4): she finished a book, so she now has a view on it.

## 3. Hobbies: a cycle, not a ladder

Registry `hobbies` (draft: 27 hobbies with wording in `docs/content/life.md` §3): `{ id, activityIds (her blocking activities, P15a), milestones: [{ id, line, trace?: 'note' | 'prop' | 'opinion' }] (four), teachable: boolean, description, traceText? }`. A milestone's `line` is her fallback words; the model words the moment. **Milestones mark her confidence and skill**, not gifts to the commander; a portrait, a poem or a carving given to the commander is a later **special event** (overview §10).

Author ruling (2026-11-20): hobbies must not turn every woman into a professional within two months and then stop. A hobby is a **cycle**: picked up, practised unevenly, cooled, dropped, sometimes taken up again; most women never reach the last milestone.

### 3.1 State

`Unit.hobbies: [{ id, skill: 0..100, interest: 0..100, state: 'active' | 'cooling' | 'dropped', since, lastPracticeDay, plateau?: { at }, milestones: string[] }]` and `Unit.aptitudes: { high: hobbyId[], low: hobbyId[] }`.

- **Aptitude.** `profile_import` picks **2–3 hobbies with high aptitude and 2–3 with low** from the whole registry (including hobbies she does not do yet); the rest are standard. Multipliers `TUNING.life.aptitude`: low 0.5, standard 1, high 1.6. Editable in the wizard. Loving a hobby she has no gift for is allowed and is content.
- **Starting hobbies:** 1–3 from the card (`profile_import`), each starting with a skill hashed inside the first two steps (`fnv1a(<seed>|<unitId>|hobby|<id>)`), so that at the start of a campaign some are halfway to a milestone and nobody is in step.
- **At most three** hobbies are `active` at once.

### 3.2 Skill

- **Practice:** each leisure slot in which her whereabouts (P10, derived) put her in the hobby's activity, and each quiet meeting `her_hobby` (§5), adds `1 × aptitude × interestFactor` (interest / 60, capped at 1.3). Nothing while she is on a run, in the medbay, restricted, or at stress ≥ 70.
- **Milestones at 10 / 30 / 60 / 100**, each threshold moved by ±15 % per woman and hobby (`fnv1a(<seed>|<unitId>|hobby|<id>|<n>)`), so that two equally gifted women never reach a step on the same day.
- **Plateaus.** At 70 % of the way to each milestone progress stops. It breaks either through **persistence** (each practice slot on the plateau: a hashed chance, `TUNING.life.breakthrough`) or through a **push**: a quiet meeting `her_hobby`, an event that `becomes` this hobby (a find, a recording), another woman with the same active hobby, the commander's praise of it in a scene (`intent_extract` `hobby_praised { hobbyId }`). The breakthrough is the milestone.
- **Ceiling.** With low aptitude the skill stops at the third milestone (60). She accepts it or drops the hobby (her `volatility`, P14c §1: `moody` drops it more often).
- **Decay.** A dropped hobby loses skill slowly (`TUNING.life.decay`), never below its last milestone.

### 3.3 Interest

- **Rises:** novelty (the first 3 weeks of a hobby), a milestone, a push or praise, sharing it with another woman or the commander.
- **Falls:** each week on a plateau, stress ≥ 50, a newer hobby taking her slots, the ceiling reached.
- **States:** interest < 25 → `cooling` (her leisure slots go elsewhere; she may still mention it); 30 days `cooling` → `dropped` ("I haven't picked it up in a while"). Interest ≥ 40 again (a push, an event, a request) → `active`.
- **New hobbies** come from events whose `becomes` names a hobby she does not have (a found recording → music, a stray → animals), from a woman with an active hobby she has spent time with (a hashed chance per shared leisure slot), or from a quiet meeting where someone shows it to her. A new hobby starts at skill 0 with novelty interest; a fourth one pushes the coolest out of `active`.

### 3.4 After mastery

The last milestone is not an end: the hobby becomes **part of her** (a P14b development fact: "the base's guitarist"); others come to her for it (other women's hobbies may start from hers); later her interest may drift to something new, and the cycle starts again.

### 3.5 Traces and the commander

- **Traces:** `note` — a P10b note in her hand (a drawing, a poem, a page, as a `paper` card; the text from site `life.trace`, budget 150, fallback `traceText`); `prop` — an object in her quarters (P17c layers when they exist; until then a line in QUARTERS); `opinion` — a new topic for her (§4).
- **Together:** the commander may join her hobby as a pastime (§5). The commander gains a skill in her hobby (`Commander.hobbySkill[hobbyId]`: descriptors only, **no mechanical value** in 0.2); with `teachable` she teaches it and the skill grows faster. A woman who taught the commander something remembers it (`memoryRules`, §8).

### 3.6 The news queue

Things happen at their own pace; **they reach the player on a schedule**, so that the squad's news never bunches (all milestones in one week, a week of nothing but hobbies).

- **What enters the queue:** every shared life event (§2), every hobby milestone and breakthrough, a hobby picked up or dropped. The state changes at once; only the **telling** (her DM, her news directive, a note) waits.
- **Delivery** (day step, after the life events are picked): at most
  - **one item a day for the whole squad** (`lifeEventFrequency`: rare one every two days, **normal one a day**, often two a day),
  - **two hobby items a week** for the whole squad,
  - **one item every two days from the same woman**.
- **Variety:** every item has a **category** (her things, her body, construct life, people, service, hobbies; the subsections of `docs/content/life.md` §2 plus `hobby`); two items of the same category never come one after the other: the scheduler takes another category or skips the day.
- **Order:** `notable` first, then the oldest, then the category not seen longest.
- **Staleness:** an item older than 7 days is not delivered as news; it turns into a **passing mention** (a once-directive at her next scene: "last week she finally …"; `intent_extract` `news_told` closes it) or stays a hub line.
- **Outside the queue:**
  - **hub lines** — passive, seen only on hover;
  - **what the player caused** — a breakthrough in a quiet meeting the player chose happens in that scene, though it still counts toward the weekly hobby cap so the scheduler waits before the next hobby item;
  - **urgent notable events** (a grunt lost, an anniversary of a death) — delivered on their day.
- State: `CampaignState.life.queue: [{ unitId, kind, ref, category, day }]`, `life.delivered: [{ day, unitId, category }]` (the last 14 days). No rng: picks are ordered by the rules and ties broken by `fnv1a`.

## 4. Opinions

### 4.1 The library

Registry `opinionTopics` (draft: 65 topics and 302 positions in five groups, with wording, `docs/content/life.md` §1): `{ id, group: 'lore' | 'service' | 'everyday' | 'people' | 'abstract', positions: [{ id, description, lines: string[] }] (3–5, **ordered**: neighbours are the steps of §4.4), axis?: { id, sign } (a values axis that suggests the first or the last position), triggers: { locations?, activities?, events?, keywords? }, description }`. A position's `description` is the neutral hint the model receives and the analyze line; its `lines` are her fallback words.

### 4.2 Her opinions

`Unit.opinions: { [topicId]: { position, strength: 'strong' | 'held' | 'loose', text?, formedDay, voicedDay?, history?: [{ day, from, to }] } }`.

- **Strong opinions** (8–12) come from `profile_import` (budget +200): topic id, position, a one-line text in her words. Validated against the registry (unknown topic or position dropped).
- **Lazy forming:** the first time a topic's trigger fires near her and she has no opinion on it, a small call (site `opinion.form`, budget 150) forms one consistent with her card, her values axes and her strong opinions; the engine validates the topic and the position, stores the text (≤ 200 characters, her words) and the opinion is fixed from then on. Without a model or on failure: the position the values axis suggests (`axis`), else the middle position, and one of the position's `lines` (picked by hash) as her text. The library grows per woman; nothing is generated ahead.
- The model never writes a position into state outside these two validated paths (P1).

### 4.3 Voicing

- At `scene/start` and on each trigger the engine picks **at most one** topic per scene from her opinions whose trigger fired and whose cooldown has passed (hash pick by scene id); the directive `life:opinion:<unitId>` says "if it fits, she may say what she thinks about X (position, her line); once".
- `intent_extract` reports `opinion_voiced { topicId }` → the cooldown starts (`TUNING.life.opinionCooldownDays`) and the commander learns it: a `Knowledge` fact ("her view on X"). Her dossier gains a **THOUGHTS** section listing what the commander has heard, in her words.
- The commander may raise a topic: a keyword trigger in the commander's own line works the same way.

### 4.4 Disagreement

- `intent_extract` reports `opinion_challenged { topicId, strength: 'minor' | 'major' }` when the commander argues against her position, and `opinion_agreed { topicId }`.
- A challenge is a P14b appraisal input (she reads it by her values and temperament: a `moody` woman takes it personally) and feeds an accumulator per topic; past `TUNING.life.persuadeAt` her position moves **one step** (to an adjacent position only, validated) and `history` records it; a `strong` opinion needs twice as much and may instead harden (`strength` stays, the accumulator resets, a fact "you will not change my mind about X").
- Agreement on a `strong` opinion is a small Affinity gain (diminishing); a moved opinion is a quiet P14b development moment shown at scene end.

## 5. Quiet meetings

A slot activity **`time_together`** (P2 `activities`, `companion: 'required'`), and the same choice inside a free scene with her ("let's …"):

- **Pastime** (registry `pastimes`, draft 18 with wording in `docs/content/life.md` §4): `{ id, requires: { affordances?, locationId?, slot?, weather? }, herActivity, commanderActivity, sensoryTag, momentSources (general sources only), effects, description, opening, lines }`: cooking, the roof in the rain, fixing gear, cards, music, the perimeter walk, reading together, training together, tea at night, her hobby (§3), laundry, patching each other up, an old film, sunrise on the roof, tidying her quarters, the shooting range, caring for her stray, a haircut. `opening` always sets the scene in the directive; `lines` are fallbacks.
- The pastime sets the scene: location, her activity and the commander's (P15a pair activities once P15a lands; until then a directive line), the sensory pool of the room (P17d when it lands).
- **No stakes:** small effects (Affinity, her stress −, Want relief for a bond profile that has one), her hobby progress when the pastime is her hobby, and the commander's hobby skill.
- **Moments:** only general sources (`her_affection`, `her_question`, `her_weakness`, `memory_surfaces`, `her_mood_shift`); never a `scope: dynamic` source, whatever the relation's frame.
- **Available** with any closeness except open hostility (Affinity > −30, not deserting, not restricted), at most once a day per woman; the pastime list is filtered by place, slot and her temperament (a `silent` woman prefers pastimes without talk).
- **Firsts:** `intent_extract` reports `first_moment { kind }` (draft kinds: `laughed`, `fell_asleep_beside`, `told_her_past`, `cried`, `taught`, `asked_about_commander`); the engine accepts each kind once per pair and writes a remembered fact (§8).

## 6. Running jokes

A line or a situation from an earlier scene that both remember can become a running joke of the pair: P14b habit counters with a new `counter.kind` `joke` (the extractor reports `joke_returned { factId }` when a remembered fact is played for laughs). Her `humor` sets how often she brings it back (`none` never). The joke is a fact; its directive is triggered (§0), never standing.

## 7. UI

- SYS › World: **life events** frequency (`lifeEventFrequency`: rare / normal / often; default normal).

- Dossier: **THOUGHTS** (heard opinions, her words, the history of a changed mind), **HOBBIES** (descriptors of progress, traces), news she has told. Every row `data-analyze` through `Knowledge`.
- Hub: hover lines about her day; `time_together` in the activity list with the pastime picker.
- CMDR dossier: the commander's skills in her hobbies (descriptors).
- Wizard and dossier: the TEMPERAMENT block (three fields, locks).

## 8. Memory check (CLAUDE.md rule)

- `life_event` → a fact written at its site (no `memoryRules` entry); shared → `Knowledge` turns it known to the commander.
- `opinion_voiced` → the commander's `Knowledge` fact at its site; `opinion_changed` → a `memoryRules` entry (audience: her and the commander, importance low, spread none).
- `first_moment` → `memoryRules` entries `first_<kind>` (audience: the pair, importance by kind, spread none).
- `hobby_milestone` → a fact at its site; `hobby_started`, `hobby_dropped`, `hobby_mastered` → facts at their sites (audience: her; the commander learns them when they are told); a skill she taught the commander → `memoryRules` entry `taught_commander` (audience: her, importance low). The queue, interest and plateaus: bookkeeping.
- `joke_returned`, counters, cooldowns: bookkeeping.
- Journal: new relation events (`time_together`, `first_moment`) get `eventDeltas[].journal`. Chronicle: none. Prompt: news, opinions and jokes are triggered directives (§0), not a `memory` provider.

## 9. Directives, intents, events, actions

- Directives (`life:`-prefixed, derived, never stored): `life:news:<unitId>`, `life:opinion:<unitId>`, `life:joke:<unitId>`, `life:pastime:<unitId>`, the temperament word in her block. Keep away from the prefixes P9, P9b, P9c, P9d, P9e, P11, P12, P13 and `development:` reserve.
- Intents: `news_told`, `hobby_praised`, `opinion_voiced`, `opinion_challenged`, `opinion_agreed`, `first_moment`, `joke_returned` (each offered only while there is something it can be about).
- Events: `life_event`, `life_shared`, `news_queued`, `news_delivered`, `news_stale`, `hobby_started`, `hobby_progress`, `hobby_plateau`, `hobby_breakthrough`, `hobby_milestone`, `hobby_cooling`, `hobby_dropped`, `hobby_rekindled`, `hobby_mastered`, `opinion_formed`, `opinion_voiced`, `opinion_changed`, `opinion_hardened`, `time_together`, `first_moment`, `joke_returned`.
- Actions: `life/time_together { unitId, pastimeId }`, `profile/set_temperament`, `profile/set_hobbies`, `profile/set_opinion` (edit lock).
- Sites (P14): `profile.temperament` (inside `profile_import`), `opinion.form`, `life.share`, `life.trace`.

## TUNING draft

| what | value |
|---|---|
| life events | `lifeEventFrequency` (SYS › World): rare 0.5 / normal 1 / often 2 a week per woman (normal ≈ 4–5 a month, ≈ 20–22 for five women); at most 1 a day and 1 `notable` a week; cooldown per kind per woman: small 21 days, notable 45, `vat_day` a fiction year; the same kind across the squad: 5 days; share chance: `talkative` 0.7, `terse` 0.4, `silent` 0.15, × (Affinity ≥ 40 ? 1 : 0.5) |
| news directive | lives until her next scene or 3 days |
| hobby skill | +1 per practice slot × aptitude (low 0.5, standard 1, high 1.6) × interest / 60 (cap 1.3); milestones 10 / 30 / 60 / 100, each ±15 % per woman and hobby; plateau at 70 % of each step, breakthrough chance per practice slot 0.06 (× aptitude); low aptitude caps at 60; decay of a dropped hobby 1 a week down to its last milestone; standard aptitude reaches the first milestone in about 2 weeks and mastery in 4–6 months, high in 2–3 |
| hobby interest | novelty +3 a week for the first 3 weeks; milestone +15; push or praise +8; sharing +5; plateau −4 a week; stress ≥ 50 −3 a week; a newer hobby −2 a week; ceiling reached −10 once; `cooling` < 25; `dropped` after 30 days cooling; back to `active` at ≥ 40; picking up a friend's hobby: 0.02 per shared leisure slot |
| news queue | squad-wide: rare 1 per 2 days, normal 1 a day, often 2 a day; hobby items 2 a week; one woman at most every 2 days; no two items of one category in a row; stale after 7 days → a passing mention |
| opinions | one voiced per scene at most; cooldown 21 days per topic; `persuadeAt` 3 major or 6 minor challenges (×2 for `strong`); hardening chance for `strong` 0.5 |
| quiet meeting | Affinity +2 (diminishing like P2 `rest`), her stress −5; once a day per woman |
| running joke | becomes a habit after 3 returns within 30 days; `humor` frequency: `warm` 1, `mocking` 1, `dry` 0.6, `none` 0 |

## Acceptance criteria

1. With no named unit, nothing runs; every seeded test stays byte-identical (no rng draw: picks are hashed).
2. Temperament imports, validates, edits, locks and defaults for old saves; every reader goes through `temperamentOf`.
3. Life events are picked by hash under the caps, written as hidden facts, shared by DM, hub line or news by her temperament, and voiced at most once.
4. Hobbies follow the cycle of §3: aptitude (2–3 high, 2–3 low), skill with shifted thresholds, plateaus and breakthroughs, the low-aptitude ceiling, interest with `cooling` and `dropped`, new hobbies from events and friends, at most three active; nothing stops at mastery. Traces, the commander's hobby skill and teaching work.
4b. The news queue delivers at most its caps (one item a day squad-wide at normal, two hobby items a week, one woman every two days), never two items of a category in a row, turns stale items into passing mentions, and lets hub lines, player-caused breakthroughs and urgent events through; a seeded month of five women shows no week with more than two hobby items.
5. Strong opinions import; lazy opinions form once per topic and never change outside §4.4; at most one topic per scene, with cooldowns; heard opinions appear in THOUGHTS through `Knowledge`.
6. Challenges move a position one adjacent step past the threshold, or harden a strong one; history is kept.
7. `time_together` runs a pastime scene with general moments only, small effects, firsts accepted once per pair.
8. No directive of this package stands in the prompt after it was voiced (§0); a test sends a voiced intent and expects the directive gone.
9. Every new element carries `data-analyze`; every generation goes through P14; the memory verdicts of §8 are implemented.

## Open decisions (author)

- Every description and fallback line in `docs/content/life.md`; the topic list itself (add, cut, regroup); positions' wording.
- Whether opinions may drift through P14b's weekly review too (draft: no, only through §4.4).

## Interfaces to be provided to P15–P17e

- `temperamentOf(state, unitId)`; P15 §16.7 and P15a §16.1 read `talkativeness`, P17d reads `volatility`, P16 reads `humor`.
- `pastimes` as the ordinary meeting; P15a adds pair activities to them; P15 §16.3 counts quiet meetings as value outside the dynamic for Regard.
- The prompt-hygiene rule (§0) for every 0.2 directive.

## Interfaces already provided by P14b (implemented — use, do not rebuild)

- `Development.counters` with key kinds (`activity:<id>`, `companion:<id>`, `region:<id>`; add `hobby:<id>` and `joke` with a registry `counter.kind`), `checkHabits` / `habitEffect`, `recordAppraisal` for a challenge, accumulators and quiet development moments (`DevMoment`, shown at `scene/end`; directive `development:<unitId>`). The effective profile readers (`valuesOf`, …): an opinion's default position reads values through `valuesOf`. No rng draw anywhere (chances are `fnv1a`).

## Interfaces already provided by P14 (implemented — use, do not rebuild)

- Every model call goes through `app.generations`; a new site is a `SiteDecl` in `src/llm/sites.ts` with its handlers bound by the owning controller; a retried value goes through the same sanitizer and action and draws no rng.

## Implemented as

Four chunks: (a) state, content, temperament, import and the day step; (b) hobbies, the news queue and the controller; (c) the seven intent types, opinions, the `opinion_form` call, persuasion and running jokes; (d) quiet meetings, first moments, the player's view, the readings and the guards. Automated tests at the end: **531 files, 8136 tests, all passing** (the baseline before P14c was 502 files and 7577 tests). The plan's rulings (`docs/plans/2026-11-20-p14c-her-life.md`, "Where the plan rules on the spec") are binding where this section does not say otherwise; the answers the user gave on 2026-11-20 are marked **(user)**.

### The rulings (copied from the plan)

- **Setting.** `state.settings.lifeEvents` is `off | rare | normal | often`; absent or invalid = **off** (`lifeMode`) and byte-identical (an old save, every test campaign built without it). The spec's name `lifeEventFrequency` is `lifeEvents`. `SetupResult.lifeEvents?` is written into `settings` only when present (and starts the block with the setup seed as the salt); the wizard sends the player's choice (default `normal`, section LIFE EVENTS of the WORLD PARAMETERS step, `Wizard.setLifeEvents`); SYS › World › *Life events (this campaign)* dispatches `life/set_frequency`. Turning it off keeps what was written and stops every new pick, practice, queueing, forming and offer.
- **No rng draw, ever.** Every chance is `lifeChance(life, key, p)` = `fnv1a(<salt>|<key>) % 1000 < round(p × 1000)`; every pick is `lifeHash(...) % n` over a registry-ordered list. `life.salt` is the setup seed, or `fnv1a(JSON.stringify(state.rng))` when `life/set_frequency` first turns it on (the rng is read, never drawn from). `tests/life/unaffected.test.ts` pins a seeded week at `rare`, `normal` and `often` to the rng of the same week with the setting absent, and the week with `off` to the week without it.
- **Grunts have none of it.** Only `kind === 'named'` living units at the base take part (`takesPart`): no temperament, hobbies, opinions or events for a grunt; a squad of grunts runs nothing.
- **Prompt hygiene (§0).** News, opinions, jokes and pastimes reach the main model only as derived `life:` directives (`life:news:`, `life:opinion:`, `life:joke:`, `life:pastime:` + `<unitId>`, `expiresAfter: 'scene'`), set while a trigger holds, worded "if it fits, … once", and gone after `intent_extract` reports the item voiced (`news_told`, `opinion_voiced`, `joke_returned`), after the scene, or after their days. A life fact the commander has not been told carries the tag `untold` and `hiddenFromCommander`; `retrieveFacts` skips `untold`, so no prompt reads it. The only standing addition is the three temperament words in her line of the `units` block (only while life is not off).
- **No pronoun for the commander** in any text a player or the model reads (`tests/content/pronouns.test.ts`, its `FILES` list gained the new source files). The soldiers are "she".
- **Read by field or type, never by id:** life events by `requires` / `share` / `size` / `category` / `becomes`; hobbies by `locations` / `teachable` / `milestones[].trace`; topics by `group` / `axis` / `triggers`; pastimes by `locations` / `slots` / `requires` / `hobby` / `talk`; rooms by `sceneLocationId`; the quiet-hour activity by `pastime: true`. Code names no life event, hobby, topic or pastime id.
- **Temperament.** `temperamentOf(state, unitId)` is the only reader of `Unit.temperament` (stored fields over `terse` / `steady` / `dry`; a grunt or an unknown id reads the defaults); `tests/life/temperamentReaders.test.ts` fails on a `.temperament` read elsewhere (a line that must stay raw carries `// P14c: raw temperament`). A lock (`temperamentLocks`, `profile/lock_temperament`) means a re-sync never overwrites the field, a future drift never moves it and the field shows a padlock; `profile/set_temperament` refuses a patch that holds a locked field (the dossier sends one changed field at a time).
- **Memory check.**

  | what | verdict |
  |---|---|
  | `life_event` | A fact written at its site (about her, `knownBy [her]`, `hiddenFromCommander`, tags `life`, `untold`, the event id and its tags); no rule. Sharing reveals it (`revealFact`). A `keeps` event is never revealed in P14c. |
  | `hobby_milestone`, `hobby_started`, `hobby_dropped`, `hobby_mastered` | Facts at their sites (hidden until told); no rule. Mastery also writes the squad fact "the base's {label} hand" (hidden and `untold` until the `mastered` item is told, then known to every named soldier). |
  | `opinion_voiced` | A fact at its site, known to the commander ("{Name}'s view on {label}: …"); no rule. |
  | `opinion_changed` | `memoryRules` entry `opinion_changed` (audience her, importance 1, spread none) + resolver `opinion_changed`. |
  | `opinion_hardened` | A fact at its site ("will not change her mind about X"); no rule. |
  | `first_moment_kept` | Six `memoryRules` entries `first_<kind>` (`when: { kind }`; audience her, about her, spread none; importance `cried` / `told_her_past` 3, the rest 2) + resolver `first_moment_kept` (`ids { her }`, `vars { name, kind }`). |
  | `hobby_taught` | `memoryRules` entry `taught_commander` (audience her, importance 1, spread none) + resolver `hobby_taught` (`ids { her }`, `vars { name, hobby }`), written the first time she teaches the commander a hobby. |
  | the queue, interest, skill, plateaus, cooldowns, `joke_counted`, `life_noted`, `news_*`, `pastime_set`, `topic_picked`, `temperament_set`, `hobbies_set`, `opinion_set`, `life_frequency_set` | Bookkeeping; no rule. |
  | journal | New relation events `time_together` and `first_moment` have `eventDeltas[].journal` phrases ("the commander spent a quiet hour with her", "a first between her and the commander"); the other five model-reportable types have rows with a journal phrase and zero deltas. |
  | chronicle | No new line. |
  | prompt | No new `memory` provider; directives only. |

  Facts a rule writes take `fr` ids and never move `memory.nextId` (tests pin it for `opinion_changed`, `taught_commander` and the six firsts).
- **Engine purity.** `src/engine/life/**` imports nothing from `src/llm`, `src/ui` or `src/st` (`tests/architecture.test.ts`); `life/state.ts` is a leaf (types and `TUNING` only, a private copy of FNV-1a that a test pins to `hub.ts`'s). `hub.ts` imports only the leaf.

### What P14c builds now and what waits (the hand-off table)

| spec line | P14c | completed by |
|---|---|---|
| practice in "her blocking activities" | practice from her derived whereabouts in the hobby's `locations` **(user)**; `hobbies[].activityIds` is stored and validated | **P15a** counts a slot whose blocking activity is in `activityIds` |
| `keeps` events surface through `memory_surfaces` | they stay hidden facts | **P15a** (`memory_surfaces`) |
| quiet meetings use general moment sources only | `pastimes[].momentSources` is stored with no reader | **P15a** |
| pair activities, the room's sensory pool | a directive line (`herActivity`, `commanderActivity`; `sensoryTag` is stored) | **P15a**, **P17d** |
| `prop` traces in her quarters | a line in her dossier's HOBBIES view ("in her quarters: …") | **P17c** layers |
| special events (`requiresAll`) | not built | overview §10, unscheduled |

### What the user answered (2026-11-20)

- **Practice from whereabouts.** A slot is practice when her `whereaboutAt` is `routine` in a room whose `sceneLocationId` is in one of her active hobbies' `locations` (and she is free, not in a run, not injured or restricted, stress < 70). `routineWeight` adds `TUNING.life.hobbyRoomWeight` (2, once) to such a room, only for a unit that has hobbies and only with life on, so a unit without hobbies has the same rooms as before. `whereaboutAt(state, reg, unitId, day, slot)` is `hub.ts`'s own placement with the day and the slot as parameters.
- **No weather.** `weather_mood` and `body_ache` lose their weather conditions (`body_ache` keeps `injured`); the pastime `rain_on_the_roof` is a plain roof pastime.
- **Places.** The existing locations plus one new scene location `laundry` (`locations.json`, three slots, no art, so P10c ends at the ASCII stage); `planRooms` `g_laundry` has `sceneLocationId: 'laundry'` and no hub room.
- **The DM rule.** A news item is a DM when the global setting `unitDms` is on (mirrored into `settings.unitDms` by the app through `campaign/set_unit_dms`, like `beatCooldownDays`; unknown = off) and either she is `talkative`, or Affinity ≥ 40 and `lifeChance(item|dm, 0.5)` passes; else a news directive; a milestone whose trace is a `note` is a note in her quarters.
- **Opinions and P14b (user default).** Opinions do not drift through the weekly review (no axis kind was added); a moved opinion is shown in THOUGHTS and is not a `DevMoment`.

### Rulings made while building

- **R1.** `news.ts` had `enqueue` from Task 6 (the share and the milestones need it before the delivery of Task 9); Task 9 added the rest.
- **R2.** The "directive gone after `news_told`" test of Task 10 drives `closeNews` and the refresh; the `intents/apply` path is asserted in Task 11.
- **R3.** `sunrise_roof` stays unreachable (the roof has no morning slot, and opening it would change `whereabouts`): an author item.
- **R4 (spec wins over the plan).** A shared practice slot (same active hobby, same room, the room not `perUnit`) gives, at most once per pair per 7-day week (`life.shared`), a push to ONE woman of the pair (the lower skill, a tie by `lifeHash`) and +5 sharing interest to both; the other gets no plateau break. Her own quarters are private: no shared slot and no friend contact there. The plan's "a push for both on every shared slot" turned every pair into masters in 45–68 days.
- **R5.** The mastery squad fact is written hidden and `untold` and revealed (with the `DevFact` of a trait, while development runs) when the `mastered` item is told, or at once when the commander was there (`caused`) or the event told it (`told`).
- **R6.** A second woman cannot reach the same milestone of the same hobby on the same day (`breakthrough` refuses; she waits for another slot or day). Spec §3: "two equally gifted women never reach a step on the same day".
- **R7.** The joke offer is, deduped and capped at 5: the scene's picked joke (if still jokeable), then the facts already in `jokes` within the window (last return first), then the newest eligible facts. Without it a running joke could be crowded out by newer facts and never close.
- **R8.** `returnJoke` sets `jokeDay` and clears `scene.joke` only when the returned fact is the picked one; any other return only counts.
- **R9.** The challenge/agree offer per woman is the voiced topics triggered in this scene plus her 5 most recently voiced; each carries her current position in words (known to the commander) and the prompt prints it.
- **The `opinion.form`, `flavor.life_share` and `flavor.life_trace` sites are reroll `none`**, not `free` as the plan said for `opinion.form` (P14 **Implemented as**: a site is `none` when nothing a retry could change exists): an opinion is formed once, and a delivered item is closed when it is told. A site that is `none` writes no quiet record when its fallback applies; a failure with no fallback still records.

### Decisions the plan did not make

- **Content (A1).** Text is US spelling (the spelling test enforces it); entry ids keep the draft's spelling, except three sub-ids restored to `favourite`, `armourer`, `favourites` (the spelling test skips values under the key `id`). Only an entry-level `description` carries `AUTHOR TO WRITE:`. Traces sit on milestone index 1 (the first kind) and 2 (the second); every `note` / `prop` trace needs the hobby's `traceText` (a refs check). Topic `label`, `description`, `keywords` (label words plus three or four synonyms, unique across topics), `locations` / `activities` only where obvious, `lifeEvents` = the events whose `becomes.opinionTopic` names it; `axis.sign` `-1` for "(− → first position)". Pastime `label`, `talk`, `sensoryTag`, `momentSources: []`. Positions are 2–5 in the schema (the axis needs ≥ 3 in refs). `dreamt_of_commander` is `keeps` with `keepsUnless { affinityMin 60, romantic }` (ANY of the two). Three fallback lines that speak of someone else are whitelisted in the pronoun test.
- **`requires` mappings (A1).** `found_something` → `location: [perimeter, garage]` (only the garage can match: `perimeter` has no hub room); `cried_alone` → `stressMin 60`; `good_sleep` → `stressMax 19`; `things_touched` → `otherNamed`; `ration_cut` → `rationsShort`; `grunt_lost` → `gruntDiedDays 7` (urgent); `anniversary_of_loss` → `deathAgo 30` (urgent; fires on days where `age ≥ n && age % n === 0`, deaths that predate turning life on are `old` and skipped); `hurt_in_training` → `activity: ['train']`; `late_night_talk` got `otherNamed`; `vat_day` is `yearly`.
- **Import (A2).** `validateUnit` / `profile/set_hobbies` check at most 3 aptitudes per list, known ids, disjoint (the 2–3 rule is the sanitizer's: it drops the aptitudes whole when either list ends with fewer than 2); an id in both lists is removed from both; the starting skill is `hash % milestoneAt(1)` (strictly below the second milestone); the starting hobbies are seeded by `seedLife` (only the new unit on `squad/add_named`, only the added ids on a re-sync, and everyone only when `life/set_frequency` creates the block, so off → on again never re-seeds); a re-sync replaces `aptitudes`, adds missing hobbies and never deletes a hobby's progress (≤ 3 active: the excess is cooled once, the older hobbies first); `opinions` replaces only a `strong` opinion never voiced and never moved; a **Reset life** checkbox deletes `hobbies`, `opinions` and `life.units[id]`. `profile/set_opinion` gives a new opinion `strong` and leaves no history. The dossier has no remove for an opinion (there is no action); the calibration editor does.
- **Day step (A2).** Yearly events take their day without the daily chance and the weekly allowance (they still count toward the week); the pick key is `<unit>|life|<day>|pick`; the fact text is "{Name}: {description}" (`addFact` dedupes by text and subject, so a second event of the same kind reuses the first fact, revealed or not); `becomes.hobby` starts a hobby at skill 0 / interest 50 (a hobby she has gets a push); `becomes.milestone` grants the next milestone as `told` (the event is the news); `opinionTopic` goes to `pendingTopics`; the roster of an activity is busy only when the activity has an effect with `target: 'roster'` (read by field: `rest`, `mess`); `life.shortageDay` is set by the day step from `calendar.shortageStreak`; a woman out on a run has no event.
- **Hobbies and the queue (B).** `DevFact` gained the `source` `'life'` and uses the existing kind `'skill'` (the plan said `trait`); restrictions for practice: any except a bench; `startHobby` from an `event` writes the fact (revealed with the event), from a `friend` a fact and a `started` item, from the `import` nothing; a rekindle works for a dropped hobby too; the "last category" and "same woman" rules ignore `caused` rows while the hobby week counts them; a directive's `until` is the delivery day + 3 (`news_stale` on expiry); `scene/end` drops all her pending news, `scene/abort` does not; an outbox item never expires (the controller words it when it can); `dm/receive` validates `lifeItemId` itself; a woman who is gone (dead, deserted, terminated, reassigned) has her items, outbox and news dropped at the next sweep and `life/share_done` / `life/trace_note` refuse her; placeholder first-person lines for a hobby taken up or put away live in the controller (`HOBBY_LINES`, marked AUTHOR TO WRITE).
- **Intents (C).** `LifeOffer.topics[]` carries `pick` (she may voice it now) and `voiced` (she has told it, so it may be argued or agreed with); `validateIntents` drops an id that was not offered for her, a bad `kind`, and a `positionId` outside the topic (the event is kept without it); the same item twice in one answer counts once; `news_told` on a hobby item also gives the hobby +5 (sharing); a `caused` milestone is revealed at once; a moved opinion drops her old words; the DM channel offers her pending news and hobbies only; the voicing pick runs at `scene/start` and again on a trigger or a formation; the new engine event `topic_picked { unitId }` makes the controller refresh the directives; `onCommanderLine` runs before the line is sent so the directive reaches the reply to it.
- **Quiet meetings (D).** `life/time_together` runs `runActivity` itself (a countermanded or overridden order spends nothing and stores nothing); `activity/do` refuses the `pastime: true` activity ("pick a pastime"), so a quiet hour has one door; `pastimeProblem` also asks `checkActivity` and `restrictionReason('companion', <the activity>)`, so a soldier with no leave has no quiet hour (`time_together` is not in `NOT_LEAVE`; `talk` and `medbay` are); `life.pending` is copied onto `SceneRecord.pastime` at the `scene/start` of the same woman, day and slot (origin `activity`), and deleted at any `scene/start` and at `calendar/cancel_scene`; `pastimeLocation(state, reg, pastime, unitId?)` takes the unit for `her_hobby` (her keenest hobby's locations); `availablePastimes(…, at?)` takes the scene's place and slot; her keenest hobby is the highest interest (a tie: registry order); the commander learns +2, or +4 when it is teachable and she has two milestones or more, and only the +4 (a real teaching) writes `hobby_taught`, once per hobby; a hobby breakthrough in the meeting is told at once (`caused`), and the directive says "She gets it right for the first time today." only when `plateauBreaks` holds; the pastime directive is `{opening} A quiet meeting with no stakes: {description}. {Name}: {her activity or hobby}; the commander: {commander activity}.`
- **First moments (D).** `LifeOffer.firstKinds` lists the kinds the pair has not had (`firsts` is true only while there is one), so the prompt's `FIRST_KIND` shows only those and validation drops a kind already had; `first_moment` joined `ROW_IS_CONDITIONAL`, so `keepFirst` applies the row (Affinity +2 through the gain handler, the journal phrase) only the first time; a repeat changes nothing.
- **The player's view (D).** `Knowledge.life(unitId, reg)` (a `LifeView`: `opinions` voiced, `hobbies` as told milestones + a word + traces, `told`, `commanderSkills`, `hub`, `temperWords`, `mode`) is built in `src/engine/life/known.ts`. A milestone is told when its fact is revealed (or it has no fact: a starting skill, known from her card) and no queue item still carries it; a hobby she took up off-screen is left out until it is told; `told` lists her revealed life facts (not her hobby facts), newest first, at most `TUNING.life.toldShown` (8). The word is `keen` from `TUNING.life.keenAt` (70) interest, else `steady`; `cooling` and `put away` follow the cycle. The hub line is the newest non-`keeps` event within `TUNING.life.hubDays` (2). With the edit lock on the dossier's hobby editor lists only the hobbies the commander knows and counts only told milestones. The CMDR card shows the commander's hobby words (`none` reads "NOT YET"). The views are headed THOUGHTS, WHAT SHE DOES and WHAT SHE HAS TOLD (the editors keep OPINIONS and HOBBIES). The OPS tab draws the quiet-hour card (a companion select and the picker) only with life on and `onTimeTogether` given; the hub room panel adds `[ TIME TOGETHER ]` (a `details` with the picker) and the line under her name; the scene screen adds `[ LET'S … ]` for a private scene with one named woman. A marker shows the hub line from `data-life-line` (CSS `::after`, no node, no animation). A `<summary>` that is analyzable carries `tabindex` (`analyzeAttrs`, not `analyzeNative`).
- **Readings (D).** Providers `opinionTopics`, `hobbies`, `lifeEvents`, `pastimes` (bare sources, with samples in `tests/helpers/analyze.ts`) and `glossary:temperament`, `glossary:setting_life_events`, `glossary:commander_hobby_skill` (`{ hobbyId? }`), `glossary:life_events` read through `Knowledge.life`. "Nothing she has said yet" and "Nothing she has shown yet" read the same for nothing and for something she has not said. The hidden fixture's joke count is **19**, not 7 (the memory preset reading says "after 7 days").

### Non-obvious things to know

- Every `life:` directive is derived from the state on each refresh and is gone once voiced; there is nothing to clear on a chat switch but `clearLifeDirectives`. The scene bookkeeping `LifeUnit.scene` is keyed by scene id and reset at `scene/start`, `scene/end` and `scene/abort`.
- `life_event` and `life_shared` carry the id of an event that may be untold or kept: no describe, toast, log, controller or provider reads either type (`tests/analysis/life.test.ts` scans `src` for them outside `src/engine/life`). The same holds for every `news_*`, `hobby_*` and `life_noted` event (no text, no ref).
- `retrieveFacts` skips the tag `untold`; any later reader of `memory.facts` that does not use it must skip the tag too (folding already skips `hiddenFromCommander`, and a revealed fact can be folded).
- `news_told` goes through `closeNews`, which reveals the fact and its `alsoFacts` and runs `revealMastery`; a DM or note reveals through `life/share_done` / `life/trace_note`. `life/share_done` runs `dm/receive` with `initiated` and `lifeItemId`; without the field `dm/receive` is byte-identical.
- The day step is one `dm_rumors` step, imported after `actions/development`: events, practice, friends, interest ticks and decay, the stale sweep, delivery last. `whereaboutAt` is computed once per woman and day within one pass (`placesOf` with a `DayPlaces` cache).
- `profile_import` sections (`temperament`, `hobbies` + `aptitudes`, `opinions`) are never added to `missing` and never critical; the prompt lists `HOBBIES` and `OPINION TOPICS` only when the section is asked for, and the pinned import prompt is byte-identical otherwise (`tests/fixtures/profile_import/prompt_without_life.txt`); the default `profile_import` budget is 1800 (a stored value stays).
- The pinned intent prompt (`tests/fixtures/intent_extract/prompt_without_reading.txt`) is byte-identical while nothing is offered; each of the seven types is offered only with its own non-empty list. A model-reportable type with nothing to report is not in the prompt.
- Hidden values (numeric skill and interest, plateau and ceiling, aptitudes with the edit lock on, the queue and its order, an untold or `keeps` event, an unvoiced opinion, persuasion pressure, joke counts) never reach a panel, toast, event text or reading; sentinels are in `tests/fixtures/analyze/hidden.ts`. `Knowledge.life` names its temperament field `temperWords` so the readers guard (`.temperament`) stays simple.
- A `her_hobby` quiet hour is practice plus a push for her keenest hobby; its breakthrough counts toward the hobby-week cap (`delivered` gets a `caused` row) but is told in the scene, not queued.
- `plateauBreaks` and `reachedToday` are the one definition of "a push would break her plateau"; the pastime directive uses it so the line is true when the meeting ends.
- `seedLife` runs when life is first turned on, not every time the frequency changes; a hobby added later starts at skill 0.

### Open items

- **Pace (AUTHOR TO TUNE).** The plan's targets for a standard-aptitude woman were not met and no `TUNING.life` value was changed. Mastery by day 120 is **68 % in the squad run**, **100 % for a pair sharing a hobby (days 54–84)** and **30–47 % for a woman alone**, against ≤ 20 %; the first milestone has a median of **21 days in the squad** and **22–25 alone**, against 8–20 (the pair meets it); **6 of 60** standard squad women never reach a first milestone in 120 days (a friend's hobby takes the slots). `tests/engine/life/hobbyCycle.test.ts` holds these as `it.fails` plus pinned numbers; they flip to plain `it` once the pace is tuned into the targets. Levers: `hobbyRoomWeight`, `interest.milestone`, `interest.share`, `breakthrough`, the milestone thresholds, the 2 % friend chance.
- **Texts and draft data.** Every `description` and fallback line in `docs/content/life.md`'s four registries, the topic list and the position wording, the `triggers` of the 65 topics (the author wrote none: `keywords` are the label words plus synonyms, with over-common words left out), the six `first_<kind>` and the `taught_commander` fact texts, the directive wordings and the LIFE EVENTS section text are `AUTHOR TO WRITE`; `TUNING.life` is `AUTHOR TO TUNE`.
- **Reduced `requires` of seven events** (the draft's conditions do not exist in state): `gift_from_unit` needs only `otherNamed` (no NPC–NPC relations), `nightmare` `stressMin 40` (no night defect tags), `memory_flash` `trustMin 60`, `firmware_glitch` `defectCategory: 'cybernetic'`, `restless_before_run` `missionBoard`, `old_photo` `afterRun` (regions have no "ruined" tag), `firmware_update` `activity: ['medbay']`. Plus the weather conditions of `weather_mood` and `body_ache`, dropped for the user's no-weather ruling (a package that adds weather can restore them).
- **`keeps` events and `momentSources`** wait for P15a (`memory_surfaces`, general moment sources); `hobbies[].activityIds` waits for P15a's blocking activities; `prop` traces wait for P17c's layers; special events (`requiresAll`) are unscheduled (overview §10).
- **`sunrise_roof` is unreachable** (the roof has no morning slot): the author opens the roof in the morning or moves the pastime. The `g_laundry` plan room still says it is not open yet; `laundry` is in the scene location picker (a normal scene can be held there). `found_something` can only match in the garage.
- **Content details.** `music` has two traces with one `traceText`; `LifeEventSchema.tags` is optional and `positions` min 2 (the ruling says 3–5); high-frequency topic keywords are a tuning item; the memory table lines for `temperament_set` and `life_frequency_set` are bookkeeping.
- **Opinions are not in P14b's weekly review** (the user's default); a package that wants them to drift adds an axis kind.
- **Smaller items.** A raw-setting edge: `settings.lifeEvents` written without `life/set_frequency` records old deaths as recent and seeds nothing until the first day end (tests and hand-edited saves only); `DevFact` uses the kind `skill` (the plan said `trait`); an urgent waiting item bypasses the caps within 7 days; the controller does not re-check `unitDms` at wording time; "no woman twice within 2 days" is read as not on consecutive days; `pickJoke` checks that the fact exists, not that it is still jokeable; a woman who dies keeps her queue items ten days before they go; the calibration and the dossier still draw the hobby blocks while life is off; the dossier's OPINIONS editor and the new THOUGHTS view are both drawn (the editor is the control, the view is what was told); a hobby `breakthrough` of `NewsItem.what` is never used (a breakthrough grants a milestone); `LIFE_INTENT_TYPES` in `intents.ts` is an unused duplicate of `LIFE_EVENT_TYPES`; the refusal check in `breakthrough` reads `o.milestones.length > n` where `=== n + 1` would be exact; `src/setup/profile.ts` imports `engine/actions/squad` for `RESYNC_SECTIONS` (a side-effect import).
- **The hub line is passive.** The hub line shows the newest event even when she never shares it (a hub line is passive by design); a `keeps` event never gets one.

### Interfaces provided to later packages

- `temperamentOf(state, unitId)` and `TEMPERAMENT_DEFAULTS` (read `talkativeness`, `volatility`, `humor` only through it); `Unit.temperamentLocks`.
- Quiet meetings: registry `pastimes` (`talk`, `herActivity`, `commanderActivity`, `sensoryTag`, `momentSources`), `pastimeProblem`, `availablePastimes`, `pastimeLocation`, `finishMeeting`, `life/time_together`, `life/pastime_in_scene`, `SceneRecord.pastime`, directive `life:pastime:<unitId>`, `app.life.timeTogether`.
- `hobbies[].activityIds`, `HobbyState`, `keenestHobby`, `plateauBreaks`, `Commander.hobbySkill`, `commanderHobbyWord`; `whereaboutAt`; `LifeState.busy` (who was with the commander in which slot).
- Facts: the tag `untold`, `writeLifeFact`, `revealFact`; `keeps` events are facts with `hiddenFromCommander` that nothing reveals; `Knowledge.life`.
- The prompt-hygiene rule (§0) and `lifeChance` / `lifeHash` for any new hash-picked chance.
