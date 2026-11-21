# P15a Scene Blocking, Moments and Contact Physics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One model of the scene that every later 0.2 system reads:
- **the blocking**: who is where, in what posture, touching whom, wearing what, doing what. It is kept by the engine and reaches the prompt every turn as a `[BLOCKING]` block;
- **moments**: points of tension with three engine-owned options, whose words the model writes;
- **contact physics**: gauges, her rhythm, the commander's endurance and the body layer. It runs in segments that never wait for the model.

All of it is data (twelve registries) and switched off by default. Four new content categories gate it (`worship`, `breath_play`, `bodily_fluids`, `watersports`), and nine more are added now for later packages.

**Architecture:**
- **Engine:** three pure folders.
  - `src/engine/blocking/` holds the per-person state, validation, `implies`, effects by channel and the per-message snapshots.
  - `src/engine/moments/` holds live sources, firing, options and her answer.
  - `src/engine/physics/` holds runs, segment planning and resolution, the endurance and her-skill growth, commander conditions, gaze, noise, combined holds, the marathon, stimuli and mouth acts.
  - Actions are in `src/engine/actions/{blocking,moments,physics}.ts`.
  - The rng is drawn only while a moment or a physics is live.
- **Model side:**
  - `intent_extract` gains an optional `staging` block: blocking changes, the ripe hint, the answer to an open moment and its labels. The block is offered only while the blocking is live; without it the prompt is byte-identical.
  - One new mechanic call type `physics_cues` (site `physics.cues`) fills her cue pool when a hold starts.
  - Directives `blocking:*`, `moment:*` and `physics:*` are derived in `applyContext` (`src/blocking/directives.ts`).
- **UI:**
  - In the scene screen: the BLOCKING strip with its chips, the moment card, the physics panel (turn-based by default, real time as a setting), the wake-up card and the "device out of reach" line.
  - The STOP WORD chip is always shown during a hold.
  - Elsewhere: SYS › Scene settings, the CONTENT section's `requires`, the commander's endurance and conditions in the COMMANDER FILE, endurance drills on TRAIN, and analyze providers through `Knowledge`.

**Tech Stack:** TypeScript 5 (strict), esbuild, zod 3, vitest (+ jsdom for UI). No new dependencies.

**Spec:** `docs/packages/P15a-scene-blocking-moments.md` (§1–§16.14; §16.15–§16.20 go to P17b, see rulings). Read before Task 1:
- `docs/00-overview.md` (§3, §5.2–§5.4, §8, §11);
- `docs/content/blocking.md` (the content; every text not given there is `AUTHOR TO WRITE`);
- `docs/content/lore.md` §0;
- the **Implemented as** of P3, P3b, P9c, P9d, P10, P10b, P10d, P11, P14 and P14c.

## Global Constraints

- **Off is byte-identical.** The blocking is **live** only while a scene is open and a present named unit is at bond tier `close` or `romantic` (`bondTierOf`). Later, P15's frame hook can also make it live (ruling R2). While it is not live:
  - no `[BLOCKING]` block, no `blocking:` / `moment:` / `physics:` directive, no chip;
  - no `staging` input to `intent_extract`: the prompt is byte-identical, pinned by `tests/fixtures/intent_extract/prompt_without_reading.txt`;
  - no moment pass and no physics;
  - no rng draw.

  `tests/warden/unaffected.test.ts`, `tests/special/unaffected.test.ts`, `tests/development/unaffected.test.ts`, every user of `tests/helpers/unaffectedWeek.ts` and `tests/engine/setup.test.ts` stay green **unchanged**. A seeded test that moves **stops and reports**; it does not get a new golden.
