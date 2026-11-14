import { DEED_COUNTERS, type CampaignState, type DeedCounter } from '../state/types';

/**
 * Adds to one of the commander's deed counters (P9 §6). A counter back at 0 is dropped and the object goes when it is empty, so
 * an UNDO that takes the deeds back leaves a save that looks untouched. Never below 0.
 */
export function countDeed(draft: CampaignState, counter: DeedCounter, n = 1): void {
  const now = draft.commander.deeds?.[counter] ?? 0;
  const next = Math.max(0, now + n);
  if (next === now) return;
  const deeds = (draft.commander.deeds ??= {});
  if (next === 0) delete deeds[counter];
  else deeds[counter] = next;
  if (Object.keys(deeds).length === 0) delete draft.commander.deeds;
}

/** Every counter, 0 for the ones never counted; an unknown key in an old save is ignored. */
export function deedsOf(state: CampaignState): Record<DeedCounter, number> {
  const out = {} as Record<DeedCounter, number>;
  for (const c of DEED_COUNTERS) {
    const v = state.commander.deeds?.[c];
    out[c] = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  }
  return out;
}
