# P3 — Scenes, Relationships, Memory & Comms

**Depends on:** P0–P2. **Read:** overview (esp. principles P1–P5, §5.2–5.3, §7); `content/defects.md` (social hooks).

**Status:** implemented (plan: `plans/2026-11-08-p3-scenes-relationships-memory.md`). Automated tests pass; the in-SillyTavern checklist `MANUAL_TEST_P3.md` still has to be run by hand. Where an earlier draft of this spec said something else, the code won; the differences are listed under **Implemented as** at the end.

This is the heart of Alius (~70% of play). Quality bar is highest here.

## Goal

Conversations happen in an immersive scene UI; every exchange is read by the mechanic model and turned into validated intents; the engine moves three relationship axes with diminishing returns and value alignment; relationships move through a branching state graph via events and consent; facts and chronicle make choices remembered; PDA DMs and night events make characters take initiative.

## 1. Scenes

- Start: `talk` activity (P2), the optional group scene after a `mess` meal, night events, event triggers and post-expedition debriefs (P5, through `scene/start` origins `event` and `debrief`).
- Scene record: `{ id, day, slot, locationId, participants[unitIds], mode: 'private'|'group', origin, startedAt, endedAt }`.
- Presence: only participants are active members of the ST group chat during the scene (adapter `setMemberActive`). Target ratio private:group ≈ 70:30 is a UX default (talk defaults to 1 companion).
- Location picker: base locations from P2; background image by `locationId` (+ time-of-day variant if present); ASCII fallback art if no image.
- End scene: button `[END TRANSMISSION]` → `scene_summary` → facts + chronicle → slot consumed → return to PDA.
- Soft pacing: after N exchanges (setting, default 30) the header shows "time is passing"; no hard cut.

## 2. Scene UI (screen `scene`)

VN-like composition, not ST's bottom text box:
- Full background; 1–3 knee-up sprites (group scenes arrange left/center/right, speaker brightened).
- Dialogue panel styled as a **terminal transcript**: speaker tag slams in (`RHEA //`), text types out (speed setting), emphasized words in model output (`*…*`) rendered as highlighted glitch-text.
- Player input is a **command line** `CMD>` with free text always available.
- Choice chips appear above the command line only when the engine needs a validated choice (proposals §5, dilemmas P6).
- Minimal HUD: per-present-unit relationship glyph (state icon) + band changes as brief pulses (`▲ TRUST`), raw numbers only with "show raw values".
- Scroll-back log; swipe/regenerate passthrough to ST (regeneration discards the pending intent extraction for that message).
- Design room for Danganronpa / The Hundred Line flourishes (cut-ins on major events, statement slams) — implement the hooks (`ui.cutIn(eventType)`) with one simple animation in v1.

## 3. Intent extraction (`intent_extract`)

Modes (setting): per exchange (default), every N exchanges, scene end only.

Input: last exchange(s), participants' compact profiles (values, triggers, likes/dislikes tags, current state, defect ids), open promises, allowed enums.

Output schema:
```
{
  events: [{
    type: EventType, actor: 'commander'|unitId, targets: unitId[],
    severity: 'minor'|'moderate'|'major'|'extreme',
    valueAxes?: [{ axis: ValueAxis, direction: -1|1 }],
    tags?: string[],             // matched likes/dislikes/triggers
    evidence: string,            // ≤20 words, quoted/paraphrased from the exchange
    confidence: 0..1
  }],
  facts: [{ about: unitId[]|'world'|'commander', text, importance: 1..5, tags: string[] }],
  proposals: [{ from: 'commander'|unitId, to: 'commander'|unitId, kind: ProposalKind, evidence }],
  promises: [{ by, to, text, kind: 'made'|'kept'|'broken' }],
  emotions: [{ unitId, label: one of the 28 expression labels }],
  stressHints: [{ unitId, direction: -1|1, severity }]
}
```
`EventType` (v1): `praised, insulted, comforted, dismissed, listened, shared_secret (actor shares), learned_about (commander learns about target), gift, flirted, rejected_advance, accepted_advance, physical_affection, sided_with, sided_against, decision_aligned, decision_violated, protected, endangered, coerced, apologized, lied_detected, kept_promise, broke_promise, mocked_defect, accepted_defect, crime_revealed`.

