import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPacks } from '../../src/content/loader';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/dynamic';
import '../../src/engine/actions/squad';
import { RESYNC_SECTIONS } from '../../src/engine/actions/squad';
import { validatePractice } from '../../src/engine/dynamic/profile';
import type { Practice } from '../../src/engine/dynamic/types';
import { getCallType } from '../../src/llm/callTypes';
import '../../src/llm/calls/all';
import { ALL_SECTIONS, PRACTICE_SECTIONS, type ImportSection } from '../../src/llm/calls/profileImport';
import { llmLog } from '../../src/llm/log';
import { getSettings, type AliusSettings } from '../../src/settings';
import { buildImportInput, importProfile, resyncSectionsOffered, sanitizeProfile, type ImportOutcome, type ImportedProfile } from '../../src/setup/profile';
import { Wizard } from '../../src/setup/wizard';
import type { CardInfo } from '../../src/st/adapter';
import { FakeStAdapter } from '../../src/st/fake';
import { standaloneEnvelope } from '../helpers/envelopeHost';
import { campaign, errors, run } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
});
beforeEach(() => llmLog.clear());

const card = { name: 'Ann', description: 'A fierce soldier.', personality: 'Loyal.', scenario: 'At the base.', creatorNotes: 'Notes.', firstMessage: '' } as never;
const texts = (sections: readonly ImportSection[], content?: string[]) => {
  const ct = getCallType('profile_import')!;
  const input = buildImportInput(card, reg, { ...DEFAULT }, [...sections], {}, null, content);
  return { input, system: ct.system(input) as string, prompt: ct.prompt(input) as string };
};
const DEFAULT = getSettings(new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }));

describe('the import prompt (P15)', () => {
  it('no practice category: the sections are not offered and the prompt is byte-identical', () => {
    const fixture = readFileSync('tests/fixtures/profile_import/no_practice.txt', 'utf8');
    const out: string[] = [];
    for (const [label, sections, content] of [['all', ALL_SECTIONS, []], ['bond', ['bond'], undefined], ['defects', ['defects'], ['restraint']]] as const) {
      const { input, system, prompt } = texts(sections, content as string[] | undefined);
      if (label === 'all') {
        expect(input.practice).toBeUndefined();
        expect(input.expectations).toBeUndefined();
        for (const s of PRACTICE_SECTIONS) expect(input.sections).not.toContain(s);
      }
      out.push(`=== ${label} ===`, system, '---', prompt);
    }
    expect(out.join('\n')).toBe(fixture);
    // a category that no track names is not a practice category: the sections stay out
    expect(texts(ALL_SECTIONS, ['body_modification', 'explicit_scenes']).input.practice).toBeUndefined();
  });

  it('the prompt names only enabled categories', () => {
    const { input, system, prompt } = texts(PRACTICE_SECTIONS, ['restraint', 'service']);
    expect(input.practice).toEqual({ categories: ['service', 'restraint'] });
    for (const s of PRACTICE_SECTIONS) expect(input.sections).toContain(s);
    const all = `${system}\n${prompt}`;
    expect(prompt).toContain('PRACTICE CATEGORIES');
    expect(prompt).toMatch(/- service\b/);
    expect(prompt).toMatch(/- restraint\b/);
    expect(all).not.toContain('pain_rough');
    const listed = prompt.split('PRACTICE CATEGORIES (id):\n')[1].split('\n\n')[0].split('\n');
    expect(listed).toEqual(['- service', '- restraint']);
    expect(system).toContain('"practice"');
    expect(system).toContain('"expectations"');
    expect(`${system}\n${prompt}`).not.toMatch(/\b(he|him|his)\b/i);
  });

  it('P15b: the practice section asks for her manner, what draws her, her everyday face, the contrast and her quirks', () => {
    const { system } = texts(['practice'], ['restraint']);
    const shape = system.split('"practice": ')[1].split('\n')[0];
    for (const f of ['"manner"', '"drawnBy"', '"everyday"', '"contrast"', '"quirks"']) expect(shape).toContain(f);
    for (const a of ['intensity', 'warmth', 'order', 'voice', 'tempo', 'curiosity']) expect(shape).toContain(`"${a}"`);
    for (const d of ['pain', 'power', 'reaction', 'discipline', 'discovery']) expect(shape).toContain(d);
    for (const w of ['switch', 'during', 'after', 'address']) expect(shape).toContain(w);
    expect(system).not.toMatch(/\b(he|him|his)\b/i);
  });

  it('expectations list the allowed targets and sources only', () => {
    const off = texts(['expectations'], ['restraint']).input.expectations!;
    expect(off.sources.length).toBe(reg.momentSources.size - [...reg.momentSources.values()].filter((s) => Array.isArray(s.contentTags)).length);
    expect(off.targets).not.toContain('feet'); // `worship` is off
    const on = texts(['expectations'], ['restraint', 'worship']).input.expectations!;
    expect(on.targets).toContain('feet');
    expect(on.targets).not.toContain('genitalia'); // explicit_scenes is off
    expect(texts(['expectations'], ['restraint', 'worship', 'explicit_scenes']).input.expectations!.targets).toContain('genitalia');
    const { prompt } = texts(['expectations'], ['restraint', 'worship']);
    expect(prompt).toContain('WORSHIP TARGETS');
    expect(prompt).toContain('MOMENT SOURCES');
  });

  it('a one-section ask offers only that section, and the re-sync lists the two while a practice category is on', () => {
    expect(texts(['practice'], ['restraint']).input.expectations).toBeUndefined();
    expect(texts(['expectations'], ['restraint']).input.practice).toBeUndefined();
    expect(RESYNC_SECTIONS).toContain('practice');
    expect(RESYNC_SECTIONS).toContain('expectations');
    expect(resyncSectionsOffered(reg, {})).not.toContain('practice');
    expect(resyncSectionsOffered(reg, {}, [])).not.toContain('expectations');
    expect(resyncSectionsOffered(reg, {}, ['restraint'])).toEqual(expect.arrayContaining(['practice', 'expectations']));
  });
});

