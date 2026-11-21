// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import '../../../src/engine/actions/dynamic';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import { blankDynamic, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import { dispatch } from '../../../src/engine/dispatch';
import { seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { h } from '../../../src/ui/dom';
import { renderOverrideChip } from '../../../src/ui/warden/overrideChip';
import { campaign, loadCore } from '../../helpers/world';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => { document.body.innerHTML = ''; });
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const env = (s: CampaignState): AnalyzeEnv => ({ state: s, registries: reg, settings: { ...DEFAULT_SETTINGS } }) as unknown as AnalyzeEnv;

function overridden(): CampaignState {
  for (let seed = 1; seed < 300; seed++) {
    const s = campaign(reg, 4);
    s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
    s.content = { enabled: ['restraint'] };
    s.squad.find((u) => u.id === ANN)!.bond = {
      leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
      practice: { categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'possessive' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate' },
    };
    s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame: 'rule', hold: 80, domains: [{ id: 'command', since: 1 }] };
    s.relations[ANN].affinity = 0;
    s.rng = seedRng(seed);
    const r = dispatch(s, { type: 'activity/do', payload: { activityId: 'train', companionId: BEA } }, reg);
    if (r.state.dynamic?.override !== undefined) return r.state;
  }
  throw new Error('no seed overrides');
}

describe('the override chip for a holder', () => {
  it('names her and the alternative, in the holder\'s glossary entry', () => {
    const s = overridden();
    const host = h('div');
    document.body.append(host);
    const onAnswer = vi.fn();
    renderOverrideChip(host, s, reg, onAnswer);
    const chip = host.querySelector<HTMLElement>('.alius-chip')!;
    expect(chip.textContent).toBe(`ANN OVERRIDES — ${s.dynamic!.override!.altLabel}`);
    expect(chip.textContent).toContain('Ann');
    expect(chip.getAttribute('data-analyze')).toBe('glossary:holder_override');
    expect(host.textContent).not.toContain('WARDEN');
    expect(host.textContent).not.toMatch(/\b(he|him|his)\b/i);
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['[ COMPLY ]', '[ ARGUE ]', '[ DEFY ]']);
    for (const b of buttons) expect(b.getAttribute('data-analyze')).toBe('glossary:holder_override');
    for (const b of buttons) b.click();
    expect(onAnswer.mock.calls).toEqual([['comply'], ['argue'], ['defy']]);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
  });

  it('ARGUE is closed (aria-disabled, never removed) once she has heard the commander out', () => {
    const s = overridden();
    s.dynamic!.override!.argued = true;
    const host = h('div');
    renderOverrideChip(host, s, reg, vi.fn());
    const argue = host.querySelector<HTMLElement>('[data-action="override-argue"]')!;
    expect(argue.getAttribute('aria-disabled')).toBe('true');
    expect(host.querySelector('[data-action="override-defy"]')!.getAttribute('aria-disabled')).toBeNull();
  });

  it('draws nothing when no override waits', () => {
    const s = overridden();
    delete s.dynamic!.override;
    const host = h('div');
    renderOverrideChip(host, s, reg, vi.fn());
    expect(host.children).toHaveLength(0);
  });
});
