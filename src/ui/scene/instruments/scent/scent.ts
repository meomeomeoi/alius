/**
 * P10e-e Task 18: scent as an instrument (`docs/prototypes/saturation.html`, normative; its `fidelity.json` checks the port against it). Her
 * scent thickens the air under her: the mouse is the commander's face (closer to her places, the scent is stronger), Space or the left button
 * on the frame breathes in through the nose (deeper the longer it is held: the arc at the face fills; past the tolerance the body revolts),
 * Shift or the right button breathes through the mouth (air without her scent: words leave the head; she may hear it). What is breathed in
 * becomes words circling the face: the head, whose capacity is the tolerance, is the gauge (R18). Her orders, her marks on her places and her
 * rare question (two of the head's words, her rule by style) are hers; a lie the body may give away by a cough. The shape of the dark is the
 * contact's (`occlusionOf`: `gap`, `seat`, `wedge`), the ceiling behind it (P10c), the room when none loads.
 *
 * The functions are the prototype's, copied (types added). The wiring, declared in `fidelity.json`:
 * - the engine's numbers are TUNING (`BAND`, `INHALE_FILL_MS`, `BEAT`); her band is `scentBand` of the part she presses (R19), the stage and
 *   the tolerance are the commander's own for her scent (`stimuli.ts`), the capacity `headCapacity`; her attention is the plan's beat by beat;
 * - every beat of a running segment is reported once as it ends (300 ms before the segment's end for the last): `inhale` with the words the
 *   head gained over what the engine holds (R18), `mouth_breath` with the words the mouth blew out in it (a relief the engine may catch:
 *   `cheatRoll`; her `mouth` line follows the engine's catch, `run.tally.cheatsCaught`); a deep breath is P15a's `physics/stimulus` (its depth
 *   lands in the zone of the engine that the body's own answer names); her question's answer is `physics/answer` (R20), at once, or for a lie
 *   once the body gave it away (a cough within two breaths) or kept it;
 * - her lines are `cardVoice` `scent.*` by her style (ruling Q; cold is silent), held in the prototype's `LINES` shape; her question's words
 *   (`STYLES[].ask`) and what her rule finds missing (`judge`) are rows too;
 * - her orders and her question keep the prototype's own timing (the engine plans none for a decision physics), on the module's xorshift;
 * - `performance`, `setTimeout`, `requestAnimationFrame`, `innerWidth` / `innerHeight` and `Math.random` are this module's own (the scene's
 *   frame clock, the mount's timers and frames, the scene's size, a xorshift seeded by the scene and the run: no rng draw);
 * - the end is the engine's: on its outcome the exit plays through `finish`.
 */
import type { Registries } from '../../../../content/types';
import { ceilingOf } from '../../../../engine/backdrops';
import { STAGES } from '../../../../engine/blocking/types';
import { fnv1a } from '../../../../engine/hub';
import { occlusionOf } from '../../../../engine/physics/occlusion';
import { scentBand } from '../../../../engine/physics/scent';
import { contactTargetOf } from '../../../../engine/blocking';
import type { PhysicsRun, SegmentInput } from '../../../../engine/physics/state';
import { exposedKinds, headCapacity, inhaleZone, toleranceOf } from '../../../../engine/physics/stimuli';
import { leadStyle, physicsStyleOf } from '../../../../engine/physics/style';
import type { CampaignState } from '../../../../engine/state/types';
import { TUNING } from '../../../../engine/tuning';
import { voiceLines, type VoiceKind } from '../../cards/voice';
import { registerInstrument } from '../host';
import { S as darkS, SHAPES } from '../kit/dark';
import { DS, lowres } from '../kit/lowres';
import { clamp, lerp, smooth } from '../kit/math';
import { claimStyles, noteWrites, releaseClaim, writeClaimed, type StyleClaim } from '../styleClaims';
import type { InstrumentEnv, InstrumentRun, PhysicsEnd } from '../types';
import { answerWords, askWords, buildPills, wordEls, type Pill } from './question';
import { AMBIENT_MS, BAND_W, BASE_I, COLORS, PLACE_W, SCENT, STAGE_PULL, STAGE_RANK, STAGE_W, STYLES, ZONE_IDS, type StyleRow } from './words';

/* ---------- the wiring: the mount, the clock, the timers, the frames and the size of the scene ---------- */
interface ScentEls {
  env: InstrumentEnv;
  box: HTMLElement;
  els: Record<string, HTMLElement>;
  mirror: HTMLElement;
  claims: StyleClaim[];
  frameId: number | null;
}
let E: ScentEls | null = null;
export let innerWidth = 0, innerHeight = 0;
export const performance = { now: (): number => (E ? E.env.now() : 0) };
export function setTimeout(fn: () => unknown, ms: number): void {
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
/** No rng: the prototype's `Math.random` is a xorshift seeded by the scene and the run (the same run draws the same orders and motes). */
let seed = 2463534242;
function rnd01(): number {
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5; seed >>>= 0;
  return seed / 4294967296;
}
// eslint-disable-next-line @typescript-eslint/naming-convention
export const Math: typeof globalThis.Math = Object.create(globalThis.Math, { random: { value: rnd01 } });

export const $ = (s: string): HTMLElement => {
  const e = E!;
  if (s === '#mirror') return e.mirror;
  if (s === '#reply') return e.env.reply;
  if (s === '#cmd') return e.env.input;
  return e.els[s]!;
};
const inputLine = (env: InstrumentEnv): HTMLElement => env.input.closest<HTMLElement>('.alius-input-line') ?? env.input.parentElement ?? env.input;

/* ---------- the prototype's helpers ---------- */
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)]!;
export const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
export const rand = (a: number, b: number) => a + Math.random() * (b - a);

/* ---------- the engine's numbers (TUNING.physics.saturation, TUNING.stimuli) ---------- */
export let BEAT = TUNING.physics.beatMs;
const BAND: Record<string, number> = { ...TUNING.physics.saturation.bandFactor };
const INHALE_FILL_MS = TUNING.stimuli.inhale.fillMs;

/** The prototype's row for a style it has no row of: by how she gives her cues (`TUNING.physics.style[].cues`). */
const ROW_BY_CUES: Record<string, string> = { honest: 'neutral', count: 'ritual', announce: 'ritual', false: 'playful', none: 'cruel', sparse: 'cruel', shift: 'clinical' };
/** The prototype's contact by the shape of the dark (its views are keyed by contact; the game reads the contact's `occlusion` by field). */
export const CONTACT_OF: Record<string, string> = { gap: 'feet_on_face', seat: 'face_to_bottom', wedge: 'smothered_armpit' };
/** Her named places by the contact, in the order of the prototype's `LINES.here` (the lines are `cardVoice` `scent.here.<contact>`). */
export const HERE_ZONES: Record<string, string[]> = { feet_on_face: ['toes', 'arch', 'heel', 'ball'], face_to_bottom: ['center', 'side'], smothered_armpit: ['hollow', 'edge'] };

/* ---------- settings (saturation.html `S`: the approved defaults; the contact, her band, the stage, the tolerance, her style and name, the still form are the run's and the scene's) ---------- */
export const S = {
  stretch: 'natural', breathRec: true, look: 'motes', contact: 'feet_on_face' as 'feet_on_face' | 'face_to_bottom' | 'smothered_armpit', band: 'strong', color: 'sweat', stage: 'enduring', tol: 20, style: 'neutral', task: 'reading', name: 'Vela',
  layers: { orders: true, words: true, drift: true, tint: true, need: true }, sound: true, vol: 0.7, debug: false, angle: -14, side: { wedge: 'right' }, len: 90,
  reduced: false, readable: false,
};
export const ST = (): StyleRow => STYLES[S.style]!;

/** Her lines in the prototype's `LINES` shape, filled from `cardVoice` `scent.*` by her style (`refreshLines`); `ask` and `miss` are her question's. */
export interface Lines {
  entry: Record<string, string[]>; deeper: string[]; gently: string[]; still: string[]; here: Record<string, Array<[string, string]>>; moved: string[];
  good: string[]; bad: string[]; mouth: Record<string, string[]>; away: string[]; cough: string[];
  answer: { ok: Record<string, string[]>; bad: Record<string, string[]>; empty: string[] };
  liar: string[]; caught: string[]; lost: { low: string[]; high: string[] }; need: string[]; end: string[]; stop: string[];
  ask: string[]; miss: Record<string, string[]>;
}
const noLines = (): Lines => ({
  entry: {}, deeper: [], gently: [], still: [], here: {}, moved: [], good: [], bad: [], mouth: {}, away: [], cough: [], answer: { ok: {}, bad: {}, empty: [] },
  liar: [], caught: [], lost: { low: [], high: [] }, need: [], end: [], stop: [], ask: [], miss: {},
});
export let LINES: Lines = noLines();

