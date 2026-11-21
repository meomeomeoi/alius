// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { Registries } from '../../src/content/types';
import { setCondition } from '../../src/engine/physics/conditions';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { renderCmdrCard } from '../../src/ui/commander/cmdrCard';
import { h } from '../../src/ui/dom';
import { wakeCard } from '../../src/ui/scene/wakeCard';
import { markedWithout, unreachable, unresolved } from '../helpers/analyzeCoverage';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
});
const env = (state: CampaignState): AnalyzeEnv => ({ registries: reg, state, settings: DEFAULT_SETTINGS });

describe('the wake-up card', () => {
  it('says when and where the commander came to and who is there, with no pronoun', () => {
    const s = campaign(reg, 4);
    s.lastWake = { day: 4, slot: 'evening', unitId: 'unit_ann' };
    const card = wakeCard(s, reg)!;
    document.body.append(card);
    expect(card.textContent).toContain('Day 4, the evening. The commander comes to, and Ann is there.');
    expect(card.textContent).toContain('Dizzy until the day ends.');
    expect(card.textContent).not.toMatch(/\b(he|him|his)\b/i);
    expect(markedWithout(card)).toEqual([]);
    expect(unresolved(card, env(s))).toEqual([]);
    expect(unreachable(card)).toEqual([]);
  });

  it('carries her first line when there is one, and as text', () => {
    const s = campaign(reg, 4);
    s.lastWake = { day: 1, slot: 'night', unitId: 'unit_ann', line: '<b>Easy now.</b>' };
    const card = wakeCard(s, reg)!;
    expect(card.querySelector('.alius-wake-line')!.textContent).toBe('"<b>Easy now.</b>"');
    expect(card.querySelector('b')).toBeNull();
  });

  it('is nothing without a card kept, and nothing while a scene is open', () => {
    expect(wakeCard(campaign(reg, 4), reg)).toBeNull();
    expect(wakeCard(null, reg)).toBeNull();
    const s = campaign(reg, 4);
    s.lastWake = { day: 1, slot: 'morning', unitId: 'unit_ann' };
    s.scene = { id: 's1' } as never;
    expect(wakeCard(s, reg)).toBeNull();
  });
});

describe('the CMDR card shows what the commander bears', () => {
  it('a chip per condition, each analyzable, none when there is none', () => {
    const s = campaign(reg, 4);
    const host = h('div');
    document.body.append(host);
    renderCmdrCard(host, { state: s, registries: reg, raw: false });
    expect(host.querySelector('[data-commander-conditions]')).toBeNull();
    setCondition(s, reg, 'dizzy', { day: s.day });
    setCondition(s, reg, 'stiff', { day: s.day, slot: s.slot });
    const again = h('div');
    document.body.append(again);
    renderCmdrCard(again, { state: s, registries: reg, raw: false });
    expect([...again.querySelectorAll('[data-commander-condition]')].map((e) => e.getAttribute('data-commander-condition'))).toEqual(['dizzy', 'stiff']);
    expect(again.querySelector('[data-commander-conditions]')!.textContent).toBe('CONDITION — DIZZY · STIFF');
    expect(markedWithout(again)).toEqual([]);
    expect(unresolved(again, env(s))).toEqual([]);
    expect(unreachable(again)).toEqual([]);
  });
});
