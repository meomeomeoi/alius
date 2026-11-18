import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { Rng } from '../../src/engine/rng';
import { answerVisit, intelOf, lapseVisit, paymentFor } from '../../src/engine/special/debts/intel';
import { rollVisit } from '../../src/engine/special/debts/handler';
import { forgetSpecial, HANDLER_UNIT, HANDLER_VISIT_KIND, type IntelAnswer, type IntelItem } from '../../src/engine/special/state';
import type { CampaignState, NightEntry } from '../../src/engine/state/types';
import { endDay } from '../helpers/loyalty';
import { loadCore, run } from '../helpers/world';
import { ANN, BEA, specialCampaign } from '../helpers/special';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ctxOf = (s: CampaignState) => ({ registries: reg, rng: new Rng(s.rng) });
const debts = (s: CampaignState) => s.special!.debts!;
const item = (kind: IntelItem['kind'], refId: string): IntelItem => ({ id: `${kind}:${refId}`, kind, refId, label: `${kind} ${refId}` });
const ITEMS = [item('squad', ANN), item('squad', BEA), item('mission_done', 'm1'), item('base', 'medbay'), item('plan', 'm2')];

/** A campaign with the handler waiting at the gate (the visit open, its night entry the night event). */
function visiting(items: IntelItem[] = ITEMS): CampaignState {
  const s = specialCampaign(reg, 'web_of_debts');
  debts(s).visit = { id: 'hv1', day: s.day, items };
  debts(s).visitSeq = 1;
  s.slot = 'night';
  const entry: NightEntry = { id: 'n_v', unitId: HANDLER_UNIT, kind: HANDLER_VISIT_KIND, priority: 6, framing: 'A visitor at the gate.', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: s.day + 2 };
  s.calendar.nightEvent = entry;
  return s;
}
const all = (a: IntelAnswer, items = ITEMS): Record<string, IntelAnswer> => Object.fromEntries(items.map((i) => [i.id, a]));
const answer = (s: CampaignState, answers: Record<string, unknown>, visitId = 'hv1') => run(s, reg, { type: 'debts/answer_visit', payload: { visitId, answers } });

describe('intelOf', () => {
  it('offers at most five items with stable ids kind:refId, one of each kind at most', () => {
    const s = specialCampaign(reg, 'web_of_debts');
    s.missions.completed.push({ id: 'm_done', title: 'Clear the yard', outcomeDay: s.day, status: 'completed', regionId: 'quarantine_d7' } as never);
    const items = intelOf(s, reg);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.length).toBeLessThanOrEqual(5);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    for (const i of items) expect(i.id).toBe(`${i.kind}:${i.refId}`);
    expect(new Set(items.map((i) => i.kind)).size).toBe(items.length);
    expect(items.find((i) => i.kind === 'mission_done')).toMatchObject({ refId: 'm_done' });
    expect(intelOf(s, reg)).toEqual(items); // no draw
  });

  it('an answered item is not offered again; old completed missions are not offered', () => {
    const s = specialCampaign(reg, 'web_of_debts');
    s.day = 20;
    s.missions.completed.push({ id: 'm_old', title: 'Old', outcomeDay: 2, status: 'completed', regionId: 'quarantine_d7' } as never);
    expect(intelOf(s, reg).some((i) => i.refId === 'm_old')).toBe(false);
    const first = intelOf(s, reg);
    debts(s).answered.push(...first.map((i) => i.id));
    expect(intelOf(s, reg).filter((i) => first.some((f) => f.id === i.id))).toEqual([]);
  });

  it('a squad item reads her role and defect in words; a visit is fixed with its items when rolled', () => {
    const s = specialCampaign(reg, 'web_of_debts');
    const squad = intelOf(s, reg).find((i) => i.kind === 'squad')!;
    expect(squad.label).toMatch(/Ann|Bea|Cat|Dee/);
    expect(squad.label).not.toMatch(/[{}]/);
    s.day = 8;
    debts(s).lastVisitDay = 1;
    for (let seed = 1; seed < 80 && !debts(s).visit; seed++) { s.rng = [seed, seed + 1, seed + 2, seed + 3] as never; rollVisit(s, ctxOf(s)); }
    expect(debts(s).visit!.items.length).toBeGreaterThan(0);
  });
});

