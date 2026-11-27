/**
 * P15b: her manner over the style. `mannerOf` is the one reader (her axes with what she has become and the mood of the day folded in, what
 * draws her); `bend` moves a style's number by a step of an axis, and `bendBy` is `bend` with her own step. The gate of the whole package:
 * without `bond.practice.manner` (an old save, a profile from before P15b) `mannerOf` is null and every bend returns its base. At a step of
 * 0 every bend returns its base exactly. Draws nothing.
 */
import type { Registries } from '../../content/types';
import type { CampaignState, Unit } from '../state/types';
import { bend, type BendKind } from '../bend';
import { temperamentOf } from '../life/state';
import type { LifeEventEntry } from '../life/types';
import { TUNING } from '../tuning';
import { driftedDrawnBy } from '../development/mannerKeys';
import { dynamicRoll } from './witness';
import { MANNER_AXES, type DrawnBy, type MannerAxis } from './types';

export { CONTRASTS, DRAWN_BY, MANNER_AXES, QUIRK_WHEN } from './types';
export type { Contrast, DrawnBy, MannerAxis, Quirk, QuirkWhen } from './types';

export interface Manner {
  /** Her axes as they read today: stored + drift + mood, each clamped to −2 … +2. */
  axes: Record<MannerAxis, number>;
  drawnBy: DrawnBy[];
  /** The mood of the day per axis (`mannerMoodOf`). Hidden: never shown as a number. */
  mood: Partial<Record<MannerAxis, number>>;
}

/** A unit that left the squad (the same four as `isLiving`). */
const gone = (u: Pick<Unit, 'status'>): boolean => u.status === 'dead' || u.status === 'deserted' || u.status === 'terminated' || u.status === 'reassigned';

const clamp2 = (v: number): number => Math.max(-2, Math.min(2, v));

/** What `mannerOf` reads besides her squad row: `life` (her events of the day), `lastExpedition` (a failed run), `day` and `dynamic` (the salt of a moody day). Without `day` the mood is empty. */
export type MannerState = Pick<CampaignState, 'squad'> & Partial<Pick<CampaignState, 'life' | 'lastExpedition' | 'day' | 'dynamic'>>;

/**
 * The mood of her day (spec §4), per axis, for a holder with a `manner` block (otherwise `{}`): a `moody` woman's hashed −1 / 0 / +1 on `intensity`, `warmth` and
 * `tempo` (`dynamicRoll`, a stable value per axis and day); the `mood` of each life event she had that day (`life.units[id].last[eventId] === day`); and a failed
 * run that day. Several add up; the clamp to ±2 is `mannerOf`'s. Hidden: never shown as a value. Draws nothing.
 */
export function mannerMoodOf(state: MannerState, reg: Registries, unitId: string, day: number): Partial<Record<MannerAxis, number>> {
  const unit = state.squad.find((u) => u.id === unitId);
  if (unit === undefined || unit.kind !== 'named' || gone(unit) || unit.bond?.practice?.manner === undefined) return {};
  const out: Partial<Record<MannerAxis, number>> = {};
  const add = (axis: MannerAxis, by: number): void => { if (by !== 0) out[axis] = (out[axis] ?? 0) + by; };
  const table = TUNING.manner.mood;
  if (temperamentOf(state, unitId).volatility === 'moody') {
    const at = { dynamic: state.dynamic, day };
    for (const a of table.moody) add(a, Math.min(2, Math.floor(dynamicRoll(at, unitId, `mood:${a}:${day}`) * 3)) - 1);
  }
  const last = state.life?.units[unitId]?.last ?? {};
  for (const id of Object.keys(last)) {
    if (last[id] !== day) continue;
    const mood = (reg.lifeEvents.get(id) as unknown as LifeEventEntry | undefined)?.mood;
    if (mood === undefined) continue;
    for (const a of MANNER_AXES) add(a, (table.events[mood] as Partial<Record<MannerAxis, number>>)[a] ?? 0);
  }
  if (state.lastExpedition?.outcome === 'failed' && state.lastExpedition.day === day) for (const a of MANNER_AXES) add(a, (table.failedRun as Partial<Record<MannerAxis, number>>)[a] ?? 0);
  for (const a of MANNER_AXES) if (out[a] === 0) delete out[a];
  return out;
}

/**
 * Her manner, or `null` when she has no `manner` block (or is a grunt, or gone, or has no practice). The drift overlay
 * (`development.practice.manner`, steps added to the stored axes) is folded in, then the mood of the day; every axis is clamped to ±2.
 */
export function mannerOf(state: MannerState, reg: Registries, unitId: string): Manner | null {
  const unit = state.squad.find((u) => u.id === unitId);
  if (unit === undefined || unit.kind !== 'named' || gone(unit)) return null;
  const stored = unit.bond?.practice?.manner;
  if (stored === undefined) return null;
  const drift = unit.development?.practice?.manner;
  const mood = state.day === undefined ? {} : mannerMoodOf(state, reg, unitId, state.day);
  const axes = {} as Record<MannerAxis, number>;
  for (const a of MANNER_AXES) axes[a] = clamp2((stored[a] ?? 0) + (drift?.[a] ?? 0) + (mood[a] ?? 0));
  return { axes, drawnBy: driftedDrawnBy(unit), mood };
}

export { bend };
export type { BendKind };

/** `bend` with her step on `axis`; without a manner it is `bend` at a step of 0 (`base`; a gate: 0). */
export function bendBy(state: MannerState, reg: Registries, unitId: string, axis: MannerAxis, base: number, kind: BendKind): number {
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
