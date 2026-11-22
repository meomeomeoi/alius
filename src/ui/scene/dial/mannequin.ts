/**
 * P10e: the commander's body as a posed 3D mannequin: point states in, joint positions out (plain math: no canvas, no library).
 * The pose is built in a body-local frame (x sideways, y up the body, z the way it faces; +x is the figure's left) as
 * an upright variant, then the lying and curled bases are laid down by one rotation and lifted onto the floor. Limbs come
 * from a two-bone solver, so an arm never stretches to reach the floor; a target out of reach is clamped to full extension.
 * `project` is the one fixed three-quarter view (yaw 38°, elevation 14°, orthographic). Drawing is `draw.ts`.
 */
import { BASE_POINTS, type Arms, type DialPose, type PointStates, type Torso } from './points';

export type Vec3 = [number, number, number];

/** The spike's proportions, in body units (the whole standing figure is about 1.8). */
export const LIMB = { upperArm: 0.3, forearm: 0.28, thigh: 0.45, shin: 0.44 } as const;
/** The head is an egg: its long half-axis, its half-width, and the "radius" the pose rules measure by. */
export const HEAD = { half: 0.115, width: 0.085 } as const;
export const HEAD_R = 0.1;

const HIP_HALF = 0.1;
const SHOULDER_HALF = 0.2;
const SPINE = 0.46;
const NECK_BASE = 0.03;
const NECK = 0.14;
const FOOT = 0.17;
const DEG = Math.PI / 180;

export interface Skeleton {
  pelvis: Vec3;
  chest: Vec3;
  neck: Vec3;
  neckTop: Vec3;
  head: Vec3;
  /** From the chin toward the crown (the egg's long axis). */
  headDir: Vec3;
  /** Where the face looks. */
  faceDir: Vec3;
  shoulder: { L: Vec3; R: Vec3 };
  elbow: { L: Vec3; R: Vec3 };
  hand: { L: Vec3; R: Vec3 };
  hip: { L: Vec3; R: Vec3 };
  knee: { L: Vec3; R: Vec3 };
  ankle: { L: Vec3; R: Vec3 };
  toe: { L: Vec3; R: Vec3 };
  /** The eyes' ray (null with the eyes closed). */
  gazeDir: Vec3 | null;
}

// ---------------------------------------------------------------- vectors
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => {
  const l = len(a);
  return l < 1e-9 ? [0, 1, 0] : mul(a, 1 / l);
};
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, mul(sub(b, a), t));

/** Two bones from a fixed root to a target: the middle joint bends toward `hint`; out of reach is clamped to full extension. */
function solveTwoBone(root: Vec3, target: Vec3, l1: number, l2: number, hint: Vec3): { mid: Vec3; end: Vec3 } {
  const to = sub(target, root);
  const reach = len(to);
  const dir = reach < 1e-9 ? ([0, -1, 0] as Vec3) : mul(to, 1 / reach);
  const d = Math.min(l1 + l2 - 1e-6, Math.max(Math.abs(l1 - l2) + 1e-6, reach));
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let side = sub(hint, mul(dir, dot(hint, dir)));
  if (len(side) < 1e-6) side = sub([1, 0, 0], mul(dir, dir[0]));
  if (len(side) < 1e-6) side = sub([0, 0, 1], mul(dir, dir[2]));
  const end = add(root, mul(dir, d));
  const mid = add(add(root, mul(dir, a)), mul(unit(side), h));
  return { mid, end };
}

// ---------------------------------------------------------------- the projection
const YAW = 38 * DEG;
const ELEV = 14 * DEG;

/**
 * The fixed three-quarter view, orthographic: x to the right, y up, depth away from the viewer (larger = farther). A figure
 * that faces +z turns its face to the right of the picture; its left side (+x) is the far one.
 */