describe('sanitize (P15)', () => {
  const sanitize = (raw: unknown, sections: ImportSection[] = ['practice', 'expectations'], content = ['restraint', 'humiliation', 'worship']) =>
    sanitizeProfile(raw, { registries: reg, desireBondDefects: false, sections, content });

  it('the answer is sanitised: a hostile practice gives the validatePractice result, and the dropped ids are listed', () => {
    const rawPractice = {
      categories: { restraint: { as: 'loves', witness: 'drawn' }, nonsense: { as: 'craves', witness: 'drawn' }, humiliation: { as: 'enjoys', witness: 'dislikes' } },
      style: { primary: 'cold', secondary: 'cold' }, fairness: 7,
    };
    const { profile, dropped, missing } = sanitize({ practice: rawPractice });
    expect(profile.practice).toEqual(validatePractice(rawPractice, reg).practice);
    expect(dropped).toContain('practice:nonsense');
    expect(missing).toEqual(['expectations']); // nothing came for the other section: not critical, only missing
  });

  it('a clean answer imports both sections', () => {
    const { profile, dropped, missing } = sanitize({
      practice: { style: { primary: 'ritual', secondary: 'cold' }, inclination: 'eager', categories: { restraint: { as: 'craves', witness: 'indifferent' } } },
      expectations: { holdsUntil: 'limit', worship: { feet: { attitude: 'craves', meaning: 'reward' }, nonsense: { attitude: 'craves' } }, tells: { irritation: 'he sighs' } },
    });
    expect(profile.practice!.style).toEqual({ primary: 'ritual', secondary: 'cold' });
    expect(profile.expectations!.holdsUntil).toBe('limit');
    expect(Object.keys(profile.expectations!.worship!)).toEqual(['feet']);
    expect(profile.expectations!.tells).toBeUndefined(); // a pronoun for the commander
    expect(dropped).toContain('expectations:worship.nonsense');
    expect(missing).toEqual([]);
  });

  it('P15b: a recorded answer fills her manner through validatePractice', () => {
    const rawPractice = {
      style: { primary: 'regal' },
      manner: { intensity: 2, warmth: -1, order: 5, curiosity: 2 },
      drawnBy: ['discovery', 'greed', 'power'],
      everyday: 'A bit of a loner, but always helps; kind and odd.',
      contrast: 'high',
      quirks: [{ when: 'switch', text: 'She takes off her glasses.' }, { when: 'address', text: 'She calls him by rank.' }, { when: 'after', text: 'A cigarette, in silence.' }],
    };
    const { profile } = sanitize({ practice: rawPractice });
    expect(profile.practice).toEqual(validatePractice(rawPractice, reg).practice);
    expect(profile.practice).toMatchObject({
      manner: { intensity: 2, warmth: -1, order: 0, voice: 0, tempo: 0, curiosity: 2 },
      drawnBy: ['discovery', 'power'],
      everyday: 'A bit of a loner, but always helps; kind and odd.',
      contrast: 'high',
      quirks: [{ when: 'switch', text: 'She takes off her glasses.' }, { when: 'after', text: 'A cigarette, in silence.' }],
    });
  });

  it('an expectation target that is closed here is dropped, and neither section is ever critical', () => {
    const { profile, dropped } = sanitize({ expectations: { worship: { feet: { attitude: 'craves' } } } }, ['expectations'], ['restraint']);
    expect(profile.expectations).toBeUndefined();
    expect(dropped).toContain('expectations:worship.feet');
    for (const raw of [{}, 'nonsense', { practice: 5, expectations: [] }]) {
      const r = sanitize(raw);
      expect(r.missing.sort()).toEqual(['expectations', 'practice']);
    }
    // sections not asked for are not read
    expect(sanitize({ practice: { style: { primary: 'cold' } } }, ['role']).profile.practice).toBeUndefined();
  });
});

