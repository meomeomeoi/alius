import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import '../../../src/engine/actions/comms';
import { compromatOf } from '../../../src/engine/dynamic/compromat';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { rememberEvents } from '../../../src/engine/memory/remember';
import { falseReportChance, falseReportSweep, reportTask } from '../../../src/engine/practice/checks';
import { practiceDayStep } from '../../../src/engine/practice/dayStep';
import { applyPracticeIntent, practiceIntentInput } from '../../../src/engine/practice/intents';
import { blankPractices, practiceRoll, type Task } from '../../../src/engine/practice/state';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, BEA, unitOf, withService, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const task = (over: Partial<Task> = {}): Task => ({
  id: 'pt1', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 2, stakes: 'minor', check: 'model', proof: 'none', text: 'Do it.', summary: 'keep Bea off the run',
  status: 'open', acceptForm: 'button_cost', day: 19, answeredDay: 19, ...over,
});
const withTask = (over: Partial<Task> = {}, frame: 'play' | 'role' | 'rule' = 'role'): CampaignState => {
  const s = withService(world(reg, frame));
  s.practices = { ...blankPractices(), seq: 3, tasks: [task(over)] };
  return s;
};
const ctxOf = (d: CampaignState) => ({ registries: reg, rng: new Rng(d.rng) });
const t1 = (s: CampaignState) => s.practices!.tasks.find((t) => t.id === 'pt1')!;
const intent = (type: string, over: Record<string, unknown> = {}) => ({ type, actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'x', confidence: 1, taskId: 'pt1', ...over }) as never;
const apply = (s: CampaignState, type: string) => { const d = structuredClone(s); const events = applyPracticeIntent(d, { registries: reg }, ANN, intent(type)); return { state: d, events }; };

describe('the model judges a model task', () => {
  it('task_kept in a scene with her keeps it (via model), task_broken breaks it', () => {
    const s = withTask();
    const kept = apply(s, 'task_kept');
    expect(t1(kept.state).status).toBe('kept');
    expect(ofType(kept.events, 'task_kept')).toMatchObject([{ taskId: 'pt1', holderId: ANN, via: 'model' }]);
    const broken = apply(s, 'task_broken');
    expect(t1(broken.state).status).toBe('broken');
    expect(ofType(broken.events, 'task_broken')).toMatchObject([{ taskId: 'pt1', via: 'model', stakes: 'minor' }]);
    expect(broken.state.practices!.offences[ANN]).toEqual([20]);
  });

  it('a report in her DM is judged by the model: the DM extraction offers the task', () => {
    const s = withTask({ check: 'dm_report', deadline: { day: 22 } });
    const offer = practiceIntentInput(s, reg, [ANN], 'dm').practice!;
    expect(offer.types).toEqual(expect.arrayContaining(['task_kept', 'task_broken']));
    expect(offer.tasks.map((t) => t.id)).toEqual(['pt1']);
  });

  it('a stale, foreign or unopened task does nothing', () => {
    const s = withTask({ status: 'offered' });
    expect(apply(s, 'task_kept').events).toEqual([]);
    expect(apply(withTask(), 'task_kept').state.practices!.tasks).toHaveLength(1);
    const d = structuredClone(withTask());
    expect(applyPracticeIntent(d, { registries: reg }, BEA, intent('task_kept'))).toEqual([]);
    expect(t1(d).status).toBe('open');
  });
});

