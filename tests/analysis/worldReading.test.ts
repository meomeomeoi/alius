import { beforeAll, describe, expect, it } from 'vitest';
import { buildPanelModel, type AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import { entryEffects, summarizeDispositionLevel, summarizeWorldOptionEffect } from '../../src/analysis/effects';
import { parseSubject } from '../../src/analysis/subject';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
  base = campaign(reg, 2);
});

const DIGITS = /\d/;
const PRONOUN = /\b(he|him|his|himself)\b/i;
const env = (state: CampaignState | null, raw = false): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } });
const panel = (address: string, ctx: Record<string, unknown> | null, e: AnalyzeEnv) => buildPanelModel(parseSubject(address, ctx ? JSON.stringify(ctx) : null)!, e);
const textOf = (m: ReturnType<typeof panel>) => [m.text ?? '', m.long ?? '', ...m.effects, ...(m.reading?.lines ?? [])].join('\n');
const worldOf = (options: Record<string, string>, over: (s: CampaignState) => void = () => {}): CampaignState => {
  const s = structuredClone(base);
  s.world.options = { ...(s.world.options ?? {}), ...options };
  over(s);
  return s;
};

describe('world option readings', () => {
  it('locked option reading says locked, a live one says it can change', () => {
    const locked = panel('worldOptions:oversight', null, env(worldOf({ oversight: 'brutal' })));
    expect(locked.reading!.lines).toContain('Now: Brutal');
    expect(locked.reading!.lines).toContain('Locked at campaign start.');
    const live = panel('worldOptions:bloom_horror', null, env(worldOf({})));
    expect(live.reading!.lines).toContain('Now: Restrained');
    expect(live.reading!.lines).toContain('Can change during the campaign.');
  });

  it('a choice card names the choice and lists its effects in words', () => {
    const m = panel('worldOptions:oversight', { choice: 'brutal' }, env(worldOf({})));
    expect(m.text).toBe(String(reg.worldOptions.get('oversight')!.description));
    expect(m.effects).toEqual(expect.arrayContaining(['Fewer Leash authorizations each week', 'Termination requests are approved less often', 'Failed command missions cost more standing']));
    expect(m.reading!.lines).toContain('This choice: Brutal');
    const lenient = panel('worldOptions:oversight', { choice: 'lenient' }, env(worldOf({})));
    expect(lenient.effects).toEqual(expect.arrayContaining(['More Leash authorizations each week']));
    expect(lenient.effects).not.toContain('Fewer Leash authorizations each week');
  });

  it('without a choice in the context the option lists every choice with its effects', () => {
    const m = panel('worldOptions:offspec_stigma', null, env(null));
    expect(m.effects.some((l) => l.startsWith('Scorned: ') && /pay less/i.test(l))).toBe(true);
    expect(m.effects.some((l) => l.startsWith('Hunted: '))).toBe(true);
    expect(m.reading!.lines).toEqual(['No campaign loaded.']); // the wizard has no campaign: the panel keeps its static text and effects
  });

  it('no digits and no pronoun for the commander with raw values off, for every option, choice and level', () => {
    for (const option of reg.worldOptions.values()) {
      for (const choice of option.choices as Array<{ id: string }>) {
        const state = worldOf({ [String(option.id)]: choice.id });
        const t = textOf(panel(`worldOptions:${option.id}`, { choice: choice.id }, env(state)));
        expect(t, `${option.id}/${choice.id}`).not.toMatch(DIGITS);
        expect(t, `${option.id}/${choice.id}`).not.toMatch(PRONOUN);
      }
    }
    for (const level of reg.dispositionLevels.values()) {
      const t = textOf(panel(`dispositionLevels:${level.id}`, null, env(base)));
      expect(t, String(level.id)).not.toMatch(DIGITS);
      expect(t, String(level.id)).not.toMatch(PRONOUN);
    }
  });

  it('raw values give the numbers', () => {
    const s = worldOf({ oversight: 'brutal', offspec_stigma: 'scorned' });
    const o = panel('worldOptions:oversight', { choice: 'brutal' }, env(s, true)).reading!.lines.join('\n');
    expect(o).toContain('Leash authorizations per week: -1');
    expect(o).toContain('Termination approval: -15%');
    expect(o).toContain('Failed command mission losses: ×1.5');
    const p = panel('worldOptions:offspec_stigma', { choice: 'scorned' }, env(s, true)).reading!.lines.join('\n');
    expect(p).toContain('Mission rewards: -10%');
  });
});

