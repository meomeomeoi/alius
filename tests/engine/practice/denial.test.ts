import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/bonds';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { COMMANDER } from '../../../src/engine/blocking';
import { wantBandOf } from '../../../src/engine/bonds/want';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { liveSources } from '../../../src/engine/moments/live';
import { itemRules, herDemandLive, permissionAnswer, permissionLive, permissionRuleOf } from '../../../src/engine/practice/denial';
import { settleTask } from '../../../src/engine/practice/checks';
import { ensurePractices } from '../../../src/engine/practice/gate';
import { applyPracticeIntent } from '../../../src/engine/practice/intents';
import type { OpenPunishment, Task, ValidOutput } from '../../../src/engine/practice/state';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { issuedDirective } from '../../../src/practice/directives';
import { errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, unitOf, withService, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ctxOf = (d: CampaignState) => ({ registries: reg, rng: new Rng(d.rng) });
const dyn = (s: CampaignState) => dynamicOf(s, ANN)!;
type Style = 'cruel' | 'cold' | 'ritual' | 'possessive' | 'affectionate' | 'drill';

/** Ann is a lover who may set rules about the commander (`others`) and practises `denial`; her style is `style`. */
function proto(frame: 'play' | 'role' | 'rule' = 'play', style: Style = 'cold'): CampaignState {
  const s = withService(world(reg, frame));
  s.relations[ANN].stateId = 'lover';
  dyn(s).domains = [{ id: 'others', since: s.day }];
  unitOf(s, ANN).bond!.practice!.style = { primary: style };
  return s;
}
/** …and she has a permission rule in force (the template read by its field). */
function ruled(frame: 'play' | 'role' | 'rule' = 'play', style: Style = 'cold'): CampaignState {
  const s = proto(frame, style);
  s.bonds = { rules: [{ id: 'r1', unitId: ANN, templateId: 'ask_permission', text: 'Ask me first.', status: 'active', day: s.day, brokenCount: 0, delivered: true }] };
  return s;
}
const scened = (s: CampaignState): CampaignState => {
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_unit', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
};
const set = (s: CampaignState, change: Record<string, unknown>) => run(s, reg, { type: 'blocking/set', payload: { ...change, at: 1 } });
const ask = (s: CampaignState) => run(s, reg, { type: 'practice/ask_permission', payload: { holderId: ANN } });

const card = (over: Partial<ValidOutput> = {}): ValidOutput => ({
  kind: 'denial', seedId: 'denial_ask_before_touch', tags: ['denial'], track: 'denial', tier: 1, stakes: 'minor', check: 'model', proof: 'none', text: 'Ask before you touch yourself.', summary: 'ask before touching', ...over,
});

describe('a denial request', () => {
  it('proposes the permission rule worded by her (the template read by its field)', () => {
    const s = proto();
    ensurePractices(s).requests.push({ id: 'pq1', holderId: ANN, kind: 'denial', day: s.day, seedIds: ['denial_ask_before_touch'] });
    const r = run(s, reg, { type: 'practice/issue', payload: { requestId: 'pq1', output: card() } });
    expect(errors(r.events)).toEqual([]);
    const rules = r.state.bonds?.rules ?? [];
    expect(rules).toHaveLength(1);
    expect((reg.relationshipRuleTemplates.get(rules[0].templateId) as { asks?: string }).asks).toBe('permission');
    expect(rules[0]).toMatchObject({ unitId: ANN, status: 'proposed', delivered: true, text: 'Ask before you touch yourself.' });
    expect(ofType(r.events, 'rule_proposed')).toHaveLength(1);
    expect(r.state.practices!.requests).toHaveLength(0);
  });

  it('with no relation_rules nothing is proposed and no practice is written', () => {
    const s = proto();
    dyn(s).domains = [];
    ensurePractices(s).requests.push({ id: 'pq1', holderId: ANN, kind: 'denial', day: s.day, seedIds: ['denial_ask_before_touch'] });
    const r = run(s, reg, { type: 'practice/issue', payload: { requestId: 'pq1', output: card() } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.bonds?.rules ?? []).toHaveLength(0);
    expect(r.state.practices!.tasks).toHaveLength(0);
  });

  it('her day asks for one only while it could be written, and not while she has one', async () => {
    const { kindsToday } = await import('../../../src/engine/practice/dayStep');
    expect(kindsToday(proto(), reg, ANN)).toContain('denial');
    const none = proto();
    dyn(none).domains = [];
    expect(kindsToday(none, reg, ANN)).not.toContain('denial');
    expect(kindsToday(ruled(), reg, ANN)).not.toContain('denial');
  });
});

describe('the chastity item', () => {
  it('puts the rule in force while worn, for the holder in the scene; taking it off suspends it, wearing it again puts it back', () => {
    let s = scened(proto());
    const worn = set(s, { person: COMMANDER, field: 'worn', value: 'chastity_device' });
    expect(errors(worn.events)).toEqual([]);
    s = worn.state;
    const rule = s.bonds!.rules.find((r) => r.templateId === 'ask_permission')!;
    expect(rule).toMatchObject({ unitId: ANN, status: 'active', source: 'item' });
    expect(s.practices!.permission).toMatchObject({ holderId: ANN, ruleId: rule.id });
    expect(permissionRuleOf(s, reg, ANN)?.id).toBe(rule.id);
    expect(itemRules(s, reg)).toEqual([{ templateId: 'ask_permission', holderId: ANN }]);

    s = set(s, { person: COMMANDER, field: 'removed', value: 'chastity_device' }).state;
    expect(s.bonds!.rules.find((r) => r.id === rule.id)!.status).toBe('suspended');
    expect(permissionRuleOf(s, reg, ANN)).toBeUndefined();
    expect(itemRules(s, reg)).toEqual([]);

    s = set(s, { person: COMMANDER, field: 'worn', value: 'chastity_device' }).state;
    expect(s.bonds!.rules).toHaveLength(1);
    expect(s.bonds!.rules[0].status).toBe('active');
  });

  it('with denial off the item is not allowed at all (P15a), so no rule comes', () => {
    const s = scened(proto());
    s.content = { enabled: s.content!.enabled.filter((c) => c !== 'denial') };
    const r = set(s, { person: COMMANDER, field: 'worn', value: 'chastity_device' });
    expect(errors(r.events)).not.toEqual([]);
    expect(r.state.bonds?.rules ?? []).toHaveLength(0);
  });

  it('a scene that ends takes the item with it: the rule is suspended', () => {
    let s = scened(proto());
    s = set(s, { person: COMMANDER, field: 'worn', value: 'chastity_device' }).state;
    s = run(s, reg, { type: 'scene/end', payload: {} }).state;
    expect(s.bonds!.rules[0].status).toBe('suspended');
  });

  it('a rule the item put in force stays suspended when a category changes (P9d re-reads its rules)', () => {
    let s = scened(proto());
    s = set(s, { person: COMMANDER, field: 'worn', value: 'chastity_device' }).state;
    s = set(s, { person: COMMANDER, field: 'removed', value: 'chastity_device' }).state;
    s = run(s, reg, { type: 'content/set_categories', payload: { enabled: [...s.content!.enabled] } }).state;
    expect(s.bonds!.rules[0].status).toBe('suspended');
  });
});

describe('her answer', () => {
  /** Favour 6 and her Want restless. */
  const restless = (s: CampaignState): CampaignState => {
    s.relations[ANN].stateId = 'lover';
    unitOf(s, ANN).bond!.desire = 'medium';
    s.relations[ANN].want = TUNING.bonds.want.bands.restless + 1;
    dyn(s).favour = 6;
    expect(wantBandOf(s, reg, ANN)).toBe('restless');
    return s;
  };
  const answerOf = (s: CampaignState) => String(ofType(ask(s).events, 'permission_answered')[0]?.answer);

  it('favour 6 and a restless Want: grant', () => {
    expect(permissionAnswer(restless(ruled('play', 'drill')), reg, ANN)).toBe('grant');
    expect(answerOf(restless(ruled('play', 'drill')))).toBe('grant');
  });

  it('by her style: cruel denies, ritual makes her wait until tomorrow, possessive says earn it', () => {
    expect(answerOf(ruled('play', 'cruel'))).toBe('deny');
    const waiting = ask(ruled('play', 'ritual'));
    expect(ofType(waiting.events, 'permission_answered')[0].answer).toBe('wait');
    expect(waiting.state.practices!.permission).toMatchObject({ holderId: ANN, ruleId: 'r1', asked: { answer: 'wait', untilDay: waiting.state.day + 1 } });
    const earn = ask(ruled('play', 'possessive'));
    expect(ofType(earn.events, 'permission_answered')[0].answer).toBe('earn');
    expect(earn.state.practices!.requests.filter((q) => q.kind === 'task' && q.earns === 'r1')).toHaveLength(1);
  });

  it('the frame rule and a low favour deny whatever the style; affectionate grants', () => {
    expect(permissionAnswer(ruled('rule', 'affectionate'), reg, ANN)).toBe('deny');
    const low = ruled('play', 'affectionate');
    dyn(low).favour = TUNING.practice.refusalAt;
    expect(permissionAnswer(low, reg, ANN)).toBe('deny');
    expect(permissionAnswer(ruled('play', 'affectionate'), reg, ANN)).toBe('grant');
  });

  it('deny and wait relieve her Want by 10; grant and earn do not', () => {
    for (const [style, relief] of [['cruel', 10], ['ritual', 10], ['possessive', 0], ['affectionate', 0]] as const) {
      const s = ruled('play', style);
      unitOf(s, ANN).bond!.desire = 'medium';
      s.relations[ANN].want = 50;
      const after = ask(s).state;
      expect(50 - (after.relations[ANN].want ?? 0), style).toBe(relief === 10 ? TUNING.practice.denialRelief : 0);
    }
  });

  it('asking again before the wait is over repeats the answer and relieves nothing more; the next day she answers again', () => {
    const s = ruled('play', 'ritual');
    unitOf(s, ANN).bond!.desire = 'medium';
    s.relations[ANN].want = 50;
    const first = ask(s).state;
    const second = ask(first);
    expect(ofType(second.events, 'permission_answered')[0]).toMatchObject({ answer: 'wait', again: true });
    expect(second.state.relations[ANN].want).toBe(first.relations[ANN].want);
    const tomorrow = structuredClone(first);
    tomorrow.day += 1;
    expect(ofType(ask(tomorrow).events, 'permission_answered')[0]?.again).toBeUndefined();
  });

  it('is refused with no rule of hers in force, and draws nothing', () => {
    expect(errors(ask(proto()).events)).not.toEqual([]);
    const s = ruled('play', 'cruel');
    const rng = JSON.stringify(s.rng);
    expect(JSON.stringify(ask(s).state.rng)).toBe(rng);
  });

  it('the directive carries the answer word only', () => {
    const s = ruled('play', 'ritual');
    const r = ask(s);
    const d = issuedDirective(ofType(r.events, 'permission_answered')[0], r.state, reg);
    expect(d?.id).toBe(`practice:permission:${ANN}`);
    expect(d?.expiresAfter).toBe('next_reply');
    expect(d?.text).toMatch(/not yet/i);
    expect(d?.text).not.toMatch(/AUTHOR TO WRITE|\d/);
    expect(d?.text).not.toMatch(/\b(favour|want|desire)\b/i);
  });

  it('a task she gave to earn it, once kept, grants it', () => {
    const s = ask(ruled('play', 'possessive')).state;
    const task: Task = { id: 'pt1', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'trivial', check: 'model', proof: 'none', text: 'x', summary: 'x', status: 'open', acceptForm: 'button', day: s.day, ruleId: 'r1' };
    ensurePractices(s).tasks.push(task);
    settleTask(s, ctxOf(s), 'pt1', 'kept', 'model');
    expect(s.practices!.permission!.asked).toMatchObject({ answer: 'grant', day: s.day });
  });
});

describe('a slip is her discipline', () => {
  it('denial_broken enters the offence at minor, at major in the frame rule', () => {
    const s = ruled('role');
    applyPracticeIntent(s, ctxOf(s), ANN, { type: 'denial_broken' } as never);
    expect(s.practices!.requests.find((r) => r.offence?.kind === 'denial_broken')?.offence?.stakes).toBe('minor');
    const hard = ruled('rule');
    applyPracticeIntent(hard, ctxOf(hard), ANN, { type: 'denial_broken' } as never);
    expect(hard.practices!.requests.find((r) => r.offence?.kind === 'denial_broken')?.offence?.stakes).toBe('major');
  });

  it("the row lands on her (Trust and Affinity fall), and a permission she gave today covers it", () => {
    const s = ruled('role');
    const trust = s.relations[ANN].trust;
    applyPracticeIntent(s, ctxOf(s), ANN, { type: 'denial_broken' } as never);
    expect(s.relations[ANN].trust).toBeLessThan(trust);
    const granted = ruled('role', 'affectionate');
    ensurePractices(granted).permission = { holderId: ANN, ruleId: 'r1', asked: { day: granted.day, answer: 'grant' } };
    applyPracticeIntent(granted, ctxOf(granted), ANN, { type: 'denial_broken' } as never);
    expect(granted.practices!.requests.filter((r) => r.offence?.kind === 'denial_broken')).toHaveLength(0);
  });
});

describe('the moment triggers', () => {
  const withContact = (s: CampaignState) => set(scened(s), { person: COMMANDER, field: 'contact', value: 'holding_hands', with: ANN, direction: 'from' });

  it('permission is live with her rule active and a contact with her in the blocking, and then it is a live source', () => {
    const contacted = withContact(ruled('role'));
    expect(errors(contacted.events)).toEqual([]);
    expect(permissionLive(contacted.state, reg, ANN)).toBe(true);
    expect(liveSources(contacted.state, reg).some((x) => x.sourceId === 'permission' && x.unitId === ANN)).toBe(true);
    expect(permissionLive(scened(ruled('role')), reg, ANN)).toBe(false); // no contact
    expect(permissionLive(withContact(proto('role')).state, reg, ANN)).toBe(false); // no rule
  });

  it('her_demand is live while she has an offered task or punishment', () => {
    const s = scened(proto('role'));
    expect(herDemandLive(s, reg, ANN)).toBe(false);
    const task: Task = { id: 'pt1', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'trivial', check: 'model', proof: 'none', text: 'x', summary: 'x', status: 'offered', acceptForm: 'button', day: s.day };
    ensurePractices(s).tasks.push(task);
    expect(herDemandLive(s, reg, ANN)).toBe(true);
    expect(liveSources(s, reg).some((x) => x.sourceId === 'her_demand' && x.unitId === ANN)).toBe(true);
    task.status = 'open';
    expect(herDemandLive(s, reg, ANN)).toBe(false);
    const p = { id: 'pp1', holderId: ANN, entryId: 'x', severity: 1, offence: { kind: 'refusal', stakes: 'minor', day: s.day }, text: 'x', summary: 'x', status: 'offered', day: s.day } as OpenPunishment;
    s.practices!.punishments.push(p);
    expect(herDemandLive(s, reg, ANN)).toBe(true);
  });

  it('both answer false while she is not live', () => {
    const s = withContact(ruled('role')).state;
    ensurePractices(s).tasks.push({ id: 'pt1', holderId: ANN, kind: 'task', tags: [], track: 'service', tier: 1, stakes: 'trivial', check: 'model', proof: 'none', text: 'x', summary: 'x', status: 'offered', acceptForm: 'button', day: s.day });
    expect(permissionLive(s, reg, ANN)).toBe(true);
    expect(herDemandLive(s, reg, ANN)).toBe(true);
    dyn(s).frame = 'equal';
    expect(permissionLive(s, reg, ANN)).toBe(false);
    expect(herDemandLive(s, reg, ANN)).toBe(false);
  });
});
