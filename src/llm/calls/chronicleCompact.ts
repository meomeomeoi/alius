import type { AliusSettings } from '../../settings';
import type { StAdapter } from '../../st/adapter';
import { registerCallType } from '../callTypes';
import { callLlm } from '../orchestrator';

export interface ChronicleCompactInput {
  kind: 'day' | 'week';
  lines: string[];
}

export const COMPACT_MAX = 400;

registerCallType<string>({
  id: 'chronicle_compact',
  profile: 'mechanic',
  json: false,
  system: (raw) => [
    `You compact chronicle lines of a squad-command roleplay into one entry for the ${(raw as ChronicleCompactInput).kind === 'week' ? 'week' : 'day'}.`,
    `Write ONE paragraph of at most ${COMPACT_MAX} characters, in English, past tense, third person. Keep names, decisions, promises and changes between people.`,
    'No headings, no lists, no markdown, no numbers about relationships.',
  ].join('\n'),
  prompt: (raw) => {
    const i = raw as ChronicleCompactInput;
    return [`Lines to compact (${i.kind}):`, ...i.lines.map((l) => `- ${l}`), '', 'Write the compacted entry.'].join('\n');
  },
});

/** One mechanic call; null when it failed or gave nothing (the caller falls back to joining the lines). */
export async function compactChronicle(input: ChronicleCompactInput, deps: { st: StAdapter; settings: AliusSettings }): Promise<string | null> {
  if (input.lines.length === 0) return null;
  const r = await callLlm<string>('chronicle_compact', input, deps);
  if (!r.ok) return null;
  const text = r.value.replace(/```[a-z]*/gi, ' ').replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim().slice(0, COMPACT_MAX).trim();
  return text === '' ? null : text;
}
