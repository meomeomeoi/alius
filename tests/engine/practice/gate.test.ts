import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/practice';
import { ensurePractices, freezeOf, nextPracticeId, practiceHolders, practiceLive, practicesOf, practicesOn } from '../../../src/engine/practice/gate';
import { blankPractices } from '../../../src/engine/practice/state';
import type { Task } from '../../../src/engine/practice/state';
import { endDay } from '../../helpers/loyalty';
import { errors, loadCore, run } from '../../helpers/world';
import { ANN, BEA, unitOf, withBea, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

describe('practiceLive', () => {
  it('needs the dynamic, her practice and the frame play (and not her aftermath)', () => {
    const equal = world(reg, 'equal');
    expect(practiceLive(equal, reg, ANN)).toBe(false); // a frame of equal is no hold
    for (const frame of ['play', 'role', 'rule'] as const) expect(practiceLive(world(reg, frame), reg, ANN), frame).toBe(true);

    const noPractice = world(reg, 'play');
    noPractice.content = { enabled: [] }; // nothing of hers is switched on: the dynamic is off
    expect(practiceLive(noPractice, reg, ANN)).toBe(false);

    const limited = world(reg, 'play');
    unitOf(limited, ANN).bond!.ownLimits.categories = ['restraint', 'public_humiliation', 'denial']; // every category she practises is among her own limits
    expect(practiceLive(limited, reg, ANN)).toBe(false);

    const after = world(reg, 'play');
    after.relations[ANN].dynamic!.aftermath = { id: 'da0', kind: 'grief', stage: 0, untilDay: after.day + 3 };
    expect(practiceLive(after, reg, ANN)).toBe(false);
    delete after.relations[ANN].dynamic!.aftermath;
    expect(practiceLive(after, reg, ANN)).toBe(true);
  });

  it('a unit without the block, a grunt, a dead unit and an unknown id are never live', () => {
    const s = world(reg, 'play');
    expect(practiceLive(s, reg, BEA)).toBe(false);
    expect(practiceLive(s, reg, 'nobody')).toBe(false);
    const noDynamic = world(reg, 'play');
    delete noDynamic.dynamic;
    expect(practiceLive(noDynamic, reg, ANN)).toBe(false);
    const dead = world(reg, 'play');
    unitOf(dead, ANN).status = 'dead';
    expect(practiceLive(dead, reg, ANN)).toBe(false);
  });

  it('practicesOn and practiceHolders list the live holders in squad order', () => {
    const s = world(reg, 'play');
    expect(practicesOn(s, reg)).toBe(true);
    expect(practiceHolders(s, reg)).toEqual([ANN]);
    withBea(s, 'role');
    expect(practiceHolders(s, reg)).toEqual([ANN, BEA]);
    s.relations[ANN].dynamic!.frame = 'equal';
    expect(practiceHolders(s, reg)).toEqual([BEA]);
    s.relations[BEA].dynamic!.frame = 'equal';
    expect(practicesOn(s, reg)).toBe(false);
    expect(practiceHolders(s, reg)).toEqual([]);
  });

  it('reads nothing and draws nothing', () => {
    const s = world(reg, 'play');
    const before = structuredClone(s);
    practiceLive(s, reg, ANN);
    practicesOn(s, reg);
    practiceHolders(s, reg);
    freezeOf(s, reg, ANN);
    expect(s).toEqual(before);
  });
});

describe('the state', () => {
  it('practicesOf is undefined while absent; ensurePractices creates the blank block once', () => {
    const s = world(reg, 'play');
    expect(practicesOf(s)).toBeUndefined();
    const made = ensurePractices(s);
    expect(made).toEqual(blankPractices());
    expect(practicesOf(s)).toBe(made);
    expect(ensurePractices(s)).toBe(made);
  });

  it('nextPracticeId counts one sequence over every prefix', () => {
    const s = world(reg, 'play');
    ensurePractices(s);
    expect(nextPracticeId(s, 'pt')).toBe('pt0');
    expect(nextPracticeId(s, 'pq')).toBe('pq1');
    expect(nextPracticeId(s, 'pp')).toBe('pp2');
    expect(s.practices!.seq).toBe(3);
  });

  it('nothing is written while nobody is live: a day end of a campaign with a holder at equal leaves practices absent', () => {
    const s = world(reg, 'equal');
    expect(practicesOn(s, reg)).toBe(false);
    const after = endDay(s, reg);
    expect(after.day).toBeGreaterThan(s.day);
    expect(after.practices).toBeUndefined();
    const noHolder = world(reg, 'equal');
    delete noHolder.dynamic;
    expect(endDay(noHolder, reg).practices).toBeUndefined();
    // a live holder's day end writes nothing either (the day step is a later task)
    expect(endDay(world(reg, 'play'), reg).practices).toBeUndefined();
  });
});

describe('a frozen holder', () => {
  const task = (id: string, over: Partial<Task> = {}): Task => ({
    id, holderId: ANN, kind: 'task', tags: ['restraint'], track: 'service', tier: 1, stakes: 'minor', check: 'model', proof: 'none', text: 't', summary: 's', status: 'open', acceptForm: 'button_cost', day: 18,
    deadline: { day: 19 }, ...over,
  });

  it('freezeOf is true exactly while she is not live', () => {
    const s = world(reg, 'play');
    expect(freezeOf(s, reg, ANN)).toBe(false);
    s.relations[ANN].dynamic!.frame = 'equal'; // a cooling
    expect(freezeOf(s, reg, ANN)).toBe(true);
    s.relations[ANN].dynamic!.frame = 'play';
    expect(freezeOf(s, reg, ANN)).toBe(false);
  });

  it('her open task stays open through the days while the frame is equal, and she can be live again', () => {
    const s = world(reg, 'play');
    ensurePractices(s).tasks.push(task('pt0'));
    s.relations[ANN].dynamic!.frame = 'equal';
    expect(freezeOf(s, reg, ANN)).toBe(true);
    const later = endDay(endDay(s, reg), reg);
    expect(later.day).toBeGreaterThan(s.day + 1); // the deadline (day 19) is long past
    expect(later.practices!.tasks).toEqual([task('pt0')]); // no check ran, nothing settled it
    later.relations[ANN].dynamic!.frame = 'play';
    expect(freezeOf(later, reg, ANN)).toBe(false);
    expect(later.practices!.tasks[0].status).toBe('open'); // it resumes: the same task, still hers
  });

  it('the actions module is registered (an unknown practice action is still an error, the module adds none)', () => {
    const r = run(world(reg, 'play'), reg, { type: 'practice/issue', payload: {} });
    expect(errors(r.events).length).toBeGreaterThan(0);
  });
});
