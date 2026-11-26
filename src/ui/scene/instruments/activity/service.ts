/**
 * P10e-e Task 26: foot service under the desk (`docs/prototypes/her_activity.html`, the game inside `service`, normative; README "The game
 * inside `service`"). It runs inside her frame (Task 24) when the commander is under her desk with her foot within reach: her signal chooses
 * the act, the act is a craft played by gestures on her foot (a kiss, cleaning with the dry mouth and the swallow, a rub), in bouts between
 * the frame's stillness; the close-up of her sole, the dirt on it, the warm marks of kisses, her foot leaning toward the lips or away.
 *
 * The functions are the prototype's, copied (types added); the frame's `fidelity.json` lists them beside the frame's and declares the
 * differences. The wiring:
 * - `G`, `S`, `A` and the frame's helpers (`after`, `sense`, `say`, `play`, `noise`, `coverNow`, `callHeard`, `visitorHeard`, `clockText`,
 *   `pick`, `rand`, `ACT`, the mouse and the attention, `setStyle`, the elements) are the frame's, given at its mount (`attachService`);
 *   `Math.random` is the frame's xorshift (no rng draw), `performance` its clock;
 * - her signals are the engine's (`signalsOf`: hers, by `fnv1a`), her pace (patience, kiss, tempo, how often, grain, order of zones) the
 *   engine's reading of her style and her profile (`servicePaceOf`, P15 `how`): hidden, never shown; the bout a signal uses is hashed with the
 *   day and the scene (the prototype's salt per run);
 * - her lines are `cardVoice` `service.good|poor|wrong` by style and `service.zone.<zone>` (the prototype's `SVC_LINES` and `ZONE_WORDS`,
 *   verbatim: Rulings Q and Z);
 * - the close-up's picture is the art slot `sole_close` (its sidecar's `fit { height, y }` and `zones`), else her raised foot
 *   (`legs_seated.foot_raised`), else her sprite; without a sidecar the automatic zones (`DEFAULT_ZONES`);
 * - the sounds of the craft matter only to a third party (Ruling AB: `thirdPartyNoise`, the prototype's, the call and an unaware visitor
 *   hearing them through `callHeard` / `visitorHeard`); she expects them, so nothing of them reaches the engine;
 * - her verdict at the session's end is `physics/service` (`verdictOf` of the mean quality of the crafts she judged, R27); the stop word
 *   gives none;
 * - not ported: the zone marker (chunk f), the panel's test tools (`bouts`, the act buttons, `S.only`), the debug readout.
 */
import type { Registries } from '../../../../content/types';
import { contentAllowed } from '../../../../engine/bonds/content';
import { fnv1a } from '../../../../engine/hub';
import { frameOf } from '../../../../engine/physics/presence';
import { signalsOf, verdictOf, type ServicePace } from '../../../../engine/physics/service';
import type { PhysicsRun } from '../../../../engine/physics/state';
import { practiceLive } from '../../../../engine/practice/gate';
import type { CampaignState } from '../../../../engine/state/types';
import { voiceLines, type VoiceKind } from '../../cards/voice';
import { clamp, lerp, smooth } from '../kit/math';
import type { InstrumentEnv } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

/** What the frame gives the service at its mount: its state and helpers (the prototype's globals of her_activity.html). */
export interface ServiceCtx {
  env: InstrumentEnv;
  holderId: string;
  runId: string;
  pace: ServicePace;
  G: () => Any;
  S: Any;
  A: () => Any;
  ACT: () => Any;
  MOUSE: { x: number; y: number };
  ATT: { x: number; y: number };
  after(ms: number, fn: () => void): void;
  sense(text: string, where?: Any, cls?: string): void;
  say(text: string, to?: string, opts?: Any): void;
  play(id: string, opts?: Any): Any;
  noise(o: Any): void;
  coverNow(): number;
  callHeard(): void;
  visitorHeard(): void;
  clockText(m: number): string;
  pick<T>(a: readonly T[]): T;
  rand(a: number, b: number): number;
  random(): number;
  now(): number;
  setStyle(sel: string, prop: string, v: string): void;
  els: Record<string, HTMLElement>;
}
let X: ServiceCtx | null = null;

/* ---------- the prototype's globals, as the frame has them ---------- */
const G: Any = new Proxy({}, { get: (_t, k) => X?.G()[k as string], set: (_t, k, v) => { if (X) X.G()[k as string] = v; return true; } });
const S: Any = new Proxy({}, { get: (_t, k) => X?.S[k as string], set: (_t, k, v) => { if (X) X.S[k as string] = v; return true; } });
const A: Any = new Proxy({}, { get: (_t, k) => X?.A()[k as string] });
const ACT = (): Any => X!.ACT();
const MOUSE: Any = new Proxy({}, { get: (_t, k) => (X?.MOUSE as Any)?.[k as string] });
const ATT: Any = new Proxy({}, { get: (_t, k) => (X?.ATT as Any)?.[k as string] });
const after = (ms: number, fn: () => void) => X?.after(ms, fn);
const sense = (text: string, where?: Any, cls?: string) => X?.sense(text, where, cls);
const say = (text: string, to?: string, opts?: Any) => X?.say(text, to, opts);
const play = (id: string, opts?: Any) => X?.play(id, opts);
const noise = (o: Any) => X?.noise(o);
const coverNow = (): number => X?.coverNow() ?? 0;
const callHeard = () => X?.callHeard();
const visitorHeard = () => X?.visitorHeard();
const clockText = (m: number): string => X?.clockText(m) ?? '';
const pick = <T>(a: readonly T[]): T => X!.pick(a);
const rand = (a: number, b: number) => X!.rand(a, b);
const setStyle = (sel: string, prop: string, v: string) => X?.setStyle(sel, prop, v);
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const performance = { now: (): number => (X ? X.now() : 0) };
const Math: typeof globalThis.Math = Object.create(globalThis.Math, { random: { value: () => (X ? X.random() : 0.5) } });
const $ = (s: string): Any => X!.els[s] ?? X!.els['#void'];
/** The scene's size (the frame's `innerWidth` / `innerHeight`), set by the frame each frame. */
let innerWidth = 0, innerHeight = 0;
export function serviceSize(w: number, h: number): void { innerWidth = w; innerHeight = h; }
/** A canvas whose context never fails (jsdom has none; a picture that taints the canvas reads as transparent): the service still runs. */
function safeCanvas(): HTMLCanvasElement {
  const c = globalThis.document.createElement('canvas');
  const real = c.getContext.bind(c) as (k: string) => Any;
  let ctx: Any = null;
  (c as Any).getContext = (k: string) => {
    if (ctx) return ctx;
    const r = real(k);
    const noop = (): void => {};
    ctx = r ?? new Proxy({ canvas: c }, { get: (t: Any, p) => (p in t ? t[p] : p === 'createImageData' || p === 'getImageData' ? (_a: number, _b: number, w?: number, h?: number) => ({ data: new Uint8ClampedArray(Math.max(0, (w ?? _a) * (h ?? _b) * 4) || 0) }) : p === 'createRadialGradient' || p === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop), set: () => true });
    if (r) { const gid = r.getImageData.bind(r); r.getImageData = (x: number, y: number, w: number, h: number) => { try { return gid(x, y, w, h); } catch { return { data: new Uint8ClampedArray(w * h * 4) }; } }; }
    return ctx;
  };
  return c;
}
/** `makeDirt`'s canvases (the prototype's `document.createElement('canvas')`), safe. */
const document = { createElement: (_tag: 'canvas'): HTMLCanvasElement => safeCanvas() };

