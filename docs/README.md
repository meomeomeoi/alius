# Alius — Design Docs

Read order for an implementing agent:

1. `00-overview.md` — always (§5.4 lists the engine interfaces that already exist; §9 shows which packages are implemented).
2. The target package spec in `packages/` (P0 → P6, then P7a, in dependency order). Specs of implemented packages end with an **Implemented as** section: where the code differs from the draft, the code wins. Specs of later packages end with **Interfaces already provided by …** notes (use them instead of rebuilding).
3. Only the `content/` drafts that the package lists under **Read**.
4. The plan in `plans/` (or write one first). Before starting, `git fetch` and make sure the branch contains every implemented package (a stale clone once missed P1).

Quick facts for a new session: state changes only through registered engine actions; a rejected action changes nothing; content-like data is JSON in `content/core/` with zod schemas in `src/content/schemas.ts` (see `CONTENT.md`); `npm test` also rebuilds the committed `dist/index.js` and `style.css`, so commit them after code changes.

| File | What |
|---|---|
| `00-overview.md` | Vision, pillars, non-negotiable principles, glossary, architecture, data model, loops, settings, package map, roadmap, agent rules |
| `packages/P0-foundation.md` | Toolchain, ST adapter, state & saves, content registries, LLM orchestration, context injection, Alius shell |
| `packages/P1-setup-and-import.md` | New-campaign wizard, crimes/starts, AI-assisted card → profile import |
| `packages/P2-calendar-base-economy.md` | Slots, activities, social stats, resources, facilities, grunts (**implemented**) |
| `packages/P3-scenes-relationships-memory.md` | Scene UI, intent extraction, delta engine, relationship state graph, memory, DMs, night events (**implemented**) |
| `packages/P4-combat-progression-items.md` | Turn-based combat, stress, synergies, enemies, progression, items, balance harness (**implemented**) |
| `packages/P5-world-expeditions-director.md` | World map, missions, rumors, node-map expeditions, director, spine (**implemented**) |
| `packages/P6-dilemmas-disloyalty-leash.md` | Validated dilemmas, refusals/desertion/mutiny, the Leash, defect arcs (**implemented**) |
| `packages/P7a-analysis-tool.md` | Analysis tool: hover / `?` / long-press explanations from content, readings, change ledger, coverage rule (**implemented**) |
| `packages/P7-…` … `P13-…` | Specs of the planned packages (see `ROADMAP-next.md`; each ends with **Interfaces already provided by P7a**) |
| `CONTENT.md` | How to add content: pack layout, effects, every registry's fields with an example, the lorebook format |
| `MANUAL_TEST_P0.md` … `MANUAL_TEST_P6.md`, `MANUAL_TEST_P7a.md` | Acceptance checklists that must be run by hand inside SillyTavern |
| `BALANCE_REPORT.md` | Defect neutrality report from `npm run sim -- --neutrality` (P4) |
| `plans/` | Implementation plans per package (task-by-task; ticked as they are done; a **Status** line on top says when a plan was executed) |
| `content/lore.md` | **Placeholder** lore & structure (author rewrites) |
| `content/roles.md` | Roles, stats, skills, signatures, CP orders, equipment (draft numbers) |
| `content/defects.md` | Defect catalog, 18 entries in 5 categories (draft) |

**Where decisions live.** Every implemented package spec ends with **Implemented as**; P5's also has **Decisions taken while implementing** (rulings where the plan was silent or wrong) and **Open items for later sessions**. Read those before changing P5 code; P6's **Implemented as** also has **Decisions taken while implementing** and **Open items for later sessions**.
