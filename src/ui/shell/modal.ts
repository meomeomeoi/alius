import { h } from '../dom';

export interface ModalOpts {
  title: string;
  body: Node | string;
  actions: Array<{ label: string; value: string }>;
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
          h('button', { type: 'button', class: 'alius-btn', onclick: () => finish(a.value) }, a.label),
        );
        const dialog = h(
          'div',
          { class: 'alius-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title },
          h('div', { class: 'alius-modal-title' }, opts.title),
          h('div', { class: 'alius-modal-body' }, opts.body),
          h('div', { class: 'alius-modal-actions' }, ...buttons),
        );
        const backdrop = h('div', { class: 'alius-modal-backdrop' }, dialog);
        layer.append(backdrop);
        cancelCurrent = () => finish(null);
        buttons[0]?.focus();
      });
    },
  };
}
