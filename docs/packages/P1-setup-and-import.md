# P1 — Campaign Setup & Character Import

**Depends on:** P0. **Read:** overview; `content/lore.md` (§3–5), `content/roles.md` (§2, §4), `content/defects.md`.

## Goal

A player can start a new campaign: choose a starting point (corporation), choose the commander's crime, import up to 4 character cards as named units through a hybrid AI-assisted profile wizard, and land in the base on Day 1 Morning.

## Scope

### 1. Content shipped in `core`
- `corporations`, `starts` (2), `crimes` (6) from lore stub; `roles` (6), `signatures` (12), `defects` (18) from drafts; `statuses` list.
- Lorebook stub JSON (see lore §9) installed/linked to the campaign chat on creation (player can swap it for their own).

### 2. New Campaign wizard (screen `setup`)
Steps, all with ASCII terminal styling ("CCP INTAKE FORM"):
1. **Dossier** — commander name (default: active persona name), corporation/start choice (2 cards with summaries), crime choice (6, showing perk/flaw; flavor text "Plea: GUILTY").
2. **Unit Assignment** — pick 0–4 character cards from ST library to become named units. Shows difficulty hint: 4 = intended, 3 = hard, 2 = brutal, ≤1 = hellish. No automatic compensation.
3. **Profile Calibration** (per unit) — see §3.
4. **Review** — summary; "Confirm deployment".
On confirm: create (or bind) a group chat containing the selected cards, initialize campaign state (P0), set Day 1 / Morning, install lorebook, open PDA.

Grunts are **not** created here (recruitment comes in P2).

### 3. Profile import (call type `profile_import`)
Input: card fields (name, description, personality, scenario, creator notes; truncated to budget), registry summaries (role ids + one-liners, signature template ids + "fits" lines, defect ids + one-liners filtered by settings — Desire/Bond excluded when disabled), the value axes definition.

Output schema (zod):
```
{
  roleCandidates: [{ roleId, reason }] (1–2),
  values: { pragmatism, autonomy, ingroup, mercy, corporate, sacrifice } (ints −3…3),
  likes: string[] (≤6, short tags), dislikes: string[] (≤6), triggers: string[] (≤4, hard lines),
  signatureCandidates: [{ templateId, name, description }] (3),
  defectCandidates: [{ defectId, origin }] (2–3; origin = 1–2 sentences in-universe),
  emotionalBaseline: { trust: 0–40, affinity: −20…30, attraction: 0–20 } (starting suggestions),
  notes: string (≤300 chars, for the player)
}
```
- All ids validated against registries; unknown ids dropped; if <1 role or <1 defect valid → retry once, else fall back to manual.
- The wizard displays candidates as selectable cards: role (pick 1), signature (pick 1), defect (pick 1; optional second via "Add second defect" toggle), values as sliders pre-set, tags as editable chips, starting axes as sliders.
- "Regenerate" button per section (re-calls with that section only; uses a smaller sub-schema).
- "Manual" mode: everything chosen from lists, no LLM.
- Mechanics edit lock does **not** apply during setup (setup is always editable).
- Starting level 1, stats from role base; equipment: role-appropriate `standard` items from `items` registry (P4 provides them; P1 uses placeholders if P4 not yet present).

### 4. Card ↔ unit binding
- Unit stores `cardRef` (avatar/file id) and display name; if the card is renamed/edited in ST, the unit keeps its game profile; a "Re-sync from card" action re-runs import for selected sections only.
- Expressions: unit uses the card's expression sprites; sprite mode setting from overview §8.

### 5. Commander record
- `crimeId`, `corporationId`, social stats at rank 1 (crime perks may modify), flags.
- Every unit starts **without** `knows_crime` unless the crime/start says otherwise.

## Out of scope
Calendar actions, base, scenes, combat. After confirm, PDA shows SQUAD tab (read-only profile view) and a placeholder for the day.

## Acceptance criteria
1. Wizard completes with 4, 2 and 0 cards; state reflects choices; reload keeps it.
2. `profile_import` on three very different cards (a detailed markdown card, a 3-line card, a card with explicit NSFW content) returns valid, plausible profiles; invalid ids never reach state.
3. Desire/Bond defects never appear as candidates when the setting is off.
4. Manual mode works with no mechanic profile configured.
5. SQUAD tab shows each unit: sprite (neutral), role, level, stats, defect(s) with full text, values (bands unless raw values setting), signature skill.
6. Unit tests: profile validation/sanitization, fallback paths, stat initialization per role.
