import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { runUpkeep, spread, upkeepNeeded } from '../../../src/engine/economy';
import { RATION_MODES, rationsOf, rationsVotable } from '../../../src/engine/power/rations';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import { withOptions } from '../../helpers/power';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];

/** Four named units, all on the roster, with exactly `short` supplies missing today. */
function shortBy(short: number): CampaignState {
  const s = campaign(reg, 4);
  for (const u of s.squad) {
    u.stress = 0;
    setRelation(s, u.id, { affinity: 20, trust: 60 });
  }
  s.resources.supplies = upkeepNeeded(s, reg).needed - short;
  return s;
}
const toReserve = (s: CampaignState, ...ids: string[]): void => {
  s.roster.activeIds = s.roster.activeIds.filter((id) => !ids.includes(id));
  for (const id of ids) s.squad.find((u) => u.id === id)!.status = 'reserve';
};
const upkeep = (s: CampaignState) => {
  const draft = structuredClone(s);
  const events = runUpkeep(draft, reg);
  return { draft, events };
};
const stressOf = (s: CampaignState, id: string): number => s.squad.find((u) => u.id === id)!.stress;
const affinityOf = (s: CampaignState, id: string): number => s.relations[id].affinity;

describe('the ration modes', () => {
  it('rationsOf reads equal when nothing is stored', () => {
    const s = shortBy(0);
    expect(rationsOf(s)).toBe('equal');
    s.base.rations = 'fighters_first';
    expect(rationsOf(s)).toBe('fighters_first');
    expect([...RATION_MODES]).toEqual(['equal', 'fighters_first', 'commander_short']);
  });

  it('equal is byte-identical to the old upkeep (absent and stored equal give the same state and events)', () => {
    const a = shortBy(3);
    const b = structuredClone(a);
    b.base.rations = 'equal';
    const ra = upkeep(a);
    const rb = upkeep(b);
    expect(rb.draft).toEqual({ ...ra.draft, base: { ...ra.draft.base, rations: 'equal' } });
    expect(rb.events).toEqual(ra.events);
    // and it is the old arithmetic: the shortage points spread evenly over the shares, stress 4 and Affinity 1 a point
    const slots = a.squad.length;
    const stress = spread(3 * 4, slots, a.day);
    const affinity = spread(3 * 1, slots, a.day);
    a.squad.forEach((u, i) => {
      expect(stressOf(ra.draft, u.id)).toBe(stress[i]);
      expect(affinityOf(ra.draft, u.id)).toBe(20 - affinity[i]);
    });
    expect(ra.events.find((e) => e.type === 'supply_shortage')).toMatchObject({ missing: 3, streak: 1 });
    expect(ra.draft.calendar.loseMorning).toBeUndefined();
  });

  it('fighters_first puts the shortage on reserve units first', () => {
    const s = shortBy(2);
    toReserve(s, CAT, DEE);
    s.base.rations = 'fighters_first';
    const { draft, events } = upkeep(s);
    expect([ANN, BEA].map((id) => stressOf(draft, id))).toEqual([0, 0]);
    expect([CAT, DEE].map((id) => stressOf(draft, id))).toEqual([4, 4]); // one point each, 4 stress a point
    expect([ANN, BEA].map((id) => affinityOf(draft, id))).toEqual([20, 20]);
    expect([CAT, DEE].map((id) => affinityOf(draft, id))).toEqual([19, 19]);
    expect(events.find((e) => e.type === 'supply_shortage')).toMatchObject({ missing: 2 });
    // a shortage the reserve cannot absorb spills onto the roster
    const big = shortBy(3);
    toReserve(big, CAT, DEE);
    big.base.rations = 'fighters_first';
    const spill = upkeep(big).draft;
    expect([CAT, DEE].map((id) => stressOf(spill, id))).toEqual([4, 4]);
    expect(stressOf(spill, ANN) + stressOf(spill, BEA)).toBe(4);
  });

  it('fighters_first without reserve units equals equal', () => {
    const a = shortBy(3);
    const b = structuredClone(a);
    b.base.rations = 'fighters_first';
    const ra = upkeep(a);
    const rb = upkeep(b);
    expect(rb.draft).toEqual({ ...ra.draft, base: { ...ra.draft.base, rations: 'fighters_first' } });
    expect(rb.events).toEqual(ra.events);
  });

  it("commander_short covers up to the commander's share and loses the next morning", () => {
    const s = shortBy(2);
    s.base.rations = 'commander_short';
    const { draft, events } = upkeep(s);
    expect(ofType(events, 'commander_went_hungry')).toEqual([{ type: 'commander_went_hungry', day: s.day, covered: 1 }]);
    expect(draft.calendar.loseMorning).toBe(true);
    expect(events.find((e) => e.type === 'supply_shortage')).toMatchObject({ missing: 1 }); // 2 − 1 covered
    // the same shortage under equal costs the squad twice as much
    const equal = upkeep(shortBy(2)).draft;
    const sum = (d: CampaignState) => d.squad.reduce((n, u) => n + u.stress, 0);
    expect(sum(draft)).toBe(4);
    expect(sum(equal)).toBe(8);
    // a shortage of one is covered completely: no squad shortage at all, the streak resets
    const one = shortBy(1);
    one.base.rations = 'commander_short';
    one.calendar.shortageStreak = 2;
    const r = upkeep(one);
    expect(ofType(r.events, 'supply_shortage')).toEqual([]);
    expect(r.draft.calendar.shortageStreak).toBe(0);
    expect(r.draft.calendar.loseMorning).toBe(true);
    expect(r.draft.squad.every((u) => u.stress === 0)).toBe(true);
    // no shortage, no hunger
    const none = shortBy(0);
    none.base.rations = 'commander_short';
    const n = upkeep(none);
    expect(ofType(n.events, 'commander_went_hungry')).toEqual([]);
    expect(n.draft.calendar.loseMorning).toBeUndefined();
  });
});

