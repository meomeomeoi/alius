/**
 * P10e-e: the instrument host. While a physics run is live, real time is on (the global `settings.physicsRealtime` and the campaign's
 * mirrored scene setting) and the run's interaction is not switched off, the first registered instrument that matches the run draws it
 * instead of the physics card. One instrument runs at a time; it is started once per run (a scene's run ids repeat, so the key carries the
 * scene id) and updated on each redraw.
 *
 * When the run is gone from the state, the instrument may play its end (`InstrumentRun.finish`, given the run's `physics_outcome`) for the
 * ms it asks, with its staging dead; a run ended by the stop word (`stopped`) plays no end. A new run, no scene, a new scene, a stage reset
 * (chat switch) and the screen's dispose stop it at once.
 *
 * Each mount gets its own view of the env (`Object.create`): `raf`, `timeout`, `listen` and `samples` are recorded and undone at the
 * unmount, `staging` goes dead, the lines it wrote with `env.say` go, its heart stops, the input line is plain again, and the `style` and
 * `data-*` of the scene's root and of every layer are put back as they were at the mount (the scene's own keys excepted). Whatever an
 * instrument's own `stop` forgets, nothing it made outlives it or reaches the next run or the next chat.
 */
import type { Registries } from '../../../content/types';
import type { PostureRun } from '../../../engine/craft/state';
import { sceneSettingsOf } from '../../../engine/moments/settings';
import type { PhysicsRun } from '../../../engine/physics/state';
import type { CampaignState } from '../../../engine/state/types';
import type { AliusSettings } from '../../../settings';
import { h } from '../../dom';
import type { SampleLoop, SampleSound } from '../../sound/samples';
import type { PhysicsPanelStaging } from '../physicsPanel';
import { unsay } from './kit/hand';
import { heartStop } from './kit/heart';
import { claimedProps, claimStyles, handDownAbsent, releaseClaim, writeClaimed, type StyleClaim } from './styleClaims';
import type { InstrumentDef, InstrumentEnv, InstrumentRun, PhysicsEnd, PostureInstrumentDef, PostureInstrumentRun } from './types';

const defs: InstrumentDef[] = [];
const postureDefs: PostureInstrumentDef[] = [];

/** P16b Task 23: registers the instrument that plays a hold of a posture (once per id). */
export function registerPostureInstrument(def: PostureInstrumentDef): void {
  if (!postureDefs.some((d) => d.id === def.id)) postureDefs.push(def);
}

/**
 * P16b Task 23: the instrument that plays this hold of a posture, or null (then nothing is drawn: the hold goes on in the engine, her directive stands and the stop word ends it). Real time must
 * be on both in the settings and in the campaign's mirror and the game of postures must not be switched off (`physicsInteractions.posture`, the settings and the mirror).
 */
export function postureInstrumentFor(run: PostureRun, state: CampaignState, reg: Registries, settings: AliusSettings): PostureInstrumentDef | null {
  if (settings.physicsRealtime !== true || sceneSettingsOf(state).physicsRealtime !== true) return null;
  if ((settings.physicsInteractions as Record<string, boolean> | undefined)?.posture === false || sceneSettingsOf(state).physicsInteractions.posture === false) return null;
  return postureDefs.find((d) => {
    try {
      return d.matches(run, state, reg);
    } catch (err) {
      warnOnce(d.id, 'matches', err);
      return false;
    }
  }) ?? null;
}

/** Registers an instrument (once per id); the first that matches a run wins, in the order of registration. */
export function registerInstrument(def: InstrumentDef): void {
  if (!defs.some((d) => d.id === def.id)) defs.push(def);
}

/** Tests only: forgets every registered instrument. */
export function _resetInstrumentDefs(): void {
  unmountInstruments();
  defs.length = 0;
  postureDefs.length = 0;
  failed = null;
  warned.clear();
}

