import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { coachHints, isTutorialRun } from '../../../src/engine/onboarding';
import type { CampaignState } from '../../../src/engine/state/types';
import { runDeadlines } from '../../../src/engine/world/missions';
import { payload } from '../../helpers/expedition';
import { campaign, ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

/** A prologue campaign that has just finished first words, so the next step is the tutorial. */
const toTutorial = (startId = 'start_vesper', n = 4): { state: CampaignState; events: ReturnType<typeof run>['events'] } => {
  const s = campaign(reg, n, { onboarding: 'prologue', startId });
  s.onboarding!.stepId = 'first_words';
  s.onboarding!.spoken = s.squad.map((u) => u.id);
  const r = run(s, reg, { type: 'onboarding/complete_step', payload: { stepId: 'first_words' } });
  expect(errors(r.events)).toEqual([]);
  return { state: r.state, events: r.events };
};
const tutorialMission = (s: CampaignState) => s.missions.offered.find((m) => m.id === s.onboarding!.tutorialMissionId)!;
const depart = (s: CampaignState) => {
  const r = run(s, reg, { type: 'expedition/start', payload: payload(s, s.onboarding!.tutorialMissionId!) });
  expect(errors(r.events)).toEqual([]);
  return r.state;
};

describe('entering the tutorial step', () => {
  it('offers tutorial_patrol in the step region with no deadline', () => {
    const { state, events } = toTutorial();
    expect(state.onboarding!.stepId).toBe('tutorial');
    const m = tutorialMission(state);
    expect(m).toMatchObject({ templateId: 'tutorial_patrol', regionId: 'quarantine_d7', source: 'command', status: 'offered' });
    expect(m.deadlineDay).toBeUndefined();
    expect(ofType(events, 'mission_offered')).toEqual([expect.objectContaining({ type: 'mission_offered', missionId: m.id, regionId: 'quarantine_d7' })]);
  });

  it('the Kestrel prologue sends the patrol to its own region', () => {
    expect(tutorialMission(toTutorial('start_kestrel').state).regionId).toBe('kestrel_corridor');
  });

  it('does not put it on a board that is full of other missions', () => {
    const s = campaign(reg, 4, { onboarding: 'prologue' });
    s.onboarding!.stepId = 'first_words';
    s.onboarding!.spoken = s.squad.map((u) => u.id);
    for (let i = 0; i < 6; i++) {
      s.missions.offered.push({ id: `m_x${i}`, source: 'side', templateId: 'tpl_sweep', title: 't', brief: 'b', regionId: 'quarantine_d7', danger: 1, objective: { node: 'combat', condition: 'win' }, offeredDay: 1, rewardsTier: 'tier_1', failureEffects: [], status: 'offered', deadlineDay: 9 });
    }
    const r = run(s, reg, { type: 'onboarding/complete_step', payload: { stepId: 'first_words' } });
    expect(tutorialMission(r.state)).toBeDefined();
    expect(r.state.missions.offered.filter((m) => m.source === 'side')).toHaveLength(6);
  });

  it('is not offered when nobody is there to go (the step is skipped)', () => {
    const s = campaign(reg, 0, { onboarding: 'prologue' });
    expect(s.missions.offered.some((m) => m.templateId === 'tutorial_patrol')).toBe(false);
    expect(s.onboarding!.tutorialMissionId).toBeUndefined();
  });

  it('is still offered on day 3', () => {
    const { state } = toTutorial();
    const s = structuredClone(state);
    s.day = 3;
    runDeadlines(s, ctxOf(s, reg));
    expect(tutorialMission(s)).toBeDefined();
    const r = run(s, reg, { type: 'expedition/start', payload: payload(s, s.onboarding!.tutorialMissionId!) });
    expect(errors(r.events)).toEqual([]);
  });
});

describe('skipping the tutorial', () => {
  it('skip_step removes the offered tutorial mission', () => {
    const { state } = toTutorial();
    const id = state.onboarding!.tutorialMissionId!;
    const r = run(state, reg, { type: 'onboarding/skip_step', payload: { stepId: 'tutorial' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.missions.offered.some((m) => m.id === id)).toBe(false);
    expect(r.state.onboarding).toMatchObject({ stepId: 'first_evening', skipped: ['tutorial', 'debrief'] });
  });

  it('skipping leaves other offered missions alone', () => {
    const { state } = toTutorial();
    const other = structuredClone(tutorialMission(state));
    other.id = 'm_other';
    other.templateId = 'tpl_sweep';
    other.deadlineDay = 9;
    state.missions.offered.push(other);
    const r = run(state, reg, { type: 'onboarding/skip_step', payload: { stepId: 'tutorial' } });
    expect(r.state.missions.offered.map((m) => m.id)).toEqual(['m_other']);
  });
});

describe('the run and its return', () => {
  it('isTutorialRun is true only for the open tutorial run', () => {
    const { state } = toTutorial();
    expect(isTutorialRun(state, reg)).toBe(false);
    const started = depart(state);
    expect(isTutorialRun(started, reg)).toBe(true);
    const ordinary = campaign(reg, 4);
    expect(isTutorialRun(ordinary, reg)).toBe(false);
  });

  it('returning completes nothing until complete_step; then tutorial_returned holds', () => {
    const { state } = toTutorial();
    const started = depart(state);
    const out = run(started, reg, { type: 'expedition/retreat', payload: {} });
    expect(errors(out.events)).toEqual([]);
    expect(out.state.onboarding!.stepId).toBe('tutorial');
    const done = run(out.state, reg, { type: 'onboarding/complete_step', payload: { stepId: 'tutorial' } });
    expect(errors(done.events)).toEqual([]);
    expect(done.state.onboarding).toMatchObject({ stepId: 'debrief', completed: expect.arrayContaining(['tutorial']) });
  });

  it('complete_step is refused while the patrol is out', () => {
    const started = depart(toTutorial().state);
    const r = run(started, reg, { type: 'onboarding/complete_step', payload: { stepId: 'tutorial' } });
    expect(errors(r.events)).toHaveLength(1);
  });
});

describe('coach hints', () => {
  const hintIds = (s: CampaignState, screen: 'combat' | 'expedition') => coachHints(s, reg, screen).map((h) => h.id);

  it('lists the unseen hints of the screen during the tutorial run', () => {
    const started = depart(toTutorial().state);
    expect(hintIds(started, 'combat')).toEqual(['hint_rows', 'hint_cp']);
    expect(hintIds(started, 'expedition')).toEqual(['hint_stress']);
    expect(coachHints(started, reg, 'combat')[0]).toMatchObject({ glossaryId: 'rows', screen: 'combat' });
  });

  it('drops a hint that was seen', () => {
    const started = depart(toTutorial().state);
    const seen = run(started, reg, { type: 'onboarding/hint_seen', payload: { hintId: 'hint_rows' } });
    expect(errors(seen.events)).toEqual([]);
    expect(hintIds(seen.state, 'combat')).toEqual(['hint_cp']);
  });

  it('is empty outside the tutorial run', () => {
    const { state } = toTutorial();
    expect(hintIds(state, 'combat')).toEqual([]); // not out yet
    const ordinary = campaign(reg, 4);
    expect(hintIds(ordinary, 'combat')).toEqual([]);
    const done = depart(state);
    done.onboarding!.done = true;
    expect(hintIds(done, 'combat')).toEqual([]);
  });

  it('hint_seen runs while the expedition is open', () => {
    const started = depart(toTutorial().state);
    const r = run(started, reg, { type: 'onboarding/hint_seen', payload: { hintId: 'hint_stress' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.onboarding!.hintsSeen).toEqual(['hint_stress']);
  });

  it('hint_seen runs while a combat is open, but nothing else of the family does', () => {
    const started = depart(toTutorial().state);
    const inCombat = { ...started, combat: {} as never } as CampaignState;
    const seen = run(inCombat, reg, { type: 'onboarding/hint_seen', payload: { hintId: 'hint_cp' } });
    expect(errors(seen.events)).toEqual([]);
    expect(seen.state.onboarding!.hintsSeen).toEqual(['hint_cp']);
    const complete = run(inCombat, reg, { type: 'onboarding/complete_step', payload: { stepId: 'tutorial' } });
    expect(errors(complete.events)[0]).toMatchObject({ code: 'combat_open' });
    const during = run(started, reg, { type: 'onboarding/skip_step', payload: { stepId: 'tutorial' } });
    expect(errors(during.events)[0]).toMatchObject({ code: 'expedition_open' });
  });
});
