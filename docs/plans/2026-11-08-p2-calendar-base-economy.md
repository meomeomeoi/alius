# P2 Calendar, Activities, Base & Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The day loop works: the player spends slots on activities (alone or with a companion) from the OPS tab, resources flow, the base can be upgraded on the BASE tab, grunts can be recruited, and the day ends with upkeep, ticks and timers. The PDA header shows `DAY 012 // EVENING`, resources and Leash authorizations.

**Architecture:** All rules are pure engine code (`src/engine/`) registered as actions: `activity/do`, `calendar/consume_slot`, `base/upgrade`, `base/recruit_grunt`, `base/requisition`, `roster/set_active`, `squad/set_flavor`, `commander/injure`. Activities and facilities are JSON registries (`content/core`) validated by zod; activity effects are composed from a small set of generic effect types interpreted by one executor. The day-end pipeline is an ordered list of named steps; P3/P5 plug into three of them through `registerDayEndStep`. Relationship deltas go through a replaceable handler (`setRelationGainHandler`) so P3's diminishing returns can replace P2's default. LLM extras (companion vignette, grunt name/bio) are optional, fail-soft and never touch numbers.

**Tech Stack:** TypeScript 5 (strict), esbuild, zod 3, vitest (+ jsdom for UI). No new dependencies.

**Spec:** `docs/00-overview.md`, `docs/packages/P2-calendar-base-economy.md`; content drafts `docs/content/lore.md` §8 (base locations) and `docs/content/roles.md` §7 (grunts).

## Global Constraints

