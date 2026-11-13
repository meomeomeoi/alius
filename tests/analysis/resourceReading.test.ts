import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resetKnowledgeRules } from '../../src/analysis/knowledge';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { readingFor } from '../../src/analysis/providers';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import { parseSubject } from '../../src/analysis/subject';
import type { Registries } from '../../src/content/types';
import { upkeepNeeded } from '../../src/engine/economy';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => resetKnowledgeRules());

const read = (resource: string, state = campaign(reg, 4)) => {
  const env: AnalyzeEnv = { registries: reg, state, settings: DEFAULT_SETTINGS };
  return readingFor(parseSubject(`glossary:${resource}`)!, env)?.lines ?? null;
};

describe('resource readings', () => {
  it('supplies show the daily upkeep', () => {
    const state = campaign(reg, 4);
    state.resources.supplies = 31;
    const { units, needed } = upkeepNeeded(state, reg);
    const lines = read('supplies', state)!;
    expect(lines[0]).toBe('Now 31');
    expect(lines).toContain(`Daily upkeep ${needed} (${units} units and you)`);
  });

  it('credits and plyx have no daily upkeep', () => {
    const state = campaign(reg, 4);
    state.resources.credits = 120;
    expect(read('credits', state)).toEqual(['Now 120', 'No daily upkeep', 'No recent changes']);
    expect(read('plyx', state)![1]).toBe('No daily upkeep');
  });

  it('credits list the last ledger changes with labels', () => {
    const state = campaign(reg, 4);
    const e = (day: number, action: string, delta: number, key = 'res:credits') => ({ day, slot: 'morning' as const, action, key, delta });
    state.ledger = [
      e(1, 'activity/do', 1), e(2, 'activity/do', 2), e(3, 'base/upgrade', -60), e(4, 'activity/do', 20),
      e(5, 'expedition/return', 45), e(6, 'item/craft', -15), e(6, 'activity/do', 99, 'res:plyx'),
    ];
    state.day = 6;
    const lines = read('credits', state)!;
    const changes = lines.filter((l) => l.includes(' — '));
    expect(changes).toEqual([
      '−15 — workshop, day 6',
      '+45 — expedition, day 5',
      '+20 — activity, day 4',
      '−60 — base, day 3',
      '+2 — activity, day 2',
    ]);
    expect(lines).not.toContain('No recent changes');
    expect(read('plyx', state)!.filter((l) => l.includes(' — '))).toEqual(['+99 — activity, day 6']);
  });

  it('no campaign gives no reading', () => {
    const env: AnalyzeEnv = { registries: reg, state: null, settings: DEFAULT_SETTINGS };
    expect(readingFor(parseSubject('glossary:credits')!, env)).toEqual({ lines: ['No campaign loaded.'] });
  });
});
