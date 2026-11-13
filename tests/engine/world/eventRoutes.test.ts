import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { eventOptions } from '../../../src/engine/world/expedition';
import { depart, withMission } from '../../helpers/expedition';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});

/** A run waiting at the sealed crate; `party` are the units that went. */
function atCrate(o: { party?: string[]; strength?: number } = {}): CampaignState {
  const { state, mission } = withMission(reg, base);
  const s = structuredClone(depart(reg, state, mission.id, { supplies: 4 }));
  s.commander.body = { strength: o.strength ?? 2, endurance: 3, reflexes: 2 };
  if (o.party) s.expedition!.party = o.party;
  s.expedition!.phase = 'event';
  s.expedition!.pending = { kind: 'event', nodeId: 'n0_0', templateId: 'evt_sealed_crate' };
  return s;
}
const choose = (s: CampaignState, option: number, route?: unknown) =>
  run(s, reg, { type: 'expedition/choose', payload: { option, ...(route !== undefined ? { route } : {}) } });

describe('route checks in expedition events', () => {
  it('eventOptions lists the routes of the routed option', () => {
    const o = eventOptions(atCrate(), reg);
    expect(o[0].routes?.map((r) => r.kind)).toEqual(['body', 'delegate', 'bypass']);
    expect(o[0].disabled).toBeNull();
    expect(o[1].routes).toBeUndefined();
  });

  it('choosing the routed option without a route changes nothing', () => {
    const s = atCrate();
    const r = choose(s, 0);
    expect(errors(r.events)).toMatchObject([{ message: 'Choose how to do it.' }]);
    expect(r.state).toEqual(s);
  });

  it('a passed body route applies every effect', () => {
    const s = atCrate({ strength: 3 });
    const r = choose(s, 0, { route: 0 });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.expedition!.loot.length).toBeGreaterThan(0);
    expect(r.state.expedition!.phase).toBe('travel');
    expect(ofType(r.events, 'route_taken')).toHaveLength(1);
  });

  it('a body route below its minimum is rejected with the reason', () => {
    const s = atCrate({ strength: 2 });
    const r = choose(s, 0, { route: 0 });
    expect(errors(r.events)).toMatchObject([{ message: expect.stringMatching(/Strong|Average/) }]);
    expect(r.state).toEqual(s);
  });

  it('expedition/choose with a delegate uses only the party', () => {
    const s = atCrate({ party: ['unit_ann', 'unit_bea'] });
    expect(eventOptions(s, reg)[0].routes![1].unitIds).toEqual(['unit_ann', 'unit_bea']);
    const out = choose(s, 0, { route: 1, unitId: 'unit_cat' });
    expect(errors(out.events)).toMatchObject([{ message: expect.stringMatching(/not available/i) }]);
    expect(out.state).toEqual(s);
    const ok = choose(s, 0, { route: 1, unitId: 'unit_bea' });
    expect(errors(ok.events)).toEqual([]);
  });

  it('a refused delegate keeps the cost and drops the loot', () => {
    const s = atCrate();
    s.relations.unit_ann.trust = 5;
    s.relations.unit_ann.loyaltyBand = 'breaking';
    const r = choose(s, 0, { route: 1, unitId: 'unit_ann' });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'delegate_refused')).toHaveLength(1);
    expect(r.state.expedition!.loot).toHaveLength(0);
    expect(r.state.expedition!.phase).toBe('travel'); // the node is finished either way
  });

  it('in a run a supplies bypass pays from the carried supplies', () => {
    const s = atCrate();
    s.resources.supplies = 0; // nothing at the base: it does not matter in the field
    const open = eventOptions(s, reg)[0].routes![2];
    expect(open.disabled).toBeNull();
    const r = choose(s, 0, { route: 2 });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.expedition!.supplies).toBe(2);
    expect(r.state.resources.supplies).toBe(0);
  });

  it('a stale item or an unaffordable bypass is rejected', () => {
    const s = atCrate();
    s.expedition!.supplies = 1;
    expect(eventOptions(s, reg)[0].routes![2].disabled).toMatch(/supplies/);
    expect(errors(choose(s, 0, { route: 2 }).events)).toHaveLength(1);
  });
});
