import { describe, expect, it } from 'vitest';
import { BAYER4, ditherBayer4, PALETTE_RGB, type Rgb } from '../../src/ui/portrait/dither';
import { cssVars } from '../helpers/css';

const BG: Rgb = [0, 0, 0];
const DIM: Rgb = [100, 100, 100];
const FG: Rgb = [200, 200, 200];
const LEVELS: [Rgb, Rgb, Rgb] = [BG, DIM, FG];

/** A w×h image of one RGBA colour. */
const flat = (w: number, h: number, rgba: [number, number, number, number]) => Uint8ClampedArray.from(Array.from({ length: w * h }, () => rgba).flat());
const px = (c: Rgb): number[] => [...c, 255];

describe('BAYER4', () => {
  it('is the 4x4 ordered-dither matrix, every threshold once', () => {
    expect([...BAYER4]).toEqual([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
    expect([...BAYER4].sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i));
  });
});

describe('ditherBayer4', () => {
  it('pure black is all background, pure white is all foreground', () => {
    expect([...ditherBayer4(flat(4, 4, [0, 0, 0, 255]), 4, 4, LEVELS)]).toEqual(Array.from({ length: 16 }, () => px(BG)).flat());
    expect([...ditherBayer4(flat(4, 4, [255, 255, 255, 255]), 4, 4, LEVELS)]).toEqual(Array.from({ length: 16 }, () => px(FG)).flat());
  });

  it('a flat mid grey lands on the middle level', () => {
    expect([...ditherBayer4(flat(4, 4, [128, 128, 128, 255]), 4, 4, LEVELS)]).toEqual(Array.from({ length: 16 }, () => px(DIM)).flat());
  });

  it('a flat quarter grey is exactly the half of the matrix: a checkerboard of background and middle', () => {
    const out = [...ditherBayer4(flat(4, 4, [64, 64, 64, 255]), 4, 4, LEVELS)];
    const D = px(DIM);
    const B = px(BG);
    // dim where the matrix threshold is below 0.502: matrix values 0..7
    const rows = [[D, B, D, B], [B, D, B, D], [D, B, D, B], [B, D, B, D]];
    expect(out).toEqual(rows.flat(2));
  });

  it('a flat three-quarter grey is the other half: middle and foreground', () => {
    const out = [...ditherBayer4(flat(4, 4, [192, 192, 192, 255]), 4, 4, LEVELS)];
    const D = px(DIM);
    const F = px(FG);
    // the fraction (0.506) beats the thresholds of matrix values 0..7, which go up to the foreground
    const rows = [[F, D, F, D], [D, F, D, F], [F, D, F, D], [D, F, D, F]];
    expect(out).toEqual(rows.flat(2));
  });

  it('the threshold follows (y % 4, x % 4), so the pattern repeats every 4 pixels', () => {
    const out = ditherBayer4(flat(8, 8, [64, 64, 64, 255]), 8, 8, LEVELS);
    const at = (x: number, y: number) => out[(y * 8 + x) * 4];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) expect(at(x, y)).toBe(at(x % 4, y % 4));
  });

  it('weights green most: pure green is brighter than pure blue and lands on a higher level', () => {
    const green = ditherBayer4(flat(4, 4, [0, 255, 0, 255]), 4, 4, LEVELS);
    const blue = ditherBayer4(flat(4, 4, [0, 0, 255, 255]), 4, 4, LEVELS);
    const mean = (a: Uint8ClampedArray) => a.reduce((s, v, i) => (i % 4 === 0 ? s + v : s), 0) / 16;
    expect(mean(green)).toBeGreaterThan(mean(blue));
  });

  it('transparent pixels stay transparent, opaque ones become fully opaque', () => {
    const src = Uint8ClampedArray.from([255, 255, 255, 0, 255, 255, 255, 127, 255, 255, 255, 128, 255, 255, 255, 255]);
    const out = [...ditherBayer4(src, 4, 1, LEVELS)];
    expect(out.slice(0, 4)).toEqual([0, 0, 0, 0]);
    expect(out.slice(4, 8)).toEqual([0, 0, 0, 0]); // alpha 127 < 128
    expect(out[11]).toBe(255);
    expect(out[15]).toBe(255);
  });

  it('does not modify the source and returns an array of the same length', () => {
    const src = flat(4, 4, [64, 64, 64, 255]);
    const copy = Uint8ClampedArray.from(src);
    const out = ditherBayer4(src, 4, 4, LEVELS);
    expect(out).toHaveLength(src.length);
    expect([...src]).toEqual([...copy]);
    expect(out).not.toBe(src);
  });
});

describe('PALETTE_RGB', () => {
  const hex = (s: string): Rgb => {
    const n = parseInt(s.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const SEL: Record<string, string> = { amber: '#alius-shell', green: '#alius-shell[data-palette="green"]', white: '#alius-shell[data-palette="white"]' };

  it.each(['amber', 'green', 'white'] as const)('%s equals the bg, dim and fg of css/00-vars.css', (name) => {
    const v = { ...cssVars('css/00-vars.css', SEL.amber), ...cssVars('css/00-vars.css', SEL[name]) };
    expect(PALETTE_RGB[name]).toEqual([hex(v['--alius-bg']), hex(v['--alius-dim']), hex(v['--alius-fg'])]);
  });
});
