# P15 — The Dynamic: Hold, Frames, Domains, Exit

**Status: implemented** (plan: `docs/plans/2026-11-21-p15-dynamic-core.md`; automated tests pass, the in-SillyTavern checklist `docs/MANUAL_TEST_P15.md` still has to be run by hand). Where this draft and the code differ, the code wins: see **Implemented as** at the end. Release 0.2 (post-release). **Depends on:** P14c (temperament, the women's own lives: §16), P15a (blocking, moments, contact physics), P11b (head start: §15.14), P3 (relationship graph, facts, intents), P9 (Impunity, demands, punishments), P9b (hierarchy, outside perception), P9c (device access, bookings, secrets), P9d (bond profile, content categories, lead, Want, rules), P13 (LEASHSWAP: the countermand and co-sign machinery reused by the command domain), P14 (generation envelope), P7a. **Read:** overview; this file; the **Implemented as** of P9, P9b, P9c, P9d and P13; `docs/content/lore.md` (§0).

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

## Implemented as

Thirteen chunks (a)–(m), 49 tasks: (a) the profile as data (the 11 registries and enums, the practice section, the expectation profile, import and re-sync, the editors, drift through P14b axes); (b) setup, the gate and removal; (c) hold, the landing hook and the P15a hooks; (d) probes, her reading of the commander's position, the style pair, the seven intents, the directives and the controller; (e) milestones, frames and the vow; (f) domains, capabilities and the command domain (P13's override generalised); (g) how the squad learns (signs, suspicion, three levels) and its reactions; (h) exit routes and aftermaths; (i) the Leash block, the bypasses, oversight and the holder's cover, compromat; (j) Regard and shame without a narrator; (k) exchange with combat and the squad, the head start; (l) offering, mastery, the offer composer, the body map; (m) the DYNAMIC dossier section, the CMDR lines, the frame chip and her notices, `Knowledge.dynamic`, the hidden sentinels, the unaffected guard and the manual test; then this task (docs). Three reviews (a–d, e–h, i–m) found no Critical issue; every Important issue and most Minor ones were fixed with a test that failed first (see **Fixed after review**). Automated tests at the end: **627 files, 9594 tests, all passing** (baseline before P15: 569 files, 8715 tests). The in-SillyTavern checklist `docs/MANUAL_TEST_P15.md` (14 steps) has **not** been run by hand. Where this draft and the code differ, the code wins.

### The rulings (copied from the plan, as built)

