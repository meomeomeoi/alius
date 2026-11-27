/**
 * P10e-e Task 30: gulp (`docs/prototypes/gulp.html`, normative; README lines 142–174; its `fidelity.json` checks the port against it). She
 * stands over the commander: the view looks up at her over the ceiling; the mouth is a warm tide at the bottom of the screen that her stream
 * fills (heard, never drawn). Space swallows (held: gulp after gulp; no air while it lasts), Shift breathes through the nose (with a full
 * mouth it may turn into a cough, which spills), the right button or T taps her. Air is the frame's edges closing in and the heart; the reflex
 * warms the edges and, at full, is a cough. What overflows or is coughed out is spilled; at her flow's end, by her style, the commander
 * cleans it with the tongue on the floor art, and every bit licked fills the mouth again; her check is a band of light over the floor.
 *
 * The functions are the prototype's, copied (types added). The wiring, declared in `fidelity.json`:
 * - her flow is the engine's plan (`PlannedBeat.flow`, R32: her surges, their warnings, playful's feints, her pauses, placed in wall time
 *   through `staging.clock()`; her wander between them is the prototype's own, continuous): `planFlow` (the prototype's scheduler) reads it; her volume is the engine's (the flow ends
 *   when the run chains to its cleaning or is released: `endFlow`, as the engine answered); her answers to a tap stay the instrument's (R32);
 * - each beat of a running segment is reported once, as it ends: `swallow` with the mouth its swallows took, `spill` with the mouthfuls spilled
 *   (`part` `cough` / `overflow` for a beat that began one, `more` for an overflow running on: the prototype's count of spills); in the cleaning one `wipe` a beat with the share of the puddle licked up (× the cleaning's start); what is done
 *   while the run is held is carried by the next segment's first beat (Ruling AD); the segment the engine cut short at her volume is ended when
 *   its beats are played, the cleaning's when her check begins (at 10 % left or after 40 s);
 * - the tap is P15a's `physics/signal`; her answer (her line and her pause, slower, hold, faster or surge) plays only when the engine keeps
 *   the commander (Ruling Q: never a refusal when she lets go);
 * - her lines are `cardVoice` `gulp.<kind>` by her style (Rulings Q, R: verbatim; cold's own; a style gulp.html lacks reads neutral's); her
 *   `surge` line may be the model's own word for the cue `surge`; the taste lines are the prototype's `TASTE` (stand-ins for P15a's stimulus
 *   layer: no stimulus kind tastes of this yet);
 * - her picture is the art chain `over_explicit` (explicit content on, read through the content gate) → `over` (its sidecar's fit) → her
 *   scene sprite from below; the ceiling and the floor are P10c's surfaces of the scene, else the scene's backdrop (art never gates anything);
 * - the sounds are the extension's own files (`assets/sounds/gulp/`, the commander's breath `breath-in-out.mp3`), decoded by the sample layer;
 * - `performance`, `setTimeout`, `requestAnimationFrame`, `innerWidth` / `innerHeight`, `document` (for the canvases) and `Math.random` are
 *   this module's own (the frame clock, the mount's timers and frames, the scene's size, a canvas that never fails, a xorshift seeded by the
 *   scene and the run: no rng draw).
 * Not ported (README: prototype only): the panel, the start overlay, the summary card (its elements are detached), the debug readout, the `__`
 * hooks (`_gulp` is the tests' and the shots').
 */
import type { Registries } from '../../../../content/types';
import { ceilingOf, floorOf } from '../../../../engine/backdrops';
import { fnv1a } from '../../../../engine/hub';
import { isGulpPhysics } from '../../../../engine/physics/gulp';
import type { PhysicsRun, PlannedBeat, SegmentInput } from '../../../../engine/physics/state';
import { effectiveHoldsUntil, leadStyle, physicsMannerOf, physicsStyleOf, segmentSecondsOf } from '../../../../engine/physics/style';
import { GULP_KINDS } from '../../../../engine/physics/gulp';
import { bendRow, type RowAxes } from '../kit/bendRow';
import type { CampaignState } from '../../../../engine/state/types';
import { GULP_STYLES, TUNING } from '../../../../engine/tuning';
import { explicitArtAllowed } from '../../art';
import { voiceLines, type VoiceKind } from '../../cards/voice';
import { registerInstrument } from '../host';
import { clamp, lerp, smooth } from '../kit/math';
import type { InstrumentEnv, InstrumentRun, PhysicsEnd } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

/* ---------- the wiring: the mount, the clock, the timers, the frames and the size of the scene ---------- */
interface GulpEls { env: InstrumentEnv; box: HTMLElement; els: Record<string, HTMLElement>; frameId: number | null }
let E: GulpEls | null = null;
export let innerWidth = 0, innerHeight = 0;
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
    before(now);
    fn(now);
  });
}
/** No rng: the prototype's `Math.random` is a xorshift seeded by the scene and the run (`reseed`). */
let seed = 2463534242;
function rnd01(): number {
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5; seed >>>= 0;
  return seed / 4294967296;
}
const reseed = (n: number): void => { seed = n >>> 0 || 2463534242; };
// eslint-disable-next-line @typescript-eslint/naming-convention
const Math: typeof globalThis.Math = Object.create(globalThis.Math, { random: { value: rnd01 } });
/** A canvas whose context never fails (a page with no canvas draws nothing): the instrument still runs. */
function safeCanvas(): HTMLCanvasElement {
  const c = globalThis.document.createElement('canvas');
  const real = c.getContext.bind(c) as (k: string) => Any;
  let ctx: Any = null;
  (c as Any).getContext = (k: string) => {
    if (ctx) return ctx;
    let r: Any = null;
    try { r = real(k); } catch { r = null; }
    const noop = (): void => {};
    ctx = r ?? new Proxy({ canvas: c }, { get: (t: Any, p) => (p in t ? t[p] : p === 'createImageData' || p === 'getImageData' ? (_a: number, _b: number, w?: number, h?: number) => ({ data: new Uint8ClampedArray(Math.max(0, (w ?? _a) * (h ?? _b) * 4) || 0) }) : p === 'createRadialGradient' || p === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop), set: () => true });
    return ctx;
  };
  return c;
}
/** The prototype's `document.createElement`: its canvases are safe ones; any other element is the page's. */
const document = { createElement: (tag: string): Any => (tag === 'canvas' ? safeCanvas() : globalThis.document.createElement(tag)) };
/** A detached element for the prototype's own page parts (its reply line, its summary card, its debug readout). */
const DETACHED = new Map<string, HTMLElement>();
const $ = (s: string): Any => {
  const e = E!;
  if (e.els[s]) return e.els[s];
  let d = DETACHED.get(s);
  if (!d) { d = globalThis.document.createElement('div'); DETACHED.set(s, d); }
  return d;
};
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/* ---------- the instrument's numbers ---------- */
export const GULP_MS = 700;        // a swallow takes this long; no air while it lasts
export const GULP_TAKES = 0.4;     // a swallow takes this share of a full mouth
export const BREATH_MS = 520;      // a breath through the nose
export const BREATH_GIVES = 0.42;  // air a breath gives
export const AIR_DRAIN = 0.045;    // air a second while the mouth holds anything
export const AIR_GULP = 0.11;      // air a swallow costs
export const COUGH_FROM = 0.55;    // a breath with the mouth fuller than this may become a cough (chance rises to 0.7 at full)
export const REFLEX_SURGE = 0.55;  // a flow faster than this (mouths a second) builds the reflex; so do gulps without a breath (from the fourth)
/** Her flow by style (gulp.html `STYLES`): the engine's own table (`TUNING.physics.gulpFlow.styles`), read by her lead style. */
const STYLES = GULP_STYLES as Record<string, Any>;
/** Her lines (`cardVoice` `gulp.*` by her style, `refreshLines`) in the prototype's `LINES` shape. */
export const LINE_KINDS = ['entry', 'surge', 'tapped', 'spill', 'cough', 'done', 'clean', 'cleaned', 'missed', 'stop'] as const;
export let LINES: Record<string, Record<string, string[]>> = { neutral: {} };
/* what the commander notices of the taste (stand-ins for P15a's stimulus layer: her state, the day) */
export const TASTE = ['Warm, and salt.', 'Bitter at the back of the tongue.', 'Warmer than expected.', 'Sharp; it catches in the throat.'];