/* ---------- audio ---------- */
interface Audio {
  ctx: AudioContext | null; master?: GainNode; world?: BiquadFilterNode; body?: GainNode; white?: AudioBuffer; pink?: AudioBuffer; brown?: AudioBuffer; roomG?: GainNode; droneG?: GainNode;
}
let A: Audio = { ctx: null };
function audioInit() {
  if (A.ctx) { loadSample(); return; }
  const ctx = E?.env.samples?.ctx() ?? null;
  const out = E?.env.samples?.bus('body') ?? null;
  if (!ctx || !out) return;
  A.ctx = ctx;
  A.master = ctx.createGain(); A.master.gain.value = S.sound ? S.vol : 0; A.master.connect(out);
  A.world = ctx.createBiquadFilter(); A.world.type = 'lowpass'; A.world.frequency.value = 14000; A.world.connect(A.master);
  A.body = ctx.createGain(); A.body.connect(A.master);
  const mk = (sec: number, fill: (d: Float32Array) => void) => { const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate); fill(b.getChannelData(0)); return b; };
  A.white = mk(2, (d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
  A.pink = mk(3, (d) => { let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; } });
  A.brown = mk(4, (d) => { let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } });
  const room = ctx.createBufferSource(); room.buffer = A.brown; room.loop = true;
  const rl = ctx.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 500; A.roomG = ctx.createGain(); A.roomG.gain.value = 0.05;
  room.connect(rl); rl.connect(A.roomG); A.roomG.connect(A.world); room.start();
  // the drone of a full head: two close tones and a warm hiss, rising with the saturation
  A.droneG = ctx.createGain(); A.droneG.gain.value = 0; A.droneG.connect(A.body);
  for (const f of [98, 99.6, 147.2]) { const o = ctx.createOscillator(); o.frequency.value = f; const g = ctx.createGain(); g.gain.value = f > 140 ? 0.25 : 0.5; o.connect(g); g.connect(A.droneG); o.start(); }
  const hiss = ctx.createBufferSource(); hiss.buffer = A.brown; hiss.loop = true; const hl = ctx.createBiquadFilter(); hl.type = 'bandpass'; hl.frequency.value = 700; hl.Q.value = 0.6;
  const hg = ctx.createGain(); hg.gain.value = 0.6; hiss.connect(hl); hl.connect(hg); hg.connect(A.droneG); hiss.start();
  loadSample();
}
interface NoiseOpts { at?: number; dur?: number; type?: BiquadFilterType; f?: number; f2?: number; q?: number; gain?: number; attack?: number; dest?: AudioNode }
function noise({ at = 0, dur = 0.2, type = 'bandpass', f = 1000, f2, q = 1, gain = 0.1, attack = 0.01, dest = A.world! }: NoiseOpts) {
  if (!A.ctx) return null;
  const ctx = A.ctx, t = ctx.currentTime + at;
  const src = ctx.createBufferSource(); src.buffer = A.white!; src.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl); fl.connect(g); g.connect(dest); src.start(t, Math.random()); src.stop(t + dur + 0.05);
  return src;
}
function thump(at: number, gain: number, f0 = 55, dest = A.body!) {
  if (!A.ctx) return;
  const ctx = A.ctx, t = ctx.currentTime + at;
  const o = ctx.createOscillator(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + 0.15);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.3);
}
export const SFX = {
  pen: () => { const n = randInt(3, 5); for (let i = 0; i < n; i++) noise({ at: i * 0.05 + Math.random() * 0.02, dur: 0.035 + Math.random() * 0.03, f: 2600 + Math.random() * 1800, q: 3, gain: 0.05 }); },
  exhale: (d: number) => exhaleSound(d),
  cough: () => { for (let i = 0; i < 3; i++) { noise({ at: i * 0.22, dur: 0.16, f: 500, f2: 260, q: 0.8, gain: 0.4, attack: 0.005, dest: A.body }); thump(i * 0.22, 0.35, 90); } },
  page: () => noise({ dur: 0.32, f: 2400, f2: 1200, q: 0.8, gain: 0.05, attack: 0.05 }), // she turns a page: she is busy with it
  chime: () => { if (!A.ctx) return; const o = A.ctx.createOscillator(); o.frequency.value = 880; const g = A.ctx.createGain(); const t = A.ctx.currentTime; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6); o.connect(g); g.connect(A.world!); o.start(t); o.stop(t + 0.7); },
};
/* ---------- the recorded breath (assets/sounds/breath-in-out.mp3, CC0): one inhale and one exhale ---------- */
const SAMPLE_FILE = 'assets/sounds/breath-in-out.mp3';
const SAMPLE: { buf: AudioBuffer | null; rms: Float32Array | null; paul?: AudioBuffer; inS: number; susS: number; susE: number; inE: number; exS: number; exE: number } = { buf: null, rms: null, inS: 0.12, susS: 0.5, susE: 0.92, inE: 1.44, exS: 2.17, exE: 3.23 };
/* the level of the recording every 10 ms: grains are evened out against it, so the stretched middle never pulses */
const rmsAt = (sec: number) => { const r = SAMPLE.rms!; return r[clamp(Math.round(sec * 100), 0, r.length - 1)] || 1e-4; };
function fft(re: Float32Array, im: Float32Array, inv: boolean) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j]!, re[i]!]; [im[i], im[j]] = [im[j]!, im[i]!]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI / len) * (inv ? 1 : -1), wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2]! * cr - im[i + k + len / 2]! * ci, ai = re[i + k + len / 2]! * ci + im[i + k + len / 2]! * cr;
        re[i + k + len / 2] = re[i + k]! - ar; im[i + k + len / 2] = im[i + k]! - ai; re[i + k]! += ar; im[i + k]! += ai;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i]! /= n; im[i]! /= n; }
}
function paulstretch(data: Float32Array, sr: number, from: number, to: number, outSec: number, win = 4096) {
  const inp = data.subarray(Math.floor(from * sr), Math.floor(to * sr));
  const hop = win / 2, frames = Math.ceil((outSec * sr) / hop), out = new Float32Array(frames * hop + win);
  const w = new Float32Array(win).map((_, i) => { const x = (2 * i) / (win - 1) - 1; return Math.pow(1 - x * x, 1.25); });
  const re = new Float32Array(win), im = new Float32Array(win);
  for (let f = 0; f < frames; f++) {
    const pos = Math.floor((f / Math.max(1, frames - 1)) * (inp.length - win));
    for (let i = 0; i < win; i++) { re[i] = (inp[pos + i] || 0) * w[i]!; im[i] = 0; }
    fft(re, im, false);
    for (let i = 0; i < win; i++) { const m = Math.hypot(re[i]!, im[i]!), ph = Math.random() * 2 * Math.PI; re[i] = m * Math.cos(ph); im[i] = m * Math.sin(ph); }
    fft(re, im, true);
    for (let i = 0; i < win; i++) out[f * hop + i]! += re[i]! * w[i]!;
  }
  // match the loudness of the source's middle
  let a = 0, b = 0; for (const v of inp) a += v * v; for (const v of out) b += v * v;
  const g = Math.sqrt(a / inp.length) / Math.sqrt(b / out.length || 1); for (let i = 0; i < out.length; i++) out[i]! *= g;
  return out;
}
async function loadSample() {
  if (SAMPLE.buf || !A.ctx) return;
  const ctx = A.ctx, samples = E?.env.samples;
  const src = samples?.buffer(SAMPLE_FILE) ?? null;
  if (!src) { void samples?.preload([SAMPLE_FILE]); return; } // decoded on a later frame (none: the synthesised breath)
  // a copy of the layer's shared buffer (the slap plays it as it is)
  const buf = ctx.createBuffer(1, src.length, src.sampleRate); buf.copyToChannel(src.getChannelData(0).slice(), 0);
  const d = buf.getChannelData(0); let pk = 0; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]!));
  const g = 0.9 / (pk || 1); for (let i = 0; i < d.length; i++) d[i]! *= g; // the recording is quiet: bring it to full scale
  const fr = Math.round(buf.sampleRate / 100), rms = new Float32Array(Math.ceil(d.length / fr));
  for (let i = 0; i < rms.length; i++) { let acc = 0, n = 0; for (let j = Math.max(0, (i - 3) * fr); j < Math.min(d.length, (i + 4) * fr); j++) { acc += d[j]! * d[j]!; n++; } rms[i] = Math.sqrt(acc / Math.max(1, n)); }
  SAMPLE.rms = rms; SAMPLE.buf = buf;
  const st = paulstretch(d, buf.sampleRate, SAMPLE.susS, SAMPLE.susE, 5);
  SAMPLE.paul = ctx.createBuffer(1, st.length, buf.sampleRate); SAMPLE.paul.copyToChannel(st, 0);
}
const useRec = () => S.breathRec && SAMPLE.buf && A.ctx;
const REC: { out: GainNode | null; srcs: AudioBufferSourceNode[]; timer: ReturnType<typeof globalThis.setInterval> | null; next: number; rate: number; tail: boolean; kind: string | null; mode?: string; level?: number; sus?: GainNode | null; pos?: number; dir?: number } = { out: null, srcs: [], timer: null, next: 0, rate: 1, tail: false, kind: null };
/* a sine window at four times overlap keeps the power flat */
const SINE = new Float32Array(64).map((_, i) => Math.sin((Math.PI * i) / 63));
function piece(dest: AudioNode, from: number, to: number, at: number, rate: number, fadeIn = 0.015, fadeOut = 0.03, gain = 1, grain = false) {
  const ctx = A.ctx!, src = ctx.createBufferSource(); src.buffer = SAMPLE.buf; src.playbackRate.value = rate;
  const g = ctx.createGain(), dur = (to - from) / rate;
  if (grain) g.gain.setValueCurveAtTime(SINE.map((v) => v * gain), at, dur);
  else { g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + fadeIn); g.gain.setValueAtTime(gain, Math.max(at + fadeIn, at + dur - fadeOut)); g.gain.linearRampToValueAtTime(0, at + dur); }
  src.connect(g); g.connect(dest); src.start(at, from); src.stop(at + dur + 0.01);
  REC.srcs.push(src); src.onended = () => { const i = REC.srcs.indexOf(src); if (i >= 0) REC.srcs.splice(i, 1); };
  return at + dur;
}
function recOut(kind: string) {
  const ctx = A.ctx!, out = ctx.createGain(); out.gain.value = kind === 'mouth' ? 0.25 : 0.21; // half of the first level (author)
  const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = kind === 'mouth' ? 1600 : 3200; tone.Q.value = 0.5; // the recording is crisp: soften its top (author: a little more muffled)
  out.connect(tone); tone.connect(A.body!); return out;
}
function recInhale(kind = 'nose') {
  recStop(0.03);
  const ctx = A.ctx!, t = ctx.currentTime + 0.01;
  REC.out = recOut(kind); REC.kind = kind; REC.tail = false; REC.mode = S.stretch;
  if (S.stretch === 'natural') {
    // no stretch at all: the whole inhale, slowed to the time the lungs take to fill here (1.32 s of recording over 1.5 s)
    REC.rate = ((SAMPLE.inE - SAMPLE.inS) / (INHALE_FILL_MS / 1000)) * (kind === 'mouth' ? 0.95 : 1) * rand(0.97, 1.03);
    piece(REC.out, SAMPLE.inS, SAMPLE.inE, t, REC.rate, 0.02, 0.2);
    REC.tail = true; return;
  }
  REC.rate = (kind === 'mouth' ? 0.86 : 1) * rand(0.96, 1.04);
  REC.level = rmsAt(SAMPLE.susS);
  if (S.stretch === 'paul') {
    // the onset as recorded, then the paulstretched middle under it, then (when full) the recorded tail
    const end = piece(REC.out, SAMPLE.inS, SAMPLE.susS + 0.12, t, REC.rate, 0.02, 0.14);
    const src = ctx.createBufferSource(); src.buffer = SAMPLE.paul!; src.playbackRate.value = REC.rate;
    const g = ctx.createGain(); const at = end - 0.14;
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(1, at + 0.14);
    src.connect(g); g.connect(REC.out); src.start(at, rand(0, 0.5)); REC.srcs.push(src); REC.sus = g;
    return;
  }
}
/* the lungs are full: the tail of the inhale, from where the grains leave off */
function recTail() {
  if (!REC.out || REC.tail) return;
  REC.tail = true; clearInterval(REC.timer!); REC.timer = null;
  if (REC.mode === 'paul' && REC.sus) {
    const t = A.ctx!.currentTime; REC.sus.gain.cancelScheduledValues(t); REC.sus.gain.setValueAtTime(REC.sus.gain.value, t); REC.sus.gain.linearRampToValueAtTime(0, t + 0.15);
    piece(REC.out, SAMPLE.susE - 0.08, SAMPLE.inE, t, REC.rate, 0.12, 0.15, 0.85); REC.sus = null; return;
  }
}
function recStop(fade = 0.08) {
  clearInterval(REC.timer!); REC.timer = null;
  if (REC.out) { const t = A.ctx!.currentTime; REC.out.gain.cancelScheduledValues(t); REC.out.gain.setValueAtTime(REC.out.gain.value, t); REC.out.gain.linearRampToValueAtTime(0, t + fade); const o = REC.out; setTimeout(() => o.disconnect(), (fade + 0.1) * 1000); }
  for (const s0 of REC.srcs.splice(0)) { try { s0.stop(A.ctx!.currentTime + fade + 0.02); } catch { /* already stopped */ } }
  REC.out = null; REC.kind = null; REC.sus = null;
}
/* the exhale: shorter and softer after a shallow breath */
function recExhale(d: number, kind = 'nose') {
  const ctx = A.ctx!, out = recOut(kind), rate = (kind === 'mouth' ? 0.88 : 1) * rand(0.95, 1.05);
  const len = (SAMPLE.exE - SAMPLE.exS) * (0.35 + 0.65 * clamp(d, 0, 1));
  piece(out, SAMPLE.exS, SAMPLE.exS + len, ctx.currentTime + 0.02, rate, 0.02, Math.min(0.25, len * 0.4), (0.35 + 0.65 * clamp(d, 0, 1)) * 0.75); // the exhale is louder than the inhale in the recording
  setTimeout(() => out.disconnect(), (len / rate + 0.5) * 1000);
}
/* the mouth: short inhales and exhales in turn, about 0.7 a second */
const MOUTHREC = { next: 0, inward: true };
function recMouthTick() {
  const t = A.ctx!.currentTime;
  if (t < MOUTHREC.next) return;
  const out = recOut('mouth'), rate = 0.86 * rand(0.95, 1.05), len = 0.55;
  if (MOUTHREC.inward) piece(out, SAMPLE.inS + 0.05, SAMPLE.inS + 0.05 + len, t + 0.01, rate, 0.04, 0.2, 0.9);
  else piece(out, SAMPLE.exS, SAMPLE.exS + len, t + 0.01, rate, 0.03, 0.22, 0.8);
  setTimeout(() => out.disconnect(), 1200);
  MOUTHREC.inward = !MOUTHREC.inward; MOUTHREC.next = t + 0.72;
}

