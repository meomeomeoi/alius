// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { AnalyzeEnv } from '../../src/analysis/model';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { h } from '../../src/ui/dom';
import { renderOnboardingCard, type OnboardingCardController } from '../../src/ui/onboarding/card';
import { markedWithout, unreachable, unresolved } from '../helpers/analyzeCoverage';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
});

const env = (state: CampaignState): AnalyzeEnv => ({ registries: reg, state, settings: DEFAULT_SETTINGS });

function mount(tweak: (s: CampaignState) => void = () => {}, readOnly = false) {
  const state = campaign(reg, 4, { onboarding: 'prologue' });
  tweak(state);
  const controller: OnboardingCardController = {
    startLineup: vi.fn(async () => true), talkFirstWords: vi.fn(async () => true), skipFirstWords: vi.fn(),
    skipStep: vi.fn(async () => {}), resumeScene: vi.fn(), launchTutorial: vi.fn(() => true), debriefTutorial: vi.fn(async () => true), talkGuide: vi.fn(async () => true),
  };
  const host = h('div');
  document.body.append(host);
  renderOnboardingCard(host, { state, registries: reg, controller, readOnly });
  return { host, state, controller };
}
const buttons = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('button')];
const byText = (host: HTMLElement, t: string) => buttons(host).find((b) => b.textContent!.includes(t));

