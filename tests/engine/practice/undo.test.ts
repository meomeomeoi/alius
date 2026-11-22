import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/discipline';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { recordOf } from '../../../src/engine/discipline/record';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { canUndoPractice } from '../../../src/engine/practice/punish';
import { blankPractices, type OpenPunishment } from '../../../src/engine/practice/state';
import type { CampaignState } from '../../../src/engine/state/types';
import { errors, loadCore, ofType, run, stubExpedition } from '../../helpers/world';
import { ANN, withService, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const pun = (entryId: string, severity: OpenPunishment['severity'], over: Partial<OpenPunishment> = {}): OpenPunishment => ({
  id: 'pp1', holderId: ANN, entryId, severity, offence: { kind: 'task_broken', ref: 'pt1', stakes: 'major', day: 20 }, text: 'Stand there.', summary: 'stand there', status: 'offered', day: 20, ...over,
});
const base = (entryId: string, severity: OpenPunishment['severity'], frame: 'role' | 'rule' = 'role', enable: string[] = []): CampaignState => {
  const s = withService(world(reg, frame));
  s.content = { enabled: [...(s.content?.enabled ?? []), ...enable] };
  s.practices = { ...blankPractices(), seq: 5, punishments: [pun(entryId, severity)] };
  dynamicOf(s, ANN)!.hold = frame === 'rule' ? 90 : 45; // inside the band, with no milestone due (the answer's own hold gain must not offer one: that would refuse the undo)
  dynamicOf(s, ANN)!.favour = 3;
  dynamicOf(s, ANN)!.lastPracticeDay = 5; // the answer's hold gain moves it (a gain is practice): UNDO puts it back
  return s;
};
const answer = (s: CampaignState, a: string) => run(s, reg, { type: 'practice/answer_punishment', payload: { punishmentId: 'pp1', answer: a } });
const undo = (s: CampaignState) => run(s, reg, { type: 'practice/undo', payload: { punishmentId: 'pp1' } });
const px = (s: CampaignState) => s.practices!.punishments.find((p) => p.id === 'pp1')!;

/** What UNDO must put back: her axes, hold, favour, tracks, status, and what the answer wrote on the practices and the commander. */
const picture = (s: CampaignState) => {
  const r = s.relations[ANN];
  const d = dynamicOf(s, ANN)!;
  return {
    trust: r.trust, affinity: r.affinity, attraction: r.attraction, hold: d.hold, favour: d.favour, domains: d.domains, lastPracticeDay: d.lastPracticeDay, tracks: d.tracks, refusals: d.refusals, contest: d.contest, record: recordOf(s, ANN),
    status: px(s).status, restrictions: s.practices!.restrictions, cold: s.practices!.cold, tasks: s.practices!.tasks.map((t) => t.id), requests: s.practices!.requests.map((q) => q.id),
    mark: s.personal?.mark, stress: s.commander.stress ?? 0, history: r.history.length,
  };
};

describe('undoing an accept', () => {
  for (const [entry, severity, enable] of [['no_messages', 2, []], ['cold_shoulder', 2, []], ['on_the_record', 3, ['public_humiliation']], ['a_marked_week', 5, ['body_modification']], ['extra_protocol', 1, []], ['kept_the_day', 4, ['restraint']]] as const) {
    it(`restores axes, hold, favour, tracks, status and what ${entry} wrote: before = after`, () => {
      const s = base(entry, severity, 'role', [...enable]);
      const before = picture(s);
      const done = answer(s, 'accept');
      expect(errors(done.events)).toEqual([]);
      expect(picture(done.state)).not.toEqual(before);
      expect(canUndoPractice(done.state, 'pp1')).toBeNull();
      const r = undo(done.state);
      expect(errors(r.events)).toEqual([]);
      expect(picture(r.state)).toEqual(before);
      expect(px(r.state).inverse).toBeUndefined();
      expect(px(r.state).answeredDay).toBeUndefined();
      expect(ofType(r.events, 'practice_undone')).toMatchObject([{ punishmentId: 'pp1', unitId: ANN }]);
      expect(ofType(r.events, 'hold_changed')).toMatchObject([{ unitId: ANN, cause: 'undo' }]);
      // her reading of the answer stays (she saw it): answering again is allowed, the numbers follow from where she stands now
      expect(errors(answer(r.state, 'accept').events)).toEqual([]);
    });
  }

  it('only what the answer did: a later change of hers stays', () => {
    const done = answer(base('no_messages', 2), 'accept').state;
    done.relations[ANN].trust += 3; // later
    const trustAfter = done.relations[ANN].trust;
    const r = undo(done);
    expect(r.state.relations[ANN].trust).toBe(trustAfter - 1); // only the repair's own +1 goes
  });
});

describe('undoing a refuse', () => {
  it('puts the hold, the refusal and the record back and removes the escalation request', () => {
    const s = base('kept_in_quarters', 3, 'role', ['restraint']);
    const before = picture(s);
    const done = answer(s, 'refuse');
    expect(done.state.practices!.requests.filter((q) => q.escalated === true)).toHaveLength(1);
    expect(canUndoPractice(done.state, 'pp1')).toBeNull();
    const r = undo(done.state);
    expect(errors(r.events)).toEqual([]);
    expect(picture(r.state)).toEqual(before);
    expect(r.state.practices!.requests).toEqual([]);
  });

  it('an escalation already worded and still unanswered goes with it; one the commander answered stops the undo', () => {
    const done = answer(base('kept_in_quarters', 3, 'role', ['restraint']), 'refuse');
    const reqId = done.state.practices!.requests[0].id;
    const issued = run(done.state, reg, { type: 'practice/issue', payload: { requestId: reqId } });
    expect(errors(issued.events)).toEqual([]);
    expect(issued.state.practices!.punishments).toHaveLength(2);
    const r = undo(issued.state);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.practices!.punishments).toHaveLength(1);
    expect(ofType(r.events, 'task_void')).toMatchObject([{ what: 'punishment', reason: 'undone' }]);
    const answered = structuredClone(issued.state);
    answered.practices!.punishments[1].status = 'accepted';
    expect(canUndoPractice(answered, 'pp1')).toMatch(/already been answered/);
  });
});

