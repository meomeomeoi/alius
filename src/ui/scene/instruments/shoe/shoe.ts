/**
 * P10e-e Task 28: shoe service (`docs/prototypes/shoe.html`, normative; README lines 175–207; its `fidelity.json` checks the port against
 * it). Her boots or her heels, carrying the dirt of her day: the tongue cleans along her grain (the mouth drying, grit gathering), slow strokes
 * on clean leather bring up a shine, a press held still is a kiss; Space swallows the grit, X or the right button spits it aside; she turns
 * her foot, presents the sole, presses it to the face, stamps, changes feet; at the end of each surface she turns it to the light (a band of
 * light names the worst zone) and gives her verdict.
 *
 * The functions are the prototype's, copied (types added). The wiring, declared in `fidelity.json`:
 * - her footwear and the dirt of her day are the engine's (`footwearOf`, `dirtOfDay`, R30); her style is her lead physics style (`STYLES`, the
 *   prototype's drafts, live in the engine: `physics/footwear.ts`); her attention is the plan's per beat (P15a's, by her activity), not the
 *   prototype's own re-choice;
 * - the pictures are the art slots `shoe_close.<kind>` and `shoe_sole.<kind>`, each with its sidecar (`feet`, `shown`, `fit`, `zones`); without
 *   both pictures of her footwear (or when one fails to load) the physics card plays the hold (`shoeDrawable`, README: no stand-in sprite);
 * - each beat of a running segment is reported once as it ends (the last 300 ms before the segment's end): `wipe` with the zone wiped most and
 *   the share of the whole footwear's dirt taken off in the beat (each of the four surfaces is a quarter; R29), `pointer`; what is wiped while
 *   the run is held is carried by the next beat reported (Ruling AD). A spit is decided at once by the engine (`physics/spit`, Ruling AC: one
 *   draw with the prototype's chance), whether a segment runs or the run is held, and her answer follows at once;
 * - her verdict at the session's end (after the last surface, or when the engine's check ended the run first) is `physics/service`
 *   (`verdictOf` of the mean quality of the surfaces she judged, R27); the stop word gives none;
 * - her lines are `cardVoice` `shoe.*` by her style, her words for the zones `shoe.zone.<zone>` (Rulings Q, R, Z: verbatim, cold's own
 *   lines included; a style the prototype has no row of reads neutral's);
 * - `performance`, `setTimeout`, `requestAnimationFrame`, `innerWidth` / `innerHeight`, `document` (for the masks' canvases) and `Math.random`
 *   are this module's own (the frame clock, the mount's timers and frames, the scene's size, a canvas that never fails, a xorshift seeded by
 *   the scene and the run: no rng draw).
 * Not ported (README: prototype only): the panel, the start overlay, the summary card (its elements are detached), the debug readout, the
 * zone marker (chunk f), the `__` hooks (`_shoe` is the tests' and the shots').
 */
import type { Registries } from '../../../../content/types';
import { fnv1a } from '../../../../engine/hub';
import { dirtOfDay, footwearOf, isShoeRun, STYLES, type ShoePace } from '../../../../engine/physics/footwear';
import { verdictOf } from '../../../../engine/physics/service';
import type { PhysicsRun, PlannedBeat, SegmentInput } from '../../../../engine/physics/state';
import { leadStyle, physicsMannerOf, physicsStyleOf, segmentSecondsOf } from '../../../../engine/physics/style';
import { bendRow, type RowAxes, type RowKinds } from '../kit/bendRow';
import type { CampaignState } from '../../../../engine/state/types';
import { TUNING } from '../../../../engine/tuning';
import type { ArtPicture } from '../../art';
import { voiceLines, type VoiceKind } from '../../cards/voice';
import { registerInstrument } from '../host';
import { onStageReset } from '../../stage';
import { clamp, lerp, smooth } from '../kit/math';
import type { InstrumentEnv, InstrumentRun, PhysicsEnd } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

/* ---------- the wiring: the mount, the clock, the timers, the frames and the size of the scene ---------- */
interface ShoeEls { env: InstrumentEnv; box: HTMLElement; els: Record<string, HTMLElement>; frameId: number | null }
let E: ShoeEls | null = null;
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
    after(now);
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
/** A canvas whose context never fails (a page with no canvas; a picture that taints it reads as transparent): the instrument still runs. */
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
    if (r) { const gid = r.getImageData.bind(r); r.getImageData = (x: number, y: number, w: number, h: number) => { try { return gid(x, y, w, h); } catch { return { data: new Uint8ClampedArray(w * h * 4) }; } }; }
    return ctx;
  };
  return c;
}
/** The prototype's `document.createElement`: its masks' canvases are safe ones; any other element is the page's. */
const document = { createElement: (tag: string): Any => (tag === 'canvas' ? safeCanvas() : globalThis.document.createElement(tag)) };
/** A detached element for the prototype's own page parts (its reply line, its summary card, its debug readout, its mouth gauge). */
const DETACHED = new Map<string, HTMLElement>();
const $ = (s: string): Any => {
  const e = E!;
  if (e.els[s]) return e.els[s];
  let d = DETACHED.get(s);
  if (!d) { d = s === '#mouthGauge' ? safeCanvas() : globalThis.document.createElement('div'); DETACHED.set(s, d); }
  return d;
};
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/* ---------- the engine's numbers (TUNING.physics.tongue): her check at dirt ≤ 10 ---------- */
export const CHECK_AT = TUNING.physics.tongue.checkAt / 100;
/* ---------- the footwear: zones by view (centres as fractions of the picture, radii as fractions of its height, an angle); `leather` zones take a shine ---------- */
export const KINDS = {
  boots: {
    label: 'combat boots', gloss: 0.7, // how bright a full shine is (the toe cap more)
    close: { toe: [0.62, 0.78, 0.09, 0.06, -20], vamp: [0.5, 0.62, 0.1, 0.06, -25], laces: [0.42, 0.45, 0.06, 0.1, -15], side: [0.4, 0.72, 0.11, 0.07, -10], heel: [0.22, 0.78, 0.06, 0.08, 0], shaft: [0.33, 0.26, 0.08, 0.13, -5], welt: [0.45, 0.9, 0.16, 0.025, -12] },
    sole: { toe_tread: [0.5, 0.2, 0.13, 0.1, 0], mid: [0.5, 0.5, 0.09, 0.12, 0], heel_tread: [0.5, 0.8, 0.11, 0.09, 0] },
    leather: ['toe', 'vamp', 'side', 'heel', 'shaft', 'welt'], bright: { toe: 1.4 },
  },
  heels: {
    label: 'high heels', gloss: 1.0,
    close: { toe: [0.7, 0.72, 0.08, 0.06, -25], vamp: [0.56, 0.6, 0.09, 0.05, -30], side: [0.45, 0.63, 0.1, 0.05, -20], back: [0.28, 0.5, 0.05, 0.07, 0], heel: [0.25, 0.78, 0.025, 0.11, 5] },
    sole: { toe_tread: [0.5, 0.22, 0.12, 0.1, 0], mid: [0.5, 0.52, 0.07, 0.12, 0], heel_tread: [0.5, 0.86, 0.04, 0.04, 0] },
    leather: ['toe', 'vamp', 'side', 'back', 'heel'], bright: {},
  },
} as Record<string, { label: string; gloss: number; close: Record<string, number[]>; sole: Record<string, number[]>; leather: string[]; bright: Record<string, number> }>;
/* the front composition (both feet, from above): zones per foot as offsets from that foot's centre x (u) and absolute y */
export const FRONT = {
  boots: { toe: [0, 0.88, 0.05, 0.035, 0], vamp: [0, 0.76, 0.045, 0.045, 0], laces: [0, 0.6, 0.03, 0.07, 0], shaft: [0, 0.4, 0.05, 0.09, 0], welt: [0, 0.94, 0.07, 0.015, 0] },
  heels: { toe: [0, 0.9, 0.045, 0.035, 0], vamp: [0, 0.8, 0.04, 0.035, 0], side: [0.045, 0.78, 0.015, 0.05, 0] },
} as Record<string, Record<string, number[]>>;
export const SOLE_TWO = { toe_tread: [0, 0.22, 0.06, 0.08, 0], mid: [0, 0.5, 0.035, 0.09, 0], heel_tread: [0, 0.82, 0.035, 0.05, 0] } as Record<string, number[]>;
/** Her words for the zones (`cardVoice` `shoe.zone.<zone>`, the prototype's `ZONE_WORDS`). */
const ZONE_WORDS: Record<string, string> = new Proxy({}, { get: (_t, k) => (E ? voiceLines(E.env.registries, `shoe.zone.${String(k)}` as VoiceKind, undefined)[0] : undefined) ?? String(k) });
/* the dirt of her day: its colour (multiplied over the picture), how much grit a cleaned unit leaves in the mouth, how fast it dries the mouth,
   how hard it wipes, how it lies (blobs: count, size, stretch), its taste */
