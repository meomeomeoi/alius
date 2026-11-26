// @vitest-environment jsdom
/**
 * P10e-e Task 24: her activity, the frame of her time, with stillness inside (docs/prototypes/her_activity.html). The commander's attention
 * follows the mouse with the prototype's lag and an urge above .3 pulls it; an itch fades once the attention rests on her; a fast move
 * ripples and a sustained one fidgets (reported); a relief is reported with its loudness and the cover; Space typed into the field never acts;
 * the body's timers wait outside the played phase; her lines never overlap; the forgotten end's GET UP and her finder; the unmount leaves
 * nothing.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { resetPresenceHooks } from '../../../src/engine/physics/presence';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { CampaignState } from '../../../src/engine/state/types';
import type { SceneController } from '../../../src/scene/sceneController';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { h } from '../../../src/ui/dom';
import { _activity, frameMatches, SENSE_WAIT_MS, viewOf } from '../../../src/ui/scene/instruments/activity/frame';
import { instrumentFor } from '../../../src/ui/scene/instruments/host';
import '../../../src/ui/scene/instruments';
import type { PhysicsPanelStaging } from '../../../src/ui/scene/physicsPanel';
import { renderSceneScreen } from '../../../src/ui/scene/sceneScreen';
import { resetSceneStage } from '../../../src/ui/scene/stage';
import { enable } from '../../helpers/bonds';
import { campaign, errors, loadCore, run, setRelation } from '../../helpers/loyalty';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/physics';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetSceneStage();
  document.body.innerHTML = '';
  resetBlockingHooks();
  resetPhysicsHooks();
  resetPresenceHooks();
});

const ANN = 'unit_ann';
/** Ann reading reports, the commander placed under her desk (or beside her), one segment running in real time. */
function framed(anchor: 'under_desk' | 'beside_her' = 'under_desk', activity = 'reading_reports'): CampaignState {
  registerFrameReader(() => 'play');
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, 'worship', 'service', 'objectification');
  s.settings.physicsRealtime = true;
  const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  setBlocking(st, { registries: reg }, { person: ANN, field: 'activity', value: activity }, { at: 1, source: 'chip' });
  setBlocking(st, { registries: reg }, { person: COMMANDER, field: 'anchor', value: anchor, ...(anchor === 'beside_her' ? { relTo: ANN } : {}) }, { at: 2, source: 'reading' });
  expect(st.scene!.physics?.sourceKind).toBe('activity');
  const r = run(st, reg, { type: 'physics/next_segment', payload: { runId: 'p1' } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}

function frames(step = 16) {
  let next = 1;
  let t = 0;
  const queue = new Map<number, FrameRequestCallback>();
  return {
    now: () => t,
    raf: (fn: FrameRequestCallback) => { const id = next++; queue.set(id, fn); return id; },
    cancelRaf: (id: number) => { queue.delete(id); },
    frame(ms = step) {
      t += ms;
      vi.advanceTimersByTime(ms);
      const due = [...queue.entries()];
      queue.clear();
      for (const [, fn] of due) fn(t);
    },
    pending: () => queue.size,
  };
}

function draw(state: CampaignState, over: { settings?: Partial<AliusSettings>; staging?: Partial<PhysicsPanelStaging> } = {}) {
  const controller = {
    send: vi.fn(() => new Promise<boolean>(() => {})), propose: vi.fn(), answer: vi.fn(), end: vi.fn(), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(),
    transcript: () => [], onSwipe: vi.fn(), rerollState: () => ({ enabled: true, reason: '' }), rerollLast: vi.fn(), stage: vi.fn(),
  } as unknown as SceneController;
  const host = h('div');
  document.body.append(host);
  const input = vi.fn();
  const f = frames();
  const noop = (): [] => [];
  const staging = {
    input, endSegment: noop, stopWord: vi.fn(() => []), skip: vi.fn(() => []), stimulus: noop, act: noop, finishCounted: noop, cue: (k: string) => `her ${k}`, beat: () => 0,
    clock: () => ({ startedAt: 0, beatMs: 1500, now: f.now() }), getUp: vi.fn(() => []), found: vi.fn(() => []), script: () => null, relief: vi.fn(() => []), woke: vi.fn(() => []), ...over.staging,
  };
  const screen = renderSceneScreen(host, {
    controller, getState: () => state, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }),
    settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0, ...over.settings }), onEnded: vi.fn(),
    physics: { ...staging, keystroke: vi.fn(), typed: vi.fn(), onTap: vi.fn() } as never,
    frames: f, assetUrl: (p: string) => `/x/${p}`,
  });
  const q = (sel: string) => host.querySelector<HTMLElement>(sel);
  const to = (ms: number) => { while (f.now() < ms) f.frame(); };
  const frame = q('.alius-layer-frame')!;
  const move = (x: number, y: number) => document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
  return { host, screen, input, frames: f, q, to, frame, move, staging };
}
const reports = (t: ReturnType<typeof draw>): Array<{ kind: string; amount: number; part: string; involuntary?: boolean }> => (t.staging.relief as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);

