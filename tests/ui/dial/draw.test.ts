// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import blockingPostures from '../../../content/core/blockingPostures.json';
import { DRIFTS, PRESETS } from '../../fixtures/dial/presets';
import { poseOf, type DialPose } from '../../../src/ui/scene/dial/points';
import { pose, project } from '../../../src/ui/scene/dial/mannequin';
import { figureFit, mannequinSvg } from '../../../src/ui/scene/dial/draw';

const BASES = (blockingPostures as Array<{ id: string }>).map((p) => p.id);
const ALL: Array<{ name: string; pose: DialPose }> = [
  ...BASES.map((b) => ({ name: b, pose: poseOf(b)! })),
  ...PRESETS.map((x) => ({ name: x.id, pose: x as DialPose })),
];
const kneel: DialPose = { base: 'kneeling_upright', points: { arms: 'on_thighs_down', gaze: 'down' } };
const segs = (svg: SVGSVGElement, seg: string, kind: 'out' | 'fill' = 'out'): SVGPathElement[] =>
  [...svg.querySelectorAll<SVGPathElement>(`.alius-mq-body path.alius-mq-${kind}[data-seg="${seg}"]`)];
const order = (svg: SVGSVGElement, el: Element): number => [...svg.querySelectorAll('.alius-mq-body *')].indexOf(el);

