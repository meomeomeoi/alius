import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

describe('build', () => {
  it('bundle has only st externals', () => {
    execSync('node scripts/build.mjs', { stdio: 'pipe' });
    const bundle = readFileSync('dist/index.js', 'utf8');
    const specs = [...bundle.matchAll(/^\s*import\b[^'"]*?from\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    const bare = [...bundle.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    for (const x of [...specs, ...bare]) {
      expect(x.startsWith('../../../../') && x.endsWith('.js'), `bad import ${x}`).toBe(true);
    }
    expect(existsSync('style.css')).toBe(true);
  });
});
