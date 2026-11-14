import type { Registries } from '../../src/content/types';
import { impunityOf } from '../../src/engine/discipline/impunity';
import type { CampaignState } from '../../src/engine/state/types';
import { setRelation } from './loyalty';

export type StanceName = 'disciplined' | 'defiant_loyal' | 'fearful' | 'open_defiance';

export * from './loyalty';

/** The registries with the commander's presence switched off, so a fresh unit reads `base + L` and nothing else. */
export const noPresence = (reg: Registries): Registries => ({ ...reg, presence: new Map() });

/** Sets the stored term `R` of one unit (in place; returns the state). */
export function setRecord(state: CampaignState, unitId: string, n: number): CampaignState {
  const r = state.relations[unitId];
  if (!r) throw new Error(`no relation for ${unitId}`);
  if (n === 0) delete r.impunityRecord;
  else r.impunityRecord = n;
  return state;
}

/**
 * Puts a unit in one of the four stances: Trust 60 (high) or 20 (low), and the record that lands her Impunity at 70 or 20.
 * Moving her record also moves the contagion term of the others.
 */
export function withStance(state: CampaignState, reg: Registries, unitId: string, stance: StanceName): CampaignState {
  const highTrust = stance === 'disciplined' || stance === 'defiant_loyal';
  const highImpunity = stance === 'defiant_loyal' || stance === 'open_defiance';
  setRelation(state, unitId, { trust: highTrust ? 60 : 20 });
  setRecord(state, unitId, 0);
  const at0 = impunityOf(state, reg, unitId);
  if (!at0) throw new Error(`${unitId} has no Impunity`);
  const want = highImpunity ? 70 : 20;
  setRecord(state, unitId, Math.max(-40, Math.min(40, want - at0.value)));
  const now = impunityOf(state, reg, unitId)!.value;
  if (highImpunity !== now >= 50) throw new Error(`could not reach ${stance} for ${unitId} (Impunity ${now})`);
  return state;
}
