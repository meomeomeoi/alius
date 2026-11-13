import type { CampaignState } from '../../engine/state/types';
import { getSettings, updateSettings } from '../../settings';
import type { ContentError, Registries } from '../../content/types';
import { attachAnalyzer, type Analyzer } from '../analyze/analyzer';
import type { StAdapter } from '../../st/adapter';
import type { LoadResult } from '../../st/persistence';
import { h } from '../dom';
import { createModalHost, type ModalOpts } from './modal';
import { createRouter, type ScreenId } from './router';
import { renderStatusHeader } from './status';
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
  /** Registers (or replaces) the renderer of a full screen; re-renders it if it is the current one. */
  registerScreen(
    id: ScreenId, render: (host: HTMLElement) => void,
    opts?: { /** Updates the screen in place on `refresh()`; return false to have it rendered from scratch. */ refresh?: (host: HTMLElement) => boolean },
  ): void;
  /** Shows a small unread count on a tab (0 clears it). */
  setTabBadge(id: TabId, count: number): void;
  toast(kind: ToastKind, text: string): void;
  modal(opts: ModalOpts): Promise<string | null>;
  /** Closes the open modal (its promise resolves `null`). */
  closeModal(): void;
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
  /** Dispatches an engine action (the SYS difficulty select uses it). */
  dispatch?: (action: { type: string; payload?: unknown }) => Array<{ type: string; [k: string]: unknown }>;
  /** Extra buttons for the SYS debug panel (e.g. inject a test directive). */
  debugTools?: Array<{ label: string; run: () => void }>;
  /** Called after the SYS tab changed a setting (the app mirrors intimacy settings into the campaign). */
  onSettingsChanged?: () => void;
  /** P7a: content for the analysis tool; without it the shell runs without hover explanations. */
  analyze?: { registries: () => Registries };
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
  const badges = new Map<TabId, number>();
  const screenRefresh = new Map<ScreenId, (host: HTMLElement) => boolean>();
  /** The screen the view currently shows, rendered by `renderView` (so `refresh` may update it in place). */
  let renderedScreen: ScreenId | null = null;

  let root: HTMLElement | null = null;
  let previousFocus: HTMLElement | null = null;
  let view: HTMLElement;
  let bannerHost: HTMLElement;
  let toasts: ReturnType<typeof createToasts> | null = null;
  let modals: ReturnType<typeof createModalHost> | null = null;
  let tabBar: ReturnType<typeof createTabBar> | null = null;
  let panel: HTMLElement | null = null;
  let statusHost: HTMLElement | null = null;
  let analyzer: Analyzer | null = null;

  const isOpen = () => root !== null;

  function toast(kind: ToastKind, text: string): void {
    if (toasts) toasts.show(kind, text);
    else st.toast(kind === 'story' ? 'info' : kind, text);
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

  function renderStatus(): void {
    if (statusHost) renderStatusHeader(statusHost, deps.getState());
  }

  function renderTab(): void {
    if (!panel) return;
    analyzer?.refresh(); // the tab is redrawn: a transient panel would point at removed elements
    panel.replaceChildren();
    panel.setAttribute('aria-labelledby', `alius-tab-${tab}`);
    if (tab === 'sys') {
      renderSysTab(panel, {
        st,
        getState: deps.getState,
        getLoad: deps.getLoad,
        replaceState: deps.replaceState,
        getContentErrors: deps.getContentErrors,
        getRegistries: deps.analyze?.registries,
        dispatch: deps.dispatch,
        debugTools: deps.debugTools,
        toast,
        modal: (o) => api.modal(o),
        onSettingsChanged: () => {
          applySettings();
          deps.onSettingsChanged?.();
        },
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
    for (const [id, n] of badges) tabBar.setBadge(id, n);
    panel = h('div', { class: 'alius-screen', id: PANEL_ID, role: 'tabpanel', tabindex: '0' });
    statusHost = h('div', { class: 'alius-status' });
    host.append(statusHost, tabBar.element, panel);
    renderStatus();
    tabBar.setSelected(tab);
    renderTab();
  });

  function renderView(): void {
    if (!root) return;
    analyzer?.refresh();
    tabBar = null;
    panel = null;
    statusHost = null;
    router.render(view);
    renderedScreen = router.current();
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
          h('span', { class: 'alius-frame-corner' }, '╚═ 1-8 tabs · ←/→ move · ? analyze · Alt+Shift+A toggle '),
          h('span', { class: 'alius-frame-fill', 'aria-hidden': 'true' }, FRAME_FILL),
          h('span', { class: 'alius-frame-corner' }, '╝'),
        ),
      ),
      toastHost,
      modalLayer,
    );
    previousFocus = document.activeElement as HTMLElement | null;
    toasts = createToasts(toastHost);
    modals = createModalHost(modalLayer);
    document.body.append(root);
    const analyze = deps.analyze;
    if (analyze) {
      analyzer = attachAnalyzer(root, {
        getEnv: () => ({ registries: analyze.registries(), state: deps.getState(), settings: getSettings(st) }),
      });
    }
    applySettings();
    renderBanner();
    renderView();
    // SillyTavern keeps focus in its chat box; pull it into the shell so keys do not leak behind the overlay.
    const focusTarget = root.querySelector<HTMLElement>('.alius-tab[aria-selected="true"]') ?? root.querySelector<HTMLElement>('.alius-close');
    focusTarget?.focus();
  }

  function close(): void {
    if (!root) return;
    modals?.cancel();
    toasts?.dispose();
    analyzer?.destroy();
    analyzer = null;
    root.remove();
    root = null;
    if (previousFocus && document.contains(previousFocus)) previousFocus.focus();
    previousFocus = null;
    toasts = null;
    modals = null;
    tabBar = null;
    panel = null;
    statusHost = null;
    renderedScreen = null;
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
    registerScreen(id, render, opts) {
      router.register(id, render);
      if (opts?.refresh) screenRefresh.set(id, opts.refresh);
      else screenRefresh.delete(id);
      if (isOpen() && router.current() === id) renderView();
    },
    setTabBadge(id, count) {
      if (count > 0) badges.set(id, count);
      else badges.delete(id);
      tabBar?.setBadge(id, count);
    },
    toast,
    closeModal() {
      modals?.cancel();
    },
    modal(opts) {
      return modals ? modals.show(opts) : Promise.resolve(null);
    },
    setPalette(p) {
      updateSettings(st, { palette: p });
      applySettings();
    },
    refresh() {
      if (!root) return;
      analyzer?.refresh();
      applySettings();
      renderBanner();
      if (router.current() === 'pda' && panel) {
        renderStatus();
        renderTab();
      }
      else {
        const inPlace = screenRefresh.get(router.current());
        if (inPlace && renderedScreen === router.current() && inPlace(view)) return;
        renderView();
      }
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
