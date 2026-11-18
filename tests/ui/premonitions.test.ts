// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resetKnowledgeRules } from '../../src/analysis/knowledge';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import { readingFor } from '../../src/analysis/providers';
import { parseSubject } from '../../src/analysis/subject';
import { loadPacks } from '../../src/content/loader';
import type { Registries } from '../../src/content/types';
import { premonitionLine } from '../../src/engine/special/paranoia/premonitions';
import type { Premonition, PremonitionAbout } from '../../src/engine/special/state';
import type { CampaignState } from '../../src/engine/state/types';
import { ContextBuilder } from '../../src/llm/context';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { createSpecial, type SpecialDeps } from '../../src/special/controller';
import { h } from '../../src/ui/dom';
import { renderCmdrCard } from '../../src/ui/commander/cmdrCard';
import { renderPremonitions } from '../../src/ui/special/premonitions';
import { VOICE_OF } from '../../src/ui/voice/sources';
import { hiddenFixture } from '../fixtures/analyze/hidden';
import { allReadings, leaks } from '../helpers/analyze';
import { markedWithout, unresolved } from '../helpers/analyzeCoverage';
import { campaign } from '../helpers/world';
import { worldHarness } from '../helpers/worldApp';
import { ANN, BEA, specialCampaign } from '../helpers/special';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
  registerCoreProviders();
});
afterEach(() => { resetKnowledgeRules(); document.body.innerHTML = ''; });

const pm = (over: Partial<Premonition> = {}): Premonition => ({ id: 'pm1', unitId: ANN, about: 'doubt' as PremonitionAbout, day: 5, expiresDay: 8, real: true, ...over });
const stateWith = (list: Premonition[], day = 6): CampaignState => {
  const s = specialCampaign(reg, 'bloom_paranoia');
  s.day = day;
  s.special!.paranoia!.premonitions = list;
  return s;
};
const draw = (s: CampaignState): HTMLElement => {
  const host = h('div');
  document.body.append(host);
  renderPremonitions(host, s, reg);
  return host;
};

describe('the PREMONITIONS list', () => {
  it('shows day, name, the line and a PREMONITION chip with data-analyze, newest first', () => {
    const s = stateWith([pm({ id: 'pm1', day: 4, expiresDay: 7 }), pm({ id: 'pm2', unitId: BEA, about: 'mutiny', day: 6, expiresDay: 9 })]);
    const host = draw(s);
    const rows = [...host.querySelectorAll('li')];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Day 6');
    expect(rows[0].textContent).toContain('Bea');
    expect(rows[0].textContent).toContain(premonitionLine(reg, pm({ id: 'pm2', unitId: BEA, about: 'mutiny' }), 'Bea'));
    expect(rows[1].textContent).toContain('Day 4');
    const chip = rows[0].querySelector('.alius-chip')!;
    expect(chip.textContent).toBe('PREMONITION');
    expect(chip.getAttribute('data-analyze')).toBe('glossary:premonition');
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, { registries: reg, state: s, settings: DEFAULT_SETTINGS })).toEqual([]);
  });

  it('hides expired, acted and old rows; nothing is drawn without the paranoia state', () => {
    const s = stateWith([
      pm({ id: 'pm1', expiresDay: 5 }), // expired yesterday
      pm({ id: 'pm2', acted: 'preempted', expiresDay: 9 }),
      pm({ id: 'pm3', acted: 'false', expiresDay: 9 }),
      pm({ id: 'pm4', day: 5, expiresDay: 9 }),
    ]);
    expect([...draw(s).querySelectorAll('li')]).toHaveLength(1);
    expect(draw(campaign(reg, 2)).children).toHaveLength(0);
    expect(draw(stateWith([])).querySelector('li')).toBeNull();
  });

  it('is part of the CMDR card', () => {
    const host = h('div');
    renderCmdrCard(host, { state: stateWith([pm()]), registries: reg, raw: false });
    expect(host.querySelectorAll('.alius-premonitions li')).toHaveLength(1);
  });

  it('the line has no digit and no pronoun for the commander', () => {
    for (const about of ['doubt', 'desertion', 'mutiny', 'defiance'] as const) {
      for (let i = 0; i < 12; i++) {
        const line = premonitionLine(reg, pm({ id: `pm${i}`, about }), 'Ann');
        expect(line).toContain('Ann');
        expect(line).not.toMatch(/[{}\d]|\b(he|him|his)\b/i);
      }
    }
  });
});

