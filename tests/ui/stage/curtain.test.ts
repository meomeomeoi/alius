// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import type { CampaignState } from '../../../src/engine/state/types';
import type { SceneController } from '../../../src/scene/sceneController';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../../src/settings';
import type { ChatMessage } from '../../../src/st/adapter';
import { FakeStAdapter } from '../../../src/st/fake';
import { h } from '../../../src/ui/dom';
import { renderSceneScreen } from '../../../src/ui/scene/sceneScreen';
import { resetSceneStage } from '../../../src/ui/scene/stage';
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
const ANN = 'unit_ann';
const msg = (index: number, over: Partial<ChatMessage> = {}): ChatMessage => ({ index, isUser: false, name: 'Ann', avatar: 'ann.png', text: 'hi', swipeId: 0, ...over });
const user = (index: number, text = 'Hello'): ChatMessage => msg(index, { isUser: true, name: 'Vale', avatar: undefined, text });

function setup(messages: ChatMessage[], settings: Partial<AliusSettings> = {}) {
  let state: CampaignState = campaign(reg, 4);
  const r = run(state, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  state = r.state;
  let pendingSend: ((sent: boolean) => void) | null = null;
  const controller = {
    send: vi.fn(() => new Promise<boolean>((res) => { pendingSend = res; })), propose: vi.fn(), answer: vi.fn(), end: vi.fn(async () => {}),
    edit: vi.fn(async () => {}), stop: vi.fn(), onEdited: vi.fn(), transcript: () => messages, onSwipe: vi.fn(), resume: vi.fn(), idle: vi.fn(), dispose: vi.fn(), start: vi.fn(),
  } as unknown as SceneController;
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  const swipe = vi.spyOn(st, 'swipeLast');
  const regen = vi.spyOn(st, 'regenerateLast');
  const host = h('div');
  document.body.append(host);
  const screen = renderSceneScreen(host, {
    controller, getState: () => state, registries: reg, st, settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0, ...settings }), onEnded: vi.fn(),
  });
  const q = <T extends HTMLElement = HTMLElement>(s: string) => host.querySelector<T>(s);
  return {
    host, screen, controller, swipe, regen, messages, q, qa: (s: string) => [...host.querySelectorAll<HTMLElement>(s)],
    isOpen: () => q('.alius-curtain')?.dataset.open === 'true',
    input: () => q<HTMLInputElement>('input[name="cmd"]')!,
    finishSend: () => pendingSend?.(true),
    /** The same scene under another id (a scene swapped under a live screen). */
    retarget: () => { state = { ...state, scene: { ...state.scene!, id: 'sc_other' } } as CampaignState; screen.refresh(); },
  };
}
const wheel = (el: Element, deltaY: number) => el.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));
const keydown = (el: Element | Document, key: string, init: KeyboardEventInit = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));

