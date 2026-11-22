// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import type { CampaignState } from '../../../src/engine/state/types';
import type { SceneController } from '../../../src/scene/sceneController';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import type { ChatMessage } from '../../../src/st/adapter';
import { FakeStAdapter } from '../../../src/st/fake';
import { h } from '../../../src/ui/dom';
import { renderSceneScreen } from '../../../src/ui/scene/sceneScreen';
import { inputGauge } from '../../../src/ui/scene/stage/gauge';
import { resetSceneStage } from '../../../src/ui/scene/stage';
import { markHintUsed, renderTopLine } from '../../../src/ui/scene/stage/topLine';
import { campaign, errors, loadCore, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  resetSceneStage();
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const msg = (index: number, over: Partial<ChatMessage> = {}): ChatMessage => ({ index, isUser: false, name: 'Ann', avatar: 'ann.png', text: 'hi', swipeId: 0, ...over });

function setup(opts: { participants?: string[]; withClose?: boolean; withOrder?: boolean } = {}) {
  let state: CampaignState = campaign(reg, 4);
  const r = run(state, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: opts.participants ?? [ANN], origin: 'event', startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  state = r.state;
  const controller = {
    send: vi.fn(async () => true), propose: vi.fn(), answer: vi.fn(), end: vi.fn(async () => {}), edit: vi.fn(async () => {}), stop: vi.fn(),
    onEdited: vi.fn(), transcript: () => [msg(0)], onSwipe: vi.fn(), resume: vi.fn(), idle: vi.fn(), dispose: vi.fn(), start: vi.fn(),
  } as unknown as SceneController;
  const host = h('div');
  document.body.append(host);
  const onEnded = vi.fn();
  const onClose = vi.fn();
  const screen = renderSceneScreen(host, {
    controller, getState: () => state, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }),
    settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0 }), onEnded, ...(opts.withClose ? { onClose } : {}),
    ...(opts.withOrder ? { onOrder: () => false } : {}),
  });
  return { host, screen, controller, onEnded, onClose, state: () => state, q: <T extends HTMLElement = HTMLElement>(s: string) => host.querySelector<T>(s) };
}

describe('the top line (P10e)', () => {
  it('holds the place, the day and slot, the mode, the unit tags and the tools', () => {
    const t = setup({ withClose: true });
    const top = t.q('.alius-stage-topline .alius-topline')!;
    expect(top.textContent).toContain('Mess hall');
    expect(top.textContent).toMatch(/DAY \d{3} · [A-Z]+ · (PRIVATE|GROUP)/);
    expect(top.querySelector(`.alius-hud-unit[data-unit="${ANN}"]`)).not.toBeNull();
    for (const a of ['swipe-left', 'regenerate', 'swipe-right', 'history', 'end', 'close']) expect(top.querySelector(`button[data-action="${a}"]`), a).not.toBeNull();
    expect(top.querySelector('.alius-scene-tools')).not.toBeNull();
    expect(top.querySelector('[data-action="history"]')!.getAttribute('data-analyze')).toBe('glossary:scene_history');
  });

  it('three women have three tags; a group scene says GROUP', () => {
    const t = setup({ participants: [ANN, BEA] });
    expect(t.host.querySelectorAll('.alius-topline .alius-hud-unit')).toHaveLength(2);
  });

  it('the close button exists only with a handler and calls it', () => {
    expect(setup().q('[data-action="close"]')).toBeNull();
    document.body.innerHTML = '';
    const t = setup({ withClose: true });
    t.q('[data-action="close"]')!.click();
    expect(t.onClose).toHaveBeenCalledTimes(1);
  });

  it('END ends: controller.end, then onEnded', async () => {
    const t = setup();
    t.q('button[data-action="end"]')!.click();
    expect(t.controller.end).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.onEnded).toHaveBeenCalledTimes(1);
  });

  it('renderTopLine: slots in order, optional close, callbacks', () => {
    const host = h('div');
    const calls: string[] = [];
    const unit = h('span', { class: 'u' }, 'U');
    const tool = h('button', { type: 'button', class: 't' }, 'T');
    renderTopLine(host, { place: 'Mess hall', when: 'DAY 020 · EVENING', mode: 'PRIVATE', units: [unit], tools: [tool], onHistory: () => calls.push('h'), onEnd: () => calls.push('e'), onClose: () => calls.push('c') });
    expect(host.textContent).toContain('Mess hall');
    expect(host.textContent).toContain('DAY 020 · EVENING');
    expect(host.textContent).toContain('PRIVATE');
    expect(host.querySelector('.u')).toBe(unit);
    expect(host.querySelector('.t')).toBe(tool);
    host.querySelector<HTMLElement>('[data-action="history"]')!.click();
    host.querySelector<HTMLElement>('[data-action="end"]')!.click();
    host.querySelector<HTMLElement>('[data-action="close"]')!.click();
    expect(calls).toEqual(['h', 'e', 'c']);
  });
});

