import type { CampaignState } from '../../engine/state/types';
import { getSettings, updateSettings } from '../../settings';
import type { ContentError } from '../../content/types';
import type { StAdapter } from '../../st/adapter';
import type { LoadResult } from '../../st/persistence';
import { h } from '../dom';
import { createModalHost, type ModalOpts } from './modal';
import { createRouter, type ScreenId } from './router';
import { renderSysTab } from './sysTab';
import { TAB_IDS, createTabBar, tabStub, type TabId } from './tabs';
import { createToasts, type ToastKind } from './toast';

export type { ScreenId } from './router';
export type { TabId } from './tabs';

export interface ShellApi {
  open(): void;
  close(): void;
  isOpen(): boolean;
  showScreen(id: ScreenId): void;
  showTab(id: TabId): void;
  registerTab(id: TabId, render: (host: HTMLElement) => void): void;
  toast(kind: ToastKind, text: string): void;
  modal(opts: ModalOpts): Promise<string | null>;
  setPalette(p: 'amber' | 'green' | 'white'): void;
  refresh(): void;
  /** Removes the global hotkey listener (tests, hot reload). */
  destroy(): void;
}

export interface ShellDeps {
  st: StAdapter;
  getState: () => CampaignState | null;
  getLoad: () => LoadResult;
  /** Lets the SYS tab (state editor, import) replace the campaign. */
  replaceState?: (state: CampaignState) => void;
  /** Content pack errors shown in the SYS debug panel. */
  getContentErrors?: () => ContentError[];
  /** Extra buttons for the SYS debug panel (e.g. inject a test directive). */
  debugTools?: Array<{ label: string; run: () => void }>;
}

const PANEL_ID = 'alius-panel';
const FRAME_FILL = '═'.repeat(300);

function isEditable(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable === true;
}