describe('what is band-dependent goes back too (I6)', () => {
  it('a refusal that cost her a domain: the domain is restored by the undo', () => {
    const s = base('kept_in_quarters', 3, 'role', ['restraint']);
    dynamicOf(s, ANN)!.frame = 'play'; // her floor is low enough for a refusal to cross the band
    dynamicOf(s, ANN)!.hold = 40.5; // just inside the band private_time needs
    dynamicOf(s, ANN)!.domains = [{ id: 'private_time', since: 3 }] as never;
    const before = picture(s);
    const done = answer(s, 'refuse');
    expect(errors(done.events)).toEqual([]);
    expect(ofType(done.events, 'domain_lost')).toHaveLength(1);
    expect(dynamicOf(done.state, ANN)!.domains).toEqual([]);
    expect(canUndoPractice(done.state, 'pp1')).toBeNull();
    const r = undo(done.state);
    expect(errors(r.events)).toEqual([]);
    expect(dynamicOf(r.state, ANN)!.domains).toEqual([{ id: 'private_time', since: 3 }]);
    expect(picture(r.state)).toEqual(before);
  });

  it('the day she last practised is put back (an accept\'s hold gain moved it)', () => {
    const s = base('no_messages', 2);
    const done = answer(s, 'accept').state;
    expect(dynamicOf(done, ANN)!.lastPracticeDay).toBe(done.day);
    expect(dynamicOf(undo(done).state, ANN)!.lastPracticeDay).toBe(5);
  });

  it('the undo record has room for a hold or a slap the answer started (filled by the tasks that start them)', () => {
    const done = answer(base('no_messages', 2), 'accept').state;
    const undoRow = px(done).inverse!.practice!;
    expect(undoRow.startedHold).toBeUndefined();
    expect(undoRow.slapId).toBeUndefined();
    const widened: typeof undoRow = { ...undoRow, startedHold: true, slapId: 'ps1' };
    expect(widened.startedHold).toBe(true);
  });
});

