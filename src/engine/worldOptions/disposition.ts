import type { Entry, Registries } from '../../content/types';
import type { CampaignState, Relation, Unit } from '../state/types';
import { worldEffects } from './options';

/**
 * The disposition of the squad (P8 §3): a set of engine parameters read from the `dispositionLevels` registry. The
 * world sets one level; each named unit may sit up to two ranks away from it; grunts use the world level.
 */

type StateLike = Pick<CampaignState, 'world'>;
export type DispositionLevel = Entry & {
  rank: number;
  start: { trust: number; affinity: number };
  gainMult: number; lossMult: number;
  minConfidence: { gain: number; loss: number };
  bandShift: number; bandExitExtra: number; stageDaysMult: number;
  refusalMult: number; desertionMult: number;
  mutiny: { enabled: boolean; states: string[]; minDaysInState: number; minSigns: number };
  breakdownTarget: 'self' | 'default' | 'allies' | 'allies_commander' | 'everyone';
  bigGestureMult: number;
};

const DEFAULT_RANK = 2; // the neutral level of the spec table
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function levelByRank(reg: Registries, rank: number): DispositionLevel {
  const levels = [...reg.dispositionLevels.values()] as DispositionLevel[];
  const found = levels.find((l) => l.rank === rank) ?? levels.find((l) => l.rank === DEFAULT_RANK) ?? levels[0];
  if (!found) throw new Error('The content has no disposition levels.');
  return found;
}

/** The level the world sets: the `disposition` effect of the current choices (the neutral level when none is stored). */
export function worldDispositionLevel(state: StateLike, reg: Registries): DispositionLevel {
  const id = worldEffects(state, reg, 'disposition')[0]?.levelId;
  const level = id === undefined ? undefined : (reg.dispositionLevels.get(id) as DispositionLevel | undefined);
  return level ?? levelByRank(reg, DEFAULT_RANK);
}

/** A unit's effective level: the world rank plus her offset (−2…2), clamped to 1…5. A grunt, or anything not named, uses the world level. */
export function dispositionFor(state: StateLike, reg: Registries, unit: Partial<Pick<Unit, 'kind' | 'dispositionOffset'>>): DispositionLevel {
  const world = worldDispositionLevel(state, reg);
  if (unit.kind !== 'named') return world;
  const offset = clamp(Math.trunc(unit.dispositionOffset ?? 0), -2, 2);
  if (offset === 0) return world;
  return levelByRank(reg, clamp(world.rank + offset, 1, 5));
}

/** The effective level of a unit by id (the world level for an unknown id). */
export function dispositionById(state: Pick<CampaignState, 'world' | 'squad'>, reg: Registries, unitId: string): DispositionLevel {
  const unit = state.squad.find((u) => u.id === unitId);
  return unit ? dispositionFor(state, reg, unit) : worldDispositionLevel(state, reg);
}

/** The loyalty band thresholds move: entering a worse band by `bandShift`, leaving it by the shift plus the exit extra (hysteresis). */
export function bandShift(level: Pick<DispositionLevel, 'bandShift' | 'bandExitExtra'>): { enter: number; exit: number } {
  return { enter: level.bandShift, exit: level.bandShift + level.bandExitExtra };
}

/**
 * At a join site: adds the level's start offsets to a fresh relation (clamped). Call it right before
 * `applyFirstImpression`, which re-bases the loyalty band with the unit's shift.
 */
export function applyDispositionStart(
  state: StateLike, reg: Registries, unit: Partial<Pick<Unit, 'kind' | 'dispositionOffset'>>, rel: Relation,
): void {
  const level = dispositionFor(state, reg, unit);
  rel.trust = clamp(rel.trust + level.start.trust, 0, 100);
  rel.affinity = clamp(rel.affinity + level.start.affinity, -100, 100);
}
