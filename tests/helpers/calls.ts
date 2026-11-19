import '../../src/llm/calls/all'; // registers every call type, as the app does
import { readEmotion, type EmotionPickInput } from '../../src/llm/calls/emotionPick';
import { readDigest, readSceneSummary, type SceneDigest, type SceneSummary, type SceneSummaryInput } from '../../src/llm/calls/sceneSummary';
import { callLlm, type LlmDeps } from '../../src/llm/orchestrator';
import { readCompaction, type ChronicleCompactInput } from '../../src/llm/calls/chronicleCompact';
import { readFold, type FoldInput, type FoldRaw } from '../../src/llm/calls/memoryFold';
import { readRumor, type RumorInput } from '../../src/llm/calls/rumorRetell';
import { sanitizeVignette, type VignetteInput } from '../../src/llm/calls/activityVignette';
import {
  hasFlavorKind, sanitizeBallotFlavor, sanitizeDemandFlavor, sanitizeDmEdit, sanitizeEnemyFlavor, sanitizeFragment, sanitizeGruntFlavor, sanitizeRuleFlavor,
  type BallotFlavorInput, type DemandFlavorInput, type DmEditFlavorInput, type EnemyFlavorInput, type GruntFlavorInput, type RuleFlavorInput,
} from '../../src/llm/calls/flavor';
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

export async function compactChronicle(input: ChronicleCompactInput, deps: LlmDeps): Promise<string | null> {
  if (input.lines.length === 0) return null; // no lines, no call
  const r = await callLlm<string>('chronicle_compact', input, deps);
  return r.ok ? readCompaction(r.value) : null;
}

export async function foldMemory(input: FoldInput, deps: LlmDeps): Promise<{ own: string; shared: string } | null> {
  if (input.ownFacts.length === 0 && input.sharedFacts.length === 0) return null; // no facts, no call
  const r = await callLlm<FoldRaw>('memory_fold', input, deps);
  return r.ok ? readFold(r.value, input) : null;
}

export async function retellRumor(input: RumorInput, deps: LlmDeps): Promise<string | null> {
  const r = await callLlm<string>('rumor_retell', input, deps);
  return r.ok ? readRumor(r.value) : null;
}

export async function generateVignette(input: VignetteInput, deps: LlmDeps): Promise<string | null> {
  const r = await callLlm<string>('activity_vignette', input, deps);
  return r.ok ? sanitizeVignette(r.value) : null;
}

export async function generateGruntFlavor(input: GruntFlavorInput, deps: LlmDeps): Promise<{ name: string; bio: string } | null> {
  return sanitizeGruntFlavor(await generateFlavor(input, deps));
}

export async function generateEnemyFlavor(input: EnemyFlavorInput, deps: LlmDeps): Promise<{ name: string } | null> {
  return sanitizeEnemyFlavor(await generateFlavor(input, deps));
}

/** The model's JSON object for a flavor input, or null when the kind is unknown (no call) or the call failed. */
export async function generateFlavor<T extends { kind: string }>(input: T, deps: LlmDeps): Promise<Record<string, unknown> | null> {
  if (!hasFlavorKind(input.kind)) return null;
  const r = await callLlm<Record<string, unknown>>('flavor', input, deps);
  return r.ok ? r.value : null;
}

export async function generateDemandFlavor(input: DemandFlavorInput, deps: LlmDeps): Promise<string | null> {
  return sanitizeDemandFlavor(await generateFlavor(input, deps))?.text ?? null;
}

export async function generateRuleFlavor(input: RuleFlavorInput, deps: LlmDeps): Promise<string | null> {
  return sanitizeRuleFlavor(await generateFlavor(input, deps))?.text ?? null;
}

export async function generateBallotFlavor(input: BallotFlavorInput, deps: LlmDeps): Promise<Record<string, string>> {
  return sanitizeBallotFlavor(await generateFlavor(input, deps), input.ballots.map((b) => b.name));
}

export async function generateDmEdit(input: DmEditFlavorInput, deps: LlmDeps): Promise<string | null> {
  return sanitizeDmEdit(await generateFlavor(input, deps))?.text ?? null;
}

export async function generateFragment(input: { name: string; kind: string; gist: string; partial: boolean }, deps: LlmDeps): Promise<string | null> {
  const r = await generateFlavor({ kind: 'frequency_fragment' as const, name: input.name, candidate: input.kind, gist: input.gist, partial: input.partial }, deps);
  return sanitizeFragment(r?.text);
}
