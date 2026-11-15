import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { recordOf } from '../../../src/engine/discipline/record';
import { refusalChance } from '../../../src/engine/loyalty/refusal';
import { liveVote } from '../../../src/engine/power/state';
import { removeFromService } from '../../../src/engine/leash/use';
import type { CampaignState, Vote } from '../../../src/engine/state/types';
import { campaign, endDay, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import { payload, withMission } from '../../helpers/expedition';
import { withOptions } from '../../helpers/power';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
const named = (s: CampaignState) => s.squad.filter((u) => u.kind === 'named');
const setValues = (s: CampaignState, id: string, v: Partial<typeof ZERO>) => {
  s.squad.find((u) => u.id === id)!.values = { ...ZERO, ...v };
};

/** Voting on, a command mission on the board, every unit neutral (Trust 50, values 0, so every ballot is FOR). */
function board(over: { voting?: boolean } = {}): { state: CampaignState; missionId: string } {
  const base = campaign(reg, 4);
  base.commander.socialStats.authority = 1;
  base.leash.authorizationsLeft = 3;
  for (const u of named(base)) {
    u.values = { ...ZERO };
    setRelation(base, u.id, { trust: 50 });
  }
  if (over.voting !== false) withOptions(base, { voting: 'on' });
  const { state, mission } = withMission(reg, base, { templateId: 'tpl_sweep' });
  return { state, missionId: mission.id };
}
/**
 * The squad is against a command mission: ANN loudest (autonomy 3), BEA and CAT (2). Each score is −autonomy plus the
 * disciplined stance bias +1, so 3 against 1 (the commander) and the vote fails. DEE is in reserve and has no ballot.
 */
function against(state: CampaignState): void {
  setValues(state, ANN, { autonomy: 3 });
  setValues(state, BEA, { autonomy: 2 });
  setValues(state, CAT, { autonomy: 2 });
  setValues(state, DEE, { autonomy: 3 });
  state.squad.find((u) => u.id === DEE)!.status = 'reserve';
  state.roster.activeIds = [ANN, BEA, CAT];
}
const start = (state: CampaignState, missionId: string, extra: Record<string, unknown> = {}) =>
  run(state, reg, { type: 'expedition/start', payload: { ...payload(state, missionId, { unitIds: [ANN, BEA, CAT] }), ...extra } });
const open = (state: CampaignState, kind: string, subject: string) => run(state, reg, { type: 'vote/open', payload: { kind, subject } });
const openVote = (state: CampaignState): Vote => state.power!.votes.open!;

describe('the gate', () => {
  it('voting off: expedition/start runs without a vote', () => {
    const { state, missionId } = board({ voting: false });
    const r = start(state, missionId);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.expedition).toBeDefined();
  });

  it('voting on: expedition/start from the board returns vote_needed and changes nothing', () => {
    const { state, missionId } = board();
    const r = start(state, missionId);
    expect(r.events).toEqual([{ type: 'error', code: 'vote_needed', kind: 'mission', subject: missionId }]);
    expect(r.state).toBe(state);
  });

  it('with a passed vote it runs and the vote is carried', () => {
    const { state, missionId } = board();
    const opened = open(state, 'mission', missionId);
    expect(errors(opened.events)).toEqual([]);
    const v = openVote(opened.state);
    expect(v).toMatchObject({ id: 'v1', kind: 'mission', subject: missionId, status: 'passed', passed: true });
    const r = start(opened.state, missionId, { voteId: v.id });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.expedition).toBeDefined();
    expect(ofType(r.events, 'vote_carried')).toHaveLength(1);
    expect(r.state.power!.votes.open).toBeUndefined();
    expect(r.state.power!.votes.log).toEqual([expect.objectContaining({ id: 'v1', kind: 'mission', subject: missionId, result: 'carried' })]);
  });

  it('a carried vote cannot be reused', () => {
    const { state, missionId } = board();
    const v = openVote(open(state, 'mission', missionId).state);
    const opened = open(state, 'mission', missionId).state;
    const ran = start(opened, missionId, { voteId: v.id });
    expect(errors(ran.events)).toEqual([]);
    // the same payload again, in the state before the run, is blocked once the vote is spent: a fresh state that remembers the spent vote
    const back = structuredClone(ran.state);
    delete back.expedition;
    back.missions = structuredClone(opened.missions);
    const again = start(back, missionId, { voteId: v.id });
    expect(again.events).toEqual([{ type: 'error', code: 'vote_needed', kind: 'mission', subject: missionId }]);
  });

  it('a vote for another subject does not unlock this one', () => {
    const { state, missionId } = board();
    const opened = open(state, 'upgrade', 'workshop').state;
    const r = start(opened, missionId, { voteId: openVote(opened).id });
    expect(r.events).toEqual([{ type: 'error', code: 'vote_needed', kind: 'mission', subject: missionId }]);
    const unknown = start(opened, missionId, { voteId: 'v99' });
    expect(errors(unknown.events)[0]).toMatchObject({ code: 'vote_needed' });
  });

  it('a vote from yesterday does not unlock today', () => {
    const { state, missionId } = board();
    const opened = open(state, 'mission', missionId).state;
    const old = structuredClone(opened);
    old.day += 1; // a vote that survived a day end (it would normally be dropped)
    const r = start(old, missionId, { voteId: openVote(old).id });
    expect(errors(r.events)[0]).toMatchObject({ code: 'vote_needed' });
  });

  it('upgrade and a mild punishment are gated; a poi run, the tutorial run and the brig are not', () => {
    const { state, missionId } = board();
    state.resources.credits = 1000;
    state.resources.plyx = 1000;
    expect(errors(run(state, reg, { type: 'base/upgrade', payload: { facilityId: 'workshop' } }).events)[0]).toMatchObject({ code: 'vote_needed', kind: 'upgrade', subject: 'workshop' });
    expect(errors(run(state, reg, { type: 'discipline/punish', payload: { unitId: ANN, measure: 'verbal' } }).events)[0]).toMatchObject({ code: 'vote_needed', kind: 'punish', subject: ANN });
    expect(errors(run(state, reg, { type: 'discipline/punish', payload: { unitId: ANN, measure: 'bench' } }).events)[0]).toMatchObject({ code: 'vote_needed', kind: 'punish' });
    // not gated: the brig is above bench
    const brig = run(state, reg, { type: 'discipline/punish', payload: { unitId: ANN, measure: 'brig', days: 1 } });
    expect(errors(brig.events)).toEqual([]);
    // not gated: a point-of-interest run names no board mission
    const poi = run(state, reg, { type: 'expedition/start', payload: { ...payload(state, missionId), missionId: undefined, poi: { regionId: 'quarantine_d7', poiId: 'nowhere' } } });
    expect(errors(poi.events).every((e) => e.code !== 'vote_needed')).toBe(true);
    // not gated: a mission that is not on the board (already active) and a tutorial template
    const off = structuredClone(state);
    off.missions.active = off.missions.offered.splice(0);
    expect(errors(start(off, missionId).events).every((e) => e.code !== 'vote_needed')).toBe(true);
    const tut = structuredClone(state);
    const reg2: Registries = { ...reg, missionTemplates: new Map(reg.missionTemplates) };
    reg2.missionTemplates.set('tpl_sweep', { ...(reg.missionTemplates.get('tpl_sweep') as object), tutorial: true, fixedMap: { layers: [[{ type: 'combat' }]] } } as never);
    const t = run(tut, reg2, { type: 'expedition/start', payload: payload(tut, missionId) });
    expect(errors(t.events).every((e) => e.code !== 'vote_needed')).toBe(true);
  });

  it('vote/open is refused with voting off, for an unknown kind and for a missing subject', () => {
    const off = board({ voting: false });
    expect(errors(open(off.state, 'mission', off.missionId).events)).toHaveLength(1);
    const { state, missionId } = board();
    expect(errors(open(state, 'sandwich', missionId).events)).toHaveLength(1);
    expect(errors(open(state, 'mission', 'm_ghost').events)).toHaveLength(1);
    expect(errors(open(state, 'upgrade', 'ghost_facility').events)).toHaveLength(1);
    expect(errors(open(state, 'punish', 'unit_ghost').events)).toHaveLength(1);
  });

  it('opening a vote draws no rng and a second vote replaces the first', () => {
    const { state, missionId } = board();
    const a = open(state, 'mission', missionId).state;
    expect(a.rng).toEqual(state.rng);
    const b = open(a, 'upgrade', 'workshop').state;
    expect(openVote(b)).toMatchObject({ id: 'v2', kind: 'upgrade' });
    expect(b.power!.votes.log).toEqual([expect.objectContaining({ id: 'v1', result: 'dropped' })]);
  });
});

