import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import type { CheckRoute, RouteCheck } from '../../../src/content/schemas';
import { resolveRoute, routeChoices } from '../../../src/engine/commander/checks';
import { seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, ctxOf, loadCore, ofType } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const check = (...routes: CheckRoute[]): RouteCheck => ({ id: 'pry', routes });
const BODY: CheckRoute = { kind: 'body', stat: 'strength', min: 4 };
const DELEGATE: CheckRoute = { kind: 'delegate', cost: { trustCheck: 'guarded', affinityCost: 3, stress: 5 } };
const fresh = (): CampaignState => campaign(reg, 3);
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
const setTrust = (s: CampaignState, id: string, trust: number, band?: 'steady' | 'wavering' | 'breaking') => {
  s.relations[id].trust = trust;
  s.relations[id].loyaltyBand = band ?? (trust < 10 ? 'breaking' : trust < 25 ? 'wavering' : 'steady');
};
const resolve = (s: CampaignState, c: RouteCheck, pick: { route: number; unitId?: string }, scope: { unitIds?: string[] } = {}, seed = 1) => {
  const draft = structuredClone(s);
  const ctx = ctxOf(draft, reg);
  try {
    const r = resolveRoute(draft, ctx, c, pick, scope);
    return { draft, ...r, error: null as string | null };
  } catch (e) {
    return { draft, passed: false, events: [], error: (e as Error).message };
  }
};

describe('body routes', () => {
  it('body passes at min and is disabled below with the descriptor in the reason', () => {
    const s = fresh();
    s.commander.body = { strength: 3, endurance: 3, reflexes: 2 };
    const c = check(BODY, DELEGATE);
    const [low] = routeChoices(s, reg, c, {});
    expect(low).toMatchObject({ route: 0, kind: 'body', label: 'STRENGTH: Strong or better' });
    expect(low.disabled).toMatch(/Strong/);
    expect(resolve(s, c, { route: 0 }).error).toMatch(/Strong/);
    s.commander.body.strength = 4;
    expect(routeChoices(s, reg, c, {})[0].disabled).toBeNull();
    const r = resolve(s, c, { route: 0 });
    expect(r.passed).toBe(true);
    expect(ofType(r.events, 'route_taken')).toEqual([{ type: 'route_taken', checkId: 'pry', kind: 'body', passed: true }]);
  });

  it('a commander without P7 fields reads the defaults', () => {
    const s = fresh();
    delete s.commander.body;
    expect(routeChoices(s, reg, check(BODY, DELEGATE), {})[0].disabled).toMatch(/Strong/);
  });
});

describe('social, item and bypass routes', () => {
  it('social reads the effective rank', () => {
    const s = fresh();
    const c = check({ kind: 'social', stat: 'authority', min: 3 }, DELEGATE);
    s.commander.socialStats.authority = 2;
    expect(routeChoices(s, reg, c, {})[0]).toMatchObject({ label: 'AUTHORITY 3' });
    expect(routeChoices(s, reg, c, {})[0].disabled).not.toBeNull();
    s.commander.socialStats.authority = 3;
    expect(resolve(s, c, { route: 0 }).passed).toBe(true);
  });

  it('a bypass that cannot be paid is disabled', () => {
    const s = fresh();
    s.resources.supplies = 1;
    const c = check(BODY, { kind: 'bypass', cost: { resource: 'supplies', amount: 2 } });
    const choice = routeChoices(s, reg, c, {})[1];
    expect(choice).toMatchObject({ kind: 'bypass', label: 'Pay 2 supplies' });
    expect(choice.disabled).toMatch(/supplies/);
    const r = resolve(s, c, { route: 1 });
    expect(r.error).toMatch(/supplies/);
    expect(r.draft.resources.supplies).toBe(1);
  });

  it('bypass pays and passes', () => {
    const s = fresh();
    s.resources.credits = 30;
    const c = check(BODY, { kind: 'bypass', cost: { resource: 'credits', amount: 12 } });
    const r = resolve(s, c, { route: 1 });
    expect(r.passed).toBe(true);
    expect(r.draft.resources.credits).toBe(18);
    expect(ofType(r.events, 'resource_changed')).toEqual([{ type: 'resource_changed', resource: 'credits', amount: -12 }]);
  });

  it('item passes only while an instance is owned', () => {
    const s = fresh();
    const c = check(BODY, { kind: 'item', itemId: 'item_blade' });
    s.inventory = [];
    expect(routeChoices(s, reg, c, {})[1].disabled).not.toBeNull();
    expect(routeChoices(s, reg, c, {})[1].label).toBe(`Use ${String(reg.items.get('item_blade')!.name)}`);
    expect(resolve(s, c, { route: 1 }).error).not.toBeNull();
    s.inventory = [{ uid: 'i1', itemId: 'item_blade', rarity: 'standard', upgrade: 0, affixes: [] }];
    expect(routeChoices(s, reg, c, {})[1].disabled).toBeNull();
    const r = resolve(s, c, { route: 1 });
    expect(r.passed).toBe(true);
    expect(r.draft.inventory).toHaveLength(1); // the item is not consumed
  });

  it('a pick outside the check is rejected', () => {
    expect(resolve(fresh(), check(BODY, DELEGATE), { route: 5 }).error).toMatch(/route/i);
  });
});

