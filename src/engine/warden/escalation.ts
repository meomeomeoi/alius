import type { EngineCtx, EngineEvent } from '../dispatch';
import { commanderDies } from './death';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { wardenOf } from './state';

/**
 * Lethal escalation (P13 §3): sustained open defiance. Crossing 50 earns a warning, 75 a final one, 100 the controller, and never
 * without two warnings on two different days: both the warning at 75 and the end at 100 need the previous warning to be from an earlier
 * day, and defiance is held just under the line (74, 99) until then. Nothing here draws; the escalation runs after every defiance rise.
 */

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Adds (or, negative, takes off) defiance, clamped to 0–100, and checks the escalation after a rise. Nothing without a warden in service. */
export function addDefiance(draft: CampaignState, ctx: EngineCtx, amount: number): EngineEvent[] {
  const w = wardenOf(draft);
  if (!w) return [];
  w.defiance = clamp(w.defiance + amount, 0, 100);
  return amount > 0 ? checkEscalation(draft, ctx) : [];
}

/** The warnings and the end, from the defiance as it stands. Idempotent: a warning is issued once, the holds are re-applied. */
export function checkEscalation(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const w = wardenOf(draft);
  if (!w) return [];
  const E = TUNING.warden.escalation;
  const events: EngineEvent[] = [];
  const warn = (level: 1 | 2): void => {
    w.warnings.push({ level, day: draft.day });
    events.push({ type: 'warden_warning', level });
  };
  if (w.defiance >= E.warning1 && w.warnings.length === 0) warn(1);
  if (w.defiance >= E.warning2) {
    if (w.warnings.length === 1 && w.warnings[0].day < draft.day) warn(2);
    else if (w.warnings.length < 2) w.defiance = E.warning2 - 1; // the same day as the first warning: held just under the line
  }
  if (w.defiance >= E.terminate) {
    const second = w.warnings[1];
    if (w.warnings.length >= 2 && second.day < draft.day) {
      events.push({ type: 'commander_terminated' }, ...commanderDies(draft, ctx, 'terminated'));
    } else w.defiance = E.terminate - 1;
  }
  return events;
}
