/**
 * P10e-e Task 6: the prototype fidelity helpers. The instruments are copied from `docs/prototypes/<name>.html` (JS → TS: types added,
 * nothing else changed); these helpers find a function or a table in the prototype and in the port and compare them.
 *
 * - `protoSource(name)`: every inline `<script>` of the prototype, in order.
 * - `findDeclaration(src, fn)` / `protoFunction(name, fn)`: one top-level declaration (`function fn`, `async function fn`, `class fn`,
 *   `const|let|var fn = …`, one declarator of a list), found by a small parser over the script (strings, template literals, comments and
 *   regexes are skipped; only depth 0 counts).
 * - `protoFragment(name, from, to)`: the lines from the one holding `from` through the one holding `to`, extended until its braces close (code
 *   the prototype keeps inline, with no function of its own).
 * - `portFunction(module, fn)`: the same declaration in the port, its types stripped (TypeScript's `transpileModule`), `export` dropped.
 * - `normalize(src)`: a small tokenizer prints both sides the same way: comments dropped, whitespace only where two words meet, numbers by
 *   value (`0.008` = `8e-3`), strings in double quotes by value, trailing commas dropped, `let` / `var` → `const`, and one statement a line
 *   (a `;` or a newline where the statement cannot go on ends it; a line also ends after `{` and around `}`). Identifiers are never renamed;
 *   the text of a string, a template or a regex is never touched (a template's `${…}` is normalized on one line).
 * - `protoValue(name, ident, deps?)`: a top-level table of the prototype, evaluated in a sandbox (`new Function` over its declaration and the
 *   declarations of `deps` alone).
 * - `checkFidelity(spec, { registries })`: the gate, see `FidelitySpec`.
 */
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import type { Registries } from '../../src/content/types';

const ROOT = resolve(__dirname, '../..');

/**
 * The format of `src/ui/scene/instruments/<name>/fidelity.json`.
 * - `prototype`: the default prototype (`docs/prototypes/<prototype>.html`); an entry may name its own.
 * - `functions`: each `fn` of the prototype against `as ?? fn` of `module` (the port's declared name is read as `fn`; nothing else is renamed).
 *   A `fragment` compares the prototype's inline code (`from` / `to` markers, see `protoFragment`) with the port's function `fn`. A `const`
 *   whose value is an object of methods (`SHAPES`) is a function entry: the whole declaration is compared, method by method in its lines.
 * - `tables`: `protoValue(prototype, ident, deps)` deep-equals the export `export` of `module`.
 * - `lines`: each `path` (dotted, into the prototype's table `ident`) equals the lines of the registry row the port reads: `physicsCues` (the
 *   default; the row of that `kind`, and of `physics` when given) or `cardVoice` (`kind` or `kind@style`).
 * - `differences`: hunks of the unified diff (one line of context, `@@` headers) of the normalized prototype (`-`) against the normalized port
 *   (`+`), each entry with its `reason`. Every hunk of a function's diff must be declared (several entries may share an `fn`), and every
 *   declared hunk must still exist.
 */
