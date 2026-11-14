import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { guideUnit } from '../../../src/engine/onboarding';
import type { CampaignState } from '../../../src/engine/state/types';
import type { ExpeditionReport } from '../../../src/engine/world/types';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const report = (over: Partial<ExpeditionReport> = {}): ExpeditionReport => ({ id: 'r1', missionId: 'm_t', debriefed: false, acknowledged: true, ...over } as ExpeditionReport);

/** A prologue campaign on the debrief step with the tutorial report in the state. */
function atDebrief(tweak: (s: CampaignState) => void = () => {}): CampaignState {
  const s = campaign(reg, 4, { onboarding: 'prologue' });
  s.onboarding!.stepId = 'debrief';
  s.onboarding!.tutorialMissionId = 'm_t';
  s.lastExpedition = report();
  tweak(s);
  return s;
}
const complete = (s: CampaignState, stepId: string) => run(s, reg, { type: 'onboarding/complete_step', payload: { stepId } });

describe('the debrief step', () => {
  it('completes only after the tutorial report is debriefed', () => {
    const s = atDebrief();
    expect(errors(complete(s, 'debrief').events)).toHaveLength(1);
    const marked = run(s, reg, { type: 'expedition/mark_debriefed', payload: {} });
    expect(errors(marked.events)).toEqual([]);
    expect(ofType(marked.events, 'expedition_debriefed')).toEqual([{ type: 'expedition_debriefed', reportId: 'r1' }]);
    expect(errors(complete(marked.state, 'debrief').events)).toEqual([]);
  });

  it('a report of another mission does not count', () => {
    const s = atDebrief((x) => { x.lastExpedition = report({ missionId: 'm_other', debriefed: true }); });
    expect(errors(complete(s, 'debrief').events)).toHaveLength(1);
  });
});

describe('guideUnit', () => {
  const rel = (s: CampaignState, id: string, trust: number, affinity: number) => { s.relations[id].trust = trust; s.relations[id].affinity = affinity; };

  it('picks the highest Affinity', () => {
    const s = campaign(reg, 4);
    rel(s, 'unit_ann', 50, 5); rel(s, 'unit_bea', 40, 30); rel(s, 'unit_cat', 40, 10); rel(s, 'unit_dee', 90, 0);
    expect(guideUnit(s)).toBe('unit_bea');
  });

  it('breaks an Affinity tie by Trust, then by squad order', () => {
    const s = campaign(reg, 4);
    rel(s, 'unit_ann', 30, 20); rel(s, 'unit_bea', 60, 20); rel(s, 'unit_cat', 60, 20); rel(s, 'unit_dee', 10, 20);
    expect(guideUnit(s)).toBe('unit_bea');
  });

  it('ignores the dead, the deserted and grunts; null with nobody', () => {
    const s = campaign(reg, 4);
    rel(s, 'unit_ann', 50, 90); rel(s, 'unit_bea', 50, 80); rel(s, 'unit_cat', 50, 10); rel(s, 'unit_dee', 50, 5);
    s.squad[0].status = 'dead';
    s.squad[1].status = 'deserted';
    s.squad.push({ ...structuredClone(s.squad[2]), id: 'grunt_1', kind: 'grunt' });
    s.relations.grunt_1 = { ...s.relations.unit_cat, affinity: 99 };
    expect(guideUnit(s)).toBe('unit_cat');
    s.squad.forEach((u) => { u.status = 'dead'; });
    expect(guideUnit(s)).toBeNull();
  });
});

describe('entering the first evening', () => {
  const enter = (tweak: (s: CampaignState) => void = () => {}) => {
    const s = atDebrief((x) => { x.lastExpedition = report({ debriefed: true }); tweak(x); });
    const r = complete(s, 'debrief');
    expect(errors(r.events)).toEqual([]);
    return r;
  };

  it('picks the guide by Affinity, then Trust, then squad order', () => {
    const r = enter((s) => { s.relations.unit_cat.affinity = 40; s.relations.unit_bea.affinity = 40; s.relations.unit_bea.trust = 70; });
    expect(r.state.onboarding).toMatchObject({ stepId: 'first_evening', guideUnitId: 'unit_bea' });
  });

  it('with nightKnock the guide\'s visit is queued with the authored framing', () => {
    const r = enter((s) => { s.relations.unit_dee.affinity = 50; s.day = 4; });
    const queue = r.state.calendar.nightEventsQueue;
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      unitId: 'unit_dee', kind: 'visit', priority: 5, framing: 'Dee is at the door, and it is not about duty.',
      ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 5,
    });
    expect(ofType(r.events, 'night_queued')).toHaveLength(1);
  });

  it('skipping the tutorial reaches the first evening too, with a guide', () => {
    const s = campaign(reg, 4, { onboarding: 'prologue' });
    s.onboarding!.stepId = 'tutorial';
    s.relations.unit_cat.affinity = 33;
    const r = run(s, reg, { type: 'onboarding/skip_step', payload: { stepId: 'tutorial' } });
    expect(r.state.onboarding).toMatchObject({ stepId: 'first_evening', guideUnitId: 'unit_cat' });
  });

  it('with nobody left there is no guide and nothing is queued', () => {
    const s = campaign(reg, 0, { onboarding: 'prologue' });
    expect(s.onboarding!.stepId).toBe('first_evening');
    expect(s.onboarding!.guideUnitId).toBeUndefined();
    expect(s.calendar.nightEventsQueue).toEqual([]);
  });

  it('next_day completes first_evening and free sets done', () => {
    let s = enter().state;
    expect(errors(complete(s, 'first_evening').events)).toHaveLength(1); // same day
    s = { ...s, day: s.day + 1 };
    const r = complete(s, 'first_evening');
    expect(errors(r.events)).toEqual([]);
    expect(r.state.onboarding).toMatchObject({ stepId: 'free', done: true });
    expect(ofType(r.events, 'onboarding_done')).toHaveLength(1);
  });
});
