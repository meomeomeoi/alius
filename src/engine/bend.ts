/**
 * P15b: how a style's number bends by a step of one of her manner axes. A leaf (no imports) so the physics layer, which imports nothing of the
 * dynamic, bends its rows with the same helper as the practices (`dynamic/manner.ts` re-exports it). At a step of 0 every bend returns its base exactly.
 */

/**
 * How a number bends: `scale` multiplies by `1 + step × k` (never below 0), then caps the result at `cap`; `shift` adds `step × k`; `gate` is
 * 1 when the step reaches the threshold (`step >= gate` for a positive one, `step <= gate` for a negative one) and 0 otherwise.
 */
export type BendKind = { scale: number; cap?: number } | { shift: number } | { gate: number };

/** A style's number moved by one axis step. `step === 0` returns `base` exactly (a gate: 0). */
export function bend(base: number, step: number, kind: BendKind): number {
  if ('gate' in kind) {
    if (step === 0 || kind.gate === 0) return 0;
    return kind.gate > 0 ? (step >= kind.gate ? 1 : 0) : (step <= kind.gate ? 1 : 0);
  }
  if (step === 0) return base;
  if ('shift' in kind) return base + step * kind.shift;
  const out = base * Math.max(0, 1 + step * kind.scale);
  return kind.cap === undefined ? out : Math.min(kind.cap, out);
}
