import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { recordOf } from '../../../src/engine/discipline/record';
import { impunityOf } from '../../../src/engine/discipline/impunity';
import { ballotFor, tallyVote } from '../../../src/engine/power/ballot';
import { countermandChance, countermandOpen, leaderVoteWeight, privilegeScale } from '../../../src/engine/power/leader';
import { seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { campaign, endDay, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import { setRecord } from '../../helpers/discipline';
import { withLeader, withOptions } from '../../helpers/power';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };

function fresh(): CampaignState {
  const s = campaign(reg, 4);
  s.commander.socialStats.authority = 1;
  s.resources.supplies = 100;
  s.resources.credits = 500;
  for (const u of s.squad) {
    u.values = { ...ZERO };
    setRelation(s, u.id, { trust: 50 });
  }
  return s;
}
const train = (companionId?: string) => ({ type: 'activity/do', payload: { activityId: 'train', ...(companionId ? { companionId } : { focus: 'units', unitIds: [BEA] }) } });
/** The first seed (from 1) for which `pick` finds the state's next countermand roll to hit (or miss). */
function seeded(s: CampaignState, action: ReturnType<typeof train>, hit: boolean): CampaignState {
  for (let seed = 1; seed < 400; seed++) {
    const t = structuredClone(s);
    t.rng = seedRng(seed);
    const r = run(t, reg, action);
    if (errors(r.events).length === 0 && (ofType(r.events, 'countermanded').length > 0) === hit) {
      t.rng = seedRng(seed);
      return t;
    }
  }
  throw new Error('no seed found');
}

describe('privileges', () => {
  it("the leader's vote weighs 1.5 at normal, 2.25 at high, 0.75 at low; endorsed × 1.5", () => {
    const s = withLeader(fresh(), ANN);
    expect(leaderVoteWeight(s, reg)).toBe(1.5);
    expect(leaderVoteWeight(withOptions(structuredClone(s), { squad_assertiveness: 'high' }), reg)).toBe(2.25);
    expect(leaderVoteWeight(withOptions(structuredClone(s), { squad_assertiveness: 'low' }), reg)).toBe(0.75);
    const e = withLeader(fresh(), ANN, { endorsed: true });
    expect(leaderVoteWeight(e, reg)).toBe(2.25);
    expect(privilegeScale(e, reg)).toBe(1.5);
    expect(privilegeScale(fresh(), reg)).toBe(1); // no leader: nothing scales
  });

  it("the leader's ballot carries her weight in the tally", () => {
    const s = withLeader(fresh(), ANN);
    const t = tallyVote(s, reg, 'upgrade', 'workshop');
    expect(t.ballots.find((b) => b.unitId === ANN)!.weight).toBe(1.5);
    expect(t.ballots.find((b) => b.unitId === BEA)!.weight).toBe(1);
    expect(t.forWeight).toBe(1 + 1.5 + 3);
  });

  it("grunts follow the leader's vote at 0.5", () => {
    const s = withLeader(fresh(), ANN);
    s.squad.push({ ...structuredClone(s.squad[3]), id: 'grunt_1', kind: 'grunt', displayName: 'G-1' });
    s.roster.activeIds = [ANN, 'grunt_1'];
    const forLead = ballotFor(s, reg, s.squad.find((u) => u.id === 'grunt_1')!, 'upgrade', 'workshop');
    expect(forLead).toMatchObject({ vote: 'for', weight: 0.5 });
    s.squad.find((u) => u.id === ANN)!.values = { ...ZERO, pragmatism: -3 };
    const against = ballotFor(s, reg, s.squad.find((u) => u.id === 'grunt_1')!, 'upgrade', 'workshop');
    expect(against).toMatchObject({ vote: 'against', weight: 0.5 });
    const none = fresh();
    none.squad.push({ ...structuredClone(none.squad[3]), id: 'grunt_1', kind: 'grunt', displayName: 'G-1' });
    expect(ballotFor(none, reg, none.squad.at(-1)!, 'upgrade', 'workshop')).toMatchObject({ vote: 'abstain', weight: 0 });
  });

  it("contagion counts the leader's record twice at normal", () => {
    const s = fresh();
    setRecord(s, ANN, 40);
    const c = (state: CampaignState) => impunityOf(state, reg, BEA)!.terms.contagion;
    expect(c(s)).toBe(4); // 0.3 × (40 / 3 others)
    expect(c(withLeader(structuredClone(s), ANN))).toBe(6); // 0.3 × (2 × 40 / weights 2 + 1 + 1)
    expect(c(withOptions(withLeader(structuredClone(s), ANN), { squad_assertiveness: 'high' }))).toBe(7); // weight 2.5: 0.3 × (2.5 × 40 / 4.5)
    expect(c(withLeader(structuredClone(s), ANN, { endorsed: true }))).toBe(7); // endorsed: weight 2.5 as well
    expect(c(withOptions(withLeader(structuredClone(s), ANN), { squad_assertiveness: 'low' }))).toBe(5); // weight 1.5: 0.3 × (1.5 × 40 / 3.5)
    // the leader's own contagion reads the others only
    expect(impunityOf(withLeader(structuredClone(s), ANN), reg, ANN)!.terms.contagion).toBe(0);
  });
});

describe('countermand', () => {
  const lead = (): CampaignState => withLeader(fresh(), ANN);

  it('the chance scales with the option and the endorsement and is capped', () => {
    expect(countermandChance(lead(), reg)).toBeCloseTo(0.2, 10);
    expect(countermandChance(withOptions(lead(), { squad_assertiveness: 'low' }), reg)).toBeCloseTo(0.1, 10);
    expect(countermandChance(withOptions(lead(), { squad_assertiveness: 'high' }), reg)).toBeCloseTo(0.3, 10);
    expect(countermandChance(withOptions(withLeader(fresh(), ANN, { endorsed: true }), { squad_assertiveness: 'high' }), reg)).toBeCloseTo(0.45, 10);
    const big = withOptions(withLeader(fresh(), ANN, { endorsed: true }), { squad_assertiveness: 'high' });
    expect(countermandChance(big, reg)).toBeLessThanOrEqual(TUNING.power.countermand.cap);
    expect(countermandChance(fresh(), reg)).toBe(0);
  });

  it('a countermandable activity with another unit can be countermanded: no slot spent, nothing applied', () => {
    const s = seeded(lead(), train(BEA), true);
    const r = run(s, reg, train(BEA));
    expect(ofType(r.events, 'countermanded')).toEqual([{ type: 'countermanded', leaderId: ANN, unitId: BEA, activityId: 'train' }]);
    expect(r.state.slot).toBe(s.slot);
    expect(r.state.day).toBe(s.day);
    expect(r.state.resources).toEqual(s.resources);
    expect(r.state.squad.map((u) => u.xp)).toEqual(s.squad.map((u) => u.xp));
    expect(r.state.power!.countermand).toMatchObject({ leaderId: ANN, unitId: BEA, day: s.day, slot: s.slot });
    expect(countermandOpen(r.state)).not.toBeNull();
    expect(ofType(r.events, 'activity_done')).toEqual([]);
  });

  it('a unit picked by unitIds can be countermanded too', () => {
    const s = seeded(lead(), train(), true);
    expect(ofType(run(s, reg, train()).events, 'countermanded')).toHaveLength(1);
  });

  it('no roll without a leader (rng untouched)', () => {
    const s = fresh();
    s.rng = seedRng(7);
    const r = run(s, reg, train(BEA));
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'countermanded')).toEqual([]);
    expect(r.state.rng).toEqual(s.rng);
    expect(r.state.power?.countermand).toBeUndefined();
  });

  it('a non-countermandable activity or one with only the leader is never countermanded', () => {
    const s = lead();
    for (let seed = 1; seed <= 60; seed++) {
      s.rng = seedRng(seed);
      const own = run(s, reg, train(ANN)); // only the leader
      expect(ofType(own.events, 'countermanded'), `leader only, seed ${seed}`).toEqual([]);
      expect(own.state.rng).toEqual(s.rng);
      const alone = run(s, reg, { type: 'activity/do', payload: { activityId: 'train', focus: 'commander' } });
      expect(ofType(alone.events, 'countermanded')).toEqual([]);
      const mess = run(s, reg, { type: 'activity/do', payload: { activityId: 'mess' } });
      expect(ofType(mess.events, 'countermanded')).toEqual([]);
    }
    expect((reg.activities.get('mess') as { countermandable?: boolean }).countermandable).toBeUndefined();
    expect(['train', 'rest', 'work', 'study'].every((id) => (reg.activities.get(id) as { countermandable?: boolean }).countermandable === true)).toBe(true);
  });

  it('ACCEPT drops it; OVERRULE runs the activity once and applies leader_overruled and +3 record', () => {
    const held = run(seeded(lead(), train(BEA), true), reg, train(BEA)).state;
    const accepted = run(held, reg, { type: 'power/countermand', payload: { answer: 'accept' } });
    expect(ofType(accepted.events, 'countermand_accepted')).toHaveLength(1);
    expect(accepted.state.power!.countermand).toBeUndefined();
    expect(accepted.state.slot).toBe(held.slot);
    const trust = held.relations[ANN].trust;
    const r = run(held, reg, { type: 'power/countermand', payload: { answer: 'overrule' } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'countermand_overruled')).toHaveLength(1);
    expect(ofType(r.events, 'activity_done')).toHaveLength(1);
    expect(ofType(r.events, 'countermanded')).toEqual([]); // the re-run is not rolled again
    expect(r.state.slot).not.toBe(held.slot);
    expect(r.state.relations[ANN].trust).toBeLessThan(trust);
    expect(recordOf(r.state, ANN)).toBe(3);
    expect(r.state.power!.countermand).toBeUndefined();
    expect(errors(run(r.state, reg, { type: 'power/countermand', payload: { answer: 'accept' } }).events)).toHaveLength(1); // nothing is open
    expect(errors(run(held, reg, { type: 'power/countermand', payload: { answer: 'shout' } }).events)).toHaveLength(1);
  });

  it('a countermand left open is dropped at the next slot', () => {
    const held = run(seeded(lead(), train(BEA), true), reg, train(BEA)).state;
    const later = run(held, reg, { type: 'calendar/consume_slot', payload: {} }).state;
    expect(countermandOpen(later)).toBeNull();
    expect(errors(run(later, reg, { type: 'power/countermand', payload: { answer: 'overrule' } }).events)).toHaveLength(1);
    const dayLater = endDay(structuredClone(held), reg);
    expect(dayLater.power!.countermand).toBeUndefined();
  });

  it('removeFromService of the leader or the unit clears an open countermand', async () => {
    const { removeFromService } = await import('../../../src/engine/leash/use');
    const held = run(seeded(lead(), train(BEA), true), reg, train(BEA)).state;
    const a = structuredClone(held);
    removeFromService(a, ANN, 'deserted');
    expect(a.power!.countermand).toBeUndefined();
    const b = structuredClone(held);
    removeFromService(b, BEA, 'deserted');
    expect(b.power!.countermand).toBeUndefined();
  });
});
