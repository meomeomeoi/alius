# P18 — Story Arcs: the AI Story Sandbox

**Status: spec.** Release 0.3 (post-release). **Depends on:** every 0.1 package implemented (in particular P3b memory, P5 director and spine, P6 dilemmas, P14 generation envelope), 0.2 (P15 for the `personal`/`squad` seeds that read the dynamic). **Read:** overview; this file; the **Implemented as** of P5, P6, P3b and P14; `docs/content/lore.md`.

**Analysis tool (P7a):** every new card, chip and line carries `data-analyze` with a glossary entry or registry `description`; live values get a provider through `Knowledge`. **P14:** every generation registers a site.

## Goal

Today the campaign has an authored **prologue** (spine beats 1–5 of each start, about 16–20 game days) and then beat 6, "Open ground": the director keeps offering template missions and moving clocks, with no direction, no arcs and no more clearance. This package fills that second half: after the prologue, the game becomes an **AI story sandbox**. The model invents story arcs from random seeds and from the history of the campaign; the engine validates them, owns every number, and keeps the story from stalling.

Rule kept from the start: **the model writes the story, the engine owns the rules.** An arc is built from a validated vocabulary (seeds, twists, mission verbs, modifiers, regions, factions, clocks, flags, cast); amounts, rewards and clearance are the engine's.

## 1. When the sandbox starts

The prologue is unchanged. When the last authored beat completes, beat 6 (`completion: auto`, "Open ground") becomes the **sandbox start**: `world.arcs` is created and the first arc is drawn at the next director tick. A campaign that already sits in the open phase (an old save) starts the sandbox at its next day end.

## 2. Seeds, twists and tags

**Registry `arcSeeds` (~50, author-editable, text drafts by the implementer, the author edits):**

```
{ id, name, premise,                       // 1–2 lines
  category: 'corporate' | 'bloom' | 'oversight' | 'outside' | 'squad' | 'personal' | 'survival' | 'mystery' | 'faction',
  size: { min: ArcSize, max: ArcSize },
  requires?: WorldPredicate[],  excludes?: WorldPredicate[],
  antagonists: AntagonistType[],
  outcomes: OutcomeShape[],                // e.g. 'win_cost', 'win_clean', 'partial', 'lost', 'turned' (the antagonist joins), 'escalated'
  tags: Tag[], contentTags?: ContentCategoryId[],
  weight, cooldownDays, description }
```

`WorldPredicate` is a closed vocabulary read by type: clock above/below, faction standing band, region known, clearance tier, flag set, a living named unit with a property (defect category, corporation of origin, bond tier, dynamic frame (P15), role), squad size, resources band.

**Registry `arcTwists` (~30):** complications that combine with any compatible seed (the employer betrays, the target is a former squad member, the evidence was planted, oversight wants the same thing, a soldier has a stake, the Bloom is not what it seems…), each with `requires`, `tags`, `fits: category[]`.

**Uniqueness:** an arc is never a seed alone. The draw combines **seed × twist × antagonist (type + a generated name) × place (region + point of interest)**, and the model weaves it with **history**: the chronicle, P3b remembered events and rumors, flags, threads, factions, past arcs and their outcomes, the cast, nemeses (0.4), defect arcs and relationship states (states only, no numbers).

**Tags** (registry `arcTags`, each with a `description` and a weight rule):
- tone: `grim`, `paranoid`, `desperate`, `hopeful`, `eerie`;
- form: `race`, `investigation`, `siege`, `raid`, `pursuit`, `escort`, `heist`;
- theme: `loyalty`, `greed`, `guilt`, `survival_cost`, `identity`;
- focus: `on_her` (a named unit), `on_commander`, `on_squad`;
- content: P9d categories; a disabled category removes the seed from the draw (`contentAllowed`), her own limits remove it when the focus unit has them.

Tags weigh the draw (recent tones and forms are down-weighted for variety), steer the prompt, and filter.

**Links to 0.2:** `personal` and `squad` seeds may require a P15 dynamic (a holder demands proof of devotion; a rival holder; an aftermath that grows into an arc). They carry the content tags of the practices they touch.

## 3. Sizes and concurrency

| Size | Missions | Notes |
|---|---|---|
| `episode` | 1 | a hook, a favour, a strange signal |
| `short` | 2–3 | |
| `arc` | 4–6 | may advance clearance |
| `saga` | 7–12 | in chapters (sub-arcs), always advances clearance |

