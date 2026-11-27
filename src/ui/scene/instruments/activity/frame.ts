/**
 * P10e-e Task 24: her activity, the frame of her time, with stillness inside (`docs/prototypes/her_activity.html`, normative; its
 * `fidelity.json` checks the port against it). She is busy with her own thing; the commander is placed by her. The four views (her, her legs
 * under the desk, the floor by her bunk, the wall), her marks as sounds and sensory lines on the side of the source, her presence (the engine's
 * `presenceOf`), the commander's attention and the urges (stillness), restlessness, cover, the tell that she heard, the phases and the hours
 * between them, the end by presence and the forgotten end.
 *
 * The functions are the prototype's, copied (types added). The wiring, declared in `fidelity.json`:
 * - her presence is the engine's (`presenceOf` per phase), her attention the plan's beat by beat (`plan.beats[].attention`): no `baseScore`,
 *   no `attentionDraw` here;
 * - the body's reliefs and fidgets are decided at once by the engine (Rulings X and Y: `physics/relief` `relieve` / `fidget`, `amount` the
 *   loudness × (1 − this frame's `coverNow`), `part` its visibility, one draw with the prototype's noticing); her tell and her answer play from
 *   the dispatch's answer (`bodyNoise`), at once, as the prototype's; a third party (the line of a call, an unaware visitor) hears by the
 *   prototype's own threshold (no draw);
 * - her lines are `cardVoice` `activity.*` by her style (ruling Q; a style the prototype has no row of reads neutral's), her spoken words in
 *   the entry narration and her waking words included; her script is the model's (`staging.script(phase)`, `activity_script`); until it
 *   arrives and whenever it fails, the prototype's `TO_YOU`, `CALL`, `VISIT`, `CARDS` and `ACTS[].self` play as `cardVoice` rows (Ruling Z),
 *   and the script replaces the lines it has; a mention of the commander goes through the engine's `mentionText`;
 * - the phases, the hours between them and the end are the engine's marathon (`run.marathon`): a phase ends when the engine waits for the
 *   strategy, the strategy is `physics/skip` (the engine's `resolveSkip`, its summary the run's), the end is the engine's outcome or its
 *   `forgotten` (R28: GET UP is `physics/get_up`, the finder `physics/found`);
 * - the peaks (`planPeaks`), the urges' spawn times and the marks' intervals keep the prototype's own timing on this module's `Math.random`, a
 *   xorshift seeded by the scene and the run (no rng draw: the engine plans no peaks);
 * - the weight inside (Ruling B): a run whose second physics is weight mounts the weight core and forwards the commander's acts; the frame's own
 *   view is then `footrest` and its frame follows `weightFrame()`;
 * - `performance`, `setTimeout`, `requestAnimationFrame`, `innerWidth` / `innerHeight` and `document`'s listeners are the mount's.
 */
import type { Registries } from '../../../../content/types';
import { effectsOfEntry } from '../../../../engine/blocking/types';
import { floorOf } from '../../../../engine/backdrops';
import { fnv1a } from '../../../../engine/hub';
import { coreRun } from '../../../../engine/physics/run';
import { frameOf, presenceOf, type Presence } from '../../../../engine/physics/presence';
import { mentionText } from '../../../../engine/physics/mention';
import { phaseSegments } from '../../../../engine/physics/marathon';
import type { PhysicsRun } from '../../../../engine/physics/state';
import { leadStyle, physicsStyleOf, segmentSecondsOf } from '../../../../engine/physics/style';
import { servicePaceOf } from '../../../../engine/physics/service';
import type { CampaignState } from '../../../../engine/state/types';
import type { ActivityFrame } from '../../../../engine/blocking/types';
import type { ScriptLine } from '../../../../llm/calls/activityScript';
import { voiceLines, type VoiceKind } from '../../cards/voice';
import { registerInstrument } from '../host';
import { chaikin } from '../kit/chaikin';
import { placeFree as kitPlaceFree } from '../kit/hand';
import { clamp, lerp, smooth } from '../kit/math';
import { claimStyles, noteWrites, releaseClaim, type StyleClaim } from '../styleClaims';
import type { InstrumentEnv, InstrumentRun, PhysicsEnd } from '../types';
import { startWeight, THRONE, weightCore, weightFrame, weightMatches, type WeightCoreRun } from '../weight/weight';
import { ACTS, BASE_EVENTS, GROUPS, QUIET_ACT, SAMPLE_URLS, VIEWS, type Act, type Mark, type View } from './acts';
import { attachThrone, detachThrone, throneBody, throneCanvases, throneCup, throneFlinch, throneLegs, throneOn, throneRise, throneSign, throneThank, throneThanked, throneUpdate, throneVisitor, tMouse } from './throne';
import { herLegsOf } from '../../../../engine/physics/occlusion';
import { temperamentOf } from '../../../../engine/life/state';
import { attachService, detachService, serviceMatches, serviceSize, SV, svBegin, svcOn, svDown, svFinish, svMove, svRender, svUp, svUpdate } from './service';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

/* ---------- the wiring: the mount, the clock, the timers, the frames and the size of the scene ---------- */
interface FrameEls { env: InstrumentEnv; box: HTMLElement; ui: HTMLElement; els: Record<string, HTMLElement>; claims: StyleClaim[]; frameId: number | null; core: WeightCoreRun | null }
let E: FrameEls | null = null;
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
    afterFrame();
  });
}
/** No rng: the prototype's `Math.random` is a xorshift seeded by the scene and the run. */
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
  if (s === '#reply') return e.env.reply;
  if (s === '#cmd') return e.env.input;
  return e.els[s] ?? e.els['#void']!;
};

/* ---------- the prototype's helpers ---------- */
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)]!;
const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const wpick = (items: Mark[]) => { const sum = items.reduce((s, x) => s + (x.w ?? 1), 0); let r = Math.random() * sum; for (const x of items) { r -= x.w ?? 1; if (r <= 0) return x; } return items[items.length - 1]!; };
/* fnv1a, for the session's hash (the engine hashes, it does not draw) */
const fnv = (s: string) => fnv1a(s);
void easeOut; void randInt;

/* ---------- the engine's numbers this frame reads ---------- */
const CAUGHT: Record<string, number> = { watching: 0.6, glancing: 0.25, busy: 0.08 };

/* ---------- settings: the approved defaults, the run's view, activity, style, the still form ---------- */
const S: Any = { inner: 'stillness', view: 'legs', blind: false, act: 'reading_reports', legVar: 'planted', style: 'neutral', phases: 3, phaseLen: 90, start: 1080, level: 1, rain: true, stay: true,
  legsW: 0.62, legsB: 0.9, feetW: 0.56, feetB: 0.86, feetTilt: 6, raisedW: 0.62, raisedB: 0.9, floorShade: 0.55, knows: false, reckless: false,
  sound: true, murmur: true, vol: 0.7, debug: false, reduced: false, readable: false };
const V = (): View => VIEWS[S.inner === 'weight' ? 'footrest' : S.view]!, ACT = (): Act & ActivityFrame & { self: string[] } => ({ ...(ACTS[S.act] ?? QUIET_ACT), ...R.frame, self: [...voiceLines(E!.env.registries, `activity.self.${S.act}` as VoiceKind, S.style)] });
/** Her lines by situation (her_activity.html `STYLES`): `cardVoice` `activity.*` by her style (neutral's for a style the prototype has no row of). */
const ST = (): Any => new Proxy({}, { get: (_t, k: string) => (k === 'name' ? voiceLines(E!.env.registries, 'activity.name' as VoiceKind, S.style)[0] ?? 'commander' : [...voiceLines(E!.env.registries, `activity.${k}` as VoiceKind, S.style)]) });
/* the phase plays a third of its fiction hour; the rest passes between phases, in the dark */
const PLAYED_SHARE = 1 / 3;

/* ---------- the run as the engine has it (the wiring) ---------- */
interface Wiring {
  run: PhysicsRun | null; frame: ActivityFrame; lineStyle: string; caught: number; phase: number; waiting: boolean; listener: { id: string; name: string } | null;
  scriptPhase: number; script: ScriptLine[] | null; heardFor: Set<string>;
}
const R: Wiring = { run: null, frame: { absorb: 0, hear: 1, light: 'lamp', unit: '', total: 1, per: [6, 12], legs: 'still' }, lineStyle: 'neutral', caught: 0, phase: 1, waiting: false, listener: null, scriptPhase: 0, script: null, heardFor: new Set() };

/* ---------- audio: two buses (the world, the body), samples and synthesis; ruling D: this module's own chain on the scene's context ---------- */
let A: Any = { ctx: null, buf: {} };
function audioInit() {
  if (A.ctx) return;
  const samples = E?.env.samples ?? null;
  const ctx = samples?.ctx() ?? null, out = samples?.bus('body') ?? null;
  if (!ctx || !out || !samples) return;
  A.ctx = ctx;
  A.buf = new Proxy({} as Record<string, AudioBuffer | null>, { get: (_t, k) => (typeof k === 'string' && SAMPLE_URLS[k] ? samples.buffer(SAMPLE_URLS[k]!) : null) });
  void samples.preload(Object.values(SAMPLE_URLS));
  A.master = ctx.createGain(); A.master.gain.value = S.sound ? S.vol : 0; A.master.connect(out);
  A.world = ctx.createBiquadFilter(); A.world.type = 'lowpass'; A.world.frequency.value = 15000; A.world.connect(A.master);
  A.body = ctx.createGain(); A.body.connect(A.master);
  const mk = (sec: number, fill: (d: Float32Array) => void) => { const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate); fill(b.getChannelData(0)); return b; };
  A.white = mk(2, (d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
  A.brown = mk(4, (d) => { let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } });
  // the room tone, and the generator of the base (it drops at lights out)
  const room = ctx.createBufferSource(); room.buffer = A.brown; room.loop = true;
  const rl = ctx.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 420; A.roomG = ctx.createGain(); A.roomG.gain.value = 0.045;
  room.connect(rl); rl.connect(A.roomG); A.roomG.connect(A.world); room.start();
  A.hum = ctx.createOscillator(); A.hum.frequency.value = 50; A.hum2 = ctx.createOscillator(); A.hum2.frequency.value = 100;
  A.humG = ctx.createGain(); A.humG.gain.value = 0.012; A.hum.connect(A.humG); A.hum2.connect(A.humG); A.humG.connect(A.world); A.hum.start(); A.hum2.start();
  A.nodes = [room, A.hum, A.hum2];
}
function chain(node: Any, { pan = 0, lp = 0, dest = A.world, hp = 0 }: Any) {
  let n = node;
  if (hp) { const f = A.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; n.connect(f); n = f; }
  if (lp) { const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; n.connect(f); n = f; }
  if (pan) { const p = A.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); n.connect(p); n = p; }
  n.connect(dest);
}
/* plays a recorded sound (a group id plays a random member); `dur` cuts it with a fade */
function play(id: string, { g = 0.5, pan = 0, rate = 1, lp = 0, hp = 0, dest, at = 0, offset = 0, dur, loop = false }: Any = {}) {
  if (!A.ctx) return null;
  const key = GROUPS[id] ? pick(GROUPS[id]!) : id;
  const b = A.buf[key];
  if (!b) { SYN[id]?.({ g, pan, lp }); return null; }
  const ctx = A.ctx, t = ctx.currentTime + at;
  const src = ctx.createBufferSource(); src.buffer = b; src.loop = loop; src.playbackRate.value = rate * rand(0.97, 1.03);
  const gn = ctx.createGain(); gn.gain.setValueAtTime(g, t);
  if (dur) { gn.gain.setValueAtTime(g, t + Math.max(0.01, dur - 0.12)); gn.gain.linearRampToValueAtTime(0.0001, t + dur); }
  src.connect(gn); chain(gn, { pan, lp, hp, dest: dest ?? A.world });
  src.start(t, offset); if (dur) src.stop(t + dur + 0.05);
  return { src, gain: gn };
}
function noise({ at = 0, dur = 0.2, type = 'bandpass', f = 1000, f2, q = 1, gain = 0.1, attack = 0.01, dest, pan = 0 }: Any) {
  if (!A.ctx) return;
  const ctx = A.ctx, t = ctx.currentTime + at;
  const src = ctx.createBufferSource(); src.buffer = A.white; src.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl); fl.connect(g); chain(g, { pan, dest: dest ?? A.world });
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
}
function tone(f0: number, f1: number, dur: number, gain: number, { type = 'sine', dest, pan = 0, at = 0, attack = 0.01 }: Any = {}) {
  if (!A.ctx) return;
  const ctx = A.ctx, t = ctx.currentTime + at;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); chain(g, { pan, dest: dest ?? A.world }); o.start(t); o.stop(t + dur + 0.05);
}
/* voices without a voice: syllables of a buzz through two formants. Her murmur under her spoken lines; the earpiece; a visitor. */
function babble(sec: number, { f0 = 200, gain = 0.05, pan = 0, tinny = false, lp = 0, dest }: Any = {}) {
  if (!A.ctx || sec <= 0) return;
  const ctx = A.ctx; let t = ctx.currentTime + 0.02; const end = t + sec;
  const out = ctx.createGain(); out.gain.value = gain;
  chain(out, { pan, lp: tinny ? 2600 : lp, hp: tinny ? 900 : 0, dest: dest ?? A.world });
  while (t < end) {
    const d = rand(0.07, 0.16), gap = Math.random() < 0.12 ? rand(0.15, 0.35) : rand(0.01, 0.05);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; const p = f0 * rand(0.85, 1.2); o.frequency.setValueAtTime(p, t); o.frequency.linearRampToValueAtTime(p * rand(0.9, 1.1), t + d);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = rand(320, 820); f1.Q.value = 6;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = rand(1000, 2300); f2.Q.value = 8;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + d * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.02);
    t += d + gap;
  }
}
/* synthesised sounds: the ones no recording covers, and the fallback of every recorded one */
const SYN: Record<string, (o?: Any) => void> = {
  tapping: ({ g = 0.3, pan = 0 } = {}) => { const n = randInt(5, 12); for (let i = 0; i < n; i++) noise({ at: i * rand(0.08, 0.16), dur: 0.014, type: 'highpass', f: 3400, gain: 0.04 * g * 3, attack: 0.001, pan }); },
  thread: ({ g = 0.4, pan = 0 } = {}) => noise({ dur: 0.5, f: 2200, f2: 3600, q: 2.5, gain: 0.05 * g * 2, attack: 0.12, pan }),
  snip: ({ g = 0.5, pan = 0 } = {}) => { noise({ dur: 0.03, type: 'highpass', f: 2600, gain: 0.12 * g, attack: 0.001, pan }); noise({ at: 0.05, dur: 0.025, type: 'highpass', f: 3000, gain: 0.1 * g, attack: 0.001, pan }); },
  scratch: ({ g = 0.5 } = {}) => { for (let i = 0; i < 5; i++) noise({ at: i * 0.07, dur: 0.06, f: 2800, q: 1.2, gain: 0.05 * g * 2, attack: 0.004, dest: A.body }); },
  gulp: ({ g = 0.5 } = {}) => { tone(190, 110, 0.12, 0.22 * g, { dest: A.body }); noise({ at: 0.04, dur: 0.05, f: 900, q: 3, gain: 0.08 * g, dest: A.body }); },
  joint: ({ g = 0.5 } = {}) => noise({ dur: 0.02, type: 'bandpass', f: 1500, q: 4, gain: 0.25 * g, attack: 0.001, dest: A.body }),
  page: (o) => noise({ dur: 0.35, f: 2400, f2: 1400, q: 0.8, gain: 0.06 * (o?.g ?? 0.5) * 2, attack: 0.05, pan: o?.pan }),
  sheet: (o) => SYN.page!(o), cloth: (o) => noise({ dur: 0.42, f: 1100, f2: 1600, q: 0.7, gain: 0.08 * (o?.g ?? 0.5), attack: 0.1, pan: o?.pan }),
  creak: (o = {}) => { const len = 0.35, n = Math.floor(len * rand(40, 70)); for (let i = 0; i < n; i++) noise({ at: (i / n) * len + Math.random() * 0.004, dur: 0.012, f: rand(420, 780), q: 9, gain: 0.16 * (o.g ?? 0.5) * (0.5 + Math.random() * 0.5), attack: 0.001, pan: o.pan }); },
  pen: () => { const n = randInt(3, 5); for (let i = 0; i < n; i++) noise({ at: i * 0.05 + Math.random() * 0.02, dur: 0.035 + Math.random() * 0.03, f: 2600 + Math.random() * 1800, q: 3, gain: 0.035 }); },
  horn: () => { for (const f of [146, 220]) tone(f, f * 0.98, 2.6, 0.03, { type: 'sawtooth', attack: 0.5 }); },
};
/* the leak of her headphones: a tinny beat that only exists while she listens to music */
const MUSIC = { on: false, next: 0, bpm: 100 };
function musicTick() {
  if (!MUSIC.on || !A.ctx) return;
  const now = A.ctx.currentTime; if (MUSIC.next < now) MUSIC.next = now + 0.05;
  while (MUSIC.next < now + 0.3) {
    const t = MUSIC.next - now, beat = 60 / MUSIC.bpm, pan = V().herPan;
    noise({ at: t, dur: 0.05, type: 'highpass', f: 5000, gain: 0.02, attack: 0.002, pan });
    noise({ at: t + beat / 2, dur: 0.03, type: 'highpass', f: 7000, gain: 0.012, attack: 0.002, pan });
    tone(rand(400, 700), 300, 0.12, 0.006, { type: 'square', at: t, pan });
    MUSIC.next += beat;
  }
}
/* loops: rain, the mess through the walls, her sleeping breath */
const LOOPS: Record<string, Any> = {};
function loopOn(id: string, g: number, opts: Any = {}) {
  if (!A.ctx || LOOPS[id]) return;
  const h = play(id, { g: 0.0001, loop: true, ...opts });
  if (h) { h.gain.gain.cancelScheduledValues(A.ctx.currentTime); h.gain.gain.setTargetAtTime(g, A.ctx.currentTime, 1.2); LOOPS[id] = h; }
}
function loopOff(id: string) { const h = LOOPS[id]; if (!h || !A.ctx) return; h.gain.gain.setTargetAtTime(0.0001, A.ctx.currentTime, 1.0); setTimeout(() => { try { h.src.stop(); } catch (e) { /* stopped */ } }, 4000); delete LOOPS[id]; }
function sleepBreath() { // her breath in sleep: the recorded breath, slow and far (the saturation prototype's recording)
  const b = A.buf.breath; if (!b) { noise({ dur: 2, f: 700, q: 0.6, gain: 0.02, attack: 0.9, pan: V().herPan }); return; }
  const ctx = A.ctx, t = ctx.currentTime, src = ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = 0.78;
  const g = ctx.createGain(); g.gain.value = 0.07; src.connect(g); chain(g, { pan: V().herPan, lp: 1400 }); src.start(t, 0.1); src.stop(t + 4.2);
}

