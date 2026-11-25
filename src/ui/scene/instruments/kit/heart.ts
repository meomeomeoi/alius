/**
 * P10e-e kit: the heart, copied from `docs/prototypes/breath.html` (`heartTick`, `thump`): lub-dub on the body bus (never dulled with the
 * world), scheduled a little ahead on the audio clock; the visual pulse reads the same beats (`heartLastBeat`). The wiring differs where the
 * prototype reads its page (declared in `fidelity.json`): the audio context and the body bus are the `SampleSound`'s, the rate is passed in
 * (`bpm`, the instrument computes it from its gauge as its README says) and so is the air that sets the loudness (default full), the state is
 * kept per `SampleSound`, and the timers of the visual pulse are cleared by `heartStop` (an instrument's stop).
 */
import type { SampleSound } from '../../../sound/samples';
import { lerp, smooth } from './math';

interface HeartState { nextBeat: number | null; lastBeatMs: number; stopped: boolean; timers: Set<ReturnType<typeof setTimeout>> }
const hearts = new WeakMap<SampleSound, HeartState>();
const heartOf = (samples: SampleSound): HeartState => {
  let h = hearts.get(samples);
  if (!h) hearts.set(samples, (h = { nextBeat: null, lastBeatMs: -1e9, stopped: false, timers: new Set() }));
  return h;
};

function thump(ctx: AudioContext, at: number, gain: number, f0: number = 55, dest: AudioNode): void {
  const t = at;
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + 0.14);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.25);
}

/** Schedules the beats due in the next 120 ms at `bpm`; call it every frame. Nothing without an audio context or a body bus. */
export function heartTick(samples: SampleSound, bpm: number, air: number = 100): void {
  const ctx = samples.ctx(), body = samples.bus('body');
  const heart = heartOf(samples);
  if (!ctx || !body || heart.stopped) return;
  if (heart.nextBeat === null) heart.nextBeat = ctx.currentTime + 0.3;
  while (heart.nextBeat < ctx.currentTime + 0.12) {
    const period = 60 / bpm;
    const loud = lerp(0.35, 0.95, smooth(80, 10, air));
    thump(ctx, heart.nextBeat, loud, 52, body); thump(ctx, heart.nextBeat + Math.max(0.2, period * 0.3), loud * 0.6, 46, body);
    const delay = (heart.nextBeat - ctx.currentTime) * 1000;
    const t = setTimeout(() => { heart.timers.delete(t); heart.lastBeatMs = performance.now(); }, Math.max(0, delay));
    heart.timers.add(t);
    heart.nextBeat += period;
  }
}

/** When the last beat sounded (`performance.now()`), for the visual pulse. */
export function heartLastBeat(samples: SampleSound): number {
  return heartOf(samples).lastBeatMs;
}

/** The heart stops: no further beat is scheduled and the pulse's timers go (a later `heartTick` starts it afresh). */
export function heartStop(samples: SampleSound): void {
  const h = hearts.get(samples);
  if (!h) return;
  for (const t of h.timers) clearTimeout(t);
  hearts.delete(samples);
}
