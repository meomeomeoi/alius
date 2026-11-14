// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Entry, Registries } from '../../src/content/types';
import { createCampaign } from '../../src/engine/state/create';
import { FakeStAdapter } from '../../src/st/fake';
import { getSettings, updateSettings } from '../../src/settings';
import { clearFailedFrames, renderChrome } from '../../src/ui/device/chrome';
import { pickSkin } from '../../src/ui/device/skins';
import { createShell, type ShellApi } from '../../src/ui/shell/shell';
import { loadCore } from '../helpers/world';
import { readFileSync } from 'node:fs';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
let shells: ShellApi[] = [];
beforeEach(() => clearFailedFrames());
afterEach(() => {
  shells.forEach((s) => s.destroy());
  shells = [];
  document.body.innerHTML = '';
});

const skin = (id: string): Entry => reg.deviceSkins.get(id)!;
const image: Entry = {
  id: 'framed', name: 'Framed', description: 'd', kind: 'image', frameImage: 'content/core/art/device/framed.png',
  frameSize: { w: 1000, h: 1600 }, screenRect: { x: 100, y: 240, w: 800, h: 1200 }, ledColor: '#ff3b1f', accent: '#e8ad0c', label: 'FRAMED',
};

/** A bare device: the three elements `renderChrome` works on. */
function parts() {
  const device = document.createElement('div');
  const chrome = document.createElement('div');
  const screen = document.createElement('div');
  device.append(chrome, screen);
  document.body.append(device);
  return { device, chrome, screen };
}

