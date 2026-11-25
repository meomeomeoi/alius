# P17g — Worship Customs: Praise with Memory, Shrines, Relics, Rites, Traces, Her Defect, the Token, the Vow

**Status: spec.** Release 0.2 (post-release), after P17e and before P17f. **Depends on:**
- the dynamic: P15 (`bond.practice`, styles, frames, the vow milestone, Regard, the body map §15.9, compromat §11);
- practices and craft: P16 (rules, offences, `rateService`), P16b (praise for `regal`, mastery per worship target, her foot language, unasked care);
- her body and things: P17a (inspections), P17b (worn items in their harder forms), P17d (her scent, worn things, washing), P17e (emergent rituals, habits of the pair, the chosen address);
- her life and development: P14b (development, the axis kinds `practice` and `expect`), P14c (her life, first moments), P15b (manner axes);
- the stage: P10d (plan marks), P10e (e) (the instruments: `saturation`, foot and shoe service, the dirt of her day);
- the rest of the game: P9c (access to her quarters, courtship and `claimed`), P5 (runs), P7 (commander stress), P8 / P6 (defects), P3b (memory), P14, P7a.

**Read:** overview; `docs/drafts/2026-11-25-worship-customs.md` (the design session this spec comes from); the **Implemented as** of P15, P16, P10e and, once built, P16b, P17d, P17e; this file.

