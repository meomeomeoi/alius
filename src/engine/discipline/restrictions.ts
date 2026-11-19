import type { EngineEvent } from '../dispatch';
import type { CampaignState, Restriction, Slot } from '../state/types';
import { disciplineOf } from './record';

/** What a unit is being asked to do when a restriction is checked. */
export type RestrictionUse = 'scene' | 'companion' | 'expedition';

/** Activities a unit without leave may still be the companion of: they are not leave. */
export const NOT_LEAVE: readonly string[] = ['talk', 'medbay'];

const nameOf = (state: CampaignState, id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;

function reasonOf(state: CampaignState, r: Restriction, use: RestrictionUse, activityId?: string): string | null {
  const name = nameOf(state, r.unitId);
  switch (r.kind) {
    case 'confined':
      return state.day <= (r.untilDay ?? -1) ? `${name} is in the brig until day ${r.untilDay}.` : null;
    case 'no_leave':
      return use === 'companion' && !(activityId !== undefined && NOT_LEAVE.includes(activityId)) && state.day <= (r.untilDay ?? -1)
        ? `${name} has no leave until day ${r.untilDay}.` : null;
    case 'benched':
      return use === 'expedition' ? `${name} is benched for the next expedition.` : null;
    case 'duty':
      return r.day === state.day && r.slot === state.slot ? `${name} is on extra duty this slot.` : null;
  }
}

/** Why a unit cannot be asked to do this right now because of the commander's discipline, or `null`. Reads nothing in a save without it. */
export function restrictionReason(state: CampaignState, unitId: string, use: RestrictionUse, activityId?: string): string | null {
  for (const r of state.discipline?.restrictions ?? []) {
    if (r.unitId !== unitId) continue;
    const why = reasonOf(state, r, use, activityId);
    if (why) return why;
  }
  return null;
}

/** The restrictions that hold for her right now (an expired brig and a duty of another slot are not listed). */
export function activeRestrictions(state: CampaignState, unitId: string): Restriction[] {
  return (state.discipline?.restrictions ?? []).filter((r) => r.unitId === unitId && (
    r.kind === 'benched' || ((r.kind === 'confined' || r.kind === 'no_leave') && state.day <= (r.untilDay ?? -1)) || (r.kind === 'duty' && r.day === state.day && r.slot === state.slot)));
}

export function addRestriction(draft: CampaignState, r: Restriction): EngineEvent[] {
  disciplineOf(draft).restrictions.push(r);
  return [{ type: 'restriction_started', unitId: r.unitId, kind: r.kind, ...(r.untilDay !== undefined ? { untilDay: r.untilDay } : {}) }];
}

/** Takes out every restriction `pick` accepts and returns them (UNDO puts them back by removing, a bench ends this way). */
export function removeRestrictions(draft: CampaignState, pick: (r: Restriction) => boolean): Restriction[] {
  const d = draft.discipline;
  if (!d) return [];
  const gone = d.restrictions.filter(pick);
  if (gone.length > 0) d.restrictions = d.restrictions.filter((r) => !pick(r));
  return gone;
}

/** The day-end step: a brig or a leave ban whose last day has come, and a duty of today or earlier, are over. A bench waits for the run. */
export function expireRestrictions(draft: CampaignState): EngineEvent[] {
  const gone = removeRestrictions(draft, (r) =>
    (r.kind === 'confined' || r.kind === 'no_leave') ? (r.untilDay ?? 0) <= draft.day : r.kind === 'duty' ? (r.day ?? 0) <= draft.day : false);
  return gone.map((r) => ({ type: 'restriction_ended', unitId: r.unitId, kind: r.kind }));
}

const NEXT: Record<Slot, Slot> = { morning: 'afternoon', afternoon: 'evening', evening: 'morning', night: 'morning' };

/**
 * The slot an extra duty covers: the current one, or the next while a scene or a pending talk holds the current slot
 * (after the evening or the night that is the next day's morning).
 */
export function dutySlot(state: CampaignState): { day: number; slot: Slot } {
  const held = state.scene !== undefined || state.calendar.pendingScene !== undefined;
  if (!held) return { day: state.day, slot: state.slot };
  const slot = NEXT[state.slot];
  return { day: slot === 'morning' ? state.day + 1 : state.day, slot };
}
