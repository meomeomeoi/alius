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
import { checkFidelity, findDeclaration, normalize, portFunction, protoControl, protoFragment, protoFunction, protoSource, protoValue, type FidelitySpec } from '../../helpers/protoFidelity';
import { loadCore } from '../../helpers/loyalty';

const ROOT = resolve(__dirname, '../../..');
let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

describe('the fidelity helpers', () => {
  it('review M-R3: a declared table addition that the prototype\'s table also has fails (it cannot hide a changed row)', async () => {
    const spec: FidelitySpec = { prototype: 'weight', note: '', functions: [], differences: [],
      tables: [{ ident: 'STYLES', module: 'src/ui/scene/instruments/weight/weight.ts', export: 'STYLES', additions: { regal: 'throne.html', neutral: 'hides a row' } }] };
    const failures = await checkFidelity(spec, { registries: reg });
    expect(failures.some((f) => f.includes('STYLES.neutral') && f.includes('prototype'))).toBe(true);
    expect(failures.some((f) => f.includes('STYLES.regal'))).toBe(false);
  });

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

describe('the panel controls (P10e-f: the stage setup ports the prototypes\' fit controls)', () => {
  it('protoControl reads a range input of the prototype\'s panel: its label, range, step and default', () => {
    expect(protoControl('weight', 'overH')).toEqual({ label: 'over height', type: 'range', min: 0.6, max: 1.8, step: 0.01, value: 1.04 });
    expect(protoControl('throne', 'aTilt')).toEqual({ label: 'art tilt °', type: 'range', min: -30, max: 30, step: 1, value: 8 });
  });
  it('protoControl reads a select: its option values and texts, the selected one or the first', () => {
    expect(protoControl('shoe', 'feetSel')).toEqual({ label: 'feet in this picture', type: 'select', options: [['one', 'one'], ['two', 'two']], value: 'one' });
    expect(() => protoControl('weight', 'noSuchControl')).toThrow(/noSuchControl/);
  });
  it('a port\'s control table must equal the prototype\'s inputs; a declared row must be the port\'s', async () => {
    const spec: FidelitySpec = { prototype: 'weight', functions: [], tables: [], differences: [], controls: [{ module: 'tests/fixtures/fidelity/controls.ts', export: 'OVER' }] };
    const failures = await checkFidelity(spec, { registries: reg });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/OVER\.overX/);
    expect(failures[0]).toContain('"step":0.02');
    const declared = { ...spec, differences: [{ fn: 'OVER.overX', reason: 'a fixture', diff: JSON.stringify({ label: 'over x', type: 'range', min: 0.3, max: 0.7, step: 0.02, value: 0.5 }) }] };
    expect(await checkFidelity(declared, { registries: reg })).toEqual([]);
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

/** P10e-f: the stage setup's ports (the fit controls and the zone marker of the prototypes' panels). */
const STAGE = join(ROOT, 'src/ui/stage/fidelity.json');
describe('the stage setup\'s ports match their prototypes (P10e-f)', () => {
  it('src/ui/stage/fidelity.json', async () => {
    const spec = JSON.parse(readFileSync(STAGE, 'utf8')) as FidelitySpec;
    expect(spec.controls?.length ?? 0).toBeGreaterThan(0);
    const failures = await checkFidelity(spec, { registries: reg });
    expect(failures.join('\n\n')).toBe('');
  });
  it('it covers the zone marker of both prototypes: zoneRadii / zoneAt and the marker\'s handlers', () => {
    const spec = JSON.parse(readFileSync(STAGE, 'utf8')) as FidelitySpec;
    const of = (proto: string) => spec.functions.filter((f) => (f.prototype ?? spec.prototype) === proto).map((f) => f.fn);
    for (const fn of ['zoneRadii', 'zoneAt', 'inEllipse', 'MARK', 'markStart', 'markDown', 'markMove', 'markUp', 'markFinish', 'onWheel', 'drawMarks']) expect(of('her_activity')).toContain(fn);
    for (const fn of ['zoneRadii', 'zoneAtPic', 'inEllipse', 'toPic', 'MARK', 'markStart', 'markPrompt', 'markDown', 'markMove', 'markUp', 'markFinish', 'onWheel', 'drawMarks']) expect(of('shoe')).toContain(fn);
  });
  it('a difference scoped to a module does not excuse the function of the same name in another', async () => {
    const spec = JSON.parse(readFileSync(STAGE, 'utf8')) as FidelitySpec;
    const finish = spec.differences.find((d) => d.fn === 'markFinish')!;
    const moved = { ...spec, differences: spec.differences.map((d) => (d === finish ? { ...d, module: 'src/ui/stage/fit/shoe.ts' } : d)) };
    const failures = (await checkFidelity(moved, { registries: reg })).join('\n');
    expect(failures).toMatch(/markFinish \(her_activity\.html.*undeclared/s);
    expect(failures).toMatch(/markFinish: 1 declared hunk\(s\) no longer/);
  });
  it('an edited port fails: a "copy the fit" with a changed key, a control with a changed range', async () => {
    const spec = JSON.parse(readFileSync(STAGE, 'utf8')) as FidelitySpec;
    const fn = spec.functions.find((f) => f.fn === 'copyOver')!;
    const edited: FidelitySpec = { ...spec, functions: [{ ...fn, module: 'tests/fixtures/fidelity/stagePort.ts' }], tables: [], controls: [], differences: spec.differences.filter((d) => d.fn === 'copyOver') };
    expect((await checkFidelity(edited, { registries: reg })).join('\n')).toMatch(/copyOver.*undeclared/s);
    const ctl = spec.controls!.find((c) => c.export === 'WEIGHT_CONTROLS')!;
    const range: FidelitySpec = { ...spec, functions: [], tables: [], controls: [{ ...ctl, module: 'tests/fixtures/fidelity/stagePort.ts' }], differences: [] };
    expect((await checkFidelity(range, { registries: reg })).join('\n')).toMatch(/WEIGHT_CONTROLS\.overSink/);
  });
});
