/**
 * P10e-e Task 20: the jaw as an instrument (`docs/prototypes/jaw.html`, normative; its `fidelity.json` checks the port against it). The body
 * and the speech on one axis: the mouse's height is how far the jaw is open (down opens), fatigue pulls it shut (a spring, a tremor, closing
 * twitches); the scene's input line is the mouth (its frame opens with the jaw, her band is two ghost frames on it, the hinges burn, drool
 * gathers on its lower edge, the letters smear from fatigue 70). Her toes in the mouth (`sole_to_mouth`): no speech; below her band the teeth
 * touch her; she pushes deeper, pulls back, says "suck." or wants it wider. The ring (an item worn in the mouth): the ring keeps the mouth open
 * at its size; every letter is spoken through the opening it was typed at (`speech.ts`); she asks, and understands or not. Shift (not into the
 * field) or the right button, held: a rest is asked for.
 *
 * The functions are the prototype's, copied (types added). The wiring, declared in `fidelity.json`:
 * - the engine's numbers are TUNING (`BEAT`, `JAW_PER`, `DEGRADE_AT`, `JAW_REST`, `REST_MS` = `jawRestMs`); the endurance skill is the
 *   commander's jaw level; the fatigue is the engine's gauge at each segment's start; the engine ends the hold (no limit or session end here);
 * - her moves are the plan's (`PlannedBeat.order` / `orderMs` / `ask`, R22), played as `herMove` on their beat;
 * - every beat of a running segment is reported once as it ends (the last 300 ms before the segment's end): `bite` with the beat's mean cost
 *   factor (R21); a touch of the teeth at once as `bite` with `part: 'teeth'` (R22); a rest asked as `ask_rest` (one a segment reaches the
 *   engine: another waits for the next segment), her answer the engine's rule;
 * - the line sent is the heard line: on Enter the field's value becomes what came out, before the scene's own Enter sends it (so a swipe or
 *   a regenerate never distorts it again); the share of clear letters stays in the instrument's summary (`R.kept`), never a number for the model;
 * - her lines are `cardVoice` `jaw.*` by her style (ruling Q; cold is silent, Ruling R), held in the prototype's `LINES` shape; a model-worded
 *   cue of her orders (`deeper`, `suck`, `wider`, `pull_back`) takes their place for that beat;
 * - `performance`, `setTimeout`, `requestAnimationFrame`, `innerWidth` / `innerHeight` and `Math.random` are this module's own (the scene's
 *   frame clock, the mount's timers and frames, the scene's size, the xorshift of `speech.ts` seeded by the scene and the run: no rng draw).
 */
import type { Registries } from '../../../../content/types';
import type { CueKind } from '../../../../engine/blocking/types';
import { fnv1a } from '../../../../engine/hub';
import type { PhysicsRun, PlannedBeat, SegmentInput } from '../../../../engine/physics/state';
import { jawRowOf, jawSourceOf } from '../../../../engine/physics/segment';
import { leadStyle, physicsStyleOf } from '../../../../engine/physics/style';
import type { CampaignState } from '../../../../engine/state/types';
import { TUNING } from '../../../../engine/tuning';
import { voiceLines, type VoiceKind } from '../../cards/voice';
import { instrumentFor, registerInstrument } from '../host';
import type { AliusSettings } from '../../../../settings';
import { nullContext } from '../kit/lowres';
import { clamp, lerp, smooth } from '../kit/math';
import { claimStyles, noteWrites, releaseClaim, writeClaimed, type StyleClaim } from '../styleClaims';
import type { InstrumentEnv, InstrumentRun, PhysicsEnd } from '../types';
import { DEGRADE_AT, Math, reseed, speak } from './speech';

/* ---------- the wiring: the mount, the clock, the timers, the frames and the size of the scene ---------- */
interface JawEls {
  env: InstrumentEnv;
  box: HTMLElement;
  els: Record<string, HTMLElement>;
  /** The scene's input line: the prototype's `#mouth` and `#inputWrap`. */
  line: HTMLElement;
  mirror: HTMLElement;
  claims: StyleClaim[];
  frameId: number | null;
  /** The line's own height at the mount: its centre stays where it was as the mouth opens. */
  base: number;
}
let E: JawEls | null = null;
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
    before(now);
    fn(now);
    after(now);
  });
}
export const $ = (s: string): HTMLElement => {
  const e = E!;
  if (s === '#mouth' || s === '#inputWrap') return e.line;
  if (s === '#mirror') return e.mirror;
  if (s === '#cmd') return e.env.input;
  if (s === '#reply') return e.env.reply;
  return e.els[s]!;
};
const inputLine = (env: InstrumentEnv): HTMLElement => env.input.closest<HTMLElement>('.alius-input-line') ?? env.input.parentElement ?? env.input;

/* ---------- the prototype's helpers ---------- */
export const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)]!;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);

/* ---------- the engine's numbers (src/engine/tuning.ts, TUNING.physics) ---------- */
export const BEAT = TUNING.physics.beatMs;
export const JAW_PER = TUNING.physics.jaw.per, JAW_REST = TUNING.physics.jawRest;        // fatigue a beat, what a rest takes off (DEGRADE_AT: speech.ts)
export const REST_DENIED = ['cruel', 'vindictive'];               // the engine's rest rule
/* ---------- the instrument's numbers ---------- */
export const MOUTH_H = [30, 170];   // the mouth's height in px, shut to wide open
export const WIDE_COST = 1.4;       // above the costly zone (0.25 over the resting zone) the cost grows by WIDE_COST per 0.4 more
export const RELAXED = 0.35;        // the jaw resting just above her band's floor (on her toes, without the teeth) or on the ring costs this share
export const RELAX_ZONE = 0.06;     // how far above the floor counts as resting; from there the cost rises to 1 at her band's top
export const SKILL_CAP = 0.1;       // the engine's endurance skill: +10 % capacity a level (P15a §9.3), levels 0–5
export const TEETH_GAP = 0.015;     // under her band by this much the teeth touch her
export const TEETH_CD = 2500;       // one touch a dip (the jaw must come back into her band), and not more often than this
export const TEETH_SAY = 7000;      // she says it at most this often; between, only her foot jerks
export const WIDE_MAX = 0.9;        // her "wider" never asks past this (the tired jaw must still reach it)
export const REST_HOLD = 550;       // ms of Shift / the right button to ask
export const REST_MS = TUNING.physics.jawRestMs;        // a granted rest
export const ORDER_GRACE = 1500;    // ms out of her band during an order before she corrects
/** The prototype's `#mouth { bottom: 96px }`: the mouth's centre stands at least this far above the frame's bottom (the port lifts the line). */
export const MOUTH_BOTTOM = 96;

export const CONTACTS: Record<string, { note: string; speech: boolean }> = {
  sole_to_mouth: { note: 'her toes in the mouth (sole_to_mouth): no speech (no_speech); her band is set by her toes, below it the teeth touch her; she pushes deeper, pulls out, says "suck." (a narrow band just above her)', speech: false },
  ring_gag: { note: 'a ring gag (ring_gag): the ring keeps the mouth open at its size; above it the jaw tires faster; every letter is spoken through the opening it was typed at; she asks and understands or not', speech: true },
};
export interface StyleRow { every: number[]; deep: number; suck: number; ask: number }
export const STYLES: Record<string, StyleRow> = {
  neutral:      { every: [5, 9], deep: 0.12, suck: 0.08, ask: 0.35 },
  affectionate: { every: [7, 12], deep: 0.08, suck: 0.1, ask: 0.4 },
  ritual:       { every: [6, 6], deep: 0.1, suck: 0.08, ask: 0.3 },
  playful:      { every: [4, 8], deep: 0.12, suck: 0.07, ask: 0.45 },
  cruel:        { every: [3, 6], deep: 0.18, suck: 0.06, ask: 0.5 },
  possessive:   { every: [4, 8], deep: 0.15, suck: 0.07, ask: 0.35 },
  vindictive:   { every: [4, 7], deep: 0.16, suck: 0.07, ask: 0.4 },
  clinical:     { every: [5, 9], deep: 0.12, suck: 0.08, ask: 0.3 },
};
/** Her lines (`cardVoice` `jaw.*` by her style, `refreshLines`) in the prototype's `LINES` shape; `stop` is finish's line after the stop word. */
export interface Lines {
  entry: Record<string, string[]>; teeth: string[]; deeper: string[]; out: string[]; suck: string[]; wide: string[]; correct: string[];
  restOk: string[]; restNo: string[]; ask: Array<[string, string]>; heard: string[]; lost: string[]; end: string[]; slack: string[]; stop: string[];
}
const noLines = (): Lines => ({ entry: {}, teeth: [], deeper: [], out: [], suck: [], wide: [], correct: [], restOk: [], restNo: [], ask: [['', '']], heard: [], lost: [], end: [], slack: [], stop: [] });
export let LINES: Record<string, Lines> = { neutral: noLines() };

