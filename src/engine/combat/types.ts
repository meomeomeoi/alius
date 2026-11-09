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
  'lowest_hp_ally', 'commander',
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
    | { type: 'damage'; mult: number; hits?: number; ignoreRows?: boolean; critBonus?: number; scale?: Scale }
    | { type: 'heal'; pctMaxHp: number }
    | { type: 'revive'; pctMaxHp: number }
    | { type: 'status'; statusId: string; turns?: number; stacks?: number }
    | { type: 'cleanse'; kind: 'buff' | 'debuff'; count: number }
    /** `stat: 'all'` applies to hp, atk, def and spd. For `crit`, `pct` is added as percentage points. */
    | { type: 'stat'; stat: StatName | 'all'; pct: number; turns?: number; scale?: Scale }
    | { type: 'outgoing'; pct: number; vs?: 'any' | 'marked' | 'locked' }
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
