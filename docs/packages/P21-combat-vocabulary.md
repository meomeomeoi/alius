# P21 — Combat Vocabulary: the Pillars

**Status: spec.** Release 0.4 (post-release). **Depends on:** P4 (combat engine, effects, statuses, balance harness), P3/P9d (relationship states, for resonance), P7 (non-body routes), P7a, every 0.1–0.3 package implemented. **Read:** overview; this file; the **Implemented as** of P4, P6 and P9d; `docs/BALANCE_REPORT.md`; `docs/content/roles.md`.

**Analysis tool (P7a):** every new stat, status, chip and telegraph carries `data-analyze`; enemy properties are readings filtered by `Knowledge`.

## Goal

Builds need something to be built from. Today 142 skills mostly say "damage × mult (+ a status)" or "+N % to a stat"; every skill is usable from both rows; nothing consumes a status, reacts to an ally or trades power for a cost. This package adds the **pillars**: a vocabulary native to the setting on which skills, passives (P23), modifiers and augments (P24) are built. Rows and the timeline get real weight. Regular fights may last **5–7 rounds** (was ≤ 5).

## 1. Damage and armour types

- **Damage types:** `kinetic`, `thermal`, `corrosive`, `viral`, `neural`. Every skill has one (field `dmgType`); a weapon class gives the default for skills that say `weapon`; modifiers and nodes can convert.
- **Armour types** of enemies: `flesh` (mutants), `plating` (soldiers, armoured), `synthetic` (off-spec, drones), `anomalous` (anomalies). Squad units are `synthetic+flesh` (bio-cybernetic: a neutral profile by default; augments may shift it).
- **Table** (`content/core/damageTable.json`): vulnerable ×1.3, resistant ×0.7, immune rare (×0; never for a whole category). Draft: flesh weak to thermal, plating to corrosive, synthetic to neural, anomalous to viral with variance (anomalies may flip per encounter).
- **Knowledge:** an enemy's profile is shown after the first fight with its archetype or after scouting (P5 scout, P20 `search`/`discovery` clues). Unknown = `?` in the target card.

## 2. Break

- Elites and large enemies (`poise` field) have a **poise bar**; ordinary enemies none or token.
- Skills deal `poiseDmg` (heavy weapons, shield bashes, neural damage high; precise shots low).
- At 0: **broken** for 1 turn (skips it, takes +30 % damage, cannot telegraph); poise refills after.
- Roles that break (Defender, Assault, heavy builds) and roles that punish broken targets (Sniper) cooperate.

## 3. Telegraphs

- Enemy archetypes declare **charged moves** (`telegraph: { skillId, chargeTurns: 1, targeting }`); when an enemy starts charging, the round timeline shows **intent and target** ("Rush → back row, Rhea").
- **Answers:** interrupt (stun, break), absorb (guard, taunt, shield), move (row swap, push/pull), out-wait (untargetable), or race it (kill first).
- **Anomalies lie:** their telegraphed target is drawn with small glitches; with `TUNING.combat.anomalyLie` chance the real target differs (author ruling: the player sees it may or may not be true).

## 4. Positions

- **Three slots per row** with adjacency (`left/centre/right`). Effects can read "adjacent ally", "flank".
- **Push and pull:** move an enemy between rows (front ↔ back) or slots; a back row with an empty front is **exposed** (melee reaches it, +damage).
- **Row-bound skills:** skills declare `usableFrom` for real; existing skills are reassigned in content (most actives keep both rows; signature and branch identities pick one).

## 5. Tempo

Timeline effects: `delay` (an enemy's next turn later this round or the next), `advance` (an ally acts next), `after` (act right after a named ally). Shown on the timeline strip.

## 6. Heat (cybernetic)

- Resource `heat` 0–100 on units with heat skills (native branches of Assault, Defender, Specialist; anyone through augments, P24).
- Heat skills add heat; thresholds give bonuses (e.g. ≥ 50 +damage, ≥ 80 +crit); **overheat** at 100 (the existing `overheat` status: self-damage or a lost turn).
- **Vent:** a skill or passive that dumps heat into an effect (a burst, a shield).

## 7. Bloom load (viral)

- Stacks `bloom` on enemies (and on self for the strongest skills): tick viral damage, spread to adjacent enemies on death, can be **burst** (consumed for a big effect) by certain skills.
- Self-infection costs stress and HP; native in Specialist and Medic branches; anyone through Bloom augments.
- Ties into the Bloom update on the roadmap and into defects such as Latent Strain (existing data, read by field).

## 8. Edge (stress as fuel)

**Only through a keystone** (P23) (author ruling: a specific build, not a bonus for all): units with an Edge keystone get power in the stress band 50–79 (crits stronger, extra action chance) and pay for it (healing and stress relief weaker on them, the 80+ breakdown risk unchanged). Without the keystone stress works as today.

## 9. Resonance (commander ↔ her)

- A meter per pair, 0–100, in combat only (resets per expedition). It grows when the commander gives her orders and when she acts for the commander (cover, Commander Crisis, protecting the target of an order).
- Spent on **linked actions**: a double order (two orders for one CP cost), her special answer to an order (a defined per-role action), an echo of her signature at reduced power.
- **Depth by relationship tier:** friend < close < romantic / devoted unlock more linked actions and a faster gain (P9d `bondTier`, P3 states read by tier, never ids). Synergies (P4) stay; resonance is the active layer on top of them.
- Order-triggered passives ("when the commander orders me…") use a new trigger `onOrdered` (Compliance Craving's logic, generalised).

## 10. Existing content

All 142 skills are revised in content to use the vocabulary (types, poise, positions, statuses that are consumed or reacted to). New effect types are added to the effect system generically (P4 rule: no bespoke code per skill): `poise`, `push`, `pull`, `delay`, `advance`, `heat`, `vent`, `bloom`, `burst`, `consume_status`, `convert_dmg`, triggers `onOrdered`, `onBroken`, `onTelegraph`, `onHeatThreshold`, `onEdge`.

## 11. Balance

- The harness AI plays the pillars (answers telegraphs, breaks, manages heat and Bloom).
- Rules: defect neutrality ±5 pp kept; **no pillar dominates** (a squad built around one pillar vs a mixed squad within ±5 pp at equal power); regular fights 5–7 rounds at intended difficulty.

## Acceptance criteria

1. Damage types, the table and knowledge work; unknown profiles show `?`.
2. Break, telegraphs (incl. glitched anomaly targets), positions and tempo work with keyboard and mouse.
3. Heat and Bloom work as resources with thresholds, overheat, vent, spread and burst.
4. Edge exists only behind a keystone.
5. Resonance gains, spends and scales by tier; `onOrdered` fires.
6. Existing skills are migrated; every new effect type has tests; the harness reports the new rules.
7. Every new element carries `data-analyze`.

## Open decisions (author)

- The damage table, every number, the per-role resonance actions, which existing skills become row-bound.
