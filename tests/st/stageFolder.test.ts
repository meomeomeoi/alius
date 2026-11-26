import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// real.ts imports two SillyTavern-only modules; the build rewrites them, tests stub them.
vi.mock('st:group-chats', () => ({ editGroup: async () => {}, openGroupById: async () => true }));
vi.mock('st:world-info', () => ({ newWorldInfoEntryTemplate: {} }));

import { stageFolder } from '../../src/st/sprites';
import { RealStAdapter } from '../../src/st/real';
import { FakeStAdapter } from '../../src/st/fake';

describe('stageFolder', () => {
  it('is the first segment of her sprite folder + /alius', () => {
    expect(stageFolder('Vex.png', 'Vex', [])).toBe('Vex/alius');
    expect(stageFolder('Vex.png', 'Vex', [{ name: 'Vex', path: 'Vex/casual' }])).toBe('Vex/alius');
    expect(stageFolder('Vex.png', 'Vex', [{ name: 'Vex', path: 'Other' }])).toBe('Other/alius');
  });
});

describe('RealStAdapter: her stage folder', () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let answer: (url: string) => Response;
  beforeEach(() => {
    calls.length = 0;
    answer = () => new Response('[]', { status: 200 });
    (globalThis as any).SillyTavern = {
      getContext: () => ({
        characters: [{ avatar: 'Vex.png', name: 'Vex' }],
        extensionSettings: { expressionOverrides: [{ name: 'Vex', path: 'Vex/casual' }] },
        getRequestHeaders: () => ({ 'Content-Type': 'application/json', 'X-CSRF-Token': 'tok' }),
      }),
    };
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url, init }); return answer(url); }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as any).SillyTavern;
  });

  it('uploads a picture as multipart without Content-Type', async () => {
    const st = new RealStAdapter();
    const ok = await st.uploadStageFile('Vex.png', 'over', new Blob(['x'], { type: 'image/webp' }), 'webp');
    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toBe('/api/sprites/upload');
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers['X-CSRF-Token']).toBe('tok');
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('content-type');
    const body = init?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    const file = body.get('avatar') as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('over.webp');
    expect(body.get('name')).toBe('Vex/alius');
    expect(body.get('label')).toBe('over');
    expect(body.get('spriteName')).toBe('over');
  });

  it('deletes with JSON { name, label, spriteName }', async () => {
    const st = new RealStAdapter();
    expect(await st.deleteStageFile('Vex.png', 'over.fit')).toBe(true);
    expect(calls[0].url).toBe('/api/sprites/delete');
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ name: 'Vex/alius', label: 'over.fit', spriteName: 'over.fit' });
    expect((calls[0].init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('lists her stage files keeping the ?t=', async () => {
    answer = () => new Response(JSON.stringify([
      { label: 'over', path: '/characters/Vex/alius/over.webp?t=123' },
      { label: 'legs_astride.left', path: '/characters/Vex/alius/legs_astride.left.png?t=9' },
    ]));
    const st = new RealStAdapter();
    expect(await st.listStageFiles('Vex.png')).toEqual([
      { file: 'over.webp', url: '/characters/Vex/alius/over.webp?t=123' },
      { file: 'legs_astride.left.png', url: '/characters/Vex/alius/legs_astride.left.png?t=9' },
    ]);
    expect(calls[0].url).toBe('/api/sprites/get?name=Vex%2Falius');
  });

  it('answers [] / null / false on failures and unknown avatars', async () => {
    const st = new RealStAdapter();
    expect(await st.listStageFiles('Nobody.png')).toEqual([]);
    expect(await st.uploadStageFile('Nobody.png', 'over', new Blob(['x']), 'png')).toBe(false);
    answer = () => new Response('nope', { status: 500 });
    expect(await st.listStageFiles('Vex.png')).toEqual([]);
    expect(await st.deleteStageFile('Vex.png', 'over')).toBe(false);
    answer = () => new Response('not found', { status: 404 });
    expect(await st.fetchStageJson('Vex.png', 'stage.json')).toBeNull();
    answer = () => new Response('{broken');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await st.fetchStageJson('Vex.png', 'stage.json')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1); // a hand-edited file says so once; a 404 stays silent
    warn.mockRestore();
    answer = () => { throw new Error('network'); };
    expect(await st.listStageFiles('Vex.png')).toEqual([]);
    expect(await st.listSprites('Vex.png')).toEqual([]);
  });

  it('fetches a json file from her folder', async () => {
    answer = () => new Response(JSON.stringify({ face: { x: 0.5, y: 0.2 } }));
    const st = new RealStAdapter();
    expect(await st.fetchStageJson('Vex.png', 'stage.json')).toEqual({ face: { x: 0.5, y: 0.2 } });
    expect(calls[0].url).toBe('/characters/Vex/alius/stage.json');
  });

  it('lists her root sprite labels (the override folder)', async () => {
    answer = () => new Response(JSON.stringify([{ label: 'neutral', path: '/characters/Vex/casual/neutral.png' }, { label: 'joy', path: '/x' }]));
    const st = new RealStAdapter();
    expect(await st.listSprites('Vex.png')).toEqual(['neutral', 'joy']);
    expect(calls[0].url).toBe('/api/sprites/get?name=Vex%2Fcasual');
  });
});

describe('FakeStAdapter: her stage folder', () => {
  it('replaces a file of the same name without extension', async () => {
    const st = new FakeStAdapter();
    await st.uploadStageFile('Vex.png', 'over', new Blob(['a'], { type: 'image/png' }), 'png');
    await st.uploadStageFile('Vex.png', 'over', new Blob(['b'], { type: 'image/webp' }), 'webp');
    expect((await st.listStageFiles('Vex.png')).map((f) => f.file)).toEqual(['over.webp']);
  });

  it('a sidecar survives an upload of its picture and is read back', async () => {
    const st = new FakeStAdapter();
    await st.uploadStageFile('Vex.png', 'over.fit', new Blob([JSON.stringify({ fit: { s: 1 } })], { type: 'application/json' }), 'json');
    await st.uploadStageFile('Vex.png', 'over', new Blob(['a'], { type: 'image/webp' }), 'webp');
    await st.uploadStageFile('Vex.png', 'over', new Blob(['b'], { type: 'image/png' }), 'png');
    expect(await st.fetchStageJson('Vex.png', 'over.fit.json')).toEqual({ fit: { s: 1 } });
    expect((await st.listStageFiles('Vex.png')).map((f) => f.file)).toEqual(['over.png']);
    expect(await st.deleteStageFile('Vex.png', 'over')).toBe(true);
    expect(await st.listStageFiles('Vex.png')).toEqual([]);
    expect(await st.fetchStageJson('Vex.png', 'over.fit.json')).toEqual({ fit: { s: 1 } });
  });

  it('an unknown avatar lists [] and has no json', async () => {
    const st = new FakeStAdapter();
    expect(await st.listStageFiles('Nobody.png')).toEqual([]);
    expect(await st.fetchStageJson('Nobody.png', 'stage.json')).toBeNull();
    expect(await st.listSprites('Nobody.png')).toEqual([]);
  });
});
