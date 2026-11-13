// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { animationMs, attachAnalyzer, type Analyzer } from '../../src/ui/analyze/analyzer';
import { attachCombatKeys } from '../../src/ui/combat/keys';
import { analyzeAttrs } from '../../src/ui/analyze/mark';
import { h } from '../../src/ui/dom';
import { emptyRegistries, type Entry } from '../../src/content/types';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../src/settings';
import type { AnalyzeEnv } from '../../src/analysis/model';

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
