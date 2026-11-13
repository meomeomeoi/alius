// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { animationMs, attachAnalyzer, type Analyzer } from '../../src/ui/analyze/analyzer';
import { attachCombatKeys } from '../../src/ui/combat/keys';
import { analyzeAttrs } from '../../src/ui/analyze/mark';
import { h } from '../../src/ui/dom';
import { emptyRegistries, type Entry } from '../../src/content/types';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../src/settings';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { FakeStAdapter } from '../../src/st/fake';
import { renderCombatScreen } from '../../src/ui/combat/combatScreen';
import { createShell } from '../../src/ui/shell/shell';
import { campaign, loadCore, run } from '../helpers/world';

const GLOSSARY: Entry[] = [
  { id: 'trust', term: 'Trust', short: 'Belief in you. See [[stress]].' },
  { id: 'stress', term: 'Stress', short: 'Strain. See [[cp]].' },
  { id: 'cp', term: 'CP', short: 'Command points. See [[trust]].' },
];

let settings: AliusSettings;
let analyzer: Analyzer | null = null;
let root: HTMLElement;

const registries = () => {
  const reg = emptyRegistries();
  for (const g of GLOSSARY) reg.glossary.set(g.id, g);
  return reg;
};
const getEnv = (): AnalyzeEnv => ({ registries: registries(), state: null, settings });

function ptr(type: string, target: EventTarget, init: Record<string, unknown> = {}) {
  const e = Object.assign(new Event(type, { bubbles: true, cancelable: true }), { pointerType: 'mouse', clientX: 0, clientY: 0, ...init });
  target.dispatchEvent(e);
  return e;
}
const key = (target: EventTarget, k: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};
const panel = () => document.querySelector<HTMLElement>('.alius-analyze');
const panelText = () => panel()?.textContent ?? '';
const chip = (address = 'glossary:trust', ctx?: Record<string, unknown>) => h('span', { class: 'alius-chip', ...analyzeAttrs(address, ctx) }, 'chip');

function setup(over: Partial<AliusSettings> = {}, deps: { reducedMotion?: () => boolean } = {}) {
  settings = { ...DEFAULT_SETTINGS, ...over };
  const a = chip('glossary:trust');
  const b = chip('glossary:stress');
  const input = h('input', { type: 'text' }) as HTMLInputElement;
  const field = h('label', { ...analyzeAttrs('glossary:cp') }, input);
  const button = h('button', { type: 'button', class: 'alius-option', ...analyzeAttrs('glossary:stress') }, 'press') as HTMLButtonElement;
  root.append(a, b, field, button);
  analyzer = attachAnalyzer(root, { getEnv, ...deps });
  return { a, b, input, button, field };
}