const BR: { kind: string | null; src: AudioBufferSourceNode | null; f1: BiquadFilterNode | null; f2: BiquadFilterNode | null; env: GainNode | null; flut: GainNode | null; lfo: OscillatorNode | null; t0: number } = { kind: null, src: null, f1: null, f2: null, env: null, flut: null, lfo: null, t0: 0 };
function breathSound(kind: string) {
  if (useRec()) { if (BR.kind === kind) return; breathStop(); BR.kind = kind; if (kind === 'nose') recInhale('nose'); else MOUTHREC.next = 0; return; }
  if (!A.ctx || BR.kind === kind) return;
  breathStop();
  const ctx = A.ctx, t = ctx.currentTime, nose = kind === 'nose';
  const src = ctx.createBufferSource(); src.buffer = A.pink!; src.loop = true;
  const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = nose ? 680 : 520; f1.Q.value = nose ? 1.6 : 0.9;
  const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = nose ? 2300 : 1350; f2.Q.value = nose ? 2.4 : 1.1;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4800;
  const g1 = ctx.createGain(); g1.gain.value = 1; const g2 = ctx.createGain(); g2.gain.value = nose ? 0.55 : 0.4; const g3 = ctx.createGain(); g3.gain.value = nose ? 0.14 : 0.05;
  const env = ctx.createGain(); env.gain.setValueAtTime(0.0001, t);
  const flut = ctx.createGain(); flut.gain.value = 1;
  const lfo = ctx.createOscillator(); lfo.frequency.value = rand(8, 13); const lfoG = ctx.createGain(); lfoG.gain.value = 0.16; lfo.connect(lfoG); lfoG.connect(flut.gain); lfo.start(t);
  src.connect(f1); f1.connect(g1); g1.connect(env); src.connect(f2); f2.connect(g2); g2.connect(env); src.connect(hp); hp.connect(g3); g3.connect(env);
  env.connect(flut); flut.connect(A.body!); src.start(t, Math.random() * 2);
  Object.assign(BR, { kind, src, f1, f2, env, flut, lfo, t0: t });
}
/* every frame: the nose follows the depth (silent once the lungs are full), the mouth breathes in and out about 0.7 times a second */
function breathTick() {
  if (useRec() && BR.kind) { if (REC.sus) REC.sus.gain.setTargetAtTime(1 - 0.35 * clamp(G.depth, 0, 1), A.ctx!.currentTime, 0.1); if (BR.kind === 'nose' && G.depth >= 0.95) recTail(); if (BR.kind === 'mouth') recMouthTick(); return; }
  if (!BR.src) return;
  const t = A.ctx!.currentTime;
  if (BR.kind === 'nose') {
    const d = G.depth, shape = Math.pow(Math.sin(Math.PI * clamp(d / 1.12, 0, 1)), 0.7);
    BR.env!.gain.setTargetAtTime(Math.max(0.0001, 0.2 * shape * (0.6 + 0.4 * G.I)), t, 0.04);
    BR.f1!.frequency.setTargetAtTime(620 + d * 300, t, 0.08); BR.f2!.frequency.setTargetAtTime(2100 + d * 500, t, 0.08);
  } else {
    const ph = (t - BR.t0) * 0.7 * Math.PI * 2, inward = Math.sin(ph) > 0;
    BR.env!.gain.setTargetAtTime(0.02 + 0.17 * Math.pow(Math.abs(Math.sin(ph)), 1.6), t, 0.03);
    BR.f1!.frequency.setTargetAtTime(inward ? 600 : 440, t, 0.1); BR.f2!.frequency.setTargetAtTime(inward ? 1500 : 1150, t, 0.1);
  }
}
function breathStop() {
  if (useRec()) { if (BR.kind === 'nose') recStop(0.08); BR.kind = null; return; }
  if (!BR.src) return;
  const t = A.ctx!.currentTime; BR.env!.gain.cancelScheduledValues(t); BR.env!.gain.setValueAtTime(Math.max(0.0001, BR.env!.gain.value), t); BR.env!.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  BR.src.stop(t + 0.15); BR.lfo!.stop(t + 0.15); BR.src = null; BR.kind = null;
}
/* the exhale through the nose: softer and lower, longer after a deep breath */
function exhaleSound(d: number) {
  if (useRec()) { if (d >= 0.05) recExhale(d); return; }
  if (!A.ctx || d < 0.05) return;
  const ctx = A.ctx, t = ctx.currentTime, dur = 0.5 + d * 0.7;
  const src = ctx.createBufferSource(); src.buffer = A.pink!; src.loop = true;
  const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.setValueAtTime(560, t); f1.frequency.exponentialRampToValueAtTime(380, t + dur); f1.Q.value = 1.2;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06 + d * 0.09, t + 0.07); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f1); f1.connect(lp); lp.connect(g); g.connect(A.body!); src.start(t, Math.random() * 2); src.stop(t + dur + 0.05);
}

/* ---------- state ---------- */
/** A word element of the head (the prototype's expando fields). */
export type WordEl = HTMLElement & { _p: number[]; _a: number; _born: number; _spd: number; _gone?: number; _out?: number[]; _slot?: number; _choose?: () => void };
export interface HeadWord { w: string; cat: string; el: WordEl; lie?: boolean }
export interface Zone { id: string; p: number[]; w: number }
export interface Order { k: string; band?: number[]; until: number; from?: number[]; zone?: string; ti?: number; moved?: boolean; chosen?: Pill[]; place?: string; lies?: Pill[] }
export interface Glob {
  phase: string; phaseT: number; clock: number; sat: number; darkA: number; cam: number; nose: number[]; drift: number[]; mouse: number[];
  inhaling: boolean; depth: number; peak: number; mouth: boolean; mouthMs: number; mouthTick: number; sinceBreath: number; reflexCd: number; lost: number; forcedDeep: boolean;
  head: HeadWord[]; ambAt: number; wordsTaken: number; askPlace: string | null;
  order: Order | null; nextOrderAt: number; nextAskAt: number; att: string; awayMs: number; lie: number; beat: number;
  counts: Record<string, number>;
  o: number; sp: Array<{ L: number; v: number; k: number }>; zones: Zone[]; I: number; hereZone: string | null; shake: number; endAt: number;
  zoneNow?: Zone | null; cycleI?: number; tourStep?: number; tourI?: number; reason?: string; peakSat?: number; overload?: number;
}
export let G: Glob;
function fresh(): Glob {
  return { phase: 'idle', phaseT: 0, clock: 0, sat: 0, darkA: 0, cam: 0, nose: [0.5, 0.55], drift: [0, 0], mouse: [0.5, 0.55],
    inhaling: false, depth: 0, peak: 0, mouth: false, mouthMs: 0, mouthTick: 0, sinceBreath: 0, reflexCd: 0, lost: 0, forcedDeep: false,
    head: [], ambAt: 0, wordsTaken: 0, askPlace: null,
    order: null, nextOrderAt: 3 * BEAT, nextAskAt: rand(14000, 18000), att: 'busy', awayMs: 0, lie: 0, beat: -1,
    counts: { liesFound: 0, breaths: 0, deep: 0, coughs: 0, lost: 0, mouthWords: 0, noticed: 0, ordersOk: 0, ordersBad: 0, answered: 0, wrong: 0, empty: 0, lies: 0, caught: 0, away: 0 },
    o: 0.35, sp: [{ L: 0.35, v: 0, k: 58 }, { L: 0.35, v: 0, k: 74 }], zones: [], I: 0, hereZone: null, shake: 0, endAt: S.len * 1000 };
}
G = fresh();

/* ---------- her hand ---------- */
export function say(text: string | undefined, big = false, at?: number[]) {
  if (!text) return;
  const el = document.createElement('div') as unknown as WordEl;
  el.className = 'her-line' + (big ? ' big' : '');
  el.textContent = text;
  el.style.setProperty('--write', `${Math.max(160, text.length * 36)}ms`);
  el.style.setProperty('--steps', String(Math.max(4, text.length * 2)));
  // the lowest free line: a fading line still holds its place until it is gone
  const used = new Set([...$('#hand').children as unknown as WordEl[]].filter((x) => !x.classList.contains('big')).map((x) => x._slot));
  let stack = 0; if (!big) while (used.has(stack)) stack++;
  el._slot = big ? -1 : stack;
  const p = at ?? [0.6, 0.14];
  el.style.left = `${p[0]! * innerWidth + rand(-14, 14)}px`; el.style.top = `${p[1]! * innerHeight + stack * 52 + rand(-6, 6)}px`;
  el.style.transform = `rotate(${rand(-4, 3).toFixed(1)}deg)`;
  $('#hand').appendChild(el); SFX.pen();
  if (!big) setTimeout(() => { el.classList.add('gone'); setTimeout(() => el.remove(), 600); }, 2600);
}

/* where her scent comes from: points on her, by contact (fractions of the screen), weighted; and what she calls them */
function zonesOf(W: number, H: number, s: { sway: number; sway2: number }) {
  const out: Zone[] = [];
  if (S.contact === 'feet_on_face') {
    const th = (S.angle * Math.PI) / 180, ax = [Math.sin(th), -Math.cos(th)], nx = [Math.cos(th), Math.sin(th)];
    const C = [0.5 + (s.sway * 0.004 * H) / W, 0.52], Lh = 0.78;
    const at = (k: number, side: number, off: number) => [C[0]! + (ax[0]! * (k * 2 - 1) * Lh * H + nx[0]! * side * off * H) / W, C[1]! + ax[1]! * (k * 2 - 1) * Lh + nx[1]! * side * off];
    out.push({ id: 'toes', p: at(0.76, 0, 0), w: 1.0 });
    for (const side of [-1, 1]) {
      out.push({ id: 'toes', p: at(0.72, side, 0.06), w: 0.9 }, { id: 'ball', p: at(0.6, side, 0.05), w: 0.8 }, { id: 'arch', p: at(0.45, side, 0.045), w: 0.55 }, { id: 'heel', p: at(0.27, side, 0.04), w: 0.65 });
    }
  } else if (S.contact === 'face_to_bottom') {
    const Lm = (G.sp[0]!.L + G.sp[1]!.L) / 2, Pm = 1.38 / (1 + 0.28 * Lm), V = [0.5 + (s.sway2 * 0.012 * H) / W, 0.3];
    out.push({ id: 'center', p: [V[0]!, V[1]! + (0.5 - clamp(Lm, 0, 1) * 0.2) * Pm - 0.04], w: 1.0 });
    out.push({ id: 'center', p: [V[0]!, V[1]! + 0.3 * Pm], w: 0.85 });
    for (const side of [-1, 1]) out.push({ id: 'side', p: [V[0]! + side * 0.24, 0.72], w: 0.45 });
  } else {
    const mirror = S.side.wedge === 'left', mx = (x: number) => (mirror ? 1 - x : x);
    const oc = Math.min(G.o, 1), yL = 1.07 - oc * 0.56, edge = (u: number) => lerp(yL, 1.02, u) + 0.06 * Math.sin(Math.PI * u) * (0.4 + 0.6 * oc);
    out.push({ id: 'hollow', p: [mx(0.6), 0.42], w: 1.0 }, { id: 'hollow', p: [mx(0.72), 0.58], w: 0.9 });
    out.push({ id: 'edge', p: [mx(0.32), edge(0.37) - 0.05], w: 0.5 }, { id: 'edge', p: [mx(0.14), edge(0.15) - 0.05], w: 0.45 });
  }
  return out;
}
/* the scent at the commander's nose: the nearest strong place, plus what hangs in the air */
function intensityAt(p: number[]) {
  const ar = innerWidth / innerHeight;
  let best = 0, zone: Zone | null = null;
  for (const z of G.zones) {
    const dx = (p[0]! - z.p[0]!) * ar, dy = p[1]! - z.p[1]!, d2 = dx * dx + dy * dy;
    const v = z.w * Math.exp(-d2 / (2 * 0.13 * 0.13));
    if (v > best) { best = v; zone = z; }
  }
  const base = BASE_I[S.contact]!;
  return { I: clamp(base + best * (1.1 - base), 0, 1.1), zone };
}

