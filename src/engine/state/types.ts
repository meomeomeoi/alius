import type { CombatResult, CombatState } from '../combat/types';
import type { DilemmaState } from '../dilemma/types';
import type { RngState } from '../rng';
import type { Clock, DirectorRequest, ExpeditionReport, ExpeditionState, Mission, RegionState, Rumor, Thread } from '../world/types';

export type Slot = 'morning' | 'afternoon' | 'evening' | 'night';
export type Difficulty = 'story' | 'normal' | 'hard';
export type UnitKind = 'named' | 'grunt';
export type UnitStatus = 'active' | 'reserve' | 'injured' | 'deserted' | 'dead' | 'terminated';
export type LoyaltyBand = 'steady' | 'wavering' | 'breaking';

/** Reserved in v1: `Relation.marks` is always empty (overview §10). */
export type MarkInstance = { id: string };

export const VALUE_AXES = ['pragmatism', 'autonomy', 'ingroup', 'mercy', 'corporate', 'sacrifice'] as const;
export type ValueAxis = (typeof VALUE_AXES)[number];

export const RARITIES = ['standard', 'refined', 'prototype', 'corporate', 'anomalous'] as const;
export type Rarity = (typeof RARITIES)[number];

/** One owned item (P4). `Unit.equipment[slot]` holds its `uid`; it is the only record of who wears it. */
export interface ItemInstance {
  uid: string;
  itemId: string;
  rarity: Rarity;
  /** Upgrade level 0–5. */
  upgrade: number;
  affixes: string[];
}

export type LootDrop =
  | { kind: 'item'; item: ItemInstance }
  | { kind: 'credits' | 'plyx' | 'supplies'; amount: number };

export type LeashKind = 'compel' | 'suppress' | 'terminate';

/** One Leash use. P3's `resentful` state counts entries by `unitId`. */
export interface LeashLogEntry {
  no: number;
  unitId: string;
  kind: LeashKind;
  day: number;
  context: 'scene' | 'combat' | 'arc' | 'desertion' | 'mutiny' | 'pda';
  outcome: 'done' | 'failed' | 'denied';
}

/** Per unit loyalty bookkeeping (P6). */
export interface LoyaltyRecord {
  signs: Array<{ day: number; about: 'doubt' | 'desertion' | 'mutiny'; kind: 'dm' | 'fact' | 'talk'; signId: string }>;
  attempts: number;
  nextCheckDay?: number;
  /** The earliest day of her next `doubt` sign while she is wavering (a unit that has just started wavering waits first). */
  nextDoubtDay?: number;
  trigger?: { kind: 'leash' | 'betrayal' | 'forced_cure'; day: number };
  cause?: { kind: 'attack' | 'desertion'; day: number };
  deniedDay?: number;
  desertedDay?: number;
  stance?: 'hostile' | 'ally';
  returned?: boolean;
}

/** A desertion, mutiny or return waiting for the commander's answer. */
export interface Confrontation {
  kind: 'desertion' | 'mutiny' | 'return';
  unitId: string;
  day: number;
  at: 'night' | 'mission_start';
  nightEntryId?: string;
  talkTried?: boolean;
  sympathizers?: string[];
  combatId?: string;
}

export interface DefectInstance {
  id: string;
  arc?: string;
  /** In-universe origin line written at import (P1). */
  origin?: string;
  /** Grunt defect: no arc (P2). */
  lite?: boolean;
  /** Day a Manage-arc defect was last maintained in the medbay (P2). */
  upkeepDay?: number;
  /** Progress of a defect arc path (P6). */
  arcSteps?: { done: number; needed: number; lastDay?: number };
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
  /** Equipped active skills (P4); absent = the role's starter skills. */
  loadout?: string[];
  /** Set while the unit is broken down: until the expedition ends (P4). */
  breakdown?: { defectId: string; day: number };
  /** P7: up to 3 taste ids (registry `tastes`) about how the unit reads the commander. */
  commanderTastes?: string[];
}

export interface DailyGain {
  trust: number;
  affinity: number;
  attraction: number;
}

export type Severity = 'minor' | 'moderate' | 'major' | 'extreme';

