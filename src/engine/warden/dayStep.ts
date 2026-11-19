import type { EngineCtx, EngineEvent } from '../dispatch';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { openQueuedReport } from './removal';
import { wardenOf } from './state';

/**
 * The warden's day step (a hook inside `director_tick`, after the others): the intrigue suspicion fades by 3 a day, defiance decays by 2 a day, and restrictions that have run
 * their days expire (the same rule as P9's `no_leave`: gone once the day end reaches their last day).
 */
export function wardenDayStep(draft: CampaignState, _ctx: EngineCtx): EngineEvent[] {
  const ls = draft.leashswap;
  if (ls) ls.intrigue.suspicion = Math.max(0, ls.intrigue.suspicion - TUNING.warden.intrigue.decayPerDay); // the suspicion fades, even while nobody holds the leash
  const w = wardenOf(draft);
  if (!w) return [];
  const events: EngineEvent[] = openQueuedReport(draft, _ctx); // a report that waited for another decision
  w.defiance = Math.max(0, w.defiance - TUNING.warden.defiance.decayPerDay); // open defiance fades; a fall never warns
  const gone = w.restrictions.filter((r) => r.untilDay <= draft.day);
  if (gone.length > 0) w.restrictions = w.restrictions.filter((r) => r.untilDay > draft.day);
  return [...events, ...gone.map((r): EngineEvent => ({ type: 'commander_restriction_ended', what: r.what }))];
}
