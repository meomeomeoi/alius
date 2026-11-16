# P26 — Depth Runs: the Endless Garden

**Status: spec.** Release 0.4 (post-release). **Depends on:** P5 (regions, expeditions, node map), P20 (node kinds), P21, P22 (bosses, nemeses), P23 (overdrive), P24 (loot), P18 (arcs). **Read:** overview; P22; P23; this file; the **Implemented as** of P5.

**Analysis tool (P7a)** rules apply.

## Goal

Overdrive levels need somewhere to be earned. The Garden, the Bloom epicentre, becomes an **endless expedition**: layer after layer with rising danger, a depth record, bosses at milestone depths and rare loot.

## 1. Rules

- Unlocked after clearance tier 4 (P18). A depth run is an expedition with no last layer: each layer is a short node map (P5 generator + P20 kinds weighted to `hazard`, `discovery`, `witness`, `mirror`).
- **Danger** rises per depth; enemy levels may exceed the level cap (scaled to OD).
- **Exits** every few depths: leave with the loot, or go on. Retreating between exits loses part of the loot (P5 rule).
- **Milestone depths** (5, 10, 15, …) hold a boss (P22); nemeses may appear.
- **Record:** best depth per campaign, chronicle lines and a P9b feat; arcs (P18) may use the record and what was found down there.
- Supplies, stress and injuries carry over layers; the Garden's anomalies make telegraphs lie more often (P21).

## Acceptance criteria

1. Depth runs unlock at tier 4, scale per depth, offer exits, keep the record.
2. Milestone bosses and nemeses appear as specified; loot scales with depth.
3. The harness reports survival per depth for reference squads.

## Open decisions (author)

- Layer sizes, exits, danger curve, loot, lore texts, every number.
