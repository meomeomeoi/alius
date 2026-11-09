import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { advanceClock } from '../../../src/engine/world/clocks';
import { applyWorldEffects } from '../../../src/engine/world/effects';
import { clockById } from '../../../src/engine/world/state';
import { campaign, ctxOf, loadCore, ofType } from '../../helpers/world';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});

function advance(state: CampaignState, clockId: string, by: number, regs: Registries = reg) {
  const draft = structuredClone(state);
  const events = advanceClock(draft, ctxOf(draft, regs), clockId, by, 'test');
  return { draft, events };
}
const withFilled = (id: string, filled: number): CampaignState => {
  const s = structuredClone(base);
  s.world.clocks.find((c) => c.id === id)!.filled = filled;
  return s;
};

describe('clocks', () => {
  it('advances and reports', () => {
    const r = advance(base, 'bloom_d7', 2);
    expect(clockById(r.draft, 'bloom_d7')!.filled).toBe(clockById(base, 'bloom_d7')!.filled + 2);
    expect(ofType(r.events, 'clock_advanced')).toEqual([{ type: 'clock_advanced', clockId: 'bloom_d7', filled: clockById(base, 'bloom_d7')!.filled + 2, by: 2, reason: 'test' }]);
    expect(ofType(r.events, 'clock_filled')).toEqual([]);
  });

  it('fills, runs onFill once and stays full', () => {
    // corridor_quota (6 segments): its fill advances oversight by 1
    const s = withFilled('corridor_quota', 5);
    const oversight = clockById(s, 'oversight')!.filled;
    const r = advance(s, 'corridor_quota', 2);
    expect(clockById(r.draft, 'corridor_quota')!.filled).toBe(6);
    expect(clockById(r.draft, 'corridor_quota')!.filledDay).toBe(s.day);
    expect(ofType(r.events, 'clock_filled')).toHaveLength(1);
    expect(clockById(r.draft, 'oversight')!.filled).toBe(oversight + 1);
    const again = advance(r.draft, 'corridor_quota', 1);
    expect(again.events).toEqual([]);
    expect(clockById(again.draft, 'oversight')!.filled).toBe(oversight + 1);
    // a full non-repeating clock does not go back either
    expect(advance(r.draft, 'corridor_quota', -1).draft.world.clocks).toEqual(r.draft.world.clocks);
  });

  it('repeat clock resets', () => {
    const s = withFilled('oversight', 5);
    s.leash.authorizationsLeft = 2;
    const r = advance(s, 'oversight', 1);
    expect(ofType(r.events, 'clock_filled')).toHaveLength(1);
    expect(clockById(r.draft, 'oversight')!.filled).toBe(0);
    expect(r.draft.leash.authorizationsLeft).toBe(1);
    expect(r.draft.memory.facts.some((f) => f.text === 'Oversight opened a file on the unit.')).toBe(true);
    // and it fills again later
    const second = advance({ ...r.draft, world: { ...r.draft.world, clocks: r.draft.world.clocks.map((c) => (c.id === 'oversight' ? { ...c, filled: 5 } : c)) } }, 'oversight', 2);
    expect(ofType(second.events, 'clock_filled')).toHaveLength(1);
  });

  it('negative advance cannot go below 0', () => {
    const s = withFilled('bloom_d7', 1);
    const r = advance(s, 'bloom_d7', -2);
    expect(clockById(r.draft, 'bloom_d7')!.filled).toBe(0);
    expect(ofType(r.events, 'clock_advanced')[0]).toMatchObject({ filled: 0, by: -1 });
    expect(advance(r.draft, 'bloom_d7', -2).events).toEqual([]);
  });

  it('an unknown clock is ignored', () => {
    expect(advance(base, 'nope', 1).events).toEqual([]);
  });

  it('a clock whose registry entry is gone still fills, without effects', () => {
    const regs = { ...reg, clocks: new Map(reg.clocks) } as Registries;
    regs.clocks.delete('corridor_quota');
    const s = withFilled('corridor_quota', 5);
    const r = advance(s, 'corridor_quota', 1, regs);
    expect(ofType(r.events, 'clock_filled')).toHaveLength(1);
  });

  it('two clocks filling each other stop at depth 3', () => {
    const regs = { ...reg, clocks: new Map(reg.clocks) } as Registries;
    const loop = (id: string, other: string) => ({
      id, label: id, segments: 4, startFilled: 0, visibleToPlayer: true, repeat: true,
      onFill: [{ type: 'clock', clockId: other, by: 2 }, { type: 'clock', clockId: other, by: 2 }],
    });
    regs.clocks.set('loop_a', loop('loop_a', 'loop_b') as never);
    regs.clocks.set('loop_b', loop('loop_b', 'loop_a') as never);
    const s = structuredClone(base);
    for (const id of ['loop_a', 'loop_b']) s.world.clocks.push({ id, label: id, segments: 4, filled: 0, visibleToPlayer: true });
    const draft = structuredClone(s);
    const events = applyWorldEffects(draft, ctxOf(draft, regs), [{ type: 'clock', clockId: 'loop_a', by: 2 }, { type: 'clock', clockId: 'loop_a', by: 2 }],
      { kind: 'event', id: 'evt' });
    expect(ofType(events, 'clock_filled').map((e) => e.clockId)).toEqual(['loop_a', 'loop_b', 'loop_a', 'loop_b']);
  });
});
