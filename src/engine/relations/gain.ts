import { setRelationGainHandler, type RelationAxis, type RelationGainHandler } from '../relationGain';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';

const RANGE: Record<RelationAxis, [number, number]> = { trust: [0, 100], affinity: [-100, 100], attraction: [0, 100] };

/** Rounds half away from zero (2.5 → 3, −2.5 → −3). */
export const roundAway = (x: number): number => Math.sign(x) * Math.round(Math.abs(x));

/** The k of the diminishing-returns formula; a campaign may override it with `settings.relationK`. */
export const relationK = (state: CampaignState): number => {
  const k = state.settings.relationK;
  return typeof k === 'number' && Number.isFinite(k) && k > 0 ? k : TUNING.relations.k;
};

export interface Intimacy {
  romance: boolean;
  initiative: 'low' | 'med' | 'high';
}

/** The intimacy settings mirrored into the campaign by `campaign/set_intimacy` (default: romance on, medium initiative). */
export function intimacyOf(state: CampaignState): Intimacy {
  const v = state.settings.intimacy as Partial<Intimacy> | undefined;
  return {
    romance: typeof v?.romance === 'boolean' ? v.romance : true,
    initiative: v?.initiative === 'low' || v?.initiative === 'med' || v?.initiative === 'high' ? v.initiative : 'med',
  };
}

/** P3 accounting: gains shrink as `1 / (1 + gainedToday / k)`, losses are applied in full. Returns the real change. */
export const p3GainHandler: RelationGainHandler = ({ state, relation }, axis, amount) => {
  const [lo, hi] = RANGE[axis];
  const before = relation[axis];
  const effective = amount > 0 ? amount / (1 + relation.dailyGain[axis] / relationK(state)) : amount;
  relation[axis] = Math.min(hi, Math.max(lo, before + roundAway(effective)));
  const real = relation[axis] - before;
  if (real > 0) relation.dailyGain[axis] += real;
  return real;
};

export const installRelationAccounting = (): void => setRelationGainHandler(p3GainHandler);
