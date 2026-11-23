// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import type { CampaignState } from '../../../src/engine/state/types';
import type { SceneController } from '../../../src/scene/sceneController';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../../src/settings';
import type { ChatMessage } from '../../../src/st/adapter';
import { FakeStAdapter } from '../../../src/st/fake';
import { h } from '../../../src/ui/dom';
import { renderSceneScreen, type SceneScreen } from '../../../src/ui/scene/sceneScreen';
import { resetSceneStage } from '../../../src/ui/scene/stage';
import { DRAG_HOLD_MS } from '../../../src/ui/scene/stage/look';
import { PANORAMA_RATIO, panToCentre, panoramaWidth, spriteSlots } from '../../../src/ui/scene/stage/sprites';
import { campaign, errors, loadCore, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  resetSceneStage();
});

describe('where the women stand in room space (A2)', () => {
  it('one at the centre; two within the central view; three or four across the whole panorama, so some are past the view\'s edges', () => {
    expect(spriteSlots(0)).toEqual([]);
    expect(spriteSlots(1)).toEqual([{ cls: 'pos-center', x: 0 }]);
    expect(spriteSlots(2).map((s) => s.cls)).toEqual(['pos-left', 'pos-right']);
    expect(spriteSlots(3).map((s) => s.cls)).toEqual(['pos-left', 'pos-center', 'pos-right']);
    expect(spriteSlots(4).map((s) => s.cls)).toEqual(['pos-far-left', 'pos-left', 'pos-right', 'pos-far-right']);
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const xs = spriteSlots(n).map((s) => s.x);
      expect([...xs].sort((a, b) => a - b)).toEqual(xs); // left to right
      expect(xs.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 5); // symmetric about the centre
    }
    // at the default view of a 1920 x 1080 screen (pan 0.5) the view reaches 960 px = 88.9 cqh each way from the panorama's centre
    const view = (960 / 1080) * 100;
    for (const s of spriteSlots(2)) expect(Math.abs(s.x)).toBeLessThan(view - 30); // her whole figure is in view
    expect(Math.max(...spriteSlots(3).map((s) => Math.abs(s.x)))).toBeGreaterThan(view - 10); // an outer one is at the edge or beyond
    expect(Math.max(...spriteSlots(4).map((s) => Math.abs(s.x)))).toBeGreaterThan(view);
    // neighbours of four stand further apart than their drawn width (0.85 of a woman of two or three: about 53 cqh wide at the placeholder's aspect)
    const four = spriteSlots(4).map((s) => s.x);
    for (let i = 1; i < 4; i++) expect(four[i] - four[i - 1]).toBeGreaterThan(54);
  });

  it('the panorama is the backdrop\'s drawn width: 2.4 times its height, or the width when the screen is wider', () => {
    expect(PANORAMA_RATIO).toBeCloseTo(2.4, 9);
    expect(panoramaWidth(1920, 1080)).toBeCloseTo(2592, 6);
    expect(panoramaWidth(1280, 800)).toBeCloseTo(1920, 6);
    expect(panoramaWidth(3840, 1080)).toBe(3840);
  });

  it('the pan that centres a woman, clamped; nothing to turn when the panorama is no wider than the view', () => {
    expect(panToCentre(0, 1920, 1080)).toBeCloseTo(0.5, 9);
    expect(panToCentre(10, 1920, 1080)).toBeCloseTo((1296 + 108 - 960) / 672, 6);
    expect(panToCentre(-92, 1920, 1080)).toBe(0);
    expect(panToCentre(92, 1920, 1080)).toBe(1);
    expect(panToCentre(0, 3840, 1080)).toBeNull();
    expect(panToCentre(0, 0, 0)).toBeNull();
  });
});

const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
const msg = (index: number, over: Partial<ChatMessage> = {}): ChatMessage => ({ index, isUser: false, name: 'Ann', avatar: 'ann.png', text: 'hi', swipeId: 0, ...over });
const reply = (index: number, who: 'Ann' | 'Bea' | 'Cat' | 'Dee'): ChatMessage => msg(index, { name: who, avatar: `${who.toLowerCase()}.png`, text: `${who} speaks.` });

function setup(participants: string[], messages: ChatMessage[], settings: Partial<AliusSettings> = {}) {
  let state: CampaignState = campaign(reg, 4);
  const r = run(state, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants, origin: 'event', startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  state = r.state;
  const controller = { send: vi.fn(), propose: vi.fn(), answer: vi.fn(), end: vi.fn(), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(), transcript: () => messages, onSwipe: vi.fn() } as unknown as SceneController;
  const make = (): { host: HTMLElement; screen: SceneScreen } => {
    const host = h('div');
    document.body.append(host);
    const screen = renderSceneScreen(host, {
      controller, getState: () => state, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }),
      settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0, ...settings }), onEnded: vi.fn(),
    });
    const frame = host.querySelector<HTMLElement>('.alius-layer-frame')!;
    Object.defineProperty(frame, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 1920, height: 1080, right: 1920, bottom: 1080, x: 0, y: 0, toJSON() {} }) });
    return { host, screen };
  };
  const first = make();
  const q = <T extends HTMLElement = HTMLElement>(s: string) => first.host.querySelector<T>(s)!;
  const pan = (): number => Number(q('.alius-scene').style.getPropertyValue('--alius-pan'));
  const say = (m: ChatMessage): void => { messages.push(m); first.screen.handle({ type: 'transcript' }); };
  const drag = (): void => {
    const frame = q('.alius-layer-frame');
    const ev = (type: string, x: number, buttons: number) => frame.dispatchEvent(new MouseEvent(type, { clientX: x, button: 2, buttons, bubbles: true }));
    ev('pointerdown', 900, 2);
    ev('pointermove', 850, 2);
    ev('pointerup', 850, 0);
  };
  return { ...first, make, q, qa: (s: string) => [...first.host.querySelectorAll<HTMLElement>(s)], pan, say, drag };
}
const expected = (n: number, at: number): number => panToCentre(spriteSlots(n)[at].x, 1920, 1080)!;

