// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import type { CampaignState } from '../../../src/engine/state/types';
import type { SceneController } from '../../../src/scene/sceneController';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { h } from '../../../src/ui/dom';
import { renderSceneScreen } from '../../../src/ui/scene/sceneScreen';
import { resetSceneStage } from '../../../src/ui/scene/stage';
import { DOCK_SLOTS, createDock } from '../../../src/ui/scene/stage/dock';
import { COMMANDER, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { enable } from '../../helpers/bonds';
import '../../../src/engine/actions/physics';
import { campaign, errors, loadCore, run, setRelation } from '../../helpers/loyalty';
import { sceneCard } from '../../../src/ui/scene/cards/sceneCard';
import { createSamples, type SampleSound } from '../../../src/ui/sound/samples';
import { drawTaskCards } from '../../../src/ui/practice/taskCard';
import { blankPractices } from '../../../src/engine/practice/state';
import { ANN, withService, world } from '../../engine/practice/world';
import '../../../src/engine/actions/blocking';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  resetSceneStage();
  resetBlockingHooks();
});

const card = (id: string, title = id) => h('section', { 'data-task': id }, h('h3', {}, title), h('p', {}, `body of ${id}`));
const dockWith = (...cards: Array<[string, HTMLElement]>) => {
  const host = h('div');
  document.body.append(host);
  const dock = createDock(host, DOCK_SLOTS);
  for (const [slot, c] of cards) dock.slot(slot).append(c);
  dock.layout('sc1');
  return dock;
};
const open = (el: HTMLElement) => el.dataset.open === 'true';

