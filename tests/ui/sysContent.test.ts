// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import { renderSysTab, type SysCtx } from '../../src/ui/shell/sysTab';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  document.body.innerHTML = '';
});

function draw(state: CampaignState | null, over: Partial<SysCtx> = {}) {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  const dispatch = vi.fn((_a: { type: string; payload?: unknown }) => [] as Array<{ type: string; [k: string]: unknown }>);
  const host = document.createElement('div');
  document.body.append(host);
  renderSysTab(host, {
    st, getState: () => state, getLoad: () => ({ kind: 'none' }), getRegistries: () => reg, dispatch,
    toast: () => {}, modal: async () => null, onSettingsChanged: () => {}, ...over,
  });
  return { host, dispatch, st, row: (id: string) => host.querySelector<HTMLButtonElement>(`button[data-category="${id}"]`) };
}

describe('SYS › Content (P9d)', () => {
  it('lists the 22 categories of the campaign, each as set', () => {
    const s = campaign(reg, 4);
    s.content = { enabled: ['restraint'] };
    const v = draw(s);
    expect(v.host.textContent).toContain('Content');
    expect(v.host.querySelectorAll('button[data-category]')).toHaveLength(22);
    expect(v.row('restraint')!.getAttribute('aria-pressed')).toBe('true');
    expect(v.row('humiliation')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('a toggle dispatches content/set_categories with the whole new list', () => {
    const s = campaign(reg, 4);
    s.content = { enabled: ['restraint'] };
    const v = draw(s);
    v.row('explicit_scenes')!.click();
    expect(v.dispatch).toHaveBeenLastCalledWith({ type: 'content/set_categories', payload: { enabled: ['restraint', 'explicit_scenes'] } });
    v.row('restraint')!.click();
    expect(v.dispatch).toHaveBeenLastCalledWith({ type: 'content/set_categories', payload: { enabled: [] } });
  });

  it('a refused change is reported and the row snaps back', () => {
    const s = campaign(reg, 4);
    const toast = vi.fn();
    const v = draw(s, { toast, dispatch: () => [{ type: 'error', message: 'A combat is open: finish it first.' }] });
    v.row('restraint')!.click();
    expect(toast).toHaveBeenCalledWith('warn', 'A combat is open: finish it first.');
    expect(v.row('restraint')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('without a campaign it says the categories are set at the start', () => {
    const v = draw(null);
    expect(v.host.querySelectorAll('button[data-category]')).toHaveLength(0);
    expect(v.host.textContent).toContain('Content categories are set when a campaign is started.');
  });

  it('SYS no longer shows Explicit scenes allowed', () => {
    const v = draw(campaign(reg, 4));
    expect(v.host.textContent).not.toContain('Explicit scenes allowed');
    expect(v.host.querySelector('input[name="explicitContent"]')).toBeNull();
    expect(v.host.querySelector('[data-analyze="setting:explicitContent"]')).toBeNull();
  });
});

describe('SYS › Relationships (Task 12)', () => {
  it('has a ruleWording row that is explained and toggles the setting', () => {
    const v = draw(campaign(reg, 4));
    const box = v.host.querySelector<HTMLInputElement>('input[name="ruleWording"]')!;
    expect(box.checked).toBe(true);
    expect(box.closest('label')!.getAttribute('data-analyze')).toBe('setting:ruleWording');
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    expect(getSettings(v.st).ruleWording).toBe(false);
  });
});