- **Old saves.** Every new field is optional: `SceneRecord.{blocking, moments, physics, stagingLog, activityId, extraSlots}`, `CampaignState.lastWake`, `Commander.{endurance, conditions, stimuli}`, `Relation.herSkill`, and the mirrored settings. There is no migration and the version is unchanged.
- **The engine owns every number** (overview P1/P2). The model reports changes and answers only in the closed vocabulary and the engine validates every one. A label is never read (P16 rule). A reroll or a swipe changes text only: which moment fired, its source, her reaction and every physics roll are decided by the engine from the campaign rng (spec §12).
- **Read by field and effect type, never by id** (P10 rule): postures, anchors, contacts, items, activities, sources and physics. The fixed vocabularies are only the closed enums in code: effect types, live kinds, escalation verbs, interaction types, cue kinds, response types, worn slots and condition effects.
- **Content gates.** Every gated entry carries `contentTags` (the house field; the spec's `tags`) and `scope: 'any' | 'dynamic'`.
  - A disabled category or her own limit (`contentAllowed(state, reg, entry, unitId)`) removes an entry from every chip, offer, prompt, label and analyze list.
  - `scope: 'dynamic'` needs P15's frame ≥ `play` (`frameOf` hook, `'equal'` until P15).
  - Turning a category off mid-scene strips the blocking values tagged with it and ends a physics that depends on one (Task 7).
- **Lore §0.** No pronoun for the commander in any registry text, `promptHint`, directive, cue line, label, toast or glossary entry (`tests/content/pronouns.test.ts` covers the twelve new registries). The model never receives a line that states the commander's feelings (spec acceptance 12; P15 §16.1): the physics directive carries perception, never feelings.
- **Analysis (P7a).** Every new chip, option, stat and card carries `data-analyze` and resolves (`tests/ui/analyzeCoverage.test.ts`). Every setting has `setting_<key>` in the glossary. Live readings go through `Knowledge`, and her expected option, her skills, her rhythm, her attention and the segment plan never reach a reading.
- **P14.** Every model call goes through `app.generations` with a declared site (`tests/llm/siteRegistry.test.ts`).
- **Prompt hygiene (P14c §0).** A `moment:` directive lasts one reply (`next_reply`). The `[BLOCKING]` block shows only the fields that are set, never defaults. No standing line describes the commander.
- **Directive ids** start with `blocking:`, `moment:` or `physics:`. None of them is a prefix reserved by P9, P9b, P9c, P9d, P9e, P11, P12, P13 or P14c.
- `npm test` rebuilds `dist/index.js` and `style.css`; commit both with every task.

## Where the plan rules on the spec (read before Task 1)

The user answered the rulings marked **(user)** on 2026-11-21. Task 30 copies every ruling into the spec's **Implemented as**. Numbers are the spec's TUNING drafts; any value the spec leaves open is `AUTHOR TO TUNE` in `TUNING`. Texts the spec does not give are `AUTHOR TO WRITE`.

### R1. What P15a builds now and what waits (user)

| spec part | P15a | completed by |
|---|---|---|
| §1–§15, §16.1–§16.14 | built, behind the stand-ins below | — |
| her style pair, `holdsUntil`, her expected option, worship meanings, position axes, the frame | hooks with neutral defaults: style `neutral`, `holdsUntil: 'signal'`, expected option per R10, frame `equal` | **P15** plugs in (`registerFrameReader`, `registerPhysicsStyle`, `registerHoldsUntil`, `registerExpectation`, `registerBlockingGate`) |
| `scope: dynamic` entries and sources | stored, validated, never offered while the frame is `equal` | **P15** |
| §16.15–§16.20: anatomy, relax-in-rhythm, depth, her edge, intimate stimulus kinds, their TUNING | **not built**; the role-reversal contacts (blocking.md §3.6) are not shipped | **P17b** (R.2 already owns `strap` / `her_anatomy`) |
| favour from a moment's gap (§7) | none: a matched / opposite answer changes her directive tactic and the escalation roll only; no relation axis moves (user) | **P16** (`Relation.dynamic.favour` reads `moment_answered`) |
| channels `camera`, `backdrop`, `pose_shot`, `filter`, `input`, `gestures` / `sensory` / `strain` / `rule` / `notice` | validated data and `effectsOf(…, channel)`; no visual or input reader (user). `input` and `mobility` words reach the `blocking:scene` directive | **P17c** / **P17d** / **P17** / **P16** / **P15** |
| the 48 posture presets, points and drift (blocking.md §7.1–§7.3) | the 13 base postures only | **P16b** |
| gaze rules (blocking.md §11) | not built | **P17c** |
| tells (blocking.md §12) | not built | **P15** (§15.8) |
| tempo and pressure mini-game for licking (§16.9) | the act and its gauges only | **P16b** |
| stillness skill in noise, rhythm mastery per pair, `endurance:<physics>` as a discipline, records in fiction time | stillness and mastery read 0; `marathon_done` is emitted with the fiction hours | **P16b** |
| Strain and suspicion from noise, the obscured presence layer, stop-word Trust | `physics_noise` events; the POV directive; the stop word ends the hold | **P17** |
| scent model (washing, intention, clinging, noticing, rooms) | `scentBand` reads base × hygiene × situation only (Task 26) | **P17d** |
| moment sources `her_demand`, `her_test`, `permission`, `summons`, `rule_collision`, `compromat_hint`, `ritual_due` | live only through `registerMomentTrigger` (none registered) | **P15**, **P16**, **P17a**, **P17e** |
| what a cheat or a slip costs her view of the commander (Regard, the motive, her discipline); her escalation adding a second physics by track level | `physics_caught` / `physics_slip` events; `startPhysics` accepts a `second` | **P15** / **P16** |
| mini-game toggles `tempo`, `posture`, `qte` (§16.13) | only `inhale` and the six interaction types | **P16b** |
| `her_marks` and the no-washing rule; `tongue_work` lowering her sweat layer; carrying her scent and the squad noticing; conditioned reactions from `craving` | the item row; `physics_outcome { result: 'checked' }` | **P16** / **P17d** / **P15** |
| the remote toy's pulses from her PDA; a slip's screen glitch | the item row and its `escalation remote_pulse` | **P17c** |

Task 30 writes the hand-off notes into each of those specs. The planning commit already adds a short "**Left to this package by P15a**" note to each one, so a later planner sees them now.

### R2. When the blocking is live

`blockingLive(state, reg): boolean` is true when:
- `state.scene` is open, and
- some participant is a named, living unit with `bondTierOf(...) !== null`, or a reader registered with `registerBlockingGate(fn)` says yes. P15 registers one for frame ≥ `play`; none is registered in P15a.

Grunts never make it live. Everything in this package starts with this gate, and the acceptance-1 guard (Task 29) pins it.

`frameOf(state, unitId): 'equal' | 'play' | 'role' | 'rule'` returns `'equal'` until P15 registers a reader. An entry or source with `scope: 'dynamic'` is allowed only for a unit whose frame is `play` or higher.

### R3. Content categories (user: all added now)

`contentCategories` gains 13 ids, all off by default, `description: "AUTHOR TO WRITE: …"`, `order` after the existing nine:

| category | owner of its mechanics |
|---|---|
| `worship`, `breath_play`, `bodily_fluids`, `watersports` | P15a |
| `service`, `denial`, `exposure_risk` | P15 / P16 |
| `pet_play`, `objectification`, `deprivation` | P17b |
| `strap`, `her_anatomy`, `feminization` | P17b rev. |

- `ContentCategorySchema` gains `requires?: string[]`; `watersports` has `requires: ['bodily_fluids']`.
- `setCategories` drops a category whose `requires` are not all enabled. A switch that turns off `bodily_fluids` also turns `watersports` off (`content_changed` lists both).
- The CONTENT toggle of such a category is `aria-disabled` with the reason "needs Bodily fluids" while its requirement is off.
- P17b's `coercion` is not used by any row and is **not** added.

### R4. Registries (12) and the entry shape

All twelve are in `DESCRIBED_REGISTRIES`, and all but `physicsCues` and `escalationVerbs` are in `PLAYER_VISIBLE`. The seven that may carry `contentTags` (`worshipTargets`, `blockingContacts`, `blockingItems`, `blockingActivities`, `momentSources`, `contactPhysics`, `stimulusKinds`) join `CONTENT_GATED_REGISTRIES`, each with a `GATE_PROBES` entry.

```
worshipTargets      { id, contentTags, side: 'front'|'back'|'both', zone: { front?: {x,y,r}, back?: {x,y,r} }, stimuli: StimulusKindId[], label, description }
blockingPostures    { id, label, description, promptHint, effects }                          // no scope (physics, not power)
blockingAnchors     { id, kind: 'general'|'relative'|'furniture', requires?: { affordances: string[] }, label, description, promptHint, effects }
blockingContacts    { id, scope, contentTags?, dir: 'her'|'commander'|'either'|'none', target?: WorshipTargetId[],
                      implies?: { actor?: Side, receiver?: Side }, requires?: { affordances?: string[] },
                      physics?: Array<{ id: PhysicsId, seal?: Seal[], pressure?: number }>, stimuli?: StimulusKindId[],
                      sources?: Record<MomentSourceId, number>, mouth?: true, label, description, promptHint, effects }
blockingItems       { id, scope, contentTags?, slots: WornSlot[], slotMode?: 'all'|'one', wornBy?: 'commander'|'her',
                      physics?, stimuli?, sources?, label, description, promptHint, effects }
blockingActivities  { id, scope, contentTags?, actor: 'her'|'commander', attention?: 'on_commander'|'divided'|'elsewhere'|'none',
                      interruptible?: boolean, impliedPosture?: PostureId, pairTags?: Array<'focused'|'relaxed'|'body'|'asleep'|'eating'>,
                      fits?: string[] /* her pairTags, or 'any' */, presence?: 'unnoticed'|'felt', judged?: true,
                      sources?: Record<MomentSourceId, number>, fromActivities?: string[], label, description, promptHint, effects }
momentSources       { id, scope, contentTags?, frame: [Opt, Opt, Opt], live: LiveKind[], remember?: Array<{ option: 0|1|2, importance: 1..5 }>,
                      generalMeeting?: true, description }     // Opt = { type: ResponseType, generic: string ≤ 40 }
contactPhysics      { id, contentTags?, gauge: { kind: 'capacity'|'fill'|'dirt'|'progress', start: number }, interaction: InteractionType,
                      skill: boolean, segmentSeconds: number, chains?: Array<{ on: 'slip', to: PhysicsId, start?: number }>, label, description, promptHint }
physicsCues         { id, kind: CueKind, physics?: PhysicsId[], lines: string[3..5], description }   // the fallback pool
stimulusKinds       { id, contentTags?, family: 'scent'|'sweat'|'taste', label, description, perception: { aversion, enduring, accustomed, craving, adoring, separated } }
escalationVerbs     { id, label, promptHint, description }                                  // ids are the closed enum ESCALATION_VERBS
commanderConditions { id, effects: Array<{ type: 'social_rank', delta: number } | { type: 'stress', amount: number }>, label, description, promptHint }
```

- `Side = { posture?: PostureId, anchor?: AnchorId }`.
- The spec's `holder` / `subject` keys are `actor` / `receiver`: the actor is whoever does the act, as `dir` says. For `dir: 'either'` the stored `direction` picks the actor.
- `dir` values: `her` = ←, `commander` = →, `either` = ↔, `none` = no touch.
- Mapping notes for Tasks 3–5:
  - Anything in a blocking.md "Effects" cell that is not one of the 18 effect types goes into `promptHint` or `description`, never into a new type. Examples: "her smirk", "her laugh", "she may fall asleep", "visitors address her".
  - Every "AUTHOR TO WRITE" text keeps that prefix.

### R5. Effects (closed vocabulary, `BlockingEffectSchema`, zod discriminated union)

```
camera { mode: 'from_below'|'face_close'|'ignored'|'pov_floor'|'pov_dark'|'ceiling' }   backdrop { id }   pose_shot { kind }
filter { kind: 'sensory_dark'|'alarm' }   perception { self?: 'obscured', others?: 'obscured' }
input { limit: 'muffled'|'garbled'|'no_speech'|'gestures_only'|'no_hands'|'action_only', strength?: 1..3 }
gestures { variant: 'pet'|'head_only' }   device { lock: 'tabs' }   sensory { kind: 'scent'|'touch'|'sound'|'temp', intensity: 'low'|'high'|'overwhelming' }
sound { muffle: true } | sound { id: SoundId }   visibility { hiddenFromDoor?: true, exposing?: true, hideable?: false, unlessPosture?: PostureId[] }
mobility { level: 'none'|'limited'|'crawl'|'follows' }   strain { condition: 'stillness'|'silence'|'posture'|'endurance', rate: number }
escalation { verb: EscalationVerb }   physics { id }   rule { template }   notice { kind: 'knows_dynamic'|'seen' }   status_after { id, afterExchanges }
```

- `perception.others` means the bearer perceives the others obscured; `perception.self` means the bearer is obscured to the others.
- `status_after` sets a commander condition when the value is removed after being held at least `afterExchanges` exchanges (`id` is a `commanderConditions` id).
- **Readers built in P15a:**
  - `perception` and `camera.pov_dark` → `blocking:pov`;
  - `input` and `mobility` → the `blocking:scene` words;
  - `device` → the tab lock;
  - `sound` → muffle and the bell;
  - `visibility` → `third_party`;
  - `mobility` → transitions;
  - `escalation` → her answer;
  - `physics` → `startPhysics`;
  - `status_after` → conditions.
- All the other types are data (R1).
- The visual hints never gate anything (spec §3).

### R6. The blocking state

```ts
// src/engine/blocking/state.ts (leaf: types and pure helpers only)
export const COMMANDER = 'commander';
export const WORN_SLOTS = ['eyes', 'ears', 'mouth', 'face', 'head', 'neck', 'hands', 'body', 'legs', 'groin', 'feet', 'prop'] as const;
export type Intimacy = 'none' | 'close' | 'intimate' | 'explicit';
export interface Blocking {
  posture?: string; anchor?: { id: string; relTo?: string };
  contact?: { id: string; with: string; direction: 'from' | 'to'; target?: string; since: number /* exchange */ };
  worn?: Partial<Record<WornSlot, { id: string; since: number }>>;
  activity?: string; intimacy?: Intimacy; note?: string;
}
// SceneRecord
blocking?: Record<string /* unit id | 'commander' */, Blocking>;
activityId?: string;            // the P2 activity that opened the scene (scene/start payload)
stagingLog?: StagingSnapshot[]; // { at: chat index, blocking, moments } — the state before a change, newest last, ≤ TUNING.blocking.logMax
```

- **A field that is unset is not shown.** A person with no fields is absent from `[BLOCKING]`. `blockingOf(scene, personId)` returns the stored fields. Her `activity` reads as `attending` when unset (spec §2), but that default is not rendered.
- The spec's `blocking.md` "her_bunk" anchor is `on_bunk`.
- `contact` is stored on the **receiver**, with `with` = the actor and `direction` = `'from'` when she acts. One contact per receiver.
- `implies` (spec §2.2):
  - setting a contact writes the actor's and the receiver's `posture` / `anchor` from `implies`, with `on_person.relTo` = the other;
  - it keeps the replaced values in the snapshot log;
  - removing the contact restores the receiver's previous anchor from the log, else `beside_her` relative to her.
- **Transitions** (`transitionProblem(state, reg, personId, change): string | null`, the chips ask it):
  - `mobility none` freezes posture and anchor;
  - `limited` refuses anchor changes and any posture whose id starts with `standing`;
  - `crawl` keeps the posture `all_fours`;
  - `follows` allows anchor changes only to a `relative` anchor with her as `relTo`.
- **Validation of every change** (`blocking/set`, the extractor and the engine): the vocabulary entry exists, `contentAllowed` passes for every present unit it touches, the scope fits the frame, `requires.affordances ⊆ sceneAffordances`, items fit free slots, and the person is present.
  - `sceneRoom(state, reg)` resolves in this order: a plan room whose `sceneLocationId` is the scene's location; else the plan room whose `hubRoomId` is the hub room with that `sceneLocationId`; else, for a `perUnit` location, `cabinOf(first participant)`.
  - Extractor changes below `TUNING.blocking.minConfidence` (0.6) are dropped.
- **Her activity** at scene start:
  - in a quiet meeting, the pastime's `herActivity` / `commanderActivity` when they are `blockingActivities` ids of the right `actor`;
  - else the first entry whose `fromActivities` contains `scene.activityId`;
  - else unset (= `attending`).

  Only the engine and the chips set an activity. The extractor is never offered `activity` (spec §2: a side activity exists only when the engine sets it).

### R7. Snapshots per message (spec §5) and the swipe

- Every change to `scene.blocking` or `scene.moments` first pushes `{ at: payload.at, blocking, moments }` (deep copies of the state before the change) onto `stagingLog`. `at` = `st.chatLength()` when the change was made. Extraction changes use the chunk's `readIndex`.
- **The swipe path** (`SceneController.onSwipe` / `handleEdited` / delete):
  - The chip, moment and physics actions of the scene screen go through `SceneController.stage(action)`.
  - `stage` dispatches the action. When the state was `lastApply.after` before the dispatch, it moves `lastApply.after` to the new state, so a later swipe of that reply still restores `lastApply.before`, taking the extraction **and** the staged changes after it.
  - When no extraction can be restored, the controller dispatches `blocking/rollback { after: index }`. It restores `blocking` and `moments` from the oldest log entry with `at > index` and drops the entries from there on. With nothing to roll back it does nothing.
- **Physics is never rolled back** (spec §12):
  - `physics/*` actions do not go through `stage`;
  - a swipe during a hold keeps every physics state, and the reply is narration only;
  - with a run open, `onSwipe` skips the extraction restore and logs `DEBUG_NOT_ROLLED_BACK`.
- **Chat switch (P11 rule):** the staging controller (Task 21) stops its timers and forgets every scene-keyed cache. Every dispatch carries `expectChatId`.

### R8. `[BLOCKING]` and the directives

- Provider `blocking`: priority 88, `core: true` (continuity is the point; the memory share never takes its room), rendered only while live.
- One line per person with a set field, in participant order, then the commander:
  - `Rhea: sitting at desk, on comms.`
  - `The commander: kneeling under the desk, hands bound, gagged.`

  The text is built from labels and `promptHint`s (`blockingLine`). The commander is "The commander", never a pronoun.
- `blocking:scene` (`manual`, refreshed in `applyContext`) carries the hard limits as one sentence per person with an `input` or `mobility` effect, for example "The commander cannot speak words, only muffled sounds." Absent when there are none.
- `blocking:pov` is set while the commander bears `perception.others: 'obscured'` or a `camera pov_dark`: "Narrate only what the commander can hear, feel and smell; do not describe how anyone looks."
- `moment:<sourceId>` (`next_reply`) is set by a fire and by an answer (R12). `physics:<physicsId>` (`manual`) is set while a run is open (R13). All four are cleared at scene end and on chat switch.

### R9. The extractor (`intent_extract`)

- `IntentExtractInput.staging?` is sent only while live:

  ```ts
  staging?: {
    persons: Array<{ id: string; name: string }>;              // the units present + 'commander'
    vocabulary: { posture: string[]; anchor: string[]; contact: string[]; worn: string[] };  // allowed ids only (gates, scope, room, own limits)
    ripe: string[];                                            // sources with live kind 'extracted' that are allowed
    open?: { id: string; sourceId: string; options: string[] /* the generic words */ };   // an unanswered moment
  }
  ```

- The output adds:

  ```
  "staging": { "blocking": [{ "person", "field": "posture"|"anchor"|"contact"|"worn"|"removed", "value", "relTo"?, "with"?, "direction"?, "confidence" }],
               "ripe": "<source id>"|null,
               "answer": { "option": 0|1|2|"<addition key>", "confidence", "tone": "sincere"|"ironic"|"transactional"|"flat" }|null,
               "labels": ["…","…","…"]|null }
  ```

- `readIntentOutput` sanitizes it against the input:
  - unknown ids are dropped, and at most 4 blocking changes are kept;
  - an answer needs `open` and confidence ≥ `TUNING.moments.answerConfidence` (0.55);
  - each label is cut at 40 characters with quotes stripped, and exactly three labels are needed, else null;
  - `ripe` must be in `ripe`.
- The result goes to `intents/apply` as `payload.staging`, applied in the same step (so the swipe takes it). The `intent_extract` default budget rises 600 → 700 (overview §5.2).
- The spec's site `moment.labels` (§12) is not a separate site: the labels are part of the `scene.intents` reading, so a failure, RETRY and REROLL are that site's.

### R10. Moments

- **State** (`scene.moments`):

  ```ts
  { open?: OpenMoment, fired: Array<{ sourceId, exchange }>, seen?: Record<unitId, { stress: string; want?: string; vitals?: string }>, lastAnswer?: AnswerRecord }
  OpenMoment = { id: `m<n>`, sourceId, exchange, options: MomentOption[], labels?: string[3], exposing?: string /* a blocking label */, visitorId?: string, factId?: string, unitId: string /* whose moment */ }
  MomentOption = { key: '0'|'1'|'2'|'lock'|'look'|'ally', type: ResponseType }
  ```

- **Live kinds** (closed `LIVE_KINDS`, `liveSources(state, reg): Array<{ sourceId, unitId, weight }>`):

  | kind | live when |
  |---|---|
  | `extracted` | the reading of this exchange named it in `ripe` |
  | `blocking` | a present blocking value (posture / anchor / contact / item / activity) lists the source in `sources` |
  | `visitor` | some living named non-participant could come in: her whereabouts room is the scene room or a `neighbours(…, 'door')` of it, or the scene room `isOpenSpace`; **and** something is at stake: a present value with `visibility`, a `secret` publicity or an `affair`, or the scene tone `intimate` |
  | `obscured` | the commander bears `perception.others` or `camera pov_dark` |
  | `mood_jump` | her stress band, Want band or VITALS pattern differs from `moments.seen[unitId]`; `seen` is refreshed after every pass. For `volatility: moody` (`temperamentOf`) the weight is ×`TUNING.moments.moodyMult` |
  | `weakness` | her stress band (`stressBand`) is `breaking` or `breakdown`, she is injured, or a P14b development moment of hers is stamped on this scene |
  | `asleep` | her activity's `attention` is `none` |
  | `alarm` | an active mission's `deadlineDay` ≤ today + 1, a clock filled today, or a night entry is queued |
  | `keeps_fact` | she has a fact tagged `life` + `untold` whose tags include a `lifeEvents` id with `share: 'keeps'` (P14c) |
  | `physics_warning` | the run's gauge crossed `TUNING.physics.warning` in the last segment |
  | `physics_slip` | the last segment had a slip |
  | `external` | a reader registered with `registerMomentTrigger(sourceId, fn)` says so (none in P15a) |

- **Which sources are allowed:**
  - A source is allowed when its scope fits the frame, `contentAllowed` passes and the unit is a participant.
  - In a quiet meeting (`scene.pastime`) only the pastime's `momentSources` are allowed, or, when that list is empty, the sources with `generalMeeting: true` (`her_affection`, `her_question`, `her_weakness`, `memory_surfaces`, `her_mood_shift`). This is the P14c hand-off.
- **The moment pass** (`momentPass(draft, ctx, cause: 'exchange' | 'segment')`):
  - It runs from `intents/apply` (scene channel) after the intents, and from `physics/segment_end`. It is a no-op when not live, when a moment is open, or when nothing is live.
  - Only then does it draw: `ctx.rng.chance(p)` with `p = TUNING.moments.chance[freq]`, ×`explicitMult` when any person's `intimacy` is `explicit` (setting R14). Then a weighted pick over the live sources (`ctx.rng.int`).
  - A `ripe` hint doubles its source's weight. Noise in the last segment adds `TUNING.moments.noiseBoost` to `third_party`'s weight.
  - Cooldowns: `minGap[freq]` exchanges since the last fire, `maxPerScene[freq]` fires, and one source at most once per `sourceGap` (8) exchanges.
  - With intent mode `scene_end` no reading runs, so no moment fires (noted in SYS).
- **Firing** (`fireMoment(draft, ctx, sourceId, unitId)`) builds the options:
  - the frame's three options;
  - plus additions: `lock` (type `returned`) when the scene room has `lock` and the source is `third_party`; `look` (type `deflected`) when she is present and not obscured to the commander; `ally` (type `deflected`) when another participant is at bond tier `close` / `romantic` with the commander;
  - minus `hide` (option 0 of `third_party`) when a present value has `visibility.hideable === false` and the commander's posture is not in its `unlessPosture`.

  It also:
  - names the **exposing element**: the label of the commander's first value with `visibility.exposing`, else a `hiddenFromDoor` anchor, else the contact;
  - picks the **visitor** for `third_party` with `fnv1a(`${scene.id}|${exchange}|visitor`) % candidates.length` (no draw);
  - names the **fact** for `memory_surfaces`: her oldest `keeps` fact, revealed with `revealFact` when the moment fires.
- **Her expected option** is `expectedOption(state, reg, moment): { key, strength: 1 | 2 | 3 }`. A reader registered with `registerExpectation(fn)` wins (P15). The default is the first option of type `returned`, else `yielded`, with strength 1.
- **The gap** (`gapOf(expected, chosen)`): the same type is `matched`; `yielded`↔`resisted` and `returned`↔`deflected` are `opposite`; everything else is `partial` (`AUTHOR TO TUNE`).
- **Answering** (`answerMoment(draft, ctx, momentId, key, via: 'chip' | 'text', tone?)`):
  - On `opposite` it draws `ctx.rng.chance(TUNING.moments.escalation × strength)` (0.5 × strength). When that hits, the escalation verb is the first of `ESCALATION_ORDER` found among the commander's present `escalation` effects, else `look`.
  - It emits `moment_answered { momentId, sourceId, unitId, key, type, gap, via, tone?, escalated?, verb?, visitorId?, present }`, closes the moment and sets `moment:<sourceId>`.
  - No relation axis moves (user). P16's favour and P15's position axes read the event.
- **Lapse:** an open moment that is not answered within `TUNING.moments.lapseExchanges` (2) passes lapses (`moment_lapsed`, no directive).
- **Labels** arrive with the reading (R9). Until then the card shows the generic words. Labels are stored on `open.labels` and never read by the engine.
- **Immersive mode** (setting, UI only) hides the chips; free text is mapped by the reading.

### R11. Escalation verbs (closed enum, data in `escalationVerbs`)

`ESCALATION_ORDER = ['remote_pulse', 'shock', 'tug_leash', 'tighten_hold', 'shift_weight', 'squeeze', 'press', 'press_harder', 'tug_hair', 'nudge_with_foot', 'whisper', 'pda_message', 'look', 'cough', 'name_aloud']` (blocking.md §9; the role-reversal verbs go to P17b).

### R12. Physics

- **Runs.** One run per scene (`scene.physics?: PhysicsRun`), started by `startPhysics(draft, ctx, { physicsId, sourceKind: 'contact' | 'item', sourceId, holderId, duration?: { hours: number } | 'unknown' })`. Nothing starts a run automatically except setting a contact or item that has `physics` and passes the gates.
  - The first `physics` entry is the run's main physics and a second becomes `second` (§16.6).
  - A physics whose interaction type is switched off in settings does not start: the contact applies with no physics.
- **The stand-ins (P15 hooks):**
  - `physicsStyleOf(state, unitId): { primary: StyleKey, secondary?: StyleKey, phaseLead?: 'primary' | 'secondary' }` returns `{ primary: 'neutral' }` until P15 registers a reader (`registerPhysicsStyle`).
  - `holdsUntilOf(state, unitId)` returns `'signal'`. `blackout` is honoured only with `breath_play`, else it acts as `limit`.
- **Mode.** Turn-based is the default (`physicsRealtime: false`).
  - A beat is one player step in turn-based mode, and `TUNING.physics.beatMs` (1500) in real time.
  - A segment is `TUNING.physics.turnBeats` (4) beats, or `segmentSeconds` of the entry in real time.
- **Planning** (`planSegment(run, style, rng): SegmentPlan`, at `physics/start` and each `physics/next_segment`):
  - It draws the windows (every 2–4 beats for breath; widths from the blended style; `falseShare`; `noCueShare`), the shifts for weight, her attention per beat (R13) and the cues to fire (`CueKind` per beat).
  - Her personal rhythm offsets the beat positions with `fnv1a(`${seedOf(state)}|${unitId}|rhythm`)` (§16.11). The commander's knowledge of it is P16b's and reads 0.
  - The plan is stored in the run (`segment.plan`). The UI plays it; a reading never shows it.
- **Resolution** (`resolveSegment(run, plan, inputs): SegmentResult`) is pure and deterministic, with no rng: the caught-cheat roll draws in `physics/segment_end`, not here. It works by interaction type (closed `INTERACTIONS`):
  - `timing` (breath, gulp, a pet's quick rhythm): a `breathe` input inside an open real window is caught (+30 air). A missed window gives +8 air, or +4 when the blend leans `cruel`; a `breathe` in a false window counts as a miss. Air drains −14 per beat. The seal adds per beat `leaky` +4, `firm` +1, `tight` 0, tightened one step per 2 levels of her `seal` skill.
  - `hold` (weight, a long kiss): a beat without `hold` is a slip. Strength drains −8 per beat. A shift costs −15…−25 when the hold was uneven (any released beat in the last 2).
  - `decision` (saturation): saturation rises +10 × the scent-band factor (0.5 / 1 / 1.5 / 2) per beat. `mouth_breath` gives −20 and is noticed with 0.6 (that is the cheat roll).
  - `order` (tongue_work): a `part` input in her order gives −15 dirt, out of order −8. At dirt ≤ 10 she checks (`physics_outcome { result: 'checked' }`).
  - `passive` (her_activity): progress +`TUNING.physics.progressPerBeat`; no input.
  - `gesture` (jaw): fatigue +8 per beat. From 70 the input degrades; `ask_rest` ends the segment with her answer by style (neutral: granted).
  - The capacity is 100 × (1 + 0.1 × the commander's endurance level) for a `skill: true` physics. Skill never widens windows.
- **Typing under load** (§16.2): while a message is typed, maintenance inputs lapse.
  - In real time, the UI drops every `hold` / `breathe` input during the 400 ms after a keystroke in the scene input.
  - In turn-based mode a sent message consumes `ceil(length / 40)` beats with no input (`physics/typed { chars }`).
- **Boundaries** (`physics/segment_end { runId, segment, inputs }`):
  - it applies the result, endurance xp and her-skill practice, and decides her next move: press, lift, change rhythm, fall asleep (0.08 per beat at night or when her activity was rest: her activity becomes `sleeping` for 1–3 exchanges), or "forgets" to let go (0.10, cruel blend +0.15, +0.002 per Impunity point above 50);
  - it checks the release by `holdsUntil`: `signal` releases at a tap or at gauge ≤ 15 % of capacity; `limit` ignores the first tap and releases at ≤ 5 %; `blackout` ignores taps and reaches 0;
  - it writes the segment summary into `physics:<id>`;
  - it sets `segment.state = 'held'`.

  The controller then calls `physics/next_segment` once no model reply is pending (the latency rule). While a segment is held nothing drains and the cue pool shows a "she takes her time" line.
- **The two signals.**
  - `physics/signal` (the TAP in the fiction) follows `holdsUntil`.
  - `physics/stop_word` (the player, out of the fiction) **always** ends the run and removes the contact or item that carried it, whatever her profile, mid-segment, held or not, during a marathon skip. It sets `blocking:stop` for one reply: "The commander used the stop word. She stops what she is doing now; she may react in character, but she lets go."
- **Gauge at 0.**
  - breath with `blackout` honoured → blackout (§9.5): the engine ends the run with `physics_outcome { result: 'blackout' }`, adds 1 to `scene.extraSlots`, sets `dizzy` until the day ends and stores `CampaignState.lastWake`. The staging controller then ends the scene through `app.scene.end()` (the normal summary path) and shows the wake card.
  - any other physics at 0 → `physics_slip { kind: 'collapse' }` and release.
- **Chains** (`chains` field): a slip in the run opens the chained physics with its `start` (gulp spill → `tongue_work` with dirt 60; weight slip → the hold lasts `TUNING.physics.slipExtend` more segments).
- **The commander's endurance** (`Commander.endurance?: Record<PhysicsId, { xp: number; level: 0..5; trainedDay?: number }>`) is gained three ways:
  - a hold endured +10;
  - each caught window after three in a row +2;
  - a TRAIN focus `endurance_<physics>` +15, once a day per physics, for breath, weight and jaw.

  Thresholds are 30 / 80 / 150 / 250 / 400. `commanderSkill(state, physicsId): number` returns the level.
- **Her skills** (`Relation.herSkill?: { seal, weight, reading, swing, rhythm: number; practice: Record<string, number> }`) **live on the relation, not inside P15's `Relation.dynamic`** (ruling; P15 is told).
  - +1 level per 8 practices of that kind, cap 5; `drill` / `clinical` ×1.5, `affectionate` ×0.7 via the style hook.
  - Practice kinds: `seal` ← a breath hold; `weight` ← a weight hold; `reading` ← any hold; `rhythm` ← any `timing` hold; `swing` is P16's.
  - `reading` ≥ 3: she knows the beat before a tap (neutral style: she lets go just before it). The caught-cheat chance is ×(1 + 0.1 × reading).
- **Cue pool** (§16.1):
  - At `physics/start` the staging controller asks `physics.cues` once (budget 250). The kinds are `window_open`, `window_false`, `shift`, `press`, `lift`, `count`, `warning`, `watch` and `look_away` (the last two are the signs of her attention, R13).
  - The fallback is `physicsCues` (`AUTHOR TO WRITE` lines, picked by `fnv1a`).
  - Cue honesty by style is `TUNING.physics.style[key].cues` (`honest | count | false | none | announce | sparse | shift`); neutral is `honest`.
- **Styles in TUNING.** Rows for `neutral` and every P15 style key: `affectionate`, `cold`, `ritual`, `clinical`, `possessive`, `playful`, `cruel`, `obsessive`, `drill`, `regal` and `vindictive`. Each row holds `windowMs`, `falseShare`, `noCueShare`, `cues`, `seal` (`'loosest' | 'middle' | 'tightest'`) and `skillMult`.
  - The values are the spec's: affectionate 700, cold 550, ritual 500, clinical 500 (with a half-width measuring window every 3rd–4th), possessive 450, playful 450 (35 % false), cruel 250 (40 % with no cue in turn-based mode), obsessive 200–700, drill 500, regal 600 and vindictive 300.
  - `neutral` is 600, honest, with no false windows (`AUTHOR TO TUNE`).
  - The blend is 0.65 / 0.35, reversed when `phaseLead` is `secondary`.

### R13. Physics depth (§16.2–§16.9)

- **Her gaze** (§16.4). `attentionOf(run, beat): 'watching' | 'glancing' | 'busy'` is planned per beat from her activity's `attention` (`on_commander` → watching 0.7 / glancing 0.3; `divided` → 0.35 / 0.4 / 0.25; `elsewhere` → 0.1 / 0.3 / 0.6; `none` → busy) and the style. Neutral uses only the activity; `clinical` is always watching (`AUTHOR TO TUNE`).
  - The player reads it only from the `watch` / `look_away` cues.
  - **Relief inputs** are `shift_weight` (+15 strength), `mouth_breath` (−20 saturation) and `gap_breath` (+5 air per beat, `leaky` only). They are accepted on any beat.
  - On a watching beat a relief input is a cheat: at `segment_end` the engine draws `ctx.rng.chance(p)` with watching 0.6, glancing 0.25 and busy 0.08, ×(1 + 0.1 × reading). A catch is `physics_caught` (a slip ×2, her directive line, the memory rule).
- **Noise** (§16.5): every slip is a sound. Loudness = 1 × (1 − stillness), with stillness 0 until P16b. It is emitted as `physics_noise { loudness, kind: 'gasp' | 'creak' | 'rustle' | 'cough' }`, summed into the segment summary and read by the moment pass (R10).
- **Combined** (§16.6): `second` runs on the same beats, and the two inputs merge. The conflicts are fixed rules read by interaction type:
  - `timing` + `hold`: a beat without `breathe` (held breath) reduces the strength drain by 25 %;
  - `timing` + `decision`: `mouth_breath` in an open window counts as caught but is noticed (0.6);
  - `hold` + `passive`: no conflict.
- **Marathon** (§16.3): a run with `duration.hours ≥ 1` or `'unknown'` is a marathon.
  - **Phases:** 2 per 2 fiction hours, at most 8; `'unknown'` hides the count and uses 6.
  - Each phase is `phaseSegments(pace)` = `round(paceMinutes × 60 / segmentSeconds)` segments in real time, with `paceMinutes` short 1.5 / normal 3.5 / long 5.5. In turn-based mode it is `phaseBeats` short 4 / normal 8 / long 12.
  - **Between phases** the player picks a strategy for the stretch (`physics/skip { strategy: 'endure' | 'spare' | 'cheat' | 'rest' }`). The engine resolves it with one draw:
    - endure holds with 0.5 + 0.1 × the endurance level;
    - spare gives +0.2 to the next phase;
    - cheat is resolved as R13 gaze at the phase's attention;
    - rest asks for a rest, granted by style.

    The engine then writes a summary line.
  - **Attrition:** each phase starts with capacity −`TUNING.physics.attrition` × hours, less the level × 2.
  - A fiction clock is shown; the scene ends with `extraSlots` = slots spanned − 1 (consumed at `scene/end`).
  - **After:** `stiff` until the next slot, and `marathon_done { hours, unitId, physicsId }` (P16b writes the record). The pace never changes a fiction-time result.
- **Stimuli** (§16.8):
  - **State:** `Commander.stimuli?: Record<StimulusKindId, { tolerance: 0..100; exposure: number; lastDay: number; best: number; seek: number /* moving average 0..1 */; stage: Stage; pending?: { stage: Stage; n: number } }>`.
  - A contact or item exposes the kinds in its `stimuli`, or its target's `worshipTargets[].stimuli`, plus `sweat_exertion` after a run and `sweat_stale` past 2 slots. The worship-target `stimuli` lists are a plan ruling marked `AUTHOR TO CHECK`.
  - **Tolerance:** +2 per session of exposure; −1 per 7 days apart, floored at half the best.
  - **The reflex** comes at tolerance × 1.2 in stimulus units of `scentLevel × 25`.
  - **`faint` fades:** below `noticeable` nothing reaches the perception line from tolerance 40.
  - **Choices** (`physics/stimulus { way: 'avoid' | 'sniff' | 'inhale' | 'nuzzle' | 'ordered' | 'secret' | 'taste', depth? }`):
    - **avoid** is noticed with 0.6 and is an insult only when P15 says her meaning is `intimacy` (hook, none now);
    - **inhale** is the deep-inhale mini-game. With `b` the band's index (faint 0 … overwhelming 3), in real time hold to fill a bar and release in the green zone `[b × 20, b × 20 + 10 + tolerance / 5]`. In turn-based mode pick `shallow | deep | very_deep` = 1 / 2 / 3, compared with `b + 1`. Overshooting is the reflex (`reflex` event: a slip and noise), releasing early is shallow;
    - **nuzzle** runs `saturation`;
    - **secret** is the reverse cheat, using the same gaze roll;
    - **taste** is a mouth act.
  - **Trajectory:** `seek` += 0.15 × ((seeking ? 1 : 0) − seek) per contact. Seeking ways are inhale, nuzzle, secret and taste; avoiding is avoid. Stage boundaries are at 0.2 / 0.4 / 0.6 / 0.8 with hysteresis 3 updates. The stage words of `stimulusKinds[].perception` feed `physics:<id>` and the cue lines; after 7 days apart the word is `separated`.
  - **Events:** `stimulus_stage_changed { kind, from, to, herPresent }`.
- **Scent band** (`scentBand(state, reg, unitId, part)`): base per part (feet and soles 2, armpits 1.5, else 0.75) × hygiene (`normal` until P15 / P17d) × situation (after a run ×2 for 1 slot, then ×1.5; after training ×1.5).
  - "After a run" is read from `lastExpedition.day` and its party; "after training" from `life.busy` or this slot's activity.
  - Bands: `faint` < 1, `noticeable` 1–2, `strong` 2–3.5, `overwhelming` ≥ 3.5. Washing, intention, clinging and noticing are P17d's.
- **Mouth acts** (§16.9). A contact with `mouth: true` offers `physics/act { kind }` with these kinds:
  - `kiss`: a discrete act, her reaction via the directive;
  - `counted`: she sets n with `fnv1a` 10–100 by tens; the player counts the clicks and types the number reached to finish, and a wrong count restarts;
  - `long`: a `hold` run with strength = stillness;
  - `lick`: a `tongue_work` run plus a `dryness` gauge of +6 per beat; at 100 a right order gives −8 only (`AUTHOR TO TUNE`);
  - `pet`: a `timing` run with a window every beat;
  - `mouth`: a `jaw` run.

  Each exposes the taste kinds, and the taste trajectory is per kind. The tempo / pressure mini-game is P16b's.

### R14. Settings

- **Global** (`AliusSettings`):
  - `momentFrequency: 'rare' | 'normal' | 'often'` (default `normal`);
  - `momentExplicit: 'rarer' | 'same' | 'off'` (`rarer`);
  - `momentChips: 'chips' | 'immersive'` (`chips`);
  - `physicsRealtime: boolean` (false);
  - `physicsInteractions: Record<InteractionType | 'inhale', boolean>` (all true);
  - `marathonPace: 'short' | 'normal' | 'long'` (`normal`).
- SYS › **Scene** is a new `h3` after Conversations. Each field has `setting_<key>`.
- The engine reads a campaign mirror: `campaign/set_scene_settings { momentFrequency, momentExplicit, physicsRealtime, physicsInteractions, marathonPace }`, synced like `syncBeatCooldown`. `momentChips` is UI only.

### R15. Memory check (overview §11)

`memoryRules` gains 9 rows. Each has a resolver (Task 17 / Task 20 / Task 26), `spread: 'none'`, `hiddenFromCommander` false and a text with no pronoun for the commander:

| rule | event + when | audience | importance |
|---|---|---|---|
| `moment_weakness` | `moment_answered`, source `her_weakness` | present | 3 |
| `moment_question_lie` | `moment_answered`, source `her_question`, key `1` | present | 2 |
| `moment_slip_confessed` / `moment_slip_hidden` | `moment_answered`, source `own_slip`, key `0` / `1` | present | 3 |
| `moment_exposed` | `moment_answered`, source `third_party`, type not `yielded` | present + visitor | 3 |
| `moment_memory` | `moment_answered`, source `memory_surfaces` | present | 2 |
| `physics_blackout` | `physics_outcome`, result `blackout` | the pair | 4 |
| `physics_limit_broken` | `physics_outcome`, result `limit_broken` | the pair | 4 |
| `physics_caught` | `physics_caught` | the pair | 3 |
| `stimulus_craving` / `stimulus_adoring` | `stimulus_stage_changed`, to `craving` / `adoring`, `herPresent` | the pair | 3 |

(Ten rule ids; two pairs share a `when` shape.) The `remember` field of `momentSources` lists the same options for the analyze text only; the rules decide.

- Blocking changes, labels, gauges, segments, summaries and cues are bookkeeping.
- No relation event is added, so no `eventDeltas` row and no journal phrase. `[BLOCKING]` is a `scene` provider, not `memory`.

### R16. Events and actions (all engine events are in `RESERVED_EVENT_TYPES`)

- **Events:**
  - `blocking_changed`, `blocking_rolled_back`;
  - `moment_fired`, `moment_answered`, `moment_lapsed`, `moment_escalated`;
  - `physics_started`, `physics_segment`, `physics_signal`, `physics_slip`, `physics_cheat` (a relief input on a watching beat, before the roll), `physics_caught`, `physics_noise`, `physics_outcome` (`released | checked | limit_broken | blackout | stopped | collapse`), `blackout`;
  - `endurance_gained`, `her_skill_gained`, `marathon_phase`, `marathon_done`, `reflex`, `stimulus_stage_changed`, `condition_set`, `condition_ended`.
- **Actions:**
  - `blocking/set { person, field, value?, relTo?, with?, direction?, at }` and `blocking/rollback { after }`;
  - `moment/answer { momentId, key, tone? }`;
  - `physics/start`, `physics/segment_end`, `physics/next_segment`, `physics/typed`, `physics/signal`, `physics/stop_word`, `physics/skip`, `physics/stimulus`, `physics/act`;
  - `campaign/set_scene_settings`.

  The spec's `physics/input` is `physics/segment_end`'s `inputs`; `scene/stop_word` is `physics/stop_word` plus the contact removal.
- Every one is allowed during an open scene only; `dispatch` needs no new guard.

## Review Focus

1. **A campaign without a close relation is the campaign as it was.**
   - The intent prompt is the pinned text and the context block is unchanged.
   - A seeded week with scenes ends with the same `state.rng`.
   - Tests: Task 29 (`unaffected week`), Task 10 (`prompt without staging is byte-identical`) and Task 14 (`no live source draws nothing`).
2. **A swipe, an edit or a delete takes back what came after the reply.**
   - A posture chip and a moment answer made after reply *i* are gone when *i* is swiped, with and without an extraction to restore.
   - A swipe during a running hold changes no physics state.
   - Tests: Task 8 (`rollback after a chip change`, `rollback with no extraction`) and Task 21 (`swipe during a hold keeps the run`).
3. **A disabled category, a dynamic entry, her own limit or a missing room affordance never reaches a chip, the extractor's vocabulary, a label, the prompt or a reading.** Turning a category off mid-scene strips its worn items and contact and ends their physics. Tests: Task 7 (`category off mid-scene strips`), Task 10 (`vocabulary is filtered`), Task 12 and Task 28.
4. **The real-time layer never waits for the model.**
   - A seeded run with a fake model answering at once and one answering after three segments ends with the same gauge, xp, slips and rng.
   - A held segment drains nothing.
   - Tests: Task 21 (`slow and fast model, same outcome`, `held drains nothing`).
5. **The stop word always works:**
   - mid-segment, held, during a marathon skip, in both modes and at any `holdsUntil`;
   - a chat switch mid-hold stops the timers and dispatches nothing into the new chat.

   Tests: Task 18 (`stop word at every point`) and Task 22 (`chat switch stops the clock`).

---

## Chunk (a): vocabulary as data

### Task 1: Content categories and `requires`

**Files:**
- Modify:
  - `content/core/contentCategories.json` (13 rows, R3);
  - `src/content/schemas.ts` (`ContentCategorySchema.requires`);
  - `src/content/refs.ts` (`requires` names categories, no cycle);
  - `src/engine/bonds/content.ts` (`setCategories` drops a category whose requirement is off);
  - `src/ui/bonds/content.ts` (the disabled toggle with its reason);
  - `content/core/glossary.json` (`content_requires`);
  - count tests that list categories (expected values only).
- Test: `tests/engine/bonds/contentRequires.test.ts`

**Interfaces:**
- Produces: `categoryRequires(reg, id): string[]`; `setCategories` unchanged in signature.

- [x] **Step 1: Write the failing tests.**
  - `thirteen new categories, all off`: the registry has 22, and none is enabled in a new campaign.
  - `watersports needs bodily_fluids`: `setCategories(d, reg, ['watersports'])` → enabled `[]`; with both → both; then `['watersports']` alone → `[]` and `content_changed.removed` lists `watersports`.
  - `the toggle is aria-disabled with its reason` (jsdom; `renderContentSection`).
  - `an unknown or cyclic requires is a content error` (fixture pack).
- [x] **Step 2: Run** `npx vitest run tests/engine/bonds/contentRequires.test.ts` → FAIL.
- [x] **Step 3: Implement** as in Interfaces.
- [x] **Step 4: Run** the file, then `npm test` → PASS (the goldens unchanged).
- [x] **Step 5: Commit** `feat(P15a): thirteen content categories and requires`

---

### Task 2: The twelve registries, the effect vocabulary and the content checks

**Files:**
- Create: `src/engine/blocking/types.ts` (the R4 entry shapes as TS types; the closed enums `EFFECT_TYPES`, `LIVE_KINDS`, `ESCALATION_ORDER`, `INTERACTIONS`, `CUE_KINDS`, `RESPONSE_TYPES`, `WORN_SLOTS`, `STAGES`).
- Modify:
  - `src/content/types.ts`: the 12 names in `REGISTRY_NAMES` (`// P15a`);
  - `src/content/schemas.ts`: one schema per registry, `BlockingEffectSchema` (R5), `DESCRIBED_REGISTRIES`, `PLAYER_VISIBLE`, and `RESERVED_EVENT_TYPES` gains every R16 event;
  - `src/content/refs.ts`:
    - `implies` postures / anchors exist;
    - `target` → `worshipTargets`;
    - `physics[].id` → `contactPhysics`;
    - `stimuli` → `stimulusKinds`;
    - `sources` keys → `momentSources`;
    - `requires.affordances` ⊆ the set of all `planRooms[].affordances`;
    - `fromActivities` → `activities`;
    - `status_after.id` → `commanderConditions`;
    - `escalation.verb` → `escalationVerbs`, and every `escalationVerbs` id is in `ESCALATION_ORDER`;
    - `chains[].to` → `contactPhysics`;
    - a `momentSources.frame` has three options with types from `RESPONSE_TYPES`;
    - `hobbies[].activityIds` → `blockingActivities` with `actor: 'her'` (the P14c hand-off);
    - `pastimes[].momentSources` → `momentSources` with `scope: 'any'`;
  - `src/engine/bonds/content.ts`: `CONTENT_GATED_REGISTRIES` gains the 12;
  - `tests/helpers/bonds.ts`: `GATE_PROBES` entries (each lists the ids the blocking vocabulary offers for a live scene);
  - `content/core/manifest.json` (the files, empty arrays for now);
  - the count tests (`tests/content/core.test.ts` registry count; `PLAYER_VISIBLE` counts).
- Test: `tests/content/blockingSchemas.test.ts`

**Interfaces:**
- Produces: the entry types `PostureEntry`, `AnchorEntry`, `ContactEntry`, `ItemEntry`, `BlockingActivityEntry`, `MomentSourceEntry`, `PhysicsEntry`, `CueEntry`, `StimulusKindEntry`, `EscalationVerbEntry`, `ConditionEntry`, `WorshipTargetEntry`; `type BlockingEffect`; `effectsOfEntry(entry): BlockingEffect[]`.

- [x] **Step 1: Write the failing tests** (fixture pack under `tests/fixtures/packs/blocking/`):
  - `each registry loads a valid row`;
  - `an unknown effect type is refused`;
  - `a furniture anchor with an affordance no plan room has is refused`;
  - `a contact implying an unknown posture is refused`;
  - `a source frame of two options is refused`;
  - `an escalation verb outside the enum is refused`;
  - `a hobby activityId that is not a her-activity is refused`;
  - `a pastime naming a dynamic source is refused`;
  - `contentTags on blockingItems are checked against categories`;
  - `an engine event cannot be emitted by an activity` (`emit_event` of `moment_fired` refused).
- [x] **Step 2: Run** `npx vitest run tests/content/blockingSchemas.test.ts` → FAIL.
- [x] **Step 3: Implement.** The schemas are `.strict()`. `label` ≤ 40, `promptHint` ≤ 120 and `generic` ≤ 40 characters.
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15a): blocking, moment and physics registries with their checks`

---

### Task 3: Body and room vocabulary (worship targets, postures, anchors, items, escalation verbs)

**Files:**
- Create: `content/core/worshipTargets.json` (17), `blockingPostures.json` (13), `blockingAnchors.json` (22), `blockingItems.json` (31), `escalationVerbs.json` (15).
- Modify:
  - `content/core/manifest.json`;
  - `tests/content/pronouns.test.ts` (the text fields of the five registries);
  - `content/core/glossary.json` (`blocking`, `worship_target`, `escalation`).
- Test: `tests/content/blockingVocabulary.test.ts`

**Interfaces:**
- Consumes: Task 2 schemas.
- Produces: the core rows, by blocking.md §1, §2, §7 (base table only), §8, §9.

- [x] **Step 1: Write the failing tests.**
  - `ids match blocking.md`: each id in the tables of §1, §2, §7 (the base table), §8 and §9 is a row, and the reverse. `on_bunk / beside_bunk` is two rows. The role-reversal verbs are absent. `strap` and the six `fem_*` items are present with no effects beyond the prompt.
  - `items carry the blocking.md tags as contentTags`.
  - `the reference effects` for a sample of items:
    - `ring_gag` has `input garbled 3`, `camera face_close` and `physics jaw`;
    - `hood` has `filter sensory_dark`, `perception others obscured` and `sound muffle`;
    - `paw_mitts` has `gestures pet`, `input no_hands` and `device lock tabs`;
    - `property_tag` has `visibility exposing, hideable false` and `notice knows_dynamic`;
    - `tail` has `visibility exposing, hideable false, unlessPosture [lying_*]`;
    - `bell_collar` has `sound { id: 'bell' }` and `strain silence`;
    - `leash` has `escalation tug_leash`, `mobility follows` and `visibility exposing`.
  - `furniture anchors require their affordance` (`under_desk` → `desk`, `inside_cupboard` → `cupboard`, `at_console` → `line`).
  - `postures have no scope`.
  - `every worship target has stimuli` (the R13 ruling: feet / toes / soles → `scent_feet`, `taste_salt`; armpits → `scent_armpit`; boots → `taste_dirt`, `taste_polish`, `scent_worn`; scent → `scent_body`, `scent_worn`; the rest → `scent_body`, `taste_skin`).
  - `no text gives the commander a pronoun`.
- [x] **Step 2: Run** `npx vitest run tests/content/blockingVocabulary.test.ts` → FAIL.
- [x] **Step 3: Implement.** The JSON is a faithful copy of blocking.md with the R4 mapping notes. `zone` coordinates are `AUTHOR TO TUNE` placeholders on a 0–100 body map. A throwaway converter outside `src/` may be used once; it is not committed.
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15a): worship targets, postures, anchors, items and escalation verbs as data`

---

### Task 4: Contacts and activities

**Files:**
- Create:
  - `content/core/blockingContacts.json`: blocking.md §3.1–§3.5, 48 rows; **not** §3.6. A side given as a P16b preset maps to its base (`on_hands`: `kneel_present` → `kneeling_upright`);
  - `content/core/blockingActivities.json`: §4 and §5, 57 + 19 rows (`writing_report`, `on_comms`, `eating` and `idle` exist for both actors as `<id>` for her and `c_<id>` for the commander; `label` decides the words).
- Modify: `content/core/manifest.json`, `tests/content/pronouns.test.ts`.
- Test: `tests/content/blockingContacts.test.ts`

**Interfaces:**
- Produces:
  - contacts with `dir`, `implies`, `physics`, `mouth` and `sources`;
  - activities with `attention`, `pairTags`, `fits`, `presence`, `judged` and `sources`;
  - `fromActivities`: `repairing_gear` ← `workshop`; `working_out` ← `train`; `tending_own_wound` ← `medbay`; `eating` ← `mess`; `reading_book` ← `study`.

- [x] **Step 1: Write the failing tests.**
  - `ids match blocking.md §3.1–§3.5, §4, §5` (and §3.6 is absent).
  - `weight-bearing contacts declare implies`: `human_chair`, `footrest`, `standing_on`, `straddled`, `under_her_seat`, `feet_on_face` and `on_lap` (spec §2.2).
  - `scope by section`: §3.1–§3.3 and §3.5 are `dynamic`; §3.4 is `any`; the "inside a dynamic" activities and every commander service activity are `dynamic`.
  - `hand_feeding and face_in_her_neck` are `any` with no tag; their tagged inside-a-dynamic reading is in `description`.
  - `contacts with two physics` (`smothered_armpit`, `face_to_bottom` → breath + saturation; `under_her_seat` → breath + her_activity; `feet_on_face` → saturation + her_activity; `between_thighs` → breath + weight).
  - `seal ranges on breath contacts` (`smothered_armpit` `['firm', 'leaky']`; `smothered_breasts` and `under_her_seat` `['tight', 'firm']`; `face_to_bottom` `['firm']`; `between_thighs` `['leaky']`; `AUTHOR TO TUNE`). `hand_over_mouth` has no physics (blocking.md gives it none).
  - `kneeling_between_legs` has `escalation nudge_with_foot`, `visibility hiddenFromDoor`, `backdrop frame_under_desk`, `requires desk` and `sources { third_party: 1, remote: 1 }`.
  - `the reference case`: `on_comms` has `attention elsewhere`, `pairTags [focused]` and `sources { remote: 2 }`.
  - `mouth contacts`: `foot_worship`, `boot_worship`, `sole_to_mouth`, `oral_service` and `face_in_her_neck` carry `mouth: true`.
- [x] **Step 2: Run** `npx vitest run tests/content/blockingContacts.test.ts` → FAIL.
- [x] **Step 3: Implement** as data, with the R4 notes.
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15a): contacts and activities as data`

---

### Task 5: Moment sources, physics, cues, stimulus kinds and conditions

**Files:**
- Create:
  - `content/core/momentSources.json` (26, blocking.md §10: frames, scopes, `live` per R10, `remember`, `generalMeeting` on the five);
  - `contactPhysics.json` (7: breath, weight, saturation, tongue_work, her_activity, jaw, gulp; `gulp` tagged `watersports`; `segmentSeconds` from §16.14; `skill: true` on breath, weight, saturation, jaw and gulp);
  - `physicsCues.json` (one row per `CUE_KINDS`, 3 `AUTHOR TO WRITE` lines each);
  - `stimulusKinds.json` (12 from §16.8; no intimate kinds);
  - `commanderConditions.json` (`dizzy`: `social_rank −1`, `stress +5`; `stiff`: prompt only).
- Modify: `content/core/manifest.json`, `tests/content/pronouns.test.ts`, `content/core/glossary.json` (`moment`, `contact_physics`, `endurance_skill`, `commander_condition`, `stimulus`).
- Test: `tests/content/momentSources.test.ts`

**Interfaces:**
- Produces: the source table that R10 reads. `live` per source:

  | source | live |
  |---|---|
  | `her_offer`, `her_silence`, `her_question`, `her_affection`, `her_jealousy`, `own_want` | `extracted` |
  | `her_weakness` | `weakness`, `extracted` |
  | `her_mood_shift` | `mood_jump` |
  | `her_absence` | `asleep`, `blocking` |
  | `duty_call`, `time`, `object_at_hand` | `blocking`, `extracted` |
  | `third_party` | `visitor` |
  | `remote` | `blocking` |
  | `sensory` | `obscured` |
  | `alarm` | `alarm` |
  | `memory_surfaces` | `keeps_fact`, `extracted` |
  | `endurance` | `physics_warning` |
  | `own_slip` | `physics_slip`, `extracted` |
  | `her_demand`, `her_test`, `permission`, `summons`, `rule_collision`, `compromat_hint`, `ritual_due` | `external` |

- [x] **Step 1: Write the failing tests.**
  - `26 sources with blocking.md's frames and types`: the generic words are the table's words; `her_test`'s frame is `test option 1–3` with types Y / R / D, `AUTHOR TO WRITE`.
  - `the nine power-laden sources are dynamic`.
  - `the five general meeting sources`.
  - `every source has a live kind`.
  - `seven physics with the TUNING segment lengths`.
  - `every cue kind has 3–5 lines`.
  - `the conditions' effects`.
  - No commander pronoun anywhere.
- [x] **Step 2: Run** `npx vitest run tests/content/momentSources.test.ts` → FAIL.
- [x] **Step 3: Implement** as data.
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15a): moment sources, physics, cues, stimulus kinds and conditions as data`

---

### Task 6: Local content packs

**Files:**
- Modify:
  - `src/content/loader.ts`: `loadPacks(roots, fetch, opts?: { optional?: string[] })`, where an optional root whose manifest fails to load is skipped silently;
  - `src/index.ts`: `CONTENT_ROOTS = ['../content/core', '../content/local']`, `optional: ['../content/local']`;
  - `.gitignore`: add `content/local/`, and only that (never `dist/` or `style.css`);
  - `docs/CONTENT.md`: a "Local packs" section (folder, manifest, priority > 0, override by id, `extends`, errors in SYS › debug).
- Test: `tests/content/localPacks.test.ts`

**Interfaces:**
- Produces: `loadPacks(..., { optional })`.

- [x] **Step 1: Write the failing tests.**
  - `an absent local pack is not an error` (fetch 404 for its manifest → `errors` empty).
  - `a local pack adds and overrides by id` (a local `blockingItems` row with the id `collar` and a new `label` wins; a new id is added).
  - `a bad local row is reported, core still loads`.
  - `.gitignore lists content/local/ and not dist/ or style.css`.
- [x] **Step 2: Run** `npx vitest run tests/content/localPacks.test.ts` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15a): optional local content packs`

