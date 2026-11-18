import { readFileSync } from 'node:fs';
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

describe.each(Object.keys(PALETTES))('night variant of the palette %s (P10b)', (name) => {
  const selector = name === 'amber' ? '#alius-shell[data-night="true"]:not(.alius-readable)' : `#alius-shell[data-palette="${name}"][data-night="true"]:not(.alius-readable)`;
  const night = cssVars('css/79-immersion.css', selector);
  const vars = { ...palette(name), ...night };
  const bg = vars['--alius-bg'];

  it('declares its own text colours and background (a variant, not a copy)', () => {
    for (const v of ['--alius-fg', '--alius-dim', '--alius-bg', '--alius-accent', '--alius-err']) expect(night[v], `${name} ${v}`).toMatch(/^#[0-9a-f]{6}$/i);
    expect(night['--alius-fg']).not.toBe(palette(name)['--alius-fg']);
    expect(luminance(night['--alius-bg'])).toBeLessThanOrEqual(luminance(palette(name)['--alius-bg']));
  });

  it('is dimmer than the day palette', () => {
    expect(luminance(night['--alius-fg'])).toBeLessThan(luminance(palette(name)['--alius-fg']));
  });

  it('every text colour reads on the night background at 4.5:1', () => {
    for (const v of ['--alius-fg', '--alius-dim', '--alius-accent', '--alius-err']) expect(contrastRatio(vars[v], bg), `${name} ${v}`).toBeGreaterThanOrEqual(4.5);
  });

  it('every semantic colour still reads on the night background at 4.5:1', () => {
    for (const v of SEMANTIC) expect(contrastRatio(vars[v], bg), `${name} ${v}`).toBeGreaterThanOrEqual(4.5);
  });

  it('readable mode has no night variables at all (the selector excludes it)', () => {
    expect(selector).toContain(':not(.alius-readable)');
    expect(cssVars('css/79-immersion.css', selector.replace(':not(.alius-readable)', '.alius-readable'))).toEqual({});
  });
});

describe('night motion (P10b)', () => {
  const IMMERSION = 'css/79-immersion.css';
  it('night slows transitions with --alius-motion-scale 1.6, and reduced motion puts it back to 1', () => {
    expect(cssVars(IMMERSION, '#alius-shell[data-night="true"]')['--alius-motion-scale']).toBe('1.6');
    expect(cssVars(IMMERSION, '#alius-shell.alius-reduced-motion')['--alius-motion-scale']).toBe('1');
    expect(cssVars(FILE, '#alius-shell')['--alius-motion-scale']).toBe('1');
  });

  it('the device transition is scaled by it, and reduced motion still kills every transition', () => {
    const css = readFileSync(IMMERSION, 'utf8');
    expect(css).toMatch(/\[data-night="true"\] \.alius-device\s*\{[^}]*transition:[^;}]*var\(--alius-motion-scale/);
    const motion = readFileSync('css/12-motion.css', 'utf8');
    expect(motion).toMatch(/\.alius-reduced-motion \*[\s\S]*transition: none !important/);
  });
});
