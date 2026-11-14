import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const fresh = (n = 2, mode: 'prologue' | 'veteran' = 'prologue') => campaign(reg, n, { onboarding: mode });
const complete = (s: CampaignState, stepId = s.onboarding!.stepId) => run(s, reg, { type: 'onboarding/complete_step', payload: { stepId } });
const skip = (s: CampaignState, stepId = s.onboarding!.stepId) => run(s, reg, { type: 'onboarding/skip_step', payload: { stepId } });

describe('onboarding/complete_step', () => {
  it('advances to the next step and emits started', () => {
    const s = fresh();
    const r = complete(s);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.onboarding).toMatchObject({ stepId: 'first_words', completed: expect.arrayContaining(['lineup']) });
    expect(ofType(r.events, 'onboarding_step_completed')).toEqual([{ type: 'onboarding_step_completed', stepId: 'lineup' }]);
    expect(ofType(r.events, 'onboarding_step_started')).toEqual([{ type: 'onboarding_step_started', stepId: 'first_words' }]);
  });

  it('records the day the new step began', () => {
    const s = fresh();
    s.day = 3;
    expect(complete(s).state.onboarding!.stepDay).toBe(3);
  });

  it('a stale step id is refused and the state is unchanged', () => {
    const s = fresh();
    const r = complete(s, 'tutorial');
    expect(errors(r.events)[0]).toMatchObject({ code: 'handler_failed', message: expect.stringMatching(/Stale onboarding step/) });
    expect(r.state).toBe(s);
    const r2 = run(s, reg, { type: 'onboarding/complete_step', payload: {} });
    expect(errors(r2.events)).toHaveLength(1);
  });

  it('refuses an unmet condition with its reason', () => {
    const s = fresh();
    s.scene = { id: 's1' } as unknown as CampaignState['scene'];
    const r = complete(s);
    expect(errors(r.events)[0]).toMatchObject({ message: 'A scene is still open.' });
    expect(r.state).toBe(s);
  });

  it('walking the whole prologue ends in free play', () => {
    let s = fresh();
    s.onboarding = { ...s.onboarding!, stepId: 'first_evening' };
    s.day = 1;
    s = { ...s, day: 2 };
    const r = complete(s);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.onboarding).toMatchObject({ stepId: 'free', done: true });
    expect(r.state.onboarding!.completed).toEqual(expect.arrayContaining(['first_evening', 'free']));
  });

  it('entering free sets done and emits onboarding_done', () => {
    let s = fresh();
    s.onboarding = { ...s.onboarding!, stepId: 'first_evening' };
    s = { ...s, day: 2 };
    const r = complete(s);
    expect(ofType(r.events, 'onboarding_done')).toHaveLength(1);
    expect(r.state.onboarding!.done).toBe(true);
  });
});

describe('onboarding/skip_step', () => {
  it('refuses a non-skippable step', () => {
    const s = fresh();
    s.onboarding = { ...s.onboarding!, stepId: 'free' };
    const r = skip(s);
    expect(errors(r.events)[0]).toMatchObject({ message: expect.stringMatching(/cannot be skipped/) });
  });

  it('skips a skippable step and moves on', () => {
    const r = skip(fresh());
    expect(errors(r.events)).toEqual([]);
    expect(r.state.onboarding).toMatchObject({ stepId: 'first_words', skipped: ['lineup'] });
    expect(ofType(r.events, 'onboarding_step_skipped')).toEqual([{ type: 'onboarding_step_skipped', stepId: 'lineup' }]);
  });

  it('a stale step id is refused', () => {
    const r = skip(fresh(), 'debrief');
    expect(errors(r.events)[0]).toMatchObject({ message: expect.stringMatching(/Stale onboarding step/) });
  });

  it('skipping the expedition step also skips the debriefed step', () => {
    const s = fresh();
    s.onboarding = { ...s.onboarding!, stepId: 'tutorial' };
    const r = skip(s);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.onboarding).toMatchObject({ stepId: 'first_evening', skipped: ['tutorial', 'debrief'] });
    expect(ofType(r.events, 'onboarding_step_skipped').map((e) => e.stepId)).toEqual(['tutorial', 'debrief']);
  });

  it('skipping a step other than the expedition does not skip the next one', () => {
    const s = fresh();
    s.onboarding = { ...s.onboarding!, stepId: 'debrief' };
    const r = skip(s);
    expect(r.state.onboarding).toMatchObject({ stepId: 'first_evening', skipped: ['debrief'] });
  });
});

