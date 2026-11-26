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
export const INPUT_KINDS = ['breathe', 'hold', 'release', 'mouth_breath', 'gap_breath', 'shift_weight', 'part', 'ask_rest', 'strain', 'uneven', 'inhale', 'scatter'] as const;
export type InputKind = (typeof INPUT_KINDS)[number];
/**
 * One input of a beat. `amount` (P10e-e R1, ≥ 0) is absent for every input of the turn-based card and means, per kind: `breathe`, the share of
 * the opening held (R14: credit `caught × amount`, at most `caught`); `strain` (R15: holding on past an opening, or pressing before it), 0.5
 * held past 150 ms, 1 held past 450 ms (she noticed); `uneven` (R16: weight held off level), the mean extra drain factor of the beat
 * (`1.2·max(0, |err| − tol/2)`), costing `drain × amount` (absent or 0: nothing); with `part: 'tilted'` (Ruling S) the beat ended held but
 * off level, which a shift on it or the next beat reads as uneven (it is never a slip: the tilt costs only as drain). `inhale` (R18: scent's
 * head), the words a breath left in the head this beat, each worth the gauge's capacity over the head's (`headCapacity`); a segment that holds
 * any `inhale` fills by them alone. `mouth_breath` with `amount` (R18), the words blown out of the head (absent: the card's flat cost). `scatter` (Ruling U), the words that left the
 * head without the mouth (a cough, the overflow's recovery, an answer's spent words): the fill falls by as many words; no relief, nothing else.
 */
export interface SegmentInput { beat: number; kind: InputKind; atMs?: number; part?: string; amount?: number }

export interface PlannedBeat {
  /** An opening of her rhythm (the chance to breathe): how wide it is, and whether it is false (open and shut at once). */
  opening?: { widthMs: number; false?: true };
  cue?: CueKind;
  /** The part she wants next (a tongue work: `TUNING.physics.tongue.parts`). */
  part?: string;
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

/** The scent bands (plan R13); the saturation physics reads them. */
export type ScentBand = 'faint' | 'noticeable' | 'strong' | 'overwhelming';

/** What a segment came to once the inputs were resolved (pure: no draw). The gauge is the run's new gauge; the rest feed the summary, xp and the boundary. */
export interface SegmentResult {
  gauge: number;
  caught: number;
  missed: number;
  falseTaken: number;
  slips: number;
  gasps: number;
  reliefs: number;
  /** The relief inputs that were taken (a cheat on a watching beat is rolled at the boundary). */
  reliefInputs: Array<{ beat: number; kind: InputKind }>;
  /** Caught openings in a row at the end (carried into the next segment) and how many of them came after the third. */
  streak: number;
  streakBonus: number;
  warning: boolean;
  checked: boolean;
  complete: boolean;
  degraded: boolean;
  askedRest: boolean;
  restGranted: boolean;
  beatsRun: number;
  cues: CueKind[];
  noise: number;
  /** The dryness of a mouth after licking (absent unless the run tracks it). */
  dryness?: number;
  /** P10e-e R15: strains resolved (each drained its beat twice) and those she noticed (absent when none). */
  strains?: number;
  noticed?: number;
}

/** The state of the second physics of a hold (plan R13): its own gauge, seal and streak, on the same beats as the first. */
export interface PhysicsCore {
  physicsId: string;
  gauge: number;
  capacity: number;
  sealRange?: Seal[];
  seal?: Seal;
  pressure?: number;
  streak: number;
}

/** A hold of an hour of fiction or more (plan R13): phases of a few segments, the stretch between them resolved by a strategy, a fiction clock. */
export interface MarathonState {
  hours: number | 'unknown';
  /** The phase being played (1-based) and how many there are (hidden from the player when the length is unknown). */
  phase: number;
  phases: number;
  /** Segments played in this phase. */
  segmentsDone: number;
  /** The fiction clock, in minutes since midnight, and where it began. */
  clockMin: number;
  startMin: number;
  /** The phase is over and the player has not yet chosen how to spend the stretch. */
  waiting: boolean;
  /** Added to the next stretch's chance to endure (a strategy of sparing strength). */
  spare?: number;
  /** What the last stretch came to, in words. */
  summary?: string;
}

export interface PhysicsRun {
  /** `p<n>`: a late `segment_end` for another run is refused. */
  id: string;
  physicsId: string;
  sourceKind: 'contact' | 'item';
  sourceId: string;
  holderId: string;
  /** The worship target of the contact the run started from (read when it starts, because the contact is gone when the run ends): P15 counts the act on it (mastery). */
  targetId?: string;
  gauge: number;
  capacity: number;
  /** The seals the source allows, loosest first, and the one she is using. */
  sealRange?: Seal[];
  seal?: Seal;
  pressure?: number;
  /** Her pattern moved on (a change of rhythm): added to the personal offset when the next segment is planned. */
  rhythmShift?: number;
  /** `held`: the body waits in a neutral state (nothing drains) until the next segment starts. */
  segment: { n: number; state: 'running' | 'held'; plan?: SegmentPlan; /** Beats whose inputs lapsed because a message was typed (turn-based). */ lapsed?: number[] };
  startedExchange: number;
  /** Taps that a `limit` holder ignored. */
  taps: number;
  /** Caught openings in a row. */
  streak: number;
  /** Segments added by a slip (a weight slip makes the hold last longer). */
  extend: number;
  last?: SegmentSummary;
  /** A second physics on the same beats (a contact that names two, or her escalation): the inputs merge by rule (`combined.ts`). */
  second?: PhysicsCore;
  /** A marathon: how long it lasts in the fiction (`unknown`: nobody says). Absent = an ordinary hold. */
  duration?: { hours: number } | 'unknown';
  marathon?: MarathonState;
  /** The mouth act this run is (`lick`, `mouth`, `long`, `pet`); absent for a run that came with a contact or an item. */
  act?: string;
  /** A licking run's dryness, 0–100: from 100 a right order takes off only what a wrong one does. */
  dryness?: number;
  /** The capacity a marathon started with (attrition takes from it phase by phase). */
  baseCapacity?: number;
  /**
   * P10e-e R28: what the segments resolved, counted over the run (`caught`, `missed`, `falseTaken`, `strains`, `noticed`, `slips`, `gasps`,
   * `cheatsCaught`; a key is absent while 0, the whole record until a segment resolved something). Only what she perceived: a relief she did not
   * catch is not counted. `physics_outcome` carries it, and the end's directive says it in one sentence.
   */
  tally?: Record<string, number>;
  /**
   * Ruling U: the scent instrument reports the head as the gauge (a decision segment held an `inhale`): a full head is "lost in her", which
   * the commander recovers from, so a spent gauge is never a broken limit, a collapse or a blackout (she lets go). Absent: as before.
   */
  headed?: true;
}

export const GAUGE_FULL = 100;
