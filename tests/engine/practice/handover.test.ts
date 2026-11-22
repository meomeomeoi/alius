import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/bonds';
import '../../../src/engine/actions/comms';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { cabinOf, commanderCabin } from '../../../src/engine/basePlan';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { whereaboutAt, whereabouts } from '../../../src/engine/hub';
import { interceptEditor } from '../../../src/engine/personal/intercept';
import { practiceDayStep } from '../../../src/engine/practice/dayStep';
import { handoverProblem } from '../../../src/engine/practice/handover';
import { applyPracticeIntent, practiceIntentInput } from '../../../src/engine/practice/intents';
import { blankPractices, practiceRoll } from '../../../src/engine/practice/state';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { plainDraft } from '../../../src/content/draft';
import { ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, BEA, CAT, unitOf, withService, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

type Style = 'ritual' | 'cold' | 'regal' | 'cruel';
/** Ann holds at `role` in `style`; the commander has said nothing yet. */
function holder(style: Style = 'cold'): CampaignState {
  const s = withService(world(reg, 'role'));
  s.slot = 'morning';
  unitOf(s, ANN).bond!.practice!.style = { primary: style };
  dynamicOf(s, ANN)!.hold = 60;
  s.settings.unitDms = true;
  return s;
}
const offer = (s: CampaignState, kind: string, days?: number) => run(s, reg, { type: 'practice/hand_over', payload: { holderId: ANN, kind, ...(days !== undefined ? { days } : {}) } });
const taskOf = (s: CampaignState) => s.practices!.tasks.find((t) => t.handover !== undefined)!;
const said = (s: CampaignState, id: string) => {
  const d = structuredClone(s);
  const events = applyPracticeIntent(d, { registries: reg }, ANN, { type: 'practice_accepted', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'x', confidence: 1, handoverId: id } as never);
  return { state: d, events };
};
/** The whole thing: the card, the words, the signature. */
function given(kind: string, days?: number, style: Style = 'cold'): { state: CampaignState; events: Array<Record<string, unknown>> } {
  const o = offer(holder(style), kind, days);
  expect(errors(o.events)).toEqual([]);
  const id = taskOf(o.state).id;
  const w = said(o.state, id);
  const sg = run(w.state, reg, { type: 'practice/sign', payload: { taskId: id } });
  expect(errors(sg.events)).toEqual([]);
  return { state: sg.state, events: sg.events };
}
const handovers = (s: CampaignState) => s.practices?.handovers ?? [];

describe('the offer is a severe accept: words, then the signature', () => {
  it('practice/hand_over writes the card: a signed task that names what it hands over, with its days; nothing is given yet', () => {
    const o = offer(holder(), 'key', 3);
    expect(errors(o.events)).toEqual([]);
    expect(taskOf(o.state)).toMatchObject({ holderId: ANN, kind: 'task', handover: 'key', stakes: 'severe', acceptForm: 'signed', status: 'offered', check: 'model' });
    expect(taskOf(o.state).deadline).toBeDefined(); // every task has a deadline: an unanswered card goes void
    expect(ofType(o.events, 'task_issued')).toMatchObject([{ holderId: ANN, handover: true }]);
    expect(handovers(o.state)).toEqual([]);
    expect(plainDraft(taskOf(o.state).text)).not.toMatch(/AUTHOR TO WRITE/);
    expect(taskOf(o.state).text + taskOf(o.state).summary).not.toMatch(/\b(he|him|his|himself)\b/i);
  });

  it('the intent offers the card as a handover, never as a task to accept; the words open the SIGN, not the handover', () => {
    const o = offer(holder(), 'device');
    const input = practiceIntentInput(o.state, reg, [ANN], 'scene').practice!;
    expect(input.handovers).toMatchObject([{ id: taskOf(o.state).id, unitId: ANN }]);
    expect(input.accepts).toEqual([]);
    expect(input.types).toContain('practice_accepted');
    const w = said(o.state, taskOf(o.state).id);
    expect(taskOf(w.state)).toMatchObject({ status: 'offered', said: true });
    expect(handovers(w.state)).toEqual([]);
    expect(errors(run(o.state, reg, { type: 'practice/answer_task', payload: { taskId: taskOf(o.state).id, answer: 'accept' } }).events)[0]?.message).toMatch(/own words/i);
  });

  it('SIGN gives it: practices.handovers, handover_given, the record line, a fact for the pair; the card is spent', () => {
    const g = given('key', 3);
    expect(handovers(g.state)).toMatchObject([{ kind: 'key', holderId: ANN, untilDay: g.state.day + 2 }]);
    expect(ofType(g.events as never, 'handover_given')).toMatchObject([{ unitId: ANN, holderId: ANN, kind: 'key', days: 3 }]);
    expect(g.state.practices!.records.at(-1)).toMatchObject({ holderId: ANN });
    expect(plainDraft(g.state.practices!.records.at(-1)!.line)).toMatch(/key/i);
    expect(taskOf(g.state).status).not.toBe('open');
    expect(g.state.memory.facts.some((f) => f.about.includes(ANN) && f.tags.includes('handover_given'))).toBe(true);
  });

  it('is refused for what is not a handover: a kind that is no kind, days out of range, one of the kind already standing or waiting, a holder who is not live', () => {
    const s = holder();
    expect(errors(offer(s, 'rations').events)).toHaveLength(1);
    expect(handoverProblem(s, reg, ANN, 'key', 8)).toMatch(/days/i);
    expect(handoverProblem(s, reg, ANN, 'key', 0)).toMatch(/days/i);
    expect(handoverProblem(s, reg, ANN, 'calendar', 4)).toMatch(/days/i);
    expect(handoverProblem(s, reg, ANN, 'key', 2.5)).toMatch(/days/i);
    expect(handoverProblem(s, reg, ANN, 'device', 1)).toBeNull();
    expect(handoverProblem(s, reg, ANN, 'key', 7)).toBeNull();
    const a = offer(s, 'key', 2);
    expect(errors(offer(a.state, 'key', 2).events)[0]?.message).toMatch(/already/i);
    const b = given('device').state;
    expect(errors(offer(b, 'device').events)[0]?.message).toMatch(/already/i);
    const frozen = holder();
    frozen.relations[ANN].dynamic!.frame = 'equal';
    expect(errors(offer(frozen, 'device').events)).toHaveLength(1);
  });

  it('the card can be cancelled by the commander at no cost: it is the commander\'s own offer', () => {
    const o = offer(holder(), 'calendar', 1);
    const before = { trust: o.state.relations[ANN].trust, hold: dynamicOf(o.state, ANN)!.hold };
    const r = run(o.state, reg, { type: 'practice/answer_task', payload: { taskId: taskOf(o.state).id, answer: 'refuse' } });
    expect(errors(r.events)).toEqual([]);
    expect(taskOf(r.state).status).toBe('void');
    expect(ofType(r.events, 'task_void')).toMatchObject([{ reason: 'withdrawn' }]);
    expect(r.state.relations[ANN].history.some((h) => h.kind === 'event' && h.type === 'refused_demand')).toBe(false);
    expect(r.state.relations[ANN].trust).toBe(before.trust);
    expect(dynamicOf(r.state, ANN)!.hold).toBe(before.hold);
  });

  it('a standing handover card does not count against her cap of tasks', () => {
    const o = offer(holder(), 'device');
    const t = { ...taskOf(o.state), id: 'pt99', handover: undefined, status: 'offered' as const };
    delete (t as { handover?: unknown }).handover;
    expect(o.state.practices!.tasks.filter((x) => x.kind === 'task' && x.handover === undefined)).toHaveLength(0);
  });
});

describe('the device', () => {
  const withDevice = (): CampaignState => given('device').state;
  const send = (s: CampaignState, unitId: string, extra: Record<string, unknown> = {}) => run(s, reg, { type: 'dm/send', payload: { unitId, text: 'Hello.', ...extra } });

  it('a DM to another that day opens her intercept with no draw, and sends nothing until it is answered', () => {
    const s = withDevice();
    const rng = JSON.stringify(s.rng);
    expect(interceptEditor(s, reg, 'dm', BEA)).toBe(ANN);
    const r = send(s, BEA);
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'device_intercept')).toMatchObject([{ hit: true, unitId: ANN, channel: 'dm' }]);
    expect(r.state.personal!.intercepts!.open).toMatchObject({ unitId: ANN, channel: 'dm', toUnitId: BEA, original: 'Hello.', status: 'open' });
    expect(r.state.dms[BEA] ?? []).toHaveLength(0);
    expect(JSON.stringify(r.state.rng)).toBe(rng);
  });

  it('the once-a-day guard is skipped: after she edited once the next DM to another is edited again, and a DM to her is never', () => {
    let s = withDevice();
    const first = send(s, BEA);
    const kept = run(first.state, reg, { type: 'device/resolve_intercept', payload: { id: first.state.personal!.intercepts!.open!.id, keep: true } });
    const sent = send(kept.state, BEA, { interceptId: first.state.personal!.intercepts!.open!.id, text: 'Edited.' });
    expect(errors(sent.events)).toEqual([]);
    expect(sent.state.dms[BEA]).toHaveLength(1);
    expect(sent.state.personal!.intercepts!.log.some((e) => e.unitId === ANN && e.day === s.day)).toBe(true);
    const second = send(sent.state, CAT);
    expect(ofType(second.events, 'device_intercept')).toMatchObject([{ hit: true, unitId: ANN }]);
    expect(ofType(send(second.state, ANN).events, 'device_intercept')).toEqual([]);
    s = second.state;
    expect(s.dms[CAT] ?? []).toHaveLength(0);
  });

  it('a send the commander chose to send as it is (after REVERT) goes through', () => {
    const first = send(withDevice(), BEA);
    const reverted = run(first.state, reg, { type: 'device/resolve_intercept', payload: { id: first.state.personal!.intercepts!.open!.id, keep: false } });
    const r = send(reverted.state, BEA, { skipIntercept: true });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.dms[BEA]).toHaveLength(1);
    expect(ofType(r.events, 'device_intercept')).toEqual([]);
  });

  it('without the handover a DM goes out as before; the next day it ends with handover_ended', () => {
    expect(send(holder(), BEA).state.dms[BEA]).toHaveLength(1);
    const s = withDevice();
    const d = structuredClone(s);
    const events = practiceDayStep(d, ctxOf(d, reg));
    expect(ofType(events, 'handover_ended')).toMatchObject([{ holderId: ANN, reason: 'ran_out' }]);
    expect(handovers(d)).toEqual([]);
    d.day += 1;
    expect(send(d, BEA).state.dms[BEA]).toHaveLength(1);
  });
});

