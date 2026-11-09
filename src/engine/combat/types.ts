import type { RngState } from '../rng';
import type { LootDrop, Severity } from '../state/types';

/**
 * Combat effect vocabulary (P4). Every combat behaviour of skills, signatures, defects, statuses, synergies,
 * CP orders, enemy affixes and items is a list of `EffectSpec`s interpreted by one runner (`effects.ts`).
 * Only pure types and const arrays live here: the content schemas import them.
 */

export const TRIGGERS = [
  'onCombatStart', 'onRoundStart', 'onTurnStart', 'onAction', 'onHit', 'onCrit', 'onDamaged',
  'onAllyDowned', 'onKill', 'onStressThreshold', 'onCombatEnd',
] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const EFFECT_TYPES = [
  'damage', 'heal', 'revive', 'status', 'cleanse', 'stat', 'outgoing', 'incoming', 'stress', 'stress_taken', 'cp',
  'move', 'extra_action', 'redirect', 'intercept_lethal', 'summon', 'follow_up', 'misfire', 'override_action',
  'lock_target', 'loot_roll', 'repeat_order', 'hp_set', 'immune', 'order_cost', 'order_refusal', 'loadout_slots',
  'injury_days',
] as const;
export type EffectType = (typeof EFFECT_TYPES)[number];

export const EFFECT_TARGETS = [
  'self', 'target', 'source', 'allies', 'allies_other', 'enemies', 'own_row', 'target_row', 'random_enemy',
  'lowest_hp_ally', 'commander', 'allies_front',
] as const;
export type EffectTarget = (typeof EFFECT_TARGETS)[number];

export const STATS = ['hp', 'atk', 'def', 'spd', 'crit'] as const;
export type StatName = (typeof STATS)[number];

export type Row = 'front' | 'back';

export interface Condition {
  hpBelowPct?: number;
  hpAbovePct?: number;
  stressMin?: number;
  stressMax?: number;
  roundMin?: number;
  targetHasStatus?: string;
  selfHasStatus?: string;
  aloneInRow?: boolean;
  sameRowAndSkill?: boolean;
  rowChanged?: boolean;
  commanderExposed?: boolean;
  notOrderedThisRound?: boolean;
  upkeepWithinDays?: number;
  upkeepOlderThanDays?: number;
}

/**
 * The value of `by` (a percentage 0–100; for `stress_above` the stress beyond `base`) times `per` is added to the
 * effect's `pct` (stat, outgoing) or `mult` (damage).
 */
export interface Scale {
  by: 'stress_above' | 'own_hp_missing_pct' | 'allies_hp_missing_pct';
  per: number;
  base?: number;
}

/** Fields every effect may carry. */
export interface EffectBase {
  /** Absent = on use for skills, always-on for passives. */
  trigger?: Trigger;
  /** Whose hit / crit / kill fires it (default `self`). */
  scope?: 'self' | 'ally';
  /** Only with `onStressThreshold`. */
  threshold?: 50 | 80 | 100;
  /** Default `target` for skills, `self` otherwise. */
  target?: EffectTarget;
  when?: Condition;
  chance?: number;
  /** Amplified ×1.5 while the owner is strained (stress ≥ 50). */
  downside?: boolean;
  limit?: 'round' | 'combat';
}

export type EffectSpec = EffectBase &
  (
    /** Exactly one of `mult` (ATK based) and `pctMaxHp` (true damage: ignores DEF, no crit, no variance). */
    | { type: 'damage'; mult?: number; pctMaxHp?: number; hits?: number; ignoreRows?: boolean; critBonus?: number; scale?: Scale }
    | { type: 'heal'; pctMaxHp: number }
    | { type: 'revive'; pctMaxHp: number }
    | { type: 'status'; statusId: string; turns?: number; stacks?: number }
    | { type: 'cleanse'; kind: 'buff' | 'debuff'; count: number }
    /** `stat: 'all'` applies to hp, atk, def and spd. For `crit`, `pct` is added as percentage points. */
    | { type: 'stat'; stat: StatName | 'all'; pct: number; turns?: number; scale?: Scale }
    | { type: 'outgoing'; pct: number; vs?: 'any' | 'marked' | 'locked'; scale?: Scale }
    | { type: 'incoming'; pct: number }
    | { type: 'stress'; amount: number }
    | { type: 'stress_taken'; pct: number; direction: 'gain' | 'relief' }
    | { type: 'cp'; amount: number }
    | { type: 'move'; to: 'front' | 'back' | 'swap' }
    | { type: 'extra_action' }
    | { type: 'redirect'; pct: number; turns: number; from: 'ally' | 'commander' }
    | { type: 'intercept_lethal'; protect: 'commander' | 'ally' }
    | { type: 'summon'; enemyId: string; max: number }
    | { type: 'follow_up'; mult: number }
    /** The chance of wasting the action is the common `chance` field. */
    | { type: 'misfire' }
    | { type: 'override_action'; policy: 'aggressive' }
    | { type: 'lock_target'; turns: number }
    | { type: 'loot_roll'; extra: number }
    | { type: 'repeat_order' }
    | { type: 'hp_set'; value: number }
    | { type: 'immune'; statusId: string }
    | { type: 'order_cost'; delta: number; orders?: string[] }
    /** The refusal chance is the common `chance` field. */
    | { type: 'order_refusal'; orders?: string[] }
    | { type: 'loadout_slots'; amount: number }
    | { type: 'injury_days'; pct: number }
  );

/** Effect types that only make sense while they react to a trigger or are applied once on use. */
export const ALWAYS_ON_TYPES: readonly EffectType[] = [
  'stat', 'outgoing', 'incoming', 'stress_taken', 'immune', 'order_cost', 'order_refusal', 'loadout_slots',
  'injury_days', 'intercept_lethal', 'misfire', 'override_action',
];

