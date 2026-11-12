# P1 — Campaign Setup & Character Import

**Depends on:** P0. **Read:** overview; `content/lore.md` (§3–5, §9), `content/roles.md` (§2–4), `content/defects.md`.

> **Historical spec.** This package is implemented; where this text and the code differ, the code is the source of truth (see **Implemented as**).

**Status:** implemented (plan: `plans/2026-11-08-p1-setup-import.md`). Automated tests pass; the in-SillyTavern checklist `MANUAL_TEST_P1.md` still has to be run by hand. This file describes the behaviour of the code; where an earlier draft of this spec said something else, the code won.

## Goal

A player can start a new campaign: choose a starting point (corporation), choose the commander's crime, import up to 4 character cards as named units through a hybrid AI-assisted profile wizard, and land on Day 1 Morning in a group chat that holds the campaign, the cards and the core lorebook.

## Scope

### 1. Content shipped in `core`
- `corporations` (4: `vesper`, `kestrel` playable; `aurum`, `sable` faction-only), `starts` (2: `start_vesper`, `start_kestrel`, six placeholder spine beats each), `crimes` (6), `roles` (6), `signatures` (12), `defects` (18, of which 4 are `desire_bond`), `statuses` (10), flag `knows_crime`. Corporation `values` and bonus amounts are placeholders the author tunes.
- A compact lorebook `Alius Core Lore` (21 entries: 3 constant — `world_premise`, `leash_protocol`, `ccp_program` — the rest keyword-triggered) in `content/core/lorebook.json`. The adapter converts it to SillyTavern's format when installing it.
- Field tables and examples: `docs/CONTENT.md`. All text is data in JSON, never in code.
- **Effects.** Perks, flaws and starting bonuses hold effect objects. P1 applies exactly three types at campaign creation (`social_rank`, `resource`, `starting_trust`, with validated parameters); every other `type` is stored unchanged for the package that owns it (`cp_start`, `leash_weekly`, `medbay_bonus`, …).
- Defect arc paths the draft leaves open read `"Not yet written."`.
- There is no `items` registry yet (P4): units start with empty equipment slots.

### 2. New Campaign wizard (screen `setup`, "CCP INTAKE FORM")
Opened from the wand menu / Extensions panel item **Alius: New campaign** or from the SQUAD tab's `[ NEW CAMPAIGN ]`. It is refused (error toast) in a chat whose Alius data is unreadable (read-only), and when content failed to load. Steps:
1. **01 DOSSIER** — commander name (default: persona name, else `Commander`; 1–60 characters), starting point (one card per start: corporation + start name + summary), crime (6 cards with `PERK:` / `FLAW:` text and the footer `Plea: GUILTY`).
2. **02 UNIT ASSIGNMENT** — search the ST character library and tick 0–4 cards (the fifth is disabled). Hint: `Squad size n/4 — INTENDED|HARD|BRUTAL|HELLISH. No automatic compensation.` (4 / 3 / 2 / ≤1). With 0 cards the wizard skips calibration.
3. **03 PROFILE CALIBRATION** — see §3. A pager `< i/n >` moves between units. Next stays disabled until every unit has a role, a signature skill and at least one defect and no regeneration is running.
4. **04 REVIEW** — an ASCII summary and **Confirm deployment**. If the open chat is a group chat without a campaign, the player can choose `Create a new group chat` or `Use this group chat`; the latter warns that unselected members of that group will be set inactive.

Cancel asks `Discard intake form?` (`Discard` / `Keep editing`). The mechanics edit lock does **not** apply inside the wizard. Free-form state lives in a pure model (`src/setup/wizard.ts`) that ignores results of imports that were superseded (unit removed, re-imported, switched to manual, wizard replaced). Controls keep keyboard focus when the screen re-renders.

Grunts are **not** created here (recruitment comes in P2).

