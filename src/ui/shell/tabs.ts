import { h } from '../dom';
import { stubText } from './router';

export type TabId = 'squad' | 'ops' | 'map' | 'comms' | 'base' | 'inv' | 'log' | 'sys';

export const TAB_IDS: readonly TabId[] = ['squad', 'ops', 'map', 'comms', 'base', 'inv', 'log', 'sys'];

export const TAB_LABELS: Record<TabId, string> = {
  squad: 'SQUAD', ops: 'OPS', map: 'MAP', comms: 'COMMS', base: 'BASE', inv: 'INV', log: 'LOG', sys: 'SYS',
};

export const tabStub = (id: TabId) => h('pre', { class: 'alius-stub' }, stubText(TAB_LABELS[id]));

/** Builds the tab bar (WAI-ARIA tabs, roving tabindex, ←/→ with wrap-around). */
export function createTabBar(opts: { onSelect: (id: TabId) => void; panelId: string }) {
  const buttons = new Map<TabId, HTMLElement>();
  const bar = h('div', { class: 'alius-tabbar', role: 'tablist', 'aria-label': 'Alius sections' });
  TAB_IDS.forEach((id, i) => {
    if (i > 0) bar.append(h('span', { class: 'alius-sep', 'aria-hidden': 'true' }, ' · '));
    const btn = h(
      'button',
      {
        type: 'button', class: 'alius-tab', role: 'tab', id: `alius-tab-${id}`,
        'aria-controls': opts.panelId, 'aria-selected': 'false', tabindex: '-1',
        onclick: () => opts.onSelect(id),
      },
      TAB_LABELS[id],
    );
    buttons.set(id, btn);
    bar.append(btn);
  });

  bar.addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent;
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    const at = TAB_IDS.findIndex((id) => buttons.get(id) === ev.target);
    if (at < 0) return;
    ev.preventDefault();
    const next = TAB_IDS[(at + (ev.key === 'ArrowRight' ? 1 : TAB_IDS.length - 1)) % TAB_IDS.length];
    opts.onSelect(next);
    buttons.get(next)!.focus();
  });

  return {
    element: bar,
    /** Shows a small count on a tab (0 clears it); counts above 99 read `99+`. */
    setBadge(id: TabId, n: number): void {
      const btn = buttons.get(id);
      if (!btn) return;
      btn.querySelector('.alius-badge')?.remove();
      if (n > 0) {
        btn.append(' ', h('span', { class: 'alius-badge' }, n > 99 ? '99+' : String(n)));
        btn.setAttribute('aria-label', `${TAB_LABELS[id]}, ${n > 99 ? '99+' : n} unread`);
      } else btn.removeAttribute('aria-label');
    },
    setSelected(id: TabId): void {
      for (const [tid, btn] of buttons) {
        const on = tid === id;
        btn.setAttribute('aria-selected', String(on));
        btn.tabIndex = on ? 0 : -1;
      }
    },
  };
}
