// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NightEntry } from '../../src/engine/state/types';
import { h } from '../../src/ui/dom';
import { renderDoor, type DoorCtx } from '../../src/ui/night/door';
import { markedWithout, unreachable } from '../helpers/analyzeCoverage';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

let seq = 0;
const newEntry = (over: Partial<NightEntry> = {}): NightEntry => ({
  id: `n${++seq}`, unitId: 'unit_ann', kind: 'visit', priority: 50, framing: 'Ann knocks on your door, late.', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 9, ...over,
});

function mount(o: Partial<DoorCtx> = {}, entry = newEntry()) {
  const host = h('div');
  document.body.append(host);
  const ctx: DoorCtx = {
    entry, unitName: 'Ann', seconds: 15, motion: true, readable: false, silhouette: () => h('img', { class: 'sprite', alt: '' }),
    sound: { play: vi.fn() }, onOpen: vi.fn(), onSay: vi.fn(async () => undefined), onSilent: vi.fn(), ...o,
  };
  renderDoor(host, ctx);
  const q = (sel: string) => host.querySelector<HTMLElement>(sel);
  return { host, ctx, entry, q, again: () => renderDoor(host, ctx), btn: (a: string) => host.querySelector<HTMLButtonElement>(`button[data-action="${a}"]`) };
}
const tick = (s: number) => vi.advanceTimersByTime(s * 1000);

describe('the door: options', () => {
  it('three options, each an .alius-option with data-analyze glossary:night_door', () => {
    const { host } = mount();
    const options = [...host.querySelectorAll<HTMLElement>('.alius-option')];
    expect(options.map((b) => b.textContent)).toEqual(['[OPEN]', '[SAY SOMETHING THROUGH THE DOOR]', '[STAY SILENT]']);
    for (const o of options) expect(o.getAttribute('data-analyze')).toBe('glossary:night_door');
    expect(markedWithout(host)).toEqual([]);
    expect(unreachable(host)).toEqual([]);
  });

  it('OPEN and STAY SILENT call their handlers once and then lock the door', () => {
    const { btn, ctx } = mount();
    btn('open')!.click();
    btn('open')!.click();
    btn('ignore')!.click();
    expect(ctx.onOpen).toHaveBeenCalledTimes(1);
    expect(ctx.onSilent).not.toHaveBeenCalled();
  });

  it('the framing is text, never markup', () => {
    const { host } = mount({}, newEntry({ framing: '<img src=x onerror=alert(1)>' }));
    expect(host.querySelector('img[src="x"]')).toBeNull();
    expect(host.textContent).toContain('<img src=x');
  });

  it('keeps the old hooks: .alius-knock and data-action open / ignore', () => {
    const { q, btn } = mount();
    expect(q('.alius-door.alius-knock')).not.toBeNull();
    expect(btn('open')).not.toBeNull();
    expect(btn('ignore')).not.toBeNull();
  });
});

