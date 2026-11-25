/**
 * P10e-e Task 16: weight as an instrument (`docs/prototypes/weight.html`, normative; its `fidelity.json` checks the port against it). She
 * rests her weight on the commander: hold Space (or the left button on the frame) to bear it, letting go is a slip; the mouse is the
 * commander's balance, and the frame tilts with the error between her centre of weight and that balance; a spirit level at the bottom shows it.
 * Her shifts are the engine's plan (each telegraphed by her style's lead: her shadow, her legs, her screen's light or, out of view, a rustle and
 * a creak to one side); Shift or the right button shifts the commander's own weight (while typing only the right button). Two views by the
 * contact (`contactFaceOf`): face up, the ceiling and her from below (the art slot `over` when there is one, else her sprite rising from the
 * bottom edge); face down, the floor (P10c's `surface: 'floor'`), her legs hanging at the edges where the contact says so (`herLegsOf`) and
 * the cool light of her screen sliding over it.
 *
 * The functions are the prototype's, copied (types added). The wiring, declared in `fidelity.json`:
 * - her shifts are the engine's plan (`plan.beats[].shift`, placed in wall time through `staging.clock()`): each lands at the start of its beat
 *   (+30 ms, the prototype's), telegraphed `STYLES[].tele` before; its cost is the plan's; a playful holder's feints (35 %) are told between two
 *   planned shifts, never instead of one; her attention is the plan's beat by beat; her heavier lean is `run.pressure` (a boundary's `press`);
 * - every beat is reported once as it ends (or 300 ms before the segment's end): `hold` when it was held (Ruling S: a tilt is never a slip,
 *   as the prototype's) and `uneven` with the mean extra drain factor of the beat (R16), marked `part: 'tilted'` when it ended off level
 *   (`|err| > tol`), which the engine's shift rule reads; the commander's own shift at once (`shift_weight`); whether she felt it is the
 *   engine's (`cheatRoll` at the segment's end), so her `caught` line follows `run.tally.cheatsCaught`; a report the mouse made is exempt from
 *   the typing lapse (ruling O);
 * - her lines are `cardVoice` `weight.*` by her style (ruling Q; `weight.entry.<contact>` for her first words); a model-worded `press` cue may
 *   take her `heavy` line's place; the cue pool's narration is never written in her hand;
 * - `performance`, `setTimeout`, `requestAnimationFrame`, `innerWidth` / `innerHeight` and `Math.random` are this module's own: the scene's frame
 *   clock, the mount's timers and frames, the scene's size, and a xorshift seeded by the scene and the run (no rng draw);
 * - the room view is the scene itself (the instrument's box is clear until her view fades in), the floor and the ceiling are P10c's art;
 * - the end is the engine's: on its outcome the exit plays through `finish`.
 *
 * Ruling B: the core (the balance, the bubble, the level, her lines, the cracks and the reports) mounts inside another instrument with
 * `startWeight(env, coreRun(run, 'second'), { host, core: true })` (the weight's own view of the run, also to every `update`): it draws into
 * that host with no view of its own (no floor, no ceiling, no sprite, no tilt of a world), and the outer instrument tilts and shakes its own
 * frame by `weightFrame()` (the prototype's tilt, tremble and sag). In the core its own keys and its room tone are off by default (`keys`,
 * `roomTone`): the outer instrument owns them and forwards the commander's acts (`WeightCoreRun.hold`, `shift`, `balance`).
 */
import type { Registries } from '../../../../content/types';
import type { CueKind } from '../../../../engine/blocking/types';
import { ceilingOf, floorOf } from '../../../../engine/backdrops';
import { fnv1a } from '../../../../engine/hub';
import { contactFaceOf, herLegsOf } from '../../../../engine/physics/occlusion';
import type { PhysicsRun, SegmentInput } from '../../../../engine/physics/state';
import { resolveEnvOf, resolveSegment } from '../../../../engine/physics/segment';
import { effectiveHoldsUntil, leadStyle, physicsStyleOf } from '../../../../engine/physics/style';
import type { CampaignState } from '../../../../engine/state/types';
import { TUNING } from '../../../../engine/tuning';
import { voiceLines, type VoiceKind } from '../../cards/voice';
import { registerInstrument } from '../host';
import { chaikin, type Pt } from '../kit/chaikin';
import { DS, lowres, nullContext } from '../kit/lowres';
import { clamp, lerp, smooth } from '../kit/math';
import { claimStyles, noteWrites, releaseClaim, type StyleClaim } from '../styleClaims';
import type { InstrumentEnv, InstrumentRun, PhysicsEnd } from '../types';
import { buildVial } from './vial';

/* ---------- the wiring: the mount, the clock, the timers, the frames and the size of the scene ---------- */
interface WeightEls {
  env: InstrumentEnv;
  box: HTMLElement;
  els: Record<string, HTMLElement>;
  mirror: HTMLElement;
  claims: StyleClaim[];
  frameId: number | null;
  core: boolean;
}
let E: WeightEls | null = null;
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
/** No rng: the prototype's `Math.random` is a xorshift seeded by the scene and the run (the same run draws the same shifts and cracks). */
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
  return e.els[s]!;
};
const inputLine = (env: InstrumentEnv): HTMLElement => env.input.closest<HTMLElement>('.alius-input-line') ?? env.input.parentElement ?? env.input;

/* ---------- the prototype's helpers ---------- */
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/* ---------- the engine's numbers (TUNING.physics.weight: the strength of the instrument is the gauge's share, so they are scaled by its capacity) ---------- */
let BEAT = TUNING.physics.beatMs;
let W_DRAIN = TUNING.physics.weight.drain, RELIEF = TUNING.physics.weight.relief;

interface StyleRow { tele: [number, number]; feint: number; heavy: number; mag: [number, number]; watchBias: number; note: string; announce?: boolean; even?: number }
/**
 * Her style's way with her shifts (weight.html `STYLES`, as it is). The instrument reads `tele` (the telegraph's lead), `feint`, `mag` and
 * `announce`; `heavy`, `watchBias` and `even` are the prototype's scheduler's (her heavier lean is `run.pressure`, her attention and her shift
 * beats are the plan's).
 */
export const STYLES: Record<string, StyleRow> = {
  neutral:      { tele: [650, 850], feint: 0,    heavy: 0.15, mag: [0.35, 0.7], watchBias: 0,    note: 'her shadow leans about 0.7 s before her weight moves' },
  affectionate: { tele: [900, 1100], feint: 0,   heavy: 0.05, mag: [0.25, 0.5], watchBias: -0.1, note: 'long, gentle warnings; small shifts; rarely heavier' },
  ritual:       { tele: [750, 750], feint: 0,    heavy: 0.1,  mag: [0.4, 0.6],  watchBias: 0,    note: 'announces each shift in her hand, evenly, every fourth beat', announce: true, even: 4 },
  playful:      { tele: [500, 750], feint: 0.35, heavy: 0.15, mag: [0.35, 0.8], watchBias: 0,    note: 'feints: her shadow leans and comes back' },
  clinical:     { tele: [150, 1100], feint: 0,   heavy: 0.1,  mag: [0.3, 0.9],  watchBias: 0.1,  note: 'the warning time changes every shift: she measures how fast you learn' },
  cruel:        { tele: [0, 0], feint: 0,        heavy: 0.35, mag: [0.6, 1.0],  watchBias: 0.2,  note: 'no warning; big shifts; often leans in heavier; watches more' },
};
/** The prototype's row for a style it has no row of: by how she gives her cues (`TUNING.physics.style[].cues`). */
const ROW_BY_CUES: Record<string, string> = { honest: 'neutral', count: 'ritual', announce: 'ritual', false: 'playful', none: 'cruel', shift: 'clinical' };

/* ---------- settings (weight.html `S`: the approved defaults; the contact, the style, the fit of `over`, her face point and the still form are the run's and the scene's) ---------- */
const S = {
  legs: 'hang', foot: 'relaxed', legShade: 'shadow', toFall: false, style: 'neutral', task: 'reading', tol: 0.18, drain: 1, len: 45, unevenCost: true, sound: true, vol: 0.7,
  face: { x: 0.5, y: 0.21 }, overH: 1.04, overX: 0.5, overSink: 0, debug: false, reduced: false, readable: false, roomTone: true,
};
type Lines = Record<string, string[]>;
/** What the prototype read from its panel and its scheduler, here from the run (see the module's note). */
interface Wiring {
  run: PhysicsRun | null;
  face: 'up' | 'down';
  legs: boolean;
  /** Her pressure from the engine (`run.pressure`, 1 when none). */
  pressure: number;
  lines: Lines;
  lineStyle: string;
  seg: { n: number; startedAt: number; clock0: number; beats: number; endMs: number; flushed: boolean } | null;
  running: boolean;
  queue: Array<{ at: number; fn: () => void }>;
  /** The inputs sent this segment (`beat|kind`): each once; and the inputs themselves (the engine's view of the segment at the end). */
  sent: Set<string>;
  inputs: SegmentInput[];
  /** The commander tapped this segment (P15a's tap: a signal holder lets go at once). */
  tapped: boolean;
  /** The extra drain factor accumulated over the beat (`(unevenMult − 1) × ms`) and the ms. */
  uneven: { sum: number; ms: number };
  via: 'mouse' | 'key';
  segSlips: number;
  cheatsCaught: number;
  /** The segment whose resolved strength was taken (once each). */
  synced: number;
  spriteSrc: string;
  overFit: { height: number; x: number; sink: number } | null;
}
const NO_LINES: Lines = { entry: [], released: [], slip: [], caught: [], heavy: [], good: [], poor: [], fall: [], stop: [], longer: [], announce: [] };
const R: Wiring = {
  run: null, face: 'down', legs: false, pressure: 1, lines: NO_LINES, lineStyle: 'neutral', seg: null, running: false, queue: [], sent: new Set(), inputs: [], tapped: false, uneven: { sum: 0, ms: 0 },
  via: 'key', segSlips: 0, cheatsCaught: 0, synced: -1, spriteSrc: '', overFit: null,
};
const C = () => ({ face: R.face, weight: 1, shift: 1 });
const ST = () => STYLES[S.style];
const L = () => R.lines;