/**
 * The instrument that draws this run, or null (then the card is drawn): real time must be on both in the settings and in the campaign's
 * mirror (the engine plans real-time segments only from the mirror), the run's interaction must be on, and an instrument must match.
 */
export function instrumentFor(run: PhysicsRun, state: CampaignState, reg: Registries, settings: AliusSettings): InstrumentDef | null {
  if (settings.physicsRealtime !== true || sceneSettingsOf(state).physicsRealtime !== true) return null;
  const interaction = String(reg.contactPhysics.get(run.physicsId)?.interaction ?? '');
  if ((settings.physicsInteractions as Record<string, boolean> | undefined)?.[interaction] === false) return null;
  return defs.find((d) => {
    try {
      return d.matches(run, state, reg);
    } catch (err) {
      warnOnce(d.id, 'matches', err); // a throwing matches never aborts the refresh: the next definition is asked, else the card draws
      return false;
    }
  }) ?? null;
}

/**
 * Whether a matching instrument can draw this run on this scene (`InstrumentDef.drawable`, e.g. its pictures exist and none failed): absent =
 * yes; false (or a throw) = the card plays the run.
 */
function drawable(def: InstrumentDef, env: InstrumentEnv, run: PhysicsRun): boolean {
  if (!def.drawable) return true;
  try {
    return def.drawable(env, run);
  } catch (err) {
    warnOnce(def.id, 'drawable', err);
    return false;
  }
}

const isPostureDef = (def: InstrumentDef | PostureInstrumentDef): def is PostureInstrumentDef => (def as PostureInstrumentDef).posture === true;

/** What a mount undoes at its unmount. */
interface Scope {
  /** Inputs reach the engine (dead from the end of the run). */
  staging: boolean;
  /** Frames, timers and listeners run (dead at the unmount). */
  live: boolean;
  frames: Set<number>;
  timers: Set<ReturnType<typeof setTimeout>>;
  listeners: Set<() => void>;
  loops: Set<SampleLoop>;
  sources: Set<{ stop(when?: number): void; disconnect(): void }>;
  dulled: boolean;
  saidIn: Set<HTMLElement>;
  samples: SampleSound | null;
  snapshot: Array<{ el: HTMLElement; style: Map<string, string>; data: Map<string, string>; keep: Keep; claim: StyleClaim }>;
  /** R6: the dial's flag, claimed (styleClaims.ts). */
  dial: StyleClaim | null;
}

interface Mounted {
  key: string;
  runId: string;
  def: InstrumentDef | PostureInstrumentDef;
  env: InstrumentEnv;
  run: InstrumentRun | PostureInstrumentRun | null;
  scope: Scope;
  mark: HTMLElement;
  /** The end of the run is playing: the unmount's timer (and the microtask that asks for the outcome). */
  finishing: { timer: ReturnType<typeof setTimeout> | null } | null;
}
let current: Mounted | null = null;
/** The mount (`key|def`) whose start or update threw: it is not started again (the card draws that run instead). */
let failed: string | null = null;
const warned = new Set<string>();
/** An instrument that throws never blanks the frame: it is stopped, warned about once per id, and the card draws the run. */
function warnOnce(id: string, what: string, err: unknown): void {
  if (warned.has(`${id}|${what}`)) return;
  warned.add(`${id}|${what}`);
  console.warn(`[Alius] the instrument "${id}" failed in ${what}; the card plays the hold instead.`, err);
}

