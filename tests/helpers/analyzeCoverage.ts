import { buildPanelModel, type AnalyzeEnv } from '../../src/analysis/model';
import { parseSubject } from '../../src/analysis/subject';
import { ANALYZE_MARKERS } from '../../src/ui/analyze/mark';

/** Outer HTML snippets of the elements the coverage rule applies to (shared classes) that carry no `data-analyze`. */
export function markedWithout(host: HTMLElement): string[] {
  return [...host.querySelectorAll(ANALYZE_MARKERS)]
    .filter((el) => !el.hasAttribute('data-analyze'))
    .map((el) => el.outerHTML.slice(0, 140));
}

/** The addresses in `host` whose panel would read NO DATA (bad id, unknown source, missing content). */
export function unresolved(host: HTMLElement, env: AnalyzeEnv): string[] {
  const bad: string[] = [];
  for (const el of host.querySelectorAll('[data-analyze]')) {
    const address = el.getAttribute('data-analyze') ?? '';
    const subject = parseSubject(address, el.getAttribute('data-analyze-ctx'));
    if (!subject || buildPanelModel(subject, env).missing) bad.push(address);
  }
  return [...new Set(bad)];
}

/** How many elements the coverage rule applies to. */
export const markerCount = (host: HTMLElement): number => host.querySelectorAll(ANALYZE_MARKERS).length;

const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex]';

/**
 * Marked elements a keyboard user cannot reach: no `tabindex`, not a native control and without one inside
 * (`?` acts on the focused element's closest `[data-analyze]`, so a label around an input is fine).
 */
export function unreachable(host: HTMLElement): string[] {
  return [...host.querySelectorAll('[data-analyze]')]
    .filter((el) => !el.matches(FOCUSABLE) && el.querySelector(FOCUSABLE) === null)
    .map((el) => el.outerHTML.slice(0, 140));
}
