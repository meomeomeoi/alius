// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState, ItemInstance } from '../../src/engine/state/types';
import { renderInvTab } from '../../src/ui/inv/invTab';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});
afterEach(() => {
  document.body.innerHTML = '';
});

const inst = (uid: string, itemId: string, over: Partial<ItemInstance> = {}): ItemInstance => ({ uid, itemId, rarity: 'standard', upgrade: 0, affixes: [], ...over });

function mount(mutate: (s: CampaignState) => void = () => {}) {
  const state = structuredClone(base);
  state.resources = { credits: 500, supplies: 3, plyx: 120 };
  mutate(state);
  const host = document.createElement('div');
  document.body.append(host);
  const calls = { onEquip: vi.fn(), onCraft: vi.fn(), onUpgrade: vi.fn(), onReroll: vi.fn(), onDismantle: vi.fn() };
  renderInvTab(host, { getState: () => state, registries: reg, ...calls });
  return { host, calls, state };
}
const shop = (s: CampaignState) => { s.workshopSession = { day: s.day, opsLeft: 3 }; };
const click = (el: Element | null) => (el as HTMLElement).click();
const item = (host: HTMLElement, uid: string) => host.querySelector<HTMLElement>(`[data-uid="${uid}"]`)!;

describe('INV list', () => {
  it('lists items with rarity, upgrade, affixes and wearer, and the resources', () => {
    const { host } = mount((s) => {
      s.inventory.push(inst('it_1', 'item_blade', { rarity: 'refined', upgrade: 2, affixes: ['honed'] }), inst('it_2', 'upper_light'));
      s.squad[0].equipment = { weapon: 'it_1' };
    });
    expect(host.textContent).toContain('CREDITS 500 · SUPPLIES 3 · PLYX 120');
    const first = item(host, 'it_1');
    expect(first.textContent).toContain('Standard Blade');
    expect(first.querySelector('.alius-rarity')!.textContent).toBe('refined');
    expect(first.textContent).toContain('+2');
    expect(first.textContent).toContain('Honed');
    expect(first.textContent).toContain('WORN BY Ann');
    expect(item(host, 'it_2').textContent).not.toContain('WORN BY');
  });

  it('shows an empty storage message and filters by slot', () => {
    expect(mount().host.textContent).toContain('NOTHING IN STORAGE');
    const { host } = mount((s) => { s.inventory.push(inst('it_1', 'item_blade'), inst('it_2', 'upper_light')); });
    click(host.querySelector('[data-filter="weapon"]'));
    expect(host.querySelectorAll('.alius-inv-item')).toHaveLength(1);
    click(host.querySelector('[data-filter="upper"]'));
    expect(item(host, 'it_2')).not.toBeNull();
    click(host.querySelector('[data-filter="all"]'));
    expect(host.querySelectorAll('.alius-inv-item')).toHaveLength(2);
  });

  it('an unknown template is listed as UNKNOWN', () => {
    const { host } = mount((s) => { s.inventory.push(inst('it_9', 'ghost_item')); });
    expect(item(host, 'it_9').textContent).toContain('UNKNOWN ghost_item');
  });
});

describe('compare panel', () => {
  it('shows stat deltas against what the unit wears and the stats after equipping', () => {
    const { host, calls } = mount((s) => {
      s.inventory.push(inst('it_1', 'item_blade'), inst('it_2', 'item_blade', { rarity: 'refined', upgrade: 2 }));
      s.squad[0].equipment = { weapon: 'it_1' };
    });
    click(item(host, 'it_2'));
    const stat = (k: string) => host.querySelector(`[data-stat="${k}"]`)!.textContent!.trim();
    // standard blade 8/4, refined +2 blade round(8 × 1.15 × 1.16) = 11 / round(4 × 1.334) = 5
    expect(stat('atk')).toBe('ATK +3');
    expect(stat('crit')).toBe('CRIT +1');
    expect(host.querySelector('[data-stat="atk"]')!.className).toContain('alius-delta-up');
    expect(host.querySelector('[data-after]')!.textContent).toContain('ATK 32→35');
    expect(host.textContent).toContain('WEARS Standard Blade');
    click(host.querySelector('[data-act="equip"]'));
    expect(calls.onEquip).toHaveBeenCalledWith('unit_ann', 'it_2');
  });

  it('compares for another unit and greys EQUIP with the engine reason when the role cannot wear it', () => {
    const { host, calls } = mount((s) => {
      s.inventory.push(inst('it_1', 'item_precision_rifle'));
    });
    click(item(host, 'it_1'));
    const equip = host.querySelector<HTMLButtonElement>('[data-act="equip"]')!;
    expect(equip.disabled).toBe(true);
    expect(equip.textContent).toContain('NOT CERTIFIED: Precision Rifle');
    click(equip);
    expect(calls.onEquip).not.toHaveBeenCalled();
    expect(host.textContent).toContain('STANDARD ISSUE');
    const picker = host.querySelector<HTMLSelectElement>('[data-compare-unit]')!;
    expect([...picker.options].map((o) => o.value)).toEqual(['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee']);
    picker.value = 'unit_bea';
    picker.dispatchEvent(new Event('change'));
    expect(host.querySelector<HTMLSelectElement>('[data-compare-unit]')!.value).toBe('unit_bea');
  });
});

