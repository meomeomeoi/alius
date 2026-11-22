// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { h } from '../../../src/ui/dom';
import { resetSceneStage } from '../../../src/ui/scene/stage';
import { attachLook } from '../../../src/ui/scene/stage/look';

afterEach(() => {
  document.body.innerHTML = '';
  resetSceneStage();
  vi.useRealTimers();
});

const rect = (width: number) => () => ({ left: 0, top: 0, width, height: 1080, right: width, bottom: 1080, x: 0, y: 0, toJSON() {} });
function setup(opts: { sceneId?: string; reduced?: boolean; onUse?: () => void } = {}) {
  const root = h('div', { class: 'alius-scene' });
  const frame = h('div', { class: 'alius-layer-frame' });
  const dock = h('button', { type: 'button' });
  root.append(frame, dock);
  document.body.append(root);
  Object.defineProperty(frame, 'getBoundingClientRect', { value: rect(1920) });
  const state = { reduced: opts.reduced ?? false };
  const detach = attachLook(frame, root, { sceneId: () => opts.sceneId ?? 'sc1', reduced: () => state.reduced, ...(opts.onUse ? { onUse: opts.onUse } : {}) });
  // (a move during a drag carries the held button, as a real pointer does)
  const ptr = (type: string, x: number, button = 2, el: HTMLElement = frame, buttons = button === 2 && type === 'pointermove' ? 2 : 0) => el.dispatchEvent(new MouseEvent(type, { clientX: x, button, buttons, bubbles: true, cancelable: true }));
  const pan = () => root.style.getPropertyValue('--alius-pan');
  return { root, frame, dock, detach, ptr, pan, state };
}

describe('looking around (P10e)', () => {
  it('the right button drags: pointerdown at 1000, move to 808, up gives 0.5 + 192/1920 = 0.6; a left button changes nothing', () => {
    const t = setup();
    expect(t.pan()).toBe('0.5');
    t.ptr('pointerdown', 1000, 0);
    t.ptr('pointermove', 808, 0);
    t.ptr('pointerup', 808, 0);
    expect(t.pan()).toBe('0.5');
    t.ptr('pointerdown', 1000);
    t.ptr('pointermove', 808);
    t.ptr('pointerup', 808);
    expect(Number(t.pan())).toBeCloseTo(0.6, 6);
  });

  it('a release keeps the view; the next drag starts from it', () => {
    const t = setup();
    t.ptr('pointerdown', 1000);
    t.ptr('pointermove', 808);
    t.ptr('pointerup', 808);
    t.ptr('pointermove', 100, 0); // no button: nothing
    expect(Number(t.pan())).toBeCloseTo(0.6, 6);
    t.ptr('pointerdown', 900);
    t.ptr('pointermove', 804); // 96 px more
    t.ptr('pointerup', 804);
    expect(Number(t.pan())).toBeCloseTo(0.65, 6);
  });

  it('a cancelled pointer, a lost capture or a move with no button held ends the drag (review M2)', () => {
    for (const end of [(t: ReturnType<typeof setup>) => t.ptr('pointercancel', 700, -1), (t: ReturnType<typeof setup>) => t.ptr('lostpointercapture', 700, -1)]) {
      const t = setup();
      t.ptr('pointerdown', 1000);
      t.ptr('pointermove', 808);
      end(t);
      expect(t.root.classList.contains('alius-looking')).toBe(false);
      const kept = t.pan();
      t.ptr('pointermove', 100, 0); // a bare hover afterwards
      expect(t.pan()).toBe(kept);
    }
    const t = setup(); // the button was released outside the window: no pointerup arrives, the next move has no button
    t.ptr('pointerdown', 1000);
    t.ptr('pointermove', 808);
    const kept = t.pan();
    t.ptr('pointermove', 100, 0);
    expect(t.pan()).toBe(kept);
    expect(t.root.classList.contains('alius-looking')).toBe(false);
  });

  it('the context menu is suppressed on the frame only', () => {
    const t = setup();
    const onFrame = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    t.frame.dispatchEvent(onFrame);
    expect(onFrame.defaultPrevented).toBe(true);
    const onDock = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    t.dock.dispatchEvent(onDock);
    expect(onDock.defaultPrevented).toBe(false);
  });

  it('a double right-click recentres', () => {
    const t = setup();
    t.ptr('pointerdown', 1000);
    t.ptr('pointermove', 400);
    t.ptr('pointerup', 400);
    expect(t.pan()).not.toBe('0.5');
    t.ptr('pointerdown', 400);
    t.ptr('pointerup', 400);
    t.ptr('pointerdown', 400);
    expect(t.pan()).toBe('0.5');
  });

  it('two right-clicks far apart in time do not recentre', () => {
    vi.useFakeTimers();
    const t = setup();
    t.ptr('pointerdown', 1000);
    t.ptr('pointermove', 808);
    t.ptr('pointerup', 808);
    vi.advanceTimersByTime(1000);
    t.ptr('pointerdown', 808);
    expect(Number(t.pan())).toBeCloseTo(0.6, 6);
  });

  it('the position is clamped to 0..1', () => {
    const t = setup();
    t.ptr('pointerdown', 1900);
    t.ptr('pointermove', -5000);
    expect(t.pan()).toBe('1');
    t.ptr('pointermove', 9000);
    expect(t.pan()).toBe('0');
    t.ptr('pointerup', 9000);
  });

  it('is remembered per scene: the same id starts there, another id or a reset starts centred', () => {
    const a = setup({ sceneId: 'sc1' });
    a.ptr('pointerdown', 1000);
    a.ptr('pointermove', 808);
    a.ptr('pointerup', 808);
    a.detach();
    const again = setup({ sceneId: 'sc1' });
    expect(Number(again.pan())).toBeCloseTo(0.6, 6);
    expect(setup({ sceneId: 'sc2' }).pan()).toBe('0.5');
    resetSceneStage();
    expect(setup({ sceneId: 'sc1' }).pan()).toBe('0.5');
  });

  it('under reduced motion dragging still works and the root loses its easing', () => {
    const t = setup({ reduced: true });
    expect(t.root.classList.contains('alius-look-still')).toBe(true);
    t.ptr('pointerdown', 1000);
    t.ptr('pointermove', 808);
    t.ptr('pointerup', 808);
    expect(Number(t.pan())).toBeCloseTo(0.6, 6);
    t.state.reduced = false; // switched off mid-scene: read again on the next use
    t.ptr('pointerdown', 808);
    t.ptr('pointerup', 808);
    expect(t.root.classList.contains('alius-look-still')).toBe(false);
  });

  it('the pointer moving with no button changes nothing (the P10c follow is gone)', () => {
    const t = setup();
    t.ptr('pointermove', 1800, 0);
    t.ptr('pointermove', 100, 0);
    expect(t.pan()).toBe('0.5');
  });

  it('onUse fires when the view is moved (the hint goes away)', () => {
    const onUse = vi.fn();
    const t = setup({ onUse });
    t.ptr('pointerdown', 1000);
    expect(onUse).not.toHaveBeenCalled();
    t.ptr('pointermove', 990);
    expect(onUse).toHaveBeenCalled();
  });

  it('detach removes the listeners', () => {
    const t = setup();
    t.detach();
    t.ptr('pointerdown', 1000);
    t.ptr('pointermove', 100);
    expect(Number(t.pan())).toBeCloseTo(0.5, 6);
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    t.frame.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });
});