/* ---------- settings ---------- */
const S: Any = { streamS: 'mug', swallowS: 'swallows', style: 'neutral', explicit: false, overH: 1.04, overX: 0.5, overSink: 0, len: Infinity, flowK: 1, sound: true, vol: 0.7, debug: false, reduced: false };
const ST = () => bendRow(STYLES[S.style], R.manner, GULP_KINDS);
const L = () => LINES[S.style];

/* ---------- audio ---------- */
let A: Any = { ctx: null, buf: {} };
/** The recorded sounds (gulp.html `SAMPLE_URLS`), the extension's own files: the sample layer decodes them. */
export const SAMPLE_URLS: Readonly<Record<string, string>> = {
  mug_soft: 'assets/sounds/gulp/mug_soft.ogg', mug_strong: 'assets/sounds/gulp/mug_strong.ogg',
  swallow1: 'assets/sounds/gulp/swallow1.ogg', swallow2: 'assets/sounds/gulp/swallow2.ogg', swallow3: 'assets/sounds/gulp/swallow3.ogg',
  swallow4: 'assets/sounds/gulp/swallow4.ogg', swallow5: 'assets/sounds/gulp/swallow5.ogg',
  splash1: 'assets/sounds/gulp/splash_10.ogg', splash2: 'assets/sounds/gulp/splash_09.ogg', splash3: 'assets/sounds/gulp/splash_06.ogg',
  breath: 'assets/sounds/breath-in-out.mp3',
  cloth1: 'assets/sounds/ha/cloth1.ogg', cloth2: 'assets/sounds/ha/cloth2.ogg', cloth3: 'assets/sounds/ha/cloth3.ogg',
};
export const GROUPS = { cloth: ['cloth1', 'cloth2', 'cloth3'], swallows: ['swallow1', 'swallow2', 'swallow3', 'swallow4', 'swallow5'], splash: ['splash1', 'splash2', 'splash3'] } as Record<string, string[]>;
function audioInit() {
  if (A.ctx) return;
  const ctx = E?.env.samples?.ctx() ?? null;
  const out = E?.env.samples?.bus('body') ?? null;
  if (!ctx || !out) return;
  A.ctx = ctx;
  A.master = ctx.createGain(); A.master.gain.value = S.sound ? S.vol : 0; A.master.connect(out);
  A.world = ctx.createBiquadFilter(); A.world.type = 'lowpass'; A.world.frequency.value = 9000; A.world.connect(A.master);
  A.body = ctx.createGain(); A.body.connect(A.master);
  const mk = (sec: number, fill: (d: Float32Array) => void) => { const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate); fill(b.getChannelData(0)); return b; };
  A.white = mk(2, (d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
  A.brown = mk(4, (d) => { let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } });
  const room = ctx.createBufferSource(); room.buffer = A.brown; room.loop = true;
  const rl = ctx.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 650; const rg = ctx.createGain(); rg.gain.value = 0.05;
  room.connect(rl); rl.connect(rg); rg.connect(A.world); room.start();
}
function loadSamples() {
  const samples = E?.env.samples;
  if (!samples) return;
  A.buf = new Proxy({} as Record<string, AudioBuffer | null>, { get: (_t, k) => (typeof k === 'string' && SAMPLE_URLS[k] ? samples.buffer(SAMPLE_URLS[k]!) : null) });
  void samples.preload(Object.values(SAMPLE_URLS));
}
function play(id: string, { g = 0.5, rate = 1, lp = 0, dest, at = 0, offset = 0, dur }: Any = {}) {
  const key = GROUPS[id] ? pick(GROUPS[id]) : id;
  if (!A.ctx || !A.buf[key]) return null;
  const ctx = A.ctx, t = ctx.currentTime + at;
  const src = ctx.createBufferSource(); src.buffer = A.buf[key]; src.playbackRate.value = rate;
  const gn = ctx.createGain(); gn.gain.value = g; src.connect(gn); let n = gn;
  if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; n.connect(f); n = f; }
  n.connect(dest ?? A.world);
  if (dur) { gn.gain.setValueAtTime(g, t + dur / rate - 0.04); gn.gain.linearRampToValueAtTime(0.0001, t + dur / rate); }
  src.start(t, offset, dur ? dur + 0.05 : undefined); return src;
}
function noise({ at = 0, dur = 0.2, type = 'bandpass', f = 1000, f2, q = 1, gain = 0.1, attack = 0.01, dest = A.world }: Any) {
  if (!A.ctx) return;
  const ctx = A.ctx, t = ctx.currentTime + at;
  const src = ctx.createBufferSource(); src.buffer = A.white; src.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl); fl.connect(g); g.connect(dest); src.start(t, Math.random()); src.stop(t + dur + 0.05);
}
function tone(f0: number, f1: number, dur: number, gain: number, { at = 0, dest = A.body, type = 'sine' }: Any = {}) {
  if (!A.ctx) return;
  const ctx = A.ctx, t = ctx.currentTime + at;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
}
const SFX = {
  pen: () => { for (let i = 0; i < 3; i++) noise({ at: i * 0.05 + Math.random() * 0.02, dur: 0.035 + Math.random() * 0.03, f: 2600 + Math.random() * 1800, q: 3, gain: 0.04 }); },
  gulp: (g = 1) => { if (S.swallowS !== 'synth' && play(S.swallowS, { g: 0.55 * clamp(g, 0.5, 1.4), rate: rand(0.95, 1.05), dest: A.body })) return; tone(190, 105, 0.14, 0.26 * g); noise({ at: 0.05, dur: 0.06, f: 850, q: 3, gain: 0.09 * g, dest: A.body }); tone(120, 80, 0.12, 0.12 * g, { at: 0.18 }); },
  cough: () => { for (let i = 0; i < 2; i++) { noise({ at: i * 0.22, dur: 0.16, type: 'bandpass', f: 700, f2: 300, q: 0.7, gain: 0.28, attack: 0.005, dest: A.body }); tone(160, 90, 0.12, 0.2, { at: i * 0.22 }); } noise({ at: 0.1, dur: 0.25, type: 'highpass', f: 2500, gain: 0.06, dest: A.world }); },
  splash: (g = 0.5) => play('splash', { g: clamp(0.25 + 0.5 * g, 0.2, 0.8), rate: rand(0.9, 1.15) }) || noise({ dur: 0.2, type: 'highpass', f: 1800, gain: 0.09 * g, attack: 0.005, dest: A.world }),
  breath: () => { if (!play('breath', { g: 0.2, rate: 1.4, offset: 0.12, dur: 0.6, lp: 2800, dest: A.body })) noise({ dur: 0.45, f: 800, f2: 1800, q: 0.9, gain: 0.07, attack: 0.08, dest: A.body }); },
  heart: (k: number) => { tone(52, 40, 0.18, 0.25 + 0.4 * k); tone(46, 36, 0.15, 0.16 + 0.25 * k, { at: 0.24 }); },
  tap: () => { noise({ dur: 0.03, type: 'highpass', f: 1800, gain: 0.18, attack: 0.002, dest: A.body }); noise({ at: 0.13, dur: 0.03, type: 'highpass', f: 1800, gain: 0.16, attack: 0.002, dest: A.body }); },
};
/* the stream: the recorded water loop, its level and rate following her flow (a surge is heard rising before it lands); a synthesised splash on the tide */
let STREAM: Any = { src: null, g: null, lp: null, noise: null, ng: null };
function streamInit() {
  if (!A.ctx || STREAM.g) return;
  STREAM.g = A.ctx.createGain(); STREAM.g.gain.value = 0; STREAM.lp = A.ctx.createBiquadFilter(); STREAM.lp.type = 'lowpass'; STREAM.lp.frequency.value = 2400;
  STREAM.lp.connect(STREAM.g); STREAM.g.connect(A.world);
  streamSource();
  const n = A.ctx.createBufferSource(); n.buffer = A.white; n.loop = true; const bp = A.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.8;
  STREAM.ng = A.ctx.createGain(); STREAM.ng.gain.value = 0; n.connect(bp); bp.connect(STREAM.ng); STREAM.ng.connect(A.world); n.start(); STREAM.bp = bp;
}
/* the recorded loop chosen in the panel (synth: only the filtered noise) */
function streamSource() {
  for (const k of ['src', 'src2']) if (STREAM[k]) { try { STREAM[k].stop(); } catch (e) { /* already stopped */ } STREAM[k] = null; }
  const mk = (buf: AudioBuffer, gain: number) => { const src = A.ctx.createBufferSource(); src.buffer = buf; src.loop = true; const g = A.ctx.createGain(); g.gain.value = gain; src.connect(g); g.connect(STREAM.lp); src.start(); return { src, g }; };
  if (S.streamS === 'mug' && A.buf.mug_soft && A.buf.mug_strong) {
    // the recording of a pour into a mug (public domain): its soft and its strong part, mixed by her flow
    const a = mk(A.buf.mug_soft, 1), b = mk(A.buf.mug_strong, 0); STREAM.src = a.src; STREAM.mixA = a.g; STREAM.src2 = b.src; STREAM.mixB = b.g; return;
  }
  STREAM.mixA = STREAM.mixB = null;
  const buf = S.streamS !== 'synth' ? A.buf[S.streamS] : null;
  if (buf) STREAM.src = mk(buf, 1).src;
}
function streamSet(flow: number, rising: boolean) {
  if (!STREAM.g) return;
  const t = A.ctx.currentTime, k = clamp(flow / 0.8, 0, 1.4);
  STREAM.g.gain.setTargetAtTime(STREAM.src ? 0.5 * k : 0, t, 0.08);
  STREAM.ng.gain.setTargetAtTime((STREAM.src ? 0.02 : 0.08) * k, t, 0.08);
  STREAM.lp.frequency.setTargetAtTime(1600 + 2600 * k + (rising ? 1200 : 0), t, 0.1);
  if (STREAM.mixA) { const m = smooth(0.25, 0.9, k); STREAM.mixA.gain.setTargetAtTime(1 - m, t, 0.12); STREAM.mixB.gain.setTargetAtTime(m, t, 0.12); } // soft ↔ strong by her flow
  const rate = STREAM.mixA ? 0.96 + 0.08 * k + (rising ? 0.06 : 0) : 0.9 + 0.25 * k + (rising ? 0.15 : 0); // a recording keeps nearly its own pitch
  if (STREAM.src) STREAM.src.playbackRate.setTargetAtTime(rate, t, 0.1);
  if (STREAM.src2) STREAM.src2.playbackRate.setTargetAtTime(rate, t, 0.1);
  STREAM.bp.frequency.setTargetAtTime(900 + 1200 * k, t, 0.1);
}

