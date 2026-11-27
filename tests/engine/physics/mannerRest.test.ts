/**
 * P15b Task 4: the jaw's rest by her warmth (spec §3). The physics layer imports nothing of the dynamic: `registerPhysicsManner` is the hook the
 * dynamic's readers plug into (chunk m3 reuses it), `physicsMannerOf` the reader, `ResolveEnv.warmth` how a segment gets it. At 0, or without a
 * manner, the rest rule is the style's: cruel and vindictive refuse.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { installDynamicHooks } from '../../../src/engine/dynamic/hooks';
import type { MannerAxis } from '../../../src/engine/dynamic/types';
import { resolveEnvOf, resolveSegment, type ResolveEnv } from '../../../src/engine/physics/segment';
import { physicsMannerOf, registerPhysicsManner, resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { PhysicsRun, SegmentInput, SegmentPlan } from '../../../src/engine/physics/state';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { loadCore } from '../../helpers/world';
import { ANN, unitOf, world } from '../practice/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => resetPhysicsHooks());

const ZERO: Record<MannerAxis, number> = { intensity: 0, warmth: 0, order: 0, voice: 0, tempo: 0, curiosity: 0 };
const mk = (): PhysicsRun => ({ id: 'p1', physicsId: 'jaw', sourceKind: 'contact', sourceId: 'sole_to_mouth', holderId: ANN, gauge: 40, capacity: 100, segment: { n: 1, state: 'running' }, startedExchange: 0, taps: 0, streak: 0, extend: 0 });
const quiet = (): SegmentPlan => ({ beats: Array.from({ length: 4 }, () => ({ attention: 'busy' as const })) });
const rest: SegmentInput = { beat: 1, kind: 'ask_rest' };
const env = (over: Partial<ResolveEnv> = {}): ResolveEnv => ({ gaugeKind: 'fill', interaction: 'gesture', style: { primary: 'neutral' }, sealLevel: 0, band: 'noticeable', ...over });
const granted = (style: string, warmth?: number) => resolveSegment(mk(), quiet(), [rest], env({ style: { primary: style } as never, ...(warmth !== undefined ? { warmth } : {}) })).restGranted;

describe('the jaw rest by warmth', () => {
  it('without a warmth, or at 0 or ±1, the style decides: cruel and vindictive refuse, the rest grant', () => {
    for (const w of [undefined, 0, 1, -1]) {
      expect(granted('cruel', w)).toBe(false);
      expect(granted('vindictive', w)).toBe(false);
      expect(granted('neutral', w)).toBe(true);
      expect(granted('affectionate', w)).toBe(true);
    }
  });
  it('warmth +2 grants whatever the style, -2 refuses whatever the style', () => {
    expect(granted('cruel', 2)).toBe(true);
    expect(granted('vindictive', 2)).toBe(true);
    expect(granted('neutral', -2)).toBe(false);
    expect(granted('affectionate', -2)).toBe(false);
  });
  it('a refused rest gives nothing back; a granted one takes the rest off', () => {
    expect(resolveSegment(mk(), quiet(), [rest], env({ warmth: -2 })).gauge).toBe(40 + TUNING.physics.jaw.per * 2);
    expect(resolveSegment(mk(), quiet(), [rest], env({ style: { primary: 'cruel' }, warmth: 2 })).gauge).toBe(40 + TUNING.physics.jaw.per * 2 - TUNING.physics.jawRest);
  });
});

describe('registerPhysicsManner / physicsMannerOf', () => {
  const holder = (axes: Partial<Record<MannerAxis, number>> | null): CampaignState => {
    const s = world(reg, 'role');
    if (axes !== null) unitOf(s, ANN).bond!.practice!.manner = { ...ZERO, ...axes };
    return s;
  };
  it('answers null until a reader is registered, and the first answer wins', () => {
    expect(physicsMannerOf(holder({ warmth: 2 }), ANN, reg)).toBeNull();
    registerPhysicsManner(() => null);
    registerPhysicsManner(() => ({ ...ZERO, warmth: 1 }));
    registerPhysicsManner(() => ({ ...ZERO, warmth: -1 }));
    expect(physicsMannerOf(holder(null), ANN, reg)).toEqual({ ...ZERO, warmth: 1 });
  });
  it('the dynamic reads her axes for a live holder, and nothing for one with no manner', () => {
    installDynamicHooks();
    expect(physicsMannerOf(holder({ warmth: 2, tempo: -1 }), ANN, reg)).toEqual({ ...ZERO, warmth: 2, tempo: -1 });
    expect(physicsMannerOf(holder(null), ANN, reg)).toBeNull();
    expect(physicsMannerOf(holder({ warmth: 2 }), 'unit_bea', reg)).toBeNull();
  });
  it('resolveEnvOf carries her warmth, and only when it is not 0', () => {
    installDynamicHooks();
    expect(resolveEnvOf(holder({ warmth: 2 }), reg, mk()).warmth).toBe(2);
    expect(resolveEnvOf(holder({ warmth: 0, tempo: 2 }), reg, mk())).not.toHaveProperty('warmth');
    expect(resolveEnvOf(holder(null), reg, mk())).not.toHaveProperty('warmth');
  });
});
