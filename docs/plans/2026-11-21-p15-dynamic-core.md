# P15 The Dynamic (Hold, Frames, Domains, Exit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a long-lived holder layer on top of 0.1's relationships. One soldier at a time (up to the holder cap) slowly comes to hold authority over the commander.
- **Her profile:** what she practises, what she wants to see, her style pair, her expectations and her inclination. All of it is imported from her card, editable and lockable.
- **Before any frame:** deniable probes on the engine's schedule, and her reading of the commander's position.
- **The dynamic itself:** hold, frames, milestones and the vow; domains up to the commander's command; how the squad finds out and reacts.
- **The way out:** exits and aftermaths; the Leash block with oversight; compromat.
- **The commander's standing:** Regard and motives; shame told through people, never a narrator.
- **The player's way in:** offering, mastery per target and the body map.

All of it is off unless the campaign has a practice category and a holder cap above 0.

**Architecture:**
- **Engine:** one new folder, `src/engine/dynamic/`. It holds the state and the readers, hold and frames, probes, the position, milestones, domains, squad knowledge, exit, aftermaths, the Leash block, compromat, Regard, offers, mastery and the head start. Actions are in `src/engine/actions/dynamic.ts`.
- **P15a stand-ins:** P15 replaces them through their registration hooks, installed once by `installDynamicHooks()`.
- **Two engine-internal hooks are added:**
  - `registerEventLanded` in `relations/effects.ts`, so relation events feed hold without a second pipeline;
  - `registerCombatPassive` in `combat/build.ts`, for the holder's combat form.
- **P13's override is generalised** over its source (the warden, or a holder with the `countermand` capability). One override can be open at a time.
- **Model side:**
  - `profile_import` gains two sections, `practice` and `expectations`.
  - `intent_extract` gains seven types, each offered only while its subject exists.
  - The `dynamic:` directives are derived on every refresh. There is no new call type.
- **UI:**
  - the PRACTICE and EXPECTATIONS blocks (calibration and dossier);
  - the DYNAMIC block in WORLD PARAMETERS and SYS;
  - the DYNAMIC dossier section with the body map;
  - claim, milestone and return cards in her voice, the override chip for holders and the offer composer;
  - Tonight chips, the CMDR lines and the scene header chips.

**Tech Stack:** TypeScript 5 (strict), esbuild, zod 3, vitest (+ jsdom for UI). No new dependencies.

**Spec:** `docs/packages/P15-dynamic-core.md` (§1–§16; where §15 and §16 conflict with §1–§14, the later section wins). Read before Task 1:
- `docs/00-overview.md` (§3, §5.2–§5.4, §8, §11);
- `docs/content/lore.md` §0;
- the **Implemented as** of P9, P9b, P9c, P9d, P11b, P13, P14, P14b, P14c and P15a;
- `docs/drafts/bodymap/` (Task 43).

## Global Constraints

- **Off is byte-identical.** The dynamic is **on** only when all of these hold:
  - `state.dynamic` exists;
  - `state.dynamic.setup.holders !== 0`;
  - at least one **practice category** is enabled. A practice category is a category named by a `dynamicTracks[].category`.

  `dynamicOn(state, reg)` is the one gate. While it is false:
  - no `Relation.dynamic`, `Relation.regard` or `Relation.mastery` is written;
  - no `dynamic:` directive, chip or card appears;
  - none of the seven intent types is offered to `intent_extract` (its prompt is byte-identical, pinned by `tests/fixtures/intent_extract/prompt_without_reading.txt`);
  - no P15 reader registered on a P15a hook answers (each returns `null`);
  - there is no rng draw.

  These tests stay green **unchanged**: `tests/blocking/unaffected.test.ts`, `tests/warden/unaffected.test.ts`, `tests/special/unaffected.test.ts`, `tests/development/unaffected.test.ts`, `tests/life/unaffected.test.ts` and `tests/engine/setup.test.ts`. A seeded test that moves **stops and reports**; it does not get a new golden.
- **No rng draw unless someone is eligible.** A probe roll, a claim roll, a discovery roll, an override roll or an aftermath pick draws only when its own subject exists. Anything that can be hashed is hashed: `dynamicHash(state, unitId, key)` = `fnv1a(<seed>|<unitId>|dynamic|<key>|<day>)`, the same pattern as `lifeHash`. This covers the probe axis choice, the gossip spread and the head start. The engine draws from `ctx.rng` only for the rolls the spec calls rolls: the probe's daily chance, the claim offer, a bypass discovery, an override, an offer that becomes a claim, and the aftermath pick.
- **Old saves:** every new field is optional. That covers `CampaignState.dynamic`, `Relation.{dynamic, regard, mastery}`, `Unit.{expectations, expectationLocks}`, `Bond.practice`, `SetupResult.dynamic` and `AliusSettings.dynamicHidden`. There is no migration and the version is unchanged.
- **The engine owns every number** (overview P1/P2). The model reports only closed-vocabulary intents, which the engine validates against what it offered. Hold, frame, domains, Regard, suspicion, readings and mastery are never written from a model's number.
- **Read by field, type or capability, never by id** (P10 rule):
  - styles by `practiceStyles` fields;
  - domains by `grants` (capabilities);
  - milestones by `from` / `to` / `requires` / `effects`;
  - aftermaths by `weights` and `stages[].effects[].type`;
  - tracks by `category`, regions by `rank`, probe axes by `tier`.

  The only fixed vocabularies in code are the closed enums in `src/engine/dynamic/types.ts` (R4).
- **Lore §0:** no pronoun for the commander in any registry text, directive, card, toast, glossary entry or label. `tests/content/pronouns.test.ts` covers the new registries and the new `src/dynamic/*.ts` and `src/ui/dynamic/*.ts` files.
- **Ruling E (spec §16.1):** no engine value and no line tells the player or the model what the commander feels. The position is **her reading**, worded as hers. Regard is hers.
- **Hidden values** never reach a reading, a toast, a label or the prompt except where named:
  - hold numbers (only with "show raw values", and never in immersive mode);
  - Regard; suspicion; the `readOf` axes; mastery xp; compromat before it is mentioned;
  - her expectation profile before it is revealed; the aftermath stage; her override chance.

  `tests/fixtures/analyze/hidden.ts` gets sentinels for each (Task 47).
- **Analysis (P7a):** every new chip, option, stat and card carries `data-analyze` and resolves (`tests/ui/analyzeCoverage.test.ts`). Every new registry is in `DESCRIBED_REGISTRIES`. Every new setting has `setting_<key>`. Live readings go through `Knowledge.dynamic(unitId, reg)` (Task 46).
- **P14:** no new call type. `profile_import` keeps its site `setup.profile_import` (R6). `tests/llm/siteRegistry.test.ts` stays green.
- **Directive ids** start with `dynamic:`. That prefix is not one P9, P9b, P9c, P9d, P9e, P11, P12, P13, P14b, P14c or P15a reserves (Task 18 adds the check to `tests/dynamic/directives.test.ts`).
- **Prompt hygiene (P14c §0):**
  - a probe directive lasts one scene, a milestone line until answered, an aftermath line while its stage runs;
  - a directive is never a standing description of the commander;
  - the `dynamic:<unitId>` line carries frame, domains, her style and her tone. It carries Regard only as a tone word, never a number.
- **Every engine event of R22 is in `RESERVED_EVENT_TYPES`.** Every intent type of R22 is in `EVENT_TYPES` with an `eventDeltas` row (`cause` set).
- **Tuning:** every number is in `TUNING.dynamic`, `TUNING.probes`, `TUNING.position`, `TUNING.regard`, `TUNING.squadKnowledge`, `TUNING.exchange`, `TUNING.offer` or `TUNING.mastery`. The spec's drafts are copied as given; values the spec leaves open are marked `AUTHOR TO TUNE`. Texts the spec does not give are `AUTHOR TO WRITE: …`.
- `npm test` rebuilds `dist/index.js` and `style.css`; commit both with every task. Baseline before P15: **569 files, 8715 tests, all passing**.

## Where the plan rules on the spec (read before Task 1)

The user answered the rulings marked **(user)** on 2026-11-21. Task 49 copies every ruling into the spec's **Implemented as**.

### R1. What P15 builds and what waits (user)

All of §1–§16 is built here, in thirteen chunks (a)–(m). An executor may stop at any chunk boundary. The plan keeps the campaign playable after each chunk: later chunks only add readers and producers.