---

## Chunk (b): the blocking in the scene

### Task 7: Blocking state, the live gate, validation, `implies` and effects

**Files:**
- Create:
  - `src/engine/blocking/state.ts` (leaf, R6);
  - `src/engine/blocking/gate.ts` (`blockingLive`, `registerBlockingGate`, `frameOf`, `registerFrameReader`, `entryAllowed`, `sceneRoom`, `sceneAffordances`);
  - `src/engine/blocking/blocking.ts` (`blockingOf`, `setBlocking`, `transitionProblem`, `effectsOf`, `personEffects`, `stripTagged`);
  - `src/engine/blocking/index.ts`;
  - `src/engine/actions/blocking.ts` (`blocking/set`).
- Modify:
  - `src/engine/state/types.ts` (`SceneRecord` fields; types re-exported from `blocking/state.ts`);
  - `src/engine/bonds/content.ts` (`withdrawTagged` calls `stripTagged`);
  - `src/engine/tuning.ts` (`TUNING.blocking = { minConfidence: 0.6, logMax: 40, maxChanges: 4 }`);
  - `src/app.ts` (import the action module);
  - `tests/architecture.test.ts` if it lists leaf files.
- Test: `tests/engine/blocking/blocking.test.ts`

**Interfaces:**
- Produces:
  - `blockingLive(state, reg): boolean`;
  - `registerBlockingGate(fn: (state, reg) => boolean)`;
  - `frameOf(state, unitId): Frame` and `registerFrameReader(fn)`;
  - `entryAllowed(state, reg, entry, unitIds: string[]): boolean` (`contentAllowed` for each, plus scope);
  - `sceneRoom(state, reg): Entry | null` and `sceneAffordances(state, reg): Set<string>`;
  - `blockingOf(scene, personId): Readonly<Blocking>`;
  - `type BlockingChange = { person; field: 'posture' | 'anchor' | 'contact' | 'worn' | 'removed' | 'activity' | 'intimacy' | 'note'; value?; relTo?; with?; direction?; slot? }`;
  - `setBlocking(draft, ctx, change, opts: { at: number; source: 'engine' | 'chip' | 'reading' }): EngineEvent[]` (throws with a reason; writes the log entry first);
  - `transitionProblem(state, reg, change): string | null`;
  - `effectsOf(blocking, reg, channel: BlockingEffect['type']): BlockingEffect[]`;
  - `personEffects(state, reg, personId): BlockingEffect[]` (posture, anchor, the contact on or by the person, and items);
  - `stripTagged(draft, reg, removed: string[])`;
  - action `blocking/set` → `blocking_changed { person, field, value, source }`.