/* ---------- her hand and the sensory lines ---------- */
function say(text: string | undefined) {
  if (!text) return;
  const el = document.createElement('div'); el.className = 'her-line'; el.textContent = text;
  const speed = S.style === 'cruel' || S.style === 'cold' ? 24 : S.style === 'ritual' ? 45 : 34;
  el.style.setProperty('--write', `${Math.max(140, text.length * speed)}ms`); el.style.setProperty('--steps', String(Math.max(4, text.length * 2)));
  const showing = [...$('#hand').querySelectorAll('.her-line:not(.gone)')].length;
  el.style.left = `${innerWidth * 0.6}px`; el.style.top = `${innerHeight * 0.14 + showing * 50}px`; el.style.transform = `rotate(${rand(-4, 3).toFixed(1)}deg)`;
  $('#hand').appendChild(el); SFX.pen();
  setTimeout(() => { el.classList.add('gone'); setTimeout(() => el.remove(), 600); }, 2600);
}
function sense(text: string) {
  const el = document.createElement('div'); el.className = 'sense'; el.textContent = text;
  const showing = [...$('#hand').querySelectorAll('.sense:not(.gone)')].length;
  el.style.left = `${innerWidth * 0.06}px`; el.style.top = `${innerHeight * 0.4 - showing * 46}px`;
  $('#hand').appendChild(el);
  setTimeout(() => { el.classList.add('gone'); setTimeout(() => el.remove(), 900); }, 3400);
}
const sayL = (k: string) => { const p = L()[k]; if (p && p.length) say(pick(p)); };

/* ---------- state ---------- */
let G: Any;
function fresh() {
  return { phase: 'idle', t: 0, fill: 0, air: 1, reflex: 0, gulping: 0, breathing: 0, gulpsInRow: 0, spaceHeld: false, flow: 0, flowTarget: 0, surge: null, nextSurge: 6000,
    paused: 0, tapCd: 0, poured: 0, spilled: 0, ripple: 0, splashT: 0, drops: [], lastHeart: 0, tasteCd: 6000, shake: 0, cam: 0, end: 0,
    puddle: null, cleanT: 0, light: -1, gest: null,
    stats: { gulps: 0, breaths: 0, coughs: 0, overflows: 0, taps: 0, spilled: 0, cleaned: null, swallowedWhileCleaning: 0 } } as Any;
}
G = fresh();

/* ---------- her flow: the engine's plan (her level per beat, her surges with their warning, her feints and pauses); her answers to a tap the instrument's ---------- */
function planFlow(dt: number) {
  const s = ST();
  if (G.paused > 0) { G.paused -= dt; G.flowTarget = 0; }
  else G.flowTarget = flowNow() * S.flowK;
  // a surge: the plan's, its warning (her line for a ritual holder; the stream's sound rising otherwise) before it lands; a feint warns and
  // does not land; one of her answers to a tap (`tap`) lands on top of the plan
  planSurge();
  let rising = false;
  if (G.surge) {
    const u = G.t - G.surge.t0;
    if (u < G.surge.warn) rising = true;
    else if (!G.surge.feint && u < G.surge.warn + G.surge.len) { if (!G.surge.plan) G.flowTarget *= s.surge; } // the plan's level carries its own surge
    else if (u >= G.surge.warn + (G.surge.feint ? 300 : G.surge.len)) G.surge = null;
  }
  G.flow = lerp(G.flow, G.flowTarget, Math.min(1, dt / 220));
  streamSet(G.flow, rising);
}

/* ---------- the body: swallow, breathe, the reflex, overflow and coughs ---------- */
function startGulp() {
  if (G.gulping > 0 || G.breathing > 0) return;
  G.gulping = GULP_MS; G.stats.gulps += 1; G.gulpsInRow += 1; SFX.gulp(0.6 + G.fill);
  G.air = Math.max(0, G.air - AIR_GULP);
  if (G.gulpsInRow >= 4) G.reflex = Math.min(1, G.reflex + 0.12 * (G.gulpsInRow - 3));
  if (G.phase === 'clean') G.stats.swallowedWhileCleaning += 1;
}
function startBreath() {
  if (G.gulping > 0 || G.breathing > 0) return;
  G.breathing = BREATH_MS; G.stats.breaths += 1; G.gulpsInRow = 0; SFX.breath();
  const coughChance = smooth(COUGH_FROM, 1, G.fill) * 0.7 + G.reflex * 0.3;
  if (Math.random() < coughChance) setTimeout(() => cough('breath'), 220);
}
function cough(why: string) {
  if (G.phase !== 'loop' && G.phase !== 'clean') return;
  G.stats.coughs += 1; SFX.cough(); G.shake = 1;
  const out = Math.min(G.fill, 0.25 + 0.2 * G.fill); spill(out, true);
  G.reflex = Math.max(0, G.reflex - 0.6); G.breathing = 0; G.air = Math.min(1, G.air + 0.2);
  if (Math.random() < 0.6) setTimeout(() => sayL('cough'), 400);
}
function spill(amount: number, coughed: boolean) {
  if (amount <= 0) return;
  G.fill = Math.max(0, G.fill - amount); G.spilled += amount; G.stats.spilled += amount;
  SFX.splash(0.4 + amount);
  for (let i = 0; i < 6 + amount * 20; i++) G.drops.push({ x: rand(0.02, 0.98), y: 1 - tideH() / innerHeight, vx: rand(-0.12, 0.12), vy: rand(-0.4, -0.1) * (coughed ? 1.6 : 0.6), life: 1 });
  if (!coughed && Math.random() < 0.4) setTimeout(() => sayL('spill'), 300);
}
function tap() {
  if (G.phase !== 'loop' || G.tapCd > 0) return;
  G.tapCd = 2500; G.stats.taps += 1; SFX.tap();
  const el = $('#tap'); el.style.opacity = '1'; el.classList.remove('knock'); void el.offsetWidth; el.classList.add('knock'); setTimeout(() => { el.style.opacity = '0'; }, 700);
  const kept = !tapReleases();
  E!.env.tap?.();
  if (!kept) return; // she lets go: the engine ends the hold (her flow's end plays), never a refusal
  const how = ST().tap;
  setTimeout(() => {
    sayL('tapped');
    if (how === 'pause') G.paused = 2500;
    else if (how === 'slower') { G.paused = 600; S._slow = (S._slow ?? 1) * 0.8; }
    else if (how === 'hold') G.paused = 1500;
    else if (how === 'faster') { G.surge = { t0: G.t, warn: 300, len: 1600, feint: false }; }
    else if (how === 'surge') { G.surge = { t0: G.t, warn: 0, len: 2200, feint: false }; }
  }, 400);
}

