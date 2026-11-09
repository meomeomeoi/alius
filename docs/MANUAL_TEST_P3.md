# P3 manual acceptance checklist (run inside SillyTavern)

P3 is covered by automated tests for everything that does not need a real SillyTavern and a real model. This list covers the rest: real group generation, sprites, swipes, the typing animation, the COMMS unread count, the night knock and the lorebook. Run it on a campaign created with P1's wizard that has at least three named units whose cards have sprite folders, with a mechanic connection profile selected (SYS).

**Status: not run yet.** The project owner runs the list below, ticks every line and fills in the header.

- SillyTavern version: `____`
- Browser: `____`
- Alius commit: `____`
- Main model / mechanic profile (provider / model): `____`

## Automated coverage of `docs/packages/P3-scenes-relationships-memory.md` acceptance criteria

| # | Criterion | Tests |
|---|---|---|
| 1 | A private scene runs end to end (free text, replies, intents, sprites, summary, slot) | `tests/scene/sceneController.test.ts` › *private scene › runs end to end…*, *a failed send changes nothing…*; `tests/app-scene.test.ts` › *talk opens the location picker and starts a scene* |
| 2 | A group scene activates only its members in ST | `tests/scene/sceneController.test.ts` › *group scene › activates only its three members and restores everyone at the end*; `tests/ui/scene.test.ts` › *a group scene places three sprites left/center/right* |
| 3 | The same `decision_violated` moves two units with opposite values in opposite directions | `tests/engine/relations/deltas.test.ts` › *decision_violated moves two units with opposite mercy in opposite directions* |
| 4 | Gains diminish within a day and reset next day; losses do not | `tests/engine/relations/apply.test.ts` › *gains diminish within a day and reset the next day; losses do not*; `tests/engine/relations/gain.test.ts` |
| 5 | No proposal-gated state without accept; commander proposals give the right directive | `tests/engine/relations/proposals.test.ts` › *no proposal-gated state is entered without accept*, *commander proposals*; `tests/scene/sceneController.test.ts` › *proposals*; `tests/scene/directives.test.ts` |
| 6 | A secret second romance can be discovered with the specified reaction | `tests/engine/relations/proposals.test.ts` › *second romances*, *discovery*; `tests/engine/scene.test.ts` › *a secret affair can be discovered at scene end* |
| 7 | Facts known only by unit A never appear in unit B's injected context | `tests/scene/context.test.ts` › *a fact known only by A never appears in a scene with B, nor with A and B together*; `tests/engine/memory.test.ts` › *a fact known only by A is invisible to B and to the pair A+B*; `tests/scene/comms.test.ts` (DM context uses the partner only) |
| 8 | DMs work, unit-initiated DMs appear, the unread counter updates | `tests/scene/comms.test.ts`; `tests/engine/dms.test.ts`; `tests/ui/comms.test.ts`; `tests/app-scene.test.ts` › *a unit-initiated DM after an activity updates the COMMS badge* |
| 9 | A night event fires from `lover` and is skipped when the queue is empty | `tests/engine/night.test.ts` › *a lover queues a visit at the day end and the Night slot opens*, *an empty queue skips the Night*; `tests/app-scene.test.ts` › *night_started shows the knock; ignore rolls the day* |
| 10 | Tests for the delta pipeline, hysteresis, every state's entry/exit, retrieval scoring, hostile intent fixtures | `tests/engine/relations/deltas.test.ts`, `bands.test.ts`, `graph.test.ts`; `tests/engine/memory.test.ts`; `tests/llm/intentExtract.test.ts` with `tests/fixtures/intent_extract/` (valid, truncated, prose, four hostile) |

Review-focus cases (see the plan): garbage from the mechanic model (`tests/llm/intentExtract.test.ts`, `tests/engine/relations/intents.test.ts`); a chat switched or ST reloaded mid-scene (`tests/scene/sceneController.test.ts` › *chat switches and reloads*); a swipe after an exchange was applied (› *swipes*); secrets in the context (› *scene context*); a scene ended with every call failing (› *all calls fail…*).

## Install

`npm install && npm test && npm run build` (only after code changes), put the repo into `SillyTavern/public/scripts/extensions/third-party/Alius`, hard-refresh SillyTavern.

## Checklist

