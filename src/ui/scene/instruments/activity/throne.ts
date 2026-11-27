/**
 * P10e-e Task 24b: the throne (`docs/prototypes/throne.html`, its block `THE THRONE`, normative). The throne is the weight inside her
 * activity's frame, at any of her activities: her body follows her lines (a lean, a press, a laugh, crossed legs, settling, rising and sitting
 * back hard), the commander's body flinches when anyone talks about the commander, her mug and her signature on the commander's back, three
 * kinds of visitor, the thanks at the end; on `human_chair` her legs astride (the silhouettes, or the art slot `legs_astride`).
 *
 * The functions are the prototype's, copied (types added); `fidelity.json` (`throne` entry beside the frame's) declares the differences. The
 * wiring: `W` is the weight core's state (Task 16, Ruling B), `HOLD`, `W_SFX` and `WT.tol` its own; `G`, `S` and the frame's helpers (`after`,
 * `sense`, `say`, `play`, the tell `herFeels`, `bodyNoise`, `visitorHeard`, `steps`, `V`) are the frame's, given at its mount (`attachThrone`).
 * Her lines are `cardVoice` `throne.*` by her style (`T_LINES`; a style the prototype has none of reads neutral's). Her visitors' words are the
 * model's script (R26); the prototype's `THRONE_VISITS` texts are placeholders: only their shape (`business`, `aware`, `unaware`) is kept.
 * A decision of a business visitor is the engine's (`physics/decide`, through her command capability): the dim line says what changed only when
 * the engine applied it.
 */
import { fnv1a } from '../../../../engine/hub';
import { voiceLines, type VoiceKind } from '../../cards/voice';
import { bendRow, type RowKinds } from '../kit/bendRow';
import { chaikin } from '../kit/chaikin';
import { clamp, smooth } from '../kit/math';
import type { InstrumentEnv } from '../types';
import { THRONE, weightCore } from '../weight/weight';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

/** What the frame gives the throne at its mount: its state and helpers (the prototype's globals of her_activity.html). */
export interface ThroneCtx {
  env: InstrumentEnv;
  G: () => Any;
  S: Any;
  after(ms: number, fn: () => void): void;
  sense(text: string, where?: Any, cls?: string): void;
  say(text: string, to?: string, opts?: Any): void;
  play(id: string, opts?: Any): Any;
  herFeels(kind: string, gross: boolean): void;
  bodyNoise(kind: string, loud: number, visible: boolean, gross?: boolean): boolean;
  visitorHeard(): void;
  steps(n: number, fromPan: number, toPan: number, g0: number, g1: number, gap?: number, wood?: boolean, lp?: number): void;
  V(): Any;
  rand(a: number, b: number): number;
  random(): number;
  now(): number;
  els: Record<string, HTMLElement>;
  shadow: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };
  inner(): [number, number];
}
let X: ThroneCtx | null = null;
/** The frame mounts the throne (and leaves it with `detachThrone`). */
export function attachThrone(ctx: ThroneCtx): void {
  X = ctx;
  THRONE.careful = () => (throneOn() && G.cup ? 0.35 : 1);
}
export function detachThrone(): void {
  X = null;
  THRONE.careful = () => 1;
  T_MOUSE.x = 0; T_MOUSE.y = 0; T_MOUSE.t = 0; T_MOUSE.speed = 0;
}

