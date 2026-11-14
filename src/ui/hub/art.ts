import type { Slot } from '../../engine/state/types';

/**
 * The hub's cross-section art. A pack declares its art in its manifest (`art.hub`, listed by the loader as
 * extension-relative paths); the slot's `base_<slot>.png` is used when declared, else `base.png`, else nothing (the CSS
 * blueprint shows). Nothing is requested for a file nobody declared, so a pack without art costs no 404. Each declared
 * file is tried once per session with an `Image` load.
 */
const tried = new Map<string, Promise<boolean>>();
const found = new Map<string, boolean>();

/** Forgets what was tried (tests). */
export function resetHubArt(): void {
  tried.clear();
  found.clear();
}

function loads(url: string): Promise<boolean> {
  let p = tried.get(url);
  if (!p) {
    p = new Promise<boolean>((resolve) => {
      if (typeof Image === 'undefined') return resolve(false);
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    }).then((ok) => {
      found.set(url, ok);
      return ok;
    });
    tried.set(url, p);
  }
  return p;
}

/** The declared files that apply to `slot`, best first: its own variant, then the base. */
function candidates(assetUrl: (path: string) => string, slot: Slot, declared: readonly string[]): string[] {
  const named = (name: string): string | undefined => declared.find((p) => p.split('/').pop() === name);
  return [named(`base_${slot}.png`), named('base.png')].filter((p): p is string => p !== undefined).map((p) => assetUrl(p));
}

/** The art URL once the probe has finished (`null` = there is none), `undefined` while it is still unknown. */
export function peekHubArt(assetUrl: ((path: string) => string) | undefined, slot: Slot, declared: readonly string[]): string | null | undefined {
  if (!assetUrl) return null;
  let unknown = false;
  for (const url of candidates(assetUrl, slot, declared)) {
    const ok = found.get(url);
    if (ok === true) return url;
    if (ok === undefined) unknown = true;
  }
  return unknown ? undefined : null;
}

export async function probeHubArt(assetUrl: ((path: string) => string) | undefined, slot: Slot, declared: readonly string[]): Promise<string | null> {
  if (!assetUrl) return null;
  for (const url of candidates(assetUrl, slot, declared)) if (await loads(url)) return url;
  return null;
}
