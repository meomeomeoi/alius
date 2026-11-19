import { z } from 'zod';
import { registerCallType } from '../callTypes';
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

/** The label of a model answer (`emotion_pick`, used only when extraction is batched and sprite mode is `emotion_pick`); an unknown label gives null. */
export function readEmotion(raw: unknown): ExpressionLabel | null {
  const parsed = EmotionSchema.safeParse(raw);
  if (!parsed.success) return null;
  return (EXPRESSION_LABELS as readonly string[]).includes(parsed.data.label) ? (parsed.data.label as ExpressionLabel) : null;
}
