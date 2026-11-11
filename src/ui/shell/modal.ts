import { h } from '../dom';

export interface ModalOpts {
  title: string;
  body: Node | string;
  /** `disabled` is the reason the action cannot be taken now: the button is greyed and the reason shown beside it. */
  actions: Array<{ label: string; value: string; disabled?: string }>;
}

/** One modal at a time inside `layer`; a new modal cancels the open one. */
export function createModalHost(layer: HTMLElement) {
  let cancelCurrent: (() => void) | null = null;

  return {
    isOpen: () => cancelCurrent !== null,
    cancel: () => cancelCurrent?.(),
    show(opts: ModalOpts): Promise<string | null> {
      cancelCurrent?.();
      const previousFocus = document.activeElement as HTMLElement | null;
      return new Promise((resolve) => {
        const finish = (value: string | null) => {
          cancelCurrent = null;
          backdrop.remove();
          previousFocus?.focus?.();
          resolve(value);
        };
        const buttons = opts.actions.map((a) =>
          h('button', { type: 'button', class: 'alius-btn', disabled: a.disabled !== undefined, title: a.disabled, onclick: () => finish(a.value) }, a.label),
        );
        const reasons = opts.actions.flatMap((a) => (a.disabled !== undefined ? [h('span', { class: 'alius-modal-reason' }, `${a.label} — ${a.disabled}`)] : []));
        const dialog = h(
          'div',
          { class: 'alius-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title },
          h('div', { class: 'alius-modal-title' }, opts.title),
          h('div', { class: 'alius-modal-body' }, opts.body),
          h('div', { class: 'alius-modal-actions' }, ...buttons, ...reasons),
        );
        const backdrop = h('div', { class: 'alius-modal-backdrop' }, dialog);
        layer.append(backdrop);
        cancelCurrent = () => finish(null);
        buttons.find((b) => !(b as HTMLButtonElement).disabled)?.focus();
      });
    },
  };
}