export const DIRTS = {
  ash:    { color: [104, 100, 96], grit: 0.6, dry: 1.6, resist: 1.0, blobs: [4, 0.12, 1], taste: 'Ash: dry, bitter, it coats the tongue.', where: 'the Ashway' },
  mud:    { color: [86, 64, 44], grit: 1.0, dry: 0.5, resist: 1.25, blobs: [6, 0.1, 1], taste: 'Mud: gritty and cold; sand between the teeth.', where: 'a wet run' },
  oil:    { color: [40, 36, 32], grit: 0.2, dry: 0.8, resist: 2.0, blobs: [3, 0.07, 3], taste: 'Machine oil: bitter, it will not wash off the tongue.', where: 'Corridor K-12' },
  spores: { color: [104, 122, 78], grit: 0.4, dry: 0.9, resist: 1.0, blobs: [7, 0.06, 1], taste: 'Spores: sweetish, then rotten. The Bloom.', where: 'District 7' },
  dust:   { color: [168, 148, 116], grit: 0.5, dry: 1.8, resist: 0.7, blobs: [3, 0.16, 1], taste: 'Parade-ground dust: chalky, it dries everything.', where: 'the training yard' },
  rain:   { color: [110, 96, 80], grit: 0.3, dry: 0.4, resist: 0.6, blobs: [14, 0.035, 1], taste: 'Muddy rainwater, cold and flat.', where: 'the rain' },
} as Record<string, { color: number[]; grit: number; dry: number; resist: number; blobs: number[]; taste: string; where: string }>;
/** Her lines (`cardVoice` `shoe.*` by her style, `refreshLines`) in the prototype's `LINES` shape. */
export const LINE_KINDS = ['entry', 'turn', 'sole', 'kiss', 'polish', 'other', 'caught', 'swallowed', 'good', 'poor', 'missed', 'dull', 'stamp', 'end', 'stop'] as const;
export let LINES: Record<string, Record<string, string[]>> = { neutral: {} };

/* ---------- settings ---------- */
const S: Any = { kind: 'boots', dirt: 'mud', style: 'neutral', busy: 'auto', sound: true, vol: 0.7, debug: false, reduced: false,
  feet: { boots_close: 'one', boots_sole: 'one', heels_close: 'one', heels_sole: 'one' },     // 'one' | 'two' per picture
  shown: { boots_close: 'right', boots_sole: 'right', heels_close: 'right', heels_sole: 'right' }, // with one foot: which of hers it is
  fit: { boots_close: { h: 0.68, y: 0.48, x: 0, fade: 0.25, xr: 0.38, xl: 0.62 }, boots_sole: { h: 0.78, y: 0.5, x: 0, fade: 0.2, xr: 0.38, xl: 0.62 }, heels_close: { h: 0.68, y: 0.48, x: 0, fade: 0.25, xr: 0.38, xl: 0.62 }, heels_sole: { h: 0.78, y: 0.5, x: 0, fade: 0.2, xr: 0.38, xl: 0.62 } }, zones: {} };
/**
 * P15b: what each bent field of a `STYLES` row is (`bendRow`): how long she gives a surface a time, her foot's press and stamp a magnitude, how often she
 * wants a kiss her patience (the warmer, the more). How often she looks (`busy`) and her grain have no axis and are not bent.
 */
export const SHOE_KINDS: RowKinds<ShoePace> = { surface: 'time', moves: { press: 'magnitude', stamp: 'magnitude', kiss: 'patience' } };
const ST = () => bendRow(STYLES[S.style] ?? STYLES.neutral!, R.manner, SHOE_KINDS);
const L = () => LINES[S.style] ?? LINES.neutral;
const D = () => DIRTS[S.dirt];
const K = () => KINDS[S.kind];

/* ---------- audio ---------- */
let A: Any = { ctx: null, buf: {} };
/** The recorded sounds (shoe.html `SAMPLE_URLS`), the extension's own CC0 files: the sample layer decodes them. */
export const SAMPLE_URLS: Readonly<Record<string, string>> = {
  cloth1: 'assets/sounds/ha/cloth1.ogg', cloth2: 'assets/sounds/ha/cloth2.ogg', cloth3: 'assets/sounds/ha/cloth3.ogg', cloth4: 'assets/sounds/ha/cloth4.ogg',
  wood1: 'assets/sounds/ha/wood1.ogg', wood2: 'assets/sounds/ha/wood2.ogg', soft1: 'assets/sounds/ha/soft1.ogg', soft2: 'assets/sounds/ha/soft2.ogg',
  key1: 'assets/sounds/ha/key1.ogg', key2: 'assets/sounds/ha/key2.ogg',
};
export const GROUPS = { cloth: ['cloth1', 'cloth2', 'cloth3', 'cloth4'], wood: ['wood1', 'wood2'], soft: ['soft1', 'soft2'], key: ['key1', 'key2'] } as Record<string, string[]>;
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
  A.grain = mk(2, (d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() < 0.004 ? (Math.random() * 2 - 1) : 0; }); // sparse clicks: grit
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
function play(id: string, { g = 0.5, pan = 0, rate = 1, lp = 0, dest, at = 0 }: Any = {}) {
  const key = GROUPS[id] ? pick(GROUPS[id]) : id;
  if (!A.ctx || !A.buf[key]) return null;
  const ctx = A.ctx, t = ctx.currentTime + at;
  const src = ctx.createBufferSource(); src.buffer = A.buf[key]; src.playbackRate.value = rate;
  const gn = ctx.createGain(); gn.gain.value = g; src.connect(gn); let n = gn;
  if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; n.connect(f); n = f; }
  if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; n.connect(p); n = p; }
  n.connect(dest ?? A.world); src.start(t); return src;
}
function noise({ at = 0, dur = 0.2, type = 'bandpass', f = 1000, f2, q = 1, gain = 0.1, attack = 0.01, dest = A.world, buf }: Any) {
  if (!A.ctx) return;
  const ctx = A.ctx, t = ctx.currentTime + at;
  const src = ctx.createBufferSource(); src.buffer = buf ?? A.white; src.loop = true;
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
  kiss: () => { noise({ dur: 0.07, type: 'lowpass', f: 900, gain: 0.08, attack: 0.004, dest: A.body }); noise({ at: 0.05, dur: 0.03, type: 'highpass', f: 2500, gain: 0.04, attack: 0.002, dest: A.body }); },
  gulp: (g = 1) => { tone(190, 110, 0.12, 0.22 * g); noise({ at: 0.04, dur: 0.05, f: 900, q: 3, gain: 0.08 * g, dest: A.body }); },
  spit: () => { noise({ dur: 0.12, type: 'bandpass', f: 2200, f2: 900, q: 0.8, gain: 0.12, attack: 0.005, dest: A.body }); noise({ at: 0.1, dur: 0.05, type: 'lowpass', f: 600, gain: 0.05, dest: A.world }); },
  stamp: () => { tone(80, 50, 0.18, 0.5, { dest: A.world }); play('wood', { g: 0.3 }); },
  squeak: () => { if (!A.ctx) return; const t = A.ctx.currentTime; const o = A.ctx.createOscillator(); o.frequency.setValueAtTime(rand(2600, 3600), t); o.frequency.linearRampToValueAtTime(rand(2200, 3000), t + 0.08);
    const lfo = A.ctx.createOscillator(); lfo.frequency.value = 60; const lg = A.ctx.createGain(); lg.gain.value = 200; lfo.connect(lg); lg.connect(o.frequency);
    const g = A.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.015, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g); g.connect(A.body); o.start(t); lfo.start(t); o.stop(t + 0.1); lfo.stop(t + 0.1); },
  tap: () => play('key', { g: 0.12, pan: 0.2, rate: rand(0.95, 1.1) }),
};
/* the lick: a continuous noise whose colour follows the mouth's wetness, its level the stroke's speed, and a crackle the grit */
let LICK: Any = null;
function lickTick(speed: number) {
  if (!A.ctx) return;
  if (!LICK) {
    const src = A.ctx.createBufferSource(); src.buffer = A.white; src.loop = true;
    const f = A.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2; const g = A.ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(A.body); src.start();
    const gs = A.ctx.createBufferSource(); gs.buffer = A.grain; gs.loop = true; const gf = A.ctx.createBiquadFilter(); gf.type = 'highpass'; gf.frequency.value = 1800; const gg = A.ctx.createGain(); gg.gain.value = 0;
    gs.connect(gf); gf.connect(gg); gg.connect(A.body); gs.start();
    LICK = { f, g, gg };
  }
  const ct = A.ctx.currentTime;
  LICK.f.frequency.setTargetAtTime(lerp(1100, 3400, G.dry), ct, 0.05);
  LICK.g.gain.setTargetAtTime(clamp(speed / 1800, 0, 1) * 0.07, ct, 0.04);
  LICK.gg.gain.setTargetAtTime(clamp(speed / 1800, 0, 1) * G.grit * 0.5, ct, 0.04);
}
const lickStop = () => { if (LICK && A.ctx) { LICK.g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.06); LICK.gg.gain.setTargetAtTime(0, A.ctx.currentTime, 0.06); } };

/* ---------- her hand and the sensory lines ---------- */
function say(text: string | undefined) {
  if (!text) return;
  const el = document.createElement('div'); el.className = 'her-line'; el.textContent = text;
  const speed = S.style === 'cruel' || S.style === 'cold' ? 24 : S.style === 'ritual' ? 45 : 34;
  el.style.setProperty('--write', `${Math.max(140, text.length * speed)}ms`); el.style.setProperty('--steps', String(Math.max(4, text.length * 2)));
  const showing = [...$('#hand').querySelectorAll('.her-line:not(.gone)')].length;
  el.style.left = `${innerWidth * 0.62}px`; el.style.top = `${innerHeight * 0.12 + showing * 50}px`; el.style.transform = `rotate(${rand(-4, 3).toFixed(1)}deg)`;
  $('#hand').appendChild(el); SFX.pen();
  setTimeout(() => { el.classList.add('gone'); setTimeout(() => el.remove(), 600); }, 2600);
}
function sense(text: string) {
  const el = document.createElement('div'); el.className = 'sense'; el.textContent = text;
  const showing = [...$('#hand').querySelectorAll('.sense:not(.gone)')].length;
  el.style.left = `${innerWidth * 0.06}px`; el.style.top = `${innerHeight * 0.6 - showing * 46}px`;
  $('#hand').appendChild(el);
  setTimeout(() => { el.classList.add('gone'); setTimeout(() => el.remove(), 900); }, 3400);
}
const sayL = (key: string, z?: string) => { const pool = L()[key]; if (pool && pool.length) say(pick(pool).replace('%z', z ? ZONE_WORDS[z]! : '')); };