describe('the dock', () => {
  it('the slots are in the order the plan names', () => {
    expect(DOCK_SLOTS).toEqual(['moment', 'physics', 'punishment', 'task', 'demonstration', 'milestone', 'claim', 'return']); // P10e-e Task 9: the posture call is a moment, not a card
    const dock = dockWith();
    expect([...dock.element.querySelectorAll<HTMLElement>('.alius-dock-slot')].map((s) => s.dataset.slot)).toEqual([...DOCK_SLOTS]);
  });

  it('one card is open: the one that comes first in the order (a punishment before a task); the others collapse to their heading', () => {
    const task = card('t1');
    const pun = card('p1');
    const dock = dockWith(['task', task], ['punishment', pun]);
    expect(open(pun)).toBe(true);
    expect(open(task)).toBe(false);
    expect(task.dataset.collapsed).toBe('true');
    expect(pun.dataset.collapsed).toBeUndefined();
    expect(dock.element.querySelectorAll('[data-open="true"]')).toHaveLength(1);
  });

  it('a click on a collapsed heading opens it and collapses the other; it stays so across a redraw', () => {
    const task = card('t1');
    const pun = card('p1');
    const dock = dockWith(['task', task], ['punishment', pun]);
    task.querySelector('h3')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(open(task)).toBe(true);
    expect(open(pun)).toBe(false);
    dock.layout('sc1');
    expect(open(task)).toBe(true);
    // when the chosen card goes away the first one opens again
    task.remove();
    dock.layout('sc1');
    expect(open(pun)).toBe(true);
  });

  it('a click inside the open card does not move it', () => {
    const task = card('t1');
    const dock = dockWith(['task', task]);
    task.querySelector('p')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(open(task)).toBe(true);
    void dock;
  });

  it('a running hold\'s card is never collapsed: it stays open beside the moment or the posture call that comes first (review I2)', () => {
    const physics = h('div', { class: 'alius-physics', 'data-run': 'r1' }, h('div', { class: 'alius-physics-title' }, 'A HOLD'), h('button', { 'data-action': 'tap' }, '[ TAP ]'));
    const moment = card('m1');
    const call = card('c1');
    const dock = dockWith(['moment', moment], ['physics', physics], ['punishment', call]);
    expect(open(physics)).toBe(true);
    expect(physics.dataset.collapsed).toBeUndefined();
    expect(open(moment)).toBe(true); // the card that comes first opens as always
    expect(open(call)).toBe(false);
    expect(call.dataset.collapsed).toBe('true');
    // a click on the collapsed call opens it and still leaves the hold open
    call.querySelector('h3')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    dock.layout('sc1');
    expect(open(call)).toBe(true);
    expect(open(moment)).toBe(false);
    expect(open(physics)).toBe(true);
  });

  it('a hold that is not running (the ways, the held strip) collapses like any other card', () => {
    const idle = h('div', { class: 'alius-physics' }, h('div', {}, 'WHAT REACHES THE BODY'), h('button', {}, 'sniff'));
    const moment = card('m1');
    dockWith(['moment', moment], ['physics', idle]);
    expect(open(moment)).toBe(true);
    expect(open(idle)).toBe(false);
  });

  it('a button inside a collapsed card does its own action and does not open the card (review, declined item)', () => {
    const action = vi.fn();
    const task = h('section', { 'data-task': 't1' }, h('h3', {}, 'task', h('button', { type: 'button', 'data-x': '', onclick: action }, 'x')), h('p', {}, 'body'));
    const pun = card('p1');
    dockWith(['punishment', pun], ['task', task]);
    expect(open(task)).toBe(false);
    task.querySelector<HTMLButtonElement>('[data-x]')!.click();
    expect(action).toHaveBeenCalledOnce();
    expect(open(task)).toBe(false);
    task.querySelector('h3')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(open(task)).toBe(true);
  });

  it('set a card aside: it is hidden and counted ("1 waiting"); a click on the counter brings it back', () => {
    const pun = card('p1');
    const task = card('t1');
    const dock = dockWith(['punishment', pun], ['task', task]);
    pun.querySelector<HTMLButtonElement>('[data-set-aside]')!.click();
    expect(pun.hidden).toBe(true);
    expect(open(task)).toBe(true); // the next one opens
    const waiting = dock.element.querySelector<HTMLElement>('.alius-dock-waiting')!;
    expect(waiting.hidden).toBe(false);
    expect(waiting.textContent).toBe('1 waiting');
    waiting.click();
    expect(pun.hidden).toBe(false);
    expect(open(pun)).toBe(true);
    expect(waiting.hidden).toBe(true);
  });

  it('set-aside survives a redraw of the cards (new nodes, same id), is per scene and is forgotten by resetSceneStage', () => {
    const host = h('div');
    document.body.append(host);
    const dock = createDock(host, DOCK_SLOTS);
    dock.slot('task').append(card('t1'));
    dock.layout('sc1');
    dock.slot('task').querySelector<HTMLButtonElement>('[data-set-aside]')!.click();
    dock.slot('task').replaceChildren(card('t1')); // the draw function rebuilt its card
    dock.layout('sc1');
    expect((dock.slot('task').firstElementChild as HTMLElement).hidden).toBe(true);
    dock.layout('sc2'); // another scene: not set aside
    expect((dock.slot('task').firstElementChild as HTMLElement).hidden).toBe(false);
    dock.layout('sc1');
    expect((dock.slot('task').firstElementChild as HTMLElement).hidden).toBe(true);
    resetSceneStage();
    dock.layout('sc1');
    expect((dock.slot('task').firstElementChild as HTMLElement).hidden).toBe(false);
  });

  it('an empty dock draws nothing', () => {
    const dock = dockWith();
    expect(dock.element.querySelector('.alius-dock-waiting')!.hasAttribute('hidden')).toBe(true);
    expect(dock.element.querySelector('[data-set-aside]')).toBeNull();
  });

  it('the dock sits in the left 26 vw, never over her face (CSS)', () => {
    const css = readFileSync('css/62-stage.css', 'utf8');
    const rule = /\.alius-stage-dock \{([^}]*)\}/.exec(css)![1];
    expect(rule).toMatch(/left:\s*\d+px/);
    expect(rule).toMatch(/width:\s*min\(\d+px,\s*26vw\)/);
  });
});