/* ---------- phases ---------- */
function begin() {
  audioInit(); if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); streamInit();
  $('#hand').replaceChildren(); $('#summary').style.display = 'none';
  G = fresh(); G.phase = 'entry'; S._slow = 1;
  $('#reply').innerHTML = '<span class="act">She stands over the commander, and waits for the mouth to open.</span>';
  setTimeout(() => { if (G.phase === 'entry') { G.phase = 'loop'; G.end = S.len * 1000; sayL('entry'); } }, 1400);
}
function endFlow() {
  G.phase = 'after'; streamSet(0, false); sayL('done');
  // what was spilled pools on the floor: the engine chained her flow to the cleaning (she makes the commander clean it), or let go (she wipes it up herself)
  setTimeout(() => {
    if (R.chained) { sayL('clean'); setTimeout(startClean, 1300); }
    else { if (G.spilled > 0.15 && ST().check !== 'clean') { sayL('clean'); sense('She wipes it up herself.'); } setTimeout(() => finish('done'), 1500); }
  }, 1200);
}
function finish(why: string) {
  if (G.phase === 'done') return;
  G.phase = 'done'; streamSet(0, false);
  if (why === 'stop') sayL('stop');
  const s = G.stats;
  setTimeout(() => {
    $('#sumLine').textContent = why === 'stop' ? (L().stop![0] ?? '') : (L().done![0] ?? 'done.');
    $('#sumFacts').innerHTML = `her style: ${S.style} · her volume ${S.len} s<br>swallows: ${s.gulps} · breaths: ${s.breaths} · coughs: ${s.coughs}<br>taps: ${s.taps}<br>`
      + `spilled: ${(s.spilled * 100).toFixed(0)} % of a mouthful in all<br>`
      + (s.cleaned !== null ? `the floor: ${(s.cleaned * 100).toFixed(0)} % left · swallowed while cleaning: ${s.swallowedWhileCleaning}<br>` : '')
      + `how it ended: ${why}`;
    $('#summary').style.display = 'block';
  }, 900);
}

/* ---------- the cleaning: the puddle on the floor art, wiped with the tongue; every bit wiped fills the mouth ---------- */
function startClean() {
  G.phase = 'clean'; G.cleanT = 0;
  const w = 160, h = 100, m = new Float32Array(w * h);
  const n = 4 + Math.round(G.spilled * 6), blobs: number[][] = [];
  for (let i = 0; i < n; i++) blobs.push([rand(0.3, 0.7), rand(0.35, 0.75), rand(0.05, 0.14)]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (const [bx, by, br] of blobs as Array<[number, number, number]>) v += Math.exp(-(((x / w - bx) * 1.6) ** 2 + (y / h - by) ** 2) / (br * br)); m[y * w + x] = clamp(v * 1.2 - 0.15, 0, 1) * clamp(G.spilled * 1.5, 0.4, 1); }
  G.puddle = { w, h, m, total0: m.reduce((a, b) => a + b, 0), c: document.createElement('canvas') }; G.puddle.c.width = w; G.puddle.c.height = h;
  G.fill = Math.min(G.fill, 0.15); G.light = -1;
  $('#reply').innerHTML = '<span class="act">Down to the floor, where it spilled.</span>';
  E?.env.staging.restart?.();
}
const puddleLeft = () => (G.puddle ? G.puddle.m.reduce((a: number, b: number) => a + b, 0) / Math.max(1, G.puddle.total0) : 0);
function puddleRect() { const W = innerWidth, H = innerHeight; return { x: W * 0.1, y: H * 0.22, w: W * 0.8, h: H * 0.62 }; }
function wipePuddle(x0: number, y0: number, x1: number, y1: number) {
  const p = G.puddle; if (!p) return 0; const r = puddleRect();
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4)), rad = 0.06 * p.w; let took = 0;
  for (let i = 0; i <= steps; i++) {
    const px = ((lerp(x0, x1, i / steps) - r.x) / r.w) * p.w, py = ((lerp(y0, y1, i / steps) - r.y) / r.h) * p.h;
    for (let y = Math.max(0, Math.floor(py - rad)); y < Math.min(p.h, Math.ceil(py + rad)); y++) for (let x = Math.max(0, Math.floor(px - rad)); x < Math.min(p.w, Math.ceil(px + rad)); x++) {
      const d = Math.hypot(x - px, y - py) / rad; if (d > 1) continue; const k = y * p.w + x; const t = p.m[k] * 0.3 * (1 - d); p.m[k] -= t; took += t;
    }
  }
  return took;
}

/* ---------- the loop ---------- */
let last = 0;
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(50, now - last); last = now;
  if (G.phase === 'entry' || G.phase === 'loop' || G.phase === 'after' || G.phase === 'clean') update(dt);
  render(now, dt);
}
function update(dt: number) {
  G.t += dt;
  G.cam = Math.min(1, G.cam + dt / 900);
  G.tapCd = Math.max(0, G.tapCd - dt); G.shake = Math.max(0, G.shake - dt / 500);
  if (G.phase === 'loop') {
    planFlow(dt);
    const inflow = G.flow * (S._slow ?? 1) * dt / 1000;
    G.fill += inflow; G.poured += inflow;
    if (G.flow > REFLEX_SURGE) G.reflex = Math.min(1, G.reflex + (G.flow - REFLEX_SURGE) * dt / 2500);
    if (Math.random() < G.flow * dt / 1200) G.ripple = 1;
    G.end -= dt; if (G.end <= 0) endFlow();
  }
  // the reflex cools down; at full it is a cough
  G.reflex = Math.max(0, G.reflex - dt / 9000);
  if (G.reflex >= 1) cough('reflex');
  // a swallow takes its share over its time; held Space gulps again
  if (G.gulping > 0) { const take = GULP_TAKES * Math.min(dt, G.gulping) / GULP_MS; G.fill = Math.max(0, G.fill - take); G.gulping -= dt; if (G.gulping <= 0 && G.spaceHeld) startGulp(); }
  if (G.breathing > 0) { G.air = Math.min(1, G.air + BREATH_GIVES * Math.min(dt, G.breathing) / BREATH_MS); G.breathing -= dt; }
  // air drains while the mouth holds anything; at nothing the body breathes by itself (and with a full mouth that is a cough)
  if (G.fill > 0.05 && G.breathing <= 0) G.air = Math.max(0, G.air - AIR_DRAIN * dt / 1000);
  if (G.air <= 0 && G.breathing <= 0 && G.gulping <= 0) { sense('The body breathes by itself.'); startBreath(); if (G.fill > 0.3) cough('air'); }
  // overflow: what does not fit runs over the edges
  if (G.fill > 1) { const over = G.fill - 1; G.fill = 1; if (!G.brimming) { G.brimming = true; G.stats.overflows += 1; } spill(over + 0.04, false); } // one overflow an event
  else if (G.fill < 0.9) G.brimming = false;
  // the taste, now and then
  G.tasteCd -= dt; if (G.phase === 'loop' && G.tasteCd <= 0 && G.fill > 0.3) { sense(pick(TASTE)); G.tasteCd = rand(9000, 15000); }
  // the heart: faster as the air goes
  const bpm = lerp(70, 150, smooth(0.6, 0, G.air));
  if (G.t - G.lastHeart > 60000 / bpm) { G.lastHeart = G.t; SFX.heart(smooth(0.6, 0, G.air)); }
  // drops
  for (const d of G.drops) { d.vy += 1.6 * dt / 1000; d.x += d.vx * dt / 1000; d.y += d.vy * dt / 1000; d.life -= dt / 1300; }
  G.drops = G.drops.filter((d: Any) => d.life > 0 && d.y < 1.1);
  // the cleaning: done when the floor is nearly dry; then her check in a band of light
  if (G.phase === 'clean') {
    G.cleanT += dt;
    if (G.light < 0 && (puddleLeft() <= 0.1 || G.cleanT > 40000)) { G.light = 0; sense('She looks at the floor against the light.'); }
    if (G.light >= 0) { G.light += dt / 1700; if (G.light >= 1 && !G.judged) { G.judged = true; G.stats.cleaned = puddleLeft(); sayL(puddleLeft() > 0.15 ? 'missed' : 'cleaned'); setTimeout(() => finish('done'), 1800); } }
  }
}
const tideH = () => lerp(0, innerHeight * 0.36, clamp(G.fill, 0, 1));

