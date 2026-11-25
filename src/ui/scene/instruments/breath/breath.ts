/**
 * P10e-e Task 14: breathing as an instrument (`docs/prototypes/breath.html`, normative; its `fidelity.json` checks the port against it). Her
 * rhythm opens the dark over the commander's face; on her opening, hold Space (or the left button on the frame: while typing only the mouse
 * breathes, the field keeps its spaces and its focus) to breathe. Air is not a bar: it is the vision (a tunnel whose rim pulses red with a
 * quickening heart), the hearing (the world's sounds go dull) and the line being typed (it narrows, its letters fade and blur). Holding on past
 * her opening strains against her: the air goes twice as fast and the dark presses; at 450 ms she notices, says so and her next openings come
 * later. The shape of the dark is the contact's (`occlusionOf`), and behind it is the ceiling (P10c's `surface: 'ceiling'` art), the room or,
 * where her face is really there, her sprite.
 *
 * The functions are the prototype's, copied (types added). The wiring, declared in `fidelity.json`:
 * - her openings are the engine's plan (`effectiveOpenings`, placed in wall time through `staging.clock()`), scheduled per running segment;
 *   nothing drains while the run is held between segments; the engine's gauge resets the air at each segment and the engine ends the hold;
 * - every opening is reported once (`breathe` with the share of it held), every over-hold once (`strain`, 0.5 or 1), a breath through the gap
 *   of a leaky seal at once (`gap_breath`); a report that the mouse made is exempt from the typing lapse (ruling O);
 * - her lines are her cue pool's (`staging.cue`): `now` → `window_open`, `fake` / `early` → `window_false`, `greedy`, `low` → `warning`,
 *   `released` → `lift`; the prototype's other kinds have no cue kind and say nothing; the count's "three… two… one…" is the prototype's;
 * - `performance`, `setTimeout`, `requestAnimationFrame`, `innerWidth` / `innerHeight` and `Math.random` are this module's own: the scene's frame
 *   clock, the mount's timers and frames (cleared at the unmount), the scene's size, and a xorshift seeded by the run (no rng draw);
 * - `$` names the instrument's own elements (in the effects layer, under the scene's UI: the stop word's pill is never covered), the scene's
 *   reply, its input line and input, and the letters laid over the input (`#mirror`); the reply's opacity and the line's width and border are
 *   written through claims (styleClaims.ts);
 * - the sound is synthesised as the prototype's: its world bus (a lowpass) and body bus feed a master that goes into the sample layer's body
 *   bus (the player's level is the layer's), and every source made is the mount's (stopped at the unmount);
 * - the end is the engine's: on its outcome the exit plays (her line, the dark leaving), or the blackout and the wake, through `finish`.
 */
import type { Registries } from '../../../../content/types';
import type { CueKind, Seal } from '../../../../engine/blocking/types';
import { ceilingOf } from '../../../../engine/backdrops';
import { fnv1a } from '../../../../engine/hub';
import { occlusionOf } from '../../../../engine/physics/occlusion';
import { effectiveOpenings, overDelayOf } from '../../../../engine/physics/segment';
import type { PhysicsRun, SegmentInput } from '../../../../engine/physics/state';
import { effectiveHoldsUntil, leadStyle, physicsStyleOf } from '../../../../engine/physics/style';
import type { CampaignState } from '../../../../engine/state/types';
import { TUNING } from '../../../../engine/tuning';
import { analyzeNative } from '../../../analyze/mark';
import { voiceLines, type VoiceKind } from '../../cards/voice';
import { registerInstrument } from '../host';
import { claimStyles, noteWrites, releaseClaim, type StyleClaim } from '../styleClaims';
import type { InstrumentEnv, InstrumentRun, PhysicsEnd } from '../types';
import { S as darkS, SHAPES, type ShapeKind, type SoftSpring } from '../kit/dark';
import { DS, lowres } from '../kit/lowres';
import { clamp, lerp, smooth } from '../kit/math';

/* ---------- the wiring: the mount, the clock, the timers, the frames and the size of the scene ---------- */
interface BreathEls {
  env: InstrumentEnv;
  box: HTMLElement;
  els: Record<string, HTMLElement>;
  mirror: HTMLElement;
  claims: StyleClaim[];
  frameId: number | null;
}
let E: BreathEls | null = null;
/** The shots' hook (the prototype's `window.__forceO`): an opening forced on the frame. The page's own `window` is never read here. */
const window = { __forceO: null as number | null };
let innerWidth = 0, innerHeight = 0;
const performance = { now: (): number => (E ? E.env.now() : 0) };
function setTimeout(fn: () => unknown, ms: number): void {
  if (E) E.env.timeout(() => { fn(); }, ms);
}
function requestAnimationFrame(fn: (now: number) => void): void {
  if (!E) return;
  const e = E;
  e.frameId = e.env.raf((now) => {
    e.frameId = null;
    if (E !== e) return;
    before();
    fn(now);
    after();
  });
}
/** No rng: the prototype's `Math.random` is a xorshift seeded by the scene and the run (the same run draws the same dark). */
let seed = 2463534242;
function rnd01(): number {
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5; seed >>>= 0;
  return seed / 4294967296;
}
const Math: typeof globalThis.Math = Object.create(globalThis.Math, { random: { value: rnd01 } });

const $ = (s: string): HTMLElement => {
  const e = E!;
  if (s === '#mirror') return e.mirror;
  if (s === '#reply') return e.env.reply;
  if (s === '#cmd') return e.env.input;
  if (s === '#inputWrap') return inputLine(e.env);
  return e.els[s]!;
};
const inputLine = (env: InstrumentEnv): HTMLElement => env.input.closest<HTMLElement>('.alius-input-line') ?? env.input.parentElement ?? env.input;

/* ---------- the prototype's helpers ---------- */
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeIn = (t: number) => Math.pow(clamp(t, 0, 1), 2);
const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

/* ---------- the engine's numbers (TUNING.physics.breath: the air of the instrument is the gauge's share, so they are scaled by its capacity) ---------- */
let BEAT = TUNING.physics.beatMs;
let DRAIN = TUNING.physics.breath.drain, CAUGHT = TUNING.physics.breath.caught, MISSED = TUNING.physics.breath.missed, CRUEL_MISSED = TUNING.physics.breath.cruelMissed;
let SEAL_RELIEF: Record<string, number> = { ...TUNING.physics.breath.seal };
/** How much light a seal lets through between windows (the prototype's own reading). */
export const REST_OPEN: Record<string, number> = { leaky: 0.08, firm: 0.03, tight: 0 };

interface StyleRow { windowMs: number; falseShare: number; seal: string; count: number; jitter: number; cue: string; overDelay: number; snappy?: boolean; again?: number; tease?: number }
/**
 * Her style's way with the count and the window (breath.html `STYLES`, as it is). The instrument reads `count`, `jitter`, `cue`, `snappy`,
 * `tease` and `overDelay` from it; `windowMs`, `falseShare` and `seal` are the engine's (the plan's opening and the run's seal win).
 */
export const STYLES: Record<string, StyleRow> = {
  neutral:      { windowMs: 600, falseShare: 0,    seal: 'firm',  count: 520, jitter: 70, cue: 'honest', overDelay: 1 },
  affectionate: { windowMs: 700, falseShare: 0,    seal: 'leaky', count: 650, jitter: 60, cue: 'honest', overDelay: 0 },
  ritual:       { windowMs: 500, falseShare: 0,    seal: 'firm',  count: 600, jitter: 0, cue: 'count', overDelay: 1 },
  playful:      { windowMs: 450, falseShare: 0.35, seal: 'firm',  count: 460, jitter: 120, again: 0.5, tease: 0.4, cue: 'false', overDelay: 1 },
  cruel:        { windowMs: 250, falseShare: 0,    seal: 'tight', count: 230, jitter: 25, snappy: true, cue: 'none', overDelay: 2 },
  possessive:   { windowMs: 450, falseShare: 0,    seal: 'tight', count: 480, jitter: 60, cue: 'honest', overDelay: 1 },
};
/** The prototype's row for a style it has no row of: by how she gives her cues (`TUNING.physics.style[].cues`). */
const ROW_BY_CUES: Record<string, string> = { honest: 'neutral', count: 'ritual', false: 'playful', none: 'cruel' };

