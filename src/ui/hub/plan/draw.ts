import type { Entry, Registries } from '../../../content/types';
import { PLAN_H, PLAN_W } from '../../../content/schemas';
import { doorsOf, isClosed, isOpenSpace, planRoomsOn, rectOf, type PlanDoor, type PlanFloor, type PlanRect } from '../../../engine/basePlan';
import { furnish, type CabinVariant } from './furnish';
import { Cover, outline, type Segment } from './geometry';
import { Pen, scatter } from './svg';

/**
 * P10d: the plan drawn as SVG groups. The compound (`drawSite`), one floor (`drawFloor`) and the roofs (`drawRoofs`).
 * Geometry comes from `planRooms`; decor that is not data (the fence, the roads, the roof machinery) is drawn here and,
 * on the roof, only where it lands on a roof.
 */

const FENCE: PlanRect = { x: 14, y: 14, w: 972, h: 597 };
const GATE: [number, number] = [432, 502];

// ---------------------------------------------------------------------------------------------- the compound

export function drawSite(pen: Pen): void {
  pen.rect(0, 0, PLAN_W, PLAN_H, 'p-outside');
  const rnd = scatter(11);
  const specks = pen.child('p-specks');
  for (let i = 0; i < 300; i++) {
    const x = rnd() * PLAN_W;
    const y = rnd() * PLAN_H;
    if (x > 10 && x < 990 && y > 10 && y < 615) continue;
    specks.circle(x, y, 0.4 + rnd() * 0.8, 'p-speck');
  }
  pen.rect(FENCE.x, FENCE.y, FENCE.w, FENCE.h, 'p-compound');
  for (let i = 0; i < 260; i++) specks.circle(20 + rnd() * 960, 20 + rnd() * 585, 0.3 + rnd() * 0.5, 'p-speck p-speck-in');

  // roads: from the gate to the main door, a branch east to the garage bay
  pen.rect(445, 470, 44, 141, 'p-road');
  pen.rect(445, 530, 515, 40, 'p-road');
  pen.rect(860, 520, 90, 10, 'p-road');
  pen.path('M 700 241 L 740 241 L 780 230', 'p-path');
  for (let y = 478; y < 605; y += 16) pen.line(467, y, 467, y + 8, 'p-roadline');
  for (let x = 500; x < 950; x += 18) pen.line(x, 550, x + 9, 550, 'p-roadline');

  // lived-in outside: vegetable beds, a washing line, the water tower and its bench, fuel tanks, the wreck
  for (let i = 0; i < 4; i++) {
    pen.rect(40 + i * 28, 470, 22, 60, 'p-bed p-thin');
    for (let j = 0; j < 5; j++) pen.circle(51 + i * 28, 478 + j * 11, 2.2, 'p-leaf');
  }
  pen.line(60, 350, 150, 330, 'p-fl p-thin p-dash');
  for (let i = 0; i < 5; i++) pen.rect(70 + i * 16, 336 - i * 3.6, 6, 9, 'p-solid');
  pen.circle(90, 110, 26, 'p-f');
  pen.circle(90, 110, 18, 'p-fl p-thin');
  for (const ang of [45, 135, 225, 315]) {
    const a = (ang * Math.PI) / 180;
    pen.line(90 + 26 * Math.cos(a), 110 + 26 * Math.sin(a), 90 + 34 * Math.cos(a), 110 + 34 * Math.sin(a), 'p-fl');
  }
  pen.rect(128, 150, 30, 8, 'p-f p-thin');
  for (const [cx, cy, r] of [[800, 455, 13], [826, 462, 11]] as const) {
    pen.circle(cx, cy, r, 'p-f');
    pen.line(cx - r + 3, cy, cx + r - 3, cy, 'p-fl p-thin');
  }
  pen.path('M 120 560 l 60 -10 l 8 26 l -60 10 Z M 140 556 l 4 24 M 162 552 l 4 24', 'p-fl p-thin p-dash');

  // the fence, its posts, the gate, the booth, the towers and their floodlights
  const { x: fx, y: fy, w: fw, h: fh } = FENCE;
  const runs: Array<[number, number, number, number]> = [
    [fx, fy, fx + fw, fy], [fx + fw, fy, fx + fw, fy + fh], [fx, fy, fx, fy + fh], [fx, fy + fh, GATE[0], fy + fh], [GATE[1], fy + fh, fx + fw, fy + fh],
  ];
  for (const [x1, y1, x2, y2] of runs) {
    pen.line(x1, y1, x2, y2, 'p-fence');
    const n = Math.floor(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) / 20);
    for (let i = 0; i <= n; i++) pen.rect(x1 + (x2 - x1) * i / Math.max(n, 1) - 1.5, y1 + (y2 - y1) * i / Math.max(n, 1) - 1.5, 3, 3, 'p-post');
  }
  pen.path(`M ${GATE[0]} ${fy + fh} L ${GATE[0] + 33} ${fy + fh - 10} M ${GATE[1]} ${fy + fh} L ${GATE[1] - 33} ${fy + fh - 10}`, 'p-fence');
  pen.rect(512, 584, 30, 22, 'p-booth');
  for (const [tx, ty] of [[fx, fy], [fx + fw, fy], [fx, fy + fh], [fx + fw, fy + fh]]) {
    pen.rect(tx - 14, ty - 14, 28, 28, 'p-tower');
    pen.line(tx - 9, ty - 9, tx + 9, ty + 9, 'p-wall-thin');
    pen.line(tx + 9, ty - 9, tx - 9, ty + 9, 'p-wall-thin');
    const dx = tx < 500 ? 1 : -1;
    const dy = ty < 300 ? 1 : -1;
    pen.polygon([[tx, ty], [tx + dx * 150, ty + dy * 60], [tx + dx * 60, ty + dy * 150]], 'p-cone');
  }
}

