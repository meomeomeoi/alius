/**
 * Her settling-in count (P16b, plan Task 2; spec section 1.6): she does not let the commander settle in. Clean holds of a kind in a row are
 * counted on the pair (hidden); after `settling.clean` of them she adds a load her style likes (the count, no duration, a speech rule, a
 * combined physics, a new posture). The readers that use it come with the holds and the postures (Tasks 11 and 19). Draws nothing.
 */
import type { Registries } from '../../content/types';
import { styleOf } from '../dynamic/profile';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { craftLive } from './gate';
import { craftRoll } from './state';

/** The loads she may add, in the order of `TUNING.craft.settling.modifiers`. */
export type SettlingModifier = (typeof TUNING.craft.settling.modifiers)[number];

/**
 * Keeps her count of clean holds of a kind in a row: a clean one adds 1, a slip (or any unclean end) resets it. The caller has checked that she is
 * craft-live (this takes no registry). A kind that is reset is dropped, so a pair that never has a streak holds no list.
 */
export function noteClean(draft: CampaignState, holderId: string, kind: string, clean: boolean): void {
  const rel = draft.relations[holderId];
  if (rel === undefined) return;
  if (!clean) {
    if (rel.craft?.streak?.[kind] === undefined) return;
    delete rel.craft.streak[kind];
    return;
  }
  const streak = ((rel.craft ??= {}).streak ??= {});
  streak[kind] = (streak[kind] ?? 0) + 1;
}

/** Is she due to add a load for this kind: she is craft-live and the commander has held it clean `settling.clean` times in a row. */
export function settlingDue(state: CampaignState, reg: Registries, holderId: string, kind: string): boolean {
  return craftLive(state, reg, holderId) && (state.relations[holderId]?.craft?.streak?.[kind] ?? 0) >= TUNING.craft.settling.clean;
}

/**
 * The load she picks: an index into the list her style likes (`TUNING.craft.settling.byStyle`, her style read through `styleOf`; every load when her
 * style has no row), by `craftRoll`, so it is stable for a day and draws nothing. `null` when she is not craft-live.
 */
export function settlingModifier(state: CampaignState, reg: Registries, holderId: string): SettlingModifier | null {
  if (!craftLive(state, reg, holderId)) return null;
  const unit = state.squad.find((u) => u.id === holderId);
  const liked = (unit !== undefined ? TUNING.craft.settling.byStyle[styleOf(unit)?.primary ?? ''] : undefined) ?? TUNING.craft.settling.modifiers;
  return liked[Math.floor(craftRoll(state, holderId, 'settling') * liked.length)] as SettlingModifier;
}