/** Her lines (`cardVoice` `service.*` by her style, neutral's for a style the prototype has none of; `null` when there are none). */
const lines = (kind: string): string[] | null => { const l = [...voiceLines(X!.env.registries, `service.${kind}` as VoiceKind, S.style)]; return l.length ? l : null; };

/* ---------- the game inside: FOOT SERVICE under the desk (P10e §15 "Foot service under the desk"). Her signal chooses the act, the act is
   a craft played by gestures on her foot. Bouts between waiting (the frame's stillness goes on between them). Under the desk the signal is
   read on legs_seated (rest / foot_raised); a foot act closes the camera in on sole_close (the zones come from its sidecar of points). ---------- */
export const svcOn = () => !!X && S.inner === 'service';
/* the motions of her foot: what is seen or felt, the picture used under the desk, its sound */
export const MOTIONS = {
  tap2:  { words: 'two taps', felt: 'Two taps of her foot on your shoulder.', up: true },
  sole:  { words: 'my sole to your face', felt: 'She lifts her sole to your face.', up: true },
  push:  { words: 'a push', felt: 'Her foot pushes at you, once.', up: true },
  hook:  { words: 'my foot hooked', felt: 'Her foot hooks behind your neck and tugs.', up: true },
  point: { words: 'my toe pointing', felt: 'Her toe points, and waits.', up: true },
  stamp: { words: 'a stamp', felt: 'She stamps once, beside your knee.', up: false },
  nudge: { words: 'a nudge', felt: 'A nudge of her foot against your knee.', up: false },
} as Record<string, { words: string; felt: string; up: boolean }>;
/* what a signal means; the first three raise her foot to the commander's face (the close-up) */
export const MEANINGS = { kiss: { foot: true, words: 'kiss' }, clean: { foot: true, words: 'clean' }, rub: { foot: true, words: 'rub' }, closer: { words: 'closer' }, still: { words: 'still' }, enough: { words: 'enough' } } as Record<string, { foot?: boolean; words: string }>;
/** Her zones' words (`cardVoice` `service.zone.<zone>`, the prototype's `ZONE_WORDS`). */
const ZONE_WORDS: Record<string, string> = new Proxy({}, { get: (_t, k) => voiceLines(X!.env.registries, `service.zone.${String(k)}` as VoiceKind, undefined)[0] ?? `${String(k)}.` });
export const DEFAULT_ZONES = { toes: [0.5, 0.14], ball: [0.5, 0.33], arch: [0.47, 0.56], heel: [0.5, 0.84], edge: [0.28, 0.55] } as Record<string, number[]>;
/** Her pace (the engine's `servicePaceOf`): her patience, her kiss, her tempo, how often (the prototype's `SVC_STYLE` row, her profile). */
const SS = () => X!.pace;
/* her verdicts by quality, by style (said only by `with` and `glancing`) */
const SL = (): Any => new Proxy({}, { get: (_t, k) => lines(String(k)) });
/* her five pairs of motion → meaning (the three foot acts always among them), and her preferred order of the zones (her `how`) */
function herSignals() {
  return signalsOf(X!.env.state(), X!.holderId);
}
const herOrder = (act: string) => X!.pace.order[act as keyof ServicePace['order']];
const herGrain = () => X!.pace.grain; // 1: toes to heel, -1: heel to toes

