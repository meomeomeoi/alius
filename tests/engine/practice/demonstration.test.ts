import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { compromatOf } from '../../../src/engine/dynamic/compromat';
import { levelOf } from '../../../src/engine/dynamic/knowledge';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { dynamicTerm } from '../../../src/engine/dynamic/witness';
import { whereaboutAt } from '../../../src/engine/hub';
import { rememberEvents } from '../../../src/engine/memory/remember';
import { answerDemonstration, demonstrationGate, demonstrationsFromEvents, pickAudience } from '../../../src/engine/practice/demonstration';
import { ensurePractices } from '../../../src/engine/practice/gate';
import { settleTask } from '../../../src/engine/practice/checks';
import { kindsToday, practiceDayStep } from '../../../src/engine/practice/dayStep';
import { practiceRoll, type OpenDemonstration, type Task, type ValidOutput } from '../../../src/engine/practice/state';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { practiceDirectives } from '../../../src/practice/directives';
import { errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, BEA, CAT, unitOf, withBea, withService, withWant, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ctxOf = (d: CampaignState) => ({ registries: reg, rng: new Rng(d.rng) });
const CATEGORIES = ['restraint', 'public_humiliation', 'denial', 'service'];

/** Ann stages for `audience`; Bea is close to the commander, Cat leads the squad (so both are on the select_few list); the afternoon, when the mess hall is open. */
function staging(audience: 'select_few' | 'show_off' | 'indifferent' | 'private_only' = 'select_few', frame: 'play' | 'role' = 'play'): CampaignState {
  const s = withService(world(reg, frame));
  unitOf(s, ANN).bond!.practice!.audience = audience;
  s.slot = 'afternoon';
  s.relations[BEA].trust = 60;
  s.relations[CAT].trust = 5;
  s.relations[CAT].affinity = 5;
  s.power = { votes: { log: [], seq: 0 }, hierarchy: { standings: {}, endorsed: false, computedDay: s.day, leaderId: CAT } } as never;
  return s;
}

/** An onlooker's stance toward whatever Ann leads in (every practice category she has). */
function witness(s: CampaignState, id: string, w: 'drawn' | 'indifferent' | 'dislikes'): void {
  const u = unitOf(s, id);
  const bond = { ...(u.bond ?? { leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known' }) } as NonNullable<typeof u.bond>;
  // a playful manner reads like a witness (a ritual or cold holder would respect another's claim instead, a possessive or cruel one compete)
  bond.practice = {
    categories: Object.fromEntries(CATEGORIES.map((c) => [c, { as: 'enjoys', witness: w }])), style: { primary: 'playful' }, audience: 'private_only', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate',
  } as never;
  u.bond = bond;
}

const card = (over: Partial<ValidOutput> = {}): ValidOutput => ({
  kind: 'demonstration', seedId: 'demo_mess_table', tags: ['service'], track: 'service', tier: 1, stakes: 'minor', check: 'model', proof: 'none', audienceIds: [BEA], text: 'Serve me at the table.', summary: 'service at the mess table', ...over,
});

/** The card as the real path writes it: a request for it, then `practice/issue`. */
function offered(s: CampaignState, out: ValidOutput = card()): CampaignState {
  ensurePractices(s).requests.push({ id: 'pq1', holderId: ANN, kind: 'demonstration', day: s.day, seedIds: [out.seedId ?? 'demo_mess_table'] });
  const r = run(s, reg, { type: 'practice/issue', payload: { requestId: 'pq1', output: out } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const demo = (s: CampaignState): OpenDemonstration => s.practices!.demonstrations[0];

describe('the gate reads her profile', () => {
  it('private_only and indifferent stage nothing', () => {
    expect(demonstrationGate(staging('private_only'), reg, ANN)).not.toBeNull();
    expect(demonstrationGate(staging('indifferent'), reg, ANN)).not.toBeNull();
    expect(demonstrationGate(staging('select_few'), reg, ANN)).toBeNull();
    expect(demonstrationGate(staging('show_off'), reg, ANN)).toBeNull();
  });

  it('a tier above 2 needs role; below that play is enough', () => {
    const play = staging('select_few', 'play');
    expect(demonstrationGate(play, reg, ANN, { tags: ['service'], tier: 3 })).not.toBeNull();
    expect(demonstrationGate(play, reg, ANN, { tags: ['service'], tier: 2 })).toBeNull();
    expect(demonstrationGate(staging('select_few', 'role'), reg, ANN, { tags: ['service'], tier: 3 })).toBeNull();
  });

  it('a humbling form needs public_humiliation; one of service alone needs service', () => {
    const s = staging();
    expect(demonstrationGate(s, reg, ANN, { tags: ['public_humiliation'], tier: 1 })).toBeNull();
    s.content = { enabled: ['restraint', 'service'] };
    expect(demonstrationGate(s, reg, ANN, { tags: ['public_humiliation'], tier: 1 })).not.toBeNull();
    expect(demonstrationGate(s, reg, ANN, { tags: ['service'], tier: 1 })).toBeNull();
    s.content = { enabled: ['restraint', 'public_humiliation'] };
    expect(demonstrationGate(s, reg, ANN, { tags: ['service'], tier: 1 })).not.toBeNull();
  });

  it('nobody to watch is no demonstration', () => {
    const s = staging('select_few');
    s.relations[BEA].trust = 0;
    s.power = undefined;
    expect(demonstrationGate(s, reg, ANN)).not.toBeNull();
  });
});

describe('audience by her appetite', () => {
  it('select_few: the leader and the units close to the commander, at base, not her', () => {
    const s = staging('select_few');
    expect(pickAudience(s, reg, ANN, 'evening')).toEqual({ cards: [BEA, CAT], narrated: [] });
    s.relations[BEA].trust = 0;
    expect(pickAudience(s, reg, ANN, 'evening')).toEqual({ cards: [CAT], narrated: [] });
    s.expedition = { party: [CAT] } as never; // the leader is out
    expect(pickAudience(s, reg, ANN, 'evening')).toEqual({ cards: [], narrated: [] });
  });

  it('show_off: whoever\'s whereabout at the stage slot is the stage room; at most two on cards, the rest narrated', () => {
    const s = staging('show_off');
    const messRoom = [...reg.hubRooms.values()].find((r) => r.sceneLocationId === 'mess_hall')!.id as string;
    const there = [BEA, CAT].filter((id) => whereaboutAt(s, reg, id, s.day, 'evening').roomId === messRoom);
    expect(pickAudience(s, reg, ANN, 'evening').cards).toEqual(there);
    // a pack with the mess as the only room puts everybody there: the cap shows
    const only = { ...reg, hubRooms: new Map([[messRoom, { ...reg.hubRooms.get(messRoom)!, facilityId: undefined, weights: { morning: 1, afternoon: 1, evening: 1, night: 1 } }]]) } as unknown as Registries;
    const big = staging('show_off');
    big.squad.push({ ...structuredClone(unitOf(big, CAT)), id: 'unit_dee', displayName: 'Dee' } as never);
    big.relations.unit_dee = structuredClone(big.relations[CAT]);
    const all = pickAudience(big, only, ANN, 'evening');
    expect(all.cards).toEqual([BEA, CAT]);
    expect(all.narrated).toEqual(['unit_dee']);
  });
});

describe('the writer', () => {
  it('writes the card: the engine picks the audience and the stage, the model\'s own picks go first, and the request is stamped; no rng', () => {
    const s = staging('select_few');
    const rng = structuredClone(s.rng);
    const r = offered(s, card({ audienceIds: [CAT] }));
    expect(r.rng).toEqual(rng);
    expect(demo(r)).toMatchObject({ id: expect.stringMatching(/^pd/), holderId: ANN, status: 'offered', audienceIds: [CAT], narrated: [BEA], stage: 'mess_hall', slot: 'evening', requestId: 'pq1', stakes: 'minor', tags: ['service'] });
    expect(r.practices!.requests).toEqual([]);
  });

  it('a request she may not stage writes nothing (the gate reads the card); the event is a task_issued of kind demonstration', () => {
    const s = staging('select_few');
    const events = run(s, reg, { type: 'practice/issue', payload: { requestId: 'nope' } }).events;
    expect(errors(events)).not.toEqual([]);
    const ok = run((() => { const t = structuredClone(s); ensurePractices(t).requests.push({ id: 'pq1', holderId: ANN, kind: 'demonstration', day: t.day, seedIds: ['demo_mess_table'] }); return t; })(), reg, { type: 'practice/issue', payload: { requestId: 'pq1', output: card() } });
    expect(ofType(ok.events, 'task_issued')).toMatchObject([{ kind: 'demonstration', taskId: expect.stringMatching(/^pd/), holderId: ANN }]);
    const closed = staging('private_only');
    ensurePractices(closed).requests.push({ id: 'pq1', holderId: ANN, kind: 'demonstration', day: closed.day, seedIds: ['demo_mess_table'] });
    const r = run(closed, reg, { type: 'practice/issue', payload: { requestId: 'pq1', output: card() } });
    expect(r.state.practices!.demonstrations).toEqual([]);
  });

  it('the day offers the kind only when she may stage one, and one at a time', () => {
    const s = staging('select_few');
    expect(kindsToday(s, reg, ANN)).toContain('demonstration');
    expect(kindsToday(staging('indifferent'), reg, ANN)).not.toContain('demonstration');
    expect(kindsToday(offered(s), reg, ANN)).not.toContain('demonstration');
  });

  it('an unanswered card is void after its days, with no delta', () => {
    const s = offered(staging('select_few'));
    const relations = structuredClone(s.relations);
    const d = structuredClone(s);
    d.day += TUNING.practice.demonstration.offerDays;
    const events = practiceDayStep(d, ctxOf(d));
    expect(ofType(events, 'task_void')).toMatchObject([{ what: 'demonstration', reason: 'expired' }]);
    expect(demo(d).status).toBe('void');
    expect(s.relations).toEqual(relations);
  });
});

describe('answering', () => {
  it('GO opens exactly her and the cards, at the stage, and costs the slot; REFUSE is a refusal at its stakes', () => {
    const s = offered(staging('select_few'));
    const rng = structuredClone(s.rng);
    const d = structuredClone(s);
    const out = answerDemonstration(d, ctxOf(d), demo(d).id, 'go');
    expect(out.scene).toEqual({ locationId: 'mess_hall', participants: [ANN, BEA, CAT], origin: 'event', consumesSlot: true });
    expect(d.rng).toEqual(rng);
    expect(demo(d).status).toBe('open');
    expect(ofType(out.events, 'task_answered')).toMatchObject([{ answer: 'go', scene: out.scene }]);
    // through the action, the descriptor travels on the event
    const via = run(s, reg, { type: 'practice/answer_demonstration', payload: { demonstrationId: demo(s).id, answer: 'go' } });
    expect(ofType(via.events, 'task_answered')[0].scene).toEqual(out.scene);
    // REFUSE
    const before = s.relations[ANN].trust;
    const no = run(s, reg, { type: 'practice/answer_demonstration', payload: { demonstrationId: demo(s).id, answer: 'refuse' } });
    expect(errors(no.events)).toEqual([]);
    expect(demo(no.state).status).toBe('refused');
    expect(no.state.relations[ANN].trust).toBeLessThanOrEqual(before);
    expect(ofType(no.events, 'task_answered')).toMatchObject([{ answer: 'refuse', what: 'demonstration' }]);
    // answered, or while a scene is open, it throws
    expect(errors(run(no.state, reg, { type: 'practice/answer_demonstration', payload: { demonstrationId: demo(s).id, answer: 'go' } }).events)).not.toEqual([]);
    const open = structuredClone(s);
    open.scene = { id: 's9', day: 20, slot: 'afternoon', locationId: 'quarters_commander', participants: [ANN], mode: 'private', origin: 'event', consumesSlot: false, startIndex: 0, readIndex: 0, exchanges: 0 } as never;
    expect(errors(run(open, reg, { type: 'practice/answer_demonstration', payload: { demonstrationId: demo(s).id, answer: 'go' } }).events)).not.toEqual([]);
  });

  it('with nobody left to watch, GO makes it void at no cost', () => {
    const s = offered(staging('select_few'));
    s.expedition = { party: [BEA, CAT] } as never;
    const out = answerDemonstration(s, ctxOf(s), demo(s).id, 'go');
    expect(ofType(out.events, 'task_void')).toMatchObject([{ what: 'demonstration' }]);
    expect(out.scene).toBeUndefined();
    expect(demo(s).status).toBe('void');
  });

  it('the scene that opens at the stage holds it; an aborted scene offers the card again', () => {
    let s = offered(staging('select_few'));
    s = run(s, reg, { type: 'practice/answer_demonstration', payload: { demonstrationId: demo(s).id, answer: 'go' } }).state;
    const started = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN, BEA, CAT], origin: 'event', consumesSlot: true, startIndex: 0 } });
    expect(errors(started.events)).toEqual([]);
    expect(demo(started.state).sceneId).toBe(started.state.scene!.id);
    const aborted = structuredClone(started.state);
    demonstrationsFromEvents(aborted, ctxOf(aborted), [{ type: 'scene_aborted', sceneId: aborted.scene!.id }]);
    expect(demo(aborted)).toMatchObject({ status: 'offered' });
    expect(demo(aborted).sceneId).toBeUndefined();
  });
});

describe('the whole way through the engine', () => {
  it('offered, GO, the scene opens at the stage, the scene ends: the outcomes land once and the slot is spent', () => {
    let s = offered(withWant(staging('select_few'), 40));
    s = run(s, reg, { type: 'practice/answer_demonstration', payload: { demonstrationId: demo(s).id, answer: 'go' } }).state;
    s = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN, BEA, CAT], origin: 'event', consumesSlot: true, startIndex: 0 } }).state;
    const slot = s.slot;
    const ended = run(s, reg, { type: 'scene/end', payload: {} });
    expect(errors(ended.events)).toEqual([]);
    expect(demo(ended.state).status).toBe('done');
    expect(ofType(ended.events, 'demonstration_staged')).toHaveLength(1);
    expect(ofType(ended.events, 'demonstration_seen')).toHaveLength(2);
    expect(levelOf(ended.state, BEA, ANN)).toBe('knows_dynamic');
    expect(ended.state.slot).not.toBe(slot); // the scene cost the slot
    expect(ended.state.memory.facts.filter((f) => f.tags.includes('demonstration_staged'))).toHaveLength(1);
  });
});

