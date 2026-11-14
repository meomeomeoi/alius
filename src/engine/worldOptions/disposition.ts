import type { Entry, Registries } from '../../content/types';
import type { CampaignState, Relation, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { normDistance } from './norm';
import { worldEffects } from './options';
import { stanceEffects } from './stances';

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
 * At a join site: adds the level's start offsets and her stances' start offsets to a fresh relation (clamped). A stance's
 * `start_offset` with `perNormStep` counts the commander's distance from the world's norm; `distance_bonus` needs a
 * minimum distance. Call it right before `applyFirstImpression`, which re-bases the loyalty band with her shift.
 */
export function applyDispositionStart(
  state: CampaignState, reg: Registries, unit: Partial<Pick<Unit, 'kind' | 'dispositionOffset' | 'worldStances'>>, rel: Relation,
): void {
  const level = dispositionFor(state, reg, unit);
  const distance = normDistance(state, reg) ?? 0;
  let trust = level.start.trust;
  let affinity = level.start.affinity;
  for (const fx of stanceEffects(state, reg, unit, 'start_offset')) {
    const steps = fx.perNormStep === true ? distance : 1;
    trust += (fx.trust ?? 0) * steps;
    affinity += (fx.affinity ?? 0) * steps;
  }
  for (const fx of stanceEffects(state, reg, unit, 'distance_bonus')) {
    if (distance >= fx.minSteps) affinity += fx.affinity;
  }
  rel.trust = clamp(rel.trust + trust, 0, 100);
  rel.affinity = clamp(rel.affinity + affinity, -100, 100);
}

/**
 * The campaign's mirror of the setting `intentMinConfidence` against its default: how far the player moved the table of
 * confidence floors (a missing setting reads the default, shift 0).
 */
export function confidenceShift(state: Pick<CampaignState, 'settings'>): number {
  const v = state.settings.intentMinConfidence;
  const setting = typeof v === 'number' && Number.isFinite(v) ? clamp(v, 0, 1) : TUNING.disposition.confidenceRef;
  return setting - TUNING.disposition.confidenceRef;
}

/** A level's confidence floors for gains and losses, moved by the setting's shift and capped at 1 (an engine-made event, confidence 1, always passes). */
export function dispositionThresholds(level: Pick<DispositionLevel, 'minConfidence'>, shift: number): { gain: number; loss: number } {
  return { gain: Math.min(1, level.minConfidence.gain + shift), loss: Math.min(1, level.minConfidence.loss + shift) };
}

/**
 * The floor the extraction sanitizer applies: the lowest floor of any level, moved by the setting. It never drops an event
 * that some level would read; the engine then judges each axis for each unit (`computeDeltas`).
 */
export function confidenceFloor(reg: Registries, setting: number): number {
  const levels = [...reg.dispositionLevels.values()] as DispositionLevel[];
  const lowest = levels.length === 0 ? TUNING.disposition.confidenceRef : Math.min(...levels.map((l) => Math.min(l.minConfidence.gain, l.minConfidence.loss)));
  return clamp(lowest + (clamp(setting, 0, 1) - TUNING.disposition.confidenceRef), 0, 1);
}

/** Her disposition scales a refusal chance (capped at 0.95); a multiplier of 1 changes nothing. */
export function scaleRefusal(state: Pick<CampaignState, 'world' | 'squad'>, reg: Registries, unitId: string, chance: number): number {
  const mult = dispositionById(state, reg, unitId).refusalMult;
  return mult === 1 ? chance : Math.min(TUNING.disposition.refusalCap, chance * mult);
}
