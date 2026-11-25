import type { CARD_VOICE_KINDS } from '../../../content/schemas';
import type { Entry, Registries } from '../../../content/types';
import { fnv1a } from '../../../engine/hub';

/**
 * P10e-e (R7): her voice on the scene's cards as data. The lines live in the `cardVoice` registry (`docs/content/card-voice.md` is the
 * readable copy); this is the `linesOf` / `pick` / `fill` of `docs/prototypes/cards.html`, read by kind and style, never by id.
 */

/** A kind of her card lines: the fixed ones (`CARD_VOICE_KINDS`, which a later kind joins) and her static words of card-voice.md §3. */
export type VoiceKind =
  | (typeof CARD_VOICE_KINDS)[number]
  | `static.milestone.${string}`
  | `static.claim.${string}`
  | `static.return.${string}`;

/** A run of a filled line: her frame, or the engine's value (`value: true`, drawn in her stronger ink). */
export interface VoiceRun { text: string; value?: true }

/** The rows by `kind|style` (`kind|` for the neutral ones), built once per registry map. */
const INDEX = new WeakMap<Map<string, Entry>, Map<string, readonly string[]>>();
function indexOf(rows: Map<string, Entry>): Map<string, readonly string[]> {
  let idx = INDEX.get(rows);
  if (idx === undefined) {
    idx = new Map();
    for (const e of rows.values()) {
      const key = `${String(e.kind)}|${typeof e.style === 'string' ? e.style : ''}`;
      if (!idx.has(key)) idx.set(key, (e.lines as string[] | undefined) ?? []);
    }
    INDEX.set(rows, idx);
  }
  return idx;
}

/** One of the lines: her style's when it has the kind, else the neutral ones (cards.html `linesOf`). A kind with no rows has none. */
function linesOf(reg: Registries, kind: VoiceKind, style: string | undefined): readonly string[] {
  const idx = indexOf(reg.cardVoice);
  return (style !== undefined ? idx.get(`${kind}|${style}`) : undefined) ?? idx.get(`${kind}|`) ?? [];
}

const cap = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** Fills a frame (cards.html `fill`): `{x}` is the value as it is, `{X}` capitalised (it opens a sentence); each value is a run of its own. A value not given stays as written. */
function fill(frame: string, vals: Record<string, string>): VoiceRun[] {
  const runs: VoiceRun[] = [];
  const plain = (t: string): void => {
    if (t === '') return;
    const last = runs[runs.length - 1];
    if (last !== undefined && last.value === undefined) last.text += t;
    else runs.push({ text: t });
  };
  let at = 0;
  for (const m of frame.matchAll(/\{(\w+)\}/g)) {
    const k = m[1]!;
    plain(frame.slice(at, m.index));
    at = m.index + m[0].length;
    const v = vals[k.toLowerCase()];
    if (v === undefined) plain(`{${k}}`);
    else runs.push({ text: k[0] === k[0]!.toUpperCase() ? cap(v) : v, value: true });
  }
  plain(frame.slice(at));
  return runs;
}

/**
 * Her line of a kind on a card, filled with the engine's values (cards.html `pick` + `fill`): her style's own lines when the registry has
 * `{ kind, style }`, else the neutral `{ kind }`; the line is `fnv1a(key|style|kind) % n` (no rng: one card always says the same, `style`
 * `neutral` when she has none). A kind with no rows yet (the slap's before Task 11) gives no runs.
 */
export function voiceLine(reg: Registries, kind: VoiceKind, style: string | undefined, key: string, vals: Record<string, string>): VoiceRun[] {
  const list = linesOf(reg, kind, style);
  if (list.length === 0) return [];
  return fill(list[fnv1a(`${key}|${style ?? 'neutral'}|${kind}`) % list.length]!, vals);
}