- **R1 — what is built and what waits (user).** All of §1–§16 is built except the producers that belong to P16 and later. **Hold gains with no producer** (the rows exist in `TUNING.dynamic.gains` and `holdFeed` maps them, so a P16 event of that type feeds hold at once): `task_kept` +3, `punishment_accepted` +4, `service_rated` with `kind: 'pleased'` +2 (the encoding of a verdict is a guess; P16 may change it), `staging_held` +5, `task_broken` −5. **Gains P15 produces:** probe answers, `followed_lead`, `rule_accepted`, a granted *desire* demand, an accepted offer, a `drawn` witness's own step, the `successor` push and COMPLY on her override; **losses:** refusals of her claims, milestones and demands, `rule_broken`, `overrode_her`, `commander_enforced` on her, DEFY, `milestone_refused`. Not a source: a moment answer (it moves only the reading), `rule_kept`, an accepted milestone. **Track xp has no producer**: tracks exist, decay and cap, and every level stays 0 until P16, so a milestone that needs a track level (`first_night_held`) is unreachable before P16; `first_protocol` needs none, so `role` and `rule` are reachable with P15 alone. **Favour** (−20…20, 1 a day toward 0) moves from offers and from COMPLY / DEFY; P16 adds verdicts and moment gaps. **Her discipline of a refusal at `role`** is `refusal_noted` bookkeeping (`Relation.dynamic.refusals`); her directive says she will answer it (P16). **The contest at `rule`:** refusals and DEFY within 14 days count into `contest`; at `TUNING.dynamic.contestAt` (3) she opens a *submit* claim card (`OpenClaim.submit`, `[YIELD] [REFUSE] [TALK]`); YIELD and REFUSE both clear `contest`; REFUSE costs hold and adds `contestImpunity` (5) to the Impunity record of each unit who `knows_dynamic`. **Not built:** practice generation in a domain (`body_conditions`, `household_protocol` are stored and read by `capabilitiesOf`, nothing generates a practice from them), the moment sources `her_demand`, `her_test`, `permission`, `summons`, `rule_collision`, `ritual_due` (`compromat_hint` and `her_question` are wired), staging reactions, and the position chips `[PROVOKE]`, `[TEST HER]`, `[ANTICIPATE]` (only `[ASK IN RETURN]`, the offer composer's toggle, exists). Her handwritten marks on the body map are a P10b follow-up.
- **R2 — when the dynamic is on, and eligibility.** `dynamicOn(state, reg)` is the one gate: `state.dynamic` exists, `setup.holders !== 0` and some practice category is enabled. **`herPracticeLive(state, unitId)`** is its per-unit twin for readers that have no registry: true when a category of her practice section (drift folded in) with `as ≠ none` is enabled and not in her own limits; **every P15a hook reader answers null unless it is true**, so switching her categories off makes the frame, style, holds-until, blocking-gate and expectation readers defer, and switching them back on restores `role`. It reads a module-level list of practice categories recorded by `practiceCategories(reg)` (fallback: any category when never recorded). `practiceOf` reads **only practice categories** (a model that names `worship` as a practice gets it dropped with an issue). `canHold` follows R2 with these rulings: **`mayHold: 'yes'` overrides inclination `none`** (spec §15.1 "auto = by inclination": `effectiveInclination` reads `curious` for a `yes` unit whose profile says `none`; probing reads it, never the raw field); `holdersAtPlay` counts living named units only; **a unit in her own aftermath is not eligible** (`canHold` says "her aftermath is still running"; `answerReturn` passes `ignoreAftermath`), so a former holder cannot be offered `first_yes` during it; once it ends she is eligible again. A unit that stops being eligible keeps her `Relation.dynamic`; lowering the cap ends nothing.
- **R3 — setup and settings.** `CampaignState.dynamic` is as planned plus `salt` (the setup seed, or `fnv1a(JSON.stringify(rng))` when `dynamic/set_setup` creates the block mid-campaign; no draw), `noted` (day stamps that the style conditions need: `enduranceDay`, `crimeDay`, `praisedDay`, Regard marks) and `open.exits`; `oversight` holds `{ blocked, threadId?, holderId?, threat?, requests?, pass? }`. `buildCampaign` writes the block **only** when `r.dynamic` is present and a practice category is on (an equal build otherwise). **Seeds** (`seedProblem`) need `canHold` without the cap and, by ruling at setup, **`leadRank ≥ assertive`** (the Impunity route cannot exist on day 0): the wizard warns and does not seed; `startFrame` only on a seeded unit; a seed past the cap is ignored and lowering holders drops the last seeds. Seeds changed mid-campaign add `seedHold` once and never a frame. `dynamic/set_setup` throws with no block and no practice category; `dynamic/set_unit` throws without a block. SYS shows the holders select as `0` while there is no block (choosing 1 then creates it). Global setting `dynamicHidden` (SYS › Display, UI only). Campaign fields (WORLD PARAMETERS › DYNAMIC and SYS › Dynamic): holders, pace, frequency, per unit may hold, sensitivity, seeded, starting frame; "the dynamic is already underway" only with a head start.
- **R4 — the 11 registries.** `practiceStyles`, `holdBands`, `dynamicFrames`, `dynamicMilestones`, `dynamicDomains`, `dynamicTracks`, `probeAxes`, `positionRegions`, `aftermaths`, `regardBands`, `dynamicSigns`, all in `REGISTRY_NAMES` and `DESCRIBED_REGISTRIES`; all but `positionRegions` are `PLAYER_VISIBLE` (`HIDDEN_DESCRIBED`: region names are hers and reach the player only through her reading). `dynamicMilestones` and `aftermaths` are in `CONTENT_GATED_REGISTRIES` (each with a `GATE_PROBES` entry). Differences from the draft: **`dynamicFrames[].promptHint` is required** (R23 reads it); **`dynamicSigns` may carry `contentTags`** but are not gated by the generic gate: the producer is the gate (`contentAllowed(state, reg, row)` before every sign, tested with `territory_marking`); **`practiceStyles[].aftermathBias` does not exist**: the style's pull on an aftermath is written once, in `aftermaths[].weights.styles`; **`AftermathWeights.values` is signed** (`{ axis: { high?, low? } }`); `AftermathWeights` has `base`, `styles`, `values`, `regard`, `frames`, `sworn`, `command`, `needsCompromat`, `needsCommand`, `mild`; aftermath kind uniqueness is asserted on the core pack only (a fixture pack needs duplicates). The core data: 11 styles, 5 hold bands, 4 frames, 9 milestones, 6 domains, 10 tracks, 10 probe axes, 11 regions, 9 aftermaths, 5 Regard bands, 23 sign rows; `restraint`'s description widened to sensory control. The closed enums are in `src/engine/dynamic/types.ts`.
- **R5 — the practice section** (`bond.practice`). `validatePractice` is field by field; `practiceOf` is the only reader; a disabled category or one in her own limits reads `as: none`. Import is a section of `profile_import` (budget +300, offered only while a practice category is on; never critical); the PRACTICE block is an `ImportSection` in the calibration and an editor in the dossier **while `!editLock`** (the profile is hidden in play, so the dossier does not draw it disabled as P14c does). Locks: `Unit.practiceLocks` (style, audience, fairness, hintStyle, drive, inclination, `categories.<id>`); re-sync keeps locked fields. The wizard's `applySection` fall-through that wrote `likes: undefined` for the three P14c sections is fixed (no existing test moved); `tests/fixtures/profile_import/no_practice.txt` pins the prompt of a campaign with no practice category, made from the pre-change code.
- **R6 — the expectation profile.** `validateExpectations` and `expectationsOf` as planned (`blackout` honoured only with `breath_play`; worship targets whose category is off or in her limits are dropped; a text with a pronoun for the commander is dropped whole, never rewritten; texts cut and stripped). Section `expectations` of `profile_import` (budget +400). **In play it is hidden**: a field becomes known only through a fact (`zone_revealed`, her corrections, praise); the fact's tag is **`expect_worship_<id>`** / `expect_<field>` (the fact store strips `:` and `.` from tags; `zoneTag` / `expectTag` in `zones.ts`). `revealedExpectations` shows worship and body entries whole once their zone is shown, `tells` / `holdsUntil` / `scent` / `traits` by `expect_<field>`, never `moments`, `offset`, `build`, `hair`. Drift: axis kinds `practice` (`practice:<category>.as`, `.witness`, `practice:style.secondary`) and `expect` (`expect:holds_until`, `expect:worship.<target>`), five `developmentAxes` rows; locked fields are `axisForbidden`; `fairness`, `hintStyle` and `drive` never drift; the `secondary` scale order (gentlest to harshest) is `AUTHOR TO TUNE`.
- **R7 — the state on the relation.** As planned. Additions: `DynamicRelation.served` (Regard bookkeeping for `vindictive`), `HerReading.sincere` (the `clinical` compatibility formula needs a sincere share; old saves read 0), `AftermathState.struggleWins`, `formerHolder.successor`. `ensureDynamic` is called only by `addHold` for an eligible unit; **a loss never creates a dynamic**. `forgetDynamic` joins `removeFromService` (after `forgetPersonal`, which now returns the events) and the dead-unit sweep (idempotent): it drops her claims, milestones, offers, exit, return offer, override, domains, knowledge rows both ways, queue entry, probe, Leash block and an aftermath (`aftermath_ended { reason: 'gone' }`, no `domain_lost`); it starts `successor` for no one.
- **R8 — hold.** `addHold` is the one writer: pace ×0.7 / ×1 / ×1.4 on gains **and** losses, compatibility and the romantic tier on gains only (`bondTierOf === 'romantic'`; `affectionate` / `possessive` ×1.2, `cold` ×0.8), clamped to the frame's floor and ceiling (it never turns a gain into a loss or the reverse), rounded to 4 decimals; the band of a float is the highest band whose `min` it has reached (the registry has a 19/20 gap); `lastPracticeDay` is set on any gain (an opt `{ practice: false }` keeps the slow term from counting); `reconcileDomains` (R12) and `milestonesDue` run after `hold_changed`. **Compatibility is pinned to 1 until her reading has had its first update** (`readOf.updates > 0`), so the first probe answer is exact; the first answers of a long run therefore differ slightly from "+4 / +3". The landing hook (`registerEventLanded`, called last in `applyEventToUnit`, not for a bystander's `witnessOf`, `scale` ignored) feeds `holdFeed`, which needs `event.actor === 'commander'`, the dynamic on and an **existing** `Relation.dynamic`. **A refusal is priced by frame** (`refusalCost`, `TUNING.dynamic.refusalCost`: `minor` −2, `moderate` −4 and `refusal_noted`, `contest` −4 plus the contest count); a `refused_demand` whose template is a *desire* (a postponement), and an expired demand (`EventIntent.lapsed`, engine-made only), are **not refusals**; a refused milestone pays its own band drop (−20 and a 7-day cooldown, `addHold` scaling it by pace) and `refusalCost('milestone')` only notes it. DEFY adds no second −6: the `overrode_her` event already feeds it. A rule broken by the engine's own check also feeds hold (`landEvent`), once per rule per day whichever source lands first. The slow term (+0.5 at Impunity ≥ 40, +0.3 as the P9b leader, frame ≥ `play`) and the decay (3 idle days, then −1 / −0.5 / −0.3 by frame) go through `addHold`.
- **R9 — probes.** As planned with these rulings: the only draw is `rng.chance(p)` per eligible unit that has queue room (guard: one probe a day); order and axis use **`dynamicRoll`**; **the queue window is 14 days** (R9's "answered in the last 7 days" and "no probe for 14 days" cannot both hold); an ineligible unit is not dropped from the queue by the window alone; back-off clears `probes.answers` and emits `probe_backoff { unitId, until }`; only weight-1 answers are recorded (`probe_observed` feeds hold and the reading only); a lapsed probe (3 days) emits nothing; `pending.sceneId` stays unused (one a scene is `sceneProbe`); a `latent` unit needs a cause (Impunity ≥ 40, or `knows_dynamic` of a pair with `witness: drawn` on an enabled category).
- **R10 — her reading.** As planned. **The motive step is `alpha × sample weight × 1.5`** (0.15 for a probe, 0.225 for a moment, 0.075 observed), not a flat α; the misreading uses the **leading** style (`physicsStyleOf(…, reg)`, so `physicsStyleOf` and `StyleReader` take an optional registry; all in-repo call sites pass it, a caller without one gets `phaseLead: 'primary'`); `regionOf(reading, declared?)` ties go to nobody and `devoted` is the catch-all; a blank reading starts at the region of its own values (`devoted`); `answerProbe` runs `addHold` first, then `updateReading`; declarations fade by stored weight in the day step. **Fear and `cowed` are quiet in play**: a threat in the same exchange counts only when the action also lands `commander_punished` / `commander_leashed` (`threatIn` over `THREAT_EVENTS` in `reading.ts`); no intent can say "she threatened the commander", and nothing emits those with a `moment_answered` today. P16 must add its threat sources (see its spec).
- **R11 — milestones and frames.** As planned. `rekindle` is applied by `answerReturn` (`applyMilestone(…, 'rekindle')`), never by `milestonesDue`; `command_lost` does not apply while she holds `rule` by another road (an entering milestone of that frame with no `claim` effect whose `requires` are met, read by field); **`milestones.afterDownDays` (14) is a new tuning**: after `cooling` or `command_lost` the milestones that lead back into the frame she left wait 14 days; the `drop_romance` effect is reserved (no row uses it, `applyMilestone` ignores it); a mark (`from === to`) is offered once; a milestone offer opens only for a unit whose `herPracticeLive` is true (a cooling still applies). A `booking` form books her next free evening (`source: 'milestone'`, the booking is checked with `bookingProblem`: device access, scene restriction, obedience, `noBookUntil`, an open booking, the keeper's consent; **the offer opens either way**, the evening is booked only when the check passes) and DMs the text; a `demand` form DMs the text; a `scene` form is a directive line. `private_rule` is behind `handover` in registry order (a unit with the full private set is offered `handover` first). A head start may leave `first_yes` open on day 1 (it is what live answers would do).
- **R12 — domains and capabilities.** As planned. One draw per holder who is due a domain (not per domain), the first due domain in registry order; `claim: milestone` domains are never claimed by the day step; none for a unit in an aftermath or whose practice is not live. A claim of a domain another holder holds is settled at once by `settleDomainConflict` (`settleOrder` from `bookings.ts`), no card. A partial yield counts while `partialUntil > day`. TALK is a no-op in the engine (the card opens the scene). **Wiring:** `booking_uncapped` / `book_ahead` (the offset is `1 + floor(dynamicRoll × 3)` days, not a draw); `device_floor` (`deviceAccess` returns `max(level, 4)`; `deviceAccessWhy` reports "from the device she holds for the commander"); **`second_place` is the commander's place**: `roomOfPerson(…, 'commander')` derives the holder's cabin on her booked or played evening with the capability (`secondPlaceHolder`), the holder's own whereabout is not moved, and `planView` draws the commander marker (see P10d); `relation_rules` withholds `jealousy_games` / `service` templates only from a holder at ≥ `play` who lacks it (a plain soldier keeps P9d's pool); `booking_consent`; `co_leader` (`standingOf` +15, `Hierarchy.coLeaderId`, a CO-LEADER chip); `leash_block` (R16); `countermand` (R13). `body_conditions` / `household_protocol` are stored only.
- **R13 — the command domain.** As planned. One override open at a time: `overrideOpen` reads the warden's slot first, then the holder's (`state.dynamic.override`, ids `dov<n>`); `rollOverrides` replaces the five hook sites' `rollOverride` (identical to it over six seeds without a holder) and throws `OPEN_FIRST` / `OPEN_FIRST_HOLDER`; the P13 readers that act for the warden use `wardenOverrideOpen`, so a holder's override is never mistaken for hers. A holder's hit emits the existing `warden_override` event with `source: 'holder', unitId`. **DEFY** adds hold −6 only through `overrode_her` (no second `override_defy`), favour −3, the contest at `rule`, no `punishRoll`; **COMPLY** hold +3, favour +2. A kept command rolls with authority `max(hold / 100, 0.4)`. In a fight ARGUE uses `argueChance` with `satisfaction = 100 − hold`. Losing the capability voids her open override. A P13 save with an open warden override loads and answers unchanged (`tests/fixtures/dynamic/p13_override_open.json`, made from the pre-change P13 code).
- **R14 — how the squad learns.** As planned. **No unit-to-unit axes exist**, so "close to the pair" is the observer's Trust or Affinity **toward the commander** ≥ 50 (`isClose`) and `select_few` tells reach those units and the leader. Producers built: `dynamic_item` / `dynamic_contact` (instant, from `blocking_changed` of a `scope: dynamic` entry and from a `visitor` moment), `holder_tells` (hashed `select_few` 1 in 7 days, `show_off` every 7 days by squad index), `protocol_slip` (the intent, others present; also counts the `protocol_public` deed), `protocol_public` (an offer made before others), `held_night` (a **played** milestone booking: every named unit at base), `leaving_quarters` (the morning after a `second_place` evening: units at the hub that morning, all when the pack has no hub rooms), `background_role` / `background_rule` (3 / 6 a day, nothing at `play`), `gossip_knows` / `gossip_suspects` (hashed 0.5 per pair a day, cap 15). **Reserved rows with no producer:** `step_behind`, `kneeling_at_door`, `her_marks`, `remote_toy`, `demonstration`, `exposed_staging`, `compromat_shown`, `scent_on_commander`, `scent_in_quarters`, `seen_together`, `time_alone`, `territory_marking`. Day-step order: signs and background first, then **decay** (2 a day, skipped for a pair fed today, floor 60 for 7 days after a level). Facts carry the tags `dynamic_knowledge` plus the level (the pair is in `about`) and **`hiddenFromCommander`; the engine drops that flag once the observer and the commander have shared a scene or DM on a later day** (`revealKnown`, an after-action step; there is no Knowledge-rule exemption), so the UI and the prompt agree. Reactions (`reactToDynamic`): `drawn` → `addHold` on her own dynamic if eligible; `dislikes` → the Impunity term +5 (×1.5 at Regard low or none), the holder's standing malus −5 each (cap 20, derived, nothing stored) and a hashed 1-in-3 `interpersonal` demand (`openDemand` takes `opts.roll` and checks `mayAsk`); a woman who holds her own dynamic and is `ritual` / `cold` writes a respect fact, `possessive` / `cruel` competes for **a domain the holder holds with `claim: demand` that the rival's frame and band meet**, never the command; the leader writes a "weighs it" fact. The suspicion numbers are never read by any surface. `gossipChance` 0.5 and `tellOneIn` 7 are `AUTHOR TO TUNE`; with a slip every 8 days an ordinary woman suspects on days 8–12 and knows on 14–16.
- **R15 — exit and aftermaths.** `dynamic/exit { unitId, route, … }`. **Severity** = frames above `play` + floor(domains / 2); a vow is a **break** (`extreme`, pinned fact importance 5); `minor` at `play` with hold < 40; **at `play` with hold ≥ 40 and no domains it is one step (`moderate`)** so "nearly free" means something; clean −1, force +2. Exit resets frame to `equal`, hold 0, clears milestones, `sworn`, `refusals`, `contest`, Leash block, pending probe and her open cards, keeps tracks, reading and cooldowns, sets `formerHolder`, emits `dynamic_exit` (no `frame_changed` / `hold_changed`). **`negotiated`** without a compromise opens `state.dynamic.open.exits` (`dx<n>`, one a unit); ABRUPT on the same card closes it. **`transfer { toUnitId }`** is one conflict (`settleOrder`): the winner keeps or takes the domains of both, **only the loser exits and gets the aftermath**, charged `contestedLoss` (10) once; if the old holder wins, the claimant is the loser. **`force { means }` never runs the means itself**: `meansDone(state, unitId, means)` reads state and the exit throws "Do it first: …" unless the means was completed on her today (an application of hers in `discipline.applications`, a `done` Leash-log entry of hers, an oversight request); the UI runs the means through its normal path first (vote gate, warden co-sign, P12 warnings), then dispatches the exit. A forced exit by the Leash, **or by an enforcement of severity ≥ 3**, returns the command (`domain_lost { reason: 'force' }`, no `command_kept`); any other exit of a command holder starts `command_kept`. Aftermath picking (`pickAftermath`): weights = base + primary style + half of secondary + values by side, × Regard band, × the frame she held, × the vow; `needsCompromat` → 0 without compromat; clean keeps `mild` rows only; force ×1.5; a held command forces `command_kept` alone; one `ctx.rng` draw (none for the forced `command_kept`), a chain draws once and only when a candidate has weight. **Effects run once when their stage begins.** `command_kept` never ends by time while she holds the command (the 30-day stage restarts); two votes passed against her side, an enforcement of severity ≥ 3 or the Leash end it; **UNDO of such an enforcement restores it** (`Inverse.dynamic`, `registerEnforced` / `registerUndone` in `discipline/record.ts`: the discipline layer imports nothing of the dynamic). Return offer: terms `after_punishment` for primary `drill`, else `lower_band`; accept applies `rekindle` and lifts hold to a band (`returnBand`), checks the cap first, emits `hold_band_changed`. Successor: once per former holder, the day step, no draw, `addHold` (pace and ceiling apply, so an `equal` unit tops out at 39). Habits: `protocol_slip` is offered while the stage's `protocol_slips { days }` runs and others are present. `threaten_tell` itself is a no-op: the `demand` effect carries the threat, and refusing or letting it expire tells the squad (`compromat_told`).
- **R16 — the Leash block, bypasses, oversight.** As planned. `askCosigners` (`actions/leash.ts`) asks the warden first, then the holder; a request on the holder herself is held with no draw; a combat compel works the same (the message is generic, "already denied"). Bypass: a one-request `oversight.pass`, always dropped in `finally`; `comms` is the COMMS room's `scout_net` activity with the focus `leash_terminal` (`requires.capabilityHeldBy: 'leash_block'`, never listed in the OPS select; no `comms` activity exists), refused with a scene open and **while a dilemma is presented**; discovery draws once (0.3 / 0.2–0.1 / 0.4 × insight); a discovered bypass is `overrode_her` major through `hitHer`, Regard −2, the ally's Trust −5, a memory fact and compromat for her. Oversight: clock `oversight_inquiry` (6 segments, `engine: true` so `seedWorld` never seeds it, created lazily); three blocks within the span move it one segment; **cover shortens the span** (14 days × cover, rounded) because a clock moves in whole segments; the thread status is `open` (the plan's `active` is not in `THREAD_STATUSES`); notices at 3 and 5 (a corporate toast and a world fact naming no one); on fill a hashed (`dynamicRoll`) reprimand (stress +15, hold −10), transfer threat (7 days, then `removeFromService(…, 'reassigned')`, waiting while she is in a scene, fight or run) or **forced Leash, which runs `exitDynamic(route 'force', means 'leash')`** (aftermath weights ×1.5, command returns; it makes one rng draw, the aftermath pick). The forced Leash is a `done` log entry `cc: 'oversight'` written directly (it spends none of the commander's authorizations and counts no deed); **`isOversightEntry` (`src/engine/leash/forced.ts`) keeps it out of `leashTerm`, `leashUsesMin` and the `leash_compel` memory rule**; it still satisfies `meansDone('leash')`. `coverMult` (×0.8 at `role`, ×0.65 at `rule`, half for `cruel`) is read at P13's `addSuspicion`, the debts' `oversightGain` and the leak: exactly ×1 with no holder at `role`+, so the P12 and P13 goldens hold. `dynamic/request_transfer` (mine, not the plan's) is free, once a day per holder at `play`+: the third force means costs a click (see open items). Compromat: facts tagged `compromat` and `holder:<id>` (the colon tag is pushed after `addFact`), `hiddenFromCommander`, `knownBy [holder]`; `mentionCompromat` reveals by `factId`, else best word overlap, else writes a new known fact; a text with a pronoun for the commander is dropped.
- **R17 — the dynamic and the relationship.** `relationshipStates[].stepDown` (refs-checked: stays in romance, never names itself): `devoted` → `lover`, `lover` / `fwb` / `secret_affair` → `flirting`. `romanceStepDown` uses `enterState` and `syncPublicity`; a secret affair keeps its state and steps `affair.as` down inside it (read by id, as `enterState` does: see open items). Nothing reads `break_up` for the dynamic.
- **R18 — Regard.** As planned. The start value uses presence × the matched tastes' `presenceMult` × 0.5 clamped ±15 (**no P7 `impressionOf` exists**) and "negative crime reaction" is the sum of the weights of her values the crime's `valueReactions` touch being below 0; `regardOf` recomputes the start from the current presence until the first write (it drifts until then; `ensureRegard` writes at the first fall or rise). `drill` and `vindictive` are identified by style key through `TUNING.regard` (closed enum keys, as `style.peakLeads`). Producers: an accepted offer (for her and, ×0.7, each present witness), a protocol slip seen, a discovered bypass, `physics_caught`, `physics_slip`; rises: `record` (`marathon_done`, not `stopped`), `dignity` (a hold ended `released` / `checked` with no slip or cheat), `value` (outside feat +3, an expedition won +2, `kept_promise` +2, `time_together` +1, vindictive +1 per 7 slip-free days), **`cost` +3 from an accepted offer, a `yielded` probe answer of weight 1 and a `yielded` moment answer while her reading's r ≤ 0** (observed gestures and head-start answers excluded). `regard_changed` carries `from` / `to` numbers; nothing renders it. The tone word is in her own `dynamic:<unitId>` line and, for a **present named non-holder at Regard low or none, in the `dynamic:regard:<unitId>` directive** (her style form, or the neutral form `NEUTRAL_REGARD_FORM` "coolness" when she has no practice style; no number). Regard never changes hold or frames.
- **R19 — exchange.** `satisfactionOf`: `frustrated` outranks `content`. A holder = a unit at frame ≥ `play` (`holdersAtPlay`); `satisfactionOf` is `neutral` for anyone else. Combat passive, the protection half of the `dynamic` Impunity term, Want growth and the dislike scale all go through registration hooks (`registerCombatPassive`, `registerProtection`, `registerWantGrowth`, `registerDislikeScale`; installed by `installDynamicHooks`; with nothing registered each answers 0 / 1 / `[]`), so `impunityOf`, `wantStep` and `squadCombatant` import nothing of the dynamic. **`ImpunityTerms.dynamic` is optional and absent when 0**. A holder's own Impunity is never shielded. **Squad stress** reads each unit's Trust **toward the commander** ≥ 50 (there is no Trust toward her), every 2 days, content −1 / frustrated +1. The style conditions `displeased` and `low_stakes_good_mood` read `satisfactionOf`. All numbers are in `TUNING.exchange`.
- **R19b — shame.** Disappointment (a hidden fact through the `disappointed` rule, habits tagged `respect` lapse 14 days via `Development.lapsed`, her directive line), the question (`her_question` is ripe through `registerRipeSource` for a woman who holds nothing and whose Regard is falling but above none, or who `knows_dynamic` with `witness: dislikes`; cooldown 14 days per woman, one a week overall; the Regard move is on `moment_answered`), the nickname (`DEED_COUNTERS` +6; P15 counts `protocol_public` and `spoken_for`, the other four are P16's; 3 `reputations` rows with `tone`, placeholder names, `reputationDayStep` picks by the squad's average Regard). **`spoken_for`** is counted when a holder's override is complied with and the order is a roster or expedition order, or another soldier is in the order, the scene or the fight. The placeholder nickname texts and the disappointed directive are `AUTHOR TO WRITE`.
- **R20 — offering, mastery, mood, the body map.** `makeOffer` throws when a scene is open **without** her (the engine cannot see an open DM: the dispatcher already keeps `dm/` out of a run or fight, so that is the whole guard); the answer is the engine's (`answerOffer`, no draw), the intent only confirms and a mismatch is dropped; the offer's one draw is the claim chance (0.4), only when a claim is possible. Tabs by field: `part` = worship targets, `posture` through `entryAllowed`, `contact` = contacts without an `objectification` tag, `role` = those with it, `service` = `actor: commander`, `scope: dynamic` activities while `service` is on, `time` (`TUNING.offer.times`) and `endurance` are closed lists with no registry entry (so nothing gates them); there is no items tab, so the "items the commander has" filter is not built. **A DM offer reaches the model**: `dm_reply` gains an optional `offer` line (`DmReplyInput.offer`, built by `offerReplyLine` from state: what is offered, the engine's word, "in return" if asked; no number, no pronoun, no feeling; null once she has written in the thread since, for a scene offer, a confirmed one or while off); without it the prompt is byte-identical (`tests/fixtures/dm_reply/prompt_without_offer.txt`, made from the pre-change code). `OpenOffer` gains `dmAt`, `kind`, `corrected`, `confirmed`. An accepted endurance offer makes the holds reader answer `blackout` for the scene (honoured as `limit` without `breath_play`). **Mastery:** +5 an act and +3 more **when her `how` for the target is set and the act ended clean** (`released` / `checked`; `matched` does not exist in P15a's segment result); levels 20 / 60 / 120 / 200 / 320; level 2 reveals the zone; **`PhysicsRun.targetId` and `physics_outcome.targetId` are written only while the dynamic is on** (`registerRunTarget` in `physics/style.ts`; P15a is byte-identical without it). `moodSigns`: her tell only once shown, her mood word only after a shared scene today, reply length from her last three DM replies (scene reply lengths are not stored). The body map is `src/ui/dynamic/bodyMap.ts` (pure ports of the draft's geometry; zones from facts only, dashed rings for scent, no `url(`, no `<pattern>`), **drawn by the DYNAMIC section** (list only in readable mode).
- **R21 — head start.** `applyDynamicHeadStart` runs after `applySeeds`: `n = round(days × probeChance)` (no draw: `headStartHash` keys `probe:<i>` / `axis:<i>`), answers through `answerProbe(…, { retro: true })` (no pending probe needed, not recorded in `answers`, no back-off, no hold for a unit already at ≥ `play`), `lastDay = day − 1`, the queue first. The probe moment is appended to `headStart.units[].moments`, so the existing recap call and `head_start/recap` write it under the `head_start_moment` rule with no change to `src/headStart/` or `engine/headStart/recap.ts`; `pickProbeMoment` takes an optional fourth argument (the axes she probed, a max tier). `headStartMoments` gained 10 rows tagged `['head_start','probe']` (`axis`, a ref to `probeAxes`, required on a probe row and only there). `N = 0` and a head start without `dynamicUnderway` are byte-identical.
- **R22 — intents, events, actions.** `EVENT_TYPES` grew from 45 to **52** (`DYNAMIC_INTENT_TYPES`: `probe_answered`, `probe_observed`, `milestone_accepted`, `milestone_refused`, `compromat_mentioned`, `protocol_slip`, `offer_answered`), each with an `eventDeltas` row with a `cause` and a `journal` line and no numbers; `compromise_reached` gains `claimId?` / `exitId?` (taken only when `ctx.dynamic` shows a matching id, so a rule compromise with a stray id is kept). `DynamicOffer` has two extra lists, `observed` and `slips`. `DYNAMIC_EVENT_TYPES` has **31** names (the plan's 29 plus `compromat_revealed` and `compromat_told`); `dynamic_exit` is also a relation event in `ENGINE_EVENT_TYPES`. `oversight_inquiry` carries a `stage` (`opened`, `notice`, `reprimand`, `transfer_threat`, `forced_leash`, `reassigned`, `lifted`, `transfer_requested`). Actions: `dynamic/{set_setup, set_unit, answer_claim, answer_milestone, exit, bypass_leash, answer_return, offer, declare, request_transfer}`, `profile/{set_practice, lock_practice, set_expectation, lock_expectation}`; `dynamic/declare` is refused while the dynamic is off; none is in `ALWAYS_OPEN`.
- **R23 — directives** (`src/dynamic/directives.ts`, all `dynamic:`-prefixed): `dynamic:<unitId>`, `dynamic:probe:<unitId>`, `dynamic:offer:<unitId>` (`next_reply`, event-driven), `dynamic:aftermath:<unitId>`, `dynamic:leash_block:<unitId>`, `dynamic:command:<unitId>` (set whenever another living squad unit is in the scene), `dynamic:witness:<observerId>`, `dynamic:disappointed:<unitId>`, `dynamic:regard:<unitId>`. None carries a digit, a pronoun for the commander or a feeling; the compromat lines list hers, newest three, with the marker stripped. A transfer threat has no line for her (see open items).
- **R24 — memory check:** see the verdict table below.
- **R25 — analysis and UI surfaces.** As planned; see **What the UI shows** below.

### Memory check as built

Rules with resolvers (all `spread: 'none'` unless a rumor effect says otherwise; `memoryRules` gained an optional `pinned`):

| rule | event, when | audience | importance | hidden |
|---|---|---|---|---|
| `dynamic_frame_play` / `_role` / `_rule` | `frame_changed`, upward only | the pair | 3 / 4 / 4 | no |
| `dynamic_sworn` | `sworn` | the pair, pinned | 5 | no |
| `dynamic_break` / `dynamic_ended` | `dynamic_exit`, sworn / not | the pair, pinned for the break | 5 / 3 | no |
| `dynamic_domain_yielded` | `domain_yielded` (not a settled conflict) | the pair | 2 | no |
| `offer_mocked` | `offer_made`, answer `mocked` | the present | 3 | no |
| `offer_corrected` | `offer_made`, `corrected` | the pair | 2 | no |
| `zone_revealed` | `zone_revealed` (tag `expect_worship_<id>`) | the pair | 2 | no |
| `position_region` | `position_shifted` | the holder | 2 | yes |
| `disappointed` | `disappointed` | her | 3 | yes |
| `leash_bypass_found` | `leash_bypassed`, discovered | the holder | 4 | no |
| `aftermath_return_refused` | `aftermath_ended`, `refused` | the pair | 3 | no |

Nothing remembered, with the reason: `hold_changed`, `hold_band_changed`, probes (`probe_issued`, `probe_backoff`, the answers), the reading, mastery xp and levels (`mastery_gained`), `regard_changed` / `regard_band_changed`, the Regard `cost` rise and `spoken_for` (hidden bookkeeping: Regard and a reputation counter), suspicion and `dynamic_known` (the `knows_dynamic` facts are written at their site, `hiddenFromCommander` until shown), `dynamic_started`, `domain_claimed` / `domain_refused` / `domain_lost` / `domain_contested`, `milestone_offered`, `milestone_refused` and `refusal_noted` (carried by hold, `refusals` and the reading), `aftermath_started` (its stage notice speaks; the exit is remembered by `dynamic_exit`), `leash_blocked` (the `denied` log entry with `cc` is the record), `leash_bypassed` undiscovered, `oversight_inquiry` (the two notices write a world fact each at their site, naming no one), `compromat_revealed` / `compromat_told` (facts at their sites), `regard_question_asked` (`her_question` is remembered by P15a's rule), the oversight forced Leash (no `leash_compel` fact: its exit is remembered by `dynamic_exit`), an offer line for a DM (derived, writes nothing), satisfaction, protection, the squad-stress nudge and the Want multiplier (derived values), the head start's probe recap (the existing `head_start_moment_1…5` rules). Journal: the seven intent types have journal lines and no deltas; `dynamic_exit` has a row (minor −2 / −2, moderate −5 / −5 stress +5, major −10 / −10 stress +10, extreme −20 / −20 stress +20) and the journal line "the commander left what she held". Chronicle: the dynamic writes no chronicle line of its own. Prompt: the `dynamic:` directives above, fact retrieval for the facts, the `dm_reply` offer line; no `group: 'memory'` provider was added.

### What the UI shows

- **Her dossier › DYNAMIC** (`renderDynamicSection`, null while off, for a grunt and for a woman with no dynamic): FRAME (+ SWORN), HOLD as a band (the rounded number in brackets only with "show raw values" and never in immersive mode), DOMAINS, SHE MAY CLAIM, PRACTICE (tracks as words), HER READING (only once `readOf.updates > 0`, her region word), the open claim, milestone and return cards, the body map, `[ END IT ]`. **In immersive mode (`dynamicHidden`) the section is one row, `[ END IT ]`**, which opens the exit card without cost words (spec E2: saying it is over is always possible); no frame, band, body map or cards there. The exit card is in her voice: ABRUPT, TALK IT THROUGH, HAND OVER (one button per other holder at ≥ `play`), FORCE with one row per means and a FORCE button `aria-disabled` until `meansDone`; the Leash row is soft-disabled with its reason (`leashProblem`) when the request would be held or no refusal is open; a vow reads "a break". The button is drawn only at ≥ `play`. Its open state is a module-level set keyed by campaign salt and unit, reset on `chat_changed`.
- **Cards** (`VOICE_OF.dynamic = 'personal'`, `unitAccent`): milestone, claim, return, exit, the offer composer and the answer chip, drawn in the scene and in her thread; the hub's Tonight `dynamic` line has an OPEN button (`commsTab.requestThread`) and, `cutTonight` keeps six lines with older ones cut first, then dynamic ones, oversight's threat last. **Notices** (`dynamicNotices`, pure): `frame_changed` (toast and cut-in with the frame label, or her name in immersive mode), `aftermath_started` (cut-in names her only, never the kind), `domain_lost` (not for `exit`), `sworn` (cut-in VOW), `leash_blocked`, `compromat_revealed`, `compromat_told`; oversight stays in the corporate voice. **CMDR card**: "Held by {name}" with domain chips (not hidden in immersive mode: domains are words). **Scene header**: the frame chip beside the lead chips (hidden in immersive mode). The frame chip and the CMDR line read state directly, not through `Knowledge.dynamic` (nothing they show is hidden; the analyze panels do go through `Knowledge`).
- **`Knowledge.dynamic(unitId, reg): DynamicView`** (frame, band or `felt`, domains, `asked` (domains with an open claim), track words, sworn, her region word, revealed expectations, signs, `heldBy`, known compromat, known suspicion levels, **`zones`** (per worship target the mastery level and the revealing facts)); knowledge levels come from visible `dynamic_knowledge` facts, never from `state.dynamic.knowledge`. Immersive: `band: 'felt'`, `frame` and `raw` absent, and the analyze answer is `[[dynamic_felt]]`. Providers: `glossary:` ids `dynamic`, `hold`, `frame`, `domain`, `claim`, `milestone`, `vow`, `aftermath`, `her_reading`, `probe`, `offer`, `offer_answer`, `mastery`, `body_map`, `compromat`, `regard`, `holder_override`, `leash_block`, `oversight_inquiry`, `dynamic_exit` (an extra), `commander_marker`, `dynamic_felt`, one `capability_<cap>` per capability (11), `leash_bypass_{comms,reset,ally}`, `dynamic_{may_hold, sensitivity, seeded, start_frame, underway}`, `setting_dynamic_{hidden, holders, pace, frequency}`; registry readings `dynamicFrames`, `dynamicDomains`, `dynamicTracks`, `worshipTargets:<id>`; the other registries are static panels (the aftermath stage and Regard are deliberately unreadable).

### Rulings made while building

- **Postponed desire demand is not a refusal; an expired demand is not a refusal** (`EventIntent.lapsed`, engine-made); the flat −4 became the frame's `refusalCost`; a cancelled booking goes through `refusalCost` and does not close an open milestone.
- **Milestone refusal −20** (a band, scaled by pace; "exactly 20 only at normal pace"), cooldown 7 days. `afterDownDays` 14 is new.
- **`dynamicRoll` vs `dynamicHash`.** `dynamicHash(state, unitId, key)` = `fnv1a(<salt>|<unitId>|dynamic|<key>|<day>)` is smooth across consecutive days (0.480, 0.492, 0.488…), so any **chance-like** pick uses `dynamicRoll` (a murmur finalizer on top): gossip, tells, the demand, the Want noise, the probe axis and queue order, `book_ahead`, oversight's act. `dynamicHash` stays only where a stable value is wanted.
- **Layering by hooks.** `registerEventLanded`, `registerCombatPassive`, `registerRipeSource`, `registerRegardBand`, `registerCompromatCount`, `registerDislikeScale`, `registerProtection`, `registerWantGrowth`, `registerRunTarget`, `registerEnforced`, `registerUndone` keep `impunityOf`, `wantStep`, `squadCombatant`, the discipline layer and P15a free of imports from the dynamic. `power/compatibility.ts` is a leaf (it broke the `ballot.ts` ↔ `standing.ts` cycle); `witness.ts`, `capabilities.ts`, `cover.ts`, `struggle.ts`, `pronoun.ts` and `state.ts` are leaves.
- **A forced exit's means** is read from state, never run by the exit (above); UNDO of an enforcement restores `command_kept` through the Inverse; the oversight request is `dynamic/request_transfer`.
- **Exit at `play` with hold ≥ 40** is `moderate` (a plan deviation, kept).
- **`romanceStepDown` names `secret_affair` by id**, following `enterState`'s pattern (a `concealed` field would follow the read-by-field rule; kept).
- **The squad-knowledge fact's flag** is cleared by the engine (`revealKnown`), not by a Knowledge rule.
- **Content of `AUTHOR TO WRITE`:** every registry text, the memory-rule and fact texts (now carrying the marker), the witness and reaction lines, the submit card's words (`SUBMIT_WORDS`), the three nickname names and `NEUTRAL_REGARD_FORM`. Every number added is `AUTHOR TO TUNE` in `TUNING`.
- **`reactToDynamic` demand** is any `interpersonal` template (R14's "demand about it" has no template of its own).
- **A holder's `holdsUntil` for an endurance offer** rises through the open offer record, which stays open (confirmed) until the scene ends.
- **Oversight's inquiry** names no holder (`relatedUnits: []`); the transfer threat is announced by a Tonight line and the corporate notice only.
- **P15a touched, additively:** `physicsStyleOf` / `StyleReader` take an optional registry; `PhysicsRun.targetId` and `physics_outcome.targetId` behind `registerRunTarget`; `contactTargetOf` in `blocking.ts`; `readMoments` reads `moment_answered`; `AfterAction` takes an optional third parameter (the action's events); `ClockSchema.engine`, `HabitSchema.tags` and `ReputationSchema.tone` are new optional fields.

### Non-obvious things to know

- **Off is byte-identical.** `tests/dynamic/unaffected.test.ts` runs the seeded week of `helpers/unaffectedWeek.ts` against the committed golden `tests/fixtures/unaffected-week.json` (never regenerate it; it only reads it): same log, same `state.rng`, the same state hash, none of the new keys; with every category on but `holders: 0` the same rng and log; a holder in the squad with nobody eligible adds no probe, claim, milestone or aftermath event; the intent prompt equals `prompt_without_reading.txt`; a comrade scene has no `dynamic:` directive. A seeded test that moves **stops and reports**. The six `unaffected` suites of the earlier packages and `tests/engine/setup.test.ts` stayed green unchanged.
- **No rng draw unless someone is eligible.** The draws are exactly: the probe chance (an eligible unit with queue room), the claim chance (a holder due a domain whose practice is live), an override roll (a conflict exists), the Leash co-sign and a bypass discovery, the aftermath pick (and a chain), the offer-to-claim chance, and oversight's forced Leash (the aftermath pick). The exchange functions take no rng. A few P15 tests moved by design during the build and the reviews (never a golden): the knowledge-pace test after signs began to apply before decay, and fixtures that needed a hold of 25, a `device` domain or a `metDay` 60 days back.
- **Frames never move by a number alone.** Hold at `equal` is clamped to 39; a frame changes only through `applyMilestone` (including `cooling` and `command_lost`). `tests/sim/dynamicLongRun.test.ts` (120 days, seeds 11 and 29) asserts every `frame_changed` names a registry milestone and is automatic or in the same action as its `milestone_accepted`; it logs play on day 10 / 13, role on day 36 / 37 and the handover about day 76–78, matching the spec's targets.
- **One override at a time**, warden first; a holder's DEFY never calls `punishRoll`.
- **Removal leaves nothing dangling** (`forgetDynamic`, tested for every trace; the dead-unit sweep is idempotent).
- **Hidden values.** Hold numbers, Regard, suspicion, the reading's axes, mastery xp, track xp, an aftermath's stage and days, her override chance, unmentioned compromat and unrevealed expectations have sentinels in `tests/fixtures/analyze/hidden.ts` and never reach a reading, a toast, a label or the prompt (`tests/analysis/hidden.test.ts`, `tests/ui/dynamic/hidden.test.ts`). A real and a false value render identically. Immersive mode hides the section, the bands and the frame chip and keeps the events, cards and notices.
- **A seeded unit with a profile that cannot hold is warned about and not seeded** (R3).
- **`herPracticeLive` is what the hook readers read.** A holder whose categories were switched off goes quiet everywhere: no claims, no new milestone offers (a cooling still applies), no override rolls from the P15a hooks, no struggle votes (`dynamicLive`).
- **Frame changes and the Tonight list.** Two Tonight lines (an aftermath's stage notice and oversight's threat) count against the six; `cutTonight` protects them.
- **Chat switch.** The exit card's open set is reset on `chat_changed`; anything keyed by scene id in the controller is too.
- **Never read a profile field raw.** `seedProblem` and a few validators carry `// P14b: raw profile`; every other read goes through `practiceOf`, `expectationsOf` or the P14b readers (`tests/development/readers.test.ts`).
- **Engine files never contain the words `window`, `document` or `SillyTavern`** (the architecture test caught several comments).

### Open items

- **`MANUAL_TEST_P15.md` has not been run by hand.** A refused milestone or claim writes no fact (R24: hold, `refusals` and the reading carry it); step 5 of the checklist says so. Whether a `milestone_refused` memory rule is wanted is an author decision.
- **Fear and `cowed` are quiet in play** until P16 supplies threat sources (`THREAT_EVENTS`). A threat intent for her voicing one is a P16 decision.
- **Track xp has no producer** (P16); `first_night_held` is unreachable until then. The P16 gain rows have no producer. Favour has no verdict or moment-gap source. Reserved sign rows have no producer (R14).
- **`dynamic/request_transfer` is free and repeatable daily** (the force exit's third means costs a click) and **the transfer threat has no line in her directive**; both need an author ruling (a cost, a line).
- **`mentionCompromat`'s word overlap** matches any summary containing "commander" plus one shared word, because the placeholder texts carry "author", "write" and "commander": revisit when texts are authored.
- **No core habit carries the `respect` tag**, so disappointment's lapse is inert with the core pack. Author task: tag a habit `respect` (`habits[].tags`).
- **`regardOf` drifts until the first write** (the start is recomputed from the current presence until `ensureRegard` stores it at the first fall or rise).
- **Mastery's `how` bonus** reads a clean end because `matched` is not in the segment result; wire it when P15a exposes it. The offer's time and endurance entries have no registry row to gate, and there is no items tab (the "items the commander has" filter is not built).
- **A DM offer cannot be refused with a DM open from the engine** (the engine cannot see an open DM thread; the UI enforces it).
- **Her handwritten marks** on the body map are a P10b follow-up; the position chips `[PROVOKE]`, `[TEST HER]`, `[ANTICIPATE]` need practices to act on (P16b / P17e, to confirm with the author).
- **`private_rule` sits behind `handover` in registry order**; `command_kept`'s stage restarts while she holds the command; the squad stress uses Trust toward the commander; `rule` without the command domain is possible (`private_rule`); a head start may open `first_yes` on day 1. All are drafts for the author.
- **`DynamicView.asked`, the glossary `dynamic_exit` and the `dynamic:regard:` directive** are additions beyond the plan's list.
- **Every `AUTHOR TO WRITE` text and `AUTHOR TO TUNE` number** is a draft.

### Fixed after review

Three Opus reviews (a–d: ea49b44..463a5ef; e–h: 8073969..d5e3623; i–m: e1f786f..59c0924) found 0 Critical, 4 + 11 + 7 Important issues and 13 + 16 + 20 Minor ones. Each fix was test first. What changed beyond the rulings above:

- **a–d:** a practice names only practice categories (I1); a seed needs `leadRank ≥ assertive` (I2); a rule broken by the engine's check feeds hold (I3); `afterThreat` reads `commander_punished` / `commander_leashed` (I4, half: the rest waits for P16); the leading style colours the reading; a fresh reading's region; SYS holders select; `dynamic/declare` off; the stray `claimId` / `exitId`; the signed aftermath weights (M10); `praised_or_ignored`.
- **e–h:** a forced exit checks its means (I1); transfer is one conflict (I2); signs before decay (I3); `held_night` and `leaving_quarters` producers (I4); a rival contests only what she could claim (I5); a Leash force returns the command (I6); one flag for squad-knowledge facts (I7); `dynamicRoll` for chance-like picks (I8); `second_place` is the commander's place with a plan marker (I9); the return card is wired and the Tonight chip opens it (I10); UNDO restores `command_kept` (I11); refusing a submit claim clears the contest; an expired demand is not a refusal; no re-entry during her aftermath; `answerReturn` checks the cap; `AUTHOR TO WRITE` markers; `openDemand` takes a roll instead of a fake rng; `power/compatibility.ts` leaf; `deviceAccessWhy`; the override error names the right source.
- **i–m:** the DYNAMIC section draws the body map (I1) and keeps `[ END IT ]` in immersive mode (I2); the DM offer line (I3); `targetId` behind a hook (I4); `dynamic:regard:` (I5); oversight's forced Leash runs the force exit (I6); the `cost` rise and `spoken_for` producers (I7); no claims or new milestone offers for a unit whose practice is off (M1); `isOversightEntry` (M2); the comms bypass refuses during a dilemma (M3); postures through `entryAllowed` (M4); the offer scene guard (M5); the Leash row's reason (M7); `cutTonight` (M8); `compromat_*` in `DYNAMIC_EVENT_TYPES` (M9); `satisfactionOf` in the style conditions (M11); one `hasCommanderPronoun` (M14); `DynamicView.zones` (M16); `resetDynamicSection` on a chat switch (M19).

### Interfaces provided to later packages

State: `CampaignState.dynamic`, `Relation.{dynamic, regard, mastery}`, `Unit.{expectations, expectationLocks, practiceLocks}`, `Bond.practice`. Readers: `dynamicOn`, `canHold`, `herPracticeLive`, `practiceOf`, `expectationsOf`, `capabilitiesOf`, `hasCapability`, `holderWith`, `leashBlockOf`, `regardOf`, `regardTone`, `satisfactionOf`, `coverMult`, `masteryLevel`, `Knowledge.dynamic`. Writers: `addHold`, `addFavour`, `addTrackXp`, `addSign`, `knowInstantly`, `addCompromat`, `regardFall`, `regardRise`, `addMastery`, `exitDynamic`, `applyMilestone`. Hooks: `registerEventLanded`, `registerCombatPassive`, `registerRipeSource`, `registerRunTarget`, `registerEnforced`, `registerUndone`, and the dynamic's own `registerRegardBand`, `registerCompromatCount`, `registerDislikeScale`, `registerProtection`, `registerWantGrowth`. Actions and events of R22. Details: the **Interfaces already provided by P15** section of each dependent spec and overview §5.4.
