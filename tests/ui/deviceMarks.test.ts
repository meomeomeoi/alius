// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Entry, Registries } from '../../src/content/types';
import { DESCRIBED_REGISTRIES, DeviceSkinSchema, RESERVED_EVENT_TYPES, StickerArtSchema } from '../../src/content/schemas';
import { REGISTRY_NAMES } from '../../src/content/types';
import { fnv1a } from '../../src/engine/hub';
import type { CampaignState } from '../../src/engine/state/types';
import { FakeStAdapter } from '../../src/st/fake';
import { renderMarks, stickerFor } from '../../src/ui/device/marks';
import { BUILT_IN_SKIN } from '../../src/ui/device/skins';
import { h } from '../../src/ui/dom';
import { createShell, type ShellApi } from '../../src/ui/shell/shell';
import { campaign, loadCore } from '../helpers/world';

vi.mock('../../src/ui/device/chrome', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/ui/device/chrome')>();
  return { ...real, renderChrome: vi.fn(real.renderChrome) };
});

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
let shells: ShellApi[] = [];
afterEach(() => {
  shells.forEach((s) => s.destroy());
  shells = [];
  document.body.innerHTML = '';
});
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];

const skin = (id = 'ccp_standard'): Entry => reg.deviceSkins.get(id)!;
function world(decorated: Array<[string, Array<'sticker' | 'wallpaper' | 'contact'>, number?]> = [[ANN, ['sticker']]]): CampaignState {
  const s = campaign(reg, 4);
  s.day = 5;
  s.personal = { seq: 1, decor: Object.fromEntries(decorated.map(([id, parts, faded]) => [id, { since: 2, parts, contactName: 'X', ...(faded !== undefined ? { fadedUntil: faded } : {}) }])) };
  return s;
}
const draw = (s: CampaignState, sk: Entry = skin()) => {
  const layer = h('div', { class: 'alius-device-marks' });
  document.body.append(layer);
  renderMarks(layer, s, reg, sk);
  return layer;
};
const marks = (layer: HTMLElement) => [...layer.querySelectorAll<HTMLElement>('.alius-sticker-mark')];

describe('registry stickerArt and skin spots', () => {
  it('is a registry, described, with an svg path or a glyph per entry', () => {
    expect(REGISTRY_NAMES).toContain('stickerArt');
    expect(DESCRIBED_REGISTRIES).toContain('stickerArt');
    expect(reg.stickerArt.size).toBeGreaterThanOrEqual(6);
    for (const e of reg.stickerArt.values()) expect((e.svg === undefined) !== (e.glyph === undefined), String(e.id)).toBe(true);
  });

  it('the schema takes exactly one of svg and glyph, a glyph of at most two characters', () => {
    const base = { id: 'x', name: 'X', description: 'D' };
    expect(StickerArtSchema.safeParse({ ...base, svg: 'M0 0h24v24z' }).success).toBe(true);
    expect(StickerArtSchema.safeParse({ ...base, glyph: '☠' }).success).toBe(true);
    expect(StickerArtSchema.safeParse({ ...base, glyph: '☠☠☠' }).success).toBe(false);
    expect(StickerArtSchema.safeParse({ ...base }).success).toBe(false);
    expect(StickerArtSchema.safeParse({ ...base, svg: 'M0 0', glyph: 'a' }).success).toBe(false);
    expect(StickerArtSchema.safeParse({ ...base, svg: '<svg onload=x>' }).success).toBe(false);
    expect(StickerArtSchema.safeParse({ ...base, glyph: 'a', likeTags: ['music'] }).success).toBe(true);
  });

  it('every core css skin has three sticker spots in percent, and the schema bounds them', () => {
    for (const id of ['ccp_standard', 'kestrel', 'vesper']) {
      const spots = skin(id).stickerSpots as Array<{ x: number; y: number; rot: number }>;
      expect(spots, id).toHaveLength(3);
      for (const p of spots) expect(p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100, id).toBe(true);
    }
    const sk = { ...skin(), stickerSpots: [{ x: 101, y: 0, rot: 0 }] };
    expect(DeviceSkinSchema.safeParse(sk).success).toBe(false);
  });
});

describe('stickerFor', () => {
  it('likeTags pick before the hash', () => {
    const s = campaign(reg, 4);
    const tagged = [...reg.stickerArt.values()].find((e) => Array.isArray(e.likeTags) && (e.likeTags as string[]).length > 0)!;
    s.squad[0].likes = [(tagged.likeTags as string[])[0].toUpperCase()]; // matched case-insensitively
    expect(stickerFor(s, reg, ANN)!.id).toBe(tagged.id);
  });

  it('else the hash of her id over the registry order', () => {
    const s = campaign(reg, 4);
    s.squad[0].likes = ['nothing that is a tag'];
    const all = [...reg.stickerArt.values()];
    expect(stickerFor(s, reg, ANN)!.id).toBe(all[fnv1a(ANN) % all.length].id);
  });

  it('null for a grunt, an unknown unit and an empty registry', () => {
    const s = campaign(reg, 4);
    s.squad[1].kind = 'grunt';
    expect(stickerFor(s, reg, BEA)).toBeNull();
    expect(stickerFor(s, reg, 'nobody')).toBeNull();
    expect(stickerFor(s, { ...reg, stickerArt: new Map() } as Registries, ANN)).toBeNull();
  });
});

