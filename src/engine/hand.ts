import type { Entry, Registries } from '../content/types';
import { fnv1a } from './hub';
import type { CampaignState } from './state/types';

/**
 * Her handwriting (P10b §4): the `unit.hand` entry when it names one, else the entry at `fnv1a(unitId) % n` in registry order, so
 * every named unit has a stable hand "from import" with nothing stored (old saves included). Read by registry order, never by id.
 */
export function handOf(state: CampaignState, reg: Registries, unitId: string): Entry | null {
  const unit = state.squad.find((u) => u.id === unitId);
  if (!unit || unit.kind !== 'named') return null;
  const chosen = unit.hand === undefined ? undefined : reg.handFonts.get(unit.hand);
  if (chosen) return chosen;
  const all = [...reg.handFonts.values()];
  return all.length === 0 ? null : all[fnv1a(unitId) % all.length];
}

/** The CSS family of a hand (what `--alius-font-hand` gets). */
export const handFamily = (hand: Entry): string => String(hand.family);

/**
 * The hand's measured size factor (P10e-e): every size in her hand is multiplied by it (Caveat is 1). 1 for no hand, or for an entry
 * without a number (a pack written before the field).
 */
export function handScale(hand: Entry | null): number {
  const s = hand?.scale;
  return typeof s === 'number' && Number.isFinite(s) && s > 0 ? s : 1;
}
