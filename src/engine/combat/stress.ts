import { TUNING } from '../tuning';
import { fireTrigger, activePassives, type EffectCtx } from './effects';
import { byCid } from './targeting';

export type StressBand = 'calm' | 'strained' | 'breaking' | 'breakdown';

export function stressBand(stress: number): StressBand {
  return stress >= 100 ? 'breakdown' : stress >= 80 ? 'breaking' : stress >= 50 ? 'strained' : 'calm';
}

export type StressSource = 'enemy' | 'self' | 'ally' | 'order' | 'system';

/**
 * Changes a squad unit's stress. `stress_taken` passives scale gains (direction `gain`) and relief (`relief`); the
 * value is clamped to 0–100 and locked at 100 while the unit is broken down. Upward crossings of 50, 80 and 100 fire
 * `onStressThreshold`. Returns the applied change.
 */
export function addStress(ctx: EffectCtx, cid: string, amount: number, _source: StressSource): number {
  const c = byCid(ctx.cs, cid);
  if (c.side !== 'squad' || c.downed || amount === 0) return 0;
  if (c.breakdown && amount < 0) return 0; // locked at 100 until released
  let delta = amount;
  for (const e of activePassives(ctx, cid, 'stress_taken')) {
    if ((delta > 0 && e.direction === 'gain') || (delta < 0 && e.direction === 'relief')) delta *= Math.max(0, 1 + e.pct / 100);
  }
  delta = Math.round(delta);
  const before = c.stress;
  c.stress = Math.min(100, Math.max(0, before + delta));
  const applied = c.stress - before;
  if (applied !== 0) ctx.log({ kind: 'stress', target: cid, amount: applied });
  for (const t of [50, 80, 100] as const) {
    if (before < t && c.stress >= t) fireTrigger(ctx, 'onStressThreshold', { actorCid: cid, threshold: t });
  }
  if (c.stress >= 100 && !c.breakdown) enterBreakdown(ctx, cid);
  return applied;
}

/** Task 8 fills this in (defect lookup, onEnter, cut-in). */
export function enterBreakdown(_ctx: EffectCtx, _cid: string): void {
  void TUNING;
}
