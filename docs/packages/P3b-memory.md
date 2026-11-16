# P3b — Memory: what the squad remembers, for how long, and what it costs

**Status: implemented** (plan: `docs/plans/2026-11-16-p3b-memory.md`; automated tests pass, the in-SillyTavern checklist `MANUAL_TEST_P3b.md` still has to be run by hand). Where this draft and the code differ, the code wins: see **Implemented as** at the end. **Depends on:** P3 (facts, chronicle, promises, `scene_summary`, `chronicle_compact`, DMs), P0 (`ContextBuilder`, `callLlm`, settings), P7a (`Knowledge`, glossary, `data-analyze`), and the packages whose events it remembers: P4, P5, P6, P9, P9b, P9e, P9c, P9d. **Read:** overview (§5.2, §5.3, §5.4); this file; P3 **Implemented as**; P7a **Implemented as** (`Knowledge`, `registerKnowledgeRule`); P9c **Implemented as** (squad secrets are *not* facts); P9b and P9e **Implemented as** (votes, scapegoat, her call).

**Analysis tool (P7a):** every new player-facing stat, chip, option and card in this package carries `data-analyze`, has a glossary entry or registry `description`, and live values get a provider reading through `Knowledge`. No pronoun for the commander in any text (lore §0).

## Why this package exists

An audit of P0–P9c (2026-11-16) found that the engine *keeps* almost everything, but the models *see* very little of it, and only for one to three days:

- **Facts** are the only long memory the main model sees: at most 120 in the save, hard-deleted past the cap (least important, then oldest); 8 per scene; top **6** per prompt (3 in a DM), scored `3·participants + 2·tags + importance + 3·0.8^age` (the recency term halves in ~3 days and is gone in ~14). A fact shows only if **every** present unit knows it.
- **The chronicle** (scene lines → day → week) is read by **no model**: only the LOG tab.
- **`Relation.history`** (60 entries per unit: `protected`, `endangered`, `abandoned`, `took_blame`, `overrode_her`, `decision_violated`, … each with its evidence) is read only by the analysis panel.
- **Combat and expedition results** leave a chronicle line and a 3-day world line; deaths, breakdowns and who was protected never become a fact. The recap is never shown to a model.
- **Votes, the scapegoat, dilemma choices, P9 measures, refused demands, desertion and return, mutiny, DM edits, peeled decor, removed tokens, cancelled bookings, wager results** change numbers and flags, and some set a directive that lives one reply, one scene or two days; then nobody remembers why.
- **DMs** never reach a scene; a DM reply sees 3 facts and the last 6 messages.
- **`scene_summary`** sees only the last 3000 tokens of a scene.
- **The block** `[ALIUS CONTEXT]` is capped at 1200 tokens with strict priority; facts (70) sit below units, world settings and the commander, so a busy scene drops them first. Nothing about memory is configurable in the UI.

## Goal

The squad **remembers what happened to it** and the main model is told, within a budget the player sets:

1. Engine events become facts with the right audience (who saw it), and the rest of the squad hears of them later as rumors.
2. Old facts are not deleted but **folded** into a per-unit dossier that always reaches the prompt.
3. The relation journal, a short chronicle ("recently in the unit") and a summary of recent DMs reach the prompt.
4. Long scenes are summarized whole; old scenes may be hidden from the ST chat once Alius remembers them.
5. Memory has its own budget inside the context cap, presets in SYS, a fill indicator, and a MEMORY view where the player can read, pin and forget (and, with the edit lock off, edit).
6. A fact can be hidden from the commander (P12 needs it).

## Principles