/** A staging scoped to one mount: dead from the end of its run (no late input, segment end or stop word reaches the engine). */
function scopedStaging(staging: PhysicsPanelStaging, scope: Scope): PhysicsPanelStaging {
  const on = (): boolean => scope.staging && scope.live;
  return {
    input: (i, o) => { if (on()) staging.input(i, o); },
    endSegment: () => (on() ? staging.endSegment() : []),
    stopWord: () => (on() ? staging.stopWord() : []),
    skip: (s) => (on() ? staging.skip(s) : []),
    stimulus: (w, k, d) => (on() ? staging.stimulus(w, k, d) : []),
    answer: (r, l, c) => (on() ? staging.answer?.(r, l, c) ?? [] : []),
    act: (k) => (on() ? staging.act(k) : []),
    finishCounted: (n) => (on() ? staging.finishCounted(n) : []),
    cue: (k, b) => (on() ? staging.cue(k, b) : null),
    voiced: (k, b) => (on() ? staging.voiced?.(k, b) ?? null : null),
    script: (p) => (on() ? staging.script?.(p) ?? null : null),
    getUp: () => (on() ? staging.getUp?.() ?? [] : []),
    found: (id) => (on() ? staging.found?.(id) ?? [] : []),
    decide: (k, r) => (on() ? staging.decide?.(k, r) ?? [] : []),
    relief: (x) => (on() ? staging.relief?.(x) ?? [] : []),
    woke: () => (on() ? staging.woke?.() ?? [] : []),
    // e9: her verdict is said at the session's end, when the run is already gone: alive until the unmount (never into a new scene or chat)
    service: (id, v) => (scope.live ? staging.service?.(id, v) ?? [] : []),
    signal: (id, m, a) => (scope.live ? staging.signal?.(id, m, a) ?? [] : []),
    // P16b: the game of postures reports through its mount; its end is the instrument's own and the run is gone from the state by then, so they live until the unmount
    postureCorrect: (o) => (scope.live ? staging.postureCorrect?.(o) ?? [] : []),
    postureSlip: (pt) => (scope.live ? staging.postureSlip?.(pt) ?? [] : []),
    postureEnd: (r, b) => (scope.live ? staging.postureEnd?.(r, b) ?? [] : []),
    spit: (b, a) => (on() ? staging.spit?.(b, a) ?? [] : []),
    restart: () => { if (on()) staging.restart?.(); },
    beat: () => staging.beat(),
    clock: () => staging.clock(),
  };
}

/** The sources an instrument makes on the context: recorded, so the unmount stops what is still playing. */
const SOURCE_MAKERS = new Set(['createBufferSource', 'createOscillator', 'createConstantSource']);

/** The mount's view of the recorded sounds (see `InstrumentEnv.samples`). */
function scopedSamples(samples: SampleSound, scope: Scope): SampleSound {
  let proxied: { real: AudioContext; view: AudioContext } | null = null;
  const view = (real: AudioContext): AudioContext => {
    if (proxied?.real === real) return proxied.view;
    const v = new Proxy(real, {
      get(t, p) {
        const value = Reflect.get(t, p, t) as unknown;
        if (typeof value !== 'function') return value;
        if (typeof p === 'string' && SOURCE_MAKERS.has(p)) {
          return (...args: unknown[]) => {
            const node = (value as (...a: unknown[]) => { stop(when?: number): void; disconnect(): void; addEventListener?: EventTarget['addEventListener'] }).apply(t, args);
            if (scope.live) {
              scope.sources.add(node);
              // a source that ended is forgotten: a long hold (two thumps a beat) does not pile up nodes until the unmount
              node.addEventListener?.('ended', () => scope.sources.delete(node), { once: true });
            }
            return node;
          };
        }
        return (value as (...a: unknown[]) => unknown).bind(t);
      },
    });
    proxied = { real, view: v };
    return v;
  };
  return {
    play: (file, opts) => { if (scope.live) samples.play(file, opts); },
    loop: (file, opts) => {
      const l = samples.loop(file, opts);
      if (scope.live) scope.loops.add(l);
      else l.stop(0);
      return l;
    },
    preload: (files) => samples.preload(files),
    buffer: (file) => samples.buffer(file),
    ctx: () => { const c = samples.ctx(); return c ? view(c) : null; },
    bus: (name) => samples.bus(name),
    setWorldDull: (f) => { if (!scope.live) return; scope.dulled = true; samples.setWorldDull(f); },
    setNight: () => {},
    setMuffle: () => {},
    setSensory: () => {},
    dispose: () => {},
  };
}

