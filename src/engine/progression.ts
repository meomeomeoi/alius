import type { Registries } from '../content/types';
import type { Skill } from '../content/schemas';
import type { EngineEvent } from './dispatch';
import { isLiving } from './economy';
import type { CombatState } from './combat/types';
import { applyUpgrades, knownSkillIds, loadoutSize, ownedUpgrades } from './combat/skills';
import { skillById } from './combat/targeting';
import type { CampaignState, Unit } from './state/types';
import { TUNING } from './tuning';

export { loadoutSize } from './combat/skills';

interface TreeNode {
  id: string;
  branch: number | null;
  tier: number | null;
  cost: number;
  requires: string[];
  grants: { skill?: string };
}
const treeOf = (reg: Registries, unit: Unit): TreeNode[] => (reg.roles.get(unit.roleId)?.tree as TreeNode[] | undefined) ?? [];

/** XP needed to leave `level`: 60, 80, 100, … */
export const xpToNext = (level: number): number => TUNING.progression.xpToNext.base + TUNING.progression.xpToNext.perLevel * level;

/** The highest level the campaign allows now (raised by `world.clearanceTier`, which P5 writes). */
export function levelCap(state: CampaignState): number {
  const caps = TUNING.progression.levelCaps;
  const tier = Math.min(Math.max(0, Math.floor(state.world.clearanceTier ?? 0)), caps.length - 1);
  return caps[tier];
}

function hpGrowth(reg: Registries, unit: Unit, level: number): number {
  const g = (reg.roles.get(unit.roleId)?.growth as { hp?: number } | undefined)?.hp ?? 0;
  return Math.floor(g * (level - 1));
}

/**
 * Spends stored XP on levels while the cap allows it (a skill point each; current HP rises by the HP growth gained).
 * XP above the cap is kept for when the cap rises.
 */
export function applyLevelUps(draft: CampaignState, reg: Registries, unit: Unit): EngineEvent[] {
  const events: EngineEvent[] = [];
  const cap = levelCap(draft);
  while (unit.xp >= xpToNext(unit.level) && unit.level < cap) {
    const before = hpGrowth(reg, unit, unit.level);
    unit.xp -= xpToNext(unit.level);
    unit.level += 1;
    unit.skillPoints += 1;
    unit.currentHp += hpGrowth(reg, unit, unit.level) - before;
    events.push({ type: 'level_up', unitId: unit.id, level: unit.level });
  }
  return events;
}

/** Level-ups for every living unit (after activities and when the cap rises). */
export function applyAllLevelUps(draft: CampaignState, reg: Registries): EngineEvent[] {
  return draft.squad.filter(isLiving).flatMap((u) => applyLevelUps(draft, reg, u));
}

/** Prerequisites of a node, ignoring points: owned parents, and for the ultimate two owned tier-3 nodes. */
function prerequisiteProblem(reg: Registries, unit: Unit, node: TreeNode): string | null {
  const owned = new Set(unit.unlockedNodes);
  for (const r of node.requires) if (!owned.has(r)) return 'LOCKED: unlock the previous node first';
  if (node.branch === null) {
    const tier3 = treeOf(reg, unit).filter((n) => n.tier === 3 && owned.has(n.id)).length;
    if (tier3 < 2) return 'LOCKED: needs two tier-3 nodes';
  }
  return null;
}

export function nodeState(state: CampaignState, reg: Registries, unit: Unit, nodeId: string): 'owned' | 'available' | 'locked' {
  void state;
  if (unit.unlockedNodes.includes(nodeId)) return 'owned';
  const node = treeOf(reg, unit).find((n) => n.id === nodeId);
  return node && prerequisiteProblem(reg, unit, node) === null ? 'available' : 'locked';
}

/** Why the node cannot be unlocked now, or null. */
export function checkUnlock(state: CampaignState, reg: Registries, unitId: string, nodeId: string): string | null {
  const unit = state.squad.find((u) => u.id === unitId);
  if (!unit || !isLiving(unit)) return 'Unknown or unavailable unit.';
  const node = treeOf(reg, unit).find((n) => n.id === nodeId);
  if (!node) return `Unknown node "${nodeId}".`;
  if (unit.unlockedNodes.includes(nodeId)) return 'Already unlocked.';
  const problem = prerequisiteProblem(reg, unit, node);
  if (problem) return problem;
  if (unit.skillPoints < node.cost) return `NEEDS ${node.cost} SKILL POINTS (has ${unit.skillPoints})`;
  return null;
}

export function unlockNode(draft: CampaignState, reg: Registries, unitId: string, nodeId: string): EngineEvent[] {
  const reason = checkUnlock(draft, reg, unitId, nodeId);
  if (reason) throw new Error(reason);
  const unit = draft.squad.find((u) => u.id === unitId)!;
  const node = treeOf(reg, unit).find((n) => n.id === nodeId)!;
  unit.skillPoints -= node.cost;
  unit.unlockedNodes.push(nodeId);
  return [{ type: 'node_unlocked', unitId, nodeId, cost: node.cost }];
}

