/**
 * P16b Tasks 23 and 24: the game of postures and the posture call's schemes B and C (`docs/prototypes/posture.html`, approved by the author on
 * 2026-11-27 after rounds 1-1e, normative; its `fidelity.json` checks the port against it). The dial is the surface: while a posture is held (or
 * called) it grows to 300 px, its seven beads (1 TORSO ... 7 FEET) stand on the rim, each point of the body drifts and is corrected by a click on
 * its joint or its key, a correction makes noise and under her eyes a loud one is fidgeting she sees, every event in the room tempts the gaze (6 held
 * through it), "look at me" is an order or a trap, a blindfold darkens the scene and the body speaks in feel lines. Her call grows with the
 * commander: scheme B puts her posture together joint by joint against her foot (taken the moment every point matches), scheme C is her conducting
 * (five calls, about three in ten with no prefix: a trap, and moving is the fault); the hints thin out with the posture's mastery on the pair.
 *
 * The functions are the prototype's, copied (types added). The wiring, declared in `fidelity.json`:
 * - the hold is the engine's (`practices.postureRun`): the preset, her term (`until` beats of 1.5 s, hidden or not), the drift (`driftRates`: the
 *   preset's rates times the day's fatigue, the floor, her weight, the commander's skill and the pair's mastery), her attention (`attentionAt`
 *   at the start of each of the prototype's 6-15 s phases) and the temptations of the gaze (`temptations`: a visitor, her undressing) are read from
 *   the state; the instrument reports what happens (`posture/correct` with the drift at the press and her attention as shown, `posture/slip`,
 *   `posture/end`) and the engine judges: whether she saw a correction (`posture_corrected.seen`), every count, xp, record, Regard and offence;
 * - what the engine has no event for stays the prototype's own, hashed on the run (no rng draw): "look at me" and a sound behind;
 * - her lines are `cardVoice` `posture.<kind>` by her style (a style the prototype has no row of reads neutral's; cold's own, silent where it has
 *   none); her names for her postures are the holder's named set (`practices.postures`); the scene's reply is the model's (`reply` draws nothing);
 * - her call is the engine's (`practices.call`): the called posture is the series' last (or the only) one, her window is `postureWindowMs` plus
 *   2.5 s for each point that has to move, the answer goes out once at the series' end (the posture if every call was taken, none otherwise, late
 *   when one was); without the order interaction the call has no clock (no taps, no dots, nothing is late);
 * - a taken call ends the hold of the body (the commander has a new posture: `posture/end` released, the beats so far);
 * - `performance`, `setTimeout`, `clearTimeout`, `requestAnimationFrame`, `innerWidth` / `innerHeight`, `document` (its body is the film, its root
 *   the surface) and `$` are the mount's own; the sounds are the extension's files (`assets/sounds/ha/`) through the sample layer; the dial is the
 *   prototype's own (the real one is hidden while this draws), 300 px;
 * - the panel's controls the prototype reads (`$('#skill')`, `#mastery`, `#hintStates`, ...) answer from the state and the settings.
 * Not ported (README: prototype only): the panel, the log line, the stats, the hold's own start and end (Space, `end`), the stop pill (the scene's),
 * the stand-in scene (backdrop, sprite, reply, input), the `__` hooks (`_posture` is the tests' and the shots').
 */
import { plainDraft } from '../../../../content/draft';
import type { Registries } from '../../../../content/types';
import { blockingLive, commanderPresetOf, samePreset } from '../../../../engine/blocking';
import { craftLevel } from '../../../../engine/craft/book';
import { craftLive } from '../../../../engine/craft/gate';
import { attentionAt, driftRates, masteryOf, postureEndShown, temptations } from '../../../../engine/craft/posture';
import type { PostureRun } from '../../../../engine/craft/state';
import type { EngineEvent } from '../../../../engine/dispatch';
import { fnv1a } from '../../../../engine/hub';
import { sensoryNow } from '../../../../engine/practice/hold';
import { postureAllowed } from '../../../../engine/practice/postures';
import { practiceOf } from '../../../../engine/dynamic/profile';
import type { CampaignState } from '../../../../engine/state/types';
import { TUNING } from '../../../../engine/tuning';
import type { AliusSettings } from '../../../../settings';
import { analyzeNative } from '../../../analyze/mark';
import { h } from '../../../dom';
import type { SampleSound } from '../../../sound/samples';
import { voiceLines, type VoiceKind } from '../../cards/voice';
import { dialPoseOf } from '../../dial/dial';
import { mannequinSvg } from '../../dial/draw';
import { pose } from '../../dial/mannequin';
import { BASE_POINTS, poseOf, presetPoseOf, type PointStates } from '../../dial/points';
import { onStageReset } from '../../stage';
import { registerPostureInstrument } from '../host';
import { claimStyles, releaseClaim, writeClaimed, type StyleClaim } from '../styleClaims';
import type { HerLook, InstrumentEnv, PostureInstrumentRun } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

/* ---------- the engine's numbers the prototype's tables are (TUNING.craft.posture; the fidelity check compares them with the prototype's) ---------- */
const T = TUNING.craft.posture;
/** The points, their keys and the state each target drifts toward (blocking.md section 7.1 "drifts toward"). */
export const POINTS: string[] = ['torso', 'hips', 'knees', 'arms', 'head', 'gaze', 'feet'];
export const KEY_OF: Record<string, number> = { torso: 1, hips: 2, knees: 3, arms: 4, head: 5, gaze: 6, feet: 7 };
export const DRIFT_TO = T.driftTo;
/** Drift per 10 s at skill 0 (the preset's own rates, `servicePostures[].drift`, are these for all but three presets: a content row of blocking.md section 7.3 says otherwise there). */
export const RATE: Record<string, number> = { torso: 4, hips: 5, knees: 3, head: 4, gaze: 0, feet: 10, arms: 4 };
export const ARM_RATE: Record<string, number> = { raised: 12, behind_head: 9, out_sideways: 10, forward_palms_up: 8, holding: 7, lamp: 9, behind_back: 3, clasped_front: 3 };
export const SLIP_AT = T.slipAt;
/** How a correction sounds: its loudness is (drift / 100)^1.4 (small early corrections are quiet). */
export const LOUD_EXP = T.loudExp;
export const CORRECT_STEP = T.correctStep;
export const SEEN = T.seen;
/** A beat of 1.5 s stands for 45 s of fiction: 30 s a second, times (1 + 0.25 per level). */
export const FICTION_PER_S = TUNING.craft.beatSeconds.posture! / (TUNING.physics.beatMs / 1000);
export const FEEL: Record<string, string[]> = {
  torso: ['the back is sagging', 'the back gives; the chest sinks forward'],
  hips: ['the hips are sinking toward the heels', 'the weight slides back onto the heels'],
  knees: ['the knees are sliding', 'the knees have moved'],
  arms: ['the arms are going numb', 'the arms are dropping; the shoulders burn'],
  head: ['the head is getting heavy', 'the head is sinking'],
  gaze: ['the eyes want to lift', 'the eyes are rising'],
  feet: ['the heels are coming down', 'the heels are taking the weight'],
};
/** Whether "look at me" is a trap (looking is the fault) by style: a hashed share. */
export const TRAP = T.trap;
/** Each point that has to move adds this much to her window (round 1b: the bare window was far too short to assemble in). */
export const ASSEMBLE_MS = 2500;
/** The sounds (posture.html `ASSETS`), the extension's own files; the sample layer decodes them. */
const HA = 'assets/sounds/ha/';
const ASSETS: Any = {
  cloth: [1, 2, 3, 4].map((i) => `${HA}cloth${i}.ogg`), creak: [1, 2, 3].map((i) => `${HA}creak${i}.ogg`), page: [1, 2, 3, 4].map((i) => `${HA}page${i}.ogg`),
  soft: [1, 2].map((i) => `${HA}soft${i}.ogg`), knock: `${HA}knock.ogg`, door: `${HA}door_open.ogg`, doorClose: `${HA}door_close1.ogg`,
  steps: [0, 1, 2].map((i) => `${HA}step_w${i}.ogg`), glass: `${HA}glass1.ogg`, wood: [1, 2].map((i) => `${HA}wood${i}.ogg`),
};
export const SAMPLE_URLS: readonly string[] = Object.values(ASSETS).flat() as string[];

