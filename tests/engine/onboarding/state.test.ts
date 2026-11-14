import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import {
  completionReason, currentStep, initialOnboarding, isWizardStep, onboardingDone, prologueFor, stepsOf,
} from '../../../src/engine/onboarding';
import { buildCampaign, validateSetup, type SetupResult } from '../../../src/engine/setup';
import type { CampaignState, OnboardingState } from '../../../src/engine/state/types';
import type { ExpeditionReport } from '../../../src/engine/world/types';
import { campaign, loadCore, stubExpedition, unitSetup } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const WIZARD = ['cold_open', 'intake', 'exam', 'dossier'];

const withScene = (s: CampaignState): CampaignState => ({ ...s, scene: { id: 's1' } as unknown as CampaignState['scene'] });
const step = (s: CampaignState, id: string) => stepsOf(reg.prologues.get(s.onboarding!.prologueId)!).find((x) => x.id === id)!;

describe('prologue readers', () => {
  it('prologueFor finds the entry of a start and nothing for an unknown one', () => {
    expect(prologueFor(reg, 'start_vesper')?.id).toBe('prologue_vesper');
    expect(prologueFor(reg, 'start_kestrel')?.id).toBe('prologue_kestrel');
    expect(prologueFor(reg, 'start_nowhere')).toBeNull();
  });

  it('stepsOf lists the steps in order with their ids', () => {
    const steps = stepsOf(reg.prologues.get('prologue_vesper')!);
    expect(steps.map((x) => x.id)).toEqual(['cold_open', 'intake', 'exam', 'dossier', 'lineup', 'first_words', 'tutorial', 'debrief', 'first_evening', 'free']);
    expect(steps.map((x) => isWizardStep(x))).toEqual([true, true, true, true, false, false, false, false, false, false]);
  });
});

describe('buildCampaign and onboarding', () => {
  it('without onboarding writes none and onboardingDone is true', () => {
    const s = campaign(reg, 2);
    expect(s.onboarding).toBeUndefined();
    expect(onboardingDone(s)).toBe(true);
    expect(currentStep(s, reg)).toBeNull();
  });

  it('prologue mode: wizard steps completed, stepId lineup, stepDay 1', () => {
    const s = campaign(reg, 2, { onboarding: 'prologue' });
    expect(s.onboarding).toEqual({ prologueId: 'prologue_vesper', stepId: 'lineup', stepDay: 1, completed: WIZARD, skipped: [], done: false });
    expect(onboardingDone(s)).toBe(false);
    expect(currentStep(s, reg)?.id).toBe('lineup');
  });

  it('veteran mode: wizard steps skipped', () => {
    const s = campaign(reg, 2, { onboarding: 'veteran' });
    expect(s.onboarding).toMatchObject({ prologueId: 'prologue_vesper', stepId: 'lineup', completed: [], skipped: WIZARD, done: false });
  });

  it('the kestrel start gets its own prologue', () => {
    expect(campaign(reg, 2, { startId: 'start_kestrel', onboarding: 'prologue' }).onboarding?.prologueId).toBe('prologue_kestrel');
  });

  it('initialOnboarding is a pure reader of the registries', () => {
    const o = initialOnboarding(reg, 'prologue_vesper', { veteran: false, day: 3 });
    expect(o).toEqual({ prologueId: 'prologue_vesper', stepId: 'lineup', stepDay: 3, completed: WIZARD, skipped: [], done: false });
  });
});

describe('validateSetup and onboarding', () => {
  const setup = (onboarding: SetupResult['onboarding'], startId = 'start_vesper'): SetupResult => ({
    commanderName: 'Vale', startId, crimeId: 'mutiny', units: [unitSetup('Ann')], ...(onboarding ? { onboarding } : {}),
  });
  const check = (r: SetupResult) => validateSetup(r, reg, { desireBondDefects: false });

  it('accepts the prologue of the start', () => {
    expect(check(setup({ prologueId: 'prologue_vesper', veteran: false }))).toEqual([]);
  });

  it('rejects an unknown prologueId and one whose startId differs', () => {
    expect(check(setup({ prologueId: 'prologue_nowhere', veteran: false })).join(' ')).toMatch(/Unknown prologue "prologue_nowhere"/);
    expect(check(setup({ prologueId: 'prologue_kestrel', veteran: false })).join(' ')).toMatch(/prologue_kestrel.*start_kestrel.*start_vesper/);
    // the skeleton has no startId: it is never chosen
    expect(check(setup({ prologueId: 'prologue_skeleton', veteran: false })).join(' ')).toMatch(/prologue_skeleton/);
  });

  it('buildCampaign refuses what validateSetup refuses', () => {
    const r = buildCampaign(setup({ prologueId: 'prologue_kestrel', veteran: false }), reg, { desireBondDefects: false, seed: 1 });
    expect(r.ok).toBe(false);
  });
});