/* ---------- the state: two feet, three surfaces each (outer, inner, sole), a dirt mask and a gloss mask per surface ---------- */
let G: Any;
function fresh() {
  return { phase: 'idle', t: 0, foot: 'right', surface: 'close', surfaces: {}, order: [], orderI: 0, surfT: 0, surfLen: 25000, dry: 0, grit: 0, gest: null,
    want: null, wantAt: 0, attention: 'busy', attT: 0, nextAtt: 2000, nextMove: 6000, fx: { dx: 0, dy: 0, s: 1, r: 0 }, anim: null, press: 0, light: -1, lightT: 0,
    marks: [], toldDry: false, toldPolish: false, toldGrit: false, toldTaste: false, nextTap: 0,
    stats: { strokes: 0, withGrain: 0, kisses: 0, swallows: 0, spits: 0, caught: 0, stamps: 0, checks: [], polishStrokes: 0 } } as Any;
}
G = fresh();
const view = () => (G.surface === 'sole' ? 'sole' : 'close');
const slotKey = () => `${S.kind}_${view()}`;
const twoFeet = () => S.feet[slotKey()] === 'two';
const mirrored = () => !twoFeet() && G.foot !== S.shown[slotKey()]; // one foot in the picture: the other foot is it mirrored
const footX = () => S.fit[slotKey()][G.foot === 'right' ? 'xr' : 'xl'];
function zonesNow() {
  if (twoFeet()) {
    const own = S.zones[slotKey()]?.[G.foot]; if (own) return own;
    const u0 = footX(), out = {} as Any, sgn = G.foot === 'right' ? -1 : 1;
    for (const [k, p] of Object.entries(view() === 'sole' ? SOLE_TWO : FRONT[S.kind]!) as Array<[string, number[]]>) out[k] = [+(u0 + p[0]! * sgn).toFixed(3), p[1], p[2], p[3], p[4]];
    return out;
  }
  const z = S.zones[slotKey()]; return z && !z.right ? z : (K() as Any)[view()];
}
const leatherNow = () => (view() === 'sole' ? [] : K()!.leather.filter((z) => Object.keys(zonesNow()).includes(z))); // only the leather zones this picture has
const surf = () => G.surfaces[`${G.foot}_${G.surface}`];

/* ---------- the picture's rect (the fit per slot; her foot's motions on top) ---------- */
const imgs: Record<string, HTMLImageElement> = {};
let shownSrc: string | null = null;
function slotImg() { const i = imgs[slotKey()]; return i && i.naturalWidth ? i : null; }
function shoeRect() {
  const img = slotImg() ?? SPRITE; if (!img.naturalWidth) return null;
  const fit = S.fit[slotKey()];
  const H = innerHeight * fit.h, Wd = H * img.naturalWidth / img.naturalHeight;
  const k = G.fx.s * (1 + 0.1 * G.press);
  // both feet in one picture: the camera centres the foot being served (and pans when she changes feet)
  G.camU = lerp(G.camU ?? (twoFeet() ? footX() : 0.5), twoFeet() ? footX() : 0.5, 0.08);
  const cx = innerWidth / 2 + (fit.x ?? 0) * innerWidth + G.fx.dx - (G.camU - 0.5) * Wd * k, cy = innerHeight * fit.y + G.fx.dy;
  return { x: cx - (Wd * k) / 2, y: cy - (H * k) / 2, w: Wd * k, h: H * k };
}
/* a point on screen → the picture's own coordinates (0–1), undoing the mirror */
function toPic(x: number, y: number) { const r = shoeRect(); if (!r) return null; let u = (x - r.x) / r.w; const v = (y - r.y) / r.h; if (mirrored()) u = 1 - u; return [u, v, r] as Any; }
/* the zones as ellipses in px (from foot service: `zoneRadii`, `inEllipse`, `zoneAt`) */
function zoneRadii(r: Any) {
  const z = Object.entries(zonesNow()) as Array<[string, number[]]>, out = {} as Any;
  for (const [k, p] of z) {
    let dmin = 1e9;
    for (const [k2, q] of z) if (k2 !== k) dmin = Math.min(dmin, Math.hypot((p[0]! - q[0]!) * r.w, (p[1]! - q[1]!) * r.h));
    const auto = clamp(dmin / 2, r.h * 0.04, r.h * 0.12);
    out[k] = p[3] !== undefined ? { rx: p[2]! * r.h, ry: p[3] * r.h, rot: ((p[4] ?? 0) * Math.PI) / 180 } : p[2] !== undefined ? { rx: p[2] * r.h, ry: p[2] * r.h } : { rx: auto, ry: auto };
  }
  return out;
}
function inEllipse(dx: number, dy: number, z: Any) { const a = -(z.rot ?? 0), c = Math.cos(a), sn = Math.sin(a); return [(dx * c - dy * sn) / z.rx, (dx * sn + dy * c) / z.ry] as [number, number]; }
function zoneAtPic(u: number, v: number, r: Any) {
  const rad = zoneRadii(r); let best = null, bd = 1e9;
  for (const [k, p] of Object.entries(zonesNow()) as Array<[string, number[]]>) { const [ex, ey] = inEllipse((u - p[0]!) * r.w, (v - p[1]!) * r.h, rad[k]); const d = Math.hypot(ex, ey); if (d < 1 && d < bd) { bd = d; best = k; } }
  return best;
}
const onShoe = (x: number, y: number) => { const q = toPic(x, y); return q && q[0] > 0 && q[0] < 1 && q[1] > 0 && q[1] < 1; };

/* ---------- the dirt and the gloss: masks at low resolution over the picture's own alpha (foot service's `makeDirt`, by the dirt of her day) ---------- */
function makeSurface() {
  const img = slotImg() ?? SPRITE; if (!img.naturalWidth) return null;
  const w = 140, h = Math.round(140 * img.naturalHeight / img.naturalWidth);
  const base = document.createElement('canvas'); base.width = w; base.height = h; const b = base.getContext('2d')!; b.drawImage(img, 0, 0, w, h);
  const alpha = b.getImageData(0, 0, w, h).data;
  const m = new Float32Array(w * h), gl = new Float32Array(w * h), zoneOf = new Int8Array(w * h).fill(-1), leatherMask = new Uint8Array(w * h);
  const zs = Object.entries(zonesNow()) as Array<[string, number[]]>, r = { w: w, h: h }, asp = img.naturalWidth / img.naturalHeight;
  const rad = zoneRadii({ w: asp, h: 1 }); // radii in heights of the picture
  const [n, size, stretch] = D()!.blobs as [number, number, number], blobs: number[][] = [];
  for (const [k, p] of zs) for (let i = 0; i < n * (view() === 'sole' ? 1.5 : 1); i++) blobs.push([p[0]! + rand(-0.09, 0.09), p[1]! + rand(-0.06, 0.06), rand(size * 0.6, size * 1.4), rand(-1, 1)]);
  const leather = leatherNow();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = alpha[(y * w + x) * 4 + 3]! / 255; if (a < 0.3) continue;
    let dmin = 1e9, zi = -1;
    zs.forEach(([k, p], i) => { const [ex, ey] = inEllipse((x / w - p[0]!) * asp, y / h - p[1]!, rad[k]); const d = Math.hypot(ex, ey); if (d < dmin) { dmin = d; zi = i; } });
    const onShoeK = 1 - smooth(0.9, 1.5, dmin); if (onShoeK <= 0.01) continue;
    zoneOf[y * w + x] = dmin < 1.2 ? zi : -1;
    if (zi >= 0 && leather.includes(zs[zi]![0])) leatherMask[y * w + x] = 1;
    let v = (S.dirt === 'rain' ? 0.05 : 0.22) + Math.random() * 0.12;
    for (const [bx, by, br, sk] of blobs as Array<[number, number, number, number]>) { const dx = (x / w - bx) * asp, dy = y / h - by; const sx = stretch > 1 ? dx + sk * dy * 0.6 : dx; v += 0.55 * Math.exp(-((sx * sx) / (stretch * stretch) + dy * dy * 0.8) / (br * br)); }
    m[y * w + x] = clamp(v, 0, 1) * a * onShoeK;
  }
  const tex = new Float32Array(w * h); for (let i = 0; i < w * h; i++) tex[i] = 0.7 + Math.random() * 0.3; // the dirt's grain
  const s = { w, h, m, gl, tex, zoneOf, leatherMask, total0: m.reduce((q, v) => q + v, 0), c: document.createElement('canvas'), cg: document.createElement('canvas'), names: zs.map(([k]) => k) };
  s.c.width = s.cg.width = w; s.c.height = s.cg.height = h;
  return s;
}
function ensureSurface() { const key = `${G.foot}_${G.surface}`; if (!G.surfaces[key]) G.surfaces[key] = makeSurface(); return G.surfaces[key]; }
const dirtLeft = (s = surf()) => (s ? s.m.reduce((q: number, v: number) => q + v, 0) / Math.max(1, s.total0) : 0);
function zoneStat(zone: string, s = surf()) {
  if (!s) return { dirt: 0, gloss: 1 }; const i = s.names.indexOf(zone); if (i < 0) return { dirt: 0, gloss: 1 }; let d = 0, g = 0, n = 0; // a zone the picture does not have is never judged
  for (let p = 0; p < s.m.length; p++) if (s.zoneOf[p] === i) { d += s.m[p]; g += s.gl[p]; n++; }
  return n ? { dirt: d / n, gloss: g / n } : { dirt: 0, gloss: 1 };
}
/* a stroke of the tongue between two screen points: dirty pixels are wiped (along her grain better, worse with a dry or gritty mouth, by the dirt's resistance);
   clean leather takes a gloss from slow strokes and loses a little from fast ones */
