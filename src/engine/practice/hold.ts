/**
 * Holding the commander (P16, plan R11). THIS IS A STUB until the hold is built (Task 25 replaces the body): her discipline's `slot_held` effect asks for a hold through
 * `startHold` and nothing else of the hold exists yet. It records nothing and emits nothing, so a punishment that holds the commander is accepted and carried out only in
 * its other effects until then. Draws nothing.
 */
import type { EngineCtx, EngineEvent } from '../dispatch';
import type { CampaignState } from '../state/types';

/** What asks for a hold: its length (1 or 2 slots, or what is left of the day) and whether it is her discipline (`punitive`, a threat source, R18) and which punishment. */
export interface HoldOpts { punitive?: true; punishmentId?: string }

/** Starts a hold of the commander in her quarters for `span`. A stub: nothing happens until Task 25. */
export function startHold(_draft: CampaignState, _ctx: Pick<EngineCtx, 'registries'>, _holderId: string, _span: 1 | 2 | 'day', _opts: HoldOpts = {}): EngineEvent[] {
  return [];
}
