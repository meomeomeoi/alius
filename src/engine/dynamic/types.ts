/**
 * P15: the closed vocabularies of the dynamic and the entry types of its eleven registries (plan R4). A leaf: it imports only the P15a enums
 * it builds on (`FRAMES`, `STYLE_KEYS`), so the content schemas can read it without a cycle. Everything else the engine reads by FIELD,
 * by effect type or by capability, never by id (P10 rule): these lists are the only fixed vocabulary.
 */
import { FRAMES, type Frame } from '../blocking/state';
import { STYLE_KEYS, type StyleKey } from '../physics/state';

export { FRAMES, STYLE_KEYS };
export type { Frame, StyleKey };

/** A style a profile may name: P15a's keys minus `neutral` (the physics stand-in for "no holder"). */
export const PROFILE_STYLES = ['affectionate', 'cold', 'ritual', 'clinical', 'possessive', 'playful', 'cruel', 'obsessive', 'drill', 'regal', 'vindictive'] as const;
export type ProfileStyle = (typeof PROFILE_STYLES)[number];
/** Compile-time check: the list above is exactly P15a's keys minus `neutral`. */
const _stylesComplete: [Exclude<StyleKey, 'neutral'>] extends [ProfileStyle] ? ([ProfileStyle] extends [Exclude<StyleKey, 'neutral'>] ? true : never) : never = true;
void _stylesComplete;

export const PRACTICE_AS = ['none', 'tolerates', 'enjoys', 'craves'] as const;
export type PracticeAs = (typeof PRACTICE_AS)[number];
export const WITNESS = ['dislikes', 'indifferent', 'drawn'] as const;
export type Witness = (typeof WITNESS)[number];
export const AUDIENCE = ['private_only', 'select_few', 'show_off', 'indifferent'] as const;
export type Audience = (typeof AUDIENCE)[number];
export const INCLINATION = ['none', 'latent', 'curious', 'eager'] as const;
export type Inclination = (typeof INCLINATION)[number];
export const MAY_HOLD = ['yes', 'no', 'auto'] as const;
export type MayHold = (typeof MAY_HOLD)[number];
export const FAIRNESS = ['fair', 'strict', 'capricious', 'unfair'] as const;
export type Fairness = (typeof FAIRNESS)[number];
export const HINT_STYLE = ['offers', 'hints', 'expects'] as const;
export type HintStyle = (typeof HINT_STYLE)[number];
export const DRIVE = ['low', 'moderate', 'high'] as const;
export type Drive = (typeof DRIVE)[number];

/** The campaign setup of the dynamic (R3): how many may hold at once, how fast hold moves, how often something comes, and how sensitive each unit is. */
export const HOLDER_CAPS = [0, 1, 2, 3, 'any'] as const;
export type HolderCap = (typeof HOLDER_CAPS)[number];
export const PACES = ['slow', 'normal', 'fast'] as const;
export type Pace = (typeof PACES)[number];
export const FREQUENCIES = ['rare', 'normal', 'often'] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const SENSITIVITIES = ['sluggish', 'normal', 'lively'] as const;
export type Sensitivity = (typeof SENSITIVITIES)[number];
export const START_FRAMES = ['play', 'role'] as const;
export type StartFrame = (typeof START_FRAMES)[number];

