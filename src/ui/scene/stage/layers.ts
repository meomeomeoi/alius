/**
 * P10e: the scene screen is one full frame, built from layers back to front: backdrop, the ASCII art of a place without a
 * picture, the frame / surface (P17c), the pose shot (P17c), the sprites, the screen effects, the UI, the full-screen
 * moments (the slap) and the history curtain. Every layer covers the whole frame; the UI layer lets the pointer through to the
 * frame below (the right mouse button looks around there), and each host inside it takes it back.
 */
import { h } from '../../dom';

export const LAYER_NAMES = ['backdrop', 'ascii', 'frame', 'pose', 'sprites', 'effects', 'ui', 'moment', 'curtain'] as const;
export type LayerName = (typeof LAYER_NAMES)[number];

/** The hosts inside the UI layer, in reading order (the class of each is `alius-stage-<name in kebab case>`). */
export const UI_HOSTS = [['topLine', 'topline'], ['status', 'status'], ['reply', 'reply'], ['chipRow', 'chips'], ['input', 'input'], ['dock', 'dock'], ['dial', 'dial']] as const;
export type UiHostName = (typeof UI_HOSTS)[number][0];

export type StageLayers = { root: HTMLElement } & Record<LayerName, HTMLElement> & { hosts: Record<UiHostName, HTMLElement> };

/** Fills `root` (replacing its children) with the layers; the root is marked `data-stage="frame"`. */
export function buildLayers(root: HTMLElement): StageLayers {
  const layer = (name: LayerName): HTMLElement => h('div', { class: `alius-layer alius-layer-${name}` });
  const layers = Object.fromEntries(LAYER_NAMES.map((n) => [n, layer(n)])) as Record<LayerName, HTMLElement>;
  for (const n of ['backdrop', 'ascii', 'frame', 'pose', 'effects'] as const) layers[n].setAttribute('aria-hidden', 'true');
  const hosts = Object.fromEntries(UI_HOSTS.map(([name, cls]) => [name, h('div', { class: `alius-stage-${cls}` })])) as Record<UiHostName, HTMLElement>;
  layers.ui.append(...UI_HOSTS.map(([name]) => hosts[name]));
  root.replaceChildren(...LAYER_NAMES.map((n) => layers[n]));
  root.dataset.stage = 'frame';
  return { root, ...layers, hosts };
}
