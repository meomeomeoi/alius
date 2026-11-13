# P9 — Impunity, Discipline, Demands & Reputation

**Depends on:** P0–P8. **Read:** overview; this file; P3 (intents, deltas), P6 (disloyalty, Leash) as implemented.

## Goal

Separate "do I trust your command?" (Trust) from "what happens to me if I defy you?" (**Impunity**). Give the commander a ladder of punishments below the Leash, usable from a menu or from dialogue, with **visible feedback** whenever the game registered a threat or a punishment. Let units make **demands**, and let the squad give the commander **nicknames** from his patterns of behaviour.

## 1. Impunity

Per named unit, `I ∈ [0, 100]`, **computed**, not a free axis. Only one part is stored.

```
I = clamp( base + R + L − P·w(d) − D + C + S , 0, 100 )
```

| Term | Meaning | Default |
|---|---|---|
| `base` | from effective disposition (P8) | 25 / 35 / 45 / 55 / 65 |
| `R` | **stored** per relation `impunityRecord ∈ [−40, 40]`; `defied` + `commander_yielded` raise it, `commander_enforced` lowers it; decays toward 0 by 1/day | see §2 |
| `L` | Leash credibility | +10 if 0 authorizations left; +8 if the Leash was never used this campaign; −10 for 7 days after any Leash use the unit witnessed or heard of |
| `P·w(d)` | commander presence (P7) with first-impression decay | −15…+15 |
| `D` | her dependency on the commander | `dependent` state 15; defect upkeep through medbay 10 |
| `C` | contagion | 0.3 × mean `impunityRecord` of other squad members |
| `S` | leverage she holds | +5 per damaging secret she knows (`knows_crime` for damaging crimes, rule traits like `collared`, witnessed affair…), cap 15 |

## 2. New intents (extend `intent_extract`)

- `defied` — actor unit refuses/mocks/ignores an order or authority. Severity as usual.
- `commander_enforced` — commander imposes a consequence. Field `measure`: one of the `punishments` ids (§4) or `verbal` (reprimand).
- `commander_yielded` — commander backs down after defiance or an unmet threat.
- `threatened` — commander threatens a consequence without imposing it. Field `measure` (may be `unspecified`).

`R` deltas (draft): defied +3/+5/+8/+12 by severity (only if not followed by enforcement in the same scene), yielded +6/+10, enforced −8 (verbal) to −20 (brig/Leash). A `threatened` creates a **pending threat** (unit, measure, deadline = end of next day); if not enforced by the deadline → automatic `commander_yielded` (empty threat).

## 3. Stances

Trust (≥45 high) × Impunity (≥50 high) → one of four stances, injected as a directive (replacing generic band text when present):

| | Impunity low | Impunity high |
|---|---|---|
| **Trust high** | `disciplined` — obeys, objects by the book | `defiant_loyal` — argues, does it her way, teases him, will not abandon him |
| **Trust low** | `fearful` — complies in silence, sabotages quietly, runs rather than fights | `open_defiance` — mockery, demands, ignores orders, path to mutiny |

Stance effects: refusal *form* (open / covert sabotage / "her own way"), demand frequency (§5), mutiny eligibility (P6) requires `I ≥ 60` **or** (band `breaking` and `I < 30` → desertion instead of mutiny), covert sabotage events (`fearful`) — small resource losses, gear malfunction chance on next expedition.

## 4. Punishments

Registry `punishments`: `{ id, label, severity: 1..4, impunityDelta, deltas {trust, affinity, stress}, sideEffects (unit unavailable N slots/days, resource change, expedition bench), perception: [{ tag, multiplier }], dispositionScaling }`.

v1 ladder: `verbal` (reprimand) · `revoke_rations` · `revoke_leave` (no free activities with her for 2 days) · `extra_duty` (works a slot for the base) · `bench` (excluded from the next expedition) · `brig` (unavailable 1–3 days) · then the Leash (P6, unchanged).

Perception tags come from the profile (`lives_for_combat` → `bench` ×2; `food_love` → `revoke_rations` ×1.5; etc.). Image consistency (P7) applies.

### Two ways to punish

**Menu.** SQUAD → unit → `DISCIPLINE`, and a `DISCIPLINE` button in the scene UI: pick a measure → applied deterministically → directive for her next reply ("The commander has imposed {measure}. React in character; stance: {stance}.").

**Dialogue.** `intent_extract` detects `commander_enforced` / `threatened`. Confidence ≥ 0.6 required. On detection the scene UI shows a **chip**:
- `DISCIPLINE LOGGED — Rations revoked (Rhea)` with `[UNDO — not what I meant]`
- `THREAT REGISTERED — Brig (Rhea) · She believes it` / `· She doesn't buy it` (from current Impunity: < 50 believes)

