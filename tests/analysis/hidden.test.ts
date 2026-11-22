import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { resetKnowledgeRules } from '../../src/analysis/knowledge';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import { analyzeProviders, readingFor, registerAnalyzeProvider } from '../../src/analysis/providers';
import { parseSubject } from '../../src/analysis/subject';
import type { Registries } from '../../src/content/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { holderSource } from '../../src/engine/dynamic/command';
import { overrideChance } from '../../src/engine/warden/override';
import { hiddenFixture } from '../fixtures/analyze/hidden';
import { allReadings, keysWithoutSample, leaks } from '../helpers/analyze';
import { analyze } from '../helpers/analyzeCoverage';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => resetKnowledgeRules());

const envOf = (state: AnalyzeEnv['state'], showRawValues = false): AnalyzeEnv => ({
  registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues },
});

describe('hidden state never reaches a reading', () => {
  it('the core providers are registered, so the checks below are not vacuous', () => {
    expect([...analyzeProviders().keys()]).toEqual(expect.arrayContaining(['glossary:trust', 'glossary:affinity', 'glossary:attraction', 'glossary:stress']));
  });

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

  it('her life is read (so the checks are not vacuous) and its sentinels never are, raw values on or off', () => {
    const { state, unitId, sentinels } = hiddenFixture(reg);
    for (const raw of [false, true]) {
      const text = allReadings(envOf(state, raw), unitId);
      expect(text, `raw values ${raw}`).toContain('STEADY'); // `hobbies:reading`: the word for how keen she is, never the interest
      expect(text, `raw values ${raw}`).toContain('Held in the'); // `pastimes:`: from the entry
      expect(text, `raw values ${raw}`).toContain('terse'); // `glossary:temperament`
      expect(leaks(text, { numbers: [47.31, 63.17, 5.13, 19], texts: ['SENTINEL-UNTOLD', 'SENTINEL-KEEPS', 'SENTINEL-UNVOICED', 'SENTINEL-QUEUED', 'stargazing', 'woodcarving'] }), `raw values ${raw}`).toEqual([]);
    }
    expect(sentinels.texts).toEqual(expect.arrayContaining(['SENTINEL-UNTOLD', 'SENTINEL-KEEPS', 'SENTINEL-UNVOICED']));
  });

  it('her dynamic is read (so the checks are not vacuous) and its sentinels never are, raw values on or off, immersive or not', () => {
    const { state, unitId } = hiddenFixture(reg);
    const decimals = [37.37, 61.61, 59.59, 0.4141, 23.23, 7.77, 44.44];
    const texts = ['SENTINEL_COMPROMAT_P15', 'SENTINEL_TELL', 'SENTINEL_WORSHIP_HOW', 'SENTINEL_KNOWLEDGE_P15'];
    // her override has a chance and it is computed (the hold is her authority); it is never written, as a fraction or as a percentage
    const chance = overrideChance(1, holderSource(state, reg, unitId)!);
    expect(chance).toBeGreaterThan(0);
    const chanceTexts = [String(chance), String(Math.round(chance * 100) / 100), `${Math.round(chance * 100)}%`];
    for (const [raw, hidden] of [[false, false], [true, false], [false, true], [true, true]] as const) {
      const env = { ...envOf(state, raw), settings: { ...DEFAULT_SETTINGS, showRawValues: raw, dynamicHidden: hidden } };
      const text = allReadings(env, unitId);
      const label = `raw ${raw}, immersive ${hidden}`;
      if (hidden) expect(text, label).toContain('[[dynamic_felt]]'); // the band is felt
      else expect(text, label).toContain('Testing'); // `glossary:hold`: the band her 37.37 gives
      expect(text, label).toContain('dutiful'); // `glossary:her_reading`: her word, never the readiness behind it
      expect(text, label).toContain('The command'); // `dynamicDomains:command`
      expect(leaks(text, { numbers: [], texts: [...texts, ...chanceTexts] }), label).toEqual([]);
      for (const d of decimals) expect(text, `${label}: ${d}`).not.toContain(String(d));
      if (!raw) expect(leaks(text, { numbers: decimals, texts: [] }), label).toEqual([]);
      if (raw && !hidden) expect(analyze('glossary:hold', env, { unitId }).join(' ')).toContain('(37)'); // the whole number, only with raw values
      if (hidden) expect(analyze('glossary:hold', env, { unitId }).join(' '), label).not.toMatch(/37|Testing/); // never the number, even with raw values on, and not the band
    }
  });

  it('what no fact has shown is not read: an unrevealed zone has no attitude, and nothing of the aftermath or the mastery shows', () => {
    const { state, unitId } = hiddenFixture(reg);
    const zone = analyze('worshipTargets:feet', envOf(state, true), { unitId }).join(' ');
    expect(zone).toContain('Not known yet');
    expect(zone).not.toMatch(/craves|enjoys|dislikes|indifferent/);
    expect(zone).toMatch(/Mastery: one of five/); // the level, never the 23.23
    expect(analyze('glossary:compromat', envOf(state, true), { unitId })).toEqual([]);
    expect(analyze('glossary:aftermath', envOf(state, true), { unitId }).join(' ')).not.toMatch(/7\.77|grief/);
    expect(analyze('glossary:regard', envOf(state, true), { unitId })).toEqual([]);
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

  it('the harness notices a provider that leaks a P15 sentinel', () => {
    const { state, unitId, sentinels } = hiddenFixture(reg);
    const unregister = registerAnalyzeProvider('glossary:leaky_test', () => ({ lines: ['Her Regard is 61.61 and she keeps SENTINEL_COMPROMAT_P15, she taps when SENTINEL_TELL.'] }));
    try {
      const found = leaks(allReadings(envOf(state), unitId), sentinels);
      expect(found).toEqual(expect.arrayContaining(['61.61', 'SENTINEL_COMPROMAT_P15', 'SENTINEL_TELL']));
    } finally {
      unregister();
    }
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

  it('no state says so for a reading that needs a campaign, and says nothing otherwise', () => {
    const off = registerAnalyzeProvider('glossary:order_test', () => ({ lines: ['x'] }));
    try {
      expect(readingFor(parseSubject('glossary:order_test')!, envOf(null))).toEqual({ lines: ['No campaign loaded.'] });
      expect(readingFor(parseSubject('glossary:nothing_registered')!, envOf(null))).toBeNull();
    } finally {
      off();
    }
  });

  it('a stateless provider still runs without a campaign', () => {
    const off = registerAnalyzeProvider('glossary:order_test', (_s, env) => ({ lines: [`state ${env.state === null ? 'none' : 'some'}`] }), { stateless: true });
    try {
      expect(readingFor(parseSubject('glossary:order_test')!, envOf(null))).toEqual({ lines: ['state none'] });
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