- [x] **Step 1: Write the failing tests.**
  - `not live without a close relation`: a scene with a `comrade` → false; `confidant` → true; a grunt → false; a registered gate → true.
  - `set refuses what the gates refuse`: a tagged item with its category off; a `dynamic` contact at frame `equal`; her own limit; `under_desk` in a room without a desk; a person not present; a second item on a used slot. Each returns its reason and leaves the state unchanged.
  - `implies writes both sides`: `human_chair` (frame reader stubbed to `play`) sets the commander `all_fours` and her `sitting` / `on_person` (relTo commander); removing it restores her previous anchor.
  - `mobility none freezes`: with `straddled`, a posture change is refused with the reason; `crawl` keeps `all_fours`; `follows` allows only a relative anchor on her.
  - `effectsOf by channel` (`ring_gag` → `input`, `camera`, `physics`).
  - `category off mid-scene strips`: wearing `blindfold` (restraint), turn `restraint` off → `worn.eyes` gone; with a physics running on a tagged contact the run ends (`physics_outcome stopped`) once Task 18 exists (the test is skipped until then with `it.todo` and completed in Task 18).
  - `no rng draw`: `state.rng` unchanged by any `blocking/set`.
- [x] **Step 2: Run** `npx vitest run tests/engine/blocking/blocking.test.ts` → FAIL.
- [x] **Step 3: Implement** as in R6.
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P15a): the blocking state, its gate, validation and effects`

---

### Task 8: Scene start, snapshots and the swipe

**Files:**
- Create: `src/engine/blocking/snapshots.ts` (`pushLog`, `rollbackAfter`) and `src/engine/blocking/defaults.ts` (`startBlocking`).
- Modify:
  - `src/engine/actions/scene.ts`: `scene/start` takes `activityId?`, stores it and calls `startBlocking`; `scene/end` drops `blocking`, `moments` and `stagingLog`, and calls `noteBusy` with her blocking activity;
  - `src/engine/actions/blocking.ts`: `blocking/rollback { after }`;
  - `src/engine/life/dayStep.ts` / `places.ts`: `busy[].blockingActivityId?`;
  - `src/engine/life/hobbies.ts`: `practiceSlots` counts a busy slot whose `blockingActivityId` is in an active hobby's `activityIds`. The whereabouts route stays for a soldier with no blocking;
  - `src/life/directives.ts`: `life:pastime:` drops each activity word that was set as a blocking activity, since it is in `[BLOCKING]`;
  - `src/scene/sceneController.ts`: `stage(action)`, the rebase of `lastApply.after`, the `blocking/rollback` fallback in `onSwipe` / `handleEdited`, and skipping the restore while a run is open (R7);
  - `src/app.ts`: `talkAt`, `performActivity` and `life.timeTogether` pass `activityId` to `scene/start`.
- Test: `tests/engine/blocking/snapshots.test.ts`, `tests/scene/stagingSwipe.test.ts` (with `tests/helpers/sceneHarness.ts`)

**Interfaces:**
- Consumes: `setBlocking` (Task 7).
- Produces:
  - `startBlocking(draft, reg)`;
  - `rollbackAfter(draft, index): boolean`;
  - `SceneController.stage(action: Action): EngineEvent[]`;
  - `SceneRecord.activityId`.

- [x] **Step 1: Write the failing tests.**
  - `pastime sets the activities the gates allow`: `fix_gear` → her `repairing_gear`; the commander's `holding_for_her` is a dynamic service activity and stays unset at frame `equal`. A `workshop` talk → `repairing_gear`; a plain talk → nothing set.
  - `rollback after a chip change`: a reply at 5 is read, a posture chip goes through `stage`, and swiping 5 restores the state before the reading (the chip is gone too).
  - `rollback with no extraction` (intent mode `scene_end`): a chip at `at = 6`, swipe 5 → `blocking/rollback` restores it; swipe 7 → nothing.
  - `the log is capped at 40`.
  - `scene end clears and counts practice`: her `reading_book` blocking activity with an active `reading` hobby → a practice slot counted; no hobby → no change.
  - `life:pastime: drops only the words that were set` (her word gone, the commander's kept, for `fix_gear` at frame `equal`).
  - `swipe during a hold keeps the run` is written here as `it.todo` and completed in Task 21.
- [x] **Step 2: Run** `npx vitest run tests/engine/blocking/snapshots.test.ts tests/scene/stagingSwipe.test.ts` → FAIL.
- [x] **Step 3: Implement** as in R7.
- [x] **Step 4: Run** both files, then `npm test` → PASS (`tests/engine/life/*` unchanged).
- [x] **Step 5: Commit** `feat(P15a): the scene's starting blocking, snapshots per message and the swipe`

---

### Task 9: `[BLOCKING]` and the `blocking:` directives

**Files:**
- Create: `src/scene/blockingContext.ts` (`registerBlockingContext`, `blockingLine`) and `src/blocking/directives.ts` (`refreshBlockingDirectives`, `clearBlockingDirectives`).
- Modify: `src/app.ts` (register; `applyContext` refresh / clear); `src/scene/sceneController.ts` (`afterEnd` clears).
- Test: `tests/scene/blockingContext.test.ts`

**Interfaces:**
- Produces: `blockingLine(state, reg, personId): string | null`; directives `blocking:scene`, `blocking:pov` and `blocking:stop` (R8).

- [ ] **Step 1: Write the failing tests.**
  - `the reference case renders` as two lines: `Rhea: sitting at desk, on comms.` and `The commander: kneeling under the desk, gagged.` (labels from the fixture).
  - `unset fields are not rendered`; a live scene with nothing set → no block.
  - `not live → no block and no directive`.
  - `blocking:scene words input and mobility` and contains no pronoun.
  - `blocking:pov with a blindfold or pov_dark`, and it is gone when removed.
  - `the provider is core and keeps its room` when memory fills the cap.
- [ ] **Step 2: Run** `npx vitest run tests/scene/blockingContext.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15a): the [BLOCKING] block and its directives`

---

### Task 10: The extractor's `staging` block

**Files:**
- Modify:
  - `src/llm/calls/intentExtract.ts` (input, prompt lines, `IntentExtractRawSchema.staging`, `sanitizeStaging`; R9);
  - `src/scene/sceneController.ts` (`intentInput` adds `stagingInput(...)`, and `apply` passes `staging`);
  - `src/engine/actions/scene.ts` (`intents/apply` applies `payload.staging.blocking` through `setBlocking` with `source: 'reading'` and `at = readIndex`; invalid ones are dropped silently);
  - `src/settings.ts` (budget 700);
  - `docs/00-overview.md` §5.2 is done in Task 30.
- Create: `src/blocking/input.ts` (`stagingInput(state, reg, participants): Pick<IntentExtractInput, 'staging'>`).
- Test: `tests/llm/intentExtractStaging.test.ts`

**Interfaces:**
- Produces: `stagingInput`, `sanitizeStaging(raw, input): StagingOutput | null`, and `IntentOutput.staging`.

- [ ] **Step 1: Write the failing tests.**
  - `prompt without staging is byte-identical` (the pinned fixture).
  - `vocabulary is filtered`: a disabled tag, a dynamic contact, her own limit and an anchor whose affordance is missing are absent from the prompt.
  - `sanitize drops`: unknown ids, a fifth change, low confidence, an `activity` field, an answer with no open moment, two labels, a `ripe` outside the list, a label over 40 characters (cut).
  - `a reading's change lands and rolls back with the reading` (harness).
  - `budget default 700`.
- [ ] **Step 2: Run** `npx vitest run tests/llm/intentExtractStaging.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15a): the reading reports blocking changes in the closed vocabulary`

---

### Task 11: The device out of reach and the sound readers

**Files:**
- Modify:
  - `src/app.ts` (`syncLocks` adds every `TAB_IDS` tab while `deviceLocked(state, reg)`);
  - `src/ui/scene/sceneScreen.ts` (the line "The device is out of reach." with `data-analyze="glossary:device_out_of_reach"`);
  - `src/ui/sound/*` (`Sound.setMuffle(on)`, gain share `MUFFLE_GAIN` 0.4; `SoundId` gains `bell` and `steps`, synthesized, no file);
  - the sound sync in `app.ts` (muffle while the commander bears `sound muffle`; `bell` on every `blocking_changed` of a person who wears an item with `sound { id: 'bell' }`);
  - `content/core/uiSounds.json`;
  - `content/core/glossary.json` (`device_out_of_reach`).
- Create: `src/engine/blocking/device.ts` (`deviceLocked`).
- Test: `tests/ui/blockingDevice.test.ts`

**Interfaces:**
- Produces: `deviceLocked(state, reg): boolean`, `Sound.setMuffle(on: boolean)`.

- [ ] **Step 1: Write the failing tests.**
  - `paw_mitts lock every tab` and the scene line shows; removing them unlocks; a P11 locked tab stays locked.
  - `muffle under a hood` (fake audio gain × 0.4).
  - `the bell rings on a move`.
  - `no network`: `tests/assets.test.ts` still passes (no file for the new sounds).
- [ ] **Step 2: Run** `npx vitest run tests/ui/blockingDevice.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15a): the device out of reach and the muffled sound`

---

### Task 12: The BLOCKING strip and its chips

**Files:**
- Create: `src/ui/scene/blockingStrip.ts` (`renderBlockingStrip(host, ctx)`), `src/analysis/providers/blocking.ts` (`registerBlockingProviders`), `css/61-blocking.css`.
- Modify:
  - `src/ui/scene/sceneScreen.ts` (`SceneScreenCtx.onStage?: (action) => void`; the strip above the chips; drawn only while live);
  - `src/app.ts` (`onStage` → `scene.stage`);
  - `src/analysis/providers/core.ts` (register);
  - `content/core/glossary.json` (`blocking_strip`).
- Test: `tests/ui/blockingStrip.test.ts`

**Interfaces:**
- Consumes: `transitionProblem`, `entryAllowed`, `blockingOf`.
- Produces:
  - one row per person with the set fields as `.alius-chip`s (`data-analyze="blockingPostures:<id>"` etc.);
  - the commander's movement chips (KNEEL, SIT, STAND, CRAWL, LIE DOWN → base postures; a disabled chip carries `aria-disabled` and its reason);
  - a `[ + ]` menu with the allowed contacts, items and anchors, grouped, each `.alius-option`;
  - providers `blockingPostures`, `blockingAnchors`, `blockingContacts`, `blockingItems` and `blockingActivities`. A live reading is "set by: engine / chip / reading" and the exchange; it reads only the open scene.

- [ ] **Step 1: Write the failing tests.**
  - `the strip is absent when not live`.
  - `a mobility-frozen chip is aria-disabled with the reason`.
  - `the menu lists only allowed entries` (the same filter as Task 10).
  - `every element resolves` (`analyzeCoverage` helper).
  - `chip goes through stage` (spy).
- [ ] **Step 2: Run** `npx vitest run tests/ui/blockingStrip.test.ts` → FAIL.
- [ ] **Step 3: Implement** with the existing chip and menu styles. Nothing animates without `motionReduced` being asked.
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15a): the BLOCKING strip with chips and readings`

---

## Chunk (c): moments

### Task 13: Moment state and live sources

**Files:**
- Create: `src/engine/moments/state.ts` (leaf: R10 types and `momentsOf`) and `src/engine/moments/live.ts` (`liveSources`, `registerMomentTrigger`, `allowedSources`).
- Modify: `src/engine/state/types.ts` (`SceneRecord.moments`), `src/engine/tuning.ts` (`TUNING.moments`, below).
- Test: `tests/engine/moments/live.test.ts`

**Interfaces:**
- Produces:
  - `liveSources(state, reg, opts?: { ripe?: string }): Array<{ sourceId: string; unitId: string; weight: number }>`;
  - `allowedSources(state, reg, unitId): MomentSourceEntry[]`;
  - `registerMomentTrigger(sourceId, (state, reg, unitId) => boolean)`;
  - `TUNING.moments`:

    ```ts
    {
      chance: { rare: 0.10, normal: 0.20, often: 0.35 }, minGap: { rare: 6, normal: 4, often: 2 }, maxPerScene: { rare: 2, normal: 4, often: 6 },
      explicitMult: 0.5, sourceGap: 8, answerConfidence: 0.55, labelMax: 40, lapseExchanges: 2, escalation: 0.5,
      moodyMult: 2, noiseBoost: 1 /* AUTHOR TO TUNE */,
    }
    ```

- [ ] **Step 1: Write the failing tests.** One test per live kind:
  - `blocking` (`on_comms` → `remote`);
  - `visitor`: a non-participant in a door neighbour plus a `hiddenFromDoor` anchor → `third_party`; nobody near → none; nothing at stake → none;
  - `obscured`;
  - `mood_jump`: a stress band change since `seen`; moody doubles the weight;
  - `weakness`;
  - `asleep`;
  - `alarm`;
  - `keeps_fact`;
  - `external` with a registered trigger.

  Then:
  - `dynamic sources never at frame equal`;
  - `a quiet meeting allows only its sources or the general five`;
  - `ripe counts only for extracted kinds`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/moments/live.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15a): live moment sources`