/* ---------- settings (breath.html `S`: the approved defaults; the shape, the style, the face point and the still form are the run's and the scene's) ---------- */
type Side = 'bottom' | 'top' | 'left' | 'right';
const S = {
  cue: 'style', over: true, edge: 'flesh', view: 'auto', kind: 'slit' as ShapeKind, side: { lift: 'bottom' as Side, slide: 'auto' as 'auto' | 'left' | 'right', wedge: 'right' as 'left' | 'right' },
  angle: -14, style: 'neutral', wmul: TUNING.physics.breath.wmul, drain: 1, len: 10, bplay: false,
  sound: true, vol: 0.7, face: { x: 0.5, y: 0.21 }, zoom: 2.6, debug: false, reduced: false, readable: false,
};
/** What the prototype read from its panel and its scheduler, here from the run: her style's row, the run's seal, the opening being played. */
interface Wiring {
  run: PhysicsRun | null;
  row: string;
  /** Her delay in beats after a noticed strain: the engine's own (`overDelayOf`), so the two never disagree. */
  overDelay: number;
  seal: Seal;
  widthMs: number;
  lines: Lines;
  seg: { n: number; startedAt: number; clock0: number; beats: number; endMs: number; flushed: boolean } | null;
  running: boolean;
  strain: { beat: number; amount: number; sent: boolean } | null;
  via: 'mouse' | 'key';
  spriteBox: { x: number; y: number; h: number } | null;
  leaky: boolean;
}
type Lines = Record<string, string[]>;
const NO_LINES: Lines = { now: [], fake: [], early: [], greedy: [], low: [], released: [], entry: [], hold: [], tap: [], good: [], poor: [], stop: [], wake: [], again: [] };
const R: Wiring = { run: null, row: 'neutral', overDelay: 1, seal: 'tight', widthMs: 600, lines: NO_LINES, seg: null, running: false, strain: null, via: 'key', spriteBox: null, leaky: false };
const st = () => ({ ...STYLES[R.row]!, seal: R.seal as string, windowMs: R.widthMs, overDelay: R.overDelay });
const L = () => R.lines;

/* ---------- audio: everything synthesised ---------- */
interface Audio {
  ctx: AudioContext | null; master?: GainNode; world?: BiquadFilterNode; body?: GainNode; white?: AudioBuffer; brown?: AudioBuffer; roomLP?: BiquadFilterNode; roomG?: GainNode; nextBeat?: number;
}
let A: Audio = { ctx: null };
function audioInit() {
  if (A.ctx) return;
  const ctx = E?.env.samples?.ctx() ?? null;
  const out = E?.env.samples?.bus('body') ?? null;
  if (!ctx || !out) return;
  A.ctx = ctx;
  A.master = ctx.createGain(); A.master.gain.value = S.sound ? S.vol : 0; A.master.connect(out);
  A.world = ctx.createBiquadFilter(); A.world.type = 'lowpass'; A.world.frequency.value = 16000; A.world.Q.value = 0.4; A.world.connect(A.master); // the world: goes dull with the air
  A.body = ctx.createGain(); A.body.gain.value = 1; A.body.connect(A.master); // the body (heart, breath): never dull
  const mk = (sec: number, fill: (d: Float32Array) => void) => { const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate); fill(b.getChannelData(0)); return b; };
  A.white = mk(2, (d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
  A.brown = mk(4, (d) => { let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } });
  // the room: brown noise and a faint hum, muffled while she covers
  const room = ctx.createBufferSource(); room.buffer = A.brown; room.loop = true;
  A.roomLP = ctx.createBiquadFilter(); A.roomLP.type = 'lowpass'; A.roomLP.frequency.value = 600;
  A.roomG = ctx.createGain(); A.roomG.gain.value = 0.05;
  room.connect(A.roomLP); A.roomLP.connect(A.roomG); A.roomG.connect(A.world); room.start();
  const hum = ctx.createOscillator(); hum.frequency.value = 50; const humG = ctx.createGain(); humG.gain.value = 0.012; hum.connect(humG); humG.connect(A.roomLP); hum.start();
  A.nextBeat = ctx.currentTime + 0.3;
}
interface NoiseOpts { at?: number; dur?: number; type?: BiquadFilterType; f?: number; f2?: number; q?: number; gain?: number; attack?: number; dest?: AudioNode; buf?: AudioBuffer }
function noise({ at = 0, dur = 0.2, type = 'bandpass', f = 1000, f2, q = 1, gain = 0.1, attack = 0.01, dest = A.world!, buf = A.white! }: NoiseOpts) {
  if (!A.ctx) return;
  const ctx = A.ctx, t = ctx.currentTime + at;
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl); fl.connect(g); g.connect(dest); src.start(t, Math.random()); src.stop(t + dur + 0.05);
}
function thump(at: number, gain: number, f0 = 55, dest = A.body!) {
  if (!A.ctx) return;
  const ctx = A.ctx, t = at;
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + 0.14);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.25);
}
const SFX = {
  pen: () => { const n = randInt(3, 5); for (let i = 0; i < n; i++) noise({ at: i * 0.05 + Math.random() * 0.02, dur: 0.035 + Math.random() * 0.03, f: 2600 + Math.random() * 1800, q: 3, gain: 0.05 }); },
  rustle: (g = 0.09) => noise({ dur: 0.38, f: 900, f2: 1400, q: 0.7, gain: g, attack: 0.08 }),
  snap: () => { if (!A.ctx) return; thump(A.ctx.currentTime, 0.55, 80, A.world); noise({ dur: 0.12, f: 700, q: 0.8, gain: 0.12, attack: 0.005 }); },
  muffled: () => { noise({ dur: 0.18, type: 'lowpass', f: 380, gain: 0.32, attack: 0.01, dest: A.body }); },
  sip: () => noise({ dur: 0.2, f: 1300, f2: 1900, q: 1.2, gain: 0.12, attack: 0.03, dest: A.body }),
  gasp: () => noise({ dur: 1.1, f: 480, f2: 2300, q: 0.9, gain: 0.32, attack: 0.06, dest: A.body }),
  tap: () => { noise({ dur: 0.03, type: 'highpass', f: 1800, gain: 0.22, attack: 0.002, dest: A.body }); noise({ at: 0.13, dur: 0.03, type: 'highpass', f: 1800, gain: 0.2, attack: 0.002, dest: A.body }); },
};
const inhale: { on: boolean; src: AudioBufferSourceNode | null; g: GainNode | null; fl: BiquadFilterNode | null } = { on: false, src: null, g: null, fl: null };
function inhaleStart() {
  if (!A.ctx || inhale.on) return;
  const ctx = A.ctx, t = ctx.currentTime;
  inhale.src = ctx.createBufferSource(); inhale.src.buffer = A.white!; inhale.src.loop = true;
  inhale.fl = ctx.createBiquadFilter(); inhale.fl.type = 'bandpass'; inhale.fl.Q.value = 0.9; inhale.fl.frequency.setValueAtTime(650, t); inhale.fl.frequency.exponentialRampToValueAtTime(1900, t + 0.9);
  inhale.g = ctx.createGain(); inhale.g.gain.setValueAtTime(0.0001, t); inhale.g.gain.exponentialRampToValueAtTime(0.26, t + 0.12);
  inhale.src.connect(inhale.fl); inhale.fl.connect(inhale.g); inhale.g.connect(A.body!); inhale.src.start(t, Math.random());
  inhale.on = true;
}
function inhaleStop() {
  if (!inhale.on) return;
  const t = A.ctx!.currentTime;
  inhale.g!.gain.cancelScheduledValues(t); inhale.g!.gain.setValueAtTime(inhale.g!.gain.value, t); inhale.g!.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  inhale.src!.stop(t + 0.2); inhale.on = false;
}
/* the heart: lub-dub on the body bus, its rate from the air; the visual pulse reads the same beats */
const heart = { bpm: 64, lastBeatMs: -1e9, stopped: false };
function heartTick(nowMs: number) {
  if (!A.ctx || heart.stopped) return;
  const ctx = A.ctx;
  while (A.nextBeat! < ctx.currentTime + 0.12) {
    const period = 60 / heart.bpm;
    const loud = lerp(0.35, 0.95, smooth(80, 10, G.air));
    thump(A.nextBeat!, loud, 52); thump(A.nextBeat! + Math.max(0.2, period * 0.3), loud * 0.6, 46);
    const delay = (A.nextBeat! - ctx.currentTime) * 1000;
    setTimeout(() => { heart.lastBeatMs = performance.now(); }, Math.max(0, delay));
    A.nextBeat! += period;
  }
}

/* ---------- state ---------- */
interface Win { t0: number; rise: number; W: number; fall: number; false: boolean; credit: number; snapAt: number; snapO?: number; beat?: number; reported?: boolean }
interface Glob {
  phase: string; phaseT: number; clock: number; air: number; cam: number; darkA: number; exitO: number; win: Win | null; queue: Array<{ at: number; fn: () => void; tag: string }>;
  windowsOpened: number; caught: number; missed: number; falseTaken: number; streak: number; lowest: number; breathing: boolean; pressedThisPress: boolean; pressT: number;
  squeeze: number; squeezeT: number; saidLow: boolean; slideDir: number; slideY: number; overMs: number; strainCd: number; overholds: number; punishedThisPress: boolean;
  sp: SoftSpring[]; focus: [number, number]; lip: [number, number]; text: [number, number]; align: string; blackT: number; reason: string; ended: boolean; lastAgain: boolean;
  forceHonest: boolean; shake: number;
}
let G: Glob;
function fresh(): Glob {
  return { phase: 'idle', phaseT: 0, clock: 0, air: 100, cam: 0, darkA: 0, exitO: 0, win: null, queue: [], windowsOpened: 0, caught: 0, missed: 0, falseTaken: 0,
    streak: 0, lowest: 100, breathing: false, pressedThisPress: false, pressT: 0, squeeze: 0, squeezeT: -1, saidLow: false, slideDir: -1, slideY: 0,
    overMs: 0, strainCd: 0, overholds: 0, punishedThisPress: false, sp: [{ L: 0, v: 0, k: 58 }, { L: 0, v: 0, k: 74 }],
    focus: [0.5, 0.45], lip: [0.5, 0.5], text: [0.6, 0.4], align: 'left', blackT: 0, reason: '', ended: false, lastAgain: false, forceHonest: false, shake: 0 };
}
G = fresh();

