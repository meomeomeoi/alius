/**
 * P10e §4: the history curtain. A glass panel from the left edge (45 % of the width, full height) with the whole scene
 * transcript, newest at the bottom, in the same prose rendering as the reply block; the speaker's name over each message
 * ("YOU" over the commander's). Per message: edit (✎); on the last model reply also ‹ n / m › and regenerate. The input line
 * lives at its bottom while it is open (the scene screen moves it). The curtain draws only while open; opening it is the scene
 * screen's wiring (the wheel, ↑ in an empty input, the history button) and closing too (Esc, the wheel down at the end).
 * Everything goes in as text; the model's words never become markup.
 */
import type { ChatMessage } from '../../../st/adapter';
import { h } from '../../dom';
import { onStageReset } from './index';
import { fillProse } from './prose';

export interface CurtainDrawCtx {
  commanderName: string;
  /** A send is in flight: every tool is off. */
  pending: boolean;
  /** The message being edited (mutated: `value` follows the box, `focus` is cleared once the box has taken the focus). */
  editing: { index: number; value: string; focus: boolean } | null;
  onEdit(index: number): void;
  onSave(): void;
  onCancel(): void;
  onSwipe(dir: 'left' | 'right'): void;
  onRegenerate(): void;
  /** Draws the violation marker (P9d) on a line. */
  flag?(line: HTMLElement, index: number): void;
  accentOf(name: string, avatar?: string): string | null;
}

export interface Curtain {
  element: HTMLElement;
  /** The scrolling list of messages. */
  scroller: HTMLElement;
  /** Where the input line sits while the curtain is open. */
  inputSlot: HTMLElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
  draw(messages: ChatMessage[], ctx: CurtainDrawCtx): void;
  /** Forgets the reset hook (the scene screen is gone). */
  destroy(): void;
}

const atEnd = (el: HTMLElement): boolean => el.scrollTop + el.clientHeight >= el.scrollHeight - 2;

export function createCurtain(host: HTMLElement, opts: { onOpen(): void; onClose(): void }): Curtain {
  const scroller = h('div', { class: 'alius-curtain-scroll', role: 'log', 'aria-live': 'polite', tabindex: '0' });
  const inputSlot = h('div', { class: 'alius-curtain-input' });
  const element = h('div', { class: 'alius-curtain', 'data-open': 'false', role: 'region', 'aria-label': 'Scene history', 'aria-hidden': 'true' },
    h('div', { class: 'alius-curtain-head' }, 'HISTORY'), scroller, inputSlot);
  host.append(element);
  let opened = false;
  let last: { messages: ChatMessage[]; ctx: CurtainDrawCtx } | null = null;

  function render(): void {
    if (!last) return;
    const { messages, ctx } = last;
    const stick = scroller.childElementCount === 0 || atEnd(scroller);
    const previous = scroller.scrollTop;
    const boxHadFocus = document.activeElement instanceof HTMLTextAreaElement && scroller.contains(document.activeElement);
    let lastReply = -1;
    messages.forEach((m, i) => {
      if (!m.isUser) lastReply = i;
    });
    scroller.replaceChildren(...messages.map((m, i) => {
      const name = h('span', { class: 'alius-speaker' });
      name.textContent = m.isUser ? 'YOU' : m.name.toUpperCase();
      const cls = `alius-line alius-curtain-line${m.isUser ? ' is-user' : ''}`;
      let line: HTMLElement;
      if (ctx.editing && ctx.editing.index === m.index) {
        const e = ctx.editing;
        const box = h('textarea', { class: 'alius-edit-box', rows: '3', 'aria-label': 'Edit message' }) as HTMLTextAreaElement;
        box.value = e.value;
        box.addEventListener('input', () => { e.value = box.value; });
        box.addEventListener('keydown', (ev) => {
          const k = ev as KeyboardEvent;
          if (k.key === 'Escape') {
            k.stopPropagation(); // cancels the edit, not the curtain
            ctx.onCancel();
          } else if (k.key === 'Enter' && (k.ctrlKey || k.metaKey)) ctx.onSave();
        });
        line = h('div', { class: `${cls} is-editing`, 'data-index': m.index }, name, h('div', { class: 'alius-edit-form' }, box,
          h('button', { type: 'button', class: 'alius-btn', 'data-action': 'edit-save', onclick: () => ctx.onSave() }, 'Save'),
          h('button', { type: 'button', class: 'alius-btn', 'data-action': 'edit-cancel', onclick: () => ctx.onCancel() }, 'Cancel')));
      } else {
        const text = h('span', { class: 'alius-text' });
        fillProse(text, m.text, Infinity);
        const tools = h('span', { class: 'alius-curtain-tools' },
          h('button', {
            type: 'button', class: 'alius-edit', 'data-edit': m.index, 'aria-label': 'Edit message', title: 'Edit this message', disabled: ctx.pending,
            onclick: () => ctx.onEdit(m.index),
          }, '✎'));
        if (i === lastReply) {
          const tool = (action: string, label: string, aria: string, onclick: () => void): HTMLElement =>
            h('button', { type: 'button', class: 'alius-btn alius-curtain-btn', 'data-action': action, 'aria-label': aria, disabled: ctx.pending, onclick }, label);
          tools.append(
            tool('swipe-left', '‹', 'Previous reply', () => ctx.onSwipe('left')),
            ...(m.swipeCount !== undefined ? [h('span', { class: 'alius-curtain-swipes' }, `${m.swipeId + 1} / ${m.swipeCount}`)] : []),
            tool('swipe-right', '›', 'Next reply', () => ctx.onSwipe('right')),
            tool('regenerate', '↻', 'Regenerate the last reply', () => ctx.onRegenerate()),
          );
        }
        line = h('div', { class: cls, 'data-index': m.index }, name, text, tools);
        const accent = ctx.accentOf(m.name, m.avatar);
        if (accent && !m.isUser) line.style.setProperty('--alius-accent', accent);
        if (!m.isUser) ctx.flag?.(line, m.index);
      }
      return line;
    }));
    const box = scroller.querySelector<HTMLTextAreaElement>('textarea.alius-edit-box');
    if (box && (ctx.editing?.focus || boxHadFocus)) {
      box.focus();
      if (ctx.editing) ctx.editing.focus = false;
    } else if (stick) scroller.scrollTop = scroller.scrollHeight;
    else scroller.scrollTop = previous;
  }

  // the wheel down at the end of the list lets the curtain go
  scroller.addEventListener('wheel', (ev) => {
    if (opened && (ev as WheelEvent).deltaY > 0 && atEnd(scroller)) curtain.close();
  });

  const curtain: Curtain = {
    element, scroller, inputSlot,
    open() {
      if (opened) return;
      opened = true;
      element.dataset.open = 'true';
      element.setAttribute('aria-hidden', 'false');
      opts.onOpen();
      render();
      scroller.scrollTop = scroller.scrollHeight;
    },
    close() {
      if (!opened) return;
      opened = false;
      element.dataset.open = 'false';
      element.setAttribute('aria-hidden', 'true');
      opts.onClose();
    },
    isOpen: () => opened,
    draw(messages, ctx) {
      last = { messages, ctx };
      if (opened) render();
    },
    destroy: () => stop(),
  };
  const stop = onStageReset(() => curtain.close());
  return curtain;
}
