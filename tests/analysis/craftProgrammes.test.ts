import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildKnowledge, resetKnowledgeRules } from '../../src/analysis/knowledge';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { hiddenFixture } from '../fixtures/analyze/hidden';
import { allReadings, leaks } from '../helpers/analyze';
import { analyze } from '../helpers/analyzeCoverage';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); registerCoreProviders(); });
afterEach(() => resetKnowledgeRules());

const env = (state: CampaignState | null, raw = false): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } });

describe('the programmes in Knowledge.craft and their readings (P16b, Tasks 19 and 21)', () => {
  it('the view carries her norm in words and the days of her sentence left, and nothing of the exam, the praise or the crime', () => {
    const { state, unitId } = hiddenFixture(reg);
    const pair = buildKnowledge(state, DEFAULT_SETTINGS).craft(reg).pairs.find((p) => p.unitId === unitId)!;
    expect(pair).toMatchObject({ norm: 'weight 4 minutes, posture 10 minutes', sentence: { daysLeft: 12 } });
    expect(JSON.stringify(pair)).not.toMatch(/1717|SENTINEL|sentinel|strain_trade|exam|results|passes|landed|extended|crime/);
    delete state.relations[unitId].craft!.sentence;
    delete state.relations[unitId].craft!.drill;
    const bare = buildKnowledge(state, DEFAULT_SETTINGS).craft(reg).pairs.find((p) => p.unitId === unitId)!;
    expect('norm' in bare).toBe(false);
    expect('sentence' in bare).toBe(false);
  });

  it('a served sentence is not shown', () => {
    const { state, unitId } = hiddenFixture(reg);
    state.relations[unitId].craft!.sentence!.servedDay = 19;
    expect('sentence' in buildKnowledge(state, DEFAULT_SETTINGS).craft(reg).pairs.find((p) => p.unitId === unitId)!).toBe(false);
  });

  it('glossary:craft_norm reads her norms in fiction time and never the pass mark', () => {
    const { state, unitId } = hiddenFixture(reg);
    const lines = analyze('glossary:craft_norm', env(state), { unitId });
    expect(lines.join(' ')).toMatch(/weight 4 minutes, posture 10 minutes/);
    expect(lines.join(' ')).not.toMatch(/80|pass mark|%|1717/);
    expect(analyze('glossary:craft_norm', env(state), { unitId: 'unit_nobody' }).join(' ')).toMatch(/no norm/i);
  });

  it('glossary:craft_sentence reads the days left, with no crime, no echo and no extension count', () => {
    const { state, unitId } = hiddenFixture(reg);
    const lines = analyze('glossary:craft_sentence', env(state), { unitId });
    expect(lines.join(' ')).toMatch(/12 days/);
    expect(lines.join(' ')).not.toMatch(/strain|tithe|crime|6|extended|echo/i);
    expect(analyze('glossary:craft_sentence', env(state), { unitId: 'unit_nobody' }).join(' ')).toMatch(/no sentence/i);
  });

  it('no reading carries a sentinel: not the exam\'s results, the praise text or its words, or the crime', () => {
    const { state, unitId, sentinels } = hiddenFixture(reg);
    const text = [
      ...analyze('glossary:craft_norm', env(state), { unitId }), ...analyze('glossary:craft_sentence', env(state), { unitId }), ...analyze('glossary:craft', env(state), { unitId }),
      allReadings(env(state), unitId),
    ].join('\n');
    expect(leaks(text, sentinels)).toEqual([]);
    const raw = allReadings(env(state, true), unitId);
    expect(leaks(raw, { numbers: [1717], texts: ['SENTINEL-PRAISE-TEXT', 'sentinelpraiseword', 'strain_trade'] })).toEqual([]); // not even with raw values on
  });
});
