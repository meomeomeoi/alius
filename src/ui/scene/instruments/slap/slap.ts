/**
 * P10e-e Task 12: the slap as an instrument (`docs/prototypes/slap.html`, normative; its `fidelity.json` checks the port against it). A
 * mini-game that is really mini: it cuts into the scene for a second or two. The camera snaps to her face (170 ms); her hand is up for the
 * engine's `leadMs` (none when unannounced, 420 ms for cruel's second), each feint `feintMs`, then her swing lasts her style's `windowMs`
 * and lands. Space or the left button tenses the body (one try: a press 42–224 ms before the impact braces); a sharp flick of the mouse
 * sideways turns the face away (`flinched`, a defiance). Her signal is the camera, the light and the sound; her face changes inside the
 * snap and after the impact (`TUNING.practice.slap.faces`); her lines are `cardVoice` rows of kind `slap.*` by her style; the cheek glows
 * on the side the hand came from and fades over half a minute, for the scene.
 *
 * The functions are the prototype's, copied (types added). The wiring, declared in `fidelity.json`:
 * - the engine's slap replaces the prototype's scheduler (its id, swing, feints, `again`, `unannounced`; her side is `slapSide`);
 * - `performance`, `setTimeout` and `requestAnimationFrame` are this module's own (the scene's frame clock, timers and frames that `stopSlap`
 *   clears), `innerWidth` / `innerHeight` are the scene frame's size, `pick` / `rand` are hashes of the slap's id and a counter (no rng);
 * - `$` names the slap's own elements (in the effects layer, under the scene's UI: the stop word's pill is never covered), the scene's reply,
 *   its input line and the input; the prototype's `#world` is the scene's backdrop and sprites layers (and the `face_close` art), moved
 *   through `cam` (the camera's styles are put back the moment it is home);
 * - the sounds go through the sample layer: the prototype's own graph (a lowpass and a gain for the world's sounds, the body bus) is built
 *   in front of the layer's buses, and every node made here is stopped at `stopSlap`.
 */
import type { Registries } from '../../../../content/types';
import { practiceOf } from '../../../../engine/dynamic/profile';
import { fnv1a } from '../../../../engine/hub';
import { slapSide } from '../../../../engine/practice/slap';
import type { SlapResult } from '../../../../engine/practice/state';
import { TUNING } from '../../../../engine/tuning';
import { voiceLine, type VoiceKind } from '../../cards/voice';
import { claimStyles, noteWrites, releaseClaim, type StyleClaim } from '../styleClaims';
import type { HerLook, InstrumentEnv } from '../types';

/* ---------- the pure rules (slap.html's timeline, its tension and its flick, as functions of their own) ---------- */

/** When the parts of a slap happen, in ms from its start: the snap, the feints and the impact (slap.html `startSlap`). */
export function slapTimeline(slap: { windowMs: number; feints: number; unannounced?: true; again?: true }): { snap: 170; impactAt: number; feintsAt: number[] } {
  const unann = slap.unannounced === true;
  const feints = unann ? 0 : slap.feints;
  const lead = unann ? SNAP : slap.again === true ? AGAIN_LEAD : LEAD;
  const feintsAt = Array.from({ length: feints }, (_, i) => lead + i * FEINT);
  return { snap: SNAP, impactAt: lead + feints * FEINT + slap.windowMs, feintsAt };
}

/**
 * The result of a slap (land's rule, review M5): a turned face is `flinched` whatever the tension; a press whose tension is at 0.8 or more at the
 * impact is `braced` (`tensionAt`, so a press about 41.5–224 ms before; `TUNING.practice.slap.braceBand` is that band in whole ms); else `none`.
 */
export function resultOf(pressAt: number | null, impactAt: number, flicked: boolean): SlapResult {
  if (flicked) return 'flinched';
  if (pressAt === null) return 'none';
  return tensionAt(impactAt - pressAt) >= S.tension.thr ? 'braced' : 'none';
}

/**
 * A sharp flick sideways (slap.html `onMove`'s rule as a function of its own, for the tests and the reader): over the samples of the last 70 ms,
 * at least 2400 px/s and 6 % of the frame's width. `onMove` keeps the prototype's inline code; the tests drive both with the same moves.
 */
export function isFlick(samples: ReadonlyArray<{ t: number; x: number }>, width: number): boolean {
  if (samples.length < 2) return false;
  const last = samples[samples.length - 1]!;
  const recent = samples.filter((p) => last.t - p.t <= 70);
  if (recent.length < 2) return false;
  const first = recent[0]!;
  const dt = (last.t - first.t) / 1000;
  const dx = last.x - first.x;
  if (dt <= 0) return false;
  return Math.abs(dx / dt) >= 2400 && Math.abs(dx) >= width * 0.06;
}

/* ---------- the helpers (slap.html's own) ---------- */
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const easeOut = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeIn = (t: number): number => Math.pow(clamp(t, 0, 1), 2);
const easeInOut = (t: number): number => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
/** No rng: a value of [0, 1) from the slap's id and a running count (the prototype's `Math.random`). */
const rnd01 = (): number => (fnv1a(`${G.rkey}|${G.rn++}`) % 10000) / 10000;
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd01() * a.length)]!;
const rand = (a: number, b: number): number => a + rnd01() * (b - a);

/* ---------- the engine's numbers (TUNING.practice.slap) ---------- */
export const LEAD = TUNING.practice.slap.leadMs, FEINT = TUNING.practice.slap.feintMs;
export const SWING = TUNING.practice.slap.windowMs;
export const OBSESSIVE_SPREAD = TUNING.practice.slap.obsessiveSpread;
const AGAIN_LEAD = TUNING.practice.slap.againLeadMs;
/* ---------- the instrument's own numbers ---------- */
export const SNAP = 170;
export const SWEEP = 140;
export const RETURN = 650;
/** Her face (TUNING's table: SillyTavern's labels by style). */
export const EXPR = TUNING.practice.slap.faces;
export const CALM = ['ritual', 'clinical', 'regal'];
export const EXPR_SWITCH = 60;
export const EXPR_WAIT = 120;

/** The recorded sounds (slap.html `SAMPLE_URLS`, the ones its README names), from the repo root. */
export const SAMPLE_URLS: Readonly<Record<string, string>> = {
  slap: 'assets/sounds/slap/slap.ogg', swish1: 'assets/sounds/slap/swish1.ogg',
  cloth1: 'assets/sounds/ha/cloth1.ogg', cloth2: 'assets/sounds/ha/cloth2.ogg', cloth3: 'assets/sounds/ha/cloth3.ogg', cloth4: 'assets/sounds/ha/cloth4.ogg',
  breath: 'assets/sounds/breath-in-out.mp3',
};

