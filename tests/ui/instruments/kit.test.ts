// @vitest-environment jsdom
/** P10e-e Task 5: the shared kit of the instruments, copied from the prototypes. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chaikin } from '../../../src/ui/scene/instruments/kit/chaikin';
import { SEAT_BODY, SHAPES, squashOf } from '../../../src/ui/scene/instruments/kit/dark';
import { say, unsay } from '../../../src/ui/scene/instruments/kit/hand';
import { heartTick, heartStop } from '../../../src/ui/scene/instruments/kit/heart';
import { lowres } from '../../../src/ui/scene/instruments/kit/lowres';
import { stepSpring } from '../../../src/ui/scene/instruments/kit/spring';
import type { HerLook } from '../../../src/ui/scene/instruments/types';
import { h } from '../../../src/ui/dom';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

/** An AudioContext stand-in: counts started oscillators and what is connected to what. */
function fakeAudio() {
  const param = () => ({ value: 0, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} });
  const out = { started: 0, connected: [] as unknown[], body: { id: 'body' }, ctx: null as never as { currentTime: number } & Record<string, unknown> };
  out.ctx = {
    currentTime: 0,
    createOscillator: () => ({ type: '', frequency: param(), connect: (n: unknown) => { out.connected.push(n); }, start: () => { out.started += 1; }, stop: () => {} }),
    createGain: () => ({ gain: param(), connect: (n: unknown) => { out.connected.push(n); } }),
  };
  return out;
}

const her: HerLook = { unitId: 'unit_ann', name: 'Ann', accent: '#c8a2ff', hand: 'Caveat', handScale: 1.25, style: 'neutral' };

