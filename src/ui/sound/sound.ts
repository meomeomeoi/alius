import type { SOUND_IDS } from '../../content/schemas';
import type { Registries } from '../../content/types';
import type { AliusSettings } from '../../settings';

export type SoundId = (typeof SOUND_IDS)[number];

/** The slice of WebAudio the player uses, so tests can fake it. */
export interface ParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
}
export interface AudioContextLike {
  currentTime: number;
  destination: unknown;
  state?: string;
  resume?(): Promise<void>;
  close?(): Promise<void>;
  createOscillator(): { type: string; frequency: ParamLike; connect(node: unknown): unknown; start(when?: number): void; stop(when?: number): void };
  createGain(): { gain: ParamLike; connect(node: unknown): unknown };
  createBufferSource(): { buffer: unknown; connect(node: unknown): unknown; start(when?: number): void };
  decodeAudioData(data: ArrayBuffer): Promise<unknown>;
}

export interface SoundDeps {
  settings: () => AliusSettings;
  registries: () => Registries;
  /** Resolves a file shipped with the extension (an entry's `file`). */
  assetUrl?: (path: string) => string;
  /** Makes the AudioContext (tests); the browser's own by default. */
  audio?: () => AudioContextLike | null;
}

export interface Sound {
  play(id: SoundId): void;
  /** Starts (or retunes) the ambient hum when `ambientHum` is on and the sound is not muted; otherwise stops it. */
  startHum(): void;
  stopHum(): void;
  /** P10b: while it is night every sound and the hum play at `NIGHT_GAIN` of their gain. */
  setNight(on: boolean): void;
  /** P15a: while the commander is hooded every sound and the hum play at `MUFFLE_GAIN` of their gain. */
  setMuffle(on: boolean): void;
  dispose(): void;
}

/** P10b: the share of its gain a sound keeps at night (a UI constant, not a setting). */
export const NIGHT_GAIN = 0.5;

/** P15a: the share of its gain a sound keeps while the commander's ears are covered. */
export const MUFFLE_GAIN = 0.4;

/** Typing ticks come at most this often. */
const TYPING_GAP_MS = 60;
const ATTACK_S = 0.005;
const SILENCE = 0.0001;

