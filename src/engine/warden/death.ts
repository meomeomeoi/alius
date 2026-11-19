import type { EngineCtx, EngineEvent } from '../dispatch';
import { addChronicle } from '../memory';
import type { CampaignState } from '../state/types';
import { leashswapOf } from './state';

/**
 * The commander's death in LEASHSWAP (P13 §1). Only the mode has one: the commander cannot die in the default mode.
 *
 *  - `rewind_day`: the engine emits `commander_died { rule: 'rewind_day', cause }` and changes nothing else. The app restores the
 *    day-start snapshot (and hides the scenes played since), so nothing is written to memory: the restored state never had it.
 *  - `campaign_end`: `ended` is written, a chronicle line with `audience: '*'` and `campaign_ended`; from then on `dispatch` refuses
 *    everything but `debug/*` and `campaign/epilogue`, so no state ever changes again.
 *  - An execution by verdict (`cause: 'executed'`) always ends the campaign, whatever the rule: a rewind would replay the same
 *    verdict from the same rng. `forceEnd` ends it too (the app found no snapshot to rewind to).
 */
export type DeathCause = 'terminated' | 'executed';
export const DEATH_CAUSES: readonly DeathCause[] = ['terminated', 'executed'];

/** The chronicle line of the end. No pronoun for the commander (lore §0). */
const CLOSING: Record<DeathCause, string> = {
  terminated: 'The controller was triggered. The commander is dead.',
  executed: 'The investigation ended with an execution order. The commander is dead.',
};

export function commanderDies(draft: CampaignState, _ctx: EngineCtx, cause: DeathCause, opts: { forceEnd?: boolean } = {}): EngineEvent[] {
  const ls = leashswapOf(draft);
  if (!ls) throw new Error('The commander cannot die: the campaign is not in the LEASHSWAP mode.');
  if (draft.ended) throw new Error('The campaign is already closed.');
  if (ls.deathRule === 'rewind_day' && cause !== 'executed' && opts.forceEnd !== true) {
    return [{ type: 'commander_died', rule: 'rewind_day', cause }];
  }
  draft.ended = { day: draft.day, cause };
  addChronicle(draft, { kind: 'day', day: draft.day, text: `Day ${draft.day}: ${CLOSING[cause]}`, audience: '*' });
  return [
    { type: 'commander_died', rule: 'campaign_end', cause },
    { type: 'campaign_ended', cause },
  ];
}