describe('only the rows the answer wrote are taken out (M2)', () => {
  it('a restriction another holder set since stays when the answer is undone', () => {
    const done = answer(base('no_messages', 2), 'accept').state;
    expect(done.practices!.restrictions).toHaveLength(1);
    done.practices!.restrictions.unshift({ holderId: 'unit_bea', what: 'no_free_activities', untilDay: done.day + 1 });
    done.practices!.restrictions.push({ holderId: 'unit_cat', what: 'no_dms_others', untilDay: done.day + 1 });
    const r = undo(done);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.practices!.restrictions.map((x) => x.holderId)).toEqual(['unit_bea', 'unit_cat']);
  });
});

describe('what refuses an undo', () => {
  const accepted = (): CampaignState => answer(base('no_messages', 2), 'accept').state;
  const why = (s: CampaignState) => canUndoPractice(s, 'pp1');

  it('a frame that changed', () => {
    const s = accepted();
    dynamicOf(s, ANN)!.frame = 'rule';
    expect(why(s)).toMatch(/frame has changed/);
    expect(errors(undo(s).events)).toHaveLength(1);
    expect(undo(s).state).toBe(s);
  });

  it('a milestone that was offered', () => {
    const s = accepted();
    s.dynamic!.open.milestones.push({ id: 'dm9', unitId: ANN, milestoneId: 'x', day: s.day, form: 'scene' } as never);
    expect(why(s)).toMatch(/milestone/);
  });

  it('an injury or a run that followed', () => {
    const hurt = accepted();
    hurt.commander.injuredUntilDay = hurt.day + 2;
    expect(why(hurt)).toMatch(/hurt/);
    const run1 = accepted();
    run1.expedition = stubExpedition(run1, { party: [ANN] });
    expect(why(run1)).toMatch(/run/);
    const back = accepted();
    back.lastExpedition = { id: 'x1' } as never;
    expect(why(back)).toMatch(/run/);
  });

  it('a slot that was spent', () => {
    const s = accepted();
    s.slot = s.slot === 'morning' ? 'afternoon' : 'morning';
    expect(why(s)).toMatch(/slot has passed/);
  });

  it('the next day, and a scene that closed', () => {
    const next = accepted();
    next.day += 1;
    expect(why(next)).toMatch(/only be undone on the day/);
    const inScene = base('no_messages', 2);
    inScene.scene = { id: 's1', day: inScene.day, slot: inScene.slot, locationId: 'quarters_commander', participants: [ANN], mode: 'private', origin: 'event', consumesSlot: false, startIndex: 0, readIndex: 0, exchanges: 0 } as never;
    const done = answer(inScene, 'accept').state;
    expect(why(done)).toBeNull();
    delete done.scene;
    expect(why(done)).toMatch(/scene has ended/);
  });

  it('what is not answered, was seen by others, or is a soldier\'s', () => {
    expect(why(base('no_messages', 2))).toMatch(/nothing to undo/i);
    const seen = answer(base('on_the_record', 3, 'role', ['public_humiliation']), 'accept').state;
    px(seen).audienceIds = ['unit_bea'];
    expect(why(seen)).toMatch(/saw it/);
    const negotiating = answer(base('no_messages', 2), 'negotiate').state;
    expect(why(negotiating)).toMatch(/nothing to undo/i);
  });

  it('an answer that itself offers a milestone (its hold gain makes one due) cannot be undone', () => {
    const s = base('no_messages', 2);
    dynamicOf(s, ANN)!.hold = 60; // the +4 of the repair opens the vow
    const done = answer(s, 'accept').state;
    expect(why(done)).toMatch(/milestone/);
  });

  it('the undo of an answer is not an undo of P9\'s application (that is unchanged: its own file)', () => {
    const s = accepted();
    expect(errors(run(s, reg, { type: 'discipline/undo', payload: { id: 'ap1' } }).events)).toHaveLength(1);
  });
});
