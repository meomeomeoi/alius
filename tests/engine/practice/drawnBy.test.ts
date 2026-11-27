/**
 * P15b Task 5 (spec §2, planning rulings 7 and 8): what draws her (a small favour on the matching outcome), the practice history per pair
 * (`dynamic.practised`, written only for a holder with a manner) and "something new" (curiosity turns a hashed share of requests into a filter
 * on the seed pool; the brief says so).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { regardFromEvents } from '../../../src/engine/dynamic/regard';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import type { DrawnBy, MannerAxis } from '../../../src/engine/dynamic/types';
import { requestPractice, wantsFresh } from '../../../src/engine/practice/request';
import { seedPool, pickSeeds } from '../../../src/engine/practice/seeds';
import { settleTask } from '../../../src/engine/practice/checks';
import { compromiseTask } from '../../../src/engine/practice/tasks';
import { buildPracticeInput } from '../../../src/engine/practice/validate';
import { blankPractices, type OpenPunishment, type Task } from '../../../src/engine/practice/state';
import { getCallType } from '../../../src/llm/callTypes';
import '../../../src/llm/calls/all';
import { hasCommanderPronoun } from '../../../src/engine/dynamic/pronoun';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { errors, loadCore, run } from '../../helpers/world';
import { ANN, unitOf, withService, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ZERO: Record<MannerAxis, number> = { intensity: 0, warmth: 0, order: 0, voice: 0, tempo: 0, curiosity: 0 };
const ctxOf = (d: CampaignState) => ({ registries: reg, rng: new Rng(d.rng) });
/** Ann (role, service on) with `axes` and `drawnBy` (absent `axes`: no manner block at all). */
function holder(axes: Partial<Record<MannerAxis, number>> | null, drawnBy: DrawnBy[] = []): CampaignState {
  const s = withService(world(reg, 'role'));
  const p = unitOf(s, ANN).bond!.practice!;
  if (axes !== null) p.manner = { ...ZERO, ...axes };
  if (drawnBy.length > 0) p.drawnBy = drawnBy;
  return s;
}
const favour = (s: CampaignState): number => dynamicOf(s, ANN)!.favour;
const MAIN = TUNING.manner.favour.main;
const SECOND = TUNING.manner.favour.second;

const task = (over: Partial<Task> = {}): Task => ({
  id: 'pt1', holderId: ANN, kind: 'task', seedId: 'task_forms_of_address', tags: ['service'], track: 'service', tier: 1, stakes: 'trivial', check: 'model', proof: 'none', text: 'Carry the roster to me.', summary: 'carry the roster',
  status: 'offered', acceptForm: 'button', day: 20, ...over,
});
const withTask = (s: CampaignState, over: Partial<Task> = {}): CampaignState => {
  s.practices = { ...blankPractices(), seq: 2, tasks: [task(over)] };
  return s;
};
const answerTask = (s: CampaignState, a: string) => run(s, reg, { type: 'practice/answer_task', payload: { taskId: 'pt1', answer: a } });