function lickStroke(x0: number, y0: number, x1: number, y1: number, speed: number) {
  const s = surf(); const a = toPic(x0, y0), b = toPic(x1, y1); if (!s || !a || !b) return { removed: 0, polished: 0 } as Any;
  const r = a[2];
  const { w, h, m, gl, leatherMask } = s;
  // her grain: along the zone's long axis (toward the toe for 1, away for -1), across is half as good
  const zone = zoneAtPic(b[0], b[1], r), zp = zone ? zonesNow()[zone] : null;
  let withGrain = true;
  if (zp) { const ang = ((zp[4] ?? 0) * Math.PI) / 180, major = zp[2] >= (zp[3] ?? zp[2]) ? ang : ang + Math.PI / 2; const du = (b[0] - a[0]) * r.w, dv = (b[1] - a[1]) * r.h, len = Math.hypot(du, dv) || 1;
    const along = (du * Math.cos(major) + dv * Math.sin(major)) / len; withGrain = Math.abs(along) > 0.6 && Math.sign(along) === ST()!.grain; } // picture space (the mirror is already undone)
  const wet = (1 - G.dry * 0.85) * (1 - G.grit * 0.4), k = (withGrain ? 1 : 0.45) * wet * 0.5 / D()!.resist;
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4)), rad = 0.07 * w;
  let removed = 0, polished = 0;
  const slow = speed < 650;
  for (let i = 0; i <= steps; i++) {
    const px = lerp(a[0], b[0], i / steps) * w, py = lerp(a[1], b[1], i / steps) * h;
    for (let y = Math.max(0, Math.floor(py - rad)); y < Math.min(h, Math.ceil(py + rad)); y++) for (let x = Math.max(0, Math.floor(px - rad)); x < Math.min(w, Math.ceil(px + rad)); x++) {
      const d = Math.hypot(x - px, y - py) / rad; if (d > 1) continue; const p = y * w + x;
      if (m[p] > 0.04) { const take = m[p] * k * (1 - d) * 0.35; m[p] -= take; removed += take; }
      else if (leatherMask[p]) {
        if (slow) { const add = (1 - gl[p]) * 0.06 * (1 - d) * wet; gl[p] += add; polished += add; } else gl[p] = Math.max(0, gl[p] - 0.01 * (1 - d));
      }
    }
  }
  return { removed, polished, withGrain, zone };
}

/* ---------- her moves ---------- */
function beginSurface(surface: string) {
  G.surface = surface; G.surfT = 0; G.surfLen = rand(...ST()!.surface) * 1000; ensureSurface(); G.want = null; G.anim = { kind: 'turn', t0: G.t };
  play('cloth', { g: 0.3 });
  if (surface === 'sole') sayL('sole');
  nextWant();
}
function nextWant() {
  // she points at the dirtiest zone she cares about (the engine reads her `how`; here: the dirtiest, or on clean leather, the dullest)
  const s = surf(); if (!s) return;
  let best = null, bv = 0.12;
  for (const z of s.names) { const st = zoneStat(z); if (st.dirt > bv) { bv = st.dirt; best = z; } }
  if (!best && view() === 'close') { let gv = 0.6; for (const z of leatherNow()) { const st = zoneStat(z); if (st.gloss < gv) { gv = st.gloss; best = z; } } if (best && !G.toldPolish) { G.toldPolish = true; sayL('polish'); } }
  G.want = best; G.wantAt = G.t;
}
function herMove() {
  const mv = ST()!.moves, r = Math.random();
  if (r < mv.stamp && G.lastQuality !== undefined && G.lastQuality < 0.5) { G.anim = { kind: 'stamp', t0: G.t }; SFX.stamp(); G.stats.stamps += 1; sayL('stamp'); }
  else if (r < mv.stamp + mv.press) { G.anim = { kind: 'press', t0: G.t }; play('cloth', { g: 0.25 }); sense('She presses it to your face. Leather and her day, close.'); }
  else if (r < mv.stamp + mv.press + mv.kiss) { G.kissWanted = G.t; sayL('kiss'); }
  G.nextMove = G.t + rand(7000, 13000);
}
/* her attention: busy on her device (the taps are heard; they stop when she looks), glancing, watching */
function updateAttention(dt: number) {
  G.attT += dt;
  if (G.attT > G.nextAtt) {
    G.attT = 0;
    G.attention = planAttention();
    G.nextAtt = 0;
  }
  if (G.attention === 'busy' && G.t > G.nextTap) { SFX.tap(); G.nextTap = G.t + rand(140, 420); }
}
function inspect() {
  // she turns it to the light: a band sweeps across; then her verdict on the worst zone (dirt left, or a dull leather zone)
  G.phase = 'inspect'; G.light = 0; G.lightT = 0; play('cloth', { g: 0.3 });
  sense('She turns it to the light.');
}
function verdict() {
  const s = surf(); let worst = null, wv = 0, kind = null;
  for (const z of s.names) { const st = zoneStat(z); if (st.dirt > 0.2 && st.dirt > wv) { wv = st.dirt; worst = z; kind = 'missed'; } }
  if (!worst && view() === 'close') for (const z of leatherNow()) { const st = zoneStat(z); if (st.gloss < 0.35 && 1 - st.gloss > wv) { wv = 1 - st.gloss; worst = z; kind = 'dull'; } }
  const q = clamp(1 - dirtLeft(s) * 3, 0, 1) * (view() === 'close' ? 0.5 + 0.5 * meanGloss(s) : 1);
  G.lastQuality = q; G.stats.checks.push({ foot: G.foot, surface: G.surface, dirt: dirtLeft(s), gloss: view() === 'close' ? meanGloss(s) : null, worst, kind });
  if (worst) sayL(kind!, worst); else sayL(q > 0.6 ? 'good' : 'poor');
}
function meanGloss(s: Any) { if (!s) return 1; let g = 0, n = 0; for (let p = 0; p < s.gl.length; p++) if (s.leatherMask[p]) { g += s.gl[p]; n++; } return n ? g / n : 1; }

/* ---------- phases ---------- */
function begin() {
  audioInit(); if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume();
  $('#hand').replaceChildren(); $('#summary').style.display = 'none';
  G = fresh(); G.phase = 'loop';
  G.order = [['right', 'close'], ['right', 'sole'], ['left', 'close'], ['left', 'sole']];
  $('#reply').innerHTML = `<span class="act">She sets her ${S.kind === 'boots' ? 'boot' : 'shoe'} down in front of the commander, still carrying ${D()!.where}.</span>`;
  G.foot = 'right'; G.surface = G.order[0][1]; ensureSurface(); nextWant(); G.surfLen = rand(...ST()!.surface) * 1000;
  sayL('entry');
}
function nextSurface() {
  G.orderI += 1;
  if (G.orderI >= G.order.length) { finish('done'); return; }
  const [foot, surface] = G.order[G.orderI];
  if (foot !== G.foot) { G.foot = foot; sayL('other'); G.anim = { kind: 'change', t0: G.t }; play('cloth', { g: 0.35 }); }
  beginSurface(surface);
}
function finish(why: string) {
  if (G.phase === 'done') return;
  G.phase = 'done'; lickStop();
  say(why === 'stop' ? pick(L().stop!) : pick(L().end!));
  const s = G.stats;
  setTimeout(() => {
    $('#sumLine').textContent = why === 'stop' ? pick(L().stop!) : L().end![0];
    $('#sumFacts').innerHTML = `${K()!.label} · ${S.dirt} (${D()!.where})<br>strokes: ${s.strokes} (with her grain ${s.withGrain}) · polish strokes: ${s.polishStrokes}<br>kisses: ${s.kisses}<br>`
      + `swallowed: ${s.swallows} · spat: ${s.spits} (caught ${s.caught})<br>stamps: ${s.stamps}<br>`
      + s.checks.map((c: Any) => `${c.foot} ${c.surface}: dirt ${(c.dirt * 100).toFixed(0)} %${c.gloss !== null ? `, shine ${(c.gloss * 100).toFixed(0)} %` : ''}${c.worst ? ` — ${c.kind} ${ZONE_WORDS[c.worst]}` : ''}`).join('<br>')
      + `<br>how it ended: ${why}`;
    $('#summary').style.display = 'block';
  }, 1000);
}

