/**
 * P16b Task 25 (gate G2): stillness under provocation, the game inside `provocation` of her activity's frame (`docs/prototypes/her_activity.html`, "THE PROVOCATION", normative; README "The
 * game inside `provocation`"). She touches, tickles, whispers and feints while the commander kneels before her; while a stimulus is on, any key, any click, a word or a fidget is a reaction (a
 * slip she feels at once), the stimulus pulls the attention like an itch and grows while the attention rests on it, and past 1 the body reacts on its own. Space breathes through it (at most 4.5 s,
 * let out loudly when it runs out). After two clean stimuli in a row she tries harder. Her stimuli take the itch's place (the frame's own itch, swallow and cramp wait).
 *
 * The functions are the prototype's, copied (types added); the frame's `fidelity.json` lists them beside the frame's and declares the differences. The wiring:
 * - `G`, `S`, `ATT`, the canvas and the frame's helpers (`after`, `sense`, `say`, `play`, `bodyNoise`, `herFeels`, `pick`, `rand`, `V`) are the frame's, given at its mount (`attachProvocation`);
 *   `Math.random` is the frame's xorshift (no rng draw);
 * - the commander's `stillness` level is the craft's (`craftLevel`), read at the mount; the commander's `ticklish` is not built (P16c), so the panel's checkbox is unchecked (the multiplier is 1);
 * - her lines are `cardVoice` `provocation.whisper|clean|react|harder` by her style (Rulings Q and Z; a style with no row reads neutral's, an empty row of hers is silent: cold);
 * - a reaction (`provReact` calls `herFeels`) is reported to the engine as `physics/relief` `react` at once: she always feels it, no draw (the engine's `provocationReport`), and a stimulus
 *   that went by with no reaction is `endure` (`provSync`, once for each: the engine pays `stillness`); a held breath let out and a fidget outside a stimulus are the frame's own reliefs (`bodyNoise`);
 * - the places are the prototype's stand-ins for a view's body map (screen points of the view); not ported: the panel's sliders, the summary line (the end's digest is the engine's).
 */
import type { Registries } from '../../../../content/types';
import { voiceLines, type VoiceKind } from '../../cards/voice';
import type { InstrumentEnv } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

/** What the frame gives the game at its mount: its state and helpers (the prototype's globals of her_activity.html). */
export interface ProvocationCtx {
  env: InstrumentEnv;
  G: () => Any;
  S: Any;
  ATT: { x: number; y: number };
  /** The commander's level of `stillness` (the prototype's `#still` slider). */
  stillness: () => number;
  /** The urge canvas's context (`uctx`): the frame's. */
  uctx: () => CanvasRenderingContext2D;
  V: () => Any;
  after(ms: number, fn: () => void): void;
  sense(text: string, where?: Any, cls?: string): void;
  say(text: string, to?: string, opts?: Any): void;
  play(id: string, opts?: Any): Any;
  bodyNoise(kind: string, loud: number, visible: boolean, gross?: boolean): boolean;
  herFeels(kind: string, gross: boolean): void;
  pick<T>(a: readonly T[]): T;
  rand(a: number, b: number): number;
  random(): number;
  /** `physics/relief` `react` / `endure` (the staging's): decided at once by the engine. */
  report(kind: 'react' | 'endure', involuntary?: boolean): void;
}
let X: ProvocationCtx | null = null;