describe('reporting', () => {
  it('a dm_report task is marked reported and stays open for the model', () => {
    const s = withTask({ check: 'dm_report', deadline: { day: 22 } });
    const r = run(s, reg, { type: 'practice/report', payload: { taskId: 'pt1' } });
    expect(errors(r.events)).toEqual([]);
    expect(t1(r.state)).toMatchObject({ status: 'open', report: { day: 20 } });
    expect(ofType(r.events, 'task_answered')).toMatchObject([{ taskId: 'pt1', answer: 'report' }]);
  });

  it('a task that is not reported by the commander cannot be reported', () => {
    const r = run(withTask({ check: 'slot_with_her', proof: 'in_person' }), reg, { type: 'practice/report', payload: { taskId: 'pt1' } });
    expect(errors(r.events)).toHaveLength(1);
  });

  it('a true report of an engine-checkable task is kept with no flag', () => {
    const s = withTask({ check: 'not_on_roster', checkArg: BEA, field: true, proof: 'dm_report', deadline: { day: 25 } });
    s.roster.activeIds = [ANN];
    const r = run(s, reg, { type: 'practice/report', payload: { taskId: 'pt1' } });
    expect(t1(r.state)).toMatchObject({ status: 'kept' });
    expect(t1(r.state).report).toEqual({ day: 20 });
    expect(ofType(r.events, 'task_kept')).toMatchObject([{ via: 'report' }]);
  });

  it('a report that is false is kept all the same (she believes it), the flag is stored on the task and on no event', () => {
    const s = withTask({ check: 'not_on_roster', checkArg: BEA, field: true, proof: 'dm_report', deadline: { day: 25 } });
    s.roster.activeIds = [ANN, BEA];
    const r = run(s, reg, { type: 'practice/report', payload: { taskId: 'pt1' } });
    expect(errors(r.events)).toEqual([]);
    expect(t1(r.state)).toMatchObject({ status: 'kept', report: { day: 20, falseReport: true } });
    expect(JSON.stringify(r.events)).not.toMatch(/falseReport|false/i);
    expect(dynamicOf(r.state, ANN)!.hold).toBeGreaterThan(dynamicOf(s, ANN)!.hold); // she is fooled: the yield counts
  });
});

describe('a false report is found by the day roll', () => {
  const falseKept = (): CampaignState => {
    const s = withTask({ check: 'not_on_roster', checkArg: BEA, field: true, proof: 'dm_report', deadline: { day: 25 } });
    s.roster.activeIds = [ANN, BEA];
    unitOf(s, ANN).insight = 'high';
    const r = run(s, reg, { type: 'practice/report', payload: { taskId: 'pt1' } });
    return r.state;
  };
  const sweepAt = (s: CampaignState, day: number) => { const d = structuredClone(s); d.day = day; const events = falseReportSweep(d, ctxOf(d)); return { state: d, events }; };

  it('on exactly the days the roll is below her chance: broken with the stakes one step up, a compromat fact, the event says false', () => {
    const s = falseKept();
    let hits = 0;
    let misses = 0;
    for (let day = 21; day <= 34; day++) {
      const at = structuredClone(s);
      at.day = day;
      const hit = practiceRoll(at, ANN, 'false:pt1') < falseReportChance(at, reg, t1(at));
      const r = sweepAt(s, day);
      expect(r.state.rng).toEqual(s.rng);
      if (hit) {
        hits++;
        expect(t1(r.state).status, `day ${day}`).toBe('broken');
        expect(ofType(r.events, 'task_broken')).toMatchObject([{ taskId: 'pt1', holderId: ANN, falseReport: true, stakes: 'major', via: 'report' }]);
        expect(compromatOf(r.state, ANN)).toHaveLength(1);
        expect(compromatOf(r.state, ANN)[0].text).not.toMatch(/AUTHOR TO WRITE/);
        expect(r.state.practices!.offences[ANN]).toEqual([day]);
        expect(r.state.relations[ANN].history.filter((h) => h.kind === 'event' && h.type === 'task_broken')).toMatchObject([{ severity: 'moderate' }]); // major stakes weigh moderate
      } else {
        misses++;
        expect(t1(r.state).status, `day ${day}`).toBe('kept');
        expect(r.events).toEqual([]);
      }
    }
    expect(hits).toBeGreaterThan(0);
    expect(misses).toBeGreaterThan(0);
  });

  it('the chance is a witness at base plus her insight; nobody to see it and a dull eye give less', () => {
    const s = falseKept();
    const seen = falseReportChance(s, reg, t1(s));
    unitOf(s, ANN).insight = 'low';
    const dull = falseReportChance(s, reg, t1(s));
    expect(dull).toBeLessThan(seen);
    s.expedition = { party: [BEA] } as never; // the witness is out on a run
    expect(falseReportChance(s, reg, t1(s))).toBeLessThan(dull);
  });

  it('is run by the day step (sub-step 4) and a frozen holder is not swept', () => {
    const s = falseKept();
    let day = 0;
    for (let d = 21; d <= 40 && day === 0; d++) { const at = structuredClone(s); at.day = d; if (practiceRoll(at, ANN, 'false:pt1') < falseReportChance(at, reg, t1(at))) day = d; }
    expect(day).toBeGreaterThan(0);
    const d = structuredClone(s);
    d.day = day;
    practiceDayStep(d, ctxOf(d));
    expect(t1(d).status).toBe('broken');
    const frozen = structuredClone(s);
    frozen.day = day;
    frozen.relations[ANN].dynamic!.frame = 'equal';
    expect(falseReportSweep(frozen, ctxOf(frozen))).toEqual([]);
    expect(t1(frozen).status).toBe('kept');
  });

  it('after the window the lie is never found', () => {
    const s = falseKept();
    for (let day = 36; day <= 60; day++) expect(sweepAt(s, day).events).toEqual([]);
  });

  it('is remembered: a fact for her, no draft marker', () => {
    const s = falseKept();
    const rule = [...reg.memoryRules.values()].find((r) => r.id === 'false_report_found')!;
    expect(rule).toMatchObject({ event: 'task_broken', audience: 'her', spread: 'none', importance: 3, when: { falseReport: true } });
    const before = s.memory.facts.length;
    rememberEvents(s, [{ type: 'task_broken', taskId: 'pt1', unitId: ANN, holderId: ANN, stakes: 'major', summary: 'keep Bea off the run', falseReport: true }], reg);
    expect(s.memory.facts.length).toBe(before + 1);
    expect(s.memory.facts.at(-1)!.text).not.toMatch(/AUTHOR TO WRITE/);
    // an honest break is bookkeeping: no fact
    rememberEvents(s, [{ type: 'task_broken', taskId: 'pt1', unitId: ANN, holderId: ANN, stakes: 'minor', summary: 'x' }], reg);
    expect(s.memory.facts.length).toBe(before + 1);
  });
});

