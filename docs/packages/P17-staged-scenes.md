# P17 — Staged Scenes and Obscured Presence

**Status: spec.** Release 0.2 (post-release). **Depends on:** P15a (blocking, moments, contact physics), P16 (practices, `practice_generate`, the hold and sensory mode), P15 (the dynamic, reactions, compromat), P14, P3 (scenes, participants, intents), P9c (bookings, squad secrets), P9d (lead, publicity), P10 (hub rooms, whereabouts, voices, portraits), P7 (non-body routes), P7a. **Read:** overview; P15; P16; this file; the **Implemented as** of P3, P9c, P9d and P10.

**Analysis tool (P7a):** every new stat, chip and card carries `data-analyze`; Strain and suspicion get a provider through `Knowledge`. **P14:** every generation registers a site.

## Goal

A **staged scene** is a scene the holder sets up: who is where, who knows, what the commander must keep up, and who may come in. The template must cover very different situations with one mechanism. The model case (author's example): the commander serves her in secret under her desk while another soldier walks in to talk to her. Others: kneeling in the corner through her report to the leader, on an open comms line while she speaks to oversight, held alone in her quarters when someone knocks, kept under denial through her meeting.

## 1. The staging template

Registry `stagings` (seeds; the model may compose new ones through `practice_generate` with `kind: 'staging'`, validated against the same vocabulary):

```
Staging {
  id, tags: ContentCategoryId[], track, tier,
  roles: {
    lead: { requires: { frame, style?, audience?, tracks? } }
    subject: 'commander'
    others: [{ role: 'visitor' | 'audience' | 'listener',
               visibility: 'unaware' | 'aware' | 'remote' | 'arriving',
               pick: 'reason' | 'friends' | 'leader' | 'anyone_present' }]
  }
  condition: 'silence' | 'stillness' | 'posture' | 'task' | 'denial' | 'time'
  place: { affordances: Affordance[], sceneLocationId? }
  outcomes: { held, slipped, exposed, stopped } → Effect[] per role
  weight, description
}
```

- **Lead** is the holder; **subject** is always the commander in 0.2; **others** are 0–N soldiers with their own visibility:
  - `unaware`: present and not knowing (the desk case);
  - `aware`: watching (it becomes a demonstration, P16 §5 gates apply);
  - `remote`: on a line (comms, an open DM call);
  - `arriving`: enters during the scene (§4).
- **Condition** is what the commander must keep up; it decides what **Strain** (§3) means: risk of discovery (`silence`, `stillness`), composure (`posture`, `task`), endurance (`denial`), the clock (`time`).
- **Outcomes** per role for each ending: `held` (the condition was kept), `slipped` (Strain crossed its threshold but nobody outside noticed), `exposed` (an unaware or arriving other found out), `stopped` (the stop word, §7).

Draft seeds: `under_the_desk` (service, silence, visitor arriving unaware), `corner_at_report` (posture, the leader aware), `on_the_line` (silence, oversight or a soldier remote), `held_alone` (restraint, time, a visitor arriving by chance), `denial_meeting` (denial, others unaware). Texts `AUTHOR TO WRITE`.

## 2. Places and affordances

`hubRooms[]` / `locations[]` gain `affordances`: `desk`, `curtain`, `lock`, `line`, `bunk`, `cupboard`, `exposed` (the roof), `crowd` (the mess). A staging needs its affordances; code reads affordances, never room ids (P10 rule). Booking a staging is a P9c booking (kind `staging`, tags from the staging) in her place.

## 3. Strain

`scene.staging = { stagingId, strain: 0..100, suspicion: { [unitId]: 0..100 }, mode, tactic, phase }` on the open scene (cleared at scene end; reset on chat switch like everything keyed by scene id, P11 rule).

Each exchange, the engine moves Strain by: the condition's base, the commander's **mode** (§5), her **tactic** (§6), the others present and their attention (a visitor's reason, §4), the track level (practice makes it easier), and a seeded draw. The check that resists it uses a **non-body route** (P10 principle; a social stat — Insight or Authority by condition — and the `restraint`/`service` track level), never a body stat alone.

Thresholds (`TUNING.staging`): **slip** (the condition broke: a sound, a movement) and **exposure** (an unaware other's suspicion reached its limit). Suspicion of each unaware other rises with Strain spikes, her own Insight and her visit reason.

**What the player sees (A2):** a Strain bar in the scene header (band, no number) and **suspicion lines**, short and indirect in the scene frame ("Vex's gaze rests on the desk a beat too long."). Exact values only through analyze, filtered by `Knowledge`.

## 4. The visitor

A visitor enters as a **real participant**: her card speaks, her sprite (obscured, §8) appears, and the scene becomes a group scene while she is in it (A1, author ruling).

- **Who:** a named living unit at base, not on an expedition, not restricted (`restrictionReason`), whose whereabouts make sense for the slot, picked by the staging's `pick` rule and the reason.
- **Why (registry `visitReasons`):** `{ id, expectedExchanges: [min, max], suspicionMult, staysIfSuspicious: boolean, requires?: { leader?, duty?, relation? }, description }` — e.g. a report, borrowing something, a chat, suspicion, looking for the commander. The engine picks one; the visitor's directive states it and **when she leaves** ("she came to return the manual; she leaves after two exchanges unless something seems off").
- **Stay or go:** she leaves after her expected exchanges unless suspicion crossed her reason's threshold (then she lingers, asks, looks) or the reason is open-ended (`staysIfSuspicious`). The lead's tactic and the commander's mode change suspicion, so leaving early is possible.
- **Technically:** new scene actions `scene/add_participant { unitId, visibility }` and `scene/remove_participant { unitId }` (P3 owns scenes: this package extends P3's interface and updates its spec), limited by `TUNING.scene.maxParticipants`. A participant added mid-scene gets her own directive block; when she leaves, her block goes and a line notes the exit.
- **What she knows:** `unaware` visitors are told in a hard directive that they do not know and only notice what the suspicion lines say. The engine, not the model, decides discovery.

## 5. The commander's modes

Chips in the scene, one active at a time, default `continue quietly` (A4); free text always remains:
- **Continue quietly** — keep doing what she asked, carefully; Strain rises slowly, her favour rises.
- **Freeze** — stop everything; Strain from the condition falls, but a `task`/`service` condition counts as disobeyed and she may react.
- **Signal her** — a small sign to her (a touch, a tap); her tactic answers it.
- **Give yourself away** — deliberately (exposure; the commander chooses the scandal or ends the staging that way).

The intent extractor reads free text against the mode (`staging_mode` intent with the inferred mode) so typing "I stay still" works like the chip.

## 6. Her tactics

Registry `stagingTactics`, picked from her style pair and frame, re-picked when Strain or suspicion jumps:
- **Composed** (`cold`, `ritual`, `clinical`, `drill`, `regal` without an audience): she freezes too and behaves as if nothing were happening; suspicion falls, Strain holds.
- **Taunting** (`playful`, `cruel`, `vindictive`): a nudge with her foot to make the commander go on; Strain rises, her satisfaction and favour rise, the risk is hers too.
- **Cautious** (`affectionate`, `possessive` at low frame): she locks the door if the place has `lock` (a visitor cannot arrive, or knocks and waits), or sends the visitor away early (expected exchanges −1).
- **Reckless** (`show_off` audience, `cruel`, `regal` with `show_off`): she courts discovery (suspicion rises); at `role`+ with `public_humiliation` she may let it happen.

Her tactic is a directive to her for the next exchange; the player sees it in her behaviour, and an analyze line on the scene header says what her tactic is when the commander could know it.

## 7. Endings and outcomes

- **Held** (the condition kept to the end): a **complicity secret** shared by the commander and her (P9c squad-secret machinery inverted: known by the two of them, kept from the others; discovery routes as P9c), hold +, track xp (`exposure_risk`, the condition's track), her Want relief, Dominance Drive bonus (P9d), favour.
- **Slipped**: her reaction by style (amused, displeased → her discipline P16 §4), track xp smaller.
- **Exposed**: the visitor learns (`knows_dynamic`, a fact with witnesses), reacts by her own profile (P15 §8: `drawn`, `indifferent`, `dislikes`; she may hold it over the commander: a leverage secret raising her Impunity, P9), publicity of a romantic relation moves to `known`/`public` (P9d `setPublicity`), compromat for the holder; with `public_humiliation` it can travel outside (P9b, rumors).
- **Stopped**: the **stop word** chip ends the staging at once. She respects it by her profile: respecting it is Trust +, favour unchanged; a `cruel` holder at `rule` may resent it (hold −, a cold shoulder) but the staging ends regardless. Never a deadlock for the player.

## 8. Obscured presence (a general layer)

A participant's **perception state** `clear | obscured` (A3, author ruling: general, reused later for missions — voices behind a wall):
- **Visual:** the sprite becomes a silhouette (blurred, desaturated; P10 portrait pipeline), the name in the chat is blurred/scrambled (`V▒▒▒`) — a class applied to the ST message element through `src/st/` only.
- **Prompt:** a POV directive: narrate only what the commander perceives (sounds, voices, touch; no faces, no gestures out of sight).
- **API:** `setPerception(participantId, state)` and `perceptionOf` in the scene controller; P16's sensory mode sets everyone `obscured`; a staging sets `obscured` for others when the commander is hidden (`under_the_desk`, `held_alone` behind the door).
- In 0.2 it is used by stagings and the sensory hold only; missions are a later package.

## 9. UI

Scene header: staging name (or her words for it), Strain bar, the condition, her tactic when known, the visitor's presence; suspicion lines in the scene frame; mode chips and the stop word; obscured participants in chat and portraits. Every element `data-analyze`.

## 10. Directives, intents, events

Directives `staging:`-prefixed: one for her (condition, tactic, what she expects), one per other by visibility (unaware: "does not know; notices only…", aware, remote), the POV directive. Intents: `staging_mode`. Events: `staging_booked`, `staging_started`, `visitor_entered`, `visitor_left`, `strain_slip`, `suspicion_rose`, `staging_held`, `staging_slipped`, `staging_exposed`, `staging_stopped`, `complicity_kept`, `complicity_found`. Actions: `staging/set_mode`, `staging/stop`, `scene/add_participant`, `scene/remove_participant`, `staging/answer_booking`.

## Depth revision (design session 2026-11-19)

Added after the 0.2 depth review; built on P15a (blocking, moments, contact physics). Where it conflicts with the sections above, this section wins.

- **A staging is a P15a preset**: a starting blocking for everyone (anchors, postures, contacts, items, her activity) plus a live `third_party` (or `remote`) moment source with this package's Strain and suspicion. The template's `place.affordances`, `condition` and `roles` stay; `roles.others[].visibility` maps to P15a visibility effects.
- **§5 modes** (continue quietly / freeze / signal her / give yourself away) are the option frame of the `third_party` source; free text maps through `moment_answer` (`staging_mode` stays as an alias).
- **§6 tactics** stay; her escalation uses the channel derived from the contact (P15a §7: the foot under the desk, the leash, a whisper).
- **§8 obscured presence** becomes a P15a `perception` effect read by the visual channel; the API (`setPerception`, `perceptionOf`) stays as specified and has no staging-specific code.
- A staging is now one family of moments; tension in a two-person scene comes from P15a's other sources.
- **Memory check:** as §7 (`complicity_kept` is a squad secret, not a fact; `staging_exposed` writes `knows_dynamic` facts at its site); P15a §13 covers the moment outcomes.

## Acceptance criteria

1. Without `exposure_risk` (and the condition's own category) enabled, no staging is offered; disabled categories never reach the prompt.
2. The template covers the five draft seeds with one mechanism; a generated staging validates against the same vocabulary.
3. Strain and suspicion follow the rules with a non-body route; the player sees bands and indirect lines only.
4. A visitor joins as a real participant with her directive, leaves on time or stays when suspicious, and is removed cleanly; participants never exceed the cap.
5. Modes, tactics and the lock affect Strain and suspicion as specified; free text maps to a mode.
6. All four endings apply their outcomes per role; the complicity secret works with P9c discovery; exposure reaches outside only with `public_humiliation`; the stop word always ends the staging.
7. The obscured layer blurs sprite and name and adds the POV directive; it is general and has no staging-specific code inside it.
8. Staging state is reset on chat switch.
9. Every element carries `data-analyze`; every generation goes through P14.

## Open decisions (author)

- Seed stagings and their texts; visit reasons; tactic texts; suspicion line pool (or generated by `flavor`, kind `suspicion`).
- Every number in `TUNING.staging`.

## Interfaces already provided by P15 (implemented — use, do not rebuild)

P15 is implemented (see its **Implemented as**: rulings R1–R25). What follows is what exists for this package and what is reserved for it. Every P15 reader answers null, zero or an empty list while the dynamic is off (`dynamicOn`, `herPracticeLive`), and nothing it adds draws from the rng unless someone is eligible: a hook you register must keep a campaign with no dynamic byte-identical (`tests/dynamic/unaffected.test.ts`). Keep new directive ids away from `dynamic:`; read domains by capability, styles, milestones and aftermaths by field, never by id; no text gives the commander a pronoun or a feeling.

- **Frame and style pair of the lead:** `frameOf(state, unitId)` and `physicsStyleOf(state, unitId, reg)` answer through P15's registered readers (only for a unit with her own `Relation.dynamic` whose practice is live); `leadingStyle`, `surfaceHolds` give the style that leads a phase; `dynamicFrames[].outside` and `promptHint` are data.
- **Reactions:** `reactToDynamic`, `witnessOf`, `reactionOf`, `dynamicTerm` (the Impunity term) and `standingMalus` (P9b standing), the directive `dynamic:witness:<observerId>` and the facts of the three knowledge levels (`levelOf`, tag `dynamic_knowledge`, `hiddenFromCommander` until a shared scene or DM). **`exposed_staging` is a reserved instant sign row with no producer: yours** (`knowInstantly(draft, ctx, observerId, holderId, 'exposed_staging')`, after `contentAllowed` on the row). Suspicion from noise is not built.
- **Compromat writers:** `addCompromat`, `compromatOf`, `mentionCompromat`, `tellCompromat` (a told compromat can spread as a rumor with `public_humiliation`); the moment source `compromat_hint` is wired through `registerMomentTrigger`.
- **`knows_dynamic`:** read through `levelOf(state, observerId, holderId)` (engine) or `Knowledge.dynamic` (UI and readings); never from `state.dynamic.knowledge` in a surface.
- **A staging as a dynamic reason to move the commander:** `roomOfPerson(…, 'commander')` reads `second_place`; add your own derived reason there. A holder's presence makes the blocking live (`registerBlockingGate`).
- **Left to P16:** `practice_generate` (`kind: 'staging'`), the hold and its sensory mode, her discipline for a slipped condition, favour (see P16's section).

## Interfaces already provided by P10d (implemented — use, do not rebuild)

- **The plan** (`planRooms`, `src/engine/basePlan.ts`): every place on two floors and the roof, with doors. **Affordances live on plan rooms** (`affordances`: `desk`, `bunk`, `lock`, `line`, `curtain`, `cupboard`, `crowd`, `exposed`, `window`, `water`, `mirror` in the core data); read them there, not on `hubRooms` / `locations`. A new place (shower block, briefing room, corridor) already exists as a closed plan room: give it a hub room and it opens.
- **Space:** `neighbours(reg, id, 'door')` (one step through a door, an opening or a staircase; `outside` for a door to nowhere), `neighbours(reg, id, 'wall')` (what the next room hears), `route(reg, from, to)` (rooms, length, floors) for visitors, summons and footsteps. The outside is per floor: an upper floor's exterior door (the fire stair, the kitchen roof) is a dead end, never a way down.
- **Persons:** `roomOfPerson(state, reg, here, 'commander')` is where the commander is drawn (the commander's cabin today): a hold, a claimed night or the cage add a derived reason there. **P15 added the commander marker** (`renderCommanderMarker`, drawn by `planView.ts` only while the commander is out of her own cabin, glossary `commander_marker`): a new reason to move her is only a derived reason inside `roomOfPerson` (P15's is `second_place`: a holder's booked evening puts her in the holder's cabin); the marker needs no change.
- **Marks:** `registerPlanMarks(provider)` draws a tint, a chip or a prop on a plan room (her territory, a forbidden room, a locked door, the place of a staging); kinds are free strings read by CSS (`data-marks`).

## Interfaces already provided by P14 (implemented — use, do not rebuild)

- **Every model call goes through the envelope** (`app.generations`, `src/llm/envelope.ts`): `generate(siteId, key, opts?)`, `retry`, `reroll`, `rerollState`, `drop`, `useFallback`. `callLlm` is imported by that module alone (`tests/architecture.test.ts`).
- **A package that adds a call type or a flavor kind registers its site in the same change:** a `SiteDecl` in `src/llm/sites.ts` (`id` like `<area>.<what>`, `callType`, `surface`, `reroll` mode, `record` mode, generic `label`, glossary id) and the handlers bound by the owning controller (`envelope.bind`: `build` rebuilds the input from the state, `apply` runs the same engine action as before, `fallback`, `committed` / `undo` for the reroll mode). `tests/llm/siteRegistry.test.ts` fails for a call type or flavor kind without a site; the architecture test refuses a direct `callLlm`.
- **A failure** is `refused`, `truncated`, `timeout`, `network`, `invalid_output`, `empty` or `no_profile`; the envelope writes a record (`CampaignState.generations`, at most 20, no prompt, no model text, `detail` never the model's words) unless the site's record mode is `none` or the reason is `no_profile`. Add the chip with `drawGenerationChips(host, ctx.generation, state, surface, filter)` and REROLL with `drawSiteReroll`; a screen draws neither without `generation` in its context. Labels are generic: never put a hidden value in one.
- **The engine decides:** a retried or rerolled value goes through the same sanitizer and the same action as the first one; none of the new actions draws from the rng, so a new site must not either (a seeded test that moves stops and reports).

## Interfaces already provided by P16 (implemented — use, do not rebuild)

P16 is implemented (see its **Implemented as**: rulings R1–R24, the memory check and the open items). Everything it adds is off, absent and byte-identical while nobody holds at `play` or beyond (`practiceLive`), and none of it draws from the rng (`practiceRoll`). Keep new directive ids away from `practice:`; read seeds, punishments, ceremony steps, booking kinds and rule templates by field, never by id; no text gives the commander a pronoun or a feeling.

- **`staging` is not a practice kind.** `PRACTICE_KINDS` reserves nothing for it and the P15 gain row for `staging_held` (+5) has no producer: add the kind with a writer in `WRITERS` (`issue.ts`), a seed set and `kindsToday` picks it up; the controller's delivery branch per card kind (`deliver`, `deliverDemonstration`, `deliverPunishment`) is where a new card kind is delivered.
- **A hold that runs on:** a held slot that ends can be extended by "forgot" (`hold_extended { reason: 'forgot' }`, never past the evening unless the slot is already evening); a visitor during a hold is not built. `heldNow`, `heldGuard`, `heldLocation`, `sensoryNow` and the `held_in_quarters` booking kind (`held: true`) are the readers; `roomOfPerson(…, 'commander')` already returns her cabin while held and `hub.ts` places the holder there (reason `holding`).
- **Audiences:** `pickAudience(state, reg, holderId, slot)` and `demonstrationGate` are the one reading of who may be shown to whom; `demonstration_seen { observerId }` and the `demonstration` sign are what the observers get. `exposed_staging` is still yours.
- **The alarm** (`practices.alarm`, `hold_alarm`, `practice/raise_alarm`) and the run without the commander (`ExpeditionState.withoutCommand`, `squadChoice`) are the way a staging that keeps the commander away from a duty should decide: do not invent a second one.

## Interfaces already provided by P15a (implemented — use, do not rebuild)

P15a is implemented (see its **Implemented as**: rulings R1–R16). It built the parts below as hooks or data only; this package completes them.

- **Channels:** the `strain` channel and the obscured presence layer (`perception`) have no reader in P15a beyond the `blocking:pov` directive. Strain and suspicion from noise are yours to read from `physics_noise { loudness, kind }`.
- **The stop word:** `physics/stop_word` ends a hold and removes its contact or item whatever her profile. Its outcomes (Trust +, her resentment) and the staging stop are yours.
- **Read from the events:** `physics_noise { loudness, kind }`, `physics_outcome { result: 'stopped', … }`. `blocking:pov` is the directive that carries the obscured presence today.
