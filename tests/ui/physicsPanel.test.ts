// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerBlockingProviders } from '../../src/analysis/providers/blocking';
import { createStaging } from '../../src/blocking/controller';
import type { Registries } from '../../src/content/types';
import type { Action } from '../../src/engine/dispatch';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../src/engine/blocking';
import { trainEndurance } from '../../src/engine/physics/skill';
import type { SegmentInput } from '../../src/engine/physics/state';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../src/settings';
import { renderCmdrCard } from '../../src/ui/commander/cmdrCard';
import { h } from '../../src/ui/dom';
import { panelBeat, renderPhysicsPanel, type PhysicsPanelStaging } from '../../src/ui/scene/physicsPanel';
import { analyze, markedWithout, unreachable, unresolved } from '../helpers/analyzeCoverage';
import { enable } from '../helpers/bonds';
import { campaign, errors, loadCore, run, setRelation } from '../helpers/loyalty';
import '../../src/engine/actions/blocking';
import '../../src/engine/actions/physics';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerBlockingProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
  resetBlockingHooks();
});

const ANN = 'unit_ann';
const ON = ['worship', 'restraint', 'service', 'objectification', 'humiliation'];

function hold(contact = 'smothered_armpit', over: { segment?: 'running' | 'held'; gauge?: number } = {}): CampaignState {
  registerFrameReader(() => 'play');
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, ...ON);
  const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  setBlocking(st, { registries: reg }, { person: ANN, field: 'contact', value: contact, with: COMMANDER }, { at: 3, source: 'chip' });
  if ((over.segment ?? 'running') === 'running') {
    const r = run(st, reg, { type: 'physics/next_segment', payload: { runId: 'p1' } });
    expect(errors(r.events)).toEqual([]);
    if (over.gauge !== undefined) r.state.scene!.physics!.gauge = over.gauge;
    return r.state;
  }
  if (over.gauge !== undefined) st.scene!.physics!.gauge = over.gauge;
  return st;
}
const settings = (over: Partial<AliusSettings> = {}): AliusSettings => ({ ...DEFAULT_SETTINGS, ...over });
const fake = () => {
  const calls: Array<[string, unknown]> = [];
  const staging: PhysicsPanelStaging = {
    input: (i) => { calls.push(['input', i]); },
    endSegment: () => { calls.push(['end', null]); return []; },
    stopWord: () => { calls.push(['stop', null]); return []; },
    skip: (st) => { calls.push(['skip', st]); return []; },
    stimulus: (way, kind, depth) => { calls.push(['stimulus', { way, kind, depth }]); return []; },
    act: (kind) => { calls.push(['act', kind]); return []; },
    finishCounted: (n) => { calls.push(['count', n]); return []; },
    cue: (kind) => `[${kind}]`,
    beat: () => 0,
  };
  return { calls, staging };
};
function draw(state: CampaignState | null, over: { settings?: Partial<AliusSettings>; staging?: PhysicsPanelStaging; onTap?: () => void } = {}) {
  const host = h('div');
  document.body.append(host);
  const f = fake();
  const onTap = over.onTap ?? vi.fn();
  const render = (s: CampaignState | null = state) => renderPhysicsPanel(host, { state: s, registries: reg, settings: settings(over.settings), staging: over.staging ?? f.staging, onTap });
  render();
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => host.querySelector<T>(sel);
  const qa = <T extends HTMLElement = HTMLElement>(sel: string) => [...host.querySelectorAll<T>(sel)];
  return { host, render, q, qa, calls: f.calls, onTap };
}
const texts = (qa: HTMLElement[]) => qa.map((e) => e.textContent);
const env = (state: CampaignState | null) => ({ registries: reg, state, settings: DEFAULT_SETTINGS });

