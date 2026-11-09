import type { Severity } from '../state/types';

/** The 26 event types the mechanic model may report (P3 spec §3). Content (`eventDeltas`) must have a row for each. */
export const EVENT_TYPES = [
  'praised', 'insulted', 'comforted', 'dismissed', 'listened', 'shared_secret', 'learned_about', 'gift', 'flirted',
  'rejected_advance', 'accepted_advance', 'physical_affection', 'sided_with', 'sided_against', 'decision_aligned',
  'decision_violated', 'protected', 'endangered', 'coerced', 'apologized', 'lied_detected', 'kept_promise',
  'broke_promise', 'mocked_defect', 'accepted_defect', 'crime_revealed',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const PROPOSAL_KINDS = [
  'friendship_deepen', 'confide', 'date', 'fwb', 'romance', 'exclusive', 'break_up', 'reconcile', 'rivalry', 'secret_affair',
] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

/** Proposal kinds that only exist when romance is on. */
export const ROMANTIC_PROPOSALS: readonly ProposalKind[] = ['date', 'fwb', 'romance', 'exclusive', 'secret_affair'];

export const SEVERITIES: readonly Severity[] = ['minor', 'moderate', 'major', 'extreme'];

/** Types the engine writes into `Relation.history` itself; `eventCount` conditions may count them. */
export const INTERNAL_HISTORY_TYPES = ['stress_high'] as const;