export function project(v: Vec3): [x: number, y: number, depth: number] {
  const x1 = v[0] * Math.cos(YAW) + v[2] * Math.sin(YAW);
  const z1 = -v[0] * Math.sin(YAW) + v[2] * Math.cos(YAW);
  const up = v[1] * Math.cos(ELEV) - z1 * Math.sin(ELEV);
  const depth = -(v[1] * Math.sin(ELEV) + z1 * Math.cos(ELEV));
  return [x1 + 0, up + 0, depth + 0]; // + 0: no negative zero
}

// ---------------------------------------------------------------- the body
type Side = 'L' | 'R';
const SIDES: Array<[Side, 1 | -1]> = [['L', 1], ['R', -1]];
type FootMode = 'fwd' | 'back' | 'down' | 'down_back';

interface Legs {
  pelvis: Vec3;
  /** The ankle target of the left leg (the right mirrors it in x). */
  ankle: Vec3;
  kneeHint: Vec3;
  foot: FootMode;
}

/** Which bases are laid down, and how: [axis, degrees]. */
const LYING: Record<string, ['x' | 'z', number]> = {
  lying_back: ['x', -90],
  lying_front: ['x', 90],
  lying_side: ['z', 90],
  curled: ['z', 90],
};

function legsOf(base: string, pts: PointStates, hogtie: boolean): Legs {
  const apart = pts.knees === 'apart';
  const toes = pts.feet === 'on_toes';
  switch (base) {
    case 'standing':
    case 'standing_attention': {
      const lat = base === 'standing_attention' ? 0.055 : apart ? 0.26 : 0.1;
      const ay = toes ? 0.19 : 0.06;
      const py = ay + Math.sqrt(0.885 * 0.885 - (lat - HIP_HALF) ** 2);
      return { pelvis: [0, py, 0], ankle: [lat, ay, 0], kneeHint: [0.15, 0, 1], foot: toes ? 'down' : 'fwd' };
    }
    case 'sitting':
      return { pelvis: [0, 0.46, -0.04], ankle: [0.12, 0.05, 0.4], kneeHint: [0.1, 0, 1], foot: 'fwd' };
    case 'sitting_floor':
      return apart
        ? { pelvis: [0, 0.1, 0], ankle: [0.1, 0.05, 0.34], kneeHint: [1, 0.1, 0.3], foot: 'fwd' } // cross-legged: the knees fall out
        : { pelvis: [0, 0.1, 0], ankle: [0.14, 0.05, 0.6], kneeHint: [0.1, 1, 0.5], foot: 'fwd' };
    case 'kneeling_upright':
    case 'kneeling_sitting':
    case 'bowing': {
      const hips = pts.hips ?? (base === 'kneeling_upright' ? 'raised' : 'on_heels');
      const lat = apart ? 0.4 : 0.1;
      const ay = toes ? 0.19 : 0.06;
      const foot: FootMode = toes ? 'down_back' : 'back';
      const hint: Vec3 = apart ? [1, 0, 0.5] : [0.1, 0, 1];
      if (hips === 'raised') return { pelvis: [0, 0.5 + (ay - 0.06), 0.02], ankle: [lat, ay, -0.4], kneeHint: hint, foot };
      if (hips === 'to_floor') return { pelvis: [0, 0.1, -0.24], ankle: [lat + 0.14, 0.05, -0.34], kneeHint: hint, foot };
      return { pelvis: [0, 0.22 + (ay - 0.06) * 0.8, -0.3], ankle: [lat, ay, -0.32], kneeHint: hint, foot };
    }
    case 'all_fours':
      return { pelvis: [0, 0.5, -0.52], ankle: [apart ? 0.3 : 0.1, 0.06, -0.92], kneeHint: [0.1, 0, 1], foot: 'back' };
    case 'crouching':
      return pts.hips === 'raised'
        ? { pelvis: [0, 0.46, -0.02], ankle: [0.1, 0.05, 0.42], kneeHint: [0.1, 0, 1], foot: 'fwd' } // thighs level against a wall
        : { pelvis: [0, 0.3, -0.2], ankle: [0.14, 0.05, 0.04], kneeHint: [0.1, 0.3, 1], foot: 'fwd' };
    case 'curled':
      return { pelvis: [0, 0.95, 0], ankle: [0.08, 0.8, -0.22], kneeHint: [0, 0, 1], foot: 'fwd' };
    default: {
      // lying_back, lying_front, lying_side: straight legs, laid down later (a frog's legs with the knees apart on the back)
      if (hogtie) return { pelvis: [0, 0.95, 0], ankle: [0.05, 0.8, -0.5], kneeHint: [0, 0, 1], foot: 'fwd' };
      if (apart && base === 'lying_back') return { pelvis: [0, 0.95, 0], ankle: [0.4, 0.5, 0], kneeHint: [0, 0, 1], foot: 'fwd' };
      return { pelvis: [0, 0.95, 0], ankle: [0.09, 0.07, 0], kneeHint: [0.1, 0, 1], foot: 'fwd' };
    }
  }
}