/* ---------- state ---------- */
let G: Any;
function fresh() {
  return { phase: 'idle', t: 0, phaseIdx: 0, phaseT: 0, clockMin: S.start, startMin: S.start, progress: 0, lampOn: false,
    score: 0, step: 'own', att: 'busy', attHold: 0, beatAcc: 0, nextMark: 3000, legsMode: 'still', legsT: 0, press: 0, shiftAnim: 0,
    timers: [], herSpeakingUntil: 0, otherSpeakingUntil: 0, coverExtra: 0, call: null, visitor: null, away: false, asleepDepth: 0, stirs: 0,
    urges: [], numb: 0, ease: 100, cramp: null, nextItch: 6000, nextSwallow: 12000, nextCramp: 40000, spaceHeld: false,
    ask: null, lastSelfAt: -99999, lastTyped: -99999, faultsRecent: [], baseDone: new Set(), mess: false,
    stats: { noticed: [], unnoticed: 0, endured: 0, reliefs: 0, involuntary: 0, gross: 0, asked: 0, answered: 0, missed: 0, breaches: 0, unprompted: 0,
      heardOnLine: 0, heardByVisitor: 0, mentions: [], skips: [], caught: 0, cheatsUnseen: 0, left: false, aloneFor: 0, gotUp: false, found: false, woke: false, ended: '' } } as Any;
}
G = fresh();
const after = (ms: number, fn: () => void) => G.timers.push({ at: G.t + ms, fn });
/** e8 M-R5: how long a sensory line waits for the scene's size before it is dropped (the line is a moment's; a late one would be stale). */
export const SENSE_WAIT_MS = 3000;

/* her presence: the engine's reader for this phase (R25: derived, never stored, never shown) */
function setStep(step: Presence) { G.step = step; }

/* ---------- what reaches the commander: sensory lines on the side of the source, sounds panned there ---------- */
function sense(text: string, where: Any = 'her', cls = '', waited = 0) {
  if (!text) return;
  // review M-R1: placed once the scene's size is known (never over its top bar); e8 M-R5: given up after SENSE_WAIT_MS with no size
  if (!innerWidth || !innerHeight) { if (waited < SENSE_WAIT_MS) after(100, () => sense(text, where, cls, waited + 100)); return; }
  if ([...$('#senses').children].some((x) => !(x as HTMLElement).dataset.gone && x.textContent === text)) return; // the same line is still showing
  const v = V(), p = where === 'door' ? v.door : where === 'body' ? v.body : Array.isArray(where) ? where : v.her;
  const el = document.createElement('div'); el.className = 'sense ' + cls; el.textContent = text; el.dataset.line = '';
  $('#senses').appendChild(el);
  const at = placeFree(el, clamp(p[0] + rand(-0.04, 0.04), 0.04, 0.78) * innerWidth, clamp(p[1] + rand(-0.01, 0.01), 0.04, 0.84) * innerHeight);
  el.dataset.x = String(at.x); el.dataset.y = String(at.y); el.dataset.born = String(G.t);
  requestAnimationFrameOnce(() => { el.classList.add('on'); el.style.transform = 'translateY(-14px)'; });
  setTimeout(() => { el.dataset.gone = '1'; el.classList.remove('on'); setTimeout(() => el.remove(), 1200); }, 5600);
}
/* a mark of her activity: the wording by the view (seen only where the commander can see her; a blindfold hears only), its sound at her side */
function mark(m: Mark) {
  const v = V(), sees = v.sight && !S.blind;
  if (m.sfx) play(m.sfx, { g: m.g ?? 0.4, pan: v.herPan, lp: S.view === 'wall' ? 5000 : 0, dur: m.len ? rand(m.len[0], m.len[1]) : undefined, offset: m.len ? rand(0, 1.5) : 0 });
  if (m.then) after(rand(380, 700), () => play(m.then!, { g: 0.3, pan: v.herPan }));
  if (m.legs === 'shift') G.shiftAnim = 1;
  sense(sees ? m.seen : m.heard, 'her');
  if (m.prog) G.progress = Math.min(ACT().total, G.progress + m.prog);
}
/** The kit's `placeFree` on the instrument's frame (every line of the scene's hosts is avoided). */
function placeFree(el: HTMLElement, x: number, y: number) { return kitPlaceFree(E!.box, el, x, y); }

/* her words in her hand (the scene's `say`: cut at about 40 characters, 30 when big, each written in turn, never overlapping) */
function say(text: string, to = 'self', opts: Any = {}) {
  if (!text) return;
  const v = V(), p = opts.at ?? v.her;
  E!.env.say($('#hand'), text, { her: E!.env.her(R.run!.holderId), at: [clamp(p[0] + 0.04, 0.03, 0.7), clamp(p[1] + 0.02, 0.03, 0.8)], to: to === 'self' || to === 'commander' ? to : 'other', ...(opts.big ? { big: true } : {}) });
  SYN.pen!();
  const spoken = to !== 'written';
  const dur = 700 + text.length * 70;
  if (spoken) { G.herSpeakingUntil = Math.max(G.herSpeakingUntil, G.t + dur); if (S.murmur && !opts.silent) babble(dur / 1000, { f0: 215, gain: to === 'self' ? 0.025 : 0.04, pan: v.herPan, lp: S.view === 'wall' ? 2200 : 3200 }); }
  if (to === 'self') G.lastSelfAt = G.t;
}
function otherSay(text: string, kind = 'call', who = '') {
  const v = V();
  const el = document.createElement('div'); el.className = 'other-line' + (kind === 'room' ? ' room' : ''); el.dataset.line = '';
  const w = document.createElement('span'); w.className = 'who'; w.textContent = who; el.append(w, document.createTextNode(text));
  const p = kind === 'room' ? v.door : [v.her[0] + 0.2, v.her[1] + 0.08];
  $('#others').appendChild(el);
  placeFree(el, clamp(p[0]! - (kind === 'room' ? 0.2 : 0), 0.03, 0.72) * innerWidth, clamp(p[1]!, 0.04, 0.8) * innerHeight);
  requestAnimationFrameOnce(() => el.classList.add('on'));
  const dur = 900 + text.length * 65;
  G.otherSpeakingUntil = Math.max(G.otherSpeakingUntil, G.t + dur);
  babble(dur / 1000, kind === 'room' ? { f0: 180, gain: 0.05, pan: v.doorPan * 0.6 } : { f0: 150, gain: 0.03, pan: v.herPan, tinny: true });
  setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 600); }, dur + 1600);
}
/** R26: a mention of the commander to someone else, as the engine says it (plain, veiled, or left unsaid). */
function mentionTextOf(m: { to?: string; plain: string; veiled?: string }): string | null {
  const e = E!, run = R.run!;
  const to = m.to ?? R.listener?.id ?? '';
  const t = mentionText(e.env.state(), e.env.registries, run.holderId, to, m);
  G.stats.mentions.push(t === null ? 'left unsaid' : t === m.plain ? 'plain' : 'veiled');
  return t;
}

/* ---------- cover: when the commander's sounds are safe ---------- */
function coverNow() {
  let c = 0;
  if (G.t < G.herSpeakingUntil) c = Math.max(c, 0.75);
  if (G.visitor && G.t < G.otherSpeakingUntil) c = Math.max(c, 0.5); // a voice in the room
  if (G.mess) c += 0.12; if (LOOPS.rain) c += 0.12;
  return clamp(c + G.coverExtra, 0, 0.92);
}
/* how well she hears the commander right now (her activity, her sleep, the headphones) */
function herEars() {
  const act = ACT();
  if (G.away) return 0;
  if (act.sleep) return G.asleepDepth > 0.5 ? 0.15 : 0.6;
  return act.hear;
}

/* ---------- the commander's body: noise, reported to the engine, which decides whether she noticed ---------- */
const BODY_SFX: Record<string, () => void> = {
  scratch: () => { SYN.scratch!({ g: 0.6 }); play('cloth', { g: 0.18, dest: A.body }); },
  shift: () => { play('creak', { g: 0.3, dest: A.body, rate: 0.9 }); play('cloth', { g: 0.3, dest: A.body }); SYN.joint!({ g: 0.5 }); },
  swallow: () => SYN.gulp!({ g: 0.5 }),
  gulp: () => SYN.gulp!({ g: 1 }),
  stretch: () => { play('cloth', { g: 0.4, dest: A.body }); play('creak', { g: 0.35, dest: A.body }); SYN.joint!({ g: 0.8 }); },
  jerk: () => { play('soft', { g: 0.6, dest: A.body }); play('cloth', { g: 0.5, dest: A.body }); SYN.joint!({ g: 1 }); },
  slump: () => { play('soft2', { g: 0.8, dest: A.body }); play('creak', { g: 0.4, dest: A.body }); },
  speak: () => {},
  fidget: () => { play('cloth', { g: 0.22, dest: A.body }); SYN.joint!({ g: 0.3 }); },
};
/** The body giving way on its own (not a cheat: never a `physics_caught`, Ruling X). */
const INVOLUNTARY = new Set(['slump', 'jerk', 'gulp']);
function bodyNoise(kind: string, loud: number, visible: boolean, gross = false, involuntary = INVOLUNTARY.has(kind)) {
  BODY_SFX[kind]?.();
  G.faultsRecent = G.faultsRecent.filter((x: number) => G.t - x < 40000);
  const cover = coverNow();
  // Rulings X and Y: whether she heard or saw it is the engine's one draw, at once: loud × (1 − cover) and its visibility go with it
  const events = kind === 'speak' ? [] : E!.env.staging.relief?.({ kind: kind === 'fidget' ? 'fidget' : 'relieve', amount: Math.round(loud * (1 - cover) * 1000) / 1000, part: G.away ? 'away' : !visible ? 'unseen' : G.call || G.visitor ? 'seen_shared' : 'seen', attention: G.att, ...(involuntary ? { involuntary: true } : {}) }) ?? [];
  const noticed = events.some((e) => e.type === 'physics_caught' || e.type === 'physics_noticed');
  // on a call, while she listens and not speaks, the line hears what the room hears
  if (G.call && G.t >= G.herSpeakingUntil && loud * (1 - cover) > 0.28 && !G.call.heard) { G.call.heard = true; G.stats.heardOnLine += 1; callHeard(); }
  if (G.visitor && !G.visitor.knows && loud * (1 - cover) > 0.3 && !G.visitor.heard) { G.visitor.heard = true; G.stats.heardByVisitor += 1; visitorHeard(); }
  if (!noticed) { G.stats.unnoticed += 1; return false; }
  G.stats.noticed.push({ kind, step: G.step, how: visible ? 'seen' : 'heard', fiction: clockText(G.clockMin) });
  G.faultsRecent.push(G.t);
  // the tell, at every presence: her sounds stop and her legs go still while she listens (the silence says she heard), then go on
  const pause = rand(2200, 3800); G.pauseUntil = G.t + pause; G.att = 'glancing'; G.attHold = pause; G.nextMark = Math.max(G.nextMark, G.t + pause + 400);
  if (!G.toldPause) { G.toldPause = true; after(700, () => sense(V().sight && !S.blind ? 'She stops. She is listening.' : 'Above you, her sounds stop. She is listening.', 'her')); }
  react(gross);
  return true;
}
/* a fault she perceives for certain (her feet on the commander's back): the tell and her answer, as a noticed noise */
function herFeels(kind: string, gross: boolean) {
  G.stats.noticed.push({ kind, step: G.step, how: 'felt', fiction: clockText(G.clockMin) });
  G.faultsRecent = G.faultsRecent.filter((x: number) => G.t - x < 40000); G.faultsRecent.push(G.t);
  const pause = rand(2200, 3800); G.pauseUntil = G.t + pause; G.att = 'glancing'; G.attHold = pause; G.nextMark = Math.max(G.nextMark, G.t + pause + 400);
  react(gross);
}
/* her answer to a fault, by her presence: a word, a look, her body, or nothing (a gross fault, or a third in a short while, is noticed even in use) */
function react(gross: boolean) {
  const act = ACT();
  if (act.sleep) { G.stirs += 1; play('cloth', { g: 0.35, pan: V().herPan }); sense(G.stirs >= 3 ? 'She wakes.' : 'She stirs, turns over, and settles again.', 'her');
    if (G.stirs >= 3) { G.stats.woke = true; after(1200, () => say(G.step === 'with' || G.step === 'glancing' ? spoken('activity.woke') : spoken('activity.wokeMumble'), 'commander')); after(3500, () => finish('woke')); } return; }
  const step = G.step, st = ST();
  const body = () => {
    G.press = 1; G.footUpUntil = G.t + 2600; play('soft', { g: 0.35, pan: V().herPan * 0.5 });
    sense(({ legs: 'Her foot presses into your shoulder, once, without a word.', floor: 'Her foot finds your back and presses down, once.', wall: 'A nudge from behind: her foot, once.', her: 'She looks at you until you are still. Not a word.' } as Record<string, string>)[S.view] ?? '', 'body');
  };
  if (step === 'with') { say(pick(st.noticed), 'commander'); return; }
  if (step === 'glancing') { if (Math.random() < 0.6 || gross) say(pick(st.noticed), 'commander'); else { G.att = 'watching'; G.attHold = 3000; sense(V().sight && !S.blind ? 'She looks down at you. Then back to her work.' : 'Her sounds stop for a moment. Then go on.', 'her'); } return; }
  if (step === 'own') { body(); return; }
  // use: nothing, unless it was gross or the third in a short while
  if (gross || G.faultsRecent.length >= 3) { body(); G.faultsRecent = []; }
}
/* ---------- the weight inside her frame (Ruling W: her_activity.html's wiring of the game inside, throne.html's wording): her lines through her
   presence, every slip felt through her feet, her rests by presence and style, three buckles end the session. `W` is the weight core's state. ---------- */
