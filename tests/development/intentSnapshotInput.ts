import type { IntentExtractInput } from '../../src/llm/calls/intentExtract';

/** The input the pinned `intent_extract` prompt of P14b Task 5 was made from (no `reading`). */
export const INTENT_SNAPSHOT_INPUT: IntentExtractInput = {
  commanderName: 'Vale', channel: 'scene',
  exchange: [{ speaker: 'Vale', text: 'You did not have to carry that alone.' }, { speaker: 'Ann', text: 'I know. Thank you.' }],
  units: [{
    id: 'unit_ann', name: 'Ann', values: { pragmatism: 0, autonomy: 1, ingroup: 2, mercy: -1, corporate: 0, sacrifice: 3 },
    likes: ['tea'], dislikes: ['sirens'], triggers: ['fire'], stateId: 'comrade', defectIds: ['echo_bleed'],
  }],
  openPromises: [{ by: 'commander', to: 'unit_ann', text: 'bring the medicine' }], romance: true,
  measures: ['verbal', 'brig', 'leash', 'unspecified'],
};
