import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { HEAD_START_SKIPPED_KINDS } from '../../../src/engine/headStart/apply';
import { enterStep, isWizardStep, prologueFor, stepIndex, stepsOf } from '../../../src/engine/onboarding';
import { Rng } from '../../../src/engine/rng';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

describe('enterStep and the head start', () => {
  it('skips scene, expedition and guided_slot steps by kind', () => {
    expect([...HEAD_START_SKIPPED_KINDS]).toEqual(['scene', 'expedition', 'guided_slot']);
  });

  it('lists a skipped step with an onboarding_step_skipped event and reaches free', () => {
    const s = campaign(reg, 2, { onboarding: 'prologue' });
    expect(s.onboarding!.stepId).toBe('lineup');
    s.headStart = { days: 7, units: [] };
    const rng = new Rng(s.rng);
    const events = enterStep(s, { registries: reg, rng } as never, stepIndex(s, reg));
    const entry = prologueFor(reg, 'start_vesper')!;
    const campaignSteps = stepsOf(entry).filter((st) => !isWizardStep(st) && st.kind !== 'free').map((st) => st.id);
    expect(s.onboarding!.skipped).toEqual(campaignSteps);
    expect(events.filter((e) => e.type === 'onboarding_step_skipped').map((e) => e.stepId)).toEqual(campaignSteps);
    expect(events.map((e) => e.type)).toContain('onboarding_done');
    expect(s.onboarding!.done).toBe(true);
  });

  it('a campaign without headStart enters the first step as before', () => {
    const s = campaign(reg, 2, { onboarding: 'prologue' });
    expect(s.onboarding!.done).toBe(false);
    expect(s.onboarding!.stepId).toBe('lineup');
  });
});