export let SV: Any = null;
function svFresh() {
  return { salt: fnv(`${X!.env.state().day}|${X!.env.state().scene?.id ?? ''}`), phase: 'wait', next: 14000, sig: null, named: new Set(), sigAt: 0, deadline: 0, closeK: 0, closeTarget: 0, boutEnd: 0, act: null,
    want: null, wantAt: 0, orderI: 0, dry: 0, quality: 0, acts: 0, dirt: null, checked: false, gest: null, relax: 0, pull: 0, off: [0, 0], offTarget: [0, 0],
    fx: { dx: 0, dy: 0, s: 1, r: 0 }, anim: null, marks: [], lickG: 0,
    stats: { bouts: 0, right: 0, wrong: 0, missed: 0, kiss: { good: 0, peck: 0, long: 0, zone: 0 }, clean: { strokes: 0, right: 0, checked: 0, missedSpot: 0, dry: 0 }, rub: { good: 0, bad: 0 }, learnt: [] } } as Any;
}
/* fnv1a, for the session's hash (the engine hashes, it does not draw) */
const fnv = (s: string) => fnv1a(s);
const svSay = (lines: string[] | null) => { if ((G.step === 'with' || G.step === 'glancing') && lines) say(pick(lines), 'commander'); };
/* the sounds of the service (synthesised): a kiss, a lick (wetter or drier), a rub, her foot tapping */
const SV_SFX = {
  kiss: () => { noise({ dur: 0.07, type: 'lowpass', f: 900, gain: 0.08, attack: 0.004, dest: A.body }); noise({ at: 0.05, dur: 0.03, type: 'highpass', f: 2500, gain: 0.04, attack: 0.002, dest: A.body }); },
  tapFoot: (n = 2) => { for (let i = 0; i < n; i++) play('soft', { g: 0.3, at: i * 0.22 }); },
  stamp: () => { thump(0, 0.5, 70, A.world); play('wood', { g: 0.25 }); },
};
function thump(at: number, gain: number, f0 = 55, dest = A.body) {
  if (!A.ctx) return;
  const ctx = A.ctx, t = ctx.currentTime + at;
  const o = ctx.createOscillator(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.18);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.35);
}
/* the lick: a continuous noise whose colour follows the mouth's wetness and whose level follows the stroke's speed */
function lickTick(speed: number) {
  if (!A.ctx) return;
  if (!SV.lick) {
    const src = A.ctx.createBufferSource(); src.buffer = A.white; src.loop = true;
    const f = A.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2; const g = A.ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(A.body); src.start(); SV.lick = { src, f, g };
  }
  const ct = A.ctx.currentTime;
  SV.lick.f.frequency.setTargetAtTime(lerp(1100, 3400, SV.dry), ct, 0.05);
  SV.lick.g.gain.setTargetAtTime(clamp(speed / 1800, 0, 1) * 0.07, ct, 0.04);
}
const lickStop = () => { if (SV?.lick && A.ctx) SV.lick.g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.06); };
/* a sound that only a third party matters for (she expects the sounds of her service): the call and an unaware visitor */
function thirdPartyNoise(loud: number) {
  const cover = coverNow();
  if (G.call && G.t >= G.herSpeakingUntil && loud * (1 - cover) > 0.06 && !G.call.heard && Math.random() < 0.35) { G.call.heard = true; G.stats.heardOnLine += 1; callHeard(); }
  if (G.visitor && !S.knows && loud * (1 - cover) > 0.06 && !G.visitor.heard && Math.random() < 0.35) { G.visitor.heard = true; G.stats.heardByVisitor += 1; visitorHeard(); }
}
/* ---------- the close-up: sole_close (or foot_raised zoomed, or her sprite, until the author has one) ---------- */
function soleRect() {
  const img = $('#soleArt'); if (!img.naturalWidth) return null;
  const H = innerHeight * S.closeH, Wd = H * img.naturalWidth / img.naturalHeight;
  const cx = innerWidth / 2 + SV.off[0] + SV.fx.dx, cy = innerHeight * S.closeY + SV.off[1] + SV.fx.dy + SV.relax * 8;
  const ln = SV.lean ?? 0, k = (0.55 + 0.45 * easeOut(SV.closeK)) * SV.fx.s * (1 + 0.05 * Math.max(0, ln) - 0.035 * Math.max(0, -ln));
  return { x: cx - (Wd * k) / 2, y: cy - (H * k) / 2, w: Wd * k, h: H * k };
}
const zones = (): Record<string, number[]> => S.zones ?? DEFAULT_ZONES;
/* each zone's radius: half the distance to its nearest neighbour, at least 4 % and at most 12 % of the picture's height */
/* each zone's radii in px: an ellipse [x, y, rx, ry] or a circle [x, y, r] as marked (fractions of the picture's height), or, for [x, y],
   half the distance to the nearest neighbour (4–12 % of the height) */
