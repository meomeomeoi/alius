import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

function tsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? tsFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}

/**
 * Bracket texts in UI strings that are not action labels, so they keep their tight brackets: the close glyph `[X]` (and the
 * `[X]` tick of a checkbox line), the back glyph `[<]`, keyboard hints (`[TAB]`, `[G] GUARD`, `[1] SKILL`, `[Q] ORDER`), the
 * console prefix `[Alius]`, status and notation marks (`[BREAKDOWN]`, `[INJURED]`, combat tags, item rarity, defect category, mission source,
 * the real name after a contact alias, the numbered unit lines of the setup summary).
 */
const NOT_A_LABEL = new Set([
  'X', '<', 'TAB', 'Alius', 'BREAKDOWN', 'INJURED',
  '${t.text}', '${d.item.rarity}', '${String(r.rarity)}', '${String(e.rarity)}', '${inst.rarity}', '${i.rarity}',
  '${SOURCE_TAG(m.source) ?? m.source.toUpperCase()}', '${SOURCE_LABEL(o.source)}', // where a mission or objective comes from
  '${String(d.category)}', '${String(def.category)}', '${unit.displayName.toUpperCase()}',
  '${n + 1}', '${i + 1}', "${'QWERTY'(i)}",
]);

/** Every string and template literal of a file, substitutions kept as `${expr}` with the expression's own brackets turned into parentheses. */
function literals(file: string): Array<{ line: number; text: string }> {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const out: Array<{ line: number; text: string }> = [];
  const visit = (n: ts.Node): void => {
    const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push({ line, text: n.text });
    if (ts.isTemplateExpression(n)) {
      const expr = (e: ts.Expression): string => e.getText(sf).replace(/\[/g, '(').replace(/\]/g, ')');
      out.push({ line, text: n.head.text + n.templateSpans.map((s) => `\${${expr(s.expression)}}${s.literal.text}`).join('') });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe('UI text style', () => {
  it('rule 18: a bracketed action label has inner spaces, [ LABEL ], never [LABEL]', () => {
    const bad: string[] = [];
    for (const file of [...tsFiles('src/ui'), 'src/app.ts']) {
      for (const { line, text } of literals(file)) {
        for (const m of text.matchAll(/(?<!\[)\[(?!\[)([^[\]\n]*)\](?!\])/g)) {
          const inner = m[1];
          if (!/[A-Z]|\$\{/.test(inner)) continue; // array indexing, lowercase notation, `[ ]`
          if (inner.startsWith(' ') && inner.endsWith(' ')) continue;
          if (inner.length === 1 || NOT_A_LABEL.has(inner)) continue;
          if (/[=\\]/.test(inner)) continue; // a CSS attribute selector or a regex class
          bad.push(`${file}:${line} [${inner}]`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('rule 19: dilemma option labels are in sentence case, not all caps', () => {
    const ACRONYMS = new Set(['CCP', 'PDA', 'PLYX']);
    const templates = JSON.parse(readFileSync('content/core/dilemmaTemplates.json', 'utf8')) as Array<Record<string, unknown>>;
    const labels: Array<{ at: string; label: string }> = [];
    const walk = (o: unknown, at: string): void => {
      if (Array.isArray(o)) o.forEach((x, i) => walk(x, `${at}[${i}]`));
      else if (o !== null && typeof o === 'object') {
        for (const [k, v] of Object.entries(o)) {
          if (k === 'options' && Array.isArray(v)) {
            v.forEach((opt: { label?: unknown }, i) => { if (typeof opt.label === 'string') labels.push({ at: `${at}.options[${i}]`, label: opt.label }); });
          }
          walk(v, `${at}.${k}`);
        }
      }
    };
    templates.forEach((t) => walk(t, String(t.id)));
    expect(labels.length).toBeGreaterThan(20);
    const bad = labels.filter(({ label }) => {
      const text = label.replace(/^AUTHOR TO WRITE: /, '');
      const caps = (text.match(/\b[A-Z]{2,}\b/g) ?? []).filter((w) => !ACRONYMS.has(w));
      return caps.length > 0 || !/^[A-Z]/.test(text);
    });
    expect(bad).toEqual([]);
  });
});
