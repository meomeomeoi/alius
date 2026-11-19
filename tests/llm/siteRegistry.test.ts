// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { loadPacks } from '../../src/content/loader';
import { CALL_TYPE_IDS, getCallType } from '../../src/llm/callTypes';
import { generationSite, generationSites } from '../../src/llm/sites';
import { FakeStAdapter } from '../../src/st/fake';
import { listFlavorKinds } from '../../src/llm/calls/flavor';

let content: Awaited<ReturnType<typeof loadPacks>>;
beforeAll(async () => {
  content = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(content.errors).toEqual([]);
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('the site registry (P14)', () => {
  it('every CallTypeId has a registered call type and a site', () => {
    for (const id of CALL_TYPE_IDS) {
      expect(getCallType(id), `call type ${id}`).toBeDefined();
      expect(generationSites().some((s) => s.callType === id), `a site for ${id}`).toBe(true);
    }
  });

  it('every flavor kind has a flavor.<kind> site on the flavor call type', () => {
    expect(listFlavorKinds().length).toBeGreaterThanOrEqual(7);
    for (const kind of listFlavorKinds()) {
      expect(generationSite(`flavor.${kind}`), `flavor.${kind}`).toMatchObject({ callType: 'flavor' });
    }
  });

  it('every site has a label, a surface, a reroll mode, a record mode and a glossary id that exists', async () => {
    const glossary = new Set((JSON.parse(await readFile('content/core/glossary.json', 'utf8')) as Array<{ id: string }>).map((e) => e.id));
    for (const s of generationSites()) {
      expect(s.label(null, 'k').length, s.id).toBeGreaterThan(0);
      expect(['scene', 'comms', 'day', 'expedition', 'dilemma', 'setup', 'world', 'sys'], s.id).toContain(s.surface);
      expect(['free', 'before_commit', 'revert', 'none'], s.id).toContain(s.reroll);
      expect(['full', 'quiet', 'none'], s.id).toContain(s.record);
      expect(glossary.has(s.glossary), `${s.id}: glossary ${s.glossary}`).toBe(true);
    }
  });

  it('a site id is dotted and unique, and a quiet or full site is never a fragment (hidden truth)', () => {
    const ids = generationSites().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id, id).toMatch(/^[a-z]+\.[a-z_]+$/);
    expect(generationSite('flavor.frequency_fragment')!.record).toBe('none');
  });

  it('every declared site is bound once the app runs', async () => {
    const st = new FakeStAdapter({ chatId: 'solo', isGroup: false });
    const shell = {
      open: vi.fn(), close() {}, isOpen: () => true, showScreen() {}, showTab() {}, registerTab() {}, registerHub() {}, registerScreen() {},
      setTabLocked() {}, setTabBadge() {}, toast() {}, async modal() { return null; }, setPalette() {}, refresh: vi.fn(), destroy() {},
    };
    const app = createApp(st, { loadContent: async () => content, shellFactory: () => shell as never });
    await app.start();
    // a site with no handlers answers `unbound`; the sites the setup wizard and the warden bind on use are bound when they run
    const bound: string[] = [];
    for (const s of generationSites().filter((x) => !x.id.startsWith('test.'))) {
      const out = await app.generations.generate(s.id, 'registry-probe', { noRecord: true });
      if (out.kind !== 'unbound') bound.push(s.id);
    }
    // the sites bound at creation: scene, comms, memory, world, discipline, bonds, power, personal, special, warden and the app's own
    const lazy = ['setup.profile_import', 'setup.commander_import', 'chronicle.compact'];
    for (const s of generationSites().filter((x) => !x.id.startsWith('test.') && !lazy.includes(x.id))) {
      expect(bound, `${s.id} is not bound by any controller`).toContain(s.id);
    }
  });
});
