import type { Registries } from '../../content/types';
import type { NightSpec } from '../../content/schemas';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { queueNightSpec } from '../night';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { startSmother } from './smother';
import { effectiveWant, wantEligible } from './want';

/** The off-combat breakdown a Desire/Bond defect starts when Want reaches the top band. */
export interface WantBreakdownSpec { kind: 'withdrawal' | 'binge' | 'smother' | 'seize'; days: number }

export const wantBreakdownSpec = (reg: Registries, defectId: string): WantBreakdownSpec | null =>
  (reg.defects.get(defectId)?.wantBreakdown as WantBreakdownSpec | undefined) ?? null;

/**
 * Starts her off-combat breakdown for a defect: she is in `unit.breakdown` until `day + days` (the existing guards keep her
 * off expeditions), and the kind adds its own consequence: `withdrawal` queues her defect's night knock of that kind for
 * certain, `binge` costs 10 credits (never below 0), `smother` locks the hangar for a day (the Smother stand-in); `seize` only
 * refuses her scene orders (read in `loyalty/refusal`). Draws no rng.
 */
export function startWantBreakdown(draft: CampaignState, ctx: EngineCtx, unitId: string, defectId: string): EngineEvent[] {
  const reg = ctx.registries;
  const unit = draft.squad.find((u) => u.id === unitId);
  const spec = wantBreakdownSpec(reg, defectId);
  if (!unit || !spec || unit.breakdown || !unit.defects.some((d) => d.id === defectId)) return [];
  unit.breakdown = { defectId, day: draft.day, until: draft.day + spec.days };
  const events: EngineEvent[] = [{ type: 'want_breakdown', unitId, defectId, kind: spec.kind }];
  if (spec.kind === 'withdrawal') {
    const knock = ((reg.defects.get(defectId)?.nightEvents as NightSpec[] | undefined) ?? []).find((n) => n.kind === spec.kind);
    if (knock) events.push(...queueNightSpec(draft, unit, knock));
  } else if (spec.kind === 'smother') {
    events.push(...startSmother(draft, unitId));
  } else if (spec.kind === 'binge') {
    const cost = Math.min(draft.resources.credits, TUNING.bonds.want.breakdownMoneyCost);
    if (cost > 0) {
      draft.resources.credits -= cost;
      events.push({ type: 'resource_changed', resource: 'credits', amount: -cost });
    }
  }
  return events;
}

/** Ends every off-combat breakdown whose days are past (`day > until`). */
export function releaseWantBreakdowns(draft: CampaignState): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const u of draft.squad) {
    if (!u.breakdown || u.breakdown.until === undefined || draft.day <= u.breakdown.until) continue;
    delete u.breakdown;
    events.push({ type: 'breakdown_released', unitId: u.id });
  }
  return events;
}

/**
 * Units at the top band start the breakdown of their first Desire/Bond defect that has one, once per crossing
 * (`Relation.wantBreakDay`; it is cleared when Want falls below the band).
 */
export function startCrossedBreakdowns(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const unit of draft.squad) {
    const rel = draft.relations[unit.id];
    if (unit.kind !== 'named' || !rel || !isLiving(unit) || rel.wantBreakDay !== undefined) continue;
    if (!wantEligible(draft, ctx.registries, unit.id) || effectiveWant(draft, ctx.registries, unit.id) < TUNING.bonds.want.bands.desperate) continue;
    for (const d of unit.defects) {
      const started = startWantBreakdown(draft, ctx, unit.id, d.id);
      if (started.length > 0) {
        rel.wantBreakDay = draft.day;
        events.push(...started);
        break;
      }
    }
  }
  return events;
}
