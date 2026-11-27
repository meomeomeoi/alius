# P17b — Hard Practices: New Categories, Service and Humiliation in Depth

**Status: spec.** Release 0.2 (post-release), after P17a. **Depends on:** P15a (blocking, moments, contact physics), P15, P16, P17, P17a, P4 (combat orders), P7 (commander body stats, crime, quiet night), P9b (rations, hierarchy), P3b (memory), P3 (chat history), P14, P7a. **Read:** overview; P15; P16; P17; P17a; this file; `docs/content/lore.md`.

**Analysis tool (P7a)** and **P14** rules as in P15. **Address:** she always speaks to the commander as "you" (author ruling: no third person, also inside objectification); no pronoun for the commander anywhere. Scene text, including bodily detail, is written by the main model; the engine sets the frame and owns the consequences.

## Goal

The harder end of the dynamic, for players who enable it: four new content categories, speech control, a shock collar, the cage, gratitude and begging, and service and humiliation built from the real state and history of the campaign.

## 1. New content categories

`contentCategories` gains (off by default, descriptions `AUTHOR TO WRITE`; profile entries per P15 §2):
- `deprivation` — she controls food and sleep;
- `pet_play` — collar, leash, a place at her feet, commands, speech reduced to sounds;
- `objectification` — the commander used and treated as a thing;
- `coercion` — a dynamic entered through blackmail rather than desire.

## 2. Objectification

**Ladder** (track `objectification`, levels unlock steps; P15 §6):
1. **Spoken to as a thing** — always "you", never by name; orders as to an object ("stay", "hold it", "be still").
2. **Static pose** — footrest, armrest, standing by the wall while she works (P17 condition `stillness`/`posture`).
3. **Function** — holding her things, serving as a table, lighting her work.
4. **Not acknowledged** — hours in which she does not treat the commander as a person: no looks, no answers, only use. Heaviest for `cold` and `clinical`.
5. **Before others** — the same with witnesses, who play along or not by their profile (P17a attitudes); they address her, not the commander.
6. **Handed over** — left with an allied holder for an evening as a thing (P17a §1).

**Object time:** a state with a timer (part of a scene to several slots): the player's free text is limited to **actions without speech** (the rule shows above the input; P17c gestures), each exchange moves Strain (pose, stillness, silence), a slip goes to her discipline, the POV directive limits narration to what the commander perceives, and everyone present gets "treat the commander as an object".

**Why she does it, by style:** `cold` (indifference), `clinical` (an endurance test, noted in her journal), `cruel` (mockery before others), `ritual` (a formal place for the object), `affectionate` (a strange intimacy: "you are my thing, and that is tender"), `obsessive` (her thing that nobody else may touch), `drill` (a drill of stillness, timed), `regal` (the furniture of her court, before visitors), `vindictive` (part of the sentence).

**Return to a person:** a ritual in which she acknowledges the commander again: stress relief, favour, sometimes a privilege. Object time without a return accumulates stress and wears Trust: the practice has an arc, not only a cost.

## 3. Speech control

Rules of the commander's speech (rule templates tagged `degrading_language` / `service`): forbidden words, "yes, ma'am" only, silence without permission. The **input shows the rule**; violations are `protocol_slip` → her discipline. (Self-reference in the third person is not offered: author ruling.)

## 4. The shock collar

A discipline module built in the workshop (`pain_rough` or `restraint`): she triggers it on protocol slips or at whim (by style). Effects: commander stress, a short status, P17c's screen glitch. In LEASHSWAP (P13) it merges with the warden's pain bursts.

## 5. Deprivation

She controls the commander's rations (P9b ration modes extended to the commander) and sleep ("eat from my hand", a sleepless night). Effects through the commander's body statuses (P7) and the quiet night; P17c shows them on the interface. Restoring food or sleep is a privilege (P17a).

## 6. Pet play and the cage

