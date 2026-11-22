import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/bonds';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { setCategories } from '../../../src/engine/bonds/content';
import { removeFromService } from '../../../src/engine/leash/use';
import { forgetPractices, holdsPractices, withdrawPractices } from '../../../src/engine/practice/forget';
import { ensurePractices } from '../../../src/engine/practice/gate';
import { issuePractice } from '../../../src/engine/practice/issue';
import { Rng } from '../../../src/engine/rng';
import type { OpenDemonstration, OpenPunishment, PracticeState, Task } from '../../../src/engine/practice/state';
import type { Booking, CampaignState, Rule } from '../../../src/engine/state/types';
import { endDay } from '../../helpers/loyalty';
import { errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, BEA, CAT, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const task = (id: string, holderId: string, over: Partial<Task> = {}): Task => ({
  id, holderId, kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'minor', check: 'model', proof: 'none', text: 't', summary: 's', status: 'open', acceptForm: 'button_cost', day: 18, ...over,
});
const punishment = (id: string, holderId: string, entryId: string, over: Partial<OpenPunishment> = {}): OpenPunishment => ({
  id, holderId, entryId, severity: 2, offence: { kind: 'task_broken', stakes: 'minor', day: 19 }, text: 't', summary: 's', status: 'offered', day: 19, ...over,
});
const demonstration = (id: string, holderId: string, over: Partial<OpenDemonstration> = {}): OpenDemonstration => ({
  id, holderId, tags: ['service'], summary: 's', text: 't', audienceIds: [BEA], stage: 'mess_hall', day: 19, status: 'offered', ...over,
});
const booking = (id: string, unitId: string, over: Partial<Booking> = {}): Booking => ({ id, unitId, kindId: 'held_in_quarters', day: 20, slot: 'evening', status: 'booked', source: 'roll', made: 19, ...over });

/** One of everything of Ann's, a task of Bea's that names Ann as the target, and a few things of Bea's that must stay. */
function full(): CampaignState {
  const s = world(reg, 'play');
  const p: PracticeState = ensurePractices(s);
  p.requests.push(
    { id: 'pq1', holderId: ANN, kind: 'task', day: 20, seedIds: [] },
    { id: 'pq2', holderId: BEA, kind: 'task', day: 20, seedIds: [] },
    { id: 'pq3', holderId: BEA, kind: 'task', day: 20, seedIds: [], targetUnitId: ANN },
  );
  p.tasks.push(
    task('pt1', ANN), task('pt2', ANN, { status: 'kept' }),
    task('pt3', BEA, { targetUnitId: ANN }), task('pt4', BEA), task('pt5', BEA, { targetUnitId: ANN, status: 'kept' }),
  );
  p.punishments.push(punishment('pp1', ANN, 'corner_time'), punishment('pp2', BEA, 'corner_time', { forUnitId: ANN }), punishment('pp3', BEA, 'corner_time'));
  p.demonstrations.push(demonstration('pd1', ANN), demonstration('pd2', BEA, { audienceIds: [ANN, CAT] }));
  p.held = { by: ANN, since: { day: 20, slot: 'evening' }, until: { day: 20, slot: 'evening' }, sensory: false, extended: 0, bookingIds: ['bk1'] };
  p.alarm = { id: 'pa1', holderId: ANN, kind: 'launch', day: 20, slot: 'evening' };
  p.permission = { holderId: ANN, ruleId: 'r1', asked: { day: 19, answer: 'grant' } };
  p.restrictions.push({ holderId: ANN, what: 'no_dms_others', untilDay: 22 }, { holderId: BEA, what: 'room', arg: 'x', untilDay: 22 });
  p.cold = { [ANN]: 22, [BEA]: 22 };
  p.postures = { [ANN]: [{ postureId: 'kneeling_upright', name: 'heel', day: 19 }], [BEA]: [{ postureId: 'kneeling_upright', name: 'sit', day: 19 }] };
  p.call = { id: 'pc1', holderId: ANN, postureId: 'kneeling_upright', sceneId: 's1', at: 1 };
  p.slap = { id: 'ps1', holderId: ANN, sceneId: 's1', windowMs: 500, feints: 0 };
  p.offences = { [ANN]: [18, 19], [BEA]: [19] };
  p.records.push({ day: 19, holderId: ANN, line: 'A. Day 19.' }, { day: 19, holderId: BEA, line: 'B. Day 19.' });
  p.handovers.push({ id: 'ph1', kind: 'device', holderId: ANN, untilDay: 23 }, { id: 'ph2', kind: 'key', holderId: BEA, untilDay: 23 });
  p.unfair = { [ANN]: { kind: 'no_guilt', day: 19 }, [BEA]: { kind: 'moved_goal', day: 19 } };
  p.lastThreat = { unitId: ANN, exchange: 1, day: 20 };
  p.verdictScene = { [ANN]: 's1', [BEA]: 's2' };
  p.asked = { context: 'vote', ref: 'v1', index: 'for', holderId: ANN };
  (s.personal ??= { seq: 0 }).bookings = [booking('bk1', ANN), booking('bk2', BEA, { day: 21, kindId: 'evening_with_me' })];
  return s;
}

describe('forgetPractices', () => {
  it('drops every trace of her: gone or void, her held bookings cancelled, no delta', () => {
    const s = full();
    expect(holdsPractices(s, ANN)).toBe(true);
    const relations = structuredClone(s.relations);
    const rng = structuredClone(s.rng);
    const events = forgetPractices(s, ANN);
    const p = s.practices!;
    expect(p.requests.map((r) => r.id)).toEqual(['pq2']); // hers and the one that names her
    expect(p.tasks.map((t) => [t.id, t.status])).toEqual([['pt3', 'void'], ['pt4', 'open'], ['pt5', 'kept']]); // hers go; an open one that names her is void, a closed one stays
    expect(p.punishments.map((x) => [x.id, x.status])).toEqual([['pp2', 'void'], ['pp3', 'offered']]);
    expect(p.demonstrations.map((x) => [x.id, x.audienceIds])).toEqual([['pd2', [CAT]]]);
    expect(p.held).toBeUndefined();
    expect(p.alarm).toBeUndefined();
    expect(p.permission).toBeUndefined();
    expect(p.restrictions).toEqual([{ holderId: BEA, what: 'room', arg: 'x', untilDay: 22 }]);
    expect(p.cold).toEqual({ [BEA]: 22 });
    expect(Object.keys(p.postures)).toEqual([BEA]);
    expect(p.call).toBeUndefined();
    expect(p.slap).toBeUndefined();
    expect(p.offences).toEqual({ [BEA]: [19] });
    expect(p.records).toEqual([{ day: 19, holderId: BEA, line: 'B. Day 19.' }]);
    expect(p.handovers.map((h) => h.id)).toEqual(['ph2']);
    expect(p.unfair).toEqual({ [BEA]: { kind: 'moved_goal', day: 19 } });
    expect(p.lastThreat).toBeUndefined();
    expect(p.verdictScene).toEqual({ [BEA]: 's2' });
    expect(p.asked).toBeUndefined();
    expect(s.personal!.bookings!.find((b) => b.id === 'bk1')!.status).toBe('cancelled');
    expect(s.personal!.bookings!.find((b) => b.id === 'bk2')!.status).toBe('booked'); // someone else's booking stays
    expect(ofType(events, 'task_void').map((e) => [e.taskId, e.what, e.reason])).toEqual([['pt1', 'task', 'gone'], ['pp1', 'punishment', 'gone'], ['pd1', 'demonstration', 'gone'], ['pt3', 'task', 'gone'], ['pp2', 'punishment', 'gone']]);
    expect(ofType(events, 'hold_released')).toEqual([{ type: 'hold_released', holderId: ANN, reason: 'gone' }]);
    expect(ofType(events, 'handover_ended')).toEqual([{ type: 'handover_ended', handoverId: 'ph1', holderId: ANN, reason: 'gone' }]);
    expect(s.relations).toEqual(relations); // no delta of any axis
    expect(s.rng).toEqual(rng);
    expect(holdsPractices(s, ANN)).toBe(false);
    expect(forgetPractices(s, ANN)).toEqual([]); // idempotent
  });

  it('leaves everyone else alone and does nothing for a campaign that never had practices', () => {
    const s = full();
    const before = structuredClone(s.practices!.tasks.filter((t) => t.holderId === BEA && t.targetUnitId === undefined));
    forgetPractices(s, ANN);
    expect(s.practices!.tasks.filter((t) => t.id === 'pt4')).toEqual(before);
    const bare = world(reg, 'play');
    const snapshot = structuredClone(bare);
    expect(holdsPractices(bare, ANN)).toBe(false);
    expect(forgetPractices(bare, ANN)).toEqual([]);
    expect(bare).toEqual(snapshot);
    expect(bare.practices).toBeUndefined(); // it never creates the block
  });

  it('removeFromService drops her practices and returns their events', () => {
    const s = full();
    s.personal!.bookings = []; // her held booking is taken by the personal layer first
    const events = removeFromService(s, ANN, 'terminated');
    expect(s.practices!.requests.map((r) => r.id)).toEqual(['pq2']);
    expect(s.practices!.held).toBeUndefined();
    expect(ofType(events, 'hold_released')).toHaveLength(1);
  });

  it('the day end sweeps the dead (idempotent after removal)', () => {
    const s = full();
    s.squad.find((u) => u.id === ANN)!.status = 'dead';
    const after = endDay(s, reg);
    expect(after.practices!.requests.map((r) => r.id)).toEqual(['pq2']);
    expect(after.practices!.tasks.some((t) => t.holderId === ANN)).toBe(false);
    expect(after.practices!.held).toBeUndefined();
    expect(holdsPractices(after, ANN)).toBe(false);
  });
});

describe('withdrawPractices', () => {
  it('switching restraint off ends the hold with no delta', () => {
    const s = full();
    const relations = structuredClone(s.relations);
    const events = withdrawPractices(s, reg, ['restraint']);
    expect(s.practices!.held).toBeUndefined();
    expect(ofType(events, 'hold_released')).toEqual([{ type: 'hold_released', holderId: ANN, reason: 'content' }]);
    expect(s.personal!.bookings!.find((b) => b.id === 'bk1')!.status).toBe('cancelled');
    expect(s.relations).toEqual(relations);
  });

  it('a task tagged with the category is void when it goes off, and one that is not stays', () => {
    const s = full();
    const p = s.practices!;
    p.tasks = [task('pt1', ANN, { tags: ['public_humiliation'] }), task('pt2', ANN, { tags: ['service'] }), task('pt3', ANN, { tags: ['public_humiliation'], status: 'kept' })];
    p.punishments = [punishment('pp1', ANN, 'on_the_record'), punishment('pp2', ANN, 'corner_time')];
    p.demonstrations = [demonstration('pd1', ANN, { tags: ['public_humiliation'] }), demonstration('pd2', ANN)];
    const events = withdrawPractices(s, reg, ['public_humiliation']);
    expect(p.tasks.map((t) => [t.id, t.status])).toEqual([['pt1', 'void'], ['pt2', 'open'], ['pt3', 'kept']]);
    expect(p.punishments.map((x) => [x.id, x.status])).toEqual([['pp1', 'void'], ['pp2', 'offered']]); // the punishment's own row carries the tag
    expect(p.demonstrations.map((x) => [x.id, x.status])).toEqual([['pd1', 'void'], ['pd2', 'offered']]);
    expect(ofType(events, 'task_void').map((e) => [e.taskId, e.what, e.reason])).toEqual([['pt1', 'task', 'content'], ['pp1', 'punishment', 'content'], ['pd1', 'demonstration', 'content']]);
    expect(p.held).toBeDefined(); // restraint is still on
  });

  it('a slap in progress goes when physical discipline goes off, and a request whose every seed was tagged goes', () => {
    const s = full();
    s.content = { enabled: ['restraint', 'denial'] }; // the state as setCategories leaves it: physical_discipline_shown was never on
    expect(withdrawPractices(s, reg, ['physical_discipline_shown'])).toEqual([]);
    expect(s.practices!.slap).toBeUndefined();
    const t = full();
    t.practices!.requests = [
      { id: 'pq1', holderId: ANN, kind: 'denial', day: 20, seedIds: ['denial_ask_before_touch', 'denial_earn_it_first'] },
      { id: 'pq2', holderId: ANN, kind: 'task', day: 20, seedIds: ['task_forms_of_address', 'denial_earn_it_first'] },
      { id: 'pq3', holderId: ANN, kind: 'task', day: 20, seedIds: [] },
    ];
    t.content = { enabled: ['restraint', 'public_humiliation'] };
    withdrawPractices(t, reg, ['denial']);
    expect(t.practices!.requests.map((r) => r.id)).toEqual(['pq2', 'pq3']);
  });

  it('through setCategories: the hold ends, a denial rule is suspended and her stale answer goes, with no relation delta', () => {
    const s = full();
    const rule: Rule = { id: 'r1', unitId: ANN, templateId: 'ask_permission', text: 'Ask me first.', status: 'active', day: 18, brokenCount: 0, delivered: true };
    s.bonds = { rules: [rule] };
    const relations = structuredClone(s.relations);
    const r = run(s, reg, { type: 'content/set_categories', payload: { enabled: ['public_humiliation'] } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'hold_released')).toEqual([{ type: 'hold_released', holderId: ANN, reason: 'content' }]);
    expect(r.state.practices!.held).toBeUndefined();
    expect(r.state.bonds!.rules[0].status).toBe('suspended'); // P9d's own sync
    expect(r.state.practices!.permission).toEqual({ holderId: ANN, ruleId: 'r1' }); // the rule comes back with the category; her old answer does not
    expect(r.state.relations).toEqual(relations);
    // setCategories directly does the same
    const t = full();
    setCategories(t, reg, ['public_humiliation']);
    expect(t.practices!.held).toBeUndefined();
  });

  it('a permission whose rule was only proposed goes with the category; a campaign without practices is untouched', () => {
    const s = full();
    s.bonds = { rules: [{ id: 'r1', unitId: ANN, templateId: 'ask_permission', text: 'x', status: 'proposed', day: 19, brokenCount: 0 }] };
    withdrawPractices(s, reg, ['denial']);
    expect(s.practices!.permission).toBeUndefined();
    const bare = world(reg, 'play');
    const snapshot = structuredClone(bare);
    expect(withdrawPractices(bare, reg, ['restraint', 'denial', 'public_humiliation'])).toEqual([]);
    expect(bare).toEqual(snapshot);
  });
});

describe('a punishment request whose entry can no longer be carried out (I1)', () => {
  const ctxOf = (d: CampaignState, r: Registries = reg) => ({ registries: r, rng: new Rng(d.rng) });
  const slapRequest = (s: CampaignState) => {
    s.content = { enabled: ['restraint', 'public_humiliation', 'denial', 'physical_discipline_shown'] };
    ensurePractices(s).requests.push({
      id: 'pq9', holderId: ANN, kind: 'punishment', day: 20, seedIds: [], severity: 4, entryId: 'the_slap', offence: { kind: 'task_broken', stakes: 'minor', day: 20 },
    });
    return s;
  };

  it('switching its category off picks another entry for the same offence (no delta, no event)', () => {
    const s = slapRequest(world(reg, 'play'));
    const relations = structuredClone(s.relations);
    const r = run(s, reg, { type: 'content/set_categories', payload: { enabled: ['restraint', 'public_humiliation', 'denial'] } });
    expect(errors(r.events)).toEqual([]);
    const request = r.state.practices!.requests.find((x) => x.id === 'pq9')!;
    expect(request.entryId).not.toBe('the_slap');
    expect(request.entryId).toBe('kept_the_day'); // the heaviest that stands
    expect(request.severity).toBe(4);
    expect(r.state.relations).toEqual(relations);
  });

  it('it is issued as the entry that stands, never as the one that went', () => {
    const s = slapRequest(world(reg, 'play'));
    s.content = { enabled: ['restraint', 'public_humiliation', 'denial'] }; // switched off without going through the hook
    const d = structuredClone(s);
    issuePractice(d, ctxOf(d), 'pq9', 'fallback');
    expect(d.practices!.punishments).toHaveLength(1);
    expect(d.practices!.punishments[0].entryId).toBe('kept_the_day');
    expect(d.practices!.punishments[0].severity).toBe(4);
  });

  it('when nothing stands the request is dropped and nothing is issued', () => {
    const s = slapRequest(world(reg, 'play'));
    const bare = { ...reg, holderPunishments: new Map() } as unknown as Registries;
    const d = structuredClone(s);
    expect(issuePractice(d, ctxOf(d, bare), 'pq9', 'fallback')).toEqual([]);
    expect(d.practices!.punishments).toEqual([]);
    expect(d.practices!.requests).toEqual([]);
  });
});
