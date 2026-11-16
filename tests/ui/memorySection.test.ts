// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { AnalyzeEnv } from '../../src/analysis/model';
import type { Registries } from '../../src/content/types';
import { addFact } from '../../src/engine/memory';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../src/settings';
import { renderFill } from '../../src/ui/memory/fill';
import { renderMemorySection } from '../../src/ui/memory/memorySection';
import { h } from '../../src/ui/dom';
import { renderSysTab } from '../../src/ui/shell/sysTab';
import { FakeStAdapter } from '../../src/st/fake';
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

const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const env = (state: CampaignState | null): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS } });
const mount = (): HTMLElement => {
  const host = h('div');
  document.body.append(host);
  return host;
};
const BUILD = { memoryTokens: 212, otherTokens: 640, directiveTokens: 58 };
const section = (s: CampaignState, settings: Partial<AliusSettings> = {}, dispatch = vi.fn(() => [] as Array<{ type: string }>)) => {
  const host = mount();
  renderMemorySection(host, { state: s, settings: { ...DEFAULT_SETTINGS, ...settings }, dispatch, lastBuild: () => BUILD, onChanged: () => {} });
  return { host, dispatch };
};
const fresh = (): CampaignState => {
  const s = campaign(reg, 4);
  s.day = 12;
  return s;
};
const num = (host: HTMLElement, field: string): HTMLInputElement => host.querySelector(`input[name="memory:${field}"]`) as HTMLInputElement;

describe('SYS › MEMORY', () => {
  it('the preset buttons dispatch memory/configure and show the one in force', () => {
    const s = fresh();
    s.memory.config = { preset: 'long' };
    const { host, dispatch } = section(s);
    const pressed = [...host.querySelectorAll<HTMLElement>('[data-preset]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.preset);
    expect(pressed).toEqual(['long']);
    expect([...host.querySelectorAll<HTMLElement>('[data-preset]')].map((b) => b.dataset.preset)).toEqual(['short', 'normal', 'long', 'custom']);
    (host.querySelector('[data-preset="short"]') as HTMLElement).click();
    expect(dispatch).toHaveBeenCalledWith({ type: 'memory/configure', payload: { preset: 'short' } });
    (host.querySelector('[data-preset="custom"]') as HTMLElement).click();
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'memory/configure', payload: { preset: 'custom' } });
  });

  it('numbers are aria-disabled with the edit lock on, and change nothing', () => {
    const { host, dispatch } = section(fresh(), { editLock: true });
    for (const f of ['factsMax', 'foldAfterDays', 'recencyBase', 'retrievalK', 'memoryTokens', 'journalLines', 'dmLines', 'chronicleDays']) {
      const el = num(host, f);
      expect(el, f).not.toBeNull();
      expect(el.getAttribute('aria-disabled'), f).toBe('true');
    }
    const el = num(host, 'retrievalK');
    el.value = '9';
    el.dispatchEvent(new Event('change'));
    expect(dispatch).not.toHaveBeenCalled();
    expect(el.value).toBe('6'); // snapped back to what is in force
    expect(num(host, 'factsMax').value).toBe('160');
  });

  it('with the edit lock off a number goes through memory/configure as a custom preset', () => {
    const { host, dispatch } = section(fresh(), { editLock: false });
    const el = num(host, 'retrievalK');
    expect(el.getAttribute('aria-disabled')).toBeNull();
    el.value = '9';
    el.dispatchEvent(new Event('change'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'memory/configure', payload: { preset: 'custom', retrievalK: 9 } });
  });

  it('the rumor mode and the hiding are the player\'s own settings and keep the preset', () => {
    const s = fresh();
    s.memory.config = { preset: 'long' };
    const { host, dispatch } = section(s);
    const mode = host.querySelector('select[name="memory:rumorMode"]') as HTMLSelectElement;
    mode.value = 'model';
    mode.dispatchEvent(new Event('change'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'memory/configure', payload: { preset: 'long', rumorMode: 'model' } });
    const hide = num(host, 'hideScenesAfter');
    expect(hide.getAttribute('aria-disabled')).toBeNull(); // not a tuning number: no lock
    hide.value = '3';
    hide.dispatchEvent(new Event('change'));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'memory/configure', payload: { preset: 'long', hideScenesAfter: 3 } });
  });

  it('warns when the memory share is more than half of the context cap', () => {
    const s = fresh();
    expect(section(s).host.querySelector('[data-memory-warning]')).toBeNull(); // normal: 550 of 1600
    document.body.innerHTML = '';
    s.memory.config = { preset: 'long' }; // 900 > 800
    const w = section(s).host.querySelector('[data-memory-warning]');
    expect(w).not.toBeNull();
    expect(w!.textContent).toMatch(/half/);
    document.body.innerHTML = '';
    expect(section(s, { contextTokenCap: 2400 }).host.querySelector('[data-memory-warning]')).toBeNull();
  });

  it('every element has data-analyze, resolves and can be reached', () => {
    const { host } = section(fresh());
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(fresh()))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    expect(host.querySelectorAll('[data-analyze]').length).toBeGreaterThan(12);
  });
});

