import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import { REGISTRY_NAMES } from '../../src/content/types';

const fsFetch = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const P = 'tests/fixtures/packs';

/** fetchJson over an in-memory file map; unknown paths reject like a 404. */
const memFetch = (files: Record<string, unknown>) => async (path: string) => {
  if (!(path in files)) throw new Error(`404 ${path}`);
  return files[path];
};

describe('content loader', () => {
  it('base pack loads two registries', async () => {
    const { registries, errors } = await loadPacks([`${P}/base`], fsFetch);
    expect(errors).toEqual([]);
    expect([...registries.flags.keys()]).toEqual(['alpha', 'beta']);
    expect([...registries.marks.keys()]).toEqual(['medic', 'tank']);
    expect(Object.keys(registries).sort()).toEqual([...REGISTRY_NAMES].sort());
    expect(registries.skills.size).toBe(0);
  });

  it('the shipped core pack loads without errors', async () => {
    const { registries, errors } = await loadPacks(['content/core'], fsFetch);
    expect(errors).toEqual([]);
    expect(registries.flags.size).toBe(10);
  });

  it('invalid entry reported with file and path, valid siblings kept', async () => {
    const { registries, errors } = await loadPacks([`${P}/broken`], fsFetch);
    const e = errors.find((x) => x.path === '[1].scope');
    expect(e).toMatchObject({ pack: 'broken', file: 'flags.json' });
    expect(e!.message.length).toBeGreaterThan(0);
    expect(registries.flags.has('ok_one')).toBe(true);
    expect(registries.flags.has('bad_scope')).toBe(false);
  });

  it('missing file is reported, others load', async () => {
    const files = {
      'p/manifest.json': { id: 'p', name: 'P', version: '1', priority: 0, files: { flags: 'flags.json', marks: 'marks.json' } },
      'p/flags.json': [{ id: 'f1', scope: 'world', description: 'd' }],
    };
    const { registries, errors } = await loadPacks(['p'], memFetch(files));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ pack: 'p', file: 'marks.json' });
    expect(registries.flags.has('f1')).toBe(true);
    expect(registries.skills.size).toBe(0);
  });

  it('missing manifest is reported and other packs still load', async () => {
    const { registries, errors } = await loadPacks(['tests/fixtures/packs/none', `${P}/base`], fsFetch);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ file: 'manifest.json' });
    expect(registries.flags.size).toBe(2);
  });

  it('higher priority pack overrides by id', async () => {
    // Root order must not matter: priority decides.
    const { registries, errors } = await loadPacks([`${P}/override`, `${P}/base`], fsFetch);
    expect(errors).toEqual([]);
    expect(registries.flags.get('alpha')!.description).toBe('Alpha overridden');
    expect(registries.flags.get('beta')!.description).toBe('Beta flag');
  });

  it('extends merges objects and replaces arrays', async () => {
    const { registries, errors } = await loadPacks([`${P}/base`, `${P}/override`], fsFetch);
    expect(errors).toEqual([]);
    const plus = registries.marks.get('medic_plus')!;
    expect(plus.name).toBe('Medic+');
    expect(plus.tags).toEqual(['heal', 'buff']);
    expect(plus.stats).toEqual({ hp: 10, atk: 5 });
    expect(plus.extends).toBeUndefined();
    // medic itself is untouched
    expect(registries.marks.get('medic')!.stats).toEqual({ hp: 10, atk: 2 });
    // self-extends is a partial override of the lower-priority entry
    expect(registries.marks.get('tank')).toEqual({ id: 'tank', name: 'Tank Mk2' });
  });

  it('extends unknown id is an error', async () => {
    const files = {
      'p/manifest.json': { id: 'p', name: 'P', version: '1', priority: 0, files: { marks: 'marks.json' } },
      'p/marks.json': [{ id: 'x', extends: 'nope' }],
    };
    const { registries, errors } = await loadPacks(['p'], memFetch(files));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ pack: 'p', file: 'marks.json', path: '[0].extends' });
    expect(errors[0].message).toContain('nope');
    expect(registries.marks.has('x')).toBe(false);
  });

  it('extends cycles are errors, not hangs', async () => {
    const files = {
      'p/manifest.json': { id: 'p', name: 'P', version: '1', priority: 0, files: { marks: 'marks.json' } },
      'p/marks.json': [{ id: 'a', extends: 'b' }, { id: 'b', extends: 'a' }],
    };
    const { errors } = await loadPacks(['p'], memFetch(files));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => /cycle/i.test(e.message))).toBe(true);
  });

  it('unknown flag in mutuallyExclusiveWith is reported', async () => {
    const { registries, errors } = await loadPacks([`${P}/broken`], fsFetch);
    const e = errors.find((x) => x.path === '[3].mutuallyExclusiveWith[0]');
    expect(e).toMatchObject({ pack: 'broken', file: 'flags.json' });
    expect(e!.message).toContain('ghost');
    expect(registries.flags.has('refs_ghost')).toBe(true);
  });

  it('all errors are returned together', async () => {
    const { errors } = await loadPacks([`${P}/broken`], fsFetch);
    expect(errors).toHaveLength(3);
    expect(errors.map((e) => e.path).sort()).toEqual(['[1].scope', '[2].id', '[3].mutuallyExclusiveWith[0]']);
  });

  it('duplicate id within one file is an error', async () => {
    const { registries, errors } = await loadPacks([`${P}/broken`], fsFetch);
    const e = errors.find((x) => x.path === '[2].id');
    expect(e!.message).toContain('ok_one');
    expect(registries.flags.get('ok_one')!.description).toBe('fine');
  });

  it('unknown registry name in a manifest is an error', async () => {
    const files = {
      'p/manifest.json': { id: 'p', name: 'P', version: '1', priority: 0, files: { sneakers: 'x.json' } },
    };
    const { errors } = await loadPacks(['p'], memFetch(files));
    expect(errors).toHaveLength(1);
    expect(errors[0].file).toBe('manifest.json');
  });

  describe('P1 registries and lorebook', () => {
    /** The p1 fixture as an in-memory file map under the root `p1`, so tests can patch single files. */
    const p1Files = async (): Promise<Record<string, unknown>> => {
      const files: Record<string, unknown> = {};
      for (const f of ['manifest', 'corporations', 'regions', 'starts', 'crimes', 'roles', 'signatures', 'defects', 'statuses', 'skills', 'lorebook']) {
        files[`p1/${f}.json`] = await fsFetch(`${P}/p1/${f}.json`);
      }
      return files;
    };

    it('p1 fixture loads every new registry without errors', async () => {
      const { registries, errors, lorebook } = await loadPacks([`${P}/p1`], fsFetch);
      expect(errors).toEqual([]);
      for (const name of ['corporations', 'starts', 'crimes', 'roles', 'signatures', 'defects', 'statuses'] as const) {
        expect(registries[name].size, name).toBe(name === 'corporations' ? 2 : 1);
      }
      expect(lorebook?.name).toBe('P1 Lore');
    });

    it('start with unknown corporation is reported', async () => {
      const files = await p1Files();
      (files['p1/starts.json'] as Array<Record<string, unknown>>)[0].corporationId = 'ghost';
      const { errors } = await loadPacks(['p1'], memFetch(files));
      const e = errors.find((x) => x.path === '[0].corporationId');
      expect(e).toMatchObject({ pack: 'p1', file: 'starts.json' });
      expect(e!.message).toContain('ghost');
    });

    it('start with non-playable corporation is reported', async () => {
      const files = await p1Files();
      (files['p1/starts.json'] as Array<Record<string, unknown>>)[0].corporationId = 'corp_b';
      const { errors } = await loadPacks(['p1'], memFetch(files));
      const e = errors.find((x) => x.path === '[0].corporationId');
      expect(e!.message).toBe('start "start_a" uses non-playable corporation "corp_b"');
    });

    it('lorebook from highest priority pack is returned', async () => {
      const files = await p1Files();
      files['hi/manifest.json'] = { id: 'hi', name: 'Hi', version: '1', priority: 5, lorebook: 'book.json', files: {} };
      files['hi/book.json'] = { name: 'Hi Lore', entries: [] };
      const { errors, lorebook } = await loadPacks(['hi', 'p1'], memFetch(files));
      expect(errors).toEqual([]);
      expect(lorebook?.name).toBe('Hi Lore');
      const low = await loadPacks(['p1'], memFetch(files));
      expect(low.lorebook?.name).toBe('P1 Lore');
    });

    it('invalid lorebook is an error and null', async () => {
      const files = await p1Files();
      files['p1/lorebook.json'] = { name: 'Bad', entries: [{ key: ['a'], comment: 'c', content: '', constant: false }] };
      const { errors, lorebook } = await loadPacks(['p1'], memFetch(files));
      expect(lorebook).toBeNull();
      const e = errors.find((x) => x.file === 'lorebook.json');
      expect(e).toMatchObject({ pack: 'p1', path: 'entries[0].content' });
    });

    it('packs without a lorebook give null', async () => {
      const { lorebook } = await loadPacks([`${P}/base`], fsFetch);
      expect(lorebook).toBeNull();
    });
  });
});