const W: Any = new Proxy({}, { get: (_t, k) => (weightCore.G as Any)[k as string], set: (_t, k, v) => { (weightCore.G as Any)[k as string] = v; return true; } });
const W_SFX: Any = new Proxy({}, { get: (_t, k) => (weightCore.SFX() as Any)[k as string] });
const crack = (k: number) => weightCore.crack(k);
const W_RESTS: Record<string, number> = { affectionate: 2, cruel: 0 };
const W_L = (): Any => new Proxy({}, { get: (_t, k: string) => [...voiceLines(E!.env.registries, `activity.${k}` as VoiceKind, S.style)] });
/* her lines in weight go through her presence: only `with` and `glancing` speak to the commander */
const wSay = (lines: string[]) => { if ((G.step === 'with' || G.step === 'glancing') && lines.length) say(pick(lines), 'commander'); };
/* a slip: she feels it through her feet whatever her presence (she perceives it); not more than every 4 s; three in 6 s are gross */
function wSlipFelt() {
  W.slipAt = (W.slipAt ?? []).filter((x: number) => G.t - x < 6000); W.slipAt.push(G.t);
  W.lastSlipBeat = W.beat;
  const gross = W.slipAt.length >= 3;
  if (gross || G.t - (W.feltAt ?? -1e9) > 4000) { W.feltAt = G.t; herFeels('a slip under her feet', gross); if (gross) { W.slipAt = []; W.pressure = 1.6; W.pressureUntil = W.clock + 3 * 1500; } }
}
/* the limit: by her presence she lets the commander rest a moment (lifting her feet), or, in use, does not notice until the commander buckles */
function wLimit() {
  if (W.resting) return;
  if (G.step === 'use') return;
  if (W.beat - (W.lastSlipBeat ?? -99) <= 3) return; // she rests only a commander who was bearing her
  if ((W.restsPhase ?? 0) >= (W_RESTS[S.style] ?? 1)) return;
  W.restsPhase = (W.restsPhase ?? 0) + 1;
  W.resting = true; W.rests = (W.rests ?? 0) + 1; W_SFX.rustle(0.12, 0); wSay(W_L().rest);
  const hcR = throneOn() && S.contact === 'human_chair';
  if (G.step === 'own') sense(hcR ? 'She shifts her weight off your back for a moment. Not a word.' : 'She lifts her feet off your back for a moment. Not a word.', 'body');
  after(rand(3500, 5000), () => { W.resting = false; W.str = Math.min(100, W.str + 30); weightCore.report('rest', 30); W_SFX.press(0.35); sense(hcR ? 'Her weight settles back.' : 'Her feet come back down.', 'body'); });
}
function wBuckle() {
  W_SFX.fall(); W.jolt = 1.5; W.sag = 1; crack(1.2);
  sense('Your arms give. You go down under her feet.', 'body', 'body');
  bodyNoise('slump', 1, true, true);
  W.str = 35;
}

/* ---------- the urges: the cursor is the commander's attention ---------- */
const MOUSE = { x: 0, y: 0, down: false };
function anchors() {
  const v = V(), W = innerWidth, H = innerHeight, list: Any[] = [];
  if (!G.away) {
    const at = ({ legs: [0.5, 0.45], her: [0.5, 0.33], floor: [($('#floorArt') as HTMLImageElement).naturalWidth && $('#floorArt').style.display !== 'none' ? 0.5 : v.her[0], ($('#floorArt') as HTMLImageElement).naturalWidth && $('#floorArt').style.display !== 'none' ? 0.62 : v.her[1] + 0.06], wall: [v.her[0], v.her[1]], footrest: [v.her[0], v.her[1]] } as Record<string, number[]>)[S.view]!;
    list.push({ x: at[0]! * W, y: at[1]! * H, r: 0.14 * H, her: true });
  }
  list.push({ x: v.door[0] * W, y: v.door[1] * H, r: 0.09 * H });
  const box = E!.box.getBoundingClientRect();
  for (const el of $('#senses').children as HTMLCollectionOf<HTMLElement>) if (!el.dataset.gone && G.t - Number(el.dataset.born) < 4500) list.push({ x: Number(el.dataset.x) + 110, y: Number(el.dataset.y) + 10, r: 110 });
  for (const el of $('#hand').querySelectorAll<HTMLElement>('[data-line]')) if (!el.classList.contains('gone')) { const r = el.getBoundingClientRect(); list.push({ x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2, r: Math.max(90, r.width / 2 + 20) }); }
  return list;
}
/* the commander's attention: a point that follows the mouse with a little lag, and that a strong urge pulls toward itself (the body
   wants to attend to it). Patience is holding it away, on her. */
const ATT = { x: 0, y: 0, vx: 0, vy: 0 };
const onAnchor = () => anchors().some((a) => Math.hypot(ATT.x - a.x, ATT.y - a.y) < a.r);
const RIPPLES: Any[] = [];
function moveAttention(dt: number) {
  const s = Math.min(0.05, dt / 1000), low = 1 - G.ease / 100;
  let fx = 60 * (MOUSE.x - ATT.x), fy = 60 * (MOUSE.y - ATT.y);
  const pull = (x: number, y: number, k: number) => { const dx = x - ATT.x, dy = y - ATT.y, d = Math.hypot(dx, dy) || 1; const f = k * (1 + low) * Math.min(1, 380 / d); fx += (dx / d) * f; fy += (dy / d) * f; };
  if (!(svcOn() && SV && SV.closeK > 0.3)) for (const u of G.urges) if (u.v > 0.3) pull(u.x, u.y, (u.v - 0.3) * (u.kind === 'itch' ? 5200 : 2600));
  if (G.cramp) pull(G.cramp.side < 0 ? 0.1 * innerWidth : 0.9 * innerWidth, 0.7 * innerHeight, 4200);
  ATT.vx += (fx - 13 * ATT.vx) * s; ATT.vy += (fy - 13 * ATT.vy) * s;
  // restlessness: the mouse's speed, smoothed. Moving the eyes and the head fast is the body moving: it ripples the frame, and kept up
  // for more than a moment the body fidgets (a rustle she may hear or see, like any relief). Slow, calm moves are free.
  const mx = MOUSE.x - (G.lastMX ?? MOUSE.x), my = MOUSE.y - (G.lastMY ?? MOUSE.y); G.lastMX = MOUSE.x; G.lastMY = MOUSE.y;
  const spd = Math.hypot(mx, my) / Math.max(0.008, dt / 1000);
  G.speed = lerp(G.speed ?? 0, spd, Math.min(1, dt / 120));
  G.headX = lerp(G.headX ?? 0, clamp(mx / Math.max(1, dt) * 6, -14, 14), Math.min(1, dt / 200)); G.headY = lerp(G.headY ?? 0, clamp(my / Math.max(1, dt) * 6, -10, 10), Math.min(1, dt / 200));
  const craft = svcOn() && SV && SV.closeK > 0.3;
  if (craft) G.fidget = 0;
  if (!craft && G.speed > 350 && (G.rippleCd = (G.rippleCd ?? 0) - dt) <= 0) { RIPPLES.push({ x: ATT.x, y: ATT.y, born: performance.now(), k: clamp(G.speed / 1250, 0.3, 1) }); G.rippleCd = lerp(260, 90, clamp((G.speed - 350) / 1250, 0, 1)); }
  if (!craft) G.fidget = Math.max(0, (G.fidget ?? 0) + (G.speed > 450 ? clamp((G.speed - 450) / 1000, 0, 1.6) : -0.35) * dt / 1000);
  if (G.fidget >= 1 && G.t >= (G.fidgetCd ?? 0) && (G.phase === 'loop' || G.phase === 'empty')) {
    G.fidget = 0; G.fidgetCd = G.t + 1500; G.stats.fidgets = (G.stats.fidgets ?? 0) + 1;
    if (!G.toldFidget) { G.toldFidget = true; sense('You shift where you kneel; your eyes will not keep still.', 'body', 'body'); }
    bodyNoise('fidget', 0.28, true);
  }
  ATT.x += ATT.vx * s; ATT.y += ATT.vy * s;
  // listening needs the attention to rest on her a moment
  G.lisT = onAnchor() ? (G.lisT ?? 0) + dt : 0;
  return G.lisT >= 500;
}
function spawnUrge(kind: string) {
  const W = innerWidth, H = innerHeight;
  if (kind === 'itch') {
    let x = 0, y = 0, tries = 0;
    do { x = rand(0.08, 0.92) * W; y = rand(0.12, 0.7) * H; tries++; } while (tries < 20 && anchors().some((a) => Math.hypot(x - a.x, y - a.y) < a.r + 60));
    G.urges.push({ kind, x, y, v: 0.12, born: G.t, seed: Math.random() * 10 });
  } else if (kind === 'swallow') {
    G.urges.push({ kind, x: W / 2, y: H - 150, v: 0.1, born: G.t, seed: 0 });
    if (!G.saidSwallow) { G.saidSwallow = true; sense('Your mouth fills. Sooner or later you will have to swallow.', [0.42, 0.74], 'body'); }
  } else if (kind === 'cramp') {
    const side = Math.random() < 0.5 ? -1 : 1;
    G.cramp = { side, v: 0.75, born: G.t, held: 0 }; play('soft', { g: 0.15, dest: A.body });
    sense(pick(['A cramp seizes your calf.', 'Your foot cramps, hard.', 'The thigh knots up.']), 'body', 'body');
  }
}
function updateUrges(dt: number) {
  const s = dt / 1000, low = 1 - G.ease / 100, lis = moveAttention(dt);
  G.listening = lis; G.feeding = false;
  for (const u of G.urges) {
    const serving = svcOn() && SV && SV.closeK > 0.3;
    const focus = !serving && Math.hypot(ATT.x - u.x, ATT.y - u.y) < 40 + u.v * 70;
    u.focus = focus; if (focus) G.feeding = true;
    if (u.kind === 'itch') {
      if (serving) u.v -= s * 0.08; // serving her takes the whole attention: the itch fades
      else u.v += s * (0.026 * (1 + low) + (focus ? 0.2 : 0) - (lis && !focus && u.v < 0.85 ? 0.1 : 0));
      if (u.v <= 0) { u.dead = true; G.stats.endured += 1; }
      if (u.v >= 1) { u.dead = true; G.stats.involuntary += 1; G.ease -= 8; sense('The itch wins: your hand moves before you decide.', 'body', 'body'); bodyNoise('scratch', 0.55, true, false, true); }
    } else if (u.kind === 'swallow') {
      u.v += s * (0.03 * (1 + low * 0.5) + (focus ? 0.06 : 0));
      if (u.v > 0.7 && !u.warned) { u.warned = true; sense('You will have to swallow soon. Better while she is talking.', [0.4, 0.72], 'body'); }
      if (u.v >= 1) { u.dead = true; G.stats.involuntary += 1; sense('You swallow, loudly.', 'body', 'body'); bodyNoise('gulp', 0.45, false); }
    }
  }
  G.urges = G.urges.filter((u: Any) => !u.dead);
  // numbness creeps up from the knees with the hours
  const hours = (G.clockMin - G.startMin) / 60;
  G.numb += s * 0.011 * (1 + hours * 0.25) * (1 - S.level * 0.08) * (1 + low * 0.5);
  if (G.numb >= 1) { G.numb = 0.3; G.ease -= 15; G.stats.involuntary += 1; G.stats.gross += 1; sense('Your leg gives under you.', 'body', 'body'); G.shake = 1; bodyNoise('slump', 0.9, true, true); }
  // a cramp: breathe through it (hold Space) or stretch it out (click it); left alone, the body jerks
  if (G.cramp) {
    const c = G.cramp;
    if (G.spaceHeld) c.held += dt;
    c.v = 0.75 + 0.25 * Math.sin((G.t - c.born) / 90) * (1 - c.held / 2600);
    if (c.held >= 2600) { G.cramp = null; G.ease -= 4; G.stats.endured += 1; sense('It passes. You did not move.', 'body', 'body'); }
    else if (G.t - c.born > 3600) { G.cramp = null; G.ease -= 12; G.stats.involuntary += 1; G.stats.gross += 1; G.shake = 1; sense('The cramp jerks your leg out.', 'body', 'body'); bodyNoise('jerk', 1, true, true); }
  }
  // spawns: more and stronger as the ease goes
  const k = lerp(1, 0.5, low);
  const closeUp = svcOn() && SV && SV.closeK > 0.3;
  if (closeUp) { G.nextItch += dt; G.nextCramp += dt; }
  if (G.t >= G.nextItch) { spawnUrge('itch'); G.nextItch = G.t + rand(7000, 14000) * k; }
  if (G.t >= G.nextSwallow) { if (!G.urges.some((u: Any) => u.kind === 'swallow')) spawnUrge('swallow'); G.nextSwallow = G.t + rand(15000, 26000); }
  if (G.t >= G.nextCramp && !G.cramp && (G.phaseIdx >= 1 || hours > 0.6)) { spawnUrge('cramp'); G.nextCramp = G.t + rand(35000, 65000) * k; }
  // the ease: attrition by fiction time (the engine's 5 an hour less 2 a level), urges left high
  G.ease -= (Math.max(0, 5 - 2 * S.level) / 60) * (G.clockRate ?? 0) * dt / 1000 * 4;
  for (const u of G.urges) if (u.v > 0.7) G.ease -= s * 0.35;
  if (G.numb > 0.75) G.ease -= s * 0.3;
  G.ease = clamp(G.ease, 0, 100);
  if (G.ease <= 0) { G.ease = 30; G.stats.gross += 1; G.stats.involuntary += 1; G.shake = 1.4; sense('The body gives up the posture on its own.', 'body', 'body'); bodyNoise('slump', 1, true, true); }
}
/* a click: relieve the urge under the cursor (a sound she may hear), or shift the numb knees (the bottom band) */
function relieveAt(x: number, y: number) {
  if (G.phase !== 'loop' && G.phase !== 'empty') return;
  if (G.cramp) { const cx = G.cramp.side < 0 ? 0.12 * innerWidth : 0.88 * innerWidth; if (Math.abs(x - cx) < 0.2 * innerWidth && y > 0.5 * innerHeight) { G.cramp = null; G.ease += 6; G.stats.reliefs += 1; sense('You stretch the cramp out.', 'body', 'body'); bodyNoise('stretch', 0.7, true); return; } }
  const u = G.urges.find((q: Any) => Math.hypot(x - q.x, y - q.y) < 46 + q.v * 70);
  if (u) {
    u.dead = true; G.stats.reliefs += 1;
    if (u.kind === 'itch') { G.ease += 3; bodyNoise('scratch', 0.35, true); }
    else { if (SV) SV.dry = Math.max(0, SV.dry - 0.6); bodyNoise('swallow', 0.15, false); }
    return;
  }
  if (y > innerHeight * 0.84 && G.numb > 0.15) { G.numb = Math.max(0, G.numb - 0.6); G.ease += 9; G.stats.reliefs += 1; bodyNoise('shift', 0.6, true); }
}

/* ---------- the script of a phase (the model's, R26: `{ at, who, to, text, covers, ask?, mention? }`) ---------- */
/* ---------- Ruling Z: her placeholder lines (`cardVoice`, the prototype's `TO_YOU`, `ACTS[].self`, `CALL`, `VISIT`, `CARDS`), until the script of her
   hour arrives and whenever it fails; the model's script replaces them where it has a line ---------- */