describe('answering a visit', () => {
  it('four choices per item: anything else is refused and nothing changes', () => {
    const s = visiting();
    for (const bad of [{ ...all('truth'), [ITEMS[0].id]: 'maybe' }, { [ITEMS[0].id]: 'truth' }, {}, { ...all('truth'), extra: 'truth' }]) {
      const r = answer(s, bad);
      expect(r.events.some((e) => e.type === 'error'), JSON.stringify(bad)).toBe(true);
      expect(r.state).toBe(s);
    }
    expect(answer(s, all('truth')).events.some((e) => e.type === 'error')).toBe(false);
    const r = answer(s, { ...all('truth'), [ITEMS[0].id]: 'nope' });
    expect((r.events.find((e) => e.type === 'error') as unknown as { message: string }).message).toBe('Answer each item with truth, partial, false or withhold.');
  });

  it('a stale or unknown visit id is refused', () => {
    const s = visiting();
    expect(answer(s, all('truth'), 'hv9').events.some((e) => e.type === 'error')).toBe(true);
    const none = specialCampaign(reg, 'web_of_debts');
    expect(answer(none, all('truth')).events.some((e) => e.type === 'error')).toBe(true);
  });

  it('the answer closes the visit, the night entry and the night slot, and marks every item answered', () => {
    const s = visiting();
    const r = answer(s, all('withhold'));
    expect(r.events.filter((e) => e.type === 'error')).toEqual([]);
    expect(debts(r.state).visit).toBeUndefined();
    expect(debts(r.state).answered.sort()).toEqual(ITEMS.map((i) => i.id).sort());
    expect(r.state.calendar.nightEvent).toBeUndefined();
    expect(r.state.slot).not.toBe('night');
    expect(r.events.find((e) => e.type === 'intel_answered')).toEqual({ type: 'intel_answered', visitId: 'hv1', counts: { truth: 0, partial: 0, false: 0, withhold: 5 } });
    // a second answer to the same visit is stale
    expect(answer(r.state, all('truth')).events.some((e) => e.type === 'error')).toBe(true);
  });
});

describe('payment', () => {
  it('the table: truth 3 supplies + 20 credits, partial half, false the full price, a plyx per three truths', () => {
    expect(paymentFor({ a: 'truth' }, 0)).toEqual({ credits: 20, supplies: 3, plyx: 0 });
    expect(paymentFor({ a: 'partial' }, 0)).toEqual({ credits: 10, supplies: 1, plyx: 0 });
    expect(paymentFor({ a: 'false' }, 0)).toEqual({ credits: 20, supplies: 3, plyx: 0 });
    expect(paymentFor({ a: 'withhold' }, 0)).toEqual({ credits: 0, supplies: 0, plyx: 0 });
    expect(paymentFor({ a: 'truth', b: 'truth', c: 'truth', d: 'withhold' }, 0)).toEqual({ credits: 60, supplies: 9, plyx: 1 });
    expect(paymentFor({ a: 'truth', b: 'truth', c: 'truth', d: 'truth', e: 'truth', f: 'truth' }, 0).plyx).toBe(2);
  });

  it('is halved (rounded down) at pressure 60', () => {
    expect(paymentFor({ a: 'truth' }, 59)).toEqual({ credits: 20, supplies: 3, plyx: 0 });
    expect(paymentFor({ a: 'truth' }, 60)).toEqual({ credits: 10, supplies: 1, plyx: 0 });
    expect(paymentFor({ a: 'truth', b: 'truth', c: 'truth' }, 70)).toEqual({ credits: 30, supplies: 4, plyx: 0 });
  });

  it('is paid into the resources', () => {
    const s = visiting();
    const before = { ...s.resources };
    const r = answer(s, all('truth'));
    expect(r.state.resources.credits - before.credits).toBe(100);
    expect(r.state.resources.supplies - before.supplies).toBe(15);
    expect(r.state.resources.plyx - before.plyx).toBe(1);
  });

  it('two truths post a rumor', () => {
    const s = visiting();
    const none = answer(s, { ...all('withhold'), [ITEMS[0].id]: 'truth' });
    expect(none.state.rumors.length).toBe(s.rumors.length);
    const some = answer(s, { ...all('withhold'), [ITEMS[0].id]: 'truth', [ITEMS[1].id]: 'truth' });
    expect(some.state.rumors.length).toBe(s.rumors.length + 1);
  });
});

