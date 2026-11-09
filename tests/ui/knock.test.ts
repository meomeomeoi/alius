// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { h } from '../../src/ui/dom';
import { renderKnock } from '../../src/ui/night/knock';

afterEach(() => {
  document.body.innerHTML = '';
});

const entry = { id: 'n1', unitId: 'unit_ann', kind: 'visit', priority: 30, framing: 'Ann knocks on your door, late.', ignore: { event: 'dismissed', severity: 'minor' as const }, expiresDay: 9 };

describe('night knock', () => {
  it('open and ignore buttons', () => {
    const host = h('div');
    document.body.append(host);
    const onOpen = vi.fn();
    const onIgnore = vi.fn();
    renderKnock(host, { entry, unitName: 'Ann', onOpen, onIgnore });
    expect(host.textContent).toContain('Ann knocks on your door, late.');
    expect([...host.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['[OPEN]', '[IGNORE]']);
    host.querySelectorAll('button')[0].click();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onIgnore).not.toHaveBeenCalled();
    renderKnock(host, { entry, unitName: 'Ann', onOpen, onIgnore });
    host.querySelectorAll('button')[1].click();
    expect(onIgnore).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('the framing is text, and the buttons cannot be pressed twice', () => {
    const host = h('div');
    document.body.append(host);
    const onOpen = vi.fn();
    renderKnock(host, { entry: { ...entry, framing: '<img src=x onerror=alert(1)>' }, unitName: 'Ann', onOpen, onIgnore: vi.fn() });
    expect(host.querySelector('img')).toBeNull();
    const open = host.querySelector('button')!;
    open.click();
    open.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect([...host.querySelectorAll('button')].every((b) => b.disabled)).toBe(true);
  });
});
