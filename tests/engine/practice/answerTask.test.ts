import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { frameEntry } from '../../../src/engine/dynamic/hold';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { rememberEvents } from '../../../src/engine/memory/remember';
import { book } from '../../../src/engine/personal/bookings';
import { applyPracticeIntent } from '../../../src/engine/practice/intents';
import { acceptFormOf, taskCost, recordLine } from '../../../src/engine/practice/tasks';
import { blankPractices, type Task } from '../../../src/engine/practice/state';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, withService, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const task = (over: Partial<Task> = {}): Task => ({
  id: 'pt1', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'minor', check: 'model', proof: 'none', text: 'Carry the roster to me.', summary: 'carry the roster',
  status: 'offered', acceptForm: 'button_cost', day: 20, ...over,
});
const withTask = (frame: 'play' | 'role' | 'rule', over: Partial<Task> = {}): CampaignState => {
  const s = withService(world(reg, frame));
  s.practices = { ...blankPractices(), seq: 2, tasks: [task(over)] };
  return s;
};
const answer = (s: CampaignState, a: string, id = 'pt1') => run(s, reg, { type: 'practice/answer_task', payload: { taskId: id, answer: a } });
const taskOf = (s: CampaignState, id = 'pt1') => s.practices!.tasks.find((t) => t.id === id)!;
const lastHistory = (s: CampaignState) => s.relations[ANN].history.filter((h) => h.kind === 'event').at(-1);

describe('the form follows the stakes', () => {
  it('trivial is a button, minor a button with its cost, major words, severe words and a signature, sealed one button', () => {
    expect(acceptFormOf('trivial', undefined)).toBe('button');
    expect(acceptFormOf('minor', undefined)).toBe('button_cost');
    expect(acceptFormOf('major', undefined)).toBe('words');
    expect(acceptFormOf('severe', undefined)).toBe('signed');
    for (const st of ['trivial', 'minor', 'major', 'severe'] as const) expect(acceptFormOf(st, true)).toBe('sealed');
  });
});