---

### Task 14: The moment pass, firing and the frequency mirror

**Files:**
- Create: `src/engine/moments/fire.ts` (`momentPass`, `fireMoment`, `optionsFor`, `exposingElement`, `pickVisitor`).
- Modify:
  - `src/engine/actions/scene.ts` (`intents/apply` calls `momentPass(…, 'exchange')` after the intents and staging);
  - `src/engine/actions/blocking.ts` (`campaign/set_scene_settings`);
  - `src/settings.ts` (R14 fields);
  - `src/app.ts` (`syncSceneSettings`).
- Test: `tests/engine/moments/fire.test.ts`

**Interfaces:**
- Produces:
  - `momentPass(draft, ctx, cause): EngineEvent[]`;
  - `fireMoment(draft, ctx, sourceId, unitId): EngineEvent[]` (→ `moment_fired { momentId, sourceId, unitId, visitorId?, exposing? }`);
  - `sceneSettingsOf(state): SceneSettings`.

- [ ] **Step 1: Write the failing tests.**
  - `no live source draws nothing` (the rng is unchanged).
  - `the chance by frequency`: 1000 seeded passes at `normal` → 16–24 % fire.
  - `cooldowns`: minGap, maxPerScene and sourceGap hold.
  - `explicit halves the chance`.
  - `the options of third_party`: `lock` in a locked room; `hide` gone with `property_tag`; with a `tail`, hide is gone unless lying.
  - `the exposing element is the leash's label`.
  - `the visitor is stable for the same scene and exchange`.
  - `memory_surfaces reveals her keeps fact` (`revealFact`; the untold tag is gone).
  - `the same seed fires the same moment after a swipe` (restore, re-apply).
  - `the mirror syncs` (setting → campaign).