/* ---------- the rhythm of the game ---------- */
const stim = () => BAND[S.band]! / 1.5;                       // her band, 0.33 … 1.33
const tolT = () => 0.3 + (S.tol / 100) * 0.8;                 // the reflex threshold in stimulus units (TUNING.stimuli.reflexMult reading)
const tolDepth = () => tolT() / Math.max(0.05, G.I * stim()); // where on the arc the threshold falls, here
export const capacity = () => 6 + Math.round(S.tol / 12);            // what the head holds: tolerance is the saturation capacity (P15a §16.8)
/* her place: the face is there when it is within reach of the place she named */
const targetP = () => (G.order && (G.order.k === 'here' || G.order.k === 'ask') && G.order.ti! >= 0 && G.zones[G.order.ti!] ? G.zones[G.order.ti!]!.p : null);
function atTarget() { const tp = targetP(); if (!tp) return false; const ar = innerWidth / innerHeight; return Math.hypot((tp[0]! - G.nose[0]!) * ar, tp[1]! - G.nose[1]!) < 0.085; }
function weighted(obj: Record<string, number>) { const e = Object.entries(obj); let r = Math.random() * e.reduce((a, [, w]) => a + w, 0); for (const [k, w] of e) { r -= w; if (r <= 0) return k; } return e[0]![0]; }
/* the next order: by her style (weights, a ritual cycle, a clinical tour of her places) */
function newOrder() {
  if (!S.layers.orders) { G.nextOrderAt = G.clock + 4 * BEAT; return; }
  const st = ST();
  let k;
  if (st.cycle) k = st.cycle[(G.cycleI = ((G.cycleI ?? -1) + 1) % st.cycle.length)];
  else if (st.tour) k = (G.tourStep = (G.tourStep ?? -1) + 1) % 2 === 0 ? 'here' : pick(['deeper', 'gently']);
  else k = weighted(st.orders!);
  if (k === 'deeper') { G.order = { k, band: [0.7, 0.95], until: G.clock + 4500 }; say(pick(LINES.deeper)); }
  else if (k === 'gently') { G.order = { k, band: [0.25, 0.45], until: G.clock + 4500 }; say(pick(LINES.gently)); }
  else if (k === 'here') {
    let pair;
    if (st.tour || st.cycle) { const ids = ZONE_IDS[S.contact]!; const id = ids[(G.tourI = ((G.tourI ?? -1) + 1)) % ids.length]; pair = LINES.here[S.contact]!.find((x) => x[1] === id) ?? pick(LINES.here[S.contact]!); }
    else pair = pick(LINES.here[S.contact]!);
    nameplace(pair[0], pair[1]);
  }
  else if (k === 'still') { G.order = { k, until: G.clock + 3500, from: [...G.nose] }; say(pick(LINES.still)); }
}
export function nameplace(line: string, id: string, moved = false) {
  const ar = innerWidth / innerHeight, dist = (q: number[]) => Math.hypot((q[0]! - G.nose[0]!) * ar, q[1]! - G.nose[1]!);
  let ti = -1;
  G.zones.forEach((z, i) => { if (z.id !== id) return; const b = G.zones[ti]!; if (ti < 0 || z.w > b.w + 0.01 || (Math.abs(z.w - b.w) <= 0.01 && dist(z.p) < dist(b.p))) ti = i; });
  if (ti < 0) ti = 0;
  G.order = { k: 'here', zone: id, ti, band: [0.5, 0.9], until: G.clock + 7000, moved };
  G.hereZone = id; G.askPlace = id;
  const tp = G.zones[ti]!.p; say(line, false, [clamp(tp[0]! + 0.05, 0.04, 0.8), clamp(tp[1]! - 0.1, 0.06, 0.8)]); SFX.chime();
}
export function orderDone(ok: boolean) {
  if (!G.order) return;
  if (ok) { G.counts.ordersOk! += 1; if (Math.random() < 0.6) say(pick(LINES.good)); }
  else { G.counts.ordersBad! += 1; say(pick(LINES.bad)); if (S.style === 'cruel') press(); }
  G.order = null; G.hereZone = null;
  G.nextOrderAt = G.clock + randInt(...ST().every) * BEAT;
}
export function press() { G.o = Math.max(0.12, G.o - 0.15); G.shake = 1; for (const x of G.sp) x.v -= 1.6; thump(0, 0.4, 60); }
export function lift() { G.o = Math.min(0.75, G.o + 0.25); for (const x of G.sp) x.v += 1.2; }

/* ---------- the head: what the commander has breathed in, as words circling the face ---------- */
export function addWord(w: string, cat: string, from?: number[]) {
  const el = document.createElement('div') as unknown as WordEl; el.className = 'hw'; el.textContent = w;
  const p = from ?? G.nose;
  el._p = [p[0]!, p[1]!]; el._a = rand(0, Math.PI * 2); el._born = performance.now(); el._spd = rand(0.12, 0.26) * (Math.random() < 0.5 ? -1 : 1);
  $('#words').appendChild(el);
  G.head.push({ w, cat, el });
  G.wordsTaken += 1;
  if (G.order && G.order.k === 'ask') buildPills();
}
/* a breath leaves words: where (if at one of her places), what (her scent), how it felt (the honest stage), how strong (the band) */
function breathWords(d: number, forced = false) {
  if (d < 0.3) return;
  let n = d < 0.65 ? 1 : 2; if (G.I > 0.75) n += 1; if (forced) n += 1;
  const z = G.zoneNow, from = z ? z.p : G.nose, list: Array<[string, string]> = [];
  if (z && G.I > 0.5) list.push([pick(PLACE_W[z.id]!), 'place:' + z.id]);
  list.push([pick(SCENT[S.color]!), 'scent']);
  if (d >= 0.65) list.push([pick(STAGE_W[S.stage]!), 'stage:' + S.stage]);
  if (d >= 0.9) list.push([pick(BAND_W[S.band]!), 'band:' + S.band]);
  list.push([pick(SCENT[S.color]!), 'scent']);
  list.slice(0, n).forEach(([w, cat], i) => setTimeout(() => G.phase === 'loop' && addWord(w, cat, from), i * 160));
}
/* the mouth breathes words out: the oldest go first, flying off */
function blowWord() {
  const h = G.head.shift(); if (!h) return;
  h.el._gone = performance.now(); h.el._out = [h.el._p[0]! - G.nose[0]!, h.el._p[1]! - G.nose[1]!];
}
export function scatter(n: number) { for (let i = 0; i < n && G.head.length; i++) { const k = randInt(0, G.head.length - 1); const [h] = G.head.splice(k, 1); h!.el._gone = performance.now(); h!.el._out = [rand(-1, 1), rand(-1, 0.2)]; } }
function tickWords(dt: number) {
  const now = performance.now(), n = G.head.length, cap = capacity();
  const crowd = clamp(n / cap, 0, 1.3), asking = G.order && G.order.k === 'ask';
  G.head.forEach((h, i) => {
    const el = h.el;
    el._a += (dt / 1000) * h.el._spd * (1 + crowd);
    const ring = i % 2 ? 1 : 0.78, r = lerp(0.16, 0.085, smooth(0.2, 1.1, crowd)) * ring; // the more there is, the closer it crowds the face
    const tx = G.nose[0]! + (Math.cos(el._a) * r * innerHeight) / innerWidth, ty = G.nose[1]! + Math.sin(el._a) * r * 0.8;
    const age = (now - el._born) / 650;
    const k = age < 1 ? easeOut(age) * 0.2 + 0.02 : 0.12; // a new word flies in from where it was breathed
    el._p = [lerp(el._p[0]!, tx, k), lerp(el._p[1]!, ty, k)];
    el.style.left = `${(el._p[0]! * innerWidth).toFixed(1)}px`; el.style.top = `${(el._p[1]! * innerHeight).toFixed(1)}px`;
    el.style.opacity = asking ? '0' : String(clamp(0.45 + crowd * 0.45, 0, 1).toFixed(2));
    el.style.fontSize = `${(15 + crowd * 7).toFixed(1)}px`;
  });
  for (const el of [...$('#words').children as unknown as WordEl[]]) {
    if (!el._gone) continue;
    const t = (now - el._gone) / 700;
    el._p[0]! += el._out![0]! * 0.02; el._p[1]! += el._out![1]! * 0.02 - 0.004;
    el.style.left = `${el._p[0]! * innerWidth}px`; el.style.top = `${el._p[1]! * innerHeight}px`;
    el.style.opacity = String(Math.max(0, 0.8 - t)); el.style.filter = `blur(${(t * 4).toFixed(1)}px)`;
    if (t > 1.2) el.remove();
  }
  for (const el of wordEls) { el.style.left = `${el._p[0]! * innerWidth}px`; el.style.top = `${el._p[1]! * innerHeight}px`; if (asking) el.style.opacity = String(clamp((G.order!.until - G.clock) / 4000, 0.25, 1).toFixed(2)); }
  G.sat = (n / cap) * 100;
}

/* ---------- breathing ---------- */
function inhaleStart() { if (G.phase !== 'loop' || G.inhaling || G.reflexCd > 0 || G.lost > 0) return; G.inhaling = true; G.depth = 0; G.peak = 0; breathSound('nose'); }
function inhaleEnd(forced = false) {
  if (!G.inhaling) return;
  G.inhaling = false; breathStop();
  const d = G.depth;
  G.sinceBreath = 0; G.counts.breaths! += 1; if (d > 0.7) G.counts.deep! += 1;
  SFX.exhale(d);
  breathWords(d, forced);
  for (const x of G.sp) x.v += 0.3; // she feels the breath
  deepInhale(d, false);
  if (G.lie > 0) { G.lie -= 1; if (G.lie === 0) answered(null); }
  const o = G.order;
  if (o && (o.k === 'deeper' || o.k === 'gently' || o.k === 'here') && !forced) {
    const inBand = d >= o.band![0]! && d <= o.band![1]!;
    if (o.k === 'here' && atTarget() && inBand && ST().moves && !o.moved && Math.random() < ST().moves!) { // playful: she moves her mark once you get there
      const others = LINES.here[S.contact]!.filter((x) => x[1] !== o.zone); if (others.length) { say(pick(LINES.moved)); const p = pick(others); nameplace(p[0], p[1], true); return; }
    }
    orderDone(inBand && (o.k !== 'here' || atTarget()));
  } else if (!o && d > 0.75 && G.I > 0.7 && G.att === 'watching') { G.counts.caught! += 1; say(pick(LINES.caught)); }
}
function reflex() {
  G.inhaling = false; breathStop(); G.counts.coughs! += 1; G.reflexCd = 1400; G.shake = 1.4; G.sinceBreath = 0;
  SFX.cough(); burst(); scatter(2); // a cough throws words out of the head
  deepInhale(G.depth, true);
  if (G.lie > 0) { say(pick(LINES.liar)); G.lie = 0; answered(true); G.counts.liesFound! += 1; press(); setTimeout(press, 400); } else say(pick(LINES.cough));
  if (G.order && G.order.k !== 'ask' && G.order.k !== 'still') orderDone(false);
  const v = ($('#cmd') as HTMLInputElement).value; if (v) { ($('#cmd') as HTMLInputElement).value = v.slice(0, Math.max(0, v.length - randInt(3, 8))); tint.sync(true); }
}
/* the head overflows: the commander is lost in her for a moment; the face goes to her strongest place and breathes deep by itself */
function overflow() {
  G.lost = 3200; G.counts.lost! += 1; G.shake = 0.8;
  say(pick(STAGE_RANK[S.stage]! >= 3 ? LINES.lost.high : LINES.lost.low));
  setTimeout(() => { if (G.phase !== 'loop') return; G.inhaling = true; G.depth = 0; breathSound('nose'); G.forcedDeep = true; }, 900);
}

/* ---------- phases ---------- */
function begin() {
  audioInit(); if (A.ctx && A.ctx.state === 'suspended') void A.ctx.resume();
  $('#hand').replaceChildren(); $('#words').replaceChildren(); wordEls.length = 0;
  G = fresh(); G.phase = 'entry'; G.endAt = S.len * 1000;
  setTimeout(() => G.phase === 'entry' && say(pick(LINES.entry[S.contact]!)), 700);
}
function exit(reason: string) {
  if (G.phase !== 'loop' && G.phase !== 'entry') return;
  G.phase = 'exit'; G.phaseT = 0; G.reason = reason; G.inhaling = false; breathStop();
  for (const el of wordEls) el.remove(); wordEls.length = 0;
  scatter(G.head.length);
  setTimeout(() => { $('#hand').replaceChildren(); say(pick(reason === 'stop' ? LINES.stop : LINES.end), true, [0.56, 0.2]); }, 900);
}

