import type { Registries } from '../content/types';
import { blockingLive, COMMANDER } from '../engine/blocking';
import { blockingVocabulary, ripeSources } from '../engine/blocking/vocabulary';
import type { CampaignState } from '../engine/state/types';
import type { IntentExtractInput } from '../llm/calls/intentExtract';

/**
 * What the reading of a scene exchange is told about the staging (P15a R9): who is present, the closed vocabulary it may report in (only
 * what the gates, the room and her limits allow), the moment sources it may call ripe, and the moment that is open, if any. Nothing
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
  return { staging: { persons, vocabulary: { posture: ids(v.posture), anchor: ids(v.anchor), contact: ids(v.contact), worn: ids(v.item) }, ripe: ids(ripeSources(state, reg)) } };
}
