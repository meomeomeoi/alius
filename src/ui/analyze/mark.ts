/**
 * Marking things as analyzable (P7a). Every stat, chip and option in the shell carries
 * `data-analyze="<source>:<id>"` (and `data-analyze-ctx` for live values); the coverage test finds
 * the elements that should by their class.
 */
export const ANALYZE_MARKERS = '.alius-stat, .alius-chip, .alius-option';

/** Attributes for `h(...)`: spread them after the element's own so a deliberate `tabindex` can still win. */
export function analyzeAttrs(address: string, ctx?: Record<string, unknown>): Record<string, string> {
  const attrs: Record<string, string> = { 'data-analyze': address };
  if (ctx) attrs['data-analyze-ctx'] = JSON.stringify(ctx);
  attrs.tabindex = '0';
  return attrs;
}
