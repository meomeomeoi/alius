// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import type { CampaignState } from '../../../src/engine/state/types';
import type { SceneController } from '../../../src/scene/sceneController';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import type { ChatMessage } from '../../../src/st/adapter';
import { FakeStAdapter } from '../../../src/st/fake';
import { renderSceneScreen, type SceneScreen } from '../../../src/ui/scene/sceneScreen';
import { resetSceneStage } from '../../../src/ui/scene/stage';
import { createShell, type ShellApi } from '../../../src/ui/shell/shell';
import { campaign, errors, loadCore, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
let shells: ShellApi[] = [];
afterEach(() => {
  shells.forEach((s) => s.destroy());
  shells = [];
  document.body.innerHTML = '';
  resetSceneStage();
});

const msg = (index: number, over: Partial<ChatMessage> = {}): ChatMessage => ({ index, isUser: false, name: 'Ann', avatar: 'ann.png', text: 'hi', swipeId: 0, ...over });
const key = (target: EventTarget, k: string, init: KeyboardEventInit = {}) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));

function setup(opts: { locked?: boolean } = {}) {
  let state: CampaignState = campaign(reg, 4);
  const r = run(state, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: ['unit_ann'], origin: 'event', startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  state = r.state;
  const messages: ChatMessage[] = [msg(0)];
  const controller = {
    send: vi.fn(async () => true), propose: vi.fn(), answer: vi.fn(), end: vi.fn(async () => {}), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(),
    transcript: () => messages, onSwipe: vi.fn(),
  } as unknown as SceneController;
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  const locked = { on: opts.locked === true };
  const onDeviceRefused = vi.fn();
  let screen: SceneScreen | null = null;
  const shell = createShell({ st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), deviceLocked: () => locked.on, onDeviceRefused: () => { onDeviceRefused(); screen?.flashDeviceOut(); } });
  shells.push(shell);
  const renders = vi.fn();
  shell.registerScreen('scene', (host) => {
    renders();
    screen = renderSceneScreen(host, { controller, getState: () => state, registries: reg, st, settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0 }), onEnded: vi.fn() });
  }, { refresh: () => { screen?.refresh(); return true; } });
  shell.open();
  shell.showScreen('scene');
  const q = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s);
  return { shell, renders, locked, onDeviceRefused, messages, q, screen: () => screen! };
}
const deviceUp = (): boolean => document.querySelector('.alius-scene-device .alius-device')?.getAttribute('data-up') === 'true';

describe('the device over the scene (P10e §5a)', () => {
  it('Tab raises the device over the scene, which is not rebuilt; the selected tab renders', () => {
    const t = setup();
    expect(t.renders).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.alius-scene-device .alius-device')).not.toBeNull();
    expect(deviceUp()).toBe(false);
    const input = t.q('input[name="cmd"]');
    key(document.body, 'Tab');
    expect(deviceUp()).toBe(true);
    expect(t.shell.isDeviceUp()).toBe(true);
    expect(t.renders).toHaveBeenCalledTimes(1);
    expect(t.q('input[name="cmd"]')).toBe(input);
    expect(t.q('.alius-scene-device .alius-tab[aria-selected="true"]')).not.toBeNull();
    expect(t.q('.alius-scene-device .alius-screen')!.childElementCount).toBeGreaterThan(0);
  });

  it('Tab again lowers it, and so does Esc; the scene keeps its DOM', () => {
    const t = setup();
    const input = t.q('input[name="cmd"]');
    key(document.body, 'Tab');
    key(document.body, 'Tab');
    expect(deviceUp()).toBe(false);
    key(document.body, 'Tab');
    key(document.body, 'Escape');
    expect(deviceUp()).toBe(false);
    expect(t.shell.isDeviceUp()).toBe(false);
    expect(t.renders).toHaveBeenCalledTimes(1);
    expect(t.q('input[name="cmd"]')).toBe(input);
  });

  it('with the history open, Esc closes the history first and the device second', () => {
    const t = setup();
    t.q('[data-action="history"]')!.click();
    key(document.body, 'Tab');
    expect(deviceUp()).toBe(true);
    key(document.body, 'Escape');
    expect(t.q('.alius-curtain')!.dataset.open).toBe('false'); // the scene closed the history; the shell left this Esc alone
    expect(deviceUp()).toBe(true);
    key(document.body, 'Escape');
    expect(deviceUp()).toBe(false);
  });

  it('Tab while typing, or from a control, only moves focus', () => {
    const t = setup();
    key(t.q('input[name="cmd"]')!, 'Tab');
    expect(deviceUp()).toBe(false);
    key(t.q('[data-action="history"]')!, 'Tab');
    expect(deviceUp()).toBe(false);
    key(document.body, 'Tab', { shiftKey: true });
    expect(deviceUp()).toBe(false);
    expect(t.onDeviceRefused).not.toHaveBeenCalled();
  });

  it('busy hands: Tab does not raise it, the shell says so once, and the scene flashes the line', () => {
    const t = setup({ locked: true });
    key(document.body, 'Tab');
    expect(deviceUp()).toBe(false);
    expect(t.onDeviceRefused).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-flash][data-analyze="glossary:device_out_of_reach"]')).not.toBeNull();
    t.locked.on = false;
    key(document.body, 'Tab');
    expect(deviceUp()).toBe(true);
  });

  it('a reply arriving while it is up redraws the scene underneath; a shell refresh redraws the tab and keeps the scene', () => {
    const t = setup();
    key(document.body, 'Tab');
    t.messages.push(msg(1, { text: 'A new reply.' }));
    t.screen().handle({ type: 'transcript' });
    expect([...document.querySelectorAll('.alius-reply-text')].at(-1)!.textContent).toBe('A new reply.');
    const input = t.q('input[name="cmd"]');
    t.shell.refresh();
    expect(t.renders).toHaveBeenCalledTimes(1);
    expect(t.q('input[name="cmd"]')).toBe(input);
    expect(deviceUp()).toBe(true);
  });

  it('leaving the scene drops the device; the hub and the PDA are as before', () => {
    const t = setup();
    key(document.body, 'Tab');
    t.shell.showScreen('hub');
    expect(document.querySelector('.alius-scene-device')).toBeNull();
    expect(t.shell.isDeviceUp()).toBe(false);
    key(document.body, 'Tab');
    expect(t.shell.isDeviceUp()).toBe(true); // the hub's own Tab
    t.shell.showScreen('scene');
    expect(deviceUp()).toBe(false); // a scene opens with the device down
  });

  it('1-8 select tabs while the device is up over the scene', () => {
    const t = setup();
    key(document.body, 'Tab');
    key(document.body, '2');
    expect(t.q('.alius-scene-device .alius-tab[aria-selected="true"]')!.textContent).toMatch(/OPS/i);
  });
});
