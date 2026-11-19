# P15 — The Dynamic: Hold, Frames, Domains, Exit

**Status: spec.** Release 0.2 (post-release). **Depends on:** P15a (blocking, moments, contact physics), P3 (relationship graph, facts, intents), P9 (Impunity, demands, punishments), P9b (hierarchy, outside perception), P9c (device access, bookings, secrets), P9d (bond profile, content categories, lead, Want, rules), P13 (LEASHSWAP: the countermand and co-sign machinery reused by the command domain), P14 (generation envelope), P7a. **Read:** overview; this file; the **Implemented as** of P9, P9b, P9c, P9d and P13; `docs/content/lore.md` (§0).

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
Style = 'cold' | 'playful' | 'cruel' | 'ritual' | 'possessive' | 'affectionate' | 'clinical' | 'obsessive'
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

A dynamic at `role` or `rule` is noticed even without `public_humiliation` (E4): protocol in public, the commander's absences in her quarters, tasks done in sight. Each named unit learns of it by a seeded roll per day she shares the commander's routine (higher at `rule`, with `audience: show_off`, with witnessed practices), producing a fact (`knows_dynamic:<holderId>`).

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

## Open decisions (author)

- Names of the hold bands, frames and domains in the UI; milestone texts; aftermath texts; style descriptions.
- Every number in `TUNING.dynamic` (gains, decay, band thresholds, seed head start, discovery chances).
- Whether `rule` without the command domain is possible (draft: yes; `rule` over the private domains only).

## Interfaces already provided by P9d (implemented — use, do not rebuild)

- `bondOf`, `validateBond`, the `bond` section of `profile_import` and re-sync; `contentAllowed(state, reg, entry, unitId?)`, `CONTENT_GATED_REGISTRIES` + `GATE_PROBES` for new tagged registries; `decideLead`; `wantOf`/`relieveWant`; rules (`rulesOf`, `activeRules`, the `intent` check); `setPublicity`. Read tiers by `bondTier`, never state ids.

## Interfaces already provided by P9c (implemented — use, do not rebuild)

- `deviceAccess` (derived; the `device` domain raises a floor, it stores nothing), intercepts of Leash requests, bookings (`bookingKinds`, conflict resolution, `refuseLikeDemand`), `addSecret` / squad secrets, `forgetPersonal` on removal (P15 adds its own forget step to `removeFromService`).

## Interfaces already provided by P9 / P9b (implemented — use, do not rebuild)

- Demands (`openDemand`, `answerDemand`, chips), Impunity terms (add a `dynamic` term), `enforce` for any punishment the commander applies to her, deeds and reputation; P9b `leaderOf`, `standingOf`, `computeHierarchy`, outside perception and `noteFeat`, `registerVoteGate` for `command_kept` struggles.

## Interfaces to be provided by P13 (implemented before 0.2)

- The override formula and chips (`COMPLY / ARGUE / DEFY`), the co-sign of squad Leash requests, `compromise_reached` resolution and the commander punishments registry. P15's command domain calls them with the holder in place of the warden; the plan confirms the exact names once P13's **Implemented as** exists.