At most **one major** (`arc`/`saga`) and **two minor** (`episode`/`short`) at a time. Major arcs **arrive** when the director judges the world ready; minor arcs are **offered as hooks** (a rumor, a request, a signal, a DM) the player may take or ignore. An ignored hook has consequences by its seed (a clock rises, someone else takes the job, the person in need is gone) and expires.

## 4. Generating an arc: `arc_generate`

Mechanic call, budget 2000, one per arc (P14 site `arc.generate`, reroll `before_commit` until its first mission is accepted).

- **Input:** the drawn seed, twist, antagonist type, place, size; history digest (P3b memory budget applies); world digest (P5 `buildDigest`); cast; enabled content categories (disabled ones never named); **author's notes** (campaign and arc, §9).
- **Output (schema):**
  ```
  { title (≤ 40 chars), logline (≤ 120), premise (≤ 400),
    antagonist: { name, kind, motive, castId? },
    cast: [{ name, role, attitude, description }] (≤ 4 new),
    beats: [{ id, title, goal (≤ 120), kind: 'mission' | 'event' | 'scene' | 'dilemma' | 'wait',
              mission?: MissionSketch (P19), conditions?: BeatCondition[], next: { onSuccess, onFailure } }],
    climax: { kinds: ('scene' | 'dilemma' | 'wave' | 'antagonist' | 'boss')[] , beatId },
    outcomes: [{ id, shape, flags[], summary }] (2–4),
    foreshadow: [rumor lines] (≤ 3) }
  ```
- **The engine validates** every id, vocabulary term and condition; clamps counts to the size; replaces an invalid mission sketch by a fallback one from the same verb; drops a cast or beat that cannot validate and records it. `boss` in the climax is accepted only once 0.4 bosses exist; until then it is downgraded to `antagonist` (a named, strengthened elite).
- **Branching:** beats form a small graph (`next.onSuccess` / `onFailure`); an arc can fail and continue from the failure. **Failure is a legitimate outcome** with its own consequences, never a dead end.

Stored as `world.arcs.active[] = { id, seedId, twistId, title, logline, size, beats[], current, outcomes[], cast[], startedDay, status }` (beats keep only ids, goals and validated sketches; prose stays in memory facts and the chronicle).

## 5. Running an arc

- **Beats** are proposed by the director as today's spine beats are (the P5 two-phase director gains `arcBeatProposal`); a beat whose conditions hold for `TUNING.arcs.stallDays` without being proposed is **proposed by the engine itself** (closes the P5 soft spot).
- **Mission beats** become missions on the board (source `story`, P19 builds them); event beats become pinned events; scene beats open a scene at base (origin `event`); dilemma beats go through P6 (`dilemma/request`).
- **Climax:** a scene, a dilemma, a strengthened wave, the antagonist, a boss (0.4), or a combination.
- **Outcome:** chosen by the engine from beat results and climax flags; writes its flags, a chronicle entry, P3b remembered events, faction and clock effects (validated world effects), reputation, and **clearance** (§7).

## 6. The cast

`world.cast[] = { id, name, role, attitude: hostile|wary|neutral|friendly|devoted, faction?, alive, knownFacts[], arcIds[] }`. Cast persists across arcs: an informant can return, an antagonist who escaped can come back. A cast member has no ST card: the narrator voices them (P20 shows them under their own name in the chat).

**Joining the squad:** an arc outcome may offer a cast member as a recruit: as a **grunt** (P2 generation with her name and role), or as a **named** unit if the player provides a card (the existing P5 `intakeUnit` flow; her cast facts become her first memories).

## 7. Vertical progression

Clearance tiers 4 and 5 are added (`TUNING.progression.levelCaps` → `[10, 20, 30, 40, 50, 60]`; the trees that use them come in 0.4, P23). An `arc` or `saga` outcome can raise clearance: the engine grants tier 4 after the first major arc completed (any outcome but `lost`) at tier 3, tier 5 after the second with danger ≥ `TUNING.arcs.tier5Danger`. Arcs then keep coming with rising danger; further vertical growth is 0.4's overdrive levels.

## 8. Safety nets

- **Generation fails:** P14's retry and reroll; after `TUNING.arcs.fallbackAfter` failed attempts the director draws one of **5–6 authored fallback arcs** (`arcFallbacks`, short, different categories; generation is expected to be available, it carries ~70 % of the game).
- **Stall:** an arc whose next beat has not moved for `stallDays` is advanced by the engine (proposal or a nudging event).
- **Content removed under a save:** a seed or twist that vanished leaves the running arc as is (it stores what it needs); a missing mission verb downgrades to `eliminate`.

