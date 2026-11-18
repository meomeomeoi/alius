import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { resetKnowledgeRules } from '../../src/analysis/knowledge';
import { analyzeProviders } from '../../src/analysis/providers';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { Registries } from '../../src/content/types';
import { addSecret } from '../../src/engine/personal/secrets';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { hiddenFixture } from '../fixtures/analyze/hidden';
import { allReadings, leaks } from '../helpers/analyze';
import { analyze } from '../helpers/analyzeCoverage';
import { campaign, loadCore } from '../helpers/world';
import { withDefect } from '../helpers/loyalty';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => resetKnowledgeRules());
const env = (state: CampaignState | null, raw = false): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } });
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const read = (state: CampaignState | null, unitId: string | null, raw = false): string => analyze('glossary:vitals', env(state, raw), unitId === null ? {} : { unitId }).join('\n');

function world(): CampaignState {
  const s = campaign(reg, 4);
  s.day = 5;
  s.slot = 'afternoon';
  for (const u of s.squad) u.defects = [];
  return s;
}

describe('glossary:vitals', () => {
  it('is registered by the core providers', () => {
    expect([...analyzeProviders().keys()]).toContain('glossary:vitals');
  });

  it('words the pattern and its causes in bands, with no digit at all', () => {
    const s = world();
    s.ledger = [{ day: 5, slot: 'afternoon', action: 'combat/act', key: `stress:${ANN}`, delta: 17 }];
    const text = read(s, ANN, true);
    expect(text).toMatch(/Ann/);
    expect(text).toMatch(/spik/i);
    expect(text).toMatch(/fighting/i);
    expect(text).not.toMatch(/\d/);
  });

  it('a steady unit has no triggers line; a flat one says what a flat line can and cannot mean', () => {
    const s = world();
    expect(read(s, ANN)).not.toMatch(/Recent triggers/);
    withDefect(s, BEA, 'affect_dampener');
    const flat = read(s, BEA);
    expect(flat).toMatch(/flat/i);
    expect(flat).toMatch(/flicker/i);
  });

  it('says what a pattern can mean without claiming to read her mind', () => {
    const s = world();
    s.squad[0].stress = 90;
    expect(read(s, ANN)).toMatch(/can mean|cannot tell|does not say/i);
  });

  it('nothing for a missing unit, a grunt or no campaign', () => {
    const s = world();
    expect(read(s, 'nobody')).toBe('');
    expect(read(null, ANN)).not.toMatch(/implant|pulse|line/i);
    expect(read(s, null)).toBe('');
  });
});

describe('hidden state never reaches a vitals reading', () => {
  it('the hidden fixture leaks nothing over every registered provider, raw on and off', () => {
    const { state, unitId, sentinels } = hiddenFixture(reg);
    for (const raw of [false, true]) {
      const text = allReadings(env(state, raw), unitId);
      expect(leaks(text, { numbers: raw ? [] : sentinels.numbers, texts: sentinels.texts }), `raw ${raw}`).toEqual([]);
    }
    expect(read(state, unitId)).toContain(state.squad[0].displayName);
  });

  it('a hidden injury shows no fever in the reading and no mention of the injury', () => {
    const s = world();
    s.squad[0].injuryDays = 3;
    expect(read(s, ANN)).toMatch(/temperature is running high/i);
    addSecret(s, reg, { kindId: 'hidden_injury', knownBy: [ANN, BEA], subjectId: ANN, vars: { name: 'Ann' } });
    const text = read(s, ANN);
    expect(text).not.toMatch(/temperature|fever|injur|hurt/i);
  });
});
