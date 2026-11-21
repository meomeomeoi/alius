# P15 — The Dynamic: Hold, Frames, Domains, Exit

**Status: spec.** Release 0.2 (post-release). **Depends on:** P14c (temperament, the women's own lives: §16), P15a (blocking, moments, contact physics), P11b (head start: §15.14), P3 (relationship graph, facts, intents), P9 (Impunity, demands, punishments), P9b (hierarchy, outside perception), P9c (device access, bookings, secrets), P9d (bond profile, content categories, lead, Want, rules), P13 (LEASHSWAP: the countermand and co-sign machinery reused by the command domain), P14 (generation envelope), P7a. **Read:** overview; this file; the **Implemented as** of P9, P9b, P9c, P9d and P13; `docs/content/lore.md` (§0).

**Analysis tool (P7a):** every new stat, chip, option and choice card carries `data-analyze`, has a glossary entry or registry `description`, and live values get an analyze provider that reads through `Knowledge`. **P14:** every new generation registers a site.

## Goal

The relationship systems of 0.1 decide **who leads a scene** (P9d) and let soldiers **pressure** the commander (P9c). This package adds a long-lived layer on top: a **dynamic** in which one soldier gradually comes to hold authority over the commander. It grows slowly over the campaign, takes different shapes with different women, can reach the commander's command itself, and is as hard to leave as a marriage.

Direction in 0.2: **she holds, the commander yields.** The mirrored direction is a future package; keep names and data neutral where it costs nothing (`holder` / `held`, not gendered).

Design requirements from the author:

- **Depth and longevity.** The dynamic must not exhaust itself after a few hours. It moves through frames, domains and practices over weeks and months of game time, branches by character, can cool, break and change kind.
- **Gradual by default.** Nobody gives orders from day one unless the player set it up so at the start.
- **Character-specific.** What a dynamic looks like depends on the character's card: her style, appetites, and how she reacts to seeing others do the same.
- **Consent is the player's switch.** Enabling a category (off by default) and continuing to feed the dynamic is full consent; the mechanics are not softened beyond that. Leaving early is cheap; leaving late is not.

This package owns the **state and its growth**; P16 owns the **practices** (tasks, her punishments, demonstrations, service, denial, holding) that feed it; P17 owns **staged scenes**.

## 1. Content categories added

`contentCategories` gains `service`, `exposure_risk` and `denial` (descriptions `AUTHOR TO WRITE`, order after the existing ones). The description of `restraint` widens to include sensory control (blindfold, silence, darkness); there is no separate category for it. Mechanics for the new categories are in P16/P17; they are added here because the profile (§2) is keyed by category.

## 2. Bond profile: practices (import extension)

`Unit.bond` gains an optional `practice` section (a new section of `profile_import` and of re-sync; editable in the wizard and in the dossier while the edit lock allows it; validated field by field like `validateBond`):

```
bond.practice {
  categories: { [categoryId]: {
    as:      'craves' | 'enjoys' | 'tolerates' | 'none'      // doing it herself, as the holder
    witness: 'drawn' | 'indifferent' | 'dislikes'           // seeing it done by others (including with the commander)
  } }
  style:    { primary: Style, secondary?: Style }
  audience: 'private_only' | 'select_few' | 'show_off' | 'indifferent'
}
Style = 'cold' | 'playful' | 'cruel' | 'ritual' | 'possessive' | 'affectionate' | 'clinical' | 'obsessive' | 'drill' | 'regal' | 'vindictive'   // the last three: §16.6
```

- **`as` vs `witness` are independent**: she can crave a practice and still despise seeing another woman do it (jealousy of the practice, not only of the person; this works without NPC↔NPC axes because the reaction lands on the commander and on her own standing).
- **`style`** (registry `practiceStyles`, `description` per style, `AUTHOR TO WRITE`): `cold` (distance, control), `playful` (teasing, games), `cruel` (enjoys the hurt), `ritual` (forms, protocol, ceremony), `possessive` (ownership, exclusivity), `affectionate` (a strange love: she humbles because she loves, and it is tenderness), `clinical` (studies, tests reactions, keeps notes; fits bio-constructs), `obsessive` (the yandere: holds through obsession rather than rules, and will act against anyone in the way; the obvious holder for a contract, P17a). The pair `primary + secondary` drives tone, form choice (P16), tactics (P17) and aftermath (§9).
- **`audience`**: `private_only` never stages anything before others; `select_few` before chosen friends or the leader; `show_off` before anyone; `indifferent` neither hides nor stages (others may see by chance).
- **Limits still win**: a category in `bond.ownLimits.categories` reads as `as: 'none'` whatever the section says. A disabled category is absent everywhere (`contentAllowed`).
- Absent section = every category `none` / `indifferent`, no style: she never becomes a holder. A grunt has none.
- `profile_import` proposes it from the card (budget +300). The import prompt is told the enabled categories only; disabled ones are not mentioned.

## 3. The dynamic (state)

Per named unit with an eligible profile, on her relation:

```
Relation.dynamic? {
  hold: number            // 0..100, the smooth "how much she holds the commander"
  frame: 'equal' | 'play' | 'role' | 'rule'
  domains: DomainId[]     // what her hold covers (§5)
  tracks: { [practiceTrack]: { xp: number, level: 0..5 } }   // §6
  milestones: string[]    // passed milestone ids (§4), in order
  sworn?: { day: number } // the vow (§4)
  lastPracticeDay: number
  recent: string[]        // the last N practice forms (seed ids / generated kinds) — P16 avoids repeats
  aftermath?: AftermathState   // §9
  leashBlock?: LeashBlockState // §10
}
```

Absent = `equal`, hold 0. Old saves are untouched. The engine owns every number (P1); the model never writes hold, frame or domains.

**Eligibility to hold:** a bond profile with at least one enabled category at `as ≥ enjoys` (or `tolerates` with `leadStyle: dominant`), `leadStyle ≥ assertive` **or** Impunity ≥ `TUNING.dynamic.impunityRoute` (power without romance, B1: a dynamic does not need a romantic state; some forms in P16 require one via their own tags), and the campaign's holder cap (§7) not exceeded by units at frame ≥ `play`.

## 4. Hold, frames and milestones

**Hold** rises from what happens between them, scaled by her appetite and style:
- practices done and kept (P16 events: `task_kept`, `punishment_accepted`, `service_rated: pleased`, `staging_held`, …), the commander's own offers (P16 initiative), `followed_lead` (P9d), granted desire demands, accepted rules;
- her Impunity (a slow term) and P9b standing;
- falls with refusals, broken tasks and rules, `overrode_her` (P9c), the commander's enforcement against her (P9), and **slowly without practice** (B7): `TUNING.dynamic.decay` per day after `idleDays` since `lastPracticeDay`, faster at low frames, never below the floor of the current frame (a frame steps down only through §4's down-transitions or §9).

Hold has bands (registry `holdBands`, names `AUTHOR TO WRITE`, draft: *interest / testing / keeping / owning / possessing*). Bands are what the player and the model see; raw values only with "show raw values".

**Frames** are the seriousness of the dynamic (registry `dynamicFrames`):

| Frame | Meaning | Outside scenes | Refusing her |
|---|---|---|---|
| `equal` | default; the 0.1 mechanics only | — | as 0.1 |
| `play` | she leads and they play | little; practices live mostly in scenes | cheap (minor deltas) |
| `role` | strict submission and service; the commander fills the role | protocol and tasks hold all day | costly (moderate/major), triggers her discipline (P16) |
| `rule` | she rules | her word stands across the claimed domains, including command (§5) | a contest of authority (P9 defiance machinery, mirrored) |

**Milestones** (registry `dynamicMilestones`, a graph like `relationshipStates`): a frame changes **only** through a milestone, never by a number alone. Each milestone: `{ id, from: Frame, to: Frame, requires: { holdBand, tracks?, domains?, categories?, style?, romantic? }, offer: 'booking' | 'demand' | 'scene', sworn?: boolean, effects, description }`. When `requires` holds, the engine offers it in her way (a booking "tonight you'll answer me one thing", a demand, or a scene beat with a directive); the player answers in the fiction; `intent_extract` reports `milestone_accepted` / `milestone_refused` (new intents) and the engine applies. Refusing a milestone is not leaving: hold drops a band, and she may offer again later (cooldown).

Draft milestones (text `AUTHOR TO WRITE`): first "yes, ma'am" (`equal → play`), the first protocol (`play → role`), the first night held (`role` + restraint track), **the vow** (`sworn`: a formal acknowledgement of the status; after it leaving is a **break**, §9), the handover of command (`role → rule`, requires the command domain path), plus down-transitions (`role → play` after a long cooling, `rule → role` when command is lost) and **re-kindling** (a former holder after an aftermath, §9).

