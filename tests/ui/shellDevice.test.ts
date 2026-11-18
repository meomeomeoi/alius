// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCampaign } from '../../src/engine/state/create';
import { FakeStAdapter } from '../../src/st/fake';
import type { LoadResult } from '../../src/st/persistence';
import { createShell, type ShellDeps } from '../../src/ui/shell/shell';
import { isControl, isEditable } from '../../src/ui/shell/keys';
import { VOICE_OF } from '../../src/ui/voice/sources';
import { readFileSync } from 'node:fs';

const CHAT = { chatId: 'c', isGroup: true, groupId: 'g' };
let shells: Array<{ destroy(): void }> = [];

function setup(extra: Partial<ShellDeps> = {}) {
  const st = new FakeStAdapter(CHAT);
  const state = createCampaign({ seed: 1, commanderName: 'Vale' });
  const load: LoadResult = { kind: 'ok', state, chatId: 'c' };
  const shell = createShell({ st, getState: () => state, getLoad: () => load, ...extra });
  shells.push(shell);
  return { st, shell, state };
}

const q = <T extends HTMLElement = HTMLElement>(sel: string): T | null => document.querySelector<T>(`#alius-shell ${sel}`);
const device = () => q('.alius-device')!;
const selected = () => q('.alius-tab[aria-selected="true"]')?.textContent;
/** Dispatches a keydown on `target`; returns whether the shell called preventDefault. */
const press = (target: EventTarget, k: string, init: KeyboardEventInit = {}): boolean => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev.defaultPrevented;
};

afterEach(() => {
  shells.forEach((s) => s.destroy());
  shells = [];
  document.body.innerHTML = '';
});

