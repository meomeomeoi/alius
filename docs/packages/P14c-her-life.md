# P14c — Her Life: Days Off-Screen, Hobbies, Opinions, Quiet Meetings

**Status: spec.** Release 0.2 (post-release), **the first package of 0.2** (before P15a): it does not need the dynamic and serves every named woman. **Depends on:** P2 (activities, slots, companions), P3 (scenes, intents, facts, DMs), P3b (memory rules, `Knowledge`, dossiers, the memory share), P8 (values axes), P10 (hub, whereabouts, voices), P10b (living DMs, notes, handwriting), P14 (generation envelope), P14b (counters, appraisal, accumulators, the effective profile), P7a. **Read:** overview; this file; `docs/content/life.md` (the draft content); the **Implemented as** of P3b, P10b and P14b; `docs/content/lore.md` (§0).

**Analysis tool (P7a):** every new stat, chip, option and card carries `data-analyze`, has a glossary entry or registry `description`, and live values get a provider that reads through `Knowledge`. **P14:** every generation registers a site. **Lore §0:** no pronoun for the commander in any registry text, directive or label.

Origin: the 2026-11-20 design session. 0.2 builds a deep, mostly physical dynamic; this package gives the women a life that does not revolve around the commander, so that they are interesting beyond trials and rituals. Author ruling: **quiet meetings are the ordinary meeting**; the dynamic's stagings are the deviation for particular pairs.

## Goal

- **Her own days:** small things happen to her whether the commander is there or not, and she may tell about them.
- **Her hobbies grow:** what she does in her free time accumulates (a book finished, a plant in flower, a song learned) and leaves traces.
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
- **Sharing**, by her `talkativeness`, Affinity and the event's `share`:
  - a **DM** from her (P10b living DM; the text is a `flavor` line from the event and her card, site `life.share`, budget 120; fallback the event's description line);
  - a **hub line**: hovering her on the hub shows a short line about her day (the "living hub" idea of overview §10);
  - **news** she brings to the next scene with her: a once-directive (`life:news:<unitId>`, "she has news: …; she brings it up only if it fits, once"); `intent_extract` reports `news_told { eventId }` and the directive goes.
- `keeps` events are hers alone; they surface only through a P15a `memory_surfaces` moment or never.
- `becomes` links an event to a hobby milestone (§3) or opens an opinion topic for her (§4): she finished a book, so she now has a view on it.

## 3. Hobbies as projects

Registry `hobbies` (draft: 27 hobbies with wording in `docs/content/life.md` §3): `{ id, activityIds (her blocking activities, P15a), milestones: [{ at, id, line, trace?: 'note' | 'prop' | 'opinion' }], teachable: boolean, description, traceText? }`. A milestone's `line` is her fallback words; the model words the moment.

- `Unit.hobbies`: 1–3 ids proposed by `profile_import` from the card, editable.
- **Progress:** whereabouts that put her in a hobby activity (leisure slots) add to a counter (P14b `Development.counters`, key kind `hobby:<id>`; a new `counter.kind`). Milestones fire at thresholds (`TUNING.life.hobbyStep`).
- **Milestones mark her confidence and skill**, not gifts to the commander; a portrait, a poem or a carving given to the commander is a later **special event** (overview §10).
- **Traces:** `note` — a P10b note in her hand (a drawing, a poem, a page of her journal, as a `paper` card; the text from site `life.trace`, budget 150, fallback authored); `prop` — an object in her quarters (P17c layers when they exist; until then a line in the QUARTERS section of her dossier); `opinion` — a new topic for her (§4).
- **Together:** the commander may join her hobby as a pastime of a quiet meeting (§5). The commander gains a skill in her hobby (`Commander.hobbySkill[hobbyId]`: descriptors, no number shown); with `teachable` she teaches it: her explanations are a pastime moment and grow the skill faster. A woman who taught the commander something remembers it (`memoryRules`, §8).

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
- `hobby_milestone` → a fact at its site; a skill she taught the commander → `memoryRules` entry `taught_commander` (audience: her, importance low).
- `joke_returned`, counters, cooldowns: bookkeeping.
- Journal: new relation events (`time_together`, `first_moment`) get `eventDeltas[].journal`. Chronicle: none. Prompt: news, opinions and jokes are triggered directives (§0), not a `memory` provider.

## 9. Directives, intents, events, actions

- Directives (`life:`-prefixed, derived, never stored): `life:news:<unitId>`, `life:opinion:<unitId>`, `life:joke:<unitId>`, `life:pastime:<unitId>`, the temperament word in her block. Keep away from the prefixes P9, P9b, P9c, P9d, P9e, P11, P12, P13 and `development:` reserve.
- Intents: `news_told`, `opinion_voiced`, `opinion_challenged`, `opinion_agreed`, `first_moment`, `joke_returned` (each offered only while there is something it can be about).
- Events: `life_event`, `life_shared`, `hobby_progress`, `hobby_milestone`, `opinion_formed`, `opinion_voiced`, `opinion_changed`, `opinion_hardened`, `time_together`, `first_moment`, `joke_returned`.
- Actions: `life/time_together { unitId, pastimeId }`, `profile/set_temperament`, `profile/set_hobbies`, `profile/set_opinion` (edit lock).
- Sites (P14): `profile.temperament` (inside `profile_import`), `opinion.form`, `life.share`, `life.trace`.

## TUNING draft

| what | value |
|---|---|
| life events | `lifeEventFrequency` (SYS › World): rare 0.5 / normal 1 / often 2 a week per woman (normal ≈ 4–5 a month, ≈ 20–22 for five women); at most 1 a day and 1 `notable` a week; cooldown per kind per woman: small 21 days, notable 45, `vat_day` a fiction year; the same kind across the squad: 5 days; share chance: `talkative` 0.7, `terse` 0.4, `silent` 0.15, × (Affinity ≥ 40 ? 1 : 0.5) |
| news directive | lives until her next scene or 3 days |
| hobby | +1 per leisure slot in a hobby activity; milestones at 5 / 15 / 30 / 60 |
| opinions | one voiced per scene at most; cooldown 21 days per topic; `persuadeAt` 3 major or 6 minor challenges (×2 for `strong`); hardening chance for `strong` 0.5 |
| quiet meeting | Affinity +2 (diminishing like P2 `rest`), her stress −5; once a day per woman |
| running joke | becomes a habit after 3 returns within 30 days; `humor` frequency: `warm` 1, `mocking` 1, `dry` 0.6, `none` 0 |

## Acceptance criteria

1. With no named unit, nothing runs; every seeded test stays byte-identical (no rng draw: picks are hashed).
2. Temperament imports, validates, edits, locks and defaults for old saves; every reader goes through `temperamentOf`.
3. Life events are picked by hash under the caps, written as hidden facts, shared by DM, hub line or news by her temperament, and voiced at most once.
4. Hobbies progress from whereabouts, fire milestones, leave notes, props and opinion topics; the commander's hobby skill grows; teaching works.
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