describe('the prologue card', () => {
  it('shows the step title and objective', () => {
    const m = mount();
    expect(m.host.textContent).toContain('LINE-UP');
    expect(m.host.textContent).toContain('Stand before the squad in the garage.');
  });

  it('line-up shows [BEGIN LINE-UP] and [SKIP]', () => {
    const m = mount();
    byText(m.host, 'BEGIN LINE-UP')!.click();
    expect(m.controller.startLineup).toHaveBeenCalledTimes(1);
    byText(m.host, 'SKIP')!.click();
    expect(m.controller.skipStep).toHaveBeenCalledTimes(1);
  });

  it('first words shows one row per unit with [ TALK ] and [ SKIP ], spoken ones ticked', () => {
    const m = mount((s) => { s.onboarding!.stepId = 'first_words'; s.onboarding!.spoken = ['unit_ann']; });
    const rows = [...m.host.querySelectorAll<HTMLElement>('[data-unit]')];
    expect(rows.map((r) => r.dataset.unit)).toEqual(['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee']);
    expect(rows[0].textContent).toContain('✓');
    expect(rows[0].querySelector('button[data-action="talk"]')).toBeNull();
    expect(rows[1].textContent).not.toContain('✓');
    (rows[1].querySelector('button[data-action="talk"]') as HTMLButtonElement).click();
    expect(m.controller.talkFirstWords).toHaveBeenCalledWith('unit_bea');
    (rows[2].querySelector('button[data-action="skip-unit"]') as HTMLButtonElement).click();
    expect(m.controller.skipFirstWords).toHaveBeenCalledWith('unit_cat');
  });

  it('first words leaves dead units out', () => {
    const m = mount((s) => { s.onboarding!.stepId = 'first_words'; s.squad[3].status = 'dead'; });
    expect([...m.host.querySelectorAll<HTMLElement>('[data-unit]')].map((r) => r.dataset.unit)).toEqual(['unit_ann', 'unit_bea', 'unit_cat']);
  });

  it('confined unit offers only skip', () => {
    const m = mount((s) => {
      s.onboarding!.stepId = 'first_words';
      s.discipline = { restrictions: [{ id: 'r1', unitId: 'unit_ann', kind: 'confined', untilDay: 5 }] } as never;
    });
    const row = m.host.querySelector<HTMLElement>('[data-unit="unit_ann"]')!;
    const talk = row.querySelector<HTMLButtonElement>('button[data-action="talk"]')!;
    expect(talk.disabled).toBe(true);
    expect(row.textContent).toMatch(/brig|confined|cell|duty|held/i);
    expect((row.querySelector('button[data-action="skip-unit"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('the tutorial step shows [LAUNCH TUTORIAL] and [SKIP]', () => {
    const m = mount((s) => { s.onboarding!.stepId = 'tutorial'; });
    expect(m.host.textContent).toContain('SHAKEDOWN PATROL');
    byText(m.host, 'LAUNCH TUTORIAL')!.click();
    expect(m.controller.launchTutorial).toHaveBeenCalledTimes(1);
    byText(m.host, 'SKIP')!.click();
    expect(m.controller.skipStep).toHaveBeenCalledTimes(1);
    expect(m.host.querySelector('[data-analyze="glossary:tutorial_expedition"]')).not.toBeNull();
  });

  it('while the patrol is out the card offers only to go back to it', () => {
    const m = mount((s) => { s.onboarding!.stepId = 'tutorial'; s.expedition = { id: 'exp_1' } as never; });
    expect(byText(m.host, 'LAUNCH TUTORIAL')).toBeUndefined();
    expect(byText(m.host, 'SKIP')).toBeUndefined();
    byText(m.host, 'RESUME PATROL')!.click();
    expect(m.controller.launchTutorial).toHaveBeenCalledTimes(1);
  });

  it('the debrief step shows [DEBRIEF] and [SKIP]', () => {
    const m = mount((s) => { s.onboarding!.stepId = 'debrief'; });
    byText(m.host, 'DEBRIEF')!.click();
    expect(m.controller.debriefTutorial).toHaveBeenCalledTimes(1);
    expect(byText(m.host, 'SKIP')).toBeDefined();
  });

  it('the first evening shows who wants to talk, with [ TALK ]', () => {
    const m = mount((s) => { s.onboarding!.stepId = 'first_evening'; s.onboarding!.guideUnitId = 'unit_bea'; });
    expect(m.host.textContent).toContain('Bea wants to talk.');
    byText(m.host, 'TALK')!.click();
    expect(m.controller.talkGuide).toHaveBeenCalledTimes(1);
    expect(markedWithout(m.host)).toEqual([]);
    expect(unresolved(m.host, env(m.state))).toEqual([]);
  });

  it('the first evening without a guide shows only the way to skip', () => {
    const m = mount((s) => { s.onboarding!.stepId = 'first_evening'; });
    expect(m.host.querySelector('.alius-onboarding-guide')).toBeNull();
    expect(byText(m.host, 'TALK')).toBeUndefined();
    expect(byText(m.host, 'SKIP')).toBeDefined();
  });

  it('card after reload shows resume for an open prologue scene', () => {
    const m = mount((s) => {
      s.scene = { id: 's1', day: 1, slot: 'morning', locationId: 'garage', participants: ['unit_ann'], mode: 'private', origin: 'prologue', consumesSlot: false, startIndex: 0, readIndex: 0, exchanges: 0 };
    });
    expect(byText(m.host, 'BEGIN LINE-UP')).toBeUndefined();
    byText(m.host, 'RESUME SCENE')!.click();
    expect(m.controller.resumeScene).toHaveBeenCalledTimes(1);
  });

  it('another scene being open hides the begin button without offering a resume', () => {
    const m = mount((s) => {
      s.scene = { id: 's1', day: 1, slot: 'morning', locationId: 'mess_hall', participants: ['unit_ann'], mode: 'private', origin: 'event', consumesSlot: true, startIndex: 0, readIndex: 0, exchanges: 0 };
    });
    expect(byText(m.host, 'RESUME SCENE')).toBeUndefined();
    expect(byText(m.host, 'BEGIN LINE-UP')!.disabled).toBe(true);
  });

  it('nothing is drawn when the prologue is done, absent or the campaign is read-only', () => {
    expect(mount((s) => { s.onboarding!.done = true; }).host.textContent).toBe('');
    const old = h('div');
    renderOnboardingCard(old, { state: campaign(reg, 2), registries: reg, controller: mount().controller, readOnly: false });
    expect(old.childElementCount).toBe(0);
    expect(mount(() => {}, true).host.textContent).toBe('');
  });

  it('every button is analysable and resolves (glossary:lineup, glossary:first_words)', () => {
    const a = mount();
    expect(markedWithout(a.host)).toEqual([]);
    expect(unresolved(a.host, env(a.state))).toEqual([]);
    expect(unreachable(a.host)).toEqual([]);
    expect(a.host.querySelector('[data-analyze="glossary:lineup"]')).not.toBeNull();
    const b = mount((s) => { s.onboarding!.stepId = 'first_words'; });
    expect(markedWithout(b.host)).toEqual([]);
    expect(unresolved(b.host, env(b.state))).toEqual([]);
    expect(unreachable(b.host)).toEqual([]);
    expect(b.host.querySelector('[data-analyze="glossary:first_words"]')).not.toBeNull();
  });

  it('is a terminal-voice card', () => {
    expect(mount().host.querySelector('.alius-voice-terminal')).not.toBeNull();
  });
});
