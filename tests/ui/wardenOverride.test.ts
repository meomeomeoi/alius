// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { dispatch } from '../../src/engine/dispatch';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { overrideOpen, wardenOf } from '../../src/engine/warden';
import { h } from '../../src/ui/dom';
import { renderOverrideChip } from '../../src/ui/warden/overrideChip';
import { markedWithout, unreachable } from '../helpers/analyzeCoverage';
import { loadCore, unitSetup } from '../helpers/world';
import '../../src/engine/actions/warden';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { document.body.innerHTML = ''; });

function overridden(): CampaignState {
  for (let seed = 1; seed < 300; seed++) {
    const out = buildCampaign({
      commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea', 'Cat'].map((n) => unitSetup(n)),
      mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
    }, reg, { desireBondDefects: false, seed });
    if (!out.ok) throw new Error(out.errors.join('; '));
    const w = wardenOf(out.state)!;
    w.expectations = [{ id: 'x1', kind: 'keep_me_close', weight: 0.5, source: 'values', known: false }];
    w.satisfaction = 0;
    const r = dispatch(out.state, { type: 'activity/do', payload: { activityId: 'train', companionId: 'unit_ann' } }, reg);
    if (overrideOpen(r.state)) return r.state;
  }
  throw new Error('no seed overrides');
}

const draw = (s: CampaignState, onAnswer = vi.fn()) => {
  const host = h('div');
  document.body.append(host);
  renderOverrideChip(host, s, reg, onAnswer);
  return { host, onAnswer };
};
const button = (host: HTMLElement, a: string) => host.querySelector<HTMLElement>(`[data-action="override-${a}"]`)!;

describe('the override chip', () => {
  it('shows the alternative and three buttons, all with data-analyze', () => {
    const { host } = draw(overridden());
    expect(host.textContent).toContain('WARDEN OVERRIDE — Train with Bea');
    expect(host.textContent).toContain('She expects: Keep her close');
    expect(['comply', 'argue', 'defy'].map((a) => button(host, a).textContent)).toEqual(['[COMPLY]', '[ARGUE]', '[DEFY]']);
    expect(markedWithout(host)).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    expect(host.textContent).not.toMatch(/\b(he|him|his)\b/i);
  });

  it('each button reports its answer', () => {
    const { host, onAnswer } = draw(overridden());
    for (const a of ['comply', 'argue', 'defy']) button(host, a).click();
    expect(onAnswer.mock.calls.map((c) => c[0])).toEqual(['comply', 'argue', 'defy']);
  });

  it('compelled: only COMPLY; the others are aria-disabled and do nothing', () => {
    const s = overridden();
    wardenOf(s)!.compelled = true;
    const { host, onAnswer } = draw(s);
    expect(button(host, 'comply').getAttribute('aria-disabled')).toBeNull();
    expect(button(host, 'argue').getAttribute('aria-disabled')).toBe('true');
    expect(button(host, 'defy').getAttribute('aria-disabled')).toBe('true');
    button(host, 'argue').click();
    button(host, 'defy').click();
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('ARGUE closes once she has heard the commander out', () => {
    const s = overridden();
    wardenOf(s)!.override!.argued = true;
    const { host } = draw(s);
    expect(button(host, 'argue').getAttribute('aria-disabled')).toBe('true');
    expect(button(host, 'defy').getAttribute('aria-disabled')).toBeNull();
  });

  it('draws nothing when no override is open', () => {
    const s = overridden();
    delete wardenOf(s)!.override;
    expect(draw(s).host.childElementCount).toBe(0);
  });
});
