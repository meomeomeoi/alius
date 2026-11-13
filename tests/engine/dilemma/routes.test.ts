import { beforeAll, describe, expect, it } from 'vitest';
import type { Entry, Registries } from '../../../src/content/types';
import { dilemmaOptions } from '../../../src/engine/dilemma/flow';
import { seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';

let reg: Registries;
let routed: Registries;
let base: CampaignState;
const [ANN, BEA] = ['unit_ann', 'unit_bea'];

const ROUTE_CHECK = {
  id: 'haul_it',
  routes: [
    { kind: 'body', stat: 'strength', min: 4 },
    { kind: 'delegate', cost: { trustCheck: 'guarded', stress: 5 } },
    { kind: 'bypass', cost: { resource: 'credits', amount: 5 } },
  ],
};

beforeAll(async () => {
  reg = await loadCore();
  // dil_rations with its first authored option behind a route check (supplies +3 is the gain, party stress +5 the cost)
  routed = { ...reg } as Registries;
  routed.dilemmaTemplates = new Map(reg.dilemmaTemplates);
  const t = structuredClone(reg.dilemmaTemplates.get('dil_rations')!) as Entry & { fixed: { options: Array<Record<string, unknown>> } };
  t.fixed.options[0].routeCheck = ROUTE_CHECK;
  routed.dilemmaTemplates.set('dil_rations', t);

  base = campaign(reg, 4);
  for (const u of base.squad) {
    u.defects = [];
    setRelation(base, u.id, { trust: 50, affinity: 20, stateId: 'comrade', band: 'steady' });
  }
  base.commander.body = { strength: 2, endurance: 3, reflexes: 2 };
  base.resources.credits = 100;
  base.resources.supplies = 10;
});

const clone = (): CampaignState => {
  const s = structuredClone(base);
  s.rng = seedRng(1);
  return s;
};
const act = (s: CampaignState, type: string, payload?: unknown, r: Registries = routed) => run(s, r, { type, payload });
/** The authored block of `dil_rations`, shown as a dilemma. */
function shown(s = clone()): CampaignState {
  const q = act(s, 'dilemma/request', { templateId: 'dil_rations', context: 'base' });
  expect(errors(q.events)).toEqual([]);
  const p = act(q.state, 'dilemma/fallback', { requestId: q.state.dilemmas!.open!.id });
  expect(errors(p.events)).toEqual([]);
  expect(p.state.dilemmas!.open!.status).toBe('presented');
  return p.state;
}
const choose = (s: CampaignState, index: number, route?: unknown) =>
  act(s, 'dilemma/choose', { id: s.dilemmas!.open!.id, index, ...(route !== undefined ? { route } : {}) });

describe('routed dilemma options', () => {
  it('the authored fallback keeps the routeCheck', () => {
    expect(shown().dilemmas!.open!.options![0].routeCheck).toEqual(ROUTE_CHECK);
    expect(shown().dilemmas!.open!.options![1].routeCheck).toBeUndefined();
  });

  it('choosing a routed option without a route changes nothing', () => {
    const s = shown();
    const r = choose(s, 0);
    expect(errors(r.events)).toMatchObject([{ message: 'Choose how to do it.' }]);
    expect(r.state).toEqual(s);
  });

  it('a passed body route applies every effect', () => {
    const s = shown();
    s.commander.body!.strength = 4;
    const r = choose(s, 0, { route: 0 });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.resources.supplies).toBe(13); // the gain
    expect(ofType(r.events, 'route_taken')).toEqual([{ type: 'route_taken', checkId: 'haul_it', kind: 'body', passed: true }]);
    expect(ofType(r.events, 'dilemma_resolved')[0]).toMatchObject({ routePassed: true });
    expect(r.state.dilemmas!.open).toBeUndefined();
  });

  it('a refused delegate keeps costs and drops the loot', () => {
    const s = shown();
    setRelation(s, ANN, { trust: 5, affinity: 0, stateId: 'comrade', band: 'breaking' }); // none: two bands below guarded
    const stressBefore = s.squad.map((u) => u.stress);
    const r = choose(s, 0, { route: 1, unitId: ANN });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'delegate_refused')).toHaveLength(1);
    expect(ofType(r.events, 'dilemma_resolved')[0]).toMatchObject({ routePassed: false });
    expect(r.state.resources.supplies).toBe(10); // the gain was dropped
    expect(r.state.squad.map((u) => u.stress).some((v, i) => v > stressBefore[i])).toBe(true); // the cost stayed
    expect(r.state.dilemmas!.open).toBeUndefined(); // the dilemma is answered either way
  });

  it('a delegate that complies passes and pays', () => {
    const s = shown();
    const r = choose(s, 0, { route: 1, unitId: BEA });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.resources.supplies).toBe(13);
    expect(r.state.squad[1].stress).toBeGreaterThanOrEqual(5);
  });

  it('a bypass pays its cost and passes', () => {
    const r = choose(shown(), 0, { route: 2 });
    expect(r.state.resources.credits).toBe(95);
    expect(r.state.resources.supplies).toBe(13);
  });

  it('a stale or closed pick is rejected and changes nothing', () => {
    const s = shown();
    for (const route of [{ route: 0 }, { route: 7 }, { route: 1 }, { route: 1, unitId: 'unit_nobody' }, 'x', { route: 1.5 }]) {
      const r = choose(s, 0, route);
      expect(errors(r.events), JSON.stringify(route)).toHaveLength(1);
      expect(r.state, JSON.stringify(route)).toEqual(s);
    }
    const dead = structuredClone(s);
    dead.squad[0].status = 'dead';
    expect(errors(choose(dead, 0, { route: 1, unitId: ANN }).events)).toHaveLength(1);
    const poor = structuredClone(s);
    poor.resources.credits = 2;
    expect(errors(choose(poor, 0, { route: 2 }).events)).toMatchObject([{ message: expect.stringContaining('credits') }]);
  });

  it('an option without routeCheck ignores a route in the payload', () => {
    const r = choose(shown(), 1, { route: 0 });
    expect(errors(r.events)).toEqual([]);
  });
});

describe('dilemmaOptions', () => {
  it('lists route choices', () => {
    const o = dilemmaOptions(shown(), routed);
    expect(o[0].routes?.map((x) => [x.kind, x.label, x.disabled === null])).toEqual([
      ['body', 'STRENGTH: Strong or better', false],
      ['delegate', 'Ask a unit (Trust: guarded)', true],
      ['bypass', 'Pay 5 credits', true],
    ]);
    expect(o[0].routes![0].disabled).toMatch(/Strong/);
    expect(o[0].disabled).toBeNull();
    expect(o[1].routes).toBeUndefined();
  });

  it('an option with every route closed is disabled', () => {
    const s = shown();
    s.resources.credits = 0;
    for (const u of s.squad) u.status = 'dead';
    const o = dilemmaOptions(s, routed);
    expect(o[0].disabled).not.toBeNull();
  });
});

describe('core content', () => {
  it('evt_sealed_crate option 0 has a non-body route', () => {
    const t = reg.dilemmaTemplates.get('evt_sealed_crate')!;
    const o = (t.fixed as { options: Array<{ routeCheck?: { id: string; routes: Array<{ kind: string }> } }> }).options[0];
    expect(o.routeCheck?.id).toBe('pry_crate');
    expect(o.routeCheck!.routes.some((r) => r.kind !== 'body')).toBe(true);
    expect(o.routeCheck!.routes.map((r) => r.kind)).toEqual(['body', 'delegate', 'bypass']);
  });
});