describe('the kit', () => {
  it('stepSpring with a 100 ms step stays bounded (k 260, d 16: the weight fix of 2026-11-23)', () => {
    const s = { x: 0, v: 0 };
    let peak = 0;
    for (let i = 0; i < 60; i++) {
      stepSpring(s, 1, 260, 16, 100);
      peak = Math.max(peak, Math.abs(s.x));
    }
    expect(peak).toBeLessThan(2);
    expect(s.x).toBeCloseTo(1, 3);
    // one Euler step of 100 ms would diverge: the pieces are at most 8 ms
    const naive = { x: 0, v: 0 };
    for (let i = 0; i < 60; i++) { naive.v += (260 * (1 - naive.x) - 16 * naive.v) * 0.1; naive.x += naive.v * 0.1; }
    expect(Math.abs(naive.x)).toBeGreaterThan(1e6);
  });

  it('chaikin ×1 of a square has 8 points (each corner cut at ¼ and ¾)', () => {
    const out = chaikin([[0, 0], [1, 0], [1, 1], [0, 1]]);
    expect(out).toHaveLength(8);
    expect(out[0]).toEqual([0.25, 0]);
    expect(out[1]).toEqual([0.75, 0]);
    expect(chaikin(chaikin(chaikin([[0, 0], [1, 0], [1, 1], [0, 1]])))).toHaveLength(32);
  });

  it('the dark: the approved shapes only (no rejected seat variant), the seat outline and the squash', () => {
    expect(Object.keys(SHAPES).sort()).toEqual(['gap', 'lift', 'seat', 'slide', 'slit', 'squeeze', 'wedge']);
    expect(SEAT_BODY).toHaveLength(14);
    expect(squashOf({ L: 1, v: 0 })).toBe(0);
    expect(squashOf({ L: 0, v: 0 })).toBeCloseTo(0.85);
    expect(squashOf({ L: 0, v: -10 })).toBe(1.2);
  });

  it('say writes in her hand at the size × handScale, as text, and is gone after its life', () => {
    const host = h('div');
    document.body.append(host);
    const group = say(host, '<b>not yet.</b>', { her, size: 40, ms: 3000 });
    const lines = [...group.querySelectorAll<HTMLElement>('.alius-her-line')];
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent).toBe('<b>not yet.</b>');
    expect(group.querySelector('b')).toBeNull();
    expect(lines[0].style.fontSize).toBe('50px');
    expect(lines[0].style.getPropertyValue('--alius-font-hand')).toContain('Caveat');
    expect(lines[0].style.getPropertyValue('--write')).toBe(`${Math.max(160, '<b>not yet.</b>'.length * 36)}ms`);
    vi.advanceTimersByTime(3000);
    expect(lines[0].classList.contains('gone')).toBe(true);
    vi.advanceTimersByTime(700);
    expect(host.querySelector('.alius-her-line')).toBeNull();
  });

  it('say keeps the prototype\'s default: a line to herself (`.self`, 34 px × handScale); to the commander `.to-you` 46; big 56', () => {
    const host = h('div');
    document.body.append(host);
    const self = say(host, 'mm.', { her }).querySelector<HTMLElement>('.alius-her-line')!;
    expect(self.classList.contains('self')).toBe(true);
    expect(self.style.fontSize).toBe(`${34 * 1.25}px`);
    const you = say(host, 'look at me.', { her, to: 'commander' }).querySelector<HTMLElement>('.alius-her-line')!;
    expect(you.classList.contains('to-you')).toBe(true);
    expect(you.style.fontSize).toBe(`${46 * 1.25}px`);
    const big = say(host, 'now.', { her, to: 'written', big: true }).querySelector<HTMLElement>('.alius-her-line')!;
    expect(big.className).toBe('alius-her-line big');
    expect(big.style.fontSize).toBe('70px');
    unsay(host);
  });

  it('say cuts a long line at the words (about 40 characters a line) and unsay clears every line and timer', () => {
    const host = h('div');
    document.body.append(host);
    const group = say(host, 'Bring me the patrol roster before evening mess, and do not be late again.', { her });
    const lines = [...group.querySelectorAll<HTMLElement>('.alius-her-line')];
    expect(lines.length).toBe(2);
    for (const l of lines) expect(l.textContent!.length).toBeLessThanOrEqual(40);
    unsay(host);
    expect(host.querySelector('.alius-her-line')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('lowres makes a canvas at 1/DS of its host (DS 4)', () => {
    const host = h('div');
    Object.defineProperty(host, 'clientWidth', { value: 1920 });
    Object.defineProperty(host, 'clientHeight', { value: 1080 });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); // the page has no canvas: a stand-in context
    const { canvas, ctx } = lowres(host);
    expect(canvas.width).toBe(480);
    expect(canvas.height).toBe(270);
    expect(canvas.parentElement).toBe(host);
    expect(() => ctx.fillRect(0, 0, 1, 1)).not.toThrow();
  });

  it('heartTick without an audio context does nothing; heartStop is safe', () => {
    const samples = { ctx: () => null, bus: () => null } as never;
    expect(() => heartTick(samples, 64)).not.toThrow();
    heartStop(samples);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('heartTick schedules lub-dub on the body bus; heartStop clears its timers; a restart after a long gap schedules at most one beat', () => {
    const fake = fakeAudio();
    const samples = { ctx: () => fake.ctx, bus: (b: string) => (b === 'body' ? fake.body : null) } as never;
    heartTick(samples, 60); // the first beat is 0.3 s ahead: nothing due yet
    expect(fake.started).toBe(0);
    fake.ctx.currentTime = 2.5; // beats at 0.3, 1.3, 2.3 are due (and 2.62 is not)
    heartTick(samples, 60);
    expect(fake.started).toBe(6); // three lubs and three dubs
    expect(fake.connected.filter((n) => n === fake.body)).toHaveLength(6);
    expect(vi.getTimerCount()).toBe(3);
    heartStop(samples);
    expect(vi.getTimerCount()).toBe(0);
    fake.ctx.currentTime = 600; // ten minutes later
    heartTick(samples, 60);
    heartTick(samples, 60);
    expect(fake.started).toBeLessThanOrEqual(6 + 2);
  });
});
