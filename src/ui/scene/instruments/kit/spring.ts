/**
 * P10e-e kit: the spring step of `docs/prototypes/weight.html` (its frame loop, lines "the springs are stepped in pieces of at most 8 ms").
 * The prototype steps its springs inline (`G.ctlV += (k * (target - G.ctl) - d * G.ctlV) * hs; G.ctl += G.ctlV * hs;`); this is the same
 * step over one spring `s` (`x` the position, `v` the speed). One Euler step of a long frame diverges (fixed 2026-11-23: the balance ran
 * off to millions); in pieces of at most 8 ms the motion is the same as at 60 fps.
 */
export interface Spring { x: number; v: number }

export function stepSpring(s: Spring, target: number, k: number, d: number, dtMs: number): void {
  const h = dtMs / 1000;
  const n = Math.max(1, Math.ceil(h / 0.008)), hs = h / n;
  for (let i = 0; i < n; i++) {
    s.v += (k * (target - s.x) - d * s.v) * hs; s.x += s.v * hs;
  }
}
