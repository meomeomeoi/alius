import { fnv1a } from '../../engine/hub';
import { h, type Child } from '../dom';
import { noise } from '../fx';
import type { Voice } from './sources';

export interface VoiceCardOpts {
  voice: Voice;
  title?: string;
  /** A small line under the title: a date, a file number. */
  meta?: string;
  from?: string;
  body: Node | string;
  /** The unit's accent (personal voice). */
  accent?: string;
  /** A rotated stamp over the card (`APPROVED`, `FILED`). */
  stamp?: string;
  /** Character ranges `[start, end)` of a string body shown as redaction bars; the text behind them is not in the DOM. */
  redact?: Array<[number, number]>;
  /** Heading level of the title (default 2). */
  level?: 2 | 3;
}

/** Six accents, each readable (>= 4.5:1) on the personal voice's bubble and thread background. */
export const UNIT_ACCENTS = ['#ff9ec7', '#ffb86b', '#8fd6ff', '#b6e88a', '#d0a8ff', '#7ee7d0'] as const;

/** A unit's accent: a fixed function of her id (P10b may make it data). */
export const unitAccent = (unitId: string): string => UNIT_ACCENTS[fnv1a(unitId) % UNIT_ACCENTS.length];

/** The body with the redacted ranges replaced by bars: sorted, clamped, overlapping and empty ranges skipped. */
function redacted(text: string, ranges: Array<[number, number]>): Child[] {
  const parts: Child[] = [];
  let cursor = 0;
  for (const [from, to] of [...ranges].sort((a, b) => a[0] - b[0])) {
    const start = Math.max(0, from);
    const end = Math.min(text.length, to);
    if (end <= start || start < cursor) continue;
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(h('span', { class: 'alius-redact', 'aria-label': 'redacted' }, '█'.repeat(end - start)));
    cursor = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

/**
 * One way of showing a source's text: terminal (the palette), corporate (cold, glossy), paper (a file, with stamps and
 * redaction) or personal (a messenger bubble). Everything goes in as text.
 */
export function renderVoiceCard(o: VoiceCardOpts): HTMLElement {
  const head = o.title || o.meta || o.from
    ? h('header', { class: 'alius-voice-head' },
      o.title ? h(o.level === 3 ? 'h3' : 'h2', { class: 'alius-voice-title' }, o.title) : null,
      o.from ? h('span', { class: 'alius-voice-from' }, o.from) : null,
      o.meta ? h('span', { class: 'alius-voice-meta' }, o.meta) : null)
    : null;
  const body = h('div', { class: 'alius-voice-body' });
  if (typeof o.body === 'string') body.append(...(o.redact?.length ? redacted(o.body, o.redact) : [o.body]).filter((c): c is string | Node => c !== null && c !== undefined));
  else body.append(o.body);
  const card = h(
    'article',
    { class: `alius-voice alius-voice-${o.voice}`, 'data-voice': o.voice },
    o.voice === 'paper' ? noise('alius-fibre', { frequency: '0.04 0.9', octaves: 2, seed: 3 }) : null,
    head, body,
    o.stamp ? h('span', { class: 'alius-stamp' }, o.stamp) : null,
  );
  if (o.accent) card.style.setProperty('--voice-accent', o.accent);
  return card;
}

/** One message of a thread in the personal voice: hers on the left, the commander's on the right. */
export function renderBubble(text: string, mine: boolean, accent: string): HTMLElement {
  const bubble = h(
    'div',
    { class: `alius-bubble alius-voice alius-voice-personal ${mine ? 'is-mine' : 'is-hers'}`, 'data-voice': 'personal' },
    h('span', { class: 'alius-msg-text' }, text),
  );
  bubble.style.setProperty('--bubble-accent', accent);
  return bubble;
}
