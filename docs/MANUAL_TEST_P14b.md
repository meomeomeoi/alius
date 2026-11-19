# Manual test — P14b character development (in SillyTavern)

Run in a fresh campaign with the CHARACTER DEVELOPMENT select on NORMAL (the default). Four soldiers, at least one imported with a caretaker bond.
Everything below is quiet: you should never see a toast, a cut-in or a chip for development.

1. **A week of witnessed punishments.** In a scene with two or more soldiers present, punish one of them from the dialogue ("you are confined to quarters"). Do it on three different days. The caretaker who watched should show no change yet: accumulators never move a profile field on their own.
2. **The weekly review.** After seven days, with at least three experiences behind her, play on (any action). One review runs per settled action; check SYS › GENERATIONS: a failed review writes a quiet record, a good one writes nothing.
3. **The cue in the next scene.** Open a scene with the soldier whose review stepped something (a value, a bond field, a like). The main model should play the change without announcing it. There is no on-screen notice.
4. **The dossier line after.** End that scene. Open SQUAD › the soldier › DEVELOPMENT. The change and the lines the review wrote appear now, in words, with no number. Before the scene they must not be there.
5. **REROLL is refused after.** Before step 3, the review can be rerolled (GENERATIONS). After the scene it must say "She has already shown it."
6. **HOLD.** Turn the mechanics edit lock off (SYS). In DEVELOPMENT press HOLD on one axis: it stays as it is through the next reviews. With the edit lock on, HOLD, EDIT and REMOVE are greyed out (still analyzable).
7. **Edit and remove a line.** With the edit lock off: EDIT a line (it gets an EDITED chip and is never pushed out), REMOVE another.
8. **Habits.** Train with the same companion until a habit forms (eight times for the draft drills habit). A line appears in DEVELOPMENT after the next scene she is in; training with her then gives a little more XP. With SYS › habit wording on, the line is reworded by the model.
9. **Re-sync.** SQUAD › RE-SYNC FROM CARD: re-importing values keeps what she became (DEVELOPMENT is unchanged); ticking "Reset development" forgets it.
10. **An old save stays off.** Open a campaign made before P14b: SYS › Character development reads OFF and nothing is recorded until you turn it on.

Report anything that shows a toast, a number from the accumulators, an unshown line, or a pronoun for the commander.