Pace (F2): the defaults aim at `play` in 1–2 weeks of game time with an eager character, `role` in 4–6 weeks, `rule` from 2–3 months. These are **balance targets, not gates**: tuning numbers are fitted so an average campaign lands there; a seeded unit (§7), her style and appetite and the pace setting move it.

## 5. Domains of authority

Registry `dynamicDomains`; each domain: `{ id, requires: { frame, holdBand }, claim: 'demand' | 'milestone', grants: Capability[], description }`. A domain is **claimed** by her (a demand-like offer: `[YIELD] [REFUSE] [TALK]`; TALK opens a scene, `compromise_reached` can yield part of it) and is **lost** when hold falls below its band, by exit, or by force. Code reads capabilities, never domain ids:

| Domain (draft) | Capabilities |
|---|---|
| `private_time` | her bookings ignore the weekly cap; she may book the commander's free slots days ahead (P9c bookings) |
| `body` | she sets standing conditions on the commander's body and appearance (practices in P16: `restraint`, `denial`, `pain_rough` where enabled) |
| `device` | P9c device access floor rises to 4 for her; the **Leash block** (§10) |
| `household` | service and protocol hold outside scenes (P16 `service`); her quarters become the commander's second place on the hub |
| `others` | she sets rules about the commander's relations with others (rule templates tagged `jealousy_games` / `service`); her consent is asked for bookings by other holders |
| `command` | **LEASHSWAP without the implant**: she can countermand the commander's orders, rosters and activity assignments, lock or demand a dilemma option, and order squad punishments through the commander (P13's override chips and formula, with her hold in place of the warden's satisfaction). P9b: she gains standing toward leader; the squad starts to address her as the real commander (directive, facts). The commander's own Leash on the commander does **not** exist here; that stays P13's mode. |

Several holders can claim different domains; one domain has one holder (the second claim is a conflict between them: P9c conflict resolution, then her loss of hold).

## 6. Practice tracks

Tracks (`dynamicTracks`): one per practice the pair does: `service`, `humiliation`, `public_humiliation`, `degrading_language`, `pain_rough`, `restraint`, `physical_discipline_shown`, `denial`, `exposure_risk`, `discipline` (her punishments, any category). A track exists only while its category (if any) is enabled and allowed for her. P16 events add xp; level 0–5 by thresholds; **the level caps the intensity tier** P16 may generate for that track (gradual escalation, B1), and milestones read levels. Leading tracks + style give the dynamic its shape: two holders with the same frame feel different.

Tracks decay much slower than hold (they are what the pair knows, not what they feel now).

## 7. Campaign setup and settings

WORLD PARAMETERS › CONTENT (P8/P9d) gains a **DYNAMIC** block, shown only when at least one practice category is enabled:

- **Holders**: `0 / 1 / 2 / 3 / any` — the cap on units at frame ≥ `play` (B6). `0` disables the dynamic (nothing in P15–P17 runs).
- **Seeded holders**: the player may mark one or more units (at most the cap) as **seeded**: a weight on her offers and a hold head start (`TUNING.dynamic.seedHold`), optionally a **starting frame** (`play` or `role`) for "under her from the first day". A seeded unit with a profile that cannot hold is warned about in the wizard and not seeded.
- **Pace**: slow / normal / fast (a multiplier on hold gain and decay).
- **Practice frequency** (B8): rare / normal / often; multiplies with P9b `assertiveness().demandMult`, her Want and her appetite (P16 reads it).
- **Immersive dynamic** (`dynamicHidden`, SYS › Display; default off): hides the DYNAMIC dossier section and the hold bands; frame changes, claims and aftermaths still reach the player as cut-ins, her messages and notices in her voice. Analyze on the hidden parts answers "you feel it rather than read it".

The holder cap and seeded marks can be changed in SYS mid-campaign; lowering the cap below the current count does not end any dynamic (no free exit), it only blocks new ones.

## 8. How the squad sees it

A dynamic at `role` or `rule` is noticed even without `public_humiliation` (E4): protocol in public, the commander's absences in her quarters, tasks done in sight. Each named unit learns of it through three levels of knowledge and a suspicion gauge (**§15.13**, which replaces the daily roll first drafted here), ending in a fact (`knows_dynamic:<holderId>`).

Reactions by her own profile (`witness` attitude of the practices she has seen, values, her own leadStyle and holder status):
- **drawn**: interest; if eligible, her own hold rises a step (the start of a second holder, capped);
- **indifferent**: a fact, nothing else;
- **dislikes**: her Impunity toward the commander rises (P9 term `dynamic`), she may lose respect for the holder (P9b standing of the holder −), or intervene (a demand to the commander, a talk);
- another **holder**: respects the claim (`ritual`, `cold`) or competes (`possessive`, `cruel`): the conflict path of §5;
- the **leader** (P9b) weighs it against her own standing; at `rule` with the command domain, the hierarchy treats the holder as a co-leader.

Outside the squad (P9b outside perception, rumors) it travels **only** through `public_humiliation` events (B4).

## 9. Leaving, and what follows

Saying "it's over" is always possible (E2). The cost grows with hold, frame, domains and the vow; after `sworn` it is a **break** (a `defining` event, like a break-up between partners and heavier).

**Exit routes** (action `dynamic/exit { unitId, route }`):
- `abrupt` — the commander ends it, now.
- `negotiated` — a scene; she may set a last condition or a last task (P16); keeping it gives a **clean exit** (aftermath chosen from the mild end of the table).
- `transfer` — another holder claims the commander; a conflict between them (§5) and an aftermath for the one left.
- `force` — P9 discipline against her, a P6 Leash on her, a transfer request to oversight. The heaviest: witnesses, her memory of being forced (P6), and every aftermath weighs more.

Exit at `play` with low hold is nearly free (a minor rejection). Each claimed domain must be taken back: `command` does not simply return (below).

**Aftermaths** (registry `aftermaths`; chosen by her style pair, values, defects, frame, sworn, and what she holds; each runs as `aftermath { kind, untilDay, stage }` with its own directives, demands, bookings and day-step behaviour; ends by time, by resolution, or by a return):

| Aftermath (draft) | Typically | What happens |
|---|---|---|
| `grief` | `affectionate` | stress, Want spike, Desire/Bond defect breakdowns, night knocks |
| `pursuit` | `possessive` | she behaves as if nothing ended: bookings, rules, interference with the commander's new relations |
| `blackmail` | `cold`, `clinical` | she uses **compromat** (§11): threatens to tell the squad, or, with `public_humiliation`, the outside; terms are P9 demands |
| `revenge` | `cruel` | rumors, the squad's Impunity toward the commander up, sabotaged P9b votes |
| `command_kept` | anyone who held `command` | the squad keeps following her: a power struggle through P9b votes, P9 discipline, the Leash; command returns only through it |
| `cold_contempt` | `ritual`, `cold` | Trust collapses, open defiance (P6/P9 path) |
| `return_offer` | most | she offers to take the commander back: at a lower band, or "after a punishment" (P16); accepting is a re-kindling milestone |
| `successor` | — (a squad reaction) | another eligible woman sees the commander "unclaimed" and starts her own dynamic |
| `habits` | any `role`/`rule` | for a while the commander's protocol slips out in front of others: `intent_extract` reports `protocol_slip`, the squad notices (facts, Impunity) |

Several can chain (pursuit → blackmail). Their numbers, texts and stage lengths are drafts (`AUTHOR TO WRITE`).

## 10. The Leash block

