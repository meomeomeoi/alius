# P1 manual acceptance checklist (run inside SillyTavern)

Automated tests cannot load the extension into SillyTavern or call a real model, so acceptance criteria 1–5 of `docs/packages/P1-setup-and-import.md` are checked by hand. Criterion 6 is automated.

**Status: not run yet.** The project owner runs the list below in a real SillyTavern, ticks every line and fills in the header.

- SillyTavern version: `____`
- Browser: `____`
- Alius commit: `____`
- Mechanic connection profile (provider / model): `____`
- Library for the tests: at least four character cards, among them one detailed markdown card, one 3-line card and one card with explicit (NSFW) content; at least one card has Expressions sprites (a `neutral` image) and one has none.

## Install

1. `npm install && npm test && npm run build` (only needed after code changes; `dist/` and `style.css` are committed).
2. Put the repo in `SillyTavern/public/scripts/extensions/third-party/Alius` (or install it by URL) and hard-refresh SillyTavern.
3. Wand menu → there are now four Alius items: **Alius**, **Alius: New campaign**, **Alius: Initialize campaign (debug)**, **Alius: Ping mechanic model (debug)**.

## Checklist

- [ ] **1. The wizard completes with 4, 2 and 0 cards; the state reflects the choices; reload keeps it.**
  Repeat the whole line three times: with 4 cards, with 2 and with 0.
  a. Wand menu → **Alius: New campaign** → the shell opens on **CCP INTAKE FORM**, step `01 DOSSIER`. The name field holds your persona name.
  b. Pick a start card and a crime card (every crime card shows `PERK:`, `FLAW:` and `Plea: GUILTY`) → **Next**.
  c. `02 UNIT ASSIGNMENT`: tick 4 (then 2, then 0) cards. The hint reads `Squad size 4/4 — INTENDED.` / `2/4 — BRUTAL.` / `0/4 — HELLISH.` plus `No automatic compensation.`; with 4 ticked the other cards cannot be ticked. **Next** (with 0 cards the wizard jumps straight to `04 REVIEW`).
  d. `03 PROFILE CALIBRATION`: go through every unit with `>` (each unit needs a role, a signature skill and at least one defect) → **Next**.
  e. `04 REVIEW`: the summary lists the commander, corporation, crime and every unit → **Confirm deployment**.
  Expected: a **new group chat** `Alius: <name>` opens containing exactly the ticked cards; toast `Deployment confirmed. Day 1, Morning.`; the shell shows the **SQUAD** tab with 4 / 2 / 0 units (`NO UNITS ASSIGNED` for 0). **OPS** shows `DAY 1 // MORNING` and `CALENDAR MODULE OFFLINE`. SYS (enable *Debug mode*) → *Campaign state*: `"day": 1`, `"slot": "morning"`, `world.startId`, `commander.corporationId`, `commander.crimeId` match your choices, and `squad` has 4 / 2 / 0 entries.
  Reload the page, reopen the new group chat → SQUAD and the debug state are unchanged.
  The chat's lorebook (World Info → the chat-lore globe button) is `Alius Core Lore`; the lorebook list has 21 entries and three of them are constant.
  Also: with the open chat being a **group chat without a campaign**, the review step offers `Create a new group chat` / `Use this group chat`. Choose `Use this group chat` → the ticked cards are added to that group, the others are disabled, the campaign is written into that chat and no second group is created. In a solo chat or a chat that already has a campaign the choice is not offered.

- [ ] **2. `profile_import` on three very different cards gives valid, plausible profiles; invalid ids never reach the state.**
  Select a mechanic connection profile in SYS first. Run the wizard to calibration with the **detailed markdown card**, the **3-line card** and the **explicit NSFW card** (one card per run is fine).
  Expected for each: the status line shows `CALIBRATING…` and then the role, signature and defect candidates appear; roles/signatures/defects are real names from the registries (no `UNKNOWN …`); values and starting axes are preselected; the notes line reads sensibly. SYS → debug → *LLM log* has a `profile_import` entry with the raw reply. Finish the wizard; in the debug state every role, signature template and defect id exists in `content/core` (no invented ids), and every value is an integer from -3 to 3.
  Try `[ REGENERATE ]` on one section → only that section's candidates change; the choices you made elsewhere stay.

- [ ] **3. Desire/Bond defects never appear as candidates while the setting is off.**
  SYS → *Desire/Bond defects* **off**. Run calibration for two different cards (and `[ MANUAL ]` for a third) → neither the candidates nor the manual defect list ever contain `Imprint Hunger`, `Possessive Protocol`, `Reward Loop Damage` or `Compliance Craving`. Then turn the setting **on**, start a new campaign wizard → the four defects are offered in the manual list and may appear as candidates.

- [ ] **4. Manual mode works with no mechanic profile configured.**
  SYS → *Mechanic profile* = `(none …)` and untick *Fall back to main model*. New campaign → calibration shows the manual notice (`no mechanic connection profile selected`) and every list (6 roles, 12 signature templates, defects) is offered; pick everything by hand → the wizard completes and the campaign deploys. Also try `[ MANUAL ]` on a normal (profile-backed) run → the unit switches to the full lists. Re-tick *Fall back to main model* afterwards.
  Also: if you rename the card in SillyTavern's library between selecting and calibrating (or delete it), that unit falls back to manual with the notice `card not found` and keeps the name it had when selected.

- [ ] **5. The SQUAD tab shows each unit completely.**
  For a card **with** Expressions sprites the portrait is the `neutral` sprite; for a card **without** sprites it is the avatar. Each unit shows: name, role, `LVL 1`, the stats line `HP … · ATK … · DEF … · SPD … · CRIT …%` (e.g. `HP 110 · ATK 24 · DEF 12 · SPD 14 · CRIT 10%` for an Assault), `STANDARD ISSUE — PENDING`, every chosen defect with its **full text** (origin, lore, upside, downside, breakdown, social, arc), the six values as bands (`MERCY: HIGH`, …), and the signature skill with `Template: <name> — <mechanic>`. No Trust/Affinity/Attraction numbers are shown. SYS → tick *Show raw values* → the values switch to numbers (`MERCY: +2`); untick → bands again.

- [x] **6. Automated: profile validation and sanitization, fallback paths, stat initialization per role.**
  `npm test` → `tests/setup/profile.test.ts` (sanitizer, retry, manual fallback), `tests/engine/setup.test.ts › stats initialized from role`, `tests/setup/wizard.test.ts`, `tests/ui/setup.test.ts`, `tests/app.test.ts` (deploy), `tests/engine/squad.test.ts` and `tests/app-resync.test.ts` (re-sync). Last run: 28 files, 361 tests, all passing; `npm run typecheck` and `npm run build` clean.

## Also check (implemented in P1, not an acceptance criterion)

- [ ] **Re-sync from card.** SYS → untick *Mechanics edit lock*. SQUAD → a unit shows `[ RE-SYNC FROM CARD ]` (hidden while the lock is on). Click it → tick sections → **Import** → review the candidates → **Apply**. The chosen sections change; relationship numbers do not; switching to another chat while the dialog is open and then pressing **Apply** shows an error toast and changes nothing.
- [ ] **Failure paths.** Make the lorebook save fail or pre-create a lorebook named `Alius Core Lore` with your own text → deployment still succeeds (warning toast, or the existing lorebook is bound and left untouched). Cancel the wizard (`Cancel` → `Discard`) → the shell returns to the PDA and nothing was created.

## Notes for the tester

- A chat with unreadable Alius data (read-only) refuses **New campaign** with an error toast.
- The wizard keeps what you entered if deployment fails; fix the cause and press **Confirm deployment** again.
