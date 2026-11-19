// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { Registries } from '../../src/content/types';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { h } from '../../src/ui/dom';
import { OPERATIONS_LABEL } from '../../src/ui/headStart/recapCard';
import { renderStatusHeader } from '../../src/ui/shell/status';
import { markedWithout, unreachable, unresolved } from '../helpers/analyzeCoverage';
import { loadCore, unitSetup } from '../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); registerCoreProviders(); });
afterEach(() => { document.body.innerHTML = ''; });

const build = (days: number): CampaignState => {
  const out = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'liquidation', units: ['Ann', 'Bea'].map((n) => unitSetup(n)),
    ...(days > 0 ? { headStart: { days: days as 14, newArrivals: [] } } : {}),
  }, reg, { desireBondDefects: false, seed: 7 });
  if (!out.ok) throw new Error(out.errors.join('; '));
  return out.state;
};
const draw = (s: CampaignState): HTMLElement => {
  const host = h('div');
  document.body.append(host);
  renderStatusHeader(host, s);
  return host;
};

describe('the status header and the head start', () => {
  it('day 1 of a head start shows the chip', () => {
    const host = draw(build(14));
    const chip = [...host.querySelectorAll<HTMLElement>('[data-analyze="glossary:head_start"]')];
    expect(chip).toHaveLength(1);
    expect(chip[0].textContent).toBe(OPERATIONS_LABEL);
    expect(OPERATIONS_LABEL).toBe('DAY 1 OF OPERATIONS');
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, { registries: reg, state: build(14), settings: { ...DEFAULT_SETTINGS } })).toEqual([]);
    expect(unreachable(host)).toEqual([]);
  });

  it('no chip on day 2 or without a head start', () => {
    const later = build(14);
    later.day = 2;
    expect(draw(later).querySelector('[data-analyze="glossary:head_start"]')).toBeNull();
    expect(draw(build(0)).querySelector('[data-analyze="glossary:head_start"]')).toBeNull();
  });
});
