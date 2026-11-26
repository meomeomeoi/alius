import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeStAdapter } from '../../../src/st/fake';
import { loadStageFolders } from '../../../src/ui/stage/load';
import { createArtSlots } from '../../../src/ui/scene/art';

const json = (v: unknown) => new Blob([typeof v === 'string' ? v : JSON.stringify(v)], { type: 'application/json' });
const img = () => new Blob(['x'], { type: 'image/png' });
const assetUrl = (p: string) => `ext://${p}`;
const unitKey = (id: string) => ({ u1: 'Vex.png', u2: 'Sana.png' } as Record<string, string>)[id] ?? null;
const units = [{ id: 'u1', cardRef: 'Vex.png' }, { id: 'u2', cardRef: 'Sana.png' }, { id: 'g1' }];

function vexFolder(extra: Record<string, Blob> = {}): FakeStAdapter {
  const st = new FakeStAdapter();
  st.stageFiles.set('Vex.png', new Map(Object.entries({
    'over.webp': img(),
    'over.fit.json': json({ fit: { height: 1.04, x: 0.5 } }),
    'legs_astride.left.png': img(),
    'wallpaper.png': img(),
    ...extra,
  })));
  return st;
}

afterEach(() => vi.restoreAllMocks());

describe('her stage folder (P10e-f)', () => {
  it('a second picture type of one slot is ignored: the first one listed is the slot', async () => {
    const folders = await loadStageFolders(vexFolder({ 'over.png': img() }), units); // listed after over.webp
    const vex = folders.get('Vex.png')!;
    expect([...vex.slots.keys()]).toEqual(['over', 'legs_astride.left']);
    expect(vex.slots.get('over')!.url).toMatch(/\/over\.webp\?/);
    expect(vex.slots.get('over')!.sidecar).toEqual({ fit: { height: 1.04, x: 0.5 } });
  });

  it('a slot of her folder resolves with its sidecar and the folder URL', async () => {
    const folders = await loadStageFolders(vexFolder(), units);
    const vex = folders.get('Vex.png')!;
    expect([...vex.slots.keys()]).toEqual(['over', 'legs_astride.left']); // wallpaper.png is not a slot
    expect(vex.slots.get('legs_astride.left')?.sidecar).toEqual({});
    const art = createArtSlots(null, assetUrl, unitKey, folders);
    const over = art.get('u1', 'over');
    expect(over?.sidecar).toEqual({ fit: { height: 1.04, x: 0.5 } });
    expect(over?.url).toMatch(/^\/characters\/Vex\/alius\/over\.webp\?t=\d+$/);
    expect(folders.has('Sana.png')).toBe(false); // no folder, no entry
  });

  it('her folder wins over art.json; an art.json-only slot still resolves', async () => {
    const folders = await loadStageFolders(vexFolder(), units);
    const manifest = {
      'Vex.png': {
        over: { file: 'vex/over.webp', sidecar: { fit: { height: 9 } } },
        feet_floor: { file: 'vex/feet.webp' },
        sprite: { sidecar: { face: { x: 0.1, y: 0.1 } } },
      },
    };
    const art = createArtSlots(manifest, assetUrl, unitKey, folders);
    expect(art.get('u1', 'over')?.url).toMatch(/^\/characters\/Vex\/alius\/over\.webp/);
    expect(art.get('u1', 'feet_floor')).toEqual({ url: 'ext://content/local/art/vex/feet.webp', sidecar: {} });
    expect(art.face('u1')).toEqual({ x: 0.1, y: 0.1 }); // no stage.json: the manifest's face
  });

  it('her stage.json face beats art.json sprite.face', async () => {
    const st = vexFolder({ 'stage.json': json({ face: { x: 0.4, y: 0.2 }, accent: '#aabbcc', stand: { scale: 1.2, x: 0.05, y: -0.1 }, hand: 'caveat' }) });
    const folders = await loadStageFolders(st, units);
    expect(folders.get('Vex.png')?.setup).toEqual({ face: { x: 0.4, y: 0.2 }, accent: '#aabbcc', stand: { scale: 1.2, x: 0.05, y: -0.1 }, hand: 'caveat' });
    const art = createArtSlots({ 'Vex.png': { sprite: { sidecar: { face: { x: 0.1, y: 0.1 } } } } }, assetUrl, unitKey, folders);
    expect(art.face('u1')).toEqual({ x: 0.4, y: 0.2 });
  });

  it('a broken sidecar gives the picture with {} and one warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const st = vexFolder({ 'over.fit.json': json({ fit: { height: 'tall' } }), 'legs_astride.left.fit.json': json({ feet: 'many' }) });
    const folders = await loadStageFolders(st, units);
    expect(folders.get('Vex.png')?.slots.get('over')?.sidecar).toEqual({});
    expect(folders.get('Vex.png')?.slots.get('legs_astride.left')?.sidecar).toEqual({});
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a sidecar that is not JSON at all is one warning too', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const folders = await loadStageFolders(vexFolder({ 'over.fit.json': json('{oops') }), units);
    expect(folders.get('Vex.png')?.slots.get('over')?.sidecar).toEqual({});
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a broken stage.json gives setup null and one warning; the slots are unaffected', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const folders = await loadStageFolders(vexFolder({ 'stage.json': json({ stand: { scale: 9, x: 0, y: 0 }, accent: 'red' }) }), units);
    expect(folders.get('Vex.png')?.setup).toBeNull();
    expect(folders.get('Vex.png')?.slots.get('over')?.sidecar).toEqual({ fit: { height: 1.04, x: 0.5 } });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('no folder: no entry, and the resolver answers exactly as without folders', async () => {
    const st = new FakeStAdapter();
    const folders = await loadStageFolders(st, units);
    expect(folders.size).toBe(0);
    const manifest = { 'Vex.png': { over: { file: 'vex/over.webp' }, sprite: { sidecar: { face: { x: 0.3, y: 0.3 } } } } };
    const a = createArtSlots(manifest, assetUrl, unitKey);
    const b = createArtSlots(manifest, assetUrl, unitKey, folders);
    for (const id of ['u1', 'u2', 'g1']) {
      expect(b.get(id, 'over')).toEqual(a.get(id, 'over'));
      expect(b.face(id)).toEqual(a.face(id));
    }
  });

  it('a legs_astride pair in her folder wins over a single legs_astride of art.json', async () => {
    const st = new FakeStAdapter();
    st.stageFiles.set('Vex.png', new Map([['legs_astride.left.png', img()], ['legs_astride.right.png', img()]]));
    const folders = await loadStageFolders(st, units);
    const art = createArtSlots({ 'Vex.png': { legs_astride: { file: 'vex/a.webp', sidecar: { feet: 'one' } } } }, assetUrl, unitKey, folders);
    const got = art.get('u1', 'legs_astride');
    expect(got?.pair?.left).toMatch(/legs_astride\.left\.png/);
    expect(got?.sidecar.feet).toBe('pair');
  });
});