// ---------------------------------------------------------------------------------------------- one floor

export interface FloorLook {
  /** Plan rooms with somebody in them (they glow at dusk and night). */
  lit: Set<string>;
  /** The furniture variant of a cabin (her room style; VACANT). */
  cabinVariant: (cabin: Entry) => CabinVariant;
}

function door(pen: Pen, d: PlanDoor): void {
  const { x, y, side, size } = d;
  if (side === 'n' || side === 's') {
    pen.line(x, y, x + size, y, 'p-doorcut');
    const sy = side === 'n' ? -1 : 1;
    pen.path(`M ${x} ${y} L ${x} ${y + sy * size} A ${size} ${size} 0 0 ${side === 'n' ? 0 : 1} ${x + size} ${y}`, 'p-fl p-thin');
  } else {
    pen.line(x, y, x, y + size, 'p-doorcut');
    const sx = side === 'w' ? -1 : 1;
    pen.path(`M ${x} ${y} L ${x + sx * size} ${y} A ${size} ${size} 0 0 ${side === 'w' ? 1 : 0} ${x} ${y + size}`, 'p-fl p-thin');
  }
}

function hatch(pen: Pen, r: PlanRect, step = 12): void {
  const { x, y, w, h } = { x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4 };
  for (let t = -h; t < w; t += step) {
    const a = Math.max(t, 0);
    const b = Math.min(t + h, w);
    pen.line(x + a, y + (a - t), x + b, y + (b - t), 'p-hatch');
  }
}

/** Emergency lights on stretches of solid wall, clear of doorways and of junctions; the glow is a half-disc inward. */
function emergencyLights(pen: Pen, corridors: PlanRect[], segs: Segment[], doors: PlanDoor[]): void {
  const wallOk = (horizontal: boolean, at: number, pos: number): boolean => {
    const onWall = segs.some(([x1, y1, x2, y2]) => horizontal
      ? y1 === y2 && y1 === at && Math.min(x1, x2) <= pos - 9 && pos + 9 <= Math.max(x1, x2)
      : x1 === x2 && x1 === at && Math.min(y1, y2) <= pos - 9 && pos + 9 <= Math.max(y1, y2));
    if (!onWall) return false;
    return !doors.some((d) => horizontal
      ? (d.side === 'n' || d.side === 's') && Math.abs(d.y - at) < 1 && d.x - 10 < pos && pos < d.x + d.size + 10
      : (d.side === 'e' || d.side === 'w') && Math.abs(d.x - at) < 1 && d.y - 10 < pos && pos < d.y + d.size + 10);
  };
  const lights = pen.child('p-elights');
  for (const c of corridors) {
    const horizontal = c.w > c.h;
    const n = Math.max(1, Math.floor(Math.max(c.w, c.h) / 70));
    for (let i = 0; i < n; i++) {
      const base = horizontal ? c.x + c.w * (i + 0.5) / n : c.y + c.h * (i + 0.5) / n;
      let placed: [number, number, number] | null = null;
      for (const off of [0, 12, -12, 24, -24, 36, -36]) {
        const walls: Array<[number, number]> = horizontal ? [[c.y, 1], [c.y + c.h, -1]] : [[c.x, 1], [c.x + c.w, -1]];
        const hit = walls.find(([at]) => wallOk(horizontal, at, base + off));
        if (hit) {
          placed = [base + off, hit[0], hit[1]];
          break;
        }
      }
      if (!placed) continue;
      const [pos, at, inward] = placed;
      if (horizontal) {
        lights.path(`M ${pos - 7} ${at + 1.2 * inward} A 7 7 0 0 ${inward > 0 ? 0 : 1} ${pos + 7} ${at + 1.2 * inward} Z`, 'p-elight-glow');
        lights.circle(pos, at + 2 * inward, 1.4, 'p-elight');
      } else {
        lights.path(`M ${at + 1.2 * inward} ${pos - 7} A 7 7 0 0 ${inward > 0 ? 1 : 0} ${at + 1.2 * inward} ${pos + 7} Z`, 'p-elight-glow');
        lights.circle(at + 2 * inward, pos, 1.4, 'p-elight');
      }
    }
  }
}