/* ---------- the loop ---------- */
function updateLoop(dt: number) {
  G.clock += dt;
  breathTick();
  const h = dt / 1000;
  const beatNow = Math.floor(G.clock / BEAT);
  while (G.beat < beatNow) { G.beat += 1; G.att = attentionNow(); if (G.att === 'busy' && S.task === 'reading' && Math.random() < 0.35) SFX.page(); }
  // the air itself fills the head, by her band
  const amb = AMBIENT_MS[S.band];
  if (amb && (G.ambAt += dt) > amb) { G.ambAt = 0; addWord(pick(SCENT[S.color]!), 'scent', G.zones.length ? pick(G.zones).p : G.nose); }
  // the nose: the mouse, plus the body's own pull (and all of it toward her while lost)
  const z = intensityAt(G.nose); G.I = z.I; G.zoneNow = z.zone;
  const strongest = G.zones.slice().sort((a, b) => b.w - a.w)[0];
  if (G.lost > 0 && strongest) {
    G.drift[0]! += (strongest.p[0]! - G.nose[0]!) * h * 2.2; G.drift[1]! += (strongest.p[1]! - G.nose[1]!) * h * 2.2;
  } else if (S.layers.drift && z.zone) {
    const fill = 1 + clamp(G.sat / 100, 0, 1.2); // a full head pulls harder
    const pull = STAGE_PULL[S.stage]! * (STAGE_PULL[S.stage]! > 0 ? (G.inhaling ? 1.5 : 1) * fill : (G.inhaling ? 1 : 0));
    const dx = z.zone.p[0]! - G.nose[0]!, dy = z.zone.p[1]! - G.nose[1]!, d = Math.hypot(dx, dy) || 1;
    G.drift[0]! += (dx / d) * pull * 0.09 * h; G.drift[1]! += (dy / d) * pull * 0.09 * h;
  }
  G.drift = G.drift.map((v) => clamp(v * (1 - h * 0.35), -0.3, 0.3));
  const target = [clamp(G.mouse[0]! + G.drift[0]!, 0.02, 0.98), clamp(G.mouse[1]! + G.drift[1]!, 0.04, 0.96)];
  const k = G.lost > 0 ? 1.2 : 14 - clamp(G.sat / 100, 0, 1) * 8; // a full head is slow to steer
  G.nose = [lerp(G.nose[0]!, target[0]!, clamp(h * k, 0, 1)), lerp(G.nose[1]!, target[1]!, clamp(h * k, 0, 1))];
  // breathing in: deeper the longer it is held; past the tolerance the body revolts
  if (G.inhaling) {
    G.depth = Math.min(1.25, G.depth + dt / INHALE_FILL_MS); G.peak = Math.max(G.peak, G.depth);
    if (G.depth * G.I * stim() > tolT()) reflex();
    else if (G.forcedDeep && G.depth >= 1) { G.forcedDeep = false; inhaleEnd(true); }
  }
  G.reflexCd = Math.max(0, G.reflexCd - dt);
  // the mouth: air without her scent, words out of the head; short breaths are quiet, a long one is heard
  if (G.mouth && !G.inhaling && G.lost <= 0) {
    G.sinceBreath = 0; breathSound('mouth');
    G.mouthMs += dt; G.mouthTick -= dt;
    if (G.mouthTick <= 0 && G.head.length) {
      G.mouthTick = 420; blowWord(); G.counts.mouthWords! += 1;
      blown();
    }
  } else { if (!G.inhaling && BR.kind === 'mouth') breathStop(); G.mouthMs = 0; }
  // the need to breathe: some air, one way or the other
  G.sinceBreath += dt;
  if (S.layers.need && G.sinceBreath > 7000 && !G.inhaling && !G.mouth && G.lost <= 0) { G.sinceBreath = 0; G.inhaling = true; G.depth = 0; breathSound('nose'); G.forcedDeep = true; say(pick(LINES.need)); }
  // her orders, and her rare question
  if (G.order) {
    const o = G.order;
    if (o.k === 'still') {
      const moved = Math.hypot((G.nose[0]! - o.from![0]!) * innerWidth, (G.nose[1]! - o.from![1]!) * innerHeight);
      if (moved > 60) orderDone(false); else if (G.clock > o.until) orderDone(true);
    } else if (G.clock > o.until) {
      if (o.k === 'ask') { for (const el of wordEls) el.remove(); wordEls.length = 0; G.nextAskAt = G.clock + randInt(...ST().askEvery) * 1000; }
      orderDone(false);
    }
  } else if (G.clock > G.nextAskAt && S.layers.words) askWords();
  else if (G.clock > G.nextOrderAt) newOrder();
  // turning away while she wants closeness
  if (G.I < 0.2 && G.att !== 'busy') { G.awayMs += dt; if (G.awayMs > 2500) { G.awayMs = -4000; G.counts.away! += 1; say(pick(LINES.away)); press(); } } else G.awayMs = Math.min(G.awayMs, 0) + (G.awayMs < 0 ? dt : 0);
  // the head overflows
  if (G.head.length > capacity() && G.lost <= 0) overflow();
  if (G.lost > 0) { G.lost -= dt; if (G.lost <= 0) { scatter(Math.ceil(G.head.length / 2)); G.drift = [0, 0]; } }
  G.peakSat = Math.max(G.peakSat ?? 0, G.sat);
  G.o = lerp(G.o, 0.35, clamp(h * 0.5, 0, 1));
}
function heardMouth() {
  const m = ST().mouth; G.counts.noticed! += 1;
  const line = LINES.mouth[m]!; if (line.length) say(pick(line));
  if (m === 'punish' || m === 'permission') press();
  if (m === 'punish' && !G.order) { G.order = { k: 'still', until: G.clock + 3500, from: [...G.nose] }; }
  if (m === 'tease' && !G.order) { G.order = { k: 'deeper', band: [0.7, 0.95], until: G.clock + 4500 }; say(pick(LINES.deeper)); }
}

let mouse = [0.5, 0.55];
function frame(now: number) {
  const dt = Math.min(120, now - (frame.last ?? now)); frame.last = now;
  G.phaseT += dt;
  switch (G.phase) {
    case 'entry': G.cam = easeOut(G.phaseT / 1600); G.darkA = G.cam; if (G.phaseT > 1600) { G.phase = 'loop'; G.clock = 0; } break;
    case 'loop': G.mouse = mouse; if (R.running) updateLoop(dt); break;
    case 'exit': { const p = G.phaseT / 1500; G.darkA = 1 - smooth(0.2, 1, p); G.sat = lerp(G.sat, 0, clamp(dt / 600, 0, 1)); break; }
    default: G.darkA = 0;
  }
  G.shake = Math.max(0, G.shake - dt / 300);
  tickWords(dt);
  render(now, dt);
  requestAnimationFrame(frame);
}
frame.last = undefined as number | undefined;

/* ---------- drawing ---------- */
let darkC: HTMLCanvasElement, dctx: CanvasRenderingContext2D, airC: HTMLCanvasElement, actx: CanvasRenderingContext2D, glowC: HTMLCanvasElement, gctx: CanvasRenderingContext2D;
let strC: HTMLCanvasElement, sctx: CanvasRenderingContext2D;
function size() {
  const w = Math.ceil(innerWidth / DS), h = Math.ceil(innerHeight / DS);
  for (const c of [darkC, airC, glowC]) { c.width = w; c.height = h; }
  strC.width = innerWidth; strC.height = innerHeight;
}
/* the streams: on a breath the haze is drawn in, threads from her to the face */
interface Part { mote?: boolean; x: number; y: number; vx: number; vy: number; life: number; a: number; decay?: number; size?: number; tw?: number }
const parts: Part[] = [];
function spawnStreams(n: number, strength: number) {
  for (let i = 0; i < n; i++) {
    let z: Zone | null = null, r = Math.random() * G.zones.reduce((a, b) => a + b.w, 0);
    for (const q of G.zones) { r -= q.w; if (r <= 0) { z = q; break; } }
    if (!z) z = G.zones[0]!;
    parts.push({ x: (z.p[0]! + rand(-0.04, 0.04)) * innerWidth, y: (z.p[1]! + rand(-0.04, 0.04)) * innerHeight, vx: rand(-40, 40), vy: rand(-40, 40), life: 1, a: strength });
  }
}
/* motes: specks of light that rise from where she is, drift, twinkle and are drawn in with a breath */
function spawnMotes(dt: number) {
  const h = dt / 1000;
  for (const z of G.zones) {
    const named = G.order && G.order.k === 'here' && G.zones[G.order.ti!] === z;
    const rate = z.w * stim() * 26 * G.darkA * (1 + G.sat / 120) * (named ? 3 : 1);
    let n = rate * h; while (n > 0) { if (Math.random() < Math.min(1, n)) parts.push({ mote: true, x: (z.p[0]! + rand(-0.035, 0.035)) * innerWidth, y: (z.p[1]! + rand(-0.03, 0.03)) * innerHeight, vx: rand(-18, 18), vy: rand(-34, -8), life: 1, decay: rand(0.25, 0.45), size: rand(0.8, 2.4), tw: rand(0, 6.28), a: clamp(z.w * stim(), 0.3, 1.2) }); n -= 1; }
  }
  // the air itself holds some, more as the head fills
  if (Math.random() < h * (2 + G.sat / 12)) parts.push({ mote: true, x: rand(0, innerWidth), y: rand(0, innerHeight), vx: rand(-8, 8), vy: rand(-10, 4), life: 1, decay: rand(0.2, 0.35), size: rand(0.6, 1.6), tw: rand(0, 6.28), a: 0.5 });
}
function burst() { for (const p of parts) { const dx = p.x - G.nose[0]! * innerWidth, dy = p.y - G.nose[1]! * innerHeight, d = Math.hypot(dx, dy) || 1; p.vx = (dx / d) * 900; p.vy = (dy / d) * 900; p.life = Math.min(p.life, 0.5); } }
function drawStreams(dt: number) {
  const h = dt / 1000, nx = G.nose[0]! * innerWidth, ny = G.nose[1]! * innerHeight;
  sctx.globalCompositeOperation = 'destination-out'; sctx.fillStyle = `rgba(0,0,0,${S.reduced ? 1 : S.look === 'motes' && !G.inhaling ? 0.5 : 0.22})`; sctx.fillRect(0, 0, strC.width, strC.height);
  sctx.globalCompositeOperation = 'lighter'; sctx.lineCap = 'round';
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]!;
    const dx = nx - p.x, dy = ny - p.y, d = Math.hypot(dx, dy) || 1;
    const pullK = G.inhaling ? 1400 + G.depth * 2600 : p.mote ? 0 : 200;
    p.vx += ((dx / d) * pullK + (-dy / d) * 260) * h; p.vy += ((dy / d) * pullK + (dx / d) * 260) * h; // a curl around the face, then in
    if (p.mote && !G.inhaling) { p.vx += rand(-30, 30) * h; p.vy += rand(-30, 26) * h; }
    p.vx *= 1 - h * (p.mote && !G.inhaling ? 0.4 : 1.6); p.vy *= 1 - h * (p.mote && !G.inhaling ? 0.4 : 1.6);
    const ox = p.x, oy = p.y; p.x += p.vx * h; p.y += p.vy * h; p.life -= h * (p.mote ? p.decay! * (G.inhaling ? 1.4 : 1) : G.inhaling ? 0.7 : 1.4);
    if ((d < 18 && G.inhaling) || (!p.mote && d < 18) || p.life <= 0 || parts.length > 900) { parts.splice(i, 1); continue; }
    if (p.mote) {
      const tw = 0.55 + 0.45 * Math.sin(p.tw! += h * 5), al = Math.min(1, p.life * 2) * Math.min(1, (1 - p.life) * 6 + 0.2) * tw * p.a * G.darkA;
      sctx.fillStyle = `rgba(${COLORS[S.color]},${(0.22 * al).toFixed(3)})`; sctx.beginPath(); sctx.arc(p.x, p.y, p.size! * 3.2, 0, 6.283); sctx.fill();
      sctx.fillStyle = `rgba(${COLORS[S.color]},${(0.85 * al).toFixed(3)})`; sctx.beginPath(); sctx.arc(p.x, p.y, p.size!, 0, 6.283); sctx.fill();
      if (G.inhaling) { sctx.strokeStyle = `rgba(${COLORS[S.color]},${(0.35 * al).toFixed(3)})`; sctx.lineWidth = p.size!; sctx.beginPath(); sctx.moveTo(ox, oy); sctx.lineTo(p.x, p.y); sctx.stroke(); }
    } else {
      sctx.strokeStyle = `rgba(${COLORS[S.color]},${(0.5 * p.a * p.life).toFixed(3)})`; sctx.lineWidth = 1.2 + p.a * 1.2;
      sctx.beginPath(); sctx.moveTo(ox, oy); sctx.lineTo(p.x, p.y); sctx.stroke();
    }
  }
  sctx.globalCompositeOperation = 'source-over';
}

const cache = new Map<string, string>();
const setStyle = (el: HTMLElement, prop: string, v: string) => { if (S.readable && prop === 'filter') v = v.replace(/blur\([^)]*\)/g, 'blur(0px)'); const key = (el.id || String(el.className)) + prop; if (cache.get(key) === v) return; cache.set(key, v); (el.style as unknown as Record<string, string>)[prop] = v; };
function arcPath(r: number, a0: number, a1: number) {
  const A0 = -Math.PI * 1.25, span = Math.PI * 1.5;
  const s = A0 + span * clamp(a0, 0, 1), e = A0 + span * clamp(a1, 0, 1);
  if (e - s < 0.001) return '';
  return `M${(Math.cos(s) * r).toFixed(2)} ${(Math.sin(s) * r).toFixed(2)} A${r} ${r} 0 ${e - s > Math.PI ? 1 : 0} 1 ${(Math.cos(e) * r).toFixed(2)} ${(Math.sin(e) * r).toFixed(2)}`;
}