describe('renderMarks', () => {
  it("a decorated unit's sticker sits on the first spot, rotated", () => {
    const layer = draw(world());
    const [m] = marks(layer);
    const spot = (skin().stickerSpots as Array<{ x: number; y: number; rot: number }>)[0];
    expect(m.dataset.unit).toBe(ANN);
    expect(m.style.left).toBe(`${spot.x}%`);
    expect(m.style.top).toBe(`${spot.y}%`);
    expect(m.style.transform).toBe(`rotate(${spot.rot}deg)`);
  });

  it('units with a sticker part take the spots in squad order; extra stickers show none', () => {
    const s = world([[CAT, ['sticker']], [ANN, ['sticker']], [BEA, ['sticker']], ['unit_dee', ['sticker']]]);
    const layer = draw(s);
    expect(marks(layer).map((m) => m.dataset.unit)).toEqual([ANN, BEA, CAT]); // 3 spots: Dee has none
  });

  it('a decor without the sticker part draws none', () => {
    expect(marks(draw(world([[ANN, ['wallpaper', 'contact']]])))).toHaveLength(0);
  });

  it('a faded sticker is marked faded', () => {
    const [m] = marks(draw(world([[ANN, ['sticker'], 8]])));
    expect(m.dataset.faded).toBe('true');
    expect(marks(draw(world()))[0].dataset.faded).toBeUndefined();
  });

  it('once the fade is over the sticker is gone', () => {
    expect(marks(draw(world([[ANN, ['sticker'], 4]])))).toHaveLength(0);
  });

  it('an image skin without spots shows none', () => {
    const image = { ...skin(), id: 'framed', kind: 'image', stickerSpots: undefined } as Entry;
    expect(marks(draw(world(), image))).toHaveLength(0);
    expect(marks(draw(world(), BUILT_IN_SKIN))).toHaveLength(marks(draw(world(), skin())).length);
  });

  it('an svg sticker is a path set with setAttribute (viewBox 24), a glyph sticker is text; neither is markup', () => {
    const svgArt = { id: 'p', name: 'P', description: 'D', svg: 'M12 2L2 22h20z' } as Entry;
    const glyphArt = { id: 'g', name: 'G', description: 'D', glyph: '<b>' } as Entry;
    const s = world([[ANN, ['sticker']], [BEA, ['sticker']]]);
    const r = { ...reg, stickerArt: new Map([['p', svgArt], ['g', glyphArt]]) } as Registries;
    const layer = h('div');
    document.body.append(layer);
    renderMarks(layer, s, r, skin());
    const [a, b] = marks(layer);
    const svg = [a, b].map((m) => m.querySelector('svg')).find(Boolean)!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.querySelector('path')!.getAttribute('d')).toBe('M12 2L2 22h20z');
    const glyph = [a, b].find((m) => m.querySelector('svg') === null)!;
    expect(glyph.querySelector('b')).toBeNull();
    expect(glyph.textContent).toBe('<b>');
  });

  it('redraws from scratch: calling it again does not stack stickers', () => {
    const layer = draw(world());
    renderMarks(layer, world(), reg, skin());
    expect(marks(layer)).toHaveLength(1);
  });
});

describe('the marks layer in the shell', () => {
  const setup = (state: CampaignState, sk: Entry = skin()) => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const shell = createShell({
      st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }),
      skin: () => ({ skin: sk }), marks: (layer) => renderMarks(layer, state, reg, sk),
    });
    shells.push(shell);
    return shell;
  };
  const layer = () => document.querySelector<HTMLElement>('#alius-shell .alius-device .alius-device-marks')!;

  it('is inside the device, aria-hidden and ignores the pointer, so a sticker is never clickable', () => {
    setup(world()).open();
    expect(layer()).not.toBeNull();
    expect(layer().getAttribute('aria-hidden')).toBe('true');
    expect(layer().style.pointerEvents).toBe('none');
    expect(layer().parentElement!.classList.contains('alius-device')).toBe(true);
    expect(marks(layer())).toHaveLength(1);
  });

  it('a refresh redraws the marks without dressing the chrome again', async () => {
    const chrome = await import('../../src/ui/device/chrome');
    const spy = vi.mocked(chrome.renderChrome);
    spy.mockClear();
    const s = world();
    const shell = setup(s);
    shell.open();
    expect(spy).toHaveBeenCalledTimes(1);
    s.personal!.decor![BEA] = { since: 2, parts: ['sticker'], contactName: 'B' };
    shell.refresh();
    expect(marks(layer()).map((m) => m.dataset.unit)).toEqual([ANN, BEA]);
    delete s.personal!.decor![ANN];
    shell.refresh();
    expect(marks(layer()).map((m) => m.dataset.unit)).toEqual([BEA]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a shell without a marks dep still has the (empty) layer', () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const state = world();
    const shell = createShell({ st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }) });
    shells.push(shell);
    shell.open();
    expect(layer().children).toHaveLength(0);
  });
});

describe('events', () => {
  it('nothing new is emitted (peeling reuses decor_removed)', () => {
    expect(RESERVED_EVENT_TYPES).toContain('decor_removed_by_commander');
  });
});
