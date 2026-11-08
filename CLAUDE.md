# Alius

SillyTavern extension (TypeScript). Design docs live in `docs/`.

## Before any work
0. `git fetch` and check that the branch contains every implemented package (`docs/00-overview.md` §9 has the status table); a stale clone once lacked P1. Run `npm test` to know the baseline.
1. Read `docs/00-overview.md` (always; §5.4 lists the engine interfaces that already exist).
2. Read the plan you are told to execute (in `docs/plans/`) and the spec it names. If the task names a package spec and no plan exists, write the plan first (same format as the existing ones). Specs of implemented packages end with **Implemented as**: where it differs from the draft, the code wins.
3. Read files in `docs/content/` only if the task says so.

## Rules
- Follow the plan task by task; do not skip the failing-test step.
- After each finished task: tick its checkboxes in the plan file, commit.
- Never put `dist/` or `style.css` into .gitignore — they are committed on purpose.
- Stop at the task boundary you were given; don't start the next chunk.
- If the plan and the code disagree, stop and report instead of improvising.
- When you finish a package, update its spec (status line and an **Implemented as** section), the status table in `docs/00-overview.md` §9, the interface list in §5.4, and add an **Interfaces already provided by <package>** note to the specs of the packages that depend on it.
- `npm test` rebuilds `dist/index.js` and `style.css`; commit them with your change.