/** What a claimed domain lets her do. Code reads these, never a domain id (R12). */
export const CAPABILITIES = [
  'booking_uncapped', 'book_ahead', 'body_conditions', 'device_floor', 'leash_block', 'household_protocol',
  'second_place', 'relation_rules', 'booking_consent', 'countermand', 'co_leader',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const MILESTONE_EFFECT_TYPES = ['frame', 'sworn', 'claim', 'drop_romance'] as const;
/** What a milestone does once accepted. `frame` moves the dynamic to the milestone's `to`; `claim` hands her a capability outright (the command at the handover). */
export type MilestoneEffect =
  | { type: 'frame' }
  | { type: 'sworn' }
  | { type: 'claim'; capability: Capability }
  | { type: 'drop_romance' };

export const SURFACE_CONDITIONS = [
  'peak', 'after_defiance', 'low_stakes_good_mood', 'before_others', 'scene_edges', 'third_person', 'displeased', 'new_practice', 'threat',
  'after_peak_or_wound', 'stagnation', 'training_start', 'praised_or_ignored', 'crime_mentioned', 'failed_run', 'arrival_anniversary',
] as const;
export type SurfaceCondition = (typeof SURFACE_CONDITIONS)[number];

/** What drives the commander, read by her (spec §16.4). */
export const MOTIVES = ['order', 'fear', 'her', 'process', 'gain'] as const;
export type Motive = (typeof MOTIVES)[number];

/** Her reading of the commander's position, in the order the regions are tested (spec §15.2 / §16.4; `cowed` after `elusive`). */
export const REGION_RANKS = ['hollow', 'elusive', 'cowed', 'double_game', 'calculating', 'bratty', 'proud', 'hungry', 'reluctant', 'dutiful', 'devoted'] as const;
export type RegionRank = (typeof REGION_RANKS)[number];

export const AFTERMATH_KINDS = ['grief', 'pursuit', 'blackmail', 'revenge', 'command_kept', 'cold_contempt', 'return_offer', 'successor', 'habits'] as const;
export type AftermathKind = (typeof AFTERMATH_KINDS)[number];

/** The kinds of demand an aftermath may open (P9 `demandTemplates[].kind`). */
export const AFTERMATH_DEMAND_KINDS = ['desire', 'exclusion', 'information', 'interpersonal', 'item', 'privilege', 'resource'] as const;

export const AFTERMATH_EFFECT_TYPES = [
  'stress', 'want', 'night_knock', 'demand', 'booking', 'rule_interfere', 'threaten_tell', 'rumor', 'squad_impunity', 'vote_sabotage',
  'defiance', 'trust', 'return_offer', 'successor', 'protocol_slips',
] as const;
/** What a stage of an aftermath does each day it runs (R15). Read by `type`. */
export type AftermathEffect =
  | { type: 'stress'; amount: number }
  | { type: 'want'; amount: number }
  | { type: 'night_knock' }
  | { type: 'demand'; kind: (typeof AFTERMATH_DEMAND_KINDS)[number] }
  | { type: 'booking' }
  | { type: 'rule_interfere' }
  | { type: 'threaten_tell'; audience: 'squad' | 'outside' }
  | { type: 'rumor' }
  | { type: 'squad_impunity'; amount: number }
  | { type: 'vote_sabotage' }
  | { type: 'defiance' }
  | { type: 'trust'; amount: number }
  | { type: 'return_offer' }
  | { type: 'successor' }
  | { type: 'protocol_slips'; days: number };

export const EXIT_ROUTES = ['abrupt', 'negotiated', 'transfer', 'force'] as const;
export type ExitRoute = (typeof EXIT_ROUTES)[number];

/** What the squad reads as a sign of the dynamic (R14). The first group carries suspicion, the `instant` group knowledge, the closeness group only `suspects_close`. */
export const SIGN_KINDS = [
  'step_behind', 'protocol_public', 'protocol_slip', 'kneeling_at_door', 'her_marks', 'remote_toy', 'leaving_quarters', 'held_night',
  'background_role', 'background_rule', 'gossip_knows', 'gossip_suspects',
  'dynamic_item', 'dynamic_contact', 'holder_tells', 'demonstration', 'exposed_staging', 'compromat_shown',
  'scent_on_commander', 'scent_in_quarters', 'seen_together', 'time_alone', 'territory_marking',
] as const;
export type SignKind = (typeof SIGN_KINDS)[number];

export const OFFER_TABS = ['part', 'posture', 'contact', 'service', 'time', 'role', 'endurance'] as const;
export type OfferTab = (typeof OFFER_TABS)[number];
export const OFFER_ANSWERS = ['accepted', 'corrected', 'mocked', 'refused', 'tonight'] as const;
export type OfferAnswer = (typeof OFFER_ANSWERS)[number];
export const KNOWLEDGE_LEVELS = ['suspects_close', 'suspects_dynamic', 'knows_dynamic'] as const;
export type KnowledgeLevel = (typeof KNOWLEDGE_LEVELS)[number];

/** The tones of a yielding the intent reader reports (P15a's `TONES` in `intentExtract.ts`; a test keeps the two lists equal). */
export const TONES = ['sincere', 'ironic', 'transactional', 'flat'] as const;
export type Tone = (typeof TONES)[number];

export const REGARD_SPEEDS = ['very_slow', 'slow', 'normal', 'fast'] as const;
export type RegardSpeed = (typeof REGARD_SPEEDS)[number];
export const REFUSAL_COSTS = ['minor', 'moderate', 'major', 'contest'] as const;
export type RefusalCost = (typeof REFUSAL_COSTS)[number];
export const OUTSIDE_REACH = ['none', 'scenes', 'all_day', 'domains'] as const;
export type OutsideReach = (typeof OUTSIDE_REACH)[number];
export const MILESTONE_OFFERS = ['booking', 'demand', 'scene', 'automatic'] as const;
export type MilestoneOffer = (typeof MILESTONE_OFFERS)[number];
export const CLAIM_FORMS = ['demand', 'milestone'] as const;
export type ClaimForm = (typeof CLAIM_FORMS)[number];

// ---------------------------------------------------------------------------------------------
// The practice section of a bond profile (R5)

export interface PracticeCategory { as: PracticeAs; witness: Witness }
/** `bond.practice`: what she does as the holder, what she thinks of seeing it done, her style pair and how she goes about it. Every field is hers; mayHold is in the campaign setup. */
export interface Practice {
  categories: Record<string, PracticeCategory>;
  style: { primary: ProfileStyle; secondary?: ProfileStyle };
  audience: Audience;
  inclination: Inclination;
  fairness: Fairness;
  hintStyle: HintStyle;
  drive: Drive;
}

/** The fields of a practice a lock may name (a category is `categories.<id>`). */
export const PRACTICE_LOCK_FIELDS = ['style', 'audience', 'inclination', 'fairness', 'hintStyle', 'drive'] as const;

// ---------------------------------------------------------------------------------------------
// Entry types (the validated shape of a row; the schemas live in `src/content/schemas.ts`)

export interface PracticeStyleEntry {
  id: ProfileStyle;
  label: string;
  description: string;
  /** Where the style comes through while it is the secondary one (spec §15.4). */
  surfacesWhen: SurfaceCondition[];
  /** Where she wants the commander to stand in the (readiness, friction) plane; null = no fixed point (`clinical`). */
  point: { r: number; f: number; motive: Motive; notWith?: 'other_women' } | null;
  /** The form low Regard takes in her eyes, a phrase for the tone line. */
  regardForm: string;
  regardSpeed: RegardSpeed;
  regardFloor: number;
  regardFactor: number;
  /** The aftermath kinds this style leans toward. */
  aftermathBias: AftermathKind[];
  likesRegion?: RegionRank[];
  despisesRegion?: RegionRank[];
}

export interface HoldBandEntry { id: string; label: string; min: number; max: number; description: string }

export interface DynamicFrameEntry {
  id: Frame;
  label: string;
  rank: number;
  holdFloor: number;
  /** Hold never rises past this without a milestone (`equal`: 39). */
  holdCeiling?: number;
  refusal: RefusalCost;
  outside: OutsideReach;
  promptHint: string;
  description: string;
}

export interface MilestoneRequires {
  /** The lowest hold band (a `holdBands` id). */
  holdBand?: string;
  tracks?: Record<string, number>;
  capabilities?: Capability[];
  categories?: string[];
  /** Her primary style is one of these. */
  styles?: ProfileStyle[];
  romantic?: boolean;
  /** Days since her last practice. */
  coolingDays?: number;
  formerHolder?: true;
  noCapability?: Capability;
}

export interface DynamicMilestoneEntry {
  id: string;
  from: Frame;
  to: Frame;
  requires: MilestoneRequires;
  offer: MilestoneOffer;
  sworn?: true;
  effects: MilestoneEffect[];
  text: string;
  promptHint: string;
  contentTags?: string[];
  description: string;
}

export interface DynamicDomainEntry {
  id: string;
  label: string;
  requires: { frame: Frame; holdBand: string };
  claim: ClaimForm;
  grants: Capability[];
  text: string;
  promptHint: string;
  description: string;
}

/** `thresholds`: the xp that reaches level 1…5. */
export interface DynamicTrackEntry { id: string; label: string; category?: string; thresholds: [number, number, number, number, number]; description: string }

export interface ProbeAxisEntry { id: string; label: string; tier: 1 | 2; promptHint: string; description: string }

export interface PositionRegionEntry { id: string; rank: RegionRank; label: string; description: string }

/**
 * How likely an aftermath is for a holder (R15). `base` is the starting weight (0 = never picked by the exit: `successor` is a squad
 * reaction). `styles` adds per style (primary ×1, secondary ×0.5), `values` per value axis she holds; `regard` (by band id), `frames`, `sworn`
 * and `command` multiply the sum. `needsCompromat` and `needsCommand` are conditions (blackmail needs compromat; `command_kept` is forced
 * while she holds the command). `mild` marks the end of the table a clean exit picks from.
 */
export interface AftermathWeights {
  base: number;
  styles?: Partial<Record<ProfileStyle, number>>;
  values?: Record<string, number>;
  regard?: Record<string, number>;
  frames?: Partial<Record<Frame, number>>;
  sworn?: number;
  command?: number;
  needsCompromat?: true;
  needsCommand?: true;
  mild?: true;
}
export interface AftermathStage { days: number; effects: AftermathEffect[]; directive: string; notice: string }
export interface AftermathEntry {
  id: string;
  kind: AftermathKind;
  label: string;
  weights: AftermathWeights;
  stages: AftermathStage[];
  contentTags?: string[];
  chainsTo?: AftermathKind[];
  description: string;
}

export interface RegardBandEntry { id: string; label: string; min: number; max: number; description: string }

export interface DynamicSignEntry {
  id: string;
  kind: SignKind;
  amount: number;
  instant?: true;
  closenessOnly?: true;
  contentTags?: string[];
  description: string;
}

/** The R22 engine events the dynamic emits (every one is in `RESERVED_EVENT_TYPES`). */
export const DYNAMIC_EVENT_TYPES = [
  'dynamic_started', 'hold_changed', 'hold_band_changed', 'frame_changed',
  'domain_claimed', 'domain_yielded', 'domain_refused', 'domain_lost', 'domain_contested',
  'milestone_offered', 'sworn', 'refusal_noted', 'dynamic_exit', 'aftermath_started', 'aftermath_ended',
  'leash_blocked', 'leash_bypassed', 'oversight_inquiry', 'dynamic_known',
  'probe_issued', 'probe_backoff', 'position_shifted', 'offer_made', 'zone_revealed', 'mastery_gained',
  'regard_changed', 'regard_band_changed', 'disappointed', 'regard_question_asked',
] as const;

/**
 * What the intent prompt may offer about the dynamic (R22): the reportable types that have a subject right now and the ids a report may name.
 * Built from the state each time (`dynamicIntentInput`), never stored; `validateIntents` drops any type or id that is not in it. `observed` lists
 * the units who may lead with a gesture of their own, `slips` those whose protocol may slip in company.
 */
export interface DynamicOffer {
  types: string[];
  /** Units whose probe is pending (at most one a scene). */
  probes: string[];
  milestones: string[];
  claims: string[];
  exits: string[];
  offers: string[];
  /** The holders who hold something over the commander (their ids only). */
  compromat: string[];
  observed?: string[];
  slips?: string[];
}