describe('the curtain: opening and closing (P10e)', () => {
  it('starts closed', () => {
    const t = setup([msg(0)]);
    expect(t.q('.alius-curtain')).not.toBeNull();
    expect(t.isOpen()).toBe(false);
    expect(t.q('.alius-layer-curtain .alius-curtain')).not.toBeNull();
  });

  it('the wheel up over the frame or over the reply opens it; the wheel down does not', () => {
    const t = setup([msg(0)]);
    wheel(t.q('.alius-layer-frame')!, 120);
    expect(t.isOpen()).toBe(false);
    wheel(t.q('.alius-layer-frame')!, -120);
    expect(t.isOpen()).toBe(true);
    keydown(document, 'Escape');
    expect(t.isOpen()).toBe(false);
    wheel(t.q('.alius-stage-reply .alius-reply')!, -120);
    expect(t.isOpen()).toBe(true);
  });

  it('ArrowUp in an EMPTY input opens it, not with text in the line', () => {
    const t = setup([msg(0)]);
    t.input().value = 'half a thought';
    keydown(t.input(), 'ArrowUp');
    expect(t.isOpen()).toBe(false);
    t.input().value = '';
    keydown(t.input(), 'ArrowUp');
    expect(t.isOpen()).toBe(true);
  });

  it('the history button opens it and the same button closes it', () => {
    const t = setup([msg(0)]);
    t.q('[data-action="history"]')!.click();
    expect(t.isOpen()).toBe(true);
    t.q('[data-action="history"]')!.click();
    expect(t.isOpen()).toBe(false);
  });

  it('Esc closes it; the wheel down at the end of the scroll closes it; the wheel down mid-scroll does not', () => {
    const t = setup([msg(0)]);
    t.q('[data-action="history"]')!.click();
    keydown(document, 'Escape');
    expect(t.isOpen()).toBe(false);
    t.q('[data-action="history"]')!.click();
    const scroll = t.q('.alius-curtain-scroll')!;
    vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(2000);
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(500);
    scroll.scrollTop = 100;
    wheel(scroll, 120);
    expect(t.isOpen()).toBe(true);
    scroll.scrollTop = 1500;
    wheel(scroll, 120);
    expect(t.isOpen()).toBe(true); // one notch is not a decision (review: trackpad momentum must not close it)
    wheel(scroll, 120);
    expect(t.isOpen()).toBe(false); // 240 or more, once the end is reached
    vi.restoreAllMocks();
  });

  it('the wheel down closes it only on an accumulated 240 at the end: momentum, a wheel up and a pause all start over', () => {
    const t = setup([msg(0)]);
    t.q('[data-action="history"]')!.click();
    const scroll = t.q('.alius-curtain-scroll')!;
    vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(2000);
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(500);
    scroll.scrollTop = 1500;
    for (let i = 0; i < 20; i++) wheel(scroll, 8); // the tail of a trackpad swipe: 160 in all
    expect(t.isOpen()).toBe(true);
    wheel(scroll, -30); // the other way: the count starts over
    wheel(scroll, 200);
    expect(t.isOpen()).toBe(true);
    vi.advanceTimersByTime(900); // a pause: the count starts over
    wheel(scroll, 100);
    expect(t.isOpen()).toBe(true);
    scroll.scrollTop = 100; // mid-scroll: nothing counts, and the count is gone
    wheel(scroll, 300);
    expect(t.isOpen()).toBe(true);
    scroll.scrollTop = 1500;
    wheel(scroll, 100);
    wheel(scroll, 100);
    expect(t.isOpen()).toBe(true);
    wheel(scroll, 100);
    expect(t.isOpen()).toBe(false);
    vi.restoreAllMocks();
  });

  it('a scene swapped under a live screen starts with the history down and no leftover flag on the root (review M1)', () => {
    const t = setup([msg(0)]);
    t.q('[data-action="history"]')!.click();
    expect(t.q('.alius-scene')!.dataset.curtain).toBe('open');
    t.retarget();
    expect(t.q('.alius-scene')!.dataset.curtain).toBeUndefined();
    expect(t.isOpen()).toBe(false);
    expect(t.q('.alius-stage-input input[name="cmd"]')).not.toBeNull(); // the line is back in its own host
  });

  it('opening marks the history hint as used', () => {
    const t = setup([msg(0)]);
    expect(t.q('.alius-stage-hints [data-hint="history"]')!.hidden).toBe(false);
    wheel(t.q('.alius-layer-frame')!, -1);
    expect(t.q('.alius-stage-hints [data-hint="history"]')!.hidden).toBe(true);
  });

  it('resetSceneStage() closes it (a chat switch)', () => {
    const t = setup([msg(0)]);
    t.q('[data-action="history"]')!.click();
    expect(t.isOpen()).toBe(true);
    resetSceneStage();
    expect(t.isOpen()).toBe(false);
  });

  it('the scene root says so (the sprites slide and the dock moves in CSS)', () => {
    const t = setup([msg(0)]);
    t.q('[data-action="history"]')!.click();
    expect(t.q('.alius-scene')!.dataset.curtain).toBe('open');
    keydown(document, 'Escape');
    expect(t.q('.alius-scene')!.dataset.curtain).toBeUndefined();
  });
});

