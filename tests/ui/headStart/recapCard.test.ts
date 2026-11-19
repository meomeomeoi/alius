// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/headStart';
import { dispatch } from '../../../src/engine/dispatch';
import { buildCampaign } from '../../../src/engine/setup';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { h } from '../../../src/ui/dom';
import type { GenerationUi } from '../../../src/ui/generation/surface';
import { momentTag } from '../../../src/engine/headStart/recap';
import { renderRecapCard } from '../../../src/ui/headStart/recapCard';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';
import { loadCore, unitSetup } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); registerCoreProviders(); });
afterEach(() => { document.body.innerHTML = ''; });

const build = (days = 14): CampaignState => {
  const out = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'liquidation', units: ['Ann', 'Bea', 'Rhea'].map((n) => unitSetup(n)),
    headStart: { days: days as 14, newArrivals: ['rhea.png'] },
  }, reg, { desireBondDefects: false, seed: 7 });
  if (!out.ok) throw new Error(out.errors.join('; '));
  return out.state;
};
const withRecap = (s: CampaignState): CampaignState => {
  const units = s.headStart!.units.map((u) => ({ unitId: u.unitId, moments: u.moments.map((kind) => ({ kind, text: `${u.unitId} remembers ${kind}.` })) }));
  return dispatch(s, { type: 'head_start/recap', payload: { units, chronicle: 'Two weeks passed in the barracks.', source: 'model' } }, reg).state;
};
const ui = (over: Partial<GenerationUi['generations']> = {}): GenerationUi => ({
  generations: { retry: vi.fn(), reroll: vi.fn(), rerollState: () => ({ enabled: true }), drop: vi.fn(), useFallback: vi.fn(), ...over } as never,
  modal: vi.fn() as never, settings: () => DEFAULT_SETTINGS, toast: vi.fn(), redraw: vi.fn(),
});
function draw(state: CampaignState, o: { generation?: GenerationUi; state?: { enabled: boolean; reason?: string } } = {}) {
  const host = h('div');
  document.body.append(host);
  const onReroll = vi.fn(async () => {});
  renderRecapCard(host, { state, registries: reg, generation: o.generation, onReroll, rerollState: () => o.state ?? { enabled: true } });
  return { host, onReroll };
}
const env = (state: CampaignState) => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS } });

describe('THE FIRST WEEKS card', () => {
  it("shows the paragraph and each soldier's moments", () => {
    const s = withRecap(build());
    const { host } = draw(s, { generation: ui() });
    const text = host.textContent!;
    expect(text).toContain('THE FIRST WEEKS');
    expect(text).toContain('Two weeks passed in the barracks.');
    for (const u of s.headStart!.units) {
      expect(text).toContain(s.squad.find((x) => x.id === u.unitId)!.displayName);
      for (const kind of u.moments) expect(text).toContain(`${u.unitId} remembers ${kind}.`);
    }
    expect(text).not.toContain('Rhea'); // a new arrival has no part in it
  });

  it('a forgotten fact leaves its line out, and the others keep their own kind', () => {
    const s = withRecap(build(30));
    const unit = s.headStart!.units[0];
    const [k0, k1] = unit.moments;
    const gone = s.memory.facts.find((f) => f.about[0] === unit.unitId && f.tags.includes(momentTag(k0)))!;
    const forgotten = structuredClone(s);
    forgotten.memory.facts = forgotten.memory.facts.filter((f) => f.id !== gone.id);
    const { host } = draw(forgotten, { generation: ui() });
    const block = [...host.querySelectorAll('.alius-head-start-unit')].find((b) => b.querySelector('h3')!.textContent === forgotten.squad.find((x) => x.id === unit.unitId)!.displayName)!;
    const addresses = [...block.querySelectorAll('.alius-head-start-moment')].map((l) => l.getAttribute('data-analyze'));
    expect(addresses).toEqual([`headStartMoments:${k1}`]); // her other line stays, the forgotten one is gone
    const mine = [...block.querySelectorAll('.alius-head-start-moment')].find((l) => l.getAttribute('data-analyze') === `headStartMoments:${k1}`);
    expect(mine?.textContent).toBe(`${unit.unitId} remembers ${k1}.`);
  });

  it('while the recap is pending the card says so', () => {
    const { host } = draw(build(), { generation: ui() });
    expect(host.textContent).toContain('The first weeks are being written.');
    expect(host.querySelectorAll('.alius-head-start-moment')).toHaveLength(0);
  });

  it('every line is analyzable', () => {
    const s = withRecap(build());
    const { host } = draw(s, { generation: ui() });
    expect(host.querySelector('[data-analyze="glossary:head_start_recap"]')).not.toBeNull();
    const lines = [...host.querySelectorAll<HTMLElement>('.alius-head-start-moment')];
    expect(lines.map((l) => l.getAttribute('data-analyze'))).toEqual(s.headStart!.units.flatMap((u) => u.moments.map((k) => `headStartMoments:${k}`)));
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
  });

  it('is gone once the first scene has started, or without a head start', () => {
    const s = withRecap(build());
    const started = structuredClone(s);
    started.memory.scenes = [{ sceneId: 's1', from: 0, to: 3, summarized: true }];
    expect(draw(started).host.childElementCount).toBe(0);
    const plain = structuredClone(s);
    delete plain.headStart;
    expect(draw(plain).host.childElementCount).toBe(0);
  });

  it('a failed record shows its chip, REROLL is drawn when none is open', () => {
    const s = withRecap(build());
    const failed = structuredClone(s);
    failed.generations = { records: [{ id: 'g1', siteId: 'setup.head_start_recap', key: 'recap', reason: 'invalid_output', status: 'open', day: 1, attempts: 2, detail: 'x', fallbackApplied: true }], nextId: 2 } as never;
    const open = draw(failed, { generation: ui() }).host;
    expect(open.querySelector('.alius-genfail')).not.toBeNull();
    expect(open.querySelector('.alius-reroll')).toBeNull();
    const none = draw(s, { generation: ui() }).host;
    expect(none.querySelector('.alius-reroll')).not.toBeNull();
  });

  it('REROLL calls the controller; it is aria-disabled with its reason after the first scene', async () => {
    const s = withRecap(build());
    const { host, onReroll } = draw(s, { generation: ui() });
    (host.querySelector('.alius-reroll') as HTMLElement).click();
    await Promise.resolve();
    expect(onReroll).toHaveBeenCalled();
    document.body.innerHTML = '';
    const locked = draw(s, { generation: ui(), state: { enabled: false, reason: 'The first scene has started.' } }).host;
    const btn = locked.querySelector('.alius-reroll') as HTMLElement;
    expect(btn.getAttribute('aria-disabled')).toBe('true');
  });

  it('gives the commander no pronoun', () => {
    const { host } = draw(withRecap(build()), { generation: ui() });
    expect(host.textContent).not.toMatch(/\bcommander\b[^.]*\b(he|him|his)\b/i);
  });
});