describe('the door: the timer', () => {
  it('reaching 0 calls onSilent once', () => {
    const { ctx, q } = mount({ seconds: 15 });
    expect(q('.alius-door-timer')).not.toBeNull();
    tick(14);
    expect(ctx.onSilent).not.toHaveBeenCalled();
    tick(2);
    expect(ctx.onSilent).toHaveBeenCalledTimes(1);
    tick(60);
    expect(ctx.onSilent).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('doorTimer 0 shows no timer and never calls onSilent', () => {
    const { ctx, q } = mount({ seconds: 0 });
    expect(q('.alius-door-timer')).toBeNull();
    tick(600);
    expect(ctx.onSilent).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('pressing a button stops the countdown', () => {
    const { ctx, btn } = mount();
    btn('open')!.click();
    tick(60);
    expect(ctx.onSilent).not.toHaveBeenCalled();
  });

  it('pauses while the input has the focus or holds text', () => {
    const { ctx, btn, q } = mount();
    btn('say')!.click();
    const input = q('input.alius-door-input') as HTMLInputElement;
    expect(input).not.toBeNull();
    input.focus();
    tick(40);
    expect(ctx.onSilent).not.toHaveBeenCalled(); // focused
    input.blur();
    input.value = 'Who is it?';
    input.dispatchEvent(new Event('input'));
    tick(40);
    expect(ctx.onSilent).not.toHaveBeenCalled(); // holds text
    input.value = '';
    input.dispatchEvent(new Event('input'));
    tick(16);
    expect(ctx.onSilent).toHaveBeenCalledTimes(1);
  });

  it('pauses while the reply is pending, and while the page is hidden, a modal is open or the analysis panel is up', async () => {
    let finish!: () => void;
    const onSay = vi.fn(() => new Promise<void>((r) => { finish = r; }));
    const { ctx, btn, q } = mount({ onSay });
    btn('say')!.click();
    const input = q('input.alius-door-input') as HTMLInputElement;
    input.value = 'Hello';
    input.dispatchEvent(new Event('input'));
    q('button[data-action="send-door"]')!.click();
    expect(onSay).toHaveBeenCalledWith('Hello');
    tick(60);
    expect(ctx.onSilent).not.toHaveBeenCalled(); // pending
    finish();
    await vi.advanceTimersByTimeAsync(0);
    // a modal
    const modal = h('div', { class: 'alius-modal-backdrop' });
    document.body.append(modal);
    tick(60);
    expect(ctx.onSilent).not.toHaveBeenCalled();
    modal.remove();
    // the analysis panel
    const panel = h('div', { class: 'alius-analyze' });
    document.body.append(panel);
    tick(60);
    expect(ctx.onSilent).not.toHaveBeenCalled();
    panel.remove();
    // a hidden page
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    tick(60);
    expect(ctx.onSilent).not.toHaveBeenCalled();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    tick(16);
    expect(ctx.onSilent).toHaveBeenCalledTimes(1);
  });

  it('a redraw keeps the deadline (same entry id); another entry starts fresh', () => {
    const { ctx, again, host } = mount();
    tick(10);
    again();
    tick(4);
    expect(ctx.onSilent).not.toHaveBeenCalled();
    tick(2);
    expect(ctx.onSilent).toHaveBeenCalledTimes(1);
    const other = mount({ seconds: 15 }, newEntry());
    tick(14);
    expect(other.ctx.onSilent).not.toHaveBeenCalled();
    expect(host).toBeTruthy();
  });

  it('a redraw leaves one interval, not one per render', () => {
    const { again } = mount();
    again();
    again();
    expect(vi.getTimerCount()).toBe(1);
  });

  it('stops when its host leaves the page', () => {
    const { ctx, host } = mount();
    host.remove();
    tick(60);
    expect(ctx.onSilent).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('announces the seconds left at 10, 5 and 0 through aria-live', () => {
    const { q } = mount();
    const live = q('.alius-door-timer [aria-live]')!;
    expect(live.getAttribute('aria-live')).toBe('polite');
    tick(5);
    expect(live.textContent).toContain('10');
    tick(5);
    expect(live.textContent).toContain('5');
    tick(5);
    expect(live.textContent).toContain('0');
  });
});

describe('the door: one exchange', () => {
  it('after the exchange only OPEN and STAY SILENT remain, both lines show, and the timer restarts at full length', () => {
    const entry = newEntry();
    const { ctx, again, host } = mount({}, entry);
    tick(12);
    entry.door = { said: 'Who is it?', reply: 'Open the door.' };
    again();
    expect([...host.querySelectorAll('.alius-option')].map((b) => b.textContent)).toEqual(['[OPEN]', '[STAY SILENT]']);
    expect(host.textContent).toContain('Who is it?');
    expect(host.textContent).toContain('Open the door.');
    expect(host.querySelector('input')).toBeNull();
    tick(14);
    expect(ctx.onSilent).not.toHaveBeenCalled(); // 15 s again, not 3
    tick(2);
    expect(ctx.onSilent).toHaveBeenCalledTimes(1);
  });

  it('a said door survives a reload: both lines render at once, with a fresh timer', () => {
    const { host, ctx } = mount({}, newEntry({ door: { said: 'Hello?', reply: 'Not now.' } }));
    expect(host.textContent).toContain('Hello?');
    expect(host.textContent).toContain('Not now.');
    expect(host.querySelectorAll('.alius-option')).toHaveLength(2);
    tick(14);
    expect(ctx.onSilent).not.toHaveBeenCalled();
  });

  it('a failed generation: said with no reply shows "No answer through the door."', () => {
    const { host } = mount({}, newEntry({ door: { said: 'Hello?' } }));
    expect(host.textContent).toContain('Hello?');
    expect(host.textContent).toContain('No answer through the door.');
    expect(host.querySelectorAll('.alius-option')).toHaveLength(2);
  });

  it('shows she is answering while the reply is pending, and the buttons wait', async () => {
    let finish!: () => void;
    const { btn, q, host } = mount({ onSay: () => new Promise<void>((r) => { finish = r; }) });
    btn('say')!.click();
    const input = q('input.alius-door-input') as HTMLInputElement;
    input.value = 'Hi';
    input.dispatchEvent(new Event('input'));
    q('button[data-action="send-door"]')!.click();
    expect(host.textContent).toMatch(/answering/i);
    expect((q('input.alius-door-input') as HTMLInputElement).disabled).toBe(true);
    finish();
    await vi.advanceTimersByTimeAsync(0);
  });

  it('the line is trimmed, 1 to 300 characters; Enter sends it; the input takes the focus without scrolling', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const { btn, q, ctx } = mount();
    btn('say')!.click();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    const input = q('input.alius-door-input') as HTMLInputElement;
    expect(input.maxLength).toBe(300);
    input.value = '   ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(ctx.onSay).not.toHaveBeenCalled();
    input.value = '  Open up.  ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(ctx.onSay).toHaveBeenCalledWith('Open up.');
    focus.mockRestore();
  });
});

describe('the door: the knock', () => {
  it('plays the knock sound once per entry per host, however often it is redrawn', () => {
    const { ctx, again } = mount();
    again();
    again();
    expect(ctx.sound!.play).toHaveBeenCalledTimes(1);
    expect(ctx.sound!.play).toHaveBeenCalledWith('knock');
    const second = mount({}, newEntry());
    expect(second.ctx.sound!.play).toHaveBeenCalledTimes(1);
  });

  it('a new host knocks again for the same entry', () => {
    const entry = newEntry();
    const a = mount({}, entry);
    const b = mount({}, entry);
    expect(a.ctx.sound!.play).toHaveBeenCalledTimes(1);
    expect(b.ctx.sound!.play).toHaveBeenCalledTimes(1);
  });

  it('shakes with motion, not under reduced motion', () => {
    expect(mount({ motion: true }).q('.alius-door-art')!.classList.contains('is-knocking')).toBe(true);
    expect(mount({ motion: false }).q('.alius-door-art')!.classList.contains('is-knocking')).toBe(false);
  });

  it('the timer bar animates only with motion', () => {
    expect(mount({ motion: true }).q('.alius-door-timer')!.classList.contains('is-animated')).toBe(true);
    expect(mount({ motion: false }).q('.alius-door-timer')!.classList.contains('is-animated')).toBe(false);
  });
});

describe('the door: the silhouette', () => {
  it('shows her sprite behind frosted glass', () => {
    const { q } = mount();
    expect(q('.alius-door-silhouette .sprite')).not.toBeNull();
    expect(q('.alius-door-art')!.classList.contains('is-solid')).toBe(false);
  });

  it('readable mode: a solid shape, no sprite, no blur', () => {
    const silhouette = vi.fn(() => h('img', { class: 'sprite' }));
    const { q } = mount({ readable: true, silhouette });
    expect(q('.sprite')).toBeNull();
    expect(silhouette).not.toHaveBeenCalled();
    expect(q('.alius-door-art')!.classList.contains('is-solid')).toBe(true);
    expect(q('.alius-door-shape')).not.toBeNull();
  });

  it('no silhouette (no cardRef): the ASCII door', () => {
    const { q } = mount({ silhouette: () => null });
    expect(q('.alius-door-silhouette')).toBeNull();
    expect(q('pre.alius-ascii')!.textContent).toContain('┌');
  });

  it('without a silhouette function at all: the ASCII door too', () => {
    const { q } = mount({ silhouette: undefined });
    expect(q('pre.alius-ascii')).not.toBeNull();
  });
});
