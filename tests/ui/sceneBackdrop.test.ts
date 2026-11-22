// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { quartersOf } from '../../src/engine/backdrops';
import type { CampaignState } from '../../src/engine/state/types';
import type { SceneController } from '../../src/scene/sceneController';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import { h } from '../../src/ui/dom';
import { renderSceneScreen, resetBackdropCache } from '../../src/ui/scene/sceneScreen';
import { resetSceneStage } from '../../src/ui/scene/stage';
import '../../src/engine/actions/immersion';
import { campaign, errors, loadCore, run } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  document.body.innerHTML = '';
  resetBackdropCache();
  resetSceneStage(); // scene ids repeat between tests as they do between campaigns
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
    send: vi.fn(async () => true), propose: vi.fn(), answer: vi.fn(), end: vi.fn(async () => {}), edit: vi.fn(async () => {}),
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

  it('the pointer no longer pans the background (P10e: the right mouse button looks around, tests/ui/stage/look.test.ts); the view starts centred', async () => {
    const t = setup();
    await flush();
    expect(t.root().style.getPropertyValue('--alius-pan')).toBe('0.5');
    Object.defineProperty(t.root(), 'getBoundingClientRect', { value: () => ({ left: 0, width: 1000, top: 0, height: 500, right: 1000, bottom: 500 }) });
    t.root().dispatchEvent(new MouseEvent('pointermove', { clientX: 900, bubbles: true }));
    expect(t.root().style.getPropertyValue('--alius-pan')).toBe('0.5');
  });

  it('knee-length sprites are sized by CSS over the whole frame (P10e replaces the measured tuck behind the transcript)', async () => {
    const t = setup();
    await flush();
    expect(t.host.querySelector('.alius-layer-sprites .alius-sprite')).not.toBeNull();
    expect(t.host.querySelector<HTMLElement>('.alius-sprites')!.style.bottom).toBe(''); // nothing is measured from the layout any more
    const css = readFileSync('css/62-stage.css', 'utf8');
    expect(css).toMatch(/\.alius-sprite \{[^}]*top: 3vh;[^}]*height: 110vh;/s);
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

  it('review fixes: switching Reduce motion mid-scene turns the easing off; dragging works either way', async () => {
    const t = setup();
    await flush();
    const frame = t.host.querySelector<HTMLElement>('.alius-layer-frame')!;
    Object.defineProperty(frame, 'getBoundingClientRect', { value: () => ({ left: 0, width: 1000, top: 0, height: 500, right: 1000, bottom: 500 }) });
    const ptr = (type: string, x: number) => frame.dispatchEvent(new MouseEvent(type, { clientX: x, button: 2, bubbles: true }));
    ptr('pointerdown', 500);
    ptr('pointermove', 400);
    ptr('pointerup', 400);
    expect(Number(t.root().style.getPropertyValue('--alius-pan'))).toBeCloseTo(0.6, 6);
    expect(t.root().classList.contains('alius-look-still')).toBe(false);
    t.settings.reducedMotion = true;
    ptr('pointerdown', 500);
    expect(t.root().classList.contains('alius-look-still')).toBe(true);
    ptr('pointermove', 400);
    ptr('pointerup', 400);
    expect(Number(t.root().style.getPropertyValue('--alius-pan'))).toBeCloseTo(0.7, 6);
  });

  it('the looked-around view survives a redraw and starts centred in a new scene', async () => {
    const t = setup();
    await flush();
    const frame = t.host.querySelector<HTMLElement>('.alius-layer-frame')!;
    Object.defineProperty(frame, 'getBoundingClientRect', { value: () => ({ left: 0, width: 1000, top: 0, height: 500, right: 1000, bottom: 500 }) });
    const ptr = (type: string, x: number) => frame.dispatchEvent(new MouseEvent(type, { clientX: x, button: 2, bubbles: true }));
    ptr('pointerdown', 500);
    ptr('pointermove', 300);
    ptr('pointerup', 300);
    expect(t.root().style.getPropertyValue('--alius-pan')).toBe('0.7');
    t.screen.refresh();
    expect(t.root().style.getPropertyValue('--alius-pan')).toBe('0.7');
    const ended = run(t.state(), reg, { type: 'scene/end', payload: {} });
    t.setState(ended.state);
    t.screen.refresh();
    const again = run(t.state(), reg, { type: 'scene/start', payload: { locationId: 'garage', participants: [ANN], origin: 'event', startIndex: 0 } });
    t.setState(again.state);
    t.screen.refresh();
    expect(t.root().style.getPropertyValue('--alius-pan')).toBe('0.5');
  });
});