describe('the budget', () => {
  function world() {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    st.profiles = [{ id: 'mech', name: 'Mech', api: 'openrouter', model: 'm' }];
    const settings: AliusSettings = { ...getSettings(st), mechanicProfileId: 'mech', autoRetry: 0 };
    const c: CardInfo = JSON.parse(readFileSync('tests/fixtures/cards/detailed.json', 'utf8'));
    st.cards.set(c.avatar, c);
    return { st, avatar: c.avatar, deps: { st, settings, registries: reg, generations: standaloneEnvelope(st, reg, () => settings) } };
  }

  it('P15b: the practice extra is a setting (600 by default), and changing it changes the call', async () => {
    const a = world();
    expect(a.deps.settings.budgets.profile_import_practice).toBe(600);
    expect(a.deps.settings.budgets.profile_import_expectations).toBe(400);
    a.deps.settings.budgets = { ...a.deps.settings.budgets, profile_import_practice: 900, profile_import_expectations: 100 };
    a.st.profileReplies = ['{}'];
    await importProfile(a.avatar, ['practice', 'expectations'], { ...a.deps, content: ['restraint'] });
    expect(a.st.calls.find((c) => c.kind === 'profile')!.maxTokens).toBe(2800); // 1800 + 900 + 100
  });

  it('a call without the sections sends the budget it always did; with them it asks for 600 and 400 more', async () => {
    const a = world();
    a.st.profileReplies = ['{}'];
    await importProfile(a.avatar, [...ALL_SECTIONS], { ...a.deps, content: [] });
    const base = a.st.calls.find((c) => c.kind === 'profile')!.maxTokens;
    expect(a.deps.settings.budgets.profile_import).toBe(1800);
    expect(base).toBe(2000); // the call's floor: the budget it always sent

    const b = world();
    b.st.profileReplies = ['{}'];
    await importProfile(b.avatar, ['practice', 'expectations'], { ...b.deps, content: ['restraint'] });
    expect(b.st.calls.find((c) => c.kind === 'profile')!.maxTokens).toBe(2800); // 1800 + 600 + 400

    const c = world();
    c.st.profileReplies = ['{}'];
    await importProfile(c.avatar, ['practice'], { ...c.deps, content: ['restraint'] });
    expect(c.st.calls.find((x) => x.kind === 'profile')!.maxTokens).toBe(2400); // 1800 + 600
  });
});

