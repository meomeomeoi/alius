# P14 Generation Envelope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every model call runs through one envelope. A failed call is classified (refused, truncated, timeout, network, invalid, empty, no profile), leaves a small record and a chip where it happened, and can be retried. A disliked success can be rerolled where its site allows it. A test makes an unwrapped call impossible.

**Architecture:**
- **Classification** (`src/llm/orchestrator.ts`, `src/st/`): the adapter returns `{ text, finishReason? }` and takes an `AbortSignal`. `attemptLlm` makes one attempt and classifies the result. `callLlm` loops over `attemptLlm` under the `autoRetry` setting. Refusal patterns are content (`content/core/llmRefusals.json`).
- **Records** (`src/engine/generations.ts`, `src/engine/actions/generations.ts`): pure engine. `CampaignState.generations?` holds at most 20 failure records with no prompt, transcript or raw text. Three actions write, close and expire them.
- **Sites** (`src/llm/sites.ts`): static declarations (id, call type, surface, reroll mode, record mode, glossary, label). The registry test enumerates them.
- **Envelope** (`src/llm/envelope.ts`): `generate`, `retry`, `reroll`, `drop`, `rerollState`. The owning controller binds a site's runtime handlers (`build`, `parse`, `apply`, `fallback`, `committed`, `undo`) with `envelope.bind`. The envelope is the only module that imports `callLlm`.
- **Call sites** (chunk b): each controller stops calling the `llm/calls/*` wrappers and calls `app.generations.generate(siteId, key)`. Each wrapper module keeps its call type and its sanitizer. The async wrapper is deleted.
- **UI** (chunk c): one chip component (`src/ui/generation/`) used by the scene, COMMS, hub, dilemma card, after-action report, END screen and wizard. A SYS › GENERATIONS list, a SYS badge, a hub tonight line and the SYS › Generation settings.

**Tech Stack:** TypeScript 5 (strict), esbuild, zod 3, vitest (+ jsdom for UI). No new dependencies.

**Spec:** Read these before Task 1:
- `docs/00-overview.md` (§5.2, §5.4, §11).
- `docs/packages/P14-generation-envelope.md`.
- The **Implemented as** of:
  - P0 (`callLlm`, budgets, the reasoning payload);
  - P3 (scene controller: swipe undo through `lastApply`, `restoreSnapshot`);
  - P3b (scene marks, digest, fold, rumors, compaction);
  - P5 (director requests, `fallbackOutput`, the day-end step);
  - P6 (dilemma requests, `presentDilemma` retries, the authored block);
  - P9d (`drawViolation`);
  - P13 (warden agenda, judge, epilogue);
  - P7a (glossary, `data-analyze`, coverage).
- `docs/content/lore.md` §0.

## Global Constraints

- **English and safe text.**
  - UI text goes through `h()` / `textContent`, never `innerHTML`.
  - No text a player or the main model reads gives the commander a pronoun (lore §0); `tests/content/pronouns.test.ts` must pass.
- **Engine purity.** `src/engine/**` stays pure (`tests/architecture.test.ts`). The envelope never imports `src/app.ts`: it takes an `EnvelopeHost` interface.
- **No new rng draw.** Records, closes and expiries draw nothing. A retry or reroll that dispatches an existing action draws exactly what that action drew before.
  - Every seeded test stays byte-identical. This includes `tests/warden/unaffected.test.ts`, `tests/special/unaffected.test.ts` and `tests/helpers/unaffectedWeek.ts`.
  - A test that sees a new `generations` field in a state it compares **stops and reports**. It does not get a new golden.
- **State stays small** (acceptance 6).
  - A record is `{ id, siteId, key, reason, detail, attempts, day, slot, at, budgetMult, fallbackApplied?, status, expiredWhy?, expiredDay? }`.
  - `detail` is cut to 160 characters, and it is never the model's text: it is a zod issue path and message, or an adapter error message.
  - At most 20 records (`TUNING.generation.maxRecords`). The oldest is dropped with a `console.info` line.
  - Revert snapshots and the raw text for debug live in memory only (the envelope and `llmLog`), never in state.
- **Old saves.** `generations` is optional and the version stays 1. Absent means no records.
- **Never silent, never noisy.**
  - A `no_profile` failure writes no record. Instead, SYS › GENERATIONS shows one standing line while the mechanic profile is missing and `mechanicFallbackToMain` is off.
  - A site whose fallback already applied and whose reroll mode is `none` writes no record: nothing a retry could change.
- **The engine decides.** A retried or rerolled value goes through the same sanitizer and the same engine action as the first one. Nothing bypasses validation.
- **Hidden truth.**
  - A record's label and detail never carry a hidden value (P12/P13 sentinels).
  - Labels are generic ("The warden's agenda", never an expectation). `tests/fixtures/analyze/hidden.ts` sentinels must not appear in the SYS list.
- **Ids.**
  - Site ids are dotted (`scene.intents`, `flavor.demand`).
  - Record ids are `g<n>` from `generations.seq`.
  - Engine events `generation_failed`, `generation_closed` and `generation_expired` join `RESERVED_EVENT_TYPES`.
  - Actions `generation/failed`, `generation/close` and `generation/expire` join `ALWAYS_OPEN` and `ENDED_OK_PREFIXES` in `dispatch.ts`. A failure can be recorded mid-combat, mid-run and on a closed campaign (the epilogue).
- **Glossary ids:** `generation_failed`, `generation_reroll`, `generation_record`, `generation_reasons`, `setting_llm_timeout`, `setting_auto_retry`.
- **Analysis.** Every chip, button and SYS row carries `data-analyze`. REROLL disabled uses `aria-disabled`, still analyzable, and the reading gives the reason.
- **Memory check** (CLAUDE.md):
  - `generation_failed`, `generation_closed` and `generation_expired` are bookkeeping: nothing to remember, no `memoryRules` entry, no chronicle line, no journal phrase, no prompt provider.
  - The late scene summary (`scene/late_summary`) writes facts and the chronicle line through the existing `scene/end` code (`storeSceneFacts`, the scene line), so it gets no rule. The replaced line keeps its `audience`.
- **Build output.** `npm test` rebuilds `dist/index.js` and `style.css`; commit both with every task. Baseline before Task 1: **419 files, 6780 tests, all passing** (2026-11-19).

## Where the plan rules on the spec (read before Task 1)

Rulings marked **(user)** were answered by the user on 2026-11-19. Task 15 copies all of them into the spec's **Implemented as**.

### Classification (§1)

- **Where it is checked.** `attemptLlm(id, input, deps, opts)` runs one attempt and checks in this order:
  1. no profile → `no_profile`;
  2. the adapter threw an `AbortError`, or ran past `llmTimeoutMs` → `timeout`;
  3. any other throw → `network`;
  4. raw text empty after `stripThinking`:
     - the raw had an opening think tag with no close → `truncated` (thinking ate the budget);
     - else → `empty`;
  5. JSON call types:
     - `looseJson` finds nothing and a refusal pattern matches → `refused`;
     - finds nothing, with `finishReason === 'length'` or an unclosed `{`/`[` → `truncated`;
     - finds nothing otherwise → `invalid_output`;
     - JSON found but the schema fails:
       - the value is `{}` or `[]` → `refused`;
       - `finishReason === 'length'` or `scan` reported a cut → `truncated`;
       - otherwise → `invalid_output`;
  6. text call types: a refusal pattern with `scope: 'any'` matches → `refused`; else ok.

  `call_failed` disappears. Its two uses (`setup/profile.ts`, `setup/commander.ts`) read `reason` through `describeFailure`.