/* ---------- the mouth: dryness and grit; swallow and spit ---------- */
function swallow() {
  if (G.phase !== 'loop' && G.phase !== 'inspect') return;
  SFX.gulp(0.6 + G.grit); G.stats.swallows += 1;
  if (G.grit > 0.25 && !G.toldTaste) { G.toldTaste = true; sense(`${D()!.taste} You swallow it.`); }
  G.grit = Math.max(0, G.grit - 0.6); G.dry = Math.max(0, G.dry - 0.35);
}
function spit() {
  if (G.phase !== 'loop' || G.grit < 0.05) return;
  SFX.spit(); G.stats.spits += 1;
  const seen = G.attention === 'watching' ? 0.75 : G.attention === 'glancing' ? 0.3 : 0.06;
  G.grit = 0;
  if (spitSeen(seen)) { G.stats.caught += 1; sayL('caught'); G.anim = { kind: 'press', t0: G.t }; if (S.style === 'cruel') { const s = surf(); if (s) for (let p = 0; p < s.m.length; p++) if (s.zoneOf[p] >= 0) s.m[p] = Math.min(1, s.m[p] + 0.15 * Math.random()); } }
  else sense('You spit it aside. She did not see.');
}

/* ---------- the loop ---------- */
let last = 0;
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(50, now - last); last = now;
  if (G.phase === 'loop' || G.phase === 'inspect') update(dt);
  render(now);
}
function update(dt: number) {
  G.t += dt;
  // her foot's motions
  const a = G.anim, fx = { dx: 0, dy: 0, s: 1, r: 0 };
  if (a && !S.reduced) {
    const u = (G.t - a.t0) / 1000;
    if (a.kind === 'turn') { fx.s = 1 - 0.12 * Math.sin(Math.min(u, 0.4) / 0.4 * Math.PI); fx.r = 4 * Math.sin(Math.min(u, 0.4) / 0.4 * Math.PI); }
    if (a.kind === 'change') { fx.dx = 120 * Math.sin(Math.min(u, 0.6) / 0.6 * Math.PI); fx.s = 1 - 0.15 * Math.sin(Math.min(u, 0.6) / 0.6 * Math.PI); }
    if (a.kind === 'press') { const p = u < 0.4 ? easeOut(u / 0.4) : u < 2 ? 1 : Math.max(0, 1 - (u - 2) / 0.6); fx.s = 1 + 0.16 * p; G.press = p; }
    if (a.kind === 'stamp') { fx.dy = 22 * Math.max(0, 1 - u * 3) * Math.sin(u * 40); }
    if (u > 3) { G.anim = null; G.press = 0; }
  }
  G.fx = fx;
  if (G.phase === 'inspect') {
    G.lightT += dt; G.light = clamp(G.lightT / 1700, 0, 1);
    if (G.lightT > 1700 && !G.judged) { G.judged = true; verdict(); }
    if (G.lightT > 3000) { G.judged = false; G.phase = 'loop'; G.light = -1; nextSurface(); }
    return;
  }
  if (!surf()) { ensureSurface(); nextWant(); }
  updateAttention(dt);
  G.surfT += dt;
  // the mouth: grit and dryness tell themselves
  if (G.grit > 0.7 && !G.toldGrit) { G.toldGrit = true; sense('Grit fills the mouth. Swallow it, or spit while she is not looking.'); }
  if (G.dry > 0.85 && !G.toldDry) { G.toldDry = true; sense('Your mouth is dry; the tongue drags. Swallow.'); }
  // her wanted zone, her moves; the surface ends when clean (and shone) or when her time for it is up
  if (G.want && zoneStat(G.want).dirt < 0.1 && (view() === 'sole' || zoneStat(G.want).gloss > 0.55 || !leatherNow().includes(G.want))) nextWant();
  if (G.t > G.nextMove) herMove();
  const done = dirtLeft() <= CHECK_AT && (view() === 'sole' || meanGloss(surf()) > 0.6);
  if (done || G.surfT > G.surfLen) inspect();
}

/* ---------- drawing ---------- */
function render(now: number) {
  const img = slotImg();
  const want = img ? img.src : ASSETS.her; // no picture for this slot: her sprite stands in
  if (shownSrc !== want) { shownSrc = want; $('#shoe').src = want; }
  const r = shoeRect();
  const wrap = $('#shoeWrap');
  if (r) {
    wrap.style.left = `${r.x}px`; wrap.style.top = `${r.y}px`; wrap.style.width = `${r.w}px`; wrap.style.height = `${r.h}px`;
    const fade = S.fit[slotKey()].fade ?? 0; // the top of the picture (her legs cut off) dissolves into the blurred room
    wrap.style.webkitMaskImage = wrap.style.maskImage = fade > 0 ? `linear-gradient(to bottom, transparent 0%, rgba(0,0,0,.35) ${(fade * 45).toFixed(1)}%, #000 ${(fade * 100).toFixed(1)}%)` : 'none';
    wrap.style.transform = `rotate(${(G.fx.r + Math.sin(now / 1900) * 0.35).toFixed(2)}deg) scaleX(${mirrored() ? -1 : 1})`;
  }
  $('#vig').style.background = `radial-gradient(ellipse 64% 58% at 50% 50%, rgba(0,0,0,0) 40%, rgba(0,0,0,${(0.4 + 0.4 * G.press).toFixed(2)}) 100%)`;
  const s = (G.phase === 'loop' || G.phase === 'inspect') ? surf() : null;
  const dc = $('#dirtC'), gc = $('#glossC'), lc = $('#lightC');
  if (s) {
    const col = D()!.color as [number, number, number];
    // dirt: its own colour laid over the picture with a grain (not multiplied, so light dust shows on black boots and dark mud on light heels)
    const cx = s.c.getContext('2d'), id = cx.createImageData(s.w, s.h);
    for (let i = 0; i < s.w * s.h; i++) { const v = Math.min(1, s.m[i] * 1.3), t = s.tex[i]; id.data[i * 4] = col[0] * t; id.data[i * 4 + 1] = col[1] * t; id.data[i * 4 + 2] = col[2] * t; id.data[i * 4 + 3] = Math.round(v * 0.88 * (0.75 + 0.25 * t) * 255); }
    cx.putImageData(id, 0, 0); if (dc.width !== s.w || dc.height !== s.h) { dc.width = s.w; dc.height = s.h; } const d2 = dc.getContext('2d'); d2.clearRect(0, 0, s.w, s.h); d2.drawImage(s.c, 0, 0);
    // gloss: a sheen from the upper left on the polished leather (screen); brighter for patent heels and a boot's toe cap
    const gx = s.cg.getContext('2d'), gd = gx.createImageData(s.w, s.h), bright = K()!.gloss;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const i = y * s.w + x; if (!s.leatherMask[i]) continue;
      const zn = s.zoneOf[i] >= 0 ? s.names[s.zoneOf[i]] : null, zb = (zn && K()!.bright[zn]) || 1;
      const band = 0.35 + 0.65 * Math.exp(-(((x / s.w) - (y / s.h) * 0.6 - 0.12) ** 2) / 0.02); // a soft diagonal highlight
      const v = clamp(s.gl[i] * band * bright * zb * (1 - Math.min(1, s.m[i] * 2)), 0, 1) * 200;
      gd.data[i * 4] = v; gd.data[i * 4 + 1] = v; gd.data[i * 4 + 2] = v * 1.04; gd.data[i * 4 + 3] = 255;
    }
    gx.putImageData(gd, 0, 0); if (gc.width !== s.w || gc.height !== s.h) { gc.width = s.w; gc.height = s.h; } const g2 = gc.getContext('2d'); g2.clearRect(0, 0, s.w, s.h); g2.drawImage(s.cg, 0, 0);
    dc.style.opacity = '1'; gc.style.opacity = '1';
    // the inspection: a band of light sweeps across; dirt stays dark, dull leather stays matte, polished leather flares
    if (G.light >= 0) {
      if (lc.width !== s.w || lc.height !== s.h) { lc.width = s.w; lc.height = s.h; }
      const lx = lc.getContext('2d'), ld = lx.createImageData(s.w, s.h), pos = lerp(-0.3, 1.3, easeOut(G.light));
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
        const i = y * s.w + x; if (s.zoneOf[i] < 0 && !s.leatherMask[i]) continue;
        const bandv = Math.exp(-(((x / s.w) + (y / s.h) * 0.3 - pos) ** 2) / 0.006);
        const shine = s.leatherMask[i] ? 0.15 + 0.85 * s.gl[i] : 0.25;
        const v = bandv * shine * (1 - Math.min(1, s.m[i] * 2.5)) * 255;
        ld.data[i * 4] = v; ld.data[i * 4 + 1] = v * 0.97; ld.data[i * 4 + 2] = v * 0.9; ld.data[i * 4 + 3] = 255;
      }
      lx.putImageData(ld, 0, 0); lc.style.opacity = '1';
    } else lc.style.opacity = '0';
  } else { dc.style.opacity = '0'; gc.style.opacity = '0'; lc.style.opacity = '0'; }
  // the mouth (debug only: in play grit is heard in the lick's crackle and told by a sensory line, dryness by the lick's colour and a line; no bar)
  const mg = $('#mouthGauge').getContext('2d'); mg.clearRect(0, 0, 260, 8);
  if (G.phase === 'loop' && S.debug) { mg.fillStyle = 'rgba(210,170,120,.8)'; mg.fillRect(0, 0, 260 * G.grit, 3); mg.fillStyle = 'rgba(220,220,235,.6)'; mg.fillRect(0, 5, 260 * G.dry, 3); }
  // marks: kisses fade where the lips were; the zone marker; debug
  const mc = $('#markC'); if (mc.width !== innerWidth) { mc.width = innerWidth; mc.height = innerHeight; }
  const mx = mc.getContext('2d'); mx.clearRect(0, 0, mc.width, mc.height);
  G.marks = G.marks.filter((q: Any) => performance.now() - q.born < 2200);
  for (const q of G.marks) { const al = 1 - (performance.now() - q.born) / 2200; const g = mx.createRadialGradient(q.x, q.y, 0, q.x, q.y, 30); g.addColorStop(0, `rgba(255,150,140,${(0.35 * al).toFixed(3)})`); g.addColorStop(1, 'rgba(255,150,140,0)'); mx.fillStyle = g; mx.beginPath(); mx.arc(q.x, q.y, 30, 0, Math.PI * 2); mx.fill(); }
  // setting up (not playing): a dashed line down the middle of the screen; with two feet, move "her right / left foot x" until that shoe sits on it
  if (G.phase === 'idle' || G.phase === 'mark') { mx.save(); mx.setLineDash([6, 6]); mx.strokeStyle = 'rgba(216,228,255,.45)'; mx.lineWidth = 1; mx.beginPath(); mx.moveTo(innerWidth / 2 + (r ? (S.fit[slotKey()].x ?? 0) * innerWidth : 0), 0); mx.lineTo(innerWidth / 2 + (r ? (S.fit[slotKey()].x ?? 0) * innerWidth : 0), innerHeight); mx.stroke(); mx.restore();
    if (twoFeet()) { mx.fillStyle = 'rgba(216,228,255,.75)'; mx.font = '12px "IBM Plex Mono"'; mx.fillText(`framing her ${G.foot} foot`, innerWidth / 2 + 8, 24); } }
  if (r && (S.debug || MARK.on)) {
    const rad = zoneRadii(r), zz = MARK.on ? MARK.pts : zonesNow();
    for (const [k, p] of Object.entries(zz) as Array<[string, number[]]>) {
      const live = MARK.on && MARK.drag && k === MARK.names[MARK.i];
      const ex = live ? Math.max(6, MARK.drag.rx ?? 6) : p[2] !== undefined ? p[2] * r.h : (rad[k]?.rx ?? 10), ey = live ? Math.max(6, MARK.drag.ry ?? 6) : p[3] !== undefined ? p[3] * r.h : ex;
      const er = ((live ? MARK.drag.rot ?? 0 : p[4] ?? 0) * Math.PI) / 180 * (mirrored() ? -1 : 1);
      const cxp = r.x + (mirrored() ? 1 - p[0]! : p[0]!) * r.w, cyp = r.y + p[1]! * r.h;
      mx.strokeStyle = k === G.want ? 'rgba(140,255,170,.8)' : 'rgba(216,228,255,.55)'; mx.lineWidth = k === G.want ? 2 : 1; mx.beginPath(); mx.ellipse(cxp, cyp, ex, ey, er, 0, Math.PI * 2); mx.stroke();
      mx.fillStyle = 'rgba(216,228,255,.8)'; mx.font = '12px "IBM Plex Mono"'; mx.fillText(k, cxp + 10, cyp + 4);
    }
  }
  if (S.debug && s) {
    $('#debug').textContent = `${G.foot} ${G.surface} · dirt ${(dirtLeft() * 100).toFixed(0)} %${view() === 'close' ? ` · shine ${(meanGloss(s) * 100).toFixed(0)} %` : ''} · she wants ${G.want ?? '—'}\n`
      + `mouth: dry ${G.dry.toFixed(2)} grit ${G.grit.toFixed(2)} · her attention ${G.attention}\n`
      + `surface ${(G.surfT / 1000).toFixed(0)} / ${(G.surfLen / 1000).toFixed(0)} s · grain ${ST()!.grain > 0 ? 'toward the toe' : 'toward the heel'}\n`
      + (s ? s.names.map((z: string) => { const q = zoneStat(z, s); return `${z}: dirt ${(q.dirt * 100).toFixed(0)}${leatherNow().includes(z) ? ` shine ${(q.gloss * 100).toFixed(0)}` : ''}`; }).join('  ') : '');
  }
}

