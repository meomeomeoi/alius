# P23 — Skill Trees, Specialisations, Levels and Overdrive

**Status: spec.** Release 0.4 (post-release). **Depends on:** P21 (pillars), P4 (progression, trees, respec), P18 (clearance tiers 4–5), P15 (holder choices), P3/P9d (relationship tiers), P7a. **Read:** overview; P21; this file; the **Implemented as** of P4.

**Analysis tool (P7a)** rules apply: every node, stat and choice carries `data-analyze`.

## Goal

Real build choices (horizontal) and a progression that never hits a hard ceiling (vertical). Today each role has 3 linear branches of 5 tiers + one ultimate (16 nodes, 66 points); a level-40 unit owns ~60 % of it; two units of a role at the same level are nearly identical.

## 1. Levels

- **Cap 60**, tiers 10/20/30/40/50/60 (tiers 4–5 from P18 arcs). The XP curve stays (40 + 20 × level); combat XP is tuned so 60 takes **about 40 hours** of play.
- **Skill points:** 1 per level, plus a few from elsewhere (5–8 in a campaign): relationship milestones, a defect arc completed, major arc outcomes.
- **Rare loot:** a "+1 level" item for a unit of the player's choice (normal levels only, not overdrive).

## 2. Overdrive levels

- Past the cap, **overdrive levels (OD)**, unlimited. No skill points, no abilities.
- Each OD level: **+1 % to one stat the player chooses**.
- XP per OD level ×1.12 over the previous one: frequent at first, rare later, never impossible.
- **Conversion:** when a cap rises by N, the first N OD levels become normal levels (skill points granted, their OD stat choices refunded for re-allocation); stored XP is kept.
- Shown as `LV 60 · OD 7`; round OD numbers leave a chronicle line.

## 3. Active tree per role

- 3 branches × 6–7 tiers; **each tier offers a choice of 1 of 2–3 nodes**: a new active, a modification of an active, or a strong passive.
- 2–3 ultimates per role; the unit picks one (switching = respec).
- Branches are built on the pillars (P21): e.g. Assault: Breach (corrosive, break), Momentum (tempo, kills), Bloodline (Bloom, self-cost).

## 4. Passive web

- **60–80 nodes per role**, a compact web: small nodes (+4 % ATK, +3 SPD, +5 % thermal damage), **notables** (rule changes: "bleed can crit", "vent grants a shield"), **3–4 keystones** per role (a rule with a price: "no crits, +35 % damage", "skills cost stress instead of cooldown", Edge).
- **Exits** at the edges lead into the neighbouring roles' corners; a unit **may reach their keystones** (author ruling).
- Points are shared between the active tree and the web.

## 5. Specialisations

- At level 30, 2–3 per role (e.g. Assault → Executioner / Berserker / Vanguard): a branch of its own and a changed base passive.
- **Her preference** comes from the card (`profile_import` section, editable): choosing against it costs Trust, choosing it gives Affinity. **The same applies to respecs** that move her from a preferred to a non-preferred build or back (author ruling).
- **A holder chooses her own** (P15: at frame ≥ `role` or with a high hold the commander's choice is replaced by hers; a capability read by type).
- Changing specialisation later: expensive, through the medbay (slots and plyx), with the preference rule.

## 6. Respec

- Full respec as today (credits + plyx by level), **partial** respec (one node, cheaper), **one free full respec** when choosing a specialisation.
- **Migration:** every unit gets a free full respec with all points refunded when 0.4 lands.

## 7. UI

SQUAD › TREE: the active tree as tiers with choice cards; the web as a compact node graph (zoom not required at this size), search by tag (pillar), path preview with point cost; OD panel with the stat choice. Every node `data-analyze` with its effects text.

## Acceptance criteria

1. Levels to 60 with the curve; OD levels with chosen stats, the ×1.12 curve and conversion on cap rise.
2. Extra skill points and the "+1 level" item work (not on OD).
3. Trees offer choices per tier; ultimates are exclusive; the web connects to neighbour corners including keystones.
4. Specialisations with preferences (choice and respec), holder override, later change via the medbay.
5. Partial, full and free respecs; migration refunds every point.
6. Balance: no keystone dominates (harness, ±5 pp rule as P21).

## Open decisions (author)

- Every tree, web and specialisation; preference import wording; every number.

## Interfaces already provided by P15 (implemented — use, do not rebuild)

P15 is implemented (see its **Implemented as**: rulings R1–R25). What follows is what exists for this package and what is reserved for it. Every P15 reader answers null, zero or an empty list while the dynamic is off (`dynamicOn`, `herPracticeLive`), and nothing it adds draws from the rng unless someone is eligible: a hook you register must keep a campaign with no dynamic byte-identical (`tests/dynamic/unaffected.test.ts`). Keep new directive ids away from `dynamic:`; read domains by capability, styles, milestones and aftermaths by field, never by id; no text gives the commander a pronoun or a feeling.

- **A holder chooses her own:** read the capability, not the id: `hasCapability(state, reg, unitId, 'countermand')` (and `co_leader`); `frameOf` (at least `role`) and `holdBandOf` for the "high hold" test, never the number. The `command` domain needs frame `role` and the owning band and is claimed only by a milestone (`handover`), never by the day step.
- **The override machinery** is P13's generalised: `holderSource(state, reg, unitId)` (authority = hold / 100, leniency from Affinity, agenda `holderAgenda`), `rollOverrides` at the hook sites, `answerOverride` routing by the open slot, `OverrideSource.kind: 'holder'`; one override is open at a time (the warden first). A respec veto is a new order kind at those sites.
- **Off is byte-identical:** a choice that reads the dynamic answers "the commander's own" while `dynamicOn` is false.
