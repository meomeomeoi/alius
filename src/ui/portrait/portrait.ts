import type { Unit } from '../../engine/state/types';
import type { AliusSettings } from '../../settings';
import type { StAdapter } from '../../st/adapter';
import { h } from '../dom';
import { visualFlags } from '../motion';
import { ditherBayer4, PALETTE_RGB } from './dither';

type Palette = keyof typeof PALETTE_RGB;

export interface PortraitOpts {
  palette: Palette;
  /** Dither the image into the phosphor palette (the caller decides from the settings: see `portraitOptions`). */
  dither: boolean;
  /** Side in pixels of the square portrait (default 96). */
  size?: number;
}

/** Portrait options from the settings: the palette, and dithering unless it is off or readable mode is on. */
export function portraitOptions(s: AliusSettings, size?: number): PortraitOpts {
  return { palette: s.palette, dither: visualFlags(s).dither, ...(size !== undefined ? { size } : {}) };
}

/** A missing sprite or a failed dither is not asked again for this long. */
const RETRY_MS = 30_000;

/** Sprite lookups per adapter: a found sprite is kept, a missing one is not asked for again for a while. */
const spriteCache = new WeakMap<StAdapter, Map<string, { url: string | null; at: number }>>();
/** Dithered data URLs per `cardRef|palette|size`; a failure is remembered with its time. */
const dithered = new Map<string, { url?: string; failedAt?: number }>();

export function clearPortraitCache(): void {
  dithered.clear();
}

function showDithered(img: HTMLImageElement, url: string): void {
  img.setAttribute('src', url);
  img.classList.add('alius-portrait-dithered');
}

/**
 * Draws the loaded image into a square canvas (cropped from the top centre), dithers it into the palette and swaps it in.
 * A tainted canvas, a missing canvas or any other failure leaves the plain image and is not retried for 30 s.
 */
function ditherWhenLoaded(img: HTMLImageElement, key: string, palette: Palette, size: number): void {
  const hit = dithered.get(key);
  if (hit?.url) return showDithered(img, hit.url);
  if (hit?.failedAt !== undefined && Date.now() - hit.failedAt < RETRY_MS) return;
  const run = (): void => {
    const again = dithered.get(key);
    if (again?.url) return showDithered(img, again.url);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      if (!ctx || !nw || !nh) throw new Error('nothing to draw on or from');
      const side = Math.min(nw, nh);
      ctx.drawImage(img, (nw - side) / 2, 0, side, side, 0, 0, size, size);
      const src = ctx.getImageData(0, 0, size, size); // throws SecurityError when the image tainted the canvas
      const out = ctx.createImageData(size, size);
      out.data.set(ditherBayer4(src.data, size, size, PALETTE_RGB[palette]));
      ctx.putImageData(out, 0, 0);
      const url = canvas.toDataURL('image/png');
      dithered.set(key, { url });
      showDithered(img, url);
    } catch {
      dithered.set(key, { failedAt: Date.now() });
    }
  };
  if (img.complete && img.naturalWidth > 0) run();
  else img.addEventListener('load', run, { once: true });
}

/**
 * A unit's portrait: a grunt's ASCII art, or a named unit's neutral sprite (else her avatar). With `dither` the image is
 * replaced by its ordered-dither version in the palette once it has loaded, cached per card, palette and size.
 */
export function unitPortrait(st: StAdapter, unit: Unit, o: PortraitOpts): HTMLElement | null {
  if (unit.kind === 'grunt') {
    return unit.asciiPortrait ? h('pre', { class: 'alius-ascii', 'aria-label': `Portrait of ${unit.displayName}` }, unit.asciiPortrait) : null;
  }
  if (!unit.cardRef) return null;
  const card = unit.cardRef;
  const size = o.size ?? 96;
  const key = `${card}|${o.palette}|${size}`;
  const avatar = st.getAvatarUrl(card);
  let cache = spriteCache.get(st);
  if (!cache) spriteCache.set(st, (cache = new Map()));
  const known = cache.get(card);
  const cached = o.dither ? dithered.get(key)?.url : undefined;
  const img = h('img', { class: 'alius-portrait', src: cached ?? known?.url ?? avatar, alt: unit.displayName, width: String(size), height: String(size) }) as HTMLImageElement;
  if (cached) {
    img.classList.add('alius-portrait-dithered');
    return img;
  }
  let usingAvatar = !known?.url;
  const settle = (): void => {
    if (o.dither) ditherWhenLoaded(img, key, o.palette, size);
  };
  img.addEventListener('error', () => {
    if (usingAvatar) return;
    usingAvatar = true;
    img.setAttribute('src', avatar);
  });
  if (known && (known.url || Date.now() - known.at < RETRY_MS)) {
    settle();
    return img;
  }
  st.getSpriteUrl(card, 'neutral').then(
    (url) => {
      cache!.set(card, { url: url || null, at: Date.now() });
      if (url) {
        usingAvatar = false;
        img.setAttribute('src', url);
      }
      settle();
    },
    () => settle(),
  );
  return img;
}
