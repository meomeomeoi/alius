/**
 * P15a: her gaze, the commander's relief inputs and the noise of the body (plan R13, spec §16.4–§16.5). Her attention is planned per beat with
 * the segment (from her activity and her style) and read by the player only from the `watch` / `look_away` cues; a relief input is a cheat
 * that she may catch, by the attention of that beat and her `reading` skill. Every slip makes a sound. No number of any of it reaches a reading.
 */
import type { Rng } from '../rng';
import { TUNING } from '../tuning';
import type { Attention, PhysicsStyle, SegmentResult } from './state';
import { leadStyle } from './style';

const G = TUNING.physics.gaze;

/**
 * Her attention for each of `n` beats: by her activity's `attention` word (`on_commander`, `divided`, `elsewhere`, `none`; absent reads as
 * `on_commander`), and a `clinical` holder is always watching. Draws one number a beat (none for a clinical holder).
 */
export function attentionPlan(n: number, attention: string | undefined, style: PhysicsStyle, rng: Rng, weights?: [number, number]): Attention[] {
  // P10e-e R25: in her frame the weights are her presence's mix (`weights`), a clinical holder included; one draw a beat as always
  if (weights === undefined && leadStyle(style).key === 'clinical') return Array.from({ length: n }, () => 'watching' as const);
  const [w, g] = weights ?? G.attention[attention ?? 'on_commander'] ?? G.attention.on_commander!;
  return Array.from({ length: n }, () => {
    const x = rng.float();
    return x < w! ? 'watching' : x < w! + g! ? 'glancing' : 'busy';
  });
}

/** The cue that gives her attention away on a beat where it changed: she is watching, or she looks away. Glancing gives nothing. */
export function attentionCue(prev: Attention | undefined, now: Attention): 'watch' | 'look_away' | null {
  if (now === prev || now === 'glancing') return null;
  return now === 'watching' ? 'watch' : 'look_away';
}

/** Whether she catches a relief input made on a beat of this attention: 0.6 / 0.25 / 0.08, × (1 + 0.1 × her `reading` level). One draw. */
export function cheatRoll(rng: Rng, attention: Attention, reading: number): boolean {
  return rng.chance(G.caught[attention] * (1 + G.readingMult * reading));
}

export type NoiseKind = 'gasp' | 'creak' | 'rustle' | 'cough';
/** What kind of sound a slip, a relief or a reflex makes; loudness is 1 × (1 − the commander's stillness) (stillness reads 0 until P16b). */
export function noiseOf(source: 'miss' | 'slip' | 'relief' | 'spill' | 'reflex', stillness = 0): { loudness: number; kind: NoiseKind } {
  const kind: NoiseKind = source === 'miss' ? 'gasp' : source === 'slip' ? 'creak' : source === 'relief' ? 'rustle' : 'cough';
  return { loudness: 1 * (1 - stillness), kind };
}

/** The sounds of one segment: a gasp for each missed breath at low air, a creak or a cough for each slip, a rustle for each relief taken. */
export function segmentNoise(result: Pick<SegmentResult, 'gasps' | 'slips' | 'reliefs'>, interaction: string, stillness = 0): Array<{ kind: NoiseKind; loudness: number }> {
  const out = new Map<NoiseKind, number>();
  const add = (source: Parameters<typeof noiseOf>[0], n: number): void => {
    if (n <= 0) return;
    const s = noiseOf(source, stillness);
    out.set(s.kind, (out.get(s.kind) ?? 0) + s.loudness * n);
  };
  add('miss', result.gasps);
  add(interaction === 'timing' ? 'spill' : 'slip', result.slips);
  add('relief', result.reliefs);
  return [...out].map(([kind, loudness]) => ({ kind, loudness }));
}

/**
 * The chance that she catches a cheat made at a moment of unknown attention: the three catch chances averaged over her activity's attention (a
 * `clinical` holder is always watching), × (1 + 0.1 × `reading`). One draw instead of two.
 */
export function averageCaught(attention: string | undefined, style: PhysicsStyle, reading: number): number {
  const [w, g, b] = (leadStyle(style).key === 'clinical' ? [1, 0, 0] : G.attention[attention ?? 'on_commander'] ?? G.attention.on_commander!) as number[];
  return Math.min(1, (w! * G.caught.watching + g! * G.caught.glancing + b! * G.caught.busy) * (1 + G.readingMult * reading));
}
