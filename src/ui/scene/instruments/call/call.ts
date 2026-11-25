/**
 * P10e-e Task 9: her posture call as a short full-frame moment (`docs/prototypes/cards.html` `startCall`, `scheduleTaps`, `tap`, `choose`, `end`,
 * normative; its `fidelity.json` checks the port against them). The frame dims to .28 and the dial's ring takes her accent; her word (her name for
 * the posture) is written on large in her hand beside her; with the order interaction on, her foot keeps the time: taps that close up toward the
 * end of her window, each a soft sound and an ink dot under her word, the last one exactly at the window's end (too late). The fan of her named
 * postures rises from the dial, each a card clicked whole. Right: the card flies into the dial; wrong: it shakes and she rings the right one;
 * slow: the last tap. Then her line (card-voice.md §5) in her hand, the dim lifts at 1.3 s, her line fades at 2.6 s, all is gone at 3.3 s.
 * The engine's answer goes out at once (`take`); what was called lives here (module memory), so a redraw of the scene never restarts it, and
 * `cancelCall` (dispose, a chat switch, the call gone) leaves no timer, element or listener behind. No rng: a tap's sound and rate are a hash of
 * the call and the tap.
 */
import { fnv1a } from '../../../../engine/hub';
import { h } from '../../../dom';
import type { SampleSound } from '../../../sound/samples';
import { mannequinSvg } from '../../dial/draw';
import { poseOf } from '../../dial/points';

/** The sounds of the call (cards.html `ASSETS`), named from the repo root. */
export const CALL_SOUNDS = {
  soft: ['assets/sounds/ha/soft1.ogg', 'assets/sounds/ha/soft2.ogg'],
  fan: 'assets/sounds/ha/card_fan.ogg',
  place: ['assets/sounds/ha/card_place1.ogg', 'assets/sounds/ha/card_place2.ogg'],
} as const;

export type CallOutcome = 'right' | 'wrong' | 'slow';

/** What the scene gives a call: who calls, what, the choices, the clock and where it draws. */
export interface CallOpts {
  id: string;
  /** The called posture: its base id and her name for it. */
  want: [string, string];
  /** Her named postures, in her order: `[base id, her name]`. */
  choices: Array<[string, string]>;
  /** The base posture's own name (`kneeling upright`). */
  baseLabel: (base: string) => string;
  /** Her line after the answer (card-voice.md §5 by her style; `{posture}` her word). */
  line: (outcome: CallOutcome) => string;
  /** Her foot keeps the time: only with P15a's order interaction on. */
  timed: boolean;
  /** Her window (`postureWindowMs`). */
  windowMs: number;
  reduced: boolean;
  /** Her accent, her hand's family and its size factor. */
  accent: string;
  hand: string;
  handScale: number;
  /** The moment layer's host, the dim's host (below the scene's UI) and the dial's corner (its ring takes her accent). */
  host: HTMLElement;
  dim: HTMLElement | null;
  dial: HTMLElement | null;
  samples: SampleSound | null;
  /** Attributes of every card (its `data-analyze`, P7a). */
  cardAttrs?: Record<string, string>;
  /** The answer to the engine: the posture chosen (none: too slow) and whether the window had passed. */
  take: (base: string | undefined, late: boolean) => void;
  now: () => number;
  schedule: (fn: () => void, ms: number) => unknown;
  cancel: (handle: unknown) => void;
}

interface CallEls { root: HTMLElement; w: HTMLElement; dots: HTMLElement; line: HTMLElement; fan: HTMLElement; dim: HTMLElement | null }
interface Call { id: string; want: [string, string]; t0: number; taps: number[]; timers: unknown[]; done?: boolean; o: CallOpts; el: CallEls }

let call: Call | null = null;

/** The call drawn now (its id, and whether its answer has been given), or null. */
export function currentCall(): { id: string; done: boolean } | null {
  return call === null ? null : { id: call.id, done: call.done === true };
}

/** The first tap at 380 ms, each next one `700 − 480·k²` later (`k` = the time gone / the window), the last exactly at the window's end. */
export function tapTimes(windowMs: number): number[] {
  const win = windowMs;
  const times = []; let t = 380;
  while (t < win) { times.push(t); const k = t / win; t += 700 - 480 * k * k; }
  times.push(win);
  return times;
}

