import type { PlanRect } from '../../../engine/basePlan';
import type { Pen } from './svg';

/**
 * P10d: furniture seen from above, by a plan room's `kind` (an unknown kind draws nothing). Ported from the canvas
 * generator (`scripts/art/plan-mockup.py`). Class tokens: `p-f` a filled piece, `p-fl` an outline, `p-thin` a thin
 * line, `p-bed` / `p-rug` / `p-screen` fills, `p-solid` a dark solid, `p-led` a light, `p-dash` dashed, `p-accent`.
 */

/** A cabin's variant, from her P10c room style (read by field): tatami → futon and low table, rich → a big bed. */
export type CabinVariant = 'plain' | 'tatami' | 'rich' | 'dark' | 'vacant';

const F = 'p-f';
const OUT = 'p-fl p-thin';
const THIN_F = 'p-f p-thin';

export function furnish(pen: Pen, kind: string, r: PlanRect, variant: CabinVariant = 'plain'): void {
  const { x, y, w, h } = r;
  const draw = FURNITURE[kind];
  if (kind === 'cabin') return cabin(pen, r, variant);
  if (draw) draw(pen, x, y, w, h);
}

function cabin(pen: Pen, r: PlanRect, variant: CabinVariant): void {
  const { x, y, w, h } = r;
  if (variant === 'vacant') {
    pen.rect(x + 5, y + 5, w * 0.42, h * 0.62, OUT);
    return;
  }
  if (variant === 'tatami') {
    pen.rect(x + 5, y + 5, w * 0.5, h * 0.4, 'p-bed p-thin');            // the futon on the floor
    pen.rect(x + w * 0.55, y + h * 0.45, w * 0.3, h * 0.28, OUT);           // a low table
    pen.rect(x + w - 15, y + 5, 10, h * 0.32, F);
    return;
  }
  const bedW = variant === 'rich' ? w * 0.55 : w * 0.42;
  pen.rect(x + 5, y + 5, bedW, h * 0.62, F);
  pen.rect(x + 7, y + 7, bedW - 4, h * 0.14, 'p-bed p-thin');
  if (variant === 'rich') pen.line(x + 5, y + 5, x + 5 + bedW, y + 5, 'p-accent');   // the gilded headboard
  pen.rect(x + w - 15, y + 5, 10, h * 0.32, F);
  pen.rect(x + w * 0.5, y + h - 18, w * 0.42, 9, F);
}

type Draw = (pen: Pen, x: number, y: number, w: number, h: number) => void;