`ProposalKind`: `friendship_deepen, confide, date, fwb, romance, exclusive, break_up, reconcile, rivalry, secret_affair`.

Rules: drop events with confidence < 0.5 (setting); drop unknown ids; max 6 events per exchange; `evidence` required (makes debug mode readable and discourages invention). Emotions from this call drive sprites when sprite mode = mechanic (no separate `emotion_pick` unless extraction is batched).

## 4. Delta engine

Axes: `trust` 0–100, `affinity` −100…100, `attraction` 0–100.

`eventDeltas` registry: base delta per `(eventType, severity, axis)`. Example rows: `insulted/major: trust −4, affinity −10`; `protected/major: trust +8, affinity +6`; `flirted/minor: attraction +2 (×receptivity)`.

Modifiers, applied in order:
1. **Value alignment** for `decision_aligned/violated` and any event with `valueAxes`: `m = Σ (unitValue[axis] × direction) / 3`, clamped −1…1; delta = base × m (so the same decision can raise one unit and lower another).
2. **Tags**: matched like ×1.5, dislike flips positive affinity effects to negative, trigger = auto-escalate severity one step + stress.
3. **State modifiers** from `relationshipStates` (e.g. `obsessed` doubles affinity gains *and* losses; `estranged` halves gains).
4. **Defect modifiers** (e.g. `affect_dampener` halves affinity/attraction gains, `imprint_fracture` +50% trust gains).
5. **Diminishing returns** on **gains only**, per unit per axis per day: `effective = delta / (1 + gainedToday / k_axis)` (k from settings, default 6). Losses are never diminished.
6. Clamp to axis range.

Stress: `stressHints` + event table stress columns; comfort/listen reduce, insults/triggers raise.

Loyalty band (consumed by P6), with hysteresis on Trust: `steady` (≥35), `wavering` (enter <25, exit ≥35), `breaking` (enter <10, exit ≥20).

All of this is pure engine code with exhaustive tests.

## 5. Relationship state graph (registry `relationshipStates`)

Each state: `id, group (platonic|romantic|complex|negative|base), entry { axes: ranges, flags: required/forbidden, minDaysInPrev, fromStates[], via: 'event'|'proposal'|'automatic' }, exit { …conditions → targetState }, modifiers, unlocks { synergies[], activities[], nightEvents[], defectArcStages[] }, promptHint (how the main model should play this state)`.

v1 states (thresholds are drafts):

| Group | State | Entry (sketch) |
|---|---|---|
| base | `stranger` → `comrade` | start / Trust ≥ 20 (automatic) |
| platonic | `trusted` | Trust ≥ 45, 3 days as comrade (automatic) |
| platonic | `friend` | Affinity ≥ 30, Trust ≥ 30, event `friendship_deepen` |
| platonic | `confidant` | friend + Affinity ≥ 55 + flag `shared_secret` |
| platonic | `kindred` | confidant + Affinity ≥ 80, Attraction < 30 (deepest non-romantic bond) |
| romantic | `flirting` | Attraction ≥ 25, Affinity ≥ 15, proposal `date` or repeated `flirted` accepted |
| romantic | `fwb` | Attraction ≥ 45, Affinity 10–55, proposal `fwb` accepted |
| romantic | `lover` | Attraction ≥ 50, Affinity ≥ 55, Trust ≥ 35, proposal `romance` accepted |
| romantic | `devoted` | lover ≥ 10 days + Affinity ≥ 85 + proposal `exclusive` |
| romantic | `secret_affair` | romantic state with B while A is in `fwb/lover/devoted`, chosen to hide |
| complex | `obsessed` | Affinity ≥ 60 and (Trust < 25 or stress ≥ 80 repeatedly or `possessive_protocol`) |
| complex | `dependent` | Affinity ≥ 40 and defect-driven need (`imprint_hunger`, `graft_rejection`, `compliance_craving`) and commander controls the need |
| complex | `rival` | Trust ≥ 30, Affinity −30…20, repeated `sided_against` + respect events |
| complex | `rival_romance` | rival + Attraction ≥ 45 + proposal |
| complex | `unrequited` | one side's Attraction ≥ 50, other declined `romance` |
| negative | `resentful` | ≥ 1 Leash use on her and Trust < 30 |
| negative | `estranged` | Affinity ≤ −30 |
| negative | `despises` | Affinity ≤ −60 and Trust < 15 (P6 enables attack outcomes) |

