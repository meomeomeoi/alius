// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { registerFrameReader, resetBlockingHooks } from '../../src/engine/blocking';
import { drillDayStep } from '../../src/engine/craft/programmes/drill';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import { h } from '../../src/ui/dom';
import { renderHomeTab, type HomeCtx } from '../../src/ui/home/homeTab';
import { markedWithout, unresolved } from '../helpers/analyzeCoverage';
import { ctxOf, loadCore } from '../helpers/world';
import { ANN, unitOf, world } from '../engine/practice/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { resetBlockingHooks(); document.body.innerHTML = ''; });

function mounted() {
  registerFrameReader(() => 'play');
  const s = world(reg, 'play');
  s.relations[ANN].stateId = 'confidant';
  unitOf(s, ANN).bond!.practice!.style = { primary: 'drill' };
  s.content = { enabled: [...new Set([...(s.content?.enabled ?? []), 'worship', 'restraint', 'service', 'objectification', 'humiliation'])] };
  s.relations[ANN].craft = { records: { weight: { longest: 200, clean: 200, noTap: 200, day: 3 } } };
  drillDayStep(s, ctxOf(s, reg));
  const host = h('div');
  document.body.append(host);
  const ctx: HomeCtx = {
    getState: () => s, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }), settings: () => DEFAULT_SETTINGS,
    onReadNote: vi.fn(), rule: { accept: vi.fn(), negotiate: vi.fn(), refuse: vi.fn() },
  };
  renderHomeTab(host, ctx);
  return { host, s };
}

describe('HOME: a drill holder\'s norm', () => {
  it('is a note in her hand with data-analyze, and the pass mark is not a number on screen', () => {
    const { host, s } = mounted();
    const note = [...host.querySelectorAll<HTMLElement>('.alius-note')].find((n) => n.textContent?.includes('norm'));
    expect(note).toBeDefined();
    expect(note!.getAttribute('data-analyze')).toBe('glossary:craft_norm');
    expect(note!.getAttribute('data-note-by')).toBe('Ann');
    expect(note!.textContent).toContain('weight 4 minutes');
    expect(host.textContent).not.toMatch(/80|pass mark|%/i);
    expect(note!.querySelector('button')).toBeNull(); // read at once: nothing to dismiss
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, { registries: reg, state: s, settings: DEFAULT_SETTINGS })).toEqual([]);
  });

  it('no norm, no note', () => {
    registerFrameReader(() => 'play');
    const s = world(reg, 'play');
    const host = h('div');
    renderHomeTab(host, { getState: () => s, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }), settings: () => DEFAULT_SETTINGS, onReadNote: vi.fn(), rule: { accept: vi.fn(), negotiate: vi.fn(), refuse: vi.fn() } });
    expect(host.querySelector('.alius-note')).toBeNull();
  });
});
