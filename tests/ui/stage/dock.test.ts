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
import { campaign, errors, loadCore, run, setRelation } from '../../helpers/loyalty';
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
    expect(DOCK_SLOTS).toEqual(['moment', 'posture-call', 'physics', 'punishment', 'task', 'demonstration', 'milestone', 'claim', 'return']);
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
  function setup() {
    let state: CampaignState = campaign(reg, 4);
    setRelation(state, 'unit_ann', { stateId: 'confidant' });
    enable(state, 'pet_play', 'restraint');
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
        input: vi.fn(), endSegment: () => [], stopWord, skip: () => [], stimulus: () => [], act: () => [], finishCounted: () => [], cue: () => null, beat: () => 0,
        keystroke: vi.fn(), typed: vi.fn(), onTap: vi.fn(),
      },
    });
    return { host, screen, stopWord, set: (s: CampaignState) => { state = s; screen.refresh(); }, state: () => state };
  }

  it('every card host is a slot of the dock, in the dock host at the left', () => {
    const t = setup();
    const dock = t.host.querySelector('.alius-stage-dock .alius-dock')!;
    expect([...dock.querySelectorAll<HTMLElement>('.alius-dock-slot')].map((s) => s.dataset.slot)).toEqual([...DOCK_SLOTS]);
    for (const [slot, legacy] of [['moment', 'alius-moment-host'], ['posture-call', 'alius-posture-call-host'], ['physics', 'alius-physics-host'], ['punishment', 'alius-punishment-cards'], ['task', 'alius-task-cards'], ['demonstration', 'alius-demonstration-cards'], ['milestone', 'alius-milestone-cards'], ['claim', 'alius-claim-cards'], ['return', 'alius-return-cards']]) {
      expect(dock.querySelector(`[data-slot="${slot}"]`)!.classList.contains(legacy), slot).toBe(true);
    }
  });

  it('the slap overlay keeps its full-screen host, the moment layer', () => {
    const t = setup();
    expect(t.host.querySelector('.alius-layer-moment .alius-slap-host')).not.toBeNull();
    expect(t.host.querySelector('.alius-dock .alius-slap-host')).toBeNull();
  });

  it('something holds the commander: the panel is a card of the dock and its stop word is mirrored in the chip row, calling the same handler', () => {
    const t = setup();
    expect(t.host.querySelector('[data-stop-word]')).toBeNull(); // nothing holds her: no panel, no mirror
    const held = structuredClone(t.state());
    setBlocking(held, { registries: reg }, { person: COMMANDER, field: 'worn', value: 'paw_mitts' }, { at: 1, source: 'engine' });
    t.set(held);
    const panelStop = t.host.querySelector<HTMLElement>('.alius-dock [data-slot="physics"] [data-action="stop-word"]')!;
    expect(panelStop).not.toBeNull();
    const mirror = t.host.querySelector<HTMLElement>('.alius-chip-slot[data-slot="stop"] [data-stop-word]')!;
    expect(mirror).not.toBeNull();
    expect(mirror.getAttribute('data-analyze')).toBe('glossary:stop_word');
    mirror.click();
    expect(t.stopWord).toHaveBeenCalledTimes(1);
    panelStop.click();
    expect(t.stopWord).toHaveBeenCalledTimes(2);
    // it stays when the panel card is collapsed or set aside
    const panelCard = t.host.querySelector<HTMLElement>('.alius-dock [data-slot="physics"] > *')!;
    panelCard.querySelector<HTMLButtonElement>('[data-set-aside]')?.click();
    t.set(held);
    expect(t.host.querySelector('.alius-chip-slot[data-slot="stop"] [data-stop-word]')).not.toBeNull();
    // and goes when nothing holds her
    const free = structuredClone(held);
    setBlocking(free, { registries: reg }, { person: COMMANDER, field: 'removed', value: 'paw_mitts' }, { at: 2, source: 'engine' });
    t.set(free);
    expect(t.host.querySelector('[data-stop-word]')).toBeNull();
  });
});
