// @vitest-environment jsdom
/**
 * P10e: nothing the scene offers today is lost. The table of spec §12a.5 as data: each host of the old column is found in its new place,
 * for a state where the hosts that can be filled with the helpers of the other suites have content.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { fireMoment } from '../../../src/engine/moments/fire';
import { blankPractices } from '../../../src/engine/practice/state';
import type { CampaignState } from '../../../src/engine/state/types';
import type { SceneController } from '../../../src/scene/sceneController';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import type { ChatMessage } from '../../../src/st/adapter';
import { FakeStAdapter } from '../../../src/st/fake';
import { h } from '../../../src/ui/dom';
import { renderSceneScreen, type SceneScreen } from '../../../src/ui/scene/sceneScreen';
import { resetSceneStage } from '../../../src/ui/scene/stage';
import { enable } from '../../helpers/bonds';
import { errors, loadCore, run } from '../../helpers/world';
import { setRelation } from '../../helpers/loyalty';
import { ANN, unitOf, withService, world } from '../../engine/practice/world';
import '../../../src/engine/actions/blocking';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  resetSceneStage();
  resetBlockingHooks();
});

const msg = (index: number, over: Partial<ChatMessage> = {}): ChatMessage => ({ index, isUser: false, name: 'Ann', avatar: 'ann.png', text: 'hi', swipeId: 0, ...over });

/** Ann holds at role and keeps named postures; the scene is in the commander's quarters; mitts hold; a moment, a milestone, a task, a punishment and a call are open. */
function fixture(): CampaignState {
  registerFrameReader(() => 'play');
  const base = withService(world(reg, 'play'));
  unitOf(base, ANN).bond!.practice!.style = { primary: 'ritual' };
  setRelation(base, ANN, { stateId: 'confidant' });
  enable(base, 'pet_play', 'restraint');
  const r = run(base, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  const s = r.state;
  setBlocking(s, { registries: reg }, { person: COMMANDER, field: 'worn', value: 'paw_mitts' }, { at: 1, source: 'engine' });
  fireMoment(s, { registries: reg }, 'third_party', ANN);
  s.dynamic!.open.milestones.push({ id: 'dm1', unitId: ANN, milestoneId: 'handover', day: s.day, form: 'scene' });
  s.practices = {
    ...blankPractices(), seq: 9,
    tasks: [{ id: 'pt1', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'minor', check: 'model', proof: 'none', text: 'Bring the roster.', summary: 'bring the roster', status: 'offered', acceptForm: 'button_cost', day: s.day }],
    punishments: [{ id: 'pp1', holderId: ANN, entryId: 'no_messages', severity: 2, offence: { kind: 'task_broken', stakes: 'major', day: s.day }, text: 'A day without messages.', summary: 'a day without messages', status: 'offered', day: s.day }],
    postures: { [ANN]: [{ postureId: 'kneeling_upright', name: 'Down', day: s.day }] },
    call: { id: 'pc1', holderId: ANN, postureId: 'kneeling_upright', sceneId: s.scene!.id, at: 3 },
  } as never;
  return s;
}

function draw(state: CampaignState) {
  const messages: ChatMessage[] = [msg(0, { isUser: true, name: 'Vale', avatar: undefined, text: 'Hello' }), msg(1, { text: 'Hi, *you*.', swipeCount: 2 })];
  const controller = {
    send: vi.fn(() => new Promise<boolean>(() => {})), propose: vi.fn(), answer: vi.fn(), end: vi.fn(), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(),
    transcript: () => messages, onSwipe: vi.fn(), rerollState: () => ({ enabled: true, reason: '' }), rerollLast: vi.fn(), stage: vi.fn(),
  } as unknown as SceneController;
  const host = h('div');
  document.body.append(host);
  const noop = (): [] => [];
  const screen: SceneScreen = renderSceneScreen(host, {
    controller, getState: () => state, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }),
    settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0 }), onEnded: vi.fn(), onClose: vi.fn(), onOrder: () => false,
    onPunish: vi.fn(), onUndoDiscipline: vi.fn(), onSlap: vi.fn(), onPastime: vi.fn(),
    onAnswerTask: vi.fn(), onAnswerPunishment: vi.fn(), onAnswerMilestone: vi.fn(), onTakeInstead: vi.fn(), onUndoPunishment: vi.fn(), onCeremonyStep: vi.fn(),
    generation: { records: () => [], retry: vi.fn(), drop: vi.fn(), reroll: vi.fn() } as never,
    physics: { input: noop, endSegment: noop, stopWord: noop, skip: noop, stimulus: noop, act: noop, finishCounted: noop, cue: () => null, beat: () => 0, clock: () => ({ startedAt: null, beatMs: 1500, now: 0 }), keystroke: vi.fn(), typed: vi.fn(), onTap: vi.fn() },
  });
  return { host, screen };
}

