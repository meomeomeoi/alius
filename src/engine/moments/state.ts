/**
 * P15a: the moments of a scene as STATE (a leaf: types and a reader, no engine imports). A moment is a point of tension with three
 * engine-owned options; the model writes their words (`labels`) and the engine never reads them (plan R10).
 */
import type { ResponseType } from '../blocking/types';

/** The keys an option can have: the frame's three, and the three additions (`lock`, `look`, `ally`). */
export type OptionKey = '0' | '1' | '2' | 'lock' | 'look' | 'ally';
export interface MomentOption { key: OptionKey; type: ResponseType }

export interface OpenMoment {
  /** `m<n>`: the answer must name it, so a stale chip is refused. */
  id: string;
  sourceId: string;
  /** The exchange it fired in. */
  exchange: number;
  options: MomentOption[];
  /** The model's words for the three frame options, in order (stored, shown, never read by the engine). */
  labels?: string[];
  /** The label of the blocking element that may give the commander away (named for `third_party`, `remote`). */
  exposing?: string;
  visitorId?: string;
  /** The fact `memory_surfaces` brings up. */
  factId?: string;
  /** Whose moment it is. */
  unitId: string;
  /** Moment passes since it fired without an answer (it lapses after `TUNING.moments.lapseExchanges`). */
  passes?: number;
}

export type Gap = 'matched' | 'partial' | 'opposite';
export interface AnswerRecord {
  momentId: string;
  sourceId: string;
  unitId: string;
  key: OptionKey;
  type: ResponseType;
  gap: Gap;
  via: 'chip' | 'text';
  tone?: string;
  exchange: number;
  escalated?: boolean;
  verb?: string;
}

/** What the last pass saw of a soldier (a change from it is the `mood_jump` source). */
export interface SeenMood { stress: string; want?: string; vitals?: string }

export interface MomentsState {
  open?: OpenMoment;
  fired: Array<{ sourceId: string; exchange: number }>;
  seen?: Record<string, SeenMood>;
  lastAnswer?: AnswerRecord;
}

const EMPTY: Readonly<MomentsState> = Object.freeze({ fired: Object.freeze([]) as unknown as MomentsState['fired'] });

/** What a scene stores (nothing stored = the empty state). Never mutate the result. */
export function momentsOf(scene: { moments?: MomentsState } | undefined | null): Readonly<MomentsState> {
  return scene?.moments ?? EMPTY;
}
