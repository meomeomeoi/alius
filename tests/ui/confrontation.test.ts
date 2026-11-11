// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { h } from '../../src/ui/dom';
import { renderConfrontation, type ConfrontationCtx } from '../../src/ui/loyalty/confrontation';

afterEach(() => {
  document.body.innerHTML = '';
});

function mount(over: Partial<ConfrontationCtx> = {}) {
  const host = h('div');
  document.body.append(host);
  const fns = { onTalk: vi.fn(), onLetGo: vi.fn(), onSuppress: vi.fn(), onFight: vi.fn(), onYield: vi.fn(), onTakeBack: vi.fn(), onTurnAway: vi.fn() };
  renderConfrontation(host, {
    kind: 'desertion', unitName: 'Ann', framing: 'Ann is about to walk out.', talkTried: false, ranks: { authority: 3, empathy: 2 },
    leashLeft: 2, canFight: true, canTakeBack: null, ...fns, ...over,
  });
  const labels = () => [...host.querySelectorAll('button')].map((b) => b.textContent);
  const btn = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement;
  return { host, fns, labels, btn };
}

describe('confrontation panel', () => {
  it('desertion offers the two talk-downs once, then only let go and suppress', () => {
    const first = mount();
    expect(first.labels()).toEqual(['[TALK HER DOWN — AUTHORITY 3]', '[TALK HER DOWN — EMPATHY 2]', '[LET HER GO]', '[SUPPRESS]']);
    expect(first.host.textContent).toContain('Ann is about to walk out.');
    first.btn('[TALK HER DOWN — EMPATHY 2]').click();
    expect(first.fns.onTalk).toHaveBeenCalledWith('empathy');
    document.body.innerHTML = '';
    const tried = mount({ talkTried: true });
    expect(tried.labels()).toEqual(['[LET HER GO]', '[SUPPRESS]']);
    tried.btn('[LET HER GO]').click();
    expect(tried.fns.onLetGo).toHaveBeenCalledTimes(1);
  });

  it('suppress is disabled at 0 authorizations', () => {
    const { btn, fns, host } = mount({ leashLeft: 0 });
    expect(btn('[SUPPRESS]').disabled).toBe(true);
    expect(host.textContent).toMatch(/NO AUTHORIZATIONS/);
    btn('[SUPPRESS]').click();
    expect(fns.onSuppress).not.toHaveBeenCalled();
    expect(btn('[LET HER GO]').disabled).toBe(false);
    const ok = mount({ leashLeft: 1 });
    ok.btn('[SUPPRESS]').click();
    expect(ok.fns.onSuppress).toHaveBeenCalledTimes(1);
  });

  it('mutiny offers fight, or yield when no loyal unit can fight; suppress either way', () => {
    const fight = mount({ kind: 'mutiny', framing: 'Ann is not alone.' });
    expect(fight.labels()).toEqual(['[FIGHT]', '[SUPPRESS]']);
    fight.btn('[FIGHT]').click();
    expect(fight.fns.onFight).toHaveBeenCalledTimes(1);
    document.body.innerHTML = '';
    const yielding = mount({ kind: 'mutiny', canFight: false });
    expect(yielding.labels()).toEqual(['[YIELD]', '[SUPPRESS]']);
    yielding.btn('[YIELD]').click();
    expect(yielding.fns.onYield).toHaveBeenCalledTimes(1);
    expect(yielding.fns.onFight).not.toHaveBeenCalled();
  });

  it('return greys take-back without a free bed', () => {
    const free = mount({ kind: 'return', framing: 'Ann is at the gate.' });
    expect(free.labels()).toEqual(['[TAKE HER BACK]', '[TURN HER AWAY]']);
    free.btn('[TAKE HER BACK]').click();
    expect(free.fns.onTakeBack).toHaveBeenCalledTimes(1);
    document.body.innerHTML = '';
    const full = mount({ kind: 'return', canTakeBack: 'The barracks are full (6 beds).' });
    expect(full.btn('[TAKE HER BACK]').disabled).toBe(true);
    expect(full.host.textContent).toContain('The barracks are full (6 beds).');
    full.btn('[TURN HER AWAY]').click();
    expect(full.fns.onTurnAway).toHaveBeenCalledTimes(1);
  });

  it('one answer disables every button', () => {
    const { btn, host, fns } = mount();
    btn('[LET HER GO]').click();
    expect([...host.querySelectorAll('button')].every((b) => b.disabled)).toBe(true);
    btn('[SUPPRESS]').click();
    btn('[TALK HER DOWN — AUTHORITY 3]').click();
    expect(fns.onSuppress).not.toHaveBeenCalled();
    expect(fns.onTalk).not.toHaveBeenCalled();
  });

  it('the name and framing are text, there is no input, and the panel names what is happening', () => {
    const { host } = mount({ unitName: '<b>x</b>', framing: '<img src=x onerror=alert(1)>' });
    expect(host.querySelector('b, img')).toBeNull();
    expect(host.querySelector('input, textarea, select')).toBeNull();
    expect(host.textContent).toContain('DESERTION');
    expect(host.textContent).toContain('<b>x</b>');
  });
});