- English everywhere: UI strings, prompts, identifiers, comments (overview P8).
- `src/engine/**` stays pure (architecture test): no imports from `src/st`, `src/ui`, `src/llm`; no `window`/`document`.
- LLMs never write numbers into state (overview P1/P2). The vignette and grunt-flavor calls only produce text; deltas come from the activity table.
- Content-like data lives in JSON (overview P4): activities, facilities. Rule tuning (upkeep, shortage, prices, recruit cost) is code constants in `src/engine/tuning.ts`, in one place, not scattered.
- Campaign state stays `version: 1`. Every field this plan adds to `CampaignState` is optional and read through a defaulting helper, so P0/P1 saves load unchanged (same approach as P1's `world.startId`).
- Players' ids stay stable: grunt ids are `grunt_<designation>`; never reuse an id of a dead unit.
- Reuse P1 code instead of duplicating it: starting relation/trust rules come from `src/engine/setup.ts` (Task 6 extracts the shared helper).
- `dist/index.js` and `style.css` are committed; rebuild them in the last task.
- Commit messages end with the `Co-Authored-By:` / `Claude-Session:` trailers of the executing agent (overview P9).

## Where the code differs from the spec (read before Task 1)

- `Commander.socialStats` (P1) holds **ranks** (1–5); the spec talks about **points** with thresholds 0/10/25/45/70. Task 1 adds `commander.socialPoints?` next to the ranks. A rank set by a P1 start effect counts as that rank's threshold in points.
- P1 sets starting resources only from effects (`resource`), so a start gives 0 of everything it does not mention. The spec says "starting amounts per start/crime": Task 2 adds optional `starts[].startingResources` and `buildCampaign` applies it before the effects.
- Nothing in P2's scope produces **supplies**, while upkeep drains them every day. Task 5 adds a small `base/requisition` action (credits → supplies) so the loop is closed before P5 brings supplies from expeditions. It is a ruling, listed in the final report.
- `Unit.signatureSkill` is required by P1's type. Grunts get a signature drawn from the `signatures` registry using the template's own text (P4 may ignore it for `kind: 'grunt'`).
- `flavor` is the only registered-by-P0 LLM call id that fits grunt names; the vignette is a new call type `activity_vignette` (main profile, 150 tokens). Overview §5.2 and the P0 spec table get a row.
- The five facilities all exist at level 1 from the start (an absent key in `base.facilities` means level 1).

## File Structure

```
content/core/activities.json, facilities.json   new registries (+ manifest entries)
content/core/starts.json                        + startingResources
src/content/schemas.ts                          ActivitySchema, FacilitySchema, activity effect schemas
src/content/refs.ts                             activities.facilityReq → facilities
src/engine/state/types.ts                       optional fields (see Task 1)
src/engine/tuning.ts                            all rule constants
src/engine/social.ts                            ranks, points, checks
src/engine/relationGain.ts                      swappable relation delta handler + default diminishing returns
src/engine/economy.ts                           facility helpers, upkeep math, shortage penalties
src/engine/calendar.ts                          slots, day-end pipeline, rollover
src/engine/activities.ts                        activity validation and effect executor
src/engine/grunts.ts                            ASCII portrait, designation, grunt generation
src/engine/actions/calendar.ts                  calendar/consume_slot, activity/do, commander/injure
src/engine/actions/base.ts                      base/upgrade, base/recruit_grunt, base/requisition, roster/set_active, squad/set_flavor
src/llm/calls/activityVignette.ts               activity_vignette call type + sanitizer
src/llm/calls/flavor.ts                         flavor call type (grunt kind) + sanitizer
src/settings.ts                                 + activityFlavor, gruntFlavor, budget activity_vignette
src/ui/shell/status.ts                          PDA status header
src/ui/ops/opsTab.ts                            OPS tab (day planner)
src/ui/base/baseTab.ts                          BASE tab (schematic, upgrades, roster, recruit)
src/ui/squad/squadTab.ts                        grunt rendering (ASCII portrait, designation, bio)
src/app.ts                                      wiring: tabs, activity flow, vignette, grunt flavor, autosave
docs/CONTENT.md, docs/00-overview.md, docs/packages/P0-foundation.md, docs/MANUAL_TEST_P2.md
tests/**                                        mirrors src
```

## Review Focus

1. **A rejected action must not change anything** (not enough credits, wrong slot, injured commander, missing companion, unknown unit, capacity full) → state is returned untouched with an `error` event, slot not consumed. Tests per rule in Task 4/5.
2. **Day-end runs exactly once per day** even when an expedition (3 slots) or a scene crosses the end of Evening, and not again when a Night slot ends. Test in Task 3.
3. **Upkeep never makes a resource negative and shortage penalties are exact** (spread sums to the total, 3-day streak fires once per 3rd day, streak resets after a fed day). Tests in Task 3.
4. **Deterministic grunts**: same campaign state → same grunt; recruiting advances the campaign rng; ids never collide. Tests in Task 6.
5. **Old saves**: a P1-era state (no new fields) runs a full day and a week without crashing. Test in Task 3.

---

### Task 1: State fields, social stats, relation-gain interface

**Files:**
- Create: `src/engine/tuning.ts`, `src/engine/social.ts`, `src/engine/relationGain.ts`
- Modify: `src/engine/state/types.ts`
- Test: `tests/engine/social.test.ts`, `tests/engine/relationGain.test.ts`

**Interfaces:**
- Produces in `types.ts` (all optional): `Commander.socialPoints?: { authority; insight; empathy; cunning }`, `Commander.injuredUntilDay?: number`, `Unit.designation?: string`, `Unit.bio?: string`, `Unit.injuryDays?: number`, `DefectInstance.lite?: boolean`, `DefectInstance.upkeepDay?: number`, `CampaignState.base.upgrades?: Array<{ facilityId: string; toLevel: number; daysLeft: number }>`, `CampaignState.calendar.shortageStreak?: number`, `CampaignState.calendar.nightEvent?: unknown`.
- Produces in `social.ts`: `SOCIAL_STATS`, `SOCIAL_THRESHOLDS = [0, 10, 25, 45, 70]`, `type SocialStat`, `rankForPoints(points)`, `socialRank(state, stat)`, `addSocialPoints(commander, stat, amount) → { rank, gained, rankedUp }`, `meetsSocialRequirements(state, requires: Partial<Record<SocialStat, number>>): boolean`.
- Produces in `relationGain.ts`: `type RelationAxis = 'trust' | 'affinity' | 'attraction'`; `type RelationGainHandler = (relation: Relation, axis, amount, source: string) => number` (mutates the relation, returns the applied delta); `applyRelationDelta(draft, unitId, axis, amount, source) → number`; `setRelationGainHandler(fn)`; `resetRelationGainHandler()`; the default handler: gains diminish per axis per day by `relation.dailyGain` (full value below `TUNING.gain.soft`, half between soft and hard, zero from hard), losses apply in full; trust/attraction clamp 0–100, affinity −100…100; `dailyGain[axis]` grows by the applied positive delta.
- Produces in `tuning.ts`: `TUNING` (frozen) with `upkeep { perUnit: 1, commander: 1, doubledByDefect: 'hunger_loop' }`, `shortage { stressPerPoint: 4, affinityPerPoint: 1, streakDays: 3, trustPenalty: 5 }`, `gain { soft: 4, hard: 8 }`, `passiveStressRecovery: 1`, `commanderInjuryBlocks: ['train','work']` is **not** here (it is activity data), `recruit { credits: 40, baseTrust: 25 }`, `requisition { creditsPerSupply: 8 }`, `rosterActiveMax: 4`, `rosterBaseCapacity: 6`.

- [x] **Step 1: Write the failing tests**

social: `rankForPoints follows the thresholds` (0→1, 9→1, 10→2, 24→2, 25→3, 45→4, 70→5, 999→5); `addSocialPoints raises the rank and reports it`; `a start rank counts as its threshold` (commander `socialStats.authority = 2`, no points → adding 15 gives 25 points → rank 3); `points stop at the top rank`; `meetsSocialRequirements checks every stat` (`{empathy: 3}` false at rank 2, true at 3; `{}` true).
relationGain: `first points are full value`; `points past the soft cap count half`; `nothing past the hard cap`; `losses are applied in full and clamp at the floor`; `affinity may go negative, trust may not`; `dailyGain tracks applied gains`; `a replaced handler is used and reset restores the default`; `unknown unit is a no-op returning 0`.

- [x] **Step 2: Run** `npx vitest run tests/engine/social.test.ts tests/engine/relationGain.test.ts` → FAIL (modules missing).
- [x] **Step 3: Implement** the types, `tuning.ts`, `social.ts`, `relationGain.ts` exactly as above (point-by-point factor for the default handler: `1` below soft, `0.5` below hard, else `0`; applied = `Math.round(sum)`).
- [x] **Step 4: Run** the two files → PASS; `npm run typecheck` → clean.
- [x] **Step 5: Commit** `feat(engine): social stat points, relation gain handler and P2 state fields`.

### Task 2: Activities and facilities content

**Files:**
- Create: `content/core/activities.json`, `content/core/facilities.json`
- Modify: `content/core/manifest.json`, `content/core/starts.json`, `src/content/schemas.ts`, `src/content/refs.ts`, `docs/CONTENT.md`
- Test: `tests/content/core.test.ts` (extend), `tests/content/schemas.test.ts` (extend)

**Interfaces:**
- Produces in `schemas.ts`:
  - `ActivityEffectSchema` — discriminated on `type`: `resource {resource, amount, perStat?: {stat, per}}`, `commander_stat {stat, amount}`, `unit_xp {target: 'selected'|'companion', amount}`, `unit_stress {target: 'selected'|'companion'|'roster', amount}`, `injury_days {target: 'selected'|'companion', amount}` (negative = recovery), `commander_injury_days {amount}`, `defect_upkeep {target: 'selected'|'companion'}`, `relation {axis, amount}` (companion only), `emit_event {event: string}`. Every effect may carry `when?: { focus?: string; companionLikes?: string }` and `scale?: { facility: string; key: string }` (amount × (1 + facility value / 100), rounded away from zero).
  - `ActivitySchema`: `{ id, name, summary, slotRules: Slot[] (≥1), facilityReq?: {id, level}, cost: {credits?, supplies?, plyx?}, companion: 'none'|'optional'|'required', focus?: Array<{id, label, units?: {min, max}}>, effects, companionEffects, flavor: 'none'|'short', startsScene?: boolean, blockedWhenCommanderInjured?: boolean }`. `companion: 'none'` forbids `companionEffects`; `required` needs them; a `when.focus` must name a declared focus.
  - `FacilitySchema`: `{ id, name, summary, maxLevel (1–5), levels: Array<{ effects: Record<string, number>; upgrade?: { credits, plyx, days } }> }` — `levels[0]` is level 1 (no `upgrade`), every later level has one; `levels.length === maxLevel`; every level lists the same effect keys.
  - `StartSchema` gains optional `startingResources: { credits?, supplies?, plyx? }` (non-negative ints).
- Produces in `refs.ts`: `activities.facilityReq.id → facilities` (with level ≤ maxLevel check), `activity effect scale.facility → facilities`.
- Content: activities `train, workshop, medbay, work, scout_net, rest, mess, study, talk` and facilities `barracks (5), workshop (5), medbay (5), mess_hall (3), comms (3)` as in the spec tables. Facility effect keys: barracks `rosterCapacity` 6…10 and `restPct`; workshop `rarityCap` 1…5 and `upgradeDiscountPct`; medbay `stressReliefPct`, `injurySpeed`, `arcStageCap`; mess_hall `upkeepReduction`, `mealPct`; comms `rumorsPerDay`, `missionBoardSize`, `dmFeatures`. All numbers are draft balance values.

- [x] **Step 1: Write the failing tests** — core: `core pack has the nine v1 activities and five facilities`; `every activity facilityReq exists`; `facility levels are complete` (levels.length = maxLevel, upgrade only from level 2, same keys per level, barracks rosterCapacity is 6 at level 1 and 10 at level 5); `talk requires a companion and starts a scene`; `train and work are blocked while the commander is injured`; `starts declare starting resources`. schemas: `activity with companion none and companionEffects is rejected`; `required companion without companionEffects is rejected`; `when.focus must be a declared focus`; `unknown effect type is rejected`; `scale pointing at an unknown facility is a load error`; `facility with a missing level is rejected`.
- [x] **Step 2: Run** `npx vitest run tests/content` → FAIL.
- [x] **Step 3: Implement** schemas, refs, JSON and manifest; document both registries and `startingResources` in `docs/CONTENT.md`.
- [x] **Step 4: Run** `npx vitest run tests/content` → PASS (loading `content/core` reports no errors).
- [x] **Step 5: Commit** `feat(content): activities and facilities registries, starting resources`.

### Task 3: Economy, calendar and the day-end pipeline

**Files:**
- Create: `src/engine/economy.ts`, `src/engine/calendar.ts`, `src/engine/actions/calendar.ts` (only `calendar/consume_slot` in this task)
- Modify: `src/engine/setup.ts` (apply `start.startingResources`)
- Test: `tests/engine/economy.test.ts`, `tests/engine/calendar.test.ts`, `tests/engine/setup.test.ts` (extend)

**Interfaces:**
- Produces in `economy.ts`: `facilityLevel(state, id)` (absent → 1), `facilityEffect(state, reg, id, key): number` (value at the current level; unknown → 0), `rosterCapacityFor(reg, level)`, `upkeepNeeded(state, reg): { units: number; needed: number }` (active-roster units that are not dead/deserted/terminated × 1, ×2 for units with the `hunger_loop` defect, + 1 commander, − mess_hall `upkeepReduction`, never below 0), `spread(total, n, offset): number[]` (sums exactly to `total`, remainder starts at `offset % n`), `runUpkeep(draft, reg): EngineEvent[]` (pays what exists; shortage → stress and Affinity spread over the active-roster units, streak +1; a fed day resets the streak; streak reaching a multiple of `streakDays` → trust penalty to every active-roster unit and a `trust_penalty_event`).
- Produces in `calendar.ts`: `SLOT_ORDER`, `slotsLeftToday(slot)` (morning 3, afternoon 2, evening 1, night 1), `DAY_END_STEPS = ['upkeep','ticks','facility_timers','mission_deadlines','director_tick','dm_rumors','night_check','autosave']`, `registerDayEndStep(id, fn)` (only the three hook steps `mission_deadlines`, `director_tick`, `dm_rumors` may be replaced; default no-op), `consumeSlots(draft, count, reg, rng): EngineEvent[]`, `clockText(day, slot)` → `DAY 012 // EVENING`.
- Day-end behaviour: consuming Evening runs steps 1–6 in order (each preceded by a `day_end_step { step }` event), then `night_check`: non-empty `nightEventsQueue` → the head is moved to `calendar.nightEvent`, slot `night`, day unchanged; otherwise rollover (day +1, slot morning, `dailyGain` of every relation zeroed, `nightEvent` cleared). Ending Night rolls over without running the pipeline. `autosave` emits `{ type: 'autosave' }` last. `ticks`: units with `injuryDays` lose 1 + medbay `injurySpeed` and recover at ≤ 0 (`status: 'active'`, `injuries: []`, `unit_recovered`); every unit's stress drops by `passiveStressRecovery` (floor 0). `facility_timers`: each pending upgrade loses a day; at 0 the facility reaches `toLevel` (`facility_upgraded`) and a barracks upgrade sets `roster.capacity`.
- Produces in `actions/calendar.ts`: `calendar/consume_slot` `{ slots?: 1|2|3, reason: string }`; rejects `slots` above `slotsLeftToday` and unknown reasons are accepted (free text for the log).

- [x] **Step 1: Write the failing tests**

economy: `upkeep counts active roster plus commander`; `hunger_loop unit eats double`; `mess hall reduces upkeep, never below zero`; `dead and deserted units do not eat`; `full upkeep pays in full and resets the streak`; `shortage takes all supplies and spreads stress and affinity exactly` (needed 7, have 4 → shortage 3 → stress 12, affinity −3 across 4 units: the spread sums to 12/−3); `spread gives the remainder to the rotating start`; `third shortage day applies the trust penalty once, sixth again`; `a fed day resets the streak`; `supplies never go negative`.
calendar: `morning to afternoon to evening`; `evening without a night queue runs the pipeline and rolls to the next morning`; `pipeline steps run in the documented order` (collect `day_end_step` events); `non-empty night queue gives a night slot, day unchanged, head moved to nightEvent`; `ending night rolls over without a second pipeline`; `a 3-slot expedition from morning runs the pipeline once`; `slots above what is left today are rejected and change nothing`; `rollover zeroes dailyGain`; `facility timer completes on the right day and raises roster capacity`; `injured unit recovers after its days, faster with a medbay`; `passive stress recovery floors at 0`; `registered hook steps run in order`; `a P1-era state runs seven days without crashing` (campaign built by `buildCampaign`, no new fields); `clockText pads the day to three digits`. setup: `start startingResources are applied before effects`.

- [x] **Step 2: Run** `npx vitest run tests/engine/economy.test.ts tests/engine/calendar.test.ts tests/engine/setup.test.ts` → FAIL.
- [x] **Step 3: Implement.** Add `startingResources` handling to `buildCampaign`; set `roster.capacity` only from barracks upgrades, never lowering it below the current squad size.
- [x] **Step 4: Run** the three files → PASS; `npm run typecheck` clean.
- [x] **Step 5: Commit** `feat(engine): calendar slots, day-end pipeline, upkeep and facility timers`.

### Task 4: Activities

**Files:**
- Create: `src/engine/activities.ts`
- Modify: `src/engine/actions/calendar.ts` (add `activity/do`, `commander/injure`)
- Test: `tests/engine/activities.test.ts`

**Interfaces:**
- Consumes: Task 1 (`addSocialPoints`, `applyRelationDelta`), Task 2 (registry shapes), Task 3 (`consumeSlots`, `facilityEffect`).
- Produces in `activities.ts`: `checkActivity(state, reg, req): string | null` (the rejection reason, used by the UI to grey buttons) and `runActivity(draft, reg, req): EngineEvent[]` where `req = { activityId, companionId?, unitIds?, focus? }`.
- Rules: slot ∈ `slotRules`; `facilityReq` met; cost payable; `companion: 'none'` rejects a companion, `'required'` needs one; companion must exist, not be dead/deserted/terminated; `blockedWhenCommanderInjured` rejects while `day < commander.injuredUntilDay`; without a companion the focus defaults to the first declared one and its `units` bounds apply to `unitIds` (all must exist and be alive; duplicates rejected); with a companion `companionEffects` run **instead of** `effects` and `focus`/`unitIds` are ignored. Costs are paid first, effects run in file order (`when` filters: `focus`; `companionLikes` matches the companion's `likes`), amounts are scaled by `scale`, `resource.perStat` adds `per × rank`. `startsScene` activities emit `scene_requested { unitId, origin: 'activity' }` and **do not** consume the slot; all others consume exactly one slot after their effects. Emitted events: `activity_done { activityId, companionId?, vignette: boolean }` (`vignette` = companion present and `flavor === 'short'`), plus one event per effect worth reporting (`xp_gained`, `stress_changed`, `social_gained`, `resource_changed`, `relation_changed`, `emit_event`'s own event type).
- XP only adds to `unit.xp` (levelling belongs to P4). `defect_upkeep` sets `upkeepDay = day` on the target's defects whose `arc === 'manage'`. `commander/injure { days }` sets `injuredUntilDay = day + days` and emits `commander_injured` (P3 hook).

- [x] **Step 1: Write the failing tests** — one per activity effect from the spec table: `train alone: selected units gain xp`; `train alone, commander focus: authority points`; `train with companion: commander authority, companion xp and a small affinity`; `workshop emits a workshop_session, affinity only if she likes tech`; `medbay alone: stress down scaled by medbay level, injury days reduced, manage-arc defect upkeep stamped`; `medbay with companion: stronger relief and trust`; `medbay commander focus shortens commander injury`; `work: credits scale with cunning rank`; `scout_net: insight points and a rumors_requested event`; `rest alone relieves the active roster, with companion relieves her and adds affinity`; `mess: costs supplies, relieves the roster, offers a group scene`; `study: insight or empathy by focus`; `talk: requires companion, emits scene_requested and does not consume the slot`. Rejections (each leaves the state identical and returns an error event): `wrong slot`, `not enough credits`, `injured commander blocks train and work`, `companion required but missing`, `companion given to a no-companion activity`, `dead companion`, `unknown unit in unitIds`, `focus units bound violated`, `unknown activity`. Plus: `affinity gains go through the relation handler` (install a spy handler), `each activity consumes exactly one slot`, `a full week of activities only changes resources, stress and stats per the tables` (Mon–Sun script with rest/work/train, checks supplies, credits and stress totals).
- [x] **Step 2: Run** `npx vitest run tests/engine/activities.test.ts` → FAIL.
- [x] **Step 3: Implement** executor and actions.
- [x] **Step 4: Run** the file → PASS; `npx vitest run` → whole suite green.
- [x] **Step 5: Commit** `feat(engine): activity/do with data-driven effects and commander injury`.

### Task 5: Base actions and roster

**Files:**
- Create: `src/engine/actions/base.ts` (`base/upgrade`, `base/requisition`, `roster/set_active`)
- Test: `tests/engine/base.test.ts`

**Interfaces:**
- `base/upgrade { facilityId }`: rejects unknown facility, a facility already at max level, a facility that already has a pending upgrade, lacking credits/plyx; pays `credits + plyx` (workshop discount does not apply to facility upgrades), pushes `{ facilityId, toLevel: level + 1, daysLeft: days }` onto `base.upgrades`, emits `upgrade_started`.
- `base/requisition { supplies }`: positive integer, costs `supplies × creditsPerSupply` credits, emits `resource_changed`.
- `roster/set_active { activeIds }`: at most `rosterActiveMax`, no duplicates, every id a living squad unit, order kept; units not listed get `status: 'reserve'` unless injured, listed `reserve` units become `active`.

- [x] **Step 1: Write the failing tests** — `upgrade pays, starts a timer and does not raise the level yet`; `timer runs across days and capacity grows at barracks 2` (consume slots through two day-ends: capacity 6 → 7); `upgrade rejected: max level`, `…: pending upgrade`, `…: not enough plyx`, `…: unknown facility` (state unchanged); `two different facilities can upgrade at once`; `requisition converts credits to supplies`; `requisition rejects fractions, zero and too little credit`; `roster accepts four, rejects five`; `roster rejects duplicates and dead units`; `roster statuses follow the list`.
- [x] **Step 2: Run** `npx vitest run tests/engine/base.test.ts` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** the file → PASS; whole suite green.
- [x] **Step 5: Commit** `feat(engine): facility upgrades, supply requisition and roster actions`.

### Task 6: Grunts

**Files:**
- Create: `src/engine/grunts.ts`
- Modify: `src/engine/setup.ts` (export the shared `initialRelation` / `startingTrustFor` helpers and use them in `buildCampaign`), `src/engine/actions/base.ts` (`base/recruit_grunt`, `squad/set_flavor`)
- Test: `tests/engine/grunts.test.ts`, `tests/engine/setup.test.ts` (extend: refactor keeps behaviour)

**Interfaces:**
- Produces in `grunts.ts`: `generatePortrait(rng): string` (7 lines × 13 columns: ASCII frame plus a face from glyph tables for hair/visor, eyes, nose, mouth, one optional mark), `generateDesignation(rng, taken: Set<string>): string` (`K-117` style: letter A–Z + 3 digits 100–999, retried until free), `generateGrunt(state, reg, rng): Unit` (pure; picks role uniformly, level = `max(1, round(average level of living squad units) − 1)`, base stats from the role, `hp` full, one **lite** defect drawn from `defects` (`desire_bond` excluded unless `state.settings.desireBondDefects`), `lite: true`, no arc, a signature drawn from `signatures`, values all 0, empty tags, `kind: 'grunt'`, `designation`, `displayName = designation`, `asciiPortrait`, `status: 'active'` if the active roster has room else `'reserve'`), `gruntRelation(state, reg): Relation` (trust `recruit.baseTrust` + the crime's unconditional `starting_trust` effects + `grunt_starting_trust` bonus (`recruit.gruntCrimeBonus`), clamped; affinity/attraction 0; `knows_crime` by the same rule as setup).
- `base/recruit_grunt {}`: rejects when living squad ≥ `roster.capacity` or credits < `recruit.credits`; pays, generates with the campaign rng, appends the unit, creates its relation, adds it to `roster.activeIds` while fewer than 4 are active, emits `grunt_recruited { unitId }`.
- `squad/set_flavor { unitId, name, bio }`: grunts only; `name` 1–24 chars of letters, digits, space, `'` and `-`; `bio` ≤ 120 chars; sets `displayName = name`, `bio`; keeps `designation`.

- [ ] **Step 1: Write the failing tests** — `same state gives the same grunt` (two runs from one snapshot are deep-equal); `recruiting advances the campaign rng, so the next grunt differs`; `portrait is 7 lines of equal width and ASCII only`; `different seeds give different portraits (over 50 seeds at least 10 distinct)`; `designation matches X-### and avoids taken ones`; `level is squad average minus one, never below 1`; `empty squad gives level 1`; `lite defect has no arc and desire_bond is excluded by default`; `desire_bond allowed when the campaign setting is on`; `grunt trust follows the crime (purge adds, experimentation subtracts)`; `recruit pays credits, adds relation and roster entry`; `fifth active grunt goes to reserve`; `recruit rejected at capacity / without credits` (state unchanged); `ids never collide even for equal designations after a death`; `set_flavor renames, keeps designation, rejects named units and bad names`. setup: existing P1 tests stay green after the helper extraction.
- [ ] **Step 2: Run** `npx vitest run tests/engine/grunts.test.ts tests/engine/setup.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; whole suite green.
- [ ] **Step 5: Commit** `feat(engine): seeded grunt recruitment with ASCII portraits`.

### Task 7: LLM extras and settings

**Files:**
- Create: `src/llm/calls/activityVignette.ts`, `src/llm/calls/flavor.ts`
- Modify: `src/llm/callTypes.ts` (id `activity_vignette`), `src/settings.ts`, `src/ui/shell/sysTab.ts`, `docs/00-overview.md` (§5.2 table row), `docs/packages/P0-foundation.md`
- Test: `tests/llm/activityVignette.test.ts`, `tests/llm/flavor.test.ts`, `tests/settings.test.ts` (extend), `tests/ui/shell.test.ts` (SYS fields if it lists them)

**Interfaces:**
- `settings`: `activityFlavor: boolean` (default `true`), `gruntFlavor: boolean` (default `true`), budget `activity_vignette: 150`.
- `activity_vignette`: profile `main`, text. Input `{ activityName, commanderName, unitName, unitRole, likes, defectNames }`. `sanitizeVignette(text): string | null` — strips quotes/markdown/stage labels, keeps at most 2 non-empty lines and 240 characters, empty → `null`. `generateVignette(input, deps)` returns the string or `null` (fail-soft, never throws).
- `flavor` (registered once here, generic): input `{ kind: 'grunt', designation, roleName, defectName }`; JSON `{ name, bio }`; `sanitizeGruntFlavor` applies the `squad/set_flavor` limits and returns `null` when the name is unusable. Other packages add their kinds through `registerFlavorKind(kind, { system, prompt })`.

- [ ] **Step 1: Write the failing tests** — vignette: `keeps two lines`, `drops a third line`, `strips quotes and a speaker label`, `truncates at 240 characters`, `empty answer is null`, `generateVignette returns null on a failed call and never throws`, `the prompt names activity, unit and commander but contains no numbers from state`. flavor: `valid JSON gives name and bio`, `overlong bio is cut at 120`, `name with markup is rejected`, `invalid JSON after both attempts is null`, `unknown kind is refused`. settings: `new P2 settings default to true, true`, `activity_vignette budget defaults to 150 and is clamped like the others`.
- [ ] **Step 2: Run** `npx vitest run tests/llm tests/settings.test.ts tests/ui/shell.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; whole suite green.
- [ ] **Step 5: Commit** `feat(llm): activity vignette and grunt flavor calls, P2 settings`.

### Task 8: UI and app wiring

**Files:**
- Create: `src/ui/shell/status.ts`, `src/ui/ops/opsTab.ts`, `src/ui/base/baseTab.ts`, `css/50-ops-base.css`
- Modify: `src/ui/shell/shell.ts` (status header, re-rendered on `refresh()`), `src/ui/squad/squadTab.ts` (grunt unit block, `renderOpsPlaceholder` removed), `src/app.ts`, `src/index.ts` only if needed
- Test: `tests/ui/status.test.ts`, `tests/ui/ops.test.ts`, `tests/ui/base.test.ts`, `tests/ui/squad.test.ts` (extend), `tests/app-day.test.ts`, `tests/app.test.ts` / `tests/app-resync.test.ts` (adjust the scripted shell)

**Interfaces:**
- `status.ts`: `renderStatusHeader(host, state)`: `DAY 012 // EVENING`, `CR 120 · SUP 8 · PLYX 3`, `LEASH 2` (authorizations left), and `INJURED n d` when the commander is injured; no campaign → `NO CAMPAIGN`.
- `opsTab.ts`: `renderOpsTab(host, ctx)` — lists every activity with its state from `checkActivity` (disabled with the reason as text/title), a companion `<select>` (living named + grunt units, shown only when `companion !== 'none'`), a focus `<select>` and unit checkboxes where the activity declares them, and `[ DO ]`. Also a `[ REQUISITION SUPPLIES ]` control. `ctx.onDo(req)` is called on click. Night slot shows only activities whose `slotRules` include it.
- `baseTab.ts`: `renderBaseTab(host, ctx)` — ASCII schematic (a box per facility with `L2/5`, pending-upgrade marker `▲ 2d`), a facility list with next-level cost/days and `[ UPGRADE ]`, ROSTER block (`UNITS 5/6`, per-unit `[ACTIVE]/[RESERVE]` toggle respecting the 4 limit), `[ RECRUIT GRUNT (40 CR) ]` disabled with the reason when capacity/credits fail, and the base location ids of the lore §8 list as plain text.
- `app.ts`: registers tabs `ops` and `base`; `performActivity(req)` dispatches `activity/do`, toasts the error or a one-line result, then — if the event says `vignette` and `activityFlavor` is on — calls `generateVignette` with `{ expectChatId }` guarding and shows the result in a toast-panel (info toast, up to 2 lines); after `base/recruit_grunt`, with `gruntFlavor` on, calls the flavor call and dispatches `squad/set_flavor` (dropped if the chat changed). `dispatch` flushes the saver when the events contain `autosave`. Day-end events show one toast each for `supply_shortage` (warn), `trust_penalty_event` (warn), `facility_upgraded` (info), `unit_recovered` (info).
- `squadTab`: a grunt shows its ASCII portrait in `<pre class="alius-ascii">`, designation, bio, level/role/stats and its lite defect text; no re-sync button, no signature section.

- [ ] **Step 1: Write the failing tests** — status: `shows day, slot and resources`, `shows leash authorizations`, `shows injury`, `no campaign`, `header updates on shell.refresh()` (jsdom shell). ops: `lists the nine activities`, `disabled activity shows its reason`, `night shows only rest and talk`, `companion select appears only for optional/required`, `DO sends the right request` (activity, companion, focus, unit ids), `talk without a companion stays disabled`. base: `schematic shows every facility with its level`, `pending upgrade marker`, `upgrade button disabled without credits`, `roster toggle refuses a fifth active unit`, `recruit disabled at capacity`, `recruit click dispatches`. squad: `grunt block shows portrait, designation, bio and no signature`. app-day: `performActivity consumes a slot and refreshes the shell`, `a vignette appears after a companion activity with flavor short`, `no vignette when activityFlavor is off`, `a failed vignette call changes nothing and shows nothing`, `a vignette that arrives after a chat switch is dropped`, `recruit then flavor renames the grunt`, `chat switch drops the late grunt flavor`, `autosave event flushes the saver`, `shortage shows a warn toast`.
- [ ] **Step 2: Run** `npx vitest run tests/ui tests/app-day.test.ts tests/app.test.ts tests/app-resync.test.ts` → FAIL.
- [ ] **Step 3: Implement** UI and wiring; keep every rendering function pure over `(host, ctx)` like the SQUAD tab.
- [ ] **Step 4: Run** → PASS; whole suite green; `npm run typecheck` clean.
- [ ] **Step 5: Commit** `feat(ui): status header, OPS day planner and BASE tab`.

### Task 9: Build, docs, acceptance

**Files:**
- Modify: `dist/index.js`, `style.css` (via `npm run build`), `docs/README.md` if it lists plans, `docs/packages/P2-calendar-base-economy.md` (a "Implemented as" note for the rulings: points vs ranks, requisition, `startingResources`, night event hand-off, grunt signature, call type)
- Create: `docs/MANUAL_TEST_P2.md`
- Test: `tests/build.test.ts` (existing)

- [ ] **Step 1:** `npm run build` → writes `dist/index.js` and `style.css`; `git status` shows both changed (they stay tracked).
- [ ] **Step 2:** Walk the six acceptance criteria of the spec against the tests (week simulated, shortage penalties, upgrade timers, deterministic grunts + portraits, social checks queryable, per-effect unit tests) and note the test names in `docs/MANUAL_TEST_P2.md` next to the in-SillyTavern steps that cannot be automated (header, OPS, BASE, vignette, grunt flavor).
- [ ] **Step 3:** `npx vitest run` and `npm run typecheck` → all green; paste the counts into the final report.
- [ ] **Step 4: Commit** `chore: rebuild dist and style, P2 manual checklist and notes`.