/* ---------- her hand ---------- */
let countEl: HTMLElement | null = null;
function say(text: string | undefined, kind = 'line', opt: { at?: [number, number]; align?: string; life?: number } = {}) {
  if (!text) return;
  const hand = $('#hand');
  if (kind === 'count' || kind === 'now') { if (countEl) fade(countEl); }
  const el = document.createElement('div');
  el.className = `her-line ${kind}`;
  el.textContent = text;
  const speed = S.style === 'cruel' ? 22 : S.style === 'ritual' ? 45 : 36;
  el.style.setProperty('--write', `${Math.max(140, text.length * speed)}ms`);
  el.style.setProperty('--steps', String(Math.max(4, text.length * 2)));
  const at = opt.at ?? G.text, align = opt.align ?? G.align;
  const x = clamp(at[0], 0.03, 0.97) * innerWidth, y = clamp(at[1], 0.07, 0.8) * innerHeight;
  const jitter = kind === 'count' ? (Math.random() * 2 - 1) * 14 : 0;
  if (align === 'right') { el.classList.add('right'); el.style.right = `${innerWidth - x}px`; } else el.style.left = `${x + jitter}px`;
  el.style.top = `${y + (kind === 'line' ? 52 : 0) + jitter * 0.5}px`;
  el.style.transform = `rotate(${(Math.random() * 7 - 4).toFixed(1)}deg)`;
  hand.appendChild(el);
  SFX.pen();
  if (kind === 'count' || kind === 'now') countEl = el;
  const life = opt.life ?? (kind === 'count' ? 900 : kind === 'now' ? 1200 : kind === 'big' ? 1e9 : 2600);
  if (life < 1e8) setTimeout(() => fade(el), life);
  return el;
}
function fade(el: HTMLElement) { el.classList.add('gone'); setTimeout(() => el.remove(), 600); if (el === countEl) countEl = null; }
function clearHand() { $('#hand').replaceChildren(); countEl = null; }

/* ---------- the rhythm: her openings on the plan's beats, her count before each ---------- */
function push(at: number, fn: () => void, tag = 'win') { G.queue.push({ at, fn, tag }); G.queue.sort((a, b) => a.at - b.at); }
function cancelWindows() { G.queue = G.queue.filter((e) => e.tag !== 'win'); }
const cueMode = () => (S.cue === 'style' ? st().cue : S.cue);
function scheduleWindow(at: number, opts: { false?: true; widthMs?: number; quiet?: boolean; silent?: boolean; after?: number } = {}) {
  const s = st(), c = s.count, j = () => (Math.random() * 2 - 1) * s.jitter;
  const isFalse = opts.false === true;
  const mode = cueMode();
  // only a counting holder counts; a playful one sometimes teases with a count; the rest give only "now." (or nothing): react fast
  const counts = mode === 'count' || (mode === 'false' && Math.random() < (s.tease ?? 0));
  if (!opts.silent && counts) {
    const word = (when: number, w: string) => { if (when >= G.clock) push(when, () => say(w, 'count')); };
    // playful's tease: a count that ends in "again." and opens nothing; the planned opening comes 200 ms + 1–2 beats after it, on its own
    // beat (the prototype's new window), so the tease is played ahead of it, and only where the gap before it holds the whole count
    if (s.again && !G.lastAgain && Math.random() < s.again) {
      const T = at - 200 - randInt(1, 2) * BEAT;
      if (T - 3 * c - s.jitter >= (opts.after ?? G.clock)) {
        G.lastAgain = true;
        word(T - 3 * c + j(), 'three…');
        word(T - 2 * c + j(), 'two…');
        push(T - c + j(), () => say(pick(L().again), 'count'));
        push(T + 200, () => scheduleWindow(G.clock + (at - T - 200), { ...opts, after: G.clock })); // her delay moves it with the rest
        return;
      }
    }
    word(at - 3 * c + j(), 'three…');
    word(at - 2 * c + j(), 'two…');
    word(at - c + j(), 'one…');
  }
  G.lastAgain = false;
  // the opening's beat is its entry's time (moved with it by her delay); one that came due during the entry plays as the loop begins, as a late
  // event of the prototype's queue does, and is reported on its own beat; a window still open is closed first
  const fire = () => { const b = beatAt(e.at); if (G.win) closeWindow(); R.widthMs = opts.widthMs ?? s.windowMs; refreshLines(b); openWindow(isFalse, mode === 'none' || opts.quiet === true); G.win!.beat = b; };
  push(at, fire);
  const e = G.queue.find((x) => x.fn === fire)!;
}
function openWindow(isFalse: boolean, quiet = false) {
  const s = st();
  G.forceHonest = false;
  G.windowsOpened += 1;
  if (S.side.slide === 'auto') G.slideDir *= -1; else G.slideDir = S.side.slide === 'left' ? -1 : 1;
  G.slideY = Math.random() * 2 - 1;
  G.win = { t0: G.clock, rise: s.snappy ? 110 : 260, W: s.windowMs * S.wmul, fall: s.snappy ? 140 : 320, false: isFalse, credit: 0, snapAt: -1 };
  if (!quiet) say(pick(L().now), 'now');
  SFX.rustle();
}
function windowOpenness() {
  const w = G.win; if (!w) return 0;
  const tt = G.clock - w.t0;
  if (w.snapAt >= 0) return Math.max(0, w.snapO! * (1 - (G.clock - w.snapAt) / 90));
  if (tt < w.rise) return easeOut(tt / w.rise);
  if (tt < w.rise + w.W) return 1;
  return 1 - easeIn((tt - w.rise - w.W) / w.fall);
}
function windowDone() {
  const w = G.win; if (!w) return false;
  if (w.snapAt >= 0) return G.clock - w.snapAt > 90;
  return G.clock - w.t0 > w.rise + w.W + w.fall;
}
function closeWindow() {
  const w = G.win!; G.win = null;
  reportWindow(w);
  if (!w.false) {
    if (w.credit >= 10) { G.caught += 1; G.streak += 1; }
    else if (w.credit > 0) { G.caught += 1; G.streak = 0; }
    else { G.missed += 1; G.streak = 0; G.air = Math.min(100, G.air + (S.style === 'cruel' ? CRUEL_MISSED : MISSED)); SFX.sip(); }
    if (Math.random() < 0.3) setTimeout(() => G.phase === 'loop' && say(pick(L().hold), 'line'), 350);
  }
}

/* ---------- phases ---------- */
function begin() {
  audioInit();
  if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume();
  clearHand();
  G = fresh();
  G.phase = 'entry';
  heart.stopped = false; heart.bpm = 64;
  $('#black').style.opacity = 0 as unknown as string;
  setTimeout(() => G.phase === 'entry' && say(pick(L().entry), 'line', { life: 2600 }), 700);
  if (A.ctx) { A.world!.frequency.cancelScheduledValues(A.ctx.currentTime); A.world!.frequency.setTargetAtTime(16000, A.ctx.currentTime, 0.2); A.roomG!.gain.setTargetAtTime(0.05, A.ctx.currentTime, 0.3); }
}
function exit(reason: string) {
  if (G.phase !== 'loop' && G.phase !== 'entry') return;
  G.phase = 'exit'; G.phaseT = 0; G.reason = reason; G.win = null; G.queue = [];
  inhaleStop(); G.breathing = false;
  if (countEl) fade(countEl);
  SFX.gasp(); SFX.rustle(0.14);
  const l = L();
  const ratio = G.caught / Math.max(1, G.caught + G.missed + G.falseTaken);
  const line = reason === 'stop' ? pick(l.stop) : reason === 'released' ? pick(l.released) : ratio >= 0.7 ? pick(l.good) : pick(l.poor);
  setTimeout(() => { clearHand(); say(line, 'big', { at: [0.56, 0.2], align: 'left' }); }, 700);
}
function blackout() {
  G.phase = 'blackout'; G.phaseT = 0; G.win = null; G.queue = [];
  inhaleStop(); G.breathing = false; clearHand();
  if (A.ctx) { A.world!.frequency.cancelScheduledValues(A.ctx.currentTime); A.world!.frequency.setTargetAtTime(90, A.ctx.currentTime, 0.8); A.roomG!.gain.setTargetAtTime(0, A.ctx.currentTime, 1); }
}
function wake() {
  heart.stopped = false; heart.bpm = 110; if (A.ctx) A.nextBeat = A.ctx.currentTime + 0.2;
  SFX.gasp();
  if (A.ctx) { A.world!.frequency.setTargetAtTime(16000, A.ctx.currentTime, 0.6); A.roomG!.gain.setTargetAtTime(0.06, A.ctx.currentTime, 0.6); }
  G.phase = 'done'; G.phaseT = 0; G.air = 100; G.reason = 'blackout';
  say(pick(L().wake), 'big', { at: [0.56, 0.2], align: 'left' });
}
function tap() {
  if (G.phase !== 'loop') return;
  SFX.tap();
  const t = $('#tap'); t.classList.remove('knock'); void t.offsetWidth; t.classList.add('knock');
  const kept = !tapReleases();
  E!.env.tap?.();
  if (!kept) return; // she lets go: her answer is the exit's line (`released`), never a refusal
  const l = L();
  switch (S.style) {
    case 'affectionate': say(pick(l.tap), 'line'); break;
    case 'neutral': case 'ritual': say(pick(l.tap), 'line'); break;
    case 'playful': say(pick(l.tap), 'line'); break;
    case 'cruel': say(pick(l.tap), 'line'); press(1500); break;
    default: say(pick(l.tap), 'line');
  }
}
function press(ms = 500) { G.pressT = Math.max(G.pressT, ms); G.shake = 1; for (const x of G.sp) x.v -= 1.6; if (S.kind === 'squeeze') { G.squeezeT = 0; SFX.snap(); } }

