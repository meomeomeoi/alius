import type { Entry, Registries } from '../../content/types';
import type { ValueAxis } from '../state/types';

/**
 * The shapes of the four registries of her life (P14c), matching their zod schemas in `src/content/schemas.ts` (the schemas are the
 * truth; these are what code reads). Code reads these entries by field, never by id: life events by `requires` / `share` / `size` /
 * `category` / `becomes`, hobbies by `locations` / `teachable` / `milestones[].trace`, topics by `group` / `axis` / `triggers`, pastimes by
 * `locations` / `slots` / `requires` / `talk`. The texts are `AUTHOR TO WRITE`.
 */

export const LIFE_SIZES = ['small', 'notable'] as const;
export const LIFE_CATEGORIES = ['things', 'body', 'construct', 'people', 'service', 'luck'] as const;
export const LIFE_SHARES = ['anyone', 'close', 'keeps'] as const;
export const TOPIC_GROUPS = ['lore', 'service', 'everyday', 'people', 'abstract'] as const;
export const TRACE_KINDS = ['note', 'prop', 'opinion'] as const;
export const TALK_LEVELS = ['quiet', 'some'] as const;

export type LifeSize = (typeof LIFE_SIZES)[number];
export type LifeCategory = (typeof LIFE_CATEGORIES)[number];
export type LifeShare = (typeof LIFE_SHARES)[number];
export type TopicGroup = (typeof TOPIC_GROUPS)[number];
export type TraceKind = (typeof TRACE_KINDS)[number];

/** The closed vocabulary of conditions of a life event; every listed field must hold. Each reads state that already exists. */
export interface LifeRequires {
  /** She has this hobby `active` (`'any'`: any active hobby). */
  hobby?: string;
  /** One of her whereabouts today is a routine stay in a room of one of these scene locations. */
  location?: string[];
  /** She took part today (companion or roster) in one of these activities. */
  activity?: string[];
  /** The last expedition ended yesterday or today with her in the party (`hurt`: and she was injured). */
  afterRun?: { hurt?: true };
  /** No expedition with her in the party for this many days, and none open. */
  noRunDays?: number;
  stressMin?: number;
  stressMax?: number;
  /** One of her defects has this category. */
  defectCategory?: string;
  injured?: true;
  /** Another named living unit is at the base. */
  otherNamed?: true;
  affinityMin?: number;
  trustMin?: number;
  /** Her relationship state's `bondTier` is romantic. */
  romantic?: true;
  /** The squad has a leader and she is not it. */
  leaderNotHer?: true;
  gruntDiedDays?: number;
  deathAgo?: number;
  rumour?: true;
  rationsShort?: true;
  sparring?: 'won' | 'lost';
  bloomHalf?: true;
  missionBoard?: true;
  /** She had this life event within 30 days. */
  afterEvent?: string;
  /** Another woman had this life event within 7 days. */
  otherHadThisWeek?: string;
}

export interface LifeEventEntry extends Entry {
  size: LifeSize;
  category: LifeCategory;
  tags?: string[];
  share: LifeShare;
  /** A `keeps` event she shares anyway when one of these holds (the others stay hers). */
  keepsUnless?: { affinityMin?: number; romantic?: true };
  requires?: LifeRequires;
  becomes?: { hobby?: string; milestone?: true; opinionTopic?: string };
  cooldownDays?: number;
  yearly?: true;
  urgent?: true;
  description: string;
  hub: string;
  lines: [string, string];
}

export interface HobbyMilestone { id: string; line: string; trace?: TraceKind }

export interface HobbyEntry extends Entry {
  label: string;
  /** Scene location ids where she practises; at least one is hosted by a hub room. */
  locations: string[];
  /** Her activities for P15a (stored, not read yet). */
  activityIds: string[];
  teachable: boolean;
  /** Exactly four. */
  milestones: HobbyMilestone[];
  /** The topic an `opinion` trace opens. */
  opinionTopic?: string;
  description: string;
  /** The words of a `note` or `prop` trace when nothing was generated. */
  traceText?: string;
}

export interface TopicPosition { id: string; description: string; lines: [string, string] }

export interface OpinionTopicEntry extends Entry {
  label: string;
  group: TopicGroup;
  /** A positive value on the axis (times `sign`) suggests the first position; a negative one the last. */
  axis?: { id: ValueAxis; sign: 1 | -1 };
  /** In order, roughly a spectrum: persuasion moves an opinion to a neighbour. */
  positions: TopicPosition[];
  triggers: { locations?: string[]; activities?: string[]; lifeEvents?: string[]; keywords?: string[] };
  description: string;
}

export interface PastimeEntry extends Entry {
  label: string;
  /** Scene location ids; the first one open for the slot is used (empty for the pastime the `hobby` field marks, which uses her hobby's). */
  locations: string[];
  slots: Array<'morning' | 'afternoon' | 'evening' | 'night'>;
  requires?: { afterRun?: true; firstSlot?: true; hobby?: string };
  /** The meeting is her hobby (practice, a push, the commander's skill). */
  hobby?: true;
  talk: (typeof TALK_LEVELS)[number];
  herActivity: string;
  commanderActivity: string;
  sensoryTag: string;
  /** Stored for P15a; nothing reads it yet. */
  momentSources: string[];
  description: string;
  opening: string;
  lines: [string, string];
}

/** The activity a quiet meeting runs through (the one with `pastime: true`), or undefined when the pack has none. */
export function pastimeActivity(reg: Pick<Registries, 'activities'>): Entry | undefined {
  return [...reg.activities.values()].find((a) => a.pastime === true);
}
