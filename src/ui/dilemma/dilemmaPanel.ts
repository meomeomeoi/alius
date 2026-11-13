import type { DilemmaScale } from '../../engine/dilemma/types';
import type { SocialStat } from '../../engine/social';
import { analyzeNative } from '../analyze/mark';
import { h } from '../dom';

export interface DilemmaPanelCtx {
  title: string;
  setup: string;
  scale: DilemmaScale;
  /** The model is still writing the options: nothing to choose yet. */
  waiting: boolean;
  /** `check` and `requires` are the option's tags; what it would change is never passed in. */
  options: Array<{ index: number; label: string; disabled: string | null; hasCheck: boolean; check?: { stat: SocialStat; rank: number }; requires?: { stat: SocialStat; rank: number } }>;
  onChoose(index: number): void;
}

const SCALE_LABEL: Record<DilemmaScale, string> = { minor: 'MINOR', major: 'MAJOR', defining: 'DEFINING' };

/**
 * A decision the engine validated: fixed options only, no free text (the engine must be able to check the choice).
 * Every text comes from a model or from content, so it is set as text and never as markup.
 */
export function renderDilemma(host: HTMLElement, ctx: DilemmaPanelCtx): void {
  host.replaceChildren();
  if (ctx.waiting) {
    host.append(h('div', { class: 'alius-dilemma', role: 'status' }, h('p', { class: 'alius-dim' }, 'OVERSIGHT IS DRAFTING YOUR OPTIONS…')));
    return;
  }
  let chosen = false;
  const buttons: HTMLButtonElement[] = [];
  const list = h('div', { class: 'alius-dilemma-options' });
  for (const o of ctx.options) {
    const button = h('button', {
      // soft-disabled (aria-disabled, not `disabled`): a greyed option stays focusable and hoverable, so the analysis panel can
      // explain the requirement that greys it out
      type: 'button', class: 'alius-btn alius-option', 'data-dilemma-option': String(o.index), 'aria-disabled': o.disabled !== null ? 'true' : null,
      ...analyzeNative('glossary:decision_option', { scale: ctx.scale, ...(o.check ? { check: o.check } : {}), ...(o.requires ? { requires: o.requires } : {}) }),
      onclick: () => {
        if (chosen || o.disabled !== null) return;
        chosen = true;
        for (const b of buttons) b.setAttribute('aria-disabled', 'true');
        ctx.onChoose(o.index);
      },
    }, `[ ${o.label} ]${o.hasCheck ? ' — CHECK' : ''}${o.disabled !== null ? ` — ${o.disabled}` : ''}`) as HTMLButtonElement;
    buttons.push(button);
    list.append(button);
  }
  host.append(h('div', { class: 'alius-dilemma' },
    h('h3', {}, ctx.title),
    h('p', { class: 'alius-dim' }, `${SCALE_LABEL[ctx.scale]} DECISION`),
    h('p', { class: 'alius-dilemma-setup' }, ctx.setup),
    list));
}
