# P24 — Skill Modifiers, Augments and Gear

**Status: spec.** Release 0.4 (post-release). **Depends on:** P21, P23, P4 (items, workshop, loot), P2 (medbay, workshop), P15 (holder, consent by frame), P6 (Leash compel), P9 (discipline), P7a. **Read:** overview; P21; P23; this file; the **Implemented as** of P4.

**Analysis tool (P7a)** rules apply.

## Goal

More decisions around the same skills: modifiers that change how a skill works, augments that change the soldier, and gear with character instead of plain stats.

## 1. Skill modifiers

- Each active has **1 modifier slot**; the signature and the ultimate have **2**.
- Modifiers (registry `skillModifiers`): `{ id, tags (pillar), appliesTo (skill tags / kinds), effects, drawback?, rarity }` — e.g. "chains to a second target at ×0.5", "applies bleed", "cooldown −1, +5 stress to self", "only from the back row, +30 % damage", "converts to thermal".
- Sources: tree nodes, loot, crafting. Stored in the inventory; swapped freely in a workshop session (P4 ops).

## 2. Augments

- Slots: 1 at level 15, 2 at level 35, a 3rd through a tree node.
- Registry `augments`: `{ id, line: 'kestrel' | 'vesper' | 'aurum' | 'sable' | 'bloom', severity: 'minor' | 'serious', effects, defectLinks?, sideEffects?, description }`. Bloom augments are strong with side effects.
- **Defect links:** some augments suppress, amplify or change a defect's behaviour (read by defect category / field, never by id).
- Installed in the medbay (a slot + plyx); removal carries a risk (injury days, stress).
- **Consent** (author ruling): a `serious` augment needs her agreement: her values, Trust, Impunity, and a P15 frame decide; a wilful soldier or a holder may refuse. Forcing it goes through discipline (P9) or a Leash compel (P6) and is remembered like any compel. Minor augments need no consent but her opinion still moves Affinity and stress.
- Augments are not tied to the `body_modification` content category (combat hardware, always available).

## 3. Gear

- **Uniques** with pillar mechanics (a shotgun that breaks, a coil that vents heat into allies' shields).
- **Corporate sets:** 2- and 3-piece bonuses (three slots).
- **Weapon mastery:** each weapon class grants a weapon skill; mastery per unit and class grows with use and unlocks its upgrades.
- **The "+1 level" item** (P23) lives in rare loot tables.

## Acceptance criteria

1. Modifier slots, sources and swapping work; drawbacks apply.
2. Augments install, remove (with risk), link to defects by field, and respect consent with the forcing paths.
3. Uniques, sets and weapon mastery work; loot tables carry the new items.
4. Balance: no modifier or augment dominates (harness).

## Open decisions (author)

- Every modifier, augment, unique and set; mastery curves; every number.
