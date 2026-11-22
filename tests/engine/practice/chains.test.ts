import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { hasCommanderPronoun } from '../../../src/engine/dynamic/pronoun';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { settleTask, taskChecksFromEvents } from '../../../src/engine/practice/checks';
import { practiceDayStep } from '../../../src/engine/practice/dayStep';
import { issuePractice } from '../../../src/engine/practice/issue';
import { blankPractices, practiceRoll, type PracticeRequest, type Task } from '../../../src/engine/practice/state';
import { TUNING } from '../../../src/engine/tuning';
import { validatePracticeOutput } from '../../../src/engine/practice/validate';
import { practiceDirectives } from '../../../src/practice/directives';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { loadCore, ofType } from '../../helpers/world';
import { ANN, BEA, CAT, withService, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const task = (over: Partial<Task> = {}): Task => ({
  id: 'pt1', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 2, stakes: 'minor', check: 'model', proof: 'none', text: 'Do it.', summary: 'ask Bea for her ration card',
  status: 'open', acceptForm: 'button_cost', day: 19, answeredDay: 19, ...over,
});
const withTask = (over: Partial<Task> = {}, frame: 'play' | 'role' | 'rule' = 'role', level = 3): CampaignState => {
  const s = withService(world(reg, frame));
  s.practices = { ...blankPractices(), seq: 3, tasks: [task(over)] };
  dynamicOf(s, ANN)!.tracks.service = { xp: 100, level: level as never };
  return s;
};
const ctxOf = (d: CampaignState) => ({ registries: reg, rng: new Rng(d.rng) });
const t = (s: CampaignState, id = 'pt1') => s.practices!.tasks.find((x) => x.id === id)!;
const seedId = (): string => [...reg.practiceSeeds.values()].find((s) => s.kind === 'task' && s.track === 'service')!.id as string;
const raw = (over: Record<string, unknown> = {}) => ({ kind: 'task', tags: ['service'], track: 'service', tier: 2, stakes: 'minor', check: 'model', proof: 'none', text: 'Do this.', summary: 'do this', ...over });
const reqOf = (over: Partial<PracticeRequest> = {}): PracticeRequest => ({ id: 'pq9', holderId: ANN, kind: 'task', day: 21, seedIds: [seedId()], ...over });

/** The day the chain roll of `pt1` hits (and one it misses), with the task kept the day before. */
function chainDays(s: CampaignState): { hit: number; miss: number } {
  let hit = 0;
  let miss = 0;
  for (let d = 2; d <= 80 && (hit === 0 || miss === 0); d++) {
    const at = { ...s, day: d } as CampaignState;
    if (practiceRoll(at, ANN, 'chain:pt1') < TUNING.practice.chainChance) hit ||= d; else miss ||= d;
  }
  expect(hit).toBeGreaterThan(0);
  expect(miss).toBeGreaterThan(0);
  return { hit, miss };
}
const stepAt = (s: CampaignState, day: number) => { const d = structuredClone(s); d.day = day; t(d).settledDay = day - 1; const events = practiceDayStep(d, ctxOf(d)); return { state: d, events }; };

describe('a kept task may continue its chain', () => {
  it('on a day the chain roll hits, the day after it was kept: a request with chainOf, and no rng draw', () => {
    const s = withTask({ chainId: 'pt1', step: 1, status: 'kept', settledDay: 19 });
    const { hit, miss } = chainDays(s);
    const r = stepAt(s, hit);
    expect(r.state.rng).toEqual(s.rng);
    const requests = r.state.practices!.requests.filter((q) => q.kind === 'task');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ holderId: ANN, chainOf: 'pt1' });
    expect(ofType(r.events, 'practice_requested')).toMatchObject([{ holderId: ANN, kind: 'task' }]);
    expect(stepAt(s, miss).state.practices!.requests.filter((q) => q.chainOf === 'pt1')).toEqual([]);
  });

  it('only the day after: a task kept earlier, or today, starts nothing', () => {
    const s = withTask({ chainId: 'pt1', step: 1, status: 'kept', settledDay: 19 });
    const { hit } = chainDays(s);
    const d = structuredClone(s);
    d.day = hit;
    t(d).settledDay = hit - 3;
    practiceDayStep(d, ctxOf(d));
    expect(d.practices!.requests.filter((q) => q.chainOf === 'pt1')).toEqual([]);
    t(d).settledDay = hit;
    practiceDayStep(d, ctxOf(d));
    expect(d.practices!.requests.filter((q) => q.chainOf === 'pt1')).toEqual([]);
  });

  it('the first kept task of a seed starts a chain of its own id', () => {
    const s = withTask({ seedId: seedId(), status: 'kept', settledDay: 19 });
    const { hit } = chainDays(s);
    const r = stepAt(s, hit);
    expect(r.state.practices!.requests.filter((q) => q.kind === 'task')[0]).toMatchObject({ chainOf: 'pt1' });
    expect(t(r.state)).toMatchObject({ chainId: 'pt1', step: 1 });
  });

  it('a task invented with no seed and no chain does not continue; a broken task never does', () => {
    const plain = withTask({ status: 'kept', settledDay: 19 });
    const { hit } = chainDays(plain);
    expect(stepAt(plain, hit).state.practices!.requests.filter((q) => q.chainOf !== undefined)).toEqual([]);
    const broken = withTask({ chainId: 'pt1', step: 1, status: 'broken', settledDay: 19 });
    expect(stepAt(broken, hit).state.practices!.requests.filter((q) => q.chainOf !== undefined)).toEqual([]);
  });

  it('the cap holds: an open task of hers at the cap means no chain request', () => {
    const s = withTask({ chainId: 'pt1', step: 1, status: 'kept', settledDay: 19 }, 'play');
    s.practices!.tasks.push(task({ id: 'pt2', status: 'open' }));
    const { hit } = chainDays(s);
    expect(stepAt(s, hit).state.practices!.requests.filter((q) => q.chainOf === 'pt1')).toEqual([]);
  });

  it('the next task\'s tier is at least the last and at most the track level plus one (the validator clamps)', () => {
    const s = withTask({ chainId: 'pt1', step: 1, tier: 3, status: 'kept', settledDay: 19 }, 'role', 3);
    const request = reqOf({ chainOf: 'pt1' });
    expect(validatePracticeOutput(s, reg, request, raw({ tier: 1 }))!.output.tier).toBe(3); // below the floor, lifted
    expect(validatePracticeOutput(s, reg, request, raw({ tier: 5 }))!.output.tier).toBe(4); // above level + 1, cut
    expect(validatePracticeOutput(s, reg, request, raw({ tier: 4 }))!.output.tier).toBe(4);
    expect(validatePracticeOutput(s, reg, reqOf(), raw({ tier: 1 }))!.output.tier).toBe(1); // no chain: no floor
  });

  it('the issued task is step 2 of the chain', () => {
    const s = withTask({ chainId: 'pt1', step: 1, tier: 2, status: 'kept', settledDay: 19 });
    s.practices!.requests.push(reqOf({ chainOf: 'pt1' }));
    const d = structuredClone(s);
    issuePractice(d, ctxOf(d), 'pq9', validatePracticeOutput(d, reg, reqOf({ chainOf: 'pt1' }), raw({ tier: 1 }))!.output);
    expect(d.practices!.tasks.at(-1)).toMatchObject({ chainId: 'pt1', step: 2, tier: 2 });
  });
});

