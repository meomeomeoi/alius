/**
 * P10e-e Task 6: the prototype fidelity gate. Every `src/ui/scene/instruments/<name>/fidelity.json` lists the functions, tables and lines its
 * port copies from `docs/prototypes/<prototype>.html`: each function must match the prototype token for token once types are stripped and the
 * formatting unified (identifiers are never renamed), each table and line must be equal. Only the hunks declared in `differences`, each with
 * its reason, may differ; an undeclared hunk fails with the diff in the message, and so does a declared hunk that no longer exists.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { checkFidelity, findDeclaration, normalize, portFunction, protoFragment, protoFunction, protoSource, protoValue, type FidelitySpec } from '../../helpers/protoFidelity';
import { loadCore } from '../../helpers/loyalty';

const ROOT = resolve(__dirname, '../../..');
let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

describe('the fidelity helpers', () => {
  it('protoSource is the script of the prototype (every inline <script>, in order)', () => {
    const src = protoSource('breath');
    expect(src).toContain('function windowOpenness() {');
    expect(src).not.toContain('<script');
    expect(src).not.toContain('</script>');
    // her_activity.html has three scripts: the last one's hooks are there too
    expect(protoSource('her_activity')).toContain('window.__G = () => G;');
  });

  it('protoFunction returns a top-level function\'s whole source, and a `const fn = (…) =>`', () => {
    const html = readFileSync(join(ROOT, 'docs/prototypes/breath.html'), 'utf8');
    const start = html.indexOf('function windowOpenness() {');
    const end = html.indexOf('\n}\n', start) + 2;
    expect(protoFunction('breath', 'windowOpenness')).toBe(html.slice(start, end));
    expect(protoFunction('breath', 'clamp')).toBe('const clamp = (x, a, b) => Math.min(b, Math.max(a, x));');
    expect(protoFunction('breath', 'SEAT_BODY').startsWith('const SEAT_BODY = [')).toBe(true);
    expect(protoFunction('breath', 'SEAT_BODY').endsWith('];')).toBe(true);
    expect(() => protoFunction('breath', 'noSuchFunction')).toThrow(/noSuchFunction/);
  });

  it('the parser skips braces in strings, template literals, comments and regexes; only the top level counts', () => {
    const src = [
      'function inner() { return 1; }',
      'function f(a = {}) {',
      '  const s = "}" + \'{\' + `${ { x: "}" }.x } }`; // a } in a comment',
      '  /* { */ const r = /[}{]/g;',
      '  function nested() { return 2; }',
      '  return s.replace(r, "");',
      '}',
      'const g = (x) => {',
      '  return x;',
      '}',
      'const a = 1, b = { c: [1, 2] }, d = 3;',
      'let after = 0;',
    ].join('\n');
    expect(findDeclaration(src, 'f')).toBe(src.slice(src.indexOf('function f('), src.indexOf('}\nconst g') + 1));
    expect(findDeclaration(src, 'g')).toBe('const g = (x) => {\n  return x;\n}');
    expect(findDeclaration(src, 'b')).toBe('const b = { c: [1, 2] };');
    expect(findDeclaration(src, 'after')).toBe('let after = 0;');
    expect(() => findDeclaration(src, 'nested')).toThrow(/nested/); // not top level
  });

  it('protoFragment takes the lines from one marker through another until its braces close', () => {
    const frag = protoFragment('weight', 'const n = Math.max(1, Math.ceil(h / 0.008))', 'G.ctl += G.ctlV * hs;');
    expect(frag.trimStart().startsWith('const n = Math.max(1, Math.ceil(h / 0.008))')).toBe(true);
    expect(frag.trimEnd().endsWith('}')).toBe(true);
    expect(normalize(frag)).toContain('G.bubbleX+=G.bubbleV*hs');
  });

  it('portFunction is the port\'s function with its types stripped (TypeScript\'s transpileModule, which renames nothing)', () => {
    const src = portFunction('src/ui/scene/instruments/kit/chaikin.ts', 'chaikin');
    expect(src.startsWith('function chaikin(pts) {')).toBe(true);
    expect(src).not.toMatch(/Pt\[\]|: number/);
    expect(portFunction('tests/fixtures/fidelity/port.ts', 'lerp')).toMatch(/^const lerp = \(a, b, t\) =>/);
  });

  it('normalize unifies formatting, semicolons, trailing commas, comments and const/let/var; it renames nothing and leaves strings alone', () => {
    const a = 'function f(x, y) {\n  // a comment\n  let z = [x, y,];\n  return z.map((v) => v * 2);\n}';
    const b = 'function f(x,y){ var z=[x,y] /* other */\n return z.map(v=>v*2) }';
    expect(normalize(a)).toBe(normalize(b));
    expect(normalize(a)).not.toBe(normalize(a.replace(/\bz\b/g, 'w')));
    expect(normalize('const s = "var let";')).toContain('"var let"');
    expect(normalize('const s = `${a} var ${b}`;')).toContain('`${a} var ${b}`');
    expect(normalize('const s = "a; b { c }";')).toBe('const s="a; b { c }"'); // no line break inside a string
    // a `/` after a name or a number divides; after `}` or `(` it opens a regex (the masker and the tokenizer agree)
    expect(normalize('const q = (i / 72) * x / y;')).toBe('const q=(i/72)*x/y');
    expect(normalize('if (a) {}\n/[}{]/g.test(s)')).toBe('if(a){}\n/[}{]/g.test(s)');
    expect(normalize('let x = 0.008, y = 1000;')).toBe(normalize('const x = 8e-3, y = 1e3'));
  });

  it('protoValue evaluates a top-level table of the prototype', () => {
    const styles = protoValue('weight', 'STYLES') as Record<string, { tele: number[]; even?: number }>;
    expect(Object.keys(styles)).toEqual(['neutral', 'affectionate', 'ritual', 'playful', 'clinical', 'cruel']);
    expect(styles.ritual).toMatchObject({ tele: [750, 750], announce: true, even: 4 });
    expect(protoValue('cards', 'HANDS', ['GAME_HANDS', 'STRICT', 'CANDIDATES'])).toHaveLength(48);
  });
});

