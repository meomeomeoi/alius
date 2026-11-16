# P14 — Generation Envelope: Retry, Refusals, Reroll

**Status: spec.** The last package of release 0.1.0. **Depends on:** P0 (`callLlm`, call types, budgets), and every package that owns a call site (P1, P2, P3, P5, P6, P7, P9, P9c, P9d, P11; P3b and P10b if they land first). **Read:** overview; this file; `src/llm/orchestrator.ts`; the **Implemented as** of P3 (scene controller), P5 (director), P6 (dilemmas) and P9d (violations).

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