/* ---------- settings (jaw.html `S`: the approved defaults; the contact, her style, the endurance skill and the still form are the run's and the scene's) ---------- */
export const S = { contact: 'sole_to_mouth', style: 'neutral', rate: 1, skill: 0, ring: 0.55, len: 75, sound: true, vol: 0.7, footH: 1.05, debug: false, reduced: false, readable: false };
const st = () => STYLES[S.style]!;
const L = () => LINES[S.style]!;
const C = () => CONTACTS[S.contact]!;

/* ---------- audio ---------- */
interface Audio {
  ctx: AudioContext | null; buf: Record<string, AudioBuffer | null>; master?: GainNode; world?: BiquadFilterNode; body?: GainNode; white?: AudioBuffer; brown?: AudioBuffer;
}
let A: Audio = { ctx: null, buf: {} };
/** The recorded sounds (jaw.html `SAMPLE_URLS`), from the repo root: the sample layer decodes them. */
export const SAMPLE_URLS: Readonly<Record<string, string>> = {
  breath: 'assets/sounds/breath-in-out.mp3',
  cloth1: 'assets/sounds/ha/cloth1.ogg', cloth2: 'assets/sounds/ha/cloth2.ogg', cloth3: 'assets/sounds/ha/cloth3.ogg', cloth4: 'assets/sounds/ha/cloth4.ogg',
};
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
interface PlayOpts { g?: number; pan?: number; rate?: number; lp?: number; dest?: AudioNode; at?: number; offset?: number; dur?: number }
function play(id: string, { g = 0.5, pan = 0, rate = 1, lp = 0, dest, at = 0, offset = 0, dur }: PlayOpts = {}) {
  if (!A.ctx || !A.buf[id]) return null;
  const ctx = A.ctx, t = ctx.currentTime + at;
  const src = ctx.createBufferSource(); src.buffer = A.buf[id]; src.playbackRate.value = rate;
  const gn = ctx.createGain(); gn.gain.value = g; src.connect(gn);
  let n: AudioNode = gn;
  if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; n.connect(f); n = f; }
  if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; n.connect(p); n = p; }
  n.connect(dest ?? A.world!);
  const len = dur ?? (A.buf[id]!.duration - offset);
  if (dur) { gn.gain.setValueAtTime(g, t + dur / rate - 0.04); gn.gain.linearRampToValueAtTime(0.0001, t + dur / rate); }
  src.start(t, offset, len + 0.05);
  return src;
}
interface NoiseOpts { at?: number; dur?: number; type?: BiquadFilterType; f?: number; f2?: number; q?: number; gain?: number; attack?: number; dest?: AudioNode }
function noise({ at = 0, dur = 0.2, type = 'bandpass', f = 1000, f2, q = 1, gain = 0.1, attack = 0.01, dest = A.world! }: NoiseOpts) {
  if (!A.ctx) return;
  const ctx = A.ctx, t = ctx.currentTime + at;
  const src = ctx.createBufferSource(); src.buffer = A.white!; src.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl); fl.connect(g); g.connect(dest); src.start(t, Math.random()); src.stop(t + dur + 0.05);
}
function tone(f0: number, f1: number, dur: number, gain: number, { at = 0, dest = A.body!, type = 'sine' as OscillatorType } = {}) {
  if (!A.ctx) return;
  const ctx = A.ctx, t = ctx.currentTime + at;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
}
export const SFX = {
  pen: () => { for (let i = 0; i < 3; i++) noise({ at: i * 0.05 + Math.random() * 0.02, dur: 0.035 + Math.random() * 0.03, f: 2600 + Math.random() * 1800, q: 3, gain: 0.04 }); },
  cloth: (g = 0.3, rate = 1) => { if (!play(pick(['cloth1', 'cloth2', 'cloth3', 'cloth4']), { g, rate, lp: 5000 })) noise({ dur: 0.3, f: 1100, f2: 1700, q: 0.7, gain: g * 0.25, attack: 0.05 }); },
  /* the jaw: a twitch closing (a dull knock inside the head), a click of the joint */
  twitch: (k = 1) => { tone(95, 60, 0.12, 0.25 * k); noise({ dur: 0.04, f: 1800, q: 4, gain: 0.05 * k, dest: A.body }); },
  /* teeth touch her: a small hard tick and her foot jerks */
  teeth: () => { noise({ dur: 0.025, type: 'highpass', f: 2600, gain: 0.25, attack: 0.002, dest: A.body }); setTimeout(() => SFX.cloth(0.35, 1.3), 60); },
  /* a swallow: low, wet (the mouth cannot close for it) */
  swallow: (g = 0.5) => { tone(190, 110, 0.12, 0.22 * g); noise({ at: 0.04, dur: 0.05, f: 900, q: 3, gain: 0.08 * g, dest: A.body }); },
  /* the commander's breath through the nose (the recording of saturation), heavier with fatigue */
  nose: (f: number) => { if (!play('breath', { g: 0.1 + 0.12 * f, rate: 1.25 + 0.35 * f, offset: 0.12, dur: 1.2, lp: 2600, dest: A.body })) noise({ dur: 0.6, f: 700, f2: 1500, q: 0.8, gain: 0.05, attack: 0.1, dest: A.body }); },
  drip: () => { tone(1400 + Math.random() * 500, 700, 0.06, 0.05, { dest: A.world }); },
  strain: null as { g: GainNode; lfo: OscillatorNode } | null,
};
/* a low strain hum that grows with the fatigue */
function strainInit() {
  if (!A.ctx || SFX.strain) return;
  const o = A.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 58;
  const lp = A.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
  const g = A.ctx.createGain(); g.gain.value = 0;
  const lfo = A.ctx.createOscillator(); lfo.frequency.value = 9; const lg = A.ctx.createGain(); lg.gain.value = 6; lfo.connect(lg); lg.connect(o.frequency);
  o.connect(lp); lp.connect(g); g.connect(A.body!); o.start(); lfo.start();
  SFX.strain = { g, lfo };
}

/* ---------- state ---------- */
export interface Drop { x: number; y: number; r: number; grow: number; v: number; falling: boolean; life: number }
export interface Glob {
  phase: string; t: number; f: number; jaw: number; v: number; target: number; band: number[] | null; order: string | null; orderOut: number; nextMove: number; push: number; pushV: number;
  teethCd: number; teethArmed: boolean; teethSaid: number; restHold: number; resting: number; restAsked: boolean; ask: { word: string; t: number } | null; nextTwitch: number; nextNose: number; drops: Drop[]; dropAcc: number; limitT: number;
  stats: { teeth: number; restsAsked: number; restsGranted: number; corrections: number; said: number; heard: number; lost: number; twitches: number };
  pushTarget?: number; orderT?: number; orderLen?: number; restFrom?: number; flashT?: number; cost?: number; restKey?: boolean; restDown?: number;
}
export let G: Glob;
function fresh(): Glob {
  return { phase: 'idle', t: 0, f: 0, jaw: 0.5, v: 0, target: 0.5, band: null, order: null, orderOut: 0, nextMove: 3000, push: 0, pushV: 0,
    teethCd: 0, teethArmed: true, teethSaid: -1e9, restHold: 0, resting: 0, restAsked: false, ask: null, nextTwitch: 1200, nextNose: 800, drops: [], dropAcc: 0, limitT: 0,
    stats: { teeth: 0, restsAsked: 0, restsGranted: 0, corrections: 0, said: 0, heard: 0, lost: 0, twitches: 0 } };
}
G = fresh();

/* ---------- her hand ---------- */
export function say(text: string | undefined, opt: { x?: number; y?: number; life?: number } = {}) {
  if (!text) return;
  const el = document.createElement('div');
  el.className = 'her-line';
  el.textContent = text;
  const speed = S.style === 'cruel' ? 24 : S.style === 'ritual' ? 45 : 34;
  el.style.setProperty('--write', `${Math.max(140, text.length * speed)}ms`);
  el.style.setProperty('--steps', String(Math.max(4, text.length * 2)));
  const showing = [...$('#hand').children].filter((c) => !c.classList.contains('gone')).length;
  el.style.left = `${innerWidth * (opt.x ?? 0.6)}px`;
  el.style.top = `${innerHeight * (opt.y ?? 0.2) + showing * 52}px`;
  el.style.transform = `rotate(${rand(-4, 3).toFixed(1)}deg)`;
  $('#hand').appendChild(el);
  SFX.pen();
  setTimeout(() => { el.classList.add('gone'); setTimeout(() => el.remove(), 600); }, opt.life ?? 2600);
}

