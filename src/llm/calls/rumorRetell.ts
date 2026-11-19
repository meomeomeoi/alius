import { TUNING } from '../../engine/tuning';
import { registerCallType } from '../callTypes';

export interface RumorInput {
  /** The soldier who passes it on. */
  teller: string;
  /** How she stands with the commander and how she is: bands in words (`trust steady, affinity warm, stress calm`), never numbers. */
  bands: string;
  /** The fact as it was. */
  text: string;
  /** P11b: the campaign's fact length (a memory setting); absent = the default. */
  factTextMax?: number;
}

registerCallType<string>({
  id: 'rumor_retell',
  profile: 'mechanic',
  json: false,
  system: (raw) => [
    'You retell a rumor of a squad-command roleplay in the voice of the soldier who passes it on.',
    `Write ONE line of at most ${(raw as RumorInput | undefined)?.factTextMax ?? TUNING.memory.factTextMax} characters, in English, as hearsay ("they say", "I heard"). Keep who and what; colour it by how she feels.`,
    'No numbers, no headings, no markdown, no quotation marks. Give the commander no pronoun (write "the commander").',
  ].join('\n'),
  prompt: (raw) => {
    const i = raw as RumorInput;
    return [`Teller: ${i.teller}`, `How she is: ${i.bands}`, `The rumor: ${i.text}`, '', 'Write the retelling.'].join('\n');
  },
});

/** The retelling of a model answer (`rumor_retell`); null when it is empty or wrote a digit (the rumor is then told as it was). */
export function readRumor(raw: string, max: number = TUNING.memory.factTextMax): string | null {
  const text = raw.replace(/```[a-z]*/gi, ' ').replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim().slice(0, max).trim();
  return text === '' || /\d/.test(text) ? null : text;
}