function zoneRadii(r: Any) {
  const z = Object.entries(zones()), out: Any = {};
  for (const [k, p] of z) {
    let dmin = 1e9;
    for (const [k2, q] of z) if (k2 !== k) dmin = Math.min(dmin, Math.hypot((p[0]! - q[0]!) * r.w, (p[1]! - q[1]!) * r.h));
    const auto = clamp(dmin / 2, r.h * 0.04, r.h * 0.12);
    out[k] = p[3] !== undefined ? { rx: p[2]! * r.h, ry: p[3] * r.h, rot: ((p[4] ?? 0) * Math.PI) / 180 } : p[2] !== undefined ? { rx: p[2] * r.h, ry: p[2] * r.h } : { rx: auto, ry: auto };
  }
  return out;
}
/* a point relative to a zone's centre, in the ellipse's own units (rotated back by its angle): inside when the length is under 1 */
function inEllipse(dx: number, dy: number, z: Any) { const a = -(z.rot ?? 0), c = Math.cos(a), sn = Math.sin(a); return [(dx * c - dy * sn) / z.rx, (dx * sn + dy * c) / z.ry]; }
function zoneAt(x: number, y: number) {
  const r = soleRect(); if (!r) return null;
  const rad = zoneRadii(r);
  let best = null, bd = 1e9;
  for (const [k, p] of Object.entries(zones())) { const [ex, ey] = inEllipse(x - (r.x + p[0]! * r.w), y - (r.y + p[1]! * r.h), rad[k]); const d = Math.hypot(ex!, ey!); if (d < 1 && d < bd) { bd = d; best = k; } }
  return best;
}
const onSole = (x: number, y: number) => { const r = soleRect(); return r && x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h; };
/* the dirt: a mask at low resolution over the picture's own alpha, heavier where she stands (heel, ball, toes); wiped by strokes */
function makeDirt() {
  const img = $('#soleArt'); if (!img.naturalWidth) return;
  const w = 140, h = Math.round(140 * img.naturalHeight / img.naturalWidth);
  const base = document.createElement('canvas'); base.width = w; base.height = h; const b = base.getContext('2d')!; b.drawImage(img, 0, 0, w, h);
  const alpha = b.getImageData(0, 0, w, h).data;
  const m = new Float32Array(w * h);
  const blobs: number[][] = [];
  for (const [k, p] of Object.entries(zones())) for (let i = 0; i < (k === 'heel' || k === 'ball' ? 5 : 3); i++) blobs.push([p[0]! + rand(-0.08, 0.08), p[1]! + rand(-0.05, 0.05), rand(0.06, 0.13)]);
  const r = soleRect(), rad = r ? zoneRadii(r) : null, asp = img.naturalWidth / img.naturalHeight;
  const zs = rad ? Object.entries(zones()).map(([k, p]) => ({ x: p[0]!, y: p[1]!, z: { rx: rad[k].rx / r!.h, ry: rad[k].ry / r!.h, rot: rad[k].rot ?? 0 } })) : [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = alpha[(y * w + x) * 4 + 3]! / 255; if (a < 0.3) continue;
    // only the sole: the nearest zone in its own units (offsets in heights of the picture); fades out from 0.9 to 1.4 of its size
    let dmin = zs.length ? 1e9 : 0;
    for (const q of zs) { const [ex, ey] = inEllipse((x / w - q.x) * asp, y / h - q.y, q.z); dmin = Math.min(dmin, Math.hypot(ex!, ey!)); }
    const onSoleK = 1 - smooth(0.9, 1.4, dmin); if (onSoleK <= 0.01) continue;
    let v = (0.25 + Math.random() * 0.15);
    for (const [bx, by, br] of blobs) v += 0.5 * Math.exp(-(((x / w - bx!) ** 2) + ((y / h - by!) ** 2) * 0.6) / (br! * br!));
    m[y * w + x] = clamp(v, 0, 1) * a * onSoleK;
  }
  SV.dirt = { w, h, m, c: document.createElement('canvas') }; SV.dirt.c.width = w; SV.dirt.c.height = h;
  SV.dirt.total0 = m.reduce((s, v) => s + v, 0);
}
function dirtLeft() { if (!SV.dirt) return 0; return SV.dirt.m.reduce((s: number, v: number) => s + v, 0) / Math.max(1, SV.dirt.total0); }
function dirtIn(zone: string) {
  if (!SV.dirt) return 0; const p = zones()[zone]!, r = soleRect(); if (!r) return 0;
  const { w, h, m } = SV.dirt, rad = zoneRadii(r)[zone], big = Math.max(rad.rx, rad.ry), bx = big / r.w * w, by = big / r.h * h; let s = 0, n = 0;
  for (let y = Math.max(0, Math.floor(p[1]! * h - by)); y < Math.min(h, Math.ceil(p[1]! * h + by)); y++) for (let x = Math.max(0, Math.floor(p[0]! * w - bx)); x < Math.min(w, Math.ceil(p[0]! * w + bx)); x++) {
    const [ex, ey] = inEllipse((x / w - p[0]!) * r.w, (y / h - p[1]!) * r.h, rad); if (ex! * ex! + ey! * ey! > 1) continue; s += m[y * w + x]; n++;
  }
  return n ? s / n : 0;
}
function wipe(x0: number, y0: number, x1: number, y1: number) {
  const r = soleRect(); if (!r || !SV.dirt) return 0;
  const { w, h, m } = SV.dirt;
  const dy = (y1 - y0) / r.h, withGrain = Math.sign(dy) === herGrain() || Math.abs(dy) < 0.004;
  const wet = 1 - SV.dry * 0.85, k = (withGrain ? 1 : 0.45) * wet * 0.5;
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4)), rad = 0.07 * w;
  let removed = 0;
  for (let i = 0; i <= steps; i++) {
    const px = ((x0 + (x1 - x0) * (i / steps)) - r.x) / r.w * w, py = ((y0 + (y1 - y0) * (i / steps)) - r.y) / r.h * h;
    for (let y = Math.max(0, Math.floor(py - rad)); y < Math.min(h, Math.ceil(py + rad)); y++) for (let x = Math.max(0, Math.floor(px - rad)); x < Math.min(w, Math.ceil(px + rad)); x++) {
      const d = Math.hypot(x - px, y - py) / rad; if (d > 1) continue;
      const take = m[y * w + x] * k * (1 - d) * 0.35; m[y * w + x] -= take; removed += take;
    }
  }
  return removed;
}

/* ---------- a bout ---------- */
function svSignal() {
  const pairs = herSignals();
  // during a call her foot rests on the shoulder; a cruel or playful holder may ask to be cleaned right then
  let pick2: Any;
  if (G.call) { if (!['cruel', 'playful'].includes(S.style) || SV.callAsked) return; SV.callAsked = true; pick2 = pairs.find((p) => p.meaning === 'clean'); }
  else pick2 = pairs[fnv(`${S.seed}|${SV.salt}|bout|${SV.stats.bouts}`) % pairs.length];
  const want = SV.forceMeaning || S.only;
  if (want && !G.call) pick2 = pairs.find((q) => q.meaning === want) ?? { motion: MEANINGS[want]!.foot ? 'sole' : 'nudge', meaning: want };
  SV.forceMeaning = null;
  SV.sig = pick2; SV.phase = 'signal'; SV.sigAt = G.t; SV.stats.bouts += 1; SV.gest = null; SV.deadline = 0; SV.deskStart = 0; SV.act = null;
  const mo = MOTIONS[pick2.motion]!, me = MEANINGS[pick2.meaning]!;
  SV.anim = { kind: pick2.motion, t0: G.t };
  if (mo.up) G.footUpUntil = G.t + 2600;
  if (pick2.motion === 'stamp') SV_SFX.stamp(); else SV_SFX.tapFoot(pick2.motion === 'tap2' ? 2 : 1);
  sense(mo.felt, 'body');
  // the first time she names it, at any presence: it is teaching
  if (!SV.named.has(pick2.motion)) { SV.named.add(pick2.motion); SV.stats.learnt.push(`${mo.words}: ${me.words}`); after(500, () => say(`${mo.words} — ${me.words}.`, 'commander')); }
  const patience = SS().patience * 1000;
  if (me.foot) {
    // she lifts the foot to the commander's face: the camera closes in; the answer is the first gesture on her foot
    after(650, () => { if (SV.phase === 'signal') { SV.closeTarget = 1; SV.act = pick2.meaning; SV.deadline = G.t + patience; if (pick2.meaning === 'clean' && !SV.dirt) makeDirt(); } });
  } else { SV.act = pick2.meaning; SV.deadline = G.t + patience; SV.deskStart = G.t; SV.stillOk = true; SV.holdOnLegs = 0; SV.awayHold = 0; }
}
/* the answer: a gesture classified (hold = kiss, a straight drag = clean, a circling drag = rub; under the desk: a press on her legs =
   closer, nothing = still, the attention held past the edge of her foot = enough) */