## 9. Player control

- **Arc preview** (setting `arcPreview`, SYS › World, default off): before an arc starts, a card shows seed, twist, antagonist, place, logline and beats; the player can **edit** any text field, **reroll** (P14), or **accept**. Edits are validated like model output.
- **Author's notes:** a campaign-level note (SYS › World, ≤ 600 chars) and a per-arc note (in the preview, ≤ 400): free text sent to `arc_generate`, P19's mission generation and the director tick. Notes steer content and preferences only; they never bypass validation (ids, rewards, numbers stay the engine's).

## 10. UI

- **OPS › ARCS:** the active arcs, briefly: title, logline, the current beat's goal, size chip, a "hook" chip for open offers. Finished arcs in a short archive (title, outcome line).
- Hooks arrive in their channel (rumor list, DM, notice) with `[TAKE] [IGNORE]`.
- The objective list (P11 `objectiveList`) gains source `arc`.

## 11. Directives, events, actions

Directives `arc:`-prefixed (the active arc's premise line for scenes that touch it; cast lines when a cast member is discussed). Events: `arc_drawn`, `arc_previewed`, `arc_started`, `arc_hook_offered`, `arc_hook_taken`, `arc_hook_expired`, `arc_beat_proposed`, `arc_beat_done`, `arc_outcome`, `arc_failed`, `cast_added`, `cast_changed`, `cast_recruited`, `clearance_raised`. Actions: `arc/accept_preview`, `arc/edit_preview`, `arc/take_hook`, `arc/ignore_hook`, `arc/set_notes`, `cast/recruit`.

## Acceptance criteria

1. The prologue is untouched; the sandbox starts after the last authored beat (and on old saves at the next day end).
2. The draw respects predicates, tags, content categories, focus limits, cooldowns and concurrency; tones and forms vary.
3. `arc_generate` output is fully validated; invalid parts are dropped or replaced as specified; nothing unvalidated changes state.
4. Beats run as missions, events, scenes and dilemmas; failure branches continue the arc; outcomes apply validated effects and clearance.
5. Hooks can be taken or ignored with consequences; major arcs arrive by themselves.
6. Stalls are broken by the engine; fallback arcs run when generation keeps failing.
7. Arc preview edits and author's notes reach the prompts and never bypass validation.
8. Cast persists and can be recruited as a grunt or a named unit.
9. Every new element carries `data-analyze`; every generation goes through P14.

## Open decisions (author)

- The 50 seeds, 30 twists, tags, fallback arcs and every `TUNING.arcs` number.

## Interfaces already provided by P14 (implemented — use, do not rebuild)

- **Every model call goes through the envelope** (`app.generations`, `src/llm/envelope.ts`): `generate(siteId, key, opts?)`, `retry`, `reroll`, `rerollState`, `drop`, `useFallback`. `callLlm` is imported by that module alone (`tests/architecture.test.ts`).
- **A package that adds a call type or a flavor kind registers its site in the same change:** a `SiteDecl` in `src/llm/sites.ts` (`id` like `<area>.<what>`, `callType`, `surface`, `reroll` mode, `record` mode, generic `label`, glossary id) and the handlers bound by the owning controller (`envelope.bind`: `build` rebuilds the input from the state, `apply` runs the same engine action as before, `fallback`, `committed` / `undo` for the reroll mode). `tests/llm/siteRegistry.test.ts` fails for a call type or flavor kind without a site; the architecture test refuses a direct `callLlm`.
- **A failure** is `refused`, `truncated`, `timeout`, `network`, `invalid_output`, `empty` or `no_profile`; the envelope writes a record (`CampaignState.generations`, at most 20, no prompt, no model text, `detail` never the model's words) unless the site's record mode is `none` or the reason is `no_profile`. Add the chip with `drawGenerationChips(host, ctx.generation, state, surface, filter)` and REROLL with `drawSiteReroll`; a screen draws neither without `generation` in its context. Labels are generic: never put a hidden value in one.
- **The engine decides:** a retried or rerolled value goes through the same sanitizer and the same action as the first one; none of the new actions draws from the rng, so a new site must not either (a seeded test that moves stops and reports).
