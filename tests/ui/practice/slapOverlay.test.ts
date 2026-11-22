// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import type { PracticeState, SlapResult } from '../../../src/engine/practice/state';
import { TUNING } from '../../../src/engine/tuning';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../../src/settings';
import { h } from '../../../src/ui/dom';
import { clearSlapOverlay, renderSlapOverlay, type SlapOverlayCtx } from '../../../src/ui/practice/slapOverlay';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';
import { errors, loadCore, run } from '../../helpers/world';
import { blankPractices } from '../../../src/engine/practice/state';
import type { SceneController } from '../../../src/scene/sceneController';
import { FakeStAdapter } from '../../../src/st/fake';
import { renderSceneScreen } from '../../../src/ui/scene/sceneScreen';
import { ANN, unitOf, world } from '../../engine/practice/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => { document.body.innerHTML = ''; });

type Slap = NonNullable<PracticeState['slap']>;
const slapOf = (over: Partial<Slap> = {}): Slap => ({ id: 'ps1', holderId: ANN, sceneId: 's1', windowMs: 500, feints: 0, ...over });
const L = TUNING.practice.slap.leadMs;
const F = TUNING.practice.slap.feintMs;

/** A slap overlay with a clock and a timer list the test drives by hand. */
function overlay(over: { slap?: Slap; settings?: Partial<AliusSettings> } = {}) {
  const host = h('div');
  document.body.append(host);
  const clock = { t: 10_000 };
  const scheduled: Array<{ fn: () => void; ms: number; id: number; live: boolean }> = [];
  const results: SlapResult[] = [];
  const sound = { play: vi.fn() };
  const slap = over.slap ?? slapOf();
  const settings = { ...DEFAULT_SETTINGS, ...over.settings } as AliusSettings;
  const ctx: SlapOverlayCtx = {
    state: world(reg, 'role'), reg, slap, settings, now: () => clock.t, sound,
    schedule: (fn, ms) => { const e = { fn, ms, id: scheduled.length, live: true }; scheduled.push(e); return e.id; },
    cancel: (handle) => { const e = scheduled.find((x) => x.id === handle); if (e) e.live = false; },
    onResult: (r) => { results.push(r); },
  };
  renderSlapOverlay(host, ctx);
  /** Runs the last timer there is: the end of the time allowed. */
  const end = (): void => { const live = scheduled.filter((e) => e.live); const last = live.sort((a, b) => a.ms - b.ms).at(-1); if (last) { last.live = false; last.fn(); } };
  const press = (key = ' ', target: HTMLElement | Document = document): void => { target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true })); };
  return { host, clock, scheduled, results, sound, ctx, end, press, at: (ms: number) => { clock.t = 10_000 + ms; } };
}

