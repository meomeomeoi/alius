import { describe, it, expect } from 'vitest';
import { loadPacks } from '../../src/content/loader';
import { registrySchemas } from '../../src/content/schemas';
import { REGISTRY_NAMES } from '../../src/content/types';

const memFetch = (files: Record<string, unknown>) => async (path: string) => {
  if (!(path in files)) throw new Error(`404 ${path}`);
  return files[path];
};

/** One in-memory pack with the given registry files. */
const pack = (registries: Record<string, unknown[]>) => {
  const files: Record<string, unknown> = {
    'p/manifest.json': {
      id: 'p', name: 'P', version: '1', priority: 0,
      files: Object.fromEntries(Object.keys(registries).map((r) => [r, `${r}.json`])),
    },
  };
  for (const [r, list] of Object.entries(registries)) files[`p/${r}.json`] = list;
  return loadPacks(['p'], memFetch(files));
};

const gl = (id: string, extra: Record<string, unknown> = {}) => ({ id, term: id, short: 'short', ...extra });
const item = (extra: Record<string, unknown> = {}) => ({
  id: 'kit', name: 'Kit', slot: 'weapon', class: 'rifle', rarity: 'standard', baseStats: { atk: 1 }, effects: [], value: 1, ...extra,
});

describe('glossary schema', () => {
  it('glossary is a registry name', () => {
    expect(REGISTRY_NAMES).toContain('glossary');
  });

  it('short over 160 displayed chars is rejected, markup does not count', async () => {
    const over = 'x'.repeat(161);
    const bad = await pack({ glossary: [gl('over', { short: over })] });
    expect(bad.errors.some((e) => e.path === '[0].short' || e.path.includes('short'))).toBe(true);
    // 160 displayed chars, many more raw chars thanks to link markup
    const text = `${'[[trust|ab]]'.repeat(10)}${'y'.repeat(140)}`;
    expect(text.length).toBeGreaterThan(160);
    const ok = await pack({ glossary: [gl('trust'), gl('ok', { short: text })] });
    expect(ok.errors).toEqual([]);
  });

  it('long over 600 is rejected', async () => {
    const bad = await pack({ glossary: [gl('over', { long: 'x'.repeat(601) })] });
    expect(bad.errors.some((e) => e.path.includes('long'))).toBe(true);
    const ok = await pack({ glossary: [gl('fits', { long: 'x'.repeat(600) })] });
    expect(ok.errors).toEqual([]);
  });

  it('a see entry pointing at a missing glossary id is a broken reference', async () => {
    const r = await pack({ glossary: [gl('a', { see: ['nope'] })] });
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ file: 'glossary.json', path: '[0].see[0]' });
    expect(r.errors[0].message).toContain('unknown glossary id "nope"');
  });

  it('a link to items:nope in a description is a broken reference', async () => {
    const r = await pack({ locations: [{ id: 'mess', name: 'Mess', summary: 's', ascii: ['x'], description: 'Works like [[items:nope]].' }] });
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toContain('unknown items id "nope"');
    expect(r.errors[0].path).toContain('description');
  });

  it('links in glossary short and long are checked, bare targets resolve to glossary', async () => {
    const r = await pack({ glossary: [gl('a', { short: 'See [[b]].', long: 'And [[glossary:c]].' }), gl('b')] });
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toContain('unknown glossary id "c"');
  });

  it('a setting: link is not checked', async () => {
    const r = await pack({ glossary: [gl('a', { short: 'Change [[setting:whatever|it]].' })] });
    expect(r.errors).toEqual([]);
  });

  it('an unknown source is reported', async () => {
    const r = await pack({ glossary: [gl('a', { short: 'See [[bogus:x]].' })] });
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toContain('unknown source "bogus"');
  });

  it('description is optional on items and roles, and capped at 600 displayed chars', () => {
    expect(registrySchemas.items.safeParse(item()).success).toBe(true);
    expect(registrySchemas.items.safeParse(item({ description: 'A fine rifle.' })).success).toBe(true);
    expect(registrySchemas.items.safeParse(item({ description: 'x'.repeat(601) })).success).toBe(false);
    expect(registrySchemas.items.safeParse(item({ description: '' })).success).toBe(false);
    expect(registrySchemas.items.safeParse(item({ description: 42 })).success).toBe(false);
    expect(registrySchemas.roles.safeParse({ id: 'r', description: 'x'.repeat(601) }).success).toBe(false);
  });

  it('eventDeltas accept a cause up to 80 chars', () => {
    const row = { trust: 1 };
    const base = { id: 'sided_with', rows: { minor: row, moderate: row, major: row, extreme: row } };
    expect(registrySchemas.eventDeltas.safeParse({ ...base, cause: 'You sided with her.' }).success).toBe(true);
    expect(registrySchemas.eventDeltas.safeParse({ ...base, cause: 'x'.repeat(81) }).success).toBe(false);
    expect(registrySchemas.eventDeltas.safeParse(base).success).toBe(true);
  });
});