/* ---------- speech through the opening (speak: speech.ts) ---------- */
export const spoken: Array<{ out: string; lost: boolean; meant: string }> = []; // the line as it comes out: { out, lost, meant }
function renderMirror() {
  $('#mirror').replaceChildren(...spoken.map((s) => { const sp = document.createElement('span'); sp.textContent = s.out; if (s.lost) sp.className = 'lost'; return sp; }));
}
function onType(e: KeyboardEvent) {
  if (G.phase !== 'loop') { e.preventDefault(); return; }
  if (e.key === 'Enter') { e.preventDefault(); sendLine(); return; }
  if (e.key === 'Backspace') { e.preventDefault(); spoken.pop(); renderMirror(); return; }
  if (e.key.length !== 1 || e.ctrlKey || e.metaKey) return;
  e.preventDefault();
  if (!C().speech) { // no speech: every key is a muffled sound
    spoken.push({ out: Math.random() < 0.6 ? 'm' : 'h', lost: true, meant: e.key }); renderMirror(); return;
  }
  const floor = S.contact === 'ring_gag' ? S.ring : 0;
  const o = Math.max(G.jaw, floor);
  const s = speak(e.key, o, G.f);
  // marked: what came out worse than the ring allows (the jaw's fault, not the ring's)
  spoken.push({ out: s.out, lost: s.out.toLowerCase() !== speak(e.key, floor, 0).out.toLowerCase(), meant: e.key }); renderMirror();
}
function sendLine() {
  if (!spoken.length) return;
  const meant = spoken.map((s) => s.meant).join(''), heard = spoken.map((s) => s.out).join('');
  // she listens fairly: a letter counts as clear when it came out as well as the ring allows (her toes allow nothing)
  const floor = S.contact === 'ring_gag' ? S.ring : 0;
  const ideal = (ch: string) => speak(ch, floor, 0).out;
  const letters = spoken.filter((s) => /[a-z]/i.test(s.meant));
  const kept = letters.filter((s) => s.out.toLowerCase() === ideal(s.meant).toLowerCase()).length / Math.max(1, letters.length);
  spoken.length = 0; renderMirror();
  G.stats.said += 1;
  heardLine(heard, meant, kept);
  if (!C().speech) { setTimeout(() => say(pick(L().slack)), 500); return; }
  // she understands when most of it came through, and (if she asked for a word) when that word did
  const want = G.ask ? G.ask.word : '';
  const wantHeard = [...want].map(ideal).join('').toLowerCase();
  const wordOk = !want || heard.toLowerCase().includes(wantHeard);
  const ok = kept >= 0.6 && wordOk;
  if (ok) G.stats.heard += 1; else G.stats.lost += 1;
  G.ask = null;
  setTimeout(() => say(pick(ok ? L().heard : L().lost)), 600);
}

/* ---------- her moves ---------- */
function bandNow() {
  // sole: her toes set the band's floor; ring: the ring is the floor, her band only during an order
  if (S.contact === 'sole_to_mouth') {
    const base = 0.42 + G.push;
    const w = G.order === 'suck' ? st().suck : G.order === 'wide' ? 0.16 : 0.2;
    const lo = G.order === 'wide' ? Math.min(base + 0.14, WIDE_MAX - w) : base;
    return [clamp(lo, 0.1, WIDE_MAX), clamp(lo + w, 0.2, WIDE_MAX)];
  }
  if (G.order === 'wide') return [Math.min(0.78, WIDE_MAX - 0.14), WIDE_MAX];
  return null;
}
function herMove() {
  const s = st(), c = S.contact;
  const r = moveR();
  if (c === 'sole_to_mouth') {
    if (r < 0.32) { // deeper: she pushes in (telegraphed: her foot comes closer, a rustle)
      SFX.cloth(0.3); G.pushTarget = clamp(G.push + s.deep, 0, 0.28); G.order = null; setTimeout(() => { if (G.phase === 'loop') say(pick(L().deeper)); }, 250);
    } else if (r < 0.5) { G.pushTarget = clamp(G.push - 0.1, -0.1, 0.35); SFX.cloth(0.2); if (Math.random() < 0.4) say(pick(L().out)); }
    else if (r < 0.75) { G.order = 'suck'; G.orderT = 0; G.orderLen = orderLen(4000, 7000); say(pick(L().suck)); }
    else { G.order = 'wide'; G.orderT = 0; G.orderLen = orderLen(3000, 5000); say(pick(L().wide)); }
  } else {
    if (!G.ask && r < 0.4 + s.ask * 0.5) { const [q, w] = pick(L().ask); G.ask = { word: w, t: 0 }; say(q, { life: 4000 }); }
    else {
      G.order = 'wide'; G.orderT = 0; G.orderLen = orderLen(3000, 5000); say(pick(L().wide));
      // often she asks while she wants it wide: answer clearly (and break the order) or keep it wide (and be lost)
      if (!G.ask && Math.random() < 0.45) setTimeout(() => { if (G.phase === 'loop' && !G.ask) { const [q, w] = pick(L().ask); G.ask = { word: w, t: 0 }; say(q, { life: 4000 }); } }, 1600);
    }
  }
  R.move = null;
}

/* ---------- the rest ---------- */
function askRest() {
  if (restWaits()) return;
  G.stats.restsAsked += 1; G.restAsked = true;
  SFX.cloth(0.25, 1.2); // a tap of the hand on her leg
  const granted = !REST_DENIED.includes(S.style);
  setTimeout(() => {
    if (G.phase !== 'loop') return;
    if (granted) { G.stats.restsGranted += 1; G.resting = REST_MS; G.restFrom = G.f; G.order = null; say(pick(L().restOk.length ? L().restOk : ['rest.'])); }
    else say(pick(L().restNo.length ? L().restNo : ['no.']));
  }, 500);
}

/* ---------- phases ---------- */
function begin() {
  audioInit(); if (A.ctx && A.ctx.state === 'suspended') void A.ctx.resume(); strainInit();
  $('#hand').replaceChildren(); spoken.length = 0; renderMirror();
  G = fresh(); G.phase = 'loop'; G.pushTarget = 0;
  $('#foot').style.display = S.contact === 'sole_to_mouth' && footLoaded ? 'block' : 'none';
  say(pick(L().entry[S.contact]!));
  $('#cmd').focus();
}
function finish(why: string) {
  if (G.phase !== 'loop') return;
  G.phase = 'done';
  const line = why === 'stop' ? pick(L().stop) : pick(L().end);
  say(line);
  if (SFX.strain) SFX.strain.g.gain.value = 0;
}

