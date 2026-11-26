/**
 * P15a: the vocabulary of the scene blocking, moments and contact physics as TYPES (a leaf: no imports). The registries that carry
 * these entries are data (`content/core/blocking*.json`, `momentSources`, `contactPhysics`, …); the engine reads them by FIELD and by
 * effect type, never by id. Only the closed enums below are fixed in code (plan R5, R10, R11, R12, R13).
 */

/** The 18 effect types an entry may carry (`BlockingEffect.type`). */
export const EFFECT_TYPES = [
  'camera', 'backdrop', 'pose_shot', 'filter', 'perception', 'input', 'gestures', 'device', 'sensory',
  'sound', 'visibility', 'mobility', 'strain', 'escalation', 'physics', 'rule', 'notice', 'status_after',
] as const;
export type EffectType = (typeof EFFECT_TYPES)[number];

/** How a moment source becomes live (plan R10). */
export const LIVE_KINDS = [
  'extracted', 'blocking', 'visitor', 'obscured', 'mood_jump', 'weakness', 'asleep', 'alarm', 'keeps_fact',
  'physics_warning', 'physics_slip', 'external',
] as const;
export type LiveKind = (typeof LIVE_KINDS)[number];

/** The verbs a held-over answer can escalate with, in the order the engine tries them (plan R11; blocking.md §9). */
export const ESCALATION_ORDER = [
  'remote_pulse', 'shock', 'tug_leash', 'tighten_hold', 'shift_weight', 'squeeze', 'press', 'press_harder', 'tug_hair',
  'nudge_with_foot', 'whisper', 'pda_message', 'look', 'cough', 'name_aloud',
] as const;
export type EscalationVerb = (typeof ESCALATION_ORDER)[number];

/** How a contact physics is played (plan R12). */
export const INTERACTIONS = ['timing', 'hold', 'decision', 'order', 'passive', 'gesture'] as const;
export type InteractionType = (typeof INTERACTIONS)[number];

/** The kinds of line in a physics' cue pool; `watch` and `look_away` are the signs of her attention (plan R12, R13). */
/**
 * Her cue kinds. `greedy` (P10e-e): she notices the commander holding on to the air past her opening. `deeper`, `suck`, `wider`, `pull_back`
 * (P10e-e R22): her orders in the jaw.
 */
export const CUE_KINDS = ['window_open', 'window_false', 'shift', 'press', 'lift', 'count', 'warning', 'watch', 'look_away', 'greedy', 'deeper', 'suck', 'wider', 'pull_back'] as const;
export type CueKind = (typeof CUE_KINDS)[number];

/** What an answer to a moment is, whatever its words (spec §7). */
export const RESPONSE_TYPES = ['yielded', 'resisted', 'returned', 'deflected'] as const;
export type ResponseType = (typeof RESPONSE_TYPES)[number];

/** Where an item is worn; an item takes one or all of its slots (`slotMode`). */
export const WORN_SLOTS = ['eyes', 'ears', 'mouth', 'face', 'head', 'neck', 'hands', 'body', 'legs', 'groin', 'feet', 'prop'] as const;
export type WornSlot = (typeof WORN_SLOTS)[number];

/** The stages of a stimulus trajectory (plan R13: boundaries at 0.2 / 0.4 / 0.6 / 0.8); `separated` is the word after a week apart. */
export const STAGES = ['aversion', 'enduring', 'accustomed', 'craving', 'adoring'] as const;
export type Stage = (typeof STAGES)[number];

export const SEALS = ['leaky', 'firm', 'tight'] as const;
export type Seal = (typeof SEALS)[number];
export const GAUGE_KINDS = ['capacity', 'fill', 'dirt', 'progress'] as const;
export const CONTACT_DIRS = ['her', 'commander', 'either', 'none'] as const;
export const ATTENTIONS = ['on_commander', 'divided', 'elsewhere', 'none'] as const;
export const PAIR_TAGS = ['focused', 'relaxed', 'body', 'asleep', 'eating'] as const;
export const ANCHOR_KINDS = ['general', 'relative', 'furniture'] as const;
export const STIMULUS_FAMILIES = ['scent', 'sweat', 'taste'] as const;
export const SCOPES = ['any', 'dynamic'] as const;
export type Scope = (typeof SCOPES)[number];

export type Side = { posture?: string; anchor?: string };

/** One effect of a posture, anchor, contact, item or activity (plan R5). Anything else a source says goes into its `promptHint`. */
export type BlockingEffect =
  | { type: 'camera'; mode: 'from_below' | 'face_close' | 'ignored' | 'pov_floor' | 'pov_dark' | 'ceiling' }
  | { type: 'backdrop'; id: string }
  | { type: 'pose_shot'; kind: string }
  | { type: 'filter'; kind: 'sensory_dark' | 'alarm' }
  | { type: 'perception'; self?: 'obscured'; others?: 'obscured' }
  | { type: 'input'; limit: 'muffled' | 'garbled' | 'no_speech' | 'gestures_only' | 'no_hands' | 'action_only'; strength?: 1 | 2 | 3 }
  | { type: 'gestures'; variant: 'pet' | 'head_only' }
  | { type: 'device'; lock: 'tabs' }
  | { type: 'sensory'; kind: 'scent' | 'touch' | 'sound' | 'temp'; intensity: 'low' | 'high' | 'overwhelming' }
  | { type: 'sound'; muffle?: true; id?: string }
  | { type: 'visibility'; hiddenFromDoor?: true; exposing?: true; hideable?: false; unlessPosture?: string[] }
  | { type: 'mobility'; level: 'none' | 'limited' | 'crawl' | 'follows' }
  | { type: 'strain'; condition: 'stillness' | 'silence' | 'posture' | 'endurance'; rate: number }
  | { type: 'escalation'; verb: EscalationVerb }
  | { type: 'physics'; id: string }
  | { type: 'rule'; template: string }
  | { type: 'notice'; kind: 'knows_dynamic' | 'seen' }
  | { type: 'status_after'; id: string; afterExchanges: number };