function render(now: number, dt: number) {
  const W = airC.width, H = airC.height, t = now / 1000;
  const reduced = S.reduced;
  const sway = reduced ? 0 : Math.sin((t * Math.PI * 2) / 3.1), sway2 = reduced ? 0 : Math.sin((t * Math.PI * 2) / 4.7 + 1.3);
  const live = G.phase === 'loop' || G.phase === 'entry';
  $('#stage').classList.toggle('live', live);
  $('#stage').classList.toggle('asking', !!(G.order && G.order.k === 'ask'));
  // her shape, moved a little against the face (the face moves under her)
  const par = [-(G.nose[0]! - 0.5) * 0.06, -(G.nose[1]! - 0.55) * 0.05];
  const h = Math.min(dt, 40) / 1000;
  G.sp.forEach((x, i) => { const tgt = G.o + (reduced ? 0 : (i ? -1 : 1) * sway2 * 0.05); const a = x.k * (tgt - x.L) - 7.5 * x.v; x.v += a * h; x.L += x.v * h; });
  const shapeState = { sway, sway2, squeeze: 0, slideDir: -1, slideY: 0, sp: G.sp, t };
  actx.setTransform(1, 0, 0, 1, 0, 0); actx.clearRect(0, 0, W, H); actx.fillStyle = '#fff';
  actx.save(); actx.translate(par[0]! * W, par[1]! * H);
  const kind = { feet_on_face: 'gap', face_to_bottom: 'seat', smothered_armpit: 'wedge' }[S.contact];
  SHAPES[kind as 'gap'](actx, W, H, G.o + sway * 0.01, shapeState);
  actx.restore();
  G.zones = zonesOf(W, H, shapeState).map((z) => ({ ...z, p: [z.p[0]! + par[0]!, z.p[1]! + par[1]!] }));
  // the dark with the flesh light at its edges (as breath.html)
  gctx.clearRect(0, 0, W, H); gctx.filter = 'blur(8px)'; gctx.drawImage(airC, 0, 0); gctx.filter = 'none';
  gctx.globalCompositeOperation = 'source-in'; gctx.fillStyle = 'rgb(226,78,52)'; gctx.fillRect(0, 0, W, H); gctx.globalCompositeOperation = 'source-over';
  dctx.globalCompositeOperation = 'source-over'; dctx.clearRect(0, 0, W, H);
  dctx.globalAlpha = G.darkA; dctx.fillStyle = 'rgb(6,4,8)'; dctx.fillRect(0, 0, W, H);
  dctx.globalCompositeOperation = 'source-atop'; dctx.globalAlpha = G.darkA * 0.6; dctx.drawImage(glowC, 0, 0);
  dctx.globalAlpha = G.darkA * 0.28; dctx.filter = 'blur(10px)'; dctx.drawImage(glowC, 0, 0); dctx.filter = 'none';
  dctx.globalCompositeOperation = 'destination-out'; dctx.globalAlpha = 1; dctx.filter = 'blur(1px)'; dctx.drawImage(airC, 0, 0); dctx.filter = 'none';
  dctx.globalCompositeOperation = 'source-over'; dctx.globalAlpha = 1;
  const sh = reduced ? 0 : G.shake * 7;
  darkC.style.transform = sh ? `translate(${rand(-sh, sh)}px, ${rand(-sh, sh)}px)` : '';
  // the look of her scent: motes (light in the air, rising from where she is)
  const col = COLORS[S.color];
  if (live) spawnMotes(dt);
  // threads on a breath
  if (live && G.inhaling && Math.random() < 0.9) spawnStreams(Math.ceil(2 + G.depth * 5 * G.I), clamp(G.I * stim(), 0.2, 1.2));
  drawStreams(dt);
  // the saturation: the picture itself saturates, blooms, glows warm at the edges, breathes
  const f = clamp(G.sat / 100, 0, 1.1), over = G.overload! > 0 ? 1 : 0;
  setStyle($('#inner'), 'filter', `saturate(${(1 + f * 0.85 + over * 0.4).toFixed(2)}) contrast(${(1 + f * 0.1).toFixed(2)}) blur(${(over * 1.5 + f * 0.3).toFixed(1)}px)`);
  setStyle($('#inner'), 'transform', reduced || f < 0.4 ? '' : `scale(${(1 + Math.sin(t * 1.4) * 0.006 * f).toFixed(4)})`);
  setStyle($('#bloom'), 'opacity', (smooth(0.3, 1, f) * 0.45).toFixed(2));
  setStyle($('#edge'), 'background', f < 0.02 ? 'none' : `radial-gradient(ellipse 80% 75% at ${(G.nose[0]! * 100).toFixed(0)}% ${(G.nose[1]! * 100).toFixed(0)}%, rgba(0,0,0,0) ${(62 - f * 25).toFixed(0)}%, rgba(${col},${(f * 0.32).toFixed(2)}) 100%)`);
  $('#stage').style.setProperty('--scent', col);
  // her mark on the place she named
  const tp = targetP(), mark = $('#mark');
  setStyle(mark, 'opacity', tp && live ? '1' : '0');
  if (tp) {
    const there = atTarget(), ph = (now / 900) % 1;
    mark.style.transform = `translate(${(tp[0]! * innerWidth).toFixed(1)}px, ${(tp[1]! * innerHeight).toFixed(1)}px)`;
    $('#mPulse').setAttribute('r', (20 + ph * 22).toFixed(1)); $('#mPulse').setAttribute('opacity', (1 - ph).toFixed(2));
    $('#mGlow').setAttribute('opacity', there ? '0.9' : '0.35'); $('#mFill').setAttribute('opacity', there ? '0.28' : '0');
    $('#mRing').setAttribute('r', there ? '24' : '20');
  }
  // the arc at the face
  const arc = $('#arc');
  setStyle(arc, 'opacity', live ? '1' : '0');
  arc.style.transform = `translate(${(G.nose[0]! * innerWidth).toFixed(1)}px, ${(G.nose[1]! * innerHeight).toFixed(1)}px)`;
  const R = 40, td = tolDepth() / 1.25;
  $('#aTrack').setAttribute('d', arcPath(R, 0, 1));
  $('#aDanger').setAttribute('d', td < 1 ? arcPath(R, td, 1) : '');
  const o = G.order, band = o && o.band ? o.band : null;
  $('#aBand').setAttribute('d', band ? arcPath(R, band[0]! / 1.25, band[1]! / 1.25) : ''); $('#aBand').setAttribute('stroke', `rgba(${col},.55)`); $('#aBand').setAttribute('opacity', band ? '1' : '0');
  const fd = (G.inhaling ? G.depth : 0) / 1.25;
  const fillCol = G.inhaling && G.depth * G.I * stim() > tolT() * 0.85 ? '255,90,70' : col;
  $('#aFill').setAttribute('d', arcPath(R, 0, fd)); $('#aFill').setAttribute('stroke', `rgb(${fillCol})`);
  $('#aFillGlow').setAttribute('d', arcPath(R, 0, fd)); $('#aFillGlow').setAttribute('stroke', `rgb(${fillCol})`);
  const ta = -Math.PI * 1.25 + Math.PI * 1.5 * clamp(td, 0, 1);
  $('#aTol').setAttribute('x1', (Math.cos(ta) * (R - 7)).toFixed(1)); $('#aTol').setAttribute('y1', (Math.sin(ta) * (R - 7)).toFixed(1));
  $('#aTol').setAttribute('x2', (Math.cos(ta) * (R + 7)).toFixed(1)); $('#aTol').setAttribute('y2', (Math.sin(ta) * (R + 7)).toFixed(1));
  $('#aTol').setAttribute('opacity', td < 1 ? '1' : '0');
  const prox = smooth(0.15, 1.05, G.I);
  $('#aProx').setAttribute('r', (2 + prox * 4.5).toFixed(1)); $('#aProx').setAttribute('fill', `rgba(${col},${(0.6 + prox * 0.4).toFixed(2)})`);
  $('#aProxGlow').setAttribute('r', (8 + prox * 16).toFixed(1)); $('#aProxGlow').setAttribute('fill', `rgb(${col})`); $('#aProxGlow').setAttribute('opacity', (prox * 0.55).toFixed(2));
  const need = S.layers.need && live ? smooth(4500, 7000, G.sinceBreath) : 0;
  $('#aNeed').setAttribute('opacity', (need * (0.5 + 0.5 * Math.sin(now / 120))).toFixed(2)); $('#aNeed').setAttribute('stroke', 'rgba(255,255,255,.7)');
  $('#aNeed').setAttribute('r', (R + 8 - need * 4).toFixed(1));
  // sound
  if (A.ctx) {
    const ct = A.ctx.currentTime;
    A.droneG!.gain.setTargetAtTime(live ? f * f * 0.05 : 0, ct, 0.3);
    A.world!.frequency.setTargetAtTime(14000 * Math.pow(500 / 14000, smooth(0.3, 1.05, f)), ct, 0.2);
    A.master!.gain.setTargetAtTime(S.sound ? S.vol : 0, ct, 0.05);
  }
  setStyle($('#reply'), 'opacity', live ? '0.4' : '1');
}

/* ---------- the input takes her in: at a high saturation a word typed turns into one of hers ---------- */
export const tint = {
  chars: [] as Array<{ ch: string; tint: boolean }>, prev: '',
  sync(reset?: boolean) {
    const v = ($('#cmd') as HTMLInputElement).value;
    if (reset) { this.chars = [...v].map((ch) => ({ ch, tint: false })); this.prev = v; this.draw(); return; }
    const p = this.prev; let a = 0; while (a < v.length && a < p.length && v[a] === p[a]) a++;
    let b = 0; while (b < v.length - a && b < p.length - a && v[v.length - 1 - b] === p[p.length - 1 - b]) b++;
    this.chars.splice(a, p.length - a - b, ...[...v.slice(a, v.length - b)].map((ch) => ({ ch, tint: false })));
    this.prev = v;
    // a word just finished: maybe it becomes hers
    if (S.layers.tint && G.phase === 'loop' && v.endsWith(' ') && !p.endsWith(' ') && Math.random() < smooth(45, 100, G.sat) * 0.33) {
      const m = v.slice(0, -1).match(/(\S+)$/);
      if (m) {
        const repl = Math.random() < 0.35 || !G.head.length ? S.name : pick(G.head).w; // a word from the head
        const start = v.length - 1 - m[1]!.length;
        const nv = v.slice(0, start) + repl + ' ';
        ($('#cmd') as HTMLInputElement).value = nv; this.chars.splice(start, m[1]!.length, ...[...repl].map((ch) => ({ ch, tint: true }))); this.prev = nv;
      }
    }
    this.draw();
  },
  draw() {
    const m = $('#mirror'); m.replaceChildren(...this.chars.map((c) => { const s = document.createElement('span'); s.textContent = c.ch; if (c.tint) s.className = 'tint'; return s; }));
    m.scrollLeft = $('#cmd').scrollLeft;
  },
};

/* ---------- input ---------- */
const typing = (t: EventTarget | null) => t && (/^(input|textarea|select)$/i.test((t as HTMLElement).tagName) || (t as HTMLElement).isContentEditable);

/* =====================================================================================================================================
 * The wiring (no prototype code below): the run, her band and the body, the reports, the lines, the mount and its end.
 * ===================================================================================================================================== */

interface Wiring {
  run: PhysicsRun | null;
  lineStyle: string;
  seg: { n: number; startedAt: number; clock0: number; beats: number; endMs: number; flushed: boolean; reported: number } | null;
  running: boolean;
  /** The words the engine holds now (its gauge over one word), and the words the mouth blew out in the beat not reported yet. */
  held: number;
  blownBeat: number;
  via: 'mouse' | 'key';
  mouthVia: 'mouse' | 'key';
  cheatsCaught: number;
  /** Her question answered with a lie the body has not given away yet: the verdict sent once it does (or it is kept). */
  pending: { right: boolean } | null;
  /** The kind of her scent the deep inhale is (P15a's stimulus), or null. */
  kind: string | null;
  plan: Array<{ attention: string }>;
}
const R: Wiring = { run: null, lineStyle: 'neutral', seg: null, running: false, held: 0, blownBeat: 0, via: 'key', mouthVia: 'key', cheatsCaught: 0, pending: null, kind: null, plan: [] };

