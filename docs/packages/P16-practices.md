# P16 — Practices: Tasks, Her Discipline, Demonstrations, Service, Denial, Holding

**Status: spec.** Release 0.2 (post-release). **Depends on:** P15a (blocking, moments, contact physics), P15 (the dynamic: hold, frames, domains, tracks, compromat), P14 (generation envelope), P9 (demands, refuse path, punishments as data), P9b (audience standing, outside perception), P9c (bookings, intercepts, obedience), P9d (rules, Want, content gate), P10 (hub whereabouts, voices, `visualFlags`), P7 (non-body routes), P7a. **Read:** overview; P15; this file; the **Implemented as** of P9, P9c, P9d; `docs/content/lore.md`.

**Analysis tool (P7a):** every new stat, chip, option and card carries `data-analyze` with a glossary entry or registry `description`; live values get a provider through `Knowledge`. **P14:** every generation registers a site.

## Goal

The things a holder actually does with the commander, day to day: she gives **tasks**, **punishes** the commander when a task, rule or protocol is broken, **shows** her hold before others, keeps the commander in **service** and under **denial**, and **holds** the commander in her quarters. The model invents the concrete content; the engine owns what it costs.

## 1. Generation: seeds, not texts

The model writes the concrete demand in her voice; the registry holds only **seeds** (C1–C3):

```
practiceSeeds: {
  id, kind: 'task' | 'punishment' | 'demonstration' | 'protocol' | 'denial' | 'hold' | 'staging' (P17),
  tags: ContentCategoryId[],          // the gate (contentAllowed, her limits)
  track: PracticeTrack,
  tier: 1..5,                          // minimum track level
  gist: string,                        // 2–6 words: "forms of address in public", "kneel through her evening"
  stakes: 'trivial' | 'minor' | 'major' | 'severe',
  check?: CheckKind,                   // how keeping is judged (§2)
  proof?: 'none' | 'dm_report' | 'in_person' | 'witness',
  audience?: 'none' | 'select_few' | 'any',
  romantic?: boolean,                  // needs a romantic bond tier
  weight
}
```

New mechanic call **`practice_generate`** (budget 700; `prose` content line; P14 site `practice.<kind>`):
- **Input:** her card digest, `bond.practice` (style pair, appetite), frame, domains, track levels, enabled categories (disabled ones never named), her limits, `recent` forms to avoid, current context (day, slot, open tasks, Want, Impunity, present units), 3–6 candidate seeds (seeded pick by weight, gated) as examples, and the setting frequency.
- **Output (schema):** `{ kind, seedId? , tags[], track, tier, stakes, check, deadline?: { days, slot? }, proof, audienceIds?, text (her words, ≤ 400 chars), summary (≤ 80 chars, neutral, for the dossier and the engine log) }`.
- **The engine validates** everything: tags enabled and allowed for her, `tier ≤ track level + 1`, `stakes` within the frame's ceiling, check kind known, audience ids present and eligible, deadline in range. An invalid field is clamped or the whole output rejected (P14 records `invalid_output`, RETRY/REROLL available). **The engine never reads `text`.** Fallback when generation fails or is off: the seed's `gist` turned into a plain line (`AUTHOR TO WRITE` frame per kind).
- The model may invent a practice **without** a seed (`seedId` absent): then `tags`, `track`, `tier` and `stakes` must still validate. Seeds are examples and fallbacks, not a menu.

## 2. Checking: engine where possible, model otherwise

`CheckKind` (closed vocabulary; a new one is a code change):
- engine checks: `slot_with_her` (a scene or activity with her in the slot), `booking_kept`, `token_worn`, `not_on_roster` / `on_roster`, `dm_report` (a DM to her before the deadline), `no_scene_with:<unitId>`, `rule_kept_until`;
- `model`: judged by `intent_extract` in scenes and DMs with her (and with witnesses for public tasks): new intents **`task_kept`**, **`task_broken`** (`{ taskId?, confidence }`), and **`protocol_slip`** (P15).