/* ---------- gestures (foot service's classifier: a press held = a kiss; scrubbing or a straight drag = a stroke) ---------- */
function down(x: number, y: number) {
  if (MARK.on) { markDown(x, y); return; }
  if (G.phase !== 'loop' || !onShoe(x, y)) return;
  G.gest = { x0: x, y0: y, x, y, t0: G.t, len: 0, rev: 0, lastA: null, lastT: performance.now(), kind: null };
}
function move(x: number, y: number, e?: Any) {
  if (MARK.on) { markMove(x, y, e.shiftKey); return; }
  const g = G.gest; if (!g) return;
  const dx = x - g.x, dy = y - g.y, d = Math.hypot(dx, dy); if (d < 0.5) return;
  const nowp = performance.now(), dtm = Math.max(1, nowp - g.lastT); g.lastT = nowp;
  g.len += d;
  const ax = x - (g.ax ?? g.x0), ay = y - (g.ay ?? g.y0);
  if (Math.hypot(ax, ay) >= 6) { const an = Math.atan2(ay, ax); if (g.lastA !== null) { let da = an - g.lastA; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; if (Math.abs(da) > 2.2) g.rev += 1; } g.lastA = an; g.ax = x; g.ay = y; }
  if (!g.kind && (g.len > 40 || g.rev >= 1)) g.kind = 'lick';
  const speed = d / dtm * 1000; g.speed = lerp(g.speed ?? speed, speed, 0.2);
  if (g.kind === 'lick') {
    const res = lickStroke(g.x, g.y, x, y, g.speed);
    const s = surf(); if (res.removed > 0) G.grit = clamp(G.grit + res.removed * 0.00035 * D()!.grit, 0, 1);
    G.dry = clamp(G.dry + d * 0.0011 * (res.removed > 0 ? D()!.dry : 0.6), 0, 1);
    lickTick(g.speed);
    if (res.polished > 0) { g.polish = (g.polish ?? 0) + res.polished; if (Math.random() < 0.06) SFX.squeak(); }
    if (res.withGrain) g.grainLen = (g.grainLen ?? 0) + d;
  }
  g.x = x; g.y = y;
}
function up() {
  if (MARK.on) { markUp(); return; }
  const g = G.gest; if (!g) return; G.gest = null; lickStop();
  if (!g.kind && g.len < 12 && (G.t - g.t0) >= 300) {
    // a kiss
    SFX.kiss(); G.stats.kisses += 1; G.marks.push({ x: g.x0, y: g.y0, born: performance.now() });
    if (G.kissWanted && G.t - G.kissWanted < 8000) { G.kissWanted = 0; if (Math.random() < 0.5) sayL('good'); }
    return;
  }
  if (g.kind === 'lick') { G.stats.strokes += 1; if ((g.grainLen ?? 0) > g.len * 0.5) G.stats.withGrain += 1; if ((g.polish ?? 0) > 0.5) G.stats.polishStrokes += 1; }
}
/** The zone marker is chunk (f)'s: off here (the prototype's `MARK` is read by `render` and the gestures). */
const MARK: Any = { on: false, i: 0, names: [], pts: {} };
const markDown = (_x: number, _y: number): void => {}, markMove = (_x: number, _y: number, _c: boolean): void => {}, markUp = (): void => {};
/** The prototype's `ASSETS.her` (her sprite as the stand-in picture): none here, the instrument draws only with both pictures (README). */
const ASSETS = { her: '' };
/** The prototype's `SPRITE` stand-in: never loaded (a missing picture is the card's, not a stand-in's). */
let SPRITE: HTMLImageElement = { naturalWidth: 0, naturalHeight: 0 } as HTMLImageElement;

/* =====================================================================================================================================
 * The wiring (no prototype code below): the run, the plan's attention, the reports, her answer to a spit, the lines, the mount and its end.
 * ===================================================================================================================================== */

interface Seg { n: number; startedAt: number; clock0: number; beats: number; endMs: number; flushed: boolean; reported: number }
interface Wiring {
  run: PhysicsRun | null;
  lineStyle: string;
  /** P15b: her manner axes (null: none, so her row is the prototype's). */
  manner: RowAxes | null;
  seg: Seg | null;
  running: boolean;
  plan: PlannedBeat[];
  /** Each surface's dirt (sum of its mask) and each zone's at the last report: what a beat wiped is the difference. */
  sums: Record<string, { total: number; zones: number[] }>;
  /** The qualities of the surfaces she judged (`verdict`'s `G.lastQuality`), for her verdict on the session. */
  qualities: number[];
  checks: number;
  verdictSent: boolean;
  ox: number; oy: number;
  lastNow: number;
  ended: string | null;
}
const R: Wiring = { run: null, lineStyle: 'neutral', manner: null, seg: null, running: false, plan: [], sums: {}, qualities: [], checks: 0, verdictSent: false, ox: 0, oy: 0, lastNow: 0, ended: null };
/** Pictures that failed to load (by url): the instrument is not drawn for them again (the card plays). Module memory, kept across mounts. */
const broken = new Set<string>();
onStageReset(() => broken.clear()); // e10 M5: a chat switch forgets them (a replaced file at the same url is tried again)

