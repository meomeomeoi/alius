import { buildPanelModel, type AnalyzeEnv } from '../../analysis/model';
import { parseSubject, type Subject } from '../../analysis/subject';
import type { AliusSettings } from '../../settings';
import { h } from '../dom';
import { renderPanel } from './panel';
import { placePanel } from './place';

/**
 * Interaction of the analysis tool (P7a §1): hover, `?`/F1, long-press, pin and drill-down. One
 * delegated set of listeners on the shell root and on `window`; `destroy()` removes all of them
 * and every timer. Nothing here talks to the engine or to the host application.
 */

export const LONG_PRESS_MS = 400;
export const LONG_PRESS_MOVE_PX = 10;
export const CLOSE_DELAY_MS = 100;
export const MAX_DEPTH = 3;
const SWALLOW_CLICK_MS = 1000;
const ANALYZE = '[data-analyze]';

/** How long the ANALYZING line shows: `full` 600 ms the first time and 150 ms after, `short` 150, `off` or reduced motion 0. */
export function animationMs(mode: AliusSettings['analyzeAnimation'], seenBefore: boolean, reducedMotion: boolean): number {
  if (reducedMotion || mode === 'off') return 0;
  if (mode === 'short') return 150;
  return seenBefore ? 150 : 600;
}

export interface AnalyzerDeps {
  getEnv: () => AnalyzeEnv;
  reducedMotion?: () => boolean;
}

export interface Analyzer {
  /** Opens the panel for a marked element, at a point or (default) under the element. */
  openFor(target: HTMLElement, at?: { x: number; y: number }, opts?: { pinned?: boolean }): void;
  close(): void;
  isOpen(): boolean;
  isPinned(): boolean;
  /** A transient panel closes; a pinned one is rebuilt from the current state. */
  refresh(): void;
  destroy(): void;
}

interface PointerLike { pointerType?: string; clientX: number; clientY: number; shiftKey?: boolean; relatedTarget?: EventTarget | null }

const isTyping = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return !!el && typeof el.tagName === 'string' && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable === true);
};

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A marked element whose address cannot be parsed still opens: the panel reads `NO DATA // <address>`. */
function subjectOf(el: Element): Subject {
  const raw = el.getAttribute('data-analyze') ?? '';
  return parseSubject(raw, el.getAttribute('data-analyze-ctx')) ?? { address: raw, source: '', id: '', data: {} };
}