/* ---------- the prototype's globals, as the frame and the weight core have them ---------- */
const G: Any = new Proxy({}, { get: (_t, k) => X?.G()[k as string], set: (_t, k, v) => { if (X) X.G()[k as string] = v; return true; } });
const S: Any = new Proxy({}, { get: (_t, k) => X?.S[k as string], set: (_t, k, v) => { if (X) X.S[k as string] = v; return true; } });
const W: Any = new Proxy({}, { get: (_t, k) => (weightCore.G as Any)[k as string], set: (_t, k, v) => { (weightCore.G as Any)[k as string] = v; return true; } });
const HOLD = { get on(): boolean { return weightCore.HOLD.on; } };
const WT = { get tol(): number { return weightCore.tol; }, set tol(v: number) { weightCore.tol = v; }, get weight(): number { return S.contact === 'human_chair' ? 1.0 : 0.6; }, get shift(): number { return S.contact === 'human_chair' ? 1.0 : 0.7; }, BEAT: 1500 };
const W_SFX: Any = new Proxy({}, { get: (_t, k) => (weightCore.SFX() as Any)[k as string] });
const after = (ms: number, fn: () => void) => X?.after(ms, fn);
const sense = (text: string, where?: Any, cls?: string) => X?.sense(text, where, cls);
const say = (text: string, to?: string, opts?: Any) => X?.say(text, to, opts);
const play = (id: string, opts?: Any) => X?.play(id, opts);
const herFeels = (kind: string, gross: boolean) => X?.herFeels(kind, gross);
const bodyNoise = (kind: string, loud: number, visible: boolean, gross = false) => X?.bodyNoise(kind, loud, visible, gross);
const visitorHeard = () => X?.visitorHeard();
/** Final review Minor 3: her spoken words the prototype writes inline (`cardVoice`, as the frame's `spoken`). */
const spoken = (kind: string): string => (X ? voiceLines(X.env.registries, kind as VoiceKind, S.style)[0] ?? '' : '');
const steps = (n: number, fromPan: number, toPan: number, g0: number, g1: number, gap = 0.42, wood = false, lp = 1800) => X?.steps(n, fromPan, toPan, g0, g1, gap, wood, lp);
const V = (): Any => X!.V();
const rand = (a: number, b: number) => X!.rand(a, b);
const fnv = (s: string) => fnv1a(s);
const crack = (k: number) => weightCore.crack(k);
const performance = { now: (): number => (X ? X.now() : 0) };
const $ = (s: string): HTMLElement => X!.els[s]!;
const fillPts = (ctx: CanvasRenderingContext2D, pts: number[][]) => { ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0]!, q[1]!) : ctx.moveTo(q[0]!, q[1]!))); ctx.closePath(); ctx.fill(); };
const Math: typeof globalThis.Math = Object.create(globalThis.Math, { random: { value: () => (X ? X.random() : 0.5) } });

/* ============================================================================================================================
   THE THRONE
   ============================================================================================================================ */
export const throneOn = () => !!X && S.inner === 'weight';
/* her legs astride (weight.html, the human_chair branch of drawFloor, as it is: legPoints, LEG_FEET.relaxed, legsHang, the rim) */
export const T_LEG_FEET = {
  relaxed: [[-0.05, -0.08], [0.105, -0.08], [0.122, 0.1], [0.12, 0.28], [0.104, 0.45], [0.091, 0.58], [0.085, 0.66], [0.087, 0.71], [0.096, 0.77], [0.107, 0.84], [0.112, 0.9], [0.106, 0.95], [0.088, 0.99], [0.06, 1.0], [0.035, 0.97], [0.016, 0.9], [-0.05, 0.84]],
};
export function tLegPoints(Wd: number, H: number, side: number, press: number, lift: number, swing: number) {
  return T_LEG_FEET.relaxed.map(([x, y]) => {
    const down = clamp(y!, 0, 1);
    const X = x! + press * 0.035 * (0.4 + down) - lift * 0.03 * down + swing * 0.012 * down * down;
    const Y = y! * 0.86 - lift * 0.07 * down + swing * 0.01 * down;
    return [side < 0 ? X * Wd : Wd - X * Wd, Y * H];
  });
}
export function tLegsHang(ctx: CanvasRenderingContext2D, Wd: number, H: number, toward: number, swing: number, jolt: number, reading: boolean, t: number) {
  for (const side of [-1, 1]) {
    const own = side * toward, press = Math.max(0, own), lift = Math.max(0, -own);
    const sw = S.reduced ? 0 : (reading ? Math.sin(t * 3.1 + (side > 0 ? 1.7 : 0)) * (side > 0 ? 1 : 0.35) : Math.sin(t * 0.8 + side) * 0.25);
    fillPts(ctx, chaikin(chaikin(chaikin(tLegPoints(Wd, H, side, press + jolt * 0.2 * side, lift, sw) as Any))) as Any);
  }
}
let tLegC: HTMLCanvasElement, tlctx: CanvasRenderingContext2D, tCompC: HTMLCanvasElement, tcctx: CanvasRenderingContext2D, tRimC: HTMLCanvasElement, trctx: CanvasRenderingContext2D, tOutC: HTMLCanvasElement, toctx: CanvasRenderingContext2D;
/** The offscreen canvases of her legs (the frame's stand-in context where a canvas cannot be had). */
export function throneCanvases(off: () => [HTMLCanvasElement, CanvasRenderingContext2D]): void {
  [tLegC, tlctx] = off(); [tCompC, tcctx] = off(); [tRimC, trctx] = off(); [tOutC, toctx] = off();
}
/* the picture of her legs (one leg, mirrored for the other; or both in one picture): placed by its fit, moved by her weight as the
   silhouettes are (the leg on her side presses in, the other lifts; a foot bounces while she reads; a jolt), gone while she is up */