describe('at scene end', () => {
  /** A demonstration whose scene is over (its id is `s1`), with Bea on the card and Cat narrated, Ann's Want at 40. */
  function over(tags = ['service']): CampaignState {
    const s = withWant(staging('select_few'), 40);
    const p = ensurePractices(s);
    p.demonstrations.push({ id: 'pd1', holderId: ANN, tags, summary: 'service at the mess table', text: 't', audienceIds: [BEA], narrated: [CAT], stage: 'mess_hall', slot: 'evening', day: s.day, status: 'open', sceneId: 's1', stakes: 'minor', tier: 1, track: 'service' });
    return s;
  }
  const end = (s: CampaignState) => demonstrationsFromEvents(s, ctxOf(s), [{ type: 'scene_ended', sceneId: 's1' }]);

  it('each of the audience, on the card or narrated, knows; hold, xp, Want relief, compromat, the deed and the two events land; no rng', () => {
    const s = over();
    const rng = structuredClone(s.rng);
    const holdBefore = dynamicOf(s, ANN)!.hold;
    const xpBefore = dynamicOf(s, ANN)!.tracks.service?.xp ?? 0;
    const events = end(s);
    expect(s.rng).toEqual(rng);
    expect(levelOf(s, BEA, ANN)).toBe('knows_dynamic');
    expect(levelOf(s, CAT, ANN)).toBe('knows_dynamic');
    expect(ofType(events, 'dynamic_known')).toHaveLength(2);
    expect(dynamicOf(s, ANN)!.hold).toBeGreaterThan(holdBefore);
    expect(ofType(events, 'hold_changed').some((e) => e.unitId === ANN)).toBe(true);
    expect(dynamicOf(s, ANN)!.tracks.service!.xp).toBe(xpBefore + TUNING.practice.xp.demonstration);
    expect(s.relations[ANN].want).toBe(40 - TUNING.practice.demonstration.wantRelief.enjoys);
    expect(compromatOf(s, ANN)).toHaveLength(1);
    expect(compromatOf(s, ANN)[0].knownBy).toEqual([ANN]);
    expect(s.commander.deeds?.demonstrated).toBe(1);
    expect(demo(s)).toMatchObject({ status: 'done', observed: [BEA, CAT] });
    expect(demo(s).sceneId).toBeUndefined();
    expect(ofType(events, 'demonstration_staged')).toMatchObject([{ demonstrationId: 'pd1', holderId: ANN, audienceIds: [BEA, CAT], humbling: false }]);
    expect(ofType(events, 'demonstration_seen')).toMatchObject([{ observerId: BEA }, { observerId: CAT }]);
    // once: a second scene end changes nothing
    expect(end(s)).toEqual([]);
  });

  it('a drawn onlooker starts her own hold; one who dislikes it raises her Impunity term; one who already knew reacts again', () => {
    const s = over();
    witness(s, BEA, 'drawn');
    witness(s, CAT, 'dislikes');
    const termBefore = dynamicTerm(s, reg, CAT);
    end(s);
    expect(dynamicOf(s, BEA)?.hold ?? 0).toBeGreaterThan(0);
    expect(dynamicTerm(s, reg, CAT)).toBeGreaterThan(termBefore);
    // the knowing one reacts again: she is drawn, so her own hold rises once more
    const again = over();
    witness(again, BEA, 'drawn');
    end(again);
    const first = dynamicOf(again, BEA)!.hold;
    again.practices!.demonstrations.push({ ...structuredClone(demo(again)), id: 'pd2', status: 'open', sceneId: 's2', observed: undefined });
    demonstrationsFromEvents(again, ctxOf(again), [{ type: 'scene_ended', sceneId: 's2' }]);
    expect(dynamicOf(again, BEA)!.hold).toBeGreaterThan(first);
  });

  it('outside: only a humbling demonstration ends a feat\'s suppression; its memory rule spreads slow, the other none', () => {
    const quiet = over(['service']);
    quiet.power!.hierarchy!.outsideSuppressedUntil = quiet.day + 10;
    const q = end(quiet);
    expect(quiet.power!.hierarchy!.outsideSuppressedUntil).toBe(quiet.day + 10);
    const loud = over(['public_humiliation']);
    loud.power!.hierarchy!.outsideSuppressedUntil = loud.day + 10;
    const l = end(loud);
    expect(loud.power!.hierarchy!.outsideSuppressedUntil).toBe(loud.day);
    expect(ofType(l, 'demonstration_staged')).toMatchObject([{ humbling: true }]);

    const facts = (s: CampaignState, events: Array<Record<string, unknown>>) => { rememberEvents(s, events as never, reg); return s.memory.facts.filter((f) => f.tags.includes('demonstration_staged')); };
    const slow = facts(structuredClone(loud), l as never);
    expect(slow).toHaveLength(1);
    expect(slow[0].spread).toBe('slow');
    expect(slow[0].knownBy).toEqual(expect.arrayContaining([ANN, BEA, CAT]));
    const plain = facts(structuredClone(quiet), q as never);
    expect(plain).toHaveLength(1);
    expect(plain[0].spread).toBeUndefined();
    expect(plain[0].text).not.toMatch(/\b(he|him|his)\b/i);
  });

  it('a holder who stopped holding stages nothing: void, no outcome', () => {
    const s = over();
    s.relations[ANN].dynamic!.frame = 'equal';
    const events = end(s);
    expect(demo(s).status).toBe('void');
    expect(ofType(events, 'task_void')).toMatchObject([{ what: 'demonstration', reason: 'gone' }]);
    expect(levelOf(s, BEA, ANN)).toBeUndefined();
  });
});