`UNDO` reverts exactly the deltas of that application (engine stores an application record keyed by message id) and adds nothing to memory. Chips are always shown, even with "show raw values" off — the player must know whether the game understood the threat.

## 5. Demands

Registry `demandTemplates`: `{ id, kind: 'resource'|'privilege'|'exclusion'|'item'|'information'|'interpersonal', grantCost, refuseDeltas, conditions (stance, impunity range, disposition, tags, state), weight }`.

- Generation: at slot transitions the engine rolls per unit; frequency ∝ Impunity and disposition, capped (default 2 per unit per week). The engine picks the template; the `flavor` call (optional) words it in her voice.
- Delivery: DM or scene request with chips `[GRANT] [REFUSE] [TALK]` (TALK opens a scene).
- Grant: small Trust/Affinity gain, the cost, and if the demand was impunity-driven (stance `open_defiance`/`defiant_loyal`) `R` +4 ("buying loyalty"). Refuse: refuse deltas (bigger at high Impunity), may trigger `defied`.
- Examples: double ration, own room, "don't take me on the next run", "give me that rifle", "keep Neon out of my business", "tell me what you were convicted for" (information → may set `knows_crime`).

## 6. Reputation (nicknames)

Engine counters on the commander: leash uses (by type), grunts lost, units protected in Crisis, defiance tolerated, punishments by severity, promises kept/broken, demands granted/refused.

Registry `reputations`: `{ id, name, group, pattern (counter thresholds/ratios), effects (impunity base mod, directive text, value-based reactions) }`. Drafts: `leash_holder`, `meatgrinder`, `shield`, `soft_touch`, `iron_rule`, `merchant` (buys loyalty), `liar`.

When a pattern crosses its threshold and no nickname of that group is active, the engine queues a **nickname moment**: the next suitable scene gets a directive "{Unit} calls the commander '{name}' for the first time". Then the nickname becomes active (max 2), shows in the CMDR dossier, enters the context line (P7 §7), and can be replaced when another pattern takes over.

## Acceptance criteria

1. Impunity is recomputed from its terms; only `impunityRecord` is persisted; decay works.
2. An unenforced threat becomes `commander_yielded` after its deadline (test).
3. Stance directive matches the quadrant; `fearful` produces covert sabotage, not mutiny.
4. Menu punishment applies the registry deltas and a reply directive; dialogue punishment produces the chip; UNDO restores the exact previous state for that application and leaves no memory entry.
5. Threat chip shows "believes / doesn't buy it" from Impunity.
6. Demands respect caps, conditions and costs; grant/refuse update `R` as specified.
7. A nickname appears once its pattern is met, is introduced via a scene directive, and appears in the context line.
8. Disposition (P8) changes Impunity base and punishment scaling.

## Open decisions (author)

- Punishment list and severity numbers.
- Nickname names (draft in English).

## Interfaces already provided by P7a (implemented — use, do not rebuild)

- **Impunity reading:** register `registerAnalyzeProvider('glossary:impunity', …)` that shows the stance and the main terms as bands through `Knowledge` (never the raw `impunityRecord` or a warden's expectation without a rule that allows it); `state.ledger` can carry the change history if the term changes go through `dispatch`.
- **Hidden state:** use `registerKnowledgeRule({ fact?, flag? })` for what the commander does not know (unknown expectations, intercept truth flags). Extend `tests/fixtures/analyze/hidden.ts` with sentinels for the new hidden values; the hidden-state test runs over every registered provider.
- **UI:** punishment menus, chips with UNDO, demands and nicknames carry `data-analyze`; the `punishments` registry gets `description`s (add it to `DESCRIBED_REGISTRIES` / `PLAYER_VISIBLE`).

## Interfaces already provided by P7 (implemented — use, do not rebuild)

- **Presence and image consistency** exist: `presenceOf`, `firstImpressionWeight`, `imageMultiplier` (add `commander_enforced` to the `slight_build` group's `offImage` in `imageConsistency.json`, no code). The CMDR card has an empty `REPUTATION — NONE ON FILE` slot for you to fill.
- **Delegate routes** end in a *demand* when a unit is one Trust band short: `delegate_demand` is emitted and the route fails; replace that refusal with your demands. `Impunity` can join the delegate decision in `resolveRoute` (`engine/commander/checks.ts`).
- **Intimidation:** `intimidationBonus(state)` (strength and seasoning) already feeds the Authority talk-down; discipline can reuse it.
- **Traits:** `traitEffects` is the way to read a trait; add effect types to `TraitEffectSchema`, a line to `summarizeTraitEffect`, and hook points that call the reader.
