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
export const INPUT_KINDS = ['breathe', 'hold', 'release', 'mouth_breath', 'gap_breath', 'shift_weight', 'part', 'ask_rest', 'strain', 'uneven', 'inhale', 'scatter', 'bite', 'relieve', 'fidget', 'wipe', 'spit', 'swallow', 'spill'] as const;
export type InputKind = (typeof INPUT_KINDS)[number];
/**
 * One input of a beat. `amount` (P10e-e R1, ≥ 0) is absent for every input of the turn-based card and means, per kind: `breathe`, the share of
 * the opening held (R14: credit `caught × amount`, at most `caught`); `strain` (R15: holding on past an opening, or pressing before it), 0.5
 * held past 150 ms, 1 held past 450 ms (she noticed); `uneven` (R16: weight held off level), the mean extra drain factor of the beat
 * (`1.2·max(0, |err| − tol/2)`), costing `drain × amount` (absent or 0: nothing); with `part: 'tilted'` (Ruling S) the beat ended held but
 * off level, which a shift on it or the next beat reads as uneven (it is never a slip: the tilt costs only as drain). `inhale` (R18: scent's
 * head), the words a breath left in the head this beat, each worth the gauge's capacity over the head's (`headCapacity`); a segment that holds
 * any `inhale` fills by them alone. `mouth_breath` with `amount` (R18), the words blown out of the head (absent: the card's flat cost). Ruling AE:
 * an instrument decides its own `shift_weight` and `mouth_breath` at once (`physics/relief`, one draw) and marks the segment input with `part`:
 * `shift_weight` `free` (not caught: the relief) or `caught` (weight.html: 10 strength off and her heavier lean, 1.5 for 3 beats), and
 * `mouth_breath` `decided` (its catches are already made); a marked input is never rolled again at the segment's end. Unmarked (the card,
 * turn-based): as before, `cheatRoll` at the segment's end. `scatter` (Ruling U), the words that left the
 * head without the mouth (a cough, the overflow's recovery, an answer's spent words): the fill falls by as many words; no relief, nothing else.
 * `bite` (R21: the jaw), the beat's mean cost factor of the opening (jaw.html's `G.cost`: about ⅓ resting on her toes or the ring, 1 at her
 * band's top, more wide open); a gesture segment that holds any costs `jaw.per × amount` a beat instead of the flat `jaw.per`. With
 * `part: 'teeth'` (R22) it is a touch of the teeth on her: a slip, never a cost. `relieve` and `fidget` (R27, Rulings X and Y) are not
 * segment inputs: her frame reports them through `physics/relief` (`amount` loudness × (1 − cover), `part` its visibility), decided at once.
 * `wipe` (R29: shoe service) carries the zone it wiped (`part`) and the share of the whole footwear's dirt mask it took off (`amount`); a segment
 * that holds any wipe follows the mask (−100 × amount a wipe, one a beat) instead of the right or wrong part. `spit` (R31, Ruling AC) is not a
 * segment input: the instrument reports it through `physics/spit`, decided at once (one draw, shoe.html's chances; seen, `physics_caught`).
 * `swallow` (R32: gulp) carries the mouth the beat's swallows took (`amount`, in mouthfuls: a full mouth is 1) and `spill` the mouthfuls
 * spilled (an overflow, a cough); a segment that holds either follows the mouth (the plan's `flow` in, the swallows and spills out, × the
 * capacity) instead of the windows. A spill is a slip, counted as gulp.html counts it: `part` `overflow` or `cough` begins one (absent:
 * one too), `part: 'more'` is an overflow running on (its amount only); what was spilled is carried on the run (`gulp`) to her flow's end.
 */
export interface SegmentInput { beat: number; kind: InputKind; atMs?: number; part?: string; amount?: number }

/**
 * P10e-e Rulings X, Y and AE: what an instrument sends with `physics/relief` (the run id and the beat are the staging's): a relief of the body
 * in her frame (`relieve`, `fidget`: `amount` loudness × (1 − cover), `part` its visibility, `involuntary` the body giving way), the commander's
 * own shift of weight (`shift_weight`; `part: 'away'` while she is out of the room) or a mouth breath's blown word (`mouth_breath`, `amount` its
 * loudness). `attention` is hers as the instrument shows it, read only between segments.
 */
export interface ReliefReport { kind: 'relieve' | 'fidget' | 'shift_weight' | 'mouth_breath'; amount?: number; part?: string; involuntary?: boolean; attention?: string }

