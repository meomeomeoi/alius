import type { NightEntry } from '../../engine/state/types';
import { analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import type { SoundId } from '../sound/sound';
import { DOOR_ART } from './knock';

/**
 * The night door (P10b §3): a knock that is not a confrontation, drawn as frosted glass with her silhouette. The commander may
 * open, say one thing through the door (one model reply) or stay silent; a timer (a real-time setting) is the same as staying
 * silent. Nothing here decides anything: it calls `onOpen`, `onSay` and `onSilent`, and shows the entry it is given.
 */

export interface DoorCtx {
  entry: NightEntry;
  unitName: string;
  /** Her sprite for the glass (`null` = none: the ASCII door). Not asked in readable mode. */
  silhouette?: () => HTMLElement | null;
  /** The timer in seconds; 0 = none. */
  seconds: number;
  motion: boolean;
  readable: boolean;
  sound?: { play(id: SoundId): void };
  onOpen(): void;
  /** One line through the door; resolves when her answer (or the failure) is in. */
  onSay(text: string): Promise<void>;
  onSilent(): void;
  /** Redraw from the current state after an exchange (default: draw again from `entry`). */
  onChanged?(): void;
}

/** The characters of a line through the door. */
export const DOOR_SAY_MAX = 300;
const TICK_MS = 250;

/** Seconds left per entry id: a redraw keeps the deadline, a reload starts again. `phase` restarts the timer after the exchange. */
const clocks = new Map<string, { remaining: number; phase: 'fresh' | 'exchanged' }>();
/** What was typed through the door per entry (a redraw of the screen must not lose it). */
const drafts = new Map<string, string>();
/** Entries whose reply is being generated. */
const pending = new Set<string>();
/** The knocks already heard in a render host. */
const knocked = new WeakMap<HTMLElement, Set<string>>();
/** The interval of a host's door. */
const running = new WeakMap<HTMLElement, () => void>();

/** The deadlines and drafts are keyed by entry id and ids repeat across campaigns: forget them when another campaign is loaded. */
export function resetDoor(): void {
  clocks.clear();
  drafts.clear();
}

/** Is the countdown held: she is answering, the page is hidden, a modal or the analysis panel is open, or the commander is typing. */
function held(entry: NightEntry, input: HTMLInputElement | null): boolean {
  if (pending.has(entry.id) || document.hidden) return true;
  if (document.querySelector('.alius-modal-backdrop') || document.querySelector('.alius-analyze')) return true;
  return input !== null && (input.value !== '' || document.activeElement === input);
}

export function renderDoor(host: HTMLElement, ctx: DoorCtx): void {
  running.get(host)?.();
  running.delete(host);
  host.replaceChildren();
  const { entry } = ctx;

  // ---- the glass
  const heard = knocked.get(host) ?? new Set<string>();
  knocked.set(host, heard);
  const firstKnock = !heard.has(entry.id);
  heard.add(entry.id);
  const art = h('div', { class: 'alius-door-art', 'aria-hidden': 'true' });
  const sprite = ctx.readable ? null : ctx.silhouette?.() ?? null;
  if (ctx.readable) {
    art.classList.add('is-solid');
    art.append(h('div', { class: 'alius-door-shape' }));
  } else if (sprite) {
    art.append(h('div', { class: 'alius-door-silhouette' }, sprite));
  } else {
    art.append(h('pre', { class: 'alius-ascii' }, DOOR_ART));
  }
  if (firstKnock && ctx.motion) art.classList.add('is-knocking');
  if (firstKnock) ctx.sound?.play('knock');

  // ---- what was said
  const framing = h('p', { class: 'alius-knock-text' }, entry.framing);
  const lines = h('div', { class: 'alius-door-lines' });
  if (entry.door) {
    lines.append(h('p', { class: 'alius-door-said' }, `YOU: ${entry.door.said}`));
    lines.append(h('p', entry.door.reply !== undefined ? { class: 'alius-door-reply' } : { class: 'alius-door-silence alius-dim' }, entry.door.reply !== undefined ? `${ctx.unitName.toUpperCase()}: ${entry.door.reply}` : 'No answer through the door.'));
  }
  const status = h('p', { class: 'alius-door-status alius-dim', role: 'status' });

  // ---- the timer
  const phase = entry.door ? 'exchanged' : 'fresh';
  let clock = clocks.get(entry.id);
  if (!clock || clock.phase !== phase) clocks.set(entry.id, (clock = { remaining: ctx.seconds, phase }));
  const fill = h('span', { class: 'alius-door-fill' });
  const live = h('span', { class: 'alius-door-count', 'aria-live': 'polite' });
  const timer = ctx.seconds > 0
    ? h('div', { class: `alius-door-timer${ctx.motion ? ' is-animated' : ''}` }, h('div', { class: 'alius-door-bar', 'aria-hidden': 'true' }, fill), live)
    : null;
  const paint = (): void => {
    fill.style.width = `${Math.max(0, Math.min(100, (clock!.remaining / ctx.seconds) * 100))}%`;
  };
  if (timer) paint();

  // ---- the options
  let used = false;
  const buttons: HTMLButtonElement[] = [];
  const lock = (): void => {
    used = true;
    for (const b of buttons) b.disabled = true;
  };
  const press = (fn: () => void) => (): void => {
    if (used) return;
    lock();
    stop();
    clocks.delete(entry.id);
    fn();
  };
  const option = (action: string, text: string, onclick: () => void): HTMLButtonElement => {
    const b = h('button', { type: 'button', class: 'alius-btn alius-option', 'data-action': action, ...analyzeNative('glossary:night_door'), onclick }) as HTMLButtonElement;
    b.textContent = text;
    buttons.push(b);
    return b;
  };
  let input: HTMLInputElement | null = null;
  const form = h('div', { class: 'alius-door-form' });
  const openForm = (): void => {
    if (input || used || pending.has(entry.id)) return;
    input = h('input', { type: 'text', class: 'alius-input alius-door-input', name: 'door', maxlength: String(DOOR_SAY_MAX), autocomplete: 'off', 'aria-label': `Say something through the door to ${ctx.unitName}` }) as HTMLInputElement;
    const sendButton = h('button', { type: 'button', class: 'alius-btn', 'data-action': 'send-door', onclick: send }, '[SAY]') as HTMLButtonElement;
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') send();
    });
    input.addEventListener('input', () => drafts.set(entry.id, input!.value));
    form.append(input, sendButton);
    input.focus({ preventScroll: true });
  };
  function send(): void {
    const text = input?.value.trim() ?? '';
    if (!input || text === '' || used || pending.has(entry.id)) return;
    pending.add(entry.id);
    drafts.delete(entry.id);
    input.disabled = true;
    form.querySelector('button')?.setAttribute('disabled', '');
    for (const b of buttons) b.disabled = true;
    status.textContent = `${ctx.unitName} is answering…`;
    void Promise.resolve(ctx.onSay(text)).catch(() => undefined).finally(() => {
      pending.delete(entry.id);
      if (!host.isConnected) return;
      if (ctx.onChanged) ctx.onChanged();
      else renderDoor(host, ctx);
    });
  }

  const row = h('div', { class: 'alius-row' }, option('open', '[OPEN]', press(ctx.onOpen)));
  if (!entry.door) row.append(option('say', '[SAY SOMETHING THROUGH THE DOOR]', openForm));
  row.append(option('ignore', '[STAY SILENT]', press(ctx.onSilent)));

  host.append(h(
    'section', { class: 'alius-section alius-door alius-knock', 'aria-label': `${ctx.unitName} at the door` },
    h('h2', {}, '[ NIGHT // DOOR ]'), art, framing, lines, status, ...(timer ? [timer] : []), form, row,
  ));
  // a redraw while the commander was typing: the field comes back with its text (and keeps the countdown held)
  const draft = drafts.get(entry.id);
  if (draft && !entry.door && !pending.has(entry.id)) {
    openForm();
    const field = form.querySelector<HTMLInputElement>('input');
    if (field) field.value = draft;
  }
  if (pending.has(entry.id)) {
    status.textContent = `${ctx.unitName} is answering…`;
    for (const b of buttons) b.disabled = true;
  }

  // ---- the countdown
  if (ctx.seconds <= 0) return;
  let said10 = clock.remaining <= 10;
  let said5 = clock.remaining <= 5;
  let handle: ReturnType<typeof setInterval> | null = null;
  function stop(): void {
    if (handle !== null) clearInterval(handle);
    handle = null;
    running.delete(host);
  }
  running.set(host, stop);
  handle = setInterval(() => {
    if (!host.isConnected || used) return stop();
    if (held(entry, input)) return;
    clock!.remaining = Math.max(0, clock!.remaining - TICK_MS / 1000);
    paint();
    if (!said10 && clock!.remaining <= 10) { said10 = true; live.textContent = '10 seconds left'; }
    if (!said5 && clock!.remaining <= 5) { said5 = true; live.textContent = '5 seconds left'; }
    if (clock!.remaining <= 0) {
      live.textContent = '0 seconds left: the door stays shut and she leaves';
      lock();
      stop();
      clocks.delete(entry.id);
      ctx.onSilent();
    }
  }, TICK_MS);
}