| part | P15 | completed by |
|---|---|---|
| Hold gains from practices: `task_kept`, `punishment_accepted`, `service_rated: pleased`, `staging_held`, `task_broken` | **No producer.** The event types are reserved, and `TUNING.dynamic.gains` already has their rows (+3 / +4 / +2 / +5 / −5), read by `holdFeed` once an event of that type lands (user). | **P16** |
| Hold gains P15 produces itself (user: only the spec's non-P16 sources) | Gains: probe answers (§15.12), `followed_lead`, `rule_accepted`, a granted **desire** demand, an accepted offer (§15.12), a `drawn` witness's own step (§8), the `successor` push (§9), and COMPLY on her override (the spec puts her hold where the warden's satisfaction was, and COMPLY raises satisfaction). Losses: refusals of her claims, milestones or demands, `rule_broken`, `overrode_her`, `commander_enforced` on her, and DEFY. Plus the slow Impunity and standing term. Not a source: moment answers (they move only the reading), `rule_kept`, and an accepted milestone (it changes the frame, not hold). | — |
| Track xp | **No producer** (user). Tracks exist, decay, cap (`trackCap`) and are read by milestones. Every track stays at level 0 until P16, so a milestone that needs a track level is unreachable before P16. The default `first_protocol` milestone needs no track, so `role` and `rule` are reachable with P15 alone. | **P16** |
| Favour | `Relation.dynamic.favour` (−20…20, decays 1 a day toward 0). P15 moves it from offers (§15.12) and COMPLY / DEFY on her override (+2 / −3). | **P16**: verdicts and moment gaps |
| Her discipline of the commander when a refusal at `role` "triggers her discipline (P16)" | `refusal_noted` bookkeeping on `Relation.dynamic.refusals` (day list); her directive says she will answer it. | **P16** |
| The contest of authority at `rule` (§4 table) | Refusals and DEFY within 14 days count into `contest`. At `TUNING.dynamic.contestAt` (3) she opens a **submit** claim card (R12, `[YIELD] [REFUSE] [TALK]`; `OpenClaim.domainId` absent, `submit: true`). YIELD clears `contest`. REFUSE drops one band and raises the squad's Impunity record toward the commander (+`TUNING.dynamic.contestImpunity` 5 to each unit who `knows_dynamic`). | — |
| Practices in a domain (`body` conditions, `household` protocol, `denial`) | The capability is stored and readable (`capabilitiesOf`); nothing in P15 generates a practice from it. | **P16** |
| `practice_generate`, named postures, the slap, service verdicts | — | **P16 / P16b** |
| The `her_demand`, `her_test`, `permission`, `summons`, `rule_collision`, `ritual_due` moment sources | `compromat_hint` (Task 35) and `her_question` (an `extracted` source; Task 37 makes it ripe for the Regard question) are wired here. The others stay unregistered. | **P16 / P17a / P17e** |
| Staging reactions, P17's suspicion from noise | — | **P17** |
| The position chips `[PROVOKE]`, `[TEST HER]`, `[ANTICIPATE]` (§15.2 "chips such as") | Plan ruling: only `[ASK IN RETURN]` is built, as the offer composer's toggle (R20). The other three need practices to act on, and the spec gives them no effect. | **P16b / P17e** (to confirm with the author) |
| Her handwritten marks on the body map (§15.9 "later") | — | **P10b follow-up** |

### R2. When the dynamic is on, and eligibility

- `dynamicOn(state, reg)`, as in Global Constraints. `practiceCategories(reg): string[]` returns the categories named by `dynamicTracks[].category`, in registry order, unique.
- **Practice of a unit:** `practiceOf(state, reg, unitId): PracticeView | null` is the only reader of `bond.practice` (Task 2).
  - It returns null for a grunt, a non-living unit, or an absent section.
  - A category that is disabled, or is in her `ownLimits.categories`, reads `as: 'none'`, `witness: 'indifferent'`.
  - Drift folds in from `development.practice` (Task 6).
- **Eligible to hold:** `canHold(state, reg, unitId): string | null` returns `null` when eligible, else the reason. It is eligible when all of these hold:
  - `dynamicOn`;
  - `practiceOf` exists;
  - `mayHold(state, unitId) !== 'no'`;
  - inclination `!== 'none'`, or she is seeded;
  - some enabled category has `as ∈ {craves, enjoys}`, or has `tolerates` while her `leadStyle` is `dominant`;
  - `leadRank(leadStyle) ≥ leadRank('assertive')`, or her Impunity `≥ TUNING.dynamic.impunityRoute` (40, `AUTHOR TO TUNE`);
  - the cap is not exceeded. Units at frame ≥ `play` are counted, not counting her; `holders: 'any'` never caps.

  `mayHold` reads `state.dynamic.setup.units[unitId].mayHold ?? 'auto'`. `auto` falls back to inclination: `none` never.
- A unit that stops being eligible keeps her `Relation.dynamic`. Lowering the cap ends nothing (spec §7). Eligibility only gates new probes, offers and milestones out of `equal`.

### R3. Setup and settings

- `CampaignState.dynamic?: DynamicCampaign`:

  ```
  {
    setup: {
      holders: 0 | 1 | 2 | 3 | 'any';
      pace: 'slow' | 'normal' | 'fast';
      frequency: 'rare' | 'normal' | 'often';
      units: { [unitId]: { mayHold?: 'yes'|'no'|'auto'; sensitivity?: 'sluggish'|'normal'|'lively'; seeded?: true; startFrame?: 'play'|'role' } };
    };
    knowledge: { [observerId]: { [holderId]: KnowledgeRecord } };   // R14
    override?: OpenOverride & { unitId: string };                    // R13
    overrideSeq: number;
    oversight?: { blocked: number[]; threadId?: string };             // R16 (days of blocked / cancelled requests)
    queue: string[];                                                  // R9 probe queue (unit ids)
    seq: number;                                                      // ids: claims `dc<n>`, milestones `dm<n>`, offers `do<n>`, aftermaths `da<n>`
    open: { claims: OpenClaim[]; milestones: OpenMilestone[]; returnOffer?: OpenReturn; offers: OpenOffer[] };
  }
  ```
- `SetupResult.dynamic?: { holders; pace; frequency; units: Record<cardRef, {...same as above}> }`.
  - `validateSetup` checks:
    - the cap value;
    - at most `holders` seeds;
    - a seeded unit's profile passes `canHold` minus the cap and dynamic-on checks (`seedProblem`), else the error "cannot hold: <reason>";
    - `startFrame` only on a seeded unit.
  - `buildCampaign` writes `state.dynamic` **only** when `r.dynamic` is present **and** a practice category is enabled. Then it applies seeds after `applyHeadStart` (Task 8).
- **Defaults when the DYNAMIC block is shown:** holders `1` (`AUTHOR TO TUNE`), pace `normal`, frequency `normal`, per unit `auto` / `normal`. A campaign built without the block, or with no practice category, has no `state.dynamic`, so it is off.
- **Actions:**
  - `dynamic/set_setup { holders?, pace?, frequency?, seeds? }` (SYS mid-campaign; creates `state.dynamic` when a practice category is on);
  - `dynamic/set_unit { unitId, mayHold?, sensitivity? }` (the spec's `dynamic/set_may_hold`, widened).

  Seeds changed mid-campaign add the head start once (`seedHold`) and never a frame.
- **Global setting:** `dynamicHidden: boolean` (default false, SYS › Display, `setting_dynamic_hidden`). It is UI only. `Knowledge` reads it, and the analyze answer for hidden parts is `glossary:dynamic_felt` ("you feel it rather than read it").
- **WORLD PARAMETERS › DYNAMIC** (new section after CONTENT, shown only while a practice category is enabled in the wizard):
  - holders; pace; frequency;
  - per unit: may hold (yes / no / auto), sensitivity, seeded, starting frame;
  - "the dynamic is already underway" (only when the head start is > 0; global or per unit).

  SYS › **Dynamic** (a new `h3` after Relationships) shows the same fields, minus the starting frame and the head start option.

### R4. Registries (11) and the closed enums

All 11 are in `REGISTRY_NAMES` (`// P15`) and `DESCRIBED_REGISTRIES`. All except `positionRegions` are `PLAYER_VISIBLE`; region names are her words and reach the player only through her reading (Task 47). `aftermaths` and `dynamicMilestones` may carry `contentTags`. Both join `CONTENT_GATED_REGISTRIES` with `GATE_PROBES` entries.

```
practiceStyles     { id: StyleKey≠neutral, label, description, surfacesWhen: SurfaceCondition[], point: { r, f, motive: Motive, notWith?: 'other_women' } | null,
                     regardForm: string, regardSpeed: 'very_slow'|'slow'|'normal'|'fast', regardFloor: number, regardFactor: number,
                     /* the style's pull on an aftermath is written once, in aftermaths[].weights.styles (fix round 1, M10) */ likesRegion?: RegionRank[], despisesRegion?: RegionRank[] }
holdBands          { id, label, min, max, description }                                    // 5 rows, R8
dynamicFrames      { id: Frame, label, rank, holdFloor, holdCeiling?, refusal: 'minor'|'moderate'|'major'|'contest', outside: 'none'|'scenes'|'all_day'|'domains', description }
dynamicMilestones  { id, from: Frame, to: Frame, requires: { holdBand?, tracks?: Record<trackId, level>, capabilities?: Capability[], categories?: string[],
                     styles?: StyleKey[], romantic?: boolean, coolingDays?: number, formerHolder?: true, noCapability?: Capability },
                     offer: 'booking'|'demand'|'scene'|'automatic', sworn?: true, effects: MilestoneEffect[], text, promptHint, contentTags?, description }
dynamicDomains     { id, label, requires: { frame: Frame, holdBand }, claim: 'demand'|'milestone', grants: Capability[], text, promptHint, description }
dynamicTracks      { id, label, category?: string, thresholds: [n,n,n,n,n], description }    // 10 rows
probeAxes          { id, label, tier: 1|2, promptHint, description }                      // 10 rows
positionRegions    { id, rank: RegionRank, label /* her word */, description }              // 11 rows (incl. cowed)
aftermaths         { id, kind: AftermathKind, label, weights: AftermathWeights, stages: AftermathStage[], contentTags?, chainsTo?: AftermathKind[], description }
regardBands        { id, label, min, max, description }                                   // 5 rows, R18
dynamicSigns       { id, kind: SignKind, amount, instant?: true, closenessOnly?: true, contentTags?, description }   // R14 table as data
```

Closed enums (`src/engine/dynamic/types.ts`):
- `FRAMES` is P15a's, imported.
- `STYLE_KEYS` is P15a's, minus `neutral` for profiles.
- `PRACTICE_AS = ['none','tolerates','enjoys','craves']` and `WITNESS = ['dislikes','indifferent','drawn']`.
- `AUDIENCE = ['private_only','select_few','show_off','indifferent']`.
- `INCLINATION = ['none','latent','curious','eager']` and `MAY_HOLD = ['yes','no','auto']`.
- `FAIRNESS = ['fair','strict','capricious','unfair']`, `HINT_STYLE = ['offers','hints','expects']` and `DRIVE = ['low','moderate','high']`.
- `CAPABILITIES = ['booking_uncapped','book_ahead','body_conditions','device_floor','leash_block','household_protocol','second_place','relation_rules','booking_consent','countermand','co_leader']`.
- `MILESTONE_EFFECTS` (types `frame`, `sworn`, `claim` { capability }, `drop_romance`).
- `SURFACE_CONDITIONS = ['peak','after_defiance','low_stakes_good_mood','before_others','scene_edges','third_person','displeased','new_practice','threat','after_peak_or_wound','stagnation','training_start','praised_or_ignored','crime_mentioned','failed_run','arrival_anniversary']`.
- `MOTIVES = ['order','fear','her','process','gain']`.
- `REGION_RANKS = ['hollow','elusive','cowed','double_game','calculating','bratty','proud','hungry','reluctant','dutiful','devoted']`, in test order.
- `AFTERMATH_KINDS = ['grief','pursuit','blackmail','revenge','command_kept','cold_contempt','return_offer','successor','habits']`.
- `AFTERMATH_EFFECTS` (R15).
- `EXIT_ROUTES = ['abrupt','negotiated','transfer','force']`.
- `SIGN_KINDS` (R14).
- `RESPONSE = ['yielded','deflected','resisted','returned']` (P15a's `RESPONSE_TYPES`) and `TONES` (P15a's).
- `OFFER_TABS = ['part','posture','contact','service','time','role','endurance']`, `OFFER_ANSWERS = ['accepted','corrected','mocked','refused','tonight']` and `KNOWLEDGE_LEVELS = ['suspects_close','suspects_dynamic','knows_dynamic']`.

The core data rows (texts `AUTHOR TO WRITE`, numbers from the spec):
- `practiceStyles`: 11 styles. Their points come from §15.2 and §16.6:
  - `cold`, `ritual`, `drill` → dutiful;
  - `possessive` (with `notWith: 'other_women'`), `affectionate`, `obsessive` (with `notWith: 'other_women'`), `regal` → devoted;
  - `playful` → bratty;
  - `cruel`, `vindictive` → proud / reluctant;
  - `clinical` → null (no point; it values a `sincere` tone).

  The Regard columns come from §16.3 and §16.9. The surfacing conditions come from §15.4 and §16.6.
- `dynamicFrames`: holdFloor `equal` 0, `play` 20, `role` 40, `rule` 60. holdCeiling `equal` 39 (hold never passes *testing* without a milestone). The `refusal` column is from the §4 table.
- `dynamicTracks`: `service`, `humiliation`, `public_humiliation`, `degrading_language`, `pain_rough`, `restraint`, `physical_discipline_shown`, `denial`, `exposure_risk` (each with its own category) and `discipline` (no category). Thresholds 10 / 30 / 60 / 100 / 150 (`AUTHOR TO TUNE`).
- `dynamicDomains`, `requires` → `grants`:

  | domain | requires | grants |
  |---|---|---|
  | `private_time` | `play` + keeping | `booking_uncapped`, `book_ahead` |
  | `body` | `role` + keeping | `body_conditions` |
  | `device` | `role` + owning | `device_floor`, `leash_block` |
  | `household` | `role` + keeping | `household_protocol`, `second_place` |
  | `others` | `role` + owning | `relation_rules`, `booking_consent` |
  | `command` | `role` + owning, `claim: milestone` | `countermand`, `co_leader` |

  All are `claim: demand` except `command`.
- `dynamicMilestones` (R11).
- `aftermaths` (R15).
- `headStartMoments` gains 10 rows tagged `['head_start','probe']`, one per probe axis (R21).

### R5. The practice section (`bond.practice`)

```
Practice {
  categories: Record<categoryId, { as: PracticeAs; witness: Witness }>;
  style: { primary: StyleKey; secondary?: StyleKey };
  audience: Audience;
  inclination: Inclination;
  fairness: Fairness; hintStyle: HintStyle; drive: Drive;
}
```
- `validatePractice(raw, reg, bond): { practice: Practice | undefined; issues: string[] }`. Field by field, like `validateBond`:
  - an unknown category id is dropped (an issue);
  - an illegal enum falls back (`none` / `indifferent` / inclination `none` / fairness `fair` / hintStyle `offers` / drive `moderate`);
  - a `secondary` equal to the `primary` is dropped;
  - a missing `style.primary` → `undefined` (no section: she never holds).

  Limits and disabled categories are **not** stored differently; `practiceOf` reads them as `none` (spec §2). `mayHold` lives in the campaign setup, not in the profile.
- **Import** (`profile_import` section `practice`, budget +300):
  - The prompt names only the **enabled** categories. While none is enabled, the section is not offered.
  - The answer goes through `validatePractice`. An absent section is `missing`, never critical.
- **Edit:**
  - the PRACTICE block in calibration (an `ImportSection`, so it has `[ REGENERATE ]`);
  - the dossier while `!editLock` (action `profile/set_practice { unitId, practice }`).

  A field in `Unit.practiceLocks` (style, audience, fairness, hintStyle, drive, inclination, `categories.<id>`) is never rewritten by re-sync or drift (§16.7 "lockable like the expectation profile").
- **Re-sync:** `RESYNC_SECTIONS` gains `practice` and `expectations`. Locked fields are kept, like temperament.

### R6. The expectation profile (`Unit.expectations`)

```
ExpectationProfile {
  moments?: Record<momentSourceId, { type: ResponseType; strength: 1|2|3 }>;
  offset?: { r: number; f: number };                  // −0.3…0.3, added to her style's point
  tells?: { irritation?: string; pleasure?: string };  // ≤ 80 chars each, no pronoun for the commander
  holdsUntil?: 'signal' | 'limit' | 'blackout';
  worship?: Record<targetId, { attitude: 'craves'|'enjoys'|'indifferent'|'dislikes'; how?: string /* ≤ 60 */; meaning?: 'reward'|'duty'|'humiliation'|'intimacy'|'play'|'comfort' }>;
  body?: Record<targetId, 'proud' | 'ashamed' | 'indifferent'>;
  scent?: { base?: Record<targetId, 1|2|3|4|5>; hygiene?: 'meticulous' | 'normal' | 'lax' };
  build?: { slim: number; athletic: number; curvy: number };   // weights 0–1, for the body map (§15.9); hair 'short'|'bob'|'long'|'tail'
  hair?: 'short' | 'bob' | 'long' | 'tail';
  traits?: string[];                                           // ≤ 6 × ≤ 40 chars
}
Unit.expectationLocks?: string[]   // top-level keys or `worship.<targetId>` / `moments.<sourceId>`
```
- `validateExpectations(raw, reg, unit, state?)`:
  - Unknown source and target ids are dropped.
  - `blackout` is kept, but is honoured only with `breath_play` (P15a `effectiveHoldsUntil`).
  - Worship targets whose `contentTags` are disabled, or in her limits, are dropped (P15a gate).
  - Texts are trimmed and cut, control characters are stripped, and a pronoun for the commander drops the text.
- **Import:** `profile_import` section `expectations` (budget +400, `AUTHOR TO TUNE`). It is offered only while a practice category is on, and the prompt lists the allowed worship targets and moment sources. Spec §15.3 names a site `profile.expectations`. **Ruling:** it is a section of the one `profile_import` call (no second call per card), so it shares `setup.profile_import`, and calibration's `[ REGENERATE ]` reruns just that section.
- **Edit:** the EXPECTATIONS block (calibration; dossier while `!editLock`), with a lock per field. Actions: `profile/set_expectation { unitId, patch }` and `profile/lock_expectation { unitId, field, on }`. A patch that names a locked field throws "That field is locked."
- **In play it is hidden.** A field becomes known to the commander only through a fact tagged `expect:<field>` (`zone_revealed`, her corrections, praise). `Knowledge.dynamic(unitId).expectations` shows only revealed fields.
- **Drift** (spec §15.3: unlocked fields drift through P14b): Task 6 adds axis kind `practice` (keys `practice:<category>.as`, `practice:<category>.witness`, `practice:style.secondary`) and axis kind `expect` (`expect:holds_until`, `expect:worship.any` attitude). Locked fields are `axisForbidden`. `fairness` / `hintStyle` / `drive` never drift (§16.7).
- **Default expectation (no profile value):** per moment, the option whose `type` moves her reading toward her style's point (R10). Ties go to `yielded` at frame ≥ `play`, else `returned` (§15.3).

### R7. The state on the relation

```
Relation.dynamic? {
  hold: number;                      // 0–100
  frame: Frame;                      // 'equal' at creation
  domains: Array<{ id: string; since: number; partialUntil?: number }>;
  tracks: Record<trackId, { xp: number; level: 0|1|2|3|4|5 }>;
  milestones: string[];              // passed, in order
  sworn?: { day: number };
  lastPracticeDay: number;           // P15: the last hold gain from a P15 source or a practice event (`holdFeed`)
  recent: string[];                  // ≤ 8, P16 writes; P15 pushes probe axes and offer kinds
  favour: number;                    // −20…20
  readOf: HerReading;                   // R10
  declared?: { motive: Motive; weight: number; day: number };
  probes: { lastDay?: number; pending?: { axis: string; tier: 1|2; day: number; sceneId?: string }; answers: ResponseType[] /* last 5 */; backoffUntil?: number; issued: number };
  refusals: number[];                // days
  contest: number[];                 // days (rule frame)
  aftermath?: AftermathState;        // R15
  leashBlock?: { since: number; held: number };   // R16
  formerHolder?: { endedDay: number; frame: Frame; sworn: boolean };
  cooldowns: Record<string, number>; // milestone / domain / return ids → day it may come again
}
Relation.regard?: number;            // R18, every named unit while the dynamic is on
Relation.mastery?: Record<targetId, number>;   // R20
```
- `dynamicOf(state, unitId)` reads it. `ensureDynamic(draft, reg, unitId)` creates it, emits `dynamic_started`, and is called only by `addHold` for an eligible unit.
- **Removal:** `forgetDynamic(draft, unitId)` joins the forget steps of `removeFromService` (after `forgetPersonal`) and the dead-unit sweep. It:
  - drops her open claims, milestones and offers and her knowledge rows;
  - closes her override;
  - drops her as a holder of any domain;
  - starts `successor` for no one.

### R8. Hold (spec §4, §15.12)

- **Bands:** interest 0–19, testing 20–39, keeping 40–59, owning 60–79, possessing 80–100. `holdBandOf(hold): bandId`.
- **`addHold(draft, ctx, unitId, base, cause): EngineEvent[]`** is the one writer. It:
  - multiplies `base` by `pace` (×0.7 / ×1 / ×1.4) and, for gains only, by compatibility (R10: ×1.2 close … ×0.8 far, linear on the distance 0…2) and by the romantic tier (`affectionate` / `possessive` primary ×1.2, `cold` ×0.8, else ×1; only while `bondTierOf === 'romantic'`; `AUTHOR TO TUNE`);
  - clamps the result to [frame floor, frame ceiling ?? 100];
  - sets `lastPracticeDay` on a gain;
  - emits `hold_changed { unitId, from, to, cause }` and, across a band, `hold_band_changed`;
  - triggers the domain-loss check (R12).
- **Gains and losses** (`TUNING.dynamic.gains`, keyed by cause):
  - `probe_yielded` +4, `probe_returned` +3 (`playful` / `cruel` primary +5), `probe_deflected` −1, `probe_resisted` −3;
  - `followed_lead` +1, `rule_accepted` +2, `desire_granted` +2 (`AUTHOR TO TUNE`), `offer_*` (R20), `witness_drawn` +5, `successor` +10;
  - `override_comply` +3, `override_defy` −6;
  - `refusal` −4 (her claim, milestone or demand refused, and a `refused_demand` on her), `rule_broken` −5, `overrode_her` −6, `commander_enforced` −10;
  - P16's rows (R1).

  A probe answer is scaled by her sensitivity (×0.5 / ×1 / ×1.6) and `probe_observed` by 0.5.
- **The landing hook:** `registerEventLanded(fn)` in `src/engine/relations/effects.ts` is called at the end of `applyEventToUnit` with `(draft, reg, unitId, event, severity)`. It returns events. It draws nothing, and its registered function returns `[]` while the dynamic is off. `holdFeed` maps relation event types to causes. A `granted_demand` counts only when its template's `kind` is `desire`.
- **The slow term** (day step): +0.5 / day while her Impunity ≥ 40, +0.3 / day while she is the P9b leader (`AUTHOR TO TUNE`). It applies only at frame ≥ `play`.
- **Decay** (B7): after `idleDays` 3 without a gain, −1 / day at `play`, −0.5 at `role`, −0.3 at `rule`, and nothing at `equal` (probing has its own back-off). Never below the frame floor.
- **Seeds:** `seedHold` 25 at build, plus the starting frame's floor if that is higher. A starting frame sets `frame` directly and records the milestone ids on the path (`seeded:<frame>`).

### R9. Probes (spec §15.1, §15.12)

- **Day step:** `probeDayStep` runs after the decay, for each eligible unit in `equal` on interest or testing, not backed off and not already pending. The chance by inclination is `curious` 0.15, `eager` 0.30, `latent` 0.05; a `latent` unit needs a cause (Impunity ≥ 40, or she `knows_dynamic` of a pair with `witness: drawn` on any of its categories). The chance is multiplied by frequency (rare 0.5, normal 1, often 1.6; `AUTHOR TO TUNE`) and by `assertiveness().demandMult`. Then `ctx.rng.chance(p)` decides.
- **The queue:** at most N units probe at once, where N is the cap (`any` → 3). `state.dynamic.queue` holds the ids that have a probe pending or a probe answered in the last 7 days. A unit outside the queue rolls only while the queue has room. A unit leaves the queue when she backs off, reaches `play`, or has no probe for 14 days.
- **The axis** is hashed (`dynamicHash(…, 'probe_axis')`) over the `probeAxes` whose tier ≤ the band tier (tier 1 on interest, 2 on testing), skipping the last 3 axes in `recent`. Emits `probe_issued { unitId, axis, tier }`. At most one probe a day and one a scene.
- **The directive:** `dynamic:probe:<unitId>` (`scene`), set while a scene or DM with her is open and the probe is pending: "In this scene {name} tests, small and deniable, whether the commander yields on {axis label}; never name it." The probe stays pending until answered or for 3 days.
- **The answer:** intent `probe_answered { response, tone?, axis? }`, offered only while a present unit has a pending probe; it closes the probe. Intent `probe_observed { response, tone? }` is offered while a present eligible unit is in `equal` with a dominant or assertive lead style; it weighs 0.5 and does not close a probe. Both feed hold (R8) and the reading (R10).
- **Back-off:** 3 `deflected` / `resisted` among the last 5 answers → `backoffUntil = day + 14` (`TUNING.dynamic.backoffDays`). She leaves the queue and emits `probe_backoff`. Her directive's attitude then turns to respect, hurt or rivalry by style (a line only; P17a owns rivalry).

### R10. Her reading of the commander's position (spec §15.2, §16.4)

```
HerReading { r: number /* −1…1 */; f: number /* −1…1 */; p: number /* 0–1 */; motive: Record<Motive, number> /* sums to 1 */;
          flat: number; deflect: number; region: RegionRank; pending?: { region: RegionRank; count: number }; updates: number }
```
- **Updates:** `updateReading(rel, sample, weight, style)`. A sample is a response (`yielded` r+1, `resisted` r−1 f+0.5, `returned` f+1 and p↑, `deflected` deflect↑) with a tone (`flat` → flat↑; `transactional` → gain; `sincere` on duty → order; after a threat in the same exchange → fear).
  - The moving average uses α = probe 0.10, moment 0.15, practice 0.20, motive 0.15 (`TUNING.position`).
  - Moment answers feed it through `registerAfterAction`. Task 15 extends `AfterAction` with an optional third parameter, the events of the action, and reads `moment_answered` (`responseType`, `tone`) for units with a dynamic. **No hold moves from a moment** (user R1: only the spec's sources).
- **Misreading by style:**
  - `clinical` reads exactly;
  - `possessive` and `obsessive` add +0.1 toward `her` in every motive update;
  - `cruel` and `vindictive` add −0.1 r;
  - P14b insight `low` doubles the bias.

  It is deterministic: no draw.
- **The region:** `regionOf(reading)` uses §15.2's table with `cowed` after `elusive` (§16.4). `m.dynamic` is `max(order, process)`; `dutiful` needs `order` largest, `hungry` needs `process` largest. Hysteresis: a new region counts after 3 updates in a row (`pending`). Emits `position_shifted { unitId, from, to }`.
- **Declarations:** action `dynamic/declare { unitId, motive }` (from the milestone conversation, or later from P17e's question) sets `declared`. Its weight starts at 0.5 and fades 0.05 a day. While its weight is > 0, the motive average is blended with it.
- **Her point and compatibility:** her point is her style's `point` + `expectations.offset` (`clinical`: none, compatibility 1 + 0.2 × sincere share − 0.2 × (double game or hollow)). Compatibility is `1.2 − 0.2 × distance(r, f)` clamped to [0.8, 1.2]. `notWith: 'other_women'` subtracts 0.1 per other unit at bond tier `romantic`.
- **The P15a hooks** (installed by `installDynamicHooks`, each answering only while `dynamicOn` and she has a dynamic):
  - `registerFrameReader` → `rel.dynamic.frame`;
  - `registerBlockingGate` → some present unit at frame ≥ `play`;
  - `registerPhysicsStyle` → `{ primary, secondary, phaseLead }`, where `phaseLead` is `secondary` while one of the secondary style's `surfacesWhen` holds (`surfaceHolds(state, reg, unitId, cond)`, Task 16) or, for `cruel`, `drill` and `vindictive` secondaries, in the peak phase;
  - `registerHoldsUntil` → `expectations.holdsUntil`;
  - `registerExpectation` → her profile value for the moment's source (by `type` among the moment's options), else the default of R6.

  All readers are pure, and registering twice is harmless (same answer), so tests may reinstall after a reset.

### R11. Milestones and frames (spec §4)

- **Rows** (`dynamicMilestones`; texts `AUTHOR TO WRITE`):

  | id | from → to | requires | offer | effects |
  |---|---|---|---|---|
  | `first_yes` | equal → play | testing | scene | frame |
  | `first_protocol` | play → role | keeping | booking | frame |
  | `first_night_held` | role → role | keeping, `restraint` track ≥ 1, category `restraint` | booking | — (marks the path) |
  | `vow` | role → role | owning | scene | sworn |
  | `handover` | role → rule | owning, styles any | scene | frame, `claim countermand` |
  | `private_rule` | role → rule | possessing, capabilities `book_ahead`, `body_conditions`, `household_protocol` | demand | frame (user R: `rule` without command) |
  | `cooling` | role → play | `coolingDays` 21 since `lastPracticeDay` | automatic | frame |
  | `command_lost` | rule → role | `noCapability: countermand` and the `private_rule` requires not met | automatic | frame |
  | `rekindle` | equal → play | `formerHolder`, a return offer accepted | automatic | frame |

- **Checks:** `milestonesDue(state, reg, unitId)` runs at day end and after `hold_changed`. An `automatic` milestone applies at once (`frame_changed`). Any other one opens `OpenMilestone { id, unitId, milestoneId, day, form }` (one open per unit) and emits `milestone_offered`:
  - a `booking` form books her next free evening (`book`, source `milestone`; `BookingSource` gains it), and the scene of that booking carries the milestone line;
  - a `demand` form shows a card in her voice;
  - a `scene` form is a line in `dynamic:<unitId>` in her next scene with the commander.
- **Answers:** a card (`dynamic/answer_milestone { milestoneId, answer: 'accept'|'refuse' }`) or the intents `milestone_accepted` / `milestone_refused { milestoneId }`. The intents are offered only while that unit's milestone is open and she is present. Accept applies `effects` (no hold gain, user R1). Refuse costs one band (−20, never below the floor) plus a cooldown of 7 days (`AUTHOR TO TUNE`).
- **The vow:** `sworn` is set and `sworn` is emitted. After it, every exit is a **break** (R15).
- **Frame-dependent refusal:** a refusal of her (claim, demand or milestone) costs per the frame's `refusal` column:
  - `minor` at `play`: hold −2 only;
  - `moderate` at `role`: −4 and `refusal_noted`;
  - `contest` at `rule`: −4, plus R1's contest.

### R12. Domains and capabilities (spec §5)

- **Claims:** `claimsDue` runs at day end for each holder whose frame and band meet a `claim: demand` domain she does not hold and that is not on cooldown. It draws `chance(TUNING.dynamic.claimChance 0.2 × frequency)` only when one is due, and opens `OpenClaim { id, unitId, domainId, day }` (one open per unit), emitting `domain_claimed`.
- **The card** is in her voice: `[YIELD] [REFUSE] [TALK]` (`dynamic/answer_claim { claimId, answer }`).
  - YIELD adds the domain and emits `domain_yielded`.
  - REFUSE costs per R11 and emits `domain_refused`, with a 7-day cooldown.
  - TALK opens a one-to-one scene with her. Its `compromise_reached { claimId }` yields the domain with `partialUntil = day + 7`, after which she claims again. If the scene ends with no compromise, the claim stays open.

  `compromise_reached` gains an optional `claimId`, offered only while a claim is open.
- **Losing a domain:** a domain is lost when hold falls below its band (immediately, `domain_lost { reason: 'band' }`), at exit (`exit`), or by force (`force`).
- **One domain, one holder:** a claim of a domain another holder holds is a **conflict**. `settleDomainConflict` uses P9c's order (attachment + lead rank, then Impunity, then squad order; the `settleWinner` logic, exported from `bookings.ts` as `settleOrder`). The loser loses 10 hold, and the winner keeps or takes the domain (`domain_contested`).
- **Readers:**
  - `capabilitiesOf(state, reg, unitId): Capability[]`;
  - `holderWith(state, reg, cap): string | null` (the first in squad order);
  - `hasCapability(state, reg, unitId, cap)`.

  Code never reads a domain id.
- **Wiring in P15** (each reader is a no-op without the capability):
  - `booking_uncapped` / `book_ahead`: `rollBookings` skips her weekly cap, and she may book up to 3 days ahead (`TUNING.dynamic.bookAhead`).
  - `device_floor`: `deviceAccess` returns `max(level, 4)` for her (a derived floor, nothing stored; `deviceGateReason` is still required).
  - `second_place`: `whereaboutAt` may place the commander in her quarters on the evenings she books (derived).
  - `relation_rules`: her rule offers may use templates tagged `jealousy_games` or `service`.
  - `booking_consent`: another holder's booking is held for her consent; it is auto-granted unless her style is `possessive` or `obsessive`, in which case it is refused, with a fact for both.
  - `body_conditions` / `household_protocol`: stored only (P16); her directive names them.
  - `countermand`: R13.
  - `co_leader`: `standingOf` adds `TUNING.dynamic.coLeaderStanding` (15) to her standing, and the hierarchy line reads "co-leader".
  - `leash_block`: R16.

### R13. The command domain: P13's override generalised (user)

- `OverrideSource.kind` becomes `'warden' | 'holder'`. `holderSource(state, reg, unitId)` returns:
  - `authority = hold / 100`;
  - `leniency = 1 − 0.5 · max(0, affinity) / 100`;
  - `expectations = holderAgenda(state, reg, unitId)`. This is P13's `fallbackAgenda` over her values, with `keep_me_close` and `no_romance_with_others` added at the top weight when her primary style is `possessive` or `obsessive`. All are `known: true`.

  The chance is the same formula: `clamp(weight × authority × leniency × 2.0, 0, 0.9)`.
- **`conflictOf(state, reg, order, judged?, source?)`** takes the source's expectations and unit (default: the warden, as today). `herAlternative` takes the source too.
- **The slot:** a holder's open override lives in `state.dynamic.override` (with `unitId`). The warden's stays in `leashswap.warden.override`, so P13 saves are untouched. `overrideOpen(state)` returns whichever one is open, and **one is open at a time** (user): `rollOverride` throws `OPEN_FIRST` while either is open.
- **Order at each hook** (activity, roster, expedition, dilemma, combat order): the warden rolls first, as today. If she did not override, each holder with `countermand` rolls in descending hold. `rollOverride(draft, ctx, order, { source })` writes to the source's slot. A roll draws only when a conflict exists for that source.
- **Answers:** `warden/answer` keeps its payload and routes by the open override's source.
  - For a holder: COMPLY gives hold +3 and favour +2.
  - DEFY runs the order, then hold −6, favour −3, the `overrode_her` relation event, and R11's contest at `rule`.
  - ARGUE is P13's (a scene with her, `compromise_reached { overrideId }`).

  `punishRoll` and satisfaction run only for the warden.
- **The chip:** `renderOverrideChip` shows `{NAME} OVERRIDES — {alternative}` for a holder (`glossary:holder_override`) and P13's text for the warden.
- **P9b:** `co_leader` (R12). The directive `dynamic:command:<unitId>` goes to the other present squad members: "{name} gives the orders now; the squad starts to address her as the one in command." The commander's own Leash is untouched (it stays P13's).

### R14. How the squad learns (spec §15.13, §8)

- `KnowledgeRecord { suspicion: number; level?: KnowledgeLevel; levelDay?: number; peakDay?: number }`, stored in `state.dynamic.knowledge[observer][holder]`. Only named, living units other than the holder are observers.
- **Instant 100** (`dynamicSigns` with `instant`):
  - an item with `scope: dynamic` worn by the commander while she is present (P15a `blocking_changed`);
  - a dynamic-scope contact while she is present or walks in (a `visitor` moment);
  - the holder tells her (`audience` `select_few` / `show_off`; a day-step hash per pair, 1 in 7 days for `select_few` toward friends, the leader and units with Affinity ≥ 50 toward the holder; every week to everyone for `show_off`);
  - she is shown compromat.

  The P16 / P17 instant signs (demonstration, exposed staging) are reserved rows with no producer.
- **Signs** (the §15.13 table) are `dynamicSigns` rows read by `kind`:
  - `protocol_public` 20, from the intent `protocol_slip` with others present, or a P16 event;
  - `protocol_slip` 20 (the intent);
  - `held_night` 5, to everyone at base (P15: a milestone booking that was played);
  - `leaving_quarters` 5 (P15: `second_place` evenings);
  - background per day 3 at `role`, 6 at `rule`;
  - gossip 5 per observer who knows and 2 per observer who suspects, cap 15 a day;
  - the rest (`step_behind`, `kneeling_at_door`, `her_marks`, `remote_toy`, territory marking) are rows with no producer yet.

  The closeness-only signs give `suspects_close` and +0 suspicion.
- **Multipliers:**
  - insight `low` ×0.7, `mid` ×1, `high` ×1.3;
  - close to the pair (Trust or Affinity ≥ 50 toward the holder, or toward the commander) ×1.5;
  - `show_off` ×1.5, `private_only` ×0.5;
  - nothing at `play` from the background term.
- **Levels and decay:** at 60 she `suspects_dynamic`, at 100 she `knows_dynamic`. Suspicion falls 2 a day without new signs, never below 60 within 7 days of reaching it. Each level writes a fact at its site (`suspects_close:<holderId>`, `suspects_dynamic:<holderId>`, `knows_dynamic:<holderId>`, `hiddenFromCommander: true`, `about [observer, holder]`) and emits `dynamic_known { observerId, holderId, level }`. The fact turns known to the commander when she shows it: a `Knowledge` rule reveals it once the observer and the commander have shared a scene or a DM after the fact's day (Task 27). No new intent is needed for that.
- **Reactions at `knows_dynamic`** (`reactToDynamic`), by her `witness` on the holder's leading tracks' categories, else `indifferent`:
  - `drawn`: if she is eligible, `addHold(+5, 'witness_drawn')` on her own dynamic (capped by R2);
  - `indifferent`: the fact only;
  - `dislikes`: the Impunity term `dynamic` (+5, `AUTHOR TO TUNE`; spec §8), a P9b standing malus to the holder (−5), and a hashed 1-in-3 chance of a P9 demand (`interpersonal`) about it;
  - another holder: `ritual` / `cold` respect it (a fact); `possessive` / `cruel` compete (a domain claim against the holder's strongest domain, R12 conflict);
  - the leader: `co_leader` already covers `rule`; below it, a fact.
- **Outside the squad:** nothing in P15 (only `public_humiliation` events, which are P16).

### R15. Exit and aftermaths (spec §9)

- **`dynamic/exit { unitId, route }`** (`EXIT_ROUTES`), allowed whenever she has a dynamic at frame ≥ `play`.
  - **Cost:** a relation event `dynamic_exit` (engine type) whose severity is `exitSeverity(dyn)`:
    - `minor` at `play` with hold < 40 ("nearly free");
    - else one step up per frame above `play`, per 2 domains and for `sworn`;
    - `sworn` is a **break** (`extreme`, and a pinned fact of importance 5, `defining`).
  - Routes:
    - `abrupt`: the cost.
    - `negotiated`: opens a scene with her. `compromise_reached { exitId }` gives a **clean exit**: severity one step down, and the aftermath picked from the mild end (`grief`, `return_offer`, `habits` only). With no compromise the exit stays pending, and ABRUPT is offered on the card.
    - `transfer { toUnitId }`: another holder claims the commander. It runs a R12 conflict between them; the winner becomes the holder of the loser's domains, and the loser gets an aftermath.
    - `force { means: 'discipline'|'leash'|'transfer_request' }`: the means is run first through its own action (P9 `discipline/punish`, P6 Leash, or the oversight request of R16). Then the cost is two steps up, every aftermath weight is ×1.5, and if the means was the Leash, her memory of being forced (P6) follows.
  - Every domain is dropped (`domain_lost { reason: 'exit' }`) except `countermand`, which starts `command_kept` (it does not return).
  - The romance steps down one state (R17).
  - `formerHolder` is set, the dynamic is reset to `equal` / hold 0 / no domains (tracks are kept), and `dynamic_exit` is emitted.
- **Aftermaths** (`aftermaths` registry): `pickAftermath(state, reg, unitId, ctx)`.
  - The weights are read from the row's `weights`, by style (primary ×1, secondary ×0.5), values, Regard band (R18: low → `cold_contempt` and `blackmail` ×1.5; high → `return_offer` and `grief` ×1.5), frame, sworn, `command` held (forces `command_kept`) and her compromat count (`blackmail` needs ≥ 1).
  - It picks once with `ctx.rng` (one draw) and sets `aftermath { id, kind, stage, untilDay, chain? }`, emitting `aftermath_started`.
- **Stages:** `stages[] { days, effects: AftermathEffect[], directive, notice }`. `AFTERMATH_EFFECTS`:
  - `stress { amount }`, `want { amount }`, `night_knock`;
  - `demand { kind }` (P9 `openDemand` with that template kind; `desire` for grief);
  - `booking` (pursuit: she keeps booking as before);
  - `rule_interfere` (pursuit: `relation_rules` behave as if held);
  - `threaten_tell { audience: 'squad'|'outside' }` (blackmail: a P9 demand whose refuse writes the compromat fact `knownBy` the squad; with `audience: 'outside'` and `public_humiliation` enabled, the fact also gets `spread: 'fast'` as a P3b rumor. P9b outside perception is not touched: P15 has no `public_humiliation` event, spec §8 / B4);
  - `rumor` (revenge: a P3b rumor fact);
  - `squad_impunity { amount }` (revenge: the Impunity record of units who `knows_dynamic` +);
  - `vote_sabotage` (revenge, command_kept: in P9b ballots she votes against the commander's side and adds her standing to it);
  - `defiance` (cold_contempt: P6 / P9 path, `defied` relation event, moderate);
  - `trust { amount }`;
  - `return_offer` (R15b);
  - `successor` (R15c);
  - `protocol_slips { days }` (habits: `protocol_slip` is offered to the extractor with others present).

  The day step advances the stages. An aftermath ends at its last stage's end (`aftermath_ended { reason: 'time' }`), by resolution (`return_offer` answered, `command_kept` won or lost), or by a return (`rekindle`). `chainsTo` picks the next one (pursuit → blackmail) with one more draw.
- **R15a, `command_kept`:**
  - She keeps `co_leader` and `countermand` (her override keeps rolling) until the struggle is decided.
  - Every P9b vote counts her standing for her side.
  - The commander wins command back when a vote passes against her side twice (`TUNING.dynamic.commandBackVotes` 2), when a P9 `enforce` of severity ≥ 3 lands on her, or through the Leash on her (`force`). Each of these emits `aftermath_ended { reason: 'resolved' }` and `domain_lost`.
  - `registerVoteGate` is not needed: her presence in existing gated votes is the struggle (`TUNING.dynamic.commandKeptVoteWeight`).
- **R15b, `return_offer`:** opens `OpenReturn { unitId, terms: 'lower_band' | 'after_punishment' }` with a card (`dynamic/answer_return { answer }`).
  - Accept → `rekindle` at the `testing` band, or (`after_punishment`) at `keeping` with `refusal_noted` for P16.
  - Refuse ends it.
- **R15c, `successor`:** the eligible unit with the highest hold, other than the former holder, gets +10 and `probe` priority (she joins the queue first). It is a squad reaction picked by the day step, not by the former holder's weights.

### R16. The Leash block, bypasses and oversight (spec §10)

- **The block:** a holder with `leash_block` and hold ≥ owning holds every `leash/*` request filed from the PDA, on anyone.
  - `leashBlockOf(state, reg): unitId | null`.
  - The hook is a new step in `askWarden` (actions/leash.ts), generalised as `cosignHolders`: P13's `rollCosign` runs for the warden as today, then the holder's block.
  - The holder co-signs with `blockCosignChance` = 0.2 + 0.3 × favour/20 (clamped 0…0.5; `AUTHOR TO TUNE`), drawn only when a block exists. On a refusal the request is cancelled, `logCosignDenied` writes `cc: <holderId>` (`LeashLogEntry.cc` widened to a unit id), and `leash_blocked` is emitted.
  - The P9c intercept stays as is. The block applies to PDA requests and combat compels alike.
- **Bypasses:** `dynamic/bypass_leash { route, allyId? }`, each a defiance toward her (`overrode_her`, major, if discovered) with a discovery roll (one draw):
  - `comms`: the comms room terminal, an activity variant `comms` `focus: 'leash_terminal'` that costs the slot; discovery 0.3.
  - `reset`: a workshop task with a technically able ally (role or defect field `tech`, P13's); discovery 0.2, 0.1 with the ally's `tech`.
  - `ally`: another soldier files through her own channel; discovery 0.4 × the holder's insight multiplier, and the ally's Trust −5 if discovered.

  A successful bypass files the request normally (P6 flow, no block for that one request) and emits `leash_bypassed { route, discovered }`.
- **Oversight:** each blocked or cancelled request pushes its day into `state.dynamic.oversight.blocked`.
  - Three within 14 days (`AUTHOR TO TUNE`) advance the engine clock `oversight_inquiry` (6 segments, `visibleToPlayer: true`) by 1 and clear the window.
  - The first advance creates a thread directly: `threads.push`, the precedent being P13's investigation, with `title` from the registry text and status `active`. It also emits `oversight_inquiry { stage }`.
  - At 3 and 5 segments a P5 notice runs (a toast in the `corporate` voice) and a `world` fact.
  - On fill, oversight acts on her (a hashed pick): a reprimand (her stress +15 and hold −10), a transfer threat (an aftermath-like stage `transfer_threat` for 7 days; if she does not lift the block, `removeFromService(…, 'reassigned')`), or a forced Leash on her (a P6 compel record with `cc: 'oversight'`, which counts as the `force` exit).
  - The holder's **cover** (R19) slows the clock.

### R17. The dynamic and the relationship (spec §15.6)

- `relationshipStates` gains an optional `stepDown?: stateId` (refs-checked, same `group` or lower):
  - `devoted` → `lover`, `lover` → `flirting`, `fwb` → `flirting`;
  - `secret_affair` → `flirting`, keeping the affair's concealment;
  - every other romantic state → itself (never to zero).
- `romanceStepDown(draft, reg, unitId)` uses `enterState` and `syncPublicity`. It runs on `dynamic_exit`.
- A broken romance does not end the dynamic: nothing in P15 reads `break_up` for the dynamic.
- Romantic tier speed: R8.

### R18. Regard (spec §16.3, §16.9)

- **Who:** `Relation.regard` for every named living unit, written only while `dynamicOn`. The start value is computed once, at first read, by `regardStart`:
  - 50;
  - + the first-impression offset (P7 `impressionOf` presence × her tastes, ×0.5, clamped ±15);
  - − 10 when she `knows_crime` and the crime's `valueReactions` are negative for her.

  Bands: esteem 80+, respect 60–79, neutral 40–59, low 20–39, none < 20.
- **Falls** (`regardFall(draft, reg, unitId, humiliation 0–5, { witness })`): `humiliation × 1.5 × style.regardFactor × speed × (witness ? 0.7 : 1)`, down to the style's floor. Speed is `very_slow` 0.4, `slow` 0.7, `normal` 1, `fast` 1.3 (`AUTHOR TO TUNE`; the spec gives only the words). A non-holder uses her own primary style's row if she has a practice section, else factor 1.0, speed `normal`, floor 0. Producers in P15:
  - an offer accepted (the target's or the posture's humiliation: worship targets 2, kneeling postures 3, endurance 3; `AUTHOR TO TUNE`), for her and for every present witness;
  - a protocol slip seen (1, for the witnesses);
  - the Leash bypass discovered (2, for her);
  - `physics_caught` (the cheat costs 2, for her);
  - `physics_slip` (1).
- **Rises** (`regardRise(draft, reg, unitId, kind)`):
  - `cost` +3: an act after her reading's r ≤ 0;
  - `record` +2: P15a `marathon_done`;
  - `pleased_high` +1: P16, reserved;
  - `dignity` +2: a hold that ended `released` or `checked` with no slip and no cheat;
  - `value` +1…+4: a run won under the commander's orders +2, a P9b feat +3, a finished quiet meeting `time_together` +1, a kept promise +2 (`kept_promise`), help with her goal +4 (reserved).

  `drill` doubles mastery rises, `regal` doubles praise kept (reserved), and `vindictive` +1 per 7 days served without a slip (day step).
- **Effects:**
  - the tone word in `dynamic:<unitId>` and in every named unit's block (`regardTone(state, reg, unitId)` → the style's `regardForm` at low and none, else nothing);
  - aftermath weights (R15);
  - witness reactions (R14 `dislikes` at low or none ×1.5);
  - the shame mechanisms (R19b);
  - the nickname tone.

  **Regard never changes hold or frames.**
- Events: `regard_changed` (bookkeeping) and `regard_band_changed`. Hidden everywhere (a sentinel); immersive mode hides even the analyze text.

### R19. Exchange with combat and the squad (spec §15.5, §15.12)

- **Her satisfaction** (`satisfactionOf`):
  - `content`: favour ≥ 5 and Want band ≤ restless;
  - `frustrated`: favour ≤ −5, Want ≥ aching, or a refusal within 2 days;
  - else `neutral`.
- **Combat** (there is no hit chance in the combat engine): `content` is `outgoing +5` and `incoming −5` pct; `frustrated` is `outgoing −5` and `incoming +5`. It goes through the new `registerCombatPassive(fn)` in `combat/build.ts`, added in `squadCombatant` as source `dynamic`.
- **Protection:** in `impunityOf`, term `dynamic` for a unit **other than** a holder = (that unit's `dislikes` reaction, R14) − `min(0.30, maxHolderStanding × 0.003)` × (the positive sum of the other terms). Holder standing comes from P9b `standingOf`.
- **Cover:** the P13 `addSuspicion` noise, P12's debts `oversightSuspicion` gains and the `oversight_inquiry` advance are multiplied by `coverMult(state, reg)`:
  - −20 % with a holder at `role`, −35 % at `rule`;
  - `cruel` gives half the cover;
  - the strongest holder counts.

  It is one reader, called at those three sites.
- **Squad stress** (day step, every 2 days): `content` → −1 stress to units with Trust ≥ 50 toward her; `frustrated` → +1.
- **`drive` and Want (§16.7):** while `dynamicOn` and she has a practice section, P9d's `wantStep` growth is multiplied by:
  - `drive` (`low` 0.7, `moderate` 1, `high` 1.4);
  - a hashed noise `1 ± 0.2` (`dynamicHash(…, 'want')`), doubled for `volatility: moody` (P14c `temperamentOf`);
  - ×1.3 on a day she has jealousy (another holder's booking with the commander, or a `rival_favoured` event on her) or `content` mood;
  - ×0.7 at stress ≥ 70, while injured, or on a day she lost a run.

  Want falls after relief as today. All numbers are `AUTHOR TO TUNE`. Without a practice section, or with the dynamic off, `wantStep` is unchanged.

### R19b. Shame without a narrator (spec §16.5)

- **Disappointment:** a named non-holder whose Trust was ≥ 60 and whose Regard fell across a band within 14 days. It emits `disappointed { unitId }` and writes a memory fact (`hiddenFromCommander`, audience her, importance 3). Her P14b habits tagged `respect` lapse (`development.habits` paused 14 days). Her directive line in scenes with both says she addresses the holder rather than the commander, with no lecture.
- **The question:** `registerMomentTrigger` is not needed (the source is `extracted`). The engine marks `her_question` **ripe** for her (`ripeSources` gains a P15 provider, `registerRipeSource(fn)`, Task 37) when her Regard is falling but above `none`, or she `knows_dynamic` with `witness: dislikes`. Cooldown 14 days per woman and at most one a week overall. Her Regard moves by the answer key, per her profile: `clinical` +2 for the honest key 0, `affectionate` +2 for the gentle key 1, others ±0 (`AUTHOR TO TUNE`). Event `regard_question_asked`.
- **The nickname:** `DEED_COUNTERS` gains `protocol_public`, `spoken_for`, `public_worship`, `knelt_at_door`, `slapped_public` and `demonstrated` (P15 counts `protocol_public` and `spoken_for`; the rest are P16's). `reputations` gains 3 rows (`AUTHOR TO WRITE` names) with `pattern.sum` over them and `tone: 'respectful'|'mocking'|'pitying'` (new optional field). `reputationDayStep` picks the row whose tone matches the squad's average Regard (≥ 60 respectful, 30–59 pitying, < 30 mocking). The nickname still reaches directives only through P9's existing path.

### R20. Offering, mastery, mood reading, the body map (spec §15.7–§15.10)

- **`dynamic/offer { unitId, composition }`** (`composition: { tab: OfferTab; ids: string[] }[]`, 1–2 entries).
  - Allowed only while a scene or DM with her is open and `canHold` (or she is already at ≥ `play`). With the cap reached and she not a holder, she refuses kindly.
  - The entries are filtered by `entryAllowed`, scope, her limits, `mobilityOf`, and the items the commander has.
- **Her answer** (`answerOffer`, deterministic given the profile; no draw):
  - the worship target's attitude, else the posture's or contact's track category `as`;
  - `craves` → accepted, hold +6, favour +3;
  - `enjoys` → accepted, +3 / +1;
  - `indifferent` → `tonight` (her style `cold` / `ritual`) or accepted 0 / 0;
  - `dislikes` → `mocked` (`cruel`, `cold` and `playful` with `humor` `mocking`) or `refused`, −3 / −2;
  - unknown → `corrected`: the zone is revealed (`zone_revealed`, a fact tagged `expect:worship.<target>`), and she names the target she craves if one is known to her.

  Good timing (her satisfaction `content` and no refusal today) ×1.5; her irritation (`frustrated`) ×0.5. The **position** moves: unasked → r +0.1 and `her` or `process` (by tab); with conditions (an `[ASK IN RETURN]` toggle) → `gain`.
- **Before others** the offer is a demonstration: P16's, so P15 writes only a fact for the witnesses plus R14's `protocol_public`. An accepted offer of `time` or a `part` while her frame is ≥ `role` becomes a claim with chance 0.4 (one draw) of the domain that grants `book_ahead` (time) or `body_conditions` (part).
- **The model side:** the offer goes into the scene as the commander's act (`scene/stage` note) with the directive `dynamic:offer:<unitId>` (`next_reply`), carrying her answer. The intent `offer_answered { offerId, answer, correction? }` is offered while an offer is open. **The engine's answer stands** (the intent only confirms and carries `correction` text into a fact); a mismatch is dropped.
- **Mastery:** `Relation.mastery[targetId]`:
  - +5 per act on the target (P15a `physics_outcome` of a contact with `target`, and a mouth act on it);
  - +3 more when her `how` for that target is set and the act's interaction matched (P15a's `resolveSegment` result `matched`; `AUTHOR TO TUNE`);
  - levels at 20 / 60 / 120 / 200 / 320;
  - `mastery_gained { unitId, targetId, level }`.

  The offer hit rate uses it: unknown at mastery ≥ 2 reveals without the `corrected` answer. The service verdict step is P16's.
- **Mood reading:** `moodSigns(state, reg, unitId)` returns her tells (revealed fields only), her satisfaction word if the commander shared a scene with her today, and the length of her last replies (from the scene's reply lengths, if stored, else nothing). `Knowledge.dynamic(…).signs` shows them, with no meter.
- **The body map** (Task 43): an inline SVG renderer, `src/ui/dynamic/bodyMap.ts`, ported from `docs/drafts/bodymap/gen.js` and `builds.js` (Catmull-Rom outline, three builds blended by `expectations.build`, four hair variants).
  - Zones come from `worshipTargets[].zone`, front and back. Explicit zones show only with `explicit_scenes`.
  - Each zone shows a grey "?" while unrevealed, the attitude colour once revealed (a fact), mastery dots, scent hatching (P15a `scentBand`), and the meaning icon.
  - Hover opens analyze (`worshipTargets:<id>` with the revealing facts).
  - Below it is a list per zone. Readable mode shows only the list. No `url(` and no network.

### R21. Head start: the dynamic already underway (spec §15.14)

- The default is unchanged: hold 0, no probes behind the scenes, no reading. `pickMoments` still excludes `probe`-tagged rows.
- With `SetupResult.headStart.dynamicUnderway` (`true` or a card list) and `state.dynamic` on, `applyDynamicHeadStart` runs after `applyHeadStart`. For each eligible named unit:
  - n = `round(N × daily chance)` probes (no draw: `headStartHash` keys `probe:<i>` pick the response from the neutral spread yielded 0.4 / returned 0.2 / deflected 0.3 / resisted 0.1);
  - hold and the reading move exactly as live answers would, capped inside *testing*;
  - she joins the queue first;
  - back-off does not count these answers.
- **Recap moments:** at most one probe moment per such unit: `pickProbeMoment(reg, unit, hash)` over the `probe` rows whose axis tier fits. It is added to that unit's recap pairs, so the existing `head_start_recap` call and `head_start/recap` action write it under the `head_start_moment` rule (audience = the pair). Nothing new is remembered.
- A seeded unit with a starting frame keeps it; the option adds only the probing history.

### R22. Intents, events, actions

- **Intents** (`EVENT_TYPES` grows from 45 to 52; `eventDeltas` rows for each, with `cause`):

  | intent | offered while |
  |---|---|
  | `probe_answered` `{ response, tone?, axis? }` | a present unit has a pending probe |
  | `probe_observed` `{ response, tone? }` | a present eligible unit is in `equal` with lead style ≥ assertive |
  | `milestone_accepted` / `milestone_refused` `{ milestoneId }` | her milestone is open and she is present |
  | `compromat_mentioned` `{ factId?, summary }` | a present holder holds compromat |
  | `protocol_slip` | a present unit's dynamic is at ≥ `role` (or an aftermath `habits` stage) **and** another unit is present |
  | `offer_answered` `{ offerId, answer, correction? }` | an offer is open |

  `compromise_reached` gains `claimId?` and `exitId?` (offered while open). `EventIntent` gains `response?`, `tone?`, `axis?`, `milestoneId?`, `claimId?`, `exitId?`, `offerId?`, `answer?`, `correction?` and `summary?`. `validateIntents` gains the option `dynamic?: DynamicOffer` (`{ types, probes, milestones, claims, exits, offers, compromat }`) and drops any type, or id, not offered. Builder: `dynamicIntentInput(state, reg, participants, channel)`. Applier: `applyDynamicIntent(draft, ctx, unitId, ev)`, routed in `applyIntents` like `applyLifeIntent`.
- **The prompt:**
  - `IntentExtractInput.dynamic?` adds its rule lines and a `DYNAMIC` block (pending probe axes as words, open milestone ids with their labels, open claim and exit ids, open offer ids, `HOLDER COMPROMAT` count only).
  - Absent, it adds zero bytes (pinned fixture).
- **Engine events** (all in `RESERVED_EVENT_TYPES`):
  - `dynamic_started`, `hold_changed`, `hold_band_changed`, `frame_changed`;
  - `domain_claimed`, `domain_yielded`, `domain_refused`, `domain_lost`, `domain_contested`;
  - `milestone_offered`, `sworn`, `refusal_noted`, `dynamic_exit`, `aftermath_started`, `aftermath_ended`;
  - `leash_blocked`, `leash_bypassed`, `oversight_inquiry`, `dynamic_known`;
  - `probe_issued`, `probe_backoff`, `position_shifted`, `offer_made`, `zone_revealed`, `mastery_gained`;
  - `regard_changed`, `regard_band_changed`, `disappointed`, `regard_question_asked`.

  The spec's `nickname_given` is P9's existing `reputation_*` event and gets no new type. The relation event `dynamic_exit` is in `ENGINE_EVENT_TYPES`, with its `eventDeltas` row (minor −2 / −2, moderate −5 / −5 stress +5, major −10 / −10 stress +10, extreme −20 / −20 stress +20; `AUTHOR TO TUNE`).
- **Actions:**
  - `dynamic/set_setup`, `dynamic/set_unit`, `dynamic/answer_claim`, `dynamic/answer_milestone`, `dynamic/exit`, `dynamic/bypass_leash`, `dynamic/answer_return`, `dynamic/offer`, `dynamic/declare`;
  - `profile/set_practice`, `profile/lock_practice`, `profile/set_expectation`, `profile/lock_expectation`.

  `dynamic/answer_*` and `dynamic/exit` follow the normal guards (an open dilemma blocks them, as it blocks `demand/answer`); none is added to `ALWAYS_OPEN`.

### R23. Directives (`src/dynamic/directives.ts`; prefix `dynamic:`)

These are derived on every refresh by `refreshDynamicDirectives(builder, state, reg)`, called from `applyContext` after `refreshPhysicsDirectives` (cleared without a state):
- `dynamic:<unitId>` (`scene`, present holders at ≥ `play`): the frame label's `promptHint`, her claimed capabilities as plain words, her style pair line, her expectation in this scene (an open milestone, a refusal she will answer), and her Regard tone word.
- `dynamic:probe:<unitId>` (R9).
- `dynamic:offer:<unitId>` (`next_reply`, event-driven like P15a's `moment:`).
- `dynamic:aftermath:<unitId>` (`scene`, the stage's `directive`).
- `dynamic:leash_block:<unitId>` (`scene`, when she is present and the block stands).
- `dynamic:command:<unitId>` (R13).
- `dynamic:witness:<observerId>` (`scene`): she `suspects_dynamic` (hints and questions, cautious) or `knows_dynamic` (her reaction by profile), and only when that holder or the commander is present.
- `dynamic:disappointed:<unitId>` (R19b).

None carries a number or a pronoun for the commander, and none states the commander's feelings.

### R24. Memory check (overview §11)

`memoryRules` gains rows with resolvers (Task numbers in brackets), each `spread: 'none'` unless said:

| rule | event + when | audience | importance | hidden |
|---|---|---|---|---|
| `dynamic_frame_play` / `_role` / `_rule` | `frame_changed`, to | the pair | 3 / 4 / 4 | — |
| `dynamic_sworn` | `sworn` | the pair | 5 (pinned) | — |
| `dynamic_break` / `dynamic_ended` | `dynamic_exit`, sworn true / false | the pair | 5 / 3 | — |
| `dynamic_domain_yielded` | `domain_yielded` | the pair | 2 | — |
| `offer_mocked` | `offer_made`, answer `mocked` | the present (spread by R14 only) | 3 | — |
| `offer_corrected` | `offer_made`, answer `corrected` | the pair | 2 | — |
| `zone_revealed` | `zone_revealed` | the pair (tag `expect:worship.<target>`) | 2 | — |
| `position_region` | `position_shifted` | the holder | 2 | yes |
| `disappointed` | `disappointed` | her | 3 | yes |
| `leash_bypass_found` | `leash_bypassed`, discovered | the holder | 4 | — |
| `aftermath_return_refused` | `aftermath_ended`, reason `refused` | the pair | 3 | — |

The `knows_dynamic` levels and compromat are facts written at their sites (no rule). `probe_answered`, hold, Regard, suspicion, mastery and the reading are bookkeeping. `her_question` is remembered by P15a's rule.

### R25. Analysis and UI surfaces (spec §12)

- **Her dossier › DYNAMIC** (`renderDynamicSection`; hidden in immersive mode, where the hub and cards still show):
  - frame;
  - hold band (raw with "show raw values");
  - domains claimed, and open ones as "she may claim";
  - leading tracks as bands;
  - the vow;
  - **her reading** (her words: the region label, as hers);
  - open claim, milestone and return cards;
  - the exit button with its cost as a severity word per route;
  - the body map.

  Every row has `data-analyze`.
- **The CMDR card** gains a "Held by {name}" line per holder with the domains she holds.
- **The hub:** Tonight `kind: 'dynamic'` (a claim, milestone, return offer or aftermath notice waiting; after `booking`, before `generation`). `whereaboutAt` derives `second_place`.
- **The scene header:** a frame chip next to P9d's lead chip for a present holder at ≥ `play` (`glossary:frame`).
- **Cards** in her voice (`VOICE_OF.dynamic = 'personal'`, `unitAccent`): claim, milestone, return, exit confirm and the offer composer. The aftermath notice is a toast in her voice plus `cutIn` on `aftermath_started` and `frame_changed`.
- **`Knowledge.dynamic(unitId, reg): DynamicView`** gives:
  - frame, band (or `felt` in immersive mode), domains, track bands and sworn;
  - her reading's region label;
  - revealed expectations;
  - signs (R20);
  - `heldBy` for the CMDR card;
  - known compromat;
  - known suspicion levels (only those revealed by a scene).

  Providers (`registerDynamicProviders`): the 11 registries, plus `glossary:` entries `dynamic`, `hold`, `frame`, `domain`, `milestone`, `vow`, `aftermath`, `leash_block`, `oversight_inquiry`, `compromat`, `regard`, `her_reading`, `probe`, `offer`, `mastery`, `body_map`, `holder_override`, `dynamic_felt`, `setting_dynamic_hidden`, and the DYNAMIC setup fields `setting_dynamic_*`.

## Review Focus

1. **A campaign that never turns the dynamic on is the campaign as it was, including one with every content category on but `holders: 0` or no `state.dynamic`.**
   - The seeded week ends with the same `state.rng`, the same log and none of the new keys.
   - The intent prompt is the pinned text.
   - Each P15 reader on a P15a hook returns null.
   - Tests: Task 48 (`unaffected week`, `categories on but holders 0`), Task 13 (`readers answer null when off`) and Task 17 (`prompt without dynamic is byte-identical`).
2. **A frame never changes by a number alone.** Hold is clamped by the frame's ceiling at `equal` (39). A frame moves only through `applyMilestone`, including the automatic `cooling` and `command_lost`. Tests: Task 10 (`hold at equal stops at 39`) and Task 21 (`no frame_changed without a milestone`, over 120 seeded days).
3. **One override at a time, whoever holds.** With a warden and a holder with `countermand`, a second roll while one is open throws `OPEN_FIRST`. The warden rolls first, and a holder's DEFY never calls `punishRoll`. A P13 save with an open warden override loads and answers unchanged. Tests: Task 25 (`warden first, one open`) and Task 26 (`holder defy has no warden punishment`, `old save override answers`).
4. **Removing a holder (desertion, termination, death, reassignment) mid-anything leaves nothing dangling:**
   - no open claim, milestone, offer or override of hers;
   - no domain held by a missing unit;
   - no knowledge rows about her;
   - an aftermath of hers ends (`aftermath_ended { reason: 'gone' }`);
   - `capabilitiesOf` and `holderWith` skip her.

   Test: Task 9 (`forgetDynamic clears every trace`) plus a check in Task 30 (`a removed holder's aftermath ends with gone`).
5. **Hidden stays hidden:**
   - compromat before it is mentioned, suspicion, Regard, the reading's numbers, mastery xp and unrevealed expectations reach no reading, toast, label or prompt;
   - immersive mode hides the section and the bands and keeps the events and cards;
   - the body map shows only what a fact revealed.

   Tests: Task 47 (sentinels), Task 44 (`immersive hides…`) and Task 43 (`unrevealed zone is a question mark`).

---

## Chunk (a): the profile as data

### Task 1: The eleven registries, the closed enums and the content checks

**Files:**
- Create:
  - `src/engine/dynamic/types.ts` (the R4 enums and entry types; a leaf: no engine imports but `blocking/state` for `FRAMES` and `physics/state` for `STYLE_KEYS`);
  - `content/core/{practiceStyles,holdBands,dynamicFrames,dynamicMilestones,dynamicDomains,dynamicTracks,probeAxes,positionRegions,aftermaths,regardBands,dynamicSigns}.json`.
- Modify:
  - `src/content/types.ts` (`REGISTRY_NAMES`, `// P15`);
  - `src/content/schemas.ts` (one strict schema per registry, `DESCRIBED_REGISTRIES`, `RESERVED_EVENT_TYPES` += every R22 engine event);
  - `src/analysis/describe.ts` (`HIDDEN_DESCRIBED` += `positionRegions`);
  - `src/engine/bonds/content.ts` (`CONTENT_GATED_REGISTRIES` += `dynamicMilestones`, `aftermaths`);
  - `tests/helpers/bonds.ts` (`GATE_PROBES` for both);
  - `src/content/refs.ts`;
  - `content/core/manifest.json`;
  - `content/core/contentCategories.json` (the `restraint` description widens to sensory control: blindfold, silence, darkness; spec §1; no new category);
  - count tests that list registries (expected values only).
- Test: `tests/content/dynamicSchemas.test.ts`

**Interfaces:**
- Produces:
  - the types `PracticeAs`, `Witness`, `Audience`, `Inclination`, `MayHold`, `Fairness`, `HintStyle`, `Drive`, `Capability`, `Motive`, `RegionRank`, `AftermathKind`, `AftermathEffect` (discriminated by `type`), `MilestoneEffect`, `SurfaceCondition`, `SignKind`, `OfferTab`, `OfferAnswer`, `KnowledgeLevel`, `ExitRoute`;
  - the entry types `PracticeStyleEntry`, `HoldBandEntry`, `DynamicFrameEntry`, `DynamicMilestoneEntry`, `DynamicDomainEntry`, `DynamicTrackEntry`, `ProbeAxisEntry`, `PositionRegionEntry`, `AftermathEntry`, `RegardBandEntry`, `DynamicSignEntry`.

- [x] **Step 1: Write the failing tests.**
  - `the core pack loads the eleven registries`: 11 `practiceStyles` (no `neutral`), 5 `holdBands` covering 0–100 without gaps, 4 `dynamicFrames` with floors 0 / 20 / 40 / 60 and `equal.holdCeiling === 39`, 9 `dynamicMilestones`, 6 `dynamicDomains`, 10 `dynamicTracks`, 10 `probeAxes` (tiers 1 and 2), 11 `positionRegions` (each rank once), 9 `aftermaths` (each kind once), 5 `regardBands`, and the §15.13 `dynamicSigns` rows.
  - `domains grant only known capabilities and every capability is granted once`.
  - `refs`: a milestone's `requires.tracks` names tracks, `capabilities` are in `CAPABILITIES`, `styles` are style ids, `categories` are content categories; a track's `category` exists; `aftermaths[].chainsTo` are kinds; a sign's `contentTags` exist.
  - `an unknown capability, a band gap or a duplicate region rank is a content error` (fixture packs).
  - `every new engine event is reserved` (R22 list ⊆ `RESERVED_EVENT_TYPES`).
- [x] **Step 2: Run** `npx vitest run tests/content/dynamicSchemas.test.ts` → FAIL.
- [x] **Step 3: Implement** the schemas and the core rows with R4's values. Every `label` / `description` / `text` / `promptHint` not given by the spec is `AUTHOR TO WRITE: …`, with no pronoun for the commander. Add the new registries to `tests/content/pronouns.test.ts`.
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15): the dynamic registries and enums`

---

### Task 2: The practice section of the bond profile

**Files:**
- Create: `src/engine/dynamic/profile.ts`
- Modify:
  - `src/engine/state/types.ts` (`Bond.practice?: Practice`, `Unit.practiceLocks?: string[]`);
  - `src/engine/bonds/profile.ts` (`validateBond` passes `practice` through `validatePractice`; `bondOf` keeps it);
  - `src/engine/actions/dynamic.ts` (new; `profile/set_practice`, `profile/lock_practice`);
  - `src/app.ts` (import the actions module).
- Test: `tests/engine/dynamic/profile.test.ts`

**Interfaces:**
- Produces:
  - `validatePractice(raw: unknown, reg: Registries): { practice?: Practice; issues: string[] }`;
  - `practiceOf(state: Pick<CampaignState,'squad'|'content'>, reg, unitId): PracticeView | null`, where `PracticeView = Practice & { allowed: string[] }` and categories off or limited read `none` / `indifferent`;
  - `practiceCategories(reg): string[]`;
  - `PRACTICE_DEFAULTS`.

- [x] **Step 1: Write the failing tests.**
  - `hostile fields are sanitised`: an unknown category is dropped with an issue; `as: 'loves'` → `none`; `secondary === primary` is dropped; `fairness: 7` → `fair`; a missing `style.primary` → `practice` undefined.
  - `limits and disabled categories read none`: `restraint` in `ownLimits.categories` → `practiceOf(...).categories.restraint` is `{ as: 'none', witness: 'indifferent' }`; a category switched off → same; switched back on → the stored value again.
  - `a grunt and an absent section give null`.
  - `practiceCategories lists the tracks' categories once, in order`.
  - `set_practice respects locks`: locking `style` and then patching it throws "That field is locked."; an empty lock list deletes `practiceLocks`.
  - `validateBond keeps a valid practice and reports its issues`.
- [x] **Step 2: Run** `npx vitest run tests/engine/dynamic/profile.test.ts` → FAIL.
- [x] **Step 3: Implement** as in Interfaces and R5.
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15): the practice section of the bond profile`

---

### Task 3: The expectation profile

**Files:**
- Create: `src/engine/dynamic/expectations.ts`
- Modify:
  - `src/engine/state/types.ts` (`Unit.expectations?`, `Unit.expectationLocks?`);
  - `src/engine/setup.ts` (`UnitSetup.expectations?`, `expectationLocks?`, validation in `validateUnitProfile`, copied by `makeNamedUnit`);
  - `src/engine/actions/dynamic.ts` (`profile/set_expectation`, `profile/lock_expectation`).
- Test: `tests/engine/dynamic/expectations.test.ts`

**Interfaces:**
- Produces:
  - `validateExpectations(raw: unknown, reg, ctx: { state?: CampaignState; unitId?: string }): { expectations?: ExpectationProfile; issues: string[] }`;
  - `expectationsOf(state, reg, unitId): ExpectationProfile` (profile values minus targets whose gate is closed);
  - `lockedExpectation(unit, field): boolean`.

- [x] **Step 1: Write the failing tests.**
  - `unknown ids are dropped`: an unknown source in `moments` and an unknown target in `worship` are gone, with issues.
  - `a gated worship target is dropped`: `genitalia` without `explicit_scenes` is not in `expectationsOf`.
  - `texts are cut and cleaned`: `tells.irritation` of 200 chars → 80; control characters stripped; "he blushes" (a pronoun for the commander) → dropped.
  - `offset is clamped to ±0.3`; `build` weights clamp 0–1; `traits` ≤ 6 × ≤ 40.
  - `blackout is stored but acts as limit without breath_play` (through P15a `effectiveHoldsUntil` once Task 13's reader is in; here: stored as given).
  - `a locked field cannot be patched` (`worship.feet` locked; a patch naming it throws).
- [x] **Step 2: Run** `npx vitest run tests/engine/dynamic/expectations.test.ts` → FAIL.
- [x] **Step 3: Implement** as in R6.
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15): the expectation profile`

---

### Task 4: `profile_import` sections `practice` and `expectations`, and re-sync

**Files:**
- Modify:
  - `src/llm/calls/profileImport.ts` (`ImportSection` += `practice`, `expectations`; `ALL_SECTIONS`; `SCHEMA_PART`; the conditional system lines; `ProfileImportInput.practice?: { categories: string[] }` and `.expectations?: { targets: string[]; sources: string[] }`);
  - `src/setup/profile.ts`:
    - `buildImportInput` offers the two sections only while a practice category is enabled, naming the enabled categories and allowed ids only;
    - `sanitizeProfile` (`ImportedProfile.practice?`, `.expectations?`; neither is ever critical);
  - `src/setup/wizard.ts`:
    - `applySection` gets explicit branches for `practice` and `expectations`;
    - while there, it gets branches for `temperament` / `hobbies` / `opinions`, fixing the fall-through into `likes` noted by the code map. That fix must not change any existing test; if one moves, stop and report;
    - `preselect`;
  - `src/engine/actions/squad.ts` (`RESYNC_SECTIONS`, `ResyncPatch.practice?` / `.expectations?`, `SECTION_OF`, locked fields kept);
  - `src/app.ts` (`RESYNC_LABELS`, patch building);
  - `src/setup/profile.ts` `importProfile`: the user's `profile_import` budget is unchanged (1800); when the sections are asked, `generate` gets `budgetMult = 1 + (300 × practice + 400 × expectations) / budget` (`AUTHOR TO TUNE`), so a call without them sends the same budget as today.
- Test: `tests/setup/practiceImport.test.ts`

**Interfaces:**
- Consumes: `validatePractice` (Task 2), `validateExpectations` (Task 3).
- Produces: `PRACTICE_SECTIONS = ['practice','expectations']`; `ImportedProfile.practice`, `.expectations`.

- [x] **Step 1: Write the failing tests.**
  - `no practice category: the sections are not offered`: `buildImportInput(..., ALL_SECTIONS)` has no `practice` input, and the system text matches the old one byte for byte (compare with the prompt built before the change for the same card; pin it as `tests/fixtures/profile_import/no_practice.txt`, written by the test's first run from the pre-change code and committed in Step 1).
  - `the prompt names only enabled categories`: with `restraint` and `service` on, the text lists those two and not `pain_rough`.
  - `the answer is sanitised`: a hostile `practice` gives the Task 2 result, and the dropped ids are in `dropped` as `practice:<id>`.
  - `regenerate one section`: `applySection('practice')` changes `practice` only (likes, temperament untouched).
  - `re-sync keeps locked fields`: `squad/resync { patch: { practice } }` with `practiceLocks: ['style']` keeps the old style.
- [x] **Step 2: Run** `npx vitest run tests/setup/practiceImport.test.ts` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** the file, then `npm test` → PASS. The pinned `intent_extract` fixture is untouched.
- [x] **Step 5: Commit** `feat(P15): import and re-sync the practice and expectation sections`

---

### Task 5: The PRACTICE and EXPECTATIONS blocks (calibration and dossier)

**Files:**
- Create: `src/ui/dynamic/profileBlocks.ts`
- Modify:
  - `src/ui/setup/calibration.ts` (two `section('practice', 'PRACTICE', …)` / `section('expectations', 'EXPECTATIONS', …)` blocks after BOND PROFILE, shown only while a practice category is on);
  - `src/ui/squad/squadTab.ts` (`dynamicProfileBlock` after `lifeProfileBlock`, editable while `!settings().editLock`, dispatching the Task 2 / 3 actions; `SquadTabCtx.dynamic?: { dispatch }`);
  - `src/app.ts`;
  - `content/core/glossary.json` (`practice_profile`, `practice_as`, `practice_witness`, `practice_style`, `practice_audience`, `inclination`, `fairness`, `hint_style`, `drive`, `expectation_profile`);
  - `css/19-dynamic.css` (new);
  - `tests/content/pronouns.test.ts` (`FILES`).
- Test: `tests/ui/dynamic/profileBlocks.test.ts`

**Interfaces:**
- Produces:
  - `renderPracticeBlock(host, ctx: PracticeBlockCtx)`, with `PracticeBlockCtx { unit: { id, displayName }; practice?: Practice; categories: Array<{ id, label }>; locks: string[]; editable: boolean; onSet(patch: Partial<Practice>); onLock(field: string, on: boolean) }`;
  - `renderExpectationsBlock(host, ctx: ExpectationsBlockCtx)` (same shape over `ExpectationProfile`; worship rows only for allowed targets; moment rows only for allowed sources).

- [x] **Step 1: Write the failing tests** (jsdom):
  - `one row per enabled category with as and witness chips`;
  - `a locked field's chips are aria-disabled`;
  - `not editable: every control is aria-disabled`;
  - `every chip and lock carries data-analyze and resolves` (`analyzeCoverage` helpers);
  - `the blocks are absent while no practice category is on` (calibration render).
- [x] **Step 2: Run** `npx vitest run tests/ui/dynamic/profileBlocks.test.ts` → FAIL.
- [x] **Step 3: Implement** in the style of `renderTemperamentBlock`.
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15): practice and expectation editors`

---

### Task 6: Drift of the practice and the expectations (P14b axes)

**Files:**
- Modify:
  - `src/engine/development/types.ts` (`AxisKind` += `practice`, `expect`);
  - `src/content/schemas.ts` (`DevelopmentAxisSchema` regex and enum);
  - `src/engine/development/axes.ts` (`axisKind`, `axisForbidden`: a locked field, a disabled or limited category, `fairness` / `hintStyle` / `drive` always forbidden; `anchorKey`);
  - `src/engine/development/review.ts` (`room`, `applyShift` write `development.practice` / `development.expect`);
  - `src/engine/dynamic/profile.ts` and `expectations.ts` (fold drift, like `bondOf`);
  - `src/engine/state/types.ts` (`Development.practice?`, `Development.expect?`);
  - `src/content/refs.ts`;
  - `src/setup/profile.ts` (`developmentAxisKeys`);
  - `src/engine/tuning.ts` (`TUNING.development.scales` rows);
  - `content/core/developmentAxes.json` (`practice:.any.as`, `practice:.any.witness`, `practice:style.secondary`, `expect:holds_until`, `expect:worship.any`).
- Test: `tests/engine/development/practiceAxes.test.ts`

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces: drift folded into `practiceOf` / `expectationsOf`.

- [x] **Step 1: Write the failing tests.**
  - `a shift of practice:restraint.as moves one step and practiceOf reads it`;
  - `a locked category never shifts` (`axisForbidden` true);
  - `fairness never drifts`;
  - `a disabled category is forbidden`;
  - `undoReview restores the stored value`;
  - `with development off nothing changes` (`tests/development/unaffected.test.ts` still green).
- [x] **Step 2: Run** `npx vitest run tests/engine/development/practiceAxes.test.ts` → FAIL.
- [x] **Step 3: Implement** at the nine places the code map lists.
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15): practice and expectation drift through development`

---

## Chunk (b): setup, the gate, removal

### Task 7: Campaign state, the gate and eligibility

**Files:**
- Create: `src/engine/dynamic/state.ts` (a leaf: types and pure readers only; `DynamicCampaign`, `DynamicRelation`, `OpenClaim`, `OpenMilestone`, `OpenOffer`, `OpenReturn`, `KnowledgeRecord`, `AftermathState`; `dynamicOf`, `dynamicHash`).
- Modify:
  - `src/engine/dynamic/index.ts` (new barrel);
  - `src/engine/state/types.ts` (`CampaignState.dynamic?`, `Relation.dynamic?`, `Relation.regard?`, `Relation.mastery?`);
  - `src/engine/tuning.ts` (`TUNING.dynamic`, with every R2 / R8 value);
  - `src/engine/actions/dynamic.ts` (`dynamic/set_setup`, `dynamic/set_unit`).
- Test: `tests/engine/dynamic/gate.test.ts`

**Interfaces:**
- Produces:
  - `dynamicOn(state, reg): boolean`;
  - `canHold(state, reg, unitId, opts?: { ignoreCap?: boolean }): string | null`;
  - `mayHoldOf(state, unitId): MayHold`;
  - `holderCap(state): number` (`any` → `Infinity`);
  - `holdersAtPlay(state): string[]`;
  - `dynamicHash(state, unitId, key): number` (0–1);
  - `ensureDynamic(draft, reg, unitId): EngineEvent[]`;
  - `dynamicOf(state, unitId): DynamicRelation | undefined`.

- [x] **Step 1: Write the failing tests.**
  - `off without state.dynamic, with holders 0, or with no practice category on`.
  - `canHold reasons`: no profile; `mayHold: 'no'`; inclination `none` not seeded; no category at `enjoys`+; `tolerates` + `dominant` passes; lead `balanced` with Impunity 39 fails and with 40 passes; cap 1 reached by another unit at `play` fails; `any` never caps.
  - `set_setup creates the state only while a practice category is on`, and `set_setup { holders: 0 }` on a campaign with two holders ends nothing (both keep `frame`).
  - `dynamicHash is stable for the same day and key and differs across days`.
  - `ensureDynamic emits dynamic_started once`.
- [x] **Step 2: Run** `npx vitest run tests/engine/dynamic/gate.test.ts` → FAIL.
- [x] **Step 3: Implement** as in R2–R3 and R7.
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15): dynamic state, the gate and eligibility`

---

### Task 8: Setup: `SetupResult.dynamic`, seeds, the DYNAMIC block and SYS

**Files:**
- Modify:
  - `src/engine/setup.ts` (`SetupResult.dynamic?`, `validateSetup` checks, `buildCampaign` writes `state.dynamic` and calls `applySeeds` after `applyHeadStart`);
  - `src/setup/wizard.ts` (`WizardState.dynamic`, `setDynamic`, `setDynamicUnit(avatar, patch)`, re-indexing in `toggleUnit`, `build()`);
  - `src/ui/setup/worldParams.ts`;
  - `src/ui/shell/sysTab.ts` (Dynamic `h3`, the `dynamicHidden` row under Display);
  - `src/settings.ts` (`dynamicHidden`);
  - `content/core/glossary.json` (`setting_dynamic_hidden`, `setting_dynamic_holders`, `setting_dynamic_pace`, `setting_dynamic_frequency`, `dynamic_may_hold`, `dynamic_sensitivity`, `dynamic_seeded`, `dynamic_start_frame`, `dynamic_underway`);
  - `tests/content/glossaryCore.test.ts` (campaign-only keys list).
- Create: `src/engine/dynamic/seeds.ts`, `src/ui/setup/dynamicStep.ts`.
- Test: `tests/engine/dynamic/setup.test.ts`, `tests/ui/dynamic/dynamicStep.test.ts`

**Interfaces:**
- Consumes: Task 7.
- Produces: `applySeeds(draft, reg, r: SetupResult): EngineEvent[]`; `renderDynamicStep(host, ctx: DynamicStepCtx)`; `seedProblem(reg, unit: UnitSetup): string | null`.

- [x] **Step 1: Write the failing tests.**
  - `a build without dynamic is byte-identical` (`tests/engine/setup.test.ts` stays green; a new assertion: `state.dynamic === undefined` when no practice category is on, even with `r.dynamic` set).
  - `more seeds than holders is an error`; `a seeded unit that cannot hold is an error naming the reason`; `startFrame without a seed is an error`.
  - `a seed gets hold 25`, and `startFrame: 'role'` gives frame `role`, hold `max(25, 40)` and `milestones: ['seeded:role']`, with no rng draw (`state.rng` equal to a build without seeds).
  - jsdom: `the DYNAMIC block shows only while a practice category is enabled`; `the underway option shows only with a head start > 0`; `every control carries data-analyze`; `SYS shows holders, pace, frequency and per-unit rows; lowering holders below the count shows no warning that something ends`.
- [x] **Step 2: Run** both files → FAIL.
- [x] **Step 3: Implement** as in R3.
- [x] **Step 4: Run** the files, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15): dynamic setup, seeds and settings`

---

### Task 9: `forgetDynamic` on removal and death

**Files:**
- Create: `src/engine/dynamic/forget.ts`
- Modify: `src/engine/leash/use.ts` (`removeFromService` calls `forgetDynamic` after `forgetPersonal`), `src/engine/personal/dayStep.ts` (the dead-unit sweep calls it too).
- Test: `tests/engine/dynamic/forget.test.ts`

**Interfaces:**
- Produces: `forgetDynamic(draft, unitId): EngineEvent[]`. It is extended by later tasks (claims, overrides, knowledge, aftermaths); each later task adds its own assertion to this test file.

- [x] **Step 1: Write the failing test** `forgetDynamic clears every trace` (built from a hand-made state):
  - her open claims, milestones, offers and return offer are gone;
  - the knowledge rows with her as observer or holder are gone;
  - she leaves the probe queue;
  - `state.dynamic.override` is gone if it is hers;
  - her own `Relation.dynamic` stays (history), but `domains` is `[]`;
  - an aftermath of hers ends with `aftermath_ended { reason: 'gone' }`.
- [x] **Step 2: Run** `npx vitest run tests/engine/dynamic/forget.test.ts` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15): forget a removed holder`

---

## Chunk (c): hold and the P15a hooks

### Task 10: Hold, bands, floors, tracks and favour

**Files:**
- Create: `src/engine/dynamic/hold.ts`, `src/engine/dynamic/tracks.ts`
- Test: `tests/engine/dynamic/hold.test.ts`

**Interfaces:**
- Consumes: Task 7.
- Produces:
  - `addHold(draft, ctx: Pick<EngineCtx,'registries'>, unitId, base: number, cause: string): EngineEvent[]`;
  - `holdBandOf(reg, hold): string`, `bandIndex(reg, hold): number`;
  - `frameEntry(reg, frame)`;
  - `addTrackXp(draft, reg, unitId, trackId, xp): EngineEvent[]` (no producer in P15);
  - `trackLevel(state, unitId, trackId): number`;
  - `trackCap(state, reg, unitId, trackId): number` (P16 reads; 0 when the category is off or limited);
  - `addFavour(draft, unitId, n): void`;
  - `compatibilityOf` (stub returning 1 until Task 15 replaces it).

- [x] **Step 1: Write the failing tests.**
  - `hold at equal stops at 39`: 20 gains of +4 at `equal` end at 39.
  - `never below the frame floor`: at `role`, −50 → 40.
  - `pace`: +4 at `fast` → +5.6, at `slow` → +2.8 (the stored hold is a float; bands read it).
  - `romantic tier`: `affectionate` primary +4 → 4.8 while `romantic`, 4 while `close`; `cold` → 3.2. A loss is never multiplied.
  - `hold_band_changed fires once on a crossing`; `lastPracticeDay is set on a gain only`.
  - `addHold on an ineligible unit with no dynamic does nothing`.
  - `tracks`: xp 30 → level 2 with thresholds 10/30/…; `trackCap` is 0 with the category off.
  - `favour clamps to ±20`.
- [x] **Step 2: Run** `npx vitest run tests/engine/dynamic/hold.test.ts` → FAIL.
- [x] **Step 3: Implement** as in R8.
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15): hold, bands, tracks and favour`

---

### Task 11: The landing hook and the hold feed

**Files:**
- Modify: `src/engine/relations/effects.ts` (`registerEventLanded(fn)`, called last in `applyEventToUnit`; `resetEventLanded` for tests)
- Create: `src/engine/dynamic/feed.ts` (registered from `src/engine/actions/dynamic.ts`)
- Test: `tests/engine/dynamic/feed.test.ts`

**Interfaces:**
- Produces:
  - `registerEventLanded(fn: (draft, reg, unitId, event: EventIntent, severity: Severity) => EngineEvent[]): void`;
  - `holdFeed(draft, reg, unitId, event, severity): EngineEvent[]`;
  - the cause map `FEED_CAUSE: Record<string, string>` (`followed_lead`, `rule_accepted`, `rule_broken`, `refused_demand`, `granted_demand`, `overrode_her`, `commander_enforced`, and P16's types for later).

- [x] **Step 1: Write the failing tests.**
  - `followed_lead lands +1 on a holder`; `commander_enforced on her −10`; `rule_broken −5`.
  - `a granted demand counts only for a desire template` (an `item` template gives 0).
  - `an event on a unit without a dynamic, or with the dynamic off, changes nothing and returns []`.
  - `P16's task_kept, if it ever lands, gives +3` (a synthetic `applyEventToUnit` with that type; the row is ready).
  - `applyEventToUnit draws nothing new` (`rng` state unchanged across the call with and without the hook).
- [x] **Step 2: Run** `npx vitest run tests/engine/dynamic/feed.test.ts` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15): relation events feed hold`

---

### Task 12: The dynamic day step

**Files:**
- Create: `src/engine/dynamic/dayStep.ts`
- Modify: `src/engine/actions/dynamic.ts` (`registerDayEndStep('dm_rumors', dynamicDayStep)`; `app.ts` imports the module after `actions/life`, so it runs after `lifeDayStep`)
- Test: `tests/engine/dynamic/dayStep.test.ts`

**Interfaces:**
- Produces: `dynamicDayStep(draft, ctx): EngineEvent[]`, a fixed ordered list of sub-steps. The later tasks add theirs in place:
  1. decay;
  2. slow term;
  3. track decay;
  4. favour decay;
  5. probes (Task 14);
  6. milestones (Task 19);
  7. claims (Task 22);
  8. knowledge (Task 27);
  9. aftermaths (Task 30);
  10. oversight (Task 34);
  11. Regard (Task 36);
  12. exchange (Task 38).

- [x] **Step 1: Write the failing tests.**
  - `decay after three idle days`: `play`, hold 50, `lastPracticeDay` = day − 4 → 49; `role` → 49.5; `rule` 70 → 69.7; `equal` → unchanged.
  - `never below the floor` (`role` at 40 stays 40).
  - `slow term`: Impunity 45 at `play` → +0.5; leader → +0.3; at `equal` → nothing.
  - `off: the step returns [] and changes nothing`.
  - `no rng draw in steps 1–4` (rng unchanged).
- [x] **Step 2: Run** `npx vitest run tests/engine/dynamic/dayStep.test.ts` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15): the dynamic day step`

---

### Task 13: Installing the P15a hooks

**Files:**
- Create: `src/engine/dynamic/hooks.ts`
- Modify: `src/engine/actions/dynamic.ts` (calls `installDynamicHooks()` at module load); every P15a test file that calls `resetBlockingHooks` / `resetPhysicsHooks` / `resetExpectations` keeps passing (the readers return null without a dynamic).
- Test: `tests/engine/dynamic/hooks.test.ts`

**Interfaces:**
- Consumes: P15a `registerFrameReader`, `registerBlockingGate`, `registerPhysicsStyle`, `registerHoldsUntil`, `registerExpectation`.
- Produces: `installDynamicHooks(): void` (idempotent in effect: double registration gives the same answers).

- [x] **Step 1: Write the failing tests.**
  - `readers answer null when off`: with no `state.dynamic`, `frameOf` is `'equal'`, `physicsStyleOf` is `neutral`, `holdsUntilOf` is `signal`, and `expectedOption` is P15a's default, even for a unit with a full practice and expectations.
  - `frame reader`: a unit at `role` → `frameOf` is `role`, and a `scope: 'dynamic'` blocking entry passes `entryAllowed`.
  - `blocking gate`: a scene with a holder at `play` and no close tier is live.
  - `physics style`: primary and secondary from the profile (`phaseLead` `primary` until Task 16).
  - `holdsUntil` from her expectations; `blackout` without `breath_play` acts as `limit`.
  - `expectation`: her profile `moments.her_affection = { type: 'yielded', strength: 3 }` gives that option, strength 3.
  - `installing twice changes nothing`.
- [x] **Step 2: Run** `npx vitest run tests/engine/dynamic/hooks.test.ts` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** the file, then `npm test` → PASS (`tests/blocking/unaffected.test.ts` unchanged).
- [x] **Step 5: Commit** `feat(P15): plug the dynamic into the P15a hooks`

---

## Chunk (d): probing and her reading

### Task 14: The probe schedule, queue and back-off

**Files:**
- Create: `src/engine/dynamic/probes.ts`
- Modify: `src/engine/dynamic/dayStep.ts`, `src/engine/tuning.ts` (`TUNING.probes`)
- Test: `tests/engine/dynamic/probes.test.ts`

**Interfaces:**
- Produces:
  - `probeDayStep(draft, ctx): EngineEvent[]`;
  - `pendingProbe(state, unitId)`;
  - `answerProbe(draft, ctx, unitId, response: ResponseType, tone: Tone | undefined, weight: 1 | 0.5): EngineEvent[]` (closes the pending probe when `weight === 1`; feeds hold and, from Task 15, the reading);
  - `probeQueueRoom(state): number`.

- [x] **Step 1: Write the failing tests.**
  - `an eager unit on interest probes about 30 % of days` (200 seeded days, frequency normal: 0.25–0.35).
  - `none never probes; latent only with a cause` (Impunity 45 → probes; 30 → never).
  - `at most cap units probe`: cap 1, two eager units → only one is ever pending.
  - `one a day and one a scene`; `the axis is hashed and avoids the last three`.
  - `answers move hold`: yielded +4, returned +3 (`playful` +5), deflected −1, resisted −3, × sensitivity (`lively` +6.4); `observed` × 0.5 and does not close the probe.
  - `back-off`: three deflections among the last five → `backoffUntil = day + 14`, `probe_backoff`, she leaves the queue.
  - `a pending probe lapses after 3 days`.
  - `no eligible unit: no draw` (rng unchanged).
- [x] **Step 2: Run** `npx vitest run tests/engine/dynamic/probes.test.ts` → FAIL.
- [x] **Step 3: Implement** as in R9.
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15): probes on the engine's schedule`

---

### Task 15: Her reading of the position

**Files:**
- Create: `src/engine/dynamic/reading.ts`
- Modify:
  - `src/engine/dispatch.ts` (`AfterAction` gains an optional third parameter `events: readonly EngineEvent[]`, passed by `dispatch`; the existing step ignores it);
  - `src/engine/dynamic/hold.ts` (`compatibilityOf` real);
  - `src/engine/dynamic/probes.ts` (feeds the reading);
  - `src/engine/actions/dynamic.ts` (`registerAfterAction(readMoments)`, `dynamic/declare`);
  - `src/engine/tuning.ts` (`TUNING.position`);
  - `content/core/memoryRules.json` + `src/engine/memory/resolvers.ts` (`position_region`, hidden, audience the holder).
- Test: `tests/engine/dynamic/reading.test.ts`

**Interfaces:**
- Produces:
  - `newReading(): HerReading`;
  - `updateReading(rel: DynamicRelation, sample: { response: ResponseType; tone?: Tone; afterThreat?: boolean }, alpha: number, style: PhysicsStyle, insight: Insight): { region?: { from: RegionRank; to: RegionRank } }`;
  - `regionOf(reading: HerReading): RegionRank`;
  - `distanceToPoint(reading: HerReading, point): number`;
  - `compatibilityOf(state, reg, unitId): number` (0.8–1.2);
  - `readMoments(draft, ctx, events): EngineEvent[]`.

- [x] **Step 1: Write the failing tests.**
  - `the region table in order`: hand-built readings land in hollow (flat 0.5), elusive (deflect 0.4), cowed (fear largest), double game, calculating, bratty, proud, hungry (process largest), reluctant, dutiful (order largest), devoted.
  - `hysteresis`: a region changes only after three updates in a row; one stray answer changes nothing.
  - `misreading`: the same five answers read differently by `clinical` and `possessive` (`her` weight higher for `possessive`); insight `low` doubles it; no rng draw.
  - `declarations fade`: weight 0.5 → 0.25 after 5 days → 0 after 10.
  - `compatibility`: a `ritual` holder with a dutiful reading → 1.2; with a bratty reading → closer to 0.8; hold gains use it.
  - `moment_answered feeds the reading but not hold` (dispatch a `moment/answer` in a live scene with a holder: `readOf.updates` +1, `hold` unchanged).
  - `position_shifted writes the hidden memory fact`.
- [x] **Step 2: Run** `npx vitest run tests/engine/dynamic/reading.test.ts` → FAIL.
- [x] **Step 3: Implement** as in R10.
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15): her reading of the commander's position`

---

### Task 16: The style pair: surfacing, phases, and her default expectation

**Files:**
- Create: `src/engine/dynamic/style.ts`
- Modify: `src/engine/dynamic/hooks.ts`
- Test: `tests/engine/dynamic/style.test.ts`

**Interfaces:**
- Produces:
  - `surfaceHolds(state, reg, unitId, cond: SurfaceCondition): boolean`, one pure check per condition:
    - `peak` and `scene_edges` from the P15a physics phase and the scene's exchange count;
    - `before_others` from participants;
    - `third_person` from a visitor or a third participant;
    - `displeased` / `low_stakes_good_mood` from satisfaction (Task 38 defines it; until then favour sign);
    - `threat` from another holder present or an exit pending;
    - `after_defiance` from `refusals` today;
    - `after_peak_or_wound` from the physics run's last outcome or a commander injury;
    - `new_practice` from `recent`;
    - `stagnation` from no `endurance_gained` in 7 days;
    - `training_start` from the scene's activity;
    - `praised_or_ignored` from her `opinion_agreed` / no contact for 3 days;
    - `crime_mentioned` from the scene's intents;
    - `failed_run` from the last expedition's outcome;
    - `arrival_anniversary` on every 30th campaign day (`state.day % 30 === 0`, `AUTHOR TO TUNE`);
  - `leadingStyle(state, reg, unitId): { key, phaseLead }`;
  - `defaultExpectation(state, reg, moment): Expectation` (P15a's type, `engine/moments/answer.ts`).

- [x] **Step 1: Write the failing tests.**
  - `the secondary leads while its condition holds`: `affectionate` + `cruel` at the physics peak → `phaseLead: 'secondary'`; after the hold → `primary`.
  - `ritual surfaces before others` (a group scene).
  - `numbers blend 65/35 through P15a`: `blendedStyle` reads the reversed pair in the secondary's phase (the P15a function, unchanged).
  - `default expectation`: a `ritual` holder (point dutiful) expects the `yielded` option; with no profile value and frame `equal` a tie goes to `returned`.
  - `preferences come from the profile`: a profile value beats the style default.
- [x] **Step 2: Run** `npx vitest run tests/engine/dynamic/style.test.ts` → FAIL.
- [x] **Step 3: Implement** as in §15.4 and R10.
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15): the style pair surfaces and leads phases`

---

### Task 17: The intent plumbing (seven types) and the probe answers

**Files:**
- Modify:
  - `src/engine/relations/vocab.ts` (`EVENT_TYPES` += 7; `ENGINE_EVENT_TYPES` += `dynamic_exit`; `DYNAMIC_EVENT_TYPES`);
  - `content/core/eventDeltas.json` (rows; the probe and milestone types are `ROW_IS_CONDITIONAL`-style: zero deltas, the engine decides);
  - `src/engine/relations/intents.ts` (`EventIntent` fields; `validateIntents` option `dynamic`);
  - `src/llm/calls/intentExtract.ts` (`IntentExtractInput.dynamic?`, the type filter, the shape and rule lines, the `DYNAMIC` block; `sanitizeIntentOutput` / `readIntentOutput` forward it);
  - `src/engine/relations/apply.ts` (rebuild the offer from the state; route to `applyDynamicIntent`);
  - `src/scene/sceneController.ts` and `src/scene/comms.ts` (spread `dynamicIntentInput`);
  - counts in `tests/engine/relations/intents.test.ts` (52) and `tests/content/core.test.ts` (77: 52 reportable + 25 engine).
- Create: `src/engine/dynamic/intents.ts`
- Test: `tests/llm/intentExtractDynamic.test.ts`, `tests/engine/dynamic/intents.test.ts`

**Interfaces:**
- Produces:
  - `DynamicOffer { types: string[]; probes: string[] /* unit ids */; milestones: string[]; claims: string[]; exits: string[]; offers: string[]; compromat: string[] /* holder ids */ }`;
  - `dynamicIntentInput(state, reg, participants: string[], channel: 'scene' | 'dm'): { dynamic?: DynamicOffer & { probeAxes: Record<string, string>; milestoneLabels: Record<string, string> } }`;
  - `applyDynamicIntent(draft, ctx, unitId, ev: EventIntent): EngineEvent[]` (this task handles `probe_answered` / `probe_observed`; later tasks add their types).

- [x] **Step 1: Write the failing tests.**
  - `prompt without dynamic is byte-identical` (the pinned fixture, with and without every content category on and a holder in the squad but none present).
  - `only offered types are listed`: a pending probe for a present unit lists `probe_answered` and not `milestone_accepted`.
  - `an unoffered type or id is dropped`: `milestone_accepted { milestoneId: 'dm9' }` with no open milestone → dropped; `probe_answered` for a unit without a pending probe → dropped.
  - `a probe answer through intents/apply closes the probe and moves hold and the reading`.
  - `tone outside TONES is dropped from the event, the event stays`.
- [x] **Step 2: Run** both files → FAIL.
- [x] **Step 3: Implement** as in R22.
- [x] **Step 4: Run** the files, then `npm test` → PASS (all four pinned-fixture tests green).
- [x] **Step 5: Commit** `feat(P15): dynamic intents, offered only while their subject exists`

---

### Task 18: Directives and the controller

**Files:**
- Create:
  - `src/dynamic/directives.ts`;
  - `src/dynamic/controller.ts` (`createDynamic(deps): DynamicController` with `onEvents`, `onSceneOpened`, `onSceneClosed`; it refreshes context on the R22 events and applies event-driven `next_reply` directives);
  - `src/dynamic/deps.ts`.
- Modify: `src/app.ts` (`applyContext` calls `refreshDynamicDirectives` after `refreshPhysicsDirectives`, `clearDynamicDirectives` without a state; `followUps` calls `dynamic.onEvents`; scene open/close hooks), `tests/content/pronouns.test.ts` (`FILES`).
- Test: `tests/dynamic/directives.test.ts`

**Interfaces:**
- Produces:
  - `dynamicDirectives(state, reg, present: string[]): Directive[]` (pure);
  - `refreshDynamicDirectives(builder, state | null, reg)`;
  - `clearDynamicDirectives(builder)`;
  - `DYNAMIC_PREFIX = 'dynamic:'`;
  - `DynamicController`.

- [x] **Step 1: Write the failing tests.**
  - `dynamic:<unitId> for a present holder at play`: it carries the frame's `promptHint`, the style line and, with a claimed `household_protocol`, its words, and has no digit.
  - `dynamic:probe:<unitId> while her probe is pending and she is present`, and gone after the answer.
  - `nothing while off`.
  - `no pronoun for the commander and no feeling word` (a list: `feels`, `wants to`, `ashamed`, `aroused`, `loves`, `fears` applied to "the commander").
  - `the prefix is not reserved by another package` (every id starts with `dynamic:`, and none starts with `life:`, `blocking:`, `moment:`, `physics:`, `power:`, `personal:`, `prologue:`, `development:`, `world:`, `stance:`, `friction:`).
  - `a chat switch clears them` (controller test with the fake adapter).
- [x] **Step 2: Run** `npx vitest run tests/dynamic/directives.test.ts` → FAIL.
- [x] **Step 3: Implement** as in R23.
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15): dynamic directives and controller`

---

## Chunk (e): milestones and frames

### Task 19: Milestones due, their forms, and frame changes

**Files:**
- Create: `src/engine/dynamic/milestones.ts`
- Modify:
  - `src/engine/dynamic/dayStep.ts`;
  - `src/engine/dynamic/hold.ts` (after `hold_changed`, call `milestonesDue`);
  - `src/engine/personal/bookings.ts` (`BookingSource` += `milestone`; `book` accepts it and skips the weekly cap);
  - `src/engine/dynamic/forget.ts`.
- Test: `tests/engine/dynamic/milestones.test.ts`

**Interfaces:**
- Produces:
  - `milestonesDue(draft, ctx, unitId): EngineEvent[]` (applies automatic milestones, opens the others, one open per unit);
  - `requiresMet(state, reg, unitId, m: DynamicMilestoneEntry): boolean`;
  - `applyMilestone(draft, ctx, unitId, milestoneId): EngineEvent[]` (**the only writer of `frame`**, apart from seeds);
  - `refusalCost(draft, ctx, unitId, what: 'claim' | 'milestone' | 'demand'): EngineEvent[]` (R11's frame-dependent cost, including `refusal_noted` and the contest).

- [x] **Step 1: Write the failing tests.**
  - `first_yes opens at testing in the scene form`: an `OpenMilestone` with `form: 'scene'` and `milestone_offered`.
  - `first_protocol books her next free evening` (a booking with `source: 'milestone'`, even with two `roll` bookings this week).
  - `first_night_held needs restraint ≥ 1` and stays closed at track 0 (user R1).
  - `cooling`: `role`, 21 days without a gain → `frame_changed { to: 'play' }`, automatic.
  - `command_lost`: `rule` via `handover` without `countermand` and without the private set → `role`; with the private set and possessing → stays `rule`.
  - `private_rule` opens at possessing with `book_ahead`, `body_conditions` and `household_protocol`.
  - `refusal cost by frame`: −2 at `play`; −4 plus `refusal_noted` at `role`; at `rule`, a third refusal within 14 days opens the submit claim (R1).
  - `a gated milestone stays closed while its category is off`.
- [x] **Step 2: Run** `npx vitest run tests/engine/dynamic/milestones.test.ts` → FAIL.
- [x] **Step 3: Implement** as in R11.
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15): milestones and frame changes`

---

### Task 20: Answering a milestone, and the vow

**Files:**
- Modify:
  - `src/engine/actions/dynamic.ts` (`dynamic/answer_milestone`);
  - `src/engine/dynamic/intents.ts` (`milestone_accepted` / `milestone_refused`);
  - `src/engine/dynamic/directives.ts` (the open milestone's line in `dynamic:<unitId>`);
  - `content/core/memoryRules.json` + resolvers (`dynamic_frame_play` / `_role` / `_rule`, `dynamic_sworn`).
- Test: `tests/engine/dynamic/milestoneAnswer.test.ts`

**Interfaces:**
- Produces: `answerMilestone(draft, ctx, milestoneId, answer: 'accept' | 'refuse', via: 'card' | 'text'): EngineEvent[]`.

- [x] **Step 1: Write the failing tests.**
  - `accept applies the frame and moves no hold` (user R1);
  - `refuse drops one band and sets a 7-day cooldown`, and the same milestone is not offered again before it;
  - `the vow sets sworn and pins a memory fact` (importance 5, audience the pair, `pinned`);
  - `the intent path equals the card path` (same events except `via`);
  - `a stale milestone id is refused` (`handler_failed`, no change).
- [x] **Step 2: Run** `npx vitest run tests/engine/dynamic/milestoneAnswer.test.ts` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15): answering milestones and the vow`

---

### Task 21: The milestone card, the Tonight chip, the cut-in, and the long-run guard

**Files:**
- Create: `src/ui/dynamic/cards.ts` (`renderMilestoneCard`; later tasks add the claim, return and exit cards here).
- Modify:
  - `src/ui/voice/sources.ts` (`VOICE_OF.dynamic = 'personal'`);
  - `src/ui/hub/model.ts` (`TonightItem.kind` += `dynamic`; one item per unit with an open claim, milestone, return or aftermath notice, after `booking`);
  - `src/ui/scene/sceneScreen.ts` and `src/ui/comms/commsTab.ts` (the card where demands are drawn);
  - `src/app.ts` (`reportEvents`: `frame_changed` → `cutIn` + a toast in her voice);
  - `content/core/glossary.json` (`milestone`, `vow`, `frame`).
- Test: `tests/ui/dynamic/milestoneCard.test.ts`, `tests/sim/dynamicLongRun.test.ts`

**Interfaces:**
- Produces: `renderMilestoneCard(host, ctx: { state; reg; milestone: OpenMilestone; onAnswer(a: 'accept' | 'refuse') })`; `tonightItems` gains the `dynamic` kind.

- [x] **Step 1: Write the failing tests.**
  - jsdom: `the card shows her text in her voice with ACCEPT / REFUSE, both with data-analyze`; `the Tonight list shows one dynamic chip per waiting unit and still keeps generation last`.
  - `tests/sim/dynamicLongRun.test.ts`: `no frame_changed without a milestone` over 120 seeded days with an eager holder and a sim that accepts half of everything. Every `frame_changed` in the log is preceded in the same action by `milestone_offered`'s answer or an automatic milestone.
  - The same sim logs the day of `play` and `role`, informational only, not asserted (pace targets are balance targets, spec §4).
- [x] **Step 2: Run** both files → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** the files, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15): the milestone card and the long-run frame guard`

---

## Chunk (f): domains and command

### Task 22: Claims, yielding, refusing, talking, losing and contesting

**Files:**
- Create: `src/engine/dynamic/domains.ts`
- Modify:
  - `src/engine/dynamic/dayStep.ts`;
  - `src/engine/dynamic/hold.ts` (band loss → `domain_lost`);
  - `src/engine/personal/bookings.ts` (export `settleOrder(state, reg, a, b): string` from `settleWinner`);
  - `src/engine/actions/dynamic.ts` (`dynamic/answer_claim`);
  - `src/engine/relations/intents.ts` + `apply.ts` (`compromise_reached.claimId`);
  - `src/engine/dynamic/forget.ts`;
  - memory rule `dynamic_domain_yielded`.
- Test: `tests/engine/dynamic/domains.test.ts`

**Interfaces:**
- Produces:
  - `claimsDue(draft, ctx): EngineEvent[]`;
  - `answerClaim(draft, ctx, claimId, answer: 'yield' | 'refuse' | 'talk'): EngineEvent[]`;
  - `yieldPartial(draft, ctx, claimId): EngineEvent[]`;
  - `loseDomain(draft, unitId, domainId, reason: 'band' | 'exit' | 'force' | 'contest'): EngineEvent`;
  - `capabilitiesOf(state, reg, unitId): Capability[]`, `hasCapability`, `holderWith(state, reg, cap): string | null`;
  - `settleDomainConflict(draft, ctx, claimantId, holderId, domainId): EngineEvent[]`.

- [x] **Step 1: Write the failing tests.**
  - `a claim opens only when frame and band meet the domain, with one draw`; `no due claim → no draw`.
  - `yield adds the domain and its capabilities`; `refuse costs by frame and cools down 7 days`.
  - `talk then compromise yields partially for 7 days, then she claims again`.
  - `falling below the band loses the domain at once` (`domain_lost { reason: 'band' }`).
  - `one domain, one holder`: a second holder's claim runs `settleOrder`; the loser −10 hold and `domain_contested`.
  - `capabilitiesOf never reads a domain id` (a fixture pack renames every domain; the capabilities still work).
- [x] **Step 2: Run** `npx vitest run tests/engine/dynamic/domains.test.ts` → FAIL.
- [x] **Step 3: Implement** as in R12.
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15): domains claimed, yielded, lost and contested`

---

### Task 23: Capabilities at work (bookings, device, quarters, rules, standing)

**Files:**
- Modify:
  - `src/engine/personal/bookings.ts` (`rollBookings`: `booking_uncapped` skips the weekly cap; `book_ahead` books up to 3 days ahead; `booking_consent` holds another holder's booking: `consentProblem`);
  - `src/engine/personal/access.ts` (`deviceAccess`: `max(level, 4)` for a `device_floor` holder; nothing stored);
  - `src/engine/hub.ts` (`whereaboutAt`: the commander in her quarters on her booked evenings with `second_place`; derived);
  - `src/engine/bonds/rules.ts` (`rollRules`: templates tagged `jealousy_games` / `service` only with `relation_rules`);
  - `src/engine/power/standing.ts` (`standingOf` + `coLeaderStanding` for `co_leader`; the hierarchy marks her `coLeader`).
- Test: `tests/engine/dynamic/capabilities.test.ts`

**Interfaces:**
- Consumes: `hasCapability`, `holderWith` (Task 22).
- Produces: `consentProblem(state, reg, booking): string | null`; `Hierarchy.coLeaderId?`.

- [x] **Step 1: Write the failing tests.**
  - `a holder with booking_uncapped books a third time in a week`; `book_ahead books day + 2`.
  - `deviceAccess is 4 for a device_floor holder whose rules give 2`, and back to 2 when she loses the domain.
  - `the hub places the commander in her quarters on her booked evening` (and nowhere new without the capability).
  - `relation_rules unlocks jealousy_games templates for her only`.
  - `co_leader adds 15 standing and marks coLeaderId`.
  - `possessive booking_consent refuses another holder's booking with a fact for both`.
  - `without any domain every reader is unchanged` (the existing P9c / P9b / hub suites stay green).
- [x] **Step 2: Run** `npx vitest run tests/engine/dynamic/capabilities.test.ts` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15): domain capabilities reach bookings, device, hub, rules and standing`

---

### Task 24: The claim card and the submit claim

**Files:**
- Modify: `src/ui/dynamic/cards.ts` (`renderClaimCard`), the scene, comms and hub wiring of Task 21, `src/dynamic/controller.ts` (`talk` opens a one-to-one scene, like P9's demand TALK), `content/core/glossary.json` (`domain`, `claim`, the six domain capabilities).
- Test: `tests/ui/dynamic/claimCard.test.ts`

**Interfaces:**
- Produces: `renderClaimCard(host, ctx: { state; reg; claim: OpenClaim; onAnswer(a: 'yield' | 'refuse' | 'talk') })`.

- [ ] **Step 1: Write the failing tests** (jsdom): `the card names the domain by label and lists what it grants in plain words`; `YIELD / REFUSE / TALK carry data-analyze`; `the submit claim (R1 contest) uses the same card with her words`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15): the claim card`

---

### Task 25: The override generalised over its source (engine)

**Files:**
- Modify:
  - `src/engine/warden/override.ts` (`OverrideSource.kind: 'warden' | 'holder'`; `rollOverride` writes to the source's slot; `OPEN_FIRST` when any override is open);
  - `src/engine/warden/conflict.ts` (`conflictOf(state, reg, order, judged?, source?)`, `herAlternative(state, reg, order, expectationId, source?)`; the internal `Ctx.warden` becomes the source's unit);
  - `src/engine/warden/state.ts` (`overrideOpen` returns the warden's or the holder's slot);
  - the five hook sites (`activities.ts:176`, `actions/base.ts:53`, `actions/expedition.ts:34`, `dilemma/flow.ts:290`, `actions/combat.ts:98`) call `rollOverrides(draft, ctx, order, opts)`.
- Create: `src/engine/dynamic/command.ts`
- Test: `tests/engine/dynamic/override.test.ts`

**Interfaces:**
- Produces:
  - `holderSource(state, reg, unitId): OverrideSource | null`;
  - `holderAgenda(state, reg, unitId): Expectation[]` (P13's type, `engine/warden/state.ts`);
  - `rollOverrides(draft, ctx, order, opts): EngineEvent[] | null` (the warden first, then holders with `countermand` by hold, descending; the first override wins);
  - `openOverrideOf(state): (OpenOverride & { source: 'warden' | 'holder'; unitId: string }) | null`.

- [ ] **Step 1: Write the failing tests.**
  - `P13 unchanged`: every `tests/warden/*` file stays green; `tests/warden/unaffected.test.ts` golden unchanged.
  - `warden first, one open`: with a warden whose override fires, no holder rolls; with the warden's open, a holder's roll throws `OPEN_FIRST`.
  - `a holder overrides an activity that conflicts with keep_me_close` (a `possessive` holder, an activity with another companion), chance = `weight × hold/100 × leniency × 2.0` capped at 0.9.
  - `no countermand, no roll` and `no conflict, no draw`.
  - `the holder's slot is state.dynamic.override and the warden's slot is untouched`.
  - `holderAgenda equals fallbackAgenda plus the possessive pair`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/dynamic/override.test.ts` → FAIL.
- [ ] **Step 3: Implement** as in R13. Keep P13's exports and signatures (new params are optional).
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15): the override generalised over its source`

---

### Task 26: Holder overrides answered, the chip, and the command directive

**Files:**
- Modify:
  - `src/engine/warden/override.ts` (`answerOverride` routes by source: the holder path is COMPLY hold +3 / favour +2; DEFY runs the order, hold −6, favour −3, `overrode_her`, contest; no `punishRoll`; ARGUE as P13);
  - `src/ui/warden/overrideChip.ts` (holder text, `glossary:holder_override`);
  - `src/warden/controller.ts` (`argue()` starts the scene with the override's unit);
  - `src/dynamic/directives.ts` (`dynamic:command:<unitId>`);
  - `src/engine/dynamic/forget.ts` (a removed holder's override is closed);
  - `content/core/glossary.json`.
- Test: `tests/engine/dynamic/overrideAnswer.test.ts`, `tests/ui/dynamic/overrideChip.test.ts`

**Interfaces:**
- Consumes: Task 25.

- [ ] **Step 1: Write the failing tests.**
  - `holder comply`: hold +3, favour +2, `override_answered`.
  - `holder defy has no warden punishment` (no `commander_punished`, no satisfaction change, `overrode_her` landed).
  - `old save override answers`: a fixture of a P13 save with `leashswap.warden.override` open loads and answers COMPLY exactly as before (deep-equal to the pre-P15 result).
  - `argue with a holder opens a scene with her`.
  - jsdom: `the chip names her and the alternative`.
  - `the command directive reaches other present members only`.
- [ ] **Step 2: Run** both files → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the files, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15): holder overrides answered`

---

## Chunk (g): how the squad learns

### Task 27: Suspicion, signs and the three levels

**Files:**
- Create: `src/engine/dynamic/knowledge.ts`
- Modify:
  - `src/engine/dynamic/dayStep.ts` (background, gossip, decay, the `audience` tell);
  - `src/engine/actions/dynamic.ts` (`registerAfterAction`: `blocking_changed` with a dynamic-scope item or contact and the observers present; a `visitor` moment; `protocol_slip`);
  - `src/analysis/providers/dynamic.ts` (new, only the knowledge rule now: a `knows_dynamic:*` / `suspects_*` fact turns visible once the observer and the commander shared a scene after its day);
  - `src/engine/tuning.ts` (`TUNING.squadKnowledge`);
  - `src/engine/dynamic/forget.ts`.
- Test: `tests/engine/dynamic/knowledge.test.ts`

**Interfaces:**
- Produces:
  - `addSign(draft, ctx, observerId, holderId, kind: SignKind): EngineEvent[]`;
  - `knowInstantly(draft, ctx, observerId, holderId, cause): EngineEvent[]`;
  - `knowledgeDayStep(draft, ctx): EngineEvent[]`;
  - `levelOf(state, observerId, holderId): KnowledgeLevel | undefined`.

- [ ] **Step 1: Write the failing tests.**
  - `signs add by table with multipliers`: a `protocol_slip` seen by a `high`-insight friend of the holder → 20 × 1.3 × 1.5 = 39.
  - `background`: `role` +3 a day, `rule` +6, `play` 0.
  - `gossip capped at 15 a day`.
  - `levels`: 60 → `suspects_dynamic` fact (hidden), 100 → `knows_dynamic` and `dynamic_known`.
  - `decay 2 a day, never below 60 within 7 days of reaching it`.
  - `closeness-only signs give suspects_close and +0`.
  - `an item with scope dynamic worn in front of her is instant knowledge`.
  - `the fact becomes known to the commander after a shared scene`.
  - `expected pace`: the §15.13 scenario (5 named units, `select_few`, `role`) → an ordinary woman suspects between day 8 and 11 and knows between day 14 and 21; the holder's friend about twice as fast (seeded, ±2 days).
- [ ] **Step 2: Run** `npx vitest run tests/engine/dynamic/knowledge.test.ts` → FAIL.
- [ ] **Step 3: Implement** as in R14.
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15): how the squad learns of a dynamic`

---

### Task 28: Reactions by profile and the Impunity term

**Files:**
- Create: `src/engine/dynamic/reactions.ts`
- Modify:
  - `src/engine/discipline/impunity.ts` (`ImpunityTerms.dynamic`; the literal and the sum in `impunityOf`);
  - `src/analysis/providers/discipline.ts` (`termLines`);
  - `src/engine/power/standing.ts` (the holder's standing malus from `dislikes` witnesses);
  - `src/dynamic/directives.ts` (`dynamic:witness:<observerId>`).
- Test: `tests/engine/dynamic/reactions.test.ts`

**Interfaces:**
- Produces: `reactToDynamic(draft, ctx, observerId, holderId): EngineEvent[]` (called on `knows_dynamic`); `dynamicTerm(state, reg, unitId): number`.

- [ ] **Step 1: Write the failing tests.**
  - `drawn and eligible: her own hold +5`; `drawn at the cap: nothing`.
  - `indifferent: a fact only`.
  - `dislikes: Impunity term +5, the holder's standing −5, and a hashed demand about it` (the same seed gives the same demand day; no rng draw).
  - `a possessive holder who learns of another competes` (a claim against the other's strongest domain); `a ritual holder respects it` (a fact).
  - `the witness directive is cautious at suspects and full at knows`, and only while the holder or the commander is present.
  - `impunityOf is unchanged without a dynamic` (`dynamic: 0`; the discipline suites stay green).
- [ ] **Step 2: Run** `npx vitest run tests/engine/dynamic/reactions.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15): the squad reacts to a dynamic by profile`

---

## Chunk (h): exit and aftermaths

### Task 29: Exit routes, their cost, and the romance step down

**Files:**
- Create: `src/engine/dynamic/exit.ts`
- Modify:
  - `src/content/schemas.ts` (`RelationshipStateSchema.stepDown?`);
  - `src/content/refs.ts`;
  - `content/core/relationshipStates.json` (R17 rows);
  - `src/engine/relations/graph.ts` (`romanceStepDown`);
  - `src/engine/actions/dynamic.ts` (`dynamic/exit`);
  - `src/engine/relations/intents.ts` + `apply.ts` (`compromise_reached.exitId`);
  - `content/core/eventDeltas.json` (`dynamic_exit`);
  - memory rules `dynamic_break`, `dynamic_ended`.
- Test: `tests/engine/dynamic/exit.test.ts`

**Interfaces:**
- Produces:
  - `exitSeverity(state, reg, unitId, route: ExitRoute, clean?: boolean): Severity`;
  - `exitDynamic(draft, ctx, unitId, route, opts: { toUnitId?: string; means?: 'discipline' | 'leash' | 'transfer_request'; clean?: boolean }): EngineEvent[]`;
  - `romanceStepDown(draft, reg, unitId): EngineEvent[]`;
  - `exitCostWord(state, reg, unitId, route): string` (for the UI).

- [ ] **Step 1: Write the failing tests.**
  - `play with hold 30: minor`; `role with two domains: major`; `sworn: extreme and a pinned fact` (a break).
  - `negotiated then compromise: one step down and a clean exit flag`.
  - `transfer runs the conflict and moves the domains to the winner`.
  - `force with the Leash: two steps up and the forced memory`.
  - `every domain is dropped except countermand`, which starts `command_kept` (Task 31 builds it; here: the flag `commandKept` on the aftermath request).
  - `romance steps down devoted → lover, never to comrade`.
  - `formerHolder is set and the dynamic resets to equal, hold 0, tracks kept`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/dynamic/exit.test.ts` → FAIL.
- [ ] **Step 3: Implement** as in R15 and R17.
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15): exit routes and their cost`

---

### Task 30: The aftermath engine

**Files:**
- Create: `src/engine/dynamic/aftermath.ts`
- Modify:
  - `content/core/aftermaths.json` (9 rows: weights from §9 and §16.6; stages and texts `AUTHOR TO WRITE`, numbers `AUTHOR TO TUNE`);
  - `src/engine/dynamic/dayStep.ts`;
  - `src/engine/dynamic/exit.ts` (pick on exit);
  - `src/engine/dynamic/forget.ts`;
  - `src/dynamic/directives.ts` (`dynamic:aftermath:<unitId>`).
- Test: `tests/engine/dynamic/aftermath.test.ts`

**Interfaces:**
- Produces:
  - `aftermathWeights(state, reg, unitId, ctx: { route; clean; force }): Record<AftermathKind, number>`;
  - `startAftermath(draft, ctx, unitId, kind): EngineEvent[]`;
  - `aftermathDayStep(draft, ctx): EngineEvent[]`;
  - `runAftermathEffect(draft, ctx, unitId, fx: AftermathEffect): EngineEvent[]` (one case per `AFTERMATH_EFFECTS` type);
  - `endAftermath(draft, unitId, reason: 'time' | 'resolved' | 'refused' | 'returned' | 'gone'): EngineEvent`.

- [ ] **Step 1: Write the failing tests.**
  - `weights follow style`: an `affectionate` holder's top weight is `grief`, a `possessive` one's `pursuit`, `cold` / `clinical` → `blackmail` only with compromat ≥ 1, else `cold_contempt`.
  - `low Regard raises cold_contempt and blackmail` (×1.5); `a clean exit allows only grief, return_offer and habits`; `force multiplies every weight by 1.5`.
  - `one draw at the pick, one more at a chain` (rng advanced exactly by those).
  - `each effect type runs`, with a table test over a fixture aftermath per type: stress, Want, a night knock, a demand of the stage's kind, a booking, rule interference, a rumor fact, the squad's Impunity record, defiance, Trust.
  - `pursuit chains to blackmail` when its row says so.
  - `a removed holder's aftermath ends with gone`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/dynamic/aftermath.test.ts` → FAIL.
- [ ] **Step 3: Implement** as in R15. Read rows by `kind` and effect `type`, never by id.
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15): aftermaths as data`

---

### Task 31: `command_kept`, `return_offer`, `successor`, `habits`, and re-kindling

**Files:**
- Modify:
  - `src/engine/dynamic/aftermath.ts`;
  - `src/engine/power/votes.ts` / `ballot.ts` (a `command_kept` holder counts her standing for her side, `TUNING.dynamic.commandKeptVoteWeight`; the commander's side winning twice ends it);
  - `src/engine/discipline/record.ts` (`enforce` of severity ≥ 3 on her ends it);
  - `src/engine/actions/dynamic.ts` (`dynamic/answer_return`);
  - `src/engine/dynamic/milestones.ts` (`rekindle`);
  - `src/engine/dynamic/intents.ts` (`protocol_slip` offered during `habits`);
  - `src/ui/dynamic/cards.ts` (`renderReturnCard`);
  - memory rule `aftermath_return_refused`.
- Test: `tests/engine/dynamic/aftermathKinds.test.ts`

**Interfaces:**
- Produces: `answerReturn(draft, ctx, answer: 'accept' | 'refuse'): EngineEvent[]`; `commandStruggleOf(state): { unitId; wins: number } | null`.

- [ ] **Step 1: Write the failing tests.**
  - `command_kept keeps countermand rolling after exit`; `two lost votes end it and drop the domain`; `an enforcement of severity 3 ends it`; `nothing else returns command`.
  - `return_offer accept re-kindles at testing; after_punishment at keeping with refusal_noted`; `refuse ends it with the memory fact`.
  - `successor raises the next eligible unit by 10 and puts her first in the queue`.
  - `habits offers protocol_slip with others present, and a slip adds the R14 sign`.
  - jsdom: `the return card carries data-analyze`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/dynamic/aftermathKinds.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15): command kept, return offers, successors and habits`

---

## Chunk (i): the Leash block, oversight, compromat

### Task 32: The Leash block

**Files:**
- Modify:
  - `src/engine/actions/leash.ts` (`askWarden` → `askCosigners`: P13's warden co-sign, then the holder block);
  - `src/engine/actions/combat.ts` (`combat/compel` the same);
  - `src/engine/warden/leash.ts` (`logCosignDenied` takes `cc: 'warden' | string`);
  - `src/engine/state/types.ts` (`LeashLogEntry.cc?: string`);
  - `src/dynamic/directives.ts` (`dynamic:leash_block:<unitId>`);
  - the leash request form shows "held for her co-sign" (`src/ui/leash/requestForm.ts`).
- Create: `src/engine/dynamic/leashBlock.ts`
- Test: `tests/engine/dynamic/leashBlock.test.ts`

**Interfaces:**
- Produces: `leashBlockOf(state, reg): string | null`; `blockCosignChance(state, reg, holderId): number`; `rollBlock(draft, ctx, targetId, kind): { ok: boolean; events: EngineEvent[] }`.

- [ ] **Step 1: Write the failing tests.**
  - `no block below owning or without leash_block: no draw`.
  - `a blocked compel is cancelled`, logged `denied` with `cc` = her id, `leash_blocked` emitted, and the oversight window gets the day.
  - `the warden co-signs first`: a warden denial stops before the block roll.
  - `a request on the holder herself is blocked too`.
  - `the P9c intercept still runs` (P9c suites green).
- [ ] **Step 2: Run** `npx vitest run tests/engine/dynamic/leashBlock.test.ts` → FAIL.
- [ ] **Step 3: Implement** as in R16.
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15): the Leash block`

---

### Task 33: Going around the block

**Files:**
- Modify:
  - `src/engine/actions/dynamic.ts` (`dynamic/bypass_leash`);
  - `content/core/activities.json` (the `comms` activity gains `focus: 'leash_terminal'`, shown only while a block stands: `requires.capabilityHeldBy: 'leash_block'`, a new optional field read in `checkActivity`);
  - `src/ui/leash/requestForm.ts` (the three routes when blocked; the ally route lists units with Trust ≥ 50; the reset route needs a `tech` ally);
  - memory rule `leash_bypass_found`.
- Test: `tests/engine/dynamic/bypass.test.ts`

**Interfaces:**
- Produces: `bypassLeash(draft, ctx, p: { route: 'comms' | 'reset' | 'ally'; allyId?: string; kind: LeashKind; unitId: string }): EngineEvent[]`.

- [ ] **Step 1: Write the failing tests.**
  - `comms costs the slot and files the request with no block`; `discovery 0.3` (seeded: over 400 tries 0.25–0.35).
  - `reset needs a tech ally` (refused without); discovery 0.1 with the ally's `tech`.
  - `ally: discovered → the ally's Trust −5`.
  - `discovered → overrode_her (major) on the holder, Regard −2, and the memory fact`.
  - jsdom: `the form offers the routes only while blocked`, each with `data-analyze`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/dynamic/bypass.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15): going around the Leash block`

---

### Task 34: Oversight's inquiry and the holder's cover

**Files:**
- Create: `src/engine/dynamic/oversight.ts`
- Modify:
  - `src/engine/dynamic/dayStep.ts`;
  - `src/engine/warden/intrigue.ts` (`addSuspicion` × `coverMult`);
  - `src/engine/special/debts/consequences.ts` and `intel.ts` (`oversightSuspicion` gains × `coverMult`);
  - `content/core/clocks.json` (`oversight_inquiry`, engine, 6 segments, visible);
  - `src/app.ts` (`reportEvents`: the corporate-voice notice).
- Test: `tests/engine/dynamic/oversight.test.ts`

**Interfaces:**
- Produces: `oversightDayStep(draft, ctx): EngineEvent[]`; `coverMult(state, reg): number`; `oversightActs(draft, ctx, holderId): EngineEvent[]`.

- [ ] **Step 1: Write the failing tests.**
  - `three blocks within 14 days advance the clock by one and open the thread once`.
  - `notices at 3 and 5`.
  - `on fill oversight acts on her by hash`: reprimand, transfer threat (then `removeFromService(…, 'reassigned')` after 7 days if the block stands) or forced Leash (counts as the `force` exit).
  - `cover`: a `role` holder → ×0.8 on P13 suspicion and the debts gain; `rule` → ×0.65; a `cruel` holder at `rule` → ×0.825; no holder → ×1 and the P12/P13 suites unchanged.
- [ ] **Step 2: Run** `npx vitest run tests/engine/dynamic/oversight.test.ts` → FAIL.
- [ ] **Step 3: Implement** as in R16 and R19.
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15): oversight's inquiry and the holder's cover`

---

### Task 35: Compromat

**Files:**
- Create: `src/engine/dynamic/compromat.ts`
- Modify:
  - `src/engine/dynamic/intents.ts` (`compromat_mentioned`);
  - `src/engine/actions/dynamic.ts` (`registerMomentTrigger('compromat_hint', …)` through `installDynamicHooks`: live while a present holder at ≥ `role` holds compromat and has a refusal in the last 3 days);
  - the writers in this package: an offer mocked before others (Task 40 calls it), a sworn vow before witnesses, a bypass discovered, a Leash on her filed by the commander;
  - `src/engine/dynamic/aftermath.ts` (`threaten_tell` uses one).
- Test: `tests/engine/dynamic/compromat.test.ts`

**Interfaces:**
- Produces:
  - `addCompromat(draft, holderId, text: string, witnesses: string[]): Fact` (tags `['compromat', 'holder:<id>']`, `hiddenFromCommander: true`, `knownBy: [holderId]`);
  - `compromatOf(state, holderId): Fact[]`;
  - `mentionCompromat(draft, ctx, holderId, factId?: string, summary?: string): EngineEvent[]` (turns the matching fact, or a new one, known to the commander).

- [ ] **Step 1: Write the failing tests.**
  - `compromat is invisible`: no `Knowledge` reading, count or hint shows it (`Knowledge.facts()` excludes it; the hub and dossier render no count).
  - `a mention reveals the matching fact`; `a mention with no matching fact writes a new known one with the summary` (cut to `factTextMax`, a pronoun for the commander dropped).
  - `compromat_mentioned is offered only while a present holder holds some`.
  - `her directive lists hers, never the player's view`.
  - `compromat_hint is live under its condition only`.
  - `blackmail's threaten_tell spreads it to the squad on refuse`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/dynamic/compromat.test.ts` → FAIL.
- [ ] **Step 3: Implement** as in spec §11.
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15): compromat`

---

## Chunk (j): Regard and shame

### Task 36: Regard

**Files:**
- Create: `src/engine/dynamic/regard.ts`
- Modify:
  - `src/engine/dynamic/dayStep.ts` (`vindictive`'s served days);
  - `src/engine/actions/dynamic.ts` (`registerAfterAction`: `marathon_done`, `physics_outcome`, `physics_caught`, `physics_slip`, `outside_feat` / `feat_noted` (P9b), `time_together`, `kept_promise`, a won run);
  - `src/dynamic/directives.ts` (the tone word);
  - `src/engine/tuning.ts` (`TUNING.regard`).
- Test: `tests/engine/dynamic/regard.test.ts`

**Interfaces:**
- Produces:
  - `regardOf(state, reg, unitId): number` (computes the start lazily, no write);
  - `ensureRegard(draft, reg, unitId)`;
  - `regardFall(draft, reg, unitId, humiliation: number, opts: { witness: boolean }): EngineEvent[]`;
  - `regardRise(draft, reg, unitId, kind: 'cost' | 'record' | 'pleased_high' | 'dignity' | 'value', amount?: number): EngineEvent[]`;
  - `regardBandOf(reg, n)`;
  - `regardTone(state, reg, unitId): string | null`.

- [ ] **Step 1: Write the failing tests.**
  - `start value`: 50 + impression offset; −10 with `knows_crime` and a negative reaction.
  - `fall by style`: humiliation 3 for a `cruel` holder = 3 × 1.5 × 1.3 × 1.3 = 7.605; a witness × 0.7; never below the floor (`possessive` 35).
  - `rises`: cost +3 only when her reading's r ≤ 0; record +2 on `marathon_done`; dignity +2 on a clean `released`; a P9b feat +3; a quiet meeting +1; `drill` doubles mastery rises.
  - `Regard never changes hold or frame` (no `hold_changed` from any Regard call).
  - `off: nothing is written` (no `regard` key anywhere).
  - `the tone word is the style's form at low or none and absent above`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/dynamic/regard.test.ts` → FAIL.
- [ ] **Step 3: Implement** as in R18.
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15): Regard`

---

### Task 37: Disappointment, the question, and the nickname

**Files:**
- Create: `src/engine/dynamic/shame.ts`
- Modify:
  - `src/engine/moments/vocabulary.ts` (`registerRipeSource(fn: (state, reg, unitId) => string[])`, read by `ripeSources`, with `resetRipeSources`);
  - `src/engine/dynamic/hooks.ts` (registers the `her_question` ripeness);
  - `src/engine/actions/dynamic.ts` (`registerAfterAction`: `moment_answered` from `her_question` → the Regard move);
  - `src/engine/state/types.ts` (`DEED_COUNTERS` += six);
  - `src/content/schemas.ts` (`ReputationSchema.tone?`);
  - `content/core/reputations.json` (three rows);
  - `src/engine/discipline/reputation.ts` (the tone choice);
  - `src/dynamic/directives.ts` (`dynamic:disappointed:<unitId>`);
  - memory rule `disappointed` (hidden).
- Test: `tests/engine/dynamic/shame.test.ts`

**Interfaces:**
- Produces: `checkDisappointment(draft, ctx, unitId, from: number, to: number): EngineEvent[]`; `questionRipe(state, reg, unitId): boolean`; `answerQuestion(draft, ctx, unitId, key: string): EngineEvent[]`; `squadRegardAverage(state, reg): number | null`.

- [ ] **Step 1: Write the failing tests.**
  - `disappointment`: a non-holder whose Trust was ≥ 60 and whose Regard crosses a band within 14 days → `disappointed`, a hidden fact, her `respect` habits paused, a directive with no lecture.
  - `the question is ripe under its conditions, 14 days per woman and one a week overall`; `clinical +2 for the honest key`.
  - `the nickname tone follows the squad's average Regard` (≥ 60 respectful, 30–59 pitying, < 30 mocking), and P9's existing nickname tests stay green.
  - `ripeSources is unchanged with no registered source` (P15a suites green).
- [ ] **Step 2: Run** `npx vitest run tests/engine/dynamic/shame.test.ts` → FAIL.
- [ ] **Step 3: Implement** as in R19b.
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15): shame without a narrator`

---

## Chunk (k): exchange and the head start

### Task 38: Exchange with combat and the squad

**Files:**
- Create: `src/engine/dynamic/exchange.ts`
- Modify:
  - `src/engine/combat/build.ts` (`registerCombatPassive(fn: (state, reg, unitId) => EffectSpec[])`, added in `squadCombatant` with source `dynamic`; `resetCombatPassives`);
  - `src/engine/discipline/impunity.ts` (the protection part of `dynamic`);
  - `src/engine/dynamic/dayStep.ts` (squad stress every 2 days);
  - `src/engine/bonds/want.ts` (`wantStep` multiplies its growth by `wantGrowthMult(state, reg, unitId)`; 1 when off).
- Test: `tests/engine/dynamic/exchange.test.ts`

**Interfaces:**
- Produces: `satisfactionOf(state, reg, unitId): 'content' | 'neutral' | 'frustrated'`; `protectionOf(state, reg): number` (0–0.3); `registerCombatPassive`; `wantGrowthMult(state, reg, unitId): number`.

- [ ] **Step 1: Write the failing tests.**
  - `content: outgoing +5 and incoming −5 in her combatant`; `frustrated: the reverse`; `neutral or no dynamic: no effect and the combat suites unchanged`.
  - `protection lowers other units' positive Impunity by standing × 0.3 %, capped at 30 %`.
  - `squad stress −1 every 2 days for units with Trust ≥ 50 toward a content holder`.
  - `drive`: a `high` holder's Want grows ×1.4 (± the hashed noise, the same on the same day), `low` ×0.7; stress 75 ×0.7; with the dynamic off the P9d Want suites are unchanged.
  - `no rng draw` in any of them.
- [ ] **Step 2: Run** `npx vitest run tests/engine/dynamic/exchange.test.ts` → FAIL.
- [ ] **Step 3: Implement** as in R19.
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15): the dynamic in combat and the squad`

---

### Task 39: The dynamic already underway (head start)

**Files:**
- Create: `src/engine/dynamic/headStart.ts`
- Modify:
  - `content/core/headStartMoments.json` (10 `probe` rows, one per axis);
  - `src/content/schemas.ts` (the "no `probe`" comment and check: `probe` rows need `axis`);
  - `tests/content/headStartSchemas.test.ts` (the core may carry `probe` rows; the picker still excludes them, `tests/engine/headStart/moments.test.ts` unchanged);
  - `src/engine/setup.ts` (`buildCampaign` calls `applyDynamicHeadStart` after `applyHeadStart` and `applySeeds`);
  - `src/headStart/controller.ts` / `src/engine/headStart/recap.ts` (`recapPairs` gains the probe moment of each such unit).
- Test: `tests/engine/dynamic/headStart.test.ts`

**Interfaces:**
- Produces: `applyDynamicHeadStart(draft, reg, r: SetupResult): EngineEvent[]`; `pickProbeMoment(reg, unit, seed): Entry | null`.

- [ ] **Step 1: Write the failing tests.**
  - `off by default`: a head start of 30 days with no `dynamicUnderway` → no `Relation.dynamic`, and the recap has no probe moment.
  - `underway for all`: an eager unit over 14 days gets round(14 × 0.30) = 4 hashed answers; hold inside *testing* at most; reading updated; first in the queue; back-off not counted.
  - `a card list limits it to those units`; `a seeded unit with startFrame keeps its frame`.
  - `no rng draw` (`state.rng` equals a build without the option).
  - `at most one probe moment per unit is added to the recap pairs`, written under `head_start_moment`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/dynamic/headStart.test.ts` → FAIL.
- [ ] **Step 3: Implement** as in R21.
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15): the dynamic already underway`

---

## Chunk (l): the player's way in

### Task 40: Offering yourself (engine)

**Files:**
- Create: `src/engine/dynamic/offer.ts`
- Modify:
  - `src/engine/actions/dynamic.ts` (`dynamic/offer`);
  - `src/engine/dynamic/intents.ts` (`offer_answered`);
  - `src/blocking/momentDirectives.ts` or `src/dynamic/directives.ts` (`dynamic:offer:<unitId>`, `next_reply`, event-driven);
  - `src/engine/tuning.ts` (`TUNING.offer`);
  - memory rules `offer_mocked`, `offer_corrected`.
- Test: `tests/engine/dynamic/offer.test.ts`

**Interfaces:**
- Produces:
  - `OfferComposition = Array<{ tab: OfferTab; ids: string[] }>`;
  - `offerChoices(state, reg, unitId): Record<OfferTab, Array<{ id; label; known?: PracticeAs | 'unknown' }>>` (filtered);
  - `answerOffer(state, reg, unitId, composition): { answer: OfferAnswer; hold: number; favour: number; reveal?: string; corrected?: string }`;
  - `makeOffer(draft, ctx, unitId, composition, opts: { askInReturn?: boolean }): EngineEvent[]`.

- [ ] **Step 1: Write the failing tests.**
  - `craves lands`: hold +6, favour +3; `enjoys` +3 / +1; `dislikes` → `mocked` for a `cruel` holder and `refused` for an `affectionate` one, −3 / −2.
  - `unknown reveals the zone` (`zone_revealed`, a fact tagged `expect:worship.<id>`).
  - `timing`: content × 1.5; frustrated × 0.5.
  - `the position moves`: unasked → r +0.1; with ask-in-return → `gain`.
  - `a time offer at role becomes a book_ahead claim with chance 0.4` (one draw); at `play` no draw.
  - `the cap reached and she is no holder: a kind refusal with no hold`.
  - `gated entries never appear in the choices` (a disabled category, her limit, a dynamic-scope entry at `equal`).
  - `the intent confirms; a mismatched answer is dropped; correction text becomes a fact`.
  - `Regard falls for her and the witnesses by the entry's humiliation`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/dynamic/offer.test.ts` → FAIL.
- [ ] **Step 3: Implement** as in R20.
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15): offering yourself`

---

### Task 41: Mastery, revealed zones and mood signs

**Files:**
- Create: `src/engine/dynamic/mastery.ts`
- Modify: `src/engine/actions/dynamic.ts` (`registerAfterAction`: `physics_outcome` with a contact target, the mouth acts); `src/engine/tuning.ts` (`TUNING.mastery`); memory rule `zone_revealed`.
- Test: `tests/engine/dynamic/mastery.test.ts`

**Interfaces:**
- Produces: `addMastery(draft, reg, unitId, targetId, xp): EngineEvent[]`; `masteryLevel(state, unitId, targetId): number`; `revealedExpectations(state, reg, unitId): Partial<ExpectationProfile>` (fields with a revealing fact); `moodSigns(state, reg, unitId): string[]`.

- [ ] **Step 1: Write the failing tests.**
  - `+5 per act and +3 when the how matched`; levels at 20 / 60 / 120 / 200 / 320; `mastery_gained` once per level.
  - `another woman starts from zero`.
  - `mastery ≥ 2 reveals an unknown target without a corrected answer`.
  - `revealed shows only fields with a fact`.
  - `moodSigns shows tells only once revealed, and the satisfaction word only after a shared scene today`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/dynamic/mastery.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15): mastery per target and revealed zones`

---

### Task 42: The offer composer and `[OFFER MYSELF]`

**Files:**
- Create: `src/ui/dynamic/offerComposer.ts`
- Modify:
  - `src/ui/scene/sceneScreen.ts` and `src/ui/comms/commsTab.ts` (the chip next to the lead chips, shown while `offerChoices` is non-empty for the open counterpart);
  - `src/dynamic/controller.ts` (`offer(unitId, composition)` dispatches through `SceneController.stage` in a scene and directly in a DM; the outcome chip after her reply);
  - `content/core/glossary.json` (`offer`, `offer_answer`).
- Test: `tests/ui/dynamic/offerComposer.test.ts`

**Interfaces:**
- Produces: `renderOfferComposer(host, ctx: { state; reg; unitId; choices; onSend(c: OfferComposition, askInReturn: boolean); onClose() })`.

- [ ] **Step 1: Write the failing tests** (jsdom):
  - `seven tabs, only allowed entries`;
  - `worship targets show the known attitude or "?"`;
  - `one or two entries make an offer; a third is refused`;
  - `send dispatches dynamic/offer once`;
  - `every tab, entry and button carries data-analyze and resolves`;
  - `the chip is absent while the dynamic is off`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15): the offer composer`

---

### Task 43: The body map

**Files:**
- Create: `src/ui/dynamic/bodyMap.ts` (ported from `docs/drafts/bodymap/gen.js` and `builds.js` as pure functions: `outlinePath(build: Build, side: 'front' | 'back'): string`, `hairPath(hair, side)`, `renderBodyMap(host, ctx: BodyMapCtx)`)
- Modify: `css/19-dynamic.css` (zone colours by attitude, hatching by scent band, readable-mode list only), `content/core/glossary.json` (`body_map`).
- Test: `tests/ui/dynamic/bodyMap.test.ts`

**Interfaces:**
- Consumes: `revealedExpectations`, `masteryLevel` (Task 41), P15a `scentBand`, `worshipTargets[].zone`, `motionReduced` / `visualFlags` (readable mode).
- Produces: `BodyMapCtx { unitId; zones: Array<{ targetId; side; x; y; r; known: boolean; attitude?; meaning?; mastery: number; scent?: number; sources: string[] }>; build; hair; readable: boolean }`; `bodyMapZones(state, reg, knowledge, unitId): BodyMapCtx['zones']`.

- [ ] **Step 1: Write the failing tests.**
  - `unrevealed zone is a question mark` with no attitude class.
  - `explicit zones only with explicit_scenes`.
  - `builds blend`: `{ slim: 1 }` and `{ curvy: 1 }` give different outline paths, and `{ slim: 0.5, curvy: 0.5 }` lies between them (a sampled x at y = 272).
  - `readable mode draws only the list`.
  - `every zone carries data-analyze worshipTargets:<id>` and resolves.
  - `no url( and no network` (the `tests/assets.test.ts` rule holds for the built `style.css`).
- [ ] **Step 2: Run** `npx vitest run tests/ui/dynamic/bodyMap.test.ts` → FAIL.
- [ ] **Step 3: Implement** as in R20.
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15): the body map`

---

## Chunk (m): the DYNAMIC section, analysis, guard, docs

### Task 44: Her dossier › DYNAMIC and immersive mode

**Files:**
- Create: `src/ui/dynamic/section.ts`
- Modify:
  - `src/ui/squad/squadTab.ts` (`dynamicSection` after `bondBlock`; null while off, for grunts, and in immersive mode);
  - `src/ui/dynamic/cards.ts` (the exit confirm card with the cost word per route);
  - `src/dynamic/controller.ts` (`exit(unitId, route)`; `negotiated` opens the scene).
- Test: `tests/ui/dynamic/section.test.ts`

**Interfaces:**
- Consumes: `Knowledge.dynamic` (Task 46; until then the section reads a thin view built in this task's `dynamicSectionView` and Task 46 moves it behind `Knowledge`).
- Produces: `renderDynamicSection(host, ctx: DynamicSectionCtx)`.

- [ ] **Step 1: Write the failing tests** (jsdom):
  - `shows frame, band, domains, tracks as bands, the vow, her reading in her words, open cards and the exit button`;
  - `raw hold only with show raw values`;
  - `immersive hides the section and the bands but the hub chip and the cards still show`;
  - `the exit card shows the cost as a word per route`;
  - `every row carries data-analyze and resolves`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/dynamic/section.test.ts` → FAIL.
- [ ] **Step 3: Implement** as in R25.
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15): the DYNAMIC dossier section`

---

### Task 45: CMDR lines, the scene header chip, notices

**Files:**
- Modify:
  - `src/ui/commander/cmdrCard.ts` ("Held by {name}" lines);
  - `src/ui/bonds/chips.ts` or `src/ui/scene/sceneScreen.ts` (a frame chip beside the lead chip for a present holder at ≥ `play`);
  - `src/app.ts` (`reportEvents`: `aftermath_started` cut-in plus a toast in her voice; `domain_lost`, `sworn` and `leash_blocked` toasts in her voice; all hidden by nothing, immersive or not).
- Test: `tests/ui/dynamic/surfaces.test.ts`

- [ ] **Step 1: Write the failing tests** (jsdom): `the CMDR card lists each holder and her domains`; `the frame chip is beside the lead chip with data-analyze glossary:frame`; `notices use VOICE_OF.dynamic and her accent`; `nothing renders while off`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15): CMDR lines, the frame chip and her notices`

---

### Task 46: `Knowledge.dynamic`, providers and glossary

**Files:**
- Modify:
  - `src/analysis/knowledge.ts` (`dynamic(unitId, reg): DynamicView`);
  - `src/engine/dynamic/view.ts` (new: `dynamicView(state, reg, unitId, opts: { raw; hidden })`);
  - `src/analysis/providers/dynamic.ts` (`registerDynamicProviders`: the 11 registries and the R25 glossary ids);
  - `src/analysis/providers/core.ts` (`registerCoreProviders`, `CORE_GLOSSARY_IDS`);
  - `content/core/glossary.json`;
  - `tests/helpers/analyze.ts` (`SAMPLE_ADDRESS` for each bare source);
  - `src/ui/dynamic/*` (read through it).
- Test: `tests/analysis/dynamicReadings.test.ts`

**Interfaces:**
- Produces: `DynamicView { frame?; band?: string | 'felt'; raw?: number; domains: Array<{ id; label; claimed: boolean; partial?: boolean }>; tracks: Array<{ id; band }>; sworn: boolean; reading?: string; expectations: Partial<ExpectationProfile>; signs: string[]; heldBy: Array<{ unitId; domains: string[] }>; compromat: Fact[]; knownLevels: Array<{ observerId; level }> }`.

- [ ] **Step 1: Write the failing tests.**
  - `the view shows only what the commander could know`: an unrevealed expectation is absent, compromat unmentioned is absent, a suspicion level unrevealed is absent, Regard is absent always.
  - `immersive: band is felt and the analyze answer is glossary:dynamic_felt`.
  - `every provider key has a sample address` (`tests/analysis/hidden.test.ts` `keysWithoutSample` stays empty).
  - `the glossary ids match CORE_GLOSSARY_IDS exactly`.
- [ ] **Step 2: Run** `npx vitest run tests/analysis/dynamicReadings.test.ts` → FAIL.
- [ ] **Step 3: Implement** as in R25.
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15): dynamic readings through Knowledge`

---

### Task 47: Hidden sentinels and analysis coverage

**Files:**
- Modify: `tests/fixtures/analyze/hidden.ts` (a P15 section), `tests/analysis/hidden.test.ts`, `tests/ui/analyzeCoverage.test.ts` (the DYNAMIC section, the cards, the composer, the body map, the DYNAMIC setup block, SYS Dynamic), `content/core/glossary.json` (whatever the coverage test still finds).
- Test: those files.

- [ ] **Step 1: Write the failing tests.** Sentinels:
  - hold 37.37 (raw off);
  - Regard 61.61;
  - suspicion 59.59;
  - reading r 0.4141;
  - mastery xp 23.23;
  - a compromat fact `SENTINEL_COMPROMAT_P15`;
  - an unrevealed tell `SENTINEL_TELL`;
  - an aftermath stage day 7.77;
  - her override chance (computed, asserted absent as text).

  The test asserts that no reading, label or toast text contains them. The coverage test marks every new screen.
- [ ] **Step 2: Run** `npx vitest run tests/analysis/hidden.test.ts tests/ui/analyzeCoverage.test.ts` → FAIL (or PASS where earlier tasks did it; add the missing sentinel until one fails, then fix it).
- [ ] **Step 3: Implement** what is missing.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `test(P15): hidden sentinels and analysis coverage`

---

### Task 48: The unaffected guard and the manual test

**Files:**
- Create: `tests/dynamic/unaffected.test.ts`, `docs/MANUAL_TEST_P15.md`
- Test: `tests/dynamic/unaffected.test.ts`

**Interfaces:**
- Consumes: `tests/helpers/unaffectedWeek.ts`, `tests/fixtures/unaffected-week.json` (read-only; never regenerate it for P15).

- [ ] **Step 1: Write the test.** It should pass at once if the gate holds; make it fail first against a deliberately wrong golden, then correct it.
  - `unaffected week`: `runWeek` ends deep-equal to the golden (log, rng, state hash) with none of the new keys (`dynamic`, `regard`, `mastery`, `expectations`, `practice`).
  - `categories on but holders 0`: `tweak` enables every category and sets `state.dynamic = { setup: { holders: 0, … } }` → same rng and log; no new relation keys.
  - `a holder in the squad, but nobody eligible present and no probe due`: same rng.
  - `the intent prompt is the pinned fixture`.
  - `the context block for a comrade scene has no dynamic: directive`.
- [ ] **Step 2: Run** `npx vitest run tests/dynamic/unaffected.test.ts`.
- [ ] **Step 3: Write `docs/MANUAL_TEST_P15.md`** (about 14 steps, in the style of `MANUAL_TEST_P15a.md`):
  - import a card with practice and expectations, and lock a field;
  - the DYNAMIC block and seeds;
  - a probe directive in the prompt (SYS › debug) and its answer;
  - `first_yes` in a scene;
  - `first_protocol` as a booking;
  - a claim card with YIELD and TALK;
  - a holder override with COMPLY and DEFY, and with a warden in LEASHSWAP mode;
  - the Leash block and a comms-terminal bypass;
  - the squad learning (a witness directive);
  - an exit with its aftermath notice;
  - the offer composer and a revealed zone on the body map;
  - immersive mode;
  - a campaign with no practice category looks as before.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `test(P15): the unaffected guard and the manual test`

---

### Task 49: Docs

**Files:**
- Modify:
  - `docs/packages/P15-dynamic-core.md`: the status line (`implemented`) and an **Implemented as** section with every ruling R1–R25, the rulings made while building, the non-obvious things and the open items;
  - `docs/00-overview.md`: §5.2 (`profile_import` sections, `intent_extract`'s new types and count), §5.4 (the P15 interfaces), §8 (`dynamicHidden`, the campaign DYNAMIC settings), §9 (status);
  - the specs of **P16**, **P16b**, **P17**, **P17a**, **P17b**, **P17c**, **P17d**, **P17e**, **P17f**, **P18**, **P23** and **P25**: an **Interfaces already provided by P15** section (what exists, what is reserved for them: the P16 gain rows and producers, track xp, favour from verdicts and gaps, the reserved signs, `registerRipeSource`, `registerCombatPassive`, `registerEventLanded`);
  - the revised ruling E (spec §16.1): wherever P15a §9, P16 §7, P17c §3 and P17e §6 cite "ruling E" or "no inner meter", point them to the §16.1 wording (acceptance 13);
  - `CLAUDE.md`: one rule line for P15 like the other packages;
  - `docs/CONTENT.md` (the 11 registries, `stepDown`, the `probe` head-start rows, `reputations[].tone`).
- Test: none (docs). `npm test` must still pass.

- [ ] **Step 1: Write the docs** as listed.
- [ ] **Step 2: Run** `npm test` → PASS; `npx vitest run tests/content/pronouns.test.ts` → PASS.
- [ ] **Step 3: Commit** `docs(P15): implemented as, overview, hand-off notes`
