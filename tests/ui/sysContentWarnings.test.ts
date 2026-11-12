// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { renderSysTab, type SysCtx } from '../../src/ui/shell/sysTab';
import { FakeStAdapter } from '../../src/st/fake';
import { emptyRegistries } from '../../src/content/types';

afterEach(() => { document.body.innerHTML = ''; });

const ctx = (st: FakeStAdapter, extra: Partial<SysCtx>): SysCtx => ({
  st, getState: () => null, getLoad: () => ({ kind: 'none' }), toast: () => {}, modal: async () => null, onSettingsChanged: () => {}, ...extra,
});

describe('SYS content warnings', () => {
  it('content warnings list missing descriptions', () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    st.settings.debug = true;
    const reg = emptyRegistries();
    reg.items.set('item_a', { id: 'item_a', name: 'Blade' });
    reg.items.set('item_b', { id: 'item_b', name: 'Axe', description: 'Chops.' });
    const host = document.createElement('div');
    renderSysTab(host, ctx(st, { getRegistries: () => reg }));
    const list = host.querySelector('.alius-content-warnings')!;
    expect(host.textContent).toContain('Content warnings');
    expect(list.textContent).toContain('items · item_a');
    expect(list.textContent).not.toContain('item_b');
  });

  it('says so when nothing is missing, and shows nothing without registries', () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    st.settings.debug = true;
    const clean = document.createElement('div');
    renderSysTab(clean, ctx(st, { getRegistries: () => emptyRegistries() }));
    expect(clean.querySelector('.alius-content-warnings')).toBeNull();
    expect(clean.textContent).toContain('Content warnings');
    expect(clean.textContent).toContain('Every player-visible entry has a description.');
    const none = document.createElement('div');
    renderSysTab(none, ctx(st, {}));
    expect(none.textContent).not.toContain('Content warnings');
  });
});