- [ ] **Step 2: Run** `npx vitest run tests/engine/moments/fire.test.ts` → FAIL.
- [ ] **Step 3: Implement** as in R10.
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15a): moments fire from live sources with cooldowns and frequency`

---

### Task 15: Her answer: expected option, gap, escalation, directive

**Files:**
- Create: `src/engine/moments/answer.ts` (`expectedOption`, `registerExpectation`, `gapOf`, `answerMoment`, `escalationVerb`, `lapseMoments`) and `src/blocking/momentDirectives.ts` (`moment:<sourceId>`).
- Modify:
  - `src/engine/actions/moments.ts` (`moment/answer`);
  - `src/engine/actions/scene.ts` (`intents/apply` applies `staging.answer` and `labels`, and lapses after `lapseExchanges` passes);
  - `src/app.ts` (the directive refresh).
- Test: `tests/engine/moments/answer.test.ts`

**Interfaces:**
- Produces:
  - `expectedOption(state, reg, moment): { key: string; strength: 1 | 2 | 3 }`;
  - `registerExpectation(fn)`;
  - `gapOf(expected: ResponseType, chosen: ResponseType): 'matched' | 'partial' | 'opposite'`;
  - `answerMoment(draft, ctx, momentId, key, via, tone?): EngineEvent[]`;
  - `escalationVerb(state, reg): EscalationVerb`.
- Directive text, at most 2 sentences, from the source's `description` and the option's generic word:
  - when fired: "A moment of tension: <tension>. <Exposing element> may give the commander away.";
  - when answered: "The commander chose to <generic word>. She takes it as <matched / partial / opposite>; she answers in character. <She escalates: escalationVerbs.promptHint.>"

- [ ] **Step 1: Write the failing tests.**
  - `the neutral expected option` is the `returned` option, else `yielded`; a registered expectation wins.
  - `the gap table` (all 16 pairs).
  - `opposite may escalate`: seeded, about 50 %; the verb is `nudge_with_foot` under the desk, `tug_leash` with a leash, else `look`.
  - `matched or partial never draws`.
  - `no axis moves` (relations deep-equal before and after).
  - `a stale moment id is refused` (`Stale moment answer.`).
  - `a reading answer below 0.55 is dropped`; `a lapse after two passes`.
  - `the directive lasts one reply` and has no commander pronoun.
- [ ] **Step 2: Run** `npx vitest run tests/engine/moments/answer.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15a): her answer to a moment with the gap and the escalation channel`

---

### Task 16: The extractor's moment fields

**Files:**
- Modify: `src/llm/calls/intentExtract.ts` (the `ripe`, `open`, `answer` and `labels` prompt lines, offered only with their lists) and `src/blocking/input.ts` (`ripe` and `open`).
- Test: `tests/llm/intentExtractMoments.test.ts`

**Interfaces:**
- Consumes: R9 and Task 15.
- Produces: `StagingOutput.{ripe, answer, labels}`.

- [ ] **Step 1: Write the failing tests.**
  - `no open moment → no answer or labels lines`; `no extracted source → no ripe line`.
  - `labels land on the open moment and are never read` (a label "obey" on a `resisted` option changes nothing).
  - `free text maps to an option` (fixture answer `{ option: 2, confidence: 0.7, tone: 'ironic' }` → `moment_answered.via: 'text'`, `tone: 'ironic'`).
  - `hostile output` (labels with newlines, markup, 300 characters, a pronoun) is sanitized or dropped.
- [ ] **Step 2: Run** `npx vitest run tests/llm/intentExtractMoments.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15a): the reading hints, answers and labels moments`

---

### Task 17: The moment card, SYS › Scene and the moment memory rules

**Files:**
- Create: `src/ui/scene/momentCard.ts` (`renderMomentCard(host, ctx)`).
- Modify:
  - `src/ui/scene/sceneScreen.ts`;
  - `src/ui/shell/sysTab.ts` (SYS › Scene, R14);
  - `src/engine/memory/resolvers.ts` (`moment_answered`: ids `present`, `her`, `visitor`; vars `name`, `source`, `key`, `type`, `visitor`);
  - `content/core/memoryRules.json` (the six moment rows of R15);
  - `content/core/glossary.json` (`moment_card`, `setting_moment_frequency`, `setting_moment_explicit`, `setting_moment_chips`, `setting_physics_realtime`, `setting_physics_interactions`, `setting_marathon_pace`);
  - `src/analysis/providers/blocking.ts` (`momentSources`: the static text and the option's response type; never her expected option).
- Test: `tests/ui/momentCard.test.ts`, `tests/engine/moments/memory.test.ts`

**Interfaces:**
- Produces:
  - the card shows the generic words first and the labels when they arrive, each option an `.alius-option` with `data-analyze="momentSources:<id>"` and `data-analyze-ctx` = the key;
  - a free-text hint line; the additions;
  - in immersive mode, no card but one dim line "something is at stake" (`glossary:moment`).

- [ ] **Step 1: Write the failing tests.**
  - `generic words, then labels`.
  - `immersive hides the chips`.
  - `a click stages moment/answer`.
  - `every option resolves and no reading names her expected option` (hidden sentinel).
  - `remembered moments`: `her_weakness` → a fact known by the present; `third_party` answered "as is" → known by the present and the visitor; `her_question` key 1 → the lie rule; `her_offer` → nothing.
  - `the SYS fields have their glossary`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/momentCard.test.ts tests/engine/moments/memory.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both files, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15a): the moment card, scene settings and the moments worth remembering`