/* ---------- the loop ---------- */
let last = 0;
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(50, now - last); last = now;
  if (G.phase === 'loop') update(dt);
  render(now, dt);
}
function update(dt: number) {
  G.t += dt;
  const f01 = G.f / 100;
  // her push (sole): springs toward her target
  G.push += ((G.pushTarget ?? 0) - G.push) * Math.min(1, dt / 260);
  // the jaw: a spring toward the mouse, minus the fatigue's pull; twitches closing; a tremor
  const pull = 0.04 + 0.18 * Math.pow(f01, 1.6);
  let goal = G.target - pull;
  if (G.resting > 0) goal = 0.06; // a rest: the mouth closes (the ring still holds it)
  const k = 70, d = 12;
  G.v += (k * (goal - G.jaw) - d * G.v) * dt / 1000;
  G.nextTwitch -= dt;
  if (G.nextTwitch <= 0 && G.resting <= 0) {
    if (G.f > 25) { G.v -= rand(0.35, 0.8) * (0.3 + f01); G.stats.twitches += 1; SFX.twitch(0.5 + f01); }
    G.nextTwitch = 1000 / (0.08 + 0.35 * f01 * f01) * rand(0.6, 1.4);
  }
  G.jaw += G.v * dt / 1000 + (S.reduced ? 0 : (Math.random() * 2 - 1) * (0.0015 + 0.012 * f01 * f01));
  const floor = S.contact === 'ring_gag' ? S.ring : 0;
  if (G.jaw < floor) { G.jaw = floor; if (G.v < 0) G.v *= -0.2; }
  if (G.jaw > 1) { G.jaw = 1; if (G.v > 0) G.v = 0; }
  G.jaw = clamp(G.jaw, 0, 1);
  // her band, her orders
  const band = bandNow(); G.band = band;
  if (G.order) { G.orderT! += dt; if (G.orderT! > G.orderLen!) G.order = null; }
  // teeth: under her band (sole) they touch her
  G.teethCd -= dt;
  if (band && G.jaw >= band[0]!) G.teethArmed = true;
  if (band && S.contact === 'sole_to_mouth' && G.resting <= 0 && G.jaw < band[0]! - TEETH_GAP && G.teethCd <= 0 && G.teethArmed) {
    G.stats.teeth += 1; G.teethCd = TEETH_CD; G.teethArmed = false; G.flashT = 0; SFX.teeth();
    if (G.t - G.teethSaid > TEETH_SAY) { G.teethSaid = G.t; say(pick(L().teeth)); }
    if ((S.style === 'cruel' || S.style === 'vindictive') && (G.pushTarget ?? 0) < 0.2) G.pushTarget = (G.pushTarget ?? 0) + 0.05; // she pushes in for the teeth, not past a point
  }
  // an order not kept: she corrects after a grace
  if (G.order && band && G.resting <= 0) {
    const out = G.jaw < band[0]! - TEETH_GAP || G.jaw > band[1]! + 0.03;
    G.orderOut = out ? G.orderOut + dt : 0;
    if (G.orderOut > ORDER_GRACE) { G.orderOut = -2500; G.stats.corrections += 1; say(pick(L().correct)); }
  }
  // fatigue: per beat as the engine, faster above her band or the ring; a rest takes it down
  if (G.resting > 0) {
    G.resting -= dt;
    G.f = Math.max(0, G.f - (JAW_REST / REST_MS) * dt);
    if (G.resting <= 0) say(pick(L().slack));
  } else {
    // what holding it open costs: resting on her toes (without the teeth) or on the ring is cheap; each step higher costs more; wide open costs most
    const relaxed = S.contact === 'ring_gag' ? S.ring : 0.42 + G.push;
    const above = G.jaw - relaxed - RELAX_ZONE;
    G.cost = RELAXED + (1 - RELAXED) * clamp(above / 0.25, 0, 1) + WIDE_COST * Math.max(0, above - 0.25) / 0.4;
    G.f = Math.min(100, G.f + (JAW_PER / BEAT) * dt * S.rate * G.cost / (1 + SKILL_CAP * S.skill));
  }
  // the rest: Shift or the right button held
  if (G.restKey && G.resting <= 0 && !G.restAsked) { G.restHold = performance.now() - G.restDown!; if (G.restHold >= REST_HOLD) askRest(); } else if (!G.restKey) { G.restHold = 0; G.restAsked = false; }
  // her next move (the plan's); an unanswered question lapses
  if (R.move && G.resting <= 0) herMove();
  if (G.ask) { G.ask.t += dt; if (G.ask.t > 12000) { G.ask = null; say(pick(L().lost)); G.stats.lost += 1; } }
  // breath through the nose, drool from the open mouth
  G.nextNose -= dt; if (G.nextNose <= 0) { SFX.nose(f01); G.nextNose = lerp(3400, 1700, f01) * rand(0.85, 1.15); }
  G.dropAcc += dt * smooth(0.3, 0.9, G.jaw) * (0.4 + f01) * 0.0011;
  if (G.dropAcc >= 1) { G.dropAcc = 0; spawnDrop(); }
}

/* ---------- drawing ---------- */
let img: HTMLImageElement, foot: HTMLImageElement;
let footLoaded = false;
let drool: HTMLCanvasElement, dctx: CanvasRenderingContext2D;
function spawnDrop() {
  const r = $('#mouth').getBoundingClientRect();
  G.drops.push({ x: r.left - R.ox + r.width * rand(0.3, 0.7), y: r.bottom - R.oy - 2, r: 0, grow: rand(1.2, 2.2), v: 0, falling: false, life: 1 });
}
function render(now: number, dt: number) {
  const W = innerWidth, H = innerHeight, f01 = G.f / 100;
  if (drool.width !== W) { drool.width = W; drool.height = H; }
  // the mouth: its height is the jaw
  const h = lerp(MOUTH_H[0]!, MOUTH_H[1]!, G.jaw);
  const tremble = S.reduced ? 0 : (Math.random() * 2 - 1) * (0.5 + 3 * f01 * f01);
  const m = $('#mouth');
  m.style.height = `${h.toFixed(1)}px`;
  m.style.transform = `translate(${tremble.toFixed(1)}px, ${(-R.lift).toFixed(1)}px)`;
  // the hinges burn with what holding costs right now (resting is quiet), and more as the jaw tires
  const burn = clamp(0.15 + 0.85 * smooth(10, 95, G.f), 0, 1) * clamp(((G.cost ?? RELAXED) - 0.2) / 1.2, 0.12, 1) * (0.9 + 0.1 * Math.sin(now / 140));
  $('#inputWrap').style.setProperty('--ache', (G.phase === 'loop' && G.resting <= 0 ? burn : 0).toFixed(3));
  $('#inputWrap').style.borderColor = G.flashT !== undefined && G.flashT < 300 ? 'rgba(255,120,90,.9)' : 'rgba(255,255,255,.12)';
  if (G.flashT !== undefined) G.flashT += dt;
  // her band as ghost frames on the mouth: the floor and the ceiling of her band
  const band = G.phase === 'loop' && G.resting <= 0 ? G.band : null;
  for (const [id, v] of [['#bandLo', band ? band[0] : null], ['#bandHi', band ? band[1] : null]] as Array<[string, number | null]>) {
    const el = $(id);
    if (v === null) { el.style.opacity = '0'; continue; }
    const bh = lerp(MOUTH_H[0]!, MOUTH_H[1]!, v);
    el.style.width = `${R.mouthW + 20}px`; el.style.height = `${bh.toFixed(1)}px`; el.style.top = `${R.mouthY - R.lift}px`;
    el.style.opacity = id === '#bandLo' ? '0.9' : '0.45';
    el.classList.toggle('hot', id === '#bandLo' && G.jaw < v - TEETH_GAP);
  }
  // the rest ring
  $('#restRing').style.opacity = G.restHold > 0 ? '1' : '0';
  $('#restArc').setAttribute('stroke-dashoffset', String(75.4 * (1 - clamp(G.restHold / REST_HOLD, 0, 1))));
  // the letters smear and double as the jaw tires
  const sm = smooth(DEGRADE_AT - 20, 100, G.f);
  $('#mirror').style.textShadow = sm > 0 ? `${(2 + 4 * sm).toFixed(1)}px 0 ${(1 + 2 * sm).toFixed(1)}px rgba(236,232,242,${(0.35 * sm).toFixed(2)}), 0 0 ${(2 * sm).toFixed(1)}px rgba(236,232,242,.5)` : 'none';
  $('#mirror').style.filter = sm > 0 ? `blur(${(0.6 * sm).toFixed(2)}px)` : 'none';
  // the frame: the head held still, a jolt on each twitch, the edges darken and warm as the jaw aches
  const jx = S.reduced ? 0 : (Math.random() * 2 - 1) * 2.4 * f01 * f01;
  const twitchJolt = Math.max(0, -G.v) * 10;
  $('#world').style.transform = `translate(${jx.toFixed(1)}px, ${(twitchJolt * 0.6).toFixed(1)}px) scale(${(1 + 0.02 * f01).toFixed(4)})`;
  $('#world').style.filter = `saturate(${(1 - 0.25 * f01).toFixed(3)})`;
  $('#vig').style.background = `radial-gradient(ellipse 70% 62% at 50% 42%, rgba(0,0,0,0) 45%, rgba(0,0,0,${(0.35 + 0.35 * f01).toFixed(2)}) 100%)`;
  $('#ache').style.opacity = (0.45 * smooth(40, 100, G.f)).toFixed(3);
  $('#ache').style.background = 'radial-gradient(ellipse 30% 26% at 0% 72%, rgba(200,40,30,.6), rgba(0,0,0,0) 70%), radial-gradient(ellipse 30% 26% at 100% 72%, rgba(200,40,30,.6), rgba(0,0,0,0) 70%)';
  if (SFX.strain) SFX.strain.g.gain.value = G.phase === 'loop' ? 0.05 * smooth(35, 100, G.f) : 0;
  // her picture: from below (the commander kneels); with her foot: the foot art comes up from below and closer as she pushes deeper
  if (img.naturalWidth) {
    const nw = img.naturalWidth, nh = img.naturalHeight;
    const sole = S.contact === 'sole_to_mouth';
    const Hs = H * (sole ? 1.5 : 1.3), sc = Hs / nh, Ws = nw * sc;
    const bottom = H * (sole ? 1.28 : 1.16) + (sole ? G.push * H * 0.25 : 0);
    const breathe = 1 + 0.006 * Math.sin(now / 900);
    img.style.transform = `translate(${(W / 2 - Ws / 2).toFixed(1)}px, ${(bottom - Hs).toFixed(1)}px) translate(${Ws / 2}px, ${Hs}px) rotateX(${sole ? 12 : 8}deg) scale(${breathe}) translate(${-Ws / 2}px, ${-Hs}px) scale(${sc.toFixed(4)})`;
    img.style.filter = `blur(${sole && footLoaded ? 2.5 : 0}px) brightness(${sole ? 0.8 : 0.92})`;
  }
  if (footLoaded && S.contact === 'sole_to_mouth') {
    const fh = H * S.footH * (1 + 0.3 * G.push), wig = S.reduced ? 0 : Math.sin(now / 160) * 2 * (G.order === 'suck' ? 1 : 0.3);
    foot.style.height = `${fh.toFixed(1)}px`;
    foot.style.transform = `translate(-50%, ${(H * 0.18 - G.push * H * 0.2).toFixed(1)}px) rotate(${wig.toFixed(2)}deg)`;
  }
  $('#backdrop').style.filter = `blur(${S.contact === 'sole_to_mouth' ? 6 : 2}px) brightness(.7)`;
  // drool on the mouth's lower edge: drops swell and fall
  dctx.clearRect(0, 0, W, H);
  for (const d of G.drops) {
    if (!d.falling) { d.r += d.grow * dt / 1000 * 3; if (d.r > 4.5) { d.falling = true; SFX.drip(); } }
    else { d.v += 900 * dt / 1000; d.y += d.v * dt / 1000; d.life -= dt / 1400; }
    const g = dctx.createRadialGradient(d.x - d.r * 0.3, d.y + d.r * 0.6, 0.5, d.x, d.y + d.r, d.r * 1.4);
    g.addColorStop(0, `rgba(255,255,255,${0.55 * d.life})`); g.addColorStop(0.5, `rgba(200,215,235,${0.25 * d.life})`); g.addColorStop(1, 'rgba(200,215,235,0)');
    dctx.fillStyle = g;
    dctx.beginPath(); dctx.ellipse(d.x, d.y + d.r, d.r * 0.8, d.r * (d.falling ? 1.6 : 1.1), 0, 0, Math.PI * 2); dctx.fill();
    if (!d.falling) { dctx.strokeStyle = `rgba(220,230,245,${0.25 * d.life})`; dctx.lineWidth = 1; dctx.beginPath(); dctx.moveTo(d.x, d.y - 2); dctx.lineTo(d.x, d.y + d.r); dctx.stroke(); }
  }
  G.drops = G.drops.filter((d) => d.life > 0 && d.y < H + 20);
}

