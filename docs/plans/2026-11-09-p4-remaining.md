# P4: what is left (Task 21 is only partly done)

Tasks 1–20 are done, ticked in `2026-11-09-p4-combat-progression-items.md` and committed. Task 21 is NOT ticked.

Done in Task 21 so far: `docs/CONTENT.md` (P4 registries, effect vocabulary), `docs/BALANCE_REPORT.md` (danger 2 and 4, 2000 runs), the workshop activity summary text, the harness/upkeep fix.

Left:
1. `npm run build` and commit `dist/index.js` + `style.css`.
2. `docs/packages/P4-combat-progression-items.md`: status line and an **Implemented as** section with every ruling (the plan's "Where the code differs" list plus the `Ruling:` lines in the ledger `.superpowers/sdd/2026-11-09-p4-combat-progression-items/progress.md`, which is git-ignored and lives only in the original session). Also the balance findings: 6 defects outside ±5 pp at danger 4, average rounds 4.2 at danger 2 and 9.5 at danger 4.
3. `docs/00-overview.md`: §5.4 P4 interfaces (`combat/*`, `app.startCombat`, `engine/combat/index.ts`, `squad/release_breakdowns`, `rollLoot`/`bankLoot`, `levelCap`/`world.clearanceTier`, `lastCombat.relationHints`), §6 data model (`Unit.loadout/breakdown`, `lastCombat`, `workshopSession`, `enemyNames`, `itemSeq`), §8 (`easyRetry`, `enemyFlavor`, difficulty), §9 P4 status → implemented.
4. `docs/packages/P5-*.md` and `P6-*.md`: "Interfaces already provided by P4" (list in plan Task 21).
5. `docs/README.md`: plan list and P4 status.
6. `docs/MANUAL_TEST_P4.md`: the 8 acceptance criteria against test names plus the manual SillyTavern steps.
7. Final `npx vitest run` + `npm run typecheck`, tick Task 21, commit.
8. Independent Opus review of the whole branch (not started), then a fix pass.

Known: `tests/app-day.test.ts` ("no vignette without a companion") is a pre-existing timing flake under load.