/* ---------- the wiring: what a mount gives the game (the hold's instrument, or a call that has no hold under it) ---------- */
/** What the engine hears of the hold (`PhysicsPanelStaging.posture*`): absent in a call that has no hold. */
interface Report {
  correct(o: { point: string; amount: number; attention: string; beat: number }): EngineEvent[];
  slip(point: string): EngineEvent[];
  end(reason: string, beats: number | undefined): EngineEvent[];
}
interface Stage {
  /** The film under the scene's UI, and the surface in the moment layer (their children are the prototype's elements, by `$`). */
  fx: HTMLElement;
  box: HTMLElement;
  els: Record<string, HTMLElement>;
  now(): number;
  raf(fn: FrameRequestCallback): number;
  cancelRaf(id: number): void;
  timeout(fn: () => void, ms: number): () => void;
  listen(target: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions | boolean): () => void;
  samples: SampleSound | null;
  readonly reduced: boolean;
  state(): CampaignState;
  registries: Registries;
  settings(): AliusSettings;
  look: HerLook;
  /** Her sprites' layer: her attention darkens or lights it (claimed). */
  sprites: HTMLElement | null;
  herClaim: StyleClaim | null;
  report: Report | null;
  frameId: number | null;
  /** The stage's own listeners (a call's surface; the host removes a mount's). */
  offs: Array<() => void>;
}
let E: Stage | null = null;
let innerWidth = 0, innerHeight = 0;
const performance = { now: (): number => (E ? E.now() : 0) };
let timerId = 0;
const cancels = new Map<number, () => void>();
/** The prototype's `setTimeout` returns a handle its `clearTimeout` takes (`say`'s line); the stage's timers are cleared with the mount. */
function setTimeout(fn: () => unknown, ms: number): number {
  const id = ++timerId;
  if (E) cancels.set(id, E.timeout(() => { cancels.delete(id); fn(); }, ms));
  return id;
}
function clearTimeout(id: unknown): void {
  if (typeof id !== 'number') return;
  cancels.get(id)?.();
  cancels.delete(id);
}
function requestAnimationFrame(fn: (now: number) => void): void {
  const e = E;
  if (!e) return;
  e.frameId = e.raf((now) => {
    e.frameId = null;
    if (E !== e) return;
    if (last > now) last = now; // the clock of the mount may be another from the frame's
    sizeOf(e);
    fn(now);
  });
}
/** The scene's size, for the grain (the prototype's `innerWidth` / `innerHeight`). */
function sizeOf(e: Stage): void {
  const r = e.box.getBoundingClientRect();
  const w = e.box.clientWidth || r.width || globalThis.innerWidth || 0, hh = e.box.clientHeight || r.height || globalThis.innerHeight || 0;
  if (w !== innerWidth || hh !== innerHeight) { innerWidth = w; innerHeight = hh; sizeGrain(); }
}
/** The prototype's `document`: its body is the film (the blind class), its root the surface (the dial's size), and its panel's buttons are not there. */
const document: Any = {
  get body(): HTMLElement { return E!.fx; },
  get documentElement(): HTMLElement { return E!.box; },
  querySelectorAll: (): Element[] => [],
  createElement: (tag: string): HTMLElement => globalThis.document.createElement(tag),
  createElementNS: (ns: string, tag: string): Element => globalThis.document.createElementNS(ns, tag),
};
/** The prototype's `log` and `stats` are its panel's. */
const log = (_t: string): void => {};
const stats = (): void => {};
/** The scene's reply is the model's: what the prototype writes there of a visitor is the scene's own prose here. */
const reply = (_act: string, _speech: string): void => {};

/* ---------- what the engine says of this hold (the wiring's state) ---------- */
interface CallInfo {
  id: string; holderId: string; postureId: string; taught: boolean; timed: boolean; windowMs: number;
  take: (postureId: string | undefined, late: boolean) => void;
  /** The call made the surface (no hold is under it): it takes it down when it is done. */
  owns: boolean;
  series: { ok: boolean; late: boolean };
  answered: boolean;
  onGone?: () => void;
}
const WR: {
  run: PostureRun | null; holderId: string; term: number; hidden: boolean; t0: number; rates: Record<string, number>; eyes: boolean; blind: boolean;
  call: CallInfo | null; ended: boolean; played: Set<string>; cancelled: boolean;
} = { run: null, holderId: '', term: 0, hidden: false, t0: 0, rates: {}, eyes: false, blind: false, call: null, ended: false, played: new Set(), cancelled: false };
/** The beats the instrument plays (1.5 s each): the engine counts a hold in them. */
const BEAT_S = TUNING.physics.beatMs / 1000;
/** The temptations already played, by `scene|run|key`: a remount of the same hold never replays them (scene ids repeat across campaigns: cleared on a chat switch). */
const PLAYED = new Set<string>();
onStageReset(() => { PLAYED.clear(); });

/** The commander's current posture's name for her, and her named set: `[preset id, her name]` in her order. */
let NAMED: Array<[string, string]> = [];
/** The presets (the registry's, in the prototype's `PRESETS` shape). */
let PRESETS: Any[] = [];
/** Her lines (`cardVoice` `posture.*` by her style, `refreshLines`) in the prototype's `LINES` shape. */
export const LINE_KINDS = ['start', 'watch', 'fidget', 'slip', 'gaze', 'release', 'clean', 'prefix', 'taken', 'wrong', 'late', 'look', 'down', 'notLooking'] as const;
export let LINES: Record<string, Record<string, Any>> = { neutral: {} };

/* ---------- state ---------- */
const S: Any = {
  style: 'neutral', attention: 'busy', preset: '', run: null, call: null, sel: null,
  sound: true, showNum: false, held: { gaze: false }, look: null, stance: null,
  get reduced(): boolean { return E?.reduced ?? false; },
};
let lineT: Any = null;
let grC: HTMLCanvasElement, grctx: CanvasRenderingContext2D, grainAcc = 0;
let last = 0;

/* ---------- the prototype's controls, answered from the state and the settings ---------- */
const HERS = (): Any => new Proxy({ style: {} as Record<string, string> }, {
  get: (t, p) => (p === 'style' ? new Proxy({}, { set: (_x, k, v) => { if (E?.herClaim) writeClaimed(E.herClaim, String(k), String(v)); return true; } }) : (t as Any)[p]),
});
const CONTROL: Record<string, () => Any> = {
  '#bigSel': () => ({ value: '300' }),
  '#skill': () => ({ value: String(craftLevel(E!.state(), 'posture')) }),
  '#mastery': () => ({ value: String(masteryOf(E!.state(), WR.holderId, S.call?.id ?? S.preset)) }),
  '#hintStates': () => ({ checked: E!.settings().postureHints === true || WR.call?.taught === true }),
  '#eyesRule': () => ({ checked: WR.eyes }),
  '#blind': () => ({ checked: WR.blind }),
  '#autoAttn': () => ({ checked: true }),
  '#autoEv': () => ({ checked: true }),
  '#speed': () => ({ value: '1' }),
  '#presetSel': () => ({ value: '' }),
  '#stopPill': () => ({ style: {} }),
  '#her': HERS,
};
const $ = (s: string): Any => (E!.els[s] ?? CONTROL[s]?.() ?? { style: {}, classList: { add() {}, remove() {}, toggle() {} } });
const sfx = (file: string, gain = 0.3, pan = 0, rate = 1): void => { E?.samples?.play(file, { gain, pan, rate }); };