/** What the scene itself writes on its root and layers while an instrument may run: never put back from the snapshot. */
type Keep = { style: readonly string[]; data: readonly string[] };
const SCENE_OWNED: Record<string, Keep> = {
  root: { style: ['--alius-pan'], data: ['stage', 'backdrop', 'light', 'curtain'] },
  backdrop: { style: ['background-image'], data: [] },
  sprites: { style: [], data: ['count', 'crowd'] },
};
const NONE: Keep = { style: [], data: [] };

function styleMap(el: HTMLElement): Map<string, string> {
  const m = new Map<string, string>();
  for (let i = 0; i < el.style.length; i++) {
    const p = el.style.item(i);
    m.set(p, el.style.getPropertyValue(p));
  }
  return m;
}
function snap(el: HTMLElement, keep: Keep): Scope['snapshot'][number] {
  const style = styleMap(el);
  // review M4: the mount's styles are a claim (styleClaims.ts), so the slap's camera and a mount put each other's values back in any order
  const claim = claimStyles(el, [...style.keys()].filter((p) => !keep.style.includes(p)));
  return { el, style, data: new Map(Object.entries(el.dataset).map(([k, v]) => [k, v ?? ''])), keep, claim };
}
function restore(s: Scope['snapshot'][number]): void {
  releaseClaim(s.claim);
  // what the instrument added: gone, unless another surface's claim holds it now
  const held = claimedProps(s.el);
  for (const p of styleMap(s.el).keys()) {
    if (s.keep.style.includes(p) || s.style.has(p)) continue;
    if (held.has(p)) handDownAbsent(s.el, p); // another surface holds it: what it puts back is "none", as before this mount
    else s.el.style.removeProperty(p);
  }
  for (const k of Object.keys(s.el.dataset)) if (!s.keep.data.includes(k) && !s.data.has(k)) delete s.el.dataset[k];
  for (const [k, v] of s.data) if (!s.keep.data.includes(k) && s.el.dataset[k] !== v) s.el.dataset[k] = v;
}

function syncMark(m: Mounted): void {
  m.mark.toggleAttribute('data-reduced', m.env.reduced);
  m.mark.toggleAttribute('data-readable', m.env.readable);
}

function mount(env: InstrumentEnv, def: InstrumentDef | PostureInstrumentDef, run: PhysicsRun | PostureRun, key: string): void {
  const scope: Scope = {
    staging: true, live: true, frames: new Set(), timers: new Set(), listeners: new Set(), loops: new Set(), sources: new Set(), dulled: false,
    saidIn: new Set(), samples: null, dial: null,
    snapshot: [snap(env.root, SCENE_OWNED.root), ...Object.entries(env.layers).map(([name, el]) => snap(el, SCENE_OWNED[name] ?? NONE)), snap(env.input, NONE)],
  };
  scope.samples = env.samples ? scopedSamples(env.samples, scope) : null;
  const scoped: InstrumentEnv = Object.create(env, {
    staging: { value: scopedStaging(env.staging, scope) },
    tap: { value: (): void => { if (scope.staging && scope.live) env.tap?.(); } },
    samples: { value: scope.samples },
    raf: {
      value: (fn: FrameRequestCallback): number => {
        if (!scope.live) return 0;
        const id = env.raf((t) => {
          scope.frames.delete(id);
          if (scope.live) fn(t);
        });
        scope.frames.add(id);
        return id;
      },
    },
    cancelRaf: { value: (id: number): void => { scope.frames.delete(id); env.cancelRaf(id); } },
    timeout: {
      value: (fn: () => void, ms: number): (() => void) => {
        if (!scope.live) return () => {};
        const t = setTimeout(() => { scope.timers.delete(t); if (scope.live) fn(); }, ms);
        scope.timers.add(t);
        return () => { clearTimeout(t); scope.timers.delete(t); };
      },
    },
    redraw: { value: (): void => { if (scope.live) env.redraw?.(); } },
    say: {
      value: (host: HTMLElement, text: string, opts: Parameters<InstrumentEnv['say']>[2]): HTMLElement => {
        if (scope.live) scope.saidIn.add(host);
        return env.say(host, text, opts);
      },
    },
    listen: {
      value: (target: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions | boolean): (() => void) => {
        if (!scope.live) return () => {};
        target.addEventListener(type, fn, opts);
        const off = (): void => { target.removeEventListener(type, fn, opts); scope.listeners.delete(off); };
        scope.listeners.add(off);
        return off;
      },
    },
  }) as InstrumentEnv;
  const mark = h('div', { class: 'alius-instrument', 'data-instrument': def.id }); // a plain flag: the glossary reaches it through the stop word, the dial and the contact
  env.layers.moment.append(mark);
  const dial = env.root.querySelector<HTMLElement>('.alius-stage-dial');
  if (dial) { scope.dial = claimStyles(dial, ['@data-instrument']); writeClaimed(scope.dial, '@data-instrument', def.id); } // R6: the dial dims
  current = { key, runId: run.id, def, env, run: null, scope, mark, finishing: null };
  syncMark(current);
  current.run = isPostureDef(def) ? def.start(scoped, run as PostureRun) : def.start(scoped, run as PhysicsRun); // a throw is caught by syncInstruments
}