describe('hub and device', () => {
  it('open shows the hub with the device down', () => {
    const { shell } = setup();
    shell.open();
    expect(q('.alius-hub-host')).not.toBeNull();
    expect(device().dataset.up).toBe('false');
    expect(device().hasAttribute('inert')).toBe(true);
    expect(device().getAttribute('aria-hidden')).toBe('true');
    expect(shell.isDeviceUp()).toBe(false);
    expect(q('.alius-frame-corner')!.textContent).toBe('╔═[ ALIUS // OUTPOST ]');
  });

  it("showScreen('pda') raises the device with the selected tab", () => {
    const { shell } = setup();
    shell.open();
    shell.showScreen('pda');
    expect(shell.isDeviceUp()).toBe(true);
    expect(device().dataset.up).toBe('true');
    expect(device().hasAttribute('inert')).toBe(false);
    expect(device().hasAttribute('aria-hidden')).toBe(false);
    expect(selected()).toBe('HOME'); // P10b: HOME is first and the default
    expect(q('.alius-frame-corner')!.textContent).toBe('╔═[ ALIUS // PDA ]');
    expect([...document.querySelectorAll('#alius-shell .alius-tab')].map((t) => t.textContent)).toHaveLength(9);
  });

  it("showTab('comms') from the hub raises the device on COMMS", () => {
    const { shell } = setup();
    shell.open();
    shell.showTab('comms');
    expect(shell.isDeviceUp()).toBe(true);
    expect(selected()).toBe('COMMS');
  });

  it("showTab before open() makes open() land on that tab with the device up", () => {
    const { shell } = setup();
    shell.showTab('inv');
    shell.open();
    expect(shell.isDeviceUp()).toBe(true);
    expect(selected()).toBe('INV');
  });

  it('setDevice(false) lowers it and focus returns to the OPEN PDA button', () => {
    const onDevice = vi.fn();
    const { shell } = setup({ onDevice });
    shell.open();
    shell.setDevice(true);
    shell.setDevice(false);
    expect(shell.isDeviceUp()).toBe(false);
    expect(device().dataset.up).toBe('false');
    expect(document.activeElement).toBe(q('[data-open-pda]'));
    expect(onDevice.mock.calls).toEqual([[true], [false]]);
  });

  it('the OPEN PDA button raises the device', () => {
    const { shell } = setup();
    shell.open();
    q('[data-open-pda]')!.click();
    expect(shell.isDeviceUp()).toBe(true);
  });

  it('Tab on the hub background raises the device, Tab on a button moves focus', () => {
    const { shell } = setup();
    shell.open();
    expect(press(q('[data-open-pda]')!, 'Tab')).toBe(false);
    expect(shell.isDeviceUp()).toBe(false);
    expect(press(document.getElementById('alius-shell')!, 'Tab')).toBe(true);
    expect(shell.isDeviceUp()).toBe(true);
  });

  it('Tab inside the device (screen, panel, tab bar) moves focus and never lowers it', () => {
    const { shell } = setup();
    shell.open();
    shell.showScreen('pda');
    for (const el of [q('.alius-tab')!, q('.alius-device-screen')!, q('#alius-panel')!]) {
      expect(press(el, 'Tab'), el.className || el.id).toBe(false);
      expect(shell.isDeviceUp()).toBe(true);
    }
  });

  it('Tab from the shell root or the page body lowers the raised device', () => {
    const { shell } = setup();
    shell.open();
    shell.showScreen('pda');
    expect(press(document.getElementById('alius-shell')!, 'Tab')).toBe(true);
    expect(shell.isDeviceUp()).toBe(false);
    expect(press(document.body, 'Tab')).toBe(true);
    expect(shell.isDeviceUp()).toBe(true);
  });

  it('Tab inside the analysis panel (a dialog) moves to its links and never toggles the device', () => {
    const { shell } = setup();
    shell.open();
    shell.showScreen('pda');
    const dialog = document.createElement('div');
    dialog.className = 'alius-analyze';
    dialog.setAttribute('role', 'dialog');
    dialog.tabIndex = -1;
    document.getElementById('alius-shell')!.append(dialog);
    expect(press(dialog, 'Tab')).toBe(false);
    expect(shell.isDeviceUp()).toBe(true);
  });

  it('a refresh keeps the focus on the control inside the tab, so the next Tab moves on instead of toggling', () => {
    const { shell } = setup();
    shell.registerTab('squad', (host) => {
      host.append(...['a', 'b', 'c'].map((k) => Object.assign(document.createElement('button'), { textContent: k, className: 'alius-btn' })).map((b) => { b.dataset.key = b.textContent!; return b; }));
    });
    shell.showTab('squad'); // P10b: the device opens on HOME, so ask for the tab under test
    shell.open();
    const second = q<HTMLButtonElement>('#alius-panel button[data-key="b"]')!;
    second.focus();
    expect(document.activeElement).toBe(second);
    shell.refresh();
    expect((document.activeElement as HTMLElement).dataset.key).toBe('b');
    expect(press(document.activeElement!, 'Tab')).toBe(false);
    expect(shell.isDeviceUp()).toBe(true);
  });

  it('a refresh on the hub keeps the focus on OPEN PDA, so Tab does not raise the device by surprise', () => {
    const { shell } = setup();
    shell.open();
    const open = q<HTMLElement>('[data-open-pda]')!;
    open.focus();
    shell.refresh();
    expect(document.activeElement).toBe(q('[data-open-pda]'));
    expect(press(document.activeElement!, 'Tab')).toBe(false);
    expect(shell.isDeviceUp()).toBe(false);
  });

  it('Shift+Tab, and Tab with Ctrl, Alt or Meta, never toggle', () => {
    const { shell } = setup();
    shell.open();
    const rootEl = document.getElementById('alius-shell')!;
    for (const init of [{ shiftKey: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
      expect(press(rootEl, 'Tab', init)).toBe(false);
    }
    expect(shell.isDeviceUp()).toBe(false);
  });

  it('keys while typing: Tab, 3 and Escape inside an input or a textarea change nothing', () => {
    const { shell } = setup();
    shell.open();
    shell.showScreen('pda');
    const input = document.createElement('input');
    const number = document.createElement('input');
    number.type = 'number';
    const area = document.createElement('textarea');
    q('#alius-panel')!.append(input, number, area);
    for (const el of [input, number, area]) {
      for (const k of ['Tab', '3', 'Escape']) {
        press(el, k);
        expect(shell.isDeviceUp(), `${el.tagName} ${k}`).toBe(true);
        expect(selected(), `${el.tagName} ${k}`).toBe('HOME'); // P10b: the default tab
      }
    }
  });

  it('1-8 on the hub open the device at that tab, inside the device they keep selecting tabs', () => {
    const { shell } = setup();
    shell.open();
    press(document.getElementById('alius-shell')!, '4');
    expect(shell.isDeviceUp()).toBe(true);
    expect(selected()).toBe('COMMS');
    press(document.getElementById('alius-shell')!, '8');
    expect(selected()).toBe('SYS');
    expect(shell.isDeviceUp()).toBe(true);
  });

  it('1-8 with a modifier do nothing', () => {
    const { shell } = setup();
    shell.open();
    press(document.getElementById('alius-shell')!, '2', { ctrlKey: true });
    expect(shell.isDeviceUp()).toBe(false);
  });

  it('escape order: an open modal closes first, then Escape lowers the device', async () => {
    const { shell } = setup();
    shell.open();
    shell.showScreen('pda');
    const answer = shell.modal({ title: 'T', body: 'b', actions: [{ label: 'OK', value: 'ok' }] });
    press(document.body, 'Escape');
    expect(await answer).toBeNull();
    expect(shell.isDeviceUp()).toBe(true);
    press(document.body, 'Escape');
    expect(shell.isDeviceUp()).toBe(false);
  });

  it('Escape on the hub with the device down does nothing', () => {
    const { shell } = setup();
    shell.open();
    expect(press(document.body, 'Escape')).toBe(false);
    expect(shell.isOpen()).toBe(true);
  });

  it('a tab is drawn only while the device is up: the hub never renders it unseen', () => {
    const { shell } = setup();
    let draws = 0;
    shell.registerTab('squad', (host) => { draws++; host.textContent = `SQUAD ${draws}`; });
    shell.open();
    expect(draws).toBe(0); // device down: nothing draws (a tab renderer may mark messages read or clear a badge)
    shell.refresh();
    shell.refresh();
    expect(draws).toBe(0);
    shell.showTab('squad'); // P10b: the device opens on HOME, so ask for the tab under test
    expect(draws).toBe(1);
    expect(q('#alius-panel')!.textContent).toBe('SQUAD 1');
    shell.refresh();
    expect(draws).toBe(2);
    shell.setDevice(false);
    shell.refresh();
    shell.registerTab('squad', (host) => { draws++; host.textContent = 'again'; });
    expect(draws).toBe(2); // lowered: still nothing
    shell.showTab('squad'); // raising draws it once
    expect(draws).toBe(3);
  });

  it('1-8 on the hub draws only the tab that was asked for', () => {
    const { shell } = setup();
    const drawn: string[] = [];
    for (const id of ['squad', 'ops', 'comms'] as const) shell.registerTab(id, (host) => { drawn.push(id); host.textContent = id; });
    shell.open();
    press(document.getElementById('alius-shell')!, '2');
    expect(drawn).toEqual(['ops']);
  });

  it('registerTab still re-renders the current tab while up', () => {
    const { shell } = setup();
    shell.open();
    shell.showTab('squad'); // P10b: the device opens on HOME, so ask for the tab under test
    shell.registerTab('squad', (host) => { host.textContent = 'ROSTER HERE'; });
    expect(q('#alius-panel')!.textContent).toBe('ROSTER HERE');
    shell.registerTab('squad', (host) => { host.textContent = 'ROSTER TWO'; });
    expect(q('#alius-panel')!.textContent).toBe('ROSTER TWO');
  });

  it('refresh() keeps the device state', () => {
    const { shell } = setup();
    shell.open();
    shell.showTab('ops');
    shell.refresh();
    expect(shell.isDeviceUp()).toBe(true);
    expect(selected()).toBe('OPS');
    shell.setDevice(false);
    shell.refresh();
    expect(shell.isDeviceUp()).toBe(false);
    expect(device().dataset.up).toBe('false');
  });

  it('registerHub renders the hub, gets the device element and refresh() re-renders only the hub host', () => {
    const { shell } = setup();
    const seen: HTMLElement[] = [];
    let n = 0;
    shell.registerHub((host, dev) => {
      seen.push(dev);
      n++;
      host.textContent = `HUB ${n}`;
    });
    shell.open();
    expect(q('.alius-hub-host')!.textContent).toBe('HUB 1');
    const before = device();
    shell.refresh();
    expect(q('.alius-hub-host')!.textContent).toBe('HUB 2');
    expect(device()).toBe(before); // the device is not rebuilt, so focus inside it survives a refresh
    expect(seen.every((d) => d === before)).toBe(true);
  });

  it('the scene screen hides the hub; showScreen("hub") comes back with the device down', () => {
    const { shell } = setup();
    shell.registerScreen('scene', (host) => { host.textContent = 'SCENE'; });
    shell.open();
    shell.showScreen('pda');
    shell.showScreen('scene');
    expect(q('.alius-hub-host')).toBeNull();
    expect(q('.alius-device')).toBeNull();
    expect(shell.isDeviceUp()).toBe(false);
    expect(q('.alius-view')!.textContent).toBe('SCENE');
    shell.showScreen('hub');
    expect(q('.alius-hub-host')).not.toBeNull();
    expect(device().dataset.up).toBe('false');
  });

  it('Tab on a full-window screen does nothing', () => {
    const { shell } = setup();
    shell.registerScreen('scene', (host) => { host.textContent = 'SCENE'; });
    shell.open();
    shell.showScreen('scene');
    expect(press(document.getElementById('alius-shell')!, 'Tab')).toBe(false);
  });

  it('the device is full width at 1000 px and not at 1400 px', () => {
    const { shell } = setup();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    shell.open();
    expect(device().classList.contains('alius-device-narrow')).toBe(true);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1400 });
    window.dispatchEvent(new Event('resize'));
    expect(device().classList.contains('alius-device-narrow')).toBe(false);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1100 });
    window.dispatchEvent(new Event('resize'));
    expect(device().classList.contains('alius-device-narrow')).toBe(true);
  });

  it('at a narrow width the hub behind the raised device leaves the focus order (inert); wide, it stays usable', () => {
    const hubHost = () => q('.alius-hub-host')!;
    const { shell } = setup();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    shell.open();
    expect(hubHost().hasAttribute('inert')).toBe(false); // device down: the hub is the screen
    shell.showScreen('pda');
    expect(hubHost().hasAttribute('inert')).toBe(true);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1400 });
    window.dispatchEvent(new Event('resize'));
    expect(hubHost().hasAttribute('inert')).toBe(false); // the hub's left column is beside the device
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    window.dispatchEvent(new Event('resize'));
    expect(hubHost().hasAttribute('inert')).toBe(true);
    shell.setDevice(false);
    expect(hubHost().hasAttribute('inert')).toBe(false);
  });

  it('stacking: hub, device, toasts, modal layer, in that DOM order', () => {
    const { shell } = setup();
    shell.open();
    const order = [...document.querySelectorAll('#alius-shell .alius-hub-host, #alius-shell .alius-device, #alius-shell .alius-toasts, #alius-shell .alius-modal-layer')]
      .map((el) => el.className.split(' ')[0]);
    expect(order).toEqual(['alius-hub-host', 'alius-device', 'alius-toasts', 'alius-modal-layer']);
  });

  it('the footer names the keys', () => {
    const { shell } = setup();
    shell.open();
    expect(q('.alius-footer')!.textContent).toContain('TAB pda · 1-8 tabs · ←/→ move · ? analyze · Esc back · Alt+Shift+A toggle');
  });

  it('toasts keep a voice in data-voice, terminal by default', () => {
    const { shell } = setup();
    shell.open();
    shell.toast('info', 'plain');
    shell.toast('info', 'from oversight', { voice: 'corporate', title: 'OVERSIGHT' });
    const toasts = [...document.querySelectorAll<HTMLElement>('#alius-shell .alius-toast')];
    expect(toasts.map((t) => t.dataset.voice)).toEqual(['terminal', 'corporate']);
    expect(toasts[1].textContent).toContain('OVERSIGHT');
    expect(toasts[1].textContent).toContain('from oversight');
  });

  it('destroy removes the resize listener and the key listener', () => {
    const { shell } = setup();
    shell.open();
    const spy = vi.spyOn(window, 'removeEventListener');
    shell.destroy();
    expect(spy.mock.calls.some(([type]) => type === 'resize')).toBe(true);
    spy.mockRestore();
  });
});

