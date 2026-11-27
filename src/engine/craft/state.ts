/**
 * The leaf of the craft (P16b, plan Task 1): the closed vocabularies, the shape of `Commander.craft` and `Relation.craft`, the engine event
 * list and the one source of chances (`craftRoll`). It imports only types and `practice/state.ts` (itself a leaf), so the state types can
 * name it without a cycle. Whether the craft is live and the writers are in `gate.ts`, `book.ts` and the files beside them.
 *
 * Nothing here draws from the campaign's rng: every chance is `craftRoll` (a `practiceRoll` with a `craft:` key) and every pick is an index
 * into a registry-ordered list by `Math.floor(craftRoll x n)`.
 */
import { practiceRoll } from '../practice/state';
import type { CampaignState } from '../state/types';

/** The commander's disciplines of the craft (spec section 2); the endurance of each physics is `endurance:<physicsId>` and lives in `Commander.endurance`. */
export const DISCIPLINES = ['stillness', 'posture', 'rhythm', 'memory', 'composure', 'speech', 'pain', 'depth'] as const;
export type Discipline = (typeof DISCIPLINES)[number];

/** A key of the book: a discipline, or the endurance of one contact physics. */
export type CraftKey = Discipline | `endurance:${string}`;

/** The prefix of an endurance key. */
export const ENDURANCE_PREFIX = 'endurance:';

/** The physics id of an `endurance:<id>` key, or `null` for any other key. */
export function enduranceOf(key: string): string | null {
  return key.startsWith(ENDURANCE_PREFIX) ? key.slice(ENDURANCE_PREFIX.length) : null;
}

/** One discipline of the commander: xp, level 0-5, and the day it was last used (the decay's clock). For `endurance:*` only `lastDay` is kept here (xp and level stay in `Commander.endurance`). */
export interface CraftEntry {
  xp: number; level: number; lastDay: number;
  /** The day the decay last took a step (its clock restarts there; `lastDay` stays the last use). */
  decayedDay?: number;
  /** The day a drill of this key last paid (a drill is full xp once a day per key; the decay's `lastDay` is any use, so it cannot say). Not kept for `endurance:*`: P15a's `trainedDay` says it. */
  drillDay?: number;
}

/** The level words, from untrained to masterful (ruling 8; they replace `ENDURANCE_WORDS`). */
export const CRAFT_WORDS = ['untrained', 'raw', 'practised', 'steady', 'seasoned', 'masterful'] as const;
export type CraftWord = (typeof CRAFT_WORDS)[number];

/** The word of a level 0-5 (clamped). */
export const craftWord = (level: number): CraftWord => CRAFT_WORDS[Math.max(0, Math.min(CRAFT_WORDS.length - 1, Math.floor(level)))]!;

/** What the pair has learnt of one thing (a posture, her rhythm, her routine): xp, the last day it was used, and the day the decay last took a step. */
export interface Known { xp: number; day: number; decayedDay?: number }

