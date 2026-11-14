// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Unit } from '../../src/engine/state/types';
import { FakeStAdapter } from '../../src/st/fake';
import { clearPortraitCache, unitPortrait } from '../../src/ui/portrait/portrait';
import { renderCommsTab } from '../../src/ui/comms/commsTab';
import { renderSquadTab } from '../../src/ui/squad/squadTab';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { campaign, loadCore } from '../helpers/world';

/** A fake 2D context that records what is drawn; `getImageData` hands back a flat grey image. */
function fakeContext(over: { getImageData?: () => unknown } = {}) {
  const calls = { drawImage: 0, putImageData: 0, getImageData: 0 };
  const ctx = {
    drawImage: () => { calls.drawImage++; },
    getImageData: (_x: number, _y: number, w: number, h: number) => {
      calls.getImageData++;
      if (over.getImageData) return over.getImageData();
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(128) };
    },
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: () => { calls.putImageData++; },
  };
  return { ctx, calls };
}

let getContext: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  clearPortraitCache();
  getContext = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(getContext as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,DITHERED');
  // images in jsdom never load: report them as loaded so the dither runs at once
  Object.defineProperty(HTMLImageElement.prototype, 'complete', { configurable: true, get: () => true });
  Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => 200 });
  Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', { configurable: true, get: () => 300 });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (HTMLImageElement.prototype as unknown as Record<string, unknown>).complete;
  delete (HTMLImageElement.prototype as unknown as Record<string, unknown>).naturalWidth;
  delete (HTMLImageElement.prototype as unknown as Record<string, unknown>).naturalHeight;
  document.body.innerHTML = '';
});

const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

async function named(): Promise<{ st: FakeStAdapter; unit: Unit; other: Unit }> {
  const reg = await loadCore();
  const state = campaign(reg, 4);
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  return { st, unit: state.squad[0], other: state.squad[1] };
}
const img = (el: HTMLElement | null): HTMLImageElement => el as HTMLImageElement;
const O = { palette: 'amber' as const, dither: true };

