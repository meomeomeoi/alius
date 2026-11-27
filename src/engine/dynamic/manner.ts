/**
 * P15b: her manner over the style. `mannerOf` is the one reader (her axes with what she has become and the mood of the day folded in, what
 * draws her); `bend` moves a style's number by a step of an axis, and `bendBy` is `bend` with her own step. The gate of the whole package:
 * without `bond.practice.manner` (an old save, a profile from before P15b) `mannerOf` is null and every bend returns its base. At a step of
 * 0 every bend returns its base exactly. Draws nothing.
 */
import type { Registries } from '../../content/types';
import type { CampaignState, Unit } from '../state/types';
import { bend, type BendKind } from '../bend';
import { TUNING } from '../tuning';
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

export { bend };
export type { BendKind };

/** `bend` with her step on `axis`; without a manner it is `bend` at a step of 0 (`base`; a gate: 0). */
export function bendBy(state: Pick<CampaignState, 'squad'>, reg: Registries, unitId: string, axis: MannerAxis, base: number, kind: BendKind): number {
  const m = mannerOf(state, reg, unitId);
  return bend(base, m === null ? 0 : m.axes[axis], kind);
}

/** The words of a step of an axis (spec §1); `''` at 0 (an axis at its style says nothing). */
export function mannerWord(axis: MannerAxis, step: number): string {
  const steps = TUNING.manner.words[axis].steps as Readonly<Record<string, string>>;
  return steps[String(Math.max(-2, Math.min(2, Math.trunc(step))))] ?? '';
}

/** The short word of a step: its words up to the first comma or colon (`''` at 0). */
export function mannerShortWord(axis: MannerAxis, step: number): string {
  return mannerWord(axis, step).split(/[,:]/)[0].trim();
}

/** What draws her, in words (spec §2). */
export function drawnByWord(kind: DrawnBy): string {
  return TUNING.manner.drawnByWords[kind];
}

/**
 * A style's place on the axes in words, for its registry reading: the end it leans to on each axis away from 0 ("rather" at ±1, the end
 * word itself beyond), in axis order. No number: the places are hidden coordinates.
 */
export function placeWords(place: Partial<Record<MannerAxis, number>> | undefined): string[] {
  if (place === undefined) return [];
  const out: string[] = [];
  for (const a of MANNER_AXES) {
    const v = place[a] ?? 0;
    if (v === 0) continue;
    const end = v > 0 ? TUNING.manner.words[a].high : TUNING.manner.words[a].low;
    out.push(Math.abs(v) === 1 ? `rather ${end}` : Math.abs(v) >= 3 ? `wholly ${end}` : end);
  }
  return out;
}
