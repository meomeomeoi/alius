import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { decideArc } from '../../../src/engine/arcs';
import { recordOf } from '../../../src/engine/discipline/record';
import { challengeChance, CHALLENGE_STATS } from '../../../src/engine/power/moves';
import { countermandChance, privilegeScale } from '../../../src/engine/power/leader';
import { computeHierarchy, standingOf } from '../../../src/engine/power/standing';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import { withLeader } from '../../helpers/power';
import { withBond } from '../../helpers/bonds';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };

function fresh(): CampaignState {
  const s = campaign(reg, 4);
  s.day = 20;
  for (const u of s.squad) {
    u.values = { ...ZERO };
    setRelation(s, u.id, { trust: 50 });
    withBond(s, u.id, { leadStyle: u.id === ANN ? 'dominant' : 'balanced' });
  }
  return withLeader(s, ANN);
}
const act = (s: CampaignState, type: string, payload: unknown = {}) => run(s, reg, { type, payload });
/** The standing the leader has, tuned by a bonus (a negative bonus lowers it). */
function standing(s: CampaignState, target: number): CampaignState {
  delete s.power!.hierarchy!.standingBonus;
  const base = standingOf(s, reg, ANN)!;
  s.power!.hierarchy!.standingBonus = { unitId: ANN, amount: target - base, untilDay: s.day + 30 };
  return s;
}
/** A seed whose single challenge roll lands as asked. */
function seeded(s: CampaignState, won: boolean): CampaignState {
  for (let seed = 1; seed < 400; seed++) {
    const t = structuredClone(s);
    t.rng = seedRng(seed);
    const r = act(t, 'power/challenge', { stat: 'authority' });
    if (errors(r.events).length === 0 && (ofType(r.events, 'challenge_resolved')[0] as unknown as { won: boolean }).won === won) return t;
  }
  throw new Error('no seed found');
}

