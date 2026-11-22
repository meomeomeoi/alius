/**
 * P10e §5a: a short line over the frame ("The device is out of reach."): one at a time, gone after `ms`, analyzable.
 * Reduced motion draws it and removes it with no fade (css/62-stage.css).
 */
import { analyzeAttrs } from '../../analyze/mark';
import { h } from '../../dom';

export const FLASH_MS = 2400;
const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

export function flashLine(layer: HTMLElement, text: string, analyze: string, ms: number = FLASH_MS): void {
  for (const old of layer.querySelectorAll<HTMLElement>('[data-flash]')) {
    const t = timers.get(old);
    if (t) clearTimeout(t);
    old.remove();
  }
  const el = h('p', { class: 'alius-flash', 'data-flash': '', role: 'status', ...analyzeAttrs(analyze) }, text);
  layer.append(el);
  timers.set(el, setTimeout(() => el.remove(), ms));
}
