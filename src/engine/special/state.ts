import type { CampaignState } from '../state/types';

/**
 * The leaf of the special-trait module (P12): reading and writing `CampaignState.special` with nothing but types imported,
 * so `social`, `calendar`, `combat/effects` and `loyalty/*` can read it without a cycle. The fields are filled by the
 * tasks that own them (frequency, paranoia, debts); until then each block is empty.
 */

/** Secret Frequency: what the commander overheard and who is suspicious. */
export interface FrequencyState {}

/** Bloom-induced Paranoia: premonitions, preempt windows and the last nightmare. */
export interface ParanoiaState {}

/** Web of Debts: the handler, the intel exchange and both suspicion clocks. */
export interface DebtsState {}

/** The special state, created by `seedSpecialTraits` (a save without it reads as nothing intercepted, foreseen or owed). */
export interface SpecialState {
  frequency?: FrequencyState;
  paranoia?: ParanoiaState;
  debts?: DebtsState;
}

/** The special state, created empty on first write. */
export function specialOf(draft: CampaignState): SpecialState {
  return (draft.special ??= {});
}
