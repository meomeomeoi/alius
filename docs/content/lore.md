# Alius — Lore Stub (placeholder, author will rewrite)

> Everything here is a **placeholder** so the engine can be built and tested. The author writes the real lore. What matters for the agent is the **structure**: every section below maps to a registry or lorebook entry, and every `id` is referenced by data. Names in *italics* are placeholders.

## 1. Premise (lorebook: `world_premise`, constant)

Decades ago *the Bloom* — a viral agent that rewrites living tissue — turned populations, animals and whole ecosystems into biological monsters. States collapsed; **corporations** did not. They now own cities, laws and armies. Their soldiers are **bio-cybernetic constructs**: grown, augmented, flashed with combat firmware, and owned as assets.

Not every unit leaves the vat to spec. **Off-spec units** — soldiers with a malfunction in mind, body, implants or viral suppression — are too expensive to scrap and too unreliable for regular service. They are dumped into the **Correctional Command Program (CCP)**: penal units sent where losses don't matter. Command of these units is given to people who also don't matter: **convicted officers**, offered a sentence reduction for every mission survived.

The scrap leads the scrap. That is the joke every corporate clerk makes about the CCP. The player is the punchline.

## 2. The Leash (lorebook: `leash_protocol`, constant)

Every off-spec unit carries a corporate override implant. The commander cannot trigger it himself — he can only **file a request** to his corporation's oversight office, which approves a limited number per week.

- **Compel** — neural compliance burst: the unit executes one order. She remembers being forced.
- **Suppress** — full motor lockdown for minutes: stops a desertion or an attack in progress.
- **Terminate** — permanent deactivation. Approved only with cause. Irreversible.

Units know exactly who filed the request.

## 3. Corporations (registry: `corporations`)

Two are playable starts in v1. Others exist as factions.

| id | Name | Flavor | Start? |
|---|---|---|---|
| `vesper` | *Vesper Somatics* | Biotech: grows soldiers, treats the Bloom as a resource. Clean labs, filthy ethics. | yes |
| `kestrel` | *Kestrel-Ward Industrial* | Heavy industry and cybernetics: more metal than flesh, brutal efficiency, quotas. | yes |
| `aurum` | *Aurum Concord* | Finance and logistics; owns the debt of everyone else. | no (faction) |
| `sable` | *Sable Line* | Security contractor; the corporation corporations hire to clean up. | no (faction) |

Fields per corporation: `id, name, summary, values (same 6 axes as units, −3…+3), oversightStyle (how often Leash is approved, how CCP is treated), startingBonus, startingRegionId`.

## 4. Starting points (registry: `starts`)

Each start = a corporation + an opening situation + a **spine** of 5–8 milestone beats. Beats are conditions + goals, not scripts; the director decides how to reach them.

**`start_vesper` — "Seed Stock"**: the unit is assigned to secure Bloom samples in a quarantined district. Spine (placeholder): 1) first sample recovered; 2) discover Vesper is seeding the Bloom deliberately; 3) a squad member's defect is revealed to be engineered; 4) choose: deliver the evidence to Vesper, sell it to Aurum, or bury it; 5) consequences of 4; 6) open-ended phase.

**`start_kestrel` — "Quota"**: the unit must clear a mining corridor overrun by mutants before a shareholder deadline. Spine (placeholder): 1) corridor breached; 2) find survivors Kestrel listed as "acceptable loss"; 3) a rival Sable team arrives with different orders; 4) choose between quota, survivors, or the rival team's offer; 5) consequences; 6) open-ended phase.

## 5. Crimes (registry: `crimes`) — the commander is always guilty

| id | Crime | Perk | Flaw | Value triggers (units with these values react) |
|---|---|---|---|---|
| `liquidation` | *Asset Liquidation* — sacrificed his previous squad to complete an objective | +1 CP at combat start | Units start with −10 Trust once they learn of it | `sacrifice +`, `ingroup +` react negatively |
| `smuggling` | *Data Smuggling* — sold corporate secrets | +25% credits from missions | Oversight approves fewer Leash requests (−1/week) | `corporate +` negative, `corporate −` positive |
| `experimentation` | *Unsanctioned Experimentation* — ran illegal trials on off-spec units | Medbay actions more effective; defect arcs unlock earlier | Units start with lower Trust; distrust spikes when he touches their implants | `autonomy +`, `mercy +` negative |
| `purge` | *Sector Purge* — followed an extermination order too well | Grunts and units with `pragmatism +` start with +Trust | Civilians-related dilemmas hit harder | `mercy +` strongly negative |
| `mutiny` | *Mutiny* — led a revolt against a superior | Authority starts at rank 2 | Leash requests cost more Trust (units see him as a hypocrite) | `autonomy +` positive, `corporate +` negative |
| `strain_trade` | *Strain Trafficking* — sold Bloom samples | Starts with extra Plyx and a black-market contact | Somatic-defect units distrust him (+stress around him) | `mercy +`, `sacrifice +` negative |

Fields: `id, name, summary, perk (effect ids), flaw (effect ids), valueReactions [{axis, sign, weight}], knownByDefault: false` (units learn it via events → flag `knows_crime`).

## 6. Regions (registry: `regions`)

Each region: `id, name, mapHotspot (polygon on the world map image), environmentPrompt (for flavor and background selection), enemyTable (category weights + archetype ids), modifiers[], dangerLevel, pointsOfInterest[]`.

| id | Placeholder name | Environment | Typical enemies |
|---|---|---|---|
| `quarantine_d7` | *District 7 Quarantine* | Overgrown arcology, fungal Bloom growth | human mutants, beast mutants |
| `ashway` | *The Ashway* | Dead highway, scavenger camps | marauders, beast mutants |
| `kestrel_corridor` | *Corridor K-12* | Mining tunnels, machinery | human mutants, enemy soldiers |
| `drowned_market` | *Drowned Market* | Flooded commercial district | marauders, human mutants, rare anomalies |
| `the_garden` | *The Garden* | Bloom epicenter, wrong geometry | anomalies, off-spec hostiles |

## 7. Enemy categories (registry: `enemyCategories`)

| id | Category | Frequency | Notes |
|---|---|---|---|
| `mutant_human` | Bio-mutants (human) | common | Infect status, swarm |
| `mutant_beast` | Bio-mutants (beast) | common | Fast, bleed, pack tactics |
| `marauder` | Marauders | common | Human tactics, loot, cover |
| `enemy_soldier` | Enemy corporate soldiers | rare | Disciplined, armored, use orders of their own |
| `offspec_hostile` | Hostile off-spec units | rare | Have defects themselves; mirror of the squad |
| `anomaly` | Anomalies | very rare | Deal stress directly, break rules (row-ignoring, delayed effects) |

Bosses/special enemies: roadmap.

## 8. Base (lorebook: `base_location`)

A decommissioned *CCP Outpost* assigned to the unit. Scene locations (background ids): `quarters_commander`, `quarters_unit` (per unit), `mess_hall`, `training_yard`, `workshop`, `medbay`, `roof`, `garage`, `comms_room`, `perimeter`.

## 9. Required lorebook entries for the main model

`world_premise` (constant) · `leash_protocol` (constant) · `ccp_program` (constant) · one entry per corporation (keyword-triggered) · one per region · `the_bloom` · `off_spec_units` · one per enemy category. The extension ships these as a lorebook JSON the author replaces.
