/**
 * P10e-e R26: the engine's check of a mention of the commander in her hour's script (her_activity.html `mentionText`): she says it plainly when
 * the listener knows of the two of them or the relation is public (P9d), plainly anyway with a reckless tactic (a leak), else its veiled form, or
 * nothing when it has none. What the listener knows is P15's knowledge path (`state.dynamic.knowledge`, read from the state: the lower layer
 * imports nothing of the dynamic); a mention is never a fact here (R26: a leak is the dynamic's witness path, which the engine applies there).
 */
import type { Registries } from '../../content/types';
import type { CampaignState } from '../state/types';

export type ListenerKnows = 'none' | 'suspects' | 'knows';

/** What a listener knows of her and the commander: `knows` at P15's `knows_dynamic`, `suspects` at either suspicion level, else `none`. */
export function listenerKnows(state: Pick<CampaignState, 'dynamic'>, holderId: string, listenerId: string): ListenerKnows {
  const level = state.dynamic?.knowledge?.[listenerId]?.[holderId]?.level;
  return level === 'knows_dynamic' ? 'knows' : level !== undefined ? 'suspects' : 'none';
}

/** The words she says, or `null` (left unsaid). */
export function mentionText(state: Pick<CampaignState, 'dynamic' | 'relations'>, _reg: Registries, holderId: string, listenerId: string, mention: { plain: string; veiled?: string }, tactic?: 'reckless'): string | null {
  const plainOk = listenerKnows(state, holderId, listenerId) === 'knows' || state.relations[holderId]?.publicity?.level === 'public';
  if (plainOk || tactic === 'reckless') return mention.plain;
  return mention.veiled !== undefined && mention.veiled.trim() !== '' ? mention.veiled : null;
}
