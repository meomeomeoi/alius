/**
 * The leaf of the practices (P16, plan R2, R3): the closed vocabularies, the shape of `state.practices`, the engine event list and the
 * one source of chances (`practiceRoll`). It imports only types and `dynamic/witness.ts` (itself a leaf), so the state types can name it
 * without a cycle. Whether the practices are live, the writers and the removal are in `gate.ts` and `forget.ts`.
 *
 * Nothing here draws from the campaign's rng: every chance is `practiceRoll` (a `dynamicRoll` with a `practice:` key) and every pick is an
 * index into a registry-ordered list by `Math.floor(practiceRoll × n)`.
 */
import type { DynamicDomain, TrackState } from '../dynamic/state';
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

/** What a punishment effect needs switched on (the schema refuses an effect whose tag is not in the row's `contentTags`; one of `any` is enough). A held slot is a restrained one: the hold it starts is a `restraint` booking, which goes with the category. */
export const EFFECT_NEEDS: Readonly<Record<PunishmentEffectType, readonly string[]>> = Object.freeze({
  slot_held: ['restraint'], privilege_revoked: [], protocol_extra: [], cold_shoulder: [], stress: [],
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
  'permission_answered', 'hold_started', 'hold_extended', 'hold_released', 'hold_asked', 'hold_alarm', 'ask_answered', 'favour_kindness', 'practice_anticipated',
  'posture_named', 'posture_called', 'posture_slip', 'slap_started', 'slap_dealt', 'ceremony_step', 'ceremony_done', 'her_asked', 'handover_given', 'handover_ended',
  'threat_voiced', 'practice_undone',
] as const;
export type PracticeEventType = (typeof PRACTICE_EVENT_TYPES)[number];

export interface Offence { kind: OffenceKind; ref?: string; stakes: Stake; day: number; unfair?: true; /** The commander told it herself (`[ I DIDN'T ]`): the punishment weighs one less. */ confessed?: true }

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
  /** A punishment's weight (1 to 5) and the entry the engine picked for it when it was requested (R8): the model words it, the engine owns both. */
  severity?: 1 | 2 | 3 | 4 | 5;
  entryId?: string;
  /** A punishment that follows a refused one at one step more (she escalates once). */
  escalated?: true;
  /** TAKE IT INSTEAD: the soldier the order is for, and the P9 measure it names (`entryId`). */
  forUnitId?: string;
  /** A protocol's length in days (a punishment's `protocol_extra`). */
  days?: number;
  /** A task she asks for to let permission through (her answer `earn`): the permission rule it earns. */
  earns?: string;
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
  /** A handover card only: for how many days (a device is one). */
  handoverDays?: number;
  /** The request this card was written for (the key of its generation: a reroll while it is offered replaces the card). */
  requestId?: string;
  /** The slots of the commander the task takes (a hold's span; the cost the card shows). */
  slots?: number;
  /** A hold card only: the commander is kept in her quarters with the lights out (the hold it starts is sensory). */
  sensory?: true;
  /** A `signed` task whose words were said: only the signature is left (R6). */
  said?: true;
  /** The scene with her that is open and would keep a `slot_with_her` task when it ends, and who else was in it (an `indifferent` holder's task kept before them may be seen, R9). */
  sceneId?: string;
  sceneWith?: string[];
  /** The day a verdict (kept or broken) was settled. */
  settledDay?: number;
  /** A routine only: the last day it was told (by a report or by `[ I DIDN'T ]`) that it was not done. The day step does not count that day as kept. */
  brokenDay?: number;
}

/** A ceremony's progress (R21): the step rows for her style by `order`, the ones done, the number the commander named, and `carried` once the punishment was carried out (a finished ceremony never reopens). */
export interface CeremonyState { steps: string[]; done: string[]; number?: number; carried?: true }

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
  /** Its slap was started: it has slapped, and nothing opens its slap again (`practice/slap_start` refuses). */
  slapped?: true;
  day: number;
  sceneId?: string;
  inverse?: Inverse;
  /** The request this card was written for (the key of its generation). */
  requestId?: string;
  /** The day the commander answered it (UNDO reads it, and the day step closes an accepted one the day after). */
  answeredDay?: number;
  /** Who watched it be carried out, when it was done in public (R8). */
  audienceIds?: string[];
  /** The scene in which the main model was told she carries it out (once: the scene it was answered in, or the first one with her after a DM answer). */
  voicedScene?: string;
}

