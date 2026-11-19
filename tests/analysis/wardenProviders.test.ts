import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildKnowledge, resetKnowledgeRules } from '../../src/analysis/knowledge';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { Registries } from '../../src/content/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { hiddenFixture } from '../fixtures/analyze/hidden';
import { allReadings, leaks } from '../helpers/analyze';
import { analyze } from '../helpers/analyzeCoverage';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); registerCoreProviders(); });
afterEach(() => resetKnowledgeRules());

const envOf = (state: AnalyzeEnv['state'], showRawValues = false): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues } });

describe('the warden readings', () => {
  it('satisfaction and defiance read as bands; numbers only with raw values on', () => {
    const { state } = hiddenFixture(reg);
    const quiet = analyze('glossary:warden_satisfaction', envOf(state)).join(' ');
    expect(quiet).toMatch(/wary/);
    expect(quiet).not.toContain('43');
    expect(analyze('glossary:warden_satisfaction', envOf(state, true)).join(' ')).toContain('43');
    const def = analyze('glossary:warden_defiance', envOf(state)).join(' ');
    expect(def).toMatch(/is low/);
    expect(def).not.toContain('47');
    expect(analyze('glossary:warden_defiance', envOf(state, true)).join(' ')).toContain('47');
  });

  it('an expectation reads only once it is known', () => {
    const { state } = hiddenFixture(reg);
    // x2 (meet_quota) is unknown, x3 (protect_squad) is known
    expect(analyze('wardenExpectations:warden_meet_quota', envOf(state))).toEqual([]);
    expect(analyze('wardenExpectations:warden_protect_squad', envOf(state)).join(' ')).toMatch(/low/);
  });

  it('no reading carries the unknown expectation, the suspicion or any sentinel', () => {
    const { state, unitId, sentinels } = hiddenFixture(reg);
    for (const raw of [false, true]) expect(leaks(allReadings(envOf(state, raw), unitId), { numbers: [], texts: sentinels.texts }), `raw ${raw}`).toEqual([]);
    expect(leaks(allReadings(envOf(state), unitId), { numbers: sentinels.numbers, texts: [] })).toEqual([]);
  });

  it('the knowledge rule hides what the warden knows about an ally', () => {
    const { state } = hiddenFixture(reg);
    const k = buildKnowledge(state, DEFAULT_SETTINGS);
    expect(k.flagVisible('warden_knows_ally')).toBe(false);
    expect(k.flagVisible('warden_ally')).toBe(true);
  });

  it('no readings without a warden', () => {
    const { state } = hiddenFixture(reg);
    delete state.leashswap;
    expect(analyze('glossary:warden_satisfaction', envOf(state))).toEqual([]);
  });
});