/* ---------- the prototype's globals, as the frame has them ---------- */
const G: Any = new Proxy({}, { get: (_t, k) => X?.G()[k as string], set: (_t, k, v) => { if (X) X.G()[k as string] = v; return true; } });
const S: Any = new Proxy({}, { get: (_t, k) => X?.S[k as string], set: (_t, k, v) => { if (X) X.S[k as string] = v; return true; } });
const ATT: Any = new Proxy({}, { get: (_t, k) => (X?.ATT as Any)?.[k as string] });
const uctx: Any = new Proxy({}, { get: (_t, k) => { const c = X?.uctx() as Any; const v = c?.[k as string]; return typeof v === 'function' ? v.bind(c) : v; }, set: (_t, k, v) => { const c = X?.uctx() as Any; if (c) c[k as string] = v; return true; } });
const V = (): Any => X!.V();
const after = (ms: number, fn: () => void) => X?.after(ms, fn);
const sense = (text: string, where?: Any, cls?: string) => X?.sense(text, where, cls);
const say = (text: string, to?: string, opts?: Any) => X?.say(text, to, opts);
const play = (id: string, opts?: Any) => X?.play(id, opts);
const bodyNoise = (kind: string, loud: number, visible: boolean, gross?: boolean): boolean => X?.bodyNoise(kind, loud, visible, gross) ?? false;
/** Her feeling it is reported to the engine first (she always feels a reaction: `react`, `gross` is the body giving way), then her tell and her answer play as the frame's. */
const herFeels = (kind: string, gross: boolean): void => { X?.report('react', gross); X?.herFeels(kind, gross); };
const pick = (a: readonly Any[]): Any => X!.pick(a);
const rand = (...range: number[]): number => X!.rand(range[0]!, range[1]!);
const Math: typeof globalThis.Math = Object.create(globalThis.Math, { random: { value: () => (X ? X.random() : 0.5) } });
/** The prototype's panel controls this game reads: the stillness slider (the commander's level) and the ticklish checkbox (not built: P16c, so unchecked: the multiplier is 1). */
const $ = (s: string): Any => (s === '#still' ? { value: X?.stillness() ?? 0 } : s === '#ticklish' ? { checked: false } : null);
/** The scene's size (the frame's `innerWidth` / `innerHeight`), set by the frame each frame. */
let innerWidth = 0, innerHeight = 0;
export function provSize(w: number, h: number): void { innerWidth = w; innerHeight = h; }

/** Her lines in the prototype's `PROV_LINES` shape: her style's rows, else neutral's; an empty row of hers is `['']` (silent: cold). */
let PROV_LINES: Record<string, Record<string, string[]>> = { neutral: {} };
function refreshLines(reg: Registries, style: string): void {
  const own = (st: string): Record<string, string[]> => Object.fromEntries(['whisper', 'clean', 'react', 'harder'].map((k) => {
    const l = [...voiceLines(reg, `provocation.${k}` as VoiceKind, st)];
    return [k, l.length === 0 ? [''] : l];
  }));
  PROV_LINES = { neutral: own('neutral'), [style]: own(style) };
}

/* ---------- the game inside: STILLNESS UNDER PROVOCATION (P16b section 6.1, gate G2) ---------- */
export const provOn = () => S.inner === 'provocation';
export const PROV: Any = {
  pull: { touch: 1700, tickle: 2900, whisper: 1200 },        // round 2: a third weaker; holding the attention away is possible
  grow: { touch: 0.15, tickle: 0.27, whisper: 0.1 },         // a second, at level 1, attention elsewhere (round 2b: a long tickle breaks through unless breathed through)
  focusGrow: 0.34,                                            // more while the attention rests on it
  awayCalm: 0.14,                                             // less while it rests on her or the door
  dur: { touch: [2600, 4200], tickle: [2000, 3600], whisper: [2200, 3400], feint: [900, 1500] },
  gap: [5500, 10500],
  ticklish: 1.45, perStill: 0.1, perLevel: 0.22,
  // round 2b: breathing through it (hold Space): the stimulus grows `calm` slower while the breath lasts (`max` ms); it refills at `refill` of real time once let go;
  // a breath that runs out is let out loudly (she may hear), a long one let go is a soft exhale
  breath: { max: 4500, refill: 0.8, calm: 0.4, longAt: 1500, outLoud: 0.32, softLoud: 0.1 },
};
// where on the commander's body (screen points in the view: the commander kneels before her), and how it is felt
export const PROV_PLACES: Any = {
  touch: [{ x: 0.5, y: 0.2, felt: 'A fingertip, slowly, down the back of your neck.' }, { x: 0.36, y: 0.32, felt: 'Her nails trace your ear, barely touching.' },
    { x: 0.64, y: 0.32, felt: 'Her knuckles brush your cheek and stay there.' }, { x: 0.5, y: 0.58, felt: 'Her hand flat on your spine. It moves down, an inch at a time.' },
    { x: 0.3, y: 0.62, felt: 'Her fingertips on the inside of your wrist.' }],
  tickle: [{ x: 0.24, y: 0.5, felt: 'Her fingers find your ribs.' }, { x: 0.76, y: 0.5, felt: 'Under your arm: her fingers, quick and light.' },
    { x: 0.5, y: 0.9, felt: 'Her toes, on the sole of your foot.' }, { x: 0.58, y: 0.42, felt: 'The side of your neck: a fingertip, circling.' }],
  whisper: [{ x: 0.3, y: 0.3, felt: 'Her breath at your ear.' }, { x: 0.7, y: 0.3, felt: 'Her mouth close to your other ear.' }],
};

