import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { recordOf } from '../../../src/engine/discipline/record';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { rememberEvents } from '../../../src/engine/memory/remember';
import { applyPracticeIntent } from '../../../src/engine/practice/intents';
import { blankPractices, practiceRoll, type OpenPunishment } from '../../../src/engine/practice/state';
import { startHold } from '../../../src/engine/practice/hold';
import { startSlap } from '../../../src/engine/practice/slap';
import { practiceDirectives } from '../../../src/practice/directives';
import type { CampaignState } from '../../../src/engine/state/types';
import { errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, BEA, CAT, unitOf, withService, world } from './world';

// the hold (Task 25) and the slap (Task 33) are stubs: what is asked of them is what is tested
vi.mock('../../../src/engine/practice/hold', () => ({ startHold: vi.fn(() => []) }));
vi.mock('../../../src/engine/practice/slap', () => ({ startSlap: vi.fn(() => []) }));

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const pun = (entryId: string, severity: OpenPunishment['severity'], over: Partial<OpenPunishment> = {}): OpenPunishment => ({
  id: 'pp1', holderId: ANN, entryId, severity, offence: { kind: 'task_broken', ref: 'pt1', stakes: 'major', day: 20 }, text: 'Stand there.', summary: 'stand there', status: 'offered', day: 20, ...over,
});
const withPun = (frame: 'play' | 'role' | 'rule', entryId: string, severity: OpenPunishment['severity'], over: Partial<OpenPunishment> = {}, enable: string[] = []): CampaignState => {
  const s = withService(world(reg, frame));
  s.content = { enabled: [...(s.content?.enabled ?? []), ...enable] };
  s.practices = { ...blankPractices(), seq: 5, punishments: [pun(entryId, severity, over)] };
  dynamicOf(s, ANN)!.hold = { play: 30, role: 60, rule: 75 }[frame]; // inside the frame's band (a hold below the floor is lifted to it)
  return s;
};
const answer = (s: CampaignState, a: string, id = 'pp1', r: Registries = reg) => run(s, r, { type: 'practice/answer_punishment', payload: { punishmentId: id, answer: a } });
const px = (s: CampaignState, id = 'pp1') => s.practices!.punishments.find((p) => p.id === id)!;
const lastHistory = (s: CampaignState) => s.relations[ANN].history.filter((h) => h.kind === 'event').at(-1);

describe('accepting', () => {
  it('repairs, feeds hold and the discipline track: a severity-3 punishment lands at moderate (Trust +1, Affinity +2), hold +4, discipline xp 2 x 3', () => {
    const s = withPun('role', 'kept_in_quarters', 3);
    const rel = s.relations[ANN];
    const before = { trust: rel.trust, affinity: rel.affinity, hold: dynamicOf(s, ANN)!.hold };
    const r = answer(s, 'accept');
    expect(errors(r.events)).toEqual([]);
    expect(px(r.state)).toMatchObject({ status: 'accepted', answeredDay: 20 });
    expect(lastHistory(r.state)).toMatchObject({ type: 'punishment_accepted', severity: 'moderate' });
    expect(r.state.relations[ANN].trust).toBe(before.trust + 1);
    expect(r.state.relations[ANN].affinity).toBe(before.affinity + 2);
    expect(dynamicOf(r.state, ANN)!.hold).toBe(before.hold + 4);
    expect(dynamicOf(r.state, ANN)!.tracks.discipline).toMatchObject({ xp: 6 });
    expect(ofType(r.events, 'punishment_answered')).toMatchObject([{ punishmentId: 'pp1', unitId: ANN, answer: 'accept', severity: 3 }]);
    expect(ofType(r.events, 'punishment_answered')[0]).not.toHaveProperty('public');
  });

  it('a punishment that is gone, answered, a soldier\'s or hers while she is not holding throws; no rng is drawn', () => {
    const s = withPun('role', 'corner_time', 1);
    expect(errors(answer(s, 'accept', 'pp9').events)).toHaveLength(1);
    const done = answer(s, 'accept');
    expect(errors(answer(done.state, 'accept').events)).toHaveLength(1); // answered
    const soldier = withPun('role', 'corner_time', 1, { forUnitId: BEA });
    expect(errors(answer(soldier, 'accept').events)).toHaveLength(1);
    const frozen = withPun('equal' as never, 'corner_time', 1);
    expect(errors(answer(frozen, 'accept').events)).toHaveLength(1);
    expect(done.state.rng).toEqual(s.rng);
  });
});