/* ---------- audio ---------- */
interface Audio {
  ctx: AudioContext | null; master?: GainNode; world?: BiquadFilterNode; body?: GainNode; white?: AudioBuffer; brown?: AudioBuffer; roomG?: GainNode;
  rumLP?: BiquadFilterNode; rumG?: GainNode; lfo?: OscillatorNode; lfoG?: GainNode;
}
let A: Audio = { ctx: null };
function audioInit() {
  if (A.ctx) return;
  const ctx = E?.env.samples?.ctx() ?? null;
  const out = E?.env.samples?.bus('body') ?? null;
  if (!ctx || !out) return;
  A.ctx = ctx;
  A.master = ctx.createGain(); A.master.gain.value = S.sound ? S.vol : 0; A.master.connect(out);
  A.world = ctx.createBiquadFilter(); A.world.type = 'lowpass'; A.world.frequency.value = 14000; A.world.connect(A.master);
  A.body = ctx.createGain(); A.body.connect(A.master);
  const mk = (sec: number, fill: (d: Float32Array) => void) => { const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate); fill(b.getChannelData(0)); return b; };
  A.white = mk(2, (d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
  A.brown = mk(4, (d) => { let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } });
  if (S.roomTone) {
    const room = ctx.createBufferSource(); room.buffer = A.brown; room.loop = true;
    const rl = ctx.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 500; A.roomG = ctx.createGain(); A.roomG.gain.value = 0.05;
    room.connect(rl); rl.connect(A.roomG); A.roomG.connect(A.world); room.start();
  }
  // the strain: a low rumble whose tremble grows as the strength goes
  const rum = ctx.createBufferSource(); rum.buffer = A.brown; rum.loop = true;
  A.rumLP = ctx.createBiquadFilter(); A.rumLP.type = 'lowpass'; A.rumLP.frequency.value = 120;
  A.rumG = ctx.createGain(); A.rumG.gain.value = 0;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 9; A.lfo = lfo; const lfoG = ctx.createGain(); lfoG.gain.value = 0; A.lfoG = lfoG;
  lfo.connect(lfoG); lfoG.connect(A.rumG.gain); lfo.start();
  rum.connect(A.rumLP); A.rumLP.connect(A.rumG); A.rumG.connect(A.body); rum.start();
}
interface NoiseOpts { at?: number; dur?: number; type?: BiquadFilterType; f?: number; f2?: number; q?: number; gain?: number; attack?: number; dest?: AudioNode; pan?: number }
function noise({ at = 0, dur = 0.2, type = 'bandpass', f = 1000, f2, q = 1, gain = 0.1, attack = 0.01, dest = A.world!, pan = 0 }: NoiseOpts) {
  if (!A.ctx) return;
  const ctx = A.ctx, t = ctx.currentTime + at;
  const src = ctx.createBufferSource(); src.buffer = A.white!; src.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl); fl.connect(g);
  if (pan) { const pn = ctx.createStereoPanner(); pn.pan.value = clamp(pan, -1, 1); g.connect(pn); pn.connect(dest); } else g.connect(dest);
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
}
function thump(at: number, gain: number, f0 = 55, dest = A.body!) {
  if (!A.ctx) return;
  const ctx = A.ctx, t = ctx.currentTime + at;
  const o = ctx.createOscillator(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.18);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.35);
}
const SFX = {
  pen: () => { const n = randInt(3, 5); for (let i = 0; i < n; i++) noise({ at: i * 0.05 + Math.random() * 0.02, dur: 0.035 + Math.random() * 0.03, f: 2600 + Math.random() * 1800, q: 3, gain: 0.05 }); },
  // a creak: stick-slip, a fast train of clicks through a wooden resonance
  creak: (len = 0.35, gain = 0.16, pan = 0) => { const n = Math.floor(len * rand(40, 70)); for (let i = 0; i < n; i++) noise({ at: (i / n) * len + Math.random() * 0.004, dur: 0.012, f: rand(420, 780), q: 9, gain: gain * (0.5 + Math.random() * 0.5), attack: 0.001, pan }); },
  rustle: (g = 0.08, pan = 0) => noise({ dur: 0.42, f: 1100, f2: 1600, q: 0.7, gain: g, attack: 0.1, pan }),
  press: (g = 0.5) => { thump(0, g, 62); noise({ dur: 0.16, type: 'lowpass', f: 300, gain: 0.25, attack: 0.005, dest: A.body }); },
  tap: () => noise({ dur: 0.012, type: 'highpass', f: 3200, gain: 0.05, attack: 0.001 }), // her fingers on her screen
  hiss: (g: number) => noise({ dur: 0.5, f: 3600, f2: 2800, q: 2, gain: g, attack: 0.08, dest: A.body }), // breath through the teeth
  grunt: () => noise({ dur: 0.22, type: 'lowpass', f: 420, gain: 0.3, attack: 0.01, dest: A.body }),
  fall: () => { thump(0, 0.9, 48); thump(0.09, 0.5, 70, A.world); SFX.creak(0.5, 0.2); },
};

/* ---------- state ---------- */
const HOLD = { on: false };
interface Shift { landAt: number; teleAt: number; tele: number; target: number; feint: boolean; dir: number; landed: boolean; cost: number }
interface Glob {
  phase: string; phaseT: number; clock: number; str: number; cam: number; cop: number; copTarget: number; lean: number; leanTarget: number; ctl: number; ctlV: number; bubbleX: number; bubbleV: number;
  beat: number; slipThisBeat: boolean; nextShiftBeat: number; shift: Shift | null; pressure: number; pressureUntil: number; att: string; attPlan: string[]; held: boolean[]; even: boolean[];
  slips: number; hardShifts: number; shifts: number; cleanShifts: number; reliefs: number; caughtN: number; reliefCd: number; lowest: number; jolt: number; sag: number; end: number; reason: string;
  tapCd: number; hissCd: number; saidLow: boolean;
}
let G: Glob;
function fresh(): Glob {
  return { phase: 'idle', phaseT: 0, clock: 0, str: 100, cam: 0, cop: 0, copTarget: 0, lean: 0, leanTarget: 0, ctl: 0, ctlV: 0, bubbleX: 0, bubbleV: 0,
    beat: -1, slipThisBeat: false, nextShiftBeat: 3, shift: null, pressure: 1, pressureUntil: -1, att: 'busy', attPlan: [], held: [], even: [], slips: 0, hardShifts: 0, shifts: 0, cleanShifts: 0,
    reliefs: 0, caughtN: 0, reliefCd: 0, lowest: 100, jolt: 0, sag: 0, end: S.len * 1000, reason: '', tapCd: 0, hissCd: 0, saidLow: false };
}
G = fresh();

/* ---------- her hand ---------- */
function say(text: string | undefined, big = false, at: [number, number] = [0.6, 0.16]) {
  if (!text) return;
  const el = document.createElement('div');
  el.className = 'her-line' + (big ? ' big' : '');
  el.textContent = text;
  el.style.setProperty('--write', `${Math.max(160, text.length * 36)}ms`);
  el.style.setProperty('--steps', String(Math.max(4, text.length * 2)));
  const stack = big ? 0 : [...$('#hand').children].filter((x) => !x.classList.contains('gone') && !x.classList.contains('big')).length;
  el.style.left = `${at[0] * innerWidth + (Math.random() * 30 - 15)}px`;
  el.style.top = `${at[1] * innerHeight + stack * 52 + (Math.random() * 14 - 7)}px`;
  el.style.transform = `rotate(${(Math.random() * 7 - 4).toFixed(1)}deg)`;
  $('#hand').appendChild(el); SFX.pen();
  if (!big) setTimeout(() => { el.classList.add('gone'); setTimeout(() => el.remove(), 600); }, 2600);
}