/** The url of each label of her face (slap.html's `faces`, the panel's loaded files): filled by `lookFaces` as the scene answers (null: no sprite for it). */
const faces: Record<string, string | null> = {};
let curLabel = 'neutral';
function beforeLabel(style: string, unann: boolean) {
  const e = EXPR[style as keyof typeof EXPR];
  if (e.keep.includes(curLabel)) return curLabel;
  return unann && CALM.includes(style) ? 'annoyance' : e.before;
}
/* shows a label: the picture of that label if there is one, else the face stays as it is (a missing sprite is never an error) */
function showFace(label: string) {
  curLabel = label;
  const url = faces[label];
  if (url && E && E.env.faceOf(E.unitId) !== label) E.env.setSprite(E.unitId, label, url);
}
function preload(label: string) {
  const url = faces[label]; if (!url) return Promise.resolve();
  const im = new Image(); im.src = url;
  return Promise.race([im.decode().catch(() => {}), new Promise((r) => setTimeout(r, EXPR_WAIT))]);
}
/** The lookups of her faces under way (label → its promise), for this frame. */
const looking = new Map<string, Promise<void>>();
/**
 * Asks the scene for the picture of each label her style may show (her `before`, `keep` and `after` ones, and `annoyance`): the prototype has
 * them at hand, the scene answers through SillyTavern. A face whose answer comes after its moment is shown then, while the slap still holds
 * the frame (late, never lost).
 */
function lookFaces(labels: readonly string[]): void {
  if (!E) return;
  const e = E;
  for (const label of labels) {
    if (label in faces || looking.has(label)) continue;
    // an answer for a frame that is gone (another holder, another scene: `bind` cleared `faces`) writes nothing (review M9)
    const mine = (): boolean => E === e;
    looking.set(label, e.env.spriteUrl(e.unitId, label).then((u) => { if (mine()) faces[label] = u; }, () => { if (mine()) faces[label] = null; }).then(() => {
      if (!mine()) return;
      looking.delete(label);
      if (curLabel === label && (G.slap || G.back)) showFace(label);
    }));
  }
}
/** Her style's labels (`lookFaces`). */
const facesOf = (style: string): string[] => {
  const e = EXPR[style as keyof typeof EXPR];
  return e ? [e.before, ...e.keep, ...Object.values(e.after), 'annoyance'] : [];
};
/**
 * Her face now, read for each slap (the prototype's `curLabel`): the scene's label for her, unless it is still the one the last slap left (a
 * label with no sprite changes nothing on the scene, but it is her face for the slap that follows, as in the prototype).
 */
let leftBySlap: { label: string; scene: string } | null = null;
function readFaceNow(): void {
  if (!E) return;
  const scene = E.env.faceOf(E.unitId);
  curLabel = leftBySlap && leftBySlap.scene === scene ? leftBySlap.label : scene;
}
/** What the slap left as her face (read by the next slap's `readFaceNow`). */
function noteFaceLeft(): void {
  if (E) leftBySlap = { label: curLabel, scene: E.env.faceOf(E.unitId) };
}

/* ---------- settings (slap.html `S`: the approved defaults; the style, the face point and the still form are hers and the scene's) ---------- */
const S = {
  style: 'possessive', unann: false, tension: { rise: 100, peak: 80, fall: 220, thr: 0.8 }, flick: 2400, sideDark: true, sweep: true,
  slapLvl: 0.5, swishS: 'swish1', thump: true, ring: 3, face: { x: 0.47, y: 0.17 }, zoom: 2.6, reduced: false,
};

/* ---------- the wiring: the clock, the timers and the frames of the scene (all cleared by `stopSlap`) ---------- */
const performance = { now: (): number => (E ? E.env.now() : 0) };
let innerWidth = 0, innerHeight = 0;
function measure(): void {
  if (!E) return;
  const r = E.env.root.getBoundingClientRect();
  innerWidth = E.env.root.clientWidth || r.width || (typeof window !== 'undefined' ? window.innerWidth : 0);
  innerHeight = E.env.root.clientHeight || r.height || (typeof window !== 'undefined' ? window.innerHeight : 0);
}
const timers = new Set<ReturnType<typeof globalThis.setTimeout>>();
function setTimeout(fn: (v?: unknown) => void, ms: number): ReturnType<typeof globalThis.setTimeout> {
  const t = globalThis.setTimeout(() => { timers.delete(t); fn(); }, ms);
  timers.add(t);
  return t;
}
/** The one frame that is queued (the loop runs while a slap, its camera's way back or the cheek is alive). */
let frameId: number | null = null;
function requestAnimationFrame(fn: (now: number) => void): void {
  if (!E || frameId !== null) return;
  const e = E;
  frameId = e.env.raf((now) => {
    frameId = null;
    if (E !== e) return;
    if (!G.slap && !G.back && !G.starting && G.cheekA <= 0) { cam.release(); return; } // nothing to draw: the loop sleeps
    measure();
    fn(now);
    for (const c of cam.saved) if (c !== cam.dial) noteWrites(c); // what the camera wrote this frame (styleClaims' contract; the dial's flag is written once)
  });
}

/* ---------- the elements ---------- */
interface SlapEls {
  env: InstrumentEnv;
  host: HTMLElement;
  sceneId: string;
  unitId: string;
  her: HerLook;
  /** The slap's own layer (in the effects layer, under the scene's UI). */
  box: HTMLElement;
  els: Record<string, HTMLElement>;
  faceImg: HTMLImageElement;
  hasFace: boolean;
  /** The listeners and the audio nodes made here (stopped at `stopSlap`). */
  offs: Array<() => void>;
}
let E: SlapEls | null = null;
const HBLUR = 'alius-slap-hblur';
const $ = (s: string): HTMLElement => {
  const e = E!;
  if (s === '#mirror') return mirror(e);
  if (s === '#reply') return e.env.reply;
  if (s === '#cmd') return e.env.input;
  if (s === '#inputWrap') return e.env.input.closest<HTMLElement>('.alius-input-line') ?? e.env.input.parentElement ?? e.env.input;
  return e.els[s]!;
};

/**
 * The letters of the line being typed (the prototype's `#mirror`), laid over the input in the moment layer for the scatter (no pointer: the
 * stop word stays clickable); the input's own text is hidden meanwhile, and both are put back once the letters settle.
 */
function mirror(e: SlapEls): HTMLElement {
  const input = e.env.input as HTMLInputElement;
  const host = e.env.layers.moment;
  const old = host.querySelector<HTMLElement>(':scope > .alius-slap-mirror');
  if (old) return old;
  const m = document.createElement('div');
  m.className = 'alius-slap-mirror';
  m.setAttribute('aria-hidden', 'true');
  const value = typeof input.value === 'string' ? input.value : '';
  if (value === '' || e.env.reduced) return m; // nothing typed (or the still form): nothing flies
  const r = input.getBoundingClientRect();
  const o = e.env.root.getBoundingClientRect();
  const cs = typeof getComputedStyle === 'function' ? getComputedStyle(input) : null;
  m.style.left = `${r.left - o.left}px`;
  m.style.top = `${r.top - o.top}px`;
  m.style.width = `${r.width}px`;
  m.style.height = `${r.height}px`;
  if (cs) {
    m.style.font = cs.font;
    m.style.paddingLeft = cs.paddingLeft;
    m.style.lineHeight = `${r.height}px`;
    m.style.color = cs.color;
    m.style.letterSpacing = cs.letterSpacing;
    m.style.textIndent = `${-input.scrollLeft}px`;
  }
  m.replaceChildren(...[...value].map((ch) => { const sp = document.createElement('span'); sp.textContent = ch; return sp; }));
  host.append(m);
  const color = input.style.color;
  input.style.color = 'transparent';
  setTimeout(() => { m.remove(); input.style.color = color; }, 600);
  return m;
}

