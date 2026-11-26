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

Origin: the design session of 2026-11-25 with the author. **Revision of 2026-11-26** (§8): stages on customs, eight new customs of the `regal` direction and the far end (the absolute whim, her prerogative); it adds P17 (stagings), P17c (gestures), P2 (activity choice) and P10d (the cabin override) to the dependencies.

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
- `kind`: `praise` | `shrine` | `relic` | `rite` | `trace` | `acceptance` | `defect` | `token` | `vow` (read by kind, never by id); §8 adds `salute`, `after_her`, `chamber`, `cabin`, `attendance`, `seat`, `foot_gag`, `spit`, `prerogative`.
- `stages?`: §8.1 (2026-11-26).
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
- **Recharging (author, 2026-11-25):** a relic's scent fades one band every 2 days (P17d). Giving it back for her to wear again is a rite of exchange: a `rite` anchor, for example at her return from a run. The commander brings it ("it has faded"), and it comes back at full strength after her next slot in it. A relic gone to `faint` draws her reaction by style: a haughty holder takes it back for good, a warm one renews it.
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

### 2.10 Never above her (`height`)
- A protocol rule (a new P16 rule kind `height`): the commander's head is never above hers. When she sits, the commander is on the floor; when she stands, the commander kneels.
- The engine checks it from both persons' base postures in the blocking (standing > sitting > kneeling > lying): no extractor, no model. A breach is a slip (`protocol_slip`).
- On the base plan (P10d) the commander's default posture in a room with her is lower.
- It comes like every custom: not at once, not in every game (author).

### 2.11 The commander's glory is her tribute (`tribute`)
- **Opens only when their dynamic is public** (P15's knowledge levels: enough of the squad `knows`, or the relation's publicity, P9d).
- After a run that went well she takes the credit before others. The run's merit and feats (P9b) raise **her** standing, not the commander's; outside perception reads "she stands behind the commander".
- Her line names it ("my commander did well — I keep it well").

