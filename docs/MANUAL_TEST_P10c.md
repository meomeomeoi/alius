# P10c — acceptance checklist

Automated coverage first (all in `npm test`), then the steps that must be done by hand inside SillyTavern. The automated tests run in jsdom: they cannot judge how a background *looks* behind the text, how the pan feels or whether the light of the slot reads as evening or night; those are the manual lines.

## Automated
1. **Every file a registry names exists, is WebP, 3072×1280 when opaque, keeps its alpha when a frame; nothing unreferenced ships; the incoming folder is gone:** `tests/content/backdrops.test.ts`.
2. **Slot to file, her room style first, the hashed default, `squad/set_quarters` (no rng, allowed during a run):** `tests/engine/backdrops.test.ts`.
3. **Full-bleed image, the slot light, the fallback chain to the ASCII stage with no error, no reload on a redraw, the pan and reduced motion:** `tests/ui/sceneBackdrop.test.ts`, `tests/ui/scene.test.ts`.
4. **QUARTERS select (registry order, current style, `data-analyze`), the glossary entry, her room in the scene header:** `tests/ui/squad.test.ts`, `tests/content/glossaryCore.test.ts`, `tests/scene/context.test.ts`.
5. **Project rules:** `tests/assets.test.ts` (nothing from the network), `tests/ui/analyzeCoverage.test.ts`, `tests/architecture.test.ts`, `tests/content/pronouns.test.ts`.
6. **Old saves:** `Unit.quarters` is optional; a save without it gets the hashed default.

## In SillyTavern
Note the SillyTavern version, the browser and the window sizes at the top of your report. Run the lines at 1920×1080, at 2560×1440 if you have it, and in a narrow window (about 400 px).

- [ ] **Every location.** Start a scene in each place (mess hall, medbay, workshop, garage, comms, training yard, roof, perimeter, the commander's quarters, a soldier's quarters). The picture fills the scene behind the header, the sprite and the transcript; the top and bottom are darkened; the transcript sits on a dark translucent panel. **Judge legibility on the brightest ones** (roof by day, the gilded quarters, the medbay) on all three palettes (amber, green, white) and in readable mode (the panel is near-opaque, no blur).
- [ ] **Time of day.** Roof and perimeter in the evening and at night show their own pictures (sunset, stars) with no extra tint; the training yard in the evening shows its floodlit picture. Indoor places in the evening are slightly warmer and dimmer; at night clearly darker and warm. Judge whether the night tint is too dark or not dark enough.
- [ ] **Pan.** Move the pointer from the left edge to the right: the picture glides over its extra width (about a quarter of it at 16:9) and follows with a short delay. With `Reduce motion` on, it stays centred and does not move.
- [ ] **Quarters.** Two soldiers have different rooms (the default comes from the name). SQUAD › a soldier › QUARTERS: pick another room; her next quarters scene shows it, and the choice survives a reload. Read the first reply of the model in her quarters: it should fit the room (the scene header now tells the model what it looks like).
- [ ] **A broken file.** Rename one file in `content/core/art/backdrops/` (for example `loc_roof_night.webp`) and start a night scene on the roof: the day picture shows with the night tint, no toast, no error. Rename the day file too: the old ASCII stage shows. Rename them back.
- [ ] **Narrow window.** At about 400 px the picture still covers the scene (cropped at the sides), the transcript and the input stay usable.
- [ ] **Weight.** The extension folder grew by about 7 MB, and the first scene in a new place shows its picture without a visible delay (DevTools › Network: one request per picture, from the extension folder).
