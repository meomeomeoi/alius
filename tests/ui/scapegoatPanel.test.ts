// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { summarizeWorldEffect } from '../../src/analysis/effects';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { Registries } from '../../src/content/types';
import { dilemmaOptions } from '../../src/engine/dilemma/flow';
import { openScapegoat } from '../../src/engine/power/scapegoat';
import type { CampaignState } from '../../src/engine/state/types';
import { createDilemmas } from '../../src/loyalty/dilemmaController';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { h } from '../../src/ui/dom';
import { renderDilemma } from '../../src/ui/dilemma/dilemmaPanel';
import { scapegoatView } from '../../src/ui/dilemma/scapegoat';
import { analyze, markedWithout, unreachable, unresolved } from '../helpers/analyzeCoverage';
import { campaign, loadCore } from '../helpers/loyalty';
import { ctxOf } from '../helpers/world';
import { withOptions } from '../helpers/power';
import { worldHarness } from '../helpers/worldApp';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
});
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
const env = (state: CampaignState | null, raw = false): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } });

function withCase(voting = false): CampaignState {
  const s = campaign(reg, 4);
  s.leash.authorizationsLeft = 2;
  if (voting) withOptions(s, { voting: 'on' });
  openScapegoat(s, ctxOf(s, reg), { missionId: 'm_gone', unitId: ANN, witnessIds: [BEA, CAT] });
  return s;
}
function panel(s: CampaignState, onChoose = vi.fn()) {
  const open = s.dilemmas!.open!;
  const host = h('div');
  document.body.append(host);
  renderDilemma(host, {
    title: open.title!, setup: open.setup!, scale: open.scale, waiting: false, options: dilemmaOptions(s, reg), onChoose,
    scapegoat: scapegoatView(s, reg),
  });
  return { host, onChoose };
}

describe('the scapegoat panel', () => {
  it('names the responsible unit and the witnesses', () => {
    const { host } = panel(withCase());
    expect(host.querySelector('[data-scapegoat-subject]')!.textContent).toBe('RESPONSIBLE: Ann');
    expect(host.querySelector('[data-scapegoat-witnesses]')!.textContent).toBe('WITNESSES: Bea, Cat');
    expect(host.textContent).toContain('TAKE THE BLAME');
    expect(host.textContent).toContain('SHIFT IT');
  });

  it('each option lists its effects through summarizeWorldEffect, with data-analyze', () => {
    const s = withCase();
    const { host } = panel(s);
    const open = s.dilemmas!.open!;
    open.options!.forEach((o, i) => {
      const expected = o.effects.map((fx) => summarizeWorldEffect(fx, reg)).filter((l): l is string => l !== null);
      expect(expected.length).toBeGreaterThanOrEqual(3);
      const shown = [...host.querySelectorAll(`[data-scapegoat-effects="${i}"] [data-effect-line]`)].map((e) => e.textContent);
      expect(shown, o.id).toEqual(expected);
    });
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    const take = host.querySelector('[data-scapegoat-effects="0"]')!.textContent!;
    expect(take).toMatch(/standing/i);
    expect(take).toMatch(/Leash/);
  });

  it('a plain dilemma shows none of it', () => {
    const s = campaign(reg, 4);
    const host = h('div');
    renderDilemma(host, { title: 'T', setup: 'S', scale: 'minor', waiting: false, options: [], onChoose: vi.fn() });
    expect(host.querySelector('[data-scapegoat-subject]')).toBeNull();
    expect(scapegoatView(s, reg)).toBeNull();
  });

  it('clicking an option chooses it once', () => {
    const { host, onChoose } = panel(withCase());
    (host.querySelector('[data-dilemma-option="1"]') as HTMLElement).click();
    (host.querySelector('[data-dilemma-option="0"]') as HTMLElement).click();
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith(1);
  });

  it('the reading names who answers for it and the witnesses', () => {
    const s = withCase();
    const lines = analyze('glossary:scapegoat', env(s)).join('\n');
    expect(lines).toContain('Ann');
    expect(lines).toContain('Bea');
    expect(analyze('glossary:scapegoat', env(campaign(reg, 4)))).toEqual([]);
  });
});

describe('choosing', () => {
  it('with voting on, choosing opens the VOTE flow first (requestVote) and nothing runs yet', () => {
    const s = withCase(true);
    const h2 = worldHarness(reg, s);
    const requestVote = vi.fn(async () => 'cancelled' as const);
    const d = createDilemmas({ ...h2.deps, requestVote });
    expect(d.choose(0)).toEqual([]);
    expect(requestVote).toHaveBeenCalledWith({ type: 'dilemma/choose', payload: { id: s.dilemmas!.open!.id, index: 0 } });
    expect(h2.toasts.filter((t) => t.kind === 'error')).toEqual([]);
    expect(h2.state().dilemmas!.open).toBeDefined();
  });

  it('with voting off it is chosen at once', () => {
    const s = withCase(false);
    const h2 = worldHarness(reg, s);
    const requestVote = vi.fn();
    const d = createDilemmas({ ...h2.deps, requestVote });
    const events = d.choose(0);
    expect(events.some((e) => e.type === 'dilemma_resolved')).toBe(true);
    expect(requestVote).not.toHaveBeenCalled();
    expect(h2.state().dilemmas!.open).toBeUndefined();
  });

  it('no model call is made for a scapegoat', async () => {
    const s = withCase(true);
    const h2 = worldHarness(reg, s);
    const d = createDilemmas(h2.deps);
    await d.onRequested();
    expect(h2.st.calls).toEqual([]);
    expect(h2.state().dilemmas!.open!.status).toBe('presented');
    expect(h2.log.map((a) => a.type)).toEqual([]);
  });
});
