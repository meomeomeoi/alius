/**
 * The leaf of the dynamic (P15, plan R3, R7): the shape of `state.dynamic` and of `Relation.dynamic`, and the two pure readers
 * (`dynamicOf`, `dynamicHash`). It imports only types, so the state types can name it without a cycle. Whether the dynamic is on, who
 * may hold and the writers are in `gate.ts`.
 */
import type { CampaignState } from '../state/types';
import type { OpenOverride } from '../warden/state';
import type { ResponseType } from '../blocking/types';
import type {
  AftermathKind, Frame, Frequency, HolderCap, KnowledgeLevel, MayHold, MilestoneOffer, Motive, OfferAnswer, OfferTab, Pace, RegionRank, Sensitivity, StartFrame,
} from './types';

/** What the setup says about one unit (R3). Every field is absent for the default. */
export interface UnitDynamicSetup {
  mayHold?: MayHold;
  sensitivity?: Sensitivity;
  seeded?: true;
  startFrame?: StartFrame;
}

export interface DynamicSetup {
  holders: HolderCap;
  pace: Pace;
  frequency: Frequency;
  units: Record<string, UnitDynamicSetup>;
}

/** Her reading of the commander's position (R10). `region` is derived (`regionOf`); it is stored for the hysteresis. */
export interface HerReading {
  /** Readiness: −1 (resists) … 1 (yields). */
  r: number;
  /** Friction: −1 … 1. */
  f: number;
  /** How much she believes it, 0–1. */
  p: number;
  /** What she thinks drives the commander; sums to 1. */
  motive: Record<Motive, number>;
  flat: number;
  deflect: number;
  /** The share of `sincere` tones (absent until the first toned answer; `clinical` values it, R10). */
  sincere?: number;
  region: RegionRank;
  pending?: { region: RegionRank; count: number };
  updates: number;
}

export interface DynamicDomain { id: string; since: number; partialUntil?: number }
export interface TrackState { xp: number; level: 0 | 1 | 2 | 3 | 4 | 5 }

export interface AftermathState {
  id: string;
  kind: AftermathKind;
  /** The stage that is running (index into the entry's `stages`). */
  stage: number;
  /** The day the aftermath ends (the end of its last stage). */
  untilDay: number;
  /** The day the running stage ends. */
  stageUntil?: number;
  /** The kind that follows (`chainsTo`), picked at the start or at the end. */
  chain?: AftermathKind;
  /** The exit was forced (every weight ×1.5 at the pick; kept for the stage effects). */
  forced?: true;
  /** `command_kept`: the votes the commander's side has won so far (`TUNING.dynamic.commandBackVotes` ends the struggle). */
  struggleWins?: number;
}

/** What a holder's relation carries (R7). Her `herSkill` lives on the relation itself (P15a). */
export interface DynamicRelation {
  /** 0–100. */
  hold: number;
  frame: Frame;
  domains: DynamicDomain[];
  tracks: Record<string, TrackState>;
  /** Milestones passed, in order (`seeded:<frame>` for a seeded start). */
  milestones: string[];
  sworn?: { day: number };
  /** The last hold gain from a P15 source or a practice event. */
  lastPracticeDay: number;
  /** At most 8: P16 writes; P15 pushes probe axes and offer kinds. */
  recent: string[];
  /** −20…20. */
  favour: number;
  readOf: HerReading;
  declared?: { motive: Motive; weight: number; day: number };
  probes: {
    lastDay?: number;
    pending?: { axis: string; tier: 1 | 2; day: number; sceneId?: string };
    /** The last five answers. */
    answers: ResponseType[];
    backoffUntil?: number;
    issued: number;
  };
  /** Days. */
  refusals: number[];
  /** Days (rule frame). */
  contest: number[];
  aftermath?: AftermathState;
  leashBlock?: { since: number; held: number };
  /** `successor`: who the squad's reaction raised (an empty string when nobody could be); absent until the day step has looked. */
  formerHolder?: { endedDay: number; frame: Frame; sworn: boolean; successor?: string };
  /** Milestone, domain and return ids → the day it may come again. */
  cooldowns: Record<string, number>;
}

/**
 * What an enforcement of severity 3 or more took from a struggle for the command, kept in the enforcement's `Inverse` so UNDO gives it back
 * (P9: UNDO reverts an `Inverse`; review I11): the domain(s) that granted the command, the aftermath with its count, and her open override.
 */
export interface DynamicUndo {
  domains: DynamicDomain[];
  aftermath: AftermathState;
  override?: OpenOverride & { unitId: string };
}

