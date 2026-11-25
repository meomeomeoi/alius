import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * `tests/build.test.ts` rewrites `style.css` and `dist/index.js` while the suite runs, so a read can land in the middle
 * of a write: read until two reads a moment apart agree.
 */
async function stable(file: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const a = readFileSync(file, 'utf8');
    await new Promise((r) => setTimeout(r, 25));
    if (a.length > 0 && a === readFileSync(file, 'utf8')) return a;
  }
  throw new Error(`${file} never settled`);
}

let css = '';
let bundle = '';
beforeAll(async () => {
  css = await stable('style.css');
  bundle = await stable('dist/index.js');
});
const FAMILIES = ['ibm-plex-mono', 'saira-stencil-one', 'inter', 'special-elite'];
/** P10b / P10e-e: every hand of the handFonts registry, as the kebab of its family (OFL, or Apache for six). */
const HANDS = (JSON.parse(readFileSync('content/core/handFonts.json', 'utf8')) as Array<{ family: string }>).map(({ family }) => family.toLowerCase().replace(/ /g, '-'));

describe('bundled assets (spec P10 §6, acceptance 7)', () => {
  it('every font url in style.css exists on disk', () => {
    const urls = [...css.matchAll(/url\(\s*["']?(fonts\/[^"')]+)["']?\s*\)/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThanOrEqual(13);
    for (const u of urls) expect(existsSync(u), u).toBe(true);
  });

  it('every @font-face uses font-display: swap and a relative url', () => {
    const faces = [...css.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0]);
    expect(faces.length).toBeGreaterThanOrEqual(13 + 42);
    for (const f of faces) {
      expect(f).toMatch(/font-display:\s*swap/);
      expect(f).toMatch(/url\(\s*["']?fonts\//);
    }
  });

  it('style.css has no remote url and no @import', () => {
    expect(css).not.toMatch(/url\(\s*['"]?(https?:)?\/\//);
    expect(css).not.toMatch(/@import/);
  });

  it('the bundle names no font CDN', () => {
    expect(bundle).not.toContain('fonts.googleapis');
    expect(bundle).not.toContain('fonts.gstatic');
  });

  it('each bundled font family ships its licence text (OFL, or Apache-2.0 for Special Elite)', () => {
    for (const family of FAMILIES) {
      const file = `fonts/LICENSES/${family}.txt`;
      expect(existsSync(file), file).toBe(true);
      expect(readFileSync(file, 'utf8')).toMatch(/SIL OPEN FONT LICENSE|Apache License/i);
    }
  });

  it('woff2 files are under 120 KB each', () => {
    const files = readdirSync('fonts').filter((f) => f.endsWith('.woff2'));
    expect(files.length).toBeGreaterThanOrEqual(13);
    for (const f of files) expect(statSync(`fonts/${f}`).size, f).toBeLessThan(120 * 1024);
  });

  it('every hand font is a woff2 on disk, referenced by a relative url in style.css, with its OFL or Apache licence (P10b, P10e-e)', () => {
    expect(HANDS).toHaveLength(48);
    for (const hand of HANDS) {
      const file = `fonts/hand-${hand}-400.woff2`;
      expect(existsSync(file), file).toBe(true);
      expect(css, file).toContain(`url("${file}")`);
      const licence = `fonts/LICENSES/hand-${hand}.txt`;
      expect(existsSync(licence), licence).toBe(true);
      expect(readFileSync(licence, 'utf8'), licence).toMatch(/SIL OPEN FONT LICENSE|Apache License/i);
    }
    expect(readdirSync('fonts').filter((f) => f.startsWith('hand-'))).toHaveLength(HANDS.length);
    expect(readdirSync('fonts/LICENSES').filter((f) => f.startsWith('hand-'))).toHaveLength(HANDS.length);
  });

  it('the hand font faces match the handFonts registry (family names)', () => {
    const registry = JSON.parse(readFileSync('content/core/handFonts.json', 'utf8')) as Array<{ family: string }>;
    for (const { family } of registry) expect(css, family).toContain(`font-family: "${family}"`);
  });

  it('the paper voice reads --alius-font-hand first for note bodies, and readable mode falls back to the type font', () => {
    expect(css).toMatch(/\.alius-note[^{]*\{[^}]*font-family:\s*var\(--alius-font-hand,\s*var\(--alius-font-type\)\)/);
    expect(css).toMatch(/alius-readable[^{]*\.alius-note[^{]*\{[^}]*font-family:\s*var\(--alius-font-type\)/);
  });

  it('the font variables exist on the shell root', () => {
    const vars = readFileSync('css/00-vars.css', 'utf8');
    expect(vars).toMatch(/--alius-font:\s*"IBM Plex Mono"/);
    expect(vars).toMatch(/--alius-font-stencil:\s*"Saira Stencil One",\s*var\(--alius-font\)/);
    expect(vars).toMatch(/--alius-font-sans:\s*"Inter",\s*system-ui,\s*sans-serif/);
    expect(vars).toMatch(/--alius-font-type:\s*"Special Elite",\s*"Courier New",\s*monospace/);
  });

  it('every recorded sound under assets/sounds/ is named in its LICENSES.md and under 400 KB (P10e-e)', () => {
    const licences = readFileSync('assets/sounds/LICENSES.md', 'utf8');
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`]));
    const files = walk('assets/sounds').filter((f) => f !== 'assets/sounds/LICENSES.md');
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const rel = f.slice('assets/sounds/'.length);
      expect(licences, rel).toContain(`\`${rel}\``);
      expect(statSync(f).size, f).toBeLessThanOrEqual(400 * 1024);
    }
  });

  it('the sound layer names no http url (P10e-e)', () => {
    for (const f of readdirSync('src/ui/sound')) expect(readFileSync(`src/ui/sound/${f}`, 'utf8'), f).not.toMatch(/https?:/);
  });
});
