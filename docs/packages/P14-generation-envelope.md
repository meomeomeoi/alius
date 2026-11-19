# P14 — Generation Envelope: Retry, Refusals, Reroll

**Status: implemented** (plan: `docs/plans/2026-11-19-p14-generation-envelope.md`; see **Implemented as** at the end; where it differs from the draft, the code wins). The last package of release 0.1.0. **Depends on:** P0 (`callLlm`, call types, budgets), and every package that owns a call site (P1, P2, P3, P5, P6, P7, P9, P9c, P9d, P11; P3b and P10b if they land first). **Read:** overview; this file; `src/llm/orchestrator.ts`; the **Implemented as** of P3 (scene controller), P5 (director), P6 (dilemmas) and P9d (violations).

**Analysis tool (P7a):** every new chip, button and list row carries `data-analyze` with a glossary entry.

## Goal

A failed mechanic call must never be a silent "the system did nothing this time". Whatever the cause (a refusal, a timeout, an answer cut off by the token budget, invalid JSON, a network error), the player sees what failed and can run it again. A successful generation the player dislikes can be rerolled too. Every existing generation is wrapped, and the code makes it impossible to add an unwrapped one.

Today `callLlm` retries once with a 1.5× budget and then fails soft (`LlmResult { ok: false }`); the caller drops the result and, outside debug mode, nobody knows. Only the profile import (`wizard.regenerate`) and content violations (`drawViolation` → `[REGENERATE]`) let the player try again.

## 1. Failure reasons

`LlmResult.reason` grows from `no_profile | call_failed | invalid_output` to:

| Reason | Detected by |
|---|---|
| `no_profile` | as today |
| `network` | the adapter threw (connection, HTTP error) |
| `timeout` | the adapter threw a timeout, or the call ran past `settings.llmTimeoutMs` (new, default 120 s) |
| `truncated` | the adapter reports a length stop (`finishReason: 'length'`, where ST exposes it), or the text has an opened and unclosed JSON object/array |
| `refused` | the text matches a refusal pattern and has no parsable JSON (see below), or the parsed JSON is empty where the schema requires content |
| `invalid_output` | JSON found but the schema rejected it |
| `empty` | nothing came back |

**Refusals.** Patterns live in content (`content/core/llmRefusals.json`: `{ id, pattern (regex, case-insensitive), lang }`), so the author can extend them without code. A refusal is not retried automatically with the same prompt (it would refuse again): it goes straight to the queue (§2) with the reason shown, and the retry dialog offers a higher budget and, if a main/mechanic profile differs, the other profile.

`StAdapter.generateWithProfile` / `generateMain` gain an optional `finishReason` in their result where the ST API returns one (verify against the current ST source; isolate it in `src/st/`).

## 2. The envelope and the queue

Every generation runs through **one** function:

```
generate<T>(siteId: GenerationSiteId, key: string, deps): Promise<GenerationOutcome<T>>
```

A **site** is one place that asks for a generation and applies its result: `scene.intents`, `scene.summary`, `scene.reply_vignette`, `dm.reply`, `director.tick`, `dilemma.generate`, `expedition.recap`, `activity.vignette`, `chronicle.compact`, `setup.profile_import`, `setup.commander_import`, `flavor.<kind>` (one per registered flavor kind), `emotion.pick`, and every site a later package adds. A site is registered once:

```
registerGenerationSite(siteId, {
  callType: CallTypeId,
  build(state, key): input | null,          // rebuilds the input from state + chat; null = the moment has passed
  apply(app, key, value): void,             // what the caller did with a success
  reroll: 'free' | 'before_commit' | 'revert' | 'none',
  label(key): string,                       // what the player sees ("Scene summary — Rhea, day 12")
  surface: 'scene' | 'comms' | 'day' | 'expedition' | 'dilemma' | 'setup' | 'world'
})
```

- **Input is rebuilt, not stored.** Campaign metadata must stay small (overview §5.1), so a failed call stores only `{ id, siteId, key, reason, detail, attempts, at, budgetMult }` in `CampaignState.generations?.failed[]` (cap 20, oldest dropped with a log line). `build` reconstructs the input from the state and chat when the player retries; if it returns `null` (the scene was deleted, the dilemma resolved, the day moved past a deadline) the record is closed as `expired` and says so.
- **Success** applies through `apply` exactly as the caller does today. The caller code moves into the site; call sites keep their behaviour.
- **Failure** writes the record, emits `generation_failed { siteId, key, reason }` and leaves the state otherwise untouched (P1: a failed call never corrupts state). The fail-soft fallbacks that exist today stay (the director's `fallbackOutput`, a dilemma's authored block, a flavor's template text, a rule's template text), but they now run **next to** a retry chip, not instead of it: a site may declare `fallback(app, key)` and the record notes `fallbackApplied: true`, so a later successful retry replaces the fallback where the site allows it (see §3).