- **Refusal patterns.**
  - Registry `llmRefusals`, entries `{ id, pattern, lang, scope: 'json' | 'any' }`. `scope` defaults to `json`.
  - A pattern is compiled case-insensitive; one that does not compile is a content error.
  - Only `scope: 'any'` patterns are tried on prose (`dm_reply`, recaps, vignettes, epilogue). They must be AI-voice phrases ("as an AI", "I can't assist with that request", "I'm unable to continue this roleplay"). An in-character "I can't do that, Commander" is **not** a refusal (Review Focus 2).
  - Draft list: 8 English entries, marked AUTHOR TO EXTEND.
  - The envelope passes the compiled patterns to `attemptLlm` as `deps.refusals`; the orchestrator has no registries.
- **Automatic retries.**
  - `callLlm` = up to `1 + autoRetry` attempts (`autoRetry` 0–2, default 1; default 1 is today's behaviour).
  - `refused` and `no_profile` are never retried.
  - `truncated` and `invalid_output` retry with the budget ×1.5 per retry.
  - `network`, `timeout` and `empty` retry with the same budget.
  - The returned `attempts` counts them.
- **Timeout.**
  - `llmTimeoutMs` (10 000–600 000, default 120 000).
  - Profile calls pass an `AbortSignal` (`AbortSignal.timeout`) to `sendRequest`'s `custom.signal`, which ST supports.
  - Main-profile calls (`generateRawData`, no external signal) race a timer. The late answer is ignored and logged in `llmLog` as `late`.
- **`finishReason`** (verified against ST `release`, `public/scripts/extensions/shared.js` and `custom-request.js`).
  - With `extractData: true`, `sendRequest` returns `{ content, reasoning }` with no stop reason. `RealStAdapter.generateWithProfile` switches to `extractData: false`.
  - It reads the text with `answerText` and the stop reason from the raw JSON:
    - `choices[0].finish_reason` (`'length'`);
    - `stop_reason` (`'max_tokens'`);
    - `candidates[0].finishReason` (`'MAX_TOKENS'`).

    Each is normalized to `'length'`; anything else becomes `'stop'`, and absent stays undefined.
  - `generateRawData` already returns the raw data: `generateMain` reads it the same way.

### Records, sites and modes (§2, §3)

- **Record modes per site:** `full` (chip on the spot, SYS, badge, hub line), `quiet` (SYS list only; it does not count for the badge or the hub line) **(user: background calls are SYS only)**, `none` (on-the-spot text only, through the caller's existing path).
- **Fallback and retry:** `fallbackApplied: true` on the record. A later success applies per the site's mode:
  - `free` / `before_commit`: `apply` replaces the fallback;
  - `revert`: through `undo`, then `apply`;
  - `none`: the record is never written (Global Constraints).
- **Expiry:**
  - `build` returns `{ expired: string }` → `generation/expire` with that text.
  - An expired record shows for the rest of that day and the next. The day-end step `generation_sweep` removes expired records whose `expiredDay < day - 1`.
  - Open records stay until retried, dropped, auto-closed or pushed out by the cap.
- **Auto-close:** `generate` closes every open record of the same `siteId + key` when it applies (a scene chunk that a later pass re-reads successfully, a director request answered by RETRY).
- **Revert snapshots:**
  - The envelope keeps `Map<siteId, { chatId, key, before, after }>`, one per site and the last application only, cleared on chat change.
  - `rerollState` is enabled only while `current().state === after`; otherwise disabled with `Something happened since: this can no longer be rerolled.`
  - `scene.intents` uses the scene controller's own `lastApply` through `undo` instead (it must also reset the read pointer and the directives).

### The sites (§2 list, ruled against the code)

`scene.reply_vignette` in the spec has no call in the code: there is no such site. The spec's `dm.reply` is split by entry point. Where this table differs from the spec's initial reroll column, the reason is given.

| Site | Call type | Surface | Reroll | Record | Key | `build` expires when | `apply` | Fallback |
|---|---|---|---|---|---|---|---|---|
| `scene.intents` | intent_extract | scene | revert | full | `<sceneId>:<from>-<to>` | the scene closed or the chat is shorter than `to` | `intents/apply` (scene) | none: the chunk is re-read next pass (today); that pass auto-closes |
| `scene.summary` | scene_summary | day | revert (last scene) | full | `<sceneId>` | no scene mark, mark without `participants` (old), mark `summarized`, or chat shorter than `to` | open scene: `scene/end` with the summary; closed: `scene/late_summary` | `scene/end` without a summary (today), `fallbackApplied` |
| `scene.digest` | scene_summary | scene | none | quiet | `<sceneId>:<upTo>` | scene closed, or its digest is past `upTo` | `scene/digest` | none: the next exchange tries again |
| `emotion.pick` | emotion_pick | scene | none | none | `<unitId>` | n/a | sprite event | native sprite |
| `dm.reply` | dm_reply | comms | revert **(user)** | full | `<unitId>:<commanderMsgId>` | her thread has a message after it | `dm/receive`, then `dm.intents` | none (no reply) |
| `dm.initiate` | dm_reply | comms | none | quiet | `<unitId>:<day>:<slot>` | the slot passed | `dm/receive` initiated | none |
| `dm.door` | dm_reply | comms | none | full | `<nightEntryId>` | the night event closed | `night/door_reply`, then `dm.intents` | none |
| `dm.intents` | intent_extract | comms | none | quiet | `<unitId>:<msgId or door entry>` | a newer message in her thread | `intents/apply` (dm) | none |
| `director.tick` | director_tick | world | none | full | `<requestId>` | the request is closed (`The day ended: the engine planned the world.`) | `director/apply` | **held (user)**: the request stays open; `[USE FALLBACK]` dispatches `director/fallback`; the day-end step falls back as today |
| `dilemma.generate` | dilemma_generate | dilemma | before_commit | full | `<dilemmaId>` | the dilemma was answered or closed | `dilemma/present` while requested; `dilemma/reword` while presented | `dilemma/fallback` at once (the card must show), `fallbackApplied` |
| `expedition.recap` | expedition_recap | expedition | free | full | `<reportId>` | the report is no longer the last | `expedition/set_recap` (now replaces) | none (the deterministic report stands) |
| `activity.vignette` | activity_vignette | day | none (transient toast; nothing stored to replace) | quiet | `<activityId>:<unitId>:<day>:<slot>` | the slot passed | story toast | none |
| `chronicle.compact` | chronicle_compact | world | none | none (fallback joins) | `<kind>:<day>` | n/a | `memory/compact` | joined lines |
| `memory.fold` | memory_fold | world | none | none (fallback joins) | `<target>` | n/a | `memory/fold` | joined text |
| `memory.rumor` | rumor_retell | world | none | quiet | `<factId>` | the fact is not waiting for a retelling | `memory/rumor_text` | the plain text in the prompt |
| `flavor.grunt` | flavor | day | free | quiet | `<unitId>` | the grunt left service | `squad/set_flavor` | designation |
| `flavor.enemy` | flavor | expedition | none | none | `<nameKey>` | n/a | `combat/set_enemy_name` | archetype name |
| `flavor.demand` | flavor | day | free | quiet | `<demandId>` | the demand was answered or expired | `demand/deliver` (undelivered) or `demand/reword` | template text, `fallbackApplied` |
| `flavor.rule` | flavor | day | free | quiet | `<ruleId>` | the proposal was answered | `bonds/deliver_rule` or `bonds/reword_rule` | template text |
| `flavor.ballot` | flavor | day | none (the vote is resolved when its lines show) | none | `<voteId>` | n/a | ballot lines | template lines |
| `flavor.dm_edit` | flavor | comms | none (an in-memory edit waiting for KEEP/REVERT) | none | `<interceptId>` | n/a | the edit card | authored line |
| `flavor.frequency_fragment` | flavor | scene | none (a fragment is worded once; hidden truth) | none | `<interceptId>` | n/a | `frequency/word` | template fragment |
| `warden.agenda` | warden_agenda | world | before_commit (while the agenda is the fallback and no override fired: the guard `ask()` has today) | quiet | `<unitId>:<sinceDay>` | the agenda is no longer the fallback | `warden/agenda` | the fallback agenda stands, `fallbackApplied` |
| `warden.judge` | warden_judge | world | none | none | `<actionType>` | n/a | judged payload | rules alone (today) |
| `warden.epilogue` | epilogue | world (END screen) | free | full | `epilogue` | the campaign is open again (a rewind) | `campaign/epilogue` (now replaces) | joined lines, `fallbackApplied` |
| `setup.profile_import` | profile_import | setup | before_commit (`wizard.regenerate`) | none (no campaign yet; the wizard shows the reason) | `<index>:<section>` | n/a | wizard section | manual form |
| `setup.commander_import` | commander_import | setup | before_commit | none | `commander` | n/a | wizard | manual form |
| `sys.ping` | ping | sys | none | none | `ping` | n/a | the SYS test line | n/a |

Every `CallTypeId` and every registered flavor kind (`grunt`, `enemy`, `demand`, `rule`, `ballot`, `dm_edit`, `frequency_fragment`) has a site. The re-sync from card (`app.ts`, running campaign) uses `setup.profile_import`.

### Where the player sees it (§4)

- **Chip text:** `describeFailure(view)` gives `<label>: <why>.`. The `why` per reason:
  - `refused`: `the model refused`;
  - `truncated`: `the answer was cut off at <n> tokens`;
  - `timeout`: `no answer within <s> s`;
  - `network`: `the connection failed`;
  - `invalid_output`: `the answer did not fit the form`;
  - `empty`: `nothing came back`;
  - `no_profile`: `no mechanic profile is selected`;
  - expired: `<expiredWhy>`.

  Buttons: `[RETRY]`, a secondary `[⋯]` that opens a modal (budget ×1.5 / ×2 / ×3; profile MAIN / MECHANIC, shown only when a mechanic profile is set; `[DROP]`), and on `director.tick` `[USE FALLBACK]`. Long press is **not** used: it opens the analysis panel (P7a).
- **Placement:**
  - `scene`: under the transcript, the open records of the open scene;
  - `comms`: under her thread;
  - `dilemma`: on the card;
  - `expedition`: on the after-action report;
  - `day` / `world`: a FAILED block on the hub under the tonight list;
  - the END screen for `warden.epilogue`;
  - `setup`: the wizard's existing manual-reason line now reads `describeFailure`.
- **REROLL:** `[REROLL]` sits next to:
  - the after-action recap;
  - the dilemma card (before an answer);
  - her last DM;
  - the last exchange of a scene (next to ↻);
  - the hub's last-scene line (for `scene.summary`, while it can);
  - a delivered demand or rule card (before an answer);
  - a grunt's name on the BASE row;
  - the epilogue;
  - the warden agenda (WARDEN panel, while fallback).
- **SYS › GENERATIONS:** open and expired records, newest first, with the same buttons. The SYS tab badge counts open `full` records. In debug mode a record row shows the raw text of its `llmLog` entry, matched by `at` and `callType`.
- **Hub:** `tonightItems` ends with `{ kind: 'generation', text: 'N generations failed.', tone: 'warn', analyze: 'glossary:generation_record' }` when N open `full` records > 0. It is placed before the 6-item cut, so it is the last line, never dropped by the order.
- **Toasts:** a `generation_failed` of a `full` site shows a `warn` toast with the chip text once (outside debug too). Debug mode keeps today's info toasts.

## Review Focus

1. **A retry or reroll answers after the chat changed, or after the moment passed.** The answer must be dropped (dispatch with `expectChatId`). `build` is called again **after** the call returns, and a different key or an `expired` result discards the answer. A `revert` that finds the state moved does nothing and says so. Tests in Task 4 (`a retry answer after a chat switch is dropped`, `a reroll whose state moved restores nothing`).
2. **An in-character refusal is not a model refusal.** `"I can't do that, Commander."` in a DM reply stays her reply; a JSON call that answers `"As an AI, I cannot…"` is `refused`. Tests in Task 2 (`prose with an in-character no is ok`, `scope json patterns are not tried on prose`).
3. **A failing model in a long session.** Every exchange's extraction fails (a refusing profile): records must not grow past 20. One open record per `siteId + key` (a second failure of the same key updates `attempts`, `reason`, `at`). The scene keeps working, and the hub shows one line. Tests in Task 3 (`the same key updates, not duplicates`, `cap 20 drops the oldest`) and Task 5 (`ten failed chunks leave one record per chunk, and a later pass closes them`).
4. **Seeded and golden runs.** The unaffected weeks run with the fake adapter, whose empty queues throw. That is a `network` failure → a record → a changed state. The guards keep these byte-identical: `no_profile` writes nothing, and the harnesses set no profile. Run `tests/warden/unaffected.test.ts`, `tests/special/unaffected.test.ts` and every `unaffectedWeek` user after Task 3 and after each chunk-b task; a moved golden stops and reports.
5. **Scene end with a failed summary, then a retry days later.** The late summary must find the scene's participants, day and location in the scene mark. It replaces only that scene's fallback line (a compacted line is left, facts only) and respects `factsPerScene` with the digest's facts. Test in Task 5 (`late summary replaces the fallback line and adds facts once`).

---

## Chunk (a): classification, records and the envelope

### Task 1: Adapter answers with a stop reason and a timeout

**Files:**
- Modify: `src/st/adapter.ts` (`GenAnswer`, `generateMain` / `generateWithProfile` return it and accept `signal?: AbortSignal`), `src/st/real.ts` (`extractData: false`, `custom.signal`, `finishReasonOf`), `src/st/fake.ts` (queues still take strings or `Error`; add `queueAnswer({ text, finishReason })`, `hangNext()` for timeouts that resolves only on abort), `src/llm/orchestrator.ts` (read `.text`; no behaviour change yet), `src/llm/text.ts` (`answerText` covers the raw shapes below if it does not already)
- Test: `tests/st/finishReason.test.ts`, `tests/llm/text.test.ts` (extend)

**Interfaces:**
- Produces:
  - `interface GenAnswer { text: string; finishReason?: 'length' | 'stop' }`
  - `StAdapter.generateMain(req: { prompt; systemPrompt?; maxTokens; signal?: AbortSignal }): Promise<GenAnswer>`
  - `StAdapter.generateWithProfile(req: { …; signal?: AbortSignal }): Promise<GenAnswer>`
  - `finishReasonOf(raw: unknown): 'length' | 'stop' | undefined` in `src/st/real.ts` (exported for tests)
  - `FakeStAdapter.queueAnswer(a: GenAnswer, profile?: boolean)`, `FakeStAdapter.hangNext(profile?: boolean)`

- [x] **Step 1: Write the failing tests**
  - `finishReasonOf maps provider shapes`:
    - `{ choices: [{ finish_reason: 'length' }] }` → `'length'`;
    - `{ stop_reason: 'max_tokens' }` → `'length'`;
    - `{ candidates: [{ finishReason: 'MAX_TOKENS' }] }` → `'length'`;
    - `{ choices: [{ finish_reason: 'stop' }] }` → `'stop'`;
    - `'plain'` → undefined.
  - `answerText reads raw chat-completion, claude and textgen shapes`:
    - `{ choices: [{ message: { content: 'x' } }] }`;
    - `{ content: [{ type: 'text', text: 'x' }] }`;
    - `{ choices: [{ text: 'x' }] }` → each `'x'`.
  - `fake hangNext resolves only on abort`: a call with `AbortSignal.timeout(10)` rejects with an `AbortError`.
- [x] **Step 2: Run** `npx vitest run tests/st/finishReason.test.ts tests/llm/text.test.ts` → FAIL.
- [x] **Step 3: Implement.** In `real.ts`, `generateWithProfile` sends `{ stream: false, extractData: false, includePreset: false, includeInstruct: false, signal }`, keeps the reasoning-payload retry, and returns `{ text: answerText(raw), finishReason: finishReasonOf(raw) }`. `generateMain` reads `generateRawData`'s data the same way.
- [x] **Step 4: Run** the files, then `npm test` → PASS (orchestrator tests unchanged).
- [x] **Step 5: Commit** `feat(P14): adapter answers carry a stop reason and take an abort signal`

---

### Task 2: Failure reasons, refusal patterns, automatic retries and the settings

**Files:**
- Create: `content/core/llmRefusals.json` (8 draft entries), `tests/llm/classify.test.ts`, `tests/fixtures/llm/failures.ts` (recorded raw strings: a refusal, a cut JSON, a thinking-only answer, an empty answer, an invalid object, an in-character no)
- Modify:
  - `src/llm/orchestrator.ts` (`FailReason`, `attemptLlm`, `callLlm` loop);
  - `src/llm/log.ts` (`LlmLogEntry.reason?`, `late?`);
  - `src/content/types.ts` (`REGISTRY_NAMES` + `llmRefusals`), `src/content/schemas.ts` (`LlmRefusalSchema`: regex must compile), `content/core/manifest.json`;
  - `src/settings.ts` (`llmTimeoutMs`, `autoRetry`, defaults and clamps);
  - `src/setup/profile.ts`, `src/setup/commander.ts` (drop `call_failed`; the reason text reads `r.detail || r.reason` as before);
  - `tests/llm/orchestrator.test.ts` (the retry expectation now reads `autoRetry`).

**Interfaces:**
- Produces:
  - `type FailReason = 'no_profile' | 'network' | 'timeout' | 'truncated' | 'refused' | 'invalid_output' | 'empty'`
  - `LlmResult<T> = { ok: true; value: T; attempts: number; at: number } | { ok: false; reason: FailReason; detail: string; attempts: number; at: number; budget: number }`, where `at` is the `llmLog` timestamp of the last attempt
  - `interface CallOpts { budgetMult?: number; profile?: 'main' | 'mechanic'; refusals?: RefusalPattern[] }`, with `interface RefusalPattern { re: RegExp; scope: 'json' | 'any' }`
  - `attemptLlm<T>(id, input, deps: LlmDeps, opts: CallOpts & { budget: number }): Promise<LlmResult<T>>`
  - `callLlm<T>(id, input, deps: LlmDeps, opts?: CallOpts): Promise<LlmResult<T>>`
  - `compileRefusals(reg: Registries): RefusalPattern[]`
  - settings `llmTimeoutMs: number` (10 000–600 000, default 120 000) and `autoRetry: 0 | 1 | 2` (default 1)

- [x] **Step 1: Write the failing tests** (`tests/llm/classify.test.ts`, one per row of the Rulings' order):
  - `no profile`;
  - `a thrown error is network`;
  - `an abort is timeout`: `hangNext` + `llmTimeoutMs: 10000` with fake timers;
  - `a main call past the timeout is timeout and the late answer is logged late`;
  - `thinking only is truncated`;
  - `empty is empty`;
  - `a cut JSON is truncated`;
  - `finishReason length with a failing schema is truncated`;
  - `refusal text with no JSON is refused`;
  - `{} where the schema needs fields is refused`;
  - `a wrong field is invalid_output with the zod path in detail`;
  - `prose with an in-character no is ok` (`dm_reply`, `"I can't do that, Commander."`);
  - `scope json patterns are not tried on prose`;
  - `refused is never retried` (one call queued, `attempts 1`);
  - `autoRetry 2 retries invalid with ×1.5 then ×2.25 budgets` (check `fake.calls[i].maxTokens` under the floor rule: set `requestFloor` 0);
  - `autoRetry 0 makes one attempt`;
  - `network retries with the same budget`;
  - `a bad pattern is a content error`.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement** per the Rulings. `callLlm` keeps its signature with an optional `opts`, so every existing caller compiles. `detail` is cut to 160 characters. Draft refusal entries (`scope: 'json'` unless noted, AUTHOR TO EXTEND):
  - `as an ai` (`any`);
  - `i can(?:'|no)t (?:assist|help) with (?:that|this) request` (`any`);
  - `i(?:'m| am) (?:not able|unable) to (?:continue|create|write|generate)` (`any`);
  - `against (?:my|the) (?:content )?(?:guidelines|policy|policies)` (`any`);
  - `i (?:must|have to) decline`;
  - `i won't (?:be able to )?(?:produce|generate)`;
  - `this (?:request|content) (?:violates|goes against)`;
  - `^\s*(?:sorry|i apologi[sz]e)[,.!]`.
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P14): failure reasons, refusal patterns, automatic retries`

---

### Task 3: Failure records in the campaign

**Files:**
- Create: `src/engine/generations.ts`, `src/engine/actions/generations.ts`
- Modify:
  - `src/engine/state/types.ts` (`CampaignState.generations?`, `GenerationRecord`; `SceneMark` gains optional `day`, `locationId`, `participants`, written only while `summarized === false`);
  - `src/engine/tuning.ts` (`TUNING.generation = { maxRecords: 20, expiredDays: 1, detailMax: 160 }`);
  - `src/engine/dispatch.ts` (`ALWAYS_OPEN`, `ENDED_OK_PREFIXES`);
  - `src/content/schemas.ts` (`RESERVED_EVENT_TYPES`);
  - the action index imported by `app.ts`;
  - the day-end step registry (`generation_sweep`, registered last).
- Test: `tests/engine/generations.test.ts`

**Interfaces:**
- Produces:
  - `interface GenerationRecord { id: string; siteId: string; key: string; reason: FailReason | 'expired'; detail: string; attempts: number; day: number; slot: Slot; at: number; budgetMult: number; fallbackApplied?: true; status: 'open' | 'expired'; expiredWhy?: string; expiredDay?: number; quiet?: true }`. `FailReason` is mirrored as a string union in the engine; the engine does not import `llm/`.
  - `openRecords(state, filter?: { siteId?: string; surface?: never }): GenerationRecord[]`, `recordFor(state, siteId, key): GenerationRecord | undefined`
  - actions:
    - `generation/failed { siteId, key, reason, detail, attempts, at, budgetMult, fallbackApplied?, quiet? }` → `generation_failed { id, siteId, key, reason }`;
    - `generation/close { id | { siteId, key }, outcome: 'applied' | 'dropped' | 'kept_fallback' }` → `generation_closed`;
    - `generation/expire { id, why }` → `generation_expired`.
  - day-end step `generation_sweep`.

- [x] **Step 1: Write the failing tests**
  - `a failure writes one record with no text beyond detail` (a 400-character detail is stored as 160).
  - `the same key updates, not duplicates` (`attempts` adds, `reason` and `at` take the newest).
  - `cap 20 drops the oldest`.
  - `close by site and key closes every open match`.
  - `expire keeps the record a day, the sweep removes it after`.
  - `allowed in combat, in an expedition and on an ended campaign`.
  - `no rng draw` (the rng state is equal before and after each action).
  - `old save without generations reads none`.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement.** Closed records are removed, not kept. `scene/end` writes `day`, `locationId` and `participants` into the mark when it has no summary. This is the one change to an existing action; check that no golden compares scene marks (Review Focus 4).
- [x] **Step 4: Run** the file, then `npm test` → PASS, the unaffected goldens included.
- [x] **Step 5: Commit** `feat(P14): generation failure records`

---

### Task 4: Site declarations and the envelope

**Files:**
- Create: `src/llm/sites.ts` (the declarations of the table, data only), `src/llm/envelope.ts`, `src/llm/describe.ts` (`describeFailure`)
- Modify: `src/app.ts` (`createEnvelope` with an `EnvelopeHost` made of `dispatch`, `current`, `restoreSnapshot`, chat id, registries, settings, `contentLine`, toast; `AliusApp.generations: Envelope`; clear revert snapshots on chat change)
- Test: `tests/llm/envelope.test.ts`

**Interfaces:**
- Produces:
  - `type GenerationSurface = 'scene' | 'comms' | 'day' | 'expedition' | 'dilemma' | 'setup' | 'world' | 'sys'`
  - `type RerollMode = 'free' | 'before_commit' | 'revert' | 'none'`
  - `interface SiteDecl { id: string; callType: CallTypeId; surface: GenerationSurface; reroll: RerollMode; record: 'full' | 'quiet' | 'none'; glossary: string; label(state: CampaignState | null, key: string): string }`
  - `registerGenerationSite(decl: SiteDecl): void`, `generationSite(id): SiteDecl | undefined`, `generationSites(): SiteDecl[]`
  - `interface SiteHandlers<I, V> {`
    - `build(key: string): I | { expired: string } | Promise<I | { expired: string }>`
    - `parse?(raw: unknown, input: I): V | null`: null means `invalid_output`, no retry by the sanitizer
    - `apply(key: string, value: V, input: I): 'ok' | { rejected: string } | { stale: true }`: `rejected` counts as an `invalid_output` attempt inside `autoRetry` (the dilemma's engine rejection)
    - `fallback?(key: string, input: I | null): boolean`
    - `committed?(key: string): string | null`: `before_commit` returns why it can no longer change
    - `undo?(key: string): string | null`: `revert` returns why not, null when undone
    - `}`
  - `interface Envelope {`
    - `bind<I, V>(siteId: string, h: SiteHandlers<I, V>): void`
    - `generate<V>(siteId: string, key: string, opts?: { budgetMult?: number; profile?: 'main' | 'mechanic'; noRecord?: boolean }): Promise<GenerationOutcome<V>>`
    - `retry(recordId: string, opts?: { budgetMult?: number; profile?: 'main' | 'mechanic' }): Promise<GenerationOutcome<unknown>>`
    - `reroll(siteId: string, key: string): Promise<GenerationOutcome<unknown>>`
    - `rerollState(siteId: string, key: string): { enabled: boolean; reason?: string }`
    - `drop(recordId: string): void`
    - `useFallback(recordId: string): void`
    - `takeSnapshot(siteId: string, key: string, before: CampaignState, after: CampaignState): void`
    - `}`
  - `type GenerationOutcome<V> = { kind: 'applied'; value: V } | { kind: 'failed'; reason: FailReason; detail: string; recordId?: string; fallbackApplied: boolean } | { kind: 'expired'; why: string } | { kind: 'stale' } | { kind: 'unbound' }`
  - `describeFailure(v: { label: string; reason: string; detail?: string; budget?: number; timeoutMs?: number; expiredWhy?: string }): string`

- [x] **Step 1: Write the failing tests** (a test site `test.free` on `ping`, plus `test.revert` and `test.commit`):
  - `success applies and closes open records of the key`;
  - `failure records, emits, toasts for full, not for quiet`;
  - `fallback runs next to the record and sets fallbackApplied`;
  - `fallback with reroll none writes no record`;
  - `no_profile writes no record`;
  - `build expired closes the record as expired with its text`;
  - `a retry answer after a chat switch is dropped` (Review Focus 1);
  - `build is asked again after the answer and a changed moment discards it`;
  - `retry with ×2 and the main profile sends that budget and generateMain`;
  - `before_commit reroll refused once committed, with the reason`;
  - `a reroll whose state moved restores nothing`;
  - `revert reroll restores the snapshot and applies the new value`;
  - `unbound site retry returns unbound and keeps the record`;
  - `rejected apply retries within autoRetry then fails invalid_output`;
  - `useFallback runs fallback and closes kept_fallback`;
  - `describeFailure texts` (one assertion per reason, the exact strings of the Rulings).
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement.** `generate`:
  1. `build`;
  2. `callLlm` with `deps.refusals` from `compileRefusals`;
  3. `parse`;
  4. `build` again, comparing the key and the expiry;
  5. `apply`;
  6. on success, close the key's records;
  7. on failure, `fallback` (when no record says it already ran), then `generation/failed` unless the record mode or the rules say none.

  The envelope keeps `inflight: Set<siteId:key>`: a second `generate` for the same key while one runs returns `stale`.
- [x] **Step 4: Run** the file, then `npm test` → PASS.
- [x] **Step 5: Commit** `feat(P14): site declarations and the generation envelope`

**Chunk (a) ends here.**

---

## Chunk (b): every call site through the envelope

Each task moves the caller code into the site's handlers, deletes the async wrapper in `src/llm/calls/*.ts` (the call type, input type and sanitizer stay), and rewrites that wrapper's tests in `tests/llm/` against `parse` / the sanitizer or through `envelope.generate` with a fake host. Behaviour on success must be identical: the existing controller tests must pass unchanged. A test that changes for any other reason stops and reports.

### Task 5: Scene sites (`scene.intents`, `scene.summary`, `scene.digest`, `emotion.pick`)

**Files:**
- Modify:
  - `src/scene/sceneController.ts`: `extractChunk` → `generate('scene.intents', …)`; `end` → `scene.summary` with a snapshot; `showSprites` → `emotion.pick`; bind the handlers in `createSceneController`;
  - `src/scene/memoryController.ts`: `digestIfDue` → `scene.digest`;
  - `src/engine/actions/scene.ts`: `scene/late_summary`;
  - `src/llm/calls/{intentExtract,sceneSummary,emotionPick}.ts`: wrappers removed; `SceneDeps.generations`.
- Test: `tests/scene/generationSites.test.ts`, `tests/engine/lateSummary.test.ts`

**Interfaces:**
- Consumes: `Envelope` (Task 4), `SceneMark.participants/day/locationId` (Task 3)
- Produces:
  - action `scene/late_summary { sceneId, summary }`. It needs a mark with `summarized: false` and `participants`. It replaces the scene's chronicle line (`kind: 'scene'`, same `sceneId`) when present, stores facts with `storeSceneFacts` using a `SceneRecord` built from the mark, and sets `summarized: true`. It draws no rng.
  - `SceneController.rerollLast(): Promise<void>`, the `scene.intents` reroll: the `onSwipe` undo, then `extract`.

- [x] **Step 1: Write the failing tests**
  - `a failed chunk records scene.intents and the next pass closes it`;
  - `ten failed chunks leave one record per chunk, and a later pass closes them` (Review Focus 3);
  - `scene.intents reroll undoes and re-reads the last exchange`;
  - `scene.intents reroll disabled after another dispatch`;
  - `a failed summary ends the scene with the fallback line and records scene.summary`;
  - `late summary replaces the fallback line and adds facts once` (Review Focus 5);
  - `late summary on a compacted line adds facts only`;
  - `late summary on an old mark without participants expires`;
  - `summary reroll restores the open scene and ends it with the new summary while nothing changed`;
  - `a failed digest is quiet and the next exchange tries again`;
  - `emotion.pick failure writes nothing`;
  - `a seeded scene with all calls answering is identical to before` (compare to `tests/helpers/sceneHarness.ts` runs).
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement** per the table. The summary snapshot is `takeSnapshot('scene.summary', sceneId, before, after)`, taken around the `scene/end` dispatch. The `revert` `undo` restores `before`; the new `apply` then dispatches `scene/end` with the same `endIndex`.
- [x] **Step 4: Run** the files, then `npm test` → PASS; goldens unchanged.
- [x] **Step 5: Commit** `feat(P14): scene sites through the envelope`

---

### Task 6: COMMS sites (`dm.reply`, `dm.initiate`, `dm.door`, `dm.intents`)

**Files:**
- Modify: `src/scene/comms.ts`, `src/llm/calls/dmReply.ts`, `src/llm/calls/intentExtract.ts`
- Test: `tests/scene/commsGeneration.test.ts`

**Interfaces:**
- Produces:
  - `Comms.rerollLast(unitId): Promise<void>` (the `dm.reply` reroll)
  - `Comms.replyState(unitId): { siteKey: string; reroll: { enabled: boolean; reason?: string } } | null`, for the UI

- [ ] **Step 1: Write the failing tests**
  - `a failed reply records dm.reply under the commander's message`;
  - `retry answers that message and reads it`;
  - `a newer commander message expires the old record`;
  - `reroll restores the state before her reply, gets a new one and reads it` (`revert`, user);
  - `reroll disabled after another dispatch`;
  - `a failed initiative is quiet and expires when the slot passes`;
  - `a failed door reply records dm.door and expires when the night event closes`;
  - `a failed reading is quiet`;
  - `the P9c edit and the P10b curt stamp still run once` (existing tests unchanged).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** The `dm.reply` snapshot spans `dm/receive` plus `dm.intents`: `before` is the state just before `dm/receive`, `after` is the state after the reading (or after `dm/receive` when the reading failed). The reroll therefore never leaves deltas from words she no longer said. `curt` is decided again by `replyModeFor` on the restored state; it is a hash, so the same result.
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P14): COMMS sites through the envelope`

---

### Task 7: World sites (`director.tick` held, `dilemma.generate` with reword, `expedition.recap`)

**Files:**
- Modify: `src/world/directorController.ts`, `src/loyalty/dilemmaController.ts`, `src/world/expeditionController.ts`, `src/engine/dilemma/flow.ts` (`rewordDilemma`), `src/engine/actions/dilemma.ts` (`dilemma/reword`), `src/engine/actions/expedition.ts` (`expedition/set_recap` replaces an existing recap), `src/llm/calls/{directorTick,dilemmaGenerate,expeditionRecap}.ts`
- Test: `tests/world/directorGeneration.test.ts`, `tests/loyalty/dilemmaGeneration.test.ts`, `tests/world/recapGeneration.test.ts`

**Interfaces:**
- Produces:
  - action `dilemma/reword { id, output }`. It needs `status === 'presented'` and no choice. It validates like `presentDilemma` (`parseDilemmaOutput`, `validateOptions`, `nothingChoosable`) and replaces `title`, `setup`, `options` and `source: 'model'`. A rejection changes nothing and returns `dilemma_rejected { retry: false }`. It draws no rng; test it.
  - `DirectorController.useFallback(): void`: dispatches `director/fallback` for the open request.

- [ ] **Step 1: Write the failing tests**
  - Director:
    - `a failed tick keeps the request open and records director.tick` (user: hold);
    - `RETRY applies the model plan and closes`;
    - `USE FALLBACK applies the engine plan and closes kept_fallback`;
    - `the day end falls back and the record expires with "The day ended: the engine planned the world."`;
    - `director off still falls back at once with no record`.
  - Dilemma:
    - `a failed dilemma presents the authored block and records with fallbackApplied`;
    - `RETRY rewords it before an answer`;
    - `reroll refused after an answer with the reason`;
    - `an engine rejection retries within autoRetry` (today's `maxAttempts` loop is replaced by `autoRetry` plus the `rejected` apply);
    - `scapegoat is never asked` (unchanged).
  - Recap:
    - `a failed recap records on the report`;
    - `reroll replaces the recap`;
    - `a newer report expires the record`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** If removing the dilemma `maxAttempts` loop moves a seeded dilemma test, stop and report. The fallback of an engine rejection stays in `presentDilemma`.
- [ ] **Step 4: Run** the files, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P14): director, dilemma and recap sites through the envelope`

---

### Task 8: Background and day sites (`chronicle.compact`, `memory.fold`, `memory.rumor`, `activity.vignette`, `flavor.grunt`, `flavor.enemy`)

**Files:**
- Modify: `src/scene/chronicle.ts`, `src/scene/memoryController.ts`, `src/app.ts` (`performActivity`, `recruitGrunt`, `requestEnemyNames`), `src/llm/calls/{chronicleCompact,memoryFold,rumorRetell,activityVignette,flavor}.ts`
- Test: `tests/scene/backgroundGeneration.test.ts`, `tests/app-generation.test.ts`

**Interfaces:**
- Produces: `AliusApp.rerollGrunt(unitId): Promise<void>` (`flavor.grunt` reroll, from the BASE row)

- [ ] **Step 1: Write the failing tests**
  - `compaction and fold fall back with no record`;
  - `a failed rumor retelling is a quiet record and expires once told`;
  - `a failed vignette is quiet and expires when the slot passes`;
  - `a failed grunt name is quiet and RETRY names the grunt`;
  - `grunt reroll renames`;
  - `a failed enemy name writes nothing and the combat is untouched`;
  - `quiet records do not count for the badge or the hub` (`openRecords(…).filter(full)`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** per the table.
- [ ] **Step 4: Run** the files, then `npm test` → PASS; goldens unchanged.
- [ ] **Step 5: Commit** `feat(P14): background and day sites through the envelope`

---

### Task 9: Wording sites (`flavor.demand`, `flavor.rule`, `flavor.ballot`, `flavor.dm_edit`, `flavor.frequency_fragment`)

**Files:**
- Modify: `src/discipline/controller.ts`, `src/bonds/controller.ts`, `src/power/controller.ts`, `src/personal/controller.ts`, `src/special/controller.ts`, `src/engine/actions/discipline.ts` (`demand/reword`), `src/engine/actions/bonds.ts` (`bonds/reword_rule`), `src/llm/calls/flavor.ts` (the wrappers go; `generateFlavor` goes; `registerFlavorKind` and the sanitizers stay)
- Test: `tests/discipline/demandGeneration.test.ts`, `tests/bonds/ruleGeneration.test.ts`, `tests/personal/editGeneration.test.ts`

**Interfaces:**
- Produces:
  - action `demand/reword { demandId, text }`: the demand is delivered and unanswered, and the text passes the same check as `demand/deliver`'s; no rng
  - action `bonds/reword_rule { ruleId, text }`: the rule is `proposed`, delivered and unanswered; no rng
  - `DisciplineController.reword(demandId)`, `BondsController.reword(ruleId)`

- [ ] **Step 1: Write the failing tests**
  - `a failed demand wording delivers the template and leaves a quiet record`;
  - `RETRY rewords it before an answer`;
  - `reroll refused after the answer`;
  - the same three for a rule;
  - `ballot, dm_edit and fragment failures keep their template and write nothing`;
  - `a fragment record never exists` (hidden truth: no record or label names an intercept).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** `flavor.<kind>` site handlers receive the kind's input; the site id is built as `` `flavor.${kind}` ``.
- [ ] **Step 4: Run** the files, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P14): wording sites through the envelope`

---

### Task 10: Setup, warden and ping sites; the architecture guard

**Files:**
- Modify:
  - `src/setup/profile.ts`, `src/setup/commander.ts`: run through `generate` with `noRecord`. The `manual` reason is `describeFailure`. The wizard's critical-section second attempt becomes the envelope's `rejected` apply.
  - `src/setup/wizard.ts`: `regenerate` is the `setup.profile_import` reroll, unchanged for the player.
  - `src/app.ts`: re-sync and `pingMechanic`.
  - `src/warden/controller.ts`: agenda, judge, epilogue.
  - `src/engine/actions/warden.ts`: `campaign/epilogue` with `replace: true` replaces a written epilogue.
  - `src/llm/calls/{profileImport,commanderImport,wardenAgenda,wardenJudge,epilogue}.ts`.
  - `tests/architecture.test.ts`.
- Test: `tests/setup/importGeneration.test.ts`, `tests/warden/wardenGeneration.test.ts`, `tests/llm/siteRegistry.test.ts`

**Interfaces:**
- Produces: `WardenController.rerollEpilogue()`, `WardenController.rerollAgenda()`

- [ ] **Step 1: Write the failing tests**
  - Architecture:
    - `callLlm and attemptLlm are imported only by src/llm/envelope.ts`: a value import of `../llm/orchestrator` or `./orchestrator` anywhere else in `src/` fails; `import type` is allowed.
    - `no src file outside llm/ imports llm/calls/* for a function`: types and sanitizers are allowed.
  - Registry (`tests/llm/siteRegistry.test.ts`):
    - `every CallTypeId has a site`;
    - `every flavor kind has a flavor.<kind> site`;
    - `every site has label, surface, reroll, record and a glossary id that exists in glossary.json`;
    - `every bound handler set matches a declared site` (create the app with the fake adapter and list the bindings).
  - Sites:
    - `a refused profile import shows "Profile import: the model refused." in the wizard`;
    - `regenerate still re-imports one section`;
    - `a failed agenda keeps the fallback, records quietly, RETRY replaces it while no override fired`;
    - `a failed judge dispatches without it and writes nothing`;
    - `a failed epilogue writes the joined lines and a full record; reroll replaces it`;
    - `ping reports the reason`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** `orchestrator.ts` keeps `LlmDeps` and the types; the architecture test reads `import {` lines (not `import type`).
- [ ] **Step 4: Run** the files, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P14): setup, warden and ping sites; only the envelope calls the model`

**Chunk (b) ends here.**

---

## Chunk (c): where the player sees it

### Task 11: The failure chip, the retry menu and REROLL

**Files:**
- Create: `src/ui/generation/chip.ts`, `src/ui/generation/retryMenu.ts`, `css/82-generation.css`
- Modify: `content/core/glossary.json` (the six ids of Global Constraints), `src/analysis/providers/` (`generation.ts`: the reading of a record and of a disabled REROLL, through `Knowledge`, no hidden values), `src/analysis/providers.ts`
- Test: `tests/ui/generationChip.test.ts`

**Interfaces:**
- Produces:
  - `drawGenerationChip(host: HTMLElement, rec: GenerationRecord, h: { label: string; text: string; onRetry(): void; onMenu(): void; onUseFallback?(): void }): HTMLElement`: the classes `alius-chip alius-genfail` share the `.alius-violation` look; `data-record`, `data-analyze="glossary:generation_failed"`
  - `drawReroll(host, state: { enabled: boolean; reason?: string }, onReroll: () => void, pending?: boolean): HTMLElement`: `[REROLL]`, `aria-disabled` plus `title` when disabled, `data-analyze="glossary:generation_reroll"`
  - `openRetryMenu(modal: ShellApi['modal'], opts: { hasMechanic: boolean; hasFallback: boolean }): Promise<{ budgetMult: number; profile?: 'main' | 'mechanic' } | 'drop' | 'fallback' | null>`
  - `chipsFor(state, surface: GenerationSurface, filter?: (r) => boolean): GenerationRecord[]`: open and expired records of `full` sites of that surface

- [ ] **Step 1: Write the failing tests**
  - `chip text per reason` (`describeFailure` through the chip);
  - `expired chip shows the why and only DROP`;
  - `REROLL disabled is aria-disabled, analyzable, explains`;
  - `retry menu hides the profile row without a mechanic profile`;
  - `every chip and button carries data-analyze`;
  - `the glossary ids exist and no entry gives the commander a pronoun`;
  - `a hidden sentinel never renders` (records built with labels from every site, checked against `tests/fixtures/analyze/hidden.ts`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Glossary text is AUTHOR TO WRITE in tone, with the facts of the Rulings.
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P14): failure chip, retry menu and reroll button`

---

### Task 12: Chips and REROLL on every surface

**Files:**
- Modify:
  - `src/ui/scene/sceneScreen.ts` (records of the open scene; REROLL beside ↻ for the last exchange);
  - `src/ui/comms/commsTab.ts` (records under the thread; REROLL on her last reply);
  - `src/ui/dilemma/` card (chip; REROLL before an answer);
  - `src/ui/expedition/` after-action report (recap chip and REROLL);
  - `src/ui/hub/hubScreen.ts` (FAILED block for `day` / `world`; REROLL on the last-scene line while `scene.summary` allows);
  - `src/ui/discipline/` and `src/ui/bonds/` demand / rule cards (REROLL);
  - `src/ui/base/` grunt row (REROLL name);
  - `src/ui/warden/` END screen (epilogue chip and REROLL) and the WARDEN panel (agenda REROLL while fallback);
  - `src/ui/setup/setupScreen.ts` (the manual line reads the described reason).
- Test: `tests/ui/generationSurfaces.test.ts`

**Interfaces:**
- Consumes: Task 11's components, `app.generations` (Task 4), the controller reroll methods of Tasks 5–10

- [ ] **Step 1: Write the failing tests** (one `describe` per surface)
  - `the scene shows a failed reading under the transcript and RETRY reads it`;
  - `COMMS shows a failed reply under the message and REROLL is disabled after another dispatch`;
  - `the dilemma card shows RETRY on the authored block, REROLL before an answer`;
  - `the report shows a recap chip, then REROLL`;
  - `the hub FAILED block lists a failed summary and a held director tick with USE FALLBACK`;
  - `the END screen rerolls the epilogue`;
  - `a pending retry disables its buttons until it settles`;
  - `quiet records show on no surface`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Every surface redraws on `generation_*` events through its existing refresh path.
- [ ] **Step 4: Run** the file, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P14): failure chips and reroll on every surface`

---

### Task 13: SYS › GENERATIONS, the badge, the hub line and the settings

**Files:**
- Create: `src/ui/shell/generationsSection.ts`
- Modify: `src/ui/shell/sysTab.ts` (the GENERATIONS list; the GENERATION settings rows `llmTimeoutMs` in seconds and `autoRetry` 0/1/2, each with `data-analyze`; the standing no-profile line), `src/ui/hub/model.ts` (`TonightItem.kind` + `'generation'`, the line last), `src/app.ts` (`syncBadges`: `shell.setTabBadge('sys', n)`; the `warn` toast on `generation_failed` of a `full` site)
- Test: `tests/ui/generationsSys.test.ts`, `tests/ui/hubModel.test.ts` (extend)

**Interfaces:**
- Produces: `renderGenerationsSection(host, ctx: { state; settings; generations: Envelope; modal; debugLog?: LlmLogEntry[] })`

- [ ] **Step 1: Write the failing tests**
  - `lists open and expired records newest first with RETRY, menu and DROP`;
  - `quiet records are listed but not counted`;
  - `the badge counts open full records`;
  - `the standing no-profile line shows while no profile and no fallback`;
  - `debug mode shows the raw text of the matching log entry and nothing without debug`;
  - `the settings clamp 10–600 s and 0–2`;
  - `tonightItems ends with "2 generations failed." and keeps it within six` (the line takes the last place when the list is full);
  - `no records, no line`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the files, then `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(P14): SYS generations list, badge, hub line and settings`

---

### Task 14: Fixture coverage per reason and per mode

**Files:**
- Create: `tests/llm/envelopeFixtures.test.ts`

- [ ] **Step 1: Write the tests** (acceptance 1, 3, 4, 5).
  - A matrix of the six reasons (`refused`, `truncated`, `timeout`, `invalid_output`, `empty`, `network`) from `tests/fixtures/llm/failures.ts`, run through the real sites below. Each must give the right record, the right chip text and a working RETRY:
    - `expedition.recap` (free);
    - `dilemma.generate` (before_commit);
    - `scene.summary` (revert);
    - `director.tick` (none, held).
  - Plus:
    - `expired` for each;
    - `revert refused when state moved` for `scene.summary` and `dm.reply`;
    - `state stays small`: after 25 failures of every full site, `JSON.stringify(state.generations).length < 8000`, and no prompt, transcript or fixture text appears in it.
- [ ] **Step 2: Run** → PASS is expected (it guards Tasks 4–13). A failure is fixed in the task that owns it; note it in the commit.
- [ ] **Step 3: Commit** `test(P14): failure fixtures per reason and reroll mode`

---

### Task 15: Docs, hand-offs and the manual test

**Files:**
- Create: `docs/MANUAL_TEST_P14.md`
- Modify:
  - `docs/packages/P14-generation-envelope.md`: status line; **Implemented as** with every ruling above, the three user rulings, the site table as built, the non-obvious things (`no_profile` writes nothing; fallback with reroll none writes nothing; `extractData: false`; long press belongs to analysis; the dilemma `maxAttempts` loop is now `autoRetry`) and the open items (refusal patterns in other languages; a toast with buttons; the vignette reroll).
  - `docs/00-overview.md`:
    - §5.2: the closing paragraph now describes the envelope, failure reasons and `autoRetry`;
    - §5.4: P14 rows: `generate`, `registerGenerationSite`, `Envelope`, `describeFailure`, `drawGenerationChip`, `drawReroll`, `scene/late_summary`, `dilemma/reword`, `demand/reword`, `bonds/reword_rule`;
    - §6: `generations`;
    - §8: settings `llmTimeoutMs` and `autoRetry`;
    - §9: status `implemented`.
  - **Interfaces already provided by P14** notes in P11b, P14b, P15a, P15, P16, P17, P17a–e and P18–P20: *a package that adds a call type registers its site in the same change; the architecture test refuses a direct `callLlm`.*
  - `CLAUDE.md`: a P14 rule line in the style of the others.
  - `docs/CONTENT.md`: `llmRefusals` (fields, `scope`, how to add a language).
  - `docs/ROADMAP-next.md`: P14 marked done.
- [ ] **Step 1: Write** the docs. The manual test covers, in SillyTavern:
  - a refusing mechanic profile (a scene reading, a dilemma, a recap);
  - a tiny budget (truncated);
  - a 10 s timeout against a slow model;
  - a dead connection;
  - RETRY with ×2 and the main profile;
  - USE FALLBACK on the director;
  - a late scene summary;
  - REROLL of a DM, a dilemma, a recap and the last scene;
  - the disabled REROLL reason;
  - the SYS list, the badge and the hub line.
- [ ] **Step 2: Run** `npm test` → PASS; record the final file and test counts in the spec.
- [ ] **Step 3: Commit** `docs(P14): implemented as, overview, hand-offs, manual test`

**Chunk (c) ends here.**
