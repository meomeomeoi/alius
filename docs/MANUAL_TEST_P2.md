# P2 manual acceptance checklist (run inside SillyTavern)

Most of P2 is covered by automated tests; this list covers what needs a real SillyTavern and a real model: the PDA header, the OPS and BASE tabs on a real campaign, the vignette and the generated grunt names. Run it on a campaign created with P1's wizard (or any campaign that has at least one named unit).

**Status: not run yet.** The project owner runs the list below, ticks every line and fills in the header.

- SillyTavern version: `____`
- Browser: `____`
- Alius commit: `____`
- Mechanic connection profile (provider / model): `____`

## Automated coverage of `docs/packages/P2-calendar-base-economy.md` acceptance criteria

| # | Criterion | Tests |
|---|---|---|
| 1 | A week by activities alone; resources, stress, stats per tables; pipeline in order | `tests/engine/activities.test.ts` › *a week of activities*; `tests/engine/calendar.test.ts` › *pipeline steps run in the documented order*, *a P1-era state runs seven days* |
| 2 | Supply shortage penalties | `tests/engine/economy.test.ts` › *runUpkeep* |
| 3 | Facility timers across days, capacity changes | `tests/engine/calendar.test.ts` › *facility timer completes…*; `tests/engine/base.test.ts` › *timer runs across days…* |
| 4 | Deterministic grunts, portraits | `tests/engine/grunts.test.ts` |
| 5 | Social checks queryable | `tests/engine/social.test.ts` |
| 6 | Unit tests per activity effect, upkeep, timers, grunts | `tests/engine/activities.test.ts`, `economy.test.ts`, `calendar.test.ts`, `base.test.ts`, `grunts.test.ts` |

## Install

`npm install && npm test && npm run build` (only after code changes), put the repo into `SillyTavern/public/scripts/extensions/third-party/Alius`, hard-refresh SillyTavern.

## Checklist

- [ ] **1. Header.** Open Alius on a campaign: above the tabs a line reads `DAY 001 // MORNING`, `CR … · SUP … · PLYX …`, `LEASH 0`. It updates after every activity.
- [ ] **2. OPS: alone.** OPS lists Train, Workshop, Medbay, Work, Scout the net, Rest, Study, Talk (all nine are always listed; the group meal is greyed out in the morning with its reason). Do **Work**: credits go up, the clock moves to `AFTERNOON`. Do **Train** with *Drill the squad*: it stays disabled until you tick 1 or 2 units.
- [ ] **3. OPS: with a companion.** Pick a named unit as companion for **Rest** with *Companion vignettes* on (SYS): a toast panel with two lines of prose appears. Turn the setting off and repeat: no panel, no extra model call (check the debug log).
- [ ] **4. Day end.** Spend all three slots: toasts for the new day appear; the header shows `DAY 002 // MORNING`. Reload the page: day and resources are unchanged (autosave).
- [ ] **5. Shortage.** Let supplies run out (or set them to 0 in the debug state editor) and end the day: a warning toast `Supply shortage…`, the header shows `SHORTAGE 1d`. After three such days a trust warning appears. **Requisition** on OPS turns credits into supplies.
- [ ] **6. BASE.** The schematic shows five boxes with levels. Upgrade the Barracks (needs 60 CR, 5 PLYX): the box shows `^ 2d`; after two day ends the toast `Barracks upgraded to level 2.` appears and `UNITS n/7`.
- [ ] **7. Grunt.** **Recruit grunt** (40 CR): a new unit with a designation like `K-117` appears in ROSTER and on SQUAD with an ASCII portrait. With *Generated grunt names* on, a name and one-line bio replace the designation as display name within a few seconds; the designation stays on the card.
- [ ] **8. Roster.** Toggle `[ACTIVE]`/`[RESERVE]`: a fifth active unit is refused (the button is disabled).
- [ ] **9. Talk.** **Talk** with a companion shows the toast that scenes are not available yet and does **not** advance the clock, and Rest can still be done afterwards.
- [ ] **10. Chat switch.** Start **Rest** with a companion and switch chats at once: no vignette toast appears in the other chat.