function build(env: InstrumentEnv, unitId: string): Omit<SlapEls, 'host' | 'sceneId'> {
  const box = document.createElement('div');
  box.className = 'alius-slap';
  box.setAttribute('aria-hidden', 'true');
  const els: Record<string, HTMLElement> = {};
  const faceImg = document.createElement('img');
  faceImg.className = 'alius-slap-face';
  faceImg.alt = '';
  faceImg.draggable = false;
  box.append(faceImg);
  for (const id of ['side', 'sweep', 'dimmer', 'tight', 'cheek', 'flash', 'hand']) {
    const el = document.createElement('div');
    el.className = `alius-slap-${id}`;
    els[`#${id}`] = el;
    box.append(el);
  }
  // the horizontal motion blur of the impact (slap.html's `#hblur`)
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('class', 'alius-slap-svg');
  const filter = document.createElementNS(svgNS, 'filter');
  filter.setAttribute('id', HBLUR);
  for (const [k, v] of [['x', '-10%'], ['y', '-10%'], ['width', '120%'], ['height', '120%']]) filter.setAttribute(k!, v!);
  const g = document.createElementNS(svgNS, 'feGaussianBlur');
  g.setAttribute('stdDeviation', '0 0');
  filter.append(g);
  // the same blur for the scene's layers the camera scales (the backdrop, her sprite): a filter is drawn in the layer's own pixels, so its
  // deviation is the world's divided by the layer's scale (set per frame by `cam.draw`), and on screen it is the prototype's
  const scaled = (suffix: string): Element => {
    const f = filter.cloneNode(false) as Element;
    f.setAttribute('id', `${HBLUR}-${suffix}`);
    const gg = document.createElementNS(svgNS, 'feGaussianBlur');
    gg.setAttribute('stdDeviation', '0 0');
    f.append(gg);
    els[`#hblur-${suffix}`] = gg as unknown as HTMLElement;
    return f;
  };
  svg.append(filter, scaled('b'), scaled('s'));
  box.append(svg);
  els['#hblurG'] = g as unknown as HTMLElement;
  const her = env.her(unitId);
  els['#hand']!.style.setProperty('--alius-her', her.accent);
  if (her.hand !== '') els['#hand']!.style.setProperty('--alius-font-hand', `"${her.hand}", var(--alius-font-type)`);
  env.layers.effects.append(box);
  const out = { env, unitId, her, box, els, faceImg, hasFace: false, offs: [] as Array<() => void> };
  const art = env.art.get(unitId, 'face_close');
  if (art) {
    faceImg.onload = () => { if (E?.faceImg === faceImg) E.hasFace = true; };
    faceImg.src = art.url;
  }
  return out;
}

/* ---------- the camera: the scene's layers as the prototype's `#world` (their own styles put back the moment it is home) ---------- */
const CAM_PROPS = ['transform', 'transform-origin', 'filter', 'transition', 'opacity'];
const cam = {
  held: false,
  saved: [] as StyleClaim[],
  dial: null as StyleClaim | null,
  base: null as { x: number; y: number } | null,
  backdropFilter: '',
  /** The camera leaves home: the styles it will write are saved, her face point is measured. */
  hold(): void {
    if (this.held || !E) return;
    const e = E;
    this.held = true;
    const { backdrop, sprites } = e.env.layers;
    const reply = e.env.reply;
    const wrap = $('#inputWrap');
    // the camera's styles are claimed (styleClaims.ts): an instrument mounted or unmounted meanwhile hands its originals down, never over them
    this.saved = [backdrop, sprites, reply, wrap].map((el) => claimStyles(el, CAM_PROPS));
    const base = typeof getComputedStyle === 'function' ? getComputedStyle(backdrop).filter : '';
    this.backdropFilter = base && base !== 'none' ? base : '';
    for (const el of [backdrop, sprites]) el.style.setProperty('transition', 'none');
    sprites.style.setProperty('transform-origin', '0 0');
    this.base = null;
    this.measure();
    const dial = e.env.root.querySelector<HTMLElement>('.alius-stage-dial');
    if (dial) { const c = claimStyles(dial, ['@data-instrument']); dial.setAttribute('data-instrument', 'slap'); noteWrites(c); this.saved.push(c); this.dial = c; }
  },
  /** Her face point in the scene (the sprite's sidecar point on the drawn picture), measured with the camera at home. */
  measure(): void {
    if (!E || this.base) return;
    const e = E;
    const img = e.env.spriteOf(e.unitId);
    if (!img || !img.naturalWidth || e.env.root.dataset.curtain === 'open') return;
    const sprites = e.env.layers.sprites;
    const now = sprites.style.transform;
    sprites.style.transform = this.saved.find((x) => x.el === sprites)?.saved.get('transform') ?? '';
    const r = img.getBoundingClientRect();
    const o = e.env.root.getBoundingClientRect();
    sprites.style.transform = now;
    if (r.width > 0 && r.height > 0) this.base = { x: r.left - o.left + S.face.x * r.width, y: r.top - o.top + S.face.y * r.height };
  },
  /** One frame of the camera: the world's move, its motion blur, the zoom `k` to her face, the backdrop's blur and dim, the UI stepping back. */
  draw(world: string, hb: number, k: number): void {
    if (!E) return;
    if (!this.held) this.hold();
    const e = E;
    const W = innerWidth, H = innerHeight;
    const O = [W * 0.5, H * 0.436]; // the prototype's #world: 14 % outside the frame, its origin at 50 % 45 %
    const about = (extra: string): string => `translate(${O[0].toFixed(1)}px, ${O[1].toFixed(1)}px) ${world}${extra} translate(${(-O[0]).toFixed(1)}px, ${(-O[1]).toFixed(1)}px)`;
    const blur = !e.env.readable && hb > 0.3; // the prototype's `filter: url(#hblur)` on `#world` (readable mode: no blur)
    /** The motion blur of a layer drawn at `scale`: the world's deviation divided by it, so that on screen it is the prototype's. */
    const hblurAt = (suffix: string, scale: number): string => {
      e.els[`#hblur-${suffix}`]!.setAttribute('stdDeviation', `${(hb / scale).toFixed(2)} ${((hb * 0.12) / scale).toFixed(2)}`);
      return blur ? `url(#${HBLUR}-${suffix})` : '';
    };
    const { backdrop, sprites } = e.env.layers;
    // the backdrop: the world's move; it grows to the prototype's 128 % box with the zoom, so the whip and the turn never show its edge;
    // its blur (14 px at k = 1) and the motion blur are the prototype's on screen (divided by that growth)
    const cover = lerp(1, 1.28, k);
    backdrop.style.transformOrigin = '0 0';
    backdrop.style.transform = about(` scale(${cover.toFixed(4)})`);
    backdrop.style.filter = `${this.backdropFilter} ${hblurAt('b', cover)} ${e.env.readable ? '' : `blur(${((k * 14) / cover).toFixed(1)}px)`} brightness(${lerp(1, 0.55, k).toFixed(3)})`.replace(/\s+/g, ' ').trim();
    // her sprite: the scene's view to her face close (`zoom` geometric), inside the world (a sprite redrawn by the scene keeps the camera)
    this.measure();
    let camera = '';
    let sc = 1;
    const img = e.env.spriteOf(e.unitId);
    if (img && this.base) {
      const p0 = this.base, p1 = [W * 0.5, H * 0.42];
      sc = Math.pow(S.zoom, k);
      const px = lerp(p0.x, p1[0]!, k), py = lerp(p0.y, p1[1]!, k);
      camera = ` translate(${(px - sc * p0.x).toFixed(1)}px, ${(py - sc * p0.y).toFixed(1)}px) scale(${sc.toFixed(4)})`;
    }
    sprites.style.transform = `${about('')}${camera}`;
    // her sprite takes the world's motion blur (the prototype's `#her` is inside `#world`), in the frame's pixels
    sprites.style.filter = `${hblurAt('s', sc)} brightness(${lerp(1, 0.92, k)})`.trim();
    e.faceImg.style.filter = blur ? `url(#${HBLUR})` : '';
    // the face art (when loaded) crossfades in: a 128 % box of its own, moved as the world
    e.faceImg.style.transform = world;
  },
  /** The camera is home: every style it wrote is put back as it was. */
  release(): void {
    if (!this.held) return;
    this.held = false;
    for (const c of this.saved) releaseClaim(c);
    this.saved = [];
    this.dial = null;
    this.base = null;
    if (E) { E.faceImg.style.opacity = '0'; E.faceImg.style.transform = ''; E.faceImg.style.filter = ''; }
  },
};

