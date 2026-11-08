import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function tsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? tsFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('architecture', () => {
  it('engine imports nothing outside engine', () => {
    for (const file of tsFiles('src/engine')) {
      const text = readFileSync(file, 'utf8');
      const importPaths = [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const p of importPaths) {
        expect(p, `${file} imports ${p}`).not.toMatch(/\/(st|ui|llm)\//);
      }
      for (const id of ['window', 'document', 'SillyTavern']) {
        expect(text, `${file} uses ${id}`).not.toMatch(new RegExp(`\\b${id}\\b`));
      }
    }
  });
});
