// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { AnalyzeEnv } from '../../src/analysis/model';
import type { Registries } from '../../src/content/types';
import { coachHints, type CoachHint } from '../../src/engine/onboarding';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { h } from '../../src/ui/dom';
import { renderCoach } from '../../src/ui/onboarding/coach';
import { renderExpeditionScreen } from '../../src/ui/expedition/expeditionScreen';
import type { ExpeditionController } from '../../src/world/expeditionController';
import { markedWithout, unreachable, unresolved } from '../helpers/analyzeCoverage';
import { payload } from '../helpers/expedition';
import { campaign, errors, loadCore, run } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
});

/** A prologue campaign out on the tutorial patrol. */
function onPatrol(): CampaignState {
  let s = campaign(reg, 4, { onboarding: 'prologue' });
  s.onboarding!.stepId = 'first_words';
  s.onboarding!.spoken = s.squad.map((u) => u.id);
  s = run(s, reg, { type: 'onboarding/complete_step', payload: { stepId: 'first_words' } }).state;
  const r = run(s, reg, { type: 'expedition/start', payload: payload(s, s.onboarding!.tutorialMissionId!) });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const env = (state: CampaignState): AnalyzeEnv => ({ registries: reg, state, settings: DEFAULT_SETTINGS });

describe('the coach strip', () => {
  it('unseen hints of the screen render with data-analyze glossary ids', () => {
    const s = onPatrol();
    const host = h('div');
    document.body.append(host);
    renderCoach(host, coachHints(s, reg, 'combat'), vi.fn());
    const cards = [...host.querySelectorAll<HTMLElement>('.alius-coach')];
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.getAttribute('data-analyze'))).toEqual(['glossary:rows', 'glossary:cp']);
    expect(cards[0].textContent).toContain('Melee reaches only the front');
    expect(host.querySelector('.alius-voice-terminal')).not.toBeNull();
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
  });

  it('says how to ask for more', () => {
    const s = onPatrol();
    const host = h('div');
    renderCoach(host, coachHints(s, reg, 'expedition'), vi.fn());
    expect(host.textContent).toContain('Focus anything and press ? for more.');
  });

  it('GOT IT dispatches hint_seen and the hint disappears', () => {
    let s = onPatrol();
    const host = h('div');
    document.body.append(host);
    const draw = () => {
      host.replaceChildren();
      renderCoach(host, coachHints(s, reg, 'combat'), (id) => {
        s = run(s, reg, { type: 'onboarding/hint_seen', payload: { hintId: id } }).state;
        draw();
      });
    };
    draw();
    expect(host.querySelectorAll('.alius-coach')).toHaveLength(2);
    (host.querySelector('button[data-action="got-it"]') as HTMLButtonElement).click();
    expect(host.querySelectorAll('.alius-coach')).toHaveLength(1);
    expect(s.onboarding!.hintsSeen).toEqual(['hint_rows']);
    (host.querySelector('button[data-action="got-it"]') as HTMLButtonElement).click();
    expect(host.querySelectorAll('.alius-coach')).toHaveLength(0);
    expect(host.childElementCount).toBe(0);
  });

  it('no coach outside the tutorial run', () => {
    const host = h('div');
    renderCoach(host, coachHints(campaign(reg, 4), reg, 'combat'), vi.fn());
    expect(host.childElementCount).toBe(0);
    const s = onPatrol();
    s.onboarding!.done = true;
    renderCoach(host, coachHints(s, reg, 'combat'), vi.fn());
    expect(host.childElementCount).toBe(0);
  });

  it('shows only the hints it is given, however many', () => {
    const hint = (id: string): CoachHint => ({ id, screen: 'combat', glossaryId: 'cp', text: id });
    const host = h('div');
    renderCoach(host, [hint('a'), hint('b'), hint('c')], vi.fn());
    expect(host.querySelectorAll('.alius-coach')).toHaveLength(3);
  });
});

describe('the expedition screen draws the coach at the top', () => {
  const controller = (): ExpeditionController => ({
    plan: vi.fn(), planning: vi.fn(() => null), cancelPlan: vi.fn(), launch: vi.fn(() => true), move: vi.fn(), choose: vi.fn(), treat: vi.fn(),
    setFormation: vi.fn(), fight: vi.fn(() => true), afterCombat: vi.fn(), retreat: vi.fn(), return: vi.fn(), requestRecap: vi.fn(async () => {}),
    acknowledge: vi.fn(), debrief: vi.fn(async () => true),
  } as never);

  it('during the run the expedition hints come first; without a coach context nothing is drawn', () => {
    const s = onPatrol();
    const seen = vi.fn();
    const host = h('div');
    document.body.append(host);
    renderExpeditionScreen(host, {
      getState: () => s, registries: reg, settings: () => DEFAULT_SETTINGS, controller: controller(), onClose: vi.fn(),
      coach: { hints: (screen) => coachHints(s, reg, screen), onSeen: seen },
    });
    const root = host.querySelector('.alius-expedition')!;
    expect(root.firstElementChild!.classList.contains('alius-coach-host')).toBe(true);
    expect([...root.querySelectorAll('.alius-coach')].map((c) => c.getAttribute('data-analyze'))).toEqual(['glossary:stress']);
    (root.querySelector('button[data-action="got-it"]') as HTMLButtonElement).click();
    expect(seen).toHaveBeenCalledWith('hint_stress');

    const plain = h('div');
    renderExpeditionScreen(plain, { getState: () => s, registries: reg, settings: () => DEFAULT_SETTINGS, controller: controller(), onClose: vi.fn() });
    expect(plain.querySelector('.alius-coach')).toBeNull();
  });
});