describe('drawnBy: power, an accept at the first offer', () => {
  it('a task accepted at once gives +1 to the main one and +0.5 to the second, once', () => {
    const main = answerTask(withTask(holder({}, ['power'])), 'accept');
    expect(errors(main.events)).toEqual([]);
    const base = favour(answerTask(withTask(holder({})), 'accept').state);
    expect(favour(main.state) - base).toBe(MAIN);
    const second = answerTask(withTask(holder({}, ['pain', 'power'])), 'accept');
    expect(favour(second.state) - base).toBe(SECOND);
  });
  it('nothing without drawnBy, without power among them or without a manner', () => {
    const base = favour(answerTask(withTask(holder(null)), 'accept').state);
    expect(favour(answerTask(withTask(holder({})), 'accept').state)).toBe(base);
    expect(favour(answerTask(withTask(holder({}, ['pain'])), 'accept').state)).toBe(base);
    expect(favour(answerTask(withTask(holder(null, ['power'])), 'accept').state)).toBe(base);
  });
  it('a task accepted after a talk or a compromise is not at the first offer', () => {
    const base = favour(answerTask(withTask(holder({})), 'accept').state);
    const talked = answerTask(answerTask(withTask(holder({}, ['power'])), 'talk').state, 'accept');
    expect(favour(talked.state)).toBe(base);
    const compromised = withTask(holder({}, ['power']), { stakes: 'minor', acceptForm: 'button_cost' });
    compromiseTask(compromised, ctxOf(compromised), ANN, { taskId: 'pt1', text: 'Carry half of it.' });
    expect(compromised.practices!.tasks[0].talked).toBe(true);
    expect(favour(answerTask(compromised, 'accept').state)).toBe(base);
  });
  it('the talk is noted only for a holder with a manner', () => {
    const d = answerTask(withTask(holder(null)), 'talk').state;
    expect(d.practices!.tasks[0]).not.toHaveProperty('talked');
    const c = withTask(holder(null), { stakes: 'minor', acceptForm: 'button_cost' });
    compromiseTask(c, ctxOf(c), ANN, { taskId: 'pt1', text: 'Carry half of it.' });
    expect(c.practices!.tasks[0]).not.toHaveProperty('talked');
  });
  it('a punishment accepted at the first offer; not after a negotiation, nor an escalated one', () => {
    const pun = (over: Partial<OpenPunishment> = {}): CampaignState => {
      const s = holder({}, ['power']);
      s.practices = { ...blankPractices(), seq: 5, punishments: [{ id: 'pp1', holderId: ANN, entryId: 'kept_in_quarters', severity: 2, offence: { kind: 'task_broken', ref: 'pt1', stakes: 'minor', day: 20 }, text: 'Stand there.', summary: 'stand there', status: 'offered', day: 20, ...over }] };
      dynamicOf(s, ANN)!.hold = 60;
      return s;
    };
    const ans = (s: CampaignState, a: string) => run(s, reg, { type: 'practice/answer_punishment', payload: { punishmentId: 'pp1', answer: a } });
    const none = holder({}); none.practices = pun().practices;
    const base = favour(ans(none, 'accept').state);
    expect(favour(ans(pun(), 'accept').state) - base).toBe(MAIN);
    expect(favour(ans(ans(pun(), 'negotiate').state, 'accept').state)).toBe(base);
    expect(favour(ans(pun({ escalated: true }), 'accept').state)).toBe(base);
  });
});