describe('the effects', () => {
  it('slot_held asks for a hold of its span (a stub until the hold is built)', () => {
    vi.mocked(startHold).mockClear();
    answer(withPun('role', 'kept_in_quarters', 3, {}, ['restraint']), 'accept');
    expect(startHold).toHaveBeenCalledTimes(1);
    expect(vi.mocked(startHold).mock.calls[0].slice(2)).toEqual([ANN, 2, { punitive: true, punishmentId: 'pp1' }]);
  });

  it('privilege_revoked writes a restriction until day + days; protocol_extra asks for nothing yet; cold_shoulder writes cold', () => {
    const rev = answer(withPun('role', 'no_messages', 2), 'accept').state;
    expect(rev.practices!.restrictions).toEqual([{ holderId: ANN, what: 'no_dms_others', untilDay: 21 }]);
    // until a protocol can be written (Task 21) the effect asks for nothing: a request nobody can issue would only cost a failed model call and block her new practices
    const proto = answer(withPun('role', 'extra_protocol', 1), 'accept');
    expect(proto.state.practices!.requests.filter((q) => q.kind === 'protocol')).toEqual([]);
    expect(ofType(proto.events, 'practice_requested')).toEqual([]);
    expect(errors(proto.events)).toEqual([]);
    const cold = answer(withPun('role', 'cold_shoulder', 2), 'accept').state;
    expect(cold.practices!.cold[ANN]).toBe(21);
  });

  it('a revoked room is the location the row names, wherever the answer was given (P3: no fallback to the commander\'s own quarters)', () => {
    const row = { id: 'barred_hall', label: 'The hall is closed', severity: 2, effects: [{ type: 'privilege_revoked', what: 'room', days: 2, arg: 'mess_hall' }], description: 'x' };
    const wide = { ...reg, holderPunishments: new Map([...reg.holderPunishments, ['barred_hall', row]]) } as unknown as Registries;
    const s = withPun('role', 'barred_hall', 2);
    s.scene = { id: 's1', day: 20, slot: s.slot, locationId: 'quarters_commander', participants: [ANN], mode: 'private', origin: 'event', consumesSlot: false, startIndex: 0, readIndex: 0, exchanges: 0 } as never;
    const r = answer(s, 'accept', 'pp1', wide);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.practices!.restrictions).toEqual([{ holderId: ANN, what: 'room', arg: 'mess_hall', untilDay: 22 }]);
    // a row that somehow has no location bars nothing
    const bad = { ...row, effects: [{ type: 'privilege_revoked', what: 'room', days: 2 }] };
    const none = answer(withPun('role', 'barred_hall', 2), 'accept', 'pp1', { ...reg, holderPunishments: new Map([...reg.holderPunishments, ['barred_hall', bad]]) } as unknown as Registries);
    expect(none.state.practices!.restrictions).toEqual([]);
  });

  it('confession writes a model task that names the first soldier at base; mark sets the mark only when none is set; stress moves the commander', () => {
    const conf = answer(withPun('role', 'on_the_record', 3, {}, ['public_humiliation']), 'accept');
    const task = conf.state.practices!.tasks.at(-1)!;
    expect(task).toMatchObject({ holderId: ANN, kind: 'task', check: 'model', targetUnitId: BEA, status: 'open', tags: ['public_humiliation'], stakes: 'major', plain: true });
    expect(task.summary).toContain(unitOf(conf.state, BEA).displayName);
    expect(ofType(conf.events, 'task_issued')).toMatchObject([{ taskId: task.id, confession: true }]);
    const marked = answer(withPun('role', 'a_marked_week', 5, {}, ['body_modification']), 'accept');
    expect(marked.state.personal!.mark).toEqual({ unitId: ANN, untilDay: 27 });
    expect(ofType(marked.events, 'mark_set')).toHaveLength(1);
    expect(marked.state.commander.stress).toBe(10);
    const already = withPun('role', 'a_marked_week', 5, {}, ['body_modification']);
    already.personal = { seq: 0, mark: { unitId: BEA, untilDay: 30 } };
    const second = answer(already, 'accept');
    expect(second.state.personal!.mark).toEqual({ unitId: BEA, untilDay: 30 });
    expect(ofType(second.events, 'mark_set')).toEqual([]);
    expect(answer(withPun('role', 'kept_the_day', 4, {}, ['restraint']), 'accept').events.filter((e) => e.type === 'commander_stress_changed')).toMatchObject([{ delta: 5, source: 'holder_punishment' }]);
  });

  it('injury_chance injures exactly when the roll is below chance - perEndurance x endurance - perTrained x trained: both routes lower it', () => {
    const s0 = withPun('role', 't_injury', 3);
    const roll = practiceRoll(s0, ANN, 'injury:pp1');
    const make = (chance: number): Registries => ({
      ...reg, holderPunishments: new Map([...reg.holderPunishments, ['t_injury', { id: 't_injury', label: 'Test', severity: 3, description: 'x', effects: [{ type: 'injury_chance', chance, perEndurance: 0.01, perTrained: 0.1, days: 2 }] }]]),
    } as unknown as Registries);
    const injured = (s: CampaignState, r: Registries) => ofType(answer(s, 'accept', 'pp1', r).events, 'commander_injured').length;
    const regHit = make(roll + 0.05); // just above the roll: injures
    expect(injured(structuredClone(s0), regHit)).toBe(1);
    const enduring = structuredClone(s0);
    enduring.commander.body = { ...(enduring.commander.body ?? {}), endurance: 10 } as never; // -0.1: below the roll now
    expect(injured(enduring, regHit)).toBe(0);
    const trained = structuredClone(s0);
    trained.commander.endurance = { weight: { xp: 40, level: 1 } } as never; // -0.1: below the roll now
    expect(injured(trained, regHit)).toBe(0);
    expect(injured(structuredClone(s0), make(roll - 0.01))).toBe(0); // the roll is not below the chance
    expect(injured(structuredClone(s0), make(roll))).toBe(0); // strictly below
    const hurt = answer(structuredClone(s0), 'accept', 'pp1', regHit).state;
    expect(hurt.commander.injuredUntilDay).toBe(22);
  });

  it('physical is narrated and slap asks for a slap (a stub until it is built)', () => {
    const phys = answer(withPun('role', 'her_hand', 5, {}, ['physical_discipline_shown', 'pain_rough']), 'accept');
    expect(ofType(phys.events, 'punishment_carried_out')).toMatchObject([{ punishmentId: 'pp1', physical: true }]);
    vi.mocked(startSlap).mockClear();
    answer(withPun('role', 'the_slap', 4, {}, ['physical_discipline_shown']), 'accept');
    expect(startSlap).toHaveBeenCalledTimes(1);
    expect(vi.mocked(startSlap).mock.calls[0].slice(2)).toEqual([ANN, { punishmentId: 'pp1' }]);
  });
});

