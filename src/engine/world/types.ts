import type { Encounter } from '../combat/types';
import type { EventType } from '../relations/vocab';
import type { LootDrop, Severity, ValueAxis } from '../state/types';

/** P5: the data-driven vocabulary for every consequence outside combat (spec: overview P4). */
export const WORLD_EFFECT_TYPES = [
  'resource', 'carried_supplies', 'faction', 'clock', 'flag', 'clearance', 'party_stress', 'party_hp', 'loot',
  'leash', 'thread', 'unit_event', 'incoming_unit', 'fact', 'offer_mission',
  // P6
  'thread_flag',
] as const;
export type WorldEffectType = (typeof WORLD_EFFECT_TYPES)[number];

export const NODE_KINDS = ['combat', 'event', 'cache', 'rest', 'objective', 'unknown'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const MISSION_SOURCES = ['command', 'story', 'rumor', 'side'] as const;
export type MissionSource = (typeof MISSION_SOURCES)[number];

export const THREAD_STATUSES = ['open', 'resolved', 'failed', 'dormant'] as const;
export type ThreadStatus = (typeof THREAD_STATUSES)[number];

export type WorldResource = 'credits' | 'supplies' | 'plyx';

export type WorldEffect =
  | { type: 'resource'; resource: WorldResource; amount: number }
  | { type: 'carried_supplies'; amount: number }
  | { type: 'faction'; factionId: string; amount: number }
  | { type: 'clock'; clockId: string; by: number }
  | { type: 'flag'; flagId: string }
  | { type: 'clearance'; tier: 1 | 2 | 3 }
  | { type: 'party_stress'; amount: number }
  | { type: 'party_hp'; pct: number }
  | { type: 'loot'; tableId: string; rolls?: number }
  | { type: 'leash'; amount: -1 | 1 }
  | { type: 'thread'; threadId: string; status: ThreadStatus }
  | {
      type: 'unit_event';
      event: EventType;
      severity: Severity;
      targets: 'party' | 'named';
      valueAxes?: Array<{ axis: string; direction: -1 | 1 }>;
    }
  | { type: 'incoming_unit' }
  | { type: 'fact'; text: string; tags: string[]; importance: number }
  | { type: 'offer_mission'; templateId: string; regionId?: string; source: MissionSource }
  /** P6: a dynamic flag in a thread's namespace (`thread:<threadId>:<slug>`) with its one-line description. */
  | { type: 'thread_flag'; threadId: string; flagId: string; description: string };

// ---------------------------------------------------------------------------------------------
// State shapes (campaign state `version: 1`; every P5 field is optional or empty in older saves).

export interface Clock {
  id: string;
  label: string;
  segments: number;
  filled: number;
  regionId?: string;
  visibleToPlayer: boolean;
  /** Day of the last fill (set when the clock fills, cleared when it repeats). */
  filledDay?: number;
}

export interface Thread {
  id: string;
  title: string;
  status: ThreadStatus;
  /** Dynamic flags (`thread:<threadId>:<slug>`), each with a one-line description. */
  flags: Array<{ id: string; description: string }>;
  relatedUnits: string[];
  relatedRegions: string[];
  createdDay: number;
}

export interface RegionState {
  known: boolean;
  lastVisitedDay?: number;
  /** Day each point of interest was last run, by POI id. */
  poi?: Record<string, number>;
}

export interface MissionRewards {
  credits: number;
  plyx: number;
  /** Item names (display only; the items themselves go through `bankLoot`). */
  items: string[];
  clearance?: number;
  faction?: { id: string; amount: number };
}

export interface Mission {
  id: string;
  source: MissionSource;
  templateId: string;
  title: string;
  brief: string;
  regionId: string;
  danger: 1 | 2 | 3 | 4 | 5;
  objective: { node: string; condition: 'win' | 'reach' };
  offeredDay: number;
  deadlineDay?: number;
  rewardsTier: string;
  failureEffects: WorldEffect[];
  threadId?: string;
  spineBeat?: string;
  poiId?: string;
  /** The mission came from a rumor: its map is scouted one step further. */
  scouted?: boolean;
  status: 'offered' | 'active' | 'completed' | 'failed';
  outcomeDay?: number;
  rewards?: MissionRewards;
}

export interface Rumor {
  id: string;
  day: number;
  text: string;
  tags: string[];
  leadsTo: 'mission' | 'fact' | 'none';
  lead?: { templateId: string; regionId: string };
  status: 'new' | 'followed';
}

export interface MapNode {
  id: string;
  layer: number;
  type: string;
  /** What an `unknown` node turned out to be (set on entry). */
  resolvedType?: string;
  edges: string[];
  visited: boolean;
}

export interface NodeMap {
  layers: string[][];
  objectiveId: string;
  nodes: Record<string, MapNode>;
}

export interface ExpeditionLogEntry {
  n: number;
  nodeId?: string;
  kind: 'start' | 'move' | 'combat' | 'event' | 'cache' | 'rest' | 'treat' | 'objective' | 'retreat' | 'return';
  text: string;
  data?: Record<string, unknown>;
}

export type PendingNode =
  | { kind: 'combat'; nodeId: string; encounter: Encounter; prevCombatId?: string }
  | { kind: 'event'; nodeId: string; templateId: string };

/** A relation event reported by an expedition, applied through `applyIntents` on return. */
export interface QueuedIntent {
  type: EventType;
  actor: 'commander' | string;
  targets: string[];
  severity: Severity;
  evidence: string;
  valueAxes?: Array<{ axis: ValueAxis; direction: -1 | 1 }>;
}

export interface ExpeditionState {
  id: string;
  missionId: string;
  regionId: string;
  day: number;
  slots: 2 | 3;
  party: string[];
  formation: { front: string[]; back: string[] };
  /** Supplies carried (already taken from `resources.supplies`). */
  supplies: number;
  map: NodeMap;
  at: string | null;
  path: string[];
  phase: 'travel' | 'combat' | 'event';
  pending?: PendingNode;
  /** Loot found so far; banked on return, lost on retreat. */
  loot: LootDrop[];
  log: ExpeditionLogEntry[];
  hints: QueuedIntent[];
  objectiveDone: boolean;
  /** How many steps ahead node types are shown. */
  reveal: number;
}

export interface ExpeditionReport {
  id: string;
  missionId: string;
  missionTitle: string;
  regionId: string;
  day: number;
  outcome: 'success' | 'retreated' | 'failed';
  party: string[];
  /** Node type ids in path order. */
  nodes: string[];
  log: ExpeditionLogEntry[];
  loot: LootDrop[];
  rewards?: MissionRewards;
  injuries: string[];
  deaths: string[];
  breakdowns: string[];
  recap?: string;
  acknowledged: boolean;
  debriefed: boolean;
}

export interface DirectorRequest {
  id: string;
  reason: 'day_end' | 'expedition' | 'scout';
  day: number;
}
