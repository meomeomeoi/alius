import type { DmReplyInput } from '../../src/llm/calls/dmReply';

/** A fixed input for each mode of `dm_reply`, so the prompts without an open offer can be pinned (P15, review I3). */
export const DM_FIXTURE_INPUT: DmReplyInput = {
  unitName: 'Rhea', commanderName: 'Vale', stateHint: 'She trusts the commander and says so plainly.',
  bands: { trust: 'solid', affinity: 'warm', attraction: 'faint', stress: 'tense' },
  recentFacts: ['She keeps a photo.', 'She hates sirens.'], dossier: 'Rhea keeps a letter.', journal: ['the commander kept a promise to her (day 4)'],
  slotText: 'DAY 003 // EVENING',
  history: [{ from: 'commander', text: 'hello' }, { from: 'unit', text: 'hi' }, { from: 'commander', text: 'are you well' }], mode: 'reply',
};
const MODES: DmReplyInput['mode'][] = ['reply', 'snap', 'initiate', 'curt', 'door'];

/** The system and the prompt of every mode, in one text. */
export function dmFixtureText(ct: { system(i: unknown): unknown; prompt(i: unknown): unknown }, over: Partial<DmReplyInput> = {}): string {
  return MODES.map((mode) => {
    const i = { ...DM_FIXTURE_INPUT, ...over, mode };
    return `##### ${mode}\n${String(ct.system(i))}\n=====\n${String(ct.prompt(i))}\n`;
  }).join('\n');
}