describe('negotiating', () => {
  it('a compromise lowers the severity by one, picks again and brings the card back offered', () => {
    const s = withPun('role', 'kept_in_quarters', 3, {}, ['restraint']);
    const talk = answer(s, 'negotiate');
    expect(px(talk.state).status).toBe('negotiating');
    expect(ofType(talk.events, 'punishment_answered')).toMatchObject([{ answer: 'negotiate' }]);
    const d = structuredClone(talk.state);
    const ev = { type: 'compromise_reached', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'x', confidence: 1, punishmentId: 'pp1', text: 'Ten minutes in the corner.' } as never;
    const events = applyPracticeIntent(d, { registries: reg }, ANN, ev);
    expect(px(d)).toMatchObject({ status: 'offered', severity: 2, text: 'Ten minutes in the corner.', summary: 'Ten minutes in the corner.' });
    expect(reg.holderPunishments.get(px(d).entryId)!.severity).toBe(2);
    expect(px(d).plain).toBeUndefined();
    expect(ofType(events, 'punishment_answered')).toMatchObject([{ answer: 'compromise', severity: 2 }]);
    // a pronoun for the commander is not taken: the entry's own words
    const e = structuredClone(talk.state);
    applyPracticeIntent(e, { registries: reg }, ANN, { ...(ev as object), text: 'He will stand there.' } as never);
    expect(px(e).plain).toBe(true);
    expect(px(e).summary).toBe(String(reg.holderPunishments.get(px(e).entryId)!.label));
    // one that is not open, or another woman's, changes nothing
    const done = answer(s, 'accept').state;
    expect(applyPracticeIntent(structuredClone(done), { registries: reg }, ANN, ev)).toEqual([]);
    expect(applyPracticeIntent(structuredClone(s), { registries: reg }, BEA, ev)).toEqual([]);
  });
});

