// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import type { SceneController } from '../../src/scene/sceneController';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import { h } from '../../src/ui/dom';
import { renderSceneScreen } from '../../src/ui/scene/sceneScreen';
import { campaign, errors, loadCore, run } from '../helpers/loyalty';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];

function setup(participants = [ANN], withOrder = true) {
  let state = campaign(reg, 4);
  const r = run(state, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants, origin: 'event', startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  state = r.state;
  const calls: string[] = [];
  const controller = {
    send: vi.fn(() => { calls.push('send'); return Promise.resolve(); }), propose: vi.fn(), answer: vi.fn(), end: vi.fn(async () => {}),
    edit: vi.fn(async () => {}), stop: vi.fn(), onEdited: vi.fn(), transcript: () => [], onSwipe: vi.fn(), resume: vi.fn(), idle: vi.fn(), dispose: vi.fn(), start: vi.fn(),
  } as unknown as SceneController;
  const onOrder = vi.fn((_id: string) => { calls.push('order'); return false; });
  const onCompel = vi.fn();
  const host = h('div');
  document.body.append(host);
  const screen = renderSceneScreen(host, {
    controller, getState: () => state, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }),
    settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0 }), onEnded: vi.fn(), ...(withOrder ? { onOrder, onCompel } : {}),
  });
  const input = host.querySelector<HTMLInputElement>('input[name="cmd"]')!;
  const enter = () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return {
    host, screen, controller, onOrder, onCompel, calls, input, enter,
    setState: (s: CampaignState) => { state = s; screen.refresh(); },
    state: () => state,
    toggle: () => host.querySelector<HTMLButtonElement>('[data-action="order"]'),
  };
}

describe('scene orders', () => {
  it('the ORDER toggle calls onOrder before sending and shows REFUSED with a COMPEL chip', () => {
    const t = setup();
    expect(t.toggle()!.textContent).toBe('[ORDER]');
    t.toggle()!.click();
    expect(t.toggle()!.getAttribute('aria-pressed')).toBe('true');
    t.input.value = 'Move out.';
    t.enter();
    expect(t.onOrder).toHaveBeenCalledWith(ANN);
    expect(t.controller.send).toHaveBeenCalledWith('Move out.');
    expect(t.calls).toEqual(['order', 'send']); // the order is rolled before the message goes out
    expect(t.host.querySelector('.alius-refused-mark')).toBeNull();

    // the engine recorded her refusal
    const refused = structuredClone(t.state());
    refused.scene!.refusals = [{ unitId: ANN, exchange: 0 }];
    t.setState(refused);
    expect(t.host.querySelector('.alius-hud-unit[data-unit="unit_ann"] .alius-refused-mark')!.textContent).toBe('REFUSED');
    const chip = t.host.querySelector<HTMLButtonElement>('[data-action="compel"]')!;
    expect(chip.textContent).toBe('[ COMPEL ]');
    chip.click();
    expect(t.onCompel).toHaveBeenCalledWith(ANN);
  });

  it('without the toggle on, a message is sent without an order', () => {
    const t = setup();
    t.input.value = 'Hello.';
    t.enter();
    expect(t.onOrder).not.toHaveBeenCalled();
    expect(t.controller.send).toHaveBeenCalledWith('Hello.');
  });

  it('the toggle turns itself off once the message is sent', async () => {
    const t = setup();
    t.toggle()!.click();
    t.input.value = 'Go.';
    t.enter();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.toggle()!.getAttribute('aria-pressed')).toBe('false');
    t.input.value = 'And again.';
    t.enter();
    expect(t.onOrder).toHaveBeenCalledTimes(1);
  });

  it('group scenes pick whom the order is for', () => {
    const t = setup([ANN, BEA]);
    const picker = t.host.querySelector<HTMLSelectElement>('select[name="order-unit"]')!;
    expect([...picker.options].map((o) => o.textContent)).toEqual(['Ann', 'Bea']);
    picker.value = BEA;
    t.toggle()!.click();
    t.input.value = 'Hold.';
    t.enter();
    expect(t.onOrder).toHaveBeenCalledWith(BEA);
    // a one-unit scene has no picker
    document.body.innerHTML = '';
    expect(setup([ANN]).host.querySelector('select[name="order-unit"]')).toBeNull();
  });

  it('every unit that refused gets her own marker and chip; a stale one is not shown after she complied', () => {
    const t = setup([ANN, BEA]);
    const s = structuredClone(t.state());
    s.scene!.refusals = [{ unitId: ANN, exchange: 0 }, { unitId: BEA, exchange: 0 }];
    t.setState(s);
    expect(t.host.querySelectorAll('.alius-refused-mark')).toHaveLength(2);
    expect(t.host.querySelectorAll('[data-action="compel"]')).toHaveLength(2);
    const cleared = structuredClone(s);
    cleared.scene!.refusals = [{ unitId: BEA, exchange: 0 }];
    t.setState(cleared);
    expect(t.host.querySelectorAll('.alius-refused-mark')).toHaveLength(1);
  });

  it('COMPEL is disabled with no authorization left', () => {
    const t = setup();
    const s = structuredClone(t.state());
    s.scene!.refusals = [{ unitId: ANN, exchange: 0 }];
    s.leash.authorizationsLeft = 0;
    t.setState(s);
    const chip = t.host.querySelector<HTMLButtonElement>('[data-action="compel"]')!;
    expect(chip.disabled).toBe(true);
    chip.click();
    expect(t.onCompel).not.toHaveBeenCalled();
  });

  it('without the P6 callbacks there is no toggle and no marker', () => {
    const t = setup([ANN], false);
    expect(t.toggle()).toBeNull();
    const s = structuredClone(t.state());
    s.scene!.refusals = [{ unitId: ANN, exchange: 0 }];
    t.setState(s);
    expect(t.host.querySelector('.alius-refused-mark')).toBeNull();
  });
});
