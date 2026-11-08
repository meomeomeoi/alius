const THINK_TAGS = 'think|thinking|reasoning';

/** Removes closed thinking blocks. An unclosed block means the model never answered: returns ''. */
export function stripThinking(s: string): string {
  const closed = new RegExp(`<(${THINK_TAGS})\\b[^>]*>[\\s\\S]*?</\\1\\s*>`, 'gi');
  const out = s.replace(closed, '');
  if (new RegExp(`<(${THINK_TAGS})\\b[^>]*>`, 'i').test(out)) return '';
  return out.trim();
}

const THINKING_PART_TYPES = new Set(['thinking', 'redacted_thinking', 'reasoning']);

function extract(data: unknown): string {
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) {
    return data
      .map((p) => {
        if (typeof p === 'string') return p;
        if (typeof p !== 'object' || p === null) return '';
        const part = p as Record<string, unknown>;
        if (typeof part.type === 'string' && THINKING_PART_TYPES.has(part.type)) return '';
        return typeof part.text === 'string' ? part.text : typeof part.content === 'string' ? part.content : '';
      })
      .join('');
  }
  if (typeof data !== 'object' || data === null) return '';
  const o = data as Record<string, unknown>;
  if (Array.isArray(o.choices) && o.choices.length > 0) {
    const c = o.choices[0] as Record<string, unknown> | null;
    const msg = c?.message as Record<string, unknown> | undefined;
    return extract(msg?.content ?? c?.text);
  }
  if (o.content !== undefined) return extract(o.content);
  if (o.message !== undefined) return extract(o.message);
  if (typeof o.text === 'string') return o.text;
  return '';
}

/** Plain answer text from whatever shape the provider returned, without thinking blocks. */
export function answerText(data: unknown): string {
  return stripThinking(extract(data));
}

type Scan =
  | { kind: 'balanced'; end: number }
  | { kind: 'cut'; safeEnd: number; open: string[] };

/**
 * String-aware scan from an opening bracket. Either finds the matching close, or the input
 * is cut: then it reports where the last complete value ended and which containers were open.
 */
function scan(text: string, start: number): Scan {
  const n = text.length;
  const stack: Array<{ t: string; key: boolean }> = [];
  let safeEnd = -1;
  let open: string[] = [];
  const mark = (end: number) => {
    safeEnd = end;
    open = stack.map((c) => c.t);
  };
  let i = start;
  while (i < n) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      if (j >= n) break; // cut inside a string
      const top = stack[stack.length - 1];
      if (!(top && top.t === '{' && top.key)) mark(j + 1); // a key alone is not a value
      i = j + 1;
    } else if (c === '{' || c === '[') {
      stack.push({ t: c, key: c === '{' });
      i++;
    } else if (c === '}' || c === ']') {
      stack.pop();
      if (stack.length === 0) return { kind: 'balanced', end: i };
      mark(i + 1);
      i++;
    } else if (c === ':') {
      if (stack.length) stack[stack.length - 1].key = false;
      i++;
    } else if (c === ',') {
      const top = stack[stack.length - 1];
      if (top && top.t === '{') top.key = true;
      i++;
    } else if (/\s/.test(c)) {
      i++;
    } else {
      // number / true / false / null: complete only if something follows it
      let j = i;
      while (j < n && !/[\s,\]}:"{[]/.test(text[j])) j++;
      if (j >= n) break;
      mark(j);
      i = j;
    }
  }
  return { kind: 'cut', safeEnd, open };
}

/**
 * Parses JSON out of model output: tolerates prose and code fences around it and recovers the
 * complete part of an answer that was cut off (token limit, thinking). Null if nothing usable.
 */
export function looseJson(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
  const src = fenced ? fenced[1] : text;
  let pos = 0;
  for (;;) {
    const rel = src.slice(pos).search(/[{[]/);
    if (rel < 0) return null;
    const start = pos + rel;
    const r = scan(src, start);
    if (r.kind === 'balanced') {
      try {
        return JSON.parse(src.slice(start, r.end + 1));
      } catch {
        pos = r.end + 1;
        continue;
      }
    }
    if (r.safeEnd < 0) return null;
    const closers = [...r.open].reverse().map((t) => (t === '{' ? '}' : ']')).join('');
    try {
      return JSON.parse(src.slice(start, r.safeEnd) + closers);
    } catch {
      return null;
    }
  }
}

export function estTokens(s: string): number {
  return Math.ceil(s.length / 3.6);
}
