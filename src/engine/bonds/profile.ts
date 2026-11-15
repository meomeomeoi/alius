import type { Registries } from '../../content/types';
import type { Bond, CampaignState, DesireLevel, LeadStyle, Unit } from '../state/types';

/** Ranked weakest first: `leadRank` makes "at least assertive" a rank test. */
export const LEAD_STYLES = ['yielding', 'balanced', 'assertive', 'dominant'] as const satisfies readonly LeadStyle[];
export const ATTACHMENTS = ['slow', 'steady', 'intense', 'avoidant'] as const;
export const DESIRE_LEVELS = ['low', 'medium', 'high'] as const satisfies readonly DesireLevel[];
export const PUBLICITY_LEVELS = ['secret', 'known', 'public'] as const;

/** 0 (yielding) … 3 (dominant). */
export const leadRank = (style: LeadStyle): number => LEAD_STYLES.indexOf(style);
/** 0 (low) … 2 (high). */
export const desireRank = (level: DesireLevel): number => DESIRE_LEVELS.indexOf(level);

/** What a named unit without a bond section has. It never qualifies for Want or rules (balanced, low desire). */
export const MODEST_BOND: Bond = Object.freeze({
  leadStyle: 'balanced', attachment: 'steady', desire: 'low', caretaker: false,
  ownLimits: Object.freeze({ categories: Object.freeze([]) as unknown as string[] }), publicity: 'known',
}) as Bond;

/** The bond profile of a named unit (a modest one when the card gave none); `null` for a grunt, which has no bond. */
export function bondOf(unit: Pick<Unit, 'kind' | 'bond'>): Bond | null {
  if (unit.kind !== 'named') return null;
  return unit.bond ?? MODEST_BOND;
}

/**
 * The bond tier of her current relationship state (`romantic` or `close`), `null` when the state has none or she has no
 * relation. Code reads the tier, never a state id (overview P4).
 */
export function bondTierOf(state: Pick<CampaignState, 'relations'>, reg: Registries, unitId: string): 'romantic' | 'close' | null {
  const stateId = state.relations[unitId]?.stateId;
  if (stateId === undefined) return null;
  const tier = reg.relationshipStates.get(stateId)?.bondTier;
  return tier === 'romantic' || tier === 'close' ? tier : null;
}