/* ---------- what the engine is asked and told ---------- */
/** One of her attentions for a beat of the hold: the engine's plan (her activity's weights; a clinical holder always watches). */
function herAttention(beat: number): 'watching' | 'glancing' | 'busy' {
  return attentionAt(E!.state(), E!.registries, WR.run!, beat);
}
/** Tells the engine a correction was made (the drift at the press, her attention as shown): whether she saw it is its answer; without an answer, the prototype's own rule. */
function engineSeen(k?: Any, o?: Any, loud?: Any): boolean {
  let events: EngineEvent[] = [];
  try {
    events = E?.report?.correct({ point: k, amount: Math.min(SLIP_AT, Math.max(0, o)), attention: S.attention, beat: Math.floor(S.run.t / BEAT_S) }) ?? [];
  } catch { /* a refused report never stops the game */ }
  const e = events.find((x) => x.type === 'posture_corrected');
  return e !== undefined ? e.seen === true : loud > SEEN[S.attention];
}
function reportSlip(point: string): void {
  try { E?.report?.slip(point); } catch { /* a refused report never stops the game */ }
}
/** The hold is over by her term (or the body is in a new posture): the engine hears how many beats it ran. */
function reportEnd(r?: Any, beats?: number): void {
  WR.ended = true;
  const planned = WR.run?.until;
  try { E?.report?.end('released', beats ?? planned ?? Math.floor(r.t / BEAT_S)); } catch { /* the hold is gone already */ }
}
/** The index in her set of the call at this place of its series: the last (or only) one is the engine's, the others a hashed pick that is neither the body's nor the last. */
function callIndex(seriesLeft: number, nowId: string | undefined): number {
  const n = NAMED.length;
  const want = Math.max(0, NAMED.findIndex((x) => samePreset(E!.registries, x[0], WR.call!.postureId)));
  if (seriesLeft === 0) return want;
  let idx = fnv1a(`call|${WR.call!.id}|${seriesLeft}`) % n;
  for (let i = 0; i < n && (NAMED[idx]![0] === nowId || (idx === want && n > 1)); i++) idx = (idx + 1) % n;
  return idx;
}
/** The call's last (or only) answer goes to the engine: the posture if every call of the series was taken, none otherwise; a taken call is a new posture, so the hold of the old one ends. */
function callAnswered(c: Any, outcome: string): void {
  const info = WR.call;
  if (!info) return;
  info.series.ok = info.series.ok && (outcome === 'taken' || outcome === 'trap');
  info.series.late = info.series.late || outcome === 'late';
  if (c.seriesLeft > 0) return;
  info.answered = true;
  const r = S.run;
  if (info.series.ok && r) { // the body has a new posture: she has released the old one
    S.stance = { base: c.base, points: c.body.points, id: c.id };
    endHold(null, true);
    reportEnd(r, Math.floor(r.t / BEAT_S));
  }
  info.take(info.series.ok ? info.postureId : undefined, !info.series.ok && info.series.late);
  if (info.owns) E?.timeout(() => closeCall(), 3700);
}

/* ---------- the prototype's helpers ---------- */

const hash01 = (k: Any) => fnv1a(k) / 4294967296;

const pickLine = (kind: Any, k: Any) => { const l = (LINES[S.style][kind] ?? [])[0] !== undefined ? LINES[S.style][kind] : LINES.neutral[kind]; const list = l.filter(Boolean).length ? l : (S.style === 'cold' ? [''] : LINES.neutral[kind]); return list[fnv1a(`${S.run?.id ?? 0}|${k}|${kind}`) % list.length]; };

const STATE_WORD = (s: Any) => s.replaceAll('_', ' ');

const presetOf = (id: Any) => PRESETS.find((p) => p.id === id);

const nameOf = (id: Any) => NAMED.find((n) => n[0] === id)?.[1];

const anyOf = (list: Any, k: Any) => list[fnv1a(k) % list.length];

function bigSize() { return Number($('#bigSel').value); }

function targetPose() {
  const p = presetOf(S.preset); const points = { ...(BASE_POINTS[p.base] ?? {}), ...p.points };
  if (S.run?.eyes && points.gaze === undefined) points.gaze = 'down';
  if (S.run?.eyes) points.gaze = 'down';
  return { ...p, points };
}

function activePoints() {
  const p = presetOf(S.preset); const pts = Object.keys(p.points).filter((k) => POINTS.includes(k) && driftOf(k, p.points[k]) !== null);
  if (S.run?.eyes && !S.run.blind && !pts.includes('gaze')) pts.push('gaze');
  if (S.run?.blind) return pts.filter((k) => k !== 'gaze');
  return pts;
}

function driftOf(point?: Any, state?: Any) { return DRIFT_TO[point]?.[state] ?? null; }

function blendedBody(target?: Any, offsets?: Any) {
  const A = pose(target);
  const out = JSON.parse(JSON.stringify(A));
  for (const [pt, o] of Object.entries(offsets) as Array<[string, Any]>) {
    const to = driftOf(pt, target.points[pt]); if (!to || o <= 0) continue;
    const B = pose({ ...target, points: { ...target.points, [pt]: to } });
    const t = Math.min(1, o / SLIP_AT) * 0.9;
    const walk = (a: Any, b: Any, o2: Any) => { for (const k of Object.keys(o2)) { if (Array.isArray(o2[k])) { for (let i = 0; i < 3; i++) o2[k][i] += (b[k][i] - a[k][i]) * t; } else if (o2[k] && typeof o2[k] === 'object') walk(a[k], b[k], o2[k]); } };
    if (A.gazeDir && B.gazeDir) walk(A, B, out); else walk({ ...A, gazeDir: undefined }, { ...B, gazeDir: undefined }, out);
  }
  for (const k of ['headDir', 'faceDir', 'gazeDir']) if (out[k]) { const l = Math.hypot(...out[k]); out[k] = out[k].map((v: Any) => v / l); }
  return out;
}

/** The joint each point rings (the prototype's `JOINT_OF`). */
export const JOINT_OF: Record<string, string> = { torso: 'shoulders', arms: 'elbows', hips: 'hips', knees: 'knees', head: 'head', gaze: 'gaze' };

function anchors(svg?: Any) {
  const seg = (s: Any, side: Any, end = 'a') => { const el = svg.querySelector(`.alius-mq-body path.alius-mq-fill[data-seg="${s}"]${side ? `[data-side="${side}"]` : ''}`); if (!el) return null;
    const m = el.getAttribute('d').match(/M([\d.-]+) ([\d.-]+)L([\d.-]+) ([\d.-]+)/); return m ? (end === 'a' ? [+m[1], +m[2]] : [+m[3], +m[4]]) : null; };
  const head = svg.querySelector('.alius-mq-head'); const gz = svg.querySelector('.alius-mq-gaze');
  return {
    torso: [seg('torso', null, 'b')], arms: [seg('forearm', 'L'), seg('forearm', 'R')], hips: [seg('thigh', 'L'), seg('thigh', 'R')], knees: [seg('shin', 'L'), seg('shin', 'R')],
    head: head ? [[+head.getAttribute('cx'), +head.getAttribute('cy')]] : [], gaze: gz ? [[(+gz.getAttribute('x1') + +gz.getAttribute('x2')) / 2, (+gz.getAttribute('y1') + +gz.getAttribute('y2')) / 2]] : [],
    feet: [seg('foot', 'L'), seg('foot', 'R')],
  };
}

function drawDial() {
  const r = S.run; const face = $('#dialFace');
  let svg;
  if (!r) {
    svg = mannequinSvg(S.stance ?? poseOf('standing'));
  } else {
    const target = targetPose();
    const hot: Any = activePoints().filter((k) => r.o[k] > 22 && JOINT_OF[k]).map((k) => JOINT_OF[k]);
    svg = mannequinSvg(target, { body: blendedBody(target, r.o), target, hot });
    const an: Any = anchors(svg);
    // the feet have no joint of their own: a ring at the ankles while they drift
    if (activePoints().includes('feet') && r.o.feet > 22) for (const a of an.feet) if (a) svg.append(circle(a, 4.5, 'mqHot'));
    for (const k of activePoints()) for (const a of an[k] ?? []) if (a) { const c = circle(a, 15, 'hit'); c.dataset.point = k; c.addEventListener('pointerdown', (e: Any) => { e.preventDefault(); press(k); }); svg.append(c); }
  }
  face.replaceChildren(svg);
  drawBeads(); drawLabel();
}

