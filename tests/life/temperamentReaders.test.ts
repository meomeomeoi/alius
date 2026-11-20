import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every reader of her temperament goes through `temperamentOf` (the stored fields over the defaults `terse` / `steady` / `dry`, grunts
 * included). A direct `.temperament` read elsewhere would see an absent field and skip the defaults. A line that must stay raw carries
 * `// P14c: raw temperament`.
 */
const ALLOWED = [
  'src/engine/life/state.ts', 'src/engine/setup.ts', 'src/engine/actions/squad.ts', 'src/engine/actions/life.ts',
];
const ALLOWED_DIRS = ['src/setup/', 'src/ui/setup/'];

const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
});

describe('the temperament readers (P14c)', () => {
  const posix = (p: string): string => p.split('\\').join('/');
  it('nothing reads .temperament but the leaf, the setup and the actions', () => {
    const offenders: string[] = [];
    for (const file of files('src').map(posix)) {
      if (ALLOWED.includes(file) || ALLOWED_DIRS.some((d) => file.startsWith(d))) continue;
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (/\.temperament\b/.test(line) && !line.includes('// P14c: raw temperament')) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('the pattern does not match the locks, and does match a raw read', () => {
    expect(/\.temperament\b/.test('unit.temperamentLocks')).toBe(false);
    expect(/\.temperament\b/.test('unit.temperament?.humor')).toBe(true);
  });

  it('the allowed files exist', () => {
    for (const f of ALLOWED) expect(statSync(f).isFile(), f).toBe(true);
  });
});