/* ---------- input ---------- */
const H0 = () => innerHeight * 0.2; // the mouse from 20 % to 68 % of the height: shut to wide open; below that it pulls harder (to beat a tired jaw's pull)
const typing = (t: EventTarget | null) => t && (/^(input|textarea|select)$/i.test((t as HTMLElement).tagName) || (t as HTMLElement).isContentEditable);

/* =====================================================================================================================================
 * The wiring (no prototype code below): the run, the plan's moves, the reports, the heard line, the lines, the mount and its end.
 * ===================================================================================================================================== */

interface Seg { n: number; startedAt: number; clock0: number; beats: number; endMs: number; flushed: boolean; reported: number; entered: number }
interface Wiring {
  run: PhysicsRun | null;
  lineStyle: string;
  seg: Seg | null;
  running: boolean;
  plan: PlannedBeat[];
  /** Her planned move waiting to be played (`herMove`, after a rest when one is on). */
  move: { order?: string; orderMs?: number; ask?: true } | null;
  /** The cost of the opening over the frames of the beat being played (`bite`'s amount: their mean). */
  acc: number;
  accMs: number;
  /** The touches of the teeth already reported. */
  teeth: number;
  /** The segment whose rest reached the engine (the engine reads one a segment). */
  restSeg: number | null;
  restVia: 'mouse' | 'key';
  /**
   * The scene root's offset on the page, the mouth's width and its centre in its parent (the ghost frames), and how far the mouth is lifted so
   * that its centre stands at least `MOUTH_BOTTOM` above the frame's bottom (the prototype's: wide open, it and her band stay in the frame).
   */
  ox: number; oy: number; mouthW: number; mouthY: number; lift: number;
  /** The share of clear letters of each line sent (the instrument's summary only: UI, never the model's). */
  kept: number[];
  /** The heard line the field holds (written by `heardLine`), and the reply block's lift (it clears the mouth's widest reach: review I1). */
  heard: string | null;
  replyLift: number;
  /** The shots only: her picture instead of the scene's (a raster of the layout fixture's sprite, as the prototype's). */
  spriteSrc: string | null;
  lastNow: number;
  ended: string | null;
}
const R: Wiring = {
  run: null, lineStyle: 'neutral', seg: null, running: false, plan: [], move: null, acc: 0, accMs: 0, teeth: 0, restSeg: null, restVia: 'key',
  ox: 0, oy: 0, mouthW: 720, mouthY: 0, lift: 0, kept: [], heard: null, replyLift: 0, spriteSrc: null, lastNow: 0, ended: null,
};

/** The source by field: an item worn in the mouth is the ring (`ring_gag`); a contact on her toes is her toes (`sole_to_mouth`); anything else none. */
export function jawContactOf(run: Pick<PhysicsRun, 'sourceKind' | 'sourceId'>, reg: Registries): 'sole_to_mouth' | 'ring_gag' | null {
  return jawSourceOf(run, reg); // the engine's reader: her moves are planned for the same sources only
}
/** The prototype's draw for her move, from the plan's move (her toes: deeper < 0.32, back < 0.5, suck < 0.75, else wider; the ring: her question first, else wider). */
const R_OF: Record<string, Record<string, number>> = { sole_to_mouth: { deeper: 0, pull_back: 0.4, suck: 0.6, wider: 0.9 }, ring_gag: { ask: 0, wider: 1 } };
function moveR(): number {
  const m = R.move;
  const key = m?.ask ? 'ask' : m?.order ?? 'wider';
  return R_OF[S.contact]?.[key] ?? 1;
}
/** How long her order lasts: the plan's (`orderMs`), else the prototype's own span. */
function orderLen(a: number, b: number): number {
  return R.move?.orderMs ?? rand(a, b);
}
/** The line sent is the heard line: the field takes what came out, before the scene's own Enter sends it; the clear share stays here. */
function heardLine(heard: string, _meant: string, kept: number): void {
  if (!E) return;
  R.kept.push(kept);
  (E.env.input as HTMLInputElement).value = heard;
  R.heard = heard; // a line that did not go out stays in the field as it came out: it is not spoken through the mouth again
}
/** Her lines (cardVoice `jaw.*`) in the prototype's `LINES` shape, by her style; a model-worded cue of an order takes its place for that beat. */
function refreshLines(beat: number): void {
  if (!E) return;
  const env = E.env;
  const own = (k: string): string[] => [...voiceLines(env.registries, `jaw.${k}` as VoiceKind, R.lineStyle)];
  const voiced = (k: string, cue: CueKind): string[] => { const v = env.staging.voiced?.(cue, beat) ?? null; return v ? [v] : own(k); };
  const ask = own('ask').map((l): [string, string] => { const [q, w] = l.split('|'); return [q ?? '', w ?? '']; });
  LINES = {
    [S.style]: {
      entry: { [S.contact]: own(`entry.${S.contact}`) }, teeth: own('teeth'), deeper: voiced('deeper', 'deeper'), out: voiced('out', 'pull_back'),
      suck: voiced('suck', 'suck'), wide: voiced('wide', 'wider'), correct: own('correct'), restOk: own('restOk'), restNo: own('restNo'),
      ask: ask.length > 0 ? ask : [['', '']], // cold is silent: her question has no words (and wants none)
      heard: own('heard'), lost: own('lost'), end: own('end'), slack: own('slack'), stop: own('stop'),
    },
  };
}
/** The beat of the running segment at the loop's clock. */
function beatNow(): number {
  const seg = R.seg;
  if (!seg) return 0;
  return clamp(Math.floor((G.t - seg.clock0) / BEAT), 0, seg.beats - 1);
}
/** Sends an input of this segment to the engine (once); `pointer` when the mouse made it (ruling O). */
function report(i: SegmentInput, pointer: boolean): void {
  if (!E || !R.seg || !R.running) return;
  E.env.staging.input(i, { pointer });
}
/** A beat ended: the mean cost of the opening over its frames (R21). A beat the instrument did not play costs the engine's flat rate. */
function reportBeat(beat: number, played: boolean): void {
  const amount = played && R.accMs > 0 ? R.acc / R.accMs : 1;
  R.acc = 0; R.accMs = 0;
  report({ beat, kind: 'bite', amount: Math.round(amount * 1000) / 1000 }, true);
}
/**
 * Re-review m1: a rest asked this close to the segment's end is not taken (its answer, 500 ms later, would come after the engine closed the
 * segment: the flush's 300 ms and her answer's 500 ms); it is dropped with the same cue as a second rest.
 */