**Analysis tool (P7a)** and **P14** rules apply. Hidden values (which custom she is drawn to next, the hash of her pick, a custom's growth before it shows, the shrine state of a zone before it is consecrated) are sentinels in `tests/fixtures/analyze/hidden.ts`. **Lore §0:** no pronoun for the commander, no feeling of the commander, in any text a player or the model reads.

Origin: the design session of 2026-11-25 with the author.

## Goal

Worship of the commander toward her, in any form, one to one, grows into **customs** of the pair: praise that remembers, places of her body that become shrines, her things kept as relics, rites at her returns, worship of what she leaves behind and of what the corporation calls her defect, her token on a run, a vow to serve only her.

**Not all at once, and not all in every dynamic** (author): each holder grows a few customs that fit her, one at a time, and they fade when neglected. The squad's other women are at most witnesses: there is no court and no retinue. `regal` is the style that wants worship most, but any holder may grow customs; her haughtiness shows through P15b's manner axes, not a new number.

## 0. Principles

- **Nothing is built twice.** Each custom extends a mechanic that exists or is specified, and says which one (the draft lists them). Rituals stay P17e's, worn things stay P17d's, mastery stays P16b's, the body map stays P15's.
- **Read, never store, what is already known.** Her attitude to a category and its drift are read through `practiceOf` (P15 `bond.practice.categories[id].as` / `witness`) and P14b's development (the axis kinds `practice` and `expect`); her manner through P15b. No new profile field.
- **Off is byte-identical.**
  - No custom exists unless the dynamic is on and the campaign has customs (`DynamicSetup.customs`); a campaign without them is untouched.
  - No rng draw: every pick is `dynamicHash`, every chance `dynamicRoll`.
  - A seeded test that moves stops and reports.
- **Pacing is part of the design:** a custom is introduced by her doing it first, not by a tutorial; at most one new custom a fiction week; a done rite is not offered again the same day; nothing repeats on every exchange.

## 1. The frame of customs

### 1.1 The registry

`worshipCustoms` entries: `{ id, label, description, kind, needs, weight, frameMin, pace, promptHint }`.
- `kind`: `praise` | `shrine` | `relic` | `rite` | `trace` | `acceptance` | `defect` | `token` | `vow` (read by kind, never by id).
- `needs`:
  - `categories?: Array<{ id, as: 'enjoys' | 'craves' }>`
  - `styles?: Style[]`
  - `manner?: Partial<Record<Axis, [min, max]>>`
  - `audience?: Audience[]`
  - `defect?: true`
  - `content?: categoryIds` (all enabled)
- `weight`: how strongly a fitting holder is drawn to it (style rows may scale it: `regal` ×2 for every `praise` / `shrine` / `relic`).
- `frameMin`: `play` | `role` | `rule`.
- `pace`: `{ perDay?: number; anchor?: 'return' | 'wake' | 'bed' | 'slot' }`.

### 1.2 Which customs she grows

- **Eligible:** the custom's `needs` hold for her, read through `practiceOf`, P15b's axes and her defects, and the campaign allows it (§1.4).
- **Active:** at most **K** at a time. K is a setting per frame, default `play` 1, `role` 2, `rule` 3 (author), scaled by the campaign's density (`few` ×0.5 rounded down, at least 1; `normal` ×1; `many` +1). Her **next** custom is the eligible one with the highest `weight × (1 + dynamicHash(state, unitId, 'custom:' + id) / 4)` (hidden).
- **Introduced:** when a slot is free, her frame is at least `frameMin`, and at least 7 fiction days have passed since her last new custom. Her next custom comes through a **first moment**: she does it for the first time in a scene (a P15a moment source `custom_first`, or a P14c first moment), with her line.
  - The custom becomes active when the moment is answered and the engine accepts it. A refusal leaves it eligible with a 14-day cooldown.
  - The analysis tool explains it after it first happened, never before.
- **Fading:** a custom she stops being able to want fades. That happens when its `needs` no longer hold because her attitude drifted (P14b) or the category was switched off, or when it is neglected (its own measure, P17e's fading). It is gone after 14 days without upkeep, with her line once, and frees its slot.
- **The player's hand:** her dossier's PRACTICE block lists her active customs (and nothing of what is coming). While the edit lock allows it, the player may **swap** one for another eligible custom, introduced the usual way.

### 1.3 State

`Relation.dynamic.customs?: { active: Array<{ id; since: number; lastKept?: number; data? }>; lastNewDay?: number; cooldown?: Record<string, number> }`. Absent until something is written. `src/engine/customs/state.ts` is a leaf.

### 1.4 Settings

`DynamicSetup.customs?: { enabled: 'all' | string[]; density: 'few' | 'normal' | 'many'; perFrame: { play: number; role: number; rule: number } }`.
- It is chosen in WORLD PARAMETERS › DYNAMIC at creation and editable in SYS › Dynamic: a toggle per custom, like the content categories, plus the density and K per frame.
- Absent = customs off (byte-identical). A new campaign with the dynamic on gets `{ enabled: 'all', density: 'normal', perFrame: { play: 1, role: 2, rule: 3 } }`.

### 1.5 Prompt

Each active custom may add one `customs:` directive, derived from state:
- triggered and worded "if it fits, … once";
- gone once voiced;
- never more than one custom's directive a reply (P14c's hygiene rule).

A custom not yet introduced never reaches a prompt.

## 2. The customs

### 2.1 Praise with memory (`praise`)
- **Extends** P16b's daily praise of `regal` (repeats rejected by a local similarity check) to any holder whose custom it is.
- **Weight by what it is about:** praise that names something true of her, read through `Knowledge` (her kills in the last run, her hobby's project, a new scar, what she said yesterday), counts more. The engine matches the praise's words against her known facts and recent events: a local token overlap, no model.
- **Praise of something that did not happen is seen through:** at once by a `clinical` or curious holder (P15b `curiosity` ≥ +1), later by others.
- **Kept lines:** her favourite lines (the best match of a week) are kept as facts and quoted back (a directive, at most once a week).
- **The devotion journal** (§2.1a, same custom): the commander may write about her in a journal (typed). She reads it at night and answers in the margins in her hand (P10b notes); the lines she keeps are the same facts.

### 2.2 The shrine map (`shrine`)
- **Extends** P15's body map (zones from `worshipTargets`) and P16b's mastery per worship target.
- A zone's **shrine state**: ordinary → known (mastery level 2, as today) → favoured (her `pleased` verdicts on acts there) → **consecrated** (a rite there she called by name). The state rises at most once a scene a zone, only from her verdict.
- **A consecrated zone:**
  - is marked on the body map with her sign;
  - a careless touch of it outside worship is her offence (`noteOffence`, kind `shrine_slighted`, minor);
  - her expectation to greet it is a P17e ritual, not new machinery.

### 2.3 Relics (`relic`)
- **Extends** P17d's worn things (scent per item, fading one band per two days; given as a gift, a reward or a task) and P17b's harder forms.
- **New kinds:** worn **footwear** and **underwear** join P17d's item kinds (underwear needs `worship` and `explicit_scenes`).
- **Consecration:** a worn thing handed over in a small rite (a first moment) becomes a relic. Washing it is her offence (`relic_washed`); losing it, her reaction by style.
- **Worship of a relic alone:** the `saturation` instrument (P10e (e)) in a **relic mode**.
  - The thing instead of her body; the same vocabulary and head of words.
  - The thing's places stand for hers (a boot: the shaft, the insole, the toe; underwear by its kind).
  - Her scent's band is the item's (P17d).
- **Her check:** she asks for it back now and then, or smells it; its scent band tells how it was kept.
- **Found:** an inspection of the commander's quarters (P17a) finds it: compromat (P15 §11, at the inspection's site).

### 2.4 Rites and worship in her absence (`rite`)
- **Extends** P17e's emergent rituals and habits of the pair with **anchors**: her return from a run, her waking, her going to bed (`pace.anchor`).
- **Her return:** the commander waits at the garage when the run comes back. Her boots come off (the activity `taking_off_boots`) and her feet are washed or cleaned, the foot or shoe service instrument with the dirt of her run's region (P10e (e)'s `dirtOfDay`).
- **Worship in her absence:** while she is away (a run, a duty), her bed or her boots by the door, with access to her quarters (P9c). She learns of it afterwards from the traces it left (§2.5) or a note.
- **Pacing:** one rite per anchor event; at most `pace.perDay` offered rites a fiction day (default 2 across all customs); a rite done today is not offered again; rites come up at slot boundaries, never on an exchange.