describe('the fidelity check', () => {
  it('a fidelity.json with an undeclared difference fails with the diff in the message', async () => {
    const spec = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/fidelity/undeclared.json'), 'utf8')) as FidelitySpec;
    const failures = await checkFidelity(spec, { registries: reg });
    expect(failures).toHaveLength(1); // lerp, formatted otherwise and typed, is equal
    expect(failures[0]).toMatch(/clamp/);
    expect(failures[0]).toContain('-const clamp=(x,a,b)=>Math.min(b,Math.max(a,x))');
    expect(failures[0]).toContain('+const clamp=(x,a,b)=>Math.min(a,Math.max(b,x))');
    expect(failures[0]).toContain('"diff":'); // the JSON to paste, once a reason is written
  });

  it('a declared difference passes; a declared difference that no longer exists fails', async () => {
    const base = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/fidelity/undeclared.json'), 'utf8')) as FidelitySpec;
    const diff = '@@ -1 +1 @@\n-const clamp=(x,a,b)=>Math.min(b,Math.max(a,x))\n+const clamp=(x,a,b)=>Math.min(a,Math.max(b,x))';
    expect(await checkFidelity({ ...base, differences: [{ fn: 'clamp', reason: 'a fixture', diff }] }, { registries: reg })).toEqual([]);
    const stale = await checkFidelity({ ...base, differences: [{ fn: 'clamp', reason: 'a fixture', diff }, { fn: 'lerp', reason: 'stale', diff: '@@ -1 +1 @@\n-a\n+b' }] }, { registries: reg });
    expect(stale).toHaveLength(1);
    expect(stale[0]).toMatch(/lerp.*no longer/s);
    const orphan = await checkFidelity({ ...base, differences: [{ fn: 'clamp', reason: 'a fixture', diff }, { fn: 'nothing', reason: 'none', diff }] }, { registries: reg });
    expect(orphan.join('\n')).toMatch(/nothing/);
  });

  it('tables must be deep-equal; lines must equal the registry rows the port reads', async () => {
    const ok: FidelitySpec = {
      prototype: 'cards', functions: [], differences: [],
      tables: [],
      lines: [{ ident: 'NEUTRAL', registry: 'cardVoice', cueKinds: { when: 'when', cost: 'cost' } }],
    };
    expect(await checkFidelity(ok, { registries: reg })).toEqual([]);
    const badTable: FidelitySpec = { prototype: 'breath', functions: [], differences: [], tables: [{ ident: 'SEAT_BODY', module: 'tests/fixtures/fidelity/port.ts', export: 'SEAT_BODY' }] };
    expect((await checkFidelity(badTable, { registries: reg })).join('\n')).toMatch(/SEAT_BODY/);
    // a table that holds functions is never compared by value (JSON would drop them): an empty SFX, or SHAPES with a changed method, fails
    const sfx: FidelitySpec = { prototype: 'breath', functions: [], differences: [], tables: [{ ident: 'SFX', module: 'tests/fixtures/fidelity/port.ts', export: 'SFX' }] };
    expect((await checkFidelity(sfx, { registries: reg })).join('\n')).toMatch(/SFX.*holds functions.*list it under `functions`/s);
    const shapes: FidelitySpec = { prototype: 'breath', functions: [], differences: [], tables: [{ ident: 'SHAPES', module: 'tests/fixtures/fidelity/port.ts', export: 'SHAPES' }] };
    expect((await checkFidelity(shapes, { registries: reg })).join('\n')).toMatch(/SHAPES.*holds functions/s);
    const badLine: FidelitySpec = { ...ok, lines: [{ ident: 'NEUTRAL', registry: 'cardVoice', cueKinds: { when: 'cost' } }] };
    expect((await checkFidelity(badLine, { registries: reg })).join('\n')).toMatch(/NEUTRAL\.when/);
  });
});

/** Every instrument's (and the kit's) fidelity.json. */
const DIR = join(ROOT, 'src/ui/scene/instruments');
const specs = readdirSync(DIR, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(DIR, d.name, 'fidelity.json'))).map((d) => d.name);

describe('the ports match their prototypes', () => {
  it('there is at least the kit', () => {
    expect(specs).toContain('kit');
  });
  it.each(specs)('%s/fidelity.json', async (name) => {
    const spec = JSON.parse(readFileSync(join(DIR, name, 'fidelity.json'), 'utf8')) as FidelitySpec;
    const failures = await checkFidelity(spec, { registries: reg });
    expect(failures.join('\n\n')).toBe('');
  });
});
