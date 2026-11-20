# P10d — acceptance checklist

Automated coverage first (all in `npm test`), then the steps that must be done by hand inside SillyTavern. The automated tests run in jsdom: they cannot judge how the plan *looks* at a real size, whether the labels read, how the night light feels or how the plan scrolls on a phone; those are the manual lines.

## Automated
1. **The plan as data** (schema, doors on edges, refs, every hub room on the plan, closed rooms do not overlap, a commander cabin): `tests/content/planRooms.test.ts`, `tests/content/core.test.ts`, `tests/content/hubSchemas.test.ts`.
2. **Cabins, persons, lit rooms, the door graph, plan marks** (no rng, no state; the first ten named soldiers never move, grunts take the free cabins): `tests/engine/basePlan.test.ts`.
3. **Drawing** (walls of a union with no wall across a junction, furniture inside its room, cabin variants, site, floors, roofs): `tests/ui/planDraw.test.ts`.
4. **The stage** (floors, buttons with counts, staircases, PageUp / PageDown, labels as buttons, closed rooms, named and vacant cabins, a cabin's panel, TALK in her quarters, the commander's cabin, light, marks, coverage on every floor): `tests/ui/planView.test.ts`, `tests/ui/hub.test.ts`, `tests/ui/notes.test.ts`, `tests/app-hub.test.ts`, `tests/ui/analyzeCoverage.test.ts`.
5. **Old saves:** no state field was added.

## In SillyTavern
Note the SillyTavern version, the browser and the window sizes at the top of your report. Run the lines at 1920×1080, at 1280×800 and in a narrow window (about 400 px).

- [ ] **The ground floor.** The hub opens on the plan: the compound (fence, four towers, the gate, roads, the vegetable beds, the water tower), the building with its corridors, the yard and the garage. Every room is labelled; the rooms the game does not have yet are dark and hatched. Soldiers' markers sit in the rooms whereabouts says. **Judge whether the labels read at your window size** on all three palettes and in readable mode.
- [ ] **Floors.** 1F / 2F / ROOF switch the plan; the floor below ghosts through. Each button says how many soldiers are on that floor. Click `↑ 2F` on a staircase: the upper floor shows; on the upper floor the back stairs say `↑ ROOF`. PageUp and PageDown change floors too (not while typing in a field). The floor stays when the hub redraws (end a slot with the device down).
- [ ] **Cabins.** On the upper floor every soldier's cabin carries her name, scattered over the floor; the others read VACANT. At night (or when one is confined) she is drawn in her own cabin. Click her cabin: the panel is hers (`ANN'S CABIN`), lists only her, TALK opens a scene in her quarters with her room's background (P10c). The commander's cabin (CMDR, with a lock) has the quarters notes and the quarters' activities. A cabin's furniture follows her room style (a tatami futon, a big bed with a gilded headboard, a dark cabin).
- [ ] **Light.** Evening: occupied rooms glow faintly. Night: everything dims, occupied rooms and the commander's cabin glow, red emergency lights blink along the corridors (never inside a doorway, never through a wall), the towers throw floodlights. With `Reduce motion` on nothing blinks.
- [ ] **The roof.** ROOF shows the high roof over the upper floor and the lower roofs (corrugated over the gym and the garage), the canopy over the hatch with the smoking spot, the antenna with its red light over comms. The roof's room opens its panel; `↓ 2F` goes down.
- [ ] **Narrow window.** At about 400 px the plan keeps its proportions and scrolls sideways inside its frame; the floor buttons stay in view; a room panel fills the frame and can be closed.
- [ ] **Old save.** Load a save from before P10d: the hub draws the plan, cabins are handed out, nothing else changes.