/** The text every entry carries. */
interface Described { id: string; label: string; description: string }

export interface WorshipTargetEntry extends Described {
  contentTags: string[];
  side: 'front' | 'back' | 'both';
  zone: { front?: { x: number; y: number; r: number }; back?: { x: number; y: number; r: number } };
  stimuli: string[];
}
export interface PostureEntry extends Described { promptHint: string; effects: BlockingEffect[] }
export interface AnchorEntry extends Described {
  kind: (typeof ANCHOR_KINDS)[number];
  requires?: { affordances: string[] };
  promptHint: string;
  effects?: BlockingEffect[];
}
export interface ContactEntry extends Described {
  scope: Scope;
  contentTags?: string[];
  dir: (typeof CONTACT_DIRS)[number];
  target?: string[];
  implies?: { actor?: Side; receiver?: Side };
  requires?: { affordances?: string[] };
  physics?: Array<{ id: string; seal?: Seal[]; pressure?: number }>;
  stimuli?: string[];
  sources?: Record<string, number>;
  mouth?: true;
  promptHint: string;
  effects?: BlockingEffect[];
}
export interface ItemEntry extends Described {
  scope: Scope;
  contentTags?: string[];
  slots: WornSlot[];
  slotMode?: 'all' | 'one';
  wornBy?: 'commander' | 'her';
  physics?: Array<{ id: string; seal?: Seal[]; pressure?: number }>;
  stimuli?: string[];
  sources?: Record<string, number>;
  promptHint: string;
  effects?: BlockingEffect[];
}
/** P10e-e R24: the frame of her time on an activity (her_activity.html `ACTS`, read by field). */
export interface ActivityFrame {
  absorb: number;
  hear: number;
  light: 'lamp' | 'screen' | 'dark';
  unit: string;
  total: number;
  per: [number, number];
  legs: 'swing' | 'tap' | 'still' | 'asleep' | 'beat';
  hours?: number;
  call?: true;
  visitor?: true;
  sleep?: true;
  music?: true;
  drink?: true;
  /** The throne (24b): visitors one after another, her folder, her signature, her mug. */
  audience?: true;
}
export interface BlockingActivityEntry extends Described {
  scope: Scope;
  contentTags?: string[];
  actor: 'her' | 'commander';
  attention?: (typeof ATTENTIONS)[number];
  interruptible?: boolean;
  impliedPosture?: string;
  pairTags?: Array<(typeof PAIR_TAGS)[number]>;
  fits?: string[];
  presence?: 'unnoticed' | 'felt';
  judged?: true;
  sources?: Record<string, number>;
  fromActivities?: string[];
  /** P10e-e R24: the frame of her time (see the schema). */
  frame?: ActivityFrame;
  promptHint: string;
  effects?: BlockingEffect[];
}
export interface MomentOptionFrame { type: ResponseType; generic: string }
export interface MomentSourceEntry {
  id: string;
  scope: Scope;
  contentTags?: string[];
  frame: [MomentOptionFrame, MomentOptionFrame, MomentOptionFrame];
  live: LiveKind[];
  remember?: Array<{ option: 0 | 1 | 2; importance: 1 | 2 | 3 | 4 | 5 }>;
  generalMeeting?: true;
  exposes?: true;
  description: string;
}
export interface PhysicsEntry extends Described {
  contentTags?: string[];
  gauge: { kind: (typeof GAUGE_KINDS)[number]; start: number };
  interaction: InteractionType;
  skill: boolean;
  segmentSeconds: number;
  chains?: Array<{ on: 'slip'; to: string; start?: number }>;
  promptHint: string;
}
export interface CueEntry { id: string; kind: CueKind; physics?: string[]; lines: string[]; description: string }
export interface StimulusKindEntry extends Described {
  contentTags?: string[];
  family: (typeof STIMULUS_FAMILIES)[number];
  perception: Record<Stage | 'separated', string>;
}
export interface EscalationVerbEntry { id: EscalationVerb; label: string; promptHint: string; description: string }
export interface ConditionEntry extends Described {
  effects: Array<{ type: 'social_rank'; delta: number } | { type: 'stress'; amount: number }>;
  promptHint: string;
}

/**
 * The effects an entry has: the ones it declares, plus a `physics` effect for each id in its `physics` field (a contact or an item names
 * its contact physics once, in that field, where the seal and the pressure are; readers by effect type still find them here).
 */
export function effectsOfEntry(entry: object | undefined): BlockingEffect[] {
  const e = entry as { effects?: unknown; physics?: unknown } | undefined;
  const declared = Array.isArray(e?.effects) ? (e!.effects as BlockingEffect[]) : [];
  const named = Array.isArray(e?.physics) ? (e!.physics as Array<{ id: string }>) : [];
  const extra = named.filter((p) => !declared.some((d) => d.type === 'physics' && d.id === p.id)).map((p): BlockingEffect => ({ type: 'physics', id: p.id }));
  return [...declared, ...extra];
}