- **The engine decides what is remembered** (overview P1–P3). Which event becomes a fact, who knows it, when a rumor spreads, what is folded: engine computations. Models only *word* (the fold, the optional rumor retelling, summaries) and never write numbers.
- **Data, not code** (P4): texts, importance, audience and spread of every remembered event are JSON (`memoryRules`); code reads event types and a closed vocabulary of audiences.
- **Privacy is per audience.** Anything that reaches a shared prompt is filtered by who is present: facts (as today), chronicle entries, the dossier, the journal evidence and DM summaries. A private thing never leaks into a group scene.
- **No new RNG draw.** Rumor spread is a deterministic hash of `(factId, unitId, day)`; seeded tests stay byte-identical.
- **Old saves load untouched.** Every new field is optional; absent config = the `normal` preset; chronicle entries without an audience (written before P3b) stay LOG-only.
- **Fail soft** (P0): without a mechanic profile, the fold joins and cuts lines, the rumor is told verbatim, the scene digest is skipped.
- **Squad secrets stay P9c's.** A kept secret is still not a `Fact` and nothing here reads `personal.secrets` text.

## 1. Memory configuration (per campaign)

`CampaignState.memory.config?: MemoryConfig` (absent = preset `normal`). Set by the action `memory/configure { preset } | { preset: 'custom', ...fields }`. Read through `memoryConfig(state)` (engine) which fills a preset's values.

| Field | short | normal | long | Meaning |
|---|---|---|---|---|
| `factsMax` | 80 | 160 | 320 | facts kept before the fold must run (pinned facts count; hard ceiling ×1.25 deletes the least important unpinned ones if the fold cannot run) |
| `foldAfterDays` | 4 | 7 | 14 | a fact older than this may be folded into a dossier |
| `recencyBase` | 0.7 | 0.8 | 0.9 | the recency term of retrieval |
| `retrievalK` | 5 | 6 | 8 | facts per scene prompt (DM: half, rounded up) |
| `memoryTokens` | 350 | 550 | 900 | the guaranteed memory share of the context block |
| `journalLines` | 2 | 3 | 5 | journal events per present unit |
| `dmLines` | 2 | 3 | 5 | recent DM messages summarized into a private scene |
| `chronicleDays` | 1 | 2 | 3 | days of "recently in the unit" (plus 1 / 1 / 2 week entries) |
| `rumorMode` | `plain` | `plain` | `plain` | `plain` (deterministic, no model) or `model` (mechanic retells, §4) |
| `hideScenesAfter` | 0 | 0 | 0 | 0 = off; N = hide ST messages of scenes older than the last N ended scenes (§8) |

`contextTokenCap` (P0 setting) stays the overall cap; its default rises from 1200 to **1600** so the `normal` memory share fits beside the current providers.

## 2. Remembered events (`memoryRules`, engine `src/engine/memory/remember.ts`)

A registry `memoryRules` (core pack `content/core/memoryRules.json`), one entry per remembered event:

```
{ id, event: <engine event type>, when?: { <field>: <value> },          // e.g. outcome: 'failed'
  text: "…{name}…{names}…{region}…{outcome}…{option}…",                  // AUTHOR TO WRITE; no pronoun for the commander
  importance: 1–5, about: 'subject' | 'party' | 'world',
  audience: 'subject' | 'party' | 'present' | 'squad' | 'public',
  spread: 'none' | 'slow' | 'fast', hiddenFromCommander?: true, tags: [] }
```

