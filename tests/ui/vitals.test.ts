// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { HEART_TEXT, TEMP_TEXT, renderVitalsBlock, renderVitalsStrip } from '../../src/ui/vitals/block';
import { renderTrace, tracePoints } from '../../src/ui/vitals/trace';
import { vitalsOf } from '../../src/engine/vitals';
import type { CampaignState } from '../../src/engine/state/types';
import { campaign, loadCore } from '../helpers/world';
import { withDefect } from '../helpers/loyalty';
import { markedWithout, unresolved } from '../helpers/analyzeCoverage';
import { DEFAULT_SETTINGS } from '../../src/settings';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  document.body.innerHTML = '';
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];

function world(): CampaignState {
  const s = campaign(reg, 4);
  s.day = 5;
  s.slot = 'afternoon';
  for (const u of s.squad) u.defects = [];
  return s;
}
const bandTexts = [...Object.values(HEART_TEXT), ...Object.values(TEMP_TEXT)];
/** The text of an element with the illustrative band texts taken out. */
const withoutBands = (el: HTMLElement): string => bandTexts.reduce((t, b) => t.replaceAll(b, ''), el.textContent ?? '');

describe('VITALS block', () => {
  it('shows the pattern chip, HR and TEMP, each analyzable with the unit', () => {
    const s = world();
    s.squad[0].stress = 55;
    const v = vitalsOf(s, reg, ANN)!;
    const block = renderVitalsBlock(s, reg, ANN, { motion: true })!;
    document.body.append(block);
    expect(block.textContent).toContain('ELEVATED');
    expect(block.textContent).toContain(HEART_TEXT[v.heart]);
    expect(block.textContent).toContain(TEMP_TEXT[v.temp]);
    const chips = [...block.querySelectorAll<HTMLElement>('.alius-chip')];
    expect(chips.length).toBeGreaterThanOrEqual(3);
    for (const c of chips) {
      expect(c.dataset.analyze).toMatch(/^glossary:vitals/);
      expect(JSON.parse(c.dataset.analyzeCtx!)).toEqual({ unitId: ANN });
    }
  });

  it('contains no digit outside the HR / TEMP band texts', () => {
    for (const setup of [(s: CampaignState) => { s.squad[0].stress = 90; }, (s: CampaignState) => { s.squad[0].stress = 60; }, (s: CampaignState) => withDefect(s, ANN, 'affect_dampener')]) {
      const s = world();
      s.ledger = [{ day: 5, slot: 'afternoon', action: 'combat/act', key: `stress:${ANN}`, delta: 17 }];
      setup(s);
      const block = renderVitalsBlock(s, reg, ANN, { motion: true })!;
      expect(withoutBands(block)).not.toMatch(/\d/);
    }
  });

  it('a flat unit lists its flickers as DAY ### SLOT, newest first', () => {
    const s = world();
    withDefect(s, ANN, 'affect_dampener');
    s.ledger = [
      { day: 4, slot: 'evening', action: 'scene/exchange', key: `axis:${ANN}:attraction`, delta: 3 },
      { day: 5, slot: 'morning', action: 'scene/exchange', key: `axis:${ANN}:affinity`, delta: 4 },
    ];
    const block = renderVitalsBlock(s, reg, ANN, { motion: true })!;
    const log = [...block.querySelectorAll('.alius-vitals-log li')].map((li) => li.textContent);
    expect(log).toEqual(['DAY 005 MORNING', 'DAY 004 EVENING']);
    expect(block.querySelector('.alius-vitals-log [data-analyze]')).not.toBeNull();
    expect(block.querySelector('[data-analyze="glossary:vitals_flat"]')).not.toBeNull();
    expect(block.querySelector('[data-analyze="glossary:vitals_flicker"]')).not.toBeNull();
  });

  it('a unit without flickers lists none, and a non-flat unit never has the log', () => {
    const s = world();
    withDefect(s, ANN, 'affect_dampener');
    expect(renderVitalsBlock(s, reg, ANN, { motion: true })!.querySelector('.alius-vitals-log')).toBeNull();
    expect(renderVitalsBlock(s, reg, BEA, { motion: true })!.querySelector('.alius-vitals-log')).toBeNull();
  });

  it('is null for a grunt and for a unit who is gone', () => {
    const s = world();
    s.squad[1].status = 'dead';
    expect(renderVitalsBlock(s, reg, BEA, { motion: true })).toBeNull();
    expect(renderVitalsBlock(s, reg, 'nobody', { motion: true })).toBeNull();
  });

  it('no sweep class under reduced motion, a sweep class with motion', () => {
    const s = world();
    expect(renderVitalsBlock(s, reg, ANN, { motion: true })!.querySelector('.is-sweeping')).not.toBeNull();
    expect(renderVitalsBlock(s, reg, ANN, { motion: false })!.querySelector('.is-sweeping')).toBeNull();
  });

  it('does not use innerHTML for text (an unusual name stays text)', () => {
    const s = world();
    s.squad[0].displayName = '<b>Ann</b>';
    const strip = renderVitalsStrip(s, reg, { motion: true })!;
    expect(strip.querySelector('b')).toBeNull();
    expect(strip.textContent).toContain('<b>Ann</b>');
  });
});

