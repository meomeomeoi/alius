# Alius — Design Docs

Release **0.1.0**: every package in the main table of `00-overview.md` §9 is implemented (P0–P14b, including P3b, P7a, P9b–P9e, P10b–P10d, P11b, P14b). The packages of 0.2 (P14c, P15a–P17f), 0.3 (P18–P20) and 0.4 (P21–P26) are specs only. `RELEASE_0.1_AUDIT.md` holds the pre-release audit and what is still open from it.

Read order for an implementing agent:

1. `00-overview.md` — always (§5.4 lists the engine interfaces that already exist; §9 shows which packages are implemented and the order of the next ones).
2. The target package spec in `packages/`. Specs of implemented packages end with an **Implemented as** section: where the code differs from the draft, the code wins (read its rulings, open items and non-obvious things before touching that package's code; `CLAUDE.md` lists which). Specs of later packages end with **Interfaces already provided by …** notes (use them instead of rebuilding).
3. Only the `content/` drafts that the package lists under **Read**.
4. The plan in `plans/` (or write one first). Before starting, `git fetch` and make sure the branch contains every implemented package (a stale clone once missed P1).

Quick facts for a new session: state changes only through registered engine actions; a rejected action changes nothing; content-like data is JSON in `content/core/` with zod schemas in `src/content/schemas.ts` (see `CONTENT.md`); `npm test` also rebuilds the committed `dist/index.js` and `style.css`, so commit them after code changes.

| File | What |
|---|---|
| `00-overview.md` | Vision, pillars, non-negotiable principles, glossary, architecture, data model, loops, settings, package map, roadmap, agent rules |
| `packages/P0-…` … `P14b-…` (0.1) | Implemented: foundation, setup and import, calendar and economy, scenes and relationships, memory (P3b), combat, world and expeditions, dilemmas and the Leash, analysis tool (P7a), commander profile (P7), world options (P8), impunity and discipline (P9), power structure (P9b), personal pressure (P9c), desire and bonds (P9d), her call (P9e), visual upgrade (P10, P10b–P10d), prologue (P11) and head start (P11b), special traits (P12), LEASHSWAP (P13), generation envelope (P14), character development (P14b) |
| `packages/P14c-…`, `P15…P17f` (0.2) | Specs: her life, the dynamic (scene blocking, practices, service craft, staged scenes and the rest) |
| `packages/P18…P20` (0.3), `P21…P26` (0.4) | Specs: AI story arcs, arc missions, story nodes; combat vocabulary, enemies, skill trees, gear, bonds in progression, depth runs |
| `ROADMAP-next.md` | Why the 0.1 packages after P6 came in the order they did, and the session chunks |
| `RELEASE_0.1_AUDIT.md` | The 0.1 pre-release audit: security, engine, integration and content findings |
| `CONTENT.md` | How to add content: pack layout, effects, every registry's fields with an example, the lorebook format |
| `MANUAL_TEST_P*.md` | Acceptance checklists run by hand inside SillyTavern, one per implemented package (P0–P14b) |
| `BALANCE_REPORT.md` | Defect neutrality report from `npm run sim -- --neutrality` (P4) |
| `plans/` | Implementation plans per package (task-by-task; ticked as they are done; a **Status** line on top says when a plan was executed) |
| `content/lore.md` | **Placeholder** lore & structure (author rewrites); §0 holds the rules every text follows (the squad is women, the player is of any gender). **Read it at the start of every session.** |
| `content/roles.md` | Roles, stats, skills, signatures, CP orders, equipment (draft numbers) |
| `content/defects.md` | Defect catalog, 18 entries in 5 categories (draft) |
| `content/prologue.md` | Placeholder drafts of the authored prologue (P11); `content/core/prologues.json` mirrors it |
| `content/life.md`, `content/blocking.md` | Drafts for 0.2 (P14c her life; P15a scene blocking) |

**Where decisions live.** Every implemented package spec ends with **Implemented as**; P5's also has **Decisions taken while implementing** (rulings where the plan was silent or wrong) and **Open items for later sessions**. Read those before changing P5 code; P6's **Implemented as** also has **Decisions taken while implementing** and **Open items for later sessions**.
