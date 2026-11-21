/**
 * P15a: how strongly a soldier's body smells (plan R13): a base per body part × her hygiene × the situation. Hygiene reads `normal` until P15 /
 * P17d; washing, intention, clinging and noticing are theirs. Pure reads of the state; nothing draws.
 */
import type { Registries } from '../../content/types';
import { busySlot } from '../life/places';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import type { ScentBand } from './state';

const S = TUNING.scent;

/** The scent level (a number the engine keeps; the player reads only the band). */
export function scentLevel(state: CampaignState, _reg: Registries, unitId: string, part: string | undefined): number {
  const base = S.base[part ?? ''] ?? S.base.rest!;
  const hygiene = S.hygiene.normal!; // P15 / P17d plug her hygiene in
  let situation = 1;
  const run = state.lastExpedition;
  if (run && run.party.includes(unitId)) {
    if (run.day === state.day) situation *= S.afterRun.day;
    else if (run.day === state.day - 1) situation *= S.afterRun.nextDay;
  }
  const slot = busySlot(state.day, state.slot);
  if (state.life?.busy.some((b) => b.unitId === unitId && b.slot === slot && b.activityId === 'train')) situation *= S.afterTraining;
  return base * hygiene * situation;
}

export function bandOfLevel(level: number): ScentBand {
  return level >= S.bands.overwhelming ? 'overwhelming' : level >= S.bands.strong ? 'strong' : level >= S.bands.noticeable ? 'noticeable' : 'faint';
}

/** `faint` < 1, `noticeable` 1–2, `strong` 2–3.5, `overwhelming` ≥ 3.5. */
export function scentBand(state: CampaignState, reg: Registries, unitId: string, part: string | undefined): ScentBand {
  return bandOfLevel(scentLevel(state, reg, unitId, part));
}

export const BAND_INDEX: Record<ScentBand, number> = { faint: 0, noticeable: 1, strong: 2, overwhelming: 3 };