/** Her attention now: the plan's beat of the running segment (the prototype drew it). */
function attentionNow(): string {
  const seg = R.seg;
  if (!seg) return 'busy';
  const b = clamp(Math.floor((G.clock - seg.clock0) / BEAT), 0, seg.beats - 1);
  return R.plan[b]?.attention ?? 'busy';
}
/** A word the mouth blew out: counted for this beat's `mouth_breath`. */
function blown(): void {
  R.blownBeat += 1;
}
/** Her lines (cardVoice `scent.*`) in the prototype's `LINES` shape, by her style (neutral's when hers has no row; cold is silent). */
function refreshLines(): void {
  if (!E) return;
  const reg = E.env.registries;
  const own = (k: string): string[] => [...voiceLines(reg, `scent.${k}` as VoiceKind, R.lineStyle)];
  const c = S.contact;
  const here = own(`here.${c}`);
  LINES = {
    entry: { [c]: own(`entry.${c}`) }, deeper: own('deeper'), gently: own('gently'), still: own('still'),
    here: { [c]: (HERE_ZONES[c] ?? []).map((z, i): [string, string] => [here[i] ?? '', z]) }, moved: own('moved'), good: own('good'), bad: own('bad'),
    mouth: { [ST().mouth]: own('mouth') }, away: own('away'), cough: own('cough'),
    answer: { ok: { [S.style]: own('answer.ok') }, bad: { [S.style]: own('answer.bad') }, empty: own('answer.empty') },
    liar: own('liar'), caught: own('caught'), lost: { low: own('lost.low'), high: own('lost.high') }, need: own('need'), end: own('end'), stop: own('stop'),
    ask: own('ask'),
    miss: Object.fromEntries(MISS_KINDS.map((k) => [k, own(`miss.${k}`)])),
  };
}
/** What her rule finds missing (saturation.html `judge`'s words, card-voice.md §9). */
export const MISS_KINDS = ['warm', 'admit', 'bad', 'want', 'place', 'strength', 'band', 'intensity_wrong', 'intensity_missing', 'honest'] as const;

/** Sends an input of this segment to the engine (once), exempt from the typing lapse when the mouse made it (ruling O). */
function report(i: SegmentInput, pointer: boolean): void {
  if (!E || !R.seg) return;
  E.env.staging.input(i, { pointer });
}
/**
 * A beat of the running segment ended: the words the head gained over what the engine holds (`inhale`, R18; the head is the gauge: a word
 * scattered by a cough, the overflow or an answer is not given back, it is the next breath's to make up) and the words the mouth blew out.
 */
function reportBeat(beat: number): void {
  const blownN = R.blownBeat;
  R.blownBeat = 0;
  if (blownN > 0) { report({ beat, kind: 'mouth_breath', amount: blownN }, R.mouthVia === 'mouse'); R.held = Math.max(0, R.held - blownN); }
  const cap = capacity();
  const gained = Math.max(0, Math.min(cap, G.head.length) - R.held);
  report({ beat, kind: 'inhale', amount: gained }, false);
  R.held = Math.min(cap, R.held + gained);
}
/** Her question was answered: the verdict the engine records (`physics/answer`, R20). `caught`: null while a lie is still open is not sent. */
export function answered(caught: boolean | null): void {
  const p = R.pending;
  if (!p || !E) return;
  R.pending = null;
  E.env.staging.answer?.(p.right, true, caught === true);
}
/** An answer with no lie in it: sent at once. A lie waits for the body (`answered`). */
export function judged(right: boolean, lie: boolean): void {
  if (!E) return;
  if (lie) { R.pending = { right }; return; }
  E.env.staging.answer?.(right, false, false);
}
/**
 * A deep breath (P15a's deep inhale, `physics/stimulus`, as the card's): sent for a breath deeper than 0.7 and for a cough. The depth sent
 * lands in the zone of the engine (`inhaleZone`) that the body's own answer names: past it for a cough, inside it for a breath the body took,
 * so the engine's reflex is the one on the screen.
 */
function deepInhale(d: number, cough: boolean): void {
  if (!E || !R.kind || (!cough && d <= 0.7)) return;
  const [lo, hi] = inhaleZone(S.band as 'faint', S.tol);
  const depth = cough ? Math.min(100, Math.max(Math.ceil(hi) + 1, Math.round(d * 100))) : Math.max(Math.ceil(lo), Math.min(Math.floor(hi), Math.round(d * 100)));
  E.env.staging.stimulus('inhale', R.kind, depth);
}

/** A running segment the loop has not met yet: its beats placed on the loop's clock, the engine's words as the head's start. */
function startSegment(run: PhysicsRun, ck: { startedAt: number | null; now: number }): void {
  const plan = run.segment.plan!;
  const phys = E!.env.registries.contactPhysics.get(run.physicsId);
  const endMs = Number(phys?.segmentSeconds ?? 30) * 1000;
  R.seg = { n: run.segment.n, startedAt: ck.startedAt!, clock0: G.clock - (ck.now - ck.startedAt!), beats: plan.beats.length, endMs, flushed: false, reported: 0 };
  R.plan = plan.beats;
  R.held = clamp(run.gauge / (Math.max(1, run.capacity) / capacity()), 0, capacity());
  R.blownBeat = 0;
}

/** Each frame before the prototype's: the size, the still form, the sound, the body, the letters, the segment and its reports. */
function before(): void {
  const e = E!;
  const r = e.env.root.getBoundingClientRect();
  const w = e.env.root.clientWidth || r.width || globalThis.innerWidth || 0, h = e.env.root.clientHeight || r.height || globalThis.innerHeight || 0;
  if (w !== innerWidth || h !== innerHeight) { innerWidth = w; innerHeight = h; size(); }
  S.reduced = e.env.reduced;
  S.readable = e.env.readable;
  e.box.toggleAttribute('data-reduced', S.reduced);
  e.box.toggleAttribute('data-readable', S.readable);
  e.mirror.toggleAttribute('data-readable', S.readable);
  if (!A.ctx) audioInit(); else if (!SAMPLE.buf) void loadSample();
  // the commander's body for her scent: the stage and the tolerance (they move with the deep inhales the engine records)
  if (R.run) body(e.env.state(), e.env.registries, R.run);
  const bg = e.env.layers.backdrop.style.backgroundImage;
  const room = e.els['#room']!;
  if (bg !== room.style.backgroundImage) room.style.backgroundImage = bg;
  const input = e.env.input as HTMLInputElement;
  if (input.value !== tint.prev) tint.sync();
  placeMirror(e);
  // the segment: met when it runs, its beats reported as they end, the last one flushed just before the segment's end
  const run = R.run;
  const ck = e.env.staging.clock();
  R.running = run !== null && run.segment.state === 'running' && run.segment.plan !== undefined && ck.startedAt !== null;
  if (G.phase === 'loop' && R.running && (R.seg === null || R.seg.n !== run!.segment.n || R.seg.startedAt !== ck.startedAt)) startSegment(run!, ck);
  const seg = R.seg;
  if (R.running && seg && !seg.flushed) {
    const passed = Math.floor((G.clock - seg.clock0) / BEAT);
    while (seg.reported < Math.min(passed, seg.beats)) reportBeat(seg.reported++);
    if (G.clock - seg.clock0 >= seg.endMs - 300) {
      seg.flushed = true;
      while (seg.reported < seg.beats) reportBeat(seg.reported++);
    }
  }
}
/** After the prototype's frame: the claimed styles it wrote are recorded (styleClaims' contract); a new line kept in the frame. */
function after(): void {
  const e = E;
  if (!e) return;
  const last = e.els['#hand']!.lastElementChild;
  if (last !== lastLine) { lastLine = last; keepInFrame(e); }
  noteWrites(e.claims[0]!, ['opacity']);
  // the prototype's `#stage.live { cursor: none }` (the mouse is the face): on the frame, while she does not ask
  const hide = (G.phase === 'loop' || G.phase === 'entry') && !(G.order && G.order.k === 'ask');
  if ((e.env.layers.frame.style.cursor === 'none') !== hide) writeClaimed(e.claims[1]!, 'cursor', hide ? 'none' : null);
  e.mirror.style.setProperty('--alius-scent-tint', COLORS[S.color]!);
}
let lastLine: Element | null = null;
/** Her lines stay inside the frame (ruling Q): a line that would run past an edge is moved back in (one wider than 40 % wraps, by its CSS). */
function keepInFrame(e: ScentEls): void {
  for (const el of e.els['#hand']!.children as HTMLCollectionOf<HTMLElement>) {
    const w = el.offsetWidth, x = el.offsetLeft;
    if (!w) continue;
    if (x + w > innerWidth - 8) el.style.left = `${Math.max(8, innerWidth - 8 - w)}px`;
    else if (x < 8) el.style.left = '8px';
  }
}
/** The letters lie over the input (the prototype's `#mirror` over `#cmd`): same box, same font, same scroll. */
function placeMirror(e: ScentEls): void {
  const input = e.env.input;
  const m = e.mirror;
  m.style.left = `${input.offsetLeft}px`;
  m.style.top = `${input.offsetTop}px`;
  m.style.width = `${input.offsetWidth}px`;
  m.style.height = `${input.offsetHeight}px`;
}

/** Her band (of the part she presses), the commander's stage and tolerance for her scent, the kind the deep inhale is. */
function body(state: CampaignState, reg: Registries, run: PhysicsRun): void {
  const part = run.sourceKind === 'contact' ? contactTargetOf(state.scene, reg, run.sourceId) ?? run.targetId : undefined;
  S.band = scentBand(state, reg, run.holderId, part);
  const ex = state.scene ? exposedKinds(state, reg).find((x) => x.holderId === run.holderId && String(reg.stimulusKinds.get(x.kind)?.family) !== 'taste') : undefined;
  R.kind = ex?.kind ?? null;
  const row = ex ? state.commander.stimuli?.[ex.kind] : undefined;
  S.stage = row?.stage ?? STAGES[0];
  S.tol = ex ? toleranceOf(state, ex.kind) : TUNING.stimuli.startTolerance;
  void headCapacity; // the engine's own count of the same head (`capacity()` is the prototype's, equal)
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag: string, attrs: Record<string, string>, parent: Element): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent.append(el);
  return el;
}
function build(env: InstrumentEnv): ScentEls {
  const box = document.createElement('div');
  box.className = 'alius-scent';
  box.id = 'alius-scent-stage';
  box.setAttribute('aria-hidden', 'true'); // as the effects layer it lives in (stage/layers.ts); the pills are her question's controls
  const els: Record<string, HTMLElement> = { '#stage': box };
  const div = (id: string, parent: HTMLElement, tag = 'div'): HTMLElement => { const el = document.createElement(tag); el.className = `alius-scent-${id}`; el.id = `alius-scent-${id}`; els[`#${id}`] = el; parent.append(el); return el; };
  const inner = div('inner', box);
  const world = div('world', inner);
  div('room', world);
  div('ceiling', world);
  const dark = lowres(inner);
  dark.canvas.classList.add('alius-scent-dark');
  els['#dark'] = dark.canvas;
  const streams = div('streams', inner, 'canvas') as HTMLCanvasElement;
  div('bloom', inner);
  div('edge', inner);
  div('words', box);
  const mark = svgEl('svg', { class: 'alius-scent-mark', id: 'alius-scent-mark', viewBox: '-50 -50 100 100' }, box);
  els['#mark'] = mark as unknown as HTMLElement;
  const mdefs = svgEl('defs', {}, mark);
  const mf = svgEl('filter', { id: 'alius-scent-mg', x: '-60%', y: '-60%', width: '220%', height: '220%' }, mdefs);
  svgEl('feGaussianBlur', { stdDeviation: '2.5' }, mf);
  els['#mGlow'] = svgEl('circle', { r: '26', fill: 'none', 'stroke-width': '6', filter: 'url(#alius-scent-mg)' }, mark) as unknown as HTMLElement;
  els['#mPulse'] = svgEl('circle', { r: '26', fill: 'none', 'stroke-width': '1.2' }, mark) as unknown as HTMLElement;
  els['#mRing'] = svgEl('circle', { r: '20', fill: 'none', 'stroke-width': '2' }, mark) as unknown as HTMLElement;
  els['#mFill'] = svgEl('circle', { r: '20', opacity: '0', class: 'alius-scent-mFill' }, mark) as unknown as HTMLElement;
  const arc = svgEl('svg', { class: 'alius-scent-arc', id: 'alius-scent-arc', viewBox: '-60 -60 120 120' }, box);
  els['#arc'] = arc as unknown as HTMLElement;
  const adefs = svgEl('defs', {}, arc);
  const af = svgEl('filter', { id: 'alius-scent-ag', x: '-50%', y: '-50%', width: '200%', height: '200%' }, adefs);
  svgEl('feGaussianBlur', { stdDeviation: '2.2' }, af);
  const a = (id: string, tag: string, attrs: Record<string, string>) => { els[`#${id}`] = svgEl(tag, attrs, arc) as unknown as HTMLElement; };
  a('aNeed', 'circle', { r: '40', fill: 'none', 'stroke-width': '2', opacity: '0' });
  a('aTrack', 'path', { fill: 'none', stroke: 'rgba(255,255,255,.16)', 'stroke-width': '3', 'stroke-linecap': 'round' });
  a('aBand', 'path', { fill: 'none', 'stroke-width': '6', 'stroke-linecap': 'round', opacity: '0' });
  a('aDanger', 'path', { fill: 'none', stroke: 'rgba(255,70,60,.55)', 'stroke-width': '3', 'stroke-linecap': 'round' });
  a('aFillGlow', 'path', { fill: 'none', 'stroke-width': '7', 'stroke-linecap': 'round', filter: 'url(#alius-scent-ag)', opacity: '.7' });
  a('aFill', 'path', { fill: 'none', 'stroke-width': '3', 'stroke-linecap': 'round' });
  a('aTol', 'line', { stroke: '#fff', 'stroke-width': '1.6' });
  a('aProxGlow', 'circle', { r: '12', filter: 'url(#alius-scent-ag)', opacity: '0' });
  a('aProx', 'circle', { r: '2.2', fill: 'rgba(255,255,255,.85)' });
  div('hand', box);
  env.layers.effects.append(box);
  const off = (): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } => { const l = lowres(document.createElement('div')); l.canvas.remove(); return l; };
  const air = off(), glow = off();
  darkC = dark.canvas; dctx = dark.ctx; airC = air.canvas; actx = air.ctx; glowC = glow.canvas; gctx = glow.ctx;
  strC = streams;
  let s2: CanvasRenderingContext2D | null = null;
  try { s2 = streams.getContext('2d'); } catch { s2 = null; }
  sctx = s2 ?? lowres(document.createElement('div')).ctx; // a page with no canvas: the kit's stand-in context
  const mirror = document.createElement('div');
  mirror.className = 'alius-scent-mirror';
  mirror.setAttribute('aria-hidden', 'true');
  inputLine(env).append(mirror);
  env.input.dataset.scentLetters = '';
  const claims = [claimStyles(env.reply, ['opacity']), claimStyles(env.layers.frame, ['cursor'])];
  return { env, box, els, mirror, claims, frameId: null };
}

