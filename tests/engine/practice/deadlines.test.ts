import { beforeAll, describe, expect, it } from 'vitest';
import type { PracticeSeedEntry } from '../../../src/content/schemas';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { deadlineSweep } from '../../../src/engine/practice/checks';
import { kindsToday, practiceDayStep } from '../../../src/engine/practice/dayStep';
import { issuePractice, requestPractice } from '../../../src/engine/practice/issue';
import { answerTask } from '../../../src/engine/practice/tasks';
import type { PracticeRequest } from '../../../src/engine/practice/state';
import { fallbackOutput } from '../../../src/engine/practice/issue';
import { validatePracticeOutput } from '../../../src/engine/practice/validate';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { loadCore } from '../../helpers/world';
import { ANN, withService, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ctxOf = (d: CampaignState) => ({ registries: reg, rng: new Rng(d.rng) });
const play = (): CampaignState => withService(world(reg, 'play'));

/** A request of a kind of task whose seeds are all the given check (the pool is filtered to one seed). */
function requestWith(s: CampaignState, seedId: string): { d: CampaignState; request: PracticeRequest } {
  const d = structuredClone(s);
  requestPractice(d, ctxOf(d), ANN, 'task');
  d.practices!.requests[0].seedIds = [seedId];
  return { d, request: d.practices!.requests[0] };
}

describe('every task has a deadline (C1)', () => {
  it('the tuning has a default deadline in range', () => {
    expect(TUNING.practice.defaultDeadlineDays).toBe(2);
    expect(TUNING.practice.defaultDeadlineDays).toBeGreaterThanOrEqual(TUNING.practice.deadlineDays.min);
    expect(TUNING.practice.defaultDeadlineDays).toBeLessThanOrEqual(TUNING.practice.deadlineDays.max);
  });

  it('a seed may carry its own days, and none is above the range', () => {
    for (const seed of reg.practiceSeeds.values() as Iterable<PracticeSeedEntry>) {
      if (seed.days !== undefined) { expect(seed.days).toBeGreaterThanOrEqual(1); expect(seed.days).toBeLessThanOrEqual(7); }
    }
  });

  it('the fallback task carries the seed days, or the default', () => {
    const s = play();
    const { request } = requestWith(s, 'task_report_at_dusk');
    const seed = reg.practiceSeeds.get('task_report_at_dusk') as unknown as PracticeSeedEntry;
    expect(fallbackOutput(s, reg, request)!.deadline).toEqual({ days: seed.days ?? TUNING.practice.defaultDeadlineDays });
  });

  it('a model card without a deadline gets the default', () => {
    const s = play();
    const { request } = requestWith(s, 'task_report_at_dusk');
    const card = { kind: 'task', seedId: 'task_report_at_dusk', tags: ['service'], track: 'service', tier: 1, stakes: 'trivial', check: 'dm_report', proof: 'dm_report', text: 'Report at dusk.', summary: 'report at dusk' };
    const seed = reg.practiceSeeds.get('task_report_at_dusk') as unknown as PracticeSeedEntry;
    expect(validatePracticeOutput(s, reg, request, card)!.output.deadline).toEqual({ days: seed.days ?? TUNING.practice.defaultDeadlineDays });
    expect(validatePracticeOutput(s, reg, request, { ...card, deadline: 'soon' })!.output.deadline).toEqual({ days: seed.days ?? TUNING.practice.defaultDeadlineDays });
  });

  it('a fallback task settles at its deadline, and she asks again after it', () => {
    const s = play();
    const d = structuredClone(s);
    requestPractice(d, ctxOf(d), ANN, 'task');
    const id = d.practices!.requests[0].id;
    issuePractice(d, ctxOf(d), id, 'fallback');
    const task = d.practices!.tasks[0];
    expect(task.plain).toBe(true);
    expect(task.deadline).toBeDefined();
    expect(kindsToday(d, reg, ANN)).not.toContain('task'); // the cap at play is one open task
    answerTask(d, { ...ctxOf(d), registries: reg }, task.id, 'accept');
    for (let i = 0; i < 20 && task.status === 'open'; i++) {
      d.day++;
      deadlineSweep(d, ctxOf(d));
    }
    expect(['kept', 'broken', 'void']).toContain(task.status);
    expect(d.day - 20).toBeLessThanOrEqual(task.deadline!.day - 20 + 1);
    expect(kindsToday(d, reg, ANN)).toContain('task'); // her loop resumes
  });

  it('an offered fallback task expires at its deadline', () => {
    const d = structuredClone(play());
    requestPractice(d, ctxOf(d), ANN, 'task');
    issuePractice(d, ctxOf(d), d.practices!.requests[0].id, 'fallback');
    const task = d.practices!.tasks[0];
    d.day = task.deadline!.day + 1;
    deadlineSweep(d, ctxOf(d));
    expect(task.status).toBe('void');
  });

  it('the day step settles it too', () => {
    const d = structuredClone(play());
    requestPractice(d, ctxOf(d), ANN, 'task');
    issuePractice(d, ctxOf(d), d.practices!.requests[0].id, 'fallback');
    const task = d.practices!.tasks[0];
    d.day = task.deadline!.day + 1;
    practiceDayStep(d, ctxOf(d));
    expect(task.status).toBe('void');
  });

  it('noDuration hides a deadline that exists', () => {
    const d = structuredClone(play());
    requestPractice(d, ctxOf(d), ANN, 'task', { noDuration: true });
    issuePractice(d, ctxOf(d), d.practices!.requests[0].id, 'fallback');
    expect(d.practices!.tasks[0]).toMatchObject({ noDuration: true, deadline: { day: expect.any(Number) } });
  });
});

describe('a token task breaks early only after the day it was accepted (C1)', () => {
  it('not at the evening it was accepted, but at the next day end when the token is off', () => {
    const d = structuredClone(play());
    d.practices = { seq: 3, requests: [], tasks: [], punishments: [], demonstrations: [], restrictions: [], cold: {}, postures: {}, offences: {}, records: [], handovers: [] };
    d.practices.tasks.push({
      id: 'pt1', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 2, stakes: 'minor', check: 'token_worn', proof: 'none', text: 't', summary: 's', status: 'open',
      acceptForm: 'button_cost', day: d.day, answeredDay: d.day, deadline: { day: d.day + 3 },
    });
    d.personal = { seq: 4, tokens: { owned: [{ id: 'tk1', giverId: ANN, kindId: 'ribbon', label: 'her ribbon', day: 10, worn: false }], given: [] } } as never;
    deadlineSweep(d, ctxOf(d));
    expect(d.practices.tasks[0].status).toBe('open'); // the day it was accepted
    d.day++;
    deadlineSweep(d, ctxOf(d));
    expect(d.practices.tasks[0].status).toBe('broken');
  });
});
