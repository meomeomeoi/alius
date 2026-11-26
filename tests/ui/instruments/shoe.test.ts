// @vitest-environment jsdom
/**
 * P10e-e Task 28: the shoe instrument (docs/prototypes/shoe.html). It matches shoe service by field and draws only with both pictures of her
 * footwear (no art: the card); two feet in one picture pan the camera (`camU` eased by .08 a frame); a zone the picture lacks is never judged;
 * shine rises only on clean leather with slow strokes; per beat it reports one `wipe` (the zone wiped most, the share of the whole footwear's
 * dirt), a spit at once, her answer to a spit as the engine decided it, her verdict at the end; Space and X typed into the field never act,
 * the right button spits; her lines are `cardVoice` (cold silent); the still form; the unmount leaves nothing.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { verdictOf } from '../../../src/engine/physics/service';
import { registerPhysicsStyle, resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { PhysicsRun, SegmentInput, SegmentPlan } from '../../../src/engine/physics/state';
import type { CampaignState } from '../../../src/engine/state/types';
import type { SceneController } from '../../../src/scene/sceneController';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { h } from '../../../src/ui/dom';
import type { ArtPicture, ArtSlots } from '../../../src/ui/scene/art';
import { instrumentFor } from '../../../src/ui/scene/instruments/host';
import { _shoe, shoeMatches } from '../../../src/ui/scene/instruments/shoe/shoe';
import type { PhysicsPanelStaging } from '../../../src/ui/scene/physicsPanel';
import { renderSceneScreen } from '../../../src/ui/scene/sceneScreen';
import { resetSceneStage } from '../../../src/ui/scene/stage';
import { enable } from '../../helpers/bonds';
import { campaign, errors, loadCore, run, setRelation } from '../../helpers/loyalty';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/physics';
import '../../../src/ui/scene/instruments';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

/** A 2D context that keeps nothing but answers every call (the masks read the picture's alpha as opaque). */
function fakeCtx(): CanvasRenderingContext2D {
  const t: Record<string | symbol, unknown> = {
    getImageData: (_x: number, _y: number, w: number, hh: number) => ({ data: new Uint8ClampedArray(w * hh * 4).fill(255) }),
    createImageData: (w: number, hh: number) => ({ data: new Uint8ClampedArray(w * hh * 4) }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
  };
  return new Proxy(t, { get: (o, p) => (p in o ? o[p] : () => undefined), set: (o, p, v) => { o[p] = v; return true; } }) as unknown as CanvasRenderingContext2D;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeCtx() as never);
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(400);
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(600);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetSceneStage();
  document.body.innerHTML = '';
  resetBlockingHooks();
  resetPhysicsHooks();
});

const ANN = 'unit_ann';
const BEAT = 1500;
const quietPlan = (n = 26): SegmentPlan => ({ beats: Array.from({ length: n }, () => ({ attention: 'busy' as const })) });

/** Ann's boots: the commander at her feet in real time, the first segment running. */
function hold(plan = quietPlan()): CampaignState {
  registerFrameReader(() => 'play');
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, 'worship', 'humiliation', 'service');
  s.settings.physicsRealtime = true;
  const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  setBlocking(st, { registries: reg }, { person: ANN, field: 'contact', value: 'boot_worship', with: COMMANDER }, { at: 3, source: 'chip' });
  expect(st.scene!.physics?.physicsId).toBe('tongue_work');
  const r = run(st, reg, { type: 'physics/next_segment', payload: { runId: st.scene!.physics!.id } });
  expect(errors(r.events)).toEqual([]);
  r.state.scene!.physics!.segment.plan = plan;
  return r.state;
}

type Side = { feet?: 'one' | 'two'; zones?: unknown; fit?: Record<string, number> };
/** Her pictures per slot (the layout fixture's sprite stands for the author's art). */
function artOf(slots: Partial<Record<string, Side | null>> = { 'shoe_close.boots': {}, 'shoe_sole.boots': {} }, prefix = '/art'): ArtSlots {
  return {
    get: (_u, slot) => {
      const side = slots[slot];
      if (!side) return null;
      return { url: `${prefix}/${slot}.png`, sidecar: { feet: side.feet ?? 'one', shown: 'right', ...(side.fit ? { fit: side.fit } : {}), ...(side.zones ? { zones: side.zones as never } : {}) } } as ArtPicture;
    },
    face: () => null,
  };
}