/** What the pair keeps of the craft (spec sections 2, 4, 7, 8, 10, 11). Every field is optional and absent until something is written. */
export interface RelationCraft {
  /** Postures learnt with her: xp and the last day, by preset id. */
  postures?: Record<string, Known>;
  /** Her personal rhythm, learnt by the commander. */
  rhythm?: Known;
  /** Her foot signals: named once, then answered or missed, by motion. */
  signals?: Record<string, { named: boolean; answered: number; day: number; decayedDay?: number }>;
  /** Her routine, learnt by the commander. */
  routine?: Known;
  /** Records in seconds of fiction time, by physics or posture key: the longest hold, the longest without a slip, the longest without a tap, and the day the last one was set. */
  records?: Record<string, { longest: number; clean: number; noTap: number; day: number }>;
  /** Her settling-in count (hidden): clean holds in a row, by kind. */
  streak?: Record<string, number>;
  /** The slips of the scene still waiting for her discipline (a lesson is earned by a slip her punishment or her named point followed): the key they teach, the scene and the day. */
  slips?: Array<{ key: string; scene: string; day: number }>;
  /** The point she names after a slip (hidden until she says it): the engine's word for what failed and her way of saying it, voiced once in the reply of this exchange. */
  lesson?: { point: string; words: string; joke?: true; scene: string; exchange: number };
  /** A partner drill waiting for its scene (spec section 5, ruling 3): the key, the multiplier of the partner (x1.5 a holder, x1.2 another close woman) and the day. Only the open scene's: dropped when it ends or is cancelled. */
  drillPending?: { key: string; mult: number; day: number; /** The run `craft/drill_start` began (the outcome that pays is this one's). */ runId?: string };
  /** The service the commander just anticipated for her (`craft/anticipate`): the scene, the exchange it was staged in and the activity, until her next reply has passed. */
  anticipate?: { scene: string; exchange: number; activityId: string };
  /** The day a foot or shoe service of the commander last pleased her (a pleased verdict): her feet are cared for until her next run (`feet.ts`). */
  footCare?: { day: number };
  /**
   * What the commander did for her unasked in the last `care.keepDays` days (`care/unasked`): the day, the care (a blocking activity with a `care` field) and whether she noticed it
   * (hidden until she shows it). `voiced` is set when it landed (she showed it, in the scene `scene` or in a DM), `named` when it was the care that let her name the service.
   */
  cares?: Array<{ day: number; careId: string; noticed: boolean; voiced?: true; named?: true; scene?: string }>;
  /** The day the commander last shared a drill with her (a partner drill: a scene or not): another holder's jealousy reads it (`exchange.ts`). */
  partnerDay?: number;
}

/**
 * One hold of a posture (P16b, Task 11; `practices.postureRun`, one at a time): she has the commander in a preset, the instrument plays the drift in real time and reports the corrections and the
 * slips, the engine keeps the count. `startedAt` is the scene's exchange when it began and `present` who was in the room then (the temptations are what happened since). `beats` is what the
 * instrument reports it ran (fiction time is counted from beats, never from the clock); `until` is the planned length in beats, kept hidden while `hidden` is set (no duration); `source` is who
 * asked for it (`take`, `her_call`, `drill`, P17g's `attendance`). `clean` is how many beats since its last slip (the streak the settling-in count reads).
 */
export interface PostureRun {
  id: string;
  holderId: string;
  presetId: string;
  startedAt: number;
  present: string[];
  beats: number;
  slips: number;
  corrections: number;
  /** Corrections that were loud, and the fidgets she saw (every third one is a slip). */
  loud?: number;
  fidgets?: number;
  until?: number;
  hidden?: true;
  source: string;
  /** The preset her style added to the hold (the settling-in load): `new_posture` etc., hidden. */
  load?: string;
}

/**
 * Every engine event of the package. The schema reserves them (content may not `emit_event` one) and the craft controller refreshes its
 * directives on each. `posture_slip` stays P16's event; the craft's note of it is `posture_slip_noted`.
 */
export const CRAFT_EVENT_TYPES = [
  'craft_xp', 'craft_level', 'lesson', 'record_set', 'posture_taken', 'posture_slip_noted', 'posture_corrected', 'posture_ended', 'drill_done',
  'exam_passed', 'exam_failed', 'care_unasked', 'foot_signal_given', 'foot_signal_missed', 'praise_missed',
  'sentence_set', 'sentence_extended', 'sentence_served', 'headlock_offered', 'norm_set',
] as const;
export type CraftEventType = (typeof CRAFT_EVENT_TYPES)[number];

/**
 * A chance in [0, 1) that belongs to one unit, one key and the day: `practiceRoll(state, unitId, 'craft:' + key)`. It draws nothing from
 * `state.rng`, so a campaign without the craft keeps its rng. A pick is an index into a registry-ordered list by `Math.floor(craftRoll x n)`.
 */
export function craftRoll(state: Pick<CampaignState, 'dynamic' | 'day'>, unitId: string, key: string): number {
  return practiceRoll(state, unitId, `craft:${key}`);
}

/** "45 seconds", "12 minutes", "2 hours 5 minutes": a span of fiction time in words, for a fact or a margin line. */
export function spanText(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 90) return `${s} second${s === 1 ? '' : 's'}`;
  const m = Math.round(s / 60);
  if (m < 120) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.floor(m / 60), r = m % 60;
  return r === 0 ? `${h} hours` : `${h} hours ${r} minutes`;
}