/** P10e-e R22: her orders in the jaw (her toes: `deeper`, `pull_back`, `suck`, `wider`; the ring: `wider`). Each is a cue kind of the same name. */
export const JAW_ORDERS = ['deeper', 'suck', 'wider', 'pull_back'] as const;
export type JawOrder = (typeof JAW_ORDERS)[number];

export interface PlannedBeat {
  /** An opening of her rhythm (the chance to breathe): how wide it is, and whether it is false (open and shut at once). */
  opening?: { widthMs: number; false?: true };
  cue?: CueKind;
  /** The part she wants next (a tongue work: `TUNING.physics.tongue.parts`). */
  part?: string;
  /** A shift of her weight: how much it costs when the hold was uneven. */
  shift?: number;
  /**
   * P10e-e R22 (the jaw, real time): her move on this beat, planned by hash (R3), spaced as jaw.html's `STYLES[].every`. `order` is her order
   * (its cue is the same kind); `orderMs` how long a `suck` or a `wider` lasts (the prototype's 4–7 s and 3–5 s; absent for an instant one);
   * `ask` her question through the ring (no cue: her words and the word she wants are the instrument's, from her voice).
   */
  order?: JawOrder;
  orderMs?: number;
  ask?: true;
  /**
   * P10e-e R32 (gulp, real time): her flow on this beat, planned by hash (R3) from her style's row (`TUNING.physics.gulpFlow`): `level` in
   * mouths a second (her base with its wander, × her surge on a surge beat, 0 in a pause), `surge` a surge lands on this beat, `warn` her
   * warning sounds at this beat's end (the stream rising her row's `warn` ms before the next beat; with no surge on it, a feint), `pause` she
   * pauses. The instrument plays it; a reading never shows it.
   */
  flow?: { level: number; surge?: true; warn?: true; pause?: true };
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
  /** P10e-e R32: a gulp's spills (each a slip, counted apart from `slips`: the overflows and the coughs). */
  spills?: number;
  /**
   * P10e-e (final review, Minor 4): the reliefs she caught in this stretch (at the segment's end, or at once: Rulings Y, AC, AE), so the
   * running directive names a relief only once she perceived it. Absent when she caught none.
   */
  cheats?: number;
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
  /** Ruling W: buckles of a weight inside her frame (the strength back to 35 each). */
  buckles?: number;
  /** P10e-e R32: the mouthfuls spilled in a segment that followed the mouth, and how many spills (absent when none). */
  spilled?: number;
  spills?: number;
}

/** The state of the second physics of a hold (plan R13): its own gauge, seal and streak, on the same beats as the first. */
export interface PhysicsCore {
  physicsId: string;
  /** Ruling W: buckles of the weight inside her frame (three end it). */
  buckles?: number;
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
  /** P10e-e R24: `activity` is the frame of her time (`sourceId` her blocking activity), started from the blocking by `her_activity`. */
  sourceKind: 'contact' | 'item' | 'activity';
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
  segment: {
    n: number; state: 'running' | 'held'; plan?: SegmentPlan; /** Beats whose inputs lapsed because a message was typed (turn-based). */ lapsed?: number[];
    /** P10e-e Ruling AE: reliefs decided at once (Rulings Y, AC, AE) that she caught while this segment ran (absent: none); read at its end. */
    caughtNow?: number;
  };
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
   * Ruling U: the scent instrument reports the head as the gauge (a decision segment held an `inhale`): the prototype never ends on the head
   * ("lost in her" is a play state), so the fill never ends the hold at a boundary (`releaseOf` answers `continue`). Absent: as before.
   */
  headed?: true;
  /**
   * P10e-e R28: her frame ended forgotten (presence `use` in its last phase): she left and the commander stays posed; nothing more is planned
   * until `physics/get_up`, `physics/found` or the stop word ends it. Absent: as before.
   */
  forgotten?: true;
  /**
   * P10e-e R32: a gulp the instrument reports (a segment held a swallow or a spill): the mouthfuls spilled over her flow. Such a run never
   * ends by its fill (the prototype overflows and spills; Ruling U's shape); at her flow's end (her volume) it chains to the cleaning at
   * `100 × spilled` when she makes the commander clean (her row's `check`, over `cleanFrom`), else it is released. It stays on the run after
   * the chain: that floor is the gulp's own cleaning (the gulp instrument draws it), checked at its segment's end. Absent: as before.
   */
  gulp?: { spilled: number };
}

export const GAUGE_FULL = 100;