export const REST_LATE = 300 + 500;
/**
 * Ruling V: a rest reaches the engine once a segment (it reads the first). Another asked in the same segment, or between segments, is not
 * taken: it is dropped at once, never asked later unbidden, and the rest ring says so (it flashes `dropped`); she says nothing.
 */
function restWaits(): boolean {
  if (!R.running || !R.seg || R.restSeg === R.seg.n || G.t - R.seg.clock0 >= R.seg.endMs - REST_LATE) {
    G.restAsked = true;
    const ring = E?.els['#restRing'];
    if (ring) { ring.classList.add('dropped'); setTimeout(() => ring.classList.remove('dropped'), 700); }
    return true;
  }
  report({ beat: beatNow(), kind: 'ask_rest' }, R.restVia === 'mouse');
  R.restSeg = R.seg.n;
  return false;
}
/** A running segment the loop has not met yet: its beats on the loop's clock; the fatigue is the engine's gauge now. */
function startSegment(run: PhysicsRun, ck: { startedAt: number | null; now: number }): void {
  const plan = run.segment.plan!;
  const phys = E!.env.registries.contactPhysics.get(run.physicsId);
  const endMs = Number(phys?.segmentSeconds ?? 30) * 1000;
  const clock0 = G.t - (ck.now - ck.startedAt!);
  const first = Math.max(0, Math.floor((G.t - clock0) / BEAT));
  R.seg = { n: run.segment.n, startedAt: ck.startedAt!, clock0, beats: plan.beats.length, endMs, flushed: false, reported: 0, entered: first };
  R.plan = plan.beats;
  R.acc = 0; R.accMs = 0;
  // the engine's gauge, plus what a rest still falling here has yet to take off (the engine took all of it off at the segment's end: Ruling V)
  G.f = clamp((100 * run.gauge) / Math.max(1, run.capacity) + (G.resting > 0 ? (JAW_REST / REST_MS) * G.resting : 0), 0, 100);
  for (let b = 0; b < Math.min(first, plan.beats.length); b++) reportBeat(R.seg.reported++, false); // beats before the mount: the flat cost
}
/**
 * Text that reached the field without a key of `onType` (already there at the mount, or written by an input method): it comes out of the
 * mouth too, letter by letter through the opening now, as typed letters do; the field itself stays empty (review M1).
 */
function absorb(): void {
  if (!E) return;
  const input = E.env.input as HTMLInputElement;
  const v = input.value;
  if (v === '' || G.phase !== 'loop' || v === R.heard) return;
  input.value = '';
  R.heard = null;
  for (const ch of v) onType({ key: ch, ctrlKey: false, metaKey: false, preventDefault: () => undefined } as unknown as KeyboardEvent);
}
/** Her planned move on a beat that begins: queued for `herMove` (her lines of that beat first, so a model-worded order is hers). */
function enterBeat(b: number): void {
  const pb = R.plan[b];
  if (!pb || (pb.order === undefined && !pb.ask)) return;
  refreshLines(b);
  R.move = { ...(pb.order !== undefined ? { order: pb.order } : {}), ...(pb.orderMs !== undefined ? { orderMs: pb.orderMs } : {}), ...(pb.ask ? { ask: true as const } : {}) };
}

