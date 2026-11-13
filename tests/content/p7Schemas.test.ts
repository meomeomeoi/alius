import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import { PresenceSchema, TasteSchema } from '../../src/content/schemas';
import { REGISTRY_NAMES, type Registries } from '../../src/content/types';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
});

const taste = (over: Record<string, unknown> = {}) => ({ id: 't', name: 'T', description: 'D', ...over });

describe('P7 registries', () => {
  it('are registered', () => {
    for (const n of ['commanderTraits', 'tastes', 'presence', 'imageConsistency']) expect(REGISTRY_NAMES).toContain(n);
  });

  it('the core pack carries the nine tastes of the spec', () => {
    expect([...reg.tastes.keys()].sort()).toEqual([
      'drawn_to_androgynous', 'drawn_to_feminine', 'drawn_to_masculine', 'drawn_to_older', 'drawn_to_younger',
      'indifferent_to_looks', 'protective_of_frail', 'respects_strength', 'wary_of_brutes',
    ]);
  });

  it('the presence table covers every archetype, seasoning and authority key', () => {
    const keys = (factor: string) => [...reg.presence.values()].filter((p) => p.factor === factor).map((p) => String(p.key)).sort();
    expect(keys('archetype')).toEqual(['average', 'fit', 'frail', 'hardened', 'slight']);
    expect(keys('seasoning')).toEqual(['1', '2', '3', '4', '5']);
    expect(keys('authority')).toEqual(['1', '2', '3', '4', '5']);
    const v = (id: string) => reg.presence.get(id)!.presence;
    expect([v('archetype_frail'), v('archetype_hardened'), v('seasoning_1'), v('seasoning_5'), v('authority_1'), v('authority_5')]).toEqual([-6, 6, -4, 4, -2, 5]);
  });
});

describe('TasteSchema', () => {
  it('accepts an entry with no match keys (always matches)', () => {
    expect(TasteSchema.safeParse(taste({ presenceMult: 0 })).success).toBe(true);
  });

  it('a taste with expression [4, 2] is rejected', () => {
    expect(TasteSchema.safeParse(taste({ match: { expression: [4, 2] } })).success).toBe(false);
    expect(TasteSchema.safeParse(taste({ match: { expression: [2, 4] } })).success).toBe(true);
  });

  it('ranges outside 1–5, unknown archetypes and offsets beyond ±20 are rejected', () => {
    expect(TasteSchema.safeParse(taste({ match: { seasoning: [0, 3] } })).success).toBe(false);
    expect(TasteSchema.safeParse(taste({ match: { archetypes: ['giant'] } })).success).toBe(false);
    expect(TasteSchema.safeParse(taste({ offsets: { trust: 21 } })).success).toBe(false);
    expect(TasteSchema.safeParse(taste({ presenceMult: 2.5 })).success).toBe(false);
    expect(TasteSchema.safeParse(taste({ imageMult: -1 })).success).toBe(false);
  });
});

describe('PresenceSchema', () => {
  it('limits a row to ±15 and a known factor', () => {
    expect(PresenceSchema.safeParse({ id: 'p', factor: 'archetype', key: 'frail', presence: -15 }).success).toBe(true);
    expect(PresenceSchema.safeParse({ id: 'p', factor: 'archetype', key: 'frail', presence: 16 }).success).toBe(false);
    expect(PresenceSchema.safeParse({ id: 'p', factor: 'height', key: '1', presence: 1 }).success).toBe(false);
  });
});