/** One floor: open spaces and their walls, rooms (open, lit or closed) with their furniture, doors, emergency lights. */
export function drawFloor(pen: Pen, reg: Registries, floor: PlanFloor, look: FloorLook): void {
  const rooms = planRoomsOn(reg, floor);
  const opens = rooms.filter(isOpenSpace);
  for (const e of opens) {
    const r = rectOf(e);
    pen.rect(r.x, r.y, r.w, r.h, 'p-corridor');
  }
  const segs = outline(opens.map(rectOf));
  for (const [x1, y1, x2, y2] of segs) pen.line(x1, y1, x2, y2, 'p-wall');
  for (const e of opens.filter((o) => o.kind === 'corridor')) {
    const { x, y, w, h } = rectOf(e);
    if (w > h) for (let cx = x + 6; cx < x + w - 6; cx += 16) pen.line(cx, y + h / 2, cx + 7, y + h / 2, 'p-corrline');
    else for (let cy = y + 6; cy < y + h - 6; cy += 16) pen.line(x + w / 2, cy, x + w / 2, cy + 7, 'p-corrline');
  }
  for (const e of rooms) {
    const r = rectOf(e);
    if (isOpenSpace(e)) {
      if (e.kind === 'stair') pen.rect(r.x, r.y, r.w, r.h, 'p-fl p-thin');
      if (e.kind !== 'corridor') furnish(pen, String(e.kind), r);
      continue;
    }
    const closed = isClosed(reg, e);
    const lit = look.lit.has(String(e.id));
    const variant = e.cabin === 'unit' ? look.cabinVariant(e) : 'plain';
    const fill = closed || variant === 'vacant' ? 'p-closed' : e.kind === 'stair' ? 'p-corridor' : variant === 'dark' ? 'p-room p-room-dark' : 'p-room';
    pen.rect(r.x, r.y, r.w, r.h, `${fill} p-wall${lit ? ' p-room-lit' : ''}`);
    if (lit) {
      pen.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w * 0.44, r.h * 0.44, 'p-glow p-glow-a');
      pen.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w * 0.24, r.h * 0.24, 'p-glow p-glow-b');
    }
    if (closed || variant === 'vacant') hatch(pen, r);
    furnish(pen, e.cabin === 'commander' ? 'commander' : String(e.kind), r, variant);
  }
  const doors = rooms.flatMap(doorsOf);
  for (const d of doors) door(pen, d);
  emergencyLights(pen, opens.filter((o) => o.kind === 'corridor').map(rectOf), segs, doors);
}

// ---------------------------------------------------------------------------------------------- the roofs

const inRoof = (cover: Cover, x: number, y: number): boolean => cover.has(Math.floor(x), Math.floor(y));

/**
 * The roofs: the high roof is the union of the upper floor (outline, a parapet 5 units inside it), the low roofs are the
 * ground-floor rooms it does not cover (`gym` and `garage` corrugated). The decor (a canopy over the hatch, the rail,
 * the smoking spot, the antenna over the room with a `line`, HVAC, panels) is drawn where it lands on a roof.
 */
