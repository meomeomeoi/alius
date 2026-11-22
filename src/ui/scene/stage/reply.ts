/**
 * P10e §3: the reply as prose subtitles. The last reply is shown whole at the bottom, with no frame: in a group, every reply
 * since the commander's last message, each under its speaker's name, oldest first; the commander's message above them as one
 * dim line. Prose as written (see `prose.ts`): speech in the speaker's accent, `*actions*` italic, nothing dropped. A reply that
 * does not fit in `maxLines` shows its last lines under a fade with a "more above" mark (the curtain is behind it).
 * Everything goes in as text; the model's words never become markup.
 */
import type { ChatMessage } from '../../../st/adapter';
import { analyzeNative } from '../../analyze/mark';
import { h } from '../../dom';
import { fillProse } from './prose';

export const REPLY_MAX_LINES = 8;

export interface ReplyEntry {
  index: number;
  name: string;
  avatar?: string;
  text: string;
}
export interface ReplyView {
  /** The commander's message the replies answer (null when there is none). */
  echo: string | null;
  replies: ReplyEntry[];
}

/**
 * The replies since the commander's last message and that message as the echo. While the commander waits (the last message is
 * theirs) only the echo shows: the answer has not come, and the earlier round is in the history.
 */
export function replyView(messages: ChatMessage[]): ReplyView {
  let lastUser = -1;
  messages.forEach((m, i) => {
    if (m.isUser) lastUser = i;
  });
  const replies = messages.slice(lastUser + 1).filter((m) => !m.isUser).map((m) => ({ index: m.index, name: m.name, ...(m.avatar !== undefined ? { avatar: m.avatar } : {}), text: m.text }));
  return { echo: lastUser >= 0 ? messages[lastUser].text : null, replies };
}

export interface ReplyOpts {
  maxLines: number;
  /** How many visible characters of this reply show (Infinity: all). */
  visibleOf(index: number): number;
  /** The run the streaming highlight starts at (undefined: no highlight). */
  newestFrom(index: number): number | undefined;
  /** The speaker's accent colour, or null for the palette's. */
  accentOf(reply: { name: string; avatar?: string }): string | null;
  /** Draws the violation marker (P9d) on a line. */
  flag?(line: HTMLElement, index: number): void;
  /** The "more above" mark: opens the history. */
  onMore(): void;
}

/** Measures the block after a (re)draw or a typing tick: a reply too long for its lines scrolls to its end and shows the mark. */
export function measureReply(host: HTMLElement, onMore?: () => void): void {
  const block = host.querySelector<HTMLElement>('.alius-reply');
  const body = host.querySelector<HTMLElement>('.alius-reply-body');
  if (!block || !body) return;
  const over = body.scrollHeight > body.clientHeight + 1;
  if (over) {
    block.dataset.overflow = 'true';
    body.scrollTop = body.scrollHeight;
    if (!block.querySelector('[data-more]')) {
      const handler = onMore ?? (moreHandlers.get(block) ?? (() => {}));
      block.prepend(h('button', { type: 'button', class: 'alius-reply-more', 'data-more': '', 'aria-label': 'Open the history: more above', ...analyzeNative('glossary:reply_more'), onclick: handler }, '▲ more above'));
    }
  } else {
    delete block.dataset.overflow;
    block.querySelector('[data-more]')?.remove();
  }
}
const moreHandlers = new WeakMap<HTMLElement, () => void>();

export function renderReply(host: HTMLElement, view: ReplyView, opts: ReplyOpts): void {
  if (view.echo === null && view.replies.length === 0) {
    host.replaceChildren();
    return;
  }
  const body = h('div', { class: 'alius-reply-body' });
  body.style.setProperty('--alius-reply-lines', String(opts.maxLines));
  for (const r of view.replies) {
    const name = h('span', { class: 'alius-reply-name' });
    name.textContent = r.name.toUpperCase();
    const text = h('span', { class: 'alius-reply-text' });
    fillProse(text, r.text, opts.visibleOf(r.index), { speechClass: 'alius-speech', ...(opts.newestFrom(r.index) !== undefined ? { newestFrom: opts.newestFrom(r.index)! } : {}) });
    const line = h('div', { class: 'alius-line alius-reply-line', 'data-index': r.index }, name, text);
    const accent = opts.accentOf(r);
    if (accent) line.style.setProperty('--alius-accent', accent);
    opts.flag?.(line, r.index);
    body.append(line);
  }
  const block = h('div', { class: 'alius-reply' });
  moreHandlers.set(block, opts.onMore);
  if (view.echo !== null) {
    const echo = h('div', { class: 'alius-reply-echo', 'aria-label': 'Your last message' });
    echo.textContent = view.echo;
    block.append(echo);
  }
  block.append(body);
  host.replaceChildren(block);
  measureReply(host, opts.onMore);
}
