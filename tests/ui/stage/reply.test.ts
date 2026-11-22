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
import { REPLY_MAX_LINES, measureReply, renderReply, replyView, type ReplyView } from '../../../src/ui/scene/stage/reply';
import { sentenceRunIndex } from '../../../src/ui/scene/stage/prose';
import { unitAccent } from '../../../src/ui/voice/voiceCard';
import { campaign, errors, loadCore, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = '';
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const msg = (index: number, over: Partial<ChatMessage> = {}): ChatMessage => ({ index, isUser: false, name: 'Ann', avatar: 'ann.png', text: 'hi', swipeId: 0, ...over });
const user = (index: number, text = 'Hello'): ChatMessage => msg(index, { isUser: true, name: 'Vale', avatar: undefined, text });

describe('replyView', () => {
  it('the replies since the commander\'s last message, with that message as the echo', () => {
    const v = replyView([user(0, 'Open up.'), msg(1, { text: 'One.' }), msg(2, { name: 'Bea', avatar: 'bea.png', text: 'Two.' })]);
    expect(v.echo).toBe('Open up.');
    expect(v.replies.map((r) => [r.index, r.name, r.text])).toEqual([[1, 'Ann', 'One.'], [2, 'Bea', 'Two.']]);
  });

  it('only the newest round: an earlier commander message and its replies are not shown', () => {
    const v = replyView([user(0, 'a'), msg(1), user(2, 'b'), msg(3, { text: 'late' })]);
    expect(v.echo).toBe('b');
    expect(v.replies.map((r) => r.index)).toEqual([3]);
  });

  it('with no commander message the last replies show and there is no echo; an empty transcript shows nothing', () => {
    expect(replyView([msg(0, { text: 'First.' })])).toEqual({ echo: null, replies: [{ index: 0, name: 'Ann', avatar: 'ann.png', text: 'First.' }] });
    expect(replyView([])).toEqual({ echo: null, replies: [] });
  });

  it('while the commander waits (the last message is theirs) only the echo shows', () => {
    const v = replyView([msg(0), user(1, 'Well?')]);
    expect(v).toEqual({ echo: 'Well?', replies: [] });
  });
});

describe('renderReply', () => {
  const view: ReplyView = { echo: 'Close the door.', replies: [{ index: 1, name: 'Ann', avatar: 'ann.png', text: '*She nods.* "Fine." Then she goes.' }] };
  const opts = (over: Partial<Parameters<typeof renderReply>[2]> = {}): Parameters<typeof renderReply>[2] => ({
    maxLines: REPLY_MAX_LINES, visibleOf: () => Infinity, newestFrom: () => undefined, accentOf: () => null, onMore: () => {}, ...over,
  });

  it('shows the echo as one dim line and each reply under its speaker, prose as written', () => {
    const host = h('div');
    renderReply(host, view, opts({ accentOf: () => '#ff9ec7' }));
    expect(host.querySelector('.alius-reply-echo')!.textContent).toBe('Close the door.');
    const line = host.querySelector<HTMLElement>('.alius-reply-line[data-index="1"]')!;
    expect(line.querySelector('.alius-reply-name')!.textContent).toBe('ANN');
    expect(line.querySelector('.alius-reply-text')!.textContent).toBe('She nods. "Fine." Then she goes.');
    expect(line.querySelector('em')!.textContent).toBe('She nods.');
    expect(line.querySelector('.alius-speech')!.textContent).toBe('"Fine."');
    expect(line.style.getPropertyValue('--alius-accent')).toBe('#ff9ec7');
    expect(REPLY_MAX_LINES).toBe(8);
  });

  it('a group: every reply since the commander\'s last message, each under its own name, oldest first', () => {
    const host = h('div');
    renderReply(host, { echo: null, replies: [{ index: 1, name: 'Ann', text: 'a' }, { index: 2, name: 'Bea', text: 'b' }, { index: 3, name: 'Cat', text: 'c' }] }, opts());
    expect([...host.querySelectorAll('.alius-reply-line')].map((l) => [l.getAttribute('data-index'), l.querySelector('.alius-reply-name')!.textContent])).toEqual([['1', 'ANN'], ['2', 'BEA'], ['3', 'CAT']]);
    expect(host.querySelector('.alius-reply-echo')).toBeNull();
  });

  it('nothing in the model\'s words becomes markup (name included)', () => {
    const host = h('div');
    renderReply(host, { echo: '<b>x</b>', replies: [{ index: 0, name: '<i>Ann</i>', text: '<script>1</script> *<b>y</b>*' }] }, opts());
    expect(host.querySelector('script, b, i')).toBeNull();
    expect(host.querySelector('.alius-reply-name')!.textContent).toBe('<I>ANN</I>');
  });

  it('the revealed part only, and the newest runs carry alius-prose-new', () => {
    const host = h('div');
    renderReply(host, view, opts({ visibleOf: () => 10, newestFrom: () => 1 }));
    expect(host.querySelector('.alius-reply-text')!.textContent).toHaveLength(10);
    expect(host.querySelector('.alius-prose-new')).not.toBeNull();
    renderReply(host, view, opts());
    expect(host.querySelector('.alius-prose-new')).toBeNull();
  });

  it('a reply that does not fit shows "more above" and the mark calls onMore; one that fits shows neither', () => {
    const host = h('div');
    vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(900);
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(200);
    const onMore = vi.fn();
    renderReply(host, view, opts({ onMore }));
    const block = host.querySelector<HTMLElement>('.alius-reply')!;
    expect(block.dataset.overflow).toBe('true');
    host.querySelector<HTMLElement>('[data-more]')!.click();
    expect(onMore).toHaveBeenCalledTimes(1);
    // it shows its last lines (scrolled to the end)
    expect(host.querySelector<HTMLElement>('.alius-reply-body')!.scrollTop).toBe(900);
    vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(100);
    measureReply(host);
    expect(block.dataset.overflow).toBeUndefined();
    expect(host.querySelector('[data-more]')).toBeNull();
  });

  it('the violation marker is drawn on a flagged reply through the callback', () => {
    const host = h('div');
    const flag = vi.fn((line: HTMLElement) => line.append(h('span', { 'data-violation': '' }, 'CONTENT')));
    renderReply(host, view, opts({ flag }));
    expect(flag).toHaveBeenCalledWith(expect.any(HTMLElement), 1);
    expect(host.querySelector('.alius-reply-line [data-violation]')).not.toBeNull();
  });
});

describe('sentenceRunIndex', () => {
  it('is the run the newest sentence starts in', () => {
    expect(sentenceRunIndex('One. Two three', 14)).toBe(0); // all one prose run
    expect(sentenceRunIndex('She nods. "Fine," she says. Then more', 37)).toBe(2);
    expect(sentenceRunIndex('*She nods.* "Fine."', 5)).toBe(0);
    expect(sentenceRunIndex('', 0)).toBe(0);
  });
});

describe('the reply on the scene screen', () => {
  beforeEach(() => vi.useFakeTimers());
  function setup(messages: ChatMessage[], settings: Partial<AliusSettings> = {}, participants = [ANN]) {
    let state: CampaignState = campaign(reg, 4);
    const r = run(state, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants, origin: 'event', startIndex: 0 } });
    expect(errors(r.events)).toEqual([]);
    state = r.state;
    const controller = {
      send: vi.fn(() => new Promise<boolean>(() => {})), propose: vi.fn(), answer: vi.fn(), end: vi.fn(async () => {}), edit: vi.fn(async () => {}), stop: vi.fn(),
      onEdited: vi.fn(), transcript: () => messages, onSwipe: vi.fn(), resume: vi.fn(), idle: vi.fn(), dispose: vi.fn(), start: vi.fn(),
    } as unknown as SceneController;
    const host = h('div');
    document.body.append(host);
    const screen = renderSceneScreen(host, {
      controller, getState: () => state, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }),
      settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0, ...settings }), onEnded: vi.fn(),
    });
    return { host, screen, q: <T extends HTMLElement = HTMLElement>(s: string) => host.querySelector<T>(s), qa: (s: string) => [...host.querySelectorAll<HTMLElement>(s)] };
  }

  it('the last replies show in the reply block with their echo; the accent is the speaker\'s', () => {
    const t = setup([user(0, 'Sit.'), msg(1, { text: '*She sits.* "Done."' }), msg(2, { name: 'Bea', avatar: 'bea.png', text: 'Me too.' })], {}, [ANN, BEA]);
    expect(t.q('.alius-stage-reply .alius-reply-echo')!.textContent).toBe('Sit.');
    expect(t.qa('.alius-stage-reply .alius-reply-line').map((l) => l.dataset.index)).toEqual(['1', '2']);
    expect(t.q('.alius-reply-line[data-index="1"]')!.style.getPropertyValue('--alius-accent')).toBe(unitAccent(ANN));
    expect(t.q('.alius-reply-line[data-index="2"]')!.style.getPropertyValue('--alius-accent')).toBe(unitAccent(BEA));
  });

  it('typing reveals the newest reply; the revealed tail is highlighted and the highlight is gone when it ends', () => {
    const messages: ChatMessage[] = [user(0, 'Hi')];
    const t = setup(messages, { typingSpeed: 20 });
    messages.push(msg(1, { text: 'One two. Three four five six.' }));
    t.screen.handle({ type: 'transcript' });
    const text = () => t.q('.alius-reply-text')!.textContent!;
    vi.advanceTimersByTime(750);
    expect(text().length).toBeGreaterThan(0);
    expect(text().length).toBeLessThan(29);
    expect(t.q('.alius-reply .alius-prose-new')).not.toBeNull();
    vi.advanceTimersByTime(3000);
    expect(text()).toBe('One two. Three four five six.');
    expect(t.q('.alius-prose-new')).toBeNull();
  });

  it('typing speed 0 or reduced motion shows the reply at once with no highlight', () => {
    for (const settings of [{ typingSpeed: 0 }, { typingSpeed: 20, reducedMotion: true }]) {
      const messages: ChatMessage[] = [user(0, 'Hi')];
      const t = setup(messages, settings);
      messages.push(msg(1, { text: 'abcdefghij. Klm.' }));
      t.screen.handle({ type: 'transcript' });
      expect(t.q('.alius-reply-text')!.textContent).toBe('abcdefghij. Klm.');
      expect(t.q('.alius-prose-new')).toBeNull();
      document.body.innerHTML = '';
    }
  });

  it('the status line: AWAITING REPLY with STOP while a send is pending, and TIME IS PASSING', () => {
    const t = setup([msg(0)]);
    t.q<HTMLInputElement>('input[name="cmd"]')!.value = 'Hello';
    t.q<HTMLInputElement>('input[name="cmd"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(t.q('.alius-stage-status .alius-busy')!.textContent).toMatch(/AWAITING REPLY/);
    expect(t.q('.alius-stage-status button[data-action="stop"]')).not.toBeNull();
    t.screen.handle({ type: 'pacing' });
    expect(t.q('.alius-stage-status .alius-pacing')!.textContent).toContain('TIME IS PASSING');
  });

  it('an empty scene keeps its hint, in the reply block', () => {
    const t = setup([]);
    expect(t.q('.alius-stage-reply .alius-scene-hint')!.textContent).toContain('Nobody speaks until you do');
  });
});