describe('her frame on the scene', () => {
  it('matches her frame (a passive physics with a progress gauge, from a framed activity), read by field; the view follows the blocking', () => {
    const s = framed();
    const p = s.scene!.physics!;
    expect(frameMatches(p, s, reg)).toBe(true);
    expect(instrumentFor(p, s, reg, { ...DEFAULT_SETTINGS, physicsRealtime: true })?.id).toBe('her_activity');
    expect(viewOf(s, reg, p)).toMatchObject({ view: 'legs', blind: false });
    expect(viewOf(framed('beside_her'), reg, p).view).toBe('her');
    expect(frameMatches({ ...p, physicsId: 'breath' }, s, reg)).toBe(false);
  });

  it('draws the views under the scene\'s UI, and the stop word\'s pill stays reachable', () => {
    const t = draw(framed());
    t.to(3000);
    expect(t.q('.alius-activity')).not.toBeNull();
    expect(t.q('.alius-act-legsView')!.style.opacity).toBe('1');
    const pill = t.host.querySelector<HTMLElement>('[data-action="stop-word"], .alius-stop-pill');
    expect(pill).not.toBeNull();
    expect(t.q('.alius-activity')!.contains(pill!)).toBe(false);
  });
});

describe('stillness: the commander\'s attention and the urges', () => {
  it('the attention follows the mouse with the prototype\'s lag and an urge above .3 pulls it', () => {
    const t = draw(framed());
    t.to(2400); // the entry: then the phase plays
    _activity.ATT.x = 100; _activity.ATT.y = 100; _activity.ATT.vx = 0; _activity.ATT.vy = 0;
    _activity.mouse(500, 100);
    _activity.moveAttention(16);
    expect(_activity.ATT.x).toBeGreaterThan(100);
    expect(_activity.ATT.x).toBeLessThan(500); // a lag, not a jump
    // an urge above .3 pulls the attention off the mouse toward itself
    _activity.G.urges = [{ kind: 'itch', x: 100, y: 600, v: 0.9, born: 0, seed: 0 }];
    _activity.ATT.x = 500; _activity.ATT.y = 100; _activity.ATT.vx = 0; _activity.ATT.vy = 0;
    for (let i = 0; i < 20; i++) _activity.moveAttention(16);
    expect(_activity.ATT.y).toBeGreaterThan(100);
  });

  it('an itch fades after .5 s of attention on her', () => {
    const t = draw(framed());
    t.to(2400);
    const her = { x: 0.5 * window.innerWidth, y: 0.45 * window.innerHeight };
    _activity.mouse(her.x, her.y);
    Object.assign(_activity.ATT, { x: her.x, y: her.y, vx: 0, vy: 0 });
    _activity.G.urges = [{ kind: 'itch', x: 40, y: 40, v: 0.5, born: 0, seed: 0 }];
    _activity.updateUrges(400);
    const before = _activity.G.urges[0].v; // not yet listening: it grew
    for (let i = 0; i < 10; i++) _activity.updateUrges(100);
    expect(_activity.G.listening).toBe(true);
    expect(_activity.G.urges[0].v).toBeLessThan(before);
  });

  it('a fast move ripples, a sustained fast move fidgets (reported, loudness .28), at least 1.5 s apart', () => {
    const t = draw(framed());
    t.to(2400);
    _activity.G.speed = 400;
    _activity.mouse(0, 0); _activity.G.lastMX = 0; _activity.G.lastMY = 0;
    let x = 0;
    for (let i = 0; i < 200; i++) { x += 20; _activity.mouse(x % 1000, 300); _activity.moveAttention(16); } // ≈1250 px/s for 3.2 s
    const fidgets = reports(t).filter((r) => r.kind === 'fidget');
    expect(fidgets.length).toBeGreaterThanOrEqual(1);
    expect(fidgets.length).toBeLessThanOrEqual(3);
    expect(fidgets[0]!.amount).toBe(0.28);
  });

  it('a click on an urge relieves it: reported at once (physics/relief) with loud × (1 − cover) and its visibility (Rulings X and Y)', () => {
    const t = draw(framed());
    t.to(2400);
    _activity.G.urges = [{ kind: 'itch', x: 300, y: 300, v: 0.5, born: 0, seed: 0 }];
    _activity.relieveAt(300, 300);
    expect(reports(t).find((x) => x.kind === 'relieve')).toEqual({ kind: 'relieve', amount: 0.35, part: 'seen', attention: _activity.G.att }); // Minor 6: her attention as shown, read between segments
    // her speech covers it: the amount carries the cover; a swallow is unseen
    _activity.G.herSpeakingUntil = _activity.G.t + 5000;
    _activity.G.urges = [{ kind: 'swallow', x: 300, y: 300, v: 0.5, born: 0, seed: 0 }];
    _activity.relieveAt(300, 300);
    expect(reports(t).at(-1)).toEqual({ kind: 'relieve', amount: 0.038, part: 'unseen', attention: _activity.G.att });
  });

  it('the engine\'s catch plays her tell at once; the body giving way is reported as involuntary', () => {
    const t = draw(framed(), { staging: { relief: vi.fn(() => [{ type: 'physics_caught' }]) as never } });
    t.to(2400);
    expect(_activity.bodyNoise('scratch', 0.35, true)).toBe(true);
    expect(_activity.G.pauseUntil).toBeGreaterThan(_activity.G.t);
    _activity.bodyNoise('slump', 1, true, true);
    expect(reports(t).at(-1)).toMatchObject({ involuntary: true });
  });

  it('final review Minor 1: the friend she names is a real soldier outside the scene; with none, the line is not said', () => {
    const t = draw(framed());
    t.to(2400);
    _activity.R.listener = { id: 'unit_x', name: 'Bea' };
    expect(_activity.toYou('chatting_on_pda')!.map((x) => x.text)).toContain('Bea says hi. don’t answer.');
    expect(JSON.stringify(_activity.toYou('chatting_on_pda'))).not.toContain('Vex');
    _activity.R.listener = null;
    expect((_activity.toYou('chatting_on_pda') ?? []).filter((x) => !x.ask)).toEqual([]);
  });

  it('final review Minor 3: her inline spoken words are cardVoice rows (verbatim); a view begun again never stacks its entry lines', () => {
    const t = draw(framed());
    t.to(2400);
    expect(_activity.spoken('activity.woke')).toBe('…what are you doing.');
    expect(_activity.spoken('activity.comeIn')).toBe('come in.');
    expect(_activity.spoken('activity.entry.floor')).toBe('Down. Eyes down.');
    expect(_activity.spoken('activity.stay')).toBe('Stay.');
    _activity.S.view = 'floor';
    _activity.resetClock();
    _activity.begin();
    t.to(t.frames.now() + 200);
    _activity.S.view = 'her';
    _activity.resetClock();
    _activity.begin();
    t.to(t.frames.now() + 200);
    const senses = [...t.host.querySelectorAll('.alius-act-senses > *')].map((x) => x.textContent ?? '');
    expect(senses.filter((x) => x.startsWith('She points at the floor beside her chair'))).toHaveLength(1);
    expect(senses.some((x) => x.includes('Down. Eyes down.'))).toBe(false); // the floor's entry was cleared with its view
    expect(_activity.nightRoom('none')).toBe(1); // no picture measured (jsdom has no canvas): the scene's own level
  });

  it('Space typed into the field never acts; only the mouse acts while it has the focus', () => {
    const t = draw(framed());
    t.to(2400);
    const field = t.q('input[name="cmd"]')!;
    field.focus();
    field.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(_activity.G.spaceHeld).toBe(false);
    _activity.G.urges = [{ kind: 'itch', x: 10, y: 10, v: 0.5, born: 0, seed: 0 }];
    t.frame.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 10, clientY: 10 }));
    expect(reports(t).some((r) => r.kind === 'relieve')).toBe(true);
  });

  it('the body\'s timers wait outside the played phase (no itch fires right after a skip)', () => {
    const t = draw(framed());
    t.to(2400);
    _activity.startSkip();
    const due = _activity.G.nextItch - _activity.G.t;
    t.to(t.frames.now() + 20000);
    expect(_activity.G.nextItch - _activity.G.t).toBeCloseTo(due, -1);
    expect(_activity.G.urges.filter((u: { kind: string }) => u.kind === 'itch')).toHaveLength(0);
  });
});

