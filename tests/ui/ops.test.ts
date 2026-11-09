// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import type { LoadResult } from '../../src/st/persistence';
import { h } from '../../src/ui/dom';
import { renderOpsTab } from '../../src/ui/ops/opsTab';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  document.body.innerHTML = '';
});

function render(opts: { state?: CampaignState | null; load?: LoadResult } = {}) {
  const state = opts.state === undefined ? campaign(reg, 4) : opts.state;
  const load: LoadResult = opts.load ?? (state ? { kind: 'ok', state, chatId: 'c' } : { kind: 'none' });
  const onDo = vi.fn();
  const onRequisition = vi.fn();
  const host = h('div');
  document.body.append(host);
  renderOpsTab(host, { getState: () => state, getLoad: () => load, registries: reg, onDo, onRequisition });
  const card = (id: string) => host.querySelector<HTMLElement>(`[data-activity="${id}"]`)!;
  const btn = (id: string) => card(id).querySelector<HTMLButtonElement>('button[data-do]')!;
  return { host, onDo, onRequisition, card, btn, state };
}
const change = (el: HTMLSelectElement | HTMLInputElement, value?: string) => {
  if (value !== undefined) el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('OPS tab', () => {
  it('lists every activity with the day clock, in registry order', () => {
    const { host } = render();
    expect(host.textContent).toContain('DAY 001 // MORNING');
    const ids = [...host.querySelectorAll<HTMLElement>('[data-activity]')].map((e) => e.dataset.activity);
    expect(ids).toEqual(['train', 'workshop', 'medbay', 'work', 'scout_net', 'rest', 'mess', 'study', 'talk']);
  });

  it('an activity not available in this slot is shown disabled with the reason', () => {
    const { btn, card } = render();
    expect(btn('mess').disabled).toBe(true);
    expect(card('mess').textContent).toMatch(/not available in the morning/i);
    const evening = campaign(reg, 4);
    evening.slot = 'evening';
    expect(render({ state: evening }).btn('mess').disabled).toBe(false);
  });

  it('at night only rest and talk can be done', () => {
    const s = campaign(reg, 4);
    s.slot = 'night';
    const { btn } = render({ state: s });
    const enabled = ['train', 'workshop', 'medbay', 'work', 'scout_net', 'rest', 'mess', 'study'].filter((id) => !btn(id).disabled);
    expect(enabled).toEqual(['rest']);
    expect(btn('talk').disabled).toBe(true); // needs a companion, but not a slot problem
  });

  it('a disabled activity shows its reason', () => {
    const s = campaign(reg, 4);
    s.day = 2;
    s.commander.injuredUntilDay = 5;
    const { btn, card } = render({ state: s });
    expect(btn('work').disabled).toBe(true);
    expect(card('work').textContent).toMatch(/injured/i);
    expect(btn('rest').disabled).toBe(false);
  });

  it('companion select appears only for optional or required companions', () => {
    const { card } = render();
    expect(card('work').querySelector('select[name="companion"]')).toBeNull();
    expect(card('rest').querySelector('select[name="companion"]')).not.toBeNull();
    const talk = card('talk').querySelector<HTMLSelectElement>('select[name="companion"]')!;
    expect([...talk.options].map((o) => o.value)).toEqual(['', 'unit_ann', 'unit_bea', 'unit_cat', 'unit_dee']);
  });

  it('talk without a companion stays disabled until one is chosen', () => {
    const { btn, card, onDo } = render();
    expect(btn('talk').disabled).toBe(true);
    expect(card('talk').textContent).toMatch(/needs a companion/i);
    change(card('talk').querySelector('select')!, 'unit_bea');
    expect(btn('talk').disabled).toBe(false);
    btn('talk').click();
    expect(onDo).toHaveBeenCalledWith({ activityId: 'talk', companionId: 'unit_bea' });
  });

  it('dead units are not offered as companions', () => {
    const s = campaign(reg, 4);
    s.squad[3].status = 'dead';
    const { card } = render({ state: s });
    const values = [...card('rest').querySelectorAll<HTMLOptionElement>('select[name="companion"] option')].map((o) => o.value);
    expect(values).not.toContain('unit_dee');
  });

  it('DO sends the right request: focus and picked units', () => {
    const { btn, card, onDo } = render();
    expect(btn('train').disabled).toBe(true); // default focus asks for units and none are picked
    const boxes = card('train').querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-unit]');
    expect(boxes).toHaveLength(4);
    boxes[0].checked = true;
    change(boxes[0]);
    boxes[2].checked = true;
    change(boxes[2]);
    expect(btn('train').disabled).toBe(false);
    btn('train').click();
    expect(onDo).toHaveBeenCalledWith({ activityId: 'train', focus: 'units', unitIds: ['unit_ann', 'unit_cat'] });
  });

  it('a focus without units needs no unit picking', () => {
    const { btn, card, onDo } = render();
    change(card('train').querySelector<HTMLSelectElement>('select[name="focus"]')!, 'commander');
    expect(card('train').querySelectorAll('input[data-unit]')).toHaveLength(0);
    btn('train').click();
    expect(onDo).toHaveBeenCalledWith({ activityId: 'train', focus: 'commander' });
  });

  it('choosing a companion hides focus and unit controls and sends only the companion', () => {
    const { btn, card, onDo } = render();
    change(card('train').querySelector<HTMLSelectElement>('select[name="companion"]')!, 'unit_dee');
    expect(card('train').querySelector('select[name="focus"]')).toBeNull();
    expect(card('train').querySelectorAll('input[data-unit]')).toHaveLength(0);
    btn('train').click();
    expect(onDo).toHaveBeenCalledWith({ activityId: 'train', companionId: 'unit_dee' });
  });

  it('shows the cost of an activity', () => {
    const s = campaign(reg, 4);
    s.slot = 'evening';
    expect(render({ state: s }).card('mess').textContent).toContain('2 SUPPLIES');
  });

  it('requisition sends the amount', () => {
    const { host, onRequisition } = render();
    const input = host.querySelector<HTMLInputElement>('input[name="requisition"]')!;
    input.value = '7';
    host.querySelector<HTMLButtonElement>('button[data-requisition]')!.click();
    expect(onRequisition).toHaveBeenCalledWith(7);
    expect(host.textContent).toContain('3 CR per supply');
  });

  it('the requisition amount survives a re-render', () => {
    const state = campaign(reg, 4);
    const host = h('div');
    document.body.append(host);
    const draw = () => renderOpsTab(host, { getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, onDo: vi.fn(), onRequisition: vi.fn() });
    draw();
    const input = host.querySelector<HTMLInputElement>('input[name="requisition"]')!;
    input.value = '9';
    change(input);
    draw();
    expect(host.querySelector<HTMLInputElement>('input[name="requisition"]')!.value).toBe('9');
  });

  it('requisition is disabled without enough credits', () => {
    const s = campaign(reg, 4);
    s.resources.credits = 5;
    const { host } = render({ state: s });
    expect(host.querySelector<HTMLButtonElement>('button[data-requisition]')!.disabled).toBe(true);
  });

  it('no campaign and read-only show a message instead of the list', () => {
    expect(render({ state: null }).host.textContent).toContain('NO ACTIVE CAMPAIGN');
    const ro = render({ state: null, load: { kind: 'readonly', reason: 'broken', chatId: 'c' } });
    expect(ro.host.textContent).toContain('READ-ONLY');
  });

  it('talk companion list excludes grunts, other activities keep them', () => {
    const s = campaign(reg, 4);
    s.squad.find((u) => u.id === 'unit_dee')!.kind = 'grunt';
    const { card } = render({ state: s });
    const talk = card('talk').querySelector<HTMLSelectElement>('select[name="companion"]')!;
    expect([...talk.options].map((o) => o.value)).toEqual(['', 'unit_ann', 'unit_bea', 'unit_cat']);
    const rest = card('rest').querySelector<HTMLSelectElement>('select[name="companion"]')!;
    expect([...rest.options].map((o) => o.value)).toContain('unit_dee');
  });
});