/* ---------- drawing ---------- */
function placeSprite(img: HTMLImageElement, opts: Any) {
  if (!img.naturalWidth) return;
  const vw = innerWidth, vh = innerHeight, nw = img.naturalWidth, nh = img.naturalHeight;
  const Hs = vh * opts.h, sc = Hs / nh, Ws = nw * sc;
  const fx = opts.x * vw + (opts.dx ?? 0), bottom = vh * (opts.bottom ?? 1);
  const left = fx - Ws / 2, top = bottom - Hs;
  img.style.transform = `translate(${left}px, ${top}px) translate(${Ws / 2}px, ${Hs}px) rotate(${(opts.rot ?? 0).toFixed(2)}deg) rotateX(${(opts.rx ?? 0).toFixed(2)}deg) translate(${-Ws / 2}px, ${-Hs}px) scale(${sc})`;
}
const overImgs: { over: HTMLImageElement | null; naked: HTMLImageElement | null } = { over: null, naked: null };
function render(now: number, dt: number) {
  const W = innerWidth, H = innerHeight;
  const cleaning = G.phase === 'clean' || (G.phase === 'done' && G.puddle);
  // her picture by the chain: over_explicit (explicit content on) → over → her sprite from below (weight's face-up placement)
  const useImg = cleaning ? null : (S.explicit && overImgs.naked) ? overImgs.naked : overImgs.over;
  const ov = $('#over'), her = $('#her');
  const sway = Math.sin(now / 1400) * 0.6 + (G.surge && G.t - G.surge.t0 > G.surge.warn ? Math.sin(now / 90) * 0.4 : 0);
  if (useImg) {
    if (ov.src !== useImg.src) ov.src = useImg.src; ov.style.display = 'block'; // (the stylesheet hides #over: '' would hide it again)
    const oh = S.overH, ow = (H * oh) * useImg.naturalWidth / useImg.naturalHeight;
    const overscan = Math.max(0.02, (ow / 2) * Math.sin(6 * Math.PI / 180) / H + 0.01);
    placeSprite(ov, { h: oh, x: S.overX, bottom: 1 + overscan + S.overSink, rot: sway });
    her.style.opacity = '0';
  } else { ov.style.display = 'none'; her.style.opacity = cleaning ? '0' : '1'; placeSprite(her, { h: 1.55, x: 0.5, bottom: 1.42, rot: sway, rx: 10 }); }
  $('#ceiling').style.opacity = cleaning ? '0' : '1';
  $('#ceiling').style.filter = `blur(3px) brightness(.55)`;
  $('#floor').style.opacity = cleaning ? '1' : '0';
  $('#floor').style.filter = 'blur(1px) brightness(.6) saturate(.85)';
  const sh = S.reduced ? 0 : G.shake * 8 + (G.gulping > 0 ? Math.sin(G.gulping / GULP_MS * Math.PI) * 2 : 0);
  $('#world').style.transform = `translate(${rand(-sh, sh).toFixed(1)}px, ${(rand(-sh, sh) + (G.gulping > 0 ? 3 * Math.sin(G.gulping / GULP_MS * Math.PI) : 0)).toFixed(1)}px)`;
  // air: the frame's edges close in and darken; the reflex warms them
  const airK = smooth(0.7, 0, G.air), rk = G.reflex;
  $('#vig').style.background = `radial-gradient(ellipse ${lerp(80, 52, airK)}% ${lerp(76, 48, airK)}% at 50% 45%, rgba(0,0,0,0) 45%, rgba(${Math.round(20 + 60 * rk)},${Math.round(6 + 4 * rk)},4,${(0.35 + 0.55 * airK).toFixed(2)}) 100%)`;
  // the tide: the mouth's fill as a warm liquid at the bottom, ripples where the stream lands, a swell when swallowing; overflow drops
  const tc = $('#tide'); if (tc.width !== W || tc.height !== H) { tc.width = W; tc.height = H; }
  const x = tc.getContext('2d'); x.clearRect(0, 0, W, H);
  const th = tideH();
  if (th > 1) {
    const surf = H - th, t = now / 1000, rip = G.ripple; G.ripple = Math.max(0, G.ripple - dt / 600);
    x.beginPath(); x.moveTo(0, H);
    for (let px = 0; px <= W; px += 8) {
      const u = px / W;
      const wave = Math.sin(u * 9 + t * 2.1) * 4 + Math.sin(u * 23 - t * 3.4) * 2 + rip * 10 * Math.exp(-((u - 0.5) ** 2) / 0.01) * Math.sin(t * 18 - u * 40)
        + (G.gulping > 0 ? -10 * Math.sin(G.gulping / GULP_MS * Math.PI) * Math.exp(-((u - 0.5) ** 2) / 0.08) : 0);
      x.lineTo(px, surf + wave);
    }
    x.lineTo(W, H); x.closePath();
    const g = x.createLinearGradient(0, surf, 0, H);
    g.addColorStop(0, 'rgba(255,226,140,0.46)'); g.addColorStop(0.25, 'rgba(236,190,96,0.42)'); g.addColorStop(1, 'rgba(190,140,60,0.55)');
    x.fillStyle = g; x.fill();
    // the surface's sheen
    x.strokeStyle = 'rgba(255,245,210,0.55)'; x.lineWidth = 2; x.beginPath();
    for (let px = 0; px <= W; px += 8) { const u = px / W; const wave = Math.sin(u * 9 + t * 2.1) * 4 + Math.sin(u * 23 - t * 3.4) * 2 + rip * 10 * Math.exp(-((u - 0.5) ** 2) / 0.01) * Math.sin(t * 18 - u * 40); px === 0 ? x.moveTo(px, surf + wave) : x.lineTo(px, surf + wave); }
    x.stroke();
    // near full the edges brim and quiver
    if (G.fill > 0.85) { x.fillStyle = `rgba(255,230,160,${(0.25 * smooth(0.85, 1, G.fill)).toFixed(2)})`; x.fillRect(0, surf - 6, 14, th); x.fillRect(W - 14, surf - 6, 14, th); }
  }
  for (const d of G.drops) { x.fillStyle = `rgba(255,228,150,${(0.7 * d.life).toFixed(2)})`; x.beginPath(); x.ellipse(d.x * W, d.y * H, 3, 5, 0, 0, Math.PI * 2); x.fill(); }
  // the puddle on the floor (cleaning): glossy liquid over the floor art; her check is a band of light across it
  const pc = $('#puddleC');
  if (cleaning && G.puddle) {
    const r = puddleRect(), p = G.puddle, cx2 = p.c.getContext('2d'), id = cx2.createImageData(p.w, p.h);
    const band = G.light >= 0 ? lerp(-0.3, 1.3, easeOut(G.light)) : -9;
    for (let yy = 0; yy < p.h; yy++) for (let xx = 0; xx < p.w; xx++) {
      const i = yy * p.w + xx, v = p.m[i]; if (v < 0.01) { id.data[i * 4 + 3] = 0; continue; }
      const sheen = 0.5 + 0.5 * Math.exp(-(((xx / p.w) - (yy / p.h) * 0.5 - 0.2) ** 2) / 0.02), lb = Math.exp(-(((xx / p.w) + (yy / p.h) * 0.3 - band) ** 2) / 0.006);
      id.data[i * 4] = 230 + 25 * lb; id.data[i * 4 + 1] = 205 + 50 * lb; id.data[i * 4 + 2] = 130 + 120 * lb; id.data[i * 4 + 3] = Math.round(clamp(v * (0.45 + 0.25 * sheen) + lb * v * 0.5, 0, 1) * 255);
    }
    cx2.putImageData(id, 0, 0);
    if (pc.width !== p.w || pc.height !== p.h) { pc.width = p.w; pc.height = p.h; }
    pc.getContext('2d').clearRect(0, 0, p.w, p.h); pc.getContext('2d').drawImage(p.c, 0, 0);
    pc.style.left = `${r.x + W * 0.04}px`; pc.style.top = `${r.y + H * 0.04}px`; pc.style.width = `${r.w}px`; pc.style.height = `${r.h}px`; pc.style.opacity = '1';
  } else pc.style.opacity = '0';
  if (S.debug) $('#debug').textContent = `phase ${G.phase} · fill ${G.fill.toFixed(2)} · air ${G.air.toFixed(2)} · reflex ${G.reflex.toFixed(2)}\nflow ${G.flow.toFixed(2)} (target ${G.flowTarget.toFixed(2)}) · surge ${G.surge ? (G.surge.feint ? 'feint' : 'yes') : '—'} · paused ${Math.max(0, G.paused).toFixed(0)}\n`
    + `poured ${G.poured.toFixed(2)} · spilled ${G.spilled.toFixed(2)} · left ${(G.end / 1000).toFixed(0)} s${G.puddle ? ` · puddle ${(puddleLeft() * 100).toFixed(0)} %` : ''}`;
}