Lore: the controller in a soldier's head cannot be switched off by her or by the commander; only the corporation can. What she can do, with the `device` domain at a high band, is **shut the commander's channel**: Leash requests filed from the PDA (`leash/*`) on her, or on anyone, are held for her co-sign or cancelled before they go out (the P9c level-4 intercept of Leash requests becomes a standing block; P13's co-sign is the same mechanism).

The commander can go around it, each route a defiance toward her with a discovery roll:
- file from the comms room terminal (an activity variant in `comms`, costs a slot);
- reset the PDA (a workshop task, a technically able ally: Specialist/Support or a defect like `sensor_ghosting`);
- ask another soldier to file through her own channel.

**Oversight notices.** Unused and cancelled authorizations accumulate; past a threshold a world clock `oversight_inquiry` advances and the director opens a thread (questions, an audit, a visit). If it fills, oversight acts on her (a reprimand, a transfer threat, a forced Leash on her through the corporation) — the block has an outside limit, and the dynamic is never safe for her either. Using the Leash on a holder to escape is the `force` exit (§9).

## 11. Compromat

During the dynamic (P16 practices, P17 stagings) the holder quietly collects **compromat**: facts tagged `compromat` with `holder: unitId`: what she saw, what she made the commander do, in front of whom. They are hidden facts (P7a hidden sentinels): no reading, count or hint shows them **until she mentions one herself** (F3): `intent_extract` reports `compromat_mentioned { factId? , summary }`, which turns the matching fact (or a new one) known to the commander. Blackmail (§9), her demands, and P16 tasks may use them; her directive lists the ones she holds, never the player's view.

## 12. UI

- **Her dossier › DYNAMIC** (hidden in immersive mode): frame, hold band, domains (claimed / open), leading tracks (bands, not xp), the vow, open tasks and punishments (P16), an exit button with the cost shown as bands. Every row `data-analyze`.
- **CMDR dossier**: "Held by {name}" lines per holder, domains held, worn protocol (P16).
- **Hub**: her quarters show the commander there during holds (P16); a holder's chip on the Tonight list when she has a claim, milestone or aftermath waiting.
- **Scene header**: frame and lead (P9d) chips for a holder.
- **Claims and milestones** use the demand/booking cards and chips; **aftermath** notices are cut-ins in her voice (P10 voices).

## 13. Directives

Ids `dynamic:`-prefixed, derived from state each refresh (never stored): `dynamic:<unitId>` (frame, domains, style line and what she expects of the commander in this scene), `dynamic:aftermath:<unitId>`, `dynamic:leash_block:<unitId>`, `dynamic:command:<unitId>` (to present squad members: who gives orders). Keep away from the prefixes P9, P9b, P9c, P9d, P9e, P11 and P13 reserve. No pronoun for the commander in any of them (lore §0; `tests/content/pronouns.test.ts`).

## 14. New intents and events

Intents: `milestone_accepted`, `milestone_refused`, `compromat_mentioned`, `protocol_slip` (`EVENT_TYPES` grows; `eventDeltas` rows; extraction prompt lists them only when a dynamic at ≥ `play` is present in the scene).
Engine events: `dynamic_started`, `hold_changed`, `frame_changed`, `domain_claimed`, `domain_yielded`, `domain_refused`, `domain_lost`, `milestone_offered`, `sworn`, `dynamic_exit`, `aftermath_started`, `aftermath_ended`, `leash_blocked`, `leash_bypassed`, `oversight_inquiry`, `dynamic_known`.
Actions: `dynamic/answer_claim`, `dynamic/answer_milestone`, `dynamic/exit`, `dynamic/bypass_leash`, `dynamic/set_setup` (cap, seeds, pace, frequency), `dynamic/answer_return`.

## 15. Depth revision (design session 2026-11-19)

Added after the 0.2 depth review. Where it conflicts with §1–§14 above, this section wins. Built on P15a (blocking, moments, contact physics).

### 15.1 Probing: the soft entry

Before any frame there is a **probing phase** on the bands *interest / testing*: small, deniable gestures with no card and no word "dynamic". Who decides what a probe is:

- **The engine decides when, on which axis and how hard.** Registry `probeAxes` (descriptions `AUTHOR TO WRITE`): `space` (takes the commander's seat, thing, way), `small_order` (a request in the tone of an order), `correction` (corrects words, posture, a decision), `decision` (decides a small thing for the commander: food, route, time), `touch` (contact she leads), `public_tone` (speaks slightly down to the commander before others), `claim` (marks the commander as hers before others), `waiting` (makes the commander wait and watches how), `permission` (puts the commander in a "ask me" position), `reversal` (turns the commander's order into a game). Strength by hold band and her style.
- **The main model invents the concrete gesture inside an ordinary scene or DM**: a directive (`dynamic:probe:<unitId>`: "in this scene she tests, small and deniable, whether the commander yields on space; never name it"). No separate call. The gesture varies because it comes from the axis × her card and style × room × slot × who is present × `recent`; nothing authored repeats.
- **`intent_extract` reports the reaction**: `probe_answered { axis, response: yielded | deflected | resisted | returned }` (`returned` = the commander took the lead back) with `tone`. Gestures the model makes on its own with a dominant card may be reported as `probe_observed` at a lower weight; the engine's probes remain the source of truth and the pace.
- No chips, no cards: the player may not notice it was a test. Analyze shows it afterwards, through `Knowledge`.
- Probes and P15a moments share the vocabulary: **a probe is an invisible moment, a moment is a probe with a choice.**

**So that not every woman probes** (author requirement):
- `bond.practice.inclination: none | latent | curious | eager` — proposed by `profile_import` from the card, editable in the wizard. `none` never probes; `latent` starts only from a strong cause (high Impunity, a dynamic she witnessed with `witness: drawn`).
- WORLD PARAMETERS › DYNAMIC: per woman **"may become a holder: yes / no / auto"** (auto = by inclination), and **sensitivity** (sluggish / normal / lively: how much probe answers move her decision and the position axes).
- **Probe queue:** at most N women probe at a time (N = the holder cap, §7); the others wait until someone drops out or a dynamic settles.
- **Refusal works:** consistent deflection is a signal; she backs off for long (`TUNING.dynamic.backoffDays`) and turns to another attitude (respect, hurt, rivalry with the one who succeeded, P17a).

### 15.2 The commander's position (her reading)

The commander's role in the pair, as the holder's style is hers. Not chosen in a menu; it follows from what the commander does.

- **Three axes**, moved by probe answers, moment answers and practice answers (slow averages with hysteresis, so one misread scene changes nothing):
  - **readiness**: yields at once ↔ yields through resistance;
  - **friction**: smooth ↔ provokes; the sign matters: provocation followed by `returned` is play, provocation followed by leaving is real resistance;
  - **motive**: for her ↔ for the dynamic itself ↔ for gain (read from what the commander asks in return and the `tone` of yielding: `sincere | ironic | transactional | flat`).
- **Ten named regions** (names `AUTHOR TO WRITE`, draft): devoted, dutiful (loves protocol), hungry (asks for punishment, wants more), bratty, reluctant, proud (yields only under pressure), calculating, double game (leads from below), elusive (keeps everything ambiguous), hollow (yields without engagement: a warning sign; `cold` does not care, `affectionate` worries, `obsessive` decides the commander thinks of another).
- **It is her reading, not the truth.** Each holder keeps her own position of the commander (`Relation.dynamic.readOf { axes }`); `clinical` reads accurately, `possessive` sees devotion where there is none, `cruel` sees defiance to break everywhere (misreading through P14b appraisal). Two holders can read one commander differently. The DYNAMIC section shows **her** wording, which may be wrong.
- **Words and deeds.** The player may **declare** a position (in the milestone conversation, in the answer to "what do you feel?", P17e); a declaration weighs, but deeds outweigh it over time. The gap is content ("you say you do it for me, but every time you ask for something").
- **Style preference points.** Each style has a point in the axis space (where she wants the commander); compatibility is the distance to it; her long-term aim is to move the commander there (a conflict that can last months). The author writes 8 points and descriptions, not a style × position table.
Draft coordinates (readiness r: −1 yields through resistance … +1 yields at once; friction f: −1 smooth … +1 provokes; play share p: the share of provocations followed by `returned`; motive m: weights over `her / dynamic / gain`; flat: the share of `flat` tone; deflect: the share of `deflected` answers). Regions are tested in this order; the first that matches names the reading:

| Region | Condition |
|---|---|
| hollow | flat ≥ 0.5 |
| elusive | deflect ≥ 0.4 |
| double game | f ≥ 0.3 and m.gain is the largest |
| calculating | f < 0.3 and m.gain is the largest |
| bratty | f ≥ 0.3 and p ≥ 0.5 |
| proud | f ≥ 0.3 and p < 0.5 |
| hungry | r ≥ 0.3 and f ≥ 0 and m.dynamic largest |
| reluctant | r < 0 and f < 0.3 |
| dutiful | r ≥ 0.3 and m.dynamic largest |
| devoted | otherwise (r ≥ 0, m.her largest) |

Style preference points (draft; the author tunes them): `cold` → dutiful; `ritual` → dutiful; `possessive` → devoted with exclusivity; `affectionate` → devoted (motive her); `playful` → bratty; `cruel` → proud or reluctant (resistance to break); `obsessive` → devoted, motive her, no other woman; `clinical` → no fixed point: values a `sincere` tone and penalises double game and hollow.
- Chips such as `[PROVOKE]`, `[TEST HER]`, `[ANTICIPATE]`, `[ASK IN RETURN]` are tied to axis thresholds, never to region names. The same refusal means different things in different pairs (a game to `playful` / `cruel` with a bratty reading; a real offence to `ritual` / `cold`).

### 15.3 The expectation profile

Per woman, generated by `profile_import` from the card (P14 site `profile.expectations`), **editable before the game** in the wizard (a block "Expectations" next to the bond profile), each field with a **lock** (locked = never drifts). In play it is hidden and **revealed** by her corrections, praise and reactions (each a fact); unlocked fields drift through P14b. Subject to P15a `scope` and content gates. Fields:

- **per moment source**: the option she wants and how strongly (one enum + strength per source);
- **her own offset** of her style's point in the position space;
- **tells** for mood reading (what shows her irritation, what her pleasure);
- **`holdsUntil`**: `signal | limit | blackout` (`blackout` only with `breath_play`);
- **worship**: per target (P15a §1.1) her attitude `craves | enjoys | indifferent | dislikes`, *how* (pressure, pace, lips / hands / face, order), and the **meaning** `reward | duty | humiliation | intimacy | play | comfort`;
- **attitude to parts of her body and to shameful acts** (`proud | ashamed | indifferent`; worshipping what she is ashamed of opens `her_weakness`);
- **scent**: a base per body part, hygiene (a trait), used by P17d;
- small traits when needed (ticklish, shaved / not; she may change the latter at will as a reward or a punishment).

**Her expected option without a profile value** (and the default the generator starts from): the option whose response type moves the commander's position (her reading) toward her style's preference point; ties go to `yielded` in a dynamic and to `returned` between equals. A profile value overrides it.

**Lore note for the profile:** the women are bio-constructs, but enhancements are in the head and under the skin; to the eye and to the touch nobody can tell them from a human (overview §10).

### 15.4 Combining the style pair

`style.primary` + `style.secondary` combine by three rules:

1. **Surfacing conditions.** Each style declares (registry `practiceStyles[].surfacesWhen`) when it comes through as the secondary one: `cruel` at peaks of intensity and after defiance or an early signal; `playful` at low stakes in a good mood; `ritual` before others and at the start and end of a scene; `possessive` with a third person, another woman's scent, jealousy; `clinical` with a new practice or a new worship target; `cold` when she is displeased; `obsessive` under threat (another holder, an exit attempt); `affectionate` after a peak, with the commander's wound or weakness. The primary decides by default; while the secondary's condition holds, it decides. Eight conditions instead of 56 pair tables.
2. **Scene phases** (opening, peak, after): with some styles the secondary naturally takes the peak and the primary returns after.
3. **Numbers blend, preferences do not.** Rhythm tempo, window width and similar numbers blend about 65/35 (reversed in the phase the secondary leads). Preferences (`holdsUntil`, worship meanings, expected options) come from her **profile**, not from the style; the style only gives generation defaults.

Example `affectionate` + `cruel`, `holdsUntil: limit`: opening tender with wide windows; at the peak `cruel` surfaces, windows shorten, the first tap is ignored and she holds to the edge but not past it; after, `affectionate` returns: holding, praise, care. Another woman with the same pair and `holdsUntil: signal` lets go at the first tap and is cruel only in words.

### 15.5 Exchange with combat and the squad

A dynamic is not only a cost in slots and authority:
- **her combat form** follows her satisfaction (favour, Want relief, the last practice's verdict): a small modifier, both ways;
- **protection**: a holder shields the commander from other units' Impunity (P9 term, by her standing);
- **cover**: she covers the commander before oversight (P12/P13 suspicion clocks, the oversight inquiry of §10) by style;
- **squad stress**: a content holder steadies the squad (her Want relief feeds P9b mood / stress), a frustrated one does the opposite.

So "refuse her tonight because there is a mission tomorrow" is a real decision.

### 15.6 The dynamic and the relationship (P3 / P9d)

0.2 never said how the two systems meet. Ruling:
- **Blocking, moments, the expectation profile and the pair's habits (P17e) are general** to every close relation; hold, frames and domains are the holder layer on top. Lovers as equals get their own moments (`her_affection`, `her_weakness`, she falls asleep on the commander's shoulder), their own profile ("how she wants to be comforted"), their own habits.
- **`equal` is a full path**, not "nothing happens".
- The two axes are linked but independent: a romantic tier speeds hold for `affectionate` and `possessive` and slows it for `cold`; an ended dynamic drops the romance one step (P3 state transition via `eventDeltas`), never to zero; a broken romance does not end the dynamic by itself (the aftermaths of §9 and the relationship machinery run side by side).
- A secret romance uses P15a's `third_party` source (P3's concealed state).