describe('refusing', () => {
  it('costs hold by her frame, her record +5 and one escalation at severity + 1; refusing the escalated one ends it', () => {
    const s = withPun('role', 'kept_in_quarters', 3, {}, ['restraint']);
    const holdBefore = dynamicOf(s, ANN)!.hold;
    const r = answer(s, 'refuse');
    expect(errors(r.events)).toEqual([]);
    expect(px(r.state).status).toBe('refused');
    expect(dynamicOf(r.state, ANN)!.hold).toBeLessThan(holdBefore);
    expect(dynamicOf(r.state, ANN)!.refusals).toEqual([20]);
    expect(recordOf(r.state, ANN)).toBe(recordOf(s, ANN) + 5);
    const asked = r.state.practices!.requests.filter((q) => q.kind === 'punishment');
    expect(asked).toMatchObject([{ holderId: ANN, escalated: true, severity: 4 }]);
    expect(reg.holderPunishments.get(asked[0].entryId!)!.severity).toBe(4);
    // the refusal is not also entered as a new offence beside the escalation
    expect(r.state.practices!.offences[ANN]).toBeUndefined();
    // the escalated one, refused, ends there
    const esc = structuredClone(r.state);
    esc.practices!.requests = [];
    esc.practices!.punishments.push(pun('kept_the_day', 4, { id: 'pp2', escalated: true }));
    const ended = answer(esc, 'refuse', 'pp2');
    expect(ended.state.practices!.requests).toEqual([]);
    expect(px(ended.state, 'pp2').status).toBe('refused');
  });

  it('at rule the refusal counts into the contest of authority', () => {
    const s = withPun('rule', 'kept_in_quarters', 3, {}, ['restraint']);
    const r = answer(s, 'refuse');
    expect(dynamicOf(r.state, ANN)!.contest).toEqual([20]);
  });

  it('an affectionate holder never escalates', () => {
    const s = withPun('role', 'kept_in_quarters', 3, {}, ['restraint']);
    unitOf(s, ANN).bond!.practice!.style = { primary: 'affectionate' };
    const r = answer(s, 'refuse');
    expect(r.state.practices!.requests).toEqual([]);
  });
});