function svAnswer(kind: string) {
  if (SV.phase !== 'signal') return;
  if (kind === SV.sig.meaning) {
    SV.stats.right += 1; SV.phase = MEANINGS[kind]!.foot ? 'craft' : 'wait';
    if (MEANINGS[kind]!.foot) { SV.boutEnd = G.t + rand(15000, 45000); SV.orderI = 0; svNextWant(); }
    else svDeskDone(kind);
  } else {
    SV.stats.wrong += 1; G.stats.noticed.push({ kind: `a misread signal (${kind} for ${SV.sig.meaning})`, step: G.step, how: 'felt', fiction: clockText(G.clockMin) });
    svSay(SL().wrong); if (G.step === 'own' || G.step === 'use') { SV.pull = 1; sense('Her foot jerks away.', 'body'); }
    if (G.step === 'glancing') after(900, () => { SV.anim = { kind: SV.sig.motion, t0: G.t }; SV_SFX.tapFoot(1); });
    svEndBout(false);
  }
}
function svDeskDone(kind: string) {
  if (kind === 'closer') { play('cloth', { g: 0.3, dest: A.body }); sense('You shuffle closer between her feet.', 'body'); thirdPartyNoise(0.2); }
  if (kind === 'enough') sense('You draw back. Her foot settles.', 'body');
  if (kind === 'still') sense('You keep still. Her foot rests.', 'body');
  G.press = 0.5; svEndBout(true, true);
}
function svNextWant() {
  const order = herOrder(SV.act); SV.want = order[SV.orderI % order.length]; SV.orderI += 1; SV.wantAt = G.t;
  if (G.step === 'with') say(ZONE_WORDS[SV.want]!, 'commander');
  // glancing: she brings that part closer to the face (the picture shifts to centre the zone)
  const p = zones()[SV.want]!, r = soleRect();
  SV.offTarget = G.step === 'glancing' && r ? [(0.5 - p[0]!) * r.w * 0.6, (0.5 - p[1]!) * r.h * 0.6] : [0, 0];
}
function svEndBout(good: boolean, desk = false) {
  lickStop();
  const q = SV.acts ? SV.quality / SV.acts : (good ? 1 : 0);
  if (!desk) {
    if (SV.phase === 'craft' || SV.phase === 'lowering') {
      SV.sessionQ = (SV.sessionQ ?? 0) + q; SV.sessionN = (SV.sessionN ?? 0) + 1;
      if (q >= 0.6) { svSay(SL().good); if (G.step === 'own') { G.press = 1; sense('A press of her foot: approval, without a word.', 'body'); } }
      else { svSay(SL().poor); if (G.step === 'own') { SV.pull = 1; sense('She pulls her foot away before you are done.', 'body'); } }
    }
    SV.closeTarget = 0;
  }
  SV.phase = 'wait'; SV.act = null; SV.want = null; SV.quality = 0; SV.acts = 0; SV.offTarget = [0, 0]; SV.dry = Math.max(0, SV.dry - 0.3);
  SV.next = G.t + rand(25000, 70000) * SS().every * (ACT().absorb < -0.25 ? 1.3 : 1);
}
function svUpdate(dt: number) {
  if (!SV) return;
  SV.closeK += (SV.closeTarget - SV.closeK) * Math.min(1, S.reduced ? 1 : dt / 260);
  SV.off[0] += (SV.offTarget[0] - SV.off[0]) * Math.min(1, dt / 400); SV.off[1] += (SV.offTarget[1] - SV.off[1]) * Math.min(1, dt / 400);
  SV.relax = Math.max(0, SV.relax - dt / 2500); SV.pull = Math.max(0, SV.pull - dt / 700); SV.lean = (SV.lean ?? 0) * Math.max(0, 1 - dt / 600);
  // the motion of her foot (the signal's animation)
  const a = S.reduced ? null : SV.anim, fx = { dx: 0, dy: 0, s: 1, r: 0 };
  if (a) {
    const u = (G.t - a.t0) / 1000;
    if (a.kind === 'tap2') fx.dy = -Math.max(0, Math.sin(u * Math.PI * 4)) * 14 * (u < 0.5 ? 1 : 0);
    if (a.kind === 'sole') { fx.s = 1 + 0.16 * smooth(0, 0.5, u); fx.dy = -22 * smooth(0, 0.5, u); }
    if (a.kind === 'push') fx.s = 1 + 0.22 * Math.max(0, Math.sin(Math.min(u, 0.35) / 0.35 * Math.PI));
    if (a.kind === 'hook') fx.dy = Math.max(0, Math.sin(u * Math.PI * 3)) * 18 * (u < 0.67 ? 1 : 0);
    if (a.kind === 'point') fx.r = 6 * smooth(0, 0.3, u) * (u < 1.6 ? 1 : 1 - smooth(1.6, 2, u));
    if (a.kind === 'stamp') fx.dy = 10 * Math.max(0, 1 - u * 4);
    if (a.kind === 'nudge') fx.dx = 16 * Math.max(0, Math.sin(Math.min(u, 0.5) / 0.5 * Math.PI));
    if (u > 2.4) SV.anim = null;
  }
  fx.s *= 1 - SV.pull * 0.12; fx.dx += SV.pull * 30; fx.dy += SV.pull * 20;
  SV.fx = fx; G.footFx = fx;
  if (G.phase !== 'loop') return;
  if (SV.phase === 'wait') { if (G.t >= SV.next && !G.away && !G.visitor && (!G.call || ['cruel', 'playful'].includes(S.style))) svSignal(); return; }
  if (SV.phase === 'signal') {
    if (SV.deadline && G.t > SV.deadline) {
      if (SV.act === 'still' && SV.stillOk) { svAnswer('still'); return; }
      SV.stats.missed += 1; G.stats.noticed.push({ kind: 'a signal left unanswered', step: G.step, how: 'felt', fiction: clockText(G.clockMin) });
      svSay(SL().wrong); svEndBout(false); return;
    }
    if (SV.deskStart && !MEANINGS[SV.act ?? 'kiss']?.foot) {
      // under the desk: closer = a press held on her legs; still = nothing at all; enough = the attention held past the edge of her foot
      if ((G.speed ?? 0) > 90 || G.mouseHold) SV.stillOk = false;
      const legs = { x: innerWidth * 0.5, y: innerHeight * 0.45 };
      const far = Math.hypot(ATT.x - legs.x, ATT.y - legs.y) > innerHeight * 0.33;
      SV.awayHold = far ? SV.awayHold + dt : 0;
      if (SV.awayHold > 800) { SV.deskStart = 0; svAnswer('enough'); return; }
      if (G.mouseHold && Math.hypot(MOUSE.x - legs.x, MOUSE.y - legs.y) < innerHeight * 0.2) { SV.holdOnLegs += dt; if (SV.holdOnLegs > 600) { SV.deskStart = 0; svAnswer('closer'); return; } }
    }
    return;
  }
  if (SV.phase === 'craft') {
    if (SV.act !== 'clean' && G.t - SV.wantAt > rand(6000, 8000)) svNextWant();
    if (SV.act === 'clean' && SV.want && dirtIn(SV.want) < 0.12) svNextWant();
    if (SV.act === 'clean' && !SV.checked && dirtLeft() <= 0.1) svCheck();
    if (G.t >= SV.boutEnd) { if (SV.act === 'clean' && !SV.checked) svCheck(); svEndBout(true); }
  }
}
/* her check of the cleaning (the engine's at dirt ≤ 10): a spot left is named by presence */
function svCheck() {
  SV.checked = true; SV.stats.clean.checked += 1;
  const missed = Object.keys(zones()).find((z) => dirtIn(z) > 0.25);
  if (missed) { SV.stats.clean.missedSpot += 1; SV.quality += 0; SV.acts += 1; if (G.step === 'with' || G.step === 'glancing') say(`${ZONE_WORDS[missed]!.replace('.', '')}. you missed it.`, 'commander'); else { SV.pull = 0.6; sense('She turns her foot to the light, and you see what you missed.', 'body'); } }
  else { SV.quality += 1; SV.acts += 1; }
}
/* her foot answers where it is touched: toward the lips (where she wants it), away (not there); the first time of each, a line */
function svLean(v: number) {
  SV.lean = v;
  if (v > 0 && !SV.toldLeanIn) { SV.toldLeanIn = true; sense('Her foot presses to your lips: there.', 'body'); }
  if (v < 0 && !SV.toldLeanOut) { SV.toldLeanOut = true; sense('Her foot shifts away: not there.', 'body'); }
}
/* the gestures in the close-up */
function svDown(x: number, y: number) {
  if (SV.phase !== 'signal' && SV.phase !== 'craft') return false;
  if (SV.closeK < 0.6 || !onSole(x, y)) return false;
  SV.gest = { x0: x, y0: y, x, y, t0: G.t, len: 0, turn: 0, lastA: null, pts: [[x, y]], zone: zoneAt(x, y), kind: null, lastT: G.t };
  return true;
}
function svMove(x: number, y: number) {
  const g = SV?.gest; if (!g) return;
  const dx = x - g.x, dy = y - g.y, d = Math.hypot(dx, dy); if (d < 0.5) return;
  const dtm = Math.max(1, G.t - g.lastT); g.lastT = G.t;
  g.len += d; g.pts.push([x, y]); if (g.pts.length > 40) g.pts.shift();
  // the direction is read over pieces of at least 6 px (a trembling hand does not turn); a change of direction past ~125° is a reversal
  // (scrubbing back and forth), not turning
  const ax = x - (g.ax ?? g.x0), ay = y - (g.ay ?? g.y0);
  if (Math.hypot(ax, ay) >= 6) {
    const a = Math.atan2(ay, ax);
    if (g.lastA !== null) { let da = a - g.lastA; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; if (Math.abs(da) > 2.2) g.rev = (g.rev ?? 0) + 1; else { g.turn += da; g.absTurn = (g.absTurn ?? 0) + Math.abs(da); } }
    g.lastA = a; g.ax = x; g.ay = y;
  }
  const speed = d / dtm * 1000;
  // a rub turns steadily one way with no reversal; scrubbing back and forth, or a straight drag, is a stroke of cleaning; unsure, wait
  if (!g.kind) {
    const rev = g.rev ?? 0, steady = Math.abs(g.turn) > 0.7 * (g.absTurn ?? 0);
    if (rev === 0 && steady && Math.abs(g.turn) > Math.PI * 1.2) g.kind = 'rub';
    else if (rev >= 1 && g.len > 50) g.kind = 'clean';
    else if (g.len > 120 && Math.abs(g.turn) < 0.8) g.kind = 'clean';
    else if (g.len > 300) g.kind = rev === 0 && steady && Math.abs(g.turn) / g.len > 0.004 ? 'rub' : 'clean';
  }
  if (g.kind && SV.phase === 'signal') { svAnswer(g.kind); if (SV.phase !== 'craft') { SV.gest = null; return; } }
  if (SV.phase === 'craft' && g.kind === 'clean' && SV.act === 'clean') {
    const removed = wipe(g.x, g.y, x, y);
    SV.dry = clamp(SV.dry + d * 0.0011, 0, 1); lickTick(speed);
    thirdPartyNoise(0.05 + speed / 6000);
    const z = zoneAt(x, y); if (z) { if (!SV.want || z === SV.want) SV.goodLen = (SV.goodLen ?? 0) + d; else SV.badLen = (SV.badLen ?? 0) + d; }
    if (SV.dry > 0.85 && !SV.toldDry) { SV.toldDry = true; sense('Your mouth is dry; the tongue drags. Swallow.', [0.42, 0.74], 'body'); SV.stats.clean.dry += 1; }
  }
  if (SV.phase === 'craft' && g.kind === 'rub' && SV.act === 'rub') {
    // her tempo: circles a second, steady; she relaxes (the foot sinks a little) or pulls away
    const cps = Math.abs(d / dtm * 1000) / (2 * Math.PI * Math.max(25, g.len / Math.max(1, Math.abs(g.turn)) ));
    g.cps = lerp(g.cps ?? cps, cps, 0.15);
    const off = Math.abs((g.cps ?? 0) - SS().tempo) / SS().tempo;
    if (off < 0.35) { SV.relax = Math.min(1, SV.relax + 0.02); g.goodT = (g.goodT ?? 0) + dtm; } else if (off > 0.8) { g.badT = (g.badT ?? 0) + dtm; if (g.badT > 1200 && !g.pulled) { g.pulled = true; SV.pull = 0.8; } }
    noise({ dur: 0.06, type: 'lowpass', f: 520, gain: clamp(speed / 9000, 0, 0.05), attack: 0.01, dest: A.body });
    thirdPartyNoise(0.03);
  }
  g.x = x; g.y = y;
}
function svUp() {
  const g = SV?.gest; if (!g) return; SV.gest = null; lickStop();
  if (!g.kind && g.len < 12) {
    // a kiss: a press held on one spot
    const d = (G.t - g.t0) / 1000;
    if (SV.phase === 'signal') { if (d >= 0.3) svAnswer('kiss'); return; }
    if (SV.phase === 'craft' && SV.act === 'kiss') {
      SV_SFX.kiss(); thirdPartyNoise(0.12); SV.marks.push({ x: g.x0, y: g.y0, born: performance.now() });
      const [lo, hi] = SS().kiss, rightZone = !SV.want || g.zone === SV.want || G.step === 'own' || G.step === 'use' && false;
      SV.acts += 1;
      if (!rightZone) { SV.stats.kiss.zone += 1; svLean(-0.8); } else svLean(1);
      if (d < lo) SV.stats.kiss.peck += 1; else if (d > hi) SV.stats.kiss.long += 1; else if (rightZone) { SV.stats.kiss.good += 1; SV.quality += 1; SV.relax = Math.min(1, SV.relax + 0.3); }
      if (rightZone && d >= lo && d <= hi && SV.want && G.t - SV.wantAt > 2000) svNextWant();
    }
    return;
  }
  if (SV.phase === 'craft' && g.kind === 'clean' && SV.act === 'clean') {
    SV.stats.clean.strokes += 1; const good = (SV.goodLen ?? 0) >= (SV.badLen ?? 0); if (good) SV.stats.clean.right += 1; svLean(good ? 0.45 : -0.45);
    SV.acts += 1; SV.quality += good ? 1 : 0.3; SV.goodLen = 0; SV.badLen = 0;
  }
  if (SV.phase === 'craft' && g.kind === 'rub' && SV.act === 'rub') {
    const good = (g.goodT ?? 0) > (g.badT ?? 0); if (good) SV.stats.rub.good += 1; else SV.stats.rub.bad += 1; SV.acts += 1; SV.quality += good ? 1 : 0.2;
  }
}
/* drawing the close-up: the shade under the desk, her sole, the dirt over it, the warm marks of kisses */
function svRender(now: number) {
  const k = SV ? SV.closeK : 0;
  setStyle('#close', 'opacity', (smooth(0.02, 0.6, k)).toFixed(3));
  setStyle('#close', 'display', k > 0.01 ? 'block' : 'none');
  if (k <= 0.01 || !SV) return;
  const r = soleRect(); const img = $('#soleArt');
  if (!r) return;
  img.style.left = `${r.x}px`; img.style.top = `${r.y}px`; img.style.width = `${r.w}px`; img.style.height = `${r.h}px`;
  img.style.transform = `rotate(${(SV.fx.r + (S.reduced ? 0 : Math.sin(now / 1700) * 0.4)).toFixed(2)}deg)`;
  const dc = $('#dirtC');
  dc.style.left = `${r.x}px`; dc.style.top = `${r.y}px`; dc.style.width = `${r.w}px`; dc.style.height = `${r.h}px`; dc.style.transform = img.style.transform;
  if (SV.dirt && SV.act === 'clean') {
    const { w, h, m, c } = SV.dirt; const cx = c.getContext('2d'), id = cx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) { id.data[i * 4] = 58; id.data[i * 4 + 1] = 46; id.data[i * 4 + 2] = 38; id.data[i * 4 + 3] = Math.round(Math.min(1, m[i] * 1.25) * 235); }
    cx.putImageData(id, 0, 0); if (dc.width !== w) { dc.width = w; dc.height = h; } dc.getContext('2d').clearRect(0, 0, w, h); dc.getContext('2d').drawImage(c, 0, 0);
    dc.style.opacity = '1';
  } else dc.style.opacity = '0';
  // the marks of kisses: a warm glow that fades where the lips were
  const mc = $('#markC'); if (mc.width !== innerWidth) { mc.width = innerWidth; mc.height = innerHeight; }
  const mx = mc.getContext('2d'); mx.clearRect(0, 0, mc.width, mc.height);
  SV.marks = SV.marks.filter((q: Any) => performance.now() - q.born < 2200);
  for (const q of SV.marks) { const a = 1 - (performance.now() - q.born) / 2200; const g = mx.createRadialGradient(q.x, q.y, 0, q.x, q.y, 30); g.addColorStop(0, `rgba(255,150,140,${(0.35 * a).toFixed(3)})`); g.addColorStop(1, 'rgba(255,150,140,0)'); mx.fillStyle = g; mx.beginPath(); mx.arc(q.x, q.y, 30, 0, Math.PI * 2); mx.fill(); }
  if (S.debug) { const rad = zoneRadii(r); for (const [kz, p] of Object.entries(zones())) { mx.strokeStyle = kz === SV.want ? 'rgba(140,255,170,.75)' : 'rgba(216,228,255,.25)'; mx.lineWidth = kz === SV.want ? 2 : 1; mx.beginPath(); mx.ellipse(r.x + p[0]! * r.w, r.y + p[1]! * r.h, rad[kz].rx, rad[kz].ry, rad[kz].rot ?? 0, 0, Math.PI * 2); mx.stroke(); } }
}

