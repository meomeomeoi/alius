/**
 * The leaf of the practices (P16, plan R2, R3): the closed vocabularies, the shape of `state.practices`, the engine event list and the
 * one source of chances (`practiceRoll`). It imports only types and `dynamic/witness.ts` (itself a leaf), so the state types can name it
 * without a cycle. Whether the practices are live, the writers and the removal are in `gate.ts` and `forget.ts`.
 *
 * Nothing here draws from the campaign's rng: every chance is `practiceRoll` (a `dynamicRoll` with a `practice:` key) and every pick is an
 * index into a registry-ordered list by `Math.floor(practiceRoll × n)`.
 */
import type { Frame } from '../dynamic/types';
import { dynamicRoll } from '../dynamic/witness';
import type { CampaignState, Inverse, Slot } from '../state/types';

/** What a holder may do with the commander (R3). */
export const PRACTICE_KINDS = ['task', 'punishment', 'demonstration', 'protocol', 'denial', 'hold'] as const;
export type PracticeKind = (typeof PRACTICE_KINDS)[number];

/** How much a practice weighs, from the lightest (rank 0) to the heaviest (rank 3). */
export const STAKES = ['trivial', 'minor', 'major', 'severe'] as const;
export type Stake = (typeof STAKES)[number];

/** How the engine judges a task (`model` = only what the mechanic model reads in the talk). */
export const CHECK_KINDS = ['slot_with_her', 'booking_kept', 'token_worn', 'on_roster', 'not_on_roster', 'dm_report', 'no_scene_with', 'rule_kept_until', 'model'] as const;
export type CheckKind = (typeof CHECK_KINDS)[number];

export const PROOFS = ['none', 'dm_report', 'in_person', 'witness'] as const;
export type Proof = (typeof PROOFS)[number];

export const SEED_AUDIENCE = ['none', 'select_few', 'any'] as const;
export type SeedAudience = (typeof SEED_AUDIENCE)[number];

export const TASK_STATUS = ['offered', 'open', 'kept', 'broken', 'refused', 'void'] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];

/** The consent ladder (R6): the more a practice weighs, the more the accept asks. */
export const ACCEPT_FORMS = ['button', 'button_cost', 'words', 'signed', 'sealed'] as const;
export type AcceptForm = (typeof ACCEPT_FORMS)[number];

export const OFFENCE_KINDS = [
  'task_broken', 'rule_broken', 'protocol_slip', 'denial_broken', 'refusal', 'milestone_refused', 'countermand_overruled',
  'physics_slip', 'physics_caught', 'posture_slip', 'false_report', 'asked', 'unfair', 'hold_defied',
] as const;
export type OffenceKind = (typeof OFFENCE_KINDS)[number];

export const PUNISHMENT_EFFECT_TYPES = ['slot_held', 'privilege_revoked', 'protocol_extra', 'cold_shoulder', 'confession', 'mark', 'stress', 'injury_chance', 'physical', 'slap'] as const;
export type PunishmentEffectType = (typeof PUNISHMENT_EFFECT_TYPES)[number];

export const PUNISHMENT_STATUS = ['offered', 'negotiating', 'accepted', 'refused', 'done', 'void'] as const;
export type PunishmentStatus = (typeof PUNISHMENT_STATUS)[number];

export const ALARM_KINDS = ['launch', 'deadline', 'night'] as const;
export type AlarmKind = (typeof ALARM_KINDS)[number];

export const ALARM_ANSWERS = ['release', 'release_late', 'keep'] as const;
export type AlarmAnswer = (typeof ALARM_ANSWERS)[number];

export const PERMISSION_ANSWERS = ['grant', 'deny', 'wait', 'earn'] as const;
export type PermissionAnswer = (typeof PERMISSION_ANSWERS)[number];

export const VERDICTS = ['pleased', 'adequate', 'displeased'] as const;
export type Verdict = (typeof VERDICTS)[number];

export const KINDNESS_KINDS = ['slot_back', 'protocol_relaxed', 'want_relief', 'gift', 'softer'] as const;
export type KindnessKind = (typeof KINDNESS_KINDS)[number];

export const UNFAIR_KINDS = ['no_guilt', 'double_standard', 'cancelled_reward', 'moved_goal'] as const;
export type UnfairKind = (typeof UNFAIR_KINDS)[number];

/** What the commander may hand to a holder (rations and sleep are P17b). */
export const HANDOVER_KINDS = ['device', 'key', 'calendar'] as const;
export type HandoverKind = (typeof HANDOVER_KINDS)[number];

export const SLAP_RESULTS = ['none', 'braced', 'flinched'] as const;
export type SlapResult = (typeof SLAP_RESULTS)[number];

