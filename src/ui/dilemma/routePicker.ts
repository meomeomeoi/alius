import type { RoutePick, RouteChoice } from '../../engine/commander/checks';
import { analyzeNative } from '../analyze/mark';
import { h } from '../dom';

export interface RoutePickerCtx {
  routes: RouteChoice[];
  /** Display name of a unit id (default: the id). */
  unitName?: (id: string) => string;
  /** True once a pick was sent; every button is then inert. */
  locked: () => boolean;
  onPick: (pick: RoutePick) => void;
}

/**
 * The ways through a routed option (P7). A closed route shows its reason and does nothing; a delegate route asks which
 * unit first. Labels and names come from content or the campaign and are set as text.
 */
export function renderRoutePicker(ctx: RoutePickerCtx): HTMLElement {
  const root = h('div', { class: 'alius-routes' });
  const units = h('div', { class: 'alius-route-units' });
  const buttons: HTMLButtonElement[] = [];
  const lockAll = () => { for (const b of buttons) b.setAttribute('aria-disabled', 'true'); };
  const pick = (p: RoutePick): void => {
    if (ctx.locked()) return;
    lockAll();
    ctx.onPick(p);
  };

  for (const r of ctx.routes) {
    const b = h('button', {
      type: 'button', class: 'alius-btn alius-option', 'data-route': String(r.route), 'aria-disabled': r.disabled !== null ? 'true' : null,
      ...analyzeNative(r.kind === 'delegate' ? 'glossary:delegate' : 'glossary:check_routes', { kind: r.kind }),
      onclick: () => {
        if (ctx.locked() || r.disabled !== null) return;
        if (r.kind !== 'delegate') return pick({ route: r.route });
        units.replaceChildren(...(r.unitIds ?? []).map((id) => {
          const u = h('button', {
            type: 'button', class: 'alius-btn alius-option', 'data-route-unit': id, ...analyzeNative('glossary:delegate'),
            onclick: () => pick({ route: r.route, unitId: id }),
          }, `[ ${ctx.unitName?.(id) ?? id} ]`) as HTMLButtonElement;
          buttons.push(u);
          return u;
        }));
      },
    }, `[ ${r.label} ]${r.disabled !== null ? ` — ${r.disabled}` : ''}`) as HTMLButtonElement;
    buttons.push(b);
    root.append(b);
  }
  root.append(units);
  return root;
}
