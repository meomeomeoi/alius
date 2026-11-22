/**
 * P10e §5: the top line, small and low-contrast. Left: the place, the day and slot, the mode and a small name tag per woman
 * present. Right: the tools of the last reply (swipe, regenerate, the P14 reroll), history, end and (when the app gives a way)
 * close. The hints for looking around and the history sit very dim at the bottom-left corner and hide after their first use.
 */
import { analyzeAttrs, analyzeNative } from '../../analyze/mark';
import { h } from '../../dom';

export interface TopLineCtx {
  place: string;
  /** `DAY 020 · EVENING`. */
  when: string;
  mode: 'PRIVATE' | 'GROUP';
  /** The name tags (the HUD): drawn and updated by the scene screen. */
  units: HTMLElement[];
  /** The tools of the last reply: ‹ ↻ ›, the reroll. */
  tools: HTMLElement[];
  onHistory(): void;
  onEnd(): void;
  /** Without it there is no close button (the shell's own close is hidden on the scene screen). */
  onClose?(): void;
}

export type HintKind = 'look' | 'history';
const used = new Set<HintKind>();
const HINTS: Array<{ kind: HintKind; text: string; analyze: string }> = [
  { kind: 'look', text: 'Hold the right mouse button to look around', analyze: 'glossary:look_around' },
  { kind: 'history', text: 'Wheel up or ↑ for the history', analyze: 'glossary:scene_history' },
];

/** A hint is gone after its first use (until the stage is reset: a new campaign shows them again). */
export function markHintUsed(kind: HintKind): void {
  used.add(kind);
  if (typeof document === 'undefined') return;
  for (const el of document.querySelectorAll<HTMLElement>(`.alius-stage-hints [data-hint="${kind}"]`)) el.hidden = true;
}

/** Forgets what was used; a drawn hint shows again. */
export function resetHints(): void {
  used.clear();
  if (typeof document === 'undefined') return; // (the app also resets on a chat switch in a headless run)
  for (const el of document.querySelectorAll<HTMLElement>('.alius-stage-hints [data-hint]')) el.hidden = false;
}

export function renderTopLine(host: HTMLElement, ctx: TopLineCtx): void {
  const small = (action: string, text: string, onclick: () => void, label: string): HTMLElement =>
    h('button', { type: 'button', class: 'alius-btn alius-topline-btn', 'data-action': action, 'aria-label': label, onclick }, text);
  const history = h('button', {
    type: 'button', class: 'alius-btn alius-topline-btn', 'data-action': 'history', 'aria-label': 'Open the history', title: 'Open the history of this scene',
    onclick: ctx.onHistory, ...analyzeNative('glossary:scene_history'),
  }, 'HISTORY');
  const right = h('div', { class: 'alius-scene-tools' }, ...ctx.tools, history, small('end', 'END TRANSMISSION', ctx.onEnd, 'End the conversation'));
  if (ctx.onClose) right.append(small('close', '×', ctx.onClose, 'Close Alius'));
  const hints = h('div', { class: 'alius-stage-hints' }, ...HINTS.map((x) => {
    const el = h('span', { 'data-hint': x.kind, ...analyzeAttrs(x.analyze) }, x.text);
    el.hidden = used.has(x.kind);
    return el;
  }));
  host.replaceChildren(h('div', { class: 'alius-topline' },
    h('div', { class: 'alius-topline-left' },
      h('span', { class: 'alius-topline-place' }, ctx.place),
      h('span', { class: 'alius-topline-when alius-dim' }, ` · ${ctx.when} · ${ctx.mode}`),
      ...ctx.units),
    right,
  ), hints);
}