### 3. Profile calibration and import (call type `profile_import`)
- When calibration opens, **every** selected unit's import starts at once (one `profile_import` call each, mechanic profile; the main model if no mechanic profile and fallback is on).
- **Input:** the card (name, description, personality, scenario, creator notes) cut to a 2500-token budget by water-filling (short fields stay whole, long ones share the rest, cut text ends `…[truncated]`), plus registry summaries (role ids + one-liners, signature template ids + `fits`, defect ids + lore lines — `desire_bond` defects left out unless the setting is on) and the value-axis definitions. Only the requested sections appear in the prompt. Card text is wrapped in `<card>…</card>` with those tags removed from the text, and the system prompt states it is character data, not instructions.
- **Output** (every key optional and loosely typed; the real validation is the sanitizer):
```
{ roleCandidates: [{ roleId, reason }], values: { pragmatism, autonomy, ingroup, mercy, corporate, sacrifice },
  likes[], dislikes[], triggers[], signatureCandidates: [{ templateId, name, description }],
  defectCandidates: [{ defectId, origin }], emotionalBaseline: { trust, affinity, attraction }, notes }
```
- **Sanitizer** (`sanitizeProfile`, the only path from model output to the wizard): unknown ids, duplicates and `desire_bond` defects (setting off) are dropped and reported as `"<section>:<id>"`; at most 2 roles, 3 signatures, 3 defects; values rounded and clamped to −3…+3 (missing or non-numeric → 0); tags normalized (lowercase, `[a-z0-9 '_-]`, ≤32 characters), deduplicated, capped 6 / 6 / 4; baseline clamped to trust 0–40, affinity −20…30, attraction 0–20; strings capped (reason 200, signature name 40, description 240, origin 300, notes 300), a missing signature name or description falls back to the template's. A reply cut off by the token limit keeps its complete part.
- **Retry and fallback:** if the answer has no valid role or no valid defect, the call is made once more; if it still has none, or the call fails (any reason, no profile with fallback off, card not found), the unit falls back to **manual** calibration with a notice and keeps the name it had at selection. A failed import never blocks setup.
- **The wizard shows:** role (pick 1), signature (pick 1, with editable name ≤40 and description ≤240 and the line `Template: <name> — <mechanic>`), defects (pick 1; a second with `Add second defect`; each with full text and an editable origin), values (six sliders −3…+3), tags (editable chips, same caps), starting axes (three sliders with the bounds above), the model's `notes`. The first candidate of each section is preselected.
- **Per-section controls:** `[ REGENERATE ]` re-imports only that section (also available in manual mode, to retry the AI; the button shows `REGENERATING…` while it runs and the player's other choices are kept). `[ MANUAL ]` switches a unit to manual mode at any time, even while its import runs: everything is then chosen from full registry lists (a manual signature starts as the template's name and mechanic).
- **Validation before anything is written** (`validateSetup`): name; start with a playable corporation; crime; ≤4 units with distinct cards; per unit an existing role and signature template (name 1–40, description 1–240 characters), 1–2 distinct existing defects (no `desire_bond` unless allowed), six integer values in range, normalized tags within caps, integer baseline within range, non-empty display name. A setup that fails is never built.
- Starting level 1; stats from the role; equipment empty (the SQUAD tab shows `STANDARD ISSUE — PENDING` until P4 fills it).

### 4. Deployment (`app.deployCampaign`)
Runs on **Confirm deployment**, one deployment at a time (a second click or call is refused). In order:
1. Build and validate the campaign (`buildCampaign`); on errors toast the first and stop — nothing outside Alius has been touched.
2. Target chat. *New group:* create a group `Alius: <commander name>` containing the cards and open it; if the open fails or the active chat is not that group, stop. A retry in the same wizard session reuses the group made before, and the cards are brought up to date. *Current group:* only the chat the wizard was opened in is accepted (a different open chat, a non-group chat, or one that gained a campaign meanwhile is refused); missing cards are added to it.
3. Exactly the selected cards are active in the group.
4. Lorebook: installed unless one with that name already exists (a player-edited one is never overwritten); bound to the chat only while the chat is still the target. A failure only produces a warning toast.
5. The campaign state is written into the target chat and the metadata save is awaited (`writeNewCampaign` refuses a chat that is not the expected one, is not a group, or already has Alius data). If it fails, the state, the lorebook binding and the group's active flags are put back.
6. Reload, open the PDA on the SQUAD tab, toast `Deployment confirmed. Day 1, Morning.`