/** One line of a relation's story (P3). Trimmed to `TUNING.relations.historyMax`. */
export interface HistoryEntry {
  day: number;
  kind: 'event' | 'state' | 'proposal' | 'mark';
  type: string;
  severity?: Severity;
  detail?: string;
}

export interface Relation {
  trust: number;
  affinity: number;
  attraction: number;
  stateId: string;
  stateSince: number;
  history: HistoryEntry[];
  flags: string[];
  dailyGain: DailyGain;
  loyaltyBand: LoyaltyBand;
  marks: MarkInstance[];
  /** A concealed romance (P3): the state it will turn into when discovered, and who must not know. */
  affair?: { as: string; hiddenFrom: string[]; since: number };
  /** P7: the first day the unit knew the commander (absent in older saves until `commander/seed`). */
  metDay?: number;
}

/** A remembered fact (P3). `knownBy` holds unit ids or `'*'` for public; the commander always knows. */
export interface Fact {
  id: string;
  about: string[];
  text: string;
  tags: string[];
  importance: 1 | 2 | 3 | 4 | 5;
  day: number;
  sceneId?: string;
  knownBy: string[];
}

export interface PromiseRecord {
  id: string;
  by: string;
  to: string;
  text: string;
  status: 'open' | 'kept' | 'broken';
  day: number;
  deadlineDay?: number;
  /** Unit ids (or `'*'`) who heard the promise; absent = visible to everyone (P2-era saves). The commander always knows. */
  knownBy?: string[];
}

export interface ChronicleEntry {
  id: string;
  kind: 'scene' | 'day' | 'week';
  day: number;
  toDay?: number;
  text: string;
  sceneId?: string;
  /** The slot a scene line belongs to (scene entries only; compacted entries have none). */
  slot?: Slot;
}

export type SceneOrigin = 'activity' | 'night' | 'mess' | 'event' | 'debrief';

/** The open scene (P3). The transcript stays in the ST chat; only the start index is stored. */
export interface SceneRecord {
  id: string;
  day: number;
  slot: Slot;
  locationId: string;
  participants: string[];
  mode: 'private' | 'group';
  origin: SceneOrigin;
  consumesSlot: boolean;
  startIndex: number;
  /** First chat index `intent_extract` has not read yet (survives a reload; absent in older saves = `startIndex`). */
  readIndex?: number;
  exchanges: number;
  nightEntryId?: string;
  /** Orders a unit refused in this scene, with the exchange number (P6). */
  refusals?: Array<{ unitId: string; exchange: number }>;
}

export interface PendingProposal {
  id: string;
  unitId: string;
  kind: string;
  from: 'unit' | 'commander';
  day: number;
  channel: 'scene' | 'dm';
  targetState: string;
  needsDisclosure: boolean;
}

export interface DmMessage {
  id: string;
  from: 'commander' | string;
  text: string;
  day: number;
  slot: Slot;
  read: boolean;
  initiated?: boolean;
}

export interface NightEntry {
  id: string;
  unitId: string;
  kind: string;
  priority: number;
  framing: string;
  ignore: { event: string; severity: Severity };
  expiresDay: number;
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
  /** P7: physical stats 1–5 (absent in a P0–P6 save until `commander/seed`; read through `commanderProfile`). */
  body?: Record<BodyStat, number>;
  /** P7: training progress in tenths of a session, per stat. */
  bodyXp?: Record<BodyStat, number>;
  /** P7: 1 very feminine … 5 very masculine. No mechanical value (overview P11). */
  expression?: number;
  /** P7: 1 green … 5 veteran. */
  seasoning?: number;
  /** P7: up to 2 regular traits and at most 1 special. */
  traits?: { regular: string[]; special?: string };
  /** P7: derived from the body sum, cached. */
  archetype?: Archetype;
  /** P7: false until the player has seen the "commander file incomplete" modal of a migrated save. */
  fileReviewed?: boolean;
  /** P7: the day (a quiet night's follower) on which the effective Empathy rank is lowered by `sleepless_rank`. */
  sleeplessDay?: number;
}

export type BodyStat = 'strength' | 'endurance' | 'reflexes';
export type Archetype = 'frail' | 'slight' | 'average' | 'fit' | 'hardened';

