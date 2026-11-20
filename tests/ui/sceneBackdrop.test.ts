// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { quartersOf } from '../../src/engine/backdrops';
import type { CampaignState } from '../../src/engine/state/types';
import type { SceneController } from '../../src/scene/sceneController';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import { h } from '../../src/ui/dom';
import { renderSceneScreen, resetBackdropCache } from '../../src/ui/scene/sceneScreen';
import '../../src/engine/actions/immersion';
import { campaign, errors, loadCore, run } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  document.body.innerHTML = '';
  resetBackdropCache();
  vi.useRealTimers();
});
const ANN = 'unit_ann';
const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

/** A loader that fails the files in `broken` and records every request. */
function loader(broken: string[] = []) {
  const asked: string[] = [];
  const load = vi.fn(async (url: string) => {
    asked.push(url);
    return !broken.some((b) => url.includes(b));
  });
  return { load, asked };
}

function setup(opts: { locationId?: string; slot?: CampaignState['slot']; broken?: string[]; settings?: Partial<AliusSettings>; tweak?: (s: CampaignState) => void; loadImage?: (url: string) => Promise<boolean> } = {}) {
  let state = campaign(reg, 4);
  state.slot = opts.slot ?? 'morning';
  opts.tweak?.(state);
  const r = run(state, reg, { type: 'scene/start', payload: { locationId: opts.locationId ?? 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  state = r.state;
  const controller = {
    send: vi.fn(async () => {}), propose: vi.fn(), answer: vi.fn(), end: vi.fn(async () => {}), edit: vi.fn(async () => {}),
    stop: vi.fn(), onEdited: vi.fn(), transcript: () => [], onSwipe: vi.fn(), resume: vi.fn(), idle: vi.fn(), dispose: vi.fn(), start: vi.fn(),
  } as unknown as SceneController;
  const { load, asked } = loader(opts.broken);
  const settings = { ...DEFAULT_SETTINGS, typingSpeed: 0, ...opts.settings };
  const host = h('div');
  document.body.append(host);
  const screen = renderSceneScreen(host, {
    controller, getState: () => state, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }),
    settings: () => settings, onEnded: vi.fn(), assetUrl: (p) => `ext/${p}`, loadImage: opts.loadImage ?? load,
  });
  const root = () => host.querySelector<HTMLElement>('.alius-scene')!;
  const image = () => host.querySelector<HTMLElement>('.alius-scene-backdrop')?.style.backgroundImage ?? '';
  return { screen, root, image, asked, load, settings, setState: (s: CampaignState) => { state = s; }, state: () => state, host };
}

describe('scene backdrop (P10c)', () => {
  it('shows the first candidate that loads, full-bleed', async () => {
    const t = setup();
    await flush();
    expect(t.image()).toContain('ext/content/core/art/backdrops/loc_mess_hall.webp');
    expect(t.root().dataset.backdrop).toBe('image');
    expect(t.host.querySelector('pre.alius-ascii')).toBeNull();
  });

  it('a slot-specific file gets no light; a day file at night gets the night light', async () => {
    const roof = setup({ locationId: 'roof', slot: 'night' });
    await flush();
    expect(roof.image()).toContain('loc_roof_night.webp');
    expect(roof.root().dataset.light).toBeUndefined();
    document.body.innerHTML = '';
    const medbay = setup({ locationId: 'medbay', slot: 'night' });
    await flush();
    expect(medbay.image()).toContain('loc_medbay.webp');
    expect(medbay.root().dataset.light).toBe('night');
    document.body.innerHTML = '';
    const mess = setup({ slot: 'evening' });
    await flush();
    expect(mess.root().dataset.light).toBe('evening');
  });

  it('a broken file falls through to the next candidate; nothing loads → the ASCII stage, no error', async () => {
    const t = setup({ locationId: 'roof', slot: 'night', broken: ['loc_roof_night'] });
    await flush();
    expect(t.asked.map((u) => u.split('/').pop())).toEqual(['loc_roof_night.webp', 'loc_roof_day.webp']);
    expect(t.image()).toContain('loc_roof_day.webp');
    expect(t.root().dataset.light).toBe('night');
    document.body.innerHTML = '';
    const none = setup({ locationId: 'garage', broken: ['loc_garage'] });
    await flush();
    expect(none.root().dataset.backdrop).toBe('ascii');
    expect(none.host.querySelector('pre.alius-ascii')).not.toBeNull();
    expect(none.image()).toBe('');
  });

  it('her quarters show her room style; a new style redraws, the same candidates do not reload', async () => {
    const t = setup({ locationId: 'quarters_unit' });
    await flush();
    const own = String(quartersOf(t.state(), reg, ANN)!.background);
    expect(t.image()).toContain(own);
    const other = [...reg.quartersStyles.values()].find((e) => e.background !== own)!;
    const calls = t.load.mock.calls.length;
    t.screen.refresh();
    await flush();
    expect(t.load.mock.calls.length).toBe(calls);
    const moved = run(t.state(), reg, { type: 'squad/set_quarters', payload: { unitId: ANN, styleId: String(other.id) } });
    expect(errors(moved.events)).toEqual([]);
    t.setState(moved.state);
    t.screen.refresh();
    await flush();
    expect(t.image()).toContain(String(other.background));
  });

  it('the pointer pans the background; under reduced motion it stays centred', async () => {
    const t = setup();
    await flush();
    expect(t.root().style.getPropertyValue('--alius-pan')).toBe('0.5');
    Object.defineProperty(t.root(), 'getBoundingClientRect', { value: () => ({ left: 0, width: 1000, top: 0, height: 500, right: 1000, bottom: 500 }) });
    t.root().dispatchEvent(new MouseEvent('pointermove', { clientX: 900, bubbles: true }));
    expect(t.root().style.getPropertyValue('--alius-pan')).toBe('0.9');
    document.body.innerHTML = '';
    const still = setup({ settings: { reducedMotion: true } });
    await flush();
    Object.defineProperty(still.root(), 'getBoundingClientRect', { value: () => ({ left: 0, width: 1000, top: 0, height: 500, right: 1000, bottom: 500 }) });
    still.root().dispatchEvent(new MouseEvent('pointermove', { clientX: 900, bubbles: true }));
    expect(still.root().style.getPropertyValue('--alius-pan')).toBe('0.5');
  });

  it('knee-length sprites reach down behind the transcript, measured from the layout (image mode only)', async () => {
    const t = setup();
    await flush();
    const rect = (top: number, bottom: number) => () => ({ top, bottom, left: 0, right: 1000, width: 1000, height: bottom - top, x: 0, y: top, toJSON() {} });
    Object.defineProperty(t.host.querySelector('.alius-stage')!, 'getBoundingClientRect', { value: rect(50, 600) });
    Object.defineProperty(t.host.querySelector('.alius-transcript')!, 'getBoundingClientRect', { value: rect(640, 900) });
    t.screen.refresh();
    expect(t.host.querySelector<HTMLElement>('.alius-sprites')!.style.bottom).toBe('-54px');
    document.body.innerHTML = '';
    const ascii = setup({ locationId: 'garage', broken: ['loc_garage'] });
    await flush();
    ascii.screen.refresh();
    expect(ascii.host.querySelector<HTMLElement>('.alius-sprites')!.style.bottom).toBe('');
  });

  it('review fixes: the ASCII stage shows while a picture loads; a new scene does not inherit the last one\'s image mode', async () => {
    let release!: (ok: boolean) => void;
    const t = setup({ loadImage: () => new Promise<boolean>((r) => { release = r; }) });
    expect(t.root().dataset.backdrop).toBe('ascii');
    expect(t.host.querySelector('pre.alius-ascii')).not.toBeNull();
    await flush();
    release(true);
    await flush();
    expect(t.root().dataset.backdrop).toBe('image');
    // the scene ends and a new one starts at an uncached place: no stale image mode or light while it loads
    const ended = run(t.state(), reg, { type: 'scene/end', payload: {} });
    expect(errors(ended.events)).toEqual([]);
    t.setState(ended.state);
    t.screen.refresh();
    expect(t.root().dataset.backdrop).toBeUndefined();
    const again = run(t.state(), reg, { type: 'scene/start', payload: { locationId: 'garage', participants: [ANN], origin: 'event', startIndex: 0 } });
    expect(errors(again.events)).toEqual([]);
    t.setState(again.state);
    t.screen.refresh();
    expect(t.root().dataset.backdrop).toBe('ascii');
    expect(t.root().dataset.light).toBeUndefined();
  });

  it('review fixes: a load overtaken by a newer one, or by the end of the screen, paints nothing', async () => {
    const releases: Array<(ok: boolean) => void> = [];
    const t = setup({ locationId: 'quarters_unit', loadImage: () => new Promise<boolean>((r) => { releases.push(r); }) });
    const other = [...reg.quartersStyles.values()].find((e) => e.id !== quartersOf(t.state(), reg, ANN)!.id)!;
    t.setState(run(t.state(), reg, { type: 'squad/set_quarters', payload: { unitId: ANN, styleId: String(other.id) } }).state);
    t.screen.refresh();
    await flush();
    releases[1](true);                // the newer style loads first
    await flush();
    releases[0](true);                // the old one arrives late
    await flush();
    expect(t.image()).toContain(String(other.background));
    t.screen.dispose();
    expect(() => releases.forEach((r) => r(true))).not.toThrow();
  });

  it('review fixes: a rejecting loader is a failure (the ASCII stays); a known picture shows at once on the next screen; a failure is retried after 30 s', async () => {
    const rejecting = setup({ loadImage: async () => { throw new Error('boom'); } });
    await flush();
    expect(rejecting.root().dataset.backdrop).toBe('ascii');
    document.body.innerHTML = '';
    resetBackdropCache();
    const first = setup();
    await flush();
    expect(first.root().dataset.backdrop).toBe('image');
    document.body.innerHTML = '';
    const second = setup();                                 // same file, already known: no flash, no new request
    expect(second.root().dataset.backdrop).toBe('image');
    expect(second.load).not.toHaveBeenCalled();
    document.body.innerHTML = '';
    resetBackdropCache();
    vi.useFakeTimers({ toFake: ['Date'] });
    const failed = setup({ broken: ['loc_garage'], locationId: 'garage' });
    await flush();
    document.body.innerHTML = '';
    const soon = setup({ locationId: 'garage' });
    await flush();
    expect(soon.load).not.toHaveBeenCalled();                // within 30 s the failure is remembered
    vi.setSystemTime(Date.now() + 31_000);
    document.body.innerHTML = '';
    const later = setup({ locationId: 'garage' });
    await flush();
    expect(later.load).toHaveBeenCalled();
    expect(later.root().dataset.backdrop).toBe('image');
    void failed;
  });

  it('review fixes: switching Reduce motion mid-scene stops (and re-centres) the pan', async () => {
    const t = setup();
    await flush();
    Object.defineProperty(t.root(), 'getBoundingClientRect', { value: () => ({ left: 0, width: 1000, top: 0, height: 500, right: 1000, bottom: 500 }) });
    t.root().dispatchEvent(new MouseEvent('pointermove', { clientX: 900, bubbles: true }));
    expect(t.root().style.getPropertyValue('--alius-pan')).toBe('0.9');
    t.settings.reducedMotion = true;
    t.root().dispatchEvent(new MouseEvent('pointermove', { clientX: 100, bubbles: true }));
    expect(t.root().style.getPropertyValue('--alius-pan')).toBe('0.5');
  });

  it('review fixes: the HUD is observed, so a pulse that wraps it moves the sprites', async () => {
    const observed: Element[] = [];
    vi.stubGlobal('ResizeObserver', class { observe(el: Element) { observed.push(el); } disconnect() {} });
    try {
      const t = setup();
      await flush();
      expect(observed).toContain(t.root());
      expect(observed).toContain(t.host.querySelector('.alius-hud'));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