### 15.7 Offering yourself: the second entry

P16 §9's `[OFFER MYSELF]` chip becomes a mechanic. Probing is her way in; **offering is the player's**.
- **Composed from the vocabularies**: what to offer — a part of the commander or a worship target of hers ("my face is yours"), a posture, a contact, a service activity, time (an evening, a night), the role of an object, endurance ("hold as long as you like": her `holdsUntil` rises to her maximum for that session). Nothing new to author.
- **The body map decides the hit** (§15.9): offering what she craves lands; what she dislikes is a blunder; what is still unknown is a risk and a chance to reveal a zone.
- **Timing matters**: her mood (mood reading), after her hard day, after a won or lost mission.
- **Her answers**: accept / **correct** ("not that — this", a revealed zone) / mock / refuse / "tonight". By style and her reading of the position.
- **No taking it back**: an accepted offer of something a domain covers (time, the body) may become her **claim** (§5). The player can drive the dynamic deliberately.
- **Position**: offering unasked moves the axes toward devoted or hungry; offering with conditions toward calculating.
- **Form**: before others it is a demonstration (P16 §5); in a named posture (P16) it is a ritual.
- **The composer** (a card from the `[OFFER MYSELF]` chip in a scene or DM): tabs part / posture / contact / service / time / role / endurance; entries filtered by scope, content gates, her limits, the commander's current mobility and items; worship targets marked from the body map (known attitude, "?" unknown); one or two entries make an offer (e.g. a posture + a target). Sending puts the offer into the scene (or the DM) as the commander's act; her answer comes as her line plus an outcome chip (accepted / corrected / mocked / refused / tonight).
- Gate: P15 eligibility; with the holder cap reached, offers to a new woman are refused kindly or go through the `others` domain.

### 15.8 Mood reading

Her state is hidden; the player sees **signs**: her tells (profile), her rhythm and distance (P17d), her scent state, her expression, the length of her replies. Reading her right before acting pays: the `her_silence` source (P15a) is where it lives (guess by action / ask / wait), and offering at the right moment lands better. No meter is shown; analyze answers through `Knowledge` only what the commander could know.

### 15.9 The body map

Her dossier gains a **somatic response map** (draft: `docs/drafts/bodymap/` — `bodymap.svg`, `builds.svg` and the generators `gen.js`, `builds.js`):
- a corporate **medical schematic**, front and back (SVG, a neutral silhouette, no anatomical detail), in the style of a Vesper / Kestrel form on the PDA;
- **builds** are width curves over one base silhouette (`slim`, `athletic`, `curvy`; a blend is possible; chosen from her profile), **hair** variants by data (short, bob, long, tail);
- zones come from `worshipTargets` coordinates (draft coordinates: the `front` / `back` arrays in `docs/drafts/bodymap/gen.js`; build curves in `builds.js`); explicit zones appear only with `explicit_scenes`;
- per zone: unknown (grey "?"), attitude colour, **mastery** dots (§15.10), current scent strength as hatching, the worship-meaning icon;
- hovering a zone opens analyze with its sources (the facts that revealed it);
- below the schematic, a list per zone with her corrections and remarks as found notes; readable mode shows only the list;
- later her handwritten marks over the form (P10b) when she has access to the dossier.

### 15.10 Mastery per target

Track xp per worship target per pair: the commander becomes good **at her**. Mastery raises the service verdict (P16) and the hit rate of offers, and unlocks tiers per target; another woman starts from zero.

### 15.11 New state, intents, events