/* ---------- audio (slap.html `A`: its graph in front of the sample layer's buses) ---------- */
interface Audio {
  ctx: AudioContext | null;
  master?: AudioNode;
  worldLP?: BiquadFilterNode;
  worldG?: GainNode;
  body?: AudioNode;
  white?: AudioBuffer;
  buf: Record<string, AudioBuffer | null>;
}
const A: Audio = { ctx: null, buf: {} };
const made = new Set<AudioScheduledSourceNode>();
/** The context, seen through a view that records every source made on it (stopped at `stopSlap`). */
function recorded(c: AudioContext): AudioContext {
  return new Proxy(c, {
    get(t, p) {
      const v = Reflect.get(t, p, t) as unknown;
      if (typeof v !== 'function') return v;
      if (p === 'createBufferSource' || p === 'createOscillator') {
        return (...args: unknown[]) => {
          const n = (v as (...a: unknown[]) => AudioScheduledSourceNode).apply(t, args);
          made.add(n);
          n.addEventListener?.('ended', () => made.delete(n), { once: true });
          return n;
        };
      }
      return (v as (...a: unknown[]) => unknown).bind(t);
    },
  });
}
function audioInit() {
  if (A.ctx || !E) return;
  const samples = E.env.samples;
  const raw = samples?.ctx() ?? null;
  const world = samples?.bus('world') ?? null;
  const body = samples?.bus('body') ?? null;
  if (!samples || !raw || !world || !body) return;
  const ctx = recorded(raw);
  A.ctx = ctx;
  // the world: dulled by the ringing, ducked while braced (in front of the layer's world bus); the body: the layer's body bus
  A.worldLP = ctx.createBiquadFilter(); A.worldLP.type = 'lowpass'; A.worldLP.frequency.value = 16000; A.worldLP.Q.value = 0.4;
  A.worldG = ctx.createGain(); A.worldG.gain.value = 1; A.worldLP.connect(A.worldG); A.worldG.connect(world);
  A.body = body;
  // white noise for the synthesised sounds: a fixed sequence (no rng)
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = b.getChannelData(0);
  let x = 2463534242;
  for (let i = 0; i < d.length; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; d[i] = ((x >>> 0) / 4294967296) * 2 - 1; }
  A.white = b;
  A.buf = new Proxy({} as Record<string, AudioBuffer | null>, { get: (_t, k) => (typeof k === 'string' && SAMPLE_URLS[k] ? samples.buffer(SAMPLE_URLS[k]) : null) });
  void samples.preload(Object.values(SAMPLE_URLS));
}
function chain(node: AudioNode, { pan = 0, lp = 0, hp = 0, dest = A.worldLP as AudioNode }: { pan?: number; lp?: number; hp?: number; dest?: AudioNode }) {
  let n = node;
  if (hp) { const f = A.ctx!.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; n.connect(f); n = f; }
  if (lp) { const f = A.ctx!.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; n.connect(f); n = f; }
  if (pan) { const p = A.ctx!.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); n.connect(p); n = p; }
  n.connect(dest);
}
function play(id: string, { g = 0.5, pan = 0, rate = 1, lp = 0, hp = 0, dest, at = 0, offset = 0, dur }: { g?: number; pan?: number; rate?: number; lp?: number; hp?: number; dest?: AudioNode; at?: number; offset?: number; dur?: number } = {}) {
  if (!A.ctx || !A.buf[id]) return null;
  const ctx = A.ctx, t = ctx.currentTime + Math.max(0, at);
  const src = ctx.createBufferSource(); src.buffer = A.buf[id]; src.playbackRate.value = rate;
  const gn = ctx.createGain(); gn.gain.value = g; src.connect(gn);
  chain(gn, { pan, lp, hp, dest: dest ?? A.worldLP });
  const len = dur ?? (A.buf[id]!.duration - offset);
  if (dur) { gn.gain.setValueAtTime(g, t + dur / rate - 0.03); gn.gain.linearRampToValueAtTime(0.0001, t + dur / rate); }
  src.start(t, offset, len + 0.05);
  return src;
}
function noise({ at = 0, dur = 0.2, type = 'bandpass' as BiquadFilterType, f = 1000, f2, q = 1, gain = 0.1, attack = 0.01, dest = A.worldLP as AudioNode, pan = 0 }: { at?: number; dur?: number; type?: BiquadFilterType; f?: number; f2?: number; q?: number; gain?: number; attack?: number; dest?: AudioNode; pan?: number }) {
  if (!A.ctx) return;
  const ctx = A.ctx, t = ctx.currentTime + at;
  const src = ctx.createBufferSource(); src.buffer = A.white!; src.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl); fl.connect(g); chain(g, { pan, dest }); src.start(t, rnd01()); src.stop(t + dur + 0.05);
}
function thump(at: number, gain: number, f0 = 55, dest = A.body!) {
  if (!A.ctx) return;
  const ctx = A.ctx, t = ctx.currentTime + at;
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + 0.14);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.3);
}
const SFX = {
  pen: () => { for (let i = 0; i < 3; i++) noise({ at: i * 0.05 + rnd01() * 0.02, dur: 0.035 + rnd01() * 0.03, f: 2600 + rnd01() * 1800, q: 3, gain: 0.04 }); },
  /* her clothes: her hand going up, a feint's twitch (panned to her hand's side) */
  cloth: (pan: number, g = 0.35, rate = 1) => { if (!play(pick(['cloth1', 'cloth2', 'cloth3', 'cloth4']), { g, pan, rate, lp: 6000 })) noise({ dur: 0.3, f: 1100, f2: 1700, q: 0.7, gain: g * 0.25, attack: 0.05, pan }); },
  /* the swish of her hand: timed so that it ends on the impact */
  swish: (atS: number, pan: number) => {
    if (S.swishS !== 'synth' && A.buf[S.swishS]) {
      const rate = 0.72, d = A.buf[S.swishS]!.duration / rate;
      play(S.swishS, { g: 0.5, pan, rate, at: atS - d * 0.85, hp: 300 });
    } else noise({ at: atS - 0.16, dur: 0.17, f: 900, f2: 3200, q: 0.8, gain: 0.16, attack: 0.12, pan });
  },
  /* the slap: the recording on the body bus, panned to the cheek; a glancing one is duller and quieter */
  slap: (pan: number, glancing: boolean) => {
    const g = glancing ? 0.5 : 1;
    // the author's level (slapLvl 0.5): half of the first draft's 0.95
    if (!play('slap', { g: 0.95 * S.slapLvl * g, pan: pan * 0.55, lp: glancing ? 2200 : 0, dest: A.body })) {
      noise({ dur: 0.09, type: 'highpass', f: 1400, gain: 0.5 * g, attack: 0.002, dest: A.body, pan: pan * 0.55 });
    }
    if (S.thump) thump(0, (glancing ? 0.25 : 0.55), 70);
  },
  /* the ringing in the ears: two close sines that beat, a slow fade; the world dulls and comes back */
  ring: (sec: number, k = 1) => {
    if (!A.ctx || sec <= 0) return;
    const ctx = A.ctx, t = ctx.currentTime;
    for (const [f, gg] of [[4180, 0.035], [4207, 0.028], [8400, 0.006]] as const) {
      const o = ctx.createOscillator(); o.frequency.value = f; o.type = 'sine';
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gg * k, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + sec);
      o.connect(g); g.connect(A.body!); o.start(t); o.stop(t + sec + 0.1);
    }
    A.worldLP!.frequency.cancelScheduledValues(t);
    A.worldLP!.frequency.setValueAtTime(lerp(16000, 650, k), t + 0.01);
    A.worldLP!.frequency.exponentialRampToValueAtTime(16000, t + Math.max(0.6, sec * 0.9));
  },
  /* the commander's breath (the recording of saturation: a nose inhale and an exhale): a sharp intake on tensing, an exhale after */
  intake: () => { if (!play('breath', { g: 0.24, rate: 1.6, offset: 0.14, dur: 0.42, lp: 3200, dest: A.body })) noise({ dur: 0.22, f: 900, f2: 2200, q: 0.9, gain: 0.08, attack: 0.03, dest: A.body }); },
  exhale: (at: number, g = 0.16) => { play('breath', { g, rate: 1.1, offset: 2.17, dur: 0.95, lp: 2600, dest: A.body, at }); },
  heart: () => { thump(0, 0.5, 52); thump(0.26, 0.32, 46); },
};

