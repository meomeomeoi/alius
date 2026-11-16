// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { AnalyzeEnv } from '../../src/analysis/model';
import type { Registries } from '../../src/content/types';
import { addFact } from '../../src/engine/memory';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import { h } from '../../src/ui/dom';
import { renderMemoryBlock } from '../../src/ui/memory/memoryBlock';
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
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const env = (state: CampaignState): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS } });
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function world(): CampaignState {
  const s = campaign(reg, 4);
  s.day = 12;
  addFact(s, { about: [ANN], text: 'Ann keeps a letter.', tags: [], importance: 3, day: 9, knownBy: [ANN] });
  addFact(s, { about: [ANN], text: 'Ann held the gate.', tags: [], importance: 5, day: 11, knownBy: ['*'] });
  addFact(s, { about: [ANN], text: 'Ann broke down at the gate.', tags: [], importance: 4, day: 12, knownBy: [ANN, BEA], heard: { [BEA]: 12 } } as never);
  addFact(s, { about: [BEA], text: 'Bea cooks for everyone.', tags: [], importance: 2, day: 10, knownBy: [BEA] });
  addFact(s, { about: [ANN], text: 'Ann knows a way out.', tags: [], importance: 5, day: 12, knownBy: [ANN], hiddenFromCommander: true });
  addFact(s, { about: ['world'], text: 'The base was nearly lost.', tags: [], importance: 4, day: 8, knownBy: ['*'] });
  s.memory.dossiers = { [ANN]: { own: 'OWN-ANN she writes at night', shared: 'SHARED-ANN the squad sniper', day: 11, folded: 6 }, '*': { own: '', shared: 'WORLD-SHARED', day: 10, folded: 6 } };
  return s;
}
const block = (s: CampaignState, over: { target?: string; settings?: Partial<AliusSettings>; confirm?: (t: string) => Promise<boolean> } = {}) => {
  const host = h('div');
  document.body.append(host);
  const dispatch = vi.fn(() => [] as Array<{ type: string }>);
  const confirm = vi.fn(over.confirm ?? (async () => true));
  const onChanged = vi.fn();
  renderMemoryBlock(host, { state: s, settings: { ...DEFAULT_SETTINGS, ...over.settings }, target: over.target ?? ANN, dispatch, confirm, onChanged });
  return { host, dispatch, confirm, onChanged };
};
const facts = (host: HTMLElement): string[] => [...host.querySelectorAll('[data-fact] [data-role="text"]')].map((e) => e.textContent ?? '');
const btn = (host: HTMLElement, sel: string): HTMLElement => host.querySelector(sel) as HTMLElement;