describe('the physics panel', () => {
  it('is absent without a run, without a scene and while the blocking is not live', () => {
    expect(draw(null).host.innerHTML).toBe('');
    const s = hold('footrest'); // a weight hold exposes nothing to breathe in
    delete s.scene!.physics;
    expect(draw(s).qa('button').map((b) => b.textContent)).toEqual(['[ STOP WORD ]']); // the contact is still there: only the way out
    delete s.scene!.blocking; // nothing holds the commander
    expect(draw(s).host.innerHTML).toBe('');
    const far = hold();
    far.relations[ANN]!.stateId = 'comrade';
    expect(draw(far).host.innerHTML).toBe('');
  });

  it('turn-based: one button per input of the interaction, the relief inputs, the tap and the stop word', () => {
    const v = draw(hold('smothered_armpit')); // breath: timing, a seal that may leak
    const labels = texts(v.qa('button.alius-option'));
    expect(labels).toEqual(expect.arrayContaining(['[ BREATHE ]', '[ WAIT ]', '[ TAP ]', '[ STOP WORD ]']));
    const weight = draw(hold('footrest'));
    expect(texts(weight.qa('button.alius-option'))).toEqual(expect.arrayContaining(['[ HOLD STILL ]', '[ SHIFT HER WEIGHT BACK ]', '[ WAIT ]']));
    const tongue = draw(hold('boot_worship'));
    expect(texts(tongue.qa('button.alius-option'))).toEqual(expect.arrayContaining(['[ TOES ]', '[ ARCH ]', '[ HEEL ]', '[ SOLE ]']));
    const jaw = draw((() => { const s = hold('sole_to_mouth'); return s; })());
    expect(texts(jaw.qa('button.alius-option'))).toContain('[ ASK FOR A REST ]');
    for (const w of [v, weight, tongue, jaw]) expect(w.host.innerHTML).not.toMatch(/\b(he|him|his)\b/i);
  });

  it('the panel says which beat the next press lands on (turn-based), so a typed message lapses from there (review I2)', () => {
    const v = draw(hold('footrest'));
    expect(panelBeat(v.host)).toBe(0);
    v.qa('button.alius-option').find((b) => b.textContent === '[ HOLD STILL ]')!.click();
    expect(panelBeat(v.host)).toBe(1);
    v.render();
    v.qa('button.alius-option').find((b) => b.textContent === '[ WAIT ]')!.click();
    expect(panelBeat(v.host)).toBe(2);
    expect(panelBeat(document.createElement('div'))).toBe(0); // no panel: the start
  });

  it('a leaky seal offers breathing through the gap; a tight one does not', () => {
    const s = hold('smothered_armpit');
    s.scene!.physics!.seal = 'leaky';
    expect(texts(draw(s).qa('button.alius-option'))).toContain('[ BREATHE THROUGH THE GAP ]');
    s.scene!.physics!.seal = 'tight';
    expect(texts(draw(s).qa('button.alius-option'))).not.toContain('[ BREATHE THROUGH THE GAP ]');
  });

  it('turn-based buttons stage nothing and dispatch segment_end after four beats (physics is not staged)', () => {
    const state = hold('footrest');
    const v = draw(state);
    const press = (text: string) => { v.render(); v.qa('button.alius-option').find((b) => b.textContent === text)!.click(); };
    press('[ HOLD STILL ]');
    press('[ WAIT ]');
    press('[ SHIFT HER WEIGHT BACK ]');
    expect(v.calls).toEqual([['input', { beat: 0, kind: 'hold' }], ['input', { beat: 2, kind: 'shift_weight' }]]); // a wait is a beat with no input
    press('[ HOLD STILL ]');
    expect(v.calls.at(-1)).toEqual(['end', null]);
    expect(v.calls.filter(([k]) => k === 'end')).toHaveLength(1);
    press('[ HOLD STILL ]'); // the pointer starts again for the next segment
    expect(v.calls.at(-1)).toEqual(['input', { beat: 0, kind: 'hold' }]);
  });

  it('shows her cue for the beat about to be played, and a line while the body is held', () => {
    const v = draw(hold('footrest'));
    const plan = hold('footrest').scene!.physics!.segment.plan!;
    const cue = plan.beats[0]!.cue;
    expect(v.q('.alius-physics-cue')?.textContent ?? '').toBe(cue === undefined ? '' : `[${cue}]`);
    const held = draw(hold('footrest', { segment: 'held' }));
    expect(held.q('.alius-physics-held')!.textContent).toBe('She takes her time.');
    expect(held.qa('button.alius-option').map((b) => b.textContent)).toEqual(['[ TAP ]', '[ STOP WORD ]']); // nothing to do while it waits
  });

  it('the tap goes to the engine, not through the chip path', () => {
    const v = draw(hold('footrest'));
    v.qa('button').find((b) => b.textContent === '[ TAP ]')!.click();
    expect(v.onTap).toHaveBeenCalledTimes(1);
    expect(v.calls).toEqual([]);
  });

  it('the stop word is always present and enabled: running, held, real time and turn-based', () => {
    for (const segment of ['running', 'held'] as const) {
      for (const realtime of [false, true]) {
        const v = draw(hold('smothered_armpit', { segment }), { settings: { physicsRealtime: realtime } });
        const btn = v.qa('button').find((b) => b.textContent === '[ STOP WORD ]')!;
        expect(btn, `${segment} ${realtime}`).toBeDefined();
        expect(btn.hasAttribute('disabled')).toBe(false);
        expect(btn.getAttribute('aria-disabled')).toBeNull();
        btn.click();
        expect(v.calls.at(-1)).toEqual(['stop', null]);
      }
    }
  });

  it('the stop word is there with only something worn, or a contact with no physics, and nowhere with nothing (review)', () => {
    registerFrameReader(() => 'play');
    const base = campaign(reg, 4);
    setRelation(base, ANN, { stateId: 'confidant' });
    enable(base, ...ON);
    const open = run(base, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
    const stopOf = (s: CampaignState) => draw(s).qa('button').filter((b) => b.textContent === '[ STOP WORD ]');
    expect(stopOf(open)).toHaveLength(0);
    const hooded = structuredClone(open);
    setBlocking(hooded, { registries: reg }, { person: COMMANDER, field: 'worn', value: 'hood' }, { at: 3, source: 'chip' });
    expect(hooded.scene!.physics).toBeUndefined();
    const v = draw(hooded);
    const btn = v.qa('button').find((b) => b.textContent === '[ STOP WORD ]')!;
    expect(btn).toBeDefined();
    btn.click();
    expect(v.calls.at(-1)).toEqual(['stop', null]);
    expect(markedWithout(v.host)).toEqual([]);
    expect(unresolved(v.host, env(hooded))).toEqual([]);
    const hands = structuredClone(open);
    setBlocking(hands, { registries: reg }, { person: ANN, field: 'contact', value: 'holding_hands', with: COMMANDER, direction: 'from' }, { at: 3, source: 'chip' });
    expect(stopOf(hands)).toHaveLength(1);
  });

  it('real time: a press registers its input at the beat now; Space is the main input', () => {
    const f = fake();
    f.staging.beat = () => 3;
    const state = hold('footrest');
    state.settings.physicsRealtime = true;
    const v = draw(state, { staging: f.staging, settings: { physicsRealtime: true } });
    v.qa('button.alius-option').find((b) => b.textContent === '[ HOLD STILL ]')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(f.calls).toEqual([['input', { beat: 3, kind: 'hold' }]]);
    v.host.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(f.calls.at(-1)).toEqual(['input', { beat: 3, kind: 'hold' }]);
    const field = h('input', { type: 'text' });
    v.host.append(field);
    field.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(f.calls).toHaveLength(2); // a space typed in a text field is a space
  });
});

describe('Space reaches the panel from the page (review I9)', () => {
  const press = (target: EventTarget = document.body, key = ' ') => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

  it('a key press anywhere on the page (the host is not focusable) registers the main input in real time', () => {
    const f = fake();
    f.staging.beat = () => 2;
    const state = hold('footrest');
    state.settings.physicsRealtime = true;
    const v = draw(state, { staging: f.staging, settings: { physicsRealtime: true } });
    press();
    expect(f.calls).toEqual([['input', { beat: 2, kind: 'hold' }]]);
    press(document.body, 'a');
    expect(f.calls).toHaveLength(1); // only Space
    const field = h('input', { type: 'text' });
    document.body.append(field);
    press(field);
    expect(f.calls).toHaveLength(1); // a space typed in a text field is a space
    v.render(null); // the hold ended: the listener goes with the panel
    press();
    expect(f.calls).toHaveLength(1);
  });

  it('reads the mode when the key is pressed: a panel redrawn turn-based takes Space as one beat, not a held input', () => {
    const f = fake();
    f.staging.beat = () => 0;
    const state = hold('footrest');
    const v = draw(state, { staging: f.staging, settings: { physicsRealtime: true } });
    state.settings.physicsRealtime = false;
    const host = v.host;
    renderPhysicsPanel(host, { state, registries: reg, settings: settings({ physicsRealtime: false }), staging: f.staging, onTap: vi.fn() });
    press();
    expect(f.calls).toEqual([['input', { beat: 0, kind: 'hold' }]]); // the pointer's beat 0, once
  });

  it('a host that left the page stops listening', () => {
    const f = fake();
    const state = hold('footrest');
    state.settings.physicsRealtime = true;
    const v = draw(state, { staging: f.staging, settings: { physicsRealtime: true } });
    v.host.remove();
    press();
    expect(f.calls).toEqual([]);
  });
});

describe('a hold kept down in real time', () => {
  it('registers again on every beat until it is let go (button or Space), and stops when the hold ends', () => {
    vi.useFakeTimers();
    try {
      const f = fake();
      let beat = 0;
      f.staging.beat = () => beat;
      const state = hold('footrest');
      state.settings.physicsRealtime = true;
      const v = draw(state, { staging: f.staging, settings: { physicsRealtime: true } });
      const btn = v.qa('button.alius-option').find((b) => b.textContent === '[ HOLD STILL ]')!;
      btn.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      beat = 1;
      vi.advanceTimersByTime(1500);
      beat = 2;
      vi.advanceTimersByTime(1500);
      expect(f.calls.map(([, i]) => (i as SegmentInput).beat)).toEqual([0, 1, 2]);
      btn.dispatchEvent(new Event('pointerup', { bubbles: true }));
      vi.advanceTimersByTime(6000);
      expect(f.calls).toHaveLength(3);
      v.host.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      vi.advanceTimersByTime(1500);
      v.host.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
      vi.advanceTimersByTime(6000);
      expect(f.calls).toHaveLength(5);
      btn.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      v.render(null); // the hold ended: the panel goes and so does the timer
      vi.advanceTimersByTime(6000);
      expect(f.calls).toHaveLength(6);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('what the panel shows of the body', () => {
  it('no number and no meter without raw values; with them, the gauge', () => {
    const v = draw(hold('smothered_armpit', { gauge: 68 }));
    expect(v.host.textContent).not.toMatch(/\d/);
    expect(v.q('meter')).toBeNull();
    const raw = draw(hold('smothered_armpit', { gauge: 68 }), { settings: { showRawValues: true } });
    expect(raw.q('.alius-physics-raw')!.textContent).toMatch(/68/);
  });

  it('a low gauge shakes the screen, unless motion is reduced or the mode is readable: then a static tint', () => {
    const low = hold('footrest', { gauge: 20 });
    expect(draw(low).q('.alius-physics')!.classList.contains('alius-physics-tremor')).toBe(true);
    for (const off of [{ reducedMotion: true }, { readableMode: true }]) {
      const v = draw(low, { settings: off });
      expect(v.q('.alius-physics')!.classList.contains('alius-physics-tremor'), JSON.stringify(off)).toBe(false);
      expect(v.q('.alius-physics')!.classList.contains('alius-physics-tint')).toBe(true);
    }
    expect(draw(hold('footrest', { gauge: 100 })).q('.alius-physics')!.classList.contains('alius-physics-tremor')).toBe(false);
  });

  it('the air and the strain drive the screen through two custom properties', () => {
    const v = draw(hold('smothered_armpit', { gauge: 25 }));
    expect(v.q('.alius-physics')!.style.getPropertyValue('--alius-air')).toBe('0.25');
    const w = draw(hold('footrest', { gauge: 25 }));
    expect(w.q('.alius-physics')!.style.getPropertyValue('--alius-strain')).toBe('0.75');
  });
});

describe('typing and the chat switch (the controller under the panel)', () => {
  /** A controller over a fixed state with a recording dispatch and a fake clock. */
  function controller(state: CampaignState) {
    const clock = { now: 5_000 };
    const dispatched: string[] = [];
    const payloads: unknown[] = [];
    let chat = 'c1';
    const staging = createStaging({
      app: {
        dispatch: (a: Action, o?: { expectChatId?: string }) => { dispatched.push(a.type); payloads.push(a.payload); return o?.expectChatId !== undefined && o.expectChatId !== chat ? [{ type: 'error', code: 'chat_changed' }] : []; },
        current: () => ({ state, load: { chatId: 'c1' } }),
      } as never,
      registries: () => reg, settings: () => settings({ physicsRealtime: true }), generations: { bind() {}, generate: async () => ({ kind: 'expired' }) } as never,
      scene: { replyPending: () => false, end: async () => {} }, now: () => clock.now, toast: () => {},
    });
    return { staging, clock, dispatched, payloads, switchChat: () => { chat = 'c2'; } };
  }

  it('typing lapses holds in real time (fake clock): a hold within 400 ms of a key is dropped, a later one counts', () => {
    const state = hold('footrest');
    state.settings.physicsRealtime = true;
    const c = controller(state);
    c.staging.keystroke();
    c.clock.now += 300;
    c.staging.input({ beat: 1, kind: 'hold' });
    c.clock.now += 200; // 500 ms after the key
    c.staging.input({ beat: 2, kind: 'hold' });
    c.staging.input({ beat: 2, kind: 'shift_weight' }); // a relief input is not maintenance: it never lapses
    c.staging.keystroke();
    c.staging.input({ beat: 3, kind: 'shift_weight' });
    c.staging.endSegment();
    expect(c.dispatched).toEqual(['physics/segment_end']);
    expect((c.payloads[0] as { inputs: SegmentInput[] }).inputs).toEqual([
      { beat: 2, kind: 'hold' }, { beat: 2, kind: 'shift_weight' }, { beat: 3, kind: 'shift_weight' },
    ]);
  });

  it('a chat switch stops the clock: reset drops the pending segment_end and nothing goes into the new chat', () => {
    const state = hold('footrest');
    state.settings.physicsRealtime = true;
    const c = controller(state);
    c.staging.input({ beat: 0, kind: 'hold' });
    c.switchChat();
    c.staging.reset();
    expect(c.staging.endSegment()).toEqual([]);
    c.clock.now += 120_000;
    c.staging.tick(c.clock.now);
    expect(c.dispatched).toEqual([]);
    // an end that was already on its way meets the engine's chat check
    const late = controller(hold('footrest'));
    late.switchChat();
    expect(late.staging.endSegment().some((e) => e.type === 'error' && e.code === 'chat_changed')).toBe(true);
  });
});

describe('endurance drills and the commander\'s endurance', () => {
  const train = (s: CampaignState, focus: string) => run(s, reg, { type: 'activity/do', payload: { activityId: 'train', focus } });

  it('TRAIN offers an endurance drill for breath, weight and jaw, once a day each', () => {
    const train_ = reg.activities.get('train')!;
    const focuses = (train_.focus as Array<{ id: string }>).map((f) => f.id);
    expect(focuses).toEqual(expect.arrayContaining(['endurance_breath', 'endurance_weight', 'endurance_jaw']));
    const s = campaign(reg, 4);
    const first = train(s, 'endurance_breath');
    expect(errors(first.events)).toEqual([]);
    expect(first.state.commander.endurance!.breath).toMatchObject({ xp: 15, level: 0, trainedDay: s.day });
    expect(first.events.find((e) => e.type === 'endurance_gained')).toMatchObject({ physicsId: 'breath', gained: 15 });
    const again = train(first.state, 'endurance_breath');
    expect(errors(again.events)[0]).toMatchObject({ message: expect.stringMatching(/done today/i) });
    expect(errors(train(first.state, 'endurance_weight').events)).toEqual([]);
    const tomorrow = structuredClone(first.state);
    tomorrow.day += 1;
    tomorrow.slot = 'morning';
    expect(errors(train(tomorrow, 'endurance_breath').events)).toEqual([]);
    expect(trainEndurance(structuredClone(first.state), 'breath')).toBeNull();
  });

  it('the CMDR card names the endurance of each hold as a word, never as xp', () => {
    const s = campaign(reg, 4);
    s.commander.endurance = { breath: { xp: 150, level: 3 }, weight: { xp: 400, level: 5 } };
    const host = h('div');
    document.body.append(host);
    renderCmdrCard(host, { state: s, registries: reg, raw: true });
    const row = host.querySelector('[data-commander-holds]')!;
    expect(row.textContent).toBe('HOLDS — BREATH: SEASONED · WEIGHT: HARDENED · JAW: NOT YET');
    expect(row.textContent).not.toMatch(/\d/);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
  });

  it('the reading of a hold gives the commander\'s own level and nothing of hers', () => {
    const s = campaign(reg, 4);
    s.commander.endurance = { breath: { xp: 80, level: 2 } };
    const lines = analyze('contactPhysics:breath', env(s)).join(' ');
    expect(lines).toContain('Your endurance for this: steady.');
    expect(lines).not.toMatch(/rhythm|expect|style|skill of hers|\d/i);
    expect(analyze('contactPhysics:breath', env(s), { input: 'breathe' }).join(' ')).toContain('catch');
    expect(analyze('contactPhysics:her_activity', env(s)).join(' ')).not.toContain('endurance'); // no skill there
  });
});

describe('every element resolves', () => {
  it('each button is marked, reaches a panel and can be reached, in every interaction and mode', () => {
    for (const contact of ['smothered_armpit', 'footrest', 'boot_worship', 'sole_to_mouth', 'feet_on_face']) {
      for (const [segment, realtime] of [['running', false], ['held', false], ['running', true]] as const) {
        const s = hold(contact, { segment });
        const v = draw(s, { settings: { physicsRealtime: realtime, showRawValues: true } });
        expect(markedWithout(v.host), `${contact} ${segment}`).toEqual([]);
        expect(unresolved(v.host, env(s)), `${contact} ${segment}`).toEqual([]);
        expect(unreachable(v.host), `${contact} ${segment}`).toEqual([]);
        document.body.innerHTML = '';
      }
    }
  });
});

describe('a marathon in the panel', () => {
  const marathonState = (waiting: boolean, hours: number | 'unknown' = 3): CampaignState => {
    const s = hold('footrest', { segment: waiting ? 'held' : 'running' });
    s.scene!.physics!.marathon = { hours, phase: 1, phases: 3, segmentsDone: 0, clockMin: 17 * 60 + 40, startMin: 17 * 60, waiting };
    return s;
  };

  it('shows the fiction clock, and "…" when nobody says how long', () => {
    expect(draw(marathonState(false)).q('.alius-physics-clock')!.textContent).toBe('17:40');
    expect(draw(marathonState(false, 'unknown')).q('.alius-physics-clock')!.textContent).toBe('17:40 …');
    expect(draw(hold('footrest')).q('.alius-physics-clock')).toBeNull();
  });

  it('between two phases it offers the four strategies instead of "she takes her time", and the stop word stays', () => {
    const v = draw(marathonState(true));
    expect(texts(v.qa('.alius-physics-strategy'))).toEqual(['[ ENDURE ]', '[ SPARE STRENGTH ]', '[ EASE THE BODY IN SECRET ]', '[ ASK FOR A REST ]']);
    expect(v.q('.alius-physics-held')).toBeNull();
    v.qa('.alius-physics-strategy')[1]!.click();
    expect(v.calls.at(-1)).toEqual(['skip', 'spare']);
    expect(v.qa('button').some((b) => b.textContent === '[ STOP WORD ]' && !b.hasAttribute('disabled'))).toBe(true);
    expect(draw(marathonState(false)).qa('.alius-physics-strategy')).toEqual([]);
    const s = marathonState(true);
    expect(markedWithout(v.host)).toEqual([]);
    expect(unresolved(v.host, env(s))).toEqual([]);
    expect(unreachable(v.host)).toEqual([]);
  });
});

describe('the ways of breathing her in', () => {
  /** The commander at Ann's feet: no hold runs, but the scent of her feet and the salt of her skin reach the body. */
  function worship(): CampaignState {
    registerFrameReader(() => 'play');
    const s = campaign(reg, 4);
    setRelation(s, ANN, { stateId: 'confidant' });
    enable(s, 'worship', 'bodily_fluids', 'humiliation');
    const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
    setBlocking(st, { registries: reg }, { person: COMMANDER, field: 'contact', value: 'foot_worship', with: ANN, target: 'feet' }, { at: 3, source: 'chip' });
    return st;
  }

  it('with no hold running the panel offers the ways for each kind that reaches the body, and the stop word', () => {
    const v = draw(worship());
    const group = (kind: string) => v.qa(`[data-kind="${kind}"] button`).map((b) => b.textContent);
    expect(group('scent_feet')).toEqual(['[ AVOID ]', '[ SNIFF ]', '[ NUZZLE ]', '[ IN SECRET ]', '[ SHALLOW INHALE ]', '[ DEEP INHALE ]', '[ VERY DEEP INHALE ]']);
    expect(group('taste_salt')).toEqual(['[ AVOID ]', '[ TASTE ]', '[ IN SECRET ]']);
    expect(texts(v.qa('.alius-physics-controls button'))).toEqual(['[ STOP WORD ]']);
    expect(v.host.innerHTML).not.toMatch(/\b(he|him|his)\b/i);
    expect(draw(hold('footrest')).q('[data-kind]')).toBeNull(); // a weight hold exposes nothing
  });

  it('a press sends the way and the kind; the inhale sends its depth', () => {
    const v = draw(worship());
    v.qa('[data-kind="scent_feet"] button').find((b) => b.dataset.way === 'sniff')!.click();
    v.qa('[data-kind="scent_feet"] button').find((b) => b.dataset.depth === 'deep')!.click();
    v.qa('[data-kind="taste_salt"] button').find((b) => b.dataset.way === 'taste')!.click();
    expect(v.calls).toEqual([
      ['stimulus', { way: 'sniff', kind: 'scent_feet', depth: undefined }],
      ['stimulus', { way: 'inhale', kind: 'scent_feet', depth: 'deep' }],
      ['stimulus', { way: 'taste', kind: 'taste_salt', depth: undefined }],
    ]);
  });

  it('real time: one hold-to-inhale button; the bar released after the time sends its fill (0–100)', () => {
    let t = 1000;
    const host = h('div');
    document.body.append(host);
    const f = fake();
    renderPhysicsPanel(host, { state: worship(), registries: reg, settings: settings({ physicsRealtime: true }), staging: f.staging, onTap: vi.fn(), now: () => t });
    const btns = [...host.querySelectorAll<HTMLButtonElement>('[data-kind="scent_feet"] [data-way="inhale"]')];
    expect(btns.map((b) => b.textContent)).toEqual(['[ HOLD TO INHALE ]']);
    btns[0]!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    t += 750;
    btns[0]!.dispatchEvent(new Event('pointerup', { bubbles: true }));
    t += 5000;
    btns[0]!.dispatchEvent(new Event('pointerup', { bubbles: true })); // a release with nothing held sends nothing
    expect(f.calls).toEqual([['stimulus', { way: 'inhale', kind: 'scent_feet', depth: 50 }]]);
  });

  it('the inhale is not offered when it is switched off', () => {
    const v = draw(worship(), { settings: { physicsInteractions: { ...DEFAULT_SETTINGS.physicsInteractions, inhale: false } } });
    expect(v.qa('[data-way="inhale"]')).toEqual([]);
    expect(v.qa('[data-way="sniff"]').length).toBeGreaterThan(0);
  });

  it('every way resolves, is marked and can be reached; the reading says what it does and what reaches the commander', () => {
    const s = worship();
    const v = draw(s);
    expect(markedWithout(v.host)).toEqual([]);
    expect(unresolved(v.host, env(s))).toEqual([]);
    expect(unreachable(v.host)).toEqual([]);
    const lines = analyze('stimulusKinds:scent_feet', env(s), { way: 'avoid' }).join(' ');
    expect(lines).toContain('she may notice');
    expect(lines).toContain('What reaches you:');
    expect(lines).not.toMatch(/\d|expect|rhythm/);
    expect(analyze('stimulusKinds:scent_feet', env(campaign(reg, 4))).join(' ')).toBe('');
  });
});

describe('acts of the mouth in the panel', () => {
  function mouth(): CampaignState {
    registerFrameReader(() => 'play');
    const s = campaign(reg, 4);
    setRelation(s, ANN, { stateId: 'confidant' });
    enable(s, 'worship', 'bodily_fluids', 'humiliation');
    const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
    setBlocking(st, { registries: reg }, { person: COMMANDER, field: 'contact', value: 'foot_worship', with: ANN, target: 'feet' }, { at: 3, source: 'chip' });
    return st;
  }

  it('a mouth contact offers its acts; a press sends the kind; none without a mouth', () => {
    const v = draw(mouth());
    expect(texts(v.qa('.alius-physics-acts button'))).toEqual(['[ KISS ]', '[ COUNTED KISSES ]', '[ LONG KISS ]', '[ LICK ]', '[ TAKE IN THE MOUTH ]']);
    v.qa('.alius-physics-acts button')[3]!.click();
    expect(v.calls).toEqual([['act', 'lick']]);
    expect(draw(hold('footrest')).q('.alius-physics-acts')).toBeNull();
  });

  it('counted kisses: a tally button, a field for the count, FINISH sends it', () => {
    const s = mouth();
    s.scene!.act = { kind: 'counted', n: 40, since: 0, tries: 0 };
    const v = draw(s);
    expect(texts(v.qa('.alius-physics-count button'))).toEqual(['[ KISS ] 0', '[ FINISH ]']);
    for (let i = 0; i < 3; i++) v.qa<HTMLButtonElement>('[data-act="tally"]')[0]!.click();
    expect(v.q('[data-act="tally"]')!.textContent).toBe('[ KISS ] 3');
    const field = v.q<HTMLInputElement>('input[name="counted"]')!;
    field.value = '3';
    v.q('[data-act="finish"]')!.click();
    expect(v.calls).toEqual([['count', 3]]);
    v.q('[data-act="finish"]')!.click(); // an empty field sends nothing
    expect(v.calls).toHaveLength(1);
    expect(v.host.textContent).not.toContain('40'); // the number she asked for is hers
  });

  it('every act is marked, resolves and can be reached', () => {
    const s = mouth();
    for (const act of [undefined, { kind: 'counted' as const, n: 40, since: 0, tries: 0 }]) {
      if (act) s.scene!.act = act;
      const v = draw(s);
      expect(markedWithout(v.host)).toEqual([]);
      expect(unresolved(v.host, env(s))).toEqual([]);
      expect(unreachable(v.host)).toEqual([]);
      document.body.innerHTML = '';
    }
  });
});
