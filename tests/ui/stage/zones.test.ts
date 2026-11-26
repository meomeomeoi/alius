// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { getSettings } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { createArtSlots, sidecarSchema, type ArtSidecar } from '../../../src/ui/scene/art';
import type { StageCtx } from '../../../src/ui/stage/section';
import { openSlotEditor, type SlotDraft } from '../../../src/ui/stage/slotEditor';
import { markZones, pictureRect, zoneNames } from '../../../src/ui/stage/zones';
import { _activityMarker } from '../../../src/ui/stage/fit/activity';
import { campaign, loadCore } from '../../helpers/world';
import { registerCoreProviders } from '../../../src/analysis/providers/core';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); registerCoreProviders(); });

/** A recording 2D context (jsdom has none): what was drawn since the last clear. */
let drawn: string[] = [];
beforeEach(() => {
  drawn = [];
  const ctx = new Proxy({}, {
    get: (_t, prop) => (prop === 'canvas' ? undefined : typeof prop === 'string' && /^(ellipse|fillText|stroke|clearRect|beginPath|fill|arc|moveTo|lineTo|save|restore|setLineDash)$/.test(prop)
      ? (...args: unknown[]) => { if (prop === 'clearRect') drawn = []; else drawn.push(`${prop}(${args.map((a) => (typeof a === 'number' ? Math.round(a) : a)).join(',')})`); }
      : undefined),
    set: () => true,
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:test';
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
});
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

/** A canvas of 1000 × 625 over a picture of 500 × 1000 (drawn contained: 312.5 × 625 at x 343.75). */
function stage() {
  const frame = document.createElement('div');
  const picture = document.createElement('img');
  Object.defineProperty(picture, 'naturalWidth', { value: 500 });
  Object.defineProperty(picture, 'naturalHeight', { value: 1000 });
  const canvas = document.createElement('canvas');
  canvas.width = 1000; canvas.height = 625;
  frame.append(picture, canvas);
  document.body.append(frame);
  return { frame, picture, canvas };
}
const R = { x: 343.75, y: 0, w: 312.5, h: 625 };
const at = (u: number, v: number) => ({ clientX: R.x + u * R.w, clientY: R.y + v * R.h });
const down = (c: HTMLCanvasElement, p: { clientX: number; clientY: number }, shiftKey = false) => c.dispatchEvent(new MouseEvent('mousedown', { ...p, button: 0, bubbles: true, shiftKey }));
const moveTo = (p: { clientX: number; clientY: number }, shiftKey = false) => document.dispatchEvent(new MouseEvent('mousemove', { ...p, bubbles: true, shiftKey }));
const up = (p: { clientX: number; clientY: number }) => document.dispatchEvent(new MouseEvent('mouseup', { ...p, button: 0, bubbles: true }));
const click = (c: HTMLCanvasElement, u: number, v: number, shiftKey = false) => { down(c, at(u, v), shiftKey); up(at(u, v)); };
const wheel = (c: HTMLCanvasElement, n: number, shiftKey = false) => { for (let i = 0; i < n; i++) c.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true, shiftKey })); };
const prompt = (frame: HTMLElement) => frame.querySelector<HTMLElement>('[data-proto="markPrompt"]')!;