/* ---------- the loop ---------- */
function updateLoop(dt: number) {
  G.clock += dt;
  while (G.queue.length && G.queue[0].at <= G.clock) G.queue.shift()!.fn();
  const s = st();
  G.air -= ((DRAIN - SEAL_RELIEF[s.seal]) / BEAT) * dt * S.drain;
  const ow = windowOpenness();
  if (G.breathing) {
    if (G.win && ow > 0.45 && G.win.snapAt < 0) {
      if (G.win.false) {
        G.win.snapAt = G.clock; G.win.snapO = ow; G.falseTaken += 1; G.streak = 0; G.shake = 1;
        SFX.snap(); say(pick(L().fake ?? L().early), 'line'); inhaleStop();
      } else {
        G.overMs = 0;
        const gain = Math.min(CAUGHT - G.win.credit, (CAUGHT / G.win.W) * dt);
        G.win.credit += gain; G.air = Math.min(100, G.air + gain);
        if (gain > 0) { inhaleStart(); letters.restore(dt); } else inhaleStop();
      }
    } else {
      inhaleStop();
      G.overMs += dt;
      if (!G.pressedThisPress) { G.pressedThisPress = true; SFX.muffled(); press(350); }
      if (S.over && G.overMs > 150) {
        strained(0.5);
        // straining against her: the air goes twice as fast, the dark presses, a muffled strain now and then
        G.air -= ((DRAIN - SEAL_RELIEF[s.seal]) / BEAT) * dt * S.drain;
        G.pressT = Math.max(G.pressT, 200);
        G.strainCd -= dt; if (G.strainCd <= 0) { G.strainCd = 520; SFX.muffled(); G.shake = Math.max(G.shake, 0.6); }
        if (!G.punishedThisPress && G.overMs > 450) {
          // she notices: a line, a tighter press, and the next window comes later
          G.punishedThisPress = true; G.overholds += 1; G.streak = 0;
          strained(1);
          say(pick(L().greedy), 'line'); press(1200);
          const delay = (s.overDelay ?? 1) * BEAT;
          if (delay) G.queue.forEach((e) => { if (e.tag === 'win') e.at += delay; });
          for (const x of G.sp) x.v -= 2.5;
        }
      } else if (!S.over && G.overMs > 450 && !G.punishedThisPress) { G.punishedThisPress = true; if (Math.random() < 0.45) say(pick(L().early), 'line'); }
    }
  } else inhaleStop();
  if (G.win && windowDone()) closeWindow();
  G.pressT = Math.max(0, G.pressT - dt);
  G.lowest = Math.min(G.lowest, G.air);
  if (G.air < 30 && !G.saidLow) { G.saidLow = true; say(pick(L().low), 'line'); }
  if (G.air <= 0) G.air = 0;
}

function frame(now: number) {
  const dt = Math.min(120, now - (frame.last ?? now)); frame.last = now; // the rhythm keeps real time even on a slow frame
  G.phaseT += dt;
  switch (G.phase) {
    case 'entry': {
      const p = G.phaseT / 1800;
      G.cam = easeOut(p); G.darkA = easeOut(p * 1.2);
      if (p >= 1) { G.phase = 'loop'; G.clock = 0; }
      break;
    }
    case 'loop': if (R.running) updateLoop(dt); break;
    case 'exit': {
      const p = G.phaseT / 1700;
      G.exitO = easeIn(p) * 2.4; G.darkA = 1 - smooth(0.35, 1, p); G.cam = 1 - easeOut(clamp(p * 1.1, 0, 1));
      G.air = lerp(G.air, 100, clamp(dt / 600, 0, 1));
      if (p >= 1) { G.exitO = 0; G.darkA = 0; G.cam = 0; }
      break;
    }
    case 'blackout': {
      const p = G.phaseT;
      G.darkA = 1; G.air = Math.max(0, G.air - dt * 0.01);
      $('#black').style.opacity = String(smooth(300, 1800, p));
      heart.bpm = lerp(heart.bpm, 38, clamp(dt / 1500, 0, 1));
      if (p > 4600) heart.stopped = true;
      if (p > 5200) wake();
      break;
    }
    case 'done': {
      G.cam = 0; G.darkA = 0;
      $('#black').style.opacity = String(Math.max(0, 1 - G.phaseT / 900) * Number($('#black').style.opacity || 0));
      break;
    }
  }
  // the squeeze: snaps shut in 70 ms, holds, eases off
  if (G.squeezeT >= 0) { G.squeezeT += dt; const t = G.squeezeT; G.squeeze = t < 70 ? t / 70 : t < 650 ? 1 : Math.max(0, 1 - (t - 650) / 500); if (t > 1150) G.squeezeT = -1; }
  else G.squeeze = 0;
  G.shake = Math.max(0, G.shake - dt / 300);
  if (G.phase !== 'blackout' && G.phase !== 'idle') {
    const f = smooth(85, 5, G.air);
    heart.bpm = lerp(heart.bpm, lerp(64, 150, f), clamp(dt / 900, 0, 1));
  }
  heartTick(now);
  render(now, dt);
  requestAnimationFrame(frame);
}
frame.last = undefined as number | undefined;

/* ---------- the dark: one low-res canvas, upscaled (soft edges for free) ---------- */
let darkC: HTMLCanvasElement, dctx: CanvasRenderingContext2D, airC: HTMLCanvasElement, actx: CanvasRenderingContext2D, glowC: HTMLCanvasElement, gctx: CanvasRenderingContext2D;
function sizeCanvases() {
  const w = Math.ceil(innerWidth / DS), h = Math.ceil(innerHeight / DS);
  for (const c of [darkC, airC, glowC]) { c.width = w; c.height = h; }
}