describe('the dock on the scene screen', () => {
  function setup(...tags: string[]) {
    let state: CampaignState = campaign(reg, 4);
    setRelation(state, 'unit_ann', { stateId: 'confidant' });
    enable(state, 'pet_play', 'restraint', ...tags);
    const r = run(state, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: ['unit_ann'], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(r.events)).toEqual([]);
    state = r.state;
    const controller = { send: vi.fn(), propose: vi.fn(), answer: vi.fn(), end: vi.fn(), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(), transcript: () => [], onSwipe: vi.fn() } as unknown as SceneController;
    const host = h('div');
    document.body.append(host);
    const stopWord = vi.fn(() => []);
    const screen = renderSceneScreen(host, {
      controller, getState: () => state, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }),
      settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0 }), onEnded: vi.fn(),
      physics: {
        input: vi.fn(), endSegment: () => [], stopWord, skip: () => [], stimulus: () => [], act: () => [], finishCounted: () => [], cue: () => null, beat: () => 0, clock: () => ({ startedAt: null, beatMs: 1500, now: 0 }),
        keystroke: vi.fn(), typed: vi.fn(), onTap: vi.fn(),
      },
    });
    return { host, screen, stopWord, set: (s: CampaignState) => { state = s; screen.refresh(); }, state: () => state };
  }

  it('every card host is a slot of the dock, in the dock host at the left', () => {
    const t = setup();
    const dock = t.host.querySelector('.alius-stage-dock .alius-dock')!;
    expect([...dock.querySelectorAll<HTMLElement>('.alius-dock-slot')].map((s) => s.dataset.slot)).toEqual([...DOCK_SLOTS]);
    for (const [slot, legacy] of [['moment', 'alius-moment-host'], ['physics', 'alius-physics-host'], ['punishment', 'alius-punishment-cards'], ['task', 'alius-task-cards'], ['demonstration', 'alius-demonstration-cards'], ['milestone', 'alius-milestone-cards'], ['claim', 'alius-claim-cards'], ['return', 'alius-return-cards']]) {
      expect(dock.querySelector(`[data-slot="${slot}"]`)!.classList.contains(legacy), slot).toBe(true);
    }
  });

  it('the slap overlay keeps its full-screen host, the moment layer', () => {
    const t = setup();
    expect(t.host.querySelector('.alius-layer-moment .alius-slap-host')).not.toBeNull();
    expect(t.host.querySelector('.alius-dock .alius-slap-host')).toBeNull();
  });

  it('anything that holds the commander (a worn item, no run) shows the stop word as a pill at the dial, calling the same handler; the card has none (A1)', () => {
    const t = setup();
    expect(t.host.querySelector('[data-stop-word]')).toBeNull(); // nothing holds her: no pill
    const held = structuredClone(t.state());
    setBlocking(held, { registries: reg }, { person: COMMANDER, field: 'worn', value: 'paw_mitts' }, { at: 1, source: 'engine' });
    t.set(held);
    const pill = t.host.querySelector<HTMLElement>('.alius-stage-dial [data-stop-word]')!;
    expect(pill).not.toBeNull();
    expect(pill.getAttribute('data-analyze')).toBe('glossary:stop_word');
    expect(pill.textContent).toBe('STOP WORD');
    expect(t.host.querySelector('.alius-dock [data-action="stop-word"]')).toBeNull(); // the card draws no stop word of its own
    expect(t.host.querySelector('.alius-dock [data-slot="physics"] .alius-physics')).toBeNull(); // and with nothing else to offer, no card
    pill.click();
    expect(t.stopWord).toHaveBeenCalledTimes(1);
    t.set(held); // a redraw keeps the one pill
    expect(t.host.querySelectorAll('[data-stop-word]')).toHaveLength(1);
    // and it goes when nothing holds her
    const free = structuredClone(held);
    setBlocking(free, { registries: reg }, { person: COMMANDER, field: 'removed', value: 'paw_mitts' }, { at: 2, source: 'engine' });
    t.set(free);
    expect(t.host.querySelector('[data-stop-word]')).toBeNull();
  });

  it('a running hold: the card is a heading, its controls and its cue, with no stop word in it; the pill is at the dial (A1, V1)', () => {
    const t = setup('humiliation');
    const s = structuredClone(t.state());
    setBlocking(s, { registries: reg }, { person: COMMANDER, field: 'worn', value: 'ring_gag' }, { at: 1, source: 'engine' });
    expect(s.scene!.physics).toBeDefined();
    t.set(s);
    const card = t.host.querySelector<HTMLElement>('.alius-dock [data-slot="physics"] .alius-physics[data-run]')!;
    expect(card).not.toBeNull();
    expect((card.firstElementChild as HTMLElement).className).toBe('alius-scard-head'); // P10e-e Task 7: the fallback hold is a scene card (the kind `a hold`, no name)
    expect(card.querySelector('.alius-scard-kind')!.textContent).toBe('a hold');
    expect(card.querySelector('[data-action="tap"]')).not.toBeNull();
    expect(card.querySelector('[data-action="stop-word"]')).toBeNull();
    const pill = t.host.querySelector<HTMLElement>('.alius-stage-dial [data-stop-word]')!;
    expect(pill).not.toBeNull();
    pill.click();
    expect(t.stopWord).toHaveBeenCalledTimes(1);
    // set aside or collapsed, the pill stays
    card.querySelector<HTMLButtonElement>('[data-set-aside]')?.click();
    expect(t.host.querySelector('[data-stop-word]')).not.toBeNull();
  });
});

