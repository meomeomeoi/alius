/**
 * P15a: two physics at once (plan R13, spec §16.6). Each physics owns its inputs; when two run, the inputs are routed to the owner and the
 * conflicts are fixed rules read by interaction type (never by physics id): holding the breath steadies the weight, breathing through the mouth
 * in an opening counts as a catch and is noticed. Pure: nothing here draws.
 */
import type { InteractionType } from '../blocking/types';
import type { InputKind, SegmentInput, SegmentPlan } from './state';

/** The inputs each interaction owns. A passive physics owns none. */
export const OWNS: Record<InteractionType, readonly InputKind[]> = {
  timing: ['breathe', 'gap_breath', 'strain'], hold: ['hold', 'shift_weight', 'uneven'], decision: ['mouth_breath', 'inhale', 'scatter'], order: ['part'], gesture: ['ask_rest'], passive: [],
};

/** The conflicts of a pair, by interaction (a pair absent from the table has none: they only share the beats). */
export const COMBINE_RULES = [
  { pair: ['timing', 'hold'], rule: 'steady' }, // a beat without a breath (the breath held) reduces the strength drain by 25 %
  { pair: ['timing', 'decision'], rule: 'mouth_in_opening' }, // a mouth breath in a real opening counts as caught but is noticed (0.6)
] as const;
export const STEADY_DRAIN = 0.75;

const has = (a: InteractionType, b: InteractionType, rule: (typeof COMBINE_RULES)[number]['rule']): boolean =>
  COMBINE_RULES.some((r) => r.rule === rule && ((r.pair[0] === a && r.pair[1] === b) || (r.pair[0] === b && r.pair[1] === a)));

export interface Merged {
  main: SegmentInput[];
  second: SegmentInput[];
  /** Mouth breaths that were noticed by rule (each is rolled at `TUNING.physics.saturation.noticed`). */
  notices: number;
  /** The beats on which the breath was held, when a hold runs with a timing physics: the strength drains less there. */
  steady: number[];
}

/** Routes each input to the physics that owns it and applies the conflicts of the pair. */
export function mergeInputs(mainI: InteractionType, secondI: InteractionType, plan: SegmentPlan, inputs: SegmentInput[]): Merged {
  const main = inputs.filter((i) => OWNS[mainI].includes(i.kind));
  const second = inputs.filter((i) => OWNS[secondI].includes(i.kind) && !main.includes(i));
  const timing = mainI === 'timing' ? 'main' : secondI === 'timing' ? 'second' : null;
  let notices = 0;
  if (timing !== null && has(mainI, secondI, 'mouth_in_opening')) {
    const into = timing === 'main' ? main : second;
    for (const i of inputs) {
      const o = plan.beats[i.beat]?.opening;
      if (i.kind === 'mouth_breath' && o !== undefined && o.false !== true) {
        into.push({ beat: i.beat, kind: 'breathe' });
        notices += 1;
      }
    }
  }
  const steady: number[] = [];
  if (timing !== null && has(mainI, secondI, 'steady')) {
    const breathing = new Set(inputs.filter((i) => i.kind === 'breathe' || i.kind === 'gap_breath' || i.kind === 'mouth_breath').map((i) => i.beat));
    for (let b = 0; b < plan.beats.length; b++) if (!breathing.has(b)) steady.push(b);
  }
  return { main, second, notices, steady };
}