/** Stops the instrument that runs (if any) at once: it is told to stop, then the host undoes whatever it left (see the module's note). */
export function unmountInstruments(): void {
  const m = current;
  if (!m) return;
  current = null;
  if (m.finishing?.timer) clearTimeout(m.finishing.timer);
  try {
    m.run?.stop();
  } catch (err) {
    warnOnce(m.def.id, 'stop', err);
  } finally {
    const s = m.scope;
    s.staging = false;
    s.live = false;
    for (const id of s.frames) m.env.cancelRaf(id);
    s.frames.clear();
    for (const t of s.timers) clearTimeout(t);
    s.timers.clear();
    for (const off of [...s.listeners]) off();
    for (const l of s.loops) { try { l.stop(0); } catch { /* already stopped */ } }
    s.loops.clear();
    for (const n of s.sources) {
      try { n.stop(); } catch { /* not started, or already stopped */ }
      try { n.disconnect(); } catch { /* not connected */ }
    }
    s.sources.clear();
    if (s.dulled) m.env.samples?.setWorldDull(0);
    if (s.samples) heartStop(s.samples); // the heart this mount ticked (kept per view: another mount's is not touched)
    for (const host of s.saidIn) unsay(host);
    s.saidIn.clear();
    m.mark.remove();
    m.env.gauge.clear();
    for (const sn of s.snapshot) restore(sn);
    if (s.dial) releaseClaim(s.dial);
    s.dial = null;
  }
}

/**
 * A chat switch (`resetSceneStage`): stops the instrument and forgets which mount failed. The failed mount is keyed by scene and run id,
 * which repeat across campaigns, so it must not keep the next chat's instrument from starting.
 */
export function resetInstruments(): void {
  unmountInstruments();
  failed = null;
}

/**
 * The run is gone from the state. The instrument may play its end: once the outcome is known (it is recorded by the staging controller,
 * which may hear of it a microtask after the redraw), `finish` says for how long; the staging is dead meanwhile.
 */
