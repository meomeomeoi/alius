/**
 * Addresses of analyzable things (P7a): `data-analyze="<source>:<id>"` plus an optional
 * `data-analyze-ctx="<json>"` (unit id and the like). Pure; no DOM.
 */
export interface Subject {
  /** The address as written, `<source>:<id>`. */
  address: string;
  /** `glossary`, `setting` or a registry name. */
  source: string;
  id: string;
  /** The parsed `data-analyze-ctx`; `{}` when absent, invalid or not an object. */
  data: Record<string, unknown>;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Splits at the first `:` (ids may contain colons). A malformed address is `null`. */
export function parseSubject(address: string, ctxJson?: string | null): Subject | null {
  const i = address.indexOf(':');
  if (i <= 0) return null;
  const source = address.slice(0, i);
  const id = address.slice(i + 1);
  if (id === '') return null;
  let data: Record<string, unknown> = {};
  if (ctxJson) {
    try {
      const parsed: unknown = JSON.parse(ctxJson);
      if (isPlainObject(parsed)) data = parsed;
    } catch {
      // bad ctx: the subject still works without it
    }
  }
  return { address, source, id, data };
}

/** A link target is an address or a bare glossary id. */
export function resolveTarget(target: string): string {
  return target.includes(':') ? target : `glossary:${target}`;
}
