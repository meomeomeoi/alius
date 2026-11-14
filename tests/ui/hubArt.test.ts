// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { peekHubArt, probeHubArt, resetHubArt } from '../../src/ui/hub/art';

/** Images in jsdom never load: stand in for the browser and decide per URL whether one loads. */
const requested: string[] = [];
let loads: (url: string) => boolean;
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(url: string) {
    requested.push(url);
    queueMicrotask(() => (loads(url) ? this.onload?.() : this.onerror?.()));
  }
}
const url = (p: string) => `/ext/${p}`;
const BASE = 'content/core/art/hub/base.png';
const NIGHT = 'content/core/art/hub/base_night.png';

beforeEach(() => {
  requested.length = 0;
  loads = () => true;
  resetHubArt();
  vi.stubGlobal('Image', FakeImage);
});
afterEach(() => vi.unstubAllGlobals());

describe('probeHubArt', () => {
  it('requests nothing when the pack declares no art', async () => {
    expect(await probeHubArt(url, 'morning', [])).toBeNull();
    expect(await probeHubArt(undefined, 'morning', [BASE])).toBeNull();
    expect(requested).toEqual([]);
    expect(peekHubArt(url, 'morning', [])).toBeNull();
  });

  it('takes the slot variant when it is declared, else the base, and requests only that one', async () => {
    expect(await probeHubArt(url, 'night', [BASE, NIGHT])).toBe(url(NIGHT));
    expect(requested).toEqual([url(NIGHT)]);
    expect(await probeHubArt(url, 'morning', [BASE, NIGHT])).toBe(url(BASE));
    expect(requested).toEqual([url(NIGHT), url(BASE)]);
  });

  it('a declared file that fails to load falls back to the base, then to nothing', async () => {
    loads = (u) => u === url(BASE);
    expect(await probeHubArt(url, 'night', [BASE, NIGHT])).toBe(url(BASE));
    resetHubArt();
    loads = () => false;
    expect(await probeHubArt(url, 'night', [BASE, NIGHT])).toBeNull();
  });

  it('each file is tried once per session', async () => {
    await probeHubArt(url, 'night', [BASE, NIGHT]);
    await probeHubArt(url, 'night', [BASE, NIGHT]);
    expect(requested).toEqual([url(NIGHT)]);
  });

  it('peek answers at once once a probe has finished, and says "unknown" before', async () => {
    expect(peekHubArt(url, 'night', [BASE, NIGHT])).toBeUndefined();
    await probeHubArt(url, 'night', [BASE, NIGHT]);
    expect(peekHubArt(url, 'night', [BASE, NIGHT])).toBe(url(NIGHT));
  });

  it('an environment without Image gives nothing', async () => {
    vi.stubGlobal('Image', undefined);
    expect(await probeHubArt(url, 'night', [BASE])).toBeNull();
  });
});