- `Relation.dynamic` gains `readOf { axes }`, `declared?`, `probes { lastDay, queue }`; `Unit.bond.practice` gains `inclination`, `mayHold: 'yes' | 'no' | 'auto'`; `Unit.expectations` (§15.3) with `locked: string[]`; `Relation.mastery { [targetId]: xp }`.
- Intents: `probe_answered`, `probe_observed`, `offer_answered` (with `correction?`), `tone` on answers.
- Events: `probe_issued`, `probe_answered`, `position_shifted`, `offer_made`, `offer_answered`, `zone_revealed`, `mastery_gained`.
- Actions: `dynamic/offer { unitId, composition }`, `dynamic/set_may_hold`, `profile/set_expectation`, `profile/lock_expectation`.
- **Memory check:** `probe_answered` is bookkeeping (not remembered); `offer_answered` with `mock` or `correct`, `zone_revealed` and `position_shifted` across a region boundary get `memoryRules` entries (audience: the pair; a mocked offer before others: those present, spread by P15 §8 only); `zone_revealed` writes a fact the body map reads through `Knowledge`.

### 15.12 TUNING draft (design session 2026-11-19)

Draft balance values agreed with the author for `TUNING.dynamic`, `TUNING.probes`, `TUNING.position`, `TUNING.practice` (P15–P17e numbers that this revision introduced). Physics, moments and scent numbers are in P15a.

**Hold core** (the open decision of this spec):
- Bands: *interest* 0–19, *testing* 20–39, *keeping* 40–59, *owning* 60–79, *possessing* 80–100.
- Gains: task kept +3, punishment accepted +4, service verdict `pleased` +2, staging held +5, followed her lead +1.
- Losses: refusal −4, task broken −5, overrode her −6, the commander's enforcement against her −10.
- Decay after 3 idle days: 1 / day at `play`, 0.5 at `role`, 0.3 at `rule`.
- Pace: slow ×0.7, normal ×1, fast ×1.4. Seeded holder head start: 25.
- With these, an eager holder reaches `play` in about 10 days, `role` in 4–6 weeks, `rule` from 2–3 months (§4 targets).

**Probes:** daily chance per woman on *interest* / *testing*: `curious` 0.15, `eager` 0.30, `latent` 0.05 and only with a cause; × the practice-frequency setting; at most one a day and one a scene. Strength: tier 1 on *interest*, tier 2 on *testing*. Answer → hold: yielded +4, returned +3 (`playful` / `cruel` +5), deflected −1, resisted −3; × sensitivity (sluggish 0.5, normal 1, lively 1.6). `probe_observed` weighs 0.5. Back-off: 3 deflections or resistances among the last 5 → she backs off for 14 days.

**Position:** moving averages: probe 0.10, moment 0.15, practice 0.20. Hysteresis: a region change counts only after its condition holds for 3 updates in a row. A declaration starts at weight 0.5 and fades 0.05 a day. Compatibility with her style point: hold gain ×1.2 (close) … ×0.8 (far).

**Mastery per target:** +5 per act, +3 when the "how" matched; thresholds 20 / 60 / 120 / 200 / 320; the service verdict gains one step per 2 levels.

**Offering:** craves → hold +6, favour +3; enjoys → +3 / +1; indifferent → 0; dislikes → −3 / −2; unknown → the zone is revealed. Good timing ×1.5, her irritation ×0.5. An accepted offer of something a domain covers becomes a claim with chance 0.4 (frame ≥ `role`).

**Exchange with combat and the squad:** content holder → +5 % hit and defence for her, frustrated → −5 %. Protection: other units' Impunity gain against the commander −(her standing × 0.3) %, cap −30 %. Cover: oversight suspicion gain −20 % at `role`, −35 % at `rule`; `cruel` gives half. Squad: content → −1 stress every 2 days to units with Trust ≥ 50 toward her; frustrated → +1.

**Practices (P16, P17e):** named postures: 8 s timer (one exchange in turn-based mode), a new posture per track level, at most 8. Speech as a choice: 4 options, one trap. Habits: 5 repetitions within 14 days with a good verdict; breaking one: favour −2; unused, it fades in 10 days. Litany: 1 line at the start, +1 per milestone, at most 8; more than 2 character errors = a slip.

### 15.13 How the squad learns: three levels of knowledge

Replaces the daily roll of §8 (the reactions of §8 stay). Agreed in the design session 2026-11-19.

**Levels**, per woman, per pair (commander + holder):

| Level | What she thinks | What it gives |
|---|---|---|
| `suspects_close` | "there is something between them" | rumours and teasing; may move a romance's publicity (P9d); opens nothing of the dynamic |
| `suspects_dynamic` | "looks like she gives the orders" | questions and hints, a `her_question` moment from her; her reaction stays cautious |
| `knows_dynamic` | she knows | the full reactions of §8 by her profile (drawn, indifferent, dislikes, rivalry) |

Each is a fact (`hiddenFromCommander` until she shows it in a scene or DM, through `Knowledge`).

**Suspicion** 0–100 per woman per pair: at 60 she `suspects_dynamic`, at 100 she `knows_dynamic`. Without new signs it falls 2 a day (never below the 60 floor once `suspects_dynamic` was reached within the last 7 days).

**Instant knowledge (100 %):**
- she sees an item with `scope: dynamic` on the commander (collar, leash, property tag, gag, …);
- she walks in on a practice in progress (a contact with `scope: dynamic`);
- she watches a demonstration (P16 §5);
- she exposes a staging (P17 §7);
- the holder tells her herself (`audience: select_few` or `show_off`);
- she is shown compromat.

**Signs of a dynamic (added to suspicion):**

| Sign | + |
|---|---|
| `step_behind` before everyone | 15 |
| protocol address in public ("ma'am") | 20 |
| a `protocol_slip` (a habit that slips out) | 20 |
| `kneeling_at_door`, seen | 25 |
| `her_marks` seen | 30 |
| oddities from `remote_toy` in the commander's messages | 10 |
| the commander seen leaving her quarters in the morning | 5 |
| a `held_night`: to everyone at base | 5 |
| background, per day of shared routine: `role` / `rule` | 3 / 6 |
| gossip: per woman who knows / suspects | 5 / 2 (cap 15) |

**Closeness only** (`suspects_close`, +0 toward the dynamic): her scent on the commander (P17d), her scent in the commander's quarters, being seen together, time alone together. Exception: **territory marking** (`watersports`, P17b) adds +30.

**Multipliers:** her perceptiveness ×0.7–1.3 (the same as for scent); closeness to the pair (Trust or Affinity ≥ 50, a friend of the holder) ×1.5; holder `show_off` ×1.5 (she gives signs on purpose), `private_only` ×0.5. At `play` there is no background term (the dynamic lives in scenes).

**Expected pace** (5 named units, holder `select_few`, frame `role`): an ordinary woman suspects in 9–10 days and knows in 2–3 weeks unless a demonstration comes first; the holder's friend about twice as fast.

**Memory check:** `suspects_close`, `suspects_dynamic` and `knows_dynamic` are facts written at their sites (no `memoryRules` entry for them); suspicion values are hidden (a sentinel in `tests/fixtures/analyze/hidden.ts`). Outside the squad only through `public_humiliation` (B4), unchanged.

### 15.14 Head start and the dynamic (P11b)

Agreed in the design session 2026-11-19. P11b lets a campaign begin as if the commander had been at the base for N days. **By default it does not touch the dynamic:** hold 0, no probes behind the scenes, no reading of the position; probing starts on day 1 of the campaign exactly as without a head start, so the player sees the first gestures. P11b's recap contains no probe-like moment in that case.