## 3. Retry and reroll

**Retry** (a failed record): `[RETRY]` on the chip; a long press / secondary button opens options: budget ×1.5 / ×2 / ×3, profile main or mechanic, "drop it". A retry that succeeds closes the record and applies; if a fallback was applied, the site's `reroll` mode decides whether the real result replaces it (`free` / `before_commit` yes, `revert` through the revert path, `none` no: the record closes as "kept the fallback").

**Reroll** (a success): the result card / line carries `[REROLL]` where the site allows it:

| Mode | Meaning | Sites (initial ruling; the plan confirms each) |
|---|---|---|
| `free` | The result is text only; replace it. | vignettes, recaps, `dm.reply` before the next message, flavor wordings (rule, demand, `dm_edit`, names), chronicle compaction |
| `before_commit` | Replace it until the player has acted on it. | dilemma text before an answer; director offers before one is taken; profile/commander import before deployment (today's `wizard.regenerate`) |
| `revert` | The result changed state; reroll restores the state it applied to and applies the new result. Allowed only while nothing else has changed since (`app.restoreSnapshot(snap, expected)`). | `scene.intents` of the last exchange, `scene.summary` of the last scene |
| `none` | Not rerollable. | `emotion.pick`, a director tick already applied a day ago |

The `revert` sites keep one snapshot per site (the last application), never more: memory stays small. When the condition fails (something happened after), `[REROLL]` is shown disabled with the reason (`aria-disabled`, analyze explains).

Every reroll and retry is a normal call: it is logged in `llmLog`, budgeted, and goes through the same failure path.

## 4. Where the player sees it

- **On the spot.** A failure chip in the surface that asked: under the scene reply, in the DM thread, on the day-end report, on the dilemma card, on the after-action report, in the wizard section. Text: what failed + why in plain words ("Scene summary: the model refused." / "…the answer was cut off at 800 tokens.") + `[RETRY]`.
- **SYS › Generations.** A list of open failed records across the campaign, newest first, with the same buttons, and a counter badge on SYS. Expired records show for a day, then go.
- **Hub.** `tonightItems` gets one line "N generations failed" at the end of its order when any is open.
- **Debug mode** keeps today's toasts and adds the raw text to the record view.

## 5. Coverage is enforced

- **Architecture test:** `callLlm` may be imported only by `src/llm/envelope.ts`. Any other import fails the test, so a new generation must register a site.
- **Registry test:** every `CallTypeId` and every registered flavor kind has at least one site; every site has `label`, `surface`, a `reroll` mode, and a glossary entry for its chip.
- **Fixture tests** per reason (refused, truncated, timeout, invalid, empty, network) through the envelope for one site of each `reroll` mode, including `expired` and the `revert` refusal when state moved.
- A new package that adds a call type adds its site in the same change (this note goes into every later spec's "Interfaces already provided by P14").

## 6. Settings

`llmTimeoutMs` (10–600 s, default 120) and `autoRetry` (0–2 automatic retries before queuing, default 1 = today's behaviour; refusals are never auto-retried) — SYS › Generation.

## Acceptance criteria

1. Each failure reason is classified correctly from recorded fixtures (refusal text, truncated JSON, length stop, timeout, invalid schema, empty, thrown error).
2. Every existing call site runs through `generate`; the architecture test fails on a direct `callLlm` import.
3. A failed generation leaves a record and a chip at its surface and in SYS; RETRY rebuilds the input, applies on success, closes the record; an `expired` record says why.
4. Fallbacks still apply; a later successful retry replaces them per the site's mode.
5. REROLL works per mode; `revert` restores and reapplies only when nothing changed since, and is disabled with a reason otherwise.
6. State stays small: no prompt, transcript or raw output is stored in campaign state.
7. Every new chip and list row carries `data-analyze`.

## Interfaces already provided (implemented — use, do not rebuild)

- **P0:** `callLlm(id, input, deps)` with `LlmResult`, `llmLog`, `looseJson`, `stripThinking`, call types in `src/llm/callTypes.ts` and `src/llm/calls/`, budgets in settings.
- **P3:** `app.restoreSnapshot(snap, expected)` (conditional restore) and the scene controller's `send`/`resume`.
- **P5:** `director/fallback`, `fallbackOutput`; **P6:** the dilemma's authored block when generation is off or fails.
- **P9d:** `drawViolation(host, labels, onRegenerate)` and the scene reply `[REGENERATE]`: the content-violation regenerate is the main-model reply, not a mechanic call, and stays as is; P14's chips reuse its look.
- **P1/P7:** `wizard.regenerate(index, section)`: becomes the `before_commit` reroll of the import sites.

## Implemented as

Chunks (a) classification, records and the envelope, (b) every call site, (c) where the player sees it. The plan's rulings are binding where this section does not say otherwise; the three the user answered on 2026-11-19 are marked **(user)**.

### The rulings (copied from the plan)

- **Where a failure is classified** (`attemptLlm` in `src/llm/orchestrator.ts`, in this order): no profile → `no_profile`; an `AbortError` or a run past `llmTimeoutMs` → `timeout`; any other throw → `network`; raw text empty after `stripThinking` → `truncated` when it had an unclosed think tag, else `empty`; JSON call types: no JSON and a refusal pattern → `refused`, no JSON with a length stop or an unclosed `{`/`[` → `truncated`, no JSON otherwise → `invalid_output`, JSON that fails the schema → `refused` when it is `{}` / `[]`, `truncated` on a length stop or a cut, else `invalid_output`; text call types: a refusal pattern of scope `any` → `refused`. `call_failed` is gone (`setup/*` read the reason through `describeFailure`).
- **Refusal patterns** are content (`content/core/llmRefusals.json`, registry `llmRefusals`: `{ id, pattern, lang, scope: 'json' | 'any' }`, default `json`; a pattern that does not compile is a content error). Only `any` patterns are tried on prose (AI-voice phrases such as "as an AI"); an in-character "I can't do that, Commander." is not a refusal. 8 English draft entries, **AUTHOR TO EXTEND**. The envelope compiles them (`compileRefusals`) and hands them to `callLlm` as `deps.refusals`; the orchestrator has no registries.
- **Automatic retries:** `callLlm` makes up to `1 + autoRetry` attempts (`autoRetry` 0–2, default 1 = the old behaviour). `refused` and `no_profile` are never retried; `truncated` and `invalid_output` retry with the budget ×1.5 each time; `network`, `timeout` and `empty` with the same budget.
- **Timeout** `llmTimeoutMs` (10 000–600 000, default 120 000). Profile calls pass `AbortSignal.timeout` to `sendRequest`'s `custom.signal`; main-profile calls race a timer and the late answer is ignored and logged in `llmLog` as `late`.
- **`finishReason`:** `RealStAdapter.generateWithProfile` uses `extractData: false` (with `extractData: true` ST drops the stop reason), reads the text with `answerText` and the reason with `finishReasonOf` (`choices[0].finish_reason`, `stop_reason`, `candidates[0].finishReason`, each `length`-like value normalized to `'length'`, anything else `'stop'`); `generateMain` reads `generateRawData` the same way.
- **Record modes per site:** `full` (chip on the spot, SYS, badge, hub line), `quiet` (SYS only, not counted by the badge or the hub line) **(user: background calls are SYS only)**, `none` (the caller's own path says it).
- **Fallback and retry:** `fallbackApplied: true` on the record; a later success applies per the site's mode (`free` / `before_commit`: `apply` replaces the fallback; `revert`: through `undo`, then `apply`; `none`: the record is never written).
- **Expiry:** `build` returning `{ expired }` → `generation/expire`; an expired record shows for the rest of that day and the next (`generation_sweep` removes it when `expiredDay < day - 1`); open records stay until retried, dropped, auto-closed (a success of the same `siteId + key`) or pushed out by the cap of 20.
- **Revert snapshots** live in the envelope (`Map<siteId, { chatId, key, before, after }>`, the last application only, cleared on a chat change); `rerollState` is enabled only while `current().state === after`, else `Something happened since: this can no longer be rerolled.` (`MOVED_REASON`). `scene.intents` uses the scene controller's own `lastApply` instead.
- **`dm.reply` is `revert`** **(user)**: the snapshot spans `dm/receive` and the reading (`dm.intents`), so a reroll never leaves deltas from words she no longer said.
- **`director.tick` is held** **(user)**: a failed tick keeps the request open and records it; `[USE FALLBACK]` dispatches `director/fallback`; the day-end step falls back as before and the record expires with "The day ended: the engine planned the world." With the director off, or no profile and no fallback, it falls back at once with no record.

### The sites as built

28 declarations in `src/llm/sites.ts` (data only; the owning controller binds the handlers with `envelope.bind`). `scene.reply_vignette` of the draft has no call in the code, so there is no such site; the draft's `dm.reply` is split by entry point.

| Site | Surface | Reroll | Record | Notes |
|---|---|---|---|---|
| `scene.intents` | scene | revert | full | key `<sceneId>:<from>-<to>`; one record per chunk; the next pass closes it |
| `scene.summary` | day | revert | full | a failure ends the scene with the plain line (`fallbackApplied`); RETRY stores it later with `scene/late_summary` (needs the `participants` / `day` / `locationId` of the scene mark) |
| `scene.digest` | scene | none | quiet | the next exchange tries again |
| `emotion.pick` | scene | none | none | native sprite |
| `dm.reply` | comms | revert | full | key `<unitId>:<commanderMsgId>` |
| `dm.initiate` / `dm.intents` | comms | none | quiet | |
| `dm.door` | comms | none | full | key = the night entry id |
| `director.tick` | world | none | full | held; `SiteDecl.held` makes the chip offer USE FALLBACK |
| `dilemma.generate` | dilemma | before_commit | full | the authored block shows at once (`fallbackApplied`); `dilemma/reword` replaces it until an answer; a scapegoat case is never asked |
| `expedition.recap` | expedition | free | full | `expedition/set_recap` replaces |
| `activity.vignette` | day | none | quiet | |
| `chronicle.compact`, `memory.fold` | world | none | none | the joined text stands, nothing is recorded |
| `memory.rumor` | world | none | quiet | |
| `flavor.grunt` | day | free | quiet | `AliusApp.rerollGrunt` |
| `flavor.enemy` | expedition | none | none | |
| `flavor.demand`, `flavor.rule` | day | free | quiet | `demand/reword`, `bonds/reword_rule`; the template text is delivered meanwhile |
| `flavor.ballot`, `flavor.dm_edit`, `flavor.frequency_fragment` | day / comms / scene | none | none | a fragment record would be a trace of what she overheard |
| `warden.agenda` | world | before_commit | quiet | only while the agenda is the fallback and no override fired |
| `warden.judge` | world | none | none | rules alone (as before) |
| `warden.epilogue` | world (END screen) | free | full | `campaign/epilogue { replace: true }` |
| `setup.profile_import`, `setup.commander_import` | setup | before_commit | none | no campaign yet: the wizard shows `describeFailure` |
| `sys.ping` | sys | none | none | SYS › PING reports the reason |

### Where it lives

- **Engine** (`src/engine/generations.ts`, `src/engine/actions/generations.ts`): `CampaignState.generations?: { seq, records }`, at most 20 `GenerationRecord`s (`{ id: g<n>, siteId, key, reason, detail ≤ 160, attempts, day, slot, at, budgetMult, fallbackApplied?, status, expiredWhy?, expiredDay?, quiet? }`); actions `generation/failed`, `generation/close` (`applied` / `dropped` / `kept_fallback`; closed records are removed), `generation/expire`; the day-end step `generation_sweep`. The actions are in `ALWAYS_OPEN` and `ENDED_OK_PREFIXES`. None draws from the rng. Other actions added: `scene/late_summary`, `dilemma/reword`, `demand/reword`, `bonds/reword_rule`.
- **Envelope** (`src/llm/envelope.ts`): `generate`, `retry`, `reroll`, `rerollState`, `drop`, `useFallback`, `takeSnapshot`, `clearSnapshots`, `bind`; `createEnvelope(host: EnvelopeHost)` never imports `src/app.ts`. It is the only module that imports `callLlm`; `tests/architecture.test.ts` refuses a direct `callLlm` / `attemptLlm` value import and an async wrapper in `src/llm/calls/`. `describeFailure` words a record (`<label>: <why>.`).
- **UI** (`src/ui/generation/`): `drawGenerationChip` (`alius-chip alius-genfail`), `drawReroll`, `openRetryMenu`, `chipsFor`, and `surface.ts` (`GenerationUi`, `drawGenerationChips`, `drawSiteReroll`, `runPending`, `drawRecordChip`); a screen takes one optional `generation` in its context and draws nothing without it. SYS › GENERATIONS is `src/ui/shell/generationsSection.ts` (`generationBadge`, `renderGenerationsSection`); the SYS tab badge, the hub FAILED block and the hub line `N generations failed.` (`fullOpenRecords` in `src/llm/sites.ts`, last in `tonightItems`, inside the cut of six) read the same records. Readings: `src/analysis/providers/generation.ts`.
- **Surfaces:** the scene (chips of the open scene's chunks; REROLL beside the swipe buttons), COMMS (under her thread; REROLL on her last reply; a failed door answer while the knock is open), the dilemma card, the after-action report, the hub FAILED block (day and world sites; REROLL on `LAST SCENE` while its summary can be asked for again), the END screen, demand and rule cards, a grunt's row on BASE and the WARDEN panel (agenda).

### Non-obvious things to know

- **`no_profile` writes no record.** SYS › GENERATIONS shows one standing line while there is no mechanic profile and `mechanicFallbackToMain` is off. A site whose fallback already applied and whose reroll mode is `none` writes none either (nothing a retry could change).
- **`detail` is never the model's text.** A refusal's detail is the fixed phrase "the answer matched a refusal pattern"; the first version stored the refusal text itself (found by `tests/llm/envelopeFixtures.test.ts`, fixed in `orchestrator.ts`). A schema failure's detail is a zod path and message, an adapter failure's its error message.
- **`extractData: false`** is what makes the stop reason visible; do not switch it back.
- **Long press belongs to the analysis tool** (P7a); the retry options are the `[⋯]` button.
- **The dilemma's `maxAttempts` loop is now `autoRetry`** (an engine rejection is an `invalid_output` attempt of the `apply` handler); the fallback of a rejection stays in `presentDilemma`.
- **A retried or rerolled answer is checked again after the call:** `build` is asked again, and a different key, an `expired` result or another chat drops the answer (`expectChatId`). A second `generate` of the same key while one runs returns `stale`.
- **Seeded runs do not move.** The fake adapter's empty queues throw (a `network` failure); the unaffected weeks run with no profile and no fallback, so `no_profile` writes nothing and their states stay byte-identical.
- **Hidden truth:** site labels are generic ("The warden's agenda", "Scene summary"), a fragment has no site record, and `tests/ui/generationChip.test.ts` runs the labels of every site against the sentinels of `tests/fixtures/analyze/hidden.ts`.
- **The chip's "cut off at <n> tokens"** is the call type's budget times the record's `budgetMult`; the request floor of a mechanic call is not applied, so it can differ slightly from what was sent.
- **A modal cancels the open one**, and the base decision is a modal: the retry menu opened from its chip would lose the decision, so `genUi.modal` in `app.ts` opens the decision again when the menu closes while it is still unanswered (`tests/app.loyalty.test.ts`).
- **A pending button** is module state in `surface.ts` (a redraw makes new buttons): `runPending` keys it by record id or `reroll:<siteId>:<key>`.
- **Gen containers use the class `alius-generation-chips` only**: an `alius-chips` sibling in front of the proposal chips broke `tests/ui/scene.test.ts`.
- **A new call type registers its site in the same change** (a `SiteDecl` in `sites.ts` and the handlers in its controller); `tests/llm/siteRegistry.test.ts` enumerates call types and flavor kinds.

### Open items

- **Refusal patterns are English only** (AUTHOR TO EXTEND, `docs/CONTENT.md` § `llmRefusals`).
- **A toast with buttons:** the warn toast on a `full` failure only names it; RETRY is on the chip.
- **A vignette reroll** (the toast is transient; nothing is stored to replace).
- **The author's:** the `long` texts of the six glossary entries (`generation_failed`, `generation_reroll`, `generation_record`, `generation_reasons`, `setting_llm_timeout_ms`, `setting_auto_retry`) are drafts (AUTHOR TO WRITE).
- **An expired `dm.door` record** is listed in SYS only (the knock is over, so no thread draws it).
- **Not covered by an automated test:** the in-SillyTavern behaviour (a real refusal, a real timeout, the stop reason of each provider) — `docs/MANUAL_TEST_P14.md`.

Final counts at the end of the package: 441 test files, 7015 tests, all passing (baseline before chunk (c): 437 files, 6941 tests); `tsc` clean.