---

## Chunk (d): contact physics

### Task 18: Physics runs, the two signals and the stand-ins

**Files:**
- Create:
  - `src/engine/physics/state.ts` (leaf: `PhysicsRun`, `SegmentPlan`, `SegmentInput`, `SegmentResult`, `StyleKey`);
  - `src/engine/physics/style.ts` (`physicsStyleOf`, `registerPhysicsStyle`, `holdsUntilOf`, `registerHoldsUntil`, `blendedStyle`);
  - `src/engine/physics/run.ts` (`startPhysics`, `stopPhysics`, `physicsSignal`, `stopWord`, `releaseCheck`);
  - `src/engine/actions/physics.ts` (`physics/start`, `physics/signal`, `physics/stop_word`).
- Modify:
  - `src/engine/state/types.ts`;
  - `src/engine/tuning.ts` (`TUNING.physics`, below);
  - `src/engine/blocking/blocking.ts` (a contact or item with `physics` starts a run when its interaction is on; removing the source stops it; `stripTagged` stops it);
  - `src/app.ts` (import).
- Test: `tests/engine/physics/run.test.ts`

**Interfaces:**
- Produces:
  - `startPhysics(draft, ctx, opts): EngineEvent[]`;
  - `stopPhysics(draft, reg, result): EngineEvent[]`;
  - `physicsSignal(draft, ctx): EngineEvent[]` (the TAP) and `stopWord(draft, ctx): EngineEvent[]`;
  - `physicsStyleOf(state, unitId)`;
  - `holdsUntilOf(state, unitId): 'signal' | 'limit' | 'blackout'`;
  - `registerPhysicsStyle(fn)`, `registerHoldsUntil(fn)`;
  - `TUNING.physics`:

    ```ts
    {
      beatMs: 1500, turnBeats: 4, warning: 30, releaseAt: { signal: 0.15, limit: 0.05 },
      breath: { drain: 14, caught: 30, missed: 8, cruelMissed: 4, windowEvery: [2, 4], seal: { leaky: 4, firm: 1, tight: 0 }, gapRelief: 5 },
      weight: { drain: 8, shiftEvery: [3, 5], shift: [15, 25], relief: 15 },
      saturation: { per: 10, bandFactor: { faint: 0.5, noticeable: 1, strong: 1.5, overwhelming: 2 }, mouth: 20, noticed: 0.6 },
      tongue: { start: 100, right: 15, wrong: 8, checkAt: 10, dryness: 6 },
      jaw: { per: 8, degradeAt: 70 }, gulp: { swallows: [4, 8], spillDirt: 60 }, progressPerBeat: 5,
      asleep: { perBeat: 0.08, exchanges: [1, 3] }, forget: { base: 0.10, cruel: 0.15, perImpunity: 0.002, from: 50 }, slipExtend: 1,
      blackout: { slots: 1, stress: 5 },
      endurance: { hold: 10, streakFrom: 3, streak: 2, training: 15, thresholds: [30, 80, 150, 250, 400], capacityPerLevel: 0.1 },
      herSkill: { practices: 8, cap: 5, mult: { drill: 1.5, clinical: 1.5, affectionate: 0.7 } },
      typing: { charsPerBeat: 40, lapseMs: 400 }, blend: [0.65, 0.35],
      style: { neutral: { windowMs: 600, falseShare: 0, noCueShare: 0, cues: 'honest', seal: 'middle' }, /* the eleven style rows of R12 */ },
    }
    ```

- [ ] **Step 1: Write the failing tests.**
  - `a contact with physics starts a run` with the stand-ins (neutral, `signal`); an interaction switched off → no run.
  - `signal releases a signal holder`, `limit ignores the first tap`, `blackout without breath_play acts as limit`.
  - `stop word at every point`: running, held, mid-segment, during a marathon skip (stubbed), at each `holdsUntil` → the run ends (`physics_outcome stopped`), the source contact or item is removed and `blocking:stop` is set.
  - `category off ends the run` (completes Task 7's todo).
  - `no draw before a run`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/physics/run.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15a): physics runs, the tap and the stop word`

---

### Task 19: Segment planning and resolution, seal, chains, her rhythm and skills

**Files:**
- Create: `src/engine/physics/segment.ts` (`planSegment`, `resolveSegment`) and `src/engine/physics/skill.ts` (`commanderSkill`, `addEnduranceXp`, `herSkillOf`, `practise`).
- Modify:
  - `src/engine/actions/physics.ts` (`physics/segment_end`, `physics/next_segment`, `physics/typed`);
  - `src/engine/state/types.ts` (`Commander.endurance`, `Relation.herSkill`).
- Test: `tests/engine/physics/segment.test.ts`, `tests/engine/physics/skill.test.ts`

**Interfaces:**
- Produces:
  - `planSegment(state, reg, run, rng): SegmentPlan`, where `SegmentPlan = { beats: Array<{ window?: { widthMs: number; false?: true }; cue?: CueKind; shift?: number; attention: Attention }> }`;
  - `resolveSegment(run, plan, inputs: SegmentInput[]): SegmentResult` (pure), where `SegmentInput = { beat: number; kind: 'breathe' | 'hold' | 'release' | 'mouth_breath' | 'gap_breath' | 'shift_weight' | 'part' | 'ask_rest'; atMs?: number; part?: string }`;
  - `physicsInput(draft, ctx, runId, segment, inputs): EngineEvent[]` (the body of `physics/segment_end`: resolve, xp, practice, the caught roll, the boundary);
  - `commanderSkill(state, physicsId): number`;
  - `herSkillOf(state, unitId)`.

- [ ] **Step 1: Write the failing tests.**
  - One test per interaction with the TUNING numbers: breath caught / missed / false / drain; weight drain and the uneven shift; saturation by band and mouth breath; tongue order; passive progress; jaw degrade and rest.
  - `seal by contact and her skill` (`leaky` +4, `firm` +1, `tight` 0; skill 2 tightens one step).
  - `capacity grows, windows do not` (level 3 → capacity 130 and the same widths).
  - `the personal rhythm differs between two units and is stable`.
  - `chains`: a gulp spill opens `tongue_work` at 60.
  - `typed consumes beats`.
  - `endurance xp by the three routes` and the thresholds; `training once a day`.
  - `her skill grows per 8 practices with the style mult` (via a registered style).
  - `resolveSegment draws nothing` (a spy rng).
- [ ] **Step 2: Run** `npx vitest run tests/engine/physics/segment.test.ts tests/engine/physics/skill.test.ts` → FAIL.
- [ ] **Step 3: Implement.** The plan stores the drawn widths; the resolution reads only the plan and the inputs.
- [ ] **Step 4: Run** both files, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15a): physics segments, seal, chains, her rhythm and both skills`

---

### Task 20: Her moves at the boundary, blackout, conditions and the physics memory rules

**Files:**
- Create:
  - `src/engine/physics/boundary.ts` (`decideBoundary`: press, lift, asleep, forgets, release);
  - `src/engine/physics/conditions.ts` (`setCondition`, `conditionsOf`, `expireConditions`, `conditionRankDelta`);
  - `src/ui/scene/wakeCard.ts`.
- Modify:
  - `src/engine/social.ts` (`socialRank` adds `conditionRankDelta`);
  - `src/engine/calendar.ts` (`expireConditions` at `slot_advanced`);
  - `src/engine/actions/scene.ts` (`scene/end` consumes `extraSlots`);
  - `src/engine/memory/resolvers.ts` (`physics_outcome`, `physics_caught`);
  - `content/core/memoryRules.json` (blackout, limit broken, caught);
  - `src/ui/commander/commanderFile.ts` and the CMDR card (conditions as chips with `data-analyze="commanderConditions:<id>"`);
  - `src/scene/context.ts` (the commander line names a condition by its `promptHint`);
  - `content/core/glossary.json` (`wake_up`, `tap_signal`, `stop_word`).
- Test: `tests/engine/physics/boundary.test.ts`

**Interfaces:**
- Produces:
  - `decideBoundary(draft, ctx, run): EngineEvent[]`;
  - `setCondition(draft, reg, id, until: { day: number; slot?: Slot }): EngineEvent[]`;
  - `conditionsOf(state)`;
  - `CampaignState.lastWake?: { day, slot, unitId, line? }` (the wake card after the scene, shown once).

- [ ] **Step 1: Write the failing tests.**
  - `asleep only at night or after rest` (seeded): her activity becomes `sleeping`, and `her_absence` is live.
  - `forgets with Impunity`.
  - `blackout only with breath_play and holdsUntil blackout` (a registered reader): the scene ends, one more slot is spent, `dizzy` lowers every social rank by 1 until the day ends, commander stress +5, and the wake card is stored.
  - `collapse at 0 elsewhere`.
  - `limit broken` (a gauge below the release point at a `limit` holder) → the memory rule; `caught` → the rule.
  - `dizzy expires at the day's end`.
  - `the commander line names the condition` without a pronoun.
- [ ] **Step 2: Run** `npx vitest run tests/engine/physics/boundary.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15a): her moves at the boundary, the blackout and the commander's conditions`

---

### Task 21: The cue pool, the `physics:` directive and the latency rule

**Files:**
- Create:
  - `src/llm/calls/physicsCues.ts` (call type `physics_cues`, `sanitizeCues`, budget 250);
  - `src/blocking/controller.ts` (`createStaging`: binds `physics.cues`, runs the segment clock and `next_segment` when no reply is pending, refreshes `physics:<id>`, resets on chat switch);
  - `src/blocking/physicsDirectives.ts`.
- Modify:
  - `src/llm/callTypes.ts`, `src/llm/calls/all.ts`, `src/llm/sites.ts` (`declare('physics.cues', 'physics_cues', 'scene', 'none', 'quiet', 'Her cues')`), `src/settings.ts` (budget 250);
  - `src/scene/sceneController.ts` (`replyPending(): boolean`);
  - `src/app.ts` (`createStaging`, `chat_changed` → `staging.reset()`).
- Test: `tests/llm/physicsCues.test.ts`, `tests/blocking/latency.test.ts`

**Interfaces:**
- Produces:
  - `StagingController = { onEvents(events), tick(nowMs), reset(), idle() }`;
  - `physics:<id>`: her rhythm in words (from the style: "even", "counts", "teases"), what she expects (`holdsUntil` in words), the last segment summary (windows caught or missed, a gasp, a slip, noise), and the stimulus stage word. **No line states what the commander feels** (a word-list test for "feel", "want", "love", "enjoy", "ashamed" and "afraid" next to "the commander").