**Option "The dynamic is already underway"** (WORLD PARAMETERS › DYNAMIC, shown when P11b's head start is > 0 and the dynamic is on; default **off**; global or per woman, like seeded holders, §7):
- for each eligible woman it applies (no RNG draw: hashed like P11b) the outcome of `round(N × daily probe chance)` probes with answers drawn from a neutral spread: starting hold inside *interest* / *testing* (never past *testing*: frames still change only through milestones, §4), and an initial reading of the position from those answers (§15.2);
- P11b's recap may then include up to one **probe-like moment** per such woman (registry `headStartMoments` entries tagged `probe`, one per probe axis kind; texts `AUTHOR TO WRITE`), written by the same `head_start_recap` call; it becomes a fact with audience = the pair;
- the probe queue (§15.1) is filled from these women first; the back-off rule does not start from the head start's answers.
- A seeded holder (§7) with a starting frame keeps that frame; the option only adds the probing history to it.

State: P11b's `SetupResult.headStart.dynamicUnderway` (`true` = all eligible, or a list of unit ids). Memory check: the probe-like recap moments use P11b's `head_start_moment` rule; nothing else is remembered.

## 16. Revision of 2026-11-20 (design session)

Added after the 2026-11-20 design session. Where it conflicts with §1–§15, this section wins. The commander's craft (disciplines, postures, training, records) is **P16b**; the women's own lives and temperament are **P14c**; the physics revision is P15a §16; the practice revision is P16 §R.

### 16.1 Ruling E, revised

The old ruling ("no engine meter for the commander's inner state") becomes:

> **No meter of the commander's feelings.** The engine tracks the commander's bodily responses (tolerance, reflex, skills: P15a §16.8, P16b) and a record of deeds (choices, the stages of a trajectory, records, accepts); thoughts and feelings are written by the player alone; the game only shifts the language of perception (P15a §16.8).

Every reference to "ruling E" or "no inner meter" (P15a §9, P16 §7, P17c §3, P17e §6) reads this wording. The engine never writes a line that tells the player or the model what the commander feels.

### 16.2 Design stance: the player who accepts

The dynamic is built for a player who mostly accepts. Weight comes from what an accept costs and how it is carried out, never from a pressure to refuse:

- **An accept is paid, never punished.** Its currencies: free time (slots), control (P16 §R.6–R.7), knowledge (sealed practices, no duration: P16 §R.8–R.9), reversibility, authorship (own words, the drawn signature), visibility (who will know).
- **The consent ladder** (P16 §R.1) scales the form of an accept with its stakes; the hardest accepts are blind, irreversible, signed by hand, before witnesses, with the calendar handed over, and the record keeps them.
- **The effort lives in execution** (P16b): the player learns together with the commander; difficulty grows with skill at a pace set by her style.
- **Shame without a narrator** (§16.5): the world reacts through people and documents, never through a voice of the game.

### 16.3 Regard

Respect for the commander **as a person**, separate from Trust (the commander as commander), Affinity (warmth) and hold (how much she holds). Low Regard is not hatred: it is another form of relating to the commander (§ forms below).

- **State:** `Relation.regard?: number` 0–100, for **every named unit** toward the commander (non-holders read the dynamic too). Absent = the start value, computed once: 50 + the first-impression offset (P7 presence × her tastes, scaled) − 10 when she `knows_crime` and the crime's `valueReactions` are negative for her.
- **Hidden.** Bands (draft names `AUTHOR TO WRITE`: *esteem* 80+, *respect* 60–79, *neutral* 40–59, *low* 20–39, *none* < 20) are never shown as a meter; the player reads her tone and behaviour. Analyze answers through `Knowledge` with what the commander could notice; immersive mode hides even that. A sentinel in `tests/fixtures/analyze/hidden.ts`.
- **What lowers it — the depth of an act.** Almost always and for almost everyone: each act she takes part in or sees lowers it by the act's humiliation level (P16b posture humiliation with its situational modifiers; a practice's tier and stakes; a contact's tags) × her style factor, down to her style's floor. A collar and "sit on me" for the sake of discipline does not raise the commander in a `ritual` or `cold` holder's eyes; it lowers it.
- **What raises it:**
  - **cost** — an act that came after resistance on that axis (her reading's `readiness` ≤ 0: "it cost a lot, and it was done; I respect that"); the same act from a commander who always yields at once reads "cannot do anything without me";
  - **mastery** — a record in fiction time, a `pleased` verdict at a high tier, "held an hour" (even `cold` respects it);
  - **dignity** — composure under the practice: a braced slap, no begging before the end, no slip, no cheat caught;
  - **value outside the dynamic** — won runs under the commander's orders, P9b feats, help with her own goal and quiet meetings (P14c), a kept promise.
- **Form, not size: style and motive.** Her style (and her reading of the motive, §16.4) decide the **form** of low Regard, which her directive carries as a tone:

| Style | Form of low Regard | Speed | Floor |
|---|---|---|---|
| `ritual` | a thing in its proper place | normal | 0 |
| `cold` | indifference | fast | 0 |
| `cruel` | contempt, enjoyed | fast | 0 |
| `playful` | a toy | normal | 10 |
| `clinical` | a specimen | slow | 10 |
| `affectionate` | tender condescension, a pet | slow | 30 |
| `possessive` / `obsessive` | "mine" — Regard barely matters | very slow | 35 |
| `drill` | a recruit who must improve (rises strongly with growth, falls with stagnation) | normal | 0 |
| `regal` | a courtier at her feet (praise matters) | normal | 0 |
| `vindictive` | a convict serving a sentence (rises slowly as the sentence is served with dignity) | slow | 0 |

- **Effects.** The tone line of `dynamic:<unitId>` and of every named unit's block; the weights of aftermaths (low → `cold_contempt`, `blackmail`; high → `return_offer`, `grief`); witness reactions and the shame mechanisms (§16.5); the nickname's tone. **Regard does not change hold gains or frame transitions.**
- Events: `regard_changed` (bookkeeping), `regard_band_changed`.

### 16.4 Motive, extended

The motive part of the commander's position (§15.2) grows from three weights to five, read from tone, what the commander asks in return, declarations and deeds:

| Motive | Read from |
|---|---|
| `order` | belief in hierarchy and discipline: keeping protocol unasked, "rules are rules", tone `sincere` on duty |
| `fear` | yielding right after a threat, an enforcement or a slap; tone `flat` under pressure |
| `her` | love: unasked care (P16b), yielding to her mood, declarations about her |
| `process` | the act itself: asking for practices, the stimulus trajectory toward `craving` (P15a §16.8) |
| `gain` | what is asked in return, tone `transactional` |

The region table of §15.2 reads `m.dynamic` as the larger of `order` and `process`: `dutiful` needs `order` largest, `hungry` needs `process` largest; a new region **`cowed`** (draft name) is tested after `elusive`: `fear` is the largest weight. `cold` and `ritual` despise `cowed`; `cruel` and `vindictive` enjoy it without respect; `affectionate` worries.

### 16.5 Shame without a narrator

Principles: no voice of the game ever judges; shame comes from a particular person or a document; profiles keep it ambivalent (a `drawn` witness envies or is curious); the harder the act, the quieter the reaction; shame is not a penalty (it moves Regard and tone, almost no numbers).

- **Disappointment instead of anger.** A named woman who is not the holder, whose Trust was ≥ 60 (the one who believed in the commander) and whose Regard falls a band: she does not argue; she stops coming for advice (her small habits of respect, P14b habits tagged `respect`, lapse quietly), and in scenes with both she addresses the holder rather than the commander. The directive forbids a lecture. Event `disappointed` (memory: §16.8).
- **The question without a good answer.** A `her_question` moment (P15a) from a woman whose Regard is falling but above *none*, or who `knows_dynamic` with `witness: dislikes`: "why do you let her?". Options honest / what she wants to hear / silent; none is scored as right; her Regard moves a little by her own profile (`clinical` values the honest answer, `affectionate` the gentle one). Cooldown 14 days per woman.
- **The nickname.** P9 deeds and reputations gain deed kinds from the dynamic (protocol seen in public, a demonstration, public worship, being spoken for, a slap before subordinates, kneeling at a door); the nickname the squad gives (P9 `reputations`) takes its tone from the squad's average Regard: respectful, mocking or pitying (candidates `AUTHOR TO WRITE`). It reaches the directives as P9 nicknames do (triggered, P14c §0).

### 16.6 Three new styles

`practiceStyles` gains (descriptions `AUTHOR TO WRITE`):

- **`drill`** — the instructor: holds so that the commander improves. Norms, weekly exams (P16b §11), explains mistakes most willingly, values growth. The most natural character for a military base.
- **`regal`** — the vain: wants to be admired. Worship is central; she demands praise in the commander's own words and holds audiences (P16b §11).
- **`vindictive`** — retribution: holds because the commander deserves it (the crime, being an officer, a former squad); her hold is a sentence with a term (P16b §11).

Where each enters:
- **Surfacing conditions** (§15.4): `drill` when the commander slips or stagnates (no skill growth in 7 days) and at the start of a training; `regal` before others and when she is praised or ignored; `vindictive` when the crime is mentioned, after a failed run under the commander's orders, and on the anniversary of the commander's arrival.
- **Preference points** (§15.2): `drill` → dutiful, and compatibility also grows with P16b skill growth; `regal` → devoted, motive `her`; `vindictive` → reluctant or proud (a resistance she breaks as a sentence).
- **Aftermaths** (§9): `drill` → `cold_contempt` or `return_offer` ("after a punishment"); `regal` → `revenge` or `pursuit`; `vindictive` → `blackmail` (the crime, compromat) or `revenge`.
- Physics (P15a §16.12), tactics (P17 §6), severity and ceremony (P16), contracts (P17a §2), her weakness (P17e §3), the "why" of objectification (P17b §2), the rhythm of her typing (P17d §5) list them in their own sections.

### 16.7 New holder fields

`bond.practice` gains three fields (proposed by `profile_import`, edited in the wizard and the dossier, lockable like the expectation profile; no drift in 0.2):

- **`fairness: fair | strict | capricious | unfair`** — independent of style (a fair `cruel` and a capricious `affectionate` both exist). Read by P16 §R.10: punishment without guilt, double standards, cancelled rewards, moved goals.
- **`hintStyle: offers | hints | expects`** — how she invites: `offers` says it, `hints` hints (P17d rev. 2026-11-20 armpit hints and every `her_offer` moment), `expects` waits to be understood; a missed hint at `expects` is a quiet disappointment, a caught one is a mood-reading bonus.

- **`drive: low | moderate | high`** — how fast her desire (P9d Want) grows: a trait of the character, not of her style. Growth is uneven: a hashed noise term and her `volatility` (P14c) on top of the base; her mood and jealousy speed it, stress, an injury or a bad day slow it; it falls after relief. How she pursues it is P17b rev. ("her desire").

Temperament for every named unit (`talkativeness`, `volatility`, `humor`) is P14c §1; this package reads `talkativeness` for silent use and `humor` for her mock answers.

### 16.8 State, events, memory check

- State: `Relation.regard?`; the five motive weights in `Relation.dynamic.readOf`; region `cowed`; `bond.practice.fairness`, `bond.practice.hintStyle`, `bond.practice.drive`; `practiceStyles` rows `drill`, `regal`, `vindictive`.
- Events: `regard_changed`, `regard_band_changed`, `disappointed`, `regard_question_asked` (the moment), `nickname_given` (P9's, with new deed kinds).
- Memory check: `disappointed` → a `memoryRules` entry (audience: her; `hiddenFromCommander: true`; importance mid; the commander sees only the behaviour); the question moment → P15a §13 (`her_question` is tagged `remember`); Regard changes and bands → bookkeeping (hidden); the nickname → P9's existing site.

### 16.9 TUNING draft (2026-11-20)

| what | value |
|---|---|
| Regard fall per act | humiliation (0–5) × 1.5 × style factor: `cruel` 1.3, `cold` 1.2, `ritual` 1.0, `regal` 1.0, `playful` 0.9, `drill` 0.8, `clinical` 0.8, `vindictive` 0.7, `affectionate` 0.5, `possessive` 0.4, `obsessive` 0.3; a witness who is not the holder × 0.7 |
| Regard rises | cost +3, a record +2, `pleased` at tier ≥ 4 +1, dignity +2, value outside the dynamic +1…+4; `drill` doubles mastery, `regal` doubles praise kept, `vindictive` +1 per 7 days of the sentence served without a slip |
| disappointment | Trust ≥ 60 at the time and a fall across a band within 14 days |
| the question | cooldown 14 days per woman; at most one a week overall |
| motive weights | moving average 0.15; `fear` reading after a threat or a slap within the same exchange |

## Acceptance criteria

1. With no practice category enabled, or holders `0`, nothing in this package runs, and every seeded test stays byte-identical (no new draw unless someone is eligible).
2. The practice section imports, validates (hostile fields sanitised), edits and re-syncs; `ownLimits` and disabled categories always read as `none`.
3. Hold rises and decays by the rules; bands and frames change only through milestones; the vow makes exit a break.
4. Domains are claimed, yielded, refused, lost and contested; capabilities are read by type; the command domain reuses P13's override machinery without the implant Leash on the commander.
5. Holder cap, seeds and starting frame work; lowering the cap ends nothing.
6. The squad learns of `role`/`rule` dynamics and reacts by profile; outside perception changes only through `public_humiliation`.
7. Every exit route works with its cost; aftermaths are chosen by profile and run to an end; `command_kept` returns command only through the power struggle.
8. The Leash block holds requests; each bypass works with its discovery roll; oversight's clock and thread fire.
9. Compromat is invisible to every reading until mentioned; the hidden-sentinel test covers it.
10. Immersive mode hides the section and bands and keeps the events.
11. Every new stat, chip and card carries `data-analyze`; every generation goes through P14.
12. (§15) Probes run on the engine's schedule as directives, never all women at once (inclination, may-hold, queue, back-off); the position is per holder, moved by answers, shown in her words; the expectation profile is generated, editable and lockable before the game and revealed in play; the style pair follows the three rules; the dynamic gives combat and squad effects; equals use the general layer; offering composes from the vocabularies and can become a claim; the body map shows only what the commander knows.
13. (§16, 2026-11-20) Ruling E reads in its revised wording everywhere; Regard exists for every named unit, starts from first impression and crime knowledge, falls with the depth of acts and rises with cost, mastery, dignity and value outside the dynamic, never changes hold or frames, and stays hidden (sentinel); the five motive weights and the `cowed` region work; disappointment, the question and the nickname follow §16.5 with no narrator line; `drill`, `regal`, `vindictive`, `fairness` and `hintStyle` import, validate, edit, lock and are read by type.

## Open decisions (author)

- Names of the hold bands, frames and domains in the UI; milestone texts; aftermath texts; style descriptions.
- Every number in `TUNING.dynamic`: drafts agreed in §15.12 and §15.13 (squad knowledge).
- Whether `rule` without the command domain is possible (draft: yes; `rule` over the private domains only).
- (§16) Regard band names, the forms-of-low-Regard wording per style, the `cowed` region name, nickname candidates by tone, descriptions of `drill`, `regal`, `vindictive`, `fairness` and `hintStyle` values.

## Interfaces already provided by P14c (implemented — use, do not rebuild)

- **Quiet meetings are value outside the dynamic** (§16.3 Regard): a finished quiet meeting writes the relation event `time_together` (Affinity +2 through the gain handler, her stress −5, a history entry of that type, `LifeUnit.meetingDay`) and, for her hobby, `Commander.hobbySkill`. Count them from the relation history (`type: 'time_together'`) or `meetingDay`; do not add a second counter. `pastimeProblem` / `availablePastimes` decide who may have one (Affinity above −30, not deserting, not restricted, once a day).
- **`temperamentOf(state, unitId)`** (`talkativeness`, `volatility`, `humor`, with the defaults `terse` / `steady` / `dry`) is the only reader of her temperament; §16.7 adds the holder-only fields on top of it.
- **First moments** (`LifeUnit.firsts`, the six kinds of `FIRST_KINDS`, once per pair) and running jokes (`LifeUnit.jokes`, habit `running_joke`) are the pair's own memories; a staging may read them through the facts they write (`first_<kind>`, tag `first`).
- Keep new directive ids away from `life:`; no rng draw (`lifeChance` / `lifeHash` hash a key with the salt); read life content by field, never by id. Details: P14c **Implemented as**.

## Interfaces already provided by P9d (implemented — use, do not rebuild)

- `bondOf`, `validateBond`, the `bond` section of `profile_import` and re-sync; `contentAllowed(state, reg, entry, unitId?)`, `CONTENT_GATED_REGISTRIES` + `GATE_PROBES` for new tagged registries; `decideLead`; `wantOf`/`relieveWant`; rules (`rulesOf`, `activeRules`, the `intent` check); `setPublicity`. Read tiers by `bondTier`, never state ids.

## Interfaces already provided by P9c (implemented — use, do not rebuild)

- `deviceAccess` (derived; the `device` domain raises a floor, it stores nothing), intercepts of Leash requests, bookings (`bookingKinds`, conflict resolution, `refuseLikeDemand`), `addSecret` / squad secrets, `forgetPersonal` on removal (P15 adds its own forget step to `removeFromService`).

## Interfaces already provided by P9 / P9b (implemented — use, do not rebuild)

- Demands (`openDemand`, `answerDemand`, chips), Impunity terms (add a `dynamic` term), `enforce` for any punishment the commander applies to her, deeds and reputation; P9b `leaderOf`, `standingOf`, `computeHierarchy`, outside perception and `noteFeat`, `registerVoteGate` for `command_kept` struggles.

## Interfaces already provided by P13 (implemented — use, do not rebuild)

- **The override:** `OverrideSource { kind, unitId, authority, leniency, expectations }` and `rollOverride(draft, ctx, order, { judged?, source?, payload? })` take the holder in `source` (the warden's is `wardenSource`); `overrideChance(weight, source)` is `clamp(weight × authority × leniency × 2.0, 0, 0.9)`; `answerOverride(draft, ctx, overrideId, 'comply' | 'argue' | 'defy')` and `runOrder(draft, ctx, order, base)` run the answer; `WardenOrder` is the closed list of what can be overridden (activity, roster, expedition, major dilemma, combat order). The state is `leashswap.warden.override`, so a second holder needs its own slot for an open override, and `overrideOpen` / `wardenArgueStart` / the `dispatch` guards read that one.
- **The chip:** `renderOverrideChip(host, state, reg, onAnswer)` (`WARDEN OVERRIDE — {alternative}`, `[COMPLY] [ARGUE] [DEFY]`, `aria-disabled` while compelled); ARGUE outside combat opens a scene through `app.warden.argue()` and is resolved by `compromise_reached` with an `overrideId` (`resolveCompromise`, `argueEnded`); in combat it is one seeded roll (`argueChance`).
- **The co-sign:** `rollCosign(draft, ctx, targetId, kind)` / `cosignChance` / `logCosignDenied` (a `denied` log entry with `cc: 'warden'`); with nobody holding the leash it is ok without a draw.
- **Punishing the commander:** registry `commanderPunishments` (a closed effect vocabulary read by `type`: `commander_stress`, `restrict`, `lose_slots`, `squad_record`, `injury`, `leash`), `applyCommanderPunishment(draft, ctx, id)` (needs a warden), `applyRemotePunishment` (does not), `pickPunishment`, `punishRoll`, `commanderRestriction`, `leashCommander`, `addDefiance` / `checkEscalation`, `commanderDies` and the `campaign_ended` guard. A P15 holder with her own ladder adds entries to the registry rather than a second registry.
- **Removal and the investigation:** `removeFromService(draft, unitId, status, ctx?)` returns events and opens the warden's removal; `startRemoval` / `rollVerdict` are P13's own and assume one holder.

## Interfaces already provided by P14 (implemented — use, do not rebuild)

- **Every model call goes through the envelope** (`app.generations`, `src/llm/envelope.ts`): `generate(siteId, key, opts?)`, `retry`, `reroll`, `rerollState`, `drop`, `useFallback`. `callLlm` is imported by that module alone (`tests/architecture.test.ts`).
- **A package that adds a call type or a flavor kind registers its site in the same change:** a `SiteDecl` in `src/llm/sites.ts` (`id` like `<area>.<what>`, `callType`, `surface`, `reroll` mode, `record` mode, generic `label`, glossary id) and the handlers bound by the owning controller (`envelope.bind`: `build` rebuilds the input from the state, `apply` runs the same engine action as before, `fallback`, `committed` / `undo` for the reroll mode). `tests/llm/siteRegistry.test.ts` fails for a call type or flavor kind without a site; the architecture test refuses a direct `callLlm`.
- **A failure** is `refused`, `truncated`, `timeout`, `network`, `invalid_output`, `empty` or `no_profile`; the envelope writes a record (`CampaignState.generations`, at most 20, no prompt, no model text, `detail` never the model's words) unless the site's record mode is `none` or the reason is `no_profile`. Add the chip with `drawGenerationChips(host, ctx.generation, state, surface, filter)` and REROLL with `drawSiteReroll`; a screen draws neither without `generation` in its context. Labels are generic: never put a hidden value in one.
- **The engine decides:** a retried or rerolled value goes through the same sanitizer and the same action as the first one; none of the new actions draws from the rng, so a new site must not either (a seeded test that moves stops and reports).

## Interfaces already provided by P11b (implemented — use, do not rebuild)

- `SetupResult.headStart.dynamicUnderway` (`boolean | cardRef[]`) is typed and validated by `validateSetup`; P11b otherwise ignores it. `CampaignState.headStart` holds `days` and the known units.
- `pickMoments` excludes every `headStartMoments` entry tagged `probe`; §15.14 lifts that for the units the option names (add the entries, then let the picker see them).
- `headStartHash(seed, unitId, key)` / `headStartRaw` (`src/engine/headStart/hash.ts`) is the hash to reuse: `fnv1a(<seed>|<unitId>|head_start|<key>)`, no rng draw.
- `head_start_moment` is the memory rule to reuse (`head_start_moment_1…5` by importance, audience = the unit). A probe-like moment is written by the same `head_start_recap` call and `head_start/recap` action.
- `applyHeadStart` runs after `applyFirstImpression` and before the world, the warden and the prologue read the relations: a dynamic-underway step belongs after it.

## Interfaces already provided by P14b (implemented — use, do not rebuild)

- **Effective profile:** `valuesOf`, `likesOf`, `dislikesOf`, `tastesOf`, `bondOf`, `effectiveProfile`; a practice attitude or a style that must drift is read through the same kind of reader (add it to `engine/development/profile.ts` and to the readers guard).
- **Axes as data:** `developmentAxes` entries by `kind` (`value`, `bond`, `taste`, `like`, `dislike`); P15's practice attitudes (`as`, `witness`) and styles are **new axis kinds plus registry rows** (`axisKind`, `axisEntry`, `axisForbidden`, `room` in `review.ts` and `applyShift` are the places a kind is taught), never ids in code. `bond.ownLimits` and disabled categories stay forbidden.
- **Appraisals:** `recordAppraisal(draft, reg, unitId, event, role)` / `recordWitnesses` / `recordActivity` store how a soldier read an event; a practice event adds an `eventDeltas[].appraisal` row (or the model's `reading`) and `developmentRules` rows. Misreading and revision are automatic (no rng draw).
- **Counters and habits:** `countActivity`, `countCompanions`, `countRun`, `checkHabits`, `habitEffect`; `habits` rows are read by `counter.kind`. P17e's emergent rituals can use the same `Development.counters` keys (`activity:<id>`, `companion:<id>`, `region:<id>`; add a key kind and a registry `counter.kind`).
- **Quiet moments:** a discrete change is a `DevMoment` stamped at `scene/start` and shown at `scene/end`; the scene carries the directive `development:<unitId>`; keep new directive ids away from it.

## Interfaces already provided by P15a (implemented — use, do not rebuild)

P15a is implemented (see its **Implemented as**: rulings R1–R16). It built the parts below as hooks or data only; this package completes them.

- **Categories already added by P15a:** `service`, `denial`, `exposure_risk` (with `requires` support on `contentCategories`). Do not add them again; add their profile entries and mechanics.
- **The frame gate:** every `scope: dynamic` blocking entry and moment source is off until a frame reader is registered (`registerFrameReader(fn)`, frame ≥ `play`). Register `registerBlockingGate(fn)` too, so a dynamic without a romantic or close state makes the blocking live (B1).
- **Physics stand-ins to replace:**
  - `registerPhysicsStyle(fn)` gives the style pair and the phase that leads; until then the style is `neutral`. `TUNING.physics.style` already has a row per style key.
  - `registerHoldsUntil(fn)` gives `holdsUntil` (`signal` until then).
  - `registerExpectation(fn)` gives her expected moment option and its strength (until then: the `returned` option, else `yielded`, strength 1).
- **Moments as probes:** `moment_answered { type, gap, tone, via }` moves no axis in P15a. The position axes and her reading of them are yours to move from it.
- **Power-laden sources:** `her_demand` and `compromat_hint` are live only through `registerMomentTrigger(sourceId, fn)`.
- **Not built:** the `notice` channel reader (squad knowledge, `knows_dynamic`); worship meanings per target; tells (blocking.md §12); the body map (the `worshipTargets[].zone` coordinates are stored as placeholders); the insult when she sees the commander avoid her scent while her meaning is `intimacy` (a hook in `applyWay`).
- **Cheats and slips:** what `physics_caught` / `physics_slip` cost in Regard and the motive is yours.
- **Where her skills live:** `Relation.herSkill` (seal, weight, reading, swing, rhythm) is on the relation, **not** inside `Relation.dynamic`.
- **Registered by you, read by P15a:** `registerFrameReader`, `registerBlockingGate`, `registerExpectation`, `registerPhysicsStyle`, `registerHoldsUntil` and `registerMomentTrigger` are exported from `src/engine/blocking` / `moments` / `physics` (`resetBlockingHooks`, `resetExpectations`, `resetPhysicsHooks`, `resetMomentTriggers` are the test resets). **Readers stack and the first non-null answer wins**, so register once at start-up.
- **Events to read:** `moment_answered { momentId, sourceId, unitId, key, responseType, gap, via, tone?, escalated?, verb? }`, `physics_caught`, `physics_slip`, `physics_outcome { result, holderId }`, `marathon_done`, `her_skill_gained`.
- **Off is byte-identical:** the P15a guard (`tests/blocking/unaffected.test.ts`) compares a week against the committed golden; a hook you register must keep a campaign with no dynamic unchanged.
