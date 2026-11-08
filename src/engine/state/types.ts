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
  socialStats: { authority: number; insight: number; empathy: number; cunning: number };
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
  base: { facilities: Record<string, number> };
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
  calendar: { scheduled: unknown[]; nightEventsQueue: unknown[] };
  leash: { authorizationsLeft: number; refreshDay: number; log: unknown[] };
  expedition?: unknown;
  combat?: unknown;
}
