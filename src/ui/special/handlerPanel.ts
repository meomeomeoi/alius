import type { Registries } from '../../content/types';
import { handlerLine } from '../../engine/special/debts/handler';
import { paymentFor } from '../../engine/special/debts/intel';
import { INTEL_ANSWERS, type IntelAnswer } from '../../engine/special/state';
import type { CampaignState } from '../../engine/state/types';
import { analyzeNative } from '../analyze/mark';
import { h } from '../dom';

export interface HandlerPanelCtx {
  state: CampaignState;
  reg: Registries;
  /** One answer for the whole visit: every item set. */
  onAnswer(answers: Record<string, IntelAnswer>): void;
}

const LABEL: Record<IntelAnswer, string> = { truth: 'TRUTH', partial: 'PARTIAL', false: 'FALSE', withhold: 'WITHHOLD' };

/**
 * The HANDLER panel of a visit night (P12): one row per piece of intel with the four answers, a payment preview and SUBMIT, which
 * stays soft-disabled (`aria-disabled`) until every row is set. The preview is the full table: the panel never hints at the handler's
 * pressure or suspicion. An answer the engine refuses leaves the panel in place, so it unlocks in a microtask; one that goes through
 * redraws the screen and detaches the panel, so nothing is unlocked then.
 */
export function renderHandlerPanel(host: HTMLElement, ctx: HandlerPanelCtx): void {
  host.replaceChildren();
  const d = ctx.state.special?.debts;
  const visit = d?.visit;
  if (!d || !visit) return;
  const handler = ctx.reg.debtHandlers.get(d.handlerId);
  const corp = String(ctx.reg.corporations.get(d.corporationId)?.name ?? d.corporationId);
  const picked: Record<string, IntelAnswer> = {};
  let locked = false;
  const root = h('div', { class: 'alius-handler' });
  const preview = h('p', { class: 'alius-dim', 'data-preview': '' });
  const submit = h('button', { type: 'button', class: 'alius-btn', 'data-act': 'submit', 'aria-disabled': 'true' }, '[ SUBMIT ]') as HTMLButtonElement;
  const buttons: HTMLButtonElement[] = [];

  const complete = (): boolean => visit.items.every((i) => picked[i.id] !== undefined);
  const refresh = (): void => {
    const pay = paymentFor(picked, 0);
    preview.textContent = `PAYS UP TO ${pay.credits} CR · ${pay.supplies} SUPPLIES · ${pay.plyx} PLYX`;
    if (complete() && !locked) submit.removeAttribute('aria-disabled');
    else submit.setAttribute('aria-disabled', 'true');
  };

  const rows = visit.items.map((item) => {
    const row = h('div', { class: 'alius-handler-row', 'data-intel': item.id }, h('p', {}, item.label));
    const group = h('div', { class: 'alius-handler-answers' });
    for (const a of INTEL_ANSWERS) {
      const b = h('button', {
        type: 'button', class: 'alius-btn alius-option', 'data-answer': a, 'aria-pressed': 'false', ...analyzeNative('glossary:intel_exchange'),
        onclick: () => {
          if (locked) return;
          picked[item.id] = a;
          for (const x of buttons.filter((y) => row.contains(y))) x.setAttribute('aria-pressed', String(x.dataset.answer === a));
          refresh();
        },
      }, LABEL[a]) as HTMLButtonElement;
      buttons.push(b);
      group.append(b);
    }
    row.append(group);
    return row;
  });

  submit.addEventListener('click', () => {
    if (locked || !complete()) return;
    locked = true;
    submit.setAttribute('aria-disabled', 'true');
    ctx.onAnswer({ ...picked });
    queueMicrotask(() => {
      if (!root.isConnected) return;
      locked = false;
      refresh();
    });
  });

  root.append(
    h('h3', {}, `HANDLER // ${String(handler?.name ?? 'Unknown')} — ${corp}`),
    h('p', { class: 'alius-dilemma-setup' }, handlerLine(ctx.reg, d.handlerId, 'greet')),
    ...rows, preview, submit,
  );
  host.append(root);
  refresh();
}
