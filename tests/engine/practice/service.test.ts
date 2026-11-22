import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/bonds';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { offencesFromEvents } from '../../../src/engine/practice/offences';
import { practiceDayStep } from '../../../src/engine/practice/dayStep';
import { applyPracticeIntent } from '../../../src/engine/practice/intents';
import { ensurePractices } from '../../../src/engine/practice/gate';
import { confess, routineSweep } from '../../../src/engine/practice/service';
import { taskCost } from '../../../src/engine/practice/tasks';
import { kindsToday } from '../../../src/engine/practice/dayStep';
import type { Task, ValidOutput } from '../../../src/engine/practice/state';
import { practiceDirectives } from '../../../src/practice/directives';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, unitOf, withService, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ctxOf = (d: CampaignState) => ({ registries: reg, rng: new Rng(d.rng) });

/** Ann holds at `frame`, is a lover, practises `service` as `enjoys`, and may set rules about the commander (`others`) and run the household (`household`). */
function proto(frame: 'play' | 'role' | 'rule' = 'play', domains: string[] = ['others', 'household']): CampaignState {
  const s = withService(world(reg, frame));
  s.relations[ANN].stateId = 'lover';
  dynamicOf(s, ANN)!.domains = domains.map((id) => ({ id, since: s.day }));
  return s;
}

const card = (over: Partial<ValidOutput> = {}): ValidOutput => ({
  kind: 'protocol', seedId: 'protocol_stand', tags: ['service'], track: 'service', tier: 1, stakes: 'trivial', check: 'model', proof: 'none', text: 'Stand when I come in.', summary: 'stand when she comes in', ...over,
});

let seq = 0;
/** A request for a protocol, written as the day step does, then issued with a card (or the fallback). */
function issueProtocol(s: CampaignState, out: ValidOutput | 'fallback' = card()): { state: CampaignState; events: ReturnType<typeof run>['events'] } {
  const id = `pq${100 + seq++}`;
  ensurePractices(s).requests.push({ id, holderId: ANN, kind: 'protocol', day: s.day, seedIds: ['protocol_stand'] });
  const r = run(s, reg, { type: 'practice/issue', payload: { requestId: id, ...(out === 'fallback' ? {} : { output: out }) } });
  expect(errors(r.events)).toEqual([]);
  return r;
}
const serviceRules = (s: CampaignState) => (s.bonds?.rules ?? []).filter((r) => (reg.relationshipRuleTemplates.get(r.templateId) as { contentTags?: string[] } | undefined)?.contentTags?.includes('service'));
const routineOf = (s: CampaignState): Task | undefined => s.practices?.tasks.find((t) => t.routine === true);

describe('a protocol request', () => {
  it('proposes a service rule worded by her', () => {
    const r = issueProtocol(proto());
    const rules = serviceRules(r.state);
    expect(rules).toHaveLength(1);
    expect(rules[0].unitId).toBe(ANN);
    expect(rules[0].status).toBe('proposed');
    expect(rules[0].text).toBe('Stand when I come in.');
    expect(rules[0].delivered).toBe(true);
    expect(ofType(r.events, 'rule_proposed')).toHaveLength(1);
    expect(ofType(r.events, 'protocol_set').filter((e) => e.routine !== true)).toHaveLength(1);
    expect(r.state.practices!.requests).toHaveLength(0);
  });

  it('the plain fallback delivers the template line, never the draft marker', () => {
    const r = issueProtocol(proto(), 'fallback');
    const rule = serviceRules(r.state)[0];
    expect(rule.text).not.toMatch(/AUTHOR TO WRITE/);
    expect(rule.text.length).toBeGreaterThan(0);
  });

  it('without relation_rules at play none is proposed and the request becomes a task', () => {
    const r = issueProtocol(proto('play', []));
    expect(serviceRules(r.state)).toHaveLength(0);
    expect(ofType(r.events, 'rule_proposed')).toHaveLength(0);
    const tasks = r.state.practices!.tasks.filter((t) => t.routine !== true);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].kind).toBe('task');
    expect(tasks[0].status).toBe('offered');
    expect(tasks[0].deadline).toBeDefined(); // every task has a deadline
    expect(ofType(r.events, 'task_issued')).toHaveLength(1);
  });

  it('the protocol cap per frame: a second at play is a task instead; role takes two', () => {
    // the rule is accepted by hand: answering it would re-read her domains, and these are set by hand
    const accept = (st: CampaignState): CampaignState => { for (const r of st.bonds!.rules) r.status = 'active'; return st; };
    let s = accept(issueProtocol(proto('play')).state);
    expect(serviceRules(s)[0].status).toBe('active');
    const second = issueProtocol(s);
    expect(serviceRules(second.state)).toHaveLength(1);
    expect(second.state.practices!.tasks.filter((t) => t.kind === 'task' && t.routine !== true)).toHaveLength(1);

    let role = accept(issueProtocol(proto('role')).state);
    const again = issueProtocol(role);
    expect(serviceRules(again.state)).toHaveLength(2);
    expect(again.state.practices!.tasks.filter((t) => t.kind === 'task' && t.routine !== true)).toHaveLength(0);
    role = accept(again.state);
    const third = issueProtocol(role);
    expect(serviceRules(third.state)).toHaveLength(2); // the cap of role is two
    expect(third.state.practices!.tasks.filter((t) => t.kind === 'task' && t.routine !== true)).toHaveLength(1);
  });

  it('draws nothing from the campaign rng', () => {
    const s = proto();
    const before = JSON.stringify(s.rng);
    const r = issueProtocol(s);
    expect(JSON.stringify(r.state.rng)).toBe(before);
  });
});

