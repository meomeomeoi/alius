/**
 * P15a: the scene blocking as STATE (a leaf: types and pure helpers, no engine imports). One record per person present, the commander
 * included. A field that is unset is not shown and means nothing; `activity` reads as `attending` when unset but that default is
 * never rendered (plan R6).
 */
import type { WornSlot } from './types';

export { WORN_SLOTS, type WornSlot } from './types';

/** The key of the commander in `scene.blocking` and in a change's `person`. */
export const COMMANDER = 'commander';

export const INTIMACIES = ['none', 'close', 'intimate', 'explicit'] as const;
export type Intimacy = (typeof INTIMACIES)[number];

/** The P15 frame of a relationship (`equal` until P15 plugs a reader in). */
export const FRAMES = ['equal', 'play', 'role', 'rule'] as const;
export type Frame = (typeof FRAMES)[number];
export const frameRank = (f: Frame): number => FRAMES.indexOf(f);

export interface BlockingContact {
  id: string;
  /** The other party: the actor, since the record sits on the receiver. */
  with: string;
  /** `from`: a soldier acts on the commander; `to`: the commander acts toward a soldier. */
  direction: 'from' | 'to';
  /** The worship target, when the contact has one. */
  target?: string;
  /** The exchange it was set in. */
  since: number;
  /** What `implies` replaced, so removing the contact puts the anchors back. */
  prev?: Record<string, { posture?: string; anchor?: { id: string; relTo?: string } }>;
}

export interface Blocking {
  posture?: string;
  anchor?: { id: string; relTo?: string };
  contact?: BlockingContact;
  worn?: Partial<Record<WornSlot, { id: string; since: number }>>;
  activity?: string;
  intimacy?: Intimacy;
  note?: string;
}

/** The state before a change to the blocking (or the moments), kept so a swipe or an edit can take the change back (plan R7). */
export interface StagingSnapshot {
  /** The chat index the change was made at. */
  at: number;
  blocking: Record<string, Blocking>;
  moments?: unknown;
}

export const NOTE_MAX = 120;