/** Binds the run: her style's row, the shape of the dark and its contact, her name, the ceiling, her hand. */
function bind(env: InstrumentEnv, run: PhysicsRun): void {
  const state: CampaignState = env.state();
  const reg: Registries = env.registries;
  seed = (fnv1a(`${state.scene?.id ?? ''}|${run.id}|scent`) >>> 0) || 2463534242;
  const lead = leadStyle(physicsStyleOf(state, run.holderId, reg));
  S.style = lead.key in STYLES ? lead.key : ROW_BY_CUES[lead.cues] ?? 'neutral';
  R.lineStyle = lead.key;
  R.run = run;
  R.seg = null; R.running = false; R.held = 0; R.blownBeat = 0; R.via = 'key'; R.mouthVia = 'key'; R.pending = null; R.plan = [];
  R.cheatsCaught = run.tally?.cheatsCaught ?? 0;
  BEAT = TUNING.physics.beatMs;
  const occ = occlusionOf(run.sourceKind === 'contact' ? reg.blockingContacts.get(run.sourceId) : undefined);
  S.contact = (CONTACT_OF[occ.kind] ?? 'feet_on_face') as typeof S.contact;
  S.angle = occ.angle ?? -14;
  S.side = { wedge: occ.kind === 'wedge' && occ.side ? occ.side : 'right' };
  darkS.angle = S.angle;
  darkS.side = { ...darkS.side, wedge: S.side.wedge as 'left' | 'right' };
  const look = env.her(run.holderId);
  S.name = look.name;
  // what her activity asks of her attention: reading (she turns pages) or watching the commander (the prototype's two tasks)
  const act = state.scene ? (state.scene.blocking?.[run.holderId]?.activity) : undefined;
  const attention = act !== undefined ? String(reg.blockingActivities.get(act)?.attention ?? '') : '';
  S.task = attention === 'on_commander' || attention === '' ? 'watching_you' : 'reading';
  body(state, reg, run);
  refreshLines();
  // the ceiling over the commander (P10c), each candidate in turn; none, or none loads: the room (the scene's backdrop)
  const owner = state.scene?.participants.find((id) => state.squad.some((u) => u.id === id)) ?? null;
  const ceilings = state.scene ? ceilingOf(state, reg, state.scene.locationId, owner) : [];
  const ceilEl = E!.els['#ceiling']!;
  const tryAt = (i: number): void => {
    if (E?.env !== env) return;
    const c = ceilings[i];
    if (!c) { ceilEl.style.backgroundImage = ''; ceilEl.dataset.fallback = 'room'; return; }
    const url = env.assetUrl ? env.assetUrl(c.file) : c.file;
    ceilEl.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;
    if (typeof Image === 'function') {
      const probe = new Image();
      probe.onerror = () => tryAt(i + 1);
      probe.src = url;
    }
  };
  tryAt(0);
  E!.box.style.setProperty('--alius-her', look.accent);
  if (look.hand !== '') E!.box.style.setProperty('--alius-font-hand', `"${look.hand}", var(--alius-font-type)`);
  E!.box.style.setProperty('--alius-scent-hand-scale', String(look.handScale || 1));
}

/** The listeners of the prototype's page, on the scene: the mouse is the face, Space and the left button breathe in, Shift and the right button through the mouth. */
function listen(env: InstrumentEnv): void {
  const control = (t: EventTarget | null): boolean => t instanceof Element && t.closest('button, a, [role="button"], select, [data-action], .pick') !== null;
  const onFrame = (t: EventTarget | null): boolean => t instanceof Node && (t === env.layers.frame || env.layers.frame.contains(t));
  let keySpace = false;
  env.listen(document, 'mousemove', ((e: MouseEvent) => {
    const r = env.root.getBoundingClientRect();
    const w = innerWidth || r.width || 1, h = innerHeight || r.height || 1;
    mouse = [(e.clientX - r.left) / w, (e.clientY - r.top) / h];
  }) as EventListener);
  env.listen(document, 'keydown', ((e: KeyboardEvent) => {
    if (typing(e.target) || control(e.target) || e.ctrlKey || e.metaKey || e.altKey) return; // while typing, Space is a space and Shift a capital: only the mouse breathes
    if (e.key === ' ') { e.preventDefault(); if (!e.repeat) { keySpace = true; R.via = 'key'; inhaleStart(); } }
    else if (e.key === 'Shift') { R.mouthVia = 'key'; G.mouth = true; }
    else if (/^[1-6]$/.test(e.key) && G.order && G.order.k === 'ask') { const el = wordEls.filter((x) => x.classList.contains('pick') || x.classList.contains('chosen'))[Number(e.key) - 1]; if (el && el._choose) el._choose(); }
  }) as EventListener);
  env.listen(document, 'keyup', ((e: KeyboardEvent) => {
    if (e.key === ' ' && keySpace) { keySpace = false; inhaleEnd(); }
    if (e.key === 'Shift' && R.mouthVia === 'key') { G.mouth = false; }
  }) as EventListener);
  // while typing, the mouse breathes: left button the nose, right button the mouth (only on the frame: never a control of the scene's UI)
  env.listen(env.root, 'mousedown', ((e: MouseEvent) => {
    if (!onFrame(e.target)) return;
    e.preventDefault(); // the field keeps the focus
    if (e.button === 0) { R.via = 'mouse'; inhaleStart(); } else if (e.button === 2) { R.mouthVia = 'mouse'; G.mouth = true; }
  }) as EventListener);
  env.listen(document, 'mouseup', ((e: MouseEvent) => { if (e.button === 0 && !keySpace) inhaleEnd(); if (e.button === 2 && R.mouthVia === 'mouse') G.mouth = false; }) as EventListener);
  env.listen(env.layers.frame, 'contextmenu', ((e: Event) => e.preventDefault()) as EventListener);
  env.listen(env.input, 'input', () => tint.sync());
  env.listen(env.input, 'scroll', () => tint.draw());
}

function stopScent(): void {
  const e = E;
  if (!e) return;
  if (e.frameId !== null) e.env.cancelRaf(e.frameId);
  try { breathStop(); } catch { /* the context is gone */ }
  try { A.master?.disconnect(); } catch { /* not connected */ }
  A = { ctx: null };
  BR.kind = null; BR.src = null; REC.out = null; REC.srcs = []; REC.kind = null; REC.sus = null;
  SAMPLE.buf = null; SAMPLE.rms = null; delete SAMPLE.paul;
  for (const c of e.claims) releaseClaim(c);
  e.box.remove();
  e.mirror.remove();
  delete e.env.input.dataset.scentLetters;
  darkS.angle = -14;
  darkS.side = { lift: 'bottom', slide: 'auto', wedge: 'right' };
  cache.clear();
  parts.length = 0;
  wordEls.length = 0;
  tint.chars = []; tint.prev = '';
  lastLine = null;
  mouse = [0.5, 0.55];
  R.run = null; R.seg = null; R.running = false; R.pending = null; R.plan = []; R.kind = null;
  LINES = noLines();
  G = fresh();
  E = null;
}

/** How long the end plays: the dark leaving (1.5 s), her line at 900 ms, read until the prototype's summary at 2300 ms. */
export const EXIT_MS = 2600;

/** Starts the instrument on a run (the host's `start`). */
export function startScent(env: InstrumentEnv, run: PhysicsRun): InstrumentRun {
  stopScent();
  E = build(env);
  innerWidth = 0; innerHeight = 0;
  bind(env, run);
  listen(env);
  frame.last = undefined;
  begin();
  requestAnimationFrame(frame);
  const mine = E;
  return {
    update(next: PhysicsRun) {
      if (E !== mine) return;
      R.run = next;
      // she heard a mouth breath: the engine caught the relief (`cheatRoll` at the segment's end), her answer by style follows it
      const caught = next.tally?.cheatsCaught ?? 0;
      if (caught > R.cheatsCaught) { R.cheatsCaught = caught; if (G.phase === 'loop' || G.phase === 'entry') heardMouth(); }
    },
    finish(end: PhysicsEnd): number {
      if (E !== mine) return 0;
      if (G.phase !== 'loop' && G.phase !== 'entry') return 0;
      exit(end.result === 'stopped' ? 'stop' : 'done');
      return EXIT_MS;
    },
    stop() {
      if (E === mine) stopScent();
    },
  };
}

/**
 * The scent physics of a run: a decision interaction with a fill gauge (read by field) under a shape the prototype draws (the contact's
 * `occlusion`: `gap`, `seat`, `wedge`), alone or with a second that takes no input of the commander's (`passive`). A pair whose breath is the
 * main physics (`smothered_armpit`, `face_to_bottom`: breath and saturation) is the card's: saturation.html has no openings of her rhythm,
 * so the breath's gauge would only drain (and breath.html has no head).
 */
export function scentMatches(run: PhysicsRun, _state: CampaignState, reg: Registries): boolean {
  const p = reg.contactPhysics.get(run.physicsId);
  if (p?.interaction !== 'decision' || (p.gauge as { kind?: string } | undefined)?.kind !== 'fill') return false;
  const occ = occlusionOf(run.sourceKind === 'contact' ? reg.blockingContacts.get(run.sourceId) : undefined);
  if (!(occ.kind in CONTACT_OF)) return false;
  if (!run.second) return true;
  return reg.contactPhysics.get(run.second.physicsId)?.interaction === 'passive';
}

registerInstrument({ id: 'scent', matches: scentMatches, start: startScent });

/** Tests and the shots only: the prototype's state and hooks (its `window.__G`, `__S`, `__mouse`, `__inhale`). */
export const _scent = {
  get G(): Glob { return G; },
  get R(): Wiring { return R; },
  get S(): typeof S { return S; },
  get LINES(): Lines { return LINES; },
  zonesOf, intensityAt, capacity, breathWords, addWord, scatter, tickWords, inhaleStart, inhaleEnd, reflex, overflow, updateLoop, newOrder, nameplace, heardMouth, tint, fresh, say, begin, exit,
  setG(g: Glob): void { G = g; },
  /** Tests: the seed of the module's `Math.random` (a xorshift, no rng draw). */
  seed(n: number): void { seed = n >>> 0 || 1; },
  /** The shots: the frame clock starts again (a fake clock installed after the page began). */
  resetClock(): void { frame.last = undefined; },
  /** The prototype's `__mouse`: the face's target (fractions of the frame). */
  mouse(x: number, y: number): void { mouse = [x, y]; },
  /** The prototype's `__inhale`. */
  inhale(on: boolean): void { if (on) inhaleStart(); else inhaleEnd(); },
  /** The shots: her question now. */
  ask(): void { askWords(); },
  /** The shots: her named place now. */
  here(i = 0): void { const p = LINES.here[S.contact]?.[i]; if (p) nameplace(p[0], p[1]); },
};