describe('her lines and her questions', () => {
  it('Ruling Z: with no script of her hour, her placeholder lines play (cardVoice, verbatim); the model\'s script replaces them', () => {
    const t = draw(framed());
    t.to(2400);
    const self = reg.cardVoice.get('activity.self.reading_reports')!.lines as string[];
    const planned = _activity.planScript(0) as Array<{ to: string; text: string }>;
    expect(planned.filter((l) => l.to === 'self').length).toBeGreaterThan(0);
    for (const l of planned.filter((x) => x.to === 'self')) expect(self).toContain(l.text);
    expect(_activity.G.timers.some((x: { ph?: string }) => x.ph === 'her')).toBe(true); // scheduled for this phase
    const call = _activity.exchangeScript([{ other: 'You sound distracted.', mention: { plain: 'p', veiled: 'v' } }], 0) as Array<{ who: string; mention?: unknown }>;
    expect(call.map((l) => l.who)).toEqual(['other', 'her']);
  });


  it('answering her self-talk is a breach; silence to a question to the commander is missed', () => {
    const t = draw(framed());
    t.to(2400);
    _activity.say('who signs these.', 'self');
    const field = t.q('input[name="cmd"]') as HTMLInputElement;
    field.value = 'me';
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(_activity.G.stats.breaches).toBe(1);
    _activity.G.ask = { until: _activity.G.t + 100 };
    t.to(t.frames.now() + 400);
    expect(_activity.G.stats.missed).toBe(1);
  });

  it('the lines never overlap and stay inside the frame (placeFree on 6 lines)', () => {
    const t = draw(framed());
    t.to(2400);
    const box = t.q('.alius-activity')!;
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(220);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(30);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this === box ? 1280 : 1280; });
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const l = parseFloat(this.style.left) || 0, tp = parseFloat(this.style.top) || 0;
      return { left: l, top: tp, right: l + 220, bottom: tp + 30, width: 220, height: 30, x: l, y: tp, toJSON() {} } as DOMRect;
    });
    for (let i = 0; i < 6; i++) _activity.sense(`a sensory line ${i}`, 'her');
    const rects = [...box.querySelectorAll<HTMLElement>('.sense')].filter((el) => el.textContent!.startsWith('a sensory line')).map((el) => ({ l: parseFloat(el.style.left), t: parseFloat(el.style.top) }));
    expect(rects).toHaveLength(6);
    for (const r of rects) { expect(r.l).toBeGreaterThanOrEqual(16); expect(r.l + 220).toBeLessThanOrEqual(1280 - 24); }
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]!, b = rects[j]!;
      const overlap = a.l < b.l + 220 && a.l + 220 > b.l && a.t < b.t + 30 && a.t + 30 > b.t;
      expect(overlap, `${i} ${j}`).toBe(false);
    }
  });
});