function circle([x, y]: Any, r: Any, cls: Any) { const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', r); c.setAttribute('class', cls); return c; }

function drawBeads() {
  const host = $('#beads'); host.replaceChildren();
  if (!S.run && !S.call) return;
  const size = S.run || S.call ? bigSize() : 200; const R = size / 2 + 20; const act = S.call ? POINTS : activePoints();
  [...POINTS].reverse().forEach((k, ri) => { const i = ri;
    const ang = (122 + i * 19) * Math.PI / 180; // an arc down the left side of the rim: 1 (torso) at the top-left … 7 (feet) at the bottom-left, as the body
    const b = document.createElement('div'); b.className = 'bead'; b.textContent = KEY_OF[k];
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = k.toUpperCase(); b.append(nm);
    b.style.left = `${size / 2 + Math.cos(ang) * R}px`; b.style.top = `${size / 2 + Math.sin(ang) * R}px`;
    b.style.setProperty('--o', S.run ? Math.min(1, (S.run.o[k] ?? 0) / SLIP_AT) : 0);
    if (!act.includes(k)) b.classList.add('off');
    if (S.held[k]) b.classList.add('held');
    if (S.sel === k) b.classList.add('sel');
    if (S.call && pointsShown() && !S.call.trap && k !== 'gaze' && S.call.want[k] !== undefined && S.call.body.points[k] !== S.call.want[k]) b.classList.add('todo');
    b.addEventListener('pointerdown', (e: Any) => { e.preventDefault(); press(k); });
    host.append(b);
  });
}

function drawLabel() {
  const r = S.run; const p = presetOf(S.preset); const nm = r ? nameOf(S.preset) : null;
  const eyes = r?.eyes && !r.blind ? '<span class="sub">EYES DOWN</span>' : '';
  const clk = r ? `<span id="clock">${fictionClock(r.fiction)}${r.hidden ? '' : ` · ${Math.max(0, Math.ceil(r.term - r.t))} s left`}</span>` : '';
  $('#dialLabel').innerHTML = r ? `${nm ? `<span class="herName">${nm}</span>` : ''}${STATE_WORD(p.id)}${eyes}${clk}` : (S.stance ? STATE_WORD(S.stance.id ?? S.stance.base) : 'standing');
}

function fictionClock(sec?: Any) { const m = Math.floor(sec / 60); const h = Math.floor(m / 60); return h ? `${h} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`; }

function startHold() {
  endHold(null, true);
    S.run = {
    id: WR.run!.id, t: WR.t0, fiction: WR.t0 * FICTION_PER_S, term: WR.term, hidden: WR.hidden,
    o: {}, eyes: $('#eyesRule').checked, blind: $('#blind').checked, corrections: 0, loud: 0, fidgets: 0, slips: 0, gazeSlips: 0, impulses: [], nextEv: 14, nextAttn: 0, feelSaid: {},
  };
  for (const k of POINTS) S.run.o[k] = 0;
  S.stance = null;
  $('#dial').classList.add('holding'); $('#dial').classList.toggle('blind', S.run.blind); document.body.classList.toggle('blind', S.run.blind); $('#stopPill').style.display = 'block';
  document.documentElement.style.setProperty('--dialBig', `${bigSize()}px`);
  say(pickLine('start', 'start'));
  sfx(anyOf(ASSETS.cloth, `take|${S.run.id}`), 0.35);
  drawDial();
}

function endHold(reason?: Any, silent?: Any) {
  const r = S.run; if (!r) return;
  S.run = null; S.held = { gaze: false };
  $('#dial').classList.remove('holding', 'watched', 'blind'); document.body.classList.remove('blind'); $('#stopPill').style.display = 'none'; $('#vignette').style.opacity = 0;
  if (!silent) {
    if (reason === 'released') say(r.slips === 0 && r.fidgets === 0 ? (pickLine('clean', 'clean') || pickLine('release', 'rel')) : pickLine('release', 'rel'));
    log(`${reason}: ${fictionClock(r.fiction)} of fiction · ${r.corrections} corrections (${r.loud} loud) · ${r.fidgets} seen · ${r.slips} slips · ${r.gazeSlips} looked up`);
    S.stance = targetPose();
  }
  drawDial(); stats();
  if (!silent && reason === 'released') reportEnd(r);
}

function rateOf(k?: Any) {
  if (k === 'gaze') return 0;
  const base = WR.rates[k] ?? 0;
  // a hold tires the body as it goes: +40 % over the first two minutes
  const within = 1 + Math.min(0.4, (S.run.t / 120) * 0.4);
  // past half way a drift feeds itself (the muscle gives faster as it goes)
  const self = 1 + Math.max(0, S.run.o[k] - 50) / 100;
  return (base / 10) * within * self;
}

function step(dt?: Any) {
  const r = S.run; if (!r) return;
  r.t += dt; r.fiction += dt * FICTION_PER_S * (1 + 0.25 * Number($('#skill').value));
  for (const k of activePoints()) {
    r.o[k] = Math.min(SLIP_AT, r.o[k] + rateOf(k) * dt);
    if (r.blind) feelLines(k);
    if (r.o[k] >= SLIP_AT) slip(k);
  }
  // the gaze: the impulses push it up unless 6 is held
  if (activePoints().includes('gaze')) {
    for (const im of r.impulses) {
      const live = im.left > 0; if (!live) continue;
      im.left -= dt;
      if (!S.held.gaze) r.o.gaze = Math.min(SLIP_AT, r.o.gaze + (im.size / im.len) * dt * 1.6);
    }
    r.impulses = r.impulses.filter((im: Any) => im.left > 0);
    if (r.o.gaze >= SLIP_AT) slip('gaze');
  }
  // her attention and her world (hashed timelines)
  if ($('#autoAttn').checked && r.t >= r.nextAttn) {
    const next = herAttention(Math.floor(r.t / (TUNING.physics.beatMs / 1000)));
    setAttention(next); r.nextAttn = r.t + 6 + hash01(`attnLen|${r.id}|${Math.floor(r.t)}`) * 9;
  }
  if (S.attention === 'busy' && hash01(`page|${r.id}|${Math.floor(r.t * 2)}`) < 0.06 * dt * 2) sfx(anyOf(ASSETS.page, `p|${r.t}`), 0.12, 0.35);
  if ($('#autoEv').checked && r.t >= r.nextEv) {
    const k = hash01(`ev|${r.id}|${Math.floor(r.t)}`); if (k >= 0.55) event(k < 0.85 ? 'sound' : 'look');
    r.nextEv = r.t + 22 + hash01(`evGap|${r.id}|${Math.floor(r.t)}`) * 24;
  }
  // "look at me": the window to obey (or not to)
  if (S.look) {
    S.look.left -= dt;
    if (S.look.left <= 0) {
      if (S.look.phase === 'asked') { if (S.look.trap) { say(pickLine('taken', 'trap ok') || '…'); } else { fault('notLooking', 'did not look when told'); } S.look = null; }
      else if (S.look.phase === 'up') { slip('gaze', 'kept looking'); S.look = null; }
    }
  }
  if (r.t >= r.term) endHold('released');
  else { drawDial(); stats(); }
}

function feelLines(k?: Any) {
  const r = S.run; const o = r.o[k];
  for (const [at, i] of [[40, 0], [72, 1]]) { const key = `${k}|${at}`; if (o >= at && !r.feelSaid[key]) { r.feelSaid[key] = true; feel(FEEL[k][i], at > 60); } }
  if (o < 30) { delete r.feelSaid[`${k}|40`]; delete r.feelSaid[`${k}|72`]; }
}

function press(k?: Any) {
  if (S.call) { callPress(k); return; }
  const r = S.run; if (!r || !activePoints().includes(k)) return;
  if (k === 'gaze' && r.impulses.length) { S.held.gaze = true; drawBeads(); return; } // through a temptation, 6 is held, not tapped
  if (S.look?.phase === 'up' && k === 'gaze') { S.look = null; r.o.gaze = 0; say(pickLine('taken', 'down ok') || ''); sfx(anyOf(ASSETS.soft, `down|${r.t}`), 0.12); drawDial(); return; }
  const o = r.o[k]; if (o < 2) return;
  const loud = Math.pow(o / SLIP_AT, LOUD_EXP);
  r.o[k] = Math.max(0, o - CORRECT_STEP); r.corrections++;
  if (loud > 0.45) r.loud++;
  sfx(anyOf(ASSETS.cloth, `c|${k}|${r.corrections}`), 0.05 + loud * 0.5, 0, 1.15 - loud * 0.3);
  if (loud > 0.55) sfx(anyOf(ASSETS.creak, `cr|${r.corrections}`), loud * 0.35);
  if (!S.reduced && loud > 0.3) jolt(loud);
  if (engineSeen(k, o, loud)) { r.fidgets++; say(pickLine('fidget', `f${r.fidgets}`)); if (r.fidgets % 3 === 0) slip(k, 'fidgeting'); }
  drawDial();
}

function release(k?: Any) { if (k === 'gaze' && S.held.gaze) { S.held.gaze = false; drawBeads(); } }

function fault(kind?: Any, why?: Any) {
  const r = S.run; if (!r) return; r.slips++;
  say(pickLine(kind, `${kind}${r.slips}`)); sfx(anyOf(ASSETS.creak, `fault|${r.slips}`), 0.35); if (!S.reduced) jolt(0.6);
  log(`slip: ${why}`);
  reportSlip('gaze');
}

function slip(k?: Any, why?: Any) {
  const r = S.run; if (!r) return;
  r.slips++; if (k === 'gaze') r.gazeSlips++;
  say(k === 'gaze' ? pickLine('gaze', `g${r.gazeSlips}`) : pickLine('slip', `s${r.slips}`));
  sfx(anyOf(ASSETS.creak, `slip|${r.slips}`), 0.45); if (!S.reduced) jolt(0.9);
  r.o[k] = 35; // she puts it back (her correction): the drift starts again from there
  log(`slip: ${k}${why ? ` (${why})` : ''}`);
  if (why !== 'fidgeting') reportSlip(k);
}

function jolt(a?: Any) { const d = $('#dial'); d.style.setProperty('--jx', `${(a * 5).toFixed(1)}px`); d.style.setProperty('--jy', `${(a * 3).toFixed(1)}px`); d.classList.remove('jolt'); void d.offsetWidth; d.classList.add('jolt'); }

function event(kind?: Any) {
  const r = S.run; if (!r) return;
  const im = (size: Any, len: Any) => r.impulses.push({ size, len, left: len });
  if (kind === 'visitor') { sfx(ASSETS.knock, 0.4, -0.6); setTimeout(() => sfx(ASSETS.door, 0.35, -0.6), 900); setTimeout(() => { sfx(anyOf(ASSETS.steps, 'st'), 0.3, -0.4); reply(r.blind ? 'The door opens. A voice from the doorway, stopping.' : 'Someone opens the door, stops halfway in.', '"Oh — sorry. I\'ll come back."'); }, 1400); setTimeout(() => sfx(ASSETS.doorClose, 0.3, -0.6), 4600); im(50, 4.5); }
  if (kind === 'undress') { sfx(ASSETS.cloth[2], 0.35, 0.3); reply(r.blind ? 'Cloth rustles above; something soft drops on the desk.' : 'She pulls her shirt over her head and drops it on the desk.', ''); im(30, 3.5); }
  if (kind === 'sound') { sfx(ASSETS.glass, 0.4, -0.8); reply(r.blind ? 'Behind the commander something falls and rolls across the floor.' : 'Something falls behind the commander and rolls across the floor.', ''); im(30, 3); }
  if (kind === 'look' && r.blind) return;
  if (kind === 'look') {
    const trap = hash01(`trap|${r.id}|${Math.floor(r.t)}`) < (TRAP[S.style] ?? 0.2);
    S.look = { trap, phase: 'asked', left: 3.5 }; say(pickLine('look', 'look'));
  }
  log(`temptation: ${kind}${kind === 'look' ? '' : ' — hold 6'}`);
}

function lookUp() {
  const r = S.run; if (!r || !S.look) { if (r && activePoints().includes('gaze')) { slip('gaze', 'looked up unbidden'); } return; }
  if (S.look.phase !== 'asked') return;
  if (S.look.trap) { slip('gaze', 'a trap'); say(pickLine('down', 'trap')); S.look = null; return; }
  r.o.gaze = 90; S.look = { phase: 'up', left: 3.5 }; sfx(anyOf(ASSETS.soft, 'up'), 0.12);
  setTimeout(() => { if (S.look?.phase === 'up') say(pickLine('down', 'down')); }, 1600);
}

function setAttention(a?: Any) {
  if (S.attention === a) return; S.attention = a;
  const lum = { busy: 0.78, glancing: 0.9, watching: 1.03 }[a as 'busy'];
  $('#her').style.filter = `brightness(${lum})`; $('#vignette').style.opacity = a === 'watching' ? 0.55 : 0;
  $('#dial').classList.toggle('watched', a === 'watching' && !!S.run);
  if (a === 'watching') { sfx(anyOf(ASSETS.wood, `w|${S.run?.t}`), 0.18, 0.3); if (hash01(`wl|${S.run?.id}|${Math.floor(S.run?.t ?? 0)}`) < 0.4) say(pickLine('watch', `w${Math.floor(S.run?.t ?? 0)}`)); }
  [...document.querySelectorAll('#attn .opt')].forEach((b) => b.classList.toggle('on', b.dataset.v === a));
}

function statesFor(k?: Any) {
  const set = new Set(); for (const [id] of NAMED) { const p = presetOf(id); const v = { ...(BASE_POINTS[p.base] ?? {}), ...p.points }[k]; if (v) set.add(v); }
  const now = S.call.body.points[k]; if (now) set.add(now); return [...set];
}

function startCall(kind?: Any, seriesLeft = 0) {
  const prevBody = S.run ? targetPose() : (S.stance ?? poseOf('standing'));
  // she calls a posture the body is not already in
  const nowId = S.run ? S.preset : S.stance?.id; const idx = callIndex(seriesLeft, nowId); const [id, word] = NAMED[idx];
  const trap = kind === 'C' && hash01(`ctrap|${WR.call!.id}|${seriesLeft}`) < 0.3;
  const want = presetOf(id);
  const wantPts = { ...(BASE_POINTS[want.base] ?? {}), ...want.points };
  const nowPts = { ...(BASE_POINTS[prevBody.base] ?? {}), ...(prevBody.points ?? {}) };
  // assembling takes time: her window (ritual 4 s, drill 3 s, others 5 s) plus ASSEMBLE_MS for each point that has to move
  const toMove = POINTS.filter((k) => k !== 'gaze' && wantPts[k] !== undefined && nowPts[k] !== wantPts[k]).length;
  const windowMs = WR.call!.windowMs + ASSEMBLE_MS * toMove;
  S.call = { kind, id, word, want: wantPts, base: want.base, body: { base: want.base, points: nowPts }, trap, until: performance.now() + windowMs, windowMs, seriesLeft, toMove };
  if (S.run) S.run.paused = true;
  $('#callWord .pre').textContent = trap ? '' : (LINES[S.style].prefix ?? LINES.neutral.prefix);
  const w = $('#callWord .w'); w.textContent = word; w.classList.remove('write'); void w.offsetWidth; if (!S.reduced) w.classList.add('write');
  $('#dial').classList.add('holding'); document.documentElement.style.setProperty('--dialBig', `${bigSize()}px`);
  if (WR.call!.timed) scheduleTaps(windowMs); S.sel = null; drawStates(); drawCallDial();
  log(kind === 'B' ? `B: set each point (its key, then the key again cycles its states); taken the moment it matches · ${(windowMs / 1000).toFixed(1)} s` : `C: ${trap ? 'no prefix — a trap: do not move' : 'her prefix — assemble'} · ${seriesLeft} more`);
}

function scheduleTaps(ms?: Any) { const dots = $('#dots'); dots.replaceChildren(); const n = 5; for (let i = 0; i < n; i++) setTimeout(() => { if (!S.call) return; const d = document.createElement('i'); if (i === n - 1) d.className = 'last'; d.style.left = `${(i - (n - 1) / 2) * 16}px`; dots.append(d); sfx(anyOf(ASSETS.wood, `tap${i}`), 0.14 + i * 0.03, 0.4); }, (ms / n) * (i + 0.5)); }

function callPress(k?: Any) {
  const c = S.call; if (!c) return;
  if (c.trap) { endCall('moved', 'a trap: no prefix'); return; }
  const list = statesFor(k); if (!list.length) return;
  if (S.sel !== k) { S.sel = k; } else { const i = list.indexOf(c.body.points[k]); c.body.points[k] = list[(i + 1) % list.length]; sfx(anyOf(ASSETS.cloth, `cc|${k}|${i}`), 0.12); }
  drawStates(); drawCallDial(); checkTaken();
}

function matches(c?: Any) { return POINTS.every((k) => k === 'gaze' || c.want[k] === undefined || c.body.points[k] === c.want[k]); }

function checkTaken() { const c = S.call; if (c && !c.trap && matches(c)) present(); }

function pickState(k?: Any, v?: Any) { const c = S.call; if (!c) return; if (c.trap) { endCall('moved', 'a trap'); return; } c.body.points[k] = v; S.sel = k; drawStates(); drawCallDial(); checkTaken(); }

function drawStates() {
  const host = $('#states'); host.replaceChildren(); const c = S.call; if (!c || !S.sel) { host.classList.remove('on'); return; }
  host.classList.add('on'); const hd = document.createElement('div'); hd.className = 'hd'; hd.textContent = `${KEY_OF[S.sel]} · ${S.sel.toUpperCase()}`; host.append(hd);
  for (const v of statesFor(S.sel)) { const b = document.createElement('div'); b.className = 'st' + (c.body.points[S.sel] === v ? ' cur' : '') + (hintOn() && c.want[S.sel] === v ? ' want' : ''); b.textContent = STATE_WORD(v); b.addEventListener('pointerdown', (e: Any) => { e.preventDefault(); pickState(S.sel, v); }); host.append(b); }
}

const hintLevel = () => ($('#hintStates').checked ? 0 : Number($('#mastery').value));

const ghostShown = () => hintLevel() < 2;

const hintOn = () => hintLevel() < 2;

const pointsShown = () => hintLevel() < 4;

function drawCallDial() { const c = S.call; const svg = mannequinSvg({ base: c.base, points: c.body.points }, ghostShown() ? { target: { base: c.base, points: c.want } } : {}); const face = $('#dialFace'); face.replaceChildren(svg);
  const an: Any = anchors(svg); for (const k of POINTS) for (const a of an[k] ?? []) if (a) { const h = circle(a, 15, 'hit'); h.addEventListener('pointerdown', (e: Any) => { e.preventDefault(); callPress(k); }); svg.append(h); }
  drawBeads(); $('#dialLabel').innerHTML = `<span class="herName">${c.word}</span>${c.trap ? '' : 'assemble'}`; }

function present() {
  const c = S.call; if (!c) return; if (c.trap) { endCall('moved', 'a trap'); return; }
  const late = WR.call!.timed && performance.now() > c.until; const right = matches(c);
  endCall(right && !late ? 'taken' : late ? 'late' : 'wrong');
}

function endCall(outcome?: Any, why?: Any) {
  const c = S.call; if (!c) return; S.call = null; S.sel = null; drawStates();
  $('#callWord .w').textContent = ''; $('#callWord .pre').textContent = ''; $('#dots').replaceChildren();
  const line = outcome === 'taken' ? pickLine('taken', 'tk') : outcome === 'late' ? pickLine('late', 'lt') : outcome === 'trap' ? (pickLine('taken', 'tr') || '…') : pickLine('wrong', 'wr');
  say(line || '…'); log(`call ${c.kind}: ${outcome}${why ? ` (${why})` : ''}`);
  if (outcome === 'taken') { S.preset = c.id; $('#presetSel').value = c.id; if (S.run) { S.run.paused = false; for (const k of POINTS) S.run.o[k] = 0; } }
  else if (S.run) { S.run.paused = false; S.run.slips++; }
  if (!S.run) { S.stance = { base: c.base, points: c.body.points, id: outcome === 'taken' ? c.id : null }; $('#dial').classList.remove('holding'); }
  drawDial();
  if (c.kind === 'C' && c.seriesLeft > 0) setTimeout(() => startCall('C', c.seriesLeft - 1), 2600 + hash01(`gap|${c.seriesLeft}`) * 2400);
  callAnswered(c, outcome);
}

function callTick() {
  const c = S.call; if (!c) return;
  if (!WR.call!.timed && !c.trap) return;
  if (performance.now() > c.until + 600) { if (c.trap) endCall('trap', 'held still: right'); else endCall('late'); }
}

function say(text?: Any) { if (!text) return; const el = $('#herLine'); el.textContent = text; el.classList.remove('write', 'on'); void el.offsetWidth; el.classList.add('on'); if (!S.reduced) el.classList.add('write'); clearTimeout(lineT); lineT = setTimeout(() => el.classList.remove('on'), 3600); }

function feel(text?: Any, sharp?: Any) { const d = document.createElement('div'); d.textContent = text; if (sharp) d.className = 'sharp'; $('#feel').replaceChildren(d); }

function drawGrain(dt?: Any) { grainAcc += dt; if (grainAcc < 80) return; grainAcc = 0; const W = grC.width, H = grC.height, img = grctx.createImageData(W, H), d = img.data; for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } grctx.putImageData(img, 0, 0); }

