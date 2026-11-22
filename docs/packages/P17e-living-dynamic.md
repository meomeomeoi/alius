# P17e — The Living Dynamic: Tests, Emergent Rituals, Her Weakness, Signature, Address, Feelings

**Status: spec.** Release 0.2 (post-release), after P17d. **Depends on:** P15a (blocking, moments, contact physics), P14b (development, repetition counters, appraisal), P15–P17d, P3b (memory), P10b (handwriting), P14, P7a. **Read:** overview; P14b; P15–P17d; this file.

**Analysis tool (P7a)** and **P14** rules apply.

## Goal

Keep the dynamic alive and personal over months: she tests the commander, the pair's habits turn into rituals by themselves, she is not a machine of power, and the player's own hand, words and feelings enter the fiction.

## 1. Secret tests

A holder may run a **test without warning** (registry `holderTests`, by style and frame): leaves the PDA unlocked to see whether the commander reads it; asks a friend to flirt; says "no protocol today" and watches; leaves a privilege unguarded. The engine knows it is a test; the player does not. The outcome (judged by engine events or `intent_extract`) moves hold and trust; **she reveals the test later** (a scene line, a note), or never, by style.

## 2. Emergent rituals

A practice repeated N times and well received (P14b counters, P16 verdicts) **becomes a ritual by itself**: a name she gives it (generated), a time, a streak, a cost for skipping. Her favourite practices weigh the generator (P16) more. Each pair grows its own traditions; nothing is pre-authored. A ritual that is neglected fades back into a practice.

## 3. Her weakness

After a hard practice, an `affectionate` or `clinical` holder (rarely `drill`, after pushing too hard, and `vindictive`, doubting whether the sentence is just; others rarely too, by stress and appraisal, P14b) may crack: doubt, "did I go too far?". A short scene beat in which the commander can comfort her (`comforted` intent): roles soften for a moment and return. Outcome: her stress, trust and development (P14b) move; neglecting the moment has its own cost.

## 4. The signature

- At the first signature (a contract, P17a) the player **draws** it with the pointer; it is stored as a point set (the reference).
- Later signatures are compared to the reference with a point-cloud recogniser ($P family: normalised size and position, distance between clouds), plus stroke duration and length: too unlike, too fast or too short = **sloppy**. Deterministic, no model.
- Her reaction by style: `ritual` makes the commander sign again, `playful` laughs, `cold` hands the paper back in silence.

## 5. How you address her

