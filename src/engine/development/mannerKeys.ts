/**
 * The keys of her manner as development axes (P15b, spec §7): `manner:<axis>` (a step of one of the six), `manner:drawn_by` (what draws her moves) and
 * `manner:turn` (her style turns). The accumulators are `manner:<axis>` and `manner:drawn_by.<kind>`. A leaf: it imports only the vocabularies, so
 * the axes and the review can both read it.
 */
import { DRAWN_BY, MANNER_AXES, type DrawnBy, type MannerAxis } from '../dynamic/types';
import type { Unit } from '../state/types';

export type MannerKey = { kind: 'axis'; axis: MannerAxis } | { kind: 'drawn_by'; drawn?: DrawnBy } | { kind: 'turn' };

/** What a `manner:` key names, or null for anything else (a bad name, a kind of `drawn_by` that is not one of the five). */
export function mannerKey(key: string): MannerKey | null {
  if (!key.startsWith('manner:')) return null;
  const name = key.slice('manner:'.length);
  if ((MANNER_AXES as readonly string[]).includes(name)) return { kind: 'axis', axis: name as MannerAxis };
  if (name === 'turn') return { kind: 'turn' };
  if (name === 'drawn_by') return { kind: 'drawn_by' };
  if (name.startsWith('drawn_by.')) {
    const drawn = name.slice('drawn_by.'.length);
    return (DRAWN_BY as readonly string[]).includes(drawn) ? { kind: 'drawn_by', drawn: drawn as DrawnBy } : null;
  }
  return null;
}

/** The registry id that words a manner key: `manner:drawn_by.<kind>` is worded by `manner:drawn_by`. */
export const mannerEntryId = (key: string): string | null => {
  const k = mannerKey(key);
  return k === null ? null : k.kind === 'drawn_by' ? 'manner:drawn_by' : key;
};

const clamp2 = (v: number): number => Math.max(-2, Math.min(2, v));

/**
 * Her axes as she has become them (the stored axes and the drift overlay, each clamped to ±2) WITHOUT the mood of the day, or null without a manner. The
 * drift, the turn and "since joining" read this one: a bad day is no change in who she is.
 */
export function driftedAxes(unit: Pick<Unit, 'bond' | 'development'>): Record<MannerAxis, number> | null {
  const stored = unit.bond?.practice?.manner; // P14b: raw profile
  if (stored === undefined) return null;
  const drift = unit.development?.practice?.manner;
  const out = {} as Record<MannerAxis, number>;
  for (const a of MANNER_AXES) out[a] = clamp2((stored[a] ?? 0) + (drift?.[a] ?? 0));
  return out;
}

/** What draws her as she has become (the overlay when it moved, else the import). */
export const driftedDrawnBy = (unit: Pick<Unit, 'bond' | 'development'>): DrawnBy[] => [...(unit.development?.practice?.drawnBy ?? unit.bond?.practice?.drawnBy ?? [])]; // P14b: raw profile
