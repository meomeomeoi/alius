# Worship customs (design ideas, 2026-11-25)

**Status:** ideas chosen by the author in the design session of 2026-11-25; **specified as P17g** (`docs/packages/P17g-worship-customs.md`, which wins where they differ). Each idea below says what already exists (so nothing is built twice), what is new, and how it lives with the planned mechanics. Whichever package takes one (P16b, P17a–P17f or a new one) designs it in depth, writes its memory check and keeps these boundaries.

**What "worship" means here (author):** worship of the commander toward her, in any form, one to one. Not a royal court, not a retinue of other soldiers: the others are at most witnesses. The `regal` style is the holder who wants it most, but any holder may grow customs of worship. Her haughtiness varies through P15b's manner axes (gracious, condescending, haughty, hungry for adoration), not through a new number.

**Dropped after checking (no new link):** named worship postures (P16's named postures and P16b's preset tags already do it; the only new link would be letting `regal` name postures, a one-line change of P16's gate, which today allows only `ritual` or `household_protocol`); the pedestal (the `weight` instrument and P17's staged scenes already do it); worship she does not notice (her activity's frame with presence `own` / `use` already does it). "Degrees of condescension" (she grants nearness step by step) was rejected: she already uses the commander's body and the commander touches hers.

## 1. Chosen ideas

### 1.1 Praise with memory
- **Exists:** P16b `regal`'s daily praise in the commander's own words, with repeats rejected (a local similarity check).
- **New:** praise weighs by **what it is about**. Praise that names something true of her, read through `Knowledge` (her kills in the last run, her hobby's project, her new scar, what she said yesterday), counts more than general praise. Praise of something that did not happen is seen through, more or less by her curiosity and manner. Her favourite lines are kept as facts and quoted back later.
- **With:** the devotion journal (§1.8) is the same mechanic in writing.

### 1.2 The shrine map (a layer over the body map)
- **Exists:** P15 §15.9's body map (zones from `worshipTargets`, in her dossier); P16b's mastery per worship target (level 2 reveals a zone); P17e's emergent rituals (a practice repeated and well received becomes a ritual with a time, a streak, a cost, and fades when neglected).
- **New:** a zone has a **shrine state**: ordinary → known (mastery) → favoured → **consecrated**.
  - A consecrated zone changes what touching it means: a careless touch outside worship is noticed as an offence of hers.
  - The body map shows consecrated zones with her mark.
  - Her expectation of it ("greet me here") does not get its own machinery: it is one of P17e's rituals.
- **Pacing:** a zone's shrine state rises at most once a scene, and only from her verdict.

### 1.3 Relics
- **Exists:** P17d's worn things (socks, gloves, insoles, the training shirt, wraps) carry her scent, fading over days, and are given as a gift, a reward or a task ("keep it on you", "sleep with it"); P17b's socks day and the pillow.
- **New:**
  - **Kinds:** worn **footwear** and **underwear** (underwear only with its category on) join P17d's kinds.
  - **Consecration:** a relic is not a gift but a thing handed over in a small rite (a first moment); after it, mistreating it is her offence.
  - **Worship of a relic alone:** the `saturation` instrument in a new mode. A thing instead of her body, the same vocabulary and the same head of words; her places are the thing's places.
  - **Her check:** how the commander kept it. Washing it is the sin here.
  - **Found:** an inspection of the commander's quarters (P17a) turns a relic into compromat.

### 1.4 Rites anchored to events, and worship in her absence
- **Exists:** P17e's emergent rituals (a time, a streak, a cost, fading).
- **New:**
  - **An event anchor** besides a time: her return from a run (the commander waits in the garage, takes her boots off with the existing `taking_off_boots`, washes her feet; the dirt is her run's region, the "dirt of her day" reader of P10e chunk (e)), her waking, her going to bed.
  - **Worship in her absence:** her bed, her boots by the door, while she is on a run. It needs access to her quarters (P9c), and she learns of it afterwards from traces, a moved thing or a note (P10b notes).
- **Pacing (author: nothing twenty times in half an hour):**
  - one rite per anchor event;
  - at most N offered rites a fiction day;
  - a rite done today is not offered again;
  - rites come up at slot boundaries, never on every exchange.

### 1.5 Traces
- **Exists:** P17d's scent that stays in rooms.
- **New:** **visible traces as plan marks** (P10d `registerPlanMarks`) for a few hours: where she sat, a footprint with her day's dirt, her lips on a glass, her hair on the pillow. A **worship act toward a trace** is a short scene or a chip in that room.
- **Pacing:** marks are derived from her whereabouts and activities, with no rng and no store, so they never pile up.

### 1.6 Accepting worship, in her body
- **Exists:** P15's offer composer answers with chips (accepted / corrected / mocked / refused / tonight); P16b's foot language is her asking.
- **New:** her answer to an unasked act of worship is **her body's gesture** inside the instrument instead of a chip: she presents her foot, draws it away, holds it there, corrects it, the picture moving as in foot service. Her haughtiness shows in how she accepts, not in words.

### 1.7 The shrine of her defect
- **Lore:** the squad are off-spec units; the corporation calls them defective.
- **New:** the commander worships what the corporation calls her defect: a scar, an implant port, a Bloom mark, a glitch, read from her defects. It reaches:
  - her stress and her defect's breakdowns (P8 / P6);
  - how she sees herself (P14b's development);
  - Regard.
- Nothing else in the game links worship to the lore's core.

### 1.8 Her token on a run
- **New:** before a run she marks the commander: a kiss, a thing of hers, her scent.
  - On the run the token steadies the commander (commander stress, P7).
  - Going out without it, once the habit has formed, is anxiety before the fight.
- It is the first link between combat and worship.

### 1.9 The vow of exclusivity
- **New:** the commander vows to serve and worship only her. Breaking it is a sacrilege with heavy consequences; the squad's interactions and P9c's courtship and `claimed` are what can break it.
- It can be P15's vow milestone in this form.

## 2. Not all at once, and not all in every dynamic (approved in principle by the author, 2026-11-25)

The author's concern: these customs must not fall on the player at once, and not every dynamic should grow all of them. The author's hint: through what is liked at squad creation.

**The approach (approved; details to the package that builds it):**
1. **The campaign** (WORLD PARAMETERS › DYNAMIC, at creation and in SYS): which customs exist at all, as a list of toggles like the content categories, plus a density (`few` / `normal` / `many`).
2. **Her customs** are derived from her profile, **through what already exists, never a new field** (author, 2026-11-25):
   - her attitude to each category is P15's `bond.practice.categories[id].as` / `witness` (`watersports` included), read only through `practiceOf` (it folds in what the campaign switched off and her own limits);
   - its drift is P14b's development: the axis kinds `practice` and `expect` that P15 added, the weekly review, and P15b's manner axes. A custom follows her attitude as it drifts. When she stops enjoying a category, the custom that needs it fades as a neglected one does.

   Each custom declares what it needs:
   - categories with her `as` at `enjoys` or `craves` (P15 `bond.practice.categories`);
   - a style or manner axes, an `audience`, a trait;
   - for the shrine of her defect, a defect of hers.

   From those that fit, a stable pick (`dynamicHash`, no rng) keeps **at most K active customs**. **K is a setting** (author, 2026-11-25) per frame, defaults `play` 1, `role` 2, `rule` 3; the density scales the defaults. Two holders therefore grow different customs. Her dossier's PRACTICE block shows hers and, while the edit lock allows it, lets the player swap one, as with the other profile fields.
3. **Pacing:**
   - a new custom appears at most once a fiction week, through a first moment where she does it for the first time (P14c first moments, P15a moments), not a tutorial;
   - its rule is explained by the analysis tool after it first happened;
   - customs can also be tied to milestones, so they come with the arc.
4. **They live and die:** a neglected custom fades (P17e) and frees its place, and a new one may come later, so the dynamic changes over months.
