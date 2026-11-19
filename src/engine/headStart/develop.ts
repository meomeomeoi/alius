import type { Registries } from '../../content/types';
import { revealCrime, reactsToCrime } from '../memory/crime';
import type { CampaignState, Relation, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { headStartHash, headStartRaw } from './hash';

type Days = 7 | 14 | 30;
export type AxisDelta = { trust: number; affinity: number; attraction: number };
export type Impression = 'positive' | 'negative' | 'neutral';

const AXES = ['trust', 'affinity', 'attraction'] as const;
const RANGE: Record<(typeof AXES)[number], readonly [number, number]> = { trust: [0, 100], affinity: [-100, 100], attraction: [0, 100] };

/** The sign of what the first impression did to Trust and Affinity (Attraction does not count). */
export function impressionOf(d: AxisDelta): Impression {
  const sum = d.trust + d.affinity;
  return sum > 0 ? 'positive' : sum < 0 ? 'negative' : 'neutral';
}

/**
 * Development (§3 step 1): for each axis the first impression changed, `axis += round(Δ × k(N)) + spread`, `spread` an integer in
 * −3…3 from the hash. Written directly (as `applyFirstImpression` does: no gain handler, no daily accounting) and clamped.
 */
export function developRelation(rel: Relation, d: AxisDelta, days: Days, seed: number, unitId: string): void {
  const k = TUNING.headStart.k[days];
  const spreadMax = TUNING.headStart.spread;
  for (const axis of AXES) {
    if (d[axis] === 0) continue;
    const spread = (headStartRaw(seed, unitId, `spread:${axis}`) % (2 * spreadMax + 1)) - spreadMax;
    const [lo, hi] = RANGE[axis];
    rel[axis] = Math.min(hi, Math.max(lo, rel[axis] + Math.round(d[axis] * k) + spread));
  }
}

/** The chance she learned the crime during the skipped days: by days, ×1.5 when a value of hers reacts to it, capped (no "curious" factor). */
export function crimeChance(state: CampaignState, reg: Registries, unit: Unit, days: Days): number {
  const crime = state.commander.crimeId ? reg.crimes.get(state.commander.crimeId) : undefined;
  const chance = TUNING.headStart.crime[days] * (reactsToCrime(unit, crime) ? TUNING.headStart.crimeReactMult : 1);
  return Math.min(TUNING.headStart.crimeCap, chance);
}

/** Step 2: rolls by hash; a hit runs `revealCrime` (the flag and her reaction). Returns whether she learned it now. */
export function rollCrime(draft: CampaignState, reg: Registries, unit: Unit, days: Days, seed: number): boolean {
  if (draft.relations[unit.id]?.flags.includes('knows_crime')) return false;
  if (headStartHash(seed, unit.id, 'crime') >= crimeChance(draft, reg, unit, days)) return false;
  revealCrime(draft, reg, [unit.id]);
  return true;
}