describe('the curtain: the whole transcript', () => {
  it('every message in order under ANN or YOU, in prose as written', () => {
    const t = setup([user(0, 'Sit *down*.'), msg(1, { text: '*She sits.* "Fine."' }), msg(2, { text: 'Later.' })]);
    t.q('[data-action="history"]')!.click();
    const lines = t.qa('.alius-curtain-scroll .alius-line');
    expect(lines.map((l) => l.dataset.index)).toEqual(['0', '1', '2']);
    expect(lines.map((l) => l.querySelector('.alius-speaker')!.textContent)).toEqual(['YOU', 'ANN', 'ANN']);
    expect(lines[1].querySelector('em')!.textContent).toBe('She sits.');
    expect(lines[1].querySelector('.alius-speech')!.textContent).toBe('"Fine."');
    expect(lines[0].classList.contains('is-user')).toBe(true);
  });

  it('exactly what the controller gives (messages P3b hid are not there)', () => {
    const messages = [msg(0), msg(2), msg(5)]; // 1, 3 and 4 are hidden by memory: the controller omits them
    const t = setup(messages);
    t.q('[data-action="history"]')!.click();
    expect(t.qa('.alius-curtain-scroll .alius-line')).toHaveLength(messages.length);
    expect(t.qa('.alius-curtain-scroll .alius-line').map((l) => l.dataset.index)).toEqual(['0', '2', '5']);
  });

  it('nothing in the model\'s words becomes markup', () => {
    const t = setup([msg(0, { text: '<script>window.__x=1</script> *<b>bold</b>*', name: '<i>Ann</i>' })]);
    t.q('[data-action="history"]')!.click();
    expect(t.q('.alius-curtain script, .alius-curtain b, .alius-curtain i')).toBeNull();
    expect(t.q('.alius-curtain .alius-speaker')!.textContent).toBe('<I>ANN</I>');
  });

  it('the violation marker is kept (P9d)', () => {
    const t = setup([user(0), msg(1, { text: 'x' })]);
    t.screen.refresh();
    t.q('[data-action="history"]')!.click();
    expect(t.qa('.alius-curtain .alius-line')).toHaveLength(2);
  });
});

describe('the curtain: the tools', () => {
  it('✎ on every message; ‹ n / m › and ↻ on the last model reply only', () => {
    const t = setup([user(0), msg(1, { text: 'earlier' }), msg(2, { swipeId: 1, swipeCount: 3 })]);
    t.q('[data-action="history"]')!.click();
    expect(t.qa('.alius-curtain button.alius-edit').map((b) => b.dataset.edit)).toEqual(['0', '1', '2']);
    const last = t.q('.alius-curtain .alius-line[data-index="2"]')!;
    expect(last.querySelector('[data-action="swipe-left"]')).not.toBeNull();
    expect(last.querySelector('[data-action="swipe-right"]')).not.toBeNull();
    expect(last.querySelector('[data-action="regenerate"]')).not.toBeNull();
    expect(last.querySelector('.alius-curtain-swipes')!.textContent).toBe('2 / 3');
    for (const i of ['0', '1']) expect(t.q(`.alius-curtain .alius-line[data-index="${i}"] [data-action]`)).toBeNull();
  });

  it('the buttons call the adapter', () => {
    const t = setup([user(0), msg(1, { swipeCount: 2 })]);
    t.q('[data-action="history"]')!.click();
    t.q<HTMLElement>('.alius-curtain [data-action="swipe-left"]')!.click();
    t.q<HTMLElement>('.alius-curtain [data-action="swipe-right"]')!.click();
    t.q<HTMLElement>('.alius-curtain [data-action="regenerate"]')!.click();
    expect(t.swipe.mock.calls).toEqual([['left'], ['right']]);
    expect(t.regen).toHaveBeenCalledTimes(1);
  });

  it('without a swipe count there is no n / m', () => {
    const t = setup([user(0), msg(1)]);
    t.q('[data-action="history"]')!.click();
    expect(t.q('.alius-curtain-swipes')).toBeNull();
    expect(t.q('.alius-curtain [data-action="swipe-left"]')).not.toBeNull();
  });

  it('everything is off while a send is pending', () => {
    const t = setup([user(0), msg(1, { swipeCount: 2 })]);
    t.q('[data-action="history"]')!.click();
    t.input().value = 'Go';
    keydown(t.input(), 'Enter');
    const tools = t.qa('.alius-curtain button.alius-edit, .alius-curtain [data-action]') as HTMLButtonElement[];
    expect(tools.length).toBeGreaterThan(3);
    expect(tools.every((b) => b.disabled)).toBe(true);
  });
});