function frame(now?: Any) {
  drawGrain(now - last);
  const dt = Math.min(0.12, (now - last) / 1000) * Number($('#speed').value); last = now;
  if (S.run && !S.run.paused) step(dt);
  callTick();
  requestAnimationFrame(frame);
}

function sizeGrain() { grC.width = Math.ceil(innerWidth / 3); grC.height = Math.ceil(innerHeight / 3); }

/* ---------- the surface: the prototype's page parts (the film under the scene's UI, and the dial, her words and the body's words over it) ---------- */
function buildSurface(fxHost: HTMLElement, host: HTMLElement): Pick<Stage, 'fx' | 'box' | 'els'> {
  const els: Record<string, HTMLElement> = {};
  const mk = (key: string, tag: string, attrs: Record<string, unknown>, ...kids: HTMLElement[]): HTMLElement => (els[key] = h(tag, attrs, ...kids));
  const fx = h('div', { class: 'alius-pg-fx', 'aria-hidden': 'true' },
    mk('#vignette', 'div', { id: 'vignette' }), mk('#blindView', 'div', { id: 'blindView' }), mk('#grain', 'canvas', { id: 'grain' }));
  const box = h('div', { class: 'alius-pg', 'data-pg-surface': '' },
    mk('#herLine', 'div', { id: 'herLine', 'aria-live': 'polite' }),
    h('div', { id: 'callWord' }, mk('#callWord .pre', 'span', { class: 'pre' }), mk('#callWord .w', 'span', { class: 'w' }), mk('#dots', 'div', { id: 'dots', 'aria-hidden': 'true' })),
    mk('#feel', 'div', { id: 'feel', 'aria-live': 'polite' }),
    mk('#states', 'div', { id: 'states', ...analyzeNative('glossary:posture_game') }),
    mk('#dial', 'div', { id: 'dial', ...analyzeNative('glossary:posture_game') }, mk('#dialFace', 'div', { id: 'dialFace' }), mk('#beads', 'div', { id: 'beads' }), mk('#dialLabel', 'div', { id: 'dialLabel' })));
  fxHost.append(fx);
  host.append(box);
  return { fx, box, els };
}