/* ---------- the wiring: the mount, the art, the end ---------- */
/**
 * Does the service play in her frame? The commander under her desk (the frame's view `legs`: a frame backdrop of the commander's anchor) with
 * her foot within reach (her activity's `frame.legs` is not `asleep`), no weight inside, her practices live (P16: her verdict lands only then)
 * and worship open for her (the content gate and her own limits). Read by field, never by id.
 */
export function serviceMatches(state: CampaignState, reg: Registries, run: PhysicsRun, view: string): boolean {
  if (view !== 'legs' || run.second) return false;
  const act = run.sourceKind === 'activity' ? run.sourceId : state.scene?.blocking?.[run.holderId]?.activity;
  const frame = act === undefined ? null : frameOf(reg.blockingActivities.get(act));
  if (frame === null || frame.legs === 'asleep') return false;
  return practiceLive(state, reg, run.holderId) && contentAllowed(state, reg, { contentTags: ['worship'] }, run.holderId);
}
/** The frame mounts the service on a run where it plays (`serviceMatches`), after its own elements are built. */
export function attachService(ctx: ServiceCtx): void {
  X = ctx;
  SV = null;
  const box = ctx.els['#world']!.parentElement!;
  const el = <T extends HTMLElement>(tag: string, id: string, parent: HTMLElement): T => { const x = (tag === 'canvas' ? safeCanvas() : globalThis.document.createElement(tag)) as T; x.className = `alius-act-${id}`; ctx.els[`#${id}`] = x; parent.append(x); return x; };
  const close = el('div', 'close', box); close.style.display = 'none';
  ctx.els['#world']!.after(close);
  el('div', 'closeShade', close);
  const img = el<HTMLImageElement>('img', 'soleArt', close); img.alt = ''; img.draggable = false;
  el('canvas', 'dirtC', close); el('canvas', 'markC', close);
  // the close-up's picture: sole_close (its sidecar's fit and zones), else her raised foot zoomed, else her sprite (README: the stand-ins)
  const env = ctx.env, sole = env.art.get(ctx.holderId, 'sole_close');
  const fit = (sole?.sidecar.fit ?? {}) as { height?: number; y?: number };
  S.closeH = fit.height ?? 0.62; S.closeY = fit.y ?? 0.47;
  const zs = (sole?.sidecar as { zones?: Record<string, number[]> } | undefined)?.zones;
  S.zones = zs && Object.keys(zs).length ? zs : null;
  const raised = ctx.els['#raisedArt'] as HTMLImageElement | undefined;
  const her = (): string => env.spriteOf(ctx.holderId)?.src ?? '';
  img.onerror = () => { if (img.dataset.stand !== 'her') { img.dataset.stand = 'her'; const h = her(); if (h && h !== img.src) img.src = h; } };
  const hasRaised = !!raised && raised.style.display !== 'none' && !!raised.getAttribute('src');
  const first = sole?.url ?? (hasRaised ? raised!.src : her());
  if (first) img.src = first;
  img.dataset.stand = sole ? 'sole' : hasRaised ? 'raised' : 'her';
  // her sprite may not be drawn yet: the scene resolves its picture (the face she shows now)
  if (!sole && !hasRaised) void env.spriteUrl(ctx.holderId, env.faceOf(ctx.holderId)).then((u) => { if (X === ctx && u && img.dataset.stand === 'her' && img.getAttribute('src') !== u) img.src = u; }).catch(() => {});
}
/** The frame's `begin`: a fresh session (the prototype's `SV = svcOn() ? svFresh() : null`). */
export function svBegin(): void {
  SV = svcOn() ? svFresh() : null;
}
/** The session's end (the frame's `finish`): her verdict through the engine, from the bouts' mean quality; the stop word gives none. */
export function svFinish(how: string): void {
  if (!SV) return;
  lickStop();
  SV.closeTarget = 0;
  if (how === 'stop' || SV.told) return;
  // R27: the crafts' quality only (the bouts she judged with her good or poor line), the craft still open counted as it stands
  const open = SV.phase === 'craft' && SV.acts ? SV.quality / SV.acts : null;
  const n = (SV.sessionN ?? 0) + (open !== null ? 1 : 0), q = ((SV.sessionQ ?? 0) + (open ?? 0)) / Math.max(1, n);
  if (n === 0) return; // no craft was judged: no verdict
  SV.told = true;
  X?.env.staging.service?.(X.runId, verdictOf(q));
}
/** The frame leaves: the lick's loop stops, nothing is kept. */
export function detachService(): void {
  try { SV?.lick?.src.stop(); } catch { /* stopped */ }
  SV = null;
  X = null;
  innerWidth = 0; innerHeight = 0;
}

/** Tests and the shots only: the session's state and the ported functions. */
export const _service = {
  get SV(): Any { return SV; },
  setSV(v: Any): void { SV = v; },
  svFresh, svSignal, svAnswer, svDeskDone, svNextWant, svEndBout, svUpdate, svCheck, svLean, svDown, svMove, svUp, svRender, soleRect, zoneRadii, inEllipse, zoneAt, makeDirt, dirtLeft, dirtIn, wipe, lickTick, herSignals, svFinish,
};
export { svUpdate, svRender, svDown, svMove, svUp };
