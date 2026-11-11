# P5 — acceptance checklist

Automated coverage per acceptance criterion (all in `npm test`), then the steps that must be done by hand inside SillyTavern.

## Automated
1. **Map shows regions (image or ASCII), missions per region, clocks:** `tests/ui/map.test.ts` (ASCII grid, `NO SIGNAL`, polygons and the image-error fallback, region panel, hidden clocks), `tests/app-world.test.ts` (`the MAP tab is no longer a stub`).
2. **Missions from command, story, rumor and side sources; deadlines tick; failure effects apply:** `tests/engine/world/missions.test.ts` (board rule, rewards inside tier ranges, deadlines, expiry of removed content), `rumors.test.ts`, `director.test.ts` (fallback offers a command mission every third day), `tests/ui/ops.test.ts` (board and RUMOR MILL), `tests/app-world.test.ts` (`ending the day requests the director…`, `scout_net posts rumors…`, toasts).
3. **An expedition from planner to return works with combat, event, cache, rest and objective nodes; retreat works; loot banked:** `tests/engine/world/expedition.test.ts`, `expeditionNodes.test.ts`, `expeditionEnd.test.ts`, `tests/ui/expedition.test.ts`, `tests/app-world.test.ts` (`planning from MAP and departing…`, `a combat node opens the combat screen…`, `a full run to RETURN…`, `retreat returns to the PDA…`, `reload mid-expedition…`, `reload with a finished fight…`).
4. **After-action report from the structured log; P3 intents from the expedition applied:** `expeditionEnd.test.ts` (`the report lists the path, fights, loot, injuries and deaths`, `protected and endangered hints…`, `fourteen hints are applied in three batches`, `event unit_event intents with value axes…`), `tests/llm/expeditionRecap.test.ts`, `tests/world/expeditionController.test.ts` (recap, debrief).
5. **Director output with invalid ids/amounts never mutates state; spine beats fire only when conditions hold; open-ended phase continues:** `tests/engine/world/director.test.ts` (validation, `invalid output never mutates state`, `thirty days of fallback-only play reach the open-ended phase…`), `spine.test.ts`, `tests/llm/directorTick.test.ts` (hostile fixtures `hostile_ids`, `hostile_amounts`, `hostile_flood`).
6. **Clearance tier raises the level cap:** `tests/engine/progression.test.ts` (`clearance 1 from beat_1 raises levelCap from 10 to 20…`), `spine.test.ts`.
7. **Node map generation (seeded), digest builder, director validation, clocks, deadlines:** `nodeMap.test.ts` (300 seeds per region), `digest.test.ts`, `director.test.ts`, `clocks.test.ts`, `missions.test.ts`.
8. **Review focus:** reload or chat switch mid-run (`expeditionNodes.test.ts` `expedition round-trips through JSON mid-node`, `app-world.test.ts`), a party that cannot go on (`a win with nobody standing forces a retreat`), a late/repeated/missing director answer (`apply needs the open request id`, `a second apply…`, `an unanswered request is answered by the fallback…`, `tests/world/directorController.test.ts`), content changed under a save (`mission whose template was removed expires…`, `a node type removed from the pack…`), slots and supplies at the edges (`start is refused in the Evening…`, `returning through the Evening runs the day end exactly once…`, `rest without supplies…`).

## In SillyTavern
- [ ] Load a campaign saved before P5: the MAP tab shows regions, clocks exist (OPS/MAP), nothing breaks.
- [ ] **Director with a mechanic profile:** end a day; SYS › debug shows one `director_tick` call; the board and RUMOR MILL fill, a story beat is proposed on day 1. A rejected part (debug on) is listed in a toast.
- [ ] **Director off** (SYS › World): end a day; no `director_tick` call is made and the world still moves (a command mission appears every third day, rumors, clocks, spine beats).
- [ ] **No mechanic profile** and fallback-to-main off: the same, without errors.
- [ ] `scout_net` activity: a rumor appears; `[ FOLLOW ]` on a mission rumor puts a scouted mission on the board.
- [ ] **A full expedition by mouse:** MAP → region → `[ PLAN ]` (or OPS board) → pick units and rows, supplies → `[ DEPART ]` → walk the map (cache, rest, event, fight) → objective → `[ RETURN TO BASE ]` → the after-action report. Check: slots spent on return, loot banked only then, mission paid once.
- [ ] A **crisis node** (danger ≥ 3 regions): pick a cover unit, fight, the commander is exposed.
- [ ] **Easy retry** (SYS) inside an expedition: lose a fight, `[RETRY]`, the run continues from the same node.
- [ ] **Retreat** from a node: confirm text appears, loot is lost, the mission is back on the board, the report shows `RETREATED`.
- [ ] **Recap text:** with the setting on the report shows `COMPILING…` and then the main model's paragraph (plain text); with it off only the deterministic lines.
- [ ] **Debrief:** `[ DEBRIEF ]` with up to three named units opens a free scene in the garage; it is hidden at night.
- [ ] **Intake of a real card:** after beat 3 `INTAKE PENDING` appears on OPS; `[ REVIEW ]` lists cards not yet in the squad, calibrates the picked one, adds her to the squad and the group chat; `DECLINE` adds a grunt.
- [ ] **Map image fallback:** without `content/core/map/world.png` (or with a broken file) the ASCII grid is shown; with an image, the hotspots are focusable and selectable by keyboard.
- [ ] **Reload mid-run** (SillyTavern reload on a node, on a fight, on the report): the expedition screen returns at the same node, a finished fight is counted once.
- [ ] **Chat switch** during a director call or a recap: nothing leaks into the other campaign; the request is answered when the first chat is open again.
- [ ] **Night after a return:** a run that ends in the Night (leave in the Afternoon with a queued night visit) → closing the report shows the knock, not the PDA.
- [ ] **Commander Crisis in a run:** lose the cover unit at a crisis node; later nights bring the expected visits from lovers/devoted units.
- [ ] **Leash:** let the `oversight` clock fill (fail command missions): a toast announces the lost authorization and the header counter drops.
- [ ] **Beat cooldown:** change the setting in SYS › World; with the director off the story still moves at the new pace.
- [ ] Switching away to another tab while an expedition is open: activities and scenes are refused with the "expedition is under way" message.