/* ---------- input: the tongue in the cleaning (the prototype's pointermove listener) ---------- */
function lick(e: { clientX: number; clientY: number }) {
  const g = G.gest; if (!g || G.phase !== 'clean') return;
  const took = wipePuddle(g.x, g.y, e.clientX, e.clientY);
  if (took > 0) G.fill = Math.min(1.2, G.fill + took * 0.0016); // what is licked up fills the mouth again
  g.x = e.clientX; g.y = e.clientY;
}

/* =====================================================================================================================================
 * The wiring (no prototype code below): the run, the plan's flow, the reports, the tap's answer, the lines, the art, the mount and its end.
 * ===================================================================================================================================== */

interface Seg { n: number; startedAt: number; clock0: number; beats: number; endMs: number; reported: number; ended: boolean; /** A full segment's beats (the earlier segments of her flow). */ full: number }
interface Wiring {
  run: PhysicsRun | null;
  lineStyle: string;
  /** P15b: her manner axes (null: none, so her row is the prototype's). */
  manner: RowAxes | null;
  seg: Seg | null;
  running: boolean;
  plan: PlannedBeat[];
  /** The engine chained her flow to the cleaning (she makes the commander clean): `endFlow` follows the engine's answer (Ruling Q). */
  chained: boolean;
  /** What the swallows took and what was spilled since the last beat reported (carried across a held run: Ruling AD). */
  took: number;
  spilledAt: number;
  /** The coughs and the overflows at the last beat reported (a new one begins a spill: review M2). */
  coughsAt: number;
  overflowsAt: number;
  /** The puddle at the last wipe reported (its lowest), and the cleaning's start on the engine's dirt gauge. */
  puddleLow: number | null;
  floor0: number;
  /** The beat whose plan warning / surge was played already (`planSurge`). */
  surgeAt: string;
  ox: number; oy: number;
  ended: string | null;
}
const R: Wiring = { run: null, lineStyle: 'neutral', manner: null, seg: null, running: false, plan: [], chained: false, took: 0, spilledAt: 0, coughsAt: 0, overflowsAt: 0, puddleLow: null, floor0: 0, surgeAt: '', ox: 0, oy: 0, ended: null };
const BEAT = (): number => TUNING.physics.beatMs;

/** The beat of the running segment at the loop's clock. */
function beatNow(): number {
  const seg = R.seg;
  if (!seg) return 0;
  return clamp(Math.floor((G.t - seg.clock0) / BEAT()), 0, seg.beats - 1);
}
/** Her flow now: the plan's level on the beat being played (mouths a second); 0 while the run is held between segments. */
function flowNow(): number {
  if (!R.running || !R.seg) return 0;
  const elapsed = G.t - R.seg.clock0;
  if (elapsed >= R.seg.beats * BEAT()) return 0; // her volume reached: the stream stops with the plan
  const f = R.plan[beatNow()]?.flow;
  if (!f || f.pause) return 0;
  // review M4: her wander is the prototype's, continuous in the run's time (`base × (1 + vary × sin(t / 1300) × sin(t / 3700 + 1))`); the plan
  // gives her pauses and her surges (and the engine's integral samples the same curve at each beat's middle)
  const s = ST(), t = (R.seg.n - 1) * R.seg.full * BEAT() + elapsed;
  return s.base * (1 + s.vary * Math.sin(t / 1300) * Math.sin(t / 3700 + 1)) * (f.surge ? s.surge : 1);
}
/**
 * Her surges as the plan places them: a warning beat starts the stream rising her row's `warn` ms before its end (a ritual holder says her
 * word `max(0, warn − 600)` ms into it); the surge lands at the next beat's start (none after it: a feint). A surge beat with no warning
 * before it in this segment (cruel; or the warning was the last segment's) lands at its start.
 */
function planSurge(): void {
  if (!R.running || !R.seg) return;
  const b = beatNow(), beat = R.plan[b], s = ST(), B = BEAT();
  if (!beat?.flow) return;
  const key = `${R.seg.n}|${b}`;
  const into = G.t - R.seg.clock0 - b * B;
  if (beat.flow.warn && R.surgeAt !== `w${key}` && into >= B - s.warn) {
    R.surgeAt = `w${key}`;
    G.surge = { t0: G.t, warn: s.warn, len: B, feint: b + 1 < R.plan.length && R.plan[b + 1]?.flow?.surge !== true, plan: true };
    if (s.announce) { refreshLines(b); setTimeout(() => G.phase === 'loop' && sayL('surge'), Math.max(0, s.warn - 600)); } // her row announces (ritual); the plan's cue is the card's
  } else if (beat.flow.surge && !G.surge && R.surgeAt !== `s${key}`) {
    R.surgeAt = `s${key}`;
    G.surge = { t0: G.t, warn: 0, len: B, feint: false, plan: true };
  }
}
/**
 * Whether the engine lets go at this tap (P15a's `physicsSignal`): a `signal` holder at once, a `limit` holder from her second tap, a
 * `blackout` holder never. Her answer is said only when she keeps the commander, so her words never contradict the engine's.
 */
function tapReleases(): boolean {
  if (!E || !R.run) return false;
  const holds = effectiveHoldsUntil(E.env.state(), E.env.registries, R.run.holderId);
  return holds === 'signal' || (holds === 'limit' && R.run.taps > 0);
}
function report(i: SegmentInput, pointer: boolean): void {
  if (!E || !R.seg || !R.running) return;
  E.env.staging.input(i, { pointer });
}
/** The mouth's or the floor's beat ended: what its swallows took and what it spilled, or (cleaning) what it licked up. Nothing done, nothing sent. */
function reportBeat(beat: number): void {
  if (isGulpPhysics(R.run ? E?.env.registries.contactPhysics.get(R.run.physicsId) : undefined)) {
    const took = Math.round(R.took * 1e5) / 1e5, spilled = Math.round((G.spilled - R.spilledAt) * 1e5) / 1e5;
    if (took > 0) report({ beat, kind: 'swallow', amount: took }, false);
    // review M2: a spill is counted as gulp.html counts it (its overflows, re-armed under 0.9, and its coughs); what runs on is its amount only
    const coughed = G.stats.coughs > R.coughsAt, overflowed = G.stats.overflows > R.overflowsAt;
    if (spilled > 0) {
      if (coughed) report({ beat, kind: 'spill', part: 'cough', amount: spilled }, false);
      if (overflowed) report({ beat, kind: 'spill', part: 'overflow', amount: coughed ? 0 : spilled }, false);
      if (!coughed && !overflowed) report({ beat, kind: 'spill', part: 'more', amount: spilled }, false);
    }
    R.took = 0; R.spilledAt = G.spilled; R.coughsAt = G.stats.coughs; R.overflowsAt = G.stats.overflows;
    return;
  }
  if (!G.puddle) return;
  const sum = G.puddle.m.reduce((a: number, b: number) => a + b, 0);
  const low = R.puddleLow ?? G.puddle.total0;
  const amount = Math.round(((Math.max(0, low - sum) / Math.max(1, G.puddle.total0)) * (R.floor0 / 100)) * 1e5) / 1e5;
  R.puddleLow = Math.min(low, sum);
  if (amount > 0) report({ beat, kind: 'wipe', amount }, true);
}
/** A running segment the loop has not met yet: its beats on the loop's clock. */
function startSegment(run: PhysicsRun, ck: { startedAt: number | null; now: number }): void {
  const plan = run.segment.plan!;
  const phys = E!.env.registries.contactPhysics.get(run.physicsId);
  const endMs = segmentSecondsOf(E!.env.state(), E!.env.registries, run, 20) * 1000 /* P15b: her tempo moves the segment, as it moves the plan's beats */;
  const clock0 = G.t - (ck.now - ck.startedAt!);
  const first = Math.max(0, Math.floor((G.t - clock0) / BEAT()));
  R.seg = { n: run.segment.n, startedAt: ck.startedAt!, clock0, beats: plan.beats.length, endMs, reported: Math.min(first, plan.beats.length), ended: false, full: Math.max(1, Math.ceil(endMs / BEAT())) };
  R.plan = plan.beats;
  // Ruling AD: what was swallowed, spilled or licked while the run was held is not lost: the first beat reported carries it
}
/** Her lines (cardVoice `gulp.*` by her style) in the prototype's `LINES` shape; her `surge` word may be the model's for the cue `surge`. */
function refreshLines(beat = 0): void {
  if (!E) return;
  const env = E.env;
  const own = (k: string): string[] => [...voiceLines(env.registries, `gulp.${k}` as VoiceKind, R.lineStyle)];
  const lines: Record<string, string[]> = Object.fromEntries(LINE_KINDS.map((k) => [k, own(k)]));
  if (lines.surge!.length > 0) { const v = env.staging.voiced?.('surge', beat) ?? null; if (v) lines.surge = [v]; }
  LINES = { [S.style]: lines };
}