/** [today's host, where it is now]: every row of spec §12a.5, as selectors. */
const PLACES: Array<[string, string]> = [
  ['header: the place', '.alius-stage-topline .alius-topline-place'],
  ['header: day, slot, mode', '.alius-stage-topline .alius-topline-when'],
  ['header: swipe left', '.alius-stage-topline .alius-scene-tools [data-action="swipe-left"]'],
  ['header: regenerate', '.alius-stage-topline .alius-scene-tools [data-action="regenerate"]'],
  ['header: swipe right', '.alius-stage-topline .alius-scene-tools [data-action="swipe-right"]'],
  ['header: end', '.alius-stage-topline .alius-scene-tools [data-action="end"]'],
  ['header: P14 reroll tools', '.alius-stage-topline .alius-scene-tools .alius-scene-reroll'],
  ['HUD', '.alius-stage-topline .alius-hud .alius-hud-unit[data-unit="unit_ann"]'],
  ['transcript: the last reply', '.alius-stage-reply .alius-reply .alius-reply-line[data-index="1"]'],
  ['generation chips', '.alius-stage-chips [data-slot="generation"] .alius-generation-chips'],
  ['proposal chips', '.alius-stage-chips [data-slot="proposals"] .alius-chips'],
  ['lead and frame chips', '.alius-stage-chips [data-slot="lead"] .alius-lead-host'],
  ['offer surface (offer and initiative)', '.alius-stage-chips [data-slot="offer"] .alius-offer-surface'],
  ['rule chips', '.alius-stage-chips [data-slot="rules"] .alius-discipline-chips'],
  ['demand chips', '.alius-stage-chips [data-slot="demands"] .alius-discipline-chips'],
  ['discipline chips', '.alius-stage-chips [data-slot="discipline"] .alius-discipline-chips'],
  ['discipline menu of a woman', '.alius-stage-chips [data-slot="discipline-menus"] [data-discipline-chip="unit_ann"] details[data-discipline-menu]'],
  ['frequency chips', '.alius-stage-chips [data-slot="freq"] .alius-freq-chips'],
  ['pastime menu', '.alius-stage-chips [data-slot="lets"] .alius-lets-host'],
  ['blocking strip: the dial', '.alius-stage-dial .alius-dial [data-dial-open]'],
  ['blocking strip: its moves and its menu', '.alius-stage-dial .alius-dial-fan [data-move="kneel"]'],
  ['blocking strip: the commander\'s row (what is worn)', '.alius-stage-dial .alius-dial-fan .alius-dial-now .alius-blocking-row[data-person="commander"] .alius-chip[data-analyze="blockingItems:paw_mitts"]'],
  ['blocking strip: the × that takes an item off', '.alius-stage-dial .alius-dial-fan .alius-dial-now [data-action="remove"][data-id="paw_mitts"]'],
  ['moment card', '.alius-stage-dock [data-slot="moment"] [data-moment]'],
  ['milestone card', '.alius-stage-dock [data-slot="milestone"] [data-milestone]'],
  ['task card', '.alius-stage-dock [data-slot="task"] [data-task]'],
  ['punishment card', '.alius-stage-dock [data-slot="punishment"] [data-punishment]'],
  ['posture call (P10e-e Task 9: a full-frame moment in the moment layer)', '.alius-layer-moment .alius-posture-call-host .alius-call[data-call="pc1"] [data-posture-choice]'],
  // her call is open in this fixture: the pill is lifted above the call's fan, as it is (review of e2, I1); it is at the dial otherwise (dock.test)
  ['physics stop word: the pill, lifted above her call (A1, review I1)', '.alius-layer-moment .alius-stop-lift .alius-stop-host button.alius-stop-pill[data-stop-word][data-analyze="glossary:stop_word"]'],
  ['claim cards', '.alius-stage-dock [data-slot="claim"]'],
  ['return cards', '.alius-stage-dock [data-slot="return"]'],
  ['demonstration cards', '.alius-stage-dock [data-slot="demonstration"]'],
  ['slap host (full-screen overlay)', '.alius-layer-moment .alius-slap-host'],
  ['CMD line: the input', '.alius-stage-input input[name="cmd"]'],
  ['CMD line: ORDER', '.alius-stage-input [data-action="order"]'],
  ['CMD line: PROPOSE', '.alius-stage-input select[name="propose"]'],
];

describe('every host of the old column is in its new place (spec §12a.5)', () => {
  it.each(PLACES)('%s', (_what, selector) => {
    const t = draw(fixture());
    expect(t.host.querySelector(selector), selector).not.toBeNull();
  });

  it('the status line: the pacing banner and the busy indicator', () => {
    const t = draw(fixture());
    t.screen.handle({ type: 'pacing' });
    expect(t.host.querySelector('.alius-stage-status .alius-pacing')!.textContent).toContain('TIME IS PASSING');
    const input = t.host.querySelector<HTMLInputElement>('input[name="cmd"]')!;
    input.value = 'Go';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(t.host.querySelector('.alius-stage-status .alius-busy')!.textContent).toMatch(/AWAITING REPLY/);
  });

  it('the device-out note is a flash over the frame, not a standing line', () => {
    const t = draw(fixture());
    expect(t.host.querySelector('[data-analyze="glossary:device_out_of_reach"]')).toBeNull();
    t.screen.flashDeviceOut();
    expect(t.host.querySelector('.alius-layer-moment [data-flash][data-analyze="glossary:device_out_of_reach"]')).not.toBeNull();
  });

  it('the whole transcript is in the curtain; the dock moves right of it while it is open (CSS), the cards stay in the dock', () => {
    const t = draw(fixture());
    t.host.querySelector<HTMLElement>('[data-action="history"]')!.click();
    expect(t.host.querySelectorAll('.alius-curtain .alius-line')).toHaveLength(2);
    expect(t.host.querySelector('.alius-stage-dock [data-slot="task"] [data-task]')).not.toBeNull();
  });

  it('the held strip, the alarm card and the wake card stay where they are (plan R1: shell host and modals)', () => {
    const t = draw(fixture());
    expect(t.host.querySelector('.alius-held-host')).toBeNull(); // the scene screen draws none: the shell's element shows over every screen
    expect(t.host.querySelector('.alius-stage-dock .alius-alarm-card, .alius-stage-dock .alius-wake-card')).toBeNull();
  });
});