/* ---------- state ---------- */
/** A slap as the instrument runs it (slap.html's `s`), from the engine's slap. */
interface Slap {
  id: string; style: string; swing: number; unann: boolean; feints: number; dir: 1 | -1; lead: number; swingAt: number; impactAt: number; t0: number; again: boolean;
  faceBefore: string; faceShown: boolean; pressAt: number | null; presses: number; turned: number; turnAt: number | null; result: SlapResult | null; tensionAtImpact: number;
  phase: string; doneAt: number | null; said: boolean; feintSaid: boolean; k0: number; landedAt?: number; k?: number; onResult: (r: SlapResult) => void;
}
/** What the scene asks for: the engine's open slap and where its answer goes. */
export interface SlapStart { id: string; windowMs: number; feints: number; unannounced?: true; again?: true; onResult: (r: SlapResult) => void }
interface Glob {
  slap: Slap | null; last: Slap | null; back: { t0: number; from: number } | null; starting: boolean; k: number;
  cheekA: number; cheekDir: number; cheekT0: number; cheekScene: string; mouse: Array<[number, number]>; typingFocus: boolean;
  /** An engine slap that came while one was running (cruel's second, a slip's): started when the camera lets go. */
  next: SlapStart | null;
  /** The ids already started (a redraw never starts a slap twice). */
  started: Set<string>;
  epoch: number; rkey: string; rn: number;
}
const G: Glob = { slap: null, last: null, back: null, starting: false, k: 0, cheekA: 0, cheekDir: 1, cheekT0: 0, cheekScene: '', mouse: [], typingFocus: false, next: null, started: new Set(), epoch: 0, rkey: '', rn: 0 };
/** Her lines of this slap by kind (`cardVoice` `slap.*` for her style, one line picked by `voiceLine`'s hash): the prototype's `LINES[style]`. */
let LINES: Record<string, Record<string, string[] | undefined>> = {};
function linesFor(reg: Registries, style: string, id: string): Record<string, string[] | undefined> {
  const one = (kind: VoiceKind): string[] => { const runs = voiceLine(reg, kind, style, id, {}); return runs.length === 0 ? [] : [runs.map((r) => r.text).join('')]; };
  const feint = one('slap.feint'), again = one('slap.again');
  return {
    before: one('slap.before'), none: one('slap.after.none'), braced: one('slap.after.braced'), flinched: one('slap.after.flinched'),
    ...(feint.length > 0 ? { feint } : {}), ...(again.length > 0 ? { again } : {}),
  };
}

/* the tension of the commander's body, t ms after the press: rise, a short peak, a fall (held or not) */
export function tensionAt(t: number) {
  const T = S.tension;
  if (t < 0) return 0;
  if (t < T.rise) return easeOut(t / T.rise);
  if (t < T.rise + T.peak) return 1;
  return clamp(1 - (t - T.rise - T.peak) / T.fall, 0, 1);
}

/* ---------- a slap ---------- */
async function startSlap(opts: SlapStart) {
  if (G.slap || G.starting) return;
  G.starting = true;
  const epoch = G.epoch;
  G.started.add(opts.id);
  G.rkey = opts.id; G.rn = 0;
  requestAnimationFrame(frame);
  const faceBefore = beforeLabel(S.style, opts.unannounced ?? S.unann);
  await preload(faceBefore); // the snap waits for her new face (at most EXPR_WAIT)
  if (G.epoch !== epoch) return;
  G.starting = false;
  if (G.slap) return;
  audioInit();
  const id = opts.id;
  const style = S.style;
  const swing = opts.windowMs;
  const unann = opts.unannounced ?? S.unann;
  let feints = opts.feints;
  if (unann) feints = 0;
  const dir = slapSide(id); // +1: her hand comes from the screen's left (her right hand)
  const lead = unann ? SNAP : (opts.again ? AGAIN_LEAD : LEAD);
  const swingAt = lead + feints * FEINT;
  const t0 = performance.now();
  const s: Slap = { id, style, swing, unann, feints, dir, lead, swingAt, impactAt: swingAt + swing, t0, again: !!opts.again,
    faceBefore, faceShown: false, pressAt: null, presses: 0, turned: 0, turnAt: null, result: null, tensionAtImpact: 0, phase: 'snap', doneAt: null, said: false, feintSaid: false, k0: G.k ?? 0, onResult: opts.onResult };
  G.slap = s;
  G.last = s;
  G.back = null;
  // the input lets go: Space must not land in the text, and the hands are the body's now (nor click a focused button)
  const active = document.activeElement as HTMLElement | null;
  if (!opts.again) G.typingFocus = active === $('#cmd');
  if (active && active !== document.body) active.blur();
  requestAnimationFrame(frame);
  if (S.reduced) { showFace(faceBefore); land(s, performance.now()); return; }
  // her hand goes up: a heartbeat, her clothes on her hand's side; the swish timed to the impact
  SFX.heart();
  if (!unann) SFX.cloth(-dir * 0.7, 0.4);
  SFX.swish(s.impactAt / 1000, -dir * 0.6);
  for (let i = 0; i < feints; i++) setTimeout(() => { if (G.slap === s) SFX.cloth(-dir * 0.7, 0.5, 1.25); }, lead + i * FEINT);
  const before = LINES[style]!.before!;
  if (before.length && !unann && !opts.again) setTimeout(() => { if (G.slap === s && !s.result) say(pick(before)); }, SNAP + 60);
  if (opts.again && LINES[style]!.again) setTimeout(() => { if (G.slap === s && !s.result) say(pick(LINES[style]!.again!)); }, 80);
}