export interface FidelitySpec {
  prototype: string;
  note?: string;
  functions: Array<{ fn: string; module: string; as?: string; prototype?: string; fragment?: { from: string; to: string } }>;
  /** `additions`: keys the port's table adds, each from another prototype (its reason): compared without them. */
  tables: Array<{ ident: string; module: string; export: string; prototype?: string; deps?: string[]; additions?: Record<string, string> }>;
  /**
   * `format` reads a table of objects as the registry's strings (her_activity's placeholders, Ruling Z): `toYou` / `ask` the `text` of the items
   * without / with `ask`; `exchange` each `{ other, her }` as `other|her` and `{ other, mention: { plain, veiled } }` as `other|plain|veiled`.
   * A path `.` is the whole table.
   */
  lines?: Array<{ ident: string; prototype?: string; registry?: 'physicsCues' | 'cardVoice'; physics?: string; format?: 'toYou' | 'ask' | 'exchange'; cueKinds: Record<string, string> }>;
  differences: Array<{ fn: string; reason: string; diff: string }>;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// the scanner: a copy of the source with the inside of every string, template, comment and regex blanked (same length, newlines kept)

const KEYWORDS_BEFORE_REGEX = new Set(['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'throw', 'else', 'do', 'yield', 'await', 'instanceof']);
const isIdent = (c: string | undefined): boolean => c !== undefined && /[A-Za-z0-9_$]/.test(c);
/**
 * Whether a `/` starts a regex here: after nothing, after a punctuator that cannot end an expression (its last character is one of these; `)`
 * and `]` end one, `}` is read as the end of a block, so a regex may follow it), or after a keyword such as `return`. The masker (by
 * character) and the tokenizer (by token) both ask this, so they never disagree.
 */
const REGEX_AFTER_CHARS = '(,=:[!&|?{};+-*%<>~^';
const regexMayStart = (prevChar: string, word: string): boolean => prevChar === '' || REGEX_AFTER_CHARS.includes(prevChar) || (word !== '' && KEYWORDS_BEFORE_REGEX.has(word));

/** Code positions only: the inside of strings, templates (with their `${}`), comments and regexes are spaces; quotes and delimiters stay. */
export function mask(src: string): string {
  const out = src.split('');
  const n = src.length;
  const blank = (a: number, b: number): void => {
    for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  const endString = (i: number): number => {
    const q = src[i];
    let j = i + 1;
    while (j < n) {
      if (src[j] === '\\') j += 2;
      else if (src[j] === q) return j + 1;
      else if (src[j] === '\n') return j;
      else j++;
    }
    return n;
  };
  const endExpr = (i: number): number => {
    // from just after `${` to just after its `}`
    let depth = 1;
    let j = i;
    while (j < n) {
      const c = src[j];
      if (c === '"' || c === "'") j = endString(j);
      else if (c === '`') j = endTemplate(j);
      else if (c === '/' && src[j + 1] === '/') j = src.indexOf('\n', j) < 0 ? n : src.indexOf('\n', j);
      else if (c === '/' && src[j + 1] === '*') j = src.indexOf('*/', j + 2) < 0 ? n : src.indexOf('*/', j + 2) + 2;
      else {
        if (c === '{') depth++;
        else if (c === '}' && --depth === 0) return j + 1;
        j++;
      }
    }
    return n;
  };
  const endTemplate = (i: number): number => {
    let j = i + 1;
    while (j < n) {
      if (src[j] === '\\') j += 2;
      else if (src[j] === '`') return j + 1;
      else if (src[j] === '$' && src[j + 1] === '{') j = endExpr(j + 2);
      else j++;
    }
    return n;
  };
  const endRegex = (i: number): number => {
    let j = i + 1;
    let cls = false;
    while (j < n) {
      const c = src[j];
      if (c === '\\') j += 2;
      else if (c === '\n') return j;
      else if (c === '[') { cls = true; j++; } else if (c === ']') { cls = false; j++; } else if (c === '/' && !cls) {
        j++;
        while (j < n && /[a-z]/i.test(src[j]!)) j++;
        return j;
      } else j++;
    }
    return n;
  };
  let prev = ''; // the last significant code character
  let word = ''; // the identifier ending at `prev`, if any
  let i = 0;
  while (i < n) {
    const c = src[i]!;
    if (c === '/' && src[i + 1] === '/') {
      const j = src.indexOf('\n', i) < 0 ? n : src.indexOf('\n', i);
      blank(i, j);
      i = j;
    } else if (c === '/' && src[i + 1] === '*') {
      const j = src.indexOf('*/', i + 2) < 0 ? n : src.indexOf('*/', i + 2) + 2;
      blank(i, j);
      i = j;
    } else if (c === '"' || c === "'") {
      const j = endString(i);
      blank(i + 1, j - 1);
      prev = c; word = ''; i = j;
    } else if (c === '`') {
      const j = endTemplate(i);
      blank(i + 1, j - 1);
      prev = c; word = ''; i = j;
    } else if (c === '/' && regexMayStart(prev, isIdent(prev) ? word : '')) {
      const j = endRegex(i);
      blank(i + 1, j - 1);
      prev = '/'; word = ''; i = j;
    } else {
      if (!/\s/.test(c)) {
        word = isIdent(c) ? (isIdent(prev) && src[i - 1] === prev ? word + c : c) : '';
        prev = c;
      }
      i++;
    }
  }
  return out.join('');
}

/** The index of the bracket that closes the one at `open` (in the masked source). */
function closeOf(m: string, open: number): number {
  const pair: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const stack: string[] = [];
  for (let j = open; j < m.length; j++) {
    const c = m[j]!;
    if (c in pair) stack.push(pair[c]!);
    else if (c === ')' || c === ']' || c === '}') {
      if (stack.pop() !== c) throw new Error(`unbalanced "${c}" at ${j}`);
      if (stack.length === 0) return j;
    }
  }
  throw new Error(`no close for the bracket at ${open}`);
}

/** The bracket depth before each position of the masked source. */
function depths(m: string): Int32Array {
  const d = new Int32Array(m.length + 1);
  let depth = 0;
  for (let j = 0; j < m.length; j++) {
    d[j] = depth;
    const c = m[j]!;
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
  }
  d[m.length] = depth;
  return d;
}

const CONTINUES_AFTER = ',=+-*/%&|^!?:(<>[{.';
const CONTINUES_BEFORE = '.,?:+-*/%&|^=)]}';
/** Where the statement at depth `base` that holds `from` ends: just after its `;`, or at a newline where it cannot go on. */
function statementEnd(m: string, d: Int32Array, from: number, base: number): number {
  for (let j = from; j < m.length; j++) {
    if (d[j]! < base) return j; // the enclosing block closed
    if (d[j] !== base) continue;
    const c = m[j]!;
    if (c === ';') return j + 1;
    if (c === '\n') {
      const before = m.slice(from, j).trimEnd();
      const last = before[before.length - 1] ?? '';
      const next = m.slice(j).trimStart()[0] ?? '';
      if (before !== '' && !CONTINUES_AFTER.includes(last) && !CONTINUES_BEFORE.includes(next)) return j;
    }
  }
  return m.length;
}

/** One top-level declaration of `fn` in `src` (see the module's comment). Throws when there is none. */
export function findDeclaration(src: string, fn: string): string {
  const m = mask(src);
  const d = depths(m);
  const name = fn.replace(/[$]/g, '\\$');
  // function, async function, generator, class
  const fnRe = new RegExp(`(?:\\b(?:export\\s+(?:default\\s+)?)?(?:async\\s+)?)\\b(function\\s*\\*?\\s*|class\\s+)${name}\\b`, 'g');
  for (let r = fnRe.exec(m); r; r = fnRe.exec(m)) {
    if (d[r.index] !== 0) continue;
    const isClass = r[1]!.startsWith('class');
    let j = r.index + r[0].length;
    if (!isClass) {
      const open = m.indexOf('(', j);
      j = closeOf(m, open) + 1;
    }
    const body = m.indexOf('{', j);
    return src.slice(r.index, closeOf(m, body) + 1).replace(/^export\s+(default\s+)?/, '');
  }
  // const / let / var: the declarator of `fn` in the list
  const varRe = /\b(?:export\s+)?(const|let|var)\s+/g;
  for (let r = varRe.exec(m); r; r = varRe.exec(m)) {
    if (d[r.index] !== 0 || (r.index > 0 && isIdent(m[r.index - 1]))) continue;
    const kw = r[1]!;
    const start = r.index + r[0].length;
    const end = statementEnd(m, d, start, 0);
    // split the declarators at the commas of depth 0
    const parts: Array<[number, number]> = [];
    let a = start;
    for (let j = start; j < end; j++) if (d[j] === 0 && m[j] === ',') { parts.push([a, j]); a = j + 1; }
    parts.push([a, end]);
    for (const [p, q] of parts) {
      const decl = src.slice(p, q).trim().replace(/;$/, '').trim();
      if (!new RegExp(`^${name}\\s*(?::[^=]*)?=`).test(decl) && decl !== fn) continue;
      if (parts.length === 1) return src.slice(r.index + r[0].indexOf(kw), end).trimEnd();
      return `${kw} ${decl};`;
    }
  }
  throw new Error(`no top-level declaration of "${fn}"`);
}

/** Every inline `<script>` of `docs/prototypes/<name>.html`, in order. */
export function protoSource(name: string): string {
  const html = readFileSync(join(ROOT, 'docs/prototypes', `${name}.html`), 'utf8');
  const parts: string[] = [];
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/g;
  for (let r = re.exec(html); r; r = re.exec(html)) if (!/\bsrc\s*=/.test(r[1] ?? '')) parts.push(r[2]!);
  if (parts.length === 0) throw new Error(`no <script> in ${name}.html`);
  return parts.join('\n');
}

export function protoFunction(name: string, fn: string): string {
  return findDeclaration(protoSource(name), fn);
}

/** The lines of the prototype from the one holding `from` through the one holding `to`, then on until the braces it opened close. */
export function protoFragment(name: string, from: string, to: string): string {
  const src = protoSource(name);
  const m = mask(src);
  const at = src.indexOf(from);
  if (at < 0) throw new Error(`no "${from}" in ${name}.html`);
  if (src.indexOf(from, at + 1) >= 0) throw new Error(`"${from}" is not unique in ${name}.html`);
  const start = src.lastIndexOf('\n', at) + 1;
  const toAt = src.indexOf(to, at);
  if (toAt < 0) throw new Error(`no "${to}" after "${from}" in ${name}.html`);
  let end = src.indexOf('\n', toAt);
  if (end < 0) end = src.length;
  let depth = 0;
  for (let j = start; j < end; j++) depth += m[j] === '{' || m[j] === '(' || m[j] === '[' ? 1 : m[j] === '}' || m[j] === ')' || m[j] === ']' ? -1 : 0;
  for (let j = end; depth > 0 && j < src.length; j++) {
    depth += m[j] === '{' || m[j] === '(' || m[j] === '[' ? 1 : m[j] === '}' || m[j] === ')' || m[j] === ']' ? -1 : 0;
    if (depth === 0) {
      end = src.indexOf('\n', j) < 0 ? src.length : src.indexOf('\n', j);
    }
  }
  return src.slice(start, end);
}

const typeStripped = new Map<string, string>();
/**
 * The port's declaration of `fn` in `modulePath` (from the repo root), its types stripped and `export` dropped. The types are stripped by
 * TypeScript's `transpileModule`, not esbuild: esbuild's printer renames a local that shadows another name (`innerWidth` → `innerWidth2`),
 * and the gate must never rename an identifier.
 */
export function portFunction(modulePath: string, fn: string): string {
  let js = typeStripped.get(modulePath);
  if (js === undefined) {
    js = ts.transpileModule(readFileSync(join(ROOT, modulePath), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }).outputText;
    typeStripped.set(modulePath, js);
  }
  return findDeclaration(js, fn);
}

/** See the module's comment. */
type Tok = { t: 'id' | 'num' | 'str' | 'tpl' | 're' | 'p'; v: string; nl: boolean };
const PUNCT = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>'];

/** The tokens of `src` (comments dropped; `nl` marks a token that starts a new line). Numbers, strings and templates are canonical. */
function tokens(src: string): Tok[] {
  const m = mask(src);
  const out: Tok[] = [];
  let nl = false;
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    if (c === '\n') { nl = true; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { // a comment: dropped (the newline that ends it stays)
      i = src.indexOf('\n', i) < 0 ? n : src.indexOf('\n', i);
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const j = src.indexOf('*/', i + 2) < 0 ? n : src.indexOf('*/', i + 2) + 2;
      if (src.slice(i, j).includes('\n')) nl = true;
      i = j;
      continue;
    }
    const push = (t: Tok['t'], v: string, len: number): void => { out.push({ t, v, nl }); nl = false; i += len; };
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && m[j] !== c) j++;
      const raw = src.slice(i, j + 1);
      push('str', JSON.stringify(new Function(`return ${raw}`)() as string), raw.length);
      continue;
    }
    if (c === '`') {
      let j = i + 1;
      while (j < n && m[j] !== '`') j++;
      const raw = src.slice(i, j + 1);
      push('tpl', templateCanon(raw), raw.length);
      continue;
    }
    const prev = out[out.length - 1];
    if (c === '/' && regexMayStart(prev ? prev.v[prev.v.length - 1]! : '', prev?.t === 'id' ? prev.v : '')) {
      let j = i + 1;
      while (j < n && m[j] !== '/') j++;
      j++;
      while (j < n && /[a-z]/i.test(src[j]!)) j++;
      push('re', src.slice(i, j), j - i);
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const r = /^(0[xXbBoO][0-9a-fA-F_]+n?|(?:[0-9][0-9_]*)?\.?[0-9_]*(?:[eE][+-]?[0-9_]+)?n?)/.exec(src.slice(i))!;
      const raw = r[1]!;
      push('num', raw.endsWith('n') ? raw.replace(/_/g, '') : String(Number(raw.replace(/_/g, ''))), raw.length);
      continue;
    }
    if (isIdent(c) || c === '#') {
      let j = i + 1;
      while (j < n && isIdent(src[j])) j++;
      push('id', src.slice(i, j), j - i);
      continue;
    }
    const op = PUNCT.find((o) => src.startsWith(o, i)) ?? c;
    push('p', op, op.length);
  }
  return out;
}

/** A template literal: its text as it is, each `${…}` normalized on one line. */
function templateCanon(raw: string): string {
  let out = '`';
  let j = 1;
  while (j < raw.length - 1) {
    if (raw[j] === '\\') { out += raw.slice(j, j + 2); j += 2; continue; }
    if (raw[j] === '$' && raw[j + 1] === '{') {
      // the expression runs to its `}` (the mask of the expression alone finds it)
      const rest = raw.slice(j + 2);
      const m = mask(rest);
      let depth = 1;
      let k = 0;
      for (; k < m.length; k++) {
        if (m[k] === '{') depth++;
        else if (m[k] === '}' && --depth === 0) break;
      }
      out += '${' + joinTokens(tokens(rest.slice(0, k))) + '}';
      j += 2 + k + 1;
      continue;
    }
    out += raw[j];
    j++;
  }
  return out + '`';
}

const glue = (a: Tok | undefined, b: Tok): boolean => {
  if (!a) return false;
  const word = (t: Tok): boolean => t.t === 'id' || t.t === 'num';
  return (word(a) && word(b)) || (a.v === '+' && b.v.startsWith('+')) || (a.v === '-' && b.v.startsWith('-')) || (a.t === 're' && word(b));
};
function joinTokens(ts: Tok[]): string {
  let out = '';
  ts.forEach((t, k) => { out += (glue(ts[k - 1], t) ? ' ' : '') + t.v; });
  return out;
}

/** let / var → const, where they are keywords (not a property, followed by a binding). */
function unifyDeclarations(ts: Tok[]): void {
  ts.forEach((t, k) => {
    const next = ts[k + 1];
    if (t.t === 'id' && (t.v === 'let' || t.v === 'var') && ts[k - 1]?.v !== '.' && ts[k - 1]?.v !== '?.' && next && (next.t === 'id' || next.v === '[' || next.v === '{')) t.v = 'const';
  });
}

const CONT_KEYWORDS = new Set(['else', 'do', 'in', 'of', 'instanceof', 'typeof', 'new', 'delete', 'void', 'await', 'yield', 'case', 'extends']);
const CONT_NEXT = new Set(['.', '?.', ',', '(', '[', ')', ']', '}', '?', ':', '=', '=>', '+', '-', '*', '/', '%', '**', '&&', '||', '??', '&', '|', '^', '<', '>', '<=', '>=', '==', '!=', '===', '!==', '<<', '>>', '>>>', '+=', '-=', '*=', '/=', '%=', '**=', '&=', '|=', '^=', '<<=', '>>=', '>>>=', '&&=', '||=', '??=']);

/** See the module's comment. */
export function normalize(src: string): string {
  // trailing commas go
  const ts = tokens(src).filter((t, k, all) => !(t.t === 'p' && t.v === ',' && all[k + 1]?.t === 'p' && [']', '}', ')'].includes(all[k + 1]!.v)));
  unifyDeclarations(ts);
  // `(x) =>` and `x =>` are one arrow: its single parameter loses its parentheses
  for (let k = ts.length - 4; k >= 0; k--) {
    if (ts[k]!.v === '(' && ts[k + 1]!.t === 'id' && ts[k + 2]!.v === ')' && ts[k + 3]!.v === '=>') {
      ts[k + 1]!.nl = ts[k + 1]!.nl || ts[k]!.nl;
      ts.splice(k + 2, 1);
      ts.splice(k, 1);
    }
  }
  // the brackets: which `(` belongs to a control header (if / for / while / with / catch), so its `)` does not end a statement
  const control = new Set<number>(); // indices of the `)` that close a control header
  const opens: Array<{ v: string; header: boolean }> = [];
  const insideOf: string[] = []; // the innermost bracket before each token
  ts.forEach((t, k) => {
    insideOf.push(opens.length > 0 ? opens[opens.length - 1]!.v : '');
    if (t.t !== 'p') return;
    if (t.v === '(' || t.v === '[' || t.v === '{') opens.push({ v: t.v, header: t.v === '(' && ['if', 'for', 'while', 'with', 'catch', 'switch'].includes(ts[k - 1]?.v ?? '') && ts[k - 1]?.t === 'id' });
    else if (t.v === ')' || t.v === ']' || t.v === '}') {
      const o = opens.pop();
      if (o?.header) control.add(k);
    }
  });
  const lines: string[] = [];
  let cur: Tok[] = [];
  const br = (): void => {
    if (cur.length > 0) lines.push(joinTokens(cur));
    cur = [];
  };
  ts.forEach((t, k) => {
    const blockLevel = insideOf[k] === '' || insideOf[k] === '{';
    // a statement that ends at a newline (no semicolon): the previous token cannot go on and this one cannot continue it
    if (t.nl && blockLevel && cur.length > 0) {
      const last = ts[k - 1]!;
      const lastGoesOn = (last.t === 'p' && !['++', '--', ')', ']', '}'].includes(last.v)) || (last.t === 'id' && CONT_KEYWORDS.has(last.v)) || control.has(k - 1);
      const thisGoesOn = (t.t === 'p' && CONT_NEXT.has(t.v)) || t.t === 'tpl' || (t.t === 'id' && ['in', 'of', 'instanceof'].includes(t.v));
      if (!lastGoesOn && !thisGoesOn) br();
    }
    if (t.t === 'p' && t.v === ';' && blockLevel) { br(); return; } // semicolons: a statement's end is a line's end
    const next = ts[k + 1];
    if (t.t === 'p' && t.v === '}' && ts[k - 1]?.v !== '{') br(); // `{}` stays whole
    cur.push(t);
    if (t.t === 'p' && t.v === '{' && next?.v !== '}') br();
    else if (t.t === 'p' && t.v === '}' && next && (next.t !== 'p' || next.v === '{')) br(); // `})`, `},`, `} =` go on
  });
  br();
  return lines.join('\n');
}

/** A top-level table of the prototype, evaluated over its declaration (and those of `deps`) alone. */
export function protoValue(name: string, ident: string, deps: string[] = []): unknown {
  const src = protoSource(name);
  const decls = [...deps, ident].map((d) => findDeclaration(src, d));
  return new Function(`"use strict";\n${decls.join('\n')}\nreturn ${ident};`)();
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// the diff: a line diff (longest common subsequence), printed as unified hunks with one line of context

type Op = [' ' | '-' | '+', string];
function lineDiff(a: string[], b: string[]): Op[] {
  const n = a.length;
  const k = b.length;
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(k + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = k - 1; j >= 0; j--) lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < k) {
    if (a[i] === b[j]) { ops.push([' ', a[i]!]); i++; j++; } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) ops.push(['-', a[i++]!]);
    else ops.push(['+', b[j++]!]);
  }
  while (i < n) ops.push(['-', a[i++]!]);
  while (j < k) ops.push(['+', b[j++]!]);
  return ops;
}

const CONTEXT = 1;
/** The hunks of the unified diff of `a` (the prototype) against `b` (the port); none when they are equal. */
export function unifiedHunks(a: string, b: string): string[] {
  const ops = lineDiff(a.split('\n'), b.split('\n'));
  const changed = ops.map((o, idx) => (o[0] !== ' ' ? idx : -1)).filter((x) => x >= 0);
  if (changed.length === 0) return [];
  // group the changes whose context overlaps
  const groups: Array<[number, number]> = [];
  for (const c of changed) {
    const last = groups[groups.length - 1];
    if (last && c - last[1] <= 2 * CONTEXT + 1) last[1] = c;
    else groups.push([c, c]);
  }
  // line numbers before each op
  const posA: number[] = [];
  const posB: number[] = [];
  let la = 1;
  let lb = 1;
  for (const o of ops) {
    posA.push(la);
    posB.push(lb);
    if (o[0] !== '+') la++;
    if (o[0] !== '-') lb++;
  }
  const range = (start: number, count: number): string => (count === 1 ? `${start}` : `${count === 0 ? start - 1 : start},${count}`);
  return groups.map(([s, e]) => {
    const from = Math.max(0, s - CONTEXT);
    const to = Math.min(ops.length - 1, e + CONTEXT);
    const slice = ops.slice(from, to + 1);
    const ca = slice.filter((o) => o[0] !== '+').length;
    const cb = slice.filter((o) => o[0] !== '-').length;
    return [`@@ -${range(posA[from]!, ca)} +${range(posB[from]!, cb)} @@`, ...slice.map((o) => o[0] + o[1])].join('\n');
  });
}

/** The hunks of a declared diff (split at its `@@` headers). */
function declaredHunks(diff: string): string[] {
  const out: string[] = [];
  for (const line of diff.split('\n')) {
    if (line.startsWith('@@') || out.length === 0) out.push(line);
    else out[out.length - 1] += `\n${line}`;
  }
  return out.map((h) => h.trimEnd()).filter((h) => h !== '');
}

/** A table's items as the registry's strings (`lines[].format`); a value with no format is as it is. */
function formatLines(v: unknown, format: 'toYou' | 'ask' | 'exchange' | undefined): unknown {
  if (format === undefined || !Array.isArray(v)) return v;
  const items = v as Array<Record<string, unknown>>;
  if (format === 'exchange') return items.map((x) => { const m = x.mention as { plain: string; veiled: string } | undefined; return m ? `${String(x.other)}|${m.plain}|${m.veiled}` : `${String(x.other)}|${String(x.her)}`; });
  const out = items.filter((x) => (format === 'ask') === (x.ask === true)).map((x) => String(x.text));
  return out.length > 0 ? out : undefined;
}

function atPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((v, k) => (v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), value);
}

