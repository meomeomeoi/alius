import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Entry, Registries } from '../../src/content/types';
import { makeNamedUnit, validateSetup, validateUnitProfile, type UnitSetup } from '../../src/engine/setup';
import { getCallType } from '../../src/llm/callTypes';
import '../../src/llm/calls/all';
import { ALL_SECTIONS, type ImportSection } from '../../src/llm/calls/profileImport';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { buildImportInput, resyncSectionsOffered, sanitizeProfile, type ImportedProfile, type ImportOutcome } from '../../src/setup/profile';
import { Wizard } from '../../src/setup/wizard';
import { loadCore, unitSetup } from '../helpers/world';

let reg: Registries;
let hobbyIds: string[];
beforeAll(async () => { reg = await loadCore(); hobbyIds = [...reg.hobbies.keys()]; });

const card = { name: 'Ann', description: 'A fierce soldier.', personality: 'Loyal.', scenario: 'At the base.', creatorNotes: 'Notes.', firstMessage: '' } as never;
const OLD: ImportSection[] = ['role', 'values', 'tags', 'signature', 'defects', 'baseline', 'tastes', 'disposition', 'stances', 'bond', 'development'];
const NEW: ImportSection[] = ['temperament', 'hobbies', 'opinions'];
const texts = (sections: ImportSection[]) => {
  const ct = getCallType('profile_import')!;
  const input = buildImportInput(card, reg, { ...DEFAULT_SETTINGS }, sections, {}, null);
  return { input, system: ct.system(input) as string, prompt: ct.prompt(input) as string };
};
const sanitize = (raw: unknown, sections: ImportSection[] = NEW) => sanitizeProfile(raw, { registries: reg, desireBondDefects: false, sections });

const topics = () => [...reg.opinionTopics.values()];
const posIds = (t: Entry) => (t.positions as Array<{ id: string }>).map((p) => p.id);
const opinion = (n: number, text = 'She has a view.') => { const t = topics()[n]; return { topic: t.id, position: posIds(t)[0], text }; };

describe('the import prompt (P14c)', () => {
  it('is byte-identical to today when the new sections are not asked for', () => {
    const fixture = readFileSync('tests/fixtures/profile_import/prompt_without_life.txt', 'utf8');
    const out: string[] = [];
    for (const sections of [OLD, ['values', 'tags'], ['defects']] as ImportSection[][]) {
      const { system, prompt } = texts(sections);
      out.push(`=== ${sections.join(',')} ===`, system, '---', prompt);
    }
    expect(out.join('\n')).toBe(fixture);
  });

  it('lists hobbies and topics only when asked', () => {
    for (const s of NEW) {
      const { input, system, prompt } = texts([s]);
      const all = `${system}\n${prompt}`;
      expect(all.includes('HOBBIES')).toBe(s === 'hobbies');
      expect(all.includes('OPINION TOPICS')).toBe(s === 'opinions');
      expect(input.hobbies !== undefined).toBe(s === 'hobbies');
      expect(input.topics !== undefined).toBe(s === 'opinions');
    }
    const { input, system, prompt } = texts(NEW);
    expect(input.hobbies).toHaveLength(reg.hobbies.size);
    expect(input.hobbies![0]).toEqual({ id: hobbyIds[0], description: expect.any(String) });
    expect(input.topics).toHaveLength(reg.opinionTopics.size);
    expect(input.topics![0]).toEqual({ id: topics()[0].id, positions: posIds(topics()[0]) });
    expect(system).toContain('"temperament"');
    expect(system).toContain('"aptitudes"');
    expect(system).toContain('"opinions"');
    expect(prompt).toContain(`- ${hobbyIds[0]}:`);
    expect(prompt).toContain(`- ${topics()[0].id}: ${posIds(topics()[0]).join(', ')}`);
    expect(`${system}\n${prompt}`).not.toMatch(/\b(he|him|his)\b/i);
  });

  it('a full import asks for the new sections and the default budget makes room for them', () => {
    for (const s of NEW) expect(ALL_SECTIONS).toContain(s);
    expect(DEFAULT_SETTINGS.budgets.profile_import).toBe(1800);
  });
});