function press(source: string) {
  const s = G.slap; if (!s || s.result) return;
  s.presses += 1;
  if (s.pressAt !== null) return; // one try: the body has already let go
  s.pressAt = performance.now() - s.t0;
  SFX.intake();
  // caught on a feint: the playful one says so
  const onFeint = s.feints > 0 && s.pressAt >= s.lead && s.pressAt < s.swingAt;
  if (onFeint && LINES[s.style]!.feint) setTimeout(() => { if (G.slap === s && !s.result) say(pick(LINES[s.style]!.feint!)); }, 120);
}

/* a sharp flick of the mouse sideways turns the face away (from the moment her hand is up until the impact) */
function onMove(e: PointerEvent) {
  const now = performance.now();
  G.mouse.push([now, e.clientX]);
  while (G.mouse.length && now - G.mouse[0]![0] > 70) G.mouse.shift();
  const s = G.slap; if (!s || s.result || s.turned) return;
  if (G.mouse.length < 2) return;
  const [ta, xa] = G.mouse[0]!, dt = (now - ta) / 1000, dx = e.clientX - xa;
  if (dt <= 0) return;
  const v = dx / dt;
  if (Math.abs(v) >= S.flick && Math.abs(dx) >= innerWidth * 0.06) { s.turned = Math.sign(dx); s.turnAt = now - s.t0; SFX.cloth(0, 0.25, 1.4); }
}

function land(s: Slap, now: number) {
  const t = now - s.t0;
  s.tensionAtImpact = s.pressAt === null ? 0 : tensionAt(t - s.pressAt);
  s.result = s.turned ? 'flinched' : s.tensionAtImpact >= S.tension.thr ? 'braced' : 'none';
  s.landedAt = t;
  s.onResult(s.result);
  const glancing = s.result === 'flinched';
  const k = s.result === 'braced' ? 0.65 : glancing ? 0.45 : 1; // how hard it is felt
  s.k = k;
  SFX.slap(-s.dir, glancing);
  SFX.ring(S.ring * (s.result === 'braced' ? 0.55 : glancing ? 0.4 : 1), k);
  if (s.result === 'braced') SFX.exhale(0.45, 0.15);
  // the cheek: a red glow on the side the hand came from, fading over half a minute
  G.cheekA = Math.min(0.9, G.cheekA * 0.6 + 0.8 * k); G.cheekDir = s.dir; G.cheekT0 = now;
  flash(k);
  scatter(k);
  // her answer, then the camera goes back to the scene
  const pool = LINES[s.style]![s.result] ?? [];
  const faceAfter = EXPR[s.style as keyof typeof EXPR].after[s.result];
  void preload(faceAfter);
  setTimeout(() => { showFace(faceAfter); if (pool.length) say(pick(pool)); }, s.style === 'cold' ? 0 : 380);
  const cruelAgain = s.style === 'cruel' && s.result === 'flinched' && !s.again;
  const hold = cruelAgain ? 700 : s.style === 'cold' ? 900 : 1500;
  s.doneAt = t + hold;
  setTimeout(() => {
    if (G.slap !== s) return;
    G.slap = null; G.back = S.reduced ? null : { t0: performance.now(), from: 1 };
    noteFaceLeft();
    if (cruelAgain || G.next) setTimeout(() => startNext(), 120);
    else if (G.typingFocus) $('#cmd').focus();
  }, S.reduced ? 600 : hold);
}

/** The slap that came while one ran (cruel's second after a turned face): it starts now; with none, the input gets its focus back. */
function startNext(): void {
  const next = G.next;
  G.next = null;
  if (next && !G.started.has(next.id)) { LINES = LINES_NEXT; if (E) E.host.dataset.slap = next.id; readFaceNow(); void startSlap(next); }
  else if (G.typingFocus && E) $('#cmd').focus();
}

/* ---------- effects ---------- */
function flash(k: number) {
  const el = $('#flash');
  el.style.transition = 'none';
  el.style.background = 'radial-gradient(ellipse at 50% 45%, rgba(255,250,245,1), rgba(255,90,70,1) 55%, rgba(200,20,20,1))';
  el.style.opacity = String(0.75 * k);
  requestTwoFrames(() => {
    el.style.transition = 'opacity 260ms cubic-bezier(.2,.7,.3,1), background 120ms';
    el.style.background = 'radial-gradient(ellipse at 50% 45%, rgba(255,120,100,1), rgba(220,40,30,1) 60%, rgba(160,10,10,1))';
    el.style.opacity = '0';
  });
}
function scatter(k: number) {
  const spans = [...$('#mirror').children] as HTMLElement[];
  for (const sp of spans) {
    sp.style.transition = 'none';
    sp.style.transform = `translate(${rand(-14, 14) * k}px, ${rand(-16, 16) * k}px) rotate(${rand(-28, 28) * k}deg)`;
  }
  requestTwoFrames(() => { for (const sp of spans) { sp.style.transition = ''; sp.style.transform = ''; } });
}
/** Two frames later (the prototype's `requestAnimationFrame(() => requestAnimationFrame(…))`, so the style before it is painted): a timer of the slap's own. */
function requestTwoFrames(fn: () => void): void {
  setTimeout(fn, 32);
}

/* ---------- her hand (her hand's font, written in steps, beside her face) ---------- */
function say(text: string) {
  if (!text) return;
  const el = document.createElement('div');
  el.className = 'alius-her-line';
  el.textContent = text;
  const speed = S.style === 'cruel' || S.style === 'cold' ? 24 : S.style === 'ritual' ? 45 : 34;
  el.style.setProperty('--write', `${Math.max(140, text.length * speed)}ms`);
  el.style.setProperty('--steps', String(Math.max(4, text.length * 2)));
  el.style.fontSize = `${Math.round(44 * (E?.her.handScale ?? 1) * 100) / 100}px`;
  const s = G.slap ?? G.last; const dir = s ? s.dir : 1;
  // on the side away from her hand, beside her face
  if (dir > 0) { el.style.left = `${innerWidth * 0.6}px`; } else { el.classList.add('right'); el.style.right = `${innerWidth * 0.6}px`; }
  const showing = [...$('#hand').children].filter((c) => !c.classList.contains('gone')).length; // stack below the lines still showing
  el.style.top = `${innerHeight * rand(0.22, 0.26) + showing * 54}px`;
  el.style.transform = `rotate(${rand(-4, 3).toFixed(1)}deg)`;
  $('#hand').appendChild(el);
  SFX.pen();
  setTimeout(() => { el.classList.add('gone'); setTimeout(() => el.remove(), 600); }, 2200);
}