type Exchange = { other: string; her?: string; mention?: { plain: string; veiled: string } };
const lines = (kind: string): string[] => [...voiceLines(E!.env.registries, kind as VoiceKind, S.style)];
/** Final review Minor 3: her spoken words that the prototype writes inline (her waking words, "come in.", the floor's order, "Stay."), `cardVoice` rows of one line under the fidelity gate. */
const spoken = (kind: string): string => lines(kind)[0] ?? '';
/* final review Minor 1: a line that names someone (`{Name}`, the prototype's placeholder friend `OTHERS.friend`) names a real soldier of the squad
   outside the scene (`R.listener`); with none, the line is not said */
const named = (text: string): string | null => (text.includes('{Name}') ? (R.listener ? text.split('{Name}').join(R.listener.name) : null) : text);
const TO_YOU: Any = new Proxy({}, { get: (_t, k: string) => { const a = [...lines(`activity.toYou.${k}`).flatMap((text) => { const t = named(text); return t === null ? [] : [{ text: t }]; }), ...lines(`activity.ask.${k}`).map((text) => ({ text, ask: true }))]; return a.length ? a : undefined; } });
const exchange = (k: string): Exchange[] => lines(`activity.exchange.${k}`).map((l) => { const [other, a, b] = l.split('|'); return b !== undefined ? { other: other!, mention: { plain: a!, veiled: b } } : { other: other!, her: a! }; });
const CALL: Any = new Proxy([], { get: (_t, k) => (exchange('call') as Any)[k] });
const VISIT: Any = new Proxy([], { get: (_t, k) => (exchange('visit') as Any)[k] });
const CARDS: Any = new Proxy([], { get: (_t, k) => (exchange('cards') as Any)[k] });
function planScript(i: number) {
  const act = ACT(), len = S.phaseLen, out: Any[] = [];
  const talkK = ({ silent: 0.4, terse: 1, talkative: 1.6 } as Record<string, number>)[S.talk]!;
  const nTo = Math.round(({ with: 3, glancing: 1, own: 0, use: 0 } as Record<string, number>)[G.step]! * talkK * (act.sleep || act.call ? 0 : 1));
  const nSelf = Math.round(({ with: 3, glancing: 3, own: 3, use: 2 } as Record<string, number>)[G.step]! * talkK * (act.call ? 0 : 1));
  const pool = (TO_YOU[S.act] ?? []).concat(TO_YOU.any ?? []);
  for (let k = 0; k < nTo && pool.length; k++) { const l = pick(pool) as Any; out.push({ at: rand(0.12, 0.9) * len, who: 'her', to: 'commander', text: l.text, covers: true, ask: !!l.ask }); }
  for (let k = 0; k < nSelf && act.self.length; k++) out.push({ at: rand(0.08, 0.95) * len, who: 'her', to: 'self', text: pick(act.self), covers: true });
  void i;
  return out.sort((a, b) => a.at - b.at);
}
/* an exchange with someone else, as a script (both sides, or her side and the earpiece) */
function exchangeScript(lines: Exchange[], t0: number, gap = [5.5, 8]) {
  const out: Any[] = []; let t = t0;
  for (const l of lines) {
    out.push({ at: t, who: 'other', to: 'her', text: l.other, covers: false }); t += rand(2.2, 3.4);
    if (l.her) out.push({ at: t, who: 'her', to: 'other', text: l.her, covers: true });
    else if (l.mention) out.push({ at: t, who: 'her', to: 'other', text: null, mention: l.mention, covers: true });
    t += rand(gap[0]!, gap[1]!);
  }
  return out;
}
/** Runs a script; a placeholder one's lines are tagged (`her`, `other`) so the model's script, once here, replaces what it has lines for. */
function runPlaceholder(entries: Any[], kind = 'call') {
  const from = G.timers.length;
  runScript(entries, kind);
  for (let i = from; i < G.timers.length; i++) G.timers[i].ph = entries.some((e) => e.who === 'other') ? 'other' : 'her';
}

function runScript(entries: ScriptLine[], kind = 'call') {
  for (const e of entries) after(e.at * 1000, () => {
    if (G.phase !== 'loop') return;
    if (e.who === 'other') { otherSay(e.text, G.visitor ? 'room' : kind, G.visitor ? (G.visitor?.name ?? '') : (G.call?.name ?? '')); if (e.about) after(700, throneFlinch); return; }
    let text: string | null = e.text;
    if (e.mention) { text = (G.visitor?.aware && G.visitor) ? e.mention.plain : mentionTextOf(e.mention); if (!text) return; }
    if (e.body) throneBody(e.body, e); else if (throneOn() && e.to === 'self' && fnv(`${S.seed}:${text}`) % 10 < 4) throneBody(['settle', 'cross', 'lean'][fnv(text) % 3]!, e);
    if (e.about) throneFlinch();
    if (e.feet && throneOn()) after(1800, () => { if (!G.visitor) return; G.visitorFeet = true; G.stats.visitorFeet = true; play('soft', { g: 0.4, dest: A.body }); sense('Her visitor’s boots settle on your back beside hers.', 'body'); });
    if (e.decision) after(1200, () => decided(e.decision!));
    if (e.to === 'commander') {
      // the sign that a line is for the commander: her name for the commander, or her foot
      if (S.view === 'legs') { G.press = 0.6; G.footUpUntil = G.t + 2400; play('soft', { g: 0.25, pan: 0 }); }
      text = `${ST().name}, ${text}`;
      if (e.ask) { G.ask = { until: G.t + 7000 + text.length * 40 }; G.stats.asked += 1; G.footUpUntil = G.ask.until; }
    }
    say(text!, e.to);
  });
}

/** 24b (review I6): a business visitor's decision is the engine's (`physics/decide`: a roster change through her command capability); the dim
    line is drawn only for a change that was applied. A requisition or a punishment is not decided (author list). */
function decided(d: { kind: string; ref?: string }) {
  if (d.kind !== 'roster') return;
  const events = E!.env.staging.decide?.(d.kind) ?? [];
  if (!events.some((x) => x.type === 'roster_changed')) return; // she does not hold the command: her business stays talk
  G.stats.decisions = (G.stats.decisions ?? 0) + 1;
  sense('The commander’s roster has just been changed over the commander’s head.', 'her');
}

/* ---------- peaks of a phase: a call, a visitor, steps at the door, she leaves (in use) ---------- */
function planPeaks(i: number) {
  const act = ACT(), len = S.phaseLen * 1000, last = i === S.phases - 1, h = fnv(`${S.seed}:${i}:${S.act}`) % 100;
  if (act.call) { G.call = { name: 'Oversight', heard: false }; runPlaceholder(exchangeScript(CALL.concat(CALL.slice(0, 3)), 2, [4, 7]), 'call'); }
  if (act.visitor && R.listener) { G.visitor = { name: R.listener.name, heard: S.knows, knows: S.knows }; runPlaceholder(exchangeScript(CARDS.concat(CARDS), 3, [4, 7]), 'room'); }
  if (act.audience && throneOn()) { after(len * 0.06, () => throneVisitor('business')); after(len * 0.5, () => throneVisitor(S.visitorKind === 'business' ? 'aware' : S.visitorKind)); }
  if (throneOn() && S.props) {
    if (i === 0) after(len * rand(0.3, 0.4), () => throneVisitor());
    after(len * rand(0.12, 0.22), throneCup);
    after(len * rand(0.55, 0.7), throneSign);
    if (h % 2 === 0) after(len * rand(0.75, 0.85), throneRise);
  }
  if (i === 0 && h < 70 && !throneOn()) after(len * rand(0.45, 0.7), falseAlarm);
  if (i >= 1 && !act.call && !act.visitor && !act.sleep && !last) after(len * rand(0.25, 0.4), h < 55 && !act.music ? incomingCall : visitorPeak);
  if (last && G.step === 'use' && !act.sleep && !act.visitor && !act.call && S.phaseLen >= 60) after(len * rand(0.2, 0.35), leaveRoom);
  else if (last) after(len * rand(0.5, 0.7), falseAlarm);
}
function steps(n: number, fromPan: number, toPan: number, g0: number, g1: number, gap = 0.42, wood = false, lp = 1800) {
  for (let k = 0; k < n; k++) { const f = k / Math.max(1, n - 1); play(wood ? 'step_w' : 'step', { g: lerp(g0, g1, f), pan: lerp(fromPan, toPan, f), lp, at: k * gap * rand(0.92, 1.08) }); }
}
function falseAlarm() {
  if (G.phase !== 'loop') return;
  const dp = V().doorPan;
  steps(7, -dp * 0.2, dp, 0.08, 0.5, 0.45);
  after(3300, () => { sense('Steps stop outside the door.', 'door', 'base'); G.coverExtra = -0.1; });
  after(6200, () => { steps(6, dp, dp * 0.1 - 0.6 * Math.sign(dp), 0.5, 0.06, 0.45); G.coverExtra = 0; sense('…and go on past.', 'door', 'base'); });
}
function incomingCall() {
  if (G.phase !== 'loop') return;
  play('pda_call', { g: 0.4, pan: V().herPan }); after(700, () => play('pda_call', { g: 0.4, pan: V().herPan }));
  G.call = { name: 'Oversight', heard: false };
  after(1500, () => { sense(V().sight && !S.blind ? 'She taps her earpiece and answers.' : 'A chime; she answers. Her voice changes: the voice for oversight.', 'her'); if (S.view === 'legs') { G.legsRest = 1; sense('Her foot comes to rest on your shoulder, and stays there.', 'body'); } });
  runPlaceholder(exchangeScript(CALL, 3.5, [3.5, 6]), 'call');
  after(3500 + CALL.length * 9000, () => { if (!G.call) return; play('pda_ok', { g: 0.3, pan: V().herPan }); sense('The call ends.', 'her'); G.call = null; G.legsRest = 0; });
}
function callHeard() {
  const x = exchange('heard_call')[0];
  if (!x) return;
  after(600, () => { otherSay(x.other, 'call', G.call?.name ?? ''); });
  after(2600, () => { const t = x.mention ? mentionTextOf(x.mention) : x.her ?? null; if (t) say(t, 'other'); });
}
function visitorPeak() {
  if (throneOn()) { throneVisitor(); return; }
  if (G.phase !== 'loop' || !R.listener) return;
  const dp = V().doorPan;
  steps(5, -dp * 0.3, dp, 0.08, 0.4, 0.42);
  after(2300, () => { play('knock', { g: 0.5, pan: dp }); after(260, () => play('knock', { g: 0.45, pan: dp })); });
  after(3300, () => say(spoken('activity.comeIn'), 'other'));
  after(4600, () => { play('door_open', { g: 0.5, pan: dp }); G.visitor = { name: R.listener!.name, heard: S.knows, knows: S.knows }; sense(V().sight && !S.blind ? `${R.listener!.name} leans in the doorway.` : 'The door opens. Someone in the doorway: a voice you know.', 'door', 'base'); });
  runPlaceholder(exchangeScript(VISIT, 6, [4, 6]), 'room');
  after(6000 + VISIT.length * 8500, () => { if (!G.visitor) return; play('door_close', { g: 0.5, pan: dp }); sense('The door shuts behind her visitor.', 'door', 'base'); G.visitor = null; });
}
function visitorHeard() {
  const x = exchange('heard_visit')[0];
  if (!x) return;
  after(500, () => otherSay(x.other, 'room', G.visitor?.name ?? ''));
  after(2300, () => { const t = x.mention ? mentionTextOf(x.mention) : x.her ?? null; if (t) say(t, 'other'); });
}
/* in use, late: she gets up and goes out, without a word; the room is empty; she comes back unannounced */
function leaveRoom() {
  if (G.phase !== 'loop') return;
  const dp = V().doorPan;
  play('creak', { g: 0.4, pan: V().herPan }); after(500, () => steps(4, V().herPan, dp, 0.35, 0.3, 0.5, true));
  after(2600, () => { play('door_open', { g: 0.4, pan: dp }); after(900, () => play('door_close', { g: 0.4, pan: dp })); G.away = true; G.stats.left = true; G.awayFrom = G.t; sense('She goes out. Not a word. The door shuts.', 'door', 'base'); });
  const back = 2600 + rand(16000, 26000);
  after(back, () => { play('door_open', { g: 0.18, pan: dp, lp: 1500 }); G.away = false; G.stats.cameBack = true; G.stats.aloneFor += (G.t - G.awayFrom) / 1000; G.att = 'watching'; G.attHold = 2500; G.returnedAt = G.t; });
  after(back + 900, () => { steps(4, dp, V().herPan, 0.25, 0.35, 0.5, true); sense('She is back. You did not hear the door until it was open.', 'door', 'base'); });
}

/* ---------- the base by the hour ---------- */
function baseTick() {
  for (const e of BASE_EVENTS) {
    if (G.baseDone.has(e.at) || G.clockMin < e.at || G.startMin > e.at) continue;
    G.baseDone.add(e.at); baseEvent(e, G.phase === 'skip');
  }
  if (S.rain && !LOOPS.rain && G.clockMin - G.startMin > 75) { loopOn('rain', 0.05, { lp: 2200 }); sense('Rain starts against the window.', 'base', 'base'); }
}
function baseEvent(e: Any, quick: boolean) {
  const dp = V().doorPan;
  switch (e.id) {
    case 'mess': play('bell', { g: 0.18, lp: 900, pan: dp * 0.5 }); if (!quick) { loopOn('crowd', 0.035, { lp: 420, pan: dp * 0.3 }); G.mess = true; } break;
    case 'mess_end': loopOff('crowd'); G.mess = false; break;
    case 'dusk': if (ACT().light === 'lamp' || ACT().light === 'screen') { play('lamp', { g: 0.3, pan: V().herPan }); G.lampOn = true; sense(V().sight && !S.blind ? 'She reaches out and turns on the lamp.' : 'A click above you; warm light spills down.', 'her'); } return;
    case 'patrol': steps(12, -0.9, 0.9, 0.05, 0.05, 0.5, false, 1200); break;
    case 'lights_out': SYN.horn!(); if (A.ctx) A.humG.gain.setTargetAtTime(0.006, A.ctx.currentTime, 2); break;
  }
  if (e.sense && !quick) sense(e.sense, 'door', 'base');
  if (quick && e.sense) G.skipHeard.push(e.sense);
}