/** The ceremony's step checks (R.4): a chip, words, a number, a posture. */
export const CEREMONY_CHECKS = ['chip', 'words', 'number', 'posture'] as const;
export type CeremonyCheck = (typeof CEREMONY_CHECKS)[number];

/** What a punishment effect needs switched on (the schema refuses an effect whose tag is not in the row's `contentTags`; one of `any` is enough). */
export const EFFECT_NEEDS: Readonly<Record<PunishmentEffectType, readonly string[]>> = Object.freeze({
  slot_held: [], privilege_revoked: [], protocol_extra: [], cold_shoulder: [], stress: [],
  confession: ['public_humiliation'], mark: ['body_modification'],
  injury_chance: ['pain_rough', 'physical_discipline_shown'], physical: ['physical_discipline_shown'], slap: ['physical_discipline_shown'],
});

/** The ids of requests `pq`, tasks `pt`, punishments `pp`, demonstrations `pd`, alarms `pa`, slaps `ps`, posture calls `pc` and handovers `ph`. */
export const PRACTICE_ID_PREFIXES = ['pq', 'pt', 'pp', 'pd', 'pa', 'ps', 'pc', 'ph'] as const;
export type PracticeIdPrefix = (typeof PRACTICE_ID_PREFIXES)[number];

/**
 * Every engine event of the package (R19). The schema reserves them (content may not `emit_event` one) and the practice controller refreshes
 * the directives on each. `task_kept` and `task_broken` are both an engine event and, when the model reports them, an intent.
 */
export const PRACTICE_EVENT_TYPES = [
  'practice_requested', 'task_issued', 'task_answered', 'task_kept', 'task_broken', 'task_void', 'practice_opened', 'practice_signed',
  'punishment_issued', 'punishment_answered', 'punishment_taken_for', 'demonstration_staged', 'demonstration_seen', 'protocol_set', 'routine_kept',
  'permission_answered', 'hold_started', 'hold_extended', 'hold_released', 'hold_alarm', 'ask_answered', 'favour_kindness', 'practice_anticipated',
  'posture_named', 'posture_called', 'posture_slip', 'slap_started', 'slap_dealt', 'ceremony_done', 'handover_given', 'handover_ended',
  'threat_voiced', 'practice_undone',
] as const;
export type PracticeEventType = (typeof PRACTICE_EVENT_TYPES)[number];

export interface Offence { kind: OffenceKind; ref?: string; stakes: Stake; day: number; unfair?: true }

export interface PracticeRequest {
  id: string;
  holderId: string;
  kind: PracticeKind;
  day: number;
  seedIds: string[];
  chainOf?: string;
  offence?: Offence;
  targetUnitId?: string;
  sealed?: true;
  noDuration?: true;
  unfair?: UnfairKind;
  asked?: true;
}

export interface Task {
  id: string;
  holderId: string;
  kind: 'task' | 'protocol' | 'denial' | 'hold' | 'demonstration';
  seedId?: string;
  tags: string[];
  track: string;
  tier: 1 | 2 | 3 | 4 | 5;
  stakes: Stake;
  check: CheckKind;
  checkArg?: string;
  proof: Proof;
  deadline?: { day: number; slot?: Slot };
  noDuration?: true;
  audienceIds?: string[];
  text: string;
  summary: string;
  plain?: true;
  chainId?: string;
  step?: number;
  status: TaskStatus;
  targetUnitId?: string;
  field?: true;
  routine?: true;
  sealed?: true;
  acceptForm: AcceptForm;
  day: number;
  answeredDay?: number;
  report?: { day: number; falseReport?: true };
  bookingId?: string;
  ruleId?: string;
  handover?: HandoverKind;
  /** The request this card was written for (the key of its generation: a reroll while it is offered replaces the card). */
  requestId?: string;
  /** The slots of the commander the task takes (a hold's span; the cost the card shows). */
  slots?: number;
  /** A `signed` task whose words were said: only the signature is left (R6). */
  said?: true;
  /** The scene with her that is open and would keep a `slot_with_her` task when it ends. */
  sceneId?: string;
  /** The day a verdict (kept or broken) was settled. */
  settledDay?: number;
}

/** A ceremony's progress (R21): the step rows for her style by `order`, the ones done, and the number the commander named. */
export interface CeremonyState { steps: string[]; done: string[]; number?: number }

export interface OpenPunishment {
  id: string;
  holderId: string;
  entryId: string;
  severity: 1 | 2 | 3 | 4 | 5;
  offence: Offence;
  text: string;
  summary: string;
  plain?: true;
  status: PunishmentStatus;
  public?: true;
  sealed?: true;
  hiddenCount?: true;
  count?: number;
  escalated?: true;
  forUnitId?: string;
  ceremony?: CeremonyState;
  day: number;
  sceneId?: string;
  inverse?: Inverse;
}