/* ---------- cracks at the frame's edges: each slip leaves one; they heal slowly ---------- */
const cracks: Array<{ g: SVGGElement; born: number }> = [];
function crack(strength = 1) {
  const W = innerWidth, H = innerHeight;
  const side = randInt(0, 3);
  const p0 = side === 0 ? [rand(0.1, 0.9) * W, 0] : side === 1 ? [W, rand(0.1, 0.9) * H] : side === 2 ? [rand(0.1, 0.9) * W, H] : [0, rand(0.1, 0.9) * H];
  const inward = side === 0 ? [0, 1] : side === 1 ? [-1, 0] : side === 2 ? [0, -1] : [1, 0];
  const segs: number[][][] = [];
  const grow = (p: number[], dir: number[], len: number, depth: number) => {
    let q = p, d = dir;
    const steps = randInt(4, 8);
    const pts = [q];
    for (let i = 0; i < steps; i++) {
      const a = Math.atan2(d[1], d[0]) + rand(-0.55, 0.55);
      d = [Math.cos(a), Math.sin(a)];
      const l = (len / steps) * rand(0.6, 1.4);
      q = [q[0] + d[0] * l, q[1] + d[1] * l]; pts.push(q);
      if (depth < 2 && Math.random() < 0.28) grow(q, [Math.cos(a + rand(-1.2, 1.2)), Math.sin(a + rand(-1.2, 1.2))], len * 0.45, depth + 1);
    }
    segs.push(pts);
  };
  grow(p0, inward, rand(90, 230) * strength, 0);
  const svg = $('#cracks');
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  for (const pts of segs) {
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    for (const [col, w, off] of [['rgba(0,0,0,.55)', 2.6, 1], ['rgba(255,255,255,.78)', 1, 0], ['rgba(255,190,150,.35)', 4, 0]] as Array<[string, number, number]>) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d); path.setAttribute('stroke', col); path.setAttribute('stroke-width', String(w));
      if (off) path.setAttribute('transform', 'translate(1 1)');
      if (w === 4) path.setAttribute('filter', 'blur(2px)'), path.style.filter = 'blur(2px)';
      const len = 600; path.style.strokeDasharray = String(len); path.style.strokeDashoffset = String(len);
      if (S.reduced || typeof path.animate !== 'function') path.style.strokeDashoffset = '0';
      else path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 260, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'forwards' });
      g.appendChild(path);
    }
  }
  svg.appendChild(g);
  cracks.push({ g, born: performance.now() });
}
function healCracks(now: number) {
  for (let i = cracks.length - 1; i >= 0; i--) {
    const age = (now - cracks[i].born) / 1000;
    const op = 1 - smooth(8, 22, age);
    cracks[i].g.style.opacity = op.toFixed(3);
    if (op <= 0) { cracks[i].g.remove(); cracks.splice(i, 1); }
  }
}

/* ---------- her rhythm: the plan's shifts, telegraphed by her style ---------- */
function planShift(opts: { tele: number; feint: boolean; cost: number }) {
  const st = ST(), c = C();
  const isFeint = opts.feint;
  const dir = Math.random() < 0.5 ? -1 : 1;
  const target = isFeint ? G.copTarget : clamp(G.copTarget * 0.25 + dir * rand(st.mag[0], st.mag[1]) * c.shift, -1, 1);
  const tele = opts.tele;
  G.shift = { landAt: G.clock + Math.max(tele, 0) + 30, teleAt: G.clock, tele, target, feint: isFeint, dir: Math.sign(target - G.cop) || dir, landed: false, cost: opts.cost };
  if (st.announce) say(pick(L().announce.slice(0, 1).concat(target < G.cop ? L().announce.slice(1, 2) : L().announce.slice(2, 3))));
  if (tele > 0) {
    G.leanTarget = isFeint ? dir * 0.8 : Math.sign(target - G.cop) * 0.9;
    const side = Math.sign(G.leanTarget) * 0.85, foot = R.face === 'down' && !R.legs;
    SFX.rustle(foot ? 0.1 : 0.06, side); if (foot) SFX.creak(0.28, 0.12, side);
  }
}
function landShift() {
  const sh = G.shift!; sh.landed = true;
  G.leanTarget = 0;
  if (sh.feint) { G.shift = null; return; } // the shadow came back: nothing lands
  G.shifts += 1;
  G.copTarget = sh.target;
  const c = C();
  // the engine's rule: a shift costs when the hold was uneven on this beat or the one before
  const uneven = G.even.slice(-2).some((h) => !h);
  SFX.press(0.35 + c.weight * 0.3); SFX.rustle(0.05, Math.sign(sh.target - G.cop) * 0.6);
  if (uneven) {
    const cost = sh.cost;
    G.str -= cost; G.hardShifts += 1; G.jolt = 1; crack(1); SFX.creak(0.4, 0.2); SFX.grunt();
  } else { G.cleanShifts += 1; G.jolt = 0.35; }
  G.shift = null;
}
function onBeat() {
  G.beat += 1;
  const grace = graceOf(G.beat - 1);
  const evenNow = grace || (HOLD.on && !G.slipThisBeat && Math.abs(G.cop - G.ctl) <= S.tol);
  G.held.push(grace || (HOLD.on && !G.slipThisBeat)); G.even.push(evenNow);
  if (G.held.length > 8) { G.held.shift(); G.even.shift(); }
  reportBeat(G.beat - 1, G.held[G.held.length - 1], evenNow);
  G.slipThisBeat = false;
}
function slip() { // a beat in which the hold broke is a slip (the engine drains twice); it lands the moment the hold breaks
  {
    G.slipThisBeat = true; G.slips += 1; G.str -= W_DRAIN * C().weight * G.pressure; G.jolt = 1; G.sag = 1; crack(0.8); SFX.creak(0.5, 0.22);
    if (G.slips === 1 || Math.random() < 0.5) say(pick(L().slip));
    R.segSlips += 1; if (R.segSlips === 1) setTimeout(() => say(pick(L().longer)), 900); // the P15a chain: a slip in weight makes the hold last longer
  }
}
function relief() {
  if (G.phase !== 'loop' || G.reliefCd > 0 || !R.running) return;
  G.reliefCd = 2600; G.reliefs += 1;
  SFX.creak(0.22, 0.1); SFX.rustle(0.05);
  report({ beat: segBeat(), kind: 'shift_weight' });
  G.str = Math.min(100, G.str + RELIEF);
}

/* ---------- phases ---------- */
function begin() {
  audioInit(); if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume();
  $('#hand').replaceChildren(); $('#cracks').replaceChildren(); cracks.length = 0;
  G = fresh(); G.phase = 'entry'; G.end = S.len * 1000;
  setTimeout(() => G.phase === 'entry' && say(pick(L().entry)), 700);
}
function exit(reason: string) {
  if (G.phase !== 'loop' && G.phase !== 'entry') return;
  G.phase = 'exit'; G.phaseT = 0; G.reason = reason;
  const l = L(), ratio = G.cleanShifts / Math.max(1, G.shifts);
  const line = reason === 'stop' ? pick(l.stop) : reason === 'fall' ? pick(l.fall) : reason === 'released' ? pick(l.released) : ratio >= 0.7 && G.slips <= 1 ? pick(l.good) : pick(l.poor);
  if (reason === 'fall') { SFX.fall(); G.jolt = 1.5; } else { SFX.rustle(0.12); SFX.hiss(0.2); }
  setTimeout(() => { $('#hand').replaceChildren(); say(line, true, [0.56, 0.2]); }, 900);
}

/* ---------- the loop ---------- */
function updateLoop(dt: number) {
  G.clock += dt;
  const beatNow = Math.floor((G.clock - R.seg!.clock0) / BEAT);
  while (G.beat < beatNow) { onBeat(); planBeat(); }
  if (!HOLD.on && !G.slipThisBeat && G.clock > BEAT) slip(); // the first beat is grace: time to take the weight
  if (G.pressureUntil < G.clock) G.pressure = R.pressure;
  const c = C();
  const err = G.cop - G.ctl;
  const unevenMult = S.unevenCost ? 1 + 1.2 * Math.max(0, Math.abs(err) - S.tol * 0.5) : 1;
  G.str -= (W_DRAIN / BEAT) * dt * S.drain * c.weight * G.pressure * unevenMult;
  R.uneven.sum += (unevenMult - 1) * dt; R.uneven.ms += dt;
  if (G.shift && !G.shift.landed && G.clock >= G.shift.landAt) landShift();
  G.reliefCd = Math.max(0, G.reliefCd - dt);
  // her fingers on her screen while she is busy with it: an ear for her attention
  G.tapCd -= dt; if (G.att === 'busy' && G.tapCd <= 0) { SFX.tap(); G.tapCd = rand(110, 420); } else if (G.att === 'glancing' && G.tapCd <= 0) { SFX.tap(); G.tapCd = rand(700, 1400); }
  G.hissCd -= dt; if (G.str < 45 && G.hissCd <= 0) { SFX.hiss(lerp(0.02, 0.12, smooth(45, 5, G.str))); G.hissCd = lerp(2200, 900, smooth(45, 5, G.str)); }
  G.lowest = Math.min(G.lowest, G.str);
  if (G.str < 30 && !G.saidLow) { G.saidLow = true; }
  if (G.str <= 0) { G.str = 0; }
}