A `dm_report` task asks the commander to report; the report is judged by the model (`task_kept` / `task_broken`); a **false report** may be found out later (a seeded roll per day while the task's witness or her Insight-like trait is present; finding out is a `task_broken` with stakes one step up and a compromat fact).

## 3. Tasks

`Task { id, holderId, kind, summary, text, track, tier, stakes, check, proof, deadline, chainId?, step?, status: 'open'|'kept'|'broken'|'refused'|'void', targetUnitId?, field?: boolean }` in `CampaignState.practices.tasks` (cap per holder by frame).

- **Delivery:** a DM, a note (P10b handwriting when present: a `paper` card in her hand), or a line in a scene; the card shows `[ACCEPT] [REFUSE] [TALK]` (TALK opens a scene; `compromise_reached` replaces the task text by the agreed version, stakes −1).
- **Chains:** a kept task can continue its chain (`chainId`, step+1, tier up when the track allows): escalation is gradual (B1).
- **Third parties:** a task may name a target unit ("ask Vex for her ration card, say it's for me"): the target is told in a directive when she is present; her reaction comes from her own `witness` attitude (P15 §8).
- **In the field:** `field: true` tasks are judged at `endExpedition` (engine checks on the run tally or the recap intents).
- **Refusing** = the P9 refuse path (`refuseLikeDemand`) scaled by the frame + her discipline (§4). **Breaking** = her discipline.
- **Frequency:** a day-step roll per holder at frame ≥ `play`: base by frame × P15 frequency setting × `assertiveness().demandMult` × her Want band × appetite; at most one new task per holder a day; none while one of hers is open at `role` or above unless her domain is `household`.

## 4. Her discipline (punishments of the commander)

Registry `holderPunishments` (seeds of kind `punishment`, but with a fixed **severity ladder** for the engine): `{ id, tags, severity: 1..5, effect: Effect[] }`, effects from a closed vocabulary: `slot_held` (the commander spends a slot as she says; a hold, §8), `privilege_revoked` (DMs to others, free activities, a room: a restriction on the commander like P9's on units), `protocol_extra` (a protocol for N days), `cold_shoulder` (she withdraws N days: no DMs, no scenes; Want rises for both), `confession` (the commander must tell X — a demonstration with `public_humiliation`), `mark` (P9c `her_mark` when `body_modification` is on), `stress`, `injury_chance` (only with `pain_rough` or `physical_discipline_shown`, by the P7 body/endurance route **and** a non-body route that lowers it).

- **When:** a broken task, rule (P9d, when she holds), protocol slip, denial slip (§7), a refused milestone at `role`+, an overruled countermand (command domain), or the commander asking for it (§9).
- **Severity:** the offence's stakes, her style (`cruel` +1, `affectionate` −1), frame, repeat count.
- **The commander answers:** `[ACCEPT]` (a repair: part of the Trust/Affinity loss is restored, hold +, track `discipline` xp; the model narrates it; `physical_discipline_shown` decides whether it is shown or only reported), `[NEGOTIATE]` (a scene; `compromise_reached` lowers severity by one), `[REFUSE]` (defiance toward her: hold −, her Impunity +, at `rule` a contest of authority; she may escalate once).
- **Public execution** of a punishment needs `public_humiliation` **and** `audience ≠ private_only`; the audience reacts as in a demonstration (§5).
- **Taking it for another (inverse scapegoat):** with the `command` domain she can order a P9 punishment of a soldier through the commander; the commander may **take it instead** (`[TAKE IT INSTEAD]`): the soldier is spared (her Trust +), the commander receives a `holderPunishments` entry of equal severity, the squad sees it (P9b standing of the commander, record).
- UNDO follows P9's rule: an `Inverse`, never a snapshot.

## 5. Demonstrations

A demonstration shows her hold before others. Whether she stages one at all, and its form, depends on **her** profile and on **the audience's** profiles (author ruling: not only on relationship numbers).

- **Gate:** her `audience ≠ private_only`; `public_humiliation` for anything humbling before others (a demonstration of protocol alone needs `service`); frame ≥ `play` (`role`+ for anything above tier 2).
- **Audience pick:** `select_few` → her friends and the leader (P9b), among units present at base; `show_off` → whoever is in the room (the mess at evening is the stage); `indifferent` → no staging, but a practice in sight may be seen by chance (a seeded roll).
- **Form:** generated (`kind: demonstration`), seeded by forms such as "service at the mess table", "protocol before her friends", "showing a kept task", "her verdict, aloud". The audience's `witness` attitudes are in the input so the form fits who is watching.
- **Runs as** a group scene (origin `event`, location by form; P3 `maxParticipants` 4: her, the commander and up to two audience members on cards; others present by narration).
- **Reactions** per audience member (P15 §8): `drawn` → interest, maybe her own dynamic starts; `indifferent` → a fact; `dislikes` → Impunity toward the commander up, the holder's standing down, possibly an intervention. Every member gets a `knows_dynamic` fact. **Outside**: only demonstrations tagged `public_humiliation` feed P9b outside perception and rumors (B4).
- Outcomes: hold +, track `public_humiliation` / `service` xp, her Want relief (by appetite), compromat for her.

## 6. Service

Category `service`.
- **Protocol:** standing rules of address and conduct ("stand when I enter", "ask before you sit", "ma'am in front of the squad") as `relationshipRuleTemplates` tagged `service`, proposed by a holder at frame ≥ `play` (more and stricter at `role`). Kept/broken by intent (`rule_kept` / `rule_broken`, `protocol_slip`).
- **Routine:** a daily micro-task that costs no slot (her morning: gear, coffee, report). It counts as kept unless the model reports it broken in a scene or DM that day; the commander can confess (`[I DIDN'T]` chip) for a lighter punishment.
- **Her verdict:** after a scene with service in it, `intent_extract` reports `service_rated { verdict: 'pleased' | 'adequate' | 'displeased' }`; verdicts accumulate into **favour** (`Relation.dynamic.favour`, small, decays) that unlocks her kindnesses (a slot given back, a relaxed protocol for a day, Want relief, a gift, a softer punishment) and her refusals.
- **Serving several:** two holders with `household`/`private_time` claim the same time → P9c's booking conflict; serving one in front of the other is a demonstration with jealousy reactions.

## 7. Denial

Category `denial`. The commander's inner state is **not** a meter (ruling E): denial lives as a **rule** and as **scene conditions** (P17).
- Rule template `ask_permission` (tagged `denial`) and variants; while it holds, scenes with her and DMs show a chip **`[ASK PERMISSION]`**; her answer is decided by the engine from style, favour, Want and frame (`grant` / `deny` / `make you wait` (a deadline) / `earn it` (a task)) and sent as a directive.
- A slip (`intent_extract`: **`denial_broken`**) → her discipline (§4).
- Denying relieves part of **her** Want (it satisfies her too: `TUNING.practice.denialRelief`).

## 8. Holding (restraint)

Category `restraint` (includes sensory control).
- **The hold:** a booking kind `held` (P9c `bookingKinds`, tags `restraint`): the commander spends 1–2 slots or the rest of the day in her quarters. State `practices.held = { by, untilSlot, untilDay, sensory: boolean }`. Whereabouts: the hub shows the commander in her quarters (a derived reason `held`, no stored room). Everything else booked in that time lapses with the P9c consequences (another holder's booking → a conflict).
- **Sensory:** `sensory: true` dims the device: no portraits, no header, sound low, only lines of text (a `visualFlags` mode `sensory`, read through `motion.ts`/`visualFlags`, never `matchMedia`). P17's obscured presence layer reuses it.
- **Asking to be let go:** a chip; her answer by style and frame.
- **"Forgot":** at high Impunity or `cruel` style she may extend the hold by a slot (a seeded roll); another unit may find the commander (P17: a visitor in a staging without a holder present).
- **Duty vs hold (B5):** when an alarm comes while the commander is held (a director emergency, a mission deadline, an expedition launch, a night event), the engine decides her answer from her values (`mercy`, duty, `corporate`) against her style (`possessive`, `cruel`) and frame: **release** (hold − small; the squad never knew), **release late** (the squad waited: P9b standing of the commander −, facts), or **keep** (the squad leaves without the commander or waits: the run starts without command, CP 0 for that run, or the deadline slips; the squad learns why). The commander can ask, argue (a one-exchange scene), or defy (a `force`-style exit risk).

## 9. The commander's initiative

Chips in scenes and DMs with an eligible unit (frame ≥ `equal` and eligibility, P15 §3): **`[OFFER MYSELF]`**, **`[ASK FOR A TASK]`**, **`[ASK FOR PUNISHMENT]`**. Her answer from style, Impunity, hold and Want:
- **accepts** → a practice now or a task; hold +; may start a dynamic (if the cap allows) or speed a milestone;
- **mocks** (cruel, cold, playful at low hold) → a humiliation fact, her Impunity +, and if others are present, they saw it (P15 §8; outside only with `public_humiliation`);
- **refuses** → a minor rejection; `affectionate` refuses kindly (no Impunity), `possessive` takes it as an opening and claims later.

Asking another woman while held by a holder is a matter for the `others` domain (her consent) and jealousy reactions.

## 10. Directives and intents

Directives (`practice:`-prefixed, derived): open tasks she expects (summary, not her text), protocol in force, the hold and sensory mode, a pending permission answer, the audience instruction in a demonstration. No pronoun for the commander.
Intents: `task_kept`, `task_broken`, `service_rated`, `denial_broken` (+ P15's). Engine events: `task_issued`, `task_answered`, `task_kept`, `task_broken`, `task_void`, `punishment_issued`, `punishment_answered`, `punishment_taken_for`, `demonstration_staged`, `demonstration_seen`, `protocol_set`, `routine_kept`, `permission_answered`, `hold_started`, `hold_extended`, `hold_released`, `hold_alarm`, `offer_answered`. Actions: `practice/answer_task`, `practice/report`, `practice/answer_punishment`, `practice/take_instead`, `practice/ask_permission`, `practice/ask_release`, `practice/answer_alarm`, `practice/offer`, `practice/confess`.

## 11. UI

Task card and punishment notice in her voice (P10 voices; P10b handwriting when present), a demonstration card with the audience, the held overlay (her quarters on the hub, the sensory mode), chips listed above, open practices in DYNAMIC (P15). Every element `data-analyze`.

## Depth revision (design session 2026-11-19)

Added after the 0.2 depth review; built on P15a (blocking, moments, contact physics). Where it conflicts with the sections above, this section wins.

- **Speech under control as a choice.** Under a strict speech rule (P17b §3) the input can turn into **3–4 lines she permits**: generated by the model in her frame (P14 site `practice.speech_options`), one of them a trap to her taste. Choosing the trap is a slip. Typing remains possible where her rule allows it; the engine never reads the lines' text, only the option tags.
- **Named postures of her protocol.** A holder with `ritual` (or a contract clause, P17a) keeps her own set of postures with **names she gives them** (generated once per posture, stored on the pair). She names one; the commander must take it **quickly and correctly** (a choice from the set or a gesture, on a timer; the timer is an interaction type of P15a and can be switched off). A wrong or slow posture is a slip. The set grows with the `service` track; each holder's set is her own. The postures are P15a `blockingPostures` entries with a pair-local name.
- **Service as a pair of activities.** Service while she works or rests is P15a's pair "her activity + the commander's activity" (no touch) or a service contact (with touch); `fits`, `presence` and `judged` decide the verdict (§6) against her expectation profile (P15 §15.3).
- **§9 (the commander's initiative)** is superseded for `[OFFER MYSELF]` by P15 §15.7 (offering composed from the vocabularies). `[ASK FOR A TASK]` and `[ASK FOR PUNISHMENT]` stay.
- **§8 (holding)**: `practices.held.sensory` and the hold's whereabouts become P15a blocking (`anchor`, `worn` with `perception` effects); "forgot" generalises to P15a §9.2.
- **Memory check:** speech-option slips and posture slips are bookkeeping that feeds her discipline (§4), which already writes its own facts; nothing new is remembered.

## Acceptance criteria

1. Without an eligible holder at frame ≥ `play`, nothing runs and seeded tests stay byte-identical.
2. `practice_generate` validates every field, never reads `text`, falls back to the seed gist, and goes through P14 (retry, reroll before the commander answered).
3. Disabled categories and her limits never appear in seeds, generated output or the prompt; a category switched off withdraws open practices tagged with it, with no deltas.
4. Tasks: delivery, accept/refuse/talk, engine and model checks, false reports found later, chains escalate within track levels, field tasks resolve at expedition end.
5. Her discipline: severity by the rule, the three answers, public execution gated, TAKE IT INSTEAD, UNDO by `Inverse`.
6. Demonstrations: gate by her profile, audience picked by appetite, reactions by each audience member's profile, outside effects only with `public_humiliation`.
7. Service protocol, routine, verdicts and favour; denial rule, permission answers, slips; the hold with whereabouts, lapses, sensory mode, the alarm decision and its three outcomes.
8. The commander's initiative: all three answers by profile.
9. Every new element carries `data-analyze`.

## Open decisions (author)

- Seed list and gists; punishment ladder; the plain fallback lines; style → severity and answer tables; every number in `TUNING.practice`.
- Whether routine needs any player action at all (draft: none; only the confession chip).

## Interfaces to be provided by P15

- `Relation.dynamic` (frame, domains, tracks, `recent`, favour), the capability readers, holder eligibility, the frequency setting, `knows_dynamic` facts and the reaction table, compromat writers, `protocol_slip`.

## Interfaces already provided by P10d (implemented — use, do not rebuild)

- **The plan** (`planRooms`, `src/engine/basePlan.ts`): every place on two floors and the roof, with doors. **Affordances live on plan rooms** (`affordances`: `desk`, `bunk`, `lock`, `line`, `curtain`, `cupboard`, `crowd`, `exposed`, `window`, `water`, `mirror` in the core data); read them there, not on `hubRooms` / `locations`. A new place (shower block, briefing room, corridor) already exists as a closed plan room: give it a hub room and it opens.
- **Space:** `neighbours(reg, id, 'door')` (one step through a door, an opening or a staircase; `outside` for a door to nowhere), `neighbours(reg, id, 'wall')` (what the next room hears), `route(reg, from, to)` (rooms, length, floors) for visitors, summons and footsteps. The outside is per floor: an upper floor's exterior door (the fire stair, the kitchen roof) is a dead end, never a way down.
- **Persons:** `roomOfPerson(state, reg, here, 'commander')` is where the commander is drawn (the commander's cabin today): a hold, a claimed night or the cage add a derived reason there. P10d draws **no** commander marker: the package that first moves the commander adds it (a marker in `planView.ts` read from `roomOfPerson`, with its glossary entry).
- **Marks:** `registerPlanMarks(provider)` draws a tint, a chip or a prop on a plan room (her territory, a forbidden room, a locked door, the place of a staging); kinds are free strings read by CSS (`data-marks`).

## Interfaces already provided by P14 (implemented — use, do not rebuild)

- **Every model call goes through the envelope** (`app.generations`, `src/llm/envelope.ts`): `generate(siteId, key, opts?)`, `retry`, `reroll`, `rerollState`, `drop`, `useFallback`. `callLlm` is imported by that module alone (`tests/architecture.test.ts`).
- **A package that adds a call type or a flavor kind registers its site in the same change:** a `SiteDecl` in `src/llm/sites.ts` (`id` like `<area>.<what>`, `callType`, `surface`, `reroll` mode, `record` mode, generic `label`, glossary id) and the handlers bound by the owning controller (`envelope.bind`: `build` rebuilds the input from the state, `apply` runs the same engine action as before, `fallback`, `committed` / `undo` for the reroll mode). `tests/llm/siteRegistry.test.ts` fails for a call type or flavor kind without a site; the architecture test refuses a direct `callLlm`.
- **A failure** is `refused`, `truncated`, `timeout`, `network`, `invalid_output`, `empty` or `no_profile`; the envelope writes a record (`CampaignState.generations`, at most 20, no prompt, no model text, `detail` never the model's words) unless the site's record mode is `none` or the reason is `no_profile`. Add the chip with `drawGenerationChips(host, ctx.generation, state, surface, filter)` and REROLL with `drawSiteReroll`; a screen draws neither without `generation` in its context. Labels are generic: never put a hidden value in one.
- **The engine decides:** a retried or rerolled value goes through the same sanitizer and the same action as the first one; none of the new actions draws from the rng, so a new site must not either (a seeded test that moves stops and reports).
