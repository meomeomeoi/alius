import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

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

  it('the engine never reaches into the world layer (resolved paths, since the engine has its own world folder)', () => {
    const worldRoot = resolve('src/world') + sep;
    for (const file of tsFiles('src/engine')) {
      const text = readFileSync(file, 'utf8');
      const importPaths = [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const p of importPaths) {
        if (!p.startsWith('.')) continue;
        const target = resolve(dirname(file), p);
        expect(target + sep, `${file} imports ${p}`).not.toMatch(new RegExp(`^${worldRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
      }
    }
  });

  it('the world layer talks to ST only through type imports and never touches the UI', () => {
    const files = tsFiles('src/world');
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const imports = [...text.matchAll(/^import\s+(type\s+)?[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => ({ isType: m[1] !== undefined, path: m[2] }));
      for (const { isType, path } of imports) {
        expect(path, `${file} imports ${path}`).not.toMatch(/\/ui\//);
        if (/\/st\//.test(path) || /\/st$/.test(path)) expect(isType, `${file} must use import type for ${path}`).toBe(true);
        expect(path, `${file} imports ${path}`).not.toMatch(/st\/real$/);
      }
      for (const id of ['window', 'document', 'SillyTavern']) {
        expect(text, `${file} uses ${id}`).not.toMatch(new RegExp(`\\b${id}\\b`));
      }
    }
  });

  it('the loyalty layer never touches the UI or the real ST adapter, and the engine never reaches into it', () => {
    const files = tsFiles('src/loyalty');
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const imports = [...text.matchAll(/^import\s+(type\s+)?[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => ({ isType: m[1] !== undefined, path: m[2] }));
      for (const { isType, path } of imports) {
        expect(path, `${file} imports ${path}`).not.toMatch(/\/ui\//);
        expect(path, `${file} imports ${path}`).not.toMatch(/st\/real$/);
        expect(path, `${file} imports ${path}`).not.toMatch(/^st:/);
        if (/\/st\//.test(path) || /\/st$/.test(path)) expect(isType, `${file} must use import type for ${path}`).toBe(true);
      }
      for (const id of ['window', 'document', 'SillyTavern']) {
        expect(text, `${file} uses ${id}`).not.toMatch(new RegExp(`\\b${id}\\b`));
      }
    }
    const loyaltyRoot = resolve('src/loyalty') + sep;
    for (const file of tsFiles('src/engine')) {
      const text = readFileSync(file, 'utf8');
      const importPaths = [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const p of importPaths) {
        if (!p.startsWith('.')) continue;
        expect(resolve(dirname(file), p) + sep, `${file} imports ${p}`).not.toMatch(new RegExp(`^${loyaltyRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
      }
    }
  });

  it('the analysis layer and the analyze UI never reach the LLM or SillyTavern', () => {
    const forbidden = ['llm', 'scene', 'world', 'loyalty'].map((d) => resolve('src', d) + sep);
    const settingsFile = resolve('src', 'settings');
    const uiRoot = resolve('src/ui') + sep;
    const dirs = ['src/analysis', 'src/ui/analyze'];
    for (const dir of dirs) {
      const files = tsFiles(dir);
      expect(files.length, dir).toBeGreaterThan(0);
      for (const file of files) {
        const text = readFileSync(file, 'utf8');
        const imports = [...text.matchAll(/^import\s+(type\s+)?[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => ({ isType: m[1] !== undefined, path: m[2] }));
        for (const { isType, path } of imports) {
          expect(path, `${file} imports ${path}`).not.toMatch(/^st:/);
          expect(path, `${file} imports ${path}`).not.toMatch(/st\/real$/);
          if (/\/st\//.test(path) || /\/st$/.test(path)) expect(isType, `${file} must use import type for ${path}`).toBe(true);
          if (!path.startsWith('.')) continue;
          const target = resolve(dirname(file), path);
          for (const f of forbidden) expect(target + sep, `${file} imports ${path}`).not.toContain(f);
          // the settings module pulls in the LLM call types: only its type may be used
          if (target === settingsFile) expect(isType, `${file} must use import type for ${path}`).toBe(true);
          if (dir === 'src/analysis') expect(target + sep, `${file} imports ${path}`).not.toContain(uiRoot);
        }
        expect(text, `${file} calls fetch`).not.toMatch(/\bfetch\s*\(/);
        expect(text, `${file} uses SillyTavern`).not.toMatch(/\bSillyTavern\b/);
      }
    }
  });

  it('the engine never reaches into the analysis layer', () => {
    const analysisRoot = resolve('src/analysis') + sep;
    for (const file of tsFiles('src/engine')) {
      const text = readFileSync(file, 'utf8');
      const importPaths = [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const p of importPaths) {
        if (!p.startsWith('.')) continue;
        expect(resolve(dirname(file), p) + sep, `${file} imports ${p}`).not.toContain(analysisRoot);
      }
    }
  });
});
