import type { Severity } from '../state/types';

/** The event types the mechanic model may report (the 26 of P3 spec §3, then P9, P9d, P12, P13, P14c's seven and P15's seven). Content (`eventDeltas`) must have a row for each. */
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
  // P13: the commander kept or broke what the warden expects (offered only while she is present and her expectations are listed)
  'expectation_kept', 'expectation_broken',
  // P13: the commander enlists a unit against the warden (offered only while she holds the leash and is not in the scene)
  'conspired',
  // P14c: her life (offered to the model only while there is something of the kind to report; the engine's own offered lists decide)
  'news_told', 'hobby_praised', 'opinion_voiced', 'opinion_challenged', 'opinion_agreed', 'first_moment', 'joke_returned',
  // P15: the dynamic (each offered to the model only while its subject exists: a pending probe, an open milestone or offer, a holder's compromat, a holder at role in company)
  'probe_answered', 'probe_observed', 'milestone_accepted', 'milestone_refused', 'compromat_mentioned', 'protocol_slip', 'offer_answered',
] as const;

/** P14c: the model-reportable types of her life. The intent prompt offers each only with its own list, and `validateIntents` drops one it was not offered. */
export const LIFE_EVENT_TYPES: readonly string[] = ['news_told', 'hobby_praised', 'opinion_voiced', 'opinion_challenged', 'opinion_agreed', 'first_moment', 'joke_returned'];

/** P15: the model-reportable types of the dynamic. The intent prompt offers each only while its subject exists, and `validateIntents` drops one it was not offered. */
export const DYNAMIC_INTENT_TYPES: readonly string[] = ['probe_answered', 'probe_observed', 'milestone_accepted', 'milestone_refused', 'compromat_mentioned', 'protocol_slip', 'offer_answered'];

/** P14c: the kinds of a `first_moment` (a closed enum; a kind the pair has not had yet is kept). */
export const FIRST_KINDS = ['laughed', 'fell_asleep_beside', 'told_her_past', 'cried', 'taught', 'asked_about_commander'] as const;
export type FirstKind = (typeof FIRST_KINDS)[number];

/** P9: events only the engine makes (a demand granted or refused; P9d: the commander followed her lead; P9b: the leader's moves). Never offered to the model; `validateIntents` rejects them. */
export const ENGINE_EVENT_TYPES = ['warden_complied', 'warden_defied', 'warden_betrayed', 'warden_removed_by', 'granted_demand', 'refused_demand', 'followed_lead', 'rule_accepted', 'rule_refused',
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
  // P14c: a quiet meeting with her (a pastime) ended; never reported by the model
  'time_together',
  // P15: the commander left a dynamic (the exit, by route and severity); the engine's own
  'dynamic_exit',
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
