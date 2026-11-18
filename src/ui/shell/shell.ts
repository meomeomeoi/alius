import type { CampaignState } from '../../engine/state/types';
import { getSettings, updateSettings } from '../../settings';
import type { ContentError, Registries } from '../../content/types';
import { attachAnalyzer, type Analyzer } from '../analyze/analyzer';
import type { StAdapter } from '../../st/adapter';
import type { LoadResult } from '../../st/persistence';
import { playBoot } from '../device/boot';
import { renderChrome } from '../device/chrome';
import { motionReduced, visualFlags } from '../motion';
import type { SoundId } from '../sound/sound';
import { BUILT_IN_SKIN } from '../device/skins';
import type { Entry } from '../../content/types';
import { h } from '../dom';
import { renderKeepingFocus } from '../focus';
import { isControl, isEditable, isInsideOverlay } from './keys';
import { createModalHost, type ModalOpts } from './modal';
import { createRouter, type ScreenId } from './router';
import { renderStatusHeader } from './status';
import type { BuildStats } from '../../llm/context';
import { renderSysTab } from './sysTab';
import { KEY_TABS, TAB_IDS, createTabBar, tabStub, type TabId } from './tabs';
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
  /** P11: a locked tab reads OFFLINE; showing it (by click, key or `showTab`) does nothing until it is unlocked. */
  setTabLocked(id: TabId, locked: boolean): void;
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
  /** P3b: what the last context block spent (the fill indicator of SYS › MEMORY); absent = zeros. */
  lastBuild?: () => BuildStats;
  /** P7a: content for the analysis tool; without it the shell runs without hover explanations. */
  analyze?: { registries: () => Registries };
  /** P10: the casing of the PDA, asked again on every refresh and settings change (absent: the built-in `ccp_standard`). */
  skin?: () => { skin: Entry; assetUrl?: (path: string) => string };
  /** P10b: draws the stickers into the marks layer of the casing; called on every refresh (the casing itself is dressed once). */
  marks?: (layer: HTMLElement) => void;
  /** P10: the UI sounds the shell asks for (device, tabs, toasts, hum); absent = silent. */
  sound?: { play(id: SoundId): void; startHum(): void; stopHum(): void; /** P10b: night halves the gain. */ setNight?(on: boolean): void };
  /** Called when the device goes up or down. */
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
  let tab: TabId = 'home';
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
  /** Tabs the prologue has not opened yet. */
  const lockedTabs = new Set<TabId>();
  let panel: HTMLElement | null = null;
  let statusHost: HTMLElement | null = null;
  let analyzer: Analyzer | null = null;
  let titleEl: HTMLElement | null = null;
  /** The boot plays on the first device-up after `open()` only. */
  let bootPlayed = false;
  let bootAbort: AbortController | null = null;
  let glitchTimer: ReturnType<typeof setTimeout> | null = null;
  let hubHost: HTMLElement | null = null;
  let device: HTMLElement | null = null;
  let hubRender: (host: HTMLElement, device: HTMLElement) => void = defaultHub;

  const isOpen = () => root !== null;

  function toast(kind: ToastKind, text: string, opts?: ToastOpts): void {
    if (toasts) {
      toasts.show(kind, text, opts);
      deps.sound?.play(kind === 'warn' || kind === 'error' ? 'alert' : 'notify');
    }
    else st.toast(kind === 'story' ? 'info' : kind, text);
  }

  /** What the device wears now, so a refresh that changes nothing does not build the casing (and request its frame) again. */
  let dressed: { device: HTMLElement; skin: Entry; assetUrl: ((path: string) => string) | undefined } | null = null;

  /** Dresses the device in the skin the app asks for; the device itself is not rebuilt. */
  function applySkin(): void {
    const chrome = device?.querySelector<HTMLElement>('.alius-device-chrome');
    const screen = device?.querySelector<HTMLElement>('.alius-device-screen');
    if (!device || !chrome || !screen) return;
    const wanted = deps.skin?.();
    const skin = wanted?.skin ?? BUILT_IN_SKIN;
    if (dressed && dressed.device === device && dressed.skin === skin && dressed.assetUrl === wanted?.assetUrl) return;
    renderChrome(chrome, screen, device, skin, wanted?.assetUrl);
    dressed = { device, skin, assetUrl: wanted?.assetUrl };
  }

  /** The stickers of the casing: redrawn on every refresh, while the casing itself is dressed once (`applySkin`). */
  function drawMarks(): void {
    const layer = device?.querySelector<HTMLElement>('.alius-device-marks');
    if (layer) deps.marks?.(layer);
  }

  function applySettings(): void {
    if (!root) return;
    applySkin();
    const s = getSettings(st);
    const flags = visualFlags(s);
    root.dataset.palette = s.palette;
    root.classList.toggle('alius-scanlines', flags.scanlines);
    root.classList.toggle('alius-flicker', flags.flicker);
    root.classList.toggle('alius-readable', s.readableMode);
    root.classList.toggle('alius-reduced-motion', motionReduced(s));
    drawMarks(); // P10b: stickers follow the state on every refresh
    // P10b: the night slot dresses the shell (kept in readable mode: the label and the sound; the CSS drops the dimming there)
    const night = deps.getState()?.slot === 'night';
    if (night) root.dataset.night = 'true';
    else delete root.dataset.night;
    deps.sound?.setNight?.(night);
    deps.sound?.startHum(); // the hum follows ambientHum, mute and volume (and starts with the shell)
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
    const target = panel;
    if (!target) return;
    analyzer?.refresh(); // the tab is redrawn: a transient panel would point at removed elements
    // the focus stays on the same control through the redraw (every action refreshes the shell)
    renderKeepingFocus(target, () => drawTab(target));
  }

  function drawTab(panel: HTMLElement): void {
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
        lastBuild: deps.lastBuild,
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

  /** A 120 ms glitch on the panel when the tab changes (not in readable mode or under reduced motion). */
  function glitch(): void {
    const target = panel;
    if (!target || !visualFlags(getSettings(st)).glitch) return;
    target.classList.add('alius-glitch');
    if (glitchTimer !== null) clearTimeout(glitchTimer);
    glitchTimer = setTimeout(() => {
      glitchTimer = null;
      target.classList.remove('alius-glitch');
    }, 120);
  }

  function selectTab(id: TabId): void {
    if (lockedTabs.has(id)) return;
    const changed = id !== tab;
    tab = id;
    tabBar?.setSelected(id);
    renderTab();
    if (changed) {
      glitch();
      deps.sound?.play('tab');
    }
  }

  /** The boot over the device screen, once per `open()`, the first time the device is up. */
  function maybeBoot(): void {
    if (bootPlayed || !isDeviceUp()) return;
    const screen = device?.querySelector<HTMLElement>('.alius-device-screen');
    if (!screen) return;
    bootPlayed = true;
    const skin = deps.skin?.().skin ?? BUILT_IN_SKIN;
    bootAbort = new AbortController();
    void playBoot(screen, { reduced: motionReduced(getSettings(st)), skinLabel: String(skin.label ?? skin.name), signal: bootAbort.signal });
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

  /**
   * At a narrow width the raised device covers the whole hub: the hub then leaves the focus order (`inert`), so Shift+Tab
   * from the tab bar does not walk into buttons nobody can see. Wide, the hub's left column stays beside the device.
   */
  function syncHubInert(): void {
    const covered = device?.dataset.up === 'true' && window.innerWidth <= NARROW_PX;
    hubHost?.toggleAttribute('inert', covered);
  }

  function updateNarrow(): void {
    device?.classList.toggle('alius-device-narrow', window.innerWidth <= NARROW_PX);
    syncHubInert();
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
    syncHubInert();
  }

  function renderHub(): void {
    const target = hubHost;
    if (!target || !device) return;
    const dev = device;
    // a redraw must not drop the keyboard focus (the next Tab would then toggle the device by surprise)
    renderKeepingFocus(target, () => {
      target.replaceChildren();
      hubRender(target, dev);
    });
  }

  function focusDevice(up: boolean): void {
    const target = up
      ? root?.querySelector<HTMLElement>('.alius-tab[aria-selected="true"]')
      : root?.querySelector<HTMLElement>('[data-open-pda]');
    // never scroll: the device is still below the clipped view while it slides up, and a scrolling focus drags the view (and the hub) with it
    target?.focus({ preventScroll: true });
  }

  /** The hub with the device inside it: used by both the `hub` and the `pda` route (they differ only in `up`). */
  function buildLayer(host: HTMLElement, up: boolean): void {
    tabBar = createTabBar({ onSelect: selectTab, panelId: PANEL_ID, isLocked: (id) => lockedTabs.has(id) });
    for (const [id, n] of badges) tabBar.setBadge(id, n);
    for (const id of lockedTabs) tabBar.setLocked(id, true);
    panel = h('div', { class: 'alius-screen', id: PANEL_ID, role: 'tabpanel', tabindex: '0' });
    statusHost = h('div', { class: 'alius-status' });
    const chrome = h('div', { class: 'alius-device-chrome', 'aria-hidden': 'true' });
    const marks = h('div', { class: 'alius-device-marks', 'aria-hidden': 'true' });
    marks.style.pointerEvents = 'none'; // a sticker is never clickable (peeling goes through a confirm)
    const screen = h('div', { class: 'alius-device-screen' }, statusHost, tabBar.element, panel);
    device = h('div', { class: 'alius-device', 'data-skin': 'ccp_standard', 'data-up': String(up) }, chrome, marks, screen);
    hubHost = h('div', { class: 'alius-hub-host' });
    host.append(hubHost, device);
    applySkin();
    drawMarks();
    applyDevice(up);
    updateNarrow();
    renderHub();
    renderStatus();
    tabBar.setSelected(tab);
    // a tab is drawn only while the device is up: its renderer may mark messages read or clear a badge nobody saw
    if (up) renderTab();
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
    // the view is clipped (overflow hidden) and must never scroll: anything that tries (a focus, a find) is put back at once
    view.addEventListener('scroll', () => {
      if (view && (view.scrollTop !== 0 || view.scrollLeft !== 0)) {
        view.scrollTop = 0;
        view.scrollLeft = 0;
      }
    });
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
        reducedMotion: () => motionReduced(getSettings(st)),
      });
    }
    applySettings();
    renderBanner();
    renderView();
    window.addEventListener('resize', updateNarrow);
    bootPlayed = false;
    maybeBoot();
    // SillyTavern keeps focus in its chat box; pull it into the shell so keys do not leak behind the overlay.
    const focusTarget = (isDeviceUp() ? root.querySelector<HTMLElement>('.alius-tab[aria-selected="true"]') : root.querySelector<HTMLElement>('[data-open-pda]'))
      ?? root.querySelector<HTMLElement>('.alius-close');
    focusTarget?.focus({ preventScroll: true });
  }

  function close(): void {
    if (!root) return;
    modals?.cancel();
    deps.sound?.stopHum();
    toasts?.dispose();
    analyzer?.destroy();
    analyzer = null;
    window.removeEventListener('resize', updateNarrow);
    if (glitchTimer !== null) clearTimeout(glitchTimer);
    glitchTimer = null;
    bootAbort?.abort();
    bootAbort = null;
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
        if (id === 'pda') renderTab();
        focusDevice(id === 'pda');
      } else {
        renderView();
      }
      if (isOpen() && isDeviceUp() !== wasUp) {
        deps.onDevice?.(isDeviceUp());
        deps.sound?.play(isDeviceUp() ? 'open' : 'close');
      }
      maybeBoot();
    },
    showTab(id) {
      if (lockedTabs.has(id)) return;
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
      if (isOpen() && isDeviceUp() && tab === id) renderTab();
    },
    registerScreen(id, render, opts) {
      router.register(id, render);
      if (opts?.refresh) screenRefresh.set(id, opts.refresh);
      else screenRefresh.delete(id);
      if (isOpen() && router.current() === id) renderView();
    },
    setTabLocked(id, locked) {
      if (id === 'home') return; // P10b: HOME is never offline
      if (locked === lockedTabs.has(id)) return;
      if (locked) lockedTabs.add(id);
      else lockedTabs.delete(id);
      tabBar?.setLocked(id, locked);
      // the tab on show went offline: leave it for the first open one rather than keep a module usable behind its label
      if (locked && tab === id) {
        const next = TAB_IDS.find((t) => !lockedTabs.has(t));
        if (next) {
          tab = next;
          tabBar?.setSelected(next);
          if (isOpen() && isDeviceUp()) renderTab();
        }
      }
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
        if (isDeviceUp()) renderTab();
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
      if (!plain || e.shiftKey || isControl(e.target) || isInsideOverlay(e.target) || typing) return;
      if (where === 'hub' || where === 'pda') {
        e.preventDefault();
        api.setDevice(where === 'hub');
      }
      return;
    }
    if (/^[0-8]$/.test(e.key) && plain && !typing) {
      const id = e.key === '0' ? 'home' : KEY_TABS[Number(e.key) - 1];
      if (where === 'pda') selectTab(id);
      else if (where === 'hub') api.showTab(id);
    }
  }
  document.addEventListener('keydown', onKeyDown);

  return api;
}
