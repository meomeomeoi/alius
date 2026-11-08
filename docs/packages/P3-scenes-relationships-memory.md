# P3 — Scenes, Relationships, Memory & Comms

**Depends on:** P0–P2. **Read:** overview (esp. principles P1–P5, §5.2–5.3, §7); `content/defects.md` (social hooks).

This is the heart of Alius (~70% of play). Quality bar is highest here.

## Goal

Conversations happen in an immersive scene UI; every exchange is read by the mechanic model and turned into validated intents; the engine moves three relationship axes with diminishing returns and value alignment; relationships move through a branching state graph via events and consent; facts and chronicle make choices remembered; PDA DMs and night events make characters take initiative.

## 1. Scenes

- Start: `talk` activity (P2), event triggers, night events, post-expedition debriefs (P5).
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
