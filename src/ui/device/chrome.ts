import type { Entry } from '../../content/types';
import { h } from '../dom';
import { cssUrl, noise } from '../fx';
import { BUILT_IN_SKIN, screenBox } from './skins';

const bit = (cls: string, text?: string): HTMLElement => h('span', { class: cls }, text);
const many = (n: number, cls: string): HTMLElement[] => Array.from({ length: n }, () => bit(cls));

/** What each preset draws on the casing. The stylesheet (`17-skins.css`) gives every class its look. */
const PRESETS: Record<string, () => Array<Node | null>> = {
  // olive-grey surplus: rubber bumpers, side grips, two slotted screws, a worn sticker and a barcode
  ccp_standard: () => [
    noise('alius-grain', { frequency: '0.85', octaves: 3 }),
    noise('alius-mottle', { frequency: '0.012', octaves: 2, seed: 4 }),
    ...many(2, 'alius-bumper'),
    ...many(2, 'alius-grip'),
    ...many(2, 'alius-screw'),
    ...many(3, 'alius-scratch'),
    bit('alius-grille'),
    bit('alius-sticker', 'VOID IF OPENED'),
    bit('alius-barcode'),
  ],
  // steel and grime: a hazard stripe, amber corner plates, six hex bolts and vents
  kestrel: () => [
    noise('alius-brushed', { frequency: '0.9 0.04', octaves: 2 }),
    noise('alius-grime-layer', { frequency: '0.018', octaves: 3, seed: 7 }),
    bit('alius-hazard'),
    ...many(2, 'alius-corner'),
    ...many(6, 'alius-bolt'),
    ...many(2, 'alius-grime'),
    bit('alius-vents'),
  ],
  // ceramic: no screws, a home button and a teal light ring around the screen
  vesper: () => [
    noise('alius-ceramic', { frequency: '1.1', octaves: 2 }),
    bit('alius-ring'),
    bit('alius-home'),
  ],
};

/** Frames that failed to load this session: dressing again goes straight to the fallback instead of requesting them again. */
const failedFrames = new Set<string>();
export const clearFailedFrames = (): void => failedFrames.clear();

/** Forgets what an image skin put on the screen and the device. */
function clearImageLayout(device: HTMLElement, screen: HTMLElement): void {
  device.style.removeProperty('--device-ratio');
  for (const k of ['position', 'left', 'top', 'width', 'height'] as const) screen.style[k] = '';
}

/**
 * Dresses the device in `skin`. A `css` skin fills the chrome with its preset's decor; an `image` skin lays the frame
 * over the device (decorative, `alt=""`), keeps the frame's aspect ratio and puts the screen on the cut-out by percent, so
 * it stays there at any size. An image that cannot be shown (no way to resolve it, or it fails to load) falls back to the
 * built-in `ccp_standard`. The chrome never takes part in focus or clicks.
 */
export function renderChrome(
  chrome: HTMLElement, screen: HTMLElement, device: HTMLElement, skin: Entry, assetUrl?: (path: string) => string,
): void {
  chrome.replaceChildren();
  chrome.setAttribute('aria-hidden', 'true');
  const box = screenBox(skin);
  if (skin.kind === 'image' && (!assetUrl || !box || typeof skin.frameImage !== 'string' || failedFrames.has(skin.frameImage))) {
    renderChrome(chrome, screen, device, BUILT_IN_SKIN);
    return;
  }

  device.dataset.skin = String(skin.id);
  device.dataset.kind = String(skin.kind);
  device.dataset.preset = skin.kind === 'css' ? String(skin.cssPreset) : 'image';
  device.style.setProperty('--device-led', String(skin.ledColor));
  device.style.setProperty('--device-accent', String(skin.accent));

  if (skin.kind === 'image' && assetUrl && box) {
    const size = skin.frameSize as { w: number; h: number };
    device.style.setProperty('--device-ratio', `${size.w} / ${size.h}`);
    screen.style.position = 'absolute';
    screen.style.left = box.left;
    screen.style.top = box.top;
    screen.style.width = box.width;
    screen.style.height = box.height;
    const frame = h('img', { class: 'alius-device-frame', alt: '', draggable: 'false', src: assetUrl(String(skin.frameImage)) });
    frame.addEventListener('error', () => {
      failedFrames.add(String(skin.frameImage));
      renderChrome(chrome, screen, device, BUILT_IN_SKIN);
    });
    chrome.append(frame);
    const overlay = skin.overlay as { image: string; blend: 'overlay' | 'multiply'; opacity: number } | undefined;
    if (overlay) {
      const layer = h('div', { class: 'alius-device-overlay' });
      layer.style.backgroundImage = cssUrl(assetUrl(overlay.image));
      layer.style.mixBlendMode = overlay.blend;
      layer.style.opacity = String(overlay.opacity);
      chrome.append(layer);
    }
    chrome.append(h('span', { class: 'alius-led' }));
    return;
  }

  clearImageLayout(device, screen);
  const decor = PRESETS[String(skin.cssPreset)] ?? PRESETS.ccp_standard;
  chrome.append(...decor().filter((n): n is Node => n !== null), bit('alius-led'), bit('alius-device-label', String(skin.label ?? skin.name)));
  chrome.lastElementChild?.setAttribute('aria-hidden', 'true');
}
