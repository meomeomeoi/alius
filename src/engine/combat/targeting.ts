import type { Registries } from '../../content/types';
import type { Skill } from '../../content/schemas';
import type { CombatState, Combatant, Side } from './types';

export const skillById = (reg: Registries, id: string): Skill | undefined => reg.skills.get(id) as unknown as Skill | undefined;

export const byCid = (cs: CombatState, cid: string): Combatant => {
  const c = cs.combatants.find((x) => x.cid === cid);
  if (!c) throw new Error(`Unknown combatant "${cid}"`);
  return c;
};

export const isStanding = (c: Combatant): boolean => !c.downed && c.hp > 0;
export const living = (cs: CombatState, side: Side): Combatant[] => cs.combatants.filter((c) => c.side === side && isStanding(c));
export const opposite = (side: Side): Side => (side === 'squad' ? 'enemy' : 'squad');

/** A status carries a flag when the registry says so; without a registry the flag name is the status id. */
export function hasFlag(c: Combatant, reg: Registries | undefined, flag: 'taunt' | 'untargetable' | 'skipTurn' | 'absorb' | 'rooted'): boolean {
  return c.statuses.some((s) => {
    if (!reg) return s.id === flag;
    return ((reg.statuses.get(s.id)?.flags as string[] | undefined) ?? []).includes(flag);
  });
}

const hasEffect = (skill: Skill, type: string): boolean => skill.effects.some((e) => e.type === type);

/**
 * Who the actor may pick with `skill` (primary targets). `usableFrom` is checked against the actor's row. Enemies:
 * rows from `targets.rows`; melee only hits the front while it stands; any effect with `ignoreRows` reaches
 * everyone; taunters restrict the choice; untargetable units and (while she lives) a locked target are handled.
 */
export function legalTargets(cs: CombatState, actorCid: string, skill: Skill, reg?: Registries): string[] {
  const actor = byCid(cs, actorCid);
  if (skill.usableFrom && !skill.usableFrom.includes(actor.row)) return [];
  const targets = skill.targets;
  if (!targets) return [];
  if (targets.side === 'self') return [actor.cid];

  if (targets.side === 'ally') {
    const allies = cs.combatants.filter((c) => c.side === actor.side);
    const pool = hasEffect(skill, 'revive') ? allies.filter((c) => c.downed || c.hp <= 0) : allies.filter(isStanding);
    return pool.filter((c) => c.cid === actor.cid || !hasFlag(c, reg, 'untargetable')).map((c) => c.cid);
  }

  const enemies = living(cs, opposite(actor.side)).filter((c) => !hasFlag(c, reg, 'untargetable'));
  const ignoreRows = skill.effects.some((e) => e.type === 'damage' && e.ignoreRows === true);
  let eligible: Combatant[];
  if (ignoreRows) eligible = enemies;
  else {
    eligible = enemies.filter((c) => targets.rows.includes(c.row));
    if (targets.melee) {
      const front = eligible.filter((c) => c.row === 'front');
      // melee reaches the back only when no enemy (of any untargetable status) stands in front
      const anyFront = living(cs, opposite(actor.side)).some((c) => c.row === 'front');
      eligible = front.length > 0 || anyFront ? front : eligible;
    }
  }
  const taunters = eligible.filter((c) => hasFlag(c, reg, 'taunt'));
  if (taunters.length > 0) eligible = taunters;
  if (actor.lockedTargetId) {
    const locked = eligible.find((c) => c.cid === actor.lockedTargetId);
    if (locked) eligible = [locked];
  }
  const out = eligible.map((c) => c.cid);
  // an exposed commander stands in the squad's back row: enemy skills that reach the back may pick him (his cover takes the hit)
  if (actor.side === 'enemy' && cs.commander && !cs.commander.downed && taunters.length === 0) {
    const frontStands = living(cs, 'squad').some((c) => c.row === 'front');
    const reachesBack = ignoreRows || (targets.rows.includes('back') && (!targets.melee || !frontStands));
    if (reachesBack) out.push('commander');
  }
  return out;
}

/** Everyone a skill hits once the primary target is chosen: one, the primary's row, or every legal target. */
export function expandTargets(cs: CombatState, actorCid: string, skill: Skill, primaryCid: string | undefined, reg?: Registries): string[] {
  const targets = skill.targets;
  if (!targets) return [];
  if (targets.side === 'self') return [actorCid];
  const legal = legalTargets(cs, actorCid, skill, reg);
  if (targets.count === 'all') {
    // an all-target skill reaches every standing member of the side, whatever the row restrictions of single picks
    const actor = byCid(cs, actorCid);
    const side = targets.side === 'ally' ? actor.side : opposite(actor.side);
    return living(cs, side).filter((c) => !hasFlag(c, reg, 'untargetable') || c.cid === actorCid).map((c) => c.cid);
  }
  if (primaryCid === undefined || !legal.includes(primaryCid)) return [];
  if (targets.count === 'one' || primaryCid === 'commander') return [primaryCid];
  const primary = byCid(cs, primaryCid);
  return cs.combatants
    .filter((c) => c.side === primary.side && c.row === primary.row && isStanding(c) && !hasFlag(c, reg, 'untargetable'))
    .map((c) => c.cid);
}

const rowRank = (c: Combatant): number => (c.row === 'front' ? 0 : 1);

/** Nearest standing combatant: front row first, then lowest index. `any` also considers the actor's own side. */
export function nearest(cs: CombatState, cid: string, side: Side | 'any', reg?: Registries): string | undefined {
  const self = byCid(cs, cid);
  const pool = cs.combatants.filter((c) => c.cid !== cid && isStanding(c) && !hasFlag(c, reg, 'untargetable')
    && (side === 'any' || c.side === side));
  pool.sort((a, b) => rowRank(a) - rowRank(b) || (a.side === self.side ? 1 : 0) - (b.side === self.side ? 1 : 0) || a.index - b.index);
  return pool[0]?.cid;
}

/** Highest current ATK, then highest HP. `atkOf` lets the caller pass effective ATK. */
export function strongest(cs: CombatState, side: Side, atkOf: (c: Combatant) => number = (c) => c.base.atk): string | undefined {
  const pool = living(cs, side);
  pool.sort((a, b) => atkOf(b) - atkOf(a) || b.hp - a.hp || a.index - b.index);
  return pool[0]?.cid;
}

export function lowestHpPct(cs: CombatState, side: Side): string | undefined {
  const pool = living(cs, side);
  pool.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.index - b.index);
  return pool[0]?.cid;
}
