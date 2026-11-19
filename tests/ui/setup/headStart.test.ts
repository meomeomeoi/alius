// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../../src/content/loader';
import type { Registries } from '../../../src/content/types';
import { Wizard } from '../../../src/setup/wizard';
import { h } from '../../../src/ui/dom';
import { HEAD_START_LABEL, renderHeadStartSection, renderNewArrivals } from '../../../src/ui/setup/headStart';
import { renderCalibration } from '../../../src/ui/setup/calibration';
import { reviewLines } from '../../../src/ui/setup/shared';
import { renderWorldParams } from '../../../src/ui/setup/worldParams';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
});
afterEach(() => { document.body.innerHTML = ''; });

const card = (n: string) => ({ avatar: `${n}.png`, name: n[0].toUpperCase() + n.slice(1) }) as never;
function make(mode: 'prologue' | 'veteran' = 'prologue') {
  const wizard = new Wizard({ registries: reg, desireBondDefects: false, importer: vi.fn() as never, onChange: () => {} }, { personaName: 'Vale', canBindCurrent: false });
  wizard.setStart('start_vesper');
  wizard.setMode(mode);
  const world = h('div');
  const units = h('div');
  document.body.append(world, units);
  const draw = () => {
    renderWorldParams(world, { wizard, registries: reg });
    units.replaceChildren();
    renderNewArrivals(units, wizard);
  };
  wizard.subscribe(draw);
  draw();
  return { wizard, world, units };
}
const choices = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('.alius-head-start-choice')];
const arrivals = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('.alius-new-arrival')];

describe('WORLD PARAMETERS: HEAD START', () => {
  it('shows four options, the current one pressed, each explainable', () => {
    const { wizard, world } = make();
    expect(choices(world).map((c) => c.dataset.days)).toEqual(['0', '7', '14', '30']);
    expect(choices(world).map((c) => c.querySelector('strong')!.textContent)).toEqual(Object.values(HEAD_START_LABEL));
    expect(choices(world).filter((c) => c.getAttribute('aria-pressed') === 'true').map((c) => c.dataset.days)).toEqual(['0']);
    for (const c of choices(world)) {
      expect(c.classList.contains('alius-option')).toBe(true);
      expect(c.getAttribute('data-analyze')).toBe('glossary:head_start');
    }
    choices(world)[2].click();
    expect(wizard.state.headStart.days).toBe(14);
    expect(choices(world).filter((c) => c.getAttribute('aria-pressed') === 'true').map((c) => c.dataset.days)).toEqual(['14']);
  });

  it('is shown in the prologue mode and in the veteran mode', () => {
    for (const mode of ['prologue', 'veteran'] as const) {
      const { world } = make(mode);
      expect(choices(world)).toHaveLength(4);
      document.body.innerHTML = '';
    }
  });

  it('the hint says no time or progress is skipped and gives the commander no pronoun', () => {
    const { world } = make();
    const hint = world.querySelector('.alius-head-start .alius-hint')!.textContent!;
    expect(hint).toMatch(/No missions, time or progress are skipped/);
    expect(world.querySelector('.alius-head-start')!.textContent).not.toMatch(/\bcommander\b[^.]*\b(he|him|his)\b/i);
  });
});

describe('UNIT ASSIGNMENT: NEW ARRIVAL', () => {
  it('one toggle per chosen unit, only when days > 0', () => {
    const { wizard, units } = make();
    wizard.toggleUnit(card('ann'));
    wizard.toggleUnit(card('bea'));
    expect(arrivals(units)).toHaveLength(0);
    wizard.setHeadStart(7);
    expect(arrivals(units).map((b) => b.dataset.avatar)).toEqual(['ann.png', 'bea.png']);
    for (const b of arrivals(units)) {
      expect(b.getAttribute('data-analyze')).toBe('glossary:new_arrival');
      expect(b.getAttribute('aria-pressed')).toBe('false');
      expect(b.classList.contains('alius-option')).toBe(true);
    }
    arrivals(units)[1].click();
    expect(wizard.state.headStart.newArrivals).toEqual(['bea.png']);
    expect(arrivals(units)[1].getAttribute('aria-pressed')).toBe('true');
    wizard.setHeadStart(0);
    expect(arrivals(units)).toHaveLength(0);
  });

  it('draws nothing with no unit chosen', () => {
    const { wizard, units } = make();
    wizard.setHeadStart(14);
    expect(units.querySelector('.alius-new-arrivals')).toBeNull();
  });
});

describe('the calibration preview', () => {
  const preview = (headStartDays: number) => ({ stance: 'disciplined', stanceName: 'Disciplined', trust: 20, impunity: 10, band: 'low', headStartDays }) as never;
  const draw = (headStartDays: number): HTMLElement => {
    const { wizard } = make();
    wizard.toggleUnit(card('ann'));
    wizard.setManual(0); // a unit past its import: the calibration form is drawn
    const host = h('div');
    document.body.append(host);
    renderCalibration(host, { draft: wizard.state.units[0], registries: reg, desireBondDefects: false, startPreview: preview(headStartDays), onUpdate: vi.fn(), onRegenerate: vi.fn(), onManual: vi.fn() });
    return host;
  };

  it('with a head start it says the numbers move', () => {
    const hint = draw(14).querySelector('.alius-start-head-start');
    expect(hint?.textContent).toMatch(/head start of 14 days/i);
    expect(hint?.textContent).toMatch(/move/i);
  });

  it('without one it says nothing of it', () => {
    expect(draw(0).querySelector('.alius-start-head-start')).toBeNull();
    expect(draw(0).querySelector('.alius-start-stance')).not.toBeNull();
  });
});

describe('the review', () => {
  it('shows the head start and the new arrivals; nothing at arrival', () => {
    const { wizard } = make();
    wizard.toggleUnit(card('ann'));
    wizard.toggleUnit(card('bea'));
    expect(reviewLines(wizard, reg).some((l) => l.startsWith('HEAD START'))).toBe(false);
    wizard.setHeadStart(14);
    wizard.toggleNewArrival('bea.png');
    expect(reviewLines(wizard, reg)).toContain('HEAD START  : TWO WEEKS — NEW ARRIVALS: Bea');
    wizard.toggleNewArrival('bea.png');
    expect(reviewLines(wizard, reg)).toContain('HEAD START  : TWO WEEKS');
  });
});

describe('renderHeadStartSection on its own', () => {
  it('appends one section to the host', () => {
    const { wizard } = make();
    const host = h('div');
    renderHeadStartSection(host, wizard);
    expect(host.querySelectorAll('.alius-head-start')).toHaveLength(1);
  });
});