/** Each frame before the prototype's: the size, the still form, the sound, her picture, the segment and its reports. */
function before(now: number): void {
  const e = E!;
  if (last > now) last = now;
  const r = e.env.root.getBoundingClientRect();
  const w = e.env.root.clientWidth || r.width || globalThis.innerWidth || 0, h = e.env.root.clientHeight || r.height || globalThis.innerHeight || 0;
  if (w !== innerWidth || h !== innerHeight) { innerWidth = w; innerHeight = h; }
  R.ox = r.left; R.oy = r.top;
  S.reduced = e.env.reduced;
  e.box.toggleAttribute('data-reduced', S.reduced);
  e.box.toggleAttribute('data-readable', e.env.readable);
  if (!A.ctx) { audioInit(); if (A.ctx) loadSamples(); }
  if (A.ctx && G.phase !== 'idle') {
    streamInit();
    // the recordings decode after the stream began: the mug's two loops replace the noise alone once they are there
    if (STREAM.g && S.streamS === 'mug' && !STREAM.mixA && A.buf.mug_soft && A.buf.mug_strong) streamSource();
  }
  // her sprite: the scene's picture, drawn by the instrument's camera from below (the scene's own <img> is never moved)
  const scene = R.run ? e.env.spriteOf(R.run.holderId) : null;
  const src = scene?.getAttribute('src') ?? '';
  const her = e.els['#her'] as HTMLImageElement;
  if (src !== '' && her.getAttribute('src') !== src) her.setAttribute('src', src);
  for (const img of [her, e.els['#over'] as HTMLImageElement]) if (img.naturalWidth && img.style.width !== `${img.naturalWidth}px`) { img.style.width = `${img.naturalWidth}px`; img.style.height = `${img.naturalHeight}px`; }
  // what a swallow takes this frame (the prototype's `update` takes it: the same step, read before it)
  const dt = Math.min(50, now - last);
  if (G.gulping > 0 && (G.phase === 'entry' || G.phase === 'loop' || G.phase === 'after' || G.phase === 'clean')) R.took += GULP_TAKES * Math.min(dt, G.gulping) / GULP_MS;
  // the segment: met when it runs; each beat reported as it ends; the segment cut short at her volume ended when its beats are played; the
  // cleaning's ended when her check begins
  const run = R.run;
  const ck = e.env.staging.clock();
  R.running = run !== null && run.segment.state === 'running' && run.segment.plan !== undefined && ck.startedAt !== null;
  if (G.phase !== 'idle' && G.phase !== 'done' && R.running && (R.seg === null || R.seg.n !== run!.segment.n || R.seg.startedAt !== ck.startedAt)) startSegment(run!, ck);
  const seg = R.seg;
  if (R.running && seg && !seg.ended) {
    const elapsed = G.t - seg.clock0;
    const passed = Math.floor(elapsed / BEAT());
    while (seg.reported < Math.min(passed, seg.beats)) reportBeat(seg.reported++);
    const cut = seg.beats * BEAT() < seg.endMs; // her volume cut it short: the instrument ends it, so its last beat is reported at its very end (review M5)
    const checking = G.phase === 'clean' && G.light >= 0;
    if ((cut ? elapsed >= seg.beats * BEAT() : elapsed >= seg.endMs - 300) || checking) {
      if (seg.reported < seg.beats) reportBeat(Math.min(seg.reported, seg.beats - 1));
      seg.reported = seg.beats;
      if (cut || checking) { seg.ended = true; e.env.staging.endSegment(); }
    }
  }
}
/** A surface's picture: each candidate in turn (P10c: a file that fails falls to the next), then the scene's backdrop. */
function surface(env: InstrumentEnv, el: HTMLElement, files: Array<{ file: string }>): void {
  const tryAt = (i: number): void => {
    if (E?.env !== env) return;
    const c = files[i];
    if (!c) { el.style.backgroundImage = env.layers.backdrop.style.backgroundImage; el.dataset.fallback = 'room'; return; }
    const url = env.assetUrl ? env.assetUrl(c.file) : c.file;
    el.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;
    if (typeof Image === 'function') {
      const probe = new Image();
      probe.onerror = () => tryAt(i + 1);
      probe.src = url;
    }
  };
  tryAt(0);
}
/** Her picture's chain: `over_explicit` with explicit content on (the content gate), else `over`; a picture that fails falls to the next. */
function bindArt(env: InstrumentEnv, run: PhysicsRun): void {
  const state = env.state();
  S.explicit = explicitArtAllowed(state, env.registries, run.holderId);
  const pics = { naked: S.explicit ? env.art.get(run.holderId, 'over_explicit', { explicit: true }) : null, over: env.art.get(run.holderId, 'over') };
  overImgs.over = null; overImgs.naked = null;
  const chosen = pics.naked ?? pics.over;
  const fit = chosen?.sidecar.fit;
  S.overH = fit?.height ?? 1.04; S.overX = fit?.x ?? 0.5; S.overSink = fit?.sink ?? 0;
  for (const key of ['over', 'naked'] as const) {
    const pic = pics[key];
    if (!pic || typeof Image !== 'function') continue;
    const im = new Image();
    im.alt = '';
    im.onload = () => { if (E?.env === env) overImgs[key] = im; };
    im.onerror = () => { if (overImgs[key] === im) overImgs[key] = null; }; // a picture that fails: the next of the chain
    im.src = pic.url;
  }
}
/** Binds the run: her style and her lines, her picture, the ceiling and the floor, her look. */
function bind(env: InstrumentEnv, run: PhysicsRun): void {
  const state: CampaignState = env.state();
  const reg: Registries = env.registries;
  reseed(fnv1a(`${state.scene?.id ?? ''}|${run.id}|gulp`));
  const lead = leadStyle(physicsStyleOf(state, run.holderId, reg));
  S.style = lead.key in STYLES ? lead.key : 'neutral'; // gulp.html's row (a style it lacks reads neutral's)
  R.lineStyle = lead.key;
  R.manner = physicsMannerOf(state, run.holderId, reg);
  R.run = run;
  R.seg = null; R.running = false; R.plan = []; R.chained = false; R.took = 0; R.spilledAt = 0; R.coughsAt = 0; R.overflowsAt = 0; R.puddleLow = null; R.floor0 = 0; R.surgeAt = ''; R.ended = null;
  bindArt(env, run);
  const owner = state.scene?.participants.find((id) => state.squad.some((u) => u.id === id)) ?? null;
  const loc = state.scene?.locationId ?? '';
  surface(env, E!.els['#ceiling']!, state.scene ? ceilingOf(state, reg, loc, owner) : []);
  surface(env, E!.els['#floor']!, state.scene ? floorOf(state, reg, loc, owner) : []);
  refreshLines();
  const look = env.her(run.holderId);
  E!.box.style.setProperty('--alius-her', look.accent);
  if (look.hand !== '') E!.box.style.setProperty('--alius-font-hand', `"${look.hand}", var(--alius-font-type)`);
  E!.box.style.setProperty('--alius-gulp-hand-scale', String(look.handScale || 1));
}