/** A demonstration she has staged and not yet seen through (R9). `observed` lists who saw it at the scene's end. */
export interface OpenDemonstration {
  id: string;
  holderId: string;
  taskId?: string;
  tags: string[];
  summary: string;
  text: string;
  plain?: true;
  audienceIds: string[];
  stage: string;
  day: number;
  sceneId?: string;
  status: 'offered' | 'open' | 'done' | 'refused' | 'void';
  observed?: string[];
}

export interface HeldState {
  by: string;
  since: { day: number; slot: Slot };
  until: { day: number; slot: Slot };
  hidden?: true;
  sensory: boolean;
  extended: number;
  bookingIds: string[];
  alarm?: string;
  run?: true;
}

export interface OpenAlarm { id: string; holderId: string; kind: AlarmKind; day: number; slot: Slot; answer?: AlarmAnswer; argued?: true; payload?: unknown }

export interface PracticeState {
  seq: number;
  requests: PracticeRequest[];
  tasks: Task[];
  punishments: OpenPunishment[];
  demonstrations: OpenDemonstration[];
  held?: HeldState;
  alarm?: OpenAlarm;
  permission?: { holderId: string; ruleId: string; asked?: { day: number; answer: PermissionAnswer; untilDay?: number } };
  restrictions: Array<{ holderId: string; what: 'no_dms_others' | 'no_free_activities' | 'room'; arg?: string; untilDay: number }>;
  /** holderId → the last day of the cold shoulder. */
  cold: Record<string, number>;
  postures: Record<string, Array<{ postureId: string; name: string; day: number }>>;
  call?: { id: string; holderId: string; postureId: string; sceneId: string; at: number };
  slap?: { id: string; holderId: string; sceneId: string; windowMs: number; feints: number; public?: true };
  /** holderId → the days of her offences (the repeat count). */
  offences: Record<string, number[]>;
  records: Array<{ day: number; holderId: string; line: string }>;
  handovers: Array<{ id: string; kind: HandoverKind; holderId: string; untilDay: number }>;
  asked?: { context: 'dilemma' | 'expedition' | 'vote'; ref: string; index: number | 'for' | 'against' | null; holderId: string; preselected?: true };
  unfair?: Record<string, { kind: UnfairKind; day: number; used?: true }>;
  lastThreat?: { unitId: string; sceneId?: string; exchange: number; day: number };
  /** holderId → the scene id that already got a verdict. */
  verdictScene?: Record<string, string>;
}

/**
 * What `validatePracticeOutput` makes of the model's card (R5): every field legal, clamped to what the engine allows. `issuePractice` writes a
 * practice from it (or from the fallback, which builds the same shape from a seed). The engine never reads `text`; the controller and the cards do.
 */
export interface ValidOutput {
  kind: PracticeKind;
  seedId?: string;
  tags: string[];
  track: string;
  tier: 1 | 2 | 3 | 4 | 5;
  stakes: Stake;
  check: CheckKind;
  checkArg?: string;
  deadline?: { days: number; slot?: Slot };
  proof: Proof;
  audienceIds?: string[];
  text: string;
  summary: string;
}

/** What a campaign that never had a holder at `play` has: nothing (`practices` is absent). The first write creates this. */
export function blankPractices(): PracticeState {
  return { seq: 0, requests: [], tasks: [], punishments: [], demonstrations: [], restrictions: [], cold: {}, postures: {}, offences: {}, records: [], handovers: [] };
}

/** The rank of a stake: trivial 0 … severe 3. */
export function stakeRank(s: Stake): 0 | 1 | 2 | 3 {
  return STAKES.indexOf(s) as 0 | 1 | 2 | 3;
}

/**
 * A chance in [0, 1) that belongs to one unit, one key and the day: `dynamicRoll(state, unitId, 'practice:' + key)`. It draws nothing from
 * `state.rng` (the P16 rule: no draw anywhere), so a campaign without practices keeps its rng, and the same key on the same day always
 * answers the same. A pick is an index into a registry-ordered list by `Math.floor(practiceRoll(…) × n)`.
 */
export function practiceRoll(state: Pick<CampaignState, 'dynamic' | 'day'>, unitId: string, key: string): number {
  return dynamicRoll(state, unitId, `practice:${key}`);
}

/** The frame a stakes ceiling or a cap is read at (the practices run from `play`). */
export type PracticeFrame = Exclude<Frame, 'equal'>;
