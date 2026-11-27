# P16c — Service Mini-games

**Status: spec (stub).** Release 0.2, after P16b. **Depends on:** P16b (the disciplines, fiction time, records, lessons, the posture game, the drills), P10e chunk (e) (the instrument pattern, normative prototypes), P15a, P16. **Read:** overview; P16b (its **Rulings of the planning session** and, once built, **Implemented as**); `docs/prototypes/README.md`; `docs/content/lore.md` (§0).

Origin: the P16b planning session of 2026-11-27 (author, ruling 1): these games were specified in P16b §6, §8, §9 and P16 §R.2 and moved here so that each is designed with the author as a live prototype first (`npm run proto`), then ported with its `fidelity.json`. Every new scene surface follows the scene's style (P16b ruling 2).

## Author's rulings so far (2026-11-27, before the plan; the plan's "Rulings of the planning session" takes them over)

1. **Each game is built together with its stage setup (author).** A game's port comes in the same chunk as its setup in the extension (P10e chunk (f), SYS › STAGE): its art slots enter `SLOT_KEYS` / `SLOT_INFO`, its prototype's fit panel is ported into `src/ui/stage/fit/` (declared in `src/ui/stage/fidelity.json`), its zones use the ported marker, and CHECK runs it on a `demo.ts` builder. A game is not finished while its art cannot be loaded, fitted, marked and checked in SYS › STAGE.
2. **Foot care: where (author: A).** The commander holds her foot up, sole to the face (art slot `held_sole`: one foot, the other mirrored; the leg fades out at the bottom; optional `held_sole.curled`, the same picture with the toes curled, an inpaint); she sits back on her bunk, her sprite behind the foot to one side; her face (her expression sprites) is a tell.
3. **Foot care: steps.** Round 1 starts barefoot (massage with her tempo, then cream); taking off her footwear waits for a matched pair of pictures (`held_sole.shod`, the footwear inpainted over the bare picture) so the shoe can slide off over the bare foot.
4. **Her faces in a prototype** are matched by the label a file name begins with (`admiration0003.png`, `joy-2.webp`), several per label allowed; the change of face may crossfade (optional, its length a setting).

## What moved here

1. **Tempo** (P16b §6.2): massage, foot care, licking; keep her tempo, judged only by her tells (her expectation profile's "how").
2. **Balance** (§6.3): her thing or a tray in the hands, a load on the back or the head; keep a marker centred while she pulls and pushes.
3. **Order from memory** (§6.4): her routine said once, repeated later in order.
4. **Patience** (§6.6): nothing happens; do not press "call her"; the fiction time grows.
5. **The edge** (§6.7, `denial` only): a bar rises with her actions; keep it under a line with breath and focus inputs.
6. **Reading her** (§6.8): choose the next act from her tells alone.
7. **The escape from the sparring hold** (§9): timing against her grip, the commander's strength and `stillness` (P16b builds the hold itself with the tap as the way out).
8. **The interactive strokes** (P16 §R.2): implement × target × posture, the flinch impulse on posture points, the count aloud, rules of conduct, marks by implement and `her_marks`.
9. **The further steps of foot care** (P16b §8): unlacing, massage, drying, nails, cream, each judged against her expectation profile; the gestures for kneel / go / look at me in her foot language.
10. **`ticklish`** (P16b §6.1), an optional COMMANDER FILE detail, if stillness under provocation wants it.

Each game maps to a P16b discipline, can be switched off in SYS › Scene and reads its numbers from the engine (P15b `bendRow` where it has a style row). Plan: to be written after P16b is implemented.

## Interfaces already provided by P16b (implemented — use, do not rebuild)

P16b (service as a craft) is implemented; see its **Implemented as** in `docs/packages/P16b-service-craft.md` (rulings as built, memory check, deviations, open items). Everything it adds is off, absent and byte-identical while no holder is craft-live (`craftLive` = `practiceLive`; unasked care has `careOpen`), and none of it draws from the rng (`craftRoll`, a hash, an index into a registry-ordered list). Keep new directive ids away from `craft:`; read presets, contacts, care rows, echoes and booking kinds by field, never by id; hooks you register must keep a campaign with no craft byte-identical (`tests/craft/unaffected.test.ts`); no text gives the commander a pronoun or a feeling.

- **The book:** `addCraftXp(draft, reg, key, xp, cause)` is the one writer of a discipline's xp (`craft_xp`, `craft_level`); `craftLevel` / `craftCapacity` read it (`pain` and `posture` add the P7 body route; `posture` is the only discipline whose capacity has a reader today); `Commander.craft` holds `rhythm`, `memory`, `composure`, `speech`, `pain` and `depth`, which have no consumer beyond CMDR › CRAFT: the games and strokes here are theirs. Drills (`drill_stillness`, `drill_recitation`, `drill_rhythm`, `drill_posture`, and the partner drills of breath, weight and posture) are `train` foci with a `drill: { key, partner? }` field; a new game adds its focus the same way and a `craftLessons` row (read by `slip` / `kind` / `interaction`) so a slip can teach.
- **Fiction time and records:** `fictionSeconds(physicsId, beats, level)` over `TUNING.craft.beatSeconds`, `noteRun` / `setRecord` (`record_set`, `Relation.craft.records`); a new game that holds counts beats and gets records, `drill` norms and the CRAFT margin for free.
- **A game with a hold of its own** follows the posture game's pattern: `registerPostureInstrument` / `PostureInstrumentDef` (`src/ui/scene/instruments/host.ts`, mounted beside the physics instruments, no `physics_outcome`), reports through `PhysicsPanelStaging` (`postureCorrect`, `postureSlip`, `postureEnd`, `signal`) to engine actions that judge, a toggle in `INTERACTION_TOGGLES` (`posture`, `provocation` are not physics interactions), a `fidelity.json` of its prototype. `startPostureHold` / `endPosture` / `PostureRun` are the hold; `physics/relief` has the kinds `react` (a reaction she always feels) and `endure` (a stimulus let go by pays `stillness`).
- **The escape from the sparring hold** goes inside the existing hold: the contact is the `blockingContacts` row with `headlock: true`, `Relation.craft.headlock` waits for the day, `craft/headlock_start` stages it and starts its physics, the tap is the way out, `registerAfterBout` offers it after a won bout (`headlockWished` decides by her expectation), the witnesses are charged in `noteHeadlockOutcome`.
- **Foot care:** `feetOfDay(state, reg, unitId)` (derived: `fresh`, `worn`, `hot`, `sore`, `bare`), `Relation.craft.footCare` (a pleased foot or shoe service, since her last run) and `careOfFeet` (±3 % in her next run); her foot language is `signalsOf` plus `Relation.craft.signals` (named once, `foot_signal_given`; answered trains `memory`; missed is `foot_signal_missed` and a slip that waits for her discipline) reported through `PhysicsPanelStaging.signal` → `physics/service { runId, signal }` → `registerServiceReport`. The gestures for kneel / go / look at me, and the further steps of care, are yours; the foot service's instrument re-names each signal each session (open item).
- **`ticklish`:** the provocation game (`activity/provocation.ts`, `attachProvocation`) reads a stillness level and a ticklish multiplier of 1; `provocationOpen` is its gate.
- **Hidden:** xp, drift rates, the settling-in count (kept for physics holds too, read by nothing yet: `settlingDue` acts only on posture holds), the lesson word before she says it, an unnamed signal; read through `Knowledge.craft`.