// ---------------------------------------------------------------------------------------------
// Combat state (lives in `CampaignState.combat` while a combat is open; plain JSON).

export type Stats = { hp: number; atk: number; def: number; spd: number; crit: number };
export type Side = 'squad' | 'enemy';

export interface StatusInstance {
  id: string;
  turns: number;
  stacks: number;
  /** Shield: remaining absorb value. */
  value?: number;
  sourceCid: string;
}

/** A timed stat modifier (percent; for crit, percentage points). */
export interface Mod {
  stat: StatName;
  pct: number;
  turnsLeft?: number;
  source: string;
}

export type BreakdownPolicy =
  | 'skip' | 'repeat_last' | 'random_skill' | 'attack' | 'await_order' | 'twice_then_shutdown' | 'normal';

export interface Combatant {
  cid: string;
  side: Side;
  unitId?: string;
  enemyId?: string;
  /** Key into `state.enemyNames` (enemies) or the unit's display name (squad). */
  nameKey: string;
  level: number;
  row: Row;
  index: number;
  hp: number;
  maxHp: number;
  base: Stats;
  stress: number;
  statuses: StatusInstance[];
  mods: Mod[];
  cooldowns: Record<string, number>;
  skills: string[];
  passives: Array<EffectSpec & { source: string }>;
  downed: boolean;
  aiProfile: string;
  breakdown?: {
    defectId: string;
    policy: BreakdownPolicy;
    target?: 'nearest_enemy' | 'strongest_enemy' | 'nearest_any' | 'nearest_ally';
    ignoresOrders: boolean;
    once?: boolean;
    used?: boolean;
    /** Actions taken under `twice_then_shutdown`. */
    count?: number;
    actionEffects: EffectSpec[];
  };
  lastSkillId?: string;
  lastTargetCid?: string;
  lastRow?: Row;
  lockedTargetId?: string;
  lockTurns?: number;
  /** `<source>:<index>:<round|combat>` keys of limited effects that already fired. */
  usedLimits: string[];
  /** Skills added by enemy affixes (the elite skill). */
  aiAffixSkills?: string[];
  /** Redirects this unit has accepted: damage meant for `fromCid` that she takes instead. */
  redirects?: Array<{ fromCid: string; pct: number; turnsLeft: number }>;
  /** The combatant (cid) that summoned this enemy. */
  summonedBy?: string;
}

export interface LogEntry {
  round: number;
  kind:
    | 'skill' | 'hit' | 'crit' | 'miss' | 'heal' | 'status' | 'downed' | 'revived' | 'order' | 'order_refused'
    | 'cover' | 'intercept' | 'breakdown' | 'stress' | 'summon' | 'pass';
  actor?: string;
  target?: string;
  amount?: number;
  skillId?: string;
  orderId?: string;
  statusId?: string;
}

export interface PlannedAction {
  kind: 'skill' | 'guard' | 'swap' | 'pass';
  skillId?: string;
  targetCid?: string;
}

export interface Encounter {
  enemies: Array<{ enemyId: string; level: number; affixes: string[]; row?: Row }>;
  exposesCommander?: boolean;
  lootTableId?: string;
  danger: number;
}

export interface StartPayload {
  encounter: Encounter;
  formation: { front: string[]; back: string[] };
  coverId?: string;
  allowRetry?: boolean;
  expedition?: boolean;
  bankLoot?: boolean;
}

export interface RelationHint {
  type: 'protected' | 'endangered';
  actor: 'commander' | string;
  targets: string[];
  severity: Severity;
}

export type CombatOutcome = 'won' | 'lost' | 'retreated';

export interface CombatState {
  id: string;
  round: number;
  /** `ended`: the fight is decided but not yet written back (finalize happens in the same dispatch from Task 14 on). */
  phase: 'awaiting' | 'lost_pending' | 'ended';
  outcome?: CombatOutcome;
  cp: number;
  timeline: string[];
  turn: number;
  combatants: Combatant[];
  commander?: { hp: number; maxHp: number; def: number; coverId: string; downed: boolean };
  encounter: Encounter;
  formation: { front: string[]; back: string[] };
  log: LogEntry[];
  auto: boolean;
  allowRetry: boolean;
  expedition: boolean;
  bankLoot: boolean;
  start: { rng: RngState; payload: StartPayload };
  ordersThisRound: Array<{ orderId: string; targetCid?: string }>;
  lastOrder?: { orderId: string; targetCid?: string };
  /** The combatant who acts again right now (`extra_action`). */
  extraAction?: string;
  pendingLootRolls: number;
  hints: RelationHint[];
  /** Next number for summoned enemy ids. */
  nextCid: number;
  /** Set when the commander went down. */
  commanderDown?: boolean;
  /** `repeat_order` fired: the order engine repeats `lastOrder` for free (read by orders.ts). */
  repeatOrder?: boolean;
}

// ---------------------------------------------------------------------------------------------
// Result of a finished combat (`CampaignState.lastCombat`).

export interface CombatResult {
  id: string;
  day: number;
  outcome: CombatOutcome;
  rounds: number;
  formation: { front: string[]; back: string[] };
  participants: string[];
  enemies: Array<{ enemyId: string; level: number; affixes: string[]; name: string; downed: boolean }>;
  log: LogEntry[];
  xp: Record<string, number>;
  levelUps: Array<{ unitId: string; level: number }>;
  loot: LootDrop[];
  banked: boolean;
  injuries: string[];
  deaths: string[];
  breakdowns: string[];
  stressDelta: Record<string, number>;
  relationHints: RelationHint[];
  commanderInjured: boolean;
}
