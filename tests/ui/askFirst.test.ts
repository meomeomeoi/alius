// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { h } from '../../src/ui/dom';
import { renderHierarchyBlock } from '../../src/ui/power/hierarchy';
import { analyze, markedWithout, unreachable, unresolved } from '../helpers/analyzeCoverage';
import { campaign, loadCore } from '../helpers/loyalty';
import '../helpers/power';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
});
const ANN = 'unit_ann';
const env = (state: CampaignState): AnalyzeEnv => ({ registries: reg, state, settings: DEFAULT_SETTINGS });
const block = (state: CampaignState, unitId = ANN, withHandler = true) => {
  const host = h('div');
  document.body.append(host);
  const onAskFirst = vi.fn();
  renderHierarchyBlock(host, state, reg, unitId, { onEndorse: vi.fn(), onChallenge: vi.fn(), ...(withHandler ? { onAskFirst } : {}) });
  return { host, onAskFirst };
};
const toggle = (host: HTMLElement) => host.querySelector('[data-ask-first]') as HTMLButtonElement | null;
const ordered = (): CampaignState => {
  const s = campaign(reg, 4);
  s.power = { votes: { log: [], seq: 0 }, askFirst: { [ANN]: s.day } };
  return s;
};

describe('the ASK ME FIRST control in the dossier', () => {
  it('the toggle dispatches power/ask_first through the handler and flips with the state', () => {
    const free = block(campaign(reg, 4));
    expect(toggle(free.host)!.textContent).toBe('[ ASK ME FIRST ]');
    expect(toggle(free.host)!.getAttribute('aria-pressed')).toBe('false');
    expect(free.host.querySelector('[data-asks-first]')).toBeNull();
    toggle(free.host)!.click();
    expect(free.onAskFirst).toHaveBeenCalledWith(ANN, true);

    const held = block(ordered());
    expect(toggle(held.host)!.textContent).toBe('[ LET HER DECIDE ]');
    expect(toggle(held.host)!.getAttribute('aria-pressed')).toBe('true');
    expect(held.host.querySelector('[data-asks-first]')!.textContent).toBe('ASKS FIRST');
    toggle(held.host)!.click();
    expect(held.onAskFirst).toHaveBeenCalledWith(ANN, false);
  });

  it('is not offered during a run (it is a base order), without a handler, or for a grunt', () => {
    const s = campaign(reg, 4);
    const away = block({ ...s, expedition: { party: [ANN] } as never });
    expect(toggle(away.host)!.getAttribute('aria-disabled')).toBe('true');
    toggle(away.host)!.click();
    expect(away.onAskFirst).not.toHaveBeenCalled();
    expect(toggle(block(s, ANN, false).host)).toBeNull();
    expect(toggle(block(s, 'ghost').host)).toBeNull();
  });

  it('the toggle and the chip carry data-analyze with an address that resolves and a reading', () => {
    const s = ordered();
    const { host } = block(s);
    expect(host.querySelector('[data-ask-first]')!.getAttribute('data-analyze')).toBe('glossary:ask_first');
    expect(host.querySelector('[data-asks-first]')!.getAttribute('data-analyze')).toBe('glossary:ask_first');
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    expect(analyze('glossary:ask_first', env(s), { unitId: ANN }).length).toBeGreaterThan(0);
  });
});
