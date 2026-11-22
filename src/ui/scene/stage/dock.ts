/**
 * P10e §6: her hand of cards. Every card the scene draws (moment, posture call, physics, punishment, task, demonstration,
 * milestone, claim, return) lands in one dock at the left of the frame, never over her face. One card is open at a time (a running hold stays open beside it); the
 * others collapse to their heading (the first one in the slot order is the newest on top; a click on a collapsed heading opens
 * it). A card can be set aside to a counter ("2 waiting", a click brings them back). The draw functions of the other packages
 * are not changed: each writes into its slot, and `layout()` decorates what they drew after every redraw.
 * Set-aside is remembered by `sceneId|slot|the card's first data id` (module memory; `resetSceneStage()` forgets it).
 */
import { analyzeNative } from '../../analyze/mark';
import { h } from '../../dom';

export const DOCK_SLOTS = ['moment', 'posture-call', 'physics', 'punishment', 'task', 'demonstration', 'milestone', 'claim', 'return'] as const;

export interface Dock {
  element: HTMLElement;
  /** The element a draw function writes its cards into. */
  slot(name: string): HTMLElement;
  /** Opens one card, collapses the rest and hides what was set aside; call it after every redraw. */
  layout(sceneId: string): void;
}

const setAside = new Set<string>();
export function resetDock(): void {
  setAside.clear();
}

/** A hold that is running (`data-run`, drawn by the physics panel): real time, so its controls stay open next to whatever else is open. */
const running = (card: HTMLElement): boolean => card.hasAttribute('data-run');

const SKIP = /^data-(analyze|dock|open|collapsed|set-aside|voice)/;
/** The first `data-*` id on the card (or on a descendant, for a card that carries none itself); the index when there is none. */
function idOf(card: HTMLElement, index: number): string {
  const own = card.getAttributeNames().find((n) => n.startsWith('data-') && !SKIP.test(n));
  if (own) return `${own}=${card.getAttribute(own)}`;
  const inner = card.querySelector<HTMLElement>('[data-task],[data-punishment],[data-milestone],[data-claim],[data-moment],[data-demonstration]');
  const attr = inner?.getAttributeNames().find((n) => n.startsWith('data-') && !SKIP.test(n));
  return inner && attr ? `${attr}=${inner.getAttribute(attr)}` : `#${index}`;
}

export function createDock(host: HTMLElement, names: readonly string[]): Dock {
  const slots = new Map<string, HTMLElement>();
  for (const n of names) slots.set(n, h('div', { class: 'alius-dock-slot', 'data-slot': n }));
  const waiting = h('button', { type: 'button', class: 'alius-dock-waiting', 'aria-label': 'Bring back the cards set aside', ...analyzeNative('glossary:dock_cards') });
  waiting.hidden = true;
  const element = h('div', { class: 'alius-dock' }, ...slots.values(), waiting);
  host.append(element);
  /** The card the commander chose to open (by key). */
  let chosen: string | null = null;
  let scene = '';

  waiting.addEventListener('click', () => {
    for (const k of [...setAside]) if (k.startsWith(`${scene}|`)) setAside.delete(k);
    chosen = null;
    dock.layout(scene);
  });

  const dock: Dock = {
    element,
    slot(name) {
      const s = slots.get(name);
      if (!s) throw new Error(`no dock slot ${name}`);
      return s;
    },
    layout(sceneId) {
      scene = sceneId;
      const cards: Array<{ el: HTMLElement; key: string }> = [];
      for (const [name, slot] of slots) {
        [...slot.children].forEach((c, i) => {
          const el = c as HTMLElement;
          cards.push({ el, key: `${sceneId}|${name}|${idOf(el, i)}` });
        });
      }
      const shown = cards.filter((c) => !setAside.has(c.key));
      const aside = cards.length - shown.length;
      const openKey = chosen !== null && shown.some((c) => c.key === chosen) ? chosen : (shown[0]?.key ?? null);
      if (chosen !== null && openKey !== chosen) chosen = null;
      for (const { el, key } of cards) {
        el.classList.add('alius-dock-card');
        const gone = setAside.has(key);
        el.hidden = gone;
        if (gone) {
          delete el.dataset.open;
          delete el.dataset.collapsed;
          el.querySelector(':scope > [data-set-aside]')?.remove();
          continue;
        }
        const isOpen = key === openKey || running(el); // a running hold's controls never fold away behind another card (review I2)
        el.dataset.open = String(isOpen);
        if (isOpen) delete el.dataset.collapsed;
        else el.dataset.collapsed = 'true';
        // a click on a collapsed card (its heading) opens it
        if (!el.hasAttribute('data-dock-wired')) {
          el.setAttribute('data-dock-wired', '');
          el.addEventListener('click', (ev) => {
            if (el.dataset.collapsed !== 'true') return;
            // a button, link or field inside the heading does only its own action
            if (ev.target instanceof Element && ev.target.closest('button, a, input, select, textarea, summary') !== null) return;
            const k = el.getAttribute('data-dock-key');
            if (k) {
              chosen = k;
              dock.layout(scene);
            }
          });
        }
        el.setAttribute('data-dock-key', key);
        // the open card can be set aside; a collapsed one is only a heading
        const mark = el.querySelector<HTMLElement>(':scope > [data-set-aside]');
        if (isOpen && !mark) {
          el.append(h('button', {
            type: 'button', class: 'alius-dock-aside', 'data-set-aside': '', 'aria-label': 'Set this card aside', title: 'Set aside', ...analyzeNative('glossary:dock_cards'),
            onclick: (ev: Event) => {
              ev.stopPropagation();
              const k = el.getAttribute('data-dock-key');
              if (k) setAside.add(k);
              if (chosen === k) chosen = null;
              dock.layout(scene);
            },
          }, '×'));
        } else if (!isOpen && mark) mark.remove();
      }
      waiting.hidden = aside === 0;
      waiting.textContent = `${aside} waiting`;
    },
  };
  return dock;
}
