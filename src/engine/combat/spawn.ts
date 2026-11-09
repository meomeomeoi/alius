import type { Registries } from '../../content/types';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { enemyStats } from './stats';
import type { CombatState, Combatant, EffectSpec, Row } from './types';

export const enemyNameKey = (enemyId: string, affixes: string[]): string =>
  `${enemyId}|${[...affixes].sort().join(',')}`;

/**
 * Creates an enemy combatant and appends it to `cs` (next free `e<n>` cid). The row is the requested one or the
 * archetype's preference, overflowing to the other row when the preferred one holds three already.
 */
export function spawnEnemy(
  cs: CombatState, state: CampaignState, reg: Registries,
  spec: { enemyId: string; level: number; affixes: string[]; row?: Row }, summonedBy?: string,
): Combatant | null {
  const tpl = reg.enemies.get(spec.enemyId);
  if (!tpl) throw new Error(`Unknown enemy "${spec.enemyId}"`);
  const enemies = cs.combatants.filter((c) => c.side === 'enemy');
  const inRow = (r: Row) => enemies.filter((c) => c.row === r).length;
  const preferred = spec.row ?? (tpl.rowPreference as Row);
  const other: Row = preferred === 'front' ? 'back' : 'front';
  const row = inRow(preferred) < TUNING.combat.maxPerRow ? preferred : inRow(other) < TUNING.combat.maxPerRow ? other : null;
  if (row === null) return null;

  const stats = enemyStats(reg, spec.enemyId, spec.level, spec.affixes, state.difficulty);
  const skills = [...(tpl.skills as string[])];
  const passives: Array<EffectSpec & { source: string }> = [];
  for (const id of spec.affixes) {
    const a = reg.affixes.get(id);
    if (!a) continue;
    if (a.extraSkill === true && typeof tpl.eliteSkill === 'string') skills.push(tpl.eliteSkill);
    for (const e of (a.effects as EffectSpec[]) ?? []) passives.push({ ...e, source: `affix:${id}` });
  }
  const c: Combatant = {
    cid: `e${cs.nextCid}`,
    side: 'enemy',
    enemyId: spec.enemyId,
    nameKey: enemyNameKey(spec.enemyId, spec.affixes),
    level: spec.level,
    row,
    index: enemies.reduce((m, x) => Math.max(m, x.index + 1), 0),
    hp: stats.hp,
    maxHp: stats.hp,
    base: stats,
    stress: 0,
    statuses: [],
    mods: [],
    cooldowns: {},
    skills,
    passives,
    downed: false,
    aiProfile: tpl.aiProfile as string,
    usedLimits: [],
    ...(summonedBy ? { summonedBy } : {}),
  };
  cs.nextCid += 1;
  cs.combatants.push(c);
  return c;
}
