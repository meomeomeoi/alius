import type { Rng } from '../rng';
import { TUNING } from '../tuning';
import type { CombatState, Combatant } from './types';

/**
 * `dmg = round(ATK × mult × 100/(100+DEF) × (crit ? 1.5 : 1) × rand(0.9, 1.1))`, at least 1 (roles.md §1).
 * Draws exactly one number from the rng.
 */
export function rollDamage(rng: Rng, o: { atk: number; mult: number; def: number; crit: boolean }): number {
  const [lo, hi] = TUNING.combat.variance;
  const variance = lo + (hi - lo) * rng.float();
  const raw = o.atk * o.mult * (100 / (100 + Math.max(0, o.def))) * (o.crit ? TUNING.combat.critMult : 1) * variance;
  return Math.max(1, Math.round(raw));
}

/** Draws exactly one number; 0 % never crits, 100 % always. */
export function rollCrit(rng: Rng, critPct: number): boolean {
  return rng.float() * 100 < critPct;
}

/**
 * The round's turn order: living, non-downed combatants by `SPD + rng.int(0, 3)`, highest first. Ties: squad first,
 * then higher base SPD, then lower index. `spdOf` lets the caller pass the effective SPD (statuses, mods).
 */
export function initiativeOrder(cs: CombatState, rng: Rng, spdOf: (c: Combatant) => number = (c) => c.base.spd): string[] {
  const keyed = cs.combatants
    .filter((c) => !c.downed && c.hp > 0)
    .map((c) => ({ c, key: spdOf(c) + rng.int(0, TUNING.combat.initiativeRand) }));
  keyed.sort((a, b) =>
    b.key - a.key
    || (a.c.side === b.c.side ? 0 : a.c.side === 'squad' ? -1 : 1)
    || b.c.base.spd - a.c.base.spd
    || a.c.index - b.c.index);
  return keyed.map((k) => k.c.cid);
}
