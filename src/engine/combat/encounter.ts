import type { Registries } from '../../content/types';
import type { Rng } from '../rng';
import type { CampaignState } from '../state/types';
import { enemyStats, statPower } from './stats';
import type { Encounter } from './types';

/** Which enemies a region (P5) fields: category weights and an optional archetype whitelist. */
export type EnemyTable = { categories: Record<string, number>; archetypes?: string[] };

const BUDGET = [0.5, 0.7, 0.9, 1.1, 1.3] as const;
const FREQUENCY = { common: 1, rare: 0.3, very_rare: 0.08 } as const;
const MAX_ENEMIES = 6;

/** "Armored Swift Husk": affix adjectives in the order given, then the archetype's name. */
export function defaultEnemyName(reg: Registries, enemyId: string, affixes: string[]): string {
  const words = affixes.map((id) => (reg.affixes.get(id)?.adjective as string | undefined) ?? '').filter((w) => w !== '');
  return [...words, (reg.enemies.get(enemyId)?.name as string | undefined) ?? enemyId].join(' ');
}

function averageLevel(state: CampaignState): number {
  const fielded = state.roster.activeIds.map((id) => state.squad.find((u) => u.id === id)).filter((u) => u !== undefined);
  const pool = fielded.length > 0 ? fielded : state.squad;
  if (pool.length === 0) return 1;
  return pool.reduce((s, u) => s + u!.level, 0) / pool.length;
}

/**
 * A budgeted encounter. Budget = squad power × [0.5 … 1.3] by danger; enemies are drawn by category weight (times
 * the lore frequency factor) and archetype (uniform) while the next one fits, at most 6, at least 1. Level =
 * average fielded level + danger − 2; each enemy rolls affixes with 10 % × danger (at most min(2, danger − 1),
 * `elite` only from danger 3).
 */
export function generateEncounter(
  state: CampaignState, reg: Registries, rng: Rng,
  input: { table: EnemyTable; danger: 1 | 2 | 3 | 4 | 5; squadPower: number; exposesCommander?: boolean; lootTableId?: string },
): Encounter {
  const { danger } = input;
  const budget = input.squadPower * BUDGET[danger - 1];
  const level = Math.max(1, Math.round(averageLevel(state)) + danger - 2);

  const byCategory = new Map<string, string[]>();
  for (const e of reg.enemies.values()) {
    if (input.table.archetypes && !input.table.archetypes.includes(e.id)) continue;
    const list = byCategory.get(e.categoryId as string) ?? [];
    list.push(e.id);
    byCategory.set(e.categoryId as string, list);
  }
  const weighted: Array<{ id: string; weight: number }> = [];
  for (const [id, w] of Object.entries(input.table.categories)) {
    const cat = reg.enemyCategories.get(id);
    if (!cat || w <= 0 || !byCategory.has(id)) continue;
    weighted.push({ id, weight: w * FREQUENCY[cat.frequency as keyof typeof FREQUENCY] });
  }
  if (weighted.length === 0) throw new Error('The enemy table has no known category with enemies.');
  const total = weighted.reduce((s, c) => s + c.weight, 0);

  const affixPool = [...reg.affixes.values()].filter((a) => a.appliesTo === 'enemy' && (a.id !== 'elite' || danger >= 3)).map((a) => a.id);
  const maxAffixes = Math.min(2, danger - 1);
  const draw = (): { enemyId: string; level: number; affixes: string[] } => {
    let r = rng.float() * total;
    const cat = weighted.find((c) => (r -= c.weight) < 0) ?? weighted[weighted.length - 1];
    const enemyId = rng.pick(byCategory.get(cat.id)!);
    const affixes: string[] = [];
    if (maxAffixes > 0 && rng.chance(0.1 * danger)) {
      const n = rng.int(1, maxAffixes);
      const left = [...affixPool];
      while (affixes.length < n && left.length > 0) affixes.push(left.splice(rng.int(0, left.length - 1), 1)[0]);
    }
    return { enemyId, level, affixes };
  };
  const cost = (e: { enemyId: string; level: number; affixes: string[] }): number =>
    statPower(enemyStats(reg, e.enemyId, e.level, e.affixes, state.difficulty)) * ((reg.enemies.get(e.enemyId)?.power as number | undefined) ?? 1);

  const enemies: Encounter['enemies'] = [];
  let spent = 0;
  while (enemies.length < MAX_ENEMIES) {
    const next = draw();
    const c = cost(next);
    if (enemies.length > 0 && spent + c > budget) break;
    enemies.push(next);
    spent += c;
  }
  return {
    enemies, danger,
    ...(input.exposesCommander ? { exposesCommander: true } : {}),
    ...(input.lootTableId ? { lootTableId: input.lootTableId } : {}),
  };
}
