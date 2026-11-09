import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { defaultEnemyName, generateEncounter, type EnemyTable } from '../../../src/engine/combat/encounter';
import { encounterPower, squadPower } from '../../../src/engine/combat/stats';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
let state: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  state = campaign(reg, 4);
});

const all: EnemyTable = { categories: { mutant_human: 3, mutant_beast: 3, marauder: 3, enemy_soldier: 1, offspec_hostile: 1, anomaly: 1 } };
const gen = (seed: number, o: Partial<Parameters<typeof generateEncounter>[3]> = {}, s = state) =>
  generateEncounter(s, reg, new Rng(seedRng(seed)), { table: all, danger: 2, squadPower: 400, ...o });
const budgetOf = (danger: number, power: number) => power * [0.5, 0.7, 0.9, 1.1, 1.3][danger - 1];

describe('generateEncounter', () => {
  it('same rng state, same encounter', () => {
    expect(gen(7)).toEqual(gen(7));
    expect(JSON.stringify(gen(7))).not.toBe(JSON.stringify(gen(8)));
  });

  it('encounter power stays within budget except the guaranteed first enemy', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const danger = ((seed % 5) + 1) as 1 | 2 | 3 | 4 | 5;
      const e = gen(seed, { danger });
      expect(e.enemies.length).toBeGreaterThanOrEqual(1);
      if (e.enemies.length > 1) expect(encounterPower(reg, e, 'normal'), `seed ${seed}`).toBeLessThanOrEqual(budgetOf(danger, 400) + 1e-9);
    }
    const tiny = gen(3, { squadPower: 1 });
    expect(tiny.enemies).toHaveLength(1);
  });

  it('never more than 6 enemies', () => {
    for (let seed = 1; seed <= 50; seed++) expect(gen(seed, { squadPower: 100000, danger: 5 }).enemies.length).toBe(6);
  });

  it('level follows the average fielded level and the danger', () => {
    const s = structuredClone(state);
    for (const u of s.squad) u.level = 5;
    expect(gen(1, { danger: 3 }, s).enemies.every((e) => e.level === 6)).toBe(true);
    expect(gen(1, { danger: 1 }, s).enemies.every((e) => e.level === 4)).toBe(true);
    expect(gen(1, { danger: 1 }).enemies.every((e) => e.level === 1)).toBe(true); // never below 1
  });

  it('category frequencies follow lore over 3000 encounters (rare ≈ 0.3 × common, ±20 %)', () => {
    const table: EnemyTable = { categories: { mutant_human: 1, enemy_soldier: 1 } };
    const count = { mutant_human: 0, enemy_soldier: 0 } as Record<string, number>;
    for (let seed = 1; seed <= 3000; seed++) {
      const first = gen(seed, { table, danger: 1 }).enemies[0];
      count[reg.enemies.get(first.enemyId)!.categoryId as string] += 1;
    }
    const ratio = count.enemy_soldier / count.mutant_human;
    expect(ratio).toBeGreaterThan(0.3 * 0.8);
    expect(ratio).toBeLessThan(0.3 * 1.2);
    const rare = { categories: { anomaly: 1, mutant_human: 1 } };
    let anomalies = 0;
    for (let seed = 1; seed <= 3000; seed++) {
      if (reg.enemies.get(gen(seed, { table: rare, danger: 1 }).enemies[0].enemyId)!.categoryId === 'anomaly') anomalies += 1;
    }
    expect(anomalies / 3000).toBeCloseTo(0.08 / 1.08, 1);
  });

  it('archetype list restricts picks', () => {
    const table: EnemyTable = { categories: { mutant_human: 1, marauder: 1 }, archetypes: ['husk', 'raider'] };
    const seen = new Set<string>();
    for (let seed = 1; seed <= 100; seed++) for (const e of gen(seed, { table }).enemies) seen.add(e.enemyId);
    expect([...seen].sort()).toEqual(['husk', 'raider']);
    expect(() => gen(1, { table: { categories: { anomaly: 1 }, archetypes: ['husk'] } })).toThrow(/no known category/);
  });

  it('no elite below danger 3, and affixes follow the danger', () => {
    let elites = 0;
    let affixed = 0;
    let atFive = 0;
    for (let seed = 1; seed <= 400; seed++) {
      for (const d of [1, 2] as const) for (const e of gen(seed, { danger: d }).enemies) elites += e.affixes.includes('elite') ? 1 : 0;
      if (gen(seed, { danger: 1 }).enemies.some((e) => e.affixes.length > 0)) affixed += 1;
      for (const e of gen(seed, { danger: 5 }).enemies) {
        expect(e.affixes.length).toBeLessThanOrEqual(2);
        atFive += e.affixes.includes('elite') ? 1 : 0;
      }
    }
    expect(elites).toBe(0);
    expect(affixed).toBe(0);
    expect(atFive).toBeGreaterThan(0);
  });

  it('exposesCommander and the loot table are passed through', () => {
    expect(gen(1, { exposesCommander: true, lootTableId: 'loot_elite' })).toMatchObject({ exposesCommander: true, lootTableId: 'loot_elite', danger: 2 });
    expect(gen(1)).not.toHaveProperty('exposesCommander');
  });

  it('unknown category in the table is ignored, an all-unknown table throws', () => {
    const e = gen(1, { table: { categories: { ghosts: 5, mutant_human: 1 } } });
    expect(e.enemies.every((x) => reg.enemies.get(x.enemyId)!.categoryId === 'mutant_human')).toBe(true);
    expect(() => gen(1, { table: { categories: { ghosts: 5 } } })).toThrow(/no known category/);
  });

  it('the budget scales with the squad power', () => {
    const small = gen(9, { squadPower: squadPower(state, reg, state.roster.activeIds) * 0.2 });
    const big = gen(9, { squadPower: squadPower(state, reg, state.roster.activeIds) * 2 });
    expect(big.enemies.length).toBeGreaterThanOrEqual(small.enemies.length);
  });
});

describe('defaultEnemyName', () => {
  it('joins affix adjectives and the archetype name', () => {
    expect(defaultEnemyName(reg, 'husk', [])).toBe('Husk');
    expect(defaultEnemyName(reg, 'husk', ['armored'])).toBe('Armored Husk');
    expect(defaultEnemyName(reg, 'scav_marksman', ['swift', 'bloom_touched'])).toBe('Swift Bloom-touched Scavenger Marksman');
    expect(defaultEnemyName(reg, 'husk', ['elite'])).toBe('Elite Husk');
    expect(defaultEnemyName(reg, 'ghost', ['nothing'])).toBe('ghost');
  });
});
