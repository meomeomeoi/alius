import type { Registries } from '../../content/types';
import type { DeviceAccessBranch } from '../../content/schemas';
import { bondOf, bondTierOf, leadRank } from '../bonds/profile';
import { impunityOf } from '../discipline/impunity';
import { isLiving } from '../economy';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';

/** What a unit can do inside the commander's device (P9c §1); each is first allowed at the level that follows it in `CAPABILITIES`. */
export const CAPABILITIES = ['decor', 'notes', 'calendar', 'messages'] as const;
export type Capability = (typeof CAPABILITIES)[number];
export type AccessLevel = 0 | 1 | 2 | 3 | 4;

/**
 * Why a unit has no device access at all, or `null`: a named unit in service with an imported bond profile and a lead
 * style the `device` gate allows. (`pressureGate(…, 'device')` returns this; it lives here so the two files do not import
 * each other.)
 */
export function deviceGateReason(state: CampaignState, unitId: string): string | null {
  const unit = state.squad.find((u) => u.id === unitId);
  if (!unit || unit.kind !== 'named' || !isLiving(unit) || !state.relations[unitId]) return 'not a named unit in service';
  if (unit.bond === undefined) return 'no imported bond profile';
  return leadRank(bondOf(unit)!.leadStyle) >= TUNING.personal.gates.device.minLeadRank ? null : 'her lead style is too yielding';
}

/** Does one branch of a rule hold for her now? Every field that is present must (tiers by `bondTier`, states as data). */
function branchHolds(state: CampaignState, reg: Registries, unitId: string, b: DeviceAccessBranch, impunity: () => number): boolean {
  const unit = state.squad.find((u) => u.id === unitId)!;
  const rel = state.relations[unitId];
  if (b.tiers !== undefined) {
    const tier = bondTierOf(state, reg, unitId);
    if (tier === null || !b.tiers.includes(tier)) return false;
  }
  if (b.states !== undefined && !b.states.includes(rel.stateId)) return false;
  if (b.minLeadRank !== undefined && leadRank(bondOf(unit)!.leadStyle) < b.minLeadRank) return false;
  if (b.minAffinity !== undefined && rel.affinity < b.minAffinity) return false;
  if (b.minImpunity !== undefined && impunity() < b.minImpunity) return false;
  return true;
}

/**
 * Her device access 0–4, derived and never stored: the highest level of `deviceAccessRules` with a branch that holds, or 0
 * when the `device` gate fails. A level only grants its own capability and those below it (`accessCan`).
 */
export function deviceAccess(state: CampaignState, reg: Registries, unitId: string): AccessLevel {
  if (deviceGateReason(state, unitId) !== null) return 0;
  let cached: number | undefined;
  const impunity = (): number => (cached ??= impunityOf(state, reg, unitId)?.value ?? 0);
  const rules = [...reg.deviceAccessRules.values()].sort((a, b) => Number(b.level) - Number(a.level));
  for (const rule of rules) {
    if ((rule.anyOf as DeviceAccessBranch[]).some((b) => branchHolds(state, reg, unitId, b, impunity))) return Number(rule.level) as AccessLevel;
  }
  return 0;
}

/** May she do this inside the device? A capability needs its own level or a higher one, never a lower one. */
export const accessCan = (state: CampaignState, reg: Registries, unitId: string, capability: Capability): boolean =>
  deviceAccess(state, reg, unitId) >= CAPABILITIES.indexOf(capability) + 1;

/**
 * Why she has the access she has: the level and the branch of its rule that holds (the first one, in the rule's order), or
 * `null` at level 0. The panel words the branch; nothing here is stored.
 */
export function deviceAccessWhy(state: CampaignState, reg: Registries, unitId: string): { level: AccessLevel; branch: DeviceAccessBranch } | null {
  if (deviceGateReason(state, unitId) !== null) return null;
  let cached: number | undefined;
  const impunity = (): number => (cached ??= impunityOf(state, reg, unitId)?.value ?? 0);
  const rules = [...reg.deviceAccessRules.values()].sort((a, b) => Number(b.level) - Number(a.level));
  for (const rule of rules) {
    const branch = (rule.anyOf as DeviceAccessBranch[]).find((b) => branchHolds(state, reg, unitId, b, impunity));
    if (branch) return { level: Number(rule.level) as AccessLevel, branch };
  }
  return null;
}
