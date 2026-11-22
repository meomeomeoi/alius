import { h } from '../dom';
import type { Voice } from '../voice/sources';

/** `story` is a short generated vignette: longer lifetime, line breaks kept. */
export type ToastKind = 'info' | 'warn' | 'error' | 'story';

export interface ToastOpts { voice?: Voice; title?: string; /** A unit's accent (the personal voice): colours the title. */ accent?: string }

const LIFETIME_MS: Record<ToastKind, number> = { info: 4000, warn: 6000, error: 9000, story: 14000 };

export function createToasts(host: HTMLElement) {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  return {
    show(kind: ToastKind, text: string, opts: ToastOpts = {}): void {
      const el = h('div', { class: `alius-toast alius-toast-${kind}`, role: kind === 'error' ? 'alert' : 'status', 'data-voice': opts.voice ?? 'terminal' });
      if (opts.accent) el.style.setProperty('--toast-accent', opts.accent);
      if (opts.title) el.append(h('strong', { class: 'alius-toast-title' }, `${opts.title} `));
      el.append(text);
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