describe('the zone marker (her_activity.html\'s, P10e-f Task 7)', () => {
  it('the picture\'s rect is the picture contained in the canvas', () => {
    const { canvas, picture } = stage();
    expect(pictureRect(canvas, picture)).toEqual(R);
    expect(zoneNames('sole_close', {})).toEqual(['toes', 'ball', 'arch', 'heel', 'edge']);
  });

  it('a click at (0.4, 0.6) with no neighbour is a point; its radius is half the nearest distance, 4–12 % of the height', () => {
    const { canvas, picture } = stage();
    const onChange = vi.fn();
    markZones(canvas, picture, 'sole_close', {}, onChange);
    click(canvas, 0.4, 0.6);
    for (const v of [0.1, 0.2, 0.3, 0.9]) click(canvas, 0.5, v);
    click(canvas, 0.5, 0.5); // a click after the last: done
    expect(onChange).toHaveBeenCalledTimes(1);
    const zones = onChange.mock.calls[0]![0] as Record<string, number[]>;
    expect(zones.toes).toEqual([0.4, 0.6]); // the prototype stores [x, y]: the radius is the marker's zoneRadii
    const { S, zoneRadii } = _activityMarker;
    S.zones = { toes: [0.4, 0.6] };
    const r = zoneRadii(R).toes!;
    expect(r.rx / R.h).toBeGreaterThanOrEqual(0.04);
    expect(r.rx / R.h).toBeLessThanOrEqual(0.12);
    expect(r.rx).toBe(r.ry);
    S.zones = zones;
    const near = zoneRadii(R).arch!; // arch at (0.5, 0.3), its nearest neighbour ball at (0.5, 0.2): 0.1 × 625 / 2
    expect(near.rx).toBeCloseTo(Math.max(0.04 * R.h, Math.min(0.12 * R.h, (0.1 * R.h) / 2)));
  });

  it('a press and drag is an ellipse [x, y, rx, ry, deg]; four wheel notches turn it 20°, with Shift 4°', () => {
    const { canvas, picture } = stage();
    const onChange = vi.fn();
    markZones(canvas, picture, 'sole_close', {}, onChange);
    down(canvas, at(0.5, 0.2));
    moveTo({ clientX: at(0.5, 0.2).clientX + 40, clientY: at(0.5, 0.2).clientY + 25 });
    wheel(canvas, 4); // while dragging
    up(at(0.5, 0.2));
    down(canvas, at(0.5, 0.4));
    moveTo({ clientX: at(0.5, 0.4).clientX + 30, clientY: at(0.5, 0.4).clientY + 50 });
    up(at(0.5, 0.4));
    wheel(canvas, 4, true); // the last one placed, finer
    for (const v of [0.6, 0.8, 0.9]) click(canvas, 0.3, v);
    click(canvas, 0.1, 0.1);
    const zones = onChange.mock.calls[0]![0] as Record<string, number[]>;
    expect(zones.toes).toEqual([0.5, 0.2, +(40 / R.h).toFixed(3), +(25 / R.h).toFixed(3), 20]);
    expect(zones.ball).toEqual([0.5, 0.4, +(30 / R.h).toFixed(3), +(50 / R.h).toFixed(3), 4]);
  });

  it('Shift + drag gives a circle [x, y, r]', () => {
    const { canvas, picture } = stage();
    const onChange = vi.fn();
    markZones(canvas, picture, 'sole_close', {}, onChange);
    down(canvas, at(0.5, 0.5));
    moveTo({ clientX: at(0.5, 0.5).clientX + 30, clientY: at(0.5, 0.5).clientY + 40 }, true);
    up(at(0.5, 0.5));
    for (let i = 0; i < 5; i++) click(canvas, 0.2, 0.1 + i * 0.1);
    const zones = onChange.mock.calls[0]![0] as Record<string, number[]>;
    expect(zones.toes).toEqual([0.5, 0.5, +(50 / R.h).toFixed(3)]);
  });

  it('the zones are drawn only while marking; the prompt names the zone asked for', () => {
    const { canvas, picture, frame } = stage();
    const stop = markZones(canvas, picture, 'sole_close', {}, () => {});
    expect(prompt(frame).textContent).toContain('toes');
    click(canvas, 0.5, 0.2);
    expect(drawn.some((d) => d.startsWith('ellipse('))).toBe(true);
    expect(drawn).toContain(`fillText(toes,${Math.round(R.x + 0.5 * R.w + 14)},${Math.round(0.2 * R.h + 4)})`);
    expect(prompt(frame).textContent).toContain('ball');
    stop();
    expect(drawn).toEqual([]);
    expect(prompt(frame).style.display).toBe('none');
    click(canvas, 0.5, 0.4); // nothing listens any more
    expect(drawn).toEqual([]);
  });

  it('stopping before the end changes nothing', () => {
    const { canvas, picture } = stage();
    const onChange = vi.fn();
    const stop = markZones(canvas, picture, 'sole_close', { zones: { toes: [0.1, 0.1] } }, onChange);
    click(canvas, 0.5, 0.5);
    stop();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('the zone marker on her footwear (shoe.html\'s)', () => {
  it('names the zones of the kind and the view; two feet name the front composition', () => {
    expect(zoneNames('shoe_close.boots', {})).toEqual(['toe', 'vamp', 'laces', 'side', 'heel', 'shaft', 'welt']);
    expect(zoneNames('shoe_sole.heels', { feet: 'two' })).toEqual(['toe_tread', 'mid', 'heel_tread']);
    expect(zoneNames('shoe_close.heels', { feet: 'two' })).toEqual(['toe', 'vamp', 'side']);
  });

  it('feet: two asks for the right foot\'s set, then the left\'s, and gives { right, left }', () => {
    const { canvas, picture, frame } = stage();
    const onChange = vi.fn();
    markZones(canvas, picture, 'shoe_sole.boots', { feet: 'two' }, onChange);
    expect(prompt(frame).textContent).toContain('her right foot');
    for (const v of [0.2, 0.5, 0.8]) click(canvas, 0.3, v);
    click(canvas, 0.9, 0.9); // next: her left foot
    expect(onChange).not.toHaveBeenCalled();
    expect(prompt(frame).textContent).toContain('her left foot');
    for (const v of [0.2, 0.5, 0.8]) click(canvas, 0.7, v);
    click(canvas, 0.9, 0.9);
    const zones = onChange.mock.calls[0]![0] as { right: Record<string, number[]>; left: Record<string, number[]> };
    expect(zones.right.mid).toEqual([0.3, 0.5]);
    expect(zones.left.heel_tread).toEqual([0.7, 0.8]);
    const sidecar: ArtSidecar = { feet: 'two', fit: { height: 0.78, y: 0.5, x: 0, fade: 0.2, xr: 0.38, xl: 0.62 }, zones };
    expect(sidecarSchema.parse(JSON.parse(JSON.stringify(sidecar)))).toEqual(sidecar);
  });

  it('one foot: one set on the picture as it is (not mirrored, whichever foot it shows)', () => {
    const { canvas, picture } = stage();
    const onChange = vi.fn();
    markZones(canvas, picture, 'shoe_close.heels', { feet: 'one', shown: 'left' }, onChange);
    for (let i = 0; i < 5; i++) click(canvas, 0.2, 0.1 + i * 0.1);
    click(canvas, 0.9, 0.9);
    const zones = onChange.mock.calls[0]![0] as Record<string, number[]>;
    expect(Object.keys(zones)).toEqual(['toe', 'vamp', 'side', 'back', 'heel']);
    expect(zones.toe).toEqual([0.2, 0.1]);
  });
});

describe('the marker in the slot editor', () => {
  const ctxOf = async () => {
    const s = campaign(reg, 2);
    const st = new FakeStAdapter({ chatId: 'c1', isGroup: true, groupId: 'g' });
    const folders = new Map();
    const ctx: StageCtx = {
      st, getState: () => s, getRegistries: () => reg, art: () => createArtSlots(null, (p) => p, () => null, folders), folders: () => folders,
      openSheet: () => {}, settings: () => getSettings(st), refresh: async () => {}, toast: vi.fn(), modal: vi.fn(async () => 'keep'),
    };
    return { s, ctx };
  };

  it('MARK ZONES is offered only on a slot with zones and a picture; the zones go into the draft and round-trip through the schema', async () => {
    const { s, ctx } = await ctxOf();
    const host = document.createElement('div');
    document.body.append(host);
    openSlotEditor(host, s.squad[0]!.id, 'over', { ...ctx, draft: { url: '/x.png', sidecar: {} } });
    expect(host.querySelector('[data-action=zones]')).toBeNull();
    const draft: SlotDraft = { url: null, sidecar: { fit: { height: 0.6, y: 0.5 } } };
    openSlotEditor(host, s.squad[0]!.id, 'sole_close', { ...ctx, draft });
    const btn = host.querySelector<HTMLButtonElement>('[data-action=zones]')!;
    expect(btn.getAttribute('data-analyze')).toBe('glossary:stage_zones');
    expect(btn.disabled).toBe(true); // no picture yet
    draft.url = '/sole.png';
    openSlotEditor(host, s.squad[0]!.id, 'sole_close', { ...ctx, draft });
    const img = host.querySelector<HTMLImageElement>('.alius-stage-slot-frame img')!;
    Object.defineProperty(img, 'naturalWidth', { value: 500 });
    Object.defineProperty(img, 'naturalHeight', { value: 1000 });
    const canvas = host.querySelector<HTMLCanvasElement>('canvas.alius-stage-zones')!;
    canvas.width = 1000; canvas.height = 625;
    host.querySelector<HTMLButtonElement>('[data-action=zones]')!.click();
    for (let i = 0; i < 5; i++) click(canvas, 0.5, 0.1 + i * 0.15);
    expect(drawn.some((d) => d.startsWith('ellipse('))).toBe(true);
    click(canvas, 0.9, 0.9);
    expect(drawn).toEqual([]); // never shown once marked
    expect(Object.keys(draft.sidecar.zones ?? {})).toEqual(['toes', 'ball', 'arch', 'heel', 'edge']);
    expect(draft.sidecar.fit).toEqual({ height: 0.6, y: 0.5 });
    expect(sidecarSchema.parse(JSON.parse(JSON.stringify(draft.sidecar)))).toEqual(draft.sidecar);
    expect(host.querySelector('[data-action=save]')!.hasAttribute('disabled')).toBe(false);
  });
});