describe('accepting', () => {
  it('a button task opens on ACCEPT and answers with task_answered', () => {
    const s = withTask('play', { stakes: 'trivial', acceptForm: 'button' });
    const r = answer(s, 'accept');
    expect(errors(r.events)).toEqual([]);
    expect(taskOf(r.state).status).toBe('open');
    expect(taskOf(r.state).answeredDay).toBe(20);
    expect(ofType(r.events, 'task_answered')).toMatchObject([{ taskId: 'pt1', holderId: ANN, answer: 'accept', via: 'button' }]);
    expect(ofType(r.events, 'practice_signed')).toEqual([]);
  });

  it('ACCEPT on a words task throws "Say it in your own words." and changes nothing', () => {
    const s = withTask('role', { stakes: 'major', acceptForm: 'words' });
    const r = answer(s, 'accept');
    expect(errors(r.events)).toHaveLength(1);
    expect(JSON.stringify(r.events)).toContain('Say it in your own words.');
    expect(r.state).toBe(s);
  });

  it('practice_accepted { taskId } opens a words task (task_answered via words); a button task is not opened by words', () => {
    const s = withTask('role', { stakes: 'major', acceptForm: 'words' });
    const d = structuredClone(s);
    const events = applyPracticeIntent(d, { registries: reg }, ANN, { type: 'practice_accepted', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'said yes', confidence: 1, taskId: 'pt1' } as never);
    expect(taskOf(d).status).toBe('open');
    expect(ofType(events, 'task_answered')).toMatchObject([{ taskId: 'pt1', answer: 'accept', via: 'words' }]);
    expect(lastHistory(d)).toMatchObject({ type: 'practice_accepted' });
    const button = withTask('play', { stakes: 'trivial', acceptForm: 'button' });
    const b = structuredClone(button);
    expect(applyPracticeIntent(b, { registries: reg }, ANN, { type: 'practice_accepted', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'x', confidence: 1, taskId: 'pt1' } as never)).toEqual([]);
    expect(taskOf(b).status).toBe('offered');
  });

  it('a signed task needs the words, then the sign: the sign before the words throws; after, it is open, signed and on the record', () => {
    const s = withTask('rule', { stakes: 'severe', acceptForm: 'signed' });
    const early = run(s, reg, { type: 'practice/sign', payload: { taskId: 'pt1' } });
    expect(errors(early.events)).toHaveLength(1);
    expect(early.state).toBe(s);
    expect(errors(answer(s, 'accept').events)).toHaveLength(1);
    const d = structuredClone(s);
    applyPracticeIntent(d, { registries: reg }, ANN, { type: 'practice_accepted', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'said yes', confidence: 1, taskId: 'pt1' } as never);
    expect(taskOf(d)).toMatchObject({ status: 'offered', said: true }); // the words are said; the signature is not
    const r = run(d, reg, { type: 'practice/sign', payload: { taskId: 'pt1' } });
    expect(errors(r.events)).toEqual([]);
    expect(taskOf(r.state).status).toBe('open');
    expect(ofType(r.events, 'practice_signed')).toMatchObject([{ taskId: 'pt1', unitId: ANN }]);
    expect(r.state.practices!.records).toEqual([{ day: 20, holderId: ANN, line: 'Carry the roster. Day 20.' }]);
  });

  it('a sealed task is one button: it opens, is signed blank and is opened (text and summary come out)', () => {
    const s = withTask('play', { stakes: 'trivial', acceptForm: 'sealed', sealed: true });
    const r = answer(s, 'accept');
    expect(errors(r.events)).toEqual([]);
    expect(taskOf(r.state).status).toBe('open');
    expect(ofType(r.events, 'practice_opened')).toMatchObject([{ taskId: 'pt1', holderId: ANN }]);
    expect(ofType(r.events, 'practice_signed')).toHaveLength(1);
    expect(r.state.practices!.records).toHaveLength(1);
    expect(r.state.practices!.records[0].line).toBe(TUNING.practice.sealedRecord.replace('{day}', '20'));
    expect(r.state.practices!.records[0].line).not.toContain('carry the roster');
  });

  it('the record line is the summary, capitalised, with the day; a summary that ends in a stop does not get a second', () => {
    expect(recordLine(task({ summary: 'stand when she enters.', answeredDay: 9 }))).toBe('Stand when she enters. Day 9.');
    expect(recordLine(task({ summary: 'stand', sealed: true, answeredDay: 4 }))).toBe(TUNING.practice.sealedRecord.replace('{day}', '4'));
  });

  it('every answer throws while she is not holding (a frame that fell back to equal)', () => {
    const s = withTask('play', { stakes: 'trivial', acceptForm: 'button' });
    s.relations[ANN].dynamic!.frame = 'equal';
    expect(errors(answer(s, 'accept').events)).toHaveLength(1);
    expect(errors(answer(s, 'refuse').events)).toHaveLength(1);
  });

  it('a task that is not offered cannot be answered again', () => {
    const s = withTask('play', { stakes: 'trivial', acceptForm: 'button', status: 'open' });
    expect(errors(answer(s, 'accept').events)).toHaveLength(1);
    expect(errors(answer(s, 'nonsense').events)).toHaveLength(1);
  });
});

