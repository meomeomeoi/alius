import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/bonds';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { COMMANDER } from '../../../src/engine/blocking';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { practiceDayStep } from '../../../src/engine/practice/dayStep';
import { applyPracticeIntent } from '../../../src/engine/practice/intents';
import { ceremonyCount, ceremonyOf } from '../../../src/engine/practice/punish';
import { blankPractices, type OpenPunishment } from '../../../src/engine/practice/state';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { practiceDirectives } from '../../../src/practice/directives';
import { ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, unitOf, withService, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

type Style = 'ritual' | 'drill' | 'regal' | 'vindictive' | 'cold' | 'cruel' | 'affectionate';
const STEPS = ['fetch_implement', 'ask_formally', 'name_the_number', 'take_the_posture', 'the_execution', 'corner_time', 'the_thanks', 'the_reconciliation'];

/** Ann holds at role in `style` and has a punishment of `severity` (an entry that holds the commander in her quarters) waiting; the commander is in a scene with her. */
function waiting(style: Style = 'ritual', severity: OpenPunishment['severity'] = 3, over: Partial<OpenPunishment> = {}, inScene = true): CampaignState {
  const s = withService(world(reg, 'role'));
  s.slot = 'morning';
  unitOf(s, ANN).bond!.practice!.style = { primary: style };
  dynamicOf(s, ANN)!.hold = 60;
  const p: OpenPunishment = { id: 'pp1', holderId: ANN, entryId: severity >= 3 ? 'kept_in_quarters' : 'no_messages', severity, offence: { kind: 'task_broken', stakes: 'minor', day: s.day }, text: 'You will stay where I can see you.', summary: 'kept in her quarters', status: 'offered', day: s.day, ...over };
  s.practices = { ...blankPractices(), seq: 5, punishments: [p] };
  if (!inScene) return s;
  const started = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_unit', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(started.events)).toEqual([]);
  return started.state;
}
const accept = (s: CampaignState) => run(s, reg, { type: 'practice/answer_punishment', payload: { punishmentId: 'pp1', answer: 'accept' } });
const px = (s: CampaignState): OpenPunishment => s.practices!.punishments.find((p) => p.id === 'pp1')!;
const step = (s: CampaignState, name: string, extra: Record<string, unknown> = {}) => run(s, reg, { type: 'practice/ceremony_step', payload: { punishmentId: 'pp1', step: name, ...extra } });
const said = (s: CampaignState, name: string, number?: number) => {
  const d = structuredClone(s);
  const events = applyPracticeIntent(d, { registries: reg }, ANN, { type: 'ceremony_step', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'x', confidence: 1, punishmentId: 'pp1', step: name, ...(number !== undefined ? { number } : {}) } as never);
  return { state: d, events };
};
const posture = (s: CampaignState, value: string) => run(s, reg, { type: 'blocking/set', payload: { person: COMMANDER, field: 'posture', value, at: 1 } });

describe('a ceremony only for her styles and severity 3 or more', () => {
  it('ritual, drill, regal and vindictive at severity 3 and above get the steps in order; cold, cruel and affectionate never; severity 2 is plain', () => {
    for (const style of ['ritual', 'drill', 'regal', 'vindictive'] as const) expect(ceremonyOf(waiting(style, 3, {}, false), reg, ANN, 3), style).toEqual(STEPS);
    for (const style of ['cold', 'cruel', 'affectionate'] as const) expect(ceremonyOf(waiting(style, 3, {}, false), reg, ANN, 3), style).toBeNull();
    expect(ceremonyOf(waiting('ritual', 2, {}, false), reg, ANN, 2)).toBeNull();
    expect(ceremonyOf(waiting('ritual', 5, {}, false), reg, ANN, 5)).toEqual(STEPS);
  });

  it('accepting starts it: the answer is the answer, nothing is carried out yet, and the cost of the offence is not repaid', () => {
    const s = waiting('ritual');
    const before = { trust: s.relations[ANN].trust, hold: dynamicOf(s, ANN)!.hold };
    const r = accept(s);
    expect(errors(r.events)).toEqual([]);
    expect(px(r.state)).toMatchObject({ status: 'accepted', ceremony: { steps: STEPS, done: [] } });
    expect(ofType(r.events, 'punishment_answered')).toMatchObject([{ answer: 'accept', ceremony: true }]);
    expect(r.state.practices!.held).toBeUndefined();
    expect(r.state.relations[ANN].trust).toBe(before.trust);
    expect(dynamicOf(r.state, ANN)!.hold).toBe(before.hold);
  });

  it('a plain punishment (severity 2, or a style with no ceremony) is carried out at once, as before', () => {
    const plain = accept(waiting('ritual', 2));
    expect(px(plain.state).ceremony).toBeUndefined();
    const cold = accept(waiting('cold', 4));
    expect(px(cold.state).ceremony).toBeUndefined();
    expect(cold.state.practices!.held).toBeDefined();
  });
});

describe('the steps by order and check', () => {
  const started = (style: Style = 'ritual', severity: OpenPunishment['severity'] = 3) => accept(waiting(style, severity)).state;

  it('a chip step is done by the action, in order; a step out of order or one that is done already is refused', () => {
    const s = started();
    const out = step(s, 'the_execution');
    expect(errors(out.events)[0]?.message).toMatch(/next step/i);
    const r = step(s, 'fetch_implement');
    expect(errors(r.events)).toEqual([]);
    expect(px(r.state).ceremony!.done).toEqual(['fetch_implement']);
    expect(ofType(r.events, 'ceremony_step')).toMatchObject([{ punishmentId: 'pp1', holderId: ANN, step: 'fetch_implement' }]);
    expect(errors(step(r.state, 'fetch_implement').events)).toHaveLength(1);
  });

  it('a words step is done only by the intent: the action says so', () => {
    const r = step(started(), 'fetch_implement').state;
    const action = step(r, 'ask_formally');
    expect(errors(action.events)[0]?.message).toMatch(/own words/i);
    const intent = said(r, 'ask_formally');
    expect(px(intent.state).ceremony!.done).toEqual(['fetch_implement', 'ask_formally']);
    expect(ofType(intent.events, 'ceremony_step')).toHaveLength(1);
    // the intent for a step that is not the next one does nothing
    expect(px(said(started(), 'the_thanks').state).ceremony!.done).toEqual([]);
  });

  it('a number step takes a whole number from 1 to 50, by the intent or the action', () => {
    let s = started();
    s = step(s, 'fetch_implement').state;
    s = said(s, 'ask_formally').state;
    for (const bad of [0, 51, 2.5, -3]) {
      expect(px(said(s, 'name_the_number', bad).state).ceremony!.done, String(bad)).toEqual(['fetch_implement', 'ask_formally']);
      expect(errors(step(s, 'name_the_number', { number: bad }).events), String(bad)).toHaveLength(1);
    }
    expect(errors(step(s, 'name_the_number').events)).toHaveLength(1); // no number
    expect(errors(step(s, 'name_the_number', { number: '8' }).events)).toHaveLength(1);
    const ok = said(s, 'name_the_number', 8);
    expect(px(ok.state).ceremony).toMatchObject({ done: ['fetch_implement', 'ask_formally', 'name_the_number'], number: 8 });
    const act = step(s, 'name_the_number', { number: 50 });
    expect(errors(act.events)).toEqual([]);
    expect(px(act.state).ceremony!.number).toBe(50);
  });

  it('a posture step is done when the commander takes the posture the step names, and by nothing else', () => {
    let s = started();
    s = step(s, 'fetch_implement').state;
    s = said(s, 'ask_formally').state;
    s = said(s, 'name_the_number', 8).state;
    expect(errors(step(s, 'take_the_posture').events)[0]?.message).toMatch(/posture/i);
    const wrong = posture(s, 'sitting');
    expect(errors(wrong.events)).toEqual([]);
    expect(px(wrong.state).ceremony!.done).toHaveLength(3);
    const right = posture(s, 'kneeling_upright');
    expect(errors(right.events)).toEqual([]);
    expect(px(right.state).ceremony!.done).toEqual(['fetch_implement', 'ask_formally', 'name_the_number', 'take_the_posture']);
    expect(ofType(right.events, 'ceremony_step')).toMatchObject([{ step: 'take_the_posture' }]);
    // the posture is staying where it is: a later redraw does not do it twice
    expect(px(posture(right.state, 'kneeling_upright').state).ceremony!.done).toHaveLength(4);
  });

  it('nothing is done for a punishment that is gone, not accepted, a soldier\'s, or hers while she is not holding', () => {
    const s = waiting('ritual');
    expect(errors(step(s, 'fetch_implement').events)).toHaveLength(1); // offered, not accepted
    const frozen = started();
    frozen.relations[ANN].dynamic!.frame = 'equal';
    expect(errors(step(frozen, 'fetch_implement').events)).toHaveLength(1);
    expect(errors(run(started(), reg, { type: 'practice/ceremony_step', payload: { punishmentId: 'pp9', step: 'fetch_implement' } }).events)).toHaveLength(1);
  });

  it('no rng is drawn', () => {
    const s = started();
    const rng = JSON.stringify(s.rng);
    expect(JSON.stringify(step(s, 'fetch_implement').state.rng)).toBe(rng);
    expect(JSON.stringify(said(s, 'ask_formally').state.rng)).toBe(rng);
  });
});

describe('a number she finds too low', () => {
  it('is doubled by cruel and vindictive, by the table of her weight, and by nobody else', () => {
    const low = TUNING.practice.ceremony.lowNumber[4];
    expect(ceremonyCount('vindictive', 4, low - 2)).toBe((low - 2) * 2);
    expect(ceremonyCount('cruel', 4, low - 1)).toBe((low - 1) * 2);
    expect(ceremonyCount('vindictive', 4, low)).toBe(low); // not below
    expect(ceremonyCount('ritual', 4, low - 2)).toBe(low - 2);
    expect(ceremonyCount('drill', 4, 1)).toBe(1);
    expect(ceremonyCount('vindictive', 1, 1)).toBe(2); // the table's first row is 2: 1 is under it
    expect(TUNING.practice.ceremony.lowNumber[4]).toBe(8);
  });

  it('in the ceremony the number she named stays, the count she keeps is the doubled one and the player is never told it', () => {
    let s = accept(waiting('vindictive', 4, { entryId: 'kept_the_day' })).state;
    s = step(s, 'fetch_implement').state;
    s = said(s, 'ask_formally').state;
    const r = said(s, 'name_the_number', 6);
    expect(px(r.state).ceremony!.number).toBe(6);
    expect(px(r.state).count).toBe(12);
    for (const e of r.events) expect(JSON.stringify(e)).not.toContain('12');
    const lines = practiceDirectives(r.state, reg, [ANN]).map((d) => d.text).join(' ');
    expect(lines).not.toMatch(/\d/);
    const enough = said(s, 'name_the_number', 9);
    expect(px(enough.state).count).toBe(9);
  });
});

describe('all steps done runs the effects', () => {
  /** Walks the ceremony: chips by the action, words and the number by the intent, the postures by the blocking. */
  const walk = (start: CampaignState, number = 8): { state: CampaignState; events: Array<Record<string, unknown>> } => {
    let s = start;
    const events: Array<Record<string, unknown>> = [];
    const keep = (r: { state: CampaignState; events: Array<Record<string, unknown>> }) => { expect(errors(r.events as never)).toEqual([]); events.push(...r.events); s = r.state; };
    keep(step(s, 'fetch_implement'));
    keep(said(s, 'ask_formally'));
    keep(said(s, 'name_the_number', number));
    keep(posture(s, 'kneeling_upright'));
    keep(step(s, 'the_execution'));
    keep(posture(s, 'standing_attention'));
    keep(said(s, 'the_thanks'));
    keep(step(s, 'the_reconciliation'));
    return { state: s, events };
  };

  it('the last step runs what ACCEPT would have: the repair, the discipline xp, the effects; ceremony_done says so', () => {
    const s = accept(waiting('ritual')).state;
    const before = { trust: s.relations[ANN].trust, hold: dynamicOf(s, ANN)!.hold };
    const { state, events } = walk(s);
    expect(events.filter((e) => e.type === 'ceremony_step')).toHaveLength(8);
    const done = events.filter((e) => e.type === 'ceremony_done');
    expect(done).toMatchObject([{ punishmentId: 'pp1', holderId: ANN, unitId: ANN }]);
    expect(px(state).ceremony!.done).toEqual(STEPS);
    expect(state.practices!.held).toBeDefined(); // the effect of the entry: the commander is kept
    expect(state.relations[ANN].trust).toBeGreaterThan(before.trust);
    expect(dynamicOf(state, ANN)!.hold).toBeGreaterThan(before.hold);
    expect(dynamicOf(state, ANN)!.tracks.discipline!.xp).toBeGreaterThan(0);
    expect(px(state).status).toBe('accepted');
  });

  it('what the effects need is read when they run: a hold that cannot start is not started, and the ceremony still ends', () => {
    let s = accept(waiting('ritual')).state;
    s.content = { enabled: ['service'] }; // restraint went off while she took her time
    const { state, events } = walk(s);
    expect(events.filter((e) => e.type === 'ceremony_done')).toHaveLength(1);
    expect(state.practices!.held).toBeUndefined();
  });

  it('UNDO takes back a ceremony that has only been started; once a step was done it cannot be undone', () => {
    const started = accept(waiting('ritual')).state;
    const undone = run(started, reg, { type: 'practice/undo', payload: { punishmentId: 'pp1' } });
    expect(errors(undone.events)).toEqual([]);
    expect(px(undone.state)).toMatchObject({ status: 'offered' });
    expect(px(undone.state).ceremony).toBeUndefined();
    const after = step(started, 'fetch_implement').state;
    expect(errors(run(after, reg, { type: 'practice/undo', payload: { punishmentId: 'pp1' } }).events)[0]?.message).toMatch(/ceremony|step/i);
  });

  it('a ceremony left open at the day\'s end is finished by her: the effects run and ceremony_done says it lapsed', () => {
    const s = accept(waiting('ritual')).state;
    const d = structuredClone(s);
    d.day = s.day + 1;
    d.practices!.punishments[0].answeredDay = s.day;
    const events = practiceDayStep(d, ctxOf(d, reg));
    expect(ofType(events, 'ceremony_done')).toMatchObject([{ punishmentId: 'pp1', lapsed: true }]);
    expect(d.practices!.held).toBeDefined();
    expect(px(d).status).toBe('done');
  });
});

describe('what the model is told', () => {
  it('while the ceremony runs the line names the next step by its hint, and carries no digit, no pronoun for the commander and no draft marker', () => {
    let s = accept(waiting('ritual')).state;
    let line = practiceDirectives(s, reg, [ANN]).find((d) => d.id === `practice:punishment:${ANN}`)!;
    expect(line.text).toContain('fetches what will be used');
    expect(line.text).not.toMatch(/carries out the punishment she gave/);
    s = step(s, 'fetch_implement').state;
    line = practiceDirectives(s, reg, [ANN]).find((d) => d.id === `practice:punishment:${ANN}`)!;
    expect(line.text).toContain('asks for the punishment in formal words');
    for (const d of [line]) {
      expect(d.text).not.toMatch(/\d/);
      expect(d.text).not.toMatch(/\b(he|him|his|himself)\b/i);
      expect(d.text).not.toMatch(/AUTHOR TO WRITE/);
    }
  });

  it('once the last step is done the ordinary "she carries it out" line returns', () => {
    const s = accept(waiting('ritual')).state;
    const px0 = structuredClone(s);
    px(px0).ceremony!.done = [...STEPS];
    const line = practiceDirectives(px0, reg, [ANN]).find((d) => d.id === `practice:punishment:${ANN}`)!;
    expect(line.text).toMatch(/carries out the punishment/);
  });
});

describe('a finished ceremony never reopens (review I5)', () => {
  /** A ritual holder, the slap as a ceremony punishment, physical discipline on and a scene with her; every step done up to the last one by the real actions. */
  function slapCeremony(): CampaignState {
    const s0 = waiting('ritual', 4, { entryId: 'the_slap', summary: 'the slap' });
    s0.content = { enabled: [...(s0.content?.enabled ?? []), 'physical_discipline_shown'] };
    let s = accept(s0).state;
    for (let guard = 0; guard < 12; guard++) {
      const next = px(s).ceremony!.steps.find((id) => !px(s).ceremony!.done.includes(id));
      if (next === undefined) break;
      const check = (reg.ceremonySteps.get(next) as { check?: string; posture?: string }).check;
      if (check === 'chip') s = step(s, next).state;
      else if (check === 'words') s = said(s, next).state;
      else if (check === 'number') s = said(s, next, 8).state;
      else s = posture(s, (reg.ceremonySteps.get(next) as unknown as { posture: string }).posture).state;
    }
    return s;
  }
  const slapOf = (s: CampaignState) => s.practices!.slap!;

  it('a flinch at the final slap is scored on the slap only: the ceremony stays done and the number is not asked again', () => {
    const s = slapCeremony();
    expect(px(s).ceremony!.done).toHaveLength(8);
    expect(slapOf(s)).toBeDefined();
    const r = run(s, reg, { type: 'practice/slap_answer', payload: { slapId: slapOf(s).id, result: 'flinched' } });
    expect(errors(r.events)).toEqual([]);
    expect(px(r.state).ceremony!.done).toHaveLength(8);
    expect(px(r.state).ceremony!.number).toBe(8);
    const again = step(r.state, 'name_the_number', { number: 8 });
    expect(errors(again.events)[0]?.message).toMatch(/gone|next step/i);
    expect(ofType(again.events, 'ceremony_done')).toEqual([]);
    expect(ofType(again.events, 'slap_started')).toEqual([]);
    expect(dynamicOf(again.state, ANN)!.hold).toBe(dynamicOf(r.state, ANN)!.hold);
    // no intent, no card, no offer for a step that is behind it
    expect(said(r.state, 'name_the_number', 8).events).toEqual([]);
  });

  it('the day end does not carry a done ceremony out a second time', () => {
    const s = slapCeremony();
    const r = run(s, reg, { type: 'practice/slap_answer', payload: { slapId: slapOf(s).id, result: 'flinched' } }).state;
    const d = structuredClone(r);
    d.day = r.day + 1;
    d.practices!.punishments[0].answeredDay = r.day;
    d.practices!.slap = undefined;
    const events = practiceDayStep(d, ctxOf(d, reg));
    expect(ofType(events, 'ceremony_done')).toEqual([]);
    expect(ofType(events, 'relation_changed')).toEqual([]);
    expect(px(d).status).toBe('done');
  });

  it('a ceremony left open at the day end is carried out once, then marked: the next close does nothing', () => {
    const s = accept(waiting('ritual')).state;
    const d = structuredClone(s);
    d.day = s.day + 1;
    d.practices!.punishments[0].answeredDay = s.day;
    expect(ofType(practiceDayStep(d, ctxOf(d, reg)), 'ceremony_done')).toHaveLength(1);
    expect(px(d).ceremony!.carried).toBe(true);
    d.practices!.punishments[0].status = 'accepted';
    expect(ofType(practiceDayStep(d, ctxOf(d, reg)), 'ceremony_done')).toEqual([]);
  });
});
