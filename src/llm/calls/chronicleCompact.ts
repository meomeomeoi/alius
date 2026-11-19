import { registerCallType } from '../callTypes';

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

/** The compacted entry of a model answer (`chronicle_compact`): plain text cut to the cap; nothing usable gives null (the caller joins the lines). */
export function readCompaction(raw: string): string | null {
  const text = raw.replace(/```[a-z]*/gi, ' ').replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim().slice(0, COMPACT_MAX).trim();
  return text === '' ? null : text;
}
