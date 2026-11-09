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
        expect(p, `${file} imports ${p}`).not.toMatch(/\/(st|ui|llm|scene|sim)\//);
      }
      for (const id of ['window', 'document', 'SillyTavern']) {
        expect(text, `${file} uses ${id}`).not.toMatch(new RegExp(`\\b${id}\\b`));
      }
    }
  });

  it('the scene layer talks to ST only through the adapter type and never touches the UI', () => {
    for (const file of tsFiles('src/scene')) {
      const text = readFileSync(file, 'utf8');
      const importPaths = [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const p of importPaths) {
        expect(p, `${file} imports ${p}`).not.toMatch(/\/ui\//);
        expect(p, `${file} imports ${p}`).not.toMatch(/st\/real$/);
        expect(p, `${file} imports ${p}`).not.toMatch(/^st:/);
      }
      for (const id of ['window', 'document', 'SillyTavern']) {
        expect(text, `${file} uses ${id}`).not.toMatch(new RegExp(`\\b${id}\\b`));
      }
    }
  });

  it('the sim layer imports only engine and content', () => {
    const files = tsFiles('src/sim');
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const importPaths = [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const p of importPaths) {
        if (p.startsWith('node:') || p === 'esbuild') continue;
        expect(p, `${file} imports ${p}`).toMatch(/^(\.\.\/(engine|content)\/|\.\/)/);
      }
      for (const id of ['window', 'document', 'SillyTavern']) {
        expect(text, `${file} uses ${id}`).not.toMatch(new RegExp(`\\b${id}\\b`));
      }
    }
  });
});
