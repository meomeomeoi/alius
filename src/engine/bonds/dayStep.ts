import type { EngineCtx, EngineEvent } from '../dispatch';
import type { CampaignState } from '../state/types';
import { releaseWantBreakdowns, startCrossedBreakdowns } from './breakdown';
import { wantStep } from './want';

/**
 * The bonds part of the day end, in this order: release breakdowns whose days are past, move Want and start the breakdowns of
 * who crossed the top band. (Rule proposals and the smother expiry join in later tasks.) A save without any P9d field changes
 * nothing. Registered on `dm_rumors` by `actions/bonds`.
 */
export function bondsDayStep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  return [
    ...releaseWantBreakdowns(draft),
    ...wantStep(draft, ctx.registries),
    ...startCrossedBreakdowns(draft, ctx),
  ];
}