describe('the key', () => {
  const cabinRoom = (s: CampaignState): string => String(commanderCabin(reg)!.hubRoomId);

  /** The first slots (day and slot) where the roll hits, and one where it misses. */
  const slots = (s: CampaignState, hit: boolean): Array<{ day: number; slot: 'morning' | 'afternoon' | 'evening' | 'night' }> => {
    const out: Array<{ day: number; slot: 'morning' | 'afternoon' | 'evening' | 'night' }> = [];
    for (let day = 20; day < 60 && out.length < 3; day++) for (const slot of ['morning', 'afternoon', 'evening', 'night'] as const) if ((practiceRoll({ ...s, day }, ANN, `key:${day}${slot}`) < TUNING.practice.handover.keyChance) === hit && out.length < 3) out.push({ day, slot });
    return out;
  };

  it('her whereabout is the commander\'s cabin on the slots the hashed roll hits, with the reason routine, and as it was on the others', () => {
    const s = given('key', 7).state;
    const none = holder();
    for (const at of slots(s, true)) {
      const d = structuredClone(s);
      d.day = at.day;
      expect(whereaboutAt(d, reg, ANN, at.day, at.slot), `${at.day}${at.slot}`).toMatchObject({ roomId: cabinRoom(s), reason: 'routine' });
    }
    for (const at of slots(s, false)) {
      const d = structuredClone(s);
      d.day = at.day;
      const n = structuredClone(none);
      n.day = at.day;
      expect(whereaboutAt(d, reg, ANN, at.day, at.slot), `${at.day}${at.slot}`).toEqual(whereaboutAt(n, reg, ANN, at.day, at.slot));
    }
  });

  it('after the term it stops: the handover ends and the hub is as it was; no rng is drawn', () => {
    const s = given('key', 2).state;
    const rng = JSON.stringify(s.rng);
    const d = structuredClone(s);
    d.day = s.day + 1;
    expect(handovers(d)).toHaveLength(1);
    const events = practiceDayStep(d, ctxOf(d, reg)); // the day of the term's last: it ends with it
    expect(ofType(events, 'handover_ended')).toMatchObject([{ reason: 'ran_out' }]);
    expect(handovers(d)).toEqual([]);
    expect(JSON.stringify(s.rng)).toBe(rng);
    whereabouts(s, reg);
    expect(JSON.stringify(s.rng)).toBe(rng);
  });

  it('a unit at the hub who sees her come out gets leaving_quarters, once, on the slot she comes in', () => {
    const s = given('key', 7).state;
    // the slot before a slot the roll hits (inside a day: the Night has no slot after it in the same day)
    const order = ['morning', 'afternoon', 'evening', 'night'] as const;
    let found: { day: number; before: (typeof order)[number] } | undefined;
    for (let day = 20; day < 80 && found === undefined; day++) {
      for (let i = 0; i < 3 && found === undefined; i++) {
        if (practiceRoll({ ...s, day }, ANN, `key:${day}${order[i + 1]}`) < TUNING.practice.handover.keyChance) found = { day, before: order[i] };
      }
    }
    const d = structuredClone(s);
    d.day = found!.day;
    d.slot = found!.before;
    expect(whereaboutAt(d, reg, BEA, d.day, order[order.indexOf(found!.before) + 1]).roomId).not.toBeNull(); // Bea is at the hub
    const before = d.dynamic!.knowledge[BEA]?.[ANN]?.suspicion ?? 0;
    const r = run(d, reg, { type: 'calendar/consume_slot' });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.dynamic!.knowledge[BEA]?.[ANN]?.suspicion ?? 0).toBeGreaterThan(before);
  });

  it('nothing is seen without the key', () => {
    const none = holder();
    none.slot = 'morning';
    const r = run(none, reg, { type: 'calendar/consume_slot' });
    expect(r.state.dynamic!.knowledge[BEA]?.[ANN]?.suspicion ?? 0).toBe(0);
  });
});

