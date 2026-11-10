import type { MapCell } from '../../engine/world/nodeMap';
import { h } from '../dom';

export interface NodeMapView {
  rows: MapCell[][];
  /** Reserved for drawing edges; connectivity is already encoded in each cell's state. */
  edges: Record<string, string[]>;
  onMove: (nodeId: string) => void;
  /** Node type names for the nodes whose type is known (accessibility labels). */
  labels?: Record<string, string>;
}

/** Layers left to right joined by `──`; options are buttons, hidden types read `[ ]`, the walked path is highlighted. */
export function renderNodeMap(host: HTMLElement, view: NodeMapView): void {
  const root = h('div', { class: 'alius-nodemap', role: 'group', 'aria-label': 'Expedition map' });
  view.rows.forEach((column, i) => {
    if (i > 0) root.append(h('span', { class: 'alius-nodelink', 'aria-hidden': 'true' }, '──'));
    const col = h('div', { class: 'alius-nodecol' });
    for (const cell of column) {
      const known = cell.text !== '[ ]';
      const name = known ? view.labels?.[cell.nodeId] ?? 'Known' : 'Unknown';
      const status = cell.state === 'option' ? 'reachable' : cell.state === 'ahead' ? 'ahead' : cell.state;
      const classes = ['alius-node', `alius-${cell.state}`, ...(cell.state === 'visited' || cell.state === 'current' ? ['alius-path'] : [])].join(' ');
      const attrs = { class: classes, 'data-node': cell.nodeId, 'aria-label': `${name}, ${status}` };
      col.append(cell.state === 'option'
        ? h('button', { ...attrs, type: 'button', onclick: () => view.onMove(cell.nodeId) }, cell.text)
        : h('span', attrs, cell.text));
    }
    root.append(col);
  });
  host.append(root);
}
