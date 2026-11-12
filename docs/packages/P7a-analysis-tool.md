# P7a — Analysis Tool (contextual explanations)

**Depends on:** P0–P6 (UI shell as implemented). **Runs before P7**, so every new screen from P7 on is built with it. **Read:** overview; this file.

## Goal

Hover (or focus, or long-press) any stat, option, trait, defect, status, resource or setting → a small terminal panel appears under the cursor, plays a short *analyzing* animation, then shows a concise explanation of what the thing does, and — for live values — why it is what it is right now. It is the game's built-in manual, diegetically framed as the PDA's analysis function.

## Principles

- **Data, not generation.** Explanations come from registries and a glossary. No LLM calls: zero cost, instant, never hallucinates rules.
- **Never spoils hidden state.** Dynamic readings show only what the player is allowed to know (bands unless "show raw values"; no unknown warden expectations, no truth flags of Frequency intercepts, no facts the commander doesn't know).
- **Fast after the first time.** The animation is flavour; it must not tax repeated use.

## 1. Interaction

- **Mouse:** hover 250 ms → panel opens near the cursor (flips to stay on screen). Animation `ANALYZING ▒▒▒░░` — 600 ms the first time a subject is analyzed in a session, 150 ms afterwards. Moving away closes it.
- **Pin:** click the panel's pin or hold `Shift` to keep it open and move the cursor into it.
- **Drill-down:** terms inside an explanation are links to their own entries (e.g. Impunity → Leash credibility). Breadcrumbs, max depth 3, `Backspace` goes back.
- **Keyboard:** focused element + `?` (or `F1`) opens the panel; `Esc` closes.
- **Touch:** long-press 400 ms.
- Settings (SYS): enabled on/off, animation `full | short | off`, hover delay.

## 2. Addressing subjects

Any element gets `data-analyze="<source>:<id>"` and optionally `data-analyze-ctx="<json>"` (unit id, etc.).

Sources:
- `glossary:<id>` — registry `glossary`: `{ id, term, short (≤ 160 chars), long? (≤ 600 chars), see?: string[] }` for core concepts: Trust, Affinity, Attraction, Stress, Impunity, CP, slots, clearance, loyalty bands, stances, archetype, presence, disposition, etc.
- `<registry>:<id>` — any registry entry with `name`/`description` (roles, skills, signatures, statuses, defects, items, affixes, traits, crimes, corporations, world options/choices, punishments, activities, facilities, relationship states, node types, enemies). The panel shows the entry's description plus a generated **effects summary** from its structured effects (e.g. "+20% ATK at Stress ≥ 50").

Registries without a `description` field get one (schema change, optional field, validator warning if missing on player-visible entries).

## 3. Dynamic readings

Providers by subject kind add a **"Current reading"** block under the static text:

| Subject | Reading |
|---|---|
| Relationship axis of a unit | band, trend (▲▼ over the last 3 days), the last 3 contributing events from `relation.history` with one-line causes |
| Unit stat / commander body stat | value or descriptor, where it is used (from the effect/check index), modifiers currently applied (gear, defect, injury) |
| Stress | band, sources in the last expedition/day, what happens at the next threshold |
| Impunity (once P9 exists) | stance and the main contributing terms as bands; providers are added by the package that adds the value |
| Resource | current amount, daily upkeep, last changes |
| Setting / world option | what it changes, whether it is locked |

Provider API: `registerAnalyzeProvider(kind, (subject, ctx, knowledge) => Reading)`. `knowledge` is the player-visible filter; providers must use it (tested).

## 4. Coverage rule

From this package on, every player-facing stat, option, chip and choice card carries `data-analyze`. A test renders the main screens in jsdom and fails on elements marked with the shared classes for stats/options/chips that lack it. This package back-fills existing screens: SQUAD, unit profile, combat (skills, statuses, CP orders), BASE, INV, expedition nodes, dilemma options, setup wizard, SYS.

## 5. Look

Terminal voice: monospace, box-drawing frame, phosphor palette, scan-line wipe for the analyzing animation; respects reduced motion (animation `off`). P10 later restyles it with voices.

## 6. Content

A starter `glossary` (≈ 30 entries) drafted by the agent from the specs; the author edits the wording. Descriptions for registry entries come from `content/*.md` drafts.

## Acceptance criteria

1. Hover, focus + `?`, and long-press open the panel; first-time vs repeat animation durations match settings; `off` shows text immediately.
2. Pin and drill-down work, with breadcrumbs and back navigation; depth capped at 3.
3. `glossary:` and `<registry>:` subjects render static text and an effects summary generated from structured effects.
4. Dynamic readings for axes, stats, stress and resources show the specified data; with "show raw values" off only bands appear.
5. Hidden-state test: readings never include unknown facts, unknown expectations or intercept truth flags (fixture-based).
6. Coverage test passes on all existing main screens.
7. No network/LLM calls are made by the tool.

## Open decisions (author)

- Glossary wording.
- Whether the panel may show "what an option would change" previews on dilemma choices (default: no — choices stay uncertain; only the option's tags are explained).