let mouseX = 0.5;
function frame(now: number) {
  const dt = Math.min(120, now - (frame.last ?? now)); frame.last = now;
  G.phaseT += dt;
  const h = dt / 1000;
  switch (G.phase) {
    case 'entry': G.cam = easeOut(G.phaseT / 1600); if (G.phaseT >= 1600) { G.phase = 'loop'; G.clock = 0; } break;
    case 'loop': if (R.running) updateLoop(dt); break;
    case 'exit': G.cam = 1 - easeOut(G.phaseT / 1500); G.str = lerp(G.str, 100, clamp(dt / 700, 0, 1)); break;
    default: G.cam = 0;
  }
  // her centre of weight: where she is, plus the small wander of a living body
  const t = now / 1000;
  const wander = S.reduced ? 0 : Math.sin(t * 0.9) * 0.05 + Math.sin(t * 2.3 + 1) * 0.025;
  G.cop += (G.copTarget + wander - G.cop) * clamp(h * (G.shift?.landed === false ? 2 : 7), 0, 1);
  G.lean += (G.leanTarget - G.lean) * clamp(h * 6, 0, 1);
  // the commander's balance follows the mouse with a little body lag
  const target = (mouseX * 2 - 1) * 1.15;
  // the springs are stepped in pieces of at most 8 ms: one Euler step of a long frame diverges (the same motion at 60 fps)
  // the bubble: a spring on the error, so it overshoots and settles like a real one
  const n = Math.max(1, Math.ceil(h / 0.008)), hs = h / n, liveErr = G.phase === 'loop' || G.phase === 'entry';
  for (let i = 0; i < n; i++) {
    const k = 90, d = 14; G.ctlV += (k * (target - G.ctl) - d * G.ctlV) * hs; G.ctl += G.ctlV * hs;
    const e = liveErr ? G.cop - G.ctl : 0;
    const bv = 260 * (clamp(e, -1.2, 1.2) - G.bubbleX) - 16 * G.bubbleV; G.bubbleV += bv * hs; G.bubbleX += G.bubbleV * hs;
  }
  const err = liveErr ? G.cop - G.ctl : 0;
  G.jolt = Math.max(0, G.jolt - h * 2.2); G.sag = Math.max(0, G.sag - h * 1.6);
  if (A.ctx) {
    const ct = A.ctx.currentTime, f = G.phase === 'loop' ? smooth(60, 0, G.str) : 0;
    A.rumG!.gain.setTargetAtTime(f * 0.25, ct, 0.2); A.lfoG!.gain.setTargetAtTime(f * 0.2, ct, 0.2); A.lfo!.frequency.setTargetAtTime(lerp(7, 13, f), ct, 0.3);
    A.master!.gain.setTargetAtTime(S.sound ? S.vol : 0, ct, 0.05);
  }
  render(now, dt, err);
  requestAnimationFrame(frame);
}
frame.last = undefined as number | undefined;

/* ---------- drawing ---------- */
let shC: HTMLCanvasElement, sctx: CanvasRenderingContext2D;
function size() { shC.width = Math.ceil(innerWidth / DS); shC.height = Math.ceil(innerHeight / DS); }
const cache = new Map<string, string>();
const setStyle = (sel: string, prop: string, v: string) => { if (S.readable && prop === 'filter') v = v.replace(/blur\([^)]*\)/g, 'blur(0px)'); const key = sel + prop; if (cache.get(key) === v) return; cache.set(key, v); ($(sel).style as unknown as Record<string, string>)[prop] = v; };

/* face down. human_chair: her lower legs hang at the edges of the view, near and out of focus: darkness lit at its edges like the breath's
   shapes (her body is the dark, never a drawn body). footrest: she is not in view at all. In both, the cool pool of her screen's light on the
   floor tells her attention (steady: busy, dipping: glancing, gone: she lowered it and watches), and slides toward the side she is about to lean. */
let legC: HTMLCanvasElement, lctx: CanvasRenderingContext2D, compC: HTMLCanvasElement, cctx: CanvasRenderingContext2D;
let rimC: HTMLCanvasElement, rctx: CanvasRenderingContext2D, outC: HTMLCanvasElement, octx: CanvasRenderingContext2D;
/* the left lower leg, calf from the top edge down to the foot; x from the left edge, unit W; y unit H. The outer side (the calf's back, the
   heel, the sole) runs off the frame; what shows is the inner line: calf, shin, ankle, the instep and the toes. The foot the author picked: */
const LEG_FEET: Record<string, Pt[]> = {
  // relaxed: the ankle narrows a little (the ankle bone a touch wider), the instep curves on smoothly, the foot tapers to toes pointing down and in
  relaxed: [[-0.05, -0.08], [0.105, -0.08], [0.122, 0.1], [0.12, 0.28], [0.104, 0.45], [0.091, 0.58], [0.085, 0.66], [0.087, 0.71], [0.096, 0.77], [0.107, 0.84], [0.112, 0.9], [0.106, 0.95], [0.088, 0.99], [0.06, 1.0], [0.035, 0.97], [0.016, 0.9], [-0.05, 0.84]],
};
function legPoints(W: number, H: number, side: number, press: number, lift: number, swing: number): Pt[] {
  return LEG_FEET[S.foot].map(([x, y]) => {
    const down = clamp(y, 0, 1);
    // pressed: the leg comes inward (her weight goes to this side); lifted: it rises and swings out; swing: the foot bounces while she reads
    const X = x + press * 0.035 * (0.4 + down) - lift * 0.03 * down + swing * 0.012 * down * down;
    // the frame overhangs the screen by 7 %: the new feet sit higher so the whole foot shows above the bottom edge
    const Y = (S.foot === 'first' ? y : y * 0.86) - lift * 0.07 * down + swing * 0.01 * down;
    return [side < 0 ? X * W : W - X * W, Y * H] as Pt;
  });
}
function fillPts(ctx: CanvasRenderingContext2D, pts: Pt[]) { ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fill(); }
/* the legs as the author picked them: her calves hang at the edges of the view (astride); before she shifts, the leg on her side presses in
   and the other lifts and swings out; while she reads, a foot bounces */
function legsHang(ctx: CanvasRenderingContext2D, W: number, H: number, toward: number, swing: number, jolt: number, reading: boolean, t: number) {
  for (const side of [-1, 1]) {
    const own = side * toward, press = Math.max(0, own), lift = Math.max(0, -own);
    const sw = S.reduced ? 0 : (reading ? Math.sin(t * 3.1 + (side > 0 ? 1.7 : 0)) * (side > 0 ? 1 : 0.35) : Math.sin(t * 0.8 + side) * 0.25);
    fillPts(ctx, chaikin(chaikin(chaikin(legPoints(W, H, side, press + jolt * 0.2 * side, lift, sw)))));
  }
}
function drawFloor(now: number) {
  const W = shC.width, H = shC.height;
  for (const c of [legC, compC, rimC, outC]) if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  sctx.clearRect(0, 0, W, H);
  const live = G.phase === 'loop' || G.phase === 'entry';
  // her screen's light on the floor
  const att = live ? ({ busy: 1, glancing: 0.45 + 0.25 * Math.sin(now / 90), watching: 0.05 }[G.att as 'busy']) : 0;
  const flick = 0.85 + 0.15 * Math.sin(now / 130) * Math.sin(now / 47);
  const px = W * (0.5 + G.cop * 0.1 + G.lean * 0.16), py = H * (!R.legs ? 0.24 : 0.3);
  sctx.filter = `blur(${Math.round(H * 0.07)}px)`;
  sctx.globalCompositeOperation = 'lighter';
  sctx.fillStyle = `rgba(120,170,255,${(0.34 * att * flick * G.cam).toFixed(3)})`;
  sctx.beginPath(); sctx.ellipse(px, py, W * 0.15, H * 0.1, 0, 0, Math.PI * 2); sctx.fill();
  sctx.globalCompositeOperation = 'source-over'; sctx.filter = 'none';
  shC.dataset.screen = att.toFixed(2);
  if (!R.legs) return;
  // her legs: the body, its complement blurred into a rim, the rim kept on the body only
  const t = now / 1000;
  const reading = live && G.att === 'busy';
  lctx.clearRect(0, 0, W, H); lctx.fillStyle = '#fff';
  const toward = G.lean * 0.9 + G.cop * 0.5; // where her weight is going: negative to the commander's left
  const swing = S.reduced ? 0 : reading ? Math.sin(t * 3.1) : Math.sin(t * 0.8) * 0.25;
  const jolt = G.jolt * 0.4;
  legsHang(lctx, W, H, toward, swing, jolt, reading, t);
  cctx.globalCompositeOperation = 'source-over'; cctx.clearRect(0, 0, W, H); cctx.fillStyle = '#fff'; cctx.fillRect(0, 0, W, H);
  cctx.globalCompositeOperation = 'destination-out'; cctx.drawImage(legC, 0, 0); cctx.globalCompositeOperation = 'source-over';
  rctx.clearRect(0, 0, W, H); rctx.filter = `blur(${Math.round(H * 0.022)}px)`; rctx.drawImage(compC, 0, 0); rctx.filter = 'none';
  rctx.globalCompositeOperation = 'source-in'; rctx.fillStyle = 'rgb(226,78,52)'; rctx.fillRect(0, 0, W, H); rctx.globalCompositeOperation = 'source-over';
  octx.globalCompositeOperation = 'source-over'; octx.clearRect(0, 0, W, H);
  octx.filter = `blur(${Math.round(H * (S.legs === 'forward' ? 0.016 : 0.012))}px)`; octx.drawImage(legC, 0, 0); octx.filter = 'none'; // near and out of focus
  octx.globalCompositeOperation = 'source-in'; octx.fillStyle = S.legShade === 'black' ? 'rgb(8,5,9)' : 'rgb(34,22,22)'; octx.fillRect(0, 0, W, H);
  octx.globalCompositeOperation = 'source-atop'; octx.globalAlpha = 0.55; octx.drawImage(rimC, 0, 0); octx.globalAlpha = 1;
  octx.globalCompositeOperation = 'source-over';
  sctx.globalAlpha = smooth(0.2, 0.9, G.cam); sctx.drawImage(outC, 0, 0); sctx.globalAlpha = 1;
}

