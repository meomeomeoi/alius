import { TUNING } from '../../engine/tuning';
import type { AliusSettings } from '../../settings';
import type { StAdapter } from '../../st/adapter';
import { registerCallType } from '../callTypes';
import { callLlm } from '../orchestrator';

export interface RumorInput {
  /** The soldier who passes it on. */
  teller: string;
  /** How she stands with the commander and how she is: bands in words (`trust steady, affinity warm, stress calm`), never numbers. */
  bands: string;
  /** The fact as it was. */
  text: string;
}

registerCallType<string>({
  id: 'rumor_retell',
  profile: 'mechanic',
  json: false,
  system: () => [
    'You retell a rumor of a squad-command roleplay in the voice of the soldier who passes it on.',
    `Write ONE line of at most ${TUNING.memory.factTextMax} characters, in English, as hearsay ("they say", "I heard"). Keep who and what; colour it by how she feels.`,
    'No numbers, no headings, no markdown, no quotation marks. Give the commander no pronoun (write "the commander").',
  ].join('\n'),
  prompt: (raw) => {
    const i = raw as RumorInput;
    return [`Teller: ${i.teller}`, `How she is: ${i.bands}`, `The rumor: ${i.text}`, '', 'Write the retelling.'].join('\n');
  },
});

/** One mechanic call; null when it failed, gave nothing or wrote a digit (the rumor is then told as it was). */
export async function retellRumor(input: RumorInput, deps: { st: StAdapter; settings: AliusSettings }): Promise<string | null> {
  const r = await callLlm<string>('rumor_retell', input, deps);
  if (!r.ok) return null;
  const text = r.value.replace(/```[a-z]*/gi, ' ').replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim().slice(0, TUNING.memory.factTextMax).trim();
  return text === '' || /\d/.test(text) ? null : text;
}
