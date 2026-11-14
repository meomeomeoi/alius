import { describe, expect, it } from 'vitest';
import { loadPacks } from '../../src/content/loader';

/** A fixture pack: a manifest and nothing else (no registries), served from memory. */
async function load(manifest: Record<string, unknown>, root = 'mem') {
  return loadPacks([root], async (p) => {
    if (p === `${root}/manifest.json`) return { id: 'mem', name: 'Mem', version: '1', priority: 0, files: {}, ...manifest };
    throw new Error(`404 ${p}`);
  });
}

describe('pack art declared in the manifest', () => {
  it('a pack without art declares none', async () => {
    const r = await load({});
    expect(r.errors).toEqual([]);
    expect(r.art).toEqual({ hub: [] });
  });

  it('hub art is listed with the pack root in front, so the UI never has to guess where it is', async () => {
    const r = await load({ art: { hub: ['art/hub/base.png', 'art/hub/base_night.png'] } }, 'content/core');
    expect(r.errors).toEqual([]);
    expect(r.art.hub).toEqual(['content/core/art/hub/base.png', 'content/core/art/hub/base_night.png']);
  });

  it('a malformed art block is a manifest error, not a crash', async () => {
    const r = await load({ art: { hub: 'base.png' } });
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0].file).toBe('manifest.json');
    expect(r.art.hub).toEqual([]);
  });

  it('only png files, under the pack, are accepted (no remote url, no parent path)', async () => {
    for (const bad of ['https://example.com/x.png', '//cdn.example.com/x.png', '../x.png', 'art/hub/base.gif', 'art/../../x.png']) {
      const r = await load({ art: { hub: [bad] } });
      expect(r.errors.length, bad).toBeGreaterThan(0);
    }
  });

  it('packs add up: a later pack\'s file of the same name replaces the earlier one', async () => {
    const files: Record<string, unknown> = {
      'a/manifest.json': { id: 'a', name: 'A', version: '1', priority: 0, files: {}, art: { hub: ['art/hub/base.png', 'art/hub/base_night.png'] } },
      'b/manifest.json': { id: 'b', name: 'B', version: '1', priority: 5, files: {}, art: { hub: ['art/hub/base.png'] } },
    };
    const r = await loadPacks(['a', 'b'], async (p) => {
      if (p in files) return files[p];
      throw new Error(`404 ${p}`);
    });
    expect(r.art.hub.sort()).toEqual(['a/art/hub/base_night.png', 'b/art/hub/base.png']);
  });
});