export function throneArt(now: number) {
  const L = $('#astrideL') as HTMLImageElement, R = $('#astrideR') as HTMLImageElement;
  const on = throneOn() && S.contact === 'human_chair' && S.legsArt;
  const both = S.legsFeet === 'two', pair = S.legsFeet === 'pair';
  L.style.display = on ? 'block' : 'none'; R.style.display = on && !both ? 'block' : 'none';
  if (!on || !L.naturalWidth) return !!on;
  const [vw, vh] = X!.inner(), t = now / 1000;
  // the world (and its views) is larger than the screen by #world's inset, for the frame's shake and tilt: place by the screen, offset into the view
  const view = $('#footrestView'), ox = (view.clientWidth - vw) / 2, oy = (view.clientHeight - vh) / 2;
  const live = G.phase === 'loop' || G.phase === 'entry', reading = live && G.att === 'busy';
  const toward = W.lean * 0.9 + W.cop * 0.5, jolt = W.jolt * 0.4;
  const h = vh * S.aH;
  const strF = smooth(100, 0, W.str);
  const op = G.risen ? '0' : '1';
  const place = (el: HTMLImageElement, side: number) => {
    const own = side * toward, press = Math.max(0, own), lift = Math.max(0, -own);
    const sw = S.reduced ? 0 : (reading ? Math.sin(t * 3.1 + (side > 0 ? 1.7 : 0)) * (side > 0 ? 1 : 0.35) : Math.sin(t * 0.8 + side) * 0.25);
    const w = h * (el.naturalWidth || 1) / (el.naturalHeight || 1);
    const cx = both ? vw / 2 : (side < 0 ? S.aX * vw : vw - S.aX * vw);
    const dx = both ? toward * 0.02 * vw : -side * (press * 0.035 - lift * 0.03) * vw;
    const dy = (-lift * 0.07 + jolt * 0.02) * vh;
    const rot = (both ? toward * 2 : -side * S.aTilt) + sw * 2.2;
    // one leg: the picture is her left or her right leg (as it stands on the screen); the other side is its mirror. pair: two pictures, no mirror.
    const flip = (S.legsFeet === 'left' && side > 0) || (S.legsFeet === 'right' && side < 0) ? ' scaleX(-1)' : '';
    el.style.width = `${w}px`; el.style.height = `${h}px`;
    el.style.transform = `translate(${(ox + cx - w / 2 + dx).toFixed(1)}px, ${(oy + S.aTop * vh + dy).toFixed(1)}px) rotate(${rot.toFixed(2)}deg)${flip}`;
    el.style.opacity = op;
    el.style.filter = S.readable ? 'none' : `blur(${(1.2 + strF * 0.8).toFixed(1)}px) brightness(${(0.62 - strF * 0.1).toFixed(2)}) saturate(.85) drop-shadow(0 0 14px rgba(226,78,52,.45))`;
  };
  void pair;
  place(L, -1); if (!both) place(R, 1);
  return true;
}
export function throneLegs(now: number) {
  if (throneArt(now)) return;
  if (S.contact !== 'human_chair') return;
  const wShC = X!.shadow.canvas, wsctx = X!.shadow.ctx;
  const Wd = wShC.width, H = wShC.height;
  for (const c of [tLegC, tCompC, tRimC, tOutC]) if (c.width !== Wd || c.height !== H) { c.width = Wd; c.height = H; }
  const live = G.phase === 'loop' || G.phase === 'entry';
  const t = now / 1000, reading = live && G.att === 'busy';
  const risen = G.risen ? 1 : 0;
  tlctx.clearRect(0, 0, Wd, H); tlctx.fillStyle = '#fff';
  if (!risen) {
    const toward = W.lean * 0.9 + W.cop * 0.5;
    const swing = S.reduced ? 0 : reading ? Math.sin(t * 3.1) : Math.sin(t * 0.8) * 0.25;
    tLegsHang(tlctx, Wd, H, toward, swing, W.jolt * 0.4, reading, t);
  }
  tcctx.globalCompositeOperation = 'source-over'; tcctx.clearRect(0, 0, Wd, H); tcctx.fillStyle = '#fff'; tcctx.fillRect(0, 0, Wd, H);
  tcctx.globalCompositeOperation = 'destination-out'; tcctx.drawImage(tLegC, 0, 0); tcctx.globalCompositeOperation = 'source-over';
  trctx.clearRect(0, 0, Wd, H); trctx.filter = `blur(${Math.round(H * 0.022)}px)`; trctx.drawImage(tCompC, 0, 0); trctx.filter = 'none';
  trctx.globalCompositeOperation = 'source-in'; trctx.fillStyle = 'rgb(226,78,52)'; trctx.fillRect(0, 0, Wd, H); trctx.globalCompositeOperation = 'source-over';
  toctx.globalCompositeOperation = 'source-over'; toctx.clearRect(0, 0, Wd, H);
  toctx.filter = `blur(${Math.round(H * 0.012)}px)`; toctx.drawImage(tLegC, 0, 0); toctx.filter = 'none';
  toctx.globalCompositeOperation = 'source-in'; toctx.fillStyle = 'rgb(34,22,22)'; toctx.fillRect(0, 0, Wd, H);
  toctx.globalCompositeOperation = 'source-atop'; toctx.globalAlpha = 0.55; toctx.drawImage(tRimC, 0, 0); toctx.globalAlpha = 1;
  toctx.globalCompositeOperation = 'source-over';
  wsctx.clearRect(0, 0, Wd, H);
  wsctx.drawImage(tOutC, 0, 0);
}

