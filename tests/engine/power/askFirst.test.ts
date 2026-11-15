import { beforeAll, describe, expect, it } from 'vitest';
import type { HerCallSpec } from '../../../src/content/schemas';
import type { Registries } from '../../../src/content/types';
import { removeFromService } from '../../../src/engine/leash/use';
import { askFirstHolds, herCallCandidates, rollHerCall } from '../../../src/engine/power/herCall';
import { againstHerValues } from '../../../src/engine/power/votes';
import { Rng, seedRng } from '../../../src/engine/rng';
import { applyEventToUnit } from '../../../src/engine/relations/effects';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { ableParty, eventPool } from '../../../src/engine/world/expedition';
import { withBond } from '../../helpers/bonds';
import { depart, withMission } from '../../helpers/expedition';
import { campaign, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import '../../helpers/power';

let reg: Registries;
let regs: Registries;
beforeAll(async () => {
  reg = await loadCore();
  const spec: HerCallSpec = {
    trigger: { minLeadRank: 2 },
    outcomes: [
      { id: 'good', lean: { pragmatism: 2 }, text: 'Good.', effects: [{ type: 'party_stress', amount: -5 }] },
      { id: 'bad', lean: { autonomy: 2 }, text: 'Bad.', effects: [{ type: 'party_stress', amount: 10 }] },
    ],
  };
  const hc = {
    id: 'evt_hc_test', scale: 'minor', contexts: ['expedition_event'], herCall: spec,
    fixed: { title: 'Her way', setup: 'S', options: [{ label: 'A', effects: [{ type: 'party_stress', amount: 5 }] }, { label: 'B', effects: [{ type: 'carried_supplies', amount: -1 }] }] },
  };
  regs = { ...reg, dilemmaTemplates: new Map([['evt_hc_test', hc as never]]) };
});

const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const ask = (s: CampaignState, unitId: string, on: boolean, r: Registries = reg) => run(s, r, { type: 'power/ask_first', payload: { unitId, on } });
const spec = (): HerCallSpec => regs.dilemmaTemplates.get('evt_hc_test')!.herCall as HerCallSpec;

/** Four named units; ANN holds views (autonomy 3) so an order against her values costs Trust. */
function fresh(): CampaignState {
  const s = campaign(reg, 4);
  for (const u of s.squad) {
    u.defects = [];
    withBond(s, u.id, { leadStyle: u.id === ANN ? 'dominant' : 'yielding' });
    setRelation(s, u.id, { trust: 50 });
  }
  s.squad.find((u) => u.id === ANN)!.values = { pragmatism: 0, autonomy: 3, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
  return s;
}

describe('the standing order', () => {
  it('ordering her to ask first stores the day and applies decision_violated minor against her values', () => {
    const s = fresh();
    const before = s.relations[ANN].trust;
    const r = ask(s, ANN, true);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.power!.askFirst).toEqual({ [ANN]: s.day });
    expect(ofType(r.events, 'ask_first_set')).toEqual([{ type: 'ask_first_set', unitId: ANN, on: true }]);
    expect(TUNING.herCall.askFirst.severity).toBe('minor');
    // her Trust falls by the decision_violated minor row at her values' weight
    const expected = structuredClone(s);
    applyEventToUnit(expected, reg, ANN, {
      type: 'decision_violated', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'ordered to ask first', confidence: 1,
      valueAxes: againstHerValues(expected, reg, expected.squad.find((u) => u.id === ANN)!),
    });
    expect(r.state.relations[ANN].trust).toBeLessThan(before);
    expect(r.state.relations[ANN].trust).toBe(expected.relations[ANN].trust);
    expect(r.state.relations[ANN].history.filter((h) => h.kind === 'event').at(-1)).toMatchObject({ type: 'decision_violated', severity: 'minor' });
    // nobody else is touched
    expect(r.state.relations[BEA].trust).toBe(s.relations[BEA].trust);
    expect(askFirstHolds(r.state, ANN)).toBe(true);
    expect(askFirstHolds(r.state, BEA)).toBe(false);
  });

  it('lifting it is free', () => {
    const ordered = ask(fresh(), ANN, true).state;
    const r = ask(ordered, ANN, false);
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'ask_first_set')).toEqual([{ type: 'ask_first_set', unitId: ANN, on: false }]);
    expect(r.state.power!.askFirst?.[ANN]).toBeUndefined();
    expect(askFirstHolds(r.state, ANN)).toBe(false);
    expect(r.state.relations[ANN]).toEqual(ordered.relations[ANN]);
  });

  it('setting it twice or lifting a missing order throws, changing nothing', () => {
    const ordered = ask(fresh(), ANN, true).state;
    const twice = ask(ordered, ANN, true);
    expect(String(errors(twice.events)[0]?.message)).toContain('She is already under that order.');
    expect(twice.state).toBe(ordered);
    const none = fresh();
    const missing = ask(none, ANN, false);
    expect(String(errors(missing.events)[0]?.message)).toContain('There is no such order.');
    expect(missing.state).toBe(none);
  });

  it('a grunt, a dead unit and an unknown id cannot be ordered; a bad payload is refused', () => {
    const s = fresh();
    const grunt = { ...structuredClone(s.squad[0]), id: 'grunt_1', kind: 'grunt' as const };
    s.squad.push(grunt);
    s.relations.grunt_1 = structuredClone(s.relations[ANN]);
    s.squad.find((u) => u.id === BEA)!.status = 'dead';
    for (const id of ['grunt_1', BEA, 'ghost']) {
      const r = ask(s, id, true);
      expect(errors(r.events), id).toHaveLength(1);
      expect(r.state, id).toBe(s);
    }
    expect(errors(run(s, reg, { type: 'power/ask_first', payload: { unitId: ANN } }).events)).toHaveLength(1);
    expect(errors(run(s, reg, { type: 'power/ask_first', payload: { on: true } }).events)).toHaveLength(1);
  });

  it('refused during a run', () => {
    const base = fresh();
    const { state, mission } = withMission(reg, base);
    const out = depart(reg, state, mission.id);
    const r = ask(out, ANN, true);
    expect(errors(r.events)).toEqual([expect.objectContaining({ code: 'expedition_open' })]);
    expect(r.state).toBe(out);
  });

  it('removing her from service forgets the order', () => {
    const ordered = ask(ask(fresh(), ANN, true).state, BEA, true).state;
    const d = structuredClone(ordered);
    removeFromService(d, ANN, 'terminated');
    expect(d.power!.askFirst).toEqual({ [BEA]: ordered.day });
    removeFromService(d, BEA, 'deserted');
    expect(d.power!.askFirst).toBeUndefined();
  });
});