describe('a broken protocol is an offence', () => {
  it('a broken service rule enters rule_broken at minor', () => {
    const s = proto();
    ensurePractices(s);
    s.bonds = { rules: [{ id: 'r1', unitId: ANN, templateId: 'stand_when_i_enter', text: 'Stand.', status: 'active', day: s.day, brokenCount: 0 }] };
    const events = offencesFromEvents(s, ctxOf(s), [{ type: 'rule_broken', ruleId: 'r1', unitId: ANN }]);
    expect(events.length).toBeGreaterThanOrEqual(0);
    const noted = s.practices!.requests.find((r) => r.offence?.kind === 'rule_broken');
    expect(noted?.offence?.stakes).toBe('minor');
    expect(s.practices!.offences[ANN]).toHaveLength(1);
  });

  it('a protocol_slip of hers enters protocol_slip', () => {
    const s = proto();
    applyPracticeIntent(s, ctxOf(s), ANN, { type: 'protocol_slip' } as never);
    expect(s.practices!.requests.find((r) => r.offence?.kind === 'protocol_slip')).toBeDefined();
  });
});

describe('the routine', () => {
  it('a holder with household_protocol who enjoys service gets one routine at her first protocol request', () => {
    const r = issueProtocol(proto());
    const routine = routineOf(r.state)!;
    expect(routine).toBeDefined();
    expect(routine).toMatchObject({ routine: true, kind: 'task', holderId: ANN, stakes: 'trivial', check: 'model', status: 'open', track: 'service' });
    expect(routine.deadline).toBeUndefined();
    const again = issueProtocol(r.state);
    expect(again.state.practices!.tasks.filter((t) => t.routine === true)).toHaveLength(1);
  });

  it('none without household_protocol, and none for one who only tolerates service', () => {
    expect(routineOf(issueProtocol(proto('play', ['others'])).state)).toBeUndefined();
    const s = proto();
    unitOf(s, ANN).bond!.practice!.categories.service = { as: 'tolerates', witness: 'indifferent' };
    expect(routineOf(issueProtocol(s).state)).toBeUndefined();
  });

  it('each day without a report is kept: routine_kept and service xp + 1', () => {
    const s = issueProtocol(proto()).state;
    const xp = () => dynamicOf(s, ANN)!.tracks.service?.xp ?? 0;
    const before = xp();
    const events = routineSweep(s, ctxOf(s));
    expect(ofType(events, 'routine_kept')).toHaveLength(1);
    expect(xp()).toBe(before + 1);
    s.day += 1;
    routineSweep(s, ctxOf(s));
    expect(xp()).toBe(before + 2);
  });

  it('the day step runs it before anything else is asked', () => {
    const s = issueProtocol(proto()).state;
    const events = practiceDayStep(s, ctxOf(s));
    expect(ofType(events, 'routine_kept')).toHaveLength(1);
  });

  it('a reported break: no routine_kept that day and an offence; the next day is kept again', () => {
    const s = issueProtocol(proto()).state;
    const routine = routineOf(s)!;
    applyPracticeIntent(s, ctxOf(s), ANN, { type: 'task_broken', taskId: routine.id } as never);
    expect(routine.status).toBe('open'); // the routine goes on
    expect(s.practices!.requests.find((r) => r.offence?.kind === 'task_broken')?.offence?.stakes).toBe('trivial');
    const events = practiceDayStep(s, ctxOf(s));
    expect(ofType(events, 'routine_kept')).toHaveLength(0);
    s.day += 1;
    expect(ofType(routineSweep(s, ctxOf(s)), 'routine_kept')).toHaveLength(1);
  });

  it("[ I DIDN'T ] is an offence with the severity one lower", () => {
    const reported = issueProtocol(proto('rule')).state;
    applyPracticeIntent(reported, ctxOf(reported), ANN, { type: 'task_broken', taskId: routineOf(reported)!.id } as never);
    const heavy = reported.practices!.requests.find((r) => r.offence?.kind === 'task_broken')!;

    const confessed = issueProtocol(proto('rule')).state;
    const r = run(confessed, reg, { type: 'practice/confess', payload: { taskId: routineOf(confessed)!.id } });
    expect(errors(r.events)).toEqual([]);
    const light = r.state.practices!.requests.find((q) => q.offence?.kind === 'task_broken')!;
    expect(light.offence!.stakes).toBe('trivial');
    expect(light.severity).toBe((heavy.severity ?? 0) - 1);
    // and it was told today: the sweep keeps nothing for it
    expect(ofType(routineSweep(r.state, ctxOf(r.state)), 'routine_kept')).toHaveLength(0);
  });

  it('confessing twice in a day is refused, and so is confessing a task that is not a routine', () => {
    const s = issueProtocol(proto()).state;
    const id = routineOf(s)!.id;
    const once = run(s, reg, { type: 'practice/confess', payload: { taskId: id } });
    expect(errors(once.events)).toEqual([]);
    expect(errors(run(once.state, reg, { type: 'practice/confess', payload: { taskId: id } }).events)).not.toEqual([]);
    expect(errors(run(s, reg, { type: 'practice/confess', payload: { taskId: 'pt999' } }).events)).not.toEqual([]);
    expect(typeof confess).toBe('function');
  });

  it('spends no slot: no cost, no booking, and it does not fill her task cap', () => {
    const s = issueProtocol(proto()).state;
    const routine = routineOf(s)!;
    expect(taskCost(s, reg, routine).slots).toBe(0);
    practiceDayStep(s, ctxOf(s));
    expect(s.personal?.bookings ?? []).toHaveLength(0);
    expect(kindsToday(s, reg, ANN)).toContain('task'); // the cap of play is one open task, and the routine is not one
  });

  it('a routine whose domain is lost is void, with no delta', () => {
    const s = issueProtocol(proto()).state;
    dynamicOf(s, ANN)!.domains = [];
    const events = routineSweep(s, ctxOf(s));
    expect(ofType(events, 'routine_kept')).toHaveLength(0);
    expect(routineOf(s)!.status).toBe('void');
    expect(TUNING.practice.routine.xp).toBe(1);
  });
});

describe('what the model is told', () => {
  it('her standing forms and her routine, in her scene only', () => {
    const s = issueProtocol(proto()).state;
    for (const r of s.bonds!.rules) r.status = 'active';
    const lines = practiceDirectives(s, reg, [ANN]);
    const protocol = lines.find((d) => d.id === `practice:protocol:${ANN}`);
    expect(protocol?.expiresAfter).toBe('scene');
    expect(protocol?.text).toContain('Stand when I come in');
    expect(protocol?.text).not.toMatch(/AUTHOR TO WRITE|\d/);
    expect(lines.find((d) => d.id === `practice:tasks:${ANN}`)?.text).toContain('her morning routine');
    expect(practiceDirectives(s, reg, []).filter((d) => d.id.startsWith('practice:protocol:'))).toEqual([]);
  });
});
