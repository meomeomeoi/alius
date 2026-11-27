import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { noteClean, settlingDue, settlingModifier } from '../../../src/engine/craft/streak';
import { Rng } from '../../../src/engine/rng';
import { TUNING } from '../../../src/engine/tuning';
import { loadCore } from '../../helpers/world';
import { ANN, BEA, unitOf, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

describe('her settling-in count', () => {
  it('counts clean holds of a kind in a row, a slip resets it, and a kind is independent', () => {
    const s = world(reg, 'play');
    noteClean(s, ANN, 'weight', true);
    noteClean(s, ANN, 'weight', true);
    noteClean(s, ANN, 'breath', true);
    expect(s.relations[ANN].craft!.streak).toEqual({ weight: 2, breath: 1 });
    noteClean(s, ANN, 'weight', false);
    expect(s.relations[ANN].craft!.streak).toEqual({ breath: 1 });
    noteClean(s, ANN, 'weight', false); // nothing to reset: nothing written
    expect(s.relations[ANN].craft!.streak).toEqual({ breath: 1 });
  });

  it('a reset of a pair that has no count writes nothing', () => {
    const s = world(reg, 'play');
    noteClean(s, ANN, 'weight', false);
    expect(s.relations[ANN].craft).toBeUndefined();
    noteClean(s, 'nobody', 'weight', true);
  });

  it('is due after three clean holds in a row, and only for a craft-live holder', () => {
    const s = world(reg, 'play');
    for (let i = 0; i < 2; i++) noteClean(s, ANN, 'weight', true);
    expect(settlingDue(s, reg, ANN, 'weight')).toBe(false);
    noteClean(s, ANN, 'weight', true);
    expect(settlingDue(s, reg, ANN, 'weight')).toBe(true);
    expect(settlingDue(s, reg, ANN, 'breath')).toBe(false);
    noteClean(s, ANN, 'weight', false);
    expect(settlingDue(s, reg, ANN, 'weight')).toBe(false);
    for (let i = 0; i < 3; i++) noteClean(s, ANN, 'weight', true);
    s.relations[ANN].dynamic!.frame = 'equal';
    expect(settlingDue(s, reg, ANN, 'weight')).toBe(false);
    expect(settlingDue(s, reg, BEA, 'weight')).toBe(false);
  });
});

describe('the load she adds', () => {
  it('is one the style likes, stable for a day, and draws nothing', () => {
    const s = world(reg, 'play');
    const liked = TUNING.craft.settling.byStyle.cold!;
    const first = settlingModifier(s, reg, ANN)!;
    expect(liked).toContain(first);
    const before = JSON.stringify(s.rng);
    const next = vi.spyOn(Rng.prototype as unknown as { next: () => number }, 'next');
    for (let i = 0; i < 5; i++) expect(settlingModifier(s, reg, ANN)).toBe(first);
    expect(next).not.toHaveBeenCalled();
    next.mockRestore();
    expect(JSON.stringify(s.rng)).toBe(before);
  });

  it('every style of the table gives one of its own list, and a style without a row any load', () => {
    for (const [style, list] of Object.entries(TUNING.craft.settling.byStyle)) {
      const s = world(reg, 'play');
      unitOf(s, ANN).bond!.practice!.style = { primary: style as never };
      for (let d = 0; d < 20; d++) {
        s.day = 20 + d;
        expect(list, style).toContain(settlingModifier(s, reg, ANN));
      }
    }
    const s = world(reg, 'play');
    unitOf(s, ANN).bond!.practice!.style = { primary: 'unlisted' as never };
    const seen = new Set<string>();
    for (let d = 0; d < 60; d++) { s.day = 20 + d; seen.add(settlingModifier(s, reg, ANN)!); }
    expect([...seen].sort()).toEqual([...TUNING.craft.settling.modifiers].sort());
  });

  it('is null for a holder who is not craft-live', () => {
    expect(settlingModifier(world(reg, 'equal'), reg, ANN)).toBeNull();
    expect(settlingModifier(world(reg, 'play'), reg, BEA)).toBeNull();
  });
});
