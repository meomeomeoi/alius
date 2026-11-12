/**
 * Drill-down links inside content text (P7a): `[[target]]` or `[[target|label]]`.
 * `target` is an address (`items:medkit`) or a bare glossary id (`trust`). A bracket that is not
 * closed, or an empty one, stays plain text.
 */
export type LinkPart = string | { target: string; label?: string };

const LINK = /\[\[([^[\]|]+)(?:\|([^[\]]*))?\]\]/g;

export function parseLinks(text: string): LinkPart[] {
  const out: LinkPart[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const target = m[1].trim();
    const label = m[2]?.trim();
    out.push(label ? { target, label } : { target });
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** The id part of an address: `items:medkit` → `medkit`, a bare id stays as it is. */
function idPart(target: string): string {
  const i = target.indexOf(':');
  return i < 0 ? target : target.slice(i + 1);
}

/** The displayed text: a link becomes its label, else the id part of its target. */
export function stripLinks(text: string): string {
  return parseLinks(text)
    .map((p) => (typeof p === 'string' ? p : p.label ?? idPart(p.target)))
    .join('');
}

export function linkTargets(text: string): string[] {
  return parseLinks(text).flatMap((p) => (typeof p === 'string' ? [] : [p.target]));
}
