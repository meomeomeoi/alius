# Alius — Design Docs

Read order for an implementing agent:

1. `00-overview.md` — always.
2. The target package spec in `packages/` (P0 → P6, in dependency order).
3. Only the `content/` drafts that the package lists under **Read**.

| File | What |
|---|---|
| `00-overview.md` | Vision, pillars, non-negotiable principles, glossary, architecture, data model, loops, settings, package map, roadmap, agent rules |
| `packages/P0-foundation.md` | Toolchain, ST adapter, state & saves, content registries, LLM orchestration, context injection, Alius shell |
| `packages/P1-setup-and-import.md` | New-campaign wizard, crimes/starts, AI-assisted card → profile import |
| `packages/P2-calendar-base-economy.md` | Slots, activities, social stats, resources, facilities, grunts |
| `packages/P3-scenes-relationships-memory.md` | Scene UI, intent extraction, delta engine, relationship state graph, memory, DMs, night events |
| `packages/P4-combat-progression-items.md` | Turn-based combat, stress, synergies, enemies, progression, items, balance harness |
| `packages/P5-world-expeditions-director.md` | World map, missions, rumors, node-map expeditions, director, spine |
| `packages/P6-dilemmas-disloyalty-leash.md` | Validated dilemmas, refusals/desertion/mutiny, the Leash, defect arcs |
| `CONTENT.md` | How to add content: pack layout, effects, every registry's fields with an example, the lorebook format |
| `MANUAL_TEST_P0.md`, `MANUAL_TEST_P1.md` | Acceptance checklists that must be run by hand inside SillyTavern |
| `plans/` | Implementation plans per package (task-by-task; ticked as they are done) |
| `content/lore.md` | **Placeholder** lore & structure (author rewrites) |
| `content/roles.md` | Roles, stats, skills, signatures, CP orders, equipment (draft numbers) |
| `content/defects.md` | Defect catalog, 18 entries in 5 categories (draft) |