/** The spine's lean from the vertical toward the front, in degrees. */
function leanOf(base: string, torso: Torso, hogtie: boolean): number {
  if (hogtie) return -35;
  if (torso === 'bent') return base === 'standing' || base === 'standing_attention' ? 80 : 100;
  if (torso === 'forward') return base === 'crouching' ? 35 : base === 'curled' ? 55 : base === 'sitting' ? 26 : 22;
  return { upright: 0, arched: -14, level: 86 }[torso];
}

interface ArmCtx {
  s: 1 | -1;
  shoulder: Vec3;
  chest: Vec3;
  pelvis: Vec3;
  S: Vec3;
  T: Vec3;
  hip: Vec3;
  knee: Vec3;
  ankle: Vec3;
  neckTop: Vec3;
  headDir: Vec3;
  faceDir: Vec3;
  lying: boolean;
}

/** Where a hand goes and where the elbow points, per arm state (in the body-local frame, so a lying body keeps its arms along it). */
function armGoal(state: Arms, c: ArmCtx): { target: Vec3; hint: Vec3 } {
  const { s, shoulder: sh, chest, pelvis, S, T } = c;
  const lat = (k: number): Vec3 => [s * k, 0, 0];
  switch (state) {
    case 'at_sides': return { target: add(sh, [s * 0.03, -0.575, 0]), hint: [s, -0.1, -0.6] };
    case 'behind_back': return { target: add(sub(add(pelvis, mul(S, 0.12)), mul(T, 0.12)), lat(0.04)), hint: [s, -0.2, -0.3] };
    case 'bound': return { target: add(sub(add(pelvis, mul(S, 0.06)), mul(T, 0.11)), lat(0.012)), hint: [s, -0.4, -0.2] };
    case 'behind_head': {
      const back = sub(add(c.neckTop, mul(c.headDir, 0.09)), mul(c.faceDir, 0.075));
      return { target: add(back, lat(0.07)), hint: [s, 0.2, -0.1] };
    }
    case 'on_thighs_down': return { target: add(lerp(c.hip, c.knee, 0.45), [0, 0.07, 0]), hint: [s, 0, -0.4] };
    case 'on_thighs_up': return { target: add(lerp(c.hip, c.knee, 0.7), [s * 0.02, 0.06, 0]), hint: [s, 0, -0.4] };
    case 'forward_palms_up':
      return c.lying
        ? { target: add(add(sh, mul(S, 0.56)), [s * 0.1, 0, 0.02]), hint: [s, 0, -0.3] }
        : { target: add(add(chest, mul(T, 0.45)), [s * 0.12, -0.14, 0]), hint: [s, -0.5, 0] };
    case 'out_sideways': return { target: add(sh, [s * 0.56, 0.01, 0]), hint: [0, -0.5, -0.5] };
    case 'raised': return { target: add(sh, [s * 0.1, 0.55, 0.05]), hint: [s, 0, -0.3] };
    case 'holding': return { target: add(add(add(pelvis, mul(S, 0.38)), mul(T, 0.4)), lat(0.11)), hint: [s, -0.6, 0] };
    case 'lamp': return { target: add(sh, [s * 0.06, 0.5, 0.18]), hint: [s, 0, -0.2] };
    case 'on_floor': return { target: [s * 0.2, 0.03, chest[2] + 0.3], hint: [s, 0.3, 0] };
    case 'on_ankles': return { target: add(c.ankle, [0, 0.04, -0.02]), hint: [s, 0, 0.2] };
    case 'under_knees': return { target: [c.knee[0], 0.03, c.knee[2] - 0.03], hint: [s, 0.3, 0] };
    case 'crossed': return { target: add(sub(add(chest, mul(T, 0.1)), mul(S, 0.06)), lat(-0.14)), hint: [s * 0.3, -1, 0.3] };
    case 'clasped_front': return { target: add(add(add(pelvis, mul(S, 0.16)), mul(T, 0.2)), lat(0.025)), hint: [s, -0.5, -0.3] };
    case 'paws': return { target: add(sub(add(chest, mul(T, 0.24)), mul(S, 0.1)), lat(0.1)), hint: [s, -1, 0] };
    case 'tucked': return { target: add(sub(add(chest, mul(T, 0.16)), mul(S, 0.14)), lat(0.07)), hint: [s, -0.5, 0.3] };
    case 'desk_flat': return { target: [s * 0.2, 0.76, sh[2] + 0.3], hint: [s, 0.3, 0] };
  }
}

