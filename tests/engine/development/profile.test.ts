import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { MODEST_BOND, bondOf } from '../../../src/engine/bonds/profile';
import { effectiveProfile, likesOf, dislikesOf, tastesOf, valuesOf } from '../../../src/engine/development/profile';
import type { Development, Unit } from '../../../src/engine/state/types';
import { effectiveValues } from '../../../src/engine/worldOptions/stances';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const dev = (over: Partial<Development> = {}): Development => ({ drift: {}, acc: {}, anchors: [], counters: {}, pending: [], facts: [], moments: [], habits: [], nextId: 0, ...over });
const unit = (over: Partial<Unit> = {}): Unit => ({
  id: 'u', kind: 'named', values: { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 1, corporate: 0, sacrifice: 3 }, likes: ['tech'], dislikes: ['noise'], commanderTastes: ['t1'],
  ...over,
}) as Unit;

describe('valuesOf', () => {
  it('drift moves in whole steps', () => {
    expect(valuesOf(unit({ development: dev({ drift: { mercy: 0.9 } }) })).mercy).toBe(1);
    expect(valuesOf(unit({ development: dev({ drift: { mercy: 1.2 } }) })).mercy).toBe(2);
    expect(valuesOf(unit({ development: dev({ drift: { mercy: -1.7 } }) })).mercy).toBe(0);
    expect(valuesOf(unit({ development: dev({ drift: { sacrifice: 2 } }) })).sacrifice).toBe(3);
  });

  it('without development it is the stored object', () => {
    const u = unit();
    expect(valuesOf(u)).toBe(u.values);
  });

  it('never changes the imported values', () => {
    const u = unit({ development: dev({ drift: { mercy: 1.5 } }) });
    valuesOf(u);
    expect(u.values.mercy).toBe(1);
  });
});

describe('likes, dislikes and tastes', () => {
  it('likes gain and lose', () => {
    const u = unit({ development: dev({ gained: { likes: ['cooking'] }, lost: { likes: ['tech'] } }) });
    expect(likesOf(u)).toEqual(['cooking']);
    expect(dislikesOf(u)).toEqual(['noise']);
  });

  it('keeps the import order first and does not repeat a tag', () => {
    const u = unit({ development: dev({ gained: { likes: ['tech', 'cooking'] } }) });
    expect(likesOf(u)).toEqual(['tech', 'cooking']);
  });

  it('tastes gain and lose', () => {
    expect(tastesOf(unit({ development: dev({ gained: { tastes: ['t2'] }, lost: { tastes: ['t1'] } }) }))).toEqual(['t2']);
    expect(tastesOf(unit({ commanderTastes: undefined }))).toEqual([]);
  });
});

describe('bondOf', () => {
  it('takes development only on an imported bond', () => {
    const bond = { ...MODEST_BOND, desire: 'low' as const, ownLimits: { categories: ['restraint'] } };
    const withBond = unit({ bond, development: dev({ bond: { desire: 'high', caretaker: true } }) });
    expect(bondOf(withBond)).toMatchObject({ desire: 'high', caretaker: true, ownLimits: { categories: ['restraint'] }, publicity: 'known' });
    const modest = unit({ development: dev({ bond: { desire: 'high' } }) });
    expect(bondOf(modest)).toBe(MODEST_BOND);
  });

  it('is the stored bond when nothing changed, and a grunt has none', () => {
    const bond = { ...MODEST_BOND, ownLimits: { categories: [] } };
    expect(bondOf(unit({ bond }))).toBe(bond);
    expect(bondOf(unit({ kind: 'grunt' }))).toBeNull();
  });
});

describe('effectiveProfile and effectiveValues', () => {
  it('bundles the readers', () => {
    const u = unit({ development: dev({ drift: { mercy: 1 }, gained: { likes: ['x'] } }) });
    const p = effectiveProfile(u);
    expect(p.values.mercy).toBe(2);
    expect(p.likes).toEqual(['tech', 'x']);
    expect(p.dislikes).toEqual(['noise']);
    expect(p.tastes).toEqual(['t1']);
    expect(p.bond).toBe(MODEST_BOND);
  });

  it('effectiveValues adds the stance on top of drift', () => {
    const s = campaign(reg, 2);
    const u = s.squad[0];
    u.values.mercy = 1;
    u.development = dev({ drift: { mercy: 1 } });
    expect(effectiveValues(s, reg, u).mercy).toBe(2);
  });
});
