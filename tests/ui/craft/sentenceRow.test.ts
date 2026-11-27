// @vitest-environment jsdom
/**
 * P16b Task 21 (PDA surface): the DYNAMIC section shows the term of a running sentence. Days left only: never the crime, never the echo, never the number of days a slip added. `data-analyze` and a reading.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import '../../../src/engine/actions/craft';
import { buildKnowledge } from '../../../src/analysis/knowledge';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import { hasCommanderPronoun } from '../../../src/engine/dynamic/pronoun';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { h } from '../../../src/ui/dom';
import { renderDynamicSection, resetDynamicSection } from '../../../src/ui/dynamic/section';
import { markedWithout, unresolved } from '../../helpers/analyzeCoverage';
import { loadCore } from '../../helpers/world';
import { ANN, world } from '../../engine/craft/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); registerCoreProviders(); });
afterEach(() => { document.body.innerHTML = ''; resetDynamicSection(); });

function draw(s: CampaignState): HTMLElement {
  const host = h('div');
  document.body.append(host);
  renderDynamicSection(host, { state: s, reg, unitId: ANN, knowledge: buildKnowledge(s, DEFAULT_SETTINGS), hidden: false });
  return host;
}
const sentenced = (): CampaignState => {
  const s = world(reg, 'play');
  s.relations[ANN].craft = { sentence: { crimeId: 'liquidation', start: s.day - 2, until: s.day + 9, extended: 3, landed: true } };
  return s;
};

describe('SENTENCE in the DYNAMIC section', () => {
  it('shows the days left, marked and readable, and nothing of the crime or the echo', () => {
    const s = sentenced();
    const host = draw(s);
    const row = host.querySelector<HTMLElement>('[data-craft-sentence]')!;
    expect(row).not.toBeNull();
    expect(row.closest('p')!.textContent).toBe('SENTENCE 9 DAYS LEFT');
    expect(row.getAttribute('data-analyze')).toBe('glossary:craft_sentence');
    expect(host.textContent).not.toMatch(/liquidation|crime|privilege|booking|\b3\b|extended/i);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, { registries: reg, state: s, settings: DEFAULT_SETTINGS })).toEqual([]);
    expect(hasCommanderPronoun(host.textContent ?? '')).toBe(false);
  });

  it('counts down with the days, says "1 day" on the last but one, and is gone once served or without one', () => {
    const s = sentenced();
    s.day = s.relations[ANN].craft!.sentence!.until - 1;
    expect(draw(s).querySelector('[data-craft-sentence]')!.closest('p')!.textContent).toBe('SENTENCE 1 DAY LEFT');
    s.relations[ANN].craft!.sentence!.servedDay = s.day;
    expect(draw(s).querySelector('[data-craft-sentence]')).toBeNull();
    expect(draw(world(reg, 'play')).querySelector('[data-craft-sentence]')).toBeNull();
  });
});