interface PlaceOpts { h: number; x: number; dx?: number; bottom?: number; rot?: number; rx?: number }
function placeSprite(img: HTMLImageElement, k: number, face: { x: number; y: number }, opts: PlaceOpts) {
  if (!img.naturalWidth) return;
  const vw = innerWidth, vh = innerHeight, nw = img.naturalWidth, nh = img.naturalHeight;
  const Hs = vh * opts.h, sc = Hs / nh, Ws = nw * sc;
  const fx = opts.x * vw + (opts.dx ?? 0), bottom = vh * (opts.bottom ?? 1);
  const left = fx - Ws / 2, top = bottom - Hs;
  img.style.transform = `translate(${left}px, ${top}px) translate(${Ws / 2}px, ${Hs}px) rotate(${(opts.rot ?? 0).toFixed(2)}deg) rotateX(${(opts.rx ?? 0).toFixed(2)}deg) translate(${-Ws / 2}px, ${-Hs}px) scale(${sc})`;
}

function render(now: number, dt: number, err: number) {
  const c = C(), live = G.phase === 'loop' || G.phase === 'entry';
  const k = G.cam, strF = smooth(100, 0, G.str);
  const down = c.face === 'down';
  // the views: the room fades out, the commander's view fades in
  setStyle('#roomView', 'opacity', (1 - smooth(0.1, 0.7, k)).toFixed(3));
  setStyle('#floorView', 'opacity', (down ? smooth(0.3, 0.9, k) : 0).toFixed(3));
  setStyle('#upView', 'opacity', (!down ? smooth(0.3, 0.9, k) : 0).toFixed(3));
  // the frame tilts with the error between her weight and the commander's balance, sags on a slip, trembles as the strength goes
  const tilt = clamp(err, -1.2, 1.2) * 6 * k;
  const amp = S.reduced ? 0 : (Math.pow(strF, 2) * 5 + G.jolt * 7) * k;
  const jx = (Math.random() * 2 - 1) * amp, jy = (Math.random() * 2 - 1) * amp + G.sag * 26 * k;
  $('#world').style.transform = `translate(${jx.toFixed(1)}px, ${jy.toFixed(1)}px) rotate(${tilt.toFixed(2)}deg)`;
  // the floor comes closer as the arms give out
  const near = 1 + strF * 0.22 * k + G.sag * 0.04;
  setStyle('#floor', 'transform', `scale(${near.toFixed(3)})`);
  setStyle('#floor', 'filter', `blur(${(0.4 + strF * 1.8).toFixed(1)}px) brightness(${(0.6 - strF * 0.16).toFixed(2)}) saturate(.85)`);
  if (down) drawFloor(now);
  // face up: her from below; the art slot "over" if there is one, else the ordinary sprite rising from the bottom edge
  const over = $('#over') as HTMLImageElement;
  const useOver = over.style.display !== 'none' && over.naturalWidth;
  const press = 1 + strF * 0.12 * k + G.sag * 0.03;
  const lean = G.lean * 3.2 + G.cop * 2.2;
  if (useOver) {
    // anchored to the bottom with room for the lean: the bottom edge sits below the frame by half its drawn width × sin 6° (at least 2 %)
    const oh = S.overH * press, ow = (innerHeight * oh) * over.naturalWidth / over.naturalHeight;
    const overscan = Math.max(0.02, (ow / 2) * Math.sin(6 * Math.PI / 180) / innerHeight + 0.01);
    placeSprite(over, k, S.face, { h: oh, x: S.overX, dx: G.cop * innerWidth * 0.03, bottom: 1 + overscan + S.overSink, rot: lean });
    $('#her').style.opacity = '0';
  } else {
    $('#her').style.opacity = '1';
    placeSprite($('#her') as HTMLImageElement, k, S.face, { h: 1.55 * press, x: 0.5, dx: G.cop * innerWidth * 0.04, bottom: 1.42, rot: lean, rx: 10 });
  }
  setStyle('#ceiling', 'transform', `scale(${(1.1 + strF * 0.06).toFixed(3)})`);
  setStyle('#ceiling', 'filter', `blur(${(3 + strF * 2).toFixed(1)}px) brightness(.55)`);
  const scr = live && !down ? ({ busy: 1, glancing: 0.5, watching: 0.05 }[G.att as 'busy']) : 0;
  setStyle('#screenGlow', 'background', `radial-gradient(ellipse 30% 26% at ${50 + G.cop * 3}% 34%, rgba(110,160,255,${(0.32 * scr).toFixed(2)}) 0%, rgba(0,0,0,0) 100%)`);
  // strain at the edges: a dark, warm press inward, not a tunnel
  const sv = live ? strF : 0;
  setStyle('#strainV', 'background', sv < 0.02 ? 'none' : `radial-gradient(ellipse 75% 70% at 50% 50%, rgba(0,0,0,0) ${(70 - sv * 30).toFixed(0)}%, rgba(30,6,4,${(0.25 + sv * 0.5).toFixed(2)}) 100%)`);
  setStyle('#world', 'filter', `saturate(${(1 - sv * 0.45).toFixed(2)})`);
  healCracks(now);
  // the level
  setStyle('#vial', 'opacity', live ? '1' : '0');
  const half = 190 * 0.86;
  const bx = 230 + clamp(G.bubbleX, -1.15, 1.15) * half;
  const stretch = 1 + Math.min(0.6, Math.abs(G.bubbleV) * 0.12), squash = 1 / Math.sqrt(stretch);
  $('#vBubble').setAttribute('transform', `translate(${bx.toFixed(1)} 35) scale(${stretch.toFixed(3)} ${squash.toFixed(3)})`);
  const tolPx = S.tol * half;
  const marks = $('#vMarks').children;
  marks[0].setAttribute('transform', `translate(${(230 - tolPx - 30).toFixed(1)} 0)`); marks[1].setAttribute('transform', `translate(${(230 + tolPx + 30).toFixed(1)} 0)`);
  const level = Math.abs(err) <= S.tol;
  for (const m of marks) m.setAttribute('stroke-opacity', level ? '1' : '.35');
  $('#vGlow').setAttribute('opacity', (live && level ? 0.55 : 0).toString());
  $('#vLiquid').setAttribute('transform', `translate(${(Math.sin(now / 400) * 1.5).toFixed(2)} 0)`);
  $('#vial').style.transform = `rotate(${(tilt * 0.35).toFixed(2)}deg)`;
  // the input: its letters tremble with the strain
  letters.tick(live ? strF : 0);
  setStyle('#reply', 'opacity', live ? '0.4' : '1');
}

/* ---------- the input: typing under load, the letters tremble ---------- */
const letters = {
  acc: 0, off: [] as number[],
  tick(f: number) {
    this.acc += 16; if (this.acc < 50) return; this.acc = 0;
    const v = ($('#cmd') as HTMLInputElement).value, m = $('#mirror');
    if (m.textContent !== v) m.replaceChildren(...[...v].map((ch) => { const s = document.createElement('span'); s.textContent = ch; return s; }));
    const a = S.reduced ? 0 : f * f * 4 + (G.jolt > 0.5 ? 5 : 0);
    [...m.children].forEach((s) => { (s as HTMLElement).style.transform = a < 0.1 ? '' : `translate(${((Math.random() * 2 - 1) * a * 0.4).toFixed(1)}px, ${((Math.random() * 2 - 1) * a).toFixed(1)}px)`; });
    m.scrollLeft = $('#cmd').scrollLeft;
  },
};

/* ---------- input ---------- */
const typing = (t: EventTarget | null) => t && (/^(input|textarea|select)$/i.test((t as HTMLElement).tagName) || (t as HTMLElement).isContentEditable);

/* =====================================================================================================================================
 * The wiring (no prototype code below): the plan's shifts, the reports, the lines, the views, the mount and its end.
 * ===================================================================================================================================== */

/** The beat of the running segment the loop's clock is in now. */
function segBeat(): number {
  const seg = R.seg;
  if (!seg) return 0;
  return clamp(Math.floor((G.clock - seg.clock0) / BEAT), 0, seg.beats - 1);
}
/**
 * The prototype's grace (review I3: "a slip… after one beat of grace", its `G.clock > BEAT`): a beat that ended before the loop's first beat is
 * over (the entry's beats among them) is held and level, so the engine charges nothing the screen forgave. Beat −1 (before the first) too.
 */
