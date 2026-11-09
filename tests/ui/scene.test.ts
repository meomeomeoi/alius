// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import type { SceneController } from '../../src/scene/sceneController';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../src/settings';
import type { ChatMessage } from '../../src/st/adapter';
import { FakeStAdapter } from '../../src/st/fake';
import { h } from '../../src/ui/dom';
import { cutIn } from '../../src/ui/scene/cutIn';
import { pickLocation } from '../../src/ui/scene/locationPicker';
import { renderSceneScreen } from '../../src/ui/scene/sceneScreen';
import { campaign, errors, loadCore, run } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];

const msg = (index: number, over: Partial<ChatMessage> = {}): ChatMessage => ({ index, isUser: false, name: 'Ann', avatar: 'ann.png', text: 'hi', swipeId: 0, ...over });

function setup(opts: { participants?: string[]; messages?: ChatMessage[]; settings?: Partial<AliusSettings>; tweak?: (s: CampaignState) => void; locationId?: string } = {}) {
  let state = campaign(reg, 4);
  opts.tweak?.(state);
  const r = run(state, reg, { type: 'scene/start', payload: { locationId: opts.locationId ?? 'mess_hall', participants: opts.participants ?? [ANN], origin: 'event', startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  state = r.state;
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  const messages = opts.messages ?? [];
  let pendingSend: (() => void) | null = null;
  const controller = {
    send: vi.fn(() => new Promise<void>((res) => { pendingSend = res; })),
    propose: vi.fn(),
    answer: vi.fn(),
    end: vi.fn(async () => {}),
    transcript: () => messages,
    onSwipe: vi.fn(), resume: vi.fn(), idle: vi.fn(), dispose: vi.fn(), start: vi.fn(),
  } as unknown as SceneController;
  const swipe = vi.spyOn(st, 'swipeLast');
  const regen = vi.spyOn(st, 'regenerateLast');
  const settings = { ...DEFAULT_SETTINGS, typingSpeed: 0, ...opts.settings };
  const host = h('div');
  document.body.append(host);
  const onEnded = vi.fn();
  const screen = renderSceneScreen(host, { controller, getState: () => state, registries: reg, st, settings: () => settings, onEnded });
  return {
    host, st, controller, screen, swipe, regen, onEnded, messages, settings,
    setState: (s: CampaignState) => { state = s; },
    state: () => state,
    finishSend: () => pendingSend?.(),
    q: <T extends HTMLElement = HTMLElement>(sel: string) => host.querySelector<T>(sel),
    qa: <T extends HTMLElement = HTMLElement>(sel: string) => [...host.querySelectorAll<T>(sel)],
  };
}

describe('scene screen', () => {
  it('renders location ASCII when there is no image', () => {
    const { q } = setup();
    const art = q('pre.alius-ascii')!;
    expect(art.textContent).toContain('[SERVING]');
    expect(q('.alius-scene-header')!.textContent).toContain('Mess hall');
  });

  it('uses the background image when the location has one', () => {
    const { q } = setup({ tweak: () => {} });
    expect(q('.alius-scene-bg')!.style.backgroundImage).toBe('');
    document.body.innerHTML = '';
    const loc = reg.locations.get('mess_hall')!;
    loc.background = 'assets/mess.png';
    try {
      const again = setup();
      expect(again.q('.alius-scene-bg')!.style.backgroundImage).toContain('assets/mess.png');
      expect(again.q('pre.alius-ascii')).toBeNull();
    } finally {
      delete loc.background;
    }
  });

  it('a group scene places three sprites left/center/right', () => {
    const { qa } = setup({ participants: [ANN, BEA, CAT] });
    expect(qa('.alius-sprite').map((e) => [e.dataset.unit, ['pos-left', 'pos-center', 'pos-right'].find((c) => e.classList.contains(c))])).toEqual([
      [ANN, 'pos-left'], [BEA, 'pos-center'], [CAT, 'pos-right'],
    ]);
    expect(qa('.alius-hud-unit')).toHaveLength(3);
  });

  it('one sprite sits in the centre, two on the sides; the last speaker is highlighted', () => {
    expect(setup().qa('.alius-sprite.pos-center')).toHaveLength(1);
    const two = setup({ participants: [ANN, BEA], messages: [msg(0, { isUser: true, name: 'Vale', avatar: undefined, text: 'Hello' }), msg(1, { name: 'Bea', avatar: 'bea.png' })] });
    expect(two.qa('.alius-sprite').map((e) => e.classList.contains('pos-left') || e.classList.contains('pos-right'))).toEqual([true, true]);
    expect(two.q(`.alius-sprite[data-unit="${BEA}"]`)!.classList.contains('is-speaking')).toBe(true);
    expect(two.q(`.alius-sprite[data-unit="${ANN}"]`)!.classList.contains('is-speaking')).toBe(false);
  });

  it('a sprite shows the scripted label image, else the avatar thumbnail', async () => {
    const { st, q, screen } = setup();
    st.sprites.set('ann.png:joy', '/sprites/ann/joy.png');
    screen.handle({ type: 'sprite', unitId: ANN, label: 'joy' });
    await vi.advanceTimersByTimeAsync(0);
    expect(q<HTMLImageElement>(`.alius-sprite[data-unit="${ANN}"] img`)!.getAttribute('src')).toBe('/sprites/ann/joy.png');
    screen.handle({ type: 'sprite', unitId: ANN, label: 'sadness' });
    await vi.advanceTimersByTimeAsync(0);
    expect(q<HTMLImageElement>(`.alius-sprite[data-unit="${ANN}"] img`)!.getAttribute('src')).toBe(st.getAvatarUrl('ann.png'));
  });

  it('speaker tag and emphasized text render as glitch spans', () => {
    const { q, qa } = setup({ messages: [msg(0, { text: 'I *really* mean it, *truly*.' })] });
    expect(q('.alius-speaker')!.textContent).toBe('ANN //');
    expect(qa('em.alius-glitch').map((e) => e.textContent)).toEqual(['really', 'truly']);
    expect(q('.alius-text')!.textContent).toBe('I really mean it, truly.');
  });

  it('model text with <script> stays text', () => {
    const evil = '<script>window.__pwned = 1</script><img src=x onerror="window.__pwned=2"> *<b>bold</b>*';
    const { q, host } = setup({ messages: [msg(0, { text: evil, name: '<i>Ann</i>' })] });
    expect(host.querySelector('script')).toBeNull();
    expect(host.querySelector('img[onerror]')).toBeNull();
    expect(host.querySelector('b')).toBeNull();
    expect(q('.alius-text')!.textContent).toContain('<script>');
    expect(q('.alius-speaker')!.textContent).toBe('<I>ANN</I> //');
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('typing speed 0 renders instantly; a positive speed types the newest reply out', () => {
    const instant = setup({ messages: [msg(0, { text: 'Hello there' })] });
    expect(instant.q('.alius-text')!.textContent).toBe('Hello there');

    const messages: ChatMessage[] = [msg(0, { isUser: true, name: 'Vale', avatar: undefined, text: 'Hi' })];
    const typed = setup({ messages, settings: { typingSpeed: 20 } });
    messages.push(msg(1, { text: 'abcdefghij' }));
    typed.screen.handle({ type: 'transcript' });
    const text = () => typed.qa('.alius-text').at(-1)!.textContent!;
    expect(text().length).toBeLessThan(10);
    vi.advanceTimersByTime(250);
    expect(text().length).toBeGreaterThan(0);
    expect(text().length).toBeLessThan(10);
    vi.advanceTimersByTime(1000);
    expect(text()).toBe('abcdefghij');
    // the user line was never typed
    expect(typed.qa('.alius-text')[0].textContent).toBe('Hi');
  });

  it('CMD> Enter calls controller.send and disables input until done', async () => {
    const { q, controller, finishSend } = setup();
    const input = q<HTMLInputElement>('input[name="cmd"]')!;
    expect(q('.alius-cmd')!.textContent).toContain('CMD>');
    input.value = 'Hello, Ann.';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(controller.send).toHaveBeenCalledWith('Hello, Ann.');
    expect(input.disabled).toBe(true);
    finishSend();
    await vi.advanceTimersByTimeAsync(0);
    expect(input.disabled).toBe(false);
    expect(input.value).toBe('');
  });

  it('an empty command is not sent', () => {
    const { q, controller } = setup();
    const input = q<HTMLInputElement>('input[name="cmd"]')!;
    input.value = '   ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(controller.send).not.toHaveBeenCalled();
  });

  it('chips appear for a pending proposal and call answer', () => {
    const { q, qa, controller, setState, state, screen } = setup({ tweak: (s) => { Object.assign(s.relations[ANN], { stateId: 'friend', trust: 50, affinity: 30, attraction: 40 }); } });
    const a = run(state(), reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { proposals: [{ from: ANN, to: 'commander', kind: 'date', evidence: 'x' }] } } });
    setState(a.state);
    screen.handle({ type: 'chips', proposal: a.state.proposals![0] });
    expect(q('.alius-chips')!.textContent).toContain('ANN PROPOSES: DATE');
    expect(qa('.alius-chips button').map((b) => b.textContent)).toEqual(['[ACCEPT]', '[DECLINE]', '[NOT NOW]']);
    qa('.alius-chips button')[0].click();
    expect(controller.answer).toHaveBeenCalledWith(a.state.proposals![0].id, 'accept');
    qa('.alius-chips button')[1].click();
    expect(controller.answer).toHaveBeenLastCalledWith(a.state.proposals![0].id, 'decline');
    qa('.alius-chips button')[2].click();
    expect(controller.answer).toHaveBeenLastCalledWith(a.state.proposals![0].id, 'not_now');
  });

  it('disclosure chips replace decline', () => {
    const { qa, controller, setState, state, screen } = setup({
      tweak: (s) => {
        Object.assign(s.relations[ANN], { stateId: 'friend', trust: 50, affinity: 30, attraction: 40 });
        Object.assign(s.relations[BEA], { stateId: 'lover', trust: 70, affinity: 70, attraction: 70 });
      },
    });
    const a = run(state(), reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { proposals: [{ from: ANN, to: 'commander', kind: 'date', evidence: 'x' }] } } });
    setState(a.state);
    screen.handle({ type: 'transcript' });
    expect(qa('.alius-chips button').map((b) => b.textContent)).toEqual(['[OPENLY]', '[SECRETLY]', '[NOT NOW]']);
    qa('.alius-chips button')[1].click();
    expect(controller.answer).toHaveBeenCalledWith(a.state.proposals![0].id, 'accept_secret');
  });

  it('proposals of units that are not in the scene get no chips', () => {
    const { qa, setState, state, screen } = setup({ tweak: (s) => { Object.assign(s.relations[BEA], { stateId: 'friend', trust: 50, affinity: 30, attraction: 40 }); } });
    const s = structuredClone(state());
    s.proposals = [{ id: 'q1', unitId: BEA, kind: 'date', from: 'unit', day: 1, channel: 'dm', targetState: 'flirting', needsDisclosure: false }];
    setState(s);
    screen.handle({ type: 'transcript' });
    expect(qa('.alius-chips button')).toHaveLength(0);
  });

  it('pulse shows ▲ TRUST without numbers; with showRawValues shows +3', () => {
    const plain = setup();
    plain.screen.handle({ type: 'pulse', unitId: ANN, axis: 'trust', up: true, delta: 3 });
    expect(plain.q(`.alius-hud-unit[data-unit="${ANN}"] .alius-pulse`)!.textContent).toBe('▲ TRUST');
    plain.screen.handle({ type: 'pulse', unitId: ANN, axis: 'affinity', up: false, delta: -2 });
    expect(plain.qa('.alius-pulse').map((e) => e.textContent)).toEqual(['▲ TRUST', '▼ AFFINITY']);
    vi.advanceTimersByTime(1600);
    expect(plain.qa('.alius-pulse')).toHaveLength(0);

    const raw = setup({ settings: { showRawValues: true } });
    raw.screen.handle({ type: 'pulse', unitId: ANN, axis: 'trust', up: true, delta: 3 });
    expect(raw.q('.alius-pulse')!.textContent).toBe('▲ TRUST +3');
  });

  it('the HUD shows the relationship glyph', () => {
    const { q } = setup({ tweak: (s) => { s.relations[ANN].stateId = 'lover'; } });
    expect(q(`.alius-hud-unit[data-unit="${ANN}"] .alius-glyph`)!.textContent).toBe('<3');
  });

  it('propose menu hides romantic kinds when romance is off', () => {
    const on = setup();
    const kinds = (s: ReturnType<typeof setup>) => s.qa<HTMLOptionElement>('select[name="propose"] option').map((o) => o.value).filter(Boolean);
    expect(kinds(on)).toEqual(expect.arrayContaining(['date', 'fwb', 'romance', 'exclusive', 'secret_affair', 'friendship_deepen', 'confide', 'break_up']));
    document.body.innerHTML = '';
    const off = setup({ tweak: (s) => { s.settings.intimacy = { romance: false, initiative: 'med' }; } });
    expect(kinds(off)).toEqual(['friendship_deepen', 'confide', 'rivalry', 'reconcile', 'break_up']);
  });

  it('choosing a propose kind calls the controller; a group scene asks who', () => {
    const solo = setup();
    const sel = solo.q<HTMLSelectElement>('select[name="propose"]')!;
    sel.value = 'date';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(solo.controller.propose).toHaveBeenCalledWith('date', ANN);
    expect(sel.value).toBe('');
    document.body.innerHTML = '';
    const group = setup({ participants: [ANN, BEA] });
    const who = group.q<HTMLSelectElement>('select[name="propose-unit"]')!;
    who.value = BEA;
    const kind = group.q<HTMLSelectElement>('select[name="propose"]')!;
    kind.value = 'confide';
    kind.dispatchEvent(new Event('change', { bubbles: true }));
    expect(group.controller.propose).toHaveBeenCalledWith('confide', BEA);
  });

  it('regenerate and swipe buttons pass through to the adapter', () => {
    const { q, swipe, regen } = setup();
    q('button[data-action="regenerate"]')!.click();
    q('button[data-action="swipe-left"]')!.click();
    q('button[data-action="swipe-right"]')!.click();
    expect(regen).toHaveBeenCalledTimes(1);
    expect(swipe.mock.calls.map((c) => c[0])).toEqual(['left', 'right']);
  });

  it('a pacing event shows the TIME IS PASSING banner', () => {
    const { q, screen } = setup();
    expect(q('.alius-pacing')).toBeNull();
    screen.handle({ type: 'pacing' });
    expect(q('.alius-pacing')!.textContent).toContain('TIME IS PASSING');
  });

  it('END TRANSMISSION calls controller.end and then onEnded', async () => {
    const { q, controller, onEnded } = setup();
    q('button[data-action="end"]')!.click();
    expect(controller.end).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('a cut-in event shows a cut-in and removes it', () => {
    const { q, screen } = setup();
    screen.handle({ type: 'cut_in', kind: 'state:lover' });
    expect(q('.alius-cutin')!.textContent).toContain('LOVER');
    vi.advanceTimersByTime(1000);
    expect(q('.alius-cutin')).toBeNull();
  });

  it('the screen renders safely without an open scene', () => {
    const s = setup();
    const noScene = structuredClone(s.state());
    delete noScene.scene;
    s.setState(noScene);
    expect(() => s.screen.handle({ type: 'transcript' })).not.toThrow();
    expect(s.q('.alius-scene')!.textContent).toMatch(/no scene/i);
  });
});

describe('cutIn', () => {
  it('adds and removes its element', () => {
    const host = h('div');
    document.body.append(host);
    cutIn(host, 'decision_violated', 'DECISION VIOLATED');
    const el = host.querySelector('.alius-cutin') as HTMLElement;
    expect(el.textContent).toBe('DECISION VIOLATED');
    expect(el.dataset.kind).toBe('decision_violated');
    vi.advanceTimersByTime(899);
    expect(host.querySelector('.alius-cutin')).not.toBeNull();
    vi.advanceTimersByTime(2);
    expect(host.querySelector('.alius-cutin')).toBeNull();
  });
  it('text stays text', () => {
    const host = h('div');
    cutIn(host, 'x', '<img src=x onerror=alert(1)>');
    expect(host.querySelector('img')).toBeNull();
  });
});

describe('location picker', () => {
  const modalFor = (act: (body: HTMLElement) => void, value = 'ok') => async (o: { body: Node | string }) => {
    const host = h('div');
    document.body.append(host);
    host.append(o.body as Node);
    act(host);
    return value;
  };
  const evening = () => { const s = campaign(reg, 4); s.slot = 'evening'; return s; };
  const base = (s: CampaignState) => ({ registries: reg, state: s, firstUnitId: ANN, candidates: s.squad.filter((u) => u.id !== ANN) });

  it('offers only slot-allowed locations', async () => {
    let seen: string[] = [];
    await pickLocation(modalFor((b) => { seen = [...b.querySelectorAll<HTMLInputElement>('input[name="location"]')].map((i) => i.value); }, 'cancel'), base(campaign(reg, 4)));
    expect(seen).toEqual(['quarters_commander', 'quarters_unit', 'mess_hall', 'training_yard', 'workshop', 'medbay', 'garage', 'comms_room', 'perimeter']);
    let night: string[] = [];
    const s = campaign(reg, 4);
    s.slot = 'night';
    await pickLocation(modalFor((b) => { night = [...b.querySelectorAll<HTMLInputElement>('input[name="location"]')].map((i) => i.value); }, 'cancel'), base(s));
    expect(night).toEqual(['quarters_commander', 'quarters_unit', 'medbay', 'roof', 'perimeter']);
    let eve: string[] = [];
    await pickLocation(modalFor((b) => { eve = [...b.querySelectorAll<HTMLInputElement>('input[name="location"]')].map((i) => i.value); }, 'cancel'), base(evening()));
    expect(eve).toContain('roof');
  });

  it('labels the per-unit quarters with the first unit\'s name', async () => {
    let label = '';
    await pickLocation(modalFor((b) => { label = b.querySelector('label[data-location="quarters_unit"]')!.textContent!; }, 'cancel'), base(campaign(reg, 4)));
    expect(label).toContain("Ann's quarters");
  });

  it('returns the chosen location and participants', async () => {
    const r = await pickLocation(modalFor((b) => {
      b.querySelector<HTMLInputElement>('input[value="workshop"]')!.checked = true;
      b.querySelector<HTMLInputElement>('input[name="extra"][value="unit_bea"]')!.checked = true;
    }), base(campaign(reg, 4)));
    expect(r).toEqual({ locationId: 'workshop', participants: [ANN, BEA] });
  });

  it('defaults to the first allowed location with the unit alone, and cancel gives null', async () => {
    expect(await pickLocation(modalFor(() => {}), base(campaign(reg, 4)))).toEqual({ locationId: 'quarters_commander', participants: [ANN] });
    expect(await pickLocation(modalFor(() => {}, 'cancel'), base(campaign(reg, 4)))).toBeNull();
  });

  it('caps participants at three: the third extra checkbox disables', async () => {
    let disabled: boolean[] = [];
    await pickLocation(modalFor((b) => {
      const boxes = [...b.querySelectorAll<HTMLInputElement>('input[name="extra"]')];
      boxes[0].checked = true; boxes[0].dispatchEvent(new Event('change', { bubbles: true }));
      boxes[1].checked = true; boxes[1].dispatchEvent(new Event('change', { bubbles: true }));
      disabled = boxes.map((x) => x.disabled);
    }, 'cancel'), base(campaign(reg, 4)));
    expect(disabled).toEqual([false, false, true]);
    const r = await pickLocation(modalFor((b) => {
      for (const x of b.querySelectorAll<HTMLInputElement>('input[name="extra"]')) x.checked = true;
    }), base(campaign(reg, 4)));
    expect(r!.participants).toHaveLength(3);
  });

  it('only named living units are offered as extras', async () => {
    const s = campaign(reg, 4);
    s.squad.find((u) => u.id === 'unit_dee')!.status = 'dead';
    let offered: string[] = [];
    await pickLocation(modalFor((b) => { offered = [...b.querySelectorAll<HTMLInputElement>('input[name="extra"]')].map((i) => i.value); }, 'cancel'), base(s));
    expect(offered).toEqual([BEA, CAT]);
  });
});
