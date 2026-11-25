/**
 * P10e-e kit: corner cutting, copied from `docs/prototypes/weight.html` (the same function as breath.html's; JS → TS: types only). One call
 * is one pass (each edge cut at ¼ and ¾, so a polygon of n points becomes 2n); three passes make any polygon a smooth outline without
 * overshoot (`chaikin(chaikin(chaikin(pts)))`, as the prototypes call it).
 */
export type Pt = [number, number];

export function chaikin(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; out.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25], [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]); }
  return out;
}