function graceOf(beat: number): boolean {
  return beat < 0 || (R.seg !== null && R.seg.clock0 + (beat + 1) * BEAT <= BEAT);
}
/** Each beat as it begins: her attention is the plan's (the prototype's `beatTail` drew it; her shifts are scheduled with the segment). */
function planBeat(): void {
  const b = R.run?.segment.plan?.beats[G.beat];
  if (b) G.att = b.attention;
}
/** Sends an input of this segment to the engine (once per beat and kind), exempt from the typing lapse when the mouse made it (ruling O). */
function report(i: SegmentInput): void {
  if (!E || !R.seg || i.beat < 0 || i.beat >= R.seg.beats) return;
  const key = `${i.beat}|${i.kind}`;
  if (R.sent.has(key)) return;
  R.sent.add(key);
  R.inputs.push(i);
  E.env.staging.input(i, { pointer: R.via === 'mouse' });
}
/**
 * A beat ends: `hold` when it was held (Ruling S: the prototype's slip is the hold breaking, never a tilt), `uneven` with the mean extra drain
 * factor of the beat (R16) and, when the held beat ended off level, `part: 'tilted'` (what the engine's shift rule reads as uneven).
 */
function reportBeat(beat: number, held: boolean, even: boolean): void {
  const u = R.uneven;
  const amount = u.ms > 0 ? Math.round((u.sum / u.ms) * 1000) / 1000 : 0;
  R.uneven = { sum: 0, ms: 0 };
  if (beat < 0) return;
  if (held) report({ beat, kind: 'hold' });
  report({ beat, kind: 'uneven', amount, ...(held && !even ? { part: 'tilted' } : {}) });
}

/** A running segment the loop has not scheduled yet: her shifts, telegraphed by her style, placed on the loop's clock. */
function schedulePlan(run: PhysicsRun, ck: { startedAt: number | null; now: number }): void {
  const plan = run.segment.plan!;
  const phys = E!.env.registries.contactPhysics.get(run.physicsId);
  const endMs = Number(phys?.segmentSeconds ?? 30) * 1000;
  R.seg = { n: run.segment.n, startedAt: ck.startedAt!, clock0: G.clock - (ck.now - ck.startedAt!), beats: plan.beats.length, endMs, flushed: false };
  R.sent = new Set();
  R.inputs = [];
  R.tapped = false;
  R.uneven = { sum: 0, ms: 0 };
  R.segSlips = 0;
  R.queue = [];
  G.beat = -1; G.held = []; G.even = []; G.slipThisBeat = false;
  if (G.shift && !G.shift.landed) G.shift = null; // the last segment's telegraph is over with it
  G.str = clamp((run.gauge / run.capacity) * 100, 0, 100); // the engine's strength (it resolved the last segment)
  refreshLines(0);
  const st = ST();
  const shifts = plan.beats.flatMap((b, i) => (b.shift !== undefined ? [i] : []));
  let prev = -1;
  for (const b of shifts) {
    // it lands as its beat's end is judged (+30 ms, the prototype's), so its check is the engine's: held and level on its beat and the one before;
    // the last beat's is judged at the flush, 300 ms before the segment's end
    const landAt = R.seg.clock0 + Math.min((b + 1) * BEAT, endMs - 300) + 30;
    // a playful holder's feint: her shadow leans and comes back, between two planned shifts (never instead of one: the plan's shift lands)
    if (st.feint > 0 && Math.random() < st.feint) {
      const mid = Math.round((prev + b) / 2);
      if (mid - prev >= 2 && b - mid >= 1) {
        const tele = rand(st.tele[0], st.tele[1]);
        push(R.seg.clock0 + mid * BEAT - tele, () => planShift({ tele, feint: true, cost: 0 }));
      }
    }
    const tele = rand(st.tele[0], st.tele[1]);
    const cost = (plan.beats[b]!.shift ?? 0) * (100 / Math.max(1, run.capacity));
    // a telegraph that comes due late (a segment that starts with it overdue) is shortened, so the shift still lands on time
    push(landAt - 30 - tele, () => { const late = G.clock - (landAt - 30 - tele); planShift({ tele: late > 50 ? Math.max(0, tele - late) : tele, feint: false, cost }); });
    prev = b;
  }
}
function push(at: number, fn: () => void): void { R.queue.push({ at, fn }); R.queue.sort((a, b) => a.at - b.at); }

/** Her lines (ruling Q): `cardVoice` `weight.*` by her style; her first words by the contact; her model words for `press` in place of `heavy`. */
function refreshLines(beat: number): void {
  if (!E) return;
  const env = E.env;
  const own = (k: string): string[] => [...voiceLines(env.registries, `weight.${k}` as VoiceKind, R.lineStyle)];
  const voiced = (k: string, cue: CueKind): string[] => { const v = env.staging.voiced?.(cue, beat) ?? null; return v ? [v] : own(k); };
  const lines: Lines = {};
  for (const k of WEIGHT_KINDS) lines[k] = own(k);
  for (const [k, cue] of VOICED) lines[k] = voiced(k, cue);
  lines.entry = R.run && R.run.sourceKind === 'contact' ? [...voiceLines(env.registries, `weight.entry.${R.run.sourceId}` as VoiceKind, R.lineStyle)] : []; // by style too (cold: silent, Ruling R)
  R.lines = lines;
}
/** Weight's line kinds (weight.html `LINES`, card-voice.md §8) and the cue kinds whose model words may take a line's place. */
export const WEIGHT_KINDS = ['released', 'slip', 'caught', 'heavy', 'good', 'poor', 'fall', 'stop', 'longer', 'announce'] as const;
const VOICED: ReadonlyArray<[string, CueKind]> = [['heavy', 'press']];

/**
 * She felt the commander's own shift (the engine's `cheatRoll`, at the segment's end): her line, the press, a jolt and a crack. The prototype's
 * −10 and heavier lean for 3 beats are not played: the engine charges a catch as slips and raises no pressure, so the strength stays its own.
 */
function caughtBy(): void {
  if (G.phase !== 'loop' && G.phase !== 'entry') return;
  G.caughtN += 1; say(pick(L().caught)); SFX.press(0.55); G.jolt = 1; crack(0.6);
}
/** She leans in heavier (the engine's `run.pressure` rose at a boundary): her line, the press. */
function heavier(): void {
  if (G.phase !== 'loop' && G.phase !== 'entry') return;
  say(pick(L().heavy)); SFX.press(0.3); G.jolt = 0.5;
}

/** Each frame before the prototype's: the size, the still form, the sound, her pictures, the letters, the segment and its reports. */
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
  if (!A.ctx) audioInit();
  // her sprite: the scene's picture, drawn by the instrument's camera from below (the scene's own <img> is never moved)
  if (!e.core) {
    const scene = R.run ? e.env.spriteOf(R.run.holderId) : null;
    const src = scene?.getAttribute('src') ?? '';
    const her = e.els['#her'] as HTMLImageElement;
    if (src !== '' && src !== R.spriteSrc) { R.spriteSrc = src; her.setAttribute('src', src); }
    for (const img of [her, e.els['#over'] as HTMLImageElement]) {
      // drawn at its natural size, as the prototype's <img> (placeSprite scales against it)
      if (img.naturalWidth && img.style.width !== `${img.naturalWidth}px`) { img.style.width = `${img.naturalWidth}px`; img.style.height = `${img.naturalHeight}px`; }
    }
  }
  // the segment: scheduled when it runs, its due telegraphs played, flushed just before it ends
  const run = R.run;
  const ck = e.env.staging.clock();
  R.running = run !== null && run.segment.state === 'running' && run.segment.plan !== undefined && ck.startedAt !== null;
  if (G.phase === 'loop' && R.running && (R.seg === null || R.seg.n !== run!.segment.n || R.seg.startedAt !== ck.startedAt)) schedulePlan(run!, ck);
  while (R.running && R.queue.length && R.queue[0]!.at <= G.clock) R.queue.shift()!.fn();
  if (R.running && R.seg && !R.seg.flushed && G.clock - R.seg.clock0 >= R.seg.endMs - 300) {
    R.seg.flushed = true;
    if (G.beat < R.seg.beats) { onBeat(); planBeat(); } // the last beat ends here: judged and reported as the others
  }
  const input = e.env.input as HTMLInputElement;
  if (input.value !== '' || e.mirror.childElementCount > 0) placeMirror(e);
}
/** After the prototype's frame: the reply's opacity it wrote is recorded as the claim's (styleClaims' contract); a new line kept in the frame. */
function after(): void {
  const e = E;
  if (!e) return;
  const last = e.els['#hand']!.lastElementChild;
  if (last !== lastLine) { lastLine = last; keepInFrame(e); }
  noteWrites(e.claims[0]!, ['opacity']);
}
let lastLine: Element | null = null;
/** Her lines stay inside the frame (ruling Q): a line that would run past an edge is moved back in (one wider than 40 % wraps, by its CSS). */
function keepInFrame(e: WeightEls): void {
  for (const el of e.els['#hand']!.children as HTMLCollectionOf<HTMLElement>) {
    const w = el.offsetWidth, x = el.offsetLeft;
    if (!w) continue;
    if (x + w > innerWidth - 8) el.style.left = `${Math.max(8, innerWidth - 8 - w)}px`;
    else if (x < 8) el.style.left = '8px';
  }
}
/** The letters lie over the input (the prototype's `#mirror` over `#cmd`): same box, same font, same scroll. */
function placeMirror(e: WeightEls): void {
  const input = e.env.input;
  const m = e.mirror;
  m.style.left = `${input.offsetLeft}px`;
  m.style.top = `${input.offsetTop}px`;
  m.style.width = `${input.offsetWidth}px`;
  m.style.height = `${input.offsetHeight}px`;
}