function browserAudio(): AudioContextLike | null {
  const g = globalThis as unknown as { AudioContext?: new () => AudioContextLike; webkitAudioContext?: new () => AudioContextLike };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

/**
 * The UI sounds. Nothing is created until the first sound is asked for (always inside a user gesture, so the browser
 * lets it play). Every sound is synthesized from its registry entry; an entry with a `file` plays that file instead, and
 * falls back to the synth when it cannot be loaded. Effective peak gain = volume / 100 × the entry's gain; muted = silent.
 */
export function createSound(deps: SoundDeps): Sound {
  let ctx: AudioContextLike | null = null;
  let unavailable = false;
  let disposed = false;
  let lastTick = -Infinity;
  let hum: { stop(): void; gain: ParamLike } | null = null;
  /** The player has pressed or touched something: browsers only let audio start after that (and warn in the console otherwise). */
  let gestured = false;
  /** The hum was asked for before the first gesture: it starts with it. */
  let humWanted = false;
  const files = new Map<string, Promise<unknown>>();

  let night = false;
  let muffle = false;
  const level = (): number => {
    const s = deps.settings();
    return s.soundMuted ? 0 : (s.soundVolume / 100) * (night ? NIGHT_GAIN : 1) * (muffle ? MUFFLE_GAIN : 1);
  };

  const GESTURES = ['pointerdown', 'keydown', 'touchstart'] as const;
  const userActive = (): boolean => gestured || (typeof navigator !== 'undefined' && navigator.userActivation?.hasBeenActive === true);
  const stopWatching = (): void => {
    if (typeof document !== 'undefined') for (const t of GESTURES) document.removeEventListener(t, onGesture, true);
  };
  function onGesture(): void {
    gestured = true;
    stopWatching();
    if (humWanted) api.startHum(); // asked for before anyone touched the page: it starts now
  }
  if (typeof document !== 'undefined') for (const t of GESTURES) document.addEventListener(t, onGesture, true);

  function audio(): AudioContextLike | null {
    if (disposed || unavailable || !userActive()) return null;
    if (!ctx) {
      try {
        ctx = (deps.audio ?? browserAudio)();
      } catch {
        ctx = null;
      }
      if (!ctx) {
        unavailable = true;
        return null;
      }
    }
    if (ctx.state === 'suspended') void ctx.resume?.()?.catch?.(() => undefined);
    return ctx;
  }

  function synth(c: AudioContextLike, e: { wave: string; freq: number; endFreq?: number; ms: number }, peak: number): void {
    const t = c.currentTime;
    const dur = e.ms / 1000;
    const osc = c.createOscillator();
    osc.type = e.wave;
    osc.frequency.setValueAtTime(e.freq, t);
    if (e.endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(e.endFreq, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.min(ATTACK_S, dur / 2));
    g.gain.exponentialRampToValueAtTime(SILENCE, t + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  async function playFile(c: AudioContextLike, url: string, peak: number): Promise<void> {
    let decoded = files.get(url);
    if (!decoded) {
      decoded = (async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`audio ${url}: ${res.status}`);
        return c.decodeAudioData(await res.arrayBuffer());
      })();
      files.set(url, decoded);
    }
    const buffer = await decoded; // a failure is remembered: the next play goes straight to the synth
    const src = c.createBufferSource();
    src.buffer = buffer;
    const g = c.createGain();
    g.gain.setValueAtTime(peak, c.currentTime);
    src.connect(g);
    g.connect(c.destination);
    src.start();
  }

  function stopHum(): void {
    if (!hum) return;
    try {
      hum.stop();
    } catch {
      // already stopped
    }
    hum = null;
  }

  const api: Sound = {
    play(id) {
      if (id === 'hum') return; // the hum has its own switch (startHum)
      const entry = deps.registries().uiSounds.get(id);
      const volume = level();
      if (!entry || volume <= 0) return;
      if (id === 'typing') {
        const now = Date.now();
        if (now - lastTick < TYPING_GAP_MS) return;
        lastTick = now;
      }
      const c = audio();
      if (!c) return;
      const s = entry.synth as { wave: string; freq: number; endFreq?: number; ms: number; gain: number };
      const peak = volume * s.gain;
      const url = typeof entry.file === 'string' && deps.assetUrl ? deps.assetUrl(entry.file) : null;
      if (url) void playFile(c, url, peak).catch(() => synth(c, s, peak));
      else synth(c, s, peak);
    },

    startHum() {
      const volume = level();
      humWanted = deps.settings().ambientHum && volume > 0;
      if (!humWanted) return stopHum();
      if (!userActive()) return; // no context before a gesture; onGesture starts it
      const entry = deps.registries().uiSounds.get('hum');
      if (!entry) return;
      const s = entry.synth as { wave: string; freq: number; gain: number };
      if (hum) {
        hum.gain.value = volume * s.gain; // already humming: follow the volume
        return;
      }
      const c = audio();
      if (!c) return;
      const osc = c.createOscillator();
      osc.type = s.wave;
      osc.frequency.setValueAtTime(s.freq, c.currentTime);
      const g = c.createGain();
      g.gain.value = volume * s.gain;
      osc.connect(g);
      g.connect(c.destination);
      osc.start();
      hum = { stop: () => osc.stop(), gain: g.gain };
    },

    stopHum,

    setNight(on) {
      if (night === on) return;
      night = on;
      if (hum) api.startHum(); // a running hum follows at once
    },
    setMuffle(on) {
      if (muffle === on) return;
      muffle = on;
      if (hum) api.startHum(); // a running hum follows at once
    },
    dispose() {
      stopHum();
      stopWatching();
      humWanted = false;
      disposed = true;
      try {
        void ctx?.close?.()?.catch?.(() => undefined);
      } catch {
        // nothing to close
      }
    },
  };
  return api;
}
