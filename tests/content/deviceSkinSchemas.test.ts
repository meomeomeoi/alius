import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { DeviceSkinSchema } from '../../src/content/schemas';
import { loadPacks } from '../../src/content/loader';
import { REGISTRY_NAMES } from '../../src/content/types';

const css = {
  id: 'plain', name: 'Plain', description: 'A plain handset.', kind: 'css', cssPreset: 'ccp_standard', ledColor: '#ffb000', accent: '#d8cb98',
};
const image = {
  id: 'framed', name: 'Framed', description: 'A rendered handset.', kind: 'image', frameImage: 'content/core/art/device/framed.png',
  frameSize: { w: 1000, h: 1600 }, screenRect: { x: 100, y: 240, w: 800, h: 1200 }, ledColor: '#ff3b1f', accent: '#e8ad0c',
};

describe('deviceSkins schema', () => {
  it('is a registry name', () => {
    expect(REGISTRY_NAMES).toContain('deviceSkins');
  });

  it('a css skin and an image skin parse', () => {
    expect(DeviceSkinSchema.safeParse(css).success).toBe(true);
    expect(DeviceSkinSchema.safeParse(image).success).toBe(true);
    expect(DeviceSkinSchema.safeParse({ ...css, label: 'CCP-PDA MK.III', bindTo: { corporationId: 'kestrel' } }).success).toBe(true);
    expect(DeviceSkinSchema.safeParse({ ...image, overlay: { image: 'content/core/art/device/grime.png', blend: 'multiply', opacity: 0.4 } }).success).toBe(true);
  });

  it('a css skin without cssPreset is rejected', () => {
    const { cssPreset: _drop, ...rest } = css;
    expect(DeviceSkinSchema.safeParse(rest).success).toBe(false);
    expect(DeviceSkinSchema.safeParse({ ...css, cssPreset: 'gold' }).success).toBe(false);
  });

  it('an image skin needs a frame image, a frame size and a screen rect', () => {
    for (const k of ['frameImage', 'frameSize', 'screenRect'] as const) {
      const { [k]: _drop, ...rest } = image;
      expect(DeviceSkinSchema.safeParse(rest).success, k).toBe(false);
    }
  });

  it('an image skin whose screenRect leaves the frame is rejected', () => {
    expect(DeviceSkinSchema.safeParse({ ...image, screenRect: { x: 900, y: 240, w: 200, h: 1200 } }).success).toBe(false);
    expect(DeviceSkinSchema.safeParse({ ...image, screenRect: { x: 100, y: 1000, w: 800, h: 700 } }).success).toBe(false);
    expect(DeviceSkinSchema.safeParse({ ...image, screenRect: { x: 200, y: 400, w: 800, h: 1200 } }).success).toBe(true);
  });

  it('bindTo with two keys is rejected, with one is accepted', () => {
    expect(DeviceSkinSchema.safeParse({ ...css, bindTo: { corporationId: 'kestrel', traitId: 'insomniac' } }).success).toBe(false);
    expect(DeviceSkinSchema.safeParse({ ...css, bindTo: { traitId: 'insomniac' } }).success).toBe(true);
    expect(DeviceSkinSchema.safeParse({ ...css, bindTo: { unlockFlag: 'f' } }).success).toBe(true);
  });

  it('colours must be hex', () => {
    expect(DeviceSkinSchema.safeParse({ ...css, ledColor: 'red' }).success).toBe(false);
    expect(DeviceSkinSchema.safeParse({ ...css, accent: '#fff' }).success).toBe(false);
  });
});

const core = async (file: string): Promise<unknown> => JSON.parse(await readFile(`content/core/${file}`, 'utf8'));

async function loadSkins(skins: unknown[]) {
  const files: Record<string, unknown> = {
    'mem/manifest.json': { id: 'mem', name: 'Mem', version: '1', priority: 0, files: { deviceSkins: 'deviceSkins.json', corporations: 'corporations.json', commanderTraits: 'commanderTraits.json', flags: 'flags.json' } },
    'mem/deviceSkins.json': skins,
    'mem/corporations.json': await core('corporations.json'),
    'mem/commanderTraits.json': await core('commanderTraits.json'),
    'mem/flags.json': await core('flags.json'),
  };
  const loaded = await loadPacks(['mem'], async (p) => {
    if (!(p in files)) throw new Error(`404 ${p}`);
    return files[p];
  });
  return { ...loaded, errors: loaded.errors.filter((e) => e.file === 'deviceSkins.json') };
}

describe('deviceSkins loader checks', () => {
  const base = { ...css, id: 'ccp_standard' };

  it('an unknown corporationId in bindTo is an error', async () => {
    const { errors } = await loadSkins([base, { ...css, id: 'x', bindTo: { corporationId: 'ghost_corp' } }]);
    expect(errors.map((e) => e.message).join('\n')).toMatch(/ghost_corp/);
  });

  it('an unknown traitId or unlockFlag in bindTo is an error', async () => {
    const { errors } = await loadSkins([base, { ...css, id: 'x', bindTo: { traitId: 'ghost_trait' } }, { ...css, id: 'y', bindTo: { unlockFlag: 'ghost_flag' } }]);
    const text = errors.map((e) => e.message).join('\n');
    expect(text).toMatch(/ghost_trait/);
    expect(text).toMatch(/ghost_flag/);
  });

  it('a pack without ccp_standard is an error', async () => {
    const { errors } = await loadSkins([{ ...css, id: 'x' }]);
    expect(errors.map((e) => e.message).join('\n')).toMatch(/ccp_standard/);
  });

  it('a valid fixture loads without skin errors', async () => {
    const { errors } = await loadSkins([base, { ...css, id: 'k', bindTo: { corporationId: 'kestrel' } }]);
    expect(errors, JSON.stringify(errors)).toEqual([]);
  });
});
