/** P10e-e kit: the prototypes' small helpers, copied (breath.html, weight.html, her_activity.html define them alike). */
export const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (e0: number, e1: number, x: number): number => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