/**
 * What an answer to her discipline put back besides the relation numbers (R8, UNDO): the status it had, her hold and favour before, her track xp before, how many
 * restrictions of hers there were and the cold shoulder and the hold she kept before, and the escalation request it made. `Inverse.practice` holds it; `revertInverse` does the axes
 * and `registerPracticeUndone`'s reader does this.
 */
export interface PracticeUndo {
  punishmentId: string;
  /** The status it had before the answer (`offered` or `negotiating`). */
  status: PunishmentStatus;
  hold: number;
  favour: number;
  tracks: Record<string, TrackState>;
  refusals: number[];
  contest: number[];
  /** The restrictions the answer added (UNDO takes out these rows, not whatever else was written since: another holder's), and her cold shoulder before (absent = none). */
  restrictionsAdded: PracticeState['restrictions'];
  cold?: number;
  /** Her domains and the day she last practised before the answer: a hold loss may cost a domain, a gain moves the day; UNDO puts both back. */
  domains: DynamicDomain[];
  lastPracticeDay: number;
  /** What the answer started that UNDO must end (filled by the tasks that start them: the hold of Task 25 and the slap of Task 33; `restorePractice` ends them). */
  startedHold?: true;
  slapId?: string;
  /** The answer let a slap land (it lands at once when no scene with her is open): the numbers it moved are not put back, so UNDO is refused. */
  struck?: true;
  /** What the answer wrote: the stress it gave the commander, the mark it set, the tasks (a confession) and the requests (a protocol, the escalation) it made. */
  commanderStress?: number;
  markSet?: true;
  taskIds?: string[];
  requestIds?: string[];
  escalationRequestId?: string;
  /** Where things stood when it was answered: UNDO is refused once any of them moved (a frame, a milestone or a claim offered, an injury, a run, a slot spent, the scene closed). */
  stamp: { day: number; slot: Slot; sceneId?: string; frame: Frame; milestones: string[]; claims: string[]; injuredUntil: number; expedition: string | null; lastExpedition: string | null };
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
  /** Who is on the card (they come into the scene: at most `cardsMax`, in the order of the card) and who is narrated as present at the stage. */
  audienceIds: string[];
  narrated?: string[];
  /** The location the scene is staged at and the slot it is staged for (the audience was read for that slot). */
  stage: string;
  slot?: Slot;
  day: number;
  /** The scene that holds it (set when a scene with her opens at the stage after GO); a scene that is aborted clears it and the card is offered again. */
  sceneId?: string;
  status: 'offered' | 'open' | 'done' | 'refused' | 'void';
  /** What it weighs (the refusal costs by it) and the seed and track it came from. */
  stakes?: Stake;
  tier?: 1 | 2 | 3 | 4 | 5;
  track?: string;
  seedId?: string;
  answeredDay?: number;
  observed?: string[];
  /** The request this card was written for (the key of its generation: a reroll while it is offered replaces the card). */
  requestId?: string;
}

/** A card a request was written as, in whichever list its kind keeps. */
export type PracticeCard = Task | OpenPunishment | OpenDemonstration;

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
  /** The hold task the commander accepted that started it (settled when the hold ends), and whether the hold is her punishment (a threat source, R18). */
  taskId?: string;
  punitive?: true;
  /** She forgot the commander once already (it happens at most once a hold, R11). */
  forgot?: true;
  /** The commander defied it: the end gives no xp and no hold. */
  defied?: true;
  /** The bookings of others it made lapse (UNDO of the answer that started it puts them back). */
  lapsedIds?: string[];
  /** The missions whose deadline already raised an alarm during this hold (once per mission). */
  alarmed?: string[];
  /** The item of the blocking that darkens the commander's sight during a sensory hold (it comes off with the hold). */
  eyes?: string;
}