/** Each frame before the prototype's: the size, the still form, the sound, her sprite, the backdrop, the segment, its moves and reports. */
function before(now: number): void {
  const e = E!;
  if (last > now) last = now; // a frame's time is when the frame began: never before the clock the mount read (no negative step)
  if (R.lastNow > now) R.lastNow = now;
  const r = e.env.root.getBoundingClientRect();
  const w = e.env.root.clientWidth || r.width || globalThis.innerWidth || 0, h = e.env.root.clientHeight || r.height || globalThis.innerHeight || 0;
  if (w !== innerWidth || h !== innerHeight) { innerWidth = w; innerHeight = h; }
  R.ox = r.left; R.oy = r.top;
  S.reduced = e.env.reduced;
  S.readable = e.env.readable;
  e.box.toggleAttribute('data-reduced', S.reduced);
  e.box.toggleAttribute('data-readable', S.readable);
  e.mirror.toggleAttribute('data-readable', S.readable);
  if (!A.ctx) { audioInit(); if (A.ctx) { loadSamples(); strainInit(); } }
  // her sprite: the scene's picture, drawn from below by the instrument (the scene's own <img> is never moved)
  const scene = R.run ? e.env.spriteOf(R.run.holderId) : null;
  const src = R.spriteSrc ?? scene?.getAttribute('src') ?? '';
  if (src !== '' && img.getAttribute('src') !== src) img.setAttribute('src', src);
  if (img.naturalWidth && img.style.width !== `${img.naturalWidth}px`) { img.style.width = `${img.naturalWidth}px`; img.style.height = `${img.naturalHeight}px`; }
  const bg = e.env.layers.backdrop.style.backgroundImage;
  const mine = e.els['#backdrop']!;
  if (bg !== mine.style.backgroundImage) mine.style.backgroundImage = bg;
  // the mouth's place: its width and its centre in its parent (the ghost frames are drawn there), the letters over the field
  R.mouthW = e.line.offsetWidth || 720;
  R.mouthY = e.line.offsetTop + e.line.offsetHeight / 2;
  // the mouth's centre on the frame, as laid out (its margins keep it; the lift and the tremble are transforms): lifted to the prototype's height
  const lr = e.line.getBoundingClientRect();
  const centre = lr.height > 0 ? lr.top + lr.height / 2 - r.top + R.lift : 0;
  R.lift = centre > 0 && innerHeight > 0 ? Math.max(0, centre - (innerHeight - MOUTH_BOTTOM)) : 0;
  placeMirror(e);
  const input = e.env.input as HTMLInputElement;
  e.env.input.toggleAttribute('data-jaw-letters', spoken.length > 0 || input.value === '');
  // the segment: met when it runs, its moves played as their beats begin, its beats reported as they end, the last flushed before its end
  const run = R.run;
  const ck = e.env.staging.clock();
  R.running = run !== null && run.segment.state === 'running' && run.segment.plan !== undefined && ck.startedAt !== null;
  if (G.phase === 'loop' && R.running && (R.seg === null || R.seg.n !== run!.segment.n || R.seg.startedAt !== ck.startedAt)) startSegment(run!, ck);
  const seg = R.seg;
  if (R.running && seg && !seg.flushed && G.phase === 'loop') {
    const passed = Math.floor((G.t - seg.clock0) / BEAT);
    while (seg.entered <= Math.min(passed, seg.beats - 1)) enterBeat(seg.entered++);
    while (seg.reported < Math.min(passed, seg.beats)) reportBeat(seg.reported++, true);
    if (G.t - seg.clock0 >= seg.endMs - 300) {
      seg.flushed = true;
      while (seg.reported < seg.beats) reportBeat(seg.reported++, true);
    }
  }
}
/** After the prototype's frame: the cost of the frame, a touch of the teeth, the claimed styles it wrote, the mouth's centre, a new line kept in. */
function after(now: number): void {
  const e = E;
  if (!e) return;
  const dt = Math.min(50, Math.max(0, now - R.lastNow));
  R.lastNow = now;
  if (G.phase === 'loop') { R.acc += (G.resting > 0 ? 0 : G.cost ?? RELAXED) * dt; R.accMs += dt; }
  // the teeth touched her: a slip of the commander's (R22), reported at once
  while (R.teeth < G.stats.teeth) { R.teeth += 1; report({ beat: beatNow(), kind: 'bite', part: 'teeth' }, true); }
  noteWrites(e.claims[0]!, ['height', 'transform', '--ache', 'border-color']);
  // the mouth opens around its centre: the line keeps its place in the scene's column (as the prototype's mouth, centred where it stands)
  const hgt = parseFloat(e.line.style.height) || e.base;
  const margin = `${(-(hgt - e.base) / 2).toFixed(1)}px`;
  if (e.line.style.marginTop !== margin) { writeClaimed(e.claims[0]!, 'margin-top', margin); writeClaimed(e.claims[0]!, 'margin-bottom', margin); }
  // the reply clears the mouth at its widest (the prototype's `#reply` stands at 230 px, over the mouth's reach of 96 + 85): lifted by a claim
  liftReply(e);
  const cursor = G.phase === 'loop' ? 'ns-resize' : null;
  if ((e.env.layers.frame.style.cursor || null) !== cursor) writeClaimed(e.claims[1]!, 'cursor', cursor);
  if (S.readable) for (const el of [img, e.els['#backdrop']!, e.mirror]) if (/blur\((?!0)/.test(el.style.filter)) el.style.filter = el.style.filter.replace(/blur\([^)]*\)/g, 'blur(0px)');
  const lastEl = e.els['#hand']!.lastElementChild;
  if (lastEl !== lastLine) { lastLine = lastEl; keepInFrame(e); }
}
/** Review I1: the reply block, as laid out, against the mouth's widest reach (its centre less half of `MOUTH_H[1]`, and a gap): lifted clear of it. */
export const REPLY_GAP = 12;
function liftReply(e: JawEls): void {
  const reply = e.env.reply;
  const rr = reply.getBoundingClientRect(), lr = e.line.getBoundingClientRect();
  if (rr.height <= 0 || lr.height <= 0) return;
  const centre = lr.top + lr.height / 2; // as drawn: the lift is in it
  const laidBottom = rr.bottom + R.replyLift;
  const lift = Math.max(0, Math.ceil(laidBottom - (centre - MOUTH_H[1]! / 2 - REPLY_GAP)));
  if (lift === R.replyLift) return;
  R.replyLift = lift;
  writeClaimed(e.claims[2]!, 'transform', lift > 0 ? `translateY(${-lift}px)` : null);
}
let lastLine: Element | null = null;
/** Her lines stay inside the frame (ruling Q): a line that would run past an edge is moved back in (one wider than 40 % wraps, by its CSS). */
function keepInFrame(e: JawEls): void {
  for (const el of e.els['#hand']!.children as HTMLCollectionOf<HTMLElement>) {
    const w = el.offsetWidth, x = el.offsetLeft;
    if (!w) continue;
    if (x + w > innerWidth - 8) el.style.left = `${Math.max(8, innerWidth - 8 - w)}px`;
    else if (x < 8) el.style.left = '8px';
  }
}
/** The letters lie over the input (the prototype's `#mirror` over `#cmd`): same box, same font. */
function placeMirror(e: JawEls): void {
  const input = e.env.input;
  const m = e.mirror;
  m.style.left = `${input.offsetLeft}px`;
  m.style.top = `${input.offsetTop}px`;
  m.style.width = `${input.offsetWidth}px`;
  m.style.height = `${input.offsetHeight}px`;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** The kit's context that draws nothing, whose gradients take their stops (the drops make one each). */
function standIn(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const base = nullContext(canvas);
  return new Proxy(base, { get: (t, p) => (p === 'createRadialGradient' ? () => ({ addColorStop: () => undefined }) : Reflect.get(t, p)) }) as CanvasRenderingContext2D;
}
function build(env: InstrumentEnv): JawEls {
  const box = document.createElement('div');
  box.className = 'alius-jaw';
  box.setAttribute('aria-hidden', 'true'); // as the effects layer it lives in (stage/layers.ts): the mouth is the scene's own field
  const els: Record<string, HTMLElement> = {};
  const div = (id: string, parent: HTMLElement, tag = 'div'): HTMLElement => { const el = document.createElement(tag); el.className = `alius-jaw-${id}`; els[`#${id}`] = el; parent.append(el); return el; };
  const world = div('world', box);
  div('backdrop', world);
  const cam = div('cam', world);
  img = div('her', cam, 'img') as HTMLImageElement;
  img.alt = ''; img.draggable = false;
  foot = div('foot', cam, 'img') as HTMLImageElement;
  foot.alt = ''; foot.draggable = false;
  div('vig', box);
  div('ache', box);
  drool = div('drool', box, 'canvas') as HTMLCanvasElement;
  let c2: CanvasRenderingContext2D | null = null;
  try { c2 = drool.getContext('2d'); } catch { c2 = null; }
  dctx = c2 ?? standIn(drool); // a page with no canvas: a context that draws nothing
  div('hand', box);
  env.layers.effects.append(box);
  // the mouth: the scene's input line, with the hinges, the letters and the rest ring on it; her band's ghost frames beside it
  const line = inputLine(env);
  const base = line.offsetHeight;
  const clip = document.createElement('div');
  clip.className = 'alius-jaw-clip';
  clip.setAttribute('aria-hidden', 'true');
  for (const side of ['l', 'r']) { const hg = document.createElement('div'); hg.className = `alius-jaw-hinge ${side}`; clip.append(hg); }
  line.append(clip);
  const mirror = document.createElement('div');
  mirror.className = 'alius-jaw-mirror';
  mirror.setAttribute('aria-hidden', 'true');
  line.append(mirror);
  const ring = document.createElementNS(SVG_NS, 'svg');
  ring.setAttribute('class', 'alius-jaw-rest');
  ring.setAttribute('viewBox', '0 0 30 30');
  ring.setAttribute('aria-hidden', 'true');
  const circle = (attrs: Record<string, string>): SVGElement => { const el = document.createElementNS(SVG_NS, 'circle'); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); ring.append(el); return el; };
  circle({ cx: '15', cy: '15', r: '12', fill: 'none', stroke: 'rgba(255,255,255,.15)', 'stroke-width': '2' });
  els['#restArc'] = circle({ cx: '15', cy: '15', r: '12', fill: 'none', stroke: 'rgba(255,214,170,.9)', 'stroke-width': '2', 'stroke-dasharray': '75.4', 'stroke-dashoffset': '75.4', transform: 'rotate(-90 15 15)' }) as unknown as HTMLElement;
  els['#restRing'] = ring as unknown as HTMLElement;
  line.append(ring);
  const holder = line.parentElement ?? line;
  for (const id of ['bandLo', 'bandHi']) { const b = document.createElement('div'); b.className = 'alius-jaw-band'; b.setAttribute('aria-hidden', 'true'); els[`#${id}`] = b; holder.append(b); }
  env.input.dataset.jawLetters = '';
  const claims = [claimStyles(line, ['height', 'margin-top', 'margin-bottom', 'transform', '--ache', 'border-color']), claimStyles(env.layers.frame, ['cursor']), claimStyles(env.reply, ['transform'])];
  return { env, box, els, line, mirror, claims, frameId: null, base };
}

/** Binds the run: what holds the mouth open (read by field), her style's row and lines, the commander's endurance, her look. */
function bind(env: InstrumentEnv, run: PhysicsRun): void {
  const state: CampaignState = env.state();
  const reg: Registries = env.registries;
  reseed(fnv1a(`${state.scene?.id ?? ''}|${run.id}|jaw`));
  const lead = leadStyle(physicsStyleOf(state, run.holderId, reg));
  S.style = jawRowOf(lead); // the engine's row (Ruling R): her spacing, her rest rule and the push for the teeth agree with the engine's
  R.lineStyle = lead.key;
  R.run = run;
  R.seg = null; R.running = false; R.plan = []; R.move = null; R.acc = 0; R.accMs = 0; R.teeth = 0; R.restSeg = null; R.restVia = 'key'; R.kept = []; R.heard = null; R.replyLift = 0; R.ended = null;
  S.contact = jawContactOf(run, reg) ?? 'sole_to_mouth';
  S.skill = state.commander.endurance?.[run.physicsId]?.level ?? 0;
  refreshLines(0);
  const look = env.her(run.holderId);
  E!.box.style.setProperty('--alius-her', look.accent);
  if (look.hand !== '') E!.box.style.setProperty('--alius-font-hand', `"${look.hand}", var(--alius-font-type)`);
  E!.box.style.setProperty('--alius-jaw-hand-scale', String(look.handScale || 1));
}

