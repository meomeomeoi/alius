/** A fixture for the fidelity test (P10e-e Task 6): small ports of breath.html, one of them changed on purpose. */
// the prototype's clamp, its bounds swapped (an undeclared difference)
export const clamp = (x: number, a: number, b: number): number => Math.min(a, Math.max(b, x));
// the prototype's lerp, formatted otherwise and typed (no difference)
export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t;
export const SEAT_BODY: Array<[number, number]> = [[0.57, -1.6]];
