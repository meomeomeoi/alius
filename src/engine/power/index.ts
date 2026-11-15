import type { CampaignState, PowerState } from '../state/types';

export { assertiveness, votingOn, type Assertiveness } from './options';

/** The power state, created on the first write (a save without it reads as no votes, no hierarchy, no merit). */
export function powerOf(draft: CampaignState): PowerState {
  return (draft.power ??= { votes: { log: [], seq: 0 } });
}