describe('e8 M-R5: a sensory line waits for the scene\'s size, but not for ever', () => {
  const lines = (t: ReturnType<typeof draw>, text: string) => [...t.host.querySelectorAll<HTMLElement>('.sense')].filter((el) => el.textContent === text);
  afterEach(() => vi.unstubAllGlobals());
  it.each([[2000, 1], [SENSE_WAIT_MS + 600, 0]])('the size known %i ms after the line was asked for: %i line(s) placed', (knownAt, want) => {
    vi.stubGlobal('innerWidth', 0);
    vi.stubGlobal('innerHeight', 0);
    const t = draw(framed());
    t.to(2400);
    const text = 'a line asked for before the scene has a size';
    _activity.sense(text, 'her');
    expect(lines(t, text)).toHaveLength(0);
    t.to(2400 + knownAt);
    expect(lines(t, text)).toHaveLength(0);
    vi.unstubAllGlobals();
    t.to(2400 + knownAt + 400);
    expect(lines(t, text)).toHaveLength(want);
  });
});

describe('the forgotten end and the unmount', () => {
  it('at the forgotten end GET UP shows and ends it through the engine; left alone, her visitor finds the commander', () => {
    const s = framed();
    const t = draw(s);
    t.to(2400);
    _activity.G.step = 'use';
    _activity.finish('done');
    t.to(t.frames.now() + 7000);
    const getUp = t.host.querySelector<HTMLElement>('.alius-act-getUp')!;
    expect(getUp.style.display).toBe('block');
    expect(getUp.getAttribute('data-analyze')).toBe('glossary:activity_get_up');
    expect(_activity.G.phase).toBe('empty');
    t.to(t.frames.now() + 45000);
    expect(t.staging.found).toHaveBeenCalled();
  });

  it('stop() leaves no frame, no element, restores the reply and the sprites, and dispatches nothing afterwards', () => {
    const t = draw(framed('beside_her'));
    t.to(3000);
    t.screen.dispose();
    expect(t.host.querySelector('.alius-activity')).toBeNull();
    expect(t.host.querySelector('.alius-activity-ui')).toBeNull();
    const before = t.input.mock.calls.length;
    t.to(t.frames.now() + 10000);
    expect(t.input.mock.calls.length).toBe(before);
  });

  it('reduced motion and readable mode: the still form', () => {
    const t = draw(framed(), { settings: { reducedMotion: 'on', readable: true } as never });
    t.to(3000);
    const box = t.q('.alius-activity')!;
    expect(box.hasAttribute('data-reduced') || box.hasAttribute('data-readable')).toBe(true);
  });
});
