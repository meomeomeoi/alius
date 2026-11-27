// @vitest-environment jsdom
/**
 * P16b Task 26 (gate G3): the craft's cards and `[ANTICIPATE]` in the real scene screen: the cards land in the dock's `craft` slot, the chip in the chip row's `anticipate` slot; begin and the
 * chip are staged like a chip (`craft/drill_start`, `craft/anticipate`, with the chat index the scene gives them), and her answer to an anticipation is written in her hand.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import type { Action } from '../../../src/engine/dispatch';
import type { CampaignState } from '../../../src/engine/state/types';
import type { SceneController } from '../../../src/scene/sceneController';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { h } from '../../../src/ui/dom';
import { renderSceneScreen } from '../../../src/ui/scene/sceneScreen';
import { resetSceneStage } from '../../../src/ui/scene/stage';
import { errors, loadCore, run } from '../../helpers/world';
import { ANN, unitOf, world } from '../../engine/practice/world';
import '../../../src/engine/actions/scene';
import '../../../src/engine/actions/craft';

const shown = vi.hoisted(() => ({ on: false }));
vi.mock('../../../src/engine/craft/anticipate', async (orig) => ({ ...(await orig<typeof import('../../../src/engine/craft/anticipate')>()), anticipateShown: () => shown.on }));

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
beforeEach(() => { vi.useFakeTimers(); shown.on = false; });
afterEach(() => { vi.useRealTimers(); resetSceneStage(); document.body.innerHTML = ''; });

function open(): CampaignState {
  const w = world(reg, 'play');
  unitOf(w, ANN).bond!.practice!.style = { primary: 'ritual' } as never;
  const r = run(w, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}

function draw(state: CampaignState, onStage: (a: Action) => void) {
  const controller = {
    send: vi.fn(() => new Promise<boolean>(() => {})), propose: vi.fn(), answer: vi.fn(), end: vi.fn(), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(),
    transcript: () => [], onSwipe: vi.fn(), rerollState: () => ({ enabled: true, reason: '' }), rerollLast: vi.fn(), stage: vi.fn(() => []),
  } as unknown as SceneController;
  const host = h('div');
  document.body.append(host);
  renderSceneScreen(host, {
    controller, getState: () => state, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }),
    settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0 }), onEnded: vi.fn(), onStage: (a) => { onStage(a); return []; },
  });
  return { host, q: (s: string) => host.querySelector<HTMLElement>(s) };
}

describe('the craft in the scene screen', () => {
  it('a drill waiting lands in the dock\'s craft slot; begin stages craft/drill_start for her', () => {
    const s = open();
    s.relations[ANN]!.craft = { drillPending: { key: 'endurance:weight', mult: 1.5, day: s.day } };
    const staged: Action[] = [];
    const t = draw(s, (a) => staged.push(a));
    const card = t.q('.alius-dock-slot[data-slot="craft"] [data-scard-kind="drill"]');
    expect(card).not.toBeNull();
    t.q('[data-craft-answer="begin"]')!.click();
    expect(staged).toEqual([{ type: 'craft/drill_start', payload: { unitId: ANN } }]);
  });

  it('[ANTICIPATE] is a chip in the chip row\'s anticipate slot, shown only while the engine allows it; a click stages craft/anticipate', () => {
    const s = open();
    const staged: Action[] = [];
    const none = draw(s, () => {});
    expect(none.q('.alius-chip-slot[data-slot="anticipate"] [data-craft-anticipate]')).toBeNull();
    document.body.innerHTML = '';
    shown.on = true;
    const t = draw(s, (a) => staged.push(a));
    const chip = t.q('.alius-chip-slot[data-slot="anticipate"] [data-craft-anticipate]')!;
    expect(chip.textContent).toBe('anticipate her');
    chip.click();
    expect(staged).toEqual([{ type: 'craft/anticipate', payload: { unitId: ANN } }]);
  });
});
