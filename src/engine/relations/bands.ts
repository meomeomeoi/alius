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

/** Loyalty with hysteresis on Trust: enter wavering <25, breaking <10; leave wavering at ≥35, breaking at ≥20 (≥35 to steady). */
export function nextLoyaltyBand(current: LoyaltyBand, trust: number): LoyaltyBand {
  const L = TUNING.relations.loyalty;
  if (trust < L.breakingEnter) return 'breaking';
  switch (current) {
    case 'steady': return trust < L.waveringEnter ? 'wavering' : 'steady';
    case 'wavering': return trust >= L.steady ? 'steady' : 'wavering';
    case 'breaking': return trust >= L.steady ? 'steady' : trust >= L.breakingExit ? 'wavering' : 'breaking';
  }
}

/** The loyalty band a relation starts in (and is re-based to after a join-time Trust change): <10 breaking, <25 wavering, else steady. */
export const initialLoyaltyBand = (trust: number): LoyaltyBand => (trust < 10 ? 'breaking' : trust < 25 ? 'wavering' : 'steady');