describe('completionReason', () => {
  const base = (): CampaignState => campaign(reg, 2, { onboarding: 'prologue' });

  it('manual always holds', () => {
    const s = base();
    expect(completionReason(s, reg, step(s, 'free'))).toBeNull();
  });

  it('no_open_scene fails with a scene open', () => {
    const s = base();
    expect(completionReason(s, reg, step(s, 'lineup'))).toBeNull();
    expect(completionReason(withScene(s), reg, step(s, 'lineup'))).toBe('A scene is still open.');
  });

  it('all_spoken needs every living named unit', () => {
    const s = base();
    const [a, b] = s.squad;
    s.onboarding!.spoken = [a.id];
    expect(completionReason(s, reg, step(s, 'first_words'))).toMatch(/spoken/i);
    s.onboarding!.spoken = [a.id, b.id];
    expect(completionReason(s, reg, step(s, 'first_words'))).toBeNull();
  });

  it('all_spoken ignores dead units', () => {
    const s = base();
    const [a, b] = s.squad;
    b.status = 'dead';
    s.onboarding!.spoken = [a.id];
    expect(completionReason(s, reg, step(s, 'first_words'))).toBeNull();
  });

  it('all_spoken ignores deserted and terminated units and grunts', () => {
    const s = base();
    const [a, b] = s.squad;
    b.status = 'deserted';
    s.squad.push({ ...structuredClone(a), id: 'grunt_1', kind: 'grunt' });
    s.onboarding!.spoken = [a.id];
    expect(completionReason(s, reg, step(s, 'first_words'))).toBeNull();
    b.status = 'terminated';
    expect(completionReason(s, reg, step(s, 'first_words'))).toBeNull();
  });

  const report = (missionId: string, over: Partial<ExpeditionReport> = {}): ExpeditionReport => ({ id: 'r1', missionId, debriefed: false, acknowledged: false, ...over } as ExpeditionReport);

  it('tutorial_returned is false while an expedition is open', () => {
    const s = base();
    s.onboarding!.tutorialMissionId = 'm_1';
    s.expedition = stubExpedition(s, { missionId: 'm_1' });
    expect(completionReason(s, reg, step(s, 'tutorial'))).toMatch(/patrol/i);
  });

  it('tutorial_returned needs the report of the tutorial mission', () => {
    const s = base();
    expect(completionReason(s, reg, step(s, 'tutorial'))).not.toBeNull(); // no mission yet
    s.onboarding!.tutorialMissionId = 'm_1';
    s.lastExpedition = report('m_other');
    expect(completionReason(s, reg, step(s, 'tutorial'))).not.toBeNull();
    s.lastExpedition = report('m_1');
    expect(completionReason(s, reg, step(s, 'tutorial'))).toBeNull();
  });

  it('debriefed needs that report to be debriefed', () => {
    const s = base();
    s.onboarding!.tutorialMissionId = 'm_1';
    s.lastExpedition = report('m_1');
    expect(completionReason(s, reg, step(s, 'debrief'))).not.toBeNull();
    s.lastExpedition = report('m_1', { debriefed: true });
    expect(completionReason(s, reg, step(s, 'debrief'))).toBeNull();
    s.lastExpedition = report('m_2', { debriefed: true });
    expect(completionReason(s, reg, step(s, 'debrief'))).not.toBeNull();
  });

  it('next_day is false on stepDay and true the day after', () => {
    const s = base();
    s.onboarding = { ...(s.onboarding as OnboardingState), stepDay: 4 };
    s.day = 4;
    expect(completionReason(s, reg, step(s, 'first_evening'))).not.toBeNull();
    s.day = 5;
    expect(completionReason(s, reg, step(s, 'first_evening'))).toBeNull();
  });
});