describe('a kept model task later broken in a scene is a false report found', () => {
  it('the offer lists a model task kept lately, and the report breaks it with the stakes up', () => {
    const s = withTask({ stakes: 'minor', status: 'kept', settledDay: 20 });
    const offer = practiceIntentInput(s, reg, [ANN], 'scene').practice!;
    expect(offer.tasks.map((t) => t.id)).toEqual(['pt1']);
    const r = apply(s, 'task_broken');
    expect(t1(r.state).status).toBe('broken');
    expect(ofType(r.events, 'task_broken')).toMatchObject([{ taskId: 'pt1', falseReport: true, stakes: 'major' }]);
    expect(compromatOf(r.state, ANN)).toHaveLength(1);
    expect(r.state.practices!.offences[ANN]).toEqual([20]);
  });

  it('a task kept long ago, or by the engine, is not offered; kept again is nothing', () => {
    expect(practiceIntentInput(withTask({ status: 'kept', settledDay: 1 }), reg, [ANN], 'scene').practice?.tasks ?? []).toEqual([]);
    expect(practiceIntentInput(withTask({ status: 'kept', settledDay: 20, check: 'slot_with_her' }), reg, [ANN], 'scene').practice?.tasks ?? []).toEqual([]);
    const kept = withTask({ status: 'kept', settledDay: 20 });
    expect(apply(kept, 'task_kept').events).toEqual([]);
    expect(t1(apply(kept, 'task_kept').state).status).toBe('kept');
  });
});

describe('reportTask is guarded', () => {
  it('throws for a task that is gone, answered or hers while she is not holding', () => {
    const s = withTask({ check: 'dm_report' });
    const d = structuredClone(s);
    expect(() => reportTask(d, ctxOf(d), 'nope')).toThrow();
    t1(d).status = 'kept';
    expect(() => reportTask(d, ctxOf(d), 'pt1')).toThrow();
    const frozen = structuredClone(s);
    frozen.relations[ANN].dynamic!.frame = 'equal';
    expect(() => reportTask(frozen, ctxOf(frozen), 'pt1')).toThrow();
  });
});
