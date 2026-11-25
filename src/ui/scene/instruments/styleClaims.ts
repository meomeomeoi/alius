/**
 * P10e-e review M4, I4: a stack of owners for the inline styles (and attributes, `@name`) of the scene's elements that more than one surface
 * writes for a while (the slap's camera and an instrument's mount both touch the backdrop and sprites layers and flag the dial).
 *
 * The contract every surface relies on:
 * - `claimStyles(el, props)` saves what those properties are now; the claimant may then write them.
 * - A claimant that writes records what it wrote with `noteWrites(claim)` (the slap does after each frame). A passive claim (the host's
 *   snapshot of a mount) writes nothing and records nothing.
 * - `releaseClaim(claim)`, in any order:
 *   - no other claim holds the property: its saved value is put back;
 *   - an older claim holds it: its saved value is put back (what the older one had there);
 *   - a newer claim holds it: its saved value is handed up to the newer one (which will put it back when it goes); and if the element still
 *     shows this claim's own last write (the newer one never wrote over it), the saved value is put back now as well, so nothing of a
 *     claimant outlives it under a passive claim.
 * - The last claim to let go of a property puts back what was there before any claim came.
 * A leaf: no imports.
 */

/** An attribute is claimed as `@<name>`; anything else is a style property. `null` = absent. */
export interface StyleClaim { el: Element; saved: Map<string, string | null>; wrote?: Map<string, string | null> }

/** In the order they were made (oldest first). */
const claims: StyleClaim[] = [];

const read = (el: Element, prop: string): string | null => {
  if (prop.startsWith('@')) return el.getAttribute(prop.slice(1));
  const v = (el as HTMLElement).style.getPropertyValue(prop);
  return v === '' ? null : v;
};

/** Writes a value (null removes it). */
export function writeStyle(el: Element, prop: string, value: string | null): void {
  if (prop.startsWith('@')) {
    if (value === null) el.removeAttribute(prop.slice(1));
    else el.setAttribute(prop.slice(1), value);
    return;
  }
  if (value === null) (el as HTMLElement).style.removeProperty(prop);
  else (el as HTMLElement).style.setProperty(prop, value);
}

/** Takes these properties of `el`: what they are now is saved, to be put back at `releaseClaim`. */
export function claimStyles(el: Element, props: readonly string[]): StyleClaim {
  const c: StyleClaim = { el, saved: new Map(props.map((p) => [p, read(el, p)])) };
  claims.push(c);
  return c;
}

/** Lets go: each saved value is put back, or handed to a newer claim of the same property (see the module's note). */
export function releaseClaim(c: StyleClaim): void {
  const at = claims.indexOf(c);
  if (at < 0) return;
  claims.splice(at, 1);
  for (const [p, v] of c.saved) {
    const newer = claims.slice(at).find((x) => x.el === c.el && x.saved.has(p));
    if (!newer) { writeStyle(c.el, p, v); continue; }
    newer.saved.set(p, v);
    if (c.wrote?.has(p) && read(c.el, p) === c.wrote.get(p)) writeStyle(c.el, p, v); // its own write is still showing: it goes with it
  }
}

/** Records what the claimant has written to its properties (their values now), for `releaseClaim`. */
export function noteWrites(c: StyleClaim): void {
  c.wrote = new Map([...c.saved.keys()].map((p) => [p, read(c.el, p)]));
}

/** The properties of `el` some claim holds now. */
export function claimedProps(el: Element): Set<string> {
  const out = new Set<string>();
  for (const c of claims) if (c.el === el) for (const p of c.saved.keys()) out.add(p);
  return out;
}

/** A property `el` had no value for before a surface added one (and which a claim holds now): the claims put back none. */
export function handDownAbsent(el: Element, prop: string): void {
  for (const c of claims) if (c.el === el && c.saved.has(prop)) c.saved.set(prop, null);
}

/** Tests only: forgets every claim. */
export function _resetClaims(): void {
  claims.length = 0;
}
