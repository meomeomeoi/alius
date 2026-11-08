import type { CampaignState, Relation } from './state/types';
import { TUNING } from './tuning';

export type RelationAxis = 'trust' | 'affinity' | 'attraction';

export interface RelationGainContext {
  state: CampaignState;
  unitId: string;
  /** `state.relations[unitId]`; the handler mutates it. */
  relation: Relation;
}

/** Mutates `ctx.relation` and returns the delta that was actually applied. */
export type RelationGainHandler = (ctx: RelationGainContext, axis: RelationAxis, amount: number, source: string) => number;

const RANGE: Record<RelationAxis, [number, number]> = { trust: [0, 100], affinity: [-100, 100], attraction: [0, 100] };

/** P2's default: daily diminishing returns on gains, losses in full. P3 replaces it with its own accounting. */
const defaultHandler: RelationGainHandler = ({ relation }, axis, amount) => {
  const [lo, hi] = RANGE[axis];
  const before = relation[axis];
  let applied = amount;
  if (amount > 0) {
    const done = relation.dailyGain[axis];
    let sum = 0;
    for (let i = 0; i < amount; i++) {
      const at = done + i;
      sum += at < TUNING.gain.soft ? 1 : at < TUNING.gain.hard ? 0.5 : 0;
    }
    applied = Math.round(sum);
  }
  relation[axis] = Math.min(hi, Math.max(lo, before + applied));
  const real = relation[axis] - before;
  if (real > 0) relation.dailyGain[axis] += real;
  return real;
};

let handler: RelationGainHandler = defaultHandler;

export const setRelationGainHandler = (fn: RelationGainHandler): void => {
  handler = fn;
};
export const resetRelationGainHandler = (): void => {
  handler = defaultHandler;
};

/** The only way P2 changes a relationship axis. */
export function applyRelationDelta(
  draft: CampaignState, unitId: string, axis: RelationAxis, amount: number, source: string,
): number {
  const relation = draft.relations[unitId];
  if (!relation) return 0;
  return handler({ state: draft, unitId, relation }, axis, amount, source);
}