**Consent & proposals:** transitions marked `proposal` never fire from numbers alone.
- Character-initiated proposal (from `proposals[]` where `from` = unit): engine checks entry conditions; if met, shows chips `[ACCEPT] [DECLINE] [NOT NOW]`; decline applies a `rejected_advance`-style delta and may enter `unrequited`.
- Commander-initiated proposal: engine checks her conditions; result is injected as a directive for her next reply: *receptive* or *declines, reason band (too soon / doesn't trust you / not interested / already committed)*. Mechanics decide, the model narrates.
- Character initiative frequency scales with the romantic intensity setting.

**Multiple romances:** allowed, expensive. Entering a romantic state with B while A is romantic: if A learns (fact visibility, witnesses, rumors), A gets `broke_promise`/`sided_against` at `extreme` + state check (often `resentful`/`estranged`/`obsessed`). `secret_affair` tracks concealment; every scene/DM has a discovery roll scaling with squad Insight-like factors.

Romance setting off → romantic states filtered from the graph. Explicit setting → directive `Explicit content: allowed|not allowed` in scene context; romantic intensity → proposal/night-visit frequency.

## 6. Memory

- **Facts**: `{ id, about[], text, tags[], importance 1–5, day, sceneId, knownBy[] }`. `knownBy` enables secrets/witnesses: a fact is only injected for units who know it.
- **Promises**: tracked with status; open promises injected; deadlines optional.
- **Chronicle**: one line per scene (from `scene_summary`), daily compaction into a day entry, weekly compaction into a week entry (mechanic model, budgeted). LOG tab shows chronicle as an old-forum thread ("CCP INCIDENT LOG").
- **Retrieval** for context: score = participant overlap ×3 + tag overlap ×2 + importance + recency decay; top-k by token cap.
- **Crime discovery**: `crime_revealed` or facts with tag `crime` set `knows_crime` and apply the crime's `valueReactions` once.

## 7. PDA COMMS (DMs)

- Thread per named unit, retro messenger look. Player sends text; reply via `dm_reply` (main profile, short-form system prompt, minimal context: state, recent facts, current slot).
- DMs don't consume slots; each DM exchange runs `intent_extract` (cheap mode) and counts toward diminishing returns.
- Character-initiated DMs at slot transitions: probability from state + initiative setting + defect hooks; a unit's "social battery" (simple counter per day) can make her ignore or snap at spam.
- Unread counter on COMMS tab.
- DM content can create proposals (shown as chips inside the DM thread).

## 8. Night events

Queue entries from: states (`lover`, `devoted`, `obsessed`, `fwb` visits; `dependent` needs), defects (`imprint_hunger` withdrawal, episodes), P6 (desertion attempts). Max 1 per night; priority order; at end of Evening, if queued → `night` slot with a pre-framed scene (knock on the door UI: `[OPEN] [IGNORE]`; ignoring has consequences per entry).

## 9. Hooks exported to other packages

`getRelation(unitId)`, `applyIntents()`, `getSynergies(unitIds)` (for P4), `enqueueNight()`, `addFact()`, `loyaltyBand(unitId)` (P6), `contextProviders` (scene header, unit states, facts, directives).

## Acceptance criteria
1. A private scene with one unit runs end-to-end: free text, replies, intents applied, sprites change, summary saved, slot consumed.
2. A group scene with 3 units activates only those members in ST.
3. The same `decision_violated` intent moves two units with opposite values in opposite directions.
4. Gains diminish within a day and reset next day; losses don't diminish.
5. No proposal-gated state is entered without accept; commander proposal produces the correct directive for receptive/declining cases.
6. A secret second romance can be discovered and produces the specified reaction.
7. Facts known only by unit A never appear in unit B's injected context.
8. DMs work, unit-initiated DMs appear, unread counter updates.
9. Night event fires from `lover` state and is skipped when the queue is empty.
10. Tests: delta pipeline (each modifier), hysteresis, state transitions (every state's entry/exit), retrieval scoring, intent sanitization with hostile fixtures.

## Interfaces already provided by P2 (implemented — use, do not rebuild)

- **Starting a scene:** the `talk` activity (`activity/do`) emits `scene_requested { unitId, origin: 'activity' }`, records `calendar.pendingScene { unitId, day, slot }` and does **not** spend the slot. While a scene is open P2 rejects every other activity and every `calendar/consume_slot` except `reason: 'scene_end'`. **End a scene** with `calendar/consume_slot { slots: 1, reason: 'scene_end' }` (spends the slot and clears the lock) or drop it with `calendar/cancel_scene`. The app used to cancel the scene immediately and toast "Scenes are not available yet"; P3 removed that (see **Implemented as**).
- **Night events:** push entries onto `calendar.nightEventsQueue`. At the end of Evening the head entry moves to `calendar.nightEvent` and the slot becomes `night`; read it from there. Ending Night rolls the day over (no second day-end run). Entries left in the queue come back on the next evening.
- **Diminishing returns:** P2 writes every relation change through `applyRelationDelta` → the handler set by `setRelationGainHandler(({ state, unitId, relation }, axis, amount, source) => appliedDelta)`. Install P3's accounting there; the default is a soft (4/day) and hard (8/day) cap on gains. `relation.dailyGain` is zeroed by P2 at every day rollover. Losses are applied in full by the default; keep that.
- **Companion activities** (`train`, `workshop`, `medbay`, `rest` with a companion) already give small Affinity/Trust through that handler (never Affinity/Attraction to a grunt: grunts are Trust-only). The `workshop` and `rest`/`mess` social hooks of defects (e.g. Hunger Loop: meals give extra Affinity) are **not** implemented: they are P3's.
- **Day-end hooks:** `registerDayEndStep('dm_rumors', fn)` for character-initiated DMs. Do not rely on `slot_advanced` for the day end; use the hook.
- **Social checks:** `meetsSocialRequirements(state, { empathy: 3 })`.
- **Context:** `calendar` header data for the scene header: `state.day`, `state.slot`, `clockText(day, slot)`.
- A relation's `loyaltyBand` is only initialised by P1/P2 (from Trust at creation); P2's Trust penalties (shortage streak) do **not** recompute it. P3/P6 own the hysteresis; recompute after Trust changes.

## Implemented as

Decisions taken while implementing, where the spec was silent or the P0–P2 code already had an answer. Numbers marked *draft* are balance placeholders in `src/engine/tuning.ts` (`TUNING.relations`, `TUNING.memory`, `TUNING.comms`) or in the JSON content.

### Rules
- **Who an event moves.** v1 has no NPC↔NPC relations. `actor: 'commander'` → every unit in `targets`; `actor: <unitId>` with empty `targets` → that unit's stance toward the commander (`shared_secret`, `apologized`, …). Unit→unit events are dropped by the validator (`validateIntents`), which re-checks everything the LLM sanitizer already filtered: unknown enums and ids, events without evidence, `valueAxes` on non-decision types, more than 6 events, over-long text. A grunt only ever gets Trust.
- **Value alignment** applies only to `decision_aligned` / `decision_violated`; their `eventDeltas` rows hold magnitudes and the sign comes from `m = clamp(Σ value·direction / 3, −1, 1)`, so one decision can raise one unit and lower another. A decision without `valueAxes` changes nothing.
- **Tags.** Only tags the unit really owns count (`likes`, `dislikes`, `triggers`), whatever the model claims. A trigger escalates the severity one step before the row lookup and adds `triggerStress`; a dislike turns a positive Affinity delta into the same negative amount (and wins over a like).
- **Receptivity** for attraction gains: 0 when romance is off or Affinity < 0, 0.5 when Trust < 20, else 1.
- **Diminishing returns** are P3's handler (`installRelationAccounting()`, installed when `engine/actions/scene` is imported): `effective = amount / (1 + gainedToday / k)`, `k = 6` per axis (`state.settings.relationK` may override), rounded half away from zero, then clamped. P2's companion activities share the same accounting. Losses are never diminished.
- **States.** 19 states (the spec table has 18 rows; the first is `stranger` + `comrade`). `stranger → comrade` is an exit rule of `stranger` (Trust ≥ 20); `comrade` itself is entered only by the `break_up` / `reconcile` proposals. A state with `when: { anyOf: [] }` is never entered (`stranger` is the start state). `entry.fromStates` and `entry.when` apply to every path in; the conditions language is documented in `CONTENT.md`.
- **Automatic transitions** pick the highest-priority state that holds **and outranks the current one** (otherwise `despises` and `estranged` would flap); exits are checked first. At most one transition per evaluation. Transitions and loyalty bands (hysteresis on Trust: steady ≥ 35, wavering enter < 25, breaking enter < 10 / exit ≥ 20) are re-evaluated after every `intents/apply`, `proposal/answer`, `dm/receive`, `night/ignore`, and once per day in the `dm_rumors` day-end hook (this catches Trust/Affinity moved by P2 activities and shortage penalties). `stress_high` history marks are added there for units at Stress ≥ 80.
- **Proposals and consent.** A state with `via: proposal` is never entered from numbers: it needs `proposal/answer { accept }` (re-checked against the current numbers) or a receptive commander proposal. Her proposals wait in `state.proposals`; the commander's proposal is decided at once and its result becomes the directive of her next reply. Failure reasons come from the first failed group (`too_soon` → `no_trust` → `not_interested` → `committed`; `unavailable` when romance is off or nothing lists the kind). `committed` means another unit is `devoted`: with a devoted partner no second romance, not even a secret one, is possible. Declining a romantic proposal applies `rejected_advance` (moderate) and may enter `unrequited`; declining a friendly one applies `dismissed` (moderate).
- **Second romance.** Accepting a romantic state while another unit is in a romantic state asks `[OPENLY] [SECRETLY]`. Openly: every partner reacts at once (`broke_promise` extreme for a lover/devoted, else `sided_against` extreme). Secretly: she enters `secret_affair` with `relation.affair = { as, hiddenFrom, since }`. The `secret_affair` proposal kind is hidden by definition (nothing to disclose; `as` is `flirting`). Discovery rolls at every scene end and DM exchange for units that are present (`base 0.04 + 0.04 per other present + 0.15 when a hidden partner is present`), and is certain when an `affair`-tagged fact is known by a hidden partner. On discovery the partners react as above and she becomes `affair.as`.
- **Confidant.** Entered by the `confide` proposal at Affinity ≥ 55 (no prior `shared_secret` needed); accepting sets the flag, and so does the `shared_secret` event.
- **Intimacy settings** (`romance`, `romanticInitiative`) are global settings mirrored into `state.settings.intimacy` by `campaign/set_intimacy` (the app dispatches it on load and when SYS changes them). Romance off ⇒ no romantic proposal, transition, night visit or initiative; existing romantic states stay. `explicitContent` is context-only and never enters the state.
- **Crime discovery** (`crime_revealed` or a fact tagged `crime`): units without `knows_crime` get it and, once, `valueReactions` shift Trust (`3 · weight`) and Affinity (`5 · weight`); units that already knew the crime are left alone.
- **Promises** are recorded as `made`; `kept` / `broken` closes the best open promise by word overlap (≥ 0.3, else the newest) and yields the `kept_promise` / `broke_promise` event unless the same intent list already carried one. Only the commander's promises move a relation.
- **Chronicle.** Scene lines (max 240 chars, with the slot) → one day entry per past day → one week entry per week that is over (made of whatever day entries it has; a day without scenes has none); new call type `chronicle_compact` (mechanic, 400 tokens); without a profile, an answer or with the setting off the lines are joined (cut to 400 chars). `memory/compact` rejects anything but the due compaction.
- **Retrieval** score is `3·participants + 2·tags + importance + 3·0.8^age`; a fact reaches the prompt only if **every** present participant knows it (`knownBy` holds unit ids or `'*'`).
- **DMs.** Per unit a "social battery": the 1st–4th commander message of a day is answered, the 5th–6th snapped at, the 7th+ left on read (no model call). Unit-initiated DMs roll after every slot transition (at most two initiators, never a unit with an unanswered initiated message; chance = state `dmChance` × initiative multiplier + defect bonus, 0 for romantic states with romance off). A DM exchange is read with the cheap extraction (last two messages); commander proposals found in a DM are ignored (her text was written before any verdict); hers become chips in the thread.
- **Night.** Visits roll once a day (`dm_rumors`, after the relationship pass) and when the commander is injured; entries expire after two days; one entry per night, highest priority first, the rest wait. `night/ignore` applies the entry's consequence as an intent event from the commander's side and rolls the day.
- **Defect social hooks** use a new additive P2 hook, `registerActivityHook(fn)`, called after an activity's effects and before its slot is spent (grunts have none).
- **Resentful** counts `leash.log` entries with `unitId === <unit>`; P6 must log Leash uses in that shape.
- **Grunts** stay Trust-only: no Affinity/Attraction, base states only, no scenes and no DMs (the `talk` companion list hides them).

### Scenes and the app
- **Scene slot.** `calendar.pendingScene` is held while any scene is open (also night and mess scenes), so P2's lock keeps working; `scene/end` clears it and consumes one slot unless the scene started with `consumesSlot: false` (the free group scene after `mess`). `scene/abort` drops a scene that never opened (an activity talk keeps its hold until `calendar/cancel_scene`).
- **Transcripts** stay in the ST chat; the scene stores only `startIndex`. On reload `scene.resume()` re-activates the members, restores the directives (and the night framing) and reads the transcript from `startIndex`, clamped to the chat length.
- **Sending** goes through `/send <text> | /trigger await=true` (pipes escaped, `{{`/`}}` and a leading `/` neutralized with an invisible character). Swipes use `/swipe direction=… await=true`, regenerate `/regenerate await=true`, sprites `/expression-last <avatar>`.
- **Swipe / regenerate / delete** of the last reply undoes that exchange's extraction exactly once (`restoreSnapshot(before, expectedCurrent)` replaces the state only if nothing else happened since) and re-extracts when the new reply arrives; otherwise a debug toast says "Not rolled back". A failed extraction does not advance the read pointer, so the next one re-reads the lost exchange. The pointer is stored in the scene (`scene.readIndex`, moved by the same `intents/apply` that applies the extraction, so a rollback restores it) and `resume()` continues from it, so lines said before a reload are still read. A swipe that happens while `intent_extract` is running drops that reading (nothing was applied) and the new reply is read when it arrives or with the next message. A rolled-back extraction also withdraws the proposal directive it set.
- **Late results** (a chat switch while the model is writing) are dropped by `expectChatId`; a failed LLM call never blocks: the scene still ends with a fallback chronicle line and the slot is consumed.
- **Proposals in a scene:** the `[PROPOSE ▾]` menu is checked before the message is sent (the directive shapes her very reply); extracted `proposals[]` shape the next one. Answering one of her proposals also sets a one-reply directive so the model acknowledges it.
- **Sprites:** the scene screen draws them itself (`getSpriteUrl(avatar, label)`; `native` reads the label from the Expressions extension, `emotion_pick` uses `emotions[]` of the extraction or one `emotion_pick` call when extraction is batched). ST's `/expression-set` has no character argument, so `setExpression(avatar, label)` acts only when that avatar spoke last; nothing depends on it.
- **Locations** are a new registry (`locations`, ten core entries with ASCII art; no images in v1; `quarters_unit` is named after the unit).
- **Shell.** `registerScreen(id, render, { refresh })` lets a screen update in place (the scene screen would otherwise be rebuilt after every action); `setTabBadge` shows the COMMS unread count. The night knock is rendered by the `scene` screen when no scene is open and the Night slot holds an entry. App follow-ups (`commander_injured`, `night_started`, `slot_advanced`, `day_started`) run in a microtask after the dispatch that produced them.
- **Settings added:** `intentMode`, `intentEveryN`, `intentMinConfidence`, `scenePacing`, `typingSpeed`, `romance`, `explicitContent`, `romanticInitiative`, `unitDms`, `chronicleCompaction`, budget `chronicle_compact`.

### Hardening after the independent review
- **Caps per call:** events 6 (promise-derived events count against that budget), promises 3, proposals 3, stress hints one per unit; a scene stores at most `factsPerScene` facts over all its exchanges, the campaign at most `TUNING.memory.factsMax` (least important, then oldest, go first) and keeps at most `closedPromisesMax` closed promises.
- **`crime` tag** reveals the commander's crime only on a fact whose subject is the commander (`about: 'commander'`); on any other fact it is just a tag.
- **Open scene-channel proposals** of the participants expire at `scene/end` and `scene/abort` (`proposals_expired`).
- **`reconcile`** needs Trust ≥ 30 and Affinity ≥ −29 (what `comrade` keeps), so a receptive answer is never undone in the same call.
- **Shared prompts leak nothing:** promises carry `knownBy` and are filtered like facts; the crime is named only when every present unit knows it; a secret affair is shown with its `comrade` cover while the partner it is hidden from is present.
- **Controller:** `end()` waits for the exchange in flight; END, swipe/regenerate and PROPOSE are locked while a send is pending; batched modes read the backlog in chunks of 8 messages (up to 6 chunks); a proposal directive lapses when *its* unit replies, and scene directives are cleared when another chat loads. `app.startScene(opts)` is the entry point for other packages.

### Second round of fixes (review minors)
- `committed` counts only a **living** `devoted` partner; the directive reason reads "he is already committed to someone else" (it is the commander who is committed).
- **Discovery:** an affair whose hidden partners have all left romance is closed quietly (`affair_ended`; she becomes `affair.as`); with romance off a discovery reveals the secret and the partners react, but she stays in her current state (no romantic transition).
- **Disclosure** is re-checked when she accepts: a partner who appeared after the offer turns `accept` into an `[OPENLY] [SECRETLY]` question (`proposal_offered`, nothing entered yet).
- **History:** types that an `eventCount` condition counts (`TUNING.relations.historyKeep`: `stress_high`, `sided_against`) are evicted last from the 60-entry log; a core test fails if content counts a type that is not listed.
- **Group scene after a meal** takes the active roster's named, living units only (max 3).
- **Slash text:** `{:` (closure opener) and a leading `word=value` (a named argument of `/send`) are neutralized like `{{`.

### Found while playing in SillyTavern (first manual run)
- **Waiting for a reply** is visible: while a send is pending the scene shows `AWAITING REPLY… Ns` with a `[STOP]` button (`scene.stop()` → `StAdapter.stopGeneration()`), and the transcript follows the reply as it streams in (polled every 500 ms, never typed out a second time). ST's `/trigger`, `/regenerate` and `/swipe` wait at most 10 s for a free generation lock and then only warn; a send that brings **no reply** now says so ("No reply arrived …") and counts no exchange.
- **Editing messages:** every line has `✎`; `scene.edit(index, text)` → `StAdapter.editMessage` (text, active swipe, redrawn block, `message_edited`, saved chat). An edit inside the last exchange (your line or her reply) undoes that exchange's extraction and reads the new text; an older message only changes its text (what was read stays). Edits made in ST's own UI arrive through `message_edited` → `scene.onEdited` (our own edit is not handled twice). Editing is locked while a send is pending.
- **Readability:** the stage shows a caption with the location name (the ASCII picture is the location's placeholder art; images come with later packs) and the PROPOSE menu lists each kind with a one-line meaning.

### Not in P3
Heavy wounds; unit↔unit relations; sprite outfit variants; images for locations; the P6 refusals/desertion events that would enqueue night entries (P6 uses `enqueueNight`); balance of every number above (draft).

### P6 additions
- `applyEventToUnit(draft, reg, unitId, event, { scale? })` multiplies the three axis deltas by `scale` (negative = approval) and the stress by `max(0, scale)`; the Leash uses it for witnesses.
- `SceneRecord.refusals?: [{ unitId, exchange }]` holds the orders a unit refused in the open scene (`scene/order`); `leash/compel` clears one.
- `night/open` and `night/ignore` refuse night entries of kind `desertion`, `mutiny` and `deserter_return` (`CONFRONTATION_KINDS`); they have their own panel.
- `getSynergies` also returns `loyalty_wavering` / `loyalty_breaking` for a unit whose loyalty band is `wavering` / `breaking`.
- `Relation.history` entries `lied_detected`, `broke_promise`, `coerced`, `decision_violated`, `crime_revealed` at `major`+ are mutiny triggers; the Leash writes `coerced/extreme` for its target.