describe('keys helpers', () => {
  it('isControl is true for buttons, links, inputs, selects, textareas, summaries and contenteditable', () => {
    const mk = (tag: string, attrs: Record<string, string> = {}) => {
      const el = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      return el;
    };
    for (const el of [mk('button'), mk('a', { href: '#' }), mk('input'), mk('select'), mk('textarea'), mk('summary'), mk('div', { role: 'button' })]) {
      expect(isControl(el), el.outerHTML).toBe(true);
    }
    for (const el of [mk('div'), mk('section', { tabindex: '0' }), document.body]) expect(isControl(el), el.outerHTML).toBe(false);
    expect(isControl(null)).toBe(false);
    expect(isControl(window)).toBe(false);
  });

  it('isEditable is true for inputs, textareas and selects only', () => {
    expect(isEditable(document.createElement('input'))).toBe(true);
    expect(isEditable(document.createElement('textarea'))).toBe(true);
    expect(isEditable(document.createElement('select'))).toBe(true);
    expect(isEditable(document.createElement('button'))).toBe(false);
    expect(isEditable(null)).toBe(false);
  });
});

describe('voice sources', () => {
  it('VOICE_OF names the voice of each source', () => {
    expect(VOICE_OF).toEqual({
      toast: 'terminal', dm: 'personal', unit_note: 'personal', chronicle: 'paper', dossier: 'paper', commander_file: 'paper',
      oversight: 'corporate', leash_verdict: 'corporate', corporate_mail: 'corporate', intake_form: 'paper', squad_vote: 'corporate', her_call: 'personal', booking: 'personal', device_edit: 'personal', squad_secret: 'paper', frequency: 'terminal', premonition: 'terminal',
    });
  });
});