/** Her attention now: the plan's on the beat being played (P15a's, by her activity and her style); between segments, as it was. */
function planAttention(): string {
  const b = beatNow();
  return R.running ? R.plan[b]?.attention ?? G.attention : G.attention;
}
/** The beat of the running segment at the loop's clock. */
function beatNow(): number {
  const seg = R.seg;
  if (!seg) return 0;
  return clamp(Math.floor((G.t - seg.clock0) / TUNING.physics.beatMs), 0, seg.beats - 1);
}
function report(i: SegmentInput, pointer: boolean): void {
  if (!E || !R.seg || !R.running) return;
  E.env.staging.input(i, { pointer });
}
/**
 * Ruling AC: whether she saw the spit is the engine's, decided now (`physics/spit`: one draw with the prototype's chance by her attention on
 * the beat, or by the attention shown while the run is held); `chance` is the prototype's own number, which the engine's table repeats.
 */
function spitSeen(_chance: number): boolean {
  if (!E) return false;
  const events = E.env.staging.spit?.(beatNow(), G.attention) ?? [];
  return events.some((e) => e.type === 'physics_caught');
}
/** A surface's dirt and its zones' (the sums of its mask). */
function sumsOf(s: Any): { total: number; zones: number[] } {
  const zones = new Array<number>(s.names.length).fill(0);
  let total = 0;
  for (let p = 0; p < s.m.length; p++) { total += s.m[p]; if (s.zoneOf[p] >= 0) zones[s.zoneOf[p]] += s.m[p]; }
  return { total, zones };
}
/**
 * What the surfaces' masks lost since the last report: the share of the whole footwear's dirt (each surface a quarter) and the zone wiped most.
 * Only what falls below the lowest level a surface (and a zone) has reached counts (e10 M1): fresh dirt (a cruel holder's, after a spit she saw)
 * wiped again is not counted twice.
 */
function wipedNow(): { amount: number; part?: string } {
  let amount = 0, part: string | undefined, best = 0;
  for (const [key, s] of Object.entries(G.surfaces) as Array<[string, Any]>) {
    if (!s || !(s.total0 > 0)) continue;
    const now = sumsOf(s), low = R.sums[key] ?? now;
    const lost = low.total - now.total;
    if (lost > 0) amount += lost / s.total0 / 4;
    now.zones.forEach((z, i) => { const d = (low.zones[i] ?? z) - z; if (d > best) { best = d; part = s.names[i]; } });
    R.sums[key] = { total: Math.min(low.total, now.total), zones: now.zones.map((z, i) => Math.min(low.zones[i] ?? z, z)) };
  }
  return { amount, ...(part !== undefined ? { part } : {}) };
}
/** A surface just made: its dirt as it lies before the first stroke (read after the frame that made it; strokes come between frames). */
function noteSurfaces(): void {
  for (const [key, s] of Object.entries(G.surfaces) as Array<[string, Any]>) if (s && R.sums[key] === undefined) R.sums[key] = sumsOf(s);
}
/** A beat ended: what it wiped (one `wipe` a beat, nothing for a beat that wiped nothing). */
function reportBeat(beat: number): void {
  const w = wipedNow();
  const amount = Math.round(w.amount * 1e5) / 1e5;
  if (amount > 0) report({ beat, kind: 'wipe', amount, ...(w.part !== undefined ? { part: w.part } : {}) }, true);
}
/** A running segment the loop has not met yet: its beats on the loop's clock. */
function startSegment(run: PhysicsRun, ck: { startedAt: number | null; now: number }): void {
  const plan = run.segment.plan!;
  const phys = E!.env.registries.contactPhysics.get(run.physicsId);
  const endMs = segmentSecondsOf(E!.env.state(), E!.env.registries, run, 40) * 1000 /* P15b: her tempo moves the segment, as it moves the plan's beats */;
  const clock0 = G.t - (ck.now - ck.startedAt!);
  const first = Math.max(0, Math.floor((G.t - clock0) / TUNING.physics.beatMs));
  R.seg = { n: run.segment.n, startedAt: ck.startedAt!, clock0, beats: plan.beats.length, endMs, flushed: false, reported: Math.min(first, plan.beats.length) };
  R.plan = plan.beats;
  // Ruling AD: what was wiped while the run was held is not lost: the first beat reported carries it (the gauge keeps following the mask)
}
/** Her lines (cardVoice `shoe.*` by her style) in the prototype's `LINES` shape. */
function refreshLines(): void {
  if (!E) return;
  const env = E.env;
  const own = (k: string): string[] => [...voiceLines(env.registries, `shoe.${k}` as VoiceKind, R.lineStyle)];
  LINES = { [S.style]: Object.fromEntries(LINE_KINDS.map((k) => [k, own(k)])) };
}
/** Her verdict on the session (R27): the mean quality of the surfaces she judged; none judged, none given. */
function sendVerdict(): void {
  if (!E || R.verdictSent || !R.run) return;
  R.verdictSent = true;
  if (R.qualities.length === 0) return;
  const q = R.qualities.reduce((a, b) => a + b, 0) / R.qualities.length;
  const v = verdictOf(q);
  E.env.staging.service?.(R.run.id, v); // open: rated and ended; ended `checked` by the engine first: rated by its id (the scene's `shoeDone`)
}

/** Each frame before the prototype's: the size, the still form, the sound, the backdrop, the segment and its reports. */
function before(now: number): void {
  const e = E!;
  if (last > now) last = now;
  if (R.lastNow > now) R.lastNow = now;
  const r = e.env.root.getBoundingClientRect();
  const w = e.env.root.clientWidth || r.width || globalThis.innerWidth || 0, h = e.env.root.clientHeight || r.height || globalThis.innerHeight || 0;
  if (w !== innerWidth || h !== innerHeight) { innerWidth = w; innerHeight = h; }
  R.ox = r.left; R.oy = r.top;
  S.reduced = e.env.reduced;
  e.box.toggleAttribute('data-reduced', S.reduced);
  e.box.toggleAttribute('data-readable', e.env.readable);
  if (!A.ctx) { audioInit(); if (A.ctx) loadSamples(); }
  const bg = e.env.layers.backdrop.style.backgroundImage;
  const mine = e.els['#backdrop']!;
  if (bg !== mine.style.backgroundImage) mine.style.backgroundImage = bg;
  // the session begins once both pictures have loaded (the prototype's are there before it begins); a failed one leaves the frame to the card
  if (G.phase === 'wait' && Object.values(imgs).length > 0 && Object.values(imgs).every((i) => i.naturalWidth > 0)) begin();
  const run = R.run;
  const ck = e.env.staging.clock();
  R.running = run !== null && run.segment.state === 'running' && run.segment.plan !== undefined && ck.startedAt !== null;
  if ((G.phase === 'loop' || G.phase === 'inspect') && R.running && (R.seg === null || R.seg.n !== run!.segment.n || R.seg.startedAt !== ck.startedAt)) startSegment(run!, ck);
  const seg = R.seg;
  if (R.running && seg && !seg.flushed) {
    const passed = Math.floor((G.t - seg.clock0) / TUNING.physics.beatMs);
    while (seg.reported < Math.min(passed, seg.beats)) reportBeat(seg.reported++);
    if (G.t - seg.clock0 >= seg.endMs - 300) {
      seg.flushed = true;
      if (seg.reported < seg.beats) reportBeat(Math.min(seg.reported, seg.beats - 1));
      seg.reported = seg.beats;
    }
  }
}
/** After the prototype's frame: the surfaces made, her judged surfaces, her verdict at the session's end. */
function after(now: number): void {
  if (!E) return;
  R.lastNow = now;
  noteSurfaces();
  while (R.checks < G.stats.checks.length) { R.checks += 1; R.qualities.push(G.lastQuality); }
  if (G.phase === 'done' && !R.verdictSent && R.ended === null) sendVerdict();
}

/** The art of her footwear: both pictures (the top and the sole), or null (the card plays). */
function artOf(env: InstrumentEnv, run: PhysicsRun): { close: ArtPicture; sole: ArtPicture; kind: string } | null {
  const kind = footwearOf(env.state(), env.registries, run.holderId);
  const close = env.art.get(run.holderId, `shoe_close.${kind}` as never);
  const sole = env.art.get(run.holderId, `shoe_sole.${kind}` as never);
  if (!close || !sole || broken.has(close.url) || broken.has(sole.url)) return null;
  return { close, sole, kind };
}
/** Whether the instrument can draw this run: both pictures of her footwear exist and none has failed to load (else the card, README). */
export function shoeDrawable(env: InstrumentEnv, run: PhysicsRun): boolean {
  return artOf(env, run) !== null;
}

