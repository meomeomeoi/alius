import type { AliusSettings } from '../../settings';
import { TUNING } from '../../engine/tuning';
import { MUFFLE_GAIN, NIGHT_GAIN, type AudioContextLike, type ParamLike } from './sound';

/**
 * P10e-e: the recorded sounds of the instruments (the prototypes' `SAMPLE_URLS`, shipped under `assets/sounds/`).
 *
 * The bus structure is the prototypes' own: a master gain into the destination; the **world** bus, a lowpass that the
 * instrument dulls (`setWorldDull`: `16000·(380/16000)^f`), into the master; the **body** bus (the commander's breath,
 * the heart, the slap), a gain straight into the master, never dull. The player's level (volume, mute, night, muffle,
 * the sensory hold, as `createSound` computes it) sits on the master, so a sound an instrument synthesises into a bus
 * follows it too.
 */

/** The slice of WebAudio the sample layer uses, so tests can fake it. */
export interface SampleSourceLike {
  buffer: unknown;
  loop?: boolean;
  playbackRate: ParamLike;
  connect(node: unknown): unknown;
  start(when?: number, offset?: number, duration?: number): void;
  stop(when?: number): void;
}
export interface SampleContextLike extends Omit<AudioContextLike, 'createBufferSource'> {
  createBufferSource(): SampleSourceLike;
  createBiquadFilter(): { type: string; frequency: ParamLike; Q: ParamLike; connect(node: unknown): unknown };
  createStereoPanner(): { pan: ParamLike; connect(node: unknown): unknown };
}

export type SampleBus = 'world' | 'body';

export interface SampleOptions {
  /** The sound's own gain (before the player's level). Default 0.5, as the prototypes' `play`. */
  gain?: number;
  /** Stereo position, −1 … 1. */
  pan?: number;
  /** Playback rate. */
  rate?: number;
  /** Seconds from now. */
  at?: number;
  /** Seconds into the file. */
  offset?: number;
  /** Seconds of the file played (faded out over its last 30 ms, as the prototypes do). */
  duration?: number;
  /** Default `world`. */
  bus?: SampleBus;
}

export interface SampleLoop {
  setGain(g: number, ms?: number): void;
  setRate(r: number, ms?: number): void;
  stop(ms?: number): void;
}

export interface SampleSound {
  /** Plays a file named from the repo root (`'assets/sounds/ha/soft1.ogg'`). Silent when muted, before the first gesture, or when the file cannot be had. */
  play(file: string, opts?: SampleOptions): void;
  /** Loops a file until `stop`. The handle works (and does nothing) even when the sound cannot play. */
  loop(file: string, opts?: SampleOptions): SampleLoop;
  /** The context, made on demand once the player has touched the page; null before that or after dispose. */
  ctx(): AudioContext | null;
  /** A bus's input node, for sounds an instrument synthesises; null without a context. */
  bus(name: SampleBus): AudioNode | null;
  /** 0 clear … 1 the prototypes' fully dull world: the world bus's lowpass at `16000·(380/16000)^f`. */
  setWorldDull(f: number): void;
  /** P10b / P15a / P16: the same gains `createSound` applies (night, hooded, a sensory hold). */
  setNight(on: boolean): void;
  setMuffle(on: boolean): void;
  setSensory(on: boolean): void;
  dispose(): void;
}

export interface SampleDeps {
  settings: () => AliusSettings;
  assetUrl: (path: string) => string;
  /** Makes the AudioContext (tests); the browser's own by default. */
  audio?: () => SampleContextLike;
}

/** A file that could not be fetched or decoded is not asked for again for this long. */
export const FAILED_RETRY_MS = 30_000;
/** The world bus's lowpass, clear and fully dull (the prototypes'). */
const CLEAR_HZ = 16000;
const DULL_HZ = 380;
const SILENCE = 0.0001;
const FADE_S = 0.03;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function browserAudio(): SampleContextLike {
  const g = globalThis as unknown as { AudioContext?: new () => SampleContextLike; webkitAudioContext?: new () => SampleContextLike };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) throw new Error('no AudioContext');
  return new Ctor();
}

