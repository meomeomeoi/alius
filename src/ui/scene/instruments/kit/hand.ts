/**
 * P10e-e kit: her lines on the frame (`say`, `placeFree`, `liveTextRects`), copied from `docs/prototypes/her_activity.html` (fixed
 * 2026-11-24: a long line is cut at the words into lines of about 40 characters, 30 when big, each written in turn; every line stays inside
 * the frame and moves past the lines already showing so none overlap). The wiring differs where the prototype reads its page
 * (declared in `fidelity.json`):
 * - the line is written into `host` (one group per call), in her hand (`HerLook.hand`) at the size × `handScale`, in her accent;
 * - positions are in the host's frame (the scene), not the window; the frame's size is the host's;
 * - her murmur, the pen's sound and the "she is speaking" clock are the instrument's (the kit plays nothing);
 * - the jitter of place and tilt is a hash of the text (no random draw), so the same line lands the same way;
 * - every timer is kept per host, and `unsay(host)` clears the lines and the timers at once (an instrument's stop).
 * The text is always set as text (`textContent`), never as markup.
 */
import { fnv1a } from '../../../../engine/hub';
import type { HerLook } from '../types';
import { clamp } from './math';

export interface SayOpts {
  her: HerLook;
  /** Where the line starts, fractions of the frame (default the prototype's upper right, [0.6, 0.16]). */
  at?: [number, number];
  /**
   * Whom she says it to (the prototype's `to`, default `self`): `self` is a line to herself (`.self`: 34 px, at .72), `commander` a line
   * to the commander (`.to-you`: 46 px), anything else (`written`, `other`) the plain 40 px line.
   */
  to?: 'self' | 'commander' | 'written' | 'other';
  /** A big line (`.big`: 56 px, cut at about 30 characters). */
  big?: boolean;
  /** The size in px before `handScale`; default the prototype's size of the line's class (see `to` and `big`). */
  size?: number;
  /** The slight tilt of a hand-written line (default on). */
  tilt?: boolean;
  /** How long the line stays before it fades (default the prototype's: by its length). */
  ms?: number;
  /** Which edge the line is anchored to (breath's `align`): `right` writes leftward from `at`. */
  side?: 'left' | 'right';
}

/** The instrument host's note of every host a mount writes into (so its unmount clears only those). */
let recorder: ((host: HTMLElement) => void) | null = null;
export function recordSays(fn: ((host: HTMLElement) => void) | null): void {
  recorder = fn;
}

const timers = new WeakMap<HTMLElement, Set<ReturnType<typeof setTimeout>>>();
const groups = new WeakMap<HTMLElement, Set<HTMLElement>>();

function later(host: HTMLElement, ms: number, fn: () => void): void {
  let set = timers.get(host);
  if (!set) timers.set(host, (set = new Set()));
  const t = setTimeout(() => { set!.delete(t); fn(); }, ms);
  set.add(t);
}

/** Clears every line `say` wrote into `host` and every timer it left. */
export function unsay(host: HTMLElement): void {
  for (const t of timers.get(host) ?? []) clearTimeout(t);
  timers.delete(host);
  for (const g of groups.get(host) ?? []) g.remove();
  groups.delete(host);
}

/** The frame the lines are placed in: the host's box (its size, and its offset on the page for the rects of the lines). */
function frameOf(host: HTMLElement): { W: number; H: number; left: number; top: number } {
  const r = host.getBoundingClientRect();
  const W = host.clientWidth || r.width || (typeof innerWidth === 'number' ? innerWidth : 0);
  const H = host.clientHeight || r.height || (typeof innerHeight === 'number' ? innerHeight : 0);
  return { W, H, left: r.left, top: r.top };
}

/** A stable stand-in for the prototype's `rand(a, b)`: a value in [a, b) from a hash of the line and a salt (no random draw). */
function hashRand(key: string, a: number, b: number): number {
  return a + ((fnv1a(key) % 10_000) / 10_000) * (b - a);
}

/* placing a line of text on the frame: kept inside the screen (moved left if it would run off the right edge), and moved down past every
   line already showing (hers, the other's, the sensory ones) until it overlaps none; with no room left below, it looks above instead */
function liveTextRects(host: HTMLElement, except: HTMLElement): DOMRect[] {
  const out: DOMRect[] = [];
  const scope = host.closest('.alius-scene') ?? host;
  for (const el of scope.querySelectorAll<HTMLElement>('[data-text-host] > [data-line]')) {
    if (el === except || el.classList.contains('gone') || el.dataset.gone) continue;
    const r = el.getBoundingClientRect(); if (r.width && r.height) out.push(r);
  }
  return out;
}