describe('unitPortrait', () => {
  it('a grunt keeps its ASCII portrait', async () => {
    const { st, unit } = await named();
    const grunt = { ...unit, kind: 'grunt' as const, asciiPortrait: '(o_o)' };
    const el = unitPortrait(st, grunt, O)!;
    expect(el.tagName).toBe('PRE');
    expect(el.textContent).toBe('(o_o)');
    expect(getContext).not.toHaveBeenCalled();
    expect(unitPortrait(st, { ...grunt, asciiPortrait: undefined }, O)).toBeNull();
  });

  it('a unit without a card has no portrait', async () => {
    const { st, unit } = await named();
    expect(unitPortrait(st, { ...unit, cardRef: undefined }, O)).toBeNull();
  });

  it('dither off gives the plain image and never touches a canvas', async () => {
    const { st, unit } = await named();
    const el = img(unitPortrait(st, unit, { palette: 'amber', dither: false }));
    await flush();
    expect(el.tagName).toBe('IMG');
    expect(el.getAttribute('src')).toBe(st.getAvatarUrl(unit.cardRef!));
    expect(getContext).not.toHaveBeenCalled();
    expect(el.classList.contains('alius-portrait-dithered')).toBe(false);
  });

  it('the dithered portrait replaces the image once ready, drawn from the top centre', async () => {
    const { st, unit } = await named();
    const { ctx, calls } = fakeContext();
    getContext.mockReturnValue(ctx);
    const el = img(unitPortrait(st, unit, O));
    await flush();
    expect(el.getAttribute('src')).toBe('data:image/png;base64,DITHERED');
    expect(el.classList.contains('alius-portrait-dithered')).toBe(true);
    expect(calls).toEqual({ drawImage: 1, getImageData: 1, putImageData: 1 });
    expect(el.getAttribute('alt')).toBe(unit.displayName);
  });

  it('uses the neutral sprite when the card has one', async () => {
    const { st, unit } = await named();
    st.sprites.set(`${unit.cardRef}:neutral`, '/sprites/neutral.png');
    const { ctx } = fakeContext();
    getContext.mockReturnValue(ctx);
    const drawn: unknown[] = [];
    ctx.drawImage = ((source: HTMLImageElement) => { drawn.push(source.getAttribute('src')); }) as never;
    unitPortrait(st, unit, O);
    await flush();
    expect(drawn).toEqual(['/sprites/neutral.png']);
  });

  it('the dithered portrait is cached per unit, palette and size', async () => {
    const { st, unit, other } = await named();
    const { ctx, calls } = fakeContext();
    getContext.mockReturnValue(ctx);
    unitPortrait(st, unit, O);
    await flush();
    expect(calls.drawImage).toBe(1);
    const again = img(unitPortrait(st, unit, O));
    expect(again.getAttribute('src')).toBe('data:image/png;base64,DITHERED'); // at once, no second draw
    await flush();
    expect(calls.drawImage).toBe(1);
    unitPortrait(st, other, O); // another unit
    await flush();
    expect(calls.drawImage).toBe(2);
    unitPortrait(st, unit, { ...O, size: 48 }); // another size
    await flush();
    expect(calls.drawImage).toBe(3);
  });

  it('a palette change makes a new one', async () => {
    const { st, unit } = await named();
    const { ctx, calls } = fakeContext();
    getContext.mockReturnValue(ctx);
    unitPortrait(st, unit, O);
    await flush();
    unitPortrait(st, unit, { palette: 'green', dither: true });
    await flush();
    expect(calls.drawImage).toBe(2);
  });

  it('a tainted canvas falls back to the plain image and is not retried for 30 s', async () => {
    vi.useFakeTimers();
    const { st, unit } = await named();
    const { ctx } = fakeContext({ getImageData: () => { throw new DOMException('tainted', 'SecurityError'); } });
    getContext.mockReturnValue(ctx);
    const first = img(unitPortrait(st, unit, O));
    await vi.advanceTimersByTimeAsync(0);
    expect(first.getAttribute('src')).toBe(st.getAvatarUrl(unit.cardRef!));
    expect(first.classList.contains('alius-portrait-dithered')).toBe(false);
    expect(getContext).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(29_000);
    const second = img(unitPortrait(st, unit, O));
    await vi.advanceTimersByTimeAsync(0);
    expect(second.getAttribute('src')).toBe(st.getAvatarUrl(unit.cardRef!));
    expect(getContext).toHaveBeenCalledTimes(1); // not touched within 30 s

    await vi.advanceTimersByTimeAsync(1_500);
    unitPortrait(st, unit, O);
    await vi.advanceTimersByTimeAsync(0);
    expect(getContext).toHaveBeenCalledTimes(2); // tries again after 30 s
  });

  it('no canvas: the plain image, no throw, and the failure is remembered', async () => {
    vi.useFakeTimers();
    const { st, unit } = await named();
    getContext.mockReturnValue(null);
    expect(() => unitPortrait(st, unit, O)).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    const el = img(unitPortrait(st, unit, O));
    await vi.advanceTimersByTimeAsync(0);
    expect(el.getAttribute('src')).toBe(st.getAvatarUrl(unit.cardRef!));
    expect(getContext).toHaveBeenCalledTimes(1);
  });

  it('a canvas that throws on creation is also a plain image', async () => {
    const { st, unit } = await named();
    getContext.mockImplementation(() => { throw new Error('no canvas here'); });
    expect(() => unitPortrait(st, unit, O)).not.toThrow();
    await flush();
  });

  it('an image that never loads is left alone', async () => {
    Object.defineProperty(HTMLImageElement.prototype, 'complete', { configurable: true, get: () => false });
    const { st, unit } = await named();
    const el = img(unitPortrait(st, unit, O));
    await flush();
    expect(getContext).not.toHaveBeenCalled();
    // when it does load, the dither runs once
    const { ctx, calls } = fakeContext();
    getContext.mockReturnValue(ctx);
    Object.defineProperty(HTMLImageElement.prototype, 'complete', { configurable: true, get: () => true });
    el.dispatchEvent(new Event('load'));
    await flush();
    expect(calls.drawImage).toBe(1);
    expect(el.getAttribute('src')).toBe('data:image/png;base64,DITHERED');
    el.dispatchEvent(new Event('load')); // the data url's own load does not dither again
    await flush();
    expect(calls.drawImage).toBe(1);
  });
});

