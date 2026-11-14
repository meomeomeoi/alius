# P9 — Impunity, Discipline, Demands & Reputation

**Status: implemented** (plan: `docs/plans/2026-11-14-p9-impunity-discipline.md`; see **Implemented as** at the end; where it differs from the draft, the code wins). **Depends on:** P0–P8. **Read:** overview; this file; P3 (intents, deltas), P6 (disloyalty, Leash) as implemented.

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

## Interfaces already provided by P8 (implemented — use, do not rebuild)

- **Disposition:** `dispositionFor(state, reg, unit)` (the unit's effective level: world rank + her offset, grunts use the world) and `dispositionById(state, reg, unitId)` return the level entry; `dispositionLevels[].impunityBase` is in the schema and unread (add it to the five rows, then read it for the Impunity base). Punishment scaling can read `lossMult`, `refusalMult` and `desertionMult` from the same entry.
- **Big gestures:** `TUNING.disposition.bigGesture = { events: ['protected'], minSeverity: 'major' }` — add "granted costly demand" and "shielded from oversight" event types to `events`; `computeDeltas` then applies the level's `bigGestureMult` to the positive axes of those commander events.
- **Confidence:** a new intent type is judged per unit against the level's gain and loss floors (`dispositionThresholds`); an engine-made event uses confidence 1 and always passes.
- **Refusals:** `refusalChance` is scaled by the unit's level; `rawRefusalChance` is the source. Demands that replace the P7 delegate refusal should go through `scaleRefusal` if they roll.
- **Stances:** `stanceOf(state, reg, unit, optionId)` and `stanceEffects` (`event_stress`, `value_shift`, `directive`) are the way a unit's reaction to a world norm is read; an oversight-defiance stance (`offspec_stigma` · `opposes`) already shifts her `corporate` value for judging decisions.
- **Analysis and context:** world directives use ids `world:`, `stance:` and `friction:`; keep new directive ids out of those prefixes (`worldDirectives` clears them on every refresh).

## Implemented as

Engine: `src/engine/discipline/{impunity,record,stance,acquaintance,sabotage,restrictions,perception,punish,undo,demands,deeds,reputation,dayStep,index}.ts`, `src/engine/actions/discipline.ts` (`discipline/punish`, `discipline/undo`, `demand/roll`, `demand/deliver`, `demand/answer`, `reputation/introduce`; the day step runs on `director_tick`). Wiring layer `src/discipline/{directives,context,controller,deps}.ts` (`app.discipline`). UI `src/ui/discipline/{menu,chips}.ts`, SQUAD / scene / COMMS / wizard hooks, `css/70-discipline.css`. Analysis `src/analysis/providers/discipline.ts`. Content: registries `commandStances` (5), `punishments` (6), `demandTemplates` (6), `reputations` (7); world option `acquaintance`; `flags.json` `leverage`; `dispositionLevels[].impunityBase`; `eventDeltas` rows for the four new intents and the two engine events. Every number, nickname and demand text is a draft; the texts are marked `AUTHOR TO WRITE`.

### State
- `Relation.impunityRecord?` (R, −40…40, deleted at 0, absent = 0). `Commander.deeds?` (16 counters, `DEED_COUNTERS`) and `Commander.reputation?` (`{ active: [{ id, name, sinceDay, by?, lapsedDay? }], pending?: { id, queuedDay, replaces? } }`; the **name** is mirrored because `commanderLine` has no registry). `CampaignState.discipline?` (`defiance`, `threats`, `applications` (newest 20), `restrictions`, `sabotage?`, `demands`, `demandLog`); `disciplineOf(draft)` creates it on first write. Version stays 1; every reader tolerates the missing fields.
- Impunity is never stored whole: `impunityOf(state, reg, unitId)` returns `{ value, terms }`; only R is persisted. `I = clamp(base + R + L − P·w(d) − D + C + S, 0, 100)` with the terms of the plan's rulings (base from the disposition level plus the active nicknames' `impunityBase`; L = +10 with no authorizations left, the smooth bluff credit, −10 for 7 days after a Leash use; P = presence × first-impression weight; D = relationship-state `dependency` (core: `dependent` 15) + 10 for `need_controlled` / a `manage` defect; C = 0.3 × mean R of the others; S = 5 per leverage secret, cap 15, from flags with `leverage: true` and a concealed affair).