describe('refusing', () => {
  it('uses the P9 path at its stakes: one refused_demand of severity major on her, and the hold falls by the frame row', () => {
    const s = withTask('role', { stakes: 'major', acceptForm: 'words' });
    dynamicOf(s, ANN)!.hold = 55;
    const before = dynamicOf(s, ANN)!.hold;
    const r = answer(s, 'refuse');
    expect(errors(r.events)).toEqual([]);
    expect(taskOf(r.state).status).toBe('refused');
    expect(r.state.relations[ANN].history.filter((h) => h.kind === 'event' && h.type === 'refused_demand')).toMatchObject([{ severity: 'major' }]);
    const row = frameEntry(reg, 'role')!.refusal as keyof typeof TUNING.dynamic.refusalCost;
    expect(dynamicOf(r.state, ANN)!.hold).toBeCloseTo(before + TUNING.dynamic.refusalCost[row], 4);
    expect(ofType(r.events, 'task_answered')).toMatchObject([{ taskId: 'pt1', answer: 'refuse' }]);
  });

  it('severe is extreme, minor and trivial are moderate (the default of refuseLikeDemand)', () => {
    const severe = answer(withTask('rule', { stakes: 'severe', acceptForm: 'signed' }), 'refuse').state;
    expect(severe.relations[ANN].history.filter((h) => h.kind === 'event' && h.type === 'refused_demand')).toMatchObject([{ severity: 'extreme' }]);
    const minor = answer(withTask('role', { stakes: 'minor' }), 'refuse').state;
    expect(minor.relations[ANN].history.filter((h) => h.kind === 'event' && h.type === 'refused_demand')).toMatchObject([{ severity: 'moderate' }]);
  });

  it('a sealed envelope is refused at major', () => {
    const r = answer(withTask('play', { stakes: 'trivial', acceptForm: 'sealed', sealed: true }), 'refuse');
    expect(r.state.relations[ANN].history.filter((h) => h.kind === 'event' && h.type === 'refused_demand')).toMatchObject([{ severity: 'major' }]);
  });

  it('a sealed envelope enters its offence as the refusal does, at major: the punishment\'s weight does not hint at what was sealed (M12)', () => {
    const asked = (over: Partial<Task>) => answer(withTask('role', { acceptForm: 'button', ...over }), 'refuse').state.practices!.requests.filter((r) => r.kind === 'punishment');
    const sealed = asked({ stakes: 'trivial', acceptForm: 'sealed', sealed: true });
    const heavy = asked({ stakes: 'severe', acceptForm: 'sealed', sealed: true });
    expect(sealed).toMatchObject([{ offence: { kind: 'refusal', stakes: 'major' } }]);
    expect(heavy).toMatchObject([{ offence: { kind: 'refusal', stakes: 'major' } }]);
    expect(sealed[0].severity).toBe(heavy[0].severity); // whatever was inside, the same weight
    expect(asked({ stakes: 'trivial' })).toMatchObject([{ offence: { stakes: 'trivial' } }]); // an open one is entered at its own stakes
  });

  it('at role an offence refusal is noted; at play none', () => {
    expect(answer(withTask('role', { stakes: 'major', acceptForm: 'words' }), 'refuse').state.practices!.offences[ANN]).toEqual([20]);
    expect(answer(withTask('play', { stakes: 'minor' }), 'refuse').state.practices!.offences[ANN] ?? []).toEqual([]);
  });

  it('draws no rng', () => {
    const s = withTask('role', { stakes: 'major', acceptForm: 'words' });
    expect(answer(s, 'refuse').state.rng).toEqual(s.rng);
    expect(answer(withTask('play', { stakes: 'trivial', acceptForm: 'button' }), 'accept').state.rng).toEqual(s.rng);
  });
});

