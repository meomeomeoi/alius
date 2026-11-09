import { h } from '../dom';

export const CUT_IN_MS = 900;

/**
 * A short full-width slam (CSS animation, removed after 900 ms) for major moments. Other packages reuse it:
 * `cutIn(host, 'dilemma', 'CHOOSE')`. Text is set as text, never as markup. An optional image (a sprite) is shown
 * beside the text (P4: ultimates and breakdowns).
 */
export function cutIn(host: HTMLElement, kind: string, text: string, imageUrl?: string): void {
  const el = h('div', { class: 'alius-cutin', 'data-kind': kind, 'aria-hidden': 'true' });
  if (imageUrl) el.append(h('img', { class: 'alius-cutin-img', src: imageUrl, alt: '' }));
  el.append(document.createTextNode(text));
  host.append(el);
  setTimeout(() => el.remove(), CUT_IN_MS);
}