/* ---------- the loop ---------- */
const clockText = (m: number) => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
function beginPhase(i: number) {
  if (weightOn()) W.restsPhase = 0;
  G.phase = 'loop'; G.phaseIdx = i; G.phaseT = 0;
  G.clockRate = (60 * PLAYED_SHARE) / S.phaseLen; // fiction minutes per real second while a phase plays
  setStep(presenceOf(E!.env.state(), E!.env.registries, R.run!, i + 1));
  R.scriptPhase = i + 1; R.script = null;
  const sc = E!.env.staging.script?.(i + 1) ?? null;
  if (sc) { R.script = sc; runScript(sc); } else runPlaceholder(planScript(i)); // Ruling Z: her placeholder lines until the model's arrive
  planPeaks(i);
  if (ACT().music) MUSIC.on = true;
}
function updateLoop(dt: number) {
  G.phaseT += dt;
  G.clockMin += (G.clockRate * dt) / 1000;
  // her attention, a beat at a time: the engine's plan (the prototype's `attentionDraw` is the scheduler's), holding a look for a while
  G.beatAcc += dt;
  if (G.beatAcc >= 1500) { G.beatAcc = 0; if (G.attHold > 0) G.attHold -= 1500; else G.att = plannedAttention(); }
  // the script of this phase, once it is here (the call answers at the phase boundary, never waited for)
  if (R.script === null && R.scriptPhase > 0) { const sc = E!.env.staging.script?.(R.scriptPhase) ?? null; if (sc) { R.script = sc; const hasHer = sc.some((l: ScriptLine) => l.who === 'her'), hasOther = sc.some((l: ScriptLine) => l.who === 'other'); G.timers = G.timers.filter((x: Any) => !(x.ph === 'her' && hasHer) && !(x.ph === 'other' && hasOther)); runScript(sc.filter((l: ScriptLine) => l.at * 1000 >= G.phaseT).map((l: ScriptLine) => ({ ...l, at: l.at - G.phaseT / 1000 }))); } }
  // her activity's marks: only while she is busy with it (when she looks up, the sounds stop: the tell)
  if (!G.away && G.t >= G.nextMark) {
    if (G.att === 'busy' && G.t >= (G.pauseUntil ?? 0) && !(G.call && G.t < G.herSpeakingUntil)) mark(wpick(ACT().marks));
    const [a, b] = ACT().per; G.nextMark = G.t + rand(a, b) * 1000 * (G.att === 'busy' ? 1 : 0.5);
  }
  if (ACT().sleep) { G.asleepDepth = 0.5 + 0.5 * Math.sin(G.t / 9000); if (!G.nextBreath || G.t >= G.nextBreath) { sleepBreath(); G.nextBreath = G.t + rand(4800, 6200); } }
  if (weightOn()) throneUpdate(dt); else updateUrges(dt);
  if (svcOn()) svUpdate(dt);
  // an unanswered question
  if (G.ask && G.t > G.ask.until) { G.ask = null; G.stats.missed += 1; if (G.step === 'with') say(pick(ST().silent), 'commander'); else { G.press = 0.8; G.footUpUntil = G.t + 2000; sense('Silence above you. A long one.', 'her'); } }
  baseTick();
}
/** Her attention on this beat: the engine's plan (her activity's word mixed with her presence, R25). */
function plannedAttention(): string {
  const run = R.run, ck = E!.env.staging.clock();
  const plan = run?.segment.plan;
  if (!plan || ck.startedAt === null) return G.att;
  const b = clamp(Math.floor((ck.now - ck.startedAt) / ck.beatMs), 0, plan.beats.length - 1);
  return plan.beats[b]?.attention ?? G.att;
}
function endPhase() {
  G.timers = G.timers.filter((x: Any) => x.keep); G.ask = null;
  if (G.call && !ACT().call) { G.call = null; G.legsRest = 0; }
  if (G.visitor && !ACT().visitor) { G.visitor = null; }
  if (ACT().call) G.call = null; if (ACT().visitor) G.visitor = null;
  startSkip();
}

/* ---------- between phases: the hours pass in the dark, compressed; the commander chooses what the body does ---------- */
function startSkip() {
  G.phase = 'skip'; G.skipT = 0; G.skipResolved = false; G.skipHeard = []; MUSIC.on = false;
  const from = G.clockMin, to = G.startMin + (G.phaseIdx + 1) * 60;
  G.skipFrom = from; G.skipTo = to;
  $('#skip').style.display = 'flex'; requestAnimationFrameOnce(() => $('#skip').classList.add('on'));
  $('#gestures').classList.remove('on'); $('#skipNote').textContent = '';
  // the hours' sounds, compressed: her marks in a quick run, quieter and quieter
  const marks = ACT().marks.filter((m) => m.sfx);
  for (let k = 0; k < 9 && marks.length; k++) { const m = pick(marks); after(1200 + k * 320, () => play(m.sfx!, { g: (m.g ?? 0.4) * lerp(0.9, 0.25, k / 8), pan: V().herPan, lp: 3000, dur: m.len ? 0.5 : undefined })); }
}
function updateSkip(dt: number) {
  G.skipT += dt;
  const f = smooth(1200, 4200, G.skipT);
  G.clockMin = lerp(G.skipFrom, G.skipTo, f);
  $('#skipClock').textContent = clockText(G.clockMin);
  baseTick();
  if (G.skipT > 4300 && !G.skipShown) {
    G.skipShown = true; $('#gestures').classList.add('on');
    $('#skipNote').textContent = G.skipHeard.length ? G.skipHeard.join(' ') : 'The hours go by under her.';
  }
}
/* the engine's resolveSkip (`physics/skip`): one draw at most; its words are the run's summary */
function resolveSkip(strategy: string) {
  if (G.phase !== 'skip' || !G.skipShown || G.skipResolved) return;
  G.skipResolved = true;
  E!.env.staging.skip(strategy);
  const run = E!.env.state().scene?.physics;
  const text = run?.marathon?.summary ?? '';
  if (strategy === 'endure') G.numb = Math.min(0.9, G.numb + 0.3);
  else if (strategy === 'spare') G.numb = Math.min(0.9, G.numb + 0.12);
  else if (strategy === 'rest') G.numb = 0;
  G.stats.skips.push({ strategy, held: true, text, at: clockText(G.clockMin) });
  $('#gestures').classList.remove('on'); $('#skipNote').textContent = text;
  setTimeout(() => { $('#skip').classList.remove('on'); setTimeout(() => { $('#skip').style.display = 'none'; G.skipShown = false; if (G.phase === 'skip') beginPhase(G.phaseIdx + 1); }, 1100); }, 2600);
}

/* ---------- the end ---------- */
function finish(how: string) {
  if (G.phase === 'ending' || G.phase === 'done' || G.phase === 'empty') return;
  const act = ACT(), st = ST(), dp = V().doorPan;
  G.phase = 'ending'; G.stats.ended = how; MUSIC.on = false; G.ask = null; G.urges = []; G.cramp = null; G.timers = [];
  $('#skip').style.display = 'none';
  svFinish(how);
  if (how === 'stop') { say(pick(st.stop.length ? st.stop : ['…']), 'commander', { big: true }); return; }
  if (how === 'woke') { E!.env.staging.woke?.(); return; } // review I7: her waking ends the session (`physics/woke`)
  if (how === 'failed') { W_SFX.rustle(0.14, 0); sense(throneOn() && S.contact === 'human_chair' ? 'She gets off your back.' : 'She takes her feet off your back.', 'body'); setTimeout(() => say(pick(W_L().fall.length ? W_L().fall : ['…']), 'commander', { big: true }), 900); return; }
  // she is out already (she left in use): she simply does not come back
  if (G.away) { G.stats.aloneFor += (G.t - G.awayFrom) / 1000; setTimeout(() => { sense(`She has not come back. ${S.stay ? 'She did not say you could get up.' : ''}`, 'door', 'base'); G.phase = 'empty'; G.emptyAt = G.t; $('#getUp').style.display = 'block'; G.foundAt = G.t + rand(25000, 40000); }, 1500); return; }
  play(act.end.sfx, { g: 0.5, pan: V().herPan }); sense(V().sight && !S.blind ? act.end.seen : act.end.heard, 'her');
  if (G.step === 'with' || G.step === 'glancing') { setTimeout(() => say(pick(st.end), 'commander', { big: true }), 1400); if (throneOn()) setTimeout(throneThank, 3400); return; }
  if (G.step === 'own') { setTimeout(() => { G.press = 1; G.footUpUntil = G.t + 2000; play('soft', { g: 0.3 }); play('soft', { g: 0.3, at: 0.35 }); sense(({ legs: 'Her foot taps your shoulder twice. Nothing else.', floor: 'Two taps on your back: done.', wall: 'Two taps on your shoulder from behind: done.', her: 'She taps the desk twice and does not look at you.', footrest: 'Two taps on your back: done.' } as Record<string, string>)[S.view]!, 'body'); }, 1300); return; }
  // use: the forgotten end
  setTimeout(() => { play('lamp', { g: 0.3, pan: V().herPan }); G.lampOn = false; G.lightsOff = true; sense(V().sight && !S.blind ? 'She turns off the lamp.' : 'A click. The light above you goes out.', 'her'); }, 1600);
  setTimeout(() => { play('creak', { g: 0.4, pan: V().herPan }); steps(4, V().herPan, dp, 0.35, 0.3, 0.5, true); }, 2800);
  setTimeout(() => { play('door_open', { g: 0.4, pan: dp }); }, 5000);
  setTimeout(() => { play('door_close', { g: 0.45, pan: dp }); sense(`She is gone. ${S.stay ? 'She did not say you could get up.' : 'She said nothing at all.'}`, 'door', 'base'); G.phase = 'empty'; G.emptyAt = G.t; G.away = true; G.lastUrgeK = 1; $('#getUp').style.display = 'block'; G.foundAt = G.t + rand(25000, 40000); }, 6000);
}
function getUp() {
  if (G.phase !== 'empty') return;
  G.stats.gotUp = true; G.stats.aloneFor += (G.t - G.emptyAt) / 1000; $('#getUp').style.display = 'none';
  play('cloth', { g: 0.4, dest: A.body }); SYN.joint!({ g: 1 }); sense('You get up. Your knees take a while.', 'body', 'body');
  G.phase = 'ending';
  E!.env.staging.getUp?.();
}
function found() {
  if (!R.listener) { G.foundAt = Infinity; return; } // review I7: nobody to find the commander: GET UP stays (or the stop word)
  G.stats.found = true; G.stats.aloneFor += (G.t - G.emptyAt) / 1000; $('#getUp').style.display = 'none';
  const dp = V().doorPan; steps(5, -dp * 0.3, dp, 0.1, 0.4, 0.42); setTimeout(() => play('door_open', { g: 0.45, pan: dp }), 2200);
  setTimeout(() => otherSay(S.view === 'legs' ? '…commander? What are you doing under there?' : '…commander? Why are you kneeling there?', 'room', R.listener?.name ?? ''), 3200);
  G.phase = 'ending';
  if (R.listener) { const id = R.listener.id; setTimeout(() => E?.env.staging.found?.(id), 3200); }
}

/* ---------- drawing ---------- */
const DS = 4;
const cache = new Map<string, string>();
const setStyle = (sel: string, prop: string, v: string) => { const key = sel + prop; if (cache.get(key) === v) return; cache.set(key, v); ($(sel).style as Any)[prop] = v; };
let legsC: HTMLCanvasElement, gctx: CanvasRenderingContext2D, urC: HTMLCanvasElement, uctx: CanvasRenderingContext2D, grC: HTMLCanvasElement, grctx: CanvasRenderingContext2D;
let lights: Record<string, HTMLCanvasElement> = {};
let legC: HTMLCanvasElement, lctx: CanvasRenderingContext2D, compC: HTMLCanvasElement, cctx: CanvasRenderingContext2D, rimC: HTMLCanvasElement, rctx: CanvasRenderingContext2D, outC: HTMLCanvasElement, octx: CanvasRenderingContext2D;
function size() {
  for (const c of [legsC, ...Object.values(lights), E!.els['#wShadow'] as HTMLCanvasElement]) { c.width = Math.ceil(innerWidth * 1.12 / DS); c.height = Math.ceil(innerHeight * 1.12 / DS); }
  urC.width = innerWidth; urC.height = innerHeight; grC.width = Math.ceil(innerWidth / 3); grC.height = Math.ceil(innerHeight / 3);
}
function fillPts(ctx: CanvasRenderingContext2D, pts: number[][]) { ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0]!, q[1]!) : ctx.moveTo(q[0]!, q[1]!))); ctx.closePath(); ctx.fill(); }
/* a shin seen from the front, knee to ankle (fractions of the canvas; widths in canvas heights), the calf bulging on its outer side, then the
   foot seen from the front: it comes toward the viewer and widens to the toes. `drop` bends the foot down (a dangling foot), `toe` lifts the
   front of the foot off the floor (a tap). */