The player chooses the form of address (ma'am, mistress, her name, a nickname, free text); it becomes protocol (P16 rules), checked by `intent_extract`. Changing it is an event she reacts to.

## 6. "What do you feel?"

After strong moments she sometimes asks. The player answers in free text; the answer is stored as a memory fact (P3b, the commander's words) and she may bring it back later ("you said you were afraid"). The commander's inner life is the player's to write; the world reacts to it (consistent with ruling E as revised in P15 §16.1: no meter of the commander's feelings; the bodily layer and the record of deeds are P15a §16.8).

## Depth revision (design session 2026-11-19)

Added after the 0.2 depth review; built on P15a (blocking, moments, contact physics). Where it conflicts with the sections above, this section wins.

- **Habits of the pair** (general to every close relation, not only holders): practices and small acts repeated and well received turn into habits by themselves (P14b counters): she always sits on the left, the morning coffee is the commander's, her phrase before a sortie. Others notice them; breaking one hurts (a small cost and her reaction). §2's emergent rituals are the dynamic's subset of habits; nothing is pre-authored and no order is fixed.
- **The litany** (style `ritual`). She writes a formula of worship in her words (generated, P14 site `practice.litany`); the commander recites it by typing (P17c dictation compare). The litany **grows** with the dynamic's milestones (lines are added); a slip in it is a slip.
- **Memory check:** a habit formed or broken → a `memoryRules` entry (audience: the pair; a habit seen by others: those who saw it); the litany's text is not a fact (it lives on the pair, like the contract).

## Acceptance criteria

1. Tests run unseen, resolve, and are revealed by style.
2. Rituals emerge from repetition and verdicts, carry streaks and costs, and fade when neglected.
3. Her weakness appears by style and stress; comforting and neglect both apply.
4. The signature is drawn once and compared deterministically; sloppiness follows the three signals.
5. The chosen address becomes protocol and changes are events.
6. Feeling answers are stored and can be recalled by her.
7. Every element carries `data-analyze`; every generation goes through P14.

## Interfaces already provided by P14 (implemented — use, do not rebuild)

- **Every model call goes through the envelope** (`app.generations`, `src/llm/envelope.ts`): `generate(siteId, key, opts?)`, `retry`, `reroll`, `rerollState`, `drop`, `useFallback`. `callLlm` is imported by that module alone (`tests/architecture.test.ts`).
- **A package that adds a call type or a flavor kind registers its site in the same change:** a `SiteDecl` in `src/llm/sites.ts` (`id` like `<area>.<what>`, `callType`, `surface`, `reroll` mode, `record` mode, generic `label`, glossary id) and the handlers bound by the owning controller (`envelope.bind`: `build` rebuilds the input from the state, `apply` runs the same engine action as before, `fallback`, `committed` / `undo` for the reroll mode). `tests/llm/siteRegistry.test.ts` fails for a call type or flavor kind without a site; the architecture test refuses a direct `callLlm`.
- **A failure** is `refused`, `truncated`, `timeout`, `network`, `invalid_output`, `empty` or `no_profile`; the envelope writes a record (`CampaignState.generations`, at most 20, no prompt, no model text, `detail` never the model's words) unless the site's record mode is `none` or the reason is `no_profile`. Add the chip with `drawGenerationChips(host, ctx.generation, state, surface, filter)` and REROLL with `drawSiteReroll`; a screen draws neither without `generation` in its context. Labels are generic: never put a hidden value in one.
- **The engine decides:** a retried or rerolled value goes through the same sanitizer and the same action as the first one; none of the new actions draws from the rng, so a new site must not either (a seeded test that moves stops and reports).

## Interfaces already provided by P14b (implemented — use, do not rebuild)

- **Effective profile:** `valuesOf`, `likesOf`, `dislikesOf`, `tastesOf`, `bondOf`, `effectiveProfile`: read what she has become through them, never the raw card fields.
- **Axes as data:** `developmentAxes` entries by `kind` (`value`, `bond`, `taste`, `like`, `dislike`); P15's practice attitudes (`as`, `witness`) and styles are **new axis kinds plus registry rows** (`axisKind`, `axisEntry`, `axisForbidden`, `room` in `review.ts` and `applyShift` are the places a kind is taught), never ids in code. `bond.ownLimits` and disabled categories stay forbidden.
- **Appraisals:** `recordAppraisal(draft, reg, unitId, event, role)` / `recordWitnesses` / `recordActivity` store how a soldier read an event; a practice event adds an `eventDeltas[].appraisal` row (or the model's `reading`) and `developmentRules` rows. Misreading and revision are automatic (no rng draw).
- **Counters and habits:** `countActivity`, `countCompanions`, `countRun`, `checkHabits`, `habitEffect`; `habits` rows are read by `counter.kind`. P17e's emergent rituals can use the same `Development.counters` keys (`activity:<id>`, `companion:<id>`, `region:<id>`; add a key kind and a registry `counter.kind`).
- **Quiet moments:** a discrete change is a `DevMoment` stamped at `scene/start` and shown at `scene/end`; the scene carries the directive `development:<unitId>`; keep new directive ids away from it.

## Interfaces already provided by P15 (implemented — use, do not rebuild)

P15 is implemented (see its **Implemented as**: rulings R1–R25). What follows is what exists for this package and what is reserved for it. Every P15 reader answers null, zero or an empty list while the dynamic is off (`dynamicOn`, `herPracticeLive`), and nothing it adds draws from the rng unless someone is eligible: a hook you register must keep a campaign with no dynamic byte-identical (`tests/dynamic/unaffected.test.ts`). Keep new directive ids away from `dynamic:`; read domains by capability, styles, milestones and aftermaths by field, never by id; no text gives the commander a pronoun or a feeling.

- **`her_question`:** the engine marks it ripe for a woman who holds nothing and whose Regard is falling but above `none`, or who `knows_dynamic` with `witness: dislikes` (`registerRipeSource`, `questionRipe`; cooldown 14 days per woman and one a week overall); the Regard move is on the answer (`answerQuestion`: `clinical` +2 for the honest key 0, `affectionate` +2 for the gentle key 1, others ±0). Your "what do you feel?" question and its free-text answer as a fact in the commander's words are yours; ruling E as revised in P15 §16.1 holds (no meter of the commander's feelings).
- **Declared motive:** `dynamic/declare { unitId, motive }` sets `Relation.dynamic.declared` (weight 0.5, fading 0.05 a day, blended into the motive average): a milestone conversation or your question may call it.
- **Her reading:** `HerReading`, `regionOf`, `position_shifted`; shown only as her region word (`Knowledge.dynamic`). The position chips `[PROVOKE]`, `[TEST HER]`, `[ANTICIPATE]` and the moment sources `her_test`, `her_demand`, `permission`, `summons`, `rule_collision`, `ritual_due` are **unbuilt** (`registerMomentTrigger`; only `compromat_hint` is wired): secret tests are yours.
- **Emergent rituals and habits:** P15 added the P14b axis kinds `practice` and `expect` (five `developmentAxes` rows), `Development.lapsed` and `habits[].tags` (`respect` lapse on disappointment; no core habit carries the tag yet). The chosen address and the nickname: `reputations[].tone` (`respectful`, `pitying`, `mocking`) and `reputationDayStep`.
- **Her weakness and the drawn signature:** Regard is hidden everywhere; the profile's `tells` and `traits` appear only once shown.

## Left to this package by P15 (user ruling, 2026-11-22)

- **The position chips `[PROVOKE]` and `[TEST HER]`** (P15 §15.2) are this package's unless the P16b plan takes them (P16b owns `[ANTICIPATE]`; see its note "Left to this package by P15" for the shared rules: shown by her reading's axis thresholds, never region names; a staged act plus a `next_reply` directive; a reading sample; `data-analyze`; the meaning by her style). They belong next to the secret tests: a provocation followed by `returned` is play, followed by leaving is real resistance.

## Interfaces already provided by P16 (implemented — use, do not rebuild)

P16 is implemented (see its **Implemented as**: rulings R1–R24, the memory check and the open items). Everything it adds is off, absent and byte-identical while nobody holds at `play` or beyond (`practiceLive`), and none of it draws from the rng (`practiceRoll`). Keep new directive ids away from `practice:`; read seeds, punishments, ceremony steps, booking kinds and rule templates by field, never by id; no text gives the commander a pronoun or a feeling.

- **The drawn signature:** a `severe` accept is two steps (the words, then `[ SIGN ]`). `registerSignature(fn: SignatureRenderer)` in `src/ui/practice/signature.ts` replaces the press-and-hold button with your drawn one (`SignatureOpts { onSign, analyze, ctx }`); `resetSignature()` restores it; the engine only sees `practice/sign { taskId }`.
- **Secret tests:** `her_test` is a moment source P16 registers (live while a double standard runs, `practices.unfair[holderId]` of kind `double_standard`); an unfairness record never reaches a panel, a toast or a label, and the commander is never told it is unfair (sentinels). A test of yours that reads `fairness` should use `unfairChance` and `possibleUnfair` (`unfair.ts`), not a second roll.
- **Rituals and the chosen address:** protocol rules (`protocolRules`) and the routine (`routine: true` tasks) are what exists; named postures are `practices.postures`. `[PROVOKE]`, `[TEST HER]`, `[ANTICIPATE]` are not built (anticipation in her presence is: `practice_anticipated`).
- **Hold gain rows:** `task_kept`, `punishment_accepted` and `task_broken` now have producers; `service_rated` is encoded as `kind: 'pleased' | 'adequate' | 'displeased'` (only `pleased` feeds hold); `staging_held` has none. Favour moves from verdicts, moment gaps (`TUNING.practice.momentGap`) and kindnesses; the cancelled reward is a `registerFeedSuppressor` hook in `dynamic/feed.ts`.

## Interfaces already provided by P15a (implemented — use, do not rebuild)

P15a is implemented (see its **Implemented as**: rulings R1–R16). It built the parts below as hooks or data only; this package completes them.

- **Triggers to register:** `her_test` and `ritual_due` are live only through `registerMomentTrigger`. A test entry maps its own options onto the frame's response types.
- **Hook:** `registerMomentTrigger(sourceId, fn)`; the response types are `yielded`, `resisted`, `returned`, `deflected` (`RESPONSE_TYPES`).
