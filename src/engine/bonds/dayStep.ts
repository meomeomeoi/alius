import type { EngineCtx, EngineEvent } from '../dispatch';
import type { CampaignState } from '../state/types';
import { releaseWantBreakdowns, startCrossedBreakdowns } from './breakdown';
import { openDesireDemands } from './desire';
import { wantStep } from './want';

/**
 * The bonds part of the day end, in this order: release breakdowns whose days are past, move Want, start the breakdowns of
 * who crossed the top band and open the desire demands of who is restless. (Rule proposals and the smother expiry join in later tasks.) A save without any P9d field changes
 * nothing. Registered on `dm_rumors` by `actions/bonds`.
 */
export function bondsDayStep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  return [
    ...releaseWantBreakdowns(draft),
    ...wantStep(draft, ctx.registries),
    ...startCrossedBreakdowns(draft, ctx),
    ...openDesireDemands(draft, ctx),
  ];
}
