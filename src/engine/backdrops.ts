import type { Entry, Registries } from '../content/types';
import { fnv1a } from './hub';
import type { CampaignState, Slot } from './state/types';

/**
 * P10c: scene backdrops. Pure and stateless, no rng. Locations are read by `perUnit` and their `background*` fields, room
 * styles by registry order, never by id. Art never gates anything: these are candidates the UI tries in order.
 */

/**
 * The room style of a soldier's quarters: `unit.quarters` when it names an entry, else the entry at `roomHash(unitId) % n` in
 * registry order (like `handOf`, but on other bits so it does not follow her hand), so every named soldier has a stable
 * room with nothing stored. Grunts have none.
 */
export function quartersOf(state: Pick<CampaignState, 'squad'>, reg: Registries, unitId: string): Entry | null {
  const unit = state.squad.find((u) => u.id === unitId);
  if (!unit || unit.kind !== 'named') return null;
  const chosen = unit.quarters === undefined ? undefined : reg.quartersStyles.get(unit.quarters);
  if (chosen) return chosen;
  const all = [...reg.quartersStyles.values()];
  return all.length === 0 ? null : all[roomHash(unitId) % all.length];
}

/**
 * The default room's hash. FNV-1a's low bit is fixed by the low bits of the characters (the prime is odd), so `handOf`'s
 * `fnv1a(unitId) % 6` and any salted `fnv1a(…) % 14` would share their parity: her room would follow her hand. The high
 * bits are mixed, so the room reads them.
 */
export const roomHash = (unitId: string): number => fnv1a(`${unitId}|quarters`) >>> 8;

export interface BackdropCandidate {
  /** Extension-relative path. */
  file: string;
  /** Drawn for this slot (an evening or night file): the scene adds no light filter over it. */
  slotted: boolean;
}

/** The light a slot casts over a file that was not drawn for it (P17c §4). */
export function slotLight(slot: Slot): 'day' | 'evening' | 'night' {
  return slot === 'evening' ? 'evening' : slot === 'night' ? 'night' : 'day';
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

/**
 * The background candidates of a scene, best first: at a `perUnit` location the owner's room style, then the location's
 * file for the slot (`backgroundEvening` / `backgroundNight`, slot-specific), then its day `background`. Empty = the
 * ASCII stage. Duplicates are dropped (the first one stays).
 */
export function sceneBackdrop(state: Pick<CampaignState, 'squad' | 'slot'>, reg: Registries, locationId: string, ownerId: string | null): BackdropCandidate[] {
  const loc = reg.locations.get(locationId);
  if (!loc) return [];
  const out: BackdropCandidate[] = [];
  const add = (file: string | undefined, slotted: boolean): void => {
    if (file && !out.some((c) => c.file === file)) out.push({ file, slotted });
  };
  if (loc.perUnit === true && ownerId !== null) add(str(quartersOf(state, reg, ownerId)?.background), false);
  if (state.slot === 'evening') add(str(loc.backgroundEvening), true);
  if (state.slot === 'night') add(str(loc.backgroundNight), true);
  add(str(loc.background), false);
  return out;
}