describe('what the order does to her calls', () => {
  it('while it holds she is never a candidate, and a party whose only eligible soldier asks first sees no her-call template', () => {
    const base = fresh();
    const open = withMission(reg, base);
    const free = depart(reg, open.state, open.mission.id);
    expect(herCallCandidates(free, regs, spec(), ableParty(free))).toEqual([ANN]);
    expect(eventPool(free, regs, 'quarantine_d7').map((t) => t.id)).toEqual(['evt_hc_test']);

    const ordered = ask(base, ANN, true).state;
    const m = withMission(reg, ordered);
    const run1 = depart(reg, m.state, m.mission.id);
    expect(herCallCandidates(run1, regs, spec(), ableParty(run1))).toEqual([]);
    expect(eventPool(run1, regs, 'quarantine_d7')).toEqual([]);
    const rng = new Rng(seedRng(5));
    const before = rng.state;
    expect(rollHerCall(run1, regs, rng, spec(), ableParty(run1))).toBeNull();
    expect(rng.state).toEqual(before); // she draws nothing and is not in the actor weights

    // a run that started before the order was given reads it live, at each node entry
    const live = structuredClone(free);
    live.power = { ...(live.power ?? { votes: { log: [], seq: 0 } }), askFirst: { [ANN]: live.day } };
    expect(eventPool(live, regs, 'quarantine_d7')).toEqual([]);
    expect(herCallCandidates(live, regs, spec(), ableParty(live))).toEqual([]);
  });

  it('the other soldier stays eligible when only one is ordered', () => {
    const base = fresh();
    withBond(base, BEA, { leadStyle: 'assertive' });
    const ordered = ask(base, ANN, true).state;
    const m = withMission(reg, ordered);
    const s = depart(reg, m.state, m.mission.id);
    expect(herCallCandidates(s, regs, spec(), ableParty(s))).toEqual([BEA]);
  });
});
