# P9d — Desire & Bonds: Bond Profile, Content Categories, Lead, Want, Relationship Rules, New Defects, Publicity

**Status: implemented** (plan: `docs/plans/2026-11-15-p9d-desire-bonds.md`; see **Implemented as** at the end; where it differs from the draft, the code wins). **Depends on:** P3 (relationship graph, scenes, intents), P7 (commander), P9 (Impunity, demands), P2 (calendar, night events). **Read:** overview; this file; P3; `content/defects.md` (Desire/Bond category).

Packages P9b and P9c read the bond profile defined here; implement §1 and §2 first.

**Analysis tool (P7a):** every new player-facing stat, chip, option and choice card in this package carries `data-analyze`, has a glossary entry or registry `description`, and live values get an analyze provider reading through `Knowledge`.

## Goal

Make romance, desire and intimacy mechanically meaningful while keeping the player in full control of what content appears: an opt-in content model, a per-unit bond profile so only fitting characters use these mechanics, "who leads" in romantic scenes, desire as a pressure that builds, relationship rules set by leading partners, two new Desire/Bond defects, and public vs private relationships.

Scene content itself stays the main model's job (and the user's preset). This package governs **what may appear**, **who drives**, and **what follows**.

## 1. Bond profile (import extension)

`profile_import` adds (editable in the wizard, "Re-sync from card" supported):

```
Unit.bond {
  leadStyle: 'dominant'|'assertive'|'balanced'|'yielding'
  attachment: 'slow'|'steady'|'intense'|'avoidant'
  desire: 'low'|'medium'|'high'
  caretaker: boolean
  ownLimits: { categories: ContentCategoryId[], note?: string }   // what SHE would not do, from the card
}
```

The profile gates mechanics: Want (§4) only with `desire ≥ medium`; relationship rules (§5) only with `leadStyle ≥ assertive`; P9c bookings/courtship/device access per its tables. A unit with an empty or modest profile simply never uses them.

## 2. Content categories (opt-in)

Registry `contentCategories` (author-editable): e.g. `humiliation`, `public_humiliation`, `degrading_language`, `pain_rough`, `restraint`, `physical_discipline_shown`, `jealousy_games`, `body_modification`, `explicit_scenes` (supersedes the old single "explicit scenes allowed" switch), plus room for more.

- **All categories are off by default.** They are listed explicitly in the setup screen (P8 WORLD PARAMETERS → new section **CONTENT**) with a one-line description each, and in SYS for changes mid-campaign.
- **Enabling a category = the player's full consent** for that content to appear when the story leads there, with no further in-scene confirmation.
- **Disabled = excluded everywhere:** every main-model generation gets a hard exclusion directive listing disabled categories; mechanics never generate rules, demands, wager stakes, bookings or events tagged with a disabled category; `scene_summary`/`intent_extract` flag violations (`content_violation` with category) → the reply is marked in the UI and the player can regenerate.
- Changes mid-campaign apply from the next generation.
- **Characters' own limits** (`bond.ownLimits`) still apply when a category is enabled: she does not do what her card says she wouldn't. Pushing her past them = `rejected_advance` / `decision_violated` with the usual consequences — this protects character integrity, not consent.

## 3. Who leads

In scenes flagged romantic/intimate (scene tag set by state or by `intent_extract`), the engine decides the **lead**: from `leadStyle`, current state, Impunity, Dominance Drive (§6) and recent events. Directive: "{Name} leads this scene." The commander's options remain free text; the UI offers quick chips **follow / ask / set a limit** (a limit here is an in-fiction boundary for this scene, recorded as a fact; it is not the content-category system).

## 4. Want

Per eligible unit, `want ∈ [0, 100]`, rising daily: base by `desire` (medium +4, high +7) × attachment factor (intense ×1.4, avoidant ×0.6), only while in a romantic/`fwb` state or with Attraction ≥ 60 and `attachment ≠ avoidant`. Reduced by intimate scenes, close time together, and by being redirected (a demanding expedition, training together).