const styleCache = new Map<string, string>();
function setStyle(sel: string, prop: string, v: string) { if (S.readable && prop === 'filter') v = v.replace(/blur\([^)]*\)/g, 'blur(0px)'); const k = sel + prop; if (styleCache.get(k) === v) return; styleCache.set(k, v); ($(sel).style as unknown as Record<string, string>)[prop] = v; }
function render(now: number, dt: number) {
  const W = airC.width, H = airC.height, t = now / 1000;
  const s = st();
  const reduced = S.reduced;
  const sway = reduced ? 0 : Math.sin((t * Math.PI * 2) / 3.1); // her own breathing, about 3 s
  const sway2 = reduced ? 0 : Math.sin((t * Math.PI * 2) / 4.7 + 1.3);
  const rest = G.pressT > 0 ? 0 : REST_OPEN[s.seal];
  const ow = G.phase === 'loop' ? windowOpenness() : 0;
  let o = Math.max(rest, ow) + G.exitO;
  if (G.phase === 'blackout') o = 0;
  if (window.__forceO != null) o = window.__forceO;
  const target = window.__forceO != null ? Math.min(1, window.__forceO) : clamp(Math.max(rest, ow), 0, 1) - (G.pressT > 0 ? 0.08 : 0);
  const h = Math.min(dt, 40) / 1000;
  G.sp.forEach((x, i) => {
    const tgt = target + (reduced ? 0 : (i ? -1 : 1) * sway2 * 0.05); // she shifts her weight from side to side
    const a = x.k! * (tgt - x.L) - 7.5 * x.v; x.v += a * h; x.L += x.v * h;
  });
  if (G.phase === 'exit' || G.phase === 'idle' || G.phase === 'done') G.sp.forEach((x) => { x.L = Math.min(1, o); x.v = 0; });
  const shapeState = { sway, sway2, squeeze: G.squeeze, slideDir: G.slideDir, slideY: G.slideY, sp: G.sp, t };

  // 1. the air
  actx.setTransform(1, 0, 0, 1, 0, 0); actx.clearRect(0, 0, W, H); actx.fillStyle = '#fff';
  const out = SHAPES[S.kind](actx, W, H, o, shapeState);
  // 2. the glow at the lips: warm, pink for a false window
  const pinkish = G.win?.false ? 1 : 0;
  const flesh = S.edge === 'flesh';
  gctx.clearRect(0, 0, W, H); gctx.filter = `blur(${Math.round((flesh ? 5 : 3) + Math.min(o, 1.5) * (flesh ? 8 : 5))}px)`; gctx.drawImage(airC, 0, 0); gctx.filter = 'none';
  gctx.globalCompositeOperation = 'source-in';
  gctx.fillStyle = pinkish ? 'rgb(255,110,170)' : flesh ? 'rgb(226,78,52)' : 'rgb(255,168,104)'; gctx.fillRect(0, 0, W, H);
  gctx.globalCompositeOperation = 'source-over';
  // 3. the dark, lit at its lips, the air cut out
  dctx.globalCompositeOperation = 'source-over'; dctx.clearRect(0, 0, W, H);
  dctx.globalAlpha = G.darkA; dctx.fillStyle = 'rgb(6,4,8)'; dctx.fillRect(0, 0, W, H);
  // a faint volume to the masses: lighter near the lips, black far from them
  dctx.globalCompositeOperation = 'source-atop';
  dctx.globalAlpha = G.darkA * clamp(0.18 + Math.min(o, 1) * 0.75, 0, 0.95);
  dctx.drawImage(glowC, 0, 0);
  dctx.globalAlpha = G.darkA * clamp(0.1 + Math.min(o, 1) * 0.35, 0, 0.5);
  dctx.filter = 'blur(10px)'; dctx.drawImage(glowC, 0, 0); dctx.filter = 'none';
  dctx.globalCompositeOperation = 'destination-out'; dctx.globalAlpha = 1;
  dctx.filter = 'blur(1px)'; dctx.drawImage(airC, 0, 0); dctx.filter = 'none';
  dctx.globalCompositeOperation = 'source-over'; dctx.globalAlpha = 1;
  // the press shakes the dark a little
  const sh = reduced ? 0 : G.shake * 6;
  darkC.style.transform = sh ? `translate(${(Math.random() * 2 - 1) * sh}px, ${(Math.random() * 2 - 1) * sh}px)` : '';

  if (G.phase === 'loop' || G.phase === 'entry') {
    G.focus = [lerp(G.focus[0], out.focus[0], clamp(dt / 500, 0, 1)), lerp(G.focus[1], out.focus[1], clamp(dt / 500, 0, 1))];
    G.lip = out.lip; G.text = out.text; G.align = out.align ?? 'left';
  }

  // the camera on her: close and from below; she lifts when the window opens
  const img = $('#her') as HTMLImageElement;
  if (img.naturalWidth) {
    const vw = innerWidth, vh = innerHeight, nw = img.naturalWidth, nh = img.naturalHeight;
    const box = R.spriteBox;
    const Hn = box ? box.h : vh * 0.96, Sn = Hn / nh, Wn = nw * Sn;
    const faceN = box ? [box.x + S.face.x * Wn, box.y + S.face.y * Hn] : [vw * 0.5 - Wn / 2 + S.face.x * Wn, vh - Hn + vh * 0.05 + S.face.y * Hn];
    const Sc = (vh * S.zoom) / nh;
    const liftPx = (Math.min(o, 1) * 0.05 + (reduced ? 0 : sway * 0.004)) * vh;
    const faceC = [G.focus[0] * vw, G.focus[1] * vh - liftPx];
    const k = G.cam;
    const sc = lerp(Sn, Sc * (1 - Math.min(o, 1) * 0.04), k) * (1 + (reduced ? 0 : sway * 0.006 * k));
    const fx = lerp(faceN[0], faceC[0], k), fy = lerp(faceN[1], faceC[1], k);
    img.style.transform = `translate(${fx}px, ${fy}px) rotateX(${(9 * k).toFixed(2)}deg) scale(${sc}) translate(${-S.face.x * nw}px, ${-S.face.y * nh}px)`;
    $('#cam').style.perspectiveOrigin = `${fx}px ${fy}px`;
  }
  {
    const view = S.view === 'auto' ? VIEW_OF[S.kind] ?? 'ceiling' : S.view;
    const ceil = view === 'ceiling';
    setStyle('#her', 'opacity', view !== 'her' ? (1 - smooth(0.15, 0.7, G.cam)).toFixed(3) : '1');
    setStyle('#ceiling', 'opacity', ceil ? smooth(0.2, 0.85, G.cam).toFixed(3) : '0');
    // lying on the back: the ceiling close above, out of focus, drifting with her rhythm and rising a little as she lifts
    const lift = Math.min(o, 1);
    setStyle('#ceiling', 'transform', `translate(${((G.focus[0] - 0.5) * -4 + (S.reduced ? 0 : sway * 0.3)).toFixed(2)}%, ${((G.focus[1] - 0.5) * -4).toFixed(2)}%) scale(${(1.12 - lift * 0.05).toFixed(3)})`);
    setStyle('#ceiling', 'filter', `blur(${(4 - lift * 2).toFixed(1)}px) brightness(${(0.5 + lift * 0.32).toFixed(2)}) sepia(${(0.25 * lift).toFixed(2)})`);
  }
  // the air as vision
  const f = G.phase === 'idle' || G.phase === 'done' ? 0 : smooth(70, 6, G.air);
  const pulse = reduced ? 0.5 : Math.exp(-(now - heart.lastBeatMs) / 170);
  const blur = f * 3.2 + G.cam * 0.4;
  setStyle('#world', 'filter', `blur(${(Math.round(blur * 4) / 4).toFixed(2)}px) saturate(${(1 - f * 0.7).toFixed(1)}) brightness(${(0.82 + Math.min(o, 1) * 0.25 - f * 0.2).toFixed(2)})`);
  setStyle('#world', 'transform', reduced || f < 0.2 ? '' : `scale(${(1 + pulse * f * 0.006).toFixed(4)})`);
  setStyle('#backdrop', 'filter', `blur(${Math.round(G.cam * 6)}px) brightness(${(1 - G.cam * 0.35).toFixed(2)})`);
  setStyle('#backdrop', 'transform', `scale(${(1 + G.cam * 0.35).toFixed(3)})`);
  const fxp = G.focus[0] * 100, fyp = G.focus[1] * 100;
  $('#warm').style.background = `radial-gradient(circle at ${fxp}% ${fyp}%, rgba(${pinkish ? '255,120,180' : '255,170,110'},${(Math.min(o, 1) * 0.55 * G.cam).toFixed(2)}) 0%, rgba(0,0,0,0) 45%)`;
  const diag = Math.hypot(innerWidth, innerHeight);
  const r0 = lerp(diag * 0.95, diag * 0.05, f), r1 = r0 + lerp(diag * 0.5, diag * 0.16, f);
  const red = f * (0.25 + 0.55 * pulse);
  $('#tunnel').style.background = f <= 0.001 ? 'none'
    : `radial-gradient(circle at ${fxp}% ${fyp}%, rgba(0,0,0,0) ${r0}px, rgba(0,0,0,${(0.55 + f * 0.4).toFixed(2)}) ${r1}px), radial-gradient(circle at ${fxp}% ${fyp}%, rgba(0,0,0,0) ${(r0 + (r1 - r0) * 0.55).toFixed(0)}px, rgba(150,8,20,${red.toFixed(2)}) ${r1.toFixed(0)}px, rgba(150,8,20,${(red * 0.5).toFixed(2)}) ${(r1 * 1.35).toFixed(0)}px, rgba(0,0,0,0) ${(r1 * 1.9).toFixed(0)}px)`;
  $('#grain').style.opacity = String((0.04 + 0.08 * G.darkA).toFixed(3));
  if (!reduced && Math.random() < 0.6) $('#grain').style.backgroundPosition = `${randInt(0, 255)}px ${randInt(0, 255)}px`;
  // the sound
  if (A.ctx) {
    const ct = A.ctx.currentTime;
    if (G.phase !== 'blackout') A.world!.frequency.setTargetAtTime(16000 * Math.pow(380 / 16000, f), ct, 0.15);
    A.roomLP!.frequency.setTargetAtTime(240 + 2600 * Math.min(o, 1) + (1 - G.darkA) * 4000, ct, 0.08);
    if (G.phase !== 'blackout') A.roomG!.gain.setTargetAtTime(0.04 + 0.1 * Math.min(o, 1), ct, 0.1);
    A.master!.gain.setTargetAtTime(S.sound ? S.vol : 0, ct, 0.05);
  }
  // the tap mark sits at the lip
  const live = G.phase === 'loop' || G.phase === 'entry';
  const tapEl = $('#tap');
  tapEl.style.opacity = live ? '0.85' : '0';
  tapEl.style.pointerEvents = live ? 'auto' : 'none';
  tapEl.style.left = `${clamp(G.lip[0], 0.03, 0.97) * innerWidth}px`; tapEl.style.top = `${clamp(G.lip[1], 0.05, 0.92) * innerHeight}px`;
  $('#reply').style.opacity = live ? '0.38' : '1';
  letters.tick(dt, live ? G.air : 100);
  const iw = lerp(Math.min(720, innerWidth * 0.6), Math.max(260, innerWidth * 0.2), smooth(78, 8, live ? G.air : 100));
  $('#inputWrap').style.width = `${iw}px`;
  $('#inputWrap').style.borderColor = live && G.air < 30 ? `rgba(220,60,70,${(0.3 + 0.5 * pulse).toFixed(2)})` : '';
}

