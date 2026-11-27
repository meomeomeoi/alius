/**
 * P10e: draws a mannequin pose as SVG line art: an artist's wooden mannequin, not a stick figure. Each segment is a capsule (a
 * light outline stroke under a dark fill stroke), drawn far to near by projected depth; the far side is a darker outline;
 * the head is an egg over its neck, with a dot where the face looks; the floor is a faint parallelogram; a joint ring
 * appears only on a drifting joint. A target pose is drawn as a dashed ghost under the body. The SVG holds no text (the
 * dial's label is HTML) and is built from nodes, never from markup. Colours are CSS (css/61-blocking.css, palette mixes).
 */
import { HEAD, pose, project, type Skeleton, type Vec3 } from './mannequin';
import type { DialPose } from './points';

export type HotJoint = 'shoulders' | 'elbows' | 'hips' | 'knees' | 'head' | 'gaze';
export interface DialFigureOpts {
  /** The posture the body should hold: drawn as a dashed ghost under the actual body (a drifting posture). */
  target?: DialPose;
  /** The joints that drift: they glow (a ring each; the gaze ray gets brighter). */
  hot?: HotJoint[];
  /** The width and height in px (CSS may size it instead). */
  size?: number;
  /** P16b: the body to draw instead of `pose(p)` (a posture drifting between two point states); `p` still gives the base, the hints and the items. */
  body?: Skeleton;
}

const NS = 'http://www.w3.org/2000/svg';
/** The figure is centred here and kept inside a circle of this radius (the dial's ring is at 100). */
const CX = 100;
const CY = 102;
const THICK = { torso: 0.25, pelvis: 0.22, thigh: 0.125, shin: 0.095, upperArm: 0.085, forearm: 0.07, neck: 0.07, foot: 0.07 } as const;
const OUTLINE = 1.6;

type SegKind = keyof typeof THICK;
interface Seg {
  seg: SegKind;
  side?: 'L' | 'R';
  a: Vec3;
  b: Vec3;
}

const mid = (a: Vec3, b: Vec3, t = 0.5): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function segmentsOf(s: Skeleton): Seg[] {
  const out: Seg[] = [
    // two volumes along the spine, as on the spike: the pelvis low, the chest high, overlapping at the waist
    { seg: 'pelvis', a: mid(s.pelvis, s.chest, 0.03), b: mid(s.pelvis, s.chest, 0.5) },
    { seg: 'torso', a: mid(s.pelvis, s.chest, 0.42), b: mid(s.pelvis, s.chest, 0.97) },
    { seg: 'neck', a: s.neck, b: s.neckTop },
  ];
  for (const side of ['L', 'R'] as const) {
    out.push(
      { seg: 'upperArm', side, a: s.shoulder[side], b: s.elbow[side] },
      { seg: 'forearm', side, a: s.elbow[side], b: s.hand[side] },
      { seg: 'thigh', side, a: s.hip[side], b: s.knee[side] },
      { seg: 'shin', side, a: s.knee[side], b: s.ankle[side] },
      { seg: 'foot', side, a: s.ankle[side], b: s.toe[side] },
    );
  }
  return out;
}

function jointPoints(s: Skeleton): Vec3[] {
  const pts: Vec3[] = [s.pelvis, s.chest, s.neckTop, s.head, [s.head[0] + s.headDir[0] * HEAD.half, s.head[1] + s.headDir[1] * HEAD.half, s.head[2] + s.headDir[2] * HEAD.half]];
  for (const k of ['shoulder', 'elbow', 'hand', 'hip', 'knee', 'ankle', 'toe'] as const) pts.push(s[k].L, s[k].R);
  return pts;
}

export interface FigureFit {
  scale: number;
  /** Every joint of the figure (and of the ghost) in dial coordinates. */
  points: Array<[number, number]>;
  /** A world point to dial coordinates plus its depth. */
  map(v: Vec3): [x: number, y: number, depth: number];
}

/** The per-pose scale and centring: the spike's rule `min(96, 158 / max(w, h), 182 / hypot(w, h))` over the projected joints. */
export function figureFit(p: DialPose, other?: DialPose): FigureFit {
  return fitOf([pose(p), ...(other ? [pose(other)] : [])]);
}

function fitOf(skeletons: Skeleton[]): FigureFit {
  const flat = skeletons.flatMap(jointPoints).map((v) => project(v));
  const xs = flat.map((v) => v[0]);
  const ys = flat.map((v) => v[1]);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const scale = Math.min(96, 158 / Math.max(w, h, 0.2), 182 / Math.max(Math.hypot(w, h), 0.2));
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const map = (v: Vec3): [number, number, number] => {
    const [x, y, d] = project(v);
    return [CX + (x - cx) * scale, CY - (y - cy) * scale, d];
  };
  return { scale, points: flat.map((v) => [CX + (v[0] - cx) * scale, CY - (v[1] - cy) * scale] as [number, number]), map };
}

