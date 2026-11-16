import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import type { CampaignState } from '../state/types';
import { forgetPersonal, holdsPersonal } from './state';

/**
 * The personal part of the day end (P9c). For now it only drops what a unit holds once she is no longer living (found dead,
 * deserted, terminated); later tasks add their parts in this order: decor → intercept cleanup → booking lapse, roll → claim
 * roll → token offer, expiry, giver Affinity → her challenge, expiry → secret night roll → obedience expiry. A save with no
 * `personal` state changes nothing and draws nothing. Registered on `dm_rumors` by `actions/personal`.
 */
export function personalDayStep(draft: CampaignState, _ctx: EngineCtx): EngineEvent[] {
  if (!draft.personal) return [];
  for (const unit of draft.squad) {
    if (!isLiving(unit) && holdsPersonal(draft, unit.id)) forgetPersonal(draft, unit.id);
  }
  return [];
}