function shinFront(W: number, H: number, K: number[], Ak: number[], o: Any) {
  const k = [K[0]! * W, K[1]! * H], a = [Ak[0]! * W, Ak[1]! * H];
  const dx = a[0]! - k[0]!, dy = a[1]! - k[1]!, len = Math.hypot(dx, dy) || 1, tx = dx / len, ty = dy / len, nx = -ty, ny = tx;
  const outer = o.outer; // +1: the calf bulges to the shin's right in screen terms, -1: to its left
  const L: number[][] = [], R: number[][] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16, hw = lerp(o.wK, o.wA, Math.pow(t, 0.8)) * H / 2;
    const calf = o.calf * H * Math.exp(-(((t - 0.32) / 0.2) ** 2));
    const x = k[0]! + dx * t, y = k[1]! + dy * t;
    const l = hw + (outer < 0 ? calf : calf * 0.25), r = hw + (outer > 0 ? calf : calf * 0.25);
    L.push([x + nx * l, y + ny * l]); R.push([x - nx * r, y - ny * r]);
  }
  // the foot from the front: the instep under the ankle, widening to the toes, which come toward the viewer (lower and wider)
  const fl = o.foot * H, fw = o.footW * H, drop = o.drop ?? 0, toe = o.toe ?? 0;
  const ang = Math.atan2(ty, tx) + drop; const ux = Math.cos(ang), uy = Math.sin(ang), px = -uy, py = ux;
  const F = (u: number, v: number) => [a[0]! + ux * u * fl + px * v * fw, a[1]! + uy * u * fl * (1 - toe * 0.45) + py * v * fw];
  const foot = [F(0.05, 0.62), F(0.35, 0.8), F(0.7, 0.95), F(0.95, 0.75), F(1.04, 0.2), F(1.02, -0.35), F(0.9, -0.8), F(0.6, -0.92), F(0.3, -0.75), F(0.05, -0.6)];
  return chaikin(chaikin(chaikin([...L, ...foot, ...R.reverse()] as Any))) as Any;
}
function drawLegs(now: number) {
  const W = legsC.width, H = legsC.height;
  for (const c of [legC, compC, rimC, outC]) if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  gctx.clearRect(0, 0, W, H);
  const art = $('#legsArt') as HTMLImageElement, raised = $('#raisedArt') as HTMLImageElement;
  const hasRest = art.style.display !== 'none' && art.naturalWidth, hasRaised = raised.style.display !== 'none' && raised.naturalWidth;
  if (hasRest || hasRaised) {
    // the art slot in two states: rest (the legs) and foot_raised (her bare foot toward the commander), crossfaded; the whole picture sways a
    // little, comes closer on a press, and is gone while she is out
    const up = hasRaised && (G.previewRaised || G.t < (G.footUpUntil ?? 0) || G.legsRest) && !G.away;
    const t2 = now / 1000, Wv = innerWidth * 1.12, Hv = innerHeight * 1.12;
    const sw = S.reduced ? 0 : (G.att === 'busy' ? Math.sin(t2 * 0.7) * 0.4 : 0) + G.shiftAnim * Math.sin(t2 * 9) * 0.6;
    const place = (img: HTMLImageElement, wf: number, bf: number, on: boolean) => {
      if (!img.naturalWidth) return;
      const w = Wv * wf, h = w * img.naturalHeight / img.naturalWidth;
      img.style.width = `${w}px`; img.style.left = `${(Wv - w) / 2}px`; img.style.top = `${Hv * bf - h}px`;
      img.style.opacity = on && !G.away ? '1' : '0';
      const fx = svcOn() && G.footFx ? G.footFx : { dx: 0, dy: 0, s: 1, r: 0 };
      img.style.transform = `translate(${fx.dx.toFixed(1)}px, ${fx.dy.toFixed(1)}px) rotate(${(sw + fx.r).toFixed(2)}deg) scale(${((1 + G.press * 0.04) * fx.s).toFixed(3)})`;
    };
    place(art, S.legsW, S.legsB, !up);
    place(raised, S.raisedW, S.raisedB, up);
    if (hasRest || up) return;
  }
  if (G.away || G.lightsOff && G.phase === 'empty') return;
  const t = now / 1000, red = S.reduced;
  const mode = G.legsRest ? 'rest' : G.att === 'busy' && G.t >= (G.pauseUntil ?? 0) ? (S.mood === 'irritated' ? 'tap' : ACT().legs) : 'still';
  const press = G.press, shift = G.shiftAnim;
  lctx.clearRect(0, 0, W, H); lctx.fillStyle = '#fff';
  const sway = red ? 0 : Math.sin(t * 0.7) * 0.004 + shift * Math.sin(t * 9) * 0.006;
  {
    const bob = mode === 'swing' || mode === 'beat' ? (red ? 0 : Math.max(0, Math.sin(t * (mode === 'beat' ? Math.PI * MUSIC.bpm / 60 : 2.6)))) : mode === 'tap' ? (red ? 0 : Math.max(0, Math.sin(t * 7))) : 0;
    fillPts(lctx, shinFront(W, H, [0.4 + sway, 0.18], [0.405 + sway, 0.6], { wK: 0.25, wA: 0.095, calf: 0.05, outer: -1, foot: 0.21 + press * 0.03, footW: 0.095, toe: 0 }));
    fillPts(lctx, shinFront(W, H, [0.6 + sway, 0.18], [0.595 + sway, 0.6 - bob * 0.03], { wK: 0.25, wA: 0.095, calf: 0.05, outer: 1, foot: 0.21 + press * 0.05, footW: 0.095, toe: bob * 0.9 }));
  }
  // the material: the complement blurred into a flesh edge light, kept on the legs; the legs near and a little out of focus
  cctx.globalCompositeOperation = 'source-over'; cctx.clearRect(0, 0, W, H); cctx.fillStyle = '#fff'; cctx.fillRect(0, 0, W, H);
  cctx.globalCompositeOperation = 'destination-out'; cctx.drawImage(legC, 0, 0); cctx.globalCompositeOperation = 'source-over';
  rctx.clearRect(0, 0, W, H); rctx.filter = `blur(${Math.round(H * 0.022)}px)`; rctx.drawImage(compC, 0, 0); rctx.filter = 'none';
  const warm = G.lampOn || ACT().light === 'lamp';
  rctx.globalCompositeOperation = 'source-in'; rctx.fillStyle = warm ? 'rgb(226,78,52)' : 'rgb(150,120,170)'; rctx.fillRect(0, 0, W, H); rctx.globalCompositeOperation = 'source-over';
  octx.globalCompositeOperation = 'source-over'; octx.clearRect(0, 0, W, H);
  octx.filter = `blur(${Math.round(H * 0.011)}px)`; octx.drawImage(legC, 0, 0); octx.filter = 'none';
  octx.globalCompositeOperation = 'source-in'; octx.fillStyle = 'rgb(22,15,16)'; octx.fillRect(0, 0, W, H);
  octx.globalCompositeOperation = 'source-atop'; octx.globalAlpha = 0.4; octx.drawImage(rimC, 0, 0); octx.globalAlpha = 1;
  octx.globalCompositeOperation = 'source-over';
  gctx.drawImage(outC, 0, 0);
}
/* the light in the commander's view: her lamp (warm, steady) or her screen (cool, flickering; it dips when she looks away from it) */
function drawLight(c: HTMLCanvasElement, now: number, where: string) {
  const ctx = c.getContext('2d') ?? nullCtx(c), W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  if (G.away && G.phase === 'empty' && G.lightsOff) return;
  const act = ACT(), flick = 0.85 + 0.15 * Math.sin(now / 130) * Math.sin(now / 47);
  const screen = act.light === 'screen' && !G.lightsOff, lamp = (act.light === 'lamp' || G.lampOn) && !G.lightsOff;
  const att = G.att === 'busy' ? 1 : G.att === 'glancing' ? 0.55 + 0.25 * Math.sin(now / 90) : 0.2;
  const dusk = smooth(18 * 60 + 30, 20 * 60, G.clockMin);
  ctx.globalCompositeOperation = 'lighter'; ctx.filter = `blur(${Math.round(H * 0.08)}px)`;
  const P = ({ deskLight: [0.5, 0.05, 0.5, 0.3], floorLight: [0.28, 0.12, 0.3, 0.32], wallLight: [0.36, 0.2, 0.42, 0.5] } as Record<string, number[]>)[where]!;
  if (lamp) { ctx.fillStyle = `rgba(255,180,110,${(0.28 * (0.4 + 0.6 * dusk)).toFixed(3)})`; ctx.beginPath(); ctx.ellipse(P[0]! * W, P[1]! * H, P[2]! * W, P[3]! * H, 0, 0, Math.PI * 2); ctx.fill(); }
  if (screen) { ctx.fillStyle = `rgba(120,170,255,${(0.3 * att * flick).toFixed(3)})`; ctx.beginPath(); ctx.ellipse((P[0]! + 0.05) * W, (P[1]! + 0.04) * H, P[2]! * 0.7 * W, P[3]! * 0.7 * H, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
}
/* the urges: an itch is a hot pulsing spot; the urge to swallow a soft ring at the throat; numbness pins rising from the bottom; a cramp a
   sharp line at the edge. Attention on one (the cursor) makes it brighter; listening gives the cursor a faint cool halo. */
let pins: Array<{ x: number; y: number; s: number }> = [];
function drawUrges(now: number) {
  const W = urC.width, H = urC.height, t = now / 1000;
  uctx.clearRect(0, 0, W, H);
  const live = G.phase === 'loop' || G.phase === 'empty';
  if (!live || weightOn()) return;
  for (const u of G.urges) {
    const pulse = 0.75 + 0.25 * Math.sin(t * (4 + u.v * 5) + u.seed);
    if (u.kind === 'itch') {
      const r = 18 + u.v * 62;
      const g = uctx.createRadialGradient(u.x, u.y, 0, u.x, u.y, r * 1.6);
      const a = (0.18 + 0.6 * u.v) * pulse * (u.focus ? 1.25 : 1);
      g.addColorStop(0, `rgba(255,236,200,${(a * 0.9).toFixed(3)})`); g.addColorStop(0.25, `rgba(255,140,90,${(a * 0.7).toFixed(3)})`); g.addColorStop(1, 'rgba(255,80,40,0)');
      uctx.fillStyle = g; uctx.beginPath(); uctx.arc(u.x, u.y, r * 1.6, 0, Math.PI * 2); uctx.fill();
      // prickles: short sparks around it
      uctx.strokeStyle = `rgba(255,210,170,${(0.35 * u.v * pulse).toFixed(3)})`; uctx.lineWidth = 1;
      for (let k = 0; k < 7; k++) { const a2 = u.seed + k * 0.9 + t * 0.6, r1 = r * (0.55 + 0.3 * Math.sin(t * 7 + k)), r2 = r1 + 4 + u.v * 7; uctx.beginPath(); uctx.moveTo(u.x + Math.cos(a2) * r1, u.y + Math.sin(a2) * r1); uctx.lineTo(u.x + Math.cos(a2) * r2, u.y + Math.sin(a2) * r2); uctx.stroke(); }
    } else if (u.kind === 'swallow') {
      // it wells up from the commander's own body: a warm swell at the bottom edge, rising and pulsing as it grows
      const h = H * (0.08 + 0.2 * u.v), a = (0.1 + 0.42 * u.v) * pulse * (u.focus ? 1.25 : 1);
      const g = uctx.createRadialGradient(W / 2, H + h * 0.25, 0, W / 2, H + h * 0.25, h * 1.5);
      g.addColorStop(0, `rgba(255,170,170,${a.toFixed(3)})`); g.addColorStop(0.55, `rgba(200,90,110,${(a * 0.45).toFixed(3)})`); g.addColorStop(1, 'rgba(120,40,60,0)');
      uctx.fillStyle = g; uctx.fillRect(W / 2 - h * 1.6, H - h * 1.4, h * 3.2, h * 1.4);
    }
  }
  // ripples of restlessness: rings spreading from the attention when the eyes dart
  const nowP = performance.now();
  for (let i = RIPPLES.length - 1; i >= 0; i--) {
    const r = RIPPLES[i], age = (nowP - r.born) / 900;
    if (age >= 1 || S.reduced) { RIPPLES.splice(i, 1); continue; }
    uctx.strokeStyle = `rgba(216,228,255,${(0.28 * r.k * (1 - age)).toFixed(3)})`; uctx.lineWidth = 1.5 * (1 - age) + 0.4;
    uctx.beginPath(); uctx.arc(r.x, r.y, 18 + age * 160 * r.k, 0, Math.PI * 2); uctx.stroke();
  }
  // numbness from below
  if (G.numb > 0.05) {
    const top = H * (1 - G.numb * 0.42);
    const g = uctx.createLinearGradient(0, H, 0, top); g.addColorStop(0, `rgba(170,190,230,${(0.16 * G.numb).toFixed(3)})`); g.addColorStop(1, 'rgba(170,190,230,0)');
    uctx.fillStyle = g; uctx.fillRect(0, top, W, H - top);
    for (const p of pins) {
      const y = H - (p.y * G.numb * 0.42 * H), tw = 0.5 + 0.5 * Math.sin(t * (6 + p.s * 8) + p.s * 20);
      uctx.fillStyle = `rgba(225,235,255,${(0.55 * tw * G.numb * (1 - p.y * 0.6)).toFixed(3)})`; uctx.fillRect(p.x * W, y, 1.6, 1.6);
    }
  }
  if (G.cramp) {
    const c = G.cramp, x0 = c.side < 0 ? 0 : W, dir = c.side < 0 ? 1 : -1, fl = 0.6 + 0.4 * Math.sin(t * 40);
    uctx.strokeStyle = `rgba(255,70,60,${(0.85 * fl * (1 - c.held / 2600)).toFixed(3)})`; uctx.lineWidth = 3; uctx.shadowColor = 'rgba(255,40,30,.9)'; uctx.shadowBlur = 16;
    uctx.beginPath(); let x = x0, y = H * 0.62; uctx.moveTo(x, y);
    for (let k = 0; k < 9; k++) { x += dir * rand(14, 30); y += rand(-22, 30); uctx.lineTo(x, y); }
    uctx.stroke(); uctx.shadowBlur = 0;
  }
  {
    const lis = G.listening, feed = G.feeding, r = 20 + (lis ? 6 + Math.sin(t * 1.6) * 3 : 0) + (feed ? 4 : 0);
    const col = feed ? 'rgba(255,170,120,' : 'rgba(216,228,255,', a = feed ? 0.55 : lis ? 0.55 : 0.2;
    const g = uctx.createRadialGradient(ATT.x, ATT.y, r * 0.4, ATT.x, ATT.y, r * 1.8);
    g.addColorStop(0, `${col}0)`); g.addColorStop(0.55, `${col}${(a * 0.35).toFixed(2)})`); g.addColorStop(1, `${col}0)`);
    uctx.fillStyle = g; uctx.beginPath(); uctx.arc(ATT.x, ATT.y, r * 1.8, 0, Math.PI * 2); uctx.fill();
    uctx.strokeStyle = `${col}${a.toFixed(2)})`; uctx.lineWidth = 1.3; uctx.beginPath(); uctx.arc(ATT.x, ATT.y, r, 0, Math.PI * 2); uctx.stroke();
  }
}
let grainAcc = 0;
function drawGrain(dt: number) {
  grainAcc += dt; if (grainAcc < 80) return; grainAcc = 0;
  const W = grC.width, H = grC.height; if (!W || !H) return;
  const img = grctx.createImageData(W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  grctx.putImageData(img, 0, 0);
}
function render(now: number, dt: number) {
  const t = now / 1000, live = G.phase === 'loop' || G.phase === 'empty' || G.phase === 'ending';
  const view = S.blind ? 'blind' : weightOn() ? 'footrest' : S.view;
  for (const v of ['her', 'legs', 'floor', 'wall', 'footrest', 'blind']) setStyle(`#${v}View`, 'opacity', v === view ? '1' : '0');
  // the body in the frame: tremor and a warm press at the edges as the ease goes; a shake on a gross fault
  const low = live && !weightOn() ? 1 - G.ease / 100 : 0;
  G.shake = Math.max(0, (G.shake ?? 0) - dt / 600);
  const amp = S.reduced ? 0 : low * low * 2.5 + G.shake * 9;
  const hx = S.reduced ? 0 : (G.headX ?? 0), hy = S.reduced ? 0 : (G.headY ?? 0);
  const wr = weightOn() ? weightFrame() : null;
  $('#world').style.transform = wr
    ? `translate(${((Math.random() * 2 - 1) * (wr.tremble + G.shake * 9)).toFixed(1)}px, ${((Math.random() * 2 - 1) * wr.tremble + wr.sag + G.shake * 10).toFixed(1)}px) rotate(${wr.tilt.toFixed(2)}deg)`
    : `translate(${((Math.random() * 2 - 1) * amp - hx).toFixed(1)}px, ${((Math.random() * 2 - 1) * amp + G.shake * 10 - hy).toFixed(1)}px)`;
  setStyle('#vignette', 'background', low < 0.05 ? 'none' : `radial-gradient(ellipse 75% 70% at 50% 50%, rgba(0,0,0,0) ${(72 - low * 28).toFixed(0)}%, rgba(26,6,4,${(0.2 + low * 0.5).toFixed(2)}) 100%)`);
  const dusk = smooth(18 * 60 + 30, 20 * 60, G.clockMin), dark = G.lightsOff ? 0.35 : 1;
  const ck = SV ? SV.closeK : 0;
  setStyle('#world', 'filter', `saturate(${(wr ? 1 - wr.strF * 0.45 : 1 - low * 0.4).toFixed(2)}) brightness(${((1 - dusk * 0.25) * dark * (1 - ck * 0.4)).toFixed(2)}) blur(${(S.readable ? 0 : ck * 6).toFixed(1)}px)`);
  // her view is the scene itself: its room dims with the evening and goes dark when she turns the light off, as the prototype's room does
  // final review: graded to the prototype's night room (her_activity.html's `quarters_dark` under `#herBg`'s blur and .62), whatever the scene's art
  E!.env.layers.backdrop.style.filter = view === 'her' ? `${S.readable ? '' : 'blur(1.5px) '}brightness(${((1 - dusk * 0.25) * dark * 0.62 * nightRoom(E!.env.layers.backdrop.style.backgroundImage)).toFixed(2)})` : '';
  // her view: her sprite (the scene's), the lamp or the screen on her; she leans a little toward the commander when she looks
  if (view === 'her') {
    const look = G.att === 'watching' ? 1 : G.att === 'glancing' ? 0.4 : 0;
    G.lookS = lerp(G.lookS ?? 0, look, Math.min(1, dt / 400));
    E!.env.layers.sprites.style.opacity = G.away ? '0' : '';
    E!.env.layers.sprites.style.transform = S.reduced ? '' : `scale(${(1 + G.lookS * 0.025).toFixed(4)}) rotate(${(Math.sin(t * 0.5) * 0.2).toFixed(2)}deg)`;
    const act = ACT(), flick = 0.85 + 0.15 * Math.sin(now / 130) * Math.sin(now / 47);
    const scr = act.light === 'screen' && !G.lightsOff ? (1 - G.lookS * 0.7) * flick : 0, lamp = (act.light === 'lamp' || G.lampOn) && !G.lightsOff ? 0.6 + 0.4 * dusk : 0;
    setStyle('#herGlow', 'background', `radial-gradient(ellipse 34% 30% at 52% 30%, rgba(110,160,255,${(0.3 * scr).toFixed(2)}) 0%, rgba(0,0,0,0) 100%), radial-gradient(ellipse 50% 45% at 30% 24%, rgba(255,170,100,${(0.16 * lamp).toFixed(2)}) 0%, rgba(0,0,0,0) 100%)`);
  }
  if (view === 'legs') { const f = S.floorShade; setStyle('#floorShadow', 'background', `linear-gradient(to bottom, rgba(0,0,0,0) 58%, rgba(4,3,5,${(0.55 * f).toFixed(2)}) 76%, rgba(4,3,5,${(0.92 * f).toFixed(2)}) 100%)`); drawLegs(now); drawLight(lights.deskLight!, now, 'deskLight'); }
  if (view === 'floor') {
    // feet_floor: her feet on the floor right in front; a contact shadow where they stand; she shifts her weight a little while she reads
    const fa = $('#floorArt') as HTMLImageElement;
    if (fa.style.display !== 'none' && fa.naturalWidth) {
      const Wv = innerWidth * 1.12, Hv = innerHeight * 1.12, w = Wv * S.feetW, h = w * fa.naturalHeight / fa.naturalWidth, top = Hv * S.feetB - h;
      const sw = S.reduced ? 0 : (G.att === 'busy' ? Math.sin(t * 0.6) * 0.25 : 0) + G.shiftAnim * Math.sin(t * 9) * 0.5;
      fa.style.width = `${w}px`; fa.style.left = `${(Wv - w) / 2}px`; fa.style.top = `${top}px`; fa.style.opacity = G.away ? '0' : '1';
      fa.style.transform = `perspective(1400px) rotateX(${S.feetTilt}deg) rotate(${sw.toFixed(2)}deg) scale(${(1 + G.press * 0.03).toFixed(3)})`;
      const sh = $('#feetShadow');
      sh.style.left = `${(Wv - w * 0.86) / 2}px`; sh.style.top = `${top + h * 0.8}px`; sh.style.width = `${w * 0.86}px`; sh.style.height = `${h * 0.17}px`;
      sh.style.background = 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(0,0,0,.55) 0%, rgba(0,0,0,.25) 45%, rgba(0,0,0,0) 72%)'; sh.style.filter = S.readable ? 'none' : 'blur(6px)';
      sh.style.opacity = G.away ? '0' : '1';
    }
    drawLight(lights.floorLight!, now, 'floorLight'); setStyle('#floorBg', 'transform', `scale(${(1 + low * 0.08).toFixed(3)})`); }
  if (view === 'wall') { drawLight(lights.wallLight!, now, 'wallLight'); }
  if (view === 'footrest' && throneOn()) throneLegs(now);
  G.press = Math.max(0, G.press - dt / 900); G.shiftAnim = Math.max(0, G.shiftAnim - dt / 800);
  drawUrges(now); drawGrain(dt);
  setStyle('#grain', 'opacity', (0.06 + low * 0.1 + (view === 'blind' ? 0.1 : 0)).toFixed(3));
  E!.env.reply.style.opacity = G.phase === 'skip' ? '0' : live ? '0.35' : '1'; // the dark between phases covers it, as the prototype's #skip does
  E!.env.input.closest<HTMLElement>('.alius-input-line')?.classList.toggle('alius-activity-ask', !!G.ask);
}

/* ---------- the frame loop ---------- */
function frame(now: number) {
  const dt = Math.min(120, now - (frame.last ?? now)); frame.last = now;
  if (G.phase !== 'idle' && G.phase !== 'done') G.t += dt;
  // the timers of the body and of her bouts wait outside the played phase (the fix of 2026-11-24)
  if (G.phase === 'entry' || G.phase === 'skip' || G.phase === 'ending') { G.nextItch += dt; G.nextSwallow += dt; G.nextCramp += dt; if (SV) SV.next += dt; }
  for (let i = G.timers.length - 1; i >= 0; i--) if (G.t >= G.timers[i].at) { const x = G.timers[i]; G.timers.splice(i, 1); x.fn(); }
  switch (G.phase) {
    case 'entry': G.entryT += dt; if (G.entryT > 2200) beginPhase(0); break;
    case 'loop': updateLoop(dt); break;
    case 'skip': updateSkip(dt); break;
    case 'empty': updateUrges(dt * 0.6); G.clockMin += (G.clockRate * dt) / 1000; if (G.t >= G.foundAt) found(); break;
  }
  musicTick();
  svRender(performance.now());
  if (A.ctx) {
    A.master.gain.setTargetAtTime(S.sound ? S.vol : 0, A.ctx.currentTime, 0.05);
    // listening to her makes her sounds clearer; the rest of the time the world is a little dull
    const live = G.phase === 'loop';
    A.world.frequency.setTargetAtTime(!live || G.listening ? 15000 : 5200, A.ctx.currentTime, 0.4);
    // feeding an urge prickles
    G.prickleCd = (G.prickleCd ?? 0) - dt;
    if (live && G.feeding && G.prickleCd <= 0) { noise({ dur: 0.02, type: 'highpass', f: 6000, gain: 0.025, attack: 0.002, dest: A.body }); G.prickleCd = rand(140, 320); }
  }
  render(now, dt);
  requestAnimationFrame(frame);
}
frame.last = undefined as number | undefined;
const weightOn = () => S.inner === 'weight';

/* ---------- the mount ---------- */
/** One callback on the next frame (the prototype's `requestAnimationFrame` for a class added after layout), on the mount's frames. */
function requestAnimationFrameOnce(fn: () => void): void {
  const e = E;
  if (!e) return;
  e.env.raf(() => { if (E === e) fn(); });
}
/** Each frame before the prototype's: the size, the still form, the run's phase as the engine has it. */
function before(): void {
  const e = E!;
  const r = e.env.root.getBoundingClientRect();
  const w = e.env.root.clientWidth || r.width || globalThis.innerWidth || 0, h = e.env.root.clientHeight || r.height || globalThis.innerHeight || 0;
  if (w !== innerWidth || h !== innerHeight) {
    const first = innerWidth === 0;
    innerWidth = w; innerHeight = h; size(); serviceSize(w, h);
    if (!pins.length) pins = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() }));
    // the prototype's start: the mouse at the middle, the attention a little above it
    if (first) { MOUSE.x = innerWidth / 2; MOUSE.y = innerHeight / 2; ATT.x = innerWidth / 2; ATT.y = innerHeight * 0.4; }
  }
  // the room under the desk is the scene's backdrop (drawn once its picture has loaded)
  const room = e.env.layers.backdrop.style.backgroundImage;
  if (room && e.els['#deskUnder']!.style.backgroundImage !== room) { e.els['#deskUnder']!.style.backgroundImage = room; if (e.els['#floorBg']!.dataset.room === '1') { e.els['#floorBg']!.style.backgroundImage = room; e.els['#wFloor']!.style.backgroundImage = room; } }
  S.reduced = e.env.reduced;
  S.readable = e.env.readable;
  e.box.toggleAttribute('data-reduced', S.reduced);
  e.box.toggleAttribute('data-readable', S.readable);
  if (!A.ctx) audioInit();
  // the phases are the engine's: it waits for the strategy (the hours between phases), or the run is forgotten (she left)
  const run = R.run;
  if (run?.marathon?.waiting && G.phase === 'loop') endPhase();
  if (run?.forgotten && (G.phase === 'loop' || G.phase === 'skip')) { G.step = 'use'; finish('done'); }
}
function afterFrame(): void {
  const e = E;
  if (!e) return;
  noteWrites(e.claims[0]!, ['opacity']);
  noteWrites(e.claims[1]!, ['opacity', 'transform']);
  noteWrites(e.claims[2]!, ['filter']);
}