const svg = (tag: string, attrs: Record<string, string | number>): SVGElement => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};
const r1 = (n: number): number => Math.round(n * 10) / 10;
const line = (a: [number, number, number], b: [number, number, number]): string => `M${r1(a[0])} ${r1(a[1])}L${r1(b[0])} ${r1(b[1])}`;

/** The mannequin of a pose, as an SVG of viewBox `0 0 200 200`. */
export function mannequinSvg(p: DialPose, opts: DialFigureOpts = {}): SVGSVGElement {
  const sk = opts.body ?? pose(p);
  const fit = opts.body ? fitOf([sk, ...(opts.target ? [pose(opts.target)] : [])]) : figureFit(p, opts.target);
  const { map, scale } = fit;
  const root = svg('svg', { viewBox: '0 0 200 200', class: 'alius-mannequin', 'aria-hidden': 'true', focusable: 'false' }) as SVGSVGElement;
  if (opts.size !== undefined) {
    root.setAttribute('width', String(opts.size));
    root.setAttribute('height', String(opts.size));
  }
  const all = jointPoints(sk);

  // the floor under the whole body (a lying body never hangs over its edge), then what the posture leans on or reaches for
  const fx = sk.pelvis[0];
  const minX = Math.min(...all.map((v) => v[0]), fx - 0.32) - 0.12;
  const maxX = Math.max(...all.map((v) => v[0]), fx + 0.32) + 0.12;
  const minZ = Math.min(...all.map((v) => v[2]));
  const maxZ = Math.max(...all.map((v) => v[2]));
  const quad = (pts: Vec3[], cls: string, data: Record<string, string> = {}): SVGElement =>
    svg('polygon', { class: cls, ...data, points: pts.map((v) => map(v)).map((q) => `${r1(q[0])},${r1(q[1])}`).join(' ') });
  root.append(quad([[minX, 0, minZ - 0.16], [maxX, 0, minZ - 0.16], [maxX, 0, maxZ + 0.16], [minX, 0, maxZ + 0.16]], 'alius-mq-floor'));
  // a wall behind the back, or before the face: a plane, not a stick
  const wallTop = Math.min(1.85, Math.max(...all.map((v) => v[1])) + 0.3);
  if (p.hint === 'wall') root.append(quad([[minX, 0, minZ - 0.08], [maxX, 0, minZ - 0.08], [maxX, wallTop, minZ - 0.08], [minX, wallTop, minZ - 0.08]], 'alius-mq-hint alius-mq-plane', { 'data-hint': 'wall' }));
  // a seat under a sitting body (a stool: its top and two legs)
  if (p.base === 'sitting') {
    const [px, py, pz] = sk.pelvis;
    const top = py - 0.06;
    root.append(quad([[px - 0.24, top, pz - 0.2], [px + 0.24, top, pz - 0.2], [px + 0.24, top, pz + 0.22], [px - 0.24, top, pz + 0.22]], 'alius-mq-hint alius-mq-plane', { 'data-hint': 'seat' }));
    for (const dx of [-0.2, 0.2]) root.append(svg('path', { class: 'alius-mq-hint', 'data-hint': 'seat', d: line(map([px + dx, top, pz + 0.18]), map([px + dx, 0, pz + 0.18])) }));
  }
  // her feet in front of the commander: two small soles on the floor
  if (p.hint === 'feet') {
    for (const dx of [-0.09, 0.09]) root.append(quad([[fx + dx - 0.045, 0.01, maxZ + 0.18], [fx + dx + 0.045, 0.01, maxZ + 0.18], [fx + dx + 0.045, 0.01, maxZ + 0.44], [fx + dx - 0.045, 0.01, maxZ + 0.44]], 'alius-mq-hint alius-mq-plane', { 'data-hint': 'feet' }));
  }
  // contact shadows where the body meets the floor
  const near: Array<[Vec3, number]> = [];
  for (const k of ['hand', 'knee', 'ankle', 'toe', 'elbow', 'hip', 'shoulder'] as const) near.push([sk[k].L, 0.07], [sk[k].R, 0.07]);
  near.push([sk.pelvis, 0.12], [sk.chest, 0.13], [sk.head, 0.09]);
  for (const [v, rad] of near) {
    if (v[1] > 0.11) continue; // only what touches the floor
    const c = map([v[0], 0, v[2]]);
    root.append(svg('ellipse', { class: 'alius-mq-shadow', cx: r1(c[0]), cy: r1(c[1]), rx: r1(rad * scale * 1.15), ry: r1(rad * scale * 0.45) }));
  }

  // the ghost: the target posture, dashed strokes only
  if (opts.target) {
    const ghost = svg('g', { class: 'alius-mq-ghost' });
    const gs = pose(opts.target);
    for (const s of segmentsOf(gs)) ghost.append(svg('path', { class: 'alius-mq-ghost-seg', 'stroke-dasharray': '3 3', d: line(map(s.a), map(s.b)) }));
    const gh = map(gs.head);
    const gTop = map([gs.head[0] + gs.headDir[0], gs.head[1] + gs.headDir[1], gs.head[2] + gs.headDir[2]]);
    // the head: from the pivot at the neck's top to the crown (gTop is one body unit from the centre along the head's axis)
    ghost.append(svg('path', { class: 'alius-mq-ghost-seg', 'stroke-dasharray': '3 3', d: line(map(gs.neckTop), [gh[0] + (gTop[0] - gh[0]) * HEAD.half, gh[1] + (gTop[1] - gh[1]) * HEAD.half, 0]) }));
    root.append(ghost);
  }

  if (p.hint === 'desk') {
    // the desk top at the hands' height, from just in front of the hips to past the hands (a body bent over it lies on it)
    const hz = Math.max(sk.hand.L[2], sk.hand.R[2]);
    const hy = Math.min(sk.hand.L[1], sk.hand.R[1]) - 0.02;
    const near0 = Math.min(sk.pelvis[2] + 0.12, hz - 0.3);
    root.append(quad([[fx - 0.5, hy, near0], [fx + 0.5, hy, near0], [fx + 0.5, hy, hz + 0.14], [fx - 0.5, hy, hz + 0.14]], 'alius-mq-hint alius-mq-plane', { 'data-hint': 'desk' }));
  }

  // the body: far to near (ascending depth); each capsule is an outline under a fill
  const body = svg('g', { class: 'alius-mq-body' });
  const farSide = project(sk.shoulder.L)[2] < project(sk.shoulder.R)[2] ? 'L' : 'R';
  const back = (v: Vec3): boolean => {
    // behind the torso: on the far side of the plane through the spine that faces where the body faces
    const spine: Vec3 = [sk.chest[0] - sk.pelvis[0], sk.chest[1] - sk.pelvis[1], sk.chest[2] - sk.pelvis[2]];
    const sideways: Vec3 = [1, 0, 0];
    const front: Vec3 = [sideways[1] * spine[2] - sideways[2] * spine[1], sideways[2] * spine[0] - sideways[0] * spine[2], sideways[0] * spine[1] - sideways[1] * spine[0]];
    const rel: Vec3 = [v[0] - sk.pelvis[0], v[1] - sk.pelvis[1], v[2] - sk.pelvis[2]];
    return rel[0] * front[0] + rel[1] * front[1] + rel[2] * front[2] < -0.06;
  };
  const trunk = segmentsOf(sk).filter((s) => s.seg === 'torso' || s.seg === 'pelvis').map((s) => (map(s.a)[2] + map(s.b)[2]) / 2);
  const torsoDepth = Math.min(...trunk);
  const placed = segmentsOf(sk).map((s) => {
    const a = map(s.a);
    const b = map(s.b);
    let depth = (a[2] + b[2]) / 2;
    if ((s.seg === 'forearm' || s.seg === 'upperArm') && back(s.b)) depth = Math.min(depth, torsoDepth - 0.02); // a hand behind the back is hidden by the body
    return { s, a, b, depth };
  }).sort((u, v) => u.depth - v.depth);
  const drawHead = (): void => {
    const c = map(sk.head);
    const top = map([sk.head[0] + sk.headDir[0], sk.head[1] + sk.headDir[1], sk.head[2] + sk.headDir[2]]);
    const angle = (Math.atan2(top[0] - c[0], -(top[1] - c[1])) * 180) / Math.PI;
    body.append(svg('ellipse', {
      class: 'alius-mq-head', cx: r1(c[0]), cy: r1(c[1]), rx: r1(HEAD.width * scale), ry: r1(HEAD.half * scale),
      transform: `rotate(${r1(angle)} ${r1(c[0])} ${r1(c[1])})`,
    }));
    // a dot where the face looks (only when it faces the viewer)
    const face = map([sk.head[0] + sk.faceDir[0] * 0.075, sk.head[1] + sk.faceDir[1] * 0.075, sk.head[2] + sk.faceDir[2] * 0.075]);
    if (face[2] > c[2]) body.append(svg('ellipse', { class: 'alius-mq-face', cx: r1(face[0]), cy: r1(face[1]), rx: r1(0.026 * scale), ry: r1(0.026 * scale) }));
  };
  for (const { s, a, b, depth } of placed) {
    const common = { 'data-seg': s.seg, ...(s.side ? { 'data-side': s.side } : {}), d: line(a, b) };
    const far = s.side === farSide ? ' alius-mq-far' : '';
    const w = THICK[s.seg] * scale;
    body.append(
      svg('path', { class: `alius-mq-out${far}`, ...common, 'data-depth': r1(depth * 1000) / 1000, 'stroke-width': r1(w + OUTLINE * 2) }),
      svg('path', { class: `alius-mq-fill${far}`, ...common, 'stroke-width': r1(w) }),
    );
    if (s.seg === 'neck') drawHead(); // the head is always drawn over its own neck
  }
  root.append(body);
  // a wall before the face is in front of the body: drawn over it, translucent
  if (p.hint === 'wall_front') root.append(quad([[minX, 0, maxZ + 0.04], [maxX, 0, maxZ + 0.04], [maxX, wallTop, maxZ + 0.04], [minX, wallTop, maxZ + 0.04]], 'alius-mq-hint alius-mq-plane', { 'data-hint': 'wall_front' }));

  // held things: one line each
  if (p.item === 'tray') {
    // a flat tray held level on both hands
    const m = mid(sk.hand.L, sk.hand.R);
    const y = m[1] + 0.02;
    root.append(quad([[m[0] - 0.24, y, m[2] - 0.14], [m[0] + 0.24, y, m[2] - 0.14], [m[0] + 0.24, y, m[2] + 0.16], [m[0] - 0.24, y, m[2] + 0.16]], 'alius-mq-item alius-mq-plane', { 'data-item': 'tray' }));
  }
  if (p.item === 'lamp') {
    // a lamp held up in both hands: its stem and its shade
    const m = mid(sk.hand.L, sk.hand.R);
    root.append(svg('path', { class: 'alius-mq-item', 'data-item': 'lamp', d: line(map([m[0], m[1] + 0.02, m[2]]), map([m[0], m[1] + 0.16, m[2]])) }));
    root.append(quad([[m[0] - 0.08, m[1] + 0.16, m[2]], [m[0] + 0.08, m[1] + 0.16, m[2]], [m[0] + 0.05, m[1] + 0.26, m[2]], [m[0] - 0.05, m[1] + 0.26, m[2]]], 'alius-mq-item alius-mq-plane', { 'data-item': 'lamp' }));
  }
  if (p.item === 'rope') {
    // the wrists tied to the ankles
    root.append(svg('path', { class: 'alius-mq-item', 'data-item': 'rope', d: line(map(mid(sk.hand.L, sk.hand.R)), map(mid(sk.ankle.L, sk.ankle.R))) }));
  }
  if (p.item === 'mouth') {
    // something held in the teeth: a short bar across the face
    const f = sk.faceDir;
    const c: Vec3 = [sk.head[0] + f[0] * 0.09 - sk.headDir[0] * 0.05, sk.head[1] + f[1] * 0.09 - sk.headDir[1] * 0.05, sk.head[2] + f[2] * 0.09 - sk.headDir[2] * 0.05];
    root.append(svg('path', { class: 'alius-mq-item', 'data-item': 'mouth', d: line(map([c[0] - 0.07, c[1], c[2]]), map([c[0] + 0.07, c[1], c[2]])) }));
  }

  // the gaze: a faint dashed ray from the head
  if (sk.gazeDir) {
    const g = sk.gazeDir;
    // the ray stops at the floor (a bowed head looks at the floor, not through it)
    const atFloor = g[1] < -1e-6 ? (sk.head[1] - 0.005) / -g[1] : Infinity;
    const end = Math.min(0.46, atFloor);
    if (end > 0.14) { // the face on the floor: no ray
      const from = map([sk.head[0] + g[0] * 0.1, sk.head[1] + g[1] * 0.1, sk.head[2] + g[2] * 0.1]);
      const to = map([sk.head[0] + g[0] * end, sk.head[1] + g[1] * end, sk.head[2] + g[2] * end]);
      root.append(svg('line', {
        class: `alius-mq-gaze${opts.hot?.includes('gaze') ? ' alius-mq-hot' : ''}`, 'stroke-dasharray': '2 3',
        x1: r1(from[0]), y1: r1(from[1]), x2: r1(to[0]), y2: r1(to[1]),
      }));
    }
  }

  // a drifting joint glows
  const ring = (v: Vec3, r: number): void => {
    const c = map(v);
    root.append(svg('circle', { class: 'alius-mq-hot', cx: r1(c[0]), cy: r1(c[1]), r }));
  };
  for (const j of opts.hot ?? []) {
    if (j === 'shoulders') ring(sk.shoulder.L, 4.5), ring(sk.shoulder.R, 4.5);
    else if (j === 'elbows') ring(sk.elbow.L, 4), ring(sk.elbow.R, 4);
    else if (j === 'hips') ring(sk.hip.L, 4.5), ring(sk.hip.R, 4.5);
    else if (j === 'knees') ring(sk.knee.L, 4.5), ring(sk.knee.R, 4.5);
    else if (j === 'head') ring(sk.head, HEAD.half * scale + 3);
  }
  return root;
}
