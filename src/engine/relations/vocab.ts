import type { Severity } from '../state/types';

/** The 33 event types the mechanic model may report (26 of P3 spec §3, the four of P9, the three of P9d). Content (`eventDeltas`) must have a row for each. */
export const EVENT_TYPES = [
  'praised', 'insulted', 'comforted', 'dismissed', 'listened', 'shared_secret', 'learned_about', 'gift', 'flirted',
  'rejected_advance', 'accepted_advance', 'physical_affection', 'sided_with', 'sided_against', 'decision_aligned',
  'decision_violated', 'protected', 'endangered', 'coerced', 'apologized', 'lied_detected', 'kept_promise',
  'broke_promise', 'mocked_defect', 'accepted_defect', 'crime_revealed',
  // P9: discipline
  'defied', 'commander_enforced', 'commander_yielded', 'threatened',
  // P9d: relationship rules (the model reports whether a rule was kept or broken, or a compromise reached)
  'rule_kept', 'rule_broken', 'compromise_reached',
] as const;

/** P9: events only the engine makes (a demand granted or refused; P9d: the commander followed her lead). Never offered to the model; `validateIntents` rejects them. */
export const ENGINE_EVENT_TYPES = ['granted_demand', 'refused_demand', 'followed_lead', 'rule_accepted', 'rule_refused'] as const;

/** Every type that has an `eventDeltas` row: what the model may report and what only the engine writes. */
export const ALL_EVENT_TYPES = [...EVENT_TYPES, ...ENGINE_EVENT_TYPES] as const;
export type EventType = (typeof ALL_EVENT_TYPES)[number];

export const PROPOSAL_KINDS = [
  'friendship_deepen', 'confide', 'date', 'fwb', 'romance', 'exclusive', 'break_up', 'reconcile', 'rivalry', 'secret_affair',
] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

/** Proposal kinds that only exist when romance is on. */
export const ROMANTIC_PROPOSALS: readonly ProposalKind[] = ['date', 'fwb', 'romance', 'exclusive', 'secret_affair'];

export const SEVERITIES: readonly Severity[] = ['minor', 'moderate', 'major', 'extreme'];

/** Types the engine writes into `Relation.history` itself; `eventCount` conditions may count them. */
export const INTERNAL_HISTORY_TYPES = ['stress_high'] as const;