/** A canvas context that never fails (a page with no canvas draws no grain; the game still runs). */
function grainContext(c: HTMLCanvasElement): CanvasRenderingContext2D {
  let ctx: CanvasRenderingContext2D | null = null;
  try { ctx = c.getContext('2d'); } catch { ctx = null; }
  return ctx ?? ({ createImageData: (w: number, hh: number) => ({ data: new Uint8ClampedArray(Math.max(0, w * hh * 4)) }), putImageData: () => undefined } as unknown as CanvasRenderingContext2D);
}

/** Her look on the surface: her accent, her hand and its measured size factor (the call's and the hold's words are in her hand). */
function dress(box: HTMLElement, look: HerLook, reduced: boolean): void {
  box.style.setProperty('--alius-her', look.accent);
  if (look.hand !== '') box.style.setProperty('--alius-font-hand', `"${look.hand}", var(--alius-font-type)`);
  box.style.setProperty('--alius-hand-scale', String(look.handScale || 1));
  box.toggleAttribute('data-reduced', reduced);
}

/** Her named postures as the prototype's `NAMED` (`[preset id, her name]`, in her order); a posture whose category went off since is no choice. */
function namedOf(state: CampaignState, reg: Registries, holderId: string): Array<[string, string]> {
  return (state.practices?.postures[holderId] ?? []).filter((p) => postureAllowed(state, reg, p.postureId, holderId))
    .map((p) => [reg.servicePostures.get(p.postureId)?.id ?? presetKeyOf(reg, p.postureId), plainDraft(p.name)] as [string, string]);
}
const presetKeyOf = (reg: Registries, id: string): string => [...reg.servicePostures.values()].find((p) => samePreset(reg, p.id as string, id))?.id as string ?? id;