describe('the calendar', () => {
  it('the day step books tomorrow\'s free slots with her, from the kinds that fit the slot or else the held kind, and leaves the booked ones', () => {
    const g = given('calendar', 2).state;
    const d = structuredClone(g);
    d.personal = { ...(d.personal ?? { seq: 0 }), seq: d.personal?.seq ?? 0, bookings: [{ id: 'bk0', unitId: CAT, kindId: 'train_together', day: d.day + 1, slot: 'afternoon', status: 'booked', source: 'roll', made: d.day }] } as unknown as CampaignState['personal'];
    const events = practiceDayStep(d, ctxOf(d, reg));
    const mine = (d.personal!.bookings ?? []).filter((b) => b.source === 'practice' && b.unitId === ANN && b.day === d.day + 1);
    expect(mine.map((b) => b.slot).sort()).toEqual(['evening', 'morning']); // the afternoon was booked already
    expect(mine.every((b) => b.practiceId === handovers(d)[0].id)).toBe(true);
    expect(ofType(events, 'booking_made').filter((e) => e.source === 'practice')).toHaveLength(2);
    // the next day step books the second day (the term is two days) and the one after that it is over
    d.day += 1;
    const again = practiceDayStep(d, ctxOf(d, reg));
    expect((d.personal!.bookings ?? []).filter((b) => b.source === 'practice' && b.day === d.day + 1).length).toBeGreaterThan(0);
    expect(ofType(again, 'handover_ended')).toHaveLength(0);
    d.day += 1;
    expect(ofType(practiceDayStep(d, ctxOf(d, reg)), 'handover_ended')).toHaveLength(1);
  });

  it('nothing is booked twice for one day, and nothing without the handover', () => {
    const g = given('calendar', 1).state;
    const d = structuredClone(g);
    practiceDayStep(d, ctxOf(d, reg));
    const n = (d.personal!.bookings ?? []).length;
    practiceDayStep(d, ctxOf(d, reg));
    expect((d.personal!.bookings ?? []).length).toBe(n);
    const none = holder();
    practiceDayStep(none, ctxOf(none, reg));
    expect((none.personal?.bookings ?? []).filter((b) => b.source === 'practice')).toEqual([]);
  });
});