describe('trace', () => {
  it('is an svg polyline with 48 points, the same seed gives the same points', () => {
    const el = renderTrace('spiking', 'seed-a', { motion: false });
    expect(el.namespaceURI).toBe('http://www.w3.org/2000/svg');
    const line = el.querySelector('polyline')!;
    expect(line.getAttribute('points')!.trim().split(/\s+/)).toHaveLength(48);
    expect(renderTrace('spiking', 'seed-a', { motion: false }).outerHTML).toBe(el.outerHTML);
    expect(tracePoints('spiking', 'seed-a')).toEqual(tracePoints('spiking', 'seed-a'));
    expect(tracePoints('spiking', 'seed-b')).not.toEqual(tracePoints('spiking', 'seed-a'));
  });

  it('every value is within 0–1, a flat line sits at 0.5 and a flicker adds one blip', () => {
    for (const p of ['steady', 'elevated', 'spiking', 'flat', 'erratic'] as const) {
      expect(tracePoints(p, 'x').every((v) => v >= 0 && v <= 1)).toBe(true);
    }
    expect(new Set(tracePoints('flat', 'x'))).toEqual(new Set([0.5]));
    const blip = tracePoints('flat', 'x', 48, true);
    expect(blip.filter((v) => v !== 0.5)).toHaveLength(1);
  });

  it('a spiking line reaches higher than a steady one', () => {
    expect(Math.max(...tracePoints('spiking', 'k'))).toBeGreaterThan(Math.max(...tracePoints('steady', 'k')));
  });
});

describe('hub strip', () => {
  it('lists named living units only, each with a small trace', () => {
    const s = world();
    s.squad[1].status = 'dead';
    s.squad[2].kind = 'grunt';
    const strip = renderVitalsStrip(s, reg, { motion: false })!;
    document.body.append(strip);
    const rows = [...strip.querySelectorAll('li')];
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining('Ann'), expect.stringContaining('Dee')]);
    expect(rows.every((r) => r.querySelector('polyline'))).toBe(true);
    expect(rows.every((r) => r.getAttribute('data-analyze') === 'glossary:vitals')).toBe(true);
  });

  it('is null when nobody qualifies', () => {
    const s = world();
    for (const u of s.squad) u.status = 'dead';
    expect(renderVitalsStrip(s, reg, { motion: true })).toBeNull();
  });
});

describe('analysis coverage', () => {
  it('every marked element resolves and every stat/chip is marked', () => {
    const s = world();
    withDefect(s, ANN, 'affect_dampener');
    s.ledger = [{ day: 5, slot: 'afternoon', action: 'scene/exchange', key: `axis:${ANN}:affinity`, delta: 4 }];
    const root = document.createElement('div');
    root.append(renderVitalsBlock(s, reg, ANN, { motion: true })!, renderVitalsBlock(s, reg, BEA, { motion: true })!, renderVitalsStrip(s, reg, { motion: true })!);
    document.body.append(root);
    expect(markedWithout(root)).toEqual([]);
    expect(unresolved(root, { registries: reg, state: s, settings: DEFAULT_SETTINGS })).toEqual([]);
  });
});
