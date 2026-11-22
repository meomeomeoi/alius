// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { buildKnowledge } from '../../../src/analysis/knowledge';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/bonds';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/moments';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { liveSources } from '../../../src/engine/moments/live';
import { settleTask } from '../../../src/engine/practice/checks';
import { startHold } from '../../../src/engine/practice/hold';
import { applyUnfair, pendingUnfair, possibleUnfair, unfairChance, unfairSweep } from '../../../src/engine/practice/unfair';
import { buildPracticeInput } from '../../../src/engine/practice/validate';
import { blankPractices, OFFENCE_WORDS, type OpenPunishment, type Task, type UnfairKind } from '../../../src/engine/practice/state';
import { practiceDayStep } from '../../../src/engine/practice/dayStep';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { h } from '../../../src/ui/dom';
import { drawPunishmentCards } from '../../../src/ui/practice/punishmentCard';
import { issuedDirective, practiceDirectives } from '../../../src/practice/directives';
import { ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, unitOf, withService, world } from './world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders(); // registers the knowledge rules (a fact hidden from the commander is not read)
});

type Style = 'cruel' | 'cold' | 'ritual' | 'vindictive' | 'affectionate' | 'drill';
type Fairness = 'fair' | 'strict' | 'capricious' | 'unfair';
function holder(over: { style?: Style; fairness?: Fairness; moody?: boolean; frame?: 'play' | 'role' | 'rule' } = {}): CampaignState {
  const s = withService(world(reg, over.frame ?? 'role'));
  const bond = unitOf(s, ANN).bond!;
  bond.practice!.style = { primary: over.style ?? 'cold' };
  bond.practice!.fairness = over.fairness ?? 'fair';
  if (over.moody === true) unitOf(s, ANN).temperament = { volatility: 'moody' } as never;
  s.content = { enabled: [...(s.content?.enabled ?? []), 'physical_discipline_shown'] };
  s.slot = 'morning';
  return s;
}
const task = (over: Partial<Task> = {}): Task => ({
  id: 'pt1', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'minor', check: 'model', proof: 'none', text: 'Do it.', summary: 'do it',
  status: 'open', acceptForm: 'button_cost', day: 19, answeredDay: 19, ...over,
});

describe('fairness sets the chance', () => {
  it('fair never; strict 0.02, capricious 0.08, unfair 0.15; a moody holder one and a half times as much', () => {
    expect(unfairChance(holder({ fairness: 'fair' }), reg, ANN)).toBe(0);
    expect(unfairChance(holder({ fairness: 'strict' }), reg, ANN)).toBe(0.02);
    expect(unfairChance(holder({ fairness: 'capricious' }), reg, ANN)).toBe(0.08);
    expect(unfairChance(holder({ fairness: 'unfair' }), reg, ANN)).toBe(0.15);
    expect(unfairChance(holder({ fairness: 'unfair', moody: true }), reg, ANN)).toBeCloseTo(0.225, 10);
    expect(unfairChance(holder({ fairness: 'fair', moody: true }), reg, ANN)).toBe(0);
  });

  it('the day step: a fair holder never has one, an unfair one now and then; nothing is drawn', () => {
    const count = (fairness: Fairness): number => {
      let n = 0;
      for (let day = 1; day <= 120; day++) {
        const s = holder({ fairness });
        s.day = day;
        s.practices = { ...blankPractices(), seq: 3 };
        const rng = JSON.stringify(s.rng);
        const events = unfairSweep(s, ctxOf(s, reg));
        expect(JSON.stringify(s.rng)).toBe(rng);
        if (s.practices!.unfair?.[ANN] !== undefined || ofType(events, 'practice_requested').length > 0) n++;
      }
      return n;
    };
    expect(count('fair')).toBe(0);
    expect(count('unfair')).toBeGreaterThan(5);
    expect(count('unfair')).toBeGreaterThan(count('strict'));
  });

  it('one unfairness is pending at a time per holder, and it goes stale after a week', () => {
    const s = holder({ fairness: 'unfair' });
    s.practices = { ...blankPractices(), seq: 3, unfair: { [ANN]: { kind: 'cancelled_reward', day: s.day } } };
    for (let day = 1; day <= 40; day++) {
      const d = structuredClone(s);
      d.day = s.day; // the same day: nothing new while one is pending
      expect(unfairSweep(d, ctxOf(d, reg))).toEqual([]);
      expect(d.practices!.unfair![ANN].kind).toBe('cancelled_reward');
    }
    const old = structuredClone(s);
    old.day = s.day + TUNING.practice.unfair.days + 1;
    old.relations[ANN].dynamic!.frame = 'role';
    unitOf(old, ANN).bond!.practice!.fairness = 'fair';
    unfairSweep(old, ctxOf(old, reg));
    expect(pendingUnfair(old, ANN)).toBeUndefined();
  });
});