const FURNITURE: Record<string, Draw> = {
  cabin: () => {},
  commander: (pen, x, y, w, h) => {
    pen.rect(x + 4, y + 4, 20, h - 10, F);
    pen.rect(x + 6, y + 6, 16, 8, 'p-bed p-thin');
    pen.rect(x + w - 26, y + 4, 22, 12, F);
    pen.rect(x + w - 21, y + 6, 12, 7, 'p-screen p-thin');
    pen.circle(x + w - 15, y + 23, 4.5, F);
  },
  map: (pen, x, y) => {
    pen.rect(x + 20, y + 14, 62, 30, OUT);
    pen.line(x + 24, y + 20, x + 78, y + 38, 'p-fl p-thin p-dash');
    pen.line(x + 30, y + 40, x + 70, y + 18, 'p-fl p-thin p-dash');
    pen.circle(x + 51, y + 29, 3, 'p-accent p-thin');
  },
  mess: (pen, x, y, w, h) => {
    for (const ty of [y + 22, y + 72]) {
      pen.rect(x + 40, ty, w - 70, 14, F);
      pen.rect(x + 42, ty - 9, w - 74, 5, THIN_F);
      pen.rect(x + 42, ty + 18, w - 74, 5, THIN_F);
    }
    pen.rect(x + 8, y + 8, 14, h - 40, F);
    for (let i = 0; i < 4; i++) pen.circle(x + 15, y + 20 + i * 24, 4.5, OUT);
  },
  kitchen: (pen, x, y, w) => {
    pen.rect(x + 6, y + 6, w - 12, 14, F);
    for (let i = 0; i < 4; i++) pen.circle(x + 20 + i * 22, y + 13, 4.5, OUT);
    pen.rect(x + 30, y + 34, 50, 16, F);
  },
  storage: (pen, x, y, w, h) => {
    const n = Math.max(1, Math.min(3, Math.floor((h - 14) / 18)));
    const pad = w > 60 ? 10 : 5;
    for (let i = 0; i < n; i++) pen.rect(x + pad, y + 8 + i * (h - 22) / n, w - 2 * pad, w <= 60 ? 6 : 9, OUT);
  },
  laundry: (pen, x, y, w) => {
    for (let i = 0; i < 3; i++) {
      pen.rect(x + 10 + i * 26, y + 10, 22, 22, OUT);
      pen.circle(x + 21 + i * 26, y + 21, 7, OUT);
    }
    pen.line(x + 10, y + 56, x + w - 10, y + 56, 'p-fl p-thin p-dash');
  },
  stair: (pen, x, y, w, h) => {
    const n = Math.max(4, Math.floor(h / 7));
    for (let i = 0; i < n; i++) pen.line(x + 4, y + 4 + i * (h - 8) / n, x + w - 4, y + 4 + i * (h - 8) / n, OUT);
  },
  gym: (pen, x, y) => {
    pen.rect(x + 14, y + 14, 60, 40, OUT);
    for (let i = 0; i < 3; i++) pen.rect(x + 90 + i * 20, y + 16, 12, 40, F);
    pen.line(x + 20, y + 80, x + 130, y + 80, 'p-fl');
    pen.circle(x + 20, y + 80, 5, F);
    pen.circle(x + 130, y + 80, 5, F);
  },
  armory: (pen, x, y, w) => {
    for (let i = 0; i < 3; i++) {
      pen.line(x + 10, y + 14 + i * 18, x + w - 10, y + 14 + i * 18, 'p-fl');
      for (let j = 0; j < 5; j++) pen.line(x + 14 + j * 10, y + 10 + i * 18, x + 14 + j * 10, y + 18 + i * 18, OUT);
    }
  },
  medbay: (pen, x, y, w, h) => {
    for (const bx of [x + 14, x + 70]) {
      pen.rect(bx, y + 14, 26, 54, F);
      pen.rect(bx + 3, y + 16, 20, 10, 'p-bed p-thin');
      pen.path(`M ${bx - 6} ${y + 8} q 10 4 0 14 q -10 10 0 20 q 10 8 0 20`, 'p-fl p-thin p-dash');
    }
    pen.rect(x + w - 24, y + 14, 16, 40, F);
    pen.circle(x + 54, y + 22, 2.4, OUT);
    pen.rect(x + 20, y + h - 30, 60, 14, THIN_F);
  },
  workshop: (pen, x, y, w) => {
    pen.rect(x + 8, y + 8, w - 16, 16, F);
    for (let i = 0; i < 10; i++) pen.line(x + 14 + i * 11, y + 11, x + 14 + i * 11, y + 21, OUT);
    pen.rect(x + w - 54, y + 50, 44, 44, F);
    pen.rect(x + w - 44, y + 60, 24, 24, 'p-screen p-thin');
    pen.circle(x + w - 14, y + 56, 2.4, 'p-led');
    pen.rect(x + 10, y + 50, 50, 26, F);
  },
  lockers: (pen, x, y) => {
    for (let i = 0; i < 8; i++) pen.rect(x + 8 + i * 13, y + 8, 11, 18, OUT);
    pen.rect(x + 20, y + 40, 80, 8, OUT);
  },
  generator: (pen, x, y) => {
    pen.rect(x + 12, y + 12, 50, 36, F);
    pen.circle(x + 74, y + 22, 8, OUT);
  },
  garage: (pen, x, y, w, h) => {
    for (const vx of [x + 8, x + 58]) {
      pen.rect(vx, y + 30, 44, 110, F);
      pen.rect(vx + 5, y + 40, 34, 24, 'p-screen p-thin');
      pen.rect(vx + 5, y + 74, 34, 56, OUT);
      for (const wy of [y + 42, y + 116]) {
        pen.rect(vx - 4, wy, 4, 16, 'p-solid');
        pen.rect(vx + 44, wy, 4, 16, 'p-solid');
      }
    }
    pen.rect(x + 60, y + 170, 40, 30, F);
    pen.ellipse(x + 30, y + 182, 22, 8, 'p-stain');
    pen.line(x + 6, y + h, x + w - 6, y + h, 'p-baydoor');
  },
  lobby: (pen, x, y) => {
    pen.rect(x + 110, y + 30, 56, 14, F);
    pen.circle(x + 138, y + 52, 5.5, F);
    pen.rect(x + 110, y + 70, 56, 7, THIN_F);
    pen.rect(x + 76, y + 68, 32, 18, 'p-rug p-thin');
  },
  showers: (pen, x, y) => {
    for (let i = 0; i < 6; i++) {
      pen.rect(x + 6 + i * 23, y + 6, 20, 24, OUT);
      pen.circle(x + 16 + i * 23, y + 18, 3, OUT);
    }
  },
  comms: (pen, x, y, w) => {
    for (let i = 0; i < 3; i++) {
      pen.rect(x + w - 20, y + 8 + i * 30, 14, 26, F);
      pen.circle(x + w - 13, y + 14 + i * 30, 1.8, 'p-led');
    }
    pen.rect(x + 8, y + 40, 30, 60, F);
    for (let i = 0; i < 3; i++) pen.rect(x + 10, y + 44 + i * 19, 8, 15, 'p-screen p-thin');
    pen.circle(x + 48, y + 70, 7, F);
  },
  briefing: (pen, x, y, w, h) => {
    pen.rect(x + 20, y + 30, 30, 70, OUT);
    for (let i = 0; i < 3; i++) {
      pen.circle(x + 12, y + 42 + i * 22, 4, OUT);
      pen.circle(x + 58, y + 42 + i * 22, 4, OUT);
    }
    pen.line(x + 15, y + h - 10, x + w - 15, y + h - 10, 'p-fl');
  },
  library: (pen, x, y, w, h) => {
    for (let i = 0; i < 3; i++) pen.rect(x + 6, y + 8 + i * 18, w - 30, 6, OUT);
    pen.circle(x + w - 14, y + h - 20, 6, F);
  },
  rec: (pen, x, y) => {
    pen.rect(x + 10, y + 10, 34, 20, OUT);
    pen.circle(x + 27, y + 20, 3, OUT);
    pen.rect(x + 50, y + 8, 22, 40, OUT);
  },
  office: (pen, x, y, w) => {
    pen.rect(x + 4, y + 6, w - 8, 12, OUT);
    pen.circle(x + w / 2, y + 26, 4, OUT);
  },
  lookout: (pen, x, y, w, h) => {
    pen.line(x + 8, y + h - 4, x + w - 8, y + h - 4, 'p-accent');
    for (let i = 0; i < 4; i++) pen.circle(x + (w * (i + 1)) / 5, y + h - 18, 6, OUT);
    pen.rect(x + 20, y + 10, 40, 20, OUT);
  },
  yard: (pen, x, y) => {
    pen.path(`M ${x + 50} ${y + 26} L ${x + 140} ${y + 26} A 30 30 0 0 1 ${x + 140} ${y + 86} L ${x + 50} ${y + 86} A 30 30 0 0 1 ${x + 50} ${y + 26} Z`, 'p-fl');
    pen.path(`M ${x + 50} ${y + 36} L ${x + 140} ${y + 36} A 20 20 0 0 1 ${x + 140} ${y + 76} L ${x + 50} ${y + 76} A 20 20 0 0 1 ${x + 50} ${y + 36} Z`, 'p-fl p-thin p-dash');
    pen.rect(x + 20, y + 106, 70, 70, F);
    pen.rect(x + 26, y + 112, 58, 58, OUT);
    for (let i = 0; i < 4; i++) {
      const tx = x + 120 + i * 30;
      pen.line(tx, y + 110, tx, y + 168, 'p-fl p-thin p-dash');
      pen.rect(tx - 7, y + 172, 14, 4, 'p-solid');
    }
    pen.rect(x + 200, y + 26, 24, 50, THIN_F);
    for (let i = 0; i < 3; i++) pen.circle(x + 212, y + 34 + i * 16, 6, OUT);
  },
};

/** Kinds the core draws furniture for (tests check every one stays inside its room). */
export const FURNISHED_KINDS = Object.keys(FURNITURE);