interface Graph {
  c: SampleContextLike;
  master: { gain: ParamLike; connect(node: unknown): unknown };
  world: { type: string; frequency: ParamLike; Q: ParamLike; connect(node: unknown): unknown };
  body: { gain: ParamLike; connect(node: unknown): unknown };
}

type Cached = { buffer: Promise<unknown> } | { failedAt: number };

export function createSamples(deps: SampleDeps): SampleSound {
  let graph: Graph | null = null;
  let unavailable = false;
  let disposed = false;
  let gestured = false;
  let dull = 0;
  let night = false;
  let muffle = false;
  let sensory = false;
  const files = new Map<string, Cached>();
  const loops = new Set<{ stopNow(): void }>();

  const level = (): number => {
    const s = deps.settings();
    return s.soundMuted ? 0 : (s.soundVolume / 100) * (night ? NIGHT_GAIN : 1) * (muffle ? MUFFLE_GAIN : 1) * (sensory ? TUNING.practice.hold.sensoryVolume : 1);
  };
  const dullHz = (): number => CLEAR_HZ * Math.pow(DULL_HZ / CLEAR_HZ, clamp(dull, 0, 1));

  const GESTURES = ['pointerdown', 'keydown', 'touchstart'] as const;
  const userActive = (): boolean => gestured || (typeof navigator !== 'undefined' && navigator.userActivation?.hasBeenActive === true);
  const stopWatching = (): void => {
    if (typeof document !== 'undefined') for (const t of GESTURES) document.removeEventListener(t, onGesture, true);
  };
  function onGesture(): void {
    gestured = true;
    stopWatching();
  }
  if (typeof document !== 'undefined') for (const t of GESTURES) document.addEventListener(t, onGesture, true);

  /** The graph, made on the first call after a gesture; the master follows the player's level on every call. */
  function audio(): Graph | null {
    if (disposed || unavailable || !userActive()) return null;
    if (!graph) {
      let c: SampleContextLike;
      try {
        c = (deps.audio ?? browserAudio)();
      } catch {
        unavailable = true;
        return null;
      }
      const master = c.createGain();
      master.connect(c.destination);
      const world = c.createBiquadFilter();
      world.type = 'lowpass';
      world.frequency.value = dullHz();
      world.Q.value = 0.4;
      world.connect(master);
      const body = c.createGain();
      body.gain.value = 1;
      body.connect(master);
      graph = { c, master, world, body };
    }
    if (graph.c.state === 'suspended') void graph.c.resume?.()?.catch?.(() => undefined);
    graph.master.gain.value = level();
    return graph;
  }

  function refresh(): void {
    if (graph && !disposed) graph.master.gain.value = level();
  }

  /** The decoded buffer, fetched once; a failure is remembered for `FAILED_RETRY_MS` (null then). */
  function load(c: SampleContextLike, file: string): Promise<unknown> | null {
    const cached = files.get(file);
    if (cached && 'buffer' in cached) return cached.buffer;
    if (cached && Date.now() - cached.failedAt < FAILED_RETRY_MS) return null;
    const url = deps.assetUrl(file);
    const buffer = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`audio ${file}: ${res.status}`);
      return c.decodeAudioData(await res.arrayBuffer());
    })();
    files.set(file, { buffer });
    buffer.catch(() => files.set(file, { failedAt: Date.now() }));
    return buffer;
  }

  /** source → its gain → (panner) → the bus. */
  function wire(g: Graph, buffer: unknown, opts: SampleOptions, gain: number): { src: SampleSourceLike; gn: { gain: ParamLike } } {
    const { c } = g;
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = opts.rate ?? 1;
    const gn = c.createGain();
    gn.gain.value = gain;
    src.connect(gn);
    let out: { connect(node: unknown): unknown } = gn;
    if (opts.pan) {
      const p = c.createStereoPanner();
      p.pan.value = clamp(opts.pan, -1, 1);
      gn.connect(p);
      out = p;
    }
    out.connect(opts.bus === 'body' ? g.body : g.world);
    return { src, gn };
  }

  const silentLoop: SampleLoop = { setGain() {}, setRate() {}, stop() {} };

  return {
    play(file, opts = {}) {
      if (level() <= 0) return;
      const g = audio();
      if (!g) return;
      const pending = load(g.c, file);
      if (!pending) return;
      pending.then(
        (buffer) => {
          if (disposed || !graph) return;
          const { c } = graph;
          const gain = opts.gain ?? 0.5;
          const rate = opts.rate ?? 1;
          const t = c.currentTime + Math.max(0, opts.at ?? 0);
          const offset = opts.offset ?? 0;
          const { src, gn } = wire(graph, buffer, opts, gain);
          const whole = (buffer as { duration?: number }).duration ?? 0;
          const len = opts.duration ?? Math.max(0, whole - offset);
          if (opts.duration) {
            gn.gain.setValueAtTime(gain, t + opts.duration / rate - FADE_S);
            gn.gain.linearRampToValueAtTime(SILENCE, t + opts.duration / rate);
          }
          src.start(t, offset, len + 0.05);
        },
        () => undefined, // a missing file is silent
      );
    },

    loop(file, opts = {}) {
      if (level() <= 0) return silentLoop;
      const g = audio();
      if (!g) return silentLoop;
      const pending = load(g.c, file);
      if (!pending) return silentLoop;
      let gain = opts.gain ?? 0.5;
      let rate = opts.rate ?? 1;
      let stopped = false;
      let live: { src: SampleSourceLike; gn: { gain: ParamLike } } | null = null;
      const entry = {
        stopNow() {
          stopped = true;
          try {
            live?.src.stop();
          } catch {
            // already stopped
          }
          loops.delete(entry);
        },
      };
      loops.add(entry);
      pending.then(
        (buffer) => {
          if (stopped || disposed || !graph) return;
          live = wire(graph, buffer, { ...opts, rate }, gain);
          live.src.loop = true;
          live.src.start(graph.c.currentTime + Math.max(0, opts.at ?? 0), opts.offset ?? 0);
        },
        () => loops.delete(entry),
      );
      const ramp = (p: ParamLike, v: number, ms?: number): void => {
        if (!graph) return;
        const t = graph.c.currentTime;
        if (ms && ms > 0) {
          p.setValueAtTime(p.value, t);
          p.linearRampToValueAtTime(v, t + ms / 1000);
        } else p.value = v;
      };
      return {
        setGain(v, ms) {
          gain = v;
          if (live && !stopped) ramp(live.gn.gain, v, ms);
        },
        setRate(r, ms) {
          rate = r;
          if (live && !stopped) ramp(live.src.playbackRate, r, ms);
        },
        stop(ms) {
          if (stopped) return;
          if (!live || !graph || !ms || ms <= 0) return entry.stopNow();
          stopped = true;
          loops.delete(entry);
          const t = graph.c.currentTime;
          live.gn.gain.setValueAtTime(live.gn.gain.value, t);
          live.gn.gain.linearRampToValueAtTime(SILENCE, t + ms / 1000);
          live.src.stop(t + ms / 1000);
        },
      };
    },

    ctx() {
      return (audio()?.c ?? null) as unknown as AudioContext | null;
    },

    bus(name) {
      const g = audio();
      if (!g) return null;
      return (name === 'body' ? g.body : g.world) as unknown as AudioNode;
    },

    setWorldDull(f) {
      dull = clamp(f, 0, 1);
      if (graph && !disposed) graph.world.frequency.value = dullHz();
    },

    setNight(on) {
      night = on;
      refresh();
    },
    setMuffle(on) {
      muffle = on;
      refresh();
    },
    setSensory(on) {
      sensory = on;
      refresh();
    },

    dispose() {
      if (disposed) return;
      for (const l of [...loops]) l.stopNow();
      stopWatching();
      disposed = true;
      const c = graph?.c;
      graph = null;
      try {
        void c?.close?.()?.catch?.(() => undefined);
      } catch {
        // nothing to close
      }
    },
  };
}