describe('refuseLikeDemand', () => {
  it('without a severity is unchanged: a cancelled booking is a moderate refusal', () => {
    // the P9c path that every existing caller uses (tests/engine/personal/bookings.test.ts pins it): moderate, as before
    const s = withTask('play');
    const ctx = { registries: reg, rng: new Rng(s.rng) };
    const d = structuredClone(s);
    book(d, ctx, { unitId: ANN, kindId: 'evening_with_me', day: 21, slot: 'evening', source: 'roll' });
    const r = run(d, reg, { type: 'booking/cancel', payload: { bookingId: d.personal!.bookings![0].id } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.relations[ANN].history.filter((h) => h.kind === 'event' && h.type === 'refused_demand')).toMatchObject([{ severity: 'moderate' }]);
  });
});

describe('talking', () => {
  it('TALK changes nothing but is answered', () => {
    const s = withTask('role');
    const r = answer(s, 'talk');
    expect(ofType(r.events, 'task_answered')).toMatchObject([{ taskId: 'pt1', answer: 'talk' }]);
    expect(taskOf(r.state).status).toBe('offered');
  });

  it('a compromise lowers the stakes by one, replaces the summary (cut to 80) and the text, and recomputes the form', () => {
    const s = withTask('role', { stakes: 'major', acceptForm: 'words' });
    const d = structuredClone(s);
    const text = `Fine: only the short roster, and only until Friday. ${'x'.repeat(120)}`;
    const events = applyPracticeIntent(d, { registries: reg }, ANN, { type: 'compromise_reached', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'agreed', confidence: 1, taskId: 'pt1', text } as never);
    expect(taskOf(d)).toMatchObject({ stakes: 'minor', acceptForm: 'button_cost', status: 'offered' });
    expect(taskOf(d).summary).toHaveLength(80);
    expect(taskOf(d).summary.startsWith('Fine: only the short roster')).toBe(true);
    expect(taskOf(d).text.startsWith('Fine: only the short roster')).toBe(true);
    expect(taskOf(d).plain).toBeUndefined();
    expect(ofType(events, 'task_answered')).toMatchObject([{ taskId: 'pt1', answer: 'compromise' }]);
  });

  it('a compromise text with a pronoun for the commander keeps the old words but still lowers the stakes', () => {
    const d = structuredClone(withTask('role', { stakes: 'major', acceptForm: 'words' }));
    applyPracticeIntent(d, { registries: reg }, ANN, { type: 'compromise_reached', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'agreed', confidence: 1, taskId: 'pt1', text: 'Fine, she may bring it herself, but he will carry it.' } as never);
    expect(taskOf(d)).toMatchObject({ stakes: 'minor', summary: 'carry the roster', text: 'Carry the roster to me.' });
  });

  it('a compromise on a hold lowers the slots it takes with its stakes (review M5)', () => {
    const d = structuredClone(withTask('role', { kind: 'hold', stakes: 'severe', slots: 3, acceptForm: 'signed', check: 'model' }));
    applyPracticeIntent(d, { registries: reg }, ANN, { type: 'compromise_reached', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'agreed', confidence: 1, taskId: 'pt1', text: 'Agreed.' } as never);
    expect(taskOf(d)).toMatchObject({ stakes: 'major', slots: 2 });
    applyPracticeIntent(d, { registries: reg }, ANN, { type: 'compromise_reached', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'agreed', confidence: 1, taskId: 'pt1', text: 'Agreed again.' } as never);
    expect(taskOf(d)).toMatchObject({ stakes: 'minor', slots: 1 });
    // a task that is no hold has no slots to lower
    const t = structuredClone(withTask('role', { stakes: 'major', acceptForm: 'words' }));
    applyPracticeIntent(t, { registries: reg }, ANN, { type: 'compromise_reached', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'agreed', confidence: 1, taskId: 'pt1', text: 'Agreed.' } as never);
    expect(taskOf(t).slots).toBeUndefined();
  });

  it('a compromise at the lowest stakes keeps them', () => {
    const d = structuredClone(withTask('play', { stakes: 'trivial', acceptForm: 'button' }));
    applyPracticeIntent(d, { registries: reg }, ANN, { type: 'compromise_reached', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'agreed', confidence: 1, taskId: 'pt1', text: 'Agreed.' } as never);
    expect(taskOf(d)).toMatchObject({ stakes: 'trivial', acceptForm: 'button', summary: 'Agreed.' });
  });
});

describe('the cost is shown in bands', () => {
  it('a 2-slot hold task with an evening booking: slots 2 and the booking lapses', () => {
    const s = withTask('role', { kind: 'hold', slots: 2, check: 'model' });
    s.slot = 'afternoon';
    const ctx = { registries: reg, rng: new Rng(s.rng) };
    book(s, ctx, { unitId: 'unit_bea', kindId: 'evening_with_me', day: s.day, slot: 'evening', source: 'roll' });
    const cost = taskCost(s, reg, taskOf(s));
    expect(cost.slots).toBe(2);
    expect(cost.lapses).toEqual([String(reg.bookingKinds.get('evening_with_me')!.label)]);
    expect(cost.resources).toEqual({});
  });

  it('a task that takes no time costs nothing', () => {
    const s = withTask('play');
    expect(taskCost(s, reg, taskOf(s))).toEqual({ slots: 0, lapses: [], resources: {} });
  });

  it('a slot_with_her task costs its slot and her own booking is not a loss', () => {
    const s = withTask('play', { check: 'slot_with_her', deadline: { day: 21, slot: 'evening' } });
    const ctx = { registries: reg, rng: new Rng(s.rng) };
    book(s, ctx, { unitId: ANN, kindId: 'evening_with_me', day: 21, slot: 'evening', source: 'roll' });
    book(s, ctx, { unitId: 'unit_bea', kindId: 'train_together', day: 21, slot: 'evening', source: 'roll' });
    expect(taskCost(s, reg, taskOf(s))).toMatchObject({ slots: 1, lapses: [String(reg.bookingKinds.get('train_together')!.label)] });
  });
});

describe('practice_signed is remembered', () => {
  it('writes a fact for the holder, with no draft marker', () => {
    const s = withTask('rule', { stakes: 'severe', acceptForm: 'signed' });
    const rule = [...reg.memoryRules.values()].find((r) => r.event === 'practice_signed')!;
    expect(rule).toMatchObject({ audience: 'her', spread: 'none', importance: 3 });
    const before = s.memory.facts.length;
    rememberEvents(s, [{ type: 'practice_signed', taskId: 'pt1', unitId: ANN, summary: 'carry the roster' }], reg);
    const facts = s.memory.facts.slice(before);
    expect(facts).toHaveLength(1);
    expect(facts[0].knownBy).toEqual([ANN]);
    expect(facts[0].text).toContain('carry the roster');
    expect(facts[0].text).not.toMatch(/AUTHOR TO WRITE/);
  });
});
