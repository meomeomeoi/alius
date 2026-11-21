import type { Registries } from '../content/types';
import { blockingLive, COMMANDER } from '../engine/blocking';
import { blockingVocabulary, ripeSources } from '../engine/blocking/vocabulary';
import { momentsOf } from '../engine/moments/state';
import type { CampaignState } from '../engine/state/types';
import type { IntentExtractInput } from '../llm/calls/intentExtract';
import { genericWord } from './momentDirectives';

/**
 * What the reading of a scene exchange is told about the staging (P15a R9): who is present, the closed vocabulary it may report in (only
 * what the gates, the room and her limits allow), the moment sources it may call ripe, and the moment that is open, if any (its three generic
 * words and the keys of its options). Nothing
 * (`{}`) while the blocking is not live, so the prompt is byte-identical to the one before this package.
 */
export function stagingInput(state: CampaignState, reg: Registries, participants: string[]): Pick<IntentExtractInput, 'staging'> {
  if (!blockingLive(state, reg)) return {};
  const v = blockingVocabulary(state, reg);
  const ids = (list: Array<{ id: string }>): string[] => list.map((e) => e.id);
  const persons = [
    ...participants.map((id) => ({ id, name: state.squad.find((u) => u.id === id)?.displayName ?? id })),
    { id: COMMANDER, name: state.commander.name },
  ];
  const open = momentsOf(state.scene).open;
  return {
    staging: {
      persons, vocabulary: { posture: ids(v.posture), anchor: ids(v.anchor), contact: ids(v.contact), worn: ids(v.item) }, ripe: ids(ripeSources(state, reg)),
      // the moment that waits for an answer: its three generic words (the reading words them for the scene) and every key an answer may name
      ...(open ? { open: { id: open.id, sourceId: open.sourceId, options: ['0', '1', '2'].map((k) => genericWord(reg, open.sourceId, k)), keys: open.options.map((o) => o.key) } } : {}),
    },
  };
}
