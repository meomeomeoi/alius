import type { CampaignState } from '../../engine/state/types';
import { getSettings, updateSettings } from '../../settings';
import type { ContentError, Registries } from '../../content/types';
import { attachAnalyzer, type Analyzer } from '../analyze/analyzer';
import type { StAdapter } from '../../st/adapter';
import type { LoadResult } from '../../st/persistence';
import { renderChrome } from '../device/chrome';
import { BUILT_IN_SKIN } from '../device/skins';
import type { Entry } from '../../content/types';
import { h } from '../dom';
import { isControl, isEditable } from './keys';
import { createModalHost, type ModalOpts } from './modal';
import { createRouter, type ScreenId } from './router';
import { renderStatusHeader } from './status';
import { renderSysTab } from './sysTab';
import { TAB_IDS, createTabBar, tabStub, type TabId } from './tabs';
import { createToasts, type ToastKind, type ToastOpts } from './toast';

export type { ScreenId } from './router';
export type { TabId } from './tabs';

export interface ShellApi {
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** `pda` shows the hub with the device up, `hub` with it down; the other screens fill the window. */
  showScreen(id: ScreenId): void;
  /** Shows a tab; from the hub (or before `open()`) this raises the device on it. */
  showTab(id: TabId): void;
  /**
   * Registers (or replaces) the hub renderer. It fills its own host and receives the device element, which the shell
   * places (after the hub) and never rebuilds on a refresh, so the renderer must not move it.
   */
  registerHub(render: (host: HTMLElement, device: HTMLElement) => void): void;
  isDeviceUp(): boolean;
  /** Raises or lowers the device over the hub (no-op on the full-window screens, except that raising goes to the hub). */
  setDevice(up: boolean): void;
  registerTab(id: TabId, render: (host: HTMLElement) => void): void;
  /** Registers (or replaces) the renderer of a full screen; re-renders it if it is the current one. */
  registerScreen(
    id: ScreenId, render: (host: HTMLElement) => void,
    opts?: { /** Updates the screen in place on `refresh()`; return false to have it rendered from scratch. */ refresh?: (host: HTMLElement) => boolean },
  ): void;
  /** Shows a small unread count on a tab (0 clears it). */
  setTabBadge(id: TabId, count: number): void;
  toast(kind: ToastKind, text: string, opts?: ToastOpts): void;
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
  /** P10: the casing of the PDA, asked again on every refresh and settings change (absent: the built-in `ccp_standard`). */
  skin?: () => { skin: Entry; assetUrl?: (path: string) => string };
  /** Called when the device goes up or down (sound and boot hooks). */
  onDevice?(up: boolean): void;
}