describe('sanitize (P14c)', () => {
  it('a valid answer imports: temperament, 2 hobbies, 3 high and 2 low aptitudes, 9 strong-to-be opinions', () => {
    const [h0, h1, h2, h3, h4, h5, h6] = hobbyIds;
    const raw = {
      temperament: { talkativeness: 'silent', volatility: 'moody', humor: 'mocking' },
      hobbies: [h0, h1],
      aptitudes: { high: [h0, h2, h3], low: [h4, h5] },
      opinions: Array.from({ length: 9 }, (_, i) => opinion(i)),
    };
    const { profile, dropped, missing } = sanitize(raw);
    expect(dropped).toEqual([]);
    expect(missing).toEqual([]);
    expect(profile.temperament).toEqual({ talkativeness: 'silent', volatility: 'moody', humor: 'mocking' });
    expect(profile.hobbies).toEqual([h0, h1]);
    expect(profile.aptitudes).toEqual({ high: [h0, h2, h3], low: [h4, h5] });
    expect(Object.keys(profile.opinions!)).toHaveLength(9);
    expect(profile.opinions![topics()[0].id]).toEqual({ position: posIds(topics()[0])[0], text: 'She has a view.' });
    expect(h6).toBeDefined();
  });

  it('drops an unknown hobby, a fourth hobby, an overlapping or a fourth aptitude, a bad topic, a bad position, a 13th opinion and a bad temperament word', () => {
    const [h0, h1, h2, h3, h4, h5] = hobbyIds;
    const long = 'x'.repeat(300);
    const raw = {
      temperament: { talkativeness: 'chatty', volatility: 'moody', humor: 'warm' },
      hobbies: [h0, 'basket_weaving', h1, h2, h3],
      aptitudes: { high: [h0, h1, h2, h3], low: [h2, h4, h5] },
      opinions: [
        { topic: 'no_such_topic', position: 'x', text: 'a' },
        { topic: topics()[0].id, position: 'no_such_position', text: 'a' },
        opinion(1, long),
        ...Array.from({ length: 12 }, (_, i) => opinion(i + 2)),
      ],
    };
    const { profile, dropped, missing } = sanitize(raw);
    expect(profile.temperament).toEqual({ talkativeness: 'terse', volatility: 'moody', humor: 'warm' });
    expect(profile.hobbies).toEqual([h0, h1, h2]);
    expect(profile.aptitudes!.high).toEqual([h0, h1]); // the fourth high (h3) is cut; h2 sits in both lists, so it is in neither
    expect(profile.aptitudes!.low).toEqual([h4, h5]);
    expect(profile.aptitudes!.low).not.toContain(h2);
    expect(profile.aptitudes!.high).not.toContain(h2);
    expect(Object.keys(profile.opinions!)).toHaveLength(12);
    expect(profile.opinions![topics()[1].id].text).toHaveLength(200);
    expect(profile.opinions).not.toHaveProperty('no_such_topic');
    expect(profile.opinions![topics()[0].id]).toBeUndefined();
    expect(dropped).toEqual(expect.arrayContaining(['hobbies:basket_weaving', `hobbies:${h3}`, `aptitudes:${h3}`, `aptitudes:${h2}`, 'temperament:talkativeness', 'opinions:no_such_topic', `opinions:${topics()[0].id}`]));
    expect(missing).toEqual([]); // optional by nature: nothing is ever reported missing
  });

  it('an answer with none of it is no answer, and never missing', () => {
    for (const raw of [{}, 'nonsense', { temperament: 'warm', hobbies: 'reading', aptitudes: [], opinions: {} }]) {
      const { profile, missing } = sanitize(raw);
      expect(missing).toEqual([]);
      expect(profile.temperament).toBeUndefined();
      expect(profile.hobbies ?? []).toEqual([]);
      expect(profile.aptitudes).toBeUndefined();
      expect(profile.opinions ?? {}).toEqual({});
    }
  });

  it('aptitudes need two in each list: fewer is dropped whole; a second opinion on one topic is dropped', () => {
    const [h0, h1, h2, h3] = hobbyIds;
    expect(sanitize({ aptitudes: { high: [h0], low: [h1, h2] } }).profile.aptitudes).toBeUndefined();
    expect(sanitize({ aptitudes: { high: [h0, h1], low: [h2, h3] } }).profile.aptitudes).toEqual({ high: [h0, h1], low: [h2, h3] });
    const t = topics()[0];
    const { profile, dropped } = sanitize({ opinions: [{ topic: t.id, position: posIds(t)[0], text: 'one' }, { topic: t.id, position: posIds(t)[1], text: 'two' }] });
    expect(profile.opinions![t.id].text).toBe('one');
    expect(dropped).toContain(`opinions:${t.id}`);
  });

  it('sections not asked for are not read', () => {
    const { profile } = sanitize({ temperament: { humor: 'warm' }, hobbies: [hobbyIds[0]] }, ['values']);
    expect(profile.temperament).toBeUndefined();
    expect(profile.hobbies).toBeUndefined();
  });
});