describe('a third party', () => {
  it('a task naming Bea, Bea present: practice:target:<bea> carries the summary and her own stance', () => {
    const s = withTask({ targetUnitId: BEA });
    const out = practiceDirectives(s, reg, [BEA]);
    const d = out.find((x) => x.id === `practice:target:${BEA}`)!;
    expect(d).toBeDefined();
    expect(d.expiresAfter).toBe('scene');
    expect(d.text).toContain('ask Bea for her ration card');
    expect(d.text).toMatch(/indifferent|drawn|dislikes/);
    expect(d.text).not.toMatch(/AUTHOR TO WRITE|\d/);
    expect(hasCommanderPronoun(d.text)).toBe(false);
    expect(practiceDirectives(s, reg, [CAT]).some((x) => x.id.startsWith('practice:target:'))).toBe(false);
    expect(practiceDirectives(s, reg, [ANN]).some((x) => x.id.startsWith('practice:target:'))).toBe(false);
  });

  it('only while the task is open, and a sealed one says only that it is sealed', () => {
    const offered = withTask({ targetUnitId: BEA, status: 'offered' });
    expect(practiceDirectives(offered, reg, [BEA]).some((x) => x.id.startsWith('practice:target:'))).toBe(false);
    const sealed = withTask({ targetUnitId: BEA, sealed: true });
    const d = practiceDirectives(sealed, reg, [BEA]).find((x) => x.id === `practice:target:${BEA}`)!;
    expect(d.text).toContain('a sealed task');
    expect(d.text).not.toContain('ration card');
  });

  it('kept with Bea present: Bea sees a step behind (her suspicion of Ann rises); with Bea absent, nothing', () => {
    const present = withTask({ targetUnitId: BEA });
    present.scene = { id: 's1', participants: [ANN, BEA], day: present.day } as never;
    const d = structuredClone(present);
    settleTask(d, ctxOf(d), 'pt1', 'kept', 'model');
    expect(d.dynamic!.knowledge[BEA]?.[ANN]?.suspicion ?? 0).toBeGreaterThan(0);
    const broken = structuredClone(present);
    settleTask(broken, ctxOf(broken), 'pt1', 'broken', 'model');
    expect(broken.dynamic!.knowledge[BEA]?.[ANN]?.suspicion ?? 0).toBeGreaterThan(0);
    const away = structuredClone(withTask({ targetUnitId: BEA }));
    away.scene = { id: 's1', participants: [ANN, CAT], day: away.day } as never;
    settleTask(away, ctxOf(away), 'pt1', 'kept', 'model');
    expect(away.dynamic!.knowledge[BEA]?.[ANN]?.suspicion ?? 0).toBe(0);
    const noScene = structuredClone(withTask({ targetUnitId: BEA }));
    settleTask(noScene, ctxOf(noScene), 'pt1', 'kept', 'engine');
    expect(noScene.dynamic!.knowledge[BEA]?.[ANN]?.suspicion ?? 0).toBe(0);
  });

  it('the validator takes a target from the card only if she is a living named unit other than the holder; a roster check\'s unit is the target', () => {
    const s = withTask();
    expect(validatePracticeOutput(s, reg, reqOf(), raw({ targetId: BEA }))!.output.targetUnitId).toBe(BEA);
    expect(validatePracticeOutput(s, reg, reqOf(), raw({ targetId: ANN }))!.output.targetUnitId).toBeUndefined();
    expect(validatePracticeOutput(s, reg, reqOf(), raw({ targetId: 'unit_nobody' }))!.output.targetUnitId).toBeUndefined();
    const d = structuredClone(s);
    d.practices!.requests.push(reqOf());
    issuePractice(d, ctxOf(d), 'pq9', validatePracticeOutput(d, reg, reqOf(), raw({ targetId: BEA }))!.output);
    expect(d.practices!.tasks.at(-1)!.targetUnitId).toBe(BEA);
    const e = structuredClone(s);
    e.practices!.requests.push(reqOf());
    issuePractice(e, ctxOf(e), 'pq9', validatePracticeOutput(e, reg, reqOf(), raw({ check: 'not_on_roster', checkArg: CAT }))!.output);
    expect(e.practices!.tasks.at(-1)).toMatchObject({ check: 'not_on_roster', checkArg: CAT, targetUnitId: CAT, field: true });
  });
});