export const respecCost = (unit: Unit): { credits: number; plyx: number } => ({
  credits: TUNING.progression.respec.creditsPerLevel * unit.level,
  plyx: TUNING.progression.respec.plyxPerLevel * unit.level,
});

/** Refunds every owned node, clears the loadout choice (back to the starters) and charges credits and plyx. */
export function respec(draft: CampaignState, reg: Registries, unitId: string): EngineEvent[] {
  const unit = draft.squad.find((u) => u.id === unitId);
  if (!unit || !isLiving(unit)) throw new Error('Unknown or unavailable unit.');
  if (unit.unlockedNodes.length === 0) throw new Error('Nothing to respec.');
  const cost = respecCost(unit);
  if (draft.resources.credits < cost.credits || draft.resources.plyx < cost.plyx) {
    throw new Error(`Respec needs ${cost.credits} credits and ${cost.plyx} plyx.`);
  }
  const owned = new Set(unit.unlockedNodes);
  const refund = treeOf(reg, unit).filter((n) => owned.has(n.id)).reduce((s, n) => s + n.cost, 0);
  draft.resources.credits -= cost.credits;
  draft.resources.plyx -= cost.plyx;
  unit.skillPoints += refund;
  unit.unlockedNodes = [];
  delete unit.loadout;
  return [
    { type: 'resource_changed', resource: 'credits', amount: -cost.credits },
    { type: 'resource_changed', resource: 'plyx', amount: -cost.plyx },
    { type: 'unit_respec', unitId, refunded: refund },
  ];
}

/** Starter skills plus the active skills granted by owned nodes (ultimate and passives excluded). */
export const knownSkills = (reg: Registries, unit: Unit): string[] => knownSkillIds(reg, unit);

/** Sets the equipped actives: known, active, unique, at most `loadoutSize`. An empty list restores the starters. */
export function setLoadout(draft: CampaignState, reg: Registries, unitId: string, skillIds: string[]): void {
  const unit = draft.squad.find((u) => u.id === unitId);
  if (!unit || !isLiving(unit)) throw new Error('Unknown or unavailable unit.');
  if (new Set(skillIds).size !== skillIds.length) throw new Error('A skill was listed twice.');
  const known = knownSkills(reg, unit);
  for (const id of skillIds) {
    const sk = skillById(reg, id);
    if (!sk) throw new Error(`Unknown skill "${id}".`);
    if (sk.kind === 'passive') throw new Error(`${sk.name} is a passive and cannot be equipped.`);
    if (!known.includes(id)) throw new Error(`${sk.name} is not unlocked.`);
  }
  if (skillIds.length > loadoutSize(reg, unit)) throw new Error(`A loadout holds at most ${loadoutSize(reg, unit)} skills.`);
  if (skillIds.length === 0) delete unit.loadout;
  else unit.loadout = [...skillIds];
}

/** A skill with the unit's owned upgrade nodes applied. */
export function skillWithUpgrades(reg: Registries, unit: Unit, skillId: string): Skill {
  const base = skillById(reg, skillId);
  if (!base) throw new Error(`Unknown skill "${skillId}".`);
  return applyUpgrades(base, ownedUpgrades(reg, unit));
}

/** Ends the expedition-long breakdown of the given units (default: all) and reports it for P5's debrief. */
export function releaseBreakdowns(draft: CampaignState, unitIds?: string[]): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const u of draft.squad) {
    if (!u.breakdown || (unitIds && !unitIds.includes(u.id))) continue;
    delete u.breakdown;
    events.push({ type: 'breakdown_released', unitId: u.id });
  }
  return events;
}

/**
 * XP for every fielded unit of a won combat: base + per-enemy-level × Σ enemy levels, ×1.5 for a unit more than 2
 * levels below the fielded average, ×0.5 for grunts, rounded. The caller decides whether the combat was won.
 */
export function combatXp(state: CampaignState, reg: Registries, cs: CombatState): Record<string, number> {
  void reg;
  const t = TUNING.progression.combatXp;
  const squad = cs.combatants.filter((c) => c.side === 'squad' && c.unitId);
  const enemyLevels = cs.encounter.enemies.reduce((s, e) => s + e.level, 0);
  const average = squad.length > 0 ? squad.reduce((s, c) => s + c.level, 0) / squad.length : 0;
  const out: Record<string, number> = {};
  for (const c of squad) {
    const unit = state.squad.find((u) => u.id === c.unitId);
    let xp = t.base + t.perEnemyLevel * enemyLevels;
    if (c.level < average - t.lowLevelGap) xp *= t.lowLevelBonus;
    if (unit?.kind === 'grunt') xp *= t.gruntMult;
    out[c.unitId!] = Math.round(xp);
  }
  return out;
}