describe('indifferent: seen by chance', () => {
  /** A kept in_person task of Ann's in a group scene; the id is picked so that Bea's roll is under the chance and Cat's is over. */
  function kept(): { s: CampaignState; taskId: string } {
    for (let n = 1; n < 400; n++) {
      const s = staging('indifferent');
      s.scene = { id: 's1', day: 20, slot: 'afternoon', locationId: 'mess_hall', participants: [ANN, BEA, CAT], mode: 'group', origin: 'event', consumesSlot: false, startIndex: 0, readIndex: 0, exchanges: 0 } as never;
      const id = `pt${n}`;
      if (practiceRoll(s, BEA, `seen:${id}`) < TUNING.practice.demonstration.seenByChance && practiceRoll(s, CAT, `seen:${id}`) >= TUNING.practice.demonstration.seenByChance) {
        const task: Task = { id, holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'trivial', check: 'model', proof: 'in_person', text: 't', summary: 'coffee before drill', status: 'open', acceptForm: 'button', day: 20 };
        ensurePractices(s).tasks.push(task);
        return { s, taskId: id };
      }
    }
    throw new Error('no task id gives a mixed pair');
  }

  it('each other participant whose roll is under 0.2 sees a step behind; the rest see nothing; no rng', () => {
    const { s, taskId } = kept();
    const rng = structuredClone(s.rng);
    settleTask(s, ctxOf(s), taskId, 'kept', 'model');
    expect(s.rng).toEqual(rng);
    expect(s.dynamic!.knowledge[BEA]?.[ANN]?.suspicion).toBeGreaterThan(0);
    expect(s.dynamic!.knowledge[CAT]?.[ANN]?.suspicion ?? 0).toBe(0);
  });

  it('only for an in-person task and only for an indifferent holder', () => {
    const { s, taskId } = kept();
    s.practices!.tasks[0].proof = 'dm_report';
    settleTask(s, ctxOf(s), taskId, 'kept', 'model');
    expect(s.dynamic!.knowledge[BEA]?.[ANN]?.suspicion ?? 0).toBe(0);
    const t = kept();
    unitOf(t.s, ANN).bond!.practice!.audience = 'select_few';
    settleTask(t.s, ctxOf(t.s), t.taskId, 'kept', 'model');
    expect(t.s.dynamic!.knowledge[BEA]?.[ANN]?.suspicion ?? 0).toBe(0);
  });

  it('a task kept when its scene ends is seen by the units that came in with it', () => {
    const { s, taskId } = kept();
    s.scene = undefined;
    s.practices!.tasks[0].check = 'slot_with_her';
    s.practices!.tasks[0].sceneWith = [BEA, CAT];
    s.practices!.tasks[0].sceneId = 's1';
    settleTask(s, ctxOf(s), taskId, 'kept', 'engine');
    expect(s.dynamic!.knowledge[BEA]?.[ANN]?.suspicion).toBeGreaterThan(0);
  });
});