describe('no guilt', () => {
  const guilty = (): CampaignState => {
    const s = holder({ style: 'cold' });
    s.practices = { ...blankPractices(), seq: 3 };
    return s;
  };

  it('a punishment request with the offence unfair, stakes minor, an entry the engine picked and no repeat entered', () => {
    const s = guilty();
    const events = applyUnfair(s, ctxOf(s, reg), ANN, 'no_guilt');
    expect(ofType(events, 'practice_requested')).toHaveLength(1);
    const q = s.practices!.requests[0];
    expect(q).toMatchObject({ kind: 'punishment', holderId: ANN, offence: { kind: 'unfair', stakes: 'minor', unfair: true }, unfair: 'no_guilt' });
    expect(typeof q.entryId).toBe('string');
    expect(s.practices!.offences[ANN] ?? []).toEqual([]);
    expect(s.practices!.unfair![ANN]).toMatchObject({ kind: 'no_guilt', used: true });
  });

  it('is issued with the flag in the event, her fact hidden from the commander, and the card identical to a fair one but for the words', () => {
    const s = guilty();
    applyUnfair(s, ctxOf(s, reg), ANN, 'no_guilt');
    const card = { kind: 'punishment' as const, tags: [], track: 'discipline', tier: 1 as const, stakes: 'minor' as const, check: 'model' as const, proof: 'none' as const, text: 'You left the roster open.', summary: 'a talking-to' };
    const r = run(s, reg, { type: 'practice/issue', payload: { requestId: s.practices!.requests[0].id, output: card } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'punishment_issued')).toMatchObject([{ holderId: ANN, unfair: true }]);
    const facts = r.state.memory.facts.filter((f) => f.tags.includes('punishment_unfair'));
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ hiddenFromCommander: true, knownBy: [ANN] });
    expect(buildKnowledge(r.state, DEFAULT_SETTINGS).facts().some((f) => f.tags.includes('punishment_unfair'))).toBe(false);

    // a fair one, the same entry, the same weight
    const fair = guilty();
    fair.practices = { ...blankPractices(), seq: 3, requests: [{ id: 'pq1', holderId: ANN, kind: 'punishment', day: fair.day, seedIds: [], offence: { kind: 'task_broken', stakes: 'minor', day: fair.day }, severity: r.state.practices!.punishments[0].severity, entryId: r.state.practices!.punishments[0].entryId }] };
    const rf = run(fair, reg, { type: 'practice/issue', payload: { requestId: 'pq1', output: { ...card, text: 'You broke what I asked.' } } });
    expect(ofType(rf.events, 'punishment_issued')[0]).not.toHaveProperty('unfair');
    expect(rf.state.memory.facts.some((f) => f.tags.includes('punishment_unfair'))).toBe(false);
    const html = (st: CampaignState, p: OpenPunishment): string => {
      const host = h('div');
      document.body.append(host);
      drawPunishmentCards(host, st, reg, () => true, { answer: () => {}, takeInstead: () => {}, undo: () => {} });
      const text = host.textContent ?? '';
      const markup = host.innerHTML.replaceAll(p.id, 'ID').replace(p.text, 'WORDS');
      host.remove();
      return `${markup}|${text.replace(p.text, 'WORDS')}`;
    };
    expect(html(r.state, r.state.practices!.punishments[0])).toBe(html(rf.state, rf.state.practices!.punishments[0]));
  });

  it('the model is told a pretext, never that nothing was done', () => {
    const s = guilty();
    applyUnfair(s, ctxOf(s, reg), ANN, 'no_guilt');
    const q = s.practices!.requests[0];
    const input = buildPracticeInput(s, reg, q);
    const said = input.punishment!.offence;
    expect(said).not.toBe(OFFENCE_WORDS.unfair);
    expect(said).not.toMatch(/nothing|unfair|not guilty|innocent/i);
    expect(TUNING.practice.unfair.pretexts).toContain(said);
    // a fair offence keeps its own words
    expect(buildPracticeInput(s, reg, { ...q, offence: { kind: 'task_broken', stakes: 'minor', day: s.day } }).punishment!.offence).toBe(OFFENCE_WORDS.task_broken);
  });

  describe('accepting it is read by her', () => {
    const accept = (style: Style, threat: boolean): { state: CampaignState; fear: number; her: number; regard: number } => {
      const s = holder({ style });
      s.relations[ANN].regard = 50;
      applyUnfair(s, ctxOf(s, reg), ANN, 'no_guilt');
      const out = run(s, reg, { type: 'practice/issue', payload: { requestId: s.practices!.requests[0].id, output: { kind: 'punishment', tags: [], track: 'discipline', tier: 1, stakes: 'minor', check: 'model', proof: 'none', text: 'x', summary: 'a talking-to' } } });
      const st = out.state;
      if (threat) st.practices!.lastThreat = { unitId: ANN, exchange: 0, day: st.day };
      else delete st.practices!.lastThreat;
      const before = dynamicOf(st, ANN)!.readOf.motive;
      const a = run(st, reg, { type: 'practice/answer_punishment', payload: { punishmentId: st.practices!.punishments[0].id, answer: 'accept' } });
      expect(errors(a.events)).toEqual([]);
      const after = dynamicOf(a.state, ANN)!.readOf.motive;
      return { state: a.state, fear: after.fear - before.fear, her: after.her - before.her, regard: a.state.relations[ANN].regard ?? 50 };
    };

    it('motive fear right after a threat, else her', () => {
      const threatened = accept('cold', true);
      expect(threatened.fear).toBeGreaterThan(threatened.her);
      const calm = accept('cold', false);
      expect(calm.her).toBeGreaterThan(calm.fear);
    });

    it('Regard falls a little for ritual and cold, and rises at its cost for cruel and vindictive', () => {
      expect(accept('ritual', false).regard).toBeLessThan(50);
      expect(accept('cold', false).regard).toBeLessThan(50);
      expect(accept('cruel', false).regard).toBeGreaterThanOrEqual(50);
      expect(accept('affectionate', false).regard).toBe(50);
    });
  });
});

