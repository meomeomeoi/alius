export type Rgb = [number, number, number];

/** The 4×4 Bayer matrix: the order in which pixels of a flat tone switch to the next level. */
export const BAYER4: readonly number[] = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Background, dim and foreground of each phosphor palette (kept equal to `css/00-vars.css` by a test). */
export const PALETTE_RGB: Record<'amber' | 'green' | 'white', [Rgb, Rgb, Rgb]> = {
  amber: [[0x12, 0x0c, 0x02], [0xd2, 0x92, 0x00], [0xff, 0xb0, 0x00]],
  green: [[0x02, 0x12, 0x08], [0x2b, 0xcf, 0x55], [0x33, 0xff, 0x66]],
  white: [[0x0b, 0x0b, 0x0b], [0xb4, 0xb4, 0xb4], [0xe8, 0xe8, 0xe8]],
};

/**
 * Ordered dithering into three levels. Luminance (0.2126 R + 0.7152 G + 0.0722 B over 255) is scaled to two intervals;
 * inside an interval the pixel takes the upper level when its fraction beats the Bayer threshold of its place
 * `(BAYER4[(y % 4) * 4 + x % 4] + 0.5) / 16`. Alpha below 128 stays transparent; every other pixel becomes opaque.
 * Pure: the source is not changed.
 */
export function ditherBayer4(src: Uint8ClampedArray, w: number, h: number, levels: [Rgb, Rgb, Rgb]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3] < 128) continue;
      const l2 = ((0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2]) / 255) * 2;
      const base = Math.min(1, Math.floor(l2));
      const threshold = (BAYER4[(y % 4) * 4 + (x % 4)] + 0.5) / 16;
      const [r, g, b] = levels[l2 - base > threshold ? base + 1 : base];
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
  }
  return out;
}
