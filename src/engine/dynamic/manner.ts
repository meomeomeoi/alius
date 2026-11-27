/**
 * P15b: her manner over the style. `mannerOf` is the one reader (her axes with what she has become and the mood of the day folded in, what
 * draws her); `bend` moves a style's number by a step of an axis, and `bendBy` is `bend` with her own step. The gate of the whole package:
 * without `bond.practice.manner` (an old save, a profile from before P15b) `mannerOf` is null and every bend returns its base. At a step of
 * 0 every bend returns its base exactly. Draws nothing.
 */
import type { Registries } from '../../content/types';
import type { CampaignState, Unit } from '../state/types';
import { MANNER_AXES, type DrawnBy, type MannerAxis } from './types';

export { CONTRASTS, DRAWN_BY, MANNER_AXES, QUIRK_WHEN } from './types';
export type { Contrast, DrawnBy, MannerAxis, Quirk, QuirkWhen } from './types';

export interface Manner {
  /** Her axes as they read today: stored + drift + mood, each clamped to −2 … +2. */
  axes: Record<MannerAxis, number>;
  drawnBy: DrawnBy[];
  /** The mood of the day per axis (P15b Task 10; `{}` until then). Hidden: never shown as a number. */
  mood: Partial<Record<MannerAxis, number>>;
}

/** A unit that left the squad (the same four as `isLiving`). */
const gone = (u: Pick<Unit, 'status'>): boolean => u.status === 'dead' || u.status === 'deserted' || u.status === 'terminated' || u.status === 'reassigned';

const clamp2 = (v: number): number => Math.max(-2, Math.min(2, v));

/**
 * Her manner, or `null` when she has no `manner` block (or is a grunt, or gone, or has no practice). The drift overlay
 * (`development.practice.manner`, steps added to the stored axes) is folded in, then the mood of the day; every axis is clamped to ±2.
 */
export function mannerOf(state: Pick<CampaignState, 'squad'>, reg: Registries, unitId: string): Manner | null {
  void reg; // the mood of the day (Task 10) reads the registries
  const unit = state.squad.find((u) => u.id === unitId);
  if (unit === undefined || unit.kind !== 'named' || gone(unit)) return null;
  const stored = unit.bond?.practice?.manner;
  if (stored === undefined) return null;
  const drift = unit.development?.practice?.manner;
  const mood: Partial<Record<MannerAxis, number>> = {};
  const axes = {} as Record<MannerAxis, number>;
  for (const a of MANNER_AXES) axes[a] = clamp2((stored[a] ?? 0) + (drift?.[a] ?? 0) + (mood[a] ?? 0));
  return { axes, drawnBy: [...(unit.bond?.practice?.drawnBy ?? [])], mood };
}

/**
 * How a number bends: `scale` multiplies by `1 + step × k` (never below 0), then caps the result at `cap`; `shift` adds `step × k`; `gate` is
 * 1 when the step reaches the threshold (`step >= gate` for a positive one, `step <= gate` for a negative one) and 0 otherwise.
 */
export type BendKind = { scale: number; cap?: number } | { shift: number } | { gate: number };

/** A style's number moved by one axis step. `step === 0` returns `base` exactly (a gate: 0). */
export function bend(base: number, step: number, kind: BendKind): number {
  if ('gate' in kind) {
    if (step === 0 || kind.gate === 0) return 0;
    return kind.gate > 0 ? (step >= kind.gate ? 1 : 0) : (step <= kind.gate ? 1 : 0);
  }
  if (step === 0) return base;
  if ('shift' in kind) return base + step * kind.shift;
  const out = base * Math.max(0, 1 + step * kind.scale);
  return kind.cap === undefined ? out : Math.min(kind.cap, out);
}

/** `bend` with her step on `axis`; without a manner it is `bend` at a step of 0 (`base`; a gate: 0). */
export function bendBy(state: Pick<CampaignState, 'squad'>, reg: Registries, unitId: string, axis: MannerAxis, base: number, kind: BendKind): number {
  const m = mannerOf(state, reg, unitId);
  return bend(base, m === null ? 0 : m.axes[axis], kind);
}