describe('where the portraits are used', () => {
  async function squad(settings: Partial<typeof DEFAULT_SETTINGS>) {
    const reg = await loadCore();
    const state = campaign(reg, 4);
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const { ctx } = fakeContext();
    getContext.mockReturnValue(ctx);
    const host = document.createElement('div');
    document.body.append(host);
    renderSquadTab(host, {
      st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg,
      settings: () => ({ ...DEFAULT_SETTINGS, ...settings }), onNewCampaign: vi.fn(), onUnlock: vi.fn(), onSetLoadout: vi.fn(),
    } as never);
    await flush();
    return { host, st, state };
  }

  it('the unit file shows the dithered image when the setting is on', async () => {
    const { host } = await squad({ ditheredPortraits: true });
    const portraits = [...host.querySelectorAll<HTMLImageElement>('.alius-unit img.alius-portrait')];
    expect(portraits).toHaveLength(4);
    expect(portraits.every((p) => p.getAttribute('src') === 'data:image/png;base64,DITHERED')).toBe(true);
  });

  it('the plain image when dithering is off or readable mode is on', async () => {
    for (const settings of [{ ditheredPortraits: false }, { ditheredPortraits: true, readableMode: true }]) {
      document.body.innerHTML = '';
      getContext.mockReset();
      const { host, st, state } = await squad(settings);
      const first = host.querySelector<HTMLImageElement>('.alius-unit img.alius-portrait')!;
      expect(first.getAttribute('src'), JSON.stringify(settings)).toBe(st.getAvatarUrl(state.squad[0].cardRef!));
      expect(getContext).not.toHaveBeenCalled();
    }
  });

  it('the dithered portrait follows the palette of the settings: another palette is drawn again', async () => {
    await squad({ ditheredPortraits: true, palette: 'green' });
    const afterGreen = getContext.mock.calls.length;
    expect(afterGreen).toBeGreaterThan(0);
    document.body.innerHTML = '';
    await squad({ ditheredPortraits: true, palette: 'green' });
    expect(getContext.mock.calls.length).toBe(afterGreen); // cached
    document.body.innerHTML = '';
    await squad({ ditheredPortraits: true, palette: 'amber' });
    expect(getContext.mock.calls.length).toBeGreaterThan(afterGreen);
  });

  it('COMMS contacts show an avatar when the app provides one', async () => {
    const reg = await loadCore();
    const state = campaign(reg, 4);
    const host = document.createElement('div');
    document.body.append(host);
    const avatar = (u: Unit) => { const el = document.createElement('img'); el.dataset.for = u.id; return el; };
    renderCommsTab(host, { getState: () => state, registries: reg, onSend: vi.fn(), onRead: vi.fn(), onAnswer: vi.fn(), avatar });
    const rows = [...host.querySelectorAll<HTMLElement>('.alius-contact')];
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.querySelector<HTMLElement>('.alius-contact-avatar img')!.dataset.for)).toEqual(state.squad.map((u) => u.id));
    // without the callback there is none, and the row text is unchanged
    host.replaceChildren();
    renderCommsTab(host, { getState: () => state, registries: reg, onSend: vi.fn(), onRead: vi.fn(), onAnswer: vi.fn() });
    expect(host.querySelector('.alius-contact-avatar')).toBeNull();
  });
});
