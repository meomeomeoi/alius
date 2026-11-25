# Prototype assets

- `breath-in-out.mp3` — "in-out-breath", freesound.org sound 813664 by `sounds_fab`, CC0 (licence as given by the author when adding it, 2026-11-23). One nose inhale (0.12–1.44 s) and one exhale (2.17–3.23 s); the prototypes stretch the inhale by granular playback of its middle (0.42–0.95 s).
- `ha/` — the sounds of `her_activity.html` (2026-11-23), every one CC0 (Creative Commons Zero, http://creativecommons.org/publicdomain/zero/1.0/), converted to mono Ogg Vorbis and trimmed:
  - Kenney Vleugels (kenney.nl), **RPG Audio**: `book_open`, `book_close`, `book_place`, `sheet1–3` (bookFlip), `cloth1–4`, `creak1–3`, `door_open`, `door_close1–2`, `metal_click`, `metal_latch`, `belt`.
  - Kenney, **Casino Audio**: `card_shuffle`, `card_slide1–2`, `card_place1–2`, `card_fan`, `chips1–2`.
  - Kenney, **Impact Sounds**: `step_c0–4` (footstep_concrete), `step_w0–2` (footstep_wood), `metal_light`, `glass1–2`, `mug1–2` (impactPlate_light), `wood1–2`, `knock` (impactWood_medium), `soft1–2`, `bell` (impactBell_heavy).
  - Kenney, **Interface Sounds**: `pda_ok` (confirmation), `pda_msg` (question), `pda_call` (bong), `click`, `lamp` (switch).
  - OpenGameArt.org: `page1–6` ("10 book page flips", StarNinjas), `pencil_write`, `pencil_erase` ("Pencil sounds"), `typing1–2`, `key1–2` ("Keyboard soundpack 1", Unicae Games), `rain` ("amb rain loop 1", Kresiek The Furry; 20 s from 10 s), `crowd` ("Crowd shouting/speaking ambience"; 14 s from 4 s), `pour` (water_flowing, "30 CC0 SFX loops", rubberduck).
- `slap/` — the sounds of `slap.html` (2026-11-24), every one CC0 (Creative Commons Zero) as stated on its OpenGameArt.org page, cut to one hit, peak-normalised, mono Ogg Vorbis:
  - `slap`: "Thwack Sounds" (Jordan Irwin, AntumDeluge), `thwack-01` (the author's pick by ear among six candidates).
  - `swish1–3`: "Swishes Sound Pack" (for Summoning Wars), `swish-10`, `swish-12`, `swish-9`.
  - `slap.html` also plays `ha/cloth1–4` (her clothes) and `breath-in-out.mp3` (the commander's breath).
- `gulp/` — the sounds of `gulp.html` (2026-11-25), the author's choice:
  - `mug_soft`, `mug_strong`: "Pouring water in mug in sink" by earthcalling, **public domain**, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Pouring_water_in_mug_in_sink.ogg; brought by the author): the soft pour (3.45–7.05 s) and the strong one (13.2–17.9 s), each made a seamless loop (its end crossfaded into its start over 0.45 s), loudness-normalised.
  - `swallow1–5`: "Liquid Bottle Drink Set" (qubodup, OpenGameArt.org), CC0, `swallow-01–05`.
  - `splash_10`, `splash_09`, `splash_06`: "40 CC0 water / splash / slime SFX" (OpenGameArt.org), CC0.
  - `gulp.html` also plays `ha/pour.ogg`, `ha/cloth1–3` and `breath-in-out.mp3`.

## `hands/` (moved, 2026-11-25)

The 42 candidate and strict print hands (Google Fonts, the latin subset as Google serves it, woff2) went into the game whole (author, 2026-11-25): P10e-e Task 2 moved them to `fonts/hand-<name>-400.woff2` with their licences in `fonts/LICENSES/hand-<name>.txt` (SIL Open Font License 1.1, except Rock Salt, Permanent Marker, Just Another Hand, Homemade Apple, Satisfy and Yellowtail: Apache License 2.0). `cards.html` reads them from there.
