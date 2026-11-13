# P12 — Special Traits: Secret Frequency, Bloom-induced Paranoia, Web of Debts

**Depends on:** P7 (trait framework), P9 (Impunity, leverage, punishments), P5 (director threads, night events), P6 (dilemmas). **Read:** overview; this file; P7 §8; P9.

## Goal

Special traits are campaign premises, not modifiers: each one changes how the whole run is played. At most **one special trait per campaign**. This package implements three of them on the P7 framework. LEASHSWAP is a separate game mode (P13).

Naming: the P7 trait kind formerly called `rule` is `special` in data and UI.

## 1. Secret Frequency (`secret_frequency`)

*An experimental frequency analyzer in the commander's head picks up fragments of the squad's thoughts. If they find out, it ends badly.*

**Intercepts.** In each scene (and DM thread, at half rate) with a named unit present, roll `pCatch` = 25% base, +10% in private scenes, −10% if her stress ≥ 80. On success the engine picks one **candidate truth** about her hidden state:
current stance (P9), Impunity band, a pending demand, a pending desertion/mutiny warning, a fact about her not `knownBy` the commander, Attraction band, a planned refusal.
With probability `pDistort` = 25% (+15% if her stress ≥ 50) the truth is replaced by a plausible false candidate. Text: template or `flavor` call (≤ 40 tokens) in fragment style ("…can't keep doing this…"). Fragments can be partial (only the subject, not the conclusion).

UI: `FREQ ▸ "…" (unverified)` chip in the scene, plus an INTERCEPTS log in the CMDR dossier. The log never shows which fragments were true.

**Leaks.** New intent `knowledge_leak`: the commander uses information he could not know. `intent_extract` receives the list of intercepted-but-not-public items for present units (compact) to detect it. Each leak raises that unit's `frequencySuspicion` (0–100) by 15/25/35 by severity; decay −2/day. Units with `echo_bleed` or `sensor_ghosting`: gain ×1.5, and above 50 they get a directive "she senses static around him".

**Discovery** at 100: the unit learns the truth (`knows_frequency` flag). Squad-wide event: everyone who learns gets an `extreme` violation event (Trust and Affinity crash, stress +), the discoverer may spread it (fact with `knownBy`). The secret is also leverage in P9 (`S` term).

**Burn the implant** (medbay activity, one-way): intercepts stop forever. If discovery happens later, reactions are softened (`decision_aligned` with honesty-valued units).

## 2. Bloom-induced Paranoia (`bloom_paranoia`)

*High Bloom exposure in his past work. Something is off in his head.* Mutually exclusive with `insomniac`. Sets flag `commander_bloom_exposed` (hook for the future Bloom update).

**Early warnings.** Loyalty signals (P6 warning signs, P9 stance shifts toward `open_defiance`, mutiny preconditions) reach the commander 1–2 days earlier as `PREMONITION` notices.

**False alarms.** Each day, per unit, roll `pFalse` (base 8%, −2% per Insight rank above 1, +5% after a nightmare night). A false alarm produces a notice indistinguishable from a real one. Acting on a warning — new intent `accused`, a punishment, the Leash, removing her from a mission — is scored by truth: on a real threat it preempts (talk-down bonus, mutiny averted chance); on a false one it is an `extreme` insult/coercion with full consequences.

**Nightmares.** Night-event family `bloom_nightmare` (Bloom imagery): commander stress +, the next day's first slot may be lost; sometimes a unit hears him and comes (scene hook).

**Unique order `contingency`** (CP 2): designate a cover unit for this combat. If any unit turns on the commander (mutiny, breakdown targeting him), the cover unit intercepts the first hit.

## 3. Web of Debts (`web_of_debts`)

*Old mistakes and shady ties: he must feed information to a rival corporation.*

**Handler.** An NPC of a rival corporation chosen at start (any corporation that is not the player's). Lorebook entry; no card needed. Visits at night about once a week (day roll, never two nights in a row).

**Intel exchange.** The engine assembles available intel from recent state: completed missions, base upgrades, spine discoveries, squad details, planned expeditions. For each item the player picks **truth / partial / false / withhold**. Payment: supplies, credits, plyx, sometimes a side mission or rumor. The handler tracks `handlerSuspicion` (false intel found out) and `handlerPressure` (withholding): rising pressure → threats, cut payments, finally the handler leaks the commander's crime to the squad.

**Consequences come back.** Each truthful item schedules a world effect: ambush on a reported expedition route, sabotage of a reported facility, rival standing +, own-corporation standing −. Partial items have weaker effects; false items none (but handler suspicion).

**Discovery.** Two clocks:
- `oversightSuspicion` fed by consequences traced back to leaks (Cunning slows it, `oversight: brutal` speeds it).
- Squad discovery rolls on visit nights: units awake at night, `threat_saturation`, high Insight-like profiles.

Discovered by **oversight** → `defining` dilemma (become a double agent / confess / flee) and a spine branch `defector_arc` (author-written beats; v1 ships three placeholder outcomes). Discovered by a **unit** → she gains leverage (P9 `S` +15) and a personal dilemma: report him, protect him, or demand something for silence.

## 4. Shared rules

- Registry entries in `commanderTraits` with `kind: 'special'`, `exclusiveWith`, `requires` (e.g. `web_of_debts` requires ≥ 1 non-player corporation in data).
- Each trait shows a full "What this changes" card in the commander setup (P7 wizard / P11 dossier).
- All three can combine with LEASHSWAP (P13): it is a mode, not a trait. Combinations get no special handling beyond the systems themselves.

## Acceptance criteria

1. Only one special trait per campaign; `bloom_paranoia` and `insomniac` cannot be taken together.
2. Frequency: intercept and distortion rates match the formulas (seeded tests); the log never reveals truth; `knowledge_leak` raises suspicion; discovery at 100 triggers the squad event; burning the implant stops intercepts.
3. Paranoia: real warnings arrive earlier; false alarms are indistinguishable in UI; acting on a false alarm applies the extreme event; nightmares fire; `contingency` intercepts the first hit from a turning unit.
4. Debts: weekly visits; four choices per intel item; truthful items schedule world effects; pressure escalates to a crime leak; both discovery paths produce their dilemmas; the oversight path sets `defector_arc`.
5. Existing campaigns without special traits are unaffected.

## Open decisions (author)

- Probabilities and clock speeds above.
- Handler character and the `defector_arc` beats.
- Intercept fragment style (templates vs `flavor` generation).

## Interfaces already provided by P7a (implemented — use, do not rebuild)

- **Never spoil a secret in a panel:** register `registerKnowledgeRule({ fact: (f, state) => …, flag: (id, state) => … })` so readings, "facts" and flags the commander does not know stay hidden (intercept truth flags, suspicion, who knows what); suspicion clocks are hidden by `visibleToPlayer: false` and read as `An unseen threat` in effects summaries. Add sentinels to `tests/fixtures/analyze/hidden.ts`; the hidden-state test (`no provider shows a sentinel text`) then covers the new providers.
- Trait descriptions are registry `description`s; their effects lines are generated by `entryEffects`.
