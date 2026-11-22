/**
 * The slap (P16, plan R21). THIS IS A STUB until the slap is built (Task 33 replaces the body): her discipline's `slap` effect asks for one through `startSlap` and nothing
 * else of it exists yet. It records nothing and emits nothing. Draws nothing.
 */
import type { EngineCtx, EngineEvent } from '../dispatch';
import type { CampaignState } from '../state/types';

/** What asks for a slap: which punishment (its effect), or `unannounced` (after a slip in a scene). */
export interface SlapOpts { punishmentId?: string; unannounced?: true }

/** Starts a slap on the commander by this holder. A stub: nothing happens until Task 33. */
export function startSlap(_draft: CampaignState, _ctx: Pick<EngineCtx, 'registries'>, _holderId: string, _opts: SlapOpts = {}): EngineEvent[] {
  return [];
}
