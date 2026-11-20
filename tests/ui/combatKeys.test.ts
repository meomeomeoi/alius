// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachCombatKeys, type CombatKeyHandlers } from '../../src/ui/combat/keys';

const handlers = (): CombatKeyHandlers => ({
  skill: vi.fn(), cycleTarget: vi.fn(), confirm: vi.fn(), guard: vi.fn(), swap: vi.fn(), pass: vi.fn(), order: vi.fn(), auto: vi.fn(), cancel: vi.fn(), compel: vi.fn(),
});
const press = (k: string, target: EventTarget = document.body) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
};
let detach: (() => void) | null = null;
afterEach(() => { detach?.(); detach = null; document.body.innerHTML = ''; });

describe('combat keys behind a modal (0.1 audit)', () => {
  it('act on the fight while nothing is over it', () => {
    document.body.innerHTML = '<div id="alius-shell"></div>';
    const h = handlers();
    detach = attachCombatKeys(h);
    press('1');
    expect(h.skill).toHaveBeenCalledWith(0);
  });

  it('do nothing while a modal (a warden override, the Leash form) is open, and Enter is left to its button', () => {
    document.body.innerHTML = '<div id="alius-shell"><div class="alius-modal-backdrop"><div role="dialog"><button id="b">COMPLY</button></div></div></div>';
    const h = handlers();
    detach = attachCombatKeys(h);
    for (const k of ['1', 'Enter', 'g', 'a', 'p', 'q', 'Escape', 'ArrowLeft']) {
      const e = press(k, document.getElementById('b')!);
      expect(e.defaultPrevented, k).toBe(false);
    }
    expect(h.skill).not.toHaveBeenCalled();
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.auto).not.toHaveBeenCalled();
    expect(h.cancel).not.toHaveBeenCalled();
  });
});
