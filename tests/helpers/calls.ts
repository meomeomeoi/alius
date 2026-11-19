import '../../src/llm/calls/all'; // registers every call type, as the app does
import { readEmotion, type EmotionPickInput } from '../../src/llm/calls/emotionPick';
import { readDigest, readSceneSummary, type SceneDigest, type SceneSummary, type SceneSummaryInput } from '../../src/llm/calls/sceneSummary';
import { callLlm, type LlmDeps } from '../../src/llm/orchestrator';
import { sanitizeRecap, type RecapInput } from '../../src/llm/calls/expeditionRecap';
import type { DilemmaGenerateInput } from '../../src/llm/calls/dilemmaGenerate';
import type { DirectorTickInput } from '../../src/llm/calls/directorTick';
import { readIntentOutput, type ExpressionLabel, type IntentExtractInput, type IntentOutput } from '../../src/llm/calls/intentExtract';
import { sanitizeDm, type DmReplyInput } from '../../src/llm/calls/dmReply';

// P14: the async wrappers of src/llm/calls/* are gone (every call runs through the envelope). Wrapper tests exercise the call type and its
// reader exactly as before through these: one `callLlm` plus the pure reader of the call's module. A failed call gives null, as it did.

export async function pickEmotion(input: EmotionPickInput, deps: LlmDeps): Promise<ExpressionLabel | null> {
  const r = await callLlm<unknown>('emotion_pick', input, deps);
  return r.ok ? readEmotion(r.value) : null;
}

export async function summarizeScene(input: SceneSummaryInput, deps: LlmDeps): Promise<SceneSummary | null> {
  const r = await callLlm<Parameters<typeof readSceneSummary>[0]>('scene_summary', { ...input, mode: undefined }, deps);
  return r.ok ? readSceneSummary(r.value, input) : null;
}

export async function digestScene(input: SceneSummaryInput, deps: LlmDeps): Promise<SceneDigest | null> {
  const r = await callLlm<Parameters<typeof readDigest>[0]>('scene_summary', { ...input, mode: 'digest' }, deps);
  return r.ok ? readDigest(r.value, input) : null;
}

export async function generateDm(input: DmReplyInput, deps: LlmDeps): Promise<string | null> {
  const r = await callLlm<string>('dm_reply', input, deps);
  return r.ok ? sanitizeDm(r.value) : null;
}

export async function extractIntents(input: IntentExtractInput, deps: LlmDeps, opts: { minConfidence?: number } = {}): Promise<IntentOutput | null> {
  const r = await callLlm<unknown>('intent_extract', input, deps);
  return r.ok ? readIntentOutput(r.value, input, { minConfidence: opts.minConfidence ?? deps.settings.intentMinConfidence }) : null;
}

export async function generateRecap(input: RecapInput, deps: LlmDeps): Promise<string | null> {
  const r = await callLlm<string>('expedition_recap', input, deps);
  return r.ok ? sanitizeRecap(r.value) : null;
}

export async function runDilemmaGenerate(input: DilemmaGenerateInput, deps: LlmDeps): Promise<unknown | null> {
  const r = await callLlm<unknown>('dilemma_generate', input, deps);
  return r.ok ? r.value : null;
}

export async function runDirectorTick(input: DirectorTickInput, deps: LlmDeps): Promise<unknown | null> {
  const r = await callLlm<unknown>('director_tick', input, deps);
  return r.ok ? r.value : null;
}
