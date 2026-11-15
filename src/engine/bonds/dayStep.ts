import type { EngineCtx, EngineEvent } from '../dispatch';
import type { CampaignState } from '../state/types';
import { syncAllPublicity } from './publicitySync';
import { releaseWantBreakdowns, startCrossedBreakdowns } from './breakdown';
import { openDesireDemands } from './desire';
import { checkDailyContact, deliverStaleRules, rollRules } from './rules';
import { expireSmother } from './smother';
import { wantStep } from './want';

/**
 * The bonds part of the day end, in this order: release breakdowns whose days are past, move Want, start the breakdowns of
 * who crossed the top band, open the desire demands of who is restless, judge the daily-contact rules and roll the rule
 * proposals of leading partners. (A smother hold whose day is past ends last.) A save without any P9d field changes
 * nothing. Registered on `dm_rumors` by `actions/bonds`.
 */
export function bondsDayStep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  return [
    ...syncAllPublicity(draft, ctx.registries),
    ...deliverStaleRules(draft),
    ...releaseWantBreakdowns(draft),
    ...wantStep(draft, ctx.registries),
    ...startCrossedBreakdowns(draft, ctx),
    ...openDesireDemands(draft, ctx),
    ...checkDailyContact(draft, ctx),
    ...rollRules(draft, ctx),
    ...expireSmother(draft),
  ];
}