/** The paths of every function inside a value (a table that holds one is not compared by value). */
function functionsIn(v: unknown, path: string, seen = new Set<unknown>()): string[] {
  if (typeof v === 'function') return [path];
  if (v === null || typeof v !== 'object' || seen.has(v)) return [];
  seen.add(v);
  return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => functionsIn(x, `${path}.${k}`, seen));
}

/** The path of the first difference of two plain values (numbers exactly, NaN and ±Infinity included; keys in any order), or null. */
function firstDifference(a: unknown, b: unknown, path: string): string | null {
  if (typeof a === 'number' && typeof b === 'number') return a === b || (Number.isNaN(a) && Number.isNaN(b)) ? null : path;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b ? null : path;
  if (Array.isArray(a) !== Array.isArray(b)) return path;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length || ka.some((k) => !Object.prototype.hasOwnProperty.call(b, k))) return `${path} (keys ${JSON.stringify(ka)} / ${JSON.stringify(kb)})`;
  for (const k of ka) {
    const d = firstDifference((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
    if (d !== null) return d;
  }
  return null;
}
/** JSON that keeps NaN and ±Infinity visible. */
const show = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) => (typeof x === 'number' && !Number.isFinite(x) ? String(x) : x));

/** Every way the port departs from its prototype beyond what `spec.differences` declares (empty: it passes). */
export async function checkFidelity(spec: FidelitySpec, opts: { registries: Registries }): Promise<string[]> {
  const failures: string[] = [];
  const named = new Set(spec.functions.map((f) => f.fn));
  const linePaths = new Set((spec.lines ?? []).flatMap((l) => Object.keys(l.cueKinds).map((p) => `${l.ident}.${p}`)));
  for (const d of spec.differences) {
    if (!named.has(d.fn) && !linePaths.has(d.fn)) failures.push(`a difference is declared for "${d.fn}", which is not a listed function or line`);
    if (d.reason.trim() === '') failures.push(`the difference of "${d.fn}" has no reason`);
  }
  for (const f of spec.functions) {
    const proto = f.prototype ?? spec.prototype;
    let a: string;
    let b: string;
    try {
      a = normalize(f.fragment ? protoFragment(proto, f.fragment.from, f.fragment.to) : protoFunction(proto, f.fn));
      let port = portFunction(f.module, f.as ?? f.fn);
      if (f.as !== undefined) port = port.replace(new RegExp(`(?<![\\w$])${f.as.replace(/[$]/g, '\\$&')}(?![\\w$])`), f.fn); // the declared name only
      b = normalize(port);
    } catch (err) {
      failures.push(`${f.fn} (${proto}.html → ${f.module}): ${(err as Error).message}`);
      continue;
    }
    const actual = unifiedHunks(a, b);
    const declared = spec.differences.filter((d) => d.fn === f.fn).flatMap((d) => declaredHunks(d.diff));
    const undeclared = actual.filter((h) => !declared.includes(h));
    const gone = declared.filter((h) => !actual.includes(h));
    if (undeclared.length > 0) {
      failures.push([
        `${f.fn} (${proto}.html → ${f.module}) differs from the prototype in ${undeclared.length} undeclared hunk(s) (- prototype, + port):`,
        ...undeclared,
        'If the wiring forces it, declare it in fidelity.json with its reason; the whole diff of this function:',
        JSON.stringify({ fn: f.fn, reason: '…', diff: actual.join('\n') }),
      ].join('\n'));
    }
    if (gone.length > 0) failures.push([`${f.fn}: ${gone.length} declared hunk(s) no longer in the diff (remove them from fidelity.json):`, ...gone].join('\n'));
  }
  for (const t of spec.tables) {
    const proto = t.prototype ?? spec.prototype;
    try {
      const want = protoValue(proto, t.ident, t.deps);
      const mod = (await import(/* @vite-ignore */ join(ROOT, t.module))) as Record<string, unknown>;
      if (!(t.export in mod)) throw new Error(`${t.module} exports no "${t.export}"`);
      let got = mod[t.export];
      if (t.additions && typeof got === 'object' && got !== null) {
        for (const [k, reason] of Object.entries(t.additions)) {
          if (reason.trim() === '') failures.push(`the addition ${t.export}.${k} has no reason`);
          if (!(k in (got as Record<string, unknown>))) failures.push(`the addition ${t.export}.${k} is declared but not in the port`);
          if (typeof want === 'object' && want !== null && k in (want as Record<string, unknown>)) failures.push(`the addition ${t.export}.${k} is a key of the prototype's ${t.ident} too: a changed row is a difference, not an addition`);
        }
        got = Object.fromEntries(Object.entries(got as Record<string, unknown>).filter(([k]) => !(k in t.additions!)));
      }
      const fns = [...functionsIn(want, t.ident), ...functionsIn(got, t.export)];
      if (fns.length > 0) {
        failures.push(`the table ${t.ident} (${proto}.html → ${t.module}) holds functions (${fns.slice(0, 4).join(', ')}${fns.length > 4 ? ', …' : ''}): a table is compared by value, so list it under \`functions\` instead (its whole declaration is compared, as SHAPES is)`);
        continue;
      }
      const where = firstDifference(want, got, t.ident);
      if (where !== null) {
        failures.push(`the table ${t.ident} (${proto}.html) is not equal to ${t.export} of ${t.module} (first at ${where}):\n  prototype: ${show(want)}\n  port:      ${show(got)}`);
      }
    } catch (err) {
      failures.push(`the table ${t.ident} (${proto}.html → ${t.module}): ${(err as Error).message}`);
    }
  }
  for (const l of spec.lines ?? []) {
    const proto = l.prototype ?? spec.prototype;
    let table: unknown;
    try {
      table = protoValue(proto, l.ident);
    } catch (err) {
      failures.push(`the lines ${l.ident} (${proto}.html): ${(err as Error).message}`);
      continue;
    }
    for (const [path, target] of Object.entries(l.cueKinds)) {
      const want = formatLines(path === '.' ? table : atPath(table, path), l.format);
      let got: unknown;
      if ((l.registry ?? 'physicsCues') === 'cardVoice') {
        const [kind, style] = target.split('@');
        const rows = [...opts.registries.cardVoice.values()].filter((e) => e.kind === kind && e.style === style);
        got = rows.length === 1 ? rows[0]!.lines : rows.length === 0 ? undefined : `${rows.length} rows of kind ${target}`;
      } else {
        const rows = [...opts.registries.physicsCues.values()].filter((e) => e.kind === target && (l.physics === undefined || ((e.physics ?? []) as string[]).includes(l.physics)));
        got = rows.length === 1 ? rows[0]!.lines : rows.length === 0 ? undefined : `${rows.length} rows of kind ${target}`;
      }
      const declared = spec.differences.find((d) => d.fn === `${l.ident}.${path}`);
      if (declared) {
        if (isDeepStrictEqual(want, got)) failures.push(`${l.ident}.${path}: a difference is declared, but the row equals the prototype`);
        else if (declared.diff !== JSON.stringify(got)) failures.push(`${l.ident}.${path}: the declared row ${declared.diff} is not the port's ${JSON.stringify(got)}`);
        continue;
      }
      if (!isDeepStrictEqual(want, got)) failures.push(`${l.ident}.${path} (${proto}.html) is not the ${l.registry ?? 'physicsCues'} row ${target}:\n  prototype: ${JSON.stringify(want)}\n  port:      ${JSON.stringify(got)}`);
    }
  }
  return failures;
}
