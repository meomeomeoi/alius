/**
 * P10e: a reply as it was written. Nothing is split into "action" and "speech" lines and nothing is removed:
 *  - text in double quotes (straight or curly) is speech;
 *  - `*asterisks*` (and `**double**`) are emphasis (the asterisks are not shown);
 *  - everything else is prose.
 * A mark with no partner is plain text from the mark to the end of its line (never an error, never an eaten character).
 * Pure: no DOM here but in `fillProse`, which only ever sets text (the model's words never become markup).
 */
import { h } from '../../dom';

export type ProseKind = 'prose' | 'speech' | 'em';
export interface ProseRun {
  kind: ProseKind;
  text: string;
  /** An emphasis inside a quoted speech keeps the speech colour. */
  speech?: true;
}

const CLOSER: Record<string, string> = { '"': '"', '“': '”' };

/** The index of the next `mark` after `from` on the same line, or -1. */
function closeOnLine(text: string, from: number, mark: string): number {
  for (let i = from + 1; i < text.length; i++) {
    if (text[i] === '\n') return -1;
    if (text[i] === mark) return i;
  }
  return -1;
}

/** The index of the `**` that closes a `**bold**` opened at `from` on the same line (with something between), or -1: models write bold often, it reads as emphasis. */
function boldEnd(text: string, from: number): number {
  if (text[from + 1] !== '*') return -1;
  const end = text.indexOf('**', from + 3);
  if (end < 0 || text.slice(from + 2, end).includes('\n')) return -1;
  return end;
}

/** A speech region cut at its balanced `*…*` pairs (the first run keeps the opening quote, the last the closing one). */
function speechRuns(region: string): ProseRun[] {
  const out: ProseRun[] = [];
  let cur = '';
  let j = 0;
  while (j < region.length) {
    if (region[j] === '*') {
      const bold = boldEnd(region, j);
      if (bold > 0) {
        if (cur) out.push({ kind: 'speech', text: cur });
        cur = '';
        out.push({ kind: 'em', text: region.slice(j + 2, bold), speech: true });
        j = bold + 2;
        continue;
      }
      const e = region.indexOf('*', j + 1);
      if (e > j + 1) {
        if (cur) out.push({ kind: 'speech', text: cur });
        cur = '';
        out.push({ kind: 'em', text: region.slice(j + 1, e), speech: true });
        j = e + 1;
        continue;
      }
    }
    cur += region[j];
    j++;
  }
  if (cur) out.push({ kind: 'speech', text: cur });
  return out;
}

export function proseRuns(text: string): ProseRun[] {
  const out: ProseRun[] = [];
  let buf = '';
  const flush = (): void => {
    if (buf) out.push({ kind: 'prose', text: buf });
    buf = '';
  };
  /** A mark with no partner: the rest of its line is plain text. */
  const plainRest = (i: number): number => {
    flush();
    const nl = text.indexOf('\n', i);
    const end = nl < 0 ? text.length : nl;
    out.push({ kind: 'prose', text: text.slice(i, end) });
    return end;
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '*') {
      const bold = boldEnd(text, i);
      if (bold > 0) {
        flush();
        out.push({ kind: 'em', text: text.slice(i + 2, bold) });
        i = bold + 2;
        continue;
      }
      const end = closeOnLine(text, i, '*');
      if (end < 0) i = plainRest(i);
      else if (end === i + 1) { buf += '**'; i += 2; } // an empty pair is nothing to emphasise
      else {
        flush();
        out.push({ kind: 'em', text: text.slice(i + 1, end) });
        i = end + 1;
      }
      continue;
    }
    const closer = CLOSER[c];
    if (closer !== undefined) {
      const end = closeOnLine(text, i, closer);
      if (end < 0) i = plainRest(i);
      else if (end === i + 1) { buf += c + closer; i += 2; }
      else {
        flush();
        out.push(...speechRuns(text.slice(i, end + 1)));
        i = end + 1;
      }
      continue;
    }
    buf += c;
    i++;
  }
  flush();
  return out;
}

/** How many characters of `text` show once the marks are read (what the typing reveal counts). */
export const proseLength = (text: string): number => proseRuns(text).reduce((n, r) => n + r.text.length, 0);

/**
 * Fills `el` with the first `visible` characters of the runs. Speech takes `speechClass` (default `alius-speech`), emphasis is
 * `<em class="alius-glitch">`, and the runs from index `newestFrom` on carry `alius-prose-new` (the streaming highlight).
 */
export function fillProse(el: HTMLElement, text: string, visible: number, opts: { speechClass?: string; newestFrom?: number } = {}): void {
  const speechClass = opts.speechClass ?? 'alius-speech';
  el.replaceChildren();
  let left = visible;
  proseRuns(text).forEach((run, index) => {
    if (left <= 0) return;
    const part = run.text.slice(0, left);
    left -= part.length;
    const fresh = opts.newestFrom !== undefined && index >= opts.newestFrom;
    const cls = (...c: Array<string | false | undefined>): string => c.filter(Boolean).join(' ');
    let node: Node;
    if (run.kind === 'em') node = h('em', { class: cls('alius-glitch', run.speech === true && speechClass, fresh && 'alius-prose-new') });
    else if (run.kind === 'speech') node = h('span', { class: cls(speechClass, fresh && 'alius-prose-new') });
    else if (fresh) node = h('span', { class: 'alius-prose-new' });
    else {
      el.append(document.createTextNode(part));
      return;
    }
    node.textContent = part;
    el.append(node);
  });
}

/**
 * The run the newest sentence of the first `visible` characters starts in (the streaming highlight marks from it on).
 * A sentence ends at `.`, `!`, `?` or `…` (with a closing quote) followed by a space; an empty text answers 0.
 */
export function sentenceRunIndex(text: string, visible: number): number {
  const runs = proseRuns(text);
  const shown = runs.map((r) => r.text).join('').slice(0, Math.max(0, visible));
  let start = 0;
  for (const m of shown.matchAll(/[.!?…]["”’']?\s+(?=\S)/g)) start = m.index! + m[0].length;
  let acc = 0;
  for (let i = 0; i < runs.length; i++) {
    if (start < acc + runs[i].text.length) return i;
    acc += runs[i].text.length;
  }
  return Math.max(0, runs.length - 1);
}
