# Alius

SillyTavern extension (TypeScript). Design docs live in `docs/`.

## Before any work
0. `git fetch` and check that the branch contains every implemented package (`docs/00-overview.md` §9 has the status table); a stale clone once lacked P1. Run `npm test` to know the baseline.
1. Read `docs/00-overview.md` (always; §5.4 lists the engine interfaces that already exist).
2. Read the plan you are told to execute (in `docs/plans/`) and the spec it names. If the task names a package spec and no plan exists, write the plan first (same format as the existing ones). Specs of implemented packages end with **Implemented as**: where it differs from the draft, the code wins.
3. Read `docs/content/lore.md` every session (world, tone, and §0: the squad is women, the player is of any gender, so no pronoun for the commander in any text a player or the main model reads). Read the other files in `docs/content/` only if the task says so.

## Rules
- Follow the plan task by task; do not skip the failing-test step.
- After each finished task: tick its checkboxes in the plan file, commit.
- Never put `dist/` or `style.css` into .gitignore — they are committed on purpose.
- Stop at the task boundary you were given; don't start the next chunk.
- If the plan and the code disagree, stop and report instead of improvising.
- P5 and P6 are implemented; their rulings and open items are in `docs/packages/P5-world-expeditions-director.md` and `docs/packages/P6-dilemmas-disloyalty-leash.md` (**Implemented as**). Read them before touching `src/engine/world/`, `src/world/`, the expedition UI, or `src/engine/{leash,loyalty,dilemma}/`, `src/engine/arcs.ts`, `src/loyalty/`.
- P7a (the analysis tool) is implemented; its rulings are in `docs/packages/P7a-analysis-tool.md` (**Implemented as**). From P7 on, every new player-facing stat, chip, option or choice card carries `data-analyze`, has a glossary entry or registry `description`, and live values get an analyze provider that reads through `Knowledge` (overview P12); read the P7a **Implemented as** before touching `src/analysis/`, `src/ui/analyze/` or the `ledger`.
- P7 (commander profile and traits) is implemented; its rulings and open items are in `docs/packages/P7-commander-profile-traits.md` (**Implemented as**). Read them before touching `src/engine/commander/`, `src/engine/combat/crisis.ts`, the quiet night in `src/engine/calendar.ts`, the COMMANDER FILE UI or `src/analysis/providers/commander.ts`.
- P8 (world options and disposition) is implemented; its rulings, open items and non-obvious things are in `docs/packages/P8-world-options-disposition.md` (**Implemented as**). Read them before touching `src/engine/worldOptions/`, the delta pipeline in `src/engine/relations/deltas.ts`, `src/engine/loyalty/`, the breakdown code in `src/engine/combat/stress.ts`, `src/world/optionsContext.ts`, the WORLD PARAMETERS step or the import sections. Read world options by effect type, never by option or choice id; a new join site calls `applyDispositionStart` before `applyFirstImpression`.
- Before extending P7 read its **Non-obvious things to know** (same spec): registry-free readers need mirrored state, new relation join sites must call `applyFirstImpression`, quiet nights, modal order, `aria-disabled`, seeded-RNG shifts.
- When you finish a package, update its spec (status line and an **Implemented as** section), the status table in `docs/00-overview.md` §9, the interface list in §5.4, and add an **Interfaces already provided by <package>** note to the specs of the packages that depend on it.
- `npm test` rebuilds `dist/index.js` and `style.css`; commit them with your change.
