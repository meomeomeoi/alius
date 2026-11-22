import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/practice';
import type { OpenPunishment, Task } from '../../src/engine/practice/state';
import type { CampaignState } from '../../src/engine/state/types';
import type { Directive } from '../../src/llm/context';
import { applyIssuedDirectives, clearPracticeDirectives, issuedDirective, ISSUED_PREFIX, PRACTICE_PREFIX, practiceDirectives, PUNISHMENT_PREFIX, refreshPracticeDirectives, TASKS_PREFIX } from '../../src/practice/directives';
import { hasCommanderPronoun } from '../../src/engine/dynamic/pronoun';
import { dynamicOf } from '../../src/engine/dynamic/state';
import { ensurePractices } from '../../src/engine/practice/gate';
import { startHold } from '../../src/engine/practice/hold';
import { TUNING } from '../../src/engine/tuning';
import { ctxOf } from '../helpers/world';
import { errors, loadCore, run } from '../helpers/world';
import { ANN, BEA, withBea, withService, world } from '../engine/practice/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const task = (over: Partial<Task> = {}): Task => ({
  id: 'pt1', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'minor', check: 'model', proof: 'none', text: 'Fetch the roster at 6 sharp.', summary: 'fetch the roster at 6',
  status: 'open', acceptForm: 'button_cost', day: 19, ...over,
});
const withTasks = (s: CampaignState, tasks: Task[]): CampaignState => {
  s.practices = { seq: 9, requests: [], tasks, punishments: [], demonstrations: [], restrictions: [], cold: {}, postures: {}, offences: {}, records: [], handovers: [] };
  return s;
};
function inScene(s: CampaignState, participants: string[]): CampaignState {
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants, origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
function builder() {
  const map = new Map<string, Directive>();
  return {
    setDirective: (d: Directive) => { map.set(d.id, d); },
    clearMatching: (f: (d: Directive) => boolean) => { for (const d of [...map.values()]) if (f(d)) map.delete(d.id); },
    all: () => [...map.values()],
  };
}
const holding = (): CampaignState => withService(world(reg, 'role'));

describe('the practice directives', () => {
  it('her open tasks, by summary, while she is in the room: scene-long, no digit, no pronoun, no draft marker', () => {
    const s = inScene(withTasks(holding(), [task(), task({ id: 'pt2', status: 'offered', summary: 'not yet accepted' }), task({ id: 'pt3', status: 'open', sealed: true, summary: 'secret thing' })]), [ANN]);
    const ds = practiceDirectives(s, reg, [ANN]);
    expect(ds.map((d) => d.id)).toEqual([`${TASKS_PREFIX}${ANN}`]);
    const d = ds[0];
    expect(d.expiresAfter).toBe('scene');
    expect(d.text).toContain('fetch the roster at');
    expect(d.text).toContain('a sealed task');
    expect(d.text).not.toContain('secret thing');
    expect(d.text).not.toContain('not yet accepted');
    expect(d.text).not.toMatch(/\d/);
    expect(d.text).not.toMatch(/\b(he|him|his|himself)\b/i);
    expect(d.text).not.toMatch(/AUTHOR TO WRITE/);
    expect(d.text).toMatch(/never name it as a mechanic/);
  });

  it('a draft summary reaches the model plain', () => {
    const s = inScene(withTasks(holding(), [task({ summary: 'AUTHOR TO WRITE: forms of address' })]), [ANN]);
    expect(practiceDirectives(s, reg, [ANN])[0].text).not.toMatch(/AUTHOR TO WRITE/);
  });

  it('a comrade scene with no holder has none, and neither does a scene with a holder who has no open task', () => {
    const s = withBea(withTasks(holding(), [task()]));
    const withBeaOnly = inScene(structuredClone(s), [BEA]); // Bea holds too but has no task
    expect(practiceDirectives(withBeaOnly, reg, [BEA])).toEqual([]);
    const noHolder = inScene(withTasks(world(reg, 'equal'), [task()]), [ANN]);
    expect(practiceDirectives(noHolder, reg, [ANN])).toEqual([]);
    expect(practiceDirectives(holding(), reg, [ANN])).toEqual([]);
  });

  it('a holder who stopped being live gives nothing', () => {
    const s = inScene(withTasks(holding(), [task()]), [ANN]);
    s.relations[ANN].dynamic!.frame = 'equal';
    expect(practiceDirectives(s, reg, [ANN])).toEqual([]);
  });

  it('the issued line: what she just asked, for her next reply, only for a holder in the open scene', () => {
    const base = withTasks(holding(), [task({ status: 'offered' })]);
    const s = inScene(base, [ANN]);
    const b = builder();
    expect(applyIssuedDirectives(b as never, [{ type: 'task_issued', taskId: 'pt1', holderId: ANN, kind: 'task' }], s, reg)).toBe(true);
    const d = b.all()[0];
    expect(d.id).toBe(`${ISSUED_PREFIX}${ANN}`);
    expect(d.expiresAfter).toBe('next_reply');
    expect(d.text).toContain('has just asked the commander for something: fetch the roster at');
    expect(d.text).not.toMatch(/\d/);
    expect(d.text).not.toMatch(/\b(he|him|his|himself)\b/i);
    // not in the scene: nothing (her DM carries it); not a task event: nothing
    const b2 = builder();
    expect(applyIssuedDirectives(b2 as never, [{ type: 'task_issued', taskId: 'pt1' }], base, reg)).toBe(false);
    expect(applyIssuedDirectives(b2 as never, [{ type: 'practice_requested' }], s, reg)).toBe(false);
    expect(applyIssuedDirectives(b2 as never, [{ type: 'task_issued', taskId: 'pt1' }], null, reg)).toBe(false);
    expect(b2.all()).toEqual([]);
  });

  it('a sealed task is only an envelope', () => {
    const s = inScene(withTasks(holding(), [task({ status: 'offered', sealed: true, summary: 'hidden words' })]), [ANN]);
    const b = builder();
    applyIssuedDirectives(b as never, [{ type: 'task_issued', taskId: 'pt1' }], s, reg);
    expect(b.all()[0].text).toContain('sealed envelope');
    expect(b.all()[0].text).not.toContain('hidden words');
  });

  it('refresh keeps the issued line and replaces the derived ones; clear drops them all', () => {
    const s = inScene(withTasks(holding(), [task()]), [ANN]);
    const b = builder();
    b.setDirective({ id: `${ISSUED_PREFIX}${ANN}`, text: 'x', expiresAfter: 'next_reply' });
    b.setDirective({ id: `${TASKS_PREFIX}old`, text: 'old', expiresAfter: 'scene' });
    b.setDirective({ id: 'dynamic:x', text: 'not ours', expiresAfter: 'scene' });
    refreshPracticeDirectives(b as never, s, reg);
    expect(b.all().map((d) => d.id).sort()).toEqual(['dynamic:x', `${ISSUED_PREFIX}${ANN}`, `${TASKS_PREFIX}${ANN}`]);
    clearPracticeDirectives(b as never);
    expect(b.all().map((d) => d.id)).toEqual(['dynamic:x']);
    refreshPracticeDirectives(b as never, null, reg);
    expect(b.all().map((d) => d.id)).toEqual(['dynamic:x']);
  });
});

describe('her discipline (P16)', () => {
  const punishment = (over: Partial<OpenPunishment> = {}): OpenPunishment => ({
    id: 'pp1', holderId: ANN, entryId: 'no_messages', severity: 2, offence: { kind: 'task_broken', stakes: 'major', day: 20 }, text: 'No messages today.', summary: 'a day without messages', status: 'offered', day: 20, ...over,
  });
  const withPunishments = (s: CampaignState, list: OpenPunishment[]): CampaignState => {
    s.practices = { seq: 9, requests: [], tasks: [], punishments: list, demonstrations: [], restrictions: [], cold: {}, postures: {}, offences: {}, records: [], handovers: [] };
    return s;
  };

  it('the issued line says the consequence she told, for the next reply only, for a holder in the open scene; an order names the soldier; a sealed one is an envelope', () => {
    const s = inScene(withPunishments(holding(), [punishment(), punishment({ id: 'pp2', forUnitId: BEA, summary: 'a talking-to' }), punishment({ id: 'pp3', sealed: true, summary: 'secret thing' })]), [ANN]);
    const b = builder();
    for (const id of ['pp1', 'pp2', 'pp3']) {
      applyIssuedDirectives(b as never, [{ type: 'punishment_issued', punishmentId: id, holderId: ANN }], s, reg);
      const d = b.all().find((x) => x.id === `${ISSUED_PREFIX}${ANN}`)!;
      expect(d.expiresAfter).toBe('next_reply');
      expect(d.text).not.toMatch(/\d|AUTHOR TO WRITE|secret thing/);
      expect(d.text).not.toMatch(/\b(he|him|his|himself)\b/i);
      if (id === 'pp1') expect(d.text).toContain('a day without messages');
      if (id === 'pp2') expect(d.text).toContain(`about ${BEA === 'unit_bea' ? 'Bea' : BEA}`);
      if (id === 'pp3') expect(d.text).toContain('sealed envelope');
    }
    // not for a holder outside the scene, not for one who does not hold
    const outside = withPunishments(holding(), [punishment()]);
    expect(applyIssuedDirectives(builder() as never, [{ type: 'punishment_issued', punishmentId: 'pp1', holderId: ANN }], outside, reg)).toBe(false);
  });

  it('an accepted punishment of today is carried out in the scene: practice:punishment:<holderId>, by summary, nothing else', () => {
    const s = inScene(withPunishments(holding(), [punishment({ status: 'accepted', answeredDay: 20 }), punishment({ id: 'pp2', status: 'offered' }), punishment({ id: 'pp3', status: 'accepted', answeredDay: 19 })]), [ANN]);
    const ds = practiceDirectives(s, reg, [ANN]).filter((d) => d.id.startsWith(PUNISHMENT_PREFIX));
    expect(ds.map((d) => d.id)).toEqual([`${PUNISHMENT_PREFIX}${ANN}`]);
    expect(ds[0].text).toContain('a day without messages');
    expect(ds[0].expiresAfter).toBe('scene');
    expect(ds[0].text).not.toMatch(/\d|AUTHOR TO WRITE/);
  });
});

describe('her discipline is told once, in one scene (M6)', () => {
  const accepted = (over: Partial<OpenPunishment> = {}): OpenPunishment => ({
    id: 'pp1', holderId: ANN, entryId: 'no_messages', severity: 2, offence: { kind: 'task_broken', stakes: 'major', day: 20 }, text: 'No messages today.', summary: 'a day without messages', status: 'accepted', answeredDay: 20, day: 20, ...over,
  });
  const base = (list: OpenPunishment[]): CampaignState => {
    const s = holding();
    s.practices = { seq: 9, requests: [], tasks: [], punishments: list, demonstrations: [], restrictions: [], cold: {}, postures: {}, offences: {}, records: [], handovers: [] };
    return s;
  };
  const told = (s: CampaignState): boolean => practiceDirectives(s, reg, [ANN]).some((d) => d.id === `${PUNISHMENT_PREFIX}${ANN}`);
  const end = (s: CampaignState) => run(s, reg, { type: 'scene/end', payload: {} }).state;

  it('accepted in a DM, it is told in the first scene with her and not in the next one the same day', () => {
    const first = inScene(base([accepted()]), [ANN]);
    expect(told(first)).toBe(true);
    expect(first.practices!.punishments[0].voicedScene).toBe(first.scene!.id);
    const second = inScene(end(first), [ANN]);
    expect(second.scene!.id).not.toBe(first.scene!.id);
    expect(told(second)).toBe(false);
  });

  it('accepted inside a scene with her, it is told there (the card was answered in it) and never again', () => {
    const s = inScene(base([{ ...accepted({ status: 'offered' }) }]), [ANN]);
    delete s.practices!.punishments[0].answeredDay;
    const r = run(s, reg, { type: 'practice/answer_punishment', payload: { punishmentId: 'pp1', answer: 'accept' } });
    expect(errors(r.events)).toEqual([]);
    expect(told(r.state)).toBe(true);
    expect(r.state.practices!.punishments[0].voicedScene).toBe(r.state.scene!.id);
    expect(told(inScene(end(r.state), [ANN]))).toBe(false);
  });

  it('a scene without her does not use it up', () => {
    const away = inScene(base([accepted()]), [BEA]);
    expect(away.practices!.punishments[0].voicedScene).toBeUndefined();
    expect(told(inScene(end(away), [ANN]))).toBe(true);
  });
});

/**
 * Task 38 (R23): one fixture per directive kind. Every line passes the same checks: its id and prefix, its lifetime, no digit, no pronoun for the commander, no feeling of the
 * commander, no draft marker, the summary and never the words, a sealed thing only as sealed, a hidden end never told.
 */
describe('every directive of R23 (Task 38)', () => {
  const COMMANDER_FEELING = /\b(feel|feels|feeling|love|loves|enjoy|enjoys|ashamed|afraid|crave|craves|aroused|thrilled|humiliated)\b/i;
  const WORDS = 'Words that only she hears: private-words-marker';
  /** What every line must be, whatever its kind. */
  function hygiene(d: Directive, prefix: string, lifetime: 'scene' | 'next_reply'): void {
    expect(d.id.startsWith(prefix), `${d.id} starts with ${prefix}`).toBe(true);
    expect(d.id.startsWith(PRACTICE_PREFIX)).toBe(true);
    expect(d.expiresAfter, d.id).toBe(lifetime);
    expect(d.text, d.id).not.toMatch(/\d/);
    expect(hasCommanderPronoun(d.text), d.id).toBe(false);
    expect(d.text, d.id).not.toMatch(COMMANDER_FEELING);
    expect(d.text, d.id).not.toMatch(/AUTHOR TO WRITE/);
    expect(d.text, d.id).not.toContain('private-words-marker');
    expect(d.text, d.id).toMatch(/never name it as a mechanic|never name/i);
  }
  const base = (): CampaignState => withService(world(reg, 'role'));
  const withPractices = (s: CampaignState, over: Partial<NonNullable<CampaignState['practices']>>): CampaignState => { s.practices = { ...ensurePractices(s), ...over }; return s; };
  const one = (list: Directive[], prefix: string): Directive => {
    const found = list.filter((d) => d.id.startsWith(prefix));
    expect(found.length, prefix).toBe(1);
    return found[0];
  };
  const event = (e: Record<string, unknown>) => e as { type: string; [k: string]: unknown };

  it('practice:tasks: her open tasks by summary, a sealed one as "a sealed task", a hidden deadline never told, the words never', () => {
    const s = withPractices(base(), { tasks: [
      task({ text: WORDS, summary: 'fetch the roster', deadline: { day: 24, slot: 'evening' } as never, noDuration: true }),
      task({ id: 'pt2', sealed: true, text: WORDS, summary: 'a sealed thing: private-words-marker' }),
    ] });
    const d = one(practiceDirectives(s, reg, [ANN]), 'practice:tasks:');
    hygiene(d, `${TASKS_PREFIX}${ANN}`, 'scene');
    expect(d.text).toContain('fetch the roster');
    expect(d.text).toContain('a sealed task');
    expect(d.text).not.toMatch(/evening|day twenty|until/i);
  });

  it('practice:tasks: a draft summary and a summary with digits reach the model plain', () => {
    const s = withPractices(base(), { tasks: [task({ summary: 'AUTHOR TO WRITE: forms of address, 3 times' })] });
    hygiene(one(practiceDirectives(s, reg, [ANN]), 'practice:tasks:'), `${TASKS_PREFIX}${ANN}`, 'scene');
  });

  it('practice:protocol: her standing forms, by their text, for the scene', () => {
    const s = base();
    s.relations[ANN].stateId = 'lover';
    dynamicOf(s, ANN)!.domains = [{ id: 'others', since: s.day }, { id: 'household', since: s.day }];
    const id = 'pq900';
    ensurePractices(s).requests.push({ id, holderId: ANN, kind: 'protocol', day: s.day, seedIds: ['protocol_stand'] });
    const r = run(s, reg, { type: 'practice/issue', payload: { requestId: id, output: { kind: 'protocol', seedId: 'protocol_stand', tags: ['service'], track: 'service', tier: 1, stakes: 'trivial', check: 'model', proof: 'none', text: 'Stand when I come in.', summary: 'stand when she comes in' } } });
    expect(errors(r.events)).toEqual([]);
    for (const rule of r.state.bonds!.rules) rule.status = 'active';
    const d = one(practiceDirectives(r.state, reg, [ANN]), 'practice:protocol:');
    hygiene(d, `practice:protocol:${ANN}`, 'scene');
    expect(d.text).toContain('Stand when I come in');
  });

  it('practice:held: in her room only, never the end of it; a sensory hold only as what reaches the commander', () => {
    for (const sensory of [false, true]) {
      const s = base();
      s.slot = 'morning';
      dynamicOf(s, ANN)!.hold = 70;
      startHold(s, ctxOf(s, reg), ANN, 2, { sensory });
      const d = one(practiceDirectives(s, reg, [ANN]), 'practice:held');
      hygiene(d, 'practice:held', 'scene');
      expect(d.text).not.toMatch(/until|afternoon|evening|morning|slot/i);
      expect(practiceDirectives(s, reg, [BEA]).some((x) => x.id === 'practice:held')).toBe(false);
    }
  });

  it('practice:punishment: an accepted one by summary, a ceremony by its next step; the words never', () => {
    const p: OpenPunishment = { id: 'pp1', holderId: ANN, entryId: 'no_messages', severity: 2, offence: { kind: 'task_broken', stakes: 'major', day: 20 }, text: WORDS, summary: 'a day without messages', status: 'accepted', answeredDay: 20, day: 20 };
    const plain = one(practiceDirectives(withPractices(base(), { punishments: [p] }), reg, [ANN]), 'practice:punishment:');
    hygiene(plain, `${PUNISHMENT_PREFIX}${ANN}`, 'scene');
    expect(plain.text).toContain('a day without messages');
    const steps = [...reg.ceremonySteps.values()].filter((e) => (e as { styles?: string[] }).styles?.includes('ritual')).map((e) => (e as { id: string }).id);
    const ceremony: OpenPunishment = { ...p, id: 'pp2', severity: 3, ceremony: { steps, done: [] } };
    const c = one(practiceDirectives(withPractices(base(), { punishments: [ceremony] }), reg, [ANN]), 'practice:punishment:');
    hygiene(c, `${PUNISHMENT_PREFIX}${ANN}`, 'scene');
    expect(c.text).toMatch(/one step at a time/);
  });

  it('practice:demonstration: the form by summary and how the watchers take it, for the scene she stages it in', () => {
    const s = inScene(withPractices(base(), { demonstrations: [{ id: 'pd1', holderId: ANN, tags: [], summary: 'serving tea before the mess', text: WORDS, audienceIds: [BEA], stage: 'mess_hall', day: 20, status: 'open', stakes: 'minor' } as never] }), [ANN]);
    s.practices!.demonstrations[0].sceneId = s.scene!.id;
    const d = one(practiceDirectives(s, reg, [ANN]), 'practice:demonstration:');
    hygiene(d, `practice:demonstration:${ANN}`, 'scene');
    expect(d.text).toContain('serving tea before the mess');
    expect(d.text).toMatch(/Watching/);
  });

  it('practice:target: a third party is told what was asked and her own stance, for the scene', () => {
    const s = withPractices(base(), { tasks: [task({ targetUnitId: BEA, summary: 'a word with Bea', text: WORDS })] });
    const d = one(practiceDirectives(s, reg, [BEA]), 'practice:target:');
    hygiene(d, `practice:target:${BEA}`, 'scene');
    expect(d.text).toContain('a word with Bea');
  });

  it('practice:double: a double standard is acted, never named as unfair', () => {
    const s = inScene(withPractices(base(), {}), [ANN]);
    s.practices!.unfair = { [ANN]: { kind: 'double_standard', day: s.day, sceneId: s.scene!.id } };
    const d = one(practiceDirectives(s, reg, [ANN]), 'practice:double:');
    hygiene(d, `practice:double:${ANN}`, 'scene');
    expect(d.text).not.toMatch(/unfair|double standard|hypocri/i);
  });

  it('the event-driven lines last the next reply: issued (task, punishment, demonstration, handover, kind of hold, cancelled reward), permission, ask, alarm, slap, verdict', () => {
    const s = inScene(withPractices(base(), {
      tasks: [task({ id: 'pt1', status: 'offered', text: WORDS }), task({ id: 'pt9', status: 'offered', text: WORDS, handover: 'device', summary: 'the device' } as never)],
      punishments: [{ id: 'pp1', holderId: ANN, entryId: 'no_messages', severity: 2, offence: { kind: 'task_broken', stakes: 'major', day: 20 }, text: WORDS, summary: 'a day without messages', status: 'offered', day: 20 }],
      demonstrations: [{ id: 'pd1', holderId: ANN, tags: [], summary: 'serving tea', text: WORDS, audienceIds: [], stage: 'mess_hall', day: 20, status: 'offered', stakes: 'minor' } as never],
    }), [ANN]);
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ type: 'task_issued', taskId: 'pt1', holderId: ANN, kind: 'task' }, ISSUED_PREFIX],
      [{ type: 'task_issued', taskId: 'pt9', holderId: ANN, kind: 'task', handover: true }, ISSUED_PREFIX],
      [{ type: 'punishment_issued', punishmentId: 'pp1', holderId: ANN }, ISSUED_PREFIX],
      [{ type: 'task_issued', taskId: 'pd1', holderId: ANN, kind: 'demonstration' }, ISSUED_PREFIX],
      [{ type: 'hold_asked', holderId: ANN, answer: 'release' }, ISSUED_PREFIX],
      [{ type: 'hold_asked', holderId: ANN, answer: 'extend' }, ISSUED_PREFIX],
      [{ type: 'task_kept', holderId: ANN, taskId: 'pt1', cancelled: true }, ISSUED_PREFIX],
      ...Object.keys(TUNING.practice.permission.words).map((answer): [Record<string, unknown>, string] => [{ type: 'permission_answered', holderId: ANN, answer }, 'practice:permission:']),
      [{ type: 'ask_answered', unitId: ANN, what: 'task', answer: 'accepted' }, 'practice:ask:'],
      [{ type: 'ask_answered', unitId: ANN, what: 'punishment', answer: 'refused', kind: true }, 'practice:ask:'],
      [{ type: 'ask_answered', unitId: ANN, what: 'task', answer: 'mocked' }, 'practice:ask:'],
      [{ type: 'hold_alarm', holderId: ANN, answer: 'release' }, 'practice:alarm:'],
      [{ type: 'hold_alarm', holderId: ANN, answer: 'keep' }, 'practice:alarm:'],
      [{ type: 'hold_alarm', holderId: ANN, answer: 'release_late' }, 'practice:alarm:'],
      ...Object.keys(TUNING.practice.slap.words).map((result): [Record<string, unknown>, string] => [{ type: 'slap_dealt', holderId: ANN, result }, 'practice:slap:']),
      [{ type: 'service_rated', holderId: ANN, kind: 'pleased' }, 'practice:verdict:'],
      [{ type: 'service_rated', holderId: ANN, kind: 'adequate' }, 'practice:verdict:'],
      [{ type: 'service_rated', holderId: ANN, kind: 'displeased' }, 'practice:verdict:'],
    ];
    for (const [e, prefix] of cases) {
      const d = issuedDirective(event(e), s, reg);
      expect(d, JSON.stringify(e)).not.toBeNull();
      hygiene(d!, `${prefix}${ANN}`, 'next_reply');
      if (e.taskId === 'pt1' && e.kind === 'task' && e.type === 'task_issued') expect(d!.text).toContain('fetch the roster at');
    }
  });

  it('a sealed task and a sealed punishment are only an envelope; a task of no duration shows no end', () => {
    const s = inScene(withPractices(base(), {
      tasks: [task({ status: 'offered', sealed: true, summary: 'private-words-marker', text: WORDS })],
      punishments: [{ id: 'pp1', holderId: ANN, entryId: 'no_messages', severity: 2, offence: { kind: 'task_broken', stakes: 'major', day: 20 }, text: WORDS, summary: 'private-words-marker', status: 'offered', day: 20, sealed: true }],
    }), [ANN]);
    for (const e of [{ type: 'task_issued', taskId: 'pt1', holderId: ANN, kind: 'task' }, { type: 'punishment_issued', punishmentId: 'pp1', holderId: ANN }]) {
      const d = issuedDirective(e, s, reg)!;
      hygiene(d, ISSUED_PREFIX, 'next_reply');
      expect(d.text).toContain('sealed envelope');
    }
  });

  it('what is not live gives nothing: a holder who dropped below play, one who is gone, a scene she is not in', () => {
    const s = inScene(withPractices(base(), { tasks: [task({ status: 'offered' })] }), [ANN]);
    for (const e of [{ type: 'service_rated', holderId: ANN, kind: 'pleased' }, { type: 'slap_dealt', holderId: ANN, result: 'none' }, { type: 'permission_answered', holderId: ANN, answer: 'grant' }]) {
      const away = structuredClone(s);
      away.relations[ANN].dynamic!.frame = 'equal';
      expect(issuedDirective(e, away, reg), e.type).toBeNull();
    }
    expect(issuedDirective({ type: 'hold_alarm', holderId: ANN, answer: 'keep' }, base(), reg)).toBeNull(); // she is not in an open scene
  });

  it('the order of a refresh is stable: tasks, protocol, the punishment, the demonstration, targets, the double standard, the hold', () => {
    const s = inScene(withPractices(base(), {
      tasks: [task({ id: 'pt1' }), task({ id: 'pt2', targetUnitId: BEA, holderId: ANN })],
      punishments: [{ id: 'pp1', holderId: ANN, entryId: 'no_messages', severity: 2, offence: { kind: 'task_broken', stakes: 'major', day: 20 }, text: 'x', summary: 'a day without messages', status: 'accepted', answeredDay: 20, day: 20 }],
    }), [ANN, BEA]);
    s.practices!.unfair = { [ANN]: { kind: 'double_standard', day: s.day, sceneId: s.scene!.id } };
    const ids = practiceDirectives(s, reg, [ANN, BEA]).map((d) => d.id);
    expect(ids).toEqual([`${TASKS_PREFIX}${ANN}`, `${PUNISHMENT_PREFIX}${ANN}`, `practice:target:${BEA}`, `practice:double:${ANN}`]);
  });
});