/** A card's place in the fan: the rightmost over the dial, 140 px apart, each turned and lowered by its distance from the middle. */
export function fanPlace(i: number, n: number): { x: number; rot: number; lift: number } {
  const k = i - (n - 1);
  return { x: k * 140, rot: (i - (n - 1) / 2) * 5, lift: Math.abs(i - (n - 1) / 2) * 9 };
}

const sfx = (o: CallOpts, file: string, gain: number, pan: number, rate = 1): void => { o.samples?.play(file, { gain, pan, rate }); };

/** The elements of the moment (cards.html `#call`, `#callWord`, `#dots`, `#callLine`, `#fan`, `#dimmer`). */
function build(o: CallOpts): CallEls {
  const w = h('span', { class: 'alius-call-w' });
  const dots = h('div', { class: 'alius-call-dots', 'aria-hidden': 'true' });
  const line = h('div', { class: 'alius-call-line', role: 'status' });
  const fan = h('div', { class: 'alius-call-fan' });
  const root = h('div', { class: 'alius-call', 'data-call': o.id, 'data-clock': '', role: 'group', 'aria-label': 'She calls a posture' },
    h('div', { class: 'alius-call-word' }, w, dots), line, fan);
  root.style.setProperty('--alius-her', o.accent);
  if (o.hand !== '') root.style.setProperty('--alius-font-hand', `"${o.hand}", var(--alius-font-type)`);
  root.style.setProperty('--alius-hand-scale', String(o.handScale));
  if (o.reduced) root.dataset.reduced = 'true';
  o.host.append(root);
  const dim = o.dim === null ? null : o.dim.appendChild(h('div', { class: 'alius-call-dim' }));
  return { root, w, dots, line, fan, dim };
}

export function startCall(o: CallOpts) {
  if (call) return;
  const choices = o.choices;
  const want = o.want;
  const id = o.id;
  call = { id, want, t0: o.now(), taps: [], timers: [], o, el: build(o) };
  const el0 = call.el;
  if (el0.dim) { void el0.dim.offsetWidth; el0.dim.style.opacity = '0.28'; }
  if (o.dial) { o.dial.dataset.called = 'true'; o.dial.style.setProperty('--alius-her', o.accent); }
  const w = el0.w; w.textContent = want[1]; w.className = 'alius-call-w'; void w.offsetWidth; if (!o.reduced) w.classList.add('is-writing');
  el0.dots.replaceChildren(); el0.line.textContent = ''; el0.line.style.opacity = '1';
  // the fan rises from the dial: a hand of cards, stable order
  const fan = el0.fan; fan.replaceChildren();
  const n = choices.length;
  choices.forEach(([base, name], i) => {
    const pose = poseOf(base);
    const el = h('button', { type: 'button', class: 'alius-call-card', 'data-posture-choice': base, 'data-call': id, 'aria-label': `${name}: ${o.baseLabel(base)}`, ...(o.cardAttrs ?? {}) },
      pose ? mannequinSvg(pose) : null, h('span', { class: 'alius-call-nm' }, name), h('span', { class: 'alius-call-base' }, o.baseLabel(base)));
    const { x, rot, lift } = fanPlace(i, n);
    el.style.left = `${x}px`;
    el.style.transform = o.reduced ? `translateY(${lift}px) rotate(${rot}deg)` : 'translateY(260px) rotate(0deg) scale(.6)';
    el.style.opacity = o.reduced ? '1' : '0';
    el.onmouseenter = () => { if (!call?.done) el.style.transform = `translateY(${lift - 18}px) rotate(0deg) scale(1.04)`; };
    el.onmouseleave = () => { if (!call?.done) el.style.transform = `translateY(${lift}px) rotate(${rot}deg)`; };
    el.onclick = () => choose(base, el);
    el.dataset.base = base;
    fan.append(el);
    if (!o.reduced) call!.timers.push(o.schedule(() => { el.style.opacity = '1'; el.style.transform = `translateY(${lift}px) rotate(${rot}deg)`; }, 120 + i * 55));
  });
  sfx(o, CALL_SOUNDS.fan, 0.3, 0.6);
  if (o.timed) scheduleTaps();
  return el0.root;
}

