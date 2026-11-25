/**
 * P10e-e kit: the dark of breath.html, copied as code (JS → TS: types only; names, bodies and numbers as in the prototype). Each shape paints
 * its opening (the air) in white on a low-resolution canvas and returns where her face, the tap mark and her hand go (fractions of the
 * frame). `seat` is the approved silhouette (author's ruling after five variants); the rejected `seat_x_*` variants are not ported. The
 * prototype's settings the shapes read (`S.angle`, `S.side`) are the module's `S`: an instrument sets them from its contact before drawing.
 */
import { chaikin, type Pt } from './chaikin';
import { clamp, lerp } from './math';

export type ShapeKind = 'slit' | 'gap' | 'lift' | 'slide' | 'seat' | 'squeeze' | 'wedge';
type Side = 'bottom' | 'top' | 'left' | 'right';
/** A soft mass's spring: `L` the lift (0 pressed down … 1 risen), `v` its speed, `k` its stiffness. */
export interface SoftSpring { L: number; v: number; k?: number }
export interface ShapeState { sway: number; sway2: number; squeeze: number; slideDir: number; slideY: number; sp: SoftSpring[]; t: number }
export interface ShapeOut { focus: Pt; lip: Pt; text: Pt; align?: 'left' | 'right' }
export type Shape = (g: CanvasRenderingContext2D, W: number, H: number, o: number, s: ShapeState) => ShapeOut;

/** The prototype's settings that the shapes read: the gap's tilt in degrees, the side a `lift` rises from and the side of a `wedge`. */
export const S: { angle: number; side: { lift: Side; slide: 'auto' | 'left' | 'right'; wedge: 'left' | 'right' } } = { angle: -14, side: { lift: 'bottom', slide: 'auto', wedge: 'right' } };

