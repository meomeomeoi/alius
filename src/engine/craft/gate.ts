/**
 * The gate of the craft (P16b, plan Task 1): when the craft runs. One gate for the disciplines and the pair's book, `craftLive`, which is
 * P16's `practiceLive` (a holder at `play` or beyond whose profile practises something that is on); and one of its own for unasked care,
 * `careOpen` (ruling 7), which is open toward any woman with a dynamic block. While neither holds nothing is written, nothing is drawn and
 * no directive or offer exists. Reads only; draws nothing.
 */
import type { Registries } from '../../content/types';
import { dynamicOn, herPracticeLive } from '../dynamic/gate';
import { isLiving } from '../economy';
import { practiceLive, practicesOn } from '../practice/gate';
import type { CampaignState } from '../state/types';

/** Does her craft run now? Exactly P16's gate: the dynamic on, a living named soldier at `play` or beyond with no aftermath, practising something that is on. */
export function craftLive(state: CampaignState, reg: Registries, holderId: string): boolean {
  return practiceLive(state, reg, holderId);
}

/** Is some holder craft-live? While this is false nothing of the craft is written (the book's writers answer `[]`). */
export function craftOn(state: CampaignState, reg: Registries): boolean {
  return practicesOn(state, reg);
}

/** The living holders of the craft, in squad order. */
export function craftHolders(state: CampaignState, reg: Registries): string[] {
  return state.squad.filter((u) => craftLive(state, reg, u.id)).map((u) => u.id);
}

/**
 * Is unasked care open toward her (ruling 7)? The dynamic is on, her profile is live (`herPracticeLive`), she is a living named soldier and
 * she has a dynamic block with the commander (probing or holding: `Relation.dynamic`). At `equal` it brings only her noticing.
 */
export function careOpen(state: CampaignState, reg: Registries, unitId: string): boolean {
  if (!dynamicOn(state, reg)) return false;
  const unit = state.squad.find((u) => u.id === unitId);
  if (unit === undefined || unit.kind !== 'named' || !isLiving(unit)) return false;
  return herPracticeLive(state, unitId) && state.relations[unitId]?.dynamic !== undefined;
}
