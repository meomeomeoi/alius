/**
 * P10e (A2): the sprites live in room space. The backdrop is a panorama (a 3072 x 1280 file drawn at the viewport's height is 2.4 times as
 * wide as it is high) and the sprite layer moves with it when the commander looks around, so a woman stands at a place in the room, not on the glass.
 * Each sprite's x is an offset in `cqh` (a hundredth of the layer's height) from the panorama's centre. One woman stands at the centre; two stand
 * within the central view (at pan 0.5 both heads are on screen); three or more spread across the whole panorama, so some sit beyond the view's edges
 * and the commander turns to see them. Four are drawn smaller than two or three so neighbours do not overlap past a shoulder.
 * Pure: the screen reads the slots and `panToCentre` (the view turns to the speaker); the CSS reads `--alius-sprite-x`.
 */

/** The backdrop files are 3072 x 1280. */
export const PANORAMA_RATIO = 3072 / 1280;

export interface SpriteSlot {
  /** A class that names the place (`pos-center`, `pos-left`, `pos-right`, `pos-far-left`, `pos-far-right`, `pos-mid`). */
  cls: string;
  /** Offset from the panorama's centre, in `cqh` (percent of the layer's height). */
  x: number;
}

const SPAN_THREE = 86;
const SPAN_MANY = 92;

/** Where `count` women stand, in the order of the scene's participants (left to right). */
export function spriteSlots(count: number): SpriteSlot[] {
  if (count <= 0) return [];
  if (count === 1) return [{ cls: 'pos-center', x: 0 }];
  if (count === 2) return [{ cls: 'pos-left', x: -38 }, { cls: 'pos-right', x: 38 }];
  if (count === 3) return [{ cls: 'pos-left', x: -SPAN_THREE }, { cls: 'pos-center', x: 0 }, { cls: 'pos-right', x: SPAN_THREE }];
  const step = (2 * SPAN_MANY) / (count - 1);
  return Array.from({ length: count }, (_, i) => ({
    cls: count === 4 ? ['pos-far-left', 'pos-left', 'pos-right', 'pos-far-right'][i]! : i === 0 ? 'pos-far-left' : i === count - 1 ? 'pos-far-right' : 'pos-mid',
    x: Math.round((-SPAN_MANY + i * step) * 10) / 10,
  }));
}

/** The panorama's width for a layer of `w` x `h` pixels: `cover` scales the file to the height, or to the width when the screen is wider than the file. */
export const panoramaWidth = (w: number, h: number): number => Math.max(w, PANORAMA_RATIO * h);

/**
 * The pan (0 to 1, as `--alius-pan` and the backdrop's `background-position`) that puts a sprite at `x` (cqh from the centre) in the middle of
 * the view; 0 or 1 when she stands too near the panorama's edge to be centred. `null` when the panorama is no wider than the view (nothing to turn).
 */
export function panToCentre(x: number, w: number, h: number): number | null {
  const pano = panoramaWidth(w, h);
  if (pano - w < 1) return null;
  const pan = (pano / 2 + (x * h) / 100 - w / 2) / (pano - w);
  return Math.min(1, Math.max(0, pan));
}
