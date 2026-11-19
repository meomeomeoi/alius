import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { buildCampaign, validateSetup, type SetupResult } from '../../src/engine/setup';
import { getCallType } from '../../src/llm/callTypes';
import '../../src/llm/calls/all';
import { ALL_SECTIONS } from '../../src/llm/calls/profileImport';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { buildImportInput, sanitizeProfile } from '../../src/setup/profile';
import { loadCore, unitSetup } from '../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const sanitize = (development: unknown) => sanitizeProfile({ development }, { registries: reg, desireBondDefects: false, sections: ['development'] });
const card = { name: 'Ann', description: 'A fierce soldier.', personality: 'Loyal.', scenario: '', creatorNotes: '', firstMessage: '' } as never;

describe('anchors and insight at import (P14b)', () => {
  it('the development section is part of a full import', () => {
    expect(ALL_SECTIONS).toContain('development');
  });

  it('anchors are validated, deduped and capped at four', () => {
    const { profile, dropped } = sanitize({
      anchors: ['value:ingroup', 'value:greed', 'bond:ownLimits', 'value:ingroup', 'like:x', 'value:mercy', 'value:autonomy', 'bond:desire', 'taste:nope', 'like:Not A Tag'],
      insight: 'high',
    });
    expect(profile.anchors).toEqual(['value:ingroup', 'like:x', 'value:mercy', 'value:autonomy']);
    expect(profile.insight).toBe('high');
    expect(dropped).toEqual(expect.arrayContaining(['development:value:greed', 'development:bond:ownLimits']));
  });

  it('accepts a bond field in its camelCase spelling and a taste of the registry', () => {
    const taste = [...reg.tastes.keys()][0];
    expect(sanitize({ anchors: ['bond:leadStyle', `taste:${taste}`] }).profile.anchors).toEqual(['bond:lead_style', `taste:${taste}`]);
  });

  it('insight defaults to mid, and a junk answer is no answer', () => {
    expect(sanitize({ anchors: [] }).profile.insight).toBe('mid');
    expect(sanitize({ insight: 'genius' }).profile.insight).toBe('mid');
    expect(sanitize('nonsense').profile).toMatchObject({ anchors: [], insight: 'mid' });
  });

  it('is optional by nature: it is never missing', () => {
    expect(sanitizeProfile({}, { registries: reg, desireBondDefects: false, sections: ['development'] }).missing).toEqual([]);
  });

  it('the prompt lists the axis keys and names no content category', () => {
    const input = buildImportInput(card, reg, { ...DEFAULT_SETTINGS }, ['development']);
    const ct = getCallType('profile_import')!;
    const text = `${ct.system(input) as string}\n${ct.prompt(input) as string}`;
    expect(text).toContain('value:mercy');
    expect(text).toContain('bond:lead_style');
    expect(text).not.toContain(':.any');
    expect(text).not.toMatch(/\b(he|him|his)\b/i);
    for (const c of reg.contentCategories.values()) expect(text.toLowerCase()).not.toContain(String(c.label).toLowerCase());
  });

  it('a section that is not asked is not in the prompt', () => {
    const input = buildImportInput(card, reg, { ...DEFAULT_SETTINGS }, ['values']);
    expect(input.development).toBeUndefined();
    const ct = getCallType('profile_import')!;
    expect(`${ct.system(input) as string}\n${ct.prompt(input) as string}`).not.toContain('DEVELOPMENT');
  });
});

describe('setup writes anchors and insight', () => {
  const build = (over: Record<string, unknown> = {}) => {
    const r: SetupResult = { commanderName: 'Vale', startId: 'start_vesper', crimeId: 'liquidation', units: [unitSetup('Ann', over)] };
    const out = buildCampaign(r, reg, { desireBondDefects: false, seed: 4 });
    if (!out.ok) throw new Error(out.errors.join('; '));
    return out.state.squad[0];
  };

  it('a build without anchors writes no development, and a mid insight no field', () => {
    const u = build();
    expect(u.development).toBeUndefined();
    expect(u.insight).toBeUndefined();
    expect('development' in build({ anchors: [], insight: 'mid' })).toBe(false);
    expect('insight' in build({ insight: 'mid' })).toBe(false);
  });

  it('anchors become the development block and a low insight a field', () => {
    const u = build({ anchors: ['value:ingroup', 'like:tea'], insight: 'low' });
    expect(u.development).toMatchObject({ anchors: ['value:ingroup', 'like:tea'], drift: {}, acc: {}, pending: [], facts: [], nextId: 0 });
    expect(u.insight).toBe('low');
  });

  it('a bad anchor or insight is a setup error', () => {
    const errs = (over: Record<string, unknown>) => validateSetup({ commanderName: 'Vale', startId: 'start_vesper', crimeId: 'liquidation', units: [unitSetup('Ann', over)] }, reg, { desireBondDefects: false });
    expect(errs({ anchors: ['value:greed'] }).join(';')).toMatch(/anchor/i);
    expect(errs({ anchors: ['value:mercy', 'value:autonomy', 'value:ingroup', 'value:pragmatism', 'value:corporate'] }).join(';')).toMatch(/at most 4/);
    expect(errs({ insight: 'genius' }).join(';')).toMatch(/insight/i);
    expect(errs({ anchors: ['value:mercy'], insight: 'high' })).toEqual([]);
  });
});
