import type { Registries } from '../../content/types';
import { isLiving } from '../economy';
import { whereaboutAt, type Whereabout } from '../hub';
import type { CampaignState, Slot, Unit } from '../state/types';

/**
 * Where she was and who she could be (P14c): the slots of a day, the bookkeeping index of a slot, who takes part in her life at all, and her
 * derived whereabouts for a day (computed once per woman and day within one pass). Read-only; nothing here draws from the rng.
 */

/** Today's slots in which her whereabouts are read (the night is spent in her quarters). */
export const DAY_SLOTS: readonly Slot[] = ['morning', 'afternoon', 'evening'];
/** Slots a day holds, the unit of `LifeState.busy.slot` (`day x 4 + the slot's index`). */
export const SLOTS_PER_DAY = 4;

/** The absolute slot index of the busy list for a day and a slot. */
export const busySlot = (day: number, slot: Slot): number => day * SLOTS_PER_DAY + ['morning', 'afternoon', 'evening', 'night'].indexOf(slot);

export const unitOf = (state: Pick<CampaignState, 'squad'>, id: string): Unit | undefined => state.squad.find((u) => u.id === id);

/** A named, living soldier at the base: not out on an open run. Only she takes part in her life. */
export function takesPart(state: Pick<CampaignState, 'squad' | 'expedition'>, unitId: string): boolean {
  const u = unitOf(state, unitId);
  return u !== undefined && u.kind === 'named' && isLiving(u) && state.expedition?.party.includes(u.id) !== true;
}

/** Her whereabouts on each slot of a day, kept for one pass (the key is her id and the day). */
export type DayPlaces = Map<string, Whereabout[]>;

/** Where she is on morning, afternoon and evening of `day`; with a `cache` the derivation runs once per woman and day. */
export function placesOf(state: CampaignState, reg: Registries, unitId: string, day: number, cache?: DayPlaces): Whereabout[] {
  const key = `${unitId}|${day}`;
  const kept = cache?.get(key);
  if (kept) return kept;
  const places = DAY_SLOTS.map((slot) => whereaboutAt(state, reg, unitId, day, slot));
  cache?.set(key, places);
  return places;
}
