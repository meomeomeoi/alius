# P6 — Dilemmas, Disloyalty & the Leash

**Depends on:** P0–P5. **Read:** overview (principles P2, P3, P6); `content/lore.md` §2, §5; `content/defects.md` (arcs).

## Goal

Choices that cost something, enforced by the engine; soldiers who can refuse, desert or attack; and the Leash as the central coercion-versus-trust mechanic. Also: defect arcs as personal dilemmas.

## 1. Dilemmas

### Templates (registry `dilemmaTemplates`)
`{ id, scale: 'minor'|'major'|'defining', contexts (expedition_event|base|mission_outcome|defect_arc|director), requiredRefs (units/factions/regions), optionCount 2–4, constraints }`.

### Generation (`dilemma_generate`, mechanic)
Input: template, context digest, present units with values/triggers, relevant flags. Output:
```
{
  title, setup (≤120 words),
  options: [{
    label (≤12 words),
    effects: [{ kind: 'resource'|'unit_event'|'faction'|'clock'|'flag'|'stress'|'social_check',
                target, direction: -1|1, magnitude: 'small'|'medium'|'large', note }],
    requires?: { socialStat, rank }      // e.g. Empathy 3 unlocks a third way
  }]
}
```
Magnitudes map to numbers via engine tables. `unit_event` effects become P3 intents (`decision_aligned/violated` with value axes), so the same option moves different units differently.

### Validator (engine) — a dilemma is rejected and regenerated (max 1 retry, then a safe authored fallback) unless:
1. Every option has ≥1 positive and ≥1 negative effect, on **different** targets or axes.
2. At least one option negatively affects a squad member (via values) — for `major`/`defining`.
3. No option dominates another (option A is not ≥ B on every effect dimension after scoring with a simple utility over resources/factions/unit sums).
4. Magnitudes match scale (`minor` ≤ medium; `defining` must contain ≥1 large).
5. `defining` dilemmas: cooldown (default ≥ 7 days) and max 1 per spine beat.
6. Every `flag` effect references a declared flag from the `flags` registry, or a dynamic flag in the namespace of the thread this dilemma belongs to (overview §6.1). Templates list which declared flags they may set (`allowedFlags`); the model picks among them.

Presentation: modal or in-scene chips; free text is not accepted for dilemma resolution (engine must validate). After choosing, the main model narrates the immediate aftermath with the chosen option as a directive; a scene with affected units is suggested.

### Defect arcs as dilemmas
When a unit's arc unlocks (state + medbay level + story flag), she raises it in a scene; the decision (Cure / Manage / Embrace) is a `defect_arc` dilemma. Her values decide which path she *wants* (`m` from P3 alignment); forcing another path is `decision_violated` (and may need the Leash). Arc steps then become small missions/activities.

## 2. Disloyalty (uses P3 loyalty bands)

| Band | Effects |
|---|---|
| `steady` | Normal. |
| `wavering` | Scene directive: open doubt; CP orders targeting her: 15% refusal; out-of-combat orders may be refused via directive (engine roll per "order" intent). Warning signs: DMs, facts, a "we need to talk" scene request. |
| `breaking` | Refusal 35%; desertion check each day end. |

**Desertion:** day-end check in `breaking` (probability from Trust, Affinity, stress, defects). Fires as a **night event** or mission-start event: `[TALK HER DOWN]` (social check Authority or Empathy vs difficulty; success → Trust +, band re-evaluated), `[LET HER GO]` (unit leaves: status `deserted`, may reappear via director as hostile or ally later), `[SUPPRESS]` (Leash). Always telegraphed ≥ 1 day before by at least one sign.

**Attack (mutiny):** only from `despises` (or `obsessed` + extreme trigger) and a trigger event (e.g. a Leash use, a betrayal discovered, a forced defect cure). Plays as a **Mutiny encounter**: combat where she (and sympathizers with low Trust/high Affinity to her) fight the remaining squad with the commander exposed. Outcomes: subdued (stays, `resentful`, can be Terminated), escapes (deserted, hostile), or commander injured. Telegraphed by escalating signs; never fires within 2 days of entering `despises`.

**Refusal mid-scene** is a hard directive (overview P3): the model must narrate refusal; free text persuasion can change intents but the engine re-checks only at the next exchange.

## 3. The Leash

State: `leash.authorizationsLeft` per week (base by corporation/start; crime modifiers; oversight standing; failed command missions −1), `log[]`.