/** A picture's sidecar into the prototype's settings: feet, the foot shown, the fit (`height` → `h`), the zones. */
function fitFrom(key: string, pic: ArtPicture): void {
  const sc = pic.sidecar;
  if (sc.feet === 'one' || sc.feet === 'two') S.feet[key] = sc.feet;
  if (sc.shown === 'left' || sc.shown === 'right') S.shown[key] = sc.shown;
  const f = sc.fit ?? {};
  const was = S.fit[key];
  S.fit[key] = { h: f.height ?? was.h, y: f.y ?? was.y, x: f.x ?? was.x, fade: f.fade ?? was.fade, xr: f.xr ?? was.xr, xl: f.xl ?? was.xl };
  if (sc.zones) S.zones[key] = sc.zones; else delete S.zones[key];
}
/** Binds the run: her footwear and its pictures, the dirt of her day, her style and her lines, her look. */
function bind(env: InstrumentEnv, run: PhysicsRun, art: { close: ArtPicture; sole: ArtPicture; kind: string }): void {
  const state: CampaignState = env.state();
  const reg: Registries = env.registries;
  reseed(fnv1a(`${state.scene?.id ?? ''}|${run.id}|shoe`));
  S.kind = art.kind;
  S.dirt = dirtOfDay(state, reg, run.holderId);
  const lead = leadStyle(physicsStyleOf(state, run.holderId, reg));
  S.style = lead.key;
  R.lineStyle = lead.key;
  R.manner = physicsMannerOf(state, run.holderId, reg);
  R.run = run;
  R.seg = null; R.running = false; R.plan = []; R.sums = {}; R.qualities = []; R.checks = 0; R.verdictSent = false; R.ended = null;
  S.feet = { boots_close: 'one', boots_sole: 'one', heels_close: 'one', heels_sole: 'one' };
  S.shown = { boots_close: 'right', boots_sole: 'right', heels_close: 'right', heels_sole: 'right' };
  S.fit = { boots_close: { h: 0.68, y: 0.48, x: 0, fade: 0.25, xr: 0.38, xl: 0.62 }, boots_sole: { h: 0.78, y: 0.5, x: 0, fade: 0.2, xr: 0.38, xl: 0.62 }, heels_close: { h: 0.68, y: 0.48, x: 0, fade: 0.25, xr: 0.38, xl: 0.62 }, heels_sole: { h: 0.78, y: 0.5, x: 0, fade: 0.2, xr: 0.38, xl: 0.62 } };
  S.zones = {};
  fitFrom(`${art.kind}_close`, art.close);
  fitFrom(`${art.kind}_sole`, art.sole);
  for (const [side, pic] of [['close', art.close], ['sole', art.sole]] as const) {
    const im = new Image();
    im.alt = '';
    im.onerror = () => { broken.add(pic.url); if (E?.env === env) { E.box.dataset.broken = ''; env.redraw?.(); } }; // e10 M4: the card takes the run at once
    im.src = pic.url;
    imgs[`${art.kind}_${side}`] = im;
  }
  refreshLines();
  const look = env.her(run.holderId);
  E!.box.style.setProperty('--alius-her', look.accent);
  if (look.hand !== '') E!.box.style.setProperty('--alius-font-hand', `"${look.hand}", var(--alius-font-type)`);
  E!.box.style.setProperty('--alius-shoe-hand-scale', String(look.handScale || 1));
}

function build(env: InstrumentEnv): ShoeEls {
  const box = globalThis.document.createElement('div');
  box.className = 'alius-shoe';
  box.setAttribute('aria-hidden', 'true'); // as the effects layer it lives in: the play surface; the stop word and the field are the scene's
  const els: Record<string, HTMLElement> = {};
  const el = (id: string, parent: HTMLElement, tag = 'div'): HTMLElement => {
    const n = tag === 'canvas' ? safeCanvas() : globalThis.document.createElement(tag);
    n.className = `alius-shoe-${id}`; els[`#${id}`] = n; parent.append(n); return n;
  };
  const world = el('world', box);
  el('backdrop', world);
  el('shade', box);
  const wrap = el('shoeWrap', box);
  const pic = el('shoe', wrap, 'img') as HTMLImageElement;
  pic.alt = ''; pic.draggable = false;
  el('dirtC', wrap, 'canvas'); el('glossC', wrap, 'canvas'); el('lightC', wrap, 'canvas');
  el('markC', box, 'canvas');
  el('vig', box);
  el('hand', box);
  env.layers.effects.append(box);
  return { env, box, els, frameId: null };
}

/**
 * The listeners of the prototype's page, on the scene: a press on the frame (her footwear) is the tongue or a kiss, the right button spits;
 * Space swallows and X spits, never from the field or a control (typed there they are letters: ruling O); Escape and H are the scene's.
 */
function listen(env: InstrumentEnv): void {
  const control = (t: EventTarget | null): boolean => t instanceof Element && t.closest('button, a, [role="button"], select, [data-action]') !== null;
  const onFrame = (t: EventTarget | null): boolean => t instanceof Node && (t === env.layers.frame || env.layers.frame.contains(t));
  const typing = (t: EventTarget | null): boolean => t instanceof HTMLElement && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable);
  const at = (e: PointerEvent): [number, number] => [e.clientX - R.ox, e.clientY - R.oy];
  env.listen(env.root, 'pointerdown', ((e: PointerEvent) => {
    if (!onFrame(e.target)) return;
    if (e.button === 2) { e.preventDefault(); spit(); return; }
    if (e.button !== 0) return;
    const [x, y] = at(e);
    down(x, y);
  }) as EventListener);
  env.listen(globalThis.document, 'pointermove', ((e: PointerEvent) => { const [x, y] = at(e); move(x, y, e); }) as EventListener);
  env.listen(globalThis.document, 'pointerup', (() => up()) as EventListener);
  env.listen(env.layers.frame, 'contextmenu', ((e: Event) => e.preventDefault()) as EventListener);
  env.listen(globalThis.document, 'keydown', ((e: KeyboardEvent) => {
    if (typing(e.target) || control(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ') { e.preventDefault(); if (!e.repeat) swallow(); }
    if (e.key === 'x' || e.key === 'X') { spit(); }
  }) as EventListener);
}

function stopShoe(): void {
  const e = E;
  if (!e) return;
  if (e.frameId !== null) e.env.cancelRaf(e.frameId);
  try { A.master?.disconnect(); } catch { /* not connected */ }
  A = { ctx: null, buf: {} };
  LICK = null;
  e.box.remove();
  for (const k of Object.keys(imgs)) { imgs[k]!.onload = null; imgs[k]!.onerror = null; delete imgs[k]; }
  shownSrc = null;
  DETACHED.clear();
  R.run = null; R.seg = null; R.running = false; R.plan = []; R.sums = {};
  LINES = { neutral: {} };
  G = fresh();
  E = null;
}

/** The instrument's own summary of a run (UI only, R28: the model's sentence is the engine's tally). */
export function digest(): { kind: string; dirt: string; stats: Any; ended: string | null } {
  return { kind: S.kind, dirt: S.dirt, stats: { ...G.stats, checks: [...G.stats.checks] }, ended: R.ended };
}

/** How long the end plays: her last line (the prototype's `say` stays 2600 ms). */
export const EXIT_MS = 2600;

/** Starts the instrument on a run (the host's `start`). */
export function startShoe(env: InstrumentEnv, run: PhysicsRun): InstrumentRun {
  stopShoe();
  const art = artOf(env, run);
  if (!art) throw new Error('shoe service: no pictures of her footwear'); // the host draws the card (shoeDrawable said so first)
  E = build(env);
  { const r = env.root.getBoundingClientRect(); innerWidth = env.root.clientWidth || r.width || 0; innerHeight = env.root.clientHeight || r.height || 0; R.ox = r.left; R.oy = r.top; }
  bind(env, run, art);
  listen(env);
  last = env.now(); R.lastNow = last;
  audioInit();
  if (A.ctx) loadSamples();
  G = fresh();
  G.phase = 'wait'; // `before` begins the session once her pictures are there
  requestAnimationFrame(frame);
  const mine = E;
  return {
    update(next: PhysicsRun) {
      if (E !== mine) return;
      R.run = next;
    },
    finish(end: PhysicsEnd): number {
      if (E !== mine) return 0;
      R.ended = end.result;
      if (G.phase === 'done') return EXIT_MS; // her verdict ended it: her last line plays out
      if (end.result !== 'checked' || G.phase === 'wait') return 0;
      // the engine's check (≤ 10) ended the cleaning first: she judges the surface in front of her, says her end and gives her verdict
      if ((G.phase === 'loop' || (G.phase === 'inspect' && !G.judged)) && surf()) verdict(); // e10 M6: a surface not yet judged is judged now
      while (R.checks < G.stats.checks.length) { R.checks += 1; R.qualities.push(G.lastQuality); }
      finish('done');
      sendVerdict();
      return EXIT_MS;
    },
    stop() {
      if (E === mine) stopShoe();
    },
  };
}

/** Shoe service by field (`isShoeRun`: an order on a dirt gauge from a contact on her footwear), alone (a second physics is the card's). */
export function shoeMatches(run: PhysicsRun, _state: CampaignState, reg: Registries): boolean {
  return isShoeRun(run, reg) && !run.second;
}

registerInstrument({ id: 'shoe', matches: shoeMatches, drawable: shoeDrawable, start: startShoe });

/** Tests and the shots only: the prototype's state and hooks (its `window.__S`, `__G`, `__begin`, `__swallow`, `__spit`, `__inspect`). */
export const _shoe = {
  ST,
  get G(): Any { return G; },
  get S(): Any { return S; },
  get R(): Wiring { return R; },
  get LINES(): Record<string, Record<string, string[]>> { return LINES; },
  /** Tests: her pictures as the instrument loads them (`boots_close`, …). */
  get imgs(): Record<string, HTMLImageElement> { return imgs; },
  begin, swallow, spit, inspect, verdict, update, render, shoeRect, toPic, zonesNow, leatherNow, zoneStat, lickStroke, makeSurface, ensureSurface, dirtLeft, meanGloss,
  nextSurface, nextWant, herMove, down, move, up, fresh, digest, twoFeet, mirrored, footX,
  setG(g: Any): void { G = g; },
  seed(n: number): void { reseed(n); },
  /** The shots: the frame clock starts again (a fake clock installed after the page began). */
  resetClock(): void { last = E ? E.env.now() : 0; R.lastNow = last; },
  /** Tests: the stand-in picture (the prototype's `SPRITE`), for a page with no art loaded. */
  sprite(img: HTMLImageElement): void { SPRITE = img; },
};
