import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { impunityOf } from '../../../src/engine/discipline';
import { countDeed, deedsOf } from '../../../src/engine/discipline/deeds';
import { patternHolds, patternScore, reputationDayStep } from '../../../src/engine/discipline/reputation';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, endDay, errors, loadCore, ofType, run } from '../../helpers/loyalty';
import { noPresence } from '../../helpers/discipline';

let base: Registries;
let reg: Registries;
beforeAll(async () => {
  base = await loadCore();
  reg = noPresence(base);
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const fresh = (): CampaignState => {
  const s = campaign(reg, 4);
  s.day = 20;
  for (const u of s.squad) { u.defects = []; u.values = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 }; s.relations[u.id].metDay = -50; s.relations[u.id].trust = 50; s.relations[u.id].affinity = 20; }
  return s;
};
const entry = (id: string) => reg.reputations.get(id)!;
const step = (s: CampaignState, r: Registries = reg) => reputationDayStep(s, { registries: r, rng: new Rng(s.rng) });
const deed = (s: CampaignState, counters: Record<string, number>) => { for (const [k, n] of Object.entries(counters)) countDeed(s, k as never, n); return s; };

describe('the registry', () => {
  it('seven drafts in four groups', () => {
    expect([...reg.reputations.keys()]).toEqual(['leash_holder', 'iron_rule', 'soft_touch', 'merchant', 'meatgrinder', 'shield', 'liar']);
    expect([...new Set([...reg.reputations.values()].map((e) => e.group))].sort()).toEqual(['authority', 'force', 'losses', 'word']);
  });
});

describe('patterns', () => {
  it('leash_holder holds at four Leash uses, three do not', () => {
    expect(patternHolds(deed(fresh(), { leash_compel: 2, leash_suppress: 1 }), entry('leash_holder'))).toBe(false);
    expect(patternHolds(deed(fresh(), { leash_compel: 2, leash_suppress: 1, leash_terminate: 1 }), entry('leash_holder'))).toBe(true);
  });
  it('merchant needs the share: 4 granted and 2 refused is 0.67, 4 and 1 is 0.8', () => {
    expect(patternHolds(deed(fresh(), { demands_granted: 4, demands_refused: 2 }), entry('merchant'))).toBe(false);
    expect(patternHolds(deed(fresh(), { demands_granted: 4, demands_refused: 1 }), entry('merchant'))).toBe(true);
    expect(patternHolds(deed(fresh(), { demands_granted: 3 }), entry('merchant'))).toBe(false); // under the minimum
  });
  it('liar: broken promises and empty threats against kept ones', () => {
    expect(patternHolds(deed(fresh(), { promises_broken: 2, threats_empty: 2, promises_kept: 4 }), entry('liar'))).toBe(true); // 4/8 = 0.5 holds
    expect(patternHolds(deed(fresh(), { promises_broken: 1, threats_empty: 2, promises_kept: 1 }), entry('liar'))).toBe(false); // under the minimum
    expect(patternHolds(deed(fresh(), { promises_broken: 2, threats_empty: 2, promises_kept: 5 }), entry('liar'))).toBe(false); // 4/9
  });
  it('the score is the sum over the minimum', () => {
    expect(patternScore(deed(fresh(), { leash_compel: 6 }), entry('leash_holder'))).toBe(1.5);
    expect(patternScore(fresh(), entry('leash_holder'))).toBe(0);
  });
});

describe('the day step queues a pending nickname', () => {
  it('a met pattern queues one at the day end', () => {
    const s = deed(fresh(), { leash_compel: 4 });
    const events = step(s);
    expect(ofType(events, 'nickname_pending')).toEqual([{ type: 'nickname_pending', id: 'leash_holder' }]);
    expect(s.commander.reputation).toEqual({ active: [], pending: { id: 'leash_holder', queuedDay: 20 } });
  });
  it('never a second while one is pending', () => {
    const s = deed(fresh(), { leash_compel: 4, protected: 3 });
    step(s);
    const first = s.commander.reputation!.pending!.id;
    expect(step(s)).toEqual([]);
    expect(s.commander.reputation!.pending!.id).toBe(first);
  });
  it('the best-scoring pattern of the groups goes first', () => {
    const s = deed(fresh(), { leash_compel: 4, protected: 9 });
    step(s);
    expect(s.commander.reputation!.pending!.id).toBe('shield');
  });
  it('nothing is queued with no pattern met', () => {
    const s = deed(fresh(), { leash_compel: 3 });
    expect(step(s)).toEqual([]);
    expect(s.commander.reputation).toBeUndefined();
  });
  it('no pending while its group has an active nickname that scores at least as high', () => {
    const s = deed(fresh(), { leash_compel: 4, punish_2: 6 }); // both are force: leash_holder 1, iron_rule 1
    s.commander.reputation = { active: [{ id: 'leash_holder', name: 'the Leash-Hand', sinceDay: 3 }] };
    expect(step(s)).toEqual([]);
  });
  it('it replaces an active nickname of its group that scores lower', () => {
    const s = deed(fresh(), { leash_compel: 4, punish_2: 12 }); // iron_rule scores 2
    s.commander.reputation = { active: [{ id: 'leash_holder', name: 'the Leash-Hand', sinceDay: 3 }] };
    expect(ofType(step(s), 'nickname_pending')).toEqual([{ type: 'nickname_pending', id: 'iron_rule', replaces: 'leash_holder' }]);
  });
  it('it replaces an active nickname that no longer holds', () => {
    const s = deed(fresh(), { protected: 3 });
    s.commander.reputation = { active: [{ id: 'meatgrinder', name: 'Meatgrinder', sinceDay: 3 }] }; // same group, no grunts lost
    expect(ofType(step(s), 'nickname_pending')).toEqual([{ type: 'nickname_pending', id: 'shield', replaces: 'meatgrinder' }]);
  });
  it('a third group waits while two are active and both still hold', () => {
    const s = deed(fresh(), { leash_compel: 4, protected: 3, defiance_tolerated: 5 });
    s.commander.reputation = { active: [{ id: 'leash_holder', name: 'a', sinceDay: 1 }, { id: 'shield', name: 'b', sinceDay: 1 }] };
    expect(step(s)).toEqual([]);
  });
  it('a third group takes the place of an active nickname that no longer holds', () => {
    const s = deed(fresh(), { leash_compel: 4, defiance_tolerated: 5 });
    s.commander.reputation = { active: [{ id: 'leash_holder', name: 'a', sinceDay: 1 }, { id: 'shield', name: 'b', sinceDay: 1 }] }; // shield no longer holds
    expect(ofType(step(s), 'nickname_pending')).toEqual([{ type: 'nickname_pending', id: 'soft_touch', replaces: 'shield' }]);
  });
  it('an active nickname that no longer holds and has no successor leaves after a week', () => {
    const s = fresh();
    s.commander.reputation = { active: [{ id: 'shield', name: 'the Shield', sinceDay: 1 }] };
    step(s);
    expect(s.commander.reputation!.active[0].lapsedDay).toBe(20);
    s.day = 26;
    expect(step(s)).toEqual([]);
    s.day = 27;
    expect(ofType(step(s), 'nickname_dropped')).toEqual([{ type: 'nickname_dropped', id: 'shield' }]);
    expect(s.commander.reputation!.active).toEqual([]);
  });
  it('a nickname that holds again is not dropped', () => {
    const s = fresh();
    s.commander.reputation = { active: [{ id: 'shield', name: 'the Shield', sinceDay: 1, lapsedDay: 15 }] };
    deed(s, { protected: 3 });
    step(s);
    expect(s.commander.reputation!.active[0].lapsedDay).toBeUndefined();
  });
  it('runs in the day step', () => {
    const s = deed(fresh(), { leash_compel: 4 });
    expect(endDay(s, reg).commander.reputation!.pending!.id).toBe('leash_holder');
  });
  it('an old save without reputation or deeds runs the step', () => {
    const s = fresh();
    delete s.commander.deeds;
    delete s.commander.reputation;
    expect(step(s)).toEqual([]);
  });
});

describe('the nickname moment', () => {
  const pendingState = (id = 'leash_holder'): CampaignState => {
    const s = fresh();
    s.commander.reputation = { active: [], pending: { id, queuedDay: 19 } };
    // it was queued because its pattern held, and it still does
    const p = entry(id).pattern as { sum: string[]; min: number };
    countDeed(s, p.sum[0] as never, p.min);
    return s;
  };
  const inScene = (s: CampaignState, ids = [ANN]): CampaignState =>
    run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: ids, origin: 'event', startIndex: 0 } }).state;
  const introduce = (s: CampaignState, unitId = ANN) => run(s, reg, { type: 'reputation/introduce', payload: { unitId } });

  it('a pending nickname whose pattern stopped holding is not said aloud and the queue is free', () => {
    const s = fresh();
    s.commander.reputation = { active: [], pending: { id: 'merchant', queuedDay: 19 } }; // nothing granted: the pattern does not hold
    const r = introduce(inScene(s));
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'nickname_given')).toEqual([]);
    expect(r.state.commander.reputation).toEqual({ active: [] });
  });
  it('the day step drops a waiting nickname that no longer holds and queues the one that does', () => {
    const s = deed(fresh(), { leash_compel: 4 });
    s.commander.reputation = { active: [], pending: { id: 'merchant', queuedDay: 19 } };
    const events = step(s);
    expect(ofType(events, 'nickname_pending')).toEqual([{ type: 'nickname_pending', id: 'leash_holder' }]);
    expect(s.commander.reputation!.pending!.id).toBe('leash_holder');
  });
  it('the pending nickname becomes active with its name copied', () => {
    const r = introduce(inScene(pendingState()));
    expect(errors(r.events)).toEqual([]);
    expect(r.state.commander.reputation).toEqual({ active: [{ id: 'leash_holder', name: String(entry('leash_holder').name), sinceDay: 20, by: ANN }] });
    expect(ofType(r.events, 'nickname_given')).toEqual([{ type: 'nickname_given', id: 'leash_holder', name: String(entry('leash_holder').name), unitId: ANN }]);
  });
  it('a public fact names it', () => {
    const r = introduce(inScene(pendingState()));
    const fact = r.state.memory.facts.at(-1)!;
    expect(fact.text).toContain(String(entry('leash_holder').name));
    expect(fact.knownBy).toEqual(['*']);
    expect(fact.text).not.toMatch(/\b(he|him|his)\b/i);
  });
  it('each named unit reacts once by her values', () => {
    const s = pendingState();
    s.squad[0].values.autonomy = 2; // Ann values autonomy: the Leash-hand repels her
    s.squad[1].values.autonomy = 0;
    s.squad[2].values.autonomy = -2;
    const r = introduce(inScene(s));
    expect(r.state.relations[ANN].trust).toBe(50 - 4);
    expect(r.state.relations[ANN].affinity).toBe(20 - 6);
    expect(r.state.relations[BEA]).toMatchObject({ trust: 50, affinity: 20 });
    expect(r.state.relations['unit_cat']).toMatchObject({ trust: 50, affinity: 20 });
  });
  it('a second introduce of the same id never reacts again', () => {
    const s = pendingState();
    s.squad[0].values.autonomy = 2;
    const first = introduce(inScene(s)).state;
    const trust = first.relations[ANN].trust;
    first.commander.reputation = { active: [], pending: { id: 'leash_holder', queuedDay: 25 } };
    const again = introduce(first);
    expect(errors(again.events)).toEqual([]);
    expect(again.state.relations[ANN].trust).toBe(trust);
  });
  it('replaces the nickname it replaces', () => {
    const s = deed(fresh(), { punish_2: 6 });
    s.commander.reputation = { active: [{ id: 'leash_holder', name: 'old', sinceDay: 2 }, { id: 'shield', name: 'the Shield', sinceDay: 3 }], pending: { id: 'iron_rule', queuedDay: 19, replaces: 'leash_holder' } };
    const r = introduce(inScene(s));
    expect(r.state.commander.reputation!.active.map((x) => x.id)).toEqual(['shield', 'iron_rule']);
    expect(ofType(r.events, 'nickname_given')[0]).toMatchObject({ id: 'iron_rule', replaced: 'leash_holder' });
  });
  it('is refused in a group scene, with no scene, with nothing pending and for a unit who is not in the scene', () => {
    expect(errors(introduce(inScene(pendingState(), [ANN, BEA])).events)).toHaveLength(1);
    expect(errors(introduce(pendingState()).events)).toHaveLength(1);
    expect(errors(introduce(inScene(fresh())).events)).toHaveLength(1);
    expect(errors(introduce(inScene(pendingState(), [ANN]), BEA).events)).toHaveLength(1);
  });
  it('an active nickname moves every unit\'s impunity base (leash_holder → 30 on a guarded world)', () => {
    const s = fresh();
    expect(impunityOf(s, reg, ANN)!.terms.base).toBe(35);
    s.commander.reputation = { active: [{ id: 'leash_holder', name: 'x', sinceDay: 1 }] };
    expect(impunityOf(s, reg, ANN)!.terms.base).toBe(30);
    expect(impunityOf(s, reg, BEA)!.terms.base).toBe(30);
  });
  it('deedsOf reads what the patterns read', () => {
    expect(deedsOf(deed(fresh(), { leash_compel: 2 })).leash_compel).toBe(2);
  });
});