/** One change of a resource, a unit's stress or a relation axis, recorded by `dispatch` (P7a). */
export interface LedgerEntry {
  day: number;
  slot: Slot;
  /** The action type that caused it, e.g. `activity/do`. */
  action: string;
  /** `res:<resource>`, `stress:<unitId>` or `axis:<unitId>:<axis>`. */
  key: string;
  delta: number;
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
  inventory: ItemInstance[];
  /** Counter behind item uids `it_<n>` (P4). */
  itemSeq?: number;
  world: {
    regions: Record<string, RegionState>;
    clocks: Clock[];
    threads: Thread[];
    factions: Record<string, number>;
    flags: string[];
    spineProgress: number;
    /** Id of the start this campaign began with (P1). */
    startId?: string;
    /** Clearance tier 0–3 that raises the level cap (P5 writes it, P4 reads it). */
    clearanceTier?: number;
    /** `seedWorld` has run (P5). Older saves load without it and are seeded by `world/seed`. */
    seeded?: boolean;
    /** Spine bookkeeping (P5): the beat the director proposed and when. */
    spine?: { proposed?: string; proposedDay?: number; lastProposalDay?: number };
    /** The open director request, if any, and the last tick (P5). */
    director?: {
      pending?: DirectorRequest;
      lastTickDay?: number;
      seq?: number;
      /** The last day the fallback advanced a clock (it does so once per day). */
      lastClockDay?: number;
      /** A full request that arrived while a scout request was open: opened as soon as that one is answered. */
      after?: 'day_end' | 'expedition';
    };
    /** Named units the story offered that the player has not answered yet (P5). */
    incomingUnits?: number;
    lastExpeditionRegionId?: string;
  };
  missions: { offered: Mission[]; active: Mission[]; completed: Mission[] };
  rumors: Rumor[];
  dms: Record<string, DmMessage[]>;
  /** Per unit: the day and how many commander DMs were sent that day (the unit's "social battery", P3). */
  dmMeta?: Record<string, { day: number; sent: number }>;
  memory: { facts: Fact[]; chronicle: ChronicleEntry[]; promises?: PromiseRecord[]; nextId?: number };
  /** Recent changes of resources, stress and relation axes (P7a): the newest 150 entries of the last 7 days. Absent in older saves. */
  ledger?: LedgerEntry[];
  /** The open scene, if any (P3). */
  scene?: SceneRecord;
  /** Open proposals waiting for the commander's answer (P3). */
  proposals?: PendingProposal[];
  calendar: {
    scheduled: unknown[];
    nightEventsQueue: NightEntry[];
    /** Consecutive days with a supply shortage (P2). */
    shortageStreak?: number;
    /** The queue entry being played in the current Night slot (P2 moves it here; P3 reads it). */
    nightEvent?: NightEntry;
    /** A conversation requested by `talk` that has not ended yet; it holds its slot (P2). P3 ends it with `scene_end`. */
    pendingScene?: { unitId: string; day: number; slot: Slot };
  };
  /** `log` stays `unknown[]` on purpose: `leashLog(state)` filters the well-formed entries, older saves may hold others. */
  leash: { authorizationsLeft: number; refreshDay: number; log: unknown[]; seq?: number; seeded?: boolean };
  /** Loyalty, signs and open confrontations (P6). Absent in older saves. */
  disloyalty?: { units: Record<string, LoyaltyRecord>; open?: Confrontation };
  /** Dilemma bookkeeping and the open dilemma (P6). Absent in older saves. */
  dilemmas?: {
    seq: number;
    lastDay?: number;
    lastDefiningDay?: number;
    definingBeats?: string[];
    recent?: string[];
    open?: DilemmaState;
  };
  /** The open expedition (P5). Only expedition/combat/director/debug actions run while it is open. */
  expedition?: ExpeditionState;
  /** The last finished expedition's after-action report (P5). */
  lastExpedition?: ExpeditionReport;
  /** The open combat (P4). Only `combat` and `rng` change while it runs. */
  combat?: CombatState;
  /** The last finished combat, for P5's recap and debrief (P4). */
  lastCombat?: CombatResult;
  /** An open workshop session of a given day (P4). */
  workshopSession?: { day: number; opsLeft: number; companionId?: string };
  /** Cached display names of affixed enemies, keyed `enemyId|affixes` (P4; at most 100). */
  enemyNames?: Record<string, string>;
}