- Collar and leash (the word play with the Leash is the author's), a place at her feet, commands; speech reduced to sounds (P17c gag) where she wills it.
- **The cage** (`restraint`, optionally `pet_play`): a place to sleep in her quarters, offered only by holders whose profile fits (style and appetite; author ruling: character-dependent). Nights there are quiet (P7) but cost stress; sleeping outside is a privilege.

## 7. Coercion

A dynamic may **start** from blackmail: a holder-capable unit who learns the truth of the commander's crime (P7 crime details as facts; compromat, P15 §11) offers silence for submission. The P15 dynamic starts at a forced milestone; exit routes (P15 §9) carry the exposure as their cost. Only with `coercion` enabled.

## 8. Serving the squad (a rare outcome)

Public service to the whole squad (mess duty for everyone, gear of each woman), `service` + `public_humiliation`: **never routine** (author ruling) — only as a punishment of the highest severity, an aftermath, or a contract penalty, with a cooldown of weeks.

## 9. Orders through her

With the P15 `command` domain, the commander's combat orders (P4 CP orders) pass **through her**: she approves, changes, or "forgets" to relay them (a roll by style, hold and her stress); the commander's CP are effectively hers. Uses the P13 override chips in combat.

## 10. Gratitude and begging

- **Gratitude:** a protocol: after her discipline, thanks in her form. Wrong form or refusal doubles the punishment.
- **Begging:** under `denial`, permission is won by begging, and her demands grow each time (form, length, witnesses).
- Both are **typed by the player** (P17c dictation), never pressed as a chip.

## 11. Service in depth

- **Kinds** (seeds): care of her (hair, dressing, boots, massage after a run, feet, the bath); **wound care** after combat (from her real P4 injuries); household (her quarters, laundry, dinner from the mess, tasting her food first); presence (standing by, holding, doors); ceremonial (greeting forms, kneeling when she enters); **bodily and intimate** service only with `explicit_scenes`, her profile and limits (the engine frames "service as she wishes, she leads"; the model writes it).
- **From real state:** her requests follow her injuries, stress, Want and the last run.
- **Her preferences, learned by the player:** each holder has hidden preferences (from her card plus generated: how she takes her coffee, how her hair must be touched, the order of service, what she hates). They are revealed by her corrections, praise and remarks (each becomes a fact). The service verdict (P16) checks the player's text against the known and unknown preferences through `intent_extract`: a player who **remembers** serves better.
- **Corrections in the moment:** she stops and redoes; errors accumulate into her discipline or into patient teaching (by style).

## 12. Humiliation in depth

- **Real history:** her humiliations draw on this campaign's memory (P3b): soldiers lost in combat, a failed mission, the commander's crime (P7), past slips, compromat. The directive hands her concrete events.
- **Your own words:** she quotes the player's earlier messages verbatim from the chat history (promises, boasts, begging).
- **Dictation:** she dictates a sentence (a confession, thanks, a plea) and the player must type it (P17c); mistakes or wilful changes are slips; refusal is possible with consequences.
- **Edits:** when speech rules are broken, her correction shows as strike-through in the commander's own message (P9c intercept rendering, extended to scenes).
- **Her verdict on the board** (`public_humiliation` only): her assessment or the commander's offence posted as a squad notice on the PDA.

## Depth revision (design session 2026-11-19)

Added after the 0.2 depth review; built on P15a (blocking, moments, contact physics). Where it conflicts with the sections above, this section wins.

- **Object time (§2) and speech rules (§3)** run on P15a blocking (`activity: ignoring`, contacts `footrest`, `human_chair`, `under_her_seat`; input effects) instead of their own flags.
- **Holds in sparring.** With a partner whose profile fits (not by default; an ordinary character will not), losing a P9c sparring bout can end in a hold: a headlock into her armpit (`smothered_armpit`, worship) or her foot on the commander's head on the mat (`foot_on_head`), with the squad watching when present.
- **`bodily_fluids`** (P15a §1):
  - sweat: the sweat layer of her scent (P17d) after a run or training, the cleanliness gauge of `tongue_work`;
  - spit: her act in a moment (accept / turn away / thank); its meaning follows her worship meaning (`humiliation` = contempt, `play`, a "gift" for a hungry position); under a ring gag "accept" is the only option;
  - feeding (§5, `hand_feeding` from her mouth);
  - demonstrations with `public_humiliation`;
  - tasks and mid-ladder punishments.
- **`watersports`** (requires `bodily_fluids`):
  - **territory marking** by a `possessive` holder: the strongest scent mark, lasts longest, overrides other women's scent on the commander, noticed by the squad almost surely (there is no general "scent war" mechanic; this mark is the one case);
  - the "function" step of the objectification ladder (§2);
  - drink only from her (§5, the bowl of `pet_play` as the hardest step);
  - severity 5 of her discipline ladder;
  - `cold_contempt` and `revenge` aftermaths;
  - the `gulp` physics (P15a §9.1) with the chain "spilled → `tongue_work` on the floor and her check".
- **Order is never fixed.** Summons, rituals and their sequence are per pair (profile, style, appetite); "boots → sweat → mark after every run" is an example of what *may* grow into a habit (P17e), never a scripted sequence.
- **Memory check:** these events are strong compromat (P15 §11, high `importance`); rumours outside the squad only with `public_humiliation`; `memoryRules` entries for marking seen by others (audience: witnesses) and for a blackout (P15a §13).

## Revision of 2026-11-20 (design session)

Added after the 2026-11-20 design session. Where it conflicts with the sections above, this section wins. Each entry is gated by its categories and offered by holders whose profile fits; none is a default.

### R.1 Hard practices from the session

- **Her socks in the commander's boots.** A day task: the commander wears her worn items under the uniform all day (her socks inside the boots, her training shirt under the jacket; `worship`, `bodily_fluids` for sweat). Every briefing and every meal is a P17d noticing roll ("you smell of her"); the stimulus layer (P15a §16.8) runs all day at low intensity. A risk the commander carries, not her.
- **Air for answers** (interrogation under smothering; `worship` + `restraint`, deeper with `breath_play`). She questions the commander under her armpit or thighs; air only for an answer. A minimal lie check without a separate interrogation engine (the general mechanic stays on the roadmap, overview §10): `intent_extract` marks an answer `evasive` or `contradicts { factId }` against facts **she** knows (P3b `Knowledge` for her); an evasion or a contradiction costs air (the next window shut) and goes on her list. Air becomes the currency of truth.
- **The squad's boots.** A rare outcome of serving the squad (§8): after a run the commander cleans every woman's boots; each has her own scent and her own dirt (stimulus kinds per woman, P15a §16.8), so the stimulus stages are tested on each; the Regard of the whole squad moves at once (P15 §16.3).
- **Rare turns of a deep dynamic** (by the story, her style and how far the dynamic has gone; never scheduled):
  - **Field gear stays on.** After a run she stays in her field clothes for days on purpose (the "did not wash on purpose" term of P17d, extended to days); the daily service is boots, socks, feet and armpits without her shower; scent bands climb day by day to `overwhelming`.
  - **The pillow.** For a week the commander sleeps face in her boots or her worn socks. Afterwards the conditioned reaction (P17d, revision of 2026-11-20) is literal: without her scent sleep does not come (a sleepless status, P7; commander stress, P12).
- **Breath by her rhythm** (`breath_play`). For a whole session there are no taps (`holdsUntil` ≥ `limit`): the commander breathes only when she lifts or breathes out onto the face; her `seal` skill is high (P15a §16.10); blackout is a real risk (P15a §9.5). The stop word always ends it (P15a §9.4).
- **Memory check:** the socks day noticed by someone → P17d's existing discovery site; an `evasive` / `contradicts` answer → her fact (`hiddenFromCommander: true`); the squad's boots → a `memoryRules` entry (audience: the squad present; importance mid); the rare turns → a `memoryRules` entry each (audience: the pair; importance high); breath by her rhythm → P15a §13 (blackout).

### R.2 Role reversal: `strap` and `her_anatomy` (2026-11-20, part 2)

Two content categories, both requiring `explicit_scenes`, off by default; either may be enabled without the other:
- **`strap`** — she takes the active role with a worn item (`strap`, `docs/content/blocking.md` §2), whatever her anatomy. For her it is a **deliberate gesture** (her meaning tends to power, play or possession); handling it is learned, so her `strap` handling grows with her skills (P15a §16.10); the item has size tiers 1–4 opened by the track level.
- **`her_anatomy`** — she takes the active role with her own anatomy; only for a soldier whose `anatomy` is `penis` or `both` (P15a §16.15). For her it is **natural**: her profile leans to `as: enjoys`, there is nothing new for her to learn; her meaning tends to intimacy or dominance.

**The commander's side is shared** by both: the tolerance and trajectory of receiving (P15a §16.8, starting from `Commander.experience.receiving`, §16.15), the language of perception, the physics `relax_rhythm` (P15a §16.16) and `depth` (§16.17), the stop word. The **first time** is a P15 milestone she offers and a `severe` rung of the consent ladder (P16 §R.1).

**Track `role_reversal`** (P15 §6): 1 the first time → 2 regular → 3 on her schedule (protocol, ritual) → 4 only this way (with `denial`: other forms of intimacy are closed to the commander, for a term she sets: a `severe` rung with irreversibility for that term) → 5 the squad knows (with `public_humiliation`).

**Her meaning** (a field per category, like worship meanings): `dominance | intimacy | humiliation | play | possession`; it decides the tone, the Regard move (P15 §16.3) and the squad's reading.

**Contacts** are `docs/content/blocking.md` §3.6 (existing postures of the commander coupled with her position, each with its physics and escalation channel).

**Links:**
- **Worship:** the anatomy variant of `genitalia` with its own zone, "how" and meaning (`reward` to be earned, `duty` a morning duty, `humiliation`, `intimacy`); per-target mastery; worshipping her `strap` before as a ritual of preparation (service); a kiss of thanks after, by protocol.
- **Scent and taste:** `scent_intimate`, `taste_intimate` (P15a §16.19); her intention not to wash "for you"; her scent clings to the commander and can be noticed.
- **Postures:** the presets of P16b (`all_fours`, `bent_over`, `chest_down_hips_up`, `lying_back_open`, astride) with drift; her named postures for these scenes.
- **Physical discipline:** before or after, as part of a ceremony (P16 §R.4); marks.
- **`denial`:** `chastity_device` on the commander with `her_anatomy`; stop on her word (P16b); release as her privilege.
- **Feminization and Pygmalion:** clothing and "the role" in the scene; together they make the full reversal; for Pygmalion (P17f) the summit of the plan.
- **The squad and memory:** signs for suspicion (her scent, the commander's gait when `sore`, noise); compromat; Regard by meaning and style; the milestones "first time" and "on her schedule"; records in fiction time; a habit of the pair.

### R.3 Her desire

Her desire is P9d's Want; its pace is her `drive` (P15 §16.7): uneven, it can fall, it rises with her mood and jealousy and falls with stress, an injury, a bad day or relief. With `her_anatomy` (and in any category when her bond profile has one) a high Want turns into her **pursuing it**, decided by the depth of the dynamic, her style, her Regard and **how well the commander has satisfied her before** (her accumulated verdicts and favour):

- **A shallow dynamic** (`equal`, `play`): she does not ask and relieves herself, or asks softly.
- **A deep one** (`role`, `rule`), by style:

| Style | How she pursues it |
|---|---|
| `regal` | demands it, and that is all |
| `affectionate` | nestles, leads up to it softly; a refusal barely irritates her |
| `cruel` | summons the commander and takes what she wants |
| `cold` | sets a time |
| `ritual` | a formal summons |
| `playful` | teases, makes a game of it |
| `possessive` | at once, and jealous if the commander is with another woman |
| `obsessive` | at any time, anywhere |
| `drill` | as part of the routine |
| `vindictive` | as part of the sentence |
| `clinical` | as an experiment |

- **Low Regard:** she takes without asking; **high:** she asks.
- **A poor history** of satisfying her: she relieves herself coldly, or grows irritated; **a good one:** she calls more often and expects more.
- A summons may come at any time when her contract has the clause (P17a, `summons`).
- **Unrelieved desire makes her irritated**, and irritation tightens the windows of `relax_rhythm` (P15a §16.16).

**Worship of her anatomy as a morning duty:** `her_anatomy` worship with the meaning `duty` every morning becomes a habit of the pair (P17e); missing it is a slip.

**Marking with her anatomy** (`watersports`, gated): the `possessive` territory marking of the revision above, by her anatomy: the strongest scent mark, noticed by the squad almost surely.

### R.4 Feminization

Content category **`feminization`** (off by default; descriptions `AUTHOR TO WRITE`).

- **Who:** any commander; the starting `expression` (P7) sets the length of the arc: from a masculine start it is a long transformation, from a feminine one a short "accentuate". A WORLD PARAMETERS option limits it to commanders who start at androgynous or more feminine.
- **What changes:** the commander's `expression` (P7) moves for real toward "very feminine" by stages (a trajectory like P15a §16.8, deed-based). By P7's principle expression gives no buffs or debuffs; it acts only through the women's tastes (`drawn_to_feminine` warmer, `drawn_to_masculine` cooler), the squad's notice, Regard, the nickname and the shame mechanisms (P15 §16.5). **The game never gives the commander a pronoun and never decides the commander's gender or identity**: only the description of how the commander presents changes; who the commander is stays the player's to write.
- **Levers:** clothing and items (`fem_*`, `docs/content/blocking.md` §2), hair (the `haircut` pastime, P14c), makeup (her hobby `hair_and_makeup`), manners and postures (P16b), speech and address (P17b §3, P17e §5), body care.
- **Stages:** early steps are reversible; late ones are not (a `severe` rung of the consent ladder).
- **Her name for the commander** is part of it: a feminine name she gives, used in her DMs and on the PDA header (the nickname idea of overview §10); the squad picks it up over time through P9's nickname system.
- **Her attitude:** P15 §2's `as` (does she want to do it) and `witness` (seeing another do it) per category, independent of the `drawn_to_*` tastes (a woman drawn to masculine people may love feminizing the commander), plus **her meaning**: `humiliation | aesthetic | intimacy | play | control | possession`.
- **The outing.** A staging (P17) in which the commander, dressed by her choice, goes to the mess or a briefing. Rungs of exposure: under the uniform → noticeable → fully. Suspicion, Regard, the nickname, the consent ladder.
- **Manners and speech.** Training of gait, feminine variants of P16b postures, and turns of speech of her choosing under dictation; `drill` holds an exam, `regal` a showing to her.
- **Body care** as tasks: she paints the commander's nails (`painting_her_nails` reversed), skin care, hair.
- **Memory check:** a stage crossed → a `memoryRules` entry (audience: the pair; importance mid); the outing seen → `knows_dynamic` / suspicion sites and a `memoryRules` entry (audience: those present); her name adopted by the squad → P9's nickname site.

## Acceptance criteria

1. The four categories gate everything they tag; disabled categories never reach a prompt.
2. Objectification: ladder steps by track level, object time with input limits, Strain, POV, the return ritual and its absence cost.
3. Speech rules, the collar, deprivation, pet play, the cage (profile-gated) and coercion work as specified.
4. Serving the squad never occurs as a routine practice; orders through her work in combat.
5. Gratitude and begging are typed and judged; begging escalates.
6. Service draws on real state; preferences are hidden until revealed and affect the verdict.
7. Humiliation uses real memory and verbatim quotes; dictation, edits and the board work.
8. Every element carries `data-analyze`; every generation goes through P14.
9. (R, 2026-11-20) `strap` and `her_anatomy` are separate categories, both behind `explicit_scenes`; `her_anatomy` needs her `anatomy`; the commander's side is shared; the track, meaning and links work; her desire grows by `drive`, unevenly, and is pursued by depth, style, Regard and history; `feminization` moves `expression` by stages without ever giving the commander a pronoun or an identity, with her name, the outing, manners and body care.

## Interfaces already provided by P13 (implemented — use, do not rebuild)

- **The pain burst** is the commander punishment with an `injury` effect in the registry `commanderPunishments` (read by effect, never by id): `commander_stress` 15 through `addCommanderStress(draft, amount, 'warden_punishment')` plus an injury chance falling with Endurance. `applyCommanderPunishment` needs a warden; `applyRemotePunishment` (no warden: stress, injury, slots, the squad's record) is the form for a holder that is not P13's. A discipline module of this package that hurts the commander adds an entry (and, if it needs a new effect, a case in `runEffect` in `src/engine/warden/punish.ts`) instead of a new mechanism.
- **Commander stress** (P12): `addCommanderStress` / `commanderStress` / `commanderStressBand`; nothing here draws.

## Interfaces already provided by P14 (implemented — use, do not rebuild)

- **Every model call goes through the envelope** (`app.generations`, `src/llm/envelope.ts`): `generate(siteId, key, opts?)`, `retry`, `reroll`, `rerollState`, `drop`, `useFallback`. `callLlm` is imported by that module alone (`tests/architecture.test.ts`).
- **A package that adds a call type or a flavor kind registers its site in the same change:** a `SiteDecl` in `src/llm/sites.ts` (`id` like `<area>.<what>`, `callType`, `surface`, `reroll` mode, `record` mode, generic `label`, glossary id) and the handlers bound by the owning controller (`envelope.bind`: `build` rebuilds the input from the state, `apply` runs the same engine action as before, `fallback`, `committed` / `undo` for the reroll mode). `tests/llm/siteRegistry.test.ts` fails for a call type or flavor kind without a site; the architecture test refuses a direct `callLlm`.
- **A failure** is `refused`, `truncated`, `timeout`, `network`, `invalid_output`, `empty` or `no_profile`; the envelope writes a record (`CampaignState.generations`, at most 20, no prompt, no model text, `detail` never the model's words) unless the site's record mode is `none` or the reason is `no_profile`. Add the chip with `drawGenerationChips(host, ctx.generation, state, surface, filter)` and REROLL with `drawSiteReroll`; a screen draws neither without `generation` in its context. Labels are generic: never put a hidden value in one.
- **The engine decides:** a retried or rerolled value goes through the same sanitizer and the same action as the first one; none of the new actions draws from the rng, so a new site must not either (a seeded test that moves stops and reports).

## Interfaces already provided by P15 (implemented — use, do not rebuild)

P15 is implemented (see its **Implemented as**: rulings R1–R25). What follows is what exists for this package and what is reserved for it. Every P15 reader answers null, zero or an empty list while the dynamic is off (`dynamicOn`, `herPracticeLive`), and nothing it adds draws from the rng unless someone is eligible: a hook you register must keep a campaign with no dynamic byte-identical (`tests/dynamic/unaffected.test.ts`). Keep new directive ids away from `dynamic:`; read domains by capability, styles, milestones and aftermaths by field, never by id; no text gives the commander a pronoun or a feeling.

- **A new category is a track:** a *practice category* is one named by a `dynamicTracks[].category`. Adding `deprivation`, `pet_play`, `objectification`, `coercion` or the `role_reversal` track means adding a `dynamicTracks` row (thresholds, `category`); the category then joins the import prompt, `dynamicOn`, `herPracticeLive` and `trackOpen` with no code. Tracks have no xp producer until P16.
- **Blackmail:** `addCompromat`, `compromatOf` (facts tagged `compromat` and `holder:<id>`, hidden until mentioned), `threatFactOf`, `tellCompromat(draft, holderId, { factId, audience }, outsideOpen)`; the `blackmail` aftermath (weights need compromat) writes a demand whose refusal tells the squad, and with `audience: 'outside'` and `public_humiliation` enabled the fact spreads as a rumor. A dynamic that **starts** from blackmail is yours: a `dynamicMilestones` row (data) or a forced milestone; `exitSeverity` and `exitCostWord` carry the cost, a vow is a break.
- **Her command over combat orders:** the `countermand` capability and P13's override are generalised (`holderSource`, `rollOverrides`, `OverrideSource.kind: 'holder'`, `answerOverride` routes by the open slot); activity, roster, expedition, major dilemma and combat order are wired; passing the commander's CP orders **through her** is yours (a new order kind at the hook sites of `rollOverrides`).
- **Regard and meaning:** `regardFall(…, humiliation 0–5, …)` by the depth of an act; her **meaning per category** is yours; `Relation.mastery` and the reading. `drive` and the Want multipliers are `registerWantGrowth`. A first time is a milestone she offers (a `dynamicMilestones` row with `requires.categories`).
- **Outside perception:** nothing in P15 touches P9b outside perception: only a `public_humiliation` event does, and **no P15 code produces one** (yours).
- **The `role_reversal` track** in the ladder reads `dynamicTracks`; `trackLevel` and `trackCap` are built.

## Interfaces already provided by P16 (implemented — use, do not rebuild)

P16 is implemented (see its **Implemented as**: rulings R1–R24, the memory check and the open items). Everything it adds is off, absent and byte-identical while nobody holds at `play` or beyond (`practiceLive`), and none of it draws from the rng (`practiceRoll`). Keep new directive ids away from `practice:`; read seeds, punishments, ceremony steps, booking kinds and rule templates by field, never by id; no text gives the commander a pronoun or a feeling.

- **Speech options under a strict speech rule:** no site is declared (a declared site must be bound); declare `speech.options` (or the name you choose) in `src/llm/sites.ts` with its call type when you build it, bound by your controller through `app.generations`. The task and rule machinery you would attach it to exists: a rule is a P9d rule with a `service` or `denial` tag, `denial_broken` and `protocol_slip` are the slips, and an offence is entered once per holder, ref and day (`noteOffence`).
- **Handover of rations and sleep:** `HANDOVER_KINDS` is `device`, `key`, `calendar` (`practice/hand_over { holderId, kind, days }`, a signed `severe` card, `practices.handovers`, `TUNING.practice.handover`); add a kind there and one case in `handOver` / `handoverSweep`, and its card, composer button (`renderHandoverComposer`) and `TAKE BACK` come with it. The forced edit of a handed device (`registerForcedEditor`) does not check the content or her limits: do so if your kind writes text.
- **Narrated `physical` effect and `implements`:** a `holderPunishments` effect `physical` is narrated only (R1); `implements` is data. Categories `deprivation`, `pet_play`, `objectification` and the like gate your own seeds through the same `contentTags` field (`practiceSeeds`, `holderPunishments`, `ceremonySteps` and `implements` are content-gated registries).
- **Hold and denial:** a denial is a permission rule (`asks: 'permission'`, `practices.permission`, `[ ASK PERMISSION ]`, four answers); a cage or a collar worn by the commander that names a `rule` effect reaches it through P15a's `rule` channel (`chastity_device` → `ask_permission`). `held_in_quarters` is the only held kind; sensory mode is a hold flag (`sensory`) or a commander blocking whose `filter` is `sensory_dark`.

## Interfaces already provided by P15a (implemented — use, do not rebuild)

P15a is implemented (see its **Implemented as**: rulings R1–R16). It built the parts below as hooks or data only; this package completes them.

- **Categories already added by P15a:** `pet_play`, `objectification`, `deprivation`, `strap`, `her_anatomy`, `feminization` (off by default). `coercion` is **not** added.
- **Rows already shipped:** the items and contacts tagged with them (leash, muzzle, paw mitts, bell collar, tail, food bowl, the weight and furniture contacts, the strap and `fem_*` items, with no mechanics beyond their effects).
- **Handed over from P15a (user ruling 2026-11-21):** P15a §16.15–§16.20 are yours, with their TUNING (§16.20):
  - anatomy (`Unit.anatomy`, `Commander.anatomy` / `experience.receiving`, import, wizard, dossier, COMMANDER FILE);
  - relax-in-rhythm (`contactPhysics.relax_rhythm`, tempo × force × mood, expected miss shares, breaking stages, the quota, the blindfold cues);
  - depth;
  - her edge;
  - the intimate stimulus kinds `scent_intimate` / `taste_intimate`;
  - the role-reversal contacts of blocking.md §3.6 and their escalation verbs (`hand_in_hair`, `palm_on_back`, `hand_on_throat`, `pin_wrists`).

  P15a's physics engine (segments, interaction types, cues, conditions, stimuli) is the base to build on.
- **The base to build on:** `contactPhysics` (gauge kinds `capacity` / `fill` / `dirt` / `progress`, interaction types `timing`, `hold`, `decision`, `order`, `passive`, `gesture`), `physicsCues`, `stimulusKinds` and `Commander.stimuli`, the mouth acts (`ACT_KINDS`, `actsFor`) and `conditions` (`setCondition`). Add a row or a kind; code reads fields and effect types, never ids.

## Interfaces already provided by P10e chunk (e) (implemented — use, do not rebuild)

P10e chunk (e) (the mini-game instruments, her cards and the posture call) is implemented; see the **Implemented as: chunk (e)** section of `docs/packages/P10e-scene-stage.md`, its rulings R1–R32 and A–AD, and its open items for the author. The prototypes in `docs/prototypes/` stay normative: a new mini-game is designed as a prototype first and ported with its `fidelity.json` (the fidelity test checks it), not redrawn from prose.

- **The instrument pattern:** `registerInstrument({ id, matches, start, drawable? })` in `src/ui/scene/instruments/index.ts` (first match wins; read the physics by field); `start(env, run)` returns `{ update, stop, finish? }`. Write a layer's style only through `claimStyles`, her lines only through `env.say`, timers through `env.timeout` / `env.listen` / `env.raf`, sound through `env.samples` (`SampleSound`: `preload`, `buffer`, `ctx()`, `bus('world' | 'body')`); the host undoes the rest at the unmount. Report inputs through `env.staging.input(i, { pointer })` (Ruling O), place beats with `env.staging.clock()`. An instrument draws only in real time (`physicsRealtime`, the campaign's mirror, the interaction on); otherwise the physics card.
- **Her lines are content:** `voiceLine(reg, kind, style, key, vals)` over `cardVoice` (`docs/content/card-voice.md` is the readable copy; a style the prototype lacks reads neutral's, Ruling R); a line that answers an engine decision follows the engine's answer (Ruling Q). New engine inputs are optional and additive (`SegmentInput.amount`, the kinds of R2); new plan fields are hashed (`fnv1a`), never drawn.
- **Art:** `ArtSlots.get(unitId, slot, { explicit })` with its sidecar (`fit`, `zones`, `feet`, `shown`, `face`), `explicitArtAllowed`; a missing picture always falls back (her sprite, the automatic zones, or the card).
- **Gulp** (`src/ui/scene/instruments/gulp/gulp.ts`, `src/engine/physics/gulp.ts`): read by field (a timing physics on a fill gauge tagged `watersports`); her flow is planned by hash (`flowOf`, `TUNING.physics.gulpFlow`, gulp.html's `STYLES`); `swallow` / `spill` inputs; at her flow's end the chain to `tongue_work` on the floor starts at `floorStart(spilled)` for a holder who checks by cleaning, and the same instrument draws the floor and her check. **No contact starts gulp yet (A3):** your watersports contacts start it. Today only the engine's `physics/start` and the chain reach it (no player path dispatches `physics/start`; the layout page and the tests do), so no player can reach gulp until your contacts exist. Her volume is fixed at 35 s for every holder; the taste lines are gulp.html's `TASTE` in code (no stimulus kind tastes of it yet); her picture is `over_explicit` only with explicit content on (`explicitArtAllowed`), then `over`, then her sprite from below.
- **The slap** (`src/ui/scene/instruments/slap/slap.ts`): the swing (`slapTimeline`, `braceBand` 42–224 ms), her side (`slapSide`), her face (`TUNING.practice.slap.faces`), a turned face as her offence `slap_defied`; physical discipline that strikes reuses it.
- **Breath** (`breath/`): `effectiveOpenings`, the held credit and over-holding (R14, R15); a blackout and the wake play through `finish()` (Ruling P), then P15a's wake card. **Scent** (`scent/`): the head as the gauge (`inhale` / `mouth_breath` / `scatter`, `headCapacity`), her question (`physics/answer`, `scent_lie_caught` remembered); her scent words do not exist yet (a stand-in plays). **The jaw** (`jaw/`): `bite` with the cost of the opening, her orders by hash, the heard line.
- **Memory:** spills, coughs, the cleaning and her check are bookkeeping; a seen spit or relief is `physics_caught`; what `watersports` remembers (compromat, a mark seen by others) is yours.

## Interfaces already provided by P15b (implemented — use, do not rebuild)

- **Her manner:** `mannerOf(state, reg, unitId)` (`src/engine/dynamic/manner.ts`) gives her six axes (`intensity`, `warmth`, `order`, `voice`, `tempo`, `curiosity`, each −2…+2, her drift and the mood of the day folded in), `drawnBy` and the mood, or `null` without `bond.practice.manner` (the gate: no manner, no effect). `bend(base, step, kind)` / `bendBy` (`src/engine/bend.ts`) move a style's number by a step (at 0 they return the base; `tempo` + is quicker, so times are shorter); an instrument bends its style row once through `bendRow`, declared in its `fidelity.json`; the physics layer gets her axes through `registerPhysicsManner`.
- **Read her style through `styleOf` / `practiceOf`**, never `bond.practice.style` (a turn of her style, `development.practice.primary`, sits on top of the import). `faceNow(state, reg, unitId, present)` (`dynamic/face.ts`) says which face a scene shows (`dynamic`, `dynamic_to_commander`, `everyday`, `mask`); a holder directive follows it.
- **Her small ways and her days:** `quirksDue`, the `dynamic:quirk:<unitId>` line and `quirk_voiced`; `mannerMoodOf`; drift is a P14b axis kind `manner` (`manner:<axis>`, `manner:drawn_by`, `manner:turn`), fed by `dynamic/mannerFeed.ts` (push table `TUNING.manner.push`); `dynamic.practised` (what she has done with the commander) and `drawnBy`'s favour (`addFavour`).
- **Probing by manner (§12):** probe rows take `needs` (`probePlaces`, `probePool`; a new row with `needs` also needs its head start moment), a milestone takes `requires.manner`, a probe row `wakesOnPraise`; `hypothetical_answered`, `first_below` and `dynamic.noted.praised` (`dynamic/regalEntry.ts`).
- Keep new directive ids away from `dynamic:quirk:`; draw nothing (hash a stable key); the hidden values (accumulators, the mood as a number, the distance to a turn, quirk state, the styles' places on the axes) never reach a panel, a toast, an event text or a reading. Details: P15b **Implemented as**.
- For P17b: a new practice's numbers bend through `bendBy` / `bendRow` with a step of 0 as the base; a mini-game row is declared in its `fidelity.json`.