describe('the fill indicator', () => {
  const textOf = (host: HTMLElement, part: string): string => host.querySelector(`[data-fill="${part}"]`)!.textContent ?? '';

  it('the fill matches the state', () => {
    const s = fresh();
    for (let i = 0; i < 9; i++) addFact(s, { about: [ANN], text: `fact ${i}`, tags: [], importance: 3, day: 12, knownBy: [ANN] });
    s.memory.facts[0].pinned = true;
    s.memory.facts[1].pinned = true;
    s.memory.dossiers = { [ANN]: { own: 'a', shared: 'b', day: 11, folded: 6 }, [BEA]: { own: '', shared: '', day: 11, folded: 0 }, '*': { own: '', shared: 'w', day: 11, folded: 6 } };
    s.memory.chronicle.push({ id: 'c1', kind: 'scene', day: 11, text: 'x' }, { id: 'c2', kind: 'day', day: 10, text: 'y' });
    const host = mount();
    renderFill(host, s, BUILD, DEFAULT_SETTINGS);
    expect(textOf(host, 'facts')).toBe('9 / 160 (2 pinned)');
    expect(textOf(host, 'dossiers')).toBe('2'); // the empty one is not a dossier
    expect(textOf(host, 'chronicle')).toBe('2');
    expect(textOf(host, 'memory_tokens')).toBe('212 / 550');
    expect(textOf(host, 'directive_tokens')).toBe('58');
    expect(textOf(host, 'save_size')).toBe(`${(JSON.stringify(s).length / 1024).toFixed(1)} KB`);
  });

  it('the share follows the preset, and a hidden fact is not counted', () => {
    const s = fresh();
    s.memory.config = { preset: 'short' };
    addFact(s, { about: [ANN], text: 'seen', tags: [], importance: 3, day: 12, knownBy: [ANN] });
    addFact(s, { about: [ANN], text: 'unseen by the commander', tags: [], importance: 3, day: 12, knownBy: [ANN], hiddenFromCommander: true });
    const host = mount();
    renderFill(host, s, BUILD, DEFAULT_SETTINGS);
    expect(textOf(host, 'facts')).toBe('1 / 80');
    expect(textOf(host, 'memory_tokens')).toBe('212 / 350');
  });

  it('every element has data-analyze and resolves', () => {
    const s = fresh();
    const host = mount();
    renderFill(host, s, BUILD, DEFAULT_SETTINGS);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    expect(host.querySelectorAll('[data-fill]')).toHaveLength(6);
  });
});

describe('in the SYS tab', () => {
  const sys = (state: CampaignState | null, dispatch = vi.fn(() => [] as Array<{ type: string }>)) => {
    const host = mount();
    renderSysTab(host, {
      st: new FakeStAdapter(), getState: () => state, getLoad: () => ({ kind: 'none' }) as never, dispatch,
      toast: vi.fn(), modal: async () => null, onSettingsChanged: () => {}, lastBuild: () => BUILD, getRegistries: () => reg,
    });
    return { host, dispatch };
  };

  it('a campaign gets the MEMORY section with the fill of the last prompt; without one there is none', () => {
    const { host, dispatch } = sys(fresh());
    expect(host.querySelector('.alius-memory')).not.toBeNull();
    expect(host.querySelector('[data-fill="memory_tokens"]')!.textContent).toBe('212 / 550');
    (host.querySelector('[data-preset="long"]') as HTMLElement).click();
    expect(dispatch).toHaveBeenCalledWith({ type: 'memory/configure', payload: { preset: 'long' } });
    document.body.innerHTML = '';
    expect(sys(null).host.querySelector('.alius-memory')).toBeNull();
  });
});
