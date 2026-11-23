/**
 * P10e §5: every chip of the scene (offers, initiatives, rules, demands, discipline, generation, frequency, the pastime menu)
 * is in one row above the input: small rounded pills. A slot per source keeps each draw function's host where it was; the
 * row scrolls sideways when it does not fit and ends with "+N" (a click wraps it open). (The stop word of a hold is the pill at the
 * posture dial, not a chip: P10e A1.)
 */
import { analyzeNative } from '../../analyze/mark';
import { h } from '../../dom';

/** The row's slots, in order (the table of spec §12a.5 names them). */
export const CHIP_SLOTS = ['generation', 'proposals', 'lead', 'offer', 'rules', 'demands', 'discipline', 'discipline-menus', 'freq', 'lets'] as const;

export interface ChipRow {
  element: HTMLElement;
  slot(name: string): HTMLElement;
  /** Measures the row after a redraw or a resize: sets `data-overflow` and the "+N" button. */
  layout(): void;
}

const ITEMS = '.alius-chip, button, summary, [data-chip-item]';

export function createChipRow(host: HTMLElement, names: readonly string[]): ChipRow {
  const slots = new Map<string, HTMLElement>();
  for (const n of names) slots.set(n, h('div', { class: 'alius-chip-slot', 'data-slot': n }));
  const element = h('div', { class: 'alius-chip-row' }, ...slots.values());
  host.append(element);
  let hidden = 0;

  const items = (): HTMLElement[] =>
    [...element.querySelectorAll<HTMLElement>(ITEMS)].filter((el) => !el.hasAttribute('data-more-chips') && (el.tagName === 'SUMMARY' || el.closest('details') === null));

  const mark = (): HTMLElement => {
    let more = element.querySelector<HTMLElement>('[data-more-chips]');
    if (!more) {
      more = h('button', {
        type: 'button', class: 'alius-chip-more', 'data-more-chips': '', 'aria-label': 'Show every chip', ...analyzeNative('glossary:chip_overflow'),
        onclick: () => {
          if (element.dataset.expanded === 'true') delete element.dataset.expanded;
          else element.dataset.expanded = 'true';
          refreshMark();
        },
      });
      element.append(more);
    }
    return more;
  };
  const refreshMark = (): void => {
    const more = element.querySelector<HTMLElement>('[data-more-chips]');
    if (more) more.textContent = element.dataset.expanded === 'true' ? '−' : `+${hidden}`;
  };

  return {
    element,
    slot(name) {
      const s = slots.get(name);
      if (!s) throw new Error(`no chip slot ${name}`);
      return s;
    },
    layout() {
      if (element.dataset.expanded === 'true') {
        mark();
        refreshMark();
        return;
      }
      // measured against the row itself (not `offsetLeft`, whose parent is whatever positioned ancestor is nearest: review I3)
      const edge = element.getBoundingClientRect().left + element.clientWidth;
      hidden = items().filter((el) => el.getBoundingClientRect().right > edge + 1).length;
      if (hidden > 0) {
        element.dataset.overflow = 'true';
        mark();
        refreshMark();
      } else {
        delete element.dataset.overflow;
        element.querySelector('[data-more-chips]')?.remove();
      }
    },
  };
}