export function drawRoofs(pen: Pen, reg: Registries): void {
  const upper = planRoomsOn(reg, 'upper').map(rectOf);
  const high = new Cover(upper);
  for (const e of planRoomsOn(reg, 'ground')) {
    if (e.kind === 'yard') continue;
    const r = rectOf(e);
    if (high.covers(r)) continue;
    pen.rect(r.x, r.y, r.w, r.h, 'p-roof-low');
    if (e.kind === 'gym' || e.kind === 'garage') for (let i = 1; i < 8; i++) pen.line(r.x + i * r.w / 8, r.y + 4, r.x + i * r.w / 8, r.y + r.h - 4, 'p-wall-thin');
  }
  for (const r of upper) pen.rect(r.x, r.y, r.w, r.h, 'p-roof-high');
  for (const [x1, y1, x2, y2] of outline(upper)) {
    pen.line(x1, y1, x2, y2, 'p-roof-edge');
    if (y1 === y2) {
      const dy = high.has(Math.floor((x1 + x2) / 2), y1) ? 5 : -5;
      pen.line(x1 + 5, y1 + dy, x2 - 5, y2 + dy, 'p-parapet');
    } else {
      const dx = high.has(x1, Math.floor((y1 + y2) / 2)) ? 5 : -5;
      pen.line(x1 + dx, y1 + 5, x2 + dx, y2 - 5, 'p-parapet');
    }
  }
  const roofRooms = planRoomsOn(reg, 'roof');
  const hatch = roofRooms.find((e) => e.kind === 'stair');
  if (hatch) {
    const h = rectOf(hatch);
    pen.rect(h.x - 50, h.y - 15, h.w + 50, h.h + 10, 'p-canopy');
    for (let i = 1; i < 6; i++) pen.line(h.x - 50 + i * (h.w + 50) / 6, h.y - 15, h.x - 50 + i * (h.w + 50) / 6, h.y + h.h - 5, 'p-wall-thin');
    pen.rect(h.x + 6, h.y + 12, h.w - 12, h.h - 38, 'p-hatchbox');
    pen.rect(h.x - 32, h.y + 36, 12, 12, 'p-f p-thin');                       // the crate the smokers sit at
    pen.path(`M ${h.x - 16} ${h.y + 30} l 12 0 l 0 12 l -12 0 z`, 'p-fl p-thin'); // the folding chair
    for (let i = 0; i < 5; i++) pen.circle(h.x - 30 + i * 3, h.y + 54, 0.9, 'p-solid');
  }
  const deck = roofRooms.find((e) => typeof e.hubRoomId === 'string');
  if (deck) {
    const d = rectOf(deck);
    pen.line(d.x + 6, d.y + 6, d.x + d.w - 6, d.y + 6, 'p-fl');
    for (let px = d.x + 10; px < d.x + d.w - 6; px += 14) pen.line(px, d.y + 3, px, d.y + 9, 'p-fl p-thin');
  }
  const line = planRoomsOn(reg, 'upper').find((e) => ((e.affordances ?? []) as string[]).includes('line'));
  if (line) {
    const r = rectOf(line);
    const [ax, ay] = [r.x + 42, r.y + 60];
    pen.rect(ax - 12, ay - 12, 24, 24, 'p-f');
    pen.line(ax - 12, ay - 12, ax + 12, ay + 12, 'p-fl p-thin');
    pen.line(ax + 12, ay - 12, ax - 12, ay + 12, 'p-fl p-thin');
    for (const [gx, gy] of [[-58, -50], [52, -50], [-58, 108], [52, 108]]) {
      if (inRoof(high, ax + gx, ay + gy)) pen.line(ax, ay, ax + gx, ay + gy, 'p-fl p-thin p-dash');
    }
    pen.circle(ax, ay, 3, 'p-warnlight');
    if (inRoof(high, ax - 52, ay - 12)) pen.circle(ax - 52, ay - 12, 26, 'p-f');
  }
  for (const [ux, uy] of [[220, 330], [290, 330], [730, 280]]) {
    if (!inRoof(high, ux, uy) || !inRoof(high, ux + 48, uy + 38)) continue;
    pen.rect(ux, uy, 48, 38, 'p-f');
    pen.circle(ux + 24, uy + 19, 13, 'p-fl p-thin');
  }
  for (let i = 0; i < 5; i++) {
    const [sx, sy] = [400 + i * 34, 420];
    if (inRoof(high, sx, sy) && inRoof(high, sx + 30, sy + 36)) pen.rect(sx, sy, 30, 36, 'p-screen p-thin');
  }
  if (inRoof(high, 300, 420)) pen.ellipse(300, 420, 40, 12, 'p-puddle');
}