export function createShell(deps: ShellDeps): ShellApi {
  const { st } = deps;
  const router = createRouter();
  const tabRenderers = new Map<TabId, (host: HTMLElement) => void>();
  let tab: TabId = 'squad';

  let root: HTMLElement | null = null;
  let view: HTMLElement;
  let bannerHost: HTMLElement;
  let toasts: ReturnType<typeof createToasts> | null = null;
  let modals: ReturnType<typeof createModalHost> | null = null;
  let tabBar: ReturnType<typeof createTabBar> | null = null;
  let panel: HTMLElement | null = null;

  const isOpen = () => root !== null;

  function toast(kind: ToastKind, text: string): void {
    if (toasts) toasts.show(kind, text);
    else st.toast(kind, text);
  }

  function applySettings(): void {
    if (!root) return;
    const s = getSettings(st);
    root.dataset.palette = s.palette;
    root.classList.toggle('alius-scanlines', s.scanlines);
    root.classList.toggle('alius-flicker', s.flicker);
  }

  function renderBanner(): void {
    if (!root) return;
    bannerHost.replaceChildren();
    const load = deps.getLoad();
    if (load.kind === 'readonly') {
      bannerHost.append(
        h('div', { class: 'alius-banner', role: 'alert' }, `READ-ONLY CAMPAIGN — changes will not be saved. ${load.reason}`),
      );
    }
  }

  function renderTab(): void {
    if (!panel) return;
    panel.replaceChildren();
    panel.setAttribute('aria-labelledby', `alius-tab-${tab}`);
    if (tab === 'sys') {
      renderSysTab(panel, {
        st,
        getState: deps.getState,
        getLoad: deps.getLoad,
        replaceState: deps.replaceState,
        getContentErrors: deps.getContentErrors,
        debugTools: deps.debugTools,
        toast,
        modal: (o) => api.modal(o),
        onSettingsChanged: applySettings,
      });
      return;
    }
    const render = tabRenderers.get(tab);
    if (render) render(panel);
    else panel.append(tabStub(tab));
  }

  function selectTab(id: TabId): void {
    tab = id;
    tabBar?.setSelected(id);
    renderTab();
  }

  router.register('pda', (host) => {
    tabBar = createTabBar({ onSelect: selectTab, panelId: PANEL_ID });
    panel = h('div', { class: 'alius-screen', id: PANEL_ID, role: 'tabpanel', tabindex: '0' });
    host.append(tabBar.element, panel);
    tabBar.setSelected(tab);
    renderTab();
  });

  function renderView(): void {
    if (!root) return;
    tabBar = null;
    panel = null;
    router.render(view);
  }

  function open(): void {
    if (root) return;
    const toastHost = h('div', { class: 'alius-toasts', 'aria-live': 'polite' });
    const modalLayer = h('div', { class: 'alius-modal-layer' });
    bannerHost = h('div', { class: 'alius-banner-host' });
    view = h('div', { class: 'alius-view' });
    root = h(
      'div',
      { id: 'alius-shell', role: 'application', 'aria-label': 'Alius' },
      h(
        'div',
        { class: 'alius-frame' },
        h(
          'div',
          { class: 'alius-titlebar' },
          h('span', { class: 'alius-frame-corner' }, '╔═[ ALIUS // PDA ]'),
          h('span', { class: 'alius-frame-fill', 'aria-hidden': 'true' }, FRAME_FILL),
          h('button', { type: 'button', class: 'alius-btn alius-close', 'aria-label': 'Close Alius', onclick: close }, '[X]'),
          h('span', { class: 'alius-frame-corner' }, '═╗'),
        ),
        bannerHost,
        view,
        h(
          'div',
          { class: 'alius-footer' },
          h('span', { class: 'alius-frame-corner' }, '╚═ 1-8 tabs · ←/→ move · Alt+Shift+A toggle '),
          h('span', { class: 'alius-frame-fill', 'aria-hidden': 'true' }, FRAME_FILL),
          h('span', { class: 'alius-frame-corner' }, '╝'),
        ),
      ),
      toastHost,
      modalLayer,
    );
    toasts = createToasts(toastHost);
    modals = createModalHost(modalLayer);
    document.body.append(root);
    applySettings();
    renderBanner();
    renderView();
  }

  function close(): void {
    if (!root) return;
    modals?.cancel();
    toasts?.dispose();
    root.remove();
    root = null;
    toasts = null;
    modals = null;
    tabBar = null;
    panel = null;
  }

  const api: ShellApi = {
    open,
    close,
    isOpen,
    showScreen(id) {
      router.go(id);
      renderView();
    },
    showTab(id) {
      tab = id;
      if (!isOpen()) return;
      if (router.current() !== 'pda') {
        router.go('pda');
        renderView();
      } else {
        selectTab(id);
      }
    },
    registerTab(id, render) {
      tabRenderers.set(id, render);
      if (isOpen() && router.current() === 'pda' && tab === id) renderTab();
    },
    toast,
    modal(opts) {
      return modals ? modals.show(opts) : Promise.resolve(null);
    },
    setPalette(p) {
      updateSettings(st, { palette: p });
      applySettings();
    },
    refresh() {
      if (!root) return;
      applySettings();
      renderBanner();
      if (router.current() === 'pda' && panel) renderTab();
      else renderView();
    },
    destroy() {
      close();
      document.removeEventListener('keydown', onKeyDown);
    },
  };

  function onKeyDown(e: KeyboardEvent): void {
    if (e.altKey && e.shiftKey && (e.code === 'KeyA' || e.key.toLowerCase() === 'a')) {
      e.preventDefault();
      if (isOpen()) close();
      else open();
      return;
    }
    if (!isOpen()) return;
    if (e.key === 'Escape' && modals?.isOpen()) {
      e.preventDefault();
      e.stopPropagation();
      modals.cancel();
      return;
    }
    if (/^[1-8]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditable(e.target) && !modals?.isOpen()) {
      if (router.current() === 'pda') selectTab(TAB_IDS[Number(e.key) - 1]);
    }
  }
  document.addEventListener('keydown', onKeyDown);

  return api;
}
