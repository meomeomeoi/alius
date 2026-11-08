import type { RngState } from '../rng';

export type Slot = 'morning' | 'afternoon' | 'evening' | 'night';
export type Difficulty = 'story' | 'normal' | 'hard';
export type UnitKind = 'named' | 'grunt';
export type UnitStatus = 'active' | 'reserve' | 'injured' | 'deserted' | 'dead' | 'terminated';
export type LoyaltyBand = 'steady' | 'wavering' | 'breaking';

/** Reserved in v1: `Relation.marks` is always empty (overview §10). */
export type MarkInstance = { id: string };

export const VALUE_AXES = ['pragmatism', 'autonomy', 'ingroup', 'mercy', 'corporate', 'sacrifice'] as const;
export type ValueAxis = (typeof VALUE_AXES)[number];

export interface DefectInstance {
  id: string;
  arc?: string;
  /** In-universe origin line written at import (P1). */
  origin?: string;
  /** Grunt defect: no arc (P2). */
  lite?: boolean;
  /** Day a Manage-arc defect was last maintained in the medbay (P2). */
  upkeepDay?: number;
}

/** The signature skill a unit owns: a template id plus the unit's own name and description. */
export interface SignatureInstance {
  templateId: string;
  name: string;
  description: string;
}

export interface Unit {
  id: string;
  kind: UnitKind;
  cardRef?: string;
  displayName: string;
  asciiPortrait?: string;
  /** Grunt designation such as `K-117` (P2); `displayName` may later become a generated name. */
  designation?: string;
  /** One-line generated bio of a grunt (P2). */
  bio?: string;
  /** Days left before an injured unit recovers (P2). */
  injuryDays?: number;
  roleId: string;
  level: number;
  xp: number;
  skillPoints: number;
  unlockedNodes: string[];
  signatureSkill: SignatureInstance;
  baseStats: { hp: number; atk: number; def: number; spd: number; crit: number };
  currentHp: number;
  stress: number;
  defects: DefectInstance[];
  values: {
    pragmatism: number;
    autonomy: number;
    ingroup: number;
    mercy: number;
    corporate: number;
    sacrifice: number;
  };
  likes: string[];
  dislikes: string[];
  triggers: string[];
  equipment: { weapon?: string; upper?: string; lower?: string };
  injuries: string[];
  status: UnitStatus;
}

export interface DailyGain {
  trust: number;
  affinity: number;
  attraction: number;
}

export interface Relation {
  trust: number;
  affinity: number;
  attraction: number;
  stateId: string;
  stateSince: number;
  history: unknown[];
  flags: string[];
  dailyGain: DailyGain;
  loyaltyBand: LoyaltyBand;
  marks: MarkInstance[];
}

export interface Commander {
  name: string;
  corporationId: string | null;
  crimeId: string | null;
  /** Current ranks 1–5. */
  socialStats: { authority: number; insight: number; empathy: number; cunning: number };
  /** Points behind the ranks (P2); absent until the first gain, a rank then counts as its threshold. */
  socialPoints?: { authority: number; insight: number; empathy: number; cunning: number };
  /** The commander is injured while `day` is below this (P2). */
  injuredUntilDay?: number;
  flags: string[];
}

export interface CampaignState {
  version: number;
  rng: RngState;
  day: number;
  slot: Slot;
  difficulty: Difficulty;
  /** Snapshot of the settings the campaign was started with. */
  settings: Record<string, unknown>;
  commander: Commander;
  squad: Unit[];
  roster: { activeIds: string[]; capacity: number };
  relations: Record<string, Relation>;
  resources: { credits: number; supplies: number; plyx: number };
  base: {
    /** Facility levels; an absent key means level 1 (P2). */
    facilities: Record<string, number>;
    /** Pending facility upgrades (P2). */
    upgrades?: Array<{ facilityId: string; toLevel: number; daysLeft: number }>;
  };
  inventory: unknown[];
  world: {
    regions: Record<string, unknown>;
    clocks: unknown[];
    threads: unknown[];
    factions: Record<string, number>;
    flags: string[];
    spineProgress: number;
    /** Id of the start this campaign began with (P1). */
    startId?: string;
  };
  missions: { offered: unknown[]; active: unknown[]; completed: unknown[] };
  rumors: unknown[];
  dms: Record<string, unknown[]>;
  memory: { facts: unknown[]; chronicle: unknown[] };
  calendar: {
    scheduled: unknown[];
    nightEventsQueue: unknown[];
    /** Consecutive days with a supply shortage (P2). */
    shortageStreak?: number;
    /** The queue entry being played in the current Night slot (P2 moves it here; P3 reads it). */
    nightEvent?: unknown;
  };
  leash: { authorizationsLeft: number; refreshDay: number; log: unknown[] };
  expedition?: unknown;
  combat?: unknown;
}