describe('endorse', () => {
  it('raises her Trust and Affinity, +3 record for every other named unit, writes co_command', () => {
    const s = fresh();
    const r = act(s, 'power/endorse');
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'leader_endorsed')).toEqual([{ type: 'leader_endorsed', unitId: ANN }]);
    expect(r.state.power!.hierarchy!.endorsed).toBe(true);
    expect(r.state.relations[ANN].trust).toBeGreaterThan(s.relations[ANN].trust);
    expect(r.state.relations[ANN].affinity).toBeGreaterThan(s.relations[ANN].affinity);
    expect(r.state.relations[ANN].flags).toContain('co_command');
    expect([BEA, CAT, DEE].map((id) => recordOf(r.state, id))).toEqual([3, 3, 3]);
    expect(recordOf(r.state, ANN)).toBe(0);
  });

  it('twice, without a leader, or for a unit that is no longer in service is refused', () => {
    const s = fresh();
    const once = act(s, 'power/endorse').state;
    expect(errors(act(once, 'power/endorse').events)).toHaveLength(1);
    const none = campaign(reg, 4);
    expect(errors(act(none, 'power/endorse').events)).toHaveLength(1);
    const dead = fresh();
    dead.squad.find((u) => u.id === ANN)!.status = 'dead';
    expect(errors(act(dead, 'power/endorse').events)).toHaveLength(1);
  });

  it('privileges × 1.5 while endorsed', () => {
    const s = fresh();
    expect(privilegeScale(s, reg)).toBe(1);
    const e = act(s, 'power/endorse').state;
    expect(privilegeScale(e, reg)).toBe(1.5);
    expect(countermandChance(e, reg)).toBeCloseTo(0.3, 10);
  });

  it('leaving leadership removes co_command unless Embrace set it', () => {
    const s = act(fresh(), 'power/endorse').state;
    expect(s.relations[ANN].flags).toContain('co_command');
    s.power!.hierarchy!.standingBonus = { unitId: BEA, amount: 500, untilDay: s.day + 5 }; // she falls behind
    computeHierarchy(s, reg);
    expect(s.power!.hierarchy!.leaderId).toBeUndefined();
    expect(s.power!.hierarchy!.endorsed).toBe(false);
    expect(s.relations[ANN].flags).not.toContain('co_command');
    // Embrace of the defect that names the flag keeps it
    const e = act(fresh(), 'power/endorse').state;
    e.squad.find((u) => u.id === ANN)!.defects = [{ id: 'dominance_drive', arc: 'embrace' } as never];
    e.power!.hierarchy!.standingBonus = { unitId: BEA, amount: 500, untilDay: e.day + 5 };
    computeHierarchy(e, reg);
    expect(e.power!.hierarchy!.leaderId).toBeUndefined();
    expect(e.relations[ANN].flags).toContain('co_command');
  });

  it('Embrace of Dominance Drive on the leader endorses her', () => {
    const d = fresh();
    d.resources.credits = 9999; d.resources.supplies = 99; d.resources.plyx = 99;
    d.squad.find((u) => u.id === ANN)!.defects = [{ id: 'dominance_drive' }];
    d.relations[ANN].stateId = 'devoted';
    d.relations[ANN].flags.push('arc_raised');
    d.day = 30;
    d.power!.hierarchy!.computedDay = 30;
    d.base.facilities.medbay = 3;
    expect(d.power!.hierarchy!.endorsed).toBe(false);
    const events = decideArc(d, { registries: reg, rng: new Rng(d.rng) }, { unitId: ANN, defectId: 'dominance_drive', path: 'embrace', compel: true });
    expect(events.some((e) => e.type === 'arc_decided')).toBe(true);
    expect(d.power!.hierarchy!.endorsed).toBe(true);
    expect(events.filter((e) => e.type === 'leader_endorsed')).toHaveLength(1);
    expect([BEA, CAT, DEE].map((id) => recordOf(d, id))).toEqual([3, 3, 3]);
    // a unit who is not the leader does not endorse anyone
    const other = fresh();
    other.resources.credits = 9999; other.resources.supplies = 99; other.resources.plyx = 99;
    other.squad.find((u) => u.id === BEA)!.defects = [{ id: 'dominance_drive' }];
    other.relations[BEA].stateId = 'devoted';
    other.relations[BEA].flags.push('arc_raised');
    other.day = 30;
    other.base.facilities.medbay = 3;
    decideArc(other, { registries: reg, rng: new Rng(other.rng) }, { unitId: BEA, defectId: 'dominance_drive', path: 'embrace', compel: true });
    expect(other.power!.hierarchy!.endorsed).toBe(false);
  });
});

