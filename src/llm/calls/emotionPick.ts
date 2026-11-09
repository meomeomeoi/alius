import { z } from 'zod';
import type { AliusSettings } from '../../settings';
import type { StAdapter } from '../../st/adapter';
import { registerCallType } from '../callTypes';
import { callLlm } from '../orchestrator';
import { EXPRESSION_LABELS, type ExpressionLabel } from './intentExtract';

export interface EmotionPickInput {
  unitName: string;
  text: string;
}

const EmotionSchema = z.object({ label: z.string() }).strip();

registerCallType<z.infer<typeof EmotionSchema>>({
  id: 'emotion_pick',
  profile: 'mechanic',
  json: true,
  system: () => [
    'You classify the dominant emotion of one line of roleplay dialogue.',
    `Reply with a single JSON object and nothing else: {"label": "<one of: ${EXPRESSION_LABELS.join(', ')}>"}`,
  ].join('\n'),
  prompt: (raw) => {
    const i = raw as EmotionPickInput;
    return `Speaker: ${i.unitName}\nLine: ${i.text}`;
  },
  schema: EmotionSchema,
});

/** One cheap mechanic call (used only when extraction is batched and sprite mode is `emotion_pick`); unknown label → null. */
export async function pickEmotion(input: EmotionPickInput, deps: { st: StAdapter; settings: AliusSettings }): Promise<ExpressionLabel | null> {
  const r = await callLlm<z.infer<typeof EmotionSchema>>('emotion_pick', input, deps);
  if (!r.ok) return null;
  return (EXPRESSION_LABELS as readonly string[]).includes(r.value.label) ? (r.value.label as ExpressionLabel) : null;
}
