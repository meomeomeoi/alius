import { describe, it, expect } from 'vitest';
import { buildPanelModel, type AnalyzeEnv } from '../../src/analysis/model';
import { entryText, entryTitle, missingDescriptions, PLAYER_VISIBLE, settingGlossaryId } from '../../src/analysis/describe';
import { parseSubject } from '../../src/analysis/subject';
import { emptyRegistries, REGISTRY_NAMES, type Entry, type RegistryName } from '../../src/content/types';
import { DESCRIBED_REGISTRIES } from '../../src/content/schemas';
import { DEFAULT_SETTINGS } from '../../src/settings';

function registries(content: Partial<Record<RegistryName, Entry[]>>) {
  const reg = emptyRegistries();
  for (const [name, list] of Object.entries(content)) for (const e of list!) reg[name as RegistryName].set(e.id, e);
  return reg;
}

const env = (content: Partial<Record<RegistryName, Entry[]>>): AnalyzeEnv => ({
  registries: registries(content), state: null, settings: DEFAULT_SETTINGS,
});
const model = (address: string, e: AnalyzeEnv, ctx?: string) => buildPanelModel(parseSubject(address, ctx)!, e);

describe('panel model', () => {
  it('a glossary subject shows term, short and long', () => {
    const e = env({ glossary: [{ id: 'trust', term: 'Trust', short: 'Short [[stress]].', long: 'Long text.', see: ['stress'] }, { id: 'stress', term: 'Stress', short: 's' }] });
    expect(model('glossary:trust', e)).toEqual({
      address: 'glossary:trust', source: 'glossary', title: 'Trust', text: 'Short [[stress]].', long: 'Long text.',
      effects: [], see: ['stress'], reading: null, missing: false,
    });
    expect(model('glossary:stress', e).long).toBeNull();
    expect(model('glossary:stress', e).see).toEqual([]);
  });

  it('an item without description falls back to null text and is listed by missingDescriptions', () => {
    const e = env({ items: [{ id: 'item_a', name: 'Blade' }, { id: 'item_b', name: 'Axe', description: 'Chops.' }] });
    const m = model('items:item_a', e);
    expect(m).toMatchObject({ title: 'Blade', text: null, missing: false });
    expect(model('items:item_b', e).text).toBe('Chops.');
    expect(missingDescriptions(e.registries)).toEqual([{ registry: 'items', id: 'item_a' }]);
  });

  it('a defect falls back to upside / downside', () => {
    const e = env({ defects: [{ id: 'echo', name: 'Echo', upside: 'Sees far.', downside: 'Forgets.' }] });
    const text = model('defects:echo', e).text!;
    expect(text).toContain('Sees far.');
    expect(text).toContain('Forgets.');
    expect(missingDescriptions(e.registries)).toEqual([]);
  });

  it('description wins over summary, and summary over other fallbacks', () => {
    const reg = registries({
      roles: [{ id: 'r1', name: 'R1', summary: 'sum', description: 'desc' }, { id: 'r2', name: 'R2', summary: 'sum' }],
      signatures: [{ id: 'sig_x', name: 'X', mechanic: 'Does X.' }],
      clocks: [{ id: 'c1', label: 'Bloom' }],
    });
    expect(entryText('roles', reg.roles.get('r1')!)).toBe('desc');
    expect(entryText('roles', reg.roles.get('r2')!)).toBe('sum');
    expect(entryText('signatures', reg.signatures.get('sig_x')!)).toBe('Does X.');
    expect(entryTitle('clocks', reg.clocks.get('c1')!)).toBe('Bloom');
    expect(entryTitle('roles', reg.roles.get('r1')!)).toBe('R1');
    expect(entryTitle('items', { id: 'bare' })).toBe('bare');
  });

  it('a setting reads its setting_ glossary entry (snake_case id for a camelCase key)', () => {
    const e = env({ glossary: [{ id: 'setting_show_raw_values', term: 'Show raw values', short: 'Numbers instead of bands.' }] });
    const m = model('setting:showRawValues', e);
    expect(m).toMatchObject({ address: 'setting:showRawValues', source: 'setting', title: 'Show raw values', text: 'Numbers instead of bands.', missing: false });
    expect(model('setting:nothing', e).missing).toBe(true);
  });

  it('an unknown id builds a missing model', () => {
    const e = env({ items: [] });
    expect(model('items:gone', e)).toMatchObject({ missing: true, title: 'NO DATA', text: 'items:gone', effects: [], reading: null });
    expect(model('glossary:gone', e).missing).toBe(true);
  });

  it('an unknown source builds a missing model', () => {
    const e = env({});
    expect(model('bogus:thing', e)).toMatchObject({ missing: true, title: 'NO DATA', text: 'bogus:thing' });
    // prototype names are not registries
    expect(model('constructor:x', e).missing).toBe(true);
    expect(model('__proto__:x', e).missing).toBe(true);
  });

  it('settingGlossaryId turns a camelCase key into a lower-case content id', () => {
    expect(settingGlossaryId('showRawValues')).toBe('setting_show_raw_values');
    expect(settingGlossaryId('mechanicProfileId')).toBe('setting_mechanic_profile_id');
    expect(settingGlossaryId('difficulty')).toBe('setting_difficulty');
    expect(settingGlossaryId('palette')).toBe('setting_palette');
  });

  it('PLAYER_VISIBLE is the 68 described registries plus glossary (P15a adds twelve, less the hidden cues and verbs; the first 58 are 20, the P7 traits and tastes, the P8 world options, levels and presets, the P9 command stances, punishments, demand templates and reputations, the P10 hub rooms and device skins, the P9d content categories and rule templates, the P9b vote kinds and outside feats, the P9c device access rules, booking kinds, token kinds, wager games, wager stakes and secret kinds, the P10b DM behaviours, hand fonts, hand notes and sticker art, the P12 debt handlers, the P13 warden expectations and commander punishments, the P11b head start moments, the P14b development axes, rules and habits, the P10c quarters styles, the P10d plan rooms, the P14c life events, hobbies, opinion topics and pastimes) plus glossary', () => {
    expect([...PLAYER_VISIBLE]).toEqual([...DESCRIBED_REGISTRIES.filter((n) => n !== 'physicsCues' && n !== 'escalationVerbs' && n !== 'positionRegions' && n !== 'practiceSeeds'), 'glossary']);
    expect(PLAYER_VISIBLE).toHaveLength(83); // P16b: + craftLessons; P15a: + 12 registries, less the cues and the verbs; P15: + 11 registries, less the regions; P16: + 4 registries, less the seeds (examples for the model)
    for (const n of ['blockingContacts', 'momentSources', 'commanderConditions']) expect(PLAYER_VISIBLE).toContain(n);
    for (const n of ['physicsCues', 'escalationVerbs', 'positionRegions', 'practiceSeeds']) expect(PLAYER_VISIBLE).not.toContain(n);
    for (const n of ['holderPunishments', 'implements', 'ceremonySteps']) expect(PLAYER_VISIBLE).toContain(n);
    for (const n of ['lifeEvents', 'hobbies', 'opinionTopics', 'pastimes']) expect(PLAYER_VISIBLE).toContain(n);
    expect(PLAYER_VISIBLE).toContain('planRooms');
    expect(PLAYER_VISIBLE).toContain('quartersStyles');
    expect(PLAYER_VISIBLE).toContain('stickerArt');
    expect(PLAYER_VISIBLE).toContain('handNotes');
    expect(PLAYER_VISIBLE).toContain('handFonts');
    expect(PLAYER_VISIBLE).toContain('dmBehaviours');
    expect(PLAYER_VISIBLE).toContain('secretKinds');
    expect(PLAYER_VISIBLE).toContain('wagerGames');
    expect(PLAYER_VISIBLE).toContain('wagerStakes');
    expect(PLAYER_VISIBLE).toContain('tokenKinds');
    expect(PLAYER_VISIBLE).toContain('deviceAccessRules');
    expect(PLAYER_VISIBLE).toContain('bookingKinds');
    expect(PLAYER_VISIBLE).toContain('voteKinds');
    expect(PLAYER_VISIBLE).toContain('outsideFeats');
    expect(PLAYER_VISIBLE).toContain('contentCategories');
    expect(PLAYER_VISIBLE).toContain('relationshipRuleTemplates');
    expect(PLAYER_VISIBLE).toContain('hubRooms');
    expect(PLAYER_VISIBLE).toContain('deviceSkins');
    expect(PLAYER_VISIBLE).toContain('demandTemplates');
    expect(PLAYER_VISIBLE).toContain('reputations');
    expect(PLAYER_VISIBLE).toContain('commandStances');
    expect(PLAYER_VISIBLE).toContain('punishments');
    for (const n of PLAYER_VISIBLE) expect(REGISTRY_NAMES).toContain(n);
  });
});

describe('panel model readings', () => {
  it('a registered provider fills the reading, and only with a campaign', async () => {
    const { registerAnalyzeProvider } = await import('../../src/analysis/providers');
    const { createCampaign } = await import('../../src/engine/state/create');
    const e = env({ glossary: [{ id: 'trust', term: 'Trust', short: 's' }], items: [{ id: 'it', name: 'I' }] });
    const state = createCampaign({ seed: 1, commanderName: 'Vale' });
    const offs = [
      registerAnalyzeProvider('glossary:trust', (subject) => ({ lines: [`ctx ${String(subject.data.unitId)}`] })),
      registerAnalyzeProvider('items', () => ({ lines: ['an item reading'] })),
    ];
    try {
      expect(model('glossary:trust', e, '{"unitId":"u1"}').reading).toEqual({ lines: ['No campaign loaded.'] });
      const withState = { ...e, state };
      expect(model('glossary:trust', withState, '{"unitId":"u1"}').reading).toEqual({ lines: ['ctx u1'] });
      expect(model('items:it', withState).reading).toEqual({ lines: ['an item reading'] });
      expect(model('items:gone', withState).reading).toBeNull();
    } finally {
      offs.forEach((off) => off());
    }
  });
});