function beginFinish(m: Mounted): void {
  m.scope.staging = false;
  const f: { timer: ReturnType<typeof setTimeout> | null } = { timer: null };
  m.finishing = f;
  queueMicrotask(() => {
    if (current !== m || m.finishing !== f) return;
    let ms = 0;
    if (isPostureDef(m.def)) { // P16b: a hold has no `physics_outcome`: the instrument knows whether it ended the hold itself (a stop word ends it with no end to play)
      try {
        ms = Math.max(0, Number((m.run as PostureInstrumentRun | null)?.finish?.()) || 0);
      } catch (err) {
        warnOnce(m.def.id, 'finish', err);
        ms = 0;
      }
    } else {
      const end: PhysicsEnd | null = m.env.staging.outcome?.(m.runId) ?? null;
      const play = m.run as InstrumentRun | null;
      if (end && end.result !== 'stopped' && play?.finish) { // the stop word ends it at once: no end is played after it
        try {
          ms = Math.max(0, Number(play.finish(end)) || 0);
        } catch (err) {
          warnOnce(m.def.id, 'finish', err);
          ms = 0;
        }
      }
    }
    if (ms <= 0) unmountInstruments();
    else f.timer = setTimeout(() => { if (current === m) unmountInstruments(); }, ms);
  });
}

/**
 * Draws (or stops) the instrument for this run. Returns true when an instrument is drawing the run (the scene then draws no card); false
 * when the card should be drawn (no run, real time off, the interaction switched off, no instrument matches, or the instrument failed).
 * A run that ended leaves its instrument playing its end (false: the run's card is gone too).
 */
export function syncInstruments(env: InstrumentEnv, run: PhysicsRun | undefined, posture?: PostureRun): boolean {
  const state = env.state();
  if (current && current.env !== env) unmountInstruments(); // another scene's layers
  if (!run) {
    // P16b Task 23: no contact physics is drawn: the hold of a posture plays, when an instrument can
    const hold = posture !== undefined && state ? postureInstrumentFor(posture, state, env.registries, env.settings()) : null;
    if (posture !== undefined && hold) return syncPosture(env, hold, posture);
    if (current && !current.finishing && state?.scene && current.key.startsWith(`${state.scene.id}|`)) beginFinish(current);
    else if (current && !current.finishing) unmountInstruments();
    return false;
  }
  const found = state ? instrumentFor(run, state, env.registries, env.settings()) : null;
  const def = found && drawable(found, env, run) ? found : null;
  if (!def) {
    unmountInstruments();
    return false;
  }
  const key = `${state.scene?.id ?? ''}|${run.id}`;
  const mountKey = `${key}|${def.id}`;
  if (failed === mountKey) {
    unmountInstruments();
    return false;
  }
  if (current && current.key === key && current.def === def && !current.finishing) {
    syncMark(current);
    try {
      (current.run as InstrumentRun | null)?.update(run);
      return true;
    } catch (err) {
      warnOnce(def.id, 'update', err);
      failed = mountKey;
      unmountInstruments();
      return false;
    }
  }
  unmountInstruments();
  try {
    mount(env, def, run, key);
    return true;
  } catch (err) {
    warnOnce(def.id, 'start', err);
    failed = mountKey;
    unmountInstruments();
    return false;
  }
}

/** The hold of a posture drawn by its instrument: mounted once per hold (a scene's run ids repeat, so the key carries the scene id), updated on each redraw. */
function syncPosture(env: InstrumentEnv, def: PostureInstrumentDef, run: PostureRun): boolean {
  const state = env.state();
  const key = `${state.scene?.id ?? ''}|${run.id}`;
  const mountKey = `${key}|${def.id}`;
  if (failed === mountKey) {
    unmountInstruments();
    return false;
  }
  if (current && current.key === key && current.def === def && !current.finishing) {
    syncMark(current);
    try {
      (current.run as PostureInstrumentRun | null)?.update(run);
      return true;
    } catch (err) {
      warnOnce(def.id, 'update', err);
      failed = mountKey;
      unmountInstruments();
      return false;
    }
  }
  unmountInstruments();
  try {
    mount(env, def, run, key);
    return true;
  } catch (err) {
    warnOnce(def.id, 'start', err);
    failed = mountKey;
    unmountInstruments();
    return false;
  }
}