describe('dropping and overruling', () => {
  it('drop of a failed vote costs nothing', () => {
    const { state, missionId } = board();
    against(state);
    const opened = open(state, 'mission', missionId).state;
    expect(openVote(opened)).toMatchObject({ status: 'failed', passed: false });
    const before = structuredClone(opened.relations);
    const dropped = run(opened, reg, { type: 'vote/drop', payload: { voteId: 'v1' } });
    expect(errors(dropped.events)).toEqual([]);
    expect(ofType(dropped.events, 'vote_dropped')).toHaveLength(1);
    expect(dropped.state.relations).toEqual(before);
    expect(dropped.state.power!.votes.open).toBeUndefined();
    expect(dropped.state.power!.votes.log[0]).toMatchObject({ id: 'v1', result: 'dropped' });
    expect(errors(run(dropped.state, reg, { type: 'vote/drop', payload: { voteId: 'v1' } }).events)).toHaveLength(1);
  });

  it('overrule applies decision_violated moderate and +5 record to each against voter, and the action then runs', () => {
    const { state, missionId } = board();
    against(state);
    const opened = open(state, 'mission', missionId).state;
    expect(openVote(opened).ballots.filter((b) => b.vote === 'against').map((b) => b.unitId)).toEqual([ANN, BEA, CAT]);
    const trust = Object.fromEntries([ANN, BEA, CAT].map((id) => [id, opened.relations[id].trust]));
    const r = run(opened, reg, { type: 'vote/overrule', payload: { voteId: 'v1', means: 'order' } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'vote_overruled')).toHaveLength(1);
    for (const id of [ANN, BEA, CAT]) {
      expect(recordOf(r.state, id), id).toBe(5);
      const last = r.state.relations[id].history.filter((h) => h.kind === 'event').at(-1)!;
      expect(last).toMatchObject({ kind: 'event', type: 'decision_violated', severity: 'moderate' });
      expect(r.state.relations[id].trust, id).toBeLessThan(trust[id]);
      expect(r.state.power!.grudges![id]).toBe(r.state.day);
    }
    expect(recordOf(r.state, DEE)).toBe(0); // she is in reserve: no ballot, no cost
    expect(openVote(r.state).status).toBe('overruled');
    const ran = start(r.state, missionId, { voteId: 'v1' });
    expect(errors(ran.events)).toEqual([]);
    expect(ran.state.expedition).toBeDefined();
    expect(ran.state.power!.votes.log.at(-1)).toMatchObject({ id: 'v1', result: 'overruled' });
    expect(errors(start(r.state, missionId).events)[0]).toMatchObject({ code: 'vote_needed' }); // without the vote id it is still gated
  });

  it('vote/overrule on a passed vote is refused', () => {
    const { state, missionId } = board();
    const opened = open(state, 'mission', missionId).state;
    const r = run(opened, reg, { type: 'vote/overrule', payload: { voteId: 'v1', means: 'order' } });
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state).toBe(opened);
  });

  it('overrule by leash spends one authorization on the loudest dissenter; with none left it is refused and changes nothing', () => {
    const { state, missionId } = board();
    against(state);
    state.leash.authorizationsLeft = 2;
    const opened = open(state, 'mission', missionId).state;
    const r = run(opened, reg, { type: 'vote/overrule', payload: { voteId: 'v1', means: 'leash' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.leash.authorizationsLeft).toBe(1);
    expect(r.state.leash.log.at(-1)).toMatchObject({ unitId: ANN, kind: 'compel', outcome: 'done' });
    expect(openVote(r.state).status).toBe('overruled');
    const none = structuredClone(opened);
    none.leash.authorizationsLeft = 0;
    const refused = run(none, reg, { type: 'vote/overrule', payload: { voteId: 'v1', means: 'leash' } });
    expect(errors(refused.events)).toHaveLength(1);
    expect(refused.state).toBe(none);
  });

  it('overrule by punish applies the measure to the named dissenter', () => {
    const { state, missionId } = board();
    against(state);
    const opened = open(state, 'mission', missionId).state;
    const r = run(opened, reg, { type: 'vote/overrule', payload: { voteId: 'v1', means: 'punish', punish: { unitId: BEA, measure: 'verbal' } } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.discipline!.applications.map((a) => [a.unitId, a.measure])).toEqual([[BEA, 'verbal']]);
    expect(openVote(r.state).status).toBe('overruled');
    const outsider = run(opened, reg, { type: 'vote/overrule', payload: { voteId: 'v1', means: 'punish', punish: { unitId: DEE, measure: 'verbal' } } });
    expect(errors(outsider.events)).toHaveLength(1); // she did not vote against
    const none = run(opened, reg, { type: 'vote/overrule', payload: { voteId: 'v1', means: 'punish' } });
    expect(errors(none.events)).toHaveLength(1);
    const wrong = run(opened, reg, { type: 'vote/overrule', payload: { voteId: 'v1', means: 'shout' } });
    expect(errors(wrong.events)).toHaveLength(1);
  });
});

describe('grudges, day end and leaving the service', () => {
  it('a grudge multiplies refusal chance by 1.5 until the next day end', () => {
    const { state } = board();
    setRelation(state, ANN, { band: 'wavering', stateId: 'comrade' });
    const base = refusalChance(state, reg, ANN);
    expect(base).toBeGreaterThan(0);
    const g = structuredClone(state);
    g.power = { votes: { log: [], seq: 0 }, grudges: { [ANN]: g.day } };
    expect(refusalChance(g, reg, ANN)).toBeCloseTo(base * 1.5, 10);
    expect(refusalChance(g, reg, BEA)).toBe(refusalChance(state, reg, BEA));
    g.resources.supplies = 100;
    const after = endDay(g, reg);
    expect(after.power!.grudges ?? {}).toEqual({});
    setRelation(after, ANN, { band: 'wavering', stateId: 'comrade' }); // the day end may have moved her band: put it back
    expect(refusalChance(after, reg, ANN)).toBeCloseTo(base, 10);
  });

  it('an open vote is dropped at day end', () => {
    const { state, missionId } = board();
    state.resources.supplies = 100;
    const opened = open(state, 'mission', missionId).state;
    const after = endDay(opened, reg);
    expect(after.power!.votes.open).toBeUndefined();
    expect(after.power!.votes.log.at(-1)).toMatchObject({ id: 'v1', result: 'dropped' });
  });

  it('a save without power gets no power object from the day step', () => {
    const { state } = board({ voting: false });
    state.resources.supplies = 100;
    expect(endDay(state, reg).power).toBeUndefined();
  });

  it('removeFromService clears her grudge and ballot', () => {
    const { state, missionId } = board();
    against(state);
    const opened = open(state, 'mission', missionId).state;
    const failed = structuredClone(opened);
    failed.power!.grudges = { [ANN]: failed.day, [BEA]: failed.day };
    removeFromService(failed, ANN, 'deserted');
    expect(failed.power!.grudges).toEqual({ [BEA]: failed.day });
    const v = failed.power!.votes.open!;
    expect(v.ballots.map((b) => b.unitId)).toEqual([BEA, CAT]);
    expect(v).toMatchObject({ againstWeight: 2, forWeight: 1, status: 'failed', passed: false });
  });

  it('a ballot of a unit that died drops from the vote the panel reads, and the result follows', () => {
    const { state, missionId } = board();
    against(state);
    const opened = open(state, 'mission', missionId).state;
    expect(liveVote(opened)).toMatchObject({ forWeight: 1, againstWeight: 3, passed: false });
    const dead = structuredClone(opened);
    for (const id of [ANN, BEA]) dead.squad.find((u) => u.id === id)!.status = 'dead';
    const read = liveVote(dead)!;
    expect(read.ballots.map((b) => b.unitId)).toEqual([CAT]);
    expect(read).toMatchObject({ forWeight: 1, againstWeight: 1, passed: true, status: 'passed' });
    expect(openVote(dead).status).toBe('failed'); // the stored vote is not rewritten by a read
  });
});
