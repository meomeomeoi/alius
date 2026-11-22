import { describe, expect, it } from 'vitest';
import blockingPostures from '../../../content/core/blockingPostures.json';
import { PRESETS } from '../../fixtures/dial/presets';
import { BASE_POINTS, poseOf, type DialPose } from '../../../src/ui/scene/dial/points';
import { HEAD_R, LIMB, pose, project, type Skeleton, type Vec3 } from '../../../src/ui/scene/dial/mannequin';

const BASES = (blockingPostures as Array<{ id: string }>).map((p) => p.id);
const ALL: Array<{ name: string; pose: DialPose }> = [
  ...BASES.map((b) => ({ name: b, pose: poseOf(b)! })),
  ...PRESETS.map((x) => ({ name: x.id, pose: x as DialPose })),
];

const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const vecs = (s: Skeleton): Vec3[] => {
  const out: Vec3[] = [s.pelvis, s.chest, s.neck, s.neckTop, s.head, s.headDir, s.faceDir];
  for (const k of ['shoulder', 'elbow', 'hand', 'hip', 'knee', 'ankle', 'toe'] as const) out.push(s[k].L, s[k].R);
  if (s.gazeDir) out.push(s.gazeDir);
  return out;
};

describe('the posture mannequin', () => {
  it('the corpus is the 13 bases and the 47 presets', () => {
    expect(BASES).toHaveLength(13);
    expect(PRESETS).toHaveLength(47);
    expect(new Set(PRESETS.map((x) => x.id)).size).toBe(47);
    for (const x of PRESETS) expect(BASES).toContain(x.base);
  });

  it('every base and every fixture preset poses (every coordinate is finite)', () => {
    for (const { name, pose: p } of ALL) {
      const s = pose(p);
      for (const v of vecs(s)) for (const c of v) expect(Number.isFinite(c), name).toBe(true);
      const [x, y, d] = project(s.head);
      expect([x, y, d].every(Number.isFinite), name).toBe(true);
    }
  });

  it('limbs keep their length (the two-bone solver: arms never stretch)', () => {
    const within = (got: number, want: number): boolean => Math.abs(got - want) <= want * 0.02;
    for (const { name, pose: p } of ALL) {
      const s = pose(p);
      for (const side of ['L', 'R'] as const) {
        expect(within(dist(s.shoulder[side], s.elbow[side]), LIMB.upperArm), `${name} upper arm ${side}`).toBe(true);
        expect(within(dist(s.elbow[side], s.hand[side]), LIMB.forearm), `${name} forearm ${side}`).toBe(true);
        expect(within(dist(s.hip[side], s.knee[side]), LIMB.thigh), `${name} thigh ${side}`).toBe(true);
        expect(within(dist(s.knee[side], s.ankle[side]), LIMB.shin), `${name} shin ${side}`).toBe(true);
      }
    }
  });

  it('the head pivots at the top of the neck and a tilt back never puts the skull behind the shoulders', () => {
    const zx = project([0, 0, 1])[0] - project([0, 0, 0])[0]; // the screen direction "forward" for an upright body
    for (const base of ['standing', 'standing_attention', 'sitting', 'kneeling_upright', 'kneeling_sitting']) {
      for (const torso of ['upright', 'arched', 'forward'] as const) {
        const s = pose({ base, points: { head: 'back', torso } });
        expect(dist(s.head, s.neckTop), `${base} ${torso}`).toBeLessThan(0.12);
        const mid: Vec3 = [(s.shoulder.L[0] + s.shoulder.R[0]) / 2, (s.shoulder.L[1] + s.shoulder.R[1]) / 2, (s.shoulder.L[2] + s.shoulder.R[2]) / 2];
        const behind = (project(s.head)[0] - project(mid)[0]) * Math.sign(zx);
        expect(behind, `${base} ${torso}`).toBeGreaterThanOrEqual(-HEAD_R);
        expect(s.faceDir[1], `${base} ${torso}`).toBeGreaterThan(0.3);
      }
    }
  });

  it('kneeling bases: upright is high, sitting back is low, apart widens the knees', () => {
    expect(pose(poseOf('kneeling_upright')!).pelvis[1]).toBeGreaterThanOrEqual(0.45);
    expect(pose(poseOf('kneeling_sitting')!).pelvis[1]).toBeLessThanOrEqual(0.3);
    const gap = (knees: 'together' | 'apart'): number => {
      const s = pose({ base: 'kneeling_upright', points: { knees } });
      return Math.abs(s.knee.L[0] - s.knee.R[0]);
    };
    expect(gap('apart') - gap('together')).toBeGreaterThanOrEqual(0.2);
  });

  it('gaze: closed has no ray, down points below the face', () => {
    expect(pose({ base: 'standing', points: { gaze: 'closed' } }).gazeDir).toBeNull();
    for (const head of ['up', 'bowed', 'back'] as const) {
      const s = pose({ base: 'standing', points: { head, gaze: 'down' } });
      expect(s.gazeDir![1], head).toBeLessThan(s.faceDir[1]);
    }
    expect(pose({ base: 'standing', points: { gaze: 'straight' } }).gazeDir).not.toBeNull();
  });

  it('a lying posture lies on the floor (nothing under it, the body is low)', () => {
    for (const base of ['lying_back', 'lying_front', 'lying_side', 'curled']) {
      const s = pose(poseOf(base)!);
      const ys = [s.pelvis, s.chest, s.head, s.knee.L, s.knee.R, s.hand.L, s.ankle.R].map((v) => v[1]);
      expect(Math.min(...ys), base).toBeGreaterThanOrEqual(-0.001);
      expect(Math.max(...ys), base).toBeLessThan(0.7);
    }
  });

  it('the projection is a fixed three-quarter view (yaw 38, elevation 14)', () => {
    const o = project([0, 0, 0]);
    const x = project([1, 0, 0]);
    const z = project([0, 0, 1]);
    const up = project([0, 1, 0]);
    expect(o).toEqual([0, 0, 0]);
    expect(Math.hypot(x[0], x[1])).toBeGreaterThan(0.7); // the sideways axis is seen at an angle, not foreshortened to nothing
    expect(Math.abs(z[0])).toBeGreaterThan(0.5); // so is the forward one: that is what makes it three-quarter
    expect(up[1]).toBeGreaterThan(0.95);
    expect(z[2]).toBeGreaterThan(0); // depth is toward the viewer: what the figure faces is near, its left side is far
    expect(x[2]).toBeLessThan(0);
  });

  it('poseOf: null for an unknown base, the base row for a known one', () => {
    expect(poseOf('nope')).toBeNull();
    expect(poseOf('standing')).toEqual({ base: 'standing', points: BASE_POINTS.standing });
    expect(Object.keys(BASE_POINTS).sort()).toEqual([...BASES].sort());
  });
});
