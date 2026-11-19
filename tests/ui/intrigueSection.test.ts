// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { investigationBand, startRemoval, wardenOf } from '../../src/engine/warden';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { h } from '../../src/ui/dom';
import { renderIntrigueSection } from '../../src/ui/warden/intrigueSection';
import { renderWardenPanel } from '../../src/ui/warden/wardenPanel';
import { Rng, seedRng } from '../../src/engine/rng';
import { markedWithout, unreachable, unresolved } from '../helpers/analyzeCoverage';
import { loadCore, unitSetup } from '../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { document.body.innerHTML = ''; });

const ID = { ann: 'unit_ann', bea: 'unit_bea', cat: 'unit_cat' };
function swap(over: (s: CampaignState) => void = () => {}): CampaignState {
  const out = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: [unitSetup('Ann'), unitSetup('Bea'), unitSetup('Cat', { roleId: 'specialist' })],
    mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
  }, reg, { desireBondDefects: false, seed: 4 });
  if (!out.ok) throw new Error(out.errors.join('; '));
  out.state.commander.socialStats.cunning = 1;
  over(out.state);
  return out.state;
}
const draw = (s: CampaignState, deps = {}) => {
  const host = h('div');
  document.body.append(host);
  renderIntrigueSection(host, s, reg, deps);
  return host;
};
const ready = (x: CampaignState): void => {
  x.base.facilities.workshop = 3; x.base.facilities.medbay = 3; x.resources.plyx = 20;
  x.relations[ID.cat].flags.push('warden_ally');
  for (let i = 0; i < 3; i++) x.memory.facts.push({ id: `k${i}`, about: [ID.bea], text: `Kompromat ${i}.`, tags: ['kompromat'], importance: 3, day: 1, knownBy: ['commander'] });
};
const btn = (host: HTMLElement, action: string) => host.querySelector(`[data-action="${action}"]`) as HTMLElement;

describe('the INTRIGUE section', () => {
  it('shows the allies, the kompromat against what a report needs and the hack progress', () => {
    const host = draw(swap(ready));
    expect(host.textContent).toContain('INTRIGUE');
    expect(host.textContent).toContain('ALLIES: CAT');
    expect(host.textContent).toContain('KOMPROMAT: 3 / 3');
    expect(host.textContent).toContain('IMPLANT HACK: STEP 0 / 3');
    expect(draw(swap()).textContent).toContain('ALLIES: NONE');
  });

  it('never shows the suspicion: not a number, not a word', () => {
    const s = swap((x) => { ready(x); x.leashswap!.intrigue.suspicion = 67; x.leashswap!.intrigue.discovered = 3; });
    const text = draw(s).textContent!;
    expect(text).not.toContain('67');
    expect(text.toLowerCase()).not.toContain('suspic');
    expect(text.toLowerCase()).not.toContain('discover');
  });

  it("buttons show the engine's reason and stay in the page (aria-disabled), or are open", () => {
    const closed = draw(swap());
    for (const a of ['intrigue-dig', 'intrigue-hack-step', 'intrigue-report-to-oversight']) {
      expect(btn(closed, a).getAttribute('aria-disabled')).toBe('true');
      expect(btn(closed, a).getAttribute('title')!.length).toBeGreaterThan(0);
    }
    expect(closed.textContent).toMatch(/Digging needs an ally or Cunning 3/);
    expect(closed.textContent).toMatch(/The hack needs Workshop level 3/);
    expect(closed.textContent).toMatch(/Oversight needs 3 pieces of kompromat/);
    const open = draw(swap(ready));
    for (const a of ['intrigue-dig', 'intrigue-hack-step', 'intrigue-report-to-oversight']) expect(btn(open, a).getAttribute('aria-disabled')).toBeNull();
  });

  it('an open button calls its handler with the ally; a closed one does nothing', () => {
    const onAct = vi.fn();
    const onReport = vi.fn();
    const open = draw(swap(ready), { onAct, onReport });
    btn(open, 'intrigue-dig').click();
    btn(open, 'intrigue-hack-step').click();
    btn(open, 'intrigue-report-to-oversight').click();
    expect(onAct.mock.calls).toEqual([['dig', ID.cat], ['hack_step', ID.cat]]);
    expect(onReport).toHaveBeenCalledTimes(1);
    const none = vi.fn();
    const closed = draw(swap(), { onAct: none, onReport: none });
    btn(closed, 'intrigue-dig').click();
    btn(closed, 'intrigue-report-to-oversight').click();
    expect(none).not.toHaveBeenCalled();
  });

  it('draws nothing when nobody holds the leash, and rides inside the WARDEN panel', () => {
    const s = swap();
    startRemoval(s, { registries: reg, rng: new Rng(seedRng(1)) }, 'hack');
    expect(draw(s).childElementCount).toBe(0);
    const host = h('div');
    document.body.append(host);
    renderWardenPanel(host, swap(ready), reg, {});
    expect(host.querySelector('.alius-warden-intrigue')).not.toBeNull();
  });

  it('every chip and button carries data-analyze and resolves (the coverage helpers)', () => {
    const host = draw(swap(ready));
    expect(markedWithout(host)).toEqual([]);
    const env = { registries: reg, state: swap(ready), settings: { ...DEFAULT_SETTINGS } };
    expect(unresolved(host, env)).toEqual([]);
    expect(unreachable(host)).toEqual([]);
  });
});

describe('the investigation card', () => {
  const start = (route: 'hack' | 'report' | 'death', filled = 0): CampaignState => {
    const s = swap();
    startRemoval(s, { registries: reg, rng: new Rng(seedRng(1)) }, route);
    s.world.clocks.find((c) => c.id === 'investigation')!.filled = filled;
    return s;
  };
  const panel = (s: CampaignState): HTMLElement => { const host = h('div'); document.body.append(host); renderWardenPanel(host, s, reg, {}); return host; };

  it('shows nobody holding the controller, the investigation as a band and the remote expectations', () => {
    const host = panel(start('hack'));
    expect(wardenOf(swap())).not.toBeNull();
    expect(host.textContent).toContain('NOBODY HOLDS THE CONTROLLER');
    expect(host.textContent).toContain('INVESTIGATION: JUST OPENED');
    expect(host.textContent).toContain('QUOTA — HIGH');
    expect(host.textContent).toContain('OBEDIENCE — HIGH');
  });

  it('the band moves with the clock and never shows its length', () => {
    expect(investigationBand(0, 10)).toBe('JUST OPENED');
    expect(investigationBand(4, 10)).toBe('UNDER WAY');
    expect(investigationBand(7, 10)).toBe('NEARLY CLOSED');
    const host = panel(start('death', 3));
    expect(host.textContent).toContain('INVESTIGATION: NEARLY CLOSED');
    expect(host.textContent).not.toMatch(/\b(3|4)\b/);
  });

  it('is marked and resolves', () => {
    const host = panel(start('report'));
    expect(markedWithout(host)).toEqual([]);
  });

  it('a free commander has no panel', () => {
    const s = swap((x) => { x.leashswap!.status = 'free'; delete x.leashswap!.warden; });
    expect(panel(s).childElementCount).toBe(0);
  });
});