describe('the prefix', () => {
  it('every id starts with practice: and no other package reserves it', () => {
    const OLDER = [
      'loyalty:', 'refusal:', 'threat:', 'discipline:', 'demand:', 'reputation:', 'nickname', 'content', 'limits:', 'lead', 'boundary:', 'want:', 'rule:',
      'publicity:', 'co_command:', 'ask:', 'prologue:', 'world:', 'stance:', 'friction:', 'personal:', 'special:', 'power:', 'warden:', 'development:', 'head_start:',
      'smother:', 'life:', 'blocking:', 'moment:', 'physics:', 'onboarding:', 'night', 'proposal:', 'dynamic:',
    ];
    expect(PRACTICE_PREFIX).toBe('practice:');
    for (const p of OLDER) {
      expect(PRACTICE_PREFIX.startsWith(p), p).toBe(false);
      expect(p.startsWith(PRACTICE_PREFIX), p).toBe(false);
    }
    const s = inScene(withTasks(holding(), [task()]), [ANN]);
    for (const d of practiceDirectives(s, reg, [ANN])) {
      expect(d.id.startsWith('practice:'), d.id).toBe(true);
      expect(OLDER.some((p) => d.id.startsWith(p)), d.id).toBe(false);
    }
  });

  it('no other directives.ts file sets an id that starts with practice:', () => {
    const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
    });
    for (const f of files('src').filter((x) => x.endsWith('directives.ts') && !x.startsWith(join('src', 'practice')))) {
      const text = readFileSync(f, 'utf8');
      expect(text, `${f} uses a practice: id`).not.toMatch(/['"`]practice:/);
    }
  });
});