describe('rations/set and its vote', () => {
  const voting = (s: CampaignState): CampaignState => withOptions(s, { voting: 'on' });

  it('rationsVotable: a shortage on or coming', () => {
    const s = shortBy(0);
    expect(rationsVotable(s, reg)).toBe(false);
    expect(rationsVotable(shortBy(1), reg)).toBe(true); // supplies below what tomorrow needs
    const streak = shortBy(0);
    streak.calendar.shortageStreak = 1;
    expect(rationsVotable(streak, reg)).toBe(true);
  });

  it('sets the mode, reports it and removes the field for equal', () => {
    const s = shortBy(0);
    const r = run(s, reg, { type: 'rations/set', payload: { mode: 'fighters_first' } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'rations_set')).toEqual([{ type: 'rations_set', mode: 'fighters_first' }]);
    expect(r.state.base.rations).toBe('fighters_first');
    const back = run(r.state, reg, { type: 'rations/set', payload: { mode: 'equal' } });
    expect(back.state.base.rations).toBeUndefined();
    expect(back.state.base).toEqual(s.base);
  });

  it('an unknown mode is refused', () => {
    const s = shortBy(0);
    for (const mode of ['feast', undefined, 3]) {
      const r = run(s, reg, { type: 'rations/set', payload: { mode } });
      expect(errors(r.events)).toHaveLength(1);
      expect(r.state).toBe(s);
    }
    const v = voting(shortBy(2));
    expect(errors(run(v, reg, { type: 'rations/set', payload: { mode: 'feast' } }).events)[0]).toMatchObject({ code: 'handler_failed' }); // not vote_needed
  });

  it('rations/set is gated only while a shortage is on or coming', () => {
    const calm = voting(shortBy(0));
    expect(errors(run(calm, reg, { type: 'rations/set', payload: { mode: 'commander_short' } }).events)).toEqual([]);
    const tight = voting(shortBy(2));
    const refused = run(tight, reg, { type: 'rations/set', payload: { mode: 'commander_short' } });
    expect(refused.events).toEqual([{ type: 'error', code: 'vote_needed', kind: 'rations', subject: 'commander_short' }]);
    expect(refused.state).toBe(tight);
    const opened = run(tight, reg, { type: 'vote/open', payload: { kind: 'rations', subject: 'commander_short' } });
    expect(errors(opened.events)).toEqual([]);
    const set = run(opened.state, reg, { type: 'rations/set', payload: { mode: 'commander_short', voteId: 'v1' } });
    expect(errors(set.events)).toEqual([]);
    expect(set.state.base.rations).toBe('commander_short');
    expect(ofType(set.events, 'vote_carried')).toHaveLength(1);
    // with voting off a shortage gates nothing
    const off = shortBy(2);
    expect(errors(run(off, reg, { type: 'rations/set', payload: { mode: 'commander_short' } }).events)).toEqual([]);
  });

  it('vote/open for rations needs a shortage and a known mode', () => {
    const calm = voting(shortBy(0));
    expect(errors(run(calm, reg, { type: 'vote/open', payload: { kind: 'rations', subject: 'equal' } }).events)).toHaveLength(1);
    const tight = voting(shortBy(2));
    expect(errors(run(tight, reg, { type: 'vote/open', payload: { kind: 'rations', subject: 'feast' } }).events)).toHaveLength(1);
  });
});
