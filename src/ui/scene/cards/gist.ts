/**
 * P10e-e Task 8: the gist of a collapsed card, `gistOf` of `docs/prototypes/cards.html` (its `fidelity.json` checks it token for token): the engine's
 * short name and the most urgent condition (never a sealed summary). The value in her accent is marked `<b>…</b>`; the dock draws the marks
 * as elements and every other part as text (`gistRuns`), so nothing of it is ever parsed as markup. The one difference: the deadline is the
 * card's own (`c.when`, from `cardWhen`), not the prototype's panel (`S.when`).
 */

/** What a draw function knows of its card, in the prototype's shape (cards.html `KINDS`). */
export interface GistCard {
  kind: 'task' | 'sealed' | 'punishment' | 'order' | 'ceremony' | 'demonstration' | 'claim' | 'physics' | string;
  summary?: string;
  /** `button` for a task answered by a button (with or without its cost), as the prototype's tasks. */
  form?: string;
  hold?: boolean;
  /** The card's deadline words (`cardWhen`). */
  when?: string | null;
  label?: string;
  weight?: string;
  soldier?: string;
  steps?: Array<[string, string, ...unknown[]]>;
  done?: number;
  place?: string;
  slot?: string;
  domain?: string;
  gist?: string;
}

export function gistOf(c: GistCard): string | undefined {
  switch (c.kind) {
    case 'task': return c.hold ? `${c.summary}` : `${c.summary}${c.form === 'button' && c.when ? ` · <b>${c.when}</b>` : ''}`;
    case 'sealed': return '✉';
    case 'punishment': return `${c.label!.toLowerCase()} · <b>${c.weight}</b>`;
    case 'order': return `${c.soldier}: ${c.label!.toLowerCase()}`;
    case 'ceremony': return `${c.label!.toLowerCase()} · next: ${c.steps![c.done!]?.[1].toLowerCase() ?? 'done'}`;
    case 'demonstration': return `${c.place!.toLowerCase()} · <b>${c.slot}</b>`;
    case 'claim': return c.domain;
    case 'physics': return c.label;
    default: return c.gist ?? '';
  }
}

/** A gist as runs: the parts between `<b>` and `</b>` are values (her accent), the rest plain; nothing is parsed as markup. */
export function gistRuns(gist: string): Array<{ text: string; value?: true }> {
  const runs: Array<{ text: string; value?: true }> = [];
  let at = 0;
  for (const m of gist.matchAll(/<b>([\s\S]*?)<\/b>/g)) {
    if (m.index > at) runs.push({ text: gist.slice(at, m.index) });
    runs.push({ text: m[1]!, value: true });
    at = m.index + m[0].length;
  }
  if (at < gist.length) runs.push({ text: gist.slice(at) });
  return runs;
}