/* her body follows her lines. The telegraph is her voice: the move lands as the line is being said (~0.7 s into it). */
/** P15b: what the bent field of her telegraph is (`bendRow`): its lead, by her tempo (the frame bends her rests, `REST_KINDS`; her pace of service is bent by the engine's `servicePaceOf`). */
export const TELE_KINDS: RowKinds<{ tele: [number, number] }> = { tele: 'lead' };
export const T_TELE: Record<string, [number, number]> = { neutral: [600, 900], affectionate: [900, 1200], ritual: [700, 800], playful: [450, 800], clinical: [200, 1100], cruel: [150, 350], possessive: [450, 700], cold: [500, 700], regal: [900, 1200] };
export function wCueShift(dir: number, mag: number, tele: number) {
  if (!W || W.over || W.resting) return;
  const target = clamp(W.copTarget * 0.25 + dir * mag * WT.shift, -1, 1);
  W.shift = { landAt: W.clock + tele + 30, teleAt: W.clock, tele, target, feint: false, dir, landed: false, cost: 0 };
  W.leanTarget = dir * 0.9;
  W_SFX.rustle(0.08, dir * 0.85); W_SFX.creak(0.22, 0.1, dir * 0.85);
  W.nextShiftBeat = Math.max(W.nextShiftBeat, W.beat + 3); // her own shifts wait while the talk moves her
}
export function throneBody(kind: string, e?: Any) {
  if (!throneOn() || !S.bodyFollows || G.phase !== 'loop' || G.risen) return;
  if (G.cup && (kind === 'laugh' || kind === 'rise')) return; // she would not jostle her own tea
  const tele = rand(...bendRow({ tele: T_TELE[S.style] ?? T_TELE.neutral! }, S.manner, TELE_KINDS).tele) * (G.cup ? 1.4 : 1);
  const side = (fnv(`${S.seed}:${e?.text ?? kind}:${G.phaseIdx}`) % 2) ? 1 : -1;
  G.stats.bodyCues = (G.stats.bodyCues ?? 0) + 1;
  switch (kind) {
    case 'lean': wCueShift(side, rand(0.45, 0.75) * (G.cup ? 0.35 : 1), tele); break; // she leans to the desk, to the visitor: her weight goes forward and to a side
    case 'press': after(tele, () => { if (!W || G.risen) return; W.pressure = Math.max(W.pressure, 1.5); W.pressureUntil = W.clock + 2 * WT.BEAT; W_SFX.press(0.4); W.jolt = Math.max(W.jolt, 0.6); }); break;
    case 'laugh': for (let k = 0; k < 3; k++) after(tele * 0.4 + k * 170, () => { if (!W || G.risen) return; W.jolt = Math.max(W.jolt, 0.45); W.cop += (k % 2 ? -1 : 1) * 0.09; W_SFX.press(0.18); }); break;
    case 'cross': after(tele, () => { if (!W || G.risen) return; W.copTarget = clamp(side * 0.45, -1, 1); W_SFX.rustle(0.08, side * 0.7); if (!G.toldCross) { G.toldCross = true; sense(S.contact === 'human_chair' ? 'She crosses her legs. Her weight slides to one side and stays there.' : 'She crosses her ankles on your back; the weight goes to one side.', 'body'); } }); break;
    case 'settle': after(tele, () => { if (!W || G.risen) return; W.copTarget = 0; W_SFX.rustle(0.05, 0); }); break;
    case 'rise': throneRise(); break;
  }
}
/* she gets up (or takes her feet off) and comes back down all at once: a landing to be ready for */
export function throneRise() {
  if (!throneOn() || G.risen || G.phase !== 'loop' || G.cup) return;
  const hc = S.contact === 'human_chair';
  G.risen = { until: G.t + rand(3000, 6000) }; W.resting = true; W.shift = null;
  W_SFX.creak(0.3, 0.14); sense(hc ? 'She gets up. The weight is gone; your back does not believe it.' : 'She takes her feet off your back and stands.', 'body');
  after(G.risen.until - G.t, () => {
    if (!W || W.over) { G.risen = null; return; }
    W.resting = false; G.risen = null; G.stats.landings = (G.stats.landings ?? 0) + 1;
    const bad = !HOLD.on || Math.abs(W.cop - W.ctl) > WT.tol;
    W_SFX.press(0.75); W.jolt = 1.2;
    if (bad) { W.str -= 18 * WT.weight; weightCore.report('charge', 18 * WT.weight); W.hardShifts += 1; crack(1); W_SFX.grunt(); G.stats.hardLandings = (G.stats.hardLandings ?? 0) + 1; herFeels('the commander giving under her as she sat', false); }
    sense(hc ? 'She sits back down, all at once.' : 'Her feet come back down, hard.', 'body');
  });
}
/* talk about the commander: the body flinches (a kick to the balance); hold it down within 0.8 s, or it shows */
export function throneFlinch() {
  if (!throneOn() || !W || W.over || G.risen) return;
  W.ctlV += (Math.random() < 0.5 ? -1 : 1) * 2.4;
  G.flinch = { until: G.t + 800, bad: false };
}
/* her mug on the commander's back: the level must hold tighter; out of level for 0.35 s and it spills */
export function throneCup() {
  if (!throneOn() || G.phase !== 'loop' || G.cup || G.risen) return;
  G.cup = { over: 0, until: G.t + rand(20000, 35000), grace: G.t + 1500 }; WT.tol = 0.12;
  if (W.shift && !W.shift.landed) W.shift = null; W.nextShiftBeat = Math.max(W.nextShiftBeat, W.beat + 2);
  play('mug', { g: 0.45, pan: 0 }); sense('She sets her mug down on your back. Warm through the shirt.', 'body');
}
export function throneCupEnd(spilled: boolean) {
  if (!G.cup) return;
  G.cup = null; WT.tol = 0.18;
  if (spilled) {
    G.stats.spills = (G.stats.spills ?? 0) + 1;
    play('pour', { g: 0.25, dur: 0.9 }); play('mug', { g: 0.4 }); W.jolt = 0.8;
    sense('The mug tips. It runs down your side, hot.', 'body', 'body');
    herFeels('her mug spilling on the commander', true);
    X?.env.staging.relief?.({ kind: 'relieve', amount: 1, part: 'seen', involuntary: true }); // Ruling W: the spill reaches the engine (the body, not a cheat)
  } else { play('mug', { g: 0.35 }); sense('She takes her mug back.', 'body'); }
}
/* she signs something on the commander's back: the pen's strokes are felt; the mouse (the balance) must stay still while she writes */
export function throneSign() {
  if (!throneOn() || G.phase !== 'loop' || G.sign || G.risen) return;
  G.sign = { t: 0, dur: 3800, skid: 0, redo: false };
  play('sheet', { g: 0.35 }); sense('She lays a sheet on your back. The pen.', 'body');
  for (let k = 0; k < 3; k++) after(300 + k * 1200, () => { if (G.sign) play('pencil_write', { g: 0.32 }); });
}
export const T_MOUSE = { x: 0, y: 0, t: 0, speed: 0 };
/** The prototype's top-level `mousemove` listener of the throne (the frame's mount registers it). */
export function tMouse(e: { clientX: number; clientY: number }) {
  const now = performance.now(), dt = Math.max(1, now - T_MOUSE.t);
  const v = Math.hypot(e.clientX - T_MOUSE.x, e.clientY - T_MOUSE.y) / dt * 1000;
  T_MOUSE.speed = T_MOUSE.speed * 0.7 + v * 0.3; T_MOUSE.x = e.clientX; T_MOUSE.y = e.clientY; T_MOUSE.t = now;
}
/** Her lines on the throne (`T_LINES`): `cardVoice` `throne.*` by her style (neutral's for a style the prototype has none of). */
const tLine = (kind: string) => { const l = voiceLines(X!.env.registries, `throne.${kind}` as VoiceKind, S.style); return l[Math.floor(Math.random() * l.length)] ?? ''; };
export function throneUpdate(dt: number) {
  if (!throneOn() || !W) return;
  const err = Math.abs(W.cop - W.ctl);
  if (G.flinch) {
    if (err > WT.tol * 1.6 || !HOLD.on) G.flinch.bad = true;
    if (G.t > G.flinch.until) {
      if (G.flinch.bad) {
        G.stats.flinches = (G.stats.flinches ?? 0) + 1;
        bodyNoise('jerk', 0.4, true);
        if (G.visitor && !G.visitor.aware && !G.visitor.heard && Math.random() < 0.35) { G.visitor.heard = true; G.stats.heardByVisitor += 1; visitorHeard(); }
      } else G.stats.flinchesHeld = (G.stats.flinchesHeld ?? 0) + 1;
      G.flinch = null;
    }
  }
  if (G.cup) {
    if (G.t < G.cup.grace) G.cup.over = 0; else if (err > WT.tol) G.cup.over += dt; else G.cup.over = Math.max(0, G.cup.over - dt * 0.5);
    if (G.cup.over > 500) { throneCupEnd(true); if (G.step === 'with' || G.step === 'glancing') after(600, () => say(tLine('spill'), 'commander')); }
    else if (G.t > G.cup.until) throneCupEnd(false);
  }
  if (G.sign) {
    G.sign.t += dt; W.nextShiftBeat = Math.max(W.nextShiftBeat, W.beat + 2);
    if (T_MOUSE.speed > 140 && performance.now() - T_MOUSE.t < 120) G.sign.skid += dt; else G.sign.skid = Math.max(0, G.sign.skid - dt);
    if (G.sign.skid > 160) {
      G.stats.skids = (G.stats.skids ?? 0) + 1; play('pencil_erase', { g: 0.3 }); sense('The pen skids across the page.', 'body');
      herFeels('the pen skidding on the commander’s back', false);
      if (G.step !== 'use') after(500, () => say(tLine('skid'), 'commander'));
      if (!G.sign.redo) { G.sign.redo = true; G.sign.t = 0; G.sign.skid = 0; after(900, () => { if (G.sign) play('pencil_write', { g: 0.32 }); }); } else G.sign = null;
    } else if (G.sign.t > G.sign.dur) { G.stats.signed = (G.stats.signed ?? 0) + 1; play('sheet', { g: 0.3 }); sense('A last stroke. She lifts the sheet away.', 'body'); G.sign = null; }
  }
  if (G.visitorFeet && G.visitor) { W.pressure = Math.max(W.pressure, 1.35); W.pressureUntil = W.clock + 600; }
  else if (G.visitorFeet && !G.visitor) { G.visitorFeet = false; sense('Her visitor’s boots leave your back.', 'body'); }
}
/* visitors of three kinds: the unaware (silence, and a risk), the one who knows (who may rest her boots on the commander too), the one with
   business (real decisions about the commander, which she takes over the commander's head, sitting on the commander). The shape of their
   exchange; their words are the model's script (R26). */