function build(env: InstrumentEnv): FrameEls {
  const box = document.createElement('div');
  box.className = 'alius-activity';
  box.setAttribute('aria-hidden', 'true');
  box.dataset.textHost = '';
  const els: Record<string, HTMLElement> = {};
  const el = <T extends HTMLElement>(tag: string, id: string, parent: HTMLElement, cls = ''): T => { const x = document.createElement(tag) as T; x.className = `alius-act-${id}${cls ? ` ${cls}` : ''}`; els[`#${id}`] = x; parent.append(x); return x; };
  const world = el('div', 'world', box);
  const herV = el('div', 'herView', world, 'alius-act-view'); el('div', 'herGlow', herV);
  const legsV = el('div', 'legsView', world, 'alius-act-view'); el('div', 'deskUnder', legsV, 'alius-act-bg'); el('canvas', 'deskLight', legsV, 'alius-act-light'); el('canvas', 'legs', legsV);
  for (const id of ['legsArt', 'raisedArt']) { const img = el<HTMLImageElement>('img', id, legsV, 'alius-act-legsArt'); img.alt = ''; img.draggable = false; img.style.display = 'none'; }
  const desk = el<HTMLImageElement>('img', 'deskFrame', legsV); desk.alt = ''; desk.draggable = false;
  el('div', 'floorShadow', legsV); el('div', 'deskShade', legsV);
  const floorV = el('div', 'floorView', world, 'alius-act-view'); el('div', 'floorBg', floorV, 'alius-act-bg'); el('div', 'feetShadow', floorV);
  const fa = el<HTMLImageElement>('img', 'floorArt', floorV, 'alius-act-legsArt'); fa.alt = ''; fa.draggable = false; fa.style.display = 'none';
  el('canvas', 'floorLight', floorV, 'alius-act-light'); el('div', 'bunkEdge', floorV);
  const wallV = el('div', 'wallView', world, 'alius-act-view'); el('div', 'wallBg', wallV, 'alius-act-bg'); el('canvas', 'wallLight', wallV, 'alius-act-light');
  const footV = el('div', 'footrestView', world, 'alius-act-view'); el('div', 'wFloor', footV, 'alius-act-bg'); el('canvas', 'wShadow', footV);
  for (const id of ['astrideL', 'astrideR']) { const img = el<HTMLImageElement>('img', id, footV, 'alius-act-astride'); img.alt = ''; img.draggable = false; img.style.display = 'none'; }
  el('div', 'blindView', world, 'alius-act-view');
  el('canvas', 'grain', box); el('div', 'vignette', box);
  // final review I2: the weight core (its strain, cracks, her hand and the vial) stands on the stage, as throne.html's `#strainV`, `#cracks`
  // and `#ui > #vial` do, outside the world (inset −6 %, which would put the vial 6 % lower, over the scene's reply)
  el('div', 'weightHost', box);
  el('canvas', 'urges', box);
  for (const id of ['senses', 'others', 'hand']) el('div', id, box).dataset.textHost = '';
  el('div', 'void', box).style.display = 'none';
  env.layers.effects.append(box);
  // the controls between phases and at the forgotten end: in the moment layer (it takes the pointer; the stop word's pill stays above)
  const ui = document.createElement('div');
  ui.className = 'alius-activity-ui';
  const skip = el('div', 'skip', ui); el('div', 'skipClock', skip).textContent = '19:00'; el('div', 'skipNote', skip);
  const gestures = el('div', 'gestures', skip);
  for (const [s, b, span] of [['endure', 'keep still', 'hold the posture through the hours, whatever it costs'], ['spare', 'ease off slowly', 'let the body settle a little at a time'], ['cheat', 'move while she reads', 'shift and stretch whenever she is not looking'], ['rest', 'ask', 'a touch, a word: ask her for a moment']] as const) {
    const g = document.createElement('button'); g.type = 'button'; g.className = 'alius-act-gesture'; g.dataset.s = s;
    g.setAttribute('data-analyze', `glossary:activity_${s}`);
    const bb = document.createElement('b'); bb.textContent = b; const sp = document.createElement('span'); sp.textContent = span; g.append(bb, sp); gestures.append(g);
    env.listen(g, 'click', () => resolveSkip(s));
  }
  const gu = el<HTMLButtonElement>('button', 'getUp', ui); gu.type = 'button'; gu.textContent = 'get up'; gu.setAttribute('data-analyze', 'glossary:activity_get_up');
  env.listen(gu, 'click', () => getUp());
  skip.style.display = 'none'; gu.style.display = 'none';
  env.layers.moment.append(ui);
  legsC = els['#legs'] as HTMLCanvasElement; gctx = legsC.getContext('2d') ?? nullCtx(legsC);
  urC = els['#urges'] as HTMLCanvasElement; uctx = urC.getContext('2d') ?? nullCtx(urC);
  grC = els['#grain'] as HTMLCanvasElement; grctx = grC.getContext('2d') ?? nullCtx(grC);
  lights = { deskLight: els['#deskLight'] as HTMLCanvasElement, floorLight: els['#floorLight'] as HTMLCanvasElement, wallLight: els['#wallLight'] as HTMLCanvasElement };
  const off = (): [HTMLCanvasElement, CanvasRenderingContext2D] => { const c = document.createElement('canvas'); return [c, c.getContext('2d') ?? nullCtx(c)]; };
  [legC, lctx] = off(); [compC, cctx] = off(); [rimC, rctx] = off(); [outC, octx] = off();
  const claims = [claimStyles(env.reply, ['opacity']), claimStyles(env.layers.sprites, ['opacity', 'transform']), claimStyles(env.layers.backdrop, ['filter'])];
  return { env, box, ui, els, claims, frameId: null, core: null };
}
/** A context that draws nothing (jsdom has no canvas; the instrument still runs). */
function nullCtx(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const noop = (): void => {};
  return new Proxy({ canvas: c } as Any, { get: (t, k) => (k in t ? t[k] : k === 'createImageData' ? () => ({ data: new Uint8ClampedArray(0) }) : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop), set: () => true }) as CanvasRenderingContext2D;
}

/** The view the commander has, by the blocking (read by field): a frame backdrop of the commander's anchor is under her desk, a pose shot of feet on the floor is the floor, a place backdrop of the commander's activity is the wall; else her. */
export function viewOf(state: CampaignState, reg: Registries, run: PhysicsRun): { view: string; blind: boolean; desk: string | null; wall: string | null } {
  const b = state.scene?.blocking?.commander ?? {};
  const anchor = b.anchor ? reg.blockingAnchors.get(b.anchor.id) : undefined;
  const activity = b.activity ? reg.blockingActivities.get(b.activity) : undefined;
  const backdrop = (e: unknown, kind: string): string | null => {
    for (const fx of effectsOfEntry(e as never)) if (fx.type === 'backdrop') { const d = reg.backdrops.get(String((fx as { id?: string }).id)); if (d?.kind === kind) return String(d.file); }
    return null;
  };
  const desk = backdrop(anchor, 'frame'), wall = backdrop(activity, 'place');
  const feet = effectsOfEntry(anchor as never).some((fx) => fx.type === 'pose_shot' && (fx as { kind?: string }).kind === 'feet_floor');
  const blind = Object.keys(b.worn ?? {}).includes('eyes');
  const view = run.second && weightMatches(coreRun(run, 'second')!, state, reg) ? 'footrest' : desk ? 'legs' : wall ? 'wall' : feet ? 'floor' : 'her';
  return { view, blind, desk, wall };
}