describe('serving one before the other', () => {
  it('a service activity of the commander with another holder present: she knows at once and reacts by her own witness attitude', () => {
    const s = withBea(staging('select_few'));
    s.scene = { id: 's1', day: 20, slot: 'afternoon', locationId: 'quarters_unit', participants: [ANN, BEA], mode: 'group', origin: 'event', consumesSlot: false, startIndex: 0, readIndex: 0, exchanges: 0 } as never;
    witness(s, BEA, 'dislikes');
    s.relations[BEA].dynamic = { ...dynamicOf(s, ANN)!, hold: 30 };
    const termBefore = dynamicTerm(s, reg, BEA);
    const rng = structuredClone(s.rng);
    const events = demonstrationsFromEvents(s, ctxOf(s), [{ type: 'blocking_changed', person: 'commander', field: 'activity', value: 'polishing_her_boots', source: 'chip' }]);
    expect(s.rng).toEqual(rng);
    expect(ofType(events, 'dynamic_known')).toMatchObject([{ observerId: BEA, holderId: ANN, level: 'knows_dynamic' }]);
    expect(levelOf(s, BEA, ANN)).toBe('knows_dynamic');
    expect(dynamicTerm(s, reg, BEA)).toBeGreaterThan(termBefore);
    // an activity of hers, a worn item, or a scene with one holder: nothing
    const quiet = structuredClone(s);
    expect(demonstrationsFromEvents(quiet, ctxOf(quiet), [{ type: 'blocking_changed', person: ANN, field: 'activity', value: 'inspecting', source: 'chip' }])).toEqual([]);
    const alone = withBea(staging('select_few'));
    alone.scene = { ...(s.scene as object), participants: [ANN, CAT] } as never;
    expect(demonstrationsFromEvents(alone, ctxOf(alone), [{ type: 'blocking_changed', person: 'commander', field: 'activity', value: 'polishing_her_boots', source: 'chip' }])).toEqual([]);
  });
});