### What changed against the draft (rulings; the plan's ruling section holds the full text)
- **Names.** P8 owns `stanceOf` (world stances); P9's is `commandStance(state, reg, unitId)` over the registry `commandStances`, UI label `STANCE`.
- **Five stances, not four (user).** `indifferent` = Trust 30–44 and Impunity 35–59: mild directive, open refusal, no sabotage, no mutiny. Import baseline Trust is 0…60; the wizard shows the starting stance (`Wizard.previewStart`).
- **Leash "never used" is a smooth credit (user).** `round(8 × min(7, day − 1) / 7)` growing over the first week and fading over 7 days after the first request (`TUNING.impunity.leash.bluffDays`, `neverUsed`); it adds to every other term, nothing cancels anything.
- **Acquaintance period (user).** World option `acquaintance` (0…14 days, default 7; presets 10 / 7 / 3): during it a unit rolls no random sabotage, queues none from a hidden refusal and rolls no demand. It does not delay mutiny or desertion.
- **Held defiance.** A `defied` applies its row at once and is held; R moves when it settles (scene end or day end). An enforcement before that removes it. A refused order holds `defied / moderate`. Fearful refusals are hidden (nothing in `scene.refusals`, `covert: true`, one sabotage queued).
- **Leash = enforcement (user):** R −20, held defiance removed, a pending threat is kept.
- **Pending threats:** one per unit, deadline end of the next day, lapse into an engine `commander_yielded` (deed `threats_empty`); belief is fixed at registration (`I < 50`).
- **Punishments go through `computeDeltas`** (a `commander_enforced` event whose row comes from the registry × perception; image consistency, state, defect and disposition multipliers all apply; `dispositionScaling: 'none'` skips only the last).
- **Exact UNDO** reverts the stored `Inverse` (applied deltas after clamps, R, history lines, deeds, restrictions, resources, the held defiance and threat it removed, `createdDiscipline`) and never restores a snapshot, so later changes stay. Dialogue applications and threats only, same day, scene still open. Menu applications cannot be undone. The ledger keeps both lines.
- **Demands:** `demand/roll` is its own action (after `slot_advanced`, no open expedition); two phases (`undelivered` → worded by `flavor` kind `demand`, setting `demandWording` → `open`, DM when she is not in the scene). A demand lives through the next day and then counts as refused. Grant pays the cost, fires `granted_demand`, R +4 when impunity-driven; refuse fires `refused_demand` (× 1.5 at `I ≥ 50`) and may hold a `defied`. TALK opens a private scene with her; the chips stay.
- **Delegate:** one Trust band short she now **does it** and an *owed* demand opens (refusing it adds `broke_promise`); with no eligible template or an open demand she refuses as before.
- **Reputation:** counters at every site; patterns are `sum ≥ min` with an optional ratio; the day step queues one pending nickname (best score per group, at most two active); the next private scene with one named unit introduces it (`reputation/introduce` from `DisciplineController.onSceneOpened`). A lapsed nickname leaves 7 days after its pattern stopped holding unless a successor replaces it.
- **Big gestures:** `TUNING.disposition.bigGesture.events` = `['protected', 'granted_demand']`.

### Non-obvious things to know before touching P9 code
- **`stanceOf` is P8's, `commandStance` is P9's.** The directive id `loyalty:<unitId>` is shared with P6's band text and replaces it; a unit whose stance the content does not describe keeps the band text.
- **Punishments are `commander_enforced` events.** Their row comes from the `punishments` registry (`rowFor` in `computeDeltas`); the `eventDeltas` row is only the fallback. `enforce()` is the one place an enforcement touches R, held defiance and a pending threat.
- **A held defiance moves R only when it settles.** Tests of "defied raises R" must close the scene or run a day step.
- **A fearful refusal leaves no trace in `scene.refusals`.** The event says `refused: false, covert: true`; the only visible results are the main-model text and a later anonymous sabotage fact. No provider says who sabotaged anything.
- **UNDO reverts deltas, never a snapshot.** Anything that changes state inside a punishment or threat (including `evaluateAutomatic`) must run inside the captured block, or UNDO will not be exact. The exact-state test ignores only `ledger` and `memory.nextId`.
- **Mutiny fixtures need `impunityRecord`.** A unit mutinies only with `I ≥ 60` (or deserts at `I < 30` and `breaking`); P6 tests that built a mutineer from Trust alone set `impunityRecord: 40`.
- **`demand/roll` is its own action**, not part of the day step; `director_tick` carries the day step only.
- **Directive ids:** `loyalty:`, `refusal:`, `threat:`, `discipline:`, `demand:`, `reputation:` and `nickname`; none starts with `world:`, `stance:` or `friction:`. `clearDisciplineDirectives` clears exactly these.
- **`commanderLine` reads the nickname name mirrored in the state.** The CMDR chip shows the same name; the registry name is only used when the nickname is introduced.
- **A nickname is introduced only in a scene with exactly one named unit.** A commander who only talks in groups never hears it; it stays pending.
- **Unread counts a waiting DM demand** once, as the demand, until it is answered; marking a thread read only looks at plain messages.
- **The day-end order** is: settle defiance → lapse threats → decay records → sabotage → expire restrictions → demands → reputation. A lapse's +6 therefore reads 5 at the end of that day.
- **New seeded draws:** the discipline day step, the demand roll and the delegate-demand pick draw from `ctx.rng`; a seeded test whose day count crosses them moves and must be updated knowingly.
- **Hidden state:** the stored R, the deed counters, the sabotage queue and who sabotaged never appear in a reading; `tests/fixtures/analyze/hidden.ts` carries sentinels (`impunityRecord: 31`, `threats_empty: 53`, `punish_2: 59`).
- **Content shapes:** read effects and costs by type, never by id. `flags[].leverage: true` is how another package adds a secret to S (no code). `crimes[].damaging: false` removes a crime from S.

### Open items
- Combat refusals are not `defied` (only `combat` and `rng` change during a fight).
- The gear fault is a supply loss at the next `expedition/start`, not a combat status.
- "Shielded from oversight" has no producer (left to P9b).
- Grunts are outside discipline (no Impunity, no demands, no nickname reactions).
- Punishment chips are drawn for today's applications only; threat chips for every pending threat.
- The bluff credit fades after the first Leash request; the author may prefer it to stay.
- `defiant_loyal` is not a day-1 stance; it is earned in play (a harder offset also lowers the start Trust through P8).
- Every number (ladder, stance weights, sabotage chance, demand chance, thresholds) and every text (nicknames, demands, directives) is a draft marked `AUTHOR TO WRITE`.
- Real `intent_extract` recall for the four new types and real `flavor` wording are checked by hand (`docs/MANUAL_TEST_P9.md`).