describe('the device never hides the end of a tab', () => {
  it('the panel of a bleeding device (css casing) has bottom padding that clears the 40 px it runs off-screen', () => {
    const css = readFileSync('css/16-device.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const bleed = Number(/bottom:\s*-(\d+)px/.exec(css)?.[1]);
    expect(bleed).toBeGreaterThan(0);
    const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) => /alius-device[^,{]*\.alius-screen/.test(m[1]) && /padding-bottom/.test(m[2]));
    expect(rule, 'a padding-bottom rule for the panel inside the device').toBeDefined();
    const pad = Number(/padding-bottom:\s*(\d+)px/.exec(rule![2])?.[1]);
    expect(pad).toBeGreaterThanOrEqual(bleed + 8);
    expect(rule![1]).toMatch(/:not\(\[data-kind="image"\]\)/); // an image skin does not bleed
  });
});

describe('the slide never scrolls the view', () => {
  /** Every focus() the shell makes while the device moves: a focus without preventScroll scrolls the clipped view to the (off-screen) device. */
  function focusCalls(run: () => void): Array<{ el: HTMLElement; options: unknown }> {
    const calls: Array<{ el: HTMLElement; options: unknown }> = [];
    const original = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function (this: HTMLElement, options?: FocusOptions) {
      calls.push({ el: this, options });
      return original.call(this, options);
    };
    try { run(); } finally { HTMLElement.prototype.focus = original; }
    return calls;
  }

  it('raising and lowering the device focus without scrolling', () => {
    const { shell } = setup();
    shell.open();
    const up = focusCalls(() => shell.setDevice(true));
    expect(up.length).toBeGreaterThan(0);
    expect(up.every((c) => (c.options as FocusOptions | undefined)?.preventScroll === true)).toBe(true);
    const down = focusCalls(() => shell.setDevice(false));
    expect(down.length).toBeGreaterThan(0);
    expect(down.every((c) => (c.options as FocusOptions | undefined)?.preventScroll === true)).toBe(true);
  });

  it('opening the shell and arrowing between tabs focus without scrolling too', () => {
    const { shell } = setup();
    const opened = focusCalls(() => shell.open());
    expect(opened.every((c) => (c.options as FocusOptions | undefined)?.preventScroll === true)).toBe(true);
    shell.setDevice(true);
    const tab = q('.alius-tab[aria-selected="true"]')!;
    const arrow = focusCalls(() => tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })));
    expect(arrow.length).toBeGreaterThan(0);
    expect(arrow.every((c) => (c.options as FocusOptions | undefined)?.preventScroll === true)).toBe(true);
  });

  it('the view puts itself back if something scrolls it anyway', () => {
    const { shell } = setup();
    shell.open();
    const view = q('.alius-view')!;
    let top = 0;
    Object.defineProperty(view, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = v; } });
    top = 46;
    view.dispatchEvent(new Event('scroll'));
    expect(top).toBe(0);
  });
});