export const THRONE_VISITS = ['business', 'aware', 'unaware'] as const;
export function throneVisitor(kind?: string) {
  if (G.phase !== 'loop' || G.visitor) return;
  kind = kind ?? S.visitorKind;
  const dp = V().doorPan, name = S.visitorName ?? '';
  steps(5, -dp * 0.3, dp, 0.08, 0.4, 0.42);
  after(2300, () => { play('knock', { g: 0.5, pan: dp }); after(260, () => play('knock', { g: 0.45, pan: dp })); });
  after(3300, () => say(spoken('activity.comeIn'), 'other'));
  after(4600, () => { play('door_open', { g: 0.5, pan: dp }); G.visitor = { name, heard: kind !== 'unaware', aware: kind !== 'unaware', knows: kind !== 'unaware', kind }; G.stats.visitors = (G.stats.visitors ?? 0) + 1; sense(kind === 'unaware' ? `The door opens. ${name}, in the doorway: she does not look down.` : kind === 'aware' ? `${name} comes in and looks down at you first, then at her.` : `${name} comes in with a folder, all business.`, 'door', 'base'); });
  after(6000 + 3 * 8500, () => { if (!G.visitor) return; play('door_close', { g: 0.5, pan: dp }); sense('The door shuts behind her visitor.', 'door', 'base'); G.visitor = null; });
}
/* the end on a throne: by her presence; with `with` / `glancing` she may have the commander thank her for the seat (typed) */
export function throneThank() {
  if (!throneOn()) return;
  say(tLine('thank'), 'commander');
  G.thank = { until: G.t + 9000 }; G.stats.thankAsked = true;
  after(9000, () => { if (G.thank) { G.thank = null; say(tLine('noThanks'), 'commander'); G.stats.thanked = false; } });
}
/** The answer to her thanks (the frame's Enter on the scene's field): `/thank/i` within 9 s. True when it was the answer. */
export function throneThanked(v: string): boolean {
  if (!G.thank) return false;
  const ok = /thank/i.test(v); G.thank = null; G.stats.thanked = ok; after(700, () => say(tLine(ok ? 'thanked' : 'noThanks'), 'commander'));
  return true;
}
