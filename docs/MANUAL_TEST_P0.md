# P0 manual acceptance checklist (run inside SillyTavern)

Automated tests cannot load the extension into SillyTavern, so acceptance criteria 1–7 of `docs/packages/P0-foundation.md` are checked by hand. Criterion 8 is automated.

**Status: run in a real SillyTavern on 2026-11-08 against commit `da43ac6`; all lines passed** (result reported by the project owner, who ran the checklist; the per-line notes were not recorded). Fill in the versions below when known.

- SillyTavern version: `____`
- Browser: `____`
- Alius commit: `da43ac6`
- Connection Manager extension enabled with at least one connection profile: ☐

## Install

1. Run `npm install && npm run build` (only needed if you changed code; `dist/` and `style.css` are committed).
2. Clone the repo into `SillyTavern/public/scripts/extensions/third-party/Alius` (or use *Extensions → Install extension* with the repo URL).
3. Reload SillyTavern (hard refresh).

## Checklist

- [x] **1. Loads without console errors; settings persist.**
  Open the browser DevTools console and reload: no red errors mentioning `Alius`. Open the wand menu (*Extensions* menu next to the chat input): three items appear — **Alius**, **Alius: Initialize campaign (debug)**, **Alius: Ping mechanic model (debug)**. Click **Alius** → the full-screen shell opens → press `8` (SYS) → set *Palette* to `green` and tick *Debug mode* → close the shell, reload the page, open **Alius** → SYS: palette is still green and the `[ DEBUG ]` section is visible.

- [x] **2. Initialize creates state in metadata; reload restores it; switching chats switches campaigns.**
  a. In a **solo** (non-group) chat click **Alius: Initialize campaign (debug)** → warning toast `Alius campaigns need a group chat.`; nothing is created.
  b. Open (or create) a **group chat** with at least two characters → click the same menu item → toast `Alius campaign initialized.` → open **Alius** → SYS → debug → *Campaign state* shows JSON with `"version": 1`, `"day": 1`, `"slot": "morning"`.
  c. Reload the page and reopen that group chat → SYS shows the same state (day 1).
  d. Switch to another group chat that has no campaign → SYS shows `No campaign loaded.`; switch back → the state is shown again.
  e. Click the init item in the chat that already has a campaign → toast `This chat already has an Alius campaign.`

- [x] **3. Migration: a v0 state loads into v1 shape.**
  Automated: `npm test` → `tests/engine/state.test.ts › v0 fixture migrates to v1`.
  By hand: in a group chat with a campaign, SYS → untick *Mechanics edit lock* → in the *Campaign state* editor replace the text with `{ "version": 0, "day": 3, "slot": "evening", "seed": 7 }` → **Apply** → toast `State applied.` and the editor now shows `"version": 1`, `"day": 3`, `"slot": "evening"`. Invalid text such as `{ nope` → error toast `Invalid JSON: …` and the state is unchanged. Tick *Mechanics edit lock* again.

- [x] **4. Content packs: valid pack loads, invalid file gives a readable error, override replaces by id.**
  Automated: `npm test` → `tests/content/loader.test.ts` (base / override / broken fixture packs).
  By hand: SYS → debug → *Content errors* reads `Content packs loaded without errors.` for the shipped `content/core`. Then temporarily edit `content/core/flags.json` to `[{ "id": "x" }]`, reload SillyTavern → one warning toast `Content: 2 error(s) — see SYS › debug` → SYS → debug lists `core · flags.json · [0].scope — Required` and `… [0].description — Required`; the shell still opens. **Revert the file** (`[]`) and reload.

- [x] **5. Ping returns validated JSON; failures do not throw.**
  SYS → *Mechanic profile* → pick a connection profile. Click **Alius: Ping mechanic model (debug)** → toast `pong: alius`. SYS → debug → *LLM log* shows a `ping` entry, `ok`, with `max 2000` (the request floor) — open it to see prompt, raw answer and parsed JSON. Then set *Mechanic profile* to `(none…)` and untick *Fall back to main model* → ping again → error toast `Ping failed: no_profile — …`; no exception in the console. Re-tick the fallback afterwards.

- [x] **6. A test directive appears in the main model's prompt and is removed on clear.**
  In a group chat with a campaign: SYS → debug → *Tools* → **Set test directive**. Send a message to the group, wait for the reply, then open the prompt inspector for that reply (the message's `⋯` menu → *Prompt* / Prompt Itemization; enable the prompt inspector in User Settings if the button is missing). Expected in the prompt: `[ALIUS CONTEXT]` with `[ALIUS] Day 1, Morning.` and `[ALIUS DIRECTIVES — hard constraints, follow them]` with `- TEST DIRECTIVE: this line must appear in the prompt.`
  Click **Clear test directive**, send another message → the directive is gone, the `[ALIUS CONTEXT]` block is still there. Click **Clear all injections**, send another message → neither block is in the prompt.

- [x] **7. Shell opens/closes; palettes switch; tabs navigate by keyboard.**
  Open with the wand menu item; close with `[X]`; reopen with `Alt+Shift+A` and close it again the same way. SYS → *Palette* amber → green → white: colors change immediately. With focus outside any input press `1`…`8` → tabs `SQUAD, OPS, MAP, COMMS, BASE, INV, LOG, SYS` are selected in that order; click a tab, then `→`/`←` move the selection and wrap (`SYS` → `SQUAD`). Unregistered tabs show `NO DATA // MODULE OFFLINE`. With a campaign, SYS → **Import campaign** → pick a file → the *Replace campaign?* modal opens → `Esc` closes only the modal and the shell stays open. Typing digits into a number field does not switch tabs.

- [x] **8. `vitest` is green and the engine imports nothing from `src/st` or `src/ui`.**
  Automated: `npm test` (includes `tests/architecture.test.ts`) and `npm run typecheck`.

## Notes for the tester

- A read-only campaign (corrupt `alius` metadata, or a state from a newer version) shows a red banner in the shell and is never overwritten.
- Debug tools and the state editor live only in SYS with *Debug mode* on.
