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

describe('the lead reading (Task 8)', () => {
  const romantic = () => {
    const s = campaign(reg, 4);
    s.relations.unit_ann.stateId = 'lover';
    withBond(s, 'unit_ann', { leadStyle: 'dominant' });
    s.scene = { id: 's1', day: 1, slot: 'morning', locationId: 'mess_hall', participants: ['unit_ann'], mode: 'private', origin: 'event', consumesSlot: true, startIndex: 0, exchanges: 0, tone: 'romantic', lead: { by: 'unit', unitId: 'unit_ann', score: 85 } };
    return s;
  };

  it('says who leads in words, with no number while raw values are off', () => {
    const lines = read('glossary:lead', romantic());
    expect(lines[0]).toBe('This scene: Ann leads.');
    expect(lines.join('\n')).not.toMatch(/\d/);
    expect(lines.join('\n')).toMatch(/dominant/i);
  });

  it('shows the score and its parts with raw values on', () => {
    const s = romantic();
    const lines = readingFor(parseSubject('glossary:lead')!, { registries: reg, state: s, settings: { ...DEFAULT_SETTINGS, showRawValues: true } })?.lines ?? [];
    expect(lines.join('\n')).toMatch(/Score: \d+/);
    expect(lines.join('\n')).toMatch(/Style: \+75/);
  });

  it('reads nothing without a lead', () => {
    expect(read('glossary:lead', campaign(reg, 4))).toEqual([]);
  });
});

describe('the Want reading (Task 12)', () => {
  const hungry = (want: number) => {
    const s = campaign(reg, 4);
    s.relations.unit_ann.stateId = 'lover';
    withBond(s, 'unit_ann', { desire: 'high' });
    s.relations.unit_ann.want = want;
    return s;
  };
  const raw = (s: CampaignState, on: boolean) => readingFor(parseSubject('glossary:want', JSON.stringify({ unitId: 'unit_ann' }))!, { registries: reg, state: s, settings: { ...DEFAULT_SETTINGS, showRawValues: on } })?.lines ?? [];

  it('shows a band, never a number, unless raw values are on', () => {
    const plain = raw(hungry(73), false);
    expect(plain[0]).toBe('Her want: aching.');
    expect(plain.join('\n')).not.toMatch(/\d/);
    expect(raw(hungry(73), true)[0]).toBe('Her want: aching (73).');
  });

  it('says what the band does, in words', () => {
    expect(raw(hungry(45), false).join(' ')).toMatch(/write first|come to the door/i);
    expect(raw(hungry(75), false).join(' ')).toMatch(/irritable|stress/i);
    expect(raw(hungry(95), false).join(' ')).toMatch(/break/i);
    expect(raw(hungry(10), false)[0]).toBe('Her want: calm.');
  });

  it('reads nothing for a unit Want does not run for, or without a unit', () => {
    const modest = campaign(reg, 4);
    expect(raw(modest, false)).toEqual([]);
    expect(read('glossary:want', hungry(50))).toEqual([]); // no unit in the context
  });
});

describe('the rule reading (Task 12)', () => {
  const withRule = (over: object = {}) => {
    const s = campaign(reg, 4);
    s.bonds = { rules: [{ id: 'r1', unitId: 'unit_ann', templateId: 'report_evening', text: 'Report to me.', status: 'active', day: 1, brokenCount: 2, lastBrokenDay: 3, ...over }] };
    return s;
  };
  const rd = (s: CampaignState, ctx: object = { unitId: 'unit_ann', ruleId: 'r1' }) => read('relationshipRuleTemplates:report_evening', s, ctx);

  it('says its status, how often it was broken and how the game judges it', () => {
    const lines = rd(withRule());
    expect(lines[0]).toBe('Her rule: active. Broken 2 times.');
    expect(lines.join(' ')).toMatch(/day without/i);
    expect(rd(withRule({ brokenCount: 1 }))[0]).toBe('Her rule: active. Broken once.');
    expect(rd(withRule({ brokenCount: 0, status: 'negotiating' }))[0]).toBe('Her rule: being negotiated. Never broken.');
  });

  it('reads the check of the template, and nothing for an unknown rule', () => {
    expect(read('relationshipRuleTemplates:hands_off_gear', withRule({ templateId: 'hands_off_gear' }), { unitId: 'unit_ann', ruleId: 'r1' }).join(' ')).toMatch(/what you say|talk/i);
    expect(rd(withRule(), { unitId: 'unit_ann', ruleId: 'nope' })).toEqual([]);
    expect(rd(withRule(), {})).toEqual([]);
  });
});

describe('the publicity reading (Task 16)', () => {
  const romantic = (level: 'secret' | 'known' | 'public', pref: 'secret' | 'known' | 'public' = 'known') => {
    const s = campaign(reg, 4);
    s.relations.unit_ann.stateId = 'lover';
    withBond(s, 'unit_ann', { publicity: pref });
    s.relations.unit_ann.publicity = { level, since: 1 };
    return s;
  };
  const rd = (s: CampaignState, on = false) => readingFor(parseSubject('glossary:publicity', JSON.stringify({ unitId: 'unit_ann' }))!, { registries: reg, state: s, settings: { ...DEFAULT_SETTINGS, showRawValues: on } })?.lines ?? [];

  it('says how open it is and what she prefers; a mismatch says she wants to talk', () => {
    expect(rd(romantic('known'))[0]).toBe('The relationship is known; she prefers known.');
    expect(rd(romantic('known'))).toHaveLength(1);
    expect(rd(romantic('public', 'secret'))).toEqual(['The relationship is public; she prefers secret.', 'She would like to talk about it.']);
  });

  it('a secret can come out; the percentage only with raw values on', () => {
    const plain = rd(romantic('secret'), false).join('\n');
    expect(plain).toMatch(/can come out/);
    expect(plain).not.toMatch(/\d/);
    expect(rd(romantic('secret'), true).join('\n')).toMatch(/about 8 %/);
  });

  it('reads nothing without a romantic relation or without a unit', () => {
    expect(rd(campaign(reg, 4))).toEqual([]);
    expect(read('glossary:publicity', romantic('known'))).toEqual([]);
  });
});
