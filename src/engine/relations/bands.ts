import type { LoyaltyBand } from '../state/types';
import { TUNING } from '../tuning';

export type TrustBand = 'none' | 'low' | 'guarded' | 'solid' | 'high';
export type AffinityBand = 'hostile' | 'cold' | 'cool' | 'neutral' | 'warm' | 'devoted';
export type AttractionBand = 'none' | 'faint' | 'interested' | 'strong';
export type StressBand = 'calm' | 'tense' | 'strained' | 'breaking';

export const trustBand = (n: number): TrustBand => (n < 10 ? 'none' : n < 25 ? 'low' : n < 45 ? 'guarded' : n < 70 ? 'solid' : 'high');

export const affinityBand = (n: number): AffinityBand =>
  n <= -60 ? 'hostile' : n <= -30 ? 'cold' : n < 0 ? 'cool' : n < 30 ? 'neutral' : n < 60 ? 'warm' : 'devoted';

export const attractionBand = (n: number): AttractionBand => (n < 10 ? 'none' : n < 25 ? 'faint' : n < 50 ? 'interested' : 'strong');

export const stressBand = (n: number): StressBand => (n < 25 ? 'calm' : n < 50 ? 'tense' : n < 80 ? 'strained' : 'breaking');

/** A disposition level moves the loyalty thresholds: `enter` for falling into a worse band, `exit` for climbing out (P8). */
export interface BandShift { enter: number; exit: number }
const NO_SHIFT: BandShift = { enter: 0, exit: 0 };

/**
 * Loyalty with hysteresis on Trust: enter wavering <25, breaking <10; leave wavering at ≥35, breaking at ≥20 (≥35 to steady).
 * A disposition level shifts the enter thresholds by `shift.enter` and the exit thresholds by `shift.exit`.
 */
export function nextLoyaltyBand(current: LoyaltyBand, trust: number, shift: BandShift = NO_SHIFT): LoyaltyBand {
  const L = TUNING.relations.loyalty;
  const breakingEnter = L.breakingEnter + shift.enter;
  const waveringEnter = L.waveringEnter + shift.enter;
  const steady = L.steady + shift.exit;
  const breakingExit = L.breakingExit + shift.exit;
  if (trust < breakingEnter) return 'breaking';
  switch (current) {
    case 'steady': return trust < waveringEnter ? 'wavering' : 'steady';
    case 'wavering': return trust >= steady ? 'steady' : 'wavering';
    case 'breaking': return trust >= steady ? 'steady' : trust >= breakingExit ? 'wavering' : 'breaking';
  }
}

/** The loyalty band a relation starts in (and is re-based to after a join-time Trust change): <10 breaking, <25 wavering, else steady (shifted by the unit's disposition). */
export const initialLoyaltyBand = (trust: number, shift: BandShift = NO_SHIFT): LoyaltyBand => {
  const L = TUNING.relations.loyalty;
  return trust < L.breakingEnter + shift.enter ? 'breaking' : trust < L.waveringEnter + shift.enter ? 'wavering' : 'steady';
};
