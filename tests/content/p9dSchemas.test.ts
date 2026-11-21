import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import { REGISTRY_NAMES, type Registries } from '../../src/content/types';

const read = async (path: string) => JSON.parse(await readFile(path, 'utf8'));

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], read);
  expect(r.errors).toEqual([]);
  reg = r.registries;
});

/** The core pack plus an in-memory pack that overrides the named registries' entries. */
async function withPack(files: Record<string, unknown[]>, extra: Record<string, unknown[]> = {}) {
  const mem: Record<string, unknown> = {
    'mem/manifest.json': { id: 'mem', name: 'Mem', version: '1', priority: 5, files: Object.fromEntries(Object.keys(files).map((k) => [k, `${k}.json`])) },
    ...Object.fromEntries(Object.entries(files).map(([k, v]) => [`mem/${k}.json`, v])),
    ...extra,
  };
  return loadPacks(['content/core', 'mem'], async (p) => (p in mem ? mem[p] : read(p)));
}

describe('contentCategories registry', () => {
  it('is a registry name', () => {
    expect(REGISTRY_NAMES).toContain('contentCategories');
  });

  it('loads the nine P9d core categories first (P15a adds thirteen), with descriptions', () => {
    expect([...reg.contentCategories.keys()].slice(0, 9)).toEqual([
      'humiliation', 'public_humiliation', 'degrading_language', 'pain_rough', 'restraint',
      'physical_discipline_shown', 'jealousy_games', 'body_modification', 'explicit_scenes',
    ]);
    for (const c of reg.contentCategories.values()) {
      expect(String(c.label).length, String(c.id)).toBeGreaterThan(0);
      expect(String(c.label).length, String(c.id)).toBeLessThanOrEqual(40);
      expect(String(c.description).length, String(c.id)).toBeGreaterThan(0);
      expect(String(c.description).length, String(c.id)).toBeLessThanOrEqual(200);
      expect(typeof c.order).toBe('number');
    }
  });
});

describe('contentTags', () => {
  it('on a gated registry with a known category loads', async () => {
    const r = await withPack({ punishments: [{ id: 'tagged', extends: 'verbal', contentTags: ['humiliation'] }] });
    expect(r.errors).toEqual([]);
    expect(r.registries.punishments.get('tagged')!.contentTags).toEqual(['humiliation']);
  });

  it('contentTags with an unknown category is a load error', async () => {
    const r = await withPack({ punishments: [{ id: 'tagged', extends: 'verbal', contentTags: ['no_such_category'] }] });
    expect(r.errors.map((e) => e.message).join('\n')).toMatch(/unknown content category "no_such_category"/);
  });

  it('contentTags on a non-gated registry is a load error', async () => {
    const r = await withPack({ regions: [{ id: 'tagged_region', extends: 'quarantine_d7', contentTags: ['humiliation'] }] }, {});
    expect(r.errors.map((e) => e.message).join('\n')).toMatch(/contentTags is not allowed on regions/);
  });

  it('a night spec inside a defect may carry tags, an unknown one is an error', async () => {
    const spec = (tags: string[]) => ({ id: 'x', kind: 'visit', chance: 0.1, priority: 10, trigger: 'daily', framing: '{name} knocks.', ignore: { event: 'dismissed', severity: 'minor' }, contentTags: tags });
    const ok = await withPack({ defects: [{ id: 'echo_bleed', extends: 'echo_bleed', nightEvents: [spec(['restraint'])] }] });
    expect(ok.errors).toEqual([]);
    const bad = await withPack({ defects: [{ id: 'echo_bleed', extends: 'echo_bleed', nightEvents: [spec(['nope'])] }] });
    expect(bad.errors.map((e) => e.message).join('\n')).toMatch(/unknown content category "nope"/);
  });
});

describe('relationshipStates bondTier', () => {
  it('accepts only romantic|close', async () => {
    const ok = await withPack({ relationshipStates: [{ id: 'friend', extends: 'friend', bondTier: 'close' }] });
    expect(ok.errors).toEqual([]);
    const bad = await withPack({ relationshipStates: [{ id: 'friend', extends: 'friend', bondTier: 'intimate' }] });
    expect(bad.errors.length).toBeGreaterThan(0);
  });
});
