// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { createCampaign } from '../../src/engine/state/create';
import { DEFAULT_SETTINGS, updateSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import { motionReduced, visualFlags } from '../../src/ui/motion';
import { playBoot } from '../../src/ui/device/boot';
import { createShell, type ShellApi } from '../../src/ui/shell/shell';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

let shells: ShellApi[] = [];
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  shells.forEach((s) => s.destroy());
  shells = [];
  vi.useRealTimers();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

const S = DEFAULT_SETTINGS;
const mediaReduced = (on: boolean) => vi.stubGlobal('matchMedia', () => ({ matches: on, addEventListener() {}, removeEventListener() {} }));

describe('motionReduced', () => {
  it('is true by the setting, true by the system media query, false otherwise', () => {
    expect(motionReduced({ ...S, reducedMotion: true }, () => false)).toBe(true);
    expect(motionReduced({ ...S, reducedMotion: false }, () => true)).toBe(true);
    expect(motionReduced({ ...S, reducedMotion: false }, () => false)).toBe(false);
  });

  it('reads window.matchMedia when no media function is given, and survives a window without it', () => {
    mediaReduced(true);
    expect(motionReduced(S)).toBe(true);
    mediaReduced(false);
    expect(motionReduced(S)).toBe(false);
    vi.stubGlobal('matchMedia', undefined);
    expect(motionReduced(S)).toBe(false);
  });
});

describe('visualFlags', () => {
  it('everything is on by default settings that ask for it', () => {
    expect(visualFlags({ ...S, scanlines: true, flicker: true }, () => false)).toEqual({ scanlines: true, flicker: true, glitch: true, dither: true, motion: true });
  });

  it('dithering also needs the ditheredPortraits setting', () => {
    expect(visualFlags({ ...S, ditheredPortraits: false }, () => false).dither).toBe(false);
    expect(visualFlags({ ...S, ditheredPortraits: true }, () => false).dither).toBe(true);
  });

  it('readable mode turns scanlines, flicker, glitch and dithering off and leaves motion alone', () => {
    const f = visualFlags({ ...S, scanlines: true, flicker: true, readableMode: true }, () => false);
    expect(f).toEqual({ scanlines: false, flicker: false, glitch: false, dither: false, motion: true });
  });

  it('reduced motion switches motion and the glitch off but not the scanlines', () => {
    const f = visualFlags({ ...S, scanlines: true, reducedMotion: true }, () => false);
    expect(f.motion).toBe(false);
    expect(f.glitch).toBe(false);
    expect(f.scanlines).toBe(true);
  });
});

describe('playBoot', () => {
  const lines = (screen: HTMLElement) => [...screen.querySelectorAll('.alius-boot-line')].map((l) => l.textContent);

  it('shows three lines 150 ms apart, fades, and is gone at 600 ms', async () => {
    const screen = document.createElement('div');
    document.body.append(screen);
    let done = false;
    void playBoot(screen, { reduced: false, skinLabel: 'KESTREL-WARD · KW-7' }).then(() => { done = true; });
    expect(lines(screen)).toEqual(['KESTREL-WARD · KW-7 // BOOT']);
    await vi.advanceTimersByTimeAsync(150);
    expect(lines(screen)).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(150);
    expect(lines(screen)).toEqual(['KESTREL-WARD · KW-7 // BOOT', 'LINK ........ OK', 'CCP OVERSIGHT HANDSHAKE ........ OK']);
    await vi.advanceTimersByTimeAsync(150);
    expect(screen.querySelector('.alius-boot')!.classList.contains('alius-boot-fade')).toBe(true);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(150);
    expect(screen.querySelector('.alius-boot')).toBeNull();
    expect(done).toBe(true);
  });

  it('resolves at once and draws nothing when reduced', async () => {
    const screen = document.createElement('div');
    await playBoot(screen, { reduced: true, skinLabel: 'X' });
    expect(screen.querySelector('.alius-boot')).toBeNull();
  });

  it('ends on a key or a pointer press', async () => {
    for (const ev of [new KeyboardEvent('keydown', { key: 'a' }), new Event('pointerdown')]) {
      const screen = document.createElement('div');
      document.body.append(screen);
      const p = playBoot(screen, { reduced: false, skinLabel: 'X' });
      await vi.advanceTimersByTimeAsync(100);
      document.dispatchEvent(ev);
      await p;
      expect(screen.querySelector('.alius-boot')).toBeNull();
    }
  });

  it('the label is set as text', async () => {
    const screen = document.createElement('div');
    document.body.append(screen);
    void playBoot(screen, { reduced: false, skinLabel: '<img src=x onerror=alert(1)>' });
    expect(screen.querySelector('img')).toBeNull();
    expect(lines(screen)[0]).toBe('<img src=x onerror=alert(1)> // BOOT');
    await vi.advanceTimersByTimeAsync(600);
  });

  it('an abort signal ends it at once: no timers and no listeners left', async () => {
    const screen = document.createElement('div');
    document.body.append(screen);
    const spy = vi.spyOn(document, 'removeEventListener');
    const ctrl = new AbortController();
    const p = playBoot(screen, { reduced: false, skinLabel: 'X', signal: ctrl.signal });
    await vi.advanceTimersByTimeAsync(100);
    ctrl.abort();
    await p;
    expect(screen.querySelector('.alius-boot')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(spy.mock.calls.map(([t]) => t)).toEqual(expect.arrayContaining(['keydown', 'pointerdown']));
    // an already aborted signal draws nothing
    const again = document.createElement('div');
    await playBoot(again, { reduced: false, skinLabel: 'X', signal: ctrl.signal });
    expect(again.querySelector('.alius-boot')).toBeNull();
  });

  it('closing the shell during the boot ends it (nothing runs on after close)', async () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const state = createCampaign({ seed: 1, commanderName: 'Vale' });
    const shell = createShell({ st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }) });
    shells.push(shell);
    shell.open();
    shell.showScreen('pda');
    expect(document.querySelector('#alius-shell .alius-boot')).not.toBeNull();
    shell.close();
    vi.advanceTimersByTime(0); // jsdom's own zero-delay focus bookkeeping; the boot's timers (150-600 ms) would remain
    expect(vi.getTimerCount()).toBe(0);
  });

  it('removes its key listeners when it ends', async () => {
    const spy = vi.spyOn(document, 'removeEventListener');
    const screen = document.createElement('div');
    document.body.append(screen);
    void playBoot(screen, { reduced: false, skinLabel: 'X' });
    await vi.advanceTimersByTimeAsync(600);
    expect(spy.mock.calls.map(([t]) => t)).toEqual(expect.arrayContaining(['keydown', 'pointerdown']));
  });
});