describe('workshop panel', () => {
  it('only during a session; buttons are greyed with the engine reason', () => {
    expect(mount((s) => { s.inventory.push(inst('it_1', 'item_blade')); }).host.querySelector('.alius-inv-workshop')).toBeNull();
    const { host, calls } = mount((s) => {
      shop(s);
      s.inventory.push(inst('it_1', 'item_blade', { upgrade: 5, affixes: ['honed'] }));
    });
    expect(host.querySelector('.alius-inv-workshop')!.textContent).toContain('3 OPERATIONS LEFT');
    const std = host.querySelector<HTMLButtonElement>('[data-recipe="recipe_item_blade_standard"]')!;
    expect(std.disabled).toBe(false);
    click(std);
    expect(calls.onCraft).toHaveBeenCalledWith('recipe_item_blade_standard');
    const refined = host.querySelector<HTMLButtonElement>('[data-recipe="recipe_item_blade_refined"]')!;
    expect(refined.disabled).toBe(true);
    expect(refined.textContent).toContain('WORKSHOP LEVEL TOO LOW');
    click(item(host, 'it_1'));
    const upgrade = host.querySelector<HTMLButtonElement>('[data-act="upgrade"]')!;
    expect(upgrade.disabled).toBe(true);
    expect(upgrade.textContent).toContain('MAX UPGRADE');
    const reroll = host.querySelector<HTMLButtonElement>('[data-act="reroll"]')!;
    expect(reroll.disabled).toBe(false);
    click(reroll);
    expect(calls.onReroll).toHaveBeenCalledWith('it_1', 0);
  });

  it('not enough resources greys a recipe', () => {
    const { host } = mount((s) => { shop(s); s.resources.credits = 1; });
    const std = host.querySelector<HTMLButtonElement>('[data-recipe="recipe_item_blade_standard"]')!;
    expect(std.disabled).toBe(true);
    expect(std.textContent).toContain('Not enough resources');
  });

  it('dismantle is disabled for equipped items and works for free ones', () => {
    const { host, calls } = mount((s) => {
      shop(s);
      s.inventory.push(inst('it_1', 'item_blade'), inst('it_2', 'item_blade'));
      s.squad[0].equipment = { weapon: 'it_1' };
    });
    click(item(host, 'it_1'));
    const worn = host.querySelector<HTMLButtonElement>('[data-act="dismantle"]')!;
    expect(worn.disabled).toBe(true);
    expect(worn.textContent).toContain('Unequip the item first');
    click(item(host, 'it_2'));
    const free = host.querySelector<HTMLButtonElement>('[data-act="dismantle"]')!;
    expect(free.disabled).toBe(false);
    click(free);
    expect(calls.onDismantle).toHaveBeenCalledWith('it_2');
    click(host.querySelector('[data-act="upgrade"]'));
    expect(calls.onUpgrade).toHaveBeenCalledWith('it_2');
  });

  it('shows nothing without a campaign', () => {
    const host = document.createElement('div');
    renderInvTab(host, { getState: () => null, registries: reg, onEquip: vi.fn(), onCraft: vi.fn(), onUpgrade: vi.fn(), onReroll: vi.fn(), onDismantle: vi.fn() });
    expect(host.textContent).toContain('NO ACTIVE CAMPAIGN');
  });
});
