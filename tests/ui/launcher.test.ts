// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { installLauncher } from '../../src/ui/launcher';

const handlers = () => ({ open: vi.fn(), newCampaign: vi.fn(), init: vi.fn(), ping: vi.fn() });
// Tests with only one container must not wait for the other one for the real 10 s.
const FAST = { retryMs: 1, retries: 2 };

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('installLauncher', () => {
  it('adds the three wand-menu items and they call the handlers', async () => {
    document.body.innerHTML = '<div id="extensionsMenu"></div>';
    const h = handlers();
    await installLauncher(h, FAST);
    const items = [...document.querySelectorAll<HTMLElement>('#extensionsMenu > .list-group-item')];
    expect(items.map((i) => i.textContent)).toEqual([
      'Alius',
      'Alius: New campaign',
      'Alius: Initialize campaign (debug)',
      'Alius: Ping mechanic model (debug)',
    ]);
    items.forEach((i) => i.click());
    expect([h.open, h.newCampaign, h.init, h.ping].map((f) => f.mock.calls.length)).toEqual([1, 1, 1, 1]);
  });

  it('adds an Alius drawer to the extension settings panel with the same actions', async () => {
    document.body.innerHTML = '<div id="extensions_settings"></div><div id="extensions_settings2"></div>';
    const h = handlers();
    await installLauncher(h, FAST);
    const drawer = document.querySelector('#extensions_settings2 #alius_settings')!;
    expect(drawer.querySelector('.inline-drawer-header')!.textContent).toContain('Alius');
    const buttons = [...drawer.querySelectorAll<HTMLInputElement>('input.menu_button')];
    expect(buttons.map((b) => b.value)).toEqual(['Open Alius', 'New campaign', 'Initialize campaign (debug)', 'Ping mechanic model (debug)']);
    buttons.forEach((b) => b.click());
    expect([h.open, h.newCampaign, h.init, h.ping].map((f) => f.mock.calls.length)).toEqual([1, 1, 1, 1]);
  });

  it('uses the first settings column when the second is missing', async () => {
    document.body.innerHTML = '<div id="extensions_settings"></div>';
    await installLauncher(handlers(), FAST);
    expect(document.querySelector('#extensions_settings #alius_settings')).not.toBeNull();
  });

  it('waits for the wand menu, which SillyTavern creates after extensions load', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="extensions_settings2"></div>';
    const done = installLauncher(handlers(), { retryMs: 100, retries: 20 });
    await vi.advanceTimersByTimeAsync(350);
    expect(document.querySelector('#extensionsMenu')).toBeNull();
    // the settings drawer must not wait for the wand menu
    expect(document.querySelector('#alius_settings')).not.toBeNull();
    document.body.insertAdjacentHTML('beforeend', '<div id="extensionsMenu"></div>');
    await vi.advanceTimersByTimeAsync(150);
    await done;
    expect(document.querySelectorAll('#extensionsMenu > .list-group-item')).toHaveLength(4);
  });

  it('gives up quietly when a container never appears', async () => {
    vi.useFakeTimers();
    const warn = vi.mocked(console.warn);
    const done = installLauncher(handlers(), { retryMs: 10, retries: 3 });
    await vi.advanceTimersByTimeAsync(100);
    await done;
    expect(warn).toHaveBeenCalled();
  });

  it('is idempotent', async () => {
    document.body.innerHTML = '<div id="extensionsMenu"></div><div id="extensions_settings2"></div>';
    const h = handlers();
    await installLauncher(h);
    await installLauncher(h);
    expect(document.querySelectorAll('#extensionsMenu > .list-group-item')).toHaveLength(4);
    expect(document.querySelectorAll('#alius_settings')).toHaveLength(1);
  });
});
