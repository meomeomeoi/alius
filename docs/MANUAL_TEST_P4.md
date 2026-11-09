# P4 — acceptance checklist

Automated coverage per acceptance criterion (all in `npm test`), then the steps that must be done by hand inside SillyTavern.

## Automated
1. Full combat with mouse and keyboard, orders, ultimates, rows, statuses, cooldowns: `tests/ui/combat.test.ts`, `tests/engine/combat/turn.test.ts`, `orders.test.ts`, `effects.test.ts`.
2. Stress bands and breakdowns for ≥ 6 defects: `tests/engine/combat/stress.test.ts` (`rage_governor`, `affect_dampener`, `compulsive_protocol`, `threat_saturation`, `latent_strain`, `graft_rejection`, `overclock_bias`, `compliance_craving`).
3. Synergies: `tests/engine/combat/turn.test.ts` (`friend state adds friend_assist`), `orders.test.ts` (`friend_assist`, `devoted_sacrifice`, friction refusals).
4. Easy retry restores the exact state: `tests/engine/combat/outcome.test.ts` (`easy retry`).
5. Auto-resolve deterministic: `tests/engine/combat/ai.test.ts` (`auto-resolve`).
6. Loot, crafting, upgrades, role restrictions, INV/SQUAD: `tests/engine/items.test.ts`, `workshop.test.ts`, `tests/ui/inv.test.ts`, `squad.test.ts`.
7. Harness and neutrality report: `tests/sim/harness.test.ts`; the committed report is `BALANCE_REPORT.md`.
8. Formula, initiative, targeting, every trigger, encounter budget, loot tables: `formulas.test.ts`, `targeting.test.ts`, `effects.test.ts`, `encounter.test.ts`, `items.test.ts`.

## In SillyTavern
- [ ] SYS → debug on → **Combat drill** opens the combat screen with sprites (head crops) for named units and ASCII for enemies.
- [ ] Play a whole fight by mouse (click skill, click target), then another by keyboard (`1`–`6`, arrows, `Enter`, `G S P`, `Q W E R T`, `A`, `Esc`).
- [ ] CP orders: cost shown, disabled without CP, an ordered unit may refuse (log line, stress up).
- [ ] An ultimate and a breakdown each show a cut-in with the unit's sprite.
- [ ] Reload SillyTavern mid-combat: the combat screen returns at the same turn.
- [ ] Switch chat mid-combat and back: no state leaks between campaigns.
- [ ] Easy retry on (SYS): lose a fight (AUTO against a strong encounter), `[RETRY]` restores it, `[ACCEPT DEFEAT]` writes the loss once.
- [ ] Difficulty select (SYS) changes enemy strength and is refused during a combat.
- [ ] Enemy names on: affixed enemies get a generated name once; with the model failing nothing breaks.
- [ ] Workshop activity opens INV in workshop mode: craft, upgrade, reroll, dismantle; buttons grey out with the reason; a tech-loving companion sometimes upgrades her weapon.
- [ ] INV compare panel shows stat deltas; SQUAD equip picker, skill tree (unlock by click), loadout editor (limit 4), respec cost.
- [ ] Level-up toast after training; stat line in SQUAD grows with level.
- [ ] `npm run sim -- --runs 200 --neutrality` prints a table.