/** A domain she asks the commander for, or a submit card at `rule` (`domainId` absent, `submit: true`). */
export interface OpenClaim { id: string; unitId: string; domainId?: string; submit?: true; day: number }
export interface OpenMilestone { id: string; unitId: string; milestoneId: string; day: number; form: MilestoneOffer }
export interface OpenOffer {
  id: string;
  unitId: string;
  day: number;
  composition: Array<{ tab: OfferTab; ids: string[] }>;
  /** Her answer, computed when the offer is made; the scene confirms it. */
  answer?: OfferAnswer;
  /** The offer asked something in return (`[ASK IN RETURN]`). */
  conditions?: true;
  sceneId?: string;
}
/** A negotiated exit that waits for a compromise in a scene with her (R15): `dx<n>`. ABRUPT on its card ends it now. */
export interface OpenExit { id: string; unitId: string; day: number }
export interface OpenReturn { id: string; unitId: string; terms: 'lower_band' | 'after_punishment'; day: number }

/** What one observer knows of one holder's dynamic (R14). */
export interface KnowledgeRecord { suspicion: number; level?: KnowledgeLevel; levelDay?: number; peakDay?: number }

export interface DynamicCampaign {
  /** The seed of every hash-picked chance: the setup seed, or a hash of the rng at the moment the dynamic was turned on. */
  salt: number;
  setup: DynamicSetup;
  /** `knowledge[observerId][holderId]` (R14). */
  knowledge: Record<string, Record<string, KnowledgeRecord>>;
  /** A holder's open override (R13); the warden's stays in `leashswap.warden.override`. */
  override?: OpenOverride & { unitId: string };
  overrideSeq: number;
  /** Days of Leash requests a holder blocked or cancelled (R16). */
  oversight?: { blocked: number[]; threadId?: string };
  /** The probe queue (R9): unit ids, first in line first. */
  queue: string[];
  /** Days the dynamic noticed in passing (the style's surfacing reads them, T16): the last gain of the commander's endurance, the last time the crime was revealed. */
  noted?: { enduranceDay?: number; crimeDay?: number; praisedDay?: number };
  /** Ids: claims `dc<n>`, milestones `dm<n>`, offers `do<n>`, aftermaths `da<n>`, exits `dx<n>`. */
  seq: number;
  /** `exits` is optional: a save from before the exit routes has none. */
  open: { claims: OpenClaim[]; milestones: OpenMilestone[]; returnOffer?: OpenReturn; offers: OpenOffer[]; exits?: OpenExit[] };
}

/** `state.dynamic` is where the campaign keeps it, `undefined` while there is none. The layer above (`dynamicOn`) decides whether it counts. */
export function dynamicOf(state: Pick<CampaignState, 'relations'>, unitId: string): DynamicRelation | undefined {
  return state.relations[unitId]?.dynamic;
}

/** FNV-1a, 32 bit (copied from the hub, as `life/state.ts` does, so this file stays a leaf). */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * A stable number in [0, 1) from the campaign's dynamic salt, the unit, a key and the day: `fnv1a(<salt>|<unitId>|dynamic|<key>|<day>)`. The
 * source of every pick that is not one of the spec's rolls (the probe axis, the gossip spread, the head start). Never draws. Without
 * `state.dynamic` the salt is 0, so a reader that runs off will still answer.
 */
export function dynamicHash(state: Pick<CampaignState, 'dynamic' | 'day'>, unitId: string, key: string): number {
  return fnv1a(`${state.dynamic?.salt ?? 0}|${unitId}|dynamic|${key}|${state.day}`) / 2 ** 32;
}

/** The salt of a dynamic turned on mid-campaign: a hash of the rng as it stands (deterministic; nothing is drawn). The setup passes its own seed. */
export const dynamicSaltOf = (rng: unknown): number => fnv1a(JSON.stringify(rng));

/** A new, empty block. */
export function newDynamicCampaign(salt: number, setup: DynamicSetup): DynamicCampaign {
  return { salt, setup, knowledge: {}, overrideSeq: 0, queue: [], seq: 0, open: { claims: [], milestones: [], offers: [] } };
}

/** A fresh reading: nobody's idea of the commander yet. Its region is the one its own (blank) values give, `devoted` (`regionOf(blankReading())`; a test pins it), so no shift is announced from a picture nobody read. */
export function blankReading(): HerReading {
  return { r: 0, f: 0, p: 0, motive: { order: 0.2, fear: 0.2, her: 0.2, process: 0.2, gain: 0.2 }, flat: 0, deflect: 0, region: 'devoted', updates: 0 };
}

/** What a holder starts with (`ensureDynamic`). */
export function blankDynamic(day: number): DynamicRelation {
  return {
    hold: 0, frame: 'equal', domains: [], tracks: {}, milestones: [], lastPracticeDay: day, recent: [], favour: 0, readOf: blankReading(),
    probes: { answers: [], issued: 0 }, refusals: [], contest: [], cooldowns: {},
  };
}