describe('renderChrome: css presets', () => {
  it('ccp_standard: two slotted screws, two rubber bumpers, the VOID IF OPENED sticker and a barcode', () => {
    const p = parts();
    renderChrome(p.chrome, p.screen, p.device, skin('ccp_standard'));
    expect(p.chrome.querySelectorAll('.alius-screw')).toHaveLength(2);
    expect(p.chrome.querySelectorAll('.alius-bumper')).toHaveLength(2);
    expect(p.chrome.querySelector('.alius-sticker')!.textContent).toBe('VOID IF OPENED');
    expect(p.chrome.querySelector('.alius-barcode')).not.toBeNull();
    expect(p.device.dataset.skin).toBe('ccp_standard');
    expect(p.device.dataset.preset).toBe('ccp_standard');
    expect(p.device.dataset.kind).toBe('css');
  });

  it('kestrel: a hazard stripe and six hex bolts', () => {
    const p = parts();
    renderChrome(p.chrome, p.screen, p.device, skin('kestrel'));
    expect(p.chrome.querySelectorAll('.alius-hazard')).toHaveLength(1);
    expect(p.chrome.querySelectorAll('.alius-bolt')).toHaveLength(6);
    expect(p.chrome.querySelector('.alius-screw')).toBeNull();
  });

  it('vesper: the light ring and no screws', () => {
    const p = parts();
    renderChrome(p.chrome, p.screen, p.device, skin('vesper'));
    expect(p.chrome.querySelectorAll('.alius-ring')).toHaveLength(1);
    expect(p.chrome.querySelector('.alius-screw')).toBeNull();
    expect(p.chrome.querySelector('.alius-bolt')).toBeNull();
  });

  it('the engraved label is the skin label and is aria-hidden', () => {
    const p = parts();
    renderChrome(p.chrome, p.screen, p.device, skin('kestrel'));
    const label = p.chrome.querySelector('.alius-device-label')!;
    expect(label.textContent).toBe('KESTREL-WARD · KW-7');
    expect(label.getAttribute('aria-hidden')).toBe('true');
    expect(p.chrome.getAttribute('aria-hidden')).toBe('true');
  });

  it('a skin without a label engraves its name', () => {
    const p = parts();
    const { label: _drop, ...bare } = skin('kestrel');
    renderChrome(p.chrome, p.screen, p.device, bare as Entry);
    expect(p.chrome.querySelector('.alius-device-label')!.textContent).toBe('Kestrel-Ward KW-7');
  });

  it('the LED and the accent use the skin colours', () => {
    const p = parts();
    renderChrome(p.chrome, p.screen, p.device, skin('vesper'));
    expect(p.chrome.querySelector('.alius-led')).not.toBeNull();
    expect(p.device.style.getPropertyValue('--device-led')).toBe('#3fd6c4');
    expect(p.device.style.getPropertyValue('--device-accent')).toBe('#8fb9b2');
  });

  it('switching skin replaces the decor instead of adding to it', () => {
    const p = parts();
    renderChrome(p.chrome, p.screen, p.device, skin('ccp_standard'));
    renderChrome(p.chrome, p.screen, p.device, skin('kestrel'));
    expect(p.chrome.querySelector('.alius-sticker')).toBeNull();
    expect(p.chrome.querySelectorAll('.alius-bolt')).toHaveLength(6);
    expect(p.device.dataset.skin).toBe('kestrel');
  });

  it('a css skin clears what an image skin put on the screen', () => {
    const p = parts();
    renderChrome(p.chrome, p.screen, p.device, image);
    renderChrome(p.chrome, p.screen, p.device, skin('vesper'));
    expect(p.screen.style.position).toBe('');
    expect(p.screen.style.left).toBe('');
    expect(p.device.style.getPropertyValue('--device-ratio')).toBe('');
    expect(p.chrome.querySelector('.alius-device-frame')).toBeNull();
  });

  it('grain and grime filters are inline SVG with ids unique per render', () => {
    const a = parts();
    const b = parts();
    renderChrome(a.chrome, a.screen, a.device, skin('kestrel'));
    renderChrome(b.chrome, b.screen, b.device, skin('kestrel'));
    renderChrome(a.chrome, a.screen, a.device, skin('ccp_standard'));
    const ids = [...document.querySelectorAll('filter')].map((f) => f.id);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of document.querySelectorAll('filter')) {
      expect(document.querySelector(`[filter="url(#${f.id})"]`), f.id).not.toBeNull();
    }
  });

  it('builds no markup from strings: the chrome has no script, no remote url and no html in text', () => {
    const p = parts();
    for (const id of ['ccp_standard', 'kestrel', 'vesper']) renderChrome(p.chrome, p.screen, p.device, skin(id));
    expect(p.chrome.innerHTML).not.toMatch(/<script|https?:|\/\//);
  });

  it('a label with markup is shown as text', () => {
    const p = parts();
    renderChrome(p.chrome, p.screen, p.device, { ...skin('vesper'), label: '<img src=x onerror=alert(1)>' });
    expect(p.chrome.querySelector('img')).toBeNull();
    expect(p.chrome.querySelector('.alius-device-label')!.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('renderChrome: image skins', () => {
  it('positions the screen at 10/15/80/75 % of the frame and keeps the frame ratio', () => {
    const p = parts();
    renderChrome(p.chrome, p.screen, p.device, image, (path) => `/ext/${path}`);
    expect(p.screen.style.position).toBe('absolute');
    expect([p.screen.style.left, p.screen.style.top, p.screen.style.width, p.screen.style.height]).toEqual(['10%', '15%', '80%', '75%']);
    expect(p.device.style.getPropertyValue('--device-ratio')).toBe('1000 / 1600');
    expect(p.device.dataset.kind).toBe('image');
    const frame = p.chrome.querySelector<HTMLImageElement>('img.alius-device-frame')!;
    expect(frame.getAttribute('src')).toBe('/ext/content/core/art/device/framed.png');
    expect(frame.getAttribute('alt')).toBe('');
  });

  it('keeps the same percentages at a 1440 px and a 900 px wide host', () => {
    const boxes: string[][] = [];
    for (const width of [1440, 900]) {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      const p = parts();
      p.device.style.width = `${width}px`;
      renderChrome(p.chrome, p.screen, p.device, image, (path) => path);
      boxes.push([p.screen.style.left, p.screen.style.top, p.screen.style.width, p.screen.style.height]);
    }
    expect(boxes[0]).toEqual(['10%', '15%', '80%', '75%']);
    expect(boxes[1]).toEqual(boxes[0]);
  });

  it('draws the overlay texture with its blend mode and opacity', () => {
    const p = parts();
    renderChrome(p.chrome, p.screen, p.device, { ...image, overlay: { image: 'content/core/art/device/grime.png', blend: 'multiply', opacity: 0.4 } }, (path) => `/ext/${path}`);
    const o = p.chrome.querySelector<HTMLElement>('.alius-device-overlay')!;
    expect(o.style.opacity).toBe('0.4');
    expect(o.style.mixBlendMode).toBe('multiply');
    expect(o.style.backgroundImage).toContain('/ext/content/core/art/device/grime.png');
  });

  it('a path with a quote or a backslash cannot break out of the css url()', () => {
    const p = parts();
    renderChrome(p.chrome, p.screen, p.device, { ...image, overlay: { image: 'a"b\\c.png', blend: 'multiply', opacity: 0.4 } }, (path) => `/ext/${path}`);
    const style = p.chrome.querySelector<HTMLElement>('.alius-device-overlay')!.getAttribute('style') ?? '';
    expect(style).toContain('%22');
    expect(style).toContain('%5C');
    expect(style.match(/"/g) ?? []).toHaveLength(2); // only the url("…") delimiters remain
  });

  it('a frame image that fails shows the ccp_standard chrome', () => {
    const p = parts();
    renderChrome(p.chrome, p.screen, p.device, image, (path) => path);
    p.chrome.querySelector('img.alius-device-frame')!.dispatchEvent(new Event('error'));
    expect(p.device.dataset.skin).toBe('ccp_standard');
    expect(p.device.dataset.kind).toBe('css');
    expect(p.chrome.querySelectorAll('.alius-screw')).toHaveLength(2);
    expect(p.screen.style.position).toBe('');
  });

  it('a frame that failed is remembered: dressing again does not request it again', () => {
    const p = parts();
    renderChrome(p.chrome, p.screen, p.device, image, (path) => path);
    p.chrome.querySelector('img.alius-device-frame')!.dispatchEvent(new Event('error'));
    expect(p.device.dataset.skin).toBe('ccp_standard');
    renderChrome(p.chrome, p.screen, p.device, image, (path) => path);
    expect(p.chrome.querySelector('img.alius-device-frame')).toBeNull();
    expect(p.device.dataset.skin).toBe('ccp_standard');
    expect(p.screen.style.position).toBe('');
    // another device gets the same answer without a request
    const q = parts();
    renderChrome(q.chrome, q.screen, q.device, image, (path) => path);
    expect(q.chrome.querySelector('img.alius-device-frame')).toBeNull();
    expect(q.device.dataset.skin).toBe('ccp_standard');
  });

  it('a frame that never failed is still requested', () => {
    const p = parts();
    renderChrome(p.chrome, p.screen, p.device, image, (path) => path);
    expect(p.chrome.querySelector('img.alius-device-frame')).not.toBeNull();
  });

  it('an image skin without an assetUrl falls back to ccp_standard at once', () => {
    const p = parts();
    renderChrome(p.chrome, p.screen, p.device, image);
    expect(p.device.dataset.skin).toBe('ccp_standard');
  });
});

describe('the shell wears the skin', () => {
  function shellWith(skinOf: (st: FakeStAdapter) => Entry) {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const state = createCampaign({ seed: 1, commanderName: 'Vale' });
    const shell = createShell({ st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), skin: () => ({ skin: skinOf(st) }) });
    shells.push(shell);
    return { st, shell };
  }
  const device = () => document.querySelector<HTMLElement>('#alius-shell .alius-device')!;

  it('the skin follows SYS without reopening', () => {
    const { st, shell } = shellWith((s) => pickSkin(null, reg, getSettings(s).deviceSkin));
    shell.open();
    expect(device().dataset.skin).toBe('ccp_standard');
    updateSettings(st, { deviceSkin: 'vesper' });
    shell.refresh();
    expect(device().dataset.skin).toBe('vesper');
    expect(device().querySelector('.alius-ring')).not.toBeNull();
  });

  it('a settings change re-applies the casing', () => {
    const { st, shell } = shellWith((s) => pickSkin(null, reg, getSettings(s).deviceSkin));
    shell.open();
    updateSettings(st, { deviceSkin: 'kestrel' });
    shell.setPalette('green'); // goes through applySettings, as every SYS change does
    expect(device().dataset.skin).toBe('kestrel');
  });

  it.each(['ccp_standard', 'kestrel', 'vesper'])('the tabs inside the device still work under %s', (id) => {
    const { shell } = shellWith(() => skin(id));
    shell.open();
    shell.showScreen('pda');
    expect(device().dataset.skin).toBe(id);
    for (const [label, tab] of [['SQUAD', 'squad'], ['COMMS', 'comms'], ['SYS', 'sys']]) {
      document.querySelector<HTMLElement>(`#alius-shell #alius-tab-${tab}`)!.click();
      expect(document.querySelector('#alius-shell .alius-tab[aria-selected="true"]')!.textContent).toBe(label);
    }
    // the casing never sits on top of the controls
    expect(device().querySelector('.alius-device-chrome')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('without a skin dep the shell wears the built-in ccp_standard', () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const shell = createShell({ st, getState: () => null, getLoad: () => ({ kind: 'none' }) });
    shells.push(shell);
    shell.open();
    expect(device().dataset.skin).toBe('ccp_standard');
  });

  it('a refresh does not dress the device again: the decor nodes are the same, and a changed skin is dressed', () => {
    const { st, shell } = shellWith((s) => pickSkin(null, reg, getSettings(s).deviceSkin));
    shell.open();
    const led = device().querySelector('.alius-led');
    const layers = [...device().querySelectorAll('svg.alius-fx')];
    expect(layers.length).toBeGreaterThan(0);
    shell.refresh();
    shell.refresh();
    expect(device().querySelector('.alius-led')).toBe(led);
    expect([...device().querySelectorAll('svg.alius-fx')]).toEqual(layers);
    updateSettings(st, { deviceSkin: 'kestrel' });
    shell.refresh();
    expect(device().dataset.skin).toBe('kestrel');
    expect(device().querySelector('.alius-led')).not.toBe(led);
  });

  it('a broken frame does not flip the layout on every refresh', () => {
    const framed: Entry = { id: 'framed', name: 'Framed', description: 'd', kind: 'image', frameImage: 'content/core/art/device/framed.png', frameSize: { w: 1000, h: 1600 }, screenRect: { x: 100, y: 240, w: 800, h: 1200 }, ledColor: '#ff3b1f', accent: '#e8ad0c' };
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const state = createCampaign({ seed: 1, commanderName: 'Vale' });
    const shell = createShell({ st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), skin: () => ({ skin: framed, assetUrl: (p) => p }) });
    shells.push(shell);
    shell.open();
    const frame = device().querySelector('img.alius-device-frame')!;
    expect(frame).not.toBeNull();
    frame.dispatchEvent(new Event('error'));
    expect(device().dataset.skin).toBe('ccp_standard');
    for (let i = 0; i < 3; i++) {
      shell.refresh();
      expect(device().querySelector('img.alius-device-frame')).toBeNull(); // no new request
      expect(device().dataset.skin).toBe('ccp_standard');
      expect(device().querySelector<HTMLElement>('.alius-device-screen')!.style.position).toBe('');
    }
  });

  it('a refresh keeps the casing and does not rebuild the device', () => {
    const { shell } = shellWith(() => skin('kestrel'));
    shell.open();
    const before = device();
    shell.refresh();
    expect(device()).toBe(before);
    expect(device().querySelectorAll('.alius-bolt')).toHaveLength(6);
  });
});

describe('the ccp_standard top strip (css/17-skins.css)', () => {
  const css = readFileSync('css/17-skins.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const body = (sel: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) => m[1].trim() === sel)?.[2] ?? '';
  const px = (s: string, prop: string) => Number(new RegExp(`${prop}:\\s*(\\d+)px`).exec(s)?.[1]);
  const CCP = '#alius-shell .alius-device[data-preset="ccp_standard"]';

  it('the model label is centred and the decor sits clear of it (barcode and sticker further out than the label)', () => {
    const base = '#alius-shell .alius-device-label';
    expect(body(base)).toMatch(/left:\s*50%/);
    expect(body(base)).toMatch(/translateX\(-50%\)/);
    expect(px(body(`${CCP} .alius-barcode`), 'right')).toBeGreaterThanOrEqual(200);
    expect(px(body(`${CCP} .alius-sticker`), 'right')).toBeGreaterThanOrEqual(90);
    expect(px(body(`${CCP} .alius-sticker`), 'right')).toBeLessThan(px(body(`${CCP} .alius-barcode`), 'right'));
  });

  it('on a narrow screen the sticker, barcode, grille and screws are dropped instead of overlapping the label', () => {
    const media = /@media\s*\(max-width:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/.exec(css);
    expect(media, 'a max-width media block').not.toBeNull();
    expect(Number(media![1])).toBeGreaterThanOrEqual(600);
    for (const cls of ['.alius-sticker', '.alius-barcode', '.alius-grille', '.alius-screw']) expect(media![2]).toContain(cls);
    expect(media![2]).toMatch(/display:\s*none/);
  });
});