describe('disposition readings', () => {
  const unitReading = (s: CampaignState, raw = false) => panel('glossary:disposition', { unitId: 'unit_ann' }, env(s, raw));

  it('disposition reading shows names, not numbers, without raw values', () => {
    const s = worldOf({ disposition: 'volatile' }, (st) => { st.squad[0].dispositionOffset = -1; st.squad[0].dispositionReason = 'Wants to be trusted.'; });
    const lines = unitReading(s).reading!.lines;
    expect(lines).toContain('World level: Volatile');
    expect(lines).toContain('Her level: Prickly');
    expect(lines).toContain('Offset: kinder than the world (Wants to be trusted.)');
    expect(lines.join('\n')).not.toMatch(DIGITS);
    const raw = unitReading(s, true).reading!.lines.join('\n');
    expect(raw).toContain('Offset: -1');
    expect(raw).toContain('Rank: 3 of 5');
  });

  it('a unit without an offset says she follows the world; a grunt follows it always', () => {
    const lines = unitReading(worldOf({ disposition: 'hazardous' })).reading!.lines;
    expect(lines).toContain('Her level: Hazardous');
    expect(lines).toContain('Offset: none, she follows the world');
    const g = worldOf({ disposition: 'kind' }, (st) => { st.squad[0].kind = 'grunt'; st.squad[0].dispositionOffset = 2; });
    expect(unitReading(g).reading!.lines).toContain('Her level: Kind');
  });

  it('the static panel is the glossary text and a unit-less reading names only the world level', () => {
    const m = panel('glossary:disposition', null, env(worldOf({ disposition: 'prickly' })));
    expect(m.text).toBe(String(reg.glossary.get('disposition')!.short));
    expect(m.reading!.lines).toEqual(['World level: Prickly']);
    expect(panel('glossary:disposition', null, env(null)).reading!.lines).toEqual(['No campaign loaded.']);
  });

  it('the stance readings stay with the glossary; world_stance and world_settings exist', () => {
    for (const id of ['disposition', 'disposition_offset', 'world_stance', 'world_settings']) expect(reg.glossary.has(id), id).toBe(true);
  });
});

describe('effect lines', () => {
  it('summarizeWorldOptionEffect: one line per effect type, words only', () => {
    const lines = [
      { type: 'disposition', levelId: 'hazardous' }, { type: 'leash_weekly', amount: 1 }, { type: 'terminate_approval', amount: -0.15 },
      { type: 'command_failure_mult', mult: 0.5 }, { type: 'mission_reward_pct', pct: -10 }, { type: 'expression_norm', norm: 5, standingPerStep: -2 },
      { type: 'expression_norm', norm: 1, standingPerStep: -2 }, { type: 'enable_family', family: 'purge_sweep' },
      { type: 'director_hint', text: 'Rare good news.' }, { type: 'scene_directive', text: 'Describe less.' }, { type: 'grunt_stances', shares: 1, indifferent: 1, opposes: 1 },
    ].map((fx) => summarizeWorldOptionEffect(fx as never, reg));
    expect(lines).toEqual([
      'Soldiers are Hazardous', 'More Leash authorizations each week', 'Termination requests are approved less often',
      'Failed command missions cost less standing', 'Missions pay less',
      'Command is expected to look masculine; a commander who presents differently starts with less standing at their own corporation',
      'Command is expected to look feminine; a commander who presents differently starts with less standing at their own corporation',
      'Adds the Purge sweep events to the world', 'Story tone: Rare good news.', 'The story model is told how this world feels',
      'Generated soldiers lean for or against the norm',
    ]);
    for (const l of lines) { expect(l).not.toMatch(DIGITS); expect(l).not.toMatch(PRONOUN); }
  });

  it('summarizeDispositionLevel reads the levels in words', () => {
    const lv = (id: string) => summarizeDispositionLevel(reg.dispositionLevels.get(id)!);
    expect(lv('kind')).toEqual(expect.arrayContaining(['Starts out trusting', 'Never mutinies', 'Under a breakdown she turns on herself']));
    expect(lv('hazardous')).toEqual(expect.arrayContaining([
      'Starts out hostile', 'Refuses orders and deserts more often', 'Loyalty breaks sooner and recovers later', 'Relationships move on more slowly',
      'Can mutiny from despises and resentful, after one clear warning', 'Under a breakdown she may turn on anyone', 'A big gesture counts for more',
    ]));
    expect(lv('guarded')).toEqual([]); // the baseline says nothing special
    for (const id of reg.dispositionLevels.keys()) for (const l of lv(id)) { expect(l).not.toMatch(DIGITS); expect(l).not.toMatch(PRONOUN); }
  });

  it('entryEffects reads worldOptions and dispositionLevels; a bad entry gives no lines', () => {
    expect(entryEffects('dispositionLevels', reg.dispositionLevels.get('volatile')!, reg).length).toBeGreaterThan(4);
    expect(entryEffects('worldOptions', reg.worldOptions.get('tone')!, reg).length).toBe(3);
    expect(entryEffects('worldOptions', { id: 'x' } as never, reg)).toEqual([]);
  });
});