export interface OpenAlarm {
  id: string; holderId: string; kind: AlarmKind; day: number; slot: Slot; answer?: AlarmAnswer; argued?: true;
  /** The commander said ACCEPT to a `keep` (the hold stands; sending the squad without the commander is still possible while the alarm is open). */
  accepted?: true;
  payload?: unknown;
}

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
  /**
   * The slap that is open (R21): her time allowed in milliseconds, the feints she will make, whether others see it, the punishment it belongs to (a flinch may add to its count) and whether
   * it is the second (`again`: `cruel` slaps once more after a flinch, never twice) or came with no warning (`unannounced`, after a slip). `sceneId` is the scene the commander braces in.
   */
  slap?: { id: string; holderId: string; sceneId?: string; windowMs: number; feints: number; public?: true; punishmentId?: string; again?: true; unannounced?: true };
  /** holderId → the days of her offences (the repeat count). */
  offences: Record<string, number[]>;
  /** The offences already entered today (`holderId|kind|ref`): an offence is noted once per ref and day. Reset when the day changes. */
  noted?: { day: number; keys: string[] };
  records: Array<{ day: number; holderId: string; line: string }>;
  /** What the commander has put in a holder's hands (R17): the kind, whose, and the last day it stands (a calendar's last day is the last day she fills; a device or a key's is the last day she has it). */
  handovers: Array<{ id: string; kind: HandoverKind; holderId: string; untilDay: number; days?: number; taskId?: string }>;
  asked?: { context: 'dilemma' | 'expedition' | 'vote'; ref: string; index: number | 'for' | 'against' | null; holderId: string; preselected?: true };
  /** holderId → the unfairness she has in hand (R16): the kind, the day it was decided, whether it is used up, and for a double standard the scene that carries it. */
  unfair?: Record<string, { kind: UnfairKind; day: number; used?: true; sceneId?: string }>;
  lastThreat?: { unitId: string; sceneId?: string; exchange: number; day: number };
  /** holderId → the scene id that already got a verdict. */
  verdictScene?: Record<string, string>;
  /** holderId → what she has seen of the commander's service in the open scene (R10); gone with the scene. */
  service?: Record<string, SceneService>;
  /** A protocol rule she relaxed for a day (a kindness): put back the day after. */
  relaxed?: Array<{ ruleId: string; day: number }>;
  /** holderId → her next punishment weighs one less (a kindness); used once. */
  softer?: Record<string, true>;
  /** unitId → the day the commander last asked her for a task or a punishment (R15: once a day per woman). */
  askedOn?: Record<string, number>;
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
  /** A third party the task involves (a living named unit other than her): the card may name one, or a roster or scene check does. */
  targetUnitId?: string;
  text: string;
  summary: string;
}

/** An offence in a few words, for the model's input (R5: no number, no id). */
export const OFFENCE_WORDS: Readonly<Record<OffenceKind, string>> = Object.freeze({
  task_broken: 'a task she gave was not kept', rule_broken: 'a rule of hers was broken', protocol_slip: 'a rule of address slipped', denial_broken: 'something that needed her permission was done without it',
  refusal: 'the commander refused her', milestone_refused: 'the commander refused what she offered', countermand_overruled: 'the commander overruled her call', physics_slip: 'the commander slipped in what she held',
  physics_caught: 'the commander was caught cheating at what she held', posture_slip: 'the commander slipped out of a posture', false_report: 'a report the commander made turned out false', asked: 'the commander asked for it',
  unfair: 'nothing the commander did', hold_defied: 'the commander defied her hold',
});

/** How hard a punishment weighs, as a word (the card and the model never see the number): 1 to 2 light, 3 heavy, 4 to 5 harsh. */
export function severityWord(severity: number): 'light' | 'heavy' | 'harsh' {
  return severity <= 2 ? 'light' : severity === 3 ? 'heavy' : 'harsh';
}

/**
 * What one holder has seen of the commander's service in the scene she is in (R10): the judged pair that last ran (her activity and the commander's: whether it fits and whether it is felt
 * as she wishes), the verdict the model reported (it lands at the scene's end, and only when no pair ran), and how many steps up anticipation takes the verdict.
 */
export interface SceneService { sceneId: string; pair?: { fit: boolean; felt: boolean }; said?: Verdict; bonus: number; anticipated?: true }

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
