import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { plainDraft } from '../../../src/content/draft';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { deadlineSweep } from '../../../src/engine/practice/checks';
import { heldNow, startHold } from '../../../src/engine/practice/hold';
import { noDurationShare, requestPractice, rollNoDuration, rollSealed, sealedShare } from '../../../src/engine/practice/request';
import { canUndoPractice } from '../../../src/engine/practice/punish';
import { blankPractices, type OpenPunishment, type Task, type ValidOutput } from '../../../src/engine/practice/state';
import { deadlineShown, heldEndShown } from '../../../src/engine/practice/view';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { practiceDirectives } from '../../../src/practice/directives';
import { ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, unitOf, withService, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

type Style = 'cruel' | 'cold' | 'ritual' | 'possessive' | 'affectionate' | 'drill' | 'playful' | 'regal' | 'vindictive';
function holder(style: Style, frame: 'play' | 'role' | 'rule' = 'play'): CampaignState {
  const s = withService(world(reg, frame));
  unitOf(s, ANN).bond!.practice!.style = { primary: style };
  return s;
}
/** A fixed set of 200 keys: the count of the ones that hit is exact, and pinned. */
const KEYS = Array.from({ length: 200 }, (_, i) => `k${i}`);
const hits = (s: CampaignState, roll: (s: CampaignState, reg: Registries, id: string, key: string) => boolean): number => KEYS.filter((k) => roll(s, reg, ANN, k)).length;

describe('the seal share by style', () => {
  it('reads the share by her primary style (cruel and vindictive 0.25, playful and regal 0.15, ritual 0.02, the rest 0.05)', () => {
    expect(sealedShare(holder('cruel'), reg, ANN)).toBe(0.25);
    expect(sealedShare(holder('vindictive'), reg, ANN)).toBe(0.25);
    expect(sealedShare(holder('playful'), reg, ANN)).toBe(0.15);
    expect(sealedShare(holder('ritual'), reg, ANN)).toBe(0.02);
    expect(sealedShare(holder('cold'), reg, ANN)).toBe(0.05);
  });

  it('over 200 fixed keys the counts are exact (pinned) and follow the shares', () => {
    const counts = Object.fromEntries((['cruel', 'ritual', 'cold', 'playful'] as const).map((st) => [st, hits(holder(st), rollSealed)]));
    expect(counts).toEqual({ cruel: 48, ritual: 2, cold: 6, playful: 30 });
    expect(counts.cruel).toBeGreaterThan(counts.playful);
    expect(counts.playful).toBeGreaterThan(counts.cold);
  });

  it('no draw: the roll is hashed from the unit, the key and the day, and the same key answers the same', () => {
    const s = holder('cruel');
    const before = JSON.stringify(s.rng);
    expect(KEYS.map((k) => rollSealed(s, reg, ANN, k))).toEqual(KEYS.map((k) => rollSealed(s, reg, ANN, k)));
    expect(JSON.stringify(s.rng)).toBe(before);
  });
});

describe('the no-duration share by style', () => {
  it('cruel, possessive and vindictive 0.3, the others 0.1, ritual and drill never', () => {
    expect(noDurationShare(holder('cruel'), reg, ANN)).toBe(0.3);
    expect(noDurationShare(holder('possessive'), reg, ANN)).toBe(0.3);
    expect(noDurationShare(holder('vindictive'), reg, ANN)).toBe(0.3);
    expect(noDurationShare(holder('affectionate'), reg, ANN)).toBe(0.1);
    expect(noDurationShare(holder('ritual'), reg, ANN)).toBe(0);
    expect(noDurationShare(holder('drill'), reg, ANN)).toBe(0);
  });

  it('ritual and drill never use no duration, whatever the key; the others do now and then', () => {
    expect(hits(holder('ritual'), rollNoDuration)).toBe(0);
    expect(hits(holder('drill'), rollNoDuration)).toBe(0);
    expect(hits(holder('cruel'), rollNoDuration)).toBe(65);
    expect(hits(holder('cold'), rollNoDuration)).toBe(20);
  });
});

describe('a request carries the rolls', () => {
  /** Makes `n` requests of a kind in a row (each closed again) and says how many came out sealed and without a duration. */
  const requests = (s: CampaignState, kind: 'task' | 'punishment' | 'hold' | 'protocol', n: number, extra: Record<string, unknown> = {}) => {
    const out = { sealed: 0, noDuration: 0 };
    for (let i = 0; i < n; i++) {
      const d = structuredClone(s);
      d.practices = { ...blankPractices(), seq: i };
      requestPractice(d, ctxOf(d, reg), ANN, kind, { ...(kind === 'punishment' ? { offence: { kind: 'task_broken' as const, stakes: 'minor' as const, day: d.day }, severity: 2 as const, entryId: 'no_messages' } : {}), ...extra });
      const q = d.practices!.requests[0];
      if (q?.sealed === true) out.sealed++;
      if (q?.noDuration === true) out.noDuration++;
    }
    return out;
  };

  it('a cruel holder seals some tasks and hides some durations; a ritual one hides none', () => {
    const cruel = requests(holder('cruel'), 'task', 60);
    expect(cruel.sealed).toBeGreaterThan(0);
    expect(cruel.noDuration).toBeGreaterThan(0);
    const ritual = requests(holder('ritual'), 'task', 60);
    expect(ritual.noDuration).toBe(0);
    expect(requests(holder('drill'), 'task', 60).noDuration).toBe(0);
  });

  it('punishments and holds roll too; what the commander asked for is never sealed, and a protocol or a denial has neither', () => {
    expect(requests(holder('cruel'), 'punishment', 60).sealed).toBeGreaterThan(0);
    expect(requests(holder('cruel'), 'hold', 60).noDuration).toBeGreaterThan(0);
    expect(requests(holder('cruel'), 'task', 60, { asked: true }).sealed).toBe(0);
    expect(requests(holder('cruel'), 'protocol', 60)).toEqual({ sealed: 0, noDuration: 0 });
  });

  it('draws nothing: state.rng is unchanged by a request', () => {
    const s = holder('cruel');
    const before = JSON.stringify(s.rng);
    requestPractice(s, ctxOf(s, reg), ANN, 'task');
    expect(JSON.stringify(s.rng)).toBe(before);
  });
});

const card = (over: Partial<ValidOutput> = {}): ValidOutput => ({
  kind: 'task', seedId: 'task_report_at_dusk', tags: ['service'], track: 'service', tier: 1, stakes: 'minor', check: 'model', proof: 'none', deadline: { days: 2 }, text: 'Report to me at dusk.', summary: 'report at dusk', ...over,
});
const issued = (s: CampaignState, flags: { sealed?: true; noDuration?: true }, over: Partial<ValidOutput> = {}) => {
  s.practices = { ...blankPractices(), seq: 3, requests: [{ id: 'pq1', holderId: ANN, kind: 'task', day: s.day, seedIds: ['task_report_at_dusk'], ...flags }] };
  const r = run(s, reg, { type: 'practice/issue', payload: { requestId: 'pq1', output: card(over) } });
  expect(errors(r.events)).toEqual([]);
  return r;
};
const taskOf = (s: CampaignState): Task => s.practices!.tasks.at(-1)!;

describe('a sealed task', () => {
  it('is written sealed: one button', () => {
    const r = issued(holder('cruel'), { sealed: true });
    expect(taskOf(r.state)).toMatchObject({ sealed: true, acceptForm: 'sealed', status: 'offered' });
    expect(ofType(r.events, 'task_issued')).toMatchObject([{ sealed: true }]);
  });

  it('accepting opens it: practice_opened, practice_signed and the record line "Signed blank. Day N."', () => {
    const r = issued(holder('cruel'), { sealed: true });
    const a = run(r.state, reg, { type: 'practice/answer_task', payload: { taskId: taskOf(r.state).id, answer: 'accept' } });
    expect(errors(a.events)).toEqual([]);
    expect(ofType(a.events, 'practice_opened')).toHaveLength(1);
    expect(ofType(a.events, 'practice_signed')).toMatchObject([{ sealed: true }]);
    expect(plainDraft(a.state.practices!.records[0].line)).toBe('Signed blank. Day 20.');
    expect(taskOf(a.state).status).toBe('open');
  });

  it('refusing it is a refusal at major', () => {
    const r = issued(holder('cruel'), { sealed: true }, { stakes: 'trivial' });
    const a = run(r.state, reg, { type: 'practice/answer_task', payload: { taskId: taskOf(r.state).id, answer: 'refuse' } });
    expect(a.state.relations[ANN].history.filter((h) => h.kind === 'event' && h.type === 'refused_demand')).toMatchObject([{ severity: 'major' }]);
  });

  it('while it is sealed the model is told only "a sealed task", never the summary', () => {
    const r = issued(holder('cruel'), { sealed: true });
    const t = taskOf(r.state);
    t.status = 'open';
    const lines = practiceDirectives(r.state, reg, [ANN]).map((d) => d.text).join(' ');
    expect(lines).toContain('a sealed task');
    expect(lines).not.toContain(t.summary);
  });
});

describe('a sealed punishment', () => {
  const sealedPunishment = (): CampaignState => {
    const s = holder('cruel');
    const p: OpenPunishment = {
      id: 'pp1', holderId: ANN, entryId: 'no_messages', severity: 2, offence: { kind: 'task_broken', stakes: 'minor', day: s.day }, text: 'AUTHOR TO WRITE: A talking-to.', summary: 'a talking-to', status: 'offered', day: s.day, sealed: true,
    };
    s.practices = { ...blankPractices(), seq: 3, punishments: [p] };
    return s;
  };

  it('accepting opens it as a task does: practice_opened, a signed-blank record line; and it cannot be undone, the record is kept', () => {
    const a = run(sealedPunishment(), reg, { type: 'practice/answer_punishment', payload: { punishmentId: 'pp1', answer: 'accept' } });
    expect(errors(a.events)).toEqual([]);
    expect(ofType(a.events, 'practice_opened')).toMatchObject([{ punishmentId: 'pp1', holderId: ANN }]);
    expect(ofType(a.events, 'practice_signed')).toMatchObject([{ sealed: true }]);
    expect(plainDraft(a.state.practices!.records.at(-1)!.line)).toBe('Signed blank. Day 20.');
    expect(canUndoPractice(a.state, 'pp1')).toMatch(/signed/i);
  });

  it('an open punishment is not sealed after it was accepted (the record stays); one that is not sealed writes no line', () => {
    const s = sealedPunishment();
    delete s.practices!.punishments[0].sealed;
    const a = run(s, reg, { type: 'practice/answer_punishment', payload: { punishmentId: 'pp1', answer: 'accept' } });
    expect(a.state.practices!.records).toEqual([]);
    expect(ofType(a.events, 'practice_opened')).toEqual([]);
  });
});

describe('no duration hides the end', () => {
  it('a hold with no duration still ends at its stored end; its events, the view and the directive show none', () => {
    const s = holder('cruel', 'role');
    s.slot = 'morning';
    dynamicOf(s, ANN)!.hold = 70;
    const d = structuredClone(s);
    const events = startHold(d, ctxOf(d, reg), ANN, 2, { hidden: true });
    expect(ofType(events, 'hold_started')[0]).toMatchObject({ hidden: true });
    expect(ofType(events, 'hold_started')[0]).not.toHaveProperty('until');
    const held = d.practices!.held!;
    expect(held.hidden).toBe(true);
    expect(held.until).toEqual({ day: 20, slot: 'afternoon' }); // the engine still keeps the end
    expect(heldEndShown(held)).toBeNull();
    expect(heldNow(d)).not.toBeNull();
    const lines = practiceDirectives(d, reg, [ANN]).map((x) => x.text).join(' ');
    expect(lines).not.toMatch(/afternoon|until|morning/i);
    const open = structuredClone(held);
    delete open.hidden;
    expect(heldEndShown(open)).toEqual({ day: 20, slot: 'afternoon' });
    // two slots pass: it ran out at its stored end
    let cur = d;
    for (let i = 0; i < 2; i++) cur = run(cur, reg, { type: 'calendar/consume_slot' }).state;
    expect(cur.practices?.held).toBeUndefined();
  });

  it('a task with no duration shows no deadline but still has one, and the sweep settles it at the deadline', () => {
    const r = issued(holder('cruel'), { noDuration: true }, { stakes: 'trivial' });
    const t = taskOf(r.state);
    expect(t).toMatchObject({ noDuration: true, deadline: { day: 22 } });
    expect(deadlineShown(t)).toBeNull();
    expect(deadlineShown({ deadline: { day: 22 } })).toEqual({ day: 22 });
    const accepted = run(r.state, reg, { type: 'practice/answer_task', payload: { taskId: t.id, answer: 'accept' } }).state;
    const later = structuredClone(accepted);
    later.day = 23;
    const events = deadlineSweep(later, ctxOf(later, reg));
    expect(ofType(events, 'task_broken').length + ofType(events, 'task_kept').length + ofType(events, 'task_void').length).toBe(1);
  });

  it('a punishment with no duration keeps its count to herself', () => {
    const s = holder('cruel');
    s.practices = { ...blankPractices(), seq: 3, requests: [{ id: 'pq1', holderId: ANN, kind: 'punishment', day: s.day, seedIds: [], offence: { kind: 'task_broken', stakes: 'minor', day: s.day }, severity: 2, entryId: 'no_messages', noDuration: true }] };
    const r = run(s, reg, { type: 'practice/issue', payload: { requestId: 'pq1', output: { kind: 'punishment', tags: [], track: 'discipline', tier: 1, stakes: 'minor', check: 'model', proof: 'none', text: 'AUTHOR TO WRITE: x', summary: 'a talking-to' } } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.practices!.punishments[0].hiddenCount).toBe(true);
  });
});

describe('the tuning drafts are the spec', () => {
  it('the shares are the R.12 table', () => {
    expect(TUNING.practice.sealedShare.cruel).toBe(0.25);
    expect(TUNING.practice.noDurationShare.ritual).toBe(0);
  });
});
