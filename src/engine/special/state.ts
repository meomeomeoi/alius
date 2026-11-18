import type { CampaignState } from '../state/types';

/**
 * The leaf of the special-trait module (P12): reading and writing `CampaignState.special` with nothing but types imported,
 * so `social`, `calendar`, `combat/effects` and `loyalty/*` can read it without a cycle. The fields are filled by the
 * tasks that own them (frequency, paranoia, debts); until then each block is empty.
 */

/** What an intercept can be about: a closed vocabulary, read from live state (P12 §1). */
export const CANDIDATE_KINDS = ['stance', 'impunity', 'demand', 'loyalty', 'fact', 'attraction', 'refusal', 'secret'] as const;
export type CandidateKind = (typeof CANDIDATE_KINDS)[number];

/**
 * One fragment the commander overheard. `true` says whether it was undistorted; it never leaves the engine (no event, toast,
 * reading or panel carries it). `value` is the engine's key (a stance, a band, an id, or `none`), `text` the worded fragment.
 */
export interface Intercepted {
  id: string;
  unitId: string;
  day: number;
  kind: CandidateKind;
  value: string;
  true: boolean;
  partial: boolean;
  refId?: string;
  sceneId?: string;
  text?: string;
}

/** Secret Frequency: what the commander overheard and who is suspicious. */
export interface FrequencyState {
  /** The newest `TUNING.special.frequency.logMax` intercepts. */
  intercepts: Intercepted[];
  /** Counter behind the intercept ids. */
  seq: number;
  /** Her suspicion 0–100 (engine only, hidden). */
  suspicion: Record<string, number>;
  /** The day of the last DM roll per unit (a DM rolls once a day). */
  dmDay: Record<string, number>;
  /** Set once the implant is burned out: no more intercepts. */
  burnedDay?: number;
  /** The hidden spreading fact written at the first discovery. */
  factId?: string;
  /** Units whose discovery has been announced (the knowledge rule shows `knows_frequency` only for these). */
  discovered?: string[];
  staticFired?: string[];
}

export const newFrequency = (): FrequencyState => ({ intercepts: [], seq: 0, suspicion: {}, dmDay: {} });

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

/**
 * A unit leaves the service (deserted, terminated, dead): everything the special state holds about her goes, so nothing is
 * suspected, foreseen, owed or scheduled for her later. Each system adds its own part as it is built.
 */
export function forgetSpecial(draft: CampaignState, unitId: string): void {
  const f = draft.special?.frequency;
  if (f) {
    f.intercepts = f.intercepts.filter((x) => x.unitId !== unitId);
    delete f.suspicion[unitId];
    delete f.dmDay[unitId];
    if (f.staticFired) f.staticFired = f.staticFired.filter((id) => id !== unitId);
    if (f.discovered) f.discovered = f.discovered.filter((id) => id !== unitId);
  }
}

/** Does the unit hold anything in the special state (so the day step knows a dead unit still has something to drop)? */
export function holdsSpecial(state: Pick<CampaignState, 'special'>, unitId: string): boolean {
  const f = state.special?.frequency;
  return f !== undefined && (f.intercepts.some((x) => x.unitId === unitId) || f.suspicion[unitId] !== undefined || f.dmDay[unitId] !== undefined
    || f.staticFired?.includes(unitId) === true || f.discovered?.includes(unitId) === true);
}