/** A scene card (cards.html) of hers: `id` as its `data-task`, its gist. */
const her = (id: string, gist = `${id} gist`) => {
  const el = sceneCard({ her: { unitId: 'unit_ann', name: 'Ann', accent: '#ff9ec7', hand: null }, kind: 'task', words: `words of ${id}`, conditions: [], answers: [], gist });
  el.setAttribute('data-task', id);
  return el;
};
/** The cards of the dock in the order they are seen (the slots are `display: contents`; the dock sets each card's CSS `order`). */
const seen = (dock: { element: HTMLElement }) => [...dock.element.querySelectorAll<HTMLElement>('.alius-dock-card')].filter((c) => !c.hidden)
  .sort((a, b) => Number(a.style.order) - Number(b.style.order)).map((c) => c.getAttribute('data-task'));

describe('collapsed cards are the edges of her hand (P10e-e Task 8, cards.html `render`)', () => {
  it('a collapsed card shows her name, its kind and its gist, never only the name', () => {
    const s = withService(world(reg, 'role'));
    s.practices = { ...blankPractices(), seq: 3, tasks: [
      { id: 'pt1', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'minor', check: 'model', proof: 'none', text: 'Bring the roster.', summary: 'bring the roster', status: 'offered', acceptForm: 'button_cost', day: 20, deadline: { day: 20, slot: 'evening' } },
      { id: 'pt2', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'major', check: 'model', proof: 'none', text: 'SECRET', summary: 'SECRET', status: 'offered', acceptForm: 'sealed', sealed: true, day: 20 },
      { id: 'pt3', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'minor', check: 'model', proof: 'none', text: 'Kneel.', summary: 'kneel', status: 'offered', acceptForm: 'button', day: 20 },
    ] } as never;
    const host = h('div');
    document.body.append(host);
    const dock = createDock(host, DOCK_SLOTS);
    drawTaskCards(dock.slot('task'), s, reg, () => true, { answer: vi.fn(), sign: vi.fn(), focusInput: vi.fn() }, { look: 'scene' });
    dock.layout('sc1');
    // drawn at once, the first in the slots' order counts as the newest (it opens); the commander opens the third
    dock.element.querySelector<HTMLElement>('[data-task="pt3"] .alius-scard-head')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const strip = dock.element.querySelector<HTMLElement>('[data-task="pt1"]')!;
    expect(strip.dataset.collapsed).toBe('true');
    const head = strip.querySelector<HTMLElement>('.alius-scard-head')!;
    expect(head.querySelector('.alius-scard-who')!.textContent).toBe('Ann');
    expect(head.querySelector('.alius-scard-kind')!.textContent).toBe('task');
    const gist = head.querySelector<HTMLElement>('.alius-scard-gist')!;
    expect(gist.textContent).toBe('bring the roster · this evening');
    expect(gist.querySelector('b')!.textContent).toBe('this evening'); // the value in her accent
    // a sealed strip: the envelope and nothing else of it
    const sealed = dock.element.querySelector<HTMLElement>('[data-task="pt2"]')!;
    expect(sealed.dataset.collapsed).toBe('true');
    expect(sealed.querySelector('.alius-scard-gist')!.textContent).toBe('✉');
    expect(sealed.outerHTML).not.toContain('SECRET');
  });

  it('newest on top, the open one below them (the open one is the newest unless the commander chose another)', () => {
    const host = h('div');
    document.body.append(host);
    const dock = createDock(host, DOCK_SLOTS);
    const slot = dock.slot('task');
    // they arrive one by one: c2, then c3, then c1 (the newest)
    slot.append(her('c2'));
    dock.layout('sc1');
    slot.append(her('c3'));
    dock.layout('sc1');
    slot.append(her('c1'));
    dock.layout('sc1');
    expect(seen(dock)).toEqual(['c3', 'c2', 'c1']);
    const at = (id: string) => slot.querySelector<HTMLElement>(`[data-task="${id}"]`)!;
    expect(at('c1').dataset.open).toBe('true');
    expect(at('c2').dataset.collapsed).toBe('true');
    expect(at('c3').dataset.collapsed).toBe('true');
    // a redraw (new nodes, the same cards) keeps the order
    slot.replaceChildren(her('c2'), her('c3'), her('c1'));
    dock.layout('sc1');
    expect(seen(dock)).toEqual(['c3', 'c2', 'c1']);
  });

  it('a click opens a strip; the open one becomes a strip (newest on top again)', () => {
    const host = h('div');
    document.body.append(host);
    const dock = createDock(host, DOCK_SLOTS);
    const slot = dock.slot('task');
    for (const id of ['c1', 'c2', 'c3']) { slot.append(her(id)); dock.layout('sc1'); }
    expect(seen(dock)).toEqual(['c2', 'c1', 'c3']);
    const at = (id: string) => slot.querySelector<HTMLElement>(`[data-task="${id}"]`)!;
    at('c1').querySelector<HTMLElement>('.alius-scard-head')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(at('c1').dataset.open).toBe('true');
    expect(at('c3').dataset.collapsed).toBe('true');
    expect(seen(dock)).toEqual(['c3', 'c2', 'c1']);
    // a new card arrives: it is the one open now
    slot.append(her('c4'));
    dock.layout('sc1');
    expect(at('c4').dataset.open).toBe('true');
    expect(seen(dock)).toEqual(['c3', 'c2', 'c1', 'c4']);
  });

  it('a card with a clock never collapses: drawn open after the open card (data-run or data-clock)', () => {
    const host = h('div');
    document.body.append(host);
    const dock = createDock(host, DOCK_SLOTS);
    const clock = her('k1');
    clock.setAttribute('data-clock', '');
    dock.slot('physics').append(clock);
    dock.layout('sc1');
    dock.slot('task').append(her('c1'), her('c2'));
    dock.layout('sc1');
    expect(clock.dataset.open).toBe('true');
    expect(seen(dock).at(-1)).toBe('k1');
    expect(dock.element.querySelectorAll('[data-open="true"]')).toHaveLength(2);
    expect(clock.querySelector('[data-set-aside]')).toBeNull(); // a clock is not set aside
  });
});

