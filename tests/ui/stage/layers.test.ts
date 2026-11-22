// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import type { CampaignState } from '../../../src/engine/state/types';
import type { SceneController } from '../../../src/scene/sceneController';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import type { ChatMessage } from '../../../src/st/adapter';
import { FakeStAdapter } from '../../../src/st/fake';
import { createShell } from '../../../src/ui/shell/shell';
import { h } from '../../../src/ui/dom';
import { buildLayers } from '../../../src/ui/scene/stage/layers';
import { renderSceneScreen } from '../../../src/ui/scene/sceneScreen';
import { createCampaign } from '../../../src/engine/state/create';
import { campaign, errors, loadCore, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  document.body.innerHTML = '';
});
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
const msg = (index: number, over: Partial<ChatMessage> = {}): ChatMessage => ({ index, isUser: false, name: 'Ann', avatar: 'ann.png', text: 'hi', swipeId: 0, ...over });

function setup(participants: string[], messages: ChatMessage[] = []) {
  let state: CampaignState = campaign(reg, 4);
  const r = run(state, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants, origin: 'event', startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  state = r.state;
  const controller = {
    send: vi.fn(async () => true), propose: vi.fn(), answer: vi.fn(), end: vi.fn(async () => {}), edit: vi.fn(async () => {}), stop: vi.fn(),
    onEdited: vi.fn(), transcript: () => messages, onSwipe: vi.fn(), resume: vi.fn(), idle: vi.fn(), dispose: vi.fn(), start: vi.fn(),
  } as unknown as SceneController;
  const host = h('div');
  document.body.append(host);
  const screen = renderSceneScreen(host, {
    controller, getState: () => state, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }),
    settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0 }), onEnded: vi.fn(),
  });
  return { host, screen, root: () => host.querySelector<HTMLElement>('.alius-scene')! };
}

describe('the stage layers (P10e)', () => {
  it('buildLayers: the layers in back-to-front order, each full-frame, with the UI hosts in the ui layer', () => {
    const root = h('div');
    const layers = buildLayers(root);
    expect([...root.children].map((c) => c.className.replace(/^alius-layer alius-layer-/, '').split(' ')[0])).toEqual(
      ['backdrop', 'ascii', 'frame', 'pose', 'sprites', 'effects', 'ui', 'moment', 'curtain'],
    );
    expect(root.dataset.stage).toBe('frame');
    for (const k of ['backdrop', 'ascii', 'frame', 'pose', 'sprites', 'effects', 'ui', 'moment', 'curtain'] as const) {
      expect(layers[k]).toBe(root.querySelector(`.alius-layer-${k}`));
      expect(layers[k].classList.contains('alius-layer')).toBe(true);
    }
    expect(layers.root).toBe(root);
    // the UI hosts, in reading order
    expect([...layers.ui.children].map((c) => c.className)).toEqual(
      ['alius-stage-topline', 'alius-stage-status', 'alius-stage-reply', 'alius-stage-chips', 'alius-stage-input', 'alius-stage-dock', 'alius-stage-dial'],
    );
    expect(Object.keys(layers.hosts)).toEqual(['topLine', 'status', 'reply', 'chipRow', 'input', 'dock', 'dial']);
  });

  it('the scene builds on layers: sprites and backdrop have their layer, the old column hosts are gone', () => {
    const t = setup([ANN], [msg(0)]);
    const root = t.root();
    expect(root.dataset.stage).toBe('frame');
    expect(root.querySelector('.alius-layer-sprites .alius-sprite')).not.toBeNull();
    expect(root.querySelector('.alius-layer-backdrop')).not.toBeNull();
    expect(root.querySelector('.alius-layer-ascii pre.alius-ascii')).not.toBeNull(); // the ASCII stage while a picture loads
    expect(root.querySelector('.alius-stage')).toBeNull();
    expect(root.querySelector('.alius-cmd')).toBeNull();
    expect(root.dataset.backdrop).toBe('ascii'); // the P10c attributes are as before
  });

  it('one, two, three women: left / centre / right as before, and the speaker is marked', () => {
    const cls = (t: ReturnType<typeof setup>) => [...t.host.querySelectorAll('.alius-layer-sprites .alius-sprite')].map((e) => [...e.classList].filter((c) => c.startsWith('pos-')).join(' '));
    expect(cls(setup([ANN], [msg(0)]))).toEqual(['pos-center']);
    document.body.innerHTML = '';
    expect(cls(setup([ANN, BEA], [msg(0)]))).toEqual(['pos-left', 'pos-right']);
    document.body.innerHTML = '';
    const three = setup([ANN, BEA, CAT], [msg(0), msg(1, { name: 'Bea', avatar: 'bea.png' })]);
    expect(cls(three)).toEqual(['pos-left', 'pos-center', 'pos-right']);
    expect([...three.host.querySelectorAll('.alius-sprite')].map((e) => e.classList.contains('is-speaking'))).toEqual([false, true, false]);
  });

  it('the shell marks the screen, so the ASCII frame can give way to the scene', () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const state = createCampaign({ seed: 1, commanderName: 'Vale' });
    const shell = createShell({ st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }) });
    shell.registerScreen('scene', (host) => host.append(h('div', { class: 'alius-scene' })));
    shell.open();
    expect(document.getElementById('alius-shell')!.dataset.screen).not.toBe('scene');
    shell.showScreen('scene');
    expect(document.getElementById('alius-shell')!.dataset.screen).toBe('scene');
    shell.showScreen('hub');
    expect(document.getElementById('alius-shell')!.dataset.screen).toBe('hub');
    shell.destroy();
  });
});
