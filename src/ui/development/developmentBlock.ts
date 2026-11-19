import { buildKnowledge } from '../../analysis/knowledge';
import type { Registries } from '../../content/types';
import type { CampaignState, DevFact } from '../../engine/state/types';
import { TUNING } from '../../engine/tuning';
import type { AliusSettings } from '../../settings';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';

export interface DevelopmentBlockCtx {
  state: CampaignState;
  registries: Registries;
  settings: AliusSettings;
  unitId: string;
  dispatch: (action: { type: string; payload?: unknown }) => Array<{ type: string; [k: string]: unknown }>;
  /** Called after the engine took a change (the tab draws the block again). */
  onChanged?: () => void;
}

/**
 * The DEVELOPMENT view of one soldier (P14b §5): what she has become and has already shown, in words, read through `Knowledge` (an
 * unshown moment or fact, an accumulator, a pending appraisal and her insight never appear). HOLD per axis and EDIT / REMOVE per fact
 * exist always: with the edit lock on they are `aria-disabled` (still analyzable) and do nothing. No number is rendered.
 */
export function renderDevelopmentBlock(host: HTMLElement, ctx: DevelopmentBlockCtx): void {
  const { state, unitId } = ctx;
  const locked = ctx.settings.editLock !== false;
  const view = buildKnowledge(state, ctx.settings).development(unitId, ctx.registries);
  const send = (action: { type: string; payload?: unknown }): void => {
    ctx.dispatch(action);
    ctx.onChanged?.();
  };
  host.replaceChildren();
  const head = h('p', { class: 'alius-stat', ...analyzeAttrs('glossary:character_development') }, 'DEVELOPMENT');
  host.append(head);

  const control = (label: string, action: string, address: string, run: () => void, pressed?: boolean): HTMLElement =>
    h('button', {
      type: 'button', class: 'alius-btn alius-option', 'data-action': action, 'aria-disabled': locked ? 'true' : null,
      ...(pressed !== undefined ? { 'aria-pressed': String(pressed) } : {}), ...analyzeNative(address), onclick: () => { if (!locked) run(); },
    }, label);

  const axisRow = (a: (typeof view.axes)[number]): HTMLElement =>
    h('div', { class: 'alius-dev-axis', 'data-axis': a.axis },
      h('span', { class: 'alius-stat', ...analyzeAttrs(`development:${unitId}:${a.axis}`) }, `${a.words.charAt(0).toUpperCase()}${a.words.slice(1)}.`),
      control(a.held ? '[ HELD ]' : '[ HOLD ]', 'hold', 'glossary:development_hold', () => send({ type: 'development/hold', payload: { unitId, axis: a.axis, on: !a.held } }), a.held));

  const factRow = (f: DevFact): HTMLElement => {
    const row = h('div', { class: 'alius-dev-fact', 'data-fact': f.id });
    const draw = (editing: boolean): void => {
      if (editing) {
        const ta = h('textarea', { class: 'alius-input', rows: '2', maxlength: String(TUNING.development.factTextMax), 'aria-label': 'Her line' }) as HTMLTextAreaElement;
        ta.value = f.text;
        row.replaceChildren(ta, h('div', { class: 'alius-dev-actions' },
          control('[ SAVE ]', 'save', 'glossary:development_fact', () => send({ type: 'development/edit_fact', payload: { unitId, factId: f.id, text: ta.value } })),
          h('button', { type: 'button', class: 'alius-btn', onclick: () => draw(false) }, '[ CANCEL ]')));
        return;
      }
      row.replaceChildren(
        h('span', { class: 'alius-stat', 'data-role': 'text', ...analyzeAttrs(f.habitId !== undefined ? 'glossary:habit' : 'glossary:development_fact') }, f.text),
        ...(f.edited ? [h('span', { class: 'alius-chip', ...analyzeAttrs('glossary:development_fact') }, 'EDITED')] : []),
        h('div', { class: 'alius-dev-actions' },
          control('[ EDIT ]', 'edit', 'glossary:development_fact', () => draw(true)),
          control('[ REMOVE ]', 'remove', 'glossary:development_fact', () => send({ type: 'development/remove_fact', payload: { unitId, factId: f.id } }))));
    };
    draw(false);
    return row;
  };

  // a habit whose line was pushed out of her list shows with the registry's description
  const lone = view.habits.filter((id) => !view.facts.some((f) => f.habitId === id));
  const loneRows = lone.flatMap((id) => {
    const e = ctx.registries.habits.get(id);
    return e ? [h('div', { class: 'alius-dev-habit', 'data-habit': id }, h('span', { class: 'alius-stat', ...analyzeAttrs(`habits:${id}`) }, String(e.description).replace(/^\s*AUTHOR TO WRITE:\s*/i, '')))] : [];
  });

  if (view.axes.length === 0 && view.facts.length === 0 && loneRows.length === 0) {
    host.append(h('p', { class: 'alius-dim' }, 'NOTHING YET.'));
    return;
  }
  host.append(...view.axes.map(axisRow), ...[...view.facts].reverse().map(factRow), ...loneRows);
}