describe('a real and a false premonition are the same to the player (Review Focus 2)', () => {
  it('give identical DOM', () => {
    expect(draw(stateWith([pm({ real: true })])).innerHTML).toBe(draw(stateWith([pm({ real: false })])).innerHTML);
    const a = h('div');
    const b = h('div');
    renderCmdrCard(a, { state: stateWith([pm({ real: true })]), registries: reg, raw: true });
    renderCmdrCard(b, { state: stateWith([pm({ real: false })]), registries: reg, raw: true });
    const norm = (el: HTMLElement) => el.innerHTML.replace(/alius-fx-\d+/g, 'alius-fx'); // the voice card numbers its SVG filters globally
    expect(norm(a)).toBe(norm(b));
    expect(a.outerHTML).not.toMatch(/\breal\b|data-real|data-true/i);
  });

  it('give identical toasts for the same event', () => {
    const run = (real: boolean) => {
      const hr = worldHarness(reg, stateWith([pm({ real })]));
      const notices: unknown[] = [];
      const deps: SpecialDeps = { ...hr.deps, context: new ContextBuilder(), refreshContext: vi.fn(), notice: (...a) => { notices.push(a); } };
      createSpecial(deps).onEvents([{ type: 'premonition', unitId: ANN, premonitionId: 'pm1', about: 'doubt' }]);
      return notices;
    };
    const real = run(true);
    expect(real).toHaveLength(1);
    expect(real).toEqual(run(false));
    expect((real[0] as string[])[2]).toBe('PREMONITION');
    expect((real[0] as string[])[0]).toBe('warn');
    expect((real[0] as string[])[1]).toBe(premonitionLine(reg, pm(), 'Ann'));
    expect(VOICE_OF.premonition).toBe('terminal');
  });
});

describe('readings', () => {
  it('no provider shows a premonition sentinel, with raw values on or off', () => {
    const { state, unitId } = hiddenFixture(reg);
    for (const raw of [false, true]) {
      const text = allReadings({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } }, unitId);
      expect(leaks(text, { numbers: [], texts: ['SENTINEL_PREMONITION_REAL', 'SENTINEL_PREMONITION_FALSE'] }), `raw ${raw}`).toEqual([]);
    }
  });

  it('the premonition reading counts open warnings and never says which is real; the false-alarm reading is constant', () => {
    const read = (id: string, s: CampaignState) => readingFor(parseSubject(`glossary:${id}`)!, { registries: reg, state: s, settings: DEFAULT_SETTINGS })!.lines.join(' ');
    const real = stateWith([pm({ real: true }), pm({ id: 'pm2', unitId: BEA, real: true })]);
    const fake = stateWith([pm({ real: false }), pm({ id: 'pm2', unitId: BEA, real: false })]);
    expect(read('premonition', real)).toBe(read('premonition', fake));
    expect(read('premonition', real)).toMatch(/2 warnings open/);
    expect(read('premonition', real)).not.toMatch(/\b(real|false|true)\b/i);
    expect(read('false_alarm', real)).toBe(read('false_alarm', stateWith([])));
    expect(read('false_alarm', real)).toMatch(/nothing marks which/i);
    const dreamt = stateWith([]);
    dreamt.special!.paranoia!.lastNightmareDay = dreamt.day - 1;
    expect(read('bloom_nightmare', dreamt)).toMatch(/slept badly/i);
    expect(read('bloom_nightmare', stateWith([]))).not.toMatch(/slept badly/i);
  });
});
