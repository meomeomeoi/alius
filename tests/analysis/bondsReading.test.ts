import { beforeAll, describe, expect, it } from 'vitest';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { readingFor } from '../../src/analysis/providers';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import { parseSubject } from '../../src/analysis/subject';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { campaign, loadCore } from '../helpers/world';
import { enable, withBond } from '../helpers/bonds';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
const env = (state: CampaignState | null): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS } });
const read = (address: string, state: CampaignState | null, ctx?: object): string[] =>
  readingFor(parseSubject(address, ctx ? JSON.stringify(ctx) : undefined)!, env(state))?.lines ?? [];

describe('content category readings (P9d)', () => {
  it('a category says whether it is switched on in this campaign', () => {
    const s = enable(campaign(reg, 4), 'restraint');
    expect(read('contentCategories:restraint', s)).toEqual(['In this campaign: switched on.']);
    expect(read('contentCategories:humiliation', s)).toEqual(['In this campaign: off. It is excluded from every generation.']);
  });

  it('the glossary entry lists what is on, or says nothing is', () => {
    expect(read('glossary:content_categories', campaign(reg, 4))).toEqual(['Switched on: nothing. Every category is off.']);
    const s = enable(campaign(reg, 4), 'explicit_scenes', 'restraint');
    expect(read('glossary:content_categories', s)).toEqual(['Switched on: [[contentCategories:restraint|Restraint]], [[contentCategories:explicit_scenes|Explicit scenes]].']);
  });

  it('with no campaign loaded the panel says so instead of guessing', () => {
    expect(read('contentCategories:restraint', null)).toEqual(['No campaign loaded.']);
    expect(read('glossary:content_categories', null)).toEqual(['No campaign loaded.']);
  });

  it('an unknown category id reads nothing', () => {
    expect(read('contentCategories:nope', campaign(reg, 4))).toEqual([]);
  });
});

describe('the bond profile reading', () => {
  it('shows her profile and her limits for the unit in the context, in words', () => {
    const s = withBond(campaign(reg, 4), 'unit_ann', { leadStyle: 'dominant', attachment: 'intense', desire: 'high', caretaker: true, publicity: 'secret', ownLimits: { categories: ['restraint'], note: 'Not in public.' } });
    const lines = read('glossary:bond_profile', s, { unitId: 'unit_ann' });
    expect(lines).toEqual([
      'Leads: dominant. Attaches: intense. Desire: high.',
      'A caretaker: she looks after others at her own cost.',
      'She wants a relationship to be: secret.',
      'She will not take part in: [[contentCategories:restraint|Restraint]]. Not in public.',
    ]);
  });

  it('a unit without a profile reads as modest; a grunt, an unknown unit or no context reads nothing', () => {
    const s = campaign(reg, 4);
    expect(read('glossary:bond_profile', s, { unitId: 'unit_bea' })).toEqual([
      'Leads: balanced. Attaches: steady. Desire: low.',
      'She wants a relationship to be: known.',
    ]);
    s.squad.find((u) => u.id === 'unit_cat')!.kind = 'grunt';
    expect(read('glossary:bond_profile', s, { unitId: 'unit_cat' })).toEqual([]);
    expect(read('glossary:bond_profile', s, { unitId: 'nobody' })).toEqual([]);
    expect(read('glossary:bond_profile', s)).toEqual([]);
  });

  it('the note is text and carries no markup into a link', () => {
    const s = withBond(campaign(reg, 4), 'unit_ann', { ownLimits: { categories: [], note: '[[glossary:trust|click]]' } });
    const lines = read('glossary:bond_profile', s, { unitId: 'unit_ann' });
    expect(lines.join('\n')).not.toContain('[[glossary:trust');
  });
});