beforeEach(() => {
  vi.useFakeTimers();
  root = h('div', { id: 'alius-shell' });
  document.body.append(root);
});
afterEach(() => {
  analyzer?.destroy();
  analyzer = null;
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('animationMs', () => {
  it('full is 600 ms the first time and 150 ms after, short is 150, off and reduced motion are 0', () => {
    expect(animationMs('full', false, false)).toBe(600);
    expect(animationMs('full', true, false)).toBe(150);
    expect(animationMs('short', false, false)).toBe(150);
    expect(animationMs('short', true, false)).toBe(150);
    expect(animationMs('off', false, false)).toBe(0);
    expect(animationMs('full', false, true)).toBe(0);
    expect(animationMs('short', true, true)).toBe(0);
  });
});

describe('mouse', () => {
  it('hover waits the hover delay, then opens near the cursor', () => {
    const { a } = setup({ analyzeAnimation: 'off' });
    ptr('pointerover', a, { clientX: 100, clientY: 80 });
    vi.advanceTimersByTime(249);
    expect(panel()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(panel()).not.toBeNull();
    expect(panel()!.style.left).toBe('112px');
    expect(panel()!.style.top).toBe('92px');
    expect(panelText()).toContain('Belief in you.');
    expect(analyzer!.isOpen()).toBe(true);
    expect(analyzer!.isPinned()).toBe(false);
  });

  it('uses the hover delay setting', () => {
    const { a } = setup({ analyzeAnimation: 'off', analyzeHoverDelay: 500 });
    ptr('pointerover', a);
    vi.advanceTimersByTime(499);
    expect(panel()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(panel()).not.toBeNull();
  });

  it('leaving before the delay opens nothing', () => {
    const { a } = setup({ analyzeAnimation: 'off' });
    ptr('pointerover', a);
    vi.advanceTimersByTime(100);
    ptr('pointerout', a, { relatedTarget: document.body });
    vi.advanceTimersByTime(1000);
    expect(panel()).toBeNull();
  });

  it('moving away closes it, Shift keeps it pinned', () => {
    const { a, b } = setup({ analyzeAnimation: 'off' });
    ptr('pointerover', a);
    vi.advanceTimersByTime(250);
    expect(panel()).not.toBeNull();
    ptr('pointerout', a, { relatedTarget: document.body });
    vi.advanceTimersByTime(99);
    expect(panel()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(panel()).toBeNull();
    // Shift held while leaving: pinned
    ptr('pointerover', b);
    vi.advanceTimersByTime(250);
    ptr('pointerout', b, { relatedTarget: document.body, shiftKey: true });
    vi.advanceTimersByTime(1000);
    expect(panel()).not.toBeNull();
    expect(analyzer!.isPinned()).toBe(true);
    expect(panelText()).toContain('[PINNED]');
  });

  it('moving into the panel keeps it open', () => {
    const { a } = setup({ analyzeAnimation: 'off' });
    ptr('pointerover', a);
    vi.advanceTimersByTime(250);
    ptr('pointerout', a, { relatedTarget: panel() });
    ptr('pointerover', panel()!.querySelector('.alius-analyze-text')!);
    vi.advanceTimersByTime(1000);
    expect(panel()).not.toBeNull();
    // leaving the panel for the page closes it
    ptr('pointerout', panel()!.querySelector('.alius-analyze-text')!, { relatedTarget: document.body });
    vi.advanceTimersByTime(100);
    expect(panel()).toBeNull();
  });

  it('hovering another target replaces the open panel', () => {
    const { a, b } = setup({ analyzeAnimation: 'off' });
    ptr('pointerover', a);
    vi.advanceTimersByTime(250);
    ptr('pointerout', a, { relatedTarget: b });
    ptr('pointerover', b);
    vi.advanceTimersByTime(250);
    expect(document.querySelectorAll('.alius-analyze')).toHaveLength(1);
    expect(panelText()).toContain('Strain.');
  });

  it('the [PIN] button pins, and [PINNED] closes', () => {
    const { a } = setup({ analyzeAnimation: 'off' });
    ptr('pointerover', a);
    vi.advanceTimersByTime(250);
    panel()!.querySelector<HTMLButtonElement>('.alius-analyze-pin')!.click();
    expect(analyzer!.isPinned()).toBe(true);
    ptr('pointerout', a, { relatedTarget: document.body });
    vi.advanceTimersByTime(1000);
    expect(panel()).not.toBeNull();
    panel()!.querySelector<HTMLButtonElement>('.alius-analyze-pin')!.click();
    expect(panel()).toBeNull();
  });

  it('a click outside a pinned panel closes it, a click inside does not', () => {
    const { a } = setup({ analyzeAnimation: 'off' });
    analyzer!.openFor(a, { x: 10, y: 10 }, { pinned: true });
    ptr('pointerdown', panel()!.querySelector('.alius-analyze-text')!);
    expect(panel()).not.toBeNull();
    ptr('pointerdown', document.body);
    expect(panel()).toBeNull();
  });
});

describe('animation', () => {
  it('first analysis shows ANALYZING for 600 ms, the second for 150', () => {
    const { a } = setup({ analyzeAnimation: 'full' });
    analyzer!.openFor(a, { x: 0, y: 0 });
    expect(panelText()).toContain('ANALYZING ▒▒▒░░');
    expect(panel()!.querySelector('.alius-analyze-wipe')).not.toBeNull();
    vi.advanceTimersByTime(599);
    expect(panelText()).toContain('ANALYZING');
    vi.advanceTimersByTime(1);
    expect(panelText()).not.toContain('ANALYZING');
    expect(panelText()).toContain('Belief in you.');
    analyzer!.close();
    analyzer!.openFor(a, { x: 0, y: 0 });
    expect(panelText()).toContain('ANALYZING');
    vi.advanceTimersByTime(149);
    expect(panelText()).toContain('ANALYZING');
    vi.advanceTimersByTime(1);
    expect(panelText()).toContain('Belief in you.');
  });

  it('short is 150 both times, off and reduced motion show text at once', () => {
    const { a } = setup({ analyzeAnimation: 'short' });
    for (let i = 0; i < 2; i++) {
      analyzer!.openFor(a, { x: 0, y: 0 });
      expect(panelText()).toContain('ANALYZING');
      expect(panel()!.querySelector('.alius-analyze-wipe')).toBeNull();
      vi.advanceTimersByTime(150);
      expect(panelText()).toContain('Belief in you.');
      analyzer!.close();
    }
    analyzer!.destroy();
    root.replaceChildren();
    const off = setup({ analyzeAnimation: 'off' });
    analyzer!.openFor(off.a, { x: 0, y: 0 });
    expect(panelText()).toContain('Belief in you.');
    analyzer!.destroy();
    root.replaceChildren();
    const reduced = setup({ analyzeAnimation: 'full' }, { reducedMotion: () => true });
    analyzer!.openFor(reduced.a, { x: 0, y: 0 });
    expect(panelText()).toContain('Belief in you.');
  });
});

describe('settings', () => {
  it('disabled ignores hover, keys and long-press', () => {
    const { a } = setup({ analyzeEnabled: false, analyzeAnimation: 'off' });
    ptr('pointerover', a);
    vi.advanceTimersByTime(1000);
    expect(panel()).toBeNull();
    a.focus();
    key(a, '?');
    key(a, 'F1');
    expect(panel()).toBeNull();
    ptr('pointerdown', a, { pointerType: 'touch', clientX: 5, clientY: 5 });
    vi.advanceTimersByTime(1000);
    ptr('pointerup', a, { pointerType: 'touch' });
    expect(panel()).toBeNull();
  });

  it('turning the tool off closes an open panel at the next event', () => {
    const { a } = setup({ analyzeAnimation: 'off' });
    analyzer!.openFor(a, { x: 0, y: 0 }, { pinned: true });
    settings = { ...settings, analyzeEnabled: false };
    key(document.body, 'x');
    expect(panel()).toBeNull();
  });
});

describe('keyboard', () => {
  it('? on a focused chip opens it, F1 too', () => {
    const { a, b } = setup({ analyzeAnimation: 'off' });
    a.focus();
    const e = key(a, '?');
    expect(e.defaultPrevented).toBe(true);
    expect(panelText()).toContain('Belief in you.');
    analyzer!.close();
    b.focus();
    const f1 = key(b, 'F1');
    expect(f1.defaultPrevented).toBe(true);
    expect(panelText()).toContain('Strain.');
  });

  it('? with nothing marked focused does nothing and is not swallowed', () => {
    setup({ analyzeAnimation: 'off' });
    const plain = h('button', { type: 'button' }, 'plain');
    root.append(plain);
    plain.focus();
    const e = key(plain, '?');
    expect(e.defaultPrevented).toBe(false);
    expect(panel()).toBeNull();
  });

  it('? in an input types', () => {
    const { input } = setup({ analyzeAnimation: 'off' });
    input.focus();
    const e = key(input, '?');
    expect(e.defaultPrevented).toBe(false);
    expect(panel()).toBeNull();
    // F1 is not text, it still works there
    key(input, 'F1');
    expect(panelText()).toContain('Command points.');
  });

  it('Backspace in a text field does nothing to the panel', () => {
    const { a, input } = setup({ analyzeAnimation: 'off' });
    analyzer!.openFor(a, { x: 0, y: 0 }, { pinned: true });
    input.focus();
    const e = key(input, 'Backspace');
    expect(e.defaultPrevented).toBe(false);
    expect(panel()).not.toBeNull();
  });

  it('Esc closes the panel and stops propagation', () => {
    const { a } = setup({ analyzeAnimation: 'off' });
    const docSpy = vi.fn();
    const cancel = vi.fn();
    document.addEventListener('keydown', docSpy);
    const off = attachCombatKeys({
      skill: vi.fn(), cycleTarget: vi.fn(), confirm: vi.fn(), guard: vi.fn(), swap: vi.fn(), pass: vi.fn(), order: vi.fn(), auto: vi.fn(), cancel,
    });
    analyzer!.openFor(a, { x: 0, y: 0 }, { pinned: true });
    const e = key(a, 'Escape');
    expect(panel()).toBeNull();
    expect(e.defaultPrevented).toBe(true);
    expect(docSpy).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    // with no panel open Esc belongs to everyone else
    key(a, 'Escape');
    expect(cancel).toHaveBeenCalledTimes(1);
    off();
    document.removeEventListener('keydown', docSpy);
  });
});

describe('drill-down', () => {
  const link = (text: string) => [...panel()!.querySelectorAll<HTMLButtonElement>('button.alius-analyze-link')].find((b) => b.textContent === text)!;

  it('a link drills down, auto-pins and adds a crumb', () => {
    const { a } = setup({ analyzeAnimation: 'off' });
    ptr('pointerover', a);
    vi.advanceTimersByTime(250);
    link('stress').click();
    expect(analyzer!.isPinned()).toBe(true);
    expect(panelText()).toContain('Strain.');
    expect(panel()!.querySelector('.alius-analyze-crumbs')!.textContent).toBe('Trust › Stress');
  });

  it('the fourth level is not offered', () => {
    const { a } = setup({ analyzeAnimation: 'off' });
    analyzer!.openFor(a, { x: 0, y: 0 });
    link('stress').click();
    link('cp').click();
    expect(panel()!.querySelector('.alius-analyze-crumbs')!.textContent).toBe('Trust › Stress › CP');
    expect(panel()!.querySelector('button.alius-analyze-link')).toBeNull();
    expect(panelText()).toContain('See trust.');
  });

  it('crumbs truncate the trail', () => {
    const { a } = setup({ analyzeAnimation: 'off' });
    analyzer!.openFor(a, { x: 0, y: 0 });
    link('stress').click();
    link('cp').click();
    panel()!.querySelector<HTMLButtonElement>('.alius-analyze-crumb')!.click();
    expect(panelText()).toContain('Belief in you.');
    expect(panel()!.querySelector('.alius-analyze-crumbs')).toBeNull();
  });

  it('Backspace and [<] go back, past the root closes', () => {
    const { a } = setup({ analyzeAnimation: 'off' });
    analyzer!.openFor(a, { x: 0, y: 0 });
    link('stress').click();
    link('cp').click();
    key(document.body, 'Backspace');
    expect(panelText()).toContain('Strain.');
    panel()!.querySelector<HTMLButtonElement>('.alius-analyze-back')!.click();
    expect(panelText()).toContain('Belief in you.');
    expect(panel()).not.toBeNull();
    key(document.body, 'Backspace');
    expect(panel()).toBeNull();
    expect(analyzer!.isOpen()).toBe(false);
  });

  it('drilling plays the animation by the same rule', () => {
    const { a } = setup({ analyzeAnimation: 'full' });
    analyzer!.openFor(a, { x: 0, y: 0 });
    vi.advanceTimersByTime(600);
    link('stress').click();
    expect(panelText()).toContain('ANALYZING');
    vi.advanceTimersByTime(600);
    expect(panelText()).toContain('Strain.');
    // going back to a subject seen before is quick
    panel()!.querySelector<HTMLButtonElement>('.alius-analyze-back')!.click();
    expect(panelText()).toContain('ANALYZING');
    vi.advanceTimersByTime(150);
    expect(panelText()).toContain('Belief in you.');
  });
});

describe('touch', () => {
  it('a long-press opens pinned and does not click', () => {
    const { button } = setup({ analyzeAnimation: 'off' });
    const onclick = vi.fn();
    button.addEventListener('click', onclick);
    ptr('pointerdown', button, { pointerType: 'touch', clientX: 50, clientY: 50 });
    vi.advanceTimersByTime(399);
    expect(panel()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(panel()).not.toBeNull();
    expect(analyzer!.isPinned()).toBe(true);
    ptr('pointerup', button, { pointerType: 'touch', clientX: 50, clientY: 50 });
    button.click();
    expect(onclick).not.toHaveBeenCalled();
    // only the one click is swallowed
    button.click();
    expect(onclick).toHaveBeenCalledTimes(1);
  });

  it('a tap clicks and opens nothing', () => {
    const { button } = setup({ analyzeAnimation: 'off' });
    const onclick = vi.fn();
    button.addEventListener('click', onclick);
    ptr('pointerdown', button, { pointerType: 'touch', clientX: 50, clientY: 50 });
    vi.advanceTimersByTime(100);
    ptr('pointerup', button, { pointerType: 'touch', clientX: 50, clientY: 50 });
    button.click();
    vi.advanceTimersByTime(2000);
    expect(onclick).toHaveBeenCalledTimes(1);
    expect(panel()).toBeNull();
  });

  it('moving 11 px cancels the long-press, 10 px does not', () => {
    const { button } = setup({ analyzeAnimation: 'off' });
    ptr('pointerdown', button, { pointerType: 'touch', clientX: 50, clientY: 50 });
    vi.advanceTimersByTime(200);
    ptr('pointermove', button, { pointerType: 'touch', clientX: 61, clientY: 50 });
    vi.advanceTimersByTime(1000);
    expect(panel()).toBeNull();
    ptr('pointerup', button, { pointerType: 'touch' });
    ptr('pointerdown', button, { pointerType: 'touch', clientX: 50, clientY: 50 });
    ptr('pointermove', button, { pointerType: 'touch', clientX: 60, clientY: 50 });
    vi.advanceTimersByTime(400);
    expect(panel()).not.toBeNull();
  });

  it('pointercancel cancels the long-press, and touch does not hover', () => {
    const { button, a } = setup({ analyzeAnimation: 'off' });
    ptr('pointerdown', button, { pointerType: 'touch', clientX: 50, clientY: 50 });
    ptr('pointercancel', button, { pointerType: 'touch' });
    vi.advanceTimersByTime(1000);
    expect(panel()).toBeNull();
    ptr('pointerover', a, { pointerType: 'touch' });
    vi.advanceTimersByTime(1000);
    expect(panel()).toBeNull();
  });
});

describe('lifecycle', () => {
  it('a bad address shows NO DATA and does not throw', () => {
    const { a } = setup({ analyzeAnimation: 'off' });
    for (const bad of ['items:', 'nocolon', 'items:gone']) {
      a.setAttribute('data-analyze', bad);
      expect(() => analyzer!.openFor(a, { x: 0, y: 0 })).not.toThrow();
      expect(panelText()).toContain(`NO DATA // ${bad}`);
    }
    a.setAttribute('data-analyze-ctx', '{broken');
    a.setAttribute('data-analyze', 'glossary:trust');
    expect(() => analyzer!.openFor(a, { x: 0, y: 0 })).not.toThrow();
    expect(panelText()).toContain('Belief in you.');
  });

  it('refresh closes a transient panel and rebuilds a pinned one', () => {
    const { a } = setup({ analyzeAnimation: 'off' });
    analyzer!.openFor(a, { x: 0, y: 0 });
    analyzer!.refresh();
    expect(panel()).toBeNull();
    analyzer!.openFor(a, { x: 0, y: 0 }, { pinned: true });
    GLOSSARY[0] = { ...GLOSSARY[0], short: 'Changed text.' };
    analyzer!.refresh();
    expect(panel()).not.toBeNull();
    expect(panelText()).toContain('Changed text.');
    GLOSSARY[0] = { id: 'trust', term: 'Trust', short: 'Belief in you. See [[stress]].' };
  });

  it('destroy cancels pending timers', () => {
    const { a, button } = setup({ analyzeAnimation: 'full' });
    ptr('pointerover', a);
    ptr('pointerdown', button, { pointerType: 'touch', clientX: 1, clientY: 1 });
    analyzer!.destroy();
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    expect(panel()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('destroy while analyzing removes the panel and its timer', () => {
    const { a } = setup({ analyzeAnimation: 'full' });
    analyzer!.openFor(a, { x: 0, y: 0 });
    analyzer!.destroy();
    expect(panel()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a destroyed analyzer no longer listens', () => {
    const { a } = setup({ analyzeAnimation: 'off' });
    analyzer!.destroy();
    ptr('pointerover', a);
    vi.advanceTimersByTime(1000);
    a.focus();
    key(a, '?');
    expect(panel()).toBeNull();
  });
});


describe('analysis panel in context (P7a)', () => {
  let core: Registries;
  beforeAll(async () => {
    core = await loadCore();
    registerCoreProviders();
  });

  const openCombat = (): CampaignState => {
    const base = campaign(core, 4);
    const r = run(base, core, {
      type: 'combat/start',
      payload: {
        encounter: { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1 },
        formation: { front: ['unit_ann', 'unit_bea', 'unit_cat'], back: ['unit_dee'] },
      },
    });
    r.state.combat!.awaitingCid = 's1';
    r.state.combat!.cp = 3;
    return r.state;
  };
  const stAdapter = () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    Object.assign(st.settings, { analyzeAnimation: 'off' });
    return st;
  };
  const hover = (el: Element) => el.dispatchEvent(Object.assign(new Event('pointerover', { bubbles: true }), { pointerType: 'mouse', clientX: 40, clientY: 40 }));

  it('a panel opened inside a modal sits above it and Esc closes the panel, not the modal', async () => {
    const state = openCombat();
    const shell = createShell({ st: stAdapter(), getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), analyze: { registries: () => core } });
    try {
      shell.open();
      const body = h('p', {}, h('span', { class: 'alius-chip', ...analyzeAttrs('glossary:leash_compel') }, 'COMPEL'));
      let answer: string | null | undefined;
      void shell.modal({ title: 'OVERSIGHT REQUEST #1', body, actions: [{ label: 'FILE', value: 'file' }] }).then((v) => { answer = v; });
      const chipEl = document.querySelector('.alius-modal [data-analyze]')!;
      hover(chipEl);
      vi.advanceTimersByTime(250);
      const panelEl = document.querySelector('#alius-shell .alius-analyze')!;
      expect(panelEl).not.toBeNull();
      expect(panelEl.textContent).toContain('Compel');
      // pin it so the pointer need not stay on the chip, then Esc: only the panel goes
      document.querySelector<HTMLButtonElement>('.alius-analyze-pin')!.click();
      key(chipEl, 'Escape');
      expect(document.querySelector('.alius-analyze')).toBeNull();
      expect(document.querySelector('.alius-modal')).not.toBeNull();
      expect(answer).toBeUndefined();
      // the second Esc belongs to the modal
      key(chipEl, 'Escape');
      await Promise.resolve();
      expect(document.querySelector('.alius-modal')).toBeNull();
      expect(answer).toBeNull();
    } finally {
      shell.destroy();
    }
  });

  it('the panel stacks above the modal layer in the stylesheet', () => {
    const z = (css: string) => [...css.matchAll(/z-index:\s*(\d+)/g)].map((m) => Number(m[1]));
    const analyze = Math.max(...z(readFileSync('css/95-analyze.css', 'utf8')));
    const others = readdirSync('css').filter((f) => f.endsWith('.css') && f !== '95-analyze.css')
      .flatMap((f) => z(readFileSync(`css/${f}`, 'utf8').replace(/#alius-shell\s*\{[^}]*z-index:\s*100000[^}]*\}/, '')));
    expect(others.length).toBeGreaterThan(0);
    expect(analyze).toBeGreaterThan(Math.max(...others));
  });

  it('the combat screen keeps keyboard control after Esc closed a panel', () => {
    const state = openCombat();
    const onAct = vi.fn();
    const onClose = vi.fn();
    const host = h('div');
    root.append(host);
    const screen = renderCombatScreen(host, {
      getState: () => state, registries: core, st: stAdapter(), settings: () => DEFAULT_SETTINGS, onAct, onOrder: vi.fn(), onAuto: vi.fn(),
      onRetry: vi.fn(), onAccept: vi.fn(), onRetreat: vi.fn(), onClose,
    });
    settings = { ...DEFAULT_SETTINGS, analyzeAnimation: 'off' };
    analyzer = attachAnalyzer(root, { getEnv: () => ({ registries: core, state, settings }) });
    try {
      const cp = host.querySelector<HTMLElement>('[data-analyze="glossary:cp"]')!;
      analyzer.openFor(cp, { x: 5, y: 5 }, { pinned: true });
      key(cp, 'Escape');
      expect(document.querySelector('.alius-analyze')).toBeNull();
      expect(onAct).not.toHaveBeenCalled();
      // the next key still reaches the combat screen: g guards
      key(document.body, 'g');
      expect(onAct).toHaveBeenCalledWith({ kind: 'guard' });
    } finally {
      screen.dispose();
    }
  });

  it('a pinned panel survives a combat re-render and rebuilds its reading', () => {
    const state = openCombat();
    state.squad[0].stress = 0;
    state.combat!.combatants.find((c) => c.cid === 's1')!.stress = 0;
    const st = stAdapter();
    const shell = createShell({ st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), analyze: { registries: () => core } });
    let screen: ReturnType<typeof renderCombatScreen> | null = null;
    try {
      shell.registerScreen(
        'combat',
        (host) => {
          screen = renderCombatScreen(host, {
            getState: () => state, registries: core, st, settings: () => DEFAULT_SETTINGS, onAct: vi.fn(), onOrder: vi.fn(), onAuto: vi.fn(),
            onRetry: vi.fn(), onAccept: vi.fn(), onRetreat: vi.fn(), onClose: vi.fn(),
          });
        },
        { refresh: () => { screen!.refresh(); return true; } },
      );
      shell.open();
      shell.showScreen('combat');
      const stress = document.querySelector<HTMLElement>('.alius-cc[data-cid="s1"] [data-analyze="glossary:stress"]')!;
      hover(stress);
      vi.advanceTimersByTime(250);
      document.querySelector<HTMLButtonElement>('.alius-analyze-pin')!.click();
      expect(document.querySelector('.alius-analyze')!.textContent).toContain('Ann: CALM');
      // the fight goes on: more stress, the screen is redrawn (its old chips are gone)
      state.combat!.combatants.find((c) => c.cid === 's1')!.stress = 63; // live stress is on the fighter during a combat
      shell.refresh();
      expect(document.body.contains(stress)).toBe(false);
      const panelEl = document.querySelector('.alius-analyze')!;
      expect(panelEl).not.toBeNull();
      expect(panelEl.textContent).toContain('Ann: STRAINED');
    } finally {
      shell.destroy();
    }
  });

  it('palette changes recolour the panel: it lives inside the palette root and uses only palette variables', () => {
    root.remove(); // the shell brings its own #alius-shell
    const state = openCombat();
    const shell = createShell({ st: stAdapter(), getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), analyze: { registries: () => core } });
    try {
      shell.registerTab('squad', (host) => host.append(h('span', { class: 'alius-chip', ...analyzeAttrs('glossary:cp') }, 'CP')));
      shell.open();
      hover(document.querySelector('#alius-shell [data-analyze="glossary:cp"]')!);
      vi.advanceTimersByTime(250);
      const panelEl = document.querySelector('.alius-analyze')!;
      shell.setPalette('green');
      const shellRoot = document.getElementById('alius-shell')!;
      expect(shellRoot.dataset.palette).toBe('green');
      expect(shellRoot.contains(panelEl)).toBe(true);
      const css = readFileSync('css/95-analyze.css', 'utf8');
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css).not.toMatch(/\b(?:rgb|hsl)a?\(\s*\d/);
      expect(css).toContain('var(--alius-fg)');
      expect(css).toContain('var(--alius-bg)');
    } finally {
      shell.destroy();
    }
  });
});

describe('lifecycle holes found in review', () => {
  it('a hover timer does not open a panel for an element that was removed meanwhile', () => {
    const { a } = setup({ analyzeAnimation: 'off' });
    ptr('pointerover', a);
    vi.advanceTimersByTime(100);
    a.remove(); // the screen was redrawn
    vi.advanceTimersByTime(1000);
    expect(panel()).toBeNull();
  });

  it('refresh clears a pending hover even when no panel is open', () => {
    const { a } = setup({ analyzeAnimation: 'off' });
    ptr('pointerover', a);
    analyzer!.refresh();
    vi.advanceTimersByTime(1000);
    expect(panel()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a transient panel closes when the element it points at is gone (checked at the next pointer move)', () => {
    const { a, b } = setup({ analyzeAnimation: 'off' });
    ptr('pointerover', a);
    vi.advanceTimersByTime(250);
    expect(panel()).not.toBeNull();
    a.remove();
    ptr('pointerover', b);
    expect(panel()).toBeNull();
  });

  it('a long-press swallows the click for as long as the finger is down, plus a short grace', () => {
    const { button } = setup({ analyzeAnimation: 'off' });
    const onclick = vi.fn();
    button.addEventListener('click', onclick);
    ptr('pointerdown', button, { pointerType: 'touch', clientX: 50, clientY: 50 });
    vi.advanceTimersByTime(400);
    expect(panel()).not.toBeNull();
    vi.advanceTimersByTime(3000); // still holding to read
    ptr('pointerup', button, { pointerType: 'touch', clientX: 50, clientY: 50 });
    button.click(); // the click some browsers send on release
    expect(onclick).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('with no click after the release the swallow ends by itself and the next tap works', () => {
    const { button } = setup({ analyzeAnimation: 'off' });
    const onclick = vi.fn();
    button.addEventListener('click', onclick);
    ptr('pointerdown', button, { pointerType: 'touch', clientX: 50, clientY: 50 });
    vi.advanceTimersByTime(400);
    ptr('pointerup', button, { pointerType: 'touch' });
    vi.advanceTimersByTime(500);
    button.click();
    expect(onclick).toHaveBeenCalledTimes(1);
  });
});

describe('review minors: keys and focus', () => {
  const input = (type: string) => h('input', { type }) as HTMLInputElement;

  it('? works on checkboxes, radios, ranges and selects, and types in text-like fields', () => {
    setup({ analyzeAnimation: 'off' });
    for (const type of ['checkbox', 'radio', 'range', 'button']) {
      const el = input(type);
      const holder = h('label', { ...analyzeAttrs('glossary:trust') }, el);
      root.append(holder);
      el.focus();
      const e = key(el, '?');
      expect(e.defaultPrevented, type).toBe(true);
      expect(panel(), type).not.toBeNull();
      analyzer!.close();
    }
    const select = h('select', {}, h('option', { value: 'a' }, 'a')) as HTMLSelectElement;
    root.append(h('label', { ...analyzeAttrs('glossary:cp') }, select));
    select.focus();
    expect(key(select, '?').defaultPrevented).toBe(true);
    analyzer!.close();
    for (const type of ['text', 'number', 'search', 'email', 'password', 'url', 'tel', '']) {
      const el = input(type);
      root.append(h('label', { ...analyzeAttrs('glossary:trust') }, el));
      el.focus();
      expect(key(el, '?').defaultPrevented, `type "${type}"`).toBe(false);
    }
    const area = h('textarea', {}) as HTMLTextAreaElement;
    root.append(h('label', { ...analyzeAttrs('glossary:trust') }, area));
    area.focus();
    expect(key(area, '?').defaultPrevented).toBe(false);
    expect(panel()).toBeNull();
  });

  it('Backspace goes back while a checkbox has the focus', () => {
    const { a } = setup({ analyzeAnimation: 'off' });
    analyzer!.openFor(a, { x: 0, y: 0 }, { pinned: true });
    const box = input('checkbox');
    root.append(box);
    box.focus();
    key(box, 'Backspace');
    expect(panel()).toBeNull();
  });

  it('a panel opened from the keyboard takes the focus, and Esc gives it back', () => {
    const { a } = setup({ analyzeAnimation: 'off' });
    a.focus();
    key(a, '?');
    expect(document.activeElement).toBe(panel());
    key(document.activeElement!, 'Escape');
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(a);
  });

  it('the focus stays in the panel while drilling down and going back', () => {
    const { a } = setup({ analyzeAnimation: 'off' });
    a.focus();
    key(a, '?');
    panel()!.querySelector<HTMLButtonElement>('button.alius-analyze-link')!.click();
    expect(document.activeElement).toBe(panel());
    key(document.activeElement!, 'Backspace');
    expect(document.activeElement).toBe(panel());
  });

  it('a hover or a long-press does not steal the focus', () => {
    const { a, b } = setup({ analyzeAnimation: 'off' });
    b.focus();
    ptr('pointerover', a);
    vi.advanceTimersByTime(250);
    expect(panel()).not.toBeNull();
    expect(document.activeElement).toBe(b);
  });

  it('the panel scrolls on a small screen and chips cannot be text-selected by a long-press', () => {
    const css = readFileSync('css/95-analyze.css', 'utf8');
    expect(css).toMatch(/\.alius-analyze\s*\{[^}]*max-height:/);
    expect(css).toMatch(/\.alius-analyze\s*\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/span\[data-analyze\][^{]*\{[^}]*user-select:\s*none/);
  });
});
