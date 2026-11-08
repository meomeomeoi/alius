import { describe, it, expect } from 'vitest';
import { Rng, seedRng } from '../../src/engine/rng';

describe('rng', () => {
  it('same seed same sequence', () => {
    const a = new Rng(seedRng(42));
    const b = new Rng(seedRng(42));
    for (let i = 0; i < 100; i++) expect(a.float()).toBe(b.float());
  });

  it('state round-trips through JSON', () => {
    const r = new Rng(seedRng(7));
    for (let i = 0; i < 10; i++) r.float();
    const restored = new Rng(JSON.parse(JSON.stringify(r.state)));
    for (let i = 0; i < 10; i++) expect(restored.float()).toBe(r.float());
  });

  it('int is inclusive and bounded', () => {
    const r = new Rng(seedRng(1));
    const seen = new Set<number>();
    for (let i = 0; i < 10_000; i++) seen.add(r.int(1, 6));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('float in [0,1)', () => {
    const r = new Rng(seedRng(3));
    for (let i = 0; i < 10_000; i++) {
      const f = r.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('pick on empty throws', () => {
    expect(() => new Rng(seedRng(1)).pick([])).toThrow();
  });
});
