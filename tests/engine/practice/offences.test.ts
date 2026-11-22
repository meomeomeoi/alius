import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { noteOffence, offencesFromEvents, pickHolderPunishment, severityOf } from '../../../src/engine/practice/offences';
import { blankPractices, type Offence, type OpenPunishment, type Task } from '../../../src/engine/practice/state';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { errors, loadCore, ofType, run, stubExpedition } from '../../helpers/world';
import { ANN, BEA, CAT, unitOf, withService, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ctxOf = (d: CampaignState) => ({ registries: reg, rng: new Rng(d.rng) });
const offence = (over: Partial<Offence> = {}): Offence => ({ kind: 'task_broken', ref: 'pt1', stakes: 'minor', day: 20, ...over });
const punishmentRequests = (s: CampaignState) => s.practices?.requests.filter((r) => r.kind === 'punishment') ?? [];
const given = (n: number): OpenPunishment[] =>
  Array.from({ length: n }, (_, i) => ({ id: `pp${i + 1}`, holderId: ANN, entryId: 'corner_time', severity: 1, offence: offence(), text: 'x', summary: 'x', status: 'done', day: 10 }) as OpenPunishment);

describe('severity by the rule', () => {
  it('a minor offence by a cruel holder at rule with two offences this fortnight is 2 + 1 + 1 + 1 = 5', () => {
    const s = world(reg, 'rule');
    unitOf(s, ANN).bond!.practice!.style = { primary: 'cruel' };
    s.practices = { ...blankPractices(), offences: { [ANN]: [18, 19] } };
    expect(severityOf(s, reg, ANN, offence({ stakes: 'minor' }))).toBe(5);
  });

  it('an affectionate holder at play for a trivial offence is max(1, 1 - 1 - 1) = 1', () => {
    const s = world(reg, 'play');
    unitOf(s, ANN).bond!.practice!.style = { primary: 'affectionate' };
    expect(severityOf(s, reg, ANN, offence({ stakes: 'trivial' }))).toBe(1);
  });

  it('the stakes, the frame and a repeat each count once; an old offence does not repeat', () => {
    const s = world(reg, 'role'); // primary cold: no term
    expect(severityOf(s, reg, ANN, offence({ stakes: 'major' }))).toBe(3);
    expect(severityOf(s, reg, ANN, offence({ stakes: 'severe' }))).toBe(4);
    s.practices = { ...blankPractices(), offences: { [ANN]: [2, 3, 19] } }; // two are older than the fortnight
    expect(severityOf(s, reg, ANN, offence({ stakes: 'major' }))).toBe(3);
    s.practices!.offences[ANN] = [15, 19];
    expect(severityOf(s, reg, ANN, offence({ stakes: 'major' }))).toBe(4);
  });
});

describe('noting an offence', () => {
  it('asks for one punishment of the picked entry and weight, and is noted once per ref and day', () => {
    const s = world(reg, 'role');
    const d = structuredClone(s);
    const first = noteOffence(d, ctxOf(d), ANN, offence());
    expect(ofType(first, 'practice_requested')).toHaveLength(1);
    expect(punishmentRequests(d)).toMatchObject([{ holderId: ANN, kind: 'punishment', offence: { kind: 'task_broken', ref: 'pt1' }, severity: 2 }]);
    expect(punishmentRequests(d)[0].entryId).toBeTypeOf('string');
    expect(d.practices!.offences[ANN]).toEqual([20]);
    expect(noteOffence(d, ctxOf(d), ANN, offence())).toEqual([]);
    expect(d.practices!.offences[ANN]).toEqual([20]);
    expect(punishmentRequests(d)).toHaveLength(1);
    // another ref the same day is another offence (it counts), but one punishment is asked for at a time
    expect(noteOffence(d, ctxOf(d), ANN, offence({ ref: 'pt2' }))).toEqual([]);
    expect(d.practices!.offences[ANN]).toEqual([20, 20]);
    expect(punishmentRequests(d)).toHaveLength(1);
    // the next day the same ref counts again
    d.day = 21;
    d.practices!.requests = [];
    expect(ofType(noteOffence(d, ctxOf(d), ANN, offence({ day: 21 })), 'practice_requested')).toHaveLength(1);
  });

  it('a holder who is not live is not noted and nothing is written; no rng is drawn', () => {
    const s = world(reg, 'equal');
    const d = structuredClone(s);
    expect(noteOffence(d, ctxOf(d), ANN, offence())).toEqual([]);
    expect(d.practices).toBeUndefined();
    const live = structuredClone(world(reg, 'role'));
    const rng = structuredClone(live.rng);
    noteOffence(live, ctxOf(live), ANN, offence());
    expect(live.rng).toEqual(rng);
  });

  it('a punishment already waiting for her answer is not stacked', () => {
    const s = world(reg, 'role');
    s.practices = { ...blankPractices(), seq: 2, punishments: [{ ...given(1)[0], status: 'offered' }] };
    expect(noteOffence(s, ctxOf(s), ANN, offence())).toEqual([]);
    expect(punishmentRequests(s)).toHaveLength(0);
    expect(s.practices!.offences[ANN]).toEqual([20]);
  });
});

describe('what she answers in the lower layers', () => {
  const after = (s: CampaignState, events: Array<Record<string, unknown>>) => {
    const d = structuredClone(s);
    const out = offencesFromEvents(d, ctxOf(d), events as never);
    return { state: d, events: out };
  };

  it('her discipline after a refusal at role: refusal_noted { what: demand } asks for a punishment; at play none', () => {
    const role = after(world(reg, 'role'), [{ type: 'refusal_noted', unitId: ANN, what: 'demand' }]);
    expect(punishmentRequests(role.state)).toMatchObject([{ holderId: ANN, offence: { kind: 'refusal', stakes: 'minor' } }]);
    const play = after(world(reg, 'play'), [{ type: 'refusal_noted', unitId: ANN, what: 'demand' }]);
    expect(play.state.practices).toBeUndefined();
  });

  it('a milestone and a defied override have their own offence, a refusal of a task is not entered twice', () => {
    const s = world(reg, 'role');
    expect(after(s, [{ type: 'refusal_noted', unitId: ANN, what: 'milestone' }]).state.practices).toBeUndefined();
    expect(punishmentRequests(after(s, [{ type: 'milestone_refused', unitId: ANN, milestoneId: 'dm1' }]).state)[0].offence?.kind).toBe('milestone_refused');
    expect(after(s, [{ type: 'refusal_noted', unitId: ANN, what: 'defy' }]).state.practices).toBeUndefined();
    expect(punishmentRequests(after(s, [{ type: 'override_answered', unitId: ANN, source: 'holder', answer: 'defy', overrideId: 'ov1' }]).state)[0].offence?.kind).toBe('countermand_overruled');
    expect(after(s, [{ type: 'override_answered', unitId: ANN, source: 'warden', answer: 'defy', overrideId: 'ov1' }]).state.practices).toBeUndefined();
    expect(after(s, [{ type: 'override_answered', unitId: ANN, source: 'holder', answer: 'comply', overrideId: 'ov1' }]).state.practices).toBeUndefined();
  });

  it('refusing a task at role makes one offence, not two (answerTask enters it, the refusal_noted beside it is skipped)', () => {
    const s = withService(world(reg, 'role'));
    const t: Task = {
      id: 'pt1', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'minor', check: 'model', proof: 'none', text: 'Carry it.', summary: 'carry it', status: 'offered', acceptForm: 'button_cost', day: 20,
    };
    s.practices = { ...blankPractices(), seq: 2, tasks: [t] };
    const r = run(s, reg, { type: 'practice/answer_task', payload: { taskId: 'pt1', answer: 'refuse' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.practices!.offences[ANN]).toEqual([20]);
    expect(punishmentRequests(r.state)).toHaveLength(1);
  });

  it('a slip or a caught cheat in her run is an offence of stakes minor, once per run; a rule of hers broken is one too', () => {
    const s = world(reg, 'play');
    const slip = after(s, [{ type: 'physics_slip', runId: 'r1', holderId: ANN, kind: 'slip', count: 2 }, { type: 'physics_slip', runId: 'r1', holderId: ANN, kind: 'skip', count: 1 }]);
    expect(punishmentRequests(slip.state)).toMatchObject([{ offence: { kind: 'physics_slip', ref: 'r1', stakes: 'minor' } }]);
    expect(slip.state.practices!.offences[ANN]).toEqual([20]);
    const caught = after(s, [{ type: 'physics_caught', runId: 'r1', holderId: ANN, kind: 'cheat', beat: -1 }]);
    expect(punishmentRequests(caught.state)).toMatchObject([{ offence: { kind: 'physics_caught', stakes: 'minor' } }]);
    const rule = after(s, [{ type: 'rule_broken', ruleId: 'ru1', unitId: ANN }]);
    expect(punishmentRequests(rule.state)).toMatchObject([{ offence: { kind: 'rule_broken', ref: 'ru1' } }]);
  });

  it('nothing of the events that are not offences', () => {
    const s = world(reg, 'role');
    const d = structuredClone(s);
    expect(offencesFromEvents(d, ctxOf(d), [{ type: 'scene_started' }, { type: 'task_kept', unitId: ANN }] as never)).toEqual([]);
    expect(d).toEqual(s);
  });

  it('a slip of her habit (the intent) is entered by its handler: minor before others, trivial alone', async () => {
    const { applyPracticeIntent } = await import('../../../src/engine/practice/intents');
    const s = world(reg, 'play');
    const ev = { type: 'protocol_slip', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'x', confidence: 1 } as never;
    const alone = structuredClone(s);
    applyPracticeIntent(alone, { registries: reg }, ANN, ev);
    expect(punishmentRequests(alone)[0].offence).toMatchObject({ kind: 'protocol_slip', stakes: 'trivial' });
    const crowd = structuredClone(s);
    crowd.scene = { id: 's1', day: 20, slot: crowd.slot, locationId: 'quarters_commander', participants: [ANN, BEA], mode: 'group', origin: 'event', consumesSlot: false, startIndex: 0, readIndex: 0, exchanges: 0 } as never;
    applyPracticeIntent(crowd, { registries: reg }, ANN, ev);
    expect(punishmentRequests(crowd)[0].offence).toMatchObject({ kind: 'protocol_slip', stakes: 'minor' });
  });
});

describe('the pick reads severity and effects', () => {
  it('two entries of severity 3 take turns by her count', () => {
    const s = world(reg, 'role');
    const at = (n: number) => { const d = structuredClone(s); d.practices = { ...blankPractices(), punishments: given(n) }; return pickHolderPunishment(d, reg, ANN, 3); };
    const first = at(0);
    const second = at(1);
    expect([first, second].sort()).toEqual(['kept_in_quarters', 'on_the_record']);
    expect(at(2)).toBe(first);
    expect(reg.holderPunishments.get(first!)!.severity).toBe(3);
  });

  it('a confession entry is skipped with no other unit at base; a slot_held entry is skipped inside a run', () => {
    const s = world(reg, 'role');
    s.practices = { ...blankPractices(), punishments: given(1) }; // her turn is the confession
    expect(pickHolderPunishment(s, reg, ANN, 3)).toBe('on_the_record');
    unitOf(s, BEA).status = 'dead';
    unitOf(s, CAT).status = 'dead';
    expect(pickHolderPunishment(s, reg, ANN, 3)).toBe('kept_in_quarters');
    const run1 = world(reg, 'role');
    run1.expedition = stubExpedition(run1, { party: [BEA] });
    run1.practices = { ...blankPractices(), punishments: given(0) }; // her turn is the held slot
    expect(pickHolderPunishment(run1, reg, ANN, 3)).toBe('on_the_record');
    run1.expedition = stubExpedition(run1, { party: [BEA, CAT] }); // nobody at base to confess before, and no held slot in a run: the next lower weight
    expect(reg.holderPunishments.get(pickHolderPunishment(run1, reg, ANN, 3)!)!.severity).toBe(2);
  });

  it('with physical_discipline_shown off the physical and slap entries are never picked', () => {
    const s = world(reg, 'role');
    for (let n = 0; n < 4; n++) {
      s.practices = { ...blankPractices(), punishments: given(n) };
      for (let sev = 1; sev <= 5; sev++) {
        const id = pickHolderPunishment(s, reg, ANN, sev);
        const effects = (reg.holderPunishments.get(id!)!.effects as Array<{ type: string }>).map((e) => e.type);
        expect(effects, `${id} at ${sev}`).not.toContain('physical');
        expect(effects).not.toContain('slap');
      }
    }
    s.content = { enabled: [...(s.content?.enabled ?? []), 'physical_discipline_shown'] };
    s.practices = { ...blankPractices(), punishments: given(0) };
    expect(pickHolderPunishment(s, reg, ANN, 4)).toBe('the_slap');
  });

  it('nothing allowed at 3 takes the next lower weight; nothing at all is null', () => {
    const s = world(reg, 'role');
    s.content = { enabled: [] }; // restraint and public_humiliation off
    const lower = pickHolderPunishment(s, reg, ANN, 3);
    expect(reg.holderPunishments.get(lower!)!.severity).toBe(2);
    unitOf(s, ANN).bond!.ownLimits.categories = [];
    expect(pickHolderPunishment(s, reg, ANN, 0.5)).toBe(null);
  });

  it('a public entry needs her audience to allow it', () => {
    const s = world(reg, 'role');
    s.practices = { ...blankPractices(), punishments: given(1) };
    expect(pickHolderPunishment(s, reg, ANN, 3)).toBe('on_the_record');
    unitOf(s, ANN).bond!.practice!.audience = 'private_only';
    expect(pickHolderPunishment(s, reg, ANN, 3)).toBe('kept_in_quarters');
  });
});

describe('punishment_issued', () => {
  const issueFor = (over: Partial<Offence> = {}) => {
    const s = world(reg, 'role');
    const d = structuredClone(s);
    noteOffence(d, ctxOf(d), ANN, offence(over));
    return run(d, reg, { type: 'practice/issue', payload: { requestId: d.practices!.requests[0].id } });
  };

  it('is emitted when it is issued, with the severity and the offence kind; an unfair one says so', () => {
    const r = issueFor();
    expect(errors(r.events)).toEqual([]);
    const issued = ofType(r.events, 'punishment_issued');
    expect(issued).toMatchObject([{ holderId: ANN, unitId: ANN, severity: 2, offence: 'task_broken' }]);
    expect(issued[0]).not.toHaveProperty('unfair');
    const pun = r.state.practices!.punishments[0];
    expect(pun).toMatchObject({ holderId: ANN, status: 'offered', severity: 2, plain: true, offence: { kind: 'task_broken' } });
    expect(r.state.practices!.requests).toEqual([]);
    expect(reg.holderPunishments.has(pun.entryId)).toBe(true);
    expect(pun.summary).toBe(String(reg.holderPunishments.get(pun.entryId)!.label));
    const unfair = issueFor({ kind: 'unfair', unfair: true, ref: 'u1' });
    expect(ofType(unfair.events, 'punishment_issued')).toMatchObject([{ unfair: true, offence: 'unfair' }]);
  });

  it('a card from the model carries only its words; the entry and the weight stay the engine\'s', () => {
    const s = world(reg, 'role');
    const d = structuredClone(s);
    noteOffence(d, ctxOf(d), ANN, offence({ stakes: 'major' }));
    const req = d.practices!.requests[0];
    const r = run(d, reg, { type: 'practice/issue', payload: { requestId: req.id, output: { kind: 'punishment', text: 'Stand there until I say.', summary: 'stand there', tags: ['nonsense'], stakes: 'severe', tier: 5 } } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.practices!.punishments[0]).toMatchObject({ entryId: req.entryId, severity: 3, text: 'Stand there until I say.', summary: 'stand there' });
    expect(r.state.practices!.punishments[0].plain).toBeUndefined();
    // a pronoun for the commander is a rejection: the card does not fit, the request stays
    const bad = run(d, reg, { type: 'practice/issue', payload: { requestId: req.id, output: { kind: 'punishment', text: 'He knows what he did.', summary: 'x' } } });
    expect(errors(bad.events)).toHaveLength(1);
  });

  it('the day step never asks for a punishment by itself', async () => {
    const { kindsToday } = await import('../../../src/engine/practice/dayStep');
    const s = world(reg, 'role');
    expect(kindsToday(s, reg, ANN)).not.toContain('punishment');
  });
});
