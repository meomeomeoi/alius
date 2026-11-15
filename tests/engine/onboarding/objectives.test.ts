import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { objectiveList, waitingDemands } from '../../../src/engine/onboarding';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const stepObjective = (id: string) => (reg.prologues.get('prologue_vesper')!.steps as Record<string, { objective: string }>)[id].objective;
const demand = (id: string, unitId: string, status = 'open') => ({ id, unitId, status, text: 't', kind: 'x', day: 1 }) as never;
const withDemands = (s: CampaignState, ...d: unknown[]): CampaignState => {
  s.discipline = { defiance: [], threats: [], applications: [], restrictions: [], demands: d as never, demandLog: [] };
  return s;
};
const texts = (s: CampaignState) => objectiveList(s, reg).map((o) => o.text);

describe('objectiveList', () => {
  it('prologue step objective first', () => {
    const s = campaign(reg, 4, { onboarding: 'prologue' });
    s.objectives = [{ id: 'ob1', text: 'Check the gate.', source: 'director', done: false }];
    const list = objectiveList(s, reg);
    expect(list[0]).toMatchObject({ text: stepObjective('lineup'), source: 'prologue', dueDays: null });
  });

  it('then the proposed spine beat goal', () => {
    const s = campaign(reg, 4);
    s.world.spine = { proposed: 'beat_1' };
    const goal = (reg.starts.get('start_vesper')!.spine as Array<{ id: string; goal: string }>)[0].goal;
    expect(objectiveList(s, reg)[0]).toMatchObject({ text: goal, source: 'spine' });
  });

  it('an unproposed beat is not an objective', () => {
    expect(texts(campaign(reg, 4))).toEqual([]);
  });

  it('then the open director hint with dueDays', () => {
    const s = campaign(reg, 4);
    s.day = 3;
    s.objectives = [
      { id: 'old', text: 'Old news.', source: 'director', done: true },
      { id: 'ob2', text: 'Scout the east gate.', source: 'director', dueDay: 8, done: false },
    ];
    expect(objectiveList(s, reg)).toEqual([{ id: 'ob2', text: 'Scout the east gate.', source: 'director', dueDays: 5 }]);
  });

  it('a director hint without a due day has dueDays null', () => {
    const s = campaign(reg, 4);
    s.objectives = [{ id: 'ob', text: 'Rest up.', source: 'director', done: false }];
    expect(objectiveList(s, reg)[0].dueDays).toBeNull();
  });

  it('then the guide wants to talk and waiting demands', () => {
    const s = withDemands(campaign(reg, 4, { onboarding: 'prologue' }), demand('d1', 'unit_bea'), demand('d2', 'unit_cat', 'granted'), demand('d3', 'unit_dee'));
    s.onboarding!.stepId = 'first_evening';
    s.onboarding!.guideUnitId = 'unit_ann';
    expect(objectiveList(s, reg).map((o) => [o.source, o.text])).toEqual([
      ['prologue', stepObjective('first_evening')],
      ['unit', 'Ann wants to talk.'],
      ['unit', 'Bea is waiting for an answer.'],
      ['unit', 'Dee is waiting for an answer.'],
    ]);
  });

  it('keeps the order prologue, spine, director, unit', () => {
    const s = withDemands(campaign(reg, 4, { onboarding: 'prologue' }), demand('d1', 'unit_bea'));
    s.world.spine = { proposed: 'beat_1' };
    s.objectives = [{ id: 'ob', text: 'Look east.', source: 'director', done: false }];
    expect(objectiveList(s, reg).map((o) => o.source)).toEqual(['prologue', 'spine', 'director', 'unit']);
  });

  it('a guide who is gone is not listed', () => {
    const s = campaign(reg, 4, { onboarding: 'prologue' });
    s.onboarding!.stepId = 'first_evening';
    s.onboarding!.guideUnitId = 'unit_ann';
    s.squad[0].status = 'dead';
    expect(objectiveList(s, reg).map((o) => o.source)).toEqual(['prologue']);
  });

  it('a finished prologue lists no step', () => {
    const s = campaign(reg, 4, { onboarding: 'prologue' });
    s.onboarding!.done = true;
    expect(texts(s)).toEqual([]);
  });

  it('plain old save has nothing to list', () => {
    expect(objectiveList(campaign(reg, 4), reg)).toEqual([]);
  });
});

describe('waitingDemands', () => {
  it('lists open demands of living units, the same ones the Tonight list shows', () => {
    const s = withDemands(campaign(reg, 4), demand('d1', 'unit_ann'), demand('d2', 'unit_bea', 'granted'), demand('d3', 'unit_cat'));
    s.squad[2].status = 'dead';
    expect(waitingDemands(s).map((d) => d.id)).toEqual(['d1']);
  });

  it('is empty without a discipline block', () => {
    expect(waitingDemands(campaign(reg, 4))).toEqual([]);
  });
});

describe('an overdue director lead', () => {
  it('is listed while it is at most two days overdue, then it lapses', () => {
    const s = campaign(reg, 4);
    s.objectives = [{ id: 'o', text: 'Scout east.', source: 'director', dueDay: 5, done: false }];
    s.day = 7;
    expect(objectiveList(s, reg)[0]).toMatchObject({ text: 'Scout east.', dueDays: -2 });
    s.day = 8;
    expect(objectiveList(s, reg)).toEqual([]);
  });

  it('a lead with no due day never lapses', () => {
    const s = campaign(reg, 4);
    s.objectives = [{ id: 'o', text: 'Rest up.', source: 'director', done: false }];
    s.day = 90;
    expect(objectiveList(s, reg)).toHaveLength(1);
  });
});
