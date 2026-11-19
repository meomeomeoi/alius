import type { StAdapter, GenAnswer } from '../st/adapter';
import type { AliusSettings } from '../settings';
import type { Registries } from '../content/types';
import { getCallType, type CallType, type CallTypeId } from './callTypes';
import { llmLog } from './log';
import { hasCutJson, looseJson, stripThinking } from './text';

/** Why a model call failed (P14). A `refused` or `no_profile` failure is never retried automatically. */
export type FailReason = 'no_profile' | 'network' | 'timeout' | 'truncated' | 'refused' | 'invalid_output' | 'empty';

export type LlmResult<T> =
  | { ok: true; value: T; attempts: number; /** The `llmLog` timestamp of the last attempt. */ at: number }
  | { ok: false; reason: FailReason; detail: string; attempts: number; /** The `llmLog` timestamp of the last attempt. */ at: number; /** The max_tokens the last attempt sent (0 when none was sent). */ budget: number };

/** A compiled `llmRefusals` entry. `any` patterns are also tried on prose; `json` ones only on a JSON call with no parsable JSON. */
export interface RefusalPattern { re: RegExp; scope: 'json' | 'any' }

/** Per-call options: a retry from the player picks a bigger budget or the other profile. */
export interface CallOpts {
  /** Multiplies the budget of the first attempt (default 1). */
  budgetMult?: number;
  /** Forces the main model or the mechanic profile instead of the call type's own. */
  profile?: 'main' | 'mechanic';
  /** Overrides `deps.refusals` for this call. */
  refusals?: RefusalPattern[];
}

const RETRY_BUDGET_FACTOR = 1.5;
const DETAIL_MAX = 160;

/** What a call needs: the adapter, the settings and (P9d) the content line a prose call carries. */
export interface LlmDeps {
  st: StAdapter;
  settings: AliusSettings;
  /** The content exclusion line of the campaign (empty = none); appended to the system prompt of a call type marked `prose`. */
  contentLine?: () => string;
  /** P14: the compiled refusal patterns (`compileRefusals`); the envelope passes them, the orchestrator has no registries. Absent = none. */
  refusals?: RefusalPattern[];
}

/** The patterns of the `llmRefusals` registry, compiled case-insensitive. A pattern that does not compile is a content error and never gets here. */
export function compileRefusals(reg: Registries): RefusalPattern[] {
  const out: RefusalPattern[] = [];
  for (const e of reg.llmRefusals.values()) {
    try {
      out.push({ re: new RegExp(String(e.pattern), 'i'), scope: e.scope === 'any' ? 'any' : 'json' });
    } catch {
      // the schema refuses such an entry at load; skipping keeps a hand-built registry from throwing here
    }
  }
  return out;
}

const cut = (s: string): string => (s.length > DETAIL_MAX ? s.slice(0, DETAIL_MAX) : s);

const isAbort = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && ((e as { name?: unknown }).name === 'AbortError' || (e as { name?: unknown }).name === 'TimeoutError');

function refuses(patterns: RefusalPattern[], text: string, scopes: ReadonlyArray<RefusalPattern['scope']>): boolean {
  return patterns.some((p) => scopes.includes(p.scope) && p.re.test(text));
}

/** An opened thinking block in the raw answer: with no answer after it, the model spent its whole budget thinking. */
const OPEN_THINK = /<(?:think|thinking|reasoning)\b[^>]*>/i;

type Parsed<T> = { ok: true; value: T } | { ok: false; reason: FailReason; detail: string };