describe('the curtain: editing in place', () => {
  it('✎ opens a textarea; Ctrl+Enter saves through controller.edit; Esc cancels the edit and not the curtain', () => {
    const t = setup([user(0, 'Hi'), msg(1, { text: 'Hello *there*' })]);
    t.q('[data-action="history"]')!.click();
    t.q<HTMLElement>('.alius-curtain button.alius-edit[data-edit="1"]')!.click();
    const box = t.q<HTMLTextAreaElement>('.alius-curtain textarea.alius-edit-box')!;
    expect(box.value).toBe('Hello *there*');
    box.value = 'Changed';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    expect(t.controller.edit).toHaveBeenCalledWith(1, 'Changed');
    expect(t.q('textarea.alius-edit-box')).toBeNull();
    t.q<HTMLElement>('.alius-curtain button.alius-edit[data-edit="0"]')!.click();
    t.q('.alius-curtain textarea.alius-edit-box')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(t.q('textarea.alius-edit-box')).toBeNull();
    expect(t.isOpen()).toBe(true);
  });

  it('a reply edit button on the reply block is not there: editing lives in the curtain', () => {
    const t = setup([user(0), msg(1)]);
    expect(t.q('.alius-stage-reply .alius-edit')).toBeNull();
  });
});

describe('the curtain: the input moves with it', () => {
  it('the same input element is inside the curtain while it is open, back in its host on close, focus kept', () => {
    const t = setup([user(0), msg(1)]);
    const input = t.input();
    input.focus();
    expect(document.activeElement).toBe(input);
    t.q('[data-action="history"]')!.click();
    expect(t.input()).toBe(input);
    expect(input.closest('.alius-curtain')).not.toBeNull();
    expect(document.activeElement).toBe(input);
    keydown(document, 'Escape');
    expect(t.input()).toBe(input);
    expect(input.closest('.alius-stage-input')).not.toBeNull();
    expect(input.closest('.alius-curtain')).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('a message can be sent from inside the curtain', () => {
    const t = setup([msg(0)]);
    t.q('[data-action="history"]')!.click();
    t.input().value = 'From the curtain.';
    keydown(t.input(), 'Enter');
    expect(t.controller.send).toHaveBeenCalledWith('From the curtain.');
  });
});

describe('curtainWords', () => {
  it('a reply longer than N words opens it when it arrives; with 0 it never does', () => {
    const long = Array.from({ length: 121 }, (_, i) => `w${i}`).join(' ');
    const messages: ChatMessage[] = [user(0, 'Hi')];
    const t = setup(messages, { curtainWords: 120 });
    messages.push(msg(1, { text: long }));
    t.screen.handle({ type: 'transcript' });
    expect(t.isOpen()).toBe(true);
    document.body.innerHTML = '';
    resetSceneStage();
    const messages2: ChatMessage[] = [user(0, 'Hi')];
    const off = setup(messages2, { curtainWords: 0 });
    messages2.push(msg(1, { text: long }));
    off.screen.handle({ type: 'transcript' });
    expect(off.isOpen()).toBe(false);
  });

  it('a short reply does not open it, and neither does one that was already there when the scene opened', () => {
    const long = Array.from({ length: 200 }, (_, i) => `w${i}`).join(' ');
    const there = setup([user(0), msg(1, { text: long })], { curtainWords: 120 });
    expect(there.isOpen()).toBe(false);
    document.body.innerHTML = '';
    resetSceneStage();
    const messages: ChatMessage[] = [user(0, 'Hi')];
    const t = setup(messages, { curtainWords: 120 });
    messages.push(msg(1, { text: 'short one' }));
    t.screen.handle({ type: 'transcript' });
    expect(t.isOpen()).toBe(false);
  });
});
