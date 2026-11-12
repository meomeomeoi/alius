# P7 — Commander Profile & Traits

**Depends on:** P0–P6 (as implemented — read the code, not only older specs). **Read:** overview; this file; `content/lore.md` §5 (crimes).

## Goal

The commander stops being a name with a crime. He gets a body (three physical stats), an expression, visible experience and traits. These shape first impressions, which checks are "native" to him, which content he sees and how the squad reads his actions — **without** making a weak or feminine commander a punished build.

## Principles (add to overview §3)

- **Weakness is a playstyle, not a penalty.** A weaker commander is really weaker. The game never compensates it secretly and never dead-ends it. Every physical task has a non-physical route (see §4).
- **Expression has no mechanical value.** Femininity/masculinity never gives buffs or debuffs. It only matters through individual characters' tastes, world options (P8) and narration.
- **Looks fade, deeds stay.** Presence matters most on first meeting and decays with days known.

## 1. Data (campaign state)

```
commander {
  …existing fields
  body { strength: 1..5, endurance: 1..5, reflexes: 1..5 }
  bodyXp { strength, endurance, reflexes }          // training progress
  expression: 1..5          // 1 very feminine … 3 androgynous … 5 very masculine
  seasoning: 1..5           // 1 green … 5 veteran (age/visible experience) — AUTHOR TO CONFIRM (see Open decisions)
  traits: { regular: string[] /*≤2*/, rule?: string /*≤1*/ }
  archetype: 'frail'|'slight'|'average'|'fit'|'hardened'   // derived, cached
}
Relation { …existing, metDay: number }   // first day the unit knew the commander (default: unit's join day)
```

Migration: existing campaigns get `body 3/3/2`, `expression 3`, `seasoning 3`, no traits, and a one-time modal on load: "Commander file incomplete — review" (prefilled; skippable).

## 2. Stats and descriptors

Every value is shown as a **descriptor**, never a number (raw values only with "show raw values").

| Stat | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Strength | Feeble | Slight | Average | Strong | Powerful |
| Endurance | Fragile | Delicate | Average | Hardy | Iron |
| Reflexes | Sluggish | Slow | Average | Quick | Lightning |
| Expression | Very feminine | Feminine | Androgynous | Masculine | Very masculine |
| Seasoning | Green | Young | Experienced | Seasoned | Veteran |

Creation: each body stat starts at 1, **pool of 7 points**, no stat above 4 at creation. **Unspent points are allowed and are not converted into anything.** Expression and seasoning are free choices (no pool).

Growth: activity `train` gets a "body" option (pick a stat): XP thresholds 3 / 6 / 10 / 15 sessions per step; the player never has to train. Commander Crisis injuries (P4) can lower `endurance` or `reflexes` by 1 (rare, flagged event) and raise `seasoning` by 1 (scars).

Archetype = sum of body stats: ≤4 frail, 5–6 slight, 7–9 average, 10–12 fit, ≥13 hardened (13+ only reachable through growth).

## 3. Where body stats act

Keep the touchpoints few; weakness must close some doors and open others.

- **Commander Crisis (P4):** commander HP = 20 + 10 × endurance; dodge chance = 6% × reflexes.
- **Presence-only combat action** (one per combat, by archetype): frail/slight → *Unnoticed* (enemies target him 50% less in Crisis); average → *Steady Voice* (one order −1 CP); fit/hardened → *Rally* (−10 stress to all allies).
- **Physical checks** in events, dilemmas and expedition nodes (§4).
- **Long expeditions** (3 slots): endurance ≤2 → "exhausted": next morning slot is lost unless a unit at `friend` or closer covers for him (scene hook).
- **Intimidation route** in P6 talk-down / P9 discipline: strength and seasoning add to the Authority route.

## 4. No dead ends: check routes

Any check in content that requires a body stat **must** declare at least one alternative route. Schema:

```
check { id, routes: [
  { kind: 'body', stat: 'strength'|'endurance'|'reflexes', min: 1..5 },
  { kind: 'delegate', unitFilter?, cost: { trustCheck?: band, affinityCost?, stress? } },   // ask a unit
  { kind: 'social', stat: 'authority'|'insight'|'empathy'|'cunning', min: 1..5 },
  { kind: 'item', itemTag }, { kind: 'bypass', costResource } ] }
```

The content validator (P0 cross-ref pass) **rejects** a check with only `body` routes. `delegate` is the main alternative: the request goes through the unit's Trust (and Impunity from P9): she may comply, comply with a remark (scene hook), demand something (P9 demands), or refuse. Physical weakness thus becomes social gameplay.

## 5. First impression and image