describe('the shell and motion', () => {
  function setup(settings: Record<string, unknown> = {}, extra: Partial<Parameters<typeof createShell>[0]> = {}) {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    Object.assign(st.settings, settings);
    const state = createCampaign({ seed: 1, commanderName: 'Vale' });
    const shell = createShell({ st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), ...extra });
    shells.push(shell);
    return { st, shell };
  }
  const root = () => document.getElementById('alius-shell')!;
  const boot = () => document.querySelector('#alius-shell .alius-boot');

  it('readable mode sets alius-readable and drops scanlines and flicker', () => {
    const { shell } = setup({ scanlines: true, flicker: true });
    shell.open();
    expect(root().classList.contains('alius-scanlines')).toBe(true);
    expect(root().classList.contains('alius-flicker')).toBe(true);
    expect(root().classList.contains('alius-readable')).toBe(false);
  });

  it('with readableMode on: alius-readable, no alius-scanlines, no alius-flicker', () => {
    const { shell } = setup({ scanlines: true, flicker: true, readableMode: true });
    shell.open();
    expect(root().classList.contains('alius-readable')).toBe(true);
    expect(root().classList.contains('alius-scanlines')).toBe(false);
    expect(root().classList.contains('alius-flicker')).toBe(false);
  });

  it('a settings change restyles at once', () => {
    const { st, shell } = setup({ scanlines: true });
    shell.open();
    updateSettings(st, { readableMode: true });
    shell.setPalette('green');
    expect(root().classList.contains('alius-readable')).toBe(true);
    expect(root().classList.contains('alius-scanlines')).toBe(false);
  });

  it('reduced motion sets alius-reduced-motion, by the setting and by the system', () => {
    const a = setup({ reducedMotion: true });
    a.shell.open();
    expect(root().classList.contains('alius-reduced-motion')).toBe(true);
    a.shell.destroy();
    mediaReduced(true);
    const b = setup({});
    b.shell.open();
    expect(root().classList.contains('alius-reduced-motion')).toBe(true);
  });

  it('boot shows on the first device-up only, ends on a key, and lasts at most 600 ms', async () => {
    const { shell } = setup({}, { skin: () => ({ skin: { id: 'k', name: 'Kestrel', description: 'd', kind: 'css', cssPreset: 'kestrel', ledColor: '#ffffff', accent: '#ffffff', label: 'KW-7' } }) });
    shell.open();
    expect(boot()).toBeNull(); // the hub is up, the device is down
    shell.showScreen('pda');
    expect(boot()).not.toBeNull();
    expect(boot()!.parentElement!.classList.contains('alius-device-screen')).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    expect([...document.querySelectorAll('#alius-shell .alius-boot-line')].map((l) => l.textContent)).toEqual(['KW-7 // BOOT', 'LINK ........ OK', 'CCP OVERSIGHT HANDSHAKE ........ OK']);
    await vi.advanceTimersByTimeAsync(300);
    expect(boot()).toBeNull();
    // lowering and raising again does not boot again
    shell.setDevice(false);
    shell.setDevice(true);
    expect(boot()).toBeNull();
    // a key ends a boot that is running: close and reopen the shell to get a fresh first device-up
    shell.close();
    shell.open();
    shell.showScreen('pda');
    expect(boot()).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(boot()).toBeNull();
  });

  it('the boot also plays when open() lands on the PDA (showTab before open)', async () => {
    const { shell } = setup();
    shell.showTab('ops');
    shell.open();
    expect(boot()).not.toBeNull();
    await vi.advanceTimersByTimeAsync(600);
    expect(boot()).toBeNull();
  });

  it('no boot under reduced motion', () => {
    const { shell } = setup({ reducedMotion: true });
    shell.open();
    shell.showScreen('pda');
    expect(boot()).toBeNull();
  });

  it('a tab change adds alius-glitch for 120 ms', async () => {
    const { shell } = setup({ reducedMotion: false });
    shell.open();
    shell.showScreen('pda');
    await vi.advanceTimersByTimeAsync(700);
    const panel = () => document.getElementById('alius-panel')!;
    document.getElementById('alius-tab-ops')!.click();
    expect(panel().classList.contains('alius-glitch')).toBe(true);
    await vi.advanceTimersByTimeAsync(119);
    expect(panel().classList.contains('alius-glitch')).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(panel().classList.contains('alius-glitch')).toBe(false);
  });

  it('no glitch when the same tab is clicked again, in readable mode, or under reduced motion', async () => {
    for (const settings of [{ readableMode: true }, { reducedMotion: true }, {}]) {
      const { shell } = setup(settings);
      shell.open();
      shell.showScreen('pda');
      await vi.advanceTimersByTimeAsync(700);
      const panel = () => document.getElementById('alius-panel')!;
      if (Object.keys(settings).length === 0) {
        document.getElementById('alius-tab-squad')!.click(); // already selected
      } else {
        document.getElementById('alius-tab-ops')!.click();
      }
      expect(panel().classList.contains('alius-glitch'), JSON.stringify(settings)).toBe(false);
      shell.destroy();
    }
  });

  it('the analysis panel shows its text at once under the reduced-motion setting (animationMs 0 through the dep), and animates otherwise', async () => {
    for (const reduced of [true, false]) {
      const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
      Object.assign(st.settings, { reducedMotion: reduced, analyzeAnimation: 'full' });
      const state = campaign(reg, 4);
      const shell = createShell({ st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), analyze: { registries: () => reg } });
      shells.push(shell);
      shell.open();
      shell.showScreen('pda');
      await vi.advanceTimersByTimeAsync(700);
      const clock = document.querySelector<HTMLElement>('#alius-shell .alius-device .alius-clock[data-analyze]')!;
      clock.focus();
      clock.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true }));
      const panel = document.querySelector<HTMLElement>('.alius-analyze')!;
      expect(panel, `reduced ${reduced}`).not.toBeNull();
      expect(panel.hasAttribute('aria-busy'), `reduced ${reduced}`).toBe(!reduced);
      shell.destroy();
      shells.pop();
    }
  });
});
