# P15 — The Dynamic: Hold, Frames, Domains, Exit

**Status: spec.** Release 0.2 (post-release). **Depends on:** P3 (relationship graph, facts, intents), P9 (Impunity, demands, punishments), P9b (hierarchy, outside perception), P9c (device access, bookings, secrets), P9d (bond profile, content categories, lead, Want, rules), P13 (LEASHSWAP: the countermand and co-sign machinery reused by the command domain), P14 (generation envelope), P7a. **Read:** overview; this file; the **Implemented as** of P9, P9b, P9c, P9d and P13; `docs/content/lore.md` (§0).

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
