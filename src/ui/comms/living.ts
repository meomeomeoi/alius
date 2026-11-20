import type { Registries } from '../../content/types';
import type { DmBehaviourKind } from '../../content/schemas';
import { receiptOf } from '../../engine/dmBehaviours';
import { fnv1a } from '../../engine/hub';
import type { CampaignState, DmMessage } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { renderBubble } from '../voice/voiceCard';

/**
 * The living thread (P10b §2): what a stamped message looks like (a deleted line before it, a burst of bubbles, a voice
 * message, a LATE mark), the receipt under the commander's last message and the typing indicator. Behaviours are read from the
 * message's own stamp by `kind`, never from the state now, so an old bubble never changes. Text is only ever `textContent`.
 */

/** How long she "types" before the indicator says she stopped. */
export const TYPING_MS = 2500;
const SVG_NS = 'http://www.w3.org/2000/svg';

export const stampText = (day: number, slot: string): string => `DAY ${String(day).padStart(3, '0')} // ${slot.toUpperCase()}`;

/** The kinds a message was stamped with (an entry a pack no longer carries is ignored). */
export function kindsOf(reg: Registries, msg: Pick<DmMessage, 'behaviours'>): Set<DmBehaviourKind> {
  return new Set((msg.behaviours ?? []).flatMap((id) => {
    const kind = reg.dmBehaviours.get(id)?.kind;
    return kind === undefined ? [] : [kind as DmBehaviourKind];
  }));
}

/** 2–3 parts of a text at `. ! ?` boundaries (the double or triple text); one part when there is nothing to split. More than three sentences: the first two, then the rest. */
export function splitBurst(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g)?.map((x) => x.trim()).filter((x) => x !== '') ?? [];
  if (sentences.length <= 1) return [text];
  if (sentences.length <= 3) return sentences;
  return [sentences[0], sentences[1], sentences.slice(2).join(' ')];
}

const chip = (text: string, address: string, extra: Record<string, unknown> = {}): HTMLElement => h('span', { class: 'alius-chip', ...analyzeAttrs(address), ...extra }, text);

function meta(msg: DmMessage, kinds: Set<DmBehaviourKind>): HTMLElement {
  return h(
    'span', { class: 'alius-msg-meta' },
    `${stampText(msg.day, msg.slot)}${msg.initiated ? ' · SHE WROTE FIRST' : ''}`,
    kinds.has('late') ? chip(' · LATE', 'glossary:dm_behaviour', { 'data-behaviour': 'late' }) : null,
  );
}

/** A waveform of bars, a pure function of the message id (it says nothing about the words). */
function waveform(id: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 16');
  svg.setAttribute('class', 'alius-wave');
  svg.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 16; i++) {
    const height = 3 + (fnv1a(`${id}|${i}`) % 11);
    const bar = document.createElementNS(SVG_NS, 'rect');
    bar.setAttribute('x', String(i * 4));
    bar.setAttribute('y', String((16 - height) / 2));
    bar.setAttribute('width', '2');
    bar.setAttribute('height', String(height));
    bar.setAttribute('fill', 'currentColor');
    svg.append(bar);
  }
  return svg;
}

export interface HerMessageOpts {
  /** The voice messages played in this render host (UI-local; kept until the host is built anew). */
  revealed: Set<string>;
  onReveal(id: string): void;
  accent: string;
}

/**
 * One message of hers as the elements the thread shows, in order: a "message deleted" placeholder when she deleted one just
 * before it (not a stored message: not unread, not in the history), then her bubble, a burst of two or three, or a voice message.
 */
