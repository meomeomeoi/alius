/**
 * What a holder's discipline stands in the way of (P16, plan R8): the two readers the lower layers ask. `commanderRestrictionOf` answers for the commander (DMs to anyone but her, a
 * companion activity that is leave, a room, a DM to a holder who gives the cold shoulder) and `unitRestrictionOf` for a holder herself (no scene with her in her cold shoulder).
 * The warden's own restrictions come first (`commanderRestriction` asks it before any reader). Both answer null with no `practices` (a campaign that never had a holder) and read
 * only: they import nothing of the layers that ask. What a holder set binds only while she is live (`practiceLive`: the dynamic on, her frame at `play` or beyond, no aftermath): switched off, or fallen to `equal`, her bars answer null until she is live again.
 */
import type { Registries } from '../../content/types';
import { NOT_LEAVE, type RestrictionUse } from '../discipline/restrictions';
import type { CampaignState } from '../state/types';
import { practiceLive } from './gate';

const nameOf = (state: CampaignState, id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;

/** Why the commander cannot do this because of a holder, or null: a bar on messages to others or on free time, on a room, or her cold shoulder (no DM to her gets an answer). */
export function commanderRestrictionOf(state: CampaignState, reg: Registries, use: 'companion' | 'dm' | 'scene', activityId?: string, toUnitId?: string, locationId?: string): string | null {
  const p = state.practices;
  if (p === undefined) return null;
  for (const r of p.restrictions) {
    if (state.day > r.untilDay || !practiceLive(state, reg, r.holderId)) continue;
    const name = nameOf(state, r.holderId);
    if (r.what === 'no_dms_others' && use === 'dm' && toUnitId !== undefined && toUnitId !== r.holderId) return `${name} has barred the commander's messages to anyone else until day ${r.untilDay}.`;
    if (r.what === 'no_free_activities' && use === 'companion' && !(activityId !== undefined && NOT_LEAVE.includes(activityId))) return `${name} has barred the commander's free time until day ${r.untilDay}.`;
    if (r.what === 'room' && use === 'scene' && r.arg !== undefined && r.arg === locationId) return `${name} has barred the commander from that room until day ${r.untilDay}.`;
  }
  if (use === 'dm' && toUnitId !== undefined && (p.cold[toUnitId] ?? -1) >= state.day && practiceLive(state, reg, toUnitId)) return 'She is not answering.';
  return null;
}

/** Why a holder cannot be met right now: her cold shoulder (no scene with her until its last day). Only a scene is refused; the rest of the discipline's uses are not hers to bar. */
export function unitRestrictionOf(state: CampaignState, reg: Registries, unitId: string, use: RestrictionUse): string | null {
  const until = state.practices?.cold[unitId];
  if (use !== 'scene' || until === undefined || until < state.day || !practiceLive(state, reg, unitId)) return null;
  return `${nameOf(state, unitId)} is not seeing the commander until day ${until}.`;
}