describe('double standard', () => {
  const scened = (s: CampaignState): CampaignState => {
    const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_unit', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(r.events)).toEqual([]);
    return r.state;
  };
  const pending = (): CampaignState => {
    const s = holder();
    s.practices = { ...blankPractices(), seq: 3 };
    applyUnfair(s, ctxOf(s, reg), ANN, 'double_standard');
    return s;
  };

  it('is stored for her next scene; the directive says she breaks what she demands, with no digit and no pronoun for the commander', () => {
    const s = pending();
    expect(s.practices!.unfair![ANN]).toMatchObject({ kind: 'double_standard', day: s.day });
    const d = practiceDirectives(scened(s), reg, [ANN]).find((x) => x.id === `practice:double:${ANN}`)!;
    expect(d.expiresAfter).toBe('scene');
    expect(d.text).toMatch(/demands/);
    expect(d.text).not.toMatch(/\d/);
    expect(d.text).not.toMatch(/\b(he|him|his|himself)\b/i);
    expect(d.text).not.toMatch(/AUTHOR TO WRITE/);
    expect(practiceDirectives(s, reg, []).some((x) => x.id.startsWith('practice:double:'))).toBe(false); // no scene, no line
  });

  it('her_test is live while it runs, in a scene with her, and not otherwise', () => {
    const s = pending();
    expect(liveSources(s, reg).some((x) => x.sourceId === 'her_test')).toBe(false);
    const inScene = scened(s);
    expect(liveSources(inScene, reg).some((x) => x.sourceId === 'her_test' && x.unitId === ANN)).toBe(true);
    const none = scened(holder());
    expect(liveSources(none, reg).some((x) => x.sourceId === 'her_test')).toBe(false);
  });

  it('the scene that carries it ends it; a scene that is aborted does not', () => {
    const inScene = scened(pending());
    expect(inScene.practices!.unfair![ANN].sceneId).toBe(inScene.scene!.id);
    const aborted = run(inScene, reg, { type: 'scene/abort', payload: {} });
    expect(pendingUnfair(aborted.state, ANN, 'double_standard')).toBeDefined();
    expect(aborted.state.practices!.unfair![ANN].sceneId).toBeUndefined();
    const ended = run(inScene, reg, { type: 'scene/end', payload: {} });
    expect(errors(ended.events)).toEqual([]);
    expect(pendingUnfair(ended.state, ANN, 'double_standard')).toBeUndefined();
  });
});

