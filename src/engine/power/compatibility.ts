import { valuesOf } from '../development/profile';
import { VALUE_AXES, type Unit } from '../state/types';

/**
 * How alike two units are in values, 0 (opposite extremes on every axis) to 1 (equal): `1 − Σ|a − b| / (6 × 6)`. A leaf of the power layer: the ballots
 * and the standing both read it, and neither imports the other (review M11). Pure.
 */
export function compatibility(a: Pick<Unit, 'values'>, b: Pick<Unit, 'values'>): number {
  const total = VALUE_AXES.reduce((sum, axis) => sum + Math.abs(valuesOf(a)[axis] - valuesOf(b)[axis]), 0);
  return 1 - total / (VALUE_AXES.length * 6);
}