Effects by band: ≥ 40 more initiative (DMs, bookings in P9c, night visits via P2 queue); ≥ 70 stress + irritability directive; ≥ 90 Desire/Bond defects may trigger their breakdown behaviour (Imprint Hunger withdrawal, Reward Loop binge). The commander can satisfy, postpone (Affinity − small, patience directive) or redirect.

## 5. Relationship rules

Units with `leadStyle ≥ assertive` in romantic/`fwb`/`close` states can propose rules (registry `relationshipRuleTemplates`, each with tags checked against content categories): "report to me every evening", "nobody else touches your gear", "ask me before taking anyone on a night run", "you don't wear other girls' tokens", etc. The `flavor` call may personalize wording.

Proposal → `[ACCEPT] [NEGOTIATE] [REFUSE]` (negotiate opens a scene; `compromise_reached` sets the agreed version). Accepted rules: shown in her dossier and pinned on the PDA via device access level 2 (P9c); compliance tracked by engine events where possible (tokens, bookings, expedition roster) and by `intent_extract` (`rule_kept` / `rule_broken`) otherwise. Breaking: her Trust/Affinity −, stress +; witnessed breaks spread as facts.

## 6. New Desire/Bond defects (content/defects.md, category Desire/Bond)

- **Dominance Drive** `dominance_drive` — Upside: +damage and +initiative when acting on her own call; bonus when the commander yields decisions to her (endorsed leader, accepted rules, kept wagers). Downside: stress when the commander asserts authority over her (orders, punishments, overruled votes). Breakdown: *Seize Command* — ignores CP orders, issues her own to allies (they may follow). Arc: Cure / Manage (agreed domains of authority) / Embrace (formal co-command).
- **Caretaker Overdrive** `caretaker_overdrive` (requires `bond.caretaker`) — Upside: heals/relieves more when the commander or an ally is injured or stressed; bonus when the commander is frail/slight (P7). Downside: stress when he takes risks; tries to keep him at base. Breakdown: *Smother* — cancels his expedition participation / books his slots to keep him safe (uses P9c). Arc: Cure / Manage / Embrace.

Both follow the defect neutrality rule (balance harness).

## 7. Publicity

Each romantic/`fwb` relation has `publicity: 'secret'|'known'|'public'`, plus each side's preference. Mismatched preferences are a source of scenes and demands. `public` + she leads → other units react by values: some lose respect (their Impunity toward the commander +), some respect the honesty (Trust +), her friends close ranks. Secret relations can be discovered with the P3 secret-romance machinery; `claimed` (P9c) forces `public`.

## Acceptance criteria

1. Bond profile is imported, editable, re-syncable; units without suitable profiles never get Want, rules or P9c mechanics (test).
2. All content categories default off and are listed at setup; enabling/disabling changes the exclusion directive from the next generation; mechanics never produce items tagged with disabled categories (test over all registries); violations are flagged in the UI.
3. Characters' own limits hold even with categories enabled.
4. Lead is decided per scene and injected; chips work.
5. Want rises only under the stated conditions; bands trigger their effects; redirecting lowers it.
6. Rules: proposal, negotiation, compliance tracking and breaking consequences.
7. New defects pass the balance harness neutrality check.
8. Publicity states, preferences and reactions work; `claimed` forces public.

## Interfaces already provided by P9 (implemented — use, do not rebuild)

- **Impunity terms:** `S` counts a concealed affair (a fact tagged `affair` with her in `knownBy`) while a hidden partner does not know; `D` reads the relationship state's `dependency` field (a new state sets it in JSON). A bond or a Want that makes her depend on the commander uses these, not a new term.
- **Demands:** a Want can be a demand template (`kind: 'interpersonal'` or `'privilege'`), with `conditions.tagsAny` / `statesAny`; the refuse and grant paths already move R, Trust and Affinity.
- **Disposition and confidence:** a new intent type is judged per unit by the disposition's floors; engine-made events use confidence 1.
- **Directives:** do not use ids starting with `loyalty:`, `refusal:`, `threat:`, `discipline:`, `demand:`, `reputation:`, `nickname`, `world:`, `stance:`, `friction:`.

## Implemented as

