import type { EngineCtx, EngineEvent } from '../dispatch';
import type { CampaignState } from '../state/types';
import { wardenOf } from './state';

/**
 * The warden's day step (a hook inside `director_tick`, after the others). Chunk (b) grows it: restrictions that have run their days
 * expire (the same rule as P9's `no_leave`: gone once the day end reaches their last day).
 */
export function wardenDayStep(draft: CampaignState, _ctx: EngineCtx): EngineEvent[] {
  const w = wardenOf(draft);
  if (!w) return [];
  const gone = w.restrictions.filter((r) => r.untilDay <= draft.day);
  if (gone.length > 0) w.restrictions = w.restrictions.filter((r) => r.untilDay > draft.day);
  return gone.map((r) => ({ type: 'commander_restriction_ended', what: r.what }));
}