/**
 * The listeners of the prototype's page, on the scene: the mouse's height is the jaw; keys typed into the field are spoken through the
 * opening (Enter sends the heard line); Shift (never from a field or a control: there it is a capital) or the right button, held, asks for a
 * rest; the left button on the frame gives the field the focus.
 */
function listen(env: InstrumentEnv): void {
  const control = (t: EventTarget | null): boolean => t instanceof Element && t.closest('button, a, [role="button"], select, [data-action]') !== null;
  const onFrame = (t: EventTarget | null): boolean => t instanceof Node && (t === env.layers.frame || env.layers.frame.contains(t));
  const onMouth = (t: EventTarget | null): boolean => t instanceof Node && E !== null && E.line.contains(t) && !control(t);
  env.listen(document, 'pointermove', ((e: PointerEvent) => {
    const r = env.root.getBoundingClientRect();
    G.target = clamp((e.clientY - r.top - H0()) / ((innerHeight || r.height || 1) * 0.48), 0, 1.6);
  }) as EventListener);
  // the field is the mouth: its keys are spoken through the opening, before the scene's own handler (which sends the heard line on Enter)
  env.listen(env.root, 'keydown', ((e: KeyboardEvent) => { if (e.target !== env.input || e.isComposing) return; if (e.key === 'Enter') absorb(); onType(e); }) as EventListener, true);
  // an input method's text (written after its composition) comes out of the mouth as typed letters do
  env.listen(env.input, 'input', ((e: Event) => { if (!(e as InputEvent).isComposing) absorb(); }) as EventListener);
  env.listen(env.input, 'compositionend', (() => absorb()) as EventListener);
  for (const type of ['paste', 'drop']) env.listen(env.input, type, ((e: Event) => e.preventDefault()) as EventListener); // only typed letters come out of the mouth
  env.listen(document, 'keydown', ((e: KeyboardEvent) => {
    if (typing(e.target) || control(e.target) || e.ctrlKey || e.metaKey || e.altKey) return; // while typing, Shift is a capital: only the right button asks
    if (e.key === 'Shift' && !G.restKey) { G.restKey = true; G.restDown = performance.now(); R.restVia = 'key'; }
  }) as EventListener);
  env.listen(document, 'keyup', ((e: KeyboardEvent) => { if (e.key === 'Shift' && R.restVia === 'key') G.restKey = false; }) as EventListener);
  env.listen(env.root, 'pointerdown', ((e: PointerEvent) => {
    if (e.button === 2 && (onFrame(e.target) || onMouth(e.target))) { e.preventDefault(); G.restKey = true; G.restDown = performance.now(); R.restVia = 'mouse'; }
    else if (e.button === 0 && onFrame(e.target)) { e.preventDefault(); setTimeout(() => $('#cmd').focus(), 0); }
  }) as EventListener);
  env.listen(document, 'pointerup', ((e: PointerEvent) => { if (e.button === 2 && R.restVia === 'mouse') G.restKey = false; }) as EventListener);
  env.listen(env.layers.frame, 'contextmenu', ((e: Event) => e.preventDefault()) as EventListener);
  env.listen(E!.line, 'contextmenu', ((e: Event) => e.preventDefault()) as EventListener);
}

function stopJaw(): void {
  const e = E;
  if (!e) return;
  if (e.frameId !== null) e.env.cancelRaf(e.frameId);
  try { A.master?.disconnect(); } catch { /* not connected */ }
  A = { ctx: null, buf: {} };
  SFX.strain = null;
  for (const c of e.claims) releaseClaim(c);
  e.box.remove();
  for (const el of [e.mirror, e.line.querySelector('.alius-jaw-clip'), e.els['#restRing'], e.els['#bandLo'], e.els['#bandHi']]) el?.remove();
  delete e.env.input.dataset.jawLetters;
  e.env.input.removeAttribute('data-jaw-letters');
  spoken.length = 0;
  lastLine = null;
  footLoaded = false;
  R.run = null; R.seg = null; R.running = false; R.plan = []; R.move = null; R.spriteSrc = null; R.replyLift = 0; R.heard = null;
  LINES = { neutral: noLines() };
  G = fresh();
  E = null;
}

/** The instrument's own summary of a run (UI only, R28 and R23: the model's sentence is the engine's tally; the clear share is never a number for it). */
export function digest(): { held: number; fatigue: number; stats: Glob['stats']; kept: number[]; ended: string | null } {
  return { held: Math.round(G.t / 1000), fatigue: Math.round(G.f), stats: { ...G.stats }, kept: [...R.kept], ended: R.ended };
}

/** How long the end plays: her last line (the prototype's `say` stays 2600 ms). */
export const EXIT_MS = 2600;

/** Starts the instrument on a run (the host's `start`). */
export function startJaw(env: InstrumentEnv, run: PhysicsRun): InstrumentRun {
  stopJaw();
  E = build(env);
  { const r = env.root.getBoundingClientRect(); innerWidth = env.root.clientWidth || r.width || 0; innerHeight = env.root.clientHeight || r.height || 0; } // her first words are placed on the frame
  bind(env, run);
  listen(env);
  last = env.now(); R.lastNow = last;
  audioInit();
  if (A.ctx) loadSamples();
  begin();
  absorb(); // a line already in the field comes out of the mouth
  requestAnimationFrame(frame);
  const mine = E;
  return {
    update(next: PhysicsRun) {
      if (E !== mine) return;
      R.run = next;
    },
    finish(end: PhysicsEnd): number {
      if (E !== mine) return 0;
      if (G.phase !== 'loop') return 0;
      R.ended = end.result;
      refreshLines(beatNow()); // her lines of §10 (the staging is dead now: no model words)
      finish(end.result === 'stopped' ? 'stop' : end.result);
      return EXIT_MS;
    },
    stop() {
      if (E === mine) stopJaw();
    },
  };
}

/**
 * The jaw of a run: a gesture interaction (read by field) held open by her toes or by an item worn in the mouth (`jawContactOf`, by field),
 * alone or with a second that takes no input of the commander's (`passive`). Anything else (another contact's jaw, a pair whose second needs
 * inputs jaw.html does not port) is the card's.
 */
export function jawMatches(run: PhysicsRun, _state: CampaignState, reg: Registries): boolean {
  if (reg.contactPhysics.get(run.physicsId)?.interaction !== 'gesture') return false;
  if (jawContactOf(run, reg) === null) return false;
  if (!run.second) return true;
  return reg.contactPhysics.get(run.second.physicsId)?.interaction === 'passive';
}

registerInstrument({ id: 'jaw', matches: jawMatches, start: startJaw });

/**
 * Review M5 (re-review m3): whether the commander's line goes out through the ring as it came out of the mouth: the jaw instrument is drawn for
 * a ring held in the mouth (`instrumentFor`: real time in the settings and the campaign, the gesture on, this instrument matching). The scene
 * directive then says that clear speech is understood; otherwise (the card plays the jaw: the line goes out as typed) the ring's own limit.
 */
export function ringHeard(state: CampaignState, reg: Registries, settings: AliusSettings): boolean {
  const run = state.scene?.physics;
  return run !== undefined && jawSourceOf(run, reg) === 'ring_gag' && instrumentFor(run, state, reg, settings)?.id === 'jaw';
}

/** Tests and the shots only: the prototype's state and hooks (its `window.__G`, `__S`, `__begin`, `__speak`). */
export const _jaw = {
  get G(): Glob { return G; },
  get R(): Wiring { return R; },
  get S(): typeof S { return S; },
  get LINES(): Record<string, Lines> { return LINES; },
  bandNow, herMove, askRest, update, say, begin, finish, fresh, spawnDrop, onType, sendLine, digest,
  setG(g: Glob): void { G = g; },
  /** Tests: the seed of the module's `Math.random` (a xorshift, no rng draw). */
  seed(n: number): void { reseed(n); },
  /** The shots: the frame clock starts again (a fake clock installed after the page began). */
  resetClock(): void { last = E ? E.env.now() : 0; R.lastNow = last; },
  /** The shots and the tests: her move now, as the plan would give it. */
  move(m: { order?: string; orderMs?: number; ask?: true }): void { refreshLines(beatNow()); R.move = m; herMove(); },
  /** The shots: her picture (the prototype's raster of the fixture), instead of the scene's. */
  sprite(url: string | null): void { R.spriteSrc = url; },
  /** The prototype's `G.target`: where the mouse holds the jaw (0 shut, 1 wide open). */
  aim(t: number): void { G.target = t; },
};