function build(env: InstrumentEnv): GulpEls {
  const box = globalThis.document.createElement('div');
  box.className = 'alius-gulp';
  box.setAttribute('aria-hidden', 'true'); // as the effects layer it lives in: the play surface; the stop word and the field are the scene's
  const els: Record<string, HTMLElement> = {};
  const el = (id: string, parent: HTMLElement, tag = 'div'): HTMLElement => {
    const n = tag === 'canvas' ? safeCanvas() : globalThis.document.createElement(tag);
    n.className = `alius-gulp-${id}`; els[`#${id}`] = n; parent.append(n); return n;
  };
  const world = el('world', box);
  el('ceiling', world);
  el('floor', world);
  const cam = el('cam', world);
  for (const id of ['her', 'over']) { const img = el(id, cam, 'img') as HTMLImageElement; img.alt = ''; img.draggable = false; }
  el('puddleC', world, 'canvas');
  el('tide', box, 'canvas');
  el('vig', box);
  el('markC', box, 'canvas');
  el('tap', box);
  el('hand', box);
  env.layers.effects.append(box);
  return { env, box, els, frameId: null };
}

/**
 * The listeners of the prototype's page, on the scene: Space swallows (held: gulp after gulp) and Shift breathes, never from the field or a
 * control (typed there they are letters: only the mouse acts while the field has focus); T or the right button on the frame taps her; in the
 * cleaning a press on the frame and its drag are the tongue. Escape and H are the scene's (the stop word is its pill).
 */
function listen(env: InstrumentEnv): void {
  const control = (t: EventTarget | null): boolean => t instanceof Element && t.closest('button, a, [role="button"], select, [data-action]') !== null;
  const onFrame = (t: EventTarget | null): boolean => t instanceof Node && (t === env.layers.frame || env.layers.frame.contains(t));
  const typing = (t: EventTarget | null): boolean => t instanceof HTMLElement && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable);
  const at = (e: { clientX: number; clientY: number }) => ({ clientX: e.clientX - R.ox, clientY: e.clientY - R.oy });
  env.listen(globalThis.document, 'keydown', ((e: KeyboardEvent) => {
    if (typing(e.target) || control(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ') { e.preventDefault(); if (!e.repeat) { G.spaceHeld = true; if (G.phase === 'loop' || G.phase === 'clean' || G.phase === 'after') startGulp(); } }
    if (e.key === 'Shift' && !e.repeat && (G.phase === 'loop' || G.phase === 'clean')) startBreath();
    if (e.key === 't' || e.key === 'T') tap();
  }) as EventListener);
  env.listen(globalThis.document, 'keyup', ((e: KeyboardEvent) => { if (e.key === ' ') G.spaceHeld = false; }) as EventListener);
  env.listen(env.layers.frame, 'contextmenu', ((e: Event) => e.preventDefault()) as EventListener);
  env.listen(env.root, 'pointerdown', ((e: PointerEvent) => {
    if (!onFrame(e.target)) return;
    if (e.button === 2) { e.preventDefault(); tap(); return; }
    if (G.phase === 'clean') { const p = at(e); G.gest = { x: p.clientX, y: p.clientY }; }
  }) as EventListener);
  env.listen(globalThis.document, 'pointermove', ((e: PointerEvent) => lick(at(e))) as EventListener);
  env.listen(globalThis.document, 'pointerup', (() => { G.gest = null; }) as EventListener);
}

function stopGulp(): void {
  const e = E;
  if (!e) return;
  if (e.frameId !== null) e.env.cancelRaf(e.frameId);
  try { A.master?.disconnect(); } catch { /* not connected */ }
  A = { ctx: null, buf: {} };
  STREAM = { src: null, g: null, lp: null, noise: null, ng: null };
  e.box.remove();
  for (const k of ['over', 'naked'] as const) { const im = overImgs[k]; if (im) { im.onload = null; im.onerror = null; } overImgs[k] = null; }
  DETACHED.clear();
  R.run = null; R.seg = null; R.running = false; R.plan = []; R.chained = false;
  LINES = { neutral: {} };
  S._slow = 1;
  G = fresh();
  E = null;
}

/** The instrument's own summary of a run (UI only, R28: the model's sentence is the engine's tally). */
export function digest(): { style: string; stats: Any; ended: string | null } {
  return { style: S.style, stats: { ...G.stats }, ended: R.ended };
}

/** How long her flow's end plays (her done line, 1.2 s, her clean line or her wiping, 1.5 s, the prototype's summary at 0.9 s). */
export const END_MS = 1200 + 1500 + 1800;
/** How long her check of the floor plays once it begins (the band of light 1.7 s, her verdict, 1.8 s to the end). */
export const CHECK_MS = 1700 + 1800 + 600;

/** Starts the instrument on a run (the host's `start`). */
export function startGulp_(env: InstrumentEnv, run: PhysicsRun): InstrumentRun {
  stopGulp();
  E = build(env);
  { const r = env.root.getBoundingClientRect(); innerWidth = env.root.clientWidth || r.width || 0; innerHeight = env.root.clientHeight || r.height || 0; R.ox = r.left; R.oy = r.top; }
  bind(env, run);
  listen(env);
  last = env.now();
  audioInit();
  if (A.ctx) loadSamples();
  begin();
  requestAnimationFrame(frame);
  const mine = E;
  return {
    update(next: PhysicsRun) {
      if (E !== mine) return;
      const was = R.run;
      R.run = next;
      // the engine chained her flow to its cleaning: her flow ends as she makes the commander clean it (the floor's dirt is the gauge it starts at)
      if (was && was.physicsId !== next.physicsId && next.gulp !== undefined && !isGulpPhysics(env.registries.contactPhysics.get(next.physicsId))) {
        R.chained = true;
        R.floor0 = next.gauge;
        R.puddleLow = null;
        if (G.phase === 'loop' || G.phase === 'entry') endFlow();
      }
    },
    finish(end: PhysicsEnd): number {
      if (E !== mine) return 0;
      R.ended = end.result;
      refreshLines();
      if (G.phase === 'loop' || G.phase === 'entry') { endFlow(); return END_MS; } // her flow's end (released): she lets go
      if (G.phase === 'after') return END_MS;
      if (G.phase === 'clean') {
        // the engine checked the floor (at 10 % left, or its 40 s were up): her check plays
        if (G.light < 0) { G.light = 0; sense('She looks at the floor against the light.'); }
        return Math.round(1700 * (1 - Math.min(1, G.light)) + 1800 + 600);
      }
      return G.phase === 'done' ? 2600 : 0;
    },
    stop() {
      if (E === mine) stopGulp();
    },
  };
}

/**
 * Gulp by field: the physics is a timing one on a fill gauge tagged for watersports (her stream), or the cleaning that follows it (an order on
 * a dirt gauge whose run carries the gulp's spills: the floor is the gulp's own). Alone (a second physics is the card's).
 */
export function gulpMatches(run: PhysicsRun, _state: CampaignState, reg: Registries): boolean {
  if (run.second) return false;
  const p = reg.contactPhysics.get(run.physicsId);
  if (isGulpPhysics(p)) return Array.isArray(p?.contentTags) && (p!.contentTags as string[]).includes('watersports');
  return run.gulp !== undefined && p?.interaction === 'order' && (p.gauge as { kind?: string } | undefined)?.kind === 'dirt';
}

registerInstrument({ id: 'gulp', matches: gulpMatches, start: startGulp_ });

/** Tests and the shots only: the prototype's state and hooks (its `window.__S`, `__G`, `__begin`, `__gulp`, `__breathe`, `__tap`). */
export const _gulp = {
  ST,
  get G(): Any { return G; },
  get S(): Any { return S; },
  get R(): Wiring { return R; },
  get LINES(): Record<string, Record<string, string[]>> { return LINES; },
  get overImgs() { return overImgs; },
  begin, startGulp, startBreath, cough, spill, tap, endFlow, finish, startClean, sayL, refreshLines, wipePuddle, puddleLeft, puddleRect, update, render, tideH, lick, planFlow, fresh, digest,
  setG(g: Any): void { G = g; },
  seed(n: number): void { reseed(n); },
  /** The shots: the frame clock starts again (a fake clock installed after the page began). */
  resetClock(): void { last = E ? E.env.now() : 0; },
};
