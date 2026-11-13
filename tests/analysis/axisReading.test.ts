import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resetKnowledgeRules } from '../../src/analysis/knowledge';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import { readingFor } from '../../src/analysis/providers';
import { parseSubject } from '../../src/analysis/subject';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { hiddenFixture } from '../fixtures/analyze/hidden';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => resetKnowledgeRules());

const read = (address: string, state: CampaignState, unitId: string | undefined, raw = false): string[] | null => {
  const env: AnalyzeEnv = { registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } };
  const subject = parseSubject(address, unitId === undefined ? undefined : JSON.stringify({ unitId }));
  return readingFor(subject!, env)?.lines ?? null;
};

describe('axis readings', () => {
  it('registering twice changes nothing', () => {
    const { state, unitId } = hiddenFixture(reg);
    registerCoreProviders();
    registerCoreProviders();
    expect(read('glossary:trust', state, unitId)!.filter((l) => l.startsWith('Ann:'))).toHaveLength(1);
  });

  it('bands only with raw values off', () => {
    const { state, unitId } = hiddenFixture(reg);
    const trust = read('glossary:trust', state, unitId)!;
    expect(trust[0]).toBe('Ann: GUARDED');
    expect(trust.join('\n')).not.toMatch(/\b37\b/);
    expect(trust.join('\n')).not.toMatch(/\b17\b/);
    expect(read('glossary:affinity', state, unitId)![0]).toBe('Ann: COLD');
    expect(read('glossary:attraction', state, unitId)![0]).toBe('Ann: FAINT');
    expect(read('glossary:affinity', state, unitId)!.join('\n')).not.toMatch(/41/);
  });

  it('raw adds the number and the signed trend', () => {
    const { state, unitId } = hiddenFixture(reg);
    const trust = read('glossary:trust', state, unitId, true)!;
    expect(trust[0]).toBe('Ann: GUARDED (37)');
    expect(trust[1]).toBe('Trend ▲ (+17)');
    expect(read('glossary:affinity', state, unitId, true)![0]).toBe('Ann: COLD (-41)');
  });

  it('trend arrows follow the ledger of the last 3 days', () => {
    const { state, unitId } = hiddenFixture(reg);
    const key = `axis:${unitId}:trust`;
    const entry = (day: number, delta: number, k = key) => ({ day, slot: 'morning' as const, action: 'scene/exchange', key: k, delta });
    const trend = (ledger: ReturnType<typeof entry>[], raw = false) => {
      state.ledger = ledger;
      return read('glossary:trust', state, unitId, raw)![1];
    };
    expect(state.day).toBe(8);
    expect(trend([entry(6, 5), entry(8, 2)])).toBe('Trend ▲');
    expect(trend([entry(6, -3)], true)).toBe('Trend ▼ (−3)');
    expect(trend([entry(5, 40)])).toBe('Trend ▬'); // day 5 is outside days 6–8
    expect(trend([entry(7, 4), entry(8, -4)])).toBe('Trend ▬');
    expect(trend([entry(8, 9, `axis:${unitId}:affinity`), entry(8, 9, 'axis:someone_else:trust')])).toBe('Trend ▬');
    delete state.ledger;
    expect(read('glossary:trust', state, unitId)![1]).toBe('Trend ▬');
  });

  it('the last three history events with causes, newest first', () => {
    const { state, unitId } = hiddenFixture(reg);
    const eventDeltas = new Map(reg.eventDeltas);
    eventDeltas.set('praised', { ...reg.eventDeltas.get('praised')!, cause: 'You praised her' });
    const local = { ...reg, eventDeltas } as Registries;
    state.relations[unitId].history = [
      { day: 1, kind: 'event', type: 'praised', severity: 'minor' },
      { day: 2, kind: 'state', type: 'comrade' },
      { day: 3, kind: 'event', type: 'sided_with', severity: 'moderate' },
      { day: 4, kind: 'event', type: 'rejected_advance', severity: 'minor' },
      { day: 5, kind: 'event', type: 'praised', severity: 'major' },
    ];
    const env: AnalyzeEnv = { registries: local, state, settings: DEFAULT_SETTINGS };
    const lines = readingFor(parseSubject('glossary:trust', JSON.stringify({ unitId }))!, env)!.lines;
    expect(lines.slice(2, 5)).toEqual([
      'You praised her — major, day 5',
      'Rejected advance — minor, day 4',
      'Sided with — moderate, day 3',
    ]);
    expect(lines[5]).toBe(`State: [[relationshipStates:${state.relations[unitId].stateId}]]`);
    expect(lines).toHaveLength(6);
  });

  it('an event without severity has none in its line, and no events means no history lines', () => {
    const { state, unitId } = hiddenFixture(reg);
    state.relations[unitId].history = [{ day: 4, kind: 'event', type: 'stress_high' }];
    expect(read('glossary:trust', state, unitId)![2]).toBe('Stress high, day 4');
    state.relations[unitId].history = [];
    const lines = read('glossary:trust', state, unitId)!;
    expect(lines).toHaveLength(3); // name, trend, state
    expect(lines[2].startsWith('State:')).toBe(true);
  });

  it('a grunt has no Affinity reading', () => {
    const { state, unitId } = hiddenFixture(reg);
    state.squad[0].kind = 'grunt';
    expect(read('glossary:affinity', state, unitId)).toEqual(['Grunts track Trust only.']);
    expect(read('glossary:attraction', state, unitId)).toEqual(['Grunts track Trust only.']);
    expect(read('glossary:trust', state, unitId)![0]).toBe('Ann: GUARDED');
  });

  it('romance off hides Attraction', () => {
    const { state, unitId } = hiddenFixture(reg);
    state.settings.intimacy = { romance: false, initiative: 'med' };
    expect(read('glossary:attraction', state, unitId)).toEqual(['Romance is off.']);
    expect(read('glossary:affinity', state, unitId)![0]).toBe('Ann: COLD');
  });

  it('an unknown unit, a missing unit id or no campaign gives no reading', () => {
    const { state, unitId } = hiddenFixture(reg);
    expect(read('glossary:trust', state, 'unit_nobody')).toBeNull();
    expect(read('glossary:trust', state, undefined)).toBeNull();
    expect(read('glossary:trust', state, 42 as unknown as string)).toBeNull();
    const env: AnalyzeEnv = { registries: reg, state: null, settings: DEFAULT_SETTINGS };
    expect(readingFor(parseSubject('glossary:trust', JSON.stringify({ unitId }))!, env)).toBeNull();
    delete (state.relations as Record<string, unknown>)[unitId];
    expect(read('glossary:trust', state, unitId)).toBeNull();
  });
});