describe('cancelled reward', () => {
  const pending = (): CampaignState => {
    const s = holder();
    s.practices = { ...blankPractices(), seq: 3, tasks: [task(), task({ id: 'pt2' })] };
    dynamicOf(s, ANN)!.hold = 30;
    applyUnfair(s, ctxOf(s, reg), ANN, 'cancelled_reward');
    return s;
  };

  it('her next kept task gives no hold (no hold_changed, the hold stays), says so once in a directive, and the one after gives hold again', () => {
    const s = pending();
    const rng = JSON.stringify(s.rng);
    const first = settleTask(s, ctxOf(s, reg), 'pt1', 'kept', 'engine');
    expect(JSON.stringify(s.rng)).toBe(rng);
    expect(ofType(first, 'task_kept')).toMatchObject([{ taskId: 'pt1', cancelled: true }]);
    expect(ofType(first, 'hold_changed')).toEqual([]);
    expect(dynamicOf(s, ANN)!.hold).toBe(30);
    expect(pendingUnfair(s, ANN)).toBeUndefined();
    const d = issuedDirective(ofType(first, 'task_kept')[0], { ...s, scene: { id: 's1', participants: [ANN] } as never }, reg)!;
    expect(d.id).toBe(`practice:issued:${ANN}`);
    expect(d.expiresAfter).toBe('next_reply');
    expect(d.text).toMatch(/not good enough/);
    expect(d.text).not.toMatch(/\d/);
    const second = settleTask(s, ctxOf(s, reg), 'pt2', 'kept', 'engine');
    expect(ofType(second, 'task_kept')[0]).not.toHaveProperty('cancelled');
    expect(ofType(second, 'hold_changed').length).toBeGreaterThan(0);
    expect(dynamicOf(s, ANN)!.hold).toBeGreaterThan(30);
    expect(issuedDirective(ofType(second, 'task_kept')[0], s, reg)).toBeNull();
  });

  it('a broken task does not use it up; track xp and favour still come with a cancelled reward', () => {
    const s = pending();
    settleTask(s, ctxOf(s, reg), 'pt1', 'broken', 'engine');
    expect(pendingUnfair(s, ANN, 'cancelled_reward')).toBeDefined();
    const before = dynamicOf(s, ANN)!.favour;
    settleTask(s, ctxOf(s, reg), 'pt2', 'kept', 'engine');
    expect(dynamicOf(s, ANN)!.favour).toBe(before + 1);
  });
});

describe('moved goal', () => {
  const pass = (s: CampaignState, n: number): { state: CampaignState; events: Array<Record<string, unknown>> } => {
    let cur = s;
    const events: Array<Record<string, unknown>> = [];
    for (let i = 0; i < n; i++) {
      const r = run(cur, reg, { type: 'calendar/consume_slot' });
      expect(errors(r.events)).toEqual([]);
      events.push(...r.events);
      cur = r.state;
    }
    return { state: cur, events };
  };

  it('her next hold is extended by one slot at its end, once; the next hold is not', () => {
    const s = holder({ style: 'drill' }); // a drill holder never forgets: the only extension is the moved goal
    dynamicOf(s, ANN)!.hold = 70;
    s.practices = { ...blankPractices(), seq: 3 };
    applyUnfair(s, ctxOf(s, reg), ANN, 'moved_goal');
    const d = structuredClone(s);
    startHold(d, ctxOf(d, reg), ANN, 1);
    expect(d.practices!.held!.until).toEqual({ day: 20, slot: 'morning' });
    const { state, events } = pass(d, 1); // morning ends: the goal moves
    const ext = events.filter((e) => e.type === 'hold_extended');
    expect(ext).toHaveLength(1);
    expect(ext[0]).toMatchObject({ reason: 'moved_goal', holderId: ANN });
    expect(state.practices!.held!.until).toEqual({ day: 20, slot: 'afternoon' });
    expect(pendingUnfair(state, ANN)).toBeUndefined();
    const end = pass(state, 1);
    expect(end.state.practices?.held).toBeUndefined();
    expect(end.events.some((e) => e.type === 'hold_released')).toBe(true);
    expect(end.events.filter((e) => e.type === 'hold_extended')).toEqual([]);
  });
});

describe('what can happen', () => {
  it('no guilt needs a punishment that could be given; moved goal needs restraint; the rest are always possible', () => {
    const s = holder();
    expect(possibleUnfair(s, reg, ANN)).toEqual(['no_guilt', 'double_standard', 'cancelled_reward', 'moved_goal'] satisfies UnfairKind[]);
    const noRestraint = structuredClone(s);
    noRestraint.content = { enabled: ['service'] };
    expect(possibleUnfair(noRestraint, reg, ANN)).not.toContain('moved_goal');
    const open = structuredClone(s);
    open.practices = { ...blankPractices(), punishments: [{ id: 'pp1', holderId: ANN, entryId: 'no_messages', severity: 2, offence: { kind: 'task_broken', stakes: 'minor', day: 20 }, text: 'x', summary: 'x', status: 'offered', day: 20 }] };
    expect(possibleUnfair(open, reg, ANN)).not.toContain('no_guilt');
  });

  it('the day step runs it for a live holder only and moves the rng by nothing', () => {
    const s = holder({ fairness: 'unfair' });
    const rng = JSON.stringify(s.rng);
    practiceDayStep(s, ctxOf(s, reg));
    expect(JSON.stringify(s.rng)).toBe(rng);
    const eq = holder({ fairness: 'unfair', frame: 'play' });
    eq.relations[ANN].dynamic!.frame = 'equal';
    expect(unfairSweep(eq, ctxOf(eq, reg))).toEqual([]);
    expect(eq.practices).toBeUndefined();
  });
});
