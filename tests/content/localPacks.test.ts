import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { loadPacks } from '../../src/content/loader';

const read = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const LOCAL = 'content/local';

/** The core pack from disk plus an in-memory `content/local` (absent when `files` is null: a 404, as a missing folder is on the server). */
function fetcher(files: Record<string, unknown> | null) {
  return async (path: string) => {
    if (!path.startsWith(`${LOCAL}/`)) return read(path);
    if (files === null || !(path in files)) throw new Error(`HTTP 404 for ${path}`);
    return files[path];
  };
}
const manifest = (files: Record<string, string>, over: Record<string, unknown> = {}) => ({ id: 'local', name: 'Local', version: '1', priority: 100, files, ...over });
const OPTIONAL = { optional: [LOCAL] };

describe('optional local content packs (P15a)', () => {
  it('an absent local pack is not an error', async () => {
    const r = await loadPacks(['content/core', LOCAL], fetcher(null), OPTIONAL);
    expect(r.errors).toEqual([]);
    expect(r.registries.blockingItems.size).toBeGreaterThan(0);
  });

  it('without the option the same absence is an error (a core pack is never optional)', async () => {
    const r = await loadPacks(['content/core', LOCAL], fetcher(null));
    expect(r.errors.some((e) => e.pack === LOCAL && e.file === 'manifest.json')).toBe(true);
    const core = await loadPacks(['content/missing_core', 'content/core'], async (p) => (p.startsWith('content/missing_core') ? Promise.reject(new Error('HTTP 404 for ' + p)) : read(p)), { optional: [LOCAL] });
    expect(core.errors.some((e) => e.pack === 'content/missing_core')).toBe(true);
  });

  it('a local pack adds and overrides by id', async () => {
    const files = {
      [`${LOCAL}/manifest.json`]: manifest({ blockingItems: 'items.json' }),
      [`${LOCAL}/items.json`]: [
        { id: 'collar', extends: 'collar', label: 'My collar' }, // `extends` its own id: keep the core row, change the label
        { id: 'my_scarf', scope: 'any', slots: ['neck'], label: 'My scarf', description: 'A scarf.', promptHint: 'scarfed' },
      ],
    };
    const base = await loadPacks(['content/core'], read);
    const r = await loadPacks(['content/core', LOCAL], fetcher(files), OPTIONAL);
    expect(r.errors).toEqual([]);
    expect(r.registries.blockingItems.get('collar')!.label).toBe('My collar');
    expect(r.registries.blockingItems.get('collar')!.slots).toEqual(base.registries.blockingItems.get('collar')!.slots); // the rest of the row stays
    expect(r.registries.blockingItems.get('my_scarf')!.label).toBe('My scarf');
    expect(r.registries.blockingItems.size).toBe(base.registries.blockingItems.size + 1);
  });

  it('a bad local row is reported and core still loads', async () => {
    const files = {
      [`${LOCAL}/manifest.json`]: manifest({ blockingItems: 'items.json' }),
      [`${LOCAL}/items.json`]: [{ id: 'broken', scope: 'any', slots: ['nowhere'], label: 'Broken', description: 'x', promptHint: 'x' }],
    };
    const base = await loadPacks(['content/core'], read);
    const r = await loadPacks(['content/core', LOCAL], fetcher(files), OPTIONAL);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors.every((e) => e.pack === 'local')).toBe(true);
    expect(r.registries.blockingItems.has('broken')).toBe(false);
    expect(r.registries.blockingItems.size).toBe(base.registries.blockingItems.size);
    expect(r.registries.blockingContacts.size).toBe(base.registries.blockingContacts.size);
  });

  it('a local manifest that is present but broken is reported, not skipped', async () => {
    const r = await loadPacks(['content/core', LOCAL], fetcher({ [`${LOCAL}/manifest.json`]: { id: 'local' } }), OPTIONAL);
    expect(r.errors.some((e) => e.pack === LOCAL && e.file === 'manifest.json')).toBe(true);
    expect(r.registries.blockingItems.size).toBeGreaterThan(0);
  });

  it('.gitignore lists content/local/ and not dist/ or style.css', () => {
    const lines = readFileSync('.gitignore', 'utf8').split('\n').map((l) => l.trim());
    expect(lines).toContain('content/local/');
    for (const bad of ['dist', 'dist/', 'dist/index.js', 'style.css', '/style.css', '/dist']) expect(lines, bad).not.toContain(bad);
  });

  it('the extension loads content/local as an optional root', () => {
    const src = readFileSync('src/index.ts', 'utf8');
    expect(src).toContain("'../content/local'");
    expect(src).toMatch(/optional:\s*\['\.\.\/content\/local'\]/);
  });
});