describe('drawnBy: what she sees in a physics run (regardFromEvents)', () => {
  const batch = (s: CampaignState, events: Array<Record<string, unknown>>) => { regardFromEvents(s, reg, events as never); return s; };
  const seg = (warning: boolean) => ({ type: 'physics_segment', runId: 'p1', n: 1, phase: 'end', warning });
  const outcome = (result: string) => ({ type: 'physics_outcome', runId: 'p1', physicsId: 'jaw', holderId: ANN, result, segments: 2, sourceKind: 'contact', sourceId: 'x' });
  const delta = (s: CampaignState, events: Array<Record<string, unknown>>) => {
    const before = favour(s);
    batch(s, events);
    return favour(s) - before;
  };
  const live = (s: CampaignState): CampaignState => { s.scene = { physics: { id: 'p1', holderId: ANN } } as never; return s; };

  it('pain: a clean end after a segment with a warning, +1 main / +0.5 second', () => {
    expect(delta(live(holder({}, ['pain'])), [seg(true), outcome('released')])).toBe(MAIN);
    expect(delta(live(holder({}, ['discipline', 'pain'])), [seg(true), outcome('checked')])).toBe(MAIN * 1 + SECOND); // discipline (main) is the clean end too
    expect(delta(live(holder({}, ['pain'])), [seg(false), outcome('released')])).toBe(0);
    expect(delta(live(holder({}, ['pain'])), [seg(true), outcome('stopped')])).toBe(0);
  });
  it('pain: the warning comes in an earlier action; a dirty run or another run does not count', () => {
    const s = live(holder({}, ['pain']));
    expect(delta(s, [seg(true)])).toBe(0);
    expect(delta(s, [outcome('released')])).toBe(MAIN);
    const dirty = live(holder({}, ['pain']));
    expect(delta(dirty, [seg(true), { type: 'physics_slip', runId: 'p1', kind: 'slip', count: 1, holderId: ANN }, outcome('released')])).not.toBe(MAIN);
    const other = live(holder({}, ['pain']));
    expect(delta(other, [seg(true), { ...outcome('released'), runId: 'p2' }])).toBe(0);
  });
  it('discipline: a clean released or checked end (no slip, no caught cheat), once', () => {
    expect(delta(live(holder({}, ['discipline'])), [seg(false), outcome('released')])).toBe(MAIN);
    expect(delta(live(holder({}, ['discipline'])), [outcome('checked')])).toBe(MAIN);
    expect(delta(live(holder({}, ['discipline'])), [outcome('stopped')])).toBe(0);
    expect(delta(live(holder({}, ['discipline'])), [{ type: 'physics_caught', runId: 'p1', holderId: ANN }, outcome('released')])).toBe(0);
  });
  it('reaction: a slip that is not a caught cheat', () => {
    expect(delta(holder({}, ['reaction']), [{ type: 'physics_slip', runId: 'p1', kind: 'slip', count: 1, holderId: ANN }])).toBe(MAIN);
    expect(delta(holder({}, ['reaction']), [{ type: 'physics_caught', runId: 'p1', holderId: ANN }])).toBe(0);
    expect(delta(holder({}, ['pain', 'reaction']), [{ type: 'physics_slip', runId: 'p1', kind: 'slip', count: 1, holderId: ANN }])).toBe(SECOND);
  });
  it('nothing without drawnBy or a manner, and no note is left behind', () => {
    for (const s of [holder({}), holder(null, ['pain', 'discipline', 'reaction'])]) {
      live(s);
      expect(delta(s, [seg(true), { type: 'physics_slip', runId: 'p1', kind: 'slip', count: 1, holderId: ANN }, outcome('released')])).toBe(0);
    }
    const plain = live(holder(null));
    batch(plain, [seg(true), outcome('released')]);
    expect(JSON.stringify(plain.dynamic!.noted ?? {})).not.toContain('warned');
  });
});

describe('dynamic.practised', () => {
  it('a kept task writes its seed and its categories for a holder with a manner, and nothing otherwise', () => {
    const kept = (s: CampaignState) => { const d = withTask(s, { status: 'open' }); settleTask(d, ctxOf(d), 'pt1', 'kept', 'model'); return d; };
    expect(dynamicOf(kept(holder({})), ANN)!.practised).toEqual({ kinds: ['task_forms_of_address'], categories: ['service'] });
    expect(dynamicOf(kept(holder(null)), ANN)!.practised).toBeUndefined();
    expect(favour(kept(holder({}, ['discovery']))) - favour(kept(holder({})))).toBe(MAIN); // the first practice of a kind
  });
  it('the second one of a kind is not a discovery, and the lists hold each once', () => {
    const s = withTask(holder({}, ['discovery']), { status: 'open' });
    s.practices!.tasks.push(task({ id: 'pt2', status: 'open' }));
    settleTask(s, ctxOf(s), 'pt1', 'kept', 'model');
    const after = favour(s);
    settleTask(s, ctxOf(s), 'pt2', 'kept', 'model');
    expect(favour(s) - after).toBe(1); // only the +1 a kept task gives
    expect(dynamicOf(s, ANN)!.practised).toEqual({ kinds: ['task_forms_of_address'], categories: ['service'] });
  });
  it('a broken task writes nothing', () => {
    const d = withTask(holder({}), { status: 'open' });
    settleTask(d, ctxOf(d), 'pt1', 'broken', 'model');
    expect(dynamicOf(d, ANN)!.practised).toBeUndefined();
  });
});