describe('field tasks', () => {
  it('not_on_roster of Bea: kept when the report\'s party lacks her, broken when she went', () => {
    const s = withTask({ check: 'not_on_roster', checkArg: BEA, targetUnitId: BEA, field: true, deadline: { day: 25 } });
    const ended = (party: string[]) => {
      const d = structuredClone(s);
      d.lastExpedition = { id: 'rep_1', party } as never;
      const events = taskChecksFromEvents(d, ctxOf(d), [{ type: 'expedition_ended', outcome: 'success', reportId: 'rep_1' }]);
      return { state: d, events };
    };
    expect(t(ended([ANN, CAT]).state).status).toBe('kept');
    expect(ofType(ended([ANN, CAT]).events, 'task_kept')).toHaveLength(1);
    expect(t(ended([ANN, BEA]).state).status).toBe('broken');
  });

  it('only take roster checks: the validator clamps a slot check with the field flag to on_roster', () => {
    const s = withTask();
    const out = validatePracticeOutput(s, reg, reqOf(), raw({ check: 'slot_with_her', field: true, checkArg: BEA }))!.output;
    expect(out).toMatchObject({ check: 'on_roster', checkArg: BEA });
    const d = structuredClone(s);
    d.practices!.requests.push(reqOf());
    issuePractice(d, ctxOf(d), 'pq9', out);
    expect(d.practices!.tasks.at(-1)).toMatchObject({ field: true, check: 'on_roster', targetUnitId: BEA });
    // with no unit to judge the flag is ignored: the check stays what the card said
    expect(validatePracticeOutput(s, reg, reqOf(), raw({ check: 'slot_with_her', field: true }))!.output.check).toBe('slot_with_her');
  });
});