describe('the window and the one key', () => {
  it('Space inside the window after the feints is a brace', () => {
    const o = overlay({ slap: slapOf({ feints: 2, windowMs: 500 }) });
    o.at(L + 2 * F + 120);
    o.press();
    o.end();
    expect(o.results).toEqual(['braced']);
  });

  it('a press before the window, or during a feint, is a flinch at once', () => {
    const early = overlay();
    early.at(L - 50);
    early.press();
    expect(early.results).toEqual(['flinched']);
    const feint = overlay({ slap: slapOf({ feints: 1 }) });
    feint.at(L + 10);
    feint.press();
    expect(feint.results).toEqual(['flinched']);
    feint.end(); // the timer of the end finds it decided already
    expect(feint.results).toEqual(['flinched']);
  });

  it('nothing at all is none, at the end of the window', () => {
    const o = overlay({ slap: slapOf({ windowMs: 300, feints: 1 }) });
    expect(o.results).toEqual([]);
    o.end();
    expect(o.results).toEqual(['none']);
    const end = o.scheduled.find((e) => e.ms === L + F + 300);
    expect(end).toBeDefined(); // lead, one feint, then the time allowed
  });

  it('a second press is a flinch, even inside the window', () => {
    const o = overlay();
    o.at(L + 100);
    o.press();
    expect(o.results).toEqual([]);
    o.at(L + 200);
    o.press();
    expect(o.results).toEqual(['flinched']);
    o.end();
    expect(o.results).toEqual(['flinched']); // once
  });

  it('a press after the window is nothing; a held key (repeat) is one press; a text field keeps its spaces', () => {
    const late = overlay();
    late.at(L + 500 + 50);
    late.press();
    late.end();
    expect(late.results).toEqual(['none']);
    const held = overlay();
    held.at(L + 100);
    held.host.ownerDocument.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: false }));
    held.host.ownerDocument.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true }));
    held.end();
    expect(held.results).toEqual(['braced']);
    const typing = overlay();
    const input = h('input', { type: 'text' }) as HTMLInputElement;
    document.body.append(input);
    typing.at(L + 100);
    typing.press(' ', input);
    typing.end();
    expect(typing.results).toEqual(['none']);
  });

  it('the BRACE button is the same press', () => {
    const o = overlay();
    o.at(L + 100);
    o.host.querySelector<HTMLButtonElement>('[data-action="brace"]')!.click();
    o.end();
    expect(o.results).toEqual(['braced']);
  });
});

describe('timing off, reduced motion', () => {
  it('with the timing interaction off the answer is none at once and no key is listened to', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const o = overlay({ settings: { physicsInteractions: { ...DEFAULT_SETTINGS.physicsInteractions, timing: false } } });
    expect(o.results).toEqual(['none']);
    expect(add.mock.calls.filter((c) => c[0] === 'keydown')).toEqual([]);
    expect(o.scheduled).toEqual([]);
    expect(o.sound.play).not.toHaveBeenCalled();
    add.mockRestore();
  });

  it('with reduced motion the answer is none at once and nothing is drawn that moves', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const o = overlay({ settings: { reducedMotion: true } });
    expect(o.results).toEqual(['none']);
    expect(add.mock.calls.filter((c) => c[0] === 'keydown')).toEqual([]);
    expect(o.host.querySelector('.alius-slap-bar')).toBeNull();
    add.mockRestore();
  });

  it('the answer goes once, however often the scene redraws', () => {
    const o = overlay({ settings: { reducedMotion: true } });
    renderSlapOverlay(o.host, o.ctx);
    renderSlapOverlay(o.host, o.ctx);
    expect(o.results).toEqual(['none']);
  });
});

describe('the telegraph', () => {
  it('the cut-in and the sound play once, whatever the redraws; the clock does not start again', () => {
    const o = overlay({ slap: slapOf({ feints: 1 }) });
    expect(o.host.querySelectorAll('.alius-cutin')).toHaveLength(1);
    expect(o.sound.play).toHaveBeenCalledTimes(1);
    expect(o.sound.play).toHaveBeenCalledWith('alert');
    const timers = o.scheduled.length;
    renderSlapOverlay(o.host, o.ctx);
    renderSlapOverlay(o.host, o.ctx);
    expect(o.host.querySelectorAll('.alius-cutin')).toHaveLength(1);
    expect(o.sound.play).toHaveBeenCalledTimes(1);
    expect(o.scheduled).toHaveLength(timers);
  });

  it('shows her raised hand, then what she does, in words with no number and no pronoun for the commander; the card carries data-analyze and resolves', () => {
    const o = overlay({ slap: slapOf({ feints: 1 }) });
    const text = (): string => o.host.querySelector('.alius-slap')!.textContent ?? '';
    expect(o.host.querySelector('.alius-slap')!.getAttribute('data-phase')).toBe('raise');
    expect(text()).not.toMatch(/\d/);
    expect(text()).not.toMatch(/\b(he|him|his|himself)\b/i);
    const card = o.host.querySelector('.alius-slap')!;
    expect(card.getAttribute('data-analyze')).toBe('glossary:slap');
    const env = { state: world(reg, 'role'), registries: reg, settings: { ...DEFAULT_SETTINGS } } as unknown as AnalyzeEnv;
    expect(markedWithout(o.host)).toEqual([]);
    expect(unresolved(o.host, env)).toEqual([]);
    expect(unreachable(o.host)).toEqual([]);
  });

  it('every control carries data-analyze', () => {
    const o = overlay();
    for (const b of o.host.querySelectorAll('button')) expect(b.getAttribute('data-analyze'), b.textContent ?? '').toBe('glossary:slap');
  });
});