- **Presence** `P ∈ [−15, +15]` = f(archetype, seasoning, authority rank); table in registry `presence`.
- **Decay weight** `w(d) = exp(−d / τ)`, `d` = days since `metDay`, `τ` = 7 (setting).
- **Starting axes** for a unit = existing baselines + presence offsets × unit taste (§6). Applied once at join.
- **Image consistency.** Registry `imageConsistency`: for each archetype group, which event types are *in-image* and *off-image*. Off-image events get a multiplier `m` on their deltas (default 1.3, gains and losses), scaled as `1 + (m − 1) · w(d)`. Examples: a frail/slight commander doing `coerced`, a harsh `commander_enforced` (P9) or a cold sacrifice → off-image (bigger shock); a fit/hardened commander doing `comforted`, `physical_affection`, `apologized` → off-image (bigger warmth). The engine assigns the tag, not the model.

## 6. Unit tastes (import extension)

Extend `profile_import` output with `commanderTastes: TasteTag[]` (≤3) chosen from registry `tastes`:
`respects_strength, wary_of_brutes, protective_of_frail, drawn_to_feminine, drawn_to_masculine, drawn_to_androgynous, drawn_to_older, drawn_to_younger, indifferent_to_looks`.
Each tag: starting offsets (trust/affinity/attraction) and image-consistency tweaks when matched against the commander. Editable in the import wizard; "Re-sync from card" can add them to already imported units. **Attraction offsets only come from tastes, never from body or expression directly.**

## 7. Context line

The P3 context block gets a commander line generated from descriptors (no numbers): `Commander {name}: {seasoning}, {archetype} build, {expression} presentation. {pronouns from persona}.` plus active reputation (P9) when present. Presence-driven directive for early days (w(d) > 0.5): "Units still size him up by appearance."

## 8. Traits

Registry `commanderTraits`: `{ id, name, kind: 'regular'|'rule', description, upside, downside, effects[], hooks[], exclusiveWith[], requiresSettings? }`. Pick **up to 2 regular** and **0–1 rule** trait. Regular traits follow the defect rule: change the approach, not the power.

v1 regular traits (draft — author tunes):

| id | Upside | Downside |
|---|---|---|
| `insomniac` | Night slot always available (not only on events) | Commander stress accumulates; −1 effective Empathy rank on high-stress days |
| `old_wound` | Seasoning +1 at start; Trust gains +15% for the first 14 days ("he's seen worse") | Crisis HP −10 |
| `silver_tongue` | Cunning grows 50% faster | Units with trigger `lies` detect manipulation more often |
| `pretty_face` | Matching tastes: starting Attraction +10 | Trust gains −10% for the first 14 days ("corporate doll") |
| `bookish` | Insight grows 50% faster | Body training XP −30% |
| `field_medic` | Medbay actions with a unit give +Affinity; Empathy starts at rank 2 | Medbay supplies cost +1 |
| `corporate_polish` | +1 Leash authorization/week; oversight standing + | Units with `corporate −` values: starting Trust −10 |
| `street_raised` | Cunning starts at rank 2; black-market prices −15% | Corporate standing −; Leash approved less often |

Rule traits are a **framework in P7**, with **one** implemented to prove the hooks:
- `vow_of_distance` — romantic states filtered out of the relationship graph for this campaign (same filter as the romance setting); platonic `confidant`/`kindred` thresholds −15%; a unique platonic state `sworn` (author describes).

Other rule traits (`former_off_spec`, `collared`, `bound_elsewhere`, `voice_synth`) go to overview §10; each needs new hooks (commander defect, Leash on the commander, an outside DM contact, text-only scenes) and gets its own small spec later.

## 9. Setup UI (temporary — P11 makes it diegetic)

New wizard step **COMMANDER FILE** after crime: body pool with descriptors and remaining points, expression, seasoning, traits (cards with upside/downside), live archetype label, buttons **Prefill from persona** (new mechanic call `commander_import`, budget 600: persona text → descriptors, expression, seasoning, 0–2 traits with reasons) and **Random commander**. SQUAD tab gets a **CMDR** card (dossier: descriptors, traits, archetype, reputation slot).

## Out of scope

Rule traits other than `vow_of_distance`; reputation/nicknames (P9); diegetic intake (P11).

## Acceptance criteria

1. New campaign: body/expression/seasoning/traits saved; unspent points allowed; archetype correct at every threshold.
2. The validator rejects a body-only check; a check with a `delegate` route resolves through Trust (demand hook stubbed until P9).
3. A frail commander's `coerced` and a hardened commander's `comforted` get the off-image multiplier, decaying with days known (tests at d = 0, 7, 21).
4. Taste tags change starting axes only for matching commanders; body/expression never touch Attraction directly (test).
5. The context line appears and contains no numbers.
6. `vow_of_distance` removes every romantic state from reachable transitions; platonic thresholds are lowered.
7. Old campaigns migrate and show the review modal once.
8. `commander_import` returns valid descriptors from a persona; manual mode works without a mechanic profile.

## Open decisions (author)

- Keep `seasoning` as a slider, or derive it from persona age at import only?
- Pool size (7) and the "no 5 at creation" rule.
- Trait list and numbers.
