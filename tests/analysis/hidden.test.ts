import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { resetKnowledgeRules } from '../../src/analysis/knowledge';
import { analyzeProviders, readingFor, registerAnalyzeProvider } from '../../src/analysis/providers';
import { parseSubject } from '../../src/analysis/subject';
import type { Registries } from '../../src/content/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { hiddenFixture } from '../fixtures/analyze/hidden';
import { allReadings, keysWithoutSample, leaks } from '../helpers/analyze';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => resetKnowledgeRules());

const envOf = (state: AnalyzeEnv['state'], showRawValues = false): AnalyzeEnv => ({
  registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues },
});

describe('hidden state never reaches a reading', () => {
  it('no provider shows a sentinel number with raw values off', () => {
    const { state, unitId, sentinels } = hiddenFixture(reg);
    const text = allReadings(envOf(state), unitId);
    expect(leaks(text, { numbers: sentinels.numbers, texts: [] })).toEqual([]);
  });

  it('no provider shows a sentinel text', () => {
    const { state, unitId, sentinels } = hiddenFixture(reg);
    for (const raw of [false, true]) {
      const text = allReadings(envOf(state, raw), unitId);
      expect(leaks(text, { numbers: [], texts: sentinels.texts }), `raw values ${raw}`).toEqual([]);
    }
  });

  it('every bare-source provider has a sample address', () => {
    expect(keysWithoutSample()).toEqual([]);
  });

  it('the harness itself notices a leaking provider', () => {
    const { state, unitId, sentinels } = hiddenFixture(reg);
    const unregister = registerAnalyzeProvider('glossary:leaky_test', () => ({ lines: ['Trust is 37 and SENTINEL_CLOCK ticks.'] }));
    try {
      const found = leaks(allReadings(envOf(state), unitId), sentinels);
      expect(found).toContain('37');
      expect(found).toContain('SENTINEL_CLOCK');
    } finally {
      unregister();
    }
    expect(leaks(allReadings(envOf(state), unitId), sentinels)).toEqual([]);
  });

  it('leaks() matches whole numbers only', () => {
    const s = { numbers: [37], texts: [] };
    expect(leaks('day 137, 3.37, 370', s)).toEqual([]);
    expect(leaks('Trust 37.', s)).toEqual(['37']);
  });
});

describe('provider registry', () => {
  it('a throwing provider is skipped', () => {
    const { state } = hiddenFixture(reg);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const off1 = registerAnalyzeProvider('glossary:order_test', () => { throw new Error('boom'); });
    const off2 = registerAnalyzeProvider('glossary:order_test', () => ({ lines: ['still here'] }));
    try {
      const r = readingFor(parseSubject('glossary:order_test')!, envOf(state));
      expect(r).toEqual({ lines: ['still here'] });
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      off1();
      off2();
      warn.mockRestore();
    }
  });

  it('exact-address providers come before source providers, lines are concatenated', () => {
    const { state } = hiddenFixture(reg);
    const offs = [
      registerAnalyzeProvider('glossary', () => ({ lines: ['by source'] })),
      registerAnalyzeProvider('glossary:order_test', () => ({ lines: ['exact one', 'exact two'] })),
    ];
    try {
      expect(readingFor(parseSubject('glossary:order_test')!, envOf(state))!.lines).toEqual(['exact one', 'exact two', 'by source']);
      expect(readingFor(parseSubject('glossary:other_test')!, envOf(state))!.lines).toEqual(['by source']);
    } finally {
      offs.forEach((off) => off());
    }
  });

  it('no state gives no reading', () => {
    const off = registerAnalyzeProvider('glossary:order_test', () => ({ lines: ['x'] }));
    try {
      expect(readingFor(parseSubject('glossary:order_test')!, envOf(null))).toBeNull();
    } finally {
      off();
    }
  });

  it('a provider that returns null or nothing gives no reading', () => {
    const { state } = hiddenFixture(reg);
    const off = registerAnalyzeProvider('glossary:order_test', () => null);
    const off2 = registerAnalyzeProvider('glossary:order_test', () => ({ lines: [] }));
    try {
      expect(readingFor(parseSubject('glossary:order_test')!, envOf(state))).toBeNull();
    } finally {
      off();
      off2();
    }
  });

  it('unregistering removes the provider and its key', () => {
    const off = registerAnalyzeProvider('glossary:order_test', () => ({ lines: ['x'] }));
    expect(analyzeProviders().has('glossary:order_test')).toBe(true);
    off();
    expect(analyzeProviders().has('glossary:order_test')).toBe(false);
  });
});