describe('challenge', () => {
  it('the chance: equal ranks 0.5, two ranks up 0.74, clamped at 0.15 and 0.85', () => {
    const s = standing(fresh(), 78); // her rank round(78 / 26) = 3
    const at = (rank: number, stat: 'authority' | 'empathy') => {
      s.commander.socialStats[stat] = rank;
      return challengeChance(s, reg, stat);
    };
    expect(at(3, 'authority')).toBeCloseTo(0.5, 10);
    expect(at(5, 'authority')).toBeCloseTo(0.74, 10);
    expect(at(1, 'empathy')).toBeCloseTo(0.26, 10);
    standing(s, 130); // rank 5
    expect(at(1, 'authority')).toBe(0.15);
    standing(s, 5); // rank 1 (clamped up)
    expect(at(5, 'authority')).toBe(0.85);
    // body stats read the commander's body
    const body = standing(fresh(), 78);
    body.commander.body = { strength: 5, endurance: 1, reflexes: 3 };
    expect(challengeChance(body, reg, 'strength')).toBeCloseTo(0.74, 10);
    expect(challengeChance(body, reg, 'endurance')).toBeCloseTo(0.26, 10);
    expect(challengeChance(body, reg, 'reflexes')).toBeCloseTo(0.5, 10);
    expect([...CHALLENGE_STATS]).toEqual(['authority', 'empathy', 'strength', 'endurance', 'reflexes']);
  });

  it('a win deposes her for 14 days, takes her leadership at once and she cannot lead again before then', () => {
    const s = seeded(fresh(), true);
    const r = act(s, 'power/challenge', { stat: 'authority' });
    expect(ofType(r.events, 'challenge_resolved')).toEqual([expect.objectContaining({ unitId: ANN, stat: 'authority', won: true })]);
    expect(ofType(r.events, 'leader_changed')).toEqual([{ type: 'leader_changed', from: ANN }]);
    const h = r.state.power!.hierarchy!;
    expect(h.leaderId).toBeUndefined();
    expect(h.endorsed).toBe(false);
    expect(h.deposed).toEqual({ unitId: ANN, untilDay: s.day + 14 });
    expect(h.challengeCooldownUntil).toBe(s.day + 14);
    expect(recordOf(r.state, ANN)).toBe(-5);
    expect(r.state.relations[ANN].affinity).toBeLessThan(s.relations[ANN].affinity);
    // she is far ahead, but deposed: no leader until the day passes
    const ahead = structuredClone(r.state);
    ahead.power!.merit = [{ day: ahead.day, unitId: ANN, points: 5 }]; // she has fought: leadership is earned
    standing(ahead, 200);
    computeHierarchy(ahead, reg);
    expect(ahead.power!.hierarchy!.leaderId).toBeUndefined();
    ahead.day += 14;
    ahead.power!.merit = [{ day: ahead.day, unitId: ANN, points: 5 }]; // fresh merit: the old entry aged out
    computeHierarchy(ahead, reg);
    expect(ahead.power!.hierarchy!.leaderId).toBe(ANN);
  });

  it('a loss: +10 standing for 14 days and +10 record for everyone', () => {
    const s = seeded(fresh(), false);
    const before = standingOf(s, reg, ANN)!;
    const r = act(s, 'power/challenge', { stat: 'authority' });
    expect(ofType(r.events, 'challenge_resolved')).toEqual([expect.objectContaining({ won: false })]);
    expect([ANN, BEA, CAT, DEE].map((id) => recordOf(r.state, id))).toEqual([10, 10, 10, 10]);
    expect(r.state.power!.hierarchy!.standingBonus).toEqual({ unitId: ANN, amount: 10, untilDay: s.day + 14 });
    expect(r.state.power!.hierarchy!.leaderId).toBe(ANN);
    expect(standingOf(r.state, reg, ANN)).toBeGreaterThanOrEqual(before + 10 - 1);
    expect(r.state.relations[ANN].trust).toBeLessThan(s.relations[ANN].trust);
    expect(r.state.power!.hierarchy!.challengeCooldownUntil).toBe(s.day + 14);
  });

  it('a second challenge inside the cooldown is refused, with the days left; after it, allowed', () => {
    const lost = act(seeded(fresh(), false), 'power/challenge', { stat: 'authority' }).state;
    const again = act(lost, 'power/challenge', { stat: 'authority' });
    expect(errors(again.events)).toHaveLength(1);
    expect(String(errors(again.events)[0].message)).toMatch(/14 days/);
    expect(again.state).toBe(lost);
    const later = structuredClone(lost);
    later.day += 14;
    later.power!.hierarchy!.computedDay = later.day;
    expect(errors(act(later, 'power/challenge', { stat: 'strength' }).events)).toEqual([]);
  });

  it('a challenge draws exactly one rng value', () => {
    const s = fresh();
    s.rng = seedRng(9);
    const r = act(s, 'power/challenge', { stat: 'empathy' });
    const probe = new Rng(s.rng);
    probe.chance(0.5);
    expect(r.state.rng).toEqual(probe.state);
  });

  it('is refused without a leader, with a scene open, for an unknown stat and for a unit that is not the leader', () => {
    expect(errors(act(campaign(reg, 4), 'power/challenge', { stat: 'authority' }).events)).toHaveLength(1);
    const scene = fresh();
    scene.scene = { id: 'sc', participants: [ANN], mode: 'private', locationId: 'mess_hall', exchanges: 0 } as never;
    expect(errors(act(scene, 'power/challenge', { stat: 'authority' }).events)).toHaveLength(1);
    expect(errors(act(fresh(), 'power/challenge', { stat: 'charm' }).events)).toHaveLength(1);
    expect(errors(act(fresh(), 'power/challenge', {}).events)).toHaveLength(1);
  });
});
