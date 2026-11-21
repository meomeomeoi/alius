/**
 * P15a: contact physics as STATE (a leaf: types and tiny helpers, no engine imports). One run per scene; the engine owns every number and
 * the model only narrates what a segment summary says (plan R12, R13). Everything optional here is optional in old saves.
 */
import type { CueKind, Seal } from '../blocking/types';

/** The style keys a holder's physics style may take (P15 plugs the reader in; `neutral` until then). */
export const STYLE_KEYS = [
  'neutral', 'affectionate', 'cold', 'ritual', 'clinical', 'possessive', 'playful', 'cruel', 'obsessive', 'drill', 'regal', 'vindictive',
] as const;
export type StyleKey = (typeof STYLE_KEYS)[number];

export interface PhysicsStyle { primary: StyleKey; secondary?: StyleKey; phaseLead?: 'primary' | 'secondary' }
export type HoldsUntil = 'signal' | 'limit' | 'blackout';
export type Attention = 'watching' | 'glancing' | 'busy';

/** What the player does in a beat (`SegmentInput.kind`). */
export const INPUT_KINDS = ['breathe', 'hold', 'release', 'mouth_breath', 'gap_breath', 'shift_weight', 'part', 'ask_rest'] as const;
export type InputKind = (typeof INPUT_KINDS)[number];
export interface SegmentInput { beat: number; kind: InputKind; atMs?: number; part?: string }

export interface PlannedBeat {
  /** An opening of her rhythm (the chance to breathe): how wide it is, and whether it is false (open and shut at once). */
  opening?: { widthMs: number; false?: true };
  cue?: CueKind;
  /** A shift of her weight: how much it costs when the hold was uneven. */
  shift?: number;
  attention: Attention;
}
/** The plan of one segment, drawn once at its start and stored in the run; the UI plays it and a reading never shows it. */
export interface SegmentPlan { beats: PlannedBeat[] }

export type Outcome = 'released' | 'checked' | 'limit_broken' | 'blackout' | 'stopped' | 'collapse';

/** What a segment came to (the numbers stay in the engine; the words go to the directive). */
export interface SegmentSummary {
  caught: number;
  missed: number;
  falseTaken: number;
  slips: number;
  gasps: number;
  reliefs: number;
  /** The loudest noise of the segment, 0 when quiet. */
  noise: number;
  /** The cue kinds that were fired, in order. */
  cues: CueKind[];
  /** Her move at the boundary: `press`, `lift`, `rhythm`, `asleep`, `forgets`, `release` or none. */
  move?: string;
  /** The gauge crossed `TUNING.physics.warning`. */
  warning?: boolean;
}

export interface PhysicsRun {
  /** `p<n>`: a late `segment_end` for another run is refused. */
  id: string;
  physicsId: string;
  sourceKind: 'contact' | 'item';
  sourceId: string;
  holderId: string;
  gauge: number;
  capacity: number;
  /** The seals the source allows, loosest first, and the one she is using. */
  sealRange?: Seal[];
  seal?: Seal;
  pressure?: number;
  /** `held`: the body waits in a neutral state (nothing drains) until the next segment starts. */
  segment: { n: number; state: 'running' | 'held'; plan?: SegmentPlan };
  startedExchange: number;
  /** Taps that a `limit` holder ignored. */
  taps: number;
  /** Caught openings in a row. */
  streak: number;
  /** Segments added by a slip (a weight slip makes the hold last longer). */
  extend: number;
  last?: SegmentSummary;
  /** A marathon: how long it lasts in the fiction (`unknown`: nobody says). Absent = an ordinary hold. */
  duration?: { hours: number } | 'unknown';
}

export const GAUGE_FULL = 100;
