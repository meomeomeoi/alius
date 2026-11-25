import { afterEach, describe, expect, it, vi } from 'vitest';
import { ART_SLOT_IDS, createArtSlots, explicitArtAllowed } from '../../../src/ui/scene/art';

const assetUrl = (p: string) => `ext://${p}`;
const keys: Record<string, string> = { u1: 'Mira.png', u2: 'Sana.png' };
const unitKey = (id: string) => keys[id] ?? null;

afterEach(() => vi.restoreAllMocks());

describe('art slots (P10e-e)', () => {
  it('an absent manifest gives null for every slot', () => {
    for (const manifest of [undefined, null, {}, 'nonsense', 42]) {
      const art = createArtSlots(manifest, assetUrl, unitKey);
      for (const slot of ART_SLOT_IDS) expect(art.get('u1', slot, { explicit: true })).toBeNull();
    }
  });

  it('a slot resolves to assetUrl(content/local/art/<file>) with its sidecar', () => {
    const art = createArtSlots({
      'Mira.png': {
        over: { file: 'mira/over.webp', sidecar: { fit: { height: 1.04, x: 0.5, sink: 0 } } },
        face_close: { file: 'mira/face.webp', sidecar: { face: { x: 0.47, y: 0.17 } } },
        'shoe_close.boots': {
          file: 'mira/boots.webp',
          sidecar: { feet: 'two', fit: { height: 0.68, y: 0.48, x: 0, fade: 0.25, xr: 0.38, xl: 0.62 }, zones: { right: { toe: [0.3, 0.2, 0.05, 0.04, 10] }, left: { toe: [0.7, 0.2] } } },
        },
        sole_close: { file: 'mira/sole.webp', sidecar: { fit: { height: 0.62, y: 0.47 }, zones: { toes: [0.5, 0.14], heel: [0.5, 0.84, 0.06] } } },
        feet_floor: { file: 'mira/feet.webp' },
      },
    }, assetUrl, unitKey);
    expect(art.get('u1', 'over')).toEqual({ url: 'ext://content/local/art/mira/over.webp', sidecar: { fit: { height: 1.04, x: 0.5, sink: 0 } } });
    expect(art.get('u1', 'face_close')?.sidecar.face).toEqual({ x: 0.47, y: 0.17 });
    expect(art.get('u1', 'shoe_close.boots')?.sidecar.feet).toBe('two');
    expect(art.get('u1', 'sole_close')?.sidecar.zones).toEqual({ toes: [0.5, 0.14], heel: [0.5, 0.84, 0.06] });
    expect(art.get('u1', 'feet_floor')).toEqual({ url: 'ext://content/local/art/mira/feet.webp', sidecar: {} });
    expect(art.get('u1', 'shoe_close.heels')).toBeNull(); // not in the manifest
    expect(art.get('u2', 'over')).toBeNull(); // another unit
    expect(art.get('nobody', 'over')).toBeNull(); // no card
  });

  it('legs_astride with two pictures carries both files', () => {
    const art = createArtSlots({
      'Mira.png': {
        'legs_astride.left': { file: 'mira/astride-l.webp', sidecar: { feet: 'pair', fit: { height: 1, x: 0.08, top: -0.1, tilt: 8 } } },
        'legs_astride.right': { file: 'mira/astride-r.webp', sidecar: { feet: 'pair', fit: { height: 1, x: 0.08, top: -0.1, tilt: 8 } } },
      },
      'Sana.png': { legs_astride: { file: 'sana/astride.webp', sidecar: { feet: 'one', shown: 'left', fit: { height: 1, x: 0.08, top: -0.1, tilt: 8 } } } },
    }, assetUrl, unitKey);
    const pair = art.get('u1', 'legs_astride');
    expect(pair?.sidecar.feet).toBe('pair');
    expect(pair?.pair).toEqual({ left: 'ext://content/local/art/mira/astride-l.webp', right: 'ext://content/local/art/mira/astride-r.webp' });
    expect(pair?.url).toBe('ext://content/local/art/mira/astride-l.webp');
    const one = art.get('u2', 'legs_astride');
    expect(one).toEqual({ url: 'ext://content/local/art/sana/astride.webp', sidecar: { feet: 'one', shown: 'left', fit: { height: 1, x: 0.08, top: -0.1, tilt: 8 } } });
  });

  it('a malformed entry is skipped, not thrown (logged once)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const make = () => createArtSlots({
      'Mira.png': {
        over: { file: 42 },
        face_close: { file: 'mira/face.webp', sidecar: { face: { x: 'left' } } },
        sole_close: { file: '../../secrets.json' },
        feet_floor: { file: 'mira/feet.webp' },
        unknown_slot: { file: 'mira/x.webp' },
      },
      'Sana.png': 'not an object',
    }, assetUrl, unitKey);
    let art!: ReturnType<typeof createArtSlots>;
    expect(() => { art = make(); }).not.toThrow();
    expect(art.get('u1', 'over')).toBeNull();
    expect(art.get('u1', 'face_close')).toBeNull();
    expect(art.get('u1', 'sole_close')).toBeNull(); // a file outside content/local/art
    expect(art.get('u1', 'feet_floor')?.url).toBe('ext://content/local/art/mira/feet.webp');
    expect(art.get('u2', 'over')).toBeNull();
    for (let i = 0; i < 3; i += 1) art.get('u1', 'over');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('over_explicit needs the explicit gate', () => {
    const art = createArtSlots({ 'Mira.png': { over_explicit: { file: 'mira/over-x.webp' }, over: { file: 'mira/over.webp' } } }, assetUrl, unitKey);
    expect(art.get('u1', 'over_explicit')).toBeNull();
    expect(art.get('u1', 'over_explicit', { explicit: false })).toBeNull();
    expect(art.get('u1', 'over_explicit', { explicit: true })?.url).toBe('ext://content/local/art/mira/over-x.webp');
    expect(art.get('u1', 'over')?.url).toBe('ext://content/local/art/mira/over.webp');
  });

  it('the explicit gate reads explicit_scenes and her own limits', () => {
    const reg = {} as never;
    const squad = [{ id: 'u1', kind: 'named' }, { id: 'u2', kind: 'named', bond: { ownLimits: { categories: ['explicit_scenes'] } } }] as never;
    expect(explicitArtAllowed({ squad } as never, reg, 'u1')).toBe(false);
    expect(explicitArtAllowed({ squad, content: { enabled: ['explicit_scenes'] } } as never, reg, 'u1')).toBe(true);
    expect(explicitArtAllowed({ squad, content: { enabled: ['explicit_scenes'] } } as never, reg, 'u2')).toBe(false); // her own limit
  });
});
