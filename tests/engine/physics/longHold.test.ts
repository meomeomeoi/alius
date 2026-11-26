/**
 * P10e-e Task 24b: the long hold's drain (`longHoldStrain`, a scene setting mirrored like `marathonPace`): a weight run inside her frame drains
 * × `LONG_HOLD` (light .25, normal .35, heavy .6, raw 1); a run outside a frame is unchanged (the seeded tests and the goldens stay put).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENE_SETTINGS, LONG_HOLD, parseSceneSettings, sceneSettingsOf } from '../../../src/engine/moments/settings';
import { resolveSegment, type ResolveEnv } from '../../../src/engine/physics/segment';
import type { PhysicsRun, SegmentPlan } from '../../../src/engine/physics/state';
import { TUNING } from '../../../src/engine/tuning';

const plan = (): SegmentPlan => ({ beats: [0, 1, 2, 3].map(() => ({ attention: 'busy' as const })) });
const run = (over: Partial<PhysicsRun> = {}): PhysicsRun => ({
  id: 'p1', physicsId: 'weight', sourceKind: 'contact', sourceId: 'human_chair', holderId: 'u', gauge: 100, capacity: 100, segment: { n: 1, state: 'running' },
  startedExchange: 0, taps: 0, streak: 0, extend: 0, ...over,
});
const env = (longHold?: number): ResolveEnv => ({ gaugeKind: 'capacity', interaction: 'hold', style: { primary: 'neutral' }, sealLevel: 0, band: 'noticeable', ...(longHold !== undefined ? { longHold } : {}) });
const holds = [0, 1, 2, 3].map((beat) => ({ beat, kind: 'hold' as const }));

describe('longHoldStrain (24b)', () => {
  it('the table is the plan\'s; the default is normal; an old mirror without it reads normal; a bad value is refused', () => {
    expect(LONG_HOLD).toEqual({ light: 0.25, normal: 0.35, heavy: 0.6, raw: 1 });
    expect(DEFAULT_SCENE_SETTINGS.longHoldStrain).toBe('normal');
    expect(sceneSettingsOf({ settings: {} } as never).longHoldStrain).toBe('normal');
    expect(sceneSettingsOf({ settings: { longHoldStrain: 'raw' } } as never).longHoldStrain).toBe('raw');
    const base = { momentFrequency: 'normal', momentExplicit: 'rarer', physicsRealtime: false, physicsInteractions: Object.fromEntries(Object.keys(DEFAULT_SCENE_SETTINGS.physicsInteractions).map((k) => [k, true])), marathonPace: 'normal' };
    expect(typeof parseSceneSettings({ ...base, longHoldStrain: 'brutal' })).toBe('string');
    expect(parseSceneSettings(base)).toMatchObject({ longHoldStrain: 'normal' });
  });

  it('normal scales a framed weight run\'s drain to 0.35, raw to 1; outside a frame it is unchanged', () => {
    const d = TUNING.physics.weight.drain;
    expect(resolveSegment(run({ sourceKind: 'activity', sourceId: 'holding_audience' }), plan(), holds, env(LONG_HOLD.normal)).gauge).toBeCloseTo(100 - 4 * d * 0.35, 6);
    expect(resolveSegment(run({ sourceKind: 'activity', sourceId: 'holding_audience' }), plan(), holds, env(LONG_HOLD.raw)).gauge).toBeCloseTo(100 - 4 * d, 6);
    expect(resolveSegment(run(), plan(), holds, env()).gauge).toBeCloseTo(100 - 4 * d, 6);
  });

  it('a slip costs as before inside the frame (the prototype scales only the flowing drain)', () => {
    const d = TUNING.physics.weight.drain;
    const g = resolveSegment(run({ sourceKind: 'activity', sourceId: 'holding_audience' }), plan(), holds.slice(1), env(LONG_HOLD.normal)).gauge;
    expect(g).toBeCloseTo(100 - 4 * d * 0.35 - d, 6);
  });
});