describe('public execution', () => {
  const record = (s: CampaignState, events: Array<Record<string, unknown>>) => { rememberEvents(s, events as never, reg); return s.memory.facts; };

  it('is gated: public_humiliation off or a private_only audience makes it private; on, the audience is named, each is shown it (demonstration) and the memory rule writes the fact', () => {
    const off = withPun('role', 'on_the_record', 3, { public: true });
    off.content = { enabled: ['restraint', 'denial'] }; // she still practises, but nothing public is on
    expect(ofType(answer(off, 'accept').events, 'punishment_answered')[0]).not.toHaveProperty('public');
    const closed = withPun('role', 'on_the_record', 3, { public: true });
    unitOf(closed, ANN).bond!.practice!.audience = 'private_only';
    expect(ofType(answer(closed, 'accept').events, 'punishment_answered')[0]).not.toHaveProperty('public');
    expect(px(answer(closed, 'accept').state).audienceIds).toBeUndefined();

    const on = withPun('role', 'on_the_record', 3, { public: true });
    on.scene = { id: 's1', day: 20, slot: on.slot, locationId: 'mess_hall', participants: [ANN, BEA, CAT], mode: 'group', origin: 'event', consumesSlot: false, startIndex: 0, readIndex: 0, exchanges: 0 } as never;
    const r = answer(on, 'accept');
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'punishment_answered')).toMatchObject([{ public: true, present: [ANN, BEA, CAT] }]);
    expect(px(r.state).audienceIds).toEqual([BEA, CAT]);
    expect(Object.keys(r.state.dynamic!.knowledge[BEA] ?? {})).toContain(ANN);
    expect(Object.keys(r.state.dynamic!.knowledge[CAT] ?? {})).toContain(ANN);
    const facts = record(structuredClone(r.state), r.events as never);
    expect(facts.filter((f) => f.tags.includes('punishment_public'))).toHaveLength(1);
    expect(facts.filter((f) => f.tags.includes('punishment_given'))).toEqual([]); // one fact for a public one: the audience's covers the pair too (M8)
    const plain = answer(withPun('role', 'kept_in_quarters', 3, {}, ['restraint']), 'accept');
    const quiet = record(structuredClone(plain.state), plain.events as never);
    expect(quiet.filter((f) => f.tags.includes('punishment_given'))).toHaveLength(1);
    expect(quiet.filter((f) => f.tags.includes('punishment_public'))).toEqual([]);
  });

  it('the audience is the other units of the open scene, at most two: nobody who is merely at base (I4)', () => {
    const s = withPun('role', 'on_the_record', 3, { public: true });
    s.scene = { id: 's1', day: 20, slot: s.slot, locationId: 'quarters_commander', participants: [ANN, CAT], mode: 'group', origin: 'event', consumesSlot: false, startIndex: 0, readIndex: 0, exchanges: 0 } as never;
    const r = answer(s, 'accept');
    expect(px(r.state).audienceIds).toEqual([CAT]);
    expect(ofType(r.events, 'punishment_answered')).toMatchObject([{ public: true, present: [ANN, CAT] }]);
    expect(Object.keys(r.state.dynamic!.knowledge[BEA] ?? {})).not.toContain(ANN); // Bea was not there and saw nothing
    expect(record(structuredClone(r.state), r.events as never).filter((f) => f.tags.includes('punishment_public'))[0].knownBy).not.toContain(BEA);
  });

  it('in a DM, or with no scene, nobody sees it: the punishment is private, whatever the entry says', () => {
    const s = withPun('role', 'on_the_record', 3, { public: true });
    expect(s.scene).toBeUndefined();
    const r = answer(s, 'accept');
    expect(px(r.state).audienceIds).toBeUndefined();
    expect(ofType(r.events, 'punishment_answered')[0]).not.toHaveProperty('public');
    expect(Object.keys(r.state.dynamic?.knowledge[BEA] ?? {})).not.toContain(ANN);
    expect(record(structuredClone(r.state), r.events as never).filter((f) => f.tags.includes('punishment_public'))).toEqual([]);
    // a scene with her alone is no audience either
    const alone = withPun('role', 'on_the_record', 3, { public: true });
    alone.scene = { id: 's1', day: 20, slot: alone.slot, locationId: 'quarters_commander', participants: [ANN], mode: 'private', origin: 'event', consumesSlot: false, startIndex: 0, readIndex: 0, exchanges: 0 } as never;
    expect(px(answer(alone, 'accept').state).audienceIds).toBeUndefined();
  });
});