const PANEL_ID = 'alius-panel';
const FRAME_FILL = '═'.repeat(300);
/** At or below this window width the device takes the full width instead of the right ~55%. */
const NARROW_PX = 1200;

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
  let titleEl: HTMLElement | null = null;
  let hubHost: HTMLElement | null = null;
  let device: HTMLElement | null = null;
  let hubRender: (host: HTMLElement, device: HTMLElement) => void = defaultHub;

  const isOpen = () => root !== null;

  function toast(kind: ToastKind, text: string, opts?: ToastOpts): void {
    if (toasts) toasts.show(kind, text, opts);
    else st.toast(kind === 'story' ? 'info' : kind, text);
  }

  /** Dresses the device in the skin the app asks for; the device itself is not rebuilt. */
  function applySkin(): void {
    const chrome = device?.querySelector<HTMLElement>('.alius-device-chrome');
    const screen = device?.querySelector<HTMLElement>('.alius-device-screen');
    if (!device || !chrome || !screen) return;
    const wanted = deps.skin?.();
    renderChrome(chrome, screen, device, wanted?.skin ?? BUILT_IN_SKIN, wanted?.assetUrl);
  }

  function applySettings(): void {
    if (!root) return;
    applySkin();
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

  /** Until the hub screen registers itself: a button that raises the device. */
  function defaultHub(host: HTMLElement): void {
    host.append(h('button', { type: 'button', class: 'alius-btn alius-open-pda', 'data-open-pda': true, onclick: () => api.setDevice(true) }, 'OPEN PDA [TAB]'));
  }

  const isDeviceUp = (): boolean => isOpen() && router.current() === 'pda';
  const onHubLayer = (): boolean => router.current() === 'hub' || router.current() === 'pda';

  function updateTitle(): void {
    if (titleEl) titleEl.textContent = router.current() === 'hub' ? '╔═[ ALIUS // OUTPOST ]' : '╔═[ ALIUS // PDA ]';
  }

  function updateNarrow(): void {
    device?.classList.toggle('alius-device-narrow', window.innerWidth <= NARROW_PX);
  }

  /** Puts the device up or down (data, `inert`, `aria-hidden`); the slide itself is CSS. */
  function applyDevice(up: boolean): void {
    if (!device) return;
    device.dataset.up = String(up);
    if (up) {
      device.removeAttribute('inert');
      device.removeAttribute('aria-hidden');
    } else {
      device.setAttribute('inert', '');
      device.setAttribute('aria-hidden', 'true');
    }
  }

  function renderHub(): void {
    if (!hubHost || !device) return;
    hubHost.replaceChildren();
    hubRender(hubHost, device);
  }

  function focusDevice(up: boolean): void {
    const target = up
      ? root?.querySelector<HTMLElement>('.alius-tab[aria-selected="true"]')
      : root?.querySelector<HTMLElement>('[data-open-pda]');
    target?.focus();
  }

  /** The hub with the device inside it: used by both the `hub` and the `pda` route (they differ only in `up`). */
  function buildLayer(host: HTMLElement, up: boolean): void {
    tabBar = createTabBar({ onSelect: selectTab, panelId: PANEL_ID });
    for (const [id, n] of badges) tabBar.setBadge(id, n);
    panel = h('div', { class: 'alius-screen', id: PANEL_ID, role: 'tabpanel', tabindex: '0' });
    statusHost = h('div', { class: 'alius-status' });
    const chrome = h('div', { class: 'alius-device-chrome', 'aria-hidden': 'true' });
    const screen = h('div', { class: 'alius-device-screen' }, statusHost, tabBar.element, panel);
    device = h('div', { class: 'alius-device', 'data-skin': 'ccp_standard', 'data-up': String(up) }, chrome, screen);
    hubHost = h('div', { class: 'alius-hub-host' });
    host.append(hubHost, device);
    applySkin();
    applyDevice(up);
    updateNarrow();
    renderHub();
    renderStatus();
    tabBar.setSelected(tab);
    renderTab();
  }

  router.register('hub', (host) => buildLayer(host, false));
  router.register('pda', (host) => buildLayer(host, true));

  function renderView(): void {
    if (!root) return;
    analyzer?.refresh();
    tabBar = null;
    panel = null;
    statusHost = null;
    hubHost = null;
    device = null;
    router.render(view);
    renderedScreen = router.current();
    updateTitle();
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
          (titleEl = h('span', { class: 'alius-frame-corner' }, '╔═[ ALIUS // OUTPOST ]')),
          h('span', { class: 'alius-frame-fill', 'aria-hidden': 'true' }, FRAME_FILL),
          h('button', { type: 'button', class: 'alius-btn alius-close', 'aria-label': 'Close Alius', onclick: close }, '[X]'),
          h('span', { class: 'alius-frame-corner' }, '═╗'),
        ),
        bannerHost,
        view,
        h(
          'div',
          { class: 'alius-footer' },
          h('span', { class: 'alius-frame-corner' }, '╚═ TAB pda · 1-8 tabs · ←/→ move · ? analyze · Esc back · Alt+Shift+A toggle '),
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
    window.addEventListener('resize', updateNarrow);
    // SillyTavern keeps focus in its chat box; pull it into the shell so keys do not leak behind the overlay.
    const focusTarget = (isDeviceUp() ? root.querySelector<HTMLElement>('.alius-tab[aria-selected="true"]') : root.querySelector<HTMLElement>('[data-open-pda]'))
      ?? root.querySelector<HTMLElement>('.alius-close');
    focusTarget?.focus();
  }

  function close(): void {
    if (!root) return;
    modals?.cancel();
    toasts?.dispose();
    analyzer?.destroy();
    analyzer = null;
    window.removeEventListener('resize', updateNarrow);
    root.remove();
    root = null;
    if (previousFocus && document.contains(previousFocus)) previousFocus.focus();
    previousFocus = null;
    toasts = null;
    modals = null;
    tabBar = null;
    panel = null;
    statusHost = null;
    hubHost = null;
    device = null;
    titleEl = null;
    renderedScreen = null;
  }

  const api: ShellApi = {
    open,
    close,
    isOpen,
    showScreen(id) {
      const wasUp = isDeviceUp();
      const inPlace = isOpen() && (id === 'pda' || id === 'hub') && onHubLayer() && renderedScreen !== null && device !== null;
      router.go(id);
      if (inPlace) {
        // the device slides; nothing is rebuilt, so the hub keeps its state and the transition runs
        renderedScreen = id;
        applyDevice(id === 'pda');
        updateTitle();
        renderHub();
        renderStatus();
        renderTab();
        focusDevice(id === 'pda');
      } else {
        renderView();
      }
      if (isOpen() && isDeviceUp() !== wasUp) deps.onDevice?.(isDeviceUp());
    },
    showTab(id) {
      tab = id;
      if (!isOpen()) {
        router.go('pda'); // open() then lands on the PDA at this tab
        return;
      }
      if (router.current() === 'pda') selectTab(id);
      else {
        tabBar?.setSelected(id);
        api.showScreen('pda');
      }
    },
    registerHub(render) {
      hubRender = render;
      if (isOpen() && onHubLayer()) renderHub();
    },
    isDeviceUp,
    setDevice(up) {
      if (!isOpen() || up === isDeviceUp()) return;
      if (up) api.showScreen('pda');
      else if (router.current() === 'pda') api.showScreen('hub');
    },
    registerTab(id, render) {
      tabRenderers.set(id, render);
      if (isOpen() && onHubLayer() && tab === id) renderTab();
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
      if (onHubLayer() && panel) {
        renderHub();
        renderStatus();
        renderTab();
      } else {
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
    if (modals?.isOpen()) return;
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
    const typing = isEditable(e.target);
    const where = router.current();
    if (e.key === 'Escape') {
      if (where === 'pda' && !typing) {
        e.preventDefault();
        api.setDevice(false);
      }
      return;
    }
    if (e.key === 'Tab') {
      // Tab toggles the device only from a place that is not a control; elsewhere it moves focus as usual
      if (!plain || e.shiftKey || isControl(e.target) || typing) return;
      if (where === 'hub' || where === 'pda') {
        e.preventDefault();
        api.setDevice(where === 'hub');
      }
      return;
    }
    if (/^[1-8]$/.test(e.key) && plain && !typing) {
      const id = TAB_IDS[Number(e.key) - 1];
      if (where === 'pda') selectTab(id);
      else if (where === 'hub') api.showTab(id);
    }
  }
  document.addEventListener('keydown', onKeyDown);

  return api;
}
