import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resetKnowledgeRules } from '../../src/analysis/knowledge';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import { readingFor } from '../../src/analysis/providers';
import { parseSubject } from '../../src/analysis/subject';
import type { Registries } from '../../src/content/types';
import type { CampaignState, LedgerEntry } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { hiddenFixture } from '../fixtures/analyze/hidden';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  for (const band of ['strained', 'breaking', 'breakdown']) {
    reg.glossary.set(`stress_${band}`, { id: `stress_${band}`, term: band, short: `At ${band} something changes.` });
  }
  registerCoreProviders();
});
afterEach(() => resetKnowledgeRules());

const read = (state: CampaignState, unitId: string, raw = false): string[] | null => {
  const env: AnalyzeEnv = { registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } };
  return readingFor(parseSubject('glossary:stress', JSON.stringify({ unitId }))!, env)?.lines ?? null;
};
const stressEntry = (unitId: string, day: number, action: string, delta: number): LedgerEntry => ({ day, slot: 'morning', action, key: `stress:${unitId}`, delta });

describe('stress reading', () => {
  it('band and next threshold', () => {
    const { state, unitId } = hiddenFixture(reg);
    state.ledger = [];
    const at = (stress: number) => {
      state.squad[0].stress = stress;
      return read(state, unitId)!;
    };
    expect(at(63)[0]).toBe('Ann: STRAINED');
    expect(at(63)).toContain('Next: At breaking something changes.');
    expect(at(10)[0]).toBe('Ann: CALM');
    expect(at(10)).toContain('Next: At strained something changes.');
    expect(at(49)).toContain('Next: At strained something changes.');
    expect(at(80)[0]).toBe('Ann: BREAKING');
    expect(at(80)).toContain('Next: At breakdown something changes.');
    const top = at(100);
    expect(top[0]).toBe('Ann: BREAKDOWN');
    expect(top.some((l) => l.startsWith('Next:'))).toBe(false);
    expect(read(state, unitId, true)![0]).toBe('Ann: BREAKDOWN (100)');
  });

  it('without a glossary entry the next band is named', () => {
    const { state, unitId } = hiddenFixture(reg);
    const saved = reg.glossary.get('stress_breaking')!;
    reg.glossary.delete('stress_breaking');
    try {
      expect(read(state, unitId)).toContain('Next: BREAKING');
    } finally {
      reg.glossary.set('stress_breaking', saved);
    }
  });

  it('sources group by label and hide amounts without raw', () => {
    const { state, unitId } = hiddenFixture(reg);
    state.day = 8;
    state.ledger = [
      stressEntry(unitId, 5, 'combat/accept', 99), // before day 7: outside the window
      stressEntry(unitId, 7, 'expedition/return', 8),
      stressEntry(unitId, 8, 'activity/do', -10),
      stressEntry(unitId, 8, 'expedition/return', 4),
      { day: 8, slot: 'morning', action: 'combat/accept', key: 'stress:someone_else', delta: 20 },
      { day: 8, slot: 'morning', action: 'combat/accept', key: `axis:${unitId}:trust`, delta: 5 },
    ];
    const raw = read(state, unitId, true)!;
    expect(raw).toContain('+12 expedition');
    expect(raw).toContain('−10 activity');
    expect(raw.join('\n')).not.toContain('combat');
    const hidden = read(state, unitId)!;
    expect(hidden).toContain('rose — expedition');
    expect(hidden).toContain('fell — activity');
    expect(hidden.join('\n')).not.toMatch(/\d/); // the ledger amounts never show
  });

  it('a group that cancels out is left out', () => {
    const { state, unitId } = hiddenFixture(reg);
    state.ledger = [stressEntry(unitId, 8, 'activity/do', 5), stressEntry(unitId, 8, 'activity/do', -5)];
    const lines = read(state, unitId)!;
    expect(lines.join('\n')).not.toContain('activity');
    expect(lines).toContain('No recent changes');
  });

  it('a save without ledger says No recent changes', () => {
    const state = campaign(reg, 4);
    expect(state.ledger).toBeUndefined();
    const unitId = state.squad[0].id;
    const lines = read(state, unitId)!;
    expect(lines).toContain('No recent changes');
    expect(lines[0]).toMatch(/^Ann: /);
  });

  it('an unknown unit gives no reading', () => {
    const { state } = hiddenFixture(reg);
    expect(read(state, 'unit_nobody')).toBeNull();
  });
});
