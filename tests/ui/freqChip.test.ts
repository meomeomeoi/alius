// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import type { Registries } from '../../src/content/types';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { Intercepted } from '../../src/engine/special/state';
import type { CampaignState } from '../../src/engine/state/types';
import { h } from '../../src/ui/dom';
import { renderFreqChip } from '../../src/ui/special/freqChip';
import { renderInterceptLog } from '../../src/ui/special/interceptLog';
import { markedWithout, unresolved } from '../helpers/analyzeCoverage';
import { ANN, BEA, specialCampaign } from '../helpers/special';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { campaign } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
  registerCoreProviders();
});
afterEach(() => { document.body.innerHTML = ''; });

const x = (over: Partial<Intercepted>): Intercepted => ({ id: 'fq1', unitId: ANN, day: 1, kind: 'stance', value: 'fearful', true: true, partial: false, text: '…can\'t keep doing this…', ...over });
const withLog = (log: Intercepted[]): CampaignState => {
  const s = specialCampaign(reg, 'secret_frequency');
  s.special!.frequency!.intercepts = log;
  return s;
};
const chip = (s: CampaignState, unitId = ANN): HTMLElement => {
  const host = h('div');
  document.body.append(host);
  renderFreqChip(host, s, reg, unitId);
  return host;
};
const logOf = (s: CampaignState): HTMLElement => {
  const host = h('div');
  document.body.append(host);
  renderInterceptLog(host, s, reg);
  return host;
};

describe('FREQ chip', () => {
  it('shows the newest fragment of the unit, quoted, marked unverified, with data-analyze', () => {
    const s = withLog([x({ id: 'fq1', text: '…old…' }), x({ id: 'fq2', day: 2, text: '…new…' }), x({ id: 'fq3', unitId: BEA, text: '…other…' })]);
    const host = chip(s);
    const el = host.querySelector<HTMLElement>('.alius-chip')!;
    expect(el.textContent).toBe('FREQ ▸ "…new…" (unverified)');
    expect(el.getAttribute('data-analyze')).toBe('glossary:frequency_intercept');
    expect(host.querySelectorAll('.alius-chip')).toHaveLength(1);
    expect(markedWithout(host)).toEqual([]);
  });

  it('draws nothing without an intercept, after the implant is burned or with no frequency state', () => {
    expect(chip(withLog([])).querySelector('.alius-chip')).toBeNull();
    const burned = withLog([x({})]);
    burned.special!.frequency!.burnedDay = 1;
    expect(chip(burned).querySelector('.alius-chip')).toBeNull();
    expect(chip(campaign(reg, 2)).querySelector('.alius-chip')).toBeNull();
  });

  it('an intercept not worded yet shows the template fragment', () => {
    const host = chip(withLog([x({ text: undefined })]));
    expect(host.querySelector('.alius-chip')!.textContent).toMatch(/^FREQ ▸ ".+" \(unverified\)$/);
    expect(host.textContent).not.toMatch(/[{}]/);
  });

  it('the FREQ chip and the INTERCEPTS log render the same for a true and a false intercept', () => {
    const real = withLog([x({ true: true })]);
    const fake = withLog([x({ true: false })]);
    expect(chip(real).innerHTML).toBe(chip(fake).innerHTML);
    expect(logOf(real).innerHTML).toBe(logOf(fake).innerHTML);
    // and nothing in the DOM names the truth
    for (const html of [chip(real).outerHTML, logOf(real).outerHTML, logOf(fake).outerHTML]) expect(html).not.toMatch(/\btrue\b|\bfalse\b|data-true|data-real/i);
  });
});

describe('INTERCEPTS log', () => {
  it('lists day, name and text, always suffixed (unverified), newest first', () => {
    const s = withLog([x({ id: 'fq1', day: 1, text: '…a…' }), x({ id: 'fq2', day: 3, unitId: BEA, text: '…b…' })]);
    const host = logOf(s);
    const rows = [...host.querySelectorAll('li')].map((li) => li.textContent);
    expect(rows).toEqual(['Day 3 — Bea: "…b…" (unverified)', 'Day 1 — Ann: "…a…" (unverified)']);
    expect(host.querySelector('[data-analyze="glossary:frequency_intercept"]')).not.toBeNull();
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, { registries: reg, state: s, settings: DEFAULT_SETTINGS })).toEqual([]);
  });

  it('draws nothing without the frequency state', () => {
    expect(logOf(campaign(reg, 2)).children).toHaveLength(0);
  });
});