/** Places `el` at (x, y) of the host's frame, moved past the lines already showing; returns where it went and its height. */
export function placeFree(host: HTMLElement, el: HTMLElement, x: number, y: number) {
  const f = frameOf(host);
  const innerWidth = f.W, innerHeight = f.H;
  const rects = liveTextRects(host, el).map((r) => ({ left: r.left - f.left, right: r.right - f.left, top: r.top - f.top, bottom: r.bottom - f.top }));
  const w = el.offsetWidth, h = el.offsetHeight, gap = 6, maxY = innerHeight * 0.8 - h;
  x = clamp(x, 16, innerWidth - w - 24);
  const hits = (yy: number) => rects.find((r) => x < r.right + gap && x + w > r.left - gap && yy < r.bottom + gap && yy + h > r.top - gap);
  let yy = clamp(y, 12, Math.max(12, maxY)), hit, n = 0;
  while ((hit = hits(yy)) && n++ < 30) yy = hit.bottom + gap;
  if (yy > maxY) { yy = clamp(y, 12, Math.max(12, maxY)); n = 0; while ((hit = hits(yy)) && n++ < 30) yy = hit.top - gap - h; yy = Math.max(12, yy); }
  el.style.left = `${x}px`; el.style.top = `${yy}px`;
  return { x, y: yy, h };
}

/* her words in her hand; a long one is cut at the words into lines of about 40 characters (30 when big), each written in turn */
export function say(host: HTMLElement, text: string, opts: SayOpts): HTMLElement {
  const group = document.createElement('div');
  group.className = 'alius-her-lines';
  group.dataset.textHost = '';
  if (!text) return group;
  host.appendChild(group);
  recorder?.(host);
  let mine = groups.get(host);
  if (!mine) groups.set(host, (mine = new Set()));
  mine.add(group);
  const to = opts.to ?? 'self';
  const size = opts.size ?? (opts.big ? 56 : to === 'self' ? 34 : to === 'commander' ? 46 : 40);
  const max = opts.big ? 30 : 40, lines: string[] = [];
  for (const word of text.split(' ')) { const last = lines[lines.length - 1]; if (last !== undefined && (last + ' ' + word).length <= max) lines[lines.length - 1] = last + ' ' + word; else lines.push(word); }
  const { W: innerWidth, H: innerHeight } = frameOf(host);
  const p = opts.at ?? [0.6, 0.16];
  const els: HTMLElement[] = [];
  let x = clamp(p[0] + 0.04, 0.03, 0.7) * innerWidth + hashRand(`${text}|x`, -15, 15), y = clamp(p[1] + 0.02, 0.03, 0.8) * innerHeight, delay = 0;
  const rot = opts.tilt === false ? '0.0' : hashRand(`${text}|rot`, -4, 3).toFixed(1);
  for (const line of lines) {
    const el = document.createElement('div');
    el.className = 'alius-her-line' + (to === 'self' ? ' self' : to === 'commander' ? ' to-you' : '') + (opts.big ? ' big' : '');
    el.dataset.line = '';
    el.textContent = line;
    const write = Math.max(160, line.length * 36);
    el.style.setProperty('--write', `${write}ms`);
    el.style.setProperty('--steps', String(Math.max(4, line.length * 2)));
    el.style.setProperty('--alius-font-hand', `"${opts.her.hand}", var(--alius-font-type)`);
    el.style.setProperty('--alius-her', opts.her.accent);
    el.style.fontSize = `${Math.round(size * opts.her.handScale * 100) / 100}px`;
    el.style.animationDelay = `${delay}ms`;
    el.style.transform = `rotate(${rot}deg)`;
    group.appendChild(el);
    const at = placeFree(host, el, x, y); x = at.x; y = at.y + at.h + 2;
    if (opts.side === 'right') { el.style.left = ''; el.style.right = `${Math.max(0, innerWidth - at.x)}px`; el.classList.add('right'); }
    delay += write; els.push(el);
  }
  const dur = 700 + text.length * 70;
  const life = opts.ms ?? (opts.big ? 5200 : Math.max(2600, dur + 1400)) + delay * 0.5;
  later(host, life, () => {
    for (const el of els) el.classList.add('gone');
    later(host, 700, () => { group.remove(); mine!.delete(group); });
  });
  return group;
}
