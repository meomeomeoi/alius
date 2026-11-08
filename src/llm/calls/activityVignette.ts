import { registerCallType } from '../callTypes';
import { callLlm } from '../orchestrator';
import type { AliusSettings } from '../../settings';
import type { StAdapter } from '../../st/adapter';

export interface VignetteInput {
  activityName: string;
  commanderName: string;
  unitName: string;
  unitRole: string;
  likes: string[];
  defectNames: string[];
}

const MAX_LINES = 2;
const MAX_CHARS = 240;

/** Cleans a model answer to at most two short lines of plain prose; nothing usable → null. */
export function sanitizeVignette(text: string): string | null {
  const lines = text
    .replace(/```[a-z]*/gi, '\n')
    .split(/\r?\n/)
    .map((l) =>
      l
        .trim()
        .replace(/^(vignette|scene|response|reply)\s*:\s*/i, '')
        .replace(/[*_`#>]+/g, '')
        .trim()
        .replace(/^["“”]+|["“”]+$/g, '')
        .trim(),
    )
    .filter((l) => l !== '');
  if (lines.length === 0) return null;
  const out = lines.slice(0, MAX_LINES).join('\n').slice(0, MAX_CHARS).trimEnd();
  return out === '' ? null : out;
}

registerCallType<string>({
  id: 'activity_vignette',
  profile: 'main',
  json: false,
  system: () =>
    [
      'You write a tiny moment for a squad-command roleplay: the commander spends a slot of the day with one soldier.',
      'Write exactly two lines of plain prose, at most one sentence each, in the present tense, in English.',
      'No dialogue tags, no markdown, no headings, no game numbers. Do not decide anything for the commander beyond the shared activity.',
    ].join('\n'),
  prompt: (raw) => {
    const i = raw as VignetteInput;
    return [
      `Activity: ${i.activityName}`,
      `Commander: ${i.commanderName}`,
      `Soldier: ${i.unitName} (${i.unitRole})`,
      i.likes.length > 0 ? `She likes: ${i.likes.join(', ')}` : '',
      i.defectNames.length > 0 ? `Her defects: ${i.defectNames.join(', ')}` : '',
      'Write the moment.',
    ].filter(Boolean).join('\n');
  },
});

/** One optional main-model call; any failure gives null. It only returns text, never numbers. */
export async function generateVignette(
  input: VignetteInput, deps: { st: StAdapter; settings: AliusSettings },
): Promise<string | null> {
  const r = await callLlm<string>('activity_vignette', input, deps);
  return r.ok ? sanitizeVignette(r.value) : null;
}
