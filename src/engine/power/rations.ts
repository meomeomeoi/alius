import type { Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import { upkeepNeeded } from '../economy';
import type { CampaignState } from '../state/types';
import { RATION_MODES, rationsOf } from './state';

/**
 * Ration modes (P9b): how a shortage is shared out. The modes themselves act in `runUpkeep` (economy.ts); this module holds
 * the vote rule and the action's effect. No rng.
 */

export { RATION_MODES, rationsOf };

/** Votable while a shortage is on (`shortageStreak > 0`) or coming (the supplies do not cover tomorrow's upkeep); otherwise set freely. */
export function rationsVotable(state: CampaignState, reg: Registries): boolean {
  return (state.calendar.shortageStreak ?? 0) > 0 || state.resources.supplies < upkeepNeeded(state, reg).needed;
}

/** Sets the mode (`equal` removes the field, as in a save that never chose). */
export function setRations(draft: CampaignState, mode: unknown): EngineEvent[] {
  if (typeof mode !== 'string' || !RATION_MODES.includes(mode as never)) throw new Error(`Unknown ration mode "${String(mode)}".`);
  if (mode === 'equal') delete draft.base.rations;
  else draft.base.rations = mode as (typeof RATION_MODES)[number];
  return [{ type: 'rations_set', mode }];
}
