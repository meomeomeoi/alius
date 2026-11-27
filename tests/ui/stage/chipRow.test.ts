// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import type { CampaignState } from '../../../src/engine/state/types';
import type { SceneController } from '../../../src/scene/sceneController';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { h } from '../../../src/ui/dom';
import { renderSceneScreen } from '../../../src/ui/scene/sceneScreen';
import { resetSceneStage } from '../../../src/ui/scene/stage';
import { CHIP_SLOTS, createChipRow } from '../../../src/ui/scene/stage/chipRow';
import { flashLine } from '../../../src/ui/scene/stage/flash';
import { campaign, errors, loadCore, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  resetSceneStage();
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];

describe('createChipRow', () => {
  it('one slot per name, in the given order', () => {
    const host = h('div');
    const row = createChipRow(host, ['a', 'b', 'c']);
    expect([...row.element.children].map((c) => (c as HTMLElement).dataset.slot)).toEqual(['a', 'b', 'c']);
    expect(row.slot('b')).toBe(row.element.children[1]);
    expect(host.firstElementChild).toBe(row.element);
    expect(() => row.slot('nope')).toThrow();
  });

  it('the scene\'s slots are the ones the table names, in order', () => {
    expect(CHIP_SLOTS).toEqual(['generation', 'proposals', 'lead', 'offer', 'rules', 'demands', 'discipline', 'discipline-menus', 'freq', 'lets', 'anticipate']);
  });

  it('a row narrower than its chips shows +N with the hidden count; clicking it expands (and collapses)', () => {
    const host = h('div');
    document.body.append(host);
    const row = createChipRow(host, ['a']);
    const chips = [1, 2, 3, 4].map((n) => h('button', { type: 'button', class: 'alius-chip' }, `c${n}`));
    row.slot('a').append(...chips);
    // the row starts at x = 400 and is 250 px wide; each chip is 100 px wide at 410, 520, 630, 740: the last two lie past its edge
    const box = (left: number, width: number) => () => ({ left, right: left + width, top: 0, bottom: 20, width, height: 20, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
    chips.forEach((c, i) => {
      c.getBoundingClientRect = box(410 + i * 110, 100);
      Object.defineProperty(c, 'offsetLeft', { value: 410 + i * 110, configurable: true }); // the layer's offset, not the row's: it must not be read
    });
    row.element.getBoundingClientRect = box(400, 250);
    Object.defineProperty(row.element, 'clientWidth', { value: 250, configurable: true });
    Object.defineProperty(row.element, 'scrollWidth', { value: 430, configurable: true });
    row.layout();
    expect(row.element.dataset.overflow).toBe('true');
    const more = row.element.querySelector<HTMLElement>('[data-more-chips]')!;
    expect(more.textContent).toBe('+2');
    more.click();
    expect(row.element.dataset.expanded).toBe('true');
    row.layout();
    expect(row.element.querySelector('[data-more-chips]')).not.toBeNull(); // still there to collapse again
    row.element.querySelector<HTMLElement>('[data-more-chips]')!.click();
    expect(row.element.dataset.expanded).toBeUndefined();
  });

  it('a row that fits has no mark', () => {
    const host = h('div');
    const row = createChipRow(host, ['a']);
    row.slot('a').append(h('button', { type: 'button', class: 'alius-chip' }, 'x'));
    row.layout();
    expect(row.element.dataset.overflow).toBeUndefined();
    expect(row.element.querySelector('[data-more-chips]')).toBeNull();
  });
});

describe('flashLine', () => {
  it('adds one analyzable line and removes it after 2400 ms', () => {
    vi.useFakeTimers();
    const layer = h('div');
    flashLine(layer, 'The device is out of reach.', 'glossary:device_out_of_reach');
    const el = layer.querySelector('[data-flash]')!;
    expect(el.textContent).toBe('The device is out of reach.');
    expect(el.getAttribute('data-analyze')).toBe('glossary:device_out_of_reach');
    vi.advanceTimersByTime(2399);
    expect(layer.querySelector('[data-flash]')).not.toBeNull();
    vi.advanceTimersByTime(2);
    expect(layer.querySelector('[data-flash]')).toBeNull();
  });

  it('a second flash replaces the first (one line at a time)', () => {
    vi.useFakeTimers();
    const layer = h('div');
    flashLine(layer, 'one', 'glossary:device_out_of_reach');
    flashLine(layer, 'two', 'glossary:device_out_of_reach');
    expect([...layer.querySelectorAll('[data-flash]')].map((e) => e.textContent)).toEqual(['two']);
    vi.advanceTimersByTime(2500);
    expect(layer.querySelector('[data-flash]')).toBeNull();
  });
});

describe('the chip row on the scene screen', () => {
  function setup(participants: string[], withPunish = true) {
    let state: CampaignState = campaign(reg, 4);
    const r = run(state, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants, origin: 'event', startIndex: 0 } });
    expect(errors(r.events)).toEqual([]);
    state = r.state;
    const controller = { send: vi.fn(), propose: vi.fn(), answer: vi.fn(), end: vi.fn(), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(), transcript: () => [], onSwipe: vi.fn() } as unknown as SceneController;
    const onPunish = vi.fn();
    const host = h('div');
    document.body.append(host);
    const screen = renderSceneScreen(host, {
      controller, getState: () => state, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }),
      settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0 }), onEnded: vi.fn(), ...(withPunish ? { onPunish, onUndoDiscipline: vi.fn() } : {}),
    });
    return { host, screen, onPunish };
  }

  it('every chip host is inside its slot of the one row above the input', () => {
    const t = setup([ANN]);
    const row = t.host.querySelector('.alius-stage-chips .alius-chip-row')!;
    expect([...row.children].map((c) => (c as HTMLElement).dataset.slot)).toEqual([...CHIP_SLOTS]);
    const inSlot = (slot: string, sel: string) => row.querySelector(`[data-slot="${slot}"] ${sel}`);
    expect(inSlot('generation', '.alius-generation-chips')).not.toBeNull();
    expect(inSlot('proposals', '.alius-chips')).not.toBeNull();
    expect(inSlot('lead', '.alius-lead-host')).not.toBeNull();
    expect(inSlot('offer', '.alius-offer-surface')).not.toBeNull();
    expect(inSlot('rules', '.alius-discipline-chips')).not.toBeNull();
    expect(inSlot('demands', '.alius-discipline-chips')).not.toBeNull();
    expect(inSlot('discipline', '.alius-discipline-chips')).not.toBeNull();
    expect(inSlot('discipline-menus', '.alius-discipline-units')).not.toBeNull();
    expect(inSlot('freq', '.alius-freq-chips')).not.toBeNull();
    expect(inSlot('lets', '.alius-lets-host')).not.toBeNull();
  });

  it('the discipline menus are one chip per named woman that opens her menu; an open one stays open across a redraw', () => {
    const t = setup([ANN, BEA]);
    const chips = [...t.host.querySelectorAll<HTMLElement>('[data-discipline-chip]')];
    expect(chips.map((c) => c.dataset.disciplineChip)).toEqual([ANN, BEA]);
    const menu = chips[1].querySelector<HTMLDetailsElement>('details[data-discipline-menu]')!;
    expect(menu.open).toBe(false);
    menu.querySelector('summary')!.click();
    menu.open = true; // (jsdom does not toggle on a summary click)
    t.screen.refresh();
    expect(t.host.querySelector<HTMLDetailsElement>(`[data-discipline-chip="${BEA}"] details`)!.open).toBe(true);
    expect(t.host.querySelector<HTMLDetailsElement>(`[data-discipline-chip="${ANN}"] details`)!.open).toBe(false);
    t.host.querySelector<HTMLButtonElement>(`[data-discipline-chip="${BEA}"] button[data-punish="bench"]`)!.click();
    expect(t.onPunish).toHaveBeenCalledWith(BEA, 'bench', undefined);
  });

  it('no chips without the callback', () => {
    expect(setup([ANN], false).host.querySelector('[data-discipline-chip]')).toBeNull();
  });

  it('the device out of reach is a flash, not a standing line', () => {
    vi.useFakeTimers();
    const t = setup([ANN]);
    expect(t.host.querySelector('[data-analyze="glossary:device_out_of_reach"]')).toBeNull();
    t.screen.flashDeviceOut();
    const el = t.host.querySelector('.alius-layer-moment [data-flash]')!;
    expect(el.getAttribute('data-analyze')).toBe('glossary:device_out_of_reach');
    expect(el.textContent).toBe('The device is out of reach.');
    t.screen.refresh();
    expect(t.host.querySelector('[data-flash]')).not.toBeNull(); // a redraw does not drop it
    vi.advanceTimersByTime(2500);
    expect(t.host.querySelector('[data-flash]')).toBeNull();
  });
});