/** The view behind the dark by kind when the contact names none (breath.html `VIEW_OF`; the contact's own `occlusion.view` wins). */
export const VIEW_OF: Record<string, string> = { slide: 'room' };

/* ---------- the input: it narrows with the air; letters typed short of air fade and blur ---------- */
const letters = {
  chars: [] as Array<{ ch: string; c: number }>, prev: '', acc: 0,
  sync() {
    const v = ($('#cmd') as HTMLInputElement).value, p = this.prev;
    let a = 0; while (a < v.length && a < p.length && v[a] === p[a]) a++;
    let b = 0; while (b < v.length - a && b < p.length - a && v[v.length - 1 - b] === p[p.length - 1 - b]) b++;
    const start = 1 - smooth(70, 10, G.air) * 0.35;
    const added = [...v.slice(a, v.length - b)].map((ch) => ({ ch, c: G.phase === 'loop' ? start : 1 }));
    this.chars.splice(a, p.length - a - b, ...added);
    this.prev = v; this.draw();
  },
  restore(dt: number) { for (const x of this.chars) x.c = Math.min(1, x.c + dt / 900); },
  tick(dt: number, air: number) {
    const k = Math.pow(Math.max(0, (60 - air) / 60), 1.4) * 0.42;
    if (k > 0) for (const x of this.chars) x.c = Math.max(0, x.c - (k * dt) / 1000);
    this.acc += dt; if (this.acc > 80) { this.acc = 0; this.draw(); }
  },
  draw() {
    const m = $('#mirror');
    m.replaceChildren(...this.chars.map((x) => {
      const sp = document.createElement('span'); sp.textContent = x.ch;
      const blur = S.readable ? 0 : (1 - x.c) * 5;
      sp.style.color = blur < 0.3 ? `rgba(236,232,242,${x.c})` : 'transparent';
      sp.style.textShadow = blur < 0.3 ? 'none' : `0 0 ${blur.toFixed(1)}px rgba(236,232,242,${(x.c * 0.95).toFixed(2)})`;
      return sp;
    }));
    m.scrollLeft = $('#cmd').scrollLeft;
  },
  send() {
    if (!this.chars.length) return null;
    return this.chars.map((x) => (x.c < 0.22 ? (x.ch === ' ' ? ' ' : '·') : x.ch)).join('');
  },
};

/* ---------- input ---------- */
const typing = (t: EventTarget | null) => t && (/^(input|textarea|select)$/i.test((t as HTMLElement).tagName) || (t as HTMLElement).isContentEditable);
function breatheDown() { G.breathing = true; G.pressedThisPress = false; G.punishedThisPress = false; G.overMs = 0; }
function breatheUp() { G.breathing = false; G.pressedThisPress = false; G.overMs = 0; inhaleStop(); }

/* =====================================================================================================================================
 * The wiring (no prototype code below): the plan's openings, the reports, the lines, the mount and its end.
 * ===================================================================================================================================== */

/**
 * Whether the engine lets go at this tap (P15a's `physicsSignal`, review N1): a `signal` holder at once, a `limit` holder from her second tap,
 * a `blackout` holder never. Her tap line is said only when she keeps the commander, so her words never contradict the engine's answer.
 */
function tapReleases(): boolean {
  if (!E || !R.run) return false;
  const holds = effectiveHoldsUntil(E.env.state(), E.env.registries, R.run.holderId);
  return holds === 'signal' || (holds === 'limit' && R.run.taps > 0);
}
/** The beat of the running segment at a time of the loop's clock (an opening fires on its beat's start: moved by her delay, it is on a later beat). */
function beatAt(at: number): number {
  const seg = R.seg;
  if (!seg) return 0;
  return clamp(Math.round((at - seg.clock0) / BEAT), 0, seg.beats - 1);
}
/** The beat the loop's clock is in now. */
function beatNow(): number {
  const seg = R.seg;
  if (!seg) return 0;
  return clamp(Math.floor((G.clock - seg.clock0) / BEAT), 0, seg.beats - 1);
}
/** Her lines for a beat, from her cue pool (her style's words from the model, else the registry's), read while the staging is live. */
function refreshLines(beat: number): void {
  if (!E) return;
  const env = E.env;
  const own = (k: string): string[] => [...voiceLines(env.registries, `breath.${k}` as VoiceKind, S.style)];
  // her own words from the model for that moment, when it worded them (never the cue pool's fallback narration), else her line of §7
  const voiced = (k: string, cue: CueKind): string[] => { const v = env.staging.voiced?.(cue, beat) ?? null; return v ? [v] : own(k); };
  const lines: Lines = {};
  for (const k of BREATH_KINDS) lines[k] = own(k);
  for (const [k, cue] of VOICED) lines[k] = voiced(k, cue);
  // the prototype's playful-only kinds are absent for the others (its `L().fake ?? L().early` reads that)
  if (lines.fake!.length === 0) lines.fake = undefined as unknown as string[];
  if (lines.again!.length === 0) lines.again = undefined as unknown as string[];
  R.lines = lines;
}
/** Breath's line kinds (breath.html `LINES`, card-voice.md §7) and the cue kinds whose model words may take a line's place. */
const BREATH_KINDS = ['greedy', 'entry', 'now', 'hold', 'early', 'tap', 'low', 'good', 'poor', 'released', 'stop', 'wake', 'fake', 'again'] as const;
const VOICED: ReadonlyArray<[string, CueKind]> = [['now', 'window_open'], ['fake', 'window_false'], ['greedy', 'greedy'], ['low', 'warning']];
/** Sends an input of this segment to the engine (once), exempt from the typing lapse when the mouse made it (ruling O). */
function report(i: SegmentInput): void {
  if (!E || !R.seg) return;
  E.env.staging.input(i, { pointer: R.via === 'mouse' });
}
/** An opening comes to its end (or the segment does): what was taken of it. A false one reached for is a breath the engine counts as taken. */
function reportWindow(w: Win): void {
  if (w.reported || w.beat === undefined) return;
  w.reported = true;
  if (w.false) { if (w.snapAt >= 0) report({ beat: w.beat, kind: 'breathe' }); return; }
  if (w.credit > 0) report({ beat: w.beat, kind: 'breathe', amount: Math.round((w.credit / CAUGHT) * 1000) / 1000 });
}
/** Holding on past her opening: 0.5 once held past 150 ms (sent when the press ends), 1 at once when she notices. */
function strained(amount: number): void {
  if (amount >= 1) {
    if (R.strain?.sent) return;
    const beat = beatNow();
    R.strain = { beat, amount: 1, sent: true };
    refreshLines(beat);
    report({ beat, kind: 'strain', amount: 1 });
  } else if (!R.strain) R.strain = { beat: beatNow(), amount: 0.5, sent: false };
}
function flushStrain(): void {
  const s = R.strain;
  if (s && !s.sent) { s.sent = true; report({ beat: s.beat, kind: 'strain', amount: s.amount }); }
}

/** A running segment the loop has not scheduled yet: its openings (as the noticed strains moved them: none yet), placed on the loop's clock. */
function schedulePlan(run: PhysicsRun, ck: { startedAt: number | null; now: number }): void {
  const plan = run.segment.plan!;
  cancelWindows();
  if (G.win && R.seg) G.win = null; // the last segment's opening is over with it (flushed before its end: never credited to this one)
  const phys = E!.env.registries.contactPhysics.get(run.physicsId);
  const endMs = Number(phys?.segmentSeconds ?? 20) * 1000;
  R.seg = { n: run.segment.n, startedAt: ck.startedAt!, clock0: G.clock - (ck.now - ck.startedAt!), beats: plan.beats.length, endMs, flushed: false };
  R.strain = null; // a press across the boundary strains in this segment afresh (and is reported in it)
  G.air = clamp((run.gauge / run.capacity) * 100, 0, 100); // the engine's air (it resolved the last segment)
  refreshLines(0);
  let after = G.clock; // a tease never starts before the previous opening is over
  for (const o of effectiveOpenings(plan, [], styleKey())) {
    const at = R.seg.clock0 + o.beat * BEAT; // one already due (it fell in the entry) opens at once, on its own beat (review I3)
    const cue = plan.beats[o.beat]?.cue;
    scheduleWindow(at, { ...(o.false ? { false: true as const } : {}), widthMs: o.widthMs, quiet: cue !== 'window_open' && cue !== 'window_false', after });
    const r = st();
    after = Math.max(after, at + (r.snappy ? 110 : 260) + o.widthMs * S.wmul + (r.snappy ? 140 : 320));
  }
}
const styleKey = (): string => (E && R.run ? leadStyle(physicsStyleOf(E.env.state(), R.run.holderId, E.env.registries)).key : 'neutral');

