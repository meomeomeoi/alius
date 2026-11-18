// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import type { CampaignState } from '../../src/engine/state/types';
import { FakeStAdapter } from '../../src/st/fake';
import { renderCombatScreen, type CombatScreen } from '../../src/ui/combat/combatScreen';
import { loadCore, run } from '../helpers/world';
import { specialCampaign } from '../helpers/special';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const screens: CombatScreen[] = [];
afterEach(() => { screens.splice(0).forEach((s) => s.dispose()); document.body.innerHTML = ''; });

function open(state: CampaignState, cp = 3): CampaignState {
  const r = run(state, reg, { type: 'combat/start', payload: { encounter: { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1 }, formation: { front: ['unit_ann', 'unit_bea', 'unit_cat'], back: ['unit_dee'] } } });
  r.state.combat!.awaitingCid = 's1';
  r.state.combat!.cp = cp;
  return r.state;
}
function mount(state: CampaignState) {
  const shell = document.createElement('div');
  shell.id = 'alius-shell';
  document.body.append(shell);
  const host = document.createElement('div');
  shell.append(host);
  const onOrder = vi.fn();
  screens.push(renderCombatScreen(host, {
    getState: () => state, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }), settings: () => DEFAULT_SETTINGS,
    onAct: vi.fn(), onOrder, onAuto: vi.fn(), onRetry: vi.fn(), onAccept: vi.fn(), onRetreat: vi.fn(), onClose: vi.fn(),
  }));
  return { host, onOrder };
}
const button = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('button[data-order="contingency"]');

describe('the contingency order in the combat screen (P12)', () => {
  it('is absent for a commander without the unlock, and the other five keep their keys', () => {
    const { host } = mount(open(specialCampaign(reg)));
    expect(button(host)).toBeNull();
    expect([...host.querySelectorAll('button[data-order]')].map((b) => b.getAttribute('data-key'))).toEqual(['Q', 'W', 'E', 'R', 'T']);
  });

  it('is listed with the sixth key for bloom_paranoia and can be given', () => {
    const { host, onOrder } = mount(open(specialCampaign(reg, 'bloom_paranoia')));
    const b = button(host)!;
    expect(b.getAttribute('data-key')).toBe('Y');
    expect(b.getAttribute('aria-disabled')).toBeNull();
    expect(b.getAttribute('data-analyze')).toBe('orders:contingency');
  });

  it('is soft-disabled (aria-disabled, not disabled) with the reason when it cannot be given', () => {
    const { host, onOrder } = mount(open(specialCampaign(reg, 'bloom_paranoia'), 1));
    const b = button(host)!;
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(b.disabled).toBe(false);
    expect(b.title).toMatch(/needs 2 CP/);
    b.click();
    expect(onOrder).not.toHaveBeenCalled();
  });
});