const provLines = (kind: string) => { const own = (PROV_LINES[S.style] ?? PROV_LINES.neutral)[kind]; const l = own && own.some(Boolean) ? own : PROV_LINES.neutral[kind]; return S.style === 'cold' ? (own ?? ['']) : l; };
export const provLive = () => (G.prov?.live ?? []).some((p: Any) => !p.done);
function provStart(): Any { G.prov = { next: G.t + rand(2500, 4500), live: [], level: 1, clean: 0, air: PROV.breath.max, held: 0, spent: false, stats: { endured: 0, reactions: 0, involuntary: 0, harder: 0, breaths: 0 } }; }
function provSpawn() {
  const P = G.prov, feint = Math.random() < 0.18 && P.level >= 1;
  const kind = feint ? 'touch' : pick(P.level >= 2 ? ['touch', 'tickle', 'tickle', 'whisper'] : ['touch', 'touch', 'tickle', 'whisper']);
  const place = pick(PROV_PLACES[kind]);
  const [a, b] = PROV.dur[feint ? 'feint' : kind];
  const p = { kind, feint, x: place.x * innerWidth, y: place.y * innerHeight, v: feint ? 0 : 0.08, born: G.t, until: G.t + rand(a, b), seed: Math.random() * 10, trail: [] };
  P.live.push(p);
  if (feint) { play('cloth', { g: 0.22, pan: (place.x - 0.5) * 1.4 }); sense(V().sight && !S.blind ? 'Her hand comes close… and stops.' : 'Cloth moves above you. Close. Then nothing.', 'body', 'body'); return; }
  if (kind === 'whisper') { play('soft', { g: 0.18, pan: (place.x - 0.5) * 1.6, rate: 0.85 }); sense(place.felt, 'body', 'body'); after(500, () => say(pick(provLines('whisper')), 'commander', { at: [place.x - 0.08, place.y - 0.06] })); return; }
  play(kind === 'tickle' ? 'cloth' : 'soft', { g: kind === 'tickle' ? 0.3 : 0.2, pan: (place.x - 0.5) * 1.2, rate: kind === 'tickle' ? 1.25 : 1 });
  sense(place.felt, 'body', 'body');
}
/* an input while a stimulus is on is a reaction; returns whether it was one */
export function provInput(how: string) {
  if (!provLive() || (G.phase !== 'loop' && G.phase !== 'empty')) return false;
  provReact(how); return true;
}
export function provReact(how: string, involuntary = false) {
  const P = G.prov; const p = P.live.find((q: Any) => !q.done); if (!p) return;
  p.done = true; p.reacted = true; P.clean = 0;
  P.stats.reactions += 1; if (involuntary) P.stats.involuntary += 1; G.stats.involuntary += involuntary ? 1 : 0;
  const what = p.feint ? 'You flinch from a touch that never comes.' : involuntary ? ({ touch: 'Your skin jumps under her hand before you can stop it.', tickle: 'A laugh breaks out of you. You jerk away.', whisper: 'You turn toward her voice.' } as Record<string, string>)[p.kind]
    : how === 'speak' ? 'You answer her. That was the point.' : how === 'fidget' ? 'You squirm.' : 'You twitch away from her hand.';
  sense(what, 'body', 'body'); G.shake = involuntary ? 0.9 : 0.6;
  play(p.kind === 'tickle' && !p.feint ? 'cloth' : 'soft', { g: 0.4, pan: (p.x / innerWidth - 0.5) });
  herFeels('flinch', involuntary);
  if (G.step === 'with' || G.step === 'glancing') after(900, () => say(pick(provLines('react')), 'commander'));
}
export function provUpdate(dt: number) {
  const P = G.prov ?? provStart() ?? G.prov; const s = dt / 1000;
  if (G.phase !== 'loop' && G.phase !== 'empty') return;
  const lvl = PROV.perLevel * (P.level - 1), still = PROV.perStill * Number($('#still').value), tick = $('#ticklish').checked ? PROV.ticklish : 1;
  // the breath: held with Space, it calms what she does; it runs out
  const B = PROV.breath;
  if (G.spaceHeld && !P.spent && P.air > 0) { if (P.held === 0) P.stats.breaths += 1; P.held += dt; P.air = Math.max(0, P.air - dt); if (P.air === 0) { P.spent = true; sense('The breath runs out of you, loud.', 'body', 'body'); bodyNoise('breath', B.outLoud, false); } }
  else { if (P.held >= B.longAt && !P.spent) bodyNoise('breath', B.softLoud, false); if (!G.spaceHeld) P.spent = false; P.held = 0; P.air = Math.min(B.max, P.air + dt * B.refill); }
  const calm = P.held > 0 ? B.calm : 0;
  for (const p of P.live as Any[]) {
    if (p.done) continue;
    if (!p.feint) {
      const focus = Math.hypot(ATT.x - p.x, ATT.y - p.y) < 50 + p.v * 80; p.focus = focus;
      const g = PROV.grow[p.kind] * (1 + lvl) * (1 - still) * (p.kind === 'tickle' ? tick : 1);
      p.v += s * (g + (focus ? PROV.focusGrow : 0) - (G.listening && !focus ? PROV.awayCalm : 0) - calm);
      p.v = Math.max(0.05, p.v);
      if (p.kind === 'touch' || p.kind === 'tickle') { p.trail.push([p.x + Math.sin((G.t - p.born) / (p.kind === 'tickle' ? 60 : 380) + p.seed) * (p.kind === 'tickle' ? 18 : 36), p.y + (G.t - p.born) / 60]); if (p.trail.length > 40) p.trail.shift(); }
      if (p.v >= 1) { provReact('', true); continue; }
    }
    if (G.t >= p.until) {
      p.done = true;
      if (!p.reacted) {
        P.stats.endured += 1; P.clean += 1;
        if (!p.feint && (G.step === 'with' || G.step === 'glancing') && Math.random() < 0.5) say(pick(provLines('clean')), 'commander');
        if (P.clean >= 2) { P.clean = 0; P.level = Math.min(4, P.level + 1); P.stats.harder += 1; if (G.step !== 'use') after(700, () => say(pick(provLines('harder')), 'commander')); }
      }
    }
  }
  P.live = P.live.filter((p: Any) => !p.done || G.t - p.until < 600);
  if (G.t >= P.next && !provLive()) { provSpawn(); if (P.level >= 3 && Math.random() < 0.3) after(rand(500, 1100), () => provSpawn()); P.next = G.t + rand(...PROV.gap) * (1 - 0.1 * (P.level - 1)); }
}
export function drawProvocation(t: number) {
  const P = G.prov;
  if (P && (P.held > 0 || P.air < PROV.breath.max)) { // the breath left: a thin cool arc around the attention, closing as it runs out
    const k = P.air / PROV.breath.max, r = 34;
    uctx.strokeStyle = `rgba(170,205,255,${(P.held > 0 ? 0.75 : 0.35).toFixed(2)})`; uctx.lineWidth = 2;
    uctx.beginPath(); uctx.arc(ATT.x, ATT.y, r, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); uctx.stroke();
  }
  for (const p of G.prov?.live ?? []) {
    const age = (G.t - p.born) / 1000, fade = p.done ? Math.max(0, 1 - (G.t - p.until) / 600) : 1, pulse = 0.8 + 0.2 * Math.sin(t * 6 + p.seed);
    if (p.feint) { // her hand coming close: a faint warm glow that grows and stops short
      const r = 30 + Math.min(1, age / 1.2) * 50, a = 0.16 * fade * (1 - Math.min(1, age / 1.4));
      const g = uctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r); g.addColorStop(0, `rgba(255,190,215,${a.toFixed(3)})`); g.addColorStop(1, 'rgba(255,150,190,0)');
      uctx.fillStyle = g; uctx.beginPath(); uctx.arc(p.x, p.y, r, 0, Math.PI * 2); uctx.fill(); continue;
    }
    const r = 22 + p.v * 70, a = (0.3 + 0.6 * p.v) * pulse * fade * (p.focus ? 1.25 : 1);
    if (p.kind === 'whisper') { // her breath at the ear: soft rings of her accent
      for (let k = 0; k < 3; k++) { const ph = ((age * 0.9 + k / 3) % 1); uctx.strokeStyle = `rgba(255,170,205,${(a * (1 - ph) * 0.8).toFixed(3)})`; uctx.lineWidth = 1.4; uctx.beginPath(); uctx.arc(p.x, p.y, 14 + ph * r * 1.4, 0, Math.PI * 2); uctx.stroke(); }
      continue;
    }
    // touch: a warm trace where her fingers go; tickle: the same, quick and jittering, with sparks
    const g = uctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 1.5);
    g.addColorStop(0, `rgba(255,225,235,${(a * 0.85).toFixed(3)})`); g.addColorStop(0.3, `rgba(255,140,185,${(a * 0.6).toFixed(3)})`); g.addColorStop(1, 'rgba(255,90,150,0)');
    uctx.fillStyle = g; uctx.beginPath(); uctx.arc(p.x, p.y, r * 1.5, 0, Math.PI * 2); uctx.fill();
    if (p.trail.length > 1) { uctx.strokeStyle = `rgba(255,205,225,${(0.5 * fade).toFixed(3)})`; uctx.lineWidth = p.kind === 'tickle' ? 1.2 : 2.2; uctx.beginPath(); p.trail.forEach(([x, y]: number[], i: number) => (i ? uctx.lineTo(x, y) : uctx.moveTo(x, y))); uctx.stroke(); }
    if (p.kind === 'tickle') { uctx.strokeStyle = `rgba(255,220,235,${(0.45 * p.v * pulse * fade).toFixed(3)})`; uctx.lineWidth = 1; for (let k = 0; k < 9; k++) { const a2 = p.seed + k * 0.7 + t * 9, r1 = r * (0.4 + 0.4 * Math.sin(t * 13 + k)), r2 = r1 + 5 + p.v * 9; uctx.beginPath(); uctx.moveTo(p.x + Math.cos(a2) * r1, p.y + Math.sin(a2) * r1); uctx.lineTo(p.x + Math.cos(a2) * r2, p.y + Math.sin(a2) * r2); uctx.stroke(); } }
  }
}

/** The frame mounts the game on a run where it plays (`provocationOpen` and the floor view), after its own elements are built. */
export function attachProvocation(ctx: ProvocationCtx): void {
  X = ctx;
  reported = 0;
  refreshLines(ctx.env.registries, String(ctx.S.style));
}
export function detachProvocation(): void {
  X = null;
  reported = 0;
  PROV_LINES = { neutral: {} };
}
/** Stimuli already reported as endured (the engine pays each once). */
let reported = 0;
/** After each frame: every stimulus that went by with no reaction since the last one is `endure` to the engine (the prototype's `P.stats.endured`, read, never written). */
export function provSync(): void {
  const n = X ? G.prov?.stats?.endured ?? 0 : 0;
  while (X && reported < n) { reported += 1; X.report('endure'); }
}

/** Tests and the shots only: the game's functions and its state (the prototype's `window.__G().prov`). */
export const _provocation = {
  get prov(): Any { return G.prov; },
  provSpawn, provReact, provInput, provUpdate, provStart, provLines, drawProvocation,
  places: PROV_PLACES,
  get lines(): Record<string, Record<string, string[]>> { return PROV_LINES; },
};
