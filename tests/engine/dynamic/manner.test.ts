import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../../src/content/loader';
import type { Registries } from '../../../src/content/types';
import { bend, bendBy, mannerOf, MANNER_AXES } from '../../../src/engine/dynamic/manner';
import type { Practice } from '../../../src/engine/dynamic/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const ANN = 'unit_ann';
const ZERO = { intensity: 0, warmth: 0, order: 0, voice: 0, tempo: 0, curiosity: 0 };
const BASE: Practice = { categories: {}, style: { primary: 'cruel' }, audience: 'indifferent', inclination: 'eager', fairness: 'fair', hintStyle: 'offers', drive: 'moderate' };
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
function holder(extra: Partial<Practice> = {}): CampaignState {
  const s = campaign(reg, 2);
  unitOf(s, ANN).bond = { leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known', practice: { ...structuredClone(BASE), ...structuredClone(extra) } };
  return s;
}

describe('bend', () => {
  it('a step of 0 returns the base exactly, for every kind', () => {
    for (const kind of [{ scale: 0.15 }, { scale: 0.15, cap: 10 }, { shift: 0.5 }]) expect(bend(450, 0, kind)).toBe(450);
    expect(bend(450, 0, { gate: 2 })).toBe(0);
    expect(bend(450, 0, { gate: -2 })).toBe(0);
  });
  it('scales, shifts, caps and gates', () => {
    expect(bend(1000, 2, { scale: 0.15 })).toBe(1300);
    expect(bend(1000, -2, { scale: 0.15 })).toBe(700);
    expect(bend(4, -1, { shift: 0.5 })).toBe(3.5);
    expect(bend(0.8, 2, { scale: 0.15, cap: 0.9 })).toBe(0.9);
    expect(bend(10, -2, { scale: 0.9 })).toBe(0); // never below 0
    expect(bend(0, 2, { gate: 2 })).toBe(1);
    expect(bend(0, 1, { gate: 2 })).toBe(0);
    expect(bend(0, -2, { gate: -2 })).toBe(1);
    expect(bend(0, -1, { gate: -2 })).toBe(0);
  });
});

describe('mannerOf and bendBy', () => {
  it('is null without a manner block, and bendBy returns the base', () => {
    const s = holder();
    expect(mannerOf(s, reg, ANN)).toBeNull();
    expect(mannerOf(s, reg, 'nobody')).toBeNull();
    expect(bendBy(s, reg, ANN, 'tempo', 450, { scale: 0.15 })).toBe(450);
  });
  it('reads her axes and what draws her', () => {
    const s = holder({ manner: { ...ZERO, tempo: 2, warmth: -1 }, drawnBy: ['power', 'pain'] });
    const m = mannerOf(s, reg, ANN)!;
    expect(m.axes).toEqual({ ...ZERO, tempo: 2, warmth: -1 });
    expect(m.drawnBy).toEqual(['power', 'pain']);
    expect(m.mood).toEqual({});
    expect(bendBy(s, reg, ANN, 'tempo', 1000, { scale: 0.15 })).toBe(1300);
    expect(bendBy(s, reg, ANN, 'intensity', 1000, { scale: 0.15 })).toBe(1000);
  });
  it('folds the drift overlay and clamps to ±2; an empty overlay is ignored', () => {
    const s = holder({ manner: { ...ZERO, intensity: 2, warmth: -1 } });
    unitOf(s, ANN).development = { practice: {} } as never;
    expect(mannerOf(s, reg, ANN)!.axes).toEqual({ ...ZERO, intensity: 2, warmth: -1 });
    unitOf(s, ANN).development = { practice: { manner: { intensity: 1, warmth: -2, order: 1 } } } as never;
    expect(mannerOf(s, reg, ANN)!.axes).toEqual({ ...ZERO, intensity: 2, warmth: -2, order: 1 });
  });
  it('an all-zero manner is present (the gate) and bends nothing', () => {
    const s = holder({ manner: { ...ZERO } });
    expect(mannerOf(s, reg, ANN)).not.toBeNull();
    for (const a of MANNER_AXES) expect(bendBy(s, reg, ANN, a, 450, { scale: 0.15 })).toBe(450);
  });
});

describe('practiceStyles places', () => {
  it('the core pack gives all eleven styles a place', () => {
    const rows = [...reg.practiceStyles.values()];
    expect(rows).toHaveLength(11);
    for (const r of rows) {
      const m = (r as { manner?: Record<string, number> }).manner;
      expect(m, r.id).toBeDefined();
      expect(Object.keys(m!).sort()).toEqual([...MANNER_AXES].sort());
    }
    expect((reg.practiceStyles.get('regal') as { manner?: unknown }).manner).toEqual({ intensity: 1, warmth: 0, order: 2, voice: 1, tempo: -1, curiosity: -1 });
  });
  it('the schema rejects a place outside ±3', async () => {
    const core = JSON.parse(await readFile('content/core/practiceStyles.json', 'utf8')) as Array<Record<string, unknown>>;
    const bad = { ...core[0], manner: { ...(core[0].manner as object), warmth: 4 } };
    const mem: Record<string, unknown> = {
      'mem/manifest.json': { id: 'mem', name: 'Mem', version: '1', priority: 50, files: { practiceStyles: 'practiceStyles.json' } },
      'mem/practiceStyles.json': [bad],
    };
    const r = await loadPacks(['content/core', 'mem'], async (p) => (p in mem ? mem[p] : JSON.parse(await readFile(p, 'utf8'))));
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
