# P16c — Service Mini-games

**Status: spec (stub).** Release 0.2, after P16b. **Depends on:** P16b (the disciplines, fiction time, records, lessons, the posture game, the drills), P10e chunk (e) (the instrument pattern, normative prototypes), P15a, P16. **Read:** overview; P16b (its **Rulings of the planning session** and, once built, **Implemented as**); `docs/prototypes/README.md`; `docs/content/lore.md` (§0).

Origin: the P16b planning session of 2026-11-27 (author, ruling 1): these games were specified in P16b §6, §8, §9 and P16 §R.2 and moved here so that each is designed with the author as a live prototype first (`npm run proto`), then ported with its `fidelity.json`. Every new scene surface follows the scene's style (P16b ruling 2).

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