describe('the MEMORY view', () => {
  it('lists the unit\'s facts newest first and her dossier', () => {
    const { host } = block(world());
    expect(facts(host)).toEqual(['Ann broke down at the gate.', 'Ann held the gate.', 'Ann keeps a letter.']);
    expect(host.querySelector('[data-part="own"]')!.textContent).toContain('OWN-ANN she writes at night');
    expect(host.querySelector('[data-part="shared"]')!.textContent).toContain('SHARED-ANN the squad sniper');
    const first = host.querySelector('[data-fact]')!;
    expect(first.textContent).toContain('DAY 12');
    expect(first.textContent).toMatch(/\b4\b/); // importance
    expect(host.textContent).not.toContain('Bea cooks');
  });

  it('chips say whether she saw it, heard it or everyone knows it', () => {
    const { host } = block(world());
    const chip = (text: string): string | null => [...host.querySelectorAll('[data-fact]')].find((f) => f.textContent?.includes(text))!.querySelector('[data-chip]')!.getAttribute('data-chip');
    expect(chip('Ann keeps a letter.')).toBe('seen');
    expect(chip('Ann broke down at the gate.')).toBe('heard');
    expect(chip('Ann held the gate.')).toBe('public');
  });

  it('a hidden fact is never listed', () => {
    const { host } = block(world());
    expect(host.textContent).not.toContain('a way out');
    expect(facts(host)).toHaveLength(3);
  });

  it('the world block lists the facts about the world and the world dossier', () => {
    const { host } = block(world(), { target: '*' });
    expect(facts(host)).toEqual(['The base was nearly lost.']);
    expect(host.textContent).toContain('WORLD-SHARED');
    expect(host.querySelector('[data-part="own"]')).toBeNull(); // nothing private in the world's
  });

  it('pin and forget dispatch; forget asks first', async () => {
    const s = world();
    const { host, dispatch, confirm, onChanged } = block(s);
    const id = s.memory.facts.find((f) => f.text === 'Ann keeps a letter.')!.id;
    btn(host, `[data-fact="${id}"] [data-action="pin"]`).click();
    expect(dispatch).toHaveBeenCalledWith({ type: 'memory/pin', payload: { factId: id, pinned: true } });
    expect(onChanged).toHaveBeenCalled();
    btn(host, `[data-fact="${id}"] [data-action="forget"]`).click();
    await flush();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'memory/forget', payload: { factId: id } });
  });

  it('a refused forget changes nothing; a pinned fact offers UNPIN', async () => {
    const s = world();
    s.memory.facts.find((f) => f.text === 'Ann keeps a letter.')!.pinned = true;
    const { host, dispatch } = block(s, { confirm: async () => false });
    const id = s.memory.facts.find((f) => f.text === 'Ann keeps a letter.')!.id;
    btn(host, `[data-fact="${id}"] [data-action="forget"]`).click();
    await flush();
    expect(dispatch).not.toHaveBeenCalled();
    expect(btn(host, `[data-fact="${id}"] [data-action="pin"]`).textContent).toMatch(/UNPIN/);
    btn(host, `[data-fact="${id}"] [data-action="pin"]`).click();
    expect(dispatch).toHaveBeenCalledWith({ type: 'memory/pin', payload: { factId: id, pinned: false } });
  });

  it('edit controls only with the lock off', () => {
    const locked = block(world(), { settings: { editLock: true } });
    expect(locked.host.querySelector('[data-action="edit"]')).toBeNull();
    expect(locked.host.querySelector('[data-action="edit-dossier"]')).toBeNull();
    expect(locked.host.querySelector('[data-action="pin"]')).not.toBeNull(); // pin and forget are always there
    expect(locked.host.querySelector('[data-action="forget"]')).not.toBeNull();
    document.body.innerHTML = '';
    const s = world();
    const open = block(s, { settings: { editLock: false } });
    expect(open.host.querySelectorAll('[data-action="edit"]')).toHaveLength(3);
    const id = s.memory.facts.find((f) => f.text === 'Ann keeps a letter.')!.id;
    btn(open.host, `[data-fact="${id}"] [data-action="edit"]`).click();
    const ta = open.host.querySelector(`[data-fact="${id}"] textarea`) as HTMLTextAreaElement;
    expect(ta.value).toBe('Ann keeps a letter.');
    ta.value = 'Ann keeps two letters.';
    btn(open.host, `[data-fact="${id}"] [data-action="save"]`).click();
    expect(open.dispatch).toHaveBeenCalledWith({ type: 'memory/edit', payload: { factId: id, text: 'Ann keeps two letters.' } });
  });

  it('EDIT DOSSIER sets both parts through memory/edit_dossier', () => {
    const { host, dispatch } = block(world(), { settings: { editLock: false } });
    btn(host, '[data-action="edit-dossier"]').click();
    const [own, shared] = [...host.querySelectorAll<HTMLTextAreaElement>('.alius-memory-dossier textarea')];
    own.value = 'new own';
    shared.value = 'new shared';
    btn(host, '[data-action="save-dossier"]').click();
    expect(dispatch).toHaveBeenCalledWith({ type: 'memory/edit_dossier', payload: { target: ANN, own: 'new own', shared: 'new shared' } });
  });

  it('chips and buttons carry data-analyze, resolve and can be reached', () => {
    const s = world();
    const { host } = block(s, { settings: { editLock: false } });
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    expect(host.querySelectorAll('[data-analyze]').length).toBeGreaterThan(8);
  });

  it('a unit with nothing remembered says so', () => {
    const { host } = block(world(), { target: 'unit_cat' });
    expect(host.textContent).toMatch(/nothing remembered/i);
  });
});

describe('in the SQUAD tab', () => {
  it('each unit has a MEMORY block when the app gives the tab its memory hooks', () => {
    const s = world();
    const host = h('div');
    document.body.append(host);
    const dispatch = vi.fn(() => [] as Array<{ type: string }>);
    renderSquadTab(host, {
      st: new FakeStAdapter(), getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }) as never, registries: reg, settings: () => ({ ...DEFAULT_SETTINGS }),
      onNewCampaign: () => {}, memory: { dispatch, confirm: async () => true, onChanged: () => {} },
    });
    expect(host.querySelectorAll('.alius-memory-block').length).toBe(s.squad.length);
    expect(host.querySelector(`.alius-memory-block[data-memory-target="${ANN}"]`)!.textContent).toContain('Ann keeps a letter.');
    const without = h('div');
    renderSquadTab(without, { st: new FakeStAdapter(), getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }) as never, registries: reg, settings: () => ({ ...DEFAULT_SETTINGS }), onNewCampaign: () => {} });
    expect(without.querySelector('.alius-memory-block')).toBeNull();
  });
});