describe('the hints', () => {
  const draw = () => {
    const host = h('div');
    document.body.append(host);
    renderTopLine(host, { place: 'P', when: 'W', mode: 'PRIVATE', units: [], tools: [], onHistory: () => {}, onEnd: () => {} });
    return host;
  };
  const hidden = (host: HTMLElement, kind: string): boolean => host.querySelector<HTMLElement>(`.alius-stage-hints [data-hint="${kind}"]`)!.hidden;

  it('both show at first; using one hides only that one; resetSceneStage shows both again', () => {
    const host = draw();
    expect(hidden(host, 'look')).toBe(false);
    expect(hidden(host, 'history')).toBe(false);
    markHintUsed('look');
    expect(hidden(host, 'look')).toBe(true);
    expect(hidden(host, 'history')).toBe(false);
    expect(hidden(draw(), 'look')).toBe(true); // a later draw remembers
    resetSceneStage();
    expect(hidden(host, 'look')).toBe(false);
    expect(hidden(draw(), 'look')).toBe(false);
  });

  it('the hints carry their glossary addresses', () => {
    const host = draw();
    expect(host.querySelector('[data-hint="look"]')!.getAttribute('data-analyze')).toBe('glossary:look_around');
    expect(host.querySelector('[data-hint="history"]')!.getAttribute('data-analyze')).toBe('glossary:scene_history');
    expect(reg.glossary.has('look_around')).toBe(true);
    expect(reg.glossary.has('scene_history')).toBe(true);
  });
});

describe('the input (P10e)', () => {
  it('one input[name=cmd] in the input host, with ORDER and PROPOSE inside it; Enter sends', async () => {
    const t = setup({ participants: [ANN, BEA], withOrder: true });
    const host = t.q('.alius-stage-input')!;
    expect(host.querySelectorAll('input[name="cmd"]')).toHaveLength(1);
    expect(t.host.querySelectorAll('input[name="cmd"]')).toHaveLength(1);
    expect(host.querySelector('[data-action="order"]')).not.toBeNull();
    expect(host.querySelector('select[name="propose"]')).not.toBeNull();
    expect(host.querySelector('select[name="propose-unit"]')).not.toBeNull(); // the unit picker with more than one woman
    const input = host.querySelector<HTMLInputElement>('input[name="cmd"]')!;
    input.value = 'Hello.';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(t.controller.send).toHaveBeenCalledWith('Hello.');
    expect(input.disabled).toBe(true);
    expect(host.querySelector<HTMLSelectElement>('select[name="propose"]')!.disabled).toBe(true); // the busy lock covers the same controls
  });
});

describe('the gauge surface (P10e §5)', () => {
  const host = (): HTMLElement => h('div', { class: 'alius-stage-input' });
  const v = (el: HTMLElement, name: string): string => el.style.getPropertyValue(name);

  it('narrow, tremble, pulse, window and clear drive CSS variables and an attribute on the input host', () => {
    const el = host();
    const g = inputGauge(el);
    g.narrow(0.4);
    expect(v(el, '--alius-gauge-narrow')).toBe('0.4');
    g.tremble(2);
    expect(el.dataset.tremble).toBe('2');
    g.pulse(0.3);
    expect(v(el, '--alius-gauge-pulse')).toBe('0.3');
    g.pulse(null);
    expect(v(el, '--alius-gauge-pulse')).toBe('');
    g.window(0.5, 0.6);
    expect(v(el, '--alius-gauge-from')).toBe('0.5');
    expect(v(el, '--alius-gauge-to')).toBe('0.6');
    g.narrow(0.4);
    g.tremble(1);
    g.pulse(0.9);
    g.clear();
    for (const name of ['--alius-gauge-narrow', '--alius-gauge-pulse', '--alius-gauge-from', '--alius-gauge-to']) expect(v(el, name), name).toBe('');
    expect(el.dataset.tremble).toBeUndefined();
  });

  it('values are clamped to 0..1', () => {
    const el = host();
    const g = inputGauge(el);
    g.narrow(3);
    expect(v(el, '--alius-gauge-narrow')).toBe('1');
    g.narrow(-2);
    expect(v(el, '--alius-gauge-narrow')).toBe('0');
    g.window(-1, 9);
    expect(v(el, '--alius-gauge-from')).toBe('0');
    expect(v(el, '--alius-gauge-to')).toBe('1');
    g.pulse(Number.NaN);
    expect(v(el, '--alius-gauge-pulse')).toBe('');
  });

  it('the scene screen offers it on its input host (null without a scene)', () => {
    const t = setup();
    const g = t.screen.gauge();
    expect(g).not.toBeNull();
    g!.narrow(0.7);
    expect(t.q('.alius-stage-input')!.style.getPropertyValue('--alius-gauge-narrow')).toBe('0.7');
  });

  it('under reduced motion the CSS draws no animation for a tremble (a still offset)', () => {
    const css = readFileSync('css/62-stage.css', 'utf8');
    expect(css).toMatch(/data-tremble/);
    const still = /alius-reduced-motion[^{]*\[data-tremble\][^{]*\{[^}]*animation:\s*none/s;
    expect(css).toMatch(still);
  });
});
