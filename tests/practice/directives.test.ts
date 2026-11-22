import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/practice';
import type { OpenPunishment, Task } from '../../src/engine/practice/state';
import type { CampaignState } from '../../src/engine/state/types';
import type { Directive } from '../../src/llm/context';
import { applyIssuedDirectives, clearPracticeDirectives, ISSUED_PREFIX, PRACTICE_PREFIX, practiceDirectives, PUNISHMENT_PREFIX, refreshPracticeDirectives, TASKS_PREFIX } from '../../src/practice/directives';
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