describe('HOME is the first tab (P10b)', () => {
  const tabIds = () => [...document.querySelectorAll('#alius-shell .alius-tab')].map((t) => t.id);

  it('nine tabs, HOME first, and the device opens on HOME', () => {
    const { shell } = setup();
    shell.open();
    shell.showScreen('pda');
    expect(tabIds()).toEqual(['home', 'squad', 'ops', 'map', 'comms', 'base', 'inv', 'log', 'sys'].map((id) => `alius-tab-${id}`));
    expect(selected()).toBe('HOME');
  });

  it('0 opens HOME and 1 to 8 keep their old tabs (SQUAD … SYS)', () => {
    const { shell } = setup();
    shell.open();
    shell.showScreen('pda');
    const names = ['SQUAD', 'OPS', 'MAP', 'COMMS', 'BASE', 'INV', 'LOG', 'SYS'];
    names.forEach((n, i) => {
      press(document, String(i + 1));
      expect(selected(), `key ${i + 1}`).toBe(n);
    });
    press(document, '0');
    expect(selected()).toBe('HOME');
    press(document, '1');
    expect(selected()).toBe('SQUAD');
  });

  it('from the hub, 0 raises the device on HOME and 1 on SQUAD', () => {
    const { shell } = setup();
    shell.open();
    press(document, '0');
    expect(shell.isDeviceUp()).toBe(true);
    expect(selected()).toBe('HOME');
    shell.setDevice(false);
    press(document, '1');
    expect(selected()).toBe('SQUAD');
  });

  it('showTab before open() still lands on the tab that was asked for', () => {
    const { shell } = setup();
    shell.showTab('comms');
    shell.open();
    expect(shell.isDeviceUp()).toBe(true);
    expect(selected()).toBe('COMMS');
  });

  it('the arrow keys wrap through HOME', () => {
    const { shell } = setup();
    shell.open();
    shell.showScreen('pda');
    const home = document.getElementById('alius-tab-home')!;
    home.focus();
    press(home, 'ArrowLeft');
    expect(selected()).toBe('SYS');
    press(document.getElementById('alius-tab-sys')!, 'ArrowRight');
    expect(selected()).toBe('HOME');
  });
});
