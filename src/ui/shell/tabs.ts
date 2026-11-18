import { analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { stubText } from './router';

export type TabId = 'home' | 'squad' | 'ops' | 'map' | 'comms' | 'base' | 'inv' | 'log' | 'sys';

/** P10b: HOME is first and the device's default tab; it is never locked (`UI_TAB_IDS` of P11 does not list it). */
export const TAB_IDS: readonly TabId[] = ['home', 'squad', 'ops', 'map', 'comms', 'base', 'inv', 'log', 'sys'];

/** The tabs the number keys 1–8 open (`0` opens HOME); they keep the order they had before HOME. */
export const KEY_TABS: readonly TabId[] = ['squad', 'ops', 'map', 'comms', 'base', 'inv', 'log', 'sys'];

export const TAB_LABELS: Record<TabId, string> = {
  home: 'HOME', squad: 'SQUAD', ops: 'OPS', map: 'MAP', comms: 'COMMS', base: 'BASE', inv: 'INV', log: 'LOG', sys: 'SYS',
};

export const tabStub = (id: TabId) => h('pre', { class: 'alius-stub' }, stubText(TAB_LABELS[id]));

/** Builds the tab bar (WAI-ARIA tabs, roving tabindex, ←/→ with wrap-around). */
export function createTabBar(opts: { onSelect: (id: TabId) => void; panelId: string; isLocked?: (id: TabId) => boolean }) {
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
    // a tab that is offline is stepped over (P11)
    let next = TAB_IDS[(at + (ev.key === 'ArrowRight' ? 1 : TAB_IDS.length - 1)) % TAB_IDS.length];
    for (let i = 0; i < TAB_IDS.length && opts.isLocked?.(next); i++) {
      const from = TAB_IDS.indexOf(next);
      next = TAB_IDS[(from + (ev.key === 'ArrowRight' ? 1 : TAB_IDS.length - 1)) % TAB_IDS.length];
    }
    if (opts.isLocked?.(next)) return;
    opts.onSelect(next);
    buttons.get(next)!.focus({ preventScroll: true });
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
    /** P11: a locked tab reads OFFLINE and cannot be chosen (`aria-disabled`; the shell refuses it too). */
    setLocked(id: TabId, locked: boolean): void {
      const btn = buttons.get(id);
      if (!btn) return;
      btn.querySelector('.alius-offline')?.remove();
      if (locked) {
        btn.setAttribute('aria-disabled', 'true');
        btn.classList.add('is-offline');
        btn.append(' ', h('span', { class: 'alius-offline', ...analyzeNative('glossary:module_offline') }, 'OFFLINE'));
      } else {
        btn.removeAttribute('aria-disabled');
        btn.classList.remove('is-offline');
      }
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