describe('something new: curiosity', () => {
  it('+2 asks for something new about 40 % of the time over 200 request keys, +1 about 20 %; 0 and below never', () => {
    const rate = (axes: Partial<Record<MannerAxis, number>> | null) => {
      const s = holder(axes);
      let n = 0;
      for (let i = 0; i < 200; i++) if (wantsFresh(s, reg, ANN, `pq${i}`)) n++;
      return n / 200;
    };
    expect(Math.abs(rate({ curiosity: 2 }) - 0.4)).toBeLessThanOrEqual(0.08);
    expect(Math.abs(rate({ curiosity: 1 }) - 0.2)).toBeLessThanOrEqual(0.08);
    for (const c of [0, -1, -2]) expect(rate({ curiosity: c })).toBe(0);
    expect(rate(null)).toBe(0);
  });
  it('is hashed: the same key gives the same answer, and the rng is untouched', () => {
    const s = holder({ curiosity: 2 });
    const rng = JSON.stringify(s.rng);
    const a = Array.from({ length: 30 }, (_, i) => wantsFresh(s, reg, ANN, `pq${i}`));
    expect(Array.from({ length: 30 }, (_, i) => wantsFresh(s, reg, ANN, `pq${i}`))).toEqual(a);
    expect(JSON.stringify(s.rng)).toBe(rng);
  });

  const practisedWith = (s: CampaignState, kinds: string[], categories: string[]) => { dynamicOf(s, ANN)!.practised = { kinds, categories }; return s; };
  it('fresh filters the pool to seeds with a category she has not practised, then to a seed she has not done, and falls back to the whole pool', () => {
    const s = holder({ curiosity: 2 });
    s.content = { enabled: [...(s.content?.enabled ?? []), 'denial', 'restraint'] };
    const pool = seedPool(s, reg, ANN, 'task').map((x) => x.id);
    expect(pool.length).toBeGreaterThan(2);
    const seen = new Set<string>();
    for (let d = 1; d < 60; d++) { s.day = d; for (const id of pickSeeds(s, reg, ANN, 'task', { fresh: true })) seen.add(id); }
    expect([...seen].every((id) => pool.includes(id))).toBe(true);
    // she has done the first seed and every category its pool has: only the unpractised seeds remain
    const first = pool[0];
    const tagsOf = (id: string) => (reg.practiceSeeds.get(id) as unknown as { contentTags: string[] }).contentTags;
    practisedWith(s, [first], tagsOf(first));
    seen.clear();
    for (let d = 1; d < 60; d++) { s.day = d; for (const id of pickSeeds(s, reg, ANN, 'task', { fresh: true })) seen.add(id); }
    expect(seen.has(first)).toBe(false);
    // everything is practised: the whole pool again
    practisedWith(s, pool, ['service', 'denial', 'restraint', 'humiliation', 'public_humiliation', 'physical_discipline_shown']);
    seen.clear();
    for (let d = 1; d < 60; d++) { s.day = d; for (const id of pickSeeds(s, reg, ANN, 'task', { fresh: true })) seen.add(id); }
    expect(seen.size).toBeGreaterThan(0);
    expect([...seen].every((id) => pool.includes(id))).toBe(true);
  });
  it('without fresh nothing changes, practised or not', () => {
    const s = holder({ curiosity: 2 });
    const a = pickSeeds(s, reg, ANN, 'task');
    practisedWith(s, seedPool(s, reg, ANN, 'task').map((x) => x.id), ['service']);
    expect(pickSeeds(s, reg, ANN, 'task')).toEqual(a);
    expect(pickSeeds(holder(null), reg, ANN, 'task', { fresh: true })).toEqual(pickSeeds(holder(null), reg, ANN, 'task'));
  });

  /** A key whose hashed roll turns "new" on for this holder. */
  const freshKey = (s: CampaignState): number => { for (let n = 0; n < 500; n++) { s.practices = { ...blankPractices(), seq: n }; if (wantsFresh(s, reg, ANN, `pq${n}`)) return n; } throw new Error('none'); };
  const askFor = (s: CampaignState) => { const d = structuredClone(s); requestPractice(d, ctxOf(d), ANN, 'task'); return d; };
  it('requestPractice makes the key before the pick: the request id is the key, and the request says it is new only when something new stood', () => {
    const s = holder({ curiosity: 2 });
    const n = freshKey(s);
    dynamicOf(s, ANN)!.practised = { kinds: [], categories: [] };
    const d = askFor(s);
    expect(d.practices!.requests.at(-1)).toMatchObject({ id: `pq${n}`, fresh: true });
    // nothing new left: she asks anyway, from the whole pool, and the request does not claim it is new
    const all = holder({ curiosity: 2 });
    const m = freshKey(all);
    dynamicOf(all, ANN)!.practised = { kinds: seedPool(all, reg, ANN, 'task').map((x) => x.id), categories: ['service', 'denial', 'restraint', 'humiliation', 'public_humiliation', 'physical_discipline_shown'] };
    const e = askFor(all);
    expect(e.practices!.requests.at(-1)).toMatchObject({ id: `pq${m}` });
    expect(e.practices!.requests.at(-1)).not.toHaveProperty('fresh');
    expect(e.practices!.requests.at(-1)!.seedIds.length).toBeGreaterThan(0);
  });
  it('without a manner the request is what it was: the seeds of pickSeeds, no fresh, the same id', () => {
    const s = holder(null);
    s.practices = { ...blankPractices(), seq: 7 };
    const d = askFor(s);
    const r = d.practices!.requests[0];
    expect(r.id).toBe('pq7');
    expect(r.seedIds).toEqual(pickSeeds(s, reg, ANN, 'task'));
    expect(r).not.toHaveProperty('fresh');
    expect(d.practices!.seq).toBe(8);
  });
});

