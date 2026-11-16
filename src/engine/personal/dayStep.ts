import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import type { CampaignState } from '../state/types';
import { lapseBookings, rollBookings } from './bookings';
import { rollClaims } from './courtship';
import { decorDayStep } from './decor';
import { interceptDayStep } from './intercept';
import { tokenDayStep } from './tokens';
import { wagerDayStep } from './wagers';
import { forgetPersonal, holdsPersonal } from './state';

/**
 * The personal part of the day end (P9c). It drops what a unit holds once she is no longer living (found dead,
 * deserted, terminated), then runs the decor part; later tasks add their parts in this order: decor → intercept cleanup → booking lapse, roll → claim
 * roll → token offer, expiry, giver Affinity → her challenge, expiry → secret night roll → obedience expiry. A save with no
 * `personal` state changes nothing and draws nothing. Registered on `dm_rumors` by `actions/personal`.
 */
export function personalDayStep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  if (draft.personal) {
    for (const unit of draft.squad) {
      if (!isLiving(unit) && holdsPersonal(draft, unit.id)) forgetPersonal(draft, unit.id);
    }
  }
  return [...decorDayStep(draft, ctx), ...interceptDayStep(draft), ...lapseBookings(draft), ...rollBookings(draft, ctx), ...rollClaims(draft, ctx), ...tokenDayStep(draft, ctx), ...wagerDayStep(draft, ctx)];
}