- [ ] **Step 1: Write the failing tests.**
  - `cues: valid, cut, fallback`: a hostile answer → fallback lines by `fnv1a`; missing kinds filled from the registry.
  - `the site is declared` (registry test).
  - `slow and fast model, same outcome`: two harness runs of the same seed, one answering at once and one after three segments, end deep-equal in `scene.physics`, `commander.endurance` and `state.rng`.
  - `held drains nothing`: an ended segment waits for the reply, and the gauge is unchanged after 60 s of ticks.
  - `silent use runs back to back` (`talkativeness: 'silent'` → no wait for a reply).
  - `swipe during a hold keeps the run` (completes Task 8's todo).
  - `the directive never states a feeling`.
- [ ] **Step 2: Run** `npx vitest run tests/llm/physicsCues.test.ts tests/blocking/latency.test.ts` → FAIL.
- [ ] **Step 3: Implement.** The controller's clock is injected (`now()` and `setTimeout` from deps) so the tests drive it.
- [ ] **Step 4: Run** both files, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15a): her cue pool, the physics directive and the latency rule`

---

### Task 22: The physics panel, endurance training and the CMDR lines

**Files:**
- Create: `src/ui/scene/physicsPanel.ts` (`renderPhysicsPanel(host, ctx)`).
- Modify:
  - `src/ui/scene/sceneScreen.ts`;
  - `css/61-blocking.css` (`--alius-air`, `--alius-strain` drive a vignette and a tremor; both off under `motionReduced` / readable mode, which use a static border tint);
  - `content/core/activities.json` (`train.focus` gains `endurance_breath`, `endurance_weight` and `endurance_jaw`; effect `commander_endurance_xp`);
  - `src/engine/activities.ts` (the effect type, once a day per physics);
  - `src/content/schemas.ts` (the activity effect);
  - `src/ui/commander/commanderFile.ts` (ENDURANCE: a word per physics, NOT YET … HARDENED by level, never xp);
  - `src/analysis/providers/blocking.ts` (`contactPhysics` reading: the commander's own level only);
  - `content/core/glossary.json` (`physics_panel`, `endurance_training`).
- Test: `tests/ui/physicsPanel.test.ts`

**Interfaces:**
- Produces:
  - **Turn-based mode:** one button per input of the interaction, for example `[ BREATHE ]` and `[ HOLD STILL ]`, plus the relief inputs, `[ TAP ]` and `[ STOP WORD ]`. Space is the main input. Each button is an `.alius-option`.
  - **Real-time mode:** hold Space or a button; the window cues come only from the cue lines and visuals.
  - Typing in the scene input lapses maintenance (R12).
  - No number is shown unless "show raw values" is on.

- [ ] **Step 1: Write the failing tests.**
  - `turn-based buttons stage nothing and dispatch segment_end after 4 beats` (physics is not staged).
  - `typing lapses holds in real time` (fake clock).
  - `the stop word is always present and enabled`.
  - `reduced motion: no tremor class`.
  - `no meter without raw values`.
  - `chat switch stops the clock`: the controller is reset, and a pending `segment_end` is dropped with `chat_changed`.
  - `TRAIN offers endurance drills, once a day`.
  - `every element resolves`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/physicsPanel.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15a): the physics panel, endurance drills and the commander's endurance`

---

## Chunk (e): physics depth

### Task 23: Her gaze, cheating and noise

**Files:**
- Create: `src/engine/physics/gaze.ts` (`attentionPlan`, `cheatRoll`, `noiseOf`).
- Modify:
  - `src/engine/physics/segment.ts` (attention per beat; relief inputs);
  - `src/engine/actions/physics.ts` (the caught roll at `segment_end`);
  - `src/engine/moments/fire.ts` (`noiseBoost`);
  - `src/ui/scene/physicsPanel.ts` (the relief buttons; `watch` / `look_away` cue lines).
- Test: `tests/engine/physics/gaze.test.ts`

**Interfaces:**
- Produces: `attentionPlan(run, activity, style, rng): Attention[]`, `cheatRoll(rng, attention, reading): boolean` and `noiseOf(slip): { loudness: number; kind }`.

- [ ] **Step 1: Write the failing tests.**
  - `attention follows her activity` (`reading_reports` is mostly busy; `attending` mostly watching).
  - `relief restores` (+15 strength, −20 saturation, +5 air only when leaky).
  - `caught rates` (seeded 10 000: watching ≈ 0.6, busy ≈ 0.08; reading 3 ×1.3).
  - `caught is a double slip and fires the rule`.
  - `every slip is a sound; stillness 0`.
  - `noise raises third_party's weight`.
  - `no reading names her attention` (hidden sentinel).
- [ ] **Step 2: Run** `npx vitest run tests/engine/physics/gaze.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15a): her gaze, cheating and the noise of the body`

---

### Task 24: Combined physics

**Files:**
- Create: `src/engine/physics/combined.ts` (`mergeInputs`, `COMBINE_RULES` by interaction pair).
- Modify: `src/engine/physics/run.ts` (`second`), `src/engine/physics/segment.ts`, `src/ui/scene/physicsPanel.ts` (both inputs shown).
- Test: `tests/engine/physics/combined.test.ts`

**Interfaces:**
- Produces: `PhysicsRun.second?: PhysicsCore`; `mergeInputs(main, second, inputs): { main: SegmentInput[]; second: SegmentInput[]; notices: number }`.

- [ ] **Step 1: Write the failing tests.**
  - `breath + weight`: a held breath steadies the weight (drain −25 %).
  - `breath + saturation`: mouth breath in a window is caught and noticed.
  - `her_activity + breath`: progress and air both move.
  - `a slip in either is a slip of the run`.
  - `the stop word ends both`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/physics/combined.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15a): two physics at once`

---

### Task 25: The marathon

**Files:**
- Create: `src/engine/physics/marathon.ts` (`isMarathon`, `phasesOf`, `phaseLength`, `resolveSkip`, `attrition`).
- Modify:
  - `src/engine/actions/physics.ts` (`physics/skip`);
  - `src/engine/physics/run.ts` (the phase flow; `extraSlots`; `stiff` after);
  - `src/ui/scene/physicsPanel.ts` (the fiction clock `17:40 … 19:15`, `data-analyze="glossary:marathon"`; the four strategy options between phases);
  - `content/core/glossary.json` (`marathon`, `marathon_strategy`).
- Test: `tests/engine/physics/marathon.test.ts`

**Interfaces:**
- Produces: `MarathonState = { hours: number | 'unknown'; phase: number; phases: number; clockMin: number; spare?: number }`, `phaseLength(pace, mode, physics): number` and `resolveSkip(run, strategy, rng): { held: boolean; summary: string }`.

- [ ] **Step 1: Write the failing tests.**
  - `phases: 2 per 2 h, up to 8; unknown hides the count`.
  - `attrition: each phase starts weaker`.
  - `skip draws once with 0.5 + 0.1 × level`; `spare helps the next phase`; `cheat uses the gaze roll`.
  - `the pace changes the real length only`: the same seed at `short` and `long` gives deep-equal fiction results (hours, slips, outcome, `extraSlots`).
  - `the calendar cost`: a 5-hour hold from the afternoon ends the scene with two slots spent.
  - `stiff after, and marathon_done with hours`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/physics/marathon.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15a): long holds as a marathon`

---

### Task 26: The stimulus body layer and the scent band

**Files:**
- Create: `src/engine/physics/stimuli.ts` (`exposureOf`, `applyWay`, `inhaleZone`, `updateTrajectory`, `perceptionWord`, `decayStimuli`) and `src/engine/physics/scent.ts` (`scentBand`, `scentLevel`).
- Modify:
  - `src/engine/state/types.ts` (`Commander.stimuli`);
  - `src/engine/actions/physics.ts` (`physics/stimulus`);
  - `src/engine/tuning.ts` (`TUNING.scent`, `TUNING.stimuli = { tolerancePerSession: 2, decayDays: 7, reflexMult: 1.2, faintFadeAt: 40, seekAlpha: 0.15, stages: [0.2, 0.4, 0.6, 0.8], hysteresis: 3, separatedDays: 7, missingDays: 3, missingStress: 3 }`);
  - `src/engine/memory/resolvers.ts` (`stimulus_stage_changed`) and `content/core/memoryRules.json` (two rows);
  - `src/ui/scene/physicsPanel.ts` (the ways as options; the inhale bar in real time and three depths in turn-based mode);
  - `src/blocking/physicsDirectives.ts` (the perception word);
  - the day step (`decayStimuli` on `director_tick`).
- Test: `tests/engine/physics/stimuli.test.ts`

**Interfaces:**
- Produces:
  - `scentBand(state, reg, unitId, part): 'faint' | 'noticeable' | 'strong' | 'overwhelming'`;
  - `applyWay(draft, ctx, way, kind, depth?): EngineEvent[]`;
  - `perceptionWord(state, reg, kind): string`.

- [ ] **Step 1: Write the failing tests.**
  - `the scent band`: feet after a run is `strong`; armpits at rest are `noticeable`.
  - `tolerance rises by session and slips back by days apart, floored at half the best`.
  - `the reflex above tolerance × 1.2`; `the inhale zone widens with tolerance`; `overshoot → reflex and noise`.
  - `the trajectory with hysteresis` (three seeking contacts in a row before a stage moves).
  - `faint fades from tolerance 40`.
  - `separated after 7 days`.
  - `craving / adoring while she is present → the rules; absent → none`.
  - `something is missing`: a kind at `craving` or above with no exposure for `TUNING.stimuli.missingDays` (3, `AUTHOR TO TUNE`) adds commander stress `TUNING.stimuli.missingStress` (3) once a day (`addCommanderStress`), and the perception word is `missing` until the next exposure (spec §16.8 consequences).
  - `the directive carries perception, never feeling`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/physics/stimuli.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15a): tolerance, reflex, the ways of breathing her in and the trajectory`

---

### Task 27: Mouth acts (kisses and the tongue)

**Files:**
- Create: `src/engine/physics/acts.ts` (`actsFor`, `startAct`, `finishCounted`).
- Modify: `src/engine/actions/physics.ts` (`physics/act`), `src/ui/scene/physicsPanel.ts` (the act row on a `mouth` contact; the counted kisses' finish field), `content/core/glossary.json` (`mouth_act`, `counted_kisses`).
- Test: `tests/engine/physics/acts.test.ts`

**Interfaces:**
- Produces: `actsFor(state, reg, contact): ActKind[]`; `startAct(draft, ctx, kind)`; `finishCounted(draft, ctx, typed: number)`.

- [ ] **Step 1: Write the failing tests.**
  - `acts only on mouth contacts`.
  - `kiss is a discrete act with a directive line`.
  - `counted: the right number finishes, a wrong one restarts`; `n is stable by hash`.
  - `lick runs tongue_work with dryness`; `mouth runs jaw`; `pet runs timing every beat`; `long runs hold`.
  - `taste exposure per kind`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/physics/acts.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P15a): kisses and the tongue as acts`

---

## Chunk (f): coverage, guard, docs

### Task 28: Analysis coverage, hidden sentinels and the gates in every reading

**Files:**
- Modify: `src/analysis/providers/blocking.ts`, `tests/analysis/hidden.test.ts` (sentinels), `tests/ui/analyzeCoverage.test.ts` (the new screens) and `content/core/glossary.json` (whatever the coverage test still finds).
- Test: `tests/analysis/blockingHidden.test.ts`

**Interfaces:**
- Consumes: every provider registered in Tasks 12, 17, 20, 22 and 23.

- [ ] **Step 1: Write the failing tests.**
  - `no reading shows`: her expected option, `herSkill`, her rhythm pattern, a segment plan's windows, her attention, or a `keeps` fact before it surfaced.
  - `a disabled category's entry is absent from every reading list`, and `a dynamic entry at frame equal` too.
  - `every scene element added by P15a resolves`.
- [ ] **Step 2: Run** `npx vitest run tests/analysis/blockingHidden.test.ts` → FAIL (or PASS where the earlier tasks already did it; then add the missing sentinel until one fails, and fix it).
- [ ] **Step 3: Implement** what is missing.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `test(P15a): analysis coverage and hidden sentinels`

---

### Task 29: The unaffected guard and the manual test

**Files:**
- Create: `tests/blocking/unaffected.test.ts`, `docs/MANUAL_TEST_P15a.md`.
- Test: `tests/blocking/unaffected.test.ts`

**Interfaces:**
- Consumes: `tests/helpers/unaffectedWeek.ts`.

- [ ] **Step 1: Write the failing test** (it should pass at once if the gate holds; make it fail first by asserting against a deliberately wrong golden, then correct it):
  - `unaffected week`: the seeded week of `unaffectedWeek` with scenes among comrades ends deep-equal to the pre-P15a golden in `state` minus the new optional keys, which must be absent, and in `state.rng`.
  - `the same week with every new category on and no close relation is still unaffected`.
  - `a confidant scene with nothing set adds no prompt line`.
- [ ] **Step 2: Run** `npx vitest run tests/blocking/unaffected.test.ts`.
- [ ] **Step 3: Write `docs/MANUAL_TEST_P15a.md`.** It is about 12 steps, in the style of `MANUAL_TEST_P14c.md`:
  - a confidant scene: the strip, chips and `[BLOCKING]` in the prompt (SYS › debug);
  - a swipe after a chip; a blindfold and the POV;
  - paw mitts lock the PDA;
  - a visitor moment with hide / as is / show yourself and labels arriving;
  - immersive mode;
  - a ring gag's jaw physics in both modes;
  - a slow model during a hold; the stop word; the tap;
  - endurance drills on TRAIN;
  - turning `restraint` off mid-scene;
  - a campaign with no close relation looks as before.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `test(P15a): the unaffected guard and the manual test`

---

### Task 30: Docs

**Files:**
- Modify:
  - `docs/packages/P15a-scene-blocking-moments.md`: the status line (`implemented`) and an **Implemented as** section with every ruling R1–R16, the open items and the non-obvious things;
  - `docs/00-overview.md`: §5.2 (`intent_extract` 700 and its `staging` block; the `physics_cues` row), §5.4 (the P15a interfaces), §8 (SYS › Scene), §9 (status);
  - the specs of **P15**, **P16**, **P16b**, **P17**, **P17a**, **P17b**, **P17c**, **P17d** and **P17e**: turn each "Left to this package by P15a" note into an **Interfaces already provided by P15a** section (what exists, the hook to register, what is still theirs);
  - `CLAUDE.md`: one rule line for P15a like the other packages;
  - `docs/CONTENT.md` (done in Task 6; check it).
- Test: none (docs). `npm test` must still pass.

- [ ] **Step 1: Write the docs** as listed.
- [ ] **Step 2: Run** `npm test` → PASS; `npx vitest run tests/content/pronouns.test.ts` → PASS.
- [ ] **Step 3: Commit** `docs(P15a): implemented as, overview, hand-off notes`
