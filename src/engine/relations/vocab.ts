import type { Severity } from '../state/types';

/** The 35 event types the mechanic model may report (26 of P3 spec §3, the four of P9, the three of P9d, P12's knowledge_leak and accused). Content (`eventDeltas`) must have a row for each. */
export const EVENT_TYPES = [
  'praised', 'insulted', 'comforted', 'dismissed', 'listened', 'shared_secret', 'learned_about', 'gift', 'flirted',
  'rejected_advance', 'accepted_advance', 'physical_affection', 'sided_with', 'sided_against', 'decision_aligned',
  'decision_violated', 'protected', 'endangered', 'coerced', 'apologized', 'lied_detected', 'kept_promise',
  'broke_promise', 'mocked_defect', 'accepted_defect', 'crime_revealed',
  // P9: discipline
  'defied', 'commander_enforced', 'commander_yielded', 'threatened',
  // P9d: relationship rules (the model reports whether a rule was kept or broken, or a compromise reached)
  'rule_kept', 'rule_broken', 'compromise_reached',
  // P12: the commander used something only the frequency could have told (offered to the model only while an intercepted item is listed)
  'knowledge_leak',
  // P12: the commander openly accuses a unit of planning disloyalty (offered only while a present unit has an open premonition)
  'accused',
] as const;

/** P9: events only the engine makes (a demand granted or refused; P9d: the commander followed her lead; P9b: the leader's moves). Never offered to the model; `validateIntents` rejects them. */
export const ENGINE_EVENT_TYPES = ['granted_demand', 'refused_demand', 'followed_lead', 'rule_accepted', 'rule_refused',
  // P9b: the squad leader overruled by the commander, endorsed, and a challenge won or lost
  'leader_overruled', 'leader_endorsed', 'challenge_won', 'challenge_lost',
  // P9b: the commander took the blame for her (a scapegoat dilemma); never reported by the model
  'shielded',
  // P9c: she was overridden; decor peeled; a rival favoured; a bond shown; a worn token taken off; the squad confronted about a secret
  'overrode_her', 'decor_removed', 'rival_favoured', 'bond_shown', 'token_removed', 'secret_confronted',
  // P12: she found out the commander hears thoughts (the engine's own: the discovery or a rumor of it)
  'frequency_exposed',
  // P12: she was accused (or punished, or leashed) on a false alarm
  'false_accusation',
  // P12: she found out the commander sells intel to a rival corporation
  'debts_exposed',
] as const;

/** The event types a world effect (`unit_event`) may apply: what the model reports, plus `shielded` (the engine's own, from a scapegoat dilemma). */
export const WORLD_EFFECT_EVENT_TYPES = [...EVENT_TYPES, 'shielded'] as const;

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