export function attachAnalyzer(root: HTMLElement, deps: AnalyzerDeps): Analyzer {
  let destroyed = false;
  let panelEl: HTMLElement | null = null;
  let stack: Subject[] = [];
  let pinned = false;
  let anchor = { x: 0, y: 0 };
  const seen = new Set<string>();

  let hoverEl: Element | null = null;
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  let animTimer: ReturnType<typeof setTimeout> | null = null;
  let touchTimer: ReturnType<typeof setTimeout> | null = null;
  let touchStart = { x: 0, y: 0 };
  let swallowTimer: ReturnType<typeof setTimeout> | null = null;
  let swallowing = false;

  const reduced = () => (deps.reducedMotion ? deps.reducedMotion() : prefersReducedMotion());
  const clear = (t: ReturnType<typeof setTimeout> | null) => { if (t !== null) clearTimeout(t); return null; };

  function close(): void {
    hoverTimer = clear(hoverTimer);
    closeTimer = clear(closeTimer);
    animTimer = clear(animTimer);
    hoverEl = null;
    pinned = false;
    stack = [];
    panelEl?.remove();
    panelEl = null;
  }

  /** The tool is off: nothing reacts, and a panel left open is taken down. */
  function enabled(): boolean {
    if (destroyed) return false;
    if (deps.getEnv().settings.analyzeEnabled) return true;
    if (panelEl || hoverTimer !== null || touchTimer !== null) {
      close();
      touchTimer = clear(touchTimer);
    }
    return false;
  }

  function render(analyzingMs: number, wipe: boolean): void {
    if (!panelEl || stack.length === 0) return;
    const env = deps.getEnv();
    const models = stack.map((s) => buildPanelModel(s, env));
    renderPanel(
      panelEl,
      { model: models[models.length - 1], crumbs: models.map((m) => m.title), canDrill: stack.length < MAX_DEPTH, pinned, analyzingMs, wipe },
      { link: drill, crumb: truncate, back: pop, pin: togglePin },
    );
    const rect = panelEl.getBoundingClientRect();
    const { left, top } = placePanel(anchor, { w: rect.width, h: rect.height }, { w: window.innerWidth, h: window.innerHeight });
    panelEl.style.left = `${left}px`;
    panelEl.style.top = `${top}px`;
  }

  /** Plays the ANALYZING line by the animation rule, then shows the entry. */
  function present(): void {
    animTimer = clear(animTimer);
    const top = stack[stack.length - 1];
    if (!top) return;
    const mode = deps.getEnv().settings.analyzeAnimation;
    const ms = animationMs(mode, seen.has(top.address), reduced());
    seen.add(top.address);
    if (ms > 0) {
      render(ms, mode === 'full');
      animTimer = setTimeout(() => {
        animTimer = null;
        render(0, false);
      }, ms);
    } else {
      render(0, false);
    }
  }

  /** Redraws the current entry unless the ANALYZING line is still playing (its timer draws it). */
  function rerender(): void {
    if (animTimer === null) render(0, false);
  }

  function pin(): void {
    pinned = true;
    closeTimer = clear(closeTimer);
    rerender();
  }

  function togglePin(): void {
    if (pinned) close();
    else pin();
  }

  function drill(address: string): void {
    if (!panelEl || stack.length >= MAX_DEPTH) return;
    stack.push(parseSubject(address) ?? { address, source: '', id: '', data: {} });
    pinned = true;
    present();
  }

  function truncate(index: number): void {
    if (!panelEl || index < 0 || index >= stack.length - 1) return;
    stack = stack.slice(0, index + 1);
    present();
  }

  function pop(): void {
    if (stack.length <= 1) return close();
    stack.pop();
    present();
  }

  function openFor(target: HTMLElement, at?: { x: number; y: number }, opts?: { pinned?: boolean }): void {
    if (!enabled()) return;
    hoverTimer = clear(hoverTimer);
    closeTimer = clear(closeTimer);
    const rect = target.getBoundingClientRect();
    anchor = at ?? { x: rect.left, y: rect.bottom };
    stack = [subjectOf(target)];
    pinned = opts?.pinned === true;
    if (!panelEl) {
      panelEl = h('div', { class: 'alius-analyze' });
      root.append(panelEl);
    }
    present();
  }

  // --- mouse

  const onOver = (ev: Event): void => {
    const e = ev as unknown as PointerLike;
    if (!enabled() || e.pointerType === 'touch') return;
    const t = ev.target as Element | null;
    if (!t || typeof t.closest !== 'function') return;
    if (panelEl?.contains(t)) {
      closeTimer = clear(closeTimer);
      return;
    }
    if (pinned) return;
    const el = t.closest(ANALYZE);
    if (!el || !root.contains(el)) return;
    if (el === hoverEl) {
      closeTimer = clear(closeTimer);
      return;
    }
    if (panelEl) close(); // another target: the old panel goes at once
    hoverEl = el;
    hoverTimer = clear(hoverTimer);
    const at = { x: e.clientX, y: e.clientY };
    hoverTimer = setTimeout(() => {
      hoverTimer = null;
      if (hoverEl === el && enabled()) openFor(el as HTMLElement, at);
    }, deps.getEnv().settings.analyzeHoverDelay);
  };

  const onOut = (ev: Event): void => {
    const e = ev as unknown as PointerLike;
    if (!enabled() || e.pointerType === 'touch') return;
    const from = ev.target as Node | null;
    const to = (e.relatedTarget ?? null) as Node | null;
    const leavingTarget = hoverEl !== null && from !== null && hoverEl.contains(from) && !(to && hoverEl.contains(to));
    if (leavingTarget && hoverTimer !== null) {
      hoverTimer = clear(hoverTimer);
      hoverEl = null;
    }
    if (!panelEl || pinned) return;
    const leavingPanel = from !== null && panelEl.contains(from);
    if (!leavingTarget && !leavingPanel) return;
    if (to && ((hoverEl && hoverEl.contains(to)) || panelEl.contains(to))) return;
    if (e.shiftKey) return pin();
    closeTimer = clear(closeTimer);
    closeTimer = setTimeout(() => {
      closeTimer = null;
      close();
    }, CLOSE_DELAY_MS);
  };

  // --- touch: a long-press opens pinned and swallows the click that follows

  function stopSwallowing(): void {
    swallowTimer = clear(swallowTimer);
    swallowing = false;
    window.removeEventListener('click', swallow, true);
  }
  function swallow(ev: Event): void {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    stopSwallowing();
  }

  const onDown = (ev: Event): void => {
    const e = ev as unknown as PointerLike;
    if (!enabled()) return;
    const t = ev.target as Element | null;
    if (panelEl && pinned && !(t && panelEl.contains(t))) close();
    if (e.pointerType !== 'touch' || !t || typeof t.closest !== 'function' || (panelEl && panelEl.contains(t))) return;
    const el = t.closest(ANALYZE);
    if (!el || !root.contains(el)) return;
    touchTimer = clear(touchTimer);
    touchStart = { x: e.clientX, y: e.clientY };
    touchTimer = setTimeout(() => {
      touchTimer = null;
      if (!enabled()) return;
      stopSwallowing();
      swallowing = true;
      window.addEventListener('click', swallow, true);
      swallowTimer = setTimeout(stopSwallowing, SWALLOW_CLICK_MS);
      openFor(el as HTMLElement, touchStart, { pinned: true });
    }, LONG_PRESS_MS);
  };

  const onMove = (ev: Event): void => {
    if (touchTimer === null) return;
    const e = ev as unknown as PointerLike;
    if (Math.hypot(e.clientX - touchStart.x, e.clientY - touchStart.y) > LONG_PRESS_MOVE_PX) touchTimer = clear(touchTimer);
  };
  const onUp = (): void => {
    touchTimer = clear(touchTimer);
  };
  const onContextMenu = (ev: Event): void => {
    if (touchTimer !== null || swallowing) ev.preventDefault(); // no browser menu on a long-press
  };

  // --- keyboard (window, capture: Esc must reach us before the shell's modal handler and combat keys)

  const onKey = (ev: Event): void => {
    const e = ev as KeyboardEvent;
    if (!enabled()) return;
    const typing = isTyping(e.target);
    if (e.key === 'Escape') {
      if (!panelEl) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
      return;
    }
    if (e.key === 'Backspace') {
      if (!panelEl || typing) return;
      e.preventDefault();
      pop();
      return;
    }
    const isHelp = e.key === 'F1' || (e.key === '?' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey);
    if (!isHelp) return;
    const active = document.activeElement;
    const el = active && root.contains(active) ? active.closest(ANALYZE) : null;
    if (!el) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    openFor(el as HTMLElement, { x: rect.left, y: rect.bottom }, { pinned: true });
  };

  root.addEventListener('pointerover', onOver);
  root.addEventListener('pointerout', onOut);
  root.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('keydown', onKey, true);

  return {
    openFor,
    close,
    isOpen: () => panelEl !== null,
    isPinned: () => panelEl !== null && pinned,
    refresh() {
      if (!panelEl) return;
      if (!pinned) return close();
      rerender();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      root.removeEventListener('pointerover', onOver);
      root.removeEventListener('pointerout', onOut);
      root.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKey, true);
      stopSwallowing();
      touchTimer = clear(touchTimer);
      close();
    },
  };
}