describe('her reading of it', () => {
  it('after resistance (r at 0 or less) her Regard rises for what it cost; after always yielding (r above 0.5) ritual, cold and regal lose a little respect, the others nothing', () => {
    const regardAfter = (style: Style, r: number): number => {
      const s = holder(style);
      s.relations[ANN].regard = 50;
      dynamicOf(s, ANN)!.readOf.r = r;
      const o = offer(s, 'device');
      const w = said(o.state, taskOf(o.state).id);
      const sg = run(w.state, reg, { type: 'practice/sign', payload: { taskId: taskOf(o.state).id } });
      return sg.state.relations[ANN].regard ?? 50;
    };
    expect(regardAfter('cold', 0)).toBeGreaterThan(50);
    expect(regardAfter('cold', -0.4)).toBeGreaterThan(50);
    for (const style of ['ritual', 'cold', 'regal'] as const) expect(regardAfter(style, 0.8), style).toBeLessThan(50);
    expect(regardAfter('cruel', 0.8)).toBe(50);
    expect(regardAfter('cold', 0.3)).toBe(50); // neither
  });
});

describe('taking it back early', () => {
  it('is a refusal at severe: refused_demand at extreme, the handover ends, and it can be done while she is not holding', () => {
    const g = given('key', 5).state;
    const id = handovers(g)[0].id;
    const r = run(g, reg, { type: 'practice/take_back', payload: { handoverId: id } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.relations[ANN].history.filter((h) => h.kind === 'event' && h.type === 'refused_demand')).toMatchObject([{ severity: 'extreme' }]);
    expect(ofType(r.events, 'handover_ended')).toMatchObject([{ handoverId: id, reason: 'taken_back' }]);
    expect(handovers(r.state)).toEqual([]);
    const frozen = structuredClone(g);
    frozen.relations[ANN].dynamic!.frame = 'equal';
    const quiet = run(frozen, reg, { type: 'practice/take_back', payload: { handoverId: id } });
    expect(errors(quiet.events)).toEqual([]);
    expect(handovers(quiet.state)).toEqual([]);
    expect(errors(run(g, reg, { type: 'practice/take_back', payload: { handoverId: 'ph404' } }).events)).toHaveLength(1);
  });
});

describe('what is remembered', () => {
  it('handover_given is a fact for the pair, and the record line says what was given', () => {
    const g = given('device');
    const fact = g.state.memory.facts.find((f) => f.tags.includes('handover_given'))!;
    expect(fact.text).not.toMatch(/AUTHOR TO WRITE/);
    expect(fact.knownBy).toContain(ANN);
  });
});
