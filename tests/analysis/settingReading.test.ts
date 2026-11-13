import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resetKnowledgeRules } from '../../src/analysis/knowledge';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { readingFor } from '../../src/analysis/providers';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import { parseSubject } from '../../src/analysis/subject';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../src/settings';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => resetKnowledgeRules());

const read = (key: string, over: Partial<AliusSettings> = {}, state: CampaignState | null = campaign(reg, 4)) => {
  const env: AnalyzeEnv = { registries: reg, state, settings: { ...DEFAULT_SETTINGS, ...over } };
  return readingFor(parseSubject(`setting:${key}`)!, env)?.lines ?? null;
};

describe('setting readings', () => {
  it('shows the current value', () => {
    expect(read('showRawValues')).toEqual(['Now: off', 'Takes effect at once.']);
    expect(read('showRawValues', { showRawValues: true })![0]).toBe('Now: on');
    expect(read('palette')![0]).toBe('Now: amber');
    expect(read('spriteMode')![0]).toBe('Now: Native Expressions');
    expect(read('intentMode', { intentMode: 'every_n' })![0]).toBe('Now: every N exchanges');
    expect(read('beatCooldownDays')![0]).toBe('Now: 3');
    expect(read('budgets')![0]).toBe('Now: per call type');
    expect(read('mechanicProfileId')![0]).toBe('Now: none');
    expect(read('difficulty')![0]).toBe('Now: normal');
  });

  it("difficulty shows the campaign's own value", () => {
    const state = campaign(reg, 4);
    state.difficulty = 'hard';
    expect(read('difficulty', {}, state)![0]).toBe('Now: hard');
  });

  it('a campaign started with Desire/Bond off says it keeps its value', () => {
    const state = campaign(reg, 4);
    state.settings.desireBondDefects = false;
    expect(read('desireBondDefects', { desireBondDefects: true }, state)).toEqual(['Now: on', 'This campaign keeps its own value: off']);
    state.settings.desireBondDefects = true;
    expect(read('desireBondDefects', { desireBondDefects: true }, state)).toEqual(['Now: on', 'Takes effect at once.']);
  });

  it('difficulty is locked in combat', () => {
    const state = campaign(reg, 4);
    state.combat = {} as CampaignState['combat'];
    expect(read('difficulty', {}, state)).toEqual(['Now: normal', 'Locked while a combat is open']);
  });

  it('the analysis settings say nothing about locks', () => {
    for (const key of ['analyzeEnabled', 'analyzeAnimation', 'analyzeHoverDelay']) {
      expect(read(key)!, key).toHaveLength(1);
    }
    expect(read('analyzeAnimation')![0]).toBe('Now: full');
    expect(read('analyzeHoverDelay')![0]).toBe('Now: 250');
  });

  it('settings are global: they read without a campaign, the per-campaign ones say so', () => {
    expect(read('nope')).toBeNull();
    expect(read('showRawValues', {}, null)).toEqual(['Now: off', 'Takes effect at once.']);
    expect(read('palette', { palette: 'green' }, null)).toEqual(['Now: green', 'Takes effect at once.']);
    expect(read('difficulty', {}, null)).toEqual(['Set per campaign.']);
    expect(read('desireBondDefects', { desireBondDefects: true }, null)).toEqual(['Now: on', 'Takes effect at once.']);
  });
});
