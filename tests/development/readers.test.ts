import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAW_MARK } from '../../src/engine/development/profile';

/**
 * P14b: every system that reads a profile field reads the effective one (`valuesOf`, `likesOf`, `dislikesOf`, `tastesOf`, `bondOf`,
 * `effectiveValues`). A raw read plays the woman her card says, not the one she became. A line that must stay raw (setup, re-sync,
 * import) carries `// P14b: raw profile`.
 */
/** `src/llm/calls/` reads the input structs the controllers build from the effective profile (tests/engine/development/readers.test.ts pins those). */
const ALLOWED = [/^src\/llm\/calls\//, /^src\/engine\/development\//, /^src\/engine\/setup\.ts$/, /^src\/engine\/actions\/squad\.ts$/, /^src\/setup\//, /^src\/ui\/setup\//];

const FIELD = /\b(unit|u|her|other|companion|w|warden|a|b|subject|target)\??\.(values|likes|dislikes|commanderTastes)\b/;
const BOND = /\.bond\??\.(leadStyle|attachment|desire|caretaker)\b/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('readers guard', () => {
  it('no source line reads a raw profile field outside the allowed places', () => {
    const offenders: string[] = [];
    for (const f of files('src')) {
      if (ALLOWED.some((re) => re.test(f))) continue;
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (line.includes(RAW_MARK) || /^\s*(\/\/|\*|\/\*)/.test(line)) return;
        if (FIELD.test(line) || BOND.test(line)) offenders.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