/** Each frame before the prototype's: the size, the still form, the sound, her sprite, the letters, the segment. */
function before(): void {
  const e = E!;
  const r = e.env.root.getBoundingClientRect();
  const w = e.env.root.clientWidth || r.width || globalThis.innerWidth || 0, h = e.env.root.clientHeight || r.height || globalThis.innerHeight || 0;
  if (w !== innerWidth || h !== innerHeight) { innerWidth = w; innerHeight = h; sizeCanvases(); }
  S.reduced = e.env.reduced;
  S.readable = e.env.readable;
  e.box.toggleAttribute('data-reduced', S.reduced);
  e.box.toggleAttribute('data-readable', S.readable);
  e.mirror.toggleAttribute('data-readable', S.readable);
  if (!A.ctx) audioInit();
  // her sprite: the scene's picture, drawn by the instrument's camera (the scene's own <img> is never moved)
  const scene = R.run ? e.env.spriteOf(R.run.holderId) : null;
  const her = e.els['#her'] as HTMLImageElement;
  const src = scene?.getAttribute('src') ?? '';
  if (src !== '' && her.getAttribute('src') !== src) her.setAttribute('src', src);
  // drawn at its natural size, as the prototype's <img> (the camera's scale is against it; a picture with no size of its own, an SVG with only
  // a viewBox, would otherwise take its box's)
  if (her.naturalWidth && her.style.width !== `${her.naturalWidth}px`) { her.style.width = `${her.naturalWidth}px`; her.style.height = `${her.naturalHeight}px`; }
  const sb = scene?.getBoundingClientRect();
  R.spriteBox = sb && sb.height > 0 ? { x: sb.left - r.left, y: sb.top - r.top, h: sb.height } : null;
  // the room behind her (the scene's backdrop, which may come after the mount: its picture loads on its own)
  const bg = e.env.layers.backdrop.style.backgroundImage;
  const mine = e.els['#backdrop']!;
  if (bg !== mine.style.backgroundImage) mine.style.backgroundImage = bg;
  const input = e.env.input as HTMLInputElement;
  if (input.value !== letters.prev) letters.sync();
  placeMirror(e);
  // the segment: scheduled when it runs, flushed just before it ends
  const run = R.run;
  const ck = e.env.staging.clock();
  R.running = run !== null && run.segment.state === 'running' && run.segment.plan !== undefined && ck.startedAt !== null;
  if (G.phase === 'loop' && R.running && (R.seg === null || R.seg.n !== run!.segment.n || R.seg.startedAt !== ck.startedAt)) schedulePlan(run!, ck);
  if (R.running && R.seg && !R.seg.flushed && G.clock - R.seg.clock0 >= R.seg.endMs - 300) {
    R.seg.flushed = true;
    if (G.win) reportWindow(G.win);
    flushStrain();
  }
  const gap = e.els['#gap']!;
  const showGap = R.leaky && G.phase === 'loop';
  gap.style.opacity = showGap ? '0.85' : '0';
  gap.style.pointerEvents = showGap ? 'auto' : 'none';
  gap.style.left = `${clamp(G.lip[0], 0.03, 0.97) * innerWidth}px`;
  gap.style.top = `${clamp(G.lip[1], 0.05, 0.92) * innerHeight + 44}px`;
}
/** After the prototype's frame: the reply's and the line's styles it wrote just now are recorded as the claims' (styleClaims' contract). */
function after(): void {
  const e = E;
  if (!e) return;
  // a line written since the last frame is moved inside the frame before it is painted (layout is read only then: review N4)
  const last = e.els['#hand']!.lastElementChild;
  if (last !== lastLine) { lastLine = last; keepInFrame(e); }
  noteWrites(e.claims[0]!, ['opacity']);
  noteWrites(e.claims[1]!, ['width', 'border-color']);
}
let lastLine: Element | null = null;
/** Her lines stay inside the frame (ruling Q): a line that would run past an edge is moved back in (one wider than 40 % wraps, by its CSS). */
function keepInFrame(e: BreathEls): void {
  for (const el of e.els['#hand']!.children as HTMLCollectionOf<HTMLElement>) {
    const w = el.offsetWidth, x = el.offsetLeft;
    if (!w) continue;
    if (x + w > innerWidth - 8) {
      if (el.style.right) el.style.right = '8px';
      else el.style.left = `${Math.max(8, innerWidth - 8 - w)}px`;
    } else if (x < 8) {
      if (el.style.right) el.style.right = `${Math.max(8, innerWidth - 8 - w)}px`;
      else el.style.left = '8px';
    }
  }
}
/** The letters lie over the input (the prototype's `#mirror` over `#cmd`): same box, same font, same scroll. */
function placeMirror(e: BreathEls): void {
  const input = e.env.input;
  const m = e.mirror;
  m.style.left = `${input.offsetLeft}px`;
  m.style.top = `${input.offsetTop}px`;
  m.style.width = `${input.offsetWidth}px`;
  m.style.height = `${input.offsetHeight}px`;
}

/** The grain: one noise tile, generated here (breath.html's own, with the instrument's hashed noise). */
function grainTile(): string | null {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  let x: CanvasRenderingContext2D | null = null;
  try { x = c.getContext('2d'); } catch { x = null; }
  if (!x) return null;
  const d = x.createImageData(256, 256);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() < 0.5 ? 0 : Math.floor(Math.random() * 255); d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0);
  try { return c.toDataURL(); } catch { return null; }
}

function build(env: InstrumentEnv): BreathEls {
  const box = document.createElement('div');
  box.className = 'alius-breath';
  box.setAttribute('aria-hidden', 'true'); // as the effects layer it lives in (stage/layers.ts): T is TAP's key
  const els: Record<string, HTMLElement> = {};
  const div = (id: string, parent: HTMLElement): HTMLElement => { const el = document.createElement('div'); el.className = `alius-breath-${id}`; els[`#${id}`] = el; parent.append(el); return el; };
  const world = div('world', box);
  div('backdrop', world);
  div('ceiling', world);
  const cam = div('cam', world);
  const her = document.createElement('img');
  her.className = 'alius-breath-her';
  her.alt = '';
  her.draggable = false;
  els['#her'] = her;
  cam.append(her);
  div('warm', world);
  const dark = lowres(box);
  dark.canvas.classList.add('alius-breath-dark');
  els['#dark'] = dark.canvas;
  div('grain', box);
  div('tunnel', box);
  div('hand', box);
  const tapEl = div('tap', box);
  for (const [k, v] of Object.entries(analyzeNative('glossary:tap_signal'))) tapEl.setAttribute(k, v);
  tapEl.setAttribute('role', 'button');
  tapEl.setAttribute('aria-label', 'Tap');
  const gapEl = div('gap', box);
  for (const [k, v] of Object.entries(analyzeNative('glossary:gap_breath'))) gapEl.setAttribute(k, v);
  gapEl.setAttribute('role', 'button');
  gapEl.setAttribute('aria-label', 'Breathe through the gap');
  div('black', box);
  env.layers.effects.append(box);
  // the offscreen canvases of the air and the glow (sized with the dark)
  const off = (): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } => { const l = lowres(document.createElement('div')); l.canvas.remove(); return l; };
  const air = off(), glow = off();
  darkC = dark.canvas; dctx = dark.ctx; airC = air.canvas; actx = air.ctx; glowC = glow.canvas; gctx = glow.ctx;
  const mirror = document.createElement('div');
  mirror.className = 'alius-breath-mirror';
  mirror.setAttribute('aria-hidden', 'true');
  inputLine(env).append(mirror);
  env.input.dataset.breathLetters = '';
  const claims = [claimStyles(env.reply, ['opacity']), claimStyles(inputLine(env), ['width', 'border-color'])];
  return { env, box, els, mirror, claims, frameId: null };
}

