import type { StAdapter } from '../st/adapter';
import type { AliusSettings } from '../settings';
import { getCallType, type CallTypeId } from './callTypes';
import { llmLog } from './log';
import { looseJson, stripThinking } from './text';

export type LlmResult<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; reason: 'no_profile' | 'call_failed' | 'invalid_output'; detail: string; attempts: number };

const MAX_ATTEMPTS = 2;
const RETRY_BUDGET_FACTOR = 1.5;

/**
 * Runs one typed LLM call: prompt → model → lenient JSON → schema. A call whose output is invalid
 * is retried once with a 1.5× budget. Never throws and never touches campaign state.
 */
export async function callLlm<T>(
  id: CallTypeId,
  input: unknown,
  deps: { st: StAdapter; settings: AliusSettings },
): Promise<LlmResult<T>> {
  const { st, settings } = deps;
  const ct = getCallType(id);
  if (!ct) return { ok: false, reason: 'call_failed', detail: `unknown call type: ${id}`, attempts: 0 };

  const mechanic = ct.profile === 'mechanic';
  const hasProfile = st.listConnectionProfiles().some((p) => p.id === settings.mechanicProfileId);
  const useMain = !mechanic || !hasProfile;
  if (mechanic && !hasProfile && !settings.mechanicFallbackToMain) {
    return { ok: false, reason: 'no_profile', detail: 'no mechanic connection profile selected', attempts: 0 };
  }

  const system = ct.system(input);
  const prompt = ct.prompt(input);
  const profileLabel = useMain ? 'main' : settings.mechanicProfileId;
  let lastDetail = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const budget = attempt === 1 ? settings.budgets[id] : Math.ceil(settings.budgets[id] * RETRY_BUDGET_FACTOR);
    // The budget is what we expect to parse; the floor is headroom for thinking models.
    const maxTokens = mechanic ? Math.max(budget, settings.requestFloor) : budget;
    const started = Date.now();
    const entry = { at: started, callType: id, profile: profileLabel, maxTokens, prompt };

    let raw: string;
    try {
      raw = useMain
        ? await st.generateMain({ prompt, systemPrompt: system, maxTokens })
        : await st.generateWithProfile({
            profileId: settings.mechanicProfileId, system, prompt, maxTokens, think: settings.mechanicThink,
          });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      llmLog.push({ ...entry, raw: detail, ok: false, ms: Date.now() - started });
      return { ok: false, reason: 'call_failed', detail, attempts: attempt };
    }

    const text = stripThinking(raw);
    let value: unknown;
    let valid = false;
    if (ct.json) {
      const json = looseJson(text);
      if (json === null) {
        lastDetail = 'no JSON found in the answer';
      } else if (ct.schema) {
        const checked = ct.schema.safeParse(json);
        valid = checked.success;
        value = checked.success ? checked.data : undefined;
        if (!checked.success) lastDetail = checked.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
      } else {
        valid = true;
        value = json;
      }
    } else if (text !== '') {
      valid = true;
      value = text;
    } else {
      lastDetail = 'empty answer';
    }

    llmLog.push({ ...entry, raw, parsed: valid ? value : undefined, ok: valid, ms: Date.now() - started });
    if (valid) return { ok: true, value: value as T, attempts: attempt };
  }
  return { ok: false, reason: 'invalid_output', detail: lastDetail, attempts: MAX_ATTEMPTS };
}