### 2.5 Traces (`trace`)
- **Extends** P17d's scent in rooms.
- **Visible traces as plan marks** (`registerPlanMarks`, P10d) for a few hours, derived from her whereabouts and activities (no rng, no store): where she sat, a footprint with her day's dirt, her lips on a glass, her hair on the pillow.
- **A worship act toward a trace:** a short scene or a chip in that room.
- The commander's own traces after worship in her absence (§2.4) are marks she reads.

### 2.6 Accepting worship, in her body (`acceptance`)
- **Extends** P15's offer composer (outcomes accepted / corrected / mocked / refused / tonight) and P16b's foot language.
- To an unasked act of worship in a scene she answers **with her body inside the instrument**: she presents her foot, draws it away, holds it there or corrects it, the picture moving as in foot service. The outcome is the composer's; only its form changes.
- Her haughtiness (P15b `warmth` ≤ −1 or `voice` ≤ −1) answers with fewer words and more gesture.

### 2.7 The shrine of her defect (`defect`)
- **Lore:** the squad are off-spec units; the corporation calls them defective.
- **Needs** a defect of hers (P8 / P6), and her trust above a floor.
- The commander worships what the corporation calls her defect: a scar, an implant port, a Bloom mark, a glitch.
  - The first time is a moment of hers (it may be refused).
  - Afterwards: her stress from the defect falls, its breakdowns soften, how she sees herself moves (a P14b development moment), and Regard rises (`value`).
- **Memory:** the first worship of her defect is a fact (§4).

### 2.8 Her token on a run (`token`)
- Before a run she marks the commander with a kiss, a thing of hers or her scent. It is chosen on the expedition's launch screen; she offers it when the custom is hers.
- **On the run:** the token steadies the commander (commander stress, P7, a small relief per node).
- **Without it:** going out without it, once the custom is active, raises the commander's stress before the first fight and earns her reaction when the run comes back.
- It is the first link between combat and worship.

### 2.9 The vow of exclusivity (`vow`)
- A form of P15's vow milestone (`sworn`): the commander vows to serve and worship only her.
- **Broken** when the commander's acts toward another woman cross the vow:
  - a practice with another holder;
  - P9c courtship accepted or `claimed`;
  - worship in a scene with another.
- A break is **sacrilege**: her aftermath by style (P15 §9, weighted toward `revenge` / `grief`), Regard falls, her trust breaks, and the squad may learn of it by P15 §8's paths.
- **Two holders:** a second holder's claim on the commander meets the vow through P15's conflict settlement.

## 3. UI

- **Her PRACTICE block** (dossier): her active customs, each with `data-analyze` (its description; what keeps it; never what is coming), and the swap.
- **The body map:** consecrated zones carry her sign.
- **The inventory:** relics, with their scent band as a word.
- **The plan:** traces as marks with `data-analyze`.
- **The expedition's launch screen:** her token.
- **The journal:** an editor in the CMDR file (§2.1a), her margin notes in her hand.
- **WORLD PARAMETERS › DYNAMIC and SYS › Dynamic:** the customs toggles, the density, K per frame.

Every new chip, option, card and mark carries `data-analyze`.

## 4. Memory check (CLAUDE.md rule)

- `praise_kept` (a line of the commander's she kept): a `memoryRules` entry, audience her, importance 2, no spread.
- `zone_consecrated`: audience the pair, importance 2.
- `shrine_slighted`, `relic_washed`: her offences, remembered through her discipline's existing path (no new rule).
- A relic given: P17d's existing entry (worn items given: the pair).
- A relic found in an inspection: P17a's site (compromat).
- Worship in her absence discovered: `worshipped_unseen`, audience her, importance 2.
- Traces, acceptance, rites kept: bookkeeping. P17e's habits remember a rite formed or broken.
- `defect_worshipped` (the first time): audience her, importance 3, `hiddenFromCommander: false`.
- The token: bookkeeping (a missed token is her reaction, not a fact).
- `vow_broken` (sacrilege): audience her, importance 5, spread by P15 §8 only to those who learn of it.

The journal reaches a prompt only through `praise_kept` facts and the margin notes' directive (`customs:journal`, once).

## 5. Acceptance criteria

1. With customs off (or the dynamic off) a seeded week is byte-identical to the committed golden (`tests/customs/unaffected.test.ts`).
2. A holder grows at most K active customs per her frame (the setting); a new one comes through her first moment, at most once a fiction week; a refused one cools down 14 days.
3. Her customs follow her attitude: a category switched off or drifted below `enjoys` fades the customs that need it within 14 days.
4. No custom repeats on an exchange; a rite is offered at most once per anchor and at most `perDay` times a fiction day.
5. Each custom works as §2 says and extends its base mechanic without duplicating it (its tests use the base's functions).
6. Hidden values never reach a panel, a toast, a label, a prompt or a reading (sentinels).
7. Every element carries `data-analyze`; every generation goes through P14; no pronoun for the commander.

## 6. Open for the author

- The density's scaling and `pace.perDay` defaults.
- The table of `needs` per custom (a draft is in `docs/drafts/2026-11-25-worship-customs.md`; the plan proposes it).
- The weight of sacrilege (the vow's break).
- The relic places of underwear by kind.
