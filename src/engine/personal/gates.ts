import type { Registries } from '../../content/types';
import { bondOf, bondTierOf, leadRank } from '../bonds/profile';
import { impunityOf } from '../discipline/impunity';
import { isLiving } from '../economy';
import { stateForProposal } from '../relations/graph';
import { intimacyOf } from '../relations/gain';
import { ROMANTIC_PROPOSALS } from '../relations/vocab';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';

export type PressureMechanic = 'device' | 'booking' | 'intercept' | 'courtship' | 'claim' | 'token' | 'wager';

/** Device access 0–4 of a unit: Task 2 replaces this stand-in with the table in `deviceAccessRules`. */
function accessLevel(_state: CampaignState, _reg: Registries, _unitId: string): number {
  return 0;
}

/**
 * Why a unit may NOT take part in a personal mechanic, or `null` when she may (P9c bond gate). Every mechanic needs a named,
 * living unit with an imported bond profile (`unit.bond !== undefined`; the modest default never qualifies); each then has its
 * own test. Reads tiers by `bondTierOf` and lead by `leadRank`, never by id.
 */
export function pressureGate(state: CampaignState, reg: Registries, unitId: string, mechanic: PressureMechanic): string | null {
  const unit = state.squad.find((u) => u.id === unitId);
  const rel = state.relations[unitId];
  if (!unit || unit.kind !== 'named' || !isLiving(unit) || !rel) return 'not a named unit in service';
  if (unit.bond === undefined) return 'no imported bond profile';
  const bond = bondOf(unit)!;
  const lead = leadRank(bond.leadStyle);
  const G = TUNING.personal.gates;
  const tier = bondTierOf(state, reg, unitId);
  switch (mechanic) {
    case 'device':
      return lead >= G.device.minLeadRank ? null : 'her lead style is too yielding';
    case 'booking':
      return accessLevel(state, reg, unitId) >= 3 ? null : 'no device access';
    case 'intercept': {
      if (accessLevel(state, reg, unitId) < 4) return 'no device access';
      return null;
    }
    case 'courtship': {
      if (lead < G.courtship.minLeadRank) return 'her lead style is too yielding';
      if (!intimacyOf(state).romance) return 'romance is off';
      if (tier === 'romantic') return null;
      const open = ROMANTIC_PROPOSALS.some((kind) => 'stateId' in stateForProposal(state, reg, unitId, kind));
      return open ? null : 'no romantic step open to her';
    }
    case 'claim': {
      const court = pressureGate(state, reg, unitId, 'courtship');
      if (court !== null) return court;
      if (tier !== 'romantic') return 'not in a romantic tier';
      return rel.affair === undefined ? null : 'the relationship is concealed';
    }
    case 'token':
      if (tier === null) return 'no close or romantic tier';
      if (bond.attachment === 'avoidant') return 'avoidant attachment';
      return rel.affinity >= G.token.minAffinity ? null : 'Affinity too low';
    case 'wager': {
      if (lead < G.wager.minLeadRank) return 'her lead style is too yielding';
      if (rel.affinity >= G.wager.minAffinity) return null;
      return (impunityOf(state, reg, unitId)?.value ?? 0) >= G.wager.minImpunity ? null : 'neither warm nor brazen enough';
    }
  }
}

/** The product of the `pressureMult` of her defects (1 when none carries it, or for an unknown unit). */
export function pressureMultOf(state: CampaignState, reg: Registries, unitId: string): number {
  const unit = state.squad.find((u) => u.id === unitId);
  if (!unit) return 1;
  let mult = 1;
  for (const d of unit.defects) {
    const m = (reg.defects.get(d.id) as { pressureMult?: number } | undefined)?.pressureMult;
    if (typeof m === 'number') mult *= m;
  }
  return mult;
}