- [ ] **1. Talk.** OPS → **Talk** with a named unit (companion picked). A location picker opens: only the locations that exist in the current slot are listed (the roof only in the afternoon, evening and night); `Her quarters` carries the unit's name; you can tick up to two more named units. **Cancel**: the clock does not move and Rest still works. Try again and **Begin**: the scene screen opens.
- [ ] **2. Members.** In the open scene only the chosen units are active in the ST group (check the group panel); after **[END TRANSMISSION]** every living named unit is active again.
- [ ] **3. A real reply.** Type in `CMD>` and press Enter: the input is disabled while the group answers, then the reply appears in the transcript with `NAME //` in front; `*emphasis*` shows as highlighted text; typing is animated (SYS › *Typing speed*; `0` = instant). Your message is in the real ST chat and the reply came from the group's normal generation (preset, lorebook and card text applied).
- [ ] **4. Hostile text.** Send a message containing `a | b`, `{{user}}`, `{{getvar::x}}`, `{: /echo hi :}`, a leading `/` and, as separate messages, one that starts with `name=Bob is here` and one with `return=object x`: each arrives in the chat as typed (no command runs, no macro is expanded, no second message is sent).
- [ ] **5. Sprites.** With *Sprite mode* = Native Expressions the speaker's sprite follows the Expressions extension (a unit without sprites shows her avatar thumbnail); with *Mechanic emotion pick* the sprite changes after the extraction. In a group scene the three sprites stand left/center/right and the last speaker is brightened.
- [ ] **6. Feedback.** After a warm message a pulse such as `▲ TRUST` appears next to her glyph for about a second (no numbers unless SYS › *Show raw values*). With *Debug mode* on, SYS › debug lists the `intent_extract` call and what it returned.
- [ ] **7. Swipe.** Click `›` (next reply) or `↻` (regenerate): ST generates a new reply; the debug toast says the previous extraction was undone and the new one applied; the SQUAD tab shows the relationship moved once, not twice. Send another message and then swipe the *older* reply: nothing is rolled back.
- [ ] **8. Proposals.** Bring a unit to `friend` and Affinity/Attraction above the `date` thresholds (debug state editor), choose `[PROPOSE ▾] → DATE`: her very next reply plays an acceptance, and the SQUAD tab shows `FLIRTING`. With low Attraction the reply is a refusal that names no numbers. With another unit already `lover`, the proposal asks `[OPENLY] [SECRETLY]`.
- [ ] **9. Romance off.** SYS → *Romance* off: the PROPOSE menu has no romantic kinds, SQUAD shows no ATTRACTION, no romantic DM or night visit appears; a scene prompt contains `Romance is disabled` (debug: injected directives).
- [ ] **10. End.** **[END TRANSMISSION]**: the slot advances; LOG shows a new line `DAY … // MORNING` with a one-sentence summary; a fact from the scene is not visible in a scene with a unit who was absent (check the injected context in debug).
- [ ] **11. Pacing and cut-in.** After 30 exchanges (or lower *Scene pacing* to 5) the banner `TIME IS PASSING` appears. A major event (extreme insult, a new relationship state) flashes a cut-in for under a second.
- [ ] **12. DMs.** COMMS lists named units only. Send a message: she answers in one to three short sentences; the relationship changes (cheap extraction). Send seven messages in a day: the fifth and sixth are snapped at, the seventh gets no answer and no model call (check the debug log). After a few slot changes a unit writes first and the COMMS tab shows a count that clears when you open the thread.
- [ ] **13. Night.** Make a unit `lover` (debug state editor) and spend an Evening a few times: a knock screen `[OPEN] [IGNORE]` appears in the Night slot. **Open** starts a night scene at the commander's quarters; the unit's opening line follows the knock framing. **Ignore** costs a little Affinity and the day rolls over.
- [ ] **14. Reload and chat switch.** Reload the page in the middle of a scene: Alius returns to the scene screen with the transcript, the members and the directives restored. Switch chats while a reply or a summary is being generated: nothing from it lands in the other chat.
- [ ] **15. Chronicle.** Play two days with a few scenes: LOG shows scene lines, then a day entry replaces the previous day's scene lines (written by the mechanic model, or joined lines when there is no profile).
- [ ] **16. Lorebook.** The world-info book installed by P1 is untouched (same entries, nothing added or removed by scenes).
