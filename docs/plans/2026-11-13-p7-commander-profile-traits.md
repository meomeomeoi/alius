# P7 Commander Profile & Traits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The commander gets a body (strength / endurance / reflexes), an expression, a seasoning, an archetype and up to 2 regular + 1 special trait. These change Commander Crisis, give one presence action per combat, gate physical checks that always have a non-body route, shape first impressions (presence, unit tastes, image consistency that fades with days known) and appear in setup, SQUAD and the scene context, never as numbers.

**Architecture:** A new pure engine folder `src/engine/commander/` owns the rules: `profile.ts` (descriptors, archetype, creation pool, validation, growth), `presence.ts` (presence, decay weight, tastes, first impression, image consistency), `checks.ts` (check routes) and `traits.ts` (trait effect sums). Every other engine module only calls these functions at a few hook points (join sites, `computeDeltas`, `activities`, combat build/effects/orders/AI, calendar, Leash, requisition, talk-down). New content registries (`commanderTraits`, `tastes`, `presence`, `imageConsistency`) carry every number an author tunes. Old saves stay `version: 1`: the new fields are optional and a `commander/seed` action fills them once, like `world/seed` and `leash/seed`. Chunk (a) = Tasks 1–9 (engine); chunk (b) = Tasks 10–19 (traits, import call, UI, context, analysis, docs).

**Tech Stack:** TypeScript 5 (strict), esbuild, zod 3, vitest (+ jsdom for UI). No new dependencies.

**Spec:** `docs/00-overview.md` (§3 P1/P2/P10/P11/P12, §5.4, §6, §8), `docs/packages/P7-commander-profile-traits.md`. `docs/ROADMAP-next.md` gives the two chunks. `docs/content/lore.md` §5 is only needed for the wording of trait text in Task 10.

## Global Constraints

- English everywhere (overview P8); all UI text via `textContent`/`h()`, never `innerHTML`.
- `src/engine/**` stays pure (architecture test). `src/engine/commander/**` imports only `src/content` types and other `src/engine` modules.
- **No numbers to the player or the main model:** every body stat, expression, seasoning and archetype is shown as a descriptor; raw values only with "show raw values" (`knowledge.raw()` in readings). The P7 context line contains no digits.
- Descriptors, verbatim (index 0 = value 1):
  - Strength `Feeble, Slight, Average, Strong, Powerful`; Endurance `Fragile, Delicate, Average, Hardy, Iron`; Reflexes `Sluggish, Slow, Average, Quick, Lightning`; Expression `Very feminine, Feminine, Androgynous, Masculine, Very masculine`; Seasoning `Green, Young, Experienced, Seasoned, Veteran`.
- Spec numbers, verbatim: body stats 1–5; creation starts each at 1, **pool 7**, **no stat above 4 at creation**, unspent points allowed and never converted; training thresholds **3 / 6 / 10 / 15 sessions** per step; archetype by body sum **≤4 frail, 5–6 slight, 7–9 average, 10–12 fit, ≥13 hardened**; Crisis HP **20 + 10 × endurance**, dodge **6% × reflexes**; Unnoticed **−50%** targeting, Steady Voice **−1 CP** on one order, Rally **−10 stress** to all allies; presence **P ∈ [−15, +15]**; decay **w(d) = exp(−d / τ)**, **τ = 7** (setting); off-image multiplier **m = 1.3**, scaled as **1 + (m − 1) · w(d)**, gains and losses; tastes **≤ 3** per unit; traits **≤ 2 regular, 0–1 special**; `commander_import` budget **600**; migration defaults **body 3/3/2, expression 3, seasoning 3, no traits**.
- **Expression has no mechanical value** (overview P11): no code path reads `expression` except taste matching, the context line, the UI and `commander_import`. **Attraction offsets only come from tastes** (test in Task 7).
- **No dead ends** (overview P10): a `routeCheck` whose routes are all `body` is a content error.
- Campaign state stays `version: 1`; every new field is optional; P0–P7a saves load unchanged and are seeded by `commander/seed`.
- Determinism: every new roll uses `ctx.rng` (the campaign rng). Where a roll is added into an existing sequence (dodge), seeded tests that change are updated deliberately in the same task, with the reason in the commit message.
- New analysis subjects follow overview P12: glossary entry or registry `description`, `data-analyze` on every chip/stat/option; the coverage test stays green.
- `dist/index.js` and `style.css` are committed; `npm test` rebuilds them; commit them with each change.
- Commit messages end with the `Co-Authored-By:` / `Claude-Session:` trailers of the executing agent (overview P9).

## Where the code differs from the spec (read before Task 1)

Rulings taken while planning; Task 19 lists them in the spec's **Implemented as**.