/** Binds the run: her style's row, her lines, the shape of the dark and what is behind it, the engine's numbers on the run's scale. */
function bind(env: InstrumentEnv, run: PhysicsRun): void {
  const state: CampaignState = env.state();
  const reg: Registries = env.registries;
  seed = (fnv1a(`${state.scene?.id ?? ''}|${run.id}|breath`) >>> 0) || 2463534242;
  const lead = leadStyle(physicsStyleOf(state, run.holderId, reg));
  S.style = lead.key;
  R.row = lead.key in STYLES ? lead.key : ROW_BY_CUES[lead.cues] ?? 'neutral';
  R.overDelay = overDelayOf(lead.key);
  R.run = run;
  R.seal = run.seal ?? 'tight';
  R.leaky = run.seal === 'leaky';
  R.widthMs = STYLES[R.row]!.windowMs;
  R.seg = null; R.running = false; R.strain = null; R.via = 'key'; R.spriteBox = null;
  // the engine's numbers, as a share of the gauge (a capacity above 100 makes every step smaller)
  const k = 100 / Math.max(1, run.capacity);
  BEAT = TUNING.physics.beatMs;
  DRAIN = TUNING.physics.breath.drain * k; CAUGHT = TUNING.physics.breath.caught * k; MISSED = TUNING.physics.breath.missed * k; CRUEL_MISSED = TUNING.physics.breath.cruelMissed * k;
  SEAL_RELIEF = Object.fromEntries(Object.entries(TUNING.physics.breath.seal).map(([s, v]) => [s, v * k]));
  // the shape of the dark: the contact's occlusion (read by field), the prototype's defaults for what it does not name
  const occ = occlusionOf(run.sourceKind === 'contact' ? reg.blockingContacts.get(run.sourceId) : undefined);
  S.kind = occ.kind;
  S.angle = occ.angle ?? -14;
  S.side = { lift: 'bottom', slide: occ.kind === 'slide' && occ.side ? occ.side : 'auto', wedge: occ.kind === 'wedge' && occ.side ? occ.side : 'right' };
  if (occ.kind === 'lift' && occ.side) S.side.lift = occ.side;
  darkS.angle = S.angle;
  darkS.side = { ...S.side };
  S.view = occ.view === 'her_face' ? 'her' : occ.view;
  // her face point (the sprite's sidecar), the ceiling over the commander (P10c), the grain
  S.face = env.art.face(run.holderId) ?? { x: 0.5, y: 0.21 };
  // the owner as the scene's backdrop reads it (the first present participant: sceneScreen's `present(s)[0]`)
  const owner = state.scene?.participants.find((id) => state.squad.some((u) => u.id === id)) ?? null;
  const ceilings = state.scene ? ceilingOf(state, reg, state.scene.locationId, owner) : [];
  const ceilEl = E!.els['#ceiling']!;
  if (S.view === 'ceiling') {
    // each candidate in turn (P10c: a file that fails falls to the next); none, or none loads: the room beside, never a blank frame
    const tryAt = (i: number): void => {
      if (E?.env !== env || S.view !== 'ceiling') return;
      const c = ceilings[i];
      if (!c) { S.view = 'room'; return; }
      const url = env.assetUrl ? env.assetUrl(c.file) : c.file;
      ceilEl.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;
      if (typeof Image === 'function') {
        const probe = new Image();
        probe.onerror = () => tryAt(i + 1);
        probe.src = url;
      }
    };
    tryAt(0);
  }
  const grain = grainTile();
  if (grain) E!.els['#grain']!.style.backgroundImage = `url(${grain})`;
  const look = env.her(run.holderId);
  E!.box.style.setProperty('--alius-her', look.accent);
  if (look.hand !== '') E!.box.style.setProperty('--alius-font-hand', `"${look.hand}", var(--alius-font-type)`);
  E!.box.style.setProperty('--alius-breath-hand-scale', String(look.handScale || 1));
}

/** The listeners of the prototype's page, on the scene: Space and the left button breathe, T taps, the letters follow the input. */
function listen(env: InstrumentEnv): void {
  const control = (t: EventTarget | null): boolean => t instanceof Element && t.closest('button, a, [role="button"], select, [data-action]') !== null;
  env.listen(document, 'keydown', ((e: KeyboardEvent) => {
    if (typing(e.target) || control(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ') { e.preventDefault(); if (!e.repeat) { R.via = 'key'; R.strain = null; breatheDown(); } }
    else if (e.key === 't' || e.key === 'T') tap();
  }) as EventListener);
  env.listen(document, 'keyup', ((e: KeyboardEvent) => { if (e.key === ' ' && !typing(e.target)) { flushStrain(); breatheUp(); } }) as EventListener);
  env.listen(env.root, 'mousedown', ((e: MouseEvent) => {
    if (e.button !== 0) return;
    const t = e.target as Element | null;
    if (!t || (t !== env.layers.frame && !env.layers.frame.contains(t))) return; // only the frame: never a control of the scene's UI
    e.preventDefault(); // the field keeps the focus: the mouse breathes while typing
    R.via = 'mouse'; R.strain = null;
    breatheDown();
  }) as EventListener);
  env.listen(document, 'mouseup', ((e: MouseEvent) => { if (e.button === 0 && G.breathing) { flushStrain(); breatheUp(); } }) as EventListener);
  env.listen(E!.els['#tap']!, 'mousedown', ((e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); tap(); }) as EventListener);
  env.listen(E!.els['#gap']!, 'mousedown', ((e: MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (G.phase !== 'loop' || !R.leaky || !R.running) return;
    R.via = 'mouse';
    report({ beat: beatNow(), kind: 'gap_breath' });
    SFX.sip();
  }) as EventListener);
  env.listen(env.input, 'input', () => letters.sync());
  env.listen(env.input, 'scroll', () => letters.draw());
  // a line sent short of air carries its lost letters as dots (read before the scene's own Enter sends it)
  env.listen(env.root, 'keydown', ((e: KeyboardEvent) => {
    if (e.key !== 'Enter' || e.target !== env.input) return;
    const sent = letters.send();
    const input = env.input as HTMLInputElement;
    if (sent !== null && sent !== input.value) { input.value = sent; letters.sync(); }
  }) as EventListener, true);
}

function stopBreath(): void {
  const e = E;
  if (!e) return;
  if (e.frameId !== null) e.env.cancelRaf(e.frameId);
  try { inhaleStop(); } catch { /* the context is gone */ }
  inhale.on = false; inhale.src = null; inhale.g = null; inhale.fl = null;
  try { A.master?.disconnect(); } catch { /* not connected */ }
  A = { ctx: null };
  heart.bpm = 64; heart.lastBeatMs = -1e9; heart.stopped = false;
  for (const c of e.claims) releaseClaim(c);
  e.box.remove();
  e.mirror.remove();
  delete e.env.input.dataset.breathLetters;
  darkS.angle = -14;
  darkS.side = { lift: 'bottom', slide: 'auto', wedge: 'right' };
  styleCache.clear();
  letters.chars = []; letters.prev = ''; letters.acc = 0;
  countEl = null;
  lastLine = null;
  window.__forceO = null;
  R.run = null; R.seg = null; R.running = false; R.strain = null; R.lines = NO_LINES;
  G = fresh();
  E = null;
}

/** How long the end plays: the exit (the dark leaves, her line at 700 ms, the prototype's summary at 2300 ms), the blackout and the wake. */
export const EXIT_MS = 2600;
export const BLACKOUT_MS = 5200 + 1200;

/** Starts the instrument on a run (the host's `start`). */
export function startBreath(env: InstrumentEnv, run: PhysicsRun): InstrumentRun {
  stopBreath();
  E = build(env);
  innerWidth = 0; innerHeight = 0;
  bind(env, run);
  listen(env);
  frame.last = undefined;
  refreshLines(0);
  begin();
  requestAnimationFrame(frame);
  const mine = E;
  return {
    update(next: PhysicsRun) {
      if (E !== mine) return;
      R.run = next;
      R.seal = next.seal ?? R.seal;
      R.leaky = next.seal === 'leaky';
    },
    finish(end: PhysicsEnd): number {
      if (E !== mine) return 0;
      refreshLines(beatNow()); // her lines of §7 (the staging is dead now: no model words)
      if (end.result === 'blackout') { blackout(); return BLACKOUT_MS; }
      if (G.phase !== 'loop' && G.phase !== 'entry') return 0;
      exit(end.result === 'checked' ? 'done' : 'released');
      return EXIT_MS;
    },
    stop() {
      if (E === mine) stopBreath();
    },
  };
}

/**
 * The breathing physics of a run: a timing interaction with a capacity gauge (read by field), alone or with a second that takes no input of
 * the commander's (`passive`). A second that does (a `hold`'s weight, a `decision`'s mouth breath: breath.html has neither) is left to the
 * card until its own instrument draws the pair.
 */
export function breathMatches(run: PhysicsRun, _state: CampaignState, reg: Registries): boolean {
  const p = reg.contactPhysics.get(run.physicsId);
  if (p?.interaction !== 'timing' || (p.gauge as { kind?: string } | undefined)?.kind !== 'capacity') return false;
  if (!run.second) return true;
  return reg.contactPhysics.get(run.second.physicsId)?.interaction === 'passive';
}

registerInstrument({ id: 'breath', matches: breathMatches, start: startBreath });

/** Tests and the shots only: the prototype's state and hooks (its `window.__G`, `__openWindow`, `__forceO`). */
export const _breath = {
  get G(): Glob { return G; },
  get R(): Wiring { return R; },
  get S(): typeof S { return S; },
  forceO(o: number | null): void { window.__forceO = o; },
  windowOpenness, windowDone, openWindow, closeWindow, updateLoop, letters, say, begin, exit, blackout, wake, scheduleWindow, tap, fresh,
  setG(g: Glob): void { G = g; },
  setWidth(ms: number): void { R.widthMs = ms; },
  /** Tests: the seed of the module's `Math.random` (a xorshift, no rng draw). */
  seed(n: number): void { seed = n >>> 0 || 1; },
  /** The shots: the frame clock starts again (a fake clock installed after the page began). */
  resetClock(): void { frame.last = undefined; },
  /** The shots: her opening now, with her lines of this beat (the prototype's `__openWindow`). */
  open(isFalse: boolean): void { refreshLines(beatNow()); openWindow(isFalse); },
  /** The shots: her lines of this beat, read now (the plan's own windows read them as they open). */
  lines(): void { refreshLines(beatNow()); },
};