/* each shape paints its opening (the air) in white and returns where her face, the tap mark and her hand go (fractions of the screen) */
function sideFrame(g: CanvasRenderingContext2D, W: number, H: number, side: Side) {
  const rot = { bottom: 0, top: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 }[side] ?? 0;
  const swap = side === 'left' || side === 'right';
  const Wc = swap ? H : W, Hc = swap ? W : H;
  g.save(); g.translate(W / 2, H / 2); g.rotate(rot); g.translate(-Wc / 2, -Hc / 2);
  const map = ([x, y]: Pt): Pt => { const dx = x - Wc / 2, dy = y - Hc / 2; return [(W / 2 + dx * Math.cos(rot) - dy * Math.sin(rot)) / W, (H / 2 + dx * Math.sin(rot) + dy * Math.cos(rot)) / H]; };
  return { Wc, Hc, map, done: () => g.restore() };
}
/* a soft mass: a superellipse that flattens at the bottom as it presses (sq), with a slow wobble of its outline */
export const squashOf = (x: SoftSpring): number => clamp((1 - clamp(x.L, 0, 1)) * 0.85 + clamp(-x.v * 0.12, 0, 0.35), 0, 1.2);
export function blob(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, sq: number, phase: number, t: number, inner: number): void {
  const a = rx * (1 + 0.08 * sq), b = ry * (1 - 0.1 * sq);
  g.beginPath();
  for (let i = 0; i <= 72; i++) {
    const th = (i / 72) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
    const n = sn > 0 ? 2 + 2.6 * sq : 2; // the lower half goes boxy where it presses
    let x = Math.sign(c) * Math.pow(Math.abs(c), 2 / n), y = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n);
    // the inner side (toward the other mass) bulges a little when pressed together
    if (inner && Math.sign(c) === -inner) x *= 1 + 0.05 * sq * Math.max(0, sn);
    const w = 1 + 0.012 * Math.sin(3 * th + t * 0.8 + phase) + 0.007 * Math.sin(5 * th - t * 1.3 + phase * 2);
    const px = cx + a * x * w, py = cy + b * y * w;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath(); g.fill();
}
/* her lower body seen from below, the right half from the top (her back) down the hip and the outer thigh, back up the inner thigh to the gap; unit H, origin at her seat */
export const SEAT_BODY: Pt[] = [
  [0.57, -1.6], [0.55, -1.0], [0.53, -0.66], [0.58, -0.42], [0.66, -0.2], [0.72, 0.04], [0.76, 0.3], [0.8, 0.66], [0.87, 1.1], [0.96, 1.7],
  [0.5, 1.7], [0.33, 1.15], [0.18, 0.8], [0.05, 0.56],
];
export const SHAPES: { [K in ShapeKind]: Shape } = {
  slit(g, W, H, o, s) {
    const ex = Math.max(0, o - 1), oc = Math.min(o, 1);
    const cx = W * 0.5, cy = H * (0.42 + s.sway * 0.004);
    const hh = (0.003 + oc * 0.055 + ex * ex * 1.2) * H, hw = (0.16 + oc * 0.09 + ex * 1.4) * H;
    g.beginPath(); g.moveTo(cx - hw, cy); g.quadraticCurveTo(cx, cy - 2 * hh, cx + hw, cy); g.quadraticCurveTo(cx, cy + 2 * hh, cx - hw, cy); g.fill();
    return { focus: [0.5, 0.42], lip: [(cx + hw * 0.62) / W, (cy - hh * 0.7) / H], text: [(cx + hw + 0.03 * H) / W, (cy - 0.08 * H) / H] };
  },
  gap(g, W, H, o, s) {
    const ex = Math.max(0, o - 1), oc = Math.min(o, 1);
    const th = (S.angle * Math.PI) / 180;
    const ax = [Math.sin(th), -Math.cos(th)], nx = [Math.cos(th), Math.sin(th)];
    const C = [W * 0.5 + s.sway * H * 0.004, H * 0.52];
    const Lh = 0.78 * H;
    const toe = (0.006 + oc * 0.085 + s.sway * 0.003 + ex * ex * 1.4) * H, heel = (oc * 0.016 + ex * ex * 1.4) * H;
    const left: Pt[] = [], right: Pt[] = [];
    for (let i = 0; i <= 30; i++) {
      const k = i / 30; // 0 the heels, 1 the toes
      const sp = (k * 2 - 1) * Lh;
      let hw = lerp(heel, toe, k * k);
      hw *= 1 - 0.32 * Math.exp(-((k - 0.55) ** 2) / 0.02); // the balls of her feet press closer
      if (k > 0.84) hw *= 1 + (k - 0.84) * 3.2; // the toes part
      const px = C[0] + ax[0] * sp, py = C[1] + ax[1] * sp;
      left.push([px - nx[0] * hw, py - nx[1] * hw]); right.push([px + nx[0] * hw, py + nx[1] * hw]);
    }
    g.beginPath(); left.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1]);
    g.closePath(); g.fill();
    const at = (k: number): Pt => [C[0] + ax[0] * (k * 2 - 1) * Lh, C[1] + ax[1] * (k * 2 - 1) * Lh];
    const tip = at(0.78), mid = at(0.64);
    return { focus: [mid[0] / W, mid[1] / H], lip: [(tip[0] + nx[0] * (toe * 0.9 + 0.012 * H)) / W, (tip[1] + nx[1] * toe) / H], text: [(tip[0] + 0.1 * H) / W, (tip[1] + 0.03 * H) / H] };
  },
  lift(g, W, H, o, s) {
    const ex = Math.max(0, o - 1), oc = Math.min(o, 1);
    const fr = sideFrame(g, W, H, S.side.lift);
    const { Wc, Hc } = fr;
    const tilt = clamp(S.angle / 30, -1.3, 1.3);
    const edge = (u: number): number => Hc * (1.03 - oc * 0.4 - ex * 1.6 + s.sway * 0.004) - tilt * (u - 0.5) * Hc * 0.28 * Math.max(oc, 0.15) + Hc * 0.07 * (1 - (2 * u - 1) ** 2) * (0.4 + 0.6 * oc);
    g.beginPath(); g.moveTo(-4, Hc + 4);
    for (let i = 0; i <= 30; i++) { const u = i / 30; g.lineTo(u * Wc, edge(u)); }
    g.lineTo(Wc + 4, Hc + 4); g.closePath(); g.fill();
    const uLip = tilt >= 0 ? 0.28 : 0.72;
    const out = { focus: fr.map([Wc * 0.5, (edge(0.5) + Hc) / 2]), lip: fr.map([Wc * uLip, edge(uLip) - 0.01 * Hc]), text: fr.map([Wc * 0.6, edge(0.6) - 0.16 * Hc]) };
    fr.done();
    return out;
  },
  slide(g, W, H, o, s) {
    const ex = Math.max(0, o - 1), oc = Math.min(o, 1);
    const d = s.slideDir; // -1: the crescent on the left
    const R = 1.08 * H, shift = (0.02 + oc * 0.3 + ex * 1.8) * H;
    const cx = W / 2 - d * shift + s.sway * H * 0.006, cy = H * (0.5 + s.slideY * 0.14);
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = 'source-over';
    const edgeX = d < 0 ? cx - R : cx + R; // the circle's near edge at its equator
    const lipX = d < 0 ? Math.max(edgeX, 0) : Math.min(edgeX, W);
    return d < 0
      ? { focus: [Math.max(0.06, (edgeX / W) * 0.5), cy / H], lip: [lipX / W + 0.006, (cy - 0.25 * H) / H], text: [(lipX + 0.07 * H) / W, (cy - 0.1 * H) / H], align: 'left' }
      : { focus: [Math.min(0.94, 1 - (1 - edgeX / W) * 0.5), cy / H], lip: [lipX / W - 0.006, (cy - 0.25 * H) / H], text: [(lipX - 0.07 * H) / W, (cy - 0.1 * H) / H], align: 'right' };
  },
  seat(g, W, H, o, s) {
    const ex = Math.max(0, o - 1);
    const [a, b] = s.sp;
    const Lm = clamp((a.L + b.L) / 2, -0.2, 1.2);
    const V = [W / 2 + s.sway2 * H * 0.012, H * 0.3];
    const rock = s.sway2 * 0.022; // her hips rock a little
    const cr = Math.cos(rock), sr = Math.sin(rock);
    const side = (x: SoftSpring, flip: number): Pt[] => {
      const L = clamp(x.L, -0.2, 1.2), sq = squashOf(x);
      const P = 1.38 / (1 + 0.28 * L + ex * 4);
      return SEAT_BODY.map(([px, py], i) => {
        let X = px, Y = py;
        if (Y > 0) { X *= 1 + 0.05 * sq; Y *= 1 - 0.04 * sq; } // where she presses she spreads a little
        if (i >= 10) { X = X * (1 - 0.55 * sq) + 0.035 * clamp(L, 0, 1); Y += 0.12 * sq; } // the inner thighs close when she presses, part as she rises
        X *= flip;
        return [V[0] + (X * cr - Y * sr) * H * P, V[1] + (X * sr + Y * cr) * H * P];
      });
    };
    const right = side(b, 1), left = side(a, -1);
    // the seam: the gap between her thighs runs up into a narrow line of light only as she rises
    const open = clamp(Lm, 0, 1), Pm = 1.38 / (1 + 0.28 * Lm + ex * 4);
    const apexY = V[1] + (0.5 - open * 0.2) * H * Pm, seamW = (0.002 + open * 0.008) * H * Pm;
    const pts: Pt[] = [...right, [V[0] + seamW, apexY], [V[0] - seamW, apexY], ...left.reverse()];
    const sm = chaikin(chaikin(chaikin(pts)));
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); sm.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath(); g.fill();
    g.globalCompositeOperation = 'source-over';
    return { focus: [V[0] / W, clamp((V[1] + 0.85 * H * Pm) / H, 0.5, 0.92)], lip: [(V[0] + 0.02 * H) / W, clamp((apexY + 0.12 * H) / H, 0.3, 0.94)], text: [(V[0] + 0.32 * H * Pm) / W, (V[1] - 0.12 * H * Pm) / H] };
  },
  squeeze(g, W, H, o, s) {
    const ex = Math.max(0, o - 1), oc = Math.min(o, 1);
    const rx = 0.62 * H, ry = 1.8 * H;
    const gap = (-0.035 + oc * 0.09 - s.squeeze * 0.07 + ex * 1.6 + s.sway * 0.003) * H;
    const lcx = W / 2 - gap - rx, rcx = W / 2 + gap + rx;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.ellipse(lcx, H * 0.5, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(rcx, H * 0.5, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';
    return { focus: [0.5, 0.45], lip: [(W / 2 + Math.max(gap, 0) + 0.012 * H) / W, 0.6], text: [(W / 2 + Math.max(gap, 0) + 0.08 * H) / W, 0.3] };
  },
  wedge(g, W, H, o, s) {
    const ex = Math.max(0, o - 1), oc = Math.min(o, 1);
    const mirror = S.side.wedge === 'left';
    g.save(); if (mirror) { g.translate(W, 0); g.scale(-1, 1); }
    const piv = [W * (0.9 + ex * 0.6), H * 1.02];
    const yL = H * (1.07 - oc * 0.56 - ex * 2.6 + s.sway * 0.006);
    const edge = (u: number): number => lerp(yL, piv[1], u) + 0.06 * H * Math.sin(Math.PI * u) * (0.4 + 0.6 * oc);
    g.beginPath(); g.moveTo(-4, edge(0));
    for (let i = 0; i <= 30; i++) { const u = i / 30; g.lineTo(u * piv[0], edge(u)); }
    g.lineTo(piv[0], H + 4); g.lineTo(-4, H + 4); g.closePath(); g.fill();
    g.restore();
    const mx = (x: number): number => (mirror ? 1 - x : x);
    const u1 = 0.25, u2 = 0.12;
    return { focus: [mx(0.22), clamp((edge(0.22) + H) / 2 / H, 0.5, 0.95)], lip: [mx((u1 * piv[0]) / W), (edge(u1) - 0.012 * H) / H], text: [mx((u2 * piv[0]) / W), (edge(u2) - 0.17 * H) / H], align: mirror ? 'right' : 'left' };
  },
};