describe('the sprites in the scene (A2)', () => {
  it('each sprite stands in the panorama at its slot; four are marked as a crowd and drawn smaller (CSS)', () => {
    const t = setup([ANN, BEA, CAT, DEE], [msg(0)]);
    expect(t.qa('.alius-layer-sprites > .alius-sprite-pano > .alius-sprite')).toHaveLength(4);
    expect(t.qa('.alius-sprite').map((e) => e.style.getPropertyValue('--alius-sprite-x'))).toEqual(spriteSlots(4).map((s) => `${s.x}cqh`));
    expect(t.qa('.alius-sprite').map((e) => ['pos-far-left', 'pos-left', 'pos-right', 'pos-far-right'].find((c) => e.classList.contains(c)))).toEqual(['pos-far-left', 'pos-left', 'pos-right', 'pos-far-right']);
    expect(t.q('.alius-layer-sprites').dataset.crowd).toBe('true');
    expect(setup([ANN, BEA, CAT], [msg(0)]).q('.alius-layer-sprites').dataset.crowd).toBeUndefined();
  });
});

describe('the view turns to the speaker (A2)', () => {
  it('a reply that lands centres her (eased by the CSS) and the scene remembers it; what was there at the start turns nothing', () => {
    const t = setup([ANN, BEA, CAT, DEE], [msg(0, { text: 'Already here.' })]);
    expect(t.pan()).toBe(0.5);
    t.say(reply(1, 'Bea'));
    expect(t.pan()).toBeCloseTo(expected(4, 1), 3);
    expect(t.q('.alius-scene').classList.contains('alius-look-still')).toBe(false); // eased: the CSS transition runs
    t.say(reply(2, 'Dee'));
    expect(t.pan()).toBe(1); // the far right one cannot be centred at this size: as far as the panorama goes
    // a screen built later for the same scene starts where the view was left (the memory holds the pan after the ease)
    document.body.innerHTML = '';
    const later = t.make();
    expect(Number(later.host.querySelector<HTMLElement>('.alius-scene')!.style.getPropertyValue('--alius-pan'))).toBe(1);
  });

  it('the commander\'s own message and a swipe of the same reply do not turn it', () => {
    const t = setup([ANN, BEA, CAT, DEE], [msg(0)]);
    t.say(reply(1, 'Cat'));
    const kept = t.pan();
    t.say(msg(2, { isUser: true, name: 'Vale', avatar: undefined, text: 'And you?' }));
    expect(t.pan()).toBe(kept);
    t.screen.refresh();
    expect(t.pan()).toBe(kept);
  });

  it('not within 8 seconds of the commander turning it by hand; afterwards it does', () => {
    const t = setup([ANN, BEA, CAT, DEE], [msg(0)]);
    t.drag();
    const dragged = t.pan();
    expect(dragged).not.toBe(0.5);
    t.say(reply(1, 'Dee'));
    expect(t.pan()).toBe(dragged);
    vi.advanceTimersByTime(DRAG_HOLD_MS + 1);
    t.say(reply(2, 'Bea'));
    expect(t.pan()).toBeCloseTo(expected(4, 1), 3);
  });

  it('reduced motion: the view jumps (the easing is off)', () => {
    const t = setup([ANN, BEA, CAT, DEE], [msg(0)], { reducedMotion: true });
    t.say(reply(1, 'Bea'));
    expect(t.pan()).toBeCloseTo(expected(4, 1), 3);
    expect(t.q('.alius-scene').classList.contains('alius-look-still')).toBe(true);
  });

  it('one woman: she is at the centre; a reply brings the view back to her', () => {
    const t = setup([ANN], [msg(0)]);
    t.drag();
    vi.advanceTimersByTime(DRAG_HOLD_MS + 1);
    t.say(reply(1, 'Ann'));
    expect(t.pan()).toBeCloseTo(0.5, 6);
  });
});

describe('the stylesheet puts the sprites in room space (A2)', () => {
  it('the panorama moves with --alius-pan as the backdrop does, in the same units and with the same easing', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('css/62-stage.css', 'utf8');
    expect(css).toMatch(/\.alius-sprite-pano \{[^}]*width: max\(100cqw, 240cqh\);[^}]*translateX\(calc\(var\(--alius-pan, 0\.5\) \* \(100cqw - max\(100cqw, 240cqh\)\)\)\);[^}]*transition: transform 0\.5s ease-out;/s);
    expect(css).toMatch(/\.alius-layer-backdrop \{[^}]*background-position: calc\(var\(--alius-pan, 0\.5\) \* 100%\) center;[^}]*transition: background-position 0\.5s ease-out/s);
    expect(css).toMatch(/\.alius-look-still \.alius-sprite-pano[^{]*\{\s*transition: none;/);
    expect(css).toMatch(/data-crowd="true"\] \.alius-sprite \{ height: 82vh; \}/); // about 0.85 of 97vh
    // several women are anchored to the bottom, past the edge: a smaller knee-length sprite never hangs in the air (author, 2026-11-23)
    expect(css).toMatch(/\.alius-sprite:not\(:only-child\) \{ top: auto; bottom: -5vh; height: 97vh;/);
  });
});