describe('shown or reported', () => {
  const accepted = (shown: boolean): CampaignState => {
    const s = withPun('role', 'her_hand', 5, { status: 'accepted', answeredDay: 20 }, shown ? ['physical_discipline_shown', 'pain_rough'] : []);
    s.scene = { id: 's1', day: 20, slot: s.slot, locationId: 'quarters_commander', participants: [ANN], mode: 'private', origin: 'event', consumesSlot: false, startIndex: 0, readIndex: 0, exchanges: 0 } as never;
    return s;
  };
  it('with physical_discipline_shown off the directive says it is reported, not shown', () => {
    const line = practiceDirectives(accepted(false), reg, [ANN]).find((d) => d.id === 'practice:punishment:unit_ann')!.text;
    expect(line).toContain('only reported');
    expect(line).not.toContain('shown as it happens');
    const on = practiceDirectives(accepted(true), reg, [ANN]).find((d) => d.id === 'practice:punishment:unit_ann')!.text;
    expect(on).toContain('shown as it happens');
    expect(on).not.toMatch(/\d|AUTHOR TO WRITE/);
  });
});

describe('the inverse does not outlive the day (M3)', () => {
  it('closing an accepted punishment, and a refused one of an earlier day, drops the stored inverse', async () => {
    const { practiceDayStep } = await import('../../../src/engine/practice/dayStep');
    const { Rng } = await import('../../../src/engine/rng');
    const s = withPun('role', 'no_messages', 2);
    const done = answer(s, 'accept').state;
    expect(done.practices!.punishments[0].inverse).toBeDefined();
    const kept = structuredClone(done);
    practiceDayStep(kept, { registries: reg, rng: new Rng(kept.rng) }); // the same day: still undoable
    expect(kept.practices!.punishments[0].inverse).toBeDefined();
    const next = structuredClone(done);
    next.day += 1;
    practiceDayStep(next, { registries: reg, rng: new Rng(next.rng) });
    expect(next.practices!.punishments[0]).toMatchObject({ status: 'done' });
    expect(next.practices!.punishments[0].inverse).toBeUndefined();
    const refused = answer(withPun('role', 'no_messages', 2), 'refuse').state;
    refused.day += 1;
    practiceDayStep(refused, { registries: reg, rng: new Rng(refused.rng) });
    expect(refused.practices!.punishments.find((p) => p.id === 'pp1')!.inverse).toBeUndefined();
  });
});

describe('the day step', () => {
  it('closes an accepted punishment the day after and raises her Want each day of her cold shoulder', async () => {
    const { practiceDayStep } = await import('../../../src/engine/practice/dayStep');
    const { Rng } = await import('../../../src/engine/rng');
    const s = withPun('role', 'cold_shoulder', 2);
    s.relations[ANN].stateId = 'lover';
    unitOf(s, ANN).bond!.desire = 'medium';
    s.relations[ANN].want = 10;
    const a = answer(s, 'accept').state;
    const d = structuredClone(a);
    const events = practiceDayStep(d, { registries: reg, rng: new Rng(d.rng) });
    expect(d.relations[ANN].want).toBe(15);
    expect(ofType(events, 'want_changed')).toHaveLength(1);
    expect(px(d).status).toBe('accepted'); // still its day
    d.day = 21;
    practiceDayStep(d, { registries: reg, rng: new Rng(d.rng) });
    expect(px(d).status).toBe('done');
    expect(d.practices!.cold[ANN]).toBe(21);
  });
});
