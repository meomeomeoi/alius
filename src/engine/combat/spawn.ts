import type { Registries } from '../../content/types';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { ownedUpgrades, unitSkillIds } from './skills';
import { enemyStats, unitStats } from './stats';
import type { CombatState, Combatant, EffectSpec, Row } from './types';

/** A generated enemy name: 1–3 words of letters (hyphens inside words allowed), at most 32 characters. */
export const ENEMY_NAME_PATTERN = /^[A-Za-z]+(?:-[A-Za-z]+)*(?: [A-Za-z]+(?:-[A-Za-z]+)*){0,2}$/;
export const isEnemyName = (s: unknown): s is string => typeof s === 'string' && s.length <= 32 && ENEMY_NAME_PATTERN.test(s);
/** Cache size of `state.enemyNames`. */
export const ENEMY_NAMES_MAX = 100;

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

/**
 * A squad unit on the enemy side (a mutiny): her stats and her own skills, only the passives of her defects (no
 * synergies, items or signature passive: she fights as who she is, not as the commander's soldier), her role's AI, no
 * stress. She is never written back as a squad unit (`finalizeCombat` lists her in `result.mutineers`).
 */
export function spawnMutineer(
  cs: CombatState, state: CampaignState, reg: Registries, spec: { unitId: string; row?: Row },
): Combatant | null {
  const unit = state.squad.find((u) => u.id === spec.unitId);
  if (!unit) throw new Error(`Unknown mutineer "${spec.unitId}"`);
  const enemies = cs.combatants.filter((c) => c.side === 'enemy');
  const inRow = (r: Row) => enemies.filter((c) => c.row === r).length;
  const preferred: Row = spec.row ?? 'front';
  const other: Row = preferred === 'front' ? 'back' : 'front';
  const row = inRow(preferred) < TUNING.combat.maxPerRow ? preferred : inRow(other) < TUNING.combat.maxPerRow ? other : null;
  if (row === null) return null;

  const stats = unitStats(state, reg, unit);
  const passives: Array<EffectSpec & { source: string }> = [];
  for (const d of unit.defects) {
    const c = reg.defects.get(d.id)?.combat as { upside?: EffectSpec[]; downside?: EffectSpec[] } | undefined;
    for (const e of c?.upside ?? []) passives.push({ ...e, source: `defect:${d.id}` });
    for (const e of c?.downside ?? []) passives.push({ ...e, source: `defect:${d.id}:down` });
  }
  const c: Combatant = {
    cid: `e${cs.nextCid}`,
    side: 'enemy',
    unitId: unit.id,
    nameKey: unit.displayName,
    level: unit.level,
    row,
    index: enemies.reduce((m, x) => Math.max(m, x.index + 1), 0),
    hp: Math.max(1, Math.min(unit.currentHp, stats.hp)),
    maxHp: stats.hp,
    base: stats,
    stress: 0,
    statuses: [],
    mods: [],
    cooldowns: {},
    skills: unitSkillIds(reg, unit),
    passives,
    downed: false,
    aiProfile: (reg.roles.get(unit.roleId)?.aiProfile as string | undefined) ?? 'aggressive',
    usedLimits: [],
    upgrades: ownedUpgrades(reg, unit),
  };
  cs.nextCid += 1;
  cs.combatants.push(c);
  return c;
}