/** The prototype's `PRESETS`: the registry's presets (a base, the point states, an item or a place). */
function presetsOf(reg: Registries): Any[] {
  return [...reg.servicePostures.values()].map((p) => ({
    id: p.id, base: p.base, points: p.points,
    ...(p.item !== undefined ? { item: p.item } : {}), ...(p.hint !== undefined ? { hint: p.hint } : {}), ...(p.hogtie === true ? { hogtie: true } : {}),
  }));
}

/** Her lines (`cardVoice` `posture.*`) in the prototype's `LINES` shape: her style's rows, else neutral's; an empty row of hers is `['']` (silent: cold), the prefix is a string. */
function refreshLines(): void {
  const reg = E!.registries;
  const own = (style: string): Record<string, Any> => Object.fromEntries(LINE_KINDS.map((k) => {
    const l = [...voiceLines(reg, `posture.${k}` as VoiceKind, style)];
    return [k, k === 'prefix' ? l[0] ?? '' : l.length === 0 ? [''] : l];
  }));
  LINES = { neutral: own('neutral'), [S.style]: own(S.style) };
}

/** What the game reads of the state that does not change in a hold: the presets, her names, her style and her lines. */
function refreshCommon(holderId: string): void {
  const e = E!, state = e.state(), reg = e.registries;
  if (PRESETS.length === 0) PRESETS = presetsOf(reg);
  WR.holderId = holderId;
  NAMED = namedOf(state, reg, holderId);
  const style = practiceOf(state, reg, holderId)?.style.primary ?? 'neutral';
  if (style !== S.style || LINES.neutral.start === undefined) { S.style = style; refreshLines(); }
}

/** The hold's numbers from the engine: the drift rates of the preset (the day's fatigue, the floor, her weight, the skill and the mastery are in them), her term, the blindfold. */
function refreshHold(run: PostureRun): void {
  const e = E!, state = e.state(), reg = e.registries;
  WR.rates = driftRates(state, reg, run.holderId, run.presetId) as Record<string, number>;
  WR.blind = sensoryNow(state, reg);
  WR.hidden = postureEndShown(run) === null;
  WR.term = run.until !== undefined ? run.until * BEAT_S : 60 + hash01(`term|${run.id}`) * 180;
  WR.t0 = Math.max(0, run.beats * BEAT_S);
  // her rule "eyes down" has no engine source yet (P17c): a preset that fixes the eyes down is the rule
  WR.eyes = (presetsOf(reg).find((p) => p.id === run.presetId)?.points as PointStates | undefined)?.gaze === 'down';
}

/** The blindfold goes on or off in a hold (the prototype's panel handler). */
function setBlind(on: boolean): void {
  WR.blind = on;
  if (!S.run) return;
  S.run.blind = on;
  $('#dial').classList.toggle('blind', S.run.blind); document.body.classList.toggle('blind', S.run.blind); drawDial();
}

/** The scene's events that tempt the gaze (a visitor, her undressing: the engine's `temptations`), each played once, `delay` s after it was seen. */
function playTemptations(): void {
  const e = E!, run = WR.run;
  if (!run || !S.run) return;
  const state = e.state();
  for (const t of temptations(state, e.registries, run)) {
    const key = `${state.scene?.id ?? ''}|${run.id}|${t.key}`;
    if (PLAYED.has(key)) continue;
    PLAYED.add(key);
    const r = S.run;
    e.timeout(() => { if (S.run === r) event(t.kind); }, t.delay * 1000);
  }
}

/** The state of the game when a mount begins (nothing of an earlier mount is left). */
function resetS(): void {
  Object.assign(S, { attention: 'busy', preset: '', run: null, call: null, sel: null, held: { gaze: false }, look: null, stance: null });
  WR.run = null; WR.call = null; WR.ended = false; WR.cancelled = false; WR.rates = {}; WR.blind = false; WR.eyes = false;
  PRESETS = []; NAMED = []; LINES = { neutral: {} };
  clearTimeout(lineT); lineT = null; grainAcc = 0;
}

/* ---------- the keys: 1-7 (only when nothing editable has focus and the device is down), L looks up ---------- */
const KEY_POINT: Record<string, string> = Object.fromEntries(Object.entries(KEY_OF).map(([k, v]) => [String(v), k]));
const typing = (t: EventTarget | null): boolean => t instanceof HTMLElement && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable);
function bindKeys(e: Stage): void {
  const keyable = (ev: KeyboardEvent): boolean => !typing(ev.target) && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !ev.isComposing && e.box.closest('[inert]') === null;
  e.offs.push(e.listen(globalThis.document, 'keydown', ((ev: KeyboardEvent) => {
    if (!keyable(ev)) return;
    if (ev.repeat && ev.key !== '6') return;
    if (KEY_POINT[ev.key]) { ev.preventDefault(); if (!ev.repeat) press(KEY_POINT[ev.key]); return; }
    if (ev.key.toLowerCase() === 'l') lookUp();
  }) as EventListener));
  e.offs.push(e.listen(globalThis.document, 'keyup', ((ev: KeyboardEvent) => { if (KEY_POINT[ev.key]) release(KEY_POINT[ev.key]); }) as EventListener));
  e.offs.push(e.listen(globalThis.document, 'pointerup', (() => release('gaze')) as EventListener));
}

/** The frames: the grain and the hold's steps; started with a mount, cancelled with it. */
function begin(): void {
  const e = E!;
  grC = e.els['#grain'] as HTMLCanvasElement;
  grctx = grainContext(grC);
  innerWidth = 0; innerHeight = 0; sizeOf(e);
  last = e.now();
  requestAnimationFrame(frame);
}

/* ---------- the hold's instrument (registered with the host) ---------- */
function postureMatches(run: PostureRun, state: CampaignState, reg: Registries): boolean {
  return state.scene !== undefined && state.scene.participants.includes(run.holderId) && reg.servicePostures.has(run.presetId) && craftLive(state, reg, run.holderId) && blockingLive(state, reg);
}

