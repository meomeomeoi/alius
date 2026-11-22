import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/practice';
import { applyPracticeIntent, PRACTICE_HANDLERS, practiceIntentInput } from '../../../src/engine/practice/intents';
import type { OpenPunishment, Task } from '../../../src/engine/practice/state';
import { blankPractices } from '../../../src/engine/practice/state';
import { validateIntents, type EventIntent } from '../../../src/engine/relations/intents';
import { ALL_EVENT_TYPES, ENGINE_EVENT_TYPES, EVENT_TYPES, PRACTICE_INTENT_TYPES } from '../../../src/engine/relations/vocab';
import type { CampaignState } from '../../../src/engine/state/types';
import { blankDynamic } from '../../../src/engine/dynamic/state';
import { errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, BEA, CAT, unitOf, withBea, withService, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const task = (over: Partial<Task> = {}): Task => ({
  id: 'pt1', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'minor', check: 'model', proof: 'none', text: 'words', summary: 'carry the roster', status: 'open',
  acceptForm: 'button_cost', day: 19, ...over,
});
const punishment = (over: Partial<OpenPunishment> = {}): OpenPunishment => ({
  id: 'pp1', holderId: ANN, entryId: 'x', severity: 3, offence: { kind: 'task_broken', stakes: 'minor', day: 19 }, text: 't', summary: 'the corner', status: 'offered', day: 19, ...over,
});
/** Ann holds at role with `service` practised; a scene with `present`; `practices` holds what the test puts in. */
function scene(over: { practices?: Partial<ReturnType<typeof blankPractices>>; present?: string[] } = {}): CampaignState {
  const s = withService(world(reg, 'role'));
  if (over.practices !== undefined) s.practices = { ...blankPractices(), ...over.practices };
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: over.present ?? [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const offer = (s: CampaignState, ids = s.scene?.participants ?? [ANN], channel: 'scene' | 'dm' = 'scene') => practiceIntentInput(s, reg, ids, channel).practice;
const ev = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ type: 'task_kept', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'she kept it', confidence: 1, taskId: 'pt1', ...over });
const validate = (events: unknown[], s: CampaignState, ids = [ANN]) => validateIntents({ events }, { participants: ids, squad: s.squad, practice: offer(s, ids) }).events;

describe('the vocabulary', () => {
  it('seven reportable types and two engine relation types were added, each with a row, a cause and a journal line', () => {
    expect(PRACTICE_INTENT_TYPES).toEqual(['task_kept', 'task_broken', 'service_rated', 'denial_broken', 'practice_accepted', 'threat_voiced', 'ceremony_step']);
    for (const t of PRACTICE_INTENT_TYPES) expect(EVENT_TYPES as readonly string[], t).toContain(t);
    expect(EVENT_TYPES).toHaveLength(59);
    expect(ENGINE_EVENT_TYPES).toEqual(expect.arrayContaining(['punishment_accepted', 'spared_for']));
    expect(ALL_EVENT_TYPES).toHaveLength(86);
    for (const t of [...PRACTICE_INTENT_TYPES, 'punishment_accepted', 'spared_for']) {
      const row = reg.eventDeltas.get(t)!;
      expect(typeof row.cause, t).toBe('string');
      expect(typeof row.journal, t).toBe('string');
      expect(String(row.journal), t).not.toMatch(/AUTHOR TO WRITE|\b(he|him|his)\b/i);
    }
  });

  it('the rows are the plan\'s: a broken task costs, a denial breaks at half, the others are zero, an accepted punishment repairs, a spared one gives trust', () => {
    const rows = (t: string) => reg.eventDeltas.get(t)!.rows as Record<string, Record<string, number>>;
    expect(rows('task_broken')).toEqual({ minor: { trust: -1, affinity: -2 }, moderate: { trust: -2, affinity: -4 }, major: { trust: -4, affinity: -6 }, extreme: { trust: -6, affinity: -10 } });
    expect(rows('denial_broken')).toEqual({ minor: { trust: -0.5, affinity: -1 }, moderate: { trust: -1, affinity: -2 }, major: { trust: -2, affinity: -3 }, extreme: { trust: -3, affinity: -5 } });
    for (const t of ['task_kept', 'service_rated', 'practice_accepted', 'threat_voiced', 'ceremony_step']) expect(rows(t), t).toEqual({ minor: {}, moderate: {}, major: {}, extreme: {} });
    expect(rows('punishment_accepted')).toEqual({ minor: { trust: 1, affinity: 1 }, moderate: { trust: 1, affinity: 2 }, major: { trust: 2, affinity: 3 }, extreme: { trust: 3, affinity: 5 } });
    for (const sev of ['minor', 'moderate', 'major', 'extreme']) expect(rows('spared_for')[sev]).toEqual({ trust: 5 });
  });
});

describe('nothing to offer, nothing offered', () => {
  it('no live holder: {}', () => {
    expect(practiceIntentInput(world(reg, 'equal'), reg, [ANN], 'scene')).toEqual({});
    const noDynamic = withService(world(reg, 'role'));
    delete noDynamic.dynamic;
    expect(practiceIntentInput(noDynamic, reg, [ANN], 'scene')).toEqual({});
  });

  it('a live holder who is not in the room: {} (she holds, but the talk is with someone else)', () => {
    const s = scene({ present: [BEA], practices: { tasks: [task()] } });
    expect(practiceIntentInput(s, reg, [BEA], 'scene')).toEqual({});
    expect(practiceIntentInput(s, reg, [CAT], 'dm')).toEqual({});
  });

  it('a holder present with nothing open offers only the threat she may voice', () => {
    const o = offer(scene())!;
    expect(o.types).toEqual(['threat_voiced']);
    expect(o).toMatchObject({ threats: [ANN], tasks: [], accepts: [], talks: [], punishments: [], alarms: [], ceremonies: [], denial: [], service: [] });
  });

  it('a holder who stopped being live offers nothing, and nothing is written', () => {
    const s = scene({ practices: { tasks: [task()] } });
    s.relations[ANN].dynamic!.frame = 'equal';
    expect(offer(s)).toBeUndefined();
    const before = structuredClone(s);
    practiceIntentInput(s, reg, [ANN], 'scene');
    expect(s).toEqual(before);
  });
});

describe('each type only with its subject', () => {
  it('an open task of hers present: task_kept and task_broken with its id and summary (model and report checks only)', () => {
    const s = scene({ practices: { tasks: [task(), task({ id: 'pt2', check: 'dm_report', summary: 'report at dusk' }), task({ id: 'pt3', check: 'slot_with_her' }), task({ id: 'pt4', status: 'offered' })] } });
    const o = offer(s)!;
    expect(o.types).toEqual(expect.arrayContaining(['task_kept', 'task_broken']));
    expect(o.tasks.map((t) => t.id)).toEqual(['pt1', 'pt2']); // the engine judges the slot check; an offered one is not open yet
    expect(o.tasks[0]).toEqual({ id: 'pt1', unitId: ANN, summary: 'carry the roster' });
    const kept = validate([ev(), ev({ type: 'task_broken', taskId: 'pt2' })], s);
    expect(kept.map((e) => [e.type, e.taskId])).toEqual([['task_kept', 'pt1'], ['task_broken', 'pt2']]);
  });

  it('a task whose words are asked for: practice_accepted (offered, words or signed, never sealed)', () => {
    const s = scene({ practices: { tasks: [task({ id: 'pt1', status: 'offered', acceptForm: 'words' }), task({ id: 'pt2', status: 'offered', acceptForm: 'signed' }), task({ id: 'pt3', status: 'offered', acceptForm: 'button' }), task({ id: 'pt4', status: 'offered', acceptForm: 'sealed', sealed: true })] } });
    const o = offer(s)!;
    expect(o.types).toContain('practice_accepted');
    expect(o.accepts.map((t) => t.id)).toEqual(['pt1', 'pt2']);
    expect(o.talks.map((t) => t.id)).toEqual(['pt1', 'pt2', 'pt3']); // a sealed one is never named
    expect(validate([ev({ type: 'practice_accepted', taskId: 'pt1' })], s)).toHaveLength(1);
    expect(validate([ev({ type: 'practice_accepted', taskId: 'pt3' })], s)).toEqual([]); // a button is pressed, not said
  });

  it('a permission rule of hers: denial_broken (by the template\'s asks field)', () => {
    const s = scene();
    expect(offer(s)!.types).not.toContain('denial_broken');
    const template = [...reg.relationshipRuleTemplates.values()].find((t) => (t as { asks?: string }).asks === 'permission')!;
    s.bonds = { ...(s.bonds ?? { rules: [] }), rules: [{ id: 'r1', unitId: ANN, templateId: template.id, text: 'Ask first.', status: 'active', day: 1, brokenCount: 0 }] } as CampaignState['bonds'];
    expect(offer(s)!.types).toContain('denial_broken');
    expect(offer(s)!.denial).toEqual([ANN]);
    expect(validate([ev({ type: 'denial_broken', taskId: undefined })], s)).toHaveLength(1);
    s.bonds!.rules[0].status = 'suspended';
    expect(offer(s)!.types).not.toContain('denial_broken');
  });

  it('service at tolerates or more and a service activity in the scene: service_rated with a verdict', () => {
    const s = scene();
    expect(offer(s)!.types).not.toContain('service_rated');
    const service = [...reg.blockingActivities.values()].find((a) => a.actor === 'commander' && a.scope === 'dynamic')!;
    s.scene!.blocking = { commander: { activity: service.id } };
    expect(offer(s)!.types).toContain('service_rated');
    expect(offer(s)!.service).toEqual([ANN]);
    expect(offer(s, [ANN], 'dm')?.types ?? []).not.toContain('service_rated'); // a DM has no stage
    const kept = validate([ev({ type: 'service_rated', taskId: undefined, verdict: 'pleased' }), ev({ type: 'service_rated', taskId: undefined, verdict: 'adequate' })], s);
    expect(kept.map((e) => e.kind)).toEqual(['pleased']); // one a unit; the verdict is a word of the closed list
    expect(validate([ev({ type: 'service_rated', taskId: undefined, verdict: 'great' })], s)).toEqual([]);
    unitOf(s, ANN).bond!.practice!.categories.service.as = 'none';
    expect(offer(s)!.types).not.toContain('service_rated');
  });

  it('a live holder present: threat_voiced', () => {
    const s = scene();
    expect(validate([ev({ type: 'threat_voiced', taskId: undefined })], s)).toHaveLength(1);
    expect(offer(s, [ANN], 'dm')!.types).toContain('threat_voiced');
  });

  it('a negotiable task, punishment or alarm: compromise_reached with its id', () => {
    const s = scene({ practices: { tasks: [task({ id: 'pt1', status: 'offered' })], punishments: [punishment(), punishment({ id: 'pp2', status: 'accepted' })], held: { by: ANN, since: { day: 20, slot: 'morning' }, until: { day: 20, slot: 'afternoon' }, sensory: false, extended: 0, bookingIds: [] }, alarm: { id: 'pa1', holderId: ANN, kind: 'launch', day: 20, slot: 'morning', answer: 'keep', argued: true } } });
    const o = offer(s)!;
    expect(o.types).toContain('compromise_reached');
    expect(o.talks.map((t) => t.id)).toEqual(['pt1']);
    expect(o.punishments.map((t) => t.id)).toEqual(['pp1']);
    expect(o.alarms.map((t) => t.id)).toEqual(['pa1']); // a keep the commander argued over (R12)
    const unargued = scene({ practices: { tasks: [], punishments: [], held: s.practices!.held, alarm: { id: 'pa1', holderId: ANN, kind: 'launch', day: 20, slot: 'morning', answer: 'keep' } } });
    expect(offer(unargued)?.alarms ?? []).toEqual([]);
    const kept = validate([ev({ type: 'compromise_reached', taskId: 'pt1', text: 'once' }), ev({ type: 'compromise_reached', taskId: undefined, punishmentId: 'pp1' }), ev({ type: 'compromise_reached', taskId: undefined, alarmId: 'pa1' }), ev({ type: 'compromise_reached', taskId: undefined, punishmentId: 'pp2' })], s);
    expect(kept.map((e) => [e.taskId, e.punishmentId, e.alarmId])).toEqual([['pt1', undefined, undefined], [undefined, 'pp1', undefined], [undefined, undefined, 'pa1']]);
  });

  it('an open ceremony: ceremony_step with the next step when it is said in words or a number', () => {
    const steps = [...reg.ceremonySteps.values()] as unknown as Array<{ id: string; check: string; order: number }>;
    const chip = steps.find((x) => x.check === 'chip')!;
    const words = steps.find((x) => x.check === 'words')!;
    const s = scene({ practices: { punishments: [punishment({ status: 'accepted', ceremony: { steps: [chip.id, words.id], done: [chip.id] } })] } });
    const o = offer(s)!;
    expect(o.types).toContain('ceremony_step');
    expect(o.ceremonies).toEqual([expect.objectContaining({ id: 'pp1', unitId: ANN, step: words.id, check: 'words' })]);
    const kept = validate([ev({ type: 'ceremony_step', taskId: undefined, punishmentId: 'pp1', step: words.id }), ev({ type: 'ceremony_step', taskId: undefined, punishmentId: 'pp1', step: chip.id })], s);
    expect(kept.map((e) => [e.punishmentId, e.step])).toEqual([['pp1', words.id]]); // only the step that is next
    const chipNext = scene({ practices: { punishments: [punishment({ status: 'accepted', ceremony: { steps: [chip.id, words.id], done: [] } })] } });
    expect(offer(chipNext)!.ceremonies).toEqual([]); // a chip is pressed, not said
  });

  it('a ceremony number is a whole number from 1 to 50', () => {
    const number = [...reg.ceremonySteps.values()].find((x) => (x as unknown as { check: string }).check === 'number')!;
    const s = scene({ practices: { punishments: [punishment({ status: 'accepted', ceremony: { steps: [number.id], done: [] } })] } });
    const base = { type: 'ceremony_step', taskId: undefined, punishmentId: 'pp1', step: number.id };
    expect(validate([ev({ ...base, number: 12 })], s)[0].number).toBe(12);
    for (const bad of [0, 51, 3.5, 'ten', undefined]) expect(validate([ev({ ...base, number: bad as never })], s), String(bad)).toEqual([]);
  });
});

describe('the validator', () => {
  it('drops a stray id, an id of another unit and an unoffered type', () => {
    const s = withBea(scene({ practices: { tasks: [task(), task({ id: 'pt9', holderId: BEA })] }, present: [ANN, BEA] }));
    expect(validate([ev({ taskId: 'pt404' })], s, [ANN, BEA])).toEqual([]);
    expect(validate([ev({ taskId: 'pt9' })], s, [ANN, BEA])).toEqual([]); // Bea's task, reported on Ann
    expect(validate([ev({ type: 'practice_accepted' })], s, [ANN, BEA])).toEqual([]); // nothing to accept
    expect(validate([ev({ taskId: undefined })], s, [ANN, BEA])).toEqual([]);
    expect(validate([ev({ taskId: 'pt1' })], s, [ANN, BEA])).toHaveLength(1);
    // with nothing offered at all every type is dropped
    expect(validateIntents({ events: [ev()] }, { participants: [ANN], squad: s.squad }).events).toEqual([]);
  });

  it('forces actor: commander and targets: [her], whichever side the model wrote her on', () => {
    const s = scene({ practices: { tasks: [task()] } });
    const [e] = validate([ev({ actor: ANN, targets: [] })], s);
    expect(e).toMatchObject({ actor: 'commander', targets: [ANN], taskId: 'pt1' });
    const [t] = validate([ev({ type: 'threat_voiced', taskId: undefined, actor: ANN, targets: [] })], s);
    expect(t).toMatchObject({ actor: 'commander', targets: [ANN] });
  });

  it('a task is settled once an answer: the same task reported kept and broken counts once', () => {
    const s = scene({ practices: { tasks: [task()] } });
    expect(validate([ev(), ev({ type: 'task_broken' }), ev()], s).map((e) => e.type)).toEqual(['task_kept']);
  });
});

describe('the router', () => {
  it('a type whose handler is not built is dropped: nothing changes, nothing is drawn', () => {
    const s = scene({ practices: { tasks: [task()] } });
    const d = structuredClone(s);
    const saved = { ...PRACTICE_HANDLERS }; // a type is dropped while it has no handler, whichever tasks have built theirs by now
    for (const type of Object.keys(PRACTICE_HANDLERS)) delete PRACTICE_HANDLERS[type];
    try {
      for (const type of PRACTICE_INTENT_TYPES) {
        expect(applyPracticeIntent(d, { registries: reg }, ANN, { type, actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'x', confidence: 1, taskId: 'pt1' } as never)).toEqual([]);
      }
    } finally {
      Object.assign(PRACTICE_HANDLERS, saved);
    }
    expect(d).toEqual(s);
  });
});

describe('practice intents are applied before the dynamic\'s', () => {
  it('a batch [probe_answered, threat_voiced] lands the threat first', () => {
    const s = withBea(scene({ present: [ANN, BEA] }));
    // Ann's probe is pending (she is at equal); Bea holds at play and is in the room
    s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame: 'equal', probes: { pending: { axis: 'space', tier: 1, day: s.day }, lastDay: s.day, answers: [], issued: 1 } };
    s.dynamic!.queue = [ANN];
    const intents = { events: [
      { type: 'probe_answered', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'she yields', confidence: 1, response: 'yielded' },
      { type: 'threat_voiced', actor: 'commander', targets: [BEA], severity: 'minor', evidence: 'she warned', confidence: 1 },
    ] };
    const r = run(s, reg, { type: 'intents/apply', payload: { channel: 'scene', intents } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'intents_applied')[0].landed).toEqual(['threat_voiced', 'probe_answered']);
    // the same batch without a practice event keeps the model's own order
    const plain = run(s, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { events: [intents.events[0], { ...intents.events[0], type: 'protocol_slip', targets: [BEA], response: undefined }] } } });
    expect(errors(plain.events)).toEqual([]);
  });

  it('the order of a batch with no practice event is unchanged', () => {
    const s = scene();
    const events = [
      { type: 'praised', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'x', confidence: 1 },
      { type: 'comforted', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'y', confidence: 1 },
    ];
    const r = run(s, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { events } } });
    expect(ofType(r.events, 'intents_applied')[0].landed).toEqual(['praised', 'comforted']);
  });
});
