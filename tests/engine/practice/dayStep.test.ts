import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/practice';
import { newPracticeChance, practiceDayStep } from '../../../src/engine/practice/dayStep';
import { issuePractice, requestPractice } from '../../../src/engine/practice/issue';
import { fallbackLine } from '../../../src/engine/practice/seeds';
import { practiceRoll, type Task } from '../../../src/engine/practice/state';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { endDay } from '../../helpers/loyalty';
import { errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, unitOf, withBea, withService, withWant, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ctxOf = (d: CampaignState) => ({ registries: reg, rng: new Rng(d.rng) });
const step = (s: CampaignState) => {
  const d = structuredClone(s);
  const events = practiceDayStep(d, ctxOf(d));
  return { state: d, events };
};
const task = (over: Partial<Task> = {}): Task => ({
  id: 'ptx', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'minor', check: 'model', proof: 'none', text: 't', summary: 's', status: 'open',
  acceptForm: 'button_cost', day: 1, ...over,
});

describe('a new practice comes by the hashed roll', () => {
  it('the chance is base × frequency × demand × want × appetite', () => {
    const s = withWant(withService(world(reg, 'role'), 'craves'), 75); // aching
    for (const c of Object.values(unitOf(s, ANN).bond!.practice!.categories)) c.as = 'craves';
    expect(newPracticeChance(s, reg, ANN)).toBeCloseTo(0.25 * 1 * 1 * 1.3 * 1.4, 10);
    s.dynamic!.setup.frequency = 'often';
    expect(newPracticeChance(s, reg, ANN)).toBeCloseTo(0.25 * 1.6 * 1.3 * 1.4, 10);
  });

  it('a request is written exactly on the days the roll is below the chance, and the rng is not touched', () => {
    const s = withWant(withService(world(reg, 'role'), 'craves'), 75);
    for (const c of Object.values(unitOf(s, ANN).bond!.practice!.categories)) c.as = 'craves';
    const p = newPracticeChance(s, reg, ANN);
    let below = 0;
    let above = 0;
    for (let d = 1; d <= 60; d++) {
      s.day = d;
      const hit = practiceRoll(s, ANN, 'new') < p;
      const { state, events } = step(s);
      expect(state.rng).toEqual(s.rng);
      if (hit) { below++; expect(ofType(events, 'practice_requested'), `day ${d}`).toHaveLength(1); expect(state.practices!.requests).toHaveLength(1); }
      else { above++; expect(ofType(events, 'practice_requested'), `day ${d}`).toHaveLength(0); expect(state.practices?.requests ?? []).toHaveLength(0); }
    }
    expect(below).toBeGreaterThan(5);
    expect(above).toBeGreaterThan(5);
  });

  it('a holder with no appetite gap reads her frame and her want band (play 0.15, calm 0.8, enjoys 1)', () => {
    const s = withService(world(reg, 'play'));
    for (const c of Object.values(unitOf(s, ANN).bond!.practice!.categories)) c.as = 'enjoys';
    expect(newPracticeChance(s, reg, ANN)).toBeCloseTo(0.15 * 0.8, 10);
    expect(newPracticeChance(world(reg, 'equal'), reg, ANN)).toBe(0);
  });

  it('one request a day per holder: a second run the same day writes none', () => {
    const s = withService(world(reg, 'role'), 'craves');
    s.relations[ANN].want = 100;
    let day = 0;
    for (let d = 1; d <= 80 && day === 0; d++) { s.day = d; if (practiceRoll(s, ANN, 'new') < newPracticeChance(s, reg, ANN)) day = d; }
    expect(day).toBeGreaterThan(0);
    s.day = day;
    const once = step(s).state;
    expect(once.practices!.requests).toHaveLength(1);
    const twice = step(once).state;
    expect(twice.practices!.requests).toHaveLength(1);
    expect(twice.practices!.requests[0].id).toBe(once.practices!.requests[0].id);
  });

  it('the task cap holds: two open tasks at role mean no task request', () => {
    const s = withService(world(reg, 'role'), 'craves');
    s.relations[ANN].want = 100;
    s.practices = { seq: 5, requests: [], tasks: [task({ id: 'pt1' }), task({ id: 'pt2' })], punishments: [], demonstrations: [], restrictions: [], cold: {}, postures: {}, offences: {}, records: [], handovers: [] };
    for (let d = 1; d <= 60; d++) { s.day = d; expect(step(s).state.practices!.requests.filter((r) => r.kind === 'task')).toEqual([]); }
  });

  it('at play one open task is the cap too', () => {
    const s = withService(world(reg, 'play'), 'craves');
    s.practices = { seq: 5, requests: [], tasks: [task({ id: 'pt1' })], punishments: [], demonstrations: [], restrictions: [], cold: {}, postures: {}, offences: {}, records: [], handovers: [] };
    for (let d = 1; d <= 60; d++) { s.day = d; expect(step(s).state.practices!.requests).toEqual([]); }
  });

  it('a holder whose frame fell is frozen: no request', () => {
    const s = withService(world(reg, 'play'), 'craves');
    s.relations[ANN].dynamic!.frame = 'equal';
    for (let d = 1; d <= 30; d++) { s.day = d; expect(step(s).events).toEqual([]); }
  });

  it('two holders are each asked their own roll', () => {
    const s = withBea(withService(world(reg, 'role'), 'craves'));
    unitOf(s, 'unit_bea').bond!.practice!.categories.service = { as: 'craves', witness: 'indifferent' };
    s.content = { enabled: [...s.content!.enabled, 'service'] };
    const seen = new Set<string>();
    for (let d = 1; d <= 80; d++) { s.day = d; for (const r of step(s).state.practices?.requests ?? []) seen.add(r.holderId); }
    expect(seen.has(ANN)).toBe(true);
    expect(seen.has('unit_bea')).toBe(true);
  });
});

describe('an old request falls back at the day end', () => {
  function withRequest(day: number): { s: CampaignState; id: string } {
    const s = withService(world(reg, 'role'));
    s.day = day;
    const d = structuredClone(s);
    const events = requestPractice(d, ctxOf(d), ANN, 'task');
    expect(ofType(events, 'practice_requested')).toHaveLength(1);
    return { s: d, id: d.practices!.requests[0].id };
  }

  it('a request from yesterday is issued as the plain fallback task', () => {
    const { s, id } = withRequest(20);
    expect(s.practices!.requests[0].seedIds.length).toBeGreaterThanOrEqual(3);
    s.day = 21;
    const { state, events } = step(s);
    expect(state.practices!.requests).toEqual([]);
    expect(ofType(events, 'task_issued')).toHaveLength(1);
    const t = state.practices!.tasks[0];
    const seed = reg.practiceSeeds.get(s.practices!.requests[0].seedIds[0]) as unknown as { id: string; gist: string };
    expect(t).toMatchObject({ plain: true, seedId: seed.id, summary: seed.gist, text: fallbackLine('task', seed.gist), status: 'offered', holderId: ANN, day: 21 });
    expect(id).toMatch(/^pq/);
    expect(t.id).toMatch(/^pt/);
  });

  it('a request of today is left for the controller', () => {
    const { s } = withRequest(20);
    const { state, events } = step(s);
    expect(state.practices!.requests).toHaveLength(1);
    expect(ofType(events, 'task_issued')).toEqual([]);
  });

  it('a seed that is no longer allowed gives no practice and drops the request', () => {
    const { s } = withRequest(20);
    s.practices!.requests[0].seedIds = s.practices!.requests[0].seedIds.slice(0, 1);
    s.content = { enabled: ['restraint', 'denial'] }; // service is off now
    s.day = 21;
    const { state, events } = step(s);
    expect(state.practices?.tasks ?? []).toEqual([]);
    expect(ofType(events, 'task_issued')).toEqual([]);
    expect(state.practices?.requests ?? []).toEqual([]);
  });

  it('issuing with a card writes the card, the deadline from its days and the accept form by stakes', () => {
    const { s, id } = withRequest(20);
    const d = structuredClone(s);
    const seed = reg.practiceSeeds.get(d.practices!.requests[0].seedIds[0]) as unknown as { id: string; gist: string; track: string };
    issuePractice(d, ctxOf(d), id, {
      kind: 'task', seedId: seed.id, tags: ['service'], track: seed.track, tier: 1, stakes: 'major', check: 'on_roster', proof: 'witness', deadline: { days: 2, slot: 'evening' }, text: 'Do it.', summary: 'do it',
    });
    expect(d.practices!.tasks[0]).toMatchObject({ acceptForm: 'words', deadline: { day: 22, slot: 'evening' }, field: true, text: 'Do it.', summary: 'do it' });
    expect(d.practices!.tasks[0].plain).toBeUndefined();
  });

  it('a request that is gone, a card of another kind, a holder not holding: refused', () => {
    const { s, id } = withRequest(20);
    expect(() => issuePractice(structuredClone(s), ctxOf(s), 'pq99', 'fallback')).toThrow(/gone/);
    const d = structuredClone(s);
    expect(() => issuePractice(d, ctxOf(d), id, { kind: 'protocol', tags: ['service'], track: 'service', tier: 1, stakes: 'trivial', check: 'model', proof: 'none', text: 'x', summary: 'x' })).toThrow(/another kind/);
    const frozen = structuredClone(s);
    frozen.relations[ANN].dynamic!.frame = 'equal';
    expect(() => issuePractice(frozen, ctxOf(frozen), id, 'fallback')).toThrow(/not holding/);
  });

  it('the action practice/issue runs the same path and an end of day through the pipeline keeps the rng', () => {
    const { s, id } = withRequest(20);
    const issued = run(s, reg, { type: 'practice/issue', payload: { requestId: id } });
    expect(errors(issued.events)).toEqual([]);
    expect(issued.state.practices!.tasks[0].plain).toBe(true);
    const next = endDay(withService(world(reg, 'role')), reg); // the real hook runs and leaves no error behind
    expect(next.day).toBe(21);
  });
});

describe('nothing live, nothing happens', () => {
  it('returns [] and leaves state.practices absent', () => {
    const s = world(reg, 'equal');
    const { state, events } = step(s);
    expect(events).toEqual([]);
    expect(state.practices).toBeUndefined();
    expect(state).toEqual(s);
  });

  it('a day end through the pipeline for a campaign with no holder at play writes nothing', () => {
    const s = world(reg, 'equal');
    const next = endDay(s, reg);
    expect(next.practices).toBeUndefined();
  });
});

describe('expiry and trimming', () => {
  it('restrictions and cold shoulders past their day go, closed tasks are trimmed to the newest 30 and open ones stay', () => {
    const s = withService(world(reg, 'role'));
    s.practices = {
      seq: 100, requests: [], tasks: Array.from({ length: 40 }, (_, i) => task({ id: `pt${i}`, status: i === 3 ? 'open' : 'kept' })), punishments: [], demonstrations: [],
      restrictions: [{ holderId: ANN, what: 'no_dms_others', untilDay: 19 }, { holderId: ANN, what: 'no_free_activities', untilDay: 20 }], cold: { [ANN]: 19, unit_bea: 22 }, postures: {}, offences: {}, records: [], handovers: [],
    };
    const { state } = step(s);
    expect(state.practices!.restrictions.map((r) => r.what)).toEqual(['no_free_activities']);
    expect(state.practices!.cold).toEqual({ unit_bea: 22 });
    expect(state.practices!.tasks).toHaveLength(31); // 30 closed + the open one
    expect(state.practices!.tasks.some((t) => t.id === 'pt3')).toBe(true);
    expect(state.practices!.tasks.some((t) => t.id === 'pt0')).toBe(false);
  });
});
