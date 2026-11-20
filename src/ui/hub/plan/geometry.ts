import { PLAN_H, PLAN_W } from '../../../content/schemas';
import type { PlanRect } from '../../../engine/basePlan';

/** A wall segment (axis-aligned) in plan units. */
export type Segment = [number, number, number, number];

/** The plan's cells (1 × 1 unit) covered by any of the rects. */
export class Cover {
  private readonly cells = new Uint8Array(PLAN_W * PLAN_H);

  constructor(rects: PlanRect[]) {
    for (const r of rects) {
      for (let y = Math.max(0, Math.floor(r.y)); y < Math.min(PLAN_H, Math.ceil(r.y + r.h)); y++) {
        this.cells.fill(1, y * PLAN_W + Math.max(0, Math.floor(r.x)), y * PLAN_W + Math.min(PLAN_W, Math.ceil(r.x + r.w)));
      }
    }
  }

  has(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < PLAN_W && y < PLAN_H && this.cells[y * PLAN_W + x] === 1;
  }

  /** Whether every cell of a rect is covered. */
  covers(r: PlanRect): boolean {
    for (let y = Math.floor(r.y); y < Math.ceil(r.y + r.h); y++) {
      for (let x = Math.floor(r.x); x < Math.ceil(r.x + r.w); x++) if (!this.has(x, y)) return false;
    }
    return true;
  }
}

/** The outline of the union of rects: edges between covered and uncovered cells, merged into runs. */
export function outline(rects: PlanRect[]): Segment[] {
  if (rects.length === 0) return [];
  const cover = new Cover(rects);
  const x0 = Math.max(0, Math.floor(Math.min(...rects.map((r) => r.x))));
  const y0 = Math.max(0, Math.floor(Math.min(...rects.map((r) => r.y))));
  const x1 = Math.min(PLAN_W, Math.ceil(Math.max(...rects.map((r) => r.x + r.w))));
  const y1 = Math.min(PLAN_H, Math.ceil(Math.max(...rects.map((r) => r.y + r.h))));
  const segs: Segment[] = [];
  for (let y = y0; y <= y1; y++) {
    let run: number | null = null;
    for (let x = x0; x <= x1 + 1; x++) {
      const edge = x <= x1 && cover.has(x, y - 1) !== cover.has(x, y);
      if (edge && run === null) run = x;
      if (!edge && run !== null) {
        segs.push([run, y, x, y]);
        run = null;
      }
    }
  }
  for (let x = x0; x <= x1; x++) {
    let run: number | null = null;
    for (let y = y0; y <= y1 + 1; y++) {
      const edge = y <= y1 && cover.has(x - 1, y) !== cover.has(x, y);
      if (edge && run === null) run = y;
      if (!edge && run !== null) {
        segs.push([x, run, x, y]);
        run = null;
      }
    }
  }
  return segs;
}