function build(env: InstrumentEnv, host: HTMLElement, core: boolean): WeightEls {
  const box = document.createElement('div');
  box.className = 'alius-weight';
  box.setAttribute('aria-hidden', 'true'); // as the effects layer it lives in (stage/layers.ts)
  box.toggleAttribute('data-core', core);
  const els: Record<string, HTMLElement> = {};
  const el = <T extends HTMLElement>(tag: string, id: string, parent: HTMLElement): T => { const x = document.createElement(tag) as T; x.className = `alius-weight-${id}`; els[`#${id}`] = x; parent.append(x); return x; };
  const world = el('div', 'world', box);
  for (const v of ['roomView', 'floorView', 'upView']) el('div', v, world).classList.add('alius-weight-view');
  el('div', 'floor', els['#floorView']!);
  el('div', 'ceiling', els['#upView']!);
  const cam = el('div', 'cam', els['#upView']!);
  for (const id of ['her', 'over']) { const img = el<HTMLImageElement>('img', id, cam); img.alt = ''; img.draggable = false; }
  els['#over']!.style.display = 'none';
  el('div', 'screenGlow', els['#upView']!);
  el('div', 'strainV', box);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'alius-weight-cracks');
  els['#cracks'] = svg as unknown as HTMLElement;
  box.append(svg);
  el('div', 'hand', box);
  const vial = buildVial();
  els['#vial'] = vial.box;
  for (const [k, v] of Object.entries(vial.parts)) els[`#${k}`] = v as HTMLElement;
  box.append(vial.box);
  host.append(box);
  // the shadow of the floor view (a quarter-resolution canvas) and the offscreen canvases of her legs; in the core, none is drawn
  const off = (): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } => {
    if (core) { const c = document.createElement('canvas'); return { canvas: c, ctx: nullContext(c) }; }
    const l = lowres(document.createElement('div')); l.canvas.remove(); return l;
  };
  const shadow = core ? off() : lowres(els['#floorView']!);
  shadow.canvas.classList.add('alius-weight-shadow');
  shC = shadow.canvas; sctx = shadow.ctx;
  const legs = off(), comp = off(), rim = off(), out = off();
  legC = legs.canvas; lctx = legs.ctx; compC = comp.canvas; cctx = comp.ctx; rimC = rim.canvas; rctx = rim.ctx; outC = out.canvas; octx = out.ctx;
  const mirror = document.createElement('div');
  mirror.className = 'alius-weight-mirror';
  mirror.setAttribute('aria-hidden', 'true');
  inputLine(env).append(mirror);
  env.input.dataset.weightLetters = '';
  const claims = [claimStyles(env.reply, ['opacity'])];
  return { env, box, els, mirror, claims, frameId: null, core };
}