describe('going away', () => {
  it('the keys go with the host: a press after the host left the page is nothing, and the listeners are removed', () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    const o = overlay();
    o.host.remove();
    o.at(L + 100);
    o.press();
    expect(o.results).toEqual([]);
    expect(remove.mock.calls.some((c) => c[0] === 'keydown')).toBe(true);
    remove.mockRestore();
  });

  it('clearing it cancels the timers and ends the keys; a result never comes after', () => {
    const o = overlay();
    clearSlapOverlay(o.host);
    expect(o.scheduled.every((e) => !e.live)).toBe(true);
    o.at(L + 100);
    o.press();
    expect(o.results).toEqual([]);
    expect(o.host.children).toHaveLength(0);
  });
});

describe('the scene screen', () => {
  function screen(over: Record<string, unknown> = {}, withSlap = true) {
    const w = world(reg, 'role');
    w.content = { enabled: [...(w.content?.enabled ?? []), 'physical_discipline_shown'] };
    unitOf(w, ANN).bond!.practice!.style = { primary: 'cold' };
    const started = run(w, reg, { type: 'scene/start', payload: { locationId: 'quarters_unit', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(started.events)).toEqual([]);
    const s = started.state;
    if (withSlap) s.practices = { ...blankPractices(), seq: 3, slap: { id: 'ps1', holderId: ANN, sceneId: s.scene!.id, windowMs: 500, feints: 0 } };
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const controller = { send: vi.fn(), propose: vi.fn(), answer: vi.fn(), end: vi.fn(async () => {}), edit: vi.fn(async () => {}), stop: vi.fn(), onEdited: vi.fn(), transcript: () => [], onSwipe: vi.fn(), resume: vi.fn(), idle: vi.fn(), dispose: vi.fn(), start: vi.fn() } as unknown as SceneController;
    const host = h('div');
    document.body.append(host);
    const onSlap = vi.fn();
    const sound = { play: vi.fn() };
    const screen = renderSceneScreen(host, { controller, getState: () => s, registries: reg, st, settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0, ...over }), onEnded: vi.fn(), onSlap, sound } as never);
    return { host, onSlap, sound, screen, s };
  }

  it('draws her raised hand over the scene, in a host that takes no room, and plays the sound once', () => {
    const { host, sound } = screen();
    expect(host.querySelectorAll('.alius-slap')).toHaveLength(1);
    expect(host.querySelector('.alius-slap-host')!.querySelector('.alius-slap')).not.toBeNull();
    expect(sound.play).toHaveBeenCalledWith('alert');
  });

  it('with reduced motion the answer is none, sent after the draw', async () => {
    const { onSlap } = screen({ reducedMotion: true });
    expect(onSlap).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(onSlap).toHaveBeenCalledWith('ps1', 'none');
  });

  it('nothing without a slap; leaving the scene ends the keys', () => {
    const none = screen({}, false);
    expect(none.host.querySelector('.alius-slap')).toBeNull();
    const o = screen();
    const remove = vi.spyOn(document, 'removeEventListener');
    (o.screen as { dispose?: () => void }).dispose?.();
    expect(remove.mock.calls.some((c) => c[0] === 'keydown')).toBe(true);
    remove.mockRestore();
  });
});
