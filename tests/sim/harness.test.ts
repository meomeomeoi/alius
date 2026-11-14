import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { fixtureSquad, formatReport, neutralityReport, runBatch, simulate } from '../../src/sim/harness';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

describe('fixtureSquad', () => {
  it('is assault + defender in front, sniper + medic behind, at the level, with spent points and one defect each', () => {
    const s = fixtureSquad(reg, { level: 6, defectId: 'rage_governor' });
    expect(s.squad.map((u) => u.roleId)).toEqual(['assault', 'defender', 'sniper', 'medic']);
    for (const u of s.squad) {
      expect(u.level).toBe(6);
      expect(u.skillPoints).toBeLessThan(2); // everything affordable was unlocked
      expect(u.unlockedNodes.length).toBeGreaterThan(0);
      expect(u.defects.map((d) => d.id)).toEqual(['rage_governor']);
      expect(u.equipment).toEqual({});
    }
    expect(fixtureSquad(reg, { level: 1, defectId: null }).squad[0].defects).toEqual([]);
    expect(fixtureSquad(reg, { level: 1 }).squad[0].unlockedNodes).toEqual([]);
  });
});

describe('simulate and runBatch', () => {
  it('runBatch is deterministic for a seed and differs across seeds', () => {
    const a = runBatch(reg, { runs: 20, seed: 5, level: 5, danger: 4 });
    const b = runBatch(reg, { runs: 20, seed: 5, level: 5, danger: 4 });
    expect(a).toEqual(b);
    const c = runBatch(reg, { runs: 20, seed: 500, level: 5, danger: 4 });
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
    expect(a.winRate).toBeGreaterThanOrEqual(0);
    expect(a.winRate).toBeLessThanOrEqual(1);
  });

  it('simulate never exceeds the round cap and never mutates the fixture state', () => {
    const state = fixtureSquad(reg, { level: 3 });
    const before = JSON.stringify(state);
    for (let seed = 1; seed <= 40; seed++) {
      const r = simulate(reg, { seed, state, danger: 5 });
      expect(r.rounds).toBeLessThanOrEqual(30);
      expect(r.endStress).toBeGreaterThanOrEqual(0);
      expect(r.endStress).toBeLessThanOrEqual(100);
    }
    expect(JSON.stringify(state)).toBe(before);
  });

  it('difficulty changes the outcome distribution', () => {
    const state = fixtureSquad(reg, { level: 5 });
    const rate = (difficulty: 'story' | 'normal' | 'hard') => {
      let wins = 0;
      for (let seed = 1; seed <= 60; seed++) wins += simulate(reg, { seed, state, danger: 5, difficulty }).won ? 1 : 0;
      return wins;
    };
    expect(rate('story')).toBeGreaterThanOrEqual(rate('hard'));
  });

  it('a defect changes the fight (the harness really applies it)', () => {
    const none = runBatch(reg, { runs: 40, seed: 1, level: 5, danger: 4, defectId: null });
    const crippled = runBatch(reg, { runs: 40, seed: 1, level: 5, danger: 4, defectId: 'affect_dampener' });
    expect(JSON.stringify(none)).not.toBe(JSON.stringify(crippled));
  });
});

describe('neutrality report', () => {
  it('lists all 18 defects with win rates and pp differences', () => {
    const r = neutralityReport(reg, { runs: 20, seed: 3, level: 5, danger: 3 });
    expect(r.rows).toHaveLength(18);
    expect(r.rows.map((x) => x.defectId).sort()).toEqual([...reg.defects.keys()].sort());
    for (const row of r.rows) {
      expect(row.winRate).toBeGreaterThanOrEqual(0);
      expect(row.diffPp).toBeCloseTo((row.winRate - r.control.winRate) * 100);
      expect(row.pass).toBe(Math.abs(row.diffPp) <= 5);
    }
    expect(r.avgRoundsOk).toBe(r.control.avgRounds <= 5);
  });

  it('formatReport has one row per defect and marks PASS/FAIL', () => {
    const r = neutralityReport(reg, { runs: 10, seed: 3, level: 5, danger: 3 });
    const text = formatReport(r);
    const rows = text.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Defect'));
    expect(rows).toHaveLength(18);
    for (const row of rows) expect(row).toMatch(/PASS \|$|FAIL \|$/);
    for (const id of reg.defects.keys()) expect(text).toContain(`| ${id} |`);
    expect(text).toMatch(/Average combat length within 5 rounds: \*\*(PASS|FAIL)\*\*/);
    const forced = formatReport({ ...r, rows: r.rows.map((x, i) => ({ ...x, diffPp: i === 0 ? 9 : 1, pass: i !== 0 })) });
    expect(forced.match(/FAIL \|/g)).toHaveLength(1);
    expect(forced).toContain('17 of 18 defects within ±5 pp.');
  });
});

describe('the world in the harness (P8)', () => {
  it('fixtureSquad builds the squad in a preset world and refuses an unknown one', () => {
    const s = fixtureSquad(reg, { level: 3, world: 'brutal' });
    expect(s.world.options).toEqual({
      gender_norms: 'corporate_machismo', offspec_stigma: 'hunted', oversight: 'brutal', bloom_horror: 'graphic', tone: 'bleak', disposition: 'hazardous',
    });
    expect(fixtureSquad(reg, { level: 3 }).world.options!.disposition).toBe('guarded');
    expect(() => fixtureSquad(reg, { level: 3, world: 'ghost' })).toThrow(/unknown world preset "ghost"/i);
  });

  it('harness runs with the brutal preset: deterministic, and a hazardous squad breaks down differently', () => {
    const run = (world?: string) => runBatch(reg, { runs: 60, seed: 11, level: 5, danger: 4, defectId: 'rage_governor', world });
    const a = run('brutal');
    expect(run('brutal')).toEqual(a);
    expect(a.winRate).toBeGreaterThanOrEqual(0);
    expect(a.winRate).toBeLessThanOrEqual(1);
    // a standard world is the P4 harness unchanged
    expect(run('standard')).toEqual(run(undefined));
    // the hazardous level changes what a breakdown does, so the numbers move
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(run(undefined)));
  });
});