const footVector = (m: FootMode): Vec3 =>
  mul(unit(m === 'fwd' ? [0, -0.25, 1] : m === 'back' ? [0, -0.05, -1] : m === 'down' ? [0, -1, 0.2] : [0, -1, -0.15]), FOOT);

function rotate(v: Vec3, axis: 'x' | 'z', deg: number): Vec3 {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return axis === 'x' ? [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c] : [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
}

/** The skeleton of a dial pose. An unknown base is drawn as standing. */
export function pose(p: DialPose): Skeleton {
  const base = BASE_POINTS[p.base] ? p.base : 'standing';
  const pts: PointStates = { ...BASE_POINTS[base], ...p.points };
  const hogtie = p.hogtie === true;
  const legs = legsOf(base, pts, hogtie);
  const lying = LYING[base] !== undefined;

  // spine, neck, head
  const phi = leanOf(base, pts.torso ?? 'upright', hogtie) * DEG;
  const S: Vec3 = [0, Math.cos(phi), Math.sin(phi)];
  const T: Vec3 = [0, -Math.sin(phi), Math.cos(phi)];
  const pelvis = legs.pelvis;
  const chest = add(pelvis, mul(S, SPINE));
  const neck = add(chest, mul(S, NECK_BASE));
  const phiN = phi * 0.55;
  const neckTop = add(neck, mul([0, Math.cos(phiN), Math.sin(phiN)], NECK));
  const pitch = { up: 0, bowed: 38, back: -55, to_floor: 90 }[pts.head ?? 'up'];
  let theta = phi * 0.35 + pitch * DEG;
  if (pts.head === 'back') theta = Math.min(theta, -Math.asin(0.35)); // a tilt back always lifts the chin
  const headDir: Vec3 = [0, Math.cos(theta), Math.sin(theta)];
  const faceDir: Vec3 = [0, -Math.sin(theta), Math.cos(theta)];
  const head = add(neckTop, mul(headDir, 0.1));
  const gazeDir =
    pts.gaze === 'closed' ? null
    : pts.gaze === 'down' ? unit(add(faceDir, [0, -0.8, 0]))
    : pts.gaze === 'at_her' ? unit(add(faceDir, [0, 0.27, 0]))
    : faceDir;

  // legs
  const hip = { L: add(pelvis, [HIP_HALF, 0, 0]), R: add(pelvis, [-HIP_HALF, 0, 0]) };
  const knee = { L: [0, 0, 0] as Vec3, R: [0, 0, 0] as Vec3 };
  const ankle = { L: [0, 0, 0] as Vec3, R: [0, 0, 0] as Vec3 };
  const toe = { L: [0, 0, 0] as Vec3, R: [0, 0, 0] as Vec3 };
  for (const [side, s] of SIDES) {
    const target: Vec3 = [s * legs.ankle[0], legs.ankle[1], legs.ankle[2]];
    const hint: Vec3 = [s * legs.kneeHint[0], legs.kneeHint[1], legs.kneeHint[2]];
    // the pelvis is the middle of the hip joints: the target is already in body coordinates
    const sol = solveTwoBone(hip[side], target, LIMB.thigh, LIMB.shin, hint);
    knee[side] = sol.mid;
    ankle[side] = sol.end;
    const f = footVector(legs.foot);
    toe[side] = add(sol.end, [s * 0.02, f[1], f[2]]); // the toes splay a little
  }

  // arms
  const shoulder = { L: add(chest, [SHOULDER_HALF, 0, 0]), R: add(chest, [-SHOULDER_HALF, 0, 0]) };
  const elbow = { L: [0, 0, 0] as Vec3, R: [0, 0, 0] as Vec3 };
  const hand = { L: [0, 0, 0] as Vec3, R: [0, 0, 0] as Vec3 };
  for (const [side, s] of SIDES) {
    const goal = armGoal(pts.arms ?? 'at_sides', {
      s, shoulder: shoulder[side], chest, pelvis, S, T, hip: hip[side], knee: knee[side],
      ankle: hogtie ? lerp(ankle.L, ankle.R, 0.5) : ankle[side], neckTop, headDir, faceDir, lying,
    });
    const target = hogtie ? lerp(ankle.L, ankle.R, 0.5) : goal.target;
    const sol = solveTwoBone(shoulder[side], target, LIMB.upperArm, LIMB.forearm, hogtie ? [s, 0, 0.3] : goal.hint);
    elbow[side] = sol.mid;
    hand[side] = sol.end;
  }

  const sk: Skeleton = { pelvis, chest, neck, neckTop, head, headDir, faceDir, shoulder, elbow, hand, hip, knee, ankle, toe, gazeDir };
  const laid = LYING[base];
  return laid ? lay(sk, laid[0], laid[1]) : sk;
}

/** Lays an upright skeleton down (one rotation) and lifts it so the lowest point rests on the floor. */
function lay(sk: Skeleton, axis: 'x' | 'z', deg: number): Skeleton {
  const r = (v: Vec3): Vec3 => rotate(v, axis, deg);
  const pair = (o: { L: Vec3; R: Vec3 }): { L: Vec3; R: Vec3 } => ({ L: r(o.L), R: r(o.R) });
  const turned: Skeleton = {
    pelvis: r(sk.pelvis), chest: r(sk.chest), neck: r(sk.neck), neckTop: r(sk.neckTop), head: r(sk.head),
    headDir: r(sk.headDir), faceDir: r(sk.faceDir), shoulder: pair(sk.shoulder), elbow: pair(sk.elbow), hand: pair(sk.hand),
    hip: pair(sk.hip), knee: pair(sk.knee), ankle: pair(sk.ankle), toe: pair(sk.toe), gazeDir: sk.gazeDir ? r(sk.gazeDir) : null,
  };
  const points: Vec3[] = [turned.pelvis, turned.chest, turned.neckTop];
  for (const k of ['shoulder', 'elbow', 'hand', 'hip', 'knee', 'ankle', 'toe'] as const) points.push(turned[k].L, turned[k].R);
  const lowest = Math.min(...points.map((v) => v[1]), turned.head[1] - 0.09);
  const lift = 0.04 - lowest;
  const up = (v: Vec3): Vec3 => [v[0], v[1] + lift, v[2]];
  const upPair = (o: { L: Vec3; R: Vec3 }): { L: Vec3; R: Vec3 } => ({ L: up(o.L), R: up(o.R) });
  return {
    ...turned,
    pelvis: up(turned.pelvis), chest: up(turned.chest), neck: up(turned.neck), neckTop: up(turned.neckTop), head: up(turned.head),
    shoulder: upPair(turned.shoulder), elbow: upPair(turned.elbow), hand: upPair(turned.hand), hip: upPair(turned.hip),
    knee: upPair(turned.knee), ankle: upPair(turned.ankle), toe: upPair(turned.toe),
  };
}