Engine: `src/engine/bonds/{content,profile,scene,want,breakdown,dayStep,desire,rules,violations,publicity,publicitySync,smother,index}.ts`, `src/engine/actions/bonds.ts` (`content/set_categories`, `bonds/follow`, `bonds/limit`, `bonds/deliver_rule`, `bonds/answer_rule`, `bonds/set_publicity`; registers `bondsDayStep` on `dm_rumors` and the Want relief of companion activities). Non-engine layer: `src/bonds/{directives,controller,deps}.ts` (`createBonds` / `app.bonds`: `onEvents`, `answerRule`, `negotiateRule`, `onSlotAdvanced`, `setPublicity`), `src/ui/bonds/{chips,content}.ts`, `src/analysis/providers/bonds.ts`, `css/72-bonds.css`. Content: registries `contentCategories` (9) and `relationshipRuleTemplates` (5), `demandTemplates` 9, `eventDeltas` 38 rows, defects 20, `relationshipStates[].{bondTier,leadBonus}`, `activities[].wantRelief`. Numbers: `TUNING.bonds`.

### State
- `Unit.bond` (absent = `MODEST_BOND`, read through `bondOf`; a grunt has none), `Unit.breakdown.until?`; `CampaignState.content?: { enabled[] }` and `bonds?: { rules[], smother? }`; `Relation.want?`, `wantBreakDay?`, `contactDay?`, `publicity?`; `SceneRecord.tone?`, `lead?`, `followed?`, `limits?`, `violations?`; `CombatState.commander.build?`, `Combatant.refusal?`. All absent in an old save, which reads as nothing enabled, no Want, no rules.
- Events added: `content_changed`, `scene_tone`, `lead_decided`, `lead_followed`, `scene_limit_set`, `want_changed`, `want_breakdown`, `rule_proposed`, `rule_delivered`, `rule_accepted`, `rule_refused`, `rule_negotiating`, `rule_negotiation_open`, `rule_active`, `rule_kept`, `rule_broken`, `rule_broken_by_check`, `smother_started`, `smother_ended`, `publicity_set`, `publicity_cleared`, `publicity_changed`, `bond_revealed`. Intent types `rule_kept`, `rule_broken`, `compromise_reached` (`EVENT_TYPES` 30 → 33); `ENGINE_EVENT_TYPES` 5 (`granted_demand`, `refused_demand`, `followed_lead`, `rule_accepted`, `rule_refused`), never offered to the model.