function frames() {
  let next = 1;
  let t = 0;
  const queue = new Map<number, FrameRequestCallback>();
  return {
    now: () => t,
    raf: (fn: FrameRequestCallback) => { const id = next++; queue.set(id, fn); return id; },
    cancelRaf: (id: number) => { queue.delete(id); },
    frame() {
      t += 16;
      vi.advanceTimersByTime(16);
      const due = [...queue.entries()];
      queue.clear();
      for (const [, fn] of due) fn(t);
    },
    pending: () => queue.size,
  };
}

function draw(state: CampaignState, over: { settings?: Partial<AliusSettings>; staging?: Partial<PhysicsPanelStaging>; art?: ArtSlots } = {}) {
  const controller = {
    send: vi.fn(() => new Promise<boolean>(() => {})), propose: vi.fn(), answer: vi.fn(), end: vi.fn(), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(),
    transcript: () => [], onSwipe: vi.fn(), rerollState: () => ({ enabled: true, reason: '' }), rerollLast: vi.fn(), stage: vi.fn(),
  } as unknown as SceneController;
  const host = h('div');
  document.body.append(host);
  const input = vi.fn();
  const service = vi.fn(() => []);
  const spit = vi.fn((_b: number, _a: string): Array<{ type: string }> => []);
  const f = frames();
  const noop = (): [] => [];
  const staging = {
    input, service, spit, endSegment: noop, stopWord: vi.fn(() => []), skip: noop, act: noop, finishCounted: noop, stimulus: noop, cue: (k: string) => `her ${k}`, beat: () => 0,
    clock: () => ({ startedAt: 0, beatMs: BEAT, now: f.now() }), ...over.staging,
  };
  const screen = renderSceneScreen(host, {
    controller, getState: () => state, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }),
    settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0, ...over.settings }), onEnded: vi.fn(),
    physics: { ...staging, keystroke: vi.fn(), typed: vi.fn(), onTap: vi.fn() } as never,
    frames: f, art: over.art ?? artOf(), assetUrl: (p: string) => `/x/${p}`,
  });
  const q = (sel: string) => host.querySelector<HTMLElement>(sel);
  const to = (ms: number) => { while (f.now() < ms) f.frame(); };
  const frame = q('.alius-layer-frame')!;
  const field = q('input[name="cmd"]') as HTMLInputElement;
  const pointer = (type: 'pointerdown' | 'pointerup' | 'pointermove', target: EventTarget = frame, button = 0, x = 0, y = 0) => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, button, clientX: x, clientY: y });
    target.dispatchEvent(e);
    return e;
  };
  const key = (k: string, target: EventTarget = document.body) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
  };
  return { host, screen, input, service, spit, frames: f, q, to, pointer, key, field, staging };
}
const reports = (t: ReturnType<typeof draw>): SegmentInput[] => t.input.mock.calls.map((c) => c[0] as SegmentInput);
const handText = (t: ReturnType<typeof draw>) => [...t.host.querySelectorAll('.alius-shoe-hand .her-line')].map((e) => e.textContent).join(' | ');
const senseText = (t: ReturnType<typeof draw>) => [...t.host.querySelectorAll('.alius-shoe-hand .sense')].map((e) => e.textContent).join(' | ');
/** The screen point of a zone's centre on the picture now (undoing the mirror as `toPic` does). */
function zonePoint(zone: string): [number, number] {
  const r = _shoe.shoeRect()!;
  const p = _shoe.zonesNow()[zone] as number[];
  const u = _shoe.mirrored() ? 1 - p[0]! : p[0]!;
  return [r.x + u * r.w, r.y + p[1]! * r.h];
}