describe('delegate routes', () => {
  it('delegate complies at guarded trust and pays affinity and stress', () => {
    const s = fresh();
    setTrust(s, ANN, 50);
    s.relations[ANN].affinity = 10;
    s.squad[0].stress = 10;
    const c = check(BODY, DELEGATE);
    const choice = routeChoices(s, reg, c, {})[1];
    expect(choice).toMatchObject({ kind: 'delegate', label: 'Ask a unit (Trust: guarded)', disabled: null });
    expect(choice.unitIds).toEqual(expect.arrayContaining([ANN, BEA, CAT]));
    const r = resolve(s, c, { route: 1, unitId: ANN });
    expect(r.error).toBeNull();
    expect(r.passed).toBe(true);
    expect(r.draft.relations[ANN].affinity).toBeLessThan(10);
    expect(r.draft.squad[0].stress).toBe(15);
    expect(ofType(r.events, 'route_taken')).toEqual([{ type: 'route_taken', checkId: 'pry', kind: 'delegate', passed: true }]);
  });

  it('a complying unit sometimes adds a remark (seeded), and it never changes the result', () => {
    const s = fresh();
    setTrust(s, ANN, 50);
    let remarks = 0;
    for (let seed = 1; seed <= 100; seed++) {
      s.rng = seedRng(seed);
      const r = resolve(s, check(BODY, DELEGATE), { route: 1, unitId: ANN });
      expect(r.passed).toBe(true);
      remarks += ofType(r.events, 'delegate_remark').length;
    }
    expect(remarks).toBeGreaterThan(10);
    expect(remarks).toBeLessThan(55);
  });

  it('one band below is a demand and does not pass', () => {
    const s = fresh();
    setTrust(s, ANN, 20, 'wavering'); // low (10–24) is one band below guarded
    const r = resolve(s, check(BODY, DELEGATE), { route: 1, unitId: ANN });
    expect(r.passed).toBe(false);
    expect(r.error).toBeNull();
    expect(ofType(r.events, 'delegate_demand')).toEqual([{ type: 'delegate_demand', unitId: ANN }]);
    expect(r.draft.relations[ANN].affinity).toBe(s.relations[ANN].affinity); // nothing was paid
  });

  it('two bands below refuses', () => {
    const s = fresh();
    setTrust(s, ANN, 12, 'wavering'); // low is two bands below solid
    const c = check(BODY, { kind: 'delegate', cost: { trustCheck: 'solid' } });
    const r = resolve(s, c, { route: 1, unitId: ANN });
    expect(r.passed).toBe(false);
    expect(ofType(r.events, 'delegate_refused')).toEqual([{ type: 'delegate_refused', unitId: ANN }]);
  });

  it('breaking loyalty refuses whatever the trust band', () => {
    const s = fresh();
    setTrust(s, ANN, 80);
    s.relations[ANN].loyaltyBand = 'breaking';
    const r = resolve(s, check(BODY, DELEGATE), { route: 1, unitId: ANN });
    expect(r.passed).toBe(false);
    expect(ofType(r.events, 'delegate_refused')).toHaveLength(1);
  });

  it('the default trust check is guarded', () => {
    const s = fresh();
    setTrust(s, ANN, 30);
    const r = resolve(s, check(BODY, { kind: 'delegate', cost: {} }), { route: 1, unitId: ANN });
    expect(r.passed).toBe(true);
  });

  it('a delegate outside the party is disabled in a run', () => {
    const s = fresh();
    const c = check(BODY, DELEGATE);
    const scoped = routeChoices(s, reg, c, { unitIds: [CAT] });
    expect(scoped[1].unitIds).toEqual([CAT]);
    const none = routeChoices(s, reg, c, { unitIds: ['unit_nobody'] });
    expect(none[1].disabled).toMatch(/No unit/);
    const r = resolve(s, c, { route: 1, unitId: ANN }, { unitIds: [CAT] });
    expect(r.error).toMatch(/not available/i);
  });

  it('unitFilter.roles narrows the choice', () => {
    const s = fresh();
    s.squad[1].roleId = 'medic';
    const c = check(BODY, { kind: 'delegate', unitFilter: { roles: ['medic'] }, cost: {} });
    expect(routeChoices(s, reg, c, {})[1].unitIds).toEqual([BEA]);
    expect(resolve(s, c, { route: 1, unitId: ANN }).error).not.toBeNull();
  });

  it('a stale delegate pick is rejected', () => {
    const s = fresh();
    setTrust(s, ANN, 80);
    const c = check(BODY, DELEGATE);
    // the unit died between render and click
    s.squad[0].status = 'dead';
    const r = resolve(s, c, { route: 1, unitId: ANN });
    expect(r.error).toMatch(/not available/i);
    expect(r.draft).toEqual(s);
    // no unit picked at all
    expect(resolve(fresh(), c, { route: 1 }).error).toMatch(/unit/i);
  });
});