/** Her foot: taps that close up toward the end of the window (700 → 220 ms apart); the last one is "too late". */
function scheduleTaps() {
  const win = call!.o.windowMs;
  const times = tapTimes(win);
  const span = 300; // the dots' width in px
  times.forEach((at, i) => call!.timers.push(call!.o.schedule(() => tap(at / win, i === times.length - 1, span, i), at)));
}

function tap(k: number, last: boolean, span: number, i: number) {
  if (!call) return;
  const o = call.o;
  const d = h('i'); if (last) d.className = 'last';
  d.style.left = `${(k - 0.5) * span}px`; call.el.dots.append(d);
  const w = call.el.w;
  if (!o.reduced) { w.classList.remove('is-bob'); void w.offsetWidth; w.classList.add('is-bob'); }
  sfx(o, CALL_SOUNDS.soft[fnv1a(`${call.id}|${i}`) % 2], (0.22 + 0.4 * k) * (last ? 1.6 : 1), 0.35, 0.92 + (fnv1a(`${call.id}|${i}|rate`) % 1000) / 1000 * 0.1);
  if (last) end('slow', null);
}

function choose(base: string, el: HTMLElement) {
  if (!call || call.done) return;
  sfx(call.o, CALL_SOUNDS.place[0], 0.35, 0.6);
  end(base === call.want[0] ? 'right' : 'wrong', base, el);
}

function end(outcome: CallOutcome, base: string | null, el?: HTMLElement) {
  const c = call; if (!c || c.done) return;
  c.done = true; for (const t of c.timers) c.o.cancel(t); c.timers = [];
  const o = c.o;
  const fan = c.el.fan;
  const rightEl = fan.querySelector<HTMLElement>(`[data-base="${c.want[0]}"]`);
  c.el.root.dataset.outcome = outcome;
  if (outcome === 'right') {
    if (!o.reduced && el) { const fx = -parseFloat(el.style.left) - 30; el.style.transition = 'transform .45s cubic-bezier(.5,0,.8,.4), opacity .45s'; el.style.transform = `translate(${fx}px, 230px) scale(.35)`; el.style.opacity = '0'; }
    for (const x of fan.children) if (x !== el) (x as HTMLElement).style.opacity = '0';
  } else {
    if (outcome === 'wrong' && el) el.classList.add('is-wrong');
    rightEl?.classList.add('is-right'); // she shows which one it was
    c.timers.push(o.schedule(() => { for (const x of fan.children) { (x as HTMLElement).style.opacity = '0'; if (!o.reduced) (x as HTMLElement).style.transform += ' translateY(60px)'; } }, 900));
  }
  const lineEl = c.el.line;
  lineEl.textContent = o.line(outcome);
  lineEl.className = 'alius-call-line'; void lineEl.offsetWidth; if (!o.reduced) lineEl.classList.add('is-writing');
  // the engine's answer: the posture chosen (none: the last tap), late when the window had passed
  o.take(base ?? undefined, outcome === 'slow' || (o.timed && o.now() - c.t0 > o.windowMs));
  c.timers.push(o.schedule(() => { if (c.el.dim) c.el.dim.style.opacity = '0'; if (o.dial) delete o.dial.dataset.called; c.el.w.textContent = ''; c.el.dots.replaceChildren(); }, 1300));
  c.timers.push(o.schedule(() => { lineEl.style.opacity = '0'; }, 2600));
  c.timers.push(o.schedule(() => { teardown(c); }, 3300));
}

/** Removes what a call drew and forgets it (its timers already cancelled or run). */
function teardown(c: Call): void {
  c.el.root.remove();
  c.el.dim?.remove();
  if (c.o.dial) {
    delete c.o.dial.dataset.called;
    c.o.dial.style.removeProperty('--alius-her');
  }
  if (call === c) call = null;
}

/** The call goes at once (dispose, a chat switch, the call gone from the scene): no timer runs, no answer is sent, nothing it drew stays. */
export function cancelCall(): void {
  const c = call;
  if (c === null) return;
  c.done = true;
  for (const t of c.timers) c.o.cancel(t);
  c.timers = [];
  teardown(c);
}