describe('cards arrive and sound (P10e-e Task 10, cards.html `addCard`, `render`, `answer`)', () => {
  function sounding(reduced = false) {
    const plays: Array<[string, { gain?: number; pan?: number }]> = [];
    const samples = { play: (file: string, o: { gain?: number; pan?: number } = {}) => { plays.push([file, o]); }, preload: async () => {} } as unknown as SampleSound;
    const host = h('div');
    document.body.append(host);
    const dock = createDock(host, DOCK_SLOTS, { samples: () => samples, reduced: () => reduced });
    return { dock, plays };
  }

  it('a new card arrives once: .is-arriving on its first draw only, never on a redraw; the cards of a scene as it opens are dealt quietly', () => {
    const { dock, plays } = sounding();
    const slot = dock.slot('task');
    slot.append(her('c1'));
    dock.layout('sc1'); // the scene opens with c1: dealt, no arrival
    expect(slot.querySelector('.is-arriving')).toBeNull();
    expect(plays).toEqual([]);
    slot.append(her('c2'));
    dock.layout('sc1');
    expect(slot.querySelector('[data-task="c2"]')!.classList.contains('is-arriving')).toBe(true);
    expect(slot.querySelector('[data-task="c1"]')!.classList.contains('is-arriving')).toBe(false);
    expect(plays).toHaveLength(1);
    expect(plays[0]![0]).toMatch(/^assets\/sounds\/ha\/card_slide[12]\.ogg$/);
    expect(plays[0]![1]).toMatchObject({ gain: 0.25, pan: -0.6 });
    slot.replaceChildren(her('c1'), her('c2')); // a redraw: new nodes, the same cards
    dock.layout('sc1');
    expect(slot.querySelector('.is-arriving')).toBeNull();
    expect(plays).toHaveLength(1);
  });

  it('none arrives with reduced motion (the sound stays)', () => {
    const { dock, plays } = sounding(true);
    dock.slot('task').append(her('c1'));
    dock.layout('sc1');
    dock.slot('task').append(her('c2'));
    dock.layout('sc1');
    expect(dock.element.querySelector('.is-arriving')).toBeNull();
    expect(plays).toHaveLength(1);
  });

  it('opening a strip plays card_slide at .18; an answer plays card_place at .25', () => {
    const { dock, plays } = sounding();
    const slot = dock.slot('task');
    slot.append(her('c1'), her('c2'));
    dock.layout('sc1');
    slot.querySelector<HTMLElement>('[data-task="c2"] .alius-scard-head')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(plays.at(-1)![0]).toMatch(/card_slide[12]\.ogg$/);
    expect(plays.at(-1)![1]).toMatchObject({ gain: 0.18, pan: -0.6 });
    const open = slot.querySelector<HTMLElement>('[data-task="c2"]')!;
    const answer = h('button', { type: 'button', class: 'alius-pill' }, h('span', {}, 'accept'));
    open.querySelector('.alius-scard-body')!.append(answer);
    answer.click();
    expect(plays.at(-1)![0]).toMatch(/card_place[12]\.ogg$/);
    expect(plays.at(-1)![1]).toMatchObject({ gain: 0.25, pan: -0.6 });
  });

  it('the sounds go through the sample layer: muted, nothing is made', async () => {
    const node = () => ({ connect: () => undefined, gain: { value: 1 }, frequency: { value: 0 }, Q: { value: 0 }, type: '' });
    const sources = vi.fn(() => ({ ...node(), playbackRate: { value: 1 }, start: vi.fn(), stop: vi.fn() }));
    const audio = vi.fn(() => ({ currentTime: 0, destination: {}, state: 'running', createGain: node, createBiquadFilter: node, createStereoPanner: node, createBufferSource: sources, decodeAudioData: async () => ({ duration: 1 }), close: async () => {} }));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })));
    const samples = createSamples({ settings: () => ({ ...DEFAULT_SETTINGS, soundMuted: true }), assetUrl: (p) => p, audio: audio as never });
    document.dispatchEvent(new Event('pointerdown'));
    const host = h('div');
    document.body.append(host);
    const dock = createDock(host, DOCK_SLOTS, { samples: () => samples, reduced: () => false });
    dock.slot('task').append(her('c1'));
    dock.layout('sc1');
    dock.slot('task').append(her('c2'));
    dock.layout('sc1');
    expect(dock.element.querySelector('.is-arriving')).not.toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(sources).not.toHaveBeenCalled(); // the dock asked for its sounds; muted, the layer started none
    samples.dispose();
    vi.unstubAllGlobals();
  });
});