describe('the wizard and the re-sync', () => {
  const PROFILE: ImportedProfile = {
    roleCandidates: [{ roleId: 'defender', reason: 'r1' }],
    signatureCandidates: [{ templateId: 'sig_last_stand', name: 'Litany', description: 'She reads names.' }],
    defectCandidates: [{ defectId: 'threat_saturation', origin: 'Three tours.' }],
    likes: ['tea'], dislikes: ['noise'], triggers: ['fire'],
    temperament: { talkativeness: 'silent', volatility: 'moody', humor: 'mocking' },
    notes: 'n',
  };
  let NEWPRACTICE: Practice;
  beforeAll(() => { NEWPRACTICE = validatePractice({ style: { primary: 'drill' }, inclination: 'curious', categories: { restraint: { as: 'enjoys', witness: 'drawn' } } }, reg).practice!; });

  it('regenerate one section: applySection practice changes practice only', async () => {
    const pending: Array<(o: ImportOutcome) => void> = [];
    const importer = vi.fn(() => new Promise<ImportOutcome>((r) => pending.push(r)));
    const w = new Wizard({ registries: reg, desireBondDefects: false, importer, onChange: () => {} }, { personaName: 'Vale', canBindCurrent: false });
    w.setMode('veteran');
    w.toggleUnit({ avatar: 'ann.png', name: 'Ann' });
    w.calibrate(0);
    pending[0]({ kind: 'ok', profile: PROFILE, dropped: [], missing: [] });
    await new Promise((r) => setTimeout(r, 0));
    const before = structuredClone(w.state.units[0]);
    expect(before.status).toBe('ready');
    expect(before.choice.temperament).toEqual(PROFILE.temperament);

    w.regenerate(0, 'practice');
    pending[1]({ kind: 'ok', profile: { roleCandidates: [], signatureCandidates: [], defectCandidates: [], notes: '', practice: NEWPRACTICE }, dropped: [], missing: [] });
    await new Promise((r) => setTimeout(r, 0));
    const after = w.state.units[0];
    expect(after.candidates!.practice).toEqual(NEWPRACTICE);
    expect(after.choice.bond?.practice).toEqual(NEWPRACTICE);
    expect(after.candidates!.likes).toEqual(['tea']);
    expect(after.candidates!.temperament).toEqual(PROFILE.temperament);
    expect(after.choice.likes).toEqual(before.choice.likes);
    expect(after.choice.temperament).toEqual(before.choice.temperament);
    expect(after.choice.roleId).toBe(before.choice.roleId);
    expect(after.candidates!.roleCandidates).toEqual(before.candidates!.roleCandidates);

    // and a section the code had no branch for no longer wipes the tags
    w.regenerate(0, 'temperament');
    pending[2]({ kind: 'ok', profile: { roleCandidates: [], signatureCandidates: [], defectCandidates: [], notes: '', temperament: { talkativeness: 'talkative', volatility: 'steady', humor: 'warm' } }, dropped: [], missing: [] });
    await new Promise((r) => setTimeout(r, 0));
    expect(w.state.units[0].candidates!.likes).toEqual(['tea']);
    expect(w.state.units[0].candidates!.temperament).toEqual({ talkativeness: 'talkative', volatility: 'steady', humor: 'warm' });
    expect(w.state.units[0].choice.practiceLocks).toBeUndefined();
  });

  it('regenerating the bond keeps the practice she already has in the choice', async () => {
    const pending: Array<(o: ImportOutcome) => void> = [];
    const importer = vi.fn(() => new Promise<ImportOutcome>((r) => pending.push(r)));
    const w = new Wizard({ registries: reg, desireBondDefects: false, importer, onChange: () => {} }, { personaName: 'Vale', canBindCurrent: false });
    w.setMode('veteran');
    w.toggleUnit({ avatar: 'ann.png', name: 'Ann' });
    w.calibrate(0);
    pending[0]({ kind: 'ok', profile: { ...PROFILE, practice: NEWPRACTICE }, dropped: [], missing: [] });
    await new Promise((r) => setTimeout(r, 0));
    expect(w.state.units[0].choice.bond?.practice).toEqual(NEWPRACTICE);
    w.regenerate(0, 'bond');
    pending[1]({ kind: 'ok', profile: { roleCandidates: [], signatureCandidates: [], defectCandidates: [], notes: '', bond: { leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known' } }, dropped: [], missing: [] });
    await new Promise((r) => setTimeout(r, 0));
    expect(w.state.units[0].choice.bond).toMatchObject({ leadStyle: 'dominant', practice: NEWPRACTICE });
  });

  describe('squad/resync', () => {
    const resync = (s: ReturnType<typeof campaign>, patch: unknown) => run(s, reg, { type: 'squad/resync', payload: { unitId: 'unit_ann', patch } });
    const withOld = () => {
      const s = campaign(reg, 2);
      s.content = { enabled: ['restraint', 'humiliation', 'worship'] };
      const u = s.squad.find((x) => x.id === 'unit_ann')!;
      u.bond = { leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
        practice: validatePractice({ style: { primary: 'cold', secondary: 'playful' }, drive: 'high', categories: { restraint: { as: 'craves', witness: 'drawn' }, humiliation: { as: 'enjoys', witness: 'dislikes' } } }, reg).practice! };
      return { s, u };
    };

    it('re-sync keeps locked fields', () => {
      const { s, u } = withOld();
      u.practiceLocks = ['style', 'categories.restraint'];
      const r = resync(s, { practice: NEWPRACTICE });
      expect(errors(r.events)).toEqual([]);
      const p = r.state.squad.find((x) => x.id === 'unit_ann')!.bond!.practice!;
      expect(p.style).toEqual({ primary: 'cold', secondary: 'playful' }); // locked: the old style stays
      expect(p.categories.restraint).toEqual({ as: 'craves', witness: 'drawn' }); // locked
      expect(p.inclination).toBe('curious'); // not locked: the new value
      expect(p.drive).toBe('moderate');
      expect(p.categories.humiliation).toBeUndefined(); // the import has no such category and it is not locked
    });

    it('P15b: a locked manner, drawnBy, everyday or quirks is not re-imported', () => {
      const { s, u } = withOld();
      u.bond!.practice!.manner = { intensity: 1, warmth: 1, order: 0, voice: 0, tempo: 0, curiosity: 0 };
      u.bond!.practice!.quirks = [{ when: 'after', text: 'Tea, in silence.' }];
      u.practiceLocks = ['manner', 'quirks', 'everyday'];
      const next = validatePractice({ style: { primary: 'drill' }, manner: { intensity: -2 }, drawnBy: ['pain'], everyday: 'Loud.', quirks: [{ when: 'switch', text: 'She locks the door.' }] }, reg).practice!;
      const r = resync(s, { practice: next });
      expect(errors(r.events)).toEqual([]);
      const p = r.state.squad.find((x) => x.id === 'unit_ann')!.bond!.practice!;
      expect(p.manner).toEqual({ intensity: 1, warmth: 1, order: 0, voice: 0, tempo: 0, curiosity: 0 });
      expect(p.quirks).toEqual([{ when: 'after', text: 'Tea, in silence.' }]);
      expect(p.everyday).toBeUndefined(); // locked, and she never had one
      expect(p.drawnBy).toEqual(['pain']); // not locked
    });

    it('an unlocked practice is replaced whole, and a bond re-sync alone keeps the practice', () => {
      const { s } = withOld();
      const r = resync(s, { practice: NEWPRACTICE });
      expect(r.state.squad.find((x) => x.id === 'unit_ann')!.bond!.practice).toEqual(NEWPRACTICE);
      const b = resync(s, { bond: { leadStyle: 'yielding', attachment: 'slow', desire: 'high', caretaker: true, ownLimits: { categories: [] }, publicity: 'secret' } });
      expect(errors(b.events)).toEqual([]);
      const bond = b.state.squad.find((x) => x.id === 'unit_ann')!.bond!;
      expect(bond.leadStyle).toBe('yielding');
      expect(bond.practice).toEqual(s.squad.find((x) => x.id === 'unit_ann')!.bond!.practice);
    });

    it('expectations replace, and locked fields and entries are kept', () => {
      const { s, u } = withOld();
      u.expectations = { holdsUntil: 'signal', worship: { feet: { attitude: 'craves' }, toes: { attitude: 'enjoys' } }, tells: { pleasure: 'a slow smile' } };
      u.expectationLocks = ['holdsUntil', 'worship.feet'];
      const r = resync(s, { expectations: { holdsUntil: 'limit', worship: { feet: { attitude: 'dislikes' }, hair: { attitude: 'enjoys' } }, offset: { r: 0.1, f: 0 } } });
      expect(errors(r.events)).toEqual([]);
      const e = r.state.squad.find((x) => x.id === 'unit_ann')!.expectations!;
      expect(e.holdsUntil).toBe('signal'); // locked field
      expect(e.worship).toEqual({ feet: { attitude: 'craves' }, hair: { attitude: 'enjoys' } }); // feet is locked; toes is not in the import, so it goes
      expect(e.offset).toEqual({ r: 0.1, f: 0 });
      expect(e.tells).toBeUndefined();
    });

    it('a bad practice is refused and the unit is untouched', () => {
      const { s } = withOld();
      const r = resync(s, { practice: { style: { primary: 'shouting' }, categories: {} } });
      expect(errors(r.events)).toHaveLength(1);
      expect(r.state).toEqual(s);
    });
  });
});