### 2.12 Decisions about the commander while under her (`audience`)
- In her activity's frame with a visitor (P10e (e)), the commander is her chair or footstool (`weight`). The visitor comes with **real business**: a leave, a roster, a complaint, a request from her thread.
- With the `command` domain (P15) she decides it by her own power, over the commander's head, sitting on the commander: a countermand, a roster change, a punishment ordered. It is real, with its consequences in the game, through P15's existing command capabilities.
- The humiliation is that the commander's authority is used while the commander is furniture.
- **The throne itself** (the weight inside her activity's frame at any activity, her body following her lines, the flinch, her mug, her signing, her rising, visitors of three kinds, the thanks, her legs as `legs_astride`) is designed and approved as `docs/prototypes/throne.html` and ported by P10e chunk (e), Task 24b. This custom only decides when an audience with real business comes.
- **Before a witness who knows** (author's pick): a visitor who already `knows` the dynamic comes on purpose and talks with her as usual. She may offer the visitor to rest her feet on the commander too. This is P17b §8's rare outcome, but from her hand; it needs `public_humiliation` and `objectification` and her `audience: show_off`.

### 2.13 She speaks of the commander as a thing (`object_naming`)
- **A mechanic, not only a line** (author): before others she names the commander as an object (her name for it: "my chair", "the footrest", "it"), from her style and the commander's current use in the blocking.
- She does not address the commander at all while she does.
- **State:** her object-name for the commander (`customs.active[].data.name`), chosen once by her (a flavor kind through P14, sanitized; never a pronoun of the commander) and kept until the custom fades.
- **Effects:**
  - the visitor's reaction by P15 §8 (`drawn` / `indifferent` / `dislikes`);
  - the nickname's deeds (P9);
  - the visitor may start using the name too (a directive for that visitor while the custom lives).
- Needs `objectification` and `degrading_language`.

### 2.14 Her whims (`whim`)
- A P16 task form: a pointless errand and its reversal ("bring it — no, take it back", "move it there — no, where it was").
- Kept by obeying without a question; a "why?" or a sigh read by `intent_extract` is a slip.
- Her pleasure is the pointlessness (favour by style). At most one whim a day.
- **Stages (2026-11-26):** this is stage 1; the whim grows to absolute at `rule` (§8.4.1).

### 2.15 The commander as her clerk (`clerk`)
- Lore: oversight sits above the squad. With the `command` domain (P15) the commander's reports to oversight go out **under her signature** or **in her dictation** (P17c's dictation).
- The commander writes, she is the squad's face before the corporation. It continues P15's line ("the squad starts to address her as the real commander") toward the corporation.
- **Risk:** oversight may notice. A suspicion of oversight grows as P13's warden pattern does: hidden, a sentinel. Found out, it is P15's compromat and a corporate consequence (the Leash requests read worse).

### 2.16 Answered through her (`through_her`)
- Outside demonstrations too: when she is present, others address her and not the commander, even about the commander's business. She answers for the commander; the commander's input turns to gestures (P17c) while the custom lives.
- Read from P16's "she speaks for the commander" (demonstrations), generalised by the custom.

### 2.17 Her table is the floor (`floor`)
- The commander eats after her, at her feet, what she leaves (P17b's feeding).
- Once the dynamic is public, in the mess hall before the squad. With §2.13 a visitor may ask "does it eat?".
- Needs `pet_play` or `objectification`, and `public_humiliation` for the mess hall.

**Needs, frames and weights of §2.10–2.17** (proposed, for the author)
| Custom | Needs | `frameMin` | Weight |
|---|---|---|---|
| height | style `regal`, `ritual`, `drill` or `possessive`, or `service` likes | `role` | 2 |
| tribute | style `regal` or `possessive`; the dynamic public | `role` | 1 |
| audience | the `command` domain; `objectification` likes; a visitor available | `rule` | 1 |
| object_naming | `objectification` and `degrading_language` likes | `role` | 1 |
| whim | style `regal`, `playful` or `cruel` | `play` | 2 |
| clerk | the `command` domain | `rule` | 1 |
| through_her | `audience` not `private_only`; frame `role` or beyond | `role` | 1 |
| floor | `pet_play` or `objectification` likes (`public_humiliation` for the mess hall) | `role` | 1 |

**Memory:** `tribute` taken before the squad is P9b's existing outside perception (no new rule). An audience's decision is remembered where its command action writes. `object_naming` heard by a visitor goes through P15 §8's witness path. Height slips are bookkeeping.

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

## 6. Numbers (approved by the author, 2026-11-25)

Scales for reference: trust 0–100, Regard 0–100 (start 50, ordinary rises +1…+4), stress 0–100. All go into `TUNING.customs` (and the registry for needs and weights).

**The frame**
| What | Number |
|---|---|
| K active customs by frame (a setting) | `play` 1 · `role` 2 · `rule` 3 |
| Density `few` / `normal` / `many` | K × 0.5 rounded down (at least 1) / K × 1 / K + 1 |
| Days between new customs | at least 7 fiction days |
| Cooldown after her first moment is refused | 14 days |
| Fading without upkeep | 14 days |
| Offered rites a fiction day (all customs) | 2 |
| `customs:` directives in one reply | at most 1 |
| Her pick's hidden spread | weight × (1 + hash / 4) |
| `regal`'s weight multiplier | ×2 for `praise`, `shrine`, `relic` |

**Needs, frames and base weights** (categories read through `practiceOf`; "likes" = `as` `enjoys` or `craves`)
| Custom | Needs | `frameMin` | Weight |
|---|---|---|---|
| praise | nothing | `play` | 3 |
| rite | `service` likes | `play` | 3 |
| acceptance | `worship` likes | `play` | 2 |
| token | `worship` likes | `play` | 2 |
| shrine | `worship` likes | `role` | 2 |
| relic | `worship` likes (underwear: also `explicit_scenes`) | `role` | 2 |
| trace | `worship` likes | `role` | 1 |
| defect | `worship` likes, a defect of hers, trust ≥ 50 | `role` | 1 |
| vow | `worship` `craves`, or style `possessive` / `obsessive` / `regal` | `role` (with P15's vow milestone) | 1 |

**Inside the customs**
- **Praise:** true praise ×2, general ×1, false ×0. A false praise is seen through at once by a holder with `curiosity` ≥ +1 or `clinical`, by others on the second within 14 days; seen through, it is her slip (minor). One kept line a week, quoted at most once a week.
- **Shrine:** known = mastery level 2 (P16b); favoured = 3 `pleased` verdicts for acts at that zone; consecrated = favoured plus a rite there she named (a P17e ritual). At most one rise a scene a zone. `shrine_slighted`: stakes `minor`.
- **Relic:** scent one band down every 2 days (P17d); her check every 5–9 days (hashed); `relic_washed`: stakes `minor`.
- **Traces' lifetime:** where she sat, to the end of the slot; a footprint, to the end of the slot or until cleaned; lips on a glass, to the end of the next slot; hair on the pillow, a day.
- **Acceptance:** more gesture and fewer words at P15b `warmth` ≤ −1 or `voice` ≤ −1.
- **Defect:** trust ≥ 50 for her to accept; for 7 days after a worship her defect's stress gains are −25 % and its breakdown chance ×0.75, refreshed at most once a day; Regard +2 the first time, then +1 at most once a week (`value`).
- **Token:** with it, commander stress −2 per node, at most −10 a run; without it, once the custom is active, +6 stress before the first fight.
- **Vow broken (sacrilege):** `regardFall` with humiliation 5 (P15: 5 × 1.5 × her style factor); trust −30; her aftermath's weights `revenge` ×2, `grief` ×2.

**Memory importance** (1–5): `praise_kept` 2 (her), `zone_consecrated` 2 (the pair), `worshipped_unseen` 2 (her), `defect_worshipped` 3 (her), `vow_broken` 5 (her; spread only to those who learn of it).

## 7. Open for the author

- The relic places of underwear by kind.

## 8. Revision of 2026-11-26: stages, the `regal` customs, the far end

From the design session of 2026-11-26 with the author (`docs/drafts/2026-11-26-regal.md`; this section wins where they differ, and wins over §1–§7 where it changes them). `regal` here is not a queen with titles, a coronation or a court: the commander **serves her and worships her as something higher**. The approved throne (`docs/prototypes/throne.html`) is the reference: her life goes on above, the commander is the ground of her comfort, she barely notices the effort, her attention is rare. Its probing (the way in) is P15b §12.

**Rulings (author, 2026-11-26):**
1. Any holder whose profile fits may grow these customs; `regal` weighs them ×2. A custom that depends on her character reads her manner, not the style word.
2. The chamber (§8.3.3) is urine only; no new content category.
3. At the last stage of the whim (§8.4.1) a whim is absolute: it cannot be disputed, however strange it is; not doing it is a heavy offence, not a break.
4. Her delay of a run (§8.4.2) touches optional missions only.
5. Every stage is open by default; the player may lower a ceiling per custom.
6. Growth works by **stages on customs** (§8.1), not by the tracks alone. (Rejected: letting P16's track levels cap the model's intensity and nothing else; no ceiling per idea, no visible place on it.)
7. Her prerogative acts at the moment of choice; there is no planner of the commander's week (§8.4.2).

**Dropped:** carrying her (the soldiers are far stronger than the commander); titles, coronation, petitions, pardons and anything that needs a court; the commander speaking of self in the third person (P17b §3).

### 8.1 Stages (general to every custom)

**Data.** `worshipCustoms[].stages?: Array<{ label, requires: { frame, tracks?, categories?, attitude?, capabilities?, milestone? }, stakes, promptHint, description }>`:
- `frame`: `play` | `role` | `rule`;
- `tracks`: P15 track levels (`{ humiliation: 2 }`);
- `categories`: all enabled;
- `attitude`: her `as` for a category through `practiceOf` (`enjoys` | `craves`, at least);
- `capabilities`: P15 capabilities she holds (by capability, never by domain id);
- `milestone`: one the pair has passed (`private_rule` for the far end);
- `stakes`: the P16 consent ladder (R.1) for her offer of the stage; `severe` writes the CMDR record line.

Stage 1 is the custom as introduced today. A custom without `stages` is unchanged. Each new custom below has its own `kind` (the code reads customs by kind, never by id): `salute`, `after_her`, `chamber`, `cabin`, `attendance`, `seat`, `foot_gag`, `spit`, `prerogative`; the `whim` row gains `stages`.

**Notation in the tables:** a frame (`play`); a category name alone = enabled; `name N` = the P15 track at level N or more; `craves name` / `enjoys name` = her attitude; a capability in backticks = she holds it; *seen* = others see it (below).

**Seen stages.** A stage marked *seen* is not offered while the relation is secret or her `audience` is `private_only` (as `tribute`, §2.11). Taken, it feeds P15's suspicion through a `dynamicSigns` row: an existing one where it fits (`protocol_public`), else a new one named in the stage.

**State.** `customs.active[].stage` (1-based), `stagedOn?: number` (day), `stale?: number` (hidden).

**How a stage grows.**
1. **Staleness (hidden):** each time the custom is kept, `stale` +1. Her threshold `TUNING.customs.staleAt` (6) × her manner: `drawnBy: discovery` or `curiosity ≥ +1` ×0.6; `order ≥ +1` or `drawnBy: discipline` ×1.5; a hidden spread by `dynamicHash`. A fresh stage is not left early. Staleness changes nothing about upkeep or fading.
2. **Her offer:** when `stale` has reached her threshold, the next stage's `requires` hold, it is under the ceiling and the pacing allows, she offers it as a first moment (§1.2's mechanism), in the consent form of its `stakes`.
3. **Pacing:** at least 7 fiction days since this custom's last step; at most one new custom **or** one step-up per holder a fiction week (shared with §1.2).
4. **Accepted:** the stage rises, `stale` = 0, `custom_stage` is emitted.
5. **Refused:** the custom stays, 14-day cooldown for it. At stakes `major` or above the refusal is hers in P16's sense (her discipline may follow). Never an exit.
6. **Falling back:** one stage down, never more at once, when its `requires` stop holding (the frame cooled, a track decayed, a category switched off, her attitude drifted, P14b) or after 14 days without upkeep. Stage 1 falling is §1.2's fading.

**The player's hand.**
- Content categories are hard gates.
- **SYS › Dynamic › Customs:** a **ceiling** per custom (stages 1…N) beside its toggle; default all open (ruling 5). SYS lists every stage's label and description, as it lists content categories (choosing what may happen needs to know it). Lowering it under the current stage drops the custom to the ceiling at the next day step, with no offence.
- Refusing in the fiction, the exit (P15 E2) and the stop word (P15a §9.4), untouched.
- The PRACTICE block shows each active custom with **its current stage label**, never the next; analyze explains a stage after it happened.

**Prompt.** The custom's `customs:` directive reads the current stage's `promptHint` (§1.5).

### 8.2 Calls on the stages (Claude, 2026-11-26; the author may overrule any)
- Stages are written for the new customs and `whim` only; the customs of §2 may get them later.
- Falling back is one stage at a time; the cabin's stress cost is at its stage 3 only; the absolute whim is consented to once, at the stage.

### 8.3 The middle: new customs

Labels, hints and descriptions `AUTHOR TO WRITE`; stakes are drafts.

#### 8.3.1 The salute (`salute`)
- **Needs:** `manner.order ≥ +1`, or primary `drill`, `ritual` or `regal`; `regal` ×2; `frameMin` `play`; weight 2. (Her value axes have no discipline or rank axis; values are not read.)
- **Rule:** a P16 rule template like `stand_when_i_enter`, judged the same way (`check: 'intent'`): when she enters or passes, the commander stands to attention (`standing_attention`) and salutes; she does not return it. A miss is `protocol_slip`.

| Stage | What | Requires | Stakes |
|---|---|---|---|
| 1 | in jest, between them | `play` | trivial |
| 2 | seriously, before the squad (*seen*, `protocol_public`) | `role`, public_humiliation, `public_humiliation 1` | minor |
| 3 | kneeling, before anyone, never returned (*seen*, `protocol_public`) | `role`, `humiliation 2`, `public_humiliation 2` | major |

#### 8.3.2 After her (`after_her`)
- **Needs:** `service` likes; weight 2; `frameMin` `play`.
- **Rule template** `after_her` with `of: eat | sleep | wash`: the commander does it only after she has. The engine has no meal, sleep or wash events (whereabouts are a hashed room per slot), so it is judged like `stand_when_i_enter` (`check: 'intent'`: the extractor reports a breach a scene shows); its directive reminds the model once in a scene where it fits.
- Stage 4 is a scene beat: after her bath (`bathing_her`) she tells the commander to wash in her water.

| Stage | What | Requires | Stakes |
|---|---|---|---|
| 1 | eats after her | `play`, service | trivial |
| 2 | goes to bed after her | `role` | minor |
| 3 | washes after her | `role`, `humiliation 1` | minor |
| 4 | washes in her used bathwater | `role`, `humiliation 3` | major |

#### 8.3.3 The chamber (`chamber`; urine only, ruling 2)
- **Extends** P17b's `watersports` (drink only from her, the bowl, `gulp`); no new category.
- **Needs:** `watersports` likes; weight 1; `frameMin` `role`.

| Stage | What | Requires | Stakes |
|---|---|---|---|
| 1 | the commander holds the vessel for her and carries it out | `role`, watersports, `service 2` | major |
| 2 | at night the commander is her chamber pot (the `gulp` physics) | `rule`, `humiliation 3`, `craves watersports` | severe |

#### 8.3.4 Her cabin (`cabin`)
- **Today:** `cabinMap` (`src/engine/basePlan.ts`) derives cabins from the order of joining (no state); `roomOfPerson(…, 'commander')` already moves the commander for a hold and for `second_place`.
- **New:** a stackable reader `registerCabinOverride` (P10d's rule kept: nothing stored in the plan; the swap lives in `customs.active[].data`; the reader answers null with no live custom, so the plan stays byte-identical).
- **Needs:** `second_place` (the `household` domain opens at `role`); weight 1; `frameMin` `role`.

| Stage | What | Requires | Stakes |
|---|---|---|---|
| 1 | now and then she takes the commander's cabin for the night; the commander sleeps in hers | `role`, `second_place` | minor |
| 2 | the cabins are swapped: the plan names the commander's cabin hers (*seen*, new sign `cabin_taken`) | `role`, `household_protocol`, `humiliation 1` | major |
| 3 | **no cabin**: the commander lives as furniture of her room; the plan draws the commander there, default posture `footrest` (*seen*, `cabin_taken`) | `rule`, objectification | severe |

- **Cost:** at stage 3 a night on the floor adds commander stress +2 (P7, no draw), unless she kept the commander at her bed that night.

#### 8.3.5 Waiting while she gets ready (`attendance`)
- **Uses:** the activity `holding_for_her`, a P16 named posture with drift (P16b), the slot it burns, P16 R.9's "until I decide".
- **Needs:** `service` likes; `regal` ×2; weight 2; `frameMin` `play`.

| Stage | What | Requires | Stakes |
|---|---|---|---|
| 1 | waits at her door until she comes out | `play` | trivial |
| 2 | kneels in her room holding her shoes while she does her face (a posture instrument; the slot burns) | `role`, `service 1` | minor |
| 3 | waits for hours with no promise of being called in (no duration) | `role`, `service 3` | major |

#### 8.3.6 Her seat (`seat`)
- **Exists:** the contact `under_her_seat` (she sits on the commander's face as on a cushion, busy with her own thing: breath physics plus her activity, no speech, no sight; `docs/content/blocking.md` §3), the approved dark shape `seat` (P10e §15) and `her_activity` as a contact physics on it. No new instrument: the custom only decides when and how often it comes.
- **Needs:** `objectification` likes and `restraint` enabled; `regal` ×2; weight 1; `frameMin` `play`.

| Stage | What | Requires | Stakes |
|---|---|---|---|
| 1 | briefly, "to see" | `play`, objectification, restraint | minor |
| 2 | her seat for reading or her PDA | `role`, `humiliation 2` | major |
| 3 | her chair: in her quarters she sits nowhere else | `rule`, `craves objectification` | severe |

#### 8.3.7 Her foot as a gag (`foot_gag`)
- **Exists:** the contact `sole_to_mouth` (no speech, the `jaw` physics), P17c gestures, P17's stagings (the condition `composure`).
- **Needs:** `worship` likes; weight 1; `frameMin` `play`.

| Stage | What | Requires | Stakes |
|---|---|---|---|
| 1 | alone, while she talks on comms | `play`, worship | minor |
| 2 | with a visitor in the room; the commander answers only by gesture | `role`, `humiliation 2` | major |
| 3 | during a comms call the commander must answer (P15a's phase event), voice kept steady for the caller: a P17 staging, `composure`, Strain = the caller noticing | `rule`, exposure_risk | severe |

(There is no call with oversight in the engine; none is invented.)

#### 8.3.8 Seasoned (`spit`)
- **Extends** P17b's spit (a moment: accept / turn away / thank) and feeding from her mouth.
- **Needs:** `bodily_fluids` likes; weight 1; `frameMin` `play`.

| Stage | What | Requires | Stakes |
|---|---|---|---|
| 1 | in jest, into the commander's mug | `play`, bodily_fluids | trivial |
| 2 | into the commander's food, in private | `role`, `humiliation 2` | minor |
| 3 | into the commander's food in the mess hall (*seen*, new sign `seasoned_public`) | `role`, public_humiliation, `public_humiliation 2` | major |
| 4 | everything the commander eats has been in her mouth first | `rule`, `craves bodily_fluids` | severe |

### 8.4 The far end

#### 8.4.1 The whim becomes absolute (`whim` gains stages)
§2.14's whim is stage 1.

| Stage | What | Requires | Stakes |
|---|---|---|---|
| 1 | a pointless errand and its reversal (§2.14) | `play` | trivial |
| 2 | any whim of hers within the enabled categories and her limits; contradictory ("do it — no, undo it — why did you undo it?") | `role` | minor |
| 3 | **absolute**: the whim card has no REFUSE; at night too ("wake up, straighten my pillow") | `rule`, `private_rule` | severe, accepted once for the stage |

- **Absolute (ruling 3):** at stage 3 a whim cannot be disputed; however strange, it is not wrong. The card offers only ACCEPT (its button; the consent was given once at the stage, with the signature and the CMDR line "Every whim. Day N."). A whim **reported not done** (`intent_extract`, or her check) is a new offence kind `whim_defied` at the **highest severity** of her discipline. It is not a break and ends nothing.
- **Not judged is not defied:** P16 R6 breaks an unjudged model task at its deadline; an absolute whim nobody judged is `void` instead.
- **Not issued** when the commander cannot act: held by another holder, on a run, in a scene with another woman, or under another holder's rule that forbids it. A night whim comes only as her own night entry (P5 `enqueueNight`).
- **Untouched:** the exit (P15 E2) and the stop word (P15a §9.4).
- At most one whim a day (§2.14).

#### 8.4.2 Her prerogative (`prerogative`)
**No planner (ruling 7).** The engine has no planned week: slots are chosen as they come; the only entries ahead are P9c bookings. Her prerogative acts at the moment of choice, with no change to P2's calendar:
- **Cancel:** she takes back a booking the commander holds with another woman (P9c), or the activity standing in the current slot (a training, a pastime, a free evening); the slot shows "cancelled by her".
- **Veto:** an activity the commander picks for a slot goes to her first. She answers at once by her mood (`dynamicHash`) or "later"; then the slot waits, and is lost if no answer comes before it ends.
- **The run:** a guard at the launch (stage 4).

**Needs:** `book_ahead` (the `private_time` domain); `regal` ×2; weight 1; `frameMin` `role`.

| Stage | What | Requires | Stakes |
|---|---|---|---|
| 1 | now and then she cancels the commander's activity in a slot | `role`, `book_ahead` | minor |
| 2 | she cancels at will, the commander's bookings with other women included; the other woman learns it from her, not from the commander | `rule`, `relation_rules` | major |
| 3 | **veto**: every activity the commander picks waits for her approval | `rule`, `private_rule` | severe |
| 4 | **her whim over a run**: she delays the launch of an optional mission (source `side` or `rumor`, never `command` or `story`, never with `spineBeat` or `threadId`) by slots; one with a deadline may expire, one without (a `side` mission from a point of interest) costs the day; the squad sees why (*seen*, new sign `run_delayed`) | `rule`, stage 3 held 14 days | severe |

- **Hooks:** P9c's booking conflicts (taking back the other woman's booking); a guard in `src/engine/dispatch.ts` beside `booking_due` / `held` (P16), **`her_veto`**: it sends an activity choice to her (stages 1–3) or refuses a launch with her line (stage 4, only for a mission the row allows). `calendar/cancel_scene` is not used (it is the commander backing out of an open scene).
- **Not issued** on a run, while held by another holder, or during the prologue's steps (P11).
- **Cost:** a cancelled booking with another woman is the commander's broken plan toward her (P3 deltas through `eventDeltas`, with a journal phrase); an expired mission fails as P5 says.
- The prerogative's powers come from stages of a custom; P15's domain table stays as built.

### 8.5 Memory check (CLAUDE.md rule)
- **`custom_stage { unitId, customId, stage }`:** private stages: a `memoryRules` entry (audience: the pair; importance minor 1, major 2, severe 3). *Seen* stages (salute 2–3, spit 3, cabin 2–3): audience the witnesses or the squad, spread squad, importance 2; rumours outside the squad only with `public_humiliation` (P15 B4). `severe` stages also write the CMDR record line (P16 R.1).
- **`whim_defied`:** her discipline writes its own facts; no rule.
- **`plan_cancelled { holderId, otherId? }`:** with another woman, a `memoryRules` entry (audience: that woman; spread low; importance 1) and an `eventDeltas[].journal` phrase for the relation event; without one, bookkeeping.
- **`run_delayed { holderId, missionId, expired }`:** a `memoryRules` entry (audience: the squad; importance 2); P5's failure writes its own report lines.
- Staleness, falling back, a ceiling change: bookkeeping.
- **Chronicle:** none. **Prompt:** the `customs:` directive (§8.1); no `group: 'memory'` provider.

### 8.6 Hidden values and off
- **Hidden** (sentinels): `stale` and her threshold, the next stage and whether it is ready, whether a whim is contradictory on purpose, her veto answer before it is given, the caller's noticing in `foot_gag` 3 (the staging's Strain).
- **Off is byte-identical:** customs off, nothing; a custom without `stages` behaves as before this section; `registerCabinOverride` answers null with no live `cabin` custom; `her_veto` passes when no `prerogative` stage is live. No rng draw (`dynamicHash`, `dynamicRoll`). `tests/customs/unaffected.test.ts` must not move; a seeded test that moves stops and reports.
- No text gives the commander a pronoun or a feeling.

### 8.7 Acceptance criteria (added)
8. A custom with stages grows one stage at a time, only through her offer, only when stale, its `requires` hold, it is under the ceiling and the weekly pacing allows; refused, it cools 14 days; it falls one stage when a requirement fails or after 14 days without upkeep.
9. The ceiling in SYS lists every stage and caps the custom; lowering it below the current stage drops it at the next day step with no offence; the dossier shows the current stage only.
10. *Seen* stages are never offered to a secret relation or to a `private_only` audience, and feed their sign.
11. The absolute whim has no REFUSE, enters `whim_defied` at the highest severity only when reported not done, is void when unjudged, and is never issued when the commander cannot act; the exit and the stop word still work.
12. The prerogative cancels, vetoes and delays only what its stage allows; a `command` or `story` mission, a spine or thread mission and the prologue are never touched.
13. The cabin override draws the plan from the custom and nothing else; without the custom the plan is byte-identical.

### 8.8 Numbers (drafts; `TUNING.customs`)
| What | Number |
|---|---|
| `staleAt` | 6 kept occurrences |
| staleness scale | ×0.6 (`discovery`, `curiosity ≥ +1`), ×1.5 (`order ≥ +1`, `discipline`) |
| days between steps of one custom | 7 |
| new customs or step-ups per holder a week | 1 |
| cooldown after a refused stage | 14 days |
| fall back without upkeep | 14 days, one stage |
| cabin stage 3: a night on the floor | commander stress +2 |
| prerogative stage 4 needs stage 3 held | 14 days |
| `regal`'s weight multiplier | ×2 also for `salute`, `attendance`, `seat`, `prerogative` |

### 8.9 Open for the author
- Every label, hint and description, the stage names in SYS and the dossier, her lines for each stage's offer.
- The needs and weights of each new custom (drafts above).
