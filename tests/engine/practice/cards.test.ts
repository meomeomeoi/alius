import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { ensurePractices } from '../../../src/engine/practice/gate';
import { issuePractice, requestOf } from '../../../src/engine/practice/issue';
import { cardOf, practiceKindOf } from '../../../src/engine/practice/request';
import { fallbackLine } from '../../../src/engine/practice/seeds';
import type { OpenDemonstration, PracticeRequest, ValidOutput } from '../../../src/engine/practice/state';
import { writeTask } from '../../../src/engine/practice/tasks';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { loadCore, ofType } from '../../helpers/world';
import { ANN, withService, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const ctxOf = (d: CampaignState) => ({ registries: reg, rng: new Rng(d.rng) });

const punishRequest = (id = 'pq9'): PracticeRequest => ({ id, holderId: ANN, kind: 'punishment', day: 20, seedIds: [], severity: 2, entryId: 'no_messages', offence: { kind: 'task_broken', stakes: 'minor', day: 20 } });
const card = (text: string): ValidOutput => ({ kind: 'punishment', tags: [], track: 'discipline', tier: 1, stakes: 'minor', check: 'model', proof: 'none', text, summary: text.toLowerCase() });

describe('one card of a request, whatever the kind (I8)', () => {
  it('writeTask stamps the request id itself', () => {
    const d = structuredClone(withService(world(reg, 'role')));
    const request: PracticeRequest = { id: 'pq7', holderId: ANN, kind: 'task', day: 20, seedIds: [] };
    const out: ValidOutput = { kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'trivial', check: 'model', proof: 'none', text: 'Do it.', summary: 'do it' };
    writeTask(d, ctxOf(d), request, out, false);
    expect(d.practices!.tasks[0].requestId).toBe('pq7');
  });

  it('cardOf finds a task, a punishment and a demonstration by their request', () => {
    const s = withService(world(reg, 'role'));
    const p = ensurePractices(s);
    p.tasks.push({ id: 'pt1', holderId: ANN, kind: 'task', tags: [], track: 'service', tier: 1, stakes: 'trivial', check: 'model', proof: 'none', text: 't', summary: 's', status: 'offered', acceptForm: 'button', day: 20, requestId: 'pq1' });
    p.punishments.push({ id: 'pp1', holderId: ANN, entryId: 'no_messages', severity: 2, offence: { kind: 'task_broken', stakes: 'minor', day: 20 }, text: 't', summary: 's', status: 'offered', day: 20, requestId: 'pq2' });
    const demo: OpenDemonstration = { id: 'pd1', holderId: ANN, tags: [], summary: 's', text: 't', audienceIds: [], stage: 'mess_hall', day: 20, status: 'offered', requestId: 'pq3' };
    p.demonstrations.push(demo);
    expect(cardOf(s, 'pq1')).toMatchObject({ kind: 'task', status: 'offered', card: { id: 'pt1' } });
    expect(cardOf(s, 'pq2')).toMatchObject({ kind: 'punishment', status: 'offered', card: { id: 'pp1' } });
    expect(cardOf(s, 'pq3')).toMatchObject({ kind: 'demonstration', status: 'offered', card: { id: 'pd1' } });
    expect(cardOf(s, 'pq404')).toBeUndefined();
    expect(practiceKindOf(s, 'pq2')).toBe('punishment');
    expect(practiceKindOf(s, 'pq3')).toBe('demonstration');
    expect(practiceKindOf(s, 'pq404')).toBeUndefined();
  });

  it('an offered punishment is rebuilt as a request (its entry, its weight, its offence), an answered one is not', () => {
    const d = structuredClone(withService(world(reg, 'role')));
    ensurePractices(d).requests.push(punishRequest());
    issuePractice(d, ctxOf(d), 'pq9', card('No messages today.'));
    const found = requestOf(d, reg, 'pq9')!;
    expect(found.replaced).toBe(d.practices!.punishments[0]);
    expect(found.request).toMatchObject({ id: 'pq9', kind: 'punishment', holderId: ANN, entryId: 'no_messages', severity: 2, offence: { kind: 'task_broken' } });
    d.practices!.punishments[0].status = 'accepted';
    expect(requestOf(d, reg, 'pq9')).toBeUndefined();
  });

  it('a new card for an offered punishment replaces it in place: same id, same place, the reroll says so, the rng stays', () => {
    const d = structuredClone(withService(world(reg, 'role')));
    const p = ensurePractices(d);
    p.requests.push(punishRequest());
    issuePractice(d, ctxOf(d), 'pq9', card('No messages today.'));
    p.requests.push(punishRequest('pq10')); // a second, to check the place
    issuePractice(d, ctxOf(d), 'pq10', card('Second.'));
    const first = p.punishments[0];
    const rng = structuredClone(d.rng);
    const events = issuePractice(d, ctxOf(d), 'pq9', card('Not a word to anyone today.'));
    expect(p.punishments).toHaveLength(2);
    expect(p.punishments[0]).toMatchObject({ id: first.id, requestId: 'pq9', text: 'Not a word to anyone today.', status: 'offered' });
    expect(p.punishments[1].requestId).toBe('pq10');
    expect(ofType(events, 'punishment_issued')).toMatchObject([{ punishmentId: first.id, rerolled: true }]);
    expect(d.rng).toEqual(rng);
  });

  it('the fallback never replaces a punishment card; one that was answered is gone', () => {
    const d = structuredClone(withService(world(reg, 'role')));
    ensurePractices(d).requests.push(punishRequest());
    issuePractice(d, ctxOf(d), 'pq9', card('x'));
    expect(() => issuePractice(d, ctxOf(d), 'pq9', 'fallback')).toThrow(/gone/);
    d.practices!.punishments[0].status = 'refused';
    expect(() => issuePractice(d, ctxOf(d), 'pq9', card('y'))).toThrow(/gone/);
    expect(fallbackLine('punishment', 'x')).toContain('x');
  });
});
