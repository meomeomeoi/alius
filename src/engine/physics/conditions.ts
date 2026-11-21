/**
 * P15a: what the commander bears after a hold (plan R12, R15): `dizzy` until the day ends (every social rank one lower, a little stress) and
 * `stiff` until the next slot. A condition is data (`commanderConditions`); its rank change is copied into the record when it is set, so the
 * pure ranks (`socialRank`) read the state alone. Nothing here draws.
 */
import type { Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import type { CampaignState, Slot } from '../state/types';

export type ConditionUntil = { day: number; slot?: Slot };
const ORDER: readonly Slot[] = ['morning', 'afternoon', 'evening', 'night'];

export const conditionsOf = (state: Pick<CampaignState, 'commander'>): NonNullable<CampaignState['commander']['conditions']> => state.commander.conditions ?? [];

/** The change of every social rank the conditions bring (≤ 0). */
export const conditionRankDelta = (state: Pick<CampaignState, 'commander'>): number => conditionsOf(state).reduce((n, c) => n + (c.rank ?? 0), 0);

/** Sets a condition (the same id is replaced). Its stress is applied now, once. Throws on an unknown id. */
export function setCondition(draft: CampaignState, reg: Registries, id: string, until: ConditionUntil): EngineEvent[] {
  const entry = reg.commanderConditions.get(id);
  if (!entry) throw new Error(`Unknown condition "${id}".`);
  const effects = (entry.effects as Array<{ type: string; delta?: number; amount?: number }>) ?? [];
  const rank = effects.filter((e) => e.type === 'social_rank').reduce((n, e) => n + (e.delta ?? 0), 0);
  const was = conditionsOf(draft).some((c) => c.id === id);
  if (!was) for (const e of effects) if (e.type === 'stress') draft.commander.stress = Math.min(100, Math.max(0, (draft.commander.stress ?? 0) + (e.amount ?? 0)));
  draft.commander.conditions = [...conditionsOf(draft).filter((c) => c.id !== id), { id, until: { ...until }, ...(rank !== 0 ? { rank } : {}) }];
  return [{ type: 'condition_set', id, until: { ...until } }];
}

const over = (now: { day: number; slot: Slot }, until: ConditionUntil): boolean =>
  until.slot === undefined ? now.day > until.day : now.day * ORDER.length + ORDER.indexOf(now.slot) > until.day * ORDER.length + ORDER.indexOf(until.slot);

/** Drops the conditions whose time has passed (called whenever a slot passes). */
export function expireConditions(draft: CampaignState): EngineEvent[] {
  const all = conditionsOf(draft);
  const gone = all.filter((c) => over(draft, c.until));
  if (gone.length === 0) return [];
  const left = all.filter((c) => !gone.includes(c));
  if (left.length === 0) delete draft.commander.conditions;
  else draft.commander.conditions = left;
  return gone.map((c) => ({ type: 'condition_ended', id: c.id }));
}