/* ---------- the camera ---------- */
function frame(now: number) {
  requestAnimationFrame(frame);
  const W = innerWidth, H = innerHeight;
  const s = G.slap;
  // how close the camera is: snaps in on a slap, eases back after
  let k = 0;
  if (s && !S.reduced) k = lerp(s.k0, 1, easeOut((now - s.t0) / SNAP));
  else if (G.back) { const p = (now - G.back.t0) / RETURN; k = 1 - easeInOut(p); if (p >= 1) G.back = null; }
  G.k = k;
  // her lean: -0.4 her hand up (the frame's hand side rises), toward +1 through the swing; feints twitch toward the strike and back
  let lean = 0, sweep = -1, twitch = 0;
  if (s && !S.reduced) {
    const t = now - s.t0;
    if (!s.faceShown && t >= EXPR_SWITCH) { s.faceShown = true; showFace(s.faceBefore); }
    if (!s.unann) lean = -0.4 * easeOut((t - SNAP * 0.4) / 380) + 0.04 * Math.sin(t / 140) * (t > SNAP ? 1 : 0); // her hand up: the frame's hand side rises; a slight unrest
    for (let i = 0; i < s.feints; i++) {
      const ft = t - (s.lead + i * FEINT);
      if (ft >= 0 && ft < FEINT) { const p = ft / FEINT; twitch = p < 0.3 ? easeIn(p / 0.3) : 1 - easeOut((p - 0.3) / 0.45); lean = -0.4 + 0.75 * twitch; }
    }
    if (t >= s.swingAt && !s.result) {
      const p = (t - s.swingAt) / s.swing;
      lean = lerp(s.unann ? 0 : -0.4, 1, easeIn(p));
      if (S.sweep) sweep = clamp(1 - (s.impactAt - t) / SWEEP, 0, 1);
    }
    if (!s.result && t >= s.impactAt) land(s, now);
    if (s.result) lean = 0;
  }
  // the whip: the head knocked toward her hand's side, a damped swing back
  let whipX = 0, whipR = 0, hb = 0;
  const L = s && s.result ? s : (G.back && G.last && G.last.result ? G.last : null);
  if (L && L.landedAt !== undefined && !S.reduced) {
    const tt = now - (L.t0 + L.landedAt), kk = L.k ?? 1;
    const env = tt < 45 ? easeOut(tt / 45) : Math.exp(-(tt - 45) / 210) * Math.cos((tt - 45) / 520 * Math.PI * 2);
    whipX = -L.dir * 0.075 * W * env * kk; whipR = -L.dir * 5.5 * env * kk;
    hb = tt < 220 ? (1 - tt / 220) * 16 * kk : 0;
  }
  // the turned face (defiance): the view swings away and stays turned until the camera goes back
  let turnX = 0;
  const T = s ?? (G.back ? G.last : null);
  if (T && T.turned) { const tt = now - (T.t0 + T.turnAt!); turnX = T.turned * 0.11 * W * easeOut(tt / 160) * (G.back ? k : 1); hb = Math.max(hb, tt < 160 ? 10 * (1 - tt / 160) : 0); }
  // the body's tension
  let ten = 0, tremble = 0;
  if (s && s.pressAt !== null && !s.result) {
    const tt = now - s.t0 - s.pressAt; ten = tensionAt(tt);
    if (tt > S.tension.rise + S.tension.peak && ten > 0.05) tremble = (1 - ten) * 1.6;
  }
  const rot = -(s ? s.dir : 1) * lean * 3.4 + whipR;
  const dx = -(s ? s.dir : 1) * lean * 0.022 * W + whipX + turnX + (tremble ? rand(-tremble, tremble) : 0);
  const dy = tremble ? rand(-tremble, tremble) : 0;
  const leanIn = s && !s.result && !S.reduced ? 0.035 * clamp((now - s.t0 - SNAP) / 500, 0, 1) : 0; // she leans in a little while her hand is up
  const world = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${(1 + 0.02 * ten + leanIn + (turnX ? 0.03 : 0)).toFixed(4)})`;
  $('#hblurG').setAttribute('stdDeviation', `${hb.toFixed(1)} ${(hb * 0.12).toFixed(1)}`);
  // the scene's layers are the world; her sprite closes in on her face; the face art (when loaded) crossfades in
  if ((s || G.back) && !S.reduced) cam.draw(world, hb, k);
  else cam.release();
  E!.faceImg.style.opacity = E!.hasFace ? String(k) : '0';
  $('#dimmer').style.opacity = String(0.25 * k);
  // the side of her hand: the light dims as it rises; a dark blur from that edge in the last moment
  const dir = s ? s.dir : 1;
  const sideA = s && !s.result && S.sideDark ? clamp(0.42 * easeOut((now - s.t0 - SNAP) / 300) + 0.3 * twitch + 0.4 * Math.max(0, lean), 0, 0.85) : 0;
  $('#side').style.background = `linear-gradient(${dir > 0 ? 90 : 270}deg, rgba(4,2,6,.95), rgba(4,2,6,.4) 28%, rgba(4,2,6,0) 55%)`;
  $('#side').style.opacity = sideA.toFixed(3);
  const sw = $('#sweep');
  if (sweep >= 0 && s && !s.result) {
    const x0 = dir > 0 ? -0.5 : 1.04, x1 = dir > 0 ? 0.02 : 0.52;
    sw.style.left = `${(lerp(x0, x1, easeIn(sweep)) * W).toFixed(1)}px`;
    sw.style.opacity = String(0.85 * Math.min(1, sweep * 2));
  } else sw.style.opacity = '0';
  $('#tight').style.opacity = String((0.5 * ten).toFixed(3));
  if (A.worldG) A.worldG.gain.value = 1 - 0.55 * ten;
  // the cheek: red on the hit side, a slow throb, fading over ~30 s
  if (G.cheekA > 0) {
    const age = (now - G.cheekT0) / 1000;
    const a = G.cheekA * Math.exp(-age / 24) * (0.85 + 0.15 * Math.sin(age * 5.2));
    const cx = G.cheekDir > 0 ? '0%' : '100%';
    $('#cheek').style.background = `radial-gradient(ellipse 48% 62% at ${cx} 56%, rgba(210,24,20,.85), rgba(170,10,10,.35) 45%, rgba(120,0,0,0) 75%)`;
    $('#cheek').style.opacity = a.toFixed(3);
    if (a < 0.004) G.cheekA = 0;
  } else $('#cheek').style.opacity = '0';
  // the scene UI steps back while the slap runs
  if ((s || G.back) && !S.reduced) {
    $('#reply').style.opacity = String(1 - 0.85 * k);
    $('#inputWrap').style.opacity = String(1 - 0.6 * k);
  }
}

/* ---------- input ---------- */
const typing = (el: EventTarget | null): boolean => el instanceof HTMLElement && (/^(input|textarea|select)$/i.test(el.tagName) || el.isContentEditable);
function onKey(e: KeyboardEvent) {
  if (typing(e.target)) return;
  if (e.key === ' ') { if (!G.slap) return; e.preventDefault(); if (!e.repeat) press('key'); }
}
/** A press of the left button on the scene (not on a control of the scene's UI: a button, the input, a card, a chip, the dial and its pill). */
const CONTROLS = 'button, a, input, textarea, select, summary, label, [role="button"], [contenteditable="true"], .alius-input-line, .alius-stage-dock, .alius-chip-row, .alius-stage-dial, .alius-stage-topline, .alius-curtain';
function onDown(e: PointerEvent) {
  if (e.button !== 0 || (e.target instanceof Element && e.target.closest(CONTROLS))) return;
  if (G.slap) { e.preventDefault(); press('mouse'); }
}

/* ---------- the entry: the scene's open slap ---------- */

export interface SlapMount {
  env: InstrumentEnv;
  /** The scene's slap host (the moment layer's `.alius-slap-host`): marked while a slap runs. */
  host: HTMLElement;
  reg: Registries;
  sceneId: string;
  /** The engine's open slap and its holder (none: only the cheek of this scene, and the end of a slap that landed, go on). */
  slap: (SlapStart & { holderId: string; style: string }) | null;
  /** Reduced motion or the timing interaction off: it lands at once (`none`). */
  still: boolean;
}

/** Whose slap the frame was last bound to (a new screen of the same scene draws her cheek on). */
let holder = '';

/** Binds the slap to this scene's frame (a new scene or a new frame stops what ran in the old one; a new scene forgets its cheek). */
function bind(m: SlapMount, unitId: string): void {
  if (E && (E.env !== m.env || E.sceneId !== m.sceneId || E.unitId !== unitId || !E.box.isConnected)) stopSlap({ keepCheek: E.sceneId === m.sceneId });
  if (G.cheekScene !== m.sceneId) { G.cheekA = 0; G.cheekScene = m.sceneId; G.started.clear(); G.last = null; }
  if (!E) {
    E = { ...build(m.env, unitId), host: m.host, sceneId: m.sceneId };
    const e = E;
    // with the history curtain open the commander is reading, not in the frame: no press, no flick (review M3)
    const reading = (): boolean => e.env.root.dataset.curtain === 'open';
    e.offs.push(m.env.listen(document, 'keydown', ((ev: KeyboardEvent) => { if (!reading()) onKey(ev); }) as EventListener));
    e.offs.push(m.env.listen(e.env.root, 'pointerdown', ((ev: PointerEvent) => { if (!reading()) onDown(ev); }) as EventListener));
    e.offs.push(m.env.listen(document, 'pointermove', ((ev: PointerEvent) => { if (!reading()) onMove(ev); }) as EventListener));
    for (const k of Object.keys(faces)) delete faces[k];
    looking.clear();
    leftBySlap = null;
  }
  E.host = m.host;
  holder = unitId;
  S.reduced = m.still;
  S.face = m.env.art.face(unitId) ?? { x: 0.47, y: 0.17 };
  measure();
}

/**
 * Draws the scene's slap (a redraw with the same slap changes nothing): binds it to the frame, starts the engine's open slap once (one that
 * comes while another runs waits for its camera to let go), and keeps the cheek of this scene drawn. Without a slap a landed one plays its
 * end and one that never landed (its scene ended, she stopped holding) stops at once and sends nothing. Draws nothing in the engine's sense.
 */
export function mountSlap(m: SlapMount): void {
  const slap = m.slap;
  if (!slap) {
    settleSlap();
    const same = E !== null && E.env === m.env && E.sceneId === m.sceneId && E.box.isConnected;
    if (!same && (G.cheekScene !== m.sceneId || G.cheekA <= 0 || holder === '')) { if (E) stopSlap({ keepCheek: E.sceneId === m.sceneId }); return; }
    if (!same) bind(m, holder);
    if (G.cheekA > 0) requestAnimationFrame(frame);
    return;
  }
  bind(m, slap.holderId);
  S.style = slap.style;
  lookFaces(facesOf(slap.style));
  if (G.cheekA > 0) requestAnimationFrame(frame);
  if (G.started.has(slap.id)) return;
  if (G.slap || G.starting) { if (G.next?.id !== slap.id) { G.next = slap; LINES_NEXT = { [slap.style]: linesFor(m.reg, slap.style, slap.id) }; } return; }
  LINES = { [slap.style]: linesFor(m.reg, slap.style, slap.id) };
  m.host.dataset.slap = slap.id;
  readFaceNow();
  void startSlap(slap);
}
/** The lines of the slap that waits (`G.next`). */
let LINES_NEXT: typeof LINES = {};

/** The slap the instrument holds now (its id, and whether it landed), or null. */
export function currentSlap(): { id: string; landed: boolean } | null {
  const s = G.slap;
  return s ? { id: s.id, landed: s.result !== null } : G.starting ? { id: G.rkey, landed: false } : null;
}

/**
 * The engine's slap is gone from the state. A slap that landed plays its end (her line, the hold, the way back, the cheek); one that never
 * landed (its scene ended, she stopped holding) stops at once and sends nothing.
 */
export function settleSlap(): void {
  G.next = null;
  const s = G.slap;
  if ((s && s.result === null) || G.starting) {
    G.started.delete(s ? s.id : G.rkey); // never answered: should it be open again, it starts again
    G.epoch++;
    G.starting = false;
    G.slap = null;
    G.back = null;
    // what it scheduled goes with it (review M7): its sounds (the swish timed to the impact, her clothes) and its timers; the input gets its focus back
    for (const n of made) { try { n.stop(); } catch { /* not started, or already stopped */ } }
    made.clear();
    for (const t of timers) clearTimeout(t);
    timers.clear();
    if (E) $('#hand').replaceChildren(); // her line before it (its fade was a timer)
    if (G.typingFocus && E) $('#cmd').focus();
  }
}

/**
 * Stops everything at once (dispose, no scene, a new scene, a chat switch): no timer, frame, listener or sound stays, no answer is sent
 * afterwards, the scene's layers and input are put back. The cheek is scene memory: kept only when `keepCheek` (the same scene's frame).
 */
export function stopSlap(opts: { keepCheek?: boolean } = {}): void {
  // a slap that never landed was not answered: a new frame of the same scene starts it again (the engine still holds it open)
  if (G.slap && G.slap.result === null) G.started.delete(G.slap.id);
  if (G.starting) G.started.delete(G.rkey);
  G.epoch++;
  G.slap = null;
  G.back = null;
  G.starting = false;
  G.next = null;
  G.k = 0;
  G.mouse = [];
  if (!opts.keepCheek) { G.cheekA = 0; G.cheekScene = ''; G.started.clear(); G.last = null; }
  for (const t of timers) clearTimeout(t);
  timers.clear();
  if (frameId !== null && E) E.env.cancelRaf(frameId);
  frameId = null;
  for (const n of made) { try { n.stop(); } catch { /* not started, or already stopped */ } try { n.disconnect(); } catch { /* not connected */ } }
  made.clear();
  try { A.worldG?.disconnect(); } catch { /* not connected */ }
  A.ctx = null; A.buf = {}; delete A.worldLP; delete A.worldG; delete A.body; delete A.white;
  cam.release();
  if (E) {
    for (const off of E.offs) off();
    E.box.remove();
    const mirrors = E.env.root.querySelectorAll('.alius-slap-mirror');
    if (mirrors.length > 0) E.env.input.style.removeProperty('color'); // the letters were laid over the input: its own colour back
    mirrors.forEach((m) => m.remove());
    delete E.host.dataset.slap;
  }
  E = null;
}

/** A chat switch (`resetSceneStage`): everything stops and the cheek is forgotten (scene ids repeat across campaigns). */
export function resetSlap(): void {
  stopSlap();
}

/** Her practice style, as the slap reads it (the prototype's default when she has none). */
export function slapStyleOf(state: Parameters<typeof practiceOf>[0], reg: Registries, holderId: string): string {
  const style = practiceOf(state, reg, holderId)?.style.primary;
  return style !== undefined && style in EXPR ? style : 'possessive';
}