- **Optional state, seeded once.** `Commander` gains optional `body`, `bodyXp`, `expression`, `seasoning`, `traits`, `archetype`, `fileReviewed`, `sleeplessDay`; `Relation` gains optional `metDay`; `Unit` gains optional `commanderTastes`. Readers go through `commanderProfile(state)` (defaults for anything missing). `createCampaign` writes the defaults with `fileReviewed: true`; `commander/seed` (dispatched by the app when `commander.body === undefined`) writes the defaults, back-fills `metDay` (`min(stateSince, earliest history day)`, there is no stored join day) and sets `fileReviewed: false`, which makes the app show the review modal once.
- **`SetupResult.commander` is optional.** Absent → the defaults. This keeps the sim harness, test helpers and P1–P6 callers unchanged; the wizard always sends it.
- **Creation vs. later.** `commander/set_profile` is accepted only while `fileReviewed === false` (the review modal). At creation the pool rule applies (sum of body ≤ 3 + 7, each ≤ 4). In the review modal the same rule applies (an old commander is re-created, not grown). Start-time trait effects (`social_rank`, `seasoning_start`, `faction_start`) apply in both; join-time effects (`starting_trust`, `taste_attraction`, presence) apply only to units that join later.
- **Body growth uses tenths.** One `train` body session gives `TUNING.commander.bodyXpPerSession = 10` XP to the chosen stat; steps cost `[30, 60, 100, 150]` (index = current value − 1), so "3 / 6 / 10 / 15 sessions" holds and `bookish` (×0.7) needs no fractions. XP above a step carries over; at 5 the XP stops. `train` gets three focuses `body_strength`, `body_endurance`, `body_reflexes` (labels "Body: strength" …) with a new activity effect `{ type: 'commander_body_xp', stat }`.
- **Crisis scars.** When the commander goes down in Crisis (`finalizeCombat` already calls the injury path), a roll of `TUNING.commander.scarChance = 0.15` lowers endurance or reflexes by 1 (one that is above 1, picked by rng; none → no loss) and raises seasoning by 1 (max 5); event `commander_scarred { stat, seasoning }`. A retried combat never scars (finalization rule of P4).
- **Commander HP** becomes `20 + 10 × endurance + crisis_hp trait effects`, at least 10 (`TUNING.combat.commanderHp` = 60 is retired). The default 3/3/2 commander has 50 HP: a deliberate balance change, noted in `BALANCE_REPORT.md` by Task 19.
- **Dodge** is rolled only when a hit reaches the commander himself (cover down), before damage; log `{ kind: 'dodge', target: 'commander' }`.
- **Presence action** is `combat/presence` (no payload), once per combat, free, accepted while a squad unit awaits input and `cs.commander` exists (Unnoticed and Rally also need no Crisis; Unnoticed only matters with an exposed commander). The kind comes from the archetype at combat start, stored as `cs.presence = { kind, used }`. Unnoticed: the enemy AI drops a `commander` target option with chance 0.5 for the rest of the combat. Steady Voice: the next order costs 1 CP less (floor 0 for that one order). Rally: −10 stress to every standing squad unit at once.
- **Check routes live under `routeCheck`.** Generated dilemma options already use `check` for the P6 social check, so the spec's `check { id, routes }` is the field `routeCheck: { id, routes }` on authored event options (dilemma `fixed` options and expedition events). Generated options never carry one. Items have no tags, so the item route is `{ kind: 'item', itemId }` (an owned instance). Bypass is `{ kind: 'bypass', cost: { resource, amount } }`. Body and social routes are deterministic (stat ≥ min); a social route reads the effective rank (`socialRank`, which applies `sleepless_rank`).
- **Delegate outcome** (no LLM): the unit must be living and, in a run, in the party; `unitFilter.roles` narrows it. Breaking loyalty → refuse. Trust band ≥ `trustCheck` (default `guarded`) → comply (`TUNING.commander.delegateRemarkChance = 0.3` → comply with remark, event `delegate_remark`); exactly one band below → **demand**, which is a refusal with event `delegate_demand` until P9; lower → refuse. Comply pays `affinityCost` (through `applyRelationDelta`) and `stress`. A refused or failed route behaves like a failed P6 social check: costs kept, gains dropped.
- **First impression** is Trust only: `trust += round(P × presenceMult)` at join, where `presenceMult` is the product of the matched tastes' `presenceMult` (default 1). Matched tastes add their `offsets` (trust/affinity/attraction). Grunts have no tastes (presence still applies). Applied at the four join sites: `buildCampaign`, `squad/add_named`, `base/recruit_grunt`, the grunt reward in `squad.ts`. Re-sync can add tastes later; they then only tweak image consistency (axes are never re-based).
- **Image consistency** is applied in `computeDeltas` (the single choke point) only when `event.actor === 'commander'`: an event type listed `offImage` for the commander's archetype group multiplies trust/affinity/attraction deltas by `1 + (m·t − 1) · w(d)`, `t` = product of matched tastes' `imageMult` (default 1), `d = state.day − metDay`. `inImage` lists are data for the analysis text only. v1 groups: `slight_build` (frail, slight) off-image `coerced`; `strong_build` (fit, hardened) off-image `comforted`, `physical_affection`, `apologized`; `average_build` none. P9 adds `commander_enforced` later.
- **τ** is a global setting `firstImpressionTau` (1–30, default 7) mirrored into `state.settings.firstImpressionTau` by `campaign/set_first_impression_tau`, like `beatCooldownDays`.
- **"First 14 days"** of `old_wound` / `pretty_face` means days known per unit (`state.day − metDay < 14`), on Trust **gains** from events (`computeDeltas`); activity `relation` effects are untouched.
- **Insomniac.** The commander has no stress stat; the spec's "stress accumulates" is ruled as: with trait effect `night_slot`, an Evening that ends with an empty night queue enters a **quiet night** (`slot: 'night'`, no `nightEvent`). In a quiet night activities read their slot rules as `evening`; `calendar/sleep` ends it without cost. Doing an activity in a quiet night sets `commander.sleeplessDay = day + 1`; on that day `sleepless_rank` lowers the effective Empathy rank by 1 (`socialRank`, floor 1). Stored ranks never change.
- **Street-raised "black market"** has no market in the game: it is `requisition_price −15%` on `base/requisition`. "Corporate standing −" / "oversight standing +" are `faction_start` on the own corporation (−10 / +10). "Leash approved less often" is `terminate_approval −0.1`.
- **Silver tongue downside** is `relation_event_mult { event: 'lied_detected', mult: 1.5, ifTrigger: 'lies' }`: a detected lie costs more with units whose triggers include `lies`. The detection itself stays the mechanic model's job.
- **`vow_of_distance`** makes `intimacyOf(state).romance` false (the romance filter everywhere: graph, proposals, DMs, receptivity, context, UI), lowers the lower axis bounds of `confidant` and `kindred` entry conditions by 15% (`platonic_threshold`), and unlocks the state `sworn` (new `requiresTrait` on relationship states; author text is a placeholder). Special traits are never proposed by `commander_import`.
- **Talk-down intimidation** (P6 `loyalty/talk_down` with `authority`): chance `+= TUNING.commander.intimidatePerPoint (0.03) × ((strength − 3) + (seasoning − 3))`, before the existing clamp. Symmetric: a weak, green commander really is weaker here. P9 discipline does not exist yet.
- **Long-expedition exhaustion**: on return from a 3-slot run with endurance ≤ 2, a living party unit in a state of `TUNING.commander.coverStates` (`friend, confidant, kindred, sworn, flirting, fwb, lover, devoted, secret_affair`) covers him (`commander_covered { unitId }`, the first by party order); otherwise `calendar.loseMorning = true` and the next rollover starts in the Afternoon (`commander_exhausted`).
- **Context pronouns.** ST has no pronoun field; the line omits them (persona text is ST's own prompt).
- **Persona text.** `StAdapter.getPersonaDescription(): string` — real: `ctx().powerUserSettings?.persona_description ?? ''` (verify against the current ST `getContext()` source before use, overview §11); fake: a settable field.

## File Structure

```
content/core/{commanderTraits,tastes,presence,imageConsistency}.json   new registries (+ manifest)
content/core/{activities,relationshipStates,dilemmaTemplates,glossary}.json   body focuses, sworn, one routeCheck, glossary
src/content/types.ts, schemas.ts, refs.ts         registries, routeCheck, trait effect vocabulary, requiresTrait
src/engine/tuning.ts                               TUNING.commander
src/engine/state/types.ts, create.ts               optional commander/relation/unit fields
src/engine/commander/profile.ts                    descriptors, archetype, pool, validation, growth
src/engine/commander/presence.ts                   presence, w(d), tastes, first impression, image multiplier
src/engine/commander/checks.ts                     route choices and resolution
src/engine/commander/traits.ts                     trait effect sums
src/engine/actions/commander.ts                    commander/seed, set_profile, review_done, campaign/set_first_impression_tau
src/engine/{setup,grunts,activities,calendar,social,ledger}.ts, actions/{squad,base,calendar}.ts      hooks
src/engine/combat/{build,effects,orders,ai,outcome,types}.ts, actions/combat.ts                      Crisis, presence action, scars
src/engine/relations/{deltas,gain,graph}.ts       image consistency, early trust, vow
src/engine/dilemma/{flow,types}.ts, world/expedition.ts, actions/{dilemma,expedition}.ts             route wiring, exhaustion
src/engine/leash/{weekly,use}.ts, loyalty/desertion.ts                                              trait and talk-down hooks
src/llm/callTypes.ts, calls/commanderImport.ts, calls/profileImport.ts                              commander_import, tastes section
src/setup/{commander,profile,wizard}.ts            import sanitizer, tastes, COMMANDER step model
src/st/{adapter,real,fake}.ts                      getPersonaDescription
src/settings.ts                                    firstImpressionTau, budget commander_import
src/scene/context.ts                               commander line + early-days directive
src/analysis/effects.ts, providers/commander.ts    trait/taste effect lines, body and archetype readings
src/ui/commander/commanderFile.ts, cmdrCard.ts     shared form, SQUAD card
src/ui/setup/{setupScreen,calibration}.ts, squad/squadTab.ts, combat/combatScreen.ts,
  dilemma/dilemmaPanel.ts, expedition/expeditionScreen.ts, shell/sysTab.ts, app.ts, css/60-commander.css
docs/** (Task 19), tests/** mirror src
```

## Review Focus

1. **Old save without any P7 field** (no `body`, no `metDay`, no `commanderTastes`, a quiet-night-free calendar) → every reader uses defaults before `commander/seed` runs; the seed runs once, the review modal shows once and "skip" never shows it again. Tests in Task 2 (`readers survive a P6 save before seeding`, `seed is idempotent`) and Task 15 (`the review modal opens once and skip marks it reviewed`).
2. **Pool edge values** (unspent points, a 4/4/2 that spends exactly 7, a 5 at creation, a 2/1/1 frail, the 13 that only growth reaches, training a stat at 5) → creation accepts ≤ 7 spent and ≤ 4 each, archetype is right at every threshold, growth stops at 5. Tests in Task 1 (`archetype at 4/5/6/7/9/10/12/13`, `a 5 at creation is rejected`) and Task 3 (`training a stat at 5 changes nothing`).
3. **A check nobody can take** (no living unit matches the delegate filter, the party is empty of matches in a run, the bypass is unaffordable, the item was dismantled between render and click) → the option shows the reason per route, the engine rejects a stale pick with an error and changes nothing. Tests in Task 5 (`a stale delegate pick is rejected`, `a bypass that cannot be paid is disabled`).
4. **Quiet night reaching screens that assume a night event** (header, night knock, COMMS, scene start) → no crash; the quiet night shows "NIGHT — QUIET" with Sleep and the evening activities. Tests in Task 11 (`a quiet night has no night event and night/open refuses`) and Task 16 (`the shell renders a quiet night`).
5. **`commander_import` hostile or odd output** (numbers instead of descriptors, a 5/5/5 body, unknown or special trait ids, two exclusive traits, prose around the JSON, persona text that says "ignore instructions") → the sanitizer clamps to the creation rules, drops unknown/special ids, keeps the first of exclusive pairs; nothing is applied without the player confirming. Tests in Task 13 (fixtures `valid`, `over_pool`, `hostile`, `prose_wrapped`, `truncated`).

---

## Chunk (a) — engine

### Task 1: Commander profile model

**Files:**
- Create: `src/engine/commander/profile.ts`
- Modify: `src/engine/state/types.ts`, `src/engine/state/create.ts`, `src/engine/tuning.ts`, `src/engine/setup.ts`
- Test: `tests/engine/commander/profile.test.ts`, `tests/engine/setup.test.ts` (extend)

**Interfaces:**
- Produces:
  - `type BodyStat = 'strength' | 'endurance' | 'reflexes'`; `BODY_STATS`; `type Archetype = 'frail' | 'slight' | 'average' | 'fit' | 'hardened'`.
  - `Commander` + `body?: Record<BodyStat, number>`, `bodyXp?: Record<BodyStat, number>`, `expression?: number`, `seasoning?: number`, `traits?: { regular: string[]; special?: string }`, `archetype?: Archetype`, `fileReviewed?: boolean`, `sleeplessDay?: number`. `Relation.metDay?: number`. `Unit.commanderTastes?: string[]`.
  - `TUNING.commander = { pool: 7, creationMax: 4, defaults: { body: { strength: 3, endurance: 3, reflexes: 2 }, expression: 3, seasoning: 3 }, bodyXpPerSession: 10, bodyXpSteps: [30, 60, 100, 150], crisisHpBase: 20, crisisHpPerEndurance: 10, crisisHpMin: 10, dodgePerReflex: 0.06, scarChance: 0.15, unnoticedSkip: 0.5, rallyStress: 10, presenceMax: 15, tau: 7, offImageMult: 1.3, earlyDays: 14, exhaustionEndurance: 2, coverStates: [...], intimidatePerPoint: 0.03, delegateRemarkChance: 0.3, maxTastes: 3, maxRegular: 2 }` (frozen).
  - `DESCRIPTORS: Record<BodyStat | 'expression' | 'seasoning', readonly string[]>` (verbatim lists); `descriptor(kind, value): string`.
  - `archetypeOf(body): Archetype`; `interface CommanderProfile { body; bodyXp; expression; seasoning; traits; archetype }`; `commanderProfile(state): CommanderProfile` (defaults for missing fields, archetype recomputed).
  - `interface CommanderSetup { body: Record<BodyStat, number>; expression: number; seasoning: number; traits: { regular: string[]; special?: string } }`; `poolSpent(body): number` (sum − 3); `validateCommanderSetup(c, reg, opts: { desireBondDefects: boolean }): string[]` — this task: body integers 1–4, spent ≤ 7, expression/seasoning 1–5, `traits.regular` ≤ 2 unique (ids checked in Task 10).
  - `applyCommanderSetup(commander, c: CommanderSetup): void` (writes fields, `bodyXp` zeros, archetype).
  - `SetupResult.commander?: CommanderSetup`; `validateSetup` adds its errors; `buildCampaign` applies it (or the defaults) before any unit joins; `createCampaign` writes the defaults and `fileReviewed: true`.

- [x] **Step 1: Write the failing tests** — `archetype at 4/5/6/7/9/10/12/13` (frail, slight, slight, average, average, fit, fit, hardened); `descriptors read 1 and 5 for every kind`; `unspent points are valid` (1/1/1); `4/4/2 spends exactly 7 and is valid`; `a 5 at creation is rejected`; `spending 8 is rejected`; `expression 0 and seasoning 6 are rejected`; `commanderProfile fills defaults for a commander without P7 fields` (archetype `average`); setup: `buildCampaign writes the commander setup and its archetype`; `a setup without commander gets 3/3/2, 3, 3`.
- [x] **Step 2: Run** `npx vitest run tests/engine/commander tests/engine/setup.test.ts` → FAIL.
- [x] **Step 3: Implement** the types, tuning block, `profile.ts`, setup and create changes.
- [x] **Step 4: Run** `npx vitest run` → whole suite green.
- [x] **Step 5: Commit** `feat(engine): commander body, expression, seasoning and archetype`.

---

### Task 2: Migration seed and `metDay`

**Files:**
- Create: `src/engine/actions/commander.ts`
- Modify: `src/engine/setup.ts` (`initialRelation` writes `metDay: since ?? 1`), `src/app.ts` (`afterLoad` dispatches the seed), `src/engine/state/create.ts`
- Test: `tests/engine/commander/seed.test.ts`, `tests/app.test.ts` (extend)

**Interfaces:**
- Consumes: `applyCommanderSetup`, `TUNING.commander.defaults` (Task 1).
- Produces: `commander/seed {}` — no-op when `commander.body` exists; else writes defaults, `fileReviewed: false`, `metDay` for every relation missing it (`min(stateSince, ...history days)`); event `commander_seeded`. `commander/review_done {}` → `fileReviewed = true`. `commander/set_profile { commander: CommanderSetup }` → only while `fileReviewed === false`, validates, applies, sets `fileReviewed = true` (start-time trait effects join in Task 10). `daysKnown(state, unitId): number` (`state.day − (metDay ?? 1)`, ≥ 0) exported from `profile.ts`.

- [x] **Step 1: Write the failing tests** — `seed fills a P6 fixture commander and back-fills metDay from history`; `seed is idempotent`; `readers survive a P6 save before seeding` (`commanderProfile`, `daysKnown` on a fixture without fields); `set_profile is refused once reviewed`; `set_profile with a 5 changes nothing`; `review_done marks reviewed`; `a new relation has metDay = its join day`; app: `afterLoad seeds an old campaign once`.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npx vitest run` → green.
- [x] **Step 5: Commit** `feat(engine): commander seed for old saves and metDay`.

---

### Task 3: Body training

**Files:**
- Modify: `src/content/schemas.ts` (`ActivityEffectSchema` + `commander_body_xp { stat }`), `content/core/activities.json` (`train` focuses `body_strength` / `body_endurance` / `body_reflexes`, labels `Body: strength` …), `src/engine/activities.ts`, `src/engine/commander/profile.ts`, `src/engine/ledger.ts`
- Test: `tests/engine/commander/growth.test.ts`, `tests/engine/ledger.test.ts` (extend)

**Interfaces:**
- Produces: `addBodyXp(commander, stat, amount): { value: number; gained: boolean }` (carry-over; nothing at 5; recomputes archetype); activity effect case `commander_body_xp` → `addBodyXp(draft.commander, fx.stat, TUNING.commander.bodyXpPerSession × bodyGrowthMult)` where `bodyGrowthMult(state, reg)` returns 1 until Task 11; event `body_trained { stat, value, raised }`. Ledger records `body:<stat>` deltas.

- [x] **Step 1: Write the failing tests** — `three sessions raise strength 1 → 2` ; `six more raise 2 → 3`; `xp carries over a step`; `training a stat at 5 changes nothing`; `train with focus body_reflexes needs no units`; `the commander injured blocks body training` (existing rule); ledger: `a raised body stat is recorded as body:<stat>`.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → green.
- [x] **Step 5: Commit** `feat(engine): commander body training`.

---

### Task 4: Commander Crisis, presence action and scars

**Files:**
- Modify: `src/engine/combat/types.ts` (`CombatState.presence?: { kind: 'unnoticed' | 'steady_voice' | 'rally'; used: boolean; steadyVoicePending?: boolean }`), `build.ts`, `effects.ts` (`hitCommander`), `orders.ts` (`orderCost`), `ai.ts`, `outcome.ts`, `src/engine/actions/combat.ts`, `src/engine/tuning.ts` (remove `combat.commanderHp`)
- Test: `tests/engine/combat/crisis.test.ts`, existing combat tests updated where the dodge roll shifts a seeded sequence

**Interfaces:**
- Consumes: `commanderProfile` (Task 1).
- Produces: `commanderMaxHp(state, reg): number`; `presenceKind(archetype)` (frail/slight → `unnoticed`, average → `steady_voice`, fit/hardened → `rally`); action `combat/presence {}` (errors: `combat/presence: the combat is not running`, `The presence action was already used.`, `No commander in this combat.`); events `combat_presence { kind }`, `commander_scarred { stat: BodyStat | null, seasoning: number }`.

- [x] **Step 1: Write the failing tests** — `endurance 1 and 5 give 30 and 70 HP`; `reflexes 5 dodges 30% of uncovered hits over a seeded run` (count within a fixed seed, exact number asserted); `a covered hit never rolls a dodge`; `presence kind follows the archetype`; `rally lowers every standing ally's stress by 10`; `steady voice makes one order 1 CP cheaper, then normal`; `unnoticed skips the commander option about half the time` (fixed seed, exact count); `presence twice is rejected and changes nothing`; `a downed commander scars with a fixed seed: endurance −1, seasoning +1`; `a retried combat never scars`.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** Re-run the combat suite; update only expectations whose seeded sequence moved because of the dodge roll, and name them in the commit body.
- [x] **Step 4: Run** `npx vitest run` → green.
- [x] **Step 5: Commit** `feat(combat): commander HP from endurance, dodge, presence action and Crisis scars`.

---

### Task 5: Check routes — schema, validator and resolution

**Files:**
- Create: `src/engine/commander/checks.ts`
- Modify: `src/content/schemas.ts` (`RouteCheckSchema`, `EventOptionSchema.routeCheck?`), `src/content/refs.ts` (`unitFilter.roles` → `roles`, `itemId` → `items`)
- Test: `tests/content/routeCheck.test.ts`, `tests/engine/commander/checks.test.ts`

**Interfaces:**
- Produces:
  - `CheckRoute` = `{ kind: 'body'; stat: BodyStat; min: 1..5 } | { kind: 'delegate'; unitFilter?: { roles?: string[] }; cost: { trustCheck?: TrustBand; affinityCost?: int 0..20; stress?: int 0..30 } } | { kind: 'social'; stat: SocialStat; min: 1..5 } | { kind: 'item'; itemId: string } | { kind: 'bypass'; cost: { resource: 'credits' | 'supplies' | 'plyx'; amount: int ≥ 1 } }`; `RouteCheck = { id, routes: CheckRoute[] (1–5) }`. Schema error on body-only: `a check needs at least one route that is not body (overview P10)`.
  - `interface RouteChoice { route: number; kind: CheckRoute['kind']; label: string; disabled: string | null; unitIds?: string[] }`; `routeChoices(state, reg, check, scope: { unitIds?: string[] }): RouteChoice[]` — labels: `STRENGTH: Strong or better`, `Ask a unit (Trust: guarded)`, `AUTHORITY 3`, `Use <item name>`, `Pay <n> <resource>`.
  - `interface RoutePick { route: number; unitId?: string }`; `resolveRoute(draft, ctx, check, pick, scope): { passed: boolean; events: EngineEvent[] }` — throws on a disabled or stale pick (message = the disabled reason); delegate per **Where the code differs**; events `route_taken { checkId, kind, passed }`, `delegate_remark { unitId }`, `delegate_demand { unitId }`, `delegate_refused { unitId }`.

- [x] **Step 1: Write the failing tests** — schema: `a body-only check is rejected`; `body plus delegate is accepted`; `an unknown role in unitFilter is a broken reference`; `an unknown itemId is a broken reference`. Engine: `body passes at min and is disabled below with the descriptor in the reason`; `social reads the effective rank`; `a bypass that cannot be paid is disabled`; `bypass pays and passes`; `item passes only while an instance is owned`; `delegate complies at guarded trust and pays affinity and stress`; `one band below is a demand and does not pass`; `breaking loyalty refuses`; `a delegate outside the party is disabled in a run`; `a stale delegate pick is rejected`.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → green.
- [x] **Step 5: Commit** `feat(engine): check routes with a non-body route rule`.

---

### Task 6: Route checks in dilemmas and expedition events

**Files:**
- Modify: `src/engine/dilemma/types.ts` (`DilemmaOption.routeCheck?`), `src/engine/dilemma/flow.ts` (`fixed` options copy `routeCheck`; `dilemmaOptions` adds `routes?: RouteChoice[]`; `chooseDilemma(draft, ctx, id, index, route?)`), `src/engine/actions/dilemma.ts` (`dilemma/choose { id, index, route? }`), `src/engine/world/expedition.ts` (`eventOptions` adds `routes`, `chooseOption(draft, ctx, index, route?)`), `src/engine/actions/expedition.ts` (`expedition/choose { option, route? }`), `content/core/dilemmaTemplates.json` (`evt_sealed_crate` option 0 "Pry it open by hand": `routeCheck { id: 'pry_crate', routes: [body strength 3, delegate { trustCheck: 'low', stress: 5 }, bypass { supplies 2 }] }` — no new templates: a new pool entry would shift seeded expedition draws)
- Test: `tests/engine/dilemma/routes.test.ts`, `tests/engine/world/eventRoutes.test.ts`

**Interfaces:**
- Consumes: `routeChoices`, `resolveRoute`, `RoutePick` (Task 5).
- Produces: an option with `routeCheck` and no `route` → error `Choose how to do it.`; a failed route keeps cost effects and drops gains (the P6 failed-check filter); the scope in a run is the party, else living roster units.

- [x] **Step 1: Write the failing tests** — `choosing a routed option without a route changes nothing`; `a passed body route applies every effect`; `a refused delegate keeps costs and drops the loot`; `expedition/choose with a delegate uses only the party`; `dilemmaOptions lists route choices`; `core: evt_sealed_crate option 0 has a non-body route`.
- [x] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → green.
- [x] **Step 5: Commit** `feat(engine): route checks in dilemmas and expedition events`.

---

### Task 7: Presence, tastes and the first impression

**Files:**
- Create: `src/engine/commander/presence.ts`, `content/core/presence.json`, `content/core/tastes.json`
- Modify: `src/content/types.ts` (append `'commanderTraits', 'tastes', 'presence', 'imageConsistency'` under `// P7`), `src/content/schemas.ts`, `content/core/manifest.json` (`commanderTraits.json` may be an empty array until Task 10), `src/engine/setup.ts` (`UnitSetup.tastes?: string[]`, validated ≤ 3 known unique ids; `makeNamedUnit` copies to `commanderTastes`), the join sites `setup.ts`, `actions/squad.ts` (`add_named`, grunt reward), `actions/base.ts` (`recruit_grunt`)
- Test: `tests/engine/commander/presence.test.ts`, `tests/content/p7Schemas.test.ts`

**Interfaces:**
- Produces:
  - `PresenceSchema = { id, factor: 'archetype' | 'seasoning' | 'authority', key: string, presence: int −15..15 }`; core rows: archetype frail −6, slight −3, average 0, fit 3, hardened 6; seasoning 1 −4, 2 −2, 3 0, 4 2, 5 4; authority 1 −2, 2 0, 3 2, 4 3, 5 5. A core test asserts every factor key is covered.
  - `TasteSchema = { id, name, description, match?: { archetypes?: Archetype[]; expression?: [lo, hi]; seasoning?: [lo, hi] }, offsets?: { trust?, affinity?, attraction? } (int −20..20), presenceMult?: number 0..2, imageMult?: number 0..2 }`; core entries (author tunes): `respects_strength` (fit/hardened; trust +8, presenceMult 1.5), `wary_of_brutes` (fit/hardened; trust −8, imageMult 1.5), `protective_of_frail` (frail/slight; affinity +8, imageMult 1.5), `drawn_to_feminine` (expression 1–2; attraction +10), `drawn_to_masculine` (4–5; +10), `drawn_to_androgynous` (3–3; +10), `drawn_to_older` (seasoning 4–5; +8), `drawn_to_younger` (1–2; +8), `indifferent_to_looks` (no match keys = always matches; presenceMult 0).
  - `presenceOf(state, reg): number` (sum, clamped ±15); `firstImpressionWeight(state, unitId): number` (`exp(−d/τ)`, τ from `state.settings.firstImpressionTau ?? TUNING.commander.tau`); `matchedTastes(state, reg, unit): Entry[]`; `applyFirstImpression(state, reg, unit, rel): void` (trust += round(P × Π presenceMult); matched offsets; clamps to axis ranges; loyalty band recomputed through `initialRelation`'s rule).

- [ ] **Step 1: Write the failing tests** — `presence of a frail green rank-1 commander is −12`; `presence is clamped to ±15` (fixture rows); `w(0)=1, w(7)≈0.368, w(21)≈0.050`; `a drawn_to_feminine unit gains attraction only with expression 1–2`; `body and expression never change attraction without a taste` (sweep every body/expression with tastes `[]` → attraction = baseline); `indifferent_to_looks cancels presence`; `a grunt recruit gets presence but no tastes`; `add_named applies the first impression on its join day`; `more than 3 tastes or an unknown taste is a setup error`; schema: `a taste with expression [4, 2] is rejected`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → green.
- [ ] **Step 5: Commit** `feat(engine): presence, unit tastes and first impressions`.

---

### Task 8: Image consistency and the τ setting

**Files:**
- Create: `content/core/imageConsistency.json`
- Modify: `src/content/schemas.ts` (`ImageConsistencySchema = { id, archetypes: Archetype[] (min 1), inImage: EventType[], offImage: EventType[] }`, refine: no event in both lists; a refs/loader check that every archetype belongs to exactly one group), `src/engine/commander/presence.ts`, `src/engine/relations/deltas.ts`, `src/engine/actions/commander.ts`, `src/settings.ts` (`firstImpressionTau` int 1–30, default 7), `src/ui/shell/sysTab.ts` (SYS › Relationships: `First impression fades (days, 1–30)`), `src/app.ts` (`syncFirstImpressionTau()` beside `syncBeatCooldown()`), `content/core/glossary.json` (`setting_first_impression_tau`)
- Test: `tests/engine/commander/image.test.ts`, `tests/settings.test.ts` (extend), `tests/ui/shell.test.ts` (extend)

**Interfaces:**
- Produces: `imageMultiplier(state, reg, unitId, event: EventIntent): number` (1 unless commander actor + off-image); called in `computeDeltas` after the defect modifiers on trust/affinity/attraction; `campaign/set_first_impression_tau { days }` (1–30, error otherwise).

- [ ] **Step 1: Write the failing tests** — `a frail commander's coerced gets 1.3 at d=0, ≈1.110 at d=7, ≈1.015 at d=21`; `a hardened commander's comforted gets the same curve on a gain`; `an average commander's coerced is unchanged`; `a unit's own event is never off-image`; `a matched wary_of_brutes doubles the extra part` (1 + (1.3·1.5 − 1)·w); `τ = 14 halves the decay at d=7`; schema: `an archetype in two groups is an error`; settings/SYS: `tau defaults to 7 and 0 or 31 fall back`; `the SYS field changes the setting`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → green.
- [ ] **Step 5: Commit** `feat(engine): image consistency fading with days known`.

---

### Task 9: Exhaustion after long runs and talk-down intimidation

**Files:**
- Modify: `src/engine/world/expedition.ts` (return path), `src/engine/state/types.ts` (`calendar.loseMorning?: boolean`), `src/engine/calendar.ts` (`rollover`), `src/engine/loyalty/desertion.ts` (`talkDown`)
- Test: `tests/engine/commander/bodyTouchpoints.test.ts`

**Interfaces:**
- Produces: events `commander_covered { unitId }`, `commander_exhausted { day }`; `intimidationBonus(state): number` (exported from `profile.ts`, used by `talkDown` for `authority` only).

- [ ] **Step 1: Write the failing tests** — `endurance 2 after a 3-slot run loses the next morning`; `a friend in the party covers him instead`; `a 2-slot run never exhausts`; `endurance 3 never exhausts`; `a night event is played before the lost morning`; `strength 5 seasoning 5 adds 0.12 to authority talk-down, empathy unchanged`; `strength 1 seasoning 1 subtracts 0.12`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → green; `npm run build` and the architecture test pass.
- [ ] **Step 5: Commit** `feat(engine): long-run exhaustion and physical intimidation`. **Chunk (a) ends here.**

---

## Chunk (b) — traits, import, UI

### Task 10: Traits registry and start/join effects

**Files:**
- Create: `src/engine/commander/traits.ts`, `content/core/commanderTraits.json`
- Modify: `src/content/schemas.ts` (`CommanderTraitSchema`, `TraitEffectSchema`), `src/content/refs.ts` (`exclusiveWith` → `commanderTraits`, `activity_relation.activityId` → `activities`, `relation_event_mult.event` must be an event type), `src/engine/commander/profile.ts` (`validateCommanderSetup` trait rules), `src/engine/setup.ts`, `src/engine/commander/presence.ts`, `src/engine/actions/commander.ts`
- Test: `tests/content/traitSchemas.test.ts`, `tests/engine/commander/traits.test.ts`

**Interfaces:**
- Produces:
  - `CommanderTraitSchema = { id, name, kind: 'regular' | 'special', description, upside, downside, effects: TraitEffect[], hooks?: string[], exclusiveWith?: string[], requiresSettings?: { desireBondDefects?: true } }`.
  - `TraitEffect` (discriminated on `type`, strict): `social_rank { stat, rank }`, `starting_trust { amount, ifValue? }`, `leash_weekly { amount }` (same shapes as crime effects); `seasoning_start { amount }`, `faction_start { amount }` (own corporation), `taste_attraction { amount }` (per unit with a matched `drawn_to_*` taste), `social_growth { stat, mult }`, `body_growth { mult }`, `early_trust_gain { pct }`, `crisis_hp { amount }`, `terminate_approval { amount }`, `requisition_price { pct }`, `activity_cost { activityId, resource, amount }`, `activity_relation { activityId, axis, amount }` (with a companion), `relation_event_mult { event, mult, ifTrigger? }`, `night_slot {}`, `sleepless_rank { stat, amount }`, `no_romance {}`, `platonic_threshold { states: string[], pct }`, `unlock_state { stateId }`.
  - `traitIds(state): string[]`; `traitEffects<T extends TraitEffect['type']>(state, reg, type: T): Extract<TraitEffect, { type: T }>[]`; `hasTraitEffect(state, reg, type): boolean`.
  - Validation: regular ids must be `kind: regular`, ≤ 2, unique; special `kind: special`; no `exclusiveWith` pair; `requiresSettings` honoured. Start-time effects in `buildCampaign` and `commander/set_profile`: `social_rank` (max with current), `seasoning_start` (cap 5), `faction_start`. Join-time in `applyFirstImpression`: `starting_trust`, `taste_attraction`.
  - Core content, verbatim ids, numbers per the spec table and **Where the code differs**: `insomniac` (`night_slot`, `sleepless_rank empathy −1`), `old_wound` (`seasoning_start 1`, `early_trust_gain 15`, `crisis_hp −10`), `silver_tongue` (`social_growth cunning 1.5`, `relation_event_mult lied_detected 1.5 ifTrigger lies`), `pretty_face` (`taste_attraction 10`, `early_trust_gain −10`), `bookish` (`social_growth insight 1.5`, `body_growth 0.7`), `field_medic` (`activity_relation medbay affinity 3`, `social_rank empathy 2`, `activity_cost medbay supplies 1`), `corporate_polish` (`leash_weekly 1`, `faction_start 10`, `starting_trust −10 ifValue corporate −`), `street_raised` (`social_rank cunning 2`, `requisition_price −15`, `faction_start −10`, `terminate_approval −0.1`), special `vow_of_distance` (`no_romance`, `platonic_threshold [confidant, kindred] 15`, `unlock_state sworn`). Every entry has `description`, `upside`, `downside` (author placeholder wording from the spec table).

- [ ] **Step 1: Write the failing tests** — schema: `three regular traits are rejected`; `a special id in regular is rejected`; `two exclusive traits are rejected`; `an unknown effect type is rejected`; `core traits load with no errors`. Engine: `field_medic starts Empathy at rank 2`; `old_wound starts one seasoning higher, capped at 5`; `corporate_polish lowers starting trust only for corporate − units`; `pretty_face adds attraction only with a matched drawn_to taste`; `street_raised lowers own corporation standing by 10`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → green.
- [ ] **Step 5: Commit** `feat(content): commander traits registry and start effects`.

---

### Task 11: Trait runtime hooks

**Files:**
- Modify: `src/engine/social.ts` (`socialRank` applies `sleepless_rank` on `commander.sleeplessDay === state.day`; new `socialGrowthMult`), `src/engine/activities.ts` (`commander_stat` × growth mult; cost via `activityCost(state, reg, a)` in both check and run; quiet-night slot rule; `activity_relation`; `sleeplessDay`), `src/engine/commander/profile.ts` (`bodyGrowthMult`), `src/engine/combat/build.ts` (`crisis_hp`), `src/engine/relations/deltas.ts` (`early_trust_gain` on trust gains while `daysKnown < 14`; `relation_event_mult`), `src/engine/leash/weekly.ts` (`leash_weekly`), `src/engine/leash/use.ts` (`terminate_approval`), `src/engine/actions/base.ts` (`requisition_price`, rounded up, ≥ 1 credit per supply), `src/engine/calendar.ts` (`nightCheck` quiet night), `src/engine/actions/calendar.ts` (`calendar/sleep`), `src/engine/actions/comms.ts` / `night.ts` (`night/open`, `night/ignore` refuse without a night event)
- Test: `tests/engine/commander/traitHooks.test.ts`, `tests/engine/commander/quietNight.test.ts`

**Interfaces:**
- Consumes: `traitEffects`, `hasTraitEffect` (Task 10).
- Produces: `activityCost(state, reg, activity: Entry): { credits?: number; supplies?: number; plyx?: number }`; `isQuietNight(state): boolean` (`slot === 'night' && !calendar.nightEvent`); `calendar/sleep {}` (only in a quiet night; error `There is nothing to sleep through.`), event `quiet_night_started`.

- [ ] **Step 1: Write the failing tests** — `silver_tongue gains cunning 1.5× (rounded)`; `bookish trains a body stat in ceil(30/7) sessions`; `field_medic medbay costs 1 supply more and gives the companion +3 affinity`; `old_wound has 10 HP less in Crisis`; `old_wound raises a trust gain by 15% on day 3 and not on day 20`; `pretty_face lowers it by 10%`; `a detected lie costs 1.5× with a lies-triggered unit only`; `corporate_polish gives one more weekly authorization`; `street_raised requisition is 15% cheaper and termination approval 0.1 lower`; quiet night: `an insomniac's empty evening enters a quiet night`; `a quiet night has no night event and night/open refuses`; `an activity in a quiet night makes the next day sleepless and Empathy reads one lower`; `sleep ends the night with no penalty`; `a queued night event still comes first`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → green.
- [ ] **Step 5: Commit** `feat(engine): commander trait hooks and the quiet night`.

---

### Task 12: `vow_of_distance` and the state `sworn`

**Files:**
- Modify: `src/engine/relations/gain.ts` (`intimacyOf` → romance false with `no_romance`), `src/engine/relations/graph.ts` (`usable` honours `requiresTrait`; `candidates` and `stateForProposal` scale entry conditions through `platonicThresholds(state, reg, stateId, cond)`), `src/content/schemas.ts` (`RelationshipStateSchema.requiresTrait?: str`, ref → `commanderTraits`), `content/core/relationshipStates.json` (`sworn`: group `platonic`, `romance: false`, priority 40, entry `automatic` from `kindred` with trust 70–100, affinity 85–100, `requiresTrait: vow_of_distance`; `description`/`promptHint` marked `AUTHOR TO WRITE`)
- Test: `tests/engine/relations/vow.test.ts`

**Interfaces:**
- Produces: `platonicThresholds(state, reg, stateId, cond: Conditions): Conditions` — lower bounds of `axes` ranges × (1 − pct/100), rounded to the nearest integer (55 → 47, 80 → 68); upper bounds untouched.

- [ ] **Step 1: Write the failing tests** — `with the vow no romantic state is reachable from any state` (walk `availableStates` and proposal checks for every romantic proposal kind); `the vow lowers confidant to affinity 47 and kindred to 68`; `sworn is unreachable without the vow and reachable from kindred with it`; `without the vow nothing changes` (graph tests stay green).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → green.
- [ ] **Step 5: Commit** `feat(engine): vow of distance and the sworn state`.

---

### Task 13: `commander_import` call

**Files:**
- Create: `src/llm/calls/commanderImport.ts`, `src/setup/commander.ts`, `tests/fixtures/commander_import/{valid,over_pool,hostile,prose_wrapped,truncated}.txt`
- Modify: `src/llm/callTypes.ts` (`'commander_import'` in `CALL_TYPE_IDS`), `src/settings.ts` (budget 600), `src/st/adapter.ts`, `real.ts`, `fake.ts` (`getPersonaDescription()`), `src/app.ts` (imports the call module)
- Test: `tests/llm/commanderImport.test.ts`, `tests/setup/commander.test.ts`

**Interfaces:**
- Produces:
  - Call input `{ persona: { name, description }, traits: Array<{ id, upside, downside }> }` (regular traits only); output JSON `{ strength, endurance, reflexes, expression, seasoning: <descriptor>, traits: [{ id, reason ≤ 200 }] (0–2), notes ≤ 300 }`; raw schema loose (like `profile_import`); persona text wrapped in `<persona>` and called data, not instructions.
  - `sanitizeCommanderImport(raw, reg): { setup: CommanderSetup; reasons: Record<string, string>; notes: string }` — descriptor → value (case-insensitive; unknown → default), each body ≤ 4, then while spent > 7 lower the highest (ties: reflexes, endurance, strength); traits: known regular ids, unique, ≤ 2, first of an exclusive pair kept.
  - `importCommander(st, deps): Promise<{ kind: 'ok'; result } | { kind: 'manual'; reason: string }>` — empty persona or no profile → `manual` (same fail-soft path as `importProfile`).

- [ ] **Step 1: Write the failing tests** — `valid fixture maps descriptors`; `over_pool 5/5/5 becomes 4/3/3`; `hostile: unknown and special trait ids are dropped`; `prose_wrapped parses`; `truncated keeps complete fields or falls back to manual`; `no mechanic profile is manual mode`; `the prompt marks persona text as data`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → green.
- [ ] **Step 5: Commit** `feat(llm): commander_import from the persona`.

---

### Task 14: Wizard model — COMMANDER step and unit tastes

**Files:**
- Modify: `src/setup/wizard.ts`, `src/llm/calls/profileImport.ts` (section `tastes` → `"commanderTastes": ["<id from TASTES>"] // at most 3`, tastes list in the prompt), `src/setup/profile.ts` (`ImportedProfile.commanderTastes?`, sanitizer keeps known ids ≤ 3), `src/engine/actions/squad.ts` (`squad/resync` patch `commanderTastes` → section `tastes`)
- Test: `tests/setup/wizard.test.ts` (extend), `tests/setup/profile.test.ts` (extend), `tests/engine/squad.test.ts` (extend)

**Interfaces:**
- Produces: `WizardStep = 'dossier' | 'commander' | 'units' | 'calibration' | 'review'`; `WizardState.commander: CommanderSetup` (default 3/3/2, 3, 3, no traits), `commanderImport: { status: 'idle' | 'loading' | 'ready' | 'manual'; notice?: string; reasons: Record<string, string> }`; methods `setBody(stat, value)` (ignored if it breaks the pool or the 4 cap), `setExpression(n)`, `setSeasoning(n)`, `toggleTrait(id)` (regular/special rules, exclusive pairs refused), `prefillFromPersona()`, `randomCommander()`; `WizardDeps.commanderImporter: () => Promise<…>` and `random: () => number`; `canAdvance('commander')` = `validateCommanderSetup` empty; `UnitDraft.choice.tastes: string[]`; `result().commander` set.

- [ ] **Step 1: Write the failing tests** — `dossier → commander → units`; `setBody refuses a 5 and an 8th point`; `toggling a third regular trait is ignored`; `prefill applies the sanitized import and keeps reasons`; `a late prefill after back/next is ignored` (generation token as in calibration); `randomCommander is valid for 200 seeds`; `the result carries the commander and unit tastes`; profile: `unknown tastes are dropped, at most 3 kept`; resync: `tastes re-sync never changes axes`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → green.
- [ ] **Step 5: Commit** `feat(setup): commander file step and unit tastes in the wizard`.

---

### Task 15: COMMANDER FILE UI, tastes chips and the review modal

**Files:**
- Create: `src/ui/commander/commanderFile.ts`, `css/60-commander.css`
- Modify: `src/ui/setup/setupScreen.ts` (`STEPS`: `01 DOSSIER`, `02 COMMANDER FILE`, `03 UNIT ASSIGNMENT`, `04 PROFILE CALIBRATION`, `05 REVIEW`; review lists the descriptors and traits), `src/ui/setup/calibration.ts` (TASTES section: chips, ≤ 3, regenerate `tastes`), `src/app.ts` (after `commander/seed`, `fileReviewed === false` → modal "Commander file incomplete — review" with the form prefilled; CONFIRM → `commander/set_profile`, SKIP → `commander/review_done`)
- Test: `tests/ui/commanderFile.test.ts`, `tests/ui/setup.test.ts` (extend), `tests/app.test.ts` (extend)

**Interfaces:**
- Produces: `renderCommanderFile(host, ctx: { value: CommanderSetup; registries; onChange: (patch) => void; onPrefill?: () => void; onRandom?: () => void; importStatus?; reasons? })` — per body stat `−`/`+` buttons and the descriptor (`alius-stat`, `data-analyze="glossary:body_<stat>"`), `POINTS LEFT n` (n is a creation budget, not a stat: allowed), expression and seasoning pickers (descriptor buttons, `alius-option`), live archetype label (`glossary:archetype`), trait cards (`commanderTraits:<id>`, upside/downside, `aria-pressed`), buttons PREFILL FROM PERSONA / RANDOM COMMANDER.

- [ ] **Step 1: Write the failing tests** — `the commander step shows descriptors, never stat numbers` (text of `.alius-stat` matches the descriptor lists); `+ is disabled at 4 and with no points left`; `the archetype label follows the body`; `trait cards toggle and a third regular is disabled`; `every marked element resolves` (coverage helper); calibration: `taste chips cap at 3`; app: `the review modal opens once and skip marks it reviewed`; `confirm applies the profile`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → green.
- [ ] **Step 5: Commit** `feat(ui): commander file in setup and the review modal`.

---

### Task 16: CMDR card, presence button, route picker, quiet night

**Files:**
- Create: `src/ui/commander/cmdrCard.ts`
- Modify: `src/ui/squad/squadTab.ts` (CMDR card first), `src/ui/combat/combatScreen.ts` (PRESENCE button: `UNNOTICED` / `STEADY VOICE` / `RALLY`, disabled after use, `data-analyze="glossary:presence_<kind>"`), `src/ui/dilemma/dilemmaPanel.ts` and `src/ui/expedition/expeditionScreen.ts` (a routed option opens its route list; delegate asks for a unit; disabled routes show the reason), `src/ui/shell/status.ts` + `src/ui/ops/opsTab.ts` (quiet night: `NIGHT — QUIET`, SLEEP button, evening activities), app toasts for `delegate_remark`, `delegate_demand`, `commander_covered`, `commander_exhausted`, `commander_scarred`, `body_trained`
- Test: `tests/ui/cmdrCard.test.ts`, `tests/ui/combat.test.ts`, `tests/ui/dilemmaPanel.test.ts`, `tests/ui/expedition.test.ts`, `tests/ui/ops.test.ts` (extend)

**Interfaces:**
- Consumes: `commanderProfile`, `descriptor`, `routeChoices` via `dilemmaOptions`/`eventOptions` `.routes`, `isQuietNight`.
- Produces: CMDR card `section.alius-cmdr` — name, crime, body descriptors, expression, seasoning, archetype, trait chips (`commanderTraits:<id>`), empty reputation slot `REPUTATION — NONE ON FILE` (P9 fills it).

- [ ] **Step 1: Write the failing tests** — `the CMDR card shows descriptors and traits, no digits` (raw values off); `with raw values on the stats show their numbers`; `the presence button dispatches combat/presence once`; `a routed option lists its routes and sends { route, unitId }`; `a disabled route shows its reason`; `the shell renders a quiet night`; `SLEEP dispatches calendar/sleep`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → green.
- [ ] **Step 5: Commit** `feat(ui): CMDR card, presence action, route picker and the quiet night`.

---

### Task 17: Context line and the early-days directive

**Files:**
- Modify: `src/scene/context.ts` (commander provider), `src/engine/commander/profile.ts` (`commanderLine`)
- Test: `tests/scene/context.test.ts` (extend)

**Interfaces:**
- Produces: `commanderLine(state, reg): string` = `` `Commander ${name}: ${seasoning}, ${archetype} build, ${expression} presentation.` `` (descriptors lower-cased; archetype as its id); appended as the provider's second line. Directive (same provider) when any present unit has `firstImpressionWeight > 0.5`: `Units still size him up by appearance.`

- [ ] **Step 1: Write the failing tests** — `the commander line uses descriptors and has no digits` (`/\d/` fails for a name without digits); `the directive appears on day 1 and is gone at d = 7` (w ≈ 0.37); `trait names are not in the line` (traits act through mechanics, not prompts).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → green.
- [ ] **Step 5: Commit** `feat(scene): commander line and first-impression directive`.

---

### Task 18: Analysis — glossary, descriptions and readings

**Files:**
- Create: `src/analysis/providers/commander.ts`
- Modify: `src/content/schemas.ts` (`DESCRIBED_REGISTRIES` + `commanderTraits`, `tastes`), `src/analysis/effects.ts` (lines for every `TraitEffect` type and taste offsets/multipliers), `content/core/glossary.json` (`body_strength`, `body_endurance`, `body_reflexes`, `expression`, `seasoning`, `archetype`, `presence`, `first_impression`, `image_consistency`, `commander_traits`, `check_routes`, `delegate`, `exhausted`, `quiet_night`, `presence_unnoticed`, `presence_steady_voice`, `presence_rally`), `src/app.ts` (register the providers)
- Test: `tests/analysis/commanderReading.test.ts`, `tests/analysis/effects.test.ts` (extend), `tests/analysis/hidden.test.ts` (runs over the new providers), `tests/content/glossaryCore.test.ts` (extend)

**Interfaces:**
- Produces: providers `glossary:body_<stat>` (descriptor; next step progress as `knowledge.raw(xp)` or `training: early / halfway / close`; "Where used" lines: Crisis HP / dodge / intimidation / exhaustion as text), `glossary:archetype` (archetype, presence action, image-consistency off-image event names), `glossary:presence` (per `data.unitId`: `First impression: fading` / `faded` from w, no numbers with raw off).

- [ ] **Step 1: Write the failing tests** — `body reading shows the descriptor and hides XP with raw values off`; `archetype reading names the presence action`; `trait effect lines for old_wound read Seasoning +1, Trust gains +15% for 14 days, Crisis HP −10`; `no provider shows a sentinel number with raw values off` (existing harness); `every new glossary entry is within 160/600`; `missingDescriptions is empty for core`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → green, including `tests/ui/analyzeCoverage.test.ts`.
- [ ] **Step 5: Commit** `feat(analysis): commander glossary, trait effects and readings`.

---

### Task 19: Docs, balance note and manual checklist

**Files:**
- Create: `docs/MANUAL_TEST_P7.md`
- Modify: `docs/packages/P7-commander-profile-traits.md` (**Implemented as**: every ruling of **Where the code differs**, plus anything decided during execution), `docs/00-overview.md` (§5.4 P7 interfaces row; §6 fields from planned to implemented incl. `calendar.loseMorning`, `commander.fileReviewed/sleeplessDay`, `Unit.commanderTastes`; §5.2 `commander_import` without "planned"; §8 τ setting implemented; §9 P7 → implemented), `docs/CONTENT.md` (check routes, tastes, traits, presence, image consistency), `docs/BALANCE_REPORT.md` (Crisis HP 60 → 20 + 10 × endurance), `dist/index.js`, `style.css`
- Test: whole suite

- [ ] **Step 1: Write** `MANUAL_TEST_P7.md`: new campaign through COMMANDER FILE (manual and prefill), CMDR card, body training, a Crisis with each presence kind, the sealed-crate routes (body / delegate / bypass), a 3-slot run with endurance 2, an insomniac quiet night, `vow_of_distance` with romance on, an old campaign's review modal, analysis on every new chip.
- [ ] **Step 2: Run** `npm run typecheck && npm test` → green; `npm run build` leaves `dist/index.js` and `style.css` updated.
- [ ] **Step 3: Commit** `docs: P7 implemented-as, overview, content guide and manual checklist`.