function stageOfEnv(env: InstrumentEnv, run: PostureRun): Stage {
  const surf = buildSurface(env.layers.effects, env.layers.moment);
  const look = env.her(run.holderId);
  dress(surf.box, look, env.reduced);
  const claim = claimStyles(env.layers.sprites, ['filter', 'transition']);
  writeClaimed(claim, 'transition', 'filter 1.4s');
  const st = env.staging;
  const stage: Stage = {
    ...surf, now: () => env.now(), raf: (fn) => env.raf(fn), cancelRaf: (id) => env.cancelRaf(id), timeout: (fn, ms) => env.timeout(fn, ms),
    listen: (t, ty, fn, o) => env.listen(t, ty, fn, o), samples: env.samples, get reduced(): boolean { return env.reduced; },
    state: () => env.state(), registries: env.registries, settings: () => env.settings(), look, sprites: env.layers.sprites, herClaim: claim, frameId: null, offs: [],
    report: {
      correct: (o) => st.postureCorrect?.(o) ?? [], slip: (p) => st.postureSlip?.(p) ?? [], end: (r, b) => st.postureEnd?.(r, b) ?? [],
    },
  };
  return stage;
}

function startPosture(env: InstrumentEnv, run: PostureRun): PostureInstrumentRun {
  closeCall(); // a call that drew a surface of its own gives it up: the scene draws it again on this one
  resetS();
  const e = stageOfEnv(env, run);
  E = e;
  void e.samples?.preload([...SAMPLE_URLS]);
  WR.run = run;
  refreshCommon(run.holderId);
  refreshHold(run);
  S.preset = run.presetId;
  bindKeys(e);
  startHold();
  begin();
  playTemptations();
  return {
    update(next) {
      if (E !== e || WR.cancelled) return;
      WR.run = next;
      e.box.toggleAttribute('data-reduced', e.reduced);
      refreshCommon(next.holderId);
      refreshHold(next);
      if (S.run && S.run.blind !== WR.blind) setBlind(WR.blind);
      playTemptations();
    },
    /** The hold is gone from the state: its end plays when the instrument ended it (her release line), never after the stop word. */
    finish() {
      return WR.ended ? 3700 : 0;
    },
    stop() {
      if (E !== e) return;
      WR.cancelled = true;
      if (e.frameId !== null) e.cancelRaf(e.frameId);
      for (const off of e.offs.splice(0)) off();
      for (const [, cancel] of cancels) cancel();
      cancels.clear();
      clearTimeout(lineT);
      S.run = null; S.call = null; WR.call = null; WR.run = null;
      if (e.herClaim) releaseClaim(e.herClaim);
      e.fx.remove();
      e.box.remove();
      E = null;
    },
  };
}

registerPostureInstrument({ id: 'posture', posture: true, matches: postureMatches, start: startPosture });

/* ---------- the call's schemes B and C (Task 24): her posture put together point by point on the dial, drawn on the hold's surface or on one of its own ---------- */
export interface PostureCallOpts {
  /** B: assemble against her foot; C: her conducting (a series of five, about three in ten a trap). */
  scheme: 'B' | 'C';
  id: string;
  holderId: string;
  /** The posture she calls (the series' last, or the only one). */
  postureId: string;
  /** Her first call of a posture she introduced: the ghost shows whatever the mastery. */
  taught: boolean;
  /** Her window (`postureWindowMs`); each point that has to move adds 2.5 s. */
  windowMs: number;
  /** The order interaction is on: her foot's taps and the lateness; off: no clock. */
  timed: boolean;
  look: HerLook;
  /** The moment layer (the dial, her word), the effects layer (the film) and the dial's corner (the real dial is hidden under the game's own). */
  host: HTMLElement;
  fx: HTMLElement;
  dial: HTMLElement | null;
  sprites?: HTMLElement | null;
  samples: SampleSound | null;
  reduced: boolean;
  state(): CampaignState;
  registries: Registries;
  settings(): AliusSettings;
  /** The engine's answer (once, at the series' end): the posture when every call was taken, none otherwise, and whether one was late. */
  take(postureId: string | undefined, late: boolean): void;
  /** The surface is gone (the scene puts the stop word's pill back). */
  onGone?(): void;
  now(): number;
  schedule(fn: () => void, ms: number): unknown;
  cancel(handle: unknown): void;
}

function stageOfCall(o: PostureCallOpts): Stage {
  const surf = buildSurface(o.fx, o.host);
  dress(surf.box, o.look, o.reduced);
  if (o.dial) o.dial.setAttribute('data-pg', '');
  const handles = new Set<unknown>();
  const stage: Stage = {
    ...surf, now: () => o.now(), raf: (fn) => globalThis.requestAnimationFrame(fn), cancelRaf: (id) => globalThis.cancelAnimationFrame(id),
    timeout: (fn, ms) => { const hd = o.schedule(() => { handles.delete(hd); fn(); }, ms); handles.add(hd); return () => { handles.delete(hd); o.cancel(hd); }; },
    listen: (t, ty, fn, op) => { t.addEventListener(ty, fn, op); return () => t.removeEventListener(ty, fn, op); },
    samples: o.samples, reduced: o.reduced, state: () => o.state(), registries: o.registries, settings: () => o.settings(), look: o.look, sprites: o.sprites ?? null, herClaim: null,
    report: null, frameId: null, offs: [() => { for (const hd of handles) o.cancel(hd); handles.clear(); }],
  };
  return stage;
}

/** The call drawn now (its id, and whether its answer has been given), or null. */
export function currentPostureCall(): { id: string; done: boolean } | null {
  return WR.call === null ? null : { id: WR.call.id, done: WR.call.answered };
}

/** Starts the call (once per engine call): on the hold's surface when a hold is drawn, else on a surface of its own. */
export function startPostureCall(o: PostureCallOpts): void {
  if (WR.call !== null) return;
  const own = E === null;
  if (own) {
    resetS();
    E = stageOfCall(o);
    void E.samples?.preload([...SAMPLE_URLS]);
    bindKeys(E);
  }
  WR.call = { id: o.id, holderId: o.holderId, postureId: o.postureId, taught: o.taught, timed: o.timed, windowMs: o.windowMs, take: o.take, owns: own, series: { ok: true, late: false }, answered: false, ...(o.onGone ? { onGone: o.onGone } : {}) };
  WR.holderId = o.holderId;
  refreshCommon(o.holderId);
  if (own) {
    const state = E!.state();
    const now = dialPoseOf(state, E!.registries);
    S.stance = { ...now, id: commanderPresetOf(state, E!.registries)?.id };
    S.preset = String(S.stance.id ?? '');
    begin();
  }
  startCall(o.scheme, o.scheme === 'C' ? 4 : 0);
}

/** The call goes at once (a chat switch, the call gone from the state before its answer): no timer, no element, no answer. A hold's surface stays. */
export function closeCall(): void {
  const info = WR.call;
  if (info === null && !(E !== null && E.report === null)) return;
  const e = E;
  S.call = null; S.sel = null; WR.call = null;
  if (e !== null && e.report === null) { // a surface of its own: down with it
    if (e.frameId !== null) e.cancelRaf(e.frameId);
    for (const off of e.offs.splice(0)) off();
    for (const [, cancel] of cancels) cancel();
    cancels.clear();
    clearTimeout(lineT);
    S.run = null; WR.run = null;
    e.fx.remove();
    e.box.remove();
    E = null;
  } else if (e !== null) {
    $('#callWord .w').textContent = ''; $('#callWord .pre').textContent = ''; $('#dots').replaceChildren(); drawStates();
    if (S.run) { S.run.paused = false; drawDial(); }
  }
  info?.onGone?.();
}
export const cancelPostureCall = closeCall;

/** Tests and the shots: the game's state. */
export const _posture = {
  S, WR, LINES: () => LINES, NAMED: () => NAMED, PRESETS: () => PRESETS, stage: (): Stage | null => E,
  press, lookUp, event, step, startCall, endCall, callPress, pickState, slip, drawDial, setAttention, activePoints, blendedBody, targetPose, rateOf, refreshLines, say, feel, setBlind, drawStates,
};