describe('the shoe instrument: matching and its pictures', () => {
  it('matches shoe service by field, alone; draws with both pictures of her footwear, else the card (no art: the card)', () => {
    const s = hold();
    const p = s.scene!.physics!;
    expect(shoeMatches(p, s, reg)).toBe(true);
    expect(instrumentFor(p, s, reg, DEFAULT_SETTINGS)?.id).toBe('shoe');
    expect(shoeMatches({ ...p, second: { physicsId: 'weight', gauge: 100, capacity: 100, streak: 0 } }, s, reg)).toBe(false);
    expect(shoeMatches({ ...p, sourceId: 'foot_worship' } as PhysicsRun, s, reg)).toBe(false);
    // no art: the card
    const none = draw(hold(), { art: artOf({}) });
    expect(none.q('.alius-shoe')).toBeNull();
    expect(none.q('.alius-physics[data-run="p1"]')).not.toBeNull();
    resetSceneStage();
    document.body.innerHTML = '';
    // only the top: the card too (no stand-in sprite)
    const half = draw(hold(), { art: artOf({ 'shoe_close.boots': {} }) });
    expect(half.q('.alius-shoe')).toBeNull();
    expect(half.q('.alius-physics[data-run="p1"]')).not.toBeNull();
    resetSceneStage();
    document.body.innerHTML = '';
    // both: the instrument, in the effects layer, no card, no [data-analyze] on the play surface; the stop word stays
    const t = draw(hold());
    const box = t.q('.alius-layer-effects > .alius-shoe');
    expect(box).not.toBeNull();
    expect(t.q('.alius-physics[data-run="p1"]')).toBeNull();
    expect(box!.querySelector('[data-analyze]')).toBeNull();
    expect(t.q('.alius-stage-dial .alius-stop-pill[data-stop-word]')).not.toBeNull();
    t.to(100);
    expect(_shoe.G.phase).toBe('loop');
    expect(_shoe.S).toMatchObject({ kind: 'boots', dirt: expect.any(String) });
  });

  it('heels in her tastes: the heels\' pictures', () => {
    const s = hold();
    s.squad.find((u) => u.id === ANN)!.likes = ['high heels'];
    const t = draw(s, { art: artOf({ 'shoe_close.heels': {}, 'shoe_sole.heels': {} }) });
    t.to(100);
    expect(t.q('.alius-shoe')).not.toBeNull();
    expect(_shoe.S.kind).toBe('heels');
  });

  it('a picture that fails to load hands the run to the card at once (M4: it asks for a redraw); a stage reset forgets it (M5)', () => {
    const t = draw(hold(), { art: artOf(undefined, '/broken') });
    t.to(100);
    expect(t.q('.alius-shoe')).not.toBeNull();
    _shoe.imgs.boots_sole!.onerror!(new Event('error'));
    expect(t.q('.alius-shoe')).toBeNull();
    expect(t.q('.alius-physics[data-run="p1"]')).not.toBeNull();
    resetSceneStage();
    document.body.innerHTML = '';
    const again = draw(hold(), { art: artOf(undefined, '/broken') });
    expect(again.q('.alius-shoe')).not.toBeNull();
  });
});

describe('the shoe instrument: the prototype\'s pure parts', () => {
  it('two feet pan the camera (camU eased by .08 a frame)', () => {
    const t = draw(hold(), { art: artOf({ 'shoe_close.boots': { feet: 'two', fit: { height: 0.7, y: 0.5, x: 0, fade: 0.2, xr: 0.38, xl: 0.62 } }, 'shoe_sole.boots': {} }) });
    t.to(100);
    expect(_shoe.twoFeet()).toBe(true);
    expect(_shoe.mirrored()).toBe(false);
    const G = _shoe.G;
    G.camU = undefined;
    G.foot = 'right';
    _shoe.shoeRect();
    expect(G.camU).toBeCloseTo(0.38, 10);
    G.foot = 'left';
    _shoe.shoeRect();
    expect(G.camU).toBeCloseTo(0.38 + (0.62 - 0.38) * 0.08, 10);
    _shoe.shoeRect();
    expect(G.camU).toBeCloseTo(0.3992 + (0.62 - 0.3992) * 0.08, 10);
    // one foot in the picture: the camera centres the picture; the other foot is it mirrored
    G.surface = 'sole';
    expect(_shoe.twoFeet()).toBe(false);
    G.camU = undefined;
    _shoe.shoeRect();
    expect(G.camU).toBeCloseTo(0.5, 10);
    expect(_shoe.mirrored()).toBe(true); // her left foot, the right one shown
  });

  it('a zone the picture lacks is never judged (the fix of round 4)', () => {
    const s = hold();
    s.squad.find((u) => u.id === ANN)!.likes = ['heels'];
    const t = draw(s, { art: artOf({ 'shoe_close.heels': { feet: 'two' }, 'shoe_sole.heels': {} }) });
    t.to(100);
    expect(_shoe.S.kind).toBe('heels');
    const surf = _shoe.ensureSurface();
    expect(Object.keys(_shoe.zonesNow()).sort()).toEqual(['side', 'toe', 'vamp']);
    expect(_shoe.leatherNow()).toEqual(['toe', 'vamp', 'side']); // the heels' `back` and `heel` are not in this picture
    expect(_shoe.zoneStat('back', surf)).toEqual({ dirt: 0, gloss: 1 });
    expect(_shoe.zoneStat('heel', surf)).toEqual({ dirt: 0, gloss: 1 });
    // all clean and shone: her verdict names no zone
    surf.m.fill(0);
    surf.gl.fill(1);
    _shoe.verdict();
    expect(_shoe.G.stats.checks.at(-1)).toMatchObject({ worst: null, kind: null });
  });

  it('shine rises only on clean leather with slow strokes', () => {
    const t = draw(hold());
    t.to(100);
    const s = _shoe.ensureSurface();
    const toe = s.names.indexOf('toe');
    const glossOfToe = () => { let g = 0, n = 0; for (let p = 0; p < s.gl.length; p++) if (s.zoneOf[p] === toe) { g += s.gl[p]; n++; } return g / n; };
    const [x, y] = zonePoint('toe');
    // dirty leather: the stroke takes dirt off, no shine
    s.gl.fill(0);
    const dirty = _shoe.lickStroke(x - 20, y, x + 20, y, 300);
    expect(dirty.removed).toBeGreaterThan(0);
    expect(dirty.polished).toBe(0);
    expect(glossOfToe()).toBe(0);
    // clean leather, a slow stroke: the shine rises
    s.m.fill(0);
    const slow = _shoe.lickStroke(x - 20, y, x + 20, y, 300);
    expect(slow.polished).toBeGreaterThan(0);
    const shone = glossOfToe();
    expect(shone).toBeGreaterThan(0);
    // a fast one takes a little off
    const fast = _shoe.lickStroke(x - 20, y, x + 20, y, 900);
    expect(fast.polished).toBe(0);
    expect(glossOfToe()).toBeLessThan(shone);
    // the laces take no shine (not leather)
    const [lx, ly] = zonePoint('laces');
    const lace = s.names.indexOf('laces');
    _shoe.lickStroke(lx, ly - 10, lx, ly + 10, 300);
    let lg = 0; for (let p = 0; p < s.gl.length; p++) if (s.zoneOf[p] === lace && !s.leatherMask[p]) lg += s.gl[p];
    expect(lg).toBe(0);
  });
});