describe('the brief', () => {
  const prompt = (s: CampaignState, request: Parameters<typeof buildPracticeInput>[2]): string => {
    const input = buildPracticeInput(s, reg, request, 'A sergeant.');
    return (getCallType('practice_generate') as unknown as { prompt: (raw: unknown) => string }).prompt(input);
  };
  const requestOf = (s: CampaignState) => { const d = structuredClone(s); requestPractice(d, ctxOf(d), ANN, 'task'); return { d, request: d.practices!.requests[0] }; };

  it('carries her manner words and what draws her, and nothing without a manner', () => {
    const { d, request } = requestOf(holder({ tempo: 2, warmth: -1, curiosity: 1 }, ['power', 'discipline']));
    const text = prompt(d, request);
    expect(text).toContain('sudden');
    expect(text).toContain('cool, little comfort');
    expect(text).toContain('the commander giving way to her');
    expect(text).toContain('it done right, cleanly');
    const plain = requestOf(holder(null));
    expect(prompt(plain.d, plain.request)).not.toMatch(/What draws her/);
    expect(buildPracticeInput(plain.d, reg, plain.request)).not.toHaveProperty('manner');
    expect(buildPracticeInput(plain.d, reg, plain.request)).not.toHaveProperty('fresh');
  });
  it('an axis at 0 says nothing, and a manner of all zeros with no drawnBy adds no line', () => {
    const { d, request } = requestOf(holder({}));
    expect(prompt(d, request)).not.toMatch(/How she does it|What draws her/);
  });
  it('says "something new" when the request is fresh, and not otherwise', () => {
    const { d, request } = requestOf(holder({ curiosity: 0, tempo: 1 }));
    expect(request).not.toHaveProperty('fresh');
    expect(prompt(d, request)).not.toMatch(/something new/i);
    expect(prompt(d, { ...request, fresh: true })).toMatch(/something new/i);
  });
  it('gives the commander no pronoun and no feeling', () => {
    for (const drawn of [['pain', 'power'], ['reaction', 'discipline'], ['discovery']] as DrawnBy[][]) {
      const { d, request } = requestOf(holder({ tempo: 2, warmth: 2, curiosity: 2, intensity: -2, voice: 2, order: -2 }, drawn));
      const mine = prompt(d, { ...request, fresh: true }).split('\n').filter((l) => /^(How she does it|What draws her|This one is something new)/.test(l)).join(' ');
      expect(mine).not.toBe('');
      expect(hasCommanderPronoun(mine)).toBe(false);
    }
  });
});