/** Binds the run: her style's row, her lines, the view of the contact, her pictures and the engine's numbers on the run's scale. */
function bind(env: InstrumentEnv, run: PhysicsRun): void {
  const state: CampaignState = env.state();
  const reg: Registries = env.registries;
  seed = (fnv1a(`${state.scene?.id ?? ''}|${run.id}|weight`) >>> 0) || 2463534242;
  const lead = leadStyle(physicsStyleOf(state, run.holderId, reg));
  S.style = lead.key in STYLES ? lead.key : ROW_BY_CUES[lead.cues] ?? 'neutral';
  R.lineStyle = lead.key;
  R.run = run;
  const contact = run.sourceKind === 'contact' ? reg.blockingContacts.get(run.sourceId) : undefined;
  R.face = contactFaceOf(contact);
  R.legs = R.face === 'down' && herLegsOf(contact) === 'hang';
  R.pressure = run.pressure ?? 1;
  R.seg = null; R.running = false; R.queue = []; R.sent = new Set(); R.uneven = { sum: 0, ms: 0 }; R.via = 'key'; R.segSlips = 0;
  R.cheatsCaught = run.tally?.cheatsCaught ?? 0;
  R.synced = -1;
  R.spriteSrc = '';
  // the engine's numbers, as a share of the gauge (a capacity above 100 makes every step smaller)
  const k = 100 / Math.max(1, run.capacity);
  BEAT = TUNING.physics.beatMs;
  W_DRAIN = TUNING.physics.weight.drain * k; RELIEF = TUNING.physics.weight.relief * k;
  // her face point (the sprite's sidecar), the art slot `over` and its fit (the prototype's "copy the fit")
  S.face = env.art.face(run.holderId) ?? { x: 0.5, y: 0.21 };
  const over = E!.core ? null : env.art.get(run.holderId, 'over');
  const fit = over?.sidecar.fit;
  R.overFit = over ? { height: fit?.height ?? 1.04, x: fit?.x ?? 0.5, sink: fit?.sink ?? 0 } : null;
  S.overH = R.overFit?.height ?? 1.04; S.overX = R.overFit?.x ?? 0.5; S.overSink = R.overFit?.sink ?? 0;
  const overEl = E!.els['#over'] as HTMLImageElement;
  if (over) {
    overEl.onerror = () => { overEl.style.display = 'none'; }; // a picture that fails: her sprite rises from the bottom edge, as without one
    overEl.src = over.url;
    overEl.style.display = '';
  }
  // the floor and the ceiling of the scene (P10c), each candidate in turn; none, or none loads: the scene's backdrop, never a blank frame
  if (!E!.core) {
    const owner = state.scene?.participants.find((id) => state.squad.some((u) => u.id === id)) ?? null;
    const loc = state.scene?.locationId ?? '';
    surface(env, E!.els[R.face === 'down' ? '#floor' : '#ceiling']!, R.face === 'down' ? floorOf(state, reg, loc, owner) : ceilingOf(state, reg, loc, owner));
  }
  const look = env.her(run.holderId);
  E!.box.style.setProperty('--alius-her', look.accent);
  if (look.hand !== '') E!.box.style.setProperty('--alius-font-hand', `"${look.hand}", var(--alius-font-type)`);
  E!.box.style.setProperty('--alius-weight-hand-scale', String(look.handScale || 1));
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

/** The listeners of the prototype's page, on the scene: Space and the left button bear her, Shift and the right button shift, the mouse is the balance. */
function listen(env: InstrumentEnv): void {
  const control = (t: EventTarget | null): boolean => t instanceof Element && t.closest('button, a, [role="button"], select, [data-action]') !== null;
  const onFrame = (t: EventTarget | null): boolean => t instanceof Node && (t === env.layers.frame || env.layers.frame.contains(t));
  let keySpace = false;
  env.listen(document, 'mousemove', ((e: MouseEvent) => {
    const r = env.root.getBoundingClientRect();
    const w = innerWidth || r.width || globalThis.innerWidth || 0;
    mouseX = w > 0 ? (e.clientX - r.left) / w : 0.5;
  }) as EventListener);
  env.listen(document, 'keydown', ((e: KeyboardEvent) => {
    if (typing(e.target) || control(e.target) || e.ctrlKey || e.metaKey || e.altKey) return; // while typing, Shift is a capital: the right button shifts the weight
    if (e.key === 'Shift') { if (!e.repeat) relief(); return; }
    if (e.key === ' ') { e.preventDefault(); keySpace = true; if (!e.repeat) { R.via = 'key'; HOLD.on = true; } }
    else if (e.key === 't' || e.key === 'T') { R.tapped = true; env.tap?.(); } // P15a's tap (the card's TAP): her answer is the engine's
  }) as EventListener);
  env.listen(document, 'keyup', ((e: KeyboardEvent) => { if (e.key === ' ') { keySpace = false; if (!typing(e.target)) HOLD.on = false; } }) as EventListener);
  env.listen(env.root, 'mousedown', ((e: MouseEvent) => {
    if (!onFrame(e.target)) return; // only the frame: never a control of the scene's UI
    e.preventDefault(); // the field keeps the focus: the mouse bears her while typing
    if (e.button === 0) { R.via = 'mouse'; HOLD.on = true; } else if (e.button === 2) relief();
  }) as EventListener);
  env.listen(document, 'mouseup', ((e: MouseEvent) => { if (e.button === 0 && !keySpace) HOLD.on = false; }) as EventListener);
  env.listen(env.layers.frame, 'contextmenu', ((e: Event) => e.preventDefault()) as EventListener);
  env.listen(env.input, 'input', () => { letters.acc = 99; });
}

function stopWeight(): void {
  const e = E;
  if (!e) return;
  if (e.frameId !== null) e.env.cancelRaf(e.frameId);
  try { A.master?.disconnect(); } catch { /* not connected */ }
  A = { ctx: null };
  for (const c of e.claims) releaseClaim(c);
  e.box.remove();
  e.mirror.remove();
  delete e.env.input.dataset.weightLetters;
  cache.clear();
  cracks.length = 0;
  letters.acc = 0;
  lastLine = null;
  HOLD.on = false;
  mouseX = 0.5;
  R.run = null; R.seg = null; R.running = false; R.queue = []; R.sent = new Set(); R.lines = NO_LINES;
  G = fresh();
  E = null;
}

/** How long the end plays: her view leaving (1.5 s), her line at 900 ms, read until the prototype's summary at 2300 ms. */
export const EXIT_MS = 2600;

export interface WeightOpts {
  /** Where the instrument draws (default: the scene's effects layer). */
  host?: HTMLElement;
  /** Ruling B: the core only (the balance, the level, her lines, the cracks, the reports), no view of its own; see the module's note. */
  core?: boolean;
  /** Its own keys and buttons (Space, Shift, T, the left and the right button, the mouse's balance). Default: on, off in the core (the outer instrument owns them and drives the core). */
  keys?: boolean;
  /** Its own room tone (the prototype's low brown noise). Default: on, off in the core (the outer instrument's room is heard). */
  roomTone?: boolean;
}

/**
 * The core's run as an outer instrument drives it (ruling B). The outer instrument passes the weight's own view of the run, at the start and
 * to every `update`: `coreRun(run, 'second')` (`src/engine/physics/run.ts`) when weight is the run's second physics (its gauge, capacity and
 * pressure, never the main one's), the run itself when weight is the main. With `keys: false` it forwards the commander's acts:
 */
export interface WeightCoreRun extends InstrumentRun {
  /** The commander bears her (or lets go); `mouse` when a button did it (exempt from the typing lapse, ruling O). */
  hold(on: boolean, via: 'mouse' | 'key'): void;
  /** The commander's own shift of weight (the prototype's `relief`: 2.6 s of cooldown). */
  shift(via: 'mouse' | 'key'): void;
  /** The commander's balance, 0 left … 1 right of the frame. */
  balance(x: number): void;
}

/**
 * Starts the instrument on a run: the host's `start` (`startWeight(env, run)`), or an outer instrument's with `{ host, core: true }` and the
 * weight's own view of the run (`coreRun(run, 'second')` when weight is the second physics; see `WeightCoreRun`). One weight runs at a time.
 */
export function startWeight(env: InstrumentEnv, run: PhysicsRun, opts: WeightOpts = {}): WeightCoreRun {
  stopWeight();
  const core = opts.core === true;
  E = build(env, opts.host ?? env.layers.effects, core);
  innerWidth = 0; innerHeight = 0;
  S.roomTone = opts.roomTone ?? !core;
  bind(env, run);
  if (opts.keys ?? !core) listen(env);
  else env.listen(env.input, 'input', () => { letters.acc = 99; });
  frame.last = undefined;
  refreshLines(0);
  begin();
  requestAnimationFrame(frame);
  const mine = E;
  return {
    update(next: PhysicsRun) {
      if (E !== mine) return;
      // a segment resolved: the strength is the engine's from now (no jump when the next one starts)
      if (next.segment.state === 'held' && R.seg !== null && R.seg.n === next.segment.n && R.synced !== next.segment.n) { R.synced = next.segment.n; G.str = clamp((next.gauge / Math.max(1, next.capacity)) * 100, 0, 100); }
      R.run = next;
      const pressure = next.pressure ?? 1;
      if (pressure > R.pressure) { R.pressure = pressure; refreshLines(0); heavier(); } else R.pressure = pressure;
      const caught = next.tally?.cheatsCaught ?? 0;
      if (caught > R.cheatsCaught) { R.cheatsCaught = caught; caughtBy(); }
    },
    finish(end: PhysicsEnd): number {
      if (E !== mine) return 0;
      if (G.phase !== 'loop' && G.phase !== 'entry') return 0;
      if (end.tally) G.slips = end.tally.slips ?? 0; // her verdict counts the slips the engine counted
      exit(end.result === 'collapse' || end.result === 'limit_broken' || end.result === 'blackout' ? 'fall' : releasedAtLimit() ? 'released' : 'done');
      return EXIT_MS;
    },
    stop() {
      if (E === mine) stopWeight();
    },
    hold(on: boolean, via: 'mouse' | 'key') {
      if (E !== mine) return;
      if (on) R.via = via;
      HOLD.on = on;
    },
    shift(via: 'mouse' | 'key') {
      if (E !== mine) return;
      R.via = via;
      relief();
    },
    balance(x: number) {
      if (E === mine) mouseX = clamp(x, 0, 1);
    },
  };
}

/**
 * Review I5 (ruling Q): she let go at the commander's limit, as the engine decided it: a tap she answered (a signal holder lets go at once), or
 * the engine's strength at the end at or below her `holdsUntil`'s `releaseAt` (signal 15 %, limit 5 %; a blackout holder never lets go so).
 * The end of a running segment is the engine's own resolution of the inputs this instrument sent (`resolveSegment`, pure); a hold that ended
 * between two segments or before its end has the strength the engine last gave.
 */
function releasedAtLimit(): boolean {
  const run = R.run;
  if (!E || !run) return false;
  const state = E.env.state(), reg = E.env.registries;
  const holds = effectiveHoldsUntil(state, reg, run.holderId);
  if (R.tapped && (holds === 'signal' || (holds === 'limit' && run.taps > 0))) return true; // the engine's answer to a tap (`physicsSignal`)
  const at = holds === 'signal' ? TUNING.physics.releaseAt.signal : holds === 'limit' ? TUNING.physics.releaseAt.limit : -1;
  const plan = run.segment.plan;
  const gauge = R.seg?.flushed && plan && run.segment.state === 'running' && state.scene ? resolveSegment(run, plan, R.inputs, resolveEnvOf(state, reg, run)).gauge : run.gauge;
  return gauge / Math.max(1, run.capacity) <= at;
}

/** Ruling B: what an outer instrument applies to its own frame while the core runs (the prototype's tilt, tremble and sag of `#world`). */
export function weightFrame(): { tilt: number; tremble: number; sag: number; strF: number; cam: number } {
  const k = G.cam, strF = smooth(100, 0, G.str);
  const err = G.phase === 'loop' || G.phase === 'entry' ? G.cop - G.ctl : 0;
  return { tilt: clamp(err, -1.2, 1.2) * 6 * k, tremble: S.reduced ? 0 : (Math.pow(strF, 2) * 5 + G.jolt * 7) * k, sag: G.sag * 26 * k, strF, cam: k };
}

/**
 * The weight physics of a run: a hold interaction with a capacity gauge (read by field), alone or with a second that takes no input of the
 * commander's (`passive`). A second that does (a breath's openings, a decision's mouth breath: weight.html has neither) is left to the card.
 */
export function weightMatches(run: PhysicsRun, _state: CampaignState, reg: Registries): boolean {
  const p = reg.contactPhysics.get(run.physicsId);
  if (p?.interaction !== 'hold' || (p.gauge as { kind?: string } | undefined)?.kind !== 'capacity') return false;
  if (!run.second) return true;
  return reg.contactPhysics.get(run.second.physicsId)?.interaction === 'passive';
}

registerInstrument({ id: 'weight', matches: weightMatches, start: (env, run) => startWeight(env, run) });

/** Tests and the shots only: the prototype's state and hooks (its `window.__G`, `__S`, `__begin`, `__mouse`). */
export const _weight = {
  get G(): Glob { return G; },
  get R(): Wiring { return R; },
  get S(): typeof S { return S; },
  get HOLD(): typeof HOLD { return HOLD; },
  STYLES, fresh, say, crack, healCracks, planShift, landShift, slip, relief, begin, exit, updateLoop, letters, legPoints, LEG_FEET,
  setG(g: Glob): void { G = g; },
  /** Tests: the seed of the module's `Math.random` (a xorshift, no rng draw). */
  seed(n: number): void { seed = n >>> 0 || 1; },
  /** The shots: the frame clock starts again (a fake clock installed after the page began). */
  resetClock(): void { frame.last = undefined; },
  /** The prototype's `__mouse`: the balance's target (0 left … 1 right). */
  mouse(x: number): void { mouseX = x; },
  /** The shots: her telegraphed shift now (the prototype's `planShift`, with her style's lead), with her lines of this beat. */
  shift(feint = false): void { refreshLines(segBeat()); const st = ST(); planShift({ tele: rand(st.tele[0], st.tele[1]), feint, cost: 20 }); },
  /** The shots: her lines of this beat, read now. */
  lines(): void { refreshLines(segBeat()); },
  /** The shots: the art slot `over` with a picture (its fit the prototype's defaults). */
  setOver(url: string): void { const o = E?.els['#over'] as HTMLImageElement | undefined; if (o) { o.src = url; o.style.display = ''; } },
};