| Action | Use | Cost |
|---|---|---|
| **Compel** | Force one order (in scene: next reply complies; in combat: cancels a refusal; arc decision: forces path) | 1 auth; target `coerced/extreme`: Trust −15, Affinity −10, stress +15; witnesses `coerced/moderate` scaled by their values (autonomy+ hate it, obedience-leaning may approve); sets `leashed` flag; 2+ uses → `resentful` check |
| **Suppress** | Stop a desertion or attack in progress | 1 auth; target Trust −25, `resentful` likely; squad-wide stress + |
| **Terminate** | Permanent deactivation (unit removed, status `terminated`) | Requires cause (attack, repeated desertion) and oversight approval roll; squad-wide `decision_violated` with `mercy/ingroup` axes; massive event; chronicle entry |

Modifiers: `imprint_fracture` (Compel costs ×2 and may fail), `compliance_craving` (Compel costs halved — the trap is intentional), `mutiny` crime (+Trust cost). UI: Leash requests are filed through the PDA as a bureaucratic form (`OVERSIGHT REQUEST #…`) with a short delay animation — the act should feel cold.

## 4. Context contribution

Directives for refusals, desertion intent, post-Leash trauma ("she remembers being forced; she will not pretend otherwise").

## Acceptance criteria
1. Generated dilemmas violating any validator rule never reach the player; fallback works with no mechanic profile.
2. The same dilemma option raises one unit and lowers another according to values.
3. Refusals happen at specified rates in combat (seeded test) and as directives in scenes.
4. Desertion is always telegraphed; all three responses work; deserted units can return via director.
5. Mutiny encounter triggers only under the specified conditions and resolves to each outcome.
6. Leash actions apply exact costs, consume authorizations, refresh weekly, and are logged; Terminate removes the unit permanently.
7. Defect arc decision flows end-to-end for at least 3 defects.
8. Tests: validator (each rule with crafted fixtures), dominance check, loyalty band effects, desertion probability, Leash cost modifiers.

## Interfaces already provided by P2 (implemented — use, do not rebuild)

- **Day-end desertion check:** `registerDayEndStep('director_tick' | 'dm_rumors' | …, fn)`; P6 may add a night event by pushing onto `calendar.nightEventsQueue` (see P3's section). Choose the hook that fits the order you need (upkeep and ticks have already run when hooks run).
- **Header:** the PDA header already renders `LEASH n` from `state.leash.authorizationsLeft`; keep that field the single source.
- **Social checks:** `meetsSocialRequirements(state, { authority: 3 })` for `[TALK HER DOWN]` and similar.
- **Shortage trust penalty:** P2 applies −5 Trust to every living unit on every 3rd consecutive shortage day (event `trust_penalty_event`); it does not recompute `loyaltyBand` — recompute in P6 where the band hysteresis lives.
- **Medbay and defect arcs:** the `medbay` activity stamps `upkeepDay` on a unit's defects whose `arc === 'manage'`; the medbay `arcStageCap` effect (`facilityEffect(state, reg, 'medbay', 'arcStageCap')`) gates arc stages.
- **Leash crime effects** (`leash_weekly`, `leash_trust_cost`, …) are declared in the crimes content but not interpreted by anything yet.

## Interfaces already provided by P3 (implemented — use, do not rebuild)

- **Loyalty:** `loyaltyBand(state, unitId)` (`steady` / `wavering` / `breaking`, hysteresis on Trust, recomputed after every relationship change and once per day) and `getRelation(state, unitId)`.
- **Leash log shape:** the `resentful` state counts `leash.log` entries with **`unitId === <the unit>`** (`leashUsesMin: 1` and Trust < 30). Log every Leash use as `{ unitId, kind: 'compel' | 'suppress' | 'terminate', day, … }`; without `unitId` the state never triggers.
- **Directives:** `app.context.setDirective({ id, text, expiresAfter: 'next_reply' | 'scene' | 'manual' })`; P3 already sets `proposal:<unitId>` (next reply), `night` (scene), `explicit` and `romance_off` (scene). Refusals, desertion intent and post-Leash trauma are yours to set the same way.
- **Events and consequences:** apply them as intents (`coerced`, `sided_against`, `decision_violated`, … through `intents/apply`) or, outside a scene, with `applyEventToUnit` (`engine/relations/effects`); both run the full modifier chain (value alignment, tags, state and defect modifiers, diminishing returns).
- **Night entries:** `enqueueNight` (see the P5 note) for desertion attempts and night confrontations; `night/ignore` applies `entry.ignore` as an event from the commander's side.
- **States P6 reads:** `despises` (attack outcomes), `resentful`, `obsessed`, `dependent`, `unrequited`; their entry/exit conditions are data in `relationshipStates.json`.
- **Defect arcs:** states list `unlocks.defectArcStages` (`manage`, `cure`, `embrace`); the arc itself is yours.
- **Marks:** `Relation.marks[]` is still reserved and empty; P3 does not read it.
