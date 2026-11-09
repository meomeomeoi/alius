import type { Registries } from '../../content/types';
import type { Skill } from '../../content/schemas';
import type { Unit } from '../state/types';
import { TUNING } from '../tuning';
import type { EffectCtx } from './effects';
import { byCid, legalTargets, skillById } from './targeting';
import type { Combatant, EffectSpec, SkillUpgrade } from './types';

interface TreeNode {
  id: string;
  branch: number | null;
  grants: { skill?: string; upgrade?: SkillUpgrade };
}
const treeOf = (reg: Registries, unit: Unit): TreeNode[] => (reg.roles.get(unit.roleId)?.tree as TreeNode[] | undefined) ?? [];

/** Applies upgrade nodes to a skill: cooldown delta (floor 0), a percentage on damage and heal, extra effects. */
export function applyUpgrades(skill: Skill, upgrades: SkillUpgrade[] | undefined): Skill {
  const mine = (upgrades ?? []).filter((u) => u.skillId === skill.id);
  if (mine.length === 0) return skill;
  const out = structuredClone(skill);
  for (const u of mine) {
    if (u.cooldownDelta) out.cooldown = Math.max(0, (out.cooldown ?? 0) + u.cooldownDelta);
    if (u.multPct) {
      for (const e of out.effects) {
        if (e.type === 'damage' && e.mult !== undefined) e.mult = e.mult * (1 + u.multPct / 100);
        if (e.type === 'heal') e.pctMaxHp = e.pctMaxHp * (1 + u.multPct / 100);
      }
    }
    if (u.addEffects) out.effects.push(...(u.addEffects as unknown as Skill['effects']));
  }
  return out;
}

/** The upgrade nodes the unit owns. */
export function ownedUpgrades(reg: Registries, unit: Unit): SkillUpgrade[] {
  const owned = new Set(unit.unlockedNodes);
  return treeOf(reg, unit).filter((n) => owned.has(n.id) && n.grants.upgrade).map((n) => n.grants.upgrade!);
}

/** Starter skills plus the active skills granted by owned nodes (the ultimate and passives excluded). */
export function knownSkillIds(reg: Registries, unit: Unit): string[] {
  const owned = new Set(unit.unlockedNodes);
  const ids = [...((reg.roles.get(unit.roleId)?.starterSkills as string[] | undefined) ?? [])];
  for (const n of treeOf(reg, unit)) {
    const id = n.grants.skill;
    if (!id || !owned.has(n.id)) continue;
    if (skillById(reg, id)?.kind === 'active') ids.push(id);
  }
  return ids.filter((id) => reg.skills.has(id));
}

/** Passive skills granted by owned nodes. */
export function ownedPassiveIds(reg: Registries, unit: Unit): string[] {
  const owned = new Set(unit.unlockedNodes);
  return treeOf(reg, unit)
    .filter((n) => n.grants.skill && owned.has(n.id) && skillById(reg, n.grants.skill)?.kind === 'passive')
    .map((n) => n.grants.skill!);
}

/** The ultimate, when its node is owned. */
export function ownedUltimateId(reg: Registries, unit: Unit): string | undefined {
  const owned = new Set(unit.unlockedNodes);
  return treeOf(reg, unit).find((n) => n.branch === null && owned.has(n.id))?.grants.skill;
}

/** Equipped active skills: base 4 plus `loadout_slots` of the unit's defects. */
export function loadoutSize(reg: Registries, unit: Unit): number {
  let extra = 0;
  for (const d of unit.defects) {
    const c = reg.defects.get(d.id)?.combat as { upside?: EffectSpec[]; downside?: EffectSpec[] } | undefined;
    for (const e of [...(c?.upside ?? []), ...(c?.downside ?? [])]) if (e.type === 'loadout_slots') extra += e.amount;
  }
  return TUNING.progression.loadoutSize + extra;
}

/** The loadout of a unit: her saved choice (known active skills only) or the starters. */
export function activeLoadout(reg: Registries, unit: Unit): string[] {
  const known = knownSkillIds(reg, unit);
  const starters = ((reg.roles.get(unit.roleId)?.starterSkills as string[] | undefined) ?? []).filter((id) => reg.skills.has(id));
  const chosen = (unit.loadout ?? []).filter((id, i, a) => known.includes(id) && a.indexOf(id) === i);
  return (chosen.length > 0 ? chosen : starters).slice(0, loadoutSize(reg, unit));
}

/** The skill a combatant uses: the registry skill with her owned upgrades applied. */
export function resolveSkill(reg: Registries, c: Combatant, skillId: string): Skill | undefined {
  const base = skillById(reg, skillId);
  return base ? applyUpgrades(base, c.upgrades) : undefined;
}

export interface UsableSkill { skill: Skill; targets: string[] }

/**
 * Skills the combatant could use right now: not passive, off cooldown, affordable (an ultimate needs its CP unless
 * she is authorized) and with at least one legal target (self skills target the user).
 */
export function usableSkills(ctx: EffectCtx, cid: string): UsableSkill[] {
  const { cs, reg } = ctx;
  const c = byCid(cs, cid);
  const out: UsableSkill[] = [];
  for (const id of c.skills) {
    const skill = resolveSkill(reg, c, id);
    if (!skill || skill.kind === 'passive') continue;
    if ((c.cooldowns[id] ?? 0) > 0) continue;
    if (c.side === 'squad' && (skill.cp ?? 0) > 0 && cs.cp < skill.cp! && !c.statuses.some((s) => s.id === 'authorized')) continue;
    const targets = legalTargets(cs, cid, skill, reg);
    if (targets.length > 0) out.push({ skill, targets });
  }
  return out;
}
