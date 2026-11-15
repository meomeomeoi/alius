import type { Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import type { CampaignState } from '../state/types';

/**
 * The Smother stand-in (P9d, until P9c's bookings): a unit whose care has turned to control locks the hangar for a day. Its
 * only state is `bonds.smother = { unitId, untilDay }`; everything else is read from it. Pure functions; no rng.
 */

/** The unit holding the smother and the last day it holds, or `null`. A hold whose holder is gone, or whose day is past, is none. */
export function smotherActive(state: Pick<CampaignState, 'bonds' | 'squad' | 'day'>): { unitId: string; untilDay: number } | null {
  const s = state.bonds?.smother;
  if (!s || s.untilDay < state.day) return null;
  const unit = state.squad.find((u) => u.id === s.unitId);
  return unit && isLiving(unit) ? s : null;
}

/** Is this defect one whose Want breakdown is a smother (read from its `wantBreakdown.kind`, never from an id)? */
export const isSmotherDefect = (reg: Registries, defectId: string): boolean =>
  (reg.defects.get(defectId)?.wantBreakdown as { kind?: string } | undefined)?.kind === 'smother';

/** Starts her smother for today and tomorrow (`untilDay = day + 1`); one hold at a time, the first stays. */
export function startSmother(draft: CampaignState, unitId: string): EngineEvent[] {
  const unit = draft.squad.find((u) => u.id === unitId);
  if (!unit || !isLiving(unit) || smotherActive(draft)) return [];
  const bonds = (draft.bonds ??= { rules: [] });
  bonds.smother = { unitId, untilDay: draft.day + 1 };
  return [{ type: 'smother_started', unitId, untilDay: draft.day + 1 }];
}

/** Ends the hold (when given a unit: only hers). */
export function clearSmother(draft: CampaignState, unitId?: string): EngineEvent[] {
  const s = draft.bonds?.smother;
  if (!s || (unitId !== undefined && s.unitId !== unitId)) return [];
  delete draft.bonds!.smother;
  return [{ type: 'smother_ended', unitId: s.unitId }];
}

/** The day step: a hold whose last day is past ends. */
export function expireSmother(draft: CampaignState): EngineEvent[] {
  const s = draft.bonds?.smother;
  return s && s.untilDay < draft.day ? clearSmother(draft) : [];
}

/** Why an expedition cannot leave while a smother holds, or `null`. */
export function smotherRefusal(state: Pick<CampaignState, 'bonds' | 'squad' | 'day'>): string | null {
  const s = smotherActive(state);
  if (!s) return null;
  const name = state.squad.find((u) => u.id === s.unitId)?.displayName ?? 'She';
  return `${name} has locked the hangar: the commander stays at base today.`;
}
