// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import { renderCombatScreen, type CombatScreen } from '../../src/ui/combat/combatScreen';
import { campaign, loadCore, run } from '../helpers/loyalty';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});
const screens: CombatScreen[] = [];
afterEach(() => {
  screens.splice(0).forEach((s) => s.dispose());
  document.body.innerHTML = '';
});

function open(): CampaignState {
  const r = run(structuredClone(base), reg, {
    type: 'combat/start',
    payload: { encounter: { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1 }, formation: { front: ['unit_ann', 'unit_bea'], back: ['unit_cat'] } },
  });
  r.state.combat!.awaitingCid = 's1';
  r.state.leash.authorizationsLeft = 3;
  return r.state;
}
function mount(state: CampaignState, withCompel = true) {
  const shell = document.createElement('div');
  shell.id = 'alius-shell';
  document.body.append(shell);
  const host = document.createElement('div');
  shell.append(host);
  const cur = { state };
  const onCompel = vi.fn();
  const screen = renderCombatScreen(host, {
    getState: () => cur.state, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }), settings: () => DEFAULT_SETTINGS,
    onAct: vi.fn(), onOrder: vi.fn(), onAuto: vi.fn(), onRetry: vi.fn(), onAccept: vi.fn(), onRetreat: vi.fn(), onClose: vi.fn(),
    ...(withCompel ? { onCompel } : {}),
  });
  screens.push(screen);
  return { host, cur, screen, onCompel };
}
const press = (key: string) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const compelBtn = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('[data-act="compel"]');

describe('combat Compel', () => {
  it('the combat COMPEL control appears only after a refusal and disappears after use', () => {
    const s = open();
    const { host, cur, screen, onCompel } = mount(s);
    expect(compelBtn(host)).toBeNull();
    press('c');
    expect(onCompel).not.toHaveBeenCalled();

    const refused = structuredClone(s);
    refused.combat!.lastRefusal = { orderId: 'steady', targetCid: 's1' };
    cur.state = refused;
    screen.refresh();
    expect(compelBtn(host)!.textContent).toBe('[C] COMPEL');
    compelBtn(host)!.click();
    expect(onCompel).toHaveBeenCalledTimes(1);
    press('c');
    expect(onCompel).toHaveBeenCalledTimes(2);

    const used = structuredClone(refused);
    delete used.combat!.lastRefusal;
    used.combat!.compels = ['unit_ann'];
    cur.state = used;
    screen.refresh();
    expect(compelBtn(host)).toBeNull();
    press('c');
    expect(onCompel).toHaveBeenCalledTimes(2);
  });

  it('shows the authorizations left minus the compels already pledged', () => {
    const s = open();
    const { host, cur, screen } = mount(s);
    expect(host.querySelector('.alius-combat-leash')!.textContent).toBe('LEASH 3');
    const pledged = structuredClone(s);
    pledged.combat!.compels = ['unit_ann', 'unit_bea'];
    cur.state = pledged;
    screen.refresh();
    expect(host.querySelector('.alius-combat-leash')!.textContent).toBe('LEASH 1');
  });

  it('COMPEL is disabled when every authorization is already pledged', () => {
    const s = open();
    s.combat!.lastRefusal = { orderId: 'steady', targetCid: 's1' };
    s.combat!.compels = ['unit_bea', 'unit_cat', 'unit_dee'];
    const { host, onCompel } = mount(s);
    expect(compelBtn(host)!.disabled).toBe(true);
    compelBtn(host)!.click();
    press('c');
    expect(onCompel).not.toHaveBeenCalled();
  });

  it('without the callback there is no control and no leash line', () => {
    const s = open();
    s.combat!.lastRefusal = { orderId: 'steady', targetCid: 's1' };
    const { host } = mount(s, false);
    expect(compelBtn(host)).toBeNull();
    expect(host.querySelector('.alius-combat-leash')).toBeNull();
  });

  it('a mutineer on the enemy side carries her own name', () => {
    const r = run(structuredClone(base), reg, {
      type: 'combat/start',
      payload: { encounter: { enemies: [], mutineers: [{ unitId: 'unit_ann' }], danger: 0 }, formation: { front: ['unit_bea'], back: [] } },
    });
    const { host } = mount(r.state);
    const card = host.querySelector('.alius-combat-enemy-front .alius-cc')!;
    expect(card.textContent).toContain('Ann');
  });
});