/** Classifies an answer that arrived. The order is the one the spec fixes (see the P14 plan, "Classification"). */
function classify<T>(ct: CallType<any>, answer: GenAnswer, patterns: RefusalPattern[]): Parsed<T> {
  const length = answer.finishReason === 'length';
  const text = stripThinking(answer.text);

  if (text === '') {
    if (OPEN_THINK.test(answer.text) || length) return { ok: false, reason: 'truncated', detail: 'the answer ran out of tokens before it began' };
    return { ok: false, reason: 'empty', detail: 'empty answer' };
  }

  if (!ct.json) {
    if (refuses(patterns, text, ['any'])) return { ok: false, reason: 'refused', detail: 'the answer matched a refusal pattern' };
    return { ok: true, value: text as T };
  }

  const json = looseJson(text);
  if (json === null) {
    if (refuses(patterns, text, ['json', 'any'])) return { ok: false, reason: 'refused', detail: 'the answer matched a refusal pattern' };
    if (length || hasCutJson(text)) return { ok: false, reason: 'truncated', detail: 'the JSON was cut off' };
    return { ok: false, reason: 'invalid_output', detail: 'no JSON found in the answer' };
  }
  if (!ct.schema) return { ok: true, value: json as T };

  const checked = ct.schema.safeParse(json);
  if (checked.success) return { ok: true, value: checked.data as T };
  const empty = Array.isArray(json) ? json.length === 0 : typeof json === 'object' && Object.keys(json as object).length === 0;
  if (empty) return { ok: false, reason: 'refused', detail: 'an empty answer where the form needs content' };
  const detail = cut(checked.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '));
  if (length || hasCutJson(text)) return { ok: false, reason: 'truncated', detail };
  return { ok: false, reason: 'invalid_output', detail };
}

/**
 * One attempt of a typed call: prompt → model → classify. `budget` is the expected output in tokens (the request floor is applied
 * here). Never throws and never touches campaign state; logs the attempt in `llmLog`. `callLlm` loops over it.
 */
export async function attemptLlm<T>(
  id: CallTypeId,
  input: unknown,
  deps: LlmDeps,
  opts: CallOpts & { budget: number },
): Promise<LlmResult<T>> {
  const { st, settings } = deps;
  const ct = getCallType(id);
  const now = Date.now();
  if (!ct) return { ok: false, reason: 'invalid_output', detail: `unknown call type: ${id}`, attempts: 0, at: now, budget: 0 };

  const wantsMechanic = opts.profile === undefined ? ct.profile === 'mechanic' : opts.profile === 'mechanic';
  const hasProfile = st.listConnectionProfiles().some((p) => p.id === settings.mechanicProfileId);
  const useMain = !wantsMechanic || !hasProfile;
  if (wantsMechanic && !hasProfile && !settings.mechanicFallbackToMain) {
    return { ok: false, reason: 'no_profile', detail: 'no mechanic connection profile selected', attempts: 0, at: now, budget: 0 };
  }

  const line = ct.prose === true ? (deps.contentLine?.() ?? '').trim() : '';
  const system = line === '' ? ct.system(input) : `${ct.system(input)}\n\n${line}`;
  const prompt = ct.prompt(input);
  const profileLabel = useMain ? 'main' : settings.mechanicProfileId;
  // The budget is what we expect to parse; the floor is headroom for thinking models.
  const maxTokens = wantsMechanic ? Math.max(opts.budget, settings.requestFloor) : opts.budget;
  const started = Date.now();
  const entry = { at: started, callType: id, profile: profileLabel, maxTokens, prompt };
  const fail = (reason: FailReason, detail: string, raw: string): LlmResult<T> => {
    llmLog.push({ ...entry, raw, ok: false, ms: Date.now() - started, reason });
    return { ok: false, reason, detail: cut(detail), attempts: 1, at: started, budget: maxTokens };
  };

  // Every call races a timer: a profile call also gets the signal (ST aborts the request), a main call cannot be aborted, so
  // its late answer is ignored and logged `late`.
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      ctrl.abort();
      resolve('timeout');
    }, settings.llmTimeoutMs);
  });

  let answer: GenAnswer;
  const call = useMain
    ? st.generateMain({ prompt, systemPrompt: system, maxTokens, signal: ctrl.signal })
    : st.generateWithProfile({
        profileId: settings.mechanicProfileId, system, prompt, maxTokens, think: settings.mechanicThink, signal: ctrl.signal,
      });
  try {
    const won = await Promise.race([call, timedOut]);
    if (won === 'timeout') {
      call.then(
        (late) => llmLog.push({ ...entry, raw: late.text, ok: false, ms: Date.now() - started, reason: 'timeout', late: true }),
        () => {},
      );
      return fail('timeout', `no answer within ${Math.round(settings.llmTimeoutMs / 1000)} s`, '');
    }
    answer = won;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return isAbort(e) ? fail('timeout', detail, detail) : fail('network', detail, detail);
  } finally {
    clearTimeout(timer);
  }

  const parsed = classify<T>(ct, answer, opts.refusals ?? deps.refusals ?? []);
  if (!parsed.ok) return fail(parsed.reason, parsed.detail, answer.text);
  llmLog.push({ ...entry, raw: answer.text, parsed: parsed.value, ok: true, ms: Date.now() - started });
  return { ok: true, value: parsed.value, attempts: 1, at: started };
}

/**
 * Runs one typed LLM call, up to `1 + settings.autoRetry` attempts. A truncated or invalid answer is retried with the budget ×1.5;
 * a network failure, a timeout or an empty answer with the same budget; a refusal or a missing profile never. Never throws and
 * never touches campaign state. `attempts` counts every attempt made.
 */
export async function callLlm<T>(
  id: CallTypeId,
  input: unknown,
  deps: LlmDeps,
  opts: CallOpts = {},
): Promise<LlmResult<T>> {
  const base = deps.settings.budgets[id];
  const maxAttempts = 1 + deps.settings.autoRetry;
  let factor = opts.budgetMult ?? 1;
  let last: LlmResult<T> | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = await attemptLlm<T>(id, input, deps, { ...opts, budget: Math.ceil(base * factor) });
    last = { ...r, attempts: r.attempts === 0 ? 0 : attempt };
    if (r.ok) return last;
    if (r.reason === 'refused' || r.reason === 'no_profile') break;
    if (r.reason === 'truncated' || r.reason === 'invalid_output') factor *= RETRY_BUDGET_FACTOR;
  }
  return last!;
}
