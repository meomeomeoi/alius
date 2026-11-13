import { parseLinks } from '../../content/links';
import { resolveTarget } from '../../analysis/subject';
import type { PanelModel } from '../../analysis/model';
import { h, type Child } from '../dom';

export interface PanelView {
  model: PanelModel;
  /** Titles of the drill-down trail, oldest first; the last one is the open entry. */
  crumbs: string[];
  /** False at the maximum depth: links render as plain text. */
  canDrill: boolean;
  pinned: boolean;
  /** While above 0 the panel shows the ANALYZING line only; the caller re-renders with 0. */
  analyzingMs: number;
  /** The scan-line wipe on the ANALYZING line (animation mode `full`). */
  wipe: boolean;
}

export interface PanelHandlers {
  link(address: string): void;
  crumb(index: number): void;
  back(): void;
  pin(): void;
}

/** The id part of an address, the default label of a link without one. */
const idPart = (target: string): string => target.slice(target.indexOf(':') + 1);

/** Text with `[[links]]`: only ever text nodes and DOM-built buttons, never markup from content. */
function linked(text: string, view: PanelView, on: PanelHandlers): Child[] {
  return parseLinks(text).map((part) => {
    if (typeof part === 'string') return part;
    const address = resolveTarget(part.target);
    const label = part.label ?? idPart(address);
    if (!view.canDrill) return label;
    return h('button', { type: 'button', class: 'alius-analyze-link', 'data-target': address, onclick: () => on.link(address) }, label);
  });
}

const block = (title: string, cls: string, lines: Child[][]): HTMLElement =>
  h('div', { class: `alius-analyze-block ${cls}` }, h('div', { class: 'alius-analyze-label' }, title), ...lines.map((l) => h('div', { class: 'alius-analyze-line' }, ...l)));

/** Renders the panel into `host`, which becomes the `div.alius-analyze` dialog (its content is replaced). */
export function renderPanel(host: HTMLElement, view: PanelView, on: PanelHandlers): void {
  const { model } = view;
  host.classList.add('alius-analyze');
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-label', `Analysis: ${model.title}`);
  host.toggleAttribute('aria-busy', view.analyzingMs > 0);

  const head = h('div', { class: 'alius-analyze-frame alius-analyze-head' }, '┌─[ ANALYSIS ]');
  const foot = h('div', { class: 'alius-analyze-frame alius-analyze-foot' }, '└─');
  const body = h('div', { class: 'alius-analyze-body' });

  if (view.analyzingMs > 0) {
    body.append(h('div', { class: view.wipe ? 'alius-analyze-line alius-analyze-wipe' : 'alius-analyze-line' }, 'ANALYZING ▒▒▒░░'));
  } else if (model.missing) {
    body.append(h('div', { class: 'alius-analyze-line alius-analyze-missing' }, `NO DATA // ${model.address}`));
  } else {
    const bar: Child[] = [];
    if (view.crumbs.length > 1) bar.push(h('button', { type: 'button', class: 'alius-analyze-back', 'aria-label': 'Back', onclick: () => on.back() }, '[<]'));
    bar.push(h('div', { class: 'alius-analyze-title' }, model.title));
    bar.push(h('button', { type: 'button', class: 'alius-analyze-pin', 'aria-pressed': String(view.pinned), onclick: () => on.pin() }, view.pinned ? '[PINNED]' : '[PIN]'));
    body.append(h('div', { class: 'alius-analyze-bar' }, ...bar));

    if (view.crumbs.length > 1) {
      const last = view.crumbs.length - 1;
      const trail: Child[] = [];
      view.crumbs.forEach((title, i) => {
        if (i > 0) trail.push(' › ');
        trail.push(i === last ? title : h('button', { type: 'button', class: 'alius-analyze-crumb', onclick: () => on.crumb(i) }, title));
      });
      body.append(h('div', { class: 'alius-analyze-crumbs' }, ...trail));
    }
    if (model.text) body.append(h('p', { class: 'alius-analyze-text' }, ...linked(model.text, view, on)));
    if (model.long) body.append(h('p', { class: 'alius-analyze-long' }, ...linked(model.long, view, on)));
    if (model.effects.length) body.append(block('EFFECTS', 'alius-analyze-effects', model.effects.map((l) => linked(l, view, on))));
    if (model.reading) body.append(block('CURRENT READING', 'alius-analyze-reading', model.reading.lines.map((l) => linked(l, view, on))));
    if (model.see.length) {
      const items = model.see.flatMap((target, i): Child[] => [...(i > 0 ? [' · '] : []), ...linked(`[[${target}]]`, view, on)]);
      body.append(h('div', { class: 'alius-analyze-block alius-analyze-see' }, h('div', { class: 'alius-analyze-label' }, 'SEE ALSO'), h('div', { class: 'alius-analyze-line' }, ...items)));
    }
  }
  host.replaceChildren(head, body, foot);
}