### What changed against the draft (rulings; the plan's ruling section holds the full text)
- **Content categories** are one gate (`contentAllowed`) over six registries (`CONTENT_GATED_REGISTRIES`: rule templates, demand templates, punishments, dilemma templates, mission templates, clocks); a registry that joins it needs a `GATE_PROBES` entry (`tests/helpers/bonds.ts`). Turning a category off withdraws what carries it (demands, night entries, proposals) and suspends active rules; they return when it is allowed again. The old `explicitContent` switch is read once (carry-over in `afterLoad`/`replaceState`) and becomes the category `explicit_scenes`.
- **Tier, not a state.** `relationshipStates[].bondTier` is `romantic` or `close`; code reads the tier, never a state id (the one exception is the concealed-romance state, which P3's own machinery also names).
- **Want is a demand (user).** It reaches the commander as the demand kinds `desire` (`want_tonight`, `want_attention`), with SATISFY / POSTPONE / TALK; the cost `night_visit` queues a `want_visit` night entry; granting a desire demand counts no deed and refusing it is not a contest of authority. Off-combat breakdowns use `unit.breakdown.until` (a defect's `wantBreakdown { kind, days }`); the expedition-end release skips them and the bonds day step releases them.
- **Smother and co-command are stand-ins (user).** `bonds.smother = { unitId, untilDay }` locks `expedition/start` (message in `smotherRefusal`) for the rest of the day and the next; the UI controller opens a scene with her (her quarters, origin `event`) at the next `slot_advanced`, and a scene with her ends the hold (the plan's `calendar.pendingScene` route would hold the slot with no way for the player to open it). A defect's `embraceFlag` (Dominance Drive: `co_command`) is written on her relation when the Embrace path is decided, halves that defect's positive `eventStress` and sets the directive `co_command:<unitId>`. P9c/P9b replace both.
- **New combat vocabulary.** Conditions `orderedThisRound` and `commanderBuildIn`; `outgoing.vs: 'heal'` (scales the owner's heals, never her damage; `healBonusPct`); `order_refusal` is applicable on entry (it sets `Combatant.refusal`, read by `issueOrder` while the source is still in breakdown) and its `chance` is rolled per order. Defect fields `eventStress` (event type → stress; negative relieves), `embraceFlag`, `leadBonus`, `requiresBond`, `wantBreakdown`; `defectEventStress` is read by field, never by id.
- **Publicity** follows the tier (`syncPublicity` after every `enterState`, an UNDO restore, mutiny's `resentful`; the day step repairs a missed hook). `claimed` is only the exported `setPublicity(…, 'public', { cause: 'claimed' })`: P9c owns the event. "Her last decided lead" is not stored after a scene, so she leads when her open scene's lead is hers, else when her style is at least assertive.
- **Lead** is decided when the tone is first set or raised (`raiseTone`) and at `scene/start` for a romantic partner or a Want visit; never lowered. Rules, boundaries and the lead directive come from state in `bondsDirectives`, so they survive a reload.
- **Rules.** `Rule.delivered` (an undelivered proposal is not answerable; the app words it with `flavor` kind `rule`, setting `ruleWording`, default on, and the day step delivers the template text otherwise). Rule events belong to the commander (the rule binds the commander). `daily_contact` is judged at day end, `run_without_asking` at `expedition/start`; keeping is only ever read from the model (`rule_kept`), never farmed by the engine.
- **Violations** are flagged (a chip, `[REGENERATE]` on a scene reply), never retroactively rewritten; `scene_summary` drops facts that came from a flagged reply by three deterministic checks and only logs the violations.

### Balance pass (preliminary, all draft; the author owns them)
Checked by tables (`docs/BALANCE_REPORT.md` for combat, arithmetic over the day step for the rest). Changed from the first draft:
- **Dominance Drive:** outgoing +15 % → **+8 %**, initiative +10 % → **+5 %** (the first draft scored +7.0 pp at danger 4 and failed the ±5 pp rule; now +4.5); Seize Command refusal chance 0.5 → **0.4** (a refused order still costs CP and gives the target 6 stress, so 0.5 would brick the CP economy during a breakdown). The harness gives no CP orders, so its row is a best case.
- **Caretaker Overdrive:** unchanged (+3.7 pp): heal +0.5 % per 1 % of the allies' missing HP, +10 % DEF with a frail or slight commander, 2 stress a round while the commander is exposed.
- **Want rise:** high desire 7 → **6** a day (medium stays 4; intense ×1.4, avoidant ×0.6). With no contact a high-desire steady unit is restless on day 7, aching on 12 and breaks on 15 (was 6 / 10 / 13); medium on 10 / 18 / 23. One romantic scene (−25) holds a high unit for 4.2 days instead of 3.6, a high-intense one for 3.1 instead of 2.5: a lover needs about one romantic scene every four days, the cost the design wants without a harem becoming a full-time job. Kept: bands 40 / 70 / 90, relief per slot spent (companion 5 : train 15 : romantic scene 25 : intimate scene 60, so a romantic scene is the best use of one slot, a plain activity the worst), visit 30 on opening the door, a dangerous run −10, stress 2 a day from `aching`.
- **Rule proposal chance:** 0.12 → **0.05** a day × (assertive 1, dominant 1.5). A first rule comes after about 20 days (assertive) or 13 (dominant); with three leading partners the squad still sees a proposal in about two weeks out of three, and `maxActive` 3 plus one open per unit caps the burden (at 0.12 three dominant partners produced a proposal on nearly every other day).
- **Kept as drafted, after checking:** the lead weights (`styleBase` 15 / 40 / 60 / 75, Impunity 0.2 per point from 50, yields and enforcement ±10 capped at 20 over 3 days, thresholds 60 and 35: a balanced unit swings between both ends with the commander's behaviour, an assertive one leads unless enforced, a dominant one leads even when pushed, a yielding one is commander-led), the new `eventDeltas` rows (`followed_lead` Affinity +2 at minor, `rule_accepted` +3, `rule_refused` Trust −1 / Affinity −3 / stress +3, `compromise_reached` +2 / +2: all within the neighbours, `praised`, `listened`, `apologized`, `dismissed`), the template keep / break deltas, desire demand grant / refuse rows (a postponement is gentler than a refusal of the older kinds), publicity reactions (record +4, Trust +2) and the reveal roll (P3's 4 % + 4 % per other present).

### Non-obvious things to know before touching P9d code
- **Read by type or field, never by id:** tiers (`bondTier`), `leadBonus`, `wantBreakdown.kind`, `embraceFlag`, `requiresBond`, `eventStress`, effect types. The only ids the code names are the P3 concealed-romance state and the category `explicit_scenes` (the old switch).
- **Directive ids owned:** `content` (manual), `limits:<unitId>`, `lead`, `boundary:<n>`, `want:<unitId>` (manual; the patience text POSTPONE sets is the same id, `next_reply`, and a refresh never clears it), `rule:<unitId>`, `publicity:<unitId>`, `smother:<unitId>`, `co_command:<unitId>` and `ask:<unitId>` (`next_reply`). Keep new ones away from them.
- **Day steps run before the day rolls over**, so "today" in `bondsDayStep` is the ending day. Its order: publicity repair → stale rule delivery → release breakdowns → Want → breakdown crossings → desire demands → daily-contact check → rule roll → smother expiry. A rule proposed today is not judged today.
- **No new seeded draw unless someone is eligible** (Want ≥ 40 for the desire pick, a leading unit for the rule roll, a secret relation with others present for the reveal): no seeded test moved. Keep it that way.
- **A grunt has no bond.** `bondOf` is `null` for one; nothing in P9d runs for a grunt. Grunts cannot join scenes, so "group" means more than one participant.
- **Scene tone only exists in a scene with one named partner** and never lowers; romance off hides the lead directive and chips (the stored lead stays) and stops Want from rising.
- **`releaseBreakdowns(draft, ids?, reg?)`** takes the registries so a smother breakdown can start its hold; the three callers pass them.
- **Rule and demand wording is worded by the app, never by the engine**; the engine only ever stores the template text.
- **Import:** `bond` is a section of `profile_import` and of re-sync (`squad/resync`); Caretaker Overdrive is offered only when the imported bond says `caretaker` (19 defect candidates with Desire/Bond on, 14 off). `validateBond` sanitises a hostile section field by field.

### Open items
- "Her friends close ranks" has no unit-to-unit axes in v1: going public writes a public fact and the reactions above, nothing more.
- Tokens for `no_other_tokens` arrive with P9c (the check is intent-only until then).
- Smother and co-command are stand-ins until P9c (bookings) and P9b (hierarchy).
- A DM exchange never rolls a reveal (only her is present there); wire it when a thread can have others present.
- The harness cannot see `dominance_drive`'s downside, `caretaker_overdrive`'s commander rows, or any cost outside combat; balance them by play.
- Publicity: the commander's own choice (`commanderPref`) lives only while the relationship is romantic (a new relationship starts at the more private of her preference and `known`); a concealed romance (the P3 state) cannot be announced by the commander, only discovered; with romance off the level is kept but nothing about it reaches the commander or the model (lead and Want behave the same); UNDO of a punishment that moved her out of the tier puts her old publicity back (`Inverse.publicity`).
- Smother has a one-scene directive (`smother:<unitId>`) but no hub or dossier chip yet; the app retries her scene each new slot unless a restriction keeps her from scenes.
- Dominance Drive's "stress when ordered" and Compliance Craving's "stress when not ordered" both read `ordersThisRound` at her turn start, so only an order given before her turn in that round counts; the author may prefer an order-time hook.
- Every number above and every text marked `AUTHOR TO WRITE` (categories, rule templates, desire and publicity demand templates, glossary long texts, the visit framing) is a draft.
- Real `intent_extract` recall for `sceneTone` / `contentViolations` / the rule events, and real `flavor` wording of rules, are checked only by hand (`docs/MANUAL_TEST_P9d.md`).
