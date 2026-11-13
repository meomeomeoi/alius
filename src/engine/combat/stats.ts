import type { Registries } from '../../content/types';
import { wornItems, itemStats } from '../items';
import type { CampaignState, Difficulty, Unit } from '../state/types';
import { TUNING } from '../tuning';
import type { Encounter, StatName, Stats } from './types';
import { STATS } from './types';

export type { Stats } from './types';

const ZERO: Stats = { hp: 0, atk: 0, def: 0, spd: 0, crit: 0 };
const WEIGHT_ORDER = ['light', 'medium', 'heavy'] as const;

/** The heaviest worn armor piece decides the SPD penalty (light 0, medium −1, heavy −3). */
function armorSpdPenalty(state: CampaignState, reg: Registries, unit: Unit): number {
  let heaviest = -1;
  for (const { inst, slot } of wornItems(state, reg, unit)) {
    if (slot === 'weapon') continue;
    const w = WEIGHT_ORDER.indexOf(reg.items.get(inst.itemId)!.class as (typeof WEIGHT_ORDER)[number]);
    if (w > heaviest) heaviest = w;
  }
  return heaviest < 0 ? 0 : TUNING.combat.armorSpd[WEIGHT_ORDER[heaviest]];
}

/**
 * Effective stats of a unit: role base + `floor(growth × (level − 1))`, then equipment (flat stats, then the affix
 * percentages of the wearer's total), then armor SPD, then −10 % per injury (at most 3), each stat floored at 1 (CRIT at 0). `unit.baseStats` stays the role base.
 */
export function unitStats(state: CampaignState, reg: Registries, unit: Unit): Stats {
  const role = reg.roles.get(unit.roleId);
  if (!role) throw new Error(`Unknown role "${unit.roleId}" (unit ${unit.id})`);
  const growth = (role.growth as Stats | undefined) ?? ZERO;
  const out: Stats = { ...ZERO };
  for (const k of STATS) out[k] = unit.baseStats[k] + Math.floor(growth[k] * (unit.level - 1));
  const pct: Stats = { ...ZERO };
  for (const { inst } of wornItems(state, reg, unit)) {
    const it = itemStats(reg, inst);
    if (!it) continue;
    for (const k of STATS) {
      out[k] += it.stats[k] ?? 0;
      pct[k] += it.statPct[k] ?? 0;
    }
  }
  for (const k of STATS) out[k] = Math.round(out[k] * (1 + pct[k] / 100));
  out.spd += armorSpdPenalty(state, reg, unit);
  const stacks = Math.min(unit.injuries.length, TUNING.combat.injuryMaxStacks);
  const factor = 1 + (TUNING.combat.injuryStatPct * stacks) / 100;
  for (const k of STATS) out[k] = Math.max(k === 'crit' ? 0 : 1, Math.round(out[k] * factor));
  return out;
}

export interface StatStep {
  source: 'role' | 'level' | 'gear' | 'armor' | 'injury' | 'floor';
  /** Plain text; a worn item is the link `[[items:<id>]]`. */
  label: string;
  /** The stat after this step. */
  total: number;
}

/**
 * How one stat of `unitStats` is built, in the same order: role base, level growth, each worn item's flat
 * stat, the affix percentages, armor SPD, injuries, the floor. Steps that change nothing are left out and the
 * last `total` is `unitStats(...)[stat]`.
 */