describe('pressure', () => {
  it('withhold raises it by 10, each truth lowers it by 5 (floor 0)', () => {
    const s = visiting();
    expect(debts(answer(s, all('withhold')).state).handlerPressure).toBe(50);
    debts(s).handlerPressure = 20;
    expect(debts(answer(s, { ...all('withhold'), [ITEMS[0].id]: 'truth', [ITEMS[1].id]: 'truth' }).state).handlerPressure).toBe(20 + 30 - 10);
    debts(s).handlerPressure = 3;
    expect(debts(answer(s, all('truth')).state).handlerPressure).toBe(0);
  });

  it('a threat at 40, and a crime leak at 85: everyone knows the crime and the debts, oversight +25, no more visits', () => {
    const s = visiting();
    debts(s).handlerPressure = 30;
    const threat = answer(s, { ...all('truth'), [ITEMS[0].id]: 'withhold', [ITEMS[1].id]: 'withhold', [ITEMS[2].id]: 'withhold' }); // +30 −10 = 50
    expect(threat.events.find((e) => e.type === 'handler_threat')).toEqual({ type: 'handler_threat' });
    expect(threat.events.some((e) => e.type === 'handler_leak')).toBe(false);
    const calm = answer(visiting(), all('truth'));
    expect(calm.events.some((e) => e.type === 'handler_threat')).toBe(false);

    const l = visiting([ITEMS[0]]);
    debts(l).handlerPressure = 80;
    const r = answer(l, { [ITEMS[0].id]: 'withhold' }); // 80 + 10 = 90
    expect(r.events.find((e) => e.type === 'handler_leak')).toEqual({ type: 'handler_leak' });
    const d = debts(r.state);
    expect(d.ended).toBe('leaked');
    expect(d.oversightSuspicion).toBe(25);
    for (const u of r.state.squad.filter((x) => x.kind === 'named')) {
      expect(r.state.relations[u.id].flags, u.id).toContain('knows_crime');
      expect(r.state.relations[u.id].flags, u.id).toContain('knows_debts');
    }
    expect(r.state.memory.facts.some((f) => f.tags.includes('debts') && f.knownBy.includes('*'))).toBe(true);
    // no more visits
    r.state.day += 30;
    expect(rollVisit(r.state, ctxOf(r.state))).toEqual([]);
  });

  it('the handler\'s suspicion also drives the escalation (max of the two)', () => {
    const s = visiting();
    debts(s).handlerSuspicion = 90;
    expect(answer(s, all('truth')).events.some((e) => e.type === 'handler_leak')).toBe(true);
  });
});

describe('an unanswered visit', () => {
  it('lapses as all-withhold at the night\'s end, with no crash', () => {
    const s = visiting();
    s.slot = 'evening';
    delete s.calendar.nightEvent;
    s.calendar.nightEventsQueue.push({ id: 'n_v', unitId: HANDLER_UNIT, kind: HANDLER_VISIT_KIND, priority: 6, framing: 'x', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: s.day + 2 });
    const ctx = ctxOf(s);
    expect(lapseVisit(s, ctx)).toEqual([]); // the same day: still waiting
    s.day += 1;
    const events = lapseVisit(s, ctx);
    expect(events.find((e) => e.type === 'intel_answered')).toMatchObject({ counts: { truth: 0, partial: 0, false: 0, withhold: 5 } });
    expect(debts(s).visit).toBeUndefined();
    expect(debts(s).handlerPressure).toBe(50);
    expect(s.calendar.nightEventsQueue.filter((e) => e.kind === HANDLER_VISIT_KIND)).toEqual([]);
    expect(lapseVisit(s, ctx)).toEqual([]);
  });

  it('the day step lapses it when the next day ends', () => {
    const s = specialCampaign(reg, 'web_of_debts');
    s.slot = 'morning';
    debts(s).visit = { id: 'hv1', day: s.day - 1, items: ITEMS };
    debts(s).lastVisitDay = s.day - 1;
    const t = endDay(s, reg);
    expect(debts(t).visit?.id).not.toBe('hv1');
    expect(debts(t).handlerPressure).toBeGreaterThanOrEqual(50);
  });
});

describe('a unit who leaves service', () => {
  it('a terminated unit leaves no debts record', () => {
    const s = specialCampaign(reg, 'web_of_debts');
    const d = debts(s);
    d.scheduled.push({ id: 'sc1', itemId: `squad:${ANN}`, kind: 'squad', dueDay: s.day + 3, strength: 1, refId: ANN }, { id: 'sc2', itemId: `squad:${BEA}`, kind: 'squad', dueDay: s.day + 3, strength: 1, refId: BEA });
    d.discoveredBy = ANN;
    d.caseQueue = [{ kind: 'unit', unitId: ANN }, { kind: 'oversight' }];
    forgetSpecial(s, ANN);
    expect(d.scheduled.map((x) => x.refId)).toEqual([BEA]);
    expect(d.discoveredBy).toBeUndefined();
    expect(d.caseQueue).toEqual([{ kind: 'oversight' }]);
  });
});