describe('the shoe instrument on the scene', () => {
  it('inputs: per beat one wipe (the zone wiped most, the share of the whole footwear\'s dirt; the mouse: pointer), none for a beat with nothing wiped', () => {
    const t = draw(hold());
    t.to(100);
    const s = _shoe.ensureSurface();
    const before = s.m.reduce((a: number, v: number) => a + v, 0);
    const [x, y] = zonePoint('toe');
    const r = t.host.querySelector('.alius-scene')!.getBoundingClientRect();
    t.pointer('pointerdown', undefined, 0, x + r.left, y + r.top);
    for (let i = 1; i <= 12; i++) { t.frames.frame(); t.pointer('pointermove', document, 0, x + r.left + (i % 2 ? 40 : -40), y + r.top + i); }
    t.pointer('pointerup', document);
    const after = s.m.reduce((a: number, v: number) => a + v, 0);
    expect(after).toBeLessThan(before);
    t.to(BEAT + 50);
    const wipes = reports(t).filter((i) => i.kind === 'wipe');
    expect(wipes).toHaveLength(1);
    expect(wipes[0]).toMatchObject({ beat: 0, part: 'toe' });
    expect(wipes[0]!.amount!).toBeCloseTo((before - after) / s.total0 / 4, 4);
    expect(t.input.mock.calls.find((c) => (c[0] as SegmentInput).kind === 'wipe')![1]).toEqual({ pointer: true });
    t.to(3 * BEAT + 50);
    expect(reports(t).filter((i) => i.kind === 'wipe')).toHaveLength(1); // nothing wiped since: nothing sent
  });

  it('keys: Space and X typed into the field never act; Space elsewhere swallows; the right button on the frame spits (pointer), X elsewhere too', () => {
    const t = draw(hold());
    t.to(100);
    const G = _shoe.G;
    G.grit = 0.5;
    t.key(' ', t.field);
    t.key('x', t.field);
    expect(G.stats.swallows).toBe(0);
    expect(G.stats.spits).toBe(0);
    t.key(' ');
    expect(G.stats.swallows).toBe(1);
    expect(G.grit).toBe(0);
    G.grit = 0.5;
    t.pointer('pointerdown', undefined, 2);
    expect(G.stats.spits).toBe(1);
    expect(t.spit).toHaveBeenCalledTimes(1); // Ruling AC: decided by the engine at once, not a segment input
    expect(reports(t).some((i) => i.kind === 'spit')).toBe(false);
    G.grit = 0.5;
    t.key('X');
    expect(G.stats.spits).toBe(2);
    expect(t.spit).toHaveBeenCalledTimes(2);
    G.grit = 0.01; // nothing to spit
    t.pointer('pointerdown', undefined, 2);
    expect(G.stats.spits).toBe(2);
  });

  it('Ruling AC: a spit is answered at once as the engine decided it (her beat and her attention shown); seen: her caught line and her press; unseen: her not seeing', () => {
    const t = draw(hold());
    t.to(2 * BEAT + 100);
    _shoe.G.grit = 0.5;
    t.spit.mockReturnValueOnce([{ type: 'physics_cheat' }, { type: 'physics_caught' }]);
    t.pointer('pointerdown', undefined, 2);
    expect(t.spit).toHaveBeenCalledWith(2, _shoe.G.attention);
    expect(handText(t)).toContain('did you just spit?');
    expect(_shoe.G.stats.caught).toBe(1);
    expect(_shoe.G.anim).toMatchObject({ kind: 'press' });
    _shoe.G.grit = 0.5;
    t.pointer('pointerdown', undefined, 2);
    expect(senseText(t)).toContain('You spit it aside. She did not see.');
    expect(_shoe.G.stats.caught).toBe(1);
  });

  it('Ruling AD: what is wiped while the run is held reaches the next segment\'s first beat; a spit while held is decided at once', () => {
    const s = hold();
    let started = 0;
    const clock = { now: () => 0 };
    const t = draw(s, { staging: { clock: () => ({ startedAt: started, beatMs: BEAT, now: clock.now() }) } });
    clock.now = t.frames.now;
    t.to(100);
    s.scene!.physics = { ...s.scene!.physics!, segment: { n: 1, state: 'held' } };
    t.screen.refresh();
    t.to(200);
    const surf = _shoe.ensureSurface();
    const before = surf.m.reduce((a: number, v: number) => a + v, 0);
    const [x, y] = zonePoint('toe');
    const r = t.host.querySelector('.alius-scene')!.getBoundingClientRect();
    t.pointer('pointerdown', undefined, 0, x + r.left, y + r.top);
    for (let i = 1; i <= 12; i++) { t.frames.frame(); t.pointer('pointermove', document, 0, x + r.left + (i % 2 ? 40 : -40), y + r.top + i); }
    t.pointer('pointerup', document);
    const after = surf.m.reduce((a: number, v: number) => a + v, 0);
    _shoe.G.grit = 0.5;
    t.pointer('pointerdown', undefined, 2);
    expect(t.spit).toHaveBeenCalledTimes(1); // held: decided all the same
    t.to(3 * BEAT);
    expect(reports(t).filter((i) => i.kind === 'wipe')).toHaveLength(0); // nothing reaches a held run
    // the run resumes: the next segment's first beat carries what was wiped meanwhile
    const now = t.frames.now();
    s.scene!.physics = { ...s.scene!.physics!, segment: { n: 2, state: 'running', plan: quietPlan() } };
    started = now;
    t.screen.refresh();
    t.to(now + BEAT + 100);
    const wipes = reports(t).filter((i) => i.kind === 'wipe');
    expect(wipes).toHaveLength(1);
    expect(wipes[0]!.beat).toBe(0);
    expect(wipes[0]!.amount!).toBeCloseTo((before - after) / surf.total0 / 4, 4);
  });

  it('M1: fresh dirt on a wiped zone (a cruel holder, a spit she saw) is not counted again when it is wiped off', () => {
    const t = draw(hold());
    t.to(100);
    const surf = _shoe.ensureSurface();
    const toe = surf.names.indexOf('toe');
    for (let p = 0; p < surf.m.length; p++) if (surf.zoneOf[p] === toe) surf.m[p] *= 0.5; // wiped
    t.to(BEAT + 50);
    const first = reports(t).filter((i) => i.kind === 'wipe');
    expect(first).toHaveLength(1);
    for (let p = 0; p < surf.m.length; p++) if (surf.zoneOf[p] === toe) surf.m[p] *= 2; // fresh dirt, then wiped to the same level
    t.to(2 * BEAT + 50);
    for (let p = 0; p < surf.m.length; p++) if (surf.zoneOf[p] === toe) surf.m[p] *= 0.5;
    t.to(3 * BEAT + 50);
    expect(reports(t).filter((i) => i.kind === 'wipe')).toHaveLength(1);
  });

  it('M8: the engine\'s check ends the cleaning first: she judges the surface in front of her, says her end, gives her verdict once', async () => {
    const s = hold();
    const t = draw(s, { staging: { outcome: () => ({ runId: 'p1', physicsId: 'tongue_work', result: 'checked' }) } as never });
    t.to(100);
    const G = _shoe.G;
    G.phase = 'inspect'; G.judged = false; // her inspection under way, before her verdict
    delete s.scene!.physics;
    t.screen.refresh();
    await Promise.resolve();
    expect(G.stats.checks).toHaveLength(1);
    expect(G.phase).toBe('done');
    expect(t.service).toHaveBeenCalledTimes(1);
    expect(t.service).toHaveBeenCalledWith('p1', verdictOf(G.lastQuality));
    expect(handText(t)).toContain('that will do.');
    t.to(2000);
    expect(t.q('.alius-shoe')).not.toBeNull(); // her end plays
    t.to(3000);
    vi.advanceTimersByTime(3000);
    expect(t.service).toHaveBeenCalledTimes(1);
  });

  it('her verdict at the session\'s end: the mean quality of the surfaces she judged (physics/service, once)', () => {
    const t = draw(hold());
    t.to(100);
    const G = _shoe.G;
    G.lastQuality = 0.9; G.stats.checks.push({}); // two judged surfaces
    t.to(150);
    G.lastQuality = 0.5; G.stats.checks.push({});
    t.to(200);
    G.orderI = 3;
    _shoe.nextSurface();
    expect(G.phase).toBe('done');
    t.to(300);
    expect(t.service).toHaveBeenCalledTimes(1);
    expect(t.service).toHaveBeenCalledWith('p1', verdictOf(0.7));
    expect(handText(t)).toContain('that will do.');
    t.to(2000);
    expect(t.service).toHaveBeenCalledTimes(1);
  });

  it('her lines are hers (cardVoice by style); cold has the prototype\'s own lines (Ruling R clarified), silent where it has none', () => {
    const t = draw(hold());
    t.to(100);
    expect(handText(t)).toBe('clean them.');
    resetSceneStage();
    document.body.innerHTML = '';
    registerPhysicsStyle(() => ({ primary: 'cruel' }));
    const c = draw(hold());
    c.to(100);
    expect(handText(c)).toBe('clean.');
    resetSceneStage();
    document.body.innerHTML = '';
    resetPhysicsHooks();
    registerPhysicsStyle(() => ({ primary: 'cold' }));
    const k = draw(hold());
    k.to(100);
    expect(handText(k)).toBe('clean them.');
    expect(_shoe.LINES.cold!.swallowed).toEqual([]);
    expect(_shoe.LINES.cold!.stamp).toEqual([]);
    expect(_shoe.LINES.cold!.end).toEqual(['done.']);
  });

  it('the still form: no motion of her foot; readable mode marked (no blur)', () => {
    const t = draw(hold(), { settings: { reducedMotion: true, readableMode: true } });
    t.to(100);
    const box = t.q('.alius-shoe')!;
    expect(box.hasAttribute('data-reduced')).toBe(true);
    expect(box.hasAttribute('data-readable')).toBe(true);
    _shoe.G.anim = { kind: 'press', t0: _shoe.G.t };
    t.to(600);
    expect(_shoe.G.fx).toEqual({ dx: 0, dy: 0, s: 1, r: 0 });
  });

  it('unmount: a stage reset leaves no frame, no element; nothing is reported afterwards; the stop word ends it at once', async () => {
    const t = draw(hold());
    t.to(100);
    expect(t.frames.pending()).toBeGreaterThan(0);
    resetSceneStage();
    expect(t.q('.alius-shoe')).toBeNull();
    const n = t.input.mock.calls.length;
    _shoe.G.grit = 0.5;
    t.key(' ');
    t.pointer('pointerdown', undefined, 2);
    t.to(5 * BEAT);
    expect(t.input.mock.calls.length).toBe(n);
    expect(t.service).not.toHaveBeenCalled();
    // the stop word: the run is gone (stopped), no end is played
    document.body.innerHTML = '';
    const s = hold();
    const u = draw(s, { staging: { stopWord: vi.fn(() => { delete s.scene!.physics; return []; }) } });
    u.to(100);
    (u.q('.alius-stop-pill[data-stop-word]') as HTMLButtonElement).click();
    u.screen.refresh();
    await Promise.resolve();
    u.to(400);
    expect(u.q('.alius-shoe')).toBeNull();
    expect(u.service).not.toHaveBeenCalled();
  });
});
