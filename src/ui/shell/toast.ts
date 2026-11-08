import { h } from '../dom';

/** `story` is a short generated vignette: longer lifetime, line breaks kept. */
export type ToastKind = 'info' | 'warn' | 'error' | 'story';

const LIFETIME_MS: Record<ToastKind, number> = { info: 4000, warn: 6000, error: 9000, story: 14000 };

export function createToasts(host: HTMLElement) {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  return {
    show(kind: ToastKind, text: string): void {
      const el = h('div', { class: `alius-toast alius-toast-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, text);
      const remove = () => el.remove();
      el.addEventListener('click', remove);
      host.append(el);
      timers.add(setTimeout(remove, LIFETIME_MS[kind]));
    },
    dispose(): void {
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
  };
}
