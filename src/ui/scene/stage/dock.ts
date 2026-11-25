/**
 * P10e §6: her hand of cards. Every card the scene draws (moment, physics, punishment, task, demonstration, milestone, claim, return) lands in
 * one dock at the left of the frame, never over her face. P10e-e (cards.html `render`, normative): one card is open (the one the commander
 * opened, else the newest); the others are strips above it, newest on top, each overlapping the next (the edges of cards in her hand), and a
 * strip shows her name, the kind and the gist (`data-gist`: the engine's short name and the most urgent condition). A card with a clock
 * (`data-run`: a running hold, `data-clock`) never collapses: it is drawn open after the open card. The slots are `display: contents`, so a
 * card's place is its CSS `order`, across slots; the draw functions of the other packages are not changed: each writes into its slot, and
 * `layout()` decorates what they drew after every redraw. A card can be set aside to a counter ("2 waiting", a click brings them back).
 * When each card first came (its age) and what was set aside are remembered by `sceneId|slot|the card's first data id` (module memory;
 * `resetSceneStage()` forgets it). Drawn at once, the first card in the slots' order counts as the newest.
 */
import { analyzeNative } from '../../analyze/mark';
import { h } from '../../dom';
import { gistRuns } from '../cards/gist';

export const DOCK_SLOTS = ['moment', 'posture-call', 'physics', 'punishment', 'task', 'demonstration', 'milestone', 'claim', 'return'] as const;

export interface Dock {
  element: HTMLElement;
  /** The element a draw function writes its cards into. */
  slot(name: string): HTMLElement;
  /** Opens one card, collapses the rest and hides what was set aside; call it after every redraw. */
  layout(sceneId: string): void;
}

const setAside = new Set<string>();
/** When each card first came: a larger number is newer (by key). */
const ages = new Map<string, number>();
let age = 0;
export function resetDock(): void {
  setAside.clear();
  ages.clear();
  age = 0;
}

/** A card with a clock: a running hold (`data-run`, drawn by the physics panel) or any card that marks `data-clock`. Real time: never folded away. */
const running = (card: HTMLElement): boolean => card.hasAttribute('data-run') || card.hasAttribute('data-clock');

const SKIP = /^data-(analyze|dock|open|collapsed|set-aside|voice|gist|scard)/;
/** The first `data-*` id on the card (or on a descendant, for a card that carries none itself); the index when there is none. */
function idOf(card: HTMLElement, index: number): string {
  const own = card.getAttributeNames().find((n) => n.startsWith('data-') && !SKIP.test(n));
  if (own) return `${own}=${card.getAttribute(own)}`;
  const inner = card.querySelector<HTMLElement>('[data-task],[data-punishment],[data-milestone],[data-claim],[data-moment],[data-demonstration]');
  const attr = inner?.getAttributeNames().find((n) => n.startsWith('data-') && !SKIP.test(n));
  return inner && attr ? `${attr}=${inner.getAttribute(attr)}` : `#${index}`;
}

/** The gist of a strip (cards.html `.gist`): drawn into the head line from `data-gist`, the value in her accent as `<b>`. */
function drawGist(card: HTMLElement): void {
  const head = card.querySelector<HTMLElement>(':scope > .alius-scard-head');
  const gist = card.getAttribute('data-gist');
  if (!head || gist === null) return;
  const el = head.querySelector<HTMLElement>(':scope > .alius-scard-gist') ?? head.appendChild(h('span', { class: 'alius-scard-gist' }));
  el.replaceChildren(...gistRuns(gist).map((r) => (r.value ? h('b', {}, r.text) : document.createTextNode(r.text))));
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
      // a card seen for the first time is the newest; drawn at once, the first in the slots' order is the newest of them
      const fresh = cards.filter((c) => !ages.has(c.key));
      for (const c of [...fresh].reverse()) ages.set(c.key, ++age);
      if (fresh.some((c) => !running(c.el))) chosen = null; // a new card opens (cards.html `addCard`)
      const shown = cards.filter((c) => !setAside.has(c.key)).sort((a, b) => ages.get(a.key)! - ages.get(b.key)!); // oldest first, as cards.html's `cards`
      const aside = cards.length - shown.length;
      const openKey = chosen !== null && shown.some((c) => c.key === chosen) ? chosen : (shown.filter((c) => !running(c.el)).at(-1)?.key ?? null);
      if (chosen !== null && openKey !== chosen) chosen = null;
      // cards.html `render`: the strips newest on top, then the open card, then the cards with a clock
      const collapsed = shown.filter((c) => c.key !== openKey && !running(c.el)).reverse();
      const order = [...collapsed, ...shown.filter((c) => c.key === openKey), ...shown.filter((c) => running(c.el))];
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
        el.style.order = String(order.findIndex((c) => c.key === key));
        const clock = running(el);
        const isOpen = key === openKey || clock; // a running hold's controls never fold away behind another card (review I2)
        el.dataset.open = String(isOpen);
        if (isOpen) delete el.dataset.collapsed;
        else el.dataset.collapsed = 'true';
        drawGist(el);
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
        // the open card can be set aside (not a card with a clock: cards.html draws it no ×); a collapsed one is only a heading
        const mark = el.querySelector<HTMLElement>(':scope > [data-set-aside]');
        if (isOpen && !clock && !mark) {
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
        } else if ((!isOpen || clock) && mark) mark.remove();
      }
      waiting.hidden = aside === 0;
      waiting.textContent = `${aside} waiting`;
    },
  };
  return dock;
}