describe('setup (P14c)', () => {
  const base = (): UnitSetup => unitSetup('Ann');
  const errs = (extra: object) => validateSetup({ commanderName: 'Vale', startId: 'start_vesper', crimeId: 'liquidation', units: [{ ...base(), ...extra } as never] }, reg, { desireBondDefects: false });
  const t0 = () => topics()[0];

  it('validates hobbies, aptitudes and opinions', () => {
    const [h0, h1, h2, h3, h4] = hobbyIds;
    expect(errs({ hobbies: [h0, h1, h2], aptitudes: { high: [h0, h3], low: [h4] }, opinions: { [t0().id]: { position: posIds(t0())[0], text: 'x' } } })).toEqual([]);
    expect(errs({ hobbies: [h0, h1, h2, h3] })).toHaveLength(1);
    expect(errs({ hobbies: ['basket_weaving'] })).toHaveLength(1);
    expect(errs({ hobbies: [h0, h0] })).toHaveLength(1);
    expect(errs({ aptitudes: { high: [h0], low: [h0] } })).toHaveLength(1);
    expect(errs({ aptitudes: { high: [h0, h1, h2, h3], low: [] } })).toHaveLength(1);
    expect(errs({ aptitudes: { high: ['nope'], low: [] } })).toHaveLength(1);
    expect(errs({ opinions: { nope: { position: 'x' } } })).toHaveLength(1);
    expect(errs({ opinions: { [t0().id]: { position: 'nope' } } })).toHaveLength(1);
    expect(errs({ opinions: { [t0().id]: { position: posIds(t0())[0], text: 'x'.repeat(201) } } })).toHaveLength(1);
    const many = Object.fromEntries(topics().slice(0, 13).map((t) => [t.id, { position: posIds(t)[0] }]));
    expect(errs({ opinions: many })).toHaveLength(1);
    expect(validateUnitProfile({ ...base(), hobbies: [h0] } as never, 'Ann', reg, { desireBondDefects: false })).toEqual([]);
  });

  it('makeNamedUnit writes them only when present: hobbies at skill 0, opinions strong', () => {
    const [h0, h1, h2] = hobbyIds;
    const plain = makeNamedUnit(base(), reg, new Set());
    for (const k of ['hobbies', 'aptitudes', 'opinions']) expect(k in plain).toBe(false);
    const u = makeNamedUnit({ ...base(), hobbies: [h0, h1], aptitudes: { high: [h0], low: [h2] }, opinions: { [t0().id]: { position: posIds(t0())[1], text: 'x' } } }, reg, new Set());
    expect(u.hobbies).toEqual([
      { id: h0, skill: 0, interest: 50, state: 'active', since: 1, milestones: [] },
      { id: h1, skill: 0, interest: 50, state: 'active', since: 1, milestones: [] },
    ]);
    expect(u.aptitudes).toEqual({ high: [h0], low: [h2] });
    expect(u.opinions).toEqual({ [t0().id]: { position: posIds(t0())[1], strength: 'strong', text: 'x', formedDay: 1 } });
    expect('hobbies' in makeNamedUnit({ ...base(), hobbies: [] }, reg, new Set())).toBe(false);
  });
});

describe('the wizard (P14c)', () => {
  const profile = (): ImportedProfile => ({
    roleCandidates: [{ roleId: 'defender', reason: 'r' }],
    signatureCandidates: [{ templateId: 'sig_last_stand', name: 'Litany', description: 'She reads names.' }],
    defectCandidates: [{ defectId: 'threat_saturation', origin: 'Three tours.' }],
    notes: '',
    temperament: { talkativeness: 'silent', volatility: 'moody', humor: 'none' },
    hobbies: [hobbyIds[0]],
    aptitudes: { high: [hobbyIds[1], hobbyIds[2]], low: [hobbyIds[3], hobbyIds[4]] },
    opinions: { [topics()[0].id]: { position: posIds(topics()[0])[0], text: 'x' } },
  });
  const make = () => {
    const importer = vi.fn(async (_a: string, _s: ImportSection[]): Promise<ImportOutcome> => ({ kind: 'ok', profile: structuredClone(profile()), dropped: [], missing: [] }));
    const w = new Wizard({ registries: reg, desireBondDefects: false, importer, onChange: () => {} }, { personaName: 'Vale', canBindCurrent: false });
    w.toggleUnit({ avatar: 'ann.png', name: 'Ann' });
    return { w, importer };
  };
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('a full import copies the three sections into the choice, and build carries them', async () => {
    const { w, importer } = make();
    w.calibrate(0);
    await flush();
    expect(importer.mock.calls[0][1]).toEqual([...ALL_SECTIONS]);
    const c = w.state.units[0].choice;
    expect(c.temperament).toEqual(profile().temperament);
    expect(c.hobbies).toEqual(profile().hobbies);
    expect(c.aptitudes).toEqual(profile().aptitudes);
    expect(c.opinions).toEqual(profile().opinions);
    expect(w.state.units[0].candidates!.hobbies).toEqual(profile().hobbies);
  });

  it('regenerating one section replaces only it', async () => {
    const { w } = make();
    w.calibrate(0);
    await flush();
    w.update(0, { temperament: { talkativeness: 'talkative', volatility: 'steady', humor: 'warm' } });
    w.regenerate(0, 'hobbies');
    await flush();
    const c = w.state.units[0].choice;
    expect(c.temperament).toEqual({ talkativeness: 'talkative', volatility: 'steady', humor: 'warm' });
    expect(c.hobbies).toEqual(profile().hobbies);
  });
});

describe('the re-sync sections offered (P14c)', () => {
  it('include temperament, hobbies and opinions', () => {
    const offered = resyncSectionsOffered(reg, {});
    for (const s of ['temperament', 'hobbies', 'opinions']) expect(offered).toContain(s);
  });
});