describe('auto-skips', () => {
  it('empty squad skips scene and tutorial steps', () => {
    const s = fresh(0);
    expect(s.onboarding).toMatchObject({ stepId: 'first_evening', done: false });
    expect(s.onboarding!.skipped).toEqual(['lineup', 'first_words', 'tutorial', 'debrief']);
  });

  it('a squad of dead units counts as empty', () => {
    const s = fresh(2);
    s.squad.forEach((u) => { u.status = 'dead'; });
    s.onboarding = { ...s.onboarding!, stepId: 'lineup' };
    const r = skip(s);
    // first_words, then the expedition and its debrief, are skipped on entry: only the guided evening is left
    expect(r.state.onboarding).toMatchObject({ stepId: 'first_evening' });
    expect(r.state.onboarding!.skipped).toEqual(['lineup', 'first_words', 'tutorial', 'debrief']);
  });

  it('veteran mode also skips scene and tutorial steps for an empty squad', () => {
    const s = fresh(0, 'veteran');
    expect(s.onboarding!.stepId).toBe('first_evening');
  });
});

describe('onboarding/mark_spoken', () => {
  it('records a living named unit once', () => {
    const s = fresh();
    const id = s.squad[0].id;
    const r = run(s, reg, { type: 'onboarding/mark_spoken', payload: { unitId: id } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.onboarding!.spoken).toEqual([id]);
    expect(ofType(r.events, 'onboarding_spoken')).toEqual([{ type: 'onboarding_spoken', unitId: id }]);
  });

  it('rejects a repeat', () => {
    const s = fresh();
    const id = s.squad[0].id;
    const once = run(s, reg, { type: 'onboarding/mark_spoken', payload: { unitId: id } }).state;
    expect(errors(run(once, reg, { type: 'onboarding/mark_spoken', payload: { unitId: id } }).events)[0]).toMatchObject({ message: expect.stringMatching(/already/i) });
  });

  it('rejects a grunt, a dead unit and an unknown unit', () => {
    const s = fresh();
    s.squad.push({ ...structuredClone(s.squad[0]), id: 'grunt_1', kind: 'grunt' });
    s.squad[1].status = 'dead';
    for (const unitId of ['grunt_1', s.squad[1].id, 'ghost']) {
      const r = run(s, reg, { type: 'onboarding/mark_spoken', payload: { unitId } });
      expect(errors(r.events), unitId).toHaveLength(1);
      expect(r.state, unitId).toBe(s);
    }
  });
});

describe('onboarding/hint_seen', () => {
  it('is idempotent', () => {
    const s = fresh();
    const a = run(s, reg, { type: 'onboarding/hint_seen', payload: { hintId: 'hint_rows' } });
    expect(errors(a.events)).toEqual([]);
    expect(a.state.onboarding!.hintsSeen).toEqual(['hint_rows']);
    const b = run(a.state, reg, { type: 'onboarding/hint_seen', payload: { hintId: 'hint_rows' } });
    expect(errors(b.events)).toEqual([]);
    expect(b.state.onboarding!.hintsSeen).toEqual(['hint_rows']);
  });

  it('refuses an id that no step lists', () => {
    expect(errors(run(fresh(), reg, { type: 'onboarding/hint_seen', payload: { hintId: 'nope' } }).events)).toHaveLength(1);
  });
});

describe('after the prologue', () => {
  const done = () => {
    const s = fresh();
    s.onboarding = { ...s.onboarding!, stepId: 'free', done: true };
    return s;
  };
  const actions = [
    { type: 'onboarding/complete_step', payload: { stepId: 'free' } },
    { type: 'onboarding/skip_step', payload: { stepId: 'free' } },
    { type: 'onboarding/mark_spoken', payload: { unitId: 'x' } },
    { type: 'onboarding/hint_seen', payload: { hintId: 'hint_rows' } },
  ];

  it.each(actions)('$type is refused once done', (action) => {
    const s = done();
    const r = run(s, reg, action);
    expect(errors(r.events)[0]).toMatchObject({ message: expect.stringMatching(/prologue is over/) });
    expect(r.state).toBe(s);
  });

  it('every onboarding action is refused in a campaign without onboarding', () => {
    const s = campaign(reg, 2);
    for (const action of actions) expect(errors(run(s, reg, action).events)[0]).toMatchObject({ message: expect.stringMatching(/prologue is over/) });
  });
});
