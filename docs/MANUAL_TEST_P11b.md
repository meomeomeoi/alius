# P11b — acceptance checklist (head start)

Automated coverage per acceptance criterion (all in `npm test`), then the steps that must be done by hand inside SillyTavern. The automated tests use fake models and jsdom: they cannot judge a real model's recap, nor how the card and the chip look.

## Automated
1. **N = 0 is byte-identical; no new rng draw at any N:** `tests/engine/headStart/setup.test.ts` (`days 0 builds the same state as no head start`), `tests/engine/headStart/build.test.ts` (`a head start draws nothing`), and the seeded tests `tests/warden/unaffected.test.ts`, `tests/special/unaffected.test.ts`, `tests/engine/setup.test.ts`, every `unaffectedWeek` user — unchanged.
2. **N > 0: day 1 as today, `metDay = 1 − N`, development with the trust cap, one non-romantic transition, crime knowledge by the stated chances:** `tests/engine/headStart/setup.test.ts`, `develop.test.ts`, `moments.test.ts`, `build.test.ts`, `tests/engine/relations/graphAllow.test.ts`.
3. **New arrivals behave as at N = 0:** `build.test.ts` (`a new arrival is untouched`), `setup.test.ts` (validation), `tests/headStart/controller.test.ts` (`the opening names the new arrivals`).
4. **The prologue's campaign steps are skipped through `enterStep`; onboarding done; tabs unlocked; the opening states the days:** `tests/engine/onboarding/headStartSkip.test.ts`, `build.test.ts` (the prologue block), `tests/headStart/controller.test.ts`.
5. **The recap picks by sign and values, applies the deltas, gets its text from one wrapped call with a template fallback, writes facts and a chronicle entry with audiences:** `tests/llm/headStartRecap.test.ts`, `tests/engine/headStart/recap.test.ts`, `tests/headStart/controller.test.ts`, `tests/content/headStartSchemas.test.ts` (the `head_start_moment` rules).
6. **No recap moment resembles a probe:** `moments.test.ts` (`probe-tagged entries are never picked`), `headStartSchemas.test.ts`.
7. **Every new option carries `data-analyze`:** `tests/ui/setup/headStart.test.ts`, `tests/ui/headStart/recapCard.test.ts`, `tests/ui/statusHeadStart.test.ts`, `tests/ui/analyzeCoverage.test.ts`, `tests/analysis/headStartProvider.test.ts`, `tests/analysis/hidden.test.ts`.
8. **The fact length setting:** `tests/engine/memory/factTextMax.test.ts`, `tests/ui/memorySection.test.ts`.
9. **Old saves:** `headStart` is optional, the save `version` stays.

## In SillyTavern
Note the SillyTavern version, the connection profiles (API and model) and the browser at the top of your report. Use a fresh group chat for each part.

- [ ] **Each of the four options.** In WORLD PARAMETERS the HEAD START section shows ARRIVAL / ONE WEEK / TWO WEEKS / ONE MONTH; the current one is pressed. Start a campaign with each: the status header reads `DAY 1 OF OPERATIONS` (days > 0 only), the clock is still day 1, and every tab is open.
- [ ] **A new arrival among known soldiers.** With a head start on, UNIT ASSIGNMENT shows a NEW ARRIVAL toggle per chosen unit. Mark one: she is not in THE FIRST WEEKS card and her MEMORY view is empty; marking every unit is refused at the review with `A head start needs at least one soldier who already knows the commander`.
- [ ] **THE FIRST WEEKS card with a model answer.** On the hub, above the objective: one paragraph for the squad and, under each known soldier's name, one or two lines about the moments. Hover a line: the analysis panel names the moment. The texts read as the squad's recollection and the commander is only "the commander".
- [ ] **A refusing model — chip and RETRY.** With a mechanic profile whose model refuses: the card shows the template lines (`AUTHOR TO WRITE`) and the chip `Recap of the first weeks: the model refused.`; `[RETRY]` replaces the texts in place (no second set of facts, no second chronicle line) and the chip goes.
- [ ] **REROLL.** `[REROLL]` on the card asks again and replaces the texts; an edited fact (MEMORY › EDIT) keeps its own text.
- [ ] **REROLL after the first scene.** Open the first scene: the card is gone from the hub. (Reload the chat: it stays gone.)
- [ ] **The opening of the first scene.** The story model's first reply takes the squad as already acquainted: no introductions. A new arrival is introduced as arriving today. In a second scene the line is not repeated.
- [ ] **MEMORY and LOG after it.** A soldier's MEMORY view lists her moments as facts; the LOG holds the paragraph under day 1; the journal line of a moment (`the commander listened to her`) shows in a private scene's prompt context on day 1–3.
- [ ] **The prologue.** With the prologue mode and a head start the line-up, first words, tutorial, debrief and first evening are skipped, no tutorial mission is on the board and no tab is locked. The cold open reads as a RECOLLECTION (not the transport) with a head start and as the TRANSFER ORDER without one; the intake (`FILE REVIEW`, "Name on the file?") and the exam (`MEDICAL RECORD`, "the medic's last report") read as a review of an existing file with a head start, and as the arrival forms without one.
- [ ] **LEASHSWAP with a head start.** Start a LEASHSWAP campaign with ONE MONTH: the warden is picked as usual (the head start may change who oversight picks), her agenda is asked once, the recap card shows, and the commander's first scene opens normally.
- [ ] **Fact length.** SYS › MEMORY › Longest text of a fact: set 320, then change the preset; the value stays. Edit a fact to a long text: it is kept up to the setting. Start a head start campaign with 150: the model is asked for at most 150 characters per moment.
- [ ] **No campaign breaks.** Load a save made before P11b: nothing changes, no card, no chip.
