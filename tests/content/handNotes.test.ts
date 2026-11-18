import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadPacks } from '../../src/content/loader';
import { DESCRIBED_REGISTRIES, HandNoteSchema } from '../../src/content/schemas';
import { REGISTRY_NAMES, type Registries } from '../../src/content/types';

let reg: Registries;
const read = async (p: string) => JSON.parse(await readFile(p, 'utf8'));
beforeAll(async () => {
  const r = await loadPacks(['content/core'], read);
  expect(r.errors).toEqual([]);
  reg = r.registries;
});
const note = (over: Record<string, unknown> = {}) => ({ id: 'x', name: 'X', description: 'D', where: 'quarters', text: 'Back soon. — {name}', chance: 0.5, ...over });

describe('registry handNotes (P10b)', () => {
  it('is a registry and a described one', () => {
    expect(REGISTRY_NAMES).toContain('handNotes');
    expect(DESCRIBED_REGISTRIES).toContain('handNotes');
  });

  it('carries the five core drafts: two quarters, one gear, two door notes', () => {
    const by = (where: string) => [...reg.handNotes.values()].filter((e) => e.where === where);
    expect(by('quarters')).toHaveLength(2);
    expect(by('gear')).toHaveLength(1);
    expect(by('door')).toHaveLength(2);
    for (const e of by('quarters')) expect(e.when).toMatchObject({ minAccess: 2 });
    expect((by('gear')[0].when as { tiers: string[] }).tiers).toEqual(['close', 'romantic']);
    for (const e of by('door')) expect((e.when as { trigger: string }).trigger).toBe('knock_unanswered');
    for (const e of reg.handNotes.values()) expect(String(e.text), String(e.id)).toContain('{name}');
  });
});

describe('HandNoteSchema', () => {
  it('accepts a plain entry and every condition', () => {
    expect(HandNoteSchema.safeParse(note()).success).toBe(true);
    expect(HandNoteSchema.safeParse(note({ when: { minAccess: 2, tiers: ['close'], wantBands: ['aching'], states: ['friend'] } })).success).toBe(true);
    expect(HandNoteSchema.safeParse(note({ where: 'door', when: { trigger: 'knock_unanswered' } })).success).toBe(true);
  });

  it('rejects an unknown place, a chance above 1, a long text and unknown fields', () => {
    expect(HandNoteSchema.safeParse(note({ where: 'ceiling' })).success).toBe(false);
    expect(HandNoteSchema.safeParse(note({ chance: 1.5 })).success).toBe(false);
    expect(HandNoteSchema.safeParse(note({ text: 'x'.repeat(201) })).success).toBe(false);
    expect(HandNoteSchema.safeParse(note({ when: { vibes: 1 } })).success).toBe(false);
    expect(HandNoteSchema.safeParse(note({ when: { minAccess: 5 } })).success).toBe(false);
    expect(HandNoteSchema.safeParse(note({ when: { tiers: ['friendly'] } })).success).toBe(false);
    expect(HandNoteSchema.safeParse({ ...note(), bogus: 1 }).success).toBe(false);
  });

  it('a door note must be triggered by an unanswered knock, and only a door note may be', () => {
    expect(HandNoteSchema.safeParse(note({ where: 'door' })).success).toBe(false);
    expect(HandNoteSchema.safeParse(note({ where: 'door', when: { trigger: 'daily' } })).success).toBe(false);
    expect(HandNoteSchema.safeParse(note({ where: 'gear', when: { trigger: 'knock_unanswered' } })).success).toBe(false);
  });

  it('every state in when.states exists (a reference check of the loader)', async () => {
    const bad = async (p: string) => {
      const data = await read(p);
      return p.endsWith('handNotes.json') ? [...data, note({ id: 'bad_state', when: { states: ['no_such_state'] } })] : data;
    };
    const r = await loadPacks(['content/core'], bad);
    expect(r.errors.map((e) => JSON.stringify(e)).join('\n')).toContain('no_such_state');
  });
});

describe('glossary of the notes', () => {
  it('hand_note exists', () => {
    expect(reg.glossary.has('hand_note')).toBe(true);
  });
});