describe('the directive', () => {
  const staged = (): CampaignState => {
    const s = staging('select_few');
    s.scene = { id: 's1', day: 20, slot: 'afternoon', locationId: 'mess_hall', participants: [ANN, BEA], mode: 'group', origin: 'event', consumesSlot: true, startIndex: 0, readIndex: 0, exchanges: 0 } as never;
    ensurePractices(s).demonstrations.push({ id: 'pd1', holderId: ANN, tags: ['service'], summary: 'service at the mess table', text: 't', audienceIds: [BEA], narrated: [CAT], stage: 'mess_hall', slot: 'evening', day: 20, status: 'open', sceneId: 's1' });
    witness(s, BEA, 'drawn');
    return s;
  };

  it('says she speaks for the commander unless she is silent, names how the onlookers take it, and carries no digit or pronoun for the commander', () => {
    const s = staged();
    const line = practiceDirectives(s, reg, [ANN, BEA]).find((d) => d.id === `practice:demonstration:${ANN}`)!;
    expect(line.expiresAfter).toBe('scene');
    expect(line.text).toContain('service at the mess table');
    expect(line.text).toContain('answers for the commander');
    expect(line.text).toMatch(/Bea is drawn to it/);
    expect(line.text).not.toMatch(/\d/);
    expect(line.text).not.toMatch(/\b(he|him|his|himself)\b/i);
    expect(line.text).not.toContain('AUTHOR TO WRITE');
    unitOf(s, ANN).temperament = { talkativeness: 'silent', volatility: 'steady', humor: 'none' };
    expect(practiceDirectives(s, reg, [ANN, BEA]).find((d) => d.id === `practice:demonstration:${ANN}`)!.text).not.toContain('answers for the commander');
  });

  it('is there only while that scene is on', () => {
    const s = staged();
    s.scene!.id = 's2';
    expect(practiceDirectives(s, reg, [ANN, BEA]).some((d) => d.id.startsWith('practice:demonstration:'))).toBe(false);
  });
});