- **The hook.** `dispatch` calls `rememberEvents(draft, events, ctx)` after the handler (in the same draft, before the ledger), for events of a successful action only. A rule never fires for an `error`.
- **Resolvers.** For each event type that a rule names, code holds one **resolver** that reads the event and the draft and returns `{ subjectIds, partyIds, presentIds, vars }` (e.g. `expedition_ended` → the report's party, injuries, deaths, region and mission title; `vote_overruled` → the dissenters; `dilemma_resolved` → the chosen label and title and `affected`). Resolvers are the closed vocabulary (like intent types); a pack adds rules for those types only. An event type without a resolver is a content error at load.
- **Audiences.** `subject` = the units the event is about; `party` = the expedition party (or the combat's participants); `present` = the open scene's participants (or the subject when none); `squad` = every living named unit; `public` = `'*'`. The commander knows unless `hiddenFromCommander`.
- **No double facts.** Sites that already write a fact (punishment, good her call, leader standing, Leash termination, loyalty signs, publicity, rules, wager answers) get no rule; the rule list in §2.1 is exhaustive for v1.
- **Text.** Names come from `displayName`; a dead unit's name still resolves. Text is cut to `factTextMax`.

### 2.1 v1 rules (texts are drafts, `AUTHOR TO WRITE`)

| Event | When | Audience → spread | Importance | Draft text |
|---|---|---|---|---|
| `expedition_ended` | per outcome | party → fast | 3 (failed 4) | "The run to {region} ({mission}) {outcome}." |
| `expedition_ended` | someone died | squad → none | 5 | "{names} did not come back from {region}." |
| `expedition_ended` | someone injured | party → fast | 3 | "{names} came back from {region} wounded." |
| `breakdown` (combat) | — | party → slow | 3 | "{name} broke down under fire at {region}." |
| `mutiny_started` / `mutiny_subdued` | — | squad → none | 5 | "{name} turned her weapon on the unit." / "The mutiny of {name} was put down." |
| `unit_deserted` / `deserter_returned` | — | squad → none | 4 | "{name} deserted." / "{name} came back." |
| `vote_overruled` | — | squad → none | 3 | "The commander overruled the squad's vote; {names} voted against." |
| `vote_carried` | — | squad → none | 2 | "The squad voted on {subject} and carried it." |
| `dilemma_resolved` | not `nothing` | present (else `affected`) → slow | 3 | "{title}: the commander chose to {option}." |
| scapegoat answer (`dilemma_resolved` with scapegoat context) | take / shift | squad → none | 4 | "The commander took the blame for the failed run." / "The commander put the blame for the failed run on {name}." |
| `countermanded` | — | subject + leader → slow | 2 | "{leader} countermanded the commander's order to {name}." |
| `rations_set` | not `equal` | squad → none | 2 | "Rations are now shared by {mode}." |
| `demand_resolved` | refused / expired | subject → slow | 3 | "The commander refused {name}'s demand." |
| `discipline_applied` | — (fact exists) | — | — | *(no rule: the punishment fact exists)* |
| `order_refused` (combat) | — | party → slow | 3 | "{name} refused an order in the field." |
| `leash_used` | compel / suppress | subject → fast (`squad`) | 4 | "{name} was forced through the Leash." |
| `decor_removed_by_commander` | — | subject → none | 2 | "The commander peeled what {name} had put on the device." |
| `token_taken_off` | — | giver → slow | 2 | "The commander took off the token {name} gave." |
| `booking_cancelled` | — | subject → none | 2 | "The commander cancelled the time {name} had booked." |
| `wager_resolved` | — | subject → slow | 2 | "{name} {won\|lost} a wager with the commander ({game}, for {stake})." |
| `intercept_resolved` | `keep` | subject (the editor) → none | 3 | "{name} rewrote a message the commander sent, and it went out as she wrote it." |
| `activity_done` | with a companion | subject → none | 1 | "{name} and the commander spent the {slot} on {activity}." |

A stake or game a content category switched off never names itself (the text says "a wager").

## 3. Facts: config, pinning, hiding, visibility

- `Fact` gains optional fields: `pinned?: true` (never folded, never pruned), `heard?: Record<unitId, day>` (she knows it as a rumor, §4), `rumor?: { text, by }` (the retold version, `model` mode), `hiddenFromCommander?: true`, `edited?: true`.
- `addFact` keeps its signature; pruning becomes **fold first** (§5); past `factsMax × 1.25` the least important unpinned facts are deleted (the old rule) so metadata never grows without bound.
- `retrieveFacts` reads `recencyBase` and `retrievalK` from `memoryConfig`; a pinned fact gets +2.
- **Hidden from the commander.** Such a fact reaches a prompt only when every present unit knows it, worded as "{names} know (the commander does not): …; they do not tell the commander." `registerKnowledgeRule` hides it from readings, the MEMORY view and the LOG. Nothing in P3b creates one except a rule with `hiddenFromCommander`; v1 core rules use none. It is the interface P12 uses (`addFact({ …, hiddenFromCommander: true })`).

## 4. Rumors

- Every fact from a rule with `spread ≠ none` that is not public carries `spread` and `day`. At the **day end** (a new `day_end` step, after upkeep), `spreadRumors(draft, ctx)` walks those facts: each living named unit outside `knownBy` hears it on the day `hash(factId, unitId) mod window` says (`fast`: window 2 days, `slow`: 4; importance ≥ 4 halves the window). Hearing adds her to `knownBy` and `heard[unitId] = day`. No RNG draw.
- A fact stops spreading when everyone knows it or after the window.
- **Prompt wording.** For a present unit who only heard it, the line reads "- (heard as a rumor) …" — in a group scene, only if every present unit knows it (heard or seen).
- **`model` mode.** When a fact first spreads, the app asks the mechanic (`rumor_retell`, new call type, 200 tokens) for one retelling coloured by the teller's bands; stored once as `rumor.text`, shown to every hearer. Without a profile or on failure, `plain`.

## 5. Dossier (folding)

- `memory.dossiers?: Record<unitId | '*', Dossier>`, `Dossier = { own: string; shared: string; day: number; folded: number }`; `own` ≤ 500 chars from facts only she (and the commander) knew; `shared` ≤ 400 chars from facts the whole squad knew; `'*'` is the world dossier (facts `about: []`/`['world']`).
- **When.** `foldDue(state)` (engine, pure): a unit with ≥ 6 unpinned facts older than `foldAfterDays`, or the save over `factsMax` (then the unit, or the world, with the most such facts). The app asks once per due fold after a dispatch settles (like `runCompaction`).
- **How.** New call type `memory_fold` (mechanic, 500 tokens): input = the current dossier + the facts, split `own` / `shared`; output = the two paragraphs. Action `memory/fold { unitId, own, shared, factIds }` replaces exactly the due facts (rejected if not the due set, like `memory/compact`). Fallback without a model: the lines joined into each part and cut (oldest dropped first).
- A fact about several units is folded into the dossier of each unit in `about ∩ knownBy` (or each `about` unit when public), then removed. A hidden-from-commander fact is never folded (it waits; P12 decides).
- **Prompt.** For each present unit: `shared` always; `own` only in a private scene or a DM with her. World dossier `shared` in every scene.

## 6. What reaches the main model (context block)

`ContextBuilder` gains **groups**: a provider may declare `group: 'memory'`; the memory group gets `memoryTokens` as a guaranteed share, the rest share `contextTokenCap − memoryTokens` with the current strict priority. A memory provider receives its own token budget and trims its own items (drop the lowest-scored line, never the whole block). Memory providers, in priority order:

1. **`dossier`** (§5).
2. **`journal`**: per present unit, the last `journalLines` entries of `Relation.history` of kind `event` with a severity of at least `moderate` (or of any severity in the last 2 days), oldest first: "Lately with the commander: protected her (day 12); broke a promise (day 13: '…evidence…')". Evidence only in a private scene; in a group scene types and days only.
3. **`facts`**: as today (moved into the group), plus rumors and hidden facts as worded in §3–4.
4. **`promises`**: as today.
5. **`recent`** ("Recently in the unit"): chronicle entries of the last `chronicleDays` days and the newest week entries whose audience includes every present unit.
6. **`dm_recap`**: in a private scene with a unit, her last `dmLines` DM messages of the last 2 days, as "Messages lately: commander: …; {name}: …" (each cut to 120 chars). Never in a group scene.

Directives stay outside the cap (hard constraints) but are counted in the fill indicator.

**Out of a scene**, the block keeps today's header and world settings; the memory group adds the world dossier and `recent` (public entries only).

**Other calls.** `dm_reply` gets her `own` + `shared` dossier and her journal (in place of nothing) beside the 3 facts; `activity_vignette` gets 2 facts about her and her journal; `flavor` kind `demand` gets her journal; `director_tick` gets the public `recent` lines and the world dossier.

## 7. Chronicle audience

- `ChronicleEntry.audience?: string[] | '*'`: a scene line gets the scene's participants (`'*'` for a group scene of every living named unit), an expedition line the party, a spine or Leash line `'*'`. Absent = written before P3b: LOG only, never a prompt.
- **Compaction per audience.** `compactionDue` groups the due lines by audience; a day or week entry inherits it. One `chronicle_compact` call per due group (as today, one at a time).

## 8. Long scenes and the ST chat

- **Digest.** When the scene's unsummarized transcript (after `scene.digest.upTo`, before the last 4 messages) exceeds 2500 tokens, the controller calls `scene_summary` in a `digest` mode (input: the previous digest + that slice; output: the new digest ≤ 800 chars and facts). Action `scene/digest { text, upTo, facts }` stores `SceneRecord.digest` and the facts (inside the 8-per-scene cap). `scene/end`'s summary input = digest + the tail. A swipe of the last reply never reaches a digested message; an edit of an older one does not redo the digest (documented).
- **Hiding old scenes.** With `hideScenesAfter = N > 0`, after a scene ends **and its summary was stored**, the messages of ended scenes older than the last N are hidden from the model through ST's `/hide` (adapter `hideMessages(from, to)` / `unhideMessages`). `memory.hidden?: Array<[from, to]>` records Alius's own ranges; setting N back to 0 unhides exactly those. Messages stay in the chat. A scene whose summary failed is never hidden.

## 9. UI

- **SYS › MEMORY**:
  - the preset (`short` / `normal` / `long` / `custom`);
  - rumor mode, `hideScenesAfter`;
  - with the edit lock off: every number of §1.
  
  A **fill indicator** shows:
  - facts / `factsMax` (pinned shown apart);
  - dossiers;
  - chronicle entries;
  - the last prompt's memory tokens / `memoryTokens` and directive tokens;
  - the save's metadata size.
  
  Every value carries `data-analyze` (glossary `memory_*`).
- **MEMORY view** (a block in each unit's dossier in the SQUAD tab, and the world in SYS):
  - Her dossier (`own`, `shared`) and her facts, newest first, with day, audience chip (`SEEN` / `HEARD` / `PUBLIC`) and importance.
  - **PIN** / **UNPIN** and **FORGET** (`memory/pin`, `memory/forget`) are always available.
  - With the edit lock off: **EDIT** a fact's text (`memory/edit`, marks `edited`) and the dossier (`memory/edit_dossier`).
  - Hidden-from-commander facts are not listed (Knowledge).
- The LOG tab is unchanged (it shows every chronicle entry, private ones included: the commander was there).

## 10. Data

- New registry `memoryRules` (+ zod schema, content validation: event type has a resolver, `{var}`s are the resolver's, `when` fields exist).
- New call types `memory_fold` (500), `rumor_retell` (200); `scene_summary` gains the `digest` mode (same budget).
- `TUNING.memory` keeps the hard limits (`factTextMax`, `factsPerScene`, `closedPromisesMax`, dossier caps, digest threshold, fold batch); the preset table is `MEMORY_PRESETS`.
- Glossary: `memory`, `memory_fill`, `memory_preset`, `dossier`, `rumor`, `pinned_fact`, `memory_budget`, `hidden_scenes`.

## 11. Acceptance

1. A failed run with an injury and a death leaves facts for the party (seen) and the death for the squad; a squad member not in the party hears the run within 2 days and the prompt calls it a rumor.
2. After a vote is overruled, a scene with a dissenter two days later still names the vote (fact), after the grudge directive is gone.
3. A scapegoat answer is remembered by the squad; the shifted unit's journal line names it.
4. With 7 days of play under `normal`, no fact was hard-deleted; old facts of a unit are in her dossier; a group scene shows only `shared` parts.
5. A private scene line never reaches a group scene's prompt; pre-P3b chronicle entries reach no prompt.
6. With no profile: fold, rumor and digest fall back; nothing throws; state stays valid.
7. A seeded test from before P3b gives the same RNG state (no new draw).
8. An old save loads with no migration; absent config reads `normal`.
9. `hideScenesAfter` 2 → older ended scenes are hidden in ST; back to 0 → exactly those are unhidden.
10. The fill indicator matches the state; every new UI element has `data-analyze`; no pronoun for the commander (`tests/content/pronouns.test.ts`).

## 12. Interfaces this package provides (for P10b, P12, P13)

`memoryConfig`, `MEMORY_PRESETS`, `rememberEvents`, registry `memoryRules` (+ a resolver per event type: `registerMemoryResolver`), `addFact({ hiddenFromCommander, pinned })`, `spreadRumors`, `foldDue` / `applyFold`, `memory.dossiers`, `ChronicleEntry.audience`, `ContextProvider.group: 'memory'`, actions `memory/configure`, `memory/fold`, `memory/pin`, `memory/forget`, `memory/edit`, `memory/edit_dossier`, `memory/rumor_text`, `memory/hidden`, `scene/digest`, `memory.summarized` (the last 50 summarized scene ids), adapter `hideMessages` / `unhideMessages`. P12 writes hidden facts and rumors through these; P13 tags `kompromat` facts.

## 13. Open questions (decide in the plan or leave to the author)

- The texts of §2.1 (author).
- Whether a world-option effect may scale rumor speed (v1: no).

## Implemented as

### Rulings from the owner (2026-11-16)
- **What is remembered:** all four groups (runs and combat; power decisions; discipline and dilemmas; P9c personal pressure). §2.1 is the exhaustive v1 list: 28 rules in `content/core/memoryRules.json`. A site that already writes a fact gets no rule.
- **Who learns:** witnesses at once; the rest hear it as a rumor over 1–2 days (fast 2, slow 4, halved at importance ≥ 4, minimum 1). The spread is deterministic.
- **Rumor mode:** `plain` (default, no call) or `model` (the mechanic retells it once per fact); the setting is in SYS › MEMORY.
- **Forgetting:** the mechanic **folds** old facts into a per-unit dossier **when memory fills** (`foldDue`), not on a schedule. The number kept is a setting and the fill is shown.
- **Settings:** presets plus fields; the numbers can be edited only with the edit lock off (no new "advanced" switch).
- **MEMORY view:** normal mode: view, pin and forget; edit lock off: also edit a fact, the dossier and the numbers.
- **Journal in the prompt:** per present unit the last `journalLines` events of kind `event` with severity ≥ `moderate`, plus any severity of the last 2 days; evidence in a private scene only.
- **Chronicle in the prompt:** "Recently in the unit", filtered by audience; it reaches scenes, the block outside a scene (public lines only) and `director_tick`.
- **DMs:** a private scene gets a recap of recent DMs; `dm_reply` also gets her dossier and journal.
- **Hidden from the commander:** laid down now (`Fact.hiddenFromCommander`, the Knowledge rule, the prompt wording); v1 core rules create none.
- **Extras:** whole-scene digest, hiding old scenes (off by default), memory's own budget and memory in calls outside a scene are all in v1.

### Findings from the code (decided before the build; refine §§2–8)
1. **Rumors use the existing hook:** `spreadRumors` is registered with `registerDayEndStep('dm_rumors', …)` in `actions/memory.ts`; `DAY_END_STEPS` is unchanged, so the `day_end_step` events are the same. The spec's "new `day_end` step" is not built.
2. **Events of a day end are seen:** day-end steps run inside the handler, so `unit_deserted` etc. reach `rememberEvents` in the same dispatch; combat events (`breakdown`, `order_refused`) come back from the `combat/*` handlers.
3. **Resolvers return named id groups,** not the spec's single `subjectIds`: `{ ids: Record<string, string[]>, vars: Record<string, string> }`, declared in `RESOLVER_SHAPES`. A rule's `about` is an id group or `world`; `audience` is an id group, `present`, `squad`, `public` or a list (the union); `when` matches a var (`true` = non-empty, `false` = empty, a string = equal) or an id group. The loader checks all of it (`registerChecks('memoryRules')` in `content/refs.ts`).
4. **`dilemma_resolved` lacks its context** once `flow.ts` deletes the open dilemma: it now carries `context`, `units`, `optionId` and `subjectId` (all optional). `activity_done` carries the `slot` and `demand_resolved` a `postponed` flag for a postponed desire demand; `vote_carried` carries `overruled: true` for an overruled vote (which `vote_overruled` already remembers).
5. **The expedition report keeps a hidden injury out of `injuries`,** so "came back wounded" never names one (pinned by a test).
6. **Scene ranges live in `memory.scenes`** (`{ sceneId, from, to, summarized }`, the last 50), not on the chronicle line (day compaction would lose them). `scene/end` takes `endIndex` (the controller sends `chatLength − 1`). This replaces the spec's `memory.summarized`.
7. **Hidden messages are system messages:** `hideMessages(from, to)` hides only the runs of messages that were not system messages and returns them; only those runs are recorded (`memory.hidden`) and later unhidden, so a narrator line stays hidden. A range past the chat end is dropped (one that ends past it is cut).
8. **DMs ask for `ceil(retrievalK / 2)` facts;** `FACTS_USED` of `dm_reply` is 4.
9. **Journal wording:** every `eventDeltas` row has a `journal` phrase in the third person ("the commander praised her", "she defied the commander"); a type without one is humanized; internal types (`stress_high`) never show.
10. **Out of a scene** the block holds the header, the world settings, the world dossier's `shared` part and the public `recent` lines.
11. **The digest needs the content exclusion:** it takes the same `excluded` / `flagged` input as the final summary and filters facts the same way.
12. **A void wager is not remembered;** a stake or game of a disabled content category reads "a wager".
13. **`contextTokenCap`:** only new installs get 1600; a stored 1200 stays. SYS warns when `memoryTokens > contextTokenCap / 2`.

### Decisions where the spec was silent
- **Ids and counters:** facts written by a rule take `fr<n>` from `memory.nextRememberId`; `memory.nextId` is never advanced by P3b, so no existing id shifts. Rumor timing is `fnv1a(factId + '\0' + unitId) % span` (the P10 hub's hash); no new RNG draw anywhere (tests compare the RNG state of a combat round, an expedition end and a day end with and without rules).
- **Config:** `MEMORY_PRESETS` is the spec's table; `MEMORY_RANGES` are draft numbers (factsMax 40–600, foldAfterDays 1–60, recencyBase 0.5–0.95, retrievalK 2–16, memoryTokens 150–2000, journalLines/dmLines 0–8, chronicleDays 0–7, hideScenesAfter 0–20). `rumorMode` and `hideScenesAfter` are the player's own choices: they survive a preset change and are never locked; the other numbers need `preset: 'custom'`. `TUNING.memory.{factsMax,recencyBase,retrievalK}` are gone (the preset table owns them); pruning deletes only past `floor(factsMax × 1.25)`, unpinned, least important then oldest.
- **Rules:** the 28 texts are §2.1's drafts; `vote_carried` says `{what}` (the vote's subject), `rations_set` has two rules (`when` cannot say "not equal"), `leash_used` is remembered only when `outcome` is `done`, a postponed desire demand (`demand_resolved.postponed`) and a talk (an activity with `startsScene`: its scene's summary remembers it) are not, and a plain dilemma is about `units` with audience `present` (the open scene, else those who were there).
- **Fold:** a fact is foldable when older than `foldAfterDays` (strictly), unpinned and not hidden. `foldTargets` says whose dossiers it goes into: what the whole squad knew goes to **every** unit it is about (the world dossier `*` when it is about nobody or only about units who are gone); what only some knew goes to the private part of those it is about who know it, else of those it is about, else of those who know it (so a secret about the world lands in the dossier of each who holds it). A fact about several units is offered to each in turn (`Fact.foldedInto`) and removed when every target has it; `sweepCovered` (run by every fold and every new fact) also removes one whose other target has died. `memory/fold` accepts an empty text for a part that has no new facts (it keeps what it was).
- **Chronicle:** "the last `chronicleDays` days" = that many days back plus today; the newest 1 week entry (2 when `chronicleDays` ≥ 3). Lines with different audiences are compacted one group at a time (the group of the first line first); `memory/compact` takes an optional `audience` that must equal the due group's.
- **Context builder:** a provider may declare `group: 'memory'` and `core: true` (the header, scene header and units are core and keep their room whatever the share). The share is up to `memoryTokens`, never the room the core providers need; what memory does not use goes back to the other providers. With a share of 0 the group is ordinary (every pre-P3b caller is byte-identical). The builder itself cuts a memory provider that ignores its budget (whole lines from the end, then characters). The six providers are `dossier` 70, `journal` 65, `facts` 60, `promises` 55, `recent` 50, `dm_recap` 45.
- **Calls:** `scene_summary` stays one call type (a chronicle line or a digest text; the digest transcript gets 4500 tokens). `upTo` is the index of the last digested message (inclusive). The end summary reads `digest + messages after upTo`. A retelling is asked once per fact per chat, at most 3 per run. The memory controller does nothing while a combat or an expedition is open (those accept only their own actions); the app runs it after any dispatch with events and again after `memory_folded`.
- **Inputs for other calls** are one pure module, `engine/memory/inputs.ts` (`herDossier`, `herJournal`, `herFacts`, `vignetteMemory`, `publicRecent`, `worldDossier`). The director's `recent` / `worldDossier` are separate optional fields of `DirectorTickInput`, not of the engine `Digest`.
- **UI:** glossary ids are `memory`, `memory_preset`, `memory_budget`, `memory_fill`, `dossier`, `squad_rumor`, `pinned_fact`, `hidden_scenes`: the spec's `rumor` is **already P5's mission-board gossip**, so the spreading kind is `squad_rumor`. The fill indicator counts facts through `Knowledge`; the MEMORY view is mounted in every named unit's block (the app passes `memory` hooks to `renderSquadTab`) and, for the world, under SYS › MEMORY.

### Open items
- **An edit of a digested message does not redo the digest** (as the spec says); a swipe of the last reply never reaches a digested message.
- **The 28 rule texts and the 49 `journal` phrases are author drafts** (`AUTHOR TO WRITE`); so are the glossary long texts.
- **The world dossier's `own` part** is used only by a fact nobody living knows (no prompt carries it and the MEMORY view does not show it).
- **`MEMORY_RANGES` and the digest threshold (2500 tokens, keep 4)** are balance placeholders.

### Non-obvious things to know
- **Every remembered event goes through `rememberEvents`,** called by `dispatch` after the handler and `carryVote`, inside its own `try`: a failing rule never fails an action. A new event that should be remembered needs a resolver (`registerMemoryResolver`) and a rule; a site that already writes a fact must not get a rule.
- **Privacy per audience** is enforced in the providers and `recentLines`, not in the data: a chronicle entry without `audience` is LOG-only; a fact shows only if every present unit knows it (`factsVisibleTo`); `own` dossier, journal evidence and the DM recap render only in a scene with exactly one unit.
- **The memory controller dispatches with `expectChatId`:** a fold or digest answer that arrives after a chat switch is dropped; a stale fold (a fact pinned or added in between) is refused by `applyFold` itself.
- **Anything keyed by a scene id** (the retelling's `tried` set) is reset when another chat opens.
- **`registerMemoryProviders()`** registers both the Knowledge rule that hides `hiddenFromCommander` facts and the readings; it runs from `registerCoreProviders`.
