import type { Registries } from '../../src/content/types';
import { commandStance } from '../../src/engine/discipline';
import { impunityOf } from '../../src/engine/discipline/impunity';
import type { CampaignState } from '../../src/engine/state/types';
import { setRelation } from './loyalty';

export type StanceName = 'disciplined' | 'defiant_loyal' | 'fearful' | 'open_defiance' | 'indifferent';

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

/** The Trust and Impunity each stance is put at. */
const TARGETS: Record<StanceName, { trust: number; impunity: number }> = {
  disciplined: { trust: 60, impunity: 20 },
  defiant_loyal: { trust: 60, impunity: 70 },
  fearful: { trust: 20, impunity: 20 },
  open_defiance: { trust: 20, impunity: 70 },
  indifferent: { trust: 35, impunity: 50 },
};

/**
 * Puts a unit in one of the five stances: the Trust and the record that land her Impunity where that stance lives.
 * Moving her record also moves the contagion term of the others.
 */
export function withStance(state: CampaignState, reg: Registries, unitId: string, stance: StanceName): CampaignState {
  const want = TARGETS[stance];
  setRelation(state, unitId, { trust: want.trust });
  setRecord(state, unitId, 0);
  const at0 = impunityOf(state, reg, unitId);
  if (!at0) throw new Error(`${unitId} has no Impunity`);
  setRecord(state, unitId, Math.max(-40, Math.min(40, want.impunity - at0.value)));
  const now = commandStance(state, reg, unitId);
  if (now !== stance) throw new Error(`could not reach ${stance} for ${unitId} (got ${String(now)}, Impunity ${impunityOf(state, reg, unitId)!.value})`);
  return state;
}