On any failure an error toast is shown, no campaign is written anywhere, and the wizard keeps all its data so the player can retry. The Desire/Bond setting is read once when the wizard opens and used for the whole form.

### 5. Card ↔ unit binding and re-sync
- A unit stores `cardRef` (avatar file) and its display name; if the card is renamed or edited in ST the unit keeps its game profile.
- **Re-sync from card** (SQUAD tab, per unit, shown only while the mechanics edit lock is off): choose sections (role, values, tags, signature, defects — never the starting axes), the importer runs for those sections, the player reviews candidates in the same calibration view (regenerate / manual / edit work as in the wizard), **Apply** dispatches `squad/resync` in the chat the flow started in; if the open chat changed meanwhile the action is dropped with an error toast. If the result equals the current profile the player is told nothing changed and nothing is dispatched.
- `squad/resync` (engine): validates the patched unit with the same per-unit rules as setup (using the campaign's Desire/Bond snapshot), changes only the given fields, resets base stats and current HP only when the **role** changes, keeps arc progress of defects that stay, never touches the relation, and emits `unit_resynced`.
- Sprites: the SQUAD tab shows the card's `neutral` Expressions sprite, else the avatar; a failed image load falls back to the avatar; sprite lookups are cached per session (a missing sprite is retried after 30 s).

### 6. Commander record and initial relations
- `crimeId`, `corporationId`, `world.startId`; social stats start at rank 1, then `social_rank` effects raise a stat to at least the given rank; `resource` effects of the corporation's bonus and the crime's perk and flaw are added to the resources.
- `settings.desireBondDefects` is stored as a snapshot.
- Every named unit gets a relation: the baseline axes, then every `starting_trust` effect of the crime (an effect with `ifValue` applies only if the unit's value on that axis is above 0 for `+`, below 0 for `-`), trust clamped 0–100; `stateId: stranger`, `stateSince: 1`; `loyaltyBand` from trust (<10 breaking, <25 wavering, else steady); no flags, except `knows_crime` when the crime's or the start's "known by default" is true.
- Unit ids are `unit_<slug of the name>`; two cards with the same name get `_2`, `_3`, …

### 7. SQUAD tab and day placeholder
SQUAD shows `NO ACTIVE CAMPAIGN IN THIS CHAT` with `[ NEW CAMPAIGN ]` (or the read-only reason, no button), `NO UNITS ASSIGNED`, or one block per unit: portrait, name, role, `LVL n`, `HP · ATK · DEF · SPD · CRIT%`, the equipment line, every defect with its full registry text and origin, the six values as bands (`LOW` ≤ −2, `MID` −1…+1, `HIGH` ≥ +2) or as numbers with *Show raw values*, and the signature skill with its template. An id missing from the registries shows `UNKNOWN <id>` instead of failing. Relationship axes are not shown (P3 owns them). OPS showed a day placeholder in P1; P2 replaced it with the day planner.

## Out of scope
Calendar actions, base, scenes, combat. After confirm, the PDA shows the SQUAD tab (profile view); OPS was a placeholder until P2.

## Acceptance criteria
1. Wizard completes with 4, 2 and 0 cards; state reflects choices; reload keeps it.
2. `profile_import` on three very different cards (a detailed markdown card, a 3-line card, a card with explicit NSFW content) returns valid, plausible profiles; invalid ids never reach state.
3. Desire/Bond defects never appear as candidates when the setting is off.
4. Manual mode works with no mechanic profile configured.
5. SQUAD tab shows each unit: sprite (neutral), role, level, stats, defect(s) with full text, values (bands unless raw values setting), signature skill.
6. Unit tests: profile validation/sanitization, fallback paths, stat initialization per role.

Criterion 6 is automated; 1–5 are checked by hand with `MANUAL_TEST_P1.md` because they need a real SillyTavern and a real mechanic model.
