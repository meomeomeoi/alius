import type { Slot } from '../../engine/state/types';

/**
 * The hub's cross-section art: `content/core/art/hub/base_<slot>.png`, else `base.png`, else nothing (the CSS blueprint
 * shows). Each URL is tried once per session with an `Image` load; only extension URLs are ever requested.
 */
const tried = new Map<string, Promise<boolean>>();
const found = new Map<string, boolean>();

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

const candidates = (assetUrl: (path: string) => string, slot: Slot): string[] =>
  [`content/core/art/hub/base_${slot}.png`, 'content/core/art/hub/base.png'].map((p) => assetUrl(p));

/** The art URL once the probe has finished (`null` = there is none), `undefined` while it is still unknown. */
export function peekHubArt(assetUrl: ((path: string) => string) | undefined, slot: Slot): string | null | undefined {
  if (!assetUrl) return null;
  let unknown = false;
  for (const url of candidates(assetUrl, slot)) {
    const ok = found.get(url);
    if (ok === true) return url;
    if (ok === undefined) unknown = true;
  }
  return unknown ? undefined : null;
}

export async function probeHubArt(assetUrl: ((path: string) => string) | undefined, slot: Slot): Promise<string | null> {
  if (!assetUrl) return null;
  for (const url of candidates(assetUrl, slot)) if (await loads(url)) return url;
  return null;
}
