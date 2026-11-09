import type { CombatState, Combatant, EffectSpec, Row, StatusInstance } from '../../src/engine/combat/types';
import { Rng, seedRng } from '../../src/engine/rng';

export interface FixtureCombatant {
  cid?: string;
  row?: Row;
  hp?: number;
  maxHp?: number;
  atk?: number;
  def?: number;
  spd?: number;
  crit?: number;
  stress?: number;
  level?: number;
  skills?: string[];
  passives?: Array<EffectSpec & { source: string }>;
  statuses?: Array<Partial<StatusInstance> & { id: string }>;
  downed?: boolean;
  aiProfile?: string;
  unitId?: string;
  enemyId?: string;
  breakdown?: Combatant['breakdown'];
  lockedTargetId?: string;
}

const make = (side: 'squad' | 'enemy', f: FixtureCombatant, i: number): Combatant => {
  const maxHp = f.maxHp ?? f.hp ?? 100;
  return {
    cid: f.cid ?? `${side === 'squad' ? 's' : 'e'}${i + 1}`,
    side,
    unitId: f.unitId ?? (side === 'squad' ? `unit_${i}` : undefined),
    enemyId: f.enemyId ?? (side === 'enemy' ? 'husk' : undefined),
    nameKey: `${side}${i}`,
    level: f.level ?? 1,
    row: f.row ?? 'front',
    index: i,
    hp: f.downed ? 0 : f.hp ?? maxHp,
    maxHp,
    base: { hp: maxHp, atk: f.atk ?? 20, def: f.def ?? 10, spd: f.spd ?? 10, crit: f.crit ?? 0 },
    stress: f.stress ?? 0,
    statuses: (f.statuses ?? []).map((s) => ({ turns: 2, stacks: 1, sourceCid: 's1', ...s })),
    mods: [],
    cooldowns: {},
    skills: f.skills ?? [],
    passives: f.passives ?? [],
    downed: f.downed ?? false,
    aiProfile: f.aiProfile ?? 'aggressive',
    breakdown: f.breakdown,
    lockedTargetId: f.lockedTargetId,
    usedLimits: [],
  };
};

/** A hand-built combat: squad cids `s1…`, enemy cids `e1…` (override with `cid`). */
export function fixtureCombat(o: { squad?: FixtureCombatant[]; enemies?: FixtureCombatant[]; cp?: number; round?: number } = {}): CombatState {
  const squad = (o.squad ?? [{}]).map((f, i) => make('squad', f, i));
  const enemies = (o.enemies ?? [{}]).map((f, i) => make('enemy', f, i));
  return {
    id: 'cmb_test',
    round: o.round ?? 1,
    phase: 'awaiting',
    cp: o.cp ?? 1,
    timeline: [],
    turn: 0,
    combatants: [...squad, ...enemies],
    encounter: { enemies: [], danger: 1 },
    formation: { front: [], back: [] },
    log: [],
    auto: false,
    allowRetry: false,
    expedition: false,
    bankLoot: false,
    start: { rng: seedRng(1), payload: { encounter: { enemies: [], danger: 1 }, formation: { front: [], back: [] } } },
    ordersThisRound: [],
    pendingLootRolls: 0,
    hints: [],
    nextCid: 1,
  };
}

export const rngOf = (seed = 1) => new Rng(seedRng(seed));
