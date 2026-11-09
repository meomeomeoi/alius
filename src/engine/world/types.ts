import type { EventType } from '../relations/vocab';
import type { Severity } from '../state/types';

/** P5: the data-driven vocabulary for every consequence outside combat (spec: overview P4). */
export const WORLD_EFFECT_TYPES = [
  'resource', 'carried_supplies', 'faction', 'clock', 'flag', 'clearance', 'party_stress', 'party_hp', 'loot',
  'leash', 'thread', 'unit_event', 'incoming_unit', 'fact', 'offer_mission',
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
  | { type: 'offer_mission'; templateId: string; regionId?: string; source: MissionSource };
