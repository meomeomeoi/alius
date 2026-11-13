// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import { DESCRIPTORS } from '../../src/engine/commander/profile';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS, getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import { renderCmdrCard } from '../../src/ui/commander/cmdrCard';
import { h } from '../../src/ui/dom';
import { renderSquadTab } from '../../src/ui/squad/squadTab';
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

function world(): CampaignState {
  const s = campaign(reg, 2);
  s.commander.body = { strength: 4, endurance: 3, reflexes: 2 };
  s.commander.expression = 2;
  s.commander.seasoning = 5;
  s.commander.archetype = 'average';
  s.commander.traits = { regular: ['old_wound', 'bookish'], special: 'vow_of_distance' };
  return s;
}
function card(state: CampaignState, raw = false) {
  const host = h('div');
  document.body.append(host);
  renderCmdrCard(host, { state, registries: reg, raw });
  return host;
}
const env = (state: CampaignState, raw = false): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } });

describe('CMDR card', () => {
  it('the CMDR card shows descriptors and traits, no digits', () => {
    const host = card(world());
    const root = host.querySelector('section.alius-cmdr')!;
    const text = root.textContent!;
    expect(text).toContain('Vale');
    expect(text).toContain('Strong');
    expect(text).toContain('Average');
    expect(text).toContain('Slow');
    expect(text).toContain('Feminine');
    expect(text).toContain('Veteran');
    expect(text).toMatch(/average/);
    for (const name of ['Old Wound', 'Bookish', 'Vow of Distance']) expect(text).toContain(name);
    for (const el of root.querySelectorAll('.alius-stat')) expect(el.textContent).not.toMatch(/\d/);
    // the commander's own name may contain no digit here; nothing else on the card does
    expect(text).not.toMatch(/\d/);
  });

  it('shows the crime and an empty reputation slot', () => {
    const text = card(world()).textContent!;
    expect(text).toContain(String(reg.crimes.get('mutiny')!.name));
    expect(text).toContain('REPUTATION — NONE ON FILE');
  });

  it('with raw values on the stats show their numbers', () => {
    const host = card(world(), true);
    expect(host.querySelector('[data-analyze="glossary:body_strength"]')!.textContent).toBe('Strong (4)');
    expect(host.querySelector('[data-analyze="glossary:body_endurance"]')!.textContent).toBe('Average (3)');
    expect(host.querySelector('[data-analyze="glossary:body_reflexes"]')!.textContent).toBe('Slow (2)');
    expect(host.querySelector('[data-analyze="glossary:seasoning"]')!.textContent).toBe('Veteran (5)');
    expect(host.querySelector('[data-analyze="glossary:expression"]')!.textContent).toBe('Feminine (2)');
  });

  it('every word on the card is a known descriptor', () => {
    const host = card(world());
    const allowed = new Set(Object.values(DESCRIPTORS).flat());
    for (const el of host.querySelectorAll('[data-analyze^="glossary:body_"], [data-analyze="glossary:expression"], [data-analyze="glossary:seasoning"]')) {
      expect(allowed.has(el.textContent!.trim())).toBe(true);
    }
  });

  it('a commander from an older save shows the defaults without crashing', () => {
    const s = campaign(reg, 1);
    for (const k of ['body', 'bodyXp', 'expression', 'seasoning', 'traits', 'archetype'] as const) delete s.commander[k];
    const text = card(s).textContent!;
    expect(text).toContain('Average');
    expect(text).toContain('Experienced');
    expect(text).not.toContain('undefined');
  });

  it('a campaign without traits shows NONE', () => {
    expect(card(campaign(reg, 1)).textContent).toMatch(/TRAITS\s*NONE|TRAITS: NONE|NO TRAITS/);
  });

  it('every marked element resolves and is reachable', () => {
    const s = world();
    const host = card(s);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    expect(host.querySelectorAll('[data-analyze]').length).toBeGreaterThan(8);
  });

  it('trait names from content are text, never markup', () => {
    const s = campaign(reg, 1);
    s.commander.traits = { regular: ['evil'] };
    const evil: Registries = { ...reg, commanderTraits: new Map([['evil', { id: 'evil', name: '<img src=x onerror=alert(1)>', kind: 'regular', upside: 'u', downside: 'd', effects: [], description: 'x' } as never]]) };
    const host = h('div');
    document.body.append(host);
    renderCmdrCard(host, { state: s, registries: evil, raw: false });
    expect(host.querySelector('img')).toBeNull();
  });
});

describe('the CMDR card is the first thing in the SQUAD tab', () => {
  it('comes before the unit blocks', () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const state = world();
    const host = h('div');
    document.body.append(host);
    const settings = { ...getSettings(st), showRawValues: false };
    renderSquadTab(host, { st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, settings: () => settings, onNewCampaign: () => {} });
    const first = host.querySelector('section')!;
    expect(first.classList.contains('alius-cmdr')).toBe(true);
    expect(host.querySelectorAll('section.alius-cmdr')).toHaveLength(1);
    expect(host.querySelector('.alius-squad')).not.toBeNull();
  });

  it('is shown even when nobody is assigned yet', () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const state = campaign(reg, 1);
    state.squad = [];
    const host = h('div');
    document.body.append(host);
    const settings = { ...getSettings(st), showRawValues: false };
    renderSquadTab(host, { st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, settings: () => settings, onNewCampaign: () => {} });
    expect(host.querySelector('section.alius-cmdr')).not.toBeNull();
    expect(host.textContent).toContain('NO UNITS ASSIGNED');
  });
});