export function unitStatSteps(state: CampaignState, reg: Registries, unit: Unit, stat: StatName): StatStep[] {
  const role = reg.roles.get(unit.roleId);
  if (!role) throw new Error(`Unknown role "${unit.roleId}" (unit ${unit.id})`);
  const growth = (role.growth as Stats | undefined) ?? ZERO;
  const steps: StatStep[] = [];
  let total = unit.baseStats[stat];
  steps.push({ source: 'role', label: 'Role base', total });
  const grown = Math.floor(growth[stat] * (unit.level - 1));
  if (grown !== 0) {
    total += grown;
    steps.push({ source: 'level', label: `Level ${unit.level}`, total });
  }
  let pct = 0;
  for (const { inst } of wornItems(state, reg, unit)) {
    const it = itemStats(reg, inst);
    if (!it) continue;
    const flat = it.stats[stat] ?? 0;
    if (flat !== 0) {
      total += flat;
      steps.push({ source: 'gear', label: `[[items:${inst.itemId}]]`, total });
    }
    pct += it.statPct[stat] ?? 0;
  }
  const scaled = Math.round(total * (1 + pct / 100));
  if (scaled !== total) {
    total = scaled;
    steps.push({ source: 'gear', label: 'Gear bonuses', total });
  }
  if (stat === 'spd') {
    const penalty = armorSpdPenalty(state, reg, unit);
    if (penalty !== 0) {
      total += penalty;
      steps.push({ source: 'armor', label: 'Armor weight', total });
    }
  }
  const stacks = Math.min(unit.injuries.length, TUNING.combat.injuryMaxStacks);
  const factor = 1 + (TUNING.combat.injuryStatPct * stacks) / 100;
  const injured = Math.round(total * factor);
  if (stacks > 0 && injured !== total) {
    total = injured;
    steps.push({ source: 'injury', label: `Injuries ×${stacks}`, total });
  }
  const floor = stat === 'crit' ? 0 : 1;
  if (total < floor) {
    total = floor;
    steps.push({ source: 'floor', label: 'Minimum', total });
  }
  return steps;
}

export function statPower(s: Stats): number {
  return (s.hp * 0.2 + s.atk * 2 + s.def + s.spd * 1.5) * (1 + s.crit / 200);
}

export function squadPower(state: CampaignState, reg: Registries, unitIds: string[]): number {
  let sum = 0;
  for (const id of unitIds) {
    const u = state.squad.find((x) => x.id === id);
    if (u) sum += statPower(unitStats(state, reg, u));
  }
  return sum;
}

/**
 * Enemy stats at a level: `(base + growth × (level − 1)) × difficulty × (1 + Σ affix %)`. Difficulty scales HP, ATK
 * and DEF only (SPD would reshuffle initiative); hp and atk floor at 1, the others at 0.
 */
export function enemyStats(reg: Registries, enemyId: string, level: number, affixes: string[], difficulty: Difficulty): Stats {
  const tpl = reg.enemies.get(enemyId);
  if (!tpl) throw new Error(`Unknown enemy "${enemyId}"`);
  const { base, growth } = tpl.stats as { base: Stats; growth: Stats };
  const diff = TUNING.combat.difficultyMult[difficulty];
  const pct: Stats = { ...ZERO };
  for (const id of affixes) {
    const sp = reg.affixes.get(id)?.statPct as Partial<Stats> | undefined;
    if (sp) for (const k of STATS) pct[k] += sp[k] ?? 0;
  }
  const out: Stats = { ...ZERO };
  for (const k of STATS) {
    const scaled = base[k] + growth[k] * (level - 1);
    const d = k === 'hp' || k === 'atk' || k === 'def' ? diff : 1;
    out[k] = Math.max(k === 'hp' || k === 'atk' ? 1 : 0, Math.round(scaled * d * (1 + pct[k] / 100)));
  }
  return out;
}

export function encounterPower(reg: Registries, encounter: Encounter, difficulty: Difficulty): number {
  let sum = 0;
  for (const e of encounter.enemies) {
    const weight = (reg.enemies.get(e.enemyId)?.power as number | undefined) ?? 1;
    sum += statPower(enemyStats(reg, e.enemyId, e.level, e.affixes, difficulty)) * weight;
  }
  return sum;
}

/** Front-row roles go front, back-row roles back, `either` fills the smaller row; never more than 3 in a row. */
export function defaultFormation(state: CampaignState, reg: Registries, unitIds: string[]): { front: string[]; back: string[] } {
  const front: string[] = [];
  const back: string[] = [];
  const max = TUNING.combat.maxPerRow;
  const rowOf = (id: string): string => {
    const u = state.squad.find((x) => x.id === id);
    return (u && (reg.roles.get(u.roleId)?.row as string | undefined)) ?? 'either';
  };
  for (const id of unitIds) {
    const row = rowOf(id);
    if (row === 'front') (front.length < max ? front : back).push(id);
    else if (row === 'back') (back.length < max ? back : front).push(id);
  }
  for (const id of unitIds) {
    if (rowOf(id) !== 'either') continue;
    (front.length < back.length && front.length < max ? front : back.length < max ? back : front).push(id);
  }
  // keep the caller's order inside each row
  const order = (xs: string[]) => [...xs].sort((a, b) => unitIds.indexOf(a) - unitIds.indexOf(b));
  return { front: order(front), back: order(back) };
}
