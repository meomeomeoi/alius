// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { planRoomsOn, rectOf } from '../../src/engine/basePlan';
import { drawFloor, drawRoofs, drawSite } from '../../src/ui/hub/plan/draw';
import { FURNISHED_KINDS, furnish } from '../../src/ui/hub/plan/furnish';
import { outline } from '../../src/ui/hub/plan/geometry';
import { Pen } from '../../src/ui/hub/plan/svg';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

/** The bounding box of the drawable attributes of every element in a group (paths excluded). */
function bounds(g: Element): { x0: number; y0: number; x1: number; y1: number } {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const n = (el: Element, k: string): number => Number(el.getAttribute(k));
  for (const el of g.querySelectorAll('rect, line, circle, ellipse')) {
    let xs: number[] = [];
    let ys: number[] = [];
    if (el.tagName === 'rect') { xs = [n(el, 'x'), n(el, 'x') + n(el, 'width')]; ys = [n(el, 'y'), n(el, 'y') + n(el, 'height')]; }
    if (el.tagName === 'line') { xs = [n(el, 'x1'), n(el, 'x2')]; ys = [n(el, 'y1'), n(el, 'y2')]; }
    if (el.tagName === 'circle') { xs = [n(el, 'cx') - n(el, 'r'), n(el, 'cx') + n(el, 'r')]; ys = [n(el, 'cy') - n(el, 'r'), n(el, 'cy') + n(el, 'r')]; }
    if (el.tagName === 'ellipse') { xs = [n(el, 'cx') - n(el, 'rx'), n(el, 'cx') + n(el, 'rx')]; ys = [n(el, 'cy') - n(el, 'ry'), n(el, 'cy') + n(el, 'ry')]; }
    b.x0 = Math.min(b.x0, ...xs); b.x1 = Math.max(b.x1, ...xs); b.y0 = Math.min(b.y0, ...ys); b.y1 = Math.max(b.y1, ...ys);
  }
  return b;
}

describe('outline (walls of a union)', () => {
  it('two corridors meeting end to end leave no wall across the joint', () => {
    const segs = outline([{ x: 0, y: 0, w: 50, h: 20 }, { x: 50, y: 0, w: 50, h: 20 }]);
    expect(segs.some(([x1, , x2]) => x1 === 50 && x2 === 50)).toBe(false);
    expect(segs).toContainEqual([0, 0, 100, 0]);
    expect(segs).toContainEqual([0, 20, 100, 20]);
  });

  it('a T-junction opens the cross corridor and keeps the side walls of the stem', () => {
    const segs = outline([{ x: 0, y: 0, w: 100, h: 20 }, { x: 40, y: 20, w: 20, h: 60 }]);
    expect(segs).toContainEqual([0, 20, 40, 20]);
    expect(segs).toContainEqual([60, 20, 100, 20]);
    expect(segs).toContainEqual([40, 20, 40, 80]);
    expect(segs).toContainEqual([60, 20, 60, 80]);
  });
});

describe('furniture', () => {
  it('every core room\'s furniture stays inside its room (the garage bay door sits on its wall)', () => {
    for (const e of reg.planRooms.values()) {
      const pen = Pen.group('t');
      const r = rectOf(e);
      furnish(pen, e.cabin === 'commander' ? 'commander' : String(e.kind), r, e.cabin === 'unit' ? 'rich' : 'plain');
      if (pen.g.childElementCount === 0) continue;
      const b = bounds(pen.g);
      expect(b.x0, `${String(e.id)} left`).toBeGreaterThanOrEqual(r.x - 0.5);
      expect(b.y0, `${String(e.id)} top`).toBeGreaterThanOrEqual(r.y - 0.5);
      expect(b.x1, `${String(e.id)} right`).toBeLessThanOrEqual(r.x + r.w + 0.5);
      expect(b.y1, `${String(e.id)} bottom`).toBeLessThanOrEqual(r.y + r.h + 0.5);
    }
  });

  it('every kind of the core plan is furnished except corridors and the roof; an unknown kind draws nothing', () => {
    const kinds = new Set([...reg.planRooms.values()].map((e) => String(e.kind)));
    for (const k of kinds) if (k !== 'corridor' && k !== 'roof') expect(FURNISHED_KINDS, k).toContain(k);
    const pen = Pen.group('t');
    furnish(pen, 'hovercraft_bay', { x: 0, y: 0, w: 50, h: 50 });
    expect(pen.g.childElementCount).toBe(0);
  });

  it('a cabin\'s variant changes its furniture', () => {
    const r = rectOf(reg.planRooms.get('u_cabin_1')!);
    const draw = (v: 'plain' | 'tatami' | 'rich' | 'vacant') => { const p = Pen.group('t'); furnish(p, 'cabin', r, v); return p.g.innerHTML; };
    expect(new Set([draw('plain'), draw('tatami'), draw('rich'), draw('vacant')]).size).toBe(4);
  });
});

describe('site, floors and roofs', () => {
  it('the site draws the fence, four towers and their floodlights', () => {
    const pen = Pen.group('t');
    drawSite(pen);
    expect(pen.g.querySelectorAll('.p-tower')).toHaveLength(4);
    expect(pen.g.querySelectorAll('.p-cone')).toHaveLength(4);
    expect(pen.g.querySelectorAll('.p-fence').length).toBeGreaterThanOrEqual(5);
  });

  it('a floor draws every room of it, closed rooms hatched, lit rooms glowing, doors and emergency lights', () => {
    const pen = Pen.group('t');
    drawFloor(pen, reg, 'upper', { lit: new Set(['u_cabin_1']), cabinVariant: (c) => (c.id === 'u_cabin_5' ? 'vacant' : 'plain') });
    const closedOnFloor = planRoomsOn(reg, 'upper').filter((e) => !e.hubRoomId && e.cabin === undefined && e.kind !== 'corridor' && e.kind !== 'stair').length;
    expect(pen.g.querySelectorAll('rect.p-closed').length).toBe(closedOnFloor + 1); // + the vacant cabin
    expect(pen.g.querySelectorAll('.p-room-lit')).toHaveLength(1);
    expect(pen.g.querySelectorAll('.p-glow').length).toBe(2);
    expect(pen.g.querySelectorAll('.p-doorcut').length).toBe(planRoomsOn(reg, 'upper').flatMap((e) => (e.doors ?? []) as unknown[]).length);
    expect(pen.g.querySelectorAll('.p-elight').length).toBeGreaterThan(5);
    expect(pen.g.querySelectorAll('.p-hatch').length).toBeGreaterThan(10);
  });

  it('the roofs: a high roof over the upper floor, low roofs over the rest, the antenna over the room with a line', () => {
    const pen = Pen.group('t');
    drawRoofs(pen, reg);
    expect(pen.g.querySelectorAll('.p-roof-high').length).toBe(planRoomsOn(reg, 'upper').length);
    const low = [...pen.g.querySelectorAll('.p-roof-low')];
    expect(low.length).toBeGreaterThanOrEqual(3);                  // kitchen, gym, garage at least
    expect(pen.g.querySelectorAll('.p-warnlight')).toHaveLength(1);
    expect(pen.g.querySelectorAll('.p-canopy')).toHaveLength(1);
  });
});