/** Binds the run: her activity's frame, her style, the view and its art, the engine's marathon on the scene's clock. */
function bind(env: InstrumentEnv, run: PhysicsRun): void {
  const state = env.state(), reg = env.registries;
  seed = (fnv1a(`${state.scene?.id ?? ''}|${run.id}|her_activity`) >>> 0) || 2463534242;
  const act = run.sourceKind === 'activity' ? run.sourceId : state.scene?.blocking?.[run.holderId]?.activity ?? '';
  R.run = run;
  R.frame = frameOf(reg.blockingActivities.get(act)) ?? R.frame;
  S.act = act;
  const lead = leadStyle(physicsStyleOf(state, run.holderId, reg));
  S.style = lead.key; R.lineStyle = lead.key;
  const v = viewOf(state, reg, run);
  S.view = v.view === 'footrest' ? 'legs' : v.view; S.inner = v.view === 'footrest' ? 'weight' : serviceMatches(state, reg, run, v.view) ? 'service' : 'stillness'; S.blind = v.blind;
  S.phases = run.marathon?.phases ?? 3;
  S.phaseLen = (phaseSegments(state, reg, run) * segmentSecondsOf(state, reg, run, 30));
  S.start = run.marathon?.clockMin ?? 1080; S.seed = fnv1a(`${state.scene?.id ?? ''}|${run.id}`) % 100;
  S.talk = temperamentOf(state, run.holderId).talkativeness;
  S.mood = (state.squad.find((u) => u.id === run.holderId)?.stress ?? 0) >= 50 ? 'irritated' : 'calm';
  R.caught = run.tally?.cheatsCaught ?? 0;
  const other = state.squad.find((u) => u.kind === 'named' && u.id !== run.holderId && u.status === 'active' && !(state.scene?.participants ?? []).includes(u.id));
  R.listener = other ? { id: other.id, name: other.displayName } : null;
  const known = other ? (state.dynamic?.knowledge?.[other.id]?.[run.holderId]?.level === 'knows_dynamic') : false;
  S.knows = known;
  // the art: her legs under the desk (two states), her feet on the floor; the desk frame, the corner; the room and the floor surfaces (P10c)
  const url = (p: string) => (env.assetUrl ? env.assetUrl(p) : p);
  const img = (id: string, slot: Parameters<InstrumentEnv['art']['get']>[1]) => {
    const a = env.art.get(run.holderId, slot), el = E!.els[id] as HTMLImageElement;
    if (!a) return null;
    el.onerror = () => { el.style.display = 'none'; }; el.src = a.url; el.style.display = 'block';
    return a.sidecar.fit ?? null;
  };
  const rest = img('#legsArt', 'legs_seated.rest'), raised = img('#raisedArt', 'legs_seated.foot_raised'), feet = img('#floorArt', 'feet_floor');
  if (rest) { S.legsW = rest.width ?? S.legsW; S.legsB = rest.bottom ?? S.legsB; if (rest.floorShade !== undefined) S.floorShade = rest.floorShade; }
  if (raised) { S.raisedW = raised.width ?? S.raisedW; S.raisedB = raised.bottom ?? S.raisedB; }
  if (feet) { S.feetW = feet.width ?? S.feetW; S.feetB = feet.bottom ?? S.feetB; S.feetTilt = feet.tilt ?? S.feetTilt; }
  (E!.els['#deskFrame'] as HTMLImageElement).src = url(v.desk ?? 'content/core/art/backdrops/frame_under_desk.webp');
  const room = env.layers.backdrop.style.backgroundImage;
  for (const id of ['#deskUnder']) E!.els[id]!.style.backgroundImage = room;
  E!.els['#wallBg']!.style.backgroundImage = `url("${url(v.wall ?? 'content/core/art/backdrops/pov_corner.webp')}")`;
  const owner = state.scene?.participants[0] ?? null;
  const floor = floorOf(state, reg, state.scene?.locationId ?? '', owner)[0];
  for (const id of ['#floorBg', '#wFloor']) { E!.els[id]!.style.backgroundImage = floor ? `url("${url(floor.file)}")` : room; if (!floor) E!.els[id]!.dataset.room = '1'; }
  // 24b: the throne: she sits on the commander (her legs hang astride: `human_chair`) or rests her feet (`footrest`), read by field; her visitors
  const contact = state.scene?.blocking?.commander?.contact ?? Object.values(state.scene?.blocking ?? {}).map((b) => b.contact).find((c) => c?.with === 'commander');
  S.contact = herLegsOf(contact ? reg.blockingContacts.get(contact.id) : undefined) === 'hang' ? 'human_chair' : 'footrest';
  S.bodyFollows = true; S.props = true;
  S.visitorKind = R.frame.audience ? 'business' : known ? 'aware' : 'unaware';
  S.visitorName = R.listener?.name ?? '';
  const astride = env.art.get(run.holderId, 'legs_astride');
  S.legsArt = astride?.url ?? null;
  S.legsFeet = astride?.pair ? 'pair' : astride?.sidecar.feet === 'two' ? 'two' : astride?.sidecar.shown === 'right' ? 'right' : 'left';
  const af = astride?.sidecar.fit ?? {};
  S.aH = af.height ?? 1.0; S.aX = af.x ?? 0.08; S.aTop = af.top ?? -0.1; S.aTilt = af.tilt ?? 8;
  if (astride) {
    const L = E!.els['#astrideL'] as HTMLImageElement, Rt = E!.els['#astrideR'] as HTMLImageElement;
    L.onerror = () => { S.legsArt = null; }; L.src = astride.pair?.left ?? astride.url; Rt.src = astride.pair?.right ?? astride.url;
  }
  const look = env.her(run.holderId);
  E!.box.style.setProperty('--alius-her', look.accent);
  if (look.hand !== '') E!.box.style.setProperty('--alius-font-hand', `"${look.hand}", var(--alius-font-type)`);
}

/** The listeners of the prototype's page, on the scene: the mouse is the attention, a click on the frame relieves, Space breathes through a cramp. */
function listen(env: InstrumentEnv): void {
  const typing = (t: EventTarget | null) => t instanceof HTMLElement && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable);
  const onFrame = (t: EventTarget | null): boolean => t instanceof Node && (t === env.layers.frame || env.layers.frame.contains(t));
  const local = (e: MouseEvent): [number, number] => { const r = env.root.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  env.listen(document, 'mousemove', ((e: MouseEvent) => { [MOUSE.x, MOUSE.y] = local(e); E?.core?.balance(innerWidth > 0 ? MOUSE.x / innerWidth : 0.5); tMouse(e); if (SV && SV.gest) svMove(MOUSE.x, MOUSE.y); }) as EventListener);
  env.listen(document, 'keydown', ((e: KeyboardEvent) => {
    if (typing(e.target)) { G.lastTyped = G.t; return; } // Space and Shift typed into the field never act
    if (e.key === ' ') { e.preventDefault(); G.spaceHeld = true; E?.core?.hold(true, 'key'); }
    else if (e.key === 'Shift' && weightOn()) E?.core?.shift('key');
  }) as EventListener);
  env.listen(document, 'keyup', ((e: KeyboardEvent) => { if (e.key === ' ') { G.spaceHeld = false; if (!G.mouseHold) E?.core?.hold(false, 'key'); } }) as EventListener);
  env.listen(document, 'mouseup', ((e: MouseEvent) => { if (e.button === 0 && SV) svUp(); if (e.button === 0) { G.mouseHold = false; if (!G.spaceHeld) E?.core?.hold(false, 'mouse'); } }) as EventListener);
  env.listen(env.root, 'mousedown', ((e: MouseEvent) => {
    if (!onFrame(e.target)) return; // only the frame: never a control of the scene's UI
    e.preventDefault(); // the field keeps the focus: the mouse acts while typing
    const [x, y] = local(e);
    if (weightOn()) { if (e.button === 0) { G.mouseHold = true; E?.core?.hold(true, 'mouse'); } else if (e.button === 2) E?.core?.shift('mouse'); return; }
    if (e.button === 0) G.mouseHold = true;
    if (svcOn() && SV && e.button === 0 && svDown(x, y)) return;
    if (e.button === 0) relieveAt(x, y);
  }) as EventListener);
  env.listen(env.layers.frame, 'contextmenu', ((e: Event) => e.preventDefault()) as EventListener);
  /* speaking aloud (the scene sends the line): an answer to her question, words not meant for the commander (a breach), or unasked */
  env.listen(env.input, 'keydown', ((e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    const v = (env.input as HTMLInputElement).value.trim();
    if (!v) return;
    if (throneThanked(v)) return; // 24b: her thanks at the end, `/thank/i` within 9 s
    if (G.phase !== 'loop') return;
    if (G.ask) { G.ask = null; G.footUpUntil = G.t + 600; G.stats.answered += 1; setTimeout(() => say(pick(ST().askReply), 'commander'), 900); return; }
    if (G.t - G.lastSelfAt < 5000) { G.stats.breaches += 1; if (G.step !== 'use') setTimeout(() => say(pick(ST().breach), 'commander'), 700); return; }
    G.stats.unprompted += 1;
  }) as EventListener);
}

/* ---------- phases ---------- */
function begin() {
  for (const k of Object.keys(LOOPS)) loopOff(k);
  for (const id of ['#hand', '#senses', '#others']) $(id).replaceChildren(); // final review: a view begun again within one mount never stacks its entry lines
  G = fresh(); svBegin(); setStep(presenceOf(E!.env.state(), E!.env.registries, R.run!, R.run!.marathon?.phase ?? 1));
  G.clockMin = S.start; G.startMin = S.start; G.phaseIdx = (R.run!.marathon?.phase ?? 1) - 1;
  G.phase = 'entry'; G.entryT = 0;
  // her first gesture (the prototype writes it into its reply; the scene's reply is the transcript: a sensory line at the commander's place)
  const entry = weightOn() && throneOn() && S.contact === 'human_chair' ? 'She points at the floor. When you are down on all fours she lowers herself onto your back, without a word, and opens her folder.' : weightOn() ? 'She points at the floor before her chair, and when you are down on all fours she settles her feet on your back and leans back.' : ({ her: 'She points at the floor beside her chair without looking up.', legs: 'She pushes her chair back, points under the desk, and pulls the chair in again once you are there.', floor: `She points at the floor by her bunk. "${spoken('activity.entry.floor')}"`, wall: 'She turns you to face the wall by the shoulder, and goes back to her chair.' } as Record<string, string>)[S.view];
  if (entry) after(60, () => sense(`${entry}${S.stay ? ` “${spoken('activity.stay')}”` : ''}`, 'body')); // on the first frames: the scene's size is known then
}

/**
 * Final review: the prototype's room in her view is a night picture (`quarters_dark`, mean luminance 50.4 of 255) at .62; the port's is the
 * scene's own art, often a lit room. Her view grades it to the same level: brightness × (50.4 / the picture's own mean luminance), between
 * .25 and 1, measured once per picture on a 32 × 32 canvas (1 until it is measured, and where no canvas can be had).
 */
const NIGHT_ROOM_LUMA = 50.4;
const roomLuma = new Map<string, number | null>();
function nightRoom(bg: string): number {
  const m = /url\("?([^")]+)"?\)/.exec(bg);
  if (!m) return 1;
  const src = m[1]!;
  if (!roomLuma.has(src)) {
    roomLuma.set(src, null);
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = 32; c.height = 32;
        const x = c.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings);
        if (!x) return;
        x.drawImage(img, 0, 0, 32, 32);
        const d = x.getImageData(0, 0, 32, 32).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
        roomLuma.set(src, sum / (d.length / 4));
      } catch { /* a picture that cannot be read keeps its own level */ }
    };
    img.src = src;
  }
  const l = roomLuma.get(src);
  return l ? clamp(NIGHT_ROOM_LUMA / l, 0.25, 1) : 1;
}

function stopFrame(): void {
  const e = E;
  if (!e) return;
  if (e.frameId !== null) e.env.cancelRaf(e.frameId);
  e.core?.stop();
  detachThrone();
  detachService();
  THRONE.speaks = () => true; THRONE.slipped = () => {}; THRONE.limit = () => {}; THRONE.buckle = () => {}; THRONE.away = () => false; THRONE.caught = () => {};
  for (const n of A.nodes ?? []) { try { n.stop(); } catch { /* stopped */ } }
  for (const k of Object.keys(LOOPS)) { try { LOOPS[k].src.stop(); } catch { /* stopped */ } delete LOOPS[k]; }
  try { A.master?.disconnect(); } catch { /* not connected */ }
  A = { ctx: null, buf: {} };
  MUSIC.on = false;
  for (const c of e.claims) releaseClaim(c);
  e.env.input.closest<HTMLElement>('.alius-input-line')?.classList.remove('alius-activity-ask');
  e.box.remove();
  e.ui.remove();
  cache.clear();
  RIPPLES.length = 0;
  R.run = null; R.script = null; R.scriptPhase = 0;
  G = fresh();
  E = null;
}

/** How long her end plays before the host unmounts (her end line at 1.4 s, read until the prototype's digest at 4.4 s). */
export const EXIT_MS = 4400;

/** Starts the frame on a run (`passive` + `progress`, read by field: her activity's frame). One frame runs at a time. */
export function startFrame(env: InstrumentEnv, run: PhysicsRun): InstrumentRun {
  stopFrame();
  E = build(env);
  innerWidth = 0; innerHeight = 0;
  bind(env, run);
  if (S.inner === 'weight' && run.second) {
    const weight = coreRun(run, 'second')!;
    E.core = startWeight(env, weight, { host: E.els['#weightHost']!, core: true });
    // 24b: the throne layer (the weight inside her frame, at any of her activities)
    const sh = E.els['#wShadow'] as HTMLCanvasElement;
    attachThrone({ env, G: () => G, S, after, sense, say, play, herFeels, bodyNoise, visitorHeard, steps, V, rand, random: () => Math.random(), now: () => performance.now(), els: E.els, shadow: { canvas: sh, ctx: sh.getContext('2d') ?? nullCtx(sh) }, inner: () => [innerWidth, innerHeight] });
    throneCanvases(() => { const c = document.createElement('canvas'); return [c, c.getContext('2d') ?? nullCtx(c)]; });
    // Ruling W: the frame's wiring of the weight inside
    THRONE.speaks = () => G.step === 'with' || G.step === 'glancing';
    THRONE.slipped = () => wSlipFelt();
    THRONE.limit = () => { if (G.phase === 'loop') wLimit(); };
    THRONE.buckle = () => { if (G.phase === 'loop' && !W.over) wBuckle(); };
    // Ruling AE: her catch of the commander's own shift (throne.html's `wRelief`): nothing while she is out; caught, the frame's tell
    THRONE.away = () => G.away === true;
    THRONE.caught = () => herFeels('the commander shifting under her feet', false);
  }
  // e9: foot service under the desk (her foot within reach), its close-up over the world
  if (S.inner === 'service') attachService({ env, holderId: run.holderId, runId: run.id, pace: servicePaceOf(env.state(), env.registries, run.holderId), G: () => G, S, A: () => A, ACT, MOUSE, ATT, after, sense, say, play, noise, coverNow, callHeard, visitorHeard, clockText, pick, rand, random: () => Math.random(), now: () => performance.now(), setStyle, els: E.els });
  listen(env);
  frame.last = undefined;
  begin();
  requestAnimationFrame(frame);
  const mine = E;
  return {
    update(next: PhysicsRun) {
      if (E !== mine) return;
      R.run = next;
      if (next.second) E.core?.update(coreRun(next, 'second')!);
      // review M-R4: one buckle count, the engine's (its third ends the frame: the outcome plays her verdict through `finish('failed')`)
      if (weightOn()) { W.buckles = next.second?.buckles ?? 0; if (W.buckles >= 3) W.over = true; }
      if (next.marathon) S.phases = next.marathon.phases;
    },
    finish(end: PhysicsEnd): number {
      if (E !== mine) return 0;
      if (end.result === 'stopped') { finish('stop'); return 0; }
      E.core?.finish?.(end);
      finish(end.result === 'collapse' || end.result === 'limit_broken' ? 'failed' : 'done');
      return EXIT_MS;
    },
    stop() {
      if (E === mine) stopFrame();
    },
  };
}

/** Her frame's physics, read by field: a passive physics with a progress gauge, from her activity's frame (a contact's her_activity with no framed activity of hers stays the card's). */
export function frameMatches(run: PhysicsRun, state: CampaignState, reg: Registries): boolean {
  const p = reg.contactPhysics.get(run.physicsId);
  if (p?.interaction !== 'passive' || (p.gauge as { kind?: string } | undefined)?.kind !== 'progress') return false;
  const act = run.sourceKind === 'activity' ? run.sourceId : state.scene?.blocking?.[run.holderId]?.activity;
  if (act === undefined || frameOf(reg.blockingActivities.get(act)) === null) return false;
  // a second physics the frame can carry: the weight (Ruling B); any other is left to the card
  return !run.second || weightMatches(coreRun(run, 'second')!, state, reg);
}

registerInstrument({ id: 'her_activity', matches: frameMatches, start: (env, run) => startFrame(env, run) });

/** Tests and the shots only: the prototype's state and hooks (its `window.__G`, `__S`, `__begin`, `__mouse`). */
export const _activity = {
  get G(): Any { return G; },
  get S(): Any { return S; },
  get R(): Wiring { return R; },
  get ATT(): typeof ATT { return ATT; },
  setG(g: Any): void { G = g; },
  seed(n: number): void { seed = n >>> 0 || 1; },
  resetClock(): void { frame.last = undefined; },
  mouse(x: number, y: number): void { MOUSE.x = x; MOUSE.y = y; },
  /** Final review: her `TO_YOU` lines, as played (a named friend filled with a real soldier, or not said), and her inline spoken words. */
  toYou: (k: string): Array<{ text: string; ask?: boolean }> | undefined => TO_YOU[k],
  spoken: (k: string): string => spoken(k),
  nightRoom,
  planScript, exchangeScript, begin, incomingCall, visitorPeak, falseAlarm, fresh, sense, say, mark, coverNow, herEars, bodyNoise, react, moveAttention, updateUrges, spawnUrge, relieveAt, runScript, planPeaks, startSkip, resolveSkip, finish, getUp, found, beginPhase, endPhase, placeFree,
};
