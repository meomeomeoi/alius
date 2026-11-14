import { describe, expect, it } from 'vitest';
import { contrastRatio, cssVars, luminance } from '../helpers/css';

const FILE = 'css/00-vars.css';
const PALETTES: Record<string, string> = {
  amber: '#alius-shell',
  green: '#alius-shell[data-palette="green"]',
  white: '#alius-shell[data-palette="white"]',
};
const SEMANTIC = ['--alius-danger', '--alius-warn', '--alius-trust', '--alius-affinity', '--alius-bond'];

/** The palette's own variables over the shell root's (green and white override only what they list). */
const palette = (name: string): Record<string, string> => ({ ...cssVars(FILE, PALETTES.amber), ...cssVars(FILE, PALETTES[name]) });

describe('the test helper', () => {
  it('computes WCAG luminance and contrast', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 3);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 3);
    expect(cssVars(FILE, '#alius-shell')['--alius-fg']).toBe('#ffb000');
  });
});

describe.each(Object.keys(PALETTES))('palette %s', (name) => {
  const vars = palette(name);
  const bg = vars['--alius-bg'];

  it('declares the five semantic colours', () => {
    for (const v of SEMANTIC) expect(vars[v], `${name} ${v}`).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('every semantic colour reads on the background at 4.5:1', () => {
    for (const v of SEMANTIC) expect(contrastRatio(vars[v], bg), `${name} ${v}`).toBeGreaterThanOrEqual(4.5);
  });

  it('the five semantic colours differ in lightness, not hue alone (adjacent steps of at least 1.25:1)', () => {
    const lums = SEMANTIC.map((v) => luminance(vars[v])).sort((a, b) => a - b);
    for (let i = 0; i < lums.length - 1; i++) {
      expect((lums[i + 1] + 0.05) / (lums[i] + 0.05), `${name} step ${i}`).toBeGreaterThanOrEqual(1.25);
    }
  });

  it('the text colours stay at 7:1 on the background', () => {
    for (const v of ['--alius-fg', '--alius-dim', '--alius-accent']) expect(contrastRatio(vars[v], bg), `${name} ${v}`).toBeGreaterThanOrEqual(7);
  });
});