export function renderHerMessage(_state: CampaignState, reg: Registries, _unitId: string, msg: DmMessage, opts: HerMessageOpts): HTMLElement[] {
  const kinds = kindsOf(reg, msg);
  const out: HTMLElement[] = [];
  const bubble = (text: string, withMeta: boolean): HTMLElement => {
    const b = renderBubble(text, false, opts.accent);
    b.classList.add('alius-msg', 'is-unit');
    if (withMeta) b.prepend(meta(msg, kinds));
    return b;
  };
  if (kinds.has('deleted')) {
    const ghost = h('div', { class: 'alius-msg alius-msg-deleted is-unit' }, chip('MESSAGE DELETED', 'glossary:dm_behaviour', { 'data-behaviour': 'deleted' }));
    ghost.style.setProperty('--bubble-accent', opts.accent);
    out.push(ghost);
  }
  if (kinds.has('voice') && !opts.revealed.has(msg.id)) {
    const voice = h(
      'div', { class: 'alius-msg alius-voicemsg is-unit', 'data-voice-message': msg.id },
      meta(msg, kinds), 'VOICE MESSAGE ', waveform(msg.id), ' ',
      h('button', { type: 'button', class: 'alius-btn alius-option', 'data-play': msg.id, ...analyzeNative('glossary:voice_message'), onclick: () => opts.onReveal(msg.id) }, '[ PLAY ]'),
    );
    voice.style.setProperty('--bubble-accent', opts.accent);
    out.push(voice);
  } else if (kinds.has('burst')) {
    const parts = splitBurst(msg.text);
    parts.forEach((part, i) => {
      const b = bubble(part, i === 0);
      if (parts.length > 1) b.setAttribute('data-behaviour', 'burst');
      out.push(b);
    });
  } else {
    out.push(bubble(msg.text, true));
  }
  return out;
}

/** The receipt under a commander message (derived, in slots: the game has no clock). `null` for her own messages. */
export function renderReceipt(state: CampaignState, unitId: string, msg: DmMessage): HTMLElement | null {
  if (msg.from !== 'commander') return null;
  const r = receiptOf(state, unitId, msg);
  const ago = (n: number): string => `${n} SLOT${n === 1 ? '' : 'S'} AGO`;
  const text = r.status === 'delivered' ? 'DELIVERED' : r.status === 'left_on_read' ? 'SEEN · NO REPLY' : r.slotsAgo ? `READ · ${ago(r.slotsAgo)}` : 'READ';
  return h('span', { class: 'alius-chip alius-receipt', 'data-receipt': r.status, ...analyzeAttrs('glossary:read_receipt', { unitId }) }, text);
}

/**
 * She started to answer and stopped. With motion: `typing…` for `TYPING_MS`, then `stopped typing` (`armTyping` runs the timer);
 * without motion (or once it has played): the static line.
 */
export function renderTyping(motion: boolean): HTMLElement {
  if (!motion) return h('p', { class: 'alius-typing alius-chip', 'data-state': 'stopped', ...analyzeAttrs('glossary:dm_behaviour') }, 'She started typing and stopped.');
  return h(
    'p', { class: 'alius-typing alius-chip', 'data-state': 'typing', ...analyzeAttrs('glossary:dm_behaviour') },
    'typing', h('span', { class: 'alius-dots', 'aria-hidden': 'true' }, h('span', {}, '.'), h('span', {}, '.'), h('span', {}, '.')),
  );
}

/** One pending typing timer per render host: a redraw clears it. */
const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
/** The message whose hesitation has played in a host: a redraw shows it stopped at once instead of typing again. */
const played = new WeakMap<HTMLElement, string>();
export function clearTyping(host: HTMLElement): void {
  const t = timers.get(host);
  if (t !== undefined) clearTimeout(t);
  timers.delete(host);
}
export const typingPlayed = (host: HTMLElement, key: string): boolean => played.get(host) === key;
export function armTyping(host: HTMLElement, el: HTMLElement, key: string): void {
  clearTyping(host);
  timers.set(host, setTimeout(() => {
    timers.delete(host);
    played.set(host, key);
    el.setAttribute('data-state', 'stopped');
    el.textContent = 'stopped typing';
  }, TYPING_MS));
}
