import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/memory';
import type { EngineEvent } from '../../../src/engine/dispatch';
import { memoryResolverFor, RESOLVER_SHAPES, type MemoryResolution } from '../../../src/engine/memory/resolvers';
import type { CampaignState } from '../../../src/engine/state/types';
import { unitStats } from '../../../src/engine/combat/stats';
import { endExpedition } from '../../../src/engine/world/expedition';
import { depart, withMission } from '../../helpers/expedition';
import { ctxFrom, ofType, plain, withStance } from '../../helpers/personal';
import '../../../src/engine/actions/calendar';
import { carryVote } from '../../../src/engine/power/votes';
import { campaign, errors, loadCore, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
const fresh = (): CampaignState => {
  const s = campaign(reg, 4);
  s.day = 10;
  return s;
};
const resolve = (s: CampaignState, e: EngineEvent): MemoryResolution | null => {
  const fn = memoryResolverFor(e.type);
  if (!fn) throw new Error(`no resolver for ${e.type}`);
  return fn(s, e, reg);
};
const report = (over: Record<string, unknown> = {}) => ({
  id: 'rep_x1', missionId: 'm1', missionTitle: 'Sweep the Ashway', regionId: 'ashway', day: 10, outcome: 'failed', party: [ANN, BEA, CAT], nodes: [], log: [], loot: [],
  injuries: [BEA], deaths: [CAT], breakdowns: [], acknowledged: false, debriefed: false, ...over,
}) as unknown as CampaignState['lastExpedition'];

describe('resolvers', () => {
  it('every v1 event type has a resolver with a shape', () => {
    for (const t of [
      'expedition_ended', 'breakdown', 'order_refused', 'mutiny_started', 'mutiny_subdued', 'unit_deserted', 'deserter_returned', 'vote_overruled', 'vote_carried',
      'dilemma_resolved', 'countermanded', 'rations_set', 'demand_resolved', 'leash_used', 'decor_removed_by_commander', 'token_taken_off', 'booking_cancelled',
      'wager_resolved', 'intercept_resolved', 'activity_done',
    ]) {
      expect(memoryResolverFor(t), t).toBeTypeOf('function');
      expect(RESOLVER_SHAPES[t], t).toBeDefined();
    }
    expect(memoryResolverFor('no_such_event')).toBeUndefined();
  });

  it('expedition_ended: the resolver returns its ids and vars', () => {
    const s = fresh();
    s.lastExpedition = report();
    const r = resolve(s, { type: 'expedition_ended', outcome: 'failed', reportId: 'rep_x1' })!;
    expect(r.ids).toEqual({ party: [ANN, BEA, CAT], dead: [CAT], injured: [BEA] });
    expect(r.vars).toMatchObject({ region: 'The Ashway', mission: 'Sweep the Ashway', outcome: 'failed', dead: 'yes', injured: 'yes' });
    s.lastExpedition = report({ deaths: [], injuries: [], outcome: 'success' });
    expect(resolve(s, { type: 'expedition_ended', outcome: 'success', reportId: 'rep_x1' })!.vars).toMatchObject({ outcome: 'success', dead: '', injured: '' });
  });

  it('a hidden injury is never in the injured group', () => {
    // finding 5: a bad injury she hides (P9c) is a squad secret, not an entry of the report
    const base = plain(reg);
    withStance(base, reg, ANN, 'defiant_loyal');
    const { state, mission } = withMission(reg, base);
    const d = depart(reg, state, mission.id);
    const ann = d.squad.find((u) => u.id === ANN)!;
    ann.currentHp = Math.max(1, Math.floor(unitStats(d, reg, ann).hp * 0.2));
    const events = endExpedition(d, ctxFrom(d, reg), 'retreated');
    expect(ofType(events, 'secret_kept')).toHaveLength(1);
    const r = resolve(d, ofType(events, 'expedition_ended')[0])!;
    expect(r.ids.party).toContain(ANN);
    expect(r.ids.injured).toEqual([]);
    expect(r.vars.injured).toBe('');
  });

  it('breakdown and order_refused: subject and party, with the region of the run', () => {
    const s = fresh();
    s.expedition = { party: [ANN, BEA], regionId: 'ashway' } as unknown as CampaignState['expedition'];
    for (const type of ['breakdown', 'order_refused']) {
      const r = resolve(s, { type, unitId: BEA })!;
      expect(r.ids).toEqual({ subject: [BEA], party: [ANN, BEA] });
      expect(r.vars).toEqual({ name: 'Bea', region: 'The Ashway' });
    }
    delete s.expedition;
    const out = resolve(s, { type: 'breakdown', unitId: BEA })!;
    expect(out.ids.party).toEqual([BEA]);
    expect(out.vars.region).toBe('the field');
    expect(resolve(s, { type: 'order_refused' })).toBeNull(); // an enemy refuses nothing worth remembering
  });

  it('mutiny_started, mutiny_subdued, unit_deserted and deserter_returned: the subject', () => {
    const s = fresh();
    for (const type of ['mutiny_started', 'mutiny_subdued', 'unit_deserted', 'deserter_returned']) {
      expect(resolve(s, { type, unitId: CAT }), type).toEqual({ ids: { subject: [CAT] }, vars: { name: 'Cat' } });
    }
  });

  it('vote_overruled: the dissenters', () => {
    const s = fresh();
    expect(resolve(s, { type: 'vote_overruled', voteId: 'v1', means: 'plain', against: [ANN, BEA] })).toEqual({ ids: { against: [ANN, BEA] }, vars: { names: 'Ann and Bea' } });
    expect(resolve(s, { type: 'vote_overruled', voteId: 'v1', means: 'plain', against: [] })).toBeNull();
  });

  it('vote_carried: the kind label, and the subject; an overruled vote that was carried out is not a carry', () => {
    const s = fresh();
    const r = resolve(s, { type: 'vote_carried', voteId: 'v1', kind: 'upgrade', subject: 'medbay' })!;
    expect(r.ids).toEqual({});
    expect(r.vars.subject).toBe(String(reg.voteKinds.get('upgrade')!.label));
    expect(r.vars.what).toBe(String(reg.facilities.get('medbay')!.name));
    expect(resolve(s, { type: 'vote_carried', voteId: 'v1', kind: 'upgrade', subject: 'medbay', overruled: true })).toBeNull();
  });

  it('dilemma_resolved: the title, the option, the group, and the scapegoat answer by the authored option', () => {
    const s = fresh();
    const base = { type: 'dilemma_resolved', id: 'dl1', templateId: 't', option: 0, label: 'Hold the line', title: 'The Gate', affected: [ANN], units: [ANN, BEA], context: 'base' };
    expect(resolve(s, base)).toEqual({ ids: { affected: [ANN], units: [ANN, BEA], subject: [] }, vars: { title: 'The Gate', option: 'Hold the line', scapegoat: '', name: '' } });
    const take = resolve(s, { ...base, context: 'scapegoat', optionId: 'take_blame', subjectId: CAT })!;
    expect(take.vars).toMatchObject({ scapegoat: 'take', name: 'Cat' });
    expect(take.ids.subject).toEqual([CAT]);
    expect(resolve(s, { ...base, context: 'scapegoat', optionId: 'shift_blame', subjectId: CAT })!.vars.scapegoat).toBe('shift');
    expect(resolve(s, { ...base, context: 'scapegoat', optionId: 'something_else', subjectId: CAT })!.vars.scapegoat).toBe('');
  });

  it('countermanded: the unit and the leader', () => {
    expect(resolve(fresh(), { type: 'countermanded', leaderId: ANN, unitId: BEA, activityId: 'train' })).toEqual({
      ids: { subject: [BEA], leader: [ANN] }, vars: { name: 'Bea', leader: 'Ann' },
    });
  });

  it('rations_set: the mode', () => {
    expect(resolve(fresh(), { type: 'rations_set', mode: 'fighters_first' })).toEqual({ ids: {}, vars: { mode: 'fighters_first' } });
  });

  it('demand_resolved: the answer and whether it expired', () => {
    const s = fresh();
    expect(resolve(s, { type: 'demand_resolved', demandId: 'd1', unitId: ANN, answer: 'refuse' })).toEqual({ ids: { subject: [ANN] }, vars: { name: 'Ann', answer: 'refuse', expired: '', postponed: '' } });
    expect(resolve(s, { type: 'demand_resolved', demandId: 'd1', unitId: ANN, answer: 'refuse', postponed: true })!.vars.postponed).toBe('yes');
    expect(resolve(s, { type: 'demand_resolved', demandId: 'd1', unitId: ANN, answer: 'refuse', expired: true })!.vars.expired).toBe('yes');
  });

  it('leash_used: the kind; a denied request is not remembered', () => {
    const s = fresh();
    expect(resolve(s, { type: 'leash_used', kind: 'compel', unitId: ANN, no: 1, outcome: 'done' })).toEqual({ ids: { subject: [ANN] }, vars: { name: 'Ann', kind: 'compel' } });
    expect(resolve(s, { type: 'leash_used', kind: 'compel', unitId: ANN, no: 1, outcome: 'denied' })).toBeNull();
  });

  it('decor_removed_by_commander, token_taken_off and booking_cancelled', () => {
    const s = fresh();
    expect(resolve(s, { type: 'decor_removed_by_commander', unitId: ANN, part: 'poster' })).toEqual({ ids: { subject: [ANN] }, vars: { name: 'Ann' } });
    expect(resolve(s, { type: 'token_taken_off', tokenId: 'tk1', giverId: BEA })).toEqual({ ids: { giver: [BEA] }, vars: { name: 'Bea' } });
    expect(resolve(s, { type: 'booking_cancelled', bookingId: 'bk1', unitId: CAT })).toEqual({ ids: { subject: [CAT] }, vars: { name: 'Cat', lost: '' } });
    expect(resolve(s, { type: 'booking_cancelled', bookingId: 'bk1', unitId: CAT, lost: true })!.vars.lost).toBe('yes');
  });

  it('wager_resolved: her side of the result, game and stake; a void wager is not remembered', () => {
    const s = fresh();
    const e = { type: 'wager_resolved', wagerId: 'wg1', unitId: ANN, gameId: 'coin', stakeId: 'slot', winner: 'unit' };
    const r = resolve(s, e)!;
    expect(r.ids).toEqual({ subject: [ANN] });
    expect(r.vars).toEqual({ name: 'Ann', result: 'won', game: String(reg.wagerGames.get('coin')!.label), stake: String(reg.wagerStakes.get('slot')!.text) });
    expect(resolve(s, { ...e, winner: 'commander' })!.vars.result).toBe('lost');
    expect(resolve(s, { ...e, winner: 'void', expired: true })).toBeNull();
  });

  it('a stake of a disabled content category is never named', () => {
    const s = fresh();
    expect(reg.wagerStakes.get('her_mark')!.contentTags).toBeDefined();
    const e = { type: 'wager_resolved', wagerId: 'wg1', unitId: ANN, gameId: 'coin', stakeId: 'her_mark', winner: 'unit' };
    expect(resolve(s, e)!.vars.stake).toBe('a wager');
    expect(resolve(s, { ...e, stakeId: 'slot' })!.vars.stake).not.toBe('a wager');
  });

  it('intercept_resolved: the editor and whether the edit was kept', () => {
    const s = fresh();
    expect(resolve(s, { type: 'intercept_resolved', id: 'icp1', unitId: ANN, channel: 'dm', keep: true })).toEqual({ ids: { subject: [ANN] }, vars: { name: 'Ann', keep: 'yes' } });
    expect(resolve(s, { type: 'intercept_resolved', id: 'icp1', unitId: ANN, channel: 'dm', keep: false })!.vars.keep).toBe('');
  });

  it('activity_done: the companion, the activity and the slot spent', () => {
    const s = fresh();
    const r = resolve(s, { type: 'activity_done', activityId: 'train', companionId: BEA, vignette: false, slot: 'afternoon' })!;
    expect(r.ids).toEqual({ subject: [BEA] });
    expect(r.vars).toEqual({ name: 'Bea', activity: String(reg.activities.get('train')!.name), slot: 'afternoon', scene: '' });
    // an activity that opens a scene is remembered by the scene, not by this rule
    expect(resolve(s, { type: 'activity_done', activityId: 'talk', companionId: BEA, vignette: false, slot: 'morning' })!.vars.scene).toBe('yes');
    expect(resolve(s, { type: 'activity_done', activityId: 'train', vignette: false, slot: 'morning' })!.ids).toEqual({ subject: [] });
  });

  it('a resolver returns null when its source is gone', () => {
    const s = fresh();
    expect(resolve(s, { type: 'expedition_ended', outcome: 'failed', reportId: 'rep_x1' })).toBeNull(); // no lastExpedition
    s.lastExpedition = report({ id: 'rep_other' });
    expect(resolve(s, { type: 'expedition_ended', outcome: 'failed', reportId: 'rep_x1' })).toBeNull(); // another run's report
    expect(resolve(s, { type: 'dilemma_resolved', id: 'dl1', templateId: 't', nothing: true })).toBeNull();
  });

  it('a dead unit still resolves to its name', () => {
    const s = fresh();
    s.squad.find((u) => u.id === CAT)!.status = 'dead';
    expect(resolve(s, { type: 'unit_deserted', unitId: CAT })!.vars.name).toBe('Cat');
  });
});

describe('emitters carry what the resolvers read', () => {
  it('activity_done carries the slot spent', () => {
    const s = fresh();
    const r = run(s, reg, { type: 'activity/do', payload: { activityId: 'train', companionId: ANN } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'activity_done')[0]).toMatchObject({ companionId: ANN, slot: s.slot });
  });

  it('vote_carried of an overruled vote says so', () => {
    const s = fresh();
    const vote = { id: 'v1', kind: 'upgrade', subject: 'medbay', day: 10, ballots: [], commanderWeight: 1, forWeight: 0, againstWeight: 1, passed: false };
    s.power = { votes: { log: [], seq: 1, open: { ...vote, status: 'overruled' } } } as never;
    const carried = carryVote(s, 'v1');
    expect(carried[0]).toMatchObject({ type: 'vote_carried', overruled: true });
    s.power = { votes: { log: [], seq: 1, open: { ...vote, passed: true, status: 'passed' } } } as never;
    expect('overruled' in carryVote(s, 'v1')[0]).toBe(false);
  });
});