describe('mannequinSvg', () => {
  it('is an SVG of viewBox 200 built from nodes (no innerHTML, no text)', () => {
    const svg = mannequinSvg(kneel);
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 200 200');
    expect(svg.querySelector('text')).toBeNull();
    expect(svg.querySelector('.alius-mq-floor')).not.toBeNull();
    expect(mannequinSvg(kneel, { size: 64 }).getAttribute('width')).toBe('64');
  });

  it('draws far to near: the near arm after the far arm, each outline under its fill', () => {
    const svg = mannequinSvg(kneel);
    const s = pose(kneel);
    const farSide = project(s.shoulder.L)[2] < project(s.shoulder.R)[2] ? 'L' : 'R';
    const nearSide = farSide === 'L' ? 'R' : 'L';
    const far = segs(svg, 'upperArm').find((e) => e.dataset.side === farSide)!;
    const near = segs(svg, 'upperArm').find((e) => e.dataset.side === nearSide)!;
    expect(order(svg, near)).toBeGreaterThan(order(svg, far));
    const farFill = segs(svg, 'upperArm', 'fill').find((e) => e.dataset.side === farSide)!;
    expect(order(svg, farFill)).toBeGreaterThan(order(svg, far));
    // the whole body is in ascending depth: every pair of paths of one kind
    const ds = [...svg.querySelectorAll<SVGPathElement>('.alius-mq-body path.alius-mq-out')].map((e) => Number(e.dataset.depth));
    expect(ds).toEqual([...ds].sort((a, b) => a - b));
  });

  it('the head is an egg drawn after its neck, its long axis follows the projected head direction', () => {
    for (const head of ['up', 'bowed', 'back'] as const) {
      const p: DialPose = { base: 'standing', points: { head } };
      const svg = mannequinSvg(p);
      const eggs = svg.querySelectorAll<SVGEllipseElement>('ellipse.alius-mq-head');
      expect(eggs).toHaveLength(1);
      const neck = segs(svg, 'neck', 'fill')[0];
      expect(order(svg, eggs[0])).toBeGreaterThan(order(svg, neck));
      const s = pose(p);
      const a = project(s.head);
      const b = project([s.head[0] + s.headDir[0], s.head[1] + s.headDir[1], s.head[2] + s.headDir[2]]);
      const want = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI; // degrees clockwise from "up" on the screen
      const got = Number(/rotate\((-?[\d.]+)/.exec(eggs[0].getAttribute('transform') ?? '')?.[1] ?? 'NaN');
      expect(got).toBeCloseTo(want, 0);
      expect(Number(eggs[0].getAttribute('ry'))).toBeGreaterThan(Number(eggs[0].getAttribute('rx'))); // long axis = crown to chin
    }
  });

  it('the far side is marked', () => {
    const svg = mannequinSvg(kneel);
    const s = pose(kneel);
    const farSide = project(s.shoulder.L)[2] < project(s.shoulder.R)[2] ? 'L' : 'R';
    const sided = [...svg.querySelectorAll<SVGPathElement>('.alius-mq-body path[data-side]')];
    expect(sided.length).toBeGreaterThan(8);
    for (const e of sided) expect(e.classList.contains('alius-mq-far'), `${e.dataset.seg}.${e.dataset.side}`).toBe(e.dataset.side === farSide);
    for (const e of svg.querySelectorAll('.alius-mq-body path:not([data-side])')) expect(e.classList.contains('alius-mq-far')).toBe(false);
  });

  it('a ghost: the target as dashed strokes only', () => {
    const svg = mannequinSvg({ ...kneel, points: { ...kneel.points, hips: 'on_heels' } }, { target: kneel });
    const ghost = svg.querySelector('g.alius-mq-ghost')!;
    expect(ghost).not.toBeNull();
    const paths = ghost.querySelectorAll('path');
    expect(paths.length).toBeGreaterThan(8);
    for (const p of paths) {
      expect(p.getAttribute('stroke-dasharray')).toBeTruthy();
      expect(p.classList.contains('alius-mq-fill')).toBe(false);
    }
    expect(ghost.querySelector('.alius-mq-fill')).toBeNull();
    expect(mannequinSvg(kneel).querySelector('g.alius-mq-ghost')).toBeNull();
  });

  it('hot joints: exactly the named ones get a ring, and no other joint has one', () => {
    const knees = mannequinSvg(kneel, { hot: ['knees'] });
    expect(knees.querySelectorAll('circle.alius-mq-hot')).toHaveLength(2);
    expect(knees.querySelectorAll('circle')).toHaveLength(2);
    expect(mannequinSvg(kneel).querySelectorAll('circle')).toHaveLength(0);
    expect(mannequinSvg(kneel, { hot: ['shoulders', 'elbows'] }).querySelectorAll('circle.alius-mq-hot')).toHaveLength(4);
    expect(mannequinSvg(kneel, { hot: ['head'] }).querySelectorAll('circle.alius-mq-hot')).toHaveLength(1);
  });

  it('the gaze is a faint dashed ray from the head, brighter when it drifts, none with the eyes closed', () => {
    const ray = mannequinSvg(kneel).querySelector('line.alius-mq-gaze')!;
    expect(ray.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(ray.classList.contains('alius-mq-hot')).toBe(false);
    expect(mannequinSvg(kneel, { hot: ['gaze'] }).querySelector('line.alius-mq-gaze')!.classList.contains('alius-mq-hot')).toBe(true);
    expect(mannequinSvg({ base: 'kneeling_upright', points: { gaze: 'closed' } }).querySelector('.alius-mq-gaze')).toBeNull();
  });

  it('fits the dial: every point lies inside a circle of radius 84 around (100, 102) after the per-pose scale', () => {
    for (const { name, pose: p } of ALL) {
      const fit = figureFit(p);
      expect(fit.scale, name).toBeGreaterThan(20);
      expect(fit.scale, name).toBeLessThanOrEqual(96);
      for (const [x, y] of fit.points) expect(Math.hypot(x - 100, y - 102), name).toBeLessThanOrEqual(84.0001);
    }
    for (const d of DRIFTS) for (const [x, y] of figureFit(d.actual, d.target).points) expect(Math.hypot(x - 100, y - 102), d.id).toBeLessThanOrEqual(84.0001);
  });

  it('items and hints: a tray and a desk are surfaces, a wall a plane behind the back or before the face, her feet two soles, a seat under a sitting body, a rope and a bar in the teeth', () => {
    const items = (p: DialPose, k: string) => [...mannequinSvg(p).querySelectorAll(`[data-item="${k}"]`)];
    const hints = (p: DialPose, k: string) => [...mannequinSvg(p).querySelectorAll(`[data-hint="${k}"]`)];
    expect(items({ base: 'kneeling_upright', points: { arms: 'holding' }, item: 'tray' }, 'tray').map((e) => e.tagName)).toEqual(['polygon']);
    expect(items({ base: 'kneeling_upright', points: { arms: 'lamp' }, item: 'lamp' }, 'lamp')).toHaveLength(2); // its stem and its shade
    expect(items({ base: 'lying_side', points: { arms: 'bound' }, hogtie: true, item: 'rope' }, 'rope')).toHaveLength(1);
    expect(items({ ...kneel, item: 'mouth' }, 'mouth')).toHaveLength(1);
    for (const hint of ['wall', 'wall_front', 'desk'] as const) expect(hints({ ...kneel, hint }, hint).map((e) => e.tagName), hint).toEqual(['polygon']);
    expect(hints({ ...kneel, hint: 'feet' }, 'feet')).toHaveLength(2);
    expect(hints({ base: 'sitting', points: {} }, 'seat').length).toBeGreaterThan(0); // nothing sits on air
    expect(mannequinSvg(kneel).querySelector('.alius-mq-item, .alius-mq-hint')).toBeNull();
  });

  it('the gaze never goes through the floor', () => {
    for (const { name, pose: p } of ALL) {
      const ray = mannequinSvg(p).querySelector('.alius-mq-gaze');
      if (!ray) continue;
      const s = pose(p);
      const g = s.gazeDir!;
      const atFloor = g[1] < 0 ? s.head[1] / -g[1] : Infinity;
      expect(atFloor, name).toBeGreaterThan(0.14);
    }
  });

  it('a lying body rests on the floor: its lowest surface touches it, with no gap and no sinking', () => {
    const R = { shoulder: 0.05, elbow: 0.045, hand: 0.035, hip: 0.065, knee: 0.05, ankle: 0.045, toe: 0.035 } as const;
    for (const base of ['lying_back', 'lying_front', 'lying_side']) {
      const s = pose({ base, points: {} });
      const lowest = Math.min(s.pelvis[1] - 0.11, s.chest[1] - 0.12, s.head[1] - 0.1, ...(Object.keys(R) as Array<keyof typeof R>).flatMap((k) => [s[k].L[1] - R[k], s[k].R[1] - R[k]]));
      expect(lowest, base).toBeLessThan(0.03);
      expect(lowest, base).toBeGreaterThan(-0.03);
    }
  });

  it('draws every base and preset (and each drift) without throwing', () => {
    for (const { name, pose: p } of ALL) expect(() => mannequinSvg(p), name).not.toThrow();
    for (const d of DRIFTS) expect(() => mannequinSvg(d.actual, { target: d.target, hot: d.hot }), d.id).not.toThrow();
  });
});

describe('mannequinSvg with a given body (P16b: a drifting posture between two point states)', () => {
  it('draws the skeleton it is given instead of the pose, and is the same as before without one', () => {
    const p: DialPose = { base: 'kneeling_upright', points: { arms: 'behind_head', gaze: 'down' } };
    expect(mannequinSvg(p, { body: pose(p) }).outerHTML).toBe(mannequinSvg(p).outerHTML);
    const sagged = pose({ ...p, points: { ...p.points, arms: 'at_sides' } });
    const a = mannequinSvg(p, { body: sagged, target: p });
    const b = mannequinSvg({ ...p, points: { ...p.points, arms: 'at_sides' } }, { target: p });
    expect(segs(a, 'forearm').map((s) => s.getAttribute('d'))).toEqual(segs(b, 'forearm').map((s) => s.getAttribute('d')));
  });
});
